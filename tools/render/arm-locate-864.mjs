#!/usr/bin/env node

// Copyright (c) Meta Platforms, Inc. and affiliates.

// arm-locate-864.mjs — the GH-864 LOCATE node unit fixture (the addendum LOCATE item; rulings 4 and 7; OQ1, OQ2, OQ10). The DVR live
// schedule ends each segment at E_i = pb.segEndSec(i, tails[i]) (class (a)); locate's play/post gate and its lead test compare T in the
// schedule's own sums (cum[i] + E_i, + beatSec; cum[i+1] - leads[i+1]), never a subtraction `local >= E_i`, so setPlaying's phase
// boundary bnd = cum[i] + E_i resolves to the next segment's lead. There is no node-callable schedule leaf (ruling 7): the arm reads
// web/app/playback.js as TEXT, extracts with the vendored acorn (a) the locate function, (b) the pb.segEndSec / pb.segExtSec methods,
// (c) refreshSchedule's cum loop and (d) setPlaying's tick loop, and evaluates them in node:vm (one context per text and session) over
// two restated page sessions (witness, control: speed 0.5, beats null) and one explicitly synthetic beats-on session (S-k0). No module
// under web/ is imported.
//   Judged (13 cells per text): per page row (W-k0, C-k1 targets; W-k1, C-k0 companions) locate(bnd), the lead-rate tick from bnd and
//   the split tick into bnd; the S-k0 cell locate(liveChorStart(1)), the one cell the lead test's second disjunct decides (OQ10).
//   Printed, not judged: the OQ1 lead-start rows and the OQ2 beat-local row (no clamp).
//   Plants (in memory on the text, never a file write): P-LOC (the gate as a subtraction), P-LOC-POST (the lead test as a subtraction),
//   P-LOC-S (the second disjunct deleted) — each must turn exactly its own cells RED.
//   A precondition mismatch or a missing extract / plant anchor is INVALID (exit 1), never RED.
//   node tools/render/arm-locate-864.mjs [--root <repo root>]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { parseArgv: __parseArgv } = await import('./lib/argv.mjs');
const __P = __parseArgv({ tag: 'locate-arm', value: ['--root'], bool: [] });
// everything after the argv parse runs under ONE module-level try/catch (the parse-first fence refuses a parseArgv under a TryStatement);
// an internal exception prints `[locate-arm] INTERNAL — <class>: <message> at <file>:<line>; NOT ARMED` and exits 1
try {
const acorn = await import('./lib/vendor/acorn/acorn.mjs');
const vm = await import('node:vm');
const TAG = '[locate-arm]';
const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__P.value('--root') ?? path.join(here, '..', '..'));
const FILE = 'web/app/playback.js';
const HEAD = fs.readFileSync(path.join(ROOT, FILE), 'utf8');
const invalid = (msg) => { console.log(`${TAG} ${msg} — INVALID`); process.exit(1); };

