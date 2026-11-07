// Copyright (c) Meta Platforms, Inc. and affiliates.

// Q2/Q3 receiver census. Offline only; the browser consumes the sealed result.
import * as THREE from '../../../web/vendor/three.module.min.js';
import { RECEIVER, CLOTH_SURFACE } from '../../../web/scene/cn8transport-core.js';
import { embeddedReceiverIndex, inheritGuardedColumnTransport, inheritSurfaceTransport, assertFreeDonors } from './cn8_embedded_receivers.mjs';
import { receiverTopology } from './cn8_receiver_topology.mjs';

export function receiverStride(geometry) {
  if (geometry.userData.tongueCols) return geometry.userData.tongueCols.stride;
  if (geometry.userData.cn8WallArc) return geometry.userData.cn8WallArc.np;
  // The retained profile grids publish a constant U along each cross-row.
  // Derive its count from that stream instead of duplicating a TESSELLATION
  // letter (wall 5, end roll/apron 4, rollface 3 in the current builders).
  const uv = geometry.getAttribute('uv'); let stride = 1;
  while (stride < uv.count && uv.getX(stride) === uv.getX(0)) stride++;
  if (stride === uv.count || uv.count % stride) throw new Error('CN8_EMBEDDED_COLUMN_LAYOUT_NOT_PROVED');
  for (let i = 0; i < uv.count; i += stride) for (let j = 1; j < stride; j++) {
    if (uv.getX(i + j) !== uv.getX(i)) throw new Error('CN8_EMBEDDED_COLUMN_LAYOUT_NOT_PROVED');
  }
  return stride;
}

