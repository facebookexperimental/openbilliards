#!/usr/bin/env node

// Copyright (c) Meta Platforms, Inc. and affiliates.

// CPU measurement, not visual acceptance: each version's real aiming rod
// against that version's submitted leather, on the same fixed main poses.
// Run only in a placed utility leg. No browser, source write or new law.
// node --experimental-vm-modules tools/render/check-cue-live-float.mjs --baseline <round-4-aim.json> --out <json>
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {MAIN, sha, git, installSources, poseGrid, tipOffsets} from './lib/cue-contract-source.mjs';
import {canvasEnvironment, shaderReader, sampleRod} from './lib/cuepost-rail-audit.mjs';
import {buildRenderedLeatherSurface, renderedSurfaceControls} from './lib/rendered-leather-surface.mjs';

const options = {};
for (let i = 2; i < process.argv.length; i++) {
  const key = process.argv[i];
  assert(['--baseline', '--out'].includes(key) && process.argv[i + 1], `Unknown or incomplete option ${key}`);
  assert(!Object.hasOwn(options, key), `Repeated option ${key}`);
  options[key] = path.resolve(process.argv[++i]);
}
assert(options['--baseline'] && options['--out'], 'Both --baseline and --out are required');
assert(!fs.existsSync(options['--out']), 'Do not overwrite a measured result');
const baselineBytes = fs.readFileSync(options['--baseline']), baseline = JSON.parse(baselineBytes);
const old = baseline.results.find(r => r.name === 'candidate');
assert(old?.render.cuepost.complete && old.render.cuepost.errors.length === 0, 'Complete round-4 predecessor');
assert.equal(baseline.reference, MAIN, 'Same pushed main pin');
const oldFloat = old.render.cuepost.live_float;
assert(oldFloat && oldFloat.poses === 31122, 'Same full live grid');

canvasEnvironment();
const sources = installSources(), main = await sources.load('main'), candidate = await sources.load('candidate');
const grid = poseGrid(main);
assert.equal(sha(JSON.stringify(grid)), baseline.grid_sha256, 'Exact predecessor pose grid');
assert.equal(sha(sources.source('candidate', 'web/scene/table.js')), old.source_table_sha256, 'No runtime renderer edit');
assert.equal(sha(sources.source('candidate', 'web/scene/cuestick.js')), old.source_cue_sha256, 'No runtime cue edit');
const PARTS = ['tip', 'ferrule', 'shaft', 'joint', 'butt', 'cap'];
const finite = n => Number.isFinite(n) ? n : null;
const quantiles = values => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  const q = p => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? null;
  return {count: sorted.length, min: q(0), p50: q(0.5), p95: q(0.95), p99: q(0.99), max: q(1)};
};
assert.deepEqual(quantiles(Array.from({length: 100}, (_, i) => i + 1)),
  {count: 100, min: 1, p50: 51, p95: 96, p99: 100, max: 100});
assert.deepEqual(quantiles([]), {count: 0, min: null, p50: null, p95: null, p99: null, max: null});
const report = {schema: 'cue-live-float-comparison/1', reference: MAIN, head: git(['rev-parse', 'HEAD']).trim(),
  node: process.version, baseline_sha256: sha(baselineBytes), grid_sha256: baseline.grid_sha256,
  instrument_sha256: sha(fs.readFileSync(fileURLToPath(import.meta.url))),
  sampler_sha256: sha(fs.readFileSync(new URL('./lib/cuepost-rail-audit.mjs', import.meta.url))),
  quantile_definition: 'Sort finite values; index min(n-1, floor(p*n)); null for no sampled leather, never zero.',
  metric: 'Minimum vertical gap from any sampled drawn rod underside to actual leather directly beneath that sample.',
  primary_population: 'Each version: positive live bend, with at least one sampled leather intersection; same 31,122 requested poses.',
  paired_population: 'Identical pose, angle, tip offset and pull; main rod/main leather versus candidate rod/candidate leather. Missing leather is not a zero gap.',
  classification: 'Actual leather at the centerline of the closest rod section. An opening also requires the version-specific mouth carve to be open. The nearest underside sample itself always has leather beneath it.',
  sampling: 'Unchanged real default aim mesh/shader; vertices, post-deformation triangle centroids and edge midpoints; two stationary dt=1 poseCue calls.',
  visual_acceptance: false, rod_correction: 'none', surfaces: [], shaders: {}, rows: [], controls: [],
  complete: false, pass: false, verdict: 'RUNNING'};
