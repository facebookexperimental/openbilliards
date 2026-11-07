// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-room-luminance-tables.mjs — GH-1115: room.js's luminance passes run on exact 256-entry
// lookup tables instead of per-pixel Math.pow. This arm runs room.js's REAL texture pipeline in
// node (buildRoom, setDressing) against a canvas stub that keeps real pixel state, once with the
// shipped room.js and twice with a REFERENCE rebuilt from it by an inverse transform (the
// pre-GH-1115 per-pixel code), and requires every canvas byte, every dressing-ledger double and
// every material colour to be identical on every leg: L1 class boot, L2 setDressing('legacy'),
// L3 setDressing('class'), L4 venue=off boot. It also checks the tables against _lin/_enc on every
// byte. --selftest-plants: an encode-table byte, a ledger-precision plant, transform drift, stub
// guards and a zero-buffer canvas must each go red on their target.
//   node web/tools/test-room-luminance-tables.mjs [--selftest-plants] [--pin-base <git blob sha1>]
// Node >= 22.15 (module.registerHooks). Plain node, no browser. Never imported by the app.
import { registerHooks } from 'node:module';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOM = path.resolve(HERE, '../scene/room.js');
const ROOM_PATH = pathToFileURL(ROOM).pathname;
const THREE_URL = pathToFileURL(path.resolve(HERE, '../vendor/three.module.min.js')).href;
const SHIPPED = fs.readFileSync(ROOM, 'utf8');
const argv = process.argv.slice(2);
const SELFTEST = argv.includes('--selftest-plants');
const PIN = argv.includes('--pin-base') ? argv[argv.indexOf('--pin-base') + 1] : null;

// ---- the reference: the shipped text with the tables removed and the four per-pixel lines restored
const count = (s, n) => s.split(n).length - 1;
function toReference(src) {
  const lines = src.split('\n');
  const a = lines.findIndex((l) => l.startsWith('const _enc = '));
  const b = lines.findIndex((l) => l.startsWith('const encTable = '));
  if (a < 0 || b <= a || lines.filter((l) => l.startsWith('const _enc = ')).length !== 1
    || lines.filter((l) => l.startsWith('const encTable = ')).length !== 1) throw new Error('room.js drifted at R0 (table block anchors)');
  const cut = lines.slice(a + 1, b + 1);
  for (const l of cut) if (!/^\/\/( |$)/.test(l) && !/^const (LIN|LIN_R|LIN_G|LIN_B|encTable) = /.test(l)) throw new Error(`room.js drifted at R0 (unexpected line in the table block: ${l.slice(0, 60)})`);
  for (const c of ['LIN', 'LIN_R', 'LIN_G', 'LIN_B', 'encTable']) if (cut.filter((l) => l.startsWith(`const ${c} = `)).length !== 1) throw new Error(`room.js drifted at R0 (${c})`);
  let s = [...lines.slice(0, a + 1), ...lines.slice(b + 1)].join('\n');
  const R = [
    ['R1', '  for (let i = 0; i < d.length; i += 4) acc += LIN_R[d[i]] + LIN_G[d[i + 1]] + LIN_B[d[i + 2]];\n',
      '  for (let i = 0; i < d.length; i += 4) acc += 0.2126 * _lin(d[i]) + 0.7152 * _lin(d[i + 1]) + 0.0722 * _lin(d[i + 2]);\n'],
    ['R2', '    const enc = encTable(g);\n    for (let i = 0; i < d.length; i += 4) {\n      d[i] = enc[d[i]]; d[i + 1] = enc[d[i + 1]]; d[i + 2] = enc[d[i + 2]];\n',
      '    for (let i = 0; i < d.length; i += 4) {\n      d[i] = _enc(_lin(d[i]) * g); d[i + 1] = _enc(_lin(d[i + 1]) * g); d[i + 2] = _enc(_lin(d[i + 2]) * g);\n'],
    ['R3', '  for (let i = 0; i < d.length; i += 4) pk = Math.max(pk, LIN[d[i]], LIN[d[i + 1]], LIN[d[i + 2]]);\n',
      '  for (let i = 0; i < d.length; i += 4) pk = Math.max(pk, _lin(d[i]), _lin(d[i + 1]), _lin(d[i + 2]));\n'],
    ['R4', '  const enc = encTable(g);\n  for (let i = 0; i < d.length; i += 4) {\n    d[i] = enc[d[i]]; d[i + 1] = enc[d[i + 1]]; d[i + 2] = enc[d[i + 2]];\n',
      '  for (let i = 0; i < d.length; i += 4) {\n    d[i] = _enc(_lin(d[i]) * g); d[i + 1] = _enc(_lin(d[i + 1]) * g); d[i + 2] = _enc(_lin(d[i + 2]) * g);\n'],
  ];
  for (const [tag, needle, repl] of R) {
    if (count(s, needle) !== 1) throw new Error(`room.js drifted at ${tag}`);
    s = s.replace(needle, () => repl);
  }
  if (/\bLIN(_[RGB])?\b/.test(s) || /\bencTable\b/.test(s) || count(s, '_lin(d[') !== 12 || count(s, '_enc(_lin(') !== 6) throw new Error('room.js reference check failed (tokens left or per-pixel calls missing)');
  return s;
}
const swap = (tag, needle, repl) => (s) => { if (count(s, needle) !== 1) throw new Error(`plant anchor ${tag} missing`); return s.replace(needle, () => repl); };
const VARIANTS = {
  shipped: (s) => s,
  ref: toReference,
  probe: (s) => `${s}\nexport { _lin as __rnLin, _enc as __rnEnc, LIN as __rnLIN, LIN_R as __rnLR, LIN_G as __rnLG, LIN_B as __rnLB, encTable as __rnEncTable };\n`,
  'plant-enc': swap('P1', 'const encTable = (g) => Uint8Array.from({ length: 256 }, (_, u) => _enc(LIN[u] * g));',
    'const encTable = (g) => { const t = Uint8Array.from({ length: 256 }, (_, u) => _enc(LIN[u] * g)); t[25] ^= 1; return t; };'),
  'plant-lin': swap('P2', 'const LIN_G = LIN.map((l) => 0.7152 * l);', 'const LIN_G = LIN.map((l, u) => (u === 40 ? 0.7152 * l * (1 + 2 ** -20) : 0.7152 * l));'),
};

