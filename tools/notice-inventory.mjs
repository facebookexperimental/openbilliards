#!/usr/bin/env node

// Copyright (c) Meta Platforms, Inc. and affiliates.

// notice-inventory.mjs — the third-party notice files every distribution of the app must carry, as
// paths relative to web/: web/vendor/LICENSES.md, every licence or notice text it references (a
// `backticked` path on one line whose file name starts with LICENSE, NOTICE or COPYING, relative to
// web/vendor/), and the copy of the Rust-crate notices next to each wasm binary
// (tools/gen-rust-notices.mjs). Derived from LICENSES.md, so a newly referenced text is never
// forgotten. ios/tools/bundle-manifest.mjs and web/tools/pages-artifact-gate.mjs use it;
// scripts/release-preflight.sh (`notices`) applies the same rule in the shell.
// The census keeps LICENSES.md itself complete: every git-tracked file under web/vendor/ must be
// named in it by its full path (a `backticked` path relative to web/vendor/), so a newly vendored
// file cannot ship without its notice.
//
//   node tools/notice-inventory.mjs              print the inventory of this checkout, one path per line
//   node tools/notice-inventory.mjs --census [<repo>]
//                                                every tracked file under web/vendor/ of <repo> (default:
//                                                this checkout) is named in its LICENSES.md (CI's node job)
//   node tools/notice-inventory.mjs --selftest   planted LICENSES.md variants in a scratch directory
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DIST_NOTICES = ['dist/pool-wasm/LICENSE-rust-crates.txt', 'dist/pool-rules/LICENSE-rust-crates.txt',
  'dist/pool-wasm/LICENSE-Apache-2.0.txt', 'dist/pool-wasm/NOTICE-pooltool.txt'];

// LICENSES.md as text; throws when it is missing or not valid UTF-8
function readLicenses(webDir) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(fs.readFileSync(path.join(webDir, 'vendor/LICENSES.md'))); }
  catch (e) { if (e instanceof TypeError) throw new Error('web/vendor/LICENSES.md is not valid UTF-8'); throw e; }
}
const canonical = (r) => r.split('/').filter((s) => s !== '.' && s !== '').join('/');

// throws (fail closed) when LICENSES.md is missing or not valid UTF-8, references no licence text,
// or references one outside web/vendor/, with a blank or with a glob character (the shell copy
// expands the list unquoted). Each reference is emitted in the canonical form the bundle manifest
// and the zip entries use ("./a" and "a/./b" collapse; ".." and absolute paths stay refused).
export function noticeInventory(webDir) {
  const md = readLicenses(webDir);
  const refs = [...md.matchAll(/`([^`\n]+)`/g)].map((m) => m[1])
    .filter((r) => /(?:^|\/)(?:LICENSE|NOTICE|COPYING)[^/]*$/.test(r));
  if (!refs.length) throw new Error('web/vendor/LICENSES.md references no licence text');
  for (const r of refs) {
    if (r.startsWith('/') || r.split('/').includes('..') || /\s/.test(r) || /[*?[]/.test(r)) {
      throw new Error(`web/vendor/LICENSES.md references a licence file outside web/vendor/, with a blank or with a glob character: ${r}`);
    }
  }
  return [...new Set(['vendor/LICENSES.md', ...refs.map((r) => `vendor/${canonical(r)}`), ...DIST_NOTICES])];
}

// the census: the files (paths relative to web/vendor/) that LICENSES.md does not name by their full
// path in backticks ("./a", "/a", "a/" and "x//a" spell the same path; a bare file name does not name
// a file in a subdirectory). LICENSES.md itself needs no entry.
export function vendorCensus(webDir, files) {
  const named = new Set([...readLicenses(webDir).matchAll(/`([^`\n]+)`/g)].map((m) => canonical(m[1])));
  return files.filter((f) => f !== 'LICENSES.md' && !named.has(f));
}

// git must read the repository it is pointed at, not one an inherited GIT_DIR or index names
const GIT_ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^GIT_(?:DIR|WORK_TREE|INDEX_FILE)$/.test(k)));

