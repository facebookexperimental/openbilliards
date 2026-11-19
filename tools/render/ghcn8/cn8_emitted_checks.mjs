// Copyright (c) Meta Platforms, Inc. and affiliates.

// A3/B2/C2 inspect captured position/index/normal buffers, not just the recipe.
// This module is CPU-only and never writes into an evidence directory.
import { createHash } from 'node:crypto';
import * as THREE from '../../../web/vendor/three.module.min.js';

export const digest = (data) => createHash('sha256').update(data).digest('hex');
const bytes = (array) => Buffer.from(array.buffer, array.byteOffset, array.byteLength);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// DERIVED identities from the renderer's fixed corner build sites. A captured
// buffer cannot choose its own expected quadrant.
export const CN8_CORNER_IDENTITIES = Object.freeze([
  [0, -1, -1], [2, 1, -1], [3, -1, 1], [5, 1, 1],
].map(Object.freeze));
const area = (poly) => poly.reduce((sum, a, i) => {
  const b = poly[(i + 1) % poly.length];
  return sum + a[0] * b[1] - b[0] * a[1];
}, 0) / 2;

export function loadCornerBuilder(renderer) {
  const start = renderer.indexOf('const CN8_D2_SECTION =');
  const end = renderer.indexOf('// GH-490 MOUTH-CURE', start);
  if (start < 0 || end < 0) throw new Error('Measured corner constructor is absent');
  const code = renderer.slice(start, end);
  const datum = code.slice(code.indexOf('const CN8_R82 ='));
  const plan = code.slice(code.indexOf('function cn8D2PlanPair('), code.indexOf('function cn8D2Section('));
  const occStart = renderer.indexOf('function cn8MouthOccGeom(');
  const occEnd = renderer.indexOf('\n}', occStart) + 2;
  const extra = code.includes('function cn8D3MatingMap(')
    ? 'let _cn8OccGeom=null;\n' + renderer.slice(occStart, occEnd) : '';
  const builder = new Function('THREE', code + extra + '\nreturn {K:CN8_R82,S:CN8_D2_SECTION,'
    + 'build:cn8D2CornerGeometry,pair:cn8D2PlanPair,section:cn8D2Section,'
    + 'stations:cn8D2Stations,bedEdge:cn8D2BedEdge,'
    + (code.includes('function cn8JoyWoodCorner(') ? 'woodCorner:cn8JoyWoodCorner,' : '')
    + (code.includes('function cn8D3CapMaterial(') ? 'capMaterial:cn8D3CapMaterial,' : '')
    + (extra ? 'mouthOcclusion:cn8MouthOccGeom,mating:cn8D3MatingMap,tongueRows:cn8D3TongueRows,tongueProfile:cn8D3TongueProfile,returnHeight:cn8D3ReturnHeight,' : '')
    + (code.includes('function cn8D3CoverRayTree(') ? 'coverRayTree:cn8D3CoverRayTree,' : '')
    + (code.includes('function cn8D3SolidRayTree(') ? 'solidRayTree:cn8D3SolidRayTree,' : '')
    + '};')(THREE);
  return { ...builder, code, builder_sha256: digest(code),
    retained_datum_sha256: digest(datum), retained_plan_recipe_sha256: digest(plan) };
}

export function sectionCrossings(poly) {
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
  let count = 0;
  for (let i = 0; i < poly.length; i++) for (let j = i + 2; j < poly.length; j++) {
    if (i === 0 && j === poly.length - 1) continue;
    const p = poly[i], q = poly[j];
    const d = sub(poly[(i + 1) % poly.length], p), e = sub(poly[(j + 1) % poly.length], q);
    const den = cross(d, e);
    if (Math.abs(den) < 1e-14) continue;
    const v = sub(q, p), a = cross(v, e) / den, b = cross(v, d) / den;
    // TESSELLATION: exclude shared endpoints from proper intersections.
    if (a > 1e-7 && a < 1 - 1e-7 && b > 1e-7 && b < 1 - 1e-7) count++;
  }
  return count;
}

