#!/usr/bin/env python3

# Copyright (c) Meta Platforms, Inc. and affiliates.

"""FIX1 addendum: MODEL face-tangent circle and OURS B apex fit.

Exact section topology defines each nose shoulder without a target-derived
window. Collinear triangle splits are removed only at coordinate precision.
MODEL uses a circle constrained tangent to the two adjoining face lines,
least-squares through the actual nose-facet vertices. OURS keeps the B apex
circle fit; its support depth is the smaller measured shoulder depth.
No original MODEL vertices are serialized.
"""
import math
import numpy as np


def simplify(points, precision):
    """Ramer-Douglas-Peucker at the existing coordinate precision, no scale fit."""
    if len(points) < 3:  # DERIVED: two endpoints define a straight segment.
        return points
    vector = points[-1] - points[0]
    length = np.linalg.norm(vector)
    if length <= precision:
        return points[[0, -1]]
    delta = points - points[0]
    distances = np.abs(vector[0] * delta[:, 1] - vector[1] * delta[:, 0]) / length
    split = int(np.argmax(distances))
    if distances[split] <= precision:
        return points[[0, -1]]
    return np.vstack((simplify(points[:split + 1], precision)[:-1],
                      simplify(points[split:], precision)))


def nose_support(segments, precision):
    """Return in-memory section geometry only; never serialize MODEL vertices."""
    if not len(segments) or not np.isfinite(segments).all():
        raise ValueError("missing or nonfinite section")
    vertices, edges = [], set()
    for segment in segments:
        edge = []
        for point in segment:
            match = next((i for i, other in enumerate(vertices)
                          if np.linalg.norm(point - other) <= precision), None)
            if match is None:
                match = len(vertices)
                vertices.append(point)
            edge.append(match)
        if edge[0] != edge[1]:
            edges.add(tuple(sorted(edge)))
    adjacency = {i: set() for i in range(len(vertices))}
    for first, second in edges:
        adjacency[first].add(second)
        adjacency[second].add(first)
    if not adjacency or any(len(neighbours) != 2 for neighbours in adjacency.values()):
        raise ValueError("section is not one closed degree-two contour")
    points = np.asarray(vertices)
    apex_index = int(np.argmin(points[:, 0]))
    apex = points[apex_index]
    # DERIVED: only a literal minimum-depth plateau is ambiguous. A shallow
    # curved facet near the minimum is support, not a second apex/window.
    near = points[points[:, 0] == apex[0]]
    if np.ptp(near[:, 1]) > precision:
        raise ValueError("apex is not uniquely resolved at coordinate precision")
    branches = {}
    for first in sorted(adjacency[apex_index]):
        indices, previous, current = [apex_index], apex_index, first
        while current != apex_index:
            if current in indices:
                raise ValueError("section contour repeats before closing")
            indices.append(current)
            following = next(i for i in adjacency[current] if i != previous)
            previous, current = current, following
        if len(indices) != len(points):
            raise ValueError("section has disconnected contours")
        branch = points[indices]
        away = branch[np.abs(branch[:, 1] - apex[1]) > precision]
        if not len(away):
            raise ValueError("no vertical nose support")
        upper = away[0, 1] > apex[1]
        stop = int(np.argmax(branch[:, 1]) if upper else np.argmin(branch[:, 1]))
        branch = simplify(branch[:stop + 1], precision)
        lengths = np.linalg.norm(np.diff(branch, axis=0), axis=1)
        if len(lengths) < 2 or np.any(lengths <= precision):
            raise ValueError("no resolved nose facet and adjoining face")
        ratios = lengths[1:] / lengths[:-1]
        # DERIVED: the largest length increase separates the short nose facets
        # from the adjoining face; no radius, distance window or fitted cutoff.
        shoulder = int(np.argmax(ratios)) + 1
        if ratios[shoulder - 1] <= 1:
            raise ValueError("no facet-length transition defines a nose shoulder")
        tied = np.flatnonzero(ratios == ratios[shoulder - 1])
        if len(tied) != 1:
            raise ValueError("ambiguous nose shoulder")
        support = branch[:shoulder + 1]
        if np.any(np.diff(support[:, 0]) < -precision):
            raise ValueError("nose support is not depth-monotone")
        branches["upper" if upper else "lower"] = dict(
            points=support, shoulder_jump=float(ratios[shoulder - 1]),
            adjoining_face=branch[shoulder:shoulder + 2])
    if set(branches) != {"upper", "lower"}:
        raise ValueError("both nose branches are required")
    return apex, branches


def unresolved(reason, support=0):
    return dict(circle_radius_mm=None, circle_fit_rms_mm=None,
                circle_fit_status="UNRESOLVED", circle_support_points=support,
                unresolved_reason=reason)


