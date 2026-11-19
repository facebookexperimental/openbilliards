#!/usr/bin/env node

// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-competitor-brands-matrix.mjs — the competitor-brand gate (tools/check-competitor-brands.mjs)
// must be right on every tree it will meet, not only on the one it was written on: three review
// rounds found arms that assumed their tree. Every cell below requires exit 0.
//
//   (a) the private tree: this rev with the repo fixture — the normal scan and the full --selftest
//   (b) the modelled public snapshot (built through scripts/opensource/sync-public-snapshot: manifest
//       exclusions, mechanical rewrites, the web/dist rebuild model) with the EXPORTED fixture —
//       the normal scan and the full --selftest, exactly as the public checkout's own CI runs them
//   (c) (b) after a permitted public scrub (one fewer occurrence of each pinned token where possible)
//       — the normal scan and the full --selftest
//   (d) the round trip: drop one pin whose file survives the export, --emit-exceptions, fill its
//       reason and until, the private scan, the export through sync.py, then the public scan over (b)
//
// Usage: node tools/test-competitor-brands-matrix.mjs [--rev <rev>] [--tool <gate script>] [--cells a,b,c,d]
//        node tools/test-competitor-brands-matrix.mjs --selftest   (the fail-closed argument arms)
//
// FAIL CLOSED (review r4): every bad argument, git error, missing input or empty selection exits 2
// with a named reason; a run in which no cell ran exits 1. The ONE skip (exit 0) needs positive
// evidence: the rev resolves to a tree AND its `git ls-tree` listing provably lacks the helper.
// --tool runs another copy of the gate (the planted reds: a copy with one fix reverted must fail
// its cell). Private tree only: the snapshot is built through scripts/opensource, which the public
// snapshot excludes — there the test prints a named SKIP and exits 0.

import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const die = (why) => { process.stdout.write(`competitor-brands matrix: could not run — ${why}\n`); process.exit(2); };
const argv = process.argv.slice(2);
const KNOWN = new Set(['--rev', '--tool', '--cells', '--selftest']);
const VALUED = new Set(['--rev', '--tool', '--cells']);
const opts = {};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (!KNOWN.has(a)) die(`unknown argument '${a}'`);
  if (VALUED.has(a)) {
    const v = argv[i + 1];
    if (v === undefined || v.startsWith('--')) die(`${a} needs a value`);
    opts[a] = v; i++;
  } else opts[a] = true;
}
const SELF = fileURLToPath(import.meta.url);
const HELPER = 'scripts/opensource/sync-public-snapshot/export_paths.py';
const FIXTURE = join(ROOT, 'tools/fixtures/competitor-brands.json');

if (opts['--selftest']) {
  // the fail-closed arms: each bad invocation must exit non-zero BEFORE any gate work; the skip
  // must show its positive evidence; a fixture with zero tokens must be refused by the gate
  const run = (args) => spawnSync('node', [SELF, ...args], { cwd: ROOT, encoding: 'utf8' });
  const gateRun = (args) => spawnSync('node', [join(ROOT, 'tools/check-competitor-brands.mjs'), ...args], { cwd: ROOT, encoding: 'utf8' });
  // a tree that provably lacks the helper, built from HEAD through a temporary index (history-free)
  const idx = join(tmpdir(), `ccb-matrix-self-index-${process.pid}`);
  const genv = { ...process.env, GIT_INDEX_FILE: idx };
  execFileSync('git', ['-C', ROOT, 'read-tree', 'HEAD'], { env: genv });
  execFileSync('git', ['-C', ROOT, 'update-index', '--force-remove', HELPER], { env: genv });
  const base = execFileSync('git', ['-C', ROOT, 'write-tree'], { env: genv, encoding: 'utf8' }).trim();
  rmSync(idx, { force: true });
  const empty = join(mkdtempSync(join(tmpdir(), 'ccb-matrix-self-')), 'empty-tokens.json');
  writeFileSync(empty, JSON.stringify({ ...JSON.parse(readFileSync(FIXTURE, 'utf8')), tokens: [] }));
  const arms = [
    ['an unresolvable --rev', () => run(['--rev', 'does-not-exist-review-probe']), (r) => r.status === 2],
    ['a --cells typo', () => run(['--cells', 'x']), (r) => r.status === 2],
    ['an empty --cells', () => run(['--cells', '']), (r) => r.status === 2],
    ['--cells mixing a known and an unknown cell', () => run(['--cells', 'a,x']), (r) => r.status === 2],
    ['--cells without a value', () => run(['--cells']), (r) => r.status === 2],
    ['an unknown argument', () => run(['--cell', 'a']), (r) => r.status === 2],
    ['a --tool that does not exist', () => run(['--tool', 'tools/no-such-gate.mjs', '--cells', 'a']), (r) => r.status === 2],
    ['the skip needs positive evidence: a resolvable rev whose tree lacks the helper skips (exit 0, named)', () => run(['--rev', base, '--cells', 'a']), (r) => r.status === 0 && /SKIP — the tree of .* has no /.test(r.stdout)],
    ['the gate refuses a fixture with zero tokens', () => gateRun(['--fixture', empty]), (r) => r.status === 2 && /no tokens/.test(r.stdout)],
  ];
  let bad = 0;
  for (const [name, go, ok] of arms) {
    const r = go();
    const good = ok(r);
    if (!good) bad++;
    process.stdout.write(`  ${good ? 'ok  ' : 'FAIL'} ${name}: exit ${r.status} — ${((r.stdout || '') + (r.stderr || '')).trim().split('\n').pop()?.slice(0, 150)}\n`);
  }
  rmSync(dirname(empty), { recursive: true, force: true });
  process.stdout.write(bad ? `competitor-brands matrix --selftest: ${bad} FAILURE(S)\n` : `competitor-brands matrix --selftest: OK (${arms.length} arms)\n`);
  process.exit(bad ? 1 : 0);
}

