#!/usr/bin/env node

// Copyright (c) Meta Platforms, Inc. and affiliates.

// gen-rust-notices.mjs — the licence notices of the third-party Rust code compiled into the two
// canonical wasm binaries: the physics kernel (web/dist/pool-wasm/pool_wasm_bg.wasm) and the rules
// engine (web/dist/pool-rules/pool_rules_bg.wasm).
//
// MIT (and the MIT choice of every "MIT OR Apache-2.0" crate) requires the copyright and permission
// notice to ship with every copy of a binary, so LICENSE-rust-crates.txt carries each crate's own
// licence file verbatim, plus the Rust standard library's notice (core, alloc and compiler-builtins
// are linked into every wasm). The same file sits in web/vendor/ and next to each binary.
//
// A crate set is a binary's runtime closure: `cargo tree -p <crate> --target wasm32-unknown-unknown
// -e normal,no-proc-macro` (proc macros and build scripts run on the build host and never reach the
// binary), minus the workspace's own crates. Licence files come from each package's directory
// (`cargo metadata`); the output names no local path and sorts by byte order.
//
//   node tools/gen-rust-notices.mjs               write the three copies
//   node tools/gen-rust-notices.mjs --check       exit 1 when a copy differs (needs cargo; CI's Rust job)
//   node tools/gen-rust-notices.mjs --check-lock  node only: every listed crate@version is in Cargo.lock
//                                                 and the three copies are identical (CI's node job)
//   node tools/gen-rust-notices.mjs --print-wheel <target>
//                                                 print the notices file a pool_py wheel built for <target>
//                                                 must carry (pool-py's runtime closure for that target;
//                                                 `all` = every target), for its PEP 639 license-files
//   node tools/gen-rust-notices.mjs --check-wheel <wheel>...
//                                                 a pool_py wheel must carry, in *.dist-info/licenses/,
//                                                 a LICENSE-rust-crates.txt byte-identical to --print-wheel
//                                                 for its platform tag (an unknown tag: all targets) —
//                                                 every crate, version and licence text; needs cargo.
//                                                 export-sdk and flip-pypi refuse a wheel that fails it
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTS = ['web/vendor/LICENSE-rust-crates.txt', 'web/dist/pool-wasm/LICENSE-rust-crates.txt',
  'web/dist/pool-rules/LICENSE-rust-crates.txt'];
const BINARIES = [['pool-wasm', 'kernel'], ['pool-rules-wasm', 'rules']];
const WORKSPACE = new Set(['pool-core', 'pool-wasm', 'pool-rules', 'pool-rules-wasm', 'pool-py', 'pool-cli']);
const byBytes = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const argv = process.argv.slice(2);
const mode = argv[0] || '';

function fail(msg) { console.error(`gen-rust-notices: FAIL ${msg}`); process.exit(1); }

