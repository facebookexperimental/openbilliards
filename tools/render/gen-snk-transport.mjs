// Copyright (c) Meta Platforms, Inc. and affiliates.

// gen-snk-transport.mjs — GH-1131 option A: regenerate / check the SHIPPED snooker occlusion transport
// (web/scene/snktransport-data.js), without a browser.
//
// The artifact is table.js's own aOccl bake: every job the snooker build queues (snkApplyOccl, snkApplyOcclInterp,
// snkApplyOcclRanges and the pocket-net job), keyed by the runtime cache key (sampler signature + offsets + position /
// normal checksums), lossless Float32 (never quantised) in the CN8 transport's carrier (web/scene/cn8transport-codec.js:
// word runs, base64, the FIPS 180-4 SHA-256; it needs no platform stream or crypto API). The sampler is engine-independent
// (GH-1131 A1: literal trig, IEEE ops and sqrt only), so this node bake equals a browser's drained bake byte for byte.
//   node --experimental-vm-modules tools/render/gen-snk-transport.mjs --write   (rewrite the data module)
//   node --experimental-vm-modules tools/render/gen-snk-transport.mjs --check   (CI: regenerate, compare byte for byte)
// The build runs in a node:vm sandbox with the same reviewed DOM / paint stubs as tools/render/ghcn8/cpu_table_inputs.mjs
// (canvas reads stub; no shader image or room placement is an input to the transport). Tool-boundary source transforms,
// never deployed: table.js exports its bake handles, keeps every job output (the runtime cache is bounded at 128 parts),
// and binds hot globals at module scope (vm global-proxy lookups made the bake ~8x slower); snktransport.js (the shipped
// loader, i.e. this tool's output) is stubbed to refuse, so the build bakes at runtime.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash, webcrypto } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MODULE = 'web/scene/snktransport-data.js';
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

class CpuCanvas {
  width = 300; height = 150;
  getContext(kind) {
    if (kind !== '2d') throw new Error('CPU geometry must not request WebGL');
    if (this.context) return this.context;
    const canvas = this;
    const context = {
      canvas, createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
      getImageData: (_x, _y, w, h) => ({ width: w, height: h, data: context.image?.data.slice() ?? new Uint8ClampedArray(w * h * 4) }),
      putImageData: (image) => { context.image = image; },
      createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }),
      createPattern: () => ({}), measureText: (text) => ({ width: text.length * 8 }),
    };
    for (const name of ['clearRect', 'fillRect', 'strokeRect', 'drawImage', 'beginPath', 'closePath', 'moveTo', 'lineTo',
      'bezierCurveTo', 'quadraticCurveTo', 'arc', 'arcTo', 'ellipse', 'rect', 'roundRect', 'stroke', 'fill', 'clip',
      'save', 'restore', 'translate', 'rotate', 'scale', 'setTransform', 'resetTransform', 'fillText', 'strokeText', 'setLineDash']) context[name] = () => {};
    this.context = new Proxy(context, { get(target, property) {
      if (property in target || typeof property === 'symbol') return target[property];
      throw new Error('CPU Canvas read requires explicit review: ' + String(property));
    } });
    return this.context;
  }
  addEventListener() {}
  removeEventListener() {}
  setAttribute() {}
}
class CpuImage extends EventTarget { width = 1; height = 1; }
class CpuImageData { constructor(data, width, height) { this.data = data; this.width = width; this.height = height; } }

// the exact lines the transforms anchor on (a refactor that moves them must fail loudly, never silently change the bake)
const BOUND = '      if (_snkOcclBakeCache.size >= 128) _snkOcclBakeCache.clear();\n';
const GLOBALS = 'const Math = globalThis.Math, performance = globalThis.performance, Float32Array = globalThis.Float32Array, '
  + 'Float64Array = globalThis.Float64Array, Uint32Array = globalThis.Uint32Array, Map = globalThis.Map, Array = globalThis.Array, '
  + 'Number = globalThis.Number;\n';

/** Build every snooker-style table in the sandbox, drain its bake, and return the job outputs (key → Float32Array).
 * `shipped: true` is the behavioural leg instead: the REAL loader (web/scene/snktransport.js and the committed data module)
 * prepares each build, nothing is flushed, and the build's own census is returned (the shipped path must queue no job). */