// ---- extraction (acorn over the text) ----
const FN_TYPES = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
function walk(node, fn, ancestors = []) {
  if (!node || typeof node.type !== 'string') return;
  fn(node, ancestors);
  const anc = ancestors.concat(node);
  for (const k of Object.keys(node)) {
    if (k === 'loc' || k === 'type' || k === 'start' || k === 'end') continue;
    const v = node[k];
    if (Array.isArray(v)) { for (const c of v) if (c && typeof c.type === 'string') walk(c, fn, anc); } else if (v && typeof v.type === 'string') walk(v, fn, anc);
  }
}
/** The NAMED functions enclosing a node, innermost first. */
function fnChain(ancestors) {
  const out = [];
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const a = ancestors[i];
    if (!FN_TYPES.has(a.type)) continue;
    if (a.type === 'FunctionDeclaration' && a.id) { out.push(a.id.name); continue; }
    const p = ancestors[i - 1];
    if (p && p.type === 'VariableDeclarator' && p.id?.name) out.push(p.id.name);
    else if (p && p.type === 'Property' && p.key) out.push(p.key.name ?? String(p.key.value));
    else if (p && p.type === 'MethodDefinition' && p.key) out.push(p.key.name);
  }
  return out;
}
// setPlaying's phase boundary, the bnd Form A (cum + E_i); the harness bnd(k) is this text with at.i read as k
const BND_FORM_A = 'pb.cum[at.i] + pb.segEndSec(at.i, pb.tails?.[at.i] ?? 0)';
function extract(src) {
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module' });
  const text = (n) => src.slice(n.start, n.end);
  const hits = { locate: [], segEndSec: [], segExtSec: [], 'refreshSchedule cum loop': [], 'setPlaying tick loop': [] };
  walk(ast, (n, anc) => {
    if (n.type === 'FunctionDeclaration' && n.id?.name === 'locate') hits.locate.push(n);
    if (n.type === 'Property' && n.method && (n.key?.name === 'segEndSec' || n.key?.name === 'segExtSec')) hits[n.key.name].push(n);
    if (n.type === 'ForStatement') {
      const ch = fnChain(anc);
      if (ch.includes('refreshSchedule') && text(n).includes('cum.push(total)')) hits['refreshSchedule cum loop'].push(n);
      if (ch.includes('setPlaying') && text(n).includes('const at = locate(next)')) hits['setPlaying tick loop'].push(n);
    }
  });
  for (const [name, list] of Object.entries(hits)) if (list.length !== 1) invalid(`EXTRACT ANCHOR MISSING ${name} (count ${list.length})`);
  const ex = Object.fromEntries(Object.entries(hits).map(([name, list]) => [name, text(list[0])]));
  if (!ex['setPlaying tick loop'].includes(BND_FORM_A)) invalid('EXTRACT ANCHOR MISSING setPlaying bnd Form A');
  return ex;
}

// ---- the restated sessions ----
// page values (the witness and control sessions of the GH-864 readings), beats null, speed restated to 0.5 (the page ran at speed 1)
const WITNESS = { durs: [2.5766689854668794, 2.749541361494376, 1.8104935650783585], completions: [3.368295598567012, 3.963942325313526, 1.8104935650783585], tails: [0.6000000000000001, 0.6000000000000001, 0.6000000000000001], leads: [2.05, 1.9666666666666666, 2.05], beats: [null, null, null], speed: 0.5 };
const CONTROL = { durs: [1.8104935650783585, 1.8104935650783585, 1.8104935650783585], completions: [1.8104935650783585, 1.8104935650783585, 1.8104935650783585], tails: [0.6000000000000001, 0.6000000000000001, 0.6000000000000001], leads: [2.0833333333333335, 2.066666666666667, 2.05], beats: [null, null, null], speed: 0.5 };
// SYNTHETIC (not a page value): the witness durs / completions / leads, no tail on segment 0 and a 40/60 s walk beat on it
const SYNTH = { durs: WITNESS.durs, completions: WITNESS.completions, tails: [0, 0.6000000000000001, 0.6000000000000001], leads: WITNESS.leads, beats: [{ beatSec: 0.6666666666666666 }, null, null], speed: 0.5 };
const PRE = {
  witness: { cum: [2.05, 7.384962265233678, 13.398904590547204], total: 15.809398155625562, ext: [0.7916266131001328, 1.2144009638191502, 0.6000000000000001] },
  control: { cum: [2.0833333333333335, 6.5604935650783585, 11.020987130156715], total: 13.431480695235074, ext: [0.6000000000000001, 0.6000000000000001, 0.6000000000000001] },
  'S-k0 (synthetic, beats on)': { cum: [2.05, 8.051628931900344, 14.065571257213872], total: 16.47606482229223, ext: [0.7916266131001328, 1.2144009638191502, 0.6000000000000001] },
};
function session(ex, data) {
  const pb = JSON.parse(JSON.stringify(data));
  const ctx = vm.createContext({ pb });
  vm.runInContext(`Object.assign(pb, ({ ${ex.segExtSec}, ${ex.segEndSec} }));`, ctx);
  vm.runInContext(`const cum = []; let total = 0; ${ex['refreshSchedule cum loop']}; pb.cum = cum; pb.total = total;`, ctx);
  vm.runInContext(`${ex.locate}\nfunction tick(T0, dt) { let next = T0, rem = dt; ${ex['setPlaying tick loop']}; return next; }\nfunction bnd(k) { return ${BND_FORM_A.split('at.i').join('k')}; }`, ctx);
  return { pb, ctx, locate: vm.runInContext('locate', ctx), tick: vm.runInContext('tick', ctx), bnd: vm.runInContext('bnd', ctx), ext: (i) => pb.segExtSec(i) };
}
const same = (a, b) => a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
const list = (a) => `[${Array.from(a).join(', ')}]`;
function precondition(name, s, print) {
  const want = PRE[name]; const cum = Array.from(s.pb.cum); const ext = s.pb.durs.map((_, i) => s.ext(i));
  if (!same(cum, want.cum) || !Object.is(s.pb.total, want.total)) invalid(`PRECONDITION ${name}: cum ${list(cum)} total ${s.pb.total} (want ${list(want.cum)} total ${want.total}, bit for bit)`);
  if (!same(ext, want.ext)) invalid(`PRECONDITION ${name}: segExtSec ${list(ext)} (want ${list(want.ext)})`);
  if (print) console.log(`${TAG} precondition ${name}: cum ${list(cum)} total ${s.pb.total}; segExtSec ${list(ext)} — equal, bit for bit`);
}
const shape = (r) => `(${r.i}, ${r.lead ? 'lead' : r.beat ? 'beat' : 'play'}, ${r.local})`;

