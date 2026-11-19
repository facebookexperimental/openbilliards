// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-runner-job-cleanup.mjs — GH-1082 layer 2: the runner's job-completed cleanup
// (runner-job-cleanup.mjs, run by scripts/runner-job-completed.sh) ends exactly what a job left behind.
// Plain node, no browser. Every process here is started by this probe and stopped by its recorded pid
// (start time checked). The stand-in work directory is a fresh temp dir no other process uses.
//
//   R0 setup: an orphaned tree (root reparented to pid 1, cwd inside the stand-in work dir) with a child
//      and a child that ignores SIGTERM; a control orphan whose cwd is OUTSIDE the work dir; and a
//      process inside the work dir whose parent is alive (this probe), so it is not an orphan
//   R1 --dry-run names the orphaned tree, ends nothing, and names neither control
//   R1b the same dry run under LC_ALL=zh_CN.UTF-8 and fr_FR.UTF-8 still names the tree (ps localizes
//      lstart; the cleanup reads ps in the C locale)
//   R2 with no work directory configured: a WARNING line, exit 0, nothing ended
//   R3 the run ends the root, its child and (by SIGKILL after the grace) its SIGTERM-ignoring child and
//      its child that EXECs on SIGTERM (same pid and start time, a new command); exit 0; the control
//      orphan and the non-orphan are still alive
//   R4 the record (OB_RUNNER_CLEANUP_LOG) holds one JSON line naming exactly the four ended pids
//   R5 scripts/runner-job-completed.sh runs the same cleanup and exits 0 (nothing left to end)
//   R6 the construction behind R3: the exec'ing stand-in keeps its pid and start time and changes its
//      command on SIGTERM
//   R7 a work directory with a non-ASCII name (…/_wörk-é): the dry run names its orphaned tree under
//      a C-locale caller and a UTF-8 one (lsof runs in UTF-8 either way), and a C-locale run ends it
//   R8 a sibling whose NAME spells an escape is never selected: an orphan in …/_work\x2frepo (lsof
//      prints …/_work\\x2frepo, which a \xNN decoder read as …/_work\/repo) for (a) the work dir
//      …/_work and (b) a backslash-named work dir …/_work\, and an orphan in (b)'s own child
//      …/_work\/repo (a cwd with a backslash is never judged, even one truly inside). Each cwd is
//      logged as "not judged"; nothing is ended
//   R9 a work directory with a supplementary character (…/_work-😀): its orphaned tree is selected
//   R10 a cwd that lsof prints escaped (a stand-in lsof forced into C, on a …/_wérk-c work dir) is
//      logged as not judged and never ended
//   R11 a work dir stored in NFD and named in NFC (lsof prints the stored NFD bytes; the work dir keeps
//      the spelling it was given): its orphaned tree is selected under a C-locale and a UTF-8 caller
//   R12, R13 a work dir whose name is exactly how lsof prints a sibling's cwd, so a plain string compare
//      would call the sibling inside: R12 '_w\t' (a backslash) and the sibling '_w' + TAB; R13 '_w^A' (a
//      caret) and the sibling '_w' + 0x01
//   R14 a work dir whose name holds U+FFFD and an orphan in its child
//   In R12-R14 each cwd is logged as not judged and nothing is ended
//
//   node web/tools/test-runner-job-cleanup.mjs      # exit 0/1; last line PASS (n) / FAIL (k of n)
//   OB_RUNNER_CLEANUP_PROBE=<copy>/web/tools/runner-job-cleanup.mjs node ...   # judge a plant copy
//
// macOS only: under a subreaper (ubuntu-latest) an orphan's parent pid is not 1.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFile, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SUBJECT = path.resolve(process.env.OB_RUNNER_CLEANUP_PROBE || path.join(HERE, 'runner-job-cleanup.mjs'));
const HOOK = path.resolve(HERE, '..', '..', 'scripts', 'runner-job-completed.sh');
const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'ob-runner-cleanup-'));
const WORK = path.join(stage, '_work'); const JOB = path.join(WORK, 'repo', 'repo'); const OUTSIDE = path.join(stage, 'outside');
for (const d of [JOB, OUTSIDE]) fs.mkdirSync(d, { recursive: true });
const REC = path.join(stage, 'record.jsonl');
// a child that EXECs on SIGTERM: same pid, same start time, a new command (an exec'ing wrapper's shape)
const EXECD = path.join(stage, 'execd.sh');
fs.writeFileSync(EXECD, `#!/bin/bash\ntrap 'exec ${process.execPath} -e "setInterval(() => {}, 1000)" ob-execd' TERM\nwhile :; do sleep 0.2; done\n`, { mode: 0o755 });

