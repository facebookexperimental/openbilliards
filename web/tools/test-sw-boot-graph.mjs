// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-sw-boot-graph.mjs — #1109: every module the default boot can reach is in web/sw.js PRECACHE.
//
// gen-sw-precache.mjs derives PRECACHE from the measured boot manifest (web/tools/sw-boot-manifest.json, recorded by
// a real boot: node web/tools/e2e-userboot-3g.mjs --record-boot) plus the static imports its own line-anchored rule
// sees from app.html and the measured modules. A new boot leaf usually arrives as a guarded dynamic import() (the
// app's boot-cache rule for main.js's graph), which the generator does not follow; until someone re-records the
// manifest it lands in PRECACHE_FILL, and only the nightly e2e-userboot swfill leg noticed (keygate.js, #990). This
// check closes that gap at PR time with no browser:
//   roots   app.html's <script src> and <link href> (any quoting, with or without ./), the generator's own two
//           patterns, the imports of app.html's inline scripts, and every measured non-media manifest path. app.html
//           is read in document order, the way a browser tokenizes it: comments, <template> bodies and the text of
//           <style>, <title>, <textarea>, <noscript> and the like are skipped, and a script body is never markup;
//   edges   module code parsed with the vendored acorn, so a comment never makes an edge: static import/export … from;
//           import() of a string, an expression-free template, a template whose expressions all sit in its ?query,
//           or a module-level string const; import() of a member of a module-level const object/array whose leaves
//           are all literals (each .js/.mjs leaf is an edge); and stylesheets, named either through
//           new URL(<literal or template head ending in .css>, import.meta.url) or by a `./…css?v=…` string (the
//           app's cache-bust convention: module-relative, else document-relative, else no edge). A table or string
//           const that an inner binding shadows or that the module mutates is not trusted: that import() is a
//           computed one. Bare specifiers resolve through the app.html import map first (exact, then the longest
//           trailing-slash key); only a name no map key covers can be a node built-in, which is ignored;
//   boot    a static edge is boot; a dynamic, table or stylesheet edge is boot unless a LAZY_EDGES row names that
//           importer -> target pair with its exact number of call lines (so a new importer of a lazy target, or a
//           new call of a lazy pair, is still judged).
// It fails (exit 1), naming the module, its importers and its path from a root, when:
//   - a reachable non-media path is not in PRECACHE. The advice follows the generator's own rule: "web/sw.js is
//     stale" only for what the generator would precache; a re-record for any other edge (or a LAZY_EDGES row for a
//     dynamic one); a path outside the generator's walked tree is named as such;
//   - a LAZY_EDGES row is stale (its edge is gone), miscounts its call lines, is redundant (its target is in
//     PRECACHE), has no reason or count, or repeats a key;
//   - a reachable module has a computed import() count other than its OPAQUE_IMPORTS row, or that row is stale or
//     has no reason;
//   - a reachable module or inline script does not parse, a boot edge names a missing file, or a specifier cannot
//     be placed (an unresolved bare name, an absolute path, a map target that is not ./-relative);
//   - app.html's import map does not parse, or holds what the check does not apply: scopes, a URL-like key, a
//     second map.
// When the generator's walk constants cannot be read it says so in a NOTE and hedges its advice; the verdict never
// depends on them.
// What it cannot see, so the nightly swfill leg stays the backstop: fetch() of JSON/wasm, Workers, CSS @import and
// url(), script or modulepreload links made with new URL(…, import.meta.url), import.meta.resolve, sheet paths
// computed at run time, sheets set without new URL(…) and without a `./…css?v=` string, and the targets of
// OPAQUE_IMPORTS. The generator's three patterns below are copies of gen-sw-precache.mjs's (keep them in step); its
// walked file set is read from its own constants (ROOT_FILES, WALK_DIRS, EXT_ALLOW, WALK_SKIP), literal lists only.
//
//   node web/tools/test-sw-boot-graph.mjs              # the working tree; exit 0 OK, 1 FAIL, 2 usage
//   node web/tools/test-sw-boot-graph.mjs --selftest   # synthetic plants on in-memory overlays; each must hold
//   node web/tools/test-sw-boot-graph.mjs --rev <rev>  # judge a committed tree through git, with this file's rows
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { builtinModules } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as acorn from '../../tools/render/lib/vendor/acorn/acorn.mjs';

const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MEDIA_RE = /\.(wav|png|webp|woff2)$/i; // the generator's media rule: never in the boot set
const JS_RE = /\.m?js$/;
const SHEET_RE = /^\.\.?\/[^'"`\s?#]*\.css\?v=/; // the ?v= cache-bust convention for module sheets
const NODE_BUILTINS = new Set(builtinModules);
// gen-sw-precache.mjs: its app.html roots and its static-import rule (relative specifiers, one per line)
const GEN_HTML_SRC_RE = /(?:src|href)="\.\/([^"?#]+)/g;
const GEN_HTML_IMPORT_RE = /\bimport\(\s*['"]\.\/([^'"?#]+)['"]\s*\)/g;
const GEN_STATIC_RE = /^\s*(?:import|export)\b[^;'"]*?\bfrom\s*['"](\.\.?\/[^'"]+)['"]|^\s*import\s*['"](\.\.?\/[^'"]+)['"]/gm;

/** the generator's walked file set, read from its own constants so it cannot drift; null when they cannot be read */
function genFileSetOf(read) {
  const src = read('tools/gen-sw-precache.mjs');
  if (src == null) return null;
  // a list reads only when it holds nothing but quoted strings: a spread, a name or any other expression does not
  const strs = (m) => {
    if (!m || !/^\s*(?:(?:'[^'\n]*'|"[^"\n]*")\s*(?:,\s*|$))*$/.test(m[1])) return null;
    return [...m[1].matchAll(/'([^'\n]*)'|"([^"\n]*)"/g)].map((x) => x[1] ?? x[2]);
  };
  const roots = strs(src.match(/^const ROOT_FILES = \[([^\]]*)\]/m));
  const dirs = strs(src.match(/^const WALK_DIRS = \[([^\]]*)\]/m));
  const exts = strs(src.match(/^const EXT_ALLOW = new Set\(\[([^\]]*)\]\)/m));
  // WALK_SKIP is absent in older trees (no skip); present but unreadable makes the whole set unreadable
  const skip = /^const WALK_SKIP\b/m.test(src) ? strs(src.match(/^const WALK_SKIP = new Set\(\[([^\]]*)\]\)/m)) : [];
  if (!roots || !dirs || !exts || !skip) return null;
  return (rel) => roots.includes(rel) || (dirs.includes(rel.split('/')[0]) && exts.includes(path.posix.extname(rel))
    && !skip.some((d) => rel === d || rel.startsWith(`${d}/`)));
}

// Edges that load after boot, on demand: [importer, target, call lines, reason]. Keyed by the edge, with its count.
export const LAZY_EDGES = [
  ['app/main.js', 'app/haptics.js', 1, 'only inside the iOS shell, when its haptics bridge exists'],
  ['app/atelier.js', 'app/ateliercue.js', 1, 'the Equipment cue station, when the player opens it'],
  ['app/atelier.js', 'app/cuethumbs.js', 1, 'cue card thumbnails, when the Equipment view builds them'],
  ['app/offline-render.js', 'app/cinelight.js', 1, 'the offline video render only'],
  ['app/playback.js', 'app/transcode.js', 2, 'video transcode and its support probe, on demand'],
  ['app/record.js', 'app/transcode.js', 1, 'the transcode support probe, on demand'],
  ['app/settings.js', 'app/ui/switchprogress.js', 1, 'the table-switch progress leaf, prefetched when the switch confirm opens'],
  ['app/settings.js', 'app/ui/switchprogress.css', 1, 'the table-switch progress sheet, with its leaf'],
  ['app/settings.js', 'app/bugreport.js', 1, 'the bug report, when the player asks for one'],
  ['app/swupdate.js', 'app/ui/swupdate.css', 1, 'the update notice sheet, when a notice shows'],
  ['scene/ballreturn/index.js', 'scene/ballreturn/debugvisual.js', 1, 'the ball-return debug visual, test tracks only'],
  ['scene/table.js', 'scene/cn8transport.js', 1, 'only for a Chinese-8 table, not the default boot table'],
  ['scene/table.js', 'scene/snktransport.js', 1, 'only for a snooker table, not the default boot table'],
];
// import() calls whose target is computed at run time: { importer: [count, reason] }
export const OPAQUE_IMPORTS = {
  'dist/pool-sdk/engine.js': [2, 'the kernel glue loader: a node-only path, and a caller-supplied source that no boot caller passes (the app hands it the glue module)'],
  'dist/pool-sdk/rules/backend.js': [2, 'the rules glue loader: a node-only path, and the browser path to the rules glue, a measured boot path'],
};