// ---- a 2D canvas stub with real pixel state (alpha-255 put/get is lossless, as in Skia/CoreGraphics)
const CANVASES = [];
let ZERO_CTX = false; // P5: the vacuous stub the other node harnesses use (zero reads, dropped puts)
class PixelCanvas {
  constructor() { this.seq = CANVASES.push(this) - 1; this._w = 300; this._h = 150; this.px = null; this.ctx = null; this.raster = []; this.lossy = false; this.reads = 0; this.puts = 0; this.firstHist = null; }
  get width() { return this._w; } set width(v) { this._w = v >>> 0; this.reset(); }
  get height() { return this._h; } set height(v) { this._h = v >>> 0; this.reset(); }
  reset() { this.px = null; this.raster = []; this.lossy = false; }
  bitmap() { return (this.px ??= new Uint8ClampedArray(this._w * this._h * 4)); }
  getContext(kind, opts) { if (kind !== '2d') return null; if (opts !== undefined) throw new Error('2d context options not reviewed'); return (this.ctx ??= ctx2d(this)); }
  addEventListener() {} removeEventListener() {} setAttribute() {}
}
function ctx2d(cv) {
  const api = {
    createImageData(w, h) { if (!Number.isInteger(w) || !Number.isInteger(h)) throw new Error('createImageData form not reviewed'); return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h, colorSpace: 'srgb' }; },
    getImageData(x, y, w, h, ...rest) {
      if (rest.length || x !== 0 || y !== 0 || w !== cv.width || h !== cv.height) throw new Error('getImageData: only the full canvas is reviewed');
      if (ZERO_CTX) return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
      if (cv.raster.length) throw new Error('getImageData on a canvas with unrasterized fills');
      if (cv.lossy) throw new Error('getImageData on a canvas with alpha < 255 (the browser round trip would round)');
      cv.reads++;
      return { data: cv.bitmap().slice(), width: w, height: h, colorSpace: 'srgb' };
    },
    putImageData(img, x, y, ...dirty) {
      if (dirty.length || x !== 0 || y !== 0) throw new Error('putImageData: only a full put at 0,0 is reviewed');
      if (!(img.data instanceof Uint8ClampedArray) || img.width !== cv.width || img.height !== cv.height) throw new Error('putImageData: data must be a full-size Uint8ClampedArray');
      if (ZERO_CTX) return;
      for (let i = 3; i < img.data.length; i += 4) if (img.data[i] !== 255) { cv.lossy = true; break; }
      cv.px = img.data.slice(); cv.raster = []; cv.puts++;
      if (!cv.firstHist) { const h = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)]; for (let i = 0; i < cv.px.length; i += 4) { h[0][cv.px[i]]++; h[1][cv.px[i + 1]]++; h[2][cv.px[i + 2]]++; } cv.firstHist = h; }
    },
    fillRect(...a) { cv.raster.push(['fillRect', api._style, ...a]); },
    createLinearGradient(...a) { const g = { stops: [], addColorStop(o, c) { g.stops.push([o, c]); } }; cv.raster.push(['linear', a, g.stops]); return g; },
    createRadialGradient(...a) { const g = { stops: [], addColorStop(o, c) { g.stops.push([o, c]); } }; cv.raster.push(['radial', a, g.stops]); return g; },
    _style: null,
  };
  return new Proxy(api, {
    get(t, k) { if (k === 'fillStyle') return t._style; if (k in t && k !== '_style') return t[k]; throw new Error(`unreviewed 2D API: ${String(k)}`); },
    set(t, k, v) { if (k !== 'fillStyle') throw new Error(`unreviewed 2D property set: ${String(k)}`); t._style = typeof v === 'object' && v?.stops ? { gradient: v.stops } : v; return true; },
  });
}

