// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-capture-out.mjs — #1290: no e2e suite writes a capture into the served web root. e2e-i18n, e2e-aim, e2e.mjs and
// e2e-userboot saved their screenshots over tracked PNGs at the root of web/ on every run (e2e-combined did until
// #1108), so a local run left the checkout dirty. Their captures now go through lib/capture-out.mjs: --out <dir>, by
// default /tmp/<suite>-<cdp port>. Plain node, no browser, no ports; it reads source text and calls the helper.
//   S1 no web/tools/e2e.mjs or e2e-*.mjs passes a web-root path to a screenshot call or a .png write
//      (path.join(webDir, …) or a bare webDir), comments excluded
//   S2 each of the four suites imports captureOut and calls it before its first spawnStaticServer() call, so a usage
//      error exits before any server or browser starts
//   P1 parseOutArgs: the accepted forms (none, --out <dir>, --out=<dir>) and the usage errors (a bare, blank or
//      repeated --out, a value that starts with --, an unknown option, a positional)
//   D1 captureOut()'s default directory is laneArtifactDir(<suite>, <cdp port>), outside the repository, and shot()
//      names a file inside it
// The source reader is cdp.mjs stripComments, which fails closed: a source it cannot read fails the run.
//
//   node web/tools/test-capture-out.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { laneArtifactDir, stripComments } from './cdp.mjs';

const TOOLS = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(TOOLS, '..', '..');
const SUITES = ['e2e-i18n.mjs', 'e2e-aim.mjs', 'e2e.mjs', 'e2e-userboot.mjs'];
let failed = 0;
const fail = (row, msg) => { failed++; console.error(`TEST-CAPTURE-OUT FAIL: ${row}: ${msg}`); };
const code = (file) => stripComments(fs.readFileSync(path.join(TOOLS, file), 'utf8'));
const lineOf = (text, at) => text.slice(0, at).split('\n').length;

// ---- S1: no capture lands in the served web root
{
  const WEB_ROOT = String.raw`(?:path\.(?:join|resolve)\(\s*)?(?:webDir|WEB_DIR)\b`;
  const RES = [
    new RegExp(String.raw`\.screenshot\(\s*` + WEB_ROOT, 'g'),
    new RegExp(String.raw`writeFileSync\(\s*` + WEB_ROOT + String.raw`[^\n]*\.png`, 'g'),
  ];
  const files = fs.readdirSync(TOOLS).filter((f) => /^e2e(-[a-z0-9-]+)?\.mjs$/.test(f)).sort();
  const hits = [];
  for (const f of files) {
    const text = code(f);
    for (const re of RES) for (const m of text.matchAll(re)) hits.push(`${f}:${lineOf(text, m.index)}`);
  }
  if (hits.length) fail('S1', `${hits.length} call(s) pass a web-root path to a screenshot or a .png write: ${hits.join(', ')}`);
  else console.log(`S1 ok: none of ${files.length} e2e suites passes path.join(webDir|WEB_DIR, …) or a bare webDir/WEB_DIR to a screenshot call or a .png writeFileSync`);
}

// ---- S2: the four suites read --out before any server starts
for (const f of SUITES) {
  const text = code(f);
  const imp = /import\s*\{[^}]*\bcaptureOut\b[^}]*\}\s*from\s*'\.\/lib\/capture-out\.mjs'/.test(text);
  const call = text.search(/\bcaptureOut\(/);
  const server = text.search(/\bspawnStaticServer\(/);
  if (!imp || call < 0) fail('S2', `${f} does not take its capture directory from lib/capture-out.mjs captureOut()`);
  else if (server < 0) fail('S2', `${f} has no spawnStaticServer() call to order its captureOut() call against`);
  else if (call > server) fail('S2', `${f} calls captureOut() at line ${lineOf(text, call)}, after its first spawnStaticServer() (line ${lineOf(text, server)})`);
  else console.log(`S2 ok: ${f} reads --out (line ${lineOf(text, call)}) before its first server (line ${lineOf(text, server)})`);
}

// ---- P1 + D1: the helper itself
let lib = null;
try {
  lib = await import('./lib/capture-out.mjs');
} catch (e) {
  fail('P1', `lib/capture-out.mjs does not load: ${e.message}`);
  fail('D1', 'lib/capture-out.mjs does not load');
}
if (lib) {
  const ok = [[[], null], [['--out', 'x'], 'x'], [['--out=x'], 'x'], [['--out', 'web'], 'web'], [['--out=a b'], 'a b']];
  const bad = [['--out'], ['--out='], ['--out', ''], ['--out', ' '], ['--out', '--x'], ['--out=--x'],
    ['--out', 'a', '--out', 'b'], ['--out=a', '--out=b'], ['x'], ['--bogus'], ['--out', 'a', 'b'], ['-o', 'x']];
  const wrong = [];
  for (const [argv, want] of ok) {
    const r = lib.parseOutArgs(argv);
    if (r.error !== undefined || r.out !== want) wrong.push(`${JSON.stringify(argv)} -> ${JSON.stringify(r)}`);
  }
  for (const argv of bad) {
    const r = lib.parseOutArgs(argv);
    if (typeof r.error !== 'string') wrong.push(`${JSON.stringify(argv)} -> ${JSON.stringify(r)} (want a usage error)`);
  }
  if (wrong.length) fail('P1', `parseOutArgs: ${wrong.join('; ')}`);
  else console.log(`P1 ok: parseOutArgs accepts ${ok.length} forms and refuses ${bad.length}`);
  const c = lib.captureOut('e2e-probe', 23456, []);
  const inRepo = !path.relative(REPO, c.dir).startsWith('..') && !path.isAbsolute(path.relative(REPO, c.dir));
  const shot = c.shot('x.png');
  if (c.dir !== laneArtifactDir('e2e-probe', 23456) || inRepo || shot !== path.join(c.dir, 'x.png')) {
    fail('D1', `default directory ${c.dir} (inside the repository: ${inRepo}), shot('x.png') = ${shot}`);
  } else console.log(`D1 ok: the default directory is ${c.dir}, outside the repository, and shot() names a file inside it`);
}

console.log(failed ? `test-capture-out: FAIL (${failed})` : 'test-capture-out: PASS');
process.exitCode = failed ? 1 : 0;
