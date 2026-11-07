// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-orphan-browser-claim.mjs — GH-926 fix class B: the claim-time reap of an
// ORPHANED harness browser holding a stale band claim. The record job's cancel left a
// headless browser reparented to launchd on its band, its lease still in the claim dir
// and its CDP listener still bound, and the next job's claim was refused naming it
// ("claimant pid <dead> DEAD, RELEASED; held by pid <browser> ... listening :<port>")
// until the 2 h startup sweep aged it out. Plain node, no browser:
//
//   O1 an orphan stand-in (double-forked node listener, PPID 1, argv carrying the CDP
//      switch and the canonical profile path of its port, that dir created, leased into
//      a planted dead+released claim with origin 'launch' — launchChrome's own
//      publication, the only ownership the reap accepts) — claimPortBand over the
//      window resolves, the stand-in is gone (kill(pid, 0) → ESRCH) and its profile
//      dir is gone
//   O2 the reap line names the pid, the port and the stale claim
//   O3 the same stand-in PARENTED by this probe (a live run's browser) is still refused
//      and stays alive, its profile untouched
//   O4 a PPID-1 listener WITHOUT the profile marker is refused and untouched
//   O5 a PPID-1 marker holder with NO lease in the stale claim (not attributable to it),
//      scanned TWICE: the first refused claim leaves a discovery lease for it on disk
//      (endpointEvidence), and the second refused claim must not read that lease as
//      ownership — both refused, alive, profile kept, no reap line; O5p that lease
//      carries origin 'discovery'
//   O6 the same holder leased by a pre-provenance body (no origin field) reads as
//      discovery: refused, alive, profile kept, no reap line
//   C1/C2 a ps census before and after: no headless browser descends from this probe
//
//   node web/tools/test-orphan-browser-claim.mjs        # exit 0/1; last line PASS (n) / FAIL (k of n)
//   OB_ORPHAN_PROBE_MODULE=<copy>/web/tools/cdp.mjs node ...   # judge a base / plant copy instead
//
// Staged under a private registry and marker dir (the OB_PORT_BANDS_DIR /
// OB_SERVER_MARKER_DIR seams, as hygiene arm 8h; its writers' mutex on a private port, the
// OB_BAND_MUTEX_PORT seam — GH-1119) with the CI env keys removed, on a
// 30-port window picked outside every declared band and verified bindable. PPID 1 needs a
// host without a subreaper: the CI step runs on macOS only. Stand-ins are signalled by
// their recorded pid only.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CDP_MODULE = path.resolve(process.env.OB_ORPHAN_PROBE_MODULE || path.join(HERE, 'cdp.mjs'));
const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'ob-orphan-browser-claim-'));
const REG = path.join(stage, 'reg'); const MRK = path.join(stage, 'mrk');
fs.mkdirSync(REG); fs.mkdirSync(MRK);
for (const k of ['GITHUB_ACTIONS', 'OB_CI_BANDS', 'CI', 'OB_E2E_PORT', 'OB_E2E_CDP_PORT', 'OB_CDP_PORT', 'OB_PORT_BANDS']) delete process.env[k];
process.env.OB_PORT_BANDS_DIR = REG; process.env.OB_SERVER_MARKER_DIR = MRK;
// GH-1119: a private registry arbitrates on a PRIVATE mutex port too — this probe's
// claims and reaping scans (seconds under load) must never hold the host-wide :47997
// that live lanes and CI jobs queue on. Set before the import (it is read there); a
// squatter on it surfaces as the mutex's honest 10 s error, never as misarbitration.
const MUTEX = 38000 + (process.pid % 900);
process.env.OB_BAND_MUTEX_PORT = String(MUTEX);
const cdp = await import(pathToFileURL(CDP_MODULE).href); // PORT_BANDS_DIR and the mutex port are read at import
const cib = await import(pathToFileURL(path.join(path.dirname(CDP_MODULE), 'lib', 'ci-bands.mjs')).href);

