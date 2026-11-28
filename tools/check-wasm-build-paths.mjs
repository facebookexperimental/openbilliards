#!/usr/bin/env node

// Copyright (c) Meta Platforms, Inc. and affiliates.

// check-wasm-build-paths — no build-machine path in a shipped wasm (GH-977).
//
// rustc records a source path for every reachable panic location. Built without a remap,
// a dependency's path is the builder's absolute cargo home
// (`<home>/.cargo/registry/src/index.crates.io-<16hex>/<crate>-<ver>/src/...`): the home
// directory and the account name, inside the binary every player downloads.
// scripts/build-canonical-wasm.sh remaps the cargo home to `/cargo`; this gate holds the
// result.
//
// THE ASSERTION, per checked wasm (the raw bytes, read as latin1: rust packs its string
// literals into data segments with no separator between them, so a strings(1) split is not
// enough and the deny tokens are matched anywhere in the bytes):
//   DENY   no byte sequence matches a home / user / build-machine marker (DENY_TOKENS:
//          /Users/, /home/, /root/, macOS and Linux temp and volume roots, CI workspace
//          roots, a cargo or rustup home `.cargo/` `.rustup/`, a Windows drive or user
//          path), absolute or not, wherever it sits;
//   FORBID no `--forbid <text>` argument occurs at a token boundary (the byte before it is not
//          a path character, the byte after it is not a name character), so `/src` as a
//          checkout root is not confused with `pool-core/src/`
//          (scripts/build-canonical-wasm.sh passes the builder's own home, account name,
//          cargo home and checkout path, so the build machine checks its own names);
//   PREFIX every boundary-delimited absolute path (a `/seg/...` run whose previous byte is
//          not a path character) starts with a SANCTIONED prefix:
//            /rustc/<40 hex>/library/   the standard library, as rustc ships it
//            /rust/deps/                std's own dependencies, likewise
//            /cargo/registry/src/index.crates.io-<16 hex>/   crates.io sources after the
//                                       canonical recipe's remap;
//   SECTION the module parses and carries no custom section but `name`, `producers` and
//          `target_features` (DWARF `.debug_*`, `sourceMappingURL` or `external_debug_info`
//          would carry the checkout's absolute paths or point outside the binary).
// Workspace crates compile with workspace-relative paths (crates/pool-core/src/rack.rs),
// which are not absolute and are scripts/opensource/leak-audit.mjs's to pin.
//
// SCOPE: the files named on the command line; with none, every git-tracked *.wasm.
// The archived lineage kernels (ARCHIVED below) are frozen historical builds that the
// G-KERNEL legs re-simulate on and the app never serves: rebuilding one would change the
// bytes it exists to preserve, so each is exempted by exact path AND git blob sha. A
// changed archive, a missing one, or a new tracked wasm that is not declared is red.
//
// NOT PROVEN (printed on every run): an absolute path packed directly behind another
// string's last character has no boundary, so PREFIX cannot see it; only DENY and FORBID
// do. Native binaries (the pool_py wheels) are not wasm and not read here.
//
// Usage: node tools/check-wasm-build-paths.mjs [file.wasm ...] [--forbid <text> ...]
//        node tools/check-wasm-build-paths.mjs --selftest

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Archived lineage kernels: [repo path, git blob sha, why it is frozen].
const ARCHIVED = [
  ['web/tools/fixtures/pre012-wasm/pool_wasm_bg.wasm', 'ecd0ae36d3ea3b264fefb0996cda41e8e2c0df1e',
    'the T003-archived pre-012 kernel the G-KERNEL legacy corpus re-simulates on (feature 012)'],
  ['web/tools/fixtures/b6b5dc3f-wasm/pool_wasm_bg.wasm', '56009ce216f70c880aceb0c927809e65a641dc14',
    'the shipped 0.1.0+b6b5dc3f kernel the GH-789 own-kernel corpus pins re-simulate on'],
];

