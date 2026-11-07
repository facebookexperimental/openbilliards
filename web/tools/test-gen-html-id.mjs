// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-gen-html-id.mjs — #1173: gen-sw-precache's app.html generation id
// (data-ob-html on the root <html> tag), judged on a SYNTHETIC web tree with
// the generator under test COPIED into <tree>/tools/ (it locates its web dir
// from its own path) together with its id function, lib/html-gen-id.mjs, when
// the revision has one, so the same arm drives any revision:
//
//   node web/tools/test-gen-html-id.mjs [generatorPath]
//   node web/tools/test-gen-html-id.mjs --selftest     # plants on the tree's generator
//
// Clauses:
//   WRITE     a tree without the id gets it, and it equals the first 12 hex
//             digits of the sha-256 of app.html with that value blanked
//             (computed here, independently)
//   ORDER     PRECACHE's app.html row digests the FINAL bytes (the id is
//             written before anything reads app.html)
//   FIXPOINT  a second run leaves app.html untouched (same bytes, same inode:
//             no rewrite) and `--check` is green after one run
//   CHECK     a stale id: `--check` fails naming app.html's data-ob-html and
//             never writes; a run repairs it
//   REFUSE    no line starting with <html, two, or the attribute twice on the
//             root tag: a named refusal, nothing written
//   ATOMIC    the repair replaces app.html by rename (a new inode) and leaves no
//             sibling temp file (a proxy: it catches an in-place write)
// FIXPOINT and CHECK also require --check to leave app.html's inode and mtime
// alone. expectId stays an independent computation here: it never imports the
// lib, or WRITE would compare the lib with itself. A generator whose lib is
// missing cannot run: that verdict is INVALID, never a clause.
// Exit 0 PASS, 1 FAIL, 2 INVALID.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const MECHS = ['WRITE', 'ORDER', 'FIXPOINT', 'CHECK', 'REFUSE', 'ATOMIC'];
const HTML = '<!doctype html>\n<html lang="en">\n<head><title>t</title></head>\n'
  + '<!-- a comment that names <html> mid-line is not the root tag -->\n'
  + '<script type="module" src="./app/main.js"></script>\n';

