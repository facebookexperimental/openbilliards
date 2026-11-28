// Copyright (c) Meta Platforms, Inc. and affiliates.

// ORDER-13 ADDENDUM-5. Occupancy is proved from closed bodies, independently
// of the full O2 surface set. An open liner remains an occluder, not a volume.
import * as THREE from '../../../web/vendor/three.module.min.js';

export function closedSolidIndex(solidSet, quantum) {
  if (!(quantum > 0) || !Number.isFinite(quantum)) throw new Error('CN8_EMBEDDED_INVALID_QUANTUM');
  const position = solidSet.geometry.getAttribute('position'), index = solidSet.geometry.index;
  const virtual = new Map();
  let nextVirtual = index.count / 3;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const triangle = new THREE.Triangle(a, b, c), closest = new THREE.Vector3();
  const faceNormal = new THREE.Vector3(), delta = new THREE.Vector3();
  function read(id) {
    const extra = virtual.get(id);
    if (extra) [a, b, c].forEach((v, i) => v.fromArray(extra[i]));
    else [a, b, c].forEach((v, i) => v.fromBufferAttribute(position, index.getX(id * 3 + i)));
  }
  function build(entries) {
    const box = new THREE.Box3(); for (const row of entries) box.union(row.box);
    if (entries.length <= 8) return { box, entries };
    const size = box.getSize(new THREE.Vector3());
    const axis = size.x >= size.y && size.x >= size.z ? 'x' : size.y >= size.z ? 'y' : 'z';
    entries.sort((x, y) => x.center[axis] - y.center[axis] || x.id - y.id);
    const middle = Math.floor(entries.length / 2);
    return { box, children: [build(entries.slice(0, middle)), build(entries.slice(middle))] };
  }
  function entry(id) {
    read(id); const box = new THREE.Box3().setFromPoints([a, b, c]);
    return { id, box, center: box.getCenter(new THREE.Vector3()) };
  }
  const members = solidSet.members.map(member => {
    const points = [], pointIds = new Map(), edges = new Map(), faces = new Set(), entries = [];
    function vertex(v) {
      const key = v.toArray().join(',');
      if (!pointIds.has(key)) { pointIds.set(key, points.length); points.push(v.toArray()); }
      return pointIds.get(key);
    }
    for (let id = member.triangleStart; id < member.triangleStart + member.triangles; id++) {
      read(id); if (triangle.getArea() === 0) continue;
      const ids = [a, b, c].map(vertex), key = ids.slice().sort((x, y) => x - y).join(',');
      if (faces.has(key)) continue;
      faces.add(key); entries.push(entry(id));
      for (let j = 0; j < 3; j++) {
        const pair = [ids[j], ids[(j + 1) % 3]].sort((x, y) => x - y), edgeKey = pair.join(',');
        if (!edges.has(edgeKey)) edges.set(edgeKey, { vertices: pair, count: 0 });
        edges.get(edgeKey).count++;
      }
    }
    const boundary = [...edges.values()].filter(e => e.count === 1);
    const nonmanifold = [...edges.values()].filter(e => e.count > 2);
    let proof = boundary.length === 0 && nonmanifold.length === 0 && entries.length
      ? 'CLOSED_PUBLISHED_TRIANGLES' : null;
    const closure = [];
    // cushionGeom is a filled profile loft. Its only omitted face is the
    // underside of the published bottom ring. Prove that exact single planar
    // cycle before using the body's implicit floor in this CPU volume query.
    // This adds no rendered triangle, coordinate, or ray-occlusion surface.
    if (!proof && /^cn8-cushion-[0-5]$/.test(member.name) && !nonmanifold.length && boundary.length >= 3) {
      const neighbours = new Map();
      for (const edge of boundary) for (const [x, y] of [edge.vertices, edge.vertices.slice().reverse()]) {
        if (!neighbours.has(x)) neighbours.set(x, []); neighbours.get(x).push(y);
      }
      const ids = [...neighbours.keys()], floor = Math.min(...points.map(p => p[1]));
      if (ids.every(id => neighbours.get(id).length === 2 && points[id][1] === floor)) {
        const cycle = [ids[0]]; let previous = null, current = ids[0];
        do {
          const next = neighbours.get(current).find(id => id !== previous);
          previous = current; current = next;
          if (current !== cycle[0]) cycle.push(current);
        } while (current !== cycle[0] && cycle.length <= ids.length);
        if (current === cycle[0] && cycle.length === ids.length) {
          const contour = cycle.map(id => new THREE.Vector2(points[id][0], points[id][2]));
          const caps = THREE.ShapeUtils.triangulateShape(contour, []);
          if (caps.length === cycle.length - 2) {
            for (const cap of caps) {
              const coordinates = cap.map(i => points[cycle[i]]), id = nextVirtual++;
              virtual.set(id, coordinates); entries.push(entry(id)); closure.push(coordinates);
            }
            proof = 'CLOSED_CUSHION_PROFILE_WITH_IMPLICIT_PLANAR_FOOT';
          }
        }
      }
    }
    const tree = proof ? build(entries) : null;
    return { ...member, tree, box: tree?.box, proof,
      closure: { tag: 'DERIVED exact published incidence; no emitted geometry edit',
        unique_vertices: points.length, distinct_faces: faces.size,
        boundary_edges: boundary.length, nonmanifold_edges: nonmanifold.length,
        implicit_foot_triangles: closure }, entries: entries.length };
  });
  const bodies = members.filter(m => m.proof);
  const p = new THREE.Vector3(), n = new THREE.Vector3();
  function surface(member) {
    let best = null; const contacts = [];
    function visit(node) {
      if (node.box.distanceToPoint(p) > Math.max(best?.distance_m ?? Infinity, quantum)) return;
      if (node.children) {
        for (const child of node.children.slice().sort((x, y) => x.box.distanceToPoint(p) - y.box.distanceToPoint(p))) visit(child);
        return;
      }
      for (const row of node.entries) {
        if (row.box.distanceToPoint(p) > Math.max(best?.distance_m ?? Infinity, quantum)) continue;
        read(row.id); triangle.closestPointToPoint(p, closest); triangle.getNormal(faceNormal);
        const result = { triangle: row.id, implicit_foot: virtual.has(row.id),
          distance_m: p.distanceTo(closest), signed_plane_m: delta.copy(p).sub(closest).dot(faceNormal),
          point_m: closest.toArray(), normal: faceNormal.toArray(), normal_dot_receiver: faceNormal.dot(n) };
        if (!best || result.distance_m < best.distance_m
          || result.distance_m === best.distance_m && row.id < best.triangle) best = result;
        if (!result.implicit_foot && result.distance_m <= quantum && result.normal_dot_receiver < 0) contacts.push(result);
      }
    }
    visit(member.tree); contacts.sort((x, y) => x.distance_m - y.distance_m || x.triangle - y.triangle);
    return { best, contacts };
  }
  const axes = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
  // ORACLE sampling only. A ray through a published edge may be tangent;
  // six non-axial witnesses resolve an axial parity disagreement without
  // moving the origin or introducing a distance tolerance.
  const skew = [[1,2,3],[-1,-2,-3],[2,3,5],[-2,-3,-5],[3,5,7],[-3,-5,-7]]
    .map(d => new THREE.Vector3(...d).normalize().toArray());
  const ray = new THREE.Ray(), hit = new THREE.Vector3();
  function crossings(member, direction) {
    ray.origin.copy(p); ray.direction.fromArray(direction);
    const hits = [];
    function visit(node) {
      if (!ray.intersectsBox(node.box)) return;
      if (node.children) { for (const child of node.children) visit(child); return; }
      for (const row of node.entries) {
        if (!ray.intersectsBox(row.box)) continue;
        read(row.id);
        if (ray.intersectTriangle(a, b, c, false, hit)) {
          const distance = hit.distanceTo(p);
          if (distance > 0) hits.push(distance);
        }
      }
    }
    visit(member.tree);
    // Exact duplicate crossing distances represent a shared triangle edge;
    // no spatial tolerance, camera fit, or winding threshold is introduced.
    const distances = [...new Set(hits)].sort((x, y) => x - y);
    return { direction, positive_crossings: distances.length, odd: distances.length % 2 === 1,
      first_exit_m: distances[0] ?? null };
  }
  function classify(point, normal, receiverOrdinal, { contact = true } = {}) {
    if (point.length !== 3 || normal.length !== 3 || ![...point, ...normal].every(Number.isFinite)
      || !Number.isInteger(receiverOrdinal)) throw new Error('CN8_EMBEDDED_NONFINITE_RECEIVER');
    p.fromArray(point); n.fromArray(normal);
    if (!n.lengthSq()) throw new Error('CN8_EMBEDDED_ZERO_PUBLISHED_NORMAL');
    n.normalize(); const result = [];
    for (const member of bodies) {
      if (member.ordinal === receiverOrdinal || member.box.distanceToPoint(p) > (contact ? quantum : 0)) continue;
      const { best, contacts } = surface(member);
      const rays = best.distance_m > 0 && member.box.containsPoint(p) ? axes.map(d => crossings(member, d)) : [];
      const mixed = rays.some(r => r.odd) && rays.some(r => !r.odd);
      const secondary = mixed ? skew.map(d => crossings(member, d)) : [];
      const accepted = secondary.length ? secondary : rays;
      const inside = accepted.length === 6 && accepted.every(r => r.odd);
      if (inside || contact && contacts.length) result.push({ ordinal: member.ordinal, name: member.name,
        reason: inside ? 'INSIDE' : 'WITHIN_QUANTUM_OPPOSED_SURFACE', proof: member.proof,
        signed_distance_m: inside ? -best.distance_m : best.distance_m,
        nearest: best, six_axis_witness: rays, non_axial_witness: secondary, opposed_contacts: contacts });
    }
    return result;
  }
  function certifyFree(point, normal, receiverOrdinal) {
    const occupied = classify(point, normal, receiverOrdinal);
    if (occupied.length) { const error = new Error('CN8_EMBEDDED_DONOR_IS_NOT_FREE'); error.solids = occupied; throw error; }
    // An empty positive-witness result alone is not a donor certificate.
    // Require an outside-bound, exact-surface, or all-even crossing proof
    // for every proved adjacent body; mixed parity is explicitly unresolved.
    p.fromArray(point); const tests = [];
    for (const member of bodies) {
      if (member.ordinal === receiverOrdinal) continue;
      if (!member.box.containsPoint(p)) { tests.push({ ordinal: member.ordinal, proof: 'OUTSIDE_BOUND' }); continue; }
      const { best } = surface(member);
      if (best.distance_m === 0) { tests.push({ ordinal: member.ordinal, proof: 'EXACT_SURFACE_NOT_INTERIOR' }); continue; }
      const rays = axes.map(d => crossings(member, d));
      const secondary = rays.some(r => r.odd) ? skew.map(d => crossings(member, d)) : [];
      if ((secondary.length ? secondary : rays).some(r => r.odd)) {
        const error = new Error('CN8_EMBEDDED_DONOR_OCCUPANCY_UNRESOLVED'); error.solid = member.name; error.point = point; error.rays = rays; error.non_axial_witness = secondary; throw error;
      }
      tests.push({ ordinal: member.ordinal, proof: secondary.length ? 'SIX_NON_AXIAL_EVEN_CROSSINGS' : 'SIX_EVEN_CROSSINGS', rays, non_axial_witness: secondary });
    }
    return { status: 'FREE', tested_bodies: tests.length, exceptions_to_outside_bounds: tests.filter(t => t.proof !== 'OUTSIDE_BOUND') };
  }
  return { classify, certifyFree, members: members.map(({ tree, box, ...m }) => m),
    law: 'Six positive odd crossing witnesses on proved closed bodies; exact shared-edge distances collapse. Published filled cushion profiles have an independently proved single planar foot cycle, used only as implicit occupancy closure. Open sheets, hollow liners and unproved soup remain O2 ray occluders but never occupied volumes. Retained quantum/opposed-surface contacts are disclosed separately from strictly interior receivers.' };
}
