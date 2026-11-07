// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-cdp-reply-detail.mjs — #1221: cdp.mjs names the request a CDP protocol-error reply answered WITHOUT changing a
// byte that any reader of the rejection sees, and the lighting matrix names its failing worker, cell, phase and camera.
// Plain node, no browser: cdp.mjs's REAL client (launchChrome, the reply path, answerPausedRequest) drives a scripted
// endpoint (lib/fake-cdp-endpoint.mjs, exec'd by a CHROME_BIN wrapper per the wrapper contract).
//   D1-D7  a protocol-error reply rejects with Chrome's text byte for byte: the message, String(e), the stack's first
//          line (thrown in ws.onmessage), util.inspect(e) === e.stack, JSON.stringify(e) === '{}', no enumerable key
//   D8     the seven reply stacks are frame-identical after their first line: one construction site, nothing appended
//   C1-C7  the same rejection carries a NON-enumerable `cdp` = { method, head, id, port, code, data }: the id is the one
//          the endpoint received, the head the deadline label's (whitespace collapsed, 120 characters; null without an
//          expression)
//   C8     two requests in flight, the first answered last: each rejection names its OWN request
//   W1-W3  the deadline (wedge) text, the post-poison text and a socket close carry no `cdp`; the deadline label of a
//          long expression is the 120-character head
//   P1-P2  answerPausedRequest tolerates "Invalid InterceptionId." arriving through the REAL reply path, and routes
//          the period-less near-miss to fail (e2e-atelier --selftest-paused-answer throws bare strings that never pass
//          the reply path, so it cannot see this)
//   F1-F6  cdpReplyDetail: one line for a reply (with data, without a head, without a code, data cut at 200
//          characters), null for every other rejection and for non-Error values
//   M1-M3  measureCell names the camera it failed on; instrumentLine composes the matrix's named line; run-gate's
//          verdict grammar reads that line as no arm and no failure
//   H1-H2  the measurement promise is held by the page until it settles (#1221: an unreferenced awaited promise can be
//          collected): H1 runs heldUntilSettled in a node vm context (held while pending, released once settled, a
//          rejection reaches the caller unchanged, no unhandled rejection); H2 is a static check that MEASURE_SRC is
//          exactly heldUntilSettled(MEASURE_BODY(o))
//   E1-E4  the gate end to end: e2e-lighting-matrix against the endpoint, which answers the boot's localStorage write
//          with 'Promise was collected' -> exit 2, ONE named line (worker 0, cell 1, phase boot, the request with the
//          id the endpoint received, Chrome's text), 0 arms, the cell booted once (no retry)
//   L1-L3  the gate when the browser is lost at the app navigation (the endpoint drops the socket; bootCell's ready poll
//          swallows errors) -> exit 2 within seconds, ONE named line naming THAT cell and the client's poison, no refusal
//          row recorded for it, 0 arms
//   L4     the same when the browser is lost at the occlusion drain, before the settle and env-tail polls
//
//   node web/tools/test-cdp-reply-detail.mjs                    # exit 0/1; last line PASS (n) / FAIL (k of n)
//   OB_REPLY_DETAIL_MODULE=<copy>/web/tools/cdp.mjs node ...    # judge a base / plant copy (its lib/ and gate beside it)
//   node web/tools/test-cdp-reply-detail.mjs --dump <file>      # write the D and W renderings as JSON: run twice on
//                                                               # ONE module path, the module swapped; compare the bytes
//   S1     the port probe sees a wildcard holder (python's http.server binds '::' dual-stack, which a 127.0.0.1-only bind
//          does not see on macOS): a window holding one is rejected (judged alone, so no second free window is needed)
// Staged like test-orphan-browser-claim.mjs: a private port registry, marker dir and band mutex, the CI env keys
// removed, a 30-port window in 30000-30299 (below the Linux ephemeral range; clear of every declared band, every declared
// PORT_WINDOW_FAMILY and the tool defaults the lint reads) outside the bands and families the tree declares at run time,
// every port free on 127.0.0.1, 0.0.0.0 and '::'. The startup profile sweep is off (OB_PROFILE_SWEEP=0, inherited by
// the gate): with the private marker dir it could not see another harness's live server. Every child is stopped by its
// pid, SIGTERM first.
// E and L run the gate, which serves web/ with `python3 -m http.server` and preflights it before its browser stand-in
// launches. Python's HTTPServer.server_bind resolves the host's own name between bind() and listen()
// (socket.getfqdn('::'): gethostbyaddr(gethostname())); where that name does not resolve promptly (the hosted macOS
// image: ci 40117679711, job 120942296952) the server stays bound and not listening, a macOS client times out instead
// of being refused, and the preflight starves before the gate reaches its first cell. The gate runs' python therefore
// takes getfqdn's own fallback, gethostname(), without the lookup (a sitecustomize on their PYTHONPATH). The rows judge
// the gate's instrument line, not the static server. The lookup itself is timed once, unpatched (python3 -I), and
// printed: information, not a row.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import util from 'node:util';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CDP_MODULE = path.resolve(process.env.OB_REPLY_DETAIL_MODULE || path.join(HERE, 'cdp.mjs'));
const UNDER = path.dirname(CDP_MODULE); // the judged copy's web/tools
const FAKE = path.join(HERE, 'lib', 'fake-cdp-endpoint.mjs'); // the instrument, never the judged copy's
const DUMP = (() => { const i = process.argv.indexOf('--dump'); return i >= 0 ? path.resolve(process.argv[i + 1]) : null; })();

