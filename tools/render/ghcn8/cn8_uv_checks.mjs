// Copyright (c) Meta Platforms, Inc. and affiliates.

// CPU measurements of emitted UVs. No browser or source pixels are required.
export const UV_ALLOWANCES = Object.freeze({
  gradient: 1e-7, sharedUV: 2 ** -22, pathResidualMm: 0.001,
  tag: 'TESSELLATION / Float32 publication and analytic arc reconstruction',
});

const sub = (a, b) => a.map((v, i) => v - b[i]);
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const key = (p) => p.join(',');

export function uvBuffers(geometry, name) {
  return { name, positions: Array.from(geometry.attributes.position.array),
    uvs: Array.from(geometry.attributes.uv.array),
    uv1s: geometry.attributes.uv1 ? Array.from(geometry.attributes.uv1.array) : null,
    indices: geometry.index ? Array.from(geometry.index.array) : null,
    groups: geometry.groups.map(g => ({ ...g })),
    metadata: geometry.userData.cn8D3 ?? null };
}

function triangles(row) {
  if (!row.positions?.length || row.positions.length % 3
    || row.uvs?.length !== row.positions.length / 3 * 2
    || [...row.positions, ...row.uvs].some((v) => !Number.isFinite(v))) {
    throw new Error(`Malformed position/UV buffers: ${row.name}`);
  }
  const ids = row.indices ?? Array.from({ length: row.positions.length / 3 }, (_, i) => i);
  if (ids.length % 3 || ids.some((i) => !Number.isInteger(i) || i < 0 || i * 3 >= row.positions.length)) {
    throw new Error(`Malformed indices: ${row.name}`);
  }
  const result = [];
  for (let i = 0; i < ids.length; i += 3) {
    const vertices = ids.slice(i, i + 3).map((id) => ({
      p: row.positions.slice(id * 3, id * 3 + 3), uv: row.uvs.slice(id * 2, id * 2 + 2),
    }));
    result.push({ id: i / 3, indices: ids.slice(i, i + 3), vertices,
      cap: vertices.every((v) => v.p[1] === vertices[0].p[1]) });
  }
  return result;
}

function gradient(triangle, axis) {
  const point = ({ p }) => triangle.cap ? [p[0], p[2]] : [p[axis], p[1]];
  const [a, b, c] = triangle.vertices, ab = sub(point(b), point(a)), ac = sub(point(c), point(a));
  const determinant = cross(ab, ac);
  if (!determinant) return null;
  const du = [b.uv[0] - a.uv[0], c.uv[0] - a.uv[0]];
  const dv = [b.uv[1] - a.uv[1], c.uv[1] - a.uv[1]];
  return { dUds: (du[0] * ac[1] - du[1] * ab[1]) / determinant,
    dUdh: (ab[0] * du[1] - ac[0] * du[0]) / determinant,
    dVds: (dv[0] * ac[1] - dv[1] * ab[1]) / determinant,
    dVdh: (ab[0] * dv[1] - ac[0] * dv[0]) / determinant };
}

function canPair(a, b, targetPlank) {
  if (!b || a.cap !== b.cap) return false;
  // The plank emits (a,b,c), (c,b,d). A collapsed first triangle leaves
  // a singleton; its next neighbour shares a side edge, not its diagonal.
  if (targetPlank && !a.cap && (a.vertices[0].p[1] !== a.vertices[2].p[1]
    || key(b.vertices[0].p) !== key(a.vertices[2].p)
    || key(b.vertices[1].p) !== key(a.vertices[1].p))) return false;
  const first = new Set(a.vertices.map((v) => key(v.p)));
  const shared = b.vertices.filter((v) => first.has(key(v.p)));
  const points = new Map([...a.vertices, ...b.vertices].map((v) => [key(v.p), v.p]));
  if (shared.length !== 2 || points.size !== 4) return false;
  const heights = new Map();
  for (const p of points.values()) heights.set(p[1], (heights.get(p[1]) ?? 0) + 1);
  return a.cap || heights.size === 2 && [...heights.values()].every((n) => n === 2);
}