const rows = [];
const row = (id, ok, desc, detail = '') => {
  rows.push({ id, ok: !!ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id} — ${desc}${ok ? '' : `: ${String(detail).slice(0, 600)}`}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lstartOf = (pid) => { try { return execFileSync('ps', ['-o', 'lstart=', '-p', String(pid)], { encoding: 'utf8', env: { ...process.env, LC_ALL: 'C', LANG: 'C' } }).trim(); } catch { return ''; } }; // GH-1143: the registry's token form
const ppidOf = (pid) => { try { return Number(execFileSync('ps', ['-o', 'ppid=', '-p', String(pid)], { encoding: 'utf8' }).trim()); } catch { return NaN; } };
const gone = (pid) => { try { process.kill(pid, 0); return false; } catch (e) { return e.code === 'ESRCH'; } };
const deadPid = () => spawnSync(process.execPath, ['-e', '0']).pid;
const busy = (port) => new Promise((r) => { const c = net.connect({ port, host: '127.0.0.1' }); const done = (v) => { try { c.destroy(); } catch { /* closed */ } r(v); }; c.once('connect', () => done(true)); c.once('error', () => done(false)); c.setTimeout(400, () => done(false)); });
const bindable = (port) => new Promise((r) => { const s = net.createServer(); s.once('error', () => r(false)); s.listen(port, '127.0.0.1', () => s.close(() => r(true))); });
const capture = async (fn) => { const lines = []; const orig = console.error; console.error = (...a) => lines.push(a.join(' ')); try { return [await fn(), lines, null]; } catch (e) { return [null, lines, e]; } finally { console.error = orig; } };

// the census: headless browser processes whose ancestry reaches this probe
const headlessDescendants = () => {
  const ps = execFileSync('ps', ['-axo', 'pid=,ppid=,command='], { encoding: 'utf8', maxBuffer: 64 << 20 })
    .split('\n').map((l) => /^\s*(\d+)\s+(\d+)\s+(.*)$/s.exec(l)).filter(Boolean)
    .map((m) => ({ pid: +m[1], ppid: +m[2], command: m[3] }));
  const kids = new Set([process.pid]);
  for (let grew = true; grew;) { grew = false; for (const r of ps) if (!kids.has(r.pid) && kids.has(r.ppid)) { kids.add(r.pid); grew = true; } }
  return ps.filter((r) => r.pid !== process.pid && kids.has(r.pid) && r.command.includes('chrome-headless-shell'));
};

// a 30-port window outside the CI reserved range, the lane bands and the registry mutex,
// every port bindable on loopback
let B = null;
const lanes = (() => { try { return cib.declaredBands(cib.loadCiBands(), cib.loadLaneBands()); } catch { return null; } })();
for (let a = 0; a < 8 && B === null; a++) {
  const lo = 40000 + (((process.pid % 160) + a * 37) % 160) * 30; const hi = lo + 29;
  if (lo <= cdp.BAND_MUTEX_PORT && cdp.BAND_MUTEX_PORT <= hi) continue;
  if (lanes === null || lanes.some((d) => cib.bandsIntersect(d.range ?? d, { start: lo, end: hi }))) continue;
  let free = true;
  for (let p = lo; p <= hi && free; p++) free = await bindable(p);
  if (free) B = lo;
}
const recorded = new Set(); // every stand-in pid this probe started
const profiles = new Set(); // every profile dir this probe created
const cleanup = () => {
  for (const pid of recorded) { try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ } }
  for (const d of profiles) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* raced */ } }
  try { fs.rmSync(stage, { recursive: true, force: true }); } catch { /* raced */ }
};
setTimeout(() => { console.log('FAIL watchdog — the probe exceeded 90 s'); cleanup(); console.log('ORPHAN-BROWSER-CLAIM SELFTEST FAIL (watchdog)'); process.exit(1); }, 90000).unref();

