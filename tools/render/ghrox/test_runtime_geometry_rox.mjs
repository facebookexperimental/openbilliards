// Copyright (c) Meta Platforms, Inc. and affiliates.

export const PORT_INVENTORY = { http: 0, cdp: 0 };
/** FIX7: CLI regression arms against actual shipping pocket constructors. */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test, { after } from 'node:test';
import { construct, TABLE_PATH, REGENERATED_MESH_FIELDS, REGENERATED_DUMP_FIELDS } from './runtime_geometry_rox.mjs';

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'rox-replay-test-'));
after(() => fs.rmSync(scratch, { recursive: true, force: true }));
const helper = fileURLToPath(new URL('./runtime_geometry_rox.mjs', import.meta.url));
const source = fs.readFileSync(TABLE_PATH, 'utf8');
const { meshes } = construct({ source });
const pockets = meshes.map(m => ({ ...m, parent: 'obTable', inTable: true, visible: true }));
const bed = { name: 'dm-bed-cloth', positions: [0, 0, 0, 1, 0, 0, 0, 0, 1],
  indices: [0, 1, 2], verts: 3, indexed: true, tris: 1 };
const baseline = { units: 'm', up: 'Y', frame: 'fixture in the shipping scene frame', table: 'rasson_ox_9ft',
  meshes: [bed, ...pockets], meshCount: pockets.length + 1,
  source_sha256: 'stale baseline source', rig: { baked: true }, frames: { old: 'not current evidence' },
  webgl_draw_errors: [], attribute_gate: { passed: true, meshCount: 166, rows: [{ name: bed.name }] } };
const panEmission = '  group.add(dm(pan, `pocket-rox-${kind}-pan`));';
assert.equal(source.split(panEmission).length, 2, 'one common emission supplies all six pan arms');
const panNames = pockets.filter(m => m.name.endsWith('-pan')).map(m => m.name).sort();
assert.equal(panNames.length, 6);
const stray = 'pocket-rox-fix7-stray';
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
let serial = 0;
function run(candidate = source, base = baseline) {
  const prefix = path.join(scratch, String(serial++));
  const sourceFile = prefix + '.table.js', baselineFile = prefix + '.baseline.json', output = prefix + '.out.json';
  fs.writeFileSync(sourceFile, candidate);
  fs.writeFileSync(baselineFile, JSON.stringify(base));
  const child = spawnSync(process.execPath, [helper, '--source', sourceFile, '--baseline', baselineFile,
    '--expect-identical', '--out', output], { encoding: 'utf8' });
  assert.ifError(child.error);
  return { ...child, dump: fs.existsSync(output) ? JSON.parse(fs.readFileSync(output, 'utf8')) : null };
}
function outputProof(run, count) {
  assert(run.dump, run.stderr);
  const { dump } = run, proof = dump.runtime_geometry_replay;
  assert.equal(dump.meshCount, count);
  assert.equal(dump.meshes.length, count);
  assert.equal(proof.constructor_meshes, count);
  assert.equal(proof.output_meshes, count);
  assert.equal(proof.inherited_other_meshes, 0);
  assert.equal(proof.full_scene, false);
  assert.equal(dump.attribute_gate.meshCount, count);
  assert.deepEqual(dump.attribute_gate.rows.map(r => r.name).sort(), dump.meshes.map(m => m.name).sort());
  assert.equal(dump.source_sha256, proof.source_sha256);
  assert.equal(proof.output_meshes_sha256, sha(JSON.stringify(dump.meshes)));
  assert(Object.keys(dump).every(k => REGENERATED_DUMP_FIELDS.includes(k)));
  for (const m of dump.meshes) assert(Object.keys(m).every(k => REGENERATED_MESH_FIELDS.includes(k)));
  for (const key of ['rig', 'frames', 'webgl_draw_errors', 'tableId', 'runtime_geometry_replay_from_baseline']) {
    assert.equal(Object.hasOwn(dump, key), false, 'no inherited app/render evidence: ' + key);
  }
  assert(!dump.meshes.some(m => m.name === bed.name), 'non-emitted bed must not survive');
  return proof;
}

test('real constructor round-trips every pocket byte while omitting non-emitted baseline meshes', () => {
  const result = run(), proof = outputProof(result, pockets.length);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(proof.identical, true);
  assert.deepEqual([proof.added, proof.removed, proof.changed], [[], [], []]);
  assert.equal(proof.matched.length, pockets.length);
  assert.equal(JSON.stringify(result.dump.meshes), JSON.stringify(pockets));
  assert.equal(proof.output_meshes_sha256, proof.baseline_pocket_meshes_sha256);
  assert.equal(result.dump.attribute_gate.passed, true);
});

test('removing six pan emissions refuses identity and leaves no inherited pan in output', () => {
  const result = run(source.replace(panEmission, '  // Omit all pan emissions in this regression arm.'));
  const proof = outputProof(result, pockets.length - panNames.length);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /RUNTIME_IDENTITY_REFUSED/);
  assert.deepEqual(proof.removed, panNames);
  assert.deepEqual([proof.added, proof.changed], [[], []]);
  assert(!result.dump.meshes.some(m => panNames.includes(m.name)));
  for (const name of panNames) assert(result.stderr.includes(name));
});

