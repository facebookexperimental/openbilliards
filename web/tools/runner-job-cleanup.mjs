// Copyright (c) Meta Platforms, Inc. and affiliates.

// runner-job-cleanup.mjs — GH-1082 layer 2: the self-hosted runner's job-completed cleanup.
// A cancelled or timed-out job can end only its step's shell; run-gate, the suite and its Chrome then
// live on with parent pid 1 and keep their port band claimed, and the next job in that band is refused
// (exit 75; PR #1069, runs 38134443857 → 38156092824). run-gate ends its own tree on a signal (GH-1082
// layer 1), but nothing ends a tree whose wrapper never got one. This script runs after every job
// (scripts/runner-job-completed.sh, wired as ACTIONS_RUNNER_HOOK_JOB_COMPLETED) and ends what the job
// left behind:
//   - a ROOT is a process with parent pid 1 whose working directory is inside the runner's work
//     directory (`_work`); nothing else is ever a root (a lane's processes never run there, the runner's
//     own processes run in its install directory, and this script and its ancestors are excluded);
//   - each root is ended with its descendants (one ps snapshot, pid + start time): SIGTERM, a 5 s
//     grace, then SIGKILL for what is left, each pid revalidated by its start time immediately
//     before its signal (a changed command is the same process: an exec'ing wrapper);
//   - every ended process is printed and appended as one JSON line to the record
//     (OB_RUNNER_CLEANUP_LOG, default ~/.openbilliards/runner-cleanup.jsonl).
// The single-slot runner runs one job at a time, so at job completion nothing under `_work` belongs to
// a live job. The hook never fails a job: a missing work directory or a ps/lsof failure is printed as a
// warning and the script exits 0.
//
//   node web/tools/runner-job-cleanup.mjs [--dry-run]
//   work directory: OB_RUNNER_WORK_DIR, else the parent of RUNNER_WORKSPACE (set by the runner)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const TAG = '[runner-cleanup]';
const GRACE_MS = 5000;
const REAP_MS = 3000;
const SYNC_TIMEOUT_MS = 20000;
// ps prints lstart in the caller's locale ('jeu. 15 oct. …', '四 10月/15 …'), which the row regex below
// cannot read — under zh_CN or fr_FR every row was dropped and the hook cleaned nothing (review #1082 P2).
// ps runs in the C locale. lsof runs in an explicit UTF-8 locale (the runner's own LANG): a valid UTF-8
// path then prints literally (under C it was hex-escaped, 'runner-\xc3\xa9', and a UTF-8 work directory
// never matched: review #1082 r2 P2). Nothing is decoded. lsof prints a backslash as '\\' and a control
// byte as '\t', '\x7f' or '^A' (0x01), so a name that spells an escape cannot be told from one
// ('_work\x2frepo' prints as '_work\\x2frepo', which a \xNN decoder read as '_work\/repo', inside a work
// directory named '_work\': review r3 P2; a sibling named '_w' + 0x01 prints as '_w^A', the name of a
// work directory '_w^A'). A cwd that carries a backslash, a caret or U+FFFD is NOT inside; it is logged
// and nothing is ended there.
const C_LOCALE = { ...process.env, LC_ALL: 'C', LANG: 'C' };
const UTF8_LOCALE = { ...process.env, LC_ALL: 'en_US.UTF-8', LANG: 'en_US.UTF-8' };
/** a cwd this script can judge: no backslash and no caret (lsof's escape characters, and a name that
 * spells an escape) and no U+FFFD (an undecodable byte) — anything else is never judged inside */
const plainPath = (p) => !/[\\^\uFFFD]/.test(p);

/** the runner's work directory, or null with the reason */
export function workRootFrom(env) {
  const explicit = env.OB_RUNNER_WORK_DIR;
  if (explicit) return { root: path.resolve(explicit), how: 'OB_RUNNER_WORK_DIR' };
  if (env.RUNNER_WORKSPACE) return { root: path.dirname(path.resolve(env.RUNNER_WORKSPACE)), how: 'the parent of RUNNER_WORKSPACE' };
  return { root: null, how: 'neither OB_RUNNER_WORK_DIR nor RUNNER_WORKSPACE is set' };
}