// the rows of a notices file's "Crates" block: [{ name, version }]
function crateRows(text) {
  const block = text.match(/\nCrates \(name, version[^\n]*\n((?:  \S[^\n]*\n)+)/);
  if (!block) return null;
  return block[1].split('\n').filter(Boolean).map((l) => { const [name, version] = l.trim().split(/\s+/); return { name, version }; });
}

const cargo = (args) => execFileSync('cargo', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
function closure(pkg, target) {
  const args = ['tree', '-p', pkg, '-e', 'normal,no-proc-macro', '--prefix', 'none', '--locked', '-f', '{p}'];
  if (target) args.push('--target', target);
  return new Set(cargo(args).split('\n').map((l) => l.replace(/ \(\*\)$/, '').trim()).filter(Boolean)
    .map((l) => { const [name, v] = l.split(' '); return `${name}@${v.replace(/^v/, '')}`; })
    .filter((k) => !WORKSPACE.has(k.split('@')[0])));
}

if (mode === '--check-lock') {
  const lock = fs.readFileSync(path.join(ROOT, 'Cargo.lock'), 'utf8');
  const have = new Set();
  for (const m of lock.matchAll(/\[\[package\]\]\nname = "([^"]+)"\nversion = "([^"]+)"/g)) have.add(`${m[1]}@${m[2]}`);
  const texts = OUTS.map((o) => fs.readFileSync(path.join(ROOT, o), 'utf8'));
  for (let i = 1; i < texts.length; i++) if (texts[i] !== texts[0]) fail(`${OUTS[i]} differs from ${OUTS[0]}`);
  const rows = crateRows(texts[0]);
  if (!rows || rows.length === 0) fail(`no "Crates" block in ${OUTS[0]}`);
  const missing = rows.filter((r) => !have.has(`${r.name}@${r.version}`)).map((r) => `${r.name}@${r.version}`);
  if (missing.length) fail(`listed crate(s) not in Cargo.lock (regenerate after a lock change): ${missing.join(', ')}`);
  console.log(`gen-rust-notices: --check-lock OK (${rows.length} crates in Cargo.lock; the ${OUTS.length} copies are identical)`);
  process.exit(0);
}

// the files that carry the notice a crate's licence asks to ship: the MIT text (or the crate's single
// combined licence file), plus the Unicode-3.0 text where it applies
function noticeFiles(p) {
  const dir = path.dirname(p.manifest_path);
  const has = (f) => fs.existsSync(path.join(dir, f));
  const files = [];
  if (has('LICENSE-MIT')) files.push('LICENSE-MIT');
  else if (has('LICENSE.txt')) files.push('LICENSE.txt');
  else if (has('LICENSE')) files.push('LICENSE');
  if (/Unicode/.test(p.license || '') && has('LICENSE-UNICODE')) files.push('LICENSE-UNICODE');
  if (files.length === 0) fail(`${p.name} ${p.version}: no licence file found`);
  return files.map((f) => [f, fs.readFileSync(path.join(dir, f), 'utf8').replace(/\r\n/g, '\n').replace(/\s+$/, '')]);
}

// The Rust standard library (core, alloc, compiler-builtins) is MIT OR Apache-2.0, used under MIT; its
// LICENSE-MIT carries no copyright line, and rust-src does not ship it, so the text is held here verbatim.
const STD_MIT = `Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the
Software without restriction, including without
limitation the rights to use, copy, modify, merge,
publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software
is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice
shall be included in all copies or substantial portions
of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF
ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED
TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT
SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.`;

const rule = '='.repeat(78);
// one notices file: the intro, the crate inventory, each crate's licence files verbatim, the std notice
function render({ intro, crateHeader, pkgs, labelOf, also, std }) {
  let out = `${intro}

Generated by tools/gen-rust-notices.mjs from Cargo.lock; do not edit by hand. Where a crate offers a
choice ("MIT OR Apache-2.0", "Unlicense OR MIT"), OpenBilliards uses it under the MIT licence.

${crateHeader}
`;
  for (const p of pkgs) out += `  ${p.name} ${p.version}  ${p.license}  ${labelOf ? `[${labelOf(p)}]  ` : ''}${p.repository || ''}\n`.replace(/ +\n$/, '\n');
  out += `\n${also}\n`;
  for (const p of pkgs) {
    out += `\n${rule}\n${p.name} ${p.version}`;
    // authors' names for attribution; their e-mail addresses are not part of any notice
    const authors = (p.authors || []).map((a) => a.replace(/\s*<[^>]*>/g, '').trim()).filter(Boolean);
    if (authors.length) out += ` — authors (Cargo.toml): ${authors.join(', ')}`;
    out += `\n${rule}\n`;
    for (const [f, text] of noticeFiles(p)) out += `\n--- ${f} ---\n\n${text}\n`;
  }
  out += `\n${rule}\n${std} — the Rust Project Developers\n${rule}\n\n--- LICENSE-MIT (https://github.com/rust-lang/rust) ---\n\n${STD_MIT}\n`;
  return out;
}

// cargo metadata for exactly the crates of a closure (name@version keys), byte-sorted
function packages(keys, target) {
  const args = ['metadata', '--format-version', '1', '--locked'];
  if (target !== 'all') args.push('--filter-platform', target);
  const pkgs = JSON.parse(cargo(args)).packages.filter((p) => keys.has(`${p.name}@${p.version}`))
    .sort((a, b) => byBytes(a.name, b.name) || byBytes(a.version, b.version));
  if (pkgs.length !== keys.size) fail(`cargo metadata found ${pkgs.length} of ${keys.size} crates`);
  return pkgs;
}

// the notices file of both wasm binaries (the three committed copies)
function wasmNotice() {
  const inBinary = new Map(); // name@version -> ['kernel', 'rules']
  for (const [pkg, label] of BINARIES) {
    for (const k of closure(pkg, 'wasm32-unknown-unknown')) inBinary.set(k, [...(inBinary.get(k) || []), label]);
  }
  const pkgs = packages(inBinary, 'wasm32-unknown-unknown');
  return { n: pkgs.length, out: render({
    intro: `Third-party Rust code compiled into the OpenBilliards wasm binaries — the physics kernel
(pool_wasm_bg.wasm) and the rules engine (pool_rules_bg.wasm) — with its licence notices.`,
    crateHeader: 'Crates (name, version, licence as declared, in which binary, repository):',
    pkgs, labelOf: (p) => inBinary.get(`${p.name}@${p.version}`).join(', '),
    also: `Also linked into both binaries: the Rust standard library (core, alloc, compiler-builtins),
MIT OR Apache-2.0, https://github.com/rust-lang/rust — notice at the end of this file.`,
    std: 'The Rust standard library (core, alloc, compiler-builtins)',
  }) };
}

// the notices file a pool_py wheel built for <target> must carry in .dist-info/licenses/
function wheelNotice(target) {
  const keys = new Set(closure('pool-py', target));
  const pkgs = packages(keys, target);
  return { n: pkgs.length, out: render({
    intro: `Third-party Rust code compiled into the pool_py extension module of the openbilliards wheel
(${target}), with its licence notices.`,
    crateHeader: 'Crates (name, version, licence as declared, repository):',
    pkgs, labelOf: null,
    also: `Also linked into the extension module: the Rust standard library (std, core, alloc),
MIT OR Apache-2.0, https://github.com/rust-lang/rust — notice at the end of this file.`,
    std: 'The Rust standard library (std, core, alloc)',
  }) };
}

// the wheel's platform tag -> the target its extension module was built for ('all' when unknown)
const TARGETS = [[/-macosx_[^-]*_arm64\.whl$/, 'aarch64-apple-darwin'], [/-macosx_[^-]*_x86_64\.whl$/, 'x86_64-apple-darwin'],
  [/-manylinux[^-]*_x86_64\.whl$/, 'x86_64-unknown-linux-gnu'], [/-manylinux[^-]*_aarch64\.whl$/, 'aarch64-unknown-linux-gnu'],
  [/-win_amd64\.whl$/, 'x86_64-pc-windows-msvc']];
const wheelTarget = (w) => (TARGETS.find(([re]) => re.test(w)) || [null, 'all'])[1];

if (mode === '--check-wheel') {
  const wheels = argv.slice(1);
  if (wheels.length === 0) fail('--check-wheel needs at least one .whl');
  const expected = new Map();
  let bad = 0;
  for (const w of wheels) {
    const target = wheelTarget(w);
    if (!expected.has(target)) expected.set(target, wheelNotice(target));
    const want = expected.get(target);
    let listing = '';
    try { listing = execFileSync('unzip', ['-Z1', w], { encoding: 'utf8', maxBuffer: 64 << 20 }); }
    catch { console.error(`gen-rust-notices: FAIL ${w}: not a readable wheel`); bad++; continue; }
    const entry = listing.split('\n').find((l) => /\.dist-info\/licenses\/(.*\/)?LICENSE-rust-crates\.txt$/.test(l));
    if (!entry) {
      console.error(`gen-rust-notices: FAIL ${path.basename(w)}: no .dist-info/licenses/LICENSE-rust-crates.txt — the wheel ships the ${want.n} crates of pool-py's closure (pyo3 and its dependencies) without their notices`);
      bad++; continue;
    }
    const got = execFileSync('unzip', ['-p', w, entry], { encoding: 'utf8', maxBuffer: 64 << 20 });
    if (got === want.out) {
      console.log(`gen-rust-notices: ${path.basename(w)} carries the generated notices for the ${want.n} crates of pool-py's closure (${target})`);
      continue;
    }
    bad++;
    // name the first defect: a missing crate, a wrong version, else the first differing line
    const rows = crateRows(got) || [];
    const wantRows = crateRows(want.out);
    const missing = wantRows.filter((r) => !rows.some((x) => x.name === r.name)).map((r) => r.name);
    const wrong = wantRows.filter((r) => rows.some((x) => x.name === r.name && x.version !== r.version)).map((r) => `${r.name} (want ${r.version})`);
    const gl = got.split('\n'), wl = want.out.split('\n');
    let i = 0;
    while (i < wl.length && gl[i] === wl[i]) i++;
    console.error(`gen-rust-notices: FAIL ${path.basename(w)}: ${missing.length ? `its crate notices omit ${missing.join(', ')}`
      : wrong.length ? `wrong crate versions: ${wrong.join(', ')}`
        : `its notices differ from the generated ones for ${target} from line ${i + 1} (node tools/gen-rust-notices.mjs --print-wheel ${target})`}`);
  }
  process.exit(bad ? 1 : 0);
}

if (mode === '--print-wheel') {
  if (argv.length !== 2) fail('--print-wheel needs exactly one target triple (or all)');
  process.stdout.write(wheelNotice(argv[1]).out);
  process.exit(0);
}

const { n, out } = wasmNotice();
if (mode === '--check') {
  const bad = OUTS.filter((o) => !fs.existsSync(path.join(ROOT, o)) || fs.readFileSync(path.join(ROOT, o), 'utf8') !== out);
  if (bad.length) fail(`stale: ${bad.join(', ')} (run node tools/gen-rust-notices.mjs)`);
  console.log(`gen-rust-notices: --check OK (${n} crates + the Rust standard library; ${OUTS.length} copies)`);
} else if (mode === '') {
  for (const o of OUTS) fs.writeFileSync(path.join(ROOT, o), out);
  console.log(`gen-rust-notices: wrote ${OUTS.join(', ')} (${n} crates + the Rust standard library)`);
} else {
  fail(`unknown argument ${mode} (use --check, --check-lock, --check-wheel <wheel>... or --print-wheel <target>)`);
}
