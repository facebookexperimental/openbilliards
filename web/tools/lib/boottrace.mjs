// Copyright (c) Meta Platforms, Inc. and affiliates.

// boottrace.mjs — GH-248 CI diagnostic: a Chrome trace through a slow boot, written only when it is needed.
//
// The hosted perf job (ubuntu-latest, 2 cores, SwiftShader WebGL + software compositing) sometimes blocks ONE CDP
// evaluate past its 300 s deadline at the ready transition. On software GL every renderer task over 2 s is a compositor
// main frame whose Commit runs one synchronous GLES2::ReadPixels — the canvas readback — that waits for SwiftShader to
// execute the frame's GL work (program compiles, env-cube bakes). That was named on a local SwiftShader trace; this
// records the hosted VM's own frame:
//   * tracing runs on the BROWSER endpoint over its own websocket, so a page session that cdp.mjs has declared wedged
//     (it closes only its own socket and leaves Chrome running) cannot stop the trace from being read back;
//   * categories are the three the frame needs: toplevel (each task and its source, e.g. ScheduledActionSendBeginMain-
//     Frame), gpu (GLES2::ReadPixels, the command-buffer waits, program queries, the GPU process's WebGL tasks) and
//     devtools.timeline (the frame's JS: FireAnimationFrame / FunctionCall / TimerFire with function, url and line);
//   * the trace starts BEFORE the app loads (launchWithBootTrace): the clock starts before Chrome is launched, Chrome
//     boots on the app origin's root (an http page with no app byte), the trace starts, and only then does the page
//     navigate to the app, so a stall anywhere in the app's boot, or a slow launch, is inside the trace and the clock;
//   * Chrome gzips the stream itself; the file is written only when the boot reached ready at or after the threshold
//     (default 120 s from the launch), never reached it, or the run failed (the 300 s stall path included; the why file
//     carries the failure). Otherwise the socket is just closed: the session detaches and Chrome drops the trace
//     without serializing it.
import fs from 'node:fs';
import path from 'node:path';

export const BOOT_TRACE_CATEGORIES = Object.freeze(['toplevel', 'gpu', 'devtools.timeline']);
export const BOOT_TRACE_THRESHOLD_S = 120;

/** Pure: keep the trace? `readyAtS` = seconds from the launch to __test.ready (null = never), `failed` = the run threw
 * or its gate failed, `reason` = what failed (kept on one line, at most 300 characters, in the why). The node arm
 * (web/tools/test-boottrace.mjs) drives this table. */
