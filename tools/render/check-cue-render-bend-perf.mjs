#!/usr/bin/env node

// Copyright (c) Meta Platforms, Inc. and affiliates.

// Paired live-bend cost on the app-default pocket poses, current source vs
// the gameplay gate's pushed MAIN. This is a placed CPU measurement, not a
// load-coupled CI waiver. It times the real constraintPen/cueRailLift bodies
// with no explicit geom, after selecting pool_pro_9ft, as updateFlex does.
// --post-input supplies the real posed tip/axis corpus from the surface audit.
// Its diagnostic fold is timed separately; this does not add it to cuepost.
// No compiled floor solver, scene build, browser or purchased model here.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {MAIN, sha, git, installSources, poseGrid, tipOffsets, distribution} from './lib/cue-contract-source.mjs';

const options = {'--rounds': '9', '--repeat': '3'};
for (let i = 2; i < process.argv.length; i += 2) {
  const k = process.argv[i], v = process.argv[i + 1];
  assert(['--out', '--rounds', '--repeat', '--post-input'].includes(k) && v, `option ${k}`); options[k] = v;
}
assert(options['--out'] && options['--post-input'], '--out and --post-input are required');
const rounds = Number(options['--rounds']), repeat = Number(options['--repeat']);
assert(Number.isInteger(rounds) && rounds >= 5 && rounds <= 31 && Number.isInteger(repeat) && repeat >= 1 && repeat <= 20);
const sources = installSources(), main = await sources.load('main'), candidate = await sources.load('candidate');
for (const v of [main, candidate]) { v.table.__probeSelectTable('pool_pro_9ft'); assert.equal(v.table.activeTableId(), 'pool_pro_9ft'); }
const preparedAt = performance.now();
const preparedGeom = candidate.api.prepareRailConstraintGeom('pool_pro_9ft');
const prepareMs = performance.now() - preparedAt;
const rows = [];
for (const p of poseGrid(main).filter(p => p.id === 'pool_pro_9ft')) for (const [a, b] of tipOffsets(p)) {
  const floor = main.api.cueMinElevationDeg(p.pos, p.phi, a, b, main.geoms.get(p.id), p.R, p.balls);
  const theta = Math.max(0, Math.ceil(floor - 1e-9)) * Math.PI / 180;
  if (theta > 80 * Math.PI / 180) continue;
  for (const pull of [0, 0.06, 0.12]) {
    const dx = Math.sin(p.phi), dz = Math.cos(p.phi), c = Math.cos(theta), s = Math.sin(theta);
    const d = p.R + (main.api.CUE_DIMS.TIP_GAP + pull);
    const tip = [p.pos.x - dx * d * c - dz * a * p.R + dx * b * p.R * s,
      p.pos.y + d * s + c * b * p.R,
      p.pos.z - dz * d * c + dx * a * p.R + dz * b * p.R * s];
    rows.push({pose: p, a, b, theta, pull, tip, axis: [-dx * c, s, -dz * c]});
  }
}
assert(rows.length > 1000);
const postBytes = fs.readFileSync(options['--post-input']);
const post = JSON.parse(postBytes).results.find(r => r.name === 'candidate').render.cuepost;
assert(post.complete && post.errors.length === 0 && post.fold_samples.length > 0, 'complete actual pose corpus');
assert.equal(post.cuepost_sha256, sha(sources.source('candidate', 'web/app/cuepost.js')), 'same cuepost source');
assert(post.surfaces.every(s => s.source_cue_sha256 === sha(sources.source('candidate', 'web/scene/cuestick.js'))), 'same cue source');
const poolFrames = post.fold_samples.filter(r => post.surfaces[r[0]].table === 'pool_pro_9ft');
assert(poolFrames.length >= rows.length, 'default-table post corpus covers the paired sample count');
// Evenly select timing inputs only. The separate exact gate checks EVERY
// recorded post pose; no runtime height or pose is approximated/cached.
const postRows = rows.map((_, i) => poolFrames[Math.floor(i * poolFrames.length / rows.length)]);
let sink = 0;
const postGeoms = new Map([['candidate', preparedGeom]]);
const paths = {
  constraintPen: {inputs: rows, run: (v, p) => v.api.__probeConstraintPen(...p.tip, ...p.axis).pen},
  cueRailLift: {inputs: rows, run: (v, p) => v.api.cueRailLift(p.pose.pos, p.pose.phi, p.theta, p.pull, p.a, p.b, p.pose.R).lift},
  cuepostPoseFold: {inputs: postRows, run: (v, p) => {
    const [, x, y, z, bx, by, bz, drop] = p;
    const fold = v.api.__probeConstraintPen(x, y - drop, z, bx, by, bz, postGeoms.get(v.name));
    return Math.min(0.062, fold.pen / Math.max(Math.hypot(bx, bz), 0.35));
  }},
};
const report = {schema: 'cue-render-bend-perf/2', reference: MAIN, head: git(['rev-parse', 'HEAD']).trim(),
  node: process.version, platform: `${process.platform}/${process.arch}`, cpus: os.cpus().length, load_start: os.loadavg(),
  instrument_sha256: sha(fs.readFileSync(fileURLToPath(import.meta.url))),
  loader_sha256: sha(fs.readFileSync(new URL('./lib/cue-contract-source.mjs', import.meta.url))),
  table: 'pool_pro_9ft', poses: rows.length, grid_sha256: sha(JSON.stringify(rows)), rounds, repeat,
  ready_preparation_ms: prepareMs, ready_preparation: 'prepareRailConstraintGeom before first live query; ci39 checks the production READY hook',
  post_input: {path: path.resolve(options['--post-input']), sha256: sha(postBytes), available_default_frames: poolFrames.length,
    timed_frames: postRows.length, timing_grid_sha256: sha(JSON.stringify(postRows)), role: 'diagnostic posed-tip fold; cuepost product remains unchanged'},
  review_threshold_us: 5, policy: 'Any median above 5 us is reported for review first; no baseline reset, automatic allowance or load waiver',
  ordering: 'paired ABBA/BAAB, alternating by round; four warmup batches per path and revision', sources: {}, paths: []};
