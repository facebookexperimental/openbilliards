// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-table-prewarm.mjs — GH-1115 Y-S: buildTable.prewarm(id) computes pure build sub-results in their own tasks
// before the boot build, and the build takes them through a one-shot cache keyed on exact arguments (closures probed).
// This arm builds every table spec in node twice — one table.js instance never prewarms, another prewarms first — and
// requires identical bytes (every mesh attribute / index / userData, every reachable texture, the canvas multiset):
//   N-YS1  identity on all 9 specs; every prewarmed entry taken, none unused, no job threw
//   N-YS2  fallback: a prewarm for another table leaves every entry unused, logs the named line, builds identically
//   N-YS3  snooker's occlusion (a read-only spy on Map#set records the jobs by shape; the scheduler is untouched):
//          (a) the SHIPPED transport (GH-1131): no occlusion job is enqueued with or without the prewarm, and the build
//              takes the same number of shipped hits with no miss;
//          (b) the runtime-bake FALLBACK (the transport withheld, as on a missing or stale artifact): the jobs are
//              enqueued in the same order with and without the prewarm
// --selftest-plants serves planted copies of table.js (the loader hook below; nothing is written) and requires each
// to go red on its target: a mismatched job argument (inline fallback, still identical; the named line), a job that
// throws (still identical), a cache that is not one-shot (the lining mirror then shares a sheet: bytes differ), and a
// prewarm job that enqueues an occlusion job (N-YS3 differs, on the shipped path and on the fallback).
//   node web/tools/test-table-prewarm.mjs [--selftest-plants]
// Node >= 22.15 (module.registerHooks). Plain node, no browser. Never imported by the app.
import { registerHooks } from 'node:module';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TABLE = path.resolve(HERE, '../scene/table.js');
const TABLE_PATH = pathToFileURL(TABLE).pathname;
const THREE_URL = pathToFileURL(path.resolve(HERE, '../vendor/three.module.min.js')).href;
const SHIPPED = fs.readFileSync(TABLE, 'utf8');
const SPECS = ['pool_pro_9ft', 'pool_pro_9ft_older_gen', 'pool_pro_9ft_metal_rim', 'pool_pro_9ft_k55', 'wpa_spec_9ft',
  'wpa_generic_9ft', 'wpbsa_snooker_12ft', 'umb_carom_284', 'chinese8_pro_9ft'];
const SELFTEST = process.argv.includes('--selftest-plants');

const sub = (tag, a, b) => (s) => { if (s.split(a).length !== 2) throw new Error(`plant anchor ${tag} missing or not unique`); return s.replace(a, () => b); };
// N-YS3b: the shipped snooker transport withheld, so the build traces the occlusion at runtime (the fallback a missing or
// stale artifact takes)
const withheld = sub('withheld', '  if (_snkOcclShipped || _snkOcclShippedStats.error) return null; // loaded, or failed once: the runtime bake serves',
  '  return null; // N-YS3b: the shipped transport withheld (the runtime-bake fallback)');
const VARIANTS = {
  plain: (s) => s,
  prewarm: (s) => s,
  'plant-mismatch': sub('mismatch', "['makeLeatherNormal', () => [1723], makeLeatherNormalImpl],", "['makeLeatherNormal', () => [1724], makeLeatherNormalImpl],"),
  'plant-throw': sub('throw', "['makeLeatherRough', () => [4881], makeLeatherRoughImpl],", "['makeLeatherRough', () => { throw new Error('planted'); }, makeLeatherRoughImpl],"),
  'plant-noshot': sub('noshot', '    const r = q.shift();\n    if (!q.length) _pw.entries.delete(k);', '    const r = q[0];'),
  'fb-plain': (s) => withheld(s),
  'fb-prewarm': (s) => withheld(s),
  'plant-enqueue-fb': (s) => VARIANTS['plant-enqueue'](withheld(s)),
  'plant-enqueue': sub('enqueue', "  const jobs = [\n    ['makeClothMap', () => [], makeClothMapImpl],",
    "  const jobs = [\n    ['__plantEnqueue', () => [], () => { _snkOcclPending.set('planted-occl', { pos: null, nor: null, sampler: null, xOff: 0, yOff: 0, zOff: 0, side: 1, tap: 'single', count: 0, arr: new Float32Array(0) }); return 0; }],\n    ['makeClothMap', () => [], makeClothMapImpl],"),
};

