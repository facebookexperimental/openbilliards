// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-boottrace.mjs — the node arm for lib/boottrace.mjs (GH-248 CI diagnostic). Plain node, no browser, no wasm.
//   (1) the keep/discard table of bootTraceDecision, boundary included (ready AT the threshold keeps);
//   (2) the category list stays the three the frame needs (a broad list would bloat the hosted artifact);
//   (3) startBootTrace + finish over a stub browser endpoint that answers like Chrome (IO.read returns data with
//       eof:false, then a zero-byte read with eof:true; Tracing.end answers before tracingComplete):
//       keep writes the streamed bytes in order and the why file, and reads the stream to eof; discard sends no
//       Tracing.end, reads nothing and only closes the socket; a plain-JSON stream is named .json; a browser that
//       stops answering yields { file: null, error } within the finish budget; reads slower than the budget stop at the
//       budget with a .partial file, a late Tracing.end leaves Chrome's serialization only what is left of the budget, a
//       silent IO.close keeps the file within the budget, and the budget counts from the finish, not from the start (the
//       budget bounds the WHOLE write); a socket that closes mid-run fails the
//       finish at once (no deadline wait); a read that fails mid-stream leaves boot-trace.partial.json.gz with the
//       error in the why file; a Tracing.start error rejects and closes the socket; finish twice is a no-op;
//   (4) toolUrl stamps exactly as cdp.mjs's private withToolParam (its source is read from cdp.mjs and run);
//   (5) launchWithBootTrace, the traced launch ORDER, over a fake clock and a fake launch that behaves like launchChrome
//       (launching ON the app URL runs the app's boot inside the launch: a stalling boot makes the launch itself time
//       out, before any trace could start): a 130 s launch that returns a ready page is KEPT (the clock started before
//       the launch); a boot that stalls after the navigation is KEPT with the failure in the why file; the launch boots
//       the origin root and the trace starts before the app navigation; a failed navigation is returned, not thrown;
//       an unstartable trace leaves the run untraced; a fast boot is discarded; ready() and end() act once; end() waits
//       for the write (a kept check sees the file only if it did); the trace is RUNNING (start resolved) before the app
//       navigation; the navigation goes to the stamped navUrl, not the bare app URL;
//   (6) perf-aim.mjs wiring, by source census (a top-level script the arm cannot import): the traced launch and its
//       arguments, desktop only, the untraced launch text as on main, navError thrown inside the try, ready() after the
//       ready loop, end() at the three exits with the failure reason, and no remnant of the old order;
//   (7) perf-aim's ready wait (GH-248 / KF-008), lifted from its source and run over a fake clock: a page that never becomes ready
//       fails by name at the bound (default 900000 ms, OB_PERF_READY_MS when set); polls that answer at once are bounded by the
//       clock, not a count; polls that each wait behind a 60 s frame still reach ready.
//   (8) perf-aim's gate guard (GH-248 / KF-008), lifted from its source (the >>> / <<< block) and run over stubs: on a software GPU a
//       live gate passes and is logged, a null or absent gate fails by name, the ?obgpugate=0 seam is exempt; a hardware GPU with a
//       null gate passes; the census expression itself is run against stub pages (absent, null, live).
//   node web/tools/test-boottrace.mjs      (exit 1 on any failed check)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { BOOT_TRACE_CATEGORIES, BOOT_TRACE_THRESHOLD_S, bootTraceDecision, launchWithBootTrace, startBootTrace, toolUrl } from './lib/boottrace.mjs';

let fails = 0, checks = 0;
const check = (name, ok, got) => { checks++; if (!ok) { fails++; console.log(`FAIL ${name}${got !== undefined ? ' — got ' + JSON.stringify(got) : ''}`); } };