report.controls.push({name: 'quantiles and empty population', pass: true});
report.controls.push({name: 'rendered surface controls', ...renderedSurfaceControls()});
const variants = [main, candidate], contexts = new Map(), shaders = new Map(variants.map(v => [v.name, new Set()]));
const rigs = new Map(variants.map(v => {
  const cue = v.api.buildCue({cueId: 'standard'});
  assert.equal(cue.group.children.length, PARTS.length, 'Six submitted cue parts');
  return [v.name, {cue, readers: cue.group.children.map(m => shaderReader(m, shaders.get(v.name)))}];
}));
const save = () => fs.writeFileSync(options['--out'], JSON.stringify(report, null, 2) + '\n');

async function context(v, id) {
  const key = `${v.name}:${id}`;
  if (!contexts.has(key)) {
    v.table.__probeSelectTable(id);
    if (v.api.prepareRailConstraintGeom) v.api.prepareRailConstraintGeom(id);
    const geom = v.api.railConstraintGeom();
    const surface = await buildRenderedLeatherSurface(sources, v, id);
    const recordIndex = report.surfaces.length;
    report.surfaces.push({variant: v.name, ...surface.record});
    contexts.set(key, {geom, surface, recordIndex});
  }
  return contexts.get(key);
}

function classify(point, ctx, v) {
  const [x, , z] = point, top = ctx.surface.height(x, z);
  if (Number.isFinite(top)) return {kind: 'OVER_LEATHER', top_m: top, mesh: ctx.surface.last.mesh,
    triangle: ctx.surface.last.triangle, evidence: 'Actual submitted triangle vertically beneath the section axis.'};
  const g = ctx.geom, ax = Math.abs(x) - g.L / 2, az = Math.abs(z) - g.W / 2, nd = Math.max(ax, az);
  const carve = g.mouths && nd > 0 && nd <= g.cushionWidth + g.frameWidth
    ? v.api.__probeMouthCarveAt(g.mouths, x, ax, az, nd, g.cushionWidth, -Infinity) : null;
  return {kind: carve?.open ? 'OVER_OPENING' : 'NO_LEATHER_AT_SECTION', top_m: null,
    evidence: carve?.open ? 'No submitted leather beneath the axis; the same version also classifies the mouth corridor as open.'
      : 'No submitted leather beneath the axis; do not infer an opening from absence alone.',
    nominal_mouth_open: carve?.open ?? null, outside_nose_m: nd};
}

function observe(v, p, a, b, thetaDeg, pull, ctx) {
  const {cue, readers} = rigs.get(v.name);
  for (let i = 0; i < 2; i++) v.api.poseCue(cue, p.pos, p.phi, thetaDeg * Math.PI / 180, pull, a, b, 1, p.R);
  cue.group.updateMatrixWorld(true);
  const flex = v.api.cueFlexState(cue);
  assert(Object.is(flex.bow, 0) && Object.is(flex.ringA, 0), 'Held aiming pose has no stroke or strike transient');
  const sampled = sampleRod(readers, ctx.geom, v.api, ctx.surface, {details: true, envelope: false});
  const measured = {surface_index: ctx.recordIndex, lift_m: flex.rail, fulcrum_s: flex.railS,
    clearance_m: finite(sampled.minClearance), penetration_m: sampled.depth,
    samples: sampled.samples, leather_samples: sampled.leatherSamples, closest: sampled.closest,
    section: sampled.closest ? PARTS[sampled.closest.rod_part_index] : null,
    section_axis: sampled.closest ? classify(sampled.closest.axis_point_m, ctx, v) : null,
    unbent_clearance_m: finite(sampled.minClearance), added_gap_m: finite(sampled.minClearance) === null ? null : 0};
  if (flex.rail > 0) {
    const saved = cue.flex.u.uRailA.value.clone();
    try {
      cue.flex.u.uRailA.value.set(0, 0, 0);
      const unbent = sampleRod(readers, ctx.geom, v.api, ctx.surface, {envelope: false});
      measured.unbent_clearance_m = finite(unbent.minClearance);
      measured.added_gap_m = Number.isFinite(sampled.minClearance) && Number.isFinite(unbent.minClearance)
        ? sampled.minClearance - unbent.minClearance : null;
    } finally { cue.flex.u.uRailA.value.copy(saved); }
    assert(cue.flex.u.uRailA.value.equals(saved), 'Restore the measured live shader after the unbent diagnostic');
  }
  return measured;
}

