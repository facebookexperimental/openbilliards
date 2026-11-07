// Copyright (c) Meta Platforms, Inc. and affiliates.

// gen-sw-precache.mjs — (re)writes the AUTOGEN block in web/sw.js: the
// service worker's VERSION stamp + PRECACHE / PRECACHE_FILL manifests
// (branch pwa-standalone; split by GH-714) — and, first, app.html's root-tag
// generation id data-ob-html (issue #1173, below). It writes BOTH files:
// commit web/sw.js and web/app.html together. Two branches that touch
// app.html conflict on its line 2 (the id): take either side and regenerate
// on the merge (an unresolved conflict is refused: two root tags).
//
// The service worker snapshots the app's ENTIRE runtime-fetchable tree so an
// installed PWA (iPhone A2HS) works fully offline. Hand-maintaining that
// list is the same defect class pages-artifact-gate.mjs exists for — a path
// missing here is a 404 the first time the app runs offline — so the list
// is ENUMERATED from the checkout, never hand-edited. GH-714 split it in two
// (one atomic addAll of the whole tree hit Chromium's 5-minute install kill
// on Slow 3G): PRECACHE = the BOOT set, installed before activation, and
// PRECACHE_FILL = everything else, filled by the worker in the background
// after activation. The boot set is DERIVED, never authored: the union of
//   * web/tools/sw-boot-manifest.json — the MEASURED cold-boot request set
//     (node web/tools/e2e-userboot-3g.mjs --record-boot: phone + desktop,
//     ?sw=0, unthrottled; the swfill leg fails when it goes stale), and
//   * the static import graph reachable from app.html / app/main.js (and
//     app.html's inline `import('./…')` literals — issue #1047) AND
//     from every measured boot module (review r3 P2: the traversal parses
//     every boot path, measured or discovered — a new static dependency
//     of a boot module is boot without re-recording the manifest),
// minus media and fonts (.wav .png .webp .woff2 are always fill), plus the
// root documents and the locale dictionaries of all 7 languages. Each
// entry is [url, sha256-prefix, bytes]: the worker verifies the digest on
// every cache write (a lazily filled snapshot must never mix generations —
// a deploy between install and fill is rejected, not cached) and sizes the
// per-request timeout from the byte count.
//
//   * ./app.html + ./manifest.webmanifest (the shell + install surface);
//   * every allowlisted-extension file under app/, scene/, vendor/, dist/,
//     assets/ (.js .mjs .css .json .wasm .png .webp .wav .woff2 — docs,
//     licenses and .d.ts never leave the repo surface; web/tools is a test
//     harness, pages.yml strips it from the artifact);
//   * except the WALK_SKIP trees: vendor/gsap/ is render-pipeline-only (the
//     site video tools load it, the app never does) and the public snapshot
//     excludes it, so a manifest entry for it would 404 on the public deploy;
//   * both lists are ordered as the tree walk (root files first), so the
//     block is byte-deterministic for a given checkout + manifest;
//   * stylesheet entries carry their AUTHORED ?v= cache-bust params
//     (resolved from app.html hrefs and the module `?v=` literals /
//     `${*_CSS_V}` constants): the SW matches exact URLs, query included —
//     the cache-poison doctrine — so the precache key must be the URL the
//     app actually fetches.
//
// VERSION = <pool-wasm stamp>_rules-<pool-rules stamp>_tree-<sha8>, where
// sha8 is a sha-256 over every precached byte (path-keyed, sorted) PLUS
// sw.js's own bytes outside the AUTOGEN block: any dist rebuild, app change,
// worker-logic edit or grade recalibration (grade.json is a manifest entry
// like any other — a supported pages.yml deploy trigger) reprints it, which
// renames the SW cache and makes browsers install a fresh consistent
// snapshot (a logic-only edit reusing the old cache name would addAll fresh
// server bytes into the cache the old ACTIVE worker still serves — a
// mid-session generation mix; a grade-only deploy without a new generation
// would pin installed clients to the stale grade forever).
//
// ABOVE-ROOT ENTRIES (review r2 ruling: NOTHING enters the versioned snapshot
// without a digest — there is no optional / digest-less asset class). The app
// fetches '../tools/render/grade.json' ONE ABOVE the served web root
// (offline-render.js; a designed 404 on a bare web/-alone serve). Its
// authoring-time source is web/tools/render/grade.json — the same bytes in
// every layout (repo checkout: a symlink onto the repo tools/render that
// pages.yml also materializes at the artifact's /tools/render/; web-alone /
// copy serves: the served file itself). When it exists at generation it is
// a NORMAL digested PRECACHE_FILL entry (last in the fill order; `--check`
// covers it); when it does not, it is simply absent from the manifest — the
// worker never caches it and passes such requests through to the network.
// NOT webDir/../tools: outside a repo checkout that path escapes the served
// tree and reads a stranger's file.
//
// usage:
//   node web/tools/gen-sw-precache.mjs           # rewrite app.html's id + web/sw.js block
//   node web/tools/gen-sw-precache.mjs --check   # gate: exit 1 on drift (writes nothing)

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { htmlGenId } from './lib/html-gen-id.mjs';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const swPath = path.join(webDir, 'sw.js');

