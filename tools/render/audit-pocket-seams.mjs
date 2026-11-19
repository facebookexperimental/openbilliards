// Copyright (c) Meta Platforms, Inc. and affiliates.

// Independent audit of decoded seam carriers. The compiler's point list
// does not admit vertices: finite submitted events are enumerated afresh.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { createPocketSeamCertifier } from './pocket-seam-certification.mjs';

const sha = a => createHash('sha256').update(new Uint8Array(a.buffer, a.byteOffset, a.byteLength)).digest('hex');
const key = p => p.join(','), edgeKey = (a, b) => a < b ? a + ':' + b : b + ':' + a;
const bits = new DataView(new ArrayBuffer(4)), integers = new Map();
const integer = x => {
  assert.equal(x, Math.fround(x), 'Audit input must be submitted Float32');
  if (integers.has(x)) return integers.get(x);
  bits.setFloat32(0, x); const word = bits.getUint32(0), exponent = (word >>> 23) & 255, fraction = word & 0x7fffff;
  assert.notEqual(exponent, 255);
  const value = (word >>> 31 ? -1n : 1n) * (exponent ? BigInt(fraction | 0x800000) << BigInt(exponent - 1) : BigInt(fraction));
  integers.set(x, value); return value;
};
const sign = n => n < 0n ? -1 : n > 0n ? 1 : 0;
const turn = (a, b, c) => sign((integer(b[0]) - integer(a[0])) * (integer(c[1]) - integer(a[1]))
  - (integer(b[1]) - integer(a[1])) * (integer(c[0]) - integer(a[0])));
