// Copyright (c) Meta Platforms, Inc. and affiliates.

// cdp-lite.mjs — PENDING CDP REQUESTS SETTLE ON DISCONNECT (ORDER-CN8-731-FIX3, review round 3 on #731
// P2 (c)). The hand-rolled loops in the in-page tools kept a pending Map with no close handler and no
// command deadline: a request in flight when Chrome exited never settled and the readiness loops kept
// polling. This client: every pending request is rejected when the socket closes or errors (the error
// names the count left pending), every command carries a deadline (default 120 s, overridable per call),
// and `closed` lets a readiness loop stop early. Cleanup stays the caller's (it owns Chrome + the server).
const _envDeadline = Number(process.env.OB_CDP_COMMAND_DEADLINE_MS);
export const CDP_COMMAND_DEADLINE_MS = Number.isFinite(_envDeadline) && _envDeadline > 0 ? _envDeadline : 120000; // a non-numeric / non-positive env value falls back to the default rather than firing every deadline at once

import { refusal } from './serve-check.mjs';

/** FIX7 (review round 7 on #731 P2 B): a readiness poll retries only on a "not ready yet" answer or a transient evaluation
 *  error; a command DEADLINE or a CLOSED socket is a named refusal that leaves the poll at once, so the caller's cleanup
 *  kills the browser and the server (under run-gate the wrapper then finalizes its band claim — the tools hold no claim of their own) — a swallowed deadline was polled 300 × 120 s (~10 h). */
export async function pollEval(evalJ, expression, { tag = 'cdp', what = 'polling', fallback = null, opts } = {}) {
  try { return await evalJ(expression, opts); } catch (e) {
    if (e && (e.cdpDeadline || e.cdpClosed)) throw refusal(tag, `CDP ${e.cdpDeadline ? 'command deadline' : 'socket closed'} while ${what}: ${e.message} — the renderer stopped answering; the run stops here and its cleanup kills the browser and the server`);
    return fallback;
  }
}

export async function openCdp(wsUrl, { deadlineMs = CDP_COMMAND_DEADLINE_MS, onEvent = null } = {}) {
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = (e) => rej(new Error('CDP socket failed to open: ' + (e && e.message || 'error'))); });
  let id = 0; const pending = new Map(); const state = { closed: false, closeReason: null };
  const settleAll = (reason) => {
    if (state.closed) return; state.closed = true; state.closeReason = reason;
    const n = pending.size; const err = new Error(`CDP socket closed (${reason}) with ${n} pending request${n === 1 ? '' : 's'}`); err.cdpClosed = true; err.pendingCount = n;
    for (const { rej, timer } of pending.values()) { clearTimeout(timer); rej(err); }
    pending.clear();
  };
  ws.onclose = (ev) => settleAll(`code ${ev && ev.code}`);
  ws.onerror = () => settleAll('error');
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const { res, rej, timer } = pending.get(m.id); clearTimeout(timer); pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
    else if (onEvent && m.method) onEvent(m);
  };
  const send = (method, params = {}, { deadline = deadlineMs } = {}) => new Promise((res, rej) => {
    if (state.closed) { const e = new Error(`CDP socket already closed (${state.closeReason}); ${method} not sent`); e.cdpClosed = true; return rej(e); }
    const i = ++id;
    const timer = setTimeout(() => { if (pending.has(i)) { pending.delete(i); const e = new Error(`CDP ${method} exceeded its ${deadline} ms deadline`); e.cdpDeadline = true; rej(e); } }, deadline);
    pending.set(i, { res, rej, timer });
    try { ws.send(JSON.stringify({ id: i, method, params })); } catch (e) { clearTimeout(timer); pending.delete(i); rej(e); }
  });
  const evalJ = async (expression, opts) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, opts);
    if (r.exceptionDetails) throw new Error('eval exception: ' + JSON.stringify(r.exceptionDetails).slice(0, 800));
    return r.result.value;
  };
  const close = () => { try { ws.close(); } catch {} };
  return { send, evalJ, close, state, pendingCount: () => pending.size };
}