const DENY_TOKENS = [
  ['/Users/', 'macOS home root'],
  ['/home/', 'Linux home root'],
  ['/root/', 'root home'],
  ['/var/folders/', 'macOS per-user temp root'],
  ['/private/', 'macOS private root (/private/var, /private/tmp)'],
  ['/tmp/', 'temp root'],
  ['/Volumes/', 'macOS volume root'],
  ['/mnt/', 'mount root'],
  ['/media/', 'mount root'],
  ['/__w/', 'GitHub Actions container workspace root'],
  ['/github/workspace/', 'GitHub Actions workspace root'],
  ['/runner/work/', 'GitHub Actions runner workspace'],
  ['/nix/store/', 'Nix store path'],
  ['.cargo/', 'a cargo home (the canonical remap leaves /cargo, never .cargo)'],
  ['.rustup/', 'a rustup home'],
  ['\\Users\\', 'Windows user root'],
];
const WIN_DRIVE_RE = /[A-Za-z]:\\[A-Za-z0-9 ._-]+\\/g;
const SANCTIONED = [
  [/^\/rustc\/[0-9a-f]{40}\/library\//, '/rustc/<40hex>/library/'],
  [/^\/rust\/deps\//, '/rust/deps/'],
  [/^\/cargo\/registry\/src\/index\.crates\.io-[0-9a-f]{16}\//, '/cargo/registry/src/index.crates.io-<16hex>/'],
];
const PATH_CHAR = /[A-Za-z0-9._@+~\-/]/;
const NAME_CHAR = /[A-Za-z0-9_]/;
// A path's first segment starts like a name (a letter, `_`, `.`, `~` or `@`), which keeps
// catalog fractions such as `1 3/4"/3/16"` out of the candidate set.
const ABS_RE = /\/[A-Za-z_.~@][A-Za-z0-9._@+~-]*\/[A-Za-z0-9._@+~\-/]*/g;
const CUSTOM_SECTIONS = new Set(['name', 'producers', 'target_features']);
const NOT_PROVEN = [
  'an absolute path packed directly behind another string\'s last character has no boundary; PREFIX cannot see it, only DENY and FORBID do',
  'native binaries (the pool_py wheels) are not wasm and are not read here',
];

const blobSha = (bytes) => createHash('sha1')
  .update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes])).digest('hex');

function context(text, at, len) {
  const lo = Math.max(0, at - 24);
  const hi = Math.min(text.length, at + len + 48);
  return text.slice(lo, hi).replace(/[^\x20-\x7e]/g, '.');
}

// The custom-section names of a wasm module, or an error string when it does not parse.
function customSections(bytes) {
  const b = Buffer.from(bytes);
  if (b.length < 8 || b.readUInt32BE(0) !== 0x0061736d) return 'not a wasm module (bad magic)';
  const names = [];
  let p = 8;
  const leb = () => {
    let r = 0, shift = 0, x;
    do {
      if (p >= b.length) throw new Error('truncated LEB128');
      x = b[p++]; r += (x & 0x7f) * 2 ** shift; shift += 7;
    } while (x & 0x80);
    return r;
  };
  try {
    while (p < b.length) {
      const id = b[p++];
      const len = leb();
      const end = p + len;
      if (end > b.length) return `section ${id} overruns the module`;
      if (id === 0) {
        const n = leb();
        names.push(b.subarray(p, p + n).toString('utf8'));
      }
      p = end;
    }
  } catch (e) { return String(e.message ?? e); }
  return names;
}

