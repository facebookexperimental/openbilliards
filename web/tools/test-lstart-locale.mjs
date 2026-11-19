// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-lstart-locale.mjs — GH-1143: the band registry's process birth tokens (ps lstart) are one form for every
// writer and reader, whatever their locale, and a token from another locale is never read as pid reuse.
// Plain node, no browser. A private registry, marker dir and registry mutex port (the OB_PORT_BANDS_DIR /
// OB_SERVER_MARKER_DIR / OB_BAND_MUTEX_PORT seams), on a 30-port window outside every declared band. Every process
// here is this probe's own, recorded with its start time and signalled by pid (a server: its group) only while that
// still matches; stand-ins exit by themselves once orphaned, and SIGINT/SIGTERM/SIGHUP run the same cleanup.
//
//   LC0 setup: this host localizes ps — lstart under fr_FR.UTF-8 and zh_CN.UTF-8 differs from C (the construction)
//   LC1 a writer under fr_FR.UTF-8 (and one under zh_CN.UTF-8) claims a band and leases a live stand-in: the lease's
//       token is the C form, equal to a C-locale reading of the stand-in
//   LC2 the fr_FR and zh_CN writers gone, a scanner in C finds each stand-in a live holder: each claim is refused BY
//       that holder (the refusal names the claim dir and the holder pid), the lease kept, the stand-in alive
//   LC3 a lease token in fr_FR form (written before GH-1143) for the live stand-in: still a live holder in C — refused,
//       lease kept, stand-in alive
//   LC4 a C-form token that does not match the live stand-in is pid reuse: the lease is pruned and the band claimed
//   LCs the getfqdn shim (below) answers a loopback literal address itself and passes every other name to the original:
//       the wildcard addresses '::' and '0.0.0.0', host names, and the next sitecustomize on the path still loads
//   LCp the server rows' control: python in their form (-d <dir> --bind 127.0.0.1 <port>), run with the shim, listens
//       within pyServer's 15 s wait. The hosted macOS signature (#1205) is a NAMED FAIL: the last connect at the bound
//       neither connected nor was refused (port-state's 'unknown': a timeout or any error other than ECONNREFUSED; on
//       the hosted runner it timed out), the control is still running, and lsof, scoped to the control's own process
//       group (#1189), lists its socket on the port as (CLOSED) and never LISTEN
//       — bound and not listening. LCp then FAILS with HOST SIGNATURE and the control's sockets (a GitHub error in
//       Actions), the verdict line names it and the run exits 1; the rows that start python (LC5, LC6, LC9, LC12, LC13,
//       LC14) print NOT RUN and change nothing. There is no skip path (CI decision D1). Anything else that keeps the
//       control from listening (python3 absent or exited, a port read refused, lsof failing) also FAILS LCp, unnamed,
//       with the end of python's stderr, and those rows run
//   LC5 in a process under fr_FR.UTF-8, spawnStaticServer's group probe reads its live server as 'ours' and its marker
//       carries the C-form token of the leader; stopStaticServer then ends it, the port refused after
//   LC6 the same in a process under en_US.UTF-8 with a NON-ASCII docroot (…/doc-é): the probe still reads 'ours' (the
//       command column is read in the caller's locale — macOS ps under C vis-encodes 'é' and would never match)
//   LC7 an owner.json in fr_FR form for a LIVE claimant, written now: the claimant is live, never 'dead (pid reused)' —
//       the claim is refused and kept
//   LC8 the same token written 25 h ago (past NON_C_TOKEN_GRACE_MS): read as pid reuse — the claim swept, the band
//       claimed (a pre-GH-1143 token can never hold a band for good)
//   LC9 a scanner under fr_FR.UTF-8 over a dead, released claim with a live harness-shaped listener inside it: the
//       endpoint evidence finds it (its 24-char lstart column read in C) and records a discovery lease with the C-form
//       token — the claim is refused
//   LC10 a reap tombstone held by a live retirer (its C-form reaper token) keeps its claim visible and names the
//       claimant from the tombstone's owner.json: an fr_FR token for the live claimant written now names it LIVE,
//       the same token written 25 h ago names it DEAD (PID REUSED) — the tombstone path reads the token's age too
//   LC11 a reap tombstone whose RETIRER token is in fr_FR form: written now, the retirer is live and the tombstone
//       stays visible (refused, naming it); written 25 h ago, the retirer reads as pid reuse and the empty tombstone
//       is swept (claimed)
//   LC12 a live server inside a dead claim, its marker naming this live probe as harness and an fr_FR birth token:
//       written now, the marker is kept (no verdict: never pruned or signalled while its row lives); written 25 h
//       ago, it reads as a mismatch and the marker is pruned (the server is parented, never an orphan to reap)
//   LC13 e2e-retry under fr_FR.UTF-8, signalled while its suite holds a static server on a non-ASCII docroot
//       (…/doc-é2): the suite dies without its teardown, and e2e-retry's marker reap ends the server group (the
//       command read in the caller's locale, the birth token in C) — exit 143, the port refused, the marker gone
//   LC14 the group probe with the leader's birth-time read failing (a ps stand-in first on PATH fails every lstart
//       read while a flag file exists) reads 'unknown', never 'ours': an empty reading is no proof on a signal path;
//       with the flag gone the server is stopped as usual
//
// The getfqdn shim (#1205 hosted macOS, as in test-hygiene-8h-probe.mjs): http.server's server_bind calls
// socket.getfqdn(<bind host>) between bind and listen, so where the host's reverse lookup is slow a python server sits
// bound and not listening past the rows' waits (batch 9's main push run on the hosted macOS image: 35 s for 127.0.0.1,
// and the wildcard-bound servers had not answered a connect by the rows' 60 s child timeout). What these rows test is
// birth tokens across locales, not the host's resolver: every python this file starts (pyServer's, and through their env
// the servers its children start with spawnStaticServer, e2e-retry's suite in LC13 included) gets a sitecustomize,
// written by this file into its stage dir and put first on PYTHONPATH, that answers socket.getfqdn for a LOOPBACK
// literal address with the address itself and passes every other name to the original (after loading the first other
// sitecustomize on the path). The servers bind loopback (spawnStaticServer's { bind: '127.0.0.1' }, pyServer's --bind
// 127.0.0.1) so the shim's answer applies; a wildcard bind in pyServer still pays its lookup (spawnStaticServer's own
// #1228 shim answers it for the servers that helper starts). The gates spawn the all-interfaces
// form: every matcher on these rows' paths reads http.server, the docroot or the port token, never the bind, so the
// two forms read alike here, and a matcher that came to depend on the form would not be seen by these rows. pyServer
// waits for the port to be LISTENING: on macOS a connect to a socket that is bound and not yet listening times out, it
// is not refused.
//
//   node web/tools/test-lstart-locale.mjs      # exit 0/1; last line PASS (n) / FAIL (k of n[; HOST SIGNATURE …])
//   OB_LSTART_LOCALE_PROBE=<copy>/web/tools/cdp.mjs node ...   # judge a plant copy
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CDP = path.resolve(process.env.OB_LSTART_LOCALE_PROBE || path.join(HERE, 'cdp.mjs'));
const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'ob-lstart-locale-'));
const REG = path.join(stage, 'reg'); const MRK = path.join(stage, 'mrk'); fs.mkdirSync(REG); fs.mkdirSync(MRK);
const SHIM_PY = [
  '# test-lstart-locale (#1205 hosted macOS): socket.getfqdn answers a loopback literal address itself; every other',
  '# name goes to the original. Any other sitecustomize on the path loads first, so this wraps what it installs.',
  'import importlib.util, ipaddress, os, socket, sys',
  '_here = os.path.dirname(os.path.abspath(__file__))',
  'for _d in sys.path:',
  '    _f = os.path.join(_d or os.curdir, "sitecustomize.py")',
  '    if os.path.abspath(_d or os.curdir) != _here and os.path.isfile(_f):',
  '        _spec = importlib.util.spec_from_file_location("_next_sitecustomize", _f)',
  '        _spec.loader.exec_module(importlib.util.module_from_spec(_spec))',
  '        break',
  '_orig = socket.getfqdn',
  'def getfqdn(name=""):',
  '    try:',
  '        if ipaddress.ip_address(name.strip()).is_loopback:',
  '            return name',
  '    except ValueError:',
  '        pass',
  '    return _orig(name)',
  'socket.getfqdn = getfqdn',
  '',
].join('\n');
const SHIM_DIR = path.join(stage, 'pyshim'); fs.mkdirSync(SHIM_DIR); fs.writeFileSync(path.join(SHIM_DIR, 'sitecustomize.py'), SHIM_PY);
/** `env` with the shim first on PYTHONPATH, for the pythons this file or its children start, and only those */
const shimEnv = (env) => ({ ...env, PYTHONPATH: env.PYTHONPATH ? SHIM_DIR + path.delimiter + env.PYTHONPATH : SHIM_DIR });
const IN_ACTIONS = !!process.env.GITHUB_ACTIONS; // read before the CI keys are dropped below
for (const k of ['GITHUB_ACTIONS', 'OB_CI_BANDS', 'CI', 'OB_E2E_PORT', 'OB_E2E_CDP_PORT', 'OB_CDP_PORT', 'OB_PORT_BANDS']) delete process.env[k];
Object.assign(process.env, { OB_PORT_BANDS_DIR: REG, OB_SERVER_MARKER_DIR: MRK, OB_BAND_MUTEX_PORT: String(38600 + (process.pid % 90)), LC_ALL: 'C', LANG: 'C' });
const cdp = await import(pathToFileURL(CDP).href);
const cib = await import(pathToFileURL(path.join(path.dirname(CDP), 'lib', 'ci-bands.mjs')).href);
const { awaitPortState } = await import(pathToFileURL(path.join(HERE, 'lib', 'port-state.mjs')).href);

