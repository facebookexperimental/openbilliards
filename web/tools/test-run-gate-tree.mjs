// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-run-gate-tree.mjs — GH-1082: an interrupted run-gate ends the suite's WHOLE
// tree and only then frees its band. A cancelled or timed-out CI job ended only the
// step's shell; run-gate, the suite and its Chrome lived on under launchd with the
// band claimed, and the next job in that band was refused (exit 75). Plain node, no
// browser. A fake suite stands in for a real one: it forks a grandchild that ignores
// SIGTERM and listens inside the band (a Chrome that will not quit), and a DETACHED
// grandchild in its own process group (the static server), then exits on SIGTERM
// without stopping either — after forking a teardown helper that listens in the band
// too. That helper starts after run-gate's descendant snapshot: only the suite's own
// process group (the detached spawn) still reaches it.
//
//   T1 SIGTERM to run-gate → run-gate exits 143 within the escalation window
//   T2 both grandchildren and the late teardown helper are gone (kill(pid, 0) → ESRCH)
//      and their three ports are free
//   T3 the band is free: a fresh claimPortBand over it succeeds
//   T4 the ledger entry is a red 143 that names the failed arm (failArms_v3) and counts
//      the suite's one PASS arm
//   T5 run-gate's log says the suite tree is gone before the band is released
//   D1 a SIGTERM delivered twice 50 ms apart (a group signal plus a wrapper's forward,
//      as the CI-window lease's `run` does) is ONE event: 2 s later the SIGTERM-ignoring
//      grandchild is still alive — the grace runs, no SIGKILL escalation
//   D2 then the grace ends the tree and run-gate exits 143
//   D3 a SIGTERM repeated 1.5 s later is a second event and still escalates: the
//      SIGTERM-ignoring grandchild is SIGKILLed within 2 s
//   P0 control: with the parent watch off, killing run-gate's parent leaves it running
//   P1 OB_RUN_GATE_PARENT_WATCH=1: killing run-gate's parent (a CI cancel that ends
//      only the step's shell) ends the suite tree, frees both ports and the band
//   L1 a 0-arm red names what failed in the ledger line and entry (failArms_v3); a
//      "(n failing assertions)" summary and a bare "FAILED" verdict name no arm
//   L2 an ok line that quotes "FAILED" counts as its arm and names no failure; the
//      ledger line prints the count and the failure (#1210)
//   L3 #1210's replay: a suite prints e2e-userboot's red log (verdict-grammar fixture L27:
//      ten OK arms, then node's uncaught CDP handshake crash) and exits 1; the ledger
//      line reads 'red (10 arms; FAIL: uncaught: Error: …)' and the entry names that one
//      crash, never the passing 'terminal BOOT FAILED honest: …' line
//   L4 control: a red with counted arms whose only failures are summaries names none, and
//      its ledger line keeps the count form alone
//   Z0 setup: a zombie in the suite's process group whose parent (outside the tree, alive)
//      never reaps it — the shape a subreaper or container leaves (python3 forks it)
//   Z1 SIGTERM: run-gate exits 143 and reports the tree gone; the zombie is no survivor
//   Z2 the band is free: the claim was never transferred to the zombie
//   GH-1140, run-gate's own deadline (--deadline <s> / OB_RUN_GATE_DEADLINE_S):
//   DL1 --deadline 5 over a suite that never finishes: run-gate prints the deadline line
//       5-10 s after the probe started it (the probe's clock, never the subject's) and
//       exits 124 on its own
//   DL2 the suite, its SIGTERM-ignoring grandchild, its DETACHED grandchild and the late
//       teardown helper are all gone; their ports are free
//   DL3 the band is free: a fresh claim over it succeeds
//   DL4 the ledger entry is red (never infra-storm), exit 124, deadline 5 and an elapsed
//       time of at least 5000 ms; the ledger line names the deadline next to the failed
//       arm; the tree was reported gone first
//   DLE OB_RUN_GATE_DEADLINE_S=4 alone: exit 124 at 4 s; the suite never sees the knob,
//       and the entry's envHash equals a run without it
//   DLF the flag wins over the env: OB_RUN_GATE_DEADLINE_S=1 with --deadline 5 fires at 5 s
//   DLU an empty OB_RUN_GATE_DEADLINE_S is unset: the suite runs to its own end, no deadline
//   DLR refused by name with exit 2, no suite started, no ledger entry: 0, -1, abc, 1.5x,
//       86401, 1e3, 0x10, 05, 3.0 and an empty value (flag), the one-token --deadline=3,
//       a repeated --deadline, and abc (env)
//   DLP a deadline that expires during run-gate's synchronous pre-spawn work (a `git` stand-in
//       that takes 2 s, --deadline 1, no band and no canary: no await before the spawn) is
//       caught right before the spawn: exit 75, the "before the suite started" line, no suite
//       started, no ledger entry
//   (DL rows give 4-5 s deadlines: the clock runs from run-gate's start, and its pre-spawn
//   work must stay well inside it on a loaded host; a deadline reached before the spawn
//   is named in the row's detail.)
//
//   node web/tools/test-run-gate-tree.mjs            # exit 0/1; last line PASS (n) / FAIL (k of n)
//   OB_RUN_GATE_TREE_PROBE=<copy>/web/tools/run-gate.mjs node ...   # judge a base / plant copy
//
// Staged under a private registry, marker dir, ledger and registry mutex port (the
// OB_PORT_BANDS_DIR / OB_SERVER_MARKER_DIR / OB_GATE_LEDGER_DIR / OB_BAND_MUTEX_PORT seams)
// with the CI env keys removed, on a
// 30-port window outside every declared band, verified bindable. Every process this
// probe starts is recorded with its start time and signalled by its recorded pid only,
// while that start time still matches.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RUN_GATE = path.resolve(process.env.OB_RUN_GATE_TREE_PROBE || path.join(HERE, 'run-gate.mjs'));
const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'ob-run-gate-tree-'));
const REG = path.join(stage, 'reg'); const MRK = path.join(stage, 'mrk'); const LEDGER = path.join(stage, 'ledger');
for (const d of [REG, MRK, LEDGER]) fs.mkdirSync(d);
for (const k of ['GITHUB_ACTIONS', 'OB_CI_BANDS', 'CI', 'OB_E2E_PORT', 'OB_E2E_CDP_PORT', 'OB_CDP_PORT', 'OB_PORT_BANDS', 'OB_RUN_GATE_PARENT_WATCH', 'OB_RUN_GATE_DEADLINE_S']) delete process.env[k];
Object.assign(process.env, { OB_PORT_BANDS_DIR: REG, OB_SERVER_MARKER_DIR: MRK, OB_GATE_LEDGER_DIR: LEDGER });
// GH-1119: the private registry's writers arbitrate on a PRIVATE mutex port, inherited by
// every run-gate this probe starts — never the host-wide :47997 (read at import)
const MUTEX = 38000 + ((process.pid + 450) % 900);
process.env.OB_BAND_MUTEX_PORT = String(MUTEX);
const cdp = await import(pathToFileURL(path.join(path.dirname(RUN_GATE), 'cdp.mjs')).href); // PORT_BANDS_DIR and the mutex port are read at import
const cib = await import(pathToFileURL(path.join(path.dirname(RUN_GATE), 'lib', 'ci-bands.mjs')).href);