// (1) the decision table
const T = BOOT_TRACE_THRESHOLD_S;
check('threshold is 120 s', T === 120, T);
for (const [name, args, keep] of [
  ['fast boot discards', { readyAtS: 60 }, false],
  ['ready just under the threshold discards', { readyAtS: T - 0.1 }, false],
  ['ready AT the threshold keeps', { readyAtS: T }, true],
  ['slow boot keeps', { readyAtS: 225 }, true],
  ['never ready keeps', { readyAtS: null }, true],
  ['a non-number ready keeps', { readyAtS: NaN }, true],
  ['a failed run keeps even when fast', { readyAtS: 20, failed: true }, true],
  ['a failed run keeps when never ready', { failed: true }, true],
  ['a forced 5 s threshold keeps a 6 s boot', { readyAtS: 6, thresholdS: 5 }, true],
  ['a forced 5 s threshold discards a 4 s boot', { readyAtS: 4, thresholdS: 5 }, false],
]) {
  const d = bootTraceDecision(args);
  check(name, d.keep === keep && typeof d.why === 'string' && d.why.length > 0, d);
}
{
  const d = bootTraceDecision({ failed: true, reason: 'CDP Runtime.evaluate did not answer\nwithin 300000 ms — Chrome is stalled' });
  check('a failure reason is in the why, on one line', d.keep && d.why === 'the run failed (the stall path included): CDP Runtime.evaluate did not answer within 300000 ms — Chrome is stalled', d);
  check('a failure reason is capped at 300 characters', bootTraceDecision({ failed: true, reason: 'x'.repeat(400) }).why.endsWith(': ' + 'x'.repeat(300)));
  check('the why counts from the launch', bootTraceDecision({ readyAtS: 130 }).why === 'ready 130.0 s after the launch (>= 120 s)');
}

// (2) the categories
check('three categories: toplevel, gpu, devtools.timeline', JSON.stringify(BOOT_TRACE_CATEGORIES) === JSON.stringify(['toplevel', 'gpu', 'devtools.timeline']), BOOT_TRACE_CATEGORIES);
check('the category list is frozen', Object.isFrozen(BOOT_TRACE_CATEGORIES));