function topology(index, points, triangles) {
  const edges = new Map(), vertices = new Set(), degenerate = [];
  for (const t of triangles) {
    const ids = Array.from(index.slice(3 * t, 3 * t + 3)), orientation = turn(...ids.map(i => points[i]));
    if (!orientation) degenerate.push(t);
    if (orientation < 0) [ids[1], ids[2]] = [ids[2], ids[1]];
    for (let j = 0; j < 3; j++) {
      const a = ids[j], b = ids[(j + 1) % 3], k = edgeKey(a, b);
      if (!edges.has(k)) edges.set(k, {a, b, uses: []});
      edges.get(k).uses.push({a, b, triangle: t}); vertices.add(a); vertices.add(b);
    }
  }
  const boundary = [...edges.values()].filter(e => e.uses.length === 1);
  const boundaryVertices = new Set(boundary.flatMap(e => [e.a, e.b]));
  const invalid = [...edges.values()].filter(e => e.uses.length > 2 || e.uses.length === 2 && e.uses[0].a === e.uses[1].a);
  const outgoing = new Map(), incoming = new Map();
  for (const edge of boundary) {
    // Boundary direction is the submitted triangle's positive orientation,
    // not the first unordered endpoint pair used for the incidence map.
    const directed = {...edge, a: edge.uses[0].a, b: edge.uses[0].b};
    if (!outgoing.has(directed.a)) outgoing.set(directed.a, []);
    outgoing.get(directed.a).push(directed); incoming.set(directed.b, (incoming.get(directed.b) ?? 0) + 1);
  }
  const branches = [...boundaryVertices].filter(v => outgoing.get(v)?.length !== 1 || incoming.get(v) !== 1);
  const seen = new Set(), loops = [];
  if (!branches.length) for (const row of outgoing.values()) {
    const first = row[0]; if (seen.has(first)) continue;
    const ids = []; let edge = first;
    while (!seen.has(edge)) {
      seen.add(edge); ids.push(edge.a); edge = outgoing.get(edge.b)?.[0]; assert(edge, 'Closed parent boundary');
    }
    assert.equal(edge, first);
    let area = 0n;
    for (let i = 0; i < ids.length; i++) {
      const a = points[ids[i]], b = points[ids[(i + 1) % ids.length]];
      area += integer(a[0]) * integer(b[1]) - integer(a[1]) * integer(b[0]);
    }
    loops.push({vertices: ids, orientation: sign(area)});
  }
  const outer = loops.filter(l => l.orientation > 0).length, holes = loops.filter(l => l.orientation < 0).length;
  const required = boundary.length + 2 * holes - 2 * outer;
  const interior = [...vertices].filter(v => !boundaryVertices.has(v));
  return {triangles: triangles.length, boundary_edges: boundary.length, boundary_vertices: [...boundaryVertices],
    interior_vertices: interior, invalid_edges: invalid, branches, degenerate, loops, required_triangles: required,
    minimum: !branches.length && !invalid.length && !degenerate.length && !interior.length
      && loops.every(l => l.orientation !== 0) && triangles.length === required};
}
function auditPermission(originalIndex, points, openings, G, frameFor) {
  const edges = new Map();
  for (let t = 0; t < originalIndex.length / 3; t++) for (let j = 0; j < 3; j++) {
    const a = originalIndex[3 * t + j], b = originalIndex[3 * t + (j + 1) % 3], k = edgeKey(a, b);
    if (!edges.has(k)) edges.set(k, {a, b, parents: []}); edges.get(k).parents.push(t);
  }
  const byPlan = new Map(points.map((p, i) => [key(p), i])), aperture = new Set(), contours = [];
  const frames = G.pockets.map((p, i) => ({name: (p.corner ? 'c' : 's') + i,
    opening: openings[p.corner ? 'corner' : 'side'], frame: frameFor(G, p)}));
  for (const {name, opening, frame} of frames) {
    const contour = opening.contour.map(([u, w]) => [Math.fround(frame.nx + u * frame.ux - w * frame.uz),
      Math.fround(frame.nz + u * frame.uz + w * frame.ux)]);
    for (let i = 0; i < contour.length; i++) {
      const a = byPlan.get(key(contour[i])), b = byPlan.get(key(contour[(i + 1) % contour.length]));
      assert(a !== undefined && b !== undefined, 'Original aperture vertex');
      aperture.add(edgeKey(a, b)); contours.push({pocket: name, a, b});
    }
  }
  const local = new Set();
  for (const edge of edges.values()) if (edge.parents.length === 1) for (const id of [edge.a, edge.b]) {
    const point = points[id];
    if (frames.some(({frame, opening}) => {
      const dx = point[0] - frame.nx, dz = point[1] - frame.nz;
      const u = dx * frame.ux + dz * frame.uz, w = -dx * frame.uz + dz * frame.ux;
      return u >= opening.frontU - .005 && u <= opening.ring.uOut + opening.ring.rOut + .005
        && Math.abs(w) <= opening.ring.rOut + .005;
    })) local.add(id);
  }
  const allowed = new Set();
  for (let t = 0; t < originalIndex.length / 3; t++) {
    if ([0, 1, 2].some(j => local.has(originalIndex[3 * t + j]))) allowed.add(t);
  }
  return {edges, aperture, contours, allowed};
}
export async function auditPocketSeams({built, before, openings, reference = null, progress = null}) {
  const started = performance.now(), {G, group, tableAPI} = built;
  const bed = group.getObjectByName('dm-bed-cloth'), geometry = bed.geometry, original = before.get(bed.name).snapshot;
  const oldPosition = original.attributes.position, originalCount = oldPosition.length / 3;
  const positions = geometry.attributes.position.array, index = geometry.index.array, map = geometry.userData.pocketSeam;
  assert(map && map.originalVertexCount === originalCount && map.originalTriangles.length * 3 === index.length, 'Decoded bed correspondence');
  const points = Array.from({length: positions.length / 3}, (_, i) => [positions[3 * i], positions[3 * i + 2]]);
  const oldPoints = Array.from({length: originalCount}, (_, i) => [oldPosition[3 * i], oldPosition[3 * i + 2]]);
  const permission = auditPermission(original.index, oldPoints, openings, G, tableAPI.pocketAxisFrame);
  const active = [...permission.allowed].sort((a,b)=>a-b);
  const authorized = reference?.allowed_parents ? [...reference.allowed_parents].sort((a,b)=>a-b) : active;
  const expectedActive = reference?.expected_active_parents ? [...reference.expected_active_parents].sort((a,b)=>a-b) : null;
  const ceiling = new Set(authorized), expectedSet = new Set(expectedActive ?? []);
  const inactiveAuthorized = authorized.filter(parent => !permission.allowed.has(parent));
  const selection = {active, authorized, expected_active: expectedActive, inactive_authorized: inactiveAuthorized,
    active_outside_authorized: active.filter(parent => !ceiling.has(parent)),
    active_not_in_expected: expectedActive ? active.filter(parent => !expectedSet.has(parent)) : [],
    expected_not_active: expectedActive ? expectedActive.filter(parent => !permission.allowed.has(parent)) : []};
  await progress?.({phase: 'parent-selection', ...selection});
  if (reference?.allowed_parents) {
    assert(expectedActive, 'Historical active-parent binding required with the authorization ceiling');
    assert.deepEqual(selection.active_outside_authorized, [], 'Active parents within frozen authorization ceiling');
    assert.deepEqual(active, expectedActive, 'Historical active parents');
  }
  const originalRows = Object.entries(original.attributes).map(([name, array]) => {
    const actual = geometry.attributes[name].array;
    return {attribute: name, count: array.length, expected_sha256: sha(array), actual_sha256: sha(actual.subarray(0, array.length)),
      pass: actual.constructor.name === array.constructor.name && sha(array) === sha(actual.subarray(0, array.length))};
  });
  const parents = new Map(), usedBy = new Map(), globalEdges = new Map(), orientationFailures = [];
  for (let t = 0; t < index.length / 3; t++) {
    const parent = map.originalTriangles[t]; assert(Number.isInteger(parent) && parent >= 0 && parent < original.index.length / 3);
    if (!parents.has(parent)) parents.set(parent, []); parents.get(parent).push(t);
    const ids = Array.from(index.slice(3 * t, 3 * t + 3));
    const sourceIds = Array.from(original.index.slice(3 * parent, 3 * parent + 3));
    if (turn(...ids.map(i => points[i])) !== turn(...sourceIds.map(i => oldPoints[i]))) orientationFailures.push({triangle: t, parent});
    for (let j = 0; j < 3; j++) {
      const id = ids[j]; assert(id < points.length);
      if (!usedBy.has(id)) usedBy.set(id, new Set()); usedBy.get(id).add(parent);
      const e = edgeKey(id, ids[(j + 1) % 3]); globalEdges.set(e, (globalEdges.get(e) ?? 0) + 1);
    }
  }
  const apertureRows = permission.contours.map(row => ({...row, incidence: globalEdges.get(edgeKey(row.a, row.b)) ?? 0,
    pass: globalEdges.get(edgeKey(row.a, row.b)) === 1}));
  const metadata = new Map(map.newVertices.map(row => [row.vertex, row]));
  const certificate = createPocketSeamCertifier({G, group, bed, originalPoints: oldPoints,
    originalIndex: Array.from(original.index), eligibleParents: permission.allowed, apertureEdges: permission.aperture});
  const rows = [];
  for (let vertex = originalCount; vertex < points.length; vertex++) {
    const row = metadata.get(vertex); assert(row && usedBy.has(vertex), 'Every new vertex is emitted and has correspondence');
    const result = certificate.auditVertex({point: points[vertex], parents: [...usedBy.get(vertex)], interpolation_parent: row.parent});
    rows.push({vertex, point_m: Array.from(positions.slice(3 * vertex, 3 * vertex + 3)), interpolation_parent: row.parent,
      ...result});
    if (rows.length % 128 === 0) await progress?.({phase: 'vertices', completed: rows.length, total: points.length - originalCount});
  }
  assert.equal(rows.length, metadata.size, 'No hidden or unused metadata vertex');
  const byVertex = new Map(rows.map(row => [row.vertex, row]));
  const restores = reference?.restored_parents ?? Array.from({length: original.index.length / 3}, (_, i) => i).filter(t => !permission.allowed.has(t));
  const originalParent = parent => {
    const triangles = parents.get(parent) ?? [], expected = Array.from(original.index.slice(3 * parent, 3 * parent + 3));
    return {parent, expected, triangles, pass: triangles.length === 1
      && expected.every((id, j) => index[3 * triangles[0] + j] === id)};
  };
  const restoration = restores.map(originalParent), inactiveRestoration = inactiveAuthorized.map(originalParent);
  const targetCounts = reference?.target_parent_triangles ?? null, necessity = [], growth = [];
  for (let parent = 0; parent < original.index.length / 3; parent++) {
    const triangles = parents.get(parent) ?? [], current = topology(index, points, triangles);
    const unchanged = triangles.length === 1 && [0,1,2].every(j => index[3 * triangles[0] + j] === original.index[3 * parent + j]);
    const newBoundary = current.boundary_vertices.filter(i => i >= originalCount);
    const certified = newBoundary.every(i => byVertex.get(i)?.status === 'EXACT_SUBMITTED_EVENT_AND_ALLOWED_PARENTS');
    const target = targetCounts?.[parent] ?? null;
    const entry = {parent, allowed: permission.allowed.has(parent), unchanged, ...current,
      new_boundary_vertices: newBoundary, all_boundary_events_certified: certified,
      target_triangles: target, delta: target === null ? null : triangles.length - target,
      justified: unchanged || permission.allowed.has(parent) && current.minimum && certified};
    necessity.push(entry); if (entry.delta > 0) growth.push(entry);
  }
  const crossings = (reference?.required_crossings ?? []).map(expected => {
    const matching = rows.filter(row => row.point_m[0] === expected.point[0] && row.point_m[2] === expected.point[2]);
    return {...expected, matches: matching.map(row => row.vertex), pass: matching.length === 1
      && matching[0].point_m.every((x,i) => Object.is(x,expected.point[i]))
      && matching[0].status === 'EXACT_SUBMITTED_EVENT_AND_ALLOWED_PARENTS'};
  });
  const removed = (reference?.previous_residues ?? []).map(expected => {
    const matching = rows.filter(row => row.point_m[0] === expected.point[0] && row.point_m[2] === expected.point[2]);
    return {...expected, matches: matching.map(row => row.vertex), pass: !matching.length
      || matching.every(row => row.status === 'EXACT_SUBMITTED_EVENT_AND_ALLOWED_PARENTS')};
  });
  const negativeControls = (reference?.negative_controls ?? []).map(control => {
    assert(control.parents.every(parent => permission.allowed.has(parent)), 'Interior control uses allowed parents');
    const result = certificate.auditVertex({point: [control.point[0], control.point[2]],
      parents: control.parents, interpolation_parent: control.parents[0]});
    return {...control, result, pass: result.status === 'UNRESOLVED_OR_NON_EVENT'};
  });
  let areaInformation = null;
  if (reference?.previous_bed) {
    const previous = certificate.informationArea(reference.previous_bed);
    const current = certificate.informationArea({position: positions, index});
    const supports = [...new Set([...Object.keys(previous.attributed_m2), ...Object.keys(current.attributed_m2)])];
    areaInformation = {information_only: true, method: 'Float64 projected area, disjoint first-support attribution in fixed core/wood/collar order. No area value admits a vertex.',
      previous, current, rows: supports.map(mesh => ({mesh, previous_mm2: (previous.attributed_m2[mesh] ?? 0) * 1e6,
        current_mm2: (current.attributed_m2[mesh] ?? 0) * 1e6,
        removed_mm2: ((previous.attributed_m2[mesh] ?? 0) - (current.attributed_m2[mesh] ?? 0)) * 1e6})),
      total_removed_mm2: (previous.total_m2 - current.total_m2) * 1e6};
  }
  const status = originalRows.every(row => row.pass) && apertureRows.every(row => row.pass) && !orientationFailures.length
    && rows.every(row => row.status === 'EXACT_SUBMITTED_EVENT_AND_ALLOWED_PARENTS')
    && restoration.every(row => row.pass) && inactiveRestoration.every(row => row.pass) && necessity.every(row => row.justified)
    && crossings.every(row => row.pass) && removed.every(row => row.pass) && negativeControls.every(row => row.pass) ? 'PASS' : 'RED';
  return {status, table_id: built.tableId(), elapsed_ms: performance.now() - started,
    original_vertices: originalCount, original_attributes: originalRows, original_prefix_bit_exact: originalRows.every(row => row.pass),
    emitted_vertices: points.length, new_vertices: rows.length, vertices_examined: rows.length,
    certified_vertices: rows.filter(row => row.status === 'EXACT_SUBMITTED_EVENT_AND_ALLOWED_PARENTS').length,
    bed_triangles: index.length / 3, target_bed_triangles: reference?.target_triangles ?? null,
    bed_triangle_delta: reference?.target_triangles === undefined ? null : index.length / 3 - reference.target_triangles,
    parent_selection: selection, inactive_authorized_restoration: inactiveRestoration,
    aperture: apertureRows, restoration, orientation_failures: orientationFailures, required_crossings: crossings,
    previous_residues: removed, negative_controls: negativeControls, vertices: rows, necessity, growth,
    area_information: areaInformation, admitted: false};
}