const rows = [];
const row = (id, ok, desc, detail = '') => {
  rows.push({ id, ok: !!ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id} — ${desc}${ok ? '' : `: ${String(detail).slice(0, 700)}`}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const gone = (pid) => { try { process.kill(pid, 0); return false; } catch (e) { return e.code === 'ESRCH'; } };
const busy = (port) => new Promise((r) => { const c = net.connect({ port, host: '127.0.0.1' }); const done = (v) => { try { c.destroy(); } catch { /* closed */ } r(v); }; c.once('connect', () => done(true)); c.once('error', () => done(false)); c.setTimeout(400, () => done(false)); });
const bindable = (port) => new Promise((r) => { const s = net.createServer(); s.once('error', () => r(false)); s.listen(port, '127.0.0.1', () => s.close(() => r(true))); });
const until = async (pred, ms, step = 200) => { for (const end = Date.now() + ms; Date.now() < end;) { if (await pred()) return true; await sleep(step); } return !!(await pred()); };
const ledgerLast = () => { try { const l = fs.readFileSync(path.join(LEDGER, 'ledger.jsonl'), 'utf8').trim().split('\n'); return JSON.parse(l.at(-1)); } catch { return null; } };
const bandFree = async (lo) => { try { const c = await cdp.claimPortBand(lo, lo + 29); c.release(); return true; } catch (e) { return e.message.split('\n')[0]; } };

// a 30-port window outside the CI reserved range, the lane bands and the registry mutex,
// every port bindable on loopback
let B = null;
const lanes = (() => { try { return cib.declaredBands(cib.loadCiBands(), cib.loadLaneBands()); } catch { return null; } })();
for (let a = 0; a < 8 && B === null; a++) {
  const lo = 40000 + (((process.pid % 160) + a * 53) % 160) * 30; const hi = lo + 29;
  if (lo <= cdp.BAND_MUTEX_PORT && cdp.BAND_MUTEX_PORT <= hi) continue;
  if (lanes === null || lanes.some((d) => cib.bandsIntersect(d.range ?? d, { start: lo, end: hi }))) continue;
  let free = true;
  for (let p = lo; p <= hi && free; p++) free = await bindable(p);
  if (free) B = lo;
}

// the fake suite: one PASS arm, a SIGTERM-ignoring listener in its own group and a
// DETACHED listener in a group of its own; on SIGTERM it forks a listening teardown
// helper (into its own group) and exits 143 leaving all three
const SUITE = path.join(stage, 'fake-suite.mjs');
// the zombie maker (mode 'zombie'): H forks P and exits, so P is orphaned inside the suite's
// session; P takes its own group, forks Z into the SUITE's group, and never reaps it
const ZPY = path.join(stage, 'zombie.py');
fs.writeFileSync(ZPY, [
  'import os, sys, time',
  'G = int(sys.argv[1])',
  'if os.fork() > 0:',
  '    os._exit(0)',
  'os.setpgid(0, 0)',
  'r, w = os.pipe()',
  'z = os.fork()',
  'if z == 0:',
  '    os.close(r)',
  '    try:',
  '        os.setpgid(0, G)',
  "        os.write(w, b'x')",
  '    except OSError:',
  '        pass',
  '    os._exit(0)',
  'os.close(w)',
  'if not os.read(r, 1):', // Z died without joining G (no such group): EOF, not a hang
  "    print('ZOMBIE-SETUP-FAILED setpgid into group %d' % G, flush=True)",
  '    os._exit(1)',
  "print('ZOMBIE %d PARENT %d' % (z, os.getpid()), flush=True)",
  'time.sleep(300)',
].join('\n') + '\n');
fs.writeFileSync(SUITE, `import { spawn } from 'node:child_process';
import fs from 'node:fs';
const [pa, pb, mode, pc] = process.argv.slice(2);
console.log('SUITE-PID ' + process.pid);
console.log('SUITE-ENV-DEADLINE ' + (process.env.OB_RUN_GATE_DEADLINE_S ?? 'unset'));
if (mode === 'crash' || mode === 'crash0') {
  if (mode === 'crash') console.log('ok: 1a: the capture + FAILED transcode probe hides Photos');
  console.log('E2E-FAKE FAIL: app never became ready');
  console.log('[fake] FAIL (2 failing assertions)');
  console.log('E2E-FAKE: FAILED');
  process.exit(1);
}
if (mode === 'replay') { // #1210: e2e-userboot's red log; its stdout lines first, then node's uncaught block on stderr
  const c = JSON.parse(fs.readFileSync(process.env.OB_TREE_REPLAY_LOG, 'utf8')).cases.find((x) => x.id === 'L27');
  const k = c.lines.findIndex((l) => l.startsWith('file:///'));
  process.stdout.write(c.lines.slice(0, k).join('\\n') + '\\n', () => setTimeout(() => {
    process.stderr.write(c.lines.slice(k).join('\\n') + '\\n', () => process.exit(1));
  }, 500)); // the gap keeps the two streams in the order node wrote them
  await new Promise(() => {});
}
if (mode === 'summaryred') { // #1210 control: two counted arms, and only summaries fail
  console.log('ok: a: first arm');
  console.log('ok: b: second arm');
  console.log('[fake] FAIL (2 failing assertions)');
  console.log('E2E-FAKE: FAILED');
  process.exit(1);
}
if (mode === 'zombie') {
  const h = spawn('python3', [process.env.OB_TREE_ZOMBIE_PY, String(process.pid)], { stdio: ['ignore', 'pipe', 'ignore'] });
  h.on('error', (e) => console.log('ZOMBIE-SETUP-FAILED ' + e.message));
  let zo = ''; let zready = false;
  h.stdout.on('data', (d) => {
    zo += d;
    const m = /ZOMBIE (\\d+) PARENT (\\d+)/.exec(zo);
    if (m) { zready = true; console.log('[fake] PASS warm-up arm'); console.log('SUITE-READY ' + JSON.stringify({ suite: process.pid, zombie: Number(m[1]), zparent: Number(m[2]) })); zo = ''; }
  });
  h.stdout.on('end', () => { if (!zready) { console.log('ZOMBIE-SETUP-FAILED ' + zo.trim()); process.exit(1); } });
  process.on('SIGTERM', () => { console.log('E2E-FAKE FAIL: interrupted by SIGTERM'); process.exit(143); });
  setInterval(() => {}, 1000);
  await new Promise(() => {});
}
const listen = (port) => "require('net').createServer().listen(" + port + ", '127.0.0.1')";
if (mode === 'plain') { // never finishes; nothing in it ignores SIGTERM
  const a = spawn(process.execPath, ['-e', listen(pa)], { stdio: 'ignore' });
  console.log('[fake] PASS warm-up arm');
  console.log('SUITE-READY ' + JSON.stringify({ suite: process.pid, a: a.pid }));
  process.on('SIGTERM', () => { console.log('E2E-FAKE FAIL: interrupted by SIGTERM'); process.exit(143); });
  setInterval(() => {}, 1000);
  await new Promise(() => {});
}
const a = spawn(process.execPath, ['-e', "process.on('SIGTERM', () => {}); " + listen(pa)], { stdio: 'ignore' });
const b = spawn(process.execPath, ['-e', listen(pb)], { stdio: 'ignore', detached: true });
b.unref();
console.log('[fake] PASS warm-up arm');
console.log('SUITE-READY ' + JSON.stringify({ suite: process.pid, a: a.pid, b: b.pid }));
process.on('SIGTERM', () => {
  const c = spawn(process.execPath, ['-e', listen(pc)], { stdio: 'ignore' });
  console.log('SUITE-LATE ' + c.pid);
  console.log('E2E-FAKE FAIL: interrupted by SIGTERM');
  process.exit(143);
});
setInterval(() => {}, 1000);
`);
// a parent that stands in for the CI step's shell: it starts run-gate, reports the pid,
// and stays until killed
const PARENT = path.join(stage, 'fake-shell.mjs');
fs.writeFileSync(PARENT, `import { spawn } from 'node:child_process'; import fs from 'node:fs';
const [log, ...cmd] = process.argv.slice(2);
const out = fs.openSync(log, 'a');
const rg = spawn(process.execPath, cmd, { stdio: ['ignore', out, out] });
console.log('RG ' + rg.pid);
setInterval(() => {}, 1000);
`);

// every pid this probe started or learned from its own children, with its start time:
// a pid is signalled only while its start time still matches (pid reuse never is)
const recorded = new Map();
const lstartOf = (pid) => { try { return execFileSync('ps', ['-o', 'lstart=', '-p', String(pid)], { encoding: 'utf8' }).trim(); } catch { return ''; } };
const record = (pid) => { if (pid && !recorded.has(pid)) recorded.set(pid, lstartOf(pid)); };
const killRecorded = () => {
  for (const [pid, ls] of recorded) { if (ls && lstartOf(pid) === ls) { try { process.kill(pid, 'SIGKILL'); } catch { /* raced */ } } }
};
const term = (pid) => { try { process.kill(pid, 'SIGTERM'); return true; } catch { return false; } }; // false: already gone
const cleanup = () => {
  killRecorded();
  try { fs.rmSync(stage, { recursive: true, force: true }); } catch { /* raced */ }
};
setTimeout(() => { console.log('FAIL watchdog — the probe exceeded 300 s'); cleanup(); console.log('RUN-GATE-TREE SELFTEST FAIL (watchdog)'); process.exit(1); }, 300000).unref();

const rgArgs = (mode = 'hold', flags = []) => [RUN_GATE, '--band', `${B}-${B + 29}`, '--no-canary', '--no-belt', ...flags, '--', process.execPath, SUITE, String(B + 5), String(B + 6), mode, String(B + 7)];
/** the teardown helper's pid, once the suite reports it (recorded for cleanup) */
const latePid = (text) => { const m = /SUITE-LATE (\d+)/.exec(text); if (!m) return null; record(Number(m[1])); return Number(m[1]); };
/** between scenarios: a broken subject's leftovers (recorded pids, start time checked)
 * must not decide the next scenario — end them and wait for the band's ports */
const sweep = async () => {
  killRecorded();
  await until(async () => !(await busy(B + 5)) && !(await busy(B + 6)) && !(await busy(B + 7)), 5000);
};
/** run-gate as a direct child; resolves the suite's pids once it reports ready */
const startDirect = (env = {}, mode = 'hold', flags = []) => new Promise((resolve) => {
  const t0 = Date.now(); // review P2: before the spawn — run-gate's clock starts with it, and record() below runs ps
  const rg = spawn(process.execPath, rgArgs(mode, flags), { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env } });
  record(rg.pid);
  let out = '';
  rg.t0 = t0; rg.deadlineAt = null;
  const ready = (d) => {
    out += d;
    if (rg.deadlineAt === null && out.includes('[run-gate] deadline ')) rg.deadlineAt = Date.now(); // GH-1140: the probe's clock
    const m = /SUITE-READY (\{[^\n]*\})/.exec(out);
    const sp = /SUITE-PID (\d+)/.exec(out); if (sp) record(Number(sp[1]));
    if (m && !rg.readyPids) { rg.readyPids = JSON.parse(m[1]); for (const p of Object.values(rg.readyPids)) record(p); resolve(rg); }
  };
  rg.stdout.on('data', ready); rg.stderr.on('data', ready);
  rg.output = () => out;
  rg.closed = new Promise((r) => rg.once('close', (code, sig) => r({ code, sig })));
  rg.closed.then(() => resolve(rg)); // a run-gate that exits before the suite is ready (refused band)
  setTimeout(() => resolve(rg), 30000).unref();
});
/** run-gate under a stand-in shell; resolves { shell, rgPid, pids, log } once the suite is ready */
const startUnderShell = async (env = {}) => {
  const log = path.join(stage, `shell-${Date.now()}.log`);
  const shell = spawn(process.execPath, [PARENT, log, ...rgArgs()], { stdio: ['ignore', 'pipe', 'ignore'], env: { ...process.env, ...env } });
  record(shell.pid);
  let rgPid = null;
  shell.stdout.on('data', (d) => { const m = /RG (\d+)/.exec(String(d)); if (m) { rgPid = Number(m[1]); record(rgPid); } });
  let pids = null;
  await until(() => {
    const t = fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : '';
    const m = /SUITE-READY (\{[^\n]*\})/.exec(t);
    const sp = /SUITE-PID (\d+)/.exec(t); if (sp) record(Number(sp[1]));
    if (m) { pids = JSON.parse(m[1]); for (const p of Object.values(pids)) record(p); }
    return !!(m && rgPid);
  }, 30000);
  return { shell, rgPid, pids, log };
};
let envHashPlain = null; // T's entry: a run with no deadline knob, for DLE
const ledgerCount = () => { try { return fs.readFileSync(path.join(LEDGER, 'ledger.jsonl'), 'utf8').trim().split('\n').filter(Boolean).length; } catch { return 0; } };
const treeGone = async (pids) => [pids.suite, pids.a, pids.b].every(gone) && !(await busy(B + 5)) && !(await busy(B + 6));

try {
  row('C0', B !== null, 'a bindable 30-port window outside every declared band', `lanes=${lanes === null ? 'unloadable' : lanes.length}`);
  row('C0m', cdp.BAND_MUTEX_PORT === MUTEX && !(lanes ?? []).some((d) => cib.bandsIntersect(d.range ?? d, { start: MUTEX, end: MUTEX })),
    'a private registry mutex port outside every declared band (never the host-wide :47997; GH-1119)', `mutex=${MUTEX} cdp=${cdp.BAND_MUTEX_PORT}`);
  if (B !== null) {
    // ---- T: SIGTERM to run-gate ----------------------------------------------------
    {
      const rg = await startDirect();
      const p = rg.readyPids;
      // SUITE-READY prints right after the spawns: the grandchildren bind a beat later
      const up = !!p && await until(async () => !gone(p.a) && !gone(p.b) && (await busy(B + 5)) && (await busy(B + 6)), 10000);
      row('T0', up, 'setup: the fake suite is up with both grandchildren listening in the band', rg.output());
      if (up) {
        process.kill(rg.pid, 'SIGTERM');
        const r = await Promise.race([rg.closed, sleep(40000).then(() => null)]);
        row('T1', r && r.code === 143, 'SIGTERM to run-gate: it exits 143 within the escalation window', JSON.stringify(r));
        const late = latePid(rg.output());
        const g = late !== null && await until(async () => (await treeGone(p)) && gone(late) && !(await busy(B + 7)), 3000);
        row('T2', g, 'the suite, its SIGTERM-ignoring grandchild, its DETACHED grandchild and the teardown helper it forked on SIGTERM are all gone; their ports are free',
          JSON.stringify({ suite: gone(p.suite), a: gone(p.a), b: gone(p.b), late: late === null ? 'unreported' : gone(late), portA: await busy(B + 5), portB: await busy(B + 6), portLate: await busy(B + 7) }));
        const f = await bandFree(B);
        row('T3', f === true, 'the band is free: a fresh claim over it succeeds', f);
        const e = ledgerLast();
        envHashPlain = e?.envHash ?? null;
        row('T4', e && e.exitCode === 143 && e.result !== 'green' && e.arms_v3 === 1 && Array.isArray(e.failArms_v3) && e.failArms_v3.includes('interrupted by SIGTERM'),
          'the ledger entry is a red 143 naming the failed arm, with the suite\'s one PASS arm counted', JSON.stringify(e && { exitCode: e.exitCode, result: e.result, arms_v3: e.arms_v3, failArms_v3: e.failArms_v3 }));
        const o = rg.output();
        const iGone = o.indexOf('GH-1082: the suite tree is gone');
        row('T5', iGone >= 0 && iGone < o.indexOf('[run-gate] ledger:'), 'run-gate reports the suite tree gone before the ledger line (and the band release at exit)', o.slice(-1200));
      }
    }
    // ---- D: one event delivered twice is one signal; a later repeat escalates ---------
    await sweep();
    {
      const rg = await startDirect();
      const p = rg.readyPids;
      const up = !!p && await until(async () => !gone(p.a) && (await busy(B + 5)), 10000);
      if (up) {
        term(rg.pid); await sleep(50); term(rg.pid);
        await sleep(2000);
        const aliveA = !gone(p.a);
        row('D1', aliveA, 'a SIGTERM delivered twice 50 ms apart (a group signal plus a wrapper\'s forward) is ONE event: 2 s later the SIGTERM-ignoring grandchild is still alive (the grace runs, no SIGKILL escalation)',
          JSON.stringify({ a: aliveA, log: rg.output().slice(-500) }));
        const r = await Promise.race([rg.closed, sleep(40000).then(() => null)]);
        const late = latePid(rg.output());
        const g = await until(async () => (await treeGone(p)) && (late === null || gone(late)), 3000);
        row('D2', r && r.code === 143 && g, 'then the grace ends the tree and run-gate exits 143', JSON.stringify({ r, gone: g }));
      } else row('D1', false, 'setup: the fake suite never came up with its grandchild listening', rg.output());
    }
    await sweep();
    {
      const rg = await startDirect();
      const p = rg.readyPids;
      const up = !!p && await until(async () => !gone(p.a) && (await busy(B + 5)), 10000);
      if (up) {
        term(rg.pid); await sleep(1500); term(rg.pid); // a run-gate already gone cannot escalate: D3 judges the grandchild
        const killed = await until(() => gone(p.a), 2000, 100);
        row('D3', killed, 'a SIGTERM repeated 1.5 s later is a second event: it escalates, and the SIGTERM-ignoring grandchild is SIGKILLed within 2 s',
          JSON.stringify({ a: !gone(p.a), log: rg.output().slice(-500) }));
        await Promise.race([rg.closed, sleep(40000)]);
        const late = latePid(rg.output());
        await until(async () => (await treeGone(p)) && (late === null || gone(late)), 3000);
      } else row('D3', false, 'setup: the fake suite never came up with its grandchild listening', rg.output());
    }
    // ---- Z: a zombie left in the suite's group is not a survivor (review GH-1082 P2) ----
    await sweep();
    {
      const rg = await startDirect({ OB_TREE_ZOMBIE_PY: ZPY }, 'zombie');
      const p = rg.readyPids;
      const zrow = () => { try { return execFileSync('ps', ['-o', 'stat=,pgid=', '-p', String(p.zombie)], { encoding: 'utf8' }).trim().split(/\s+/); } catch { return null; } };
      const up = !!p?.zombie && await until(() => { const z = zrow(); return !!z && z[0].startsWith('Z') && Number(z[1]) === p.suite; }, 5000);
      row('Z0', up, 'setup: a zombie in the suite\'s process group, its parent outside the tree and alive',
        JSON.stringify({ pids: p ?? null, z: p?.zombie ? zrow() : null, log: rg.output().slice(-400) }));
      if (up) {
        term(rg.pid);
        const r = await Promise.race([rg.closed, sleep(40000).then(() => null)]);
        const o = rg.output();
        row('Z1', r && r.code === 143 && o.includes('GH-1082: the suite tree is gone') && !o.includes('NOT gone'),
          'SIGTERM: run-gate exits 143 and reports the suite tree gone — the zombie is no survivor', JSON.stringify({ r, log: o.slice(-600) }));
        const f = await bandFree(B);
        row('Z2', f === true, 'the band is free: the claim was never transferred to the zombie', f);
      } else if (term(rg.pid)) await Promise.race([rg.closed, sleep(40000)]); // setup failed: end the run, leave nothing
    }
    // ---- P0: parent watch OFF (the default off CI) -----------------------------------
    await sweep();
    {
      const s = await startUnderShell();
      if (s.pids && s.rgPid) {
        process.kill(s.shell.pid, 'SIGKILL');
        await sleep(5000);
        row('P0', !gone(s.rgPid) && !gone(s.pids.suite), 'control: with the parent watch off, killing run-gate\'s parent leaves the run alive',
          JSON.stringify({ rg: !gone(s.rgPid), suite: !gone(s.pids.suite) }));
        term(s.rgPid); // the T path, already proven above: end it by its recorded pid
        await until(async () => (await treeGone(s.pids)) && gone(s.rgPid), 40000);
        latePid(fs.readFileSync(s.log, 'utf8'));
      } else row('P0', false, 'control setup: run-gate under a stand-in shell never reported ready', s.log && fs.existsSync(s.log) ? fs.readFileSync(s.log, 'utf8').slice(-800) : '');
    }
    // ---- P1: parent watch ON — a CI cancel that ends only the step's shell -------------
    await sweep();
    {
      const s = await startUnderShell({ OB_RUN_GATE_PARENT_WATCH: '1' });
      if (s.pids && s.rgPid) {
        process.kill(s.shell.pid, 'SIGKILL');
        const ended = await until(async () => gone(s.rgPid) && (await treeGone(s.pids)), 45000, 500);
        const f = ended ? await bandFree(B) : 'run still alive';
        const t = fs.readFileSync(s.log, 'utf8');
        row('P1', ended && f === true && /GH-1082: the parent \(pid \d+\) is gone/.test(t),
          'with OB_RUN_GATE_PARENT_WATCH=1, killing run-gate\'s parent ends run-gate and the whole suite tree, frees both ports and the band',
          JSON.stringify({ rg: gone(s.rgPid), suite: gone(s.pids.suite), a: gone(s.pids.a), b: gone(s.pids.b), band: f, log: t.slice(-600) }));
      } else row('P1', false, 'setup: run-gate under a stand-in shell never reported ready', s.log && fs.existsSync(s.log) ? fs.readFileSync(s.log, 'utf8').slice(-800) : '');
    }
    // ---- DL: GH-1140, run-gate's own deadline ---------------------------------------
    await sweep();
    const preSpawn = (o) => (o.includes('before the suite started') ? 'SETUP: the deadline fired before the suite spawned (pre-spawn work outlived it) — ' : '');
    {
      const rg = await startDirect({}, 'hold', ['--deadline', '5']);
      const p = rg.readyPids;
      const up = !!p && await until(async () => !gone(p.a) && !gone(p.b) && (await busy(B + 5)) && (await busy(B + 6)), 10000);
      if (up) {
        const r = await Promise.race([rg.closed, sleep(35000).then(() => null)]);
        if (!r) { term(rg.pid); await Promise.race([rg.closed, sleep(40000)]); } // no deadline fired: end it by its recorded pid
        const o = rg.output();
        const at = rg.deadlineAt === null ? null : rg.deadlineAt - rg.t0;
        row('DL1', r && r.code === 124 && o.includes('[run-gate] deadline 5 s reached — ending the suite tree') && at !== null && at >= 5000 && at <= 10000,
          '--deadline 5 over a suite that never finishes: the deadline line 5-10 s after the probe started run-gate (the probe\'s clock), then exit 124 on its own',
          preSpawn(o) + JSON.stringify({ r, deadlineLineAtMs: at, log: o.slice(-700) }));
        const late = latePid(o);
        const g = late !== null && await until(async () => (await treeGone(p)) && gone(late) && !(await busy(B + 7)), 3000);
        row('DL2', r && g, 'the run ended on its deadline, and the suite, its SIGTERM-ignoring grandchild, its DETACHED grandchild and its late teardown helper are all gone; their ports are free',
          JSON.stringify({ endedOnItsOwn: !!r, suite: gone(p.suite), a: gone(p.a), b: gone(p.b), late: late === null ? 'unreported' : gone(late), portA: await busy(B + 5), portB: await busy(B + 6), portLate: await busy(B + 7) }));
        const f = await bandFree(B);
        row('DL3', r && f === true, 'the run ended on its deadline, and the band is free: a fresh claim over it succeeds', JSON.stringify({ endedOnItsOwn: !!r, band: f }));
        const e = ledgerLast();
        const line = (/\[run-gate\] ledger:[^\n]*/.exec(o) ?? [''])[0];
        const iGone = o.indexOf('GH-1082: the suite tree is gone');
        row('DL4', r && e && e.exitCode === 124 && e.result === 'red' && e.deadline === 5 && e.deadlineElapsedMs >= 5000 && e.deadlineElapsedMs < 10000
          && /\(1 arms; DEADLINE 5 s at 5\.\d s; FAIL: interrupted by SIGTERM\)/.test(line) && iGone >= 0 && iGone < o.indexOf('[run-gate] ledger:'),
        'the ledger entry is red, exit 124, deadline 5, elapsed >= 5000 ms; the ledger line names the deadline next to the failed arm, after the tree was reported gone',
        JSON.stringify({ e: e && { exitCode: e.exitCode, result: e.result, deadline: e.deadline, deadlineElapsedMs: e.deadlineElapsedMs, arms_v3: e.arms_v3, failArms_v3: e.failArms_v3 }, line, iGone }));
      } else {
        row('DL1', false, 'setup: the fake suite never came up with both grandchildren listening', preSpawn(rg.output()) + rg.output().slice(-700));
        if (term(rg.pid)) await Promise.race([rg.closed, sleep(40000)]);
      }
    }
    await sweep();
    // a run that must end at its deadline: resolves { r, at, o, e } (r null: it did not end in 25 s, and was ended by its recorded pid)
    const deadlineRun = async (env, flags, mode = 'plain') => {
      const rg = await startDirect(env, mode, flags);
      const r = await Promise.race([rg.closed, sleep(25000).then(() => null)]);
      if (!r) { term(rg.pid); await Promise.race([rg.closed, sleep(40000)]); }
      await until(async () => !(await busy(B + 5)), 3000);
      return { r, at: rg.deadlineAt === null ? null : rg.deadlineAt - rg.t0, o: rg.output(), e: ledgerLast() };
    };
    {
      const d = await deadlineRun({ OB_RUN_GATE_DEADLINE_S: '4' }, []);
      row('DLE', d.r && d.r.code === 124 && d.at !== null && d.at >= 4000 && d.e?.deadline === 4 && d.o.includes('SUITE-ENV-DEADLINE unset') && !d.o.includes('SUITE-ENV-DEADLINE 4')
        && envHashPlain !== null && d.e?.envHash === envHashPlain,
      'OB_RUN_GATE_DEADLINE_S=4 alone: exit 124 at 4 s; the suite never sees the knob, and the entry\'s envHash equals a run without it',
      preSpawn(d.o) + JSON.stringify({ r: d.r, deadlineLineAtMs: d.at, deadline: d.e?.deadline, env: (/SUITE-ENV-DEADLINE \S+/.exec(d.o) ?? [''])[0], envHash: d.e?.envHash?.slice(0, 12), plain: envHashPlain?.slice(0, 12), log: d.o.slice(-300) }));
    }
    await sweep();
    {
      const d = await deadlineRun({ OB_RUN_GATE_DEADLINE_S: '1' }, ['--deadline', '5']);
      row('DLF', d.r && d.r.code === 124 && d.at !== null && d.at >= 5000 && d.e?.deadline === 5 && d.e?.deadlineElapsedMs >= 5000,
        'the flag wins over the env: OB_RUN_GATE_DEADLINE_S=1 with --deadline 5 fires at 5 s',
        preSpawn(d.o) + JSON.stringify({ r: d.r, deadlineLineAtMs: d.at, deadline: d.e?.deadline, elapsed: d.e?.deadlineElapsedMs, log: d.o.slice(-300) }));
    }
    await sweep();
    {
      const d = await deadlineRun({ OB_RUN_GATE_DEADLINE_S: '' }, [], 'crash0');
      row('DLU', d.r && d.r.code === 1 && d.at === null && d.e && !('deadline' in d.e) && d.o.includes('SUITE-ENV-DEADLINE unset'),
        'an empty OB_RUN_GATE_DEADLINE_S is unset: the suite runs to its own end (exit 1), no deadline line, no deadline in the entry',
        JSON.stringify({ r: d.r, deadlineLineAtMs: d.at, entryDeadline: d.e?.deadline, log: d.o.slice(-300) }));
    }
    await sweep();
    {
      const bad = [];
      const n0 = ledgerCount();
      // a refusal exits before any spawn; a subject that starts the suite instead is ended by its
      // recorded pids within 15 s and named, never left running
      const refused = (label, env, flags) => new Promise((res) => {
        const rg = spawn(process.execPath, rgArgs('plain', flags), { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env } });
        record(rg.pid);
        let out = '';
        const take = (x) => {
          out += x;
          const sp = /SUITE-PID (\d+)/.exec(out); if (sp) record(Number(sp[1]));
          const m = /SUITE-READY (\{[^\n]*\})/.exec(out); if (m) for (const q of Object.values(JSON.parse(m[1]))) record(q);
        };
        rg.stdout.on('data', take); rg.stderr.on('data', take);
        const timer = setTimeout(() => { term(rg.pid); }, 15000);
        rg.once('close', (code) => { clearTimeout(timer); res({ label, code, out }); });
      });
      for (const v of ['0', '-1', 'abc', '1.5x', '86401', '1e3', '0x10', '05', '3.0', '']) {
        const r = await refused(v, {}, ['--deadline', v]);
        if (!(r.code === 2 && r.out.includes(`run-gate: --deadline ${v} refused`) && !r.out.includes('SUITE-PID'))) bad.push({ v, code: r.code, out: r.out.slice(-200) });
      }
      {
        const r = await refused('--deadline=3', {}, ['--deadline=3']);
        if (!(r.code === 2 && r.out.includes('run-gate: --deadline=3 refused') && !r.out.includes('SUITE-PID'))) bad.push({ v: '--deadline=3', code: r.code, out: r.out.slice(-200) });
      }
      {
        const r = await refused('twice', {}, ['--deadline', '5', '--deadline', '6']);
        if (!(r.code === 2 && r.out.includes('run-gate: --deadline given twice (5, then 6)') && !r.out.includes('SUITE-PID'))) bad.push({ v: 'twice', code: r.code, out: r.out.slice(-200) });
      }
      {
        const r = await refused('env abc', { OB_RUN_GATE_DEADLINE_S: 'abc' }, []);
        if (!(r.code === 2 && r.out.includes('run-gate: OB_RUN_GATE_DEADLINE_S=abc refused') && !r.out.includes('SUITE-PID'))) bad.push({ env: 'abc', code: r.code, out: r.out.slice(-200) });
      }
      await sweep();
      row('DLR', bad.length === 0 && ledgerCount() === n0,
        '0, -1, abc, 1.5x, 86401, 1e3, 0x10, 05, 3.0 and an empty value (flag), the one-token --deadline=3, a repeated --deadline, and abc (env) are refused by name with exit 2: no suite starts, no ledger entry',
        JSON.stringify({ bad, ledger: [n0, ledgerCount()] }));
    }
    await sweep();
    {
      // a `git` that takes 2 s (run-gate's tree identity calls it synchronously), first on PATH
      const realGit = (process.env.PATH ?? '').split(':').map((d) => path.join(d, 'git')).find((f) => { try { fs.accessSync(f, fs.constants.X_OK); return true; } catch { return false; } });
      const GITDIR = path.join(stage, 'slow-git'); fs.mkdirSync(GITDIR, { recursive: true });
      fs.writeFileSync(path.join(GITDIR, 'git'), `#!/bin/sh\nsleep 2\nexec ${realGit} "$@"\n`, { mode: 0o755 });
      const n0 = ledgerCount();
      const r = await new Promise((res) => {
        const rg = spawn(process.execPath, [RUN_GATE, '--no-canary', '--no-belt', '--deadline', '1', '--', process.execPath, SUITE, String(B + 5), String(B + 6), 'plain', String(B + 7)],
          { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PATH: `${GITDIR}:${process.env.PATH}` } });
        record(rg.pid);
        let out = '';
        const take = (x) => { out += x; const sp = /SUITE-PID (\d+)/.exec(out); if (sp) record(Number(sp[1])); const m = /SUITE-READY (\{[^\n]*\})/.exec(out); if (m) for (const q of Object.values(JSON.parse(m[1]))) record(q); };
        rg.stdout.on('data', take); rg.stderr.on('data', take);
        const timer = setTimeout(() => { term(rg.pid); }, 60000);
        rg.once('close', (code) => { clearTimeout(timer); res({ code, out }); });
      });
      row('DLP', realGit && r.code === 75 && r.out.includes('[run-gate] deadline 1 s reached before the suite started — not run, exit 75') && !r.out.includes('SUITE-PID') && ledgerCount() === n0,
        'a deadline that expires during the synchronous pre-spawn work (a 2 s git, --deadline 1, no band, no canary) is caught right before the spawn: exit 75, no suite, no ledger entry',
        JSON.stringify({ realGit, code: r.code, ledger: [n0, ledgerCount()], out: r.out.slice(-500) }));
    }
    await sweep();
    // ---- L1 / L2: the failed arms' names in the ledger -------------------------------
    await sweep();
    const crashRun = async (mode) => {
      const rg = spawn(process.execPath, rgArgs(mode), { stdio: ['ignore', 'pipe', 'pipe'] });
      record(rg.pid);
      let out = ''; rg.stdout.on('data', (d) => { out += d; }); rg.stderr.on('data', (d) => { out += d; });
      const code = await new Promise((res) => rg.once('close', (c) => res(c)));
      const e = ledgerLast();
      return { code, arms: e?.arms_v3, failArms: e?.failArms_v3, line: (/\[run-gate\] ledger:[^\n]*/.exec(out) ?? [''])[0] };
    };
    {
      const r = await crashRun('crash0');
      row('L1', r.code === 1 && r.arms === 0 && JSON.stringify(r.failArms) === '["app never became ready"]'
        && /ledger: \S+ red \(0 arms; FAIL: app never became ready\)/.test(r.line),
      'a 0-arm red records the failed arm\'s name, in the entry (failArms_v3) and in the ledger line; a "(n failing assertions)" summary and a bare "FAILED" verdict name none',
      JSON.stringify(r));
      const r2 = await crashRun('crash');
      row('L2', r2.code === 1 && r2.arms === 1 && JSON.stringify(r2.failArms) === '["app never became ready"]'
        && /red \(1 arms; FAIL: app never became ready\)/.test(r2.line),
      'an ok line that quotes "FAILED" counts as its arm and names no failure; the ledger line prints the count and the failure (#1210)',
      JSON.stringify(r2));
      // #1210's replay: e2e-userboot's red log from verdict-grammar fixture L27 (the probe tree's own copy)
      const fixture = path.join(path.dirname(RUN_GATE), 'fixtures', 'verdict-grammar', 'logs.json');
      const want = JSON.parse(fs.readFileSync(fixture, 'utf8')).cases.find((c) => c.id === 'L27')?.failArms ?? [];
      process.env.OB_TREE_REPLAY_LOG = fixture;
      const r3 = await crashRun('replay');
      row('L3', r3.code === 1 && r3.arms === 10 && want.length === 1 && want[0].startsWith('uncaught: Error: CDP websocket handshake')
        && JSON.stringify(r3.failArms) === JSON.stringify(want) && r3.line.includes(` red (10 arms; FAIL: ${want[0]}) at tree `)
        && !/honest/.test(r3.line),
      "#1210's replay: e2e-userboot's red log (ten OK arms, then node's uncaught CDP handshake crash) prints 'red (10 arms; FAIL: uncaught: Error: …)', and the entry names that one crash, never the passing 'terminal BOOT FAILED honest: …' line",
      JSON.stringify({ ...r3, want }));
      const r4 = await crashRun('summaryred');
      row('L4', r4.code === 1 && r4.arms === 2 && JSON.stringify(r4.failArms) === '[]' && / red \(2 arms\) at tree /.test(r4.line),
        'control: a red with counted arms whose only failures are summaries names none, and its ledger line keeps the count form alone',
        JSON.stringify(r4));
    }
  }
} catch (e) {
  row('X', false, 'probe exception', e.stack ?? e.message);
} finally {
  cleanup();
}
const bad = rows.filter((r) => !r.ok);
console.log(bad.length ? `RUN-GATE-TREE SELFTEST FAIL (${bad.length} of ${rows.length}: ${bad.map((r) => r.id).join(', ')})` : `RUN-GATE-TREE SELFTEST PASS (${rows.length})`);
process.exit(bad.length ? 1 : 0);