def apex_circle(points, precision):
    """The B centered least-squares fit; 2-4 collinear points cannot resolve."""
    if len(points) < 3 or not np.isfinite(points).all():
        return unresolved("fewer than three finite circle points", len(points))
    centered = points - points.mean(axis=0)
    singular = np.linalg.svd(centered, compute_uv=False)
    if singular[-1] <= precision:
        return unresolved("collinear apex support at coordinate precision", len(points))
    # DERIVED: expanded circle equation; identical to the accepted B fit.
    d, z = centered[:, 0], centered[:, 1]
    matrix = np.c_[2 * d, 2 * z, np.ones_like(d)]
    center, _, rank, _ = np.linalg.lstsq(matrix, d * d + z * z, rcond=None)
    radius_sq = center[2] + center[0] ** 2 + center[1] ** 2
    if rank != 3 or not math.isfinite(radius_sq) or radius_sq <= 0:
        return unresolved("singular or nonpositive circle fit", len(points))
    radius = math.sqrt(radius_sq)
    return dict(circle_radius_mm=radius, circle_fit_status="RESOLVED",
                circle_support_points=len(points), circle_support_minor_mm=float(singular[-1]),
                circle_center_depth_mm=float(center[0] + points[:, 0].mean()),
                circle_center_height_mm=float(center[1] + points[:, 1].mean()),
                circle_fit_rms_mm=float(np.std(np.hypot(d - center[0], z - center[1]))))


def tangent_circle(apex, branches, precision):
    """A circle tangent to both adjoining faces, fitted through facet vertices.

    For inward unit normals N, N*C = k + r gives C=C0+r*v. Each
    vertex residual is a*r*r+b_i*r+c_i. The squared-residual derivative
    is cubic; evaluate every positive real root and take its global minimum.
    """
    normals, offsets, vertices = [], [], [np.zeros(2)]
    for side in ("upper", "lower"):
        branch = branches[side]
        face = branch["adjoining_face"] - apex
        direction = face[1] - face[0]
        normal = np.array([direction[1], -direction[0]]) / np.linalg.norm(direction)
        if side == "lower":
            normal = -normal
        normals.append(normal)
        offsets.append(normal @ face[0])
        vertices.extend(branch["points"][1:] - apex)
    normals, offsets, vertices = np.asarray(normals), np.asarray(offsets), np.asarray(vertices)
    if np.linalg.matrix_rank(normals) != 2:
        return unresolved("adjacent faces do not define a tangent-circle bisector", len(vertices))
    origin = np.linalg.solve(normals, offsets)
    vector = np.linalg.solve(normals, np.ones(2))
    a = float(vector @ vector - 1)
    b = -2 * (vertices - origin) @ vector
    c = np.sum((vertices - origin) ** 2, axis=1)
    # DERIVED: exact coefficients of d/dr sum((a*r*r+b*r+c)^2).
    roots = np.roots([4 * len(vertices) * a * a, 6 * a * b.sum(),
                     2 * (b @ b + 2 * a * c.sum()), 2 * (b @ c)])
    candidates = [float(root.real) for root in roots
                  if abs(root.imag) <= precision and root.real > precision]
    if not candidates:
        return unresolved("no positive real face-tangent circle", len(vertices))
    radius = min(candidates, key=lambda r: float(np.sum((a * r * r + b * r + c) ** 2)))
    center = origin + radius * vector
    radial = np.linalg.norm(vertices - center, axis=1) - radius
    return dict(circle_radius_mm=radius, circle_fit_status="RESOLVED",
                circle_support_points=len(vertices),
                circle_center_depth_mm=float(center[0]), circle_center_height_mm=float(center[1]),
                circle_fit_rms_mm=float(np.sqrt(np.mean(radial * radial))),
                face_tangency_error_mm=float(np.max(np.abs(normals @ center - offsets - radius))),
                candidate_radii_mm=candidates)


def measure_nose(segments, precision, model=False):
    """Emit scalar face measurements, never the section vertices or indices."""
    try:
        apex, branches = nose_support(segments, precision)
    except ValueError as error:
        failure = unresolved(str(error))
        return dict(failure, apex_fit=failure, tangent_fit=failure, facet_support={})
    details = {}
    for side, branch in branches.items():
        support = branch["points"] - apex
        delta = np.diff(support, axis=0)
        lengths = np.linalg.norm(delta, axis=1)
        face = branch["adjoining_face"][1] - branch["adjoining_face"][0]
        details[side] = dict(
            facets=len(lengths), length_mm=float(lengths.sum()),
            facet_lengths_mm=[float(value) for value in lengths],
            facet_angles_deg=[math.degrees(math.atan2(row[1], row[0])) for row in delta],
            shoulder_depth_mm=float(support[-1, 0]),
            shoulder_height_from_apex_mm=float(support[-1, 1]),
            shoulder_length_jump=branch["shoulder_jump"],
            adjoining_face_angle_deg=math.degrees(math.atan2(face[1], face[0])))
    # DERIVED: both tangent shoulders bound the apex-only support; never use
    # the entry radius, MODEL radius, a target-derived depth, or a fallback.
    window = min(details[side]["shoulder_depth_mm"] for side in details)
    points = segments.reshape(-1, 2)
    near = points[points[:, 0] <= apex[0] + window]
    fitted = apex_circle(near - apex, precision)
    tangent = tangent_circle(apex, branches, precision)
    selected = tangent if model else fitted
    return dict(selected, apex_fit=fitted, tangent_fit=tangent,
                facet_support=details, derived_apex_window_mm=window,
                method="MODEL adjacent-face-tangent circle" if model else "OURS B apex circle on facet-derived support")
