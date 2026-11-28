// Copyright (c) Meta Platforms, Inc. and affiliates.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bootModuleGraph, observedModuleSet, assertSettledBootCensus, literalDynamicImports } from './cn8_boot_checks.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const recorded = JSON.parse(fs.readFileSync(new URL('./fixtures/transport-boot-census.json', import.meta.url)));
const transport = graph => graph.modules.filter(name => /\/cn8transport[^/]*\.js$/.test(name));

test('A1 the real served census settles beyond first draw and rejects the real shell import plant', () => {
  assert.equal(assertSettledBootCensus(recorded.rows).settled_boots, 20);
  const planted = recorded.rows.map(row => row.table === recorded.shell_plant.table && row.direction === recorded.shell_plant.direction
    ? recorded.shell_plant : row);
  assert.throws(() => assertSettledBootCensus(planted), /CN8_TRANSPORT_BOOT_GRAPH/);
  assert.throws(() => assertSettledBootCensus(recorded.rows.slice(1)), /missing or duplicate boot/);
  const early = structuredClone(recorded.rows); early[0].settle.stable_module_ms = 0;
  assert.throws(() => assertSettledBootCensus(early), /not settled/);
});

test('A1 import() boot edges and measured computed leaves expose a shell.js or atelier.js static-import plant', () => {
  const observedModules = observedModuleSet(recorded.rows), graph = bootModuleGraph(ROOT, { observedModules });
  assert.deepEqual(transport(graph), []); assert.deepEqual(graph.observed_not_reached, []);
  assert.ok(graph.edges.some(row => row.from === 'web/app/main.js' && row.to === 'web/app/shell.js'
    && row.kind.startsWith('literal-import()')));
  assert.ok(observedModules.includes('web/app/atelier.js'));
  for (const name of ['web/app/shell.js', 'web/app/atelier.js']) {
    const source = fs.readFileSync(path.join(ROOT, name), 'utf8');
    for (const prefix of ['', '/* a same-line comment is not an import boundary */ ']) {
      const planted = bootModuleGraph(ROOT, { observedModules,
        overrides: { [name]: prefix + "import * as plant from '../scene/cn8transport.js';\n" + source } });
      assert.equal(transport(planted).length, 4, name);
    }
  }
  assert.deepEqual(literalDynamicImports("// import('./fake.js')\nconst x=\"import('./fake2.js')\"; import /* adjacent */ ('./shell.js');"), ['./shell.js']);
});