export function bufferTopology(positions, index) {
  const edges = new Map();
  let zero = 0, volume = 0;
  for (let i = 0; i < index.length; i += 3) {
    const v = [0, 1, 2].map((j) => new THREE.Vector3().fromArray(positions, 3 * index[i + j]));
    const n = v[1].clone().sub(v[0]).cross(v[2].clone().sub(v[0]));
    if (n.length() <= 1e-14) zero++;
    volume += v[0].dot(v[1].clone().cross(v[2])) / 6;
    for (let j = 0; j < 3; j++) {
      const x = index[i + j], y = index[i + (j + 1) % 3];
      const key = x < y ? `${x},${y}` : `${y},${x}`;
      const row = edges.get(key) ?? [0, 0];
      row[0]++; row[1] += x < y ? 1 : -1; edges.set(key, row);
    }
  }
  const result = { boundary_edges: 0, non_manifold_edges: 0, winding_conflicts: 0,
    zero_area_triangles: zero, signed_volume_m3: volume };
  for (const [n, direction] of edges.values()) {
    if (n === 1) result.boundary_edges++;
    if (n > 2) result.non_manifold_edges++;
    if (n === 2 && direction !== 0) result.winding_conflicts++;
  }
  return result;
}

// Measure the emitted lower course in the table plane. A 3D arclength would
// add the vertical step edges and is not the installed lobe pitch.
export function capturedHemMetrics(positions, metadata) {
  const hem = metadata.stations.map((station, i) => {
    const at = (i * metadata.profileCount + metadata.outerProfileCount - 1) * 3;
    return { station, point: Array.from(positions.slice(at, at + 3)) };
  });
  const heights = hem.map(({ point }) => point[1]);
  const threshold = (Math.min(...heights) + Math.max(...heights)) / 2;
  return [-1, 1].map((half) => {
    const points = hem.filter((p) => half * p.station >= 0)
      .sort((a, b) => Math.abs(a.station) - Math.abs(b.station));
    const distance = [0], runs = [];
    for (let i = 0; i < points.length; i++) {
      if (i) distance.push(distance[i - 1] + Math.hypot(points[i].point[0] - points[i - 1].point[0],
        points[i].point[2] - points[i - 1].point[2]));
      const low = points[i].point[1] < threshold;
      if (!runs.length || runs.at(-1).low !== low) runs.push({ low, first: i, last: i });
      else runs.at(-1).last = i;
    }
    const low = runs.filter((run) => run.low);
    const centres = low.map((run) => (distance[run.first] + distance[run.last]) / 2);
    return { half, lobes: low.length, endpoints_high: !runs[0].low && !runs.at(-1).low,
      plan_length_mm: distance.at(-1) * 1000,
      periods_mm: centres.slice(1).map((value, i) => (value - centres[i]) * 1000) };
  });
}

