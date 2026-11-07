// Copyright (c) Meta Platforms, Inc. and affiliates.

// Runtime transport is an identity-keyed lookup. The offline solver is not
// part of the browser graph, including on a mismatch or a cleared cache.
import * as carriers from './cn8transport-data.js';
import * as identity from './cn8transport-core.js';
import * as codec from './cn8transport-codec.js';

const decoded = new Map();
let decodes = 0, hits = 0;
export function clearDecoded() { decoded.clear(); return diagnostics(); }
export function diagnostics() { return { decoded_entries: decoded.size, decodes, hits, ui_solve_calls: 0 }; }

function materialize(entry) {
  return entry.results.map(row => ({ name: row.name,
    coefficients: row.coefficients ? codec.decode(row.coefficients) : null,
    color: row.color ? codec.decode(row.color) : null,
    field: row.field ? Object.fromEntries(Object.entries(row.field).map(([name, value]) => [name,
      value?.codec ? codec.decode(value) : value])) : null }));
}
function copyField(field) {
  return Object.fromEntries(Object.entries(field).map(([name, value]) => [name,
    ArrayBuffer.isView(value) || Array.isArray(value) ? value.slice() : value]));
}
function refuse(group, code, detail) {
  if (group) group.userData.cn8TransportArtifact = { status: 'REFUSED', code, ...detail, ui_solve_calls: 0 };
  const error = new Error(code + ': ' + JSON.stringify(detail)); error.code = code; throw error;
}

export function validate(solverVersion, group = null) {
  // Namespace capability keeps both directions of the deploy boundary
  // valid. The legacy export retains FIX9; current callers select by their
  // complete source version. Sharing results is checked offline byte-wise.
  const choices = [carriers.currentArtifact, carriers.artifact];
  const artifact = choices.find(value => value?.solver_version === solverVersion)
    ?? carriers.currentArtifact ?? carriers.artifact;
  if (!artifact || !Array.isArray(artifact.entries)) {
    refuse(group, 'CN8_TRANSPORT_ARTIFACT_MISSING', { available: !!artifact });
  }
  if (!identity.transportIdentity || !identity.applyLinerCoefficients || !Array.isArray(identity.CORNERS)
    || !codec.decode || artifact.solver_version !== solverVersion) {
    refuse(group, 'CN8_TRANSPORT_ARTIFACT_VERSION_MISMATCH', { expected: solverVersion,
      available: artifact?.solver_version ?? null });
  }
  return artifact;
}

export function apply(group, geometry, constants, clothMaterial, solverVersion) {
  const start = performance.now(), artifact = validate(solverVersion, group);
  const measured = identity.transportIdentity(group, geometry, constants, solverVersion);
  const entry = artifact.entries.find(row => row.key === measured.key);
  if (!entry) refuse(group, 'CN8_TRANSPORT_ARTIFACT_KEY_MISMATCH', {
    actual: measured.key, available: artifact.entries.map(row => row.key), elapsed_ms: performance.now() - start });
  const cached = decoded.has(measured.key);
  if (!cached) { decoded.set(measured.key, materialize(entry)); decodes++; } else hits++;
  const meshes = new Map(); group.traverse(object => { if (object.isMesh) meshes.set(object.name, object); });
  for (const row of decoded.get(measured.key)) {
    const mesh = meshes.get(row.name), color = mesh?.geometry.getAttribute('color');
    if (!color) refuse(group, 'CN8_TRANSPORT_RECEIVER_MISSING', { name: row.name });
    if (row.coefficients) {
      identity.applyLinerCoefficients(color, row.coefficients, clothMaterial.color);
      mesh.geometry.userData.cn8Field = copyField(row.field);
      const bag = meshes.get(row.name.replace('cn8-net-', 'cn8-fallbag-'));
      if (!bag || bag.geometry.getAttribute('color') !== color) {
        refuse(group, 'CN8_TRANSPORT_CAVITY_BUFFER_IDENTITY', { name: row.name });
      }
    } else {
      if (color.array.length !== row.color.length) refuse(group, 'CN8_TRANSPORT_RECEIVER_LENGTH', { name: row.name });
      color.array.set(row.color); color.needsUpdate = true;
    }
  }
  group.userData.cn8Occluders = { tag: 'DERIVED from completed opaque table meshes',
    origin: artifact.query_law, members: measured.members };
  group.userData.cn8TransportArtifact = { status: 'PASS', tag: 'DERIVED / complete-solid transport artifact',
    key: measured.key, solver_version: solverVersion, cached, ...diagnostics(),
    receivers: entry.results.length + entry.results.filter(row => row.coefficients).length,
    lookup_ms: performance.now() - start,
    tree_ms: 0, liner_solve_ms: [0, 0, 0, 0], artifact_source: 'docs/geometry/cn8-pocket-d3-transport.json' };
  return group.userData.cn8TransportArtifact;
}
