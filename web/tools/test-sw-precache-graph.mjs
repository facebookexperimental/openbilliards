// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-sw-precache-graph.mjs — GH-714 review r3 P2 arm for the static-import
// traversal in gen-sw-precache.mjs. A SYNTHETIC web tree: app.html loads
// app/main.js, main imports ./a.js, a re-exports from ./b.js, b imports ./a.js
// back (a cycle — the traversal must terminate), query strings and fragments
// decorate static imports, app/c.js is imported by
// nobody, and the measured boot manifest lists ONLY app/main.js. The
// generator under test is COPIED into <tree>/tools/ and run there (it locates
// its web dir from its own path), so the same test drives any revision:
//
//   node web/tools/test-sw-precache-graph.mjs [generatorPath]
//
// PASS: PRECACHE holds app/main.js, app/a.js AND app/b.js (the transitive
// graph of a MEASURED root), including query/fragment imports and their
// dependencies, and app/late.js + app/late-dep.js (issue #1047: app.html's
// inline `import('./…')` literal is a root with its static graph);
// PRECACHE_FILL holds app/c.js, app.html carries gen's data-ob-html id
// (#1173; test-gen-html-id.mjs is that id's own arm), and `--check` is
// green right after the write (with a lib, the copied generator cannot run
// once the copied lib is gone: it never reaches outside the tree). RED pre-fix (the base generator): a.js and
// b.js land in PRECACHE_FILL — the traversal's guard tested the boot set the
// manifest had pre-populated, so main.js was never parsed and the advertised
// transitive graph was never computed.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const generator = path.resolve(process.argv[2] || path.join(here, 'gen-sw-precache.mjs'));
const tree = fs.mkdtempSync(path.join(os.tmpdir(), 'ob-sw-graph-'));
const put = (rel, body) => {
  fs.mkdirSync(path.dirname(path.join(tree, rel)), { recursive: true });
  fs.writeFileSync(path.join(tree, rel), body);
};
for (const d of ['scene', 'vendor', 'assets']) fs.mkdirSync(path.join(tree, d), { recursive: true });
// #1173: the root <html> tag on its own line carries gen's data-ob-html id
put('app.html', '<!doctype html>\n<html>\n<script>navigator.serviceWorker.register(\'./sw.js\').then(() => import(\'./app/late.js\'));</script>'
  + '<script type="module" src="./app/main.js"></script>\n');
put('manifest.webmanifest', '{}\n');
put('app/main.js', "import { a } from './a.js';\nimport '../scene/fragment.js#entry';\nconsole.log(a);\n");
put('app/a.js', "export { b as a } from './b.js?sha256=fixture#module';\n");
put('app/b.js', "import './a.js#cycle';\nexport const b = 1;\n");
put('scene/fragment.js', "import './leaf.js?sha256=fixture';\n");
put('scene/leaf.js', 'export const leaf = true;\n');
put('app/c.js', 'export const c = 2;\n');
// issue #1047: app.html's inline import('./…') literal is a boot root, with its static graph
put('app/late.js', "import { dep } from './late-dep.js';\nexport const late = dep;\n");
put('app/late-dep.js', 'export const dep = 3;\n');
put('app/locales/en.json', '{}\n');
put('dist/pool-wasm/pool_wasm_bg.wasm', 'stamp 0.0.0+00000000');
put('dist/pool-rules/pool_rules_bg.wasm', 'stamp 0.0.0+00000000');
put('tools/sw-boot-manifest.json', JSON.stringify({ paths: ['app/main.js'] }));
put('sw.js', '/* worker */\n/* >>> AUTOGEN */\n/* <<< AUTOGEN */\nconst CACHE = VERSION;\n');
fs.copyFileSync(generator, path.join(tree, 'tools', 'gen-sw-precache.mjs'));
// #1173: the generator imports its id function from lib/html-gen-id.mjs (a pre-lib revision has none)
const genLib = path.join(path.dirname(generator), 'lib', 'html-gen-id.mjs');
if (fs.existsSync(genLib)) { fs.mkdirSync(path.join(tree, 'tools', 'lib'), { recursive: true }); fs.copyFileSync(genLib, path.join(tree, 'tools', 'lib', 'html-gen-id.mjs')); }

const run = (...args) => spawnSync(process.execPath, [path.join(tree, 'tools', 'gen-sw-precache.mjs'), ...args], { encoding: 'utf8' });
const list = (sw, name) => [...(sw.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\n\\];`))?.[1] ?? '')
  .matchAll(/^\s*\['(\.\.?\/[^']+)'/gm)].map((m) => m[1]);
const fails = [];
const w = run();
if (w.status !== 0) fails.push(`generator exit ${w.status}: ${(w.stderr || w.stdout).trim()}`);
const sw = fs.readFileSync(path.join(tree, 'sw.js'), 'utf8');
const boot = list(sw, 'PRECACHE'); const fill = list(sw, 'PRECACHE_FILL');
console.log(`[sw-graph] generator ${path.relative(process.cwd(), generator)} → boot ${JSON.stringify(boot)} fill ${JSON.stringify(fill)}`);
for (const u of ['./app.html', './app/main.js', './app/a.js', './app/b.js', './scene/fragment.js', './scene/leaf.js', './app/locales/en.json',
  './app/late.js', './app/late-dep.js']) {
  if (!boot.includes(u)) fails.push(`${u} missing from PRECACHE (${fill.includes(u) ? 'landed in PRECACHE_FILL' : 'absent'}) — the static graph of a measured boot module is BOOT`);
  if (fill.includes(u)) fails.push(`${u} is a BOOT dependency and must not also be PRECACHE_FILL`);
}
if (!fill.includes('./app/c.js') || boot.includes('./app/c.js')) fails.push('./app/c.js (imported by nobody) must be PRECACHE_FILL');
if (!/^<html data-ob-html="[0-9a-f]{12}">$/m.test(fs.readFileSync(path.join(tree, 'app.html'), 'utf8'))) fails.push('app.html carries no data-ob-html id after the write (#1173)');
const chk = run('--check');
if (chk.status !== 0) fails.push(`--check red right after the write: ${(chk.stderr || chk.stdout).trim()}`);
// #1173: with a lib, the copied generator must run on the COPIED lib (it cannot run without it), never on a path
// outside the tree
if (fs.existsSync(genLib)) {
  fs.rmSync(path.join(tree, 'tools', 'lib', 'html-gen-id.mjs'));
  const nolib = run('--check');
  if (nolib.status === 0 || !/html-gen-id|ERR_MODULE_NOT_FOUND/.test(nolib.stderr || '')) fails.push(`the generator ran without its copied lib (exit ${nolib.status}): it does not import tools/lib/html-gen-id.mjs from its own tree`);
}
fs.rmSync(tree, { recursive: true, force: true });
for (const f of fails) console.error(`SW-GRAPH FAIL: ${f}`);
console.log(fails.length ? 'SW-GRAPH FAIL' : 'SW-GRAPH PASS: query/fragment imports, transitive dependencies and the cycle are BOOT from a manifest listing only main; c is FILL; --check green');
process.exit(fails.length ? 1 : 0);
