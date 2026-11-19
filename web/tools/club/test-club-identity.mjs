#!/usr/bin/env node

// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-club-identity.mjs — the node part of the identity arm of the `club` look: with the look off, the app is the app it
// was at the base commit. (The browser part, test-club-identity-browser.mjs, compares program censuses and request logs of
// real boots; pinned captures on the capture GPU are the lead's.)
//
// THE ASSERTION. Against the base commit (default b913ef8ba) the arm is red when:
//   PATH     the working tree changes, adds or removes a path outside the allowed set: the seam files (web/app/main.js,
//            web/app/settings.js, the seven locale files), new files under web/scene/club/, web/assets/club/ and
//            web/tools/club/, the nine named r170 addons and their provenance file, web/vendor/LICENSES.md (the notice
//            census requires every vendored file to be named there), the two re-pinned gate fixtures, and (at the seal)
//            web/sw.js and web/app.html. A path under a "new files only" root that exists at the base is red.
//   SEAM     web/app/main.js does not carry exactly one dynamic import of scene/club/index.js
//   GUARD    that import is not inside the `if (club) { ... }` block of main.js, or the hand-over `club:` is not `bootClub ?
//            { ... } : null` (round 4: with the look off the entry is never requested, so no module of the look, no
//            listener and no audio node can exist: everything the look does starts in installClub)
//   OPTION   web/app/settings.js shows a club <option> or an arena <option> (round A1: the `arena` look id is the club leaf
//            with another venue; both stay hidden until the owner signs the look off)
//   LOCALE   a locale file changes anything but adding the lane's keys, or the seven files do not add the same keys
//   IMPORT   a shipped file outside web/scene/club/ names a path under web/scene/club/ or web/assets/club/ in a string,
//            except the one dynamic import in web/app/main.js (and, at the seal, the generated rows of web/sw.js)
//   QUERY    a shipped file outside web/scene/club/ names a boot parameter of the look (a string `club<word>`: clubtier,
//            clubcloth, ...), except `clubtimeout` once inside the `if (club) { ... }` block of main.js (round A2: the tool
//            switch `?clubcloth=app` is read by the cloth part under the arena venue only; with the look off nothing of the
//            leaf loads, so the parameter is never read)
//   SIDE     a club module does something at import: a top-level statement that is not a declaration, a top-level await or
//            dynamic import, or an initialiser (also through a function of the same module that it calls) that names
//            window, document or another page global
//   PARSE    a club module does not parse
// Round 4 (sound and motion): the audio constructors count as page globals for SIDE (an AudioContext or an audio node made
// at import is red), and the round-4 modules (audio.js, audio/*, motion.js, motion/*) are counted in the summary line; PATH
// keeps web/app/sound.js, synth.js and export-audio.js byte-equal to the base (the export's audio plan is the app's).
// Limits, stated: IMPORT reads string literals, so a path assembled at run time is not seen (the browser part's request
// log covers that); SIDE follows calls inside one module, not into another module, and does not model shadowing.
//
// Read-only (git diff / ls-files / cat-file / show). Usage:
//   node web/tools/club/test-club-identity.mjs [--base <rev>]    exit 0 = green, 1 = red, 2 = could not run
//   node web/tools/club/test-club-identity.mjs --tree            the rules that need no base (the CI form: PATH and the
//                                                                locale diff describe the lane's branch against its base
//                                                                and stop meaning anything once other work lands on
//                                                                main; here each locale must carry the lane's keys)
//   node web/tools/club/test-club-identity.mjs --selftest        planted reds for every code
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const DEFAULT_BASE = 'b913ef8ba';
const LOCALES = ['en', 'de', 'fr', 'es', 'ja', 'ko', 'zh-CN'];
const LOCALE_FILES = LOCALES.map((l) => `web/app/locales/${l}.json`);
export const LANE_LOCALE_KEYS = ['settings.lookClub', 'settings.lookArena', 'settings.lookChangeReloadConfirm']; // round A1: + the arena venue's label
// files that exist at the base and may change
const SEAM_FILES = new Set(['web/app/main.js', 'web/app/settings.js', ...LOCALE_FILES,
  'tools/fixtures/provenance-tags.json', 'web/tools/fixtures/equipment-mixed-cache-census.json',
  'web/vendor/LICENSES.md', 'web/sw.js', 'web/app.html',
  // the seal's two seams (ruling 09379467): one LAZY_EDGES row for main.js's guarded import of the leaf, and the
  // precache generator's skip list (the looks' trees and their vendor modules stay out of a default install)
  'web/tools/test-sw-boot-graph.mjs', 'web/tools/gen-sw-precache.mjs']);
// roots and files that must be NEW (absent at the base)
const NEW_ROOTS = ['web/scene/club/', 'web/assets/club/', 'web/tools/club/'];
const NEW_FILES = new Set(['postprocessing/GTAOPass.js', 'postprocessing/SMAAPass.js', 'postprocessing/BokehPass.js', 'loaders/RGBELoader.js',
  'shaders/GTAOShader.js', 'shaders/PoissonDenoiseShader.js', 'math/SimplexNoise.js', 'shaders/SMAAShader.js', 'shaders/BokehShader.js',
  'PROVENANCE-club.md'].map((f) => `web/vendor/jsm/${f}`));
