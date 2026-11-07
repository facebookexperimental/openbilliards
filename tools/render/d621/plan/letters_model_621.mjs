// Copyright (c) Meta Platforms, Inc. and affiliates.

// FIX1 letters symmetry witness. Quarantined OBJ data stay in memory only.
import {readFileSync, readdirSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {measureCushionGeometry, scalarReadings, SAMPLING_LAW, LAW_SHA256} from './letters_sampling_621.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');

function modelMeshes(directory) {
  const hash = createHash('sha256');
  const meshes = [];
  for (const file of readdirSync(directory).filter(name => name.toLowerCase().endsWith('.obj')).sort()) {
    const bytes = readFileSync(path.join(directory, file));
    hash.update(file + ':' + sha(bytes) + '\n');
    const match = /^node_\d+_(pool_rubber0[1-6]|pool_top)\.obj$/.exec(file);
    if (!match) continue;
    const vertices = [], triangles = [];
    // DERIVED: identical 1e-7 metre rounding to the browser extractor, then
    // metres to millimetres; MODEL Z-up maps to the letters instrument's Y-up.
    for (const line of bytes.toString('utf8').split(/\r?\n/)) {
      if (line.startsWith('v ')) {
        const xyz = line.trim().split(/\s+/).slice(1).map(Number);
        vertices.push([xyz[0], xyz[2], xyz[1]].map(v => Math.round(v * 1e7) / 1e7 * 1000));
      } else if (line.startsWith('f ')) {
        const indices = line.trim().split(/\s+/).slice(1).map(token => Number(token.split('/')[0]));
        const indices0 = indices.map(i => i > 0 ? i - 1 : vertices.length + i);
        for (let i = 1; i < indices0.length - 1; i++) {
          for (const vertex of [indices0[0], indices0[i], indices0[i + 1]]) triangles.push(...vertices[vertex]);
        }
      }
    }
    const name = match[1] === 'pool_top' ? 'dm-bed-cloth' : 'dm-cushion-' + match[1].slice(-2);
    meshes.push({name, tris: Float64Array.from(triangles)});
  }
  return {meshes, digest: hash.digest('hex')};
}

export function measureModelLetters(directory, size) {
  const {meshes, digest} = modelMeshes(directory);
  const manifest = JSON.parse(readFileSync(new URL('../law/model_manifest_621.json', import.meta.url)));
  if (digest !== manifest.set_sha256) throw new Error('letters MODEL OBJ set differs from the committed manifest');
  // DERIVED: one purchased 8-ft reference, evaluated without scaling for each
  // size comparison. No geometry is saved, returned, or used as a target.
  return {
    tag: 'MODEL', size_comparison: size, model_obj_set_sha256: digest,
    law_sha256: LAW_SHA256, instrument: 'letters_sampling_621.mjs',
    note: SAMPLING_LAW.symmetry,
    deciding_method_read: scalarReadings(measureCushionGeometry(meshes, [], SAMPLING_LAW.deciding)),
    legacy_secondary_read: scalarReadings(measureCushionGeometry(meshes, [], 'legacy')),
    pre_c9_secondary_read: scalarReadings(measureCushionGeometry(meshes, [], 'pre-c9-facing')),
    model_is_a_gate_target: false,
  };
}
