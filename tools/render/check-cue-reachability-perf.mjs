#!/usr/bin/env node

// Copyright (c) Meta Platforms, Inc. and affiliates.

// HISTORICAL joined-floor benchmark, retained for the pre-separation record.
// It does not measure the current live render bend or prove gameplay parity.
// Use check-cue-render-bend-perf.mjs for the current live path.
// Local-only, paired complete-path benchmark. Never a load-coupled CI gate.
// Native ESM variants execute in one process/runtime, with identical inputs.
// Run at utility in an otherwise empty CPU window; no browser is involved.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {patchCueFloorReference} from './lib/cue-floor-reference.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const options = {'--base': '10983e70', '--reference': 'a1197467', '--rounds': '3', '--angles': '24'};
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i], value = process.argv[i + 1];
  if (!['--base', '--reference', '--out', '--rounds', '--angles'].includes(key) || !value) throw new Error(`Invalid argument ${key}`);
  options[key] = value;
}
assert(options['--out'], '--out is required');
const rounds = Number(options['--rounds']), angleCount = Number(options['--angles']);
assert(Number.isInteger(rounds) && rounds > 0 && Number.isInteger(angleCount) && angleCount >= 4);
const git = args => execFileSync('git', ['-C', ROOT, ...args], {encoding: 'utf8', maxBuffer: 32 * 1024 * 1024});
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const refs = {base: git(['rev-parse', options['--base']]).trim(), reference: git(['rev-parse', options['--reference']]).trim(), fixed: null};
refs.original = refs.reference;
refs.law_base = refs.reference;
const baseUrl = pathToFileURL(ROOT + '/').href;
const sources = new Map();
const source = (variant, rel) => {
  const key = variant + ':' + rel;
  if (!sources.has(key)) {
    let text = refs[variant] ? git(['show', `${refs[variant]}:${rel}`]) : fs.readFileSync(path.join(ROOT, rel), 'utf8');
    if (rel === 'web/scene/cuestick.js' && ['reference', 'law_base'].includes(variant))
      text = patchCueFloorReference(text, {withoutJoinFloor: variant === 'law_base'});
    sources.set(key, text);
  }
  return sources.get(key);
};
registerHooks({
  resolve(specifier, context, next) {
    const result = specifier === 'three'
      ? {url: baseUrl + 'web/vendor/three.module.min.js', shortCircuit: true}
      : next(specifier, context);
    const variant = context.parentURL && new URL(context.parentURL).searchParams.get('cue_benchmark');
    if (variant && result.url.startsWith(baseUrl + 'web/')) {
      const url = new URL(result.url); url.searchParams.set('cue_benchmark', variant);
      return {...result, url: url.href};
    }
    return result;
  },
  load(url, context, next) {
    if (url.startsWith(baseUrl + 'web/')) {
      const parsed = new URL(url), variant = parsed.searchParams.get('cue_benchmark');
      if (variant) {
        parsed.search = '';
        return {format: 'module', source: source(variant, path.relative(ROOT, fileURLToPath(parsed))), shortCircuit: true};
      }
    }
    return next(url, context);
  },
});
globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.location = {search: ''};
globalThis.localStorage = {getItem: () => null};