test('an emitted stray outside the pocket namespace is added, reported and retained in diagnostic output', () => {
  const name = 'fix7-stray-outside-namespace';
  const result = run(source.replace(panEmission, panEmission +
    "\n  if (kind === 'side-pz') group.add(dm(pan.clone(), '" + name + "'));"));
  const proof = outputProof(result, pockets.length + 1);
  assert.equal(result.status, 1);
  assert.deepEqual(proof.added, ['dm-' + name]);
  assert.deepEqual([proof.removed, proof.changed], [[], []]);
  assert(result.dump.meshes.some(m => m.name === 'dm-' + name));
});

test('equal mesh counts cannot hide a removed pan replaced by a new name', () => {
  const candidate = source.replace(panEmission,
    "  group.add(dm(pan, kind === 'side-pz' ? '" + stray + "' : `pocket-rox-${kind}-pan`));");
  const result = run(candidate), proof = outputProof(result, pockets.length);
  assert.equal(result.status, 1);
  assert.deepEqual(proof.removed, ['dm-pocket-rox-side-pz-pan']);
  assert.deepEqual(proof.added, ['dm-' + stray]);
  assert.equal(proof.identical, false);
});

test('inventory comparison is independent of baseline mesh order', () => {
  const reversed = [...pockets].reverse();
  const result = run(source, { ...baseline, meshes: [...reversed, bed] });
  const proof = outputProof(result, pockets.length);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(proof.identical, true);
  assert.equal(JSON.stringify(result.dump.meshes), JSON.stringify(reversed));
});

test('changed geometry still refuses identity and output uses the current vertices', () => {
  const altered = structuredClone(baseline);
  altered.meshes[1].positions[0] += 0.125;
  const result = run(source, altered), proof = outputProof(result, pockets.length);
  assert.equal(result.status, 1);
  assert.deepEqual(proof.changed, [pockets[0].name]);
  assert.deepEqual([proof.added, proof.removed], [[], []]);
  assert.equal(JSON.stringify(result.dump.meshes), JSON.stringify(pockets));
});

test('a duplicate baseline pocket name cannot establish an unambiguous inventory', () => {
  const result = run(source, { ...baseline, meshes: [...baseline.meshes, pockets[0]] });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /duplicate baseline pocket mesh names/);
  assert.equal(result.dump, null);
});

test('attribute census is recomputed and refuses bad buffers despite a passing baseline census', () => {
  const result = run(source.replace(panEmission,
    "  pan.geometry.setAttribute('normal', new THREE.Float32BufferAttribute([], 3));\n" + panEmission));
  const proof = outputProof(result, pockets.length);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /RUNTIME_ATTRIBUTE_REFUSED/);
  assert.equal(proof.identical, true, 'position/index equality does not certify vertex attributes');
  assert.equal(result.dump.attribute_gate.passed, false);
  assert.deepEqual(result.dump.attribute_gate.failures.map(r => r.name).sort(), panNames);
});

test('100 mm pan motion updates both coordinate arrays instead of inheriting baseline raw positions', () => {
  const result = run(source.replace(panEmission, '  pan.position.y += 0.1;\n' + panEmission));
  const proof = outputProof(result, pockets.length);
  assert.equal(result.status, 1);
  assert.deepEqual(proof.changed.toSorted(), panNames);
  for (const m of result.dump.meshes.filter(m => panNames.includes(m.name))) {
    const old = pockets.find(p => p.name === m.name);
    for (let i = 0; i < m.raw_positions.length; i++) {
      const shift = i % 3 === 1 ? .1 : 0;
      assert(Math.abs(m.raw_positions[i] - old.raw_positions[i] - shift) <= 4 * Number.EPSILON);
      // JSON's numeric representation canonicalizes signed zero to zero.
      assert.equal(m.positions[i], +m.raw_positions[i].toFixed(6) || 0);
    }
  }
});

test('raw-only drift refuses identity even when six-decimal positions are unchanged', () => {
  const altered = structuredClone(baseline);
  altered.meshes[1].raw_positions[0] += 1e-8;
  const result = run(source, altered), proof = outputProof(result, pockets.length);
  assert.equal(result.status, 1);
  assert.deepEqual(proof.changed, [pockets[0].name]);
  assert.equal(JSON.stringify(result.dump.meshes), JSON.stringify(pockets));
});

test('unknown raw fields, stale material metadata and frame datums cannot leak through a matching name', () => {
  const altered = structuredClone(baseline);
  altered.units = 'stale units'; altered.frame = 'stale frame'; altered.table = 'stale table';
  altered.raw_capture = [99]; altered.kernel = { length: -1 };
  for (const m of altered.meshes) {
    m.raw_normals = [99]; m.raw_future_field = { stale: true }; m.bounds = [99];
    m.matType = 'stale material'; m.visible = false;
    if (m.material_slots) m.material_slots[0].side = -99;
  }
  const result = run(source, altered), proof = outputProof(result, pockets.length);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(proof.identical, true, 'identity compares emitted geometry; stale metadata is dropped');
  assert.equal(JSON.stringify(result.dump.meshes), JSON.stringify(pockets));
  assert.equal(result.dump.units, 'm'); assert.equal(result.dump.table, 'rasson_ox_9ft');
  assert.equal(result.dump.kernel.length, 2.54); assert.notEqual(result.dump.frame, altered.frame);
  assert(!Object.hasOwn(result.dump, 'raw_capture'));
});
