#!/usr/bin/env node

// Copyright (c) Meta Platforms, Inc. and affiliates.

// Round-4 exact optimization gate. The slow path IS the unchanged 9fa49ef2
// full enumerator; source pins below prevent silently changing the oracle.
// Compare live, explicit cuestrike snapshots, and every actual cuepost pose
// recorded by the surface audit. All result fields use Object.is.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {sha, git, installSources, functionSource, variableSource, poseGrid, tipOffsets} from './lib/cue-contract-source.mjs';

const options = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i], value = process.argv[i + 1];
  assert(['--out', '--post-input'].includes(key) && value, `option ${key}`); options[key] = value;
}
assert(options['--out'] && options['--post-input'], '--out and --post-input required');
const pins = JSON.parse(fs.readFileSync(new URL('./fixtures/cue-render-fold-reference.json', import.meta.url)));
const sources = installSources({extraPlants: {unsafe_render_clear: text => {
  const old = functionSource(text, 'renderBandProvenClear');
  return text.replace(old, 'function renderBandProvenClear() { return true; }');
}}});
const main = await sources.load('main'), candidate = await sources.load('candidate');
const unsafe = await sources.load('unsafe_render_clear');
const report = {schema: 'cue-render-fold/1', head: git(['rev-parse', 'HEAD']).trim(), reference: pins.reference,
  comparison: 'Object.is, all fields; retained full enumerator and geometry function source pins',
  instrument_sha256: sha(fs.readFileSync(fileURLToPath(import.meta.url))),
  pins_sha256: sha(fs.readFileSync(new URL('./fixtures/cue-render-fold-reference.json', import.meta.url))),
  functions: [], counts: {live: 0, cuestrike: 0, cuepost_pose: 0}, mismatches: 0, failures: [],
  positive_reference_folds: 0, unsafe_zero_plant: {cases: 0, mismatches: 0, first: null, caught: false}, pass: false};
for (const row of pins.functions) {
  const read = row.kind === 'variable' ? variableSource : functionSource;
  const text = read(sources.source('candidate', row.file), row.candidate_name)
    .replace(`function ${row.candidate_name}(`, `function ${row.reference_name}(`);
  const digest = sha(text), pass = digest === row.sha256;
  report.functions.push({...row, actual_sha256: digest, pass});
  if (!pass) report.failures.push({kind: 'reference source changed', ...row, actual_sha256: digest});
}
const D = candidate.api.CUE_DIMS;
assert(Object.is(D.RAIL_MAX, 0.062), 'reviewed ceiling');
const geoms = new Map();
for (const p of poseGrid(main)) if (!geoms.has(p.id)) geoms.set(p.id, candidate.api.prepareRailConstraintGeom(p.id));
function compare(kind, a, b, detail) {
  report.counts[kind]++;
  const equal = Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(k => Object.is(a[k], b[k]));
  report.mismatches += Number(!equal);
  if (!equal && report.failures.length < 30) report.failures.push({kind, ...detail, candidate: a, reference: b});
  if ((b.pen ?? b.requiredLift) > 0) report.positive_reference_folds++;
}
const lift = (fold, cos) => ({lift: Math.min(0.062, fold.pen / Math.max(cos, 0.35)),
  requiredLift: fold.pen / Math.max(cos, 0.35), s: fold.sAt});
const exact = (a, b) => Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(k => Object.is(a[k], b[k]));
function testUnsafePlant(args, geom, detail) {
  const reference = candidate.api.__probeReferenceConstraintPen(...args, geom);
  if (!(reference.pen > 0)) return;
  const result = unsafe.api.__probeConstraintPen(...args, geom);
  const control = report.unsafe_zero_plant; control.cases++;
  if (!exact(result, reference)) {
    control.mismatches++; control.first ??= {...detail, result, reference};
  }
}
for (const [index, p] of poseGrid(main).entries()) {
  candidate.table.__probeSelectTable(p.id);
  const geom = geoms.get(p.id);
  for (const [a, b] of tipOffsets(p)) {
    const floor = main.api.cueMinElevationDeg(p.pos, p.phi, a, b, main.geoms.get(p.id), p.R, p.balls);
    for (const deg of [floor, Math.max(0, Math.ceil(floor - 1e-9))]) for (const pull of [-0.07, -0.01, 0, 0.06, 0.12, 0.37]) {
      const theta = deg * Math.PI / 180, dx = Math.sin(p.phi), dz = Math.cos(p.phi), c = Math.cos(theta), s = Math.sin(theta);
      // Exact operation order of the pinned cueRailLift body, including the
      // separate gap addition; regrouping it would itself move binary64.
      const gap = D.TIP_GAP + pull;
      const tip = [p.pos.x - dx * (p.R + gap) * c - dz * a * p.R + dx * b * p.R * s,
        p.pos.y + (p.R + gap) * s + b * p.R * c,
        p.pos.z - dz * (p.R + gap) * c + dx * a * p.R + dz * b * p.R * s];
      const axis = [-dx * c, s, -dz * c], args = [...tip, ...axis];
      compare('live', candidate.api.__probeConstraintPen(...args), candidate.api.__probeReferenceConstraintPen(...args), {index, a, b, deg, pull});
      compare('cuestrike', candidate.api.cueRailLift(p.pos, p.phi, theta, pull, a, b, p.R, geom),
        lift(candidate.api.__probeReferenceConstraintPen(...args, geom), c), {index, a, b, deg, pull});
      if (report.unsafe_zero_plant.cases < 32) testUnsafePlant(args, geom, {index, table: p.id, a, b, deg, pull});
    }
  }
}
const raw = fs.readFileSync(options['--post-input']);
const post = JSON.parse(raw).results.find(r => r.name === 'candidate').render.cuepost;
assert(post.complete && post.errors.length === 0 && post.fold_samples.length > 0, 'complete actual cuepost pose input');
assert.equal(post.surfaces[0].source_cue_sha256, sha(sources.source('candidate', 'web/scene/cuestick.js')), 'same cue source');
report.post_input = {path: path.resolve(options['--post-input']), sha256: sha(raw), samples: post.fold_samples.length};
for (const [index, row] of post.fold_samples.entries()) {
  const [surface, x, y, z, bx, by, bz, drop] = row, geom = geoms.get(post.surfaces[surface].table);
  assert(geom && Number.isFinite(drop) && drop >= 0);
  const args = [x, y - drop, z, bx, by, bz, geom], cos = Math.hypot(bx, bz);
  compare('cuepost_pose', lift(candidate.api.__probeConstraintPen(...args), cos),
    lift(candidate.api.__probeReferenceConstraintPen(...args), cos), {index, table: post.surfaces[surface].table});
}
// Execute a submitted-source plant which incorrectly proves every ray clear.
// Its live fold must disagree with the pinned full enumerator on real poses.
report.unsafe_zero_plant.caught = report.unsafe_zero_plant.cases > 0
  && report.unsafe_zero_plant.mismatches === report.unsafe_zero_plant.cases;
report.pass = report.mismatches === 0 && report.functions.every(x => x.pass) && report.unsafe_zero_plant.caught;
fs.writeFileSync(path.resolve(options['--out']), JSON.stringify(report, null, 2) + '\n');
console.log(`CUE-RENDER-FOLD ${report.pass ? 'PASS' : 'FAIL'} ${JSON.stringify(report.counts)}, mismatches ${report.mismatches}, positive controls ${report.positive_reference_folds}`);
process.exitCode = report.pass ? 0 : 1;
