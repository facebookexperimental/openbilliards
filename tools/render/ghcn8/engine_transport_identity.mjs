// Copyright (c) Meta Platforms, Inc. and affiliates.

// ORDER-16 P: execute the actual builder and identity in V8 and JavaScriptCore.
// Browser paint APIs are the same reviewed CPU boundary as artifact generation.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const JSC = '/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc';
const sha = data => createHash('sha256').update(data).digest('hex');

export function engineFixture(root, { inputOnly = false } = {}) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'cn8-engine-identity-'));
  fs.cpSync(path.join(root, 'web/scene'), path.join(temp, 'web/scene'), { recursive: true });
  fs.cpSync(path.join(root, 'web/dist/pool-sdk'), path.join(temp, 'web/dist/pool-sdk'), { recursive: true });
  fs.mkdirSync(path.join(temp, 'web/vendor'), { recursive: true });
  fs.copyFileSync(path.join(root, 'web/vendor/three.module.min.js'), path.join(temp, 'web/vendor/three.module.min.js'));
  const sources = {};
  // The builder's generated recovery copy (web/scene/cn8-boot-copy.js) is a
  // static, locale-loader-free scene-side dependency; it arrives with the
  // web/scene copy above and is executed and hashed like every scene module.
  for (const name of fs.readdirSync(path.join(temp, 'web/scene')).filter(name => name.endsWith('.js'))) {
    const file = path.join(temp, 'web/scene', name), text = fs.readFileSync(file, 'utf8');
    sources['web/scene/' + name] = sha(text);
    fs.writeFileSync(file, text.replaceAll("from 'three'", "from '../vendor/three.module.min.js'"));
  }
  for (const name of ['room', 'gi']) fs.writeFileSync(path.join(temp, 'web/scene', name + '.js'), 'export {};\n');
  if (inputOnly) fs.writeFileSync(path.join(temp, 'web/scene/cn8transport.js'),
    'export function validate() {}\nexport function apply(group) { group.userData.cn8TransportArtifact = { status: "CPU_INPUT_ONLY" }; }\n');
  fs.appendFileSync(path.join(temp, 'web/scene/table.js'), '\nexport { CN8_R82, cn8RingTexLoad, CN8_TRANSPORT_SOLVER_VERSION };\n');
  const cpu = fs.readFileSync(path.join(root, 'tools/render/ghcn8/cpu_table_inputs.mjs'), 'utf8');
  const start = cpu.indexOf('class CpuCanvas'), end = cpu.indexOf('export async function buildTransportInputs');
  if (start < 0 || end < start) throw new Error('CPU paint boundary was not found');
  fs.writeFileSync(path.join(temp, 'setup.mjs'), `
if (!globalThis.console) globalThis.console = { log: print, warn: print, error: print };
if (!globalThis.EventTarget) globalThis.EventTarget = class { addEventListener() {} removeEventListener() {} dispatchEvent() {} };
if (!globalThis.Event) globalThis.Event = class {};
if (!globalThis.ErrorEvent) globalThis.ErrorEvent = class extends Event { constructor(type, value) { super(type); Object.assign(this, value); } };
if (!globalThis.TextEncoder) globalThis.TextEncoder = class {
  encode(s) { return Uint8Array.from(unescape(encodeURIComponent(s)), c => c.charCodeAt(0)); }
};
if (!globalThis.atob) globalThis.atob = function(s) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/', result = [];
  let acc = 0, n = 0;
  for (const c of s) { const value = alphabet.indexOf(c); if (value < 0) continue;
    acc = (acc << 6) | value; n += 6; if (n >= 8) { n -= 8; result.push(String.fromCharCode((acc >> n) & 255)); }
  } return result.join('');
};
if (!globalThis.URLSearchParams) globalThis.URLSearchParams = class {
  constructor(s) { this.entries = Object.fromEntries(s.replace(/^\\?/, '').split('&').map(pair => pair.split('=').map(decodeURIComponent))); }
  get(key) { return this.entries[key] ?? null; } has(key) { return key in this.entries; }
};
${cpu.slice(start, end)}
globalThis.window = new EventTarget();
globalThis.localStorage = globalThis.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.location = { search: '?obtool=0' };
globalThis.HTMLCanvasElement = CpuCanvas; globalThis.ImageData = CpuImageData;
globalThis.setTimeout = () => 1; globalThis.clearTimeout = () => {};
globalThis.requestAnimationFrame = () => 1; globalThis.cancelAnimationFrame = () => {};
globalThis.document = {
  createElement: name => { if (name !== 'canvas') throw new Error('Unreviewed CPU DOM ' + name); return new CpuCanvas(); },
  createElementNS: (_ns, name) => { if (name === 'img') return new CpuImage(); if (name !== 'canvas') throw new Error('Unreviewed CPU DOM namespace ' + name); return new CpuCanvas(); }
}; window.document = document;
for (const name of ['clearMeasures', 'clearMarks', 'measure', 'mark']) if (!performance[name]) performance[name] = () => {};
`);
  return { temp, sources, inputOnly, paint_boundary_sha256: sha(cpu.slice(start, end)) };
}