const ROOT_FILES = ['app.html', 'manifest.webmanifest'];
const WALK_DIRS = ['app', 'scene', 'vendor', 'dist', 'assets'];
const EXT_ALLOW = new Set(['.js', '.mjs', '.css', '.json', '.wasm',
  '.png', '.webp', '.wav', '.woff2']);
const WALK_SKIP = new Set(['vendor/gsap']); // render-pipeline-only trees (see the header)

// ---- enumerate the runtime-fetchable tree -----------------------------------
const files = [...ROOT_FILES];
const walk = (rel) => {
  for (const ent of fs.readdirSync(path.join(webDir, rel), { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))) {
    const r = `${rel}/${ent.name}`;
    if (ent.isDirectory()) { if (!WALK_SKIP.has(r)) walk(r); }
    else if (ent.isFile() && EXT_ALLOW.has(path.extname(ent.name))) files.push(r);
  }
};
for (const d of WALK_DIRS) walk(d);
// [source rel under web/, served URL relative to sw.js] — see ABOVE-ROOT ENTRIES
const ABOVE_ROOT = [['tools/render/grade.json', '../tools/render/grade.json']];
const urlOverride = new Map();
for (const [rel, url] of ABOVE_ROOT) {
  if (fs.existsSync(path.join(webDir, rel))) { files.push(rel); urlOverride.set(rel, url); }
}
for (const f of ROOT_FILES) {
  if (!fs.existsSync(path.join(webDir, f))) {
    console.error(`gen-sw-precache: missing root file web/${f}`);
    process.exit(1);
  }
}

// ---- issue #1173: app.html's own generation id ------------------------------
// The root <html> tag (the line that starts with it) carries data-ob-html =
// the first 12 hex digits of the sha-256 of app.html with that attribute's
// value blanked. A navigation the outgoing worker serves while the waiting
// one takes over gets the OLD app.html under the NEW controller, with no
// controllerchange; app/swupdate.js verifyGeneration compares this id with
// the controller's snapshot copy and reloads once. The id hashes app.html
// only (never VERSION), so it is a fixed point: a second run writes nothing.
// It is written before anything below reads app.html, so PRECACHE digests
// the final bytes; --check fails on a stale id and never writes. The id
// function lives in lib/html-gen-id.mjs (shared with the swupdate leg's deploy).
const CHECK = process.argv.includes('--check');
{
  const appPath = path.join(webDir, 'app.html');
  const src = fs.readFileSync(appPath, 'utf8');
  const r = htmlGenId(src);
  if (r.error) {
    console.error(`gen-sw-precache: ${r.error}`);
    process.exit(1);
  }
  if (r.text !== src) {
    if (CHECK) {
      console.error('SW-PRECACHE STALE: app.html\'s data-ob-html is stale — run: node web/tools/gen-sw-precache.mjs');
      process.exit(1);
    }
    // atomic: gen also runs while a gate may be serving this tree
    const tmp = `${appPath}.gen-${process.pid}`;
    fs.writeFileSync(tmp, r.text);
    fs.renameSync(tmp, appPath);
  }
}