// ---- browser globals with a pixel-faithful canvas (ImageData state is real; other 2D calls are logged by value)
const noop = () => {};
const CANVASES = [];
function canvasDigest(c) { return createHash('sha256').update(`${c.width}x${c.height}|`).update(c.px ? Buffer.from(c.px.buffer, c.px.byteOffset, c.px.byteLength) : Buffer.alloc(0)).update(JSON.stringify(c.ops)).digest('hex').slice(0, 16); }
const argKey = (a) => (a && typeof a === 'object' ? (a.__cv !== undefined ? `cv:${canvasDigest(a)}` : a.__grad ? `grad:${JSON.stringify(a.__grad)}` : a.data && a.width ? `img:${a.width}x${a.height}` : JSON.stringify(a)) : String(a));
function makeCanvas() {
  const c = { __cv: CANVASES.length, width: 300, height: 150, style: {}, px: null, ops: [], setAttribute: noop, appendChild: noop, addEventListener: noop, toDataURL: () => '' };
  CANVASES.push(c);
  let ctx = null;
  c.getContext = (kind) => {
    if (kind !== '2d') return null;
    if (ctx) return ctx;
    const store = {};
    ctx = new Proxy({}, {
      get: (t, k) => {
        if (k === 'createImageData') return (w, h) => { const W = typeof w === 'object' ? w.width : w, H = typeof w === 'object' ? w.height : h; return { data: new Uint8ClampedArray(W * H * 4), width: W, height: H }; };
        if (k === 'getImageData') return (x, y, w, h) => { const out = new Uint8ClampedArray(w * h * 4); if (c.px && x === 0 && y === 0 && w === c.width && h === c.height) out.set(c.px); c.ops.push(['getImageData', x, y, w, h]); return { data: out, width: w, height: h }; };
        if (k === 'putImageData') return (img, x, y) => { if (x === 0 && y === 0 && img.width === c.width && img.height === c.height) c.px = img.data.slice(); else c.ops.push(['putImageData-partial', x, y, img.width, img.height, createHash('sha256').update(img.data).digest('hex').slice(0, 16)]); };
        if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return (...a) => { const gr = { __grad: [k, a.map(argKey), []], addColorStop(o, col) { gr.__grad[2].push([o, col]); } }; return gr; };
        if (k === 'measureText') return (txt) => ({ width: String(txt).length });
        if (k in store) return store[k];
        return (...a) => { c.ops.push([String(k), ...a.map(argKey)]); };
      },
      set: (t, k, v) => { store[k] = v; c.ops.push(['set', String(k), argKey(v)]); return true; },
    });
    return ctx;
  };
  return c;
}
const g = globalThis;
g.window ??= g; g.addEventListener ??= noop; g.removeEventListener ??= noop; g.dispatchEvent ??= () => true;
g.matchMedia ??= () => ({ matches: false, addEventListener: noop, removeEventListener: noop, addListener: noop, removeListener: noop });
g.sessionStorage ??= { getItem: () => null, setItem: noop, removeItem: noop };
g.location ??= { search: '', href: 'http://localhost/', origin: 'http://localhost', pathname: '/' };
g.navigator ??= { userAgent: 'node', language: 'en' };
g.document ??= { createElement: (tag) => (tag === 'canvas' ? makeCanvas() : { getContext: () => null, style: {}, setAttribute: noop, appendChild: noop, addEventListener: noop }), createElementNS: () => makeCanvas(), body: { appendChild: noop, classList: { add: noop, remove: noop } }, documentElement: { style: { setProperty: noop }, classList: { add: noop, remove: noop } }, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener: noop, head: { appendChild: noop } };
g.requestAnimationFrame ??= () => 0; g.cancelAnimationFrame ??= noop; g.devicePixelRatio ??= 1; g.innerWidth ??= 1280; g.innerHeight ??= 720;
g.CustomEvent ??= class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } }; g.Image ??= class Image {};
// the browser's ImageData (the CN8 ring texture builds from it; without it the CN8 build throws and refuses mid-populate)
g.ImageData ??= class ImageData { constructor(a, b, c) { if (typeof a === 'number') { this.width = a; this.height = b; this.data = new Uint8ClampedArray(a * b * 4); } else { this.data = a; this.width = b; this.height = c ?? Math.round(a.length / 4 / b); } } };
registerHooks({
  resolve: (s, c, next) => (s === 'three' ? { url: THREE_URL, shortCircuit: true } : next(s, c)),
  load(url, c, next) {
    const u = new URL(url);
    const v = u.searchParams.get('ysnode');
    if (v === null || u.pathname !== TABLE_PATH) return next(url, c);
    if (!VARIANTS[v]) throw new Error(`ysnode: unknown variant ${v}`);
    return { format: 'module', source: VARIANTS[v](SHIPPED), shortCircuit: true };
  },
});
const load = (v) => import(`${pathToFileURL(TABLE).href}?ysnode=${v}`);

