// Copyright (c) Meta Platforms, Inc. and affiliates.

// Regenerate/check the committed complete-solid transport, without a browser.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { buildTransportInputs } from './cpu_table_inputs.mjs';
import { solveTransport } from './solve_transport.mjs';
import * as identity from '../../../web/scene/cn8transport-core.js';
import * as codec from '../../../web/scene/cn8transport-codec.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const sha = value => createHash('sha256').update(value).digest('hex');
const DOC = 'docs/geometry/cn8-pocket-d3-transport.json';
const MODULE = 'web/scene/cn8transport-data.js';
const TABLE = 'web/scene/table.js';
export function solverIdentity(root = ROOT) {
  const files = ['tools/render/ghcn8/cn8_transport_solver.mjs', 'tools/render/ghcn8/solve_transport.mjs',
    'tools/render/ghcn8/cn8_contact_law.mjs',
    'tools/render/ghcn8/cn8_closed_solids.mjs', 'tools/render/ghcn8/cn8_embedded_receivers.mjs',
    'tools/render/ghcn8/cn8_receiver_topology.mjs', 'tools/render/ghcn8/cn8_receiver_census.mjs',
    'web/scene/cn8transport-core.js', 'web/vendor/three.module.min.js',
    'tools/render/ghcn8/cpu_table_inputs.mjs', 'tools/render/ghcn8/cn8_emitted_checks.mjs',
    'tools/render/ghcn8/gen_transport_artifact.mjs', 'web/scene/cn8transport-codec.js',
    'docs/geometry/cn8-pocket-d3-transport-compat.json'];
  const sources = Object.fromEntries(files.map(file => [file, sha(fs.readFileSync(path.join(root, file)))]));
  const table = fs.readFileSync(path.join(root, TABLE), 'utf8');
  // Includes the profile/knit input recipes as well as the ray constructor.
  // Normalising this generated field removes the self-hash cycle; no other
  // renderer byte is omitted from the generator's source-version check.
  const versions = table.match(/const CN8_TRANSPORT_SOLVER_VERSION = '[0-9a-f]{64}';/g);
  if (versions?.length !== 1) throw new Error('Exactly one generated solver version is required');
  sources['table.js:complete-renderer-except-generated-version'] = sha(table.replace(
    /const CN8_TRANSPORT_SOLVER_VERSION = '[0-9a-f]{64}';/,
    "const CN8_TRANSPORT_SOLVER_VERSION = '<generated>';"));
  // The recipe key includes every static dependency of the builder, not
  // just table.js. In particular the middle-pocket builders and their law
  // module must invalidate a cached solve even when the call site is held.
  const seen = new Set(), queue = [TABLE];
  while (queue.length) {
    const name = queue.pop();
    if (seen.has(name)) continue;
    seen.add(name);
    const text = fs.readFileSync(path.join(root, name), 'utf8');
    if (name !== TABLE) sources[name] = sha(text);
    for (const specifier of new vm.SourceTextModule(text, { identifier: name }).dependencySpecifiers) {
      if (specifier === 'three') queue.push('web/vendor/three.module.min.js');
      else if (specifier.startsWith('.')) queue.push(path.posix.normalize(path.posix.join(path.posix.dirname(name), specifier.replace(/[?#].*$/s, ''))));
      else throw new Error('Unrecorded builder dependency: ' + name + ' -> ' + specifier);
    }
  }
  const start = table.indexOf('function cn8D3CoverRayTree('), end = table.indexOf('const CN8_R82 =', start);
  if (start < 0 || end < 0) throw new Error('Complete-solid query source is absent');
  sources['table.js:cn8D3CoverRayTree+cn8D3SolidRayTree'] = sha(table.slice(start, end));
  return { sha256: sha(JSON.stringify(sources)), sources,
    table_scope: 'Whole file except one generated version constant. No minimal-slice completeness proof is claimed.',
    extraction_recipe: 'This generator is itself hashed; its full-file normalization and ray-tree extraction are covered.' };
}
export function serialized(artifact) {
  const json = JSON.stringify(artifact) + '\n';
  const compatibility = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/geometry/cn8-pocket-d3-transport-compat.json'), 'utf8'));
  const frozen = artifact.compatibility_results;
  if (frozen && (frozen.source_artifact_sha256 !== compatibility.source_artifact_sha256
    || frozen.rows.length !== compatibility.result_bindings.length
    || frozen.rows.some((row, i) => JSON.stringify(row.aliases) !== JSON.stringify(compatibility.result_bindings[i].aliases)
      || sha(JSON.stringify(row.results)) !== compatibility.result_bindings[i].sha256))) {
    throw new Error('CN8_TRANSPORT_COMPAT_RESULTS_MISMATCH: frozen results differ from the immutable descriptor');
  }
  const references = compatibility.result_bindings.map((row, i) => {
    const index = artifact.entries.findIndex(entry => JSON.stringify(entry.aliases) === JSON.stringify(row.aliases)
      && sha(JSON.stringify(entry.results)) === row.sha256);
    if (index >= 0) return `currentArtifact.entries[${index}].results`;
    if (frozen) return `currentArtifact.compatibility_results.rows[${i}].results`;
    throw new Error('CN8_TRANSPORT_COMPAT_RESULTS_MISMATCH: old callers need their exact light-response bytes');
  });
  return { json, module: '// Generated by tools/render/ghcn8/gen_transport_artifact.mjs.\n'
    + '// Byte mirror of docs/geometry/cn8-pocket-d3-transport.json; DERIVED, never an authored shade ladder.\n'
    + 'export const currentArtifact = ' + json.trimEnd() + ';\n'
    + '// FIX9 callers see their original descriptor and byte-identical results.\n'
    + 'const compatibility = ' + JSON.stringify(compatibility.artifact) + ';\n'
    + '// Share a current result only when its hash agrees; otherwise retain the frozen result.\n'
    + 'const compatibilityResults = [' + references.join(',') + '];\n'
    + 'export const artifact = { ...compatibility, entries: compatibility.entries.map((entry, i) => ({ ...entry,\n'
    + '  results: compatibilityResults[i] })) };\n' };
}

async function frozenCompatibility(root) {
  // This is a locked input, not a new solve for the old renderer. The full
  // reconstructed FIX9 artifact and each result must match the immutable
  // descriptor before any current output can be written. An archive export
  // needs no Git history or external file to reproduce this input.
  const descriptor = JSON.parse(fs.readFileSync(path.join(root, 'docs/geometry/cn8-pocket-d3-transport-compat.json'), 'utf8'));
  const module = new vm.SourceTextModule(fs.readFileSync(path.join(root, MODULE), 'utf8'), { context: vm.createContext({}) });
  await module.link(() => { throw new Error('CN8_TRANSPORT_COMPAT_IMPORT_REFUSED'); });
  await module.evaluate();
  const legacy = module.namespace.artifact;
  if (!legacy || sha(JSON.stringify(legacy) + '\n') !== descriptor.source_artifact_sha256) {
    throw new Error('CN8_TRANSPORT_COMPAT_RESULTS_MISMATCH: source artifact is not the immutable FIX9 artifact');
  }
  return { tag: 'DERIVED / immutable compatibility input, retained without re-solving or relabelling',
    source_commit: descriptor.source_commit, source_artifact_sha256: descriptor.source_artifact_sha256,
    rows: descriptor.result_bindings.map((binding, i) => {
      const entry = legacy.entries[i];
      if (!entry || JSON.stringify(entry.aliases) !== JSON.stringify(binding.aliases)
        || sha(JSON.stringify(entry.results)) !== binding.sha256) throw new Error('CN8_TRANSPORT_COMPAT_RESULTS_MISMATCH');
      return { aliases: binding.aliases, results: JSON.parse(JSON.stringify(entry.results)) };
    }) };
}
function encodeRow(row) {
  return { name: row.name, ...(row.coefficients ? { coefficients: codec.encode(row.coefficients),
    field: Object.fromEntries(Object.entries(row.field).map(([key, value]) => [key,
      ArrayBuffer.isView(value) ? codec.encode(value) : value])) } : { color: codec.encode(row.color) }) };
}
function generationInputDigest({ group, G, K, clothMat }) {
  // Alias reuse is checked only by this offline generator, on one engine.
  // Runtime identity must never reject an engine's floating-point rounding.
  group.updateMatrixWorld(true);
  const rows = [], inverse = group.matrixWorld.clone().invert();
  group.traverse(object => {
    if (!object.isMesh) return;
    const g = object.geometry, position = g.getAttribute('position');
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    rows.push({ name: object.name, visible: object.visible,
      matrix: inverse.clone().multiply(object.matrixWorld).elements,
      attributes: g.attributes, index: g.index, groups: g.groups,
      draw: [g.drawRange.start, Math.min(g.index?.count ?? position.count, g.drawRange.start + g.drawRange.count)],
      smooth: g.userData.cn8Smooth ?? null, transport: g.userData.cn8Transport ?? null,
      materials: materials.map(m => m ? [m.visible, m.transparent, m.opacity] : null) });
  });
  const { id: _alias, ...physicalGeometry } = G;
  return sha(JSON.stringify(identity.canonical({ rows, G: physicalGeometry, K, cloth: clothMat.color })));
}
export async function generate({ root = ROOT } = {}) {
  const started = performance.now(), solver = solverIdentity(root), entries = [], receipts = [];
  const compatibilityResults = await frozenCompatibility(root);
  const inputDigests = new Map();
  for (const tableId of ['chinese8_pro_9ft', 'joy_q8_9ft']) {
    const inputs = await buildTransportInputs({ root, tableId });
    const measured = identity.transportIdentity(inputs.group, inputs.G, inputs.K, solver.sha256);
    const inputDigest = generationInputDigest(inputs);
    const existing = entries.find(row => row.key === measured.key);
    if (existing) {
      if (inputDigests.get(measured.key) !== inputDigest) throw new Error('CN8_GENERATION_ALIAS_INPUT_MISMATCH');
      existing.aliases.push(tableId);
      receipts.push({ table: tableId, key: measured.key, build_ms: inputs.build_ms,
        offline_input_sha256: inputDigest,
        source: 'byte-identical complete inputs, shared solved artifact' });
      continue;
    }
    console.log(JSON.stringify({ phase: 'solve', tableId, key: measured.key,
      members: measured.members.length, triangles: measured.triangles, build_ms: inputs.build_ms }));
    const solved = solveTransport(inputs, { progress: row => console.log(JSON.stringify({ phase: 'occupancy', ...row })) });
    entries.push({ key: measured.key, aliases: [tableId], inputs: measured.inputs,
      members: measured.members, triangles: measured.triangles,
      contact_quantum: solved.contact,
      embedded_receivers: { tag: 'DERIVED / closed-solid invalid sample inherits nearest FREE column then one-ring, or mesh-edge path for unstructured cloth; named refusal',
        visibility: 'E-BLEED/E-HIDDEN is disclosure only; full positive-witness receipt accompanies generation',
        rows: solved.embedded.rows.filter(row => row.inherited.length).map(row => ({ name: row.name, stride: row.stride,
          donors: row.inherited.map(d => [d.vertex, d.source_vertex, d.method]) })) },
      results: solved.results.map(encodeRow) });
    inputDigests.set(measured.key, inputDigest);
    receipts.push({ table: tableId, key: measured.key, build_ms: inputs.build_ms,
      offline_input_sha256: inputDigest,
      timers: solved.timers, cache: solved.cache, contact: solved.contact,
      embedded: solved.embedded.receipt });
  }
  const artifact = { schema: 1, tag: 'DERIVED / complete-solid light transport',
    input_tags: ['MODEL(Star, cross-model)', 'MFR', 'PHOTO', 'EST'],
    provenance: 'Input construction tags are owned by cn8-pocket-d3-seal.json and the D3 sections; no reference pixels or purchased geometry are embedded.',
    query_law: 'Open ray endpoint; exact incident triangles excluded. Hits strictly inside one DERIVED Float32 table-space quantum are contact/seam; equality and farther hits remain occluders.',
    receiver_law: 'Proved closed-solid interiors and separately disclosed retained quantum/opposed contacts inherit a FREE receiver in their own column, then one-ring; no donor gives a named refusal. Boundary and depth are disclosure only. Open carriers never become occupied volumes. No geometry is changed.',
    solver_version: solver.sha256, solver_sources: solver.sources, entries,
    compatibility_results: compatibilityResults };
  return { artifact, receipt: { tag: 'DERIVED / fresh CPU generation',
    elapsed_ms: performance.now() - started, solver, tables: receipts } };
}
export async function main(argv) {
  let check = false, write = false, out = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--check') check = true;
    else if (argv[i] === '--write') write = true;
    else if (argv[i] === '--out' && argv[i + 1]) out = path.resolve(argv[++i]);
    else throw new Error('Usage: gen_transport_artifact.mjs (--check|--write) [--out new-receipt.json]');
  }
  if (check === write || out && fs.existsSync(out)) throw new Error('One mode and a fresh optional receipt path required');
  const { artifact, receipt } = await generate(), bytes = serialized(artifact);
  const table = fs.readFileSync(path.join(ROOT, TABLE), 'utf8');
  const pattern = /const CN8_TRANSPORT_SOLVER_VERSION = '[0-9a-f]{64}';/;
  if (!pattern.test(table)) throw new Error('Missing runtime solver version');
  const desiredTable = table.replace(pattern, `const CN8_TRANSPORT_SOLVER_VERSION = '${artifact.solver_version}';`);
  let pass = true;
  for (const [file, desired] of [[DOC, bytes.json], [MODULE, bytes.module]]) {
    if (write) fs.writeFileSync(path.join(ROOT, file), desired);
    else if (!fs.existsSync(path.join(ROOT, file)) || fs.readFileSync(path.join(ROOT, file), 'utf8') !== desired) pass = false;
  }
  if (write) fs.writeFileSync(path.join(ROOT, TABLE), desiredTable);
  else if (table !== desiredTable) pass = false;
  Object.assign(receipt, { status: pass ? 'PASS' : 'FAIL-STALE-ARTIFACT', mode: check ? 'check' : 'write',
    files: [{ path: DOC, bytes: Buffer.byteLength(bytes.json), sha256: sha(bytes.json) },
      { path: MODULE, bytes: Buffer.byteLength(bytes.module), sha256: sha(bytes.module) }] });
  if (out) { fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, JSON.stringify(receipt, null, 2) + '\n'); }
  console.log(JSON.stringify(receipt, null, 2));
  if (!pass) process.exitCode = 1;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));