try {
  row('C0', B !== null, 'a bindable 30-port window outside every declared band', `lanes=${lanes === null ? 'unloadable' : lanes.length}`);
  row('C0m', cdp.BAND_MUTEX_PORT === MUTEX && !(lanes ?? []).some((d) => cib.bandsIntersect(d.range ?? d, { start: MUTEX, end: MUTEX })),
    'a private registry mutex port outside every declared band (never the host-wide :47997; GH-1119)', `mutex=${MUTEX} cdp=${cdp.BAND_MUTEX_PORT}`);
  const before = headlessDescendants();
  row('C1', before.length === 0, 'census before: no headless browser descends from this probe', before.map((r) => r.pid).join(', '));
  if (B !== null) {
    const P = B + 28; // a CDP-half slot (the record job's 19778 = 19750 + 28)
    // base revisions predate the export; the fallback is the launch path they hard-code
    const profile = typeof cdp.profileDirForPort === 'function' ? cdp.profileDirForPort(P) : path.join('/', 'tmp', `obw-e2e-profile-${P}`);
    const LISTEN = "require('net').createServer().listen(Number(process.argv[1]),'127.0.0.1')";
    const standinArgs = (marker) => ['-e', LISTEN, '--', String(P), `--remote-debugging-port=${P}`, ...(marker ? [`--user-data-dir=${profile}`] : [])];
    const orphan = (args) => {
      const out = execFileSync(process.execPath, ['-e',
        "const c=require('child_process').spawn(process.execPath,JSON.parse(process.argv[1]),{detached:true,stdio:'ignore'});c.unref();console.log(c.pid)",
        '--', JSON.stringify(args)], { encoding: 'utf8' });
      const pid = Number(out.trim()); if (pid > 0) recorded.add(pid);
      return pid;
    };
    const ready = async (pid, wantPpid1) => {
      for (let i = 0; i < 50; i++) {
        if (!gone(pid) && (await busy(P)) && (!wantPpid1 || ppidOf(pid) === 1)) return true;
        await sleep(100);
      }
      return false;
    };
    // lease: false (none), an origin string, or null (a body without origin)
    const plantClaim = (holderPid, lease = 'launch') => {
      const dp = deadPid(); const name = `${B}-${B + 29}.${dp}`; const d = path.join(REG, name);
      fs.mkdirSync(d, { recursive: true });
      fs.writeFileSync(path.join(d, 'owner.json'), JSON.stringify({ pid: dp, lstart: 'Mon Jan  1 00:00:00 2001', at: Date.now() - 60000, released: true, layout: true, enforced: true }));
      if (lease !== false) {
        fs.writeFileSync(path.join(d, `lease-${holderPid}.json`), JSON.stringify({ pid: holderPid, lstart: lstartOf(holderPid), at: Date.now(), ...(lease === null ? {} : { origin: lease }) }));
      }
      return { dp, name, d };
    };
    const stop = async (pid) => { try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ } for (let i = 0; i < 30 && !gone(pid); i++) await sleep(100); };
    const mkProfile = () => { fs.mkdirSync(profile, { recursive: true }); profiles.add(profile); };

    // O3: parented stand-in — a live run's browser is never reaped
    { mkProfile(); const kid = spawn(process.execPath, standinArgs(true), { stdio: 'ignore' }); recorded.add(kid.pid);
      const up = await ready(kid.pid, false); const { d } = plantClaim(kid.pid);
      const [claim, lines, err] = await capture(() => cdp.claimPortBand(B, B + 29));
      const msg = String(err?.message ?? 'no throw');
      row('O3', up && !!err && msg.includes(`held by pid ${kid.pid}`) && !gone(kid.pid) && fs.existsSync(profile) && !lines.some((l) => l.includes('reaped orphan harness browser')),
        'the stand-in PARENTED by the probe is still refused, stays alive and keeps its profile', `up=${up} alive=${!gone(kid.pid)} profile=${fs.existsSync(profile)} ${msg} | ${lines.join(' | ')}`);
      claim?.release(); await stop(kid.pid); fs.rmSync(d, { recursive: true, force: true }); }

    // O4: a PPID-1 listener without the profile marker (its port's profile dir present)
    { mkProfile(); const pid = orphan(standinArgs(false));
      const up = await ready(pid, true); const { d } = plantClaim(pid);
      const [claim, lines, err] = await capture(() => cdp.claimPortBand(B, B + 29));
      const msg = String(err?.message ?? 'no throw');
      row('O4', up && !!err && msg.includes(`held by pid ${pid}`) && !gone(pid) && fs.existsSync(profile) && !lines.some((l) => l.includes('reaped orphan harness browser')),
        'a PPID-1 listener WITHOUT the marker is refused and untouched', `up=${up} alive=${!gone(pid)} profile=${fs.existsSync(profile)} ${msg} | ${lines.join(' | ')}`);
      claim?.release(); await stop(pid); fs.rmSync(d, { recursive: true, force: true }); }

    const kept = (pid, lines) => !gone(pid) && fs.existsSync(profile) && !lines.some((l) => l.includes('reaped orphan harness browser'));
    const readLease = (d, pid) => { try { return JSON.parse(fs.readFileSync(path.join(d, `lease-${pid}.json`), 'utf8')); } catch { return null; } };

    // O5: a PPID-1 marker holder the stale claim holds no lease for, scanned twice
    { mkProfile(); const pid = orphan(standinArgs(true));
      const up = await ready(pid, true); const { d } = plantClaim(pid, false);
      const [claim1, lines1, err1] = await capture(() => cdp.claimPortBand(B, B + 29));
      claim1?.release();
      const disc = readLease(d, pid); const born = lstartOf(pid);
      const [claim2, lines2, err2] = await capture(() => cdp.claimPortBand(B, B + 29));
      claim2?.release();
      const sawLease = !!disc && !!born && disc.lstart === born;
      row('O5', up && !!err1 && !!err2 && sawLease && kept(pid, [...lines1, ...lines2]),
        'a PPID-1 marker holder WITHOUT a lease, scanned twice: the second scan meets the lease the first one left and still refuses; alive, profile kept, no reap line',
        `up=${up} alive=${!gone(pid)} profile=${fs.existsSync(profile)} lease=${JSON.stringify(disc)} err1=${err1?.message ?? 'no throw'} err2=${err2?.message ?? 'no throw'} | ${[...lines1, ...lines2].join(' | ')}`);
      row('O5p', sawLease && disc.origin === 'discovery', 'the lease the first scan left carries origin \'discovery\'', JSON.stringify(disc));
      console.log(`  O5 scan verdicts: ${[err1, err2].map((e) => (e ? 'refused' : 'resolved')).join(', ')}; lease on disk before scan 2: ${disc ? `origin ${disc.origin ?? '(none)'}` : 'none'}`);
      await stop(pid); fs.rmSync(d, { recursive: true, force: true }); }

    // O6: the same holder leased by a pre-provenance body (no origin) reads as discovery
    { mkProfile(); const pid = orphan(standinArgs(true));
      const up = await ready(pid, true); const { d } = plantClaim(pid, null);
      const [claim, lines, err] = await capture(() => cdp.claimPortBand(B, B + 29));
      row('O6', up && !!err && kept(pid, lines),
        'a PPID-1 marker holder leased WITHOUT an origin field is not reaped: refused, alive, profile kept',
        `up=${up} alive=${!gone(pid)} profile=${fs.existsSync(profile)} err=${err?.message ?? 'no throw'} | ${lines.join(' | ')}`);
      claim?.release(); await stop(pid); fs.rmSync(d, { recursive: true, force: true }); }

    // O1/O2: the orphan stand-in on its canonical profile path
    { mkProfile(); const pid = orphan(standinArgs(true));
      const up = await ready(pid, true); const { dp, name } = plantClaim(pid);
      const [claim, lines, err] = await capture(() => cdp.claimPortBand(B, B + 29));
      for (let i = 0; i < 30 && !gone(pid); i++) await sleep(100);
      row('O1', up && !err && !!claim && gone(pid) && !fs.existsSync(profile),
        'a LAUNCH-leased orphan: claimPortBand over the window resolves; the stand-in is gone (ESRCH) and its profile dir is gone',
        `up=${up} gone=${gone(pid)} profile=${fs.existsSync(profile)} err=${err?.message ?? ''} | ${lines.join(' | ')}`);
      const reap = lines.map((l) => /^\[bands\] reaped orphan harness browser pid\(s\) ([\d, ]+) \(port (\d+)\) inside stale claim (\S+) \(claimant pid (\d+) dead, released; GH-926\)$/.exec(l)).find(Boolean);
      row('O2', !!reap && reap[1].split(', ').map(Number).includes(pid) && Number(reap[2]) === P && reap[3] === name && Number(reap[4]) === dp,
        'the reap line names the pid, the port and the stale claim', lines.join(' | ') || '(no line)');
      if (reap) console.log(`  ${reap[0]}`);
      claim?.release(); await stop(pid); }
  }
  const after = headlessDescendants();
  row('C2', after.length === 0, 'census after: no headless browser descends from this probe', after.map((r) => r.pid).join(', '));
} catch (e) {
  row('X', false, 'the probe threw', e?.stack ?? e);
} finally {
  cleanup();
}
const bad = rows.filter((r) => !r.ok).length;
console.log(bad ? `ORPHAN-BROWSER-CLAIM SELFTEST FAIL (${bad} of ${rows.length})` : `ORPHAN-BROWSER-CLAIM SELFTEST PASS (${rows.length})`);
process.exit(bad ? 1 : 0); // a live library timer (the pending-hold grace) must not keep the probe alive