// Every finding in one wasm's bytes: [{ rule, at, detail }].
export function scanBytes(bytes, forbid = []) {
  const text = Buffer.from(bytes).toString('latin1');
  const out = [];
  const sections = customSections(bytes);
  if (typeof sections === 'string') {
    out.push({ rule: 'SECTION', at: 0, detail: `unparseable module: ${sections}` });
  } else {
    for (const name of sections) {
      if (!CUSTOM_SECTIONS.has(name)) {
        out.push({ rule: 'SECTION', at: 0, detail: `custom section '${name}' (only name, producers, target_features ship)` });
      }
    }
  }
  for (const [tok, why] of DENY_TOKENS) {
    for (let at = text.indexOf(tok); at >= 0; at = text.indexOf(tok, at + 1)) {
      out.push({ rule: 'DENY', at, detail: `${why}: '${context(text, at, tok.length)}'` });
    }
  }
  for (const m of text.matchAll(WIN_DRIVE_RE)) {
    out.push({ rule: 'DENY', at: m.index, detail: `Windows drive path: '${context(text, m.index, m[0].length)}'` });
  }
  for (const f of forbid) {
    if (!f) continue;
    for (let at = text.indexOf(f); at >= 0; at = text.indexOf(f, at + 1)) {
      if (at > 0 && PATH_CHAR.test(text[at - 1])) continue;
      if (!f.endsWith('/') && NAME_CHAR.test(text[at + f.length] ?? '')) continue;
      out.push({ rule: 'FORBID', at, detail: `build-machine text '${f}': '${context(text, at, f.length)}'` });
    }
  }
  for (const m of text.matchAll(ABS_RE)) {
    if (m.index > 0 && PATH_CHAR.test(text[m.index - 1])) continue;
    if (SANCTIONED.some(([re]) => re.test(m[0]))) continue;
    out.push({ rule: 'PREFIX', at: m.index, detail: `absolute path outside the sanctioned prefixes: '${context(text, m.index, m[0].length)}'` });
  }
  return out.sort((a, b) => a.at - b.at);
}

// The default scope: [{ rel, bytes }] of every tracked wasm, plus scope findings.
function trackedScope(listTracked, read) {
  const rels = listTracked().filter((r) => r.endsWith('.wasm')).sort();
  const files = [];
  const scope = [];
  const archived = new Map(ARCHIVED.map(([rel, blob, why]) => [rel, { blob, why }]));
  for (const rel of rels) {
    const bytes = read(rel);
    const arc = archived.get(rel);
    if (!arc) { files.push({ rel, bytes }); continue; }
    const got = blobSha(bytes);
    if (got !== arc.blob) {
      scope.push(`${rel}: archived kernel's blob is ${got}, declared ${arc.blob || '<none>'} — an archive never changes; re-declare only with the lineage change that moved it`);
    }
  }
  for (const [rel] of archived) {
    if (!rels.includes(rel)) scope.push(`${rel}: declared archived kernel is not tracked (stale declaration — delete it)`);
  }
  return { files, scope, archivedCount: rels.filter((r) => archived.has(r)).length };
}

function gitTracked() {
  return execFileSync('git', ['ls-files', '-z', '--', '*.wasm'], { cwd: ROOT, encoding: 'utf8' })
    .split('\0').filter(Boolean);
}

function run(argv) {
  const forbid = [];
  const files = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--forbid') forbid.push(argv[++i] ?? '');
    else files.push(argv[i]);
  }
  let targets;
  let scope = [];
  let archivedCount = 0;
  if (files.length) {
    targets = files.map((f) => ({ rel: f, bytes: readFileSync(f) }));
  } else {
    ({ files: targets, scope, archivedCount } = trackedScope(gitTracked, (rel) => readFileSync(path.join(ROOT, rel))));
  }
  let red = scope.length;
  for (const s of scope) console.log(`RED scope: ${s}`);
  for (const { rel, bytes } of targets) {
    const found = scanBytes(bytes, forbid);
    red += found.length;
    for (const f of found.slice(0, 40)) console.log(`RED ${rel} @${f.at} ${f.rule}: ${f.detail}`);
    if (found.length > 40) console.log(`RED ${rel}: … ${found.length - 40} more`);
    console.log(`${found.length ? 'RED' : 'ok '} ${rel}: ${found.length} finding(s), ${bytes.length} bytes`);
  }
  for (const n of NOT_PROVEN) console.log(`not proven: ${n}`);
  const tail = files.length ? '' : `, ${archivedCount} archived kernel(s) exempt by blob`;
  console.log(red
    ? `check-wasm-build-paths: ${red} RED in ${targets.length} wasm${tail}`
    : `check-wasm-build-paths: OK — ${targets.length} wasm checked${tail}`);
  return red ? 1 : 0;
}