export function receiverCensus(group, solidSet, quantum, { visibility = true, progress = null } = {}) {
  group.updateMatrixWorld(true);
  const classifier = embeddedReceiverIndex(solidSet, quantum), rootInverse = group.matrixWorld.clone().invert();
  const meshes = []; group.traverse(m => { if (m.isMesh) meshes.push(m); });
  const rows = [], byName = new Map(), point = new THREE.Vector3(), normal = new THREE.Vector3();
  for (let ordinal = 0; ordinal < meshes.length; ordinal++) {
    const mesh = meshes[ordinal];
    const surface = group.userData.cn8Furniture && CLOTH_SURFACE.test(mesh.name)
      || mesh.geometry.userData.cn8ClosedJaw;
    if (!RECEIVER.test(mesh.name) && !surface || /^cn8-fallbag-/.test(mesh.name)) continue;
    let geometry = mesh.geometry;
    const sharedBag = /^cn8-net-[0235]$/.test(mesh.name)
      ? meshes.find(m => m.name === mesh.name.replace('cn8-net-', 'cn8-fallbag-')) : null;
    if (sharedBag) {
      geometry = mesh.geometry.clone();
      geometry.setIndex([...mesh.geometry.index.array, ...sharedBag.geometry.index.array]);
    }
    const topology = receiverTopology(geometry), stride = surface ? null : receiverStride(geometry);
    const position = geometry.getAttribute('position'), published = geometry.getAttribute('normal');
    const profile = geometry.userData.cn8Transport?.normals, smooth = geometry.userData.cn8Smooth?.nrm;
    const transform = rootInverse.clone().multiply(mesh.matrixWorld);
    const normalTransform = new THREE.Matrix3().getNormalMatrix(transform);
    const points = new Float64Array(position.count * 3), normals = new Float64Array(position.count * 3);
    const classifications = [], freeEligible = [], zeroUnused = [], undrawnSurface = [];
    for (let vertex = 0; vertex < position.count; vertex++) {
      point.fromBufferAttribute(position, vertex).applyMatrix4(transform).toArray(points, vertex * 3);
      if (profile) normal.fromArray(profile[vertex]);
      else if (smooth && typeof smooth.getX !== 'function') normal.fromArray(smooth.array, vertex * 3);
      else normal.fromBufferAttribute(smooth ?? published, vertex);
      normal.applyMatrix3(normalTransform).normalize().toArray(normals, vertex * 3);
      // Earcut and plane clipping can retain unused input vertices. They
      // have no incident drawn triangle and receive no visible field; do
      // not select them as donors or pretend they form a covered sheet.
      if (surface && !topology.vertices[vertex].active) {
        undrawnSurface.push(vertex); freeEligible.push(false); classifications.push([]); continue;
      }
      freeEligible.push(normal.lengthSq() > 0);
      if (!normal.lengthSq()) {
        if (topology.vertices[vertex].active) throw new Error('CN8_EMBEDDED_ZERO_PUBLISHED_NORMAL');
        zeroUnused.push(vertex); classifications.push([]); continue;
      }
      classifications.push(classifier.classify(point.toArray(), normal.toArray(), ordinal));
    }
    const plan = surface
      ? inheritSurfaceTransport(mesh.name, points, classifications, topology, freeEligible)
      : inheritGuardedColumnTransport(mesh.name, Float64Array.from({ length: position.count }, (_, i) => i),
        points, stride, classifications, topology, freeEligible);
    assertFreeDonors(plan.inherited, classifications, freeEligible);
    const embedded = plan.inherited.map(donor => {
      const v = donor.vertex, t = topology.vertices[v];
      const row = { ...donor, value: undefined, point_m: Array.from(points.subarray(v * 3, v * 3 + 3)),
        normal: Array.from(normals.subarray(v * 3, v * 3 + 3)), boundary: t.boundary, active: t.active,
        incident_faces: t.incident_faces, solids: classifications[v],
        source_point_m: Array.from(points.subarray(donor.source_vertex * 3, donor.source_vertex * 3 + 3)) };
      // A4 repeats the point-in-solid query at the selected input, independently
      // of the stored classification mask used during nearest-donor selection.
      const d = donor.source_vertex;
      row.donor_certificate = classifier.certifyFree(Array.from(points.subarray(d * 3, d * 3 + 3)),
        Array.from(normals.subarray(d * 3, d * 3 + 3)), ordinal);
      if (visibility) {
        let witness = null, samples = 0;
        for (const face of t.incident_faces) {
          const ids = topology.triangles[face];
          const free = ids.find(id => !classifications[id].length && freeEligible[id]);
          if (free !== undefined) { witness = { type: 'FREE_INCIDENT_VERTEX', face, vertex: free }; break; }
          // OWNER Q3: subdivision 10 yields (10+1)(10+2)/2 = 66 samples.
          for (let i = 0; i <= 10 && !witness; i++) for (let j = 0; j <= 10 - i && !witness; j++) {
            const weights = [i / 10, j / 10, (10 - i - j) / 10], p = [0, 0, 0];
            for (let k = 0; k < 3; k++) for (let axis = 0; axis < 3; axis++) p[axis] += weights[k] * points[ids[k] * 3 + axis];
            samples++;
            if (!classifier.classify(p, row.normal, ordinal, { contact: false }).length) {
              witness = { type: 'OUTSIDE_BARYCENTRIC_POINT', face, weights, point_m: p };
            }
          }
          if (witness) break;
        }
        row.visibility = { class: witness ? 'E-BLEED' : 'E-HIDDEN', witness, sampled_points: samples,
          grid_points_per_triangle: 66, lower_bound: true,
          meaning: witness ? 'A changed interpolation can be visible; pixel footprint requires the frame pose.'
            : 'No sampled outside witness; finite-grid lower bound, not a proof of invisibility.' };
      }
      return row;
    });
    const row = { name: mesh.name, ordinal, aliases: sharedBag ? [mesh.name, sharedBag.name] : [mesh.name],
      vertices: position.count, stride, topology, points, normals, classifications, freeEligible,
      zero_unused_vertices: zeroUnused, undrawn_surface_vertices: undrawnSurface, inherited: plan.inherited, embedded };
    rows.push(row); for (const name of row.aliases) byName.set(name, row);
    progress?.({ name: row.name, vertices: row.vertices, inherited: row.inherited.length,
      inside: embedded.filter(r => r.solids.some(s => s.reason === 'INSIDE')).length,
      contact_only: embedded.filter(r => r.solids.every(s => s.reason !== 'INSIDE')).length });
    if (sharedBag) geometry.dispose();
  }
  return { rows, byName, classifier,
    receipt: { tag: 'DERIVED / ORDER-13 ADDENDUM-5 Q2/Q3', law: classifier.law,
      coverage: 'All published nonzero-normal receivers against every proved closed body. Open/unproved carriers are disclosed; positive-witness lower bound. Shared net/bag attributes counted once.',
      closed_bodies: classifier.members.filter(m => m.proof), unproved_carriers: classifier.members.filter(m => !m.proof),
      rows: rows.map(({ name, ordinal, aliases, vertices, stride, zero_unused_vertices, undrawn_surface_vertices, embedded, topology }) => ({
        name, ordinal, aliases, vertices, stride, zero_unused_vertices, undrawn_surface_vertices, active_vertices: topology.active_vertices,
        field: /^cn8-net-liner-[0235]$/.test(name) ? 'Retained secondary-liner field; Q2 inheritance only, FREE bytes held' : 'Complete-solid transport',
        embedded_count: embedded.length, embedded })) } };
}
