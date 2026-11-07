#!/usr/bin/env node

// Copyright (c) Meta Platforms, Inc. and affiliates.

// offline_scene_dump_621.mjs — GULLY-FIX6 C2 (review 644g6 P2 #2 / #3): a HEADLESS full-scene dump of the served D621 table
// (web/scene/table.js built in node with the vendored three, the same preamble as gully_route_arm_621.mjs) in the exact
// format of tools/render/d621/align/dump-ours-621.mjs, the app capture over CDP. Node-only, DERIVED, NO Chrome; it never
// substitutes for the card's app capture — it is validated byte-for-byte against the recorded B2 app dump and used to
// re-derive the cushion mesh-fence pin between captures (see the block at the end of this file).
import { registerHooks } from 'node:module';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..', '..');
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const TABLE = opt('--table', 'diamond_proam_9ft');
const TRACK = opt('--track', path.join(ROOT, 'web/scene/ballreturn/tracks', `${TABLE}-gully.json`));
const REPORT = opt('--report', null);
const MM = 0.001, R = 0.028575, STEP = 0.005; // MFR ball radius (WPA 2 1/4 in); DERIVED sampling step 5 mm (arm 13c's spacing)

// ---- headless table.js (the app's import map maps 'three' to the vendored build; a few window/document globals are touched at build) ----
const three = path.resolve(ROOT, 'web/vendor/three.module.min.js');
registerHooks({ resolve(s, c, n) { return s === 'three' ? { url: 'file://' + three, shortCircuit: true } : n(s, c); } });
const noop = () => {}; const g = globalThis;
const imageData = (w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w | 0) * Math.max(1, h | 0) * 4), width: Math.max(1, w | 0), height: Math.max(1, h | 0) });
const ctx2d = () => { const store = {}; return new Proxy({}, { get: (t, k) => { if (k === 'getImageData') return (x, y, w, h) => imageData(w, h); if (k === 'createImageData') return (w, h) => imageData(typeof w === 'object' ? w.width : w, typeof w === 'object' ? w.height : h); if (k === 'measureText') return () => ({ width: 1 }); if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return () => ({ addColorStop: noop }); if (k in store) return store[k]; return noop; }, set: (t, k, v) => { store[k] = v; return true; } }); };
const canvas = () => { const c = { width: 1, height: 1, style: {}, setAttribute: noop, appendChild: noop, addEventListener: noop, toDataURL: () => '' }; c.getContext = (kind) => (kind === '2d' ? ctx2d() : null); return c; };
g.window ??= g; g.addEventListener ??= noop; g.removeEventListener ??= noop; g.dispatchEvent ??= () => true;
g.matchMedia ??= () => ({ matches: false, addEventListener: noop, removeEventListener: noop, addListener: noop, removeListener: noop });
g.sessionStorage ??= { getItem: () => null, setItem: noop, removeItem: noop }; g.localStorage ??= g.sessionStorage;
g.location ??= { search: '', href: 'http://localhost/', origin: 'http://localhost', pathname: '/' };
g.navigator ??= { userAgent: 'node', language: 'en' };
g.document ??= { createElement: (tag) => (tag === 'canvas' ? canvas() : { getContext: () => null, style: {}, setAttribute: noop, appendChild: noop, addEventListener: noop }), createElementNS: () => canvas(), body: { appendChild: noop, classList: { add: noop, remove: noop } }, documentElement: { style: { setProperty: noop }, classList: { add: noop, remove: noop } }, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener: noop, head: { appendChild: noop } };
g.requestAnimationFrame ??= () => 0; g.cancelAnimationFrame ??= noop; g.devicePixelRatio ??= 1; g.innerWidth ??= 1280; g.innerHeight ??= 720;
g.CustomEvent ??= class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } }; g.Image ??= class Image {};
const THREE = await import('file://' + three);
const tableMod = await import(path.resolve(ROOT, 'web/scene/table.js'));

const built = tableMod.buildTable({ tableId: TABLE });
built.group.updateMatrixWorld(true);

