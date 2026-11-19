#!/usr/bin/env node

// Copyright (c) Meta Platforms, Inc. and affiliates.

// Blocking gameplay contract: the pocket appearance must not change main's
// aim inputs, slider/AUTO, reachability or the (a,b) shot-input clamp.
// MAIN is the pushed base whose web/ gameplay this change must equal. Re-pin
// only through a dated review record naming both full commits, the reason and
// the parity evidence; never silently use HEAD or a moving branch. The shared
// source loader owns that single pin and performs no fetch or fallback.
// Selftests plant the submitted source; no local-only history is required.
// --cuepost also audits the actual post-strike rod using canonical WASM records.
// The cuepost option builds the actual table surface in the reviewed CPU
// adapter; no browser or purchased-model input.
// node --experimental-vm-modules tools/render/check-cue-aim-floor.mjs [--selftest] [--cuepost] [--candidate <commit>] [--out <json>]
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
import {fileURLToPath} from 'node:url';
import {MAIN, sha, git, ids, PLANTS, installSources, defaultBindings, poseGrid, tipOffsets, variableSource} from './lib/cue-contract-source.mjs';
import {canvasEnvironment} from './lib/cuepost-rail-audit.mjs';

// Outside the candidate: neither a production edit nor its CUE_DIMS export
// can redefine this reviewed visual ceiling and make its own gate green.
const RAIL_MAX_PIN_M = 0.062;
canvasEnvironment();

const options = {};
for (let i = 2; i < process.argv.length; i++) {
  const key = process.argv[i];
  if (['--selftest', '--cuepost'].includes(key)) options[key] = true;
  else if (['--candidate', '--out'].includes(key) && process.argv[i + 1]) options[key] = process.argv[++i];
  else throw new Error(`Unknown or incomplete option ${key}`);
}
const sources = installSources({candidate: options['--candidate'] ?? null, plants: options['--selftest']});
const base = await sources.load('main'), candidateApi = await sources.load('candidate');
const grid = poseGrid(base), inputIds = [...new Set([...Object.keys(base.table.TABLE_SPECS),
  ...Object.keys(candidateApi.table.TABLE_SPECS)])].sort();
inputIds.push('<default>');
const solve = (v, row, a, b, balls = row.balls) => v.api.cueMinElevationDeg(row.pos, row.phi, a, b, v.geoms.get(row.id), row.R, balls);
const reach = (v, p) => v.api.cueReachability(p.pos, p.phi, 80, v.geoms.get(p.id), p.R, p.balls, p.capR).floors;
const clamp = (v, p, cap, a, b) => v.api.cueClampTip(p.pos, p.phi, cap, a, b, v.geoms.get(p.id), p.R, p.balls, p.capR);
const exactArray = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((n, i) => Object.is(n, b[i]));
const exactClamp = (a, b) => isDeepStrictEqual(Object.keys(a).sort(), Object.keys(b).sort())
  && Object.keys(a).every(k => Object.is(a[k], b[k]));
const report = {schema: 'cue-aim-floor/3', reference: MAIN, node: process.version, head: git(['rev-parse', 'HEAD']).trim(),
  instrument_sha256: sha(fs.readFileSync(fileURLToPath(import.meta.url))),
  loader_sha256: sha(fs.readFileSync(new URL('./lib/cue-contract-source.mjs', import.meta.url))),
  comparison: 'Object.is, no numerical tolerance', original_grid_count: grid.filter(p => p.id.startsWith('diamond_proam_')).length,
  grid_count: grid.filter(p => !p.worked).length, worked_count: grid.filter(p => p.worked).length,
  grid_sha256: sha(JSON.stringify(grid)), clamp_caps_deg: [40, 80], rail_max_pin_m: RAIL_MAX_PIN_M, results: []};
assert.equal(report.original_grid_count, 1296);
const reference = new Map();
function expected(index) {
  if (!reference.has(index)) {
    const p = grid[index];
    reference.set(index, {reach: reach(base, p), offsets: tipOffsets(p).map(([a, b]) => ({a, b, floor: solve(base, p, a, b),
      clamps: report.clamp_caps_deg.map(cap => clamp(base, p, cap, a, b))}))});
  }
  return reference.get(index);
}