// (3) a stub browser endpoint that answers like Chrome
function stubBrowser({ chunks = [], base64 = true, silentAfter = null, startError = null, closeOn = null, readErrorAfter = null, readDelayMs = 1,
  replyDelayMs = 1, endDelayMs = 1, completeDelayMs = 2 } = {}) {
  const log = [];
  class WS {
    constructor(url) { this.url = url; this.readyState = 0; log.push(['open', url]); setTimeout(() => { this.readyState = 1; this.onopen?.(); }, 1); }
    send(raw) {
      if (this.readyState !== 1) { log.push(['dropped', raw]); return; } // WHATWG: a send on a closed socket is silently dropped
      const { id, method, params } = JSON.parse(raw); log.push([method, params]);
      if (silentAfter && method === silentAfter) return; // the browser stops answering
      if (closeOn && method === closeOn) { setTimeout(() => this.close(), 1); return; } // the socket dies instead
      const reply = (result, ms = replyDelayMs) => setTimeout(() => this.onmessage?.({ data: JSON.stringify({ id, result }) }), ms);
      const error = (message) => setTimeout(() => this.onmessage?.({ data: JSON.stringify({ id, error: { code: -32000, message } }) }), 1);
      if (method === 'Tracing.start') { if (startError) error(startError); else reply({}); }
      else if (method === 'Tracing.end') { reply({}, endDelayMs); setTimeout(() => this.onmessage?.({ data: JSON.stringify({ method: 'Tracing.tracingComplete', params: { stream: 's1' } }) }), completeDelayMs); }
      else if (method === 'IO.read') {
        const n = log.filter(([m]) => m === 'IO.read').length;
        if (readErrorAfter !== null && n > readErrorAfter) { error('Read failed'); return; }
        const c = chunks.shift(); // Chrome: data with eof:false, then a zero-byte read with eof:true
        const result = c === undefined ? { data: '', eof: true, base64Encoded: base64 } : { data: base64 ? c.toString('base64') : c.toString('utf8'), eof: false, base64Encoded: base64 };
        setTimeout(() => this.onmessage?.({ data: JSON.stringify({ id, result }) }), readDelayMs);
      } else reply({});
    }
    close() { if (this.readyState === 3) return; this.readyState = 3; log.push(['close']); setTimeout(() => this.onclose?.(), 1); }
  }
  const fetchImpl = async (url) => { log.push(['fetch', url]); return { json: async () => ({ webSocketDebuggerUrl: 'ws://127.0.0.1:1/devtools/browser/x' }) }; };
  return { WS, fetchImpl, log, methods: () => log.map(([m]) => m) };
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ob-boottrace-'));
try {
  const gz = zlib.gzipSync(Buffer.from('{"traceEvents":[{"name":"GLES2::ReadPixels"}]}'));
  const parts = [gz.subarray(0, 10), gz.subarray(10)];
  { // keep
    const b = stubBrowser({ chunks: parts.slice() });
    const h = await startBootTrace({ cdpPort: 20953, fetchImpl: b.fetchImpl, WebSocketImpl: b.WS, timeoutMs: 2000 });
    const start = b.log.find(([m]) => m === 'Tracing.start')?.[1];
    check('start: the three categories, continuous, gzip stream', JSON.stringify(start?.traceConfig?.includedCategories) === JSON.stringify(['toplevel', 'gpu', 'devtools.timeline'])
      && start?.traceConfig?.recordMode === 'recordContinuously' && start?.transferMode === 'ReturnAsStream' && start?.streamCompression === 'gzip', start);
    check('start: the browser endpoint of the given port', b.log.some(([m, u]) => m === 'fetch' && u === 'http://127.0.0.1:20953/json/version'));
    const dir = path.join(tmp, 'keep');
    const r = await h.finish({ keep: true, dir, why: 'unit keep' });
    check('keep: the file is the streamed bytes in order', r.file === path.join(dir, 'boot-trace.json.gz') && Buffer.compare(fs.readFileSync(r.file), gz) === 0, r);
    check('keep: the gzip decodes to the trace', zlib.gunzipSync(fs.readFileSync(r.file)).toString().includes('GLES2::ReadPixels'));
    check('keep: the why file', fs.readFileSync(path.join(dir, 'boot-trace.why.txt'), 'utf8') === 'unit keep\n');
    check('keep: read to the zero-byte eof (3 reads), then closed the stream and the socket', b.methods().filter((m) => m === 'IO.read').length === 3 && b.methods().includes('IO.close') && b.methods().at(-1) === 'close', b.methods());
    const again = await h.finish({ keep: true, dir, why: 'again' });
    check('finish twice is a no-op', again.file === null && fs.readFileSync(path.join(dir, 'boot-trace.why.txt'), 'utf8') === 'unit keep\n', again);
  }
  { // discard: no Tracing.end, no read, the socket closed (Chrome drops the detached session's trace)
    const b = stubBrowser({ chunks: parts.slice() });
    const h = await startBootTrace({ cdpPort: 20953, fetchImpl: b.fetchImpl, WebSocketImpl: b.WS, timeoutMs: 2000 });
    const dir = path.join(tmp, 'discard');
    const t0 = Date.now();
    const r = await h.finish({ keep: false, dir, why: 'unit discard' });
    check('discard: nothing written, at once', r.file === null && !fs.existsSync(dir) && Date.now() - t0 < 200, r);
    check('discard: no Tracing.end, no read, only the socket closed', !b.methods().includes('Tracing.end') && !b.methods().includes('IO.read') && b.methods().at(-1) === 'close', b.methods());
  }
  { // plain JSON stream
    const b = stubBrowser({ chunks: [Buffer.from('{"traceEvents":[]}')], base64: false });
    const h = await startBootTrace({ cdpPort: 20953, fetchImpl: b.fetchImpl, WebSocketImpl: b.WS, timeoutMs: 2000 });
    const dir = path.join(tmp, 'plain');
    const r = await h.finish({ keep: true, dir, why: 'plain' });
    check('plain JSON: named .json, content intact', r.file === path.join(dir, 'boot-trace.json') && fs.readFileSync(r.file, 'utf8') === '{"traceEvents":[]}', r);
  }
  { // a browser that stops answering
    const b = stubBrowser({ chunks: parts.slice(), silentAfter: 'Tracing.end' });
    const h = await startBootTrace({ cdpPort: 20953, fetchImpl: b.fetchImpl, WebSocketImpl: b.WS, timeoutMs: 2000, endTimeoutMs: 300 });
    const t0 = Date.now();
    const r = await h.finish({ keep: true, dir: path.join(tmp, 'dead'), why: 'dead' });
    check('silent browser: { file: null, error } within the finish budget, no throw', r.file === null && /^boot trace: Tracing\.end \(the 300 ms finish budget\) did not answer within \d+ ms$/.test(r.error ?? '') && Date.now() - t0 < 2000, r);
  }
  { // a late Tracing.end: Chrome's serialization gets only what is left of the budget, not a fresh one
    const b = stubBrowser({ chunks: parts.slice(), endDelayMs: 500, completeDelayMs: 2000 });
    const h = await startBootTrace({ cdpPort: 20953, fetchImpl: b.fetchImpl, WebSocketImpl: b.WS, timeoutMs: 5000, endTimeoutMs: 600 });
    const t0 = Date.now();
    const r = await h.finish({ keep: true, dir: path.join(tmp, 'lateend'), why: 'late end' });
    const ms = Date.now() - t0;
    // the budget ends at ~600 ms; a fresh serialization budget after the 500 ms Tracing.end would end at ~1100 ms
    check('late Tracing.end: the serialization wait stops at the 600 ms budget (not 600 ms more)', r.file === null && /^boot trace: Tracing\.tracingComplete \(the 600 ms finish budget\) did not answer within \d+ ms$/.test(r.error ?? '') && ms < 900, [r, ms]);
  }
  { // a silent IO.close: the file is kept, and the close waits only what is left of the budget
    const b = stubBrowser({ chunks: parts.slice(), silentAfter: 'IO.close' });
    const h = await startBootTrace({ cdpPort: 20953, fetchImpl: b.fetchImpl, WebSocketImpl: b.WS, timeoutMs: 2000, endTimeoutMs: 300 });
    const dir = path.join(tmp, 'silentclose');
    const t0 = Date.now();
    const r = await h.finish({ keep: true, dir, why: 'silent close' });
    const ms = Date.now() - t0;
    check('silent IO.close: the file is kept within the 300 ms budget (not the 2000 ms command deadline)', r.file === path.join(dir, 'boot-trace.json.gz') && Buffer.compare(fs.readFileSync(r.file), gz) === 0 && ms < 1200, [r, ms]);
  }
  { // the budget counts from the finish: a trace that ran longer than the budget is still written
    const b = stubBrowser({ chunks: parts.slice(), replyDelayMs: 5, readDelayMs: 5 });
    const h = await startBootTrace({ cdpPort: 20953, fetchImpl: b.fetchImpl, WebSocketImpl: b.WS, timeoutMs: 5000, endTimeoutMs: 1500 });
    await new Promise((res) => setTimeout(res, 1800)); // the run outlasts the budget before the finish (a budget counted from the start is spent)
    const dir = path.join(tmp, 'longrun');
    const r = await h.finish({ keep: true, dir, why: 'long run' });
    check('the budget counts from the finish: a run longer than the budget is still written', r.file === path.join(dir, 'boot-trace.json.gz') && Buffer.compare(fs.readFileSync(r.file), gz) === 0, r);
  }
  { // reads slower than the finish budget: the budget bounds the whole write, what arrived is kept as .partial
    const many = Array.from({ length: 8 }, (_, i) => gz.subarray(i * 4, i * 4 + 4));
    const b = stubBrowser({ chunks: many, readDelayMs: 120 });
    const h = await startBootTrace({ cdpPort: 20953, fetchImpl: b.fetchImpl, WebSocketImpl: b.WS, timeoutMs: 60000, endTimeoutMs: 400 });
    const dir = path.join(tmp, 'budget');
    const t0 = Date.now();
    const r = await h.finish({ keep: true, dir, why: 'unit budget' });
    const ms = Date.now() - t0;
    check('slow reads: stopped at the 400 ms budget (not 60 s per read), .partial kept, why names the budget', r.file === null && /^boot trace: IO\.read \(the 400 ms finish budget\) did not answer within \d+ ms$/.test(r.error ?? '') && ms < 1000
      && fs.existsSync(path.join(dir, 'boot-trace.partial.json.gz')) && /— PARTIAL: boot trace: IO\.read \(the 400 ms finish budget\)/.test(fs.readFileSync(path.join(dir, 'boot-trace.why.txt'), 'utf8')), [r, ms]);
  }
  { // the socket closes mid-run: the finish fails at once, not after the deadline
    const b = stubBrowser({ chunks: parts.slice(), closeOn: 'Tracing.end' });
    const h = await startBootTrace({ cdpPort: 20953, fetchImpl: b.fetchImpl, WebSocketImpl: b.WS, timeoutMs: 60000, endTimeoutMs: 60000 });
    const t0 = Date.now();
    const r = await h.finish({ keep: true, dir: path.join(tmp, 'closed'), why: 'closed' });
    check('closed socket: fails at once with the cause', r.file === null && /websocket closed/.test(r.error ?? '') && Date.now() - t0 < 1000, [r, Date.now() - t0]);
  }
  { // a read fails mid-stream: what arrived is kept as .partial, the error goes into the why file
    const b = stubBrowser({ chunks: parts.slice(), readErrorAfter: 1 });
    const h = await startBootTrace({ cdpPort: 20953, fetchImpl: b.fetchImpl, WebSocketImpl: b.WS, timeoutMs: 2000 });
    const dir = path.join(tmp, 'partial');
    const r = await h.finish({ keep: true, dir, why: 'unit partial' });
    check('read error: .partial file, no full file, why names the failure', r.file === null && fs.existsSync(path.join(dir, 'boot-trace.partial.json.gz')) && !fs.existsSync(path.join(dir, 'boot-trace.json.gz'))
      && /^unit partial — PARTIAL: boot trace: Read failed\n$/.test(fs.readFileSync(path.join(dir, 'boot-trace.why.txt'), 'utf8')), [r, fs.existsSync(dir) ? fs.readdirSync(dir) : null]);
  }
  { // Tracing.start fails: the start rejects and the socket is closed
    const b = stubBrowser({ startError: 'Tracing has already been started (possibly in another tab).' });
    let err = null;
    try { await startBootTrace({ cdpPort: 20953, fetchImpl: b.fetchImpl, WebSocketImpl: b.WS, timeoutMs: 2000 }); } catch (e) { err = e; }
    check('start error: rejects with the message, socket closed', /already been started/.test(err?.message ?? '') && b.methods().at(-1) === 'close', [err?.message, b.methods()]);
  }
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }

// (4) toolUrl == cdp.mjs's private withToolParam, run from cdp.mjs's own source
{
  const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'cdp.mjs'), 'utf8');
  const m = /^function withToolParam\(url\) \{\n[\s\S]*?\n\}\n/m.exec(src);
  check('cdp.mjs still has withToolParam', !!m);
  if (m) {
    const ref = new Function(m[0] + '; return withToolParam;')();
    const urls = ['http://127.0.0.1:20950/app.html?seed=1&obtool=0', 'http://127.0.0.1:20950/app.html?seed=1', 'http://127.0.0.1:20950/app.html',
      'http://127.0.0.1:20950/app.html?seed=1#x', 'http://127.0.0.1:20950/app.html#a?obtool=0', 'http://h/app.html?xobtool=1'];
    const bad = urls.filter((u) => toolUrl(u) !== ref(u));
    check('toolUrl stamps as cdp.mjs withToolParam (6 URLs)', bad.length === 0, bad.map((u) => [u, toolUrl(u), ref(u)]));
  }
}