const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'ob-cdp-reply-detail-'));
const REG = path.join(stage, 'reg'); const MRK = path.join(stage, 'mrk');
fs.mkdirSync(REG); fs.mkdirSync(MRK);
for (const k of ['GITHUB_ACTIONS', 'OB_CI_BANDS', 'CI', 'OB_E2E_PORT', 'OB_E2E_CDP_PORT', 'OB_CDP_PORT', 'OB_PORT_BANDS',
  'OB_CDP_TIMEOUT_MS', 'OB_CDP_CMD_TIMEOUT_MS', 'OB_SKIP_TREE_PREFLIGHT']) delete process.env[k];
process.env.OB_PORT_BANDS_DIR = REG; process.env.OB_SERVER_MARKER_DIR = MRK;
process.env.OB_BAND_MUTEX_PORT = String(38000 + (process.pid % 900)); // read at import (GH-1119)
process.env.OB_PROFILE_SWEEP = '0'; // the private marker dir would blind the sweep's live-server shield; nothing here to sweep
const STUB = path.join(stage, 'fake-chrome.sh');
fs.writeFileSync(STUB, `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(FAKE)} "$@"\n`);
fs.chmodSync(STUB, 0o755);
process.env.CHROME_BIN = STUB;
const PYSHIM = path.join(stage, 'py'); // the gate runs' PYTHONPATH (the header): getfqdn's fallback, without the lookup
fs.mkdirSync(PYSHIM);
fs.writeFileSync(path.join(PYSHIM, 'sitecustomize.py'), ['import socket', '_getfqdn = socket.getfqdn',
  'def getfqdn(name=""):', '    if name.strip() in ("", "0.0.0.0", "::"):', '        return socket.gethostname()',
  '    return _getfqdn(name)', 'socket.getfqdn = getfqdn', ''].join('\n'));
let cdp, cib, grammar;
try {
  cdp = await import(pathToFileURL(CDP_MODULE).href);
  cib = await import(pathToFileURL(path.join(HERE, 'lib', 'ci-bands.mjs')).href);
  grammar = await import(pathToFileURL(path.join(HERE, 'lib', 'verdict-grammar.mjs')).href);
} catch (e) {
  fs.rmSync(stage, { recursive: true, force: true });
  throw e;
}