export function bootTraceDecision({ readyAtS = null, failed = false, reason = '', thresholdS = BOOT_TRACE_THRESHOLD_S } = {}) {
  if (failed) {
    const r = String(reason ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
    return { keep: true, why: 'the run failed (the stall path included)' + (r ? ': ' + r : '') };
  }
  if (typeof readyAtS !== 'number' || !Number.isFinite(readyAtS)) return { keep: true, why: 'the boot never reached ready' };
  if (readyAtS >= thresholdS) return { keep: true, why: `ready ${readyAtS.toFixed(1)} s after the launch (>= ${thresholdS} s)` };
  return { keep: false, why: `ready ${readyAtS.toFixed(1)} s after the launch (< ${thresholdS} s)` };
}

/** cdp.mjs's withToolParam, which is private (touch-cdp.mjs keeps the same copy for the same reason): stamp `obtool=1`
 * onto a tool-boot URL before any #fragment, unless the query already names obtool. launchChrome stamps the URL it is
 * given; the traced launch boots on the origin root with tool:false and navigates here, so it must stamp the same way.
 * The node arm compares this with cdp.mjs's own copy. */
export function toolUrl(url) {
  const [base, hash] = url.split('#');
  if (/[?&]obtool=/.test(base)) return url;
  return base + (base.includes('?') ? '&' : '?') + 'obtool=1' + (hash !== undefined ? '#' + hash : '');
}

/** The traced launch, in the order the diagnostic needs (review P2 on 7e97d8a5: launching on the app URL ran the app's
 * boot, and its first frames, inside launchChrome's page-domain init, before the trace started and outside the clock):
 *   1. the clock starts before Chrome is launched, so a slow launch counts toward the threshold;
 *   2. `launch(url)` boots Chrome on the app origin's root, an http page with no app byte (cdp.mjs attaches only to an
 *      http page target; touch-cdp.mjs launchPhone boots the same way). A launch that throws rejects as before: no
 *      trace is running yet and no app byte was loaded;
 *   3. `start()` (a startBootTrace) starts the trace; if it cannot, the run goes on untraced (noted);
 *   4. only then does the page navigate to `navUrl`. A navigation that fails is returned as `navError`, never thrown:
 *      the caller fails the run with it, and the trace is kept for it.
 * Returns { chrome, t0, navError, ready(), end(failed, reason) }: ready() stamps seconds from the launch once; end() keeps
 * or discards the trace by bootTraceDecision, once, and never throws (a no-op when no trace is running). */
export async function launchWithBootTrace({ appUrl, navUrl = appUrl, launch, start, dir, thresholdS = BOOT_TRACE_THRESHOLD_S,
  now = Date.now, note = () => {} }) {
  const root = new URL(appUrl).origin + '/';
  const t0 = now();
  const chrome = await launch(root);
  let trace = null;
  try {
    trace = await start();
    note(`boot trace: recording from before the app navigation (kept if ready >= ${thresholdS} s after the launch, or on a failure)`);
  } catch (e) { note(`boot trace: not started (${e?.message ?? e})`); }
  let navError = null;
  try {
    const r = await chrome.send('Page.navigate', { url: navUrl });
    if (r?.errorText) navError = new Error(`the app navigation failed: ${r.errorText}`);
  } catch (e) { navError = new Error(`the app navigation failed: ${e?.message ?? e}`); }
  let readyAtS = null;
  return {
    chrome, t0, navError,
    ready() { if (readyAtS === null) readyAtS = (now() - t0) / 1000; return readyAtS; },
    async end(failed, reason = '') {
      if (!trace) return null;
      const t = trace; trace = null;
      const d = bootTraceDecision({ readyAtS, failed, reason, thresholdS });
      const r = await t.finish({ keep: d.keep, dir, why: d.why });
      note(`boot trace: ${d.keep ? (r.file ? 'written ' + r.file : 'NOT written (' + r.error + ')') : 'discarded'} — ${d.why}`);
      return { ...d, ...r };
    },
  };
}

const within = (p, ms, what) => {
  let t = null;
  const deadline = new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`boot trace: ${what} did not answer within ${ms} ms`)), ms); });
  return Promise.race([p, deadline]).finally(() => clearTimeout(t));
};

/** Start tracing on the browser endpoint of the Chrome whose debugging port is `cdpPort`. Resolves to a handle whose
 * finish({ keep, dir, why }) ends the trace: keep writes `<dir>/boot-trace.json.gz` (+ boot-trace.why.txt); discard just
 * closes the socket (the session detaches and Chrome drops its trace — no serialization). finish never throws: a dead
 * browser yields { file: null, error } at once (a closed socket rejects every pending and later command), a read that
 * fails mid-stream leaves `boot-trace.partial.json.gz` with the error in the why file. `timeoutMs` bounds each command
 * of the start; `endTimeoutMs` bounds the WHOLE keep path (Tracing.end, Chrome's serialization of the run, every read),
 * so a kept trace never adds more than that to the run. */