// (5) the traced launch order
const APP = 'http://127.0.0.1:20950/app.html?seed=1'; // unstamped: the navigation must carry toolUrl's stamp
const NAV = toolUrl(APP);
const tick = (ms) => new Promise((res) => setTimeout(res, ms));
function fakeRun({ launchMs = 1000, stallInLaunch = false, startError = null, navReject = null, navErrorText = null } = {}) {
  let t = 1_000_000; const now = () => t; const order = []; const finishes = []; const notes = [];
  const chrome = { send: async (method, params) => {
    order.push(['send', method, params?.url]);
    if (method === 'Page.navigate') { if (navReject) throw new Error(navReject); return navErrorText ? { frameId: 'f', errorText: navErrorText } : { frameId: 'f' }; }
    return {};
  } };
  // like launchChrome: launching ON the app URL loads the app inside the launch; a stalling boot times its init out
  const launch = async (url) => {
    order.push(['launch', url]); t += launchMs;
    if (stallInLaunch && url.includes('/app.html')) throw new Error('CDP Runtime.enable did not answer within 300000 ms — Chrome is stalled');
    return chrome;
  };
  const start = async () => { // like startBootTrace: the trace is running only once the start resolves
    order.push(['start']);
    await tick(5);
    if (startError) throw new Error(startError);
    order.push(['started']);
    return { finish: async (o) => { await tick(5); finishes.push(o); return { file: o.keep ? path.join(o.dir, 'boot-trace.json.gz') : null }; } };
  };
  const run = () => launchWithBootTrace({ appUrl: APP, navUrl: NAV, dir: '/trace', launch, start, now, note: (l) => notes.push(l) });
  return { run, order, finishes, notes, advance: (ms) => { t += ms; } };
}
{ // a 130 s launch that returns a ready page: kept (the clock started before the launch)
  const f = fakeRun({ launchMs: 130000 });
  const b = await f.run();
  f.advance(200); // the first ready poll answers true
  const s = b.ready(); const r = await b.end(false);
  check('130 s launch, ready page: ready 130.2 s after the launch', Math.abs(s - 130.2) < 1e-9, s);
  check('130 s launch, ready page: KEPT, and end() waited for the write', r?.keep === true && r?.file === '/trace/boot-trace.json.gz' && f.finishes.length === 1 && f.finishes[0].keep === true && f.finishes[0].why === 'ready 130.2 s after the launch (>= 120 s)', [r, f.finishes]);
  check('order: launch on the origin root, the trace RUNNING, then the navigation to the stamped URL', NAV === 'http://127.0.0.1:20950/app.html?seed=1&obtool=1'
    && JSON.stringify(f.order) === JSON.stringify([['launch', 'http://127.0.0.1:20950/'], ['start'], ['started'], ['send', 'Page.navigate', NAV]]), f.order);
}
let stalled = null;
{ // a boot that stalls (the ready wait times out after the navigation): the trace is running and is KEPT with the reason
  const f = fakeRun({ stallInLaunch: true });
  let threw = null;
  try {
    const b = await f.run();
    f.advance(300000); // the CDP stall: the ready eval does not answer within 300 s
    const reason = 'CDP Runtime.evaluate window.__test?.ready === true did not answer within 300000 ms — Chrome is stalled';
    stalled = await b.end(true, reason);
  } catch (e) { threw = e; }
  check('stalling boot: the launch did not stall (no app byte in it)', threw === null, threw?.message);
  check('stalling boot: KEPT, the why names the stall', stalled?.keep === true && stalled?.file === '/trace/boot-trace.json.gz' && f.finishes.length === 1 && f.finishes[0].keep === true
    && f.finishes[0].why === 'the run failed (the stall path included): CDP Runtime.evaluate window.__test?.ready === true did not answer within 300000 ms — Chrome is stalled', [stalled, f.finishes, threw?.message]);
}
{ // a navigation that fails is returned (the caller fails the run with it), never thrown
  const f = fakeRun({ navReject: 'CDP Page.navigate did not answer within 300000 ms' });
  const b = await f.run();
  check('failed navigation: returned as navError, the trace running', /^the app navigation failed: CDP Page.navigate did not answer/.test(b.navError?.message ?? '') && f.finishes.length === 0, b.navError?.message);
  const r = await b.end(true, b.navError.message);
  check('failed navigation: KEPT with the reason', r?.keep === true && r?.file === '/trace/boot-trace.json.gz' && /^the run failed \(the stall path included\): the app navigation failed: /.test(f.finishes[0]?.why ?? ''), f.finishes);
  const g = fakeRun({ navErrorText: 'net::ERR_CONNECTION_REFUSED' });
  const b2 = await g.run();
  check('navigation errorText: returned as navError', b2.navError?.message === 'the app navigation failed: net::ERR_CONNECTION_REFUSED', b2.navError?.message);
}
{ // the trace cannot start: the run goes on untraced (the navigation still happens), end is a no-op
  const f = fakeRun({ startError: 'Tracing has already been started' });
  const b = await f.run();
  const r = await b.end(true, 'x');
  check('unstartable trace: untraced run, navigation done, end is a no-op', r === null && f.finishes.length === 0 && f.order.at(-1)[1] === 'Page.navigate' && f.notes.some((l) => /not started \(Tracing has already been started\)/.test(l)), [r, f.order, f.notes]);
}
{ // a fast boot is discarded; ready() and end() act once
  const f = fakeRun({ launchMs: 1500 });
  const b = await f.run();
  f.advance(30000);
  const s1 = b.ready(); f.advance(5000); const s2 = b.ready();
  const r = await b.end(false); const r2 = await b.end(true, 'later');
  check('fast boot: DISCARDED, and end() waited for the discard', r?.keep === false && r?.file === null && f.finishes.length === 1 && f.finishes[0].keep === false, [r, f.finishes]);
  check('ready() stamps once', s1 === s2 && Math.abs(s1 - 31.5) < 1e-9, [s1, s2]);
  check('end() acts once', r2 === null && f.finishes.length === 1, [r2, f.finishes.length]);
}

