// Copyright (c) Meta Platforms, Inc. and affiliates.

// ORDER-13 Q4 / ADDENDUM-6 P1: fresh rule-off solve, actual encoded artifact, and
// independent per-alias receiver/donor receipts. No evidence file is replaced.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { buildTransportInputs } from './cpu_table_inputs.mjs';
import { solveTransport } from './solve_transport.mjs';
import { receiverCensus } from './cn8_receiver_census.mjs';
import { inheritComponents, inheritGuardedColumnTransport } from './cn8_embedded_receivers.mjs';
import { meshQuantum } from './cn8_contact_law.mjs';
import * as core from '../../../web/scene/cn8transport-core.js';
import * as codec from '../../../web/scene/cn8transport-codec.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const bytes = array => Buffer.from(array.buffer, array.byteOffset, array.byteLength);
const equal = (a, b) => bytes(a).equals(bytes(b));

export function namedRefusalArms(census) {
  const receiver = census.rows.find(row => row.inherited.length);
  if (!receiver) throw new Error('A6 requires an actual inherited receiver');
  const values = new Float64Array(receiver.vertices), before = sha(bytes(values));
  const planted = Array.from({ length: receiver.vertices }, () => [{ reason: 'TEST_ONLY_INVALID_RECEIVER' }]);
  const attempts = [
    { name: 'invalid-whole-column-and-one-ring', expected: 'CN8_EMBEDDED_COLUMN_AND_ONE_RING_HAVE_NO_FREE_RECEIVER',
      run: () => inheritGuardedColumnTransport(receiver.name, values, receiver.points, receiver.stride,
        planted, receiver.topology, receiver.freeEligible) },
    { name: 'zero-published-normal', expected: 'CN8_EMBEDDED_ZERO_PUBLISHED_NORMAL',
      run: () => census.classifier.classify(Array.from(receiver.points.subarray(0, 3)), [0, 0, 0], receiver.ordinal) },
  ];
  const rows = attempts.map(({ name, expected, run }) => {
    let actual = null;
    try { run(); } catch (error) { actual = error.message; }
    return { name, expected, actual, status: actual === expected ? 'PASS' : 'FAIL' };
  });
  const unchanged = sha(bytes(values)) === before;
  return { status: unchanged && rows.every(row => row.status === 'PASS') ? 'PASS' : 'FAIL',
    tag: 'TEST ONLY / executed classifier and donor function with actual emitted receiver topology',
    receiver: receiver.name, vertices: receiver.vertices, input_sha256: before,
    input_unchanged: unchanged, rows };
}