function makeTree(genSrc, html, libSrc = null) {
  const tree = fs.mkdtempSync(path.join(os.tmpdir(), 'ob-gen-htmlid-'));
  const put = (rel, body) => { fs.mkdirSync(path.dirname(path.join(tree, rel)), { recursive: true }); fs.writeFileSync(path.join(tree, rel), body); };
  for (const d of ['scene', 'vendor', 'assets']) fs.mkdirSync(path.join(tree, d), { recursive: true });
  put('app.html', html);
  put('manifest.webmanifest', '{}\n');
  put('app/main.js', 'export const m = 1;\n');
  put('app/locales/en.json', '{}\n');
  put('dist/pool-wasm/pool_wasm_bg.wasm', 'stamp 0.0.0+00000000');
  put('dist/pool-rules/pool_rules_bg.wasm', 'stamp 0.0.0+00000000');
  put('tools/sw-boot-manifest.json', JSON.stringify({ paths: ['app/main.js'] }));
  put('sw.js', '/* worker */\n/* >>> AUTOGEN */\n/* <<< AUTOGEN */\nconst CACHE = VERSION;\n');
  put('tools/gen-sw-precache.mjs', genSrc);
  if (libSrc !== null) put('tools/lib/html-gen-id.mjs', libSrc);
  return tree;
}
const run = (tree, ...args) => spawnSync(process.execPath, [path.join(tree, 'tools', 'gen-sw-precache.mjs'), ...args], { encoding: 'utf8', timeout: 60000 });
const read = (tree, rel) => fs.readFileSync(path.join(tree, rel), 'utf8');
const idOf = (html) => (html.match(/^<html\b[^>]*\sdata-ob-html="([0-9a-f]*)"/m) || [])[1] ?? null;
const expectId = (html) => createHash('sha256').update(html.replace(/^(<html\b[^>]*\sdata-ob-html=")[0-9a-f]*"/m, '$1"')).digest('hex').slice(0, 12);

function judge(genSrc, libSrc = null) {
  const red = Object.fromEntries(MECHS.map((m) => [m, []]));
  const trees = [];
  try {
    // WRITE / ORDER / FIXPOINT
    {
      const t = makeTree(genSrc, HTML, libSrc); trees.push(t);
      const r1 = run(t);
      if (r1.status !== 0) throw new Error(`generator exit ${r1.status} on a clean tree: ${(r1.stderr || r1.stdout).trim().slice(0, 300)}`);
      const html = read(t, 'app.html'); const id = idOf(html);
      if (!id) red.WRITE.push('app.html has no data-ob-html after a run');
      else if (id !== expectId(html)) red.WRITE.push(`data-ob-html ${id} is not sha-256(app.html, value blanked)[0..12] = ${expectId(html)}`);
      if (html.replace(/ data-ob-html="[0-9a-f]*"/, '') !== HTML) red.WRITE.push('the run changed app.html beyond the root tag\'s attribute');
      const row = read(t, 'sw.js').match(/\['\.\/app\.html', '([0-9a-f]{16})', (\d+)\]/);
      const bytes = fs.readFileSync(path.join(t, 'app.html'));
      if (!row) red.ORDER.push('no ./app.html row in PRECACHE');
      else if (row[1] !== createHash('sha256').update(bytes).digest('hex').slice(0, 16) || Number(row[2]) !== bytes.length) red.ORDER.push(`PRECACHE's app.html row ${row[1]} / ${row[2]} does not digest the final bytes (${bytes.length})`);
      const st1 = fs.statSync(path.join(t, 'app.html'));
      const r2 = run(t);
      const st2 = fs.statSync(path.join(t, 'app.html'));
      if (r2.status !== 0) red.FIXPOINT.push(`a second run exits ${r2.status}`);
      if (read(t, 'app.html') !== html) red.FIXPOINT.push('a second run changed app.html (the id is not a fixed point)');
      else if (st2.ino !== st1.ino || st2.mtimeMs !== st1.mtimeMs) red.FIXPOINT.push('a second run rewrote an unchanged app.html');
      const c = run(t, '--check');
      const st3 = fs.statSync(path.join(t, 'app.html'));
      if (st3.ino !== st2.ino || st3.mtimeMs !== st2.mtimeMs) red.FIXPOINT.push('--check touched an unchanged app.html');
      if (c.status !== 0) red.FIXPOINT.push(`--check red after one run: ${(c.stderr || c.stdout).trim().slice(0, 200)}`);
    }
    // CHECK: a stale id
    {
      const t = makeTree(genSrc, HTML, libSrc); trees.push(t);
      if (run(t).status !== 0) throw new Error('generator failed on the CHECK tree');
      const stale = read(t, 'app.html').replace('<title>t</title>', '<title>t2</title>');
      fs.writeFileSync(path.join(t, 'app.html'), stale);
      const sc0 = fs.statSync(path.join(t, 'app.html'));
      const c = run(t, '--check');
      const sc1 = fs.statSync(path.join(t, 'app.html'));
      if (sc1.ino !== sc0.ino || sc1.mtimeMs !== sc0.mtimeMs) red.CHECK.push('--check touched app.html (a write, even of the same bytes)');
      if (c.status === 0) red.CHECK.push('--check green on a stale id');
      else if (!/data-ob-html is stale/.test(c.stderr || '')) red.CHECK.push(`--check red but not naming the id: ${(c.stderr || '').trim().slice(0, 160)}`);
      if (read(t, 'app.html') !== stale) red.CHECK.push('--check wrote app.html');
      const r = run(t);
      const sr = fs.statSync(path.join(t, 'app.html'));
      if (sr.ino === sc1.ino) red.ATOMIC.push('the repair rewrote app.html in place (same inode: not temp + rename)');
      const left = fs.readdirSync(t).filter((n) => n !== 'app.html' && n.startsWith('app.html'));
      if (left.length) red.ATOMIC.push(`the write left ${JSON.stringify(left)} in the web root`);
      if (r.status !== 0 || idOf(read(t, 'app.html')) !== expectId(read(t, 'app.html'))) red.CHECK.push('a run did not repair the stale id');
      else if (run(t, '--check').status !== 0) red.CHECK.push('--check still red after the repair run');
    }
    // REFUSE: no root tag, two root tags
    for (const [what, html, named] of [['no line starting with <html', HTML.replace('<html lang="en">\n', ''), /exactly one line starting with <html/],
      ['two lines starting with <html', HTML.replace('<head>', '<html lang="x">\n<head>'), /exactly one line starting with <html/],
      ['the attribute twice on the root tag', HTML.replace('<html lang="en">', '<html lang="en" data-ob-html="aaaaaaaaaaaa" data-ob-html="bbbbbbbbbbbb">'), /data-ob-html more than once/]]) {
      const t = makeTree(genSrc, html, libSrc); trees.push(t);
      const sw0 = read(t, 'sw.js');
      const r = run(t);
      if (r.status === 0) red.REFUSE.push(`${what}: the generator succeeded`);
      else if (!named.test(r.stderr || '')) red.REFUSE.push(`${what}: not the named refusal: ${(r.stderr || '').trim().slice(0, 160)}`);
      if (read(t, 'app.html') !== html || read(t, 'sw.js') !== sw0) red.REFUSE.push(`${what}: something was written`);
    }
    return { invalid: [], red };
  } catch (e) {
    return { invalid: [String(e && e.message)], red };
  } finally {
    for (const t of trees) fs.rmSync(t, { recursive: true, force: true });
  }
}

// file: where the plant edits — 'gen' (the generator) or 'lib' (lib/html-gen-id.mjs); drop: the lib left out of the
// tree (want INVALID)
const PLANTS = [
  { mech: 'WRITE', file: 'lib', name: 'the id hashes app.html with its own value', old: "const id = createHash('sha256').update(blank)", new: "const id = createHash('sha256').update(src)" },
  { mech: 'ORDER', file: 'gen', name: 'app.html written after everything read it', old: '    fs.renameSync(tmp, appPath);', new: "    process.on('exit', () => fs.renameSync(tmp, appPath));" },
  { mech: 'FIXPOINT', file: 'gen', name: 'app.html rewritten on every run', old: '  if (r.text !== src) {', new: '  if (r.text !== src || !CHECK) {' },
  { mech: 'CHECK', file: 'gen', name: '--check writes the id', old: '    if (CHECK) {\n', new: '    if (false) {\n' },
  { mech: 'ATOMIC', file: 'gen', name: 'app.html written in place', old: '    const tmp = `${appPath}.gen-${process.pid}`;\n    fs.writeFileSync(tmp, r.text);\n    fs.renameSync(tmp, appPath);\n', new: '    fs.writeFileSync(appPath, r.text);\n' },
  { mech: 'ATOMIC', file: 'gen', name: 'the temp copied, not renamed', old: '    fs.renameSync(tmp, appPath);', new: '    fs.copyFileSync(tmp, appPath);' },
  { mech: 'CHECK', file: 'gen', name: '--check touches app.html', old: "  const src = fs.readFileSync(appPath, 'utf8');\n", new: "  const src = fs.readFileSync(appPath, 'utf8');\n  if (CHECK) { fs.writeFileSync(`${appPath}.c`, src); fs.renameSync(`${appPath}.c`, appPath); }\n" },
  { mech: 'REFUSE', file: 'lib', name: 'two root tags accepted', old: '  if (tags.length !== 1) return', new: '  if (tags.length === 0) return' },
  { mech: 'REFUSE', file: 'lib', name: 'a doubled attribute accepted', old: "  if ((tag.match(/\\sdata-ob-html=/g) || []).length > 1) return", new: '  if (false) return' },
  { invalid: true, file: 'lib', drop: true, name: 'the generator copied without its lib' },
];

let verdictPrinted = false;
const verdict = (line, code) => { verdictPrinted = true; console.log(line); process.exit(code); };
process.on('beforeExit', () => { if (!verdictPrinted) { verdictPrinted = true; console.log('[gen-htmlid] INVALID: no verdict'); process.exitCode = 2; } });

const args = process.argv.slice(2);
const genPath = path.resolve(args.find((a) => !a.startsWith('--')) || path.join(here, 'gen-sw-precache.mjs'));
const src = fs.readFileSync(genPath, 'utf8');
const libPath = path.join(path.dirname(genPath), 'lib', 'html-gen-id.mjs');
const libSrc = fs.existsSync(libPath) ? fs.readFileSync(libPath, 'utf8') : null; // a pre-lib revision has none
if (!args.includes('--selftest')) {
  const { invalid, red } = judge(src, libSrc);
  if (invalid.length) verdict(`[gen-htmlid] verdict INVALID: ${invalid.join('; ')}`, 2);
  for (const m of MECHS) console.log(`[gen-htmlid] ${red[m].length ? 'FAIL' : 'ok'} ${m}${red[m].length ? `: ${red[m].join('; ')}` : ''}`);
  const reds = MECHS.filter((m) => red[m].length);
  if (reds.length) verdict(`[gen-htmlid] verdict FAIL — ${reds.join(', ')}`, 1);
  verdict(`[gen-htmlid] verdict PASS — ${MECHS.length} clauses (${MECHS.join(', ')})`, 0);
}
// the plants target the lib: a revision without it cannot be self-tested (INVALID, not a FAIL)
if (libSrc === null) verdict('[gen-htmlid selftest] INVALID: no lib/html-gen-id.mjs in this revision (the plants target it)', 2);
const base = judge(src, libSrc);
if (base.invalid.length || MECHS.some((m) => base.red[m].length)) verdict(`[gen-htmlid selftest] the tree's generator is not green: ${JSON.stringify(base)}`, 2);
let bad = 0, collateral = 0;
for (const p of PLANTS) {
  let r;
  if (p.drop) r = judge(src, null);
  else {
    const target = p.file === 'lib' ? libSrc : src;
    const n = target.split(p.old).length - 1;
    if (n !== 1) { console.log(`[gen-htmlid selftest] INVALID plant "${p.name}": anchor count ${n} in ${p.file}`); bad++; continue; }
    r = p.file === 'lib' ? judge(src, libSrc.replace(p.old, p.new)) : judge(src.replace(p.old, p.new), libSrc);
  }
  const hit = MECHS.filter((m) => r.red[m] && r.red[m].length);
  // a plant must turn its own clause red; a broken id usually breaks the clauses downstream of it too (collateral)
  // the drop plant's INVALID must be the missing module, not some other failure
  const ok = p.invalid ? r.invalid.length > 0 && (!p.drop || /ERR_MODULE_NOT_FOUND|html-gen-id/.test(r.invalid.join(' '))) : !r.invalid.length && hit.includes(p.mech);
  if (ok && hit.length > 1) collateral++;
  console.log(`[gen-htmlid selftest] ${ok ? 'caught' : 'MISSED'} plant "${p.name}" -> ${p.invalid ? 'want INVALID' : 'red'} ${JSON.stringify(hit)}${r.invalid.length ? ` invalid ${JSON.stringify(r.invalid).slice(0, 160)}` : ''}`);
  if (!ok) bad++;
}
verdict(bad ? `[gen-htmlid selftest] FAIL (${bad})` : `[gen-htmlid selftest] OK: ${PLANTS.length} plants each caught on its own clause (${collateral} with collateral; ${PLANTS.filter((p) => p.invalid).length} INVALID)`, bad ? 1 : 0);