// the git-tracked files under <root>/web/vendor/, relative to it; throws when git fails, lists a name
// that is not valid UTF-8 (two such names could decode to one), lists web/vendor/ spelled in another
// letter case (a case-insensitive checkout ships it from web/vendor/), lists an entry that is not a
// regular file (a submodule or a symlink is one entry whose own files would ship unnamed), or does not
// list LICENSES.md (a census over nothing never passes)
export function trackedVendorFiles(root) {
  const raw = execFileSync('git', ['-C', root, 'ls-files', '-s', '-z', '--', ':(icase)web/vendor'], { env: GIT_ENV, maxBuffer: 64 << 20 });
  let out;
  try { out = new TextDecoder('utf-8', { fatal: true }).decode(raw); }
  catch { throw new Error('git lists a file name under web/vendor/ that is not valid UTF-8'); }
  const files = new Set();
  for (const entry of out.split('\0').filter(Boolean)) {
    const m = entry.match(/^(\d{6}) [0-9a-f]+ \d\t([\s\S]+)$/);
    if (!m) throw new Error(`unexpected git ls-files entry: ${entry}`);
    if (!m[2].startsWith('web/vendor/')) throw new Error(`${m[2]} spells web/vendor/ in another letter case; a case-insensitive checkout ships it from web/vendor/ unnamed`);
    const rel = m[2].slice('web/vendor/'.length);
    if (m[1] !== '100644' && m[1] !== '100755') throw new Error(`web/vendor/${rel} is not a regular file (git mode ${m[1]}); vendor the files themselves, each named in LICENSES.md`);
    files.add(rel);
  }
  if (!files.has('LICENSES.md')) throw new Error(`git lists no tracked web/vendor/LICENSES.md in ${root}`);
  return [...files];
}

