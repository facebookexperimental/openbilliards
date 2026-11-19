#!/usr/bin/env node

// Copyright (c) Meta Platforms, Inc. and affiliates.

// Report-only controls. Synthetic measurements exercise the actual reporter;
// the canonical catalog supplies IDs, without building or measuring a scene.
// Run: node --test tools/render/test-pocket-assembly-report.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {test} from 'node:test';
import {init} from '../../web/dist/pool-sdk/index.js';
import {createPocketAssemblyReporter} from './check-pocket-assembly.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ENFORCED_IDS = ['diamond_proam_9ft', 'diamond_proam_8ft', 'diamond_proam_7ft',
  'pool_pro_9ft', 'pool_pro_9ft_measured', 'pool_pro_8ft', 'pool_pro_7ft'];
const DETAIL_LIMIT = 16;
const FAILURE_COUNT = 20376;
const FRAGMENT_COUNT = 29491;
const BED_TRIANGLE_COUNT = 2048;
const ENFORCED_ROW_COUNT = 4096;
// Backstop for this synthetic catalog fixture, not a stress bound or a cap
// on complete enforced diagnostics from real measurements.
const SIZE_BACKSTOP = 32 * 1024 * 1024;

function exerciseReport(results, options = {}, beforeFinish = () => {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pocket-assembly-report-'));
  const out = path.join(directory, 'nested', 'report.json');
  const report = {schema: 'pocket-assembly/4', tables: []};
  const log = console.log, write = fs.writeFileSync, lines = [];
  let writes = 0;
  try {
    console.log = line => lines.push(JSON.parse(line));
    fs.writeFileSync = function (target, ...args) {
      if (target === out) writes++;
      return write.call(fs, target, ...args);
    };
    const reporter = createPocketAssemblyReporter(report, {...options, '--out': out});
    for (const result of results) {
      reporter.record(result);
      assert.equal(writes, 0, 'no cumulative report write inside the table loop');
      assert.equal(fs.existsSync(out), false);
    }
    // Check bounds before serialization: an uncapped nested-array regression
    // must fail here, rather than allocate its multi-gigabyte JSON string.
    beforeFinish(report);
    assert.equal(reporter.finish(), report);
    assert.equal(writes, 1, 'exactly one final report write');
    const bytes = fs.readFileSync(out);
    assert.ok(bytes.length < SIZE_BACKSTOP, `report ${bytes.length} bytes exceeds backstop ${SIZE_BACKSTOP}`);
    assert.equal(bytes.at(-1), 10);
    assert.equal(bytes.indexOf(10), bytes.length - 1, 'compact output has exactly one newline, at its end');
    assert.equal(lines.at(-1).report_bytes, bytes.length, 'the final summary reports the written byte count');
    return {report: JSON.parse(bytes.toString('utf8')), lines, bytes: bytes.length};
  } finally {
    console.log = log;
    fs.writeFileSync = write;
    fs.rmSync(directory, {recursive: true, force: true});
  }
}

test('the table loop delegates accumulation and the single final write to the reporter', () => {
  const source = fs.readFileSync(new URL('./check-pocket-assembly.mjs', import.meta.url), 'utf8');
  const reporterStart = source.indexOf('export function createPocketAssemblyReporter(');
  const checkerStart = source.indexOf('export async function checkPocketAssembly(');
  const cliStart = source.indexOf('\nif (process.argv[1] &&');
  assert.ok(reporterStart >= 0 && checkerStart > reporterStart && cliStart > checkerStart);
  const reporter = source.slice(reporterStart, checkerStart), checker = source.slice(checkerStart, cliStart);
  for (const site of ['writeFileSync(', 'report.tables.push(']) {
    assert.equal(source.split(site).length - 1, 1, `one ${site} in the checker source`);
    assert.equal(reporter.split(site).length - 1, 1, `${site} belongs to the reporter`);
  }
  assert.equal(checker.split('reporter.record(result);').length - 1, 1);
  assert.equal(checker.split('return reporter.finish();').length - 1, 1);
  assert.match(checker, /for \(const id of ids\) \{[\s\S]*\n    reporter\.record\(result\);\n  \}\n  return reporter\.finish\(\);\n\}/);
});

