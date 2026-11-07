// Copyright (c) Meta Platforms, Inc. and affiliates.

// port-state.mjs — #763: what a loopback TCP port is doing, in three states; a timeout is never a verdict.
//
// One connect to 127.0.0.1:<port> answers 'listening' (it connected), 'refused' (ECONNREFUSED: nothing listens) or
// 'unknown' (the timeout, or any other error). On this host a loopback connect under load has a latency tail past
// 400 ms: in 9 of 9 traced hygiene 8h (r4) failures (2026-10-15, load1 53-58) a one-shot 400 ms probe timed out on a
// LISTENING server whose connect completed 10-115 ms later. A probe that maps that timeout to "not listening" reads a
// live server as down; the same mapping in a teardown check reads a surviving server as gone. Callers that need a
// verdict wait for the state they need with awaitPortState, and 'unknown' satisfies neither.
import net from 'node:net';

export const PORT_STATE_TIMEOUT_MS = 3000;

/** Block the event loop for `ms` (test seam: the measured race — a probe process not running while its connect completes). */
function stall(ms) {
  if (ms > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** 'listening' | 'refused' | 'unknown' for one connect to host:port, bounded at timeoutMs. `stallMs` (tests only)
 * blocks the event loop on the next tick — after Node has issued the connect (an IP literal connects on a
 * process.nextTick queued inside net.connect) — so the connect completes while the process is blocked, and the
 * timer, due by then, runs before the completion is processed, as on a starved host. */
export function portState(port, { host = '127.0.0.1', timeoutMs = PORT_STATE_TIMEOUT_MS, stallMs = 0 } = {}) {
  return new Promise((resolve) => {
    const c = net.connect({ port: Number(port), host });
    let settled = false;
    const end = (state) => { if (settled) return; settled = true; try { c.destroy(); } catch { /* closed */ } resolve(state); };
    c.once('connect', () => end('listening'));
    c.once('error', (e) => end(e.code === 'ECONNREFUSED' ? 'refused' : 'unknown'));
    c.setTimeout(timeoutMs, () => end('unknown'));
    if (stallMs > 0) process.nextTick(() => stall(stallMs)); // queued after net.connect's own connect tick
  });
}

/** Re-probe every stepMs until the port is in state `want` ('listening' or 'refused') or boundMs has passed.
 * Resolves { ok, last, probes, ms }; 'unknown' never satisfies either state. */
export async function awaitPortState(port, want, { boundMs = 15000, stepMs = 100, ...probeOpts } = {}) {
  const t0 = Date.now();
  let last = null;
  let probes = 0;
  for (;;) {
    last = await portState(port, probeOpts);
    probes += 1;
    if (last === want) return { ok: true, last, probes, ms: Date.now() - t0 };
    if (Date.now() - t0 >= boundMs) return { ok: false, last, probes, ms: Date.now() - t0 };
    await new Promise((r) => setTimeout(r, stepMs));
  }
}