// --selftest: synthetic arms for every rule, both directions, plus the real archived kernels
// (non-remapped builds in the tree) as the planted red that a build without the remap fails.
function selftest() {
  const leb = (n) => { const o = []; do { let x = n & 0x7f; n = Math.floor(n / 128); if (n) x |= 0x80; o.push(x); } while (n); return Buffer.from(o); };
  const section = (name, payload) => {
    const body = Buffer.concat([leb(Buffer.byteLength(name)), Buffer.from(name), payload]);
    return Buffer.concat([Buffer.from([0]), leb(body.length), body]);
  };
  const HEADER = Buffer.from([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0]);
  // a module whose 'name' custom section holds the strings, each NUL-delimited on both
  // sides (so the section name's last letter never glues onto the first string)
  const wasm = (...parts) => Buffer.concat([HEADER, section('name', Buffer.concat([Buffer.from([0]),
    ...parts.map((p) => Buffer.concat([Buffer.from(p, 'latin1'), Buffer.from([0])]))]))]);
  const H40 = 'c1b22f44c3f30e186b829de95f59740c3a690aba';
  const IDX = 'index.crates.io-1949cf8c6b5b557f';
  const arms = [
    ['home cargo registry path', wasm(`/Users/someone/.cargo/registry/src/${IDX}/serde_json-1.0.150/src/de.rs`), [], 'red'],
    ['Linux CI home registry path', wasm(`/home/runner/.cargo/registry/src/${IDX}/itoa-1.0.18/src/lib.rs`), [], 'red'],
    ['CI workspace absolute crate path', wasm('/home/runner/work/repo/repo/crates/pool-core/src/rack.rs'), [], 'red'],
    ['home path packed behind another string', wasm(`invalid value/Users/someone/.cargo/registry/src/${IDX}/serde-1.0/src/de.rs`), [], 'red'],
    ['temp-root OUT_DIR path', wasm('/tmp/build-7/target/wasm32-unknown-unknown/release/build/x/out/gen.rs'), [], 'red'],
    ['unknown absolute build root', wasm('/data/agent7/src/lib.rs'), [], 'red'],
    ['relative .cargo home path', wasm(`.cargo/registry/src/${IDX}/x-1.0/src/lib.rs`), [], 'red'],
    ['Windows user path', wasm('C:\\Users\\someone\\.cargo\\registry\\src\\x.rs'), [], 'red'],
    ['fake rustc prefix', wasm('/rustc/notahash/library/core/src/fmt.rs'), [], 'red'],
    ['remap token without the registry dir', wasm('/cargo/serde_json-1.0.150/src/de.rs'), [], 'red'],
    ['--forbid account name as a word', wasm('built by accountname at night'), ['accountname'], 'red'],
    ['--forbid checkout path at a boundary', wasm('panicked at /srv2/ob/clone-b/crates/x.rs'), ['/srv2/ob/clone-b'], 'red'],
    ['--forbid checkout root inside a relative path stays green', wasm('crates/pool-core/src/rack.rs'), ['/src'], 'green'],
    ['--forbid account name inside a longer word stays green', wasm('the rebuilder ran'), ['builder'], 'green'],
    ['rustc std path', wasm(`/rustc/${H40}/library/core/src/fmt/mod.rs`), [], 'green'],
    ['rust std deps path', wasm('/rust/deps/dlmalloc-0.2.13/src/dlmalloc.rs'), [], 'green'],
    ['remapped crates.io path', wasm(`/cargo/registry/src/${IDX}/serde_json-1.0.150/src/de.rs`), [], 'green'],
    ['workspace-relative crate path', wasm('crates/pool-core/src/rack.rs'), [], 'green'],
    ['unit and citation text', wasm('v0 in m/s, omega rad/s; TP B.3 / TP A-14; openbilliards/dossier-rasson-9ft/ cited'), [], 'green'],
    ['catalog fraction text', wasm('shelves 1 3/4"/3/16"; nose 1.5"/3/16" are WPA assumptions'), [], 'green'],
    ['mangled symbol text', wasm('/pool_core[5fbefd5e2d126a21]::rack::snooker_rack', '/<std[3708e917d4c18a63]::io::error::Error>::_new'), [], 'green'],
    ['--forbid absent', wasm('crates/pool-core/src/rack.rs'), ['accountname'], 'green'],
    ['DWARF custom section', Buffer.concat([wasm('crates/pool-core/src/rack.rs'), section('.debug_info', Buffer.from('x'))]), [], 'red'],
    ['sourceMappingURL custom section', Buffer.concat([wasm('x'), section('sourceMappingURL', Buffer.from('http://x/a.map'))]), [], 'red'],
    ['truncated module', HEADER.subarray(0, 6), [], 'red'],
    ['the three shipped custom sections', Buffer.concat([wasm('x'), section('producers', Buffer.from([0])), section('target_features', Buffer.from([0]))]), [], 'green'],
  ];
  let bad = 0;
  const say = (ok, name, why) => { if (!ok) bad++; console.log(`${ok ? 'ok ' : 'BAD'} ${name}${why ? ` — ${why}` : ''}`); };
  for (const [name, bytes, forbid, want] of arms) {
    const n = scanBytes(bytes, forbid).length;
    say((n > 0) === (want === 'red'), name, `want ${want}, ${n} finding(s)`);
  }

  // Scope arms on an in-memory tree.
  const shipped = wasm(`/rustc/${H40}/library/core/src/fmt.rs`);
  const [a0, a1] = ARCHIVED;
  const archiveBytes = new Map(ARCHIVED.map(([rel]) => [rel,
    existsSync(path.join(ROOT, rel)) ? readFileSync(path.join(ROOT, rel)) : Buffer.alloc(0)]));
  const tree = (extra = {}, drop = []) => {
    const m = new Map([['web/dist/pool-wasm/pool_wasm_bg.wasm', shipped], ...archiveBytes, ...Object.entries(extra)]);
    for (const d of drop) m.delete(d);
    return trackedScope(() => [...m.keys()], (rel) => m.get(rel));
  };
  const base = tree();
  say(base.scope.length === 0 && base.files.length === 1 && base.archivedCount === ARCHIVED.length,
    'scope: the declared archives are exempt by blob', JSON.stringify(base.scope));
  say(tree({ 'web/tools/fixtures/new-wasm/pool_wasm_bg.wasm': shipped }).files.length === 2,
    'scope: an undeclared tracked wasm is checked like a shipped one');
  say(tree({ [a0[0]]: Buffer.concat([archiveBytes.get(a0[0]), Buffer.from([0])]) }).scope.length === 1,
    'scope: a changed archive is red');
  say(tree({}, [a1[0]]).scope.length === 1, 'scope: a declared archive that is gone is red (stale)');

  // The real planted red: the archived kernels are builds without the remap.
  for (const [rel] of ARCHIVED) {
    const bytes = archiveBytes.get(rel);
    const n = bytes.length ? scanBytes(bytes).filter((f) => f.rule === 'DENY').length : 0;
    say(n > 0, `real non-remapped build ${rel} is red`, `${n} DENY finding(s)`);
  }
  console.log(bad ? `check-wasm-build-paths --selftest: ${bad} FAILURE(S)` : `check-wasm-build-paths --selftest: OK (${arms.length + 4 + ARCHIVED.length} arms)`);
  return bad ? 1 : 0;
}

// realpath on both sides: node resolves import.meta.url through symlinks (/tmp -> /private/tmp)
// while argv[1] keeps the caller's spelling, and a guard that compared them raw skipped the
// whole gate with exit 0
const realOrSelf = (p) => { try { return realpathSync(p); } catch { return path.resolve(p); } };
if (process.argv[1] && realOrSelf(process.argv[1]) === realOrSelf(fileURLToPath(import.meta.url))) {
  const argv = process.argv.slice(2);
  // exitCode, not exit(): a pending stdout write to a pipe must not be cut off
  process.exitCode = argv.includes('--selftest') ? selftest() : run(argv);
}
