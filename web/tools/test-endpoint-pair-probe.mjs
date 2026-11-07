// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-endpoint-pair-probe.mjs — #763: lib/endpoint-pair.mjs judges a candidate free ONLY on ECONNREFUSED, gives a probe
// that times out one longer look before skipping it, and warms fetch before its first timed probe. Hygiene 8o (1)/(2)
// failed because a FREE port's first probe (a process's first fetch: its lazy initialisation inside the 400 ms timer)
// timed out and was skipped, shifting the pair by one. Plain node, no browser; a private registry, a private registry
// mutex port and a fake lock root (the OB_PORT_BANDS_DIR / OB_BAND_MUTEX_PORT / OB_CDP_LOCK_DIR seams); every port
// is outside the declared bands and verified bindable.
//
//   E1 a slow-first-probe stand-in (the first probe of a FREE port times out, the next is refused): the candidate is
//      reserved, not skipped — the probe was called twice (400 ms, then the 2000 ms look)
//   E2 a busy-but-slow port (every probe times out) is still skipped after the longer look; the next free port wins
//   E3 an http answer is occupied at once (no second look); E4 ECONNREFUSED is free at once (no second look)
//   E5 the default probe in a fresh process: the first fetch is the warm-up (to the claimed candidate, result
//      ignored), then the timed probe; the free candidate is reserved — the warm-up's own proof
//   (E6 is defence in depth: the warm-up and the longer look each absorb a starved first fetch on their own)
//   E6 the realistic stand-in: in a fresh process whose FIRST fetch call takes 600 ms (a starved first initialisation),
//      the default probe still reserves the free first candidate (the old probe skipped it)
//
//   node web/tools/test-endpoint-pair-probe.mjs      # exit 0/1; last line PASS (n) / FAIL (k of n)
//   OB_ENDPOINT_PAIR_PROBE=<copy>/web/tools/lib/endpoint-pair.mjs node ...   # judge a plant copy
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SUBJECT = path.resolve(process.env.OB_ENDPOINT_PAIR_PROBE || path.join(HERE, 'lib', 'endpoint-pair.mjs'));
const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'ob-endpoint-pair-probe-'));
const REG = path.join(stage, 'reg'); const LOCKS = path.join(stage, 'locks'); fs.mkdirSync(REG); fs.mkdirSync(LOCKS);
for (const k of ['GITHUB_ACTIONS', 'OB_CI_BANDS', 'CI', 'OB_E2E_PORT', 'OB_E2E_CDP_PORT', 'OB_CDP_PORT', 'OB_PORT_BANDS']) delete process.env[k];
Object.assign(process.env, { OB_PORT_BANDS_DIR: REG, OB_CDP_LOCK_DIR: LOCKS, OB_BAND_MUTEX_PORT: String(38700 + (process.pid % 90)) });
const lib = await import(pathToFileURL(SUBJECT).href);
const cib = await import(pathToFileURL(path.join(path.dirname(SUBJECT), 'ci-bands.mjs')).href);

const rows = [];
const row = (id, ok, desc, detail = '') => { rows.push({ id, ok: !!ok }); console.log(`${ok ? 'PASS' : 'FAIL'} ${id} — ${desc}${ok ? '' : `: ${String(detail).slice(0, 700)}`}`); };
const bindable = (port) => new Promise((r) => { const s = net.createServer(); s.once('error', () => r(false)); s.listen(port, '127.0.0.1', () => s.close(() => r(true))); });
const lanes = (() => { try { return cib.declaredBands(cib.loadCiBands(), cib.loadLaneBands()); } catch { return []; } })();
setTimeout(() => { console.log('FAIL watchdog — the probe exceeded 90 s'); fs.rmSync(stage, { recursive: true, force: true }); process.exit(1); }, 90000).unref();
/** a 10-port window in 46000-46990, outside every declared band, every port bindable */
const windowAt = async (salt) => {
  for (let t = 0; t < 20; t++) {
    const lo = 46000 + ((((process.pid + salt * 17) % 99) + t * 7) % 99) * 10;
    if (lanes.some((d) => cib.bandsIntersect(d.range ?? d, { start: lo, end: lo + 9 }))) continue;
    let ok = true; for (let p = lo; p <= lo + 9 && ok; p++) ok = await bindable(p);
    if (ok) return lo;
  }
  return null;
};
const timeoutErr = () => Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
const refusedErr = () => Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
const spec = { tool: 'test-endpoint-pair-probe', role: 'cdp', expr: 'B' };

