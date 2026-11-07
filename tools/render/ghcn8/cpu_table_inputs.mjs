// Copyright (c) Meta Platforms, Inc. and affiliates.

// Build the renderer's actual geometry for offline transport generation.
// The reviewed DOM/paint stubs exclude shader images and room placement only.
// No purchased asset is loaded; all positions come from the repository builders.
// Run with --experimental-vm-modules (Node's isolated ESM loader).
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { webcrypto } from 'node:crypto';
import { loadCornerBuilder } from './cn8_emitted_checks.mjs';
const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
class CpuCanvas {
  width = 300; height = 150;
  getContext(kind) {
    if (kind !== '2d') throw new Error('CPU geometry must not request WebGL');
    if (this.context) return this.context;
    const canvas = this;
    const context = {
      canvas, createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
      getImageData: (_x, _y, w, h) => ({ width: w, height: h, data: context.image?.data.slice() ?? new Uint8ClampedArray(w * h * 4) }),
      putImageData: image => { context.image = image; },
      createLinearGradient: () => ({ addColorStop() {} }),
      createRadialGradient: () => ({ addColorStop() {} }),
      createPattern: () => ({}), measureText: text => ({ width: text.length * 8 }),
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
// External image loading only supplies shader samplers. It is not an input
// to the complete solid geometry or the CN8 transport radiometry.
class CpuImage extends EventTarget { width = 1; height = 1; }
class CpuImageData {
  constructor(data, width, height) { this.data = data; this.width = width; this.height = height; }
}
export async function buildTransportInputs({ root = DEFAULT_ROOT, tableId = 'chinese8_pro_9ft', search = '?obtool=0' } = {}) {
const ROOT = path.resolve(root);
const window = new EventTarget();
let buildError = null;
window.addEventListener('ob:table-refused', event => { buildError = event.detail.error; });
const localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const sandbox = { console, performance, atob, btoa, crypto: webcrypto, TextEncoder, TextDecoder,
  URL, URLSearchParams, EventTarget, Event, CustomEvent, Blob, window, localStorage, sessionStorage: localStorage,
  location: { search }, HTMLCanvasElement: CpuCanvas, ImageData: CpuImageData,
  setTimeout: (fn, ms) => { const timer = setTimeout(fn, ms); timer.unref(); return timer; }, clearTimeout,
  requestAnimationFrame: fn => { const timer = setTimeout(() => fn(performance.now()), 0); timer.unref(); return timer; }, cancelAnimationFrame: clearTimeout,
  document: { createElement: name => { if (name !== 'canvas') throw new Error('Unreviewed CPU DOM ' + name); return new CpuCanvas(); },
    createElementNS: (_ns, name) => { if (name === 'img') return new CpuImage(); if (name !== 'canvas') throw new Error('Unreviewed CPU DOM namespace ' + name); return new CpuCanvas(); } },
};
window.document = sandbox.document;
const context = vm.createContext(sandbox), cache = new Map();
const resolve = (specifier, parent) => specifier === 'three'
  ? pathToFileURL(path.join(ROOT, 'web/vendor/three.module.min.js')).href : new URL(specifier, parent).href;
function moduleFor(url) {
  if (cache.has(url)) return cache.get(url);
  const filename = fileURLToPath(url);
  let source = fs.readFileSync(filename, 'utf8');
  if (filename.endsWith('/web/scene/room.js') || filename.endsWith('/web/scene/gi.js')) source = 'export {};';
  // Explicit tool boundary: build inputs without consuming the output that
  // this tool is responsible for regenerating. This stub is never deployed.
  if (filename.endsWith('/web/scene/cn8transport.js')) source = 'export function validate() {}\nexport function apply(group) { group.userData.cn8TransportArtifact = { source: "CPU_INPUT_ONLY" }; }';
  if (filename.endsWith('/web/scene/table.js')) {
    source += '\nexport { cn8RingTexLoad, CN8_R82, cn8MouthOccGeom, cn8D3SolidRayTree };\n';
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
const table = moduleFor(pathToFileURL(path.join(ROOT, 'web/scene/table.js')).href);
await table.link(linker); await table.evaluate(); await table.namespace.cn8RingTexLoad;
const THREE = cache.get(pathToFileURL(path.join(ROOT, 'web/vendor/three.module.min.js')).href).namespace;
const shading = cache.get(pathToFileURL(path.join(ROOT, 'web/scene/shading.js')).href).namespace;
const shared = shading.createShared({ lightPos: new THREE.Vector3(0, 1.02, 0),
  roomMin: new THREE.Vector3(-3, -.79, -3), roomMax: new THREE.Vector3(3, 2.5, 3) });
const started = performance.now();
if (typeof table.namespace.buildTable.prepare === 'function') await table.namespace.buildTable.prepare(tableId);
const built = table.namespace.buildTable({ shared, tableId });
if (buildError) throw buildError;
if (built.tableId() !== tableId) throw new Error('CPU_TABLE_IDENTITY_MISMATCH: ' + tableId);
built.group.updateMatrixWorld(true);
const builder = loadCornerBuilder(fs.readFileSync(path.join(ROOT, 'web/scene/table.js'), 'utf8'));
return { ...built, G: table.namespace.makeGeom(tableId), K: table.namespace.CN8_R82,
  sinkDressFor: table.namespace.sinkDressFor,
  mouth: table.namespace.cn8MouthOccGeom(), solidRayTree: builder.solidRayTree,
  THREE, build_ms: performance.now() - started, ringTexture: window.__cn8ringtex };
}