const rows = [];
const row = (id, ok, desc, detail = '') => {
  rows.push({ id, ok: !!ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id} — ${desc}${ok ? '' : `: ${String(detail).slice(0, 600)}`}`);
};
// a port is free only when nothing holds it on loopback OR a wildcard address: python's http.server (every gate's static
// server) binds '::' dual-stack, and on macOS a 127.0.0.1 bind succeeds beside it. A host without IPv6 skips the '::' probe.
const bindOn = (port, host) => new Promise((r) => {
  const s = net.createServer();
  s.once('error', (e) => r(host === '::' && (e.code === 'EAFNOSUPPORT' || e.code === 'EADDRNOTAVAIL')));
  s.listen({ port, host, ...(host === '::' ? { ipv6Only: false } : {}) }, () => s.close(() => r(true)));
});
const bindable = async (port) => (await bindOn(port, '127.0.0.1')) && (await bindOn(port, '0.0.0.0')) && (await bindOn(port, '::'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// a 30-port window in 30000-30299 (ten windows), outside every declared band and every declared window family (the
// tracked tools' PORT_WINDOW_FAMILY / FAMILIES, read as the lint reads them: a family is a band to it, and a render batch
// holds its ports for hours) and the registry mutex, every port free (bindable above). Unreadable tables fail closed.
const lanes = (() => { try { return cib.declaredBands(cib.loadCiBands(), cib.loadLaneBands()); } catch { return null; } })();
const families = (() => {
  try {
    const out = [];
    for (const f of cib.deriveScanFiles(cib.REPO_ROOT).map((x) => x.path ?? x).filter((x) => /\.m?js$/.test(x))) {
      let t; try { t = fs.readFileSync(path.join(cib.REPO_ROOT, f), 'utf8'); } catch { continue; }
      if (t.includes('PORT_WINDOW_FAMIL')) out.push(...cib.portWindowFamiliesOf(t));
    }
    return out;
  } catch { return null; }
})();
const WINDOWS = Array.from({ length: 10 }, (_, k) => 30000 + (((process.pid % 10) + k * 3) % 10) * 30);
const pickWindow = async (los) => {
  for (const lo of los) {
    const hi = lo + 29;
    if (lo <= cdp.BAND_MUTEX_PORT && cdp.BAND_MUTEX_PORT <= hi) continue;
    if (lanes === null || families === null) return null;
    if ([...lanes.map((d) => d.range ?? d), ...families].some((r) => cib.bandsIntersect(r, { start: lo, end: hi }))) continue;
    let free = true;
    for (let p = lo; p <= hi && free; p++) free = await bindable(p);
    if (free) return lo;
  }
  return null;
};
const B = await pickWindow(WINDOWS);

const clients = []; // every client this test launched (closed by closeAndWait)
const children = new Set(); // every child process this test spawned (stopped by its pid)
let bootServer = null;
const stopChild = async (p) => { // SIGTERM first: the gate's own teardown stops its server and its browser stand-in
  try { process.kill(p.pid, 'SIGTERM'); } catch { return; }
  for (let i = 0; i < 30 && p.exitCode === null && p.signalCode === null; i++) await sleep(100);
  if (p.exitCode === null && p.signalCode === null) { try { process.kill(p.pid, 'SIGKILL'); } catch { /* gone */ } }
};
const cleanup = async () => {
  for (const c of clients) { try { await c.closeAndWait(); } catch { /* gone */ } }
  for (const p of children) await stopChild(p);
  if (bootServer) await new Promise((r) => bootServer.close(r));
  try { fs.rmSync(stage, { recursive: true, force: true }); } catch { /* raced */ }
};
setTimeout(async () => {
  console.log('FAIL watchdog — the test exceeded 150 s');
  await cleanup();
  console.log('CDP-REPLY-DETAIL SELFTEST FAIL (watchdog)');
  process.exit(1);
}, 150000).unref();
// the host-name lookup the gate runs' python skips (the header), timed unpatched; information only, cut at 15 s
const lookupTimed = new Promise((resolve) => {
  const t0 = Date.now();
  const p = spawn('python3', ['-I', '-c', "import socket, time; t = time.monotonic(); socket.getfqdn('::'); print(round((time.monotonic() - t) * 1000))"],
    { stdio: ['ignore', 'pipe', 'ignore'] });
  children.add(p);
  let said = '';
  p.stdout?.on('data', (d) => { said += d; });
  const cut = setTimeout(() => { stopChild(p); }, 15000);
  p.once('error', (e) => { clearTimeout(cut); children.delete(p); resolve(`not timed (${e.code ?? e.message})`); });
  p.once('close', (code, signal) => {
    clearTimeout(cut); children.delete(p);
    resolve(code === 0 ? `${said.trim()} ms (python exited after ${Date.now() - t0} ms)`
      : signal ? `unanswered at ${Date.now() - t0} ms (cut)` : `exit ${code} after ${Date.now() - t0} ms`);
  });
});

// one launch of the REAL client against the scripted endpoint; the boot URL is the in-process server on B
const logOf = (port) => path.join(stage, `cmds-${port}.jsonl`);
const commandsOf = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const launch = async (port, rules, extraEnv = {}) => {
  const saved = {};
  for (const [k, v] of Object.entries({ OB_FAKE_DEVTOOLS_RULES: JSON.stringify(rules), OB_FAKE_DEVTOOLS_LOG: logOf(port), ...extraEnv })) {
    saved[k] = process.env[k]; process.env[k] = v;
  }
  try {
    const c = await cdp.launchChrome(`http://127.0.0.1:${B}/`, { port, preflight: false, tool: false });
    clients.push(c);
    return c;
  } finally {
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
};
// the gate end to end against the endpoint, both pins explicit and inside this test's window (as B + k at the call, like
// test-orphan-browser-claim.mjs: this test claims nothing through the registry, so it declares no PORT_INVENTORY);
// resolves { code, out, err, cmds, ms, rows }
const runGate = async (httpPin, cdpPin, rules) => {
  const OUT = path.join(stage, `matrix-${httpPin}`);
  const LOG = path.join(stage, `matrix-cmds-${httpPin}.jsonl`);
  const GATE = path.join(UNDER, 'e2e-lighting-matrix.mjs');
  const t0 = Date.now();
  const child = spawn(process.execPath, [GATE, '--leg', 'factory', '--tables', 'pool_pro_9ft', '--fixtures', 'canopy_panel', '--b', '1',
    '--workers', '1', '--out', OUT], {
    env: { ...process.env, OB_E2E_PORT: String(httpPin), OB_E2E_CDP_PORT: String(cdpPin), OB_FAKE_DEVTOOLS_LOG: LOG,
      OB_FAKE_DEVTOOLS_RULES: JSON.stringify(rules), PYTHONPATH: [PYSHIM, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter) },
    stdio: ['ignore', 'pipe', 'pipe'] });
  children.add(child);
  let out = '', err = '';
  child.stdout.on('data', (d) => { out += d; }); child.stderr.on('data', (d) => { err += d; });
  const code = await new Promise((r) => child.on('close', (c, s) => r(c ?? s))); // 'close': its stdio drained, not only exited
  children.delete(child);
  return { code, out, err, cmds: commandsOf(LOG), ms: Date.now() - t0, rows: path.join(OUT, 'rows.jsonl') };
};
const rejection = async (p) => { try { await p; return null; } catch (e) { return e; } };
const renderings = (e) => ({ message: e?.message, string: String(e), stack: e?.stack, inspect: util.inspect(e),
  json: JSON.stringify(e), keys: Object.keys(e ?? {}) });

// the representative replies: [name, how it is sent, Chrome's error]
const LONG_EXPR = `(async () => {\n  const O = {"cam":"player","png":false};\n  const THREE = await import('three');\n`
  + `  const TM    = await import('./scene/table.js');\n\t const RM = await import('./scene/room.js');\n  return { O, n: 1 };\n})()`;
const LONG_DATA = `Object reference chain is too long: ${'x'.repeat(260)}`;
const REPLIES = [
  ['collected', { evalExpr: LONG_EXPR }, { code: -32000, message: 'Promise was collected' }],
  ['no-context', { evalExpr: 'document.title' }, { code: -32000, message: 'Cannot find context with specified id' }],
  ['no-method', { method: 'Nope.missing', params: {} }, { code: -32601, message: "'Nope.missing' wasn't found" }],
  ['interception', { method: 'Fetch.continueRequest', params: { requestId: 'interception-job-3.0' } }, { code: -32602, message: 'Invalid InterceptionId.' }],
  ['with-data', { evalExpr: 'void 0' }, { code: -32602, message: 'Invalid parameters', data: 'Failed to deserialize params.expression - BINDINGS: string value expected at position 13' }],
  ['no-code', { method: 'Nope.nocode', params: {} }, { message: 'Internal error' }],
  ['long-data', { evalExpr: 'longData()' }, { code: -32000, message: 'Internal error', data: LONG_DATA }],
];
const ruleOf = ([, how, error]) => (how.evalExpr !== undefined
  ? { method: 'Runtime.evaluate', match: `^${how.evalExpr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, error }
  : { method: how.method, error });
const sendOf = (c, [, how]) => (how.evalExpr !== undefined ? c.eval(how.evalExpr) : c.send(how.method, how.params));
const headOf = ([, how]) => (how.evalExpr !== undefined ? how.evalExpr.replace(/\s+/g, ' ').slice(0, 120) : null);
const methodOf = ([, how]) => (how.evalExpr !== undefined ? 'Runtime.evaluate' : how.method);
const sentFor = (cmds, rep) => cmds.find((m) => m.method === methodOf(rep) && (rep[1].evalExpr === undefined || m.params.expression === rep[1].evalExpr));

const dump = { D: [], W: [] };
let exitCode = 1;
try {
  row('S0', B !== null, 'a free 30-port window outside every declared band and window family',
    `lanes=${lanes === null ? 'unloadable' : lanes.length} families=${families === null ? 'unreadable' : families.length}`);
  if (B === null) throw new Error('no port window');
  { // S1: a dual-stack wildcard holder (as python's http.server binds) on a port of the chosen window
    const H = B + 29; // a port of the window this test never uses
    const holder = net.createServer();
    const held = await new Promise((r) => {
      holder.once('error', () => holder.listen({ port: H, host: '0.0.0.0' }, () => r('0.0.0.0'))); // no IPv6: the IPv4 wildcard
      holder.listen({ port: H, host: '::', ipv6Only: false }, () => r('::'));
    });
    const loopbackOnly = await bindOn(H, '127.0.0.1'); // what the old probe saw: true on macOS beside a '::' holder
    const seen = !(await bindable(H));
    const rejected = await pickWindow([B]); // the window alone: null proves it was rejected, with no second free window needed
    await new Promise((r) => holder.close(r));
    const freed = await bindable(H);
    row('S1', seen && rejected === null && freed,
      `a wildcard holder ('${held}' on :${H}) is seen (a 127.0.0.1-only bind ${loopbackOnly ? 'would miss it' : 'sees it too on this host'}) and its window rejected`,
      JSON.stringify({ held, loopbackOnly, seen, B, rejected, freed }));
  }
  bootServer = http.createServer((q, r) => { r.writeHead(204); r.end(); });
  await new Promise((r, j) => { bootServer.once('error', j); bootServer.listen(B, '127.0.0.1', r); });

  // ---- D / C: the protocol-error replies
  const P = B + 1;
  const c1 = await launch(P, [...REPLIES.map(ruleOf),
    { method: 'Runtime.evaluate', match: '^SLOW_FIRST$', error: { code: -32000, message: 'Promise was collected' }, delay: 300 },
    { method: 'Runtime.evaluate', match: '^FAST_SECOND$', error: { code: -32000, message: 'Promise was collected' } }]);
  const errs = [];
  for (const rep of REPLIES) errs.push(await rejection(sendOf(c1, rep)));
  const [slow, fast] = await Promise.all([rejection(c1.eval('SLOW_FIRST')), rejection(c1.eval('FAST_SECOND'))]); // the second answer lands first
  const sent1 = commandsOf(logOf(P));
  REPLIES.forEach((rep, k) => {
    const e = errs[k]; const r = renderings(e); const want = rep[2].message;
    dump.D.push({ name: rep[0], ...r });
    if (DUMP) return;
    const lines = (r.stack ?? '').split('\n');
    row(`D${k + 1}`, e instanceof Error && r.message === want && r.string === `Error: ${want}` && lines[0] === r.string
      && /^ {4}at ws\.onmessage /.test(lines[1] ?? '') && r.inspect === r.stack && r.json === '{}' && r.keys.length === 0,
    `${rep[0]}: Chrome's text byte for byte; thrown in ws.onmessage; inspect = stack, JSON '{}', no enumerable key`,
    JSON.stringify({ message: r.message, line1: lines[1], inspectIsStack: r.inspect === r.stack, json: r.json, keys: r.keys }));
    const d = Object.getOwnPropertyDescriptor(e ?? {}, 'cdp');
    const want2 = { method: methodOf(rep), head: headOf(rep), id: sentFor(sent1, rep)?.id ?? null, port: P,
      code: rep[2].code ?? null, data: rep[2].data ?? null };
    const got = d?.value ?? null;
    row(`C${k + 1}`, !!d && d.enumerable === false && got !== null && Number.isInteger(want2.id)
      && JSON.stringify(got) === JSON.stringify(want2),
    `${rep[0]}: a non-enumerable cdp { method, head, id, port, code, data }, the id the endpoint received`,
    JSON.stringify({ descriptor: d && { enumerable: d.enumerable }, got, want: want2 }));
  });
  if (!DUMP) {
    const frames = errs.map((e) => String(e?.stack ?? '').split('\n').slice(1));
    const heads = REPLIES.map(headOf).filter((h) => h !== null);
    row('D8', frames.every((f) => f.length >= 1 && f.every((l) => /^ {4}at /.test(l)) && f.join('\n') === frames[0].join('\n'))
      && frames.every((f) => !heads.some((h) => f.join('\n').includes(h))),
    'the reply stacks are frame-identical after their first line (one construction site; nothing appended, no request named)',
    JSON.stringify(frames.map((f) => f.slice(0, 3))));
    const idSlow = sent1.find((m) => m.params.expression === 'SLOW_FIRST')?.id; const idFast = sent1.find((m) => m.params.expression === 'FAST_SECOND')?.id;
    row('C8', Number.isInteger(idSlow) && Number.isInteger(idFast) && slow?.cdp?.head === 'SLOW_FIRST' && slow?.cdp?.id === idSlow
      && fast?.cdp?.head === 'FAST_SECOND' && fast?.cdp?.id === idFast,
    'two requests in flight, the first answered last: each rejection names its own request, not the latest',
    JSON.stringify({ slow: slow?.cdp, fast: fast?.cdp, idSlow, idFast }));
  }

  // ---- W: the terminal rejections carry no cdp; the deadline label of a long expression is the 120-character head
  const W_EXPR = `/* NEVER_ANSWER */\n  (async () => {\n    const a = 1;\t\t const b = 2;\n    return [a, b, ${'"padding", '.repeat(12)}"end"];\n  })()`;
  const c2 = await launch(B + 2, [{ method: 'Runtime.evaluate', match: 'NEVER_ANSWER', silent: true }], { OB_CDP_TIMEOUT_MS: '2000' });
  const wDeadline = await rejection(c2.eval(W_EXPR));
  const wPoison = await rejection(c2.eval('1'));
  const c3 = await launch(B + 3, [{ method: 'Runtime.evaluate', match: 'HOLD', silent: true }]);
  const held = rejection(c3.eval('/* HOLD */ 0'));
  await sleep(200);
  try { process.kill(c3.pid, 'SIGKILL'); } catch { /* gone */ } // the endpoint dies under an in-flight command
  const wClosed = await held;
  const wHead = W_EXPR.replace(/\s+/g, ' ');
  const wantDeadline = `CDP Runtime.evaluate ${wHead.slice(0, 120)} did not answer within 2000 ms — `
    + 'Chrome is stalled, not slow (OB_CDP_TIMEOUT_MS tunes this) (GH-248)';
  for (const [id, e, want, what] of [
    ['W1', wDeadline, wantDeadline, `the deadline wedge: the label is the ${wHead.length}-character expression's 120-character head`],
    ['W2', wPoison, `CDP client is poisoned: ${wantDeadline}`, 'a post-poison send'],
    ['W3', wClosed, 'CDP websocket closed (Chrome exited?)', 'the socket closed under an in-flight command'],
  ]) {
    dump.W.push({ name: id, ...renderings(e) });
    if (DUMP) continue;
    row(id, e instanceof Error && e.message === want && e.cdpWedged === true && !Object.prototype.hasOwnProperty.call(e, 'cdp')
      && (id !== 'W1' || wHead.length > 120),
    `${what}: its own text, cdpWedged, no cdp`, JSON.stringify({ message: e?.message, cdpWedged: e?.cdpWedged, cdp: e?.cdp }));
  }
  if (DUMP) {
    const wrong = [...dump.D.map((x, k) => (x.message === REPLIES[k][2].message ? null : `D${k + 1} ${x.message}`)),
      ...[wDeadline, wPoison, wClosed].map((e, k) => (e instanceof Error && e.cdpWedged === true ? null : `W${k + 1} ${String(e)}`))].filter(Boolean);
    if (wrong.length) {
      console.log(`[cdp-reply-detail] dump REFUSED: not the expected rejections: ${wrong.join('; ')}`);
      exitCode = 1;
    } else {
      fs.writeFileSync(DUMP, JSON.stringify(dump, null, 1) + '\n');
      console.log(`[cdp-reply-detail] dump: ${DUMP} (${dump.D.length} replies, ${dump.W.length} terminal rejections)`);
      exitCode = 0;
    }
  } else {
    // ---- P: answerPausedRequest through the REAL reply path
    const c4 = await launch(B + 4, [
      { method: 'Fetch.continueRequest', error: { code: -32602, message: 'Invalid InterceptionId.' } },
      { method: 'Fetch.failRequest', error: { code: -32602, message: 'Invalid InterceptionId' } },
    ]);
    const fails = [];
    const before = cdp.getPausedAnswerToleratedCount();
    await cdp.answerPausedRequest(c4, 'Fetch.continueRequest', { requestId: 'interception-job-7.0', request: { url: 'http://127.0.0.1/x.png' } }, {}, { fail: (m) => fails.push(m) });
    row('P1', cdp.getPausedAnswerToleratedCount() === before + 1 && fails.length === 0,
      "a stale paused answer ('Invalid InterceptionId.' through the reply path) is tolerated and counted, not failed",
      JSON.stringify({ tolerated: cdp.getPausedAnswerToleratedCount() - before, fails }));
    await cdp.answerPausedRequest(c4, 'Fetch.failRequest', { requestId: 'interception-job-8.0', request: { url: 'http://127.0.0.1/y.png' } }, { errorReason: 'Aborted' }, { fail: (m) => fails.push(m) });
    row('P2', cdp.getPausedAnswerToleratedCount() === before + 1 && fails.length === 1
      && fails[0] === 'answerPausedRequest Fetch.failRequest http://127.0.0.1/y.png: Invalid InterceptionId',
    'the period-less near-miss goes to fail once, with Chrome\'s text', JSON.stringify(fails));

    // ---- F: cdpReplyDetail
    const detail = typeof cdp.cdpReplyDetail === 'function' ? cdp.cdpReplyDetail : () => undefined;
    const idOf = (k) => sentFor(sent1, REPLIES[k])?.id;
    const f1 = detail(errs[0]);
    row('F1', f1 === `Runtime.evaluate ${JSON.stringify(headOf(REPLIES[0]))} (id ${idOf(0)}, :${P}, code -32000)` && !/[\r\n]/.test(f1),
      'a reply: ONE line, the method, the JSON-quoted head, id, port, code', f1);
    const f2 = detail(errs[4]);
    row('F2', f2 === `Runtime.evaluate "void 0" (id ${idOf(4)}, :${P}, code -32602, data ${JSON.stringify(REPLIES[4][2].data)})`,
      'a reply with data: the JSON-quoted data after the code', f2);
    const nulls = [wDeadline, wPoison, wClosed, null, undefined, 'text', {}, new Error('x')].map((v) => detail(v));
    row('F3', nulls.every((v) => v === null), 'null for the terminal rejections, a fresh Error and non-Error values', JSON.stringify(nulls));
    const f4 = detail(errs[2]);
    row('F4', f4 === `Nope.missing (id ${idOf(2)}, :${P}, code -32601)`, 'a command without an expression: no head', f4);
    const f5 = detail(errs[5]);
    row('F5', f5 === `Nope.nocode (id ${idOf(5)}, :${P})`, 'a reply without a code: no code', f5);
    const f6 = detail(errs[6]);
    row('F6', f6 === `Runtime.evaluate "longData()" (id ${idOf(6)}, :${P}, code -32000, data ${JSON.stringify(LONG_DATA).slice(0, 200)})`
      && JSON.stringify(LONG_DATA).length > 200, 'a long data: cut at 200 characters of its JSON', f6);

    // ---- M: the matrix line's parts
    const lm = await import(pathToFileURL(path.join(UNDER, 'lib', 'lighting-matrix.mjs')).href);
    const at = {};
    const fakeClient = { eval: async (expr) => { if (expr.includes('"cam":"overhead"')) throw errs[0]; return {}; } };
    const mErr = await rejection(lm.measureCell(fakeClient, ['player', 'overhead'], false, at));
    row('M1', mErr === errs[0] && at.cam === 'overhead', 'measureCell names the camera it failed on', JSON.stringify({ same: mErr === errs[0], at }));
    const cells = [{ leg: 'factory', table: 'pool_pro_9ft', fixture: 'auto', b: 1, cloth: '' },
      { leg: 'neutral', table: 'pool_pro_8ft', fixture: 'canopy_panel', b: 1, cloth: 'steel_gray' },
      { leg: 'factory', table: 'pool_pro_9ft', fixture: 'canopy_panel', b: 0.6, cloth: '' }];
    const line = typeof lm.instrumentLine === 'function' ? lm.instrumentLine : () => '';
    const m2a = line({ wi: 1, port: P, pid: 4242, n: 2, phase: 'measure', cam: 'overhead', done: 5, e: errs[0] }, { cells, rows: '/x/rows.jsonl' });
    const m2b = line({ wi: 0, port: P, pid: null, n: null, phase: 'launch', cam: null, done: 0, e: new Error('boom\nsecond line') }, { cells, rows: '/x/rows.jsonl' });
    const m2c = line({ wi: 0, port: P, pid: 7, n: 1, phase: 'boot', cam: null, done: 1, e: errs[1] }, { cells, rows: '/x/rows.jsonl' });
    row('M2', m2a === `MATRIX UNJUDGEABLE instrument error: worker 1 (cdp :${P}, chrome pid 4242) cell 3/3 factory pool_pro_9ft canopy_panel b=0.6, `
      + `phase measure cam=overhead, 5 row(s) done (rows: /x/rows.jsonl): ${f1} -> Promise was collected`
      && m2b === `MATRIX UNJUDGEABLE instrument error: worker 0 (cdp :${P}, chrome pid none) before its first cell, phase launch, `
      + '0 row(s) done (rows: /x/rows.jsonl): boom second line'
      && m2c.startsWith(`MATRIX UNJUDGEABLE instrument error: worker 0 (cdp :${P}, chrome pid 7) cell 2/3 neutral pool_pro_8ft canopy_panel b=1 cloth=steel_gray, phase boot, `)
      && m2c.endsWith(' -> Cannot find context with specified id'),
    'instrumentLine: worker, port, pid, cell, phase, camera, rows, the request, the text verbatim; one line', JSON.stringify([m2a, m2b, m2c]));
    row('M3', [m2a, m2b, m2c].every((l) => l !== '' && grammar.verdictOf(l) === null) && grammar.countArms([m2a, m2b, m2c].join('\n')) === 0
      && grammar.failArms([m2a, m2b, m2c].join('\n')).length === 0, "run-gate's verdict grammar: the line is no verdict (0 arms, no failure name)");

    // ---- H: the measurement promise is held by the page until it settles (#1221)
    const vm = await import('node:vm');
    const held = typeof lm.heldUntilSettled === 'function' ? lm.heldUntilSettled : null;
    let h1 = { ok: false, why: 'no heldUntilSettled' };
    if (held) {
      const unhandled = []; const onUnhandled = (r) => unhandled.push(String(r)); process.on('unhandledRejection', onUnhandled);
      const ctx = vm.createContext({ window: {}, setTimeout });
      const tick = () => new Promise((r) => setImmediate(r));
      const pOk = vm.runInContext(held('await new Promise((r) => setTimeout(r, 20)); return 7;'), ctx);
      const heldWhilePending = ctx.window.__obHeld?.has(pOk) === true;
      const value = await pOk; await tick();
      const releasedAfter = ctx.window.__obHeld.size === 0;
      const pBad = vm.runInContext(held("await null; throw new Error('boom');"), ctx);
      const heldBad = ctx.window.__obHeld.has(pBad);
      let err = null; try { await pBad; } catch (e) { err = e; }
      await tick(); await tick();
      process.off('unhandledRejection', onUnhandled);
      h1 = { ok: heldWhilePending && value === 7 && releasedAfter && heldBad && err?.message === 'boom' && ctx.window.__obHeld.size === 0 && unhandled.length === 0,
        heldWhilePending, value, releasedAfter, heldBad, err: err?.message ?? null, left: ctx.window.__obHeld.size, unhandled };
    }
    row('H1', h1.ok, 'heldUntilSettled: the page holds the promise while it is pending and drops it once settled; a rejection reaches the caller unchanged, none unhandled',
      JSON.stringify(h1));
    const hBody = typeof lm.MEASURE_BODY === 'function' ? lm.MEASURE_BODY({ cam: 'player', png: false }) : null;
    const hSrc = lm.MEASURE_SRC({ cam: 'player', png: false });
    row('H2', held !== null && hBody !== null && hSrc === held(hBody) && /\(window\.__obHeld \?\?= new Set\(\)\)\.add\(p\);/.test(hSrc),
      'MEASURE_SRC is exactly heldUntilSettled(MEASURE_BODY(o)): the evaluated source holds a reference (a static check on the source)',
      hSrc.slice(0, 200));

    console.log(`[cdp-reply-detail] the host-name lookup python's http.server makes, unpatched (socket.getfqdn('::')): ${await lookupTimed}`);
    // ---- E: the gate end to end; the endpoint answers the boot's settings write with 'Promise was collected'
    const g = await runGate(B + 10, B + 11, [{ method: 'Runtime.evaluate', match: 'localStorage\\.clear\\(\\)', error: { code: -32000, message: 'Promise was collected' } }]);
    const named = g.out.split('\n').filter((l) => l.startsWith('MATRIX '));
    const writes = g.cmds.filter((m) => m.method === 'Runtime.evaluate' && String(m.params.expression).includes('localStorage.clear()'));
    row('E1', g.code === 2, 'the gate exits 2 (unjudgeable: it judged no cell)', `exit ${g.code}; stderr tail: ${g.err.slice(-400)}`);
    const n0 = named[0] ?? '';
    row('E2', named.length === 1 && new RegExp(`^MATRIX UNJUDGEABLE instrument error: worker 0 \\(cdp :${B + 11}, chrome pid \\d+\\) `
      + 'cell 1/1 factory pool_pro_9ft canopy_panel b=1, phase boot, 0 row\\(s\\) done ').test(n0)
      && n0.includes(`(rows: ${g.rows}): Runtime.evaluate "(localStorage.clear(), sessionStorage.clear(), `)
      && writes.length >= 1 && n0.includes(`(id ${writes[writes.length - 1].id}, :${B + 11}, code -32000) -> `) && n0.endsWith(' -> Promise was collected'),
    'ONE named line: worker 0, its port and Chrome pid, cell 1/1, phase boot, the request (the id the endpoint received for the write that failed), Chrome\'s text',
    JSON.stringify({ named, writeIds: writes.map((m) => m.id) }));
    console.log(`[cdp-reply-detail] the gate's line: ${n0}`);
    row('E3', grammar.countArms(`${g.out}\n${g.err}`) === 0, "the run's log holds 0 arms (run-gate's verdict grammar)", grammar.countArms(`${g.out}\n${g.err}`));
    const navs = g.cmds.filter((m) => m.method === 'Page.navigate').map((m) => m.params.url);
    row('E4', navs.length === 1 && navs[0].endsWith('/README.md') && writes.length === 1,
      'no retry: the cell booted once (one navigation, one settings write) and the run stopped there', JSON.stringify({ navs, writes: writes.length }));

    // ---- L: the browser is lost while the cell boots — after the app navigation, where bootCell's polls swallow errors
    const l = await runGate(B + 12, B + 13, [{ method: 'Page.navigate', match: '/app\\.html\\?', close: true }]);
    const lNamed = l.out.split('\n').filter((x) => x.startsWith('MATRIX '));
    row('L1', l.code === 2 && l.ms < 30000, 'a browser lost at the app navigation: exit 2 within seconds (the ready poll stops at the poisoned client)', `exit ${l.code} after ${l.ms} ms; stderr tail: ${l.err.slice(-300)}`);
    row('L2', lNamed.length === 1 && new RegExp(`^MATRIX UNJUDGEABLE instrument error: worker 0 \\(cdp :${B + 13}, chrome pid \\d+\\) `
      + `cell 1/1 factory pool_pro_9ft canopy_panel b=1, phase boot, 0 row\\(s\\) done \\(rows: [^)]*\\): CDP websocket closed \\(Chrome exited\\?\\)$`).test(lNamed[0] ?? ''),
    'ONE named line naming the cell the browser was lost in, and the client\'s poison', JSON.stringify(lNamed));
    console.log(`[cdp-reply-detail] the lost-browser line (${l.ms} ms): ${lNamed[0] ?? ''}`);
    const lRows = fs.existsSync(l.rows) ? fs.readFileSync(l.rows, 'utf8').trim() : '';
    row('L3', lRows === '' && !/\bREFUSE\b/.test(l.out) && grammar.countArms(`${l.out}\n${l.err}`) === 0,
      'no refusal row recorded for the lost cell, 0 arms', JSON.stringify({ rows: lRows.slice(0, 200), refuse: /\bREFUSE\b/.test(l.out) }));
    const l4 = await runGate(B + 14, B + 15, [{ method: 'Runtime.evaluate', match: 'window\\.__snkOccl\\.flush\\(\\)', close: true }]);
    const l4Named = l4.out.split('\n').filter((x) => x.startsWith('MATRIX '));
    const l4Rows = fs.existsSync(l4.rows) ? fs.readFileSync(l4.rows, 'utf8').trim() : '';
    console.log(`[cdp-reply-detail] the settle-loss line (${l4.ms} ms): ${l4Named[0] ?? ''}`);
    row('L4', l4.code === 2 && l4.ms < 30000 && l4Named.length === 1 && l4Rows === ''
      && new RegExp(`^MATRIX UNJUDGEABLE instrument error: worker 0 \\(cdp :${B + 15}, chrome pid \\d+\\) cell 1/1 factory pool_pro_9ft canopy_panel b=1, `
        + 'phase boot, 0 row\\(s\\) done \\(rows: [^)]*\\): CDP websocket closed \\(Chrome exited\\?\\)$').test(l4Named[0] ?? ''),
    'a browser lost at the occlusion drain: the settle and env-tail polls stop too; exit 2 within seconds, the same one line, no row',
    `exit ${l4.code} after ${l4.ms} ms; ${JSON.stringify(l4Named)}; rows ${l4Rows.slice(0, 120)}`);
    const bad = rows.filter((r) => !r.ok).length;
    console.log(bad ? `CDP-REPLY-DETAIL SELFTEST FAIL (${bad} of ${rows.length})` : `CDP-REPLY-DETAIL SELFTEST PASS (${rows.length})`);
    exitCode = bad ? 1 : 0;
  }
} catch (e) {
  row('S1', false, 'the test ran to its end', e?.stack ?? e);
  console.log(`CDP-REPLY-DETAIL SELFTEST FAIL (${rows.filter((r) => !r.ok).length} of ${rows.length})`);
  exitCode = 1;
}
await cleanup();
process.exit(exitCode);
