// Copyright (c) Meta Platforms, Inc. and affiliates.

// ORDER-13 ADDENDUM-5: offline occupancy and donor selection.
// Boundary and penetration depth are disclosures, never inheritance gates.
export { closedSolidIndex as embeddedReceiverIndex } from './cn8_closed_solids.mjs';

export function inheritColumnTransport(values, positions, stride, classifications, freeEligible = null, topology = null) {
  if (!Number.isInteger(stride) || stride < 1 || values.length % stride || positions.length !== values.length * 3
    || classifications.length !== values.length || freeEligible && freeEligible.length !== values.length) {
    throw new Error('CN8_EMBEDDED_INVALID_COLUMN_LAYOUT');
  }
  const result = values.slice(), inherited = [], unresolved = [];
  for (let vertex = 0; vertex < values.length; vertex++) {
    if (!classifications[vertex].length) continue;
    const column = vertex % stride, row = Math.floor(vertex / stride);
    let source = null, distance = Infinity, method = 'COLUMN';
    // Distance is the measured polyline arclength in the receiver's own
    // longitudinal column. Equal lengths use the smaller source identity.
    for (const direction of [-1, 1]) {
      let travelled = 0, last = vertex;
      for (let other = vertex + direction * stride; other >= 0 && other < values.length; other += direction * stride) {
        travelled += Math.hypot(...[0, 1, 2].map(axis => positions[other * 3 + axis] - positions[last * 3 + axis]));
        if (!classifications[other].length && (!freeEligible || freeEligible[other])) {
          if (travelled < distance || travelled === distance && (source === null || other < source)) {
            source = other; distance = travelled;
          }
          break;
        }
        last = other;
      }
    }
    if (source === null && topology) {
      method = 'ONE_RING';
      for (const other of topology.vertices[vertex].one_ring) {
        if (classifications[other].length || freeEligible && !freeEligible[other]) continue;
        const d = Math.hypot(...[0, 1, 2].map(axis => positions[other * 3 + axis] - positions[vertex * 3 + axis]));
        if (d < distance || d === distance && (source === null || other < source)) { source = other; distance = d; }
      }
    }
    if (source === null) { unresolved.push({ vertex, row, column, refusal: 'CN8_EMBEDDED_COLUMN_AND_ONE_RING_HAVE_NO_FREE_RECEIVER' }); continue; }
    result[vertex] = values[source];
    inherited.push({ vertex, row, column, source_vertex: source, source_row: Math.floor(source / stride),
      method, longitudinal_distance_m: method === 'COLUMN' ? distance : null,
      distance_m: distance, value: values[source] });
  }
  return { values: result, inherited, unresolved };
}

export function inheritGuardedColumnTransport(name, values, positions, stride, classifications, topology, freeEligible = null) {
  const result = inheritColumnTransport(values, positions, stride, classifications, freeEligible, topology);
  if (result.unresolved.length) {
    const error = new Error(result.unresolved[0].refusal); error.receiver = name; error.rows = result.unresolved; throw error;
  }
  assertFreeDonors(result.inherited, classifications, freeEligible);
  return result;
}

export function assertFreeDonors(inherited, classifications, freeEligible = null) {
  for (const row of inherited) {
    if (!Number.isInteger(row.source_vertex) || !classifications[row.source_vertex]
      || classifications[row.source_vertex].length || freeEligible && !freeEligible[row.source_vertex]) {
      const error = new Error('CN8_EMBEDDED_DONOR_IS_NOT_FREE'); error.row = row; throw error;
    }
  }
}

// The bed and clipped cushion lofts are unstructured surfaces. Their
// embedded vertices inherit along actual mesh edges, never an array column
// or a straight line through another sheet. Disconnected covered surfaces
// without a proved free sample still refuse generation.
export function inheritSurfaceTransport(name, positions, classifications, topology, freeEligible) {
  const inherited = [];
  for (let vertex = 0; vertex < classifications.length; vertex++) {
    if (!classifications[vertex].length) continue;
    const distance = new Map([[vertex, 0]]), pending = [[vertex, 0]], visited = new Set();
    let source = null, travelled = 0;
    while (pending.length) {
      pending.sort((a, b) => b[1] - a[1] || b[0] - a[0]);
      const [at, length] = pending.pop();
      if (visited.has(at)) continue;
      visited.add(at);
      if (!classifications[at].length && freeEligible[at]) { source = at; travelled = length; break; }
      for (const next of topology.vertices[at].one_ring) {
        if (visited.has(next)) continue;
        const edge = Math.hypot(...[0, 1, 2].map(axis => positions[next * 3 + axis] - positions[at * 3 + axis]));
        const candidate = length + edge;
        if (candidate < (distance.get(next) ?? Infinity)) {
          distance.set(next, candidate); pending.push([next, candidate]);
        }
      }
    }
    if (source === null) {
      const error = new Error('CN8_EMBEDDED_SURFACE_HAS_NO_FREE_RECEIVER');
      error.receiver = name; error.vertex = vertex; throw error;
    }
    inherited.push({ vertex, source_vertex: source, method: 'SURFACE_EDGES',
      distance_m: travelled, longitudinal_distance_m: null });
  }
  assertFreeDonors(inherited, classifications, freeEligible);
  return { inherited };
}

export function inheritComponents(values, itemSize, inherited, classifications, freeEligible = null) {
  assertFreeDonors(inherited, classifications, freeEligible);
  if (!Number.isInteger(itemSize) || itemSize < 1 || values.length !== classifications.length * itemSize) {
    throw new Error('CN8_EMBEDDED_COMPONENT_LAYOUT');
  }
  const result = values.slice();
  for (const row of inherited) for (let axis = 0; axis < itemSize; axis++) {
    result[row.vertex * itemSize + axis] = values[row.source_vertex * itemSize + axis];
  }
  return result;
}