export function runEngine(executable, fixture, tableId, program, { prelude = '' } = {}) {
  const name = path.join(fixture.temp, 'run-' + tableId + '.mjs');
  fs.writeFileSync(name, `import './setup.mjs';
${prelude}
const THREE = await import('./web/vendor/three.module.min.js');
const table = await import('./web/scene/table.js');
const shading = await import('./web/scene/shading.js');
const core = await import('./web/scene/cn8transport-core.js');
const tableId = ${JSON.stringify(tableId)};
await table.cn8RingTexLoad;
if (typeof table.buildTable.prepare === 'function') await table.buildTable.prepare(tableId);
const shared = shading.createShared({ lightPos: new THREE.Vector3(0, 1.02, 0),
  roomMin: new THREE.Vector3(-3, -.79, -3), roomMax: new THREE.Vector3(3, 2.5, 3) });
const built = table.buildTable({ shared, tableId });
const G = table.makeGeom(tableId), K = table.CN8_R82, version = table.CN8_TRANSPORT_SOLVER_VERSION;
${program}
`);
  const run = spawnSync(executable, [name], { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024, timeout: 120000 });
  if (run.status !== 0) throw new Error(JSON.stringify({ executable, status: run.status, stdout: run.stdout, stderr: run.stderr, error: run.error?.message }));
  const lines = run.stdout.trim().split('\n'), result = JSON.parse(lines.at(-1));
  return { executable, result, stderr: run.stderr, fixture_program_sha256: sha(fs.readFileSync(name)) };
}

export const measurementProgram = `
const measured = core.transportIdentity(built.group, G, K, version);
const solids = new Set(measured.members.map(row => row.ordinal)), rows = [], point = new THREE.Vector3();
built.group.updateMatrixWorld(true);
const inverse = built.group.matrixWorld.clone().invert();
let ordinal = 0, magnitude = 0;
built.group.traverse(mesh => { if (!mesh.isMesh) return; const id = ordinal++; if (!solids.has(id)) return;
  const matrix = inverse.clone().multiply(mesh.matrixWorld), position = mesh.geometry.getAttribute('position');
  for (let i = 0; i < position.count; i++) { point.fromBufferAttribute(position, i).applyMatrix4(matrix);
    magnitude = Math.max(magnitude, Math.abs(point.x), Math.abs(point.y), Math.abs(point.z)); }
});
const f32 = new Float32Array([magnitude]), bits = new Uint32Array(f32.buffer), rounded = f32[0];
bits[0]++; const quantum = f32[0] - rounded;
ordinal = 0;
built.group.traverse(mesh => { if (!mesh.isMesh) return; const id = ordinal++; if (!solids.has(id)) return;
  const attribute = mesh.geometry.getAttribute('position'), position = attribute.array;
  const matrix = inverse.clone().multiply(mesh.matrixWorld), reduced = new Int32Array(position.length);
  const worldReduced = new Int32Array(position.length);
  let nearBoundary = 0, onBoundary = 0;
  let worldNearBoundary = 0, worldOnBoundary = 0;
  for (let vertex = 0; vertex < attribute.count; vertex++) {
    point.fromBufferAttribute(attribute, vertex).applyMatrix4(matrix);
    for (const [axis, x] of [point.x, point.y, point.z].entries()) {
      const scaled = x / quantum; worldReduced[3 * vertex + axis] = Math.round(scaled);
      f32[0] = Math.abs(x); const v = f32[0]; bits[0]++; const ulp = f32[0] - v;
      const distance = Math.abs(scaled - (Math.floor(scaled) + .5)) * quantum;
      if (distance <= ulp) worldNearBoundary++; if (distance === 0) worldOnBoundary++;
    }
  }
  for (let i = 0; i < position.length; i++) {
    const x = position[i], scaled = x / quantum; reduced[i] = Math.round(scaled);
    f32[0] = Math.abs(x); const v = f32[0]; bits[0]++; const ulp = f32[0] - v;
    const distance = Math.abs(scaled - (Math.floor(scaled) + .5)) * quantum;
    if (distance <= ulp) nearBoundary++; if (distance === 0) onBoundary++;
  }
  rows.push({ ordinal: id, name: mesh.name, count: position.length, raw: core.sha256(position),
    quantized: core.sha256(reduced), within_one_ulp_of_boundary: nearBoundary, on_boundary: onBoundary,
    table_space_quantized: core.sha256(worldReduced), table_space_within_one_ulp_of_boundary: worldNearBoundary,
    table_space_on_boundary: worldOnBoundary,
    words: /^cn8-mid-leather-[14]$/.test(mesh.name) ? Array.from(new Uint32Array(position.buffer, position.byteOffset, position.length)) : undefined });
});
console.log(JSON.stringify({ tableId, key: measured.key, triangles: measured.triangles,
  quantum, magnitude, total_coordinates: rows.reduce((s, r) => s + r.count, 0),
  within_one_ulp_of_boundary: rows.reduce((s, r) => s + r.within_one_ulp_of_boundary, 0),
  on_boundary: rows.reduce((s, r) => s + r.on_boundary, 0), rows,
  table_space_within_one_ulp_of_boundary: rows.reduce((s, r) => s + r.table_space_within_one_ulp_of_boundary, 0),
  runtime: built.group.userData.cn8TransportArtifact, inputs: measured.inputs }));
`;