// Landing pass (class G): the shipped plank emitter selects each quad's U1
// projection axis ONCE from the shared plan edge (the bottom edge a->c of the
// first triangle (a,b,c); the top edge b->d of (c,b,d) when the bottom edge is
// collapsed) with |dX| >= |dZ| reading X. On axis-aligned faces this equals the
// longest-horizontal-edge heuristic below; on the accepted 35 mm x 45 deg rail-end
// chamfer (711789a0) the Float32-published legs differ by one quantum and the
// heuristic could read the other edge, so the census derives the axis the way
// the emitter does. Non-plank rows keep the heuristic.
function heuristicAxis(pair) {
  const horizontalEdges = [];
  for (const tri of pair) for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++) {
    const x = tri.vertices[a], y = tri.vertices[b];
    if (x.p[1] === y.p[1]) horizontalEdges.push({ a: x, b: y,
      length: Math.hypot(y.p[0] - x.p[0], y.p[2] - x.p[2]) });
  }
  horizontalEdges.sort((a, b) => b.length - a.length);
  const edge = horizontalEdges[0];
  return !edge || Math.abs(edge.b.p[0] - edge.a.p[0]) >= Math.abs(edge.b.p[2] - edge.a.p[2]) ? 0 : 2;
}
function emitterAxis(pair) {
  const [first, second] = pair, v = first.vertices;
  if (first.cap) return 0;
  const plan = (x, y) => [y.p[0] - x.p[0], y.p[2] - x.p[2]];
  let edge;
  if (second) {
    edge = plan(v[0], v[2]);
    if (edge[0] === 0 && edge[1] === 0) edge = plan(v[1], second.vertices[2]);
  } else {
    edge = v[0].p[1] === v[2].p[1] ? plan(v[0], v[2]) : plan(v[1], v[2]);
  }
  if (edge[0] === 0 && edge[1] === 0) return heuristicAxis(pair);
  return Math.abs(edge[0]) >= Math.abs(edge[1]) ? 0 : 2;
}
function plankPairs(tris, targetPlank) {
  const pairs = [];
  for (let i = 0; i < tris.length;) {
    const first = tris[i], pair = canPair(first, tris[i + 1], targetPlank) ? [first, tris[i + 1]] : [first];
    i += pair.length;
    pairs.push(pair);
  }
  return pairs;
}
export function projectionAxes(tris, targetPlank) {
  const axes = new Map();
  for (const pair of plankPairs(tris, targetPlank)) {
    const axis = targetPlank ? emitterAxis(pair) : heuristicAxis(pair);
    for (const tri of pair) axes.set(tri.id, axis);
  }
  return axes;
}

