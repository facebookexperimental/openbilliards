// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-band-mutex-isolation.mjs — GH-1119: a node test that stages a PRIVATE band
// registry must arbitrate on a PRIVATE registry mutex too. test-orphan-browser-claim.mjs
// held the host-wide :47997 for its claims, whose reaping scans run 0.3-1.6 s each under
// load, and live claimants (a lane's title-card run, CI's hygiene arms) were starved past
// their 10 s acquisition bound. Plain node, no browser, and this probe never binds :47997.
//
// It runs the subject (test-orphan-browser-claim.mjs) with OB_BAND_MUTEX_PORT pointing at
// a stand-in "host" mutex port H. A subject that arbitrates on its own private port never
// binds H. One that does not (the pre-1119 subject inherits H, just as it used to share
// :47997) holds H for every claim. While the subject runs, a second claimant takes H
// every 50 ms, as withBandsMutex does, and times each acquisition.
//
//   M0 setup: a free stand-in host mutex port H (kernel-assigned), outside every declared band
//   M1 the subject passes (its own verdict line)
//   M2 every acquisition of H by the second claimant took ≤ 250 ms while the subject ran
//      (pre-1119: the subject's 0.3-1.6 s holds read as > 250 ms waits)
//   M3 the subject's traced mutex holds (OB_BAND_MUTEX_TRACE) all sit on a port that is
//      neither H nor the host-wide :47997, and there is at least one
//   M4 a claim refused by a live foreign claim names that claim's holders only AFTER the
//      mutex is released: the holder description's lsof (a stand-in first on PATH that
//      tries the mutex port, then runs the real lsof) finds the mutex free. Pre-1119 the
//      description (a ps + an lsof per holder: 3-12 s measured at load ~80, niced) ran
//      inside the critical section.
//   M5 the seam is refused over the SHARED registry under every spelling: OB_PORT_BANDS_DIR
//      /tmp/ob-port-bands, /private/tmp/ob-port-bands and a trailing slash, each with an
//      alternate OB_BAND_MUTEX_PORT, refuse at import — as the shared-registry refusal, never
//      a CI-context one (a set OB_PORT_BANDS_DIR is no proof of isolation; review GH-1119 P2)
//   M6 control: a private registry with the seam is accepted (the probes' own shape)
//   M7 a claim over a DEAD claim with nothing listening in its range sweeps it without running the
//      endpoint-evidence lsof while the mutex is held (a socket-table read gates the walk). Its band
//      is one with no listener at all (netstat); an unrelated listener planted in the first candidate
//      band proves the choice skips such a band (else the mutex-held pass rightly looks again: a false red)
//   M8 a claim over a dead claim whose range holds a LIVE harness-shaped listener is still refused
//      (the listener gets its discovery lease and keeps the claim), and every endpoint-evidence lsof
//      ran with the mutex FREE (the lockless pass before the mutex gathered it)
//
//   node web/tools/test-band-mutex-isolation.mjs      # exit 0/1; last line PASS (n) / FAIL (k of n)
//   OB_MUTEX_ISOLATION_SUBJECT=<copy>/web/tools/test-orphan-browser-claim.mjs node ...   # judge a base / plant copy
//
// macOS only, like the subject (its PPID-1 stand-ins need a host without a subreaper).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SUBJECT = path.resolve(process.env.OB_MUTEX_ISOLATION_SUBJECT || path.join(HERE, 'test-orphan-browser-claim.mjs'));
const BOUND_MS = 250;
const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'ob-band-mutex-isolation-'));
const TRACE = path.join(stage, 'trace.jsonl');
for (const k of ['GITHUB_ACTIONS', 'OB_CI_BANDS', 'CI', 'OB_BAND_MUTEX_PORT', 'OB_BAND_MUTEX_TRACE', 'OB_PORT_BANDS_DIR']) delete process.env[k];