// ---- the judged rows ----
const DT = 1 / 60;
const ROWS = [
  { id: 'W-k0', ses: 'witness', k: 0, role: 'target' },
  { id: 'C-k1', ses: 'control', k: 1, role: 'target' },
  { id: 'W-k1', ses: 'witness', k: 1, role: 'companion' },
  { id: 'C-k0', ses: 'control', k: 0, role: 'companion' },
];
/** Runs the 13 cells over one text; `red` names the cells that must print RED (none on the head text). */
function runText(src, label, red, head) {
  const ex = extract(src);
  const S = { witness: session(ex, WITNESS), control: session(ex, CONTROL), synth: session(ex, SYNTH) };
  precondition('witness', S.witness, head); precondition('control', S.control, head); precondition('S-k0 (synthetic, beats on)', S.synth, head);
  const sS = S.synth.ctx; const Sv = vm.runInContext('pb.cum[1] - pb.leads[1]', sS); const Xv = vm.runInContext('pb.cum[0] + pb.segEndSec(0, pb.tails?.[0] ?? 0) + (pb.beats?.[0]?.beatSec ?? 0)', sS);
  if (!(Sv < Xv)) invalid(`PRECONDITION S-k0 (synthetic, beats on): liveChorStart(1) ${Sv} is not below the first-disjunct threshold ${Xv} — the first disjunct would decide the cell`);
  if (head) console.log(`${TAG} precondition S-k0 (synthetic, beats on): liveChorStart(1) = cum[1] - leads[1] = ${Sv} < the first-disjunct threshold cum[0] + E_0 + beatSec = ${Xv} (S - X ${Sv - Xv}) — only the second disjunct can decide the cell`);
  if (!head) console.log(`${TAG} ${label}preconditions hold (witness, control, S-k0 (synthetic, beats on): cum / total / segExtSec bit for bit; S < X)`);
  const cells = [];
  const judge = (id, desc, green) => { const mustRed = red.has(id); const state = green ? 'green' : 'RED'; const ok = mustRed ? !green : green; cells.push({ id, ok }); console.log(`${TAG} ${label}${desc} — ${state} ${ok ? '(as required)' : `— NOT as required (want ${mustRed ? 'RED' : 'green'})`}`); };
  for (const row of ROWS) {
    const s = S[row.ses]; const k = row.k; const b = s.bnd(k); const lead1 = s.pb.leads[k + 1];
    if (head) console.log(`${TAG} row ${row.id} (${row.ses} k=${k}, ${row.role}): bnd = cum[${k}] + E_${k} = ${b}; cum[${k + 1}] - leads[${k + 1}] = ${s.pb.cum[k + 1] - lead1}`);
    const r = s.locate(b);
    judge(`${row.id}/locate`, `${row.id} locate(bnd) = ${shape(r)}`, r.i === k + 1 && r.lead === true && r.beat === false && Math.abs(r.local + lead1) <= 1e-12);
    const t = s.tick(b, DT);
    judge(`${row.id}/tick`, `${row.id} lead-rate tick(bnd, 1/60) = ${t}, d ${t - b}`, Math.abs(t - b - DT) <= 1e-12);
    const T0 = b - s.pb.speed * DT / 2; const t2 = s.tick(T0, DT);
    judge(`${row.id}/split`, `${row.id} split tick(bnd - speed*dt/2, 1/60) = ${t2} (bnd + dt/2 = ${b + DT / 2})`, Math.abs(t2 - (b + DT / 2)) <= 1e-12);
  }
  { const r = S.synth.locate(Sv); const lead1 = S.synth.pb.leads[1];
    judge('S-k0/locate', `S-k0 (synthetic, beats on) locate(liveChorStart(1)) = ${shape(r)}`, r.i === 1 && r.lead === true && r.beat === false && Math.abs(r.local + lead1) <= 1e-12); }
  if (head) {
    const b0 = S.synth.bnd(0);
    console.log(`${TAG} disclosure S-k0 (synthetic, beats on) locate(bnd(0)) = ${shape(S.synth.locate(b0))} — the beat local at the beat segment's bnd, not clamped (OQ2), not judged`);
    for (const row of ROWS) {
      const s = S[row.ses]; const k = row.k; const st = s.pb.cum[k + 1] - s.pb.leads[k + 1];
      console.log(`${TAG} disclosure ${row.id} locate(liveChorStart(${k + 1})) = locate(cum[${k + 1}] - leads[${k + 1}] = ${st}) = ${shape(s.locate(st))} — the lead-start instant (OQ1 (a)), not judged`);
    }
  }
  return cells;
}