try {
  {
    const B = await windowAt(1); const calls = [];
    const probe = async (p, ms) => { calls.push([p, ms]); if (calls.filter(([q]) => q === p).length === 1 && p === B) throw timeoutErr(); throw refusedErr(); };
    const r = await lib.reserveEndpoint(B, 3, spec, { probe });
    row('E1', r.port === B && calls.length === 2 && calls[0][1] === lib.PROBE_MS && calls[1][1] === lib.PROBE_RETRY_MS,
      'a slow-first-probe stand-in: the free first candidate is reserved after the longer look, never skipped', JSON.stringify({ B, port: r.port, calls }));
    r.release();
  }
  {
    const B = await windowAt(2); const calls = [];
    const probe = async (p, ms) => { calls.push([p, ms]); if (p === B) throw timeoutErr(); throw refusedErr(); };
    const r = await lib.reserveEndpoint(B, 3, spec, { probe });
    row('E2', r.port === B + 1 && calls.filter(([q]) => q === B).length === 2,
      'a busy-but-slow port (every probe times out) is skipped after the longer look; the next free port wins', JSON.stringify({ B, port: r.port, calls }));
    r.release();
  }
  {
    const B = await windowAt(3); const calls = [];
    const probe = async (p, ms) => { calls.push([p, ms]); if (p === B) return; throw refusedErr(); };
    const r = await lib.reserveEndpoint(B, 3, spec, { probe });
    const ok3 = r.port === B + 1 && calls.filter(([q]) => q === B).length === 1; r.release();
    const calls4 = [];
    const r4 = await lib.reserveEndpoint(B, 3, spec, { probe: async (p, ms) => { calls4.push([p, ms]); throw refusedErr(); } });
    const ok4 = r4.port === B && calls4.length === 1; r4.release();
    row('E3', ok3, 'an http answer is occupied at once: skipped with no second look', JSON.stringify({ B, port: r.port, calls }));
    row('E4', ok4, 'ECONNREFUSED is free at once: reserved with no second look', JSON.stringify({ port: r4.port, calls4 }));
  }
  // E5 / E6: the default probe in a fresh process; fetch is wrapped before the module loads (a log, and for E6 a 600 ms
  // delay on the FIRST call only — the starved first initialisation)
  const fresh = async (salt, slowFirstMs) => {
    const B = await windowAt(salt);
    const src = `const real = globalThis.fetch; const log = []; let n = 0;
globalThis.fetch = async (url, init) => { const i = n++; const t0 = performance.now(); if (i === 0 && ${slowFirstMs} > 0) await new Promise((r) => setTimeout(r, ${slowFirstMs}));
  try { const r = await real(url, init); log.push({ i, url: String(url), ms: Math.round(performance.now() - t0), out: 'answered' }); return r; } catch (e) { log.push({ i, url: String(url), ms: Math.round(performance.now() - t0), out: e?.cause?.code ?? e?.name }); throw e; } };
const lib = await import(${JSON.stringify(pathToFileURL(SUBJECT).href)});
const r = await lib.reserveEndpoint(${B}, 3, { tool: 'test-endpoint-pair-probe', role: 'cdp', expr: 'B' });
console.log('RESULT ' + JSON.stringify({ port: r.port, log })); r.release(); process.exit(0);`;
    const f = path.join(stage, `fresh-${salt}.mjs`); fs.writeFileSync(f, src);
    const run = spawnSync(process.execPath, [f], { encoding: 'utf8', env: process.env, timeout: 30000 });
    const m = /^RESULT (.*)$/m.exec(run.stdout ?? '');
    return { B, res: m ? JSON.parse(m[1]) : { crashed: `${run.status} ${(run.stderr ?? '').slice(-300)}` } };
  };
  {
    const { B, res } = await fresh(5, 0);
    const log = res.log ?? [];
    row('E5', res.port === B && log.length >= 2 && log[0].url.includes(`:${B}/`) && log[1].url.includes(`:${B}/`) && log[1].out === 'ECONNREFUSED',
      'the default probe in a fresh process: a warm-up fetch first (its result ignored), then the timed probe; the free candidate is reserved', JSON.stringify({ B, res }));
  }
  {
    const { B, res } = await fresh(6, 600);
    row('E6', res.port === B, 'a fresh process whose FIRST fetch takes 600 ms (a starved initialisation) still reserves the free first candidate', JSON.stringify({ B, res }));
  }
} catch (e) {
  row('X', false, 'probe exception', e.stack ?? e.message);
} finally {
  fs.rmSync(stage, { recursive: true, force: true });
}
const bad = rows.filter((r) => !r.ok);
console.log(bad.length ? `ENDPOINT-PAIR-PROBE SELFTEST FAIL (${bad.length} of ${rows.length}: ${bad.map((r) => r.id).join(', ')})` : `ENDPOINT-PAIR-PROBE SELFTEST PASS (${rows.length})`);
process.exit(bad.length ? 1 : 0);
