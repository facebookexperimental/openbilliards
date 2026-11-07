// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-static-server-fqdn.mjs — #1228: the static server every browser gate serves through (cdp.mjs spawnStaticServer,
// `python3 -m http.server`) answers socket.getfqdn for its bind host without a lookup. Python's HTTPServer.server_bind
// calls getfqdn between bind() and listen(), so a host whose own name does not resolve promptly kept the server bound
// and not listening, and the served-tree preflight starved. Plain node, no browser. A trap sitecustomize on PYTHONPATH
// stands in for that host: its getfqdn sleeps 5 s, then answers without a lookup (gethostname() for the wildcard names,
// the name itself otherwise), so a slow resolver on the host running this probe adds nothing. Private registry, marker
// dir and registry mutex port (the OB_PORT_BANDS_DIR / OB_SERVER_MARKER_DIR / OB_BAND_MUTEX_PORT seams); ports from a
// 30-port window outside every declared band, verified bindable. Every server here is this probe's: spawnStaticServer's
// are ended through stopStaticServer, the bare control's group by its recorded pid.
//
//   F0 control: under the trap, python's own socket.getfqdn('::') takes at least 4 s (the trap is a slow host)
//   F1 under the trap, spawnStaticServer(<dir>, port) with the default bind accepts a connection within 3.5 s and serves
//      a file (200, its bytes): the shim answered '::' without the lookup
//   F2 the same with { bind: '127.0.0.1' }: a loopback literal is answered without the lookup
//   F3 the bind is unchanged: F1's server and a bare `python3 -m http.server -d <dir> <port>` listen on the same address
//      form (lsof's type and name, the port aside; at least one row on the port, so a missing lsof is no pass). The bare
//      control's own getfqdn is a stub that answers without a lookup, so a slow host name cannot keep it from listening
//   F4 the command line is unchanged: it ends in `-m http.server -d <dir> <port>`, the form the sweeps match, and
//      carries nothing else of the shim
//   F5 the shim, with a recording sitecustomize after it on PYTHONPATH (which it loads first): '::', '0.0.0.0' and ''
//      answer gethostname(), '127.0.0.1' and '::1' answer themselves, and a host name reaches the next getfqdn
//   F5b a caller's own chaining shim on PYTHONPATH (the selftests' shape: it loads "the first other" sitecustomize, then
//      wraps getfqdn), after this shim (spawnStaticServer's order) and before it: python starts without a sitecustomize
//      error (the two used to load each other until RecursionError, and neither patch applied), the wildcard still
//      answers gethostname() and a host name reaches the caller's getfqdn
//   F5c a caller's sitecustomize on PYTHONPATH that raises: its error is printed once, in site's wording, and the shim's
//      answer is still installed (socket.getfqdn is the shim's, and '::' answers gethostname())
//   F6 #1229, macOS only (a connect to a socket that is bound but not listening times out there; elsewhere it is
//      refused, and F6 prints NOT RUN): waitForHttpReadiness against a dual-stack socket bound to '::' and never
//      listening (OB_CDP_PREFLIGHT_MS=4000) fails with the starved diagnosis worded from what it saw: timeouts, not
//      refusals, a server that has not reached listen() among the causes, never "accepted connections"; the phrases
//      e2e-retry and tools/render match ('no HTTP answer arrived', 'I/O-STARVED host', 'NOT a tree verdict') stay
//   F7 the server listens with a backlog of 128, not socketserver's default 5: a recording sitecustomize after the shim
//      on PYTHONPATH logs each listen() backlog of spawnStaticServer's server, which also serves the file. On macOS 27.2
//      two fresh browsers booting at once overflowed a backlog of 5, and the overflowed connections came back as resets
//
//   node web/tools/test-static-server-fqdn.mjs     # exit 0/1; last line STATIC-SERVER-FQDN SELFTEST PASS (n) / FAIL (k of n: ids)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'ob-static-server-fqdn-'));
const REG = path.join(stage, 'reg'); const MRK = path.join(stage, 'mrk');
for (const d of [REG, MRK]) fs.mkdirSync(d);
for (const k of ['GITHUB_ACTIONS', 'OB_CI_BANDS', 'CI', 'OB_PORT_BANDS']) delete process.env[k];
const CALLER_PYTHONPATH = process.env.PYTHONPATH;
Object.assign(process.env, { OB_PORT_BANDS_DIR: REG, OB_SERVER_MARKER_DIR: MRK, OB_BAND_MUTEX_PORT: String(38000 + ((process.pid + 650) % 900)) });
const cdp = await import(pathToFileURL(path.join(HERE, 'cdp.mjs')).href); // the seams above are read at import
const cib = await import(pathToFileURL(path.join(HERE, 'lib', 'ci-bands.mjs')).href);

