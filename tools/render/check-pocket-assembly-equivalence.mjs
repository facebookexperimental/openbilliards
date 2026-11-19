#!/usr/bin/env node

// Copyright (c) Meta Platforms, Inc. and affiliates.

// Local-only proof for the certified fast path. Compare every sampled
// predicate with --exact, both on the fixed tree and the historical red arm,
// then repeat on actual emitted-mesh plants in fresh, sequential processes.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import * as THREE from '../../web/vendor/three.module.min.js';
import {checkPocketAssembly} from './check-pocket-assembly.mjs';

const args = process.argv.slice(2), options = {};
for (let i = 0; i < args.length; i++) {
  if (!['--out', '--green-fast', '--green-exact', '--red-fast', '--red-exact',
    '--legacy-red-fast', '--legacy-red-exact', '--case', '--algorithm'].includes(args[i]) || !args[i + 1]) {
    throw new Error(`Unknown or incomplete argument: ${args[i]}`);
  }
  options[args[i]] = args[++i];
}
if (!options['--out']) throw new Error('--out is required');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const cases = [
  {name: 'drop-crossbar', expected: 'FAIL', required: ['drop:surface-intersection'], drop: true,
    mutate({group, G}) {
      const p = G.pockets.find(p => !p.corner);
      const collar = group.getObjectByName('dm-bootcollar-s1');
      assert(p && collar?.isMesh, 'drop crossbar anchors');
      // A visible barrier below the bed cannot affect the contact or
      // projected-opening predicates. Only the full drop check finds it.
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.004, 0.12), collar.material.clone());
      bar.name = 'drop-crossbar-control';
      bar.position.set(p.x, -0.028, p.z);
      group.add(bar);
    }},
  {name: 'side-hole-widened-6mm', expected: 'FAIL', required: ['opening:side'],
    mutate({group, G}) {
      const mesh = group.getObjectByName('dm-bed-cloth');
      assert(mesh?.geometry?.attributes.position, 'bed opening plant anchor');
      mesh.geometry = mesh.geometry.clone();
      const p = mesh.geometry.attributes.position;
      let changed = 0;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), z = p.getZ(i);
        // Expand the actual side-hole vertices only. No cushion or boot
        // changes, so a join-distance-only gate cannot detect this plant.
        if (Math.abs(x) < 0.09 && Math.abs(Math.abs(z) - G.W / 2) < 0.12 && Math.abs(x) > 0.02) {
          p.setX(i, x + Math.sign(x) * 0.006); changed++;
        }
      }
      assert(changed > 8, 'side hole widening found its submitted boundary');
      p.needsUpdate = true;
    }},
  {name: 'undrawn-collars', expected: 'FAIL', required: ['closure:corner', 'closure:side'],
    mutate({group}) {
      let count = 0;
      group.traverse(mesh => {
        if (!mesh.isMesh || !mesh.name.startsWith('dm-bootcollar-')) return;
        mesh.geometry = mesh.geometry.clone();
        mesh.geometry.setDrawRange(0, 0);
        count++;
      });
      assert.equal(count, 6, 'drawRange plant removes all six collars');
    }},
  {name: 'missing-corner-boot', expected: 'FAIL', required: ['closure:corner'],
    mutate({group}) {
      const mesh = group.getObjectByName('dm-bootcollar-c5');
      assert(mesh?.isMesh, 'corner boot plant anchor');
      mesh.visible = false;
    }},
  {name: 'side-cushion-inward-2mm', expected: 'FAIL', required: ['closure:side', 'contact:linear'],
    mutate({group}) {
      const mesh = group.getObjectByName('dm-cushion-1');
      assert(mesh?.isMesh, 'side cushion plant anchor');
      mesh.position.z += 0.002;
    }},
  {name: 'cyclic-triangle-indices', expected: 'PASS', required: [],
    mutate({group}) {
      const mesh = group.getObjectByName('dm-bootcollar-s1');
      assert(mesh?.geometry?.index, 'indexed side boot control anchor');
      mesh.geometry = mesh.geometry.clone();
      const indices = mesh.geometry.index.array;
      // A cyclic permutation preserves the exact oriented triangle. It
      // changes traversal arithmetic without changing the visible surface.
      for (let i = 0; i < indices.length; i += 3) {
        const first = indices[i]; indices[i] = indices[i + 1];
        indices[i + 1] = indices[i + 2]; indices[i + 2] = first;
      }
      mesh.geometry.index.needsUpdate = true;
    }},
];

function predicates(report) {
  return report.tables.map(t => ({
    id: t.id, status: t.status, defects: t.defects,
    closure: t.closure && {status: t.closure.status, rows: t.closure.rows.map(r =>
      [r.pocket, r.kind, r.cushion, r.height_mm, r.status])},
    opening: t.opening && {status: t.opening.status, rows: t.opening.rows.map(r =>
      [r.pocket, r.kind, r.jaw, r.cushions, r.cloth_meshes, r.status, r.uncovered_fragments, r.uncovered_segments, r.summed_overlap_mm2, r.witness])},
    contact: t.contact && {status: t.contact.status, unresolved: t.contact.unresolved,
      rows: t.contact.rows.map(r => [r.kind, r.index, r.fraction, r.active, r.status])},
    symmetry: t.symmetry && {status: t.symmetry.status,
      rows: t.symmetry.rows.map(r => [r.axis, r.samples, r.status])},
    witness: t.witness && [t.witness.status, t.witness.record_sha256],
    drop: t.drop && {status: t.drop.status, step_s: t.drop.step_s,
      rows: t.drop.rows.map(r => [r.name, r.pocket, r.offset_mm, r.record_sha256,
        r.status, r.samples, r.clearance_mm, r.t_s, r.centre_m])},
    cue: t.cue_floor && {status: t.cue_floor.status,
      rows: t.cue_floor.rows?.map(r => [r.label, r.samples, r.failures, r.worst.undershoot_mm]),
      brackets: t.cue_floor.solve_brackets?.map(r => [r.pose, r.a, r.b, r.turn, r.status])},
  }));
}

