// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-snk-transport.mjs — GH-1131 option A node selftest (no browser):
//   1. the committed shipped transport (web/scene/snktransport-data.js) decodes through the shipped loader
//      (web/scene/snktransport.js decode, the CN8 word-run carrier): every entry present, sized by its count, finite in
//      [0, 1], SHA-256 verified; plants of a wrong SHA-256, a corrupt or flipped or truncated payload, a wrong count, schema,
//      carrier type or key list are each refused with a named SNK_TRANSPORT_* code (table.js then bakes at runtime);
//   2. STATIC: table.js reads the shipped map at every bake-cache hit site, prepares it only for snooker tables and never
//      lets a failed load refuse the build, names its fallbacks, and keeps the bake engine-independent: no Math.sin / cos /
//      acos / atan2 / exp inside snkBayOcclSampler (literal trig) and snkPlaneCapGeom triangulates its float32 contour.
//      The loader uses no platform stream or crypto API (it must decode wherever the CN8 transport does, the native shells
//      included). In-memory plants of each are refused.
//   3. BEHAVIOUR (GH-1170): table.js's own transport preparation (the pinned prepareTableTransport, prepareSnkTransport,
//      prepareEquipment and the GH-1170 block) in a vm with a fake clock and held imports, against table.js's own bounds
//      (pinned: 8 s, 240 s, 6 s). A snooker build waits SNK_TRANSPORT_BOUND_MS at most, then goes ahead on the runtime bake;
//      the boot's two waits share one bound; a preparation that rebuilds nothing (a commit's re-preparation, a return to the
//      displayed table while another switch pends) does not wait, and every real rebuild races a fresh bound; a wait that a
//      later preparation overtook or whose request was cancelled is stale (no count, no line, no late-map install), and a
//      preparation without `current` (main.js's boot shape) is stale by the sequence alone (it still ends at its bound and
//      hands nothing on, and a Chinese-8 one stays silent too); a map
//      that lands late is held and serves the next build, never the one that gave up; a Chinese-8 build is refused with
//      CN8_TRANSPORT_TIMEOUT at CN8_TRANSPORT_BOUND_MS, and the timeout never latches (a settled failure still does, on
//      both tables); every timer is unref'd and cleared, a failed load's too. Each plant breaks the case it names (an
//      exact plant breaks no other; a plant that breaks every case broke the harness and is refused), and
//      e2e-switchperf's S3 / C1 literals must equal the bounds.
//   node web/tools/test-snk-transport.mjs   (exit 0 = every expectation held)
import fs from 'node:fs';
import { decode } from '../scene/snktransport.js';
import { artifact } from '../scene/snktransport-data.js';