const rows = [];
const row = (id, ok, desc, detail = '') => { rows.push({ id, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${id} — ${desc}${ok ? '' : `: ${String(detail).slice(0, 700)}`}`); };

const DOC = path.join(stage, 'doc'); fs.mkdirSync(DOC);
const BYTES = `static-server-fqdn ${process.pid} ${Date.now()}\n`;
fs.writeFileSync(path.join(DOC, 'probe.txt'), BYTES);
const TRAP = path.join(stage, 'trap'); fs.mkdirSync(TRAP); // a host whose own name does not resolve promptly
fs.writeFileSync(path.join(TRAP, 'sitecustomize.py'), ['import socket, time', 'def getfqdn(name=""):', '    time.sleep(5)',
  '    return socket.gethostname() if name.strip() in ("", "0.0.0.0", "::") else name', 'socket.getfqdn = getfqdn', ''].join('\n'));
const NEXT = path.join(stage, 'next'); fs.mkdirSync(NEXT); // records what reaches the next getfqdn
fs.writeFileSync(path.join(NEXT, 'sitecustomize.py'), 'import socket\nsocket.getfqdn = lambda name="": "NEXT:" + name\n');
const CHAIN = path.join(stage, 'chain'); fs.mkdirSync(CHAIN); // a caller's chaining shim, in the selftests' shape (it answers
// '*.invalid' itself and passes every other name on)
fs.writeFileSync(path.join(CHAIN, 'sitecustomize.py'), ['import importlib.util, os, socket, sys', '_here = os.path.dirname(os.path.abspath(__file__))',
  'for _d in sys.path:', '    _f = os.path.join(_d or os.curdir, "sitecustomize.py")',
  '    if os.path.abspath(_d or os.curdir) != _here and os.path.isfile(_f):',
  '        _spec = importlib.util.spec_from_file_location("_next_sitecustomize", _f)',
  '        _spec.loader.exec_module(importlib.util.module_from_spec(_spec))', '        break',
  '_orig = socket.getfqdn', 'def getfqdn(name=""):', '    return "CHAIN:" + name if name.endswith(".invalid") else _orig(name)',
  'socket.getfqdn = getfqdn', ''].join('\n'));

const bindable = (port) => new Promise((res) => { const s = net.createServer(); s.once('error', () => res(false)); s.listen(port, '127.0.0.1', () => s.close(() => res(true))); });
const lanes = (() => { try { return cib.declaredBands(cib.loadCiBands(), cib.loadLaneBands()); } catch { return []; } })();
let LO = null;
for (let t = 0; t < 40 && LO === null; t++) {
  const lo = 46000 + ((((process.pid % 50) + t * 7) % 50) * 30);
  if (lo <= cdp.BAND_MUTEX_PORT && cdp.BAND_MUTEX_PORT <= lo + 29) continue;
  if (lanes.some((d) => cib.bandsIntersect(d.range ?? d, { start: lo, end: lo + 29 }))) continue;
  let ok = true; for (let p = lo; p <= lo + 29 && ok; p++) ok = await bindable(p);
  if (ok) LO = lo;
}
const windowPort = (k) => LO + k; // the window's k-th port (test-lstart-locale's portAt shape: a run-time window, never a default)

const connects = (port, host) => new Promise((res) => { const c = net.connect({ port, host }); c.setTimeout(500); c.once('connect', () => { c.destroy(); res(true); }); c.once('error', () => res(false)); c.once('timeout', () => { c.destroy(); res(false); }); });
/** ms from `t0` until `port` accepts a connection on `host`, or null within `capMs` */
const listenMs = async (port, host, t0, capMs = 9000) => { while (Date.now() - t0 < capMs) { if (await connects(port, host)) return Date.now() - t0; await cdp.sleep(50); } return null; };
const fetchProbe = async (port) => { try { const r = await fetch(`http://127.0.0.1:${port}/probe.txt`, { signal: AbortSignal.timeout(5000) }); return { status: r.status, same: (await r.text()) === BYTES }; } catch (e) { return { error: e.message }; } };
/** lsof's LISTEN rows on `port` (whichever pid holds it: python3's launcher serves from a child), as [type, name with
 * the port replaced] */
const listenForm = (port) => {
  try {
    const out = execFileSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-F', 'tn'], { encoding: 'utf8' });
    const form = []; let type = '';
    for (const l of out.split('\n')) { if (l[0] === 't') type = l.slice(1); else if (l[0] === 'n') form.push(`${type} ${l.slice(1).replace(new RegExp(`:${port}$`), ':PORT')}`); }
    return form.sort();
  } catch (e) { return [`lsof failed: ${e.message.split('\n')[0]}`]; }
};
const commandOf = (pid) => { try { return execFileSync('ps', ['-ww', '-o', 'command=', '-p', String(pid)], { encoding: 'utf8' }).trim(); } catch { return ''; } };

let bare = null;
const cleanup = () => {
  if (bare && bare.exitCode === null) { try { process.kill(-bare.pid, 'SIGKILL'); } catch { /* gone */ } }
  try { fs.rmSync(stage, { recursive: true, force: true }); } catch { /* raced */ }
};
setTimeout(() => { console.log('FAIL watchdog — the probe exceeded 120 s'); cleanup(); console.log('STATIC-SERVER-FQDN SELFTEST FAIL (watchdog)'); process.exit(1); }, 120000).unref();

try {
  if (LO === null) throw new Error('no free 30-port window outside the declared bands');
  { // F0
    const r = spawnSync('python3', ['-c', "import socket, time; t = time.monotonic(); socket.getfqdn('::'); print(round((time.monotonic() - t) * 1000))"],
      { encoding: 'utf8', timeout: 30000, env: { ...process.env, PYTHONPATH: TRAP } });
    row('F0', Number(r.stdout) >= 4000, "control: under the trap, python's own socket.getfqdn('::') takes at least 4 s", JSON.stringify({ ms: r.stdout.trim(), err: r.stderr.slice(-300) }));
  }
  process.env.PYTHONPATH = TRAP; // spawnStaticServer's python runs under the trap from here
  let f1 = null;
  { // F1, F4
    const port = windowPort(3); const t0 = Date.now();
    const proc = cdp.spawnStaticServer(DOC, port);
    const ms = await listenMs(port, '127.0.0.1', t0);
    const got = ms === null ? null : await fetchProbe(port);
    row('F1', ms !== null && ms < 3500 && got?.status === 200 && got.same,
      "under the trap, spawnStaticServer with the default bind listens within 3.5 s and serves a file: the shim answered '::' without the lookup",
      JSON.stringify({ ms, got }));
    const cmd = commandOf(proc.pid);
    row('F4', cmd.endsWith(` -m http.server -d ${DOC} ${port}`) && !/sitecustomize|obw-static-server-py|-c /.test(cmd),
      'the command line is unchanged: it ends in "-m http.server -d <dir> <port>", the form the sweeps match, and carries nothing of the shim', cmd);
    f1 = listenForm(port);
    await cdp.stopStaticServer(proc);
  }
  { // F2
    const port = windowPort(5); const t0 = Date.now();
    const proc = cdp.spawnStaticServer(DOC, port, { bind: '127.0.0.1' });
    const ms = await listenMs(port, '127.0.0.1', t0);
    const got = ms === null ? null : await fetchProbe(port);
    row('F2', ms !== null && ms < 3500 && got?.status === 200 && got.same,
      "the same with { bind: '127.0.0.1' }: a loopback literal is answered without the lookup", JSON.stringify({ ms, got }));
    await cdp.stopStaticServer(proc);
  }
  { // F3
    const port = windowPort(7);
    const STUB = path.join(stage, 'stub'); fs.mkdirSync(STUB); // the bare control answers getfqdn without a lookup, binds as python does
    fs.writeFileSync(path.join(STUB, 'sitecustomize.py'), 'import socket\nsocket.getfqdn = lambda name="": name\n');
    const env = { ...process.env, PYTHONPATH: [STUB, CALLER_PYTHONPATH].filter(Boolean).join(path.delimiter) };
    bare = spawn('python3', ['-m', 'http.server', '-d', DOC, String(port)], { stdio: 'ignore', detached: true, env });
    const ms = await listenMs(port, '127.0.0.1', Date.now(), 30000);
    const form = ms === null ? ['never listened'] : listenForm(port);
    row('F3', ms !== null && f1 !== null && f1.some((x) => x.endsWith(':PORT')) && JSON.stringify(form) === JSON.stringify(f1),
      "the bind is unchanged: spawnStaticServer's server and a bare python3 -m http.server listen on the same address form",
      JSON.stringify({ spawnStaticServer: f1, bare: form }));
    try { process.kill(-bare.pid, 'SIGTERM'); } catch { /* gone */ }
  }
  { // F5
    process.env.PYTHONPATH = NEXT;
    const names = ['::', '0.0.0.0', '', '127.0.0.1', '::1', 'host.invalid'];
    const r = spawnSync('python3', ['-c', `import json, socket\nprint(json.dumps([socket.gethostname()] + [socket.getfqdn(n) for n in ${JSON.stringify(names)}]))`],
      { encoding: 'utf8', timeout: 30000, env: { ...process.env, PYTHONPATH: cdp.staticServerPythonPath() } });
    let got = null; try { got = JSON.parse(r.stdout); } catch { /* below */ }
    const want = got ? [got[0], got[0], got[0], got[0], '127.0.0.1', '::1', 'NEXT:host.invalid'] : null;
    row('F5', got !== null && JSON.stringify(got) === JSON.stringify(want),
      "the shim, after loading the next sitecustomize: '::', '0.0.0.0' and '' answer gethostname(), loopback literals answer themselves, a host name reaches the next getfqdn",
      JSON.stringify({ got, err: r.stderr.slice(-300) }));
  }
  { // F5b
    process.env.PYTHONPATH = CHAIN;
    const shimFirst = cdp.staticServerPythonPath(); // spawnStaticServer's order: this shim, then the caller's
    const shimDir = shimFirst.split(path.delimiter)[0];
    const probe = (pp) => spawnSync('python3', ['-c', "import json, socket\nprint(json.dumps([socket.gethostname(), socket.getfqdn('::'), socket.getfqdn('127.0.0.1'), socket.getfqdn('host.invalid')]))"],
      { encoding: 'utf8', timeout: 30000, env: { ...process.env, PYTHONPATH: pp } });
    const res = [shimFirst, [CHAIN, shimDir].join(path.delimiter)].map((pp) => { const r = probe(pp); let got = null; try { got = JSON.parse(r.stdout); } catch { /* below */ } return { pp: pp === shimFirst ? 'shim:chain' : 'chain:shim', got, err: r.stderr.trim().slice(-300) }; });
    row('F5b', res.every((x) => x.got && x.got[1] === x.got[0] && x.got[2] === '127.0.0.1' && x.got[3] === 'CHAIN:host.invalid' && !/sitecustomize|Recursion/i.test(x.err)),
      "a caller's chaining shim before or after this one: no sitecustomize error, the wildcard answers gethostname(), a loopback literal itself, and a host name reaches the caller's getfqdn",
      JSON.stringify(res));
  }
  { // F5c
    const RAISE = path.join(stage, 'raise'); fs.mkdirSync(RAISE); // a caller's sitecustomize that raises
    fs.writeFileSync(path.join(RAISE, 'sitecustomize.py'), 'raise RuntimeError("caller sitecustomize failed")\n');
    process.env.PYTHONPATH = RAISE;
    const r = spawnSync('python3', ['-c', "import json, socket\nprint(json.dumps([socket.gethostname(), socket.getfqdn('::'), socket.getfqdn.__module__]))"],
      { encoding: 'utf8', timeout: 30000, env: { ...process.env, PYTHONPATH: cdp.staticServerPythonPath() } });
    let got = null; try { got = JSON.parse(r.stdout); } catch { /* below */ }
    row('F5c', got !== null && got[1] === got[0] && got[2] === 'sitecustomize' && (r.stderr.match(/Error in sitecustomize/g) ?? []).length === 1
      && /RuntimeError: caller sitecustomize failed/.test(r.stderr),
    "a caller's sitecustomize that raises: its error is printed once, in site's wording, and the shim's answer is still installed",
    JSON.stringify({ got, err: r.stderr.trim().slice(-300) }));
  }
  { // F7
    const LISTEN = path.join(stage, 'listen'); fs.mkdirSync(LISTEN); // records the backlog of each listen() the server makes
    const REC = path.join(LISTEN, 'backlogs.txt');
    fs.writeFileSync(path.join(LISTEN, 'sitecustomize.py'), ['import socket', '_listen = socket.socket.listen', 'def listen(self, *a):',
      `    with open(${JSON.stringify(REC)}, "a") as f:`, '        f.write("%s\\n" % (a[0] if a else "none"))', '    return _listen(self, *a)',
      'socket.socket.listen = listen', ''].join('\n'));
    process.env.PYTHONPATH = LISTEN; // after the shim on the server's PYTHONPATH: the shim loads it, then sets the backlog
    const port = windowPort(11); const t0 = Date.now();
    const proc = cdp.spawnStaticServer(DOC, port);
    const ms = await listenMs(port, '127.0.0.1', t0);
    const got = ms === null ? null : await fetchProbe(port);
    const backlogs = fs.existsSync(REC) ? fs.readFileSync(REC, 'utf8').trim().split('\n').filter(Boolean) : [];
    row('F7', ms !== null && got?.status === 200 && got.same && JSON.stringify(backlogs) === '["128"]',
      "spawnStaticServer's server listens with a backlog of 128, not socketserver's 5, and serves the file (on macOS 27.2 an overflowed listen queue resets connections)",
      JSON.stringify({ ms, got, backlogs }));
    await cdp.stopStaticServer(proc);
  }
  if (process.platform !== 'darwin') console.log(`F6 NOT RUN — a connect to a bound socket that is not listening is refused on ${process.platform}, so the starved path is macOS's`);
  else { // F6
    const port = windowPort(9);
    const holder = spawn('python3', ['-c', 'import socket, sys, time\ns = socket.socket(socket.AF_INET6, socket.SOCK_STREAM)\n'
      + 's.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)\ns.bind(("::", int(sys.argv[1])))\nprint("BOUND", flush=True)\ntime.sleep(60)\n', String(port)],
    { stdio: ['ignore', 'pipe', 'ignore'] });
    const bound = await new Promise((res) => { let o = ''; holder.stdout.on('data', (d) => { o += d; if (o.includes('BOUND')) res(true); }); holder.once('exit', () => res(false)); setTimeout(() => res(false), 15000); });
    process.env.OB_CDP_PREFLIGHT_MS = '4000';
    let msg = '';
    try { await cdp.waitForHttpReadiness(`http://127.0.0.1:${port}/app.html`); msg = 'answered'; } catch (e) { msg = e.message; }
    delete process.env.OB_CDP_PREFLIGHT_MS;
    try { holder.kill('SIGKILL'); } catch { /* gone */ }
    row('F6', bound && /Timeouts, not refusals: a server that has bound but not yet reached listen\(\)/.test(msg) && !/accepted connections/.test(msg)
      && /no HTTP answer arrived/.test(msg) && /I\/O-STARVED host.*NOT a tree verdict/.test(msg),
    "#1229: a socket bound to '::' that never listens fails the readiness wait with the starved diagnosis worded from what it saw: timeouts, not refusals, a server short of listen() among the causes",
    JSON.stringify({ bound, msg }));
  }
} catch (e) {
  row('X', false, 'probe exception', e.stack ?? e.message);
} finally {
  cleanup();
}
const bad = rows.filter((r) => !r.ok);
console.log(bad.length ? `STATIC-SERVER-FQDN SELFTEST FAIL (${bad.length} of ${rows.length}: ${bad.map((r) => r.id).join(', ')})` : `STATIC-SERVER-FQDN SELFTEST PASS (${rows.length})`);
process.exit(bad.length ? 1 : 0);