for (const v of [main, candidate]) report.sources[v.name] = {
  table_sha256: sha(sources.source(v.name, 'web/scene/table.js')), cue_sha256: sha(sources.source(v.name, 'web/scene/cuestick.js'))};
for (const [name, {run, inputs}] of Object.entries(paths)) {
  if (name === 'cuepostPoseFold') postGeoms.set('main', main.api.railConstraintGeom());
  const first = {};
  for (const v of [main, candidate]) {
    const start = performance.now(); sink += run(v, inputs[0]); first[v.name] = performance.now() - start;
  }
  const batch = v => {
    const start = process.hrtime.bigint();
    for (let k = 0; k < repeat; k++) for (const p of inputs) sink += run(v, p);
    return Number(process.hrtime.bigint() - start) / 1e6 / (repeat * inputs.length);
  };
  for (let i = 0; i < 4; i++) { batch(main); batch(candidate); }
  const times = {main: [], candidate: []}, paired = [];
  for (let i = 0; i < rounds; i++) {
    const order = i % 2 ? [candidate, main, main, candidate] : [main, candidate, candidate, main];
    const group = {main: [], candidate: []};
    for (const v of order) { const ms = batch(v); times[v.name].push(ms); group[v.name].push(ms); }
    paired.push({round: i, main_ms: (group.main[0] + group.main[1]) / 2,
      candidate_ms: (group.candidate[0] + group.candidate[1]) / 2});
  }
  const a = distribution(times.main), b = distribution(times.candidate);
  const ratio = b.p50 / a.p50;
  report.paths.push({name, inputs: inputs.length, first_call_ms: first, main_ms_per_call: a, candidate_ms_per_call: b,
    candidate_over_main: ratio, paired, no_regression: ratio <= 1, above_review_threshold: b.p50 * 1000 > 5});
  console.log(`LIVE-BEND ${name}: main ${(a.p50 * 1000).toFixed(3)} us/call, candidate ${(b.p50 * 1000).toFixed(3)} us/call, ratio ${ratio.toFixed(4)}`);
}
assert(Number.isFinite(sink));
report.sink = sink; report.load_end = os.loadavg(); report.pass = report.paths.every(p => p.no_regression);
report.report_for_review_first = report.paths.some(p => p.above_review_threshold);
fs.writeFileSync(path.resolve(options['--out']), JSON.stringify(report, null, 2) + '\n');
console.log(`LIVE-BEND-PERF ${report.pass ? 'PASS' : 'FAIL'} (no load waiver or retry)`);
if (report.report_for_review_first) console.log('LIVE-BEND REVIEW REQUIRED: median above 5 us; report before further work');
process.exitCode = report.pass ? 0 : 1;
