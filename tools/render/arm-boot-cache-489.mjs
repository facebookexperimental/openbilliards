#!/usr/bin/env node

// Copyright (c) Meta Platforms, Inc. and affiliates.

// arm-boot-cache-489.mjs — GH-489 #637 landing (ORDER-SNOOKER-637-LAND-17 class BC, review 775r4 P1; re-cut LAND-18 class BCA): the
// boot-cache rule (the ownership ledger (internal):42-53) for the framestep.js edge. A returning user's browser can pair a revalidated importer
// with a heuristically-fresh STALE framestep.js; a NEW name imported by name across that edge dies as a SyntaxError before any handler
// exists. LAND-16 added `sinkCompletionSec`; LAND-17 BC reaches it at every site through `import * as framestepNs` + feature detection
// (`framestepNs.sinkCompletionSec?.(…)`, or game.js's `framestepNs.sinkCompletionSec ? … : <degrade>`) with a site-specific degrade.
//
// LAND-18 BCA (review 775r5): the LAND-17 arm enumerated imports with a regex stripper and STUBBED every non-framestep specifier, so a
// re-export route through a third module (coords.js `export { sinkCompletionSec } from './framestep.js'` + main.js importing the alias
// from './coords.js') linked ARMED although the real graph dies; and its root `new vm.SourceTextModule` sat outside the try, so an
// importer that failed to PARSE crashed the arm with a stack and no verdict line. This cut:
//   - enumerates module requests with the vendored acorn 8.17.0 (tools/render/lib/vendor/acorn — ImportDeclaration and
//     ExportNamedDeclaration / ExportAllDeclaration WITH a source; never a regex);
//   - builds ONE module graph per importer (a fresh module cache per graph, so one failure never cascades into
//     'Module status must be unlinked'): every relative specifier (`./x.js`, `../scene/*.js`, `../vendor/*`) is loaded REAL from disk,
//     resolved relative to the importing file and linked recursively; every edge that resolves to web/app/framestep.js, at any depth,
//     is served the STALE leaf (`--stale <file>`, or `git show 4beb17bf:web/app/framestep.js`); ONLY the bare specifier `three` and
//     the specifiers that resolve under web/dist/ are STUBBED per edge (a synthetic module exporting exactly the names that edge
//     imports, plus a default) — the distinct ../dist/* specifiers found are printed (six expected; a different count is printed,
//     not judged);
//   - LINKS only (`await mod.link(linker)`; the app is never evaluated). Node reports a missing named export at LINK time as
//     `SyntaxError: The requested module './framestep.js' does not provide an export named '…'` — measured (vm-link-exp.mjs);
//   - wraps EVERY `new vm.SourceTextModule(...)` and every acorn parse in try/catch: a parse failure prints ONE line
//     `[boot-cache-arm] NOT ARMED — importer web/app/<file> failed to parse: <message>` (or `… module web/<rel> (imported by
//     web/<rel>) failed to parse: <message>`) and exits 1 — never a stack.
// Cells:
//   1-5  each importer (game.js, main.js, export.js, offline-render.js, playback.js) LINKS against the stale framestep.js through its
//        real graph — `linked N modules (stubbed: three ×k, ../dist/* ×m)`;
//   6    the degrade on the export estimate's OWN expression: the `framestepNs.sinkCompletionSec?.(…) ?? …` node is extracted from
//        export.js's AST and evaluated against the stale namespace with sink entries that WOULD extend → no extension (the plan falls
//        back to the duration); the fresh leaf extends it (export.js itself cannot evaluate in node — the extracted expression is the
//        subject, stated as such);
//   7    the textual census (acorn AST over web/app/*.js): every CALL of `<ns>.sinkCompletionSec` on the namespace binding that file
//        declares with `import * as <ns> from './framestep.js'` is feature-detected — an optional call (`?.(`), or a bare call in the
//        CONSEQUENT of a ConditionalExpression / IfStatement whose TEST is the truthiness of the SAME member; a bare call outside such
//        a test → NOT ARMED('feature detection dropped at <file>:<line>'); counts are measured, never hardcoded; LAND-19 PMB4: dynamic
//        `import('./framestep.js')` destructures and namespace-like locals are censused too (an unguarded call → 'feature detection dropped
//        (dynamic) at <file>:<line>'), and a link that dies through an `export *` route names the culprit module's star edge;
//   8    PLANT A (a scratch overlay, never the tree): main.js's namespace import replaced by the named import
//        (`import { sinkCompletionSec } from './framestep.js'`) → the link must die by name;
//   9    PLANT B (a SEPARATE scratch overlay): the re-export route — coords.js gains `export { sinkCompletionSec } from './framestep.js'`
//        and main.js imports the alias from './coords.js' → the link must die by the same name (the LAND-17 arm passed this).
// exit 0 = ARMED; 1 = NOT ARMED; 2 = REFUSED.
//   node --experimental-vm-modules tools/render/arm-boot-cache-489.mjs [--root <repo root> | --web <web dir>] [--stale <framestep.js file>]
//                                                                     [--scratch <dir for the plant overlays>] [--json <out>]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { parseArgv: __parseArgv } = await import('./lib/argv.mjs');
const __P = __parseArgv({ tag: 'boot-cache-arm', value: ['--web', '--root', '--stale', '--json', '--scratch'], bool: [] });
// the vendored acorn is imported AFTER the argv parse: the parse-first fence judges a static import's module body as a pre-parse sibling
// (acorn's own `new TokenType(` is not an allowlisted constructor); a dynamic import after the parse is an effect in its proper place
const acorn = await import('./lib/vendor/acorn/acorn.mjs');
const TAG = '[boot-cache-arm]';
const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT_OPT = __P.value('--root'); const WEB_OPT = __P.value('--web');
const WEB = path.resolve(WEB_OPT ?? (ROOT_OPT ? path.join(ROOT_OPT, 'web') : path.join(here, '..', '..', 'web')));
const ROOT = path.resolve(ROOT_OPT ?? path.join(WEB, '..'));
const JSON_OUT = __P.value('--json') ?? null;
const SCRATCH_OPT = __P.value('--scratch') ?? null;
const STALE_REV = '4beb17bf';
const NEW_NAME = 'sinkCompletionSec';
const LEAF_REL = 'app/framestep.js';
const LEAF = path.join(WEB, LEAF_REL);
const DIST_DIR = path.join(WEB, 'dist');
const IMPORTERS = ['app/game.js', 'app/main.js', 'app/export.js', 'app/offline-render.js', 'app/playback.js'];
const refuse = (msg) => { console.error(`${TAG} REFUSED — ${msg}`); process.exit(2); };
if (typeof vm.SourceTextModule !== 'function') refuse('run with node --experimental-vm-modules (vm.SourceTextModule unavailable)');
for (const f of IMPORTERS) if (!fs.existsSync(path.join(WEB, f))) refuse(`${WEB}/${f} missing`);
if (!fs.existsSync(LEAF)) refuse(`${LEAF} missing`);
// the STALE leaf: the pre-LAND-16 blob (or --stale <file>)
let staleSrc; let staleFrom;
if (__P.value('--stale')) { staleFrom = path.resolve(__P.value('--stale')); try { staleSrc = fs.readFileSync(staleFrom, 'utf8'); } catch (e) { refuse(`--stale ${staleFrom}: ${e.message}`); } }
else {
  staleFrom = `git -C ${ROOT} show ${STALE_REV}:web/app/framestep.js`;
  try { staleSrc = execFileSync('git', ['-C', ROOT, 'show', `${STALE_REV}:web/app/framestep.js`], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { refuse(`cannot read ${STALE_REV}:web/app/framestep.js from ${ROOT} (pass --stale <file>): ${(e.stderr || e.message || '').toString().trim().split('\n')[0]}`); }
}
const PARSE_OPTS = { ecmaVersion: 'latest', sourceType: 'module', locations: true };
const parseModule = (src) => acorn.parse(src, PARSE_OPTS);
let staleAst; try { staleAst = parseModule(staleSrc); } catch (e) { refuse(`the stale leaf (${staleFrom}) does not parse: ${e.message}`); }
const exportsOf = (ast) => { const out = new Set(); for (const n of ast.body) { if (n.type === 'ExportNamedDeclaration') { if (n.declaration) { if (n.declaration.declarations) for (const d of n.declaration.declarations) { if (d.id.type === 'Identifier') out.add(d.id.name); } else if (n.declaration.id) out.add(n.declaration.id.name); } for (const s of n.specifiers) out.add(s.exported.type === 'Identifier' ? s.exported.name : String(s.exported.value)); } else if (n.type === 'ExportDefaultDeclaration') out.add('default'); } return out; };
if (exportsOf(staleAst).has(NEW_NAME)) refuse(`the stale leaf (${staleFrom}) already exports ${NEW_NAME} (not a pre-LAND-16 blob)`);

// ---------------------------------------------------------------------------------------------------------------------------------
// module requests (acorn): [{ spec, kind, names: Set<imported name>, def, ns, nsLocal, star, line, node }]
const nameOf = (id) => (id.type === 'Identifier' ? id.name : String(id.value));
function requestsOf(ast) {
  const out = [];
  for (const n of ast.body) {
    if (n.type === 'ImportDeclaration') {
      const r = { spec: n.source.value, kind: 'import', names: new Set(), def: false, ns: false, nsLocal: null, star: false, line: n.loc.start.line, node: n };
      for (const s of n.specifiers) {
        if (s.type === 'ImportDefaultSpecifier') r.def = true;
        else if (s.type === 'ImportNamespaceSpecifier') { r.ns = true; r.nsLocal = s.local.name; }
        else { const nm = nameOf(s.imported); if (nm === 'default') r.def = true; else r.names.add(nm); }
      }
      out.push(r);
    } else if (n.type === 'ExportNamedDeclaration' && n.source) {
      const r = { spec: n.source.value, kind: 're-export', names: new Set(), def: false, ns: false, nsLocal: null, star: false, line: n.loc.start.line, node: n };
      for (const s of n.specifiers) { const nm = nameOf(s.local); if (nm === 'default') r.def = true; else r.names.add(nm); }
      out.push(r);
    } else if (n.type === 'ExportAllDeclaration' && n.source) {
      out.push({ spec: n.source.value, kind: 'export-all', names: new Set(), def: false, ns: false, nsLocal: null, star: true, line: n.loc.start.line, node: n });
    }
  }
  return out;
}
const isInside = (abs, dir) => { const rel = path.relative(dir, abs); return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel); };
/** where a specifier of the module at `fromAbs` leads: stale (the framestep leaf) | three | dist | real (loaded from disk) | unknown */
function classify(spec, fromAbs) {
  if (spec === 'three') return { kind: 'three' };
  if (!spec.startsWith('./') && !spec.startsWith('../')) return { kind: 'unknown' };
  const abs = path.resolve(path.dirname(fromAbs), spec);
  if (abs === LEAF) return { kind: 'stale', abs };
  if (isInside(abs, DIST_DIR)) return { kind: 'dist', abs };
  return { kind: 'real', abs };
}
class ParseFailure extends Error { constructor(rel, importerRel, message) { super(message); this.rel = rel; this.importerRel = importerRel; } }
const parseFailureLine = (pf) => (pf.importerRel == null
  ? `importer web/${pf.rel} failed to parse: ${pf.message}`
  : `module web/${pf.rel} (imported by web/${pf.importerRel}) failed to parse: ${pf.message}`);
/** read + parse + compile ONE module (never evaluated); throws ParseFailure (acorn or V8) or a plain Error (unreadable). */
function compileModule(abs, rel, src, importerRel, identifier) {
  let ast; try { ast = parseModule(src); } catch (e) { throw new ParseFailure(rel, importerRel, e.message); }
  let mod; try { mod = new vm.SourceTextModule(src, { identifier }); } catch (e) { throw new ParseFailure(rel, importerRel, `${e.constructor?.name ?? 'Error'}: ${e.message}`); }
  return { abs, rel, src, ast, reqs: requestsOf(ast), mod };
}
/**
 * Build and LINK the module graph rooted at web/<rootRel>: a fresh module cache per call; real modules from disk (an `overlay` dir
 * mirroring web/ shadows the tree's files — the plant scratch copies); the leaf served stale on every edge; `three` and web/dist/*
 * stubbed per edge. Returns { ok, error?, parseFailure?, modules (real modules + the stale leaf; stubs not counted), three, dist,
 * distSpecs: Set, leafNamed: [names the ROOT imports by name from the leaf], culprit? }.
 */
async function linkGraph(rootRel, { overlay = null } = {}) {
  const cache = new Map(); // abs → entry
  const byMod = new Map(); // vm module → entry
  const stats = { modules: 0, three: 0, dist: 0, distSpecs: new Set() };
  const readSrc = (abs) => {
    if (overlay) { const o = path.join(overlay, path.relative(WEB, abs)); if (fs.existsSync(o)) return fs.readFileSync(o, 'utf8'); }
    return fs.readFileSync(abs, 'utf8');
  };
  const load = (abs, importerRel) => {
    if (cache.has(abs)) return cache.get(abs);
    const rel = path.relative(WEB, abs);
    let src; try { src = readSrc(abs); } catch (e) { throw new Error(`cannot read web/${rel}${importerRel == null ? '' : ` (imported by web/${importerRel})`}: ${e.message}`); }
    const entry = compileModule(abs, rel, src, importerRel, `web/${rel}`);
    cache.set(abs, entry); byMod.set(entry.mod, entry); stats.modules++;
    return entry;
  };
  let staleEntry = null;
  const stubFor = (from, spec) => {
    const reqs = from.reqs.filter((r) => r.spec === spec);
    const names = new Set(reqs.flatMap((r) => [...r.names])); const def = reqs.some((r) => r.def);
    const lines = []; let i = 0;
    for (const n of names) { lines.push(`const __s${i} = undefined; export { __s${i} as ${JSON.stringify(n)} };`); i++; }
    if (def) lines.push('export default undefined;');
    try { return new vm.SourceTextModule(lines.join('\n'), { identifier: `stub:${spec} (for web/${from.rel})` }); }
    catch (e) { throw new Error(`stub for '${spec}' (web/${from.rel}) failed to compile: ${e.message}`); }
  };
  const linker = async (spec, referencing) => {
    const from = byMod.get(referencing);
    if (!from) throw new Error(`linker: unknown referencing module for '${spec}'`);
    const cls = classify(spec, from.abs);
    if (cls.kind === 'stale') {
      if (!staleEntry) { staleEntry = compileModule(LEAF, LEAF_REL, staleSrc, from.rel, `web/${LEAF_REL} (STALE ${STALE_REV})`); byMod.set(staleEntry.mod, staleEntry); stats.modules++; }
      return staleEntry.mod;
    }
    if (cls.kind === 'three') { stats.three++; return stubFor(from, spec); }
    if (cls.kind === 'dist') { stats.dist++; stats.distSpecs.add(spec); return stubFor(from, spec); }
    if (cls.kind === 'real') return load(cls.abs, from.rel).mod;
    throw new Error(`unexpected specifier '${spec}' in web/${from.rel} (the arm knows './…', '../…', 'three' and web/dist/*)`);
  };
  const out = { ok: false, ...stats, distSpecs: stats.distSpecs, leafNamed: [] };
  try {
    const root = load(path.join(WEB, rootRel), null);
    out.leafNamed = root.reqs.filter((r) => classify(r.spec, root.abs).kind === 'stale').flatMap((r) => [...r.names]);
    await root.mod.link(linker);
    Object.assign(out, stats, { ok: true, status: root.mod.status });
  } catch (e) {
    Object.assign(out, stats);
    if (e instanceof ParseFailure) { out.parseFailure = e; out.error = `${overlay ? 'plant overlay: ' : ''}${parseFailureLine(e)}`; }
    else {
      out.error = `${e?.constructor?.name ?? 'Error'}: ${e?.message ?? String(e)}`;
      // locate the edge that names a missing leaf export (V8 names the specifier, not the module): any module in the graph whose
      // import / re-export of the leaf carries the name
      const m = /does not provide an export named '([^']+)'/.exec(out.error); const viaMod = /The requested module '([^']+)'/.exec(out.error);
      if (m) {
        const hits = [];
        for (const en of cache.values()) for (const r of en.reqs) if (r.names.has(m[1]) && classify(r.spec, en.abs).kind === 'stale') hits.push(`web/${en.rel}:${r.line} (${r.kind} '${r.spec}')`);
        // LAND-19 PMB4: the export-all route — the module V8 names re-exports the LEAF with `export *`, so the missing name is the leaf's
        if (viaMod) { const base = path.basename(viaMod[1]); for (const en of cache.values()) if (path.basename(en.rel) === base) for (const r of en.reqs) if (r.star && classify(r.spec, en.abs).kind === 'stale') hits.push(`web/${en.rel}:${r.line} (export-all '${r.spec}' — the star route re-exports the stale leaf, so '${m[1]}' is missing from '${viaMod[1]}')`); }
        if (hits.length) out.culprit = hits.join(', ');
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------------------
const cells = []; const reasons = []; let armed = true;
function cell(name, ok, detail, reason) {
  cells.push({ n: cells.length + 1, name, ok, detail });
  armed = armed && ok; if (!ok) reasons.push(reason ?? `${name}: ${detail}`);
  console.log(`${TAG} cell ${cells.length}: ${name} — ${ok ? 'as required' : 'NOT as required'} — ${detail}`);
}
const fatal = (line) => {
  if (JSON_OUT) { try { fs.mkdirSync(path.dirname(JSON_OUT), { recursive: true }); fs.writeFileSync(JSON_OUT, JSON.stringify({ tool: 'arm-boot-cache-489', web: WEB, root: ROOT, stale: staleFrom, cells, armed: false, fatal: line }, null, 1)); } catch {} }
  console.log(`${TAG} NOT ARMED — ${line}`); process.exit(1);
};

// pre-pass: every importer must PARSE (acorn + V8) before any graph is built — an importer's own parse failure is named as such
const importerSrc = new Map();
for (const f of IMPORTERS) {
  const abs = path.join(WEB, f); const src = fs.readFileSync(abs, 'utf8');
  try { compileModule(abs, f, src, null, `web/${f}`); } catch (e) { if (e instanceof ParseFailure) fatal(parseFailureLine(e)); fatal(`importer web/${f}: ${e.message}`); }
  importerSrc.set(f, src);
}

// cells 1-5: each importer's REAL graph links against the stale leaf
const linkResults = {}; const distSpecsAll = new Set();
for (const f of IMPORTERS) {
  const r = await linkGraph(f);
  linkResults[f] = r; for (const s of r.distSpecs) distSpecsAll.add(s);
  if (r.parseFailure) fatal(r.error);
  const named = `framestep names imported by name: [${r.leafNamed.join(', ')}]${r.leafNamed.includes(NEW_NAME) ? ` — ${NEW_NAME} BY NAME (the boot-cache rule forbids a new name on the existing edge)` : ' — old names only'}`;
  const nm = `link ${f} against the stale framestep.js`;
  cells.push({ n: cells.length + 1, name: nm, ok: r.ok, detail: r.ok ? `linked ${r.modules} modules (stubbed: three ×${r.three}, ../dist/* ×${r.dist})` : r.error });
  armed = armed && r.ok; if (!r.ok) reasons.push(`${f} does not link against the stale framestep.js: ${r.error}${r.culprit ? ` (named at ${r.culprit})` : ''}`);
  console.log(`${TAG} cell ${cells.length}: ${nm}: ${r.ok ? 'as required' : 'NOT as required'} — ${r.ok ? `linked ${r.modules} modules (stubbed: three ×${r.three}, ../dist/* ×${r.dist}); ${named}` : `${r.error}${r.culprit ? ` (named at ${r.culprit})` : ''}; loaded ${r.modules} modules before the failure`}`);
}
{
  const list = [...distSpecsAll].sort();
  console.log(`${TAG} ../dist/* specifiers stubbed across the five graphs: ${list.length} distinct — ${list.join(', ')}${list.length === 6 ? '' : ' (six expected — recorded, not judged)'}`);
}

// cell 6: the degrade on the export estimate's OWN expression (the `<ns>.sinkCompletionSec?.(…) ?? …` node of export.js's AST)
function walk(node, fn, ancestors = []) {
  if (!node || typeof node.type !== 'string') return;
  fn(node, ancestors);
  ancestors.push(node);
  for (const k of Object.keys(node)) {
    if (k === 'loc') continue;
    const v = node[k];
    if (Array.isArray(v)) { for (const c of v) if (c && typeof c.type === 'string') walk(c, fn, ancestors); }
    else if (v && typeof v.type === 'string') walk(v, fn, ancestors);
  }
  ancestors.pop();
}
const nsBindingsOf = (entry) => new Set(entry.reqs.filter((r) => r.ns && classify(r.spec, entry.abs).kind === 'stale').map((r) => r.nsLocal));
const propName = (m) => (m && m.type === 'MemberExpression') ? (m.computed ? (m.property.type === 'Literal' ? String(m.property.value) : null) : m.property.name) : null; // LAND-22 20d: the member's property name
const isLeafMember = (n, ns) => !!n && n.type === 'MemberExpression' && n.object.type === 'Identifier' && ns.has(n.object.name)
  && (n.computed ? (n.property.type === 'Literal' && n.property.value === NEW_NAME) : (n.property.type === 'Identifier' && n.property.name === NEW_NAME));
{
  const f = 'app/export.js'; const abs = path.join(WEB, f); const src = importerSrc.get(f);
  const ast = parseModule(src); const entry = { abs, rel: f, reqs: requestsOf(ast) }; const ns = nsBindingsOf(entry);
  let found = null;
  walk(ast, (n) => {
    if (found || n.type !== 'LogicalExpression' || n.operator !== '??') return;
    const l = n.left.type === 'ChainExpression' ? n.left.expression : n.left;
    if (l.type === 'CallExpression' && l.optional === true && isLeafMember(l.callee, ns)) found = n;
  });
  if (!ns.size) cell('degrade: export.js estimate expression', false, `export.js declares no namespace binding on ./framestep.js`);
  else if (!found) cell('degrade: export.js estimate expression', false, `no \`${[...ns][0]}.${NEW_NAME}?.(…) ?? …\` expression in export.js`);
  else {
    const text = src.slice(found.start, found.end);
    try {
      const staleMod = new vm.SourceTextModule(staleSrc, { identifier: `web/${LEAF_REL} (STALE ${STALE_REV}, evaluated alone)` });
      await staleMod.link(async (spec) => { throw new Error(`the stale leaf must have no imports (found '${spec}')`); }); await staleMod.evaluate();
      const freshNs = await import(pathToFileURL(LEAF).href);
      const entries = [{ t: 2.7495, pivot: { tEnd: 1.2144 } }];
      const game = { duration: 2.7495, sinkEntries: () => entries, sinkInfo: new Map(entries.map((e, i) => [i, e])) };
      const evalWith = (nsObj) => new Function([...ns][0], 'game', `return (${text});`)(nsObj, game);
      const stale = evalWith(staleMod.namespace), fresh = evalWith(freshNs);
      cell(`degrade observed on export.js's extracted expression (:${found.loc.start.line})`, stale === game.duration && fresh > game.duration,
        `stale leaf → ${stale} (= duration ${game.duration}, no extension); fresh leaf → ${fresh} (the completion); expression: ${text}`);
    } catch (e) { cell(`degrade observed on export.js's extracted expression (:${found.loc.start.line})`, false, `${e?.constructor?.name ?? 'Error'}: ${e?.message}; expression: ${text}`); }
  }
}

// cell 7: the feature-detection census over web/app/*.js (acorn AST)
{
  const files = fs.readdirSync(path.join(WEB, 'app')).filter((x) => x.endsWith('.js')).sort();
  const optional = [], ternary = [], unguarded = [], failures = [];
  for (const file of files) {
    const rel = `app/${file}`; const abs = path.join(WEB, rel);
    let src, ast; try { src = fs.readFileSync(abs, 'utf8'); ast = parseModule(src); } catch (e) { failures.push(`web/${rel} failed to parse: ${e.message}`); continue; }
    const entry = { abs, rel, reqs: requestsOf(ast) }; const ns = nsBindingsOf(entry);
    // LAND-19 PMB4: dynamic `import('./framestep.js')` bindings — `const { sinkCompletionSec: x } = await import(…)` (x is a bare binding of the
    // new name: a stale leaf makes it undefined and a bare call throws) and `const m = await import(…)` (m.sinkCompletionSec like a namespace)
    const dyn = new Map(); const dynNs = new Map(); // name → [scope ranges {start, end}] (LAND-22 20d: aliases are scoped to their binding)
    const addScoped = (map, name, scope) => { if (!map.has(name)) map.set(name, []); map.get(name).push(scope ?? ast); };
    const isFnNode = (a) => isInlineFn(a) || a.type === 'FunctionDeclaration';
    const patternBinds = (id, name) => { // LAND-24 S4: every name a declaration pattern binds — identifier, object/array pattern, default, rest
      if (!id) return false; if (id.type === 'Identifier') return id.name === name;
      if (id.type === 'ObjectPattern') return id.properties.some((pr) => pr.type === 'RestElement' ? patternBinds(pr.argument, name) : patternBinds(pr.value, name));
      if (id.type === 'ArrayPattern') return id.elements.some((el) => patternBinds(el, name));
      if (id.type === 'AssignmentPattern') return patternBinds(id.left, name); if (id.type === 'RestElement') return patternBinds(id.argument, name);
      return false; };
    const declaredIn = (decl, name) => decl.declarations.some((dc) => patternBinds(dc.id, name));
    const varDeclaresWithin = (fnOrProg, name) => { // a `var` declaration or a function declaration anywhere inside (not in nested functions)
      let found = false;
      // LAND-24 S3 (CORR-1): a FunctionDeclaration that is a DIRECT member of this function's/Program's body declares its name here — tested before
      // the prune, for direct members only (one held in a nested block declares in that block, never function-wide)
      const bodyList = fnOrProg.type === 'Program' ? fnOrProg.body : (fnOrProg.type === 'StaticBlock' ? fnOrProg.body : (fnOrProg.body && fnOrProg.body.type === 'BlockStatement' ? fnOrProg.body.body : []));
      if (Array.isArray(bodyList) && bodyList.some((st) => st.type === 'FunctionDeclaration' && st.id && st.id.name === name)) return true;
      const visit = (n) => { if (found || !n || typeof n.type !== 'string') return;
        // S5 (CORR-1): a class static block is a scope of its own — the `var` scan prunes there, as at a nested function
        if (n !== fnOrProg && (isFnNode(n) || n.type === 'StaticBlock')) return;
        if (n.type === 'VariableDeclaration' && n.kind === 'var' && declaredIn(n, name)) { found = true; return; }
        for (const k of Object.keys(n)) { if (k === 'loc' || k === 'range') continue; const v = n[k]; if (Array.isArray(v)) v.forEach(visit); else if (v && typeof v.type === 'string') visit(v); } };
      visit(fnOrProg.body ?? fnOrProg); return found; };
    // LAND-22 P3 / LAND-23 Q2: does this ancestor DECLARE the name? let/const/class and parameters declare in their block/function; `var` and
    // function declarations declare in the nearest enclosing FUNCTION or Program
    const declaresName = (a, name) => {
      if (isFnNode(a)) return a.params.some((q) => patternBinds(q, name)) || varDeclaresWithin(a, name); // S4: pattern parameters count
      if (a.type === 'BlockStatement') return a.body.some((st) => (st.type === 'VariableDeclaration' && st.kind !== 'var' && declaredIn(st, name)) || (st.type === 'ClassDeclaration' && st.id && st.id.name === name) || (st.type === 'FunctionDeclaration' && st.id && st.id.name === name));
      // LAND-24 S2: the cases of a switch share ONE lexical scope — the SwitchStatement declares, a SwitchCase never does
      if (a.type === 'SwitchStatement') return a.cases.some((c) => c.consequent.some((st) => (st.type === 'VariableDeclaration' && st.kind !== 'var' && declaredIn(st, name)) || (st.type === 'ClassDeclaration' && st.id && st.id.name === name) || (st.type === 'FunctionDeclaration' && st.id && st.id.name === name)));
      if (a.type === 'StaticBlock') return a.body.some((st) => (st.type === 'VariableDeclaration' && declaredIn(st, name)) || (st.type === 'FunctionDeclaration' && st.id && st.id.name === name) || (st.type === 'ClassDeclaration' && st.id && st.id.name === name)) || varDeclaresWithin(a, name);
      if (a.type === 'ForStatement' || a.type === 'ForOfStatement' || a.type === 'ForInStatement') { const h = a.init ?? a.left; return !!h && h.type === 'VariableDeclaration' && h.kind !== 'var' && declaredIn(h, name); }
      if (a.type === 'Program') return a.body.some((st) => (st.type === 'VariableDeclaration' && declaredIn(st, name)) || (st.type === 'FunctionDeclaration' && st.id && st.id.name === name) || (st.type === 'ClassDeclaration' && st.id && st.id.name === name)) || varDeclaresWithin(a, name);
      return false;
    };
    // LAND-22 P3: the call's object identifier resolves to the alias only if a registered scope node is an ancestor of the call and no NEARER
    // ancestor (between the call and that scope) rebinds the name
    const resolvesTo = (map, name, callAnc) => { const scopes = map.get(name); if (!scopes) return false;
      for (let i = callAnc.length - 1; i >= 0; i--) { const a = callAnc[i]; if (scopes.includes(a)) return true; if (declaresName(a, name)) return false; }
      return false; };
    const enclosingBlock = (anc) => { // LAND-24 S1/S2: the scope node a declaration lives in
      for (let i = anc.length - 1; i >= 0; i--) { const a = anc[i];
        if (a.type === 'VariableDeclaration') { const p = anc[i - 1]; if (p && p.type === 'ForStatement' && p.init === a) return p; if (p && p.type === 'SwitchCase') { const sw = anc[i - 2]; if (sw && sw.type === 'SwitchStatement') return sw; } continue; }
        if (a.type === 'BlockStatement' || a.type === 'Program' || a.type === 'StaticBlock') return a; }
      return ast; };
    // LAND-23 (review 775r9-2): an assignment writes the binding that is VISIBLE where it stands — its scope is the nearest enclosing scope that
    // declares the name (a function parameter or a declaration directly in that block), else the Program
    const declScopeOf = (name, anc) => { for (let i = anc.length - 1; i >= 0; i--) if (declaresName(anc[i], name)) return anc[i]; return ast; };
    const isLeafImport = (e) => { let x = e; if (x && x.type === 'AwaitExpression') x = x.argument; return !!x && x.type === 'ImportExpression' && x.source.type === 'Literal' && typeof x.source.value === 'string' && classify(x.source.value, abs).kind === 'stale'; };
    // LAND-21 L2 (review 775r7 P2; CORR-1): EVERY dynamic import whose specifier resolves to the framestep leaf is registered by its CONSUMER
    // form — a variable initialiser (`const m = await import(…)` / `const { sinkCompletionSec: x } = await import(…)`), an assignment to an
    // Identifier / ObjectPattern, `.then(cb)` / `.then(cb, eb)` with an INLINE function or arrow whose first parameter is the module alias,
    // `Promise.all([...])` destructured into an ArrayPattern; every member call on the alias (or the destructured name) is a feature-detection
    // site under the guard law below. Any OTHER consumer form of a framestep dynamic import (a non-inline `.then(handler)`, a stored promise
    // consumed elsewhere, a `.catch`-only chain, no consumer at all) is an UNSUPPORTED consumer: cell 7 reads NOT as required and the arm is
    // NOT ARMED (rc 1, fail closed — never the rc-2 REFUSED path, which is reserved for environment preconditions). Dynamic imports of any
    // OTHER module are never registered and never refused (main.js's `.then((m) => …)` consumers of other leaves stay invisible).
    const unsupported = [];
    const isLeafSpec = (x) => !!x && x.type === 'ImportExpression' && x.source.type === 'Literal' && typeof x.source.value === 'string' && classify(x.source.value, abs).kind === 'stale';
    const isInlineFn = (f) => !!f && (f.type === 'ArrowFunctionExpression' || f.type === 'FunctionExpression');
    const bindPattern = (id, scope) => { // the binding a dynamic leaf import lands in, scoped to `scope` (a function node; null = the module)
      if (!id) return false;
      if (id.type === 'ObjectPattern') { for (const pr of id.properties) { if (pr.type === 'Property' && (pr.key.name ?? pr.key.value) === NEW_NAME && pr.value.type === 'Identifier') addScoped(dyn, pr.value.name, scope); } return true; }
      if (id.type === 'Identifier') { addScoped(dynNs, id.name, scope); return true; }
      return false;
    };
    walk(ast, (n, anc) => {
      if (!isLeafSpec(n)) return;
      const at = `web/${rel}:${n.loc.start.line}`;
      let i = anc.length - 1; let node = n; let parent = anc[i]; let awaited = false;
      if (parent && parent.type === 'AwaitExpression') { awaited = true; node = parent; parent = anc[--i]; }
      let ok = false;
      // a declarator / assignment binds the MODULE only when the import is awaited; `const p = import(…)` stores a promise consumed elsewhere
      const blockScope = enclosingBlock(anc); // the declarator's / the Promise.all destructure's scope (the enclosing BlockStatement or Program)
      if (awaited && parent && parent.type === 'VariableDeclarator' && parent.init === node) ok = bindPattern(parent.id, blockScope);
      else if (awaited && parent && parent.type === 'AssignmentExpression' && parent.right === node) {
        // LAND-23 Q2 (review 775r9-2): an assignment writes an EXISTING binding — each target name is scoped to the innermost ancestor that
        // declares it (declaresName), none → the Program; an Identifier target is a namespace alias, an ObjectPattern target binds the new name
        const L = parent.left;
        if (L.type === 'Identifier') { addScoped(dynNs, L.name, declScopeOf(L.name, anc)); ok = true; }
        else if (L.type === 'ObjectPattern') { ok = true; for (const pr of L.properties) { if (pr.type === 'Property' && (pr.key.name ?? pr.key.value) === NEW_NAME && pr.value.type === 'Identifier') addScoped(dyn, pr.value.name, declScopeOf(pr.value.name, anc)); } }
      }
      else if (!awaited && parent && parent.type === 'MemberExpression' && parent.object === node && !parent.computed && parent.property.name === 'then') {
        const call = anc[i - 1];
        if (call && call.type === 'CallExpression' && call.callee === parent && isInlineFn(call.arguments[0])) ok = bindPattern(call.arguments[0].params[0], call.arguments[0]);
      } else if (parent && parent.type === 'ArrayExpression') {
        const call = anc[i - 1]; const cal = call && call.type === 'CallExpression' ? call.callee : null;
        if (cal && cal.type === 'MemberExpression' && cal.object.type === 'Identifier' && cal.object.name === 'Promise' && !cal.computed && cal.property.name === 'all') {
          const idx = parent.elements.indexOf(node); let j = i - 2; let up = anc[j];
          if (up && up.type === 'AwaitExpression') up = anc[--j];
          if (up && up.type === 'VariableDeclarator' && up.id.type === 'ArrayPattern' && up.id.elements[idx]) ok = bindPattern(up.id.elements[idx], blockScope);
        }
      }
      if (!ok) unsupported.push(at);
    });
    const nsAll = ns; // the static namespaces are module-wide; the dynamic aliases are matched by scope below
    for (const u of unsupported) failures.push(`unsupported dynamic-import consumer at ${u}`);
    if (!ns.size && !dynNs.size && !dyn.size) continue; // LAND-23 Q1 (review 775r9-1): eligibility = ns ∪ dynNs ∪ dyn — a file whose only framestep access is dynamic is scanned
    walk(ast, (n, anc) => {
      if (n.type !== 'CallExpression') return;
      const callee = n.callee.type === 'ChainExpression' ? n.callee.expression : n.callee;
      const dynMember = callee.type === 'MemberExpression' && callee.object.type === 'Identifier' && propName(callee) === NEW_NAME && resolvesTo(dynNs, callee.object.name, anc);
      const viaMember = isLeafMember(callee, nsAll) || dynMember; const viaDyn = callee.type === 'Identifier' && resolvesTo(dyn, callee.name, anc);
      if (!viaMember && !viaDyn) return;
      const dynamicTag = viaDyn || dynMember ? ' (dynamic)' : '';
      const at = `web/${rel}:${n.loc.start.line}${dynamicTag}`;
      if (n.optional === true) { optional.push(at); return; }
      const sameTest = (test) => viaDyn ? (test && test.type === 'Identifier' && test.name === callee.name) : (isLeafMember(test, nsAll) || (!!test && test.type === 'MemberExpression' && test.object.type === 'Identifier' && test.object.name === callee.object.name && propName(test) === NEW_NAME));
      let child = n;
      for (let i = anc.length - 1; i >= 0; i--) {
        const a = anc[i];
        if (a.type === 'FunctionExpression' || a.type === 'ArrowFunctionExpression' || a.type === 'FunctionDeclaration') break;
        if ((a.type === 'ConditionalExpression' || a.type === 'IfStatement') && a.consequent === child && sameTest(a.test)) { ternary.push(`${at} (test at :${a.test.loc.start.line})`); return; }
        child = a;
      }
      unguarded.push(at);
    });
  }
  const ok = unguarded.length === 0 && failures.length === 0;
  // LAND-21 L6: ONE '(dynamic)' tag — in the LAND-19 ordered position (`dropped (dynamic) at file:line`); the per-site suffix is stripped from
  // the reason (the 'unguarded:' line below keeps it per site)
  const anyDyn = unguarded.some((u) => / \(dynamic\)$/.test(u));
  const reason = failures[0] ?? (unguarded.length ? `feature detection dropped${anyDyn ? ' (dynamic)' : ''} at ${unguarded.map((u) => u.replace(/ \(dynamic\)$/, '')).join(', ')}` : null);
  cell(`feature detection on <ns>.${NEW_NAME} calls (web/app/*.js, ${files.length} files)`, ok,
    `${optional.length} optional-chained + ${ternary.length} ternary-guarded = ${optional.length + ternary.length}; unguarded ${unguarded.length}${ok ? '' : ` — ${reason}`}`, reason);
  console.log(`${TAG}   optional-chained: ${optional.join(', ') || '(none)'}`);
  console.log(`${TAG}   ternary-guarded: ${ternary.join(', ') || '(none)'}`);
  if (unguarded.length) console.log(`${TAG}   unguarded: ${unguarded.join(', ')}`);
  cells[cells.length - 1].census = { optional, ternary, unguarded, failures };
}

// cells 8-9: the PLANTS on scratch overlays (separate overlays; separate module caches — bindings never meet)
const SCRATCH = SCRATCH_OPT ? path.resolve(SCRATCH_OPT) : fs.mkdtempSync(path.join(os.tmpdir(), 'boot-cache-arm-'));
fs.mkdirSync(SCRATCH, { recursive: true });
const overlayWrite = (name, rel, text) => { const dir = path.join(SCRATCH, name); const abs = path.join(dir, rel); fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, text); return dir; };
const diesByName = (r) => !r.ok && !r.parseFailure && new RegExp(`does not provide an export named '${NEW_NAME}'`).test(r.error);
{ // PLANT A: main.js's namespace import → the named import
  const f = 'app/main.js'; const src = importerSrc.get(f); const abs = path.join(WEB, f);
  const entry = { abs, rel: f, reqs: requestsOf(parseModule(src)) };
  const nsReq = entry.reqs.find((r) => r.ns && classify(r.spec, abs).kind === 'stale');
  const treeLink = linkResults[f];
  if (!nsReq) cell('PLANT A anchor (main.js namespace import of ./framestep.js)', false, 'not found');
  else if (treeLink.leafNamed.includes(NEW_NAME)) cell(`PLANT A not planted — the TREE's main.js already imports ${NEW_NAME} by name from ./framestep.js (a live plant; planting again would redeclare the binding)`, diesByName(treeLink), `the tree's own link cell judges it: ${treeLink.ok ? 'it LINKED' : treeLink.error}`, 'PLANT A (named import) present in the tree and not caught');
  else {
    const planted = src.slice(0, nsReq.node.start) + `import { ${NEW_NAME} } from './framestep.js'; /* PLANT A: the named import restored */` + src.slice(nsReq.node.end);
    const overlay = overlayWrite('plant-a-named-import', f, planted);
    const r = await linkGraph(f, { overlay });
    cell(`PLANT A (main.js:${nsReq.line} named import restored, overlay ${overlay}) → the link against the stale leaf dies by name`, diesByName(r),
      r.ok ? 'it LINKED — the plant is not caught' : `${r.error}${r.culprit ? ` (named at ${r.culprit})` : ''}`, 'PLANT A (named import) not caught');
  }
}
{ // PLANT B: the re-export route through coords.js
  const f = 'app/main.js'; const src = importerSrc.get(f); const abs = path.join(WEB, f);
  const coordsRel = 'app/coords.js'; const coordsAbs = path.join(WEB, coordsRel);
  const entry = { abs, rel: f, reqs: requestsOf(parseModule(src)) };
  const cReq = entry.reqs.find((r) => r.kind === 'import' && classify(r.spec, abs).abs === coordsAbs && r.node.specifiers.some((s) => s.type === 'ImportSpecifier'));
  const treeLink = linkResults[f];
  let coordsSrc = null, coordsRoute = null;
  if (fs.existsSync(coordsAbs)) {
    coordsSrc = fs.readFileSync(coordsAbs, 'utf8');
    try { coordsRoute = requestsOf(parseModule(coordsSrc)).find((r) => r.names.has(NEW_NAME) && classify(r.spec, coordsAbs).kind === 'stale') ?? null; } catch { coordsRoute = null; }
  }
  if (!cReq || coordsSrc === null) cell('PLANT B anchor (main.js named import from ./coords.js)', false, 'not found');
  else if (coordsRoute || cReq.names.has(NEW_NAME)) cell(`PLANT B not planted — the TREE already carries the re-export route (${coordsRoute ? `web/app/coords.js:${coordsRoute.line}` : ''}${coordsRoute && cReq.names.has(NEW_NAME) ? ', ' : ''}${cReq.names.has(NEW_NAME) ? `web/app/main.js:${cReq.line}` : ''}; a live plant — planting again would duplicate the export / the binding)`, diesByName(treeLink), `the tree's own link cell judges it: ${treeLink.ok ? 'it LINKED' : treeLink.error}`, 'PLANT B (re-export via coords.js) present in the tree and not caught');
  else {
    const specs = cReq.node.specifiers.map((s) => src.slice(s.start, s.end));
    const plantedMain = src.slice(0, cReq.node.start) + `import { ${specs.join(', ')}, ${NEW_NAME} as sinkCompletionViaCoords } from '${cReq.spec}'; /* PLANT B: the alias through the re-export route */` + src.slice(cReq.node.end);
    const plantedCoords = coordsSrc + `\nexport { ${NEW_NAME} } from './framestep.js'; // PLANT B: a re-export route to the new name\n`;
    const overlay = overlayWrite('plant-b-reexport-via-coords', f, plantedMain); overlayWrite('plant-b-reexport-via-coords', coordsRel, plantedCoords);
    const r = await linkGraph(f, { overlay });
    cell(`PLANT B (coords.js re-exports ${NEW_NAME}; main.js:${cReq.line} imports the alias from ./coords.js, overlay ${overlay}) → the link against the stale leaf dies by name`, diesByName(r),
      r.ok ? 'it LINKED — the plant is not caught (a stubbed graph would pass this)' : `${r.error}${r.culprit ? ` (named at ${r.culprit})` : ''}`, 'PLANT B (re-export via coords.js) not caught');
  }
}
if (!SCRATCH_OPT) { try { fs.rmSync(SCRATCH, { recursive: true, force: true }); } catch {} }

if (JSON_OUT) {
  fs.mkdirSync(path.dirname(JSON_OUT), { recursive: true });
  const importers = Object.fromEntries(Object.entries(linkResults).map(([k, r]) => [k, { ok: r.ok, modules: r.modules, three: r.three, dist: r.dist, leafNamed: r.leafNamed, error: r.error ?? null, culprit: r.culprit ?? null }]));
  fs.writeFileSync(JSON_OUT, JSON.stringify({ tool: 'arm-boot-cache-489', web: WEB, root: ROOT, stale: staleFrom, importers, distSpecs: [...distSpecsAll].sort(), cells, reasons, armed }, null, 1));
}
const census = cells.find((c) => c.census)?.census;
console.log(`${TAG} cells ${cells.length}; ${armed
  ? `ARMED — the five importers link their real graphs against the stale framestep.js (../dist/* and three stubbed), the estimate degrades to the duration, every <ns>.${NEW_NAME} call is feature-detected (${census?.optional.length ?? 0} optional-chained + ${census?.ternary.length ?? 0} ternary-guarded), both plants die by name`
  : `NOT ARMED — ${reasons.join('; ')}`}`);
process.exit(armed ? 0 : 1);
