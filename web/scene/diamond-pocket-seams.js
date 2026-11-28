// Copyright (c) Meta Platforms, Inc. and affiliates.

// The exact seam compiler is a build tool. This guarded leaf only validates
// and applies lossless carriers. Missing or stale inputs refuse preparation.
import * as data from './diamond-pocket-seams-data.js';
import * as codec from './pocket-seam-codec.js';

const decoded = new Map();
function refuse(code) {
  const error = new Error('POCKET_SEAM_' + code); error.code = 'POCKET_SEAM_' + code; throw error;
}
export function validate(version) {
  if (typeof codec.applyRuntimePatch !== 'function'
    || typeof codec.decodePatch !== 'function' || typeof codec.meshMap !== 'function'
    || typeof codec.signature !== 'function') refuse('MODULE_CAPABILITY');
  const artifact = data.artifact;
  if (!artifact || artifact.schema !== codec.SCHEMA || artifact.source_version !== version
    || !/^[0-9a-f]{64}$/.test(version) || !Array.isArray(artifact.entries) || artifact.entries.length !== 3) refuse('ARTIFACT_VERSION');
  return artifact;
}
export function apply(group, G, version) {
  const artifact = validate(version), key = codec.signature(G);
  const entry = artifact.entries.find(row => row.key === key);
  if (!entry || entry.patches.length !== 7) refuse('TABLE_ENTRY');
  // Source drift and full buffer identities are checked at build time and
  // in CI. The version above binds this carrier to those exact builders.
  if (!decoded.has(key)) decoded.set(key, entry.patches.map(row => codec.decodePatch(row)));
  const patches = decoded.get(key), meshes = codec.meshMap(group, patches.map(row => row.mesh)), ready = [];
  try {
    for (const patch of patches) ready.push({ mesh: meshes.get(patch.mesh),
      geometry: codec.applyRuntimePatch(meshes.get(patch.mesh), patch) });
  } catch (error) { for (const row of ready) row.geometry.dispose(); throw error; }
  // Every population owns new meshes. Cached tables retain the meshes
  // already built; no table-global completion flag can skip a later build.
  for (const row of ready) { const previous = row.mesh.geometry; row.mesh.geometry = row.geometry; previous.dispose(); }
}