// ---- one build: digests, prewarm stats, the occlusion enqueue order, the [table] prewarm log line
const bits = (x) => { const d = new DataView(new ArrayBuffer(8)); d.setFloat64(0, x); return d.getBigUint64(0).toString(16); };
const lossless = (o) => { try { return JSON.stringify(o, (k, x) => (typeof x === 'number' ? `f:${bits(x)}` : (x && typeof x === 'object' && x.isObject3D ? '[obj]' : x))); } catch { return '[unserializable]'; } };
async function build(mod, tableId, { prewarmFor = null } = {}) {
  try { const prep = mod.buildTable.prepare?.(tableId); if (prep) await prep; } catch { /* CN8 transport refused: the build refuses too */ }
  // the spy covers the prewarm AND the build: an occlusion job enqueued by a prewarm job would precede populate's
  const mark = CANVASES.length, logs = [], occl = [];
  const info = console.info, set = Map.prototype.set;
  console.info = (...a) => { const s = a.join(' '); if (s.startsWith('[table] prewarm')) logs.push(s); };
  Map.prototype.set = function (k, v) {
    if (v && typeof v === 'object' && 'sampler' in v && 'tap' in v && v.arr instanceof Float32Array) occl.push([typeof k === 'symbol' ? `sym:${k.description}` : String(k), v.count, v.side, v.tap]);
    return set.call(this, k, v);
  };
  let built;
  try {
    if (prewarmFor) await mod.buildTable.prewarm(prewarmFor);
    built = mod.buildTable({ tableId });
  } finally { console.info = info; Map.prototype.set = set; }
  if (built.group.userData.cn8TransportRefusal) throw new Error(`${tableId}: the build REFUSED (${JSON.stringify(built.group.userData.cn8TransportRefusal)})`);
  const meshes = createHash('sha256'), tex = [], seen = new Set();
  built.group.traverse((o) => {
    if (o.geometry) {
      const geo = o.geometry;
      for (const a of Object.keys(geo.attributes).sort()) { const at = geo.attributes[a]; meshes.update(`${a}|${at.itemSize}|${at.normalized}|`); meshes.update(Buffer.from(at.array.buffer, at.array.byteOffset, at.array.byteLength)); }
      if (geo.index) meshes.update(Buffer.from(geo.index.array.buffer, geo.index.array.byteOffset, geo.index.array.byteLength));
      meshes.update(lossless({ groups: geo.groups, drawRange: geo.drawRange, ud: geo.userData, oud: o.userData }));
    }
    for (const m of [].concat(o.material ?? [])) {
      if (!m || seen.has(m)) continue; seen.add(m);
      for (const k of Object.keys(m).sort()) { const t = m[k]; if (t && t.isTexture) { const im = t.image; const dg = im && im.__cv !== undefined ? canvasDigest(im) : im && im.data ? createHash('sha256').update(Buffer.from(im.data.buffer ?? im.data)).digest('hex').slice(0, 16) : typeof im; const mips = (t.mipmaps || []).map((mm) => (mm && mm.data ? createHash('sha256').update(Buffer.from(mm.data.buffer ?? mm.data)).digest('hex').slice(0, 12) : typeof mm)).join(','); tex.push(`${m.type}|${k}|${dg}|mips:${mips}`); } }
    }
  });
  // canvases this build consumed: created since the mark, plus the ones the prewarm made and the build took
  return { mesh: meshes.digest('hex').slice(0, 16), tex: createHash('sha256').update(tex.join('\n')).digest('hex').slice(0, 16), texN: tex.length,
    stats: built.prewarmStats?.() ?? null, logs, occl: JSON.stringify(occl), occlN: occl.length, canvasesSince: CANVASES.slice(mark).map(canvasDigest) };
}

