// Copyright (c) Meta Platforms, Inc. and affiliates.

// GH-911 C5: the POV pose selftest, the node selftest of the design card's
// section 7 ("Test" and cases 1-10, card:3232-3740) on the AST reader (R12).
// "card" is the GH-911 design card DESIGN-911 and "plan" its build plan
// PLAN-911-IMPL (C5, section 3.4, section 3.5). playback.js cites read
// BASE -> HEAD: BASE 10197041 (byte-equal to 247b7987 for playback.js), HEAD
// the tree this file lands on.
//
//   node web/tools/test-povpose.mjs
//
// Inputs a CI checkout has (card:3233-3238): the leaf web/app/povpose.js,
// imported as a module; web/tools/fixtures/povpose-corpus-911.json and
// web/tools/fixtures/povpose-main-911.json, read as JSON; web/app/playback.js and web/scene/cuelooks.js, read as text; every .js
// file under web/app/, read as text (F6b, and cuepost.js's follow-through law).
// No git history, no browser, no network; the test writes nothing.
//
// Readers (R12; plan OQ-12 (a)): the vendored acorn 8.17.0
// (tools/render/lib/vendor/acorn/acorn.mjs), parsed as a module.
// - Case 1 slices recCueId (playback.js:3884 -> :3971), povTImpact
//   (:3913 -> :4000) and povAnchors (:3967 -> :4062), exactly one
//   FunctionDeclaration each, as the whole declaration [start, end)
//   (card:3245-3252; plan OQ-13 (a)).
// - Case 5 reads POV_FOV (:3961 -> :4052) as exactly one VariableDeclarator.
// - F6 and F6b count the static forms naming povpose.js and the
//   import('./povpose.js') expressions on the AST (x7-fence-strip.mjs [e3]
//   form); F6's `.catch(` is the AST chain import(...).then(...).catch(...)
//   (plan C5, OQ-14).
// - "The stripped text" is the raw text with acorn's comment ranges blanked;
//   BLANK is the stripped text with acorn's string, template and regexp token
//   ranges blanked (card:3683-3686, :3582-3583, :3595-3607; plan section 3.5
//   r7; OQ-14 part 5 (a)).
//   Blanking keeps every newline, so offsets and lines are the raw text's.
// The readers are exported for K1 (plan C5 K1, r5-r6; the harness is
// web/tools/test-povpose-k1.mjs, which also holds F6's .catch plant,
// OQ-61 (a)); the CLI runs only when this file is the entry module.
//
// The exit status is one verdict, set once at the end: 0 GREEN, 1 FAIL,
// 2 INVALID. Each observed count prints beside the card's prediction and the
// delta; a delta is reported, never re-tuned, and fails nothing by itself.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as acorn from '../../tools/render/lib/vendor/acorn/acorn.mjs';
import * as leaf from '../app/povpose.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const APP = path.join(ROOT, 'web', 'app');
const PATHS = {
  leaf: path.join(APP, 'povpose.js'),
  playback: path.join(APP, 'playback.js'),
  cuepost: path.join(APP, 'cuepost.js'),
  cuelooks: path.join(ROOT, 'web', 'scene', 'cuelooks.js'),
  fixture: path.join(HERE, 'fixtures', 'povpose-corpus-911.json'),
  mainref: path.join(HERE, 'fixtures', 'povpose-main-911.json'),
};
const PARSE = { ecmaVersion: 'latest', sourceType: 'module' };
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const count = (text, s) => text.split(s).length - 1;
const lineAt = (src, i) => src.slice(0, i).split('\n').length;
const BL = (t) => t.replace(/[^\n]/g, ' ');

function walk(node, visit, parent = null) {
  if (!node || typeof node.type !== 'string') return;
  visit(node, parent);
  for (const k of Object.keys(node)) {
    const v = node[k];
    if (Array.isArray(v)) { for (const c of v) walk(c, visit, node); } else if (v && typeof v.type === 'string') walk(v, visit, node);
  }
}

function functionDecls(ast, names) {
  const hits = Object.fromEntries(names.map((n) => [n, []]));
  walk(ast, (n) => { if (n.type === 'FunctionDeclaration' && names.includes(n.id?.name)) hits[n.id.name].push(n); });
  return hits;
}

// ---------------------------------------------------------------- readers (K1)

const CASE1_FNS = ['recCueId', 'povTImpact', 'povAnchors'];

/** GH-911 C5 case 1 reader: the three case 1 declarations of a playback.js
 * text, by AST. Returns { recCueId, povTImpact, povAnchors }, each
 * { name, start, end, bodyStart, bodyEnd, line, text } with
 * text = src.slice(start, end), the whole declaration (card:3245-3252).
 * Throws unless each name has exactly one FunctionDeclaration. */
export function readCase1Slices(src) {
  const hits = functionDecls(acorn.parse(src, PARSE), CASE1_FNS);
  const out = {};
  for (const name of CASE1_FNS) {
    if (hits[name].length !== 1) throw new Error(`readCase1Slices: ${hits[name].length} FunctionDeclarations named ${name} (exactly one required)`);
    const n = hits[name][0];
    out[name] = { name, start: n.start, end: n.end, bodyStart: n.body.start, bodyEnd: n.body.end, line: lineAt(src, n.start), text: src.slice(n.start, n.end) };
  }
  return out;
}

/** GH-911 C5 case 1 evaluation: the slices run through new Function with
 * the named stubs pb and povRod (card:3255-3257); returns
 * { recCueId, povTImpact, povAnchors }. */
export function buildPovAnchors(slices, pb, povRod = () => null) {
  const { recCueId, povTImpact } = new Function(`${slices.recCueId.text}\n${slices.povTImpact.text}\nreturn { recCueId, povTImpact };`)();
  const povAnchors = new Function('recCueId', 'povTImpact', 'pb', 'povRod', `${slices.povAnchors.text}\nreturn povAnchors;`)(recCueId, povTImpact, pb, povRod);
  return { recCueId, povTImpact, povAnchors };
}

/** GH-911 case 1 reference: main_rev's recCueId, povTImpact and povAnchors,
 * byte-pinned in web/tools/fixtures/povpose-main-911.json (each declaration
 * text with its sha256), run on the fixture records under the running engine.
 * The corpus's stored "main" was computed on one engine, and presentation
 * math may differ by 1 ulp across CPU architectures (arm64 vs x64 Math.cos,
 * measured on record 39), so case 1 compares against this engine's reference
 * and keeps exact Object.is equality: the purity claim is per engine.
 * Returns { ref, why }: why is null, or the reason the pins refuse (the
 * caller reports a refusal as INVALID). */
export function mainReference(mainref, fx) {
  if (mainref?.schema !== 'povpose-main/1') return { ref: null, why: `schema ${JSON.stringify(mainref?.schema)}` };
  if (mainref.main_rev !== fx.main_rev || mainref.main_playback_sha256 !== fx.main_playback_sha256) {
    return { ref: null, why: 'main_rev or main_playback_sha256 differs from the corpus header' };
  }
  const slices = {};
  for (const name of CASE1_FNS) {
    const s = mainref.slices?.[name];
    if (typeof s?.text !== 'string') return { ref: null, why: `no pinned ${name}` };
    const h = sha(s.text);
    if (h !== s.sha256) return { ref: null, why: `${name} sha256 ${h} != pin ${s.sha256}` };
    slices[name] = { name, text: s.text };
  }
  const { povAnchors } = buildPovAnchors(slices, {});
  return { ref: fx.records.map((rec) => povAnchors(rec)), why: null };
}