// ---- the BOOT set (GH-714): measured manifest ∪ static import graph ---------
const MEDIA_RE = /\.(wav|png|webp|woff2)$/i;
const BOOT_MANIFEST = path.join(webDir, 'tools', 'sw-boot-manifest.json');
if (!fs.existsSync(BOOT_MANIFEST)) {
  console.error('gen-sw-precache: web/tools/sw-boot-manifest.json missing — '
    + 'record it: node web/tools/e2e-userboot-3g.mjs --record-boot');
  process.exit(1);
}
const fileSet = new Set(files);
const bootPaths = new Set(ROOT_FILES);
for (const rel of JSON.parse(fs.readFileSync(BOOT_MANIFEST, 'utf8')).paths) {
  if (fileSet.has(rel) && !MEDIA_RE.test(rel)) bootPaths.add(rel);
}
// static graph: app.html's own src/href roots PLUS every measured boot
// module as a traversal root, then `import … from` / `export … from` / bare
// `import '…'` relative specifiers, transitively. GH-714 review r3 P2: the
// traversal keeps its OWN visited set — the old guard tested bootPaths,
// which the measured manifest had pre-populated, so app/main.js and every
// listed importer were never parsed and a new static dependency of a boot
// module landed in PRECACHE_FILL until someone re-recorded the manifest (an
// offline boot then 404'd it). Every boot path, measured or discovered, is
// parsed exactly once; every discovered static import joins the boot set.
// (web/tools/test-sw-precache-graph.mjs is the synthetic-tree arm.)
const normRel = (fromRel, spec) => path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), spec));
const visited = new Set();
const queue = [...bootPaths];
const html = fs.readFileSync(path.join(webDir, 'app.html'), 'utf8');
for (const m of html.matchAll(/(?:src|href)="\.\/([^"?#]+)/g)) queue.push(m[1]);
// issue #1047: app.html's own inline `import('./…')` literals (the update
// notice the registration block loads) run on every registering boot — roots too
for (const m of html.matchAll(/\bimport\(\s*['"]\.\/([^'"?#]+)['"]\s*\)/g)) queue.push(m[1]);
while (queue.length) {
  const rel = queue.pop().split(/[?#]/)[0]; // Filesystem identity excludes URL query and fragment.
  if (visited.has(rel)) continue;
  visited.add(rel);
  if (!fileSet.has(rel) || MEDIA_RE.test(rel)) continue;
  bootPaths.add(rel);
  if (!/\.m?js$/.test(rel)) continue;
  const text = fs.readFileSync(path.join(webDir, rel), 'utf8');
  for (const m of text.matchAll(/^\s*(?:import|export)\b[^;'"]*?\bfrom\s*['"](\.\.?\/[^'"]+)['"]|^\s*import\s*['"](\.\.?\/[^'"]+)['"]/gm)) {
    queue.push(normRel(rel, m[1] || m[2]));
  }
}
for (const rel of files) if (/^app\/locales\/[^/]+\.json$/.test(rel)) bootPaths.add(rel);

// ---- resolve authored stylesheet ?v= params ---------------------------------
// Sources: app.html <link href> literals + module-injected URLs — either a
// '?v=NNN' literal or a `?v=${NAME}` template whose NAME is a const string
// in the same file. Basenames are unique across app/ui, so the map keys on
// basename; a conflict (two different versions for one sheet) is a hard
// error — it would mean the exact-URL cache key is ambiguous.
const cssVer = new Map();
const noteVer = (base, v, src) => {
  if (cssVer.has(base) && cssVer.get(base) !== v) {
    console.error(`gen-sw-precache: conflicting ?v= for ${base}: `
      + `${cssVer.get(base)} vs ${v} (${src})`);
    process.exit(1);
  }
  cssVer.set(base, v);
};
const verSources = [path.join(webDir, 'app.html'),
  ...fs.readdirSync(path.join(webDir, 'app')).filter((n) => n.endsWith('.js'))
    .map((n) => path.join(webDir, 'app', n))];
for (const src of verSources) {
  const text = fs.readFileSync(src, 'utf8');
  for (const m of text.matchAll(/([\w./-]+\.css)\?v=(\w+)/g)) {
    noteVer(path.basename(m[1]), m[2], src);
  }
  for (const m of text.matchAll(/([\w./-]+\.css)\?v=\$\{(\w+)\}/g)) {
    const c = text.match(new RegExp(`const ${m[2]}\\s*=\\s*'([^']+)'`));
    if (!c) {
      console.error(`gen-sw-precache: cannot resolve \${${m[2]}} in ${src}`);
      process.exit(1);
    }
    noteVer(path.basename(m[1]), c[1], src);
  }
}

// ---- VERSION: kernel stamps + tree hash -------------------------------------
// The public snapshot rebuilds its dist without .git, so its pinned build.rs files stamp N.N.N+snapshot. That stamp
// is accepted ONLY in the public snapshot tree, which the sync marks by stamping its copyright header on line 1 of
// this very file on export; the private tree never carries that line, so a private dist stamped +snapshot is still
// refused and the private output is unchanged (a git-less private build stamps +unknown, which no tree accepts).
// Keep this literal out of the file's first 800 characters: the export skips the header when the head already names
// the holder. tools/test-snapshot-export-pins.py holds both sides of this marker.
const PUBLIC_SNAPSHOT = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8')
  .startsWith('// Copyright (c) Meta Platforms, Inc. and affiliates.\n');
const STAMP_RE = PUBLIC_SNAPSHOT
  ? /[0-9]+\.[0-9]+\.[0-9]+\+(?:[0-9a-f]{8}|snapshot)/
  : /[0-9]+\.[0-9]+\.[0-9]+\+[0-9a-f]{8}/;
const stamp = (rel) => {
  const m = fs.readFileSync(path.join(webDir, rel)).toString('latin1')
    .match(STAMP_RE);
  if (!m) {
    console.error(`gen-sw-precache: no kernel stamp in web/${rel}`);
    process.exit(1);
  }
  return m[0];
};
const OPEN = '/* >>> AUTOGEN';
const CLOSE = '/* <<< AUTOGEN */';
const sw = fs.readFileSync(swPath, 'utf8');
const a = sw.indexOf(OPEN);
const b = sw.indexOf(CLOSE);
if (a < 0 || b < 0 || b < a) {
  console.error('gen-sw-precache: AUTOGEN markers missing in web/sw.js');
  process.exit(1);
}
const h = createHash('sha256');
const entries = files.map((rel) => {
  const bytes = fs.readFileSync(path.join(webDir, rel));
  h.update(rel);
  h.update(bytes);
  const v = rel.endsWith('.css') ? cssVer.get(path.basename(rel)) : undefined;
  // above-root entries are FILL by law (never boot), served at their own URL
  return { url: urlOverride.get(rel) ?? `./${rel}${v ? `?v=${v}` : ''}`,
    boot: bootPaths.has(rel) && !urlOverride.has(rel),
    sha: createHash('sha256').update(bytes).digest('hex').slice(0, 16), bytes: bytes.length };
});
const bootList = entries.filter((e) => e.boot);
const fillList = entries.filter((e) => !e.boot);
const mb = (list) => (list.reduce((a, e) => a + e.bytes, 0) / 1e6).toFixed(2);
// worker-logic bytes join the hash (generation atomicity — header note);
// the AUTOGEN block itself stays out, or the hash would chase its own tail
h.update(sw.slice(0, a));
h.update(sw.slice(b));
const version = `${stamp('dist/pool-wasm/pool_wasm_bg.wasm')}`
  + `_rules-${stamp('dist/pool-rules/pool_rules_bg.wasm')}`
  + `_tree-${h.digest('hex').slice(0, 8)}`;

// ---- splice the AUTOGEN block into sw.js ------------------------------------
const row = (e) => `  ['${e.url}', '${e.sha}', ${e.bytes}],`;
const block = '/* >>> AUTOGEN — node web/tools/gen-sw-precache.mjs; '
  + 'do not edit by hand */\n'
  + `const VERSION = '${version}';\n`
  + `// [url, sha256 prefix, bytes] — BOOT set: ${bootList.length} files, ${mb(bootList)} MB (installed before activation)\n`
  + 'const PRECACHE = [\n' + bootList.map(row).join('\n') + '\n];\n'
  + `// FILL set: ${fillList.length} files, ${mb(fillList)} MB (background fill after activation)\n`
  + 'const PRECACHE_FILL = [\n' + fillList.map(row).join('\n') + '\n];\n';
const next = sw.slice(0, a) + block + sw.slice(b);

if (CHECK) {
  if (next !== sw) {
    console.error('SW-PRECACHE STALE: web/sw.js VERSION/PRECACHE does not '
      + 'match the tree — run: node web/tools/gen-sw-precache.mjs');
    process.exit(1);
  }
  console.log(`SW-PRECACHE ok: boot ${bootList.length} files / ${mb(bootList)} MB, `
    + `fill ${fillList.length} files / ${mb(fillList)} MB, VERSION ${version}`);
  process.exit(0);
}
fs.writeFileSync(swPath, next);
console.log(`gen-sw-precache: wrote boot ${bootList.length} files / ${mb(bootList)} MB, `
  + `fill ${fillList.length} files / ${mb(fillList)} MB, VERSION ${version}`);