// This test boundary sits below the unmodified builder: the Float32 storage
// operation writes one adjacent value once at the actual table-scale maximum.
// The value is discovered from the independently built baseline, not authored.
function storageUlpShim(target) {
  return `const NativeFloat32 = Float32Array, nativeSet = Float32Array.prototype.set;
globalThis.__cn8UlpPlant = null;
function perturb(array, domain) {
  if (!globalThis.__cn8UlpPlant && array.length > 1000) {
    for (let i = 0; i < array.length; i++) if (array[i] === ${target}) {
      const word = new NativeFloat32([array[i]]), bits = new Uint32Array(word.buffer);
      bits[0]++; array[i] = word[0];
      globalThis.__cn8UlpPlant = { before: ${target}, after: word[0], delta_m: word[0] - ${target},
        domain, source_length: array.length, index: i };
      globalThis.Float32Array = NativeFloat32; NativeFloat32.prototype.set = nativeSet; break;
    }
  } return array;
}
globalThis.Float32Array = new Proxy(NativeFloat32, {
  construct(Target, args) { return perturb(Reflect.construct(Target, args), 'Float32 constructor below the unmodified builder'); }
});
NativeFloat32.prototype.set = function(source, offset = 0) {
  const result = nativeSet.call(this, source, offset);
  perturb(this, 'Float32Array.set below the unmodified builder'); return result;
};`;
}

export const identityPlantProgram = `
const measured = core.transportIdentity(built.group, G, K, version);
const raw = [], point = new THREE.Vector3(); let magnitude = 0;
built.group.updateMatrixWorld(true);
const inverse = built.group.matrixWorld.clone().invert();
for (const member of measured.members) {
  const mesh = member.path.split('/').slice(1).reduce((object, index) => object.children[+index], built.group);
  const position = mesh.geometry.getAttribute('position'), matrix = inverse.clone().multiply(mesh.matrixWorld);
  for (let i = 0; i < position.count; i++) { point.fromBufferAttribute(position, i).applyMatrix4(matrix);
    magnitude = Math.max(magnitude, Math.abs(point.x), Math.abs(point.y), Math.abs(point.z)); }
  raw.push({ name: mesh.name, ordinal: member.ordinal, sha256: core.sha256(position.array) });
}
const word = new Float32Array([magnitude]), bits = new Uint32Array(word.buffer), rounded = word[0];
bits[0]++; const quantum = word[0] - rounded;
console.log(JSON.stringify({ tableId, key: measured.key, inputs_sha256: core.sha256(JSON.stringify(measured.inputs)),
  quantum_m: quantum, magnitude, raw, shim: globalThis.__cn8UlpPlant ?? null,
  runtime: built.group.userData.cn8TransportArtifact }));
`;