const allVariants = [];
for (const name of Object.keys(refs)) {
  const api = await import(baseUrl + `web/scene/cuestick.js?cue_benchmark=${name}`);
  allVariants.push({name, api, geoms: new Map(), times: [], byPocket: new Map()});
}
const variants = allVariants.slice(0, 3), original = allVariants[3], lawBase = allVariants[4];
const ids = ['diamond_proam_9ft', 'diamond_proam_8ft', 'diamond_proam_7ft'];
const preparation = [];
for (const v of allVariants) for (const id of ids) {
  const start = performance.now(); v.geoms.set(id, v.api.railGeomFor(id));
  preparation.push({variant: v.name, id, elapsed_ms: performance.now() - start});
}
const R = 0.028575, grid = [], targeted = [];
for (const id of ids) for (const sign of [-1, 1]) for (const x of [-0.0345, 0.0345]) for (const depth of [0.015, 0.005, 0.001]) {
  const g = variants[2].geoms.get(id);
  targeted.push({id, pocket: sign < 0 ? 's-' : 's+', case: 'nose-glue-strip',
    pos: {x, y: R, z: sign * (g.W / 2 - depth)}, phi: sign > 0 ? Math.PI : 0,
    capR: 0.5 * (1 + 0.0106 / R), balls: []});
}
for (const id of ids) {
  const g = variants[2].geoms.get(id);
  const pockets = [{name: 's-', ux: 0, uz: -1}, {name: 's+', ux: 0, uz: 1},
    ...[-1, 1].flatMap(sx => [-1, 1].map(sz => ({name: `c${sx},${sz}`, ux: sx * Math.SQRT1_2, uz: sz * Math.SQRT1_2})))];
  for (const p of pockets) for (const lateral of [-0.018, 0, 0.018]) {
    const side = p.ux === 0;
    const pos = {x: side ? lateral : Math.sign(p.ux) * (g.L / 2 - 0.05) - p.uz * lateral,
      y: R, z: side ? p.uz * (g.W / 2 - R - 0.008) : Math.sign(p.uz) * (g.W / 2 - 0.05) + p.ux * lateral};
    const capR = lateral === 0 ? 0.5 : 0.5 * (1 + 0.0106 / R);
    const balls = lateral > 0 ? [{x: pos.x - p.ux * 0.072, y: R, z: pos.z - p.uz * 0.072, r: R}] : [];
    for (let i = 0; i < angleCount; i++) {
      const phi = Math.atan2(-p.ux, -p.uz) + (i / angleCount - 0.5) * 2 * Math.PI;
      grid.push({id, pocket: p.name, pos, phi, capR, balls});
    }
  }
}
const call = (v, row) => v.api.cueReachability(row.pos, row.phi, 80, v.geoms.get(row.id), R, row.balls, row.capR);
const pct = (values, q) => { const a = [...values].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(a.length * q))]; };
const stats = values => ({samples: values.length, p50_ms: pct(values, 0.5), p90_ms: pct(values, 0.9), max_ms: Math.max(...values)});
const reachTolerance = 90 / 2 ** 14, exactTolerance = 90 / 2 ** 28;
const classificationCaps = [0, 10, 20, 40, 80];
const report = {schema: 'cue-reachability-performance/3', started_at: new Date().toISOString(), node: process.version,
  instrument_sha256: sha(fs.readFileSync(fileURLToPath(import.meta.url))), geometry_preparation: preparation,
  reference_patch_sha256: sha(fs.readFileSync(new URL('./lib/cue-floor-reference.mjs', import.meta.url))),
  platform: process.platform, arch: process.arch, cpu: os.cpus()[0]?.model, load1_start: os.loadavg()[0],
  base: refs.base, reference: refs.reference, head: git(['rev-parse', 'HEAD']).trim(),
  dirty: git(['status', '--porcelain']).trim() !== '', rounds, angle_count: angleCount, grid_count: grid.length,
  grid_sha256: sha(JSON.stringify(grid)), targeted_count: targeted.length, targeted_sha256: sha(JSON.stringify(targeted)),
  warmup_calls_per_variant: 72, cold: [], slow_rows: [],
  floor_law: {rule: 'At non-open stations, max(joinTop, railTop or frameTop). Existing collar priority is unchanged.',
    reference: 'Slow a1197467 with the identical floor-composition patch; no enumeration or bisection changes.',
    base_law: 'Same-root a1197467 with the joined floor disabled; crossing enumeration retained.',
    original_source_sha256: sha(source('original', 'web/scene/cuestick.js')),
    base_law_source_sha256: sha(source('law_base', 'web/scene/cuestick.js')),
    reachability_inputs_checked: 0, exact_inputs_checked: 0, changed_inputs: [], failures: [], historical_base_differences: []},
  agreement: {reachability_values: 0, exact_solve_values: 0, classifications: 0, classification_caps: classificationCaps,
    reachability_tolerance_deg: reachTolerance, exact_solve_tolerance_deg: exactTolerance,
    max_abs_deg: 0, max_reachability_abs_deg: 0, max_exact_abs_deg: 0,
    nonidentical_values: 0, bit_exact: true, failures: [], classification_failures: []}};
