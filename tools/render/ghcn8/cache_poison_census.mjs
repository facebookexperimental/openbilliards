// Copyright (c) Meta Platforms, Inc. and affiliates.

// Exhaust the FIX9/FIX10 module-byte pairings, collapsing only identical
// source bytes. Execute the actual validate/apply graph on both real aliases.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { buildTransportInputs } from './cpu_table_inputs.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const files = ['app/main.js', 'scene/table.js', 'scene/cn8transport.js', 'scene/cn8transport-core.js',
  'scene/cn8transport-codec.js', 'scene/cn8transport-data.js', 'sw.js'];
async function graph(selected) {
  const context = vm.createContext({ performance, atob, btoa, TextEncoder, TextDecoder });
  const modules = new Map();
  const get = name => {
    if (!modules.has(name)) modules.set(name, new vm.SourceTextModule(selected[name].text, { context, identifier: name }));
    return modules.get(name);
  };
  const root = get('scene/cn8transport.js');
  await root.link((specifier, parent) => get(path.posix.normalize(path.posix.join(path.posix.dirname(parent.identifier), specifier))));
  await root.evaluate();
  return root.namespace;
}
export async function census(before, after = ROOT) {
  const roots = { before: path.resolve(before), after: path.resolve(after) };
  const sources = Object.fromEntries(Object.entries(roots).map(([side, root]) => [side,
    Object.fromEntries(files.map(name => { const bytes = fs.readFileSync(path.join(root, 'web', name));
      return [name, { text: bytes.toString(), sha256: sha(bytes), bytes: bytes.length }]; }))]));
  const versions = Object.fromEntries(Object.entries(sources).map(([side, modules]) => [side,
    modules['scene/table.js'].text.match(/const CN8_TRANSPORT_SOLVER_VERSION = '([a-f0-9]{64})'/)[1]]));
  const graphCache = new Map(), rows = [], executions = [];
  for (const alias of ['chinese8_pro_9ft', 'joy_q8_9ft']) {
    const inputs = {};
    for (const side of ['before', 'after']) inputs[side] = await buildTransportInputs({ root: roots[side], tableId: alias });
    const results = new Map();
    for (let mask = 0; mask < 2 ** files.length; mask++) {
      const sides = Object.fromEntries(files.map((name, bit) => [name, mask & (1 << bit) ? 'after' : 'before']));
      const selected = Object.fromEntries(files.map(name => [name, sources[sides[name]][name]]));
      const tableSide = sides['scene/table.js'], version = versions[tableSide];
      const graphKey = sha(JSON.stringify(files.filter(name => name.includes('cn8transport')).map(name => selected[name].sha256)));
      const executionKey = graphKey + '/' + tableSide;
      if (!results.has(executionKey)) {
        if (!graphCache.has(graphKey)) graphCache.set(graphKey, await graph(selected));
        const runtime = graphCache.get(graphKey), input = inputs[tableSide];
        let result;
        try {
          runtime.apply(input.group, input.G, input.K, input.clothMat, version);
          result = { status: 'BOOT-CAPABLE', runtime: { ...input.group.userData.cn8TransportArtifact } };
          assert.equal(result.runtime.status, 'PASS'); assert.equal(result.runtime.ui_solve_calls, 0);
        } catch (error) {
          assert.match(error.code ?? '', /^CN8_TRANSPORT_/);
          assert.equal(tableSide, 'after', 'A legacy caller without named reload must never receive an invalid new data default');
          result = { status: 'NAMED-REFUSAL', code: error.code,
            recovery: 'New table.js owns refuseBuild -> CN8_TABLE_RELOAD_REQUIRED and a working reload button; served V/X/Y arms exercise that path.' };
        }
        const execution = { id: executions.length, alias, graph_sha256: graphKey, table_side: tableSide,
          table_source_sha256: selected['scene/table.js'].sha256, solver_version: version, ...result };
        executions.push(execution); results.set(executionKey, execution.id);
      }
      rows.push({ alias, mask, modules: Object.fromEntries(files.map(name => [name,
        { side: sides[name], sha256: selected[name].sha256 }])), execution: results.get(executionKey),
        verdict: executions[results.get(executionKey)].status,
        worker_boundary: 'Either worker can supply any enumerated module-byte mixture. Worker install/control is additionally exercised by served old-SW/new-SW boot cases.' });
    }
  }
  return { status: 'PASS', tag: 'DERIVED exhaustive binary deploy-boundary census / actual runtime graph and table inputs',
    roots, bindings: Object.fromEntries(Object.entries(roots).map(([side, root]) => [side, {
      commit: execFileSync('git', ['rev-parse','HEAD'], { cwd:root,encoding:'utf8' }).trim(),
      tree: execFileSync('git', ['rev-parse','HEAD^{tree}'], { cwd:root,encoding:'utf8' }).trim(),
      clean: execFileSync('git', ['status','--porcelain'], { cwd:root,encoding:'utf8' }).trim() === '',
    }])), sources: Object.fromEntries(Object.entries(sources).map(([side, source]) => [side,
      Object.fromEntries(Object.entries(source).map(([name, { sha256, bytes }]) => [name, { sha256, bytes }]))])),
    aliases: 2, modules_per_boundary: files.length, rows, executions,
    totals: { rows: rows.length, boot_capable: rows.filter(row => row.verdict === 'BOOT-CAPABLE').length,
      named_refusals: rows.filter(row => row.verdict === 'NAMED-REFUSAL').length, unique_executions: executions.length },
    boundary: 'main.js readiness/refusal and SW install are tested by the served V1/V2/X/Y/worker cases. This CPU arm executes every distinct transport graph against actual table inputs; it does not claim 256 independent browser launches.',
    recipe_sha256: sha(fs.readFileSync(fileURLToPath(import.meta.url))) };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== '--before' || args[2] !== '--out' || fs.existsSync(args[3])) throw new Error('Expected --before clean-export --out new-receipt.json');
  const record = await census(args[1]);
  assert.ok(Object.values(record.bindings).every(row => row.clean), 'Census must bind clean exports');
  fs.writeFileSync(args[3], JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ status:record.status, totals:record.totals, out:args[3] }));
}