// (6) perf-aim.mjs wiring, by source census
{
  const pa = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'perf-aim.mjs'), 'utf8');
  const at = (needle) => pa.indexOf(needle);
  const once = (needle) => pa.split(needle).length === 2;
  check('perf-aim: imports the traced launch from lib/boottrace.mjs', /^import \{ BOOT_TRACE_THRESHOLD_S, launchWithBootTrace, startBootTrace, toolUrl \} from '\.\/lib\/boottrace\.mjs';$/m.test(pa));
  check('perf-aim: the traced launch is desktop only, with the stamped navUrl and a tool:false root launch', once('const boot = BOOT_TRACE_DIR && !vp\n  ? await launchWithBootTrace({ appUrl: URL_, navUrl: toolUrl(URL_), dir: BOOT_TRACE_DIR, thresholdS: BOOT_TRACE_S,')
    && once('      launch: (url) => launchChrome(url, { port: PORT, width: W, height: H, headless: !HEADED, tool: false }),')
    && once('      start: () => startBootTrace({ cdpPort: PORT,'));
  check('perf-aim: the untraced launch is the text main ships', once('const chrome = boot ? boot.chrome : vp\n  ? await launchPhone(URL_, { cdpPort: PORT, width: W, height: H,\n      headless: !HEADED })\n  : await launchChrome(URL_, { port: PORT, width: W, height: H,\n      headless: !HEADED });\n'));
  const tryAt = at('\ntry {\n  if (boot?.navError) throw boot.navError;\n  let ready = false;\n');
  const loopAt = at("  const readyMs = Number(process.env.OB_PERF_READY_MS || 900000), readyT0 = Date.now();\n  while (!ready && Date.now() - readyT0 < readyMs) { await sleep(200); ready = await chrome.eval('window.__test?.ready === true'); }\n  if (!ready) throw new Error(`app never became ready (waited ${Math.round((Date.now() - readyT0) / 1000)} s; OB_PERF_READY_MS ${readyMs})`);\n  boot?.ready();\n");
  // GH-248 / KF-008: a poll count bounded the wait only while every poll waited behind a software-GL frame (the GPU gate frees the
  // main thread between frames, and 200 polls ran out before ready on the hosted VM)
  check('perf-aim: the ready wait is a wall-clock bound (OB_PERF_READY_MS, default 900000 ms), not a poll count', loopAt > 0
    && !/for \(let i = 0; i < \d+ && !ready;/.test(pa));
  check('perf-aim: a failed navigation throws inside the try, before the ready loop', tryAt > 0 && loopAt > tryAt);
  check('perf-aim: ready() is stamped right after the ready loop, once', loopAt > 0 && once('boot?.ready()'));
  const probeAt = at('    await boot?.end(false);\n    chrome.close(); await stopStaticServer(server);\n    process.exit(0);');
  const gateAt = at("    await boot?.end(failures.length > 0, failures.join(' | '));\n    chrome.close(); await stopStaticServer(server);\n    process.exit(failures.length ? 1 : 0);");
  const finAt = at('  runOk = true;\n} catch (e) {\n  failReason = String(e?.message ?? e);\n  throw e;\n} finally {\n  await boot?.end(!runOk, failReason);\n  chrome.close();');
  check('perf-aim: end() at the --probe-only exit, the --gate exit (with the failures) and the finally (with the thrown reason)', probeAt > loopAt && gateAt > probeAt && finAt > gateAt);
  check('perf-aim: end() is called at exactly those three exits', pa.split('boot?.end(').length === 4);
  check('perf-aim: no remnant of the old order (chromeUpAt, endBootTrace, bootTraceDecision)', !/chromeUpAt|endBootTrace|bootTraceDecision/.test(pa));
}