export function measureRailUV(row) {
  const tris = triangles(row), rows = [], targetPlank = /^cn8-plank-\d+$/.test(row.name);
  const axes = projectionAxes(tris, targetPlank);
  for (const pair of plankPairs(tris, targetPlank)) {
    const first = pair[0];
    const axis = axes.get(first.id);
    const gradients = pair.map((t) => gradient(t, axis));
    const failures = [], collapsed = [];
    if (gradients.some((g) => !g)) failures.push('SINGULAR_PLAN_PROJECTION');
    for (const tri of pair) {
      const [a, b, c] = tri.vertices;
      if (cross(sub(b.uv, a.uv), sub(c.uv, a.uv)) === 0) collapsed.push(tri.id);
    }
    if (collapsed.length) failures.push('COLLAPSED_UV_TRIANGLE');
    let constantU = 0;
    if (targetPlank && !first.cap) for (const tri of pair) {
      for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++) {
        const x = tri.vertices[a], y = tri.vertices[b];
        if (x.p[1] === y.p[1] && Math.hypot(y.p[0] - x.p[0], y.p[2] - x.p[2]) > 0 && x.uv[0] === y.uv[0]) constantU++;
      }
    }
    if (constantU) failures.push('CONSTANT_U_ON_PLAN_EDGE');
    let shared = 0;
    if (pair.length === 2) for (const a of pair[0].vertices) for (const b of pair[1].vertices) {
      if (key(a.p) === key(b.p)) shared = Math.max(shared, ...sub(a.uv, b.uv).map(Math.abs));
    }
    if (shared > UV_ALLOWANCES.sharedUV) failures.push('DIAGONAL_UV_DISCONTINUITY');
    const delta = pair.length === 2 && gradients.every(Boolean)
      ? Object.fromEntries(Object.keys(gradients[0]).map((k) => [k, Math.abs(gradients[0][k] - gradients[1][k])])) : null;
    if (delta && Object.values(delta).some((d) => d > UV_ALLOWANCES.gradient)) failures.push('DIAGONAL_GRADIENT_DISCONTINUITY');
    rows.push({ name: row.name, triangles: pair.map((t) => t.id),
      kind: first.cap ? 'horizontal cap' : pair.length === 2 ? 'side quad' : 'single side triangle after collapsed edge',
      plan_projection_axis: first.cap ? 'XZ' : axis === 0 ? 'X/Y' : 'Z/Y',
      gradients, delta, shared_diagonal_uv_max: shared, constant_u_plan_edges: constantU,
      collapsed_uv_triangles: collapsed, status: failures.length ? 'FAIL' : 'PASS', failures });
  }
  return { name: row.name, tag: 'DERIVED / emitted position and UV buffer measurements',
    status: rows.some((r) => r.failures.length) ? 'FAIL' : 'PASS',
    triangle_count: tris.length, paired_quads: rows.filter((r) => r.triangles.length === 2).length,
    single_triangles: rows.filter((r) => r.triangles.length === 1).length,
    affected_quads_or_single_triangles: rows.filter((r) => r.failures.length).length,
    collapsed_uv_triangles: rows.flatMap((r) => r.collapsed_uv_triangles),
    max_delta_dUds: Math.max(0, ...rows.map((r) => r.delta?.dUds ?? 0)),
    allowances: UV_ALLOWANCES, rows };
}

// Keep every geometric measurement in the census, including UVs on plain
// end-grain faces. Those faces have no UV consumer. A textured face, a custom
// shader, an unknown material, or any FIX1 plank face always remains a gate.
export function scopeRailUVMaterials(measurement, descriptor) {
  const rows = measurement.rows.map((row) => {
    const materialIndices = new Set();
    for (const tri of row.triangles) {
      if (descriptor.materials?.length === 1) materialIndices.add(0);
      else {
        const groups = (descriptor.groups ?? []).filter((g) =>
          g.start <= tri * 3 && g.start + g.count >= tri * 3 + 3);
        if (groups.length !== 1) throw new Error(`Ambiguous triangle material: ${measurement.name}/${tri}`);
        materialIndices.add(groups[0].materialIndex);
      }
    }
    const materials = [...materialIndices].map((i) => descriptor.materials?.[i]);
    const plain = !/^cn8-plank-\d+$/.test(measurement.name) && materials.every((m) => m
      && m.type === 'MeshStandardMaterial' && m.maps && Object.keys(m.maps).length === 0
      && m.shaderHook?.replace(/\s/g, '') === 'onBeforeCompile(){}');
    return { ...row, material_indices: [...materialIndices],
      gate_status: plain ? 'NOT-APPLICABLE / no UV-consuming material' : row.status,
      material_scope: plain ? 'Plain end-grain material; raw UV diagnostics retained' : 'UV mapping required' };
  });
  return { ...measurement, raw_status: measurement.status,
    status: rows.some((r) => r.gate_status === 'FAIL') ? 'FAIL' : 'PASS', rows,
    non_consumed_uv_diagnostic_rows: rows.filter((r) => r.status === 'FAIL' && r.gate_status !== 'FAIL').length,
    affected_consumed_quads_or_single_triangles: rows.filter((r) => r.gate_status === 'FAIL').length };
}

