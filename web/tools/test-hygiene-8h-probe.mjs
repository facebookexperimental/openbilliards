// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-hygiene-8h-probe.mjs — #763: e2e-harness-hygiene's arm-8h probe, run on its own with its test seams, proves
// that its port checks treat a connect that times out as no verdict. The probe text is read from the suite file and
// built as the suite builds it (the arm's WEB_DIR, a 90-port window picked the arm's way); it runs with the arm's env
// (a private registry and marker dir) plus a PRIVATE band mutex port (the GH-1119 OB_BAND_MUTEX_PORT seam), so its
// claims never hold the host-wide :47997 that live lanes and CI queue on. Plain node, no browser. Every server here is the probe's own; the probe kills
// what it started, and this file kills a left listener on the window only when its command line names this run's
// docroots (the stage dir, or the web dir with the port).
//
//   H0 setup: the probe text is found once in the suite and parses
//   H0m the env every probe run gets resolves, in a child of its own, to the private band mutex port (never 47997)
//   H0s the getfqdn shim (below) answers a loopback literal address itself and passes every other name to the original:
//      the wildcard addresses '::' and '0.0.0.0', host names, and any sitecustomize later on the path still loads
//   H0p a python control in the fixtures' form (spawnStaticServer's bind form: -d <dir> --bind 127.0.0.1 <port>), run with
//      the shim, listens within the fixtures' 15 s bound. The hosted macOS signature (#763) is a NAMED FAIL: the last connect at the bound
//      neither connected nor was refused (port-state's 'unknown': a timeout or any error other than ECONNREFUSED; on the
//      hosted runner it timed out), the control is still running, and lsof, run cleanly and scoped to the control's own
//      process group (#1189), lists its socket on the port as (CLOSED) and never LISTEN — bound and not listening, a
//      socket macOS drops a SYN to. H0p then FAILS with HOST SIGNATURE and the
//      control's sockets (a GitHub error in Actions), the verdict line names it and the run exits 1; H1, H2 and H2s,
//      whose fixtures start python the same way, print NOT RUN and change nothing. There is no skip path (owner CI
//      decision D1, 10-13): a recurrence on main is classified in the known-flakes registry, never in this file.
//      Anything else that keeps the control from listening (python3 absent or exited, a port read refused, lsof missing
//      or failing, a LISTENING socket the probe cannot reach) also FAILS H0p, unnamed, and H1, H2 and H2s run. An INFO
//      line prints how long the lookups take that http.server's server_bind can run between bind and listen
//      (socket.getfqdn per bind host, and the host's own name), timed by the interpreter the fixtures run, RAW (without
//      the shim): on the hosted macOS image socket.getfqdn('127.0.0.1') took 35 s (batch 8's main push run)
//   H0n #1189, macOS: the host-signature name attaches only to the control group's own socket. A control that runs and
//      never binds, with ANOTHER process group's socket bound and not listening on its port number: the connect still
//      reads 'unknown', but the scoped socket list is empty and the name is not given (the unscoped `lsof -iTCP:<port>`
//      listed that foreign (CLOSED) row and named it)
//   H0c #1189 control, macOS: the control group's own socket bound and not listening on the port IS the signature: named
//
// The getfqdn shim (#763 hosted macOS): http.server's server_bind calls socket.getfqdn(<bind host>) between bind and
// listen, so where the host's reverse lookup of 127.0.0.1 is slow (35 s on the hosted macOS image) every python fixture
// sits bound and not listening past the probe's bounds. What this file tests is arm 8h's probe, not the host's resolver:
// every python it starts (the probe runs' fixtures, through probeEnv, and the H0p control) gets a sitecustomize, written
// by this file into its own temp dir and put first on PYTHONPATH, that answers socket.getfqdn for a LOOPBACK literal
// address with the address itself and passes every other name to the original (after loading any other sitecustomize
// on the path). It never reaches a production server or another suite's python; the fixtures' command lines are
// unchanged. A wildcard bind ('::', '0.0.0.0') still pays its lookup in a fixture python started here (a server that
// spawnStaticServer starts carries cdp.mjs's own #1228 shim, which answers it), so a fixture whose loopback bind is reverted
// stays red under a slow resolver.
//   H1 OB_8H_PROBE_STALL_MS=600 (the measured race: the probe's process blocked while each connect completes):
//      every leg passes, the setup rows (r2s, r4s) included — a listening fixture is read as listening, and the
//      teardowns are still judged (r2a, r4: the port is SEEN refused)
//   H2 the same stall with OB_8H_R4_FIXTURE=escape (the fixture's server leaves the tree: its own session,
//      reparented before any snapshot, so run-gate cannot end it): r4's setup passes and r4 stays RED with the port
//      still listening after the teardown
//   H3 OB_8H_R4_FIXTURE=none (nothing listens): r4's setup row FAILS by name and r4 reports NOT JUDGED (a red)
//   H2s H2 with the arm's WEB_DIR reached through a path with a SPACE (a symlink): the escape fixture still starts its
//      server (one argument, no shell), r4's setup passes and r4 stays RED
//
//   node web/tools/test-hygiene-8h-probe.mjs                 # exit 0/1; last line PASS (n) / FAIL (k of n[; HOST SIGNATURE …])
//   OB_HYGIENE_8H_SUITE=<copy>/web/tools/e2e-harness-hygiene.mjs node ...   # judge a plant copy
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SUITE = path.resolve(process.env.OB_HYGIENE_8H_SUITE || path.join(HERE, 'e2e-harness-hygiene.mjs'));
const WEB_DIR = path.resolve(path.dirname(SUITE), '..');
const rows = [];
const row = (id, ok, desc, detail = '') => { rows.push({ id, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${id} — ${desc}${ok ? '' : `: ${String(detail).slice(0, 900)}`}`); };
const HOST_SIG = "HOST SIGNATURE (#763 hosted macOS): python's listener never reached LISTEN on this host";
const SHIM_PY = [
  '# test-hygiene-8h-probe (#763 hosted macOS): socket.getfqdn answers a loopback literal address itself; every other',
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
const SHIM_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'obw-test-8h-shim-'));
fs.writeFileSync(path.join(SHIM_DIR, 'sitecustomize.py'), SHIM_PY);
/** `env` with the shim first on PYTHONPATH: for the pythons this file starts, and only those */
const shimEnv = (env) => ({ ...env, PYTHONPATH: env.PYTHONPATH ? SHIM_DIR + path.delimiter + env.PYTHONPATH : SHIM_DIR });
const notRun = [];
/** a row the host signature keeps from running: printed by name, never a PASS; H0p's FAIL carries the red */
const notRunRow = (id, desc) => { notRun.push(id); console.log(`NOT RUN ${id} — ${desc}: the host signature (H0p)`); };
const bindable = (port) => new Promise((r) => { const s = net.createServer(); s.once('error', () => r(false)); s.listen(port, '127.0.0.1', () => s.close(() => r(true))); });
const { portState, awaitPortState } = await import(pathToFileURL(path.join(WEB_DIR, 'tools', 'lib', 'port-state.mjs')).href);
/** the TCP sockets of one process group (`pgid`: a detached spawn's own pid) whose LOCAL port is `port`, as '<command> <pid>
 * <address> (<state>)'; 'none', or 'lsof <status>' when lsof failed (it exits 1 with nothing to list, and also after a warning
 * with rows listed, so its stdout is read then). #1189: `lsof -iTCP:<port>` alone matches every socket whose local OR remote
 * port has that number, so another process's connection could stand in for the control's; the group scope is e2e-retry B6's
 * (-a -g <pid> -iTCP). With -g, lsof adds a PGID column after PID */
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
/** the hosted signature (#763): the last connect at the bound neither connected nor was refused (port-state's 'unknown': a
 * timeout or any error other than ECONNREFUSED; on the hosted runner a timeout), the control still runs, and its own group's
 * socket on the port reads (CLOSED), never LISTEN — bound, not listening */
const hostSignature = ({ ok, exited, last, sockets }) => !ok && !exited && last === 'unknown' && /\(CLOSED\)/.test(sockets) && !/\(LISTEN\)/.test(sockets);
/** H0p: the python control (see the header), on a free port and an empty docroot; ended by its process group */
const pyControl = async () => {
  const port = await new Promise((r) => { const s = net.createServer(); s.once('error', () => r(null)); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
  if (port === null) return { up: false, hostSig: false, detail: 'no free port' };
  const doc = fs.mkdtempSync(path.join(os.tmpdir(), 'obw-test-8h-ctl-'));
  const cp = spawn('python3', ['-m', 'http.server', '-d', doc, '--bind', '127.0.0.1', String(port)], { stdio: ['ignore', 'ignore', 'pipe'], detached: true, env: shimEnv(process.env) });
  let err = '';
  cp.stderr.on('data', (c) => { err = (err + c).slice(-300); });
  cp.once('error', (e) => { err += `spawn ${e.code}`; });
  let exit = null;
  const closed = new Promise((r) => cp.once('close', (code, sig) => { exit = sig ?? code; r(); }));
  try {
    const st = await awaitPortState(port, 'listening', { boundMs: 15000 });
    const sockets = st.ok ? '' : socketsOf(port, cp.pid); // the control's own group (detached: its pgid is its pid)
    const hostSig = hostSignature({ ok: st.ok, exited: exit !== null, last: st.last, sockets });
    return { up: st.ok, hostSig,
      detail: `:${port} ${st.last} after ${st.probes} probe(s) / ${st.ms} ms${st.ok ? '' : ` sockets [${sockets}]`}${exit === null ? '' : ` control exited ${exit}`}${err.trim() ? ` stderr ${JSON.stringify(err.trim())}` : ''}` };
  } finally {
    if (Number.isInteger(cp.pid) && exit === null) { try { process.kill(-cp.pid, 'SIGKILL'); } catch { /* gone */ } }
    await Promise.race([closed, new Promise((r) => setTimeout(r, 3000))]);
    fs.rmSync(doc, { recursive: true, force: true });
  }
};
/** H0s: the shim with a trap sitecustomize after it on PYTHONPATH (which it must load first): loopback literals come back
 * as given, untouched by the trap; the wildcards and host names reach the trap, so they reach the original lookup */
const shimCheck = () => {
  const trap = fs.mkdtempSync(path.join(os.tmpdir(), 'obw-test-8h-trap-'));
  try {
    fs.writeFileSync(path.join(trap, 'sitecustomize.py'), 'import socket\nsocket.getfqdn = lambda name="": "TRAP:" + name\n');
    const names = ['127.0.0.1', '127.0.0.53', '::1', '::', '0.0.0.0', 'localhost', 'example.invalid'];
    const r = spawnSync('python3', ['-c', `import socket, json\nprint(json.dumps([socket.getfqdn(n) for n in ${JSON.stringify(names)}]))`],
      { encoding: 'utf8', timeout: 30000, env: shimEnv({ ...process.env, PYTHONPATH: trap }) });
    let got = null; try { got = JSON.parse((r.stdout ?? '').trim()); } catch { /* reported below */ }
    const want = ['127.0.0.1', '127.0.0.53', '::1', 'TRAP:::', 'TRAP:0.0.0.0', 'TRAP:localhost', 'TRAP:example.invalid'];
    return { ok: JSON.stringify(got) === JSON.stringify(want), detail: JSON.stringify({ got, want, status: r.status, err: (r.stderr ?? '').trim().slice(-200) }) };
  } finally { fs.rmSync(trap, { recursive: true, force: true }); }
};
/** the lookups server_bind can run between bind and listen, timed by the interpreter the fixtures run, RAW (this file's
 * env, without the shim): socket.getfqdn per bind host (its wildcard mapping differs by python version), and
 * gethostbyaddr(gethostname()), the host's own name */
const fqdnInfo = () => {
  const py = "import socket, sys, time\nprint(sys.version.split()[0], sys.executable, flush=True)\n"
    + "def t(label, f):\n    t0 = time.time()\n    try:\n        f()\n    except OSError:\n        pass\n    print(label, round((time.time() - t0) * 1000), flush=True)\n"
    + "for h in ('127.0.0.1', '::', '0.0.0.0'):\n    t(h, lambda h=h: socket.getfqdn(h))\nt('own', lambda: socket.gethostbyaddr(socket.gethostname()))";
  const r = spawnSync('python3', ['-c', py], { encoding: 'utf8', timeout: 90000 });
  const [head = '', ...lines] = (r.stdout ?? '').trim().split('\n');
  const ms = Object.fromEntries(lines.map((l) => l.split(' ')));
  const at = (h) => (h in ms ? `${ms[h]} ms` : r.error?.code === 'ETIMEDOUT' ? 'not reached (cut at 90000 ms in all)'
    : `not measured (rc ${r.status ?? r.error?.code}${r.stderr?.trim() ? ` ${JSON.stringify(r.stderr.trim().slice(-200))}` : ''})`);
  return `python3 ${head || '(no output)'}; socket.getfqdn: '127.0.0.1' ${at('127.0.0.1')}, '::' ${at('::')}, '0.0.0.0' ${at('0.0.0.0')}; `
    + `gethostbyaddr(gethostname()) ${at('own')}`;
};
const cib = await import(pathToFileURL(path.join(WEB_DIR, 'tools', 'lib', 'ci-bands.mjs')).href);
const lanes = (() => { try { return cib.declaredBands(cib.loadCiBands(), cib.loadLaneBands()); } catch { return []; } })();
setTimeout(() => { console.log('FAIL watchdog — the probe exceeded 600 s'); console.log('HYGIENE-8H-PROBE SELFTEST FAIL (watchdog)'); process.exit(1); }, 600000).unref();

// the probe text: the template literal the suite writes to probe.mjs, evaluated with the arm's two substitutions
const text = fs.readFileSync(SUITE, 'utf8');
const open = "    fs.writeFileSync(probe, `\nimport fs from 'node:fs'; import path from 'node:path'; import { spawn, spawnSync, execFileSync }";
const a = text.indexOf(open); const b = text.indexOf('process.exit(0); // every leg has reported', a); const c = b < 0 ? -1 : text.indexOf('`);', b);
const once = a >= 0 && text.indexOf(open, a + 1) < 0 && b > a && c > b;
const tpl = once ? text.slice(a + '    fs.writeFileSync(probe, `'.length, c) : null;

/** a 90-port window in 54000-62970 (the arm's range), outside every declared band, every port refused and bindable */
const pickWindow = async (salt) => {
  for (let t = 0; t < 12; t++) {
    const lo = 54000 + ((((process.pid + salt * 13) % 300) + t * 37) % 300) * 30;
    if (lanes.some((d) => cib.bandsIntersect(d.range ?? d, { start: lo, end: lo + 89 }))) continue;
    let ok = true; for (let p = lo; p <= lo + 89 && ok; p++) ok = (await bindable(p)) && (await portState(p, { timeoutMs: 1000 })) === 'refused';
    if (ok) return lo;
  }
  return null;
};
// the private band mutex port every probe run arbitrates its private registry on (GH-1119; 38800-38889)
const MUTEX = 38800 + (process.pid % 90);
/** the env of one probe run: the arm's (a private registry and marker dir) + the private mutex + `seams` */
const probeEnv = (stage, REG, MRK, seams) => {
  const env = { ...process.env, OB_PORT_BANDS: '', OB_PORT_BANDS_DIR: REG, OB_SERVER_MARKER_DIR: MRK, OB_8H_STAGE: stage, OB_BAND_MUTEX_PORT: String(MUTEX), ...seams };
  for (const k of ['GITHUB_ACTIONS', 'OB_CI_BANDS', 'CI', 'OB_E2E_PORT', 'OB_E2E_CDP_PORT', 'OB_CDP_PORT', 'OB_PACING_BASELINE', 'OB_RUN_GATE_DEADLINE_S']) delete env[k];
  for (const k of ['OB_8H_PROBE_STALL_MS', 'OB_8H_R4_FIXTURE']) if (!(k in seams)) delete env[k];
  return shimEnv(env);
};
/** run the probe once with `seams`, built over `web` (the arm's WEB_DIR, or a path that reaches it);
 * resolves { legs: { r1a: {ok, detail}, … }, status, stderrTail } */
const runProbe = async (seams, salt, web = WEB_DIR) => {
  const B = await pickWindow(salt);
  if (B === null) return { legs: {}, status: 'no window' };
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'obw-test-8h-'));
  const REG = path.join(stage, 'reg'); const MRK = path.join(stage, 'mrk'); fs.mkdirSync(REG); fs.mkdirSync(MRK);
  const probe = path.join(stage, 'probe.mjs');
  fs.writeFileSync(probe, new Function('WEB_DIR', 'B', 'return `' + tpl + '`;')(web, B));
  const env = probeEnv(stage, REG, MRK, seams);
  const run = spawnSync(process.execPath, [probe], { encoding: 'utf8', timeout: 240000, env, cwd: web });
  const legs = Object.fromEntries((run.stdout ?? '').split('\n').filter((l) => l.startsWith('RES ')).map((l) => { const j = JSON.parse(l.slice(4)); return [j.leg, j]; }));
  // a left listener on the window is this run's (the probe's servers serve the window's docroots): end it by command line
  for (let p = B; p <= B + 89; p++) {
    if ((await portState(p, { timeoutMs: 1000 })) === 'refused') continue;
    try {
      for (const l of execFileSync('ps', ['-axo', 'pid=,command='], { encoding: 'utf8' }).split('\n')) {
        const m = /^\s*(\d+)\s+(.*)$/.exec(l);
        if (m && m[2].includes('http.server') && m[2].endsWith(' ' + p) && (m[2].includes(stage) || m[2].includes('http.server -d ' + web + ' ' + p) || m[2].includes('http.server -d ' + web + ' --bind 127.0.0.1 ' + p))) process.kill(Number(m[1]), 'SIGKILL');
      }
    } catch { /* raced */ }
  }
  fs.rmSync(stage, { recursive: true, force: true });
  return { legs, status: run.status, signal: run.signal, stderrTail: (run.stderr ?? '').slice(-400) };
};
const brief = (r) => JSON.stringify({ status: r.status, legs: Object.fromEntries(Object.entries(r.legs).map(([k, v]) => [k, v.ok ? 'ok' : `FAIL ${v.detail}`])), stderr: r.stderrTail });

try {
  let parses = false;
  if (once) { const tmp = path.join(os.tmpdir(), `obw-test-8h-check-${process.pid}.mjs`); fs.writeFileSync(tmp, new Function('WEB_DIR', 'B', 'return `' + tpl + '`;')(WEB_DIR, 54000)); parses = spawnSync(process.execPath, ['--check', tmp]).status === 0; fs.rmSync(tmp, { force: true }); }
  row('H0', once && parses, 'setup: the arm-8h probe text is found once in the suite and parses', JSON.stringify({ found: a >= 0, once, parses }));
  {
    // the env a probe run gets, read back by cdp.mjs in a child of its own: the seam must take it (private registry,
    // no CI key) and resolve to the private port — a run that fell back to the host-wide :47997 is red here
    const st = fs.mkdtempSync(path.join(os.tmpdir(), 'obw-test-8h-mutex-'));
    const R = path.join(st, 'reg'); const M = path.join(st, 'mrk'); fs.mkdirSync(R); fs.mkdirSync(M);
    const k = spawnSync(process.execPath, ['--input-type=module', '-e', `const m = await import(${JSON.stringify(pathToFileURL(path.join(WEB_DIR, 'tools', 'cdp.mjs')).href)}); console.log('MUTEX ' + m.BAND_MUTEX_PORT);`], { encoding: 'utf8', env: probeEnv(st, R, M, {}), timeout: 60000 });
    fs.rmSync(st, { recursive: true, force: true });
    const got = Number((/^MUTEX (\d+)$/m.exec(k.stdout ?? '') ?? [])[1]);
    row('H0m', got === MUTEX && got !== 47997, `every probe run arbitrates its private registry on the private band mutex :${MUTEX}, never the host-wide :47997`, JSON.stringify({ got, status: k.status, err: (k.stderr ?? '').slice(-300) }));
  }
  if (once && parses) {
    const sc = shimCheck();
    row('H0s', sc.ok, "the getfqdn shim answers a loopback literal address itself and passes the wildcards and host names to the original, after loading the next sitecustomize", sc.detail);
    const ctl = await pyControl();
    console.log(`INFO H0p — raw (without the shim): ${fqdnInfo()}`);
    const D0p = "a python control in the fixtures' form (-d <dir> --bind 127.0.0.1 <port>), run with the shim, listens within 15 s";
    const hostSig = !ctl.up && ctl.hostSig;
    row('H0p', ctl.up, D0p + (ctl.up ? ` (${ctl.detail})` : ''), (hostSig ? `${HOST_SIG} — control ` : '') + ctl.detail);
    if (hostSig && process.env.GITHUB_ACTIONS) console.log(`::error title=hygiene arm-8h probe selftest::${HOST_SIG} — control ${ctl.detail.slice(0, 300)}`);
    // H0n / H0c (#1189): the host-signature name attaches only to the control group's own socket
    if (process.platform !== 'darwin') console.log(`NOT RUN H0n, H0c — a connect to a bound socket that is not listening is refused on ${process.platform}, so 'unknown' (and the name) is macOS's`);
    else {
      const BIND_PY = 'import socket, sys, time\ns = socket.socket()\ns.bind(("127.0.0.1", int(sys.argv[1])))\nprint("BOUND", flush=True)\ntime.sleep(60)\n';
      const namingCase = async (own) => {
        const port = await new Promise((r) => { const v = net.createServer(); v.once('error', () => r(null)); v.listen(0, '127.0.0.1', () => { const q = v.address().port; v.close(() => r(q)); }); });
        if (port === null) return { bound: false, detail: 'no free port' };
        const binder = spawn('python3', ['-c', BIND_PY, String(port)], { stdio: ['ignore', 'pipe', 'ignore'], detached: true });
        const control = own ? binder : spawn('python3', ['-c', 'import time; time.sleep(60)'], { stdio: 'ignore', detached: true });
        try {
          const bound = await new Promise((r) => { let o = ''; binder.stdout.on('data', (d) => { o += d; if (o.includes('BOUND')) r(true); }); binder.once('exit', () => r(false)); setTimeout(() => r(false), 15000); });
          const st = await awaitPortState(port, 'listening', { boundMs: 3000 });
          const sockets = socketsOf(port, control.pid);
          let unscoped = ''; try { unscoped = execFileSync('lsof', ['-nP', '-iTCP:' + port], { encoding: 'utf8', timeout: 5000 }).trim().split('\n').slice(1).join(' | '); } catch (e) { unscoped = String(e.stdout ?? '').trim(); }
          return { bound, last: st.last, sockets, unscoped, named: hostSignature({ ok: st.ok, exited: false, last: st.last, sockets }) };
        } finally {
          for (const c of new Set([binder, control])) { if (Number.isInteger(c.pid)) { try { process.kill(-c.pid, 'SIGKILL'); } catch { /* gone */ } } }
        }
      };
      const n = await namingCase(false);
      row('H0n', n.bound && n.last === 'unknown' && n.sockets === 'none' && !n.named && /\(CLOSED\)/.test(n.unscoped),
        "a running control that never binds, with another group's socket bound and not listening on its port number: 'unknown', an empty scoped socket list, and no host-signature name (the unscoped lsof lists that (CLOSED) row)",
        JSON.stringify(n));
      const c = await namingCase(true);
      row('H0c', c.bound && c.last === 'unknown' && /\(CLOSED\)/.test(c.sockets) && c.named,
        "control: the control group's own socket bound and not listening on the port is the signature, named", JSON.stringify(c));
    }
    const D1 = 'under the 600 ms race every leg passes, the setup rows included: a listening fixture reads as listening and the teardowns are still judged';
    const D2 = 'a fixture server that escapes the tree (its own session, reparented before any snapshot): r4 setup passes and r4 stays RED with the port still listening';
    const D2s = "H2 over a path with a space ('web dir'): the escape fixture still starts its server, r4 setup passes and r4 stays RED";
    if (hostSig) { notRunRow('H1', D1); notRunRow('H2', D2); } else {
      const h1 = await runProbe({ OB_8H_PROBE_STALL_MS: '600' }, 1);
      const want1 = ['r1a', 'r1b', 'r2s', 'r2a', 'r2b', 'r3a', 'r3b', 'r3c', 'r3d', 'r3e', 'r4s', 'r4'];
      row('H1', want1.every((k) => h1.legs[k]?.ok), D1, brief(h1));
      const h2 = await runProbe({ OB_8H_PROBE_STALL_MS: '600', OB_8H_R4_FIXTURE: 'escape' }, 2);
      row('H2', h2.legs.r4s?.ok === true && h2.legs.r4?.ok === false && /after=1 \(listening after/.test(h2.legs.r4?.detail ?? ''), D2, brief(h2));
    }
    const h3 = await runProbe({ OB_8H_R4_FIXTURE: 'none' }, 3);
    row('H3', h3.legs.r4s?.ok === false && h3.legs.r4?.ok === false && /^NOT JUDGED: the setup failed \(8h \(r4\) setup\)/.test(h3.legs.r4?.detail ?? ''),
      'a fixture that never listens: r4 setup FAILS by name and r4 reports NOT JUDGED', brief(h3));
    // a checkout path with a space: the same escape scenario over a symlink named 'web dir'
    if (hostSig) notRunRow('H2s', D2s); else {
      const sp = fs.mkdtempSync(path.join(os.tmpdir(), 'obw-test-8h-sp-')); const spaced = path.join(sp, 'web dir');
      fs.symlinkSync(WEB_DIR, spaced);
      try {
        const h2s = await runProbe({ OB_8H_PROBE_STALL_MS: '600', OB_8H_R4_FIXTURE: 'escape' }, 4, spaced);
        row('H2s', h2s.legs.r4s?.ok === true && h2s.legs.r4?.ok === false && /after=1 \(listening after/.test(h2s.legs.r4?.detail ?? ''), D2s, brief(h2s));
      } finally { fs.rmSync(sp, { recursive: true, force: true }); }
    }
  }
} catch (e) {
  row('X', false, 'probe exception', e.stack ?? e.message);
}
fs.rmSync(SHIM_DIR, { recursive: true, force: true });
const bad = rows.filter((r) => !r.ok);
const sigNote = notRun.length ? `; ${HOST_SIG}; NOT RUN: ${notRun.join(', ')}` : '';
console.log(bad.length ? `HYGIENE-8H-PROBE SELFTEST FAIL (${bad.length} of ${rows.length}: ${bad.map((r) => r.id).join(', ')}${sigNote})` : `HYGIENE-8H-PROBE SELFTEST PASS (${rows.length})`);
process.exit(bad.length ? 1 : 0);