/** GH-911 C5 case 5 reader (plan C5, r5): POV_FOV from a playback.js text,
 * by AST. Returns the number; throws unless there is exactly one
 * VariableDeclarator named POV_FOV and its initializer is a numeric literal. */
export function readPovFov(src) {
  const hits = [];
  walk(acorn.parse(src, PARSE), (n) => { if (n.type === 'VariableDeclarator' && n.id?.type === 'Identifier' && n.id.name === 'POV_FOV') hits.push(n); });
  if (hits.length !== 1) throw new Error(`readPovFov: ${hits.length} VariableDeclarators named POV_FOV (exactly one required)`);
  const init = hits[0].init;
  if (!init || init.type !== 'Literal' || typeof init.value !== 'number') throw new Error('readPovFov: POV_FOV is not initialized by a numeric literal');
  return init.value;
}

// A static form naming the leaf (x7-fence-strip.mjs [e3]), and the dynamic form.
const namesLeaf = (n) => (n.type === 'ImportDeclaration' || n.type === 'ExportAllDeclaration'
  || (n.type === 'ExportNamedDeclaration' && n.source)) && String(n.source.value).includes('povpose.js');
const isLeafImport = (n) => n.type === 'ImportExpression' && n.source?.type === 'Literal' && n.source.value === './povpose.js';
const isMember = (m, obj, name) => m?.type === 'MemberExpression' && m.object === obj && !m.computed && !m.optional
  && m.property?.type === 'Identifier' && m.property.name === name;
const isCallOf = (c, callee) => c?.type === 'CallExpression' && c.callee === callee && !c.optional;

/** GH-911 C5 F6 (card:3608-3612; plan section 3.5, OQ-14): on a playback.js
 * text, 0 static forms name povpose.js, there is exactly one
 * import('./povpose.js'), and that ImportExpression is the object of a
 * `.then` member whose call is the object of a `.catch` member that is called.
 * Returns { ok, static, dyn, chained, sites: [{ line, chained }], error }. */
export function readF6(src) {
  let ast;
  try { ast = acorn.parse(src, PARSE); } catch (e) { return { ok: false, static: 0, dyn: 0, chained: 0, sites: [], error: e.message }; }
  const parent = new Map();
  const dyn = [];
  let st = 0;
  walk(ast, (n, p) => { parent.set(n, p); if (namesLeaf(n)) st++; if (isLeafImport(n)) dyn.push(n); });
  let chained = 0;
  const sites = [];
  for (const i of dyn) {
    const thenM = parent.get(i), thenC = parent.get(thenM), catchM = parent.get(thenC), catchC = parent.get(catchM);
    const ok = isMember(thenM, i, 'then') && isCallOf(thenC, thenM) && isMember(catchM, thenC, 'catch') && isCallOf(catchC, catchM);
    if (ok) chained++;
    sites.push({ line: lineAt(src, i.start), chained: ok });
  }
  return { ok: st === 0 && dyn.length === 1 && chained === 1, static: st, dyn: dyn.length, chained, sites, error: null };
}

/** GH-911 C5 F6b (card:3663-3665): files = [{ rel, text }], every web/app
 * .js file other than playback.js. RED on a file with a static form naming
 * povpose.js, or one acorn cannot parse (x7-fence-strip.mjs [e3]).
 * Returns { ok, files, bad: [{ rel, static | error }] }. */
export function readF6b(files) {
  const bad = [];
  for (const { rel, text } of files) {
    let ast;
    try { ast = acorn.parse(text, PARSE); } catch (e) { bad.push({ rel, error: e.message }); continue; }
    let st = 0;
    walk(ast, (n) => { if (namesLeaf(n)) st++; });
    if (st > 0) bad.push({ rel, static: st });
  }
  return { ok: bad.length === 0, files: files.length, bad };
}

/** GH-911 C5: every .js file under dir, as { rel, text } with rel relative to
 * dir in '/' form, sorted by name. Symbolic links are neither followed nor
 * read; their count is returned. */
export function readAppFiles(dir = APP) {
  const files = [];
  let links = 0;
  const rec = (d) => {
    const ents = fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const e of ents) {
      const p = path.join(d, e.name);
      if (e.isSymbolicLink()) links++;
      else if (e.isDirectory()) rec(p);
      else if (e.isFile() && e.name.endsWith('.js')) files.push({ rel: path.relative(dir, p).split(path.sep).join('/'), text: fs.readFileSync(p, 'utf8') });
    }
  };
  rec(dir);
  return { files, links };
}

function blankRanges(src, ranges) {
  let o = '', last = 0;
  for (const r of ranges) { o += src.slice(last, r.start) + BL(src.slice(r.start, r.end)); last = r.end; }
  return o + src.slice(last);
}

/** GH-911 C5 "the stripped text" (card:3683-3686; OQ-14): src with acorn's
 * comment ranges blanked (every character but '\n' to a space). */
export function strippedText(src) {
  const comments = [];
  acorn.parse(src, { ...PARSE, onComment: comments });
  return blankRanges(src, comments);
}

const LITERAL_TOKENS = ['string', 'template', 'regexp', 'invalidTemplate'];
/** GH-911 C5 BLANK (card:3595-3607): the stripped text with acorn's string,
 * template and regexp token ranges blanked, so brackets inside literals do
 * not count (R9-2). */
export function blankText(stripped) {
  const toks = [];
  acorn.parse(stripped, { ...PARSE, onToken: toks });
  return blankRanges(stripped, toks.filter((t) => LITERAL_TOKENS.includes(t.type.label)));
}