// ---- offline_scene_dump_621.mjs — GULLY-FIX6 C2: a HEADLESS full-scene dump of the built D621 table in the exact format of
// tools/render/d621/align/dump-ours-621.mjs (the app capture over CDP): every mesh under the table group, world-space
// Float64 positions computed with the same per-vertex formula from o.matrixWorld and the Float32 attribute, indices with
// the instance base, the same name / parent / ancestor / geomType / verts / tris fields. DERIVED, node-only, NO Chrome:
// it never substitutes for the card's app capture — it is validated against the recorded B2 app dump of d7b8b0f0
// (113 / 113 meshes byte-identical, see GULLY-R2.md §14) and used to re-derive the mesh-fence pin between captures.
//   node offline_scene_dump_621.mjs --table diamond_proam_9ft --out dump.json [--digests-only] [--compare other.json|pin.json]
const OUT = opt('--out', null), DIGESTS_ONLY = process.argv.includes('--digests-only'), COMPARE = opt('--compare', null);
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const digestOf = (positions, indices) => sha256(Buffer.concat([Buffer.from(new Float64Array(positions).buffer), Buffer.from(new Uint32Array(indices).buffer)]));
const meshes = []; let totalTris = 0;
const group = built.group; group.name ||= 'obTable';
group.traverse((o) => {
  if (!o.isMesh || !o.geometry) return;
  const g = o.geometry; const pos = g.getAttribute('position'); if (!pos) return;
  const mat = Array.isArray(o.material) ? o.material[0] : o.material;
  let p = o.parent, anc = ''; while (p && p !== group.parent) { if (p.name) { anc = p.name; break; } p = p.parent; }
  const M = o.matrixWorld.elements; const out = []; const idx = [];
  const applyM = (m, lx, ly, lz) => [m[0] * lx + m[4] * ly + m[8] * lz + m[12], m[1] * lx + m[5] * ly + m[9] * lz + m[13], m[2] * lx + m[6] * ly + m[10] * lz + m[14]];
  const mul = (a, b) => { const r = new Array(16); for (let c = 0; c < 4; c++) for (let rr = 0; rr < 4; rr++) { let s = 0; for (let k = 0; k < 4; k++) s += a[rr + 4 * k] * b[k + 4 * c]; r[rr + 4 * c] = s; } return r; };
  const n = pos.count; const inst = o.isInstancedMesh ? o.count : 1;
  for (let t = 0; t < inst; t++) {
    let m = M;
    if (o.isInstancedMesh) { const im = o.instanceMatrix.array.subarray(t * 16, t * 16 + 16); m = mul(M, Array.from(im)); }
    for (let i = 0; i < n; i++) { const w = applyM(m, pos.getX(i), pos.getY(i), pos.getZ(i)); out.push(w[0], w[1], w[2]); }
    if (g.index) { const base = t * n; const ia = g.index.array; for (let i = 0; i < ia.length; i++) idx.push(ia[i] + base); }
  }
  const tris = (idx.length ? idx.length : out.length / 3) / 3; totalTris += tris;
  meshes.push({ name: o.name || '', parent: (o.parent && o.parent.name) || '', ancestor: anc, inTable: true, mat: (mat && mat.name) || '', matType: (mat && mat.type) || '',
    hex: (mat && mat.color && mat.color.getHexString) ? mat.color.getHexString() : '', geomType: g.type, visible: o.visible, matVisible: mat ? mat.visible !== false : true,
    instanced: !!o.isInstancedMesh, instances: inst, verts: out.length / 3, tris, geometry_sha256: digestOf(out, idx), positions: out, indices: idx });
});
const keyOf = (m, i) => m.name || `anon#${i}(${m.parent})`;
const keys = meshes.map(keyOf); const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
const sourceSha = sha256(fs.readFileSync(path.resolve(ROOT, 'web/scene/table.js')));
const summary = { tool: 'offline_scene_dump_621.mjs', mode: 'OFFLINE HEADLESS SCENE DUMP, NOT AN APP CAPTURE', table: TABLE, source_table_js_sha256: sourceSha,
  meshCount: meshes.length, uniqueNames: new Set(keys).size, duplicate_names: [...new Set(dupes)], totalTris };
let compare = null;
if (COMPARE) {
  const other = JSON.parse(fs.readFileSync(COMPARE, 'utf8'));
  const otherDigests = new Map();
  if (other.dumps) { const size = TABLE.replace('diamond_proam_', ''); for (const m of other.dumps[size].meshes) otherDigests.set(m.key, m.geometry_sha256); }
  else other.meshes.forEach((m, i) => otherDigests.set(m.name || `anon#${i}(${m.parent})`, m.geometry_sha256 || digestOf(m.positions, m.indices)));
  const mine = new Map(meshes.map((m, i) => [keyOf(m, i), m.geometry_sha256]));
  const identical = [], differ = [], added = [], removed = [];
  for (const [k, d] of mine) { if (!otherDigests.has(k)) added.push(k); else if (otherDigests.get(k) === d) identical.push(k); else differ.push(k); }
  for (const k of otherDigests.keys()) if (!mine.has(k)) removed.push(k);
  compare = { against: COMPARE, identical: identical.length, differ, added, removed, identical_names: identical };
  console.log(`[scene-dump] ${TABLE} vs ${path.basename(COMPARE)}: IDENTICAL ${identical.length}, DIFFER ${differ.length} ${JSON.stringify(differ)}, ADDED ${added.length} ${JSON.stringify(added)}, REMOVED ${removed.length} ${JSON.stringify(removed)}`);
}
if (OUT) {
  const data = { ...summary, compare, meshes: DIGESTS_ONLY ? meshes.map((m, i) => ({ key: keyOf(m, i), name: m.name, parent: m.parent, geomType: m.geomType, verts: m.verts, tris: m.tris, geometry_sha256: m.geometry_sha256 })) : meshes };
  fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true }); fs.writeFileSync(OUT, JSON.stringify(data));
}
console.log(`[scene-dump] ${TABLE}: ${meshes.length} meshes, ${summary.uniqueNames} unique names${dupes.length ? ' — DUPLICATES ' + JSON.stringify(summary.duplicate_names) : ''}, ${totalTris} tris, table.js ${sourceSha.slice(0, 12)}${OUT ? ', wrote ' + OUT : ''}`);
if (dupes.length) process.exitCode = 3;