function defaultBehaviour(v, indices) {
  const out = {sequence: [...ids, ids[0]], poses: 0, floors: 0, reachability_nodes: 0, clamps: 0, failures: 0, examples: []};
  const a = base.api.buildCue(), b = v.api.buildCue();
  const check = (kind, wanted, actual, equal, pose, extra = {}) => {
    if (!equal) { out.failures++;
      if (out.examples.length < 12) out.examples.push({kind, id: pose.id, pos: pose.pos, phi: pose.phi, ...extra, main: wanted, candidate: actual}); }
  };
  try {
    for (const id of out.sequence) {
      base.table.__probeSelectTable(id); v.table.__probeSelectTable(id);
      for (const index of indices) {
        const p = grid[index]; if (p.id !== id) continue;
        out.poses++;
        const reaches = [
          [base.api.cueReachability(p.pos, p.phi, 80, undefined, p.R, p.balls, p.capR).floors,
            v.api.cueReachability(p.pos, p.phi, 80, undefined, p.R, p.balls, p.capR).floors],
          [a.reachability(p.pos, p.phi, 80, p.R, p.balls, p.capR).floors,
            b.reachability(p.pos, p.phi, 80, p.R, p.balls, p.capR).floors],
        ];
        for (const [j, [x, y]] of reaches.entries()) {
          out.reachability_nodes += x.length; check(j ? 'buildCue.reachability' : 'default reachability', x, y, exactArray(x, y), p);
        }
        for (const [aa, bb] of tipOffsets(p)) {
          const floors = [
            [base.api.cueMinElevationDeg(p.pos, p.phi, aa, bb, undefined, p.R, p.balls),
              v.api.cueMinElevationDeg(p.pos, p.phi, aa, bb, undefined, p.R, p.balls)],
            [a.minElevationDeg(p.pos, p.phi, aa, bb, p.R, p.balls), b.minElevationDeg(p.pos, p.phi, aa, bb, p.R, p.balls)],
          ];
          for (const [j, [x, y]] of floors.entries()) {
            out.floors++; check(j ? 'buildCue.minElevationDeg' : 'default minElevationDeg', x, y, Object.is(x, y), p, {a: aa, b: bb});
          }
          for (const cap of report.clamp_caps_deg) {
            const clamps = [
              [base.api.cueClampTip(p.pos, p.phi, cap, aa, bb, undefined, p.R, p.balls, p.capR),
                v.api.cueClampTip(p.pos, p.phi, cap, aa, bb, undefined, p.R, p.balls, p.capR)],
              [a.clampTip(p.pos, p.phi, cap, aa, bb, p.R, p.balls, p.capR),
                b.clampTip(p.pos, p.phi, cap, aa, bb, p.R, p.balls, p.capR)],
            ];
            for (const [j, [x, y]] of clamps.entries()) {
              out.clamps++; check(j ? 'buildCue.clampTip' : 'default clampTip', x, y, exactClamp(x, y), p, {a: aa, b: bb, cap});
            }
          }
        }
      }
    }
  } finally {
    for (const rig of [a, b]) for (const m of rig.group.children) {
      m.geometry.dispose(); if (m.material.map?.obCueLookCached !== true) m.material.map?.dispose(); m.material.dispose();
    }
  }
  out.pass = out.failures === 0; return out;
}

function railCapPin(v) {
  if (v.name !== 'main_control') return {applicable: true,
    status: Object.is(v.api.CUE_DIMS.RAIL_MAX, RAIL_MAX_PIN_M) ? 'PASS' : 'FAIL',
    pass: Object.is(v.api.CUE_DIMS.RAIL_MAX, RAIL_MAX_PIN_M), value_m: v.api.CUE_DIMS.RAIL_MAX};
  // This exemption names only the fixed positive control, never a candidate
  // lacking the export. Main's internal value is independently checked below.
  assert.equal(sources.refs[v.name], MAIN);
  assert.equal(Object.hasOwn(v.api.CUE_DIMS, 'RAIL_MAX'), false);
  const text = sources.source(v.name, 'web/scene/cuestick.js');
  const declaration = variableSource(text, 'RAIL_MAX');
  assert.equal(declaration.replace(/\s+/g, ''), 'RAIL_MAX=0.062');
  const line = text.slice(0, text.indexOf(declaration)).split('\n').length;
  return {applicable: false, status: 'NOT_APPLICABLE', pass: null,
    reason: 'Pinned main does not export CUE_DIMS.RAIL_MAX; its internal constant is exactly 0.062 m.',
    internal_value_m: RAIL_MAX_PIN_M, source: `${MAIN}:web/scene/cuestick.js:${line}`, declaration};
}

