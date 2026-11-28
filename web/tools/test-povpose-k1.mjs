// Copyright (c) Meta Platforms, Inc. and affiliates.

// GH-911 K1: the AST reader's certification (plan K1, plan:569-589; R12).
// C5's readers (web/tools/test-povpose.mjs: readF6, readF6b, readCase1Slices +
// buildPovAnchors, readF2F3, readPovFov) and C4's range slicer
// (web/tools/mk-povpose-corpus.mjs: slicePovDecls) run over the card's plant
// corpus (plan section 6, PL-9..PL-14), the F2/F3 rows, the r6 rows and F6's
// .catch plant (OQ-61 (a)). Each row prints the AST verdict beside the text
// reader's verdict from the card's cited output, with both cites.
// "card" is the GH-911 design card DESIGN-911, "plan" its build plan
// PLAN-911-IMPL; the row table is SPEC-K1 section 2.
//
//   node web/tools/test-povpose-k1.mjs                 # --set full, every row
//   node web/tools/test-povpose-k1.mjs --set reduced   # the ruled CI subset
//   node web/tools/test-povpose-k1.mjs --card-dir <scratch>   # lane only
//
// Inputs: 67855b4f's web/app/playback.js (MAIN67), read from git history with
// `git cat-file blob` in the repository that holds this file (K1-OP-1 ruling
// step (1): no tracked copy; the CI job checks out with fetch-depth 0). A
// missing object or a sha256 other than the pin is INVALID, never a rebuild or
// a fallback. Every plant is its base (MAIN67, the latch model LATCH rebuilt
// from MAIN67, the tree's playback.js, povpose.js or coords.js) plus the edit
// list recorded in web/tools/fixtures/povpose-k1-plants.json; each
// replaceExact anchor must occur exactly once on its base and on the text as
// edited so far, else the row is INVALID (the PL-17 rule). A plant whose
// recorded sha256 (the generator's own bytes) differs from the rebuilt text
// is INVALID (OQ-12 (e)). Nothing is written; planted leaves load from a
// data: URL.
//
// Case 1 rows compare against main_rev's povAnchors computed under the
// running engine (test-povpose.mjs mainReference over the byte-pinned
// web/tools/fixtures/povpose-main-911.json), never the corpus's stored
// "main": presentation math may differ by 1 ulp across CPU architectures.
// This harness has history, so it also checks each pinned declaration text
// against main_rev's playback.js from `git cat-file blob` (a mismatch, or a
// planted byte the check fails to refuse, is INVALID).
//
// The exit status is one verdict, set once at the end: 0 GREEN, 1 FAIL,
// 2 INVALID (INVALID outranks FAIL).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as acorn from '../../tools/render/lib/vendor/acorn/acorn.mjs';
import * as leaf from '../app/povpose.js';
import { readCase1Slices, buildPovAnchors, mainReference, readPovFov, readF6, readF6b, readAppFiles, readF2F3 } from './test-povpose.mjs';
import { slicePovDecls } from './mk-povpose-corpus.mjs';

const T0 = performance.now();
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const APP = path.join(ROOT, 'web', 'app');
const PATHS = {
  acorn: path.join(ROOT, 'tools', 'render', 'lib', 'vendor', 'acorn', 'acorn.mjs'),
  playback: path.join(APP, 'playback.js'),
  leaf: path.join(APP, 'povpose.js'),
  coords: path.join(APP, 'coords.js'),
  fixture: path.join(HERE, 'fixtures', 'povpose-corpus-911.json'),
  mainref: path.join(HERE, 'fixtures', 'povpose-main-911.json'),
  plants: path.join(HERE, 'fixtures', 'povpose-k1-plants.json'),
};
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const count = (t, s) => (s ? t.split(s).length - 1 : -1);
const P = (s) => console.log(`[k1] ${s}`);
const N_REC = 91;
// The reduced set (K1 PLACEMENT RULING; SPEC-K1 1.2), fixed by row id: every
// row but the five r6 rows of SPEC-K1 2.3. The plants json's `reduced` flags
// must agree with this list, else the run is INVALID.
const NOT_REDUCED = ['R6-known', 'K1-dup', 'K1-none', 'K1-text', 'R6-fovtext'];