export async function bakeSnooker({ root = ROOT, shipped = false } = {}) {
  const window = new EventTarget();
  let buildError = null;
  window.addEventListener('ob:table-refused', (event) => { buildError = event.detail.error; });
  const localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  const quiet = { ...console, warn: (...a) => { if (!String(a[0]).includes('SNK_TRANSPORT_ARTIFACT_MISSING')) console.warn(...a); } };
  const sandbox = { console: quiet, performance, atob, btoa, crypto: webcrypto, TextEncoder, TextDecoder,
    URL, URLSearchParams, EventTarget, Event, CustomEvent, Blob, window, localStorage, sessionStorage: localStorage,
    location: { search: '?obtool=0' }, HTMLCanvasElement: CpuCanvas, ImageData: CpuImageData,
    setTimeout: (fn, ms) => { const timer = setTimeout(fn, ms); timer.unref(); return timer; }, clearTimeout,
    requestAnimationFrame: (fn) => { const timer = setTimeout(() => fn(performance.now()), 0); timer.unref(); return timer; }, cancelAnimationFrame: clearTimeout,
    document: { createElement: (name) => { if (name !== 'canvas') throw new Error('Unreviewed CPU DOM ' + name); return new CpuCanvas(); },
      createElementNS: (_ns, name) => { if (name === 'img') return new CpuImage(); if (name !== 'canvas') throw new Error('Unreviewed CPU DOM namespace ' + name); return new CpuCanvas(); } },
  };
  window.document = sandbox.document;
  const context = vm.createContext(sandbox), cache = new Map();
  const resolve = (specifier, parent) => (specifier === 'three'
    ? pathToFileURL(path.join(root, 'web/vendor/three.module.min.js')).href : new URL(specifier, parent).href);
  function moduleFor(url) {
    if (cache.has(url)) return cache.get(url);
    const filename = fileURLToPath(url);
    let source = fs.readFileSync(filename, 'utf8');
    if (filename.endsWith('/web/scene/room.js') || filename.endsWith('/web/scene/gi.js')) source = 'export {};';
    if (!shipped && filename.endsWith('/web/scene/snktransport.js')) {
      source = "export function load() { const e = new Error('the shipped transport is this tool\\'s output'); e.code = 'SNK_TRANSPORT_GENERATOR'; return Promise.reject(e); }\n";
    }
    if (filename.endsWith('/web/scene/table.js')) {
      if (source.split(BOUND).length !== 2) throw new Error('GEN-SNK: the bake-cache bound line moved (update gen-snk-transport.mjs)');
      source = GLOBALS + source.replace(BOUND, '')
        + '\nexport { _snkOcclBakeCache, _snkOcclFlush, _snkOcclPending, _snkOcclShippedStats };\n';
    }
    const module = new vm.SourceTextModule(source, { context, identifier: url,
      initializeImportMeta(meta) { meta.url = url; },
      importModuleDynamically: async (specifier, referencing) => {
        const target = moduleFor(resolve(specifier, referencing.identifier));
        if (target.status === 'unlinked') await target.link(linker);
        if (target.status === 'linked') await target.evaluate();
        return target;
      } });
    cache.set(url, module);
    return module;
  }
  const linker = (specifier, referencing) => moduleFor(resolve(specifier, referencing.identifier));
  const t0 = performance.now();
  const table = moduleFor(pathToFileURL(path.join(root, 'web/scene/table.js')).href);
  await table.link(linker); await table.evaluate();
  const THREE = cache.get(pathToFileURL(path.join(root, 'web/vendor/three.module.min.js')).href).namespace;
  const shading = cache.get(pathToFileURL(path.join(root, 'web/scene/shading.js')).href).namespace;
  const shared = shading.createShared({ lightPos: new THREE.Vector3(0, 1.02, 0),
    roomMin: new THREE.Vector3(-3, -0.79, -3), roomMax: new THREE.Vector3(3, 2.5, 3) });
  const ns = table.namespace;
  const tables = Object.entries(ns.TABLE_SPECS).filter(([, s]) => s?.render?.style === 'snooker').map(([id]) => id).sort();
  if (!tables.length) throw new Error('GEN-SNK: no snooker-style table in TABLE_SPECS');
  for (const tableId of tables) {
    if (typeof ns.buildTable.prepare === 'function') await ns.buildTable.prepare(tableId);
    const built = ns.buildTable({ shared, tableId });
    if (buildError) throw buildError;
    if (built.tableId() !== tableId) throw new Error('GEN-SNK: table identity mismatch ' + tableId);
  }
  const t1 = performance.now();
  if (shipped) {
    return { tables, pending: ns._snkOcclPending.size, stats: { ...ns._snkOcclShippedStats }, buildMs: t1 - t0 };
  }
  const unkeyed = [...ns._snkOcclPending.keys()].filter((k) => typeof k !== 'string').length;
  if (unkeyed) throw new Error(`GEN-SNK: ${unkeyed} queued job(s) carry no string key: the artifact could never serve them`);
  const queued = ns._snkOcclPending.size;
  ns._snkOcclFlush();
  if (ns._snkOcclPending.size) throw new Error(`GEN-SNK: ${ns._snkOcclPending.size} job(s) still pending after the flush`);
  if (ns._snkOcclShippedStats.error !== 'SNK_TRANSPORT_GENERATOR' || ns._snkOcclShippedStats.hits) {
    throw new Error('GEN-SNK: the build did not bake at runtime: ' + JSON.stringify(ns._snkOcclShippedStats));
  }
  if (ns._snkOcclBakeCache.size !== queued) throw new Error(`GEN-SNK: ${queued} job(s) queued but ${ns._snkOcclBakeCache.size} baked`);
  return { tables, cache: ns._snkOcclBakeCache, buildMs: t1 - t0, flushMs: performance.now() - t1 };
}