// (7) perf-aim's ready wait, lifted from its source (the lines between the 'waiting for __test.ready' note and boot?.ready()) and run
//     over a fake clock and a stub page
{
  const pa = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'perf-aim.mjs'), 'utf8');
  const a = pa.indexOf("  note('chrome up; waiting for __test.ready');\n"), b = pa.indexOf('  boot?.ready();\n', a);
  check('perf-aim: the ready wait is liftable (between the waiting note and boot?.ready())', a > 0 && b > a);
  const body = a > 0 && b > a ? pa.slice(pa.indexOf('\n', a) + 1, b) : '';
  const runWait = async ({ readyAfter = Infinity, evalMs = 0, env = {} }) => {
    const clock = { t: 0, polls: 0 };
    const LIMIT = 4 * 3600 * 1000; // past 4 h of fake time the wait is unbounded
    const sleep = async (ms) => { clock.t += ms; if (clock.t > LIMIT) throw new Error('unbounded wait'); };
    // a poll cap and a real-time watchdog: a wait that stops moving the fake clock (a timer instead of the injected sleep, no sleep
    // at all) fails by name instead of hanging the arm
    const chrome = { eval: async () => { clock.polls += 1; clock.t += evalMs; if (clock.t > LIMIT || clock.polls > 1e6) throw new Error('unbounded wait'); return clock.polls >= readyAfter; } };
    const fn = new Function('chrome', 'sleep', 'Date', 'process', `return (async () => {\n  let ready = false;\n${body}  return ready;\n})();`);
    let dog = 0;
    const watchdog = new Promise((res) => { dog = setTimeout(() => res({ error: 'watchdog: the lifted wait did not end within 20 s of real time', ...clock }), 20000); dog.unref?.(); });
    try { return await Promise.race([fn(chrome, sleep, { now: () => clock.t }, { env }).then((ready) => ({ ready, ...clock })), watchdog]); }
    catch (e) { return { error: String(e?.message ?? e), ...clock }; } finally { clearTimeout(dog); }
  };
  let r = await runWait({});
  check('perf-aim ready wait: a page that never becomes ready fails by name at the default bound (900000 ms)',
    r.error === 'app never became ready (waited 900 s; OB_PERF_READY_MS 900000)' && r.t >= 900000 && r.t < 900400, r);
  r = await runWait({ env: { OB_PERF_READY_MS: '5000' } });
  check('perf-aim ready wait: OB_PERF_READY_MS sets the bound', r.error === 'app never became ready (waited 5 s; OB_PERF_READY_MS 5000)' && r.t >= 5000 && r.t < 5400, r);
  r = await runWait({ readyAfter: 1000 });
  check('perf-aim ready wait: polls that answer at once are bounded by the clock, not a count (ready after 1000 polls, 200 s)', r.ready === true && r.polls === 1000, r);
  r = await runWait({ readyAfter: 12, evalMs: 60000 });
  check('perf-aim ready wait: polls that each wait behind a 60 s frame still reach ready (12 polls, 722 s)', r.ready === true && r.polls === 12, r);
}