// Measure the sampler domain from captured UVs and actual texture transforms.
// A continuous raw UV plane can still cross a non-tileable bitmap boundary.
export function measurePlankTextureDomain(row, descriptor, periodsMm, referenceRepeat) {
  const tris = triangles(row);
  if (!/^cn8-plank-[0-5]$/.test(row.name) || !Array.isArray(periodsMm) || periodsMm.length !== 2
    || periodsMm.some(v => !Number.isFinite(v) || v <= 0)) {
    throw new Error(`Missing named plank or measured physical density: ${row.name}`);
  }
  if (!Array.isArray(referenceRepeat) || referenceRepeat.length !== 2
    || referenceRepeat.some(v => !Number.isFinite(v) || v <= 0)) {
    throw new Error('Measured retained-sampler phase reference is required');
  }
  const plank = Number(row.name.slice(-1)), failures = new Set(), samplers = [];
  const axes = projectionAxes(tris, true);
  const materials = descriptor.materials ?? [], groups = descriptor.groups ?? row.groups ?? [];
  if (materials.length !== 3) failures.add('Expected independent X/Y body, Z/Y body and horizontal-cap domains');
  const assigned = new Map();
  for (const tri of tris) {
    const matching = groups.filter(g => g.start <= tri.id * 3 && g.start + g.count >= tri.id * 3 + 3);
    if (materials.length !== 1 && matching.length !== 1) {
      failures.add('Missing or ambiguous triangle material domain'); continue;
    }
    const materialIndex = materials.length === 1 ? 0 : matching[0].materialIndex;
    if (!materials[materialIndex]) { failures.add('Missing triangle material'); continue; }
    if (!assigned.has(materialIndex)) assigned.set(materialIndex, []);
    assigned.get(materialIndex).push(tri);
  }
  for (const [materialIndex, cells] of assigned) {
    const maps = materials[materialIndex].maps ?? {};
    for (const slot of ['map', 'normalMap', 'clearcoatNormalMap']) {
      const texture = maps[slot];
      if (!texture) { failures.add(`Missing active wood sampler: ${materialIndex}/${slot}`); continue; }
      if (texture.channel !== 0 || !Number.isFinite(texture.rotation) || texture.matrixAutoUpdate !== true
        || !Array.isArray(texture.center) || texture.center.some(v => v !== 0)
        || !Array.isArray(texture.repeat) || texture.repeat.length !== 2
        || !Array.isArray(texture.offset) || texture.offset.length !== 2
        || [...texture.repeat, ...texture.offset].some(v => !Number.isFinite(v))
        || texture.repeat.some(v => v <= 0)) {
        failures.add(`Unbound wood sampler transform: ${materialIndex}/${slot}`); continue;
      }
      const c = Math.cos(texture.rotation), s = Math.sin(texture.rotation);
      const low = [Infinity, Infinity], high = [-Infinity, -Infinity];
      const rawLow = [Infinity, Infinity], rawHigh = [-Infinity, -Infinity];
      const effective = uv => [(c * uv[0] + s * uv[1]) * texture.repeat[0] + texture.offset[0],
        (-s * uv[0] + c * uv[1]) * texture.repeat[1] + texture.offset[1]];
      const densities = [], residuals = [], periodResiduals = [];
      for (const tri of cells) {
        for (const vertex of tri.vertices) {
          const raw = [c * vertex.uv[0] + s * vertex.uv[1], -s * vertex.uv[0] + c * vertex.uv[1]];
          for (let axis = 0; axis < 2; axis++) {
            rawLow[axis] = Math.min(rawLow[axis], raw[axis]); rawHigh[axis] = Math.max(rawHigh[axis], raw[axis]);
          }
        }
        const mapped = { ...tri, vertices: tri.vertices.map(v => ({ ...v, uv: effective(v.uv) })) };
        for (const vertex of mapped.vertices) for (let axis = 0; axis < 2; axis++) {
          low[axis] = Math.min(low[axis], vertex.uv[axis]); high[axis] = Math.max(high[axis], vertex.uv[axis]);
        }
        // Landing pass (class G): the U1 axis is derived the way the shipped
        // emitter selects it (projectionAxes), so the accepted chamfer quads
        // are measured in their own published projection.
        const axis = axes.get(tri.id);
        const expectedMaterial = tri.cap ? 2 : axis === 0 ? 0 : 1;
        if (materials.length === 3 && materialIndex !== expectedMaterial) failures.add('Cap/body face assigned to the wrong planar domain');
        const g = gradient(mapped, axis);
        if (!g) { failures.add('Singular physical UV plane'); continue; }
        const period = [1000 / Math.hypot(g.dUds, g.dUdh), 1000 / Math.hypot(g.dVds, g.dVdh)];
        if (period.some(v => !Number.isFinite(v))) { failures.add('Collapsed physical grain density'); continue; }
        densities.push(period);
        periodResiduals.push(...period.map((v, i) => Math.abs(v - periodsMm[i])));
        // A full-repeat estimate divides two tiny bevel-edge differences and
        // amplifies Float32 error. Test the measured edge itself in mm, using
        // the unchanged U2 metric allowance; never enlarge that allowance.
        for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) {
          const p = sub(tri.vertices[b].p, tri.vertices[a].p);
          const uv = sub(mapped.vertices[b].uv, mapped.vertices[a].uv);
          const length = Math.hypot(p[tri.cap ? 0 : axis], p[tri.cap ? 2 : 1]) * 1000;
          const mappedLength = Math.hypot(uv[0] * periodsMm[0], uv[1] * periodsMm[1]);
          const residual = Math.abs(length - mappedLength);
          residuals.push(residual);
          if (residual > UV_ALLOWANCES.pathResidualMm) failures.add('Per-triangle physical grain period differs from the shared source density');
        }
      }
      const domain = [0, 1].map(axis => {
        const min = low[axis], max = high[axis], boundaries = [];
        for (let n = Math.floor(min) + 1; n < max; n++) {
          if (n - min > UV_ALLOWANCES.sharedUV && max - n > UV_ALLOWANCES.sharedUV) boundaries.push(n);
        }
        if (min < -UV_ALLOWANCES.sharedUV || max > 1 + UV_ALLOWANCES.sharedUV || boundaries.length) {
          failures.add(`${materialIndex}/${slot}/${axis}: face interior crosses a tile boundary`);
        }
        const centre = (rawLow[axis] + rawHigh[axis]) / 2;
        const registration = centre * (referenceRepeat[axis] - texture.repeat[axis]);
        const start = rawLow[axis] * texture.repeat[axis] + registration;
        const end = rawHigh[axis] * texture.repeat[axis] + registration;
        const crossing = Math.floor(start) + 1;
        const candidates = crossing < end ? [crossing - start, crossing - end] : [0];
        const shift = candidates.reduce((a, b) => Math.abs(a) <= Math.abs(b) ? a : b);
        const expectedOffset = registration + shift - Math.floor(start + shift);
        if (Math.abs(texture.offset[axis] - expectedOffset) > UV_ALLOWANCES.sharedUV) {
          failures.add(`${materialIndex}/${slot}/${axis}: minimum geometry-derived phase offset differs`);
        }
        return { axis: axis ? 'V' : 'U', min, max, span: max - min, interior_repeat_lines: boundaries,
          unshifted_min: rawLow[axis] * texture.repeat[axis], unshifted_max: rawHigh[axis] * texture.repeat[axis],
          reference_repeat: referenceRepeat[axis], physical_chart_centre: centre, phase_registration: registration,
          registered_min: start, registered_max: end, minimum_phase_translation: shift, expected_offset: expectedOffset };
      });
      const expectedRotation = materialIndex === 2 && plank >= 4 ? Math.PI / 2 : 0;
      if (texture.rotation !== expectedRotation) failures.add('Cap/body mapping has the wrong longitudinal axis');
      samplers.push({ material_index: materialIndex, slot, repeat: texture.repeat, offset: texture.offset,
        rotation: texture.rotation, domain, triangles: cells.length,
        measured_period_mm_min: [0, 1].map(i => Math.min(...densities.map(d => d[i]))),
        measured_period_mm_max: [0, 1].map(i => Math.max(...densities.map(d => d[i]))),
        maximum_extrapolated_period_difference_mm: Math.max(0, ...periodResiduals),
        maximum_edge_residual_mm: Math.max(0, ...residuals) });
    }
    const unknown = Object.keys(maps).filter(k => !['map', 'normalMap', 'clearcoatNormalMap'].includes(k));
    if (unknown.length) failures.add(`Unmeasured wood samplers: ${unknown.join(', ')}`);
  }
  return { name: row.name, tag: 'DERIVED / every consumed triangle, metric planar UV gradient and actual material sampler',
    status: failures.size ? 'FAIL' : 'PASS', triangle_count: tris.length,
    expected_period_mm: { tag: 'DERIVED from MODEL(Star) body-plane density; EST procedural-material transfer', value: periodsMm },
    plane_note: 'The held U1 projection axes define body X/Y or Z/Y planes and horizontal-cap X/Z. Curved bevel projection is retained; no surface geometry or original UV coordinate changes.',
    samplers, allowances: UV_ALLOWANCES, failures: [...failures] };
}

