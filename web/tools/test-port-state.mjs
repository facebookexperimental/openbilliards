// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-port-state.mjs — #763: lib/port-state.mjs reads a loopback port as listening / refused / unknown, and a connect
// that times out is never a verdict. Plain node, no browser; every listener is this probe's own, on a free port it
// verified bindable first.
//
//   PS1 a listening port reads 'listening', also when the process stalls 600 ms on the tick after the connect is
//       issued (the measured race: on a starved host the connect completes while the probe's process is not running)
//   PS2 a free port reads 'refused', also under the 600 ms stall
//   PS3 the race reproduced: with a 400 ms timeout (the old probe's) and the 600 ms stall, a LISTENING port reads
//       'unknown' — and 'unknown' is what it reads, never 'refused' (PS3b: a free port under the same race is
//       'unknown' too), so no teardown check can pass on a timeout
//   PS4 awaitPortState(…, 'listening') sees a server that starts 1.5 s late (re-probes; one probe would read refused)
//   PS5 awaitPortState(…, 'refused') on a port that keeps listening fails at its bound, last state 'listening'
//   PS6 awaitPortState(…, 'refused') sees a server that closes after 1 s
//   PS7 'unknown' satisfies no wait: a probe whose every reading is 'unknown' fails awaitPortState(…, 'refused') AND
//       awaitPortState(…, 'listening') at their bounds. The 'unknown' comes from a TCP connect to a multicast address,
//       which fails at once (EAFNOSUPPORT on macOS, ENETUNREACH on Linux; never connected, never refused, no packet
//       sent): it does not depend on which event-loop phase a re-probe starts in (the race above only reproduces for
//       a probe started from an I/O callback, and awaitPortState re-probes from a timer)
//
//   node web/tools/test-port-state.mjs        # exit 0/1; last line PASS (n) / FAIL (k of n)
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SUBJECT = path.resolve(process.env.OB_PORT_STATE_PROBE || path.join(HERE, 'lib', 'port-state.mjs'));
const { portState, awaitPortState } = await import(pathToFileURL(SUBJECT).href);

const rows = [];
const row = (id, ok, desc, detail = '') => { rows.push({ id, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${id} — ${desc}${ok ? '' : `: ${detail}`}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const bindable = (port) => new Promise((r) => { const s = net.createServer(); s.once('error', () => r(false)); s.listen(port, '127.0.0.1', () => s.close(() => r(true))); });
const listen = (port) => new Promise((r, j) => { const s = net.createServer((c) => c.destroy()); s.once('error', j); s.listen(port, '127.0.0.1', () => r(s)); });
const close = (s) => new Promise((r) => s.close(() => r()));
// free ports in 41000-41999 (outside the declared bands' usual homes), checked bindable now
const free = [];
for (let p = 41000 + (process.pid % 900); free.length < 6 && p < 42000; p += 7) if (await bindable(p)) free.push(p);
setTimeout(() => { console.log('FAIL watchdog — the probe exceeded 60 s'); process.exit(1); }, 60000).unref();

try {
  const [pA, pB, pC, pD, pE] = free;
  {
    const s = await listen(pA);
    const plain = await portState(pA); const stalled = await portState(pA, { stallMs: 600 });
    row('PS1', plain === 'listening' && stalled === 'listening', 'a listening port reads listening, also under a 600 ms stall on the tick after the connect is issued', JSON.stringify({ plain, stalled }));
    const raced = await portState(pA, { timeoutMs: 400, stallMs: 600 });
    row('PS3', raced === 'unknown', 'the race: with the old 400 ms timeout and a 600 ms stall, a LISTENING port reads unknown (never a verdict)', raced);
    const mc = { host: '224.0.0.1', timeoutMs: 400 };
    const one = await portState(pA, mc);
    const wr = await awaitPortState(pA, 'refused', { boundMs: 1200, ...mc });
    const wl = await awaitPortState(pA, 'listening', { boundMs: 1200, ...mc });
    row('PS7', one === 'unknown' && !wr.ok && wr.last === 'unknown' && wr.probes > 1 && !wl.ok && wl.last === 'unknown' && wl.probes > 1,
      'unknown satisfies no wait: a probe that only ever reads unknown fails a refused-wait and a listening-wait at their bounds', JSON.stringify({ one, wr, wl }));
    await close(s);
  }
  {
    const plain = await portState(pB); const stalled = await portState(pB, { stallMs: 600 });
    row('PS2', plain === 'refused' && stalled === 'refused', 'a free port reads refused, also under a 600 ms stall', JSON.stringify({ plain, stalled }));
    const raced = await portState(pB, { timeoutMs: 400, stallMs: 600 });
    row('PS3b', raced === 'unknown', 'a free port under the same race reads unknown, never refused: a timeout cannot pass a teardown check', raced);
  }
  {
    let s = null; const t = setTimeout(async () => { s = await listen(pC); }, 1500);
    const first = await portState(pC);
    const w = await awaitPortState(pC, 'listening', { boundMs: 8000 });
    clearTimeout(t); if (s) await close(s);
    row('PS4', first === 'refused' && w.ok && w.probes > 1, 'awaitPortState sees a server that starts 1.5 s late (one probe read refused)', JSON.stringify({ first, w }));
  }
  {
    const s = await listen(pD);
    const w = await awaitPortState(pD, 'refused', { boundMs: 1500 });
    await close(s);
    row('PS5', !w.ok && w.last === 'listening', 'awaitPortState(refused) on a port that keeps listening fails at its bound, last state listening', JSON.stringify(w));
  }
  {
    const s = await listen(pE); setTimeout(() => s.close(), 1000);
    const w = await awaitPortState(pE, 'refused', { boundMs: 6000 });
    row('PS6', w.ok && w.probes > 1, 'awaitPortState(refused) sees a server that closes after 1 s', JSON.stringify(w));
  }
} catch (e) {
  row('X', false, 'probe exception', e.stack ?? e.message);
}
const bad = rows.filter((r) => !r.ok);
console.log(bad.length ? `PORT-STATE SELFTEST FAIL (${bad.length} of ${rows.length}: ${bad.map((r) => r.id).join(', ')})` : `PORT-STATE SELFTEST PASS (${rows.length})`);
process.exit(bad.length ? 1 : 0);
