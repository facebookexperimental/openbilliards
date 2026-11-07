// Copyright (c) Meta Platforms, Inc. and affiliates.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from '../../../web/vendor/three.module.min.js';
import * as core from '../../../web/scene/cn8transport-core.js';
import * as codec from '../../../web/scene/cn8transport-codec.js';
import * as runtime from '../../../web/scene/cn8transport.js';
import { currentArtifact as artifact } from '../../../web/scene/cn8transport-data.js';
import { artifact as legacyArtifact } from '../../../web/scene/cn8transport-data.js';
import { serialized } from './gen_transport_artifact.mjs';
import { assertProductionSampling, assertReviewVertex593 } from './cn8_occlusion_checks.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
test('V4 the legacy carrier reconstructs the exact FIX9 bytes and shares only verified identical results', () => {
  const descriptor = JSON.parse(fs.readFileSync(new URL('../../../docs/geometry/cn8-pocket-d3-transport-compat.json', import.meta.url), 'utf8'));
  assert.equal(sha(JSON.stringify(legacyArtifact) + '\n'), descriptor.source_artifact_sha256);
  const currentMatches = sha(JSON.stringify(artifact.entries[0].results)) === descriptor.result_bindings[0].sha256;
  assert.equal(legacyArtifact.entries[0].results, currentMatches
    ? artifact.entries[0].results : artifact.compatibility_results.rows[0].results);
  assert.notEqual(legacyArtifact.solver_version, artifact.solver_version);
  assert.equal(runtime.validate(legacyArtifact.solver_version), legacyArtifact);
  assert.equal(runtime.validate(artifact.solver_version), artifact);
  const changed = structuredClone(artifact);
  if (changed.compatibility_results) changed.compatibility_results.rows[0].results.pop();
  else changed.entries[0].results.pop();
  assert.throws(() => serialized(changed), /CN8_TRANSPORT_COMPAT_RESULTS_MISMATCH/);
});
test('new geometry may have a different solve while the frozen compatibility payload stays exact', () => {
  const changed = structuredClone(artifact);
  changed.compatibility_results ??= {
    source_artifact_sha256: sha(JSON.stringify(legacyArtifact) + '\n'),
    rows: legacyArtifact.entries.map(entry => ({ aliases: entry.aliases, results: structuredClone(entry.results) })),
  };
  changed.entries[0].results.pop(); // TEST: an independently changed current result cannot replace FIX9's.
  const bytes = serialized(changed);
  assert.match(bytes.module, /currentArtifact\.compatibility_results\.rows\[0\]\.results/);
  assert.equal(sha(JSON.stringify(changed.compatibility_results.rows[0].results)),
    sha(JSON.stringify(legacyArtifact.entries[0].results)));
  delete changed.compatibility_results;
  assert.throws(() => serialized(changed), /CN8_TRANSPORT_COMPAT_RESULTS_MISMATCH/);
});
function fixture() {
  const group = new THREE.Group(), mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  mesh.name = 'adjacent solid'; group.add(mesh);
  return { group, mesh, geometry: { L: 2.54, W: 1.26, pockets: [], kernel: { sidePocketRadius: .05 } } };
}