test('reporter creation removes a stale completed report before any table is recorded', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pocket-assembly-stale-report-'));
  const out = path.join(directory, 'report.json');
  try {
    fs.writeFileSync(out, JSON.stringify({verdict: 'PASS_ENFORCED', tables: [{id: 'stale'}]}) + '\n');
    createPocketAssemblyReporter({schema: 'pocket-assembly/4', tables: []}, {'--out': out});
    assert.equal(fs.existsSync(out), false, 'an interrupted run must not leave the previous verdict at --out');
  } finally {
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

function enforcedResult(id) {
  return {id, enforced: true, status: 'PASS', defects: [], phase_ms: {}, elapsed_ms: 1,
    closure: {status: 'PASS', rows: Array.from({length: ENFORCED_ROW_COUNT}, (_, i) =>
      ({sample: i, kind: 'side', status: 'PASS', gap_mm: 0.01}))},
    contact: {status: 'PASS', unresolved: [], rows: Array.from({length: ENFORCED_ROW_COUNT}, (_, i) =>
      ({sample: i, kind: 'side', active: true, status: 'PASS', face_gap_mm: 0.02}))},
    drop: {status: 'PASS', rows: Array.from({length: 31}, (_, i) =>
      ({sample: i, status: 'PASS', samples: 1, clearance_mm: 0.393}))}};
}

function auditedResult(id) {
  const passJoin = {kind: 'side', status: 'PASS', gap_mm: 0.01};
  const failJoin = {kind: 'side', status: 'FAIL', gap_mm: 7};
  const passContact = {kind: 'side', active: true, status: 'PASS', face_gap_mm: 0.02};
  const failContact = {kind: 'side', active: true, status: 'FAIL', face_gap_mm: 9};
  const detail = {mesh: 'synthetic-bed', triangle: 7,
    source_triangle_m: [[0, 0, 0], [0.1, 0, 0], [0, 0, 0.1]],
    segments: [[[0, 0], [0.1, 0.1]]],
    bed_triangles: Array(BED_TRIANGLE_COUNT).fill({triangle: 3,
      points: [[0, 0], [0.1, 0], [0, 0.1]]})};
  // Shared references keep the input fixture small; naive JSON output repeats
  // every occurrence and reproduces the cumulative report's size hazard.
  return {id, enforced: false, status: 'FAIL', phase_ms: {}, elapsed_ms: 1,
    defects: ['closure:side', 'contact:side', 'opening:side'],
    closure: {status: 'FAIL', rows: [
      ...Array(DETAIL_LIMIT).fill(passJoin), ...Array(FAILURE_COUNT).fill(failJoin)]},
    contact: {status: 'FAIL', unresolved: [], rows: [
      ...Array(DETAIL_LIMIT).fill(passContact), ...Array(FAILURE_COUNT).fill(failContact)]},
    opening: {status: 'FAIL', rows: Array.from({length: 12}, (_, i) => ({
      pocket: i >> 1, jaw: i % 2 ? 1 : -1, kind: 'side', status: i === 11 ? 'FAIL' : 'PASS',
      uncovered_fragments: i === 11 ? FRAGMENT_COUNT : 0,
      uncovered_segments: i === 11 ? FRAGMENT_COUNT : 0,
      witness: {depth_mm: i === 11 ? 4 : 0},
      uncovered_segment_details: i === 11 ? Array(FRAGMENT_COUNT).fill(detail) : [],
    }))}, drop: null, cue_floor: null};
}

test('full catalog report with synthetic drop rows bounds audited detail, preserves counts and writes once', async () => {
  const engine = await init(path.join(ROOT, 'web/dist/pool-wasm/pool_wasm.js'));
  const ids = engine.catalog().tables.map(table => table.id);
  assert.equal(ids.filter(id => ENFORCED_IDS.includes(id)).length, 7);
  assert.ok(ids.length > ENFORCED_IDS.length);
  const results = ids.map(id => ENFORCED_IDS.includes(id) ? enforcedResult(id)
    : id === 'umb_carom_284'
      ? {id, enforced: false, status: 'NOT_APPLICABLE', reason: 'pocketless table', defects: [], phase_ms: {}, elapsed_ms: 1}
      : auditedResult(id));
  const observed = exerciseReport(results, {}, report => {
    for (const table of report.tables.filter(table => !table.enforced && table.status === 'FAIL')) {
      assert.equal(table.closure.rows.length, DETAIL_LIMIT);
      assert.equal(table.contact.rows.length, DETAIL_LIMIT);
      assert.equal(table.opening.rows.length, 12);
      const details = table.opening.rows[11].uncovered_segment_details;
      assert.equal(details.length, DETAIL_LIMIT);
      for (const detail of details) assert.equal(detail.bed_triangles.length, DETAIL_LIMIT);
    }
  });
  assert.equal(observed.report.verdict, 'PASS_ENFORCED');
  assert.deepEqual(observed.report.tables.map(table => table.id), ids);
  assert.equal(observed.lines.length, ids.length + 1);
  const violations = results.filter(table => !table.enforced && table.status === 'FAIL').map(table => table.id);
  assert.deepEqual(observed.report.other_table_violations, violations);
  assert.deepEqual(observed.lines.at(-1), {verdict: 'PASS_ENFORCED', enforced_failures: [],
    other_table_violations: violations, report_bytes: observed.bytes});

  for (let i = 0; i < results.length; i++) {
    const original = results[i], table = observed.report.tables[i], summary = observed.lines[i];
    if (table.enforced) {
      assert.deepEqual(table, original, 'every enforced field and row survives serialization');
      assert.equal(table.closure.rows.length, ENFORCED_ROW_COUNT);
      assert.equal(table.closure.rows.at(-1).sample, ENFORCED_ROW_COUNT - 1);
      assert.equal(table.drop.rows.length, 31);
      assert.deepEqual(summary.drop, {status: 'PASS', cases: 31, non_pots: 0, minimum_clearance_mm: 0.393});
      continue;
    }
    if (table.status === 'NOT_APPLICABLE') continue;
    assert.equal(table.status, 'FAIL');
    assert.ok(table.closure.rows.every(row => row.status === 'PASS'), 'failures are beyond the retained prefix');
    assert.equal(summary.join_failures, FAILURE_COUNT);
    assert.equal(summary.join_max_mm, 7);
    assert.equal(summary.contact_failures, FAILURE_COUNT);
    assert.equal(summary.active_contact_max_mm, 9);
    assert.equal(summary.opening.uncovered_fragments, FRAGMENT_COUNT);
    assert.equal(summary.opening.uncovered_segments, FRAGMENT_COUNT);
    assert.equal(summary.opening.witnessed_depth_mm, 4);
    assert.deepEqual(table.audit_details.summary, summary);
    assert.deepEqual(table.defects, original.defects);
    assert.equal(table.opening.rows[11].uncovered_fragments, FRAGMENT_COUNT);
    for (const [pointer, total] of [
      ['/closure/rows', FAILURE_COUNT + DETAIL_LIMIT],
      ['/contact/rows', FAILURE_COUNT + DETAIL_LIMIT],
      ['/opening/rows/11/uncovered_segment_details', FRAGMENT_COUNT],
      ['/opening/rows/11/uncovered_segment_details/0/bed_triangles', BED_TRIANGLE_COUNT],
    ]) assert.deepEqual(table.audit_details.truncated_arrays.find(row => row.path === pointer),
      {path: pointer, total, retained: DETAIL_LIMIT, omitted: total - DETAIL_LIMIT});
    assert.equal(original.closure.rows.length, FAILURE_COUNT + DETAIL_LIMIT, 'input rows are not truncated in place');
    assert.equal(original.opening.rows[11].uncovered_segment_details[0].bed_triangles.length, BED_TRIANGLE_COUNT);
  }
});

test('an enforced non-Diamond failure retains every row and blocks the verdict', () => {
  const result = enforcedResult('wpa_generic_9ft');
  result.status = result.closure.status = 'FAIL';
  result.closure.rows.at(-1).status = 'FAIL';
  result.closure.rows.at(-1).gap_mm = 7;
  result.defects = ['closure:side'];
  const observed = exerciseReport([result]);
  assert.equal(observed.report.verdict, 'FAIL');
  assert.deepEqual(observed.report.tables[0], result);
  assert.equal(observed.lines[0].join_failures, 1);
  assert.equal(observed.lines[0].join_max_mm, 7);
  assert.deepEqual(observed.lines.at(-1).enforced_failures, ['wpa_generic_9ft']);
});

test('historical red controls use complete enforced rows and refuse incomplete measurements', () => {
  const result = enforcedResult('diamond_proam_9ft');
  result.status = result.closure.status = 'FAIL';
  result.closure.rows.at(-1).status = 'FAIL';
  result.witness = {status: 'FAIL', sphere_gap_mm: 7};
  result.defects = ['closure:side', 'replay:segment-10'];
  const refused = {id: 'wpa_generic_9ft', enforced: false, status: 'REFUSED', reason: 'synthetic refusal', defects: []};
  for (const options of [{'--expect-red': true}, {'--expect-defects': 'closure:side,replay:segment-10'}]) {
    assert.equal(exerciseReport([result], options).report.verdict, 'EXPECTED_RED');
    assert.equal(exerciseReport([result, refused], options).report.verdict, 'RED_DID_NOT_FIRE');
    const missing = {...result, witness: {status: 'PASS', sphere_gap_mm: 0}, defects: ['closure:side']};
    assert.equal(exerciseReport([missing], options).report.verdict, 'RED_DID_NOT_FIRE');
  }
});

test('an audited refusal remains listed; an enforced refusal blocks', () => {
  const refused = {id: 'wpa_generic_9ft', enforced: false, status: 'REFUSED', reason: 'synthetic refusal', defects: []};
  const audited = exerciseReport([enforcedResult('diamond_proam_9ft'), refused]);
  assert.equal(audited.report.verdict, 'PASS_ENFORCED');
  assert.deepEqual(audited.report.other_table_violations, ['wpa_generic_9ft']);
  const enforced = exerciseReport([{...refused, enforced: true}]);
  assert.equal(enforced.report.verdict, 'FAIL');
  assert.deepEqual(enforced.report.tables[0], {...refused, enforced: true});
});