// ---- browser globals (table-in-node's set), the canvas stub, the variant loader
const noop = () => {};
const inert = () => ({ style: {}, setAttribute: noop, appendChild: noop, addEventListener: noop, removeEventListener: noop, classList: { add: noop, remove: noop } });
const g = globalThis;
g.window = g;
g.addEventListener = noop; g.removeEventListener = noop; g.dispatchEvent = () => true;
g.matchMedia = () => ({ matches: false, addEventListener: noop, removeEventListener: noop, addListener: noop, removeListener: noop });
g.sessionStorage = { getItem: () => null, setItem: noop, removeItem: noop };
g.localStorage = { getItem: () => null, setItem: noop, removeItem: noop };
g.location = { search: '', href: 'http://localhost/', origin: 'http://localhost', pathname: '/' };
g.navigator ??= { userAgent: 'node', language: 'en' };
g.document = {
  createElement: (tag) => (tag === 'canvas' ? new PixelCanvas() : inert()), createElementNS: () => inert(),
  body: inert(), documentElement: { style: { setProperty: noop }, classList: { add: noop, remove: noop } }, head: inert(),
  getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener: noop, removeEventListener: noop,
};
g.requestAnimationFrame = () => 0; g.cancelAnimationFrame = noop;
g.devicePixelRatio = 1; g.innerWidth = 1280; g.innerHeight = 720;
g.CustomEvent ??= class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
g.Image ??= class Image {};
registerHooks({
  resolve: (s, c, next) => (s === 'three' ? { url: THREE_URL, shortCircuit: true } : next(s, c)),
  load(url, c, next) {
    const u = new URL(url);
    const v = u.searchParams.get('roomnode');
    if (v === null || u.pathname !== ROOM_PATH) return next(url, c);
    if (!VARIANTS[v]) throw new Error(`roomnode: unknown variant ${v}`);
    return { format: 'module', source: VARIANTS[v](SHIPPED), shortCircuit: true };
  },
});
const load = (v) => import(`${pathToFileURL(ROOM).href}?roomnode=${v}`);