// ---------------------------------------------------------------- arguments

const argv = process.argv.slice(2);
let SET = 'full', CARD = null;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--set' && ['full', 'reduced'].includes(argv[i + 1])) SET = argv[++i];
  else if (argv[i] === '--card-dir' && argv[i + 1]) CARD = argv[++i];
  else { console.error(`test-povpose-k1: unknown argument ${JSON.stringify(argv[i])}; use --set full|reduced, --card-dir <path>`); process.exit(2); }
}

// ---------------------------------------------------------------- plant building

class Invalid extends Error {}

/** Applies a recorded edit list (the rule of the lane builder that recorded it; not tracked). */
function applyEdits(base, edits) {
  let cur = base;
  for (const e of edits) {
    if (e.op === 'replaceExact') {
      const nb = count(base, e.anchor), nc = count(cur, e.anchor);
      if (nb !== 1 || nc !== 1) throw new Invalid(`anchor count=${nb === 1 ? nc : nb} ${JSON.stringify(e.anchor.slice(0, 60))}`);
      cur = cur.replace(e.anchor, () => e.text);
    } else if (e.op === 'insertAfterLine') {
      const ls = cur.split('\n'), nb = base.split('\n').filter((l) => l === e.anchor).length, nc = ls.filter((l) => l === e.anchor).length;
      if (nb !== 1 || nc !== 1) throw new Invalid(`anchor count=${nb === 1 ? nc : nb} ${JSON.stringify(e.anchor.slice(0, 60))}`);
      const k = ls.indexOf(e.anchor);
      cur = [...ls.slice(0, k + 1), ...e.text.split('\n'), ...ls.slice(k + 1)].join('\n');
    } else if (e.op === 'appendTop') {
      cur = e.text + cur;
    } else if (e.op === 'appendEnd') {
      const n = count(cur, e.anchor);
      if (n !== 1 || !cur.endsWith(e.anchor)) throw new Invalid(`end anchor count=${n}`);
      cur += e.text;
    } else throw new Invalid(`unknown edit op ${e.op}`);
  }
  return cur;
}

/** MAIN67 from history (K1-OP-1 (1)); null + reason when absent or off-pin. */
function readMain67(pin) {
  try {
    const b = execFileSync('git', ['cat-file', 'blob', `${pin.rev}:${pin.path}`], { cwd: ROOT, maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'pipe'] });
    const h = sha(b);
    if (h !== pin.sha256) return { text: null, why: `sha256 ${h} != pin ${pin.sha256}` };
    return { text: b.toString('utf8'), why: null };
  } catch (e) {
    return { text: null, why: `git cat-file blob ${pin.rev.slice(0, 8)}:${pin.path} failed: ${String(e.stderr ?? e.message).trim().split('\n')[0]}` };
  }
}

// ---------------------------------------------------------------- readers per row