export function verifyEngines(root = ROOT) {
  if (!fs.existsSync(JSC)) throw new Error('CN8_JAVASCRIPTCORE_UNAVAILABLE');
  const fixture = engineFixture(root), runs = [], plants = [];
  try {
    for (const tableId of ['chinese8_pro_9ft', 'joy_q8_9ft']) {
      const pair = [process.execPath, JSC].map(executable => runEngine(executable, fixture, tableId, identityPlantProgram));
      const [v8, jsc] = pair.map(run => run.result);
      assert.equal(v8.key, jsc.key, tableId + ' recipe key');
      assert.equal(v8.inputs_sha256, jsc.inputs_sha256, tableId + ' recipe inputs');
      for (const run of pair) {
        const baseline = run.result;
        assert.equal(baseline.runtime.status, 'PASS'); assert.equal(baseline.runtime.ui_solve_calls, 0);
        const planted = runEngine(run.executable, fixture, tableId, identityPlantProgram,
          { prelude: storageUlpShim(baseline.magnitude) });
        const result = planted.result;
        assert.ok(result.shim, 'The below-builder Float32 shim must actually change a stored word');
        assert.equal(result.shim.delta_m, baseline.quantum_m, 'At table scale one Float32 ULP is one mesh quantum');
        assert.equal(result.key, baseline.key); assert.equal(result.inputs_sha256, baseline.inputs_sha256);
        assert.equal(result.runtime.status, 'PASS'); assert.equal(result.runtime.ui_solve_calls, 0);
        const changed = result.raw.filter((row, i) => row.sha256 !== baseline.raw[i].sha256);
        assert.ok(changed.length > 0, 'An actual emitted solid must carry the planted engine rounding');
        plants.push({ ...planted, changed_position_meshes: changed.map(row => row.name),
          baseline_program_sha256: run.fixture_program_sha256, arm: 'P-G2', status: 'PASS' });
      }
      runs.push(...pair);
    }
    assert.equal(new Set(runs.map(run => run.result.key)).size, 1);
    return { status: 'PASS', tag: 'DERIVED / actual V8 and JavaScriptCore builder, lookup and TEST sub-builder shim',
      engine_scope: 'Native jsc executes the actual ESM builder and runtime lookup with the reviewed CPU paint stubs. WebKit DOM/WebGL and iOS device boot remain untested here.',
      identity_branch: 'ORDER-16 ADDENDUM 1 P-A/P-C: recipe-only runtime identity; no position digest. A below-builder one-ULP storage shim keeps lookup passing; builder edits are checked at generation time by P-G1/S2.',
      root, node: process.version, sources: fixture.sources, paint_boundary_sha256: fixture.paint_boundary_sha256, runs, plants };
  } finally { fs.rmSync(fixture.temp, { recursive: true, force: true }); }
}

export async function main(argv) {
  let root = ROOT, out = null, inputOnly = false, verify = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--root') root = path.resolve(argv[++i]);
    else if (argv[i] === '--out') out = path.resolve(argv[++i]);
    else if (argv[i] === '--input-only') inputOnly = true;
    else if (argv[i] === '--verify') verify = true;
    else throw new Error('Usage: engine_transport_identity.mjs [--root path] [--input-only|--verify] --out fresh.json');
  }
  if (!out || fs.existsSync(out)) throw new Error('A fresh output path is required');
  if (!fs.existsSync(JSC)) throw new Error('CN8_JAVASCRIPTCORE_UNAVAILABLE: install the declared macOS JavaScriptCore test dependency');
  if (verify) {
    if (inputOnly) throw new Error('Runtime verification cannot stub runtime lookup');
    const receipt = verifyEngines(root);
    fs.writeFileSync(out, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify({ status: receipt.status, engines: receipt.runs.length, key: receipt.runs[0].result.key }));
    return;
  }
  const fixture = engineFixture(root, { inputOnly });
  try {
    const runs = [];
    for (const tableId of ['chinese8_pro_9ft', 'joy_q8_9ft']) for (const executable of [process.execPath, JSC]) {
      const run = runEngine(executable, fixture, tableId, measurementProgram); runs.push(run);
      console.log(JSON.stringify({ tableId, executable, key: run.result.key, boundaries: run.result.within_one_ulp_of_boundary }));
    }
    fs.writeFileSync(out, JSON.stringify({ tag: 'DERIVED / independent actual-builder engine census', root,
      ...fixture, runs, webkit_parity: 'jsc executes the shipped builder, identity and lookup. WebKit DOM/WebGL and iOS device boot are not exercised by this CPU instrument.' }, null, 2) + '\n', { flag: 'wx' });
  } finally { fs.rmSync(fixture.temp, { recursive: true, force: true }); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));