let fails = 0;
const bad = (m) => { fails++; console.log(`  BAD  ${m}`); };
const ok = (m) => console.log(`  ok   ${m}`);
// each instance installs its own window.__snkOccl (the shipped-transport stats); keep the handle per instance
const plain = await load('plain'); const plainOccl = g.__snkOccl;
const pre = await load('prewarm'); const preOccl = g.__snkOccl;
if (!plainOccl || !preOccl || plainOccl === preOccl) bad('N-YS3 setup: each table.js instance must install its own window.__snkOccl');
const hitsOf = (o) => { const st = o?.shipped?.(); return st ? { hits: st.hits, misses: st.misses, loaded: st.loaded } : null; };
const refs = {};
for (const t of SPECS) {
  const ha0 = hitsOf(plainOccl), a = await build(plain, t), ha1 = hitsOf(plainOccl);
  const hb0 = hitsOf(preOccl), b = await build(pre, t, { prewarmFor: t }), hb1 = hitsOf(preOccl);
  refs[t] = a;
  const s = b.stats || {};
  const same = a.mesh === b.mesh && a.tex === b.tex;
  const allTaken = s.put > 0 && s.taken === s.put && s.unused === 0 && !s.threw;
  if (!same) bad(`N-YS1 ${t}: bytes differ with the prewarm (mesh ${a.mesh}/${b.mesh}, textures ${a.tex}/${b.tex})`);
  else if (!allTaken) bad(`N-YS1 ${t}: identical bytes but the cache was not fully used: ${JSON.stringify(s)}`);
  else ok(`N-YS1 ${t}: identical bytes (mesh ${a.mesh}, ${a.texN} texture slots); ${s.put} prewarmed entries all taken`);
  if (t === 'wpbsa_snooker_12ft') {
    const da = ha1 && ha0 ? { hits: ha1.hits - ha0.hits, misses: ha1.misses - ha0.misses } : null;
    const db = hb1 && hb0 ? { hits: hb1.hits - hb0.hits, misses: hb1.misses - hb0.misses } : null;
    if (!da || !db || !ha1.loaded || !hb1.loaded) bad(`N-YS3a snooker: the shipped transport did not load (${JSON.stringify({ ha1, hb1 })})`);
    else if (da.hits === 0) bad('N-YS3a snooker: the build took no shipped hit (vacuous)');
    else if (a.occlN !== 0 || b.occlN !== 0) bad(`N-YS3a snooker: occlusion jobs enqueued on the shipped path (${a.occlN} / ${b.occlN})`);
    else if (da.hits !== db.hits || da.misses !== 0 || db.misses !== 0) bad(`N-YS3a snooker: shipped hits differ with the prewarm or missed (${JSON.stringify({ da, db })})`);
    else ok(`N-YS3a snooker: shipped transport, ${da.hits} hits and 0 misses with and without the prewarm; no occlusion job enqueued`);
  }
}
{ // N-YS3b: the runtime-bake fallback (the shipped transport withheld): the occlusion enqueue order is unchanged
  const fp = await load('fb-plain'), fq = await load('fb-prewarm');
  const a = await build(fp, 'wpbsa_snooker_12ft'), b = await build(fq, 'wpbsa_snooker_12ft', { prewarmFor: 'wpbsa_snooker_12ft' });
  refs.fallback = a;
  if (a.occlN === 0) bad('N-YS3b snooker fallback: the spy saw no occlusion job (vacuous)');
  else if (a.occl !== b.occl) bad(`N-YS3b snooker fallback: the occlusion enqueue order differs with the prewarm (${a.occlN} vs ${b.occlN} jobs)`);
  else if (a.mesh !== b.mesh || a.tex !== b.tex) bad('N-YS3b snooker fallback: bytes differ with the prewarm');
  else ok(`N-YS3b snooker fallback: ${a.occlN} occlusion jobs enqueued in the same order with and without the prewarm; identical bytes`);
}
{ // N-YS2: a prewarm for another table: every entry unused, the named line, identical build
  const b = await build(pre, 'pool_pro_9ft', { prewarmFor: 'wpbsa_snooker_12ft' });
  const s = b.stats || {};
  if (b.mesh !== refs.pool_pro_9ft.mesh || b.tex !== refs.pool_pro_9ft.tex) bad('N-YS2 other-table prewarm: bytes differ');
  else if (!(s.unused > 0 && b.logs.length === 1)) bad(`N-YS2 other-table prewarm: expected unused entries and one named log line (${JSON.stringify(s)}, logs ${b.logs.length})`);
  else ok(`N-YS2 a snooker prewarm under a pool build: identical bytes, ${s.unused} entries unused, one named line: ${b.logs[0].slice(0, 110)}`);
}
console.log(fails ? `TABLE-PREWARM: ${fails} FAILURE(S)` : 'TABLE-PREWARM: OK (identity on all specs, fallback, snooker occlusion: shipped and runtime-bake order)');