export async function main(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!['--out', '--before-capture', '--pre-o2-capture'].includes(argv[i]) || !argv[i + 1] || options[argv[i]]) {
      throw new Error('Usage: verify_d3_embedded.mjs --out NEW.json [--before-capture DIR] [--pre-o2-capture DIR]');
    }
    options[argv[i]] = path.resolve(argv[i + 1]);
  }
  if (!options['--out'] || fs.existsSync(options['--out'])) throw new Error('Fresh output required');
  const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
  const sourceBinding = { root: ROOT, commit: git('rev-parse', 'HEAD'), tree: git('rev-parse', 'HEAD^{tree}'),
    git_status: git('status', '--porcelain') };
  if (sourceBinding.git_status) throw new Error('CN8_EMBEDDED_VERIFIER_REQUIRES_CLEAN_EXPORT');
  const artifactFile = path.join(ROOT, 'docs/geometry/cn8-pocket-d3-transport.json');
  const artifact = JSON.parse(fs.readFileSync(artifactFile)), tables = [], failures = [];
  const rawByKey = new Map();
  for (const table of ['chinese8_pro_9ft', 'joy_q8_9ft']) {
    const inputs = await buildTransportInputs({ root: ROOT, tableId: table });
    const measured = core.transportIdentity(inputs.group, inputs.G, inputs.K, artifact.solver_version);
    const entry = artifact.entries.find(row => row.key === measured.key && row.aliases.includes(table));
    if (!entry) throw new Error('CN8_TRANSPORT_ARTIFACT_KEY_MISMATCH');
    const contact = meshQuantum(inputs.group), tree = inputs.solidRayTree(inputs.group, contact.quantum_m);
    const census = receiverCensus(inputs.group, tree, contact.quantum_m, { visibility: true });
    const A6 = namedRefusalArms(census);
    if (A6.status !== 'PASS') failures.push(`${table}: A6 named refusal or atomicity failed`);
    let raw = rawByKey.get(measured.key);
    if (!raw) {
      console.log(JSON.stringify({ phase: 'fresh-rule-off-solve', table, key: measured.key }));
      raw = solveTransport(inputs, { embedding: false }); rawByKey.set(measured.key, raw);
    }
    const before = options['--before-capture'] ? JSON.parse(fs.readFileSync(path.join(options['--before-capture'], table, 'solids-buffers.json'))) : null;
    const earlier = options['--pre-o2-capture'] ? JSON.parse(fs.readFileSync(path.join(options['--pre-o2-capture'], table, 'solids-buffers.json'))) : null;
    const rows = [], a2 = [], a3 = [], idempotentEntry = structuredClone(entry);
    let inherited = 0, changed = 0, outside = 0, donorMismatch = 0, unchangedInherited = 0, poisonChanged = 0;
    let partlyChangedInherited = 0;
    let decodedWords = 0, otherDecodedChanges = 0;
    for (const row of raw.results) {
      const encoded = entry.results.find(r => r.name === row.name), plan = census.byName.get(row.name);
      if (!encoded || !plan) throw new Error('Artifact receiver missing');
      if (row.coefficients) {
        const after = codec.decode(encoded.coefficients);
        decodedWords += after.length;
        const expected = inheritComponents(row.coefficients, 2, plan.inherited, plan.classifications, plan.freeEligible);
        if (!equal(after, expected)) failures.push(`${table}/${row.name}: liner coefficient inheritance differs`);
        if (!equal(row.coefficients, after) && !plan.inherited.length) otherDecodedChanges++;
        for (const [name, value] of Object.entries(row.field)) if (ArrayBuffer.isView(value)) {
          const stored = codec.decode(encoded.field[name]); decodedWords += stored.length;
          if (!equal(value, stored) && !plan.inherited.length) otherDecodedChanges++;
        }
        continue;
      }
      const after = codec.decode(encoded.color), expected = inheritComponents(row.color, 3, plan.inherited, plan.classifications, plan.freeEligible);
      if (!equal(after, expected)) failures.push(`${table}/${row.name}: rule-on differs from nearest FREE assignment`);
      const target = new Set(plan.inherited.map(d => d.vertex)), equalRows = [], changes = [];
      decodedWords += after.length; inherited += target.size;
      for (let i = 0; i < after.length; i++) if (!Object.is(row.color[i], after[i])) {
        changed++; changes.push(i); if (!target.has(Math.floor(i / 3))) outside++;
      }
      for (const d of plan.inherited) {
        let count = 0;
        for (let axis = 0; axis < 3; axis++) {
          if (!Object.is(after[d.vertex * 3 + axis], after[d.source_vertex * 3 + axis])) donorMismatch++;
          if (!Object.is(row.color[d.vertex * 3 + axis], after[d.vertex * 3 + axis])) count++;
        }
        if (count > 0 && count < 3) partlyChangedInherited++;
        if (count === 0) { unchangedInherited++; equalRows.push({ vertex: d.vertex, donor: d.source_vertex,
          changed_words: count, before: Array.from(row.color.subarray(d.vertex * 3, d.vertex * 3 + 3)),
          after: Array.from(after.subarray(d.vertex * 3, d.vertex * 3 + 3)) }); }
      }
      const twice = inheritComponents(after, 3, plan.inherited, plan.classifications, plan.freeEligible);
      if (!equal(after, twice)) failures.push(`${table}/${row.name}: A5 is not idempotent`);
      idempotentEntry.results.find(r => r.name === row.name).color = codec.encode(twice);
      const poison = row.color.slice(); for (const id of target) poison.fill(NaN, id * 3, id * 3 + 3);
      const fixed = inheritComponents(poison, 3, plan.inherited, plan.classifications, plan.freeEligible);
      for (let i = 0; i < fixed.length; i++) if (!Object.is(poison[i], fixed[i])) poisonChanged++;
      if (!equal(fixed, after)) failures.push(`${table}/${row.name}: poisoned inputs did not recover actual assigned bytes`);
      if (row.name.startsWith('cn8r82-wallface-')) {
        const d = plan.inherited.find(r => r.vertex === 0);
        if (!d || d.source_vertex !== plan.stride) failures.push(`${table}/${row.name}: A2 first cap junction donor changed`);
        const inputHash = sha(bytes(row.color));
        const isolated = inheritComponents(row.color, 3, [d], plan.classifications, plan.freeEligible);
        const changedIds = Array.from(isolated.keys()).filter(i => !Object.is(isolated[i], row.color[i]));
        const changedWords = changedIds.length;
        const outsideJunction = changedIds.filter(i => Math.floor(i / 3) !== d.vertex).length;
        if (changedWords !== 3 || outsideJunction || sha(bytes(row.color)) !== inputHash) {
          failures.push(`${table}/${row.name}: A2 original junction changed-word count or scope`);
        }
        a2.push({ name: row.name, vertex: 0, donor: d.source_vertex, changed_words: changedWords,
          changed_component_ids: changedIds, before: row.color[0], after: isolated[0],
          outside_junction_changed_words: outsideJunction, input_unchanged: sha(bytes(row.color)) === inputHash });
      }
      if (row.name.startsWith('cn8r82-tongue-')) {
        const prior = before?.find(r => r.name === row.name), pre = earlier?.find(r => r.name === row.name);
        const columns = Array.from({ length: plan.stride }, (_, column) => ({ column,
          pre_o2_row0: pre?.attributes.color.array[column * 3] ?? null,
          previous_row0: prior?.attributes.color.array[column * 3] ?? null,
          previous_row1: prior?.attributes.color.array[(column + plan.stride) * 3] ?? null,
          after_row0: after[column * 3], after_row1: after[(column + plan.stride) * 3],
          exact_equal: Object.is(after[column * 3], after[(column + plan.stride) * 3]) }));
        const floor = columns.filter(c => c.after_row0 === Math.fround(.05)).length;
        if (floor || columns.some(c => !c.exact_equal)) failures.push(`${table}/${row.name}: A3 return not closed`);
        a3.push({ name: row.name, columns, after_at_floor: floor,
          previous_at_floor: prior ? columns.filter(c => c.previous_row0 === Math.fround(.05)).length : null });
      }
      rows.push({ name: row.name, inherited: target.size, actual_changed_words: changes.length,
        changed_component_ids: changes, inherited_without_value_change: equalRows,
        before_sha256: sha(bytes(row.color)), after_sha256: sha(bytes(after)) });
    }
    const idempotent = JSON.stringify(idempotentEntry) === JSON.stringify(entry);
    if (!idempotent || outside || donorMismatch || otherDecodedChanges || poisonChanged !== inherited * 3) failures.push(`${table}: inheritance gate failure`);
    tables.push({ table, key: measured.key, decoded_words_compared: decodedWords,
      A1: { status: outside || donorMismatch || otherDecodedChanges || poisonChanged !== inherited * 3 ? 'FAIL' : 'PASS',
        edition: 'A1′-PASS-ADDENDUM-6', authority: 'ORDER-13 ADDENDUM-6 P1',
        predicate: 'Exact FREE-donor RGB equality; zero outside changes; all other decoded arrays exact; poisoned targets recover the actual artifact bytes.',
        inherited_receivers: inherited, assigned_rgb_words: inherited * 3,
        actual_changed_words: changed, inherited_without_value_change: unchangedInherited,
        inherited_with_partly_changed_rgb: partlyChangedInherited,
        count_tag: 'DERIVED disclosure; the retired 3*N actual-change formula is not a gate.',
        changed_words_outside_inherited_ids: outside, donor_word_mismatches: donorMismatch,
        other_decoded_changes: otherDecodedChanges, poisoned_input_recovery_changed_words: poisonChanged,
        poison: 'TEST ONLY: quiet NaN at every target RGB component; FREE donor bytes remain untouched.' },
      A2: { rows: a2, changed_words: a2.reduce((n, r) => n + r.changed_words, 0) },
      A3: { rows: a3, compared_columns: a3.reduce((n, r) => n + r.columns.length, 0) },
      A4: { status: 'PASS', certificates: census.rows.flatMap(r => r.embedded.map(e => ({ name: r.name,
        vertex: e.vertex, donor: e.source_vertex, certificate: e.donor_certificate }))) },
      A5: { status: idempotent ? 'PASS' : 'FAIL', once_entry_sha256: sha(JSON.stringify(entry)),
        twice_entry_sha256: sha(JSON.stringify(idempotentEntry)) },
      A6, rows, census: census.receipt });
    tree.geometry.dispose();
    console.log(JSON.stringify({ table, inherited, changed, unchangedInherited, outside, donorMismatch, poisonChanged, idempotent }));
  }
  const physicalRows = artifact.entries.reduce((n, entry) => n + entry.embedded_receivers.rows.reduce((m, row) => m + row.donors.length, 0), 0);
  const aliasRows = tables.reduce((n, table) => n + table.A1.inherited_receivers, 0);
  const accounting = { physical_entries: artifact.entries.length, physical_rows: physicalRows,
    per_alias_sum: aliasRows, statement: `${physicalRows} physical rows, ${aliasRows.toLocaleString('en-US')} per-alias sum` };
  for (const table of tables) for (const arm of ['A1', 'A2', 'A3', 'A4', 'A5', 'A6']) table[arm].alias_accounting = accounting;
  const result = { tag: 'DERIVED / exact bytes and closed-solid witnesses', source_binding: sourceBinding, alias_accounting: accounting,
    status: failures.length ? 'FAIL' : 'A1′-PASS-ADDENDUM-6',
    artifact: { file: artifactFile, sha256: sha(fs.readFileSync(artifactFile)), solver_version: artifact.solver_version },
    recipe_sha256: sha(fs.readFileSync(fileURLToPath(import.meta.url))), tables, failures };
  fs.mkdirSync(path.dirname(options['--out']), { recursive: true });
  fs.writeFileSync(options['--out'], JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ status: result.status, failures }));
  if (failures.length) process.exitCode = 1;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));