const rows = [];
const row = (id, ok, desc, detail = '') => {
  rows.push({ id, ok: !!ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id} — ${desc}${ok ? '' : `: ${String(detail).slice(0, 700)}`}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** take port H exclusively (the withBandsMutex bind), retrying every 10 ms; resolves the wait in ms */
const acquire = async (port, capMs = 15000) => {
  const t0 = Date.now();
  for (;;) {
    const srv = net.createServer();
    const ok = await new Promise((r) => { srv.once('error', () => r(false)); srv.listen({ port, host: '127.0.0.1', exclusive: true }, () => r(true)); });
    if (ok) { await new Promise((r) => srv.close(() => r())); return Date.now() - t0; }
    if (Date.now() - t0 > capMs) return Date.now() - t0;
    await sleep(10);
  }
};

let lanes = null;
try {
  const cib = await import(pathToFileURL(path.join(path.dirname(SUBJECT), 'lib', 'ci-bands.mjs')).href); // imports cdp with no seam set: default :47997, never bound here
  lanes = cib.declaredBands(cib.loadCiBands(), cib.loadLaneBands());
} catch { lanes = null; }
// the stand-in mutex ports (H, and M4's private one) are ports the kernel hands out
// (listen on 0): free when picked, above every declared band (M0 checks)
const kernelPort = () => new Promise((r) => { const s = net.createServer(); s.once('error', () => r(null)); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const H = await kernelPort();
const recorded = new Set();
setTimeout(() => { console.log('FAIL watchdog — the probe exceeded 150 s'); for (const p of recorded) { try { process.kill(p, 'SIGKILL'); } catch { /* gone */ } } console.log('BAND-MUTEX-ISOLATION SELFTEST FAIL (watchdog)'); process.exit(1); }, 150000).unref();

try {
  row('M0', H !== null && lanes !== null && !lanes.some((d) => { const r = d.range ?? d; return r.start <= H && H <= r.end; }),
    'setup: a free stand-in host mutex port (kernel-assigned) outside every declared band', `H=${H} lanes=${lanes === null ? 'unloadable' : lanes.length}`);
  if (H !== null) {
    const sub = spawn(process.execPath, [SUBJECT], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, OB_BAND_MUTEX_PORT: String(H), OB_BAND_MUTEX_TRACE: TRACE } });
    recorded.add(sub.pid);
    let out = ''; sub.stdout.on('data', (d) => { out += d; }); sub.stderr.on('data', (d) => { out += d; });
    let done = false; const closed = new Promise((r) => sub.once('close', (code) => { done = true; r(code); }));
    const waits = [];
    while (!done) { waits.push(await acquire(H)); await sleep(50); }
    const code = await closed;
    const verdict = (/(ORPHAN-BROWSER-CLAIM SELFTEST \S+[^\n]*)/.exec(out) ?? [''])[0];
    row('M1', code === 0 && /SELFTEST PASS/.test(verdict), 'the subject passes', `${code} ${verdict || out.slice(-400)}`);
    const worst = Math.max(0, ...waits);
    row('M2', waits.length >= 20 && worst <= BOUND_MS, `every acquisition of the stand-in host mutex took ≤ ${BOUND_MS} ms while the subject ran`,
      `n=${waits.length} worst=${worst} ms over-bound=${waits.filter((w) => w > BOUND_MS).length}`);
    let holds = [];
    try { holds = fs.readFileSync(TRACE, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { holds = []; }
    const ports = [...new Set(holds.map((h) => h.port))];
    row('M3', holds.length >= 1 && ports.every((p) => p !== H && p !== 47997), 'the subject\'s traced mutex holds all sit on its own private port (never the stand-in host port, never :47997)',
      `holds=${holds.length} ports=${JSON.stringify(ports)} H=${H}`);
  }
  // ---- M4: the refusal is decided under the mutex, described after it --------------
  {
    const REG4 = path.join(stage, 'reg4'); const BIN = path.join(stage, 'bin'); const SEEN = path.join(stage, 'lsof-seen.txt');
    fs.mkdirSync(REG4); fs.mkdirSync(BIN);
    let P4 = null; // the private mutex port of this row's claimant
    for (let a = 0; a < 5 && (P4 === null || P4 === H); a++) P4 = await kernelPort();
    let lo = null; // a 30-port band outside every declared band (the claim is registry-only: nothing binds it)
    for (let a = 0; a < 20 && lo === null && lanes !== null; a++) {
      const s0 = 39100 + ((process.pid + a * 7) % 20) * 30;
      if (!lanes.some((d) => { const r = d.range ?? d; return r.start <= s0 + 29 && s0 <= r.end; })) lo = s0;
    }
    const realLsof = (process.env.PATH ?? '').split(':').map((d) => path.join(d, 'lsof'))
      .find((f) => { try { fs.accessSync(f, fs.constants.X_OK); return true; } catch { return false; } });
    const lstartOf = (pid) => { try { return execFileSync('ps', ['-o', 'lstart=', '-p', String(pid)], { encoding: 'utf8', env: { ...process.env, LC_ALL: 'C', LANG: 'C' } }).trim(); } catch { return ''; } }; // GH-1143: the registry's token form
    if (P4 === null || lo === null || !realLsof) {
      row('M4', false, 'setup: a private mutex port, a free band and the real lsof', `P4=${P4} lo=${lo} lsof=${realLsof}`);
    } else {
      // the stand-in lsof: a holder description's call (-p <pid>) records whether the
      // mutex port is free at that moment; every call then runs the real lsof
      fs.writeFileSync(path.join(BIN, 'lsof'), `#!${process.execPath}
const net = require('net'); const fs = require('fs'); const { spawnSync } = require('child_process');
const args = process.argv.slice(2);
const run = () => { const r = spawnSync(${JSON.stringify(realLsof)}, args, { stdio: 'inherit' }); process.exit(r.status ?? 1); };
if (!args.includes('-p')) run();
const s = net.createServer();
s.once('error', () => { fs.appendFileSync(${JSON.stringify(SEEN)}, 'held\\n'); run(); });
s.listen({ port: ${P4}, host: '127.0.0.1', exclusive: true }, () => s.close(() => { fs.appendFileSync(${JSON.stringify(SEEN)}, 'free\\n'); run(); }));
`, { mode: 0o755 });
      // a live foreign claim: claimant A, lease holder B (the holder the refusal names)
      const idle = () => { const k = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' }); recorded.add(k.pid); return k.pid; };
      const A = idle(); const B = idle();
      await sleep(300);
      const d = path.join(REG4, `${lo}-${lo + 29}.${A}`); fs.mkdirSync(d);
      fs.writeFileSync(path.join(d, 'owner.json'), JSON.stringify({ pid: A, lstart: lstartOf(A), at: Date.now(), layout: true, enforced: false }));
      fs.writeFileSync(path.join(d, `lease-${B}.json`), JSON.stringify({ pid: B, lstart: lstartOf(B), at: Date.now(), origin: 'launch' }));
      const cdpUrl = pathToFileURL(path.join(path.dirname(SUBJECT), 'cdp.mjs')).href;
      const kid = spawn(process.execPath, ['--input-type=module', '-e',
        `const cdp = await import(${JSON.stringify(cdpUrl)}); try { await cdp.claimPortBand(${lo}, ${lo + 29}); console.log('CLAIMED'); } catch (e) { console.log('REFUSED ' + e.message); }`],
      { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, OB_PORT_BANDS_DIR: REG4, OB_BAND_MUTEX_PORT: String(P4), PATH: `${BIN}:${process.env.PATH}` } });
      recorded.add(kid.pid);
      let kout = ''; kid.stdout.on('data', (x) => { kout += x; }); kid.stderr.on('data', (x) => { kout += x; });
      await new Promise((r) => kid.once('close', r));
      let seen = []; try { seen = fs.readFileSync(SEEN, 'utf8').trim().split('\n').filter(Boolean); } catch { seen = []; }
      row('M4', /^REFUSED .*overlaps the LIVE foreign claim/m.test(kout) && kout.includes(`held by pid ${B}`) && seen.length >= 1 && seen.every((x) => x === 'free'),
        'a refused claim names the foreign claim\'s holders only after the mutex is released (the description\'s lsof finds the mutex port free)',
        `seen=${JSON.stringify(seen)} out=${kout.slice(0, 500)}`);
    }
  }
  // ---- M5 / M6: the seam refuses the shared registry under every spelling ----------
  {
    const cdpUrl = pathToFileURL(path.join(path.dirname(SUBJECT), 'cdp.mjs')).href;
    const seamPort = String(H ?? 38999);
    const importWith = (dir) => new Promise((resolve) => {
      const k = spawn(process.execPath, ['--input-type=module', '-e',
        `try { const c = await import(${JSON.stringify(cdpUrl)}); console.log('ACCEPTED ' + c.BAND_MUTEX_PORT); } catch (e) { console.log('REFUSED ' + e.message); }`],
      { stdio: ['ignore', 'pipe', 'pipe'], cwd: os.tmpdir(), env: { ...process.env, OB_PORT_BANDS_DIR: dir, OB_BAND_MUTEX_PORT: seamPort } });
      recorded.add(k.pid);
      let out = ''; k.stdout.on('data', (x) => { out += x; }); k.stderr.on('data', (x) => { out += x; });
      k.once('close', () => resolve(out.trim()));
    });
    const verdicts = [];
    for (const dir of ['/tmp/ob-port-bands', '/private/tmp/ob-port-bands', '/tmp/ob-port-bands/']) verdicts.push([dir, await importWith(dir)]);
    row('M5', verdicts.every(([, v]) => /^REFUSED .*over the shared registry/.test(v)),
      'the seam is refused over the shared registry under every spelling (/tmp, /private/tmp, a trailing slash), as the shared-registry refusal',
      JSON.stringify(verdicts.map(([d, v]) => [d, v.slice(0, 160)])));
    const priv = path.join(stage, 'reg6'); fs.mkdirSync(priv);
    const v6 = await importWith(priv);
    row('M6', v6 === `ACCEPTED ${seamPort}`, 'control: a private registry with the seam is accepted', v6.slice(0, 300));
  }
  // ---- M7 / M8: the endpoint evidence (a host-wide lsof) never runs under the mutex ----
  {
    const realLsof = (process.env.PATH ?? '').split(':').map((d) => path.join(d, 'lsof'))
      .find((f) => { try { fs.accessSync(f, fs.constants.X_OK); return true; } catch { return false; } });
    const cdpUrl = pathToFileURL(path.join(path.dirname(SUBJECT), 'cdp.mjs')).href;
    const lstartOf = (pid) => { try { return execFileSync('ps', ['-o', 'lstart=', '-p', String(pid)], { encoding: 'utf8', env: { ...process.env, LC_ALL: 'C', LANG: 'C' } }).trim(); } catch { return ''; } };
    // a stand-in lsof: an endpoint-evidence call (-iTCP:<range> over every process; the refusal's holder
    // description also passes -iTCP but names its pid with -p, and M4 judges that one) records whether the
    // mutex port is free at that moment; every call then runs the real lsof
    const evidenceStandIn = (tag, mutexPort) => {
      const bin = path.join(stage, `bin-${tag}`); const seen = path.join(stage, `evidence-${tag}.txt`); fs.mkdirSync(bin);
      fs.writeFileSync(path.join(bin, 'lsof'), `#!${process.execPath}
const net = require('net'); const fs = require('fs'); const { spawnSync } = require('child_process');
const args = process.argv.slice(2);
const run = () => { const r = spawnSync(${JSON.stringify(realLsof)}, args, { stdio: 'inherit' }); process.exit(r.status ?? 1); };
if (!args.some((a) => a.startsWith('-iTCP:')) || args.includes('-p')) run();
const s = net.createServer();
s.once('error', () => { fs.appendFileSync(${JSON.stringify(seen)}, 'held\\n'); run(); });
s.listen({ port: ${mutexPort}, host: '127.0.0.1', exclusive: true }, () => s.close(() => { fs.appendFileSync(${JSON.stringify(seen)}, 'free\\n'); run(); }));
`, { mode: 0o755 });
      return { bin, read: () => { try { return fs.readFileSync(seen, 'utf8').trim().split('\n').filter(Boolean); } catch { return []; } } };
    };
    /** a dead, released claim with no lease over [lo, lo + 29] in registry `reg` */
    const deadClaim = (reg, lo) => {
      const dp = spawnSync(process.execPath, ['-e', '0']).pid;
      const d = path.join(reg, `${lo}-${lo + 29}.${dp}`); fs.mkdirSync(d, { recursive: true });
      fs.writeFileSync(path.join(d, 'owner.json'), JSON.stringify({ pid: dp, lstart: 'Mon Jan  1 00:00:00 2001', at: Date.now() - 60000, released: true, layout: true, enforced: false }));
      return d;
    };
    const claimWith = (reg, mutexPort, bin, lo) => new Promise((resolve) => {
      const kid = spawn(process.execPath, ['--input-type=module', '-e',
        `const cdp = await import(${JSON.stringify(cdpUrl)}); try { const c = await cdp.claimPortBand(${lo}, ${lo + 29}); console.log('CLAIMED'); c.release(); } catch (e) { console.log('REFUSED ' + e.message); }`],
      { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, OB_PORT_BANDS_DIR: reg, OB_BAND_MUTEX_PORT: String(mutexPort), PATH: `${bin}:${process.env.PATH}` } });
      recorded.add(kid.pid);
      let out = ''; kid.stdout.on('data', (x) => { out += x; }); kid.stderr.on('data', (x) => { out += x; });
      kid.once('close', () => resolve(out));
    });
    // M7: nothing listens in the dead claim's band — a registry-only band outside every declared one AND
    // with no listener at all (one netstat read; review #1119 P2). An unrelated listener planted in the
    // first candidate band keeps that choice honest on every run.
    const cand7 = (a) => 39100 + ((process.pid + a * 11 + 5) % 20) * 30;
    const noise = spawn(process.execPath, ['-e', `require('net').createServer().listen(${cand7(0) + 3}, '127.0.0.1')`], { stdio: 'ignore' });
    recorded.add(noise.pid);
    const listening = () => {
      try {
        return execFileSync('netstat', ['-an', '-p', 'tcp'], { encoding: 'utf8', timeout: 10000 }).split('\n')
          .map((l) => /^tcp\S*\s+\d+\s+\d+\s+(\S+)\s+\S+\s+LISTEN\b/.exec(l)).filter(Boolean)
          .map((m) => Number(m[1].slice(m[1].lastIndexOf('.') + 1)));
      } catch { return null; }
    };
    let noiseUp = false;
    for (let i = 0; i < 50 && !noiseUp; i++) { await sleep(100); noiseUp = (listening() ?? []).includes(cand7(0) + 3); }
    const ports7 = listening();
    let lo7 = null;
    for (let a = 0; a < 20 && lo7 === null && lanes !== null && ports7 !== null; a++) {
      const s0 = cand7(a);
      if (!lanes.some((d) => { const r = d.range ?? d; return r.start <= s0 + 29 && s0 <= r.end; })
        && !ports7.some((p) => p >= s0 && p <= s0 + 29)) lo7 = s0;
    }
    const P7 = await kernelPort();
    if (!realLsof || !noiseUp || lo7 === null || P7 === null) {
      row('M7', false, 'setup: the real lsof, the planted listener up, a listener-free band and a private mutex port', `lsof=${realLsof} noiseUp=${noiseUp} lo=${lo7} P7=${P7}`);
    } else {
      const reg7 = path.join(stage, 'reg7'); const d7 = deadClaim(reg7, lo7); const si7 = evidenceStandIn('m7', P7);
      const out7 = await claimWith(reg7, P7, si7.bin, lo7);
      const seen7 = si7.read();
      row('M7', /^CLAIMED/m.test(out7) && !fs.existsSync(d7) && !seen7.includes('held') && lo7 !== cand7(0),
        'a claim over a dead claim with nothing listening in its range sweeps it, and no endpoint-evidence lsof ran while the mutex was held (the band choice skipped the planted listener\'s band)',
        `band=${lo7} skipped=${cand7(0)} seen=${JSON.stringify(seen7)} deadClaimLeft=${fs.existsSync(d7)} out=${out7.slice(0, 400)}`);
    }
    // M8: a live harness-shaped listener (its argv carries --remote-debugging-port) inside the dead claim's band
    // the kernel hands ports out nearly in sequence: take the mutex port first, then a listener port far
    // enough from it that the dead claim's band (listener - 10 … + 19) never covers the mutex port
    const P8 = await kernelPort(); let kp = await kernelPort();
    for (let a = 0; a < 200 && kp !== null && P8 !== null && Math.abs(kp - P8) <= 40; a++) kp = await kernelPort();
    const lo8 = kp === null || P8 === null || Math.abs(kp - P8) <= 40 ? null : Math.min(kp - 10, 65506);
    if (!realLsof || lo8 === null) {
      row('M8', false, 'setup: the real lsof, a listener port and a private mutex port 40+ apart', `lsof=${realLsof} kp=${kp} P8=${P8}`);
    } else {
      const ep = spawn(process.execPath, ['-e', `require('net').createServer().listen(${kp}, '127.0.0.1')`, '--', `--remote-debugging-port=${kp}`], { stdio: 'ignore' });
      recorded.add(ep.pid);
      let up = false; for (let i = 0; i < 50 && !up; i++) { await sleep(100); up = !(await new Promise((r) => { const s2 = net.createServer(); s2.once('error', () => r(false)); s2.listen(kp, '127.0.0.1', () => s2.close(() => r(true))); })); }
      const reg8 = path.join(stage, 'reg8'); const d8 = deadClaim(reg8, lo8); const si8 = evidenceStandIn('m8', P8);
      const out8 = up ? await claimWith(reg8, P8, si8.bin, lo8) : '';
      const seen8 = si8.read();
      let lease = null; try { lease = JSON.parse(fs.readFileSync(path.join(d8, `lease-${ep.pid}.json`), 'utf8')); } catch { lease = null; }
      row('M8', up && /^REFUSED .*overlaps the LIVE foreign claim/m.test(out8) && out8.includes(`held by pid ${ep.pid}`) && lease?.origin === 'discovery'
        && lease?.lstart === lstartOf(ep.pid) && seen8.length >= 1 && seen8.every((x) => x === 'free'),
      'a claim over a dead claim with a live harness-shaped listener is refused (the listener holds a discovery lease), and every endpoint-evidence lsof ran with the mutex free',
      `up=${up} seen=${JSON.stringify(seen8)} lease=${JSON.stringify(lease)} out=${out8.slice(0, 400)}`);
    }
  }
} catch (e) {
  row('X', false, 'probe exception', e.stack ?? e.message);
} finally {
  for (const p of recorded) { try { process.kill(p, 0); process.kill(p, 'SIGKILL'); } catch { /* gone */ } }
  try { fs.rmSync(stage, { recursive: true, force: true }); } catch { /* raced */ }
}
const bad = rows.filter((r) => !r.ok);
console.log(bad.length ? `BAND-MUTEX-ISOLATION SELFTEST FAIL (${bad.length} of ${rows.length}: ${bad.map((r) => r.id).join(', ')})` : `BAND-MUTEX-ISOLATION SELFTEST PASS (${rows.length})`);
process.exit(bad.length ? 1 : 0);