const CLUB_IMPORT = /\bimport\(\s*['"]([^'"]*scene\/club\/[^'"]*)['"]\s*\)/g;

const git = (args) => execFileSync('git', ['-C', ROOT, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 512 * 1024 * 1024 });

// ---- (a) paths -----------------------------------------------------------------------------------------------------------
/** entries: [{ status: 'M' | 'A' | 'D' | 'R' | '?', path }]; existsAtBase(path) -> boolean. */
export function judgePaths(entries, existsAtBase) {
  const failures = [];
  for (const { status, path: p } of entries) {
    if (p.endsWith('.DS_Store')) { failures.push({ code: 'PATH', where: p, msg: 'a Finder file in the tree' }); continue; }
    if (status === 'D' || status.startsWith('R')) { failures.push({ code: 'PATH', where: p, msg: `status ${status}: the lane removes or renames nothing` }); continue; }
    const isNewRoot = NEW_ROOTS.some((r) => p.startsWith(r)) || NEW_FILES.has(p);
    if (isNewRoot) {
      if (existsAtBase(p)) failures.push({ code: 'PATH', where: p, msg: 'exists at the base: only new files are allowed here' });
      continue;
    }
    if (SEAM_FILES.has(p)) {
      if (!existsAtBase(p)) failures.push({ code: 'PATH', where: p, msg: 'a seam file that is absent at the base' });
      continue;
    }
    failures.push({ code: 'PATH', where: p, msg: `status ${status}: outside the seams and the club directories` });
  }
  return failures;
}

// ---- the guard of the one import (round 4: look off = nothing of the look exists) ---------------------------------------------
/**
 * The dynamic import of the club entry must sit inside the block of an `if (club) {` statement, and `club` must be handed to
 * the loop as `bootClub ? { ... } : null`. Text rules on main.js (strings and comments between the `if` and the import are
 * not modelled: the block is short and the braces in it are balanced code).
 */
export function judgeGuard(mainJs) {
  const failures = [];
  const fail = (msg) => failures.push({ code: 'GUARD', where: 'web/app/main.js', msg });
  const at = mainJs.search(/\bimport\(\s*['"][^'"]*scene\/club\/index\.js['"]\s*\)/);
  if (at < 0) return failures; // SEAM reports a missing import
  const head = mainJs.slice(0, at);
  const open = head.lastIndexOf('if (club) {');
  if (open < 0) fail('the import of the club entry is not preceded by `if (club) {`');
  else {
    let depth = 0, closed = false;
    for (const ch of head.slice(open)) { if (ch === '{') depth += 1; else if (ch === '}') { depth -= 1; if (depth <= 0) { closed = true; break; } } }
    if (closed || depth < 1) fail('the `if (club) {` block closes before the import of the club entry: the import is not guarded');
  }
  if (!/\bclub:\s*bootClub\s*\?\s*\{[^{}]*\}\s*:\s*null\b/.test(mainJs)) fail('the hand-over is not `club: bootClub ? { ... } : null` (it must be null on every boot without the look)');
  return failures;
}

// ---- seam content ----------------------------------------------------------------------------------------------------------
/** texts: { mainJs, settingsJs }; locales: [{ locale, base: object, tip: object }]. */
export function judgeSeams({ mainJs, settingsJs }, locales) {
  const failures = [];
  const imports = [...mainJs.matchAll(CLUB_IMPORT)].map((m) => m[1]);
  if (imports.length !== 1 || !/(^|\/)scene\/club\/index\.js$/.test(imports[0] ?? '')) {
    failures.push({ code: 'SEAM', where: 'web/app/main.js', msg: `want exactly one dynamic import of scene/club/index.js, found ${imports.length} (${imports.join(', ') || 'none'})` });
  }
  if (/^\s*import\b[^;'"(]*['"][^'"]*scene\/club\//m.test(mainJs) || /\bfrom\s*['"][^'"]*scene\/club\//.test(mainJs)) {
    failures.push({ code: 'SEAM', where: 'web/app/main.js', msg: 'a static import of the club directory' });
  }
  failures.push(...judgeGuard(mainJs));
  for (const id of ['club', 'arena']) { // round A1: the same rule for the arena venue's look id
    if (new RegExp(`<option\\b[^>]*\\bvalue\\s*=\\s*(['"]?)${id}\\1`, 'i').test(settingsJs)) {
      failures.push({ code: 'OPTION', where: 'web/app/settings.js', msg: `${id === 'club' ? 'a club' : 'an arena'} <option> in the markup: it stays hidden until the owner signs the look off` });
    }
  }
  const addedBy = new Map();
  for (const { locale, base, tip } of locales) {
    const where = `web/app/locales/${locale}.json`;
    const added = Object.keys(tip).filter((k) => !(k in base));
    addedBy.set(locale, added.slice().sort().join(','));
    for (const k of Object.keys(base)) {
      if (!(k in tip)) failures.push({ code: 'LOCALE', where, msg: `key ${k} was removed` });
      else if (tip[k] !== base[k]) failures.push({ code: 'LOCALE', where, msg: `the value of ${k} changed` });
    }
    for (const k of added) {
      if (!LANE_LOCALE_KEYS.includes(k)) failures.push({ code: 'LOCALE', where, msg: `key ${k} is not one of the lane's keys (${LANE_LOCALE_KEYS.join(', ')})` });
      else if (typeof tip[k] !== 'string' || !tip[k].trim()) failures.push({ code: 'LOCALE', where, msg: `key ${k} is empty` });
    }
  }
  const sets = new Set(addedBy.values());
  if (sets.size > 1) failures.push({ code: 'LOCALE', where: 'web/app/locales', msg: `the locale files do not add the same keys: ${[...addedBy].map(([l, k]) => `${l}=[${k}]`).join(' ')}` });
  return failures;
}

// ---- (b) imports -----------------------------------------------------------------------------------------------------------
const INSIDE = (p) => p.startsWith('web/scene/club/') || p.startsWith('web/assets/club/');
/** files: [{ path, text }], every shipped text file OUTSIDE the club directories. */
export function judgeImports(files) {
  const failures = [];
  let allowed = 0;
  for (const { path: p, text } of files) {
    if (!text.includes('club/')) continue;
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.includes('club/')) continue;
      for (const m of line.matchAll(/(['"`])((?:(?!\1)[^\\\n]|\\.)*?\bclub\/(?:(?!\1)[^\\\n]|\\.)*?)\1/g)) {
        const spec = m[2];
        let target = null;
        if (/(^|\/)(scene|assets)\/club\//.test(spec)) target = spec;
        else if (/^\.{1,2}\//.test(spec)) { const r = path.posix.normalize(path.posix.join(path.posix.dirname(p), spec)); if (INSIDE(r)) target = r; }
        if (!target) continue;
        const where = `${p}:${i + 1}`;
        if (p === 'web/app/main.js' && new RegExp(`\\bimport\\(\\s*${m[1]}${spec.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}${m[1]}\\s*\\)`).test(line) && /scene\/club\/index\.js$/.test(spec)) { allowed += 1; continue; }
        if (p === 'web/sw.js' && /^\s*\['\.\/(?:scene|assets)\/club\/[^']+', '[0-9a-f]{16}', \d+\],\s*$/.test(line)) continue; // a generated precache row
        failures.push({ code: 'IMPORT', where, msg: `names ${spec} — nothing outside web/scene/club/ may reach into the club directories` });
      }
    }
  }
  if (allowed > 1) failures.push({ code: 'IMPORT', where: 'web/app/main.js', msg: `${allowed} dynamic imports of the club entry, want one` });
  return { failures, allowed };
}

// ---- (b2) the look's private boot parameters (round A2) ---------------------------------------------------------------------
// Every `?club<word>=` parameter (clubtier, clubknobs, clubcloth, clubpost, ...) is read inside the leaf, and the leaf is
// never requested with the look off: so with the look off no such parameter can change anything. That holds only while no
// shipped file OUTSIDE the leaf names one. The one name allowed outside is `clubtimeout` in web/app/main.js, once, inside
// the `if (club) { ... }` block (the length of the boot hold; `club` is null on every boot without the look).
// Round A2's tool switch `?clubcloth=app` is covered by this rule like every other: a seam that read it would be red.
const LOOK_PARAM = /(['"`])(club[a-z]{2,})\1/g;
/** files: [{ path, text }], every shipped text file OUTSIDE the club directories. */
export function judgeQuery(files) {
  const failures = [];
  let allowed = 0;
  for (const { path: p, text } of files) {
    if (!text.includes('club')) continue;
    for (const m of text.matchAll(LOOK_PARAM)) {
      const line = text.slice(0, m.index).split('\n').length;
      if (p === 'web/app/main.js' && m[2] === 'clubtimeout') {
        const head = text.slice(0, m.index);
        const open = head.lastIndexOf('if (club) {');
        let depth = 0, closed = open < 0;
        if (open >= 0) for (const ch of head.slice(open)) { if (ch === '{') depth += 1; else if (ch === '}') { depth -= 1; if (depth <= 0) { closed = true; break; } } }
        if (!closed && depth >= 1) { allowed += 1; continue; }
        failures.push({ code: 'QUERY', where: `${p}:${line}`, msg: '`clubtimeout` is read outside the `if (club) { ... }` block: a boot without the look would read a parameter of the look' });
        continue;
      }
      failures.push({ code: 'QUERY', where: `${p}:${line}`, msg: `names the look's boot parameter \`${m[2]}\` outside the club directories — with the look off no parameter of the look may be read` });
    }
  }
  if (allowed > 1) failures.push({ code: 'QUERY', where: 'web/app/main.js', msg: `\`clubtimeout\` is named ${allowed} times in the guarded block, want one` });
  return { failures, allowed };
}

// ---- (c) module-level side effects -------------------------------------------------------------------------------------------
const PAGE_GLOBALS = new Set(['window', 'document', 'globalThis', 'self', 'top', 'parent', 'navigator', 'location', 'history', 'localStorage', 'sessionStorage',
  'indexedDB', 'caches', 'fetch', 'XMLHttpRequest', 'WebSocket', 'Worker', 'Image', 'Audio', 'AudioContext', 'OffscreenCanvas', 'createImageBitmap',
  'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'setTimeout', 'setInterval', 'queueMicrotask', 'addEventListener',
  'removeEventListener', 'dispatchEvent', 'matchMedia', 'devicePixelRatio', 'innerWidth', 'innerHeight', 'alert', 'confirm', 'prompt', 'console',
  // round 4: anything that makes sound or an audio graph
  'webkitAudioContext', 'OfflineAudioContext', 'BaseAudioContext', 'AudioNode', 'AudioBuffer', 'AudioBufferSourceNode', 'AudioWorkletNode', 'GainNode',
  'OscillatorNode', 'BiquadFilterNode', 'ConvolverNode', 'DelayNode', 'DynamicsCompressorNode', 'StereoPannerNode', 'PannerNode', 'WaveShaperNode',
  'ConstantSourceNode', 'IIRFilterNode', 'AnalyserNode', 'MediaElementAudioSourceNode', 'MediaStreamAudioDestinationNode', 'speechSynthesis', 'SpeechSynthesisUtterance']);
const FUNCTIONS = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);

/** Findings for one club module: [{ line, msg }] (throws when the text does not parse). */
export function moduleSideEffects(acorn, text) {
  const ast = acorn.parse(text, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
  const findings = [];
  const at = (node, msg) => findings.push({ line: node.loc.start.line, msg });
  // module-scope bindings: a top-level `const self = ...` shadows the page global of that name
  const local = new Set();
  const functions = new Map(); // name -> function node declared at module scope
  const bind = (pattern) => {
    if (!pattern) return;
    if (pattern.type === 'Identifier') local.add(pattern.name);
    else if (pattern.type === 'ObjectPattern') for (const p of pattern.properties) bind(p.type === 'RestElement' ? p.argument : p.value);
    else if (pattern.type === 'ArrayPattern') for (const p of pattern.elements) bind(p);
    else if (pattern.type === 'RestElement') bind(pattern.argument);
    else if (pattern.type === 'AssignmentPattern') bind(pattern.left);
  };
  const decl = (node) => {
    if (!node) return;
    if (node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') { if (node.id) local.add(node.id.name); if (node.type === 'FunctionDeclaration' && node.id) functions.set(node.id.name, node); }
    else if (node.type === 'VariableDeclaration') for (const d of node.declarations) { bind(d.id); if (d.id.type === 'Identifier' && d.init && FUNCTIONS.has(d.init.type)) functions.set(d.id.name, d.init); }
  };
  for (const node of ast.body) {
    if (node.type === 'ImportDeclaration') for (const s of node.specifiers) local.add(s.local.name);
    else if (node.type === 'ExportNamedDeclaration' || node.type === 'ExportDefaultDeclaration') decl(node.declaration);
    else decl(node);
  }
  const entered = new Set();
  // names declared anywhere inside a function body that is about to be walked (not inside functions nested in it)
  const collect = (node) => {
    if (!node || typeof node.type !== 'string') return;
    if (node.type === 'VariableDeclaration') for (const d of node.declarations) bind(d.id);
    if ((node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') && node.id) local.add(node.id.name);
    if (node.type === 'CatchClause') bind(node.param);
    for (const k of Object.keys(node)) {
      if (k === 'loc') continue;
      const v = node[k];
      if (Array.isArray(v)) { for (const c of v) if (c && typeof c.type === 'string' && !FUNCTIONS.has(c.type)) collect(c); } else if (v && typeof v.type === 'string' && !FUNCTIONS.has(v.type)) collect(v);
    }
  };
  // walk code that RUNS at import; a function body runs only when the function is called from such code
  const run = (node, parent, key) => {
    if (!node || typeof node.type !== 'string') return;
    switch (node.type) {
      case 'FunctionDeclaration': case 'FunctionExpression': case 'ArrowFunctionExpression':
        return; // defined, not run
      case 'ClassDeclaration': case 'ClassExpression':
        run(node.superClass, node, 'superClass');
        for (const el of node.body.body) {
          if (el.computed) run(el.key, el, 'key');
          if (el.type === 'StaticBlock') for (const s of el.body) run(s, el, 'body');
          else if (el.type === 'PropertyDefinition' && el.static) run(el.value, el, 'value');
        }
        return;
      case 'AwaitExpression': at(node, 'a top-level await (it holds the whole import)'); break;
      case 'ImportExpression': at(node, 'a dynamic import at module level'); break;
      case 'Identifier':
        if (PAGE_GLOBALS.has(node.name) && !local.has(node.name)) at(node, `names the page global \`${node.name}\` at import`);
        return;
      case 'MemberExpression':
        run(node.object, node, 'object');
        if (node.computed) run(node.property, node, 'property');
        return;
      case 'Property': case 'PropertyDefinition': case 'MethodDefinition':
        if (node.computed) run(node.key, node, 'key');
        run(node.value, node, 'value');
        return;
      case 'CallExpression': case 'NewExpression': {
        const callee = node.callee;
        const target = FUNCTIONS.has(callee.type) ? callee : (callee.type === 'Identifier' ? functions.get(callee.name) : null);
        if (target && !entered.has(target)) {
          entered.add(target);
          // the function's own parameters and variables shadow page globals of the same name (kept for the rest of the
          // walk: the scan may then miss a later use of that global, never invent one)
          for (const p of target.params) bind(p);
          collect(target.body);
          for (const p of target.params) if (p.type === 'AssignmentPattern') run(p.right, p, 'right');
          run(target.body, target, 'body');
        }
        if (!FUNCTIONS.has(callee.type)) run(callee, node, 'callee');
        for (const a of node.arguments) run(a, node, 'arguments');
        return;
      }
      default: break;
    }
    for (const k of Object.keys(node)) {
      if (k === 'loc' || k === 'type' || k === 'start' || k === 'end') continue;
      const v = node[k];
      if (Array.isArray(v)) for (const c of v) run(c, node, k);
      else if (v && typeof v.type === 'string') run(v, node, k);
    }
    void parent; void key;
  };
  for (const node of ast.body) {
    switch (node.type) {
      case 'ImportDeclaration': case 'ExportAllDeclaration': case 'FunctionDeclaration': case 'EmptyStatement': break;
      case 'ExportNamedDeclaration': if (node.declaration) run(node.declaration, node, 'declaration'); break;
      case 'ExportDefaultDeclaration': run(node.declaration, node, 'declaration'); break;
      case 'VariableDeclaration': case 'ClassDeclaration': run(node, ast, 'body'); break;
      case 'ExpressionStatement':
        if (typeof node.directive === 'string') break;
        at(node, 'a top-level statement that is not a declaration runs at import');
        run(node, ast, 'body');
        break;
      default:
        at(node, `a top-level ${node.type} runs at import`);
        run(node, ast, 'body');
    }
  }
  return findings;
}
/** modules: [{ path, text }] */
export function judgeSideEffects(acorn, modules) {
  const failures = [];
  for (const { path: p, text } of modules) {
    let found;
    try { found = moduleSideEffects(acorn, text); } catch (e) { failures.push({ code: 'PARSE', where: p, msg: e.message }); continue; }
    for (const f of found) failures.push({ code: 'SIDE', where: `${p}:${f.line}`, msg: f.msg });
  }
  return failures;
}

// ---- the working tree --------------------------------------------------------------------------------------------------------
async function loadAcorn() {
  return import('../../../tools/render/lib/vendor/acorn/acorn.mjs'); // a literal specifier, like every dynamic import of the lane
}
const SHIPPED_TEXT = /\.(?:js|mjs|html|css|json|webmanifest)$/;

/** base: a rev, or null for --tree (no base is read: PATH is not judged and LOCALE asks only for the lane's keys). */
async function main(base) {
  const tree = base === null;
  if (!tree) {
    try { git(['rev-parse', '--verify', '--quiet', `${base}^{commit}`]); } catch {
      process.stdout.write(`test-club-identity: base ${base} does not exist in this clone — refusing to report on a diff that was never read\n`);
      return 2;
    }
  }
  const failures = [];
  const entries = [];
  const untracked = git(['ls-files', '--others', '--exclude-standard']).split('\n').filter(Boolean);
  if (!tree) {
    for (const line of git(['diff', '--name-status', '--no-renames', base, '--']).split('\n').filter(Boolean)) {
      const [status, ...rest] = line.split('\t');
      entries.push({ status, path: rest[rest.length - 1] });
    }
    for (const p of untracked) entries.push({ status: '?', path: p });
    const baseTree = new Set(git(['ls-tree', '-r', '--name-only', base]).split('\n').filter(Boolean));
    failures.push(...judgePaths(entries, (p) => baseTree.has(p)));
  }

  const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
  const locales = LOCALES.map((locale) => {
    const tip = JSON.parse(read(`web/app/locales/${locale}.json`));
    // --tree: the file without the lane's keys stands in for the base, so the seam rule asks that each key is a filled string
    const was = tree ? Object.fromEntries(Object.entries(tip).filter(([k]) => !LANE_LOCALE_KEYS.includes(k))) : JSON.parse(git(['show', `${base}:web/app/locales/${locale}.json`]));
    if (tree) for (const k of LANE_LOCALE_KEYS) if (!(k in tip)) failures.push({ code: 'LOCALE', where: `web/app/locales/${locale}.json`, msg: `key ${k} is missing` });
    return { locale, base: was, tip };
  });
  failures.push(...judgeSeams({ mainJs: read('web/app/main.js'), settingsJs: read('web/app/settings.js') }, locales));

  const tracked = git(['ls-files', '--', 'web', 'site']).split('\n').filter(Boolean);
  const all = [...new Set([...tracked, ...untracked.filter((p) => p.startsWith('web/') || p.startsWith('site/'))])].sort();
  const outside = [], club = [];
  let bytes = 0;
  for (const p of all) {
    if (p.startsWith('web/tools/')) continue;
    const abs = path.join(ROOT, p);
    if (p.startsWith('web/scene/club/')) { if (/\.m?js$/.test(p) && fs.existsSync(abs)) club.push({ path: p, text: fs.readFileSync(abs, 'utf8') }); continue; }
    if (p.startsWith('web/assets/club/') || !SHIPPED_TEXT.test(p)) continue;
    let st; try { st = fs.statSync(abs); } catch { continue; }
    if (!st.isFile()) continue;
    const text = fs.readFileSync(abs, 'utf8');
    bytes += text.length;
    outside.push({ path: p, text });
  }
  const imp = judgeImports(outside);
  failures.push(...imp.failures);
  if (imp.allowed !== 1) failures.push({ code: 'IMPORT', where: 'web/app/main.js', msg: `the one allowed dynamic import was found ${imp.allowed} times` });
  const qry = judgeQuery(outside); // round A2: the look's boot parameters (the tool switch ?clubcloth=app among them) are read inside the leaf only
  failures.push(...qry.failures);
  failures.push(...judgeSideEffects(await loadAcorn(), club));

  for (const f of failures) process.stdout.write(`  FAIL ${f.code} ${f.where}: ${f.msg}\n`);
  const by = (s) => entries.filter((e) => e.status === s).length;
  const r4 = club.map((m) => m.path.slice('web/scene/club/'.length)).filter((f) => /^(?:audio|motion)(?:\.js$|\/)/.test(f));
  process.stdout.write(`test-club-identity: ${failures.length ? `${failures.length} FAILURE(S)` : 'OK'} — ${tree ? `the tree alone (PATH not judged; the lane's ${LANE_LOCALE_KEYS.length} keys asked of ${LOCALES.length} locale files)` : `base ${base}: ${by('M')} changed, ${by('A')} added, ${by('?')} untracked, ${by('D')} removed`};`
    + ` ${outside.length} shipped text files outside the club directories read for paths into them (${(bytes / 1e6).toFixed(1)} MB), ${imp.allowed} allowed import;`
    + ` no boot parameter of the look is named outside the leaf (${qry.allowed} guarded \`clubtimeout\` in main.js);`
    + ` ${club.length} club modules scanned for work at import (round 4: ${r4.length} of them under audio / motion${r4.length ? `: ${r4.join(', ')}` : ''})\n`);
  return failures.length ? 1 : 0;
}

async function selftest() {
  const acorn = await loadAcorn();
  let ok = true;
  const arm = (name, want, failures) => {
    const codes = [...new Set(failures.map((f) => f.code))];
    const good = want === null ? failures.length === 0 : codes.length === 1 && codes[0] === want;
    ok &&= good;
    process.stdout.write(`${good ? 'ok  ' : 'FAIL'} ${name}: want ${want ?? 'no failure'}, got [${codes.join(', ')}]${good ? '' : ` ${failures.map((f) => f.msg).join(' | ').slice(0, 200)}`}\n`);
  };
  const atBase = (p) => ['web/app/main.js', 'web/app/settings.js', 'web/scene/table.js', 'web/vendor/jsm/postprocessing/Pass.js', 'web/sw.js', ...LOCALE_FILES,
    'web/tools/fixtures/equipment-mixed-cache-census.json'].includes(p);
  // (a)
  arm('paths control: the seams, new club files, a named addon, a re-pinned fixture', null, judgePaths([
    { status: 'M', path: 'web/app/main.js' }, { status: 'M', path: 'web/app/locales/ja.json' }, { status: '?', path: 'web/scene/club/room/shell.js' },
    { status: 'A', path: 'web/assets/club/floor-color.jpg' }, { status: '?', path: 'web/vendor/jsm/postprocessing/GTAOPass.js' },
    { status: 'M', path: 'web/tools/fixtures/equipment-mixed-cache-census.json' }, { status: 'M', path: 'web/sw.js' }], atBase));
  arm('paths plant: an existing scene module is edited', 'PATH', judgePaths([{ status: 'M', path: 'web/scene/table.js' }], atBase));
  arm('paths plant: a new file outside the club directories', 'PATH', judgePaths([{ status: '?', path: 'web/scene/clubhelper.js' }], atBase));
  arm('paths plant: a file is removed', 'PATH', judgePaths([{ status: 'D', path: 'web/app/settings.js' }], atBase));
  arm('paths plant: an addon that is not on the list', 'PATH', judgePaths([{ status: '?', path: 'web/vendor/jsm/postprocessing/SSAOPass.js' }], atBase));
  arm('paths plant: an existing vendored file is edited', 'PATH', judgePaths([{ status: 'M', path: 'web/vendor/jsm/postprocessing/Pass.js' }], atBase));
  arm('paths plant: a Finder file under the assets', 'PATH', judgePaths([{ status: '?', path: 'web/assets/club/.DS_Store' }], atBase));
  // seams
  const guarded = "if (club) {\n  import('../scene/club/index.js').then((m) => m.installClub({}));\n}\n";
  const main1 = `startLoop({ club: bootClub ? { room, table, rebakeEnv, query: bootQ } : null });\n${guarded}`;
  const settings1 = '<select id="ob-set-look">\n<option value="tournament"></option>\n<option value="green"></option>\n</select>';
  const loc = (extra = {}, baseExtra = {}) => LOCALES.map((locale) => ({ locale, base: { a: 'A', ...baseExtra }, tip: { a: 'A', 'settings.lookClub': 'Club room', 'settings.lookArena': 'Tournament arena', 'settings.lookChangeReloadConfirm': 'Reload?', ...baseExtra, ...extra } }));
  arm('seams control: one dynamic import, no club or arena option, three added keys in seven locales', null, judgeSeams({ mainJs: main1, settingsJs: settings1 }, loc()));
  arm('seams control: the hand-over names the venue; the stored-value entry is built in script, not in the markup', null, judgeSeams({
    mainJs: main1.replace('query: bootQ }', 'query: bootQ, venue: bootVenue }'),
    settingsJs: `${settings1}\nif ((v.look === 'club' || v.look === 'arena') && !look.querySelector(\`option[value="\${v.look}"]\`)) { const o = document.createElement('option'); o.value = v.look; }\n` }, loc()));
  arm('seams plant: a second dynamic import of a club module', 'SEAM', judgeSeams({ mainJs: `${main1}import('../scene/club/post.js');\n`, settingsJs: settings1 }, loc()));
  arm('seams plant: the import became static', 'SEAM', judgeSeams({ mainJs: "import { installClub } from '../scene/club/index.js';\n", settingsJs: settings1 }, loc()));
  arm('seams plant: the dynamic import is gone', 'SEAM', judgeSeams({ mainJs: 'if (club) { /* nothing */ }\n', settingsJs: settings1 }, loc()));
  const hand = "startLoop({ club: bootClub ? { room, table, rebakeEnv, query: bootQ } : null });\n";
  arm('guard control: the import inside `if (club) { ... }`, the hand-over null without the look', null, judgeGuard(`${hand}let hold = null;\nif (club) {\n  const release = () => { hold = null; };\n  import('../scene/club/index.js').then((m) => m.installClub({ ...club })).then(release);\n}\n`));
  arm('guard plant: the import moved out of the block', 'GUARD', judgeGuard(`${hand}if (club) { hold = 1; }\nimport('../scene/club/index.js').then((m) => m.installClub({}));\n`));
  arm('guard plant: the import is not guarded at all', 'GUARD', judgeGuard(`${hand}import('../scene/club/index.js').then((m) => m.installClub({}));\n`));
  arm('guard plant: the hand-over is an object on every boot', 'GUARD', judgeGuard(`startLoop({ club: { room, table } });\n${guarded}`));
  arm('seams plant: a visible club option', 'OPTION', judgeSeams({ mainJs: main1, settingsJs: settings1.replace('</select>', '<option value="club" data-i18n="settings.lookClub"></option>\n</select>') }, loc()));
  arm('seams plant: a visible arena option', 'OPTION', judgeSeams({ mainJs: main1, settingsJs: settings1.replace('</select>', '<option value="arena" data-i18n="settings.lookArena"></option>\n</select>') }, loc()));
  arm('seams plant: a visible arena option, unquoted and upper case', 'OPTION', judgeSeams({ mainJs: main1, settingsJs: settings1.replace('</select>', '<OPTION data-i18n="settings.lookArena" value=arena></OPTION>\n</select>') }, loc()));
  arm('guard plant: the hand-over with the venue is an object on every boot', 'GUARD', judgeGuard(`startLoop({ club: { room, table, venue: bootVenue } });\n${guarded}`));
  arm('seams plant: a locale changes an existing value', 'LOCALE', judgeSeams({ mainJs: main1, settingsJs: settings1 }, loc({ a: 'B' })));
  arm('seams plant: a locale adds a key that is not the lane\'s', 'LOCALE', judgeSeams({ mainJs: main1, settingsJs: settings1 }, loc({ 'settings.other': 'x' })));
  {
    const uneven = loc();
    delete uneven[3].tip['settings.lookChangeReloadConfirm'];
    arm('seams plant: one locale lacks a key the others add', 'LOCALE', judgeSeams({ mainJs: main1, settingsJs: settings1 }, uneven));
  }
  // (b)
  const mainFile = { path: 'web/app/main.js', text: main1 };
  arm('imports control: the one dynamic import; the word club in prose and in a locale value', null,
    judgeImports([mainFile, { path: 'web/scene/room.js', text: "// the club/ room is built elsewhere\nconst label = 'night club';\n" }, { path: 'web/app/locales/en.json', text: '{ "settings.lookClub": "Club room" }' }]).failures);
  arm('imports plant: a scene module imports a club module', 'IMPORT', judgeImports([mainFile, { path: 'web/scene/room.js', text: "import { createRoom } from './club/room.js';\n" }]).failures);
  arm('imports plant: an app module fetches a club asset', 'IMPORT', judgeImports([mainFile, { path: 'web/app/shell.js', text: "fetch(new URL('../assets/club/manifest.json', import.meta.url));\n" }]).failures);
  arm('imports plant: app.html preloads a club module', 'IMPORT', judgeImports([mainFile, { path: 'web/app.html', text: '<link rel="modulepreload" href="./scene/club/index.js">\n' }]).failures);
  arm('imports plant: main.js names a second club path', 'IMPORT', judgeImports([{ path: 'web/app/main.js', text: `${main1}const pre = '../scene/club/tiers.js';\n` }]).failures);
  arm('imports control: a generated precache row in sw.js', null, judgeImports([mainFile, { path: 'web/sw.js', text: "  ['./scene/club/index.js', '0123456789abcdef', 4295],\n" }]).failures);
  arm('imports plant: sw.js names a club path outside a precache row', 'IMPORT', judgeImports([mainFile, { path: 'web/sw.js', text: "importScripts('./scene/club/index.js');\n" }]).failures);
  // (b2) round A2: the look's boot parameters stay inside the leaf (the tool switch ?clubcloth=app is one of them)
  const holdLine = "let clubHold = null;\nif (club) {\n  const release = () => { clubHold = null; };\n  clubHold = setTimeout(release, Math.max(25000, Number(club.query.get('clubtimeout')) || 0));\n  import('../scene/club/index.js').then((m) => m.installClub({ ...club })).then(release);\n}\n";
  arm('query control: the boot hold reads clubtimeout inside the guarded block; look ids and prose are not parameters', null,
    judgeQuery([{ path: 'web/app/main.js', text: `const v = ['club', 'arena'].includes(q.get('look'));\n${holdLine}` }, { path: 'web/app/drills/catalog.js', text: "const l = { label: 'club' }; // the clubcloth of prose\n" }]).failures);
  arm('query plant: main.js reads the cloth switch', 'QUERY', judgeQuery([{ path: 'web/app/main.js', text: `${holdLine}const appCloth = bootQ.get('clubcloth') === 'app';\n` }]).failures);
  arm('query plant: a scene module reads the cloth switch', 'QUERY', judgeQuery([{ path: 'web/scene/table.js', text: 'if (new URLSearchParams(location.search).get("clubcloth") === "app") keepOwnCloth();\n' }]).failures);
  arm('query plant: settings.js reads the tier parameter', 'QUERY', judgeQuery([{ path: 'web/app/settings.js', text: 'const t = q.has(`clubtier`);\n' }]).failures);
  arm('query plant: clubtimeout read before the guarded block', 'QUERY', judgeQuery([{ path: 'web/app/main.js', text: `const ms = Number(bootQ.get('clubtimeout'));\n${holdLine.replace("Number(club.query.get('clubtimeout'))", 'ms')}` }]).failures);
  arm('query plant: clubtimeout read after the guarded block closed', 'QUERY', judgeQuery([{ path: 'web/app/main.js', text: `if (club) { hold = 1; }\nconst ms = Number(bootQ.get('clubtimeout'));\n` }]).failures);
  arm('query plant: clubtimeout read twice in the block', 'QUERY', judgeQuery([{ path: 'web/app/main.js', text: `${holdLine.replace('  import(', "  const again = club.query.get('clubtimeout');\n  import(")}` }]).failures);
  // (c)
  const mod = (text) => judgeSideEffects(acorn, [{ path: 'web/scene/club/x.js', text }]);
  arm('side control: imports, frozen tables, a URL from import.meta, functions that touch the page when called', null, mod(
    "import * as THREE from 'three';\nconst BASE = new URL('../../assets/club/', import.meta.url);\nexport const T = Object.freeze({ a: 1 });\nconst v = new THREE.Vector3();\n"
    + "function later() { return window.innerWidth + document.title.length; }\nexport const make = () => { window.__x = 1; };\nexport class K { static n = 2; m() { return document; } }\nexport function f(self) { return self; }\n"));
  arm('side plant: a top-level assignment to window', 'SIDE', mod('window.__club = {};\n'));
  arm('side plant: a canvas made at import', 'SIDE', mod("const c = document.createElement('canvas');\nexport const tex = c;\n"));
  arm('side plant: an immediately invoked function that reads the page', 'SIDE', mod('export const dpr = (() => devicePixelRatio)();\n'));
  arm('side plant: an initialiser that calls a module function which reads the page', 'SIDE', mod('function probe() { return navigator.userAgent; }\nexport const UA = probe();\n'));
  arm('side plant: a top-level await', 'SIDE', mod("const m = await import('./room.js');\nexport default m;\n"));
  arm('side plant: a top-level loop', 'SIDE', mod('const a = [];\nfor (let i = 0; i < 3; i++) a.push(i);\nexport default a;\n'));
  arm('side plant: a listener registered at import', 'SIDE', mod("addEventListener('resize', () => {});\n"));
  arm('side plant: a static class field that reads the page', 'SIDE', mod('export class K { static w = window.innerWidth; }\n'));
  // round 4: sound and listeners
  arm('side control: an audio graph and a machine listener made inside the factory', null, mod("export async function createAudio(club) {\n  const ctx = new AudioContext();\n  const g = new GainNode(ctx);\n  const off = club.ctx.machine.on('frame', () => {});\n  return { enabled: true, dispose() { off(); g.disconnect(); ctx.close(); } };\n}\n"));
  arm('side plant: an audio context made at import', 'SIDE', mod('const ctx = new AudioContext();\nexport const bus = ctx;\n'));
  arm('side plant: the prefixed audio context at import', 'SIDE', mod('export const Ctx = webkitAudioContext;\n'));
  arm('side plant: an offline render started at import', 'SIDE', mod('const oac = new OfflineAudioContext(1, 48000, 48000);\nexport const bed = oac.startRendering();\n'));
  arm('side plant: an audio node class read at import through a helper', 'SIDE', mod('function mk() { return typeof GainNode; }\nexport const has = mk();\n'));
  arm('side plant: a machine listener registered at import through a page handle', 'SIDE', mod("window.__dbg.machine.on('frame', () => {});\n"));
  arm('side control: a module-scope name shadows a page global', null, mod('const self = { a: 1 };\nexport const b = self.a;\n'));
  arm('parse plant: a module that does not parse', 'PARSE', mod('export const = ;\n'));
  process.stdout.write(`selftest: ${ok ? 'every plant caught, every control green' : 'a plant was missed or a control went red'}\n`);
  return ok ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  let rc = 2;
  try {
    if (argv.includes('--selftest')) rc = await selftest();
    else if (argv.includes('--tree')) rc = await main(null);
    else { const i = argv.indexOf('--base'); rc = await main(i >= 0 && argv[i + 1] ? argv[i + 1] : DEFAULT_BASE); }
  } catch (e) { process.stdout.write(`test-club-identity: could not run — ${e.stack ?? e}\n`); rc = 2; }
  process.exit(rc);
}