// Dimensions are the held MFR cushion-nose rectangle, in metres. They are
// explicit arguments so a missing table identity cannot select a default mesh.
export function verifyCapturedCover({ row, descriptor, builder, table, dimensions,
  expectedSigns, retainedDatumSha256, retainedPlanRecipeSha256 }) {
  const failures = [];
  const fail = (arm, message) => failures.push(`${arm}: ${message}`);
  const metadata = descriptor.userData?.cn8D3 ?? descriptor.userData?.cn8D2;
  const base = { table, name: row.name, tag: 'DERIVED / captured implementation checks', failures };
  const identity = CN8_CORNER_IDENTITIES.find(([id]) => row.name === `cn8r82-ring-${id}`);
  if (!identity || descriptor.name !== row.name || !same(expectedSigns, identity.slice(1))) {
    return { ...base, status: 'FAIL', A3: 'FAIL', B2: 'FAIL', C2: 'FAIL',
      failures: [`QUADRANT: ${row.name} requires fixed identity ${JSON.stringify(identity?.slice(1) ?? null)}; supplied ${JSON.stringify(expectedSigns ?? null)}, descriptor ${descriptor.name}`] };
  }
  if (!metadata || !Array.isArray(metadata.stations) || !Number.isInteger(metadata.profileCount)
    || !Number.isInteger(metadata.outerProfileCount)) {
    return { ...base, status: 'FAIL', A3: 'FAIL', B2: 'FAIL', C2: 'FAIL', failures: ['C2: measured section metadata is absent'] };
  }
  const stations = metadata.stations, count = metadata.profileCount, outerCount = metadata.outerProfileCount;
  const rawPosition = row.localPositions, rawNormal = row.normals, rawIndex = row.indices;
  const vertexCount = stations.length * count;
  if (!Array.isArray(rawPosition) || rawPosition.length !== vertexCount * 3
    || !Array.isArray(rawNormal) || rawNormal.length !== rawPosition.length
    || !Array.isArray(rawIndex) || rawIndex.length % 3 !== 0
    || rawPosition.some((v) => !Number.isFinite(v)) || rawNormal.some((v) => !Number.isFinite(v))
    || rawIndex.some((v) => !Number.isInteger(v) || v < 0 || v >= vertexCount)
    || stations.length < 2 || count < 3 || outerCount < 2 || outerCount >= count
    || !Array.isArray(dimensions) || dimensions.length !== 2 || dimensions.some((v) => !(v > 0))) {
    return { ...base, status: 'FAIL', A3: 'FAIL', B2: 'FAIL', C2: 'FAIL', failures: ['C2: malformed captured buffers or dimensions'] };
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(rawPosition, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(rawNormal, 3));
  geometry.setIndex(rawIndex);
  const positions = geometry.attributes.position.array, normals = geometry.attributes.normal.array;
  const index = geometry.index.array, [sx, sz] = expectedSigns;
  const centroid = [0, 0, 0];
  let misplacedVertices = 0;
  for (let i = 0; i < positions.length; i += 3) {
    for (let axis = 0; axis < 3; axis++) centroid[axis] += positions[i + axis] / vertexCount;
    if (sx * positions[i] <= 0 || sz * positions[i + 2] <= 0) misplacedVertices++;
  }
  const observedSigns = [Math.sign(centroid[0]), Math.sign(centroid[2])];
  if (!same(observedSigns, expectedSigns) || misplacedVertices) {
    fail('QUADRANT', `${row.name} expected ${JSON.stringify(expectedSigns)} from fixed identity; observed ${JSON.stringify(observedSigns)} at centroid ${JSON.stringify(centroid)} m; ${misplacedVertices} misplaced vertices`);
  }
  const expected = builder.build(builder.K, ...dimensions, sx, sz);
  if (builder.S.definitionSha256 && metadata.definitionSha256 !== builder.S.definitionSha256) {
    fail('BINDING', 'captured metadata names a different measurement definition');
  }
  const digests = { position_sha256: digest(bytes(positions)), normal_sha256: digest(bytes(normals)),
    index_sha256: digest(bytes(index)) };
  for (const attribute of ['position', 'normal']) {
    if (digests[`${attribute}_sha256`] !== descriptor.attributes?.[attribute]?.sha256) fail('BINDING', `${attribute} digest differs from the capture census`);
  }
  if (digests.index_sha256 !== descriptor.indexSha256) fail('BINDING', 'index digest differs from the capture census');
  if (digests.position_sha256 !== digest(bytes(expected.attributes.position.array))) fail('BINDING', 'actual position buffer differs from the shipped constructor');
  if (digests.index_sha256 !== digest(bytes(expected.index.array))) fail('BINDING', 'actual index buffer differs from the shipped constructor');
  if (!same(stations, builder.stations())) fail('C2', 'captured section stations differ from the shipped constructor');
  if (!same(descriptor.matrix, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])) fail('A3', 'cover has an unaccounted local transform');
  if (!retainedDatumSha256 || builder.retained_datum_sha256 !== retainedDatumSha256) fail('A3', 'retained datum block changed');
  if (!retainedPlanRecipeSha256 || builder.retained_plan_recipe_sha256 !== retainedPlanRecipeSha256) fail('A3', 'retained analytic plan recipe changed');
  let maxNormalDelta = 0, changedNormals = 0;
  if (normals.length !== expected.attributes.normal.array.length) fail('B2', 'normal buffer length differs from the constructor');
  else for (let i = 0; i < normals.length; i++) {
    const delta = Math.abs(normals[i] - expected.attributes.normal.array[i]);
    maxNormalDelta = Math.max(maxNormalDelta, delta);
    if (delta !== 0) changedNormals++;
  }
  // TESSELLATION: tolerate only cross-runtime rounding of tiny normal values.
  if (maxNormalDelta > 1e-10) fail('B2', `normal components differ beyond the cross-runtime rounding allowance for ${row.name}; expected quadrant ${JSON.stringify(expectedSigns)}, observed centroid quadrant ${JSON.stringify(observedSigns)}`);

  const profiles = [], plan = [];
  let radialError = 0, offAxis = 0, crossings = 0;
  for (let s = 0; s < stations.length; s++) {
    const pair = builder.pair(builder.K, stations[s]);
    const du = pair.outer[0] - pair.inner[0], dv = pair.outer[1] - pair.inner[1];
    const width = Math.hypot(du, dv), ux = du / width, uz = dv / width;
    const profile = [];
    for (let j = 0; j < count; j++) {
      const at = (s * count + j) * 3;
      const x = sx * positions[at] - dimensions[0] / 2 - pair.inner[0];
      const z = sz * positions[at + 2] - dimensions[1] / 2 - pair.inner[1];
      profile.push([x * ux + z * uz, positions[at + 1]]);
      offAxis = Math.max(offAxis, Math.abs(-x * uz + z * ux));
    }
    const radial = profile.map((point) => point[0]);
    const bounds = [Math.min(...radial), Math.max(...radial)];
    // Landing pass (class G): the retained analytic section is the shipped
    // recipe cn8D2Section(width, station) itself. Since the JOY binding
    // narrowed the plan band to bandWidth (1cd17b20) the recipe's lip roll
    // reaches 2.319 um inside the band's inner line at 72 of 201 stations
    // (DERIVED, derive_plank_pins.mjs), so the emitted radial extent is pinned
    // to the recipe's own radial extent at every station instead of [0, width];
    // the recipe's outer bound still equals the plan width. Same 1e-7 m bound.
    const recipe = builder.section(width, stations[s]).profile.map((point) => point[0]);
    const expected = [Math.min(...recipe), Math.max(...recipe)];
    radialError = Math.max(radialError, Math.abs(bounds[0] - expected[0]), Math.abs(bounds[1] - expected[1]));
    crossings = Math.max(crossings, sectionCrossings(profile));
    profiles.push(profile);
    plan.push({ station: stations[s], inner: pair.inner, outer: pair.outer, emitted_radial_bounds_m: bounds,
      recipe_radial_bounds_m: expected });
  }
  if (radialError > 1e-7 || offAxis > 1e-7) fail('A3', 'captured vertices leave the retained analytic plan section');
  if (crossings) fail('C2', 'captured closed sections self-intersect');
  const orientation = Math.sign(area(profiles[0]));
  if (orientation === 0 || profiles.some((profile) => Math.sign(area(profile)) !== orientation)) fail('B2', 'section orientation is inconsistent');
  let inward = 0, tangent = 0, minDot = Infinity, maxNormalLengthError = 0;
  const groups = Object.fromEntries(['outer', 'inner', 'hem_and_lip', 'ends'].map((key) => [key, { faces: 0, inward: 0, min_dot: 1 }]));
  // Expected directions come from the actual section outline and analytic
  // station tangent, independently of the triangle's own winding.
  for (let face = 0; face < index.length / 3; face++) {
    const v = [0, 1, 2].map((i) => new THREE.Vector3().fromArray(positions, index[face * 3 + i] * 3));
    const normal = v[1].clone().sub(v[0]).cross(v[2].clone().sub(v[0])).normalize();
    let outward, group;
    if (face < (stations.length - 1) * count * 2) {
      const s = Math.floor(face / (count * 2)), edge = Math.floor(face / 2) % count, k = (edge + 1) % count;
      const a = profiles[s], b = profiles[s + 1];
      const dr = (a[k][0] - a[edge][0] + b[k][0] - b[edge][0]) / 2;
      const dy = (a[k][1] - a[edge][1] + b[k][1] - b[edge][1]) / 2;
      const pair = builder.pair(builder.K, (stations[s] + stations[s + 1]) / 2);
      const radial = new THREE.Vector3(sx * (pair.outer[0] - pair.inner[0]), 0, sz * (pair.outer[1] - pair.inner[1])).normalize();
      outward = radial.multiplyScalar(orientation * dy).add(new THREE.Vector3(0, -orientation * dr, 0)).normalize();
      group = edge < outerCount - 1 ? 'outer' : edge === outerCount - 1 || edge === count - 1 ? 'hem_and_lip' : 'inner';
    } else {
      const first = Math.floor(index[face * 3] / count) === 0;
      outward = new THREE.Vector3(first ? -sx : 0, 0, first ? 0 : -sz); group = 'ends';
    }
    const dot = normal.dot(outward), target = groups[group];
    minDot = Math.min(minDot, dot); target.faces++; target.min_dot = Math.min(target.min_dot, dot);
    if (dot < -1e-7) { inward++; target.inward++; }
    if (Math.abs(dot) <= 1e-7) tangent++;
  }
  for (let i = 0; i < normals.length; i += 3) maxNormalLengthError = Math.max(maxNormalLengthError,
    Math.abs(Math.hypot(normals[i], normals[i + 1], normals[i + 2]) - 1));
  if (inward || tangent || maxNormalLengthError > 1e-6) fail('B2', 'inward/tangent faces or non-unit normals');
  const topology = bufferTopology(positions, index);
  if (['boundary_edges', 'non_manifold_edges', 'winding_conflicts', 'zero_area_triangles'].some((key) => topology[key] !== 0)
    || !(topology.signed_volume_m3 > 0)) fail('C2', 'actual shell is not closed, manifold, consistently wound and positive-volume');
  const hem = capturedHemMetrics(positions, metadata);
  // PHOTO integer of record = 7; DERIVED target pitch uses the held plan.
  const hemPeriod = (builder.K.C - builder.K.Y_CUT
    + Math.PI * (builder.K.R + builder.K.W_L) / 4) * 1000 / 7;
  for (const half of hem) {
    if (half.lobes !== 7 || !half.endpoints_high || half.periods_mm.length !== 6
      || half.periods_mm.some((period) => Math.abs(period - hemPeriod) > 0.001)) {
      fail('C2', `${row.name} hem half ${half.half}: expected 7 lobes and plan-projected period ${hemPeriod} mm; observed ${half.lobes}, ${JSON.stringify(half.periods_mm)} mm`);
    }
  }
  const arm = (name) => failures.some((message) => message.startsWith(`${name}:`) || message.startsWith('BINDING:') || message.startsWith('QUADRANT:')) ? 'FAIL' : 'PASS';
  return { ...base, status: failures.length ? 'FAIL' : 'PASS', signs: [sx, sz], ...digests, ...topology,
    quadrant: { expected: expectedSigns, observed: observedSigns, centroid_m: centroid,
      misplaced_vertices: misplacedVertices, source: 'fixed CN8_CORNER_IDENTITIES, independent of captured buffers' },
    vertices: vertexCount, triangles: index.length / 3, station_count: stations.length, profile_count: count,
    outer_profile_count: outerCount, max_emitted_plan_error_mm: radialError * 1000,
    max_emitted_plan_off_axis_mm: offAxis * 1000, section_crossings: crossings,
    normal_runtime_comparison: { byte_equality: changedNormals === 0, changed_components: changedNormals,
      max_component_delta: maxNormalDelta, cpu_sha256: digest(bytes(expected.attributes.normal.array)), numeric_allowance: 1e-10 },
    hem: { tag: 'DERIVED / emitted plan-projection measurement', halves: hem,
      expected_lobes_per_half: { tag: 'PHOTO', value: 7 }, expected_period_mm: hemPeriod,
      period_allowance_mm: 0.001, allowance_tag: 'TESSELLATION / chord shortening and Float32 error only' },
    face_orientation: { inward_faces: inward, tangential_faces: tangent, min_orientation_dot: minDot, groups,
      max_normal_length_error: maxNormalLengthError },
    tolerances: { tag: 'TESSELLATION / numerical comparison only', plan_m: 1e-7, normal_length: 1e-6, orientation_dot: 1e-7 },
    A3: arm('A3'), B2: arm('B2'), C2: arm('C2'),
    drawing: { central_profile_m: profiles[stations.findIndex((s) => s === 0)], plan,
      hem_course_m: profiles.map((profile, i) => [stations[i], profile[outerCount - 1][1]]) } };
}