for (const v of variants) {
  for (let i = 0; i < 72; i++) {
    const row = grid[(i * 37) % grid.length], start = performance.now(); call(v, row);
    if (i < 3) report.cold.push({variant: v.name, id: row.id, elapsed_ms: performance.now() - start});
  }
}
function agree(label, row, a, b, tolerance = reachTolerance) {
  const d = Math.abs(a - b);
  report.agreement.max_abs_deg = Math.max(report.agreement.max_abs_deg, d);
  const key = label.startsWith('exact:') ? 'max_exact_abs_deg' : 'max_reachability_abs_deg';
  report.agreement[key] = Math.max(report.agreement[key], d);
  if (!Object.is(a, b)) { report.agreement.bit_exact = false; report.agreement.nonidentical_values++; }
  if (!Number.isFinite(d) || d > tolerance) report.agreement.failures.push({label, ...row, reference: a, fixed: b, difference: d, tolerance});
  for (const cap of classificationCaps) {
    report.agreement.classifications++;
    if ((a > cap) !== (b > cap)) report.agreement.classification_failures.push({label, ...row, cap, reference: a > cap, fixed: b > cap});
  }
}
function changedValue(label, row, before, after, base, historical, tolerance) {
  const difference = after - before;
  const value = {label, original_deg: before, fixed_deg: after, increase_deg: difference,
    same_root_base_deg: base, historical_base_deg: historical, tolerance_deg: tolerance,
    classifications: classificationCaps.filter(cap => (before > cap) !== (after > cap))
      .map(cap => ({cap_deg: cap, original: before > cap, fixed: after > cap}))};
  if (!Number.isFinite(difference) || difference < 0 || Math.abs(after - base) > tolerance)
    report.floor_law.failures.push({...row, ...value});
  if (Math.abs(after - historical) > tolerance) report.floor_law.historical_base_differences.push({...row, ...value});
  return value;
}
function recordReachabilityLaw(row, fixed, historical) {
  report.floor_law.reachability_inputs_checked++;
  const before = call(original, row);
  const changed = before.floors.flatMap((v, i) => Object.is(v, fixed.floors[i]) ? [] : [i]);
  if (!changed.length && Object.is(before.maxFloorDeg, fixed.maxFloorDeg) && before.deadCount === fixed.deadCount) return;
  const base = call(lawBase, row), values = changed.map(i => changedValue(`reachability:${i}`, row,
    before.floors[i], fixed.floors[i], base.floors[i], historical.floors[i], reachTolerance));
  if (!Object.is(before.maxFloorDeg, fixed.maxFloorDeg)) values.push(changedValue('maxFloorDeg', row,
    before.maxFloorDeg, fixed.maxFloorDeg, base.maxFloorDeg, historical.maxFloorDeg, reachTolerance));
  report.floor_law.changed_inputs.push({kind: 'reachability', ...row, values,
    original_dead_count: before.deadCount, fixed_dead_count: fixed.deadCount});
}
const started = performance.now();
for (let round = 0; round < rounds; round++) {
  for (let i = 0; i < grid.length; i++) {
    const row = grid[i], results = {}, times = {};
    // Counterbalance branch order per input, so a daemon or thermal shift
    // does not consistently favour one implementation.
    for (let k = 0; k < variants.length; k++) {
      const v = variants[(i + round + k) % variants.length], start = performance.now();
      results[v.name] = call(v, row);
      const ms = performance.now() - start, key = row.id + '/' + row.pocket;
      times[v.name] = ms;
      v.times.push(ms);
      if (!v.byPocket.has(key)) v.byPocket.set(key, []);
      v.byPocket.get(key).push(ms);
    }
    if (round === 0) {
      const a = results.reference, b = results.fixed;
      if (b.deadCount !== a.deadCount) report.agreement.classification_failures.push({label: 'deadCount', ...row, reference: a.deadCount, fixed: b.deadCount});
      for (let j = 0; j < a.floors.length; j++) { agree(`reachability:${j}`, row, a.floors[j], b.floors[j]); report.agreement.reachability_values++; }
      agree('maxFloorDeg', row, a.maxFloorDeg, b.maxFloorDeg);
      recordReachabilityLaw(row, b, results.base);
    }
    report.slow_rows.push({round, ...row, times});
  }
  console.log(JSON.stringify({round: round + 1, elapsed_ms: performance.now() - started,
    variants: Object.fromEntries(variants.map(v => [v.name, stats(v.times)])), agreement: report.agreement.failures.length}));
}
for (const row of targeted) {
  const a = call(variants[1], row), b = call(variants[2], row);
  if (b.deadCount !== a.deadCount) report.agreement.classification_failures.push({label: 'deadCount', ...row, reference: a.deadCount, fixed: b.deadCount});
  for (let j = 0; j < a.floors.length; j++) { agree(`reachability:${j}`, row, a.floors[j], b.floors[j]); report.agreement.reachability_values++; }
  agree('maxFloorDeg', row, a.maxFloorDeg, b.maxFloorDeg);
  recordReachabilityLaw(row, b, call(variants[0], row));
}
for (const row of [...grid, ...targeted]) for (const [a, b] of [[0, 0], [row.capR * 0.6, -row.capR * 0.8], [-row.capR * 0.6, row.capR * 0.8],
  ...(row.case ? [[-row.capR, 0], [row.capR, 0]] : [])]) {
  const solve = v => v.api.cueMinElevationDeg(row.pos, row.phi, a, b, v.geoms.get(row.id), R, row.balls);
  const after = solve(variants[2]), before = solve(original);
  agree(`exact:${a},${b}`, row, solve(variants[1]), after, exactTolerance); report.agreement.exact_solve_values++;
  report.floor_law.exact_inputs_checked++;
  if (!Object.is(before, after)) report.floor_law.changed_inputs.push({kind: 'exact', ...row, a, b,
    values: [changedValue(`exact:${a},${b}`, row, before, after, solve(lawBase), solve(variants[0]), exactTolerance)]});
}
report.slow_rows.sort((a, b) => b.times.fixed - a.times.fixed);
report.slow_rows.length = Math.min(report.slow_rows.length, 48);
report.variants = Object.fromEntries(variants.map(v => [v.name, {...stats(v.times),
  source_cuestick_sha256: sha(source(v.name, 'web/scene/cuestick.js')), source_table_sha256: sha(source(v.name, 'web/scene/table.js')),
  by_pocket: Object.fromEntries([...v.byPocket].map(([key, values]) => [key, stats(values)]))}]));
report.ratios = Object.fromEntries([...variants[0].byPocket].map(([key, values]) => [key,
  report.variants.fixed.by_pocket[key].p90_ms / stats(values).p90_ms]));
report.p90_ratio = report.variants.fixed.p90_ms / report.variants.base.p90_ms;
report.elapsed_ms = performance.now() - started;
report.finished_at = new Date().toISOString(); report.load1_end = os.loadavg()[0];
report.agreement.pass = report.agreement.failures.length === 0 && report.agreement.classification_failures.length === 0;
report.floor_law.pass = report.floor_law.failures.length === 0;
report.performance_pass = report.p90_ratio <= 1.2 && Object.values(report.ratios).every(r => r <= 1.2);
report.pass = report.agreement.pass && report.performance_pass && report.floor_law.pass;
fs.mkdirSync(path.dirname(path.resolve(options['--out'])), {recursive: true});
fs.writeFileSync(options['--out'], JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({pass: report.pass, agreement: report.agreement.pass, bit_exact: report.agreement.bit_exact,
  p90_ratio: report.p90_ratio, elapsed_ms: report.elapsed_ms}));
process.exitCode = report.pass ? 0 : 1;