// ---- run: the head text, then the plants (in-memory mutations of the text) ----
const TARGETS = ['W-k0/locate', 'W-k0/tick', 'W-k0/split', 'C-k1/locate', 'C-k1/tick', 'C-k1/split'];
const PLANTS = [
  { name: 'P-LOC', what: 'the play/post gate as the subtraction local >= E', old: 'if (T >= pb.cum[i] + E) {', new: 'if (local >= E) {', red: new Set(TARGETS) },
  { name: 'P-LOC-POST', what: 'the lead test as the subtraction local >= post', old: '(T >= pb.cum[i] + E + (pb.beats?.[i]?.beatSec ?? 0)\n          || T >= pb.cum[i + 1] - pb.leads[i + 1])', new: 'local >= post', red: new Set([...TARGETS, 'S-k0/locate']) },
  { name: 'P-LOC-S', what: 'the lead test\'s second disjunct deleted', old: '(pb.beats?.[i]?.beatSec ?? 0)\n          || T >= pb.cum[i + 1] - pb.leads[i + 1])) {', new: '(pb.beats?.[i]?.beatSec ?? 0))) {', red: new Set(['S-k0/locate']) },
];
const all = runText(HEAD, '', new Set(), true);
for (const p of PLANTS) {
  const n = HEAD.split(p.old).length - 1;
  if (n !== 1) invalid(`PLANT ANCHOR MISSING (refactor?) — anchor count ${n} in ${FILE} (want 1)`);
  console.log(`${TAG} plant ${p.name} (${p.what}): must turn RED exactly ${[...p.red].join(', ')}`);
  all.push(...runText(HEAD.replace(p.old, p.new), `plant ${p.name}: `, p.red, false));
}
const WANT = 52; const okN = all.filter((c) => c.ok).length; const armed = all.length === WANT && okN === WANT;
console.log(`${TAG} cells ${all.length} (${okN} as required); ${armed ? 'ARMED' : `NOT ARMED — want ${WANT} cells, all as required`}`);
process.exit(armed ? 0 : 1);
} catch (e) {
  const TAG_I = '[locate-arm]';
  const frame = String(e && e.stack || '').split('\n').map((l) => l.trim()).find((l) => /^at .*:\d+:\d+\)?$/.test(l)) ?? '';
  const m = /\(?((?:file:\/\/)?[^()\s]+):(\d+):\d+\)?$/.exec(frame); const where = m ? `${m[1].replace(/^file:\/\//, '')}:${m[2]}` : '(no frame)';
  const cls = e && e.constructor && e.constructor.name ? e.constructor.name : 'Error'; const msg = e && e.message !== undefined ? e.message : String(e);
  console.log(`${TAG_I} INTERNAL — ${cls}: ${msg} at ${where}; NOT ARMED`);
  process.exit(1);
}