// ---- one side: the four legs, each snapshotted losslessly
const bits = (x) => { const d = new DataView(new ArrayBuffer(8)); d.setFloat64(0, x); return d.getBigUint64(0).toString(16).padStart(16, '0'); };
const lossless = (o) => JSON.stringify(o, (k, x) => (typeof x === 'number' ? `f64:${bits(x)}` : x));
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);
function digestCanvas(cv) {
  if (!cv) return null;
  if (cv.px && !cv.raster.length) return { w: cv.width, h: cv.height, px: sha(cv.px) };
  return { w: cv.width, h: cv.height, ops: sha(JSON.stringify(cv.raster)) };
}
function snapshot(R) {
  const mats = [], seen = new Set();
  R.group.traverse((o) => {
    for (const m of [].concat(o.material ?? [])) {
      if (seen.has(m)) continue;
      seen.add(m);
      mats.push({ type: m.type, color: m.color ? [m.color.r, m.color.g, m.color.b] : null, env: m.envMapIntensity ?? null,
        emissive: m.emissive ? [m.emissive.r, m.emissive.g, m.emissive.b] : null, map: digestCanvas(m.map?.image) });
    }
  });
  return { mode: R.dressing?.mode ?? null, ledger: lossless(R.dressing?.ledger ?? null), mats: lossless(mats) };
}
async function runSide(variant) {
  const m = await load(variant);
  const mark = CANVASES.length;
  const io = () => CANVASES.slice(mark).reduce((a, c) => [a[0] + c.reads, a[1] + c.puts], [0, 0]);
  const legs = {};
  const leg = (name, fn) => { const [r0, p0] = io(); const R = fn(); const [r1, p1] = io(); legs[name] = { ...snapshot(R), reads: r1 - r0, puts: p1 - p0 }; return R; };
  const R = leg('L1', () => m.buildRoom({ envBinding: true, reason: null }));
  const noise = CANVASES.slice(mark, mark + 8).filter((c) => c.firstHist);
  leg('L2', () => { R.setDressing('legacy'); return R; });
  leg('L3', () => { R.setDressing('class'); return R; });
  leg('L4', () => m.buildRoom({ envBinding: false, reason: 'venue=off' }));
  return { variant, legs, noise, ledgerL1: R.dressing?.ledger };
}
function diff(a, b, legs = ['L1', 'L2', 'L3', 'L4']) {
  const out = [];
  for (const L of legs) for (const k of ['mode', 'ledger', 'mats', 'reads', 'puts']) {
    if (a.legs[L][k] === b.legs[L][k]) continue;
    const x = String(a.legs[L][k]), y = String(b.legs[L][k]); let i = 0; while (i < x.length && x[i] === y[i]) i++;
    out.push(`${L}.${k} differs at char ${i}: …${x.slice(Math.max(0, i - 40), i + 40)}… vs …${y.slice(Math.max(0, i - 40), i + 40)}…`);
  }
  return out;
}
function vacuity(side) {
  const bad = [];
  if (side.noise.length < 5) bad.push(`${side.noise.length} noise canvas(es) put, want the 5 class-boot noise canvases`);
  for (const c of side.noise) { const distinct = c.firstHist[1].filter((n) => n > 0).length; if (distinct < 4) bad.push(`noise canvas #${c.seq} is (near-)constant (${distinct} G values)`); }
  const rows = side.ledgerL1 ?? [];
  const floor = rows[0]?.after, wall = rows[1]?.after;
  if (!(Math.abs(floor - 0.10) < 0.02)) bad.push(`class floor ledger.after = ${floor}, want ~0.10`);
  if (!(Math.abs(wall - 0.25) < 0.05)) bad.push(`class wall ledger.after = ${wall}, want ~0.25`);
  if (!(side.legs.L1.reads > 0 && side.legs.L1.puts > 0)) bad.push(`no pixel I/O on L1 (reads ${side.legs.L1.reads}, puts ${side.legs.L1.puts})`);
  return bad;
}