const stripQuery = (p) => p.split(/[?#]/)[0];
const isBuiltin = (spec) => /^node:/.test(spec) || NODE_BUILTINS.has(spec) || NODE_BUILTINS.has(spec.split('/')[0]);

/** web/sw.js PRECACHE paths, query and './' stripped (the AUTOGEN rows are [url, sha16, bytes]). */
export function precacheOf(swText) {
  const m = swText.match(/const PRECACHE = \[([\s\S]*?)\n\];/);
  if (!m) throw new Error('web/sw.js has no PRECACHE list');
  return new Set([...m[1].matchAll(/^\s*\[?'\.\/([^']+)'/gm)].map((x) => stripQuery(x[1])));
}

function* children(node) {
  for (const k of Object.keys(node)) {
    if (k === 'loc' || k === 'start' || k === 'end') continue;
    const v = node[k];
    if (Array.isArray(v)) { for (const c of v) if (c && typeof c.type === 'string') yield c; }
    else if (v && typeof v.type === 'string') yield v;
  }
}

/** the string leaves of a literal-only const table, or null when any leaf is not a literal */
function tableLeaves(node, out = []) {
  if (node.type === 'Literal') { if (typeof node.value === 'string') out.push(node.value); return out; }
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) { out.push(node.quasis[0].value.cooked); return out; }
  if (node.type === 'ArrayExpression') {
    for (const el of node.elements) if (!el || el.type === 'SpreadElement' || !tableLeaves(el, out)) return null;
    return out;
  }
  if (node.type === 'ObjectExpression') {
    for (const p of node.properties) if (p.type !== 'Property' || !tableLeaves(p.value, out)) return null;
    return out;
  }
  return null;
}

const isImportMetaUrl = (n) => n?.type === 'MemberExpression' && !n.computed && n.property.name === 'url'
  && n.object.type === 'MetaProperty' && n.object.meta.name === 'import' && n.object.property.name === 'meta';

/** names bound anywhere below the module's top level (params, inner declarations, catch params) */
function innerBindings(ast) {
  const names = new Set();
  const addPattern = (p) => {
    if (!p) return;
    if (p.type === 'Identifier') names.add(p.name);
    else if (p.type === 'ObjectPattern') for (const q of p.properties) addPattern(q.type === 'RestElement' ? q.argument : q.value);
    else if (p.type === 'ArrayPattern') for (const q of p.elements) addPattern(q);
    else if (p.type === 'RestElement') addPattern(p.argument);
    else if (p.type === 'AssignmentPattern') addPattern(p.left);
  };
  const walk = (node, top) => {
    if (/Function/.test(node.type)) {
      if (!top && node.id) names.add(node.id.name);
      for (const p of node.params) addPattern(p);
      walk(node.body, false);
      return;
    }
    if (node.type === 'VariableDeclaration' && !top) for (const d of node.declarations) addPattern(d.id);
    if (node.type === 'CatchClause') addPattern(node.param);
    if ((node.type === 'ClassDeclaration') && !top && node.id) names.add(node.id.name);
    for (const c of children(node)) walk(c, top && (node.type === 'Program' || node.type === 'ExportNamedDeclaration' || node.type === 'VariableDeclaration' || node.type === 'VariableDeclarator'));
  };
  walk(ast, true);
  return names;
}

/** module-level names that the module mutates: a member assignment or update, push/splice/unshift, Object.assign */
function mutatedNames(ast) {
  const names = new Set();
  const baseOf = (n) => { while (n?.type === 'MemberExpression') n = n.object; return n?.type === 'Identifier' ? n.name : null; };
  const walk = (node) => {
    if ((node.type === 'AssignmentExpression' && node.left.type === 'MemberExpression') || (node.type === 'UpdateExpression' && node.argument.type === 'MemberExpression')) {
      const b = baseOf(node.left ?? node.argument); if (b) names.add(b);
    }
    if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression') {
      const prop = node.callee.property?.name;
      if (['push', 'splice', 'unshift', 'pop', 'shift', 'fill', 'copyWithin', 'reverse', 'sort'].includes(prop)) { const b = baseOf(node.callee.object); if (b) names.add(b); }
      if (baseOf(node.callee) === 'Object' && ['assign', 'defineProperty', 'defineProperties'].includes(prop) && node.arguments[0]) { const b = baseOf(node.arguments[0]); if (b) names.add(b); }
    }
    for (const c of children(node)) walk(c);
  };
  walk(ast);
  return names;
}

/** the edges of one script: [{ spec, kind: static|dynamic|table|css|sheet, line }] and its computed import() lines;
 *  memoized by text, so the selftest's plants re-parse only what they change */
const edgeCache = new Map();
export function moduleEdges(text, sourceType = 'module') {
  const key = `${sourceType}\u0000${text}`;
  if (!edgeCache.has(key)) edgeCache.set(key, moduleEdgesOf(text, sourceType));
  return edgeCache.get(key);
}
function moduleEdgesOf(text, sourceType) {
  const ast = acorn.parse(text, { ecmaVersion: 'latest', sourceType, locations: true, allowHashBang: true });
  const shadowed = innerBindings(ast);
  const mutated = mutatedNames(ast);
  const tables = new Map(); // module-level const NAME = { … } / [ … ], trusted only while unshadowed and unmutated
  const strings = new Map(); // module-level const NAME = '…'
  for (const st of ast.body) {
    const decl = st.type === 'ExportNamedDeclaration' ? st.declaration : st;
    if (decl?.type !== 'VariableDeclaration' || decl.kind !== 'const') continue;
    for (const d of decl.declarations) {
      if (d.id.type !== 'Identifier' || shadowed.has(d.id.name)) continue;
      if ((d.init?.type === 'ObjectExpression' || d.init?.type === 'ArrayExpression') && !mutated.has(d.id.name)) tables.set(d.id.name, d.init);
      if (d.init?.type === 'Literal' && typeof d.init.value === 'string') strings.set(d.id.name, d.init.value);
    }
  }
  const edges = [];
  const opaque = [];
  const urlArgs = new Set(); // first arguments of a new URL(…, import.meta.url) that made a css edge: one call, one edge
  const visit = (node) => {
    const line = node.loc?.start.line;
    if ((node.type === 'ImportDeclaration' || node.type === 'ExportNamedDeclaration' || node.type === 'ExportAllDeclaration') && node.source) {
      edges.push({ spec: node.source.value, kind: 'static', line });
    } else if (node.type === 'ImportExpression') {
      const s = node.source;
      let base = s;
      while (base.type === 'MemberExpression') base = base.object;
      const leaves = s.type === 'MemberExpression' && base.type === 'Identifier' && tables.has(base.name) ? tableLeaves(tables.get(base.name)) : null;
      if (s.type === 'Literal' && typeof s.value === 'string') edges.push({ spec: s.value, kind: 'dynamic', line });
      else if (s.type === 'TemplateLiteral' && s.expressions.length === 0) edges.push({ spec: s.quasis[0].value.cooked, kind: 'dynamic', line });
      else if (s.type === 'TemplateLiteral' && s.quasis[0].value.cooked.includes('?')) edges.push({ spec: s.quasis[0].value.cooked.split('?')[0], kind: 'dynamic', line });
      else if (s.type === 'Identifier' && strings.has(s.name)) edges.push({ spec: strings.get(s.name), kind: 'dynamic', line });
      else if (leaves) { for (const v of leaves) if (JS_RE.test(stripQuery(v))) edges.push({ spec: v, kind: 'table', line }); }
      else opaque.push(line);
    } else if (node.type === 'NewExpression' && node.callee.type === 'Identifier' && node.callee.name === 'URL'
      && node.arguments.length >= 2 && isImportMetaUrl(node.arguments[1])) {
      const a = node.arguments[0];
      const spec = a.type === 'Literal' && typeof a.value === 'string' ? a.value
        : a.type === 'TemplateLiteral' ? a.quasis[0].value.cooked : null;
      if (spec != null && /\.css$/.test(stripQuery(spec)) && !/^[a-z][a-z0-9+.-]*:|^\//i.test(spec)) {
        edges.push({ spec: /^\.\.?\//.test(spec) ? spec : `./${spec}`, kind: 'css', line });
        urlArgs.add(a);
      }
    } else if ((node.type === 'Literal' || node.type === 'TemplateLiteral') && !urlArgs.has(node)) {
      const v = node.type === 'Literal' ? (typeof node.value === 'string' ? node.value : null) : node.quasis[0].value.cooked;
      if (v != null && SHEET_RE.test(v)) edges.push({ spec: v, kind: 'sheet', line });
    }
    for (const c of children(node)) visit(c);
  };
  visit(ast);
  return { edges, opaque };
}

/** the import map: an exact key first, then the longest trailing-slash key. { hit: false } when no key covers the
 *  name; else { hit: true, raw, target }, target null when the check cannot place it (it follows ./ targets only) */
function resolveBare(spec, imports) {
  let hit = Object.prototype.hasOwnProperty.call(imports, spec);
  let raw = hit ? imports[spec] : null;
  if (!hit) {
    const k = Object.keys(imports).filter((x) => x.endsWith('/') && spec.startsWith(x)).sort((a, b) => b.length - a.length)[0];
    if (k) { hit = true; raw = typeof imports[k] === 'string' ? imports[k] + spec.slice(k.length) : imports[k]; }
  }
  if (!hit) return { hit: false };
  return { hit: true, raw, target: typeof raw === 'string' && /^\.\//.test(raw) ? stripQuery(path.posix.normalize(raw.slice(2))) : null };
}

/** { target } | { target: null } (ignore) | { target: null, unresolved: why, bare? } */
function resolveSpec(fromRel, e, imports, exists) {
  const spec = e.spec;
  if (/^\.\.?\//.test(spec)) {
    const mod = stripQuery(path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), spec)));
    if (e.kind !== 'sheet' || exists(mod)) return { target: mod };
    const doc = stripQuery(path.posix.normalize(spec)); // a document-relative sheet href, served from web/
    return exists(doc) ? { target: doc } : { target: null };
  }
  const m = resolveBare(spec, imports); // the import map first: a name it maps is never a built-in
  if (m.hit) return m.target ? { target: m.target } : { target: null, unresolved: `mapped by the import map to '${m.raw}', which the check cannot place (it follows ./ targets only)` };
  if (isBuiltin(spec)) return { target: null };
  if (/^[a-z][a-z0-9+.-]*:|^\//i.test(spec)) return { target: null, unresolved: 'an absolute URL or path the check cannot place' };
  return { target: null, unresolved: 'a bare specifier the import map does not resolve', bare: true };
}

/** a tag's attributes in order, name -> value ('' when bare); a repeated name keeps its first value, as in HTML */
function attrsOf(text) {
  const out = new Map();
  for (const m of text.matchAll(/([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
    const k = m[1].toLowerCase();
    if (!out.has(k)) out.set(k, m[2] ?? m[3] ?? m[4] ?? '');
  }
  return out;
}
// what never runs at boot as markup: <template> is inert, the others hold raw text or RCDATA
const SKIP_BODY = new Set(['template', 'style', 'title', 'textarea', 'noscript', 'xmp', 'iframe', 'noembed', 'noframes']);
// the HTML spec's JavaScript MIME type essences, '' (an empty type) and module; any other type is a data block
const JS_TYPES = new Set(['', 'module', 'text/javascript', 'application/javascript', 'application/ecmascript',
  'application/x-ecmascript', 'application/x-javascript', 'text/ecmascript', 'text/javascript1.0', 'text/javascript1.1',
  'text/javascript1.2', 'text/javascript1.3', 'text/javascript1.4', 'text/javascript1.5', 'text/jscript',
  'text/livescript', 'text/x-ecmascript', 'text/x-javascript']);
const lineAt = (text, idx) => text.slice(0, idx).split('\n').length;

/** app.html's <script> and <link> tags in document order, the way a browser tokenizes: comments and SKIP_BODY bodies
 *  are skipped, and a script body (up to its first </script) is never read as markup. { name, attrs, index, body? } */
function htmlTags(html) {
  const tags = [];
  const tag = /<([a-z][a-z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/iy;
  for (let i = html.indexOf('<'); i >= 0; i = html.indexOf('<', i)) {
    if (html.startsWith('<!--', i)) {
      const e = html.startsWith('<!-->', i) ? i + 2 : html.startsWith('<!--->', i) ? i + 3 : html.indexOf('-->', i + 4);
      i = e < 0 ? html.length : e + 3;
      continue;
    }
    tag.lastIndex = i;
    const m = tag.exec(html);
    if (!m) { i++; continue; }
    const name = m[1].toLowerCase();
    const end = i + m[0].length;
    if (name === 'script' || SKIP_BODY.has(name)) {
      const close = new RegExp(`</${name}[\\s/>]`, 'gi');
      close.lastIndex = end;
      const c = close.exec(html);
      const stop = c ? c.index : html.length;
      if (name === 'script') tags.push({ name, attrs: attrsOf(m[2]), index: i, body: html.slice(end, stop), bodyIndex: end });
      i = stop + 1;
      continue;
    }
    if (name === 'link') tags.push({ name, attrs: attrsOf(m[2]), index: i });
    i = end;
  }
  return tags;
}

/** app.html's roots: <script src> / <link href>, the generator's two patterns, its import map, its inline scripts */
function htmlInputs(html) {
  const genRoots = [...html.matchAll(GEN_HTML_SRC_RE), ...html.matchAll(GEN_HTML_IMPORT_RE)].map((m) => stripQuery(m[1]));
  const tagRoots = [];
  const maps = [];
  const inline = [];
  for (const t of htmlTags(html)) {
    const v = t.attrs.get(t.name === 'script' ? 'src' : 'href');
    if (v != null) { // a script with a src runs that file, never its body
      if (v && !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#|\/)/i.test(v)) tagRoots.push({ rel: stripQuery(path.posix.normalize(v.replace(/^\.\//, ''))), line: lineAt(html, t.index) });
      continue;
    }
    if (t.name !== 'script') continue;
    const type = (t.attrs.get('type') ?? 'text/javascript').trim().toLowerCase();
    const startLine = lineAt(html, t.bodyIndex);
    if (type === 'importmap') { maps.push({ startLine, text: t.body }); continue; }
    if (!JS_TYPES.has(type)) continue; // JSON, templates and other data blocks
    try {
      const { edges, opaque } = moduleEdges(t.body, type === 'module' ? 'module' : 'script');
      inline.push({ startLine, edges: edges.map((e) => ({ ...e, line: startLine + e.line - 1 })), opaque: opaque.map((l) => startLine + l - 1) });
    } catch (e) { inline.push({ startLine, error: String(e.message || e).split('\n')[0] }); }
  }
  // the import map: the check applies bare-name keys only, so anything else in it is a finding
  let imports = {};
  let mapBroken = false;
  const mapIssues = [];
  if (maps.length > 1) mapIssues.push(`app.html has ${maps.length} import maps (line ${maps.map((m) => m.startLine).join(', ')}); this check reads the first only`);
  if (maps.length) {
    try {
      const map = JSON.parse(maps[0].text);
      imports = map.imports ?? {};
      if (map.scopes !== undefined) mapIssues.push("app.html's import map has scopes, which this check does not apply");
      for (const k of Object.keys(imports)) {
        if (/^(?:\.{0,2}\/|[a-z][a-z0-9+.-]*:)/i.test(k)) mapIssues.push(`app.html's import map key '${k}' is URL-like; this check applies bare-name keys only`);
      }
    } catch (e) {
      mapBroken = true;
      mapIssues.push(`app.html's import map (line ${maps[0].startLine}) does not parse, so no bare name can be resolved: ${String(e.message || e).split('\n')[0]}`);
    }
  }
  return { genRoots, tagRoots, imports, mapBroken, mapIssues, inline };
}

/**
 * Judge one tree. read(rel) -> text | null over web/; overrides: { manifest, precache, lazy, opaque } replace the
 * tree's inputs (the selftest's plants). Returns { findings: [string], notes: [string], census: string }; only
 * findings fail a run.
 */
export function judge(read, overrides = {}) {
  const html = read('app.html');
  if (html == null) return { findings: ['web/app.html is missing'], notes: [], census: '' };
  const { genRoots, tagRoots, imports, mapBroken, mapIssues, inline } = htmlInputs(html);
  const manifest = overrides.manifest ?? JSON.parse(read('tools/sw-boot-manifest.json') ?? '{"paths":[]}').paths;
  const precache = overrides.precache ?? precacheOf(read('sw.js') ?? '');
  const lazy = overrides.lazy ?? LAZY_EDGES;
  const opaqueRows = overrides.opaque ?? OPAQUE_IMPORTS;
  const findings = [...mapIssues];
  const notes = [];
  const exists = (rel) => read(rel) != null;
  let inGenFileSet = genFileSetOf(read);
  const fileSetKnown = inGenFileSet != null;
  if (!fileSetKnown) { // the file set only shapes the advice, so its loss is a note, not a failure
    notes.push("cannot read the generator's walked file set (ROOT_FILES, WALK_DIRS, EXT_ALLOW) from web/tools/gen-sw-precache.mjs; "
      + 'the advice below cannot tell what the generator walks');
    inGenFileSet = () => true;
  }
  const lazyKey = new Map();
  for (const row of lazy) {
    const [from, to, sites, reason] = row;
    const key = `${from} -> ${to}`;
    if (lazyKey.has(key)) findings.push(`LAZY_EDGES row ${key} appears twice`);
    if (typeof reason !== 'string' || !reason.trim()) findings.push(`LAZY_EDGES row ${key} has no reason`);
    if (!Number.isInteger(sites) || sites < 1) findings.push(`LAZY_EDGES row ${key} has no call-line count`);
    lazyKey.set(key, row);
  }
  // rel -> { edges: [{target, kind, line, spec}], unplaced: [{spec, line, why}], opaque } | { error }
  const parsed = new Map();
  const place = (rel, edges, opaque) => {
    const out = { edges: [], unplaced: [], opaque };
    for (const e of edges) {
      const r = resolveSpec(rel, e, imports, exists);
      if (r.target) out.edges.push({ ...e, target: r.target });
      else if (r.unresolved && !(r.bare && mapBroken)) out.unplaced.push({ spec: e.spec, line: e.line, why: r.unresolved }); // a broken map is one finding
    }
    return out;
  };
  const parse = (rel) => {
    if (!parsed.has(rel)) {
      try { const { edges, opaque } = moduleEdges(read(rel)); parsed.set(rel, place(rel, edges, opaque)); }
      catch (e) { parsed.set(rel, { error: String(e.message || e).split('\n')[0] }); }
    }
    return parsed.get(rel);
  };
  // app.html's inline scripts are one more importer, 'app.html', so its edges can be lazy rows like any module's
  const htmlEdges = [];
  const htmlOpaque = [];
  for (const s of inline) {
    if (s.error) { findings.push(`app.html's inline script at line ${s.startLine} does not parse, so its imports cannot be judged: ${s.error}`); continue; }
    htmlEdges.push(...s.edges);
    htmlOpaque.push(...s.opaque);
  }
  parsed.set('app.html', place('app.html', htmlEdges, htmlOpaque));
  // the full boot closure; via[rel] = { from, line, kind } for the path from a root; importers[rel] = 'from:line'
  const via = new Map([['app.html', { from: 'app.html', line: null, kind: 'root' }]]);
  const importers = new Map();
  const queue = [];
  const staticTargets = new Set();
  const reach = (rel, from) => {
    if (from.kind !== 'root') { if (!importers.has(rel)) importers.set(rel, []); importers.get(rel).push(`${from.from}:${from.line}`); }
    if (!via.has(rel)) { via.set(rel, from); queue.push(rel); }
  };
  const follow = (from, e) => {
    if (MEDIA_RE.test(e.target)) return;
    if (e.kind !== 'static' && lazyKey.has(`${from} -> ${e.target}`)) return;
    if (e.kind === 'static') staticTargets.add(e.target);
    reach(e.target, { from, line: e.line, kind: e.kind });
  };
  for (const t of tagRoots) if (!MEDIA_RE.test(t.rel)) { staticTargets.add(t.rel); reach(t.rel, { from: 'app.html', line: t.line, kind: 'static' }); }
  for (const r of genRoots) reach(r, { from: 'app.html', line: null, kind: 'root' });
  for (const e of parsed.get('app.html').edges) follow('app.html', e);
  for (const r of manifest) if (!MEDIA_RE.test(r) && exists(r)) reach(r, { from: 'tools/sw-boot-manifest.json', line: null, kind: 'root' });
  while (queue.length) {
    const rel = queue.shift();
    if (rel === 'app.html' || !JS_RE.test(rel) || !exists(rel)) continue;
    const p = parse(rel);
    if (p.error) continue;
    for (const e of p.edges) follow(rel, e);
  }
  // what the generator itself precaches: its roots and measured paths in its file set, plus its line-anchored relative
  // static imports, transitively
  const genClosure = new Set();
  {
    const q = [...genRoots, ...manifest.filter((r) => !MEDIA_RE.test(r))];
    const seen = new Set();
    while (q.length) {
      const rel = stripQuery(q.pop());
      if (seen.has(rel)) continue;
      seen.add(rel);
      if (!exists(rel) || !inGenFileSet(rel) || MEDIA_RE.test(rel)) continue;
      genClosure.add(rel);
      if (!JS_RE.test(rel)) continue;
      for (const m of read(rel).matchAll(GEN_STATIC_RE)) q.push(path.posix.normalize(path.posix.join(path.posix.dirname(rel), m[1] || m[2])));
    }
  }
  const chain = (rel) => {
    const parts = [rel];
    for (let cur = rel, guard = 0; guard < 64; guard++) {
      const v = via.get(cur);
      if (!v || v.kind === 'root' || cur === 'app.html') { if (v && cur !== 'app.html') parts.unshift(v.from); break; }
      parts.unshift(`${v.from}:${v.line}`);
      cur = v.from;
    }
    return parts.join(' > ');
  };
  for (const [rel, v] of via) {
    if (MEDIA_RE.test(rel)) continue;
    const p = rel === 'app.html' ? parsed.get('app.html') : JS_RE.test(rel) && exists(rel) ? parse(rel) : null;
    for (const u of p?.unplaced ?? []) findings.push(`${rel}:${u.line} imports '${u.spec}', ${u.why}`);
    if (rel === 'app.html') {
      if (p.opaque.length) findings.push(`app.html line ${p.opaque.join(', ')} has an import() with a computed target; the check cannot follow it`);
      continue;
    }
    if (!exists(rel)) {
      if (v.kind !== 'root') findings.push(`${rel} is imported at boot but does not exist (${chain(rel)})`);
      continue;
    }
    if (p?.error) findings.push(`${rel} does not parse, so its imports cannot be judged: ${p.error}`);
    if (!precache.has(rel)) {
      let fix;
      if (genClosure.has(rel)) fix = `web/sw.js is stale${fileSetKnown ? '' : ' if the generator walks this path'}: run node web/tools/gen-sw-precache.mjs`;
      else if (!inGenFileSet(rel)) fix = 'the generator never precaches this path (outside its walked tree app/, scene/, vendor/, dist/, assets/ or its extensions): move it, or change the generator and this check together';
      else if (staticTargets.has(rel)) fix = 'the generator cannot see this static boot edge (an import-map name, a second import on one line, an app.html tag or inline script it does not match): re-record (node web/tools/e2e-userboot-3g.mjs --record-boot) and run node web/tools/gen-sw-precache.mjs';
      else fix = 'not in the measured boot manifest: re-record (node web/tools/e2e-userboot-3g.mjs --record-boot) and run node web/tools/gen-sw-precache.mjs, or, if it loads only after boot, add a LAZY_EDGES row [importer, target, call lines, reason] for its edge';
      const by = importers.get(rel);
      findings.push(`${rel} is reachable at boot but not in web/sw.js PRECACHE (${chain(rel)})${by ? `; imported by ${[...new Set(by)].join(', ')}` : '; a root'} — ${fix}`);
    }
    if (p?.opaque) {
      const want = opaqueRows[rel]?.[0] ?? 0;
      if (p.opaque.length !== want) {
        findings.push(`${rel} has ${p.opaque.length} import() call(s) with a computed target (line ${p.opaque.join(', ') || '-'}); `
          + `OPAQUE_IMPORTS lists ${want} — the check cannot follow them, so each must be listed with its reason`);
      }
    }
  }
  for (const [rel, row] of Object.entries(opaqueRows)) {
    if (!via.has(rel)) findings.push(`OPAQUE_IMPORTS row ${rel} (${row[0]}) is stale: the module is not reachable at boot`);
    else if (typeof row[1] !== 'string' || !row[1].trim()) findings.push(`OPAQUE_IMPORTS row ${rel} has no reason`);
  }
  for (const [key, row] of lazyKey) {
    const [from, to, sites] = row;
    const p = parsed.get(from);
    if (p?.error) continue; // its parse failure is the finding; its rows cannot be judged
    const lines = via.has(from) && p?.edges ? [...new Set(p.edges.filter((e) => e.target === to && e.kind !== 'static').map((e) => e.line))] : [];
    if (!lines.length) findings.push(`LAZY_EDGES row ${key} is stale: that edge no longer exists in a module reachable at boot`);
    else if (Number.isInteger(sites) && lines.length !== sites) findings.push(`LAZY_EDGES row ${key} lists ${sites} call line(s), found ${lines.length} (line ${lines.join(', ')}): judge each call as boot or lazy, then update the row`);
    else if (precache.has(to)) findings.push(`LAZY_EDGES row ${key} is redundant: ${to} is in web/sw.js PRECACHE now (the row can go)`);
  }
  const reachable = [...via.keys()].filter((r) => r !== 'app.html' && !MEDIA_RE.test(r) && exists(r));
  const opaqueCount = [...parsed.values()].reduce((n, p) => n + (p.opaque?.length ?? 0), 0);
  const census = `${tagRoots.length} app.html tags + ${genRoots.length} generator roots + ${inline.length} inline scripts, `
    + `${manifest.length} manifest paths, ${reachable.length} reachable (${[...parsed.keys()].filter((r) => r !== 'app.html' && via.has(r)).length} modules parsed), `
    + `lazy rows ${lazyKey.size}, computed import() sites ${opaqueCount}`;
  return { findings, notes, census };
}

// ---- readers ---------------------------------------------------------------------------------------------------
const diskReader = (dir) => { const cache = new Map(); return (rel) => {
  if (!cache.has(rel)) { try { cache.set(rel, fs.readFileSync(path.join(dir, rel), 'utf8')); } catch { cache.set(rel, null); } }
  return cache.get(rel);
}; };
const revReader = (rev) => { const cache = new Map(); return (rel) => {
  if (!cache.has(rel)) {
    try { cache.set(rel, execFileSync('git', ['-C', WEB_DIR, 'show', `${rev}:web/${rel}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 28 })); }
    catch { cache.set(rel, null); }
  }
  return cache.get(rel);
}; };
const overlay = (base, files) => (rel) => (Object.prototype.hasOwnProperty.call(files, rel) ? files[rel] : base(rel));

// ---- selftest: each plant must give exactly its expected findings -----------------------------------------------
// Every plant is synthetic: a measured module app/plant-root.js and its own leaves, or an app.html edited through its
// parsed structure, so a refactor elsewhere in the app moves none of them. The keygate incident is replayed by --rev.
function selftest() {
  const base = diskReader(WEB_DIR);
  const baseManifest = JSON.parse(base('tools/sw-boot-manifest.json')).paths;
  const basePrecache = precacheOf(base('sw.js'));
  const baseHtml = base('app.html');
  const ROOT = 'app/plant-root.js';
  const manifest = [...baseManifest, ROOT];
  const precache = new Set([...basePrecache, ROOT]);
  const leaf = 'export const x = 1;\n';
  const lazyRow = [ROOT, 'app/plant-lazy.js', 1, 'a synthetic lazy leaf'];
  const root = (code, leaves = {}) => ({ [ROOT]: code, ...leaves });
  const inputs = (extra = {}) => ({ manifest, precache, ...extra });
  const named = (rel, rest = '') => new RegExp(`^${rel.replace(/[.]/g, '\\.')} is reachable at boot but not in web/sw\\.js PRECACHE ${rest}`);
  const rootLine = (n) => new RegExp(`imported by ${ROOT}:${n}\\b`);
  // app.html edits through its structure: a snippet before the last </body> (or at the end) or just before the import
  // map, the import map edited as JSON or replaced. The map is the one the check reads: htmlTags' first
  // <script type=importmap> outside comments and raw text; only its body changes, so its tag keeps its attributes.
  const withScript = (snippet) => {
    const i = baseHtml.toLowerCase().lastIndexOf('</body>');
    return { 'app.html': i < 0 ? `${baseHtml}\n${snippet}\n` : `${baseHtml.slice(0, i)}${snippet}\n${baseHtml.slice(i)}` };
  };
  const mapTag = htmlTags(baseHtml).find((t) => t.name === 'script' && !t.attrs.has('src') && (t.attrs.get('type') ?? '').trim().toLowerCase() === 'importmap');
  const withMapText = (text) => {
    if (!mapTag) return { 'app.html': baseHtml.replace(/<\/head>/i, () => `<script type="importmap">\n${text}\n</script>\n</head>`) };
    return { 'app.html': `${baseHtml.slice(0, mapTag.bodyIndex)}\n${text}\n${baseHtml.slice(mapTag.bodyIndex + mapTag.body.length)}` };
  };
  const withMap = (edit) => {
    const map = mapTag ? JSON.parse(mapTag.body) : { imports: {} };
    edit(map);
    return withMapText(JSON.stringify(map));
  };
  const withImport = (key, value) => withMap((map) => { map.imports = { ...(map.imports ?? {}), [key]: value }; });
  const beforeMap = (snippet) => {
    if (!mapTag) throw new Error('app.html has no import map to put the snippet before');
    return { 'app.html': `${baseHtml.slice(0, mapTag.index)}${snippet}${baseHtml.slice(mapTag.index)}` };
  };
  const NOTE_GF = /^cannot read the generator's walked file set/;
  const noGen = { 'tools/gen-sw-precache.mjs': '// no constants here\n' };
  // a fixed generator for the plant that needs its walked file set, so a refactor of the real one moves no plant
  const fixedGen = { 'tools/gen-sw-precache.mjs': "const ROOT_FILES = ['app.html', 'manifest.webmanifest'];\n"
    + "const WALK_DIRS = ['app', 'scene', 'vendor', 'dist', 'assets'];\nconst EXT_ALLOW = new Set(['.js', '.mjs', '.css', '.json', '.wasm']);\n" };
  // a base tree whose generator constants cannot be read gives every plant that note: the tree's, not the plant's
  const baseNotes = genFileSetOf(base) ? [] : [NOTE_GF];
  if (baseNotes.length) console.log("SW-BOOT-GRAPH --selftest NOTE: cannot read the generator's walked file set; no plant is failed for that note");
  const plants = [
    ['G', 'the tree as it is', () => [{}, {}], []],
    ['G2', 'a measured synthetic root with a precached static leaf', () => [root("import './plant-a.js';\n", { 'app/plant-a.js': leaf }),
      inputs({ precache: new Set([...precache, 'app/plant-a.js']) })], []],
    ['D', 'a new dynamic boot leaf, not re-recorded (the keygate class)', () => [root("import('./plant-leaf.js').catch(() => {});\n", { 'app/plant-leaf.js': leaf }), inputs()],
      [named('app/plant-leaf.js', `.*imported by ${ROOT}:1 — not in the measured boot manifest`)]],
    ['S', 'a new static import the generator sees, web/sw.js not regenerated', () => [root("import './plant-s.js';\n", { 'app/plant-s.js': leaf }), inputs()],
      [named('app/plant-s.js', `\\(tools/sw-boot-manifest\\.json > ${ROOT}:1 > app/plant-s\\.js\\).* — web/sw\\.js is stale`)]],
    ['S2', 'the same static import with web/sw.js regenerated', () => [root("import './plant-s.js';\n", { 'app/plant-s.js': leaf }),
      inputs({ precache: new Set([...precache, 'app/plant-s.js']) })], []],
    ['S3', 'a second static import on one line, which the generator cannot see', () => [
      root("import './plant-a.js'; import './plant-b.js';\n", { 'app/plant-a.js': leaf, 'app/plant-b.js': leaf }), inputs({ precache: new Set([...precache, 'app/plant-a.js']) })],
      [named('app/plant-b.js', '.* — the generator cannot see this static boot edge')]],
    ['RE', 'a named re-export', () => [root("export { x } from './plant-re.js';\n", { 'app/plant-re.js': leaf }), inputs()], [named('app/plant-re.js', '.* — web/sw\\.js is stale')]],
    ['RA', 'an export * re-export', () => [root("export * from './plant-ra.js';\n", { 'app/plant-ra.js': leaf }), inputs()], [named('app/plant-ra.js', '.* — web/sw\\.js is stale')]],
    ['OUT', 'a boot import outside the generator\'s walked tree', () => [{ ...fixedGen, ...root("import '../tools/plant-out.js';\n", { 'tools/plant-out.js': leaf }) }, inputs()],
      [named('tools/plant-out.js', '.* — the generator never precaches this path')]],
    ['GF', 'a generator whose walk constants cannot be read (a note, not a finding)', () => [noGen, {}], [], [NOTE_GF]],
    ['GF2', 'the same generator and the OUT import (still named; the advice hedges)', () => [{ ...noGen, ...root("import '../tools/plant-out.js';\n", { 'tools/plant-out.js': leaf }) }, inputs()],
      [named('tools/plant-out.js', '.* — web/sw\\.js is stale if the generator walks this path')], [NOTE_GF]],
    ['GF3', 'a generator whose EXT_ALLOW is built from a spread (unreadable: a note, not an empty set)', () => [{
      'tools/gen-sw-precache.mjs': "const ROOT_FILES = ['app.html'];\nconst WALK_DIRS = ['app', 'scene', 'vendor', 'dist', 'assets'];\nconst CODE = ['.js', '.css'];\nconst EXT_ALLOW = new Set([...CODE]);\n",
      ...root("import('./plant-leaf.js').catch(() => {});\n", { 'app/plant-leaf.js': leaf }) }, inputs()],
      [named('app/plant-leaf.js', `.*imported by ${ROOT}:1 — not in the measured boot manifest`)], [NOTE_GF]],
    ['GF5', 'a generator whose EXT_ALLOW mixes a literal and a spread (unreadable, not a partial set)', () => [{
      'tools/gen-sw-precache.mjs': "const ROOT_FILES = ['app.html'];\nconst WALK_DIRS = ['app', 'scene', 'vendor', 'dist', 'assets'];\nconst MORE = ['.css'];\nconst EXT_ALLOW = new Set(['.js', ...MORE]);\n",
      ...root("import('./plant-leaf.js').catch(() => {});\n", { 'app/plant-leaf.js': leaf }) }, inputs()],
      [named('app/plant-leaf.js', `.*imported by ${ROOT}:1 — not in the measured boot manifest`)], [NOTE_GF]],
    ['GF6', 'a generator whose WALK_SKIP is present but not a literal list (unreadable, not "no skip")', () => [{
      'tools/gen-sw-precache.mjs': "const ROOT_FILES = ['app.html'];\nconst WALK_DIRS = ['app', 'scene', 'vendor', 'dist', 'assets'];\nconst EXT_ALLOW = new Set(['.js', '.css']);\n"
        + "const SKIPS = ['vendor/plant-skip'];\nconst WALK_SKIP = new Set(SKIPS);\n",
      ...root("import('./plant-leaf.js').catch(() => {});\n", { 'app/plant-leaf.js': leaf }) }, inputs()],
      [named('app/plant-leaf.js', `.*imported by ${ROOT}:1 — not in the measured boot manifest`)], [NOTE_GF]],
    ['GF4', 'a generator with double-quoted constants (read, no note)', () => [{
      'tools/gen-sw-precache.mjs': 'const ROOT_FILES = ["app.html"];\nconst WALK_DIRS = ["app", "scene", "vendor", "dist", "assets"];\n'
        + 'const EXT_ALLOW = new Set([".js", ".css",\n  ".json"]);\nconst WALK_SKIP = new Set(["vendor/plant-skip"]);\n',
      ...root("import('./plant-leaf.js').catch(() => {});\n", { 'app/plant-leaf.js': leaf }) }, inputs()],
      [named('app/plant-leaf.js', `.*imported by ${ROOT}:1 — not in the measured boot manifest`)]],
    ['MAP', 'an import-mapped name, not precached', () => [{ ...withImport('plant-mapped', './vendor/plant-mapped.js'), ...root("import 'plant-mapped';\n", { 'vendor/plant-mapped.js': leaf }) }, inputs()],
      [named('vendor/plant-mapped.js', '.* — the generator cannot see this static boot edge')]],
    ['IM', 'an import-map prefix key', () => [{ ...withImport('plant/', './vendor/plantdir/'), ...root("import 'plant/x.js';\n", { 'vendor/plantdir/x.js': leaf }) }, inputs()],
      [named('vendor/plantdir/x.js', '.* — the generator cannot see this static boot edge')]],
    ['IMJ', 'an import map that does not parse (one finding, not one per bare name)', () => [withMapText('{ "imports": '), {}], [/^app\.html's import map \(line \d+\) does not parse/]],
    ['IM2', 'a second import map', () => [withScript('<script type="importmap">{ "imports": {} }</script>'), {}], [/^app\.html has 2 import maps/]],
    ['IMX', 'an import map with scopes and a URL-like key', () => [withMap((map) => {
      map.scopes = { './app/': {} };
      map.imports = { ...(map.imports ?? {}), '/plant/x.js': './app/plant-x.js' };
    }), {}], [/^app\.html's import map has scopes/, /^app\.html's import map key '\/plant\/x\.js' is URL-like/]],
    ['UB', 'a bare specifier the import map does not resolve', () => [root("import 'plantlib';\n"), inputs()],
      [new RegExp(`^${ROOT}:1 imports 'plantlib', a bare specifier the import map does not resolve`)]],
    ['NB', 'node built-ins, with and without node: (ignored)', () => [root("if (globalThis.process) { import('fs'); import('node:path'); }\n"), inputs()], []],
    ['NBM', 'a built-in name that the import map maps (followed)', () => [{ ...withImport('events', './vendor/plant-events.js'), ...root("import { x } from 'events';\n", { 'vendor/plant-events.js': leaf }) }, inputs()],
      [named('vendor/plant-events.js', '.* — the generator cannot see this static boot edge')]],
    ['NBP', 'a built-in name used as a mapped prefix (followed)', () => [{ ...withImport('util/', './app/plant-util/'), ...root("import 'util/fmt.js';\n", { 'app/plant-util/fmt.js': leaf }) }, inputs()],
      [named('app/plant-util/fmt.js', '.* — the generator cannot see this static boot edge')]],
    ['NBX', 'a built-in name mapped to a target the check cannot place (named, not ignored)', () => [{ ...withImport('events', '/vendor/plant-events.js'), ...root("import { x } from 'events';\n", { 'vendor/plant-events.js': leaf }) }, inputs()],
      [new RegExp(`^${ROOT}:1 imports 'events', mapped by the import map to '/vendor/plant-events\\.js', which the check cannot place`)]],
    ['MISS', 'a boot edge to a file that does not exist', () => [root("import './plant-missing.js';\n"), inputs()], [/^app\/plant-missing\.js is imported at boot but does not exist/]],
    ['L', 'a lazy pair with its row', () => [root("import('./plant-lazy.js');\n", { 'app/plant-lazy.js': leaf }), inputs({ lazy: [...LAZY_EDGES, lazyRow] })], []],
    ['L2', 'the same pair without its row', () => [root("import('./plant-lazy.js');\n", { 'app/plant-lazy.js': leaf }), inputs()], [named('app/plant-lazy.js', '.*'), rootLine(1)]],
    ['LS', 'a second call of a lazy pair', () => [root("import('./plant-lazy.js');\nimport('./plant-lazy.js');\n", { 'app/plant-lazy.js': leaf }), inputs({ lazy: [...LAZY_EDGES, lazyRow] })],
      [new RegExp(`^LAZY_EDGES row ${ROOT} -> app/plant-lazy\\.js lists 1 call line\\(s\\), found 2 \\(line 1, 2\\)`)]],
    ['LD', 'a lazy pair that lost a call (the row counts two)', () => [root("import('./plant-lazy.js');\n", { 'app/plant-lazy.js': leaf }),
      inputs({ lazy: [...LAZY_EDGES, [ROOT, 'app/plant-lazy.js', 2, 'a synthetic lazy leaf']] })], [new RegExp(`^LAZY_EDGES row ${ROOT} -> app/plant-lazy\\.js lists 2 call line\\(s\\), found 1`)]],
    ['NI', 'a new importer of a lazy target', () => [root("import('./plant-lazy.js');\nimport './plant-other.js';\n", { 'app/plant-lazy.js': leaf, 'app/plant-other.js': "import('./plant-lazy.js');\n" }),
      inputs({ lazy: [...LAZY_EDGES, lazyRow], precache: new Set([...precache, 'app/plant-other.js']) })], [named('app/plant-lazy.js', '.*imported by app/plant-other\\.js:1\\b')]],
    ['Z', 'a lazy row for an edge that does not exist', () => [{}, inputs({ lazy: [...LAZY_EDGES, [ROOT, 'app/no-such-leaf.js', 1, 'plant']] })], [new RegExp(`^LAZY_EDGES row ${ROOT} -> app/no-such-leaf\\.js is stale`)]],
    ['Z2', 'a lazy row whose target is in PRECACHE', () => [root("import('./plant-lazy.js');\n", { 'app/plant-lazy.js': leaf }),
      inputs({ lazy: [...LAZY_EDGES, lazyRow], precache: new Set([...precache, 'app/plant-lazy.js']) })], [new RegExp(`^LAZY_EDGES row ${ROOT} -> app/plant-lazy\\.js is redundant`)]],
    ['R', 'a duplicated lazy row, one without a reason, one without a count', () => [root("import('./plant-lazy.js');\n", { 'app/plant-lazy.js': leaf }),
      inputs({ lazy: [...LAZY_EDGES, lazyRow, [ROOT, 'app/plant-lazy.js', 1, ' '], [ROOT, 'app/plant-lazy.js', undefined, 'x']] })],
      [new RegExp(`^LAZY_EDGES row ${ROOT} -> app/plant-lazy\\.js appears twice`), new RegExp(`^LAZY_EDGES row ${ROOT} -> app/plant-lazy\\.js has no reason`),
        new RegExp(`^LAZY_EDGES row ${ROOT} -> app/plant-lazy\\.js has no call-line count`)]],
    ['T', 'a literal const table imported by member', () => [root("const T = { a: ['./plant-t.js', 'x'] };\nexport const go = (k) => import(T[k][0]);\n", { 'app/plant-t.js': leaf }), inputs()],
      [named('app/plant-t.js', '.*'), rootLine(2)]],
    ['TA', 'an array table with a template-literal leaf', () => [root("const T = [`./plant-ta.js`];\nexport const go = (i) => import(T[i]);\n", { 'app/plant-ta.js': leaf }), inputs()],
      [named('app/plant-ta.js', '.*'), rootLine(2)]],
    ['TB', 'a table leaf that is a bare name the map does not resolve', () => [root("const T = { a: 'plantlib/x.js', b: './plant-tb.js' };\nexport const go = (k) => import(T[k]);\n", { 'app/plant-tb.js': leaf }), inputs()],
      [new RegExp(`^${ROOT}:2 imports 'plantlib/x\\.js', a bare specifier`), named('app/plant-tb.js', '.*')]],
    ['TI', 'a table with an identifier leaf: a computed import()', () => [root("const U = (() => './plant-ti.js')();\nconst T = { a: [U, 'x'] };\nexport const go = (k) => import(T[k][0]);\n", { 'app/plant-ti.js': leaf }), inputs()],
      [new RegExp(`^${ROOT} has 1 import\\(\\) call\\(s\\) with a computed target \\(line 3\\)`)]],
    ['TS', 'a table shadowed by a parameter: a computed import()', () => [root("const T = { a: './plant-ts.js' };\nexport const go = (T, k) => import(T[k]);\n", { 'app/plant-ts.js': leaf }), inputs()],
      [new RegExp(`^${ROOT} has 1 import\\(\\) call\\(s\\) with a computed target \\(line 2\\)`)]],
    ['TM', 'a mutated table: a computed import()', () => [root("const T = { a: './plant-tm.js' };\nT.b = './plant-tm2.js';\nexport const go = (k) => import(T[k]);\n", { 'app/plant-tm.js': leaf }), inputs()],
      [new RegExp(`^${ROOT} has 1 import\\(\\) call\\(s\\) with a computed target \\(line 3\\)`)]],
    ['Q', 'an import() whose template expressions sit in its query', () => [root("const V = 3;\nimport(`./plant-q2.js?v=${V}`).catch(() => {});\n", { 'app/plant-q2.js': leaf }), inputs()],
      [named('app/plant-q2.js', '.*'), rootLine(2)]],
    ['SC', 'an import() of a module-level string const', () => [root("const LEAF = './plant-sc.js';\nimport(LEAF).catch(() => {});\n", { 'app/plant-sc.js': leaf }), inputs()],
      [named('app/plant-sc.js', '.*'), rootLine(2)]],
    ['O', 'an import() with a computed target', () => [root("export const go = (n) => import(n);\n"), inputs()],
      [new RegExp(`^${ROOT} has 1 import\\(\\) call\\(s\\) with a computed target \\(line 1\\); OPAQUE_IMPORTS lists 0`)]],
    ['OS', 'a stale OPAQUE_IMPORTS row', () => [{}, inputs({ opaque: { ...OPAQUE_IMPORTS, 'app/no-such.js': [1, 'plant'] } })], [/^OPAQUE_IMPORTS row app\/no-such\.js \(1\) is stale/]],
    ['OR', 'an OPAQUE_IMPORTS row without a reason', () => [root("export const go = (n) => import(n);\n"), inputs({ opaque: { ...OPAQUE_IMPORTS, [ROOT]: [1, ''] } })],
      [new RegExp(`^OPAQUE_IMPORTS row ${ROOT} has no reason`)]],
    ['P', 'a boot module that does not parse', () => [root('const = ;\n'), inputs()], [new RegExp(`^${ROOT} does not parse`)]],
    ['C', "a comment and a string that spell import('./ui/ghost.js') (no edge)", () => [root("// import('./ui/ghost.js')\nexport const s = \"import('./ui/ghost.js')\";\n"), inputs()], []],
    ['CSS', 'a stylesheet named only through new URL(…, import.meta.url), no ./ and no ?v=', () => [root("export const h = new URL('ui/plant.css', import.meta.url).href;\n", { 'app/ui/plant.css': '.x{}\n' }), inputs()],
      [named('app/ui/plant.css', '.*'), rootLine(1)]],
    ['CSS2', 'a sheet string without ?v=, the sheet on disk and not precached (no edge)', () => [root("export const h = './ui/plant-n.css';\n", { 'app/ui/plant-n.css': '.x{}\n' }), inputs()], []],
    ['CSS3', 'a sheet listed only in a table of ./…css?v= strings (PLACE_SHEETS style)', () => [root("export const SHEETS = [['a', './ui/plant-t.css?v=001']];\n", { 'app/ui/plant-t.css': '.x{}\n' }), inputs()],
      [named('app/ui/plant-t.css', '.*'), rootLine(1)]],
    ['CSS4', 'a document-relative ?v= sheet string', () => [root("export const h = './app/ui/plant-d.css?v=1';\n", { 'app/ui/plant-d.css': '.x{}\n' }), inputs()],
      [named('app/ui/plant-d.css', '.*'), rootLine(1)]],
    ['CSS5', 'a lazy new URL(`./…css?v=…`) call wrapped over two lines, its row counting 1 (one call, one edge)', () => [
      root("export const h = new URL(\n  `./ui/plant-w.css?v=${1}`, import.meta.url).href;\n", { 'app/ui/plant-w.css': '.x{}\n' }),
      inputs({ lazy: [...LAZY_EDGES, [ROOT, 'app/ui/plant-w.css', 1, 'a synthetic lazy sheet']] })], []],
    ['HM', 'an inline module script in app.html importing a new module', () => [{ ...withScript("<script type=\"module\">import './app/plant-inline.js';</script>"), 'app/plant-inline.js': leaf }, {}],
      [named('app/plant-inline.js', '.*imported by app\\.html:\\d+ — the generator cannot see this static boot edge')]],
    ['HQ', 'an import() with a query in an app.html script', () => [{ ...withScript("<script>import('./app/plant-q.js?v=1').catch(() => {});</script>"), 'app/plant-q.js': leaf }, {}],
      [named('app/plant-q.js', '.*imported by app\\.html:\\d+ — not in the measured boot manifest')]],
    ['HL', 'the same app.html import() with a lazy row for it', () => [{ ...withScript("<script>import('./app/plant-q.js?v=1').catch(() => {});</script>"), 'app/plant-q.js': leaf },
      { lazy: [...LAZY_EDGES, ['app.html', 'app/plant-q.js', 1, 'a synthetic lazy inline import']] }], []],
    ['HP', 'an inline script that does not parse', () => [withScript('<script>const = ;</script>'), {}], [/^app\.html's inline script at line \d+ does not parse/]],
    ['HB', 'an inline module script with an unresolved bare name', () => [withScript("<script type=\"module\">import 'plantlib';</script>"), {}], [/^app\.html:\d+ imports 'plantlib', a bare specifier/]],
    ['HO', 'an inline script with a computed import()', () => [withScript('<script>const n = location.hash; import(n);</script>'), {}], [/^app\.html line \d+ has an import\(\) with a computed target/]],
    ['HC', 'a comment naming <script> before a real script, and a commented-out script (no false red)', () => [{ ...withScript(
      "<!-- keep the <script> below last -->\n<script>import('./app/plant-ok.js').catch(() => {});</script>\n"
      + "<!-- <script type=\"module\">import './app/plant-old.js';</script> -->"), 'app/plant-ok.js': leaf },
      { precache: new Set([...basePrecache, 'app/plant-ok.js']) }], []],
    ['HS', "a single-quoted src without ./", () => [{ ...withScript("<script type='module' src='app/plant-sq.js'></script>"), 'app/plant-sq.js': leaf }, {}],
      [named('app/plant-sq.js', '.*imported by app\\.html:\\d+ — the generator cannot see this static boot edge')]],
    ['HSC', 'a CSS comment naming <script>, ahead of the import map (no false red)', () => [beforeMap('<style>\n  /* the boot driver <script> below polls these milestones */\n</style>\n'), {}], []],
    // HX and HE carry a ?v= query, so only the inline-script parse can see their import (the generator's pattern cannot)
    ['HX', "an inline script holding '<!--' and '-->' strings around a real import()", () => [{ ...withScript(
      "<script>const a = '<!--'; import('./app/plant-x.js?v=1').catch(() => {}); const b = '-->';</script>"), 'app/plant-x.js': leaf }, {}],
      [named('app/plant-x.js', '.*imported by app\\.html:\\d+ — not in the measured boot manifest')]],
    ['HD', 'an inline module script carrying data-type and data-src attributes', () => [{ ...withScript(
      "<script data-type=\"text/plain\" type=\"module\" data-src=\"x\">import './app/plant-ds.js';</script>"), 'app/plant-ds.js': leaf }, {}],
      [named('app/plant-ds.js', '.*imported by app\\.html:\\d+ — the generator cannot see this static boot edge')]],
    ['HE', 'an inline script with an empty type (a classic script)', () => [{ ...withScript("<script type=\"\">import('./app/plant-e.js?v=1').catch(() => {});</script>"), 'app/plant-e.js': leaf }, {}],
      [named('app/plant-e.js', '.*imported by app\\.html:\\d+ — not in the measured boot manifest')]],
  ];
  let bad = 0;
  for (const [name, what, build, want, wantNotes = []] of plants) {
    let findings;
    let notes;
    try {
      const [files, overrides] = build();
      ({ findings, notes } = judge(overlay(base, files), overrides));
    } catch (e) {
      bad++;
      console.log(`  BAD  ${name}: ${what} — the plant could not be built or judged: ${String(e.message || e).split('\n')[0]}`);
      continue;
    }
    // every plant gives exactly its findings and its notes (beyond the base tree's own): an unexpected note is as bad
    // as an unexpected finding
    const unmatched = [...want.filter((re) => !findings.some((f) => re.test(f))), ...wantNotes.filter((re) => !notes.some((n) => re.test(n)))];
    const extra = [...findings.filter((f) => !want.some((re) => re.test(f))),
      ...notes.filter((n) => ![...wantNotes, ...baseNotes].some((re) => re.test(n))).map((n) => `NOTE ${n}`)];
    if (unmatched.length || extra.length) {
      bad++;
      console.log(`  BAD  ${name}: ${what}`);
      for (const re of unmatched) console.log(`       missing a finding or note matching ${re}`);
      for (const f of extra) console.log(`       unexpected: ${f.slice(0, 240)}`);
    } else console.log(`  ok   ${name}: ${what}${want.length ? ' -> named' : ' -> green'}${wantNotes.length ? ' + note' : ''}`);
  }
  if (bad) { console.log(`SW-BOOT-GRAPH --selftest: FAIL (${bad} of ${plants.length})`); return 1; }
  console.log(`SW-BOOT-GRAPH --selftest: OK (${plants.length} plants)`);
  return 0;
}

// ---- main --------------------------------------------------------------------------------------------------------
function main() {
  const usage = (why) => { console.error(`test-sw-boot-graph: ${why}; usage: [--selftest | --rev <rev>]`); return 2; };
  const args = process.argv.slice(2);
  let mode = 'tree';
  let rev = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--selftest' && mode === 'tree') mode = 'selftest';
    else if ((a === '--rev' || a.startsWith('--rev=')) && mode === 'tree') {
      rev = a === '--rev' ? args[++i] : a.slice(6);
      if (!rev || rev.startsWith('--')) return usage('--rev needs a revision');
      mode = 'rev';
    } else return usage(`unexpected argument '${a}'`);
  }
  if (mode === 'selftest') return selftest();
  const read = mode === 'rev' ? revReader(rev) : diskReader(WEB_DIR);
  if (mode === 'rev' && read('app.html') == null) return usage(`--rev ${rev}: no web/app.html there`);
  const { findings, notes, census } = judge(read);
  for (const n of notes) console.log(`SW-BOOT-GRAPH NOTE: ${n}`);
  for (const f of findings) console.log(`SW-BOOT-GRAPH FAIL: ${f}`);
  console.log(`SW-BOOT-GRAPH census${rev ? ` @ ${rev}` : ''}: ${census}`);
  console.log(findings.length ? `SW-BOOT-GRAPH FAIL (${findings.length})` : 'SW-BOOT-GRAPH OK');
  return findings.length ? 1 : 0;
}

// realpath on both sides: a run through a symlinked path (macOS /tmp, /var/folders) still runs
const entry = process.argv[1] ? (() => { try { return fs.realpathSync(process.argv[1]); } catch { return null; } })() : null;
if (entry && entry === fs.realpathSync(fileURLToPath(import.meta.url))) process.exitCode = main();