/** every process: { pid, ppid, pgid, stat, lstart, command } (null: no ps verdict) */
export function psRows() {
  let out = '';
  try {
    out = execFileSync('ps', ['-A', '-o', 'pid=,ppid=,pgid=,stat=,lstart=,command='], { encoding: 'utf8', timeout: SYNC_TIMEOUT_MS, maxBuffer: 64 << 20, env: C_LOCALE });
  } catch { return null; }
  return out.split('\n')
    .map((l) => /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(\w{3} \w{3} [ \d]\d \d\d:\d\d:\d\d \d{4})\s+(.*)$/.exec(l)).filter(Boolean)
    .map((m) => ({ pid: Number(m[1]), ppid: Number(m[2]), pgid: Number(m[3]), stat: m[4], lstart: m[5], command: m[6] }));
}
/** a row of the snapshot still present: the same pid and start time (pid + start time is the process's
 * identity; its command may change — an exec'ing wrapper keeps both, and a changed command is never read
 * as an exit: review #1082 P2), and not a zombie (a zombie holds no socket and cannot be signalled away —
 * its parent reaps it) */
const aliveIn = (now, r) => now.some((x) => x.pid === r.pid && x.lstart === r.lstart && !x.stat.startsWith('Z'));

/** working directories by pid (one lsof call; pids lsof cannot read are absent; null: no lsof verdict) */
export function cwdsOf(pids) {
  const cwds = new Map();
  if (!pids.length) return cwds;
  let out = '';
  try {
    out = execFileSync('lsof', ['-a', '-d', 'cwd', '-Fpn', '-p', pids.join(',')], { encoding: 'utf8', timeout: SYNC_TIMEOUT_MS, maxBuffer: 16 << 20, env: UTF8_LOCALE });
  } catch (e) {
    // lsof exits 1 when some pid is gone or unreadable; what it printed is still a verdict for the rest
    out = typeof e.stdout === 'string' ? e.stdout : '';
    if (!out) return e.status === 1 ? cwds : null;
  }
  let pid = null;
  for (const line of out.split('\n')) {
    if (line.startsWith('p')) pid = Number(line.slice(1));
    else if (line.startsWith('n') && pid !== null) cwds.set(pid, line.slice(1));
  }
  return cwds;
}

/** whole-string containment in NFC; a cwd or root that is not a plain path is never inside */
const inside = (dir, root) => {
  if (!plainPath(dir) || !plainPath(root)) return false;
  const d = dir.normalize('NFC'); const r = root.normalize('NFC');
  return d === r || d.startsWith(r.endsWith(path.sep) ? r : r + path.sep);
};