let controlsDone = false;
try {
  for (const [index, p] of grid.entries()) {
    if (p.id === 'wpbsa_snooker_12ft') continue;
    const ctx = new Map();
    for (const v of variants) { ctx.set(v.name, await context(v, p.id)); v.table.__probeSelectTable(p.id); }
    for (const [a, b] of tipOffsets(p)) {
      const floor = main.api.cueMinElevationDeg(p.pos, p.phi, a, b, main.geoms.get(p.id), p.R, p.balls);
      for (const [mode, thetaDeg] of [['floor', floor], ['AUTO', Math.max(0, Math.ceil(floor - 1e-9))]]) {
        if (thetaDeg > 80) continue;
        for (const pull of [0, 0.06, 0.12]) {
          const row = {ordinal: report.rows.length, index, table: p.id, pocket: p.pocket, pos: p.pos, phi: p.phi,
            bearing_deg: ((p.phi * 180 / Math.PI) % 360 + 360) % 360,
            a, b, mode, theta_deg: thetaDeg, pull, ball_radius_m: p.R, ball_obstacles: p.balls};
          for (const v of variants) row[v.name] = observe(v, p, a, b, thetaDeg, pull, ctx.get(v.name));
          row.candidate_minus_main_gap_m = row.main.clearance_m !== null && row.candidate.clearance_m !== null
            ? row.candidate.clearance_m - row.main.clearance_m : null;
          report.rows.push(row);
          if (!controlsDone && row.candidate.clearance_m !== null) {
            const {cue, readers} = rigs.get('candidate'), c = ctx.get('candidate'), original = row.candidate.clearance_m;
            const shifted = {last: null, height(x, z) { const y = c.surface.height(x, z); this.last = c.surface.last; return y + 0.005; }};
            const raised = sampleRod(readers, c.geom, candidate.api, shifted, {envelope: false});
            assert(Math.abs(raised.minClearance - (original - 0.005)) < 1e-12, 'A 5 mm higher real surface reduces the gap by 5 mm');
            const missing = sampleRod(readers, c.geom, candidate.api, {height: () => -Infinity}, {envelope: false});
            assert.equal(missing.minClearance, Infinity); assert.equal(missing.leatherSamples, 0);
            assert(cue.group.visible, 'Actual aiming rig is visible');
            report.controls.push({name: '5 mm surface displacement sign', pass: true, original_m: original, raised_m: raised.minClearance});
            report.controls.push({name: 'Missing leather is unmeasured, never zero', pass: true});
            controlsDone = true;
          }
        }
      }
    }
    if (index % 144 === 0) {
      console.log(`LIVE-FLOAT ${report.rows.length}/${oldFloat.poses} paired held poses`);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  assert.equal(report.rows.length, oldFloat.poses, 'Complete identical-pose population');
  const finiteGap = x => x.clearance_m !== null;
  const ranked = name => report.rows.filter(r => r[name].lift_m > 0 && finiteGap(r[name]))
    .sort((a, b) => b[name].clearance_m - a[name].clearance_m || a.ordinal - b.ordinal);
  report.summary = {};
  for (const v of variants) {
    const values = report.rows.map(r => r[v.name]), lifted = values.filter(x => x.lift_m > 0);
    const worst = ranked(v.name);
    report.summary[v.name] = {requested_poses: values.length, lifted_poses: lifted.length,
      no_leather_beneath_lifted: lifted.filter(x => !finiteGap(x)).length,
      section_axis_classes: Object.fromEntries(['OVER_LEATHER', 'OVER_OPENING', 'NO_LEATHER_AT_SECTION']
        .map(kind => [kind, lifted.filter(x => x.section_axis?.kind === kind).length])),
      primary_gap_m: quantiles(lifted.filter(finiteGap).map(x => x.clearance_m)),
      all_poses_gap_m: quantiles(values.filter(finiteGap).map(x => x.clearance_m)),
      added_gap_m: quantiles(lifted.filter(x => x.added_gap_m !== null).map(x => x.added_gap_m)),
      real_clip_poses_above_2mm: values.filter(x => x.penetration_m > 0.002).length,
      maximum_penetration_m: Math.max(...values.map(x => x.penetration_m)),
      maximum_commanded_lift_m: Math.max(...values.map(x => x.lift_m)),
      worst_pose: worst[0] ?? null};
    report.shaders[v.name] = [...shaders.get(v.name)].sort();
  }
  const c = report.summary.candidate;
  assert.equal(c.lifted_poses, oldFloat.lifted_poses, 'Reproduce round-4 lifted population');
  assert.equal(c.no_leather_beneath_lifted, oldFloat.no_leather_beneath, 'Reproduce round-4 missing leather');
  assert(Object.is(c.primary_gap_m.max, oldFloat.worst_float.clearance_m), 'Reproduce round-4 exact worst gap');
  assert(Object.is(c.maximum_commanded_lift_m, oldFloat.max_lift_m), 'Reproduce round-4 commanded lift');
  report.controls.push({name: 'Round-4 candidate metric reproduced exactly with unchanged runtime source', pass: true});
  const both = report.rows.filter(r => finiteGap(r.main) && finiteGap(r.candidate));
  const candidateLifted = both.filter(r => r.candidate.lift_m > 0);
  const overLeather = candidateLifted.filter(r => r.candidate.section_axis?.kind === 'OVER_LEATHER');
  report.paired = {both_have_leather: both.length, candidate_lifted_both_have_leather: candidateLifted.length,
    main_gap_on_candidate_lifted_population_m: quantiles(candidateLifted.map(r => r.main.clearance_m)),
    candidate_gap_on_same_population_m: quantiles(candidateLifted.map(r => r.candidate.clearance_m)),
    candidate_minus_main_m: quantiles(candidateLifted.map(r => r.candidate_minus_main_gap_m)),
    candidate_axis_over_leather: overLeather.length,
    over_leather_candidate_minus_main_m: quantiles(overLeather.map(r => r.candidate_minus_main_gap_m)),
    over_leather_positive_deltas: overLeather.filter(r => r.candidate_minus_main_gap_m > 0).length,
    note: 'A positive numeric delta is reported, not converted into visual acceptance or a new float tolerance.'};
  report.ten_worst_candidate = ranked('candidate').slice(0, 10);
  report.three_for_chrome = report.ten_worst_candidate.slice(0, 3).map(r => ({...r,
    views_required: ['same-angle oblique, candidate beside main', 'top-down, candidate beside main']}));
  report.worst_over_leather_delta = [...overLeather].sort((a, b) => b.candidate_minus_main_gap_m - a.candidate_minus_main_gap_m)[0] ?? null;
  assert(controlsDone && report.controls.every(c => c.pass) && report.surfaces.length === 8, 'All controls and both four-table surfaces');
  report.complete = true; report.pass = true; report.verdict = 'MEASUREMENT_COMPLETE_VISUAL_REVIEW_PENDING';
} catch (error) {
  report.error = {name: error.name, message: error.message, stack: error.stack};
  report.verdict = 'INSTRUMENT_OR_COMPLETENESS_ERROR'; process.exitCode = 1;
} finally {
  for (const {cue} of rigs.values()) for (const m of cue.group.children) {
    m.geometry.dispose(); if (m.material.map?.obCueLookCached !== true) m.material.map?.dispose(); m.material.dispose();
  }
  save();
}
for (const [name, value] of Object.entries(report.summary ?? {})) {
  console.log(`LIVE-FLOAT ${name}: ${JSON.stringify(value.primary_gap_m)}, worst ${value.worst_pose?.[name].section_axis?.kind}`);
}
console.log(`LIVE-FLOAT ${report.verdict}; no visual acceptance or source correction inferred`);
if (!report.pass) process.exitCode = 1;