test('SHA-256 matches the standard digest across block/padding boundaries and typed subviews', () => {
  for (const length of [0, 1, 55, 56, 63, 64, 65, 119, 120, 127, 128, 129, 1048576]) {
    const bytes = Uint8Array.from({ length: length + 6 }, (_, i) => (i * 17 + 29) & 255).subarray(3, length + 3);
    assert.equal(core.sha256(bytes), sha(bytes));
  }
  assert.equal(core.sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
test('lossless carriers preserve Float32/Float64 bits, signed zero and long word runs', () => {
  for (const Type of [Float32Array, Float64Array, Uint8Array, Uint16Array, Uint32Array]) {
    const values = new Type(257); values[0] = 1; values[1] = -0; values[2] = .12345678901234567; values[256] = 17;
    const got = codec.decode(codec.encode(values));
    assert.deepEqual(new Uint8Array(got.buffer), new Uint8Array(values.buffer));
  }
});
test('corrupt or truncated carriers refuse before reaching receiver buffers', () => {
  const row = codec.encode(new Float32Array(300));
  assert.throws(() => codec.decode({ ...row, sha256: '0'.repeat(64) }), /HASH_MISMATCH/);
  assert.throws(() => codec.decode({ ...row, length: 301 }), /INVALID_CARRIER/);
  assert.throws(() => codec.decode({ ...row, data: row.data.slice(0, -4) }), /RUN_ALIGNMENT|RUN_LENGTH|INCOMPLETE_RUNS/);
});
test('the recipe key covers topology, membership, material domains and solver version, without runtime positions', () => {
  const measure = ({ group, geometry }) => core.transportIdentity(group, geometry, {}, 'a'.repeat(64));
  const before = measure(fixture());
  for (const mutate of [
    f => { f.mesh.geometry.index.array[0] = 2; },
    f => { f.mesh.visible = false; },
    f => { f.mesh.material.opacity = .5; },
    f => { f.mesh.geometry.setDrawRange(3, 6); },
  ]) { const f = fixture(); mutate(f); assert.notEqual(measure(f).key, before.key); }
  for (const mutate of [
    f => { f.mesh.geometry.attributes.position.array[0] += .001; },
    f => { f.mesh.position.x = .01; },
  ]) {
    const f = fixture(); mutate(f); const changed = measure(f);
    assert.equal(changed.key, before.key);
    assert.equal('positionInvariant' in changed, false);
  }
  const f = fixture(); assert.notEqual(core.transportIdentity(f.group, f.geometry, {}, 'b'.repeat(64)).key, before.key);
});
test('a mismatched complete solid set takes the named refusal without a solver or cache population', () => {
  const f = fixture(); runtime.clearDecoded();
  assert.throws(() => runtime.apply(f.group, f.geometry, {}, f.mesh.material, artifact.solver_version),
    { code: 'CN8_TRANSPORT_ARTIFACT_KEY_MISMATCH' });
  assert.equal(f.group.userData.cn8TransportArtifact.ui_solve_calls, 0);
  assert.equal(runtime.diagnostics().decoded_entries, 0);
  assert.equal(runtime.diagnostics().ui_solve_calls, 0);
});
test('the runtime graph cannot import or invoke the offline solver', () => {
  for (const file of ['cn8transport.js', 'cn8transport-core.js', 'cn8transport-codec.js']) {
    const text = fs.readFileSync(new URL('../../../web/scene/' + file, import.meta.url), 'utf8');
    assert.doesNotMatch(text, /import[^;]*(?:ghcn8|transport_solver|solve_transport)/);
    assert.doesNotMatch(text, /\b(?:cn8D3SolidRayTree|solveLiner|wallLighting|solveTransport)\s*\(/);
    assert.doesNotMatch(text, /positionInvariant|POSITION_INVARIANT|position_invariant/);
  }
});
test('the restored production-sampling guard refuses one changed ray', () => {
  const rays = [{ family: 'production hemisphere', ray: [1, 2, 3, 0, 1, 0] }];
  assert.equal(assertProductionSampling(rays, structuredClone(rays)), 1);
  const changed = structuredClone(rays); changed[0].ray[4] = .9;
  assert.throws(() => assertProductionSampling(rays, changed), /production light sampling changed/);
});

test('the restored vertex-593 arm refuses a blocked review ray even when both queries agree', () => {
  const row = { vertex: 593, rays: 37, after_open: 37, mesh_open: 37,
    review: { after_blocked: false, mesh_blocked: false } };
  assert.equal(assertReviewVertex593(row), row);
  assert.throws(() => assertReviewVertex593({ ...row,
    review: { after_blocked: true, mesh_blocked: true } }), /vertex-593/);
  assert.throws(() => assertReviewVertex593({ ...row, after_open: 36, mesh_open: 36 }), /vertex-593/);
});