export function measureCoverUV(row, { dimensions, signs, centre, radius, repeatMm }) {
  const { stations, profileCount, outerProfileCount } = row.metadata ?? {};
  if (!stations?.length || !profileCount || !outerProfileCount
    || row.positions?.length !== stations.length * profileCount * 3
    || row.uvs?.length !== stations.length * profileCount * 2) throw new Error(`Missing cover buffers/row layout: ${row.name}`);
  const rows = [], segments = [], failures = [];
  let distance = 0;
  for (let i = 0; i < stations.length; i++) {
    const at = i * profileCount + outerProfileCount - 1;
    const point = [signs[0] * row.positions[at * 3] - dimensions[0] / 2 - centre,
      signs[1] * row.positions[at * 3 + 2] - dimensions[1] / 2 - centre];
    const u = row.uvs[at * 2];
    const acrossSection = Array.from({ length: profileCount }, (_, k) => row.uvs[(i * profileCount + k) * 2]);
    if (acrossSection.some((value) => value !== u)) failures.push(`U differs within section ${i}`);
    if (i) {
      const previous = rows.at(-1).point;
      // Classify from actual outer-boundary coordinates, not station units.
      const arc = [...previous, ...point].every((v) => v >= -1e-7);
      const length = arc ? radius * Math.abs(Math.atan2(point[1], point[0]) - Math.atan2(previous[1], previous[0]))
        : Math.hypot(...sub(point, previous));
      const du = u - rows.at(-1).u;
      distance += length * 1000;
      const residual = length * 1000 - repeatMm * du;
      segments.push({ from: i - 1, to: i, region: arc ? 'arc' : i < stations.length / 2 ? 'left limb' : 'right limb',
        path_mm: length * 1000, delta_u: du,
        repeat_mm: du > 0 ? length * 1000 / du : null,
        repeat_numeric_bound_mm: du > 0 ? UV_ALLOWANCES.pathResidualMm / du : null,
        residual_mm: residual });
      if (!(du > 0) || Math.abs(residual) > UV_ALLOWANCES.pathResidualMm) failures.push(`Path interval ${i - 1}/${i} changes physical repeat`);
    }
    rows.push({ station_index: i, point, u, arclength_mm: distance });
  }
  const firstU = rows[0].u;
  for (const row of rows) {
    row.affine_residual_mm = row.arclength_mm - repeatMm * (row.u - firstU);
    if (Math.abs(row.affine_residual_mm) > UV_ALLOWANCES.pathResidualMm) failures.push(`Cumulative path residual at section ${row.station_index}`);
  }
  const regions = ['left limb', 'arc', 'right limb'].map((region) => {
    const cells = segments.filter((r) => r.region === region);
    const length = cells.reduce((sum, r) => sum + r.path_mm, 0), du = cells.reduce((sum, r) => sum + r.delta_u, 0);
    return { region, segments: cells.length, path_mm: length, delta_u: du, repeat_mm: length / du };
  });
  const distanceAtU = (u) => {
    const i = rows.findIndex((r) => r.u >= u);
    if (i === 0) return rows[0].arclength_mm;
    const a = rows[i - 1], b = rows[i];
    return a.arclength_mm + (b.arclength_mm - a.arclength_mm) * (u - a.u) / (b.u - a.u);
  };
  const repeats = [];
  for (let u = Math.ceil(firstU); u + 1 <= rows.at(-1).u; u++) {
    const length = distanceAtU(u + 1) - distanceAtU(u);
    repeats.push({ u_from: u, u_to: u + 1, measured_repeat_mm: length });
    if (Math.abs(length - repeatMm) > UV_ALLOWANCES.pathResidualMm) failures.push(`Whole texture repeat ${u}/${u + 1} has a different length`);
  }
  return { name: row.name, status: failures.length ? 'FAIL' : 'PASS',
    tag: 'DERIVED / physical path reconstructed from emitted outer-boundary positions and UVs',
    expected_repeat: { value: repeatMm, units: 'mm', tag: 'EST / retained procedural-grain scale' },
    method: 'Actual circle angles on the arc; actual planar edge lengths on each limb. No station-to-distance helper is called. Every interval and cumulative residual is checked; small-interval repeat ratios carry their Float32 conditioning bound.',
    allowances: UV_ALLOWANCES, regions, repeats, segments, rows, failures,
    max_abs_affine_residual_mm: Math.max(...rows.map((r) => Math.abs(r.affine_residual_mm))) };
}