let failures = 0;
const fail = (m) => { failures++; console.log(`  BAD  ${m}`); };
const ok = (m) => console.log(`  ok   ${m}`);
const ref = toReference(SHIPPED);
if (PIN) {
  const blob = crypto.createHash('sha1').update(`blob ${Buffer.byteLength(ref)}\0`).update(ref).digest('hex');
  if (blob === PIN) ok(`the reference transform rebuilds git blob ${PIN.slice(0, 12)} (the pre-GH-1115 room.js)`);
  else fail(`the reference transform's blob is ${blob.slice(0, 12)}, not --pin-base ${PIN.slice(0, 12)}`);
}
const refA = await runSide('ref');
const shipped = await runSide('shipped');
const refB = await runSide('probe'); // the shipped text + exports: the second reference pass runs below
const refC = await runSide('ref');
for (const [name, x, y] of [['reference vs reference (per-pixel path stable across JIT tiers)', refA, refC], ['shipped tables vs reference', refA, shipped], ['shipped tables vs shipped + probe exports', shipped, refB]]) {
  const d = diff(x, y);
  if (d.length) fail(`${name}: ${d.length} difference(s); first: ${d[0]}`); else ok(`${name}: every canvas byte, ledger double and material colour identical on L1-L4`);
}
const vac = vacuity(refA);
if (vac.length) fail(`anti-vacuity: ${vac.join('; ')}`);
else ok(`anti-vacuity: ${refA.noise.length} noise canvases, floor ${refA.ledgerL1[0].after.toFixed(4)}, wall ${refA.ledgerL1[1].after.toFixed(4)}, I/O L1 ${refA.legs.L1.reads}r/${refA.legs.L1.puts}p L2 ${refA.legs.L2.reads}r/${refA.legs.L2.puts}p L3 ${refA.legs.L3.reads}r/${refA.legs.L3.puts}p L4 ${refA.legs.L4.reads}r/${refA.legs.L4.puts}p`);
{ // the tables against the functions on every byte (exhaustive) and ENC on a spread of gains
  const p = await load('probe');
  let bad = 0;
  for (let u = 0; u < 256; u++) {
    const l = p.__rnLin(u);
    if (!Object.is(p.__rnLIN[u], l) || !Object.is(p.__rnLR[u], 0.2126 * l) || !Object.is(p.__rnLG[u], 0.7152 * l) || !Object.is(p.__rnLB[u], 0.0722 * l)) bad++;
  }
  const gains = [0, 1e-6, 0.05, 0.37, 1, 1.5, 2.25, 3.9, 7.7, 19.5, 1e6];
  for (let i = 0; i < 400; i++) gains.push(0.1 + i * 0.0731);
  for (const gn of gains) { const t = p.__rnEncTable(gn); for (let u = 0; u < 256; u++) if (t[u] !== p.__rnEnc(p.__rnLin(u) * gn)) bad++; }
  if (bad) fail(`tables vs functions: ${bad} mismatching entr(ies)`); else ok(`tables vs functions: LIN/LIN_R/LIN_G/LIN_B equal _lin on all 256 bytes; encTable(g) equals _enc(_lin(u)·g) for ${gains.length} gains × 256 bytes`);
}
console.log(failures ? `ROOM-LUT: ${failures} FAILURE(S)` : 'ROOM-LUT: OK (shipped tables byte- and double-identical to the per-pixel reference)');

