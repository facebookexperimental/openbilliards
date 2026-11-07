// Copyright (c) Meta Platforms, Inc. and affiliates.

// ORDER-13 ADDENDUM-5: boundary is a disclosure, not an inheritance gate.
// Exact-coordinate welding joins duplicated attribute vertices; it does not
// snap or move geometry. Opposite duplicate faces count as one sheet face.
import * as THREE from '../../../web/vendor/three.module.min.js';

export function receiverTopology(geometry) {
  const position = geometry.getAttribute('position'), index = geometry.index;
  const count = index?.count ?? position.count;
  const end = Math.min(count, geometry.drawRange.start + geometry.drawRange.count);
  const keyToId = new Map(), welded = [], sourceByWeld = new Map();
  for (let vertex = 0; vertex < position.count; vertex++) {
    const key = [position.getX(vertex), position.getY(vertex), position.getZ(vertex)].join(',');
    if (!keyToId.has(key)) keyToId.set(key, keyToId.size);
    const id = keyToId.get(key); welded.push(id);
    if (!sourceByWeld.has(id)) sourceByWeld.set(id, []);
    sourceByWeld.get(id).push(vertex);
  }
  const edges = new Map(), seenFaces = new Set(), incident = new Map(), active = new Set(), triangles = new Map();
  const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const triangle = new THREE.Triangle(...v);
  let degenerate = 0, duplicates = 0;
  for (let offset = geometry.drawRange.start; offset + 2 < end; offset += 3) {
    const ids = [0, 1, 2].map(j => index ? index.getX(offset + j) : offset + j);
    ids.forEach((id, j) => v[j].fromBufferAttribute(position, id));
    if (triangle.getArea() === 0) { degenerate++; continue; }
    for (const id of ids) active.add(id);
    const wi = ids.map(id => welded[id]), face = wi.slice().sort((a, b) => a - b).join(',');
    if (seenFaces.has(face)) { duplicates++; continue; }
    seenFaces.add(face);
    triangles.set(offset / 3, ids);
    for (const id of wi) {
      if (!incident.has(id)) incident.set(id, []);
      incident.get(id).push(offset / 3);
    }
    for (let j = 0; j < 3; j++) {
      const edge = [wi[j], wi[(j + 1) % 3]].sort((a, b) => a - b), key = edge.join(',');
      if (!edges.has(key)) edges.set(key, { vertices: edge, faces: [] });
      edges.get(key).faces.push(offset / 3);
    }
  }
  const boundaryByWeld = new Map();
  for (const edge of edges.values()) if (edge.faces.length === 1) {
    for (const id of edge.vertices) {
      if (!boundaryByWeld.has(id)) boundaryByWeld.set(id, []);
      boundaryByWeld.get(id).push(edge);
    }
  }
  const vertices = welded.map((id, vertex) => ({ vertex, welded_vertex: id,
    active: active.has(vertex), boundary: boundaryByWeld.has(id),
    incident_faces: incident.get(id) ?? [], boundary_edges: boundaryByWeld.get(id) ?? [],
    one_ring: [...new Set((incident.get(id) ?? []).flatMap(face => triangles.get(face)))]
      .filter(other => welded[other] !== id).sort((a, b) => a - b) }));
  return { tag: 'DERIVED / exact published-position and drawn-triangle incidence',
    law: 'A boundary edge has one distinct nondegenerate incident sheet face. Duplicated position/attribute seams and opposite duplicate windings do not create a boundary.',
    vertices, triangles: Object.fromEntries(triangles), source_vertices: position.count, unique_positions: keyToId.size,
    active_vertices: active.size, inactive_vertices: vertices.filter(v => !v.active).map(v => v.vertex),
    boundary_vertices: vertices.filter(v => v.boundary).map(v => v.vertex),
    boundary_edges: [...edges.values()].filter(edge => edge.faces.length === 1).length,
    nonmanifold_edges: [...edges.values()].filter(edge => edge.faces.length > 2).length,
    distinct_faces: seenFaces.size, degenerate_triangles: degenerate, duplicate_faces: duplicates };
}

export function embeddedBoundaryGuard(name, vertex, solids, topology) {
  const row = topology.vertices[vertex];
  if (!row) throw new Error('CN8_EMBEDDED_TOPOLOGY_VERTEX_MISSING');
  return { status: solids.length ? 'INHERIT' : 'FREE',
    receiver: name, vertex, boundary: row.boundary, inherited_free_receiver: null,
    incident_faces: row.incident_faces,
    inward_depths_m: solids.map(s => Math.max(0, -(s.signed_distance_m ?? s.signed_depth_m))),
    boundary_and_depth: 'DISCLOSURE ONLY / ORDER-13 ADDENDUM-5 Q1' };
}