function compare(name, fastFile, exactFile) {
  const fastBytes = fs.readFileSync(fastFile), exactBytes = fs.readFileSync(exactFile);
  const fast = JSON.parse(fastBytes), exact = JSON.parse(exactBytes);
  assert.equal(fast.algorithm, 'certified', `${name}: fast algorithm`);
  assert.equal(exact.algorithm, 'exact', `${name}: exact algorithm`);
  for (const key of ['source_ref', 'table_js_sha256', 'wasm_sha256', 'instrument_sha256', 'projection_sha256',
    'sinkpivot_sha256', 'drop_check']) {
    assert.equal(fast[key], exact[key], `${name}: ${key}`);
  }
  assert.equal(fast.instrument_sha256, sha(fs.readFileSync(new URL('./check-pocket-assembly.mjs', import.meta.url))),
    `${name}: reports must use the final gate`);
  assert.equal(fast.projection_sha256, sha(fs.readFileSync(new URL('./pocket-opening-projection.mjs', import.meta.url))),
    `${name}: reports must use the final projection check`);
  assert.equal(fast.sinkpivot_sha256, sha(fs.readFileSync(new URL('../../web/app/sinkpivot.js', import.meta.url))),
    `${name}: reports must use the production drop presentation`);
  const a = JSON.stringify(predicates(fast)), b = JSON.stringify(predicates(exact));
  assert.equal(sha(a), sha(b), `${name}: sampled predicates differ`);
  return {name, fast: {report: path.basename(fastFile), sha256: sha(fastBytes), elapsed_ms: fast.elapsed_ms},
    exact: {report: path.basename(exactFile), sha256: sha(exactBytes), elapsed_ms: exact.elapsed_ms},
    predicate_sha256: sha(a), verdict: fast.verdict,
    tables: fast.tables.map(t => ({id: t.id, status: t.status, defects: t.defects})), pass: true};
}

if (options['--case']) {
  const plant = cases.find(c => c.name === options['--case']);
  assert(plant, 'unknown plant');
  assert(['certified', 'exact'].includes(options['--algorithm']), 'unknown algorithm');
  const report = await checkPocketAssembly({'--out': options['--out'], '--tables': 'diamond_proam_9ft',
    '--exact': options['--algorithm'] === 'exact', '--drop': plant.drop === true,
    '--plant': plant.name}, {mutateScene: plant.mutate});
  assert.equal(report.tables[0].status, plant.expected, `${plant.name}: expected predicate`);
  for (const defect of plant.required) assert(report.tables[0].defects.includes(defect), `${plant.name}: ${defect}`);
} else {
  for (const key of ['--green-fast', '--green-exact', '--red-fast', '--red-exact']) {
    if (!options[key]) throw new Error(`${key} is required`);
  }
  const out = path.resolve(options['--out']);
  fs.mkdirSync(out, {recursive: true});
  const result = {schema: 'pocket-assembly-equivalence/1', node: process.version, comparisons: []};
  const save = () => fs.writeFileSync(path.join(out, 'equivalence.json'), JSON.stringify(result, null, 2) + '\n');
  for (const [label, expected] of [['green', 'PASS_ENFORCED'], ['red', 'EXPECTED_RED']]) {
    const row = compare(label, options[`--${label}-fast`], options[`--${label}-exact`]);
    assert.equal(row.verdict, expected, `${label}: verdict`);
    assert.deepEqual(row.tables.map(t => t.id).sort(), ['diamond_proam_7ft', 'diamond_proam_8ft', 'diamond_proam_9ft']);
    result.comparisons.push(row); save();
  }
  if (options['--legacy-red-fast'] || options['--legacy-red-exact']) {
    assert(options['--legacy-red-fast'] && options['--legacy-red-exact'], 'Both legacy red reports are required');
    const row = compare('legacy-red', options['--legacy-red-fast'], options['--legacy-red-exact']);
    assert.equal(row.verdict, 'EXPECTED_RED', 'legacy red: verdict');
    assert.deepEqual(row.tables.map(t => t.id).sort(), ['diamond_proam_7ft', 'diamond_proam_8ft', 'diamond_proam_9ft']);
    result.comparisons.push(row); save();
  }
  for (const plant of cases) {
    const files = {};
    for (const algorithm of ['certified', 'exact']) {
      files[algorithm] = path.join(out, `${plant.name}-${algorithm}.json`);
      const fd = fs.openSync(path.join(out, `${plant.name}-${algorithm}.log`), 'w');
      try {
        execFileSync(process.execPath, ['--experimental-vm-modules', fileURLToPath(import.meta.url),
          '--case', plant.name, '--algorithm', algorithm, '--out', files[algorithm]],
        {stdio: ['ignore', fd, fd]});
      } finally { fs.closeSync(fd); }
    }
    const row = compare(plant.name, files.certified, files.exact);
    result.comparisons.push(row); save();
    console.log(JSON.stringify(row));
  }
  result.pass = true; save();
  console.log('POCKET EQUIVALENCE PASS: every sampled predicate agrees on both trees and all emitted-mesh plants');
}