const rows = [];
const row = (id, ok, desc, detail = '') => {
  rows.push({ id, ok: !!ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id} — ${desc}${ok ? '' : `: ${String(detail).slice(0, 700)}`}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (pred, ms, step = 100) => { for (const end = Date.now() + ms; Date.now() < end;) { if (await pred()) return true; await sleep(step); } return !!(await pred()); };
const lstartOf = (pid) => { try { return execFileSync('ps', ['-o', 'lstart=', '-p', String(pid)], { encoding: 'utf8' }).trim(); } catch { return ''; } };
const ppidOf = (pid) => { try { return Number(execFileSync('ps', ['-o', 'ppid=', '-p', String(pid)], { encoding: 'utf8' }).trim()); } catch { return NaN; } };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const recorded = new Map(); // pid -> start time
const record = (pid) => { if (pid && !recorded.has(pid)) recorded.set(pid, lstartOf(pid)); };
const cleanup = () => {
  for (const [pid, ls] of recorded) { if (ls && lstartOf(pid) === ls) { try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ } } }
  try { fs.rmSync(stage, { recursive: true, force: true }); } catch { /* temp */ }
};
setTimeout(() => { console.log('FAIL watchdog — the probe exceeded 120 s'); cleanup(); console.log('RUNNER-CLEANUP SELFTEST FAIL (watchdog)'); process.exit(1); }, 120000).unref();

/** an orphan: a launcher starts `root` detached in `cwd` and exits, so root's parent becomes pid 1. root
 * forks a child, a SIGTERM-ignoring child and a child that execs on SIGTERM, and writes the pids to `out` */
const orphan = async (cwd, tag) => {
  const out = path.join(stage, `pids-${tag}.json`);
  const rootSrc = `const { spawn } = require('child_process'); const fs = require('fs');
const c = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
const c2 = spawn(process.execPath, ['-e', "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"], { stdio: 'ignore' });
const c3 = spawn('/bin/bash', [${JSON.stringify(EXECD)}], { stdio: 'ignore' });
fs.writeFileSync(${JSON.stringify(out)}, JSON.stringify({ root: process.pid, c: c.pid, c2: c2.pid, c3: c3.pid }));
setInterval(() => {}, 1000);`;
  const launcherSrc = `const { spawn } = require('child_process');
const r = spawn(process.execPath, ['-e', ${JSON.stringify(rootSrc)}], { cwd: ${JSON.stringify(cwd)}, detached: true, stdio: 'ignore' });
r.unref(); console.log(r.pid);`;
  const launcher = spawn(process.execPath, ['-e', launcherSrc], { stdio: ['ignore', 'pipe', 'ignore'] });
  let txt = ''; launcher.stdout.on('data', (d) => { txt += d; });
  await new Promise((r) => launcher.once('close', r));
  const rootPid = Number(txt.trim()); record(rootPid);
  let pids = null;
  await until(() => { try { pids = JSON.parse(fs.readFileSync(out, 'utf8')); return true; } catch { return false; } }, 10000);
  if (pids) { record(pids.c); record(pids.c2); record(pids.c3); }
  const orphaned = await until(() => ppidOf(rootPid) === 1, 10000);
  return { ...(pids ?? { root: rootPid }), orphaned };
};
const runCleanup = (env, args = [], cmd = [process.execPath, SUBJECT]) => new Promise((resolve) => {
  const e = { ...process.env, ...env };
  for (const k of Object.keys(env)) if (env[k] === undefined) delete e[k];
  execFile(cmd[0], [...cmd.slice(1), ...args], { env: e, encoding: 'utf8', timeout: 60000 }, (err, stdout, stderr) => {
    resolve({ code: err ? (typeof err.code === 'number' ? err.code : null) : 0, out: `${stdout}\n${stderr}` });
  });
});

try {
  const t = await orphan(JOB, 'tree');
  const x = await orphan(OUTSIDE, 'control');
  const y = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { cwd: JOB, stdio: 'ignore' }); record(y.pid);
  await sleep(300);
  const setup = t.orphaned && x.orphaned && t.c && t.c2 && t.c3 && [t.root, t.c, t.c2, t.c3, x.root, y.pid].every(alive) && ppidOf(y.pid) === process.pid;
  row('R0', setup, 'setup: an orphaned tree inside the stand-in work dir, an orphan outside it, and a non-orphan inside it',
    JSON.stringify({ t, x, y: y.pid, ppidY: ppidOf(y.pid) }));
  if (setup) {
    const env = { OB_RUNNER_WORK_DIR: WORK, OB_RUNNER_CLEANUP_LOG: REC, RUNNER_WORKSPACE: undefined };
    const dry = await runCleanup(env, ['--dry-run']);
    row('R1', dry.code === 0 && dry.out.includes(`would end the tree of pid ${t.root} (cwd ${fs.realpathSync(JOB)}`) && !dry.out.includes(`pid ${x.root}`)
      && !dry.out.includes(`pid ${y.pid}`) && [t.root, t.c, t.c2, x.root, y.pid].every(alive) && !fs.existsSync(REC),
    '--dry-run names the orphaned tree (cwd inside the work dir), ends nothing, names neither control', dry.out);
    const loc = [];
    for (const L of ['zh_CN.UTF-8', 'fr_FR.UTF-8']) loc.push([L, await runCleanup({ ...env, LC_ALL: L, LANG: L }, ['--dry-run'])]);
    row('R1b', loc.every(([, r]) => r.code === 0 && r.out.includes(`would end the tree of pid ${t.root} `)) && [t.root, t.c, t.c2, t.c3].every(alive),
      'the same dry run under LC_ALL=zh_CN.UTF-8 and fr_FR.UTF-8 still names the tree (ps is read in the C locale)',
      JSON.stringify(loc.map(([L, r]) => [L, r.code, r.out.slice(0, 200)])));
    const none = await runCleanup({ OB_RUNNER_WORK_DIR: undefined, RUNNER_WORKSPACE: undefined, OB_RUNNER_CLEANUP_LOG: REC });
    row('R2', none.code === 0 && /WARNING: no work directory/.test(none.out) && [t.root, t.c, t.c2].every(alive) && !fs.existsSync(REC),
      'with no work directory configured: a WARNING line, exit 0, nothing ended', none.out);
    const run = await runCleanup(env);
    const gone = await until(() => ![t.root, t.c, t.c2, t.c3].some(alive), 3000);
    row('R3', run.code === 0 && gone && alive(x.root) && alive(y.pid)
      && [t.root, t.c, t.c2, t.c3].every((p) => run.out.includes(`ended pid ${p}:`)),
    'the run ends the orphaned root, its child, its SIGTERM-ignoring child and its child that execs on SIGTERM (SIGKILL after the grace), exit 0; the outside orphan and the non-orphan live on',
    JSON.stringify({ code: run.code, root: alive(t.root), c: alive(t.c), c2: alive(t.c2), c3: alive(t.c3), control: alive(x.root), nonOrphan: alive(y.pid), out: run.out.slice(-600) }));
    let recs = [];
    try { recs = fs.readFileSync(REC, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { recs = []; }
    // the exec'ing child is a bash loop: its momentary `sleep 0.2` child is part of the tree and ends with it
    // (ps shows an exiting one as `(sleep)`)
    const endedRows = recs[0]?.ended ?? [];
    const four = [t.root, t.c, t.c2, t.c3];
    const extra = endedRows.filter((e) => !four.includes(e.pid));
    row('R4', recs.length === 1 && four.every((p) => endedRows.some((e) => e.pid === p)) && extra.every((e) => e.ppid === t.c3 && /(^|\/|\()sleep\b/.test(e.command))
      && recs[0].survivors.length === 0 && recs[0].workRoot === fs.realpathSync(WORK),
    'the record holds one JSON line naming the four ended pids (plus only the bash loop\'s momentary sleep), no survivor',
    JSON.stringify({ ended: endedRows.map((e) => [e.pid, e.ppid, e.command.slice(0, 40)]), survivors: recs[0]?.survivors }));
    const hook = await runCleanup(env, [], ['/bin/bash', HOOK]);
    row('R5', hook.code === 0 && /nothing to end under/.test(hook.out) && alive(x.root) && alive(y.pid),
      'scripts/runner-job-completed.sh runs the same cleanup, exits 0 and ends nothing more', hook.out);
  }
  // R6: the construction behind R3's exec'ing child, on a standalone instance
  {
    const cmdOf = (pid) => { try { return execFileSync('ps', ['-o', 'command=', '-p', String(pid)], { encoding: 'utf8' }).trim(); } catch { return ''; } };
    const e = spawn('/bin/bash', [EXECD], { stdio: 'ignore' }); record(e.pid);
    await sleep(400);
    const before = { cmd: cmdOf(e.pid), lstart: lstartOf(e.pid) };
    try { process.kill(e.pid, 'SIGTERM'); } catch { /* gone */ }
    const execd = await until(() => /ob-execd/.test(cmdOf(e.pid)), 3000);
    const after = { cmd: cmdOf(e.pid), lstart: lstartOf(e.pid) };
    row('R6', /execd\.sh/.test(before.cmd) && execd && after.lstart && after.lstart === before.lstart && alive(e.pid),
      'the exec\'ing stand-in keeps its pid and start time and changes its command on SIGTERM (the case R3 must still end)',
      JSON.stringify({ before, after }));
    try { process.kill(e.pid, 'SIGKILL'); } catch { /* gone */ }
  }
  // R7: a non-ASCII work directory (review #1082 r2 P2: lsof under C printed it as \xNN escapes)
  {
    const WORK2 = path.join(stage, '_wörk-é'); const JOB2 = path.join(WORK2, 'repo', 'repo');
    fs.mkdirSync(JOB2, { recursive: true });
    const REC2 = path.join(stage, 'record-2.jsonl');
    const u = await orphan(JOB2, 'utf8');
    const env2 = { OB_RUNNER_WORK_DIR: WORK2, OB_RUNNER_CLEANUP_LOG: REC2, RUNNER_WORKSPACE: undefined };
    const dries = [];
    for (const L of ['C', 'en_US.UTF-8']) dries.push([L, await runCleanup({ ...env2, LC_ALL: L, LANG: L }, ['--dry-run'])]);
    const run2 = await runCleanup({ ...env2, LC_ALL: 'C', LANG: 'C' });
    const gone2 = await until(() => ![u.root, u.c, u.c2, u.c3].some(alive), 3000);
    row('R7', u.orphaned && dries.every(([, r]) => r.code === 0 && r.out.includes(`would end the tree of pid ${u.root} `)) && run2.code === 0 && gone2,
      'a work directory with a non-ASCII name: the dry run names its orphaned tree under a C-locale and a UTF-8 caller, and a C-locale run ends it',
      JSON.stringify({ orphaned: u.orphaned, dries: dries.map(([L, r]) => [L, r.out.slice(0, 160)]), run: run2.out.slice(0, 200), gone: gone2 }));
  }
  // R8: a name that spells an escape (review #1082 r3 P2) — never selected, whatever lsof prints
  {
    // its own directory: an earlier row's survivor in the shared …/_work must not reach this row's run
    const S8 = path.join(stage, 'r8');
    const SIB = path.join(S8, '_work\\x2frepo');               // a literal backslash, x, 2, f
    const ROOT_A = path.join(S8, '_work'); const ROOT_B = path.join(S8, '_work\\');
    for (const d of [SIB, ROOT_A, ROOT_B]) fs.mkdirSync(d, { recursive: true });
    const sib = await orphan(SIB, 'sibling');
    const INB = path.join(ROOT_B, 'repo'); fs.mkdirSync(INB);
    const inb = await orphan(INB, 'backslash-root');
    const REC3 = path.join(stage, 'record-3.jsonl');
    const a = await runCleanup({ OB_RUNNER_WORK_DIR: ROOT_A, OB_RUNNER_CLEANUP_LOG: REC3, RUNNER_WORKSPACE: undefined }, ['--dry-run']);
    const b = await runCleanup({ OB_RUNNER_WORK_DIR: ROOT_B, OB_RUNNER_CLEANUP_LOG: REC3, RUNNER_WORKSPACE: undefined }, ['--dry-run']);
    const ran = await runCleanup({ OB_RUNNER_WORK_DIR: ROOT_A, OB_RUNNER_CLEANUP_LOG: REC3, RUNNER_WORKSPACE: undefined });
    const notSel = (r) => r.code === 0 && ![sib.root, inb.root].some((p) => r.out.includes(`tree of pid ${p} `));
    const judgedNot = (r, p) => r.out.includes(`not judged: pid ${p}'s cwd`);
    const all = [sib.root, sib.c, sib.c2, inb.root, inb.c, inb.c2];
    row('R8', sib.orphaned && inb.orphaned && notSel(a) && notSel(b) && notSel(ran) && judgedNot(a, sib.root) && judgedNot(b, sib.root) && judgedNot(b, inb.root)
      && all.every(alive) && !fs.existsSync(REC3),
      'an orphan in a sibling whose name spells an escape (…/_work\\x2frepo) is never selected — neither for the work dir …/_work nor for a backslash-named …/_work\\ — nor is one in …/_work\\/repo; each is logged as not judged; nothing is ended',
      JSON.stringify({ orphaned: [sib.orphaned, inb.orphaned], a: a.out.slice(0, 200), b: b.out.split('\n').filter((l) => /tree of pid|not judged/.test(l)).map((l) => l.slice(0, 120)), run: ran.out.slice(0, 120), alive: all.map(alive) }));
  }
  // R9: a supplementary character in the work dir (review #1082 r3 P2: UTF-16 halves never matched)
  {
    const WORK4 = path.join(stage, '_work-😀'); const JOB4 = path.join(WORK4, 'repo', 'repo');
    fs.mkdirSync(JOB4, { recursive: true });
    const e4 = await orphan(JOB4, 'emoji');
    const dries = [];
    for (const L of ['C', 'en_US.UTF-8']) dries.push([L, await runCleanup({ OB_RUNNER_WORK_DIR: WORK4, OB_RUNNER_CLEANUP_LOG: path.join(stage, 'record-4.jsonl'), RUNNER_WORKSPACE: undefined, LC_ALL: L, LANG: L }, ['--dry-run'])]);
    row('R9', e4.orphaned && dries.every(([, r]) => r.code === 0 && r.out.includes(`would end the tree of pid ${e4.root} `)),
      'a work directory with a supplementary character (…/_work-😀): its orphaned tree is selected under a C-locale and a UTF-8 caller',
      JSON.stringify({ orphaned: e4.orphaned, dries: dries.map(([L, r]) => [L, r.out.slice(0, 200)]) }));
  }
  // R10: a cwd lsof prints escaped is never judged (a stand-in lsof forced into C prints é as \xc3\xa9)
  {
    const realLsof = (process.env.PATH ?? '').split(':').map((d) => path.join(d, 'lsof'))
      .find((f) => { try { fs.accessSync(f, fs.constants.X_OK); return true; } catch { return false; } }) ?? '/usr/sbin/lsof';
    const BIN = path.join(stage, 'bin-c-lsof'); fs.mkdirSync(BIN);
    fs.writeFileSync(path.join(BIN, 'lsof'), `#!/bin/sh\nLC_ALL=C LANG=C exec ${realLsof} "$@"\n`, { mode: 0o755 });
    const WORK5 = path.join(stage, '_wérk-c'); const JOB5 = path.join(WORK5, 'repo', 'repo');
    fs.mkdirSync(JOB5, { recursive: true });
    const e5 = await orphan(JOB5, 'escaped');
    const REC5 = path.join(stage, 'record-5.jsonl');
    const env5 = { OB_RUNNER_WORK_DIR: WORK5, OB_RUNNER_CLEANUP_LOG: REC5, RUNNER_WORKSPACE: undefined, PATH: `${BIN}:${process.env.PATH}` };
    const dry5 = await runCleanup(env5, ['--dry-run']);
    const run5 = await runCleanup(env5);
    await sleep(300);
    row('R10', e5.orphaned && dry5.code === 0 && run5.code === 0 && /xc3/.test((dry5.out.split('\n').find((l) => l.includes(`not judged: pid ${e5.root}'s cwd`)) ?? ''))
      && !dry5.out.includes(`tree of pid ${e5.root} `) && !run5.out.includes(`ended pid ${e5.root}:`) && [e5.root, e5.c, e5.c2].every(alive) && !fs.existsSync(REC5),
    'a cwd that lsof prints escaped (\\xc3\\xa9, a stand-in lsof in C) is logged as not judged and never ended',
    JSON.stringify({ orphaned: e5.orphaned, line: dry5.out.split('\n').find((l) => l.includes(`pid ${e5.root}`)) ?? null, alive: [e5.root, e5.c, e5.c2].map(alive) }));
  }
  // R11: the comparison is in NFC (a work dir created as 'e' + U+0301 is stored and printed in NFD)
  {
    const NAME6 = '_we\u0301rk-nfd'; const WORK6 = path.join(stage, NAME6); const JOB6 = path.join(WORK6, 'repo', 'repo');
    fs.mkdirSync(JOB6, { recursive: true });
    const e6 = await orphan(JOB6, 'nfd');
    const built = fs.readdirSync(stage).includes(NAME6) && WORK6.normalize('NFC') !== WORK6;
    const dries = [];
    for (const L of ['C', 'en_US.UTF-8']) dries.push([L, await runCleanup({ OB_RUNNER_WORK_DIR: WORK6.normalize('NFC'), OB_RUNNER_CLEANUP_LOG: path.join(stage, 'record-6.jsonl'), RUNNER_WORKSPACE: undefined, LC_ALL: L, LANG: L }, ['--dry-run'])]);
    row('R11', e6.orphaned && built && dries.every(([, r]) => r.code === 0 && r.out.includes(`would end the tree of pid ${e6.root} `)),
      'a work dir stored in NFD and named in NFC: its orphaned tree is selected under a C-locale and a UTF-8 caller',
      JSON.stringify({ orphaned: e6.orphaned, built, dries: dries.map(([L, r]) => [L, r.out.slice(0, 200)]) }));
  }
  // R12-R14: lsof's escapes collide with names (review #1082 r3: a backslash-named work dir and its sibling)
  for (const [id, tag, root, cwd, what] of [
    ['R12', 'tab', '_w\\t', '_w\t', "a work dir named '_w\\t' (a backslash) and an orphan in the sibling '_w' + TAB, which lsof prints as '_w\\t'"],
    ['R13', 'caret', '_w^A', '_w\x01', "a work dir named '_w^A' (a caret) and an orphan in the sibling '_w' + 0x01, which lsof prints as '_w^A'"],
    ['R14', 'fffd', '_w�', '_w�/repo', "a work dir whose name holds U+FFFD and an orphan in its child"],
  ]) {
    const S = path.join(stage, id.toLowerCase()); const ROOT = path.join(S, root); const CWD = path.join(S, cwd);
    for (const d of [ROOT, CWD]) fs.mkdirSync(d, { recursive: true });
    const o = await orphan(CWD, tag);
    const REC = path.join(stage, `record-${tag}.jsonl`); const env = { OB_RUNNER_WORK_DIR: ROOT, OB_RUNNER_CLEANUP_LOG: REC, RUNNER_WORKSPACE: undefined };
    const dry = await runCleanup(env, ['--dry-run']); const ran = await runCleanup(env);
    await sleep(300);
    const line = dry.out.split('\n').find((l) => l.includes(`not judged: pid ${o.root}'s cwd`)) ?? '';
    // the construction: lsof printed the orphan's cwd as the work dir's own name (R12, R13) or a path under it (R14)
    const printed = id === 'R14' ? line.endsWith(`: ${JSON.stringify(path.join(fs.realpathSync(ROOT), 'repo'))}`) : line.endsWith(`: ${JSON.stringify(fs.realpathSync(ROOT))}`);
    row(id, o.orphaned && printed && dry.code === 0 && ran.code === 0 && !dry.out.includes(`tree of pid ${o.root} `) && !ran.out.includes(`ended pid ${o.root}:`)
      && [o.root, o.c, o.c2].every(alive) && !fs.existsSync(REC),
      `${what}: the cwd is logged as not judged and nothing is ended`,
      JSON.stringify({ orphaned: o.orphaned, printed, line: line.slice(-120), dry: dry.out.split('\n').filter((l) => l.includes(`pid ${o.root}`)).map((l) => l.slice(0, 160)), run: ran.out.slice(0, 160), alive: [o.root, o.c, o.c2].map(alive) }));
  }
} catch (e) {
  row('X', false, 'probe exception', e.stack ?? e.message);
} finally {
  cleanup();
}
const bad = rows.filter((r) => !r.ok);
console.log(bad.length ? `RUNNER-CLEANUP SELFTEST FAIL (${bad.length} of ${rows.length}: ${bad.map((r) => r.id).join(', ')})` : `RUNNER-CLEANUP SELFTEST PASS (${rows.length})`);
process.exit(bad.length ? 1 : 0);