// (8) perf-aim's gate guard, lifted from its source and run over stubs
{
  const pa = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'perf-aim.mjs'), 'utf8');
  const a = pa.indexOf('  // >>> GH-248 / KF-008 gate guard'), b = pa.indexOf('  // <<< GH-248 / KF-008 gate guard', a);
  check('perf-aim: the gate guard is liftable (the >>> / <<< block) and sits after SOFT_GPU, before the probes', a > 0 && b > a
    && pa.indexOf('const SOFT_GPU = ') < a && a < pa.indexOf('if (PROBE_SKIP) note('));
  const body = a > 0 && b > a ? pa.slice(a, b) : '';
  const expr = (/chrome\.eval\(`([^`]*)`\)/.exec(body) || [])[1] || '';
  // the census expression run against a stub page (a window with or without __test.gpuGate)
  const page = (test) => { try { return new Function('window', `return ${expr};`)({ __test: test }); } catch (e) { return 'threw: ' + e.message; } };
  check('perf-aim gate guard: the census expression reads absent / null / the census without throwing',
    page({}) === 'absent' && page(undefined) === 'absent' && page({ gpuGate: () => null }) === null
    && JSON.stringify(page({ gpuGate: () => ({ units: 3, held: 1 }) })) === '{"units":3,"held":1}', [page({}), page({ gpuGate: () => null })]);
  const run = async ({ soft, gate, url = 'http://127.0.0.1/app.html?seed=1&obtool=0' }) => {
    const notes = [];
    const fn = new Function('chrome', 'note', 'SOFT_GPU', 'URL_', `return (async () => {\n${body}  return 'passed';\n})();`);
    try { return { r: await fn({ eval: async () => gate }, (m) => notes.push(m), soft, url), notes }; } catch (e) { return { error: String(e?.message ?? e), notes }; }
  };
  let r = await run({ soft: true, gate: { units: 18, held: 6201, invalid: 0, forced: false, pending: 3 } });
  check('perf-aim gate guard: a software GPU with a live gate passes and logs the census', r.r === 'passed'
    && r.notes.join() === 'gpu gate census at ready: {"units":18,"held":6201,"invalid":0,"forced":false,"pending":3}', r);
  r = await run({ soft: true, gate: null });
  check('perf-aim gate guard: a software GPU with a null gate fails by name', r.error === 'software GPU but the GPU gate is off (GH-248 / KF-008): __test.gpuGate() = null', r);
  r = await run({ soft: true, gate: 'absent' });
  check('perf-aim gate guard: a software GPU with no gate census (absent) fails by name', r.error === 'software GPU but the GPU gate is off (GH-248 / KF-008): __test.gpuGate() = "absent"', r);
  r = await run({ soft: true, gate: null, url: 'http://127.0.0.1/app.html?seed=1&obtool=0&obgpugate=0' });
  check('perf-aim gate guard: the ?obgpugate=0 measurement seam is exempt', r.r === 'passed', r);
  r = await run({ soft: false, gate: null });
  check('perf-aim gate guard: a hardware GPU with a null gate passes (the gate is software-GL only)', r.r === 'passed' && r.notes.join() === 'gpu gate census at ready: null', r);
}

console.log(fails ? `BOOT-TRACE TEST FAIL (${fails} of ${checks})` : `BOOT-TRACE TEST PASS (${checks} checks)`);
process.exit(fails ? 1 : 0);
