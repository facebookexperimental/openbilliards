// Copyright (c) Meta Platforms, Inc. and affiliates.

// This is the expensive S2 arm. It rebuilds the real geometry and solves it;
// a manifest-only check cannot stand in for this byte-equality assertion.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { generate, serialized, solverIdentity } from './gen_transport_artifact.mjs';
import { buildTransportInputs } from './cpu_table_inputs.mjs';
import { meshQuantum } from './cn8_contact_law.mjs';
import { transportIdentity } from '../../../web/scene/cn8transport-core.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const sha = value => createHash('sha256').update(value).digest('hex');

test('S2: committed transport bytes equal a fresh complete-solid solve for both aliases', async () => {
  const { artifact, receipt } = await generate();
  console.log(JSON.stringify({ arm: 'S2', tag: 'DERIVED fresh full solve', elapsed_ms: receipt.elapsed_ms,
    solver: receipt.solver, physical_entries: artifact.entries.length,
    aliases: artifact.entries.flatMap(entry => entry.aliases) }));
  const result = serialized(artifact);
  assert.equal(fs.readFileSync(new URL('../../../docs/geometry/cn8-pocket-d3-transport.json', import.meta.url), 'utf8'), result.json);
  assert.equal(fs.readFileSync(new URL('../../../web/scene/cn8transport-data.js', import.meta.url), 'utf8'), result.module);
  const renderer = fs.readFileSync(new URL('../../../web/scene/table.js', import.meta.url), 'utf8');
  assert.match(renderer, new RegExp("const CN8_TRANSPORT_SOLVER_VERSION = '" + artifact.solver_version + "';"));
  assert.deepEqual(receipt.tables.map(row => row.table), ['chinese8_pro_9ft', 'joy_q8_9ft']);
  assert.ok(artifact.entries.every(row => row.members.length > 4 && row.triangles > 0));
});

test('P-G1: a one-quantum builder edit changes source/key and fails the real S2 byte predicate', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cn8-generation-quantum-'));
  try {
    const source = solverIdentity(ROOT), baseline = await buildTransportInputs();
    const before = transportIdentity(baseline.group, baseline.G, baseline.K, source.sha256);
    const quantum = meshQuantum(baseline.group).quantum_m;
    const meshName = 'cn8-plank-0';
    const oldPosition = baseline.group.getObjectByName(meshName).geometry.getAttribute('position').array;
    const coordinate = oldPosition.findIndex(value => Math.abs(value) >= 1 && Math.abs(value) < 2);
    assert.ok(coordinate >= 0, 'Use a measured table-scale coordinate');
    const value = oldPosition[coordinate];
    for (const name of ['web/scene', 'web/dist/pool-sdk']) fs.cpSync(path.join(ROOT, name), path.join(root, name), { recursive: true });
    for (const name of Object.keys(source.sources).filter(name => !name.startsWith('table.js:'))) {
      const file = path.join(root, name); fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.copyFileSync(path.join(ROOT, name), file);
    }
    const file = path.join(root, 'web/scene/table.js'), original = fs.readFileSync(file, 'utf8');
    const needle = '    cn8Transport.apply(group, G, CN8_R82, clothMat, CN8_TRANSPORT_SOLVER_VERSION);';
    assert.equal(original.split(needle).length, 2);
    const edit = `    // TEST P-G1: one measured storage quantum, generation fixture only.\n`
      + `    group.getObjectByName('${meshName}').geometry.getAttribute('position').array[${coordinate}] += ${quantum};\n`;
    fs.writeFileSync(file, original.replace(needle, edit + needle));
    const changedSource = solverIdentity(root), changed = await buildTransportInputs({ root });
    const newPosition = changed.group.getObjectByName(meshName).geometry.getAttribute('position').array;
    assert.equal(newPosition[coordinate] - value, quantum);
    const changedWords = [];
    for (let i = 0; i < oldPosition.length; i++) if (!Object.is(oldPosition[i], newPosition[i])) changedWords.push(i);
    assert.deepEqual(changedWords, [coordinate]);
    const after = transportIdentity(changed.group, changed.G, changed.K, changedSource.sha256);
    assert.notEqual(changedSource.sha256, source.sha256);
    assert.notEqual(after.key, before.key);
    assert.equal(transportIdentity(changed.group, changed.G, changed.K, source.sha256).key, before.key,
      'The builder version, never the floating position, invalidates this key');
    const generated = await generate({ root });
    const freshJson = JSON.stringify(generated.artifact) + '\n';
    assert.equal(generated.artifact.solver_version, changedSource.sha256);
    assert.equal(generated.artifact.entries[0].key, after.key);
    const committed = fs.readFileSync(path.join(ROOT, 'docs/geometry/cn8-pocket-d3-transport.json'), 'utf8');
    const committedModule = fs.readFileSync(path.join(ROOT, 'web/scene/cn8transport-data.js'), 'utf8');
    // This is the exact S2 equality predicate applied to an actual fresh solve.
    // Keep the exact string predicate, without formatting a multi-megabyte
    // expected-failure diff in the test reporter.
    assert.throws(() => assert.equal(freshJson === committed, true), assert.AssertionError);
    // A changed current solve must fail S2. The legacy descriptor still
    // receives its separately hash-locked result, never this planted solve.
    const plantedModule = serialized(generated.artifact).module;
    assert.notEqual(sha(plantedModule), sha(committedModule));
    const descriptor = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/geometry/cn8-pocket-d3-transport-compat.json')));
    assert.deepEqual(generated.artifact.compatibility_results.rows.map(row => sha(JSON.stringify(row.results))),
      descriptor.result_bindings.map(row => row.sha256));
    console.log(JSON.stringify({ arm: 'P-G1', status: 'PASS / EXPECTED S2 RED', tag: 'TEST builder edit / DERIVED quantum',
      mesh: meshName, coordinate, before_m: value, after_m: newPosition[coordinate], quantum_m: quantum,
      changed_words: changedWords, source_before: source.sha256, source_after: changedSource.sha256,
      key_before: before.key, key_after: after.key, builder_edit: edit,
      committed_artifact_sha256: sha(committed), fresh_plant_sha256: sha(freshJson),
      committed_module_sha256: sha(committedModule), fresh_plant_module_sha256: sha(plantedModule),
      legacy_results: 'byte-identical to immutable compatibility bindings; current S2 remains RED',
      fresh_solve_ms: generated.receipt.elapsed_ms }));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