if (SELFTEST && !failures) {
  let missed = 0;
  const plant = (name, okIf) => { const hit = okIf(); if (!hit.ok) missed++; console.log(`  ${hit.ok ? 'ok  ' : 'BAD '} plant ${name}: ${hit.msg}`); };
  // P1: one encode-table byte (certified: the class floor's noise carries G = 25)
  const p1 = await runSide('plant-enc');
  const floorNoise = refA.noise[0];
  plant('P1 an encode-table byte (t[25] ^= 1)', () => {
    if (!(floorNoise?.firstHist[1][25] > 0)) return { ok: false, msg: 'not exercised: the class floor noise has no G = 25' };
    const red = ['L1', 'L2', 'L3', 'L4'].filter((L) => diff(shipped, p1, [L]).length);
    return { ok: red.join() === 'L1,L3', msg: `red on ${red.join(', ') || 'nothing'} (targets L1, L3; L2/L4 have no encode pass)` };
  });
  // P2: one ledger double perturbed by 2^-20 relative (certified: the class wall noise carries G = 40)
  const p2 = await runSide('plant-lin');
  plant('P2 a 2^-20 change in one weighted-table entry', () => {
    const wallNoise = refA.noise[1];
    if (!(wallNoise?.firstHist[1][40] > 0)) return { ok: false, msg: 'not exercised: the class wall noise has no G = 40' };
    const red = shipped.legs.L1.ledger !== p2.legs.L1.ledger;
    return { ok: red, msg: red ? 'red on the L1 ledger (doubles compared bit-exactly)' : 'L1 ledger unchanged' };
  });
  // P3: transform drift must refuse, by anchor
  for (const [name, mut] of [
    ['P3a an anchor respaced', (s) => s.replace('acc += LIN_R[d[i]] + LIN_G', 'acc +=  LIN_R[d[i]] + LIN_G')],
    ['P3b an anchor duplicated', (s) => s.replace('  for (let i = 0; i < d.length; i += 4) pk = Math.max(pk, LIN[d[i]]', '  // for (let i = 0; i < d.length; i += 4) pk = Math.max(pk, LIN[d[i]], LIN[d[i + 1]], LIN[d[i + 2]]);\n  for (let i = 0; i < d.length; i += 4) pk = Math.max(pk, LIN[d[i]]')],
    ['P3c code inside the table block', (s) => s.replace('const LIN_B = ', 'globalThis.x = 1;\nconst LIN_B = ')],
  ]) plant(name, () => { try { toReference(mut(SHIPPED)); return { ok: false, msg: 'the transform accepted a drifted text' }; } catch (e) { return { ok: /drifted|check failed/.test(e.message), msg: `refused: ${e.message}` }; } });
  // P4: stub guards
  const cv = () => { const c = new PixelCanvas(); c.width = 4; c.height = 4; return c; };
  for (const [name, act] of [
    ['P4a read after a put with alpha 254', () => { const c = cv(), x = c.getContext('2d'), im = x.createImageData(4, 4); im.data.fill(255); im.data[3] = 254; x.putImageData(im, 0, 0); x.getImageData(0, 0, 4, 4); }],
    ['P4b read after an unrasterized fill', () => { const c = cv(), x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 4, 4); x.getImageData(0, 0, 4, 4); }],
    ['P4c a partial read', () => { const c = cv(); c.getContext('2d').getImageData(0, 0, 3, 4); }],
    ['P4d a put of Uint8Array data', () => { const c = cv(); c.getContext('2d').putImageData({ data: new Uint8Array(64), width: 4, height: 4 }, 0, 0); }],
    ['P4e an unreviewed 2D API', () => { const c = cv(); c.getContext('2d').drawImage(c, 0, 0); }],
  ]) plant(name, () => { try { act(); return { ok: false, msg: 'no throw' }; } catch (e) { return { ok: true, msg: `throws: ${e.message.slice(0, 80)}` }; } });
  // P5: the vacuous zero-buffer stub must fail the anti-vacuity checks
  ZERO_CTX = true;
  let p5 = null, p5err = null;
  try { p5 = await runSide('ref'); } catch (e) { p5err = e; }
  ZERO_CTX = false;
  plant('P5 a zero-buffer canvas (reads 0, drops puts)', () => {
    if (p5err) return { ok: true, msg: `the room pipeline itself refused: ${p5err.message.slice(0, 80)}` };
    const v = vacuity(p5);
    return { ok: v.length > 0, msg: v.length ? `anti-vacuity red: ${v[0]}` : 'anti-vacuity stayed green' };
  });
  console.log(missed ? `ROOM-LUT --selftest-plants: ${missed} plant(s) not caught` : 'ROOM-LUT --selftest-plants: OK (11 plants)');
  if (missed) failures++;
}
process.exitCode = failures ? 1 : 0;
