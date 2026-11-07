// Copyright (c) Meta Platforms, Inc. and affiliates.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { equipmentFixture } from './transport_equipment_fixture.mjs';
import { CATALOG_TABLES, TRANSPORT_MODULES, assertBootCensus, staticModuleGraph } from './cn8_boot_checks.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const tableSource = fs.readFileSync(path.join(ROOT, 'web/scene/table.js'), 'utf8');
const prepareSource = tableSource.slice(tableSource.indexOf('let cn8Transport = null;'), tableSource.indexOf("import { injectAnalytic"));
const version = tableSource.match(/const CN8_TRANSPORT_SOLVER_VERSION = '([0-9a-f]{64})';/)[1];

async function preparation(moduleSource, importFailure = false) {
  const calls = [], context = vm.createContext({});
  const specs = Object.fromEntries(CATALOG_TABLES.map(id => [id, { render: { style: ['chinese8_pro_9ft', 'joy_q8_9ft'].includes(id) ? 'cn8' : 'other' } }]));
  const module = new vm.SourceTextModule(`const TABLE_SPECS=${JSON.stringify(specs)}; const CN8_TRANSPORT_SOLVER_VERSION=${JSON.stringify(version)};
    function resolveBootTableId(){return 'chinese8_pro_9ft';}\n${prepareSource}\nexport { prepareTableTransport };`, {
    context, importModuleDynamically: async specifier => {
      calls.push(specifier);
      if (importFailure) throw new Error('TEST ONLY missing module');
      const child = new vm.SourceTextModule(moduleSource, { context });
      await child.link(() => { throw new Error('Fixture must be a leaf'); }); await child.evaluate(); return child;
    },
  });
  await module.link(() => { throw new Error('Unexpected static edge'); }); await module.evaluate();
  return { prepare: module.namespace.prepareTableTransport, calls };
}

test('E1 the production static boot graph excludes every transport leaf, and a static-edge plant is red', () => {
  const graph = staticModuleGraph(ROOT);
  assert.ok(graph.includes('web/scene/table.js'));
  assert.deepEqual(graph.filter(name => /cn8transport[^/]*\.js$/.test(name)), []);
  const planted = staticModuleGraph(ROOT, 'web/app/main.js', { 'web/scene/table.js': "import * as plant from './cn8transport.js';\n" + tableSource });
  assert.equal(planted.filter(name => /cn8transport[^/]*\.js$/.test(name)).length, 4);
});

test('E1 both served directions require every alias, first frame, request and parsed-module lists', () => {
  const rows = CATALOG_TABLES.flatMap(table => ['forward', 'mirror'].map(direction => ({ table, direction,
    first_frame_ms: 1, requested_modules: table === 'chinese8_pro_9ft' || table === 'joy_q8_9ft' ? TRANSPORT_MODULES : [],
    parsed_modules: table === 'chinese8_pro_9ft' || table === 'joy_q8_9ft' ? TRANSPORT_MODULES : [] })));
  assert.equal(assertBootCensus(rows).boots, 20);
  const plant = structuredClone(rows); plant.find(row => row.table === 'diamond_proam_9ft').requested_modules.push('cn8transport-data.js');
  assert.throws(() => assertBootCensus(plant), /CN8_TRANSPORT_BOOT_GRAPH/);
  assert.throws(() => assertBootCensus(rows.slice(1)), /missing or duplicate boot/);
});

test('E1 non-CN8 preparation never requests a leaf; both aliases share one successful dynamic load', async () => {
  const fixture = await preparation('export function apply(){} export function validate(){}');
  for (const id of CATALOG_TABLES.filter(id => !['chinese8_pro_9ft', 'joy_q8_9ft'].includes(id))) assert.equal(fixture.prepare(id), null);
  assert.deepEqual(fixture.calls, []);
  await fixture.prepare('chinese8_pro_9ft');
  assert.equal(fixture.prepare('joy_q8_9ft'), null);
  assert.deepEqual(fixture.calls, ['./cn8transport.js']);
});

test('E3 dynamic import and missing capability refuse by distinct reachable names', async () => {
  const missing = await preparation('', true);
  await assert.rejects(missing.prepare(), { code: 'CN8_TRANSPORT_MODULE_IMPORT_FAILED' });
  const stale = await preparation('export function apply(){}');
  await assert.rejects(stale.prepare(), { code: 'CN8_TRANSPORT_ARTIFACT_MODULE_MISSING' });
});

test('E3 missing artifact and VERSION refusal survive the dynamic boundary', async () => {
  for (const code of ['CN8_TRANSPORT_ARTIFACT_MISSING', 'CN8_TRANSPORT_ARTIFACT_VERSION_MISMATCH']) {
    const fixture = await preparation(`export function apply(){} export function validate(){const e=new Error('${code}');e.code='${code}';throw e;}`);
    await assert.rejects(fixture.prepare(), { code });
    assert.equal(fixture.prepare('diamond_proam_9ft'), null);
  }
});

test('E3 the actual runtime detects an absent artifact before any receiver write', async () => {
  const source = fs.readFileSync(path.join(ROOT, 'web/scene/cn8transport.js'), 'utf8');
  const context = vm.createContext({ performance });
  const module = new vm.SourceTextModule(source, { context });
  await module.link(async specifier => new vm.SourceTextModule(specifier.endsWith('-data.js') ? 'export const artifact = null;' : 'export {};', { context }));
  await module.evaluate();
  assert.throws(() => module.namespace.validate(version), { code: 'CN8_TRANSPORT_ARTIFACT_MISSING' });
  assert.equal(module.namespace.diagnostics().ui_solve_calls, 0);
});

test('E3 the actual settings handler preserves every transport refusal name', async () => {
  for (const code of ['CN8_TRANSPORT_MODULE_IMPORT_FAILED', 'CN8_TRANSPORT_ARTIFACT_MISSING',
    'CN8_TRANSPORT_ARTIFACT_VERSION_MISMATCH', 'CN8_TRANSPORT_ARTIFACT_KEY_MISMATCH']) {
    const error = Object.assign(new Error(code), { code });
    let populates = 0;
    const f = equipmentFixture({
      prepare: () => code.endsWith('KEY_MISMATCH') ? null : Promise.reject(error),
      populate() { populates++; throw error; },
    });
    await f.ready; f.dispatch('chinese8_pro_9ft'); await f.settle();
    assert.equal(f.built.id, 'predator_apex_9ft');
    assert.equal(f.context._activeTableId, f.built.id);
    assert.equal(f.group.visible, false);
    assert.equal(f.group.userData.cn8TransportRefusal.code, code);
    assert.equal(f.group.userData.cn8TransportRefusal.ui_solve_calls, 0);
    assert.ok(f.surface.textContent.includes(code)); assert.equal(f.errors[0], error);
    assert.equal(populates, code.endsWith('KEY_MISMATCH') ? 1 : 0);
  }
});