// Count every triangle, including the two cut sections omitted by the U2
// outer-path measurement. Material sampler channels decide the consumed UVs;
// a second coordinate attribute alone cannot hide an incorrect material bind.
export function measureCoverTriangleUV(row, descriptor, { repeatMm }) {
  const { stations, profileCount } = row.metadata ?? {};
  if (!stations?.length || !Number.isInteger(profileCount) || profileCount < 3
    || row.positions?.length !== stations.length * profileCount * 3
    || !(repeatMm > 0)) throw new Error(`Missing cover topology/repeat: ${row.name}`);
  const sets = new Map([[0, row.uvs], [1, row.uv1s]]);
  for (const [channel, values] of sets) if (values && (values.length !== row.positions.length / 3 * 2
    || values.some(v => !Number.isFinite(v)))) throw new Error(`Malformed UV channel ${channel}: ${row.name}`);
  const tris = triangles(row), failures = new Set(), zero = new Set(), primaryZero = [];
  const regionNames = ['skin', 'start cap', 'finish cap'];
  const regions = Object.fromEntries(regionNames.map(name => [name, {
    name, triangle_count: 0, zero_uv_area_triangles: [], material_indices: new Set(),
    consumed_channels: new Set(), max_edge_repeat_residual_mm: 0,
  }]));
  const materialRows = new Map();
  const lastStart = (stations.length - 1) * profileCount;
  for (const tri of tris) {
    const [a, b, c] = tri.vertices;
    if (cross(sub(b.uv, a.uv), sub(c.uv, a.uv)) === 0) primaryZero.push(tri.id);
    const name = tri.indices.every(i => i < profileCount) ? 'start cap'
      : tri.indices.every(i => i >= lastStart) ? 'finish cap' : 'skin';
    const region = regions[name]; region.triangle_count++;
    let materialIndex = 0;
    if (descriptor.materials?.length !== 1) {
      const groups = (descriptor.groups ?? []).filter(g =>
        g.start <= tri.id * 3 && g.start + g.count >= tri.id * 3 + 3);
      if (groups.length !== 1) { failures.add(`Ambiguous or missing material group: ${name}`); continue; }
      materialIndex = groups[0].materialIndex;
    }
    region.material_indices.add(materialIndex);
    const material = descriptor.materials?.[materialIndex];
    const maps = material?.maps ? Object.entries(material.maps) : [];
    if (!material || maps.length === 0) {
      failures.add(`Missing textured cover-class material: ${name}`); continue;
    }
    const channels = new Set();
    for (const [map, texture] of maps) {
      if (!Number.isInteger(texture.channel) || !sets.has(texture.channel) || !sets.get(texture.channel)) {
        failures.add(`Unbound ${map} UV channel on ${name}`); continue;
      }
      channels.add(texture.channel);
      // The captured repeat/offset are part of the active coordinate map.
      // The retained 90 mm cap mapping requires an identity texture transform.
      if (JSON.stringify(texture.repeat) !== '[1,1]' || JSON.stringify(texture.offset) !== '[0,0]'
        || texture.rotation !== 0 || texture.matrixAutoUpdate !== true) failures.add(`Unexpected texture transform: ${map}/${name}`);
    }
    if (!materialRows.has(materialIndex)) materialRows.set(materialIndex, {
      material_index: materialIndex, name: material.name, type: material.type,
      samplers: maps.map(([map, t]) => ({ map, channel: t.channel,
        repeat: t.repeat, offset: t.offset, rotation: t.rotation, matrixAutoUpdate: t.matrixAutoUpdate })),
    });
    for (const channel of channels) {
      region.consumed_channels.add(channel);
      const values = sets.get(channel);
      const uv = tri.indices.map(i => values.slice(i * 2, i * 2 + 2));
      if (cross(sub(uv[1], uv[0]), sub(uv[2], uv[0])) === 0) {
        zero.add(tri.id);
        region.zero_uv_area_triangles.push({ triangle: tri.id, channel });
      }
      if (name !== 'skin') for (const [i, j] of [[0, 1], [1, 2], [2, 0]]) {
        const physical = Math.hypot(...sub(tri.vertices[j].p, tri.vertices[i].p)) * 1000;
        const texture = Math.hypot(...sub(uv[j], uv[i])) * repeatMm;
        const residual = Math.abs(physical - texture);
        region.max_edge_repeat_residual_mm = Math.max(region.max_edge_repeat_residual_mm, residual);
        if (residual > UV_ALLOWANCES.pathResidualMm) failures.add(`Cap-plane metric repeat differs: ${name}`);
      }
    }
  }
  for (const name of ['start cap', 'finish cap']) if (regions[name].triangle_count !== profileCount - 2) {
    failures.add(`Cap triangle coverage differs: ${name}`);
  }
  if (zero.size) failures.add('ZERO_AREA_CONSUMED_UV_TRIANGLE');
  return { name: row.name, tag: 'DERIVED / every indexed triangle and actual material sampler channel',
    status: failures.size ? 'FAIL' : 'PASS', triangle_count: tris.length,
    cap_triangle_count: regions['start cap'].triangle_count + regions['finish cap'].triangle_count,
    zero_uv_area_triangles: [...zero], zero_uv_area_triangle_count: zero.size,
    primary_uv_zero_area_triangles: primaryZero,
    primary_uv_note: 'The skin UV remains unchanged. Unused primary-UV diagnostics on cap faces are retained; acceptance uses every actual texture sampler channel.',
    expected_cap_repeat: { value: repeatMm, unit: 'mm', tag: 'EST / retained procedural-grain repeat' },
    materials: [...materialRows.values()],
    regions: Object.values(regions).map(r => ({ ...r, material_indices: [...r.material_indices],
      consumed_channels: [...r.consumed_channels] })),
    allowances: UV_ALLOWANCES, failures: [...failures] };
}