if (SELFTEST && !fails) {
  let missed = 0;
  const plant = (name, hit, msg) => { if (!hit) missed++; console.log(`  ${hit ? 'ok  ' : 'BAD '} plant ${name}: ${msg}`); };
  { const m = await load('plant-mismatch'); const b = await build(m, 'pool_pro_9ft', { prewarmFor: 'pool_pro_9ft' }); const s = b.stats || {};
    const hit = b.mesh === refs.pool_pro_9ft.mesh && s.unused === 1 && s.unusedNames?.includes('makeLeatherNormal') && (s.missByName?.makeLeatherNormal ?? 0) >= 1 && b.logs.length === 1;
    plant('a mismatched job argument', hit, hit ? `inline fallback, identical bytes, unused ${s.unused} (${s.unusedNames}), the named line` : JSON.stringify({ s, logs: b.logs, same: b.mesh === refs.pool_pro_9ft.mesh })); }
  { const m = await load('plant-throw'); const b = await build(m, 'pool_pro_9ft', { prewarmFor: 'pool_pro_9ft' }); const s = b.stats || {};
    const hit = b.mesh === refs.pool_pro_9ft.mesh && /planted/.test(s.threw ?? '');
    plant('a job that throws', hit, hit ? `prewarm stopped (${s.threw}), identical bytes` : JSON.stringify(s)); }
  { const m = await load('plant-noshot'); const b = await build(m, 'wpbsa_snooker_12ft', { prewarmFor: 'wpbsa_snooker_12ft' });
    // a result handed out twice leaves its twin entry undelivered: the cache reports unused entries (and, where the
    // sharer mutates, the bytes differ too); N-YS1 requires unused === 0
    const s = b.stats || {};
    const hit = s.unused > 0 || b.mesh !== refs.wpbsa_snooker_12ft.mesh;
    plant('a cache that is not one-shot', hit, hit ? `N-YS1 cache check red: ${s.unused} entries undelivered (${s.unusedNames}); bytes ${b.mesh === refs.wpbsa_snooker_12ft.mesh ? 'identical (the boot sheets merge before the mirror reverses its copy)' : 'differ'}` : JSON.stringify(s)); }
  { const m = await load('plant-enqueue'); const b = await build(m, 'wpbsa_snooker_12ft', { prewarmFor: 'wpbsa_snooker_12ft' });
    const hit = b.occl !== refs.wpbsa_snooker_12ft.occl;
    plant('a prewarm job that enqueues an occlusion job (shipped path)', hit, hit ? `N-YS3a differs (${refs.wpbsa_snooker_12ft.occlN} vs ${b.occlN} jobs)` : 'the enqueue order stayed identical'); }
  { const m = await load('plant-enqueue-fb'); const b = await build(m, 'wpbsa_snooker_12ft', { prewarmFor: 'wpbsa_snooker_12ft' });
    const hit = b.occl !== refs.fallback.occl;
    plant('a prewarm job that enqueues an occlusion job (fallback)', hit, hit ? `N-YS3b differs (${refs.fallback.occlN} vs ${b.occlN} jobs)` : 'the enqueue order stayed identical'); }
  console.log(missed ? `TABLE-PREWARM --selftest-plants: ${missed} plant(s) not caught` : 'TABLE-PREWARM --selftest-plants: OK (5 plants)');
  if (missed) fails++;
}
process.exitCode = fails ? 1 : 0;