const REV = opts['--rev'] ?? 'HEAD';
const TOOL = opts['--tool'] ? resolve(ROOT, opts['--tool']) : join(ROOT, 'tools/check-competitor-brands.mjs');
if (!existsSync(TOOL)) die(`--tool ${opts['--tool']} does not exist`);
const sel = (opts['--cells'] ?? 'a,b,c,d').split(',').map((s) => s.trim());
const unknown = sel.filter((s) => !['a', 'b', 'c', 'd'].includes(s));
if (!sel.length || unknown.length) die(`--cells must be a non-empty subset of a,b,c,d (got '${opts['--cells']}'${unknown.length ? `; unknown ${unknown.map((s) => `'${s}'`).join(', ')}` : ''})`);
const CELLS = new Set(sel);

// the rev must resolve to a tree, and the helper's absence must be read from a tree listing that
// succeeded — a git error is never evidence of a public tree
let revTree;
try {
  revTree = execFileSync('git', ['-C', ROOT, 'rev-parse', '--verify', '--quiet', `${REV}^{tree}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
} catch { die(`rev ${REV} does not resolve to a tree`); }
let listing;
try {
  listing = execFileSync('git', ['-C', ROOT, 'ls-tree', revTree, '--', HELPER], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
} catch (e) { die(`git ls-tree ${revTree} failed: ${String(e.stderr || e.message).trim()}`); }
if (!listing) {
  process.stdout.write(`competitor-brands matrix: SKIP — the tree of ${REV} (${revTree.slice(0, 12)}) has no ${HELPER}: not the private tree (the public snapshot excludes scripts/opensource)\n`);
  process.exit(0);
}

const gate = (args) => {
  const r = spawnSync('node', [TOOL, ...args], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });
  return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
};
const last = (s) => s.trim().split('\n').pop() ?? '';
const cells = [];
const cell = (name, r) => {
  cells.push({ name, status: r.status, line: last(r.out).slice(0, 160) });
  process.stdout.write(`  ${r.status === 0 ? 'ok  ' : 'FAIL'} ${name}: exit ${r.status} — ${last(r.out).slice(0, 160)}\n`);
  return r;
};

const tmp = mkdtempSync(join(tmpdir(), 'ccb-matrix-'));
try {
  process.stdout.write(`COMPETITOR-BRANDS MATRIX (rev ${REV}, gate ${TOOL.replace(ROOT + '/', '')})\n`);
  // (a) the private tree
  if (CELLS.has('a')) {
    cell('(a) private scan', gate(['--rev', REV]));
    cell('(a) private --selftest', gate(['--rev', REV, '--selftest']));
  }

  // the modelled public snapshot + its permitted scrub
  const built = ['b', 'c', 'd'].some((k) => CELLS.has(k)) ? gate(['--rev', REV, '--build-snapshot', tmp]) : null;
  let snap = null;
  try { snap = built && JSON.parse(last(built.out)); } catch { /* reported below */ }
  if (!built) {
    // (a) only
  } else if (built.status !== 0 || !snap?.public) {
    cell('(b/c) build the modelled public snapshot', { status: built.status || 2, out: built.out });
  } else {
    process.stdout.write(`  snapshot: public ${snap.public.slice(0, 12)}, scrubbed ${snap.scrubbed.slice(0, 12)}; scrubs: ${snap.scrubs.join('; ')}\n`);
    // (b) the public snapshot, judged with the exported fixture
    if (CELLS.has('b')) {
      cell('(b) public scan', gate(['--rev', snap.public, '--fixture', snap.fixture]));
      cell('(b) public --selftest', gate(['--rev', snap.public, '--fixture', snap.fixture, '--selftest']));
    }
    // (c) after a permitted public scrub
    if (CELLS.has('c')) {
      cell('(c) scrubbed public scan', gate(['--rev', snap.scrubbed, '--fixture', snap.fixture]));
      cell('(c) scrubbed public --selftest', gate(['--rev', snap.scrubbed, '--fixture', snap.fixture, '--selftest']));
    }

    // (d) the round trip
    if (CELLS.has('d')) {
    const fx = JSON.parse(readFileSync(FIXTURE, 'utf8'));
    // the pin must SURVIVE the export (present in the public snapshot): a pin on an excluded file is
    // dropped before its counts are ever read, so it could not prove the exporter's requirements
    const inPublic = (q) => { try { execFileSync('git', ['-C', ROOT, 'cat-file', '-e', `${snap.public}:${q}`], { stdio: 'ignore' }); return true; } catch { return false; } };
    const pick = fx.exceptions.find((x) => x.lines?.length && !x.file.startsWith('web/dist/') && inPublic(x.file));
    const minus = { ...fx, exceptions: fx.exceptions.filter((x) => x !== pick) };
    const minusPath = join(tmp, 'minus.json');
    writeFileSync(minusPath, JSON.stringify(minus, null, 1) + '\n');
    const em = gate(['--rev', REV, '--fixture', minusPath, '--emit-exceptions']);
    let emitted = null;
    try { emitted = JSON.parse(em.out.slice(em.out.indexOf('['), em.out.lastIndexOf(']') + 1)); } catch { /* reported below */ }
    if (em.status !== 0 || !Array.isArray(emitted) || !emitted.some((x) => x.file === pick.file)) {
      cell(`(d) --emit-exceptions re-derives the dropped pin (${pick?.file})`, { status: em.status || 1, out: em.out });
    } else {
      const filled = emitted.map((x) => ({ ...x, reason: 'matrix round trip', until: 'matrix round trip' }));
      const roundPath = join(tmp, 'round.json');
      writeFileSync(roundPath, JSON.stringify({ ...minus, exceptions: [...minus.exceptions, ...filled] }, null, 1) + '\n');
      cell(`(d) private scan with the emitted pin (${pick.file})`, gate(['--rev', REV, '--fixture', roundPath]));
      const exp = spawnSync('python3', ['-I', '-c',
        'import sys; sys.path.insert(0, sys.argv[1]); import sync as S; '
        + "sys.stdout.write(S.export_text('tools/fixtures/competitor-brands.json', open(sys.argv[2], encoding='utf-8').read()))",
        join(ROOT, 'scripts/opensource/sync-public-snapshot'), roundPath], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 });
      const pubPath = join(tmp, 'round.public.json');
      if (exp.status === 0) writeFileSync(pubPath, exp.stdout);
      cell('(d) export through sync.py', { status: exp.status, out: exp.status === 0 ? 'exported' : (exp.stderr || exp.stdout) });
      if (exp.status === 0) cell('(d) public scan with the exported pin', gate(['--rev', snap.public, '--fixture', pubPath]));
    }
    }
  }
} catch (e) {
  rmSync(tmp, { recursive: true, force: true });
  die(`unexpected error: ${e.message}`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
const bad = cells.filter((c) => c.status !== 0);
if (!cells.length) {
  process.stdout.write('competitor-brands matrix: FAILED — no cell ran\n');
  process.exitCode = 1;
} else {
  process.stdout.write(bad.length ? `competitor-brands matrix: ${bad.length} of ${cells.length} cell(s) FAILED\n`
    : `competitor-brands matrix: OK (${cells.length} cells)\n`);
  process.exitCode = bad.length ? 1 : 0;
}