/** The artifact object (stable key order) for a set of job outputs: the job arrays concatenated in key order, as ONE
 * Float32 carrier row of the CN8 codec (the shipped loader decodes it with the same module). */
export async function artifactOf({ tables, cache }, root = ROOT) {
  const keys = [...cache.keys()].filter((k) => typeof k === 'string').sort();
  const counts = keys.map((k) => cache.get(k).length);
  const floats = new Float32Array(counts.reduce((a, b) => a + b, 0));
  let off = 0;
  for (const k of keys) { floats.set(cache.get(k), off); off += cache.get(k).length; }
  const carrier = await import(pathToFileURL(path.join(root, 'web/scene/cn8transport-codec.js')).href);
  const row = carrier.encode(floats);
  if (row.sha256 !== sha256(Buffer.from(floats.buffer))) throw new Error('GEN-SNK: the carrier SHA-256 disagrees with node:crypto');
  return { schema: 2, generator: 'tools/render/gen-snk-transport.mjs', issue: 'GH-1131', tables, entries: keys.length, keys, counts, row };
}
export function moduleText(artifact) {
  return '// Generated by tools/render/gen-snk-transport.mjs (GH-1131 option A) — DO NOT EDIT; regenerate with --write.\n'
    + '// table.js\'s own snooker aOccl bake (lossless Float32 in the CN8 word-run carrier), keyed by the runtime bake-cache key; CI\n'
    + '// regenerates it in node and compares byte for byte. DERIVED, never an authored shade.\n'
    + 'export const artifact = ' + JSON.stringify(artifact) + ';\n';
}
/** Decode a committed artifact in node: key → Buffer of its Float32 bytes (the carrier checks its own SHA-256). */
export async function decodeArtifact(artifact, root = ROOT) {
  if (artifact?.schema !== 2 || artifact.row?.type !== 'Float32Array') throw new Error('GEN-SNK: committed artifact is not schema 2');
  const carrier = await import(pathToFileURL(path.join(root, 'web/scene/cn8transport-codec.js')).href);
  const floats = carrier.decode(artifact.row);
  const bytes = Buffer.from(floats.buffer, floats.byteOffset, floats.byteLength);
  if (sha256(bytes) !== artifact.row.sha256) throw new Error('GEN-SNK: committed artifact sha256 mismatch');
  const out = new Map(); let off = 0;
  artifact.keys.forEach((k, i) => { const n = artifact.counts[i] * 4; out.set(k, bytes.subarray(off, off + n)); off += n; });
  if (off !== bytes.length) throw new Error('GEN-SNK: committed artifact counts do not cover its bytes');
  return out;
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  const mode = process.argv.includes('--write') ? 'write' : process.argv.includes('--check') ? 'check' : null;
  if (!mode) { console.error('usage: node --experimental-vm-modules tools/render/gen-snk-transport.mjs --write | --check'); process.exit(2); }
  const t0 = performance.now();
  const baked = await bakeSnooker();
  const art = await artifactOf(baked);
  const wall = Math.round(performance.now() - t0);
  const stamp = `${art.entries} entries, ${art.row.bytes} bytes Float32, sha256 ${art.row.sha256.slice(0, 16)}; harness wall ${wall} ms `
    + `(build ${Math.round(baked.buildMs)} ms, drain ${Math.round(baked.flushMs)} ms); tables ${art.tables.join(',')}; node ${process.version} V8 ${process.versions.v8}`;
  if (mode === 'write') {
    const text = moduleText(art);
    fs.writeFileSync(path.join(ROOT, MODULE), text);
    console.log(`SNK-TRANSPORT WRITE ${MODULE} (${text.length} bytes): ${stamp}`);
  } else {
    const { artifact: committed } = await import(pathToFileURL(path.join(ROOT, MODULE)).href);
    let have;
    try { have = await decodeArtifact(committed); }
    catch (e) { console.log(`SNK-TRANSPORT CHECK FAIL: the committed ${MODULE} does not decode (${e?.message ?? e}); regenerate: `
      + 'node --experimental-vm-modules tools/render/gen-snk-transport.mjs --write'); process.exit(1); }
    const want = new Map(art.keys.map((k) => [k, null]));
    const fresh = await decodeArtifact(art);
    const missing = art.keys.filter((k) => !have.has(k)), extra = committed.keys.filter((k) => !want.has(k));
    const differ = art.keys.filter((k) => have.has(k) && !have.get(k).equals(fresh.get(k)));
    const textSame = fs.readFileSync(path.join(ROOT, MODULE), 'utf8') === moduleText(art);
    if (missing.length || extra.length || differ.length || committed.row.sha256 !== art.row.sha256 || !textSame) {
      console.log(`SNK-TRANSPORT CHECK FAIL: the committed ${MODULE} is not this tree's bake — ${missing.length} key(s) missing, `
        + `${extra.length} extra, ${differ.length} differing (committed sha256 ${committed.row.sha256.slice(0, 16)} vs fresh ${art.row.sha256.slice(0, 16)}`
        + `${textSame ? '' : '; the module text differs'}); `
        + `regenerate: node --experimental-vm-modules tools/render/gen-snk-transport.mjs --write`);
      for (const k of [...missing, ...extra, ...differ].slice(0, 5)) console.log('  key …' + k.slice(-64));
      process.exit(1);
    }
    // the behavioural leg: the committed artifact through the REAL loader must serve every job of a build (none queued)
    let live;
    try { live = await bakeSnooker({ shipped: true }); }
    catch (e) { console.log(`SNK-TRANSPORT CHECK FAIL: the build through the shipped loader threw (${e?.message ?? e})`); process.exit(1); }
    // GH-1170: a load slower than table.js's bound sends the build to the runtime bake; name it, never a bare "not served"
    if (live.stats.timeouts) {
      console.log(`SNK-TRANSPORT CHECK FAIL: UNJUDGEABLE — SNK_TRANSPORT_ARTIFACT_TIMEOUT: the shipped transport loaded slower than table.js's `
        + `bound (${live.stats.timeouts} build(s) went to the runtime bake), so the shipped path was not judged; census ${JSON.stringify(live.stats)}`);
      process.exit(1);
    }
    if (live.pending !== 0 || !live.stats.loaded || live.stats.misses !== 0 || !(live.stats.hits > 0) || live.stats.error) {
      console.log(`SNK-TRANSPORT CHECK FAIL: the shipped path did not serve the build — ${live.pending} job(s) queued, census ${JSON.stringify(live.stats)}`);
      process.exit(1);
    }
    console.log(`SNK-TRANSPORT CHECK PASS: ${stamp}; shipped path: ${live.stats.hits} hits, 0 misses, 0 jobs queued (build ${Math.round(live.buildMs)} ms)`);
  }
}
