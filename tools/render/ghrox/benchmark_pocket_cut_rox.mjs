#!/usr/bin/env node

// Copyright (c) Meta Platforms, Inc. and affiliates.

export const PORT_INVENTORY = { http: 0, cdp: 0 };
/** Same-process, same-box timing of the shipping six-pocket cut constructor.
 * Keep first construction separate from repeated builds: profile generation is
 * real work, even when subsequent table switches can reuse its CPU templates.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { isRoxMain } from './lib/cli_rox.mjs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from '../../../web/vendor/three.module.min.js';
import { censusTableAttributes } from './geometry_attributes_rox.mjs';

export const LANE_BASE = '8f58b2104722d1f5c10208b9db3da3b584a3ecf5';
const repo = fileURLToPath(new URL('../../../', import.meta.url));
const tablePath = path.join(repo, 'web/scene/table.js');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function between(source, start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a + start.length);
  assert(a >= 0 && b > a, `BENCHMARK_SOURCE_REFUSED: ${start}`);
  return source.slice(a, b);
}

export function pocketConstructor(source) {
  const entryKey = source.includes('  pool_pro_9ft_k55: {') ? 'pool_pro_9ft_k55' : 'rasson_ox_9ft'; const entry = between(source, `  ${entryKey}: {`, '\n  },').replace(`  ${entryKey}:`, '') + '\n}';
  const geom = between(source, 'export function makeGeom(', '\nconst G0 =').replace('export ', '');
  const block = between(source, 'const ROX_BED_ABOVE_FLOOR =', '\nexport function buildTable(');
  // A VM sandbox adds cross-context overhead absent from the browser. Compile
  // the exact shipping functions in this realm; do not fork their algorithms.
  return new Function('THREE', `const spec = (${entry}); const specFor = () => spec;
    ${geom}\n${block}\nreturn { spec, makeGeom, roxCornerPocket, roxSidePocket, roxPocketCut };`)(THREE);
}

export function geometryDigest(group) {
  const bytes = array => hash(Buffer.from(array.buffer, array.byteOffset, array.byteLength));
  const meshes = group.children.map(mesh => ({ name: mesh.name,
    attributes: Object.fromEntries(Object.entries(mesh.geometry.attributes).map(([name, a]) =>
      [name, { type: a.array.constructor.name, itemSize: a.itemSize, count: a.count, sha256: bytes(a.array) }])),
    index: mesh.geometry.index ? bytes(mesh.geometry.index.array) : null,
    matrix: mesh.matrixWorld.toArray() }));
  return { sha256: hash(JSON.stringify(meshes)), meshes };
}

export function pocketBuild(api, { retain = false, full = true, materials = null } = {}) {
  const G = api.makeGeom('rasson_ox_9ft'), group = new THREE.Group(); group.name = 'obTable';
  // Materials are outside the timer; these geometry functions read no shader
  // pixels. New instances on every build also exercise template ownership.
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const mats = materials ?? { cup: material, well: material, metal: material, cloth: material };
  const dm = (mesh, name) => { mesh.name = `dm-${name}`; return mesh; };
  const startLoad = os.loadavg()[0], start = performance.now(), cuts = [];
  for (const p of G.pockets) {
    const tag = p.corner ? (p.x > 0 ? 'px' : 'nx') + (p.z > 0 ? 'pz' : 'nz') : (p.z > 0 ? 'pz' : 'nz');
    if (full) {
      if (p.corner) api.roxCornerPocket(group, dm, G, p, mats, tag);
      else api.roxSidePocket(group, dm, G, p, mats, tag);
    }
    const t = performance.now();
    api.roxPocketCut(group, dm, G, p, `${p.corner ? 'corner' : 'side'}-${tag}`, mats, mats.cloth);
    cuts.push({ pocket: tag, ms: performance.now() - t });
  }
  const construction_ms = performance.now() - start;
  group.updateMatrixWorld(true);
  const digest = geometryDigest(group), attribute_gate = censusTableAttributes(group);
  const result = { pocket_cut_ms: cuts.reduce((n, r) => n + r.ms, 0), cuts, construction_ms,
    load1_start: startLoad, load1_end: os.loadavg()[0], geometry_sha256: digest.sha256,
    attribute_gate, geometry: digest.meshes };
  if (retain) return { ...result, group, G, materials: mats };
  for (const mesh of group.children) mesh.geometry.dispose();
  material.dispose();
  return result;
}

export function laneBaseSource() {
  const fixture = new URL('fixtures/pocket-cut-lane-base.txt', import.meta.url);
  const provenance = JSON.parse(fs.readFileSync(new URL('fixtures/pocket-cut-lane-base.json', import.meta.url), 'utf8'));
  const source = fs.readFileSync(fixture, 'utf8');
  assert.equal(provenance.revision, LANE_BASE, 'BENCHMARK_REFERENCE_REVISION_REFUSED');
  assert.equal(hash(source), provenance.fixture_sha256, 'BENCHMARK_REFERENCE_SHA_REFUSED');
  return source;
}

export function benchmarkPocketCut({ source, reference = laneBaseSource() }) {
  const base = pocketConstructor(reference), candidate = pocketConstructor(source);
  const initial = { base: pocketBuild(base), candidate: pocketBuild(candidate) }, samples = [];
  // Seven paired repeated builds; alternate order to limit allocation/JIT/load
  // bias. All samples and the uncached first build remain in the result.
  for (let i = 0; i < 7; i++) {
    const row = { iteration: i + 1 };
    for (const name of i % 2 ? ['candidate', 'base'] : ['base', 'candidate']) {
      row[name] = pocketBuild(name === 'base' ? base : candidate);
    }
    samples.push(row);
  }
  const median = rows => rows.toSorted((a, b) => a - b)[Math.floor(rows.length / 2)];
  const base_ms = median(samples.map(r => r.base.pocket_cut_ms));
  const actual_ms = median(samples.map(r => r.candidate.pocket_cut_ms));
  assert(Number.isFinite(base_ms) && base_ms > 0 && Number.isFinite(actual_ms), 'BENCHMARK_TIMING_REFUSED');
  const bound_ms = 2 * base_ms;
  const stable = ['base', 'candidate'].every(name => initial[name].attribute_gate.passed && samples.every(row =>
    row[name].geometry_sha256 === initial[name].geometry_sha256 && row[name].attribute_gate.passed));
  return { passed: stable && actual_ms <= bound_ms,
    row: { id: 'ROX_POCKET_CUT_BUILD_TIME', source_tag: 'DERIVED',
      statistic: 'median of seven paired repeated builds; uncached first construction reported separately',
      base_ms, actual_ms, bound_ms, ratio: actual_ms / base_ms, passed: actual_ms <= bound_ms,
      rule: 'pocket-cut phase <= 2 * lane-base pocket-cut phase, measured on this machine in this run' },
    cold: { base_ms: initial.base.pocket_cut_ms, actual_ms: initial.candidate.pocket_cut_ms,
      ratio: initial.candidate.pocket_cut_ms / initial.base.pocket_cut_ms,
      scope: 'First construction in a fresh constructor closure, including generation of profile templates; not a cache-hit timing.' },
    reference_revision: LANE_BASE, reference_sha256: hash(reference), source_sha256: hash(source),
    runtime: { node: process.version, platform: process.platform, arch: process.arch, cpus: os.cpus().length },
    geometry_stable_across_builds: stable, initial, samples };
}

function main() {
  const args = process.argv.slice(2), value = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
  const out = value('--out'); assert(out && !fs.existsSync(out), '--out <new-file> required');
  const sourcePath = value('--source', tablePath), referencePath = value('--base-source');
  const result = benchmarkPocketCut({ source: fs.readFileSync(sourcePath, 'utf8'),
    ...(referencePath ? { reference: fs.readFileSync(referencePath, 'utf8') } : {}) });
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n');
  console.log('POCKET_BUILD_TIME', JSON.stringify({ ...result.row, cold: result.cold, passed: result.passed }));
  if (args.includes('--judge') && !result.passed) process.exitCode = 1;
}
if (isRoxMain(import.meta.url)) main();