const NUM = /(?<![\w$.])(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?(?![\w$])/gi;
/** GH-911 C5 F2 and F3 (card:3556-3557; plan section 3.5, OQ-14): povAnchors's
 * FunctionDeclaration body range, on the stripped text; F2 = it names povPose,
 * F3 = it has no numeric literal (x6-race-latch.mjs:219-229 regexes).
 * Returns { F2, F3, nums, body, error }. */
export function readF2F3(src) {
  try {
    const hits = functionDecls(acorn.parse(src, PARSE), ['povAnchors']).povAnchors;
    if (hits.length !== 1) throw new Error(`${hits.length} FunctionDeclarations named povAnchors (exactly one required)`);
    const body = strippedText(src).slice(hits[0].body.start, hits[0].body.end);
    const nums = body.match(NUM) ?? [];
    return { F2: /\bpovPose\b/.test(body), F3: nums.length === 0, nums, body, error: null };
  } catch (e) {
    return { F2: false, F3: false, nums: [], body: '', error: e.message };
  }
}

// ---------------------------------------------------------------- F7 (text census)

const SIG = 'function povAnchors(';
const XRE = /import\('\.\/povpose\.js'\)\s*\.then\(\s*\(?\s*([\w$]+)\s*\)?\s*=>\s*\{?\s*([\w$]+)\s*=\s*\1\b/;
const LIT = /(?<![\w$.])pb\s*=\s*\{/g;
const PB_ASSIGN = /(?<![\w$.])pb\s*=(?![=>])/g;
const READ = /pb\s*(?:\?\.|\.)\s*povLeaf\s*(?:\?\.|\.)\s*povPose\b/y;
const TOK = 'povLeaf';
const F7C_EXPECT = 2; // GH-911 the key in pb's literal and the read in povAnchors, card:3726-3730
// DEC (card:3712-3715; x8-f7-census.mjs:39): every backslash escape collapses to what it spells.
const DEC = (s) => s.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|\r\n|[\s\S])/g, (_, e) => {
  if (e.length > 1 && e[0] === 'u') return String.fromCodePoint(parseInt(e.replace(/[u{}]/g, ''), 16));
  if (e.length === 3 && e[0] === 'x') return String.fromCharCode(parseInt(e.slice(1), 16));
  if (/^(?:\r\n|[\r\n\u2028\u2029])$/.test(e)) return '';
  return e;
});
const allAt = (s, t) => { const r = []; for (let i = s.indexOf(t); i >= 0; i = s.indexOf(t, i + 1)) r.push(i); return r; };
const esc = (x) => x.replace(/\$/g, '\\$');

// F7a, F7b, F7c (card:3683-3736; plan section 3.5 r7): counts on the stripped
// text s, brackets on BLANK B (the x9-f7-anchor.mjs f7a9, f7b9 and census9 forms).
function fenceF7(s, B) {
  const m = s.match(XRE);
  const X = m ? m[2] : null;
  let a0 = -1, a1 = -1, code = '';
  if (count(s, SIG) === 1) {
    a0 = s.indexOf(SIG);
    const b0 = B.indexOf('{', a0);
    let dep = 0, k = b0;
    for (; b0 >= 0 && k < B.length; k++) { if (B[k] === '{') dep++; else if (B[k] === '}') { dep--; if (dep === 0) break; } }
    a1 = Math.min(k + 1, s.length);
    code = s.slice(a0, a1);
  }
  const readsLatch = /(?<![\w$.])pb\s*\??\.\s*povLeaf\b/.test(code);
  const readsBinding = X ? new RegExp(String.raw`(?<![\w$.])${esc(X)}(?![\w$])`).test(code) : true;
  const F7a = !!X && readsLatch && !readsBinding;

  const lits = (s.match(LIT) ?? []).length;
  let nulls = 0;
  const other = [];
  for (const h of s.matchAll(PB_ASSIGN)) {
    const rest = s.slice(h.index + h[0].length);
    if (/^\s*\{/.test(rest)) continue;
    if (/^\s*null\s*[;,)]/.test(rest)) { nulls++; continue; }
    other.push(`:${lineAt(s, h.index)} ${JSON.stringify(s.slice(h.index, h.index + 40).replace(/\s+/g, ' '))}`);
  }
  const F7b = lits === 1 && other.length === 0;

  const dec = allAt(DEC(s), TOK).length, raw = allAt(s, TOK);
  let lo = -1, hi = -1, keyAt = 0, readAt = 0;
  if (lits === 1) {
    lo = s.indexOf('{', s.search(LIT));
    let dep = 0, k = lo;
    for (; k < B.length; k++) { const ch = B[k]; if ('{[('.includes(ch)) dep++; else if ('}])'.includes(ch)) dep--; if (dep === 0) break; }
    hi = k;
  }
  const depthAt = (p) => { let dep = 0; for (let k = lo; k < p; k++) { const ch = B[k]; if ('{[('.includes(ch)) dep++; else if ('}])'.includes(ch)) dep--; } return dep; };
  const keyRe = X && X !== TOK ? new RegExp(String.raw`^povLeaf\s*:\s*${esc(X)}\s*(?=[,}])`) : null;
  const stray = [];
  for (const p of raw) {
    if (lo >= 0 && p > lo && p < hi && depthAt(p) === 1 && /[{,]$/.test(s.slice(lo, p).replace(/\s+$/, '')) && keyRe && keyRe.test(s.slice(p))) { keyAt++; continue; }
    if (a0 >= 0 && p > a0 && p < a1) {
      const q = s.lastIndexOf('pb', p);
      if (q >= a0) { READ.lastIndex = q; if (READ.test(s) && /^\s*(?:\?\.|\.)\s*$/.test(s.slice(q + 2, p))) { readAt++; continue; } }
    }
    stray.push(`:${lineAt(s, p)}`);
  }
  const F7c = dec === F7C_EXPECT && keyAt === 1 && readAt === 1;
  return { F7a, F7b, F7c, X, readsLatch, readsBinding, bodyLines: a0 >= 0 ? [lineAt(s, a0), lineAt(s, a1)] : null,
    lits, nulls, other, dec, raw: raw.length, keyAt, readAt, stray };
}

// ---------------------------------------------------------------- oracle, world frame, grid

// ORACLE (card:3195): the shipped expression, BASE playback.js:3976-3979, whose
// literals HEAD holds in web/app/povpose.js.
function ORACLE(p, phi) {
  const dx = Math.cos(phi), dy = Math.sin(phi);
  return { d: [dx, dy], addrCam: [p.x - 1.05 * dx, p.y - 1.05 * dy, p.z + 0.36], addrLook: [p.x + 1.40 * dx, p.y + 1.40 * dy, p.z],
    standCam: [p.x - 1.75 * dx, p.y - 1.75 * dy, 0.81], standLook: [0, 0, 0.02] };
}
const FIELDS = ['d', 'addrCam', 'addrLook', 'standCam', 'standLook'];
const FLEN = [2, 3, 3, 3, 3];
const OFF = { d: 0, addrCam: 2, addrLook: 5, standCam: 8, standLook: 11 };
const W = 14; // doubles per cell

// Case 2's world-frame routine (card:3443-3449), the test's own arithmetic:
// basis d, lateral n = (-sin phi, cos phi, 0) and up; the stroke-frame rod tip
// and axis of wd-phase-g2b.mjs:57-59 rebuilt in world coordinates; the
// envelope capsule R_BUTT over CUE_LEN; point-to-segment distance.
const C = 0.10; // GH-911 address clearance C (m), card:2999
const C_FRAME = 0.05; // GH-911 addrCam to standCam lerp clearance C_frame (m), card:2999
const TIP_GAP = 0.010; // GH-911 tip rest gap (m), web/scene/cuestick.js:69
const R_BUTT = 0.0146; // GH-911 capsule radius (m), web/scene/cuelooks.js:92
const CUE_LEN = 1.477; // GH-911 capsule length (m), web/scene/cuelooks.js:90
const DEG = Math.PI / 180;
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function rodWorld(p, phi, R, rod) {
  const d = [Math.cos(phi), Math.sin(phi), 0], n = [-Math.sin(phi), Math.cos(phi), 0], z = [0, 0, 1];
  const c = Math.cos(rod.thetaDeg * DEG), s = Math.sin(rod.thetaDeg * DEG), a = rod.a, b = rod.b;
  const g = R + TIP_GAP - (TIP_GAP + (1 - Math.sqrt(1 - (a * a + b * b))) * R) - rod.followThroughM;
  const tip = add(add(add([p.x, p.y, p.z], mul(d, -g * c + b * R * s)), mul(n, -a * R)), mul(z, g * s + b * R * c));
  return { tip, u: add(mul(d, -c), mul(z, s)), nUp: add(mul(d, s), mul(z, c)), mg: rod.flexM };
}
function clearance(E, q) {
  const w = sub(E, q.tip), s = Math.max(0, Math.min(CUE_LEN, dot(w, q.u))), r = sub(w, mul(q.u, s));
  return Math.sqrt(dot(r, r)) - R_BUTT - q.mg;
}
function riseMin(E, S, q) { // the 401-point straight lerp (card:3450-3452)
  let m = Infinity;
  for (let k = 0; k <= 400; k++) m = Math.min(m, clearance(add(E, mul(sub(S, E), k / 400)), q));
  return m;
}

// The follow-through law, transcribed from web/app/cuepost.js:272-276 (unchanged
// 247b7987 -> HEAD; called at cuepost.js:1471 -> :1476 with ballD = 2 * ballR).
// The five lines are fenced: they must occur exactly once in cuepost.js's raw
// text (plan C5, OQ-19). The transcription is evaluated, so the fenced text is
// the law the grid runs.
const FT_LAW = [
  'const FT_V_LO = 1.5, FT_V_HI = 6.0;    // v0 ramp ends for the 1D→2D law',
  'const FT_BREAK_CAP = 0.25;',
  "const followThroughM = (cls, v0, ballD) => (cls === 'break'",
  '  ? Math.min(FT_BREAK_CAP, 2 * ballD + 0.015 * v0)',
  '  : ballD * (1 + Math.min(1, Math.max(0, (v0 - FT_V_LO) / (FT_V_HI - FT_V_LO)))));',
].join('\n');
const followThroughM = new Function(`${FT_LAW}\nreturn followThroughM;`)();

// The grid (card:3413-3421): b, a with a*a + b*b <= 0.5, class x v0, theta;
// record pose i mod 91 in this loop order; flexM 0.
const B_SET = [-0.5, -0.25, 0, 0.25, 0.5];
const A_SET = [0, 0.5, -0.5];
const CLASSES = ['normal', 'break'];
const V0_SET = [1.5, 2.5, 4.5, 6.0];
const THETA_GRID = Array.from({ length: 1801 }, (_, k) => (1000 + k) / 100);
const THETA_ID = [0, 5, 10, 12.0, 26.0, 30, 40, 60]; // GH-911 case 1 check 2, card:3428-3429
function buildCells(thetas, recs) {
  const cells = [];
  let i = 0;
  for (const b of B_SET) for (const a of A_SET) {
    if (a * a + b * b > 0.5 + 1e-12) continue;
    for (const cls of CLASSES) for (const v0 of V0_SET) for (const th of thetas) {
      const rec = recs[i % recs.length], ball = rec.initial.balls[0];
      cells.push({ ball, phi: Number(rec.shot.phi),
        rod: { thetaDeg: th, a, b, followThroughM: followThroughM(cls, v0, 2 * ball.params.r), flexM: 0 } });
      i++;
    }
  }
  return cells;
}

// One grid pass: the module's povPose on every cell, packed W doubles per cell;
// status 0 ok, 1 null, 2 throw, 3 wrong field shape.
function runGrid(M, cells) {
  const t0 = performance.now();
  const buf = new Float64Array(cells.length * W), status = new Uint8Array(cells.length);
  let nul = 0, thr = 0, shape = 0, firstThrow = null;
  for (let i = 0; i < cells.length; i++) {
    const { ball, phi, rod } = cells[i];
    let out;
    try { out = M.povPose(ball, phi, rod); } catch (e) { thr++; status[i] = 2; firstThrow ??= String(e?.message ?? e); continue; }
    if (!out) { nul++; status[i] = 1; continue; }
    if (!FIELDS.every((f, j) => Array.isArray(out[f]) && out[f].length === FLEN[j])) { shape++; status[i] = 3; continue; }
    let o = i * W;
    for (const f of FIELDS) for (const x of out[f]) buf[o++] = x;
  }
  return { buf, status, nul, thr, shape, firstThrow, wall: (performance.now() - t0) / 1000 };
}
const v3 = (r, i, f) => { const o = i * W + OFF[f]; return [r.buf[o], r.buf[o + 1], r.buf[o + 2]]; };
const bytesOf = (r) => Buffer.concat([Buffer.from(r.buf.buffer, r.buf.byteOffset, r.buf.byteLength), Buffer.from(r.status)]);

function fieldDiffs(r, i, want, skipAddrZ) {
  const bad = [];
  for (const f of FIELDS) for (let c = 0; c < want[f].length; c++) {
    if (skipAddrZ && f === 'addrCam' && c === 2) continue;
    if (!Object.is(r.buf[i * W + OFF[f] + c], want[f][c])) bad.push(`${f}[${c}]`);
  }
  return bad;
}

function judgeC2(r, cells, fired) {
  let fail = 0, fF = 0, fI = 0, min = Infinity;
  for (let i = 0; i < cells.length; i++) {
    const { ball, phi, rod } = cells[i];
    let bad = r.status[i] !== 0;
    if (!bad) { const cl = clearance(v3(r, i, 'addrCam'), rodWorld(ball.state.pos, phi, ball.params.r, rod)); min = Math.min(min, cl); bad = !(cl >= C); }
    if (bad) { fail++; if (fired[i]) fF++; else fI++; }
  }
  return { fail, fF, fI, min };
}
function judgeC3(r, cells, fired) {
  let fail = 0, fF = 0, fI = 0, min = Infinity;
  for (let i = 0; i < cells.length; i++) {
    const { ball, phi, rod } = cells[i];
    let bad = r.status[i] !== 0;
    if (!bad) { const m = riseMin(v3(r, i, 'addrCam'), v3(r, i, 'standCam'), rodWorld(ball.state.pos, phi, ball.params.r, rod)); min = Math.min(min, m); bad = !(m >= C_FRAME); }
    if (bad) { fail++; if (fired[i]) fF++; else fI++; }
  }
  return { fail, fF, fI, min };
}
// Case 4 (card:3456): h_perp, the eye's offset above the rod axis in the
// stroke frame (card:2630-2631), is (E - tip) . nUp with nUp = sin(theta) d +
// cos(theta) z; the follow-through term cancels, h_perp = h cos(theta) -
// 1.05 sin(theta) - b R. Scope (addendum A4, ASK-4 (c)): h_perp > 0 is judged
// on fired cells. On identity cells the card's gate returns ADDR_UP bit-exact
// (card:4198-4199), and that shipped eye sits below the rod at high theta by
// design, so there the identity clause, in case 3's form (card:3450-3452),
// counts every leaf eye that differs from the shipped eye: ORACLE's addrCam,
// Object.is per component (a cell with no pose counts under the height
// clause only). h, the eye height, must stay below the standCam height on
// every cell.
function judgeC4(r, cells, fired) {
  let failPerp = 0, failH = 0, failId = 0, idBelow = 0, minPerp = Infinity;
  for (let i = 0; i < cells.length; i++) {
    const { ball, phi, rod } = cells[i];
    if (r.status[i] !== 0) { failH++; if (fired[i]) failPerp++; continue; }
    const E = v3(r, i, 'addrCam'), q = rodWorld(ball.state.pos, phi, ball.params.r, rod);
    const hp = dot(sub(E, q.tip), q.nUp);
    if (fired[i]) { minPerp = Math.min(minPerp, hp); if (!(hp > 0)) failPerp++; } else {
      if (!(hp > 0)) idBelow++;
      const S = ORACLE(ball.state.pos, phi).addrCam;
      if (!E.every((x, c) => Object.is(x, S[c]))) failId++;
    }
    if (!(E[2] < v3(r, i, 'standCam')[2])) failH++;
  }
  return { failPerp, failH, failId, idBelow, minPerp };
}
// Case 5 (card:3457): the cue-ball centre in NDC for the address camera (eye
// addrCam, target addrLook, world up z), vertical field of view POV_FOV,
// aspect 1; x is 0 up to rounding (the ball lies in the camera's vertical
// plane), so the aspect does not move the verdict.
function judgeC5(r, cells, fovDeg) {
  const fpx = 1 / Math.tan((fovDeg * DEG) / 2);
  let fail = 0, maxX = 0, maxY = 0;
  for (let i = 0; i < cells.length; i++) {
    if (r.status[i] !== 0) { fail++; continue; }
    const p = cells[i].ball.state.pos, E = v3(r, i, 'addrCam'), L = v3(r, i, 'addrLook');
    const f = sub(L, E), fl = Math.hypot(f[0], f[1], f[2]), fw = [f[0] / fl, f[1] / fl, f[2] / fl];
    const rl = Math.hypot(fw[0], fw[1]), rt = [fw[1] / rl, -fw[0] / rl, 0];
    const up = [rt[1] * fw[2] - rt[2] * fw[1], rt[2] * fw[0] - rt[0] * fw[2], rt[0] * fw[1] - rt[1] * fw[0]];
    const v = sub([p.x, p.y, p.z], E), zc = dot(v, fw);
    const x = (fpx * dot(v, rt)) / zc, y = (fpx * dot(v, up)) / zc;
    if (Number.isFinite(x)) maxX = Math.max(maxX, Math.abs(x));
    if (Number.isFinite(y)) maxY = Math.max(maxY, Math.abs(y));
    if (!(zc > 0 && Math.abs(x) <= 0.7 && Math.abs(y) <= 0.7)) fail++;
  }
  return { fail, maxX, maxY };
}
function judgeC8(r, cells) {
  let fail = 0;
  const fields = new Set();
  for (let i = 0; i < cells.length; i++) {
    if (r.status[i] !== 0) { fail++; fields.add('(no pose)'); continue; }
    const { ball, phi } = cells[i];
    const bad = fieldDiffs(r, i, ORACLE(ball.state.pos, phi), true);
    if (bad.length) { fail++; for (const b of bad) fields.add(b); }
  }
  return { fail, fields: [...fields] };
}
function check2(M, cells2) {
  const r = runGrid(M, cells2);
  let fail = 0;
  const fields = new Set();
  for (let i = 0; i < cells2.length; i++) {
    if (r.status[i] !== 0) { fail++; fields.add('(no pose)'); continue; }
    const { ball, phi } = cells2[i];
    const bad = fieldDiffs(r, i, ORACLE(ball.state.pos, phi), false);
    if (bad.length) { fail++; for (const b of bad) fields.add(b); }
  }
  return { fail, fields: [...fields] };
}

const pvaEq = (h, m) => !!h && !!m && JSON.stringify(Object.keys(h)) === JSON.stringify(Object.keys(m)) && Object.is(h.ti, m.ti)
  && FIELDS.every((f) => Array.isArray(h[f]) && h[f].length === m[f].length && m[f].every((v, c) => Object.is(h[f][c], v)));
function check1(slices, pbStub, recs, main) {
  const { povAnchors } = buildPovAnchors(slices, pbStub);
  let eq = 0, nonNull = 0, first = null;
  recs.forEach((rec, j) => {
    const h = povAnchors(rec);
    if (h !== null) nonNull++;
    if (pvaEq(h, main[j])) eq++;
    else if (first === null) first = !h || !main[j] ? `record ${j} ${h ? 'main null' : 'null'}`
      : `record ${j} fields ${JSON.stringify(FIELDS.flatMap((f) => (main[j][f] ?? []).map((v, c) => (Object.is(h[f]?.[c], v) ? null : `${f}[${c}]`)).filter(Boolean)))}`;
  });
  return { eq, nonNull, first: first ?? 'none' };
}

// ---------------------------------------------------------------- the CLI

const PRED = { // the card's replay numbers on N1's leaf (plan section 3.4)
  check1: 91, nullLatch: 0, stale: 0, check2: 0, cells: 216120, check2Cells: 960, fired: 141512,
  c2: 0, c3: 0, c4: 0, c4id: 0, c5: 0, c8: 0, tokens: 0,
  armI_c3: 19, armI_c2: 0, armII_c2: 141512, armII_c3: 99702, armIII_c8: 216120, armIII_check1: 0, armIII_check2: 960,
};
const pv = (obs, pred) => `${obs} (predicted ${pred}, delta ${obs - pred})`;
const ANCHORS = { // GH-911 plan C1 item 3 (r9): the leaf's exact-text anchors
  gate: 'if (addr(ADDR_UP) >= C) return ADDR_UP;',
  ok: 'const ok = (h) => addr(h) >= C + DELTA && rise(h) >= C_FRAME + DELTA;',
  pose: 'const h = rod ? liftH(rod, ball.params.r, p.z) : ADDR_UP;',
  standh: 'const STAND_H = 0.81;',
};
const ARMS = [ // GH-911 card:3494-3528; plan section 6 PL-3, PL-1, PL-2
  { arm: '(i)', id: 'PL-3', what: 'rise term', anchor: ANCHORS.ok, repl: 'const ok = (h) => addr(h) >= C + DELTA;' },
  { arm: '(ii)', id: 'PL-1', what: 'lift selection', anchor: ANCHORS.pose, repl: 'const h = ADDR_UP;' },
  { arm: '(iii)', id: 'PL-2', what: 'standCam height literal', anchor: ANCHORS.standh, repl: 'const STAND_H = 0.8100000001;' },
];
// A copy of the leaf is loaded from a data: URL, so nothing is written.
const importText = (text) => import(`data:text/javascript;base64,${Buffer.from(text, 'utf8').toString('base64')}`);

async function main() {
  const T0 = performance.now();
  const P = (s) => console.log(`[test-povpose] ${s}`);
  const fails = [], invalids = [];
  const FAIL = (w) => { fails.push(w); P(`FAIL ${w}`); };
  const INVALID = (w) => { invalids.push(w); P(`INVALID ${w}`); };
  const walls = {};
  const runCase = async (n, fn) => {
    const t0 = performance.now();
    try { await fn(); } catch (e) { FAIL(`case ${n} threw: ${e?.message ?? e}`); }
    walls[n] = (performance.now() - t0) / 1000;
    P(`case ${n} wall=${walls[n].toFixed(1)}s`);
  };

  // ---- inputs
  const raw = Object.fromEntries(Object.entries(PATHS).map(([k, p]) => [k, fs.readFileSync(p, 'utf8')]));
  for (const [k, p] of Object.entries(PATHS)) P(`input ${path.relative(ROOT, p).split(path.sep).join('/')} sha256 ${sha(raw[k])} bytes ${Buffer.byteLength(raw[k])}`);
  const fx = JSON.parse(raw.fixture);
  const recs = fx.records, mainOut = fx.main;
  P(`fixture schema ${fx.schema}; main_rev ${fx.main_rev}; records ${recs.length}; main ${mainOut.length}; records with one ball ${recs.filter((r) => r.initial?.balls?.length === 1).length} of ${recs.length}`);
  if (!(recs.length === 91 && mainOut.length === 91 && recs.every((r) => r.initial?.balls?.length === 1))) INVALID('fixture shape: 91 records of one ball each and 91 main entries required');
  // case 1's reference: main_rev's pinned declarations under this engine
  const mr = mainReference(JSON.parse(raw.mainref), fx);
  if (mr.why) INVALID(`case 1 reference: ${mr.why}`);
  const mainRef = mr.ref ?? [];
  const storedEq = mainRef.filter((m, j) => pvaEq(m, mainOut[j])).length;
  P(`case 1 reference main ${fx.main_rev.slice(0, 8)} povAnchors under this engine (node ${process.version} ${process.arch}); stored fixture "main" equal to it ${storedEq} of ${recs.length} (information, not scored: presentation math may differ by 1 ulp across CPU architectures)`);
  const planted = JSON.parse(raw.mainref);
  const pinText = planted.slices?.povAnchors?.text ?? '';
  if (count(pinText, '1.05 * dx') !== 1) INVALID('case 1 reference pin arm: the anchor "1.05 * dx" must occur once in the pinned povAnchors');
  else {
    planted.slices.povAnchors.text = pinText.replace('1.05 * dx', '1.06 * dx');
    const pr = mainReference(planted, fx);
    P(`case 1 reference pin arm (one planted byte in the pinned povAnchors): ${pr.why ? `refused (${pr.why.split(' != ')[0]})` : 'NOT refused'}`);
    if (!pr.why) FAIL('case 1 reference pin arm: a planted slice byte must be refused');
  }
  const app = readAppFiles(APP);
  P(`web/app .js files ${app.files.length} (symbolic links skipped ${app.links}); acorn ${acorn.version}; leaf exports ${JSON.stringify(Object.keys(leaf).sort())}`);

  // ---- leaf anchors (plan C1 item 3 r9, section 3.4 r10), before the case lines
  const lc = Object.fromEntries(Object.entries(ANCHORS).map(([k, a]) => [k, count(raw.leaf, a)]));
  const iAddr = raw.leaf.indexOf('const addr = (h) =>'), iRise = raw.leaf.indexOf('const rise = (h) =>'), iGate = raw.leaf.indexOf(ANCHORS.gate);
  const order = count(raw.leaf, 'const addr = (h) =>') === 1 && count(raw.leaf, 'const rise = (h) =>') === 1 && lc.gate === 1 && iAddr < iGate && iRise < iGate;
  console.log(`leaf anchors: gate=${lc.gate} ok=${lc.ok} pose=${lc.pose} standh=${lc.standh} order=${order ? 'yes' : 'no'}`);
  if (!(lc.gate === 1 && lc.ok === 1 && lc.pose === 1 && lc.standh === 1 && order)) FAIL('leaf anchors: every count must be 1 and order=yes (plan C1 item 3)');

  // ---- case 1: identity (card:3424-3429, card:3255-3260)
  let slices = null;
  const cells2 = buildCells(THETA_ID, recs);
  await runCase(1, async () => {
    slices = readCase1Slices(raw.playback);
    P(`case 1 slices (AST, whole declaration): ${CASE1_FNS.map((n) => `${n} playback.js:${slices[n].line}`).join(', ')}`);
    const a = check1(slices, { povLeaf: leaf }, recs, mainRef);
    const staleLiftH = () => 0.36; // a stale leaf: liftH present, povPose absent (x6-race-latch.mjs:155-156)
    const nl = check1(slices, { povLeaf: null }, recs, mainRef), st = check1(slices, { povLeaf: { liftH: staleLiftH } }, recs, mainRef);
    const c2 = check2(leaf, cells2);
    P(`case 1 check 1: equal to main ${fx.main_rev.slice(0, 8)} povAnchors under this engine ${pv(a.eq, PRED.check1)} of ${recs.length}; first mismatch ${a.first}`);
    P(`case 1 R7 (b): pb = { povLeaf: null } non-null ${pv(nl.nonNull, PRED.nullLatch)} of ${recs.length}; pb = { povLeaf: { liftH } } non-null ${pv(st.nonNull, PRED.stale)} of ${recs.length}`);
    P(`case 1 check 2: theta ${JSON.stringify(THETA_ID)}; cells ${pv(cells2.length, PRED.check2Cells)}; failing ${pv(c2.fail, PRED.check2)}; fields ${JSON.stringify(c2.fields)}`);
    if (cells2.length !== 960) INVALID('case 1 check 2 grid is not 960 cells');
    const ok = a.eq === recs.length && nl.nonNull === 0 && st.nonNull === 0 && c2.fail === 0;
    P(`case 1 ${ok ? 'GREEN' : 'RED'}`);
    if (!ok) FAIL('case 1');
  });

  // ---- the grid (card:3413-3421) and the leaf pass that feeds cases 2-5, 7 and 8
  const ftAt = raw.cuepost.indexOf(FT_LAW), ftCount = count(raw.cuepost, FT_LAW);
  P(`grid follow-through law: cuepost.js text fence count ${ftCount}${ftCount === 1 ? ` at :${lineAt(raw.cuepost, ftAt)}-${lineAt(raw.cuepost, ftAt) + 4}` : ''} (${ftCount === 1 ? 'GREEN' : 'RED'})`);
  if (ftCount !== 1) FAIL('grid follow-through law fence: cuepost.js:272-276 must occur exactly once (plan OQ-19)');
  const cells = buildCells(THETA_GRID, recs);
  P(`grid cells ${pv(cells.length, PRED.cells)}`);
  if (cells.length !== 216120) INVALID('grid is not the card\'s 216120 cells');
  const rL = runGrid(leaf, cells);
  P(`grid pass leaf: null ${rL.nul}; throw ${rL.thr}${rL.firstThrow ? ` (${rL.firstThrow})` : ''}; wrong shape ${rL.shape}; sha256 ${sha(bytesOf(rL))}`);
  P(`grid pass wall=${rL.wall.toFixed(1)}s`);

  // The fired count has one source: the test's world-frame routine at the
  // shipped eye (plan C5 r5); case 9's arms take it from here alone. The
  // unplanted leaf's count (cells where its addrCam height moved) is the
  // cross-check, read per cell in two directions. A = fired cells where
  // the leaf's height did not move (no pose, or ORACLE's height by
  // Object.is): a mismatch, INVALID as plan C5 r5 rules. B = identity
  // cells where the leaf eye differs from the shipped eye (ORACLE's
  // addrCam, Object.is per component): GH-911 addendum A4 (ASK-4 (c))
  // makes that moved identity eye a counted case 4 failure (the identity
  // clause), not INVALID. B must equal case 4's identity count, else
  // INVALID: the two are computed apart, and a difference is a test fault.
  const fired = new Uint8Array(cells.length);
  let nFired = 0, nLeafFired = 0, nA = 0, nB = 0;
  const tF = performance.now();
  {
    for (let i = 0; i < cells.length; i++) {
      const { ball, phi, rod } = cells[i];
      const o = ORACLE(ball.state.pos, phi), k = i * W + OFF.addrCam;
      if (clearance(o.addrCam, rodWorld(ball.state.pos, phi, ball.params.r, rod)) < C) { fired[i] = 1; nFired++; }
      const lf = rL.status[i] === 0 && !Object.is(rL.buf[k + 2], o.addrCam[2]);
      if (lf) nLeafFired++;
      if (fired[i] && !lf) nA++;
      if (!fired[i] && rL.status[i] === 0
        && !(Object.is(rL.buf[k], o.addrCam[0]) && Object.is(rL.buf[k + 1], o.addrCam[1]) && Object.is(rL.buf[k + 2], o.addrCam[2]))) nB++;
    }
  }
  P(`fired (world frame, shipped eye clearance below C) ${pv(nFired, PRED.fired)}; identity ${cells.length - nFired}; cross-check: unplanted leaf's addrCam height moved on ${nLeafFired} cells; A (fired, leaf height not moved; INVALID above 0) ${nA}; B (identity, leaf eye differs from the shipped eye; judged by case 4) ${nB}`);
  P(`fired count wall=${((performance.now() - tF) / 1000).toFixed(1)}s`);
  if (nA !== 0) INVALID('fired count cross-check: the world-frame count and the unplanted leaf\'s count differ (a fired cell where the leaf\'s addrCam height did not move)');
  let c4L = null;

  await runCase(2, async () => {
    const c = judgeC2(rL, cells, fired);
    P(`case 2 clearance >= C: failing ${pv(c.fail, PRED.c2)} of ${cells.length} (fired ${c.fF}, identity ${c.fI}); min clearance ${c.min.toFixed(9)} m`);
    P(`case 2 ${c.fail === 0 ? 'GREEN' : 'RED'}`);
    if (c.fail !== 0) FAIL('case 2');
  });
  await runCase(3, async () => {
    const c = judgeC3(rL, cells, fired);
    P(`case 3 401-point lerp >= C_frame: failing ${pv(c.fail, PRED.c3)} of ${cells.length} (fired ${c.fF}, identity ${c.fI}); min ${c.min.toFixed(9)} m`);
    P(`case 3 ${c.fail === 0 ? 'GREEN' : 'RED'}`);
    if (c.fail !== 0) FAIL('case 3');
  });
  await runCase(4, async () => {
    const c = (c4L = judgeC4(rL, cells, fired));
    const n = c.failPerp + c.failH + c.failId;
    P(`case 4 h_perp > 0 on fired cells: failing ${c.failPerp} of ${nFired}, min ${c.minPerp.toFixed(9)} m; addrCam height < standCam height: failing ${c.failH} of ${cells.length}; identity cells whose addrCam differs from the shipped eye (ORACLE, Object.is per component): failing ${pv(c.failId, PRED.c4id)} of ${cells.length - nFired}; total failing ${pv(n, PRED.c4)}; identity cells with h_perp <= 0 (h_perp not judged there) ${c.idBelow}`);
    P(`case 4 ${n === 0 ? 'GREEN' : 'RED'}`);
    if (n !== 0) FAIL('case 4');
  });
  // B against case 4's identity clause (see the fired count above).
  P(`fired count cross-check: B ${nB}, case 4 identity clause failing ${c4L ? c4L.failId : 'not judged'} (required equal)`);
  if (c4L?.failId !== nB) INVALID(c4L ? 'fired count cross-check: B differs from case 4\'s identity count (the cross-check and case 4 disagree)' : 'fired count cross-check: case 4 returned nothing, B not judged');
  await runCase(5, async () => {
    const fov = readPovFov(raw.playback);
    const c = judgeC5(rL, cells, fov);
    P(`case 5 POV_FOV ${fov} (AST); |NDC| <= 0.7: failing ${pv(c.fail, PRED.c5)} of ${cells.length}; max |x| ${c.maxX.toExponential(3)}; max |y| ${c.maxY.toFixed(6)}`);
    P(`case 5 ${c.fail === 0 ? 'GREEN' : 'RED'}`);
    if (c.fail !== 0) FAIL('case 5');
  });
  await runCase(6, async () => {
    const START = 'export const CUE_ENVELOPE = Object.freeze({';
    const n = count(raw.cuelooks, START);
    if (n !== 1) throw new Error(`cuelooks.js: ${n} lines "${START}" (exactly one required)`);
    const i0 = raw.cuelooks.indexOf(START), i1 = raw.cuelooks.indexOf('});', i0);
    const env = {};
    for (const l of raw.cuelooks.slice(i0, i1).split('\n').slice(1)) { const m = l.match(/^\s*([A-Z_]+):\s*([0-9.eE+-]+),/); if (m) env[m[1]] = Number(m[2]); }
    const mir = leaf.CUE_ENVELOPE_MIRROR ?? {};
    const ok = Object.keys(mir).length > 0 && Object.entries(mir).every(([k, v]) => Object.is(env[k], v));
    P(`case 6 CUE_ENVELOPE (cuelooks.js:${lineAt(raw.cuelooks, i0)}-${lineAt(raw.cuelooks, i1)}) ${JSON.stringify(env)}; leaf mirror ${JSON.stringify(mir)} (frozen ${Object.isFrozen(mir)}); equal ${ok ? 'yes' : 'no'}`);
    P(`case 6 ${ok ? 'GREEN' : 'RED'}`);
    if (!ok) FAIL('case 6');
  });
  await runCase(7, async () => {
    const leaf2 = await import(new URL('../app/povpose.js?instance=2', import.meta.url).href);
    const r2 = runGrid(leaf2, cells);
    const eq = bytesOf(rL).equals(bytesOf(r2));
    const tokens = (raw.leaf.match(/\bMath\.random\b/g) ?? []).length + (raw.leaf.match(/\bDate\b/g) ?? []).length;
    P(`case 7 second instance (?instance=2, ${r2.wall.toFixed(1)}s) sha256 ${sha(bytesOf(r2))}; equal bytes ${eq ? 'yes' : 'no'}; Math.random and Date tokens in the leaf ${pv(tokens, PRED.tokens)}`);
    P(`case 7 ${eq && tokens === 0 ? 'GREEN' : 'RED'}`);
    if (!(eq && tokens === 0)) FAIL('case 7');
  });
  await runCase(8, async () => {
    const c = judgeC8(rL, cells);
    P(`case 8 every field but addrCam[2] equals ORACLE: failing ${pv(c.fail, PRED.c8)} of ${cells.length}; fields ${JSON.stringify(c.fields)}`);
    P(`case 8 ${c.fail === 0 ? 'GREEN' : 'RED'}`);
    if (c.fail !== 0) FAIL('case 8');
  });

  // ---- case 9: red arms on a copy of the leaf (card:3494-3528; plan C5 rule)
  let armsRed = 0;
  await runCase(9, async () => {
    const leafLines = raw.leaf.split('\n');
    P(`case 9 fired ${nFired} (source: this test's world-frame routine); unplanted leaf in this run ${nLeafFired} (cross-check, equal ${nLeafFired === nFired ? 'yes' : 'no'}; A ${nA}, B ${nB})`);
    for (const A of ARMS) {
      const tag = `case 9 arm ${A.arm} ${A.id} ${A.what}`;
      const n = count(raw.leaf, A.anchor);
      if (n !== 1) { INVALID(`${tag}: EDIT FAIL, anchor count ${n}`); continue; }
      const text = raw.leaf.replace(A.anchor, () => A.repl);
      const changed = text.split('\n').filter((l, k) => l !== leafLines[k]).length;
      if (changed !== 1) { INVALID(`${tag}: the copy differs from the leaf on ${changed} lines, not 1`); continue; }
      const M = await importText(text);
      const r = runGrid(M, cells);
      P(`${tag}: anchor count 1; lines changed 1; copy loaded from a data: URL; pass ${r.wall.toFixed(1)}s; null ${r.nul}; throw ${r.thr}`);
      if (nFired === 0) { INVALID(`${tag}: fired 0`); continue; }
      let red = false, failing = 0;
      if (A.id === 'PL-3') {
        const c3 = judgeC3(r, cells, fired), c2 = judgeC2(r, cells, fired);
        failing = c3.fail;
        red = c3.fail > 0 && c2.fail === 0;
        P(`${tag}: case 3 failing ${pv(c3.fail, PRED.armI_c3)}, min ${c3.min.toFixed(9)} m; case 2 failing ${pv(c2.fail, PRED.armI_c2)}; rule case 3 > 0 and case 2 = 0: ${red ? 'met' : 'not met'}`);
      } else if (A.id === 'PL-1') {
        const c2 = judgeC2(r, cells, fired), c3 = judgeC3(r, cells, fired);
        failing = c2.fail;
        red = c2.fail === nFired;
        P(`${tag}: case 2 failing ${pv(c2.fail, PRED.armII_c2)}; fired ${nFired}; case 3 failing ${pv(c3.fail, PRED.armII_c3)}; rule case 2 failing = fired: ${red ? 'met' : 'not met'}`);
      } else {
        const c8 = judgeC8(r, cells);
        failing = c8.fail;
        red = c8.fail === cells.length && JSON.stringify(c8.fields) === '["standCam[2]"]';
        P(`${tag}: case 8 failing ${pv(c8.fail, PRED.armIII_c8)} of ${cells.length}; fields ${JSON.stringify(c8.fields)}; rule every cell, standCam[2] only: ${red ? 'met' : 'not met'}`);
        if (slices) {
          const k1 = check1(slices, { povLeaf: M }, recs, mainRef), k2 = check2(M, cells2);
          P(`${tag}: case 1 check 1 equal ${pv(k1.eq, PRED.armIII_check1)} of ${recs.length} (first mismatch ${k1.first}); check 2 failing ${pv(k2.fail, PRED.armIII_check2)} of ${cells2.length}, fields ${JSON.stringify(k2.fields)} (printed, not part of the rule)`);
        } else P(`${tag}: case 1 checks not run (case 1's reader did not return slices)`);
      }
      if (failing === 0) { INVALID(`${tag}: 0 failing cells`); continue; }
      P(`${tag}: ${red ? 'RED as required' : 'NOT RED as required'}`);
      if (red) armsRed++; else FAIL(`${tag}: not red as required`);
    }
    P(`case 9 arms RED as required ${armsRed} of ${ARMS.length}`);
  });

  // ---- case 10: F1-F7 (card:3529-3736; plan section 3.5)
  await runCase(10, async () => {
    const pbS = strippedText(raw.playback), pbB = blankText(pbS);
    const shape = (a, b) => { if (a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if ((a.charCodeAt(i) === 10) !== (b.charCodeAt(i) === 10)) return false; return true; };
    const shapeOk = shape(raw.playback, pbS) && shape(pbS, pbB);
    P(`case 10 stripped text and BLANK keep playback.js's length and newlines: ${shapeOk ? 'yes' : 'no'}`);
    const F1n = count(raw.playback, SIG);
    const f23 = readF2F3(raw.playback);
    const F4n = (raw.playback.match(/\bstandCam\s*[:=](?!=)/g) ?? []).length, F5n = (raw.leaf.match(/\bstandCam\s*[:=](?!=)/g) ?? []).length;
    const f6 = readF6(raw.playback);
    const others = app.files.filter((f) => f.rel !== 'playback.js');
    const f6b = readF6b(others);
    const f7 = fenceF7(pbS, pbB);
    const g = (b) => (b ? 'GREEN' : 'RED');
    const F = { F1: F1n === 1, F2: f23.F2, F3: f23.F3, F4: F4n === 0, F5: F5n === 1, F6: f6.ok, F6b: f6b.ok, F7a: f7.F7a, F7b: f7.F7b, F7c: f7.F7c };
    P(`case 10 F1 ${g(F.F1)}: raw count of "${SIG}" ${F1n}`);
    P(`case 10 F2 ${g(F.F2)}, F3 ${g(F.F3)}: povAnchors body (AST range, stripped text) names povPose ${f23.F2 ? 'yes' : 'no'}; numeric literals ${JSON.stringify(f23.nums)}${f23.error ? `; error ${f23.error}` : ''}`);
    P(`case 10 F4 ${g(F.F4)}: standCam definitions in playback.js ${F4n}; F5 ${g(F.F5)}: in povpose.js ${F5n}`);
    P(`case 10 F6 ${g(F.F6)}: static forms naming povpose.js ${f6.static}; import('./povpose.js') ${f6.dyn}${f6.sites.map((s) => ` at :${s.line} in .then(...).catch(...) ${s.chained ? 'yes' : 'no'}`).join('')}${f6.error ? `; parse error ${f6.error}` : ''}`);
    P(`case 10 F6b ${g(F.F6b)}: other web/app .js files ${f6b.files}; with a static form naming povpose.js or a parse error ${f6b.bad.length}${f6b.bad.length ? ` ${JSON.stringify(f6b.bad)}` : ''}`);
    P(`case 10 F7a ${g(F.F7a)}: X ${f7.X}; povAnchors body${f7.bodyLines ? ` :${f7.bodyLines[0]}-${f7.bodyLines[1]}` : ' not found'} reads pb?.povLeaf ${f7.readsLatch ? 'yes' : 'no'}, names X ${f7.readsBinding ? 'yes' : 'no'}`);
    P(`case 10 F7b ${g(F.F7b)}: pb = { literals ${f7.lits}; accepted pb = null ${f7.nulls}; other pb = ${f7.other.length}${f7.other.length ? ` ${f7.other.join(' ')}` : ''}`);
    P(`case 10 F7c ${g(F.F7c)}: povLeaf raw ${f7.raw}, after DEC ${f7.dec} (required ${F7C_EXPECT}); at the literal's top-level key ${f7.keyAt}; at povAnchors's read ${f7.readAt}${f7.stray.length ? `; other ${f7.stray.join(' ')}` : ''}`);
    const red = Object.entries(F).filter(([, v]) => !v).map(([k]) => k);
    const ok = shapeOk && red.length === 0;
    P(`case 10 ${ok ? 'GREEN F1-F7' : `RED ${red.join(', ')}${shapeOk ? '' : ' (shape)'}`}`);
    if (!ok) FAIL('case 10');
  });

  P(`total wall=${((performance.now() - T0) / 1000).toFixed(1)}s`);
  if (invalids.length) { P(`verdict INVALID (${invalids.length}): ${invalids.join('; ')}`); return 2; }
  if (fails.length) { P(`verdict FAIL (${fails.length}): ${fails.join('; ')}`); return 1; }
  if (armsRed !== ARMS.length) { P(`verdict FAIL: arms RED as required ${armsRed} of ${ARMS.length}`); return 1; }
  P('cases 1-10 GREEN; arms 3 of 3 RED as required; ARMED');
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let rc;
  try { rc = await main(); } catch (e) { console.log(`[test-povpose] ERROR ${e?.stack ?? e}`); rc = 1; }
  process.exitCode = rc;
}