export const PORT_FLAGS = {};
let bad = 0, total = 0;
const report = (name, ok, detail = '') => { total++; if (!ok) bad++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`); };
const refuses = async (name, art, code, detail = '') => {
  try { await decode(art); report(name, false, 'decoded'); }
  catch (e) { report(name, e?.code === code && String(e?.message).includes(detail), `${e?.code} ${String(e?.message).slice(0, 80)}`); }
};

// ---- 1. the committed artifact through the shipped loader
{
  const map = await decode(artifact);
  report('decode: every committed entry is present', map.size === artifact.entries && artifact.entries === artifact.keys.length, `${map.size} / ${artifact.entries}`);
  let sized = 0, finite = 0, floats = 0;
  artifact.keys.forEach((k, i) => { const a = map.get(k); if (a && a.length === artifact.counts[i] && a.length % 2 === 0) sized++;
    if (a && a.every((v) => Number.isFinite(v) && v >= 0 && v <= 1)) finite++; floats += a ? a.length : 0; });
  report('decode: every entry is sized by its count (x, y pairs)', sized === artifact.keys.length, `${sized} / ${artifact.keys.length}`);
  report('decode: every value is finite in [0, 1] (the aOccl encoding)', finite === artifact.keys.length, `${finite} / ${artifact.keys.length}`);
  report('decode: the float count matches the carrier row', floats === artifact.row.length && floats * 4 === artifact.row.bytes, `${floats} floats`);
  report('artifact: keys are sorted, unique strings carrying a sampler signature', artifact.keys.every((k, i) => typeof k === 'string' && k.includes('|') && (i === 0 || artifact.keys[i - 1] < k)));
  // plants (each names the code it must raise; the flipped byte may land in a run header or a literal word, so it accepts
  // either named carrier code — the wrong-SHA-256 and corrupt-base64 plants pin each code deterministically)
  const row = artifact.row, at = Math.floor(row.data.length / 2);
  await refuses('plant: a wrong sha256 is refused', { ...artifact, row: { ...row, sha256: '0'.repeat(64) } }, 'SNK_TRANSPORT_ARTIFACT_HASH_MISMATCH');
  await refuses('plant: a corrupt base64 payload is refused by name', { ...artifact, row: { ...row, data: row.data.slice(0, at) + '*' + row.data.slice(at + 1) } }, 'SNK_TRANSPORT_ARTIFACT_INVALID');
  try { await decode({ ...artifact, row: { ...row, data: row.data.slice(0, at) + (row.data[at] === 'A' ? 'B' : 'A') + row.data.slice(at + 1) } }); report('plant: a flipped payload byte is refused', false, 'decoded'); }
  catch (e) { report('plant: a flipped payload byte is refused', ['SNK_TRANSPORT_ARTIFACT_INVALID', 'SNK_TRANSPORT_ARTIFACT_HASH_MISMATCH'].includes(e?.code), `${e?.code} ${String(e?.message).slice(0, 60)}`); }
  await refuses('plant: a truncated carrier is refused', { ...artifact, row: { ...row, data: row.data.slice(0, -8) } }, 'SNK_TRANSPORT_ARTIFACT_INVALID');
  await refuses('plant: a count past the carrier is refused', { ...artifact, counts: [artifact.counts[0] + 2, ...artifact.counts.slice(1)] }, 'SNK_TRANSPORT_ARTIFACT_INVALID', 'count ');
  await refuses('plant: counts short of the carrier are refused', { ...artifact, counts: [artifact.counts[0] - 2, ...artifact.counts.slice(1)] }, 'SNK_TRANSPORT_ARTIFACT_INVALID', 'do not cover');
  await refuses('plant: a zero count is refused', { ...artifact, counts: [0, ...artifact.counts.slice(1)] }, 'SNK_TRANSPORT_ARTIFACT_INVALID', 'count 0');
  await refuses('plant: a fractional count is refused', { ...artifact, counts: [1.5, ...artifact.counts.slice(1)] }, 'SNK_TRANSPORT_ARTIFACT_INVALID', 'count 1.5');
  await refuses('plant: an unknown schema is refused', { ...artifact, schema: 1 }, 'SNK_TRANSPORT_ARTIFACT_INVALID');
  await refuses('plant: a carrier of another type is refused', { ...artifact, row: { ...row, type: 'Float64Array' } }, 'SNK_TRANSPORT_ARTIFACT_INVALID');
  await refuses('plant: a key / count mismatch is refused', { ...artifact, keys: artifact.keys.slice(1) }, 'SNK_TRANSPORT_ARTIFACT_INVALID');
}

// ---- 2. STATIC: table.js wiring
const why = (src) => {
  const w = [];
  const s0 = src.indexOf('function snkBayOcclSampler('), s1 = src.indexOf('\n}\n', s0);
  const sampler = s0 >= 0 && s1 > s0 ? src.slice(s0, s1) : '';
  if (!sampler) w.push('snkBayOcclSampler not found');
  const code = sampler.split('\n').map((l) => (/^\s*\/\//.test(l) ? '' : l.replace(/\s\/\/\s.*$/, ''))).join('\n');
  const trig = code.match(/Math\.(sin|cos|tan|asin|acos|atan2?|sinh|cosh|tanh|asinh|acosh|atanh|exp|expm1|log|log1p|log2|log10|pow|cbrt)\(|\*\*|=\s*Math\s*[,;]/g);
  if (trig) w.push(`snkBayOcclSampler calls engine-dependent ${[...new Set(trig)].join(' ')}`);
  if (!/const SNK_HEMI_EL = \[\[/.test(src) || !/const SNK_HEMI_AZ = \[\[/.test(src) || !/SNK_SWEEP_COS_A = -?0\.\d+, SNK_SWEEP_SIN_A = 0\.\d+;/.test(src)) w.push('the literal trig tables are missing');
  if (/_snkOcclBakeCache\.has\(key\)/.test(src)) w.push('a bake-cache hit site skips the shipped map (_snkOcclBakeCache.has(key))');
  const hits = (src.match(/const hit = _snkOcclHit\(key\);/g) || []).length;
  if (hits !== 4) w.push(`${hits} of 4 hit sites read _snkOcclHit`);
  if (!src.includes("return TABLE_SPECS[tableId]?.render?.style === 'snooker' ? prepareSnkTransport() : null;")) w.push('prepareTableTransport does not prepare the snooker transport');
  const c0 = src.indexOf('function snkPlaneCapGeom('), c1 = src.indexOf('\n}\n', c0);
  if (!(c0 >= 0 && src.slice(c0, c1).includes('pts = pts.map(snkF32);') && /const snkF32 = \(q\) => \[Math\.fround\(q\[0\]\), Math\.fround\(q\[1\]\), Math\.fround\(q\[2\]\)\];/.test(src))) w.push('snkPlaneCapGeom does not triangulate its float32 contour');
  const p0 = src.indexOf('function prepareSnkTransport('), p1 = src.indexOf('\n}\n', p0);
  const prep = p0 >= 0 ? src.slice(p0, p1) : '';
  if (!prep.includes("import('./snktransport.js')") || !prep.includes('.catch(')) w.push('prepareSnkTransport does not import the loader with a catch (a failed load must not refuse the build)');
  if (/\bthrow\b|Promise\.reject\(/.test(prep)) w.push('prepareSnkTransport can reject (a throw or a rejection in its chain)');
  if (!src.includes('SNK_TRANSPORT_ARTIFACT_MISSING') || !src.includes('SNK_TRANSPORT_ARTIFACT_STALE')) w.push('a named fallback line is missing');
  if (!src.includes('shipped: () => ({ ..._snkOcclShippedStats')) w.push('window.__snkOccl does not report the shipped census');
  return w;
};
// the loader decodes with the CN8 carrier only: no platform stream or crypto API (absent from the native shells' oldest OS)
const whyLoader = (src) => {
  const w = [];
  const code = src.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
  const api = code.match(/\b(DecompressionStream|CompressionStream|crypto\.subtle|SubtleCrypto)\b/g);
  if (api) w.push(`the loader calls a platform API: ${[...new Set(api)].join(' ')}`);
  if (!/import \* as carrier from '\.\/cn8transport-codec\.js';/.test(code) || !/carrier\.decode\(art\.row\)/.test(code)) w.push('the loader does not decode through the CN8 carrier');
  return w;
};
{
  const src = fs.readFileSync(new URL('../scene/table.js', import.meta.url), 'utf8');
  const w = why(src);
  report('static: table.js reads the shipped transport at every hit site; the sampler is engine-independent', w.length === 0, w.join('; '));
  const plants = [
    ['a sampler Math.sin', src.replace('const ca = cA * ch, sa = sA * ch;', 'const ca = Math.cos(cA) * ch, sa = Math.sin(sA) * ch;'), 'engine-dependent'],
    ['the sweep window back on acos', src.replace('const cosWin = SNK_SWEEP_COS_A * rWin + SNK_SWEEP_SIN_A * Math.sqrt(1 - rWin * rWin);', 'const cosWin = Math.cos(0.75 * Math.PI + 0.042 - Math.acos(rWin));'), 'Math.acos('],
    ['a hit site on the bake cache only', src.replace('      const hit = _snkOcclHit(key); if (hit) { // GH-1131: the bake cache, then the shipped transport\n        attach(hit);\n', '      if (key && _snkOcclBakeCache.has(key)) {\n        attach(_snkOcclBakeCache.get(key));\n'), 'skips the shipped map'],
    ['the cap back on float64', src.replace('if (!pts || pts.length < 3) return null; pts = pts.map(snkF32);', 'if (!pts || pts.length < 3) return null;'), 'float32 contour'],
    ['no snooker preparation', src.replace("return TABLE_SPECS[tableId]?.render?.style === 'snooker' ? prepareSnkTransport() : null;", 'return null;'), 'does not prepare the snooker transport'],
    ['a load that rejects', src.replace("      console.warn(`[snk-transport] SNK_TRANSPORT_ARTIFACT_MISSING: ${_snkOcclShippedStats.error}; the snooker transport traces at runtime`);\n", "      return Promise.reject(e);\n"), 'can reject'],
    ['the census seam dropped', src.replace('shipped: () => ({ ..._snkOcclShippedStats', 'shippedX: () => ({ ..._snkOcclShippedStats'), 'shipped census'],
  ];
  for (const [name, s, reason] of plants) { const pw = why(s); report(`static plant refused: ${name}`, s !== src && pw.some((r) => r.includes(reason)),
    s === src ? 'PLANT DID NOT APPLY' : pw.join('; ') || 'NOT REFUSED'); }
  // the two hit-site clauses each stand alone: four _snkOcclHit calls with a bake-cache read back, and three calls without one
  const both = [
    ['four hit calls but a .has(key) read back', src.replace('const _snkOcclHit = (key) => {', 'const _snkOcclHasProbe = (key) => _snkOcclBakeCache.has(key);\nconst _snkOcclHit = (key) => {'), 'skips the shipped map'],
    ['three hit calls and no .has(key) read', src.replace('const hit = _snkOcclHit(key); // GH-1131: the bake cache, then the shipped transport', 'const hit = _snkOcclBakeCache.get(key); // GH-1131'), '3 of 4 hit sites'],
  ];
  for (const [name, s, reason] of both) { const pw = why(s); report(`static plant refused: ${name}`, s !== src && pw.length === 1 && pw[0].includes(reason),
    s === src ? 'PLANT DID NOT APPLY' : pw.join('; ') || 'NOT REFUSED'); }
}
{
  const src = fs.readFileSync(new URL('../scene/snktransport.js', import.meta.url), 'utf8');
  const w = whyLoader(src);
  report('static: the loader decodes with the CN8 carrier and no platform stream / crypto API', w.length === 0, w.join('; '));
  const plants = [
    ['a crypto.subtle digest', src.replace('  try { floats = carrier.decode(art.row); }', '  await crypto.subtle.digest(\'SHA-256\', new Uint8Array(1));\n  try { floats = carrier.decode(art.row); }')],
    ['a DecompressionStream inflate', src.replace('  try { floats = carrier.decode(art.row); }', '  new DecompressionStream(\'gzip\');\n  try { floats = carrier.decode(art.row); }')],
    ['the carrier bypassed', src.replace('carrier.decode(art.row)', 'new Float32Array(0)')],
  ];
  for (const [name, s] of plants) { const pw = whyLoader(s); report(`static plant refused: ${name}`, s !== src && pw.length > 0, s === src ? 'PLANT DID NOT APPLY' : pw.join('; ') || 'NOT REFUSED'); }
}

// ---- 3. BEHAVIOUR (GH-1170): the bounded transport waits, on table.js's own text (the pinned prepareTableTransport,
// prepareSnkTransport, prepareEquipment and the GH-1170 block) in a vm with a fake clock and held imports
const vm = await import('node:vm');
const slice = (src, head, tail, from = 0) => {
  const a = src.indexOf(head, from);
  if (a < 0 || src.indexOf(head, a + 1) >= 0) throw new Error(`behaviour harness: the anchor ${JSON.stringify(head.slice(0, 48))} matched ${a < 0 ? 0 : 2}+ times`);
  const b = tail === null ? src.length : src.indexOf(tail, a);
  if (b < 0) throw new Error(`behaviour harness: no end after ${JSON.stringify(head.slice(0, 48))}`);
  return src.slice(a, tail === null ? b : b + tail.length);
};
const once = (text, from, to) => {
  if (text.split(from).length !== 2) throw new Error(`behaviour harness: ${JSON.stringify(from)} must occur once`);
  return text.replace(from, to);
};
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r)); };
const TABLE_SRC = fs.readFileSync(new URL('../scene/table.js', import.meta.url), 'utf8');
const boundOf = (name) => { const m = TABLE_SRC.match(new RegExp(`\\b${name} = (\\d+)\\b`)); if (!m) throw new Error(`behaviour harness: ${name} not found in table.js`); return Number(m[1]); };
const SNK_MS = boundOf('SNK_TRANSPORT_BOUND_MS'), CN8_MS = boundOf('CN8_TRANSPORT_BOUND_MS'), CN8_SHORT_MS = boundOf('CN8_TRANSPORT_BOUND_SHORT_MS');
// buildTable's own state around prepareEquipment: a built table, its group, the request counter, readiness, and the
// functions apply / refuse call (they record what the sink asked for)
const BUILDER = `let equipmentRequest = 0;
const built = { id: null }, group = { userData: {}, visible: true }, log = [];
let readiness = { status: 'READY', requested_table: null };
const previousActiveId = 'pool', SCRIPTED_PIN_TABLE_ID = 'pool', equipmentAlias = {}, _clothLegApply = null;
let _clothCondition = '';
function kernelTableKnown() { return null; }
function sanitizeClothConditionId(id) { return id ?? ''; }
function makeGeom(id) { return { id }; }
function styleMaterials() {} function populate() {} function _tableHalfApply() {} function scheduleRebake() {}
function rebuild(id) { built.id = id; _activeTableId = id; delete group.userData.cn8TransportRefusal; log.push('build ' + id); }
function setReadiness(status, next) { readiness = { status, requested_table: next }; }
function refuseBuild(error, next) { group.userData.cn8TransportRefusal = { code: error?.code }; _activeTableId = built.id ?? previousActiveId;
  setReadiness('REFUSED', next); log.push('refuse ' + next + ' ' + error?.code); return false; }
function cancelPreparation() { equipmentRequest++; if (readiness.status === 'PENDING') setReadiness(built.id ? 'READY' : 'REFUSED', built.id); }
`;
function boundHarness(src, { arms = [], bootId = 'snk' } = {}) {
  let text = slice(src, 'let _snkOcclShipped = null;', '\n}\n', 0);
  text = once(text, "import('./snktransport.js')", "__import('./snktransport.js')");
  const cn8 = once(slice(src, 'let cn8Transport = null;\nlet cn8TransportLoad = null;\nfunction prepareTableTransport(', '\n}\n'),
    "import('./cn8transport.js')", "__import('./cn8transport.js')");
  const equip = slice(src, '  function prepareEquipment(value, { boot = false, cause = null } = {}) {', '\n  }\n');
  const bound = slice(src, '// ---- GH-1170: every transport wait is bounded', null);
  const h = { now: 0, timers: [], warns: [], imports: { snk: 0, cn8: 0 }, gates: {} };
  const gate = (k) => { let res, rej; const p = new Promise((a, b) => { res = a; rej = b; }); h.gates[k] = { res, rej }; return p; };
  const ctx = vm.createContext({
    TABLE_SPECS: { snk: { render: { style: 'snooker' } }, cn8: { render: { style: 'cn8' } }, pool: { render: { style: 'pool' } } },
    CN8_TRANSPORT_SOLVER_VERSION: 'v', resolveBootTableId: () => bootId, buildTable: {}, obArmOn: (n) => arms.includes(n),
    _activeTableId: 'pool', console: { warn: (...a) => h.warns.push(a.join(' ')) }, performance: { now: () => h.now }, Promise, Error,
    setTimeout: (fn, ms) => { const t = { fn, at: h.now + ms, ms, unrefed: false, cleared: false, fired: false, unref() { this.unrefed = true; } }; h.timers.push(t); return t; },
    clearTimeout: (t) => { if (t && typeof t === 'object') t.cleared = true; },
    __import: (spec) => {
      if (spec === './snktransport.js') { h.imports.snk++; return gate('snk').then((map) => ({ load: () => map })); }
      if (spec === './cn8transport.js') { h.imports.cn8++; return gate('cn8'); }
      throw new Error('unexpected import ' + spec);
    },
  });
  vm.runInContext(`${text}\n${cn8}\n${bound}\n${BUILDER}${equip}
globalThis.__peek = () => ({ cn8TransportLoad, cn8Transport, shipped: _snkOcclShipped, late: _snkOcclLate, stats: { ..._snkOcclShippedStats },
  built: built.id, readiness: { ...readiness }, refusal: group.userData.cn8TransportRefusal ?? null, log: log.slice() });
globalThis.__eq = { prepareEquipment, cancelPreparation };`, ctx);
  // the export main.js awaits; prepareEquipment (the boot build, switches, re-preparations) calls the rebound module binding.
  // A refusal is observed through track().
  const handled = (r) => { if (r?.then) r.then(null, () => {}); return r; };
  h.prepare = (...a) => handled(ctx.buildTable.prepare(...a));
  h.equip = (id, opts) => handled(ctx.__eq.prepareEquipment({ table_id: id }, opts));
  h.cancel = () => ctx.__eq.cancelPreparation();
  h.peek = () => ctx.__peek();
  h.lines = (code) => h.warns.filter((w) => w.includes(code)).length;
  h.advance = async (ms) => {
    h.now += ms;
    for (const t of h.timers.filter((x) => !x.cleared && !x.fired && x.at <= h.now).sort((x, y) => x.at - y.at)) { t.fired = true; t.fn(); }
    await flush();
  };
  h.release = async (k, value) => { h.gates[k].res(value); await flush(); };
  h.fail = async (k, error) => { h.gates[k].rej(error); await flush(); };
  return h;
}
const track = (p) => { const s = { done: false, value: undefined, error: null }; p.then((v) => { s.done = true; s.value = v; }, (e) => { s.done = true; s.error = e; }); return s; };
const MAP = new Map([['k', new Float32Array(2)]]);
const MODULE = { apply() {}, validate() {} };
// a pool table is built (the boot), then a snooker switch timed out and built snooker on the runtime bake
const snkBuiltOnRuntime = async (h) => {
  h.equip('pool', { boot: true });
  const p = h.equip('snk');
  if (!p?.then) throw new Error('the snooker switch did not wait');
  await h.advance(SNK_MS);
  if (h.peek().built !== 'snk') throw new Error(`the timed-out snooker switch did not build (${JSON.stringify(h.peek())})`);
};
// each case returns null when it holds, else the reason; the plants below must each break the case they name
const cases = {
  'snooker switch: the build waits SNK_TRANSPORT_BOUND_MS at most, then goes ahead on the runtime bake (TIMEOUT named once)': async (src, o) => {
    const h = boundHarness(src, o), p = h.prepare('snk');
    if (!p?.then) return 'no wait at all';
    const s = track(p); await h.advance(SNK_MS - 1);
    if (s.done) return 'settled before the bound';
    await h.advance(1);
    const st = h.peek().stats;
    if (!s.done || s.error) return `not resolved at the bound (${s.error?.message ?? 'pending'})`;
    return st.timeouts === 1 && h.lines('SNK_TRANSPORT_ARTIFACT_TIMEOUT') === 1 ? null : `timeouts ${st.timeouts}, warns ${JSON.stringify(h.warns)}`;
  },
  'a late snooker map is held, never installed under the build that gave up (a commit\'s re-preparation included), and serves the next build': async (src, o) => {
    const h = boundHarness(src, o);
    await snkBuiltOnRuntime(h);
    await h.release('snk', MAP);
    const mid = h.peek();
    if (mid.shipped || mid.stats.loaded || !mid.stats.late) return `on arrival: installed ${!!mid.shipped}, loaded ${mid.stats.loaded}, late ${mid.stats.late}`;
    if (h.equip('snk') !== true || h.peek().shipped || !h.peek().stats.late) return 'the commit\'s re-preparation of the built table installed the late map';
    h.equip('pool');
    const next = h.equip('snk'), end = h.peek();
    if (next !== true) return 'the next snooker build waited for a map that had already landed';
    return end.shipped === MAP && end.stats.loaded && !end.stats.late && h.imports.snk === 1 && end.log.at(-1) === 'build snk' ? null : `next build: ${JSON.stringify(end)}`;
  },
  'a snooker map inside the bound installs at once; the timer is cleared': async (src, o) => {
    const h = boundHarness(src, o), s = track(h.prepare('snk'));
    await h.advance(1000); await h.release('snk', MAP);
    const st = h.peek().stats;
    if (!s.done || !st.loaded || h.peek().shipped !== MAP || st.timeouts) return `done ${s.done}, ${JSON.stringify(st)}`;
    return h.timers.every((t) => t.cleared || t.fired) ? null : 'a timer was left armed';
  },
  'every real snooker rebuild gets a fresh bound while the load is pending (back from pool; after a refused Chinese-8 switch)': async (src, o) => {
    for (const via of ['pool', 'refused cn8']) {
      const h = boundHarness(src, o);
      await snkBuiltOnRuntime(h);
      if (via === 'pool') h.equip('pool');
      else { h.equip('cn8'); await h.advance(CN8_MS); if (!h.peek().refusal) return 'the Chinese-8 switch was not refused'; }
      const p2 = h.equip('snk');
      if (!p2?.then) return `${via}: the rebuild did not wait (${p2})`;
      const s2 = track(p2); await h.advance(2000); await h.release('snk', MAP);
      const st = h.peek().stats;
      if (!(s2.done && st.loaded && !st.late && st.timeouts === 1 && h.peek().shipped === MAP)) return `${via}: rebuild ${s2.done}, ${JSON.stringify(st)}`;
    }
    return null;
  },
  'the boot is one build: when main.js\'s wait gives up, the boot build goes ahead at once; later builds wait again': async (src, o) => {
    const h = boundHarness(src, o);
    h.prepare(); await h.advance(SNK_MS);
    const armed = h.timers.length, build = h.equip('snk', { boot: true });
    if (build !== true) return 'the boot build waited a second bound';
    if (h.timers.length !== armed || h.peek().built !== 'snk') return 'the boot build armed a timer or built nothing';
    h.equip('pool');
    const later = h.equip('snk');
    return later?.then ? null : 'the boot\'s no-wait outlived a switch away and back';
  },
  'a commit\'s ob:settings re-preparation of the built table neither waits nor arms a timer (no re-dispatch loop)': async (src, o) => {
    const h = boundHarness(src, o);
    await snkBuiltOnRuntime(h);
    const armed = h.timers.length, again = [h.equip('snk'), h.equip('snk'), h.equip('snk')];
    return again.every((r) => r === true) && h.timers.length === armed && h.peek().stats.timeouts === 1 ? null
      : `re-preparations ${again.map((r) => (r?.then ? 'waited' : r)).join(', ')}, timers ${armed} -> ${h.timers.length}`;
  },
  'a return to the displayed snooker table while a Chinese-8 switch pends does not wait (F1)': async (src, o) => {
    const h = boundHarness(src, o);
    await snkBuiltOnRuntime(h);
    h.equip('cn8');
    if (h.peek().readiness.status !== 'PENDING') return 'the Chinese-8 switch did not pend';
    const armed = h.timers.length;
    h.cancel(); const back = h.equip('snk'); // settings' prepareCurrentEquipment: cancel the pending switch, prepare the current table
    const st = h.peek();
    return back === true && h.timers.length === armed && st.readiness.status === 'READY' && st.built === 'snk' ? null
      : `the return ${back?.then ? 'waited' : back}; timers ${armed} -> ${h.timers.length}; ${JSON.stringify(st.readiness)}`;
  },
  'a snooker wait that a later preparation overtook is stale: no count, no line, and the next build gets its own bound (F2)': async (src, o) => {
    const h = boundHarness(src, o);
    h.equip('pool', { boot: true }); h.equip('snk'); h.equip('pool'); await h.advance(SNK_MS);
    if (h.peek().stats.timeouts || h.lines('SNK_TRANSPORT_ARTIFACT_TIMEOUT')) return `the stale timer counted ${h.peek().stats.timeouts} / logged ${h.lines('SNK_TRANSPORT_ARTIFACT_TIMEOUT')}`;
    const next = h.equip('snk');
    return next?.then ? null : 'the overtaken timeout skipped the next build\'s wait';
  },
  'a snooker wait whose request was cancelled is stale: no count, no line (F2)': async (src, o) => {
    const h = boundHarness(src, o);
    h.equip('pool', { boot: true }); h.equip('snk'); h.cancel(); await h.advance(SNK_MS);
    return h.peek().stats.timeouts === 0 && h.lines('SNK_TRANSPORT_ARTIFACT_TIMEOUT') === 0 ? null : `counted ${h.peek().stats.timeouts}, logged ${h.lines('SNK_TRANSPORT_ARTIFACT_TIMEOUT')}`;
  },
  'a map that lands while only a stale snooker wait remains is held for the next real build (F2)': async (src, o) => {
    const h = boundHarness(src, o);
    h.equip('pool', { boot: true }); h.equip('snk'); h.equip('pool'); await h.advance(1000); await h.release('snk', MAP);
    const st = h.peek();
    return !st.shipped && !st.stats.loaded && st.stats.late ? null : `installed under a stale wait: ${JSON.stringify(st.stats)}`;
  },
  // #1170 P3: a preparation that passes no `current` (main.js's boot preparation shape) is stale only by the sequence
  'a sequence-only stale wait (no `current`, overtaken by a later preparation): no count, no line, no hand-off, it still ends at its bound, and a map landing under it is held (P3)': async (src, o) => {
    const why = []; // every clause is judged, so a plant shows which of them it breaks
    const h = boundHarness(src, o), p = h.prepare();
    if (!p?.then) return 'the boot preparation did not wait';
    const s = track(p); h.prepare('pool'); await h.advance(SNK_MS);
    if (!s.done || s.error) why.push(`the overtaken wait did not end at its bound (${s.error?.message ?? 'pending'})`); // main.js awaits it
    if (h.peek().stats.timeouts || h.lines('SNK_TRANSPORT_ARTIFACT_TIMEOUT')) why.push(`the overtaken timer counted ${h.peek().stats.timeouts} / logged ${h.lines('SNK_TRANSPORT_ARTIFACT_TIMEOUT')}`);
    if (!h.prepare('snk')?.then) why.push('the overtaken timer handed the next snooker build on (it did not wait)');
    const g = boundHarness(src, o);
    g.prepare(); g.prepare('pool'); await g.advance(1000); await g.release('snk', MAP);
    const st = g.peek();
    if (st.shipped || st.stats.loaded || !st.stats.late) why.push(`installed under the overtaken wait: ${JSON.stringify(st.stats)}`);
    // the same stale test gates the Chinese-8 TIMEOUT line: an overtaken Chinese-8 wait is still refused, silently
    const c = boundHarness(src, o), sc = track(c.prepare('cn8'));
    c.prepare('pool'); await c.advance(CN8_MS);
    if (sc.error?.code !== 'CN8_TRANSPORT_TIMEOUT' || c.lines('CN8_TRANSPORT_TIMEOUT')) why.push(`the overtaken Chinese-8 wait: ${sc.error?.code ?? 'not refused'}, TIMEOUT lines ${c.lines('CN8_TRANSPORT_TIMEOUT')}`);
    return why.length ? why.join('; ') : null;
  },
  'Chinese-8: refused with CN8_TRANSPORT_TIMEOUT at CN8_TRANSPORT_BOUND_MS, never latched; the landed import serves the next build': async (src, o) => {
    const h = boundHarness(src, o), p = h.prepare('cn8'), load = h.peek().cn8TransportLoad, s = track(p);
    await h.advance(CN8_MS - 1);
    if (s.done) return 'settled before the bound';
    await h.advance(1);
    if (s.error?.code !== 'CN8_TRANSPORT_TIMEOUT' || s.error?.message !== 'CN8_TRANSPORT_TIMEOUT') return `bound: ${s.error?.code ?? 'resolved'}`;
    if (h.lines('CN8_TRANSPORT_TIMEOUT') !== 1) return `${h.lines('CN8_TRANSPORT_TIMEOUT')} TIMEOUT lines`;
    if (h.peek().cn8TransportLoad !== load) return 'cn8TransportLoad was replaced (the raced promise or a latch)';
    await h.release('cn8', MODULE);
    const next = h.prepare('cn8');
    return next === null && h.peek().cn8Transport === MODULE && h.imports.cn8 === 1 ? null : `next build: ${next?.then ? 'waited / refused' : next}, imports ${h.imports.cn8}`;
  },
  'Chinese-8: a settled failure still latches (the same named refusal, no new import)': async (src, o) => {
    const h = boundHarness(src, o), s1 = track(h.prepare('cn8'));
    await h.fail('cn8', new Error('network'));
    const s2 = track(h.prepare('cn8')); await flush();
    return s1.error?.code === 'CN8_TRANSPORT_MODULE_IMPORT_FAILED' && s2.error?.code === s1.error.code && h.imports.cn8 === 1 ? null
      : `first ${s1.error?.code}, second ${s2.error?.code}, imports ${h.imports.cn8}`;
  },
  'snooker: a settled failure still latches (MISSING once; later builds go ahead at once, no new import)': async (src, o) => {
    const h = boundHarness(src, o), s1 = track(h.prepare('snk'));
    await h.fail('snk', Object.assign(new Error('gone'), { code: 'SNK_TRANSPORT_ARTIFACT_INVALID' }));
    const st = h.peek().stats, again = h.prepare('snk');
    return s1.done && !s1.error && st.error === 'SNK_TRANSPORT_ARTIFACT_INVALID' && h.lines('SNK_TRANSPORT_ARTIFACT_MISSING') === 1 && again === null && h.imports.snk === 1 ? null
      : `first ${s1.done}/${s1.error?.message}, error ${st.error}, MISSING lines ${h.lines('SNK_TRANSPORT_ARTIFACT_MISSING')}, again ${again?.then ? 'waited' : again}, imports ${h.imports.snk}`;
  },
  'Chinese-8: a failed load clears its timer (no TIMEOUT line or refusal once the bound passes)': async (src, o) => {
    const h = boundHarness(src, o), s = track(h.prepare('cn8'));
    await h.fail('cn8', new Error('network')); await h.advance(CN8_MS);
    return s.error?.code === 'CN8_TRANSPORT_MODULE_IMPORT_FAILED' && h.lines('CN8_TRANSPORT_TIMEOUT') === 0 && h.timers.every((t) => t.cleared) ? null
      : `${s.error?.code}; TIMEOUT lines ${h.lines('CN8_TRANSPORT_TIMEOUT')}; ${JSON.stringify(h.timers.map((t) => ({ ms: t.ms, cleared: t.cleared, fired: t.fired })))}`;
  },
  'Chinese-8 under ?obArm=cn8-transport-bound-short: the bound is CN8_TRANSPORT_BOUND_SHORT_MS': async (src, o) => {
    const h = boundHarness(src, { ...o, arms: [...(o.arms ?? []), 'cn8-transport-bound-short'] }), s = track(h.prepare('cn8'));
    await h.advance(CN8_SHORT_MS - 1); const early = s.done; await h.advance(1);
    return !early && s.error?.code === 'CN8_TRANSPORT_TIMEOUT' ? null : `early ${early}, ${s.error?.code ?? 'pending'}`;
  },
  'timer hygiene: every bound timer is unref\'d, and none outlives its settled load': async (src, o) => {
    const h = boundHarness(src, o);
    h.prepare('snk'); h.prepare('cn8'); await h.advance(10);
    await h.release('snk', MAP); await h.release('cn8', MODULE);
    if (h.timers.length !== 2) return `${h.timers.length} timers armed, expected 2`;
    return h.timers.every((t) => t.unrefed) && h.timers.every((t) => t.cleared) ? null : JSON.stringify(h.timers.map((t) => ({ ms: t.ms, unrefed: t.unrefed, cleared: t.cleared })));
  },
  'a table without a transport neither waits nor arms a timer': async (src, o) => {
    const h = boundHarness(src, o);
    return h.prepare('pool') === null && h.timers.length === 0 ? null : 'it waited';
  },
};
const runCases = async (src, o = {}) => {
  const out = {};
  for (const [name, fn] of Object.entries(cases)) { try { out[name] = await fn(src, o); } catch (e) { out[name] = `threw ${e?.message ?? e}`; } }
  return out;
};
{
  // the bounds themselves, and e2e-switchperf's S3 / C1 judge against the same ones (its own literals)
  const sp = fs.readFileSync(new URL('./e2e-switchperf.mjs', import.meta.url), 'utf8').match(/const SNK_BOUND_MS = (\d+), CN8_SHORT_BOUND_MS = (\d+);/);
  const pin = (s) => /const SNK_TRANSPORT_BOUND_MS = 8000, CN8_TRANSPORT_BOUND_MS = 240000;/.test(s) && /const CN8_TRANSPORT_BOUND_SHORT_MS = 6000;/.test(s);
  report('static: table.js bounds are 8 s (snooker), 240 s (Chinese-8), 6 s (the e2e arm), as sized for #1170', pin(TABLE_SRC));
  report('static plant refused: a Chinese-8 bound mis-edited to 24 s', !pin(TABLE_SRC.replace('CN8_TRANSPORT_BOUND_MS = 240000', 'CN8_TRANSPORT_BOUND_MS = 24000')));
  report('static: e2e-switchperf judges S3 / C1 against table.js\'s bounds', !!sp && Number(sp[1]) === SNK_MS && Number(sp[2]) === CN8_SHORT_MS,
    sp ? `suite ${sp[1]} / ${sp[2]} ms, table.js ${SNK_MS} / ${CN8_SHORT_MS} ms` : 'the suite\'s bound literals are absent');
  const src = TABLE_SRC;
  for (const [name, why] of Object.entries(await runCases(src))) report(`behaviour: ${name}`, why === null, why ?? '');
  const C = Object.keys(cases);
  const K = (head) => { const n = C.filter((c) => c.startsWith(head)); if (n.length !== 1) throw new Error(`case ${head}: ${n.length} matches`); return n[0]; };
  const BUILDS = "{ builds: boot || next !== built.id || !!group.userData.cn8TransportRefusal, current: () => request === equipmentRequest }";
  const plants = [
    ['the bound removed', src.replace("if (typeof setTimeout !== 'function' || obArmOn('transport-unbounded')) return pending;", 'return pending;'), {}, K('snooker switch')],
    ['?obArm=transport-unbounded', src, { arms: ['transport-unbounded'] }, K('Chinese-8: refused')],
    ['a late map installed on arrival (?obArm=snk-late-map-on-arrival)', src, { arms: ['snk-late-map-on-arrival'] }, K('a late snooker map')],
    ['a snooker timeout latched as a failure', src.replace('          _snkOcclShippedStats.timeouts++;\n', "          _snkOcclShippedStats.timeouts++; _snkOcclShippedStats.error = 'TIMEOUT';\n"), {}, K('every real snooker rebuild')],
    ['no boot hand-off (the boot build waits a second bound)', src.replace('return handedOn ? null : boundTableTransport(', 'return boundTableTransport('), {}, K('the boot is one build')],
    ['the wrapper ignores `builds`', src.replace('    if (!builds) return null; // nothing to build', '    // nothing to build'), {}, K('a return to the displayed snooker table')],
    ['prepareEquipment says every preparation builds', src.replace(BUILDS, '{ builds: true, current: () => request === equipmentRequest }'), {}, K('a commit')],
    ['prepareEquipment forgets a refused build must rebuild', src.replace(' || !!group.userData.cn8TransportRefusal, current:', ', current:'), {}, K('every real snooker rebuild')],
    ['a stale timer counts and logs (no stale test: neither the sequence nor `current`)', src.replace('const stale = () => seq !== _transportSeq || (!!current && !current());', 'const stale = () => false;'), {}, K('a snooker wait that a later preparation overtook')],
    // #1170 P3: the sequence, pinned by exact plants (each must break the sequence-only case and no other): the increment
    // removed (both sequence terms off at once), then each term alone, then a stale wait that never ends
    ['the sequence never advances (only the increment removed)', src.replace('const seq = ++_transportSeq, pending = unbounded(id);', 'const seq = _transportSeq, pending = unbounded(id);'), {}, K('a sequence-only stale wait'), true],
    ['the timers\' stale test without the sequence term', src.replace('const stale = () => seq !== _transportSeq || (!!current && !current());', 'const stale = () => !!current && !current();'), {}, K('a sequence-only stale wait'), true],
    ['the map\'s live test without the sequence term', src.replace('const _snkWaitIsLive = () => !!_snkLiveWait && _snkLiveWait.seq === _transportSeq && (!_snkLiveWait.current || _snkLiveWait.current());', 'const _snkWaitIsLive = () => !!_snkLiveWait && (!_snkLiveWait.current || _snkLiveWait.current());'), {}, K('a sequence-only stale wait'), true],
    ['a stale snooker wait never ends (resolve only when live)', src.replace('            + `${SNK_TRANSPORT_BOUND_MS} ms; this build traces at runtime`);\n        }\n        resolve();\n', '            + `${SNK_TRANSPORT_BOUND_MS} ms; this build traces at runtime`);\n          resolve();\n        }\n'), {}, K('a sequence-only stale wait'), true],
    ['a cancelled request is not stale (no `current`)', src.replace('const stale = () => seq !== _transportSeq || (!!current && !current());', 'const stale = () => seq !== _transportSeq;'), {}, K('a snooker wait whose request was cancelled')],
    ['a map installed under a stale wait', src.replace("const _snkWaitIsLive = () => !!_snkLiveWait && _snkLiveWait.seq === _transportSeq && (!_snkLiveWait.current || _snkLiveWait.current());", 'const _snkWaitIsLive = () => !!_snkLiveWait;'), {}, K('a map that lands while only a stale')],
    ['the Chinese-8 timeout latched (?obArm=cn8-timeout-latch)', src, { arms: ['cn8-timeout-latch'] }, K('Chinese-8: refused')],
    ['the raced promise stored in cn8TransportLoad', src.replace("      if (obArmOn('cn8-timeout-latch')) _cn8TimeoutLatch = error;\n", "      if (obArmOn('cn8-timeout-latch')) _cn8TimeoutLatch = error;\n      cn8TransportLoad = Promise.reject(error); cn8TransportLoad.catch(() => {});\n"), {}, K('Chinese-8: refused')],
    ['a Chinese-8 settled failure stops latching', src.replace('(error) => { clearTimeout(timer); reject(error); });', '(error) => { clearTimeout(timer); resolve(null); });'), {}, K('Chinese-8: a settled failure')],
    ['a snooker settled failure stops latching', src.replace('if (_snkOcclShipped || _snkOcclShippedStats.error) return null;', 'if (_snkOcclShipped) return null;'), {}, K('snooker: a settled failure')],
    ['a failed Chinese-8 load leaves its timer armed', src.replace('(error) => { clearTimeout(timer); reject(error); });', '(error) => { reject(error); });'), {}, K('Chinese-8: a failed load clears')],
    ['a snooker timer left armed after its load landed', src.replace('pending.then(() => { if (leave()) { clearTimeout(timer); resolve(); } });', 'pending.then(() => { if (leave()) resolve(); });'), {}, K('a snooker map inside')],
    ['a timer that keeps node alive', src.split('      timer?.unref?.();\n').join('').split('    timer?.unref?.();\n').join(''), {}, K('timer hygiene')],
  ];
  for (const [name, s, o, expect, exact = false] of plants) {
    if (s === src && !o.arms) { report(`behaviour plant refused: ${name}`, false, 'PLANT DID NOT APPLY'); continue; }
    const out = await runCases(s, o), red = Object.entries(out).filter(([, w]) => w !== null).map(([n]) => n);
    // an exact plant must break its case and no other; a plant that breaks every case broke the harness, not a case
    const all = red.length === C.length, ok = red.includes(expect) && !all && (!exact || red.length === 1);
    const tag = exact ? ` (exact: ${red.length === 1 ? 'only its case' : `${red.length} cases red, want 1`})` : all ? ' (every case red: the harness broke)' : '';
    report(`behaviour plant refused: ${name}`, ok, red.length ? `red: ${red.map((n) => C.indexOf(n)).join(', ')}${tag} (${out[expect] ?? 'expected case held'})` : 'NOT REFUSED');
  }
}

console.log(`SNK-TRANSPORT SELFTEST ${bad ? 'FAIL' : 'PASS'} (${total - bad}/${total})`);
process.exit(bad ? 1 : 0);