const rows = [];
const row = (id, ok, desc, detail = '') => { rows.push({ id, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${id} — ${desc}${ok ? '' : `: ${String(detail).slice(0, 700)}`}`); };
const HOST_SIG = "HOST SIGNATURE (#1205 hosted macOS): python's listener never reached LISTEN on this host";
const notRun = [];
/** a row the host signature keeps from running: printed by name, never a PASS; LCp's FAIL carries the red */
const notRunRow = (id) => { notRun.push(id); console.log(`NOT RUN ${id} — it starts a python server: the host signature (LCp)`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lstartIn = (pid, loc) => { try { return execFileSync('ps', ['-o', 'lstart=', '-p', String(pid)], { encoding: 'utf8', env: { ...process.env, LC_ALL: loc, LANG: loc } }).trim(); } catch { return ''; } };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const recorded = new Map();
const groups = new Set(); // recorded pids that lead a process group of their own (servers): ended as a group
/** remember a pid with its start time — retried briefly, ps can miss a just-spawned pid */
const record = (pid, group = false) => {
  if (!pid || recorded.has(pid)) return;
  let ls = '';
  for (let i = 0; i < 20 && !ls; i++) { ls = lstartIn(pid, 'C'); if (!ls) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50); }
  recorded.set(pid, ls); if (group) groups.add(pid);
};
/** SIGKILL a recorded pid (a server: its group), only while its start time still matches */
const endRecorded = (pid) => {
  const ls = recorded.get(pid);
  if (!ls || lstartIn(pid, 'C') !== ls) return; // gone, or the pid reused: never signalled
  try { process.kill(groups.has(pid) ? -pid : pid, 'SIGKILL'); } catch { try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ } }
};
const cleanup = () => {
  for (const pid of recorded.keys()) endRecorded(pid);
  fs.rmSync(stage, { recursive: true, force: true });
};
const bindable = (port) => new Promise((r) => { const s = net.createServer(); s.once('error', () => r(false)); s.listen(port, '127.0.0.1', () => s.close(() => r(true))); });
const refused = (port) => new Promise((r) => { const c = net.connect({ port, host: '127.0.0.1' }); const d = (v) => { try { c.destroy(); } catch {} r(v); }; c.once('connect', () => d(false)); c.once('error', (e) => d(e.code === 'ECONNREFUSED')); c.setTimeout(3000, () => d(false)); });
/** the TCP sockets of one process group (`pgid`: a detached spawn's own pid) whose LOCAL port is `port`, as '<command> <pid>
 * <address> (<state>)'; 'none', or 'lsof <status>' when lsof failed (it exits 1 with nothing to list, and also after a warning
 * with rows listed, so its stdout is read then). #1189: `lsof -iTCP:<port>` alone matches every socket whose local OR remote
 * port has that number; the group scope is e2e-retry B6's (-a -g <pid> -iTCP). With -g, lsof adds a PGID column after PID */
const socketsOf = (port, pgid) => {
  let txt = '';
  try { txt = execFileSync('lsof', ['-nP', '-a', '-g', String(pgid), '-iTCP'], { encoding: 'utf8', timeout: 5000 }); } catch (e) {
    if (e.status !== 1) return `lsof ${e.status ?? e.code}`;
    txt = String(e.stdout ?? '');
  }
  return txt.trim().split('\n').slice(1).filter(Boolean).map((l) => l.trim().split(/\s+/))
    .filter((f) => f.length >= 3 && f.at(-2).split('->')[0].endsWith(`:${port}`))
    .map((f) => `${f[0]} ${f[1]} ${f.slice(-2).join(' ')}`).join('; ') || 'none';
};
setTimeout(() => {
  console.log('FAIL watchdog — the probe exceeded 300 s'); cleanup();
  const bad = rows.filter((r) => !r.ok); // the rows printed so far keep their verdicts in the summary
  console.log(`LSTART-LOCALE SELFTEST FAIL (watchdog; ${bad.length} of ${rows.length} rows run failed: ${bad.map((r) => r.id).join(', ') || 'none'})`); process.exit(1);
}, 300000).unref();
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { console.log(`FAIL signal — ${sig}`); cleanup(); console.log('LSTART-LOCALE SELFTEST FAIL (signal)'); process.exit(1); });
const lanes = (() => { try { return cib.declaredBands(cib.loadCiBands(), cib.loadLaneBands()); } catch { return []; } })();
const usedWindows = new Set(); // one window per row: a row never lands inside a window an earlier row still holds
const windowAt = async (salt) => {
  for (let t = 0; t < 40; t++) {
    const lo = 44000 + ((((process.pid + salt * 31) % 60) + t * 11) % 60) * 30;
    if (usedWindows.has(lo) || lanes.some((d) => cib.bandsIntersect(d.range ?? d, { start: lo, end: lo + 29 }))) continue;
    let ok = true; for (let p = lo; p <= lo + 29 && ok; p++) ok = await bindable(p);
    if (ok) { usedWindows.add(lo); return lo; }
  }
  throw new Error(`no free 30-port window for salt ${salt}`);
};
// a live stand-in that exits by itself once orphaned (this probe gone without its cleanup)
const standIn = () => { const c = spawn(process.execPath, ['-e', 'setInterval(() => { if (process.ppid === 1) process.exit(0); }, 500)'], { stdio: 'ignore' }); record(c.pid); return c.pid; };
/** a detached python static server (its own group, parented to this probe) on `port`, recorded as a group; it runs with the
 * getfqdn shim, and resolves once the port is listening or its 15 s wait is over (awaitPortState's bound: a probe still in
 * flight then runs to its 3 s timeout). srv.listening is that reading; srv.errTail the end of python's stderr */
const pyServer = async (args, port) => {
  const srv = spawn('python3', ['-m', 'http.server', ...args, String(port)], { stdio: ['ignore', 'ignore', 'pipe'], detached: true, cwd: stage, env: shimEnv(process.env) });
  srv.on('error', () => { /* no python3: the row reads the port and fails by name */ });
  srv.errTail = ''; srv.stderr?.on('data', (c) => { srv.errTail = (srv.errTail + c).slice(-300); });
  if (srv.pid) record(srv.pid, true);
  srv.listening = await awaitPortState(port, 'listening', { boundMs: 15000 });
  return srv;
};
/** a writer process under `loc`: claims B..B+29 and leases `holder` into it, then exits */
const writeUnder = (loc, B, holder) => {
  const src = `const cdp = await import(${JSON.stringify(pathToFileURL(CDP).href)});
const c = await cdp.claimPortBand(${B}, ${B + 29}); cdp.leasePortClaim(c, ${holder}); console.log('DIR ' + c.dir); process.exit(0);`;
  const f = path.join(stage, `writer-${loc.replace(/\W/g, '')}-${B}.mjs`); fs.writeFileSync(f, src);
  const r = spawnSync(process.execPath, [f], { encoding: 'utf8', env: { ...process.env, LC_ALL: loc, LANG: loc }, timeout: 30000 });
  return { dir: (/^DIR (.*)$/m.exec(r.stdout ?? '') ?? [])[1] ?? null, status: r.status, err: (r.stderr ?? '').slice(-300) };
};
const leaseToken = (dir, pid) => { try { return JSON.parse(fs.readFileSync(path.join(dir, `lease-${pid}.json`), 'utf8')).lstart; } catch { return null; } };
// the full refusal text: a row judges WHICH claim and holder refused it, never just that something threw
const claimNow = async (B) => { try { const c = await cdp.claimPortBand(B, B + 29); c.release(); return 'CLAIMED'; } catch (e) { return 'REFUSED: ' + e.message; } };
const refusedBy = (verdict, dir, who) => verdict.startsWith('REFUSED: ') && verdict.includes(`(${dir})`) && verdict.includes(who);
/** a released claim owned by a dead pid, with one lease file for `holder` carrying `token` (planted) */
const plantLease = (B, holder, token) => {
  const dead = spawnSync(process.execPath, ['-e', '0']).pid;
  const d = path.join(REG, `${B}-${B + 29}.${dead}`); fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'owner.json'), JSON.stringify({ pid: dead, lstart: 'Mon Jan  1 00:00:00 2001', at: Date.now() - 60000, released: true, layout: true, enforced: false }));
  fs.writeFileSync(path.join(d, `lease-${holder}.json`), JSON.stringify({ pid: holder, lstart: token, at: Date.now() }));
  return d;
};

try {
  const pid0 = standIn(); await sleep(200);
  const cForm = lstartIn(pid0, 'C'); const fr = lstartIn(pid0, 'fr_FR.UTF-8'); const zh = lstartIn(pid0, 'zh_CN.UTF-8');
  row('LC0', cdp.comparableLstart(cForm) && fr && zh && fr !== cForm && zh !== cForm && !cdp.comparableLstart(fr) && !cdp.comparableLstart(zh),
    'setup: this host localizes ps lstart (fr_FR and zh_CN differ from C and are not C form)', JSON.stringify({ cForm, fr, zh }));
  {
    const B = await windowAt(1); const holder = standIn(); await sleep(200);
    const w = writeUnder('fr_FR.UTF-8', B, holder); const tok = w.dir ? leaseToken(w.dir, holder) : null;
    const B2 = await windowAt(2); const holder2 = standIn(); await sleep(200);
    const w2 = writeUnder('zh_CN.UTF-8', B2, holder2); const tok2 = w2.dir ? leaseToken(w2.dir, holder2) : null;
    row('LC1', tok === lstartIn(holder, 'C') && cdp.comparableLstart(tok) && tok2 === lstartIn(holder2, 'C') && cdp.comparableLstart(tok2),
      'writers under fr_FR.UTF-8 and zh_CN.UTF-8 lease a live stand-in with the C-form token', JSON.stringify({ w, tok, w2, tok2 }));
    const verdict = await claimNow(B); const verdict2 = await claimNow(B2);
    row('LC2', refusedBy(verdict, w.dir, `held by pid ${holder}`) && leaseToken(w.dir, holder) === tok && alive(holder)
      && refusedBy(verdict2, w2.dir, `held by pid ${holder2}`) && leaseToken(w2.dir, holder2) === tok2 && alive(holder2),
      'the fr_FR and zh_CN writers gone, a C-locale scanner finds each stand-in a live holder: refused by it, lease kept, stand-in alive', JSON.stringify({ verdict: verdict.slice(0, 300), verdict2: verdict2.slice(0, 300) }));
  }
  {
    const B = await windowAt(3); const holder = standIn(); await sleep(200);
    const frTok = lstartIn(holder, 'fr_FR.UTF-8'); const d = plantLease(B, holder, frTok);
    const verdict = await claimNow(B);
    row('LC3', refusedBy(verdict, d, `held by pid ${holder}`) && fs.existsSync(path.join(d, `lease-${holder}.json`)) && alive(holder),
      'a lease token in fr_FR form (pre-GH-1143) for a live stand-in is no verdict: refused, lease kept, stand-in alive', JSON.stringify({ frTok, verdict: verdict.slice(0, 300), alive: alive(holder) }));
  }
  {
    const B = await windowAt(4); const holder = standIn(); await sleep(200);
    const d = plantLease(B, holder, 'Mon Jan  1 00:00:00 2001');
    const verdict = await claimNow(B);
    row('LC4', verdict === 'CLAIMED' && !fs.existsSync(d) && alive(holder),
      'a C-form token that does not match the live stand-in is pid reuse: the lease is pruned, the claim swept and the band claimed', JSON.stringify({ verdict, dirLeft: fs.existsSync(d) }));
  }
  // a child that spawns a static server on `port` serving `docroot` (the loopback bind, the shim in the child's env),
  // waits for it to accept, reads the group probe and stops it; the leader is recorded (with its group) so a failure
  // path ends only this run's server
  // (`failFlag`: a file the ps stand-in reads — while it exists every lstart read fails; set only around the probe)
  const serverRun = (tag, docroot, port, env, failFlag = null) => {
    const src = `import net from 'node:net';
import fs from 'node:fs';
const cdp = await import(${JSON.stringify(pathToFileURL(CDP).href)});
const proc = cdp.spawnStaticServer(${JSON.stringify(docroot)}, ${port}, { bind: '127.0.0.1' });
console.log('SPAWNED ' + proc.pid);
for (let i = 0; i < 100; i++) { const ok = await new Promise((r) => { const c = net.connect({ port: ${port}, host: '127.0.0.1' }); c.once('connect', () => { c.destroy(); r(true); }); c.once('error', () => r(false)); }); if (ok) break; await cdp.sleep(100); }
const FLAG = ${JSON.stringify(failFlag)};
if (FLAG) fs.writeFileSync(FLAG, '1');
const verdict = cdp.serverGroupProbe(proc);
if (FLAG) fs.rmSync(FLAG, { force: true });
console.log('PROBE ' + verdict);
let mk = null; try { mk = JSON.parse((await import('node:fs')).readFileSync(cdp.serverMarkerPath(proc.pid), 'utf8')).lstart; } catch { /* unmarked */ }
console.log('MARKER ' + JSON.stringify(mk));
let leader = ''; try { leader = (await import('node:child_process')).execFileSync('ps', ['-o', 'lstart=', '-p', String(proc.pid)], { encoding: 'utf8', env: { ...process.env, LC_ALL: 'C', LANG: 'C' } }).trim(); } catch { /* gone */ }
console.log('LEADER-C ' + JSON.stringify(leader));
const stopped = await cdp.stopStaticServer(proc);
console.log('STOPPED ' + JSON.stringify(stopped)); process.exit(0);`;
    const f = path.join(stage, `server-${tag}.mjs`); fs.writeFileSync(f, src);
    const child = spawnSync(process.execPath, [f], { encoding: 'utf8', env: shimEnv(env), timeout: 60000 });
    const field = (k) => { try { return JSON.parse((new RegExp(`^${k} (.*)$`, 'm').exec(child.stdout ?? '') ?? [])[1] ?? 'null'); } catch { return null; } };
    const marker = field('MARKER'); const leader = field('LEADER-C');
    // a server the child did not confirm stopped is recorded with the child's own reading of the live leader
    const sp = /SPAWNED (\d+)/.exec(child.stdout ?? '');
    if (sp && !/STOPPED true/.test(child.stdout ?? '')) { if (leader) { recorded.set(Number(sp[1]), leader); groups.add(Number(sp[1])); } else record(Number(sp[1]), true); }
    // the marker's recorded birth token must be the C form, equal to the child's own C reading of the live leader
    child.markerOk = cdp.comparableLstart(marker) && marker === leader;
    return child;
  };
  const portAt = async (salt) => (await windowAt(salt)) + 3; // a free window's fourth port
  {
    // LCs: the shim with a trap sitecustomize after it on PYTHONPATH (which it must load first): loopback literals come
    // back as given, untouched by the trap; the wildcards and host names reach the trap, so they reach the original lookup
    const trap = path.join(stage, 'pytrap'); fs.mkdirSync(trap);
    fs.writeFileSync(path.join(trap, 'sitecustomize.py'), 'import socket\nsocket.getfqdn = lambda name="": "TRAP:" + name\n');
    const names = ['127.0.0.1', '127.0.0.53', '::1', '::', '0.0.0.0', 'localhost', 'example.invalid'];
    const r = spawnSync('python3', ['-c', `import socket, json\nprint(json.dumps([socket.getfqdn(n) for n in ${JSON.stringify(names)}]))`],
      { encoding: 'utf8', timeout: 30000, env: shimEnv({ ...process.env, PYTHONPATH: trap }) });
    let got = null; try { got = JSON.parse((r.stdout ?? '').trim()); } catch { /* reported below */ }
    const want = ['127.0.0.1', '127.0.0.53', '::1', 'TRAP:::', 'TRAP:0.0.0.0', 'TRAP:localhost', 'TRAP:example.invalid'];
    row('LCs', JSON.stringify(got) === JSON.stringify(want), 'the getfqdn shim answers a loopback literal address itself and passes the wildcards and host names to the original, after loading the next sitecustomize',
      JSON.stringify({ got, want, status: r.status, err: (r.stderr ?? '').trim().slice(-200) }));
  }
  let hostSig = false;
  {
    // LCp: the server rows' control (see the header), on a free window's port and an empty docroot; ended by its group
    const port = await portAt(18);
    const doc = path.join(stage, 'doc-ctl'); fs.mkdirSync(doc);
    const ctl = await pyServer(['-d', doc, '--bind', '127.0.0.1'], port);
    const st = ctl.listening;
    const running = ctl.exitCode === null && ctl.signalCode === null;
    const sockets = st.ok ? '' : socketsOf(port, ctl.pid); // the control's own group (detached: its pgid is its pid)
    // the hosted signature: the last connect at the bound neither connected nor was refused ('unknown'), and the control's
    // own socket on the port reads (CLOSED), never LISTEN
    hostSig = !st.ok && running && st.last === 'unknown' && /\(CLOSED\)/.test(sockets) && !/\(LISTEN\)/.test(sockets);
    const detail = `:${port} ${st.last} after ${st.probes} probe(s) / ${st.ms} ms${st.ok ? '' : ` sockets [${sockets}]`}${running ? '' : ` control exited ${ctl.signalCode ?? ctl.exitCode}`}`
      + (!st.ok && ctl.errTail.trim() ? ` stderr ${JSON.stringify(ctl.errTail.trim())}` : '');
    if (ctl.pid) { endRecorded(ctl.pid); recorded.delete(ctl.pid); groups.delete(ctl.pid); } // ended: its pid never stands for a later spawn
    row('LCp', st.ok, "the server rows' control: python in their form (-d <dir> --bind 127.0.0.1 <port>), run with the shim, listens within pyServer's 15 s wait" + (st.ok ? ` (${detail})` : ''),
      (hostSig ? `${HOST_SIG} — control ` : '') + detail);
    if (hostSig && IN_ACTIONS) console.log(`::error title=lstart-locale selftest::${HOST_SIG} — control ${detail.slice(0, 300)}`);
  }
  if (hostSig) notRunRow('LC5'); else {
    const port = await portAt(5);
    const r = serverRun('fr', path.resolve(HERE, '..'), port, { ...process.env, LC_ALL: 'fr_FR.UTF-8', LANG: 'fr_FR.UTF-8' });
    await sleep(500);
    const gone = await refused(port);
    row('LC5', port !== null && r.status === 0 && /PROBE ours/.test(r.stdout ?? '') && /STOPPED true/.test(r.stdout ?? '') && gone && r.markerOk,
      'under fr_FR.UTF-8 the group probe reads the live server as ours (its marker token the C reading); stopStaticServer ends it, the port refused afterwards', JSON.stringify({ status: r.status, out: (r.stdout ?? '').slice(-200), err: (r.stderr ?? '').slice(-200), gone }));
  }
  if (hostSig) notRunRow('LC6'); else {
    const port = await portAt(6);
    const doc = path.join(stage, 'doc-é'); fs.mkdirSync(doc); fs.writeFileSync(path.join(doc, 'index.html'), 'é');
    const env = { ...process.env, LANG: 'en_US.UTF-8' }; delete env.LC_ALL; delete env.LC_CTYPE;
    const r = serverRun('utf8', doc, port, env);
    await sleep(500);
    const gone = await refused(port);
    row('LC6', port !== null && r.status === 0 && /PROBE ours/.test(r.stdout ?? '') && /STOPPED true/.test(r.stdout ?? '') && gone && r.markerOk,
      'under en_US.UTF-8 with a non-ASCII docroot (…/doc-é) the group probe reads the live server as ours; stopStaticServer ends it', JSON.stringify({ status: r.status, out: (r.stdout ?? '').slice(-200), err: (r.stderr ?? '').slice(-200), gone }));
  }
  /** a claim owned by `pid` (live), not released, whose owner.json carries `token` written at `at` */
  const plantOwner = (B, pid, token, at) => {
    const d = path.join(REG, `${B}-${B + 29}.${pid}`); fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'owner.json'), JSON.stringify({ pid, lstart: token, at, released: false, layout: true, enforced: false }));
    return d;
  };
  {
    const B = await windowAt(7); const owner = standIn(); await sleep(200);
    const d = plantOwner(B, owner, lstartIn(owner, 'fr_FR.UTF-8'), Date.now());
    const verdict = await claimNow(B);
    row('LC7', refusedBy(verdict, d, `claimant pid ${owner} LIVE`) && fs.existsSync(d) && alive(owner),
      'an owner.json in fr_FR form for a live claimant, written now: live, never pid reuse — refused, the claim kept', JSON.stringify({ verdict, kept: fs.existsSync(d) }));
  }
  {
    const B = await windowAt(8); const owner = standIn(); await sleep(200);
    const d = plantOwner(B, owner, lstartIn(owner, 'fr_FR.UTF-8'), Date.now() - 25 * 3600 * 1000);
    const verdict = await claimNow(B);
    row('LC8', verdict === 'CLAIMED' && !fs.existsSync(d) && alive(owner),
      'the same fr_FR token written 25 h ago is past its grace: read as pid reuse — the claim swept, the band claimed', JSON.stringify({ verdict, kept: fs.existsSync(d) }));
  }
  if (hostSig) notRunRow('LC9'); else {
    const B = await windowAt(9); // the listener on the window's sixth port (windowAt: all 30 bindable, outside every declared band)
    const dead = spawnSync(process.execPath, ['-e', '0']).pid;
    const d = path.join(REG, `${B}-${B + 29}.${dead}`); fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'owner.json'), JSON.stringify({ pid: dead, lstart: 'Mon Jan  1 00:00:00 2001', at: Date.now() - 60000, released: true, layout: true, enforced: false }));
    const srv = await pyServer(['--bind', '127.0.0.1'], B + 5);
    const src = `const cdp = await import(${JSON.stringify(pathToFileURL(CDP).href)});
try { const c = await cdp.claimPortBand(${B}, ${B + 29}); c.release(); console.log('VERDICT CLAIMED'); } catch (e) { console.log('VERDICT REFUSED ' + e.message.split('\\n')[0].slice(0, 160)); }
process.exit(0);`;
    const f = path.join(stage, 'scanner-fr.mjs'); fs.writeFileSync(f, src);
    const r = spawnSync(process.execPath, [f], { encoding: 'utf8', env: { ...process.env, LC_ALL: 'fr_FR.UTF-8', LANG: 'fr_FR.UTF-8' }, timeout: 60000 });
    const leases = (() => { try { return fs.readdirSync(d).filter((n) => /^lease-\d+\.json$/.test(n)).map((n) => JSON.parse(fs.readFileSync(path.join(d, n), 'utf8'))); } catch { return []; } })();
    const disc = leases.find((l) => l.origin === 'discovery');
    // the lease names the planted listener: its pid leads, or sits in, the server's own group
    const pgid = (pid) => { try { return Number(execFileSync('ps', ['-o', 'pgid=', '-p', String(pid)], { encoding: 'utf8' }).trim()); } catch { return null; } };
    row('LC9', /VERDICT REFUSED/.test(r.stdout ?? '') && disc && pgid(disc.pid) === srv.pid && cdp.comparableLstart(disc.lstart) && disc.lstart === lstartIn(disc.pid, 'C'),
      'a scanner under fr_FR.UTF-8 finds the live harness-shaped listener in a dead claim and records a discovery lease with the C-form token — refused', JSON.stringify({ out: (r.stdout ?? '').trim().slice(-200), leases, listening: srv.listening }));
  }
  {
    // LC10: the refusal's full text names the claimant state of a tombstone's recorded claim
    const tomb = async (salt, ageMs) => {
      const B = await windowAt(salt); const owner = standIn(); const ret = standIn(); await sleep(200);
      const d = path.join(REG, `prep-${ret}-reap-${B}-${B + 29}.${owner}`); fs.mkdirSync(d, { recursive: true });
      fs.writeFileSync(path.join(d, 'owner.json'), JSON.stringify({ pid: owner, lstart: lstartIn(owner, 'fr_FR.UTF-8'), at: Date.now() - ageMs, released: false, layout: true, enforced: false }));
      fs.writeFileSync(path.join(d, 'reaper.json'), JSON.stringify({ pid: ret, lstart: lstartIn(ret, 'C'), at: Date.now() }));
      let msg = 'CLAIMED';
      try { const c = await cdp.claimPortBand(B, B + 29); c.release(); } catch (e) { msg = e.message; }
      return { owner, msg, named: (new RegExp(`claimant pid ${owner} (DEAD \\(PID REUSED\\)|DEAD, RELEASED|DEAD|RELEASED|LIVE)(?![\\w(])`).exec(msg) ?? [])[1] ?? null };
    };
    const young = await tomb(10, 0); const old = await tomb(11, 25 * 3600 * 1000);
    row('LC10', young.named === 'LIVE' && old.named === 'DEAD (PID REUSED)',
      'a reap tombstone held by a live retirer names its claimant from the fr_FR token\'s age: LIVE when written now, DEAD (PID REUSED) at 25 h', JSON.stringify({ young: [young.named, young.msg.slice(0, 300)], old: [old.named, old.msg.slice(0, 300)] }));
  }
  const H25 = 25 * 3600 * 1000;
  /** a released claim over B..B+29 whose claimant is a dead pid (nothing else in it) */
  const deadClaim = (B) => {
    const dead = spawnSync(process.execPath, ['-e', '0']).pid;
    const d = path.join(REG, `${B}-${B + 29}.${dead}`); fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'owner.json'), JSON.stringify({ pid: dead, lstart: 'Mon Jan  1 00:00:00 2001', at: Date.now() - 60000, released: true, layout: true, enforced: false }));
    return d;
  };
  {
    // LC11: retirerAlive reads an fr_FR reaper token by its age
    const tomb = async (salt, ageMs) => {
      const B = await windowAt(salt); const ret = standIn(); await sleep(200);
      const dead = spawnSync(process.execPath, ['-e', '0']).pid;
      const d = path.join(REG, `prep-${ret}-reap-${B}-${B + 29}.${dead}`); fs.mkdirSync(d, { recursive: true });
      fs.writeFileSync(path.join(d, 'owner.json'), JSON.stringify({ pid: dead, lstart: 'Mon Jan  1 00:00:00 2001', at: Date.now() - 60000, released: true, layout: true, enforced: false }));
      fs.writeFileSync(path.join(d, 'reaper.json'), JSON.stringify({ pid: ret, lstart: lstartIn(ret, 'fr_FR.UTF-8'), at: Date.now() - ageMs }));
      const verdict = await claimNow(B);
      return { d, verdict, kept: fs.existsSync(d), ret: alive(ret) };
    };
    const young = await tomb(12, 0); const old = await tomb(13, H25);
    row('LC11', young.verdict.startsWith('REFUSED: ') && young.verdict.includes(path.basename(young.d)) && young.kept && young.ret
      && old.verdict === 'CLAIMED' && !old.kept && old.ret,
      'a reap tombstone with an fr_FR retirer token: written now, the retirer is live and the tombstone refuses; at 25 h it reads as pid reuse and is swept', JSON.stringify({ young: { ...young, verdict: young.verdict.slice(0, 300) }, old: { ...old, verdict: old.verdict.slice(0, 300) } }));
  }
  if (hostSig) notRunRow('LC12'); else {
    // LC12: a marker with an fr_FR token over a live, parented server in a dead claim
    const marked = async (salt, ageMs) => {
      const B = await windowAt(salt); deadClaim(B);
      const doc = path.join(stage, `doc-m${salt}`); fs.mkdirSync(doc);
      const srv = await pyServer(['-d', doc, '--bind', '127.0.0.1'], B + 7);
      const mk = path.join(MRK, `obw-e2e-server-${srv.pid}.json`);
      fs.writeFileSync(mk, JSON.stringify({ pid: srv.pid, harnessPid: process.pid, port: String(B + 7), webDir: doc, lstart: lstartIn(srv.pid, 'fr_FR.UTF-8'), at: Date.now() - ageMs }));
      const verdict = await claimNow(B);
      return { verdict: verdict.slice(0, 200), kept: fs.existsSync(mk), up: !(await refused(B + 7)) };
    };
    const young = await marked(14, 0); const old = await marked(15, H25);
    row('LC12', young.kept && young.up && !old.kept && old.up,
      'a marker with an fr_FR token over a live parented server: written now it is kept (no verdict), at 25 h it is pruned; neither server is signalled', JSON.stringify({ young, old }));
  }
  if (hostSig) notRunRow('LC13'); else {
    // LC13: e2e-retry's marker reap under fr_FR, a non-ASCII docroot
    const port = await portAt(16);
    const doc = path.join(stage, 'doc-é2'); fs.mkdirSync(doc); fs.writeFileSync(path.join(doc, 'index.html'), 'é');
    const suite = path.join(stage, 'suite-reap.mjs');
    fs.writeFileSync(suite, `import net from 'node:net';
const cdp = await import(${JSON.stringify(pathToFileURL(CDP).href)});
const proc = cdp.spawnStaticServer(${JSON.stringify(doc)}, ${port}, { bind: '127.0.0.1' });
console.log('SPAWNED ' + process.pid + ' ' + proc.pid);
for (let i = 0; i < 100; i++) { const ok = await new Promise((r) => { const c = net.connect({ port: ${port}, host: '127.0.0.1' }); c.once('connect', () => { c.destroy(); r(true); }); c.once('error', () => r(false)); }); if (ok) break; await cdp.sleep(100); }
for (const s of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.removeAllListeners(s); // die on the signal WITHOUT the suite's own teardown
console.log('SRV ' + proc.pid);
setInterval(() => {}, 1000);
`);
    const retry = spawn(process.execPath, [path.join(path.dirname(CDP), 'e2e-retry.mjs'), '--suite', 'LC13', '--', process.execPath, suite],
      { stdio: ['ignore', 'pipe', 'pipe'], env: shimEnv({ ...process.env, LC_ALL: 'fr_FR.UTF-8', LANG: 'fr_FR.UTF-8' }) });
    record(retry.pid);
    let out = ''; let err = '';
    // each suite and its server, recorded the moment that suite names them (right after its spawn; e2e-retry may run the
    // suite again): a server that never answers is still this probe's to end — cleanup's SIGKILL of e2e-retry alone, at
    // any point, would leave the suite and its server group running
    const named = new Set();
    retry.stdout.on('data', (c) => {
      out += c;
      for (const m of out.matchAll(/^SPAWNED (\d+) (\d+)\n/gm)) if (!named.has(m[0])) { named.add(m[0]); record(Number(m[1])); record(Number(m[2]), true); }
    });
    retry.stderr.on('data', (c) => { err += c; });
    let done = false;
    const closed = new Promise((r) => retry.on('close', (code, signal) => { done = true; r({ code, signal }); }));
    let srvPid = null;
    for (let i = 0; i < 300 && srvPid === null && !done; i++) { const m = /^SRV (\d+)$/m.exec(out); if (m) srvPid = Number(m[1]); else await sleep(100); }
    if (srvPid) record(srvPid, true);
    const mk = srvPid ? path.join(MRK, `obw-e2e-server-${srvPid}.json`) : null;
    const markedBefore = !!mk && fs.existsSync(mk);
    if (srvPid) { try { process.kill(retry.pid, 'SIGTERM'); } catch { /* gone */ } }
    const end = await Promise.race([closed, sleep(30000).then(() => ({ code: 'timeout' }))]);
    await sleep(300);
    const srvGone = srvPid ? lstartIn(srvPid, 'C') !== recorded.get(srvPid) : false;
    const gone = await refused(port);
    row('LC13', srvPid !== null && markedBefore && end.code === 143 && srvGone && gone && !fs.existsSync(mk),
      'e2e-retry under fr_FR.UTF-8, signalled while its suite holds a server on …/doc-é2: the marker reap ends the server group — exit 143, port refused, marker gone', JSON.stringify({ srvPid, markedBefore, end, srvGone, gone, out: out.slice(-200), err: err.slice(-400) }));
  }
  if (hostSig) notRunRow('LC14'); else {
    // LC14: no birth-time reading on the group-signal path is 'unknown'
    const bin = path.join(stage, 'bin'); fs.mkdirSync(bin);
    const flag = path.join(stage, 'ps-fail-lstart');
    fs.writeFileSync(path.join(bin, 'ps'), `#!/bin/sh\ncase "$*" in *lstart=*) [ -e '${flag}' ] && exit 1;; esac\nexec /bin/ps "$@"\n`, { mode: 0o755 });
    const port = await portAt(17);
    const r = serverRun('nolstart', path.resolve(HERE, '..'), port, { ...process.env, PATH: `${bin}:${process.env.PATH}` }, flag);
    await sleep(500);
    const gone = await refused(port);
    row('LC14', r.status === 0 && /PROBE unknown/.test(r.stdout ?? '') && /STOPPED true/.test(r.stdout ?? '') && gone && r.markerOk,
      'the group probe with the leader\'s birth-time read failing reads unknown (never ours); with the read back the server is stopped', JSON.stringify({ status: r.status, out: (r.stdout ?? '').slice(-200), err: (r.stderr ?? '').slice(-200), gone }));
  }
} catch (e) {
  row('X', false, 'probe exception', e.stack ?? e.message);
} finally {
  cleanup();
}
const bad = rows.filter((r) => !r.ok);
const sigNote = notRun.length ? `; ${HOST_SIG}; NOT RUN: ${notRun.join(', ')}` : '';
console.log(bad.length ? `LSTART-LOCALE SELFTEST FAIL (${bad.length} of ${rows.length}: ${bad.map((r) => r.id).join(', ')}${sigNote})` : `LSTART-LOCALE SELFTEST PASS (${rows.length})`);
process.exit(bad.length ? 1 : 0);