function evaluate(v, indices, renderAudit = false) {
  const pin = railCapPin(v);
  const name = v.name, row = {name, commit: sources.refs[name] ?? report.head,
    source_table_sha256: sha(sources.source(name, 'web/scene/table.js')), source_cue_sha256: sha(sources.source(name, 'web/scene/cuestick.js')),
    default_bindings: defaultBindings(sources.source(name, 'web/scene/cuestick.js')), floor_inputs: [],
    default_behaviour: defaultBehaviour(v, indices), rail_max_m: v.api.CUE_DIMS.RAIL_MAX,
    rail_max_pin: pin, rail_max_pin_pass: pin.pass,
    poses: indices.length, solves: 0, floor_failures: 0, auto_failures: 0, nonidentical: 0, max_abs_deg: 0,
    reachability_nodes: 0, reachability_failures: 0, clamps: 0, clamp_failures: 0, clamped_controls: 0, examples: [],
    render: {audited: renderAudit, poses: 0, max_required_lift_m: 0, excess_count: 0, excess_examples: [],
      ball_floor_bend_count: 0, ball_floor_bend_examples: [], cuepost: {audited: false}}};
  for (const id of inputIds) {
    const a = base.api.railGeomFor(id === '<default>' ? undefined : id), b = v.api.railGeomFor(id === '<default>' ? undefined : id);
    row.floor_inputs.push({id, equal: (id === '<default>' || Object.hasOwn(base.table.TABLE_SPECS, id)
      && Object.hasOwn(v.table.TABLE_SPECS, id)) && isDeepStrictEqual(a, b), main_sha256: sha(JSON.stringify(a)), candidate_sha256: sha(JSON.stringify(b))});
  }
  const renderGeoms = renderAudit ? new Map(ids.map(id => [id, v.api.renderRailGeomFor(id)])) : null;
  const example = value => { if (row.examples.length < 24) row.examples.push(value); };
  for (const index of indices) {
    const pose = grid[index], ref = expected(index), actualReach = reach(v, pose);
    row.reachability_nodes += ref.reach.length;
    if (!exactArray(ref.reach, actualReach)) {
      row.reachability_failures++;
      example({kind: 'reachability', index, ...pose, main: ref.reach, candidate: actualReach});
    }
    for (const offset of ref.offsets) {
      const {a, b, floor: wanted} = offset, actual = solve(v, pose, a, b), delta = Math.abs(actual - wanted);
      row.solves++;
      const floorBad = !Object.is(wanted, actual), autoBad = Math.ceil(actual - 1e-9) !== Math.ceil(wanted - 1e-9);
      row.floor_failures += Number(floorBad); row.nonidentical += Number(floorBad); row.auto_failures += Number(autoBad);
      row.max_abs_deg = Math.max(row.max_abs_deg, delta);
      if (floorBad || autoBad || pose.worked) example({kind: 'elevation', index, ...pose, a, b,
        main_deg: wanted, candidate_deg: actual, difference_deg: actual - wanted, floorBad, autoBad});
      for (const [ci, cap] of report.clamp_caps_deg.entries()) {
        const c = clamp(v, pose, cap, a, b), e = offset.clamps[ci]; row.clamps++;
        row.clamped_controls += Number(e.clamped);
        if (!exactClamp(e, c)) { row.clamp_failures++; example({kind: 'clampTip', index, ...pose, a, b, cap, main: e, candidate: c}); }
      }
      if (renderGeoms && pose.id !== 'wpbsa_snooker_12ft') {
        const bend = v.api.cueRailLift(pose.pos, pose.phi, actual * Math.PI / 180, 0, a, b, pose.R, renderGeoms.get(pose.id));
        row.render.poses++;
        row.render.max_required_lift_m = Math.max(row.render.max_required_lift_m, bend.requiredLift);
        if (!Number.isFinite(bend.requiredLift) || bend.requiredLift > RAIL_MAX_PIN_M) {
          row.render.excess_count++;
          if (row.render.excess_examples.length < 12) row.render.excess_examples.push({...pose, a, b, floor_deg: actual, ...bend});
        }
        if (pose.balls.length && actual > solve(v, pose, a, b, []) + 90 / 2 ** 28 && bend.lift >= 0.001) {
          row.render.ball_floor_bend_count++;
          if (row.render.ball_floor_bend_examples.length < 12) row.render.ball_floor_bend_examples.push({...pose, a, b, floor_deg: actual, ...bend});
        }
      }
    }
  }
  row.floor_pass = row.floor_inputs.every(x => x.equal) && row.default_bindings.every(x => x.pass)
    && row.default_behaviour.pass && row.floor_failures === 0 && row.auto_failures === 0 && row.reachability_failures === 0 && row.clamp_failures === 0;
  row.pass = row.floor_pass && (!pin.applicable || pin.pass) && row.render.excess_count === 0;
  report.results.push(row);
  console.log(`${row.pass ? 'PASS' : 'FAIL'} ${name}: inputs ${row.floor_inputs.filter(x => x.equal).length}/${inputIds.length}, `
    + `bindings ${row.default_bindings.filter(x => x.pass).length}/${row.default_bindings.length}, exact floors ${row.solves - row.floor_failures}/${row.solves}, `
    + `AUTO ${row.auto_failures}, reachability rows red ${row.reachability_failures}, clamps ${row.clamps - row.clamp_failures}/${row.clamps}, `
    + `default behaviour red ${row.default_behaviour.failures}, 62 mm pin ${pin.status}`);
  return row;
}
const allIndices = grid.map((_, i) => i), candidate = evaluate(candidateApi, allIndices, true);
let controlsPass = true;
if (options['--selftest']) {
  controlsPass = evaluate(await sources.load('main_control'), allIndices).pass;
  // Each table, pocket, lateral row and worked repro remains represented in
  // the plant grid. Positive and candidate comparisons always use all poses.
  const plantIndices = allIndices.filter(i => grid[i].worked || i % 24 === 0);
  const catches = {
    render_inputs: r => r.floor_inputs.some(x => !x.equal) && r.floor_failures > 0,
    floor_value: r => r.floor_inputs.every(x => x.equal) && r.floor_failures > 0,
    reach_value: r => r.floor_inputs.every(x => x.equal) && r.floor_failures === 0 && r.reachability_failures > 0,
    clamp_value: r => r.floor_inputs.every(x => x.equal) && r.floor_failures === 0 && r.clamp_failures > 0,
    active_binding: r => r.default_bindings.some(x => x.name === 'activeRailGeom -> railGeomFor' && !x.pass),
    min_default: r => r.default_bindings.some(x => x.name === 'cueMinElevationDeg default' && !x.pass),
    reach_default: r => r.default_bindings.some(x => x.name === 'cueReachability default' && !x.pass),
    clamp_default: r => r.default_bindings.some(x => x.name === 'cueClampTip default' && !x.pass),
    build_binding: r => r.default_bindings.some(x => x.name === 'buildCue.clampTip' && !x.pass),
    hardcoded_id: r => r.default_bindings.every(x => x.pass) && r.default_behaviour.failures > 0,
    raised_rail_cap: r => r.floor_pass && !r.rail_max_pin_pass,
  };
  for (const name of Object.keys(PLANTS)) {
    const row = evaluate(await sources.load(name), plantIndices);
    row.plant_caught = catches[name](row) && !row.pass; controlsPass &&= row.plant_caught;
    console.log(`${row.plant_caught ? 'PASS' : 'FAIL'} submitted-source plant ${name}: expected arm rejects`);
  }
}
if (options['--cuepost']) {
  const {auditCuePost} = await import('./lib/cuepost-rail-audit.mjs');
  candidate.render.cuepost = await auditCuePost({sources, variant: candidateApi, grid, reference: base, onProgress: partial => {
    candidate.render.cuepost = partial; report.pass = false;
    if (options['--out']) fs.writeFileSync(path.resolve(options['--out']), JSON.stringify(report, null, 2) + '\n');
  }});
  candidate.pass &&= candidate.render.cuepost.pass;
}
report.pass = candidate.pass && controlsPass;
report.reference_table_sha256 = sha(sources.source('main', 'web/scene/table.js'));
report.reference_cue_sha256 = sha(sources.source('main', 'web/scene/cuestick.js'));
if (options['--out']) fs.writeFileSync(path.resolve(options['--out']), JSON.stringify(report, null, 2) + '\n');
console.log(`CUE-AIM-FLOOR ${report.pass ? 'PASS' : 'FAIL'}`);
process.exitCode = report.pass ? 0 : 1;