/** the roots and their trees: [{ root, tree: [rows…] }] — pure, for the probe */
export function planCleanup(rows, cwds, workRoot, selfPid) {
  const byPid = new Map(rows.map((r) => [r.pid, r]));
  const self = new Set();
  for (let p = selfPid; p && byPid.has(p) && !self.has(p); p = byPid.get(p).ppid) self.add(p);
  const kids = new Map();
  for (const r of rows) { if (!kids.has(r.ppid)) kids.set(r.ppid, []); kids.get(r.ppid).push(r); }
  const plans = [];
  for (const r of rows) {
    if (r.ppid !== 1 || self.has(r.pid) || r.stat.startsWith('Z')) continue;
    const cwd = cwds.get(r.pid);
    if (!cwd || !inside(cwd, workRoot)) continue;
    const tree = [r];
    for (const q = [r.pid]; q.length;) for (const k of kids.get(q.shift()) ?? []) if (!self.has(k.pid) && !k.stat.startsWith('Z')) { tree.push(k); q.push(k.pid); }
    plans.push({ root: r, cwd, tree });
  }
  return plans;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const head = (c) => c.replace(/\s+/g, ' ').slice(0, 160);

async function main() {
  const dry = process.argv.includes('--dry-run');
  const { root, how } = workRootFrom(process.env);
  if (!root) { console.log(`${TAG} WARNING: no work directory (${how}) — nothing was checked`); return; }
  // lsof reports canonical working directories (/private/var, not /var): compare canonical to canonical
  let workRoot = root;
  try { workRoot = fs.realpathSync(root); } catch { /* not there: nothing can run inside it */ }
  const rows = psRows();
  if (!rows) { console.log(`${TAG} WARNING: no ps verdict — nothing was checked under ${workRoot}`); return; }
  const orphans = rows.filter((r) => r.ppid === 1 && r.pid !== process.pid);
  const cwds = cwdsOf(orphans.map((r) => r.pid));
  if (!cwds) { console.log(`${TAG} WARNING: no lsof verdict — nothing was checked under ${workRoot}`); return; }
  for (const [pid, cwd] of cwds) {
    if (!plainPath(cwd)) console.log(`${TAG} not judged: pid ${pid}'s cwd is not a plain path (a backslash, a caret or an undecodable byte), so it is never treated as inside: ${JSON.stringify(cwd)}`);
  }
  const plans = planCleanup(rows, cwds, workRoot, process.pid);
  if (!plans.length) { console.log(`${TAG} nothing to end under ${workRoot} (${how}; ${orphans.length} parent-pid-1 processes checked)`); return; }
  const members = plans.flatMap((p) => p.tree);
  for (const p of plans) {
    console.log(`${TAG} ${dry ? 'would end' : 'ending'} the tree of pid ${p.root.pid} (cwd ${p.cwd}, ${p.tree.length} process(es)): ${head(p.root.command)}`);
  }
  if (dry) return;
  // one snapshot per round: a pid is signalled only while that snapshot shows the same start time (no
  // reused pid is ever hit); no ps verdict signals nothing and counts everything as left
  const signal = (sig) => { const now = psRows(); if (!now) return; for (const r of members) if (aliveIn(now, r)) { try { process.kill(r.pid, sig); } catch { /* raced its exit */ } } };
  const left = () => { const now = psRows(); return now ? members.filter((r) => aliveIn(now, r)) : members; };
  signal('SIGTERM');
  for (const until = Date.now() + GRACE_MS; left().length && Date.now() < until;) await sleep(200);
  if (left().length) { signal('SIGKILL'); for (const until = Date.now() + REAP_MS; left().length && Date.now() < until;) await sleep(200); }
  const survivors = left();
  const record = {
    at: new Date().toISOString(), workRoot, job: process.env.GITHUB_JOB ?? null, run: process.env.GITHUB_RUN_ID ?? null,
    ended: members.filter((r) => !survivors.includes(r)).map((r) => ({ pid: r.pid, ppid: r.ppid, lstart: r.lstart, command: head(r.command) })),
    survivors: survivors.map((r) => ({ pid: r.pid, command: head(r.command) })),
  };
  for (const r of record.ended) console.log(`${TAG} ended pid ${r.pid}: ${r.command}`);
  for (const r of record.survivors) console.log(`${TAG} WARNING: pid ${r.pid} survived SIGKILL: ${r.command}`);
  const log = process.env.OB_RUNNER_CLEANUP_LOG || path.join(os.homedir(), '.openbilliards', 'runner-cleanup.jsonl');
  try { fs.mkdirSync(path.dirname(log), { recursive: true }); fs.appendFileSync(log, JSON.stringify(record) + '\n'); } catch (e) { console.log(`${TAG} WARNING: the record was not written (${e.message})`); }
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  await main().catch((e) => console.log(`${TAG} WARNING: ${e.stack ?? e.message}`));
  process.exit(0);
}