function census(repoArg) {
  const root = path.resolve(repoArg || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
  let files, unnamed;
  try { files = trackedVendorFiles(root); unnamed = vendorCensus(path.join(root, 'web'), files); }
  catch (e) { console.error(`notice-inventory: FAIL --census: ${e.message}`); return 1; }
  for (const f of unnamed) console.error(`notice-inventory: FAIL web/vendor/${f} is not named in web/vendor/LICENSES.md by its full path (\`${f}\`)`);
  if (unnamed.length) return 1;
  console.log(`notice-inventory: --census OK (${files.length} tracked files under web/vendor/, each named in LICENSES.md by its full path)`);
  return 0;
}

function selftest() {
  const T = fs.mkdtempSync(path.join(os.tmpdir(), 'notice-inventory.'));
  let pass = 0, failn = 0;
  const run = (md) => {
    fs.mkdirSync(path.join(T, 'vendor'), { recursive: true });
    fs.writeFileSync(path.join(T, 'vendor/LICENSES.md'), md); // a string is written as UTF-8, a Buffer as is
    try { return noticeInventory(T); } catch (e) { return e; }
  };
  const expect = (label, ok, got) => {
    if (ok) { pass++; console.log(`ok   ${label}`); } else { failn++; console.log(`FAIL ${label}: ${got instanceof Error ? got.message : JSON.stringify(got)}`); }
  };
  try {
    let r = run('Full text: `LICENSE-three.txt`.\n');
    expect('a plain reference', Array.isArray(r) && r.join(' ') === `vendor/LICENSES.md vendor/LICENSE-three.txt ${DIST_NOTICES.join(' ')}`, r);
    r = run('Full text: `./LICENSE-three.txt`.\n');
    expect('"./LICENSE-three.txt" gives the canonical vendor/LICENSE-three.txt', Array.isArray(r) && r.includes('vendor/LICENSE-three.txt') && !r.some((x) => x.includes('/./')), r);
    r = run('Full text: `x/./y/LICENSE`.\n');
    expect('"x/./y/LICENSE" collapses to vendor/x/y/LICENSE', Array.isArray(r) && r.includes('vendor/x/y/LICENSE') && !r.some((x) => x.includes('/./')), r);
    r = run('Full text: `x//y/LICENSE`.\n');
    expect('"x//y/LICENSE" collapses to vendor/x/y/LICENSE', Array.isArray(r) && r.includes('vendor/x/y/LICENSE'), r);
    r = run('Full text: `LICENSE-three.txt`; again: `./LICENSE-three.txt`.\n');
    expect('the same file referenced twice, once with "./", is one inventory line', Array.isArray(r) && r.filter((x) => x === 'vendor/LICENSE-three.txt').length === 1 && r.length === 2 + DIST_NOTICES.length, r);
    for (const bad of ['../LICENSE', '/abs/LICENSE', 'x/../../LICENSE', 'a b/LICENSE', 'LICENSE-*.txt', 'LICENSE[1].txt', 'LICENSE-?.txt']) {
      r = run(`Full text: \`${bad}\`.\n`);
      expect(`"${bad}" is refused`, r instanceof Error && /outside web\/vendor\//.test(r.message), r);
    }
    r = run(Buffer.concat([Buffer.from('Prose in cp1252 '), Buffer.from([0x97]), Buffer.from(' here. Full text: `LICENSE-three.txt`.\n')]));
    expect('a LICENSES.md that is not valid UTF-8 is refused', r instanceof Error && /not valid UTF-8/.test(r.message), r);
    r = run('No licence here: `three.module.min.js`.\n');
    expect('a LICENSES.md without a licence reference is refused', r instanceof Error && /references no licence text/.test(r.message), r);
    fs.rmSync(path.join(T, 'vendor/LICENSES.md'));
    r = (() => { try { return noticeInventory(T); } catch (e) { return e; } })();
    expect('a missing LICENSES.md is refused', r instanceof Error, r);

    // the census: every tracked file under web/vendor/ named in LICENSES.md by its full path
    const named = (md, files) => { run(md); try { return vendorCensus(T, files); } catch (e) { return e; } };
    const MD = '- `three.module.min.js`\n- `jsm/postprocessing/EffectComposer.js`, `./jsm/shaders/CopyShader.js`\nFull text: `LICENSE-three.txt`.\n';
    r = named(MD, ['LICENSES.md', 'LICENSE-three.txt', 'three.module.min.js', 'jsm/postprocessing/EffectComposer.js', 'jsm/shaders/CopyShader.js']);
    expect('census: every file named by its full path ("./" too) passes; LICENSES.md needs no entry', Array.isArray(r) && r.length === 0, r);
    r = named(MD, ['LICENSES.md', 'three.module.min.js', 'new-lib/new-lib.mjs']);
    expect('census: an unnamed vendored file is reported', Array.isArray(r) && r.join(' ') === 'new-lib/new-lib.mjs', r);
    r = named(`${MD}- \`Pass.js\`\n`, ['LICENSES.md', 'jsm/postprocessing/Pass.js']);
    expect('census: a file named by its bare file name only is reported', Array.isArray(r) && r.join(' ') === 'jsm/postprocessing/Pass.js', r);
    r = named(`${MD}Prose mentions other-lib/other-lib.min.js without backticks.\n`, ['LICENSES.md', 'other-lib/other-lib.min.js']);
    expect('census: a path outside backticks does not name a file', Array.isArray(r) && r.join(' ') === 'other-lib/other-lib.min.js', r);

    // the CLI over a scratch git repository: red while a tracked vendored file is unnamed, green once named
    const repo = path.join(T, 'repo');
    fs.mkdirSync(path.join(repo, 'web/vendor/new-lib'), { recursive: true });
    fs.writeFileSync(path.join(repo, 'web/vendor/LICENSES.md'), 'Full text: `LICENSE-x.txt`.\n');
    fs.writeFileSync(path.join(repo, 'web/vendor/LICENSE-x.txt'), 'x\n');
    fs.writeFileSync(path.join(repo, 'web/vendor/new-lib/new-lib.mjs'), 'export {};\n');
    const git = (args, input) => execFileSync('git', ['-C', repo, ...args], { env: GIT_ENV, input, stdio: 'pipe' }).toString().trim();
    git(['init', '-q']);
    git(['config', 'core.ignorecase', 'false']); // the letter-case plant below reads the same on every host
    git(['add', '-A', '-f']); // -f: a global excludes file must not hide a plant
    const cli = (env = GIT_ENV) => spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--census', repo], { encoding: 'utf8', env });
    let c = cli();
    expect('census CLI: an unnamed tracked vendored file exits 1 and names it', c.status === 1 && c.stderr.includes('web/vendor/new-lib/new-lib.mjs is not named'), c.stderr || c.stdout);
    fs.appendFileSync(path.join(repo, 'web/vendor/LICENSES.md'), '- `new-lib/new-lib.mjs`\n');
    fs.writeFileSync(path.join(repo, 'web/vendor/untracked.js'), '\n');
    c = cli();
    expect('census CLI: exit 0 once it is named (an untracked file never ships from a release clone)', c.status === 0 && /--census OK \(3 tracked files/.test(c.stdout), c.stderr || c.stdout);
    const empty = path.join(T, 'empty');
    fs.mkdirSync(empty);
    execFileSync('git', ['-C', empty, 'init', '-q'], { env: GIT_ENV, stdio: 'pipe' });
    c = cli({ ...GIT_ENV, GIT_DIR: path.join(empty, '.git'), GIT_INDEX_FILE: path.join(empty, '.git/index') });
    expect('census CLI: an inherited GIT_DIR and GIT_INDEX_FILE of another repository are ignored', c.status === 0 && /--census OK \(3 tracked files/.test(c.stdout), c.stderr || c.stdout);
    const blob = git(['hash-object', '-w', '--stdin'], 'new-lib\n');
    for (const [mode, name, kind] of [['120000', 'link', 'symlink'], ['160000', 'sub', 'submodule']]) {
      git(['update-index', '--add', '--cacheinfo', `${mode},${blob},web/vendor/${name}`]);
      fs.appendFileSync(path.join(repo, 'web/vendor/LICENSES.md'), `- \`${name}\`\n`);
      c = cli();
      expect(`census CLI: a tracked ${kind} under web/vendor/ exits 1 even when named`, c.status === 1 && c.stderr.includes(`web/vendor/${name} is not a regular file (git mode ${mode})`), c.stderr || c.stdout);
      git(['update-index', '--force-remove', '--', `web/vendor/${name}`]);
    }
    git(['update-index', '--add', '--cacheinfo', `100644,${blob},web/Vendor/case.js`]);
    fs.appendFileSync(path.join(repo, 'web/vendor/LICENSES.md'), '- `case.js`\n');
    c = cli();
    expect('census CLI: a tracked web/Vendor/ path (another letter case) exits 1 even when named', c.status === 1 && c.stderr.includes('web/Vendor/case.js spells web/vendor/ in another letter case'), c.stderr || c.stdout);
    git(['update-index', '--force-remove', '--', 'web/Vendor/case.js']);
    const rawName = (m, id) => Buffer.concat([Buffer.from(`${m} ${id}\tweb/vendor/`), Buffer.from([0xff]), Buffer.from('.js\0')]);
    git(['update-index', '-z', '--index-info'], rawName('100644', blob));
    c = cli();
    expect('census CLI: a tracked file name that is not valid UTF-8 exits 1', c.status === 1 && c.stderr.includes('that is not valid UTF-8'), c.stderr || c.stdout);
    git(['update-index', '-z', '--index-info'], rawName('0', '0'.repeat(blob.length)));
    git(['rm', '-q', '-f', '--cached', '--', 'web/vendor/LICENSES.md']);
    c = cli();
    expect('census CLI: an untracked LICENSES.md exits 1 (no census over nothing)', c.status === 1 && c.stderr.includes('no tracked web/vendor/LICENSES.md'), c.stderr || c.stdout);
  } finally {
    fs.rmSync(T, { recursive: true, force: true });
  }
  console.log(`notice-inventory selftest: ${pass} passed, ${failn} failed`);
  return failn ? 1 : 0;
}

// the entry point is compared by real path (a checkout reached through a symlink still runs)
const realArgv1 = (() => { try { return fs.realpathSync(process.argv[1] || ''); } catch { return null; } })();
if (realArgv1 && realArgv1 === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === '--selftest') process.exit(selftest());
  if (process.argv[2] === '--census') process.exit(census(process.argv[3]));
  const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../web');
  process.stdout.write(`${noticeInventory(web).join('\n')}\n`);
}