// x6's text .catch rule (scratch/rw911/x6-race-latch.mjs:163-172, copied
// verbatim), printed beside OQ61-H2 as an information column (K1-OP-4).
const SPEC = String.raw`['"\x60][^'"\x60\n]*povpose\.js[^'"\x60\n]*['"\x60]`;
const WS = String.raw`(?:\s|\/\*[\s\S]*?\*\/|\/\/[^\n]*\n)*`; // whitespace or comments
const STATIC_RE = new RegExp(String.raw`(?<![\w$.])(?:import|export)` + WS + String.raw`(?:[^;()'"\x60]*?\bfrom` + WS + ')?' + SPEC, 'g');
function f6x(pbFile) {
  const staticForms = (pbFile.match(STATIC_RE) ?? []).length;
  const dynSites = pbFile.split("import('./povpose.js')").length - 1;
  let catches = false;
  if (dynSites === 1) { const i = pbFile.indexOf("import('./povpose.js')"); const c = pbFile.indexOf('.catch(', i); const stmt = pbFile.slice(i, pbFile.indexOf(';', c >= 0 ? c : i)); catches = /\.catch\(/.test(stmt) && !/\n\s*\n/.test(stmt); }
  return { staticForms, dynSites, catches, ok: staticForms === 0 && dynSites === 1 && catches };
}

const FIELDS = ['d', 'addrCam', 'addrLook', 'standCam', 'standLook'];
// test-povpose.mjs's pvaEq and check1 (C5, :499-512), restated: they are not exported.
const pvaEq = (h, m) => !!h && !!m && JSON.stringify(Object.keys(h)) === JSON.stringify(Object.keys(m)) && Object.is(h.ti, m.ti)
  && FIELDS.every((f) => Array.isArray(h[f]) && h[f].length === m[f].length && m[f].every((v, c) => Object.is(h[f][c], v)));
function check1(slices, pbStub, recs, main) {
  const { povAnchors } = buildPovAnchors(slices, pbStub);
  let eq = 0, nonNull = 0, first = null;
  recs.forEach((rec, j) => {
    const h = povAnchors(rec);
    if (h !== null) nonNull++;
    if (pvaEq(h, main[j])) eq++;
    else if (first === null) first = !h || !main[j] ? (h ? 'main-null' : 'null')
      : JSON.stringify(FIELDS.flatMap((f) => (main[j][f] ?? []).map((v, c) => (Object.is(h[f]?.[c], v) ? null : `${f}[${c}]`)).filter(Boolean)));
  });
  return { eq, nonNull, first: first ?? 'none' };
}
const staleLiftH = () => 0.36; // a stale leaf: liftH present, povPose absent (C5 test-povpose.mjs:574)

function evalF6(text, row) {
  const r = readF6(text);
  const sites = r.sites.map((s) => `${s.line}:${s.chained ? 'yes' : 'no'}`).join(',') || '-';
  const got = { verdict: r.ok ? 'GREEN' : 'RED', static: r.static, dyn: r.dyn, chained: r.chained, sites };
  let detail = `static ${r.static} dyn ${r.dyn} chained ${r.chained} sites ${sites}${r.error ? ` parse-error ${JSON.stringify(r.error)}` : ''}`;
  if (row.tags.includes('text-rule=x6f6x')) detail += ` text-rule(x6 f6x)=${f6x(text).ok ? 'GREEN' : 'RED'} (information, not scored)`;
  return { got, detail };
}

function evalF6b(files) {
  const r = readF6b(files);
  const st = r.bad.reduce((a, b) => a + (b.static ?? 0), 0);
  return { got: { verdict: r.ok ? 'GREEN' : 'RED', bad: r.bad.length, static: st, files: r.files },
    detail: `files ${r.files} bad ${r.bad.length}${r.bad.length ? ` ${JSON.stringify(r.bad)}` : ''}` };
}

function evalCase1(text, pvLeaf, fx, ref) {
  let slices;
  try { slices = readCase1Slices(text); } catch (e) { return { got: { verdict: 'RED', extract: 'fail' }, detail: `EXTRACT-FAIL ${JSON.stringify(e.message)}` }; }
  const a = check1(slices, { povLeaf: pvLeaf }, fx.records, ref);
  const nl = check1(slices, { povLeaf: null }, fx.records, ref);
  const st = check1(slices, { povLeaf: { liftH: staleLiftH } }, fx.records, ref);
  const green = a.eq === N_REC && nl.nonNull === 0 && st.nonNull === 0;
  return { got: { verdict: green ? 'GREEN' : 'RED', present: a.eq, null: nl.nonNull, stale: st.nonNull, first: a.first },
    detail: `present ${a.eq}/${N_REC} null ${nl.nonNull} stale ${st.nonNull} first-mismatch ${a.first}` };
}

function evalF2F3(text) {
  const r = readF2F3(text);
  const red = [r.F2 ? null : 'F2', r.F3 ? null : 'F3'].filter(Boolean).join(',');
  return { got: { verdict: red ? 'RED' : 'GREEN', red }, detail: `F2 ${r.F2 ? 'ok' : 'RED'} F3 ${r.F3 ? 'ok' : 'RED'} nums ${r.nums.length}${r.error ? ` error ${JSON.stringify(r.error)}` : ''}` };
}

const tryOut = (fn) => { try { return { v: fn(), err: null }; } catch (e) { return { v: null, err: e.message }; } };
function evalR6(text, row) {
  const s = row.reader === 'readPovFov' ? null : tryOut(() => slicePovDecls(text));
  const f = tryOut(() => readPovFov(text));
  const c1 = row.id === 'K1-dup' || row.id === 'K1-none' ? tryOut(() => readCase1Slices(text)) : null;
  const decls = s?.v ? Object.fromEntries(Object.entries(s.v).map(([k, d]) => [k, [d.line, d.firstLine]])) : null;
  const throws = (s ? !!s.err : true) && !!f.err;
  const got = { verdict: throws ? 'THROW' : (s && s.err) || f.err ? 'MIXED' : 'GREEN', decls, fov: f.err ?? f.v, slice: s?.err ?? null };
  const dtxt = decls ? Object.entries(decls).map(([k, [l, fl]]) => `${k}:${l} ${JSON.stringify(fl)} (plan:582 BASE :${row.expect.decls?.[k]?.[2] ?? '?'})`).join('; ') : null;
  const detail = [s ? `slicePovDecls ${s.err ? `THROW ${JSON.stringify(s.err)}` : dtxt}` : null, `readPovFov ${f.err ? `THROW ${JSON.stringify(f.err)}` : f.v}`,
    c1 ? `readCase1Slices (information, not scored) ${c1.err ? `THROW ${JSON.stringify(c1.err)}` : 'returned'}` : null].filter(Boolean).join(' | ');
  return { got, detail };
}

// ---------------------------------------------------------------- scoring

/** Every key the row's expectation names must equal the reader's value. */
function mismatches(expect, got) {
  const out = [];
  for (const [k, v] of Object.entries(expect)) {
    if (k === 'decls') {
      for (const [n, [line, fl]] of Object.entries(v)) {
        const g = got.decls?.[n];
        if (!g || g[0] !== line || g[1] !== fl) out.push(`${n}=${g ? `${g[0]} ${JSON.stringify(g[1])}` : 'none'} want ${line} ${JSON.stringify(fl)}`);
      }
      continue;
    }
    if (got[k] !== v) out.push(`${k}=${JSON.stringify(got[k])} want ${JSON.stringify(v)}`);
  }
  return out;
}

/** R12 per row (plan:571-573; SPEC-K1 5.1): text RED -> AST RED unless exempt
 * (PL-11) or a different fence (fence-differs); text GREEN on a known-passing
 * item -> AST GREEN unless re-classed (OQ-12 (b)). */
function r12(row, astVerdict) {
  const t = row.text.verdict;
  const exempt = row.tags.some((x) => x.startsWith('exempt=') || x.startsWith('fence-differs='));
  if (t === 'RED' && astVerdict !== 'RED' && !exempt) return 'R12: text RED, AST not RED';
  const reclassed = row.tags.some((x) => x.startsWith('reclassed='));
  if (t === 'GREEN' && astVerdict !== 'GREEN' && !reclassed) return 'R12: text GREEN on a known-passing item, AST not GREEN';
  return null;
}

// ---------------------------------------------------------------- main

async function main() {
  const results = { pass: 0, fail: 0, invalid: 0 };
  const whole = [];
  const verdictOf = () => (results.invalid || whole.length ? 'INVALID' : results.fail ? 'FAIL' : 'GREEN');
  const finish = () => {
    const v = verdictOf();
    P(`wall=${((performance.now() - T0) / 1000).toFixed(1)}s`);
    P(`verdict ${v}${whole.length ? ` (${whole.join('; ')})` : ''}`);
    process.exitCode = v === 'GREEN' ? 0 : v === 'FAIL' ? 1 : 2;
  };
  const raw = Object.fromEntries(Object.entries(PATHS).map(([k, p]) => [k, fs.readFileSync(p, 'utf8')]));
  const plants = JSON.parse(raw.plants);
  const fx = JSON.parse(raw.fixture);
  const m = readMain67(plants.main67);
  const ids = new Set(plants.rows.map((r) => r.id));
  for (const id of NOT_REDUCED) if (!ids.has(id)) whole.push(`reduced list names ${id}, not in the plants json`);
  for (const r of plants.rows) if (r.reduced === NOT_REDUCED.includes(r.id)) whole.push(`plants json reduced flag of ${r.id} disagrees with the harness list`);
  if (ids.size !== plants.rows.length) whole.push('plants json has a duplicate row id');
  const rows = plants.rows.filter((r) => SET === 'full' || !NOT_REDUCED.includes(r.id));
  if (!m.text) {
    whole.push(`MAIN67 ${m.why}`);
    P(`set ${SET} rows ${rows.length} node ${process.version} MAIN67 unavailable: ${m.why}`);
    return finish();
  }
  let latch = null;
  try { latch = applyEdits(m.text, plants.latch.edits); } catch (e) { whole.push(`LATCH build ${e.message}`); }
  if (latch && sha(latch) !== plants.latch.sha256) { whole.push(`LATCH sha256 ${sha(latch)} != pin ${plants.latch.sha256}`); latch = null; }
  const h16 = (t) => (t === null ? 'none' : sha(t).slice(0, 16));
  P(`set ${SET} rows ${rows.length} node ${process.version} acorn ${acorn.version} ${h16(raw.acorn)} main67 ${h16(m.text)} latch ${h16(latch)} head-playback ${h16(raw.playback)} fixture ${h16(raw.fixture)} leaf ${h16(raw.leaf)} plants ${h16(raw.plants)}`);
  P(`paths root ${ROOT} playback ${PATHS.playback} leaf ${PATHS.leaf}; MAIN67 = git cat-file blob ${plants.main67.rev.slice(0, 8)}:${plants.main67.path} in ${ROOT}`);
  if (!latch) return finish();
  if (!(fx.records?.length === N_REC && fx.main?.length === N_REC)) { whole.push('fixture shape: 91 records and 91 main entries required'); return finish(); }
  // case 1's reference: main_rev's pinned declarations under this engine, the
  // pins checked against main_rev's playback.js from history
  const pinned = JSON.parse(raw.mainref);
  const mr = mainReference(pinned, fx);
  if (mr.why) { whole.push(`case 1 reference ${mr.why}`); return finish(); }
  const mainRef = mr.ref;
  const histSlices = (() => {
    try {
      const b = execFileSync('git', ['cat-file', 'blob', `${fx.main_rev}:web/app/playback.js`], { cwd: ROOT, maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'pipe'] });
      return sha(b) === fx.main_playback_sha256 ? readCase1Slices(b.toString('utf8')) : null;
    } catch { return null; }
  })();
  if (!histSlices) { whole.push(`case 1 reference: git cat-file blob ${fx.main_rev.slice(0, 8)}:web/app/playback.js unavailable or off its sha256`); return finish(); }
  const pinDiffers = (pins) => Object.keys(histSlices).filter((n) => pins.slices?.[n]?.text !== histSlices[n].text);
  const differs = pinDiffers(pinned);
  const planted = JSON.parse(raw.mainref);
  const pinText = planted.slices.povAnchors.text;
  planted.slices.povAnchors.text = pinText.replace('1.05 * dx', '1.06 * dx');
  const armDiffers = count(pinText, '1.05 * dx') === 1 ? pinDiffers(planted) : null;
  const storedEq = mainRef.filter((x, j) => pvaEq(x, fx.main[j])).length;
  P(`case 1 reference main ${fx.main_rev.slice(0, 8)} povAnchors under this engine (${process.arch}); pins vs history: ${differs.length ? `DIFFER ${differs.join(',')}` : 'equal 3 of 3'}; planted-byte arm: ${armDiffers === null ? 'anchor absent' : armDiffers.length ? `refused (${armDiffers.join(',')})` : 'NOT refused'}; stored fixture "main" equal ${storedEq} of ${N_REC} (information, not scored)`);
  if (differs.length) { whole.push(`case 1 reference pins differ from history: ${differs.join(',')}`); return finish(); }
  if (!armDiffers?.length) { whole.push('case 1 reference planted-byte arm not refused'); return finish(); }
  const BASES = { MAIN67: m.text, LATCH: latch, HEADPB: raw.playback, LEAF: raw.leaf, COORDS: raw.coords };
  const app = readAppFiles(APP);
  const others = app.files.filter((f) => f.rel !== 'playback.js');
  const tot = {};
  for (const r of plants.rows) tot[r.repro] = (tot[r.repro] ?? 0) + 1;
  P(`plants json rows ${plants.rows.length} (repro ${Object.entries(tot).sort().map(([k, v]) => `${k} ${v}`).join(', ')}); web/app .js files ${app.files.length}, without playback.js ${others.length}, links ${app.links}`);
  let r12Red = 0, r12AstRed = 0, r12Exempt = 0;
  for (const row of rows) {
    const tags = row.tags.length ? ` ${row.tags.join(' ')}` : '';
    const at = `@text ${row.text.cite} @gen ${row.generator}`;
    let text = null, pvLeaf = leaf, outcome, ast = '-', detail = '', why = [];
    try {
      if (row.base !== 'APP') {
        if (!(row.base in BASES)) throw new Invalid(`unknown base ${row.base}`);
        text = applyEdits(BASES[row.base], row.edits);
        const h = sha(text);
        let pin = row.sha256 === null ? ({ 'stmt+latch': 'stmt+latch', literal: 'literal-only', plan: 'plan', none: 'unedited' }[row.repro] ?? 'unpinned') : h === row.sha256 ? 'pin-ok' : 'pin-DIFFER';
        let card = '';
        if (CARD && row.repro === 'file' && row.card) {
          const cp = path.join(CARD, row.card);
          const ch = fs.existsSync(cp) ? sha(fs.readFileSync(cp)) : null;
          card = ` card=${row.card} ${ch === h ? 'match' : ch === null ? 'MISSING' : 'DIFFER'}`;
          if (ch !== h) pin = 'pin-DIFFER';
        }
        let leafNote = '';
        if (row.leafEdits.length) {
          const lt = applyEdits(BASES.LEAF, row.leafEdits);
          pvLeaf = await import('data:text/javascript,' + encodeURIComponent(lt));
          leafNote = ` leaf=${sha(lt).slice(0, 16)}`;
        }
        P(`bytes ${row.id} sha=${h.slice(0, 16)} repro=${row.repro} ${pin}${card}${leafNote}${row.tags.filter((x) => x.startsWith('also=')).map((x) => ` ${x}`).join('')}`);
        if (pin === 'pin-DIFFER') throw new Invalid(`plant bytes differ from the generator's (OQ-12 (e))`);
      }
      let res;
      if (row.reader === 'readF6') res = evalF6(text, row);
      else if (row.reader === 'readF6b') res = evalF6b(row.base === 'APP' ? others : [{ rel: 'coords.js', text }]);
      else if (row.reader === 'case1') res = evalCase1(text, pvLeaf, fx, mainRef);
      else if (row.reader === 'readF2F3') res = evalF2F3(text);
      else if (row.reader.includes('PovFov') || row.reader.includes('slicePovDecls')) res = evalR6(text, row);
      else throw new Invalid(`unknown reader ${row.reader}`);
      ast = res.got.verdict; detail = res.detail;
      if (row.base === 'APP') detail += ` (web/app .js ${app.files.length} incl. playback.js; 67855b4f had 66 incl. playback.js)`;
      why = mismatches(row.expect, res.got);
      const r = r12(row, ast);
      if (r) why.push(r);
      if (row.text.verdict === 'RED') { r12Red++; if (ast === 'RED') r12AstRed++; else if (row.tags.some((x) => /^(exempt|fence-differs)=/.test(x))) r12Exempt++; }
      outcome = why.length ? 'FAIL' : 'pass';
    } catch (e) {
      outcome = 'INVALID'; why = [e instanceof Invalid ? e.message : `harness error ${e?.stack?.split('\n').slice(0, 2).join(' ') ?? e}`];
    }
    results[outcome === 'pass' ? 'pass' : outcome === 'FAIL' ? 'fail' : 'invalid']++;
    P(`${row.id} reader=${row.reader} ast=${ast} ${detail} expect=${row.expect.verdict} text=${row.text.verdict} ${at}${tags} -> ${outcome}${why.length ? ` (${why.join('; ')})` : ''}`);
  }
  P(`summary pass ${results.pass} fail ${results.fail} invalid ${results.invalid} of ${rows.length}; R12 text-RED rows ${r12Red} ast-RED ${r12AstRed} (exempt ${r12Exempt})`);
  return finish();
}

try {
  await main();
} catch (e) {
  P(`verdict INVALID (${e?.message ?? e})`);
  process.exitCode = 2;
}