export async function startBootTrace({ cdpPort, fetchImpl = fetch, WebSocketImpl = globalThis.WebSocket,
  bufferKb = 409600, timeoutMs = 120000, endTimeoutMs = 120000 } = {}) {
  const ver = await within(fetchImpl(`http://127.0.0.1:${cdpPort}/json/version`).then((r) => r.json()), timeoutMs, '/json/version');
  const ws = new WebSocketImpl(ver.webSocketDebuggerUrl);
  let closed = null; // why the socket is gone, once it is
  const pending = new Map(); let nextId = 0; let complete = null, abort = null;
  const completed = new Promise((res, rej) => { complete = res; abort = rej; });
  completed.catch(() => {}); // observed by finish only; never an unhandled rejection
  const gone = (why) => {
    if (closed) return;
    closed = why;
    for (const p of pending.values()) p.rej(new Error(`boot trace: ${why}`));
    pending.clear();
    abort(new Error(`boot trace: ${why}`));
  };
  ws.onclose = () => gone('the browser websocket closed');
  let send = null;
  try {
    await within(new Promise((res, rej) => { ws.onopen = () => res(); ws.onerror = () => rej(new Error('boot trace: the browser websocket did not open')); }),
      timeoutMs, 'the browser websocket');
    ws.onerror = () => gone('the browser websocket failed');
    ws.onmessage = (m) => {
      let msg; try { msg = JSON.parse(typeof m.data === 'string' ? m.data : Buffer.from(m.data).toString('utf8')); } catch { return; }
      if (msg.id !== undefined && pending.has(msg.id)) {
        const p = pending.get(msg.id); pending.delete(msg.id);
        if (msg.error) p.rej(new Error(`boot trace: ${msg.error.message}`)); else p.res(msg.result ?? {});
      } else if (msg.method === 'Tracing.tracingComplete') complete(msg.params ?? {});
    };
    send = (method, params = {}, ms = timeoutMs, what = method) => within(new Promise((res, rej) => {
      if (closed || ws.readyState !== 1 /* OPEN */) { rej(new Error(`boot trace: ${closed ?? 'the browser websocket is not open'}`)); return; }
      const id = ++nextId; pending.set(id, { res, rej });
      ws.send(JSON.stringify({ id, method, params }));
    }), ms, what);
    await send('Tracing.start', { traceConfig: { includedCategories: [...BOOT_TRACE_CATEGORIES], recordMode: 'recordContinuously',
      traceBufferSizeInKb: bufferKb }, transferMode: 'ReturnAsStream', streamFormat: 'json', streamCompression: 'gzip' });
  } catch (e) {
    try { ws.close(); } catch { /* already closed */ }
    throw e;
  }
  let finished = false;
  return {
    async finish({ keep, dir, why = '' }) {
      if (finished) return { file: null, error: 'finished already' };
      finished = true;
      if (!keep) { try { ws.close(); } catch { /* already closed */ } return { file: null }; }
      let file = null;
      const until = Date.now() + endTimeoutMs; // the finish budget: Tracing.end, serialization and every read share it
      const left = () => Math.max(1, until - Date.now());
      const budget = (what) => `${what} (the ${endTimeoutMs} ms finish budget)`;
      try {
        await send('Tracing.end', {}, left(), budget('Tracing.end'));
        const { stream } = await within(completed, left(), budget('Tracing.tracingComplete'));
        fs.mkdirSync(dir, { recursive: true });
        file = path.join(dir, 'boot-trace.json.gz');
        const fd = fs.openSync(file, 'w');
        try {
          for (;;) {
            const r = await send('IO.read', { handle: stream, size: 4 << 20 }, left(), budget('IO.read'));
            if (r.data) fs.writeSync(fd, r.base64Encoded ? Buffer.from(r.data, 'base64') : Buffer.from(r.data, 'utf8'));
            if (r.eof) break;
          }
        } finally { fs.closeSync(fd); }
        await send('IO.close', { handle: stream }, Math.min(left(), 5000)).catch(() => {}); // the bytes are on disk already
        // a Chrome that ignored streamCompression sent plain JSON: name the file for what it holds
        const head = Buffer.alloc(2); const rfd = fs.openSync(file, 'r'); fs.readSync(rfd, head, 0, 2, 0); fs.closeSync(rfd);
        let out = file;
        if (!(head[0] === 0x1f && head[1] === 0x8b)) { out = path.join(dir, 'boot-trace.json'); fs.renameSync(file, out); }
        fs.writeFileSync(path.join(dir, 'boot-trace.why.txt'), why + '\n');
        return { file: out };
      } catch (e) {
        const error = String(e?.message ?? e);
        if (file && fs.existsSync(file)) { // a read failed mid-stream: keep what arrived, named for what it is
          try {
            fs.renameSync(file, path.join(dir, 'boot-trace.partial.json.gz'));
            fs.writeFileSync(path.join(dir, 'boot-trace.why.txt'), `${why} — PARTIAL: ${error}\n`);
          } catch { /* best effort */ }
        }
        return { file: null, error };
      } finally {
        try { ws.close(); } catch { /* already closed */ }
      }
    },
  };
}
