// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-harness-hygiene.mjs — GH-294 red-proof gate for the harness itself.
// Proves the three owner-prescribed guarantees hold, each with the red side
// that shows the probe can actually fail:
//   (1) SHELL, NOT APP: the browser binary is the pinned chrome-headless-shell
//       from the puppeteer cache; a missing shell FAILS FAST with the verbatim
//       one-line install command (never a silent installed-app fallback — the
//       fallback IS the LaunchServices bug); on darwin the live session is
//       probed against LaunchServices (lsappinfo) and must NOT carry the
//       com.google.Chrome bundleID (--red boots the installed app once and
//       asserts the same probe DOES see it — sensitivity proof).
//   (2) ZERO LEFTOVERS: after closeAndWait(), after a bare close(), and after
//       a launch FAILURE, the /tmp/obw-e2e-profile-<port> dir is gone and the
//       chrome child is confirmed exited (kill(pid, 0) throws ESRCH).
//   (3) SWEEP DISCRIMINATION: sweepStaleProfiles reaps a planted AGED
//       ownerless orphan dir and leaves a FRESH foreign-port dir alone.
//   (4) SERVER-ORPHAN SWEEP (GH-294 finisher): the sweep reaps a planted
//       MARKED orphan http.server TREE (wrapper + socket-holding grandchild,
//       real PPID-1 via double-fork) whose recorded harness is dead, and
//       leaves a FRESH unmarked (shaped) foreign server alone (age gate).
//   (5) --battery: MAIN-BATTERY shape re-proof (red-proof a) — runs the
//       representative real gate (e2e.mjs) end-to-end as a child on the
//       shell, then asserts ZERO surviving harness children: no chrome root,
//       no http.server wrapper/grandchild on its port, no profile dirs, and
//       no new PPID-1 shell/server debt. NOTE: e2e.mjs refreshes the
//       web/app-preview-*.png capture bytes — hence opt-in.
//   (6) WEDGE VERDICT + BOOT-LOSS MARKER (GH-248 wedge-resume): a browser
//       frozen by its OWN tracked pid (SIGSTOP — the endpoint stops
//       answering while the process lives, the exact wedge shape measured
//       2026-08-03/04) trips the liveness verdict; the rejection carries
//       the programmatic `cdpWedged` flag (scenario-render's
//       checkpoint/resume decision input) while an ordinary page-eval
//       failure does NOT; and closeAndWait() still reaps the stopped
//       child + profile (SIGKILL cannot be refused by a stopped process).
//   (7) BAND-WIDTH LAW (GH-410, arm 8c): a suite whose DECLARED port
//       inventory exceeds its assigned band gets a WIDENED claim from
//       run-gate (extended in place, or slid past a live neighbor via the
//       registry), never a silent escape; with every candidate blocked the
//       wrapper refuses honestly (EX_TEMPFAIL); bandLayout throws on
//       layout overflow; an undeclared suite keeps pre-410 behavior; and
//       the inventory AUDIT red-flags any suite whose static `CDP + i`
//       derivations outgrow its declaration (the #305 drift class).
//   (8) PREFLIGHT STARVATION vs WRONG-TREE (GH-410, arm 8d): an
//       I/O-starved server serving the RIGHT tree is waited out (escalating
//       attempt windows + bounded starvation cap), a genuinely wrong tree
//       is still refused promptly on response evidence, a timeout alone
//       never produces a tree verdict, and the GH-347 CDP-RTT canary
//       hand-me-down (OB_GATE_RTT_FILE) widens the windows up front.
//   (9) GH-425 PACING-STORM DISCIPLINE (lib/pacing.mjs): the storm
//       classifier's axes and OB_* overrides; the SKIPPED-STORM citation
//       stays matched by run-gate's waiver harvest (a storm-skipped run
//       can never bank a green fingerprint) while DEFER/retry notices stay
//       UNmatched (a deferred-then-green run is full coverage); the
//       guardPacingArm decision flow (skip / defer-then-run / belt
//       reclassify / retry-then-green / teeth) against a scripted sampler;
//       and the LIVE teeth proof — a REAL injected LONG-FRAME stall (45 ms
//       inside the rAF callback; issue #664 (d): a timer-task burner is a
//       stall shape the rAF-timestamp metric cannot see on a quiet box)
//       still reds under a calm classifier, with an injection self-check
//       and an attributable verdict — the proof's own PRECONDITION rides
//       the REAL box (a starved page under a real storm is deferred or
//       SKIPPED-STORM with the citation, never a FAIL that reads as an
//       injection death; arm (c2) pins the three states); and the
//       control-plane RTT axis
//       (Browser.getVersion) provably does NOT inflate under a stall
//       while Runtime.evaluate DOES (an in-app regression cannot disguise
//       itself as a storm).
//   (10) SAME-PORT RELAUNCH (GH-665, arm 4c): a relaunch on a port whose
//       previous session is still exiting (frozen by SIGSTOP to make the
//       slow exit deterministic) waits for that session's CONFIRMED exit
//       before the profile wipe — never a wipe under a live owner, never a
//       spawn under a still-bound CDP port.
//       A profile the previous session RETAINED (its helper reap gave no
//       verdict, so GH-294's remove-only-on-true rule kept ownership) is
//       released by a bounded RETRY or the relaunch is refused (arm 4d) —
//       a dead root is not a released profile.
//       Two CONCURRENT relaunches on one port resolve to one winner and one
//       refusal-by-name (arm 4e): the guard's reads are serialized by the
//       per-profile launch lock, and the claim tail it protects is pinned
//       await-free in source.
//   (11) MARKER FAMILY HELPERS (issue #664 (c), arm 8f): the shared
//       obw-e2e-server-<pid>.json sidecars are reached only through
//       cdp.mjs's serverMarkerPath / readServerMarkers; consumers spell no
//       /tmp path (the arm-8e scan then vouches for the family by name).
//
//   node web/tools/e2e-harness-hygiene.mjs [--red] [--battery]
//
// Ports (verified-free convention, GH-294 lane law 9460-9489):
// OB_E2E_PORT ?? 27120, OB_E2E_CDP_PORT ?? 27100 (+1/+2 for sub-arms;
// +3/+4 off OB_E2E_PORT for the planted server trees, +5..+9 and +11..+13
// for the arm-8d preflight fixtures, +10 for --battery).
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  launchChrome, resolveChromeShell, chromeShellPin,
  sweepStaleProfiles, spawnStaticServer, stopStaticServer, sleep,
} from './cdp.mjs';
// one full-tree default scan and one committed lint per run, shared by every arm that
// judges THIS tree (the suite crossed its 420 s watchdog once three arms each rescanned
// the tree; the tree does not change under the run — fixtures live in /tmp)
// port probes by TCP connect (~1 ms each): `lsof -iTCP` walks every fd on the box and
// took seconds per call under a storm — the 8h/8i/8k arms crossed the 420 s watchdog on it
const tcpBusy = (port) => new Promise((res) => { const c = net.connect({ port, host: '127.0.0.1' }); const done = (v) => { try { c.destroy(); } catch { /* closed */ } res(v); }; c.once('connect', () => done(true)); c.once('error', () => done(false)); c.setTimeout(400, () => done(false)); });
const windowFree = async (lo, hi) => { for (let p = lo; p <= hi; p++) if (await tcpBusy(p)) return false; return true; };
// GH-1119: a private registry's writers arbitrate on a PRIVATE mutex port too (the OB_BAND_MUTEX_PORT seam).
// The host-wide :47997 is shared by every lane and CI job; starved, it failed arms 8k (k2) and 8m in nightly
// 38432883132 (":47997 held >10 s"). The port is kernel-assigned (free when picked) and re-picked until it
// lies outside every range the arm claims (`avoid`: its band and pins — the kernel's ephemeral range
// overlaps the arms' 56000-61999 bands, and claimPortBand refuses a band covering its mutex port; review
// #1119 P2). Every writer of the arm's registry gets the same port, and each hold is traced
// (OB_BAND_MUTEX_TRACE) so the arm can show where it arbitrated.
const kernelPick = () => new Promise((res) => { const s = net.createServer(); s.once('error', () => res(null)); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
const privateMutex = async (stage, avoid = [], pick = kernelPick) => {
  let port = null;
  for (let a = 0; a < 50 && port === null; a++) {
    const p = await pick();
    if (p === null) break;
    if (!avoid.some(([lo, hi]) => p >= lo && p <= hi)) port = p;
  }
  return { port, env: port === null ? {} : { OB_BAND_MUTEX_PORT: String(port), OB_BAND_MUTEX_TRACE: path.join(stage, 'mutex-trace.jsonl') } };
};
/** the traced holds of an arm's private registry: { n, ports, ok } — ok: at least one, every one on `port` */
const mutexHolds = (stage, port) => {
  let holds = [];
  try { holds = fs.readFileSync(path.join(stage, 'mutex-trace.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { holds = []; }
  const ports = [...new Set(holds.map((h) => h.port))];
  return { n: holds.length, ports, ok: port !== null && holds.length > 0 && ports.length === 1 && ports[0] === port && port !== 47997 };
};
let __treeLintMemo = null; let __treeHitsMemo = null;
// the in-process (synchronous) tree scans this run, summed: each runs once, and an arm awaiting both back to
// back gives no timer a turn between them (a resolved await is a microtask). With the per-call bound it is how
// late a watchdog timer can fire, and every stall line checks its own lateness against it
let __syncScanMs = null;
const timedScan = (f) => { const t = Date.now(); const v = f(); __syncScanMs = (__syncScanMs ?? 0) + (Date.now() - t); return v; };
const treeLintOnce = async () => { if (!__treeLintMemo) { const c = await import('./lib/ci-bands.mjs'); __treeLintMemo = timedScan(() => c.lintCommittedCiBands()); } return __treeLintMemo; };
const treeHitsOnce = async () => { if (!__treeHitsMemo) { const c = await import('./lib/ci-bands.mjs'); const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..'); __treeHitsMemo = timedScan(() => c.scanToolDefaultFiles(c.deriveScanFiles(root).map((f) => f.path), root)); } return __treeHitsMemo; };
import {
  createWatchdog, loadLine, loadLineSync, STALL_MS, SYNC_CHILD_TIMEOUT_MS, SYNC_LATENESS_BOUND_MS,
} from './lib/hygiene-watchdog.mjs';
import {
  busyForeignCpu, classifyStorm, controlRttP50, countForeignShellRoots,
  deferLine, guardPacingArm, pacingKnobs, selfPidsFor, stormSkipLine, attributeTeethWindows,
  TEETH_MIN_FRAMES, deriveBusyCpuBar, formatBaselineLine, primeStormBaseline, sampleStorm,
  BASELINE_ENV, baselineSkip, sampleStormBaseline, loadNormNow,
} from './lib/pacing.mjs';

const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// defaults 27120 / 27100 (NOTE-CIRED-RELEASED-CLAIM round): the old 8467 / 16367
// windows sat on six other tools' derived defaults, unseen because HARNESS_FILES
// exempted this file from the tool-default-overlap rule; the rule now judges a
// harness file's OWN suite defaults, and the sweep leg below holds this tree clean
const PORT = Number(process.env.OB_E2E_PORT ?? 27120);
const CDP = Number(process.env.OB_E2E_CDP_PORT ?? 27100);
// GH-410 port inventory (declared 2026-09-07 under the GH-687 lint law). HAND-SIZED,
// with the reason stated (refuter finding): the declared-vs-used reader sees this
// suite's own `PORT + 0..+13` (http servers) and `CDP + 0..+10` (sessions, the
// --battery arm's nested e2e.mjs at CDP + 10), but a NESTED tool's own inventory is
// invisible to a text reader — e2e.mjs declares cdp 3, so the battery arm reaches
// CDP + 12 → 13 slots. Arm 8b(e)'s centred 30-window (CDP − 15 … CDP + 14) is a
// registry CLAIM, no socket: with the canonical pin (cdp(0) = start + 15) it is the
// lane band itself; an off-centre pin makes it a named SKIP, never a red. The nightly
// job's band width and pin tails are derived from this line (18755 + 12 ≤ 18799).
export const PORT_INVENTORY = { http: 14, cdp: 13 };
const RED = process.argv.includes('--red');
const BATTERY = process.argv.includes('--battery');
const profileOf = (port) => `/tmp/obw-e2e-profile-${port}`;

let failed = 0;
let wd = null; // the watchdog (armed below, after the suite's constants); every check is its progress
const check = (name, ok, detail = '') => {
  if (ok) console.log('[hygiene] PASS', name);
  else { failed++; console.error('[hygiene] FAIL', name, detail); }
  wd?.progress(name, !!ok);
};
const pidAlive = (pid) => {
  try { process.kill(pid, 0); return true; } catch { return false; }
};
/** LaunchServices verdict for one pid. A broken probe must never certify
 * the regression as fixed (review r7 P2), so absence and error are distinct:
 *   { verdict: 'none' }                    no ASN — confirmed not registered
 *   { verdict: 'bundle', id }              registered; id is the bundleID
 *                                          string ('[ NULL ]' = anonymous
 *                                          process ASN, 'com.google.Chrome'
 *                                          = the hijack precondition)
 *   { verdict: 'error', detail }           lsappinfo failed / shape drifted
 */
function lsProbe(pid) {
  let asn = '';
  try {
    asn = execFileSync('lsappinfo', ['find', `pid=${pid}`],
      { encoding: 'utf8', timeout: SYNC_CHILD_TIMEOUT_MS }).trim();
  } catch (e) { return { verdict: 'error', detail: `find: ${e.message}` }; }
  if (asn === '') return { verdict: 'none' };
  const m = /ASN:0x[0-9a-f]+-0x[0-9a-f]+/i.exec(asn);
  if (!m) return { verdict: 'error', detail: `unparseable find: ${asn}` };
  let info = '';
  try {
    info = execFileSync('lsappinfo', ['info', m[0]], { encoding: 'utf8', timeout: SYNC_CHILD_TIMEOUT_MS });
  } catch (e) { return { verdict: 'error', detail: `info: ${e.message}` }; }
  const b = /bundleID=(?:"([^"]*)"|(\[ NULL \]))/.exec(info);
  if (!b) return { verdict: 'error', detail: `no bundleID line: ${info.slice(0, 200)}` };
  return { verdict: 'bundle', id: b[1] ?? b[2] };
}
// the gate must never hang a lane (lib/hygiene-watchdog.mjs): "harness hung" only on a STALL (no check
// completed for STALL_MS); crossing the budget while checks still complete is a named SLOW verdict (exit 1)
// that runs on to completion or CEILING_FACTOR x the budget. The budget: --battery runs a full e2e.mjs pass
// as a child, which honestly takes minutes under load; the GH-410 arm 8d deliberately waits out
// starved-server fixtures, so the non-battery budget carries that too. --battery's child is one synchronous
// call bounded at 900 s with no check inside it, so its stall bound is the whole battery budget.
// #954: OB_E2E_HYGIENE_BUDGET_MS (integer milliseconds, 1000-7200000) replaces the 420 s budget of
// the non-battery shape — the nightly's loaded host ran it 569 s and the step ended SLOW; unset (or
// empty) keeps 420 s exactly. --battery keeps its own 1200 s (a nested e2e.mjs pass, another shape).
// An invalid value is refused by name before anything runs (exit 2), never ignored. The budget in
// effect is printed on the verdict line.
const BUDGET_ENV = 'OB_E2E_HYGIENE_BUDGET_MS';
const BUDGET = (() => {
  const v = process.env[BUDGET_ENV] ?? '';
  if (v !== '' && !(/^\d+$/.test(v) && Number(v) >= 1000 && Number(v) <= 7200000)) {
    console.error(`[hygiene] ${BUDGET_ENV}=${v} refused: the budget is an integer number of milliseconds in 1000-7200000 — nothing was run`);
    process.exit(2);
  }
  if (BATTERY) return { ms: 1200000, how: v === '' ? '--battery' : `--battery; ${BUDGET_ENV} applies to the non-battery shape only` };
  return v === '' ? { ms: 420000, how: 'default' } : { ms: Number(v), how: BUDGET_ENV };
})();
const WATCHDOG_MS = BUDGET.ms;
// when the watchdog was armed: the live teeth proof's storm guard clamps
// its calm wait to what is left of this budget (GH-935)
const WATCHDOG_AT = Date.now();
wd = createWatchdog({
  budgetMs: WATCHDOG_MS, stallMs: BATTERY ? WATCHDOG_MS : STALL_MS, now: Date.now,
  onVerdict: () => console.error(loadLineSync('end')),
  latenessBound: () => ({
    ms: Math.max(SYNC_LATENESS_BOUND_MS, __syncScanMs ?? 0),
    how: `max(${SYNC_LATENESS_BOUND_MS / 1000} s per-call timeout, sync tree scans this run ${__syncScanMs === null ? 'not yet run' : `${(__syncScanMs / 1000).toFixed(1)} s`})`,
  }),
});
/** the suite's own verdict line, with the budget in effect (#954). The parenthesis never starts
 * with a digit after PASS (to run-gate only an E2E- summary's '(N …' is an arm count), and a FAIL names
 * its count first — '(n failing checks; …)', a summary no arm-name reader takes for an arm */
const verdictLine = (wdEnd) => {
  const b = `budget ${WATCHDOG_MS / 1000} s, ${BUDGET.how}`;
  return failed ? `[hygiene] HARNESS-HYGIENE FAIL (${failed} failing check${failed === 1 ? '' : 's'}; ${b})`
    : wdEnd.slow ? `[hygiene] HARNESS-HYGIENE SLOW (${b})` : `[hygiene] HARNESS-HYGIENE PASS (${b})`;
};
// #954 arm seam (fixtures/hygiene-watchdog/run-arms.mjs, rows budget (k1)-(k6)): --budget-selftest
// <ms> runs no arm. It completes one check every 100 ms for <ms> under the watchdog this run armed,
// then ends as the suite does, on its own verdict line. It runs BEFORE the host diagnostics (the
// LOAD start line's async ps): a starved ps must never eat the timed window (review #954 P2).
const BUDGET_SELFTEST_MS = (() => { const i = process.argv.indexOf('--budget-selftest'); return i > 0 ? Number(process.argv[i + 1]) : null; })();
if (BUDGET_SELFTEST_MS !== null) {
  if (!Number.isInteger(BUDGET_SELFTEST_MS) || BUDGET_SELFTEST_MS < 0) { console.error('[hygiene] --budget-selftest takes a duration in ms'); process.exit(2); }
  for (const t0 = Date.now(); Date.now() - t0 < BUDGET_SELFTEST_MS;) { await sleep(100); check('budget selftest: one progressing check', true); }
  const wdEnd = wd.finish();
  console.log(verdictLine(wdEnd));
  process.exit(failed || wdEnd.code ? 1 : 0);
}

console.log(await loadLine('start'));

// ---- arm wd: the watchdog's own red arms (millisecond fixtures, ~4 s) ----------
// an unresolved async leg and a stuck sync child read "harness hung"; slow-but-progressing reads SLOW, never
// hung; the ceiling stops on SLOW; a normal run is green; a deadline crossed inside a synchronous stretch is
// judged at the next check or the suite end, and the run stops there; every sync child call here carries a
// bounded (positive) timeout
{
  const { runWdArms } = await import('./fixtures/hygiene-watchdog/run-arms.mjs');
  for (const r of await runWdArms()) check(r.name, r.ok, r.detail);
}

// ---- arm 1: resolver pins the shell; missing shell fails fast ---------------
{
  let resolved = null;
  try { resolved = resolveChromeShell(); } catch (e) {
    check('resolver finds the pinned shell', false, e.message);
  }
  if (resolved) {
    const viaPin = resolved.source === 'pin';
    check('resolver source is the in-repo pin (CHROME_BIN honored if set)',
      viaPin || resolved.source === 'CHROME_BIN', JSON.stringify(resolved));
    if (viaPin) {
      check('resolved binary is a chrome-headless-shell build',
        path.basename(resolved.bin).startsWith('chrome-headless-shell'),
        resolved.bin);
    }
  }
  // fail-fast red side, isolated in a child so this process's env/caches
  // stay untouched: empty cache + no CHROME_BIN must THROW the npx command.
  const env = { ...process.env, PUPPETEER_CACHE_DIR: '/nonexistent-ob-hygiene' };
  delete env.CHROME_BIN;
  let out = '';
  let code = 0;
  try {
    out = execFileSync(process.execPath, ['--input-type=module', '-e',
      `import(${JSON.stringify(pathToUrl('tools/cdp.mjs'))})` +
      '.then((m) => { m.resolveChromeShell(); console.log("RESOLVED"); })' +
      '.catch((e) => { console.error(e.message); process.exit(3); })',
    ], { encoding: 'utf8', env, cwd: WEB_DIR, timeout: SYNC_CHILD_TIMEOUT_MS });
  } catch (e) {
    code = e.status ?? 1;
    out = String(e.stderr ?? '');
  }
  check('missing shell FAILS FAST (no installed-app fallback)',
    code === 3 && !out.includes('RESOLVED'), `code=${code} out=${out}`);
  // the child ran with PUPPETEER_CACHE_DIR set, so its emitted install
  // command must aim at THAT cache (review r1 P2), not the $HOME default.
  check('failure carries the verbatim install command aimed at the '
    + 'configured cache',
  out.includes('npx @puppeteer/browsers install chrome-headless-shell@'
      + `${chromeShellPin()} --path "/nonexistent-ob-hygiene"`), out);
}
function pathToUrl(rel) {
  return new URL(rel, `file://${WEB_DIR}/`).href;
}

// ---- arm 2: launch + closeAndWait leaves NOTHING (red-proof a) ---------------
// GH-691: the live pacing arms' busy-CPU storm bar is DERIVED from a
// pre-run RESTED baseline — primed here, before this suite's own load,
// unless the job already wrote OB_PACING_BASELINE (the nightly's
// storm-baseline step). The scripted proofs below never depend on it.
await primeStormBaseline();
const server = spawnStaticServer(WEB_DIR, PORT);
try {
  const url = `http://127.0.0.1:${PORT}/app.html?seed=1`;
  {
    const client = await launchChrome(url, { port: CDP });
    const pid = client.pid;
    check('session boots on the shell (profile dir exists while live)',
      fs.existsSync(profileOf(CDP)) && pidAlive(pid));
    // ---- arm 3: LaunchServices non-registration (red-proof b, darwin) ------
    if (process.platform === 'darwin') {
      const p = lsProbe(pid);
      check('live shell session never registers the com.google.Chrome '
        + `bundleID with LaunchServices (saw: ${JSON.stringify(p)})`,
      (p.verdict === 'none'
          || (p.verdict === 'bundle' && p.id !== 'com.google.Chrome')),
      p.detail ?? '');
    } else {
      console.log('[hygiene] SKIP LaunchServices probe (darwin-only)');
    }
    const exited = await client.closeAndWait();
    check('closeAndWait confirms the child exited', exited === true);
    check('chrome child is GONE after closeAndWait (kill(pid,0) → ESRCH)',
      !pidAlive(pid));
    check('profile dir is GONE after closeAndWait',
      !fs.existsSync(profileOf(CDP)));
  }

  // ---- arm 4: the bare close() path (what most gates' finally calls) --------
  {
    const client = await launchChrome(url, { port: CDP + 1 });
    const pid = client.pid;
    client.close();
    let clean = false;
    for (let i = 0; i < 100 && !clean; i++) {
      await sleep(100);
      clean = !pidAlive(pid) && !fs.existsSync(profileOf(CDP + 1));
    }
    check('close() path reaps child + profile dir (≤10 s)', clean,
      `pidAlive=${pidAlive(pid)} dir=${fs.existsSync(profileOf(CDP + 1))}`);
  }

  // ---- arm 4b: wedge verdict + `cdpWedged` boot-loss marker (GH-248) --------
  // The high-frequency render-killer wedge class: the debugger endpoint stops
  // answering while the Chrome PROCESS lives (no crash — DiagnosticReports
  // were empty across the 2026-08-03/04 wedge window). Reproduced here by
  // SIGSTOPping our OWN tracked child (never by name — the broad-kill law).
  // Proves the plumbing scenario-render's checkpoint/resume decision rides:
  // the liveness verdict fires, its rejection carries `cdpWedged: true`, a
  // plain page-eval failure does NOT, and the kill path still reaps a
  // STOPPED process (SIGTERM is held pending on it; SIGKILL cannot be).
  {
    const saved = { probe: process.env.OB_CDP_LIVE_PROBE_MS,
      fails: process.env.OB_CDP_LIVE_FAILS };
    process.env.OB_CDP_LIVE_PROBE_MS = '1000'; // verdict in seconds, not ~60 s
    process.env.OB_CDP_LIVE_FAILS = '3';
    const client = await launchChrome(url, { port: CDP + 1 });
    const pid = client.pid;
    // negative side first, on the HEALTHY client: an ordinary in-page
    // failure is a per-command error, never a boot-loss verdict
    let evalErr = null;
    try { await client.eval('(() => { throw new Error("x"); })()'); }
    catch (e) { evalErr = e; }
    check('ordinary page-eval failure does NOT carry cdpWedged',
      !!evalErr && evalErr.cdpWedged !== true, String(evalErr?.message));
    check('healthy client reports no poison', client.poisoned() === null);
    process.kill(pid, 'SIGSTOP'); // our tracked child only
    let wedgeErr = null;
    try { await client.eval('1 + 1'); } catch (e) { wedgeErr = e; }
    check('liveness verdict fires on a stopped-but-alive browser',
      !!wedgeErr && /stopped answering|did not answer/.test(String(wedgeErr?.message)),
      String(wedgeErr?.message));
    check('wedge rejection carries the programmatic cdpWedged marker',
      wedgeErr?.cdpWedged === true);
    check('wedged client is poisoned terminally',
      typeof client.poisoned() === 'string' && client.poisoned().length > 0);
    let postErr = null;
    try { await client.eval('2 + 2'); } catch (e) { postErr = e; }
    check('post-poison send rejects instantly and keeps the marker',
      postErr?.cdpWedged === true
      && /poisoned/.test(String(postErr?.message)), String(postErr?.message));
    const exited = await client.closeAndWait();
    check('closeAndWait reaps the STOPPED child (SIGKILL path)',
      exited === true && !pidAlive(pid));
    check('profile dir is GONE after the wedge kill',
      !fs.existsSync(profileOf(CDP + 1)));
    saved.probe === undefined ? delete process.env.OB_CDP_LIVE_PROBE_MS
      : process.env.OB_CDP_LIVE_PROBE_MS = saved.probe;
    saved.fails === undefined ? delete process.env.OB_CDP_LIVE_FAILS
      : process.env.OB_CDP_LIVE_FAILS = saved.fails;
  }

  // ---- arm 4c: same-port RELAUNCH after a bare close() (GH-665) --------------
  // e2e-tables boots eleven ?table= sessions on ONE CDP port: close() (SIGTERM,
  // unawaited) then launchChrome again ~100 ms later. The previous shell keeps
  // writing <profile>/Default until it exits (410-490 ms after SIGTERM on a
  // quiet M4; >1.2 s on the loaded nightly runner); launchChrome's pre-launch
  // wipe retries with linear backoff (≈2 s per directory level) and, being
  // synchronous, starves close()'s own 3 s SIGKILL escalation while it spins
  // — the loser threw ENOTEMPTY out of launchChrome after every assertion had
  // passed (nightly 34033705473).
  // Arms 4/4b never relaunch on the port, so they could not see it. Here the
  // slow exit is made DETERMINISTIC by freezing our own tracked child
  // (SIGSTOP, the arm-4b idiom): it cannot act on close()'s SIGTERM, so the
  // relaunch either waits for the confirmed exit (the law) or wipes a LIVE
  // session's profile and spawns under a still-bound CDP port (pre-fix:
  // the wipe lands ~100 ms in, the new spawn cannot bind, and its endpoint
  // poll dies after 15 s). Every verdict is by pid + the dir's own birth
  // time — never by name.
  {
    const a = await launchChrome(url, { port: CDP + 1 });
    const aPid = a.pid;
    const dir = profileOf(CDP + 1);
    const aIno = fs.statSync(dir).ino; // A's profile, by identity not name
    process.kill(aPid, 'SIGSTOP'); // our tracked child only
    a.close();
    const t0 = Date.now();
    let aLastAlive = t0; let wipedUnderLive = false;
    const mon = setInterval(() => {
      if (pidAlive(aPid)) {
        aLastAlive = Date.now();
        // identity, not existence (the pre-fix gap between the wipe and the
        // new spawn's mkdir is under one poll): a missing dir OR a dir with
        // a different inode while A lives means A's profile was wiped.
        let ino = null;
        try { ino = fs.statSync(dir).ino; } catch { /* absent */ }
        if (ino !== aIno) wipedUnderLive = true;
      }
    }, 10);
    let b = null; let launchErr = null;
    try { b = await launchChrome(url, { port: CDP + 1 }); } catch (e) { launchErr = e; }
    clearInterval(mon);
    const bWall = Date.now() - t0;
    let birth = null;
    try { birth = fs.statSync(dir).birthtimeMs; } catch { /* no dir */ }
    check('4c: same-port relaunch after a bare close() LAUNCHES (no ENOTEMPTY, '
      + `no dead-endpoint throw; ${bWall} ms)`, b !== null,
    String(launchErr?.message ?? '').slice(0, 200));
    check('4c: the previous session\'s profile is never wiped while it is '
      + 'alive (the never-wipe-under-a-live-owner law)', !wipedUnderLive);
    check('4c: the relaunch waits for the previous session\'s CONFIRMED exit '
      + `— the new profile is born after the old pid was last seen alive `
      + `(+${birth === null ? '?' : Math.round(birth - t0)} ms vs `
      + `+${aLastAlive - t0} ms)`,
    !pidAlive(aPid) && birth !== null && birth > aLastAlive);
    let bAnswers = false;
    try { bAnswers = b ? (await b.eval('1+1')) === 2 : false; } catch { /* dead */ }
    check('4c: the relaunched session is a DIFFERENT live browser (never the '
      + 'old endpoint)', b !== null && b.pid !== aPid && bAnswers);
    if (b) {
      check('4c cleanup: relaunched session confirmed gone',
        (await b.closeAndWait()) === true);
    }
    if (pidAlive(aPid)) { // pre-fix debris only: thaw + kill our own child
      try { process.kill(aPid, 'SIGCONT'); process.kill(aPid, 'SIGKILL'); } catch { /* gone */ }
      for (let i = 0; i < 50 && pidAlive(aPid); i++) await sleep(100);
    }
    check('4c: previous session pid is GONE', !pidAlive(aPid));
    for (let i = 0; i < 30 && fs.existsSync(dir); i++) await sleep(100);
    check('profile dir is GONE after the same-port relaunch arm',
      !fs.existsSync(dir));
  }

  // ---- arm 4d: a RETAINED profile blocks the same-port relaunch (GH-665) ----
  // rmProfile removes the dir ONLY on a confirmed helper reap (GH-294 review
  // r12 P2); otherwise it returns false and KEEPS PROFILE_OWNER so a later
  // pass retries. That retained state outlives the root: the browser is
  // gone (so arm 4c's live-owner wait never runs) while one of its helpers
  // may still be writing the directory. Pre-fix, launchChrome fell straight
  // through to the unconditional wipe there — the very thing the
  // remove-only-on-true rule forbids.
  // The retention is forced HONESTLY: a pass-through `ps` shim that fails
  // ONLY the `-axo` census (the marker scan reapSessionHelpersSync opens
  // with) puts the reap on its documented no-verdict branch. Every other ps
  // caller — confirmExitSync's stat, lstart tokens, currentRow — keeps the
  // real binary, and the root's exit is still confirmed by kill(0) ESRCH.
  {
    let realPs = '/bin/ps';
    {
      const r = spawnSync('sh', ['-c', 'command -v ps'], { encoding: 'utf8', timeout: SYNC_CHILD_TIMEOUT_MS });
      if (r.status === 0 && r.stdout.trim()) realPs = r.stdout.trim();
    }
    const shimDir = fs.mkdtempSync(path.join(os.tmpdir(), 'obw-hygiene-psshim-'));
    fs.writeFileSync(path.join(shimDir, 'ps'),
      `#!/bin/sh\ncase " $* " in *" -axo "*) exit 3;; esac\nexec ${realPs} "$@"\n`,
      { mode: 0o755 });
    const realPath = process.env.PATH;
    const dir = profileOf(CDP + 1);
    const a = await launchChrome(url, { port: CDP + 1 });
    const aPid = a.pid;
    const mark = path.join(dir, 'ob-arm-4d-marker');
    fs.writeFileSync(mark, `planted by hygiene arm 4d for pid ${aPid}\n`);
    let closed = null; let refused = null; let b = null;
    let markAfterClose = null; let markAfterRefusal = null;
    try {
      process.env.PATH = `${shimDir}:${realPath}`;
      closed = await a.closeAndWait(); // exit CONFIRMED, cleanup RETAINED
      markAfterClose = fs.existsSync(mark);
      try { b = await launchChrome(url, { port: CDP + 1 }); }
      catch (e) { refused = e; }
      markAfterRefusal = fs.existsSync(mark);
    } finally {
      process.env.PATH = realPath;
      try { fs.rmSync(shimDir, { recursive: true, force: true }); } catch {}
    }
    check('4d: a root that exits with its profile cleanup UNCONFIRMED says so '
      + '(closeAndWait false) while its pid is genuinely gone',
    closed === false && !pidAlive(aPid));
    check('4d: the retained profile is NOT removed by that close (the '
      + 'remove-only-on-a-confirmed-reap rule)', markAfterClose === true);
    check('4d: the same-port relaunch is REFUSED while the previous session '
      + 'retains the profile — never a wipe under an unconfirmed reap',
    b === null && /RETAINED/.test(String(refused?.message ?? '')),
    String(refused?.message ?? `launched pid ${b?.pid} instead`).slice(0, 220));
    check('4d: the refusal leaves the old profile INTACT (the planted file '
      + 'survives)', markAfterRefusal === true);
    if (b) { // pre-fix debris: it wiped and launched anyway
      await b.closeAndWait();
      b = null;
    }
    // ps is honest again: the SAME port must now release the retained
    // profile by itself (a real retry, not a bypass) and relaunch clean.
    let c = null; let relaunchErr = null;
    try { c = await launchChrome(url, { port: CDP + 1 }); }
    catch (e) { relaunchErr = e; }
    check('4d: once the reap can give a verdict again, the same port RELEASES '
      + 'the retained profile and relaunches (old content gone)',
    c !== null && !fs.existsSync(mark),
    String(relaunchErr?.message ?? '').slice(0, 200));
    if (c) {
      check('4d cleanup: relaunched session confirmed gone',
        (await c.closeAndWait()) === true);
    }
    for (let i = 0; i < 30 && fs.existsSync(dir); i++) await sleep(100);
    check('profile dir is GONE after the retained-ownership arm',
      !fs.existsSync(dir));
  }

  // ---- arm 4e: CONCURRENT same-port relaunches (review r4 P2) ----------------
  // The 4c/4d guard reads PROFILE_OWNER and then AWAITS. Two launchChrome
  // calls racing for one port would both capture the same previous owner;
  // the loser resumes against a REPLACEMENT owner it never saw, its
  // ownership check no longer matches, and it walks into the unconditional
  // wipe — deleting the winner's live profile and spawning against a bound
  // port (the 15 s dead-endpoint death). The launch lock makes the second
  // read happen AFTER the first caller has installed its session, so the
  // loser meets a LIVE unclosed session and is refused by name, fast.
  // Profile GENERATIONS are counted by inode while the race runs: A's dir,
  // then exactly one more (the winner's). A third generation is the wipe.
  // The interleaving is made DETERMINISTIC the arm-4c way — the closing
  // session is frozen (SIGSTOP), so it cannot act on close()'s SIGTERM and
  // BOTH callers are parked inside the guard's wait when close()'s SIGKILL
  // escalation finally reaps it (measured: on a fast exit the second caller
  // is still in its preflight when the first has already claimed the port,
  // and the race never forms — an arm that only ever sees that ordering
  // pins nothing; #1158: the two relaunches therefore skip the preflight).
  {
    const dir = profileOf(CDP + 1);
    const a = await launchChrome(url, { port: CDP + 1 });
    const aPid = a.pid;
    // a check here restarts the watchdog's stall clock (it counts from the last
    // check): the race's settle cap below then fits under STALL_MS on its own
    check('4e setup: the first session is up on the port', Number.isInteger(aPid));
    const inos = new Set();
    try { inos.add(fs.statSync(dir).ino); } catch { /* raced */ }
    const mon = setInterval(() => {
      try { inos.add(fs.statSync(dir).ino); } catch { /* between wipe+spawn */ }
    }, 10);
    process.kill(aPid, 'SIGSTOP'); // our tracked child only
    a.close(); // bare close: the guard's WAIT path, as e2e-tables does it
    const t0 = Date.now();
    // #1158: the event judged is the LOSER's refusal against the latest of
    // three anchors. Both relaunches skip the served-tree preflight (A's launch
    // already proved the tree) and normally reach the launch lock — after one
    // readiness fetch of the served root — before close()'s own 3 s SIGKILL
    // escalation reaps A. On the reap the first caller resumes, releases the
    // lock in its finally and runs the synchronous claim tail (wipe -> spawn ->
    // PROFILE_OWNER.set), and the second reads a live owner and is refused at
    // once (measured: the same 20 ms poll as the reap, 12 of 12). A retained
    // profile makes the first caller retry its release for up to 5 s while it
    // holds the lock — a designed path: the refusal is then anchored on that
    // release (its '[launch] … retained-ownership retry' line). A slow
    // readiness answer delays a relaunch's arrival at the lock: the refusal is
    // then anchored on the last readiness answer (review P2). The time until
    // BOTH settle adds the winner's own Chrome launch, a load-dependent span (a
    // fixed 12 s on that total went red at 12.8 and 17.3 s): printed, never
    // judged. Caps name a reap or a relaunch that never comes; the settle cap
    // is the launch budget this run grants (OB_CDP_LAUNCH_MS), under the
    // watchdog's stall bound.
    const REAP_CAP_MS = 30000;
    const launchMs = Number(process.env.OB_CDP_LAUNCH_MS) > 0 ? Number(process.env.OB_CDP_LAUNCH_MS) : 120000;
    const SETTLE_CAP_MS = Math.min(REAP_CAP_MS + launchMs + 45000, STALL_MS - 20000);
    const REFUSAL_AFTER_ANCHOR_MS = 2000;
    // the reap and the retained release are stamped by one 20 ms timer, so
    // each lands after the winner's synchronous claim tail, never inside it
    // (the readiness stamp below runs in a fetch continuation: also never
    // inside a synchronous tail)
    let reapAt = null; // ms from t0 the frozen pid was first seen gone
    let retrySeen = false; // the first caller logged a retained-profile release
    let retryAt = null; // ms from t0 that log line was first seen by the timer
    const reapMon = setInterval(() => {
      if (reapAt === null && !pidAlive(aPid)) reapAt = Date.now() - t0;
      if (retryAt === null && retrySeen) retryAt = Date.now() - t0;
    }, 20);
    const errOrig = console.error;
    console.error = (...args) => {
      const line = args.map(String).join(' ');
      if (line.includes(`[launch] :${CDP + 1} — previous session`)
        && line.includes('retained-ownership retry')) retrySeen = true;
      errOrig.apply(console, args);
    };
    // review #1158 P2: with preflight off a relaunch still awaits its HTTP
    // readiness (waitForHttpReadiness, a fetch of the served root) before it
    // reaches the launch lock, so a slow static server delays the loser's
    // ARRIVAL. Each readiness answer from the served origin is stamped (the
    // relaunch reaches the lock right after it); the last one is the third
    // anchor, so server latency never counts against the guard. The CDP
    // endpoint polls after the spawn are another origin and are not counted.
    let readyAt = null; // ms from t0 the last served-origin answer reached a relaunch
    const servedOrigin = new URL(url).origin;
    const fetchOrig = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const answer = await fetchOrig(input, init);
      try {
        if (new URL(typeof input === 'string' ? input : (input?.url ?? String(input))).origin === servedOrigin) readyAt = Date.now() - t0;
      } catch { /* not a URL */ }
      return answer;
    };
    const at = [null, null]; // each relaunch's own settle, ms from t0
    const res = [{ status: 'pending' }, { status: 'pending' }];
    const timed = (i) => launchChrome(url, { port: CDP + 1, preflight: false }).then(
      (value) => { at[i] = Date.now() - t0; res[i] = { status: 'fulfilled', value }; return value; },
      (reason) => { at[i] = Date.now() - t0; res[i] = { status: 'rejected', reason }; throw reason; });
    const both = Promise.allSettled([timed(0), timed(1)]);
    let capTimer = null;
    let done = null;
    try {
      done = await Promise.race([both, new Promise((r) => {
        capTimer = setTimeout(() => r(null), SETTLE_CAP_MS);
      })]);
    } finally {
      clearTimeout(capTimer);
      console.error = errOrig;
      globalThis.fetch = fetchOrig;
    }
    const settled = Date.now() - t0;
    while (reapAt === null && Date.now() - t0 < REAP_CAP_MS) await sleep(20);
    clearInterval(reapMon);
    clearInterval(mon);
    check('4e: the frozen session was reaped within 30 s (close()\'s SIGKILL '
      + 'escalation, then the first caller\'s own)', reapAt !== null && reapAt <= REAP_CAP_MS,
    reapAt === null ? `not seen gone ${Date.now() - t0} ms after the relaunches began`
      : `first seen gone at ${reapAt} ms (cap ${REAP_CAP_MS})`);
    check('4e: both relaunches settled within their launch budget', done !== null,
      `still pending at ${settled} ms (cap ${SETTLE_CAP_MS}: min(the reap cap + OB_CDP_LAUNCH_MS ${launchMs} + 45 s handshake, STALL_MS ${STALL_MS} - 20 s))`);
    if (done === null) { // a winner that lands later is still closed
      both.then((rs) => { for (const r of rs) if (r.status === 'fulfilled') r.value.closeAndWait().catch(() => {}); });
    }
    // each relaunch is judged as it stands: a refusal that settled before the
    // cap is still judged even when the winner's launch is still running
    const [r1, r2] = res;
    const wins = [r1, r2].filter((r) => r.status === 'fulfilled');
    const losses = [r1, r2].filter((r) => r.status === 'rejected');
    check('4e: exactly ONE of two concurrent same-port relaunches wins '
      + `(${wins.length} won, ${losses.length} refused, ${settled} ms)`,
    wins.length === 1 && losses.length === 1);
    // the guard row judges the rejection that carries the guard's message (when
    // both were rejected, the other is the winner's own launch failure)
    const GUARD_RE = /still owned by this process's LIVE session/;
    const gi = [r1, r2].findIndex((r) => r.status === 'rejected' && GUARD_RE.test(String(r.reason?.message ?? '')));
    const li = gi >= 0 ? gi : r1.status === 'rejected' ? 0 : r2.status === 'rejected' ? 1 : -1;
    const lossMsg = li >= 0 ? String(res[li].reason?.message ?? '') : '';
    // both relaunches always fetch their readiness from the served origin: a
    // null stamp means the wrapper no longer sees cdp.mjs's fetch, and the
    // arrival anchor would silently fall back to the reap
    check('4e: the relaunches\' readiness answers were seen (the arrival anchor is live)',
      readyAt !== null, `no answer from ${servedOrigin} was stamped during the race`);
    const anchor = reapAt === null ? null : Math.max(reapAt, retryAt ?? reapAt, readyAt ?? reapAt);
    const afterAnchor = li >= 0 && anchor !== null ? at[li] - anchor : null;
    console.log(`[hygiene] 4e timing: frozen session reaped at ${reapAt} ms, `
      + `retained release at ${retryAt} ms, last readiness answer at ${readyAt} ms, loser refused at ${li >= 0 ? at[li] : null} ms `
      + `(${afterAnchor} ms after the anchor; bound ${REFUSAL_AFTER_ANCHOR_MS}), both settled at ${settled} ms (not judged)`);
    check('4e: the loser is refused BY THE OWNERSHIP GUARD (never a wipe '
      + 'under the winner, never the 15 s dead-endpoint poll)',
    GUARD_RE.test(lossMsg)
      && afterAnchor !== null && afterAnchor <= REFUSAL_AFTER_ANCHOR_MS,
    `refused ${afterAnchor} ms after the anchor (the reap at ${reapAt} ms, a retained release at ${retryAt} ms, the last readiness answer at ${readyAt} ms; `
      + `bound ${REFUSAL_AFTER_ANCHOR_MS}; both settled at ${settled} ms, not judged): ${lossMsg.slice(0, 180)}`);
    check('4e: the port saw exactly TWO profile generations — the closed '
      + `session's and the winner's (${inos.size} seen)`, inos.size <= 2);
    const winner = wins[0]?.value ?? null;
    let answers = false;
    try { answers = winner ? (await winner.eval('1+1')) === 2 : false; }
    catch { /* dead */ }
    check('4e: the winner is a LIVE session on the port (its profile was '
      + 'never wiped under it)', answers && winner?.pid !== aPid);
    for (const w of wins) {
      if (w.value) {
        check('4e cleanup: winning session confirmed gone',
          (await w.value.closeAndWait()) === true);
      }
    }
    if (pidAlive(aPid)) { // pre-fix debris only: our own child, by exact pid
      try { process.kill(aPid, 'SIGCONT'); process.kill(aPid, 'SIGKILL'); }
      catch { /* gone */ }
      for (let i = 0; i < 50 && pidAlive(aPid); i++) await sleep(100);
    }
    check('4e: the closed session pid is GONE', !pidAlive(aPid));
    for (let i = 0; i < 30 && fs.existsSync(dir); i++) await sleep(100);
    check('profile dir is GONE after the concurrent-relaunch arm',
      !fs.existsSync(dir));
    // the lock is held only across the guard's AWAITS; the claim it protects
    // (wipe → spawn → PROFILE_OWNER.set) is atomic only while that tail
    // stays await-free, so the tail is pinned in source too.
    const cdpSrc = fs.readFileSync(path.join(WEB_DIR, 'tools', 'cdp.mjs'), 'utf8');
    const wipeAt = cdpSrc.indexOf('\n  fs.rmSync(profileDir,');
    const ownAt = cdpSrc.indexOf('PROFILE_OWNER.set(profileDir, proc)');
    const tail = wipeAt > 0 && ownAt > wipeAt ? cdpSrc.slice(wipeAt, ownAt) : null;
    check('4e: launchChrome takes the per-profile LAUNCH LOCK before reading '
      + 'ownership', /acquireProfileLaunchLock\(profileDir\)/.test(cdpSrc));
    check('4e: the claim tail (pre-launch wipe → PROFILE_OWNER.set) is '
      + 'AWAIT-FREE, so the lock may be released with the guard',
    tail !== null && !/\bawait\b/.test(tail),
    tail === null ? 'anchors not found' : 'await inside the tail');
  }

  // ---- arm 5: launch-FAILURE path leaves no profile dir ---------------------
  {
    const dir = profileOf(CDP + 2);
    // the stub CREATES the profile dir like a real Chrome would and then
    // dies (review r11 P2): a plain /usr/bin/false only proved the
    // PRE-launch wipe — the surviving dir here must be removed by the
    // failure path itself.
    const stub = `/tmp/obw-hygiene-stub-${process.pid}.sh`;
    fs.writeFileSync(stub, '#!/bin/sh\n'
      + 'for a in "$@"; do case "$a" in\n'
      + '  --user-data-dir=*) d="${a#--user-data-dir=}";'
      + ' mkdir -p "$d"; echo GH-294 > "$d/sentinel";;\n'
      + 'esac; done\nexit 1\n');
    fs.chmodSync(stub, 0o755);
    const saved = { bin: process.env.CHROME_BIN, tries: process.env.OB_CDP_LAUNCH_TRIES };
    process.env.CHROME_BIN = stub; // creates the dir, exits, no endpoint
    process.env.OB_CDP_LAUNCH_TRIES = '3';
    let threw = null;
    try {
      await launchChrome(url, { port: CDP + 2, preflight: false });
    } catch (e) { threw = e; }
    saved.bin === undefined ? delete process.env.CHROME_BIN
      : process.env.CHROME_BIN = saved.bin;
    saved.tries === undefined ? delete process.env.OB_CDP_LAUNCH_TRIES
      : process.env.OB_CDP_LAUNCH_TRIES = saved.tries;
    check('launch failure throws (endpoint never came up)', !!threw,
      'launchChrome unexpectedly returned a client');
    check('launch failure is NOT a survivor (quarantine not invoked)',
      threw && !threw.chromeSurvived, String(threw?.message));
    check('profile dir the stub CREATED is GONE after a launch failure',
      !fs.existsSync(dir));
    fs.rmSync(stub, { force: true });
  }

  // ---- arm 5b: the launch DEADLINE bounds a stalled endpoint (OB_CDP_LAUNCH_MS)
  // A listener that ACCEPTS and never answers /json/list costs every launch try
  // its full 5 s fetch timeout, so 800 tries alone would poll for ~69 min. With
  // OB_CDP_LAUNCH_MS=2000 the launch must fail by name within budget + one
  // in-flight try (+ the 1.5 s foreign-endpoint probe, which this listener also
  // stalls); 15 s is the hard bound. The stub exits at once: no real Chrome.
  {
    const port = CDP + 3;
    const held = [];
    const black = net.createServer((sock) => { held.push(sock); }); // accept, never answer
    await new Promise((res, rej) => {
      black.once('error', rej);
      black.listen(port, '127.0.0.1', res);
    });
    const stub = `/tmp/obw-hygiene-stub5b-${process.pid}.sh`;
    fs.writeFileSync(stub, '#!/bin/sh\nexit 0\n');
    fs.chmodSync(stub, 0o755);
    const saved = { bin: process.env.CHROME_BIN, tries: process.env.OB_CDP_LAUNCH_TRIES,
      ms: process.env.OB_CDP_LAUNCH_MS };
    process.env.CHROME_BIN = stub;
    process.env.OB_CDP_LAUNCH_TRIES = '800';
    process.env.OB_CDP_LAUNCH_MS = '2000';
    let threw = null;
    const t0 = Date.now();
    try {
      await launchChrome(url, { port, preflight: false });
    } catch (e) { threw = e; }
    const ms = Date.now() - t0;
    for (const [k, v] of [['CHROME_BIN', saved.bin], ['OB_CDP_LAUNCH_TRIES', saved.tries],
      ['OB_CDP_LAUNCH_MS', saved.ms]]) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
    for (const s of held) s.destroy();
    await new Promise((res) => black.close(res));
    fs.rmSync(stub, { force: true });
    check('5b: a stalled endpoint fails "never came up" inside the launch deadline '
      + `(OB_CDP_LAUNCH_MS=2000, tries=800: ${ms} ms, bound 15000 ms)`,
    !!threw && /chrome debugger endpoint never came up/.test(threw.message) && ms < 15000,
    `${ms} ms: ${threw ? threw.message : 'launchChrome returned a client'}`);
    check('5b: the failure names the elapsed time and the 2000 ms budget',
      !!threw && /ms elapsed of the 2000 ms OB_CDP_LAUNCH_MS budget/.test(threw.message),
      String(threw?.message));
  }

  // ---- arm 6 (--red): probe sensitivity — the installed app DOES register ---
  if (RED && process.platform === 'darwin') {
    const saved = process.env.CHROME_BIN;
    process.env.CHROME_BIN =
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    const client = await launchChrome(url, { port: CDP + 2 });
    await sleep(1500); // LaunchServices check-in is asynchronous
    const p = lsProbe(client.pid);
    check('RED: headless installed app DOES register com.google.Chrome '
      + `(probe sensitivity; saw: ${JSON.stringify(p)})`,
    p.verdict === 'bundle' && p.id === 'com.google.Chrome');
    await client.closeAndWait();
    saved === undefined ? delete process.env.CHROME_BIN
      : process.env.CHROME_BIN = saved;
  }
} finally {
  // the verdict GATES (review r14 P2): an unconfirmed server teardown is
  // exactly the leftover class this gate exists to enforce against.
  check('static server group confirmed gone at teardown',
    await stopStaticServer(server));
}

// ---- arm 7: sweep discrimination (red-proof c) --------------------------------
{
  // per-process fixture names (review r4 P2): concurrent worktrees run this
  // gate too, and shared fixed names let one run reap/plant under the other.
  const aged = `/tmp/obw-e2e-profile-hygiene-${process.pid}-aged`;
  const fresh = `/tmp/obw-e2e-profile-hygiene-${process.pid}-fresh`;
  for (const d of [aged, fresh]) {
    fs.rmSync(d, { recursive: true, force: true });
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'sentinel'), 'GH-294');
  }
  const old = (Date.now() - 3 * 3600 * 1000) / 1000; // 3 h > 2 h default
  fs.utimesSync(aged, old, old);
  const res = sweepStaleProfiles({ force: true });
  check('sweep reaps the planted AGED ownerless orphan dir',
    !fs.existsSync(aged) && res.removed.includes(aged), JSON.stringify(res));
  check('sweep leaves the FRESH foreign-port dir alone', fs.existsSync(fresh));
  // the planted dirs have NO owning processes, so a correct sweep kills
  // nothing FOR THEM; kills of real aged orphans elsewhere on a shared box
  // are the sweep doing its job and are reported, not failed.
  if (res.killed.length) {
    console.log('[hygiene] note: sweep reaped unrelated aged orphan pid(s) '
      + res.killed.join(','));
  }
  fs.rmSync(fresh, { recursive: true, force: true });
}

// ---- arm 8: http.server-orphan sweep (red-proofs d/e, GH-294 finisher) --------
// Same discipline as the profile arm: plant a REAL PPID-1 orphan server TREE
// (double-fork through /bin/sh so the wrapper reparents to launchd, exactly
// the crashed-harness shape) with a spawnStaticServer marker whose recorded
// harness pid is DEAD → the sweep must reap wrapper AND grandchild and prune
// the marker. A second, UNMARKED fresh tree (shaped: its docroot carries an
// app.html) must be LEFT ALONE — the age gate is what saves a fresh foreign
// server — and is then torn down here by its discovered pids.
{
  const mkTree = (tag) => {
    const d = fs.mkdtempSync(`/tmp/obw-hygiene-srvtree-${tag}-`);
    // the FULL served-tree fingerprint (app.html + tools/render/grade.json),
    // so the fresh fixture is genuinely SHAPED and the age gate — not the
    // shape gate — is what must spare it (finisher review P1 tightening).
    fs.writeFileSync(path.join(d, 'app.html'), '<!doctype html><title>planted</title>');
    fs.mkdirSync(path.join(d, 'tools', 'render'), { recursive: true });
    fs.writeFileSync(path.join(d, 'tools', 'render', 'grade.json'), '{}');
    return d;
  };
  // double-fork: sh backgrounds the server and exits, orphaning it to PPID 1
  const plant = (dir, port) => Number(execFileSync('/bin/sh', ['-c',
    `python3 -m http.server -d ${dir} ${port} >/dev/null 2>&1 & echo $!`],
  { encoding: 'utf8', timeout: SYNC_CHILD_TIMEOUT_MS }).trim());
  const rowsNow = () => {
    try {
      return execFileSync('ps', ['-axo', 'pid=,ppid=,command='],
        { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: SYNC_CHILD_TIMEOUT_MS })
        .split('\n').map((l) => /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(l))
        .filter(Boolean)
        .map((m) => ({ pid: Number(m[1]), ppid: Number(m[2]), command: m[3] }));
    } catch { return []; }
  };
  const treeOf = (dir, port) => rowsNow().filter((r) =>
    r.command.includes('http.server') && r.command.includes(dir)
    && r.command.includes(` ${port}`));
  const markedDir = mkTree('marked');
  const shapedDir = mkTree('shaped');
  const markedPort = PORT + 3;
  const shapedPort = PORT + 4;
  const markedPid = plant(markedDir, markedPort);
  const shapedPid = plant(shapedDir, shapedPort);
  const markerFile = `/tmp/obw-e2e-server-${markedPid}.json`;
  try {
    // wait for the orphan transition (the sh parent exits ~instantly)
    let orphaned = false;
    for (let i = 0; i < 50 && !orphaned; i++) {
      await sleep(100);
      orphaned = [markedPid, shapedPid].every((pid) =>
        rowsNow().some((r) => r.pid === pid && r.ppid === 1));
    }
    check('planted server trees are real PPID-1 orphans', orphaned);
    // a marker naming a DEAD harness: the exact crashed-run shape
    const deadHarness = spawnSync('/usr/bin/true', [], { timeout: SYNC_CHILD_TIMEOUT_MS }).pid;
    let harnessDead = false;
    for (let i = 0; i < 50 && !harnessDead; i++) {
      try { process.kill(deadHarness, 0); await sleep(100); } catch (e) {
        harnessDead = e.code === 'ESRCH';
      }
    }
    check('fixture harness pid is confirmed dead', harnessDead);
    fs.writeFileSync(markerFile, JSON.stringify({
      pid: markedPid, harnessPid: deadHarness, port: String(markedPort),
      webDir: markedDir, lstart: null, at: Date.now(),
    }));
    const res = sweepStaleProfiles({ force: true });
    let markedGone = false;
    for (let i = 0; i < 30 && !markedGone; i++) {
      markedGone = treeOf(markedDir, markedPort).length === 0;
      if (!markedGone) await sleep(100);
    }
    check('sweep reaps the planted MARKED orphan server tree '
      + '(wrapper + grandchild)',
    markedGone && res.serverKilled.includes(markedPid),
    `tree=${JSON.stringify(treeOf(markedDir, markedPort))} `
      + `serverKilled=${JSON.stringify(res.serverKilled)}`);
    check('sweep prunes the reaped marker file', !fs.existsSync(markerFile));
    check('sweep leaves the FRESH shaped foreign server alone (age gate)',
      treeOf(shapedDir, shapedPort).length > 0
      && !res.serverKilled.includes(shapedPid));
  } finally {
    // tear the left-alone fixture down by its DISCOVERED pids (tracked-kill
    // law: wrapper first snapshot, then every member, never by name)
    for (const r of treeOf(shapedDir, shapedPort)) {
      try { process.kill(r.pid, 'SIGKILL'); } catch { /* raced exit */ }
    }
    for (const r of treeOf(markedDir, markedPort)) {
      try { process.kill(r.pid, 'SIGKILL'); } catch { /* raced exit */ }
    }
    fs.rmSync(markerFile, { force: true });
    fs.rmSync(markedDir, { recursive: true, force: true });
    fs.rmSync(shapedDir, { recursive: true, force: true });
  }
}

// ---- arm 8b: port-band arbitration (GH-338 red-proofs) -------------------------
// Two simulated lanes colliding must REFUSE, deterministically:
//   (a) launchChrome refuses a CDP port inside a LIVE foreign claim — before
//       any resource is spent (no chrome child, no profile dir);
//   (b) spawnStaticServer refuses an http port inside the same claim;
//   (c) claimPortBand refuses an OVERLAPPING live foreign claim;
//   (d) a STALE (dead-pid) claim is reaped on sight and the band re-claimed;
//   (e) a lane's OWN claim never refuses itself (in-process and via the
//       OB_PORT_BANDS env lineage a claiming driver exports to children).
// The "foreign lane" is a real child process (fresh pid) holding a claim in
// /tmp/ob-port-bands. Probe ranges are claims only — the registry binds no
// sockets — and live far from every assigned lane band (45xxx-53xxx,
// pid-scattered so two concurrent hygiene gates never probe the same
// range), except (e) which claims the 30-wide band centred on THIS run's
// own OB_E2E_CDP_PORT (the lane's real turf, by the convention).
{
  const { claimPortBand, assertPortOutsideForeignBands, PORT_BANDS_DIR,
    bandLayout, BAND_CDP_OFFSET } = await import('./cdp.mjs');
  const { spawn } = await import('node:child_process');
  // (a)+(b)+(c): a live foreign child claims [FB, FB+29]. The probe base is
  // pid-scattered AND retried on a genuine claim conflict (review GH-338 r2:
  // a bare modulo is not process-unique — two live pids 9000 apart collide),
  // so concurrent hygiene gates settle on disjoint probe bands.
  let FB = null;
  let child = null;
  for (let attempt = 0; attempt < 5 && FB === null; attempt++) {
    const cand = 45000 + ((process.pid * 61 + attempt * 977) % 9000);
    const kid = spawn(process.execPath, ['--input-type=module', '-e', `
      const { claimPortBand } = await import(${JSON.stringify(
    path.join(WEB_DIR, 'tools', 'cdp.mjs'))});
      await claimPortBand(${cand}, ${cand + 29});
      console.log('claimed');
      setInterval(() => {}, 1000); // hold until killed
    `], { stdio: ['ignore', 'pipe', 'ignore'],
      env: { ...process.env, OB_PORT_BANDS: '' } });
    const ok = await new Promise((res) => {
      const t = setTimeout(() => res(false), 10000);
      kid.stdout.on('data', (d) => {
        if (String(d).includes('claimed')) { clearTimeout(t); res(true); }
      });
      kid.once('exit', () => { clearTimeout(t); res(false); });
    });
    if (ok) { FB = cand; child = kid; break; }
    try { kid.kill('SIGKILL'); } catch { /* already gone */ }
  }
  check('band setup: a foreign holder child claimed a probe band', FB !== null);
  if (FB !== null) {
    try {
      // (a) launchChrome refusal, resource-free
      let aErr = null;
      try {
        await launchChrome(`http://127.0.0.1:${PORT}/app.html`,
          { port: FB + BAND_CDP_OFFSET });
      } catch (e) { aErr = e; }
      check('band (a): launchChrome REFUSES a CDP port inside a live foreign '
        + 'band', /foreign port\s+band/.test(String(aErr?.message)),
      String(aErr?.message ?? 'no throw'));
      check('band (a): the refusal spent no profile dir',
        !fs.existsSync(profileOf(FB + BAND_CDP_OFFSET)));
      // (b) spawnStaticServer refusal
      let bErr = null;
      try { spawnStaticServer(WEB_DIR, FB + 1); } catch (e) { bErr = e; }
      check('band (b): spawnStaticServer REFUSES an http port inside a live '
        + 'foreign band', /foreign port band/.test(String(bErr?.message)),
      String(bErr?.message ?? 'no throw'));
      // (c) overlapping claim refusal (verified-alive conflict)
      let cErr = null;
      try { await claimPortBand(FB + 20, FB + 49); } catch (e) { cErr = e; }
      check('band (c): an OVERLAPPING claim against a live foreign band '
        + 'REFUSES', /overlaps the LIVE foreign claim/.test(String(cErr?.message)),
      String(cErr?.message ?? 'no throw'));
    } finally {
      try { child.kill('SIGKILL'); } catch { /* raced */ }
    }
    // give the kill a beat, then (d): the child's claim is now STALE (dead
    // pid) — a fresh overlapping claim reaps it and succeeds
    await sleep(200);
    const reclaimed = await claimPortBand(FB, FB + 29);
    check('band (d): a STALE (dead-pid) claim is reaped and the band '
      + 're-claimed', fs.existsSync(reclaimed.dir));
    const staleGone = !fs.readdirSync(PORT_BANDS_DIR)
      .some((n) => n.startsWith(`${FB}-${FB + 29}.`) && !n.endsWith(`.${process.pid}`));
    check('band (d): the stale claim dir is gone', staleGone);
    reclaimed.release();
  }
  // (e) own-lineage: claim the 30-wide band centred on this run's CDP port
  // (the lane's real turf under the multi-session convention — for the
  // canonical OB_E2E_CDP_PORT mid-band assignment this IS the lane band);
  // our own ports inside it must NOT refuse. The launch itself is arm-2
  // territory — here the assertion helper is the seam.
  const ownStart = CDP - BAND_CDP_OFFSET;
  // The 30-wide window is the CONVENTION's lane band; a lane assigned a
  // narrower band (this suite needs 20 http/CDP ports, its lane band may
  // be exactly 20) has a window that reaches past its own turf, and a LIVE
  // neighbour there refuses the claim under GH-338 — a box condition, not
  // a harness verdict. It used to be an uncaught throw that killed the
  // whole suite mid-run (2026-09-07: a sibling lane's live 9710-9719 claim
  // against this lane's 9719-9748 window); it is now a SKIP row BY NAME
  // (harvest-matched: the run is waived, never banked) and the (e) checks
  // that need the claim are skipped, the pure layout-law checks still run.
  let own = null;
  try { own = await claimPortBand(ownStart, ownStart + 29); } catch (e) {
    if (!/overlaps the LIVE/.test(e.message)) throw e;
    console.log(`[hygiene] SKIP band (e) own-lineage — SKIPPED: the 30-wide window ${ownStart}-${ownStart + 29} `
      + `centred on this run's CDP ${CDP} is refused by a LIVE foreign neighbour claim `
      + `(${e.message.split('\n')[0].replace(/^port band \S+ /, '')}); the lane band is narrower `
      + 'than the 30-wide convention, so this is a box condition — assign a 30-wide band for full coverage.');
  }
  if (own) {
    let eErr = null;
    try { assertPortOutsideForeignBands(CDP, 'CDP port'); } catch (e) { eErr = e; }
    check('band (e): a lane\'s OWN claim never refuses its own ports',
      eErr === null, String(eErr?.message ?? ''));
    // (e, lineage): a CHILD of the claiming lane inherits ownership via env
    const kid = spawnSync(process.execPath, ['--input-type=module', '-e', `
      const { assertPortOutsideForeignBands } = await import(${JSON.stringify(
      path.join(WEB_DIR, 'tools', 'cdp.mjs'))});
      assertPortOutsideForeignBands(${CDP}, 'CDP port');
      console.log('child-ok');
    `], { encoding: 'utf8', timeout: 10000,
      env: { ...process.env } }); // OB_PORT_BANDS travels via process.env
    check('band (e): a CHILD process inherits band ownership via '
      + 'OB_PORT_BANDS', kid.stdout.includes('child-ok'),
    `status=${kid.status} ${kid.stderr}`);
  }
  // layout law: the ONE intra-band definition keeps halves disjoint
  const lay = bandLayout(ownStart, ownStart + 29);
  check('band layout: http half and CDP half are disjoint by construction',
    lay.http(0) === ownStart && lay.cdp(0) === ownStart + BAND_CDP_OFFSET
    && lay.http(BAND_CDP_OFFSET - 1) < lay.cdp(0));
  let layErr = null;
  try { lay.http(BAND_CDP_OFFSET); } catch (e) { layErr = e; }
  check('band layout: an http index escaping its half THROWS (the '
    + 'fix-qa1-p2 CDP=HTTP+15 self-collision class)', layErr !== null);
  own?.release();
}

// ---- arm 8b (GH-389): lineage-aware claim liveness -----------------------------
// The claim's lease was single-PID while its ownership is a lineage: a
// claiming wrapper/driver that dies (SIGKILL — no exit hooks, the 128+N /
// crashed-wrapper shape) while a spawned child still holds the band via
// OB_PORT_BANDS got its claim reaped on the next scan, and a foreign lane
// could then claim into the orphan's still-bound CDP/HTTP ports. Staged
// like the 8b lanes above, one level deeper: a CLAIMANT child claims a
// probe band and spawns a HOLDER child that re-asserts the inherited claim
// (any registry scan self-leases; the holder VERIFIES its lease landed
// before signalling ready — the product retries on every scan, so the
// staging retries too); this gate then SIGKILLs the claimant by exact pid,
// leaving the holder orphaned-but-live.
//   (f) dead claimant + live holder: an overlapping foreign claim REFUSES,
//       an in-band foreign port REFUSES, and the claim dir survives scans;
//   (g) claimant AND holder both dead: reap-on-sight still works — the
//       band is re-claimable and the stale dir is gone (no wedge).
// EVERY actor (claimant, holder, the (f)/(g) probes) runs in a PRIVATE
// registry via the OB_PORT_BANDS_DIR seam: this box runs concurrent lanes
// on OLDER harness versions whose reap-on-sight predates leases — they
// reap any dead-claimant claim regardless of live holders (measured
// 2026-08-06: a staged lease-held claim in the shared registry was reaped
// by a foreign lane within 60 s), which would make this arm's verdict
// depend on foreign lanes' timing. Old harnesses ignore the seam, so the
// PRE-FIX red-proof stays honest: the staged actors then share the real
// registry and the (f) checks fail exactly as the defect predicts.
{
  const { spawn } = await import('node:child_process');
  const cdpPath = path.join(WEB_DIR, 'tools', 'cdp.mjs');
  const REG = `/tmp/ob-port-bands-hygiene-${process.pid}`;
  fs.rmSync(REG, { recursive: true, force: true });
  const regEnv = { ...process.env, OB_PORT_BANDS: '', OB_PORT_BANDS_DIR: REG };
  // one probe process per registry question, carrying the private-registry
  // env (the hygiene process's own cdp.mjs import is bound to the real
  // registry and must stay out of the staged story)
  const probe = (src) => spawnSync(process.execPath,
    ['--input-type=module', '-e', src, cdpPath, String(FB)],
    { encoding: 'utf8', timeout: 20000, env: regEnv });
  // the claimant: claims [start, start+29], spawns the holder INSIDE the
  // claim's env lineage, announces the holder's pid once its lease is
  // PROVABLY published, then HOLDS until this gate SIGKILLs it — the
  // defect's exact shape. Holder source is built with string concat (one
  // nesting level per process, never a template-in-template).
  const claimantSrc = `
    const { spawn } = await import('node:child_process');
    const cdp = process.argv[1];
    const start = Number(process.argv[2]);
    const { claimPortBand } = await import(cdp);
    await claimPortBand(start, start + 29);
    const holderSrc = [
      'const fs = await import("node:fs");',
      'const cdp = process.argv[1];',
      'const start = Number(process.argv[2]);',
      'const { assertPortOutsideForeignBands } = await import(cdp);',
      // any registry touch re-asserts the inherited claim (GH-389
      // self-lease); retried until the lease PROVABLY landed (a transient
      // ps birth-time failure skips one scan by design — the product
      // simply retries on its next scan, and so does this loop)
      'const dir = (process.env.OB_PORT_BANDS_DIR ?? "/tmp/ob-port-bands")',
      '  + "/" + start + "-" + (start + 29) + "." + process.ppid;',
      'for (let i = 0; i < 20; i++) {',
      "  assertPortOutsideForeignBands(start + 16, 'CDP port');",
      '  if (fs.existsSync(dir + "/lease-" + process.pid + ".json")) break;',
      '  await new Promise((r) => setTimeout(r, 100));',
      '}',
      "console.log('holder-ready');",
      'setInterval(() => {}, 1000); // hold until killed',
      'setTimeout(() => process.exit(0), 60000); // orphan failsafe (review r1 P2)',
    ].join('\\n');
    const kid = spawn(process.execPath,
      ['--input-type=module', '-e', holderSrc, cdp, String(start)],
      { stdio: ['ignore', 'pipe', 'ignore'], env: process.env });
    console.log('spawned ' + kid.pid); // announced BEFORE readiness so the
    // gate can reap the holder on EVERY failure path (review r1 P2)
    setTimeout(() => process.exit(3), 25000); // failsafe: the gate kills us
    kid.stdout.on('data', (d) => {
      if (String(d).includes('holder-ready')) console.log('holder ' + kid.pid);
    });
  `;
  // pid-scattered like the 8b probes (harmless in the private registry,
  // load-bearing for the PRE-FIX red-proof where old code shares the real
  // one); +4000-salted so the two arms' candidate sets stay disjoint.
  // Candidates whose staged ranges would cover BAND_MUTEX_PORT are
  // skipped (review r8 P2: claimPortBand REFUSES a mutex-covering band by
  // design, which read as a PID-dependent arm failure): the staged claim
  // spans [FB, FB+29] and the (f) probe [FB+10, FB+39], so [FB, FB+39]
  // must avoid the mutex port. The 46000-47279 run-gate canary block is
  // skipped too (review r11 P2): those probes BIND real chrome/http
  // sockets, and the would-reap walk consults host-global lsof even
  // under a private registry — an identity-passing foreign listener
  // inside the staged range would be adopted into the staged claim and
  // wedge arm (g).
  const { BAND_MUTEX_PORT } = await import('./cdp.mjs');
  let FB = null;
  for (let attempt = 0; FB === null && attempt < 9; attempt++) {
    const cand = 45000 + ((process.pid * 61 + 4000 + attempt * 977) % 9000);
    if (cand <= BAND_MUTEX_PORT && BAND_MUTEX_PORT <= cand + 39) continue;
    if (cand <= 47279 + 40 && 46000 - 40 <= cand + 39) continue; // canaries
    FB = cand;
  }
  let holderPid = null;
  {
    const kid = spawn(process.execPath,
      ['--input-type=module', '-e', claimantSrc, cdpPath, String(FB)],
      { stdio: ['ignore', 'pipe', 'ignore'], env: regEnv });
    holderPid = await new Promise((res) => {
      let out = '';
      let killed = false;
      const t = setTimeout(() => {
        try { kid.kill('SIGKILL'); } catch { /* already gone */ }
        res(null);
      }, 30000);
      kid.stdout.on('data', (d) => {
        out += String(d);
        if (!killed && /holder (\d+)/.test(out)) {
          killed = true; // the defect stage: SIGKILL the live claimant (no
          // exit hooks run — its deliberate-release path must NOT fire)
          try { process.kill(kid.pid, 'SIGKILL'); } catch { /* raced */ }
        }
      });
      kid.once('exit', () => {
        clearTimeout(t);
        const m = /holder (\d+)/.exec(out);
        if (killed && m) return res(Number(m[1]));
        // failure path: reap the ANNOUNCED holder by exact pid so a botched
        // setup never leaks the interval-held grandchild (review r1 P2; the
        // holder's own 60 s failsafe is the belt behind this)
        const sp = /spawned (\d+)/.exec(out);
        if (sp) { try { process.kill(Number(sp[1]), 'SIGKILL'); } catch { /* gone */ } }
        res(null);
      });
    });
  }
  check('band lineage setup: claimant claimed, spawned a lineage holder, '
    + 'and DIED with the holder live',
  holderPid !== null && pidAlive(holderPid), `FB=${FB} holder=${holderPid}`);
  if (holderPid !== null && pidAlive(holderPid)) {
    const claimDirAlive = () => {
      try {
        return fs.readdirSync(REG).some((n) => n.startsWith(`${FB}-${FB + 29}.`));
      } catch { return false; } // never created (old code): the defect shape
    };
    try {
      // (f) the dead claimant's band is still HELD by its live child
      const f1 = probe(`
        const { claimPortBand } = await import(process.argv[1]);
        const start = Number(process.argv[2]);
        try {
          const c = await claimPortBand(start + 10, start + 39);
          console.log('claimed'); c.release();
        } catch (e) { console.log('refused: ' + e.message.split('\\n')[0]); }
      `);
      check('band (f): a dead claimant\'s band with a LIVE lineage holder '
        + 'REFUSES a foreign overlapping claim (GH-389)',
      /refused: .*overlaps the LIVE foreign claim/.test(f1.stdout),
      `stdout=${f1.stdout.trim()} — 'claimed' means the claim was reaped `
        + 'under the live holder');
      const f2 = probe(`
        const { assertPortOutsideForeignBands } = await import(process.argv[1]);
        const start = Number(process.argv[2]);
        try {
          assertPortOutsideForeignBands(start + 16, 'CDP port');
          console.log('allowed');
        } catch (e) { console.log('refused: ' + e.message.split('\\n')[0]); }
      `);
      check('band (f): an in-band port still REFUSES foreign use while the '
        + 'holder lives', /refused: .*foreign port\s+band/.test(f2.stdout),
      `stdout=${f2.stdout.trim()}`);
      check('band (f): the claim dir SURVIVES scans while the holder lives',
        claimDirAlive());
    } finally {
      try { process.kill(holderPid, 'SIGKILL'); } catch { /* raced */ }
    }
    // (g) all holders dead: the reap-on-sight law is intact — no wedge
    for (let i = 0; i < 50 && pidAlive(holderPid); i++) await sleep(100);
    check('band (g): the lineage holder is confirmed gone (exact-pid kill)',
      !pidAlive(holderPid));
    const g1 = probe(`
      import fs from 'node:fs';
      const { claimPortBand, PORT_BANDS_DIR } = await import(process.argv[1]);
      const start = Number(process.argv[2]);
      try {
        const c = await claimPortBand(start, start + 29);
        console.log('reclaimed: ' + fs.existsSync(c.dir));
        console.log('stale-gone: ' + !fs.readdirSync(PORT_BANDS_DIR)
          .some((n) => n.startsWith(start + '-' + (start + 29) + '.')
            && !n.endsWith('.' + process.pid)));
        c.release();
      } catch (e) { console.log('refused: ' + e.message.split('\\n')[0]); }
    `);
    check('band (g): with claimant AND holder dead the claim is reaped and '
      + 'the band re-claimable (leases never wedge)',
    /reclaimed: true/.test(g1.stdout), `stdout=${g1.stdout.trim()}`);
    check('band (g): the dead lineage\'s claim dir is gone',
      /stale-gone: true/.test(g1.stdout), `stdout=${g1.stdout.trim()}`);
  }
  fs.rmSync(REG, { recursive: true, force: true });
}

// ---- arm 8h (NOTE-CIRED-RELEASED-CLAIM): released / dead claimants, orphan endpoints, the double signal --
// The owner's own verification of #725 (2026-09-08): a run-gate wrapper killed by GNU
// `timeout` (a process-GROUP SIGTERM) left its claim dir behind with owner.json
// released:true and a DEAD pid, and the next run-gate call refused the band as
// "overlaps the LIVE foreign claim (pid <dead>)". Measured cause: the suite child
// received the group's SIGTERM AND run-gate's forwarded SIGTERM; its one-shot
// signal reaper had fired on the first, so the second hit Node's restored default
// disposition and killed it mid-'exit' backstop — its DETACHED http.server group
// survived as an orphan, the wrapper saw that server's lease at exit, wrote
// released:true and the orphan held the band until some later launch's startup
// sweep aged it out. Four laws now hold:
//   (r1) a released / dead-pid claim with no live holder is swept and re-claimed,
//        BY NAME in the log (the sweep itself predates this round — regression guard;
//        the log line is new);
//   (r2) an ORPHANED marked http.server (dead harness, PPID 1) holding such a claim
//        is reaped at claim time (GH-294's own marked rule, range-scoped), the claim
//        swept, the band claimed — red-proof: 8c76bf6d refused it LIVE naming the dead pid;
//   (r3) a live LINEAGE holder keeps the claim, and the refusal names THAT holder
//        and the claimant's real state — red-proof: 8c76bf6d named the dead pid as owner;
//   (r4) run-gate + suite under a GROUP SIGTERM tear the suite's detached server
//        down and leave no claim dir — red-proof: 8c76bf6d left orphan + released claim.
// Staged in a PROBE CHILD under a private registry and a private marker dir (the
// OB_PORT_BANDS_DIR / OB_SERVER_MARKER_DIR seams, as arm 8f): a shared box's other
// lanes must never see the planted claims, and their startup sweeps must never reap
// the planted orphan before the leg does. Ports are pid-scattered in undeclared space
// and verified free of listeners before the probe starts.
{
  const { spawn } = await import('node:child_process');
  let B = null;
  for (let attempt = 0; attempt < 6 && B === null; attempt++) {
    const cand = 54000 + (((process.pid % 300) + attempt * 37) % 300) * 30; // 54000-62970: clear of arm 8b's 45000-53999 probes and of BAND_MUTEX_PORT
    if (await windowFree(cand, cand + 89)) B = cand;
  }
  check('8h setup: a listener-free 90-port probe window in undeclared space', B !== null);
  if (B !== null) {
    const stage = fs.mkdtempSync('/tmp/obw-hygiene-8h-');
    const REG = path.join(stage, 'reg'); const MRK = path.join(stage, 'mrk'); fs.mkdirSync(REG); fs.mkdirSync(MRK);
    const probe = path.join(stage, 'probe.mjs');
    fs.writeFileSync(probe, `
import fs from 'node:fs'; import path from 'node:path'; import { spawn, spawnSync, execFileSync } from 'node:child_process';
const WEB = ${JSON.stringify(WEB_DIR)}; const B = ${B}; const REG = process.env.OB_PORT_BANDS_DIR; const MRK = process.env.OB_SERVER_MARKER_DIR;
const cdp = await import(path.join(WEB, 'tools', 'cdp.mjs'));
let __t0 = Date.now(); const res = (leg, ok, detail = '') => { console.log('RES ' + JSON.stringify({ leg, ok: !!ok, ms: Date.now() - __t0, detail: String(detail).slice(0, 400) })); __t0 = Date.now(); };
const lstartOf = (pid) => { try { return execFileSync('ps', ['-o', 'lstart=', '-p', String(pid)], { encoding: 'utf8', env: { ...process.env, LC_ALL: 'C', LANG: 'C' } }).trim(); } catch { return ''; } }; // GH-1143: the registry's token form
const deadPid = () => spawnSync(process.execPath, ['-e', '0']).pid;
const plantClaim = (start, end, pid) => { const d = path.join(REG, start + '-' + end + '.' + pid); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'owner.json'), JSON.stringify({ pid, lstart: 'Mon Jan  1 00:00:00 2001', at: Date.now() - 60000, released: true, layout: true, enforced: true })); return d; };
const capture = async (fn) => { const lines = []; const orig = console.error; console.error = (...a) => lines.push(a.join(' ')); try { return [await fn(), lines, null]; } catch (e) { return [null, lines, e]; } finally { console.error = orig; } };
const rows = () => execFileSync('ps', ['-axo', 'pid=,ppid=,command='], { encoding: 'utf8', maxBuffer: 64 << 20 }).split('\\n').map((l) => /^\\s*(\\d+)\\s+(\\d+)\\s+(.*)$/.exec(l)).filter(Boolean).map((m) => ({ pid: +m[1], ppid: +m[2], command: m[3] }));
const treeOf = (dir, port) => rows().filter((r) => r.command.includes('http.server') && r.command.includes(dir) && r.command.includes(' ' + port));
const net = await import('node:net');
// #763: a port's state is listening / refused / unknown, and a connect that times out is no verdict — a one-shot 400 ms
// probe read a LISTENING fixture as down under load (setup reds) and could read a surviving server as gone (false passes)
const PS = await import(path.join(WEB, 'tools', 'lib', 'port-state.mjs'));
const STALL = Number(process.env.OB_8H_PROBE_STALL_MS || 0); // test seam (test-hygiene-8h-probe.mjs): this process delayed past each connect's completion, the measured race
const waitState = (port, want, boundMs) => PS.awaitPortState(port, want, { boundMs, stallMs: STALL });
const stateLine = (st) => st.last + ' after ' + st.probes + ' probe(s) / ' + st.ms + ' ms';
// a setup that never reads listening names the port's sockets: a bound socket that is not listening reads (CLOSED), and macOS
// drops a SYN to it, so a connect times out (#763 hosted macOS: e2e-retry B6's python servers read (CLOSED) for > 10 s, one
// refused probe before the bind, then 17 timeouts); lsof exits 1 with nothing to list, and also after a warning with rows listed,
// so its stdout is read
const socketsOf = (port) => { let txt = ''; try { txt = execFileSync('lsof', ['-nP', '-iTCP:' + port], { encoding: 'utf8', timeout: 5000 }); } catch (e) { if (e.status !== 1) return 'lsof ' + (e.status ?? e.code); txt = String(e.stdout ?? ''); } return txt.trim().split('\\n').slice(1).filter(Boolean).map((l) => { const f = l.trim().split(/\\s+/); return f[0] + ' ' + f[1] + ' ' + f.slice(-2).join(' '); }).join('; ') || 'none'; };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const ppidOf = (pid) => { try { return Number(execFileSync('ps', ['-o', 'ppid=', '-p', String(pid)], { encoding: 'utf8' }).trim()); } catch { return NaN; } };
// (r1)
{ const dp = deadPid(); const d = plantClaim(B, B + 29, dp);
  const [claim, lines, err] = await capture(() => cdp.claimPortBand(B, B + 29));
  res('r1a', !err && claim && fs.existsSync(claim.dir) && !fs.existsSync(d), err ? err.message : '');
  res('r1b', lines.some((l) => new RegExp('\\\\[bands\\\\] swept stale claim ' + B + '-' + (B + 29) + '\\\\.' + dp + ': claimant pid ' + dp + ' dead, released, no live holder').test(l)), lines.join(' | '));
  claim?.release(); }
// (r2)
{ const dp = deadPid(); const dh = deadPid();
  const root = fs.mkdtempSync(path.join(process.env.OB_8H_STAGE, 'tree-')); fs.writeFileSync(path.join(root, 'app.html'), 'planted'); fs.mkdirSync(path.join(root, 'tools/render'), { recursive: true }); fs.writeFileSync(path.join(root, 'tools/render/grade.json'), '{}');
  // every fixture server binds loopback, in spawnStaticServer's bind form (-d <dir> --bind 127.0.0.1 <port>): http.server's
  // server_bind runs socket.getfqdn between bind and listen, and for a wildcard bind that resolves a name through the resolver
  // (python 3.12: the host's own name); a loopback bind looks up only the loopback address. test-hygiene-8h-probe.mjs prints the
  // times on each host (#763: on a hosted macOS runner the wildcard python listeners stayed unreachable for > 10 s)
  const port = B + 3; const srv = Number(execFileSync('/bin/sh', ['-c', 'python3 -m http.server -d ' + root + ' --bind 127.0.0.1 ' + port + ' >/dev/null 2>&1 & echo $!'], { encoding: 'utf8' }).trim());
  let claim = null, lines = [], err = null, before = 0, d = null; const markerFile = cdp.serverMarkerPath(srv);
  try {
    const up2 = await waitState(port, 'listening', 15000); // the grandchild listens (re-probed; a timeout is never read as down)
    const ls = lstartOf(srv);
    fs.writeFileSync(markerFile, JSON.stringify({ pid: srv, harnessPid: dh, port: String(port), webDir: root, lstart: ls || null, at: Date.now() }));
    d = plantClaim(B, B + 29, dp); fs.writeFileSync(path.join(d, 'lease-' + srv + '.json'), JSON.stringify({ pid: srv, lstart: ls, at: Date.now() }));
    before = (alive(srv) && ppidOf(srv) === 1 && up2.ok) ? 1 : 0; // a live PPID-1 wrapper with a listening grandchild
    res('r2s', before > 0, 'planted orphan alive=' + alive(srv) + ' ppid=' + ppidOf(srv) + ' port ' + port + ' ' + stateLine(up2) + (up2.ok ? '' : ' sockets [' + socketsOf(port) + ']'));
    [claim, lines, err] = await capture(() => cdp.claimPortBand(B, B + 29));
    for (let i = 0; i < 20 && alive(srv); i++) await cdp.sleep(100);
    const gone2 = await waitState(port, 'refused', 10000); // the teardown must SEE the port refused: a timeout never reads as gone
    const after = (alive(srv) || !gone2.ok) ? 1 : 0;
    res('r2a', before > 0 && !err && claim && after === 0 && !fs.existsSync(d) && !fs.existsSync(markerFile), (before > 0 ? '' : 'NOT JUDGED: the setup failed (8h (r2) setup) — ') + 'tree before=' + before + ' after=' + after + ' (port ' + stateLine(gone2) + ') marker=' + fs.existsSync(markerFile) + ' err=' + (err?.message ?? ''));
    res('r2b', lines.some((l) => /\\[bands\\] reaped orphan http\\.server pid\\(s\\) \\d+/.test(l) && l.includes(B + '-' + (B + 29) + '.' + dp)) && lines.some((l) => /\\[bands\\] swept stale claim/.test(l) && l.includes(dp + ' dead, released')), lines.join(' | '));
  } finally { for (const r of treeOf(root, port)) { try { process.kill(r.pid, 'SIGKILL'); } catch {} } claim?.release(); } }
// (r3)
{ const dp = deadPid(); const kid = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
  try {
    let ls = ''; for (let i = 0; i < 20 && !ls; i++) { ls = lstartOf(kid.pid); if (!ls) await cdp.sleep(100); }
    const d = plantClaim(B, B + 29, dp); fs.writeFileSync(path.join(d, 'lease-' + kid.pid + '.json'), JSON.stringify({ pid: kid.pid, lstart: ls, at: Date.now() }));
    let ctrl = null; try { ctrl = await cdp.claimPortBand(B + 30, B + 59); } catch (e) { ctrl = null; } // POSITIVE CONTROL (r8): the same options on an unheld range CLAIM
    const ctrlOk = !!ctrl; ctrl?.release();
    let err = null; try { await cdp.claimPortBand(B, B + 29); } catch (e) { err = e; }
    const msg = String(err?.message ?? 'no throw');
    res('r3a', ctrlOk && !!err, 'control=' + ctrlOk + ' ' + msg);
    res('r3b', new RegExp('claimant pid ' + dp + ' DEAD, RELEASED').test(msg) && new RegExp('held by pid ' + kid.pid + ' \\\\([^)]*setInterval').test(msg) && !new RegExp('\\\\(pid ' + dp + ', ').test(msg), msg);
    kid.kill('SIGKILL'); for (let i = 0; i < 20 && lstartOf(kid.pid); i++) await cdp.sleep(100);
    const [claim, lines] = await capture(() => cdp.claimPortBand(B, B + 29));
    res('r3c', claim && fs.existsSync(claim.dir) && !fs.existsSync(d) && lines.some((l) => /\\[bands\\] swept stale claim/.test(l)), lines.join(' | ')); claim?.release();
  } finally { try { kid.kill('SIGKILL'); } catch {} } }
// (r3d/r3e) the same truth on a RESTORED shape: an abandoned reap tombstone (its reaper crashed between phases) whose owner is released and dead, with a live lease
{ const dp = deadPid(); const dr = deadPid(); const kid = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
  try {
    let ls = ''; for (let i = 0; i < 20 && !ls; i++) { ls = lstartOf(kid.pid); if (!ls) await cdp.sleep(100); }
    const tomb = path.join(REG, 'prep-' + dr + '-reap-' + B + '-' + (B + 29) + '.' + dp); fs.mkdirSync(tomb, { recursive: true });
    fs.writeFileSync(path.join(tomb, 'owner.json'), JSON.stringify({ pid: dp, lstart: 'Mon Jan  1 00:00:00 2001', at: Date.now() - 120000, released: true, layout: true, enforced: true }));
    fs.writeFileSync(path.join(tomb, 'reaper.json'), JSON.stringify({ pid: dr, lstart: 'Mon Jan  1 00:00:00 2001', at: Date.now() - 120000 }));
    fs.writeFileSync(path.join(tomb, 'lease-' + kid.pid + '.json'), JSON.stringify({ pid: kid.pid, lstart: ls, at: Date.now() }));
    let ctrl = null; try { ctrl = await cdp.claimPortBand(B + 30, B + 59); } catch (e) { ctrl = null; } // POSITIVE CONTROL (r8)
    const ctrlOk = !!ctrl; ctrl?.release();
    let err = null; try { await cdp.claimPortBand(B, B + 29); } catch (e) { err = e; }
    const msg = String(err?.message ?? 'no throw');
    res('r3d', ctrlOk && !!err && new RegExp('claimant pid ' + dp + ' DEAD, RELEASED').test(msg) && new RegExp('held by pid ' + kid.pid).test(msg) && !/claimant pid \\d+ LIVE/.test(msg), msg);
    kid.kill('SIGKILL'); for (let i = 0; i < 20 && lstartOf(kid.pid); i++) await cdp.sleep(100);
    const [claim, lines] = await capture(() => cdp.claimPortBand(B, B + 29));
    res('r3e', claim && fs.existsSync(claim.dir) && !fs.readdirSync(REG).some((n) => n.endsWith('.' + dp)) && lines.some((l) => /\\[bands\\] swept (stale claim|abandoned reap tombstone)/.test(l) && l.includes(B + '-' + (B + 29) + '.' + dp)), lines.join(' | ')); claim?.release();
  } finally { try { kid.kill('SIGKILL'); } catch {} } }
// (r4)
{ const suite = path.join(process.env.OB_8H_STAGE, 'srv.mjs');
  // the fixture's server: spawnStaticServer (the leg), or a test seam (test-hygiene-8h-probe.mjs): 'escape' starts the
  // same python server in its own session, reparented before any snapshot (a teardown leak that must stay red), 'none'
  // starts nothing (a setup that never listens)
  const FIX4 = process.env.OB_8H_R4_FIXTURE || 'leg';
  const escapePy = path.join(process.env.OB_8H_STAGE, 'escape.py');
  // a double fork: the server's parent is pid 1 and its session its own before the suite returns (a python3 launcher
  // that runs the real interpreter as its child would otherwise keep the server inside the suite's group)
  fs.writeFileSync(escapePy, "import os, sys\\nif os.fork() > 0:\\n    os._exit(0)\\nos.setsid()\\nif os.fork() > 0:\\n    os._exit(0)\\nos.execvp(sys.executable, [sys.executable, '-m', 'http.server', '-d', sys.argv[1], '--bind', '127.0.0.1', sys.argv[2]])\\n");
  // (an argument array, no shell: a checkout path with a space stays one argument; the first fork exits at once)
  const start4 = FIX4 === 'escape' ? "execFileSync('python3', [" + JSON.stringify(escapePy) + ", " + JSON.stringify(WEB) + ", String(PORT)], { stdio: 'ignore' });"
    : FIX4 === 'none' ? '' : "spawnStaticServer(" + JSON.stringify(WEB) + ", PORT, { bind: '127.0.0.1' });";
  fs.writeFileSync(suite, "import { execFileSync } from 'node:child_process';\\nimport { spawnStaticServer, sleep } from " + JSON.stringify(path.join(WEB, 'tools', 'cdp.mjs')) + ";\\nexport const PORT_INVENTORY = { http: 1, cdp: 1 };\\nconst PORT = Number(process.env.OB_E2E_PORT);\\n" + start4 + "\\nconsole.log('SRV-UP ' + PORT);\\nawait sleep(120000);\\n");
  const b0 = B + 60, b1 = B + 89;
  const rg = spawn(process.execPath, [path.join(WEB, 'tools', 'run-gate.mjs'), '--band', b0 + '-' + b1, '--no-canary', '--no-belt', '--', process.execPath, suite], { cwd: WEB, detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, OB_GATE_LEDGER_DIR: process.env.OB_8H_STAGE } });
  let out = ''; let closed = null; const closedP = new Promise((r) => rg.once('close', (c, s) => { closed = c ?? s; r(closed); }));
  rg.stdout.on('data', (c) => { out += c; }); rg.stderr.on('data', (c) => { out += c; });
  const up = await Promise.race([new Promise((r) => { const look = () => { if (/SRV-UP/.test(out)) r(true); }; rg.stdout.on('data', look); }), closedP.then(() => false), cdp.sleep(30000).then(() => false)]);
  const l0s = up ? await waitState(b0, 'listening', 15000) : { ok: false, last: 'not probed (no SRV-UP)', probes: 0, ms: 0 }; // run-gate's layout puts the suite's http(0) on the band start
  const l0 = l0s.ok ? 1 : 0;
  res('r4s', up && l0 > 0, 'up=' + up + ' band start ' + b0 + ' ' + stateLine(l0s) + (up && !l0s.ok ? ' sockets [' + socketsOf(b0) + ']' : ''));
  try { process.kill(-rg.pid, 'SIGTERM'); } catch {}
  const code = await Promise.race([closedP, cdp.sleep(40000).then(() => 'timeout')]);
  if (code === 'timeout') { try { process.kill(-rg.pid, 'SIGKILL'); } catch {} await Promise.race([closedP, cdp.sleep(5000)]); }
  const g4 = await waitState(b0, 'refused', 10000); // the teardown must SEE the port refused: a timeout never reads as gone
  const l1 = g4.ok ? 0 : 1;
  const dirs = fs.readdirSync(REG).filter((n) => n.startsWith(b0 + '-' + b1 + '.'));
  res('r4', up && l0 > 0 && l1 === 0 && dirs.length === 0 && code !== 'timeout', (up && l0 > 0 ? '' : 'NOT JUDGED: the setup failed (8h (r4) setup) — ') + 'up=' + up + ' listeners before=' + l0 + ' after=' + l1 + ' (' + stateLine(g4) + ') run-gate=' + code + ' dirs=' + JSON.stringify(dirs) + ' ' + dirs.map((n) => { try { return fs.readFileSync(path.join(REG, n, 'owner.json'), 'utf8').slice(0, 80); } catch { return ''; } }).join(' ') + ' ' + out.split('\\n').filter((l) => /\\[run-gate\\]/.test(l) && !/ledger|claimed port band/.test(l)).slice(0, 2).join(' | '));
  if ((await PS.portState(b0)) !== 'refused') { for (const r of rows().filter((r) => r.command.includes('http.server -d ' + WEB + ' --bind 127.0.0.1 ' + b0))) { try { process.kill(r.pid, 'SIGKILL'); } catch {} } } }
process.exit(0); // every leg has reported; a live library timer (the 45 s pending-hold grace) must not keep this probe alive
`);
    const env = { ...process.env, OB_PORT_BANDS: '', OB_PORT_BANDS_DIR: REG, OB_SERVER_MARKER_DIR: MRK, OB_8H_STAGE: stage };
    // the probe's test seams (test-hygiene-8h-probe.mjs sets them on its own copy) never reach the suite's run
    for (const k of ['GITHUB_ACTIONS', 'OB_CI_BANDS', 'CI', 'OB_E2E_PORT', 'OB_E2E_CDP_PORT', 'OB_CDP_PORT', 'OB_PACING_BASELINE', 'OB_8H_PROBE_STALL_MS', 'OB_8H_R4_FIXTURE']) delete env[k];
    const run = spawnSync(process.execPath, [probe], { encoding: 'utf8', timeout: 150000, env, cwd: WEB_DIR }); // the lateness bound (SYNC_LATENESS_BOUND_MS); #763's waits end early on every green path
    const got = Object.fromEntries((run.stdout ?? '').split('\n').filter((l) => l.startsWith('RES ')).map((l) => { const j = JSON.parse(l.slice(4)); return [j.leg, j]; }));
    const leg = (k) => got[k] ?? { ok: false, detail: `no result (probe status ${run.status} ${run.signal ?? ''}; stderr: ${(run.stderr ?? '').slice(-300)})` };
    check('8h (r1): a claim dir with released:true and a DEAD claimant pid and no holder is swept and the band re-claimed (regression guard: the pre-fix registry already swept this shape)', leg('r1a').ok, leg('r1a').detail);
    check('8h (r1): the sweep is logged BY NAME — claim, claimant pid, its state (dead, released), no live holder (the owner\'s "by name in the log")', leg('r1b').ok, leg('r1b').detail);
    check('8h (r2) setup: the planted orphan http.server is a live PPID-1 wrapper and its port accepts (re-probed up to 15 s: a connect that times out is no verdict — #763)', leg('r2s').ok, leg('r2s').detail);
    check('8h (r2): an ORPHANED marked http.server (its marker names a DEAD harness, tree root PPID 1) leased into a dead+released claim is reaped at claim time, the claim swept and the band claimed (red-proof: 8c76bf6d refused it as "overlaps the LIVE foreign claim (pid <dead>)")', leg('r2a').ok, leg('r2a').detail);
    check('8h (r2): the log names the reaped orphan (pid, port, the stale claim it held) and the swept claim', leg('r2b').ok, leg('r2b').detail);
    check('8h (r3): a claim whose claimant is dead+released but which a LIVE lineage holder leases is still refused (the holder is the run)', leg('r3a').ok, leg('r3a').detail);
    check('8h (r3): the refusal names the claimant as DEAD, RELEASED and the live holder pid with its command head (argv0 basename — a runner\'s toolcache node path alone is 88 chars) — never the dead pid as the live owner (red-proof: 8c76bf6d said "(pid <dead>, <dir>)")', leg('r3b').ok, leg('r3b').detail);
    check('8h (r3): once the holder is gone the claim is swept (logged by name) and the band claimed', leg('r3c').ok, leg('r3c').detail);
    check('8h (r3): the RESTORED shapes tell the same truth — an abandoned reap tombstone (dead reaper) whose owner is released and dead, with a live lease, is refused naming the claimant DEAD, RELEASED and the holder, never "claimant pid N LIVE" (refuter: makeClaim carried no state, so every tombstone/grave-restored claim read LIVE for one scan)', leg('r3d').ok, leg('r3d').detail);
    check('8h (r3): once its holder is gone the abandoned tombstone is swept — logged by name (stale claim, or abandoned reap tombstone) — and the band claimed', leg('r3e').ok, leg('r3e').detail);
    check('8h (r4) setup: the suite\'s detached http.server accepts on the band start before the group SIGTERM (re-probed up to 15 s: a connect that times out is no verdict — #763)', leg('r4s').ok, leg('r4s').detail);
    check('8h (r4): run-gate + a server-spawning suite under a process-GROUP SIGTERM (GNU timeout\'s shape: the child gets the group\'s signal AND run-gate\'s forward) tears the suite\'s detached http.server down and leaves NO claim dir (red-proof: 8c76bf6d left the server listening and the claim with released:true)', leg('r4').ok, leg('r4').detail);
    // the probe's private dirs go with the stage; a straggler server is killed by pid above, inside the probe
    fs.rmSync(stage, { recursive: true, force: true });
  }
  // (r5) source pins: one shadow of each law
  {
    const cdpText = fs.readFileSync(path.join(WEB_DIR, 'tools', 'cdp.mjs'), 'utf8');
    const reaper = cdpText.slice(cdpText.indexOf('function installSignalReaper('), cdpText.indexOf('\n}\n', cdpText.indexOf('function installSignalReaper(')));
    check('8h (r5): the signal reaper is process.on with a latch (a repeat during the exit is absorbed, never Node\'s default disposition); the claim scan reaps orphan servers ONLY on the mutex-held reaping pass, only for a dead/released claimant of a foreign claim, with ONE ps snapshot per scan; the marked pass is the ONE function the sweep uses; every claim shape carries claimantStateOf; the refusal names holders through describeClaimHolders (source pins)',
      /process\.on\(sig, /.test(reaper) && /signalExitStarted/.test(reaper) && !/process\.once\(sig/.test(reaper)
        && (cdpText.match(/(?<!function )reapOrphanServersForClaim\(claim, name, sweepRowsOnce\)/g) ?? []).length === 1 && /if \(reap && !claimantLive && !bandIsOwn\(claim\)\) reapOrphanServersForClaim\(/.test(cdpText)
        && (cdpText.match(/(?<!function )markedOrphanServerPass\(rows, \{/g) ?? []).length === 2 // the sweep and the claim scan: two CALL sites, one definition
        && (cdpText.match(/claimantStateOf\(/g) ?? []).length === 3 // the main loop, makeClaim, the definition
        && /overlaps the LIVE foreign `\n\s*\+ `claim \$\{c\.start\}-\$\{c\.end\} \(\$\{c\.dir\}\): \$\{describeClaimHolders\(c\)\}/.test(cdpText),
      'source pins');
  }
}

// ---- arm 8i (companion review r3): a pinned digest stays a digest; every hold dies with the wrapper --
//   (i1) pinned-digest-corrupt: the #705/#725 port-literal sweep rewrote `9714` INSIDE a pinned
//        SHA-256 (orbitsweep-488p.mjs:850 → 65 hex). The lint names any hex run of 61-67 chars that
//        is not 64 (125-131 that is not 128); a deliberately truncated prefix (56-60) and a real
//        digest are not rows; the committed lint folds the row in; the tree is clean.
//   (i2) every pending hold — the main claim's AND the second claims' — is released from ONE
//        cleanup on every exit path. Red-proof: a non-existent executable under a band with a FAR
//        OB_CDP_PORT pin (a second claim); 8c76bf6d released the main hold only, so the second
//        claim's dir survived the exit with its pending file (released:true) for the 45 s grace.
{
  const cib = await import('./lib/ci-bands.mjs'); // block-scoped like the other arms' imports
  const runGate = path.join(WEB_DIR, 'tools', 'run-gate.mjs');
  const dir = fs.mkdtempSync('/tmp/obw-hygiene-8i-digest-');
  const put = (rel, text) => { fs.writeFileSync(path.join(dir, rel), text); return rel; };
  const hex = (n) => 'abcdef0123456789'.repeat(Math.ceil(n / 16)).slice(0, n);
  put('ok64.mjs', `const SHA = '${hex(64)}';\n`); put('ok128.txt', `${hex(128)}\n`); put('prefix57.md', `shown as ${hex(57)}… in a report\n`);
  put('bad65.mjs', `const POCKET_CLOSEUP_SHA256 =\n  '${hex(64).slice(0, 24)}23874${hex(64).slice(28)}';\n`); // the real corruption shape: a 4-digit run → 5 digits
  put('bad63.json', `{"sha256": "${hex(63)}"}\n`); put('bad127.txt', `${hex(127)}\n`);
  const rows = cib.pinnedDigestProblems(['ok64.mjs', 'ok128.txt', 'prefix57.md', 'bad65.mjs', 'bad63.json', 'bad127.txt'], dir);
  check('8i (i1): pinned-digest-corrupt names a 65-hex "SHA-256" (the sweep\'s 4→5 digit swap), a 63-hex one and a 127-hex one — a real 64 / 128 digest and a truncated 57-hex prefix are not rows (red-proof: 8c76bf6d\'s tree carried the 65-char digest and its lint was OK)',
    rows.length === 3 && rows.every((r) => r.kind === 'pinned-digest-corrupt') && rows.some((r) => /bad65\.mjs:2 hex token of 65 chars/.test(r.detail)) && rows.some((r) => /bad63\.json:1 hex token of 63/.test(r.detail)) && rows.some((r) => /bad127\.txt:1 hex token of 127/.test(r.detail)),
    JSON.stringify(rows.map((r) => r.detail.slice(0, 120))));
  fs.rmSync(dir, { recursive: true, force: true });
  const repoRoot = path.resolve(WEB_DIR, '..');
  const tree = cib.pinnedDigestProblems(cib.digestScanFiles(repoRoot), repoRoot);
  check('8i (i1): on this tree every pinned digest is a digest (0 rows over the tracked text files, read from git)', tree.length === 0, JSON.stringify(tree.map((r) => r.detail.slice(0, 140))));
  const libText = fs.readFileSync(path.join(WEB_DIR, 'tools', 'lib', 'ci-bands.mjs'), 'utf8');
  check('8i (i1): the committed lint folds the row in (lintCommittedCiBands runs pinnedDigestProblems over digestScanFiles and ANDs it into ok) — source pin',
    /const digests = pinnedDigestProblems\(digestScanFiles\(repoRoot\), repoRoot\);/.test(libText) && /ok: r\.ok && digests\.length === 0, problems: \[\.\.\.r\.problems, \.\.\.digests\]/.test(libText), 'source pin');
  // (i2) the hold leak — a probe child under a private registry (the seam), the wrapped executable does not exist
  {
    const stage = fs.mkdtempSync('/tmp/obw-hygiene-8i-holds-'); const REG = path.join(stage, 'reg'); fs.mkdirSync(REG);
    const suite = path.join(stage, 'inv.mjs'); fs.writeFileSync(suite, "export const PORT_INVENTORY = { http: 1, cdp: 1 };\nconsole.log('never runs');\n");
    let B = null; for (let a = 0; a < 6 && B === null; a++) { const cand = 56000 + (((process.pid % 200) + a * 41) % 200) * 30; if (await windowFree(cand, cand + 29) && await windowFree(cand + 2000, cand + 2001)) B = cand; }
    const pin = B + 2000; // FAR (> 1024 away, no declared boundary in between) → registered as a SECOND claim, with its own pending hold
    const env = { ...process.env, OB_PORT_BANDS: '', OB_PORT_BANDS_DIR: REG, OB_GATE_LEDGER_DIR: stage, OB_CDP_PORT: String(pin) };
    for (const k of ['GITHUB_ACTIONS', 'OB_CI_BANDS', 'CI', 'OB_E2E_PORT', 'OB_E2E_CDP_PORT', 'OB_PACING_BASELINE']) delete env[k];
    const r = spawnSync(process.execPath, [runGate, '--band', `${B}-${B + 29}`, '--no-canary', '--no-belt', '--', '/nonexistent/obw-bin', suite], { encoding: 'utf8', env, cwd: WEB_DIR, timeout: 60000 });
    const said = r.stdout + r.stderr;
    const left = fs.readdirSync(REG);
    check(`8i (i2): a non-existent executable under --band ${B}-${B + 29} with a FAR OB_CDP_PORT=${pin} registers the second claim, fails the spawn (ENOENT, exit 127) — and NO claim dir survives the exit: every hold was released from the one cleanup (red-proof: 8c76bf6d left ${pin}-${pin}.<pid> behind with its pending-*.json for the 45 s grace)`,
      B !== null && r.status === 127 && /registered a SECOND claim/.test(said) && /child spawn failed: spawn \/nonexistent\/obw-bin ENOENT/.test(said) && left.length === 0,
      `status ${r.status} left=${JSON.stringify(left)} ${said.split('\n').filter((l) => /SECOND claim|spawn failed/.test(l)).join(' | ').slice(0, 240)}`);
    const rg = fs.readFileSync(runGate, 'utf8');
    check('8i (i2): ONE cleanup — releaseHolds spans spawnHold and every extraHold, is registered as the exit backstop, and is what the lease-published, spawn-error, close and signal-last-resort paths call (source pins)',
      /const releaseHolds = \(\{ leasedOnly = false \} = \{\}\) => \{/.test(rg) && /process\.once\('exit', \(\) => releaseHoldsByChildState\('exit'\)\);/.test(rg) && (rg.match(/releaseHolds\(\);/g) ?? []).length >= 3 && !/if \(spawnHold\) spawnHold\.release\(\);/.test(rg),
      `${(rg.match(/releaseHolds\(\);/g) ?? []).length} call sites`);
    fs.rmSync(stage, { recursive: true, force: true });
  }
  // (i3)/(i4) lease state PER CLAIM (companion review r4 P2): a failed EXTRA-claim lease after a
  // successful main lease must NOT drop the extra claim's hold — the hold is what keeps that range
  // refused to a foreign claimant while the wrapper (or its crash) leaves the child unregistered
  // there. Staged in a probe child under a private registry; the extra lease is failed through the
  // TEST SEAM OB_RUN_GATE_FAULT_LEASE=<range> (honoured only under a non-default registry).
  {
    const stage = fs.mkdtempSync('/tmp/obw-hygiene-8i-lease-'); const REG = path.join(stage, 'reg'); fs.mkdirSync(REG);
    const suite = path.join(stage, 'hold.mjs');
    fs.writeFileSync(suite, "export const PORT_INVENTORY = { http: 1, cdp: 1 };\nconsole.log('HOLD-READY ' + process.env.OB_PORT_BANDS);\nawait new Promise((r) => setTimeout(r, 60000));\n");
    let B = null; for (let a = 0; a < 6 && B === null; a++) { const cand = 56000 + (((process.pid % 200) + a * 53 + 7) % 200) * 30; if (await windowFree(cand, cand + 29) && await windowFree(cand + 2000, cand + 2001)) B = cand; }
    const pin = B + 2000; const pinKey = `${pin}-${pin}`;
    const { spawn } = await import('node:child_process');
    const baseEnv = { ...process.env, OB_PORT_BANDS: '', OB_PORT_BANDS_DIR: REG, OB_GATE_LEDGER_DIR: stage, OB_CDP_PORT: String(pin) };
    for (const k of ['GITHUB_ACTIONS', 'OB_CI_BANDS', 'CI', 'OB_E2E_PORT', 'OB_E2E_CDP_PORT', 'OB_PACING_BASELINE', 'OB_RUN_GATE_FAULT_LEASE']) delete baseEnv[k];
    const startGate = async (env) => {
      const rg = spawn(process.execPath, [runGate, '--band', `${B}-${B + 29}`, '--no-canary', '--no-belt', '--', process.execPath, suite], { cwd: WEB_DIR, stdio: ['ignore', 'pipe', 'pipe'], env });
      let out = ''; rg.stdout.on('data', (c) => { out += c; }); rg.stderr.on('data', (c) => { out += c; });
      const ready = await new Promise((res) => { const t = setTimeout(() => res(false), 30000); const look = () => { if (/HOLD-READY/.test(out)) { clearTimeout(t); res(true); } }; rg.stdout.on('data', look); rg.once('close', () => { clearTimeout(t); res(false); }); });
      return { rg, ready, out: () => out };
    };
    const dirOf = (key) => fs.readdirSync(REG).find((n) => n.startsWith(`${key}.`)) ?? null;
    const filesOf = (key) => { const d = dirOf(key); return d ? fs.readdirSync(path.join(REG, d)) : []; };
    // a negative probe is a VALID claim with a POSITIVE CONTROL (companion review r8 P2-2): a single-port claim needs
    // { layout: false } (a 1-wide layout claim is refused by the width law before the registry is read — the old probe's
    // REFUSED was vacuous); it first claims the unheld neighbour under the same options, then asserts the SPECIFIC refusal
    const foreignClaim = (port) => spawnSync(process.execPath, ['--input-type=module', '-e', `const { claimPortBand } = await import(${JSON.stringify(path.join(WEB_DIR, 'tools', 'cdp.mjs'))}); try { const c0 = await claimPortBand(${port + 1}, ${port + 1}, { layout: false }); console.log('CONTROL CLAIMED ${port + 1}'); c0.release(); } catch (e) { console.log('CONTROL REFUSED ' + e.message.split('\\n')[0]); } try { const c = await claimPortBand(${port}, ${port}, { layout: false }); console.log('CLAIMED'); c.release(); } catch (e) { console.log('REFUSED ' + e.message.split('\\n')[0]); }`], { encoding: 'utf8', timeout: 30000, env: { ...baseEnv, OB_CDP_PORT: undefined } });
    const childPidOf = (rg) => { try { return Number(execFileSync('pgrep', ['-P', String(rg.pid)], { encoding: 'utf8', timeout: SYNC_CHILD_TIMEOUT_MS }).split('\n').filter(Boolean)[0]); } catch { return null; } };
    // (i3) main leases, the extra lease FAILS
    {
      const { rg, ready, out } = await startGate({ ...baseEnv, OB_RUN_GATE_FAULT_LEASE: pinKey });
      const mainFiles = filesOf(`${B}-${B + 29}`), extraFiles = filesOf(pinKey);
      const reported = new RegExp(`lease NOT published for claim\\(s\\) ${pinKey} \\(lease refused by OB_RUN_GATE_FAULT_LEASE`).test(out());
      const kid = childPidOf(rg);
      try { process.kill(rg.pid, 'SIGKILL'); } catch { /* raced */ } // the WRAPPER crashes; the child (unregistered on the extra claim) lives on
      await new Promise((r) => rg.once('close', r));
      const afterCrash = filesOf(pinKey);
      const probe = foreignClaim(pin);
      check(`8i (i3): main leases, the extra claim's lease fails — the partial lease is reported BY NAME, the main hold is released (lease-<child> present, no pending) while the extra claim keeps its pending hold; after the WRAPPER crashes (SIGKILL) that hold still stands and a foreign claimant is REFUSED the range (red-proof: d7623991 dropped every hold once the main lease published — the extra range was reaped and CLAIMED by the foreigner)`,
        B !== null && ready && reported && mainFiles.some((f) => /^lease-\d+\.json$/.test(f)) && !mainFiles.some((f) => /^pending-/.test(f)) && extraFiles.some((f) => /^pending-/.test(f)) && !extraFiles.some((f) => /^lease-/.test(f)) && afterCrash.some((f) => /^pending-/.test(f))
          && new RegExp(`CONTROL CLAIMED ${pin + 1}`).test(probe.stdout) && new RegExp(`REFUSED port band ${pin}-${pin} overlaps the LIVE foreign claim ${pin}-${pin}`).test(probe.stdout),
        `ready=${ready} reported=${reported} main=${JSON.stringify(mainFiles)} extra=${JSON.stringify(extraFiles)} afterCrash=${JSON.stringify(afterCrash)} foreign=${probe.stdout.trim().slice(0, 160)}`);
      if (kid) { try { process.kill(kid, 'SIGKILL'); } catch { /* gone */ } }
      for (const n of fs.readdirSync(REG)) fs.rmSync(path.join(REG, n), { recursive: true, force: true });
    }
    // (i4) every lease publishes → every hold released, the run closes clean
    {
      const { rg, ready, out } = await startGate(baseEnv);
      const mainFiles = filesOf(`${B}-${B + 29}`), extraFiles = filesOf(pinKey);
      const kid = childPidOf(rg);
      if (kid) { try { process.kill(kid, 'SIGTERM'); } catch { /* gone */ } }
      const code = await new Promise((res) => { const t = setTimeout(() => res('timeout'), 30000); rg.once('close', (c, s) => { clearTimeout(t); res(c ?? s); }); });
      const left = fs.readdirSync(REG);
      check('8i (i4): every lease publishes — both claims carry lease-<child> and NO pending hold right after the spawn, nothing is reported, and a normal close leaves the registry empty (the existing behaviour, kept)',
        ready && [mainFiles, extraFiles].every((fl) => fl.some((f) => /^lease-\d+\.json$/.test(f)) && !fl.some((f) => /^pending-/.test(f))) && !/lease NOT published/.test(out()) && code !== 'timeout' && left.length === 0,
        `ready=${ready} main=${JSON.stringify(mainFiles)} extra=${JSON.stringify(extraFiles)} close=${code} left=${JSON.stringify(left)}`);
      if (code === 'timeout') { try { process.kill(rg.pid, 'SIGKILL'); } catch { /* gone */ } }
    }
    const rg2 = fs.readFileSync(runGate, 'utf8');
    check('8i (i3): lease state is PER CLAIM — claimRecords carry {claim, hold, leased}; releaseHolds({ leasedOnly: true }) is the post-lease call; the fault seam is honoured only under a non-default registry (source pins)',
      /const claimRecords = \[/.test(rg2) && /leased: false/.test(rg2) && /releaseHolds\(\{ leasedOnly: true \}\);/.test(rg2) && /if \(leasedOnly && !r\.leased\) continue;/.test(rg2) && /process\.env\.OB_PORT_BANDS_DIR && process\.env\.OB_RUN_GATE_FAULT_LEASE/.test(rg2) && !/childLeased/.test(rg2), 'source pins');
    fs.rmSync(stage, { recursive: true, force: true });
  }
}

// ---- arm 8j (companion review r5): derived offsets are extents; dynamic windows are bands --------
//   (j1) a port DERIVED from another port local by a constant (`CDP_PORT = PORT + 1100`) is an
//        extent the lint models — judged against other tools' defaults and the lane rows with its
//        DERIVED value, never the bare literal (8c76bf6d..abd6769c read e2e-renderpurity's
//        `PORT + 1100` as the literal 1100; the derived 21800 sat inside capture-626-sinkrest's
//        21790-21819 band); a derivation from a base this file cannot value is a red row; a
//        same-role offset inside the declared inventory is a slot of the base, not a new extent;
//        band EDGES (OB_E2E_BAND_START/END defaults) are one range.
//   (j2) a rotation / pid-offset family reaches a RANGE: it must declare `PORT_WINDOW_FAMILY`
//        equal to the reading (undeclared / wrong / unreadable = red), and the declared range is a
//        band against every fixed default (`dynamic-window-overlaps-default`) and every lane row.
//   All through the real entry point (scanToolDefaultFiles → lintCiBands) on a scratch tree, then
//   the tree itself: exactly the three declared families, 0 rows.
{
  const cib = await import('./lib/ci-bands.mjs');
  const table = cib.loadCiBands();
  const lanesT = cib.loadLaneBands(cib.LANE_BANDS_FILE, table);
  const plan = lanesT.bands.filter((b) => !b.legacy).sort((a, b) => a.range.start - b.range.start);
  const dir = fs.mkdtempSync('/tmp/obw-hygiene-8j-');
  const put = (rel, text) => { fs.writeFileSync(path.join(dir, rel), text); return rel; };
  const rows = (files) => cib.lintCiBands({ table, workflows: {}, toolDefaults: cib.scanToolDefaultFiles(files, dir), laneBands: lanesT }).problems;
  const kinds = (files, k) => rows(files).filter((p) => p.kind === k);
  // (j1) the derived extent vs another tool's default, and vs a lane row
  put('deriv.mjs', "export const PORT_INVENTORY = { http: 1, cdp: 1 };\nconst PORT = Number(process.env.OB_E2E_PORT ?? 30300);\nconst CDP_PORT = PORT + 1100;\nconst c = launchChrome(u, { port: CDP_PORT });\n");
  put('victim.mjs', "export const PORT_INVENTORY = { http: 1, cdp: 1 };\nconst CDP = Number(process.env.OB_E2E_CDP_PORT ?? 31400);\n");
  const ov = kinds(['deriv.mjs', 'victim.mjs'], 'tool-default-overlap');
  check('8j (j1): `CDP_PORT = PORT + 1100` is judged at its DERIVED value — 30300 + 1100 = 31400 overlaps the other tool\'s 31400, and the row shows the derivation (red-proof: abd6769c\'s reader took the literal 1100 and saw nothing)',
    ov.length === 1 && /deriv\.mjs:3 CDP_PORT 31400-31400 \[derived-offset\] \(derived: PORT \(30300\) \+ 1100\)/.test(ov[0].detail) && /victim\.mjs:2/.test(ov[0].detail), JSON.stringify(ov.map((p) => p.detail.slice(0, 200))));
  const inLane = plan[2].range.start + 4; // a derived value landing inside a plan row
  put('lane.mjs', `export const PORT_INVENTORY = { http: 1, cdp: 2 };\nconst PORT = Number(process.env.OB_E2E_PORT ?? ${inLane - 700});\nconst CDP_PORT = PORT + 700;\n`);
  const lr = kinds(['lane.mjs'], 'tool-default-in-lane-band');
  check(`8j (j1): a derived CDP landing inside ${plan[2].lane}'s row is named with its derived RANGE (${inLane}-${inLane + 1}: the derivation sized by the cdp inventory) — never with the offset literal`,
    lr.length === 1 && lr[0].detail.includes(`CDP_PORT ${inLane}-${inLane + 1}`) && lr[0].detail.includes(`${plan[2].lane} lane band`), JSON.stringify(lr.map((p) => p.detail.slice(0, 200))));
  put('hop.mjs', "export const PORT_INVENTORY = { http: 1, cdp: 1 };\nconst PORT = Number(process.env.OB_E2E_PORT ?? 30300);\nconst dbg = PORT + 1100;\nconst c = launchChrome(u, { port: dbg });\n");
  const hop = kinds(['hop.mjs', 'victim.mjs'], 'tool-default-overlap');
  check('8j (j1): a derived local whose NAME says nothing (`dbg = PORT + 1100`) is traced through its launch (one hop) and judged at 31400 too', hop.length === 1 && /hop\.mjs:3 dbg 31400-31400 \[derived-offset\]/.test(hop[0].detail), JSON.stringify(hop.map((p) => p.detail.slice(0, 160))));
  put('unknown.mjs', "export const PORT_INVENTORY = { http: 1, cdp: 1 };\nconst CDP_PORT = SOME_PORT + 1100;\n");
  const un = kinds(['unknown.mjs'], 'derived-offset-undeclared');
  check('8j (j1): a derivation from a base this file cannot value (`CDP_PORT = SOME_PORT + 1100`) is a red row naming the base (fail-closed)', un.length === 1 && /unknown\.mjs:2 CDP_PORT = SOME_PORT \+ 1100/.test(un[0].detail), JSON.stringify(un.map((p) => p.detail.slice(0, 160))));
  put('slot.mjs', "export const PORT_INVENTORY = { http: 2, cdp: 1 };\nconst PORT2 = PORT + 1;\nconst s = spawnStaticServer(root, PORT2);\n");
  const slot = rows(['slot.mjs']).filter((p) => /slot\.mjs/.test(p.detail));
  check('8j (j1): a SAME-role offset inside the declared inventory (`PORT2 = PORT + 1` under http 2, the userboot-3g-sw leg module\'s shape) is a slot of the base — no row, even with the base handed in from the importer', slot.length === 0, JSON.stringify(slot.map((p) => p.kind + ' ' + p.detail.slice(0, 120))));
  put('noinv.mjs', "const PORT = Number(process.env.OB_E2E_PORT ?? 30300);\nconst CDP_PORT = PORT + 1100;\n");
  check('8j (j1): a derivation in a file with NO inventory fails closed as undeclared-inventory (the extent cannot be sized)', kinds(['noinv.mjs'], 'undeclared-inventory').length === 1);
  put('edges.mjs', "export const PORT_INVENTORY = { http: 1, cdp: 1 };\nconst band = await claimPortBand(Number(process.env.OB_E2E_BAND_START ?? 30500), Number(process.env.OB_E2E_BAND_END ?? 30529));\n");
  put('inside.mjs', "export const PORT_INVENTORY = { http: 1, cdp: 1 };\nconst CDP = Number(process.env.OB_E2E_CDP_PORT ?? 30510);\n");
  const edge = kinds(['edges.mjs', 'inside.mjs'], 'tool-default-overlap');
  check('8j (j1): band EDGES are one range — a default strictly between OB_E2E_BAND_START ?? 30500 and OB_E2E_BAND_END ?? 30529 is named against the band 30500-30529 (red-proof: two scalar hits let renderpurity\'s 21800 sit inside sinkrest\'s 21790-21819 unseen)',
    edge.length === 1 && /OB_E2E_BAND_START\/END 30500-30529 \[band-string\]/.test(edge[0].detail) && /inside\.mjs:2/.test(edge[0].detail), JSON.stringify(edge.map((p) => p.detail.slice(0, 200))));
  // (j2) dynamic windows
  const rot = (base, decl) => `${decl}export const PORT_INVENTORY = { http: 1, cdp: 1 };\nasync function claimWin() {\n  for (let s = 0; s < 8; s++) {\n    const base = ${base} + (PORT % 499) + (process.pid % 97) + s * 64;\n    try { return await claimPortBand(base, base + 63, { layout: false }); } catch (e) { /* slide */ }\n  }\n}\n`;
  put('rot.mjs', rot(31000, "export const PORT_WINDOW_FAMILY = { start: 31000, end: 32105 };\n")); put('fixed.mjs', "export const PORT_INVENTORY = { http: 1, cdp: 1 };\nconst CDP = Number(process.env.OB_E2E_CDP_PORT ?? 31500);\n");
  const dw = kinds(['rot.mjs', 'fixed.mjs'], 'dynamic-window-overlaps-default');
  check('8j (j2): a DECLARED rotation family (31000 + (PORT % 499) + (pid % 97) + s * 64, s < 8, 64-port windows → 31000-32105) is a band — a fixed default at 31500 is named against it (red-proof: abd6769c had no family model; scenario-render\'s 16393-17498 reach covered 37 tools\' defaults and refused whoever owned them)',
    dw.length === 1 && /rot\.mjs:\d+ PORT_WINDOW_FAMILY 31000-32105 \[dynamic-window\]/.test(dw[0].detail) && /fixed\.mjs:2 CDP 31500/.test(dw[0].detail), JSON.stringify(dw.map((p) => p.detail.slice(0, 220))));
  put('rotnodecl.mjs', rot(31000, ''));
  const nd = kinds(['rotnodecl.mjs'], 'dynamic-window-undeclared');
  check('8j (j2): the same family WITHOUT its declaration is a red row stating the derived reach and the missing declaration', nd.length === 1 && /reaches 31000-32105/.test(nd[0].detail) && /declares no PORT_WINDOW_FAMILY/.test(nd[0].detail), JSON.stringify(nd.map((p) => p.detail.slice(0, 200))));
  put('rotwrong.mjs', rot(31000, "export const PORT_WINDOW_FAMILY = { start: 31000, end: 31063 };\n"));
  const wd = kinds(['rotwrong.mjs'], 'dynamic-window-undeclared');
  check('8j (j2): a declaration NARROWER than the reading (31000-31063 for a 31000-32105 reach) is a red row — no hiding an overlap by under-declaring', wd.length === 2 && wd.some((p) => /reaches 31000-32105 .* but declares 31000-31063/.test(p.detail)), JSON.stringify(wd.map((p) => p.detail.slice(0, 160))));
  put('pidfam.mjs', "export const PORT_WINDOW_FAMILY = { start: 31200, end: 31635 };\nexport const PORT_INVENTORY = { http: 1, cdp: 1 };\nasync function reservePort(base, tries = 40) { return base; }\nconst { port } = await reservePort(31200 + (process.pid % 199) * 2);\n");
  put('fixed2.mjs', "export const PORT_INVENTORY = { http: 1, cdp: 1 };\nconst PORT = Number(process.env.OB_E2E_PORT ?? 31400);\n");
  const pf = kinds(['pidfam.mjs', 'fixed2.mjs'], 'dynamic-window-overlaps-default');
  check('8j (j2): a pid-offset family handed to a probing reserve (31200 + (pid % 199) * 2, 40 candidates → 31200-31635, scenario-titlecard\'s shape) is read, held to its declaration and judged as a band against a fixed 31400', pf.length === 1 && /pidfam\.mjs:4 PORT_WINDOW_FAMILY 31200-31635/.test(pf[0].detail), JSON.stringify(pf.map((p) => p.detail.slice(0, 200))));
  put('pidnoprobe.mjs', "export const PORT_INVENTORY = { http: 1, cdp: 1 };\nconst { port } = await reservePort(31200 + (process.pid % 199) * 2);\n");
  put('rotnoclaim.mjs', "export const PORT_INVENTORY = { http: 1, cdp: 1 };\nconst cdpFor = (o) => 31000 + (PORT % 499) + (process.pid % 97) + o;\n");
  const unr = kinds(['pidnoprobe.mjs', 'rotnoclaim.mjs'], 'dynamic-window-unreadable');
  check('8j (j2): a family the reader cannot size — a reservePort with no declared probe window, a rotation expression with no claimed window — is a red row, never a silent pass', unr.length === 2 && unr.some((p) => /pidnoprobe\.mjs/.test(p.detail)) && unr.some((p) => /rotnoclaim\.mjs/.test(p.detail)), JSON.stringify(unr.map((p) => p.detail.slice(0, 160))));
  put('rotlane.mjs', rot(plan[3].range.start - 700, `export const PORT_WINDOW_FAMILY = { start: ${plan[3].range.start - 700}, end: ${plan[3].range.start - 700 + 1105} };\n`));
  const rl = kinds(['rotlane.mjs'], 'tool-default-in-lane-band');
  check(`8j (j2): a declared family whose reach crosses a lane row (${plan[3].lane}) is named by the lane rule with the family's range and 'a dynamic window family: a band'`, rl.length >= 1 && rl.some((p) => /PORT_WINDOW_FAMILY/.test(p.detail) && /a dynamic window family: a band/.test(p.detail) && p.detail.includes(`${plan[3].lane} lane band`)), JSON.stringify(rl.map((p) => p.detail.slice(0, 200))));
  fs.rmSync(dir, { recursive: true, force: true });
  // the tree: exactly the three declared families, renderpurity's derived CDP at 27240, no rows
  const repoRoot = path.resolve(WEB_DIR, '..');
  const treeHits = await treeHitsOnce();
  const fams = treeHits.filter((h) => h.syntax === 'dynamic-window').map((h) => `${h.file.replace('web/tools/', '')} ${h.range.start}-${h.range.end}`).sort();
  const rp = treeHits.find((h) => /e2e-renderpurity/.test(h.file) && h.syntax === 'derived-offset');
  const treeRows = (await treeLintOnce()).problems.filter((p) => /derived|dynamic/.test(p.kind));
  check('8j: on this tree the dynamic window families are exactly scenario-render 28000-29105 + its http probe 31000-32023, hero-extend-render 11093-12198 + 32100-33123, scenario-titlecard 29200-29635, e2e-ios\'s two free-port scans 8371-8399 / 8381-8399 and the ios acceptance driver\'s copy of them (SHARED_DEFAULT_WINDOW e2e-ios; companion review r9) (declared, disjoint from every fixed default and lane row), e2e-renderpurity\'s CDP is the derived 27240, and the committed lint has 0 derived/dynamic rows',
    fams.join(' | ') === 'hero-extend-render.mjs 11093-12198 | hero-extend-render.mjs 32100-33123 | ios/tools/acceptance.mjs 8371-8399 | ios/tools/acceptance.mjs 8381-8399 | ios/tools/e2e-ios.mjs 8371-8399 | ios/tools/e2e-ios.mjs 8381-8399 | scenario-render.mjs 28000-29105 | scenario-render.mjs 31000-32023 | scenario-titlecard.mjs 29200-29635' && rp && rp.value === 27240 && treeRows.length === 0,
    `${fams.join(' | ')} | renderpurity=${rp?.value} | rows=${JSON.stringify(treeRows.map((p) => p.kind))}`);
}

// ---- arm 8k (companion review r6): inventory implies pin readers; one release owner keyed on the child; fallbacks unwrapped --
//   (k1) a tool that declares PORT_INVENTORY must READ the assigned pins as the fallback of the endpoints it
//        defaults (OB_E2E_PORT / OB_E2E_CDP_PORT, an OB_CDP_PORT read, or the band names it claims from) —
//        renderpurity read neither and escaped every band (rule inventory-without-pin-reader, red).
//   (k2) an unleased hold is released only once the child is known closed; a wrapper exception with the
//        child alive RETAINS it (logged by name), a foreign claimant stays refused, the child's close releases.
//   (k3) a conditional / coalescing derived default is read at its UNPINNED fallback (rollslip: PORT + 20000
//        = 40630, not the literal 20000); an unreadable fallback is red (derived-default-unparsed).
{
  const cib = await import('./lib/ci-bands.mjs');
  const table = cib.loadCiBands(); const lanesT = cib.loadLaneBands(cib.LANE_BANDS_FILE, table);
  const dir = fs.mkdtempSync('/tmp/obw-hygiene-8k-');
  const put = (rel, text) => { fs.writeFileSync(path.join(dir, rel), text); return rel; };
  const rows = (files) => cib.lintCiBands({ table, workflows: {}, toolDefaults: cib.scanToolDefaultFiles(files, dir), laneBands: lanesT }).problems;
  const kinds = (files, k) => rows(files).filter((p) => p.kind === k);
  // (k1)
  put('noreader.mjs', "export const PORT_INVENTORY = { http: 1, cdp: 1 };\nconst PORT = 30800;\nconst CDP_PORT = 30801;\nconst s = spawnStaticServer(root, PORT);\nconst c = launchChrome(u, { port: CDP_PORT });\n");
  const nr = kinds(['noreader.mjs'], 'inventory-without-pin-reader');
  check('8k (k1): a tool with PORT_INVENTORY { http: 1, cdp: 1 } and FIXED literal endpoints (PORT = 30800, CDP_PORT = 30801) is red for BOTH roles — it never reads OB_E2E_PORT / OB_E2E_CDP_PORT, so under run-gate it binds outside its claim (red-proof: 869f3941 linted e2e-renderpurity\'s fixed 20700 / PORT + 6540 as OK)',
    nr.length === 2 && nr.some((p) => /http endpoint \(PORT = 30800, line 2\) but never reads the LAYOUT pin OB_E2E_PORT/.test(p.detail)) && nr.some((p) => /cdp endpoint \(CDP_PORT = 30801, line 3\) but never reads the LAYOUT pin OB_E2E_CDP_PORT/.test(p.detail)), JSON.stringify(nr.map((p) => p.detail.slice(0, 200))));
  put('reader.mjs', "export const PORT_INVENTORY = { http: 1, cdp: 1 };\nconst PORT = Number(argOf('--port') ?? process.env.OB_E2E_PORT ?? 30800);\nconst CDP_PORT = process.env.OB_E2E_CDP_PORT ? Number(process.env.OB_E2E_CDP_PORT) : PORT + 1;\n");
  put('bander.mjs', "export const PORT_INVENTORY = { http: 1, cdp: 1 };\nconst band = await claimPortBand(Number(process.env.OB_E2E_BAND_START ?? 30810), Number(process.env.OB_E2E_BAND_END ?? 30839));\nconst PORT = band.http(0);\n");
  put('flagonly.mjs', "export const PORT_INVENTORY = { http: 1, cdp: 1 };\nexport const PORT_FLAGS = { '--port': 'http' };\nconst PORT = argOf('--port') ?? null;\n");
  check('8k (k1): the pins read as fallbacks (`argOf(\'--port\') ?? process.env.OB_E2E_PORT ?? 30800`, `process.env.OB_E2E_CDP_PORT ? … : PORT + 1`), a band-claiming tool (OB_E2E_BAND_START/END) and a tool with NO unpinned default (`argOf(\'--port\') ?? null`) are not rows',
    ['reader.mjs', 'bander.mjs', 'flagonly.mjs'].every((f) => kinds([f], 'inventory-without-pin-reader').length === 0), JSON.stringify(['reader.mjs', 'bander.mjs', 'flagonly.mjs'].map((f) => kinds([f], 'inventory-without-pin-reader').map((p) => p.detail.slice(0, 100)))));
  // (k3)
  put('rollslip.mjs', "export const PORT_INVENTORY = { http: 1, cdp: 1 };\nconst PORT = args.includes('--port') ? Number(args[args.indexOf('--port') + 1])\n  : Number(process.env.OB_E2E_PORT ?? 30900);\nconst CDP_PORT = process.env.OB_E2E_CDP_PORT\n  ? Number(process.env.OB_E2E_CDP_PORT) : PORT + 20000;\n");
  put('at50900.mjs', "export const PORT_INVENTORY = { http: 1, cdp: 1 };\nconst CDP = Number(process.env.OB_E2E_CDP_PORT ?? 50900);\n");
  const rs = kinds(['rollslip.mjs', 'at50900.mjs'], 'tool-default-overlap');
  check('8k (k3): rollslip\'s shape — `process.env.OB_E2E_CDP_PORT ? Number(…) : PORT + 20000` under a ternary PORT — is read at its UNPINNED fallback 30900 + 20000 = 50900 and named against another tool\'s 50900, the row showing the derivation (red-proof: 869f3941 read the literal 20000)',
    rs.length === 1 && /rollslip\.mjs:4 CDP_PORT 50900-50900 \[derived-offset\] \(unpinned fallback: PORT \(30900\) \+ 20000\)/.test(rs[0].detail), JSON.stringify(rs.map((p) => p.detail.slice(0, 220))));
  put('coalesce.mjs', "export const PORT_INVENTORY = { http: 1, cdp: 1 };\nconst PORT = Number(process.env.OB_E2E_PORT ?? 30900);\nconst A = Number(process.env.OB_E2E_CDP_PORT ?? PORT + 5);\nconst B = process.env.OB_CDP_PORT || PORT + 6;\nconst CDP_ALIAS = process.env.OB_E2E_CDP_PORT ? Number(process.env.OB_E2E_CDP_PORT) : A;\n");
  const co = cib.scanToolDefaultFiles(['coalesce.mjs'], dir).filter((h) => h.syntax === 'derived-offset').map((h) => `${h.name}=${h.value}`).sort().join(',');
  check('8k (k3): `??` and `||` chains and an ALIAS fallback are unwrapped too — A = PORT + 5 → 30905, B = PORT + 6 → 30906, CDP_ALIAS → A → 30905', co === 'A=30905,B=30906,CDP_ALIAS=30905', co);
  put('nested.mjs', "export const PORT_INVENTORY = { http: 1, cdp: 1 };\nexport const PORT_FLAGS = { '--port': 'http' };\nconst PORT = band ? band.http(0) : Number(process.env.OB_E2E_PORT ?? 30950);\nconst CDP = PINNED ? PIN : await claimPortBand(30960, 30989);\nconst NONE = argOf('--port') ?? null;\n");
  const ns = rows(['nested.mjs']).filter((p) => /nested\.mjs/.test(p.detail));
  const nh = cib.scanToolDefaultFiles(['nested.mjs'], dir).map((h) => `${h.syntax}:${h.name ?? h.key}:${h.value ?? (h.range ? h.range.start + '-' + h.range.end : '')}`).sort();
  check('8k (k3): a fallback that is itself `Number(env ?? LIT)` reads the LIT (30950), a claim-literal fallback reads the band (30960-30989), and `?? null` (no unpinned default) is not a default — none of them is an unparsed row',
    ns.length === 0 && nh.includes('nullish-default:PORT:30950') && nh.some((x) => /claim-literal:.*30960-30989/.test(x)) && !nh.some((x) => /NONE/.test(x)), JSON.stringify({ rows: ns.map((p) => p.kind), hits: nh }));
  put('mystery.mjs', "export const PORT_INVENTORY = { http: 1, cdp: 1 };\nconst PORT = Number(process.env.OB_E2E_PORT ?? pickSomething());\n");
  const un = kinds(['mystery.mjs'], 'derived-default-unparsed');
  check('8k (k3): a fallback the reader cannot value (`Number(process.env.OB_E2E_PORT ?? pickSomething())`) is a red row naming the file:line and the RHS (fail-closed)', un.length === 1 && /mystery\.mjs:2 PORT = Number\(process\.env\.OB_E2E_PORT \?\? pickSomething\(\)\)/.test(un[0].detail), JSON.stringify(un.map((p) => p.detail.slice(0, 200))));
  put('scanner.mjs', "export const PORT_WINDOW_FAMILY = { start: 30970, end: 30999 };\nexport const PORT_INVENTORY = { http: 1, cdp: 1 };\nfunction pickFreePort(preferred) {\n  for (let p = preferred; p < 31000; p++) { if (free(p)) return p; }\n  throw new Error('none');\n}\nconst PORT = Number(process.env.OB_E2E_PORT ?? pickFreePort(30970));\n");
  const sc = cib.scanToolDefaultFiles(['scanner.mjs'], dir);
  check('8k (k3): a free-port SCAN fallback (`pickFreePort(30970)` over a loop to 31000 — e2e-ios\'s shape) is a dynamic window family 30970-30999, declared and read as a band, never an unparsed row',
    sc.some((h) => h.syntax === 'dynamic-window' && h.range.start === 30970 && h.range.end === 30999) && !sc.some((h) => /unparsed|undeclared/.test(h.syntax)), JSON.stringify(sc.map((h) => `${h.syntax}:${h.range ? h.range.start + '-' + h.range.end : h.value}`)));
  fs.rmSync(dir, { recursive: true, force: true });
  // the tree: 0 rows of the three kinds; the reader agrees with the binding evaluated UNPINNED on the two derived samples
  const treeRows = (await treeLintOnce()).problems.filter((p) => /inventory-without-pin-reader|derived-default-unparsed|derived-offset-undeclared/.test(p.kind));
  const vm = await import('node:vm');
  const repoRoot = path.resolve(WEB_DIR, '..');
  const evalUnpinned = (f, name) => {
    const text = fs.readFileSync(path.join(repoRoot, f), 'utf8'); const lines = text.split('\n'); const stmts = [];
    for (let i = 0; i < lines.length; i++) { const m = /^(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=/.exec(lines[i]); if (!m) continue; let code = lines[i]; let j = i; while (!/;\s*$/.test(code) && j + 1 < lines.length && j - i < 5) { j++; code += '\n' + lines[j]; } stmts.push(code.replace(/^export\s+/, '')); if (m[1] === name) break; }
    const ctx = vm.createContext({ process: { env: {}, argv: [] }, Number, args: [], argOf: () => null, flag: (k, d) => d, arg: (k, d) => d });
    for (const code of stmts) { try { vm.runInContext(code, ctx); } catch { /* an unrelated const */ } }
    try { return vm.runInContext(name, ctx); } catch { return NaN; }
  };
  const agree = [['web/tools/e2e-rollslip.mjs', 'CDP_PORT'], ['web/tools/e2e-renderpurity.mjs', 'CDP_PORT']].map(([f, n]) => { const h = cib.scanToolDefaultFiles([f], repoRoot).find((x) => x.name === n && Number.isFinite(x.value)); return `${f.replace('web/tools/', '')} reader=${h?.value} bound=${evalUnpinned(f, n)}`; });
  check('8k: on this tree the committed lint has 0 rows of the three kinds, and the reader\'s value equals the binding evaluated UNPINNED for the two derived samples (rollslip 40630, renderpurity 27240 — run-and-read)',
    treeRows.length === 0 && agree.every((a) => /reader=(\d+) bound=\1$/.test(a)) && /reader=40630/.test(agree[0]) && /reader=27240/.test(agree[1]), `${JSON.stringify(treeRows.map((p) => p.kind))} ${agree.join(' | ')}`);
  // (k2) the release owner keyed on the child — a probe under a private registry: lease fault + wrapper exception with the child alive
  {
    const stage = fs.mkdtempSync('/tmp/obw-hygiene-8k-fault-'); const REG = path.join(stage, 'reg'); fs.mkdirSync(REG);
    const suite = path.join(stage, 'hold.mjs'); fs.writeFileSync(suite, "export const PORT_INVENTORY = { http: 1, cdp: 1 };\nconsole.log('HOLD-READY');\nawait new Promise((r) => setTimeout(r, 60000));\n");
    let B = null; for (let a = 0; a < 6 && B === null; a++) { const cand = 56000 + (((process.pid % 200) + a * 59 + 13) % 200) * 30; if (await windowFree(cand, cand + 29) && await windowFree(cand + 2000, cand + 2001)) B = cand; }
    const pin = B + 2000; const pinKey = `${pin}-${pin}`;
    const { spawn } = await import('node:child_process');
    const runGate = path.join(WEB_DIR, 'tools', 'run-gate.mjs');
    const avoid = [[B, B + 29], [pin, pin + 1]]; // the band, the extra claim and the probe's neighbour claim
    const mx = await privateMutex(stage, avoid);
    // the re-pick, on a stub kernel that hands out an in-band port and a pin first (review #1119 P2)
    const stubSeq = [B + 7, pin, pin + 1, 40123]; let stubAt = 0;
    const stubbed = await privateMutex(stage, avoid, async () => stubSeq[stubAt++] ?? null);
    check(`8k (k2) setup: the private mutex port is re-picked until it lies outside the arm's band ${B}-${B + 29} and its pins ${pin}-${pin + 1} (a stub kernel handing out ${B + 7}, ${pin}, ${pin + 1} first lands on 40123; the real pick ${mx.port})`,
      stubbed.port === 40123 && mx.port !== null && !avoid.some(([lo, hi]) => mx.port >= lo && mx.port <= hi), JSON.stringify({ stub: stubbed.port, real: mx.port }));
    const env = { ...process.env, OB_PORT_BANDS: '', OB_PORT_BANDS_DIR: REG, OB_GATE_LEDGER_DIR: stage, OB_CDP_PORT: String(pin), OB_RUN_GATE_FAULT_LEASE: pinKey, OB_RUN_GATE_FAULT_THROW: 'after-spawn', ...mx.env };
    for (const k of ['GITHUB_ACTIONS', 'OB_CI_BANDS', 'CI', 'OB_E2E_PORT', 'OB_E2E_CDP_PORT', 'OB_PACING_BASELINE']) delete env[k];
    const rg = spawn(process.execPath, [runGate, '--band', `${B}-${B + 29}`, '--no-canary', '--no-belt', '--', process.execPath, suite], { cwd: WEB_DIR, stdio: ['ignore', 'pipe', 'pipe'], env });
    let out = ''; let closed = null; const closedP = new Promise((r) => rg.once('close', (c, s) => { closed = c ?? s; r(closed); }));
    rg.stdout.on('data', (c) => { out += c; }); rg.stderr.on('data', (c) => { out += c; });
    const waitFor = (re, ms) => Promise.race([new Promise((r) => { const look = () => { if (re.test(out)) r(true); }; rg.stdout.on('data', look); rg.stderr.on('data', look); look(); }), closedP.then(() => false), new Promise((r) => setTimeout(() => r(false), ms))]);
    const ready = await waitFor(/HOLD-READY/, 30000);
    const faulted = await waitFor(/injected wrapper exception after the spawn/, 15000);
    await new Promise((r) => setTimeout(r, 800));
    const alive = closed === null;
    const extraDir = fs.readdirSync(REG).find((n) => n.startsWith(`${pinKey}.`)); const extraFiles = extraDir ? fs.readdirSync(path.join(REG, extraDir)) : [];
    const retainedLine = new RegExp(`the child \\(pid \\d+\\) is alive — finalizing on its close \\(verdict forced RED\\); pending hold\\(s\\) for ${pinKey} retained`).test(out);
    // a VALID probe with a POSITIVE CONTROL (r8 P2-2): { layout: false } single-port claims — the neighbour first (unheld → CLAIMED), then the held pin
    const probe = spawnSync(process.execPath, ['--input-type=module', '-e', `const { claimPortBand } = await import(${JSON.stringify(path.join(WEB_DIR, 'tools', 'cdp.mjs'))}); try { const c0 = await claimPortBand(${pin + 1}, ${pin + 1}, { layout: false }); console.log('CONTROL CLAIMED ${pin + 1}'); c0.release(); } catch (e) { console.log('CONTROL REFUSED ' + e.message.split('\\n')[0]); } try { const c = await claimPortBand(${pin}, ${pin}, { layout: false }); console.log('CLAIMED'); c.release(); } catch (e) { console.log('REFUSED ' + e.message.split('\\n')[0]); }`], { encoding: 'utf8', timeout: 30000, env: { ...env, OB_CDP_PORT: undefined, OB_RUN_GATE_FAULT_LEASE: undefined, OB_RUN_GATE_FAULT_THROW: undefined } });
    let kid = null; try { kid = Number(execFileSync('pgrep', ['-P', String(rg.pid)], { encoding: 'utf8', timeout: SYNC_CHILD_TIMEOUT_MS }).split('\n').filter(Boolean)[0]); } catch { /* none */ }
    if (kid) { try { process.kill(kid, 'SIGTERM'); } catch { /* gone */ } }
    const code = await Promise.race([closedP, new Promise((r) => setTimeout(() => r('timeout'), 40000))]);
    if (code === 'timeout') { try { process.kill(rg.pid, 'SIGKILL'); } catch { /* gone */ } }
    const left = fs.readdirSync(REG);
    check(`8k (k2): lease failure injected for the extra claim ${pinKey} AND a wrapper exception thrown with the child alive — the wrapper does NOT die (it finalizes on the child's close, verdict forced red), the extra claim's pending hold is RETAINED and logged by name, a foreign claimant is REFUSED the range; when the child exits the close path releases every hold and the registry is empty; the wrapper exits non-zero (red-proof: 869f3941's generic exit listener released every hold and the exception killed the wrapper over the live child)`,
      B !== null && ready && faulted && alive && retainedLine && extraFiles.some((f) => /^pending-/.test(f)) && new RegExp(`CONTROL CLAIMED ${pin + 1}`).test(probe.stdout) && new RegExp(`REFUSED port band ${pin}-${pin} overlaps the LIVE foreign claim ${pin}-${pin}`).test(probe.stdout) && code !== 'timeout' && code !== 0 && left.length === 0,
      `ready=${ready} faulted=${faulted} wrapperAlive=${alive} retainedLine=${retainedLine} extra=${JSON.stringify(extraFiles)} foreign=${probe.stdout.trim().slice(0, 120)} close=${code} left=${JSON.stringify(left)}`);
    const kh = mutexHolds(stage, mx.port);
    check(`8k (k2): its private registry's writers (run-gate, the claim probe) arbitrated on a private mutex port — ${kh.n} traced hold(s), all on :${mx.port}, none on the host-wide :47997 (GH-1119)`,
      kh.ok, `port=${mx.port} holds=${kh.n} ports=${JSON.stringify(kh.ports)}`);
    const rg2 = fs.readFileSync(runGate, 'utf8');
    check('8k (k2): ONE release owner keyed on the child — releaseHoldsByChildState is the \'exit\' listener and the signal last resort, the spawn-error path marks spawnFailed, the fault handlers cover uncaughtException + unhandledRejection and force the verdict red, the throw seam is honoured only under a non-default registry (source pins)',
      /process\.once\('exit', \(\) => releaseHoldsByChildState\('exit'\)\);/.test(rg2) && /releaseHoldsByChildState\('signal last resort'\)/.test(rg2) && /spawnFailed = true;/.test(rg2) && /process\.on\('uncaughtException', onWrapperFault/.test(rg2) && /process\.on\('unhandledRejection', onWrapperFault/.test(rg2) && /if \(wrapperFault && exitCode === 0\) exitCode = 70;/.test(rg2) && /process\.env\.OB_PORT_BANDS_DIR && process\.env\.OB_RUN_GATE_FAULT_THROW === 'after-spawn'/.test(rg2) && !/process\.once\('exit', \(\) => releaseHolds\(\)\);/.test(rg2),
      'source pins');
    fs.rmSync(stage, { recursive: true, force: true });
  }
}

// ---- arm 8l (companion review r7): pin readers PER ROLE; ONE reserved-extents set for the wrapper's allocators --
//   (l1) an inventory tool reads, for EVERY declared role, the LAYOUT pin of that role before any derived
//        fallback (OB_E2E_PORT / OB_E2E_CDP_PORT); an explicit override (OB_CDP_PORT) keeps precedence but
//        does not stand in for it — record.mjs read OB_CDP_PORT, derived its CDP from the http port and
//        under run-gate escaped the band (51243).
//   (l2)-(l4) every allocator in run-gate (the canary / belt probe pair) draws from ONE reserved-extents set:
//        the main band + the layout pins (inventory + derivation window) + every extra claim; the canary used
//        to check the band and the two layout pins only, so a far pin's second claim was invisible to it.
{
  const cib = await import('./lib/ci-bands.mjs');
  const table = cib.loadCiBands(); const lanesT = cib.loadLaneBands(cib.LANE_BANDS_FILE, table);
  const dir = fs.mkdtempSync('/tmp/obw-hygiene-8l-');
  const put = (rel, text) => { fs.writeFileSync(path.join(dir, rel), text); return rel; };
  const kinds = (files, k) => cib.lintCiBands({ table, workflows: {}, toolDefaults: cib.scanToolDefaultFiles(files, dir), laneBands: lanesT }).problems.filter((p) => p.kind === k);
  // (l1)
  put('httponly.mjs', "export const PORT_INVENTORY = { http: 1, cdp: 1 };\nconst PORT = Number(process.env.OB_E2E_PORT ?? 30300);\nconst CDP_PORT = Number(process.env.OB_CDP_PORT ?? (PORT + 1100));\n");
  const l1 = kinds(['httponly.mjs'], 'inventory-without-pin-reader');
  check('8l (l1): a tool that reads the http pin but derives its cdp endpoint with only the OB_CDP_PORT override in front (`OB_CDP_PORT ?? (PORT + 1100)`) is red for the cdp role — the LAYOUT pin OB_E2E_CDP_PORT is never read (red-proof: 2caf3f28\'s rule took OB_CDP_PORT as a cdp reader and passed record.mjs, which under run-gate derived 51243 outside its band)',
    l1.length === 1 && /cdp endpoint \(CDP_PORT = 31400, line 3\) but never reads the LAYOUT pin OB_E2E_CDP_PORT \(an OB_CDP_PORT override keeps precedence but does not stand in for it\)/.test(l1[0].detail), JSON.stringify(l1.map((p) => p.detail.slice(0, 260))));
  put('perrole.mjs', "export const PORT_INVENTORY = { http: 1, cdp: 1 };\nconst PORT = Number(process.env.OB_E2E_PORT ?? 30300);\nconst CDP_PORT = process.env.OB_CDP_PORT !== undefined ? Number(process.env.OB_CDP_PORT) : Number(process.env.OB_E2E_CDP_PORT ?? (PORT + 1100));\n");
  check('8l (l1): the override first, the LAYOUT pin next, the derivation last (record.mjs\'s shape now) reads both roles — no row, and the unpinned fallback is still read at 31400', kinds(['perrole.mjs'], 'inventory-without-pin-reader').length === 0 && cib.scanToolDefaultFiles(['perrole.mjs'], dir).some((h) => h.syntax === 'derived-offset' && h.value === 31400));
  fs.rmSync(dir, { recursive: true, force: true });
  const swept = (await treeLintOnce()).problems.filter((p) => p.kind === 'inventory-without-pin-reader');
  check('8l (l1): on this tree every inventory tool reads the layout pin of every role it defaults (0 rows under the per-role rule; the sweep found record.mjs alone and it is fixed)', swept.length === 0, JSON.stringify(swept.map((p) => p.detail.slice(0, 160))));
  // (l2) the pure rule, with the PRE-FIX rule as the negative control
  const band = { start: 9430, end: 9459 }; const far = 46504;
  const ext = cib.reservedExtentsFor({ band, inventory: { http: 2, cdp: 1 }, layoutPins: { http: 9430, cdp: 9445 }, extraClaims: [{ start: far, end: far }] });
  const preFixAllows = (base) => !((band.start <= base + 1 && base <= band.end) || [9430, 9445].some((pin) => base <= pin + 40 && pin <= base + 1)); // 2caf3f28's canary check: the band and the two layout pins, +40
  check(`8l (l2): the reserved-extents set = the band, each layout pin + its inventory + the 40-port derivation window, and every extra claim (${ext.map((e) => `${e.start}-${e.end}`).join(', ')}); a canary candidate equal to a far pin's second claim (${far}) is REFUSED by the set and ALLOWED by the pre-fix rule (negative control); a clear candidate is allowed; the band and a pin window are refused`,
    ext.length === 4 && !cib.allocatorCandidateAllowed(far, far + 1, ext) && preFixAllows(far) && cib.allocatorCandidateAllowed(46600, 46601, ext) && !cib.allocatorCandidateAllowed(9440, 9441, ext) && !cib.allocatorCandidateAllowed(9470, 9471, ext),
    JSON.stringify({ ext: ext.map((e) => `${e.start}-${e.end} ${e.why}`), far: cib.allocatorCandidateAllowed(far, far + 1, ext), preFix: preFixAllows(far) }));
  // (c, companion review r8 P2-3) a storm SKIP needs storm evidence AND a live canary: the child leg's verdict is ONE
  // pure rule — the marker seen = pass; the wrapper closed before the marker = FAIL with the exit code (a premature
  // nonzero exit is never a skip); no marker, the child still running and the storm predicate true at that moment
  // (the load sample is recorded on the line) = skip by name; no marker on a calm box = FAIL.
  const stormOrFail = ({ marker, closed, stormy }) => (marker ? 'pass' : closed ? 'fail' : stormy ? 'skip' : 'fail');
  check('8l (c): the storm-skip classifier — marker → pass; closed before the marker → FAIL whatever the storm says; alive + stormy → skip; alive + calm → FAIL (a pure rule, one for the live leg and the synthetic leg)',
    stormOrFail({ marker: true, closed: false, stormy: true }) === 'pass' && stormOrFail({ marker: false, closed: true, stormy: true }) === 'fail' && stormOrFail({ marker: false, closed: true, stormy: false }) === 'fail'
      && stormOrFail({ marker: false, closed: false, stormy: true }) === 'skip' && stormOrFail({ marker: false, closed: false, stormy: false }) === 'fail');
  // (l3) live: canaries ON, a far OB_CDP_PORT equal to the first probe candidate (seam) — the canary must not bind it
  {
    const stage = fs.mkdtempSync('/tmp/obw-hygiene-8l-live-'); const REG = path.join(stage, 'reg'); fs.mkdirSync(REG);
    const suite = path.join(stage, 'child.mjs');
    fs.writeFileSync(suite, `import { spawnStaticServer, stopStaticServer, launchChrome, sleep } from ${JSON.stringify(path.join(WEB_DIR, 'tools', 'cdp.mjs'))};\nexport const PORT_INVENTORY = { http: 1, cdp: 1 };\nconst PORT = Number(process.env.OB_E2E_PORT); const CDP = Number(process.env.OB_E2E_CDP_PORT);\nconst server = spawnStaticServer(${JSON.stringify(WEB_DIR)}, PORT); await sleep(700);\nconst c = await launchChrome('http://127.0.0.1:' + PORT + '/app.html?seed=1', { port: CDP, tool: false });\nconsole.log('CHILD-CDP ' + CDP + ' HTTP ' + PORT);\nawait c.close(); await stopStaticServer(server);\n`);
    let B = null; for (let a = 0; a < 6 && B === null; a++) { const cand = 56000 + (((process.pid % 200) + a * 67 + 19) % 200) * 30; if (await windowFree(cand, cand + 29) && await windowFree(cand + 2000, cand + 2001)) B = cand; }
    const pin = B + 2000; // FAR: a second claim of its own, and the FIRST canary candidate through the seam
    // the storm rule as before: a real canary (server + Chrome + GI boot) and a child browser under an
    // UNRESTED / UNQUIET / UNDERIVED pre-run baseline would only measure the storm — deferred BY NAME,
    // never banked (the pure verdicts in (l2) and the source pins in (l4) stand regardless)
    const stormSkip = baselineSkip(pacingKnobs(process.env), '8l (l3) live canary leg');
    if (stormSkip) { console.log(stormSkip.line.startsWith('[hygiene]') ? stormSkip.line : `[hygiene] SKIP 8l (l3) live canary leg — SKIPPED-STORM: ${stormSkip.line}`); fs.rmSync(stage, { recursive: true, force: true }); }
    else {
    const { spawn } = await import('node:child_process');
    const runGate = path.join(WEB_DIR, 'tools', 'run-gate.mjs');
    const env = { ...process.env, OB_PORT_BANDS: '', OB_PORT_BANDS_DIR: REG, OB_GATE_LEDGER_DIR: stage, OB_CDP_PORT: String(pin), OB_RUN_GATE_PROBE_BASE: String(pin) };
    for (const k of ['GITHUB_ACTIONS', 'OB_CI_BANDS', 'CI', 'OB_E2E_PORT', 'OB_E2E_CDP_PORT', 'OB_PACING_BASELINE']) delete env[k];
    const rg = spawn(process.execPath, [runGate, '--band', `${B}-${B + 29}`, '--no-belt', '--', process.execPath, suite], { cwd: WEB_DIR, detached: true, stdio: ['ignore', 'pipe', 'pipe'], env });
    let out = ''; let closed = null; const closedP = new Promise((r) => rg.once('close', (c, s) => { closed = c ?? s; r(closed); }));
    rg.stdout.on('data', (c) => { out += c; }); rg.stderr.on('data', (c) => { out += c; });
    const waitFor = (re, ms) => Promise.race([new Promise((r) => { const look = () => { if (re.test(out)) r(true); }; rg.stdout.on('data', look); rg.stderr.on('data', look); look(); }), closedP.then(() => false), new Promise((r) => setTimeout(() => r(false), ms))]);
    const claimed = await waitFor(/canary probe range \d+-\d+ claimed/, 30000);
    const skipped = new RegExp(`canary candidate ${pin}-${pin + 1} falls inside a reserved extent \\(the extra claim ${pin}-${pin}\\) — skipped`).test(out);
    const m = /canary probe range (\d+)-(\d+) claimed — outside every reserved extent \((\d+): ([^)]*)\)/.exec(out);
    const probeLo = m ? Number(m[1]) : NaN, probeHi = m ? Number(m[2]) : NaN;
    const extents = m ? m[4].split(', ').map((s) => s.split('-').map(Number)) : [];
    const disjoint = m && extents.every(([lo, hi]) => probeHi < lo || probeLo > hi) && probeLo !== pin;
    const pinFree = !(await tcpBusy(pin));
    check(`8l (l3): canaries ON with a FAR OB_CDP_PORT=${pin} (a second claim) equal to the first probe candidate — the canary skips it by name (the extra claim ${pin}-${pin}), claims a range outside EVERY reserved extent (band ${B}-${B + 29}, the layout pins' windows, the extra claim), and the pin's port is never bound by the wrapper (red-proof: 2caf3f28's check saw the band and the two layout pins only — the far pin's claim was invisible, and layout:false let the registry accept the wrapper's own overlapping probe claim)`,
      B !== null && claimed && skipped && disjoint && pinFree, `claimed=${claimed} skipped=${skipped} probe=${probeLo}-${probeHi} extents=${JSON.stringify(extents)} pinFree=${pinFree} ${out.split('\n').filter((l) => /canary/.test(l)).slice(0, 3).join(' | ').slice(0, 300)}`);
    // the child's browser launches inside the claim once the canary is calm — a storm defers this by name, never fails it
    const child = await waitFor(/CHILD-CDP \d+ HTTP \d+/, 20000);
    const cm = /CHILD-CDP (\d+) HTTP (\d+)/.exec(out);
    const loadNorm = loadNormNow(); // the storm sample AT THIS MOMENT, recorded on the line
    const verdict = stormOrFail({ marker: !!child, closed: closed !== null, stormy: loadNorm >= 1.0 });
    if (verdict === 'pass') {
      check(`8l (l3): the child's browser launched on the layout cdp pin and its server on the layout http pin, both inside the claim ${B}-${B + 29} (never on the far pin)`,
        cm && Number(cm[2]) === B && Number(cm[1]) >= B && Number(cm[1]) <= B + 29 && Number(cm[1]) !== pin, out.split('\n').filter((l) => /CHILD-CDP/.test(l)).join(' | ').slice(0, 200));
    } else if (verdict === 'fail') {
      check(`8l (l3): the wrapped run closed before the child's CHILD-CDP marker — exit ${closed} (a premature exit is a FAIL with its code, never a storm skip; loadavg/cores now ${loadNorm.toFixed(2)})`, false,
        out.split('\n').filter((l) => /run-gate|Error|FATAL|refus/.test(l)).slice(-4).join(' | ').slice(0, 400));
    } else {
      console.log(`[hygiene] SKIP 8l (l3) child-launch leg — SKIPPED-STORM: the canary is still polling for calm after 20 s with the child alive and the box stormy NOW (loadavg/cores ${loadNorm.toFixed(2)} >= 1.0; ${out.split('\n').filter((l) => /NOT calm|calm:/.test(l)).slice(-1).join('').slice(0, 140)}); the allocator verdicts above stand, the launch is deferred, never banked`);
    }
    try { process.kill(-rg.pid, 'SIGTERM'); } catch { /* gone */ }
    const code = await Promise.race([closedP, new Promise((r) => setTimeout(() => r('timeout'), 40000))]);
    if (code === 'timeout') { try { process.kill(-rg.pid, 'SIGKILL'); } catch { /* gone */ } }
    fs.rmSync(stage, { recursive: true, force: true });
    }
  }
  // (c) synthetic: the child exits 1 BEFORE its marker under a storm predicate forced true → the classifier says FAIL with the code (never a skip)
  {
    const stage = fs.mkdtempSync('/tmp/obw-hygiene-8l-synth-'); const REG = path.join(stage, 'reg'); fs.mkdirSync(REG);
    const suite = path.join(stage, 'early-exit.mjs'); fs.writeFileSync(suite, "export const PORT_INVENTORY = { http: 1, cdp: 1 };\nif (process.env.OB_8L_CHILD_EXIT) process.exit(Number(process.env.OB_8L_CHILD_EXIT));\nconsole.log('CHILD-CDP ' + process.env.OB_E2E_CDP_PORT + ' HTTP ' + process.env.OB_E2E_PORT);\n");
    let B2 = null; for (let a = 0; a < 6 && B2 === null; a++) { const cand = 56000 + (((process.pid % 200) + a * 73 + 29) % 200) * 30; if (await windowFree(cand, cand + 29)) B2 = cand; }
    const env = { ...process.env, OB_PORT_BANDS: '', OB_PORT_BANDS_DIR: REG, OB_GATE_LEDGER_DIR: stage, OB_8L_CHILD_EXIT: '1' };
    for (const k of ['GITHUB_ACTIONS', 'OB_CI_BANDS', 'CI', 'OB_E2E_PORT', 'OB_E2E_CDP_PORT', 'OB_CDP_PORT', 'OB_PACING_BASELINE']) delete env[k];
    const r = spawnSync(process.execPath, [path.join(WEB_DIR, 'tools', 'run-gate.mjs'), '--band', `${B2}-${B2 + 29}`, '--no-canary', '--no-belt', '--', process.execPath, suite], { encoding: 'utf8', env, cwd: WEB_DIR, timeout: 60000 });
    const marker = /CHILD-CDP \d+ HTTP \d+/.test(r.stdout + r.stderr);
    const verdict = stormOrFail({ marker, closed: true, stormy: true }); // the storm predicate FORCED true: still FAIL
    check(`8l (c): a wrapped fixture that exits 1 BEFORE its CHILD-CDP marker under a storm predicate forced true is classified FAIL with the exit code (run-gate exit ${r.status}), never SKIPPED-STORM (red-proof: ba91c4e3's branch skipped on any missing marker, exit code unread)`,
      B2 !== null && !marker && r.status === 1 && verdict === 'fail', `status ${r.status} marker=${marker} verdict=${verdict}`);
    fs.rmSync(stage, { recursive: true, force: true });
  }
  // (l4) source pins: ONE set, ONE gate, the seam guarded
  const rg2 = fs.readFileSync(path.join(WEB_DIR, 'tools', 'run-gate.mjs'), 'utf8');
  check('8l (l4): run-gate builds ONE reserved-extents set (ciBands.reservedExtentsFor with the band, the inventory, both layout pins and every extra claim) and every canary candidate passes ciBands.allocatorCandidateAllowed against it; the probe-base seam is honoured only under a non-default registry; the pre-fix band+pins check is gone (source pins)',
    (rg2.match(/ciBands\.reservedExtentsFor\(\{/g) ?? []).length === 1 && /extraClaims: extraClaims\.map\(\(x\) => \(\{ start: x\.start, end: x\.end \}\)\)/.test(rg2) && /const effectiveLayoutPins = \{ http: env\.OB_E2E_PORT, cdp: env\.OB_E2E_CDP_PORT \};/.test(rg2) && /layoutPins: effectiveLayoutPins,/.test(rg2)
      && (rg2.match(/ciBands\.allocatorCandidateAllowed\(/g) ?? []).length === 1 && /process\.env\.OB_PORT_BANDS_DIR && \/\^\\d\{4,5\}\$\/\.test\(process\.env\.OB_RUN_GATE_PROBE_BASE/.test(rg2) && !/pins\.some\(\(pin\) => base <= pin \+ 40 && pin <= base \+ 1\)/.test(rg2),
    'source pins');
}

// ---- arm 8m (companion review r8): an override REPLACES the derived endpoint of its role --------------
//   Per tool and per role the effective endpoint is ONE of { explicit override, layout pin, derived default },
//   in that precedence; only the effective one is reserved / hull-widened / collision-checked. The tool declares
//   the override on one bare line (`export const PORT_OVERRIDES = { cdp: 'OB_CDP_PORT' };`) and the lint holds
//   the declaration to the reader order. Before r8 run-gate reserved record.mjs's derived cdp(0) although
//   OB_CDP_PORT replaced it, so a valid one-browser configuration exited 75 ("derived cdp … collides").
{
  const cib = await import('./lib/ci-bands.mjs');
  const table = cib.loadCiBands(); const lanesT = cib.loadLaneBands(cib.LANE_BANDS_FILE, table);
  const { spawn } = await import('node:child_process');
  const runGate = path.join(WEB_DIR, 'tools', 'run-gate.mjs');
  // the declaration ⇔ the reader order (lint)
  const dir = fs.mkdtempSync('/tmp/obw-hygiene-8m-');
  const put = (rel, text) => { fs.writeFileSync(path.join(dir, rel), text); return rel; };
  const kinds = (files, k) => cib.lintCiBands({ table, workflows: {}, toolDefaults: cib.scanToolDefaultFiles(files, dir), laneBands: lanesT }).problems.filter((p) => p.kind === k);
  const SHAPE = "export const PORT_INVENTORY = { http: 1, cdp: 1 };\nconst PORT = Number(process.env.OB_E2E_PORT ?? 30300);\nconst CDP_PORT = process.env.OB_CDP_PORT !== undefined ? Number(process.env.OB_CDP_PORT) : Number(process.env.OB_E2E_CDP_PORT ?? (PORT + 1243));\n";
  put('undeclared.mjs', SHAPE); put('declared.mjs', "export const PORT_OVERRIDES = { cdp: 'OB_CDP_PORT' };\n" + SHAPE);
  put('drift.mjs', "export const PORT_OVERRIDES = { cdp: 'OB_CDP_PORT' };\nexport const PORT_INVENTORY = { http: 1, cdp: 1 };\nconst CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? process.env.OB_CDP_PORT ?? 30315);\n");
  put('wrongrole.mjs', "export const PORT_OVERRIDES = { http: 'OB_CDP_PORT' };\nexport const PORT_INVENTORY = { http: 1, cdp: 1 };\n");
  check('8m: a role binding that reads an exact-width override FIRST (`OB_CDP_PORT !== undefined ? … : …`) without a PORT_OVERRIDES declaration is red (override-undeclared); the same with the declaration is clean',
    kinds(['undeclared.mjs'], 'override-undeclared').length === 1 && /CDP_PORT reads process\.env\.OB_CDP_PORT FIRST/.test(kinds(['undeclared.mjs'], 'override-undeclared')[0].detail) && kinds(['declared.mjs'], 'override-undeclared').length === 0 && kinds(['declared.mjs'], 'override-declaration-drift').length === 0,
    JSON.stringify(kinds(['undeclared.mjs'], 'override-undeclared').map((p) => p.detail.slice(0, 200))));
  check('8m: a declaration the source does not honour is red — the override read AFTER the layout pin (drift), and a declaration binding a cdp name to the http role (drift by role)',
    kinds(['drift.mjs'], 'override-declaration-drift').length >= 1 && /no cdp binding in the file reads process\.env\.OB_CDP_PORT FIRST/.test(kinds(['drift.mjs'], 'override-declaration-drift')[0].detail) && kinds(['wrongrole.mjs'], 'override-declaration-drift').some((p) => /a cdp name\) to the http role/.test(p.detail)),
    JSON.stringify([kinds(['drift.mjs'], 'override-declaration-drift'), kinds(['wrongrole.mjs'], 'override-declaration-drift')].map((l) => l.map((p) => p.detail.slice(0, 160)))));
  fs.rmSync(dir, { recursive: true, force: true });
  const sweep = (await treeLintOnce()).problems.filter((p) => /^override-/.test(p.kind));
  check('8m: on this tree every override-honouring tool declares its PORT_OVERRIDES and reads it first (record.mjs, scenario-render, hero-extend-render, bench-export, probe-audio, probe-encoders, the two feature 030 (internal spec) mockups) — 0 override rows', sweep.length === 0, JSON.stringify(sweep.map((p) => p.detail.slice(0, 160))));
  // run-gate honours it BOTH ways (a probe under a private registry, a record-shaped suite that prints its effective endpoints and exits 0)
  {
    const stage = fs.mkdtempSync('/tmp/obw-hygiene-8m-gate-'); const REG = path.join(stage, 'reg'); fs.mkdirSync(REG);
    const suite = path.join(stage, 'recordish.mjs');
    fs.writeFileSync(suite, "export const PORT_OVERRIDES = { cdp: 'OB_CDP_PORT' };\nexport const PORT_INVENTORY = { http: 1, cdp: 1 };\nexport const PORT_FLAGS = { '--port': 'http' };\nconst argOf = (f) => { const i = process.argv.indexOf(f); return i > 0 ? process.argv[i + 1] : null; };\nconst PORT = Number(argOf('--port') ?? process.env.OB_E2E_PORT ?? 30300);\nconst CDP_PORT = process.env.OB_CDP_PORT !== undefined ? Number(process.env.OB_CDP_PORT) : Number(process.env.OB_E2E_CDP_PORT ?? (PORT + 1243));\nconsole.log('EFFECTIVE http=' + PORT + ' cdp=' + CDP_PORT);\n");
    let B = null; for (let a = 0; a < 6 && B === null; a++) { const cand = 56000 + (((process.pid % 200) + a * 71 + 23) % 200) * 30; if (await windowFree(cand, cand + 29) && await windowFree(cand + 2000, cand + 2001)) B = cand; }
    const mx = await privateMutex(stage, [[B, B + 29], [B + 2000, B + 2000]]); // the band and the out-of-band override
    const gate = (extraEnv, args = []) => { const env = { ...process.env, OB_PORT_BANDS: '', OB_PORT_BANDS_DIR: REG, OB_GATE_LEDGER_DIR: stage, ...mx.env, ...extraEnv }; for (const k of ['GITHUB_ACTIONS', 'OB_CI_BANDS', 'CI', 'OB_E2E_PORT', 'OB_E2E_CDP_PORT', 'OB_PACING_BASELINE']) if (!(k in extraEnv)) delete env[k]; return spawnSync(process.execPath, [runGate, '--band', `${B}-${B + 29}`, '--no-canary', '--no-belt', '--', process.execPath, suite, ...args], { encoding: 'utf8', env, cwd: WEB_DIR, timeout: 60000 }); };
    const inside = gate({ OB_CDP_PORT: String(B + 15) }, ['--port', String(B)]); // the override lands exactly on the layout's derived cdp(0) — the review case
    const said = inside.stdout + inside.stderr;
    check(`8m: \`--port ${B}\` under --band ${B}-${B + 29} with OB_CDP_PORT=${B + 15} INSIDE the band (exactly the layout's derived cdp(0)) RUNS — exit 0, the override is logged as the cdp role's effective endpoint, no "collides", no SECOND claim, and the child binds cdp=${B + 15} (red-proof: ba91c4e3 refused it, exit 75: "derived cdp ${B + 15}-${B + 15} collides with the explicit OB_CDP_PORT pin's derivations")`,
      B !== null && inside.status === 0 && new RegExp(`cdp role: the declared override OB_CDP_PORT=${B + 15} REPLACES the layout endpoint`).test(said) && !/collides/.test(said) && !/SECOND claim/.test(said) && new RegExp(`EFFECTIVE http=${B} cdp=${B + 15}`).test(said),
      `status ${inside.status} ${said.split('\n').filter((l) => /run-gate|EFFECTIVE|collid/.test(l)).slice(0, 4).join(' | ').slice(0, 400)}`);
    const outside = gate({ OB_CDP_PORT: String(B + 2000) }, ['--port', String(B)]);
    const said2 = outside.stdout + outside.stderr;
    check(`8m: the same with OB_CDP_PORT=${B + 2000} OUTSIDE the band is REFUSED BY NAME before anything runs (exit 2: a replacement endpoint must sit inside the claim) — never a second claim for a replacement`,
      outside.status === 2 && new RegExp(`the cdp role's effective endpoint is the declared override OB_CDP_PORT=${B + 2000} \\(PORT_OVERRIDES\\), which lies outside the assigned band ${B}-${B + 29}`).test(said2) && !/EFFECTIVE/.test(said2) && !/SECOND claim/.test(said2),
      `status ${outside.status} ${said2.split('\n').filter((l) => /run-gate/.test(l)).slice(0, 2).join(' | ').slice(0, 300)}`);
    // the real record.mjs: --help exits 0 before binding, so the pin checks are the whole story
    const real = (() => { const env = { ...process.env, OB_PORT_BANDS: '', OB_PORT_BANDS_DIR: REG, OB_GATE_LEDGER_DIR: stage, OB_CDP_PORT: String(B + 15), ...mx.env }; for (const k of ['GITHUB_ACTIONS', 'OB_CI_BANDS', 'CI', 'OB_E2E_PORT', 'OB_E2E_CDP_PORT', 'OB_PACING_BASELINE']) delete env[k]; return spawnSync(process.execPath, [runGate, '--band', `${B}-${B + 29}`, '--no-canary', '--no-belt', '--', process.execPath, path.join(WEB_DIR, 'tools', 'record.mjs'), '--port', String(B), '--help'], { encoding: 'utf8', env, cwd: WEB_DIR, timeout: 60000 }); })();
    check(`8m: the real web/tools/record.mjs (--port ${B} --help) under --band with OB_CDP_PORT=${B + 15} inside the band passes run-gate's pin checks and exits 0 (its PORT_OVERRIDES is honoured on the real declaration)`,
      real.status === 0 && /cdp role: the declared override OB_CDP_PORT=/.test(real.stdout + real.stderr) && !/collides/.test(real.stdout + real.stderr), `status ${real.status} ${(real.stdout + real.stderr).split('\n').filter((l) => /run-gate/.test(l)).slice(0, 3).join(' | ').slice(0, 300)}`);
    const mh = mutexHolds(stage, mx.port);
    check(`8m: its private registry's writers (the run-gate runs that claim) arbitrated on a private mutex port — ${mh.n} traced hold(s), all on :${mx.port}, none on the host-wide :47997 (GH-1119)`,
      mh.ok, `port=${mx.port} holds=${mh.n} ports=${JSON.stringify(mh.ports)}`);
    fs.rmSync(stage, { recursive: true, force: true });
  }
  const rg2 = fs.readFileSync(runGate, 'utf8');
  check('8m: run-gate reads PORT_OVERRIDES through ciBands.portOverridesOf (fail-closed on a bad declaration), marks the active override as the role\'s layout-replacing lead, drops the replaced layout pin / flag of that role, refuses an out-of-band override by name, and feeds the effective endpoints to the canary\'s reserved set (source pins)',
    /portOverrides = ciBands\.portOverridesOf\(suiteText\);/.test(rg2) && /envPins\.push\(\{ \.\.\.pin, layout: true, override: true \}\);/.test(rg2) && /cliPins = cliPins\.filter\(\(p\) => p\.role !== role\);/.test(rg2) && /a replacement endpoint must sit inside the claim/.test(rg2) && /effectiveLayoutPins\[o\.role\] = o\.value;/.test(rg2), 'source pins');
}

const __failedBefore8n = failed; // arm 8o row (5) reads the FIX9 arms' verdict
// ---- arm 8n (companion review r9): a DERIVED endpoint is validated or refused; a parent passes BOTH pins to a nested browser tool --
//   (n1) ONE helper (cdp.mjs assertDerivedEndpoint): an integer in 1024-65535, ≠ the port it derives from, inside the tool's
//        declared window when derived — else the tool REFUSES BY NAME with the arithmetic printed (exit 2), never launching,
//        never clamping. The two named instances (e2e-rollslip --port 50000 → 70000; venom-render --port 3000 → −2079),
//        record.mjs --port 65000 → 66243 and a pinned cdp equal to its http port are refused as real children; a valid
//        override runs unchanged; the SINKS (launchChrome / spawnStaticServer) refuse independently of the caller. The lint
//        holds every modelled derivation (derived offsets, dynamic windows, base-pin spans) to the helper
//        (derived-endpoint-unchecked) and judges static values by the range and the cross-role alias rule
//        (derived-endpoint-out-of-range); the tree: 0 rows, every file of the sweep list calls the helper.
//   (n2) parent → child spawns are ONE static edge table (NESTED_SPAWN_EDGES) the reader holds to the code: the PRE-FIX
//        cuepost-live-sheet loop (--port only) is red by name, the fixed shape clean; undeclared / drift / inventory /
//        child-claims rows; the tree: 0 rows, every table parent in the scan root set; live: a --port-only record.mjs child
//        derives 28543 INSIDE scenario-render's declared family (the collision), the fixed child logs the parent's pins.
{
  const cib = await import('./lib/ci-bands.mjs');
  const cdpm = await import('./cdp.mjs');
  const table = cib.loadCiBands(); const lanesT = cib.loadLaneBands(cib.LANE_BANDS_FILE, table);
  const repoRoot = path.resolve(WEB_DIR, '..');
  const cleanEnv = (extra = {}) => { const env = { ...process.env, ...extra }; for (const k of Object.keys(env)) if (/^OB_\w*(PORT|CDP|BAND_START|BAND_END|PORT_BASE)\w*$/.test(k) && !/_(MS|TRIES|FAILS|SCALE|DIR)$/.test(k) && !(k in extra)) delete env[k]; return env; };
  const runTool = (rel, args, extra = {}) => spawnSync(process.execPath, [path.join(WEB_DIR, 'tools', rel), ...args], { encoding: 'utf8', env: cleanEnv(extra), cwd: WEB_DIR, timeout: 90000 });
  // (n1) the helper
  const P = cdpm.derivedEndpointProblem;
  check('8n (n1): derivedEndpointProblem — 70000 / -2079 / 1023 lie outside the range; a value equal to its base is refused; a DERIVED value outside the declared window is refused while the same value PINNED passes; 40630 from 20630 is clean',
    /outside the valid port range/.test(P(70000) ?? '') && /outside/.test(P(-2079) ?? '') && /outside/.test(P(1023) ?? '') && /equals the port it derives from/.test(P(8000, { base: 8000 }) ?? '') && /outside the tool's declared window 28000-29105/.test(P(9000, { window: { start: 28000, end: 29105 } }) ?? '') && P(9000, { window: { start: 28000, end: 29105 }, derived: false }) === null && P(40630, { base: 20630 }) === null,
    JSON.stringify([P(70000), P(-2079), P(1023), P(8000, { base: 8000 }), P(9000, { window: { start: 28000, end: 29105 } })]));
  let thrown = null; try { cdpm.assertDerivedEndpoint(70000, { tool: 'fixture', role: 'cdp', base: 50000, expr: 'PORT + 20000', onFail: 'throw' }); } catch (e) { thrown = e.message; }
  check('8n (n1): assertDerivedEndpoint refuses BY NAME with the arithmetic printed ([derived-endpoint]) and returns the value when clean',
    /^fixture: refusing to launch — the derived cdp endpoint 70000 = PORT \+ 20000 \(base 50000\) lies outside the valid port range 1024-65535; pass OB_E2E_CDP_PORT/.test(thrown ?? '') && /\[derived-endpoint\]$/.test(thrown ?? '') && cdpm.assertDerivedEndpoint(40630, { base: 20630 }) === 40630, String(thrown).slice(0, 220));
  // the named instances, as real children with every inherited pin stripped
  const roll = runTool('e2e-rollslip.mjs', ['--port', '50000']);
  check('8n (n1): `node web/tools/e2e-rollslip.mjs --port 50000` (no OB_E2E_CDP_PORT) is REFUSED by name — exit 2, "derived cdp endpoint 70000 = PORT + 20000 (base 50000) lies outside the valid port range", port 50000 not left listening (pre-fix: Chrome was launched on 70000)',
    roll.status === 2 && /^e2e-rollslip: refusing to launch — the derived cdp endpoint 70000 = PORT \+ 20000 \(base 50000\) lies outside the valid port range 1024-65535/m.test(roll.stderr) && !(await tcpBusy(50000)), `status ${roll.status} ${(roll.stderr + roll.stdout).slice(0, 300)}`);
  const venomOut = fs.mkdtempSync('/tmp/obw-hygiene-8n-venom-');
  const venom = runTool('venom-render.mjs', ['--port', '3000', '--outdir', venomOut]);
  fs.rmSync(venomOut, { recursive: true, force: true });
  check('8n (n1): `node web/tools/venom-render.mjs --port 3000` is REFUSED by name — exit 2, "derived cdp endpoint -2079 = PORT - 21630 + 16551 (base 3000) lies outside the valid port range" (pre-fix: a negative CDP port reached launchChrome)',
    venom.status === 2 && /^venom-render: refusing to launch — the derived cdp endpoint -2079 = PORT - 21630 \+ 16551 \(base 3000\) lies outside the valid port range 1024-65535/m.test(venom.stderr), `status ${venom.status} ${(venom.stderr + venom.stdout).slice(0, 300)}`);
  const rec = runTool('record.mjs', ['--port', '65000', '--print-endpoints']);
  check('8n (n1): `record.mjs --port 65000 --print-endpoints` with no cdp pin is REFUSED by name (66243 = HTTP_PORT + 1243), exit 2, before any server is spawned',
    rec.status === 2 && /^record: refusing to launch — the derived cdp endpoint 66243 = HTTP_PORT \+ 1243 \(base 65000\) lies outside/m.test(rec.stderr), `status ${rec.status} ${(rec.stderr + rec.stdout).slice(0, 300)}`);
  const eq = runTool('record.mjs', ['--port', '30000', '--print-endpoints'], { OB_CDP_PORT: '30000' });
  check('8n (n1): a cdp pin EQUAL to the http port (record.mjs --port 30000 with OB_CDP_PORT=30000) is refused — "equals the port it derives from" — pinned or derived, two endpoints never share a port',
    eq.status === 2 && /pinned cdp endpoint 30000 \(base 30000\) equals the port it derives from \(30000\)/.test(eq.stderr), `status ${eq.status} ${(eq.stderr + eq.stdout).slice(0, 300)}`);
  const ok = runTool('record.mjs', ['--port', '27300', '--print-endpoints'], { OB_CDP_PORT: '9721' });
  check('8n (n1): a VALID override runs unchanged — record.mjs --port 27300 with OB_CDP_PORT=9721 logs "endpoints: http 27300 (--port) cdp 9721 (OB_CDP_PORT)" and exits 0 (positive control of the refusal arms)',
    ok.status === 0 && /^\[record\] endpoints: http 27300 \(--port\) cdp 9721 \(OB_CDP_PORT\)$/m.test(ok.stdout), `status ${ok.status} ${(ok.stdout + ok.stderr).slice(0, 300)}`);
  // the sinks refuse independently of the caller (in-process; no Chrome, no server is spawned on the way to the refusal)
  let sinkChrome = null; try { await cdpm.launchChrome('http://127.0.0.1:8000/app.html', { port: 70000, preflight: false }); } catch (e) { sinkChrome = e.message; }
  let sinkEq = null; try { await cdpm.launchChrome('http://127.0.0.1:8000/app.html', { port: 8000, preflight: false }); } catch (e) { sinkEq = e.message; }
  let sinkServer = null; try { cdpm.spawnStaticServer(WEB_DIR, 70000); } catch (e) { sinkServer = e.message; }
  check('8n (n1): the SINKS refuse whatever arithmetic produced the value — launchChrome({ port: 70000 }) and launchChrome({ port: 8000 }) on a :8000 boot URL reject with [derived-endpoint], spawnStaticServer(dir, 70000) throws before spawning',
    /^launchChrome: refusing to launch Chrome — CDP port 70000 lies outside the valid port range/.test(sinkChrome ?? '') && /CDP port 8000 equals the port it derives from \(8000\)/.test(sinkEq ?? '') && /^spawnStaticServer: refusing to bind — http port 70000 lies outside/.test(sinkServer ?? ''),
    JSON.stringify([sinkChrome, sinkEq, sinkServer].map((x) => String(x).slice(0, 120))));
  // the lint, through the real entry point on a scratch tree
  const dir = fs.mkdtempSync('/tmp/obw-hygiene-8n-');
  const put = (rel, text) => { fs.writeFileSync(path.join(dir, rel), text); return rel; };
  const lintOf = (files, opts) => cib.lintCiBands({ table, workflows: {}, toolDefaults: cib.scanToolDefaultFiles(files, dir, opts), laneBands: lanesT }).problems;
  const kinds = (files, k, opts) => lintOf(files, opts).filter((p) => p.kind === k);
  put('unchecked.mjs', "export const PORT_INVENTORY = { http: 1, cdp: 1 };\nconst PORT = Number(process.env.OB_E2E_PORT ?? 30300);\nconst CDP_PORT = process.env.OB_E2E_CDP_PORT ? Number(process.env.OB_E2E_CDP_PORT) : PORT + 20000;\n");
  put('checked.mjs', "export const PORT_INVENTORY = { http: 1, cdp: 1 };\nconst PORT = Number(process.env.OB_E2E_PORT ?? 30300);\nconst CDP_PORT = process.env.OB_E2E_CDP_PORT ? Number(process.env.OB_E2E_CDP_PORT) : PORT + 20000;\nassertDerivedEndpoint(CDP_PORT, { tool: 'checked', role: 'cdp', base: PORT, expr: 'PORT + 20000' });\n");
  put('static.mjs', "export const PORT_INVENTORY = { http: 1, cdp: 1 };\nconst PORT = Number(process.env.OB_E2E_PORT ?? 30300);\nconst CDP_PORT = PORT + 40000;\nassertDerivedEndpoint(CDP_PORT, {});\n");
  put('alias.mjs', "export const PORT_INVENTORY = { http: 1, cdp: 1 };\nconst PORT = Number(process.env.OB_E2E_PORT ?? 30300);\nconst CDP_PORT = process.env.OB_E2E_CDP_PORT ?? PORT;\nassertDerivedEndpoint(CDP_PORT, {});\n");
  put('fam.mjs', "export const PORT_WINDOW_FAMILY = { start: 31200, end: 31635 };\nexport const PORT_INVENTORY = { http: 1, cdp: 1 };\nasync function reservePort(base, tries = 40) { return base; }\nconst { port } = await reservePort(31200 + (process.pid % 199) * 2);\n");
  put('famok.mjs', "export const PORT_WINDOW_FAMILY = { start: 31200, end: 31635 };\nexport const PORT_INVENTORY = { http: 1, cdp: 1 };\nasync function reservePort(base, tries = 40, spec = null) { for (let p = base; p < base + tries; p++) { if (spec) assertDerivedEndpoint(p, spec); } return base; }\nconst { port } = await reservePort(31200 + (process.pid % 199) * 2, 40, { window: PORT_WINDOW_FAMILY });\n");
  const un = kinds(['unchecked.mjs'], 'derived-endpoint-unchecked'); const chk = kinds(['checked.mjs'], 'derived-endpoint-unchecked');
  check('8n (n1): the lint holds a derivation to the helper — `CDP_PORT = … : PORT + 20000` with no assertDerivedEndpoint(CDP_PORT, …) is red (derived-endpoint-unchecked, naming the binding); the same statement followed by the call is clean',
    un.length === 1 && /unchecked\.mjs:3 CDP_PORT is derived \(unpinned fallback: PORT \(30300\) \+ 20000\) but never passes through assertDerivedEndpoint\(CDP_PORT/.test(un[0].detail) && chk.length === 0, JSON.stringify([un, chk].map((l) => l.map((p) => p.detail.slice(0, 160)))));
  const st = kinds(['static.mjs'], 'derived-endpoint-out-of-range'); const al = kinds(['alias.mjs'], 'derived-endpoint-out-of-range');
  check('8n (n1): a STATIC derivation that leaves the range (`PORT + 40000` from 30300 = 70300) is red (derived-endpoint-out-of-range, the arithmetic shown); a cross-role alias (`CDP_PORT = … ?? PORT`, cdp = http) is red the same way',
    st.length === 1 && /static\.mjs:3 CDP_PORT = PORT \(30300\) \+ 40000 = 70300 — outside the valid port range/.test(st[0].detail) && al.length === 1 && /alias\.mjs:3 CDP_PORT = PORT — a cdp endpoint equal to its http base binds one port twice/.test(al[0].detail), JSON.stringify([st, al].map((l) => l.map((p) => p.detail.slice(0, 160)))));
  const fam = kinds(['fam.mjs'], 'derived-endpoint-unchecked'); const famok = kinds(['famok.mjs'], 'derived-endpoint-unchecked');
  check('8n (n1): a dynamic window family whose candidates never pass the helper with `window: PORT_WINDOW_FAMILY` is red; the reservePort(base, tries, spec) shape (scenario-titlecard / scenario-batch now) is clean and its family still reads',
    fam.length === 1 && /fam\.mjs:4 picks ports from the dynamic window 31200-31635 .* but no assertDerivedEndpoint\(…, \{ window: PORT_WINDOW_FAMILY \}\)/.test(fam[0].detail) && famok.length === 0 && kinds(['famok.mjs'], 'dynamic-window-undeclared').length === 0, JSON.stringify([fam, famok].map((l) => l.map((p) => p.detail.slice(0, 160)))));
  // the tree: 0 rows; the sweep list — every file the reader models a derivation in calls the helper
  const treeLint = await treeLintOnce();
  const dRows = treeLint.problems.filter((p) => /^derived-endpoint-/.test(p.kind));
  const SWEEP = ['web/tools/e2e-rollslip.mjs', 'web/tools/venom-render.mjs', 'web/tools/e2e-renderpurity.mjs', 'web/tools/render-hooks-demo.mjs', 'web/tools/showcase-render.mjs', 'web/tools/record.mjs', 'web/tools/scenario-render.mjs', 'web/tools/hero-extend-render.mjs', 'web/tools/scenario-titlecard.mjs', 'web/tools/scenario-batch.mjs', 'ios/tools/e2e-ios.mjs', 'ios/tools/acceptance.mjs'];
  const calls = SWEEP.map((f) => [f, (fs.readFileSync(path.join(repoRoot, f), 'utf8').match(/\bassertDerivedEndpoint\(|\bassertEndpoints\(|\breserveEndpoint(?:Pair)?\(/g) ?? []).length]); // the lib allocator validates every candidate (r10); assertEndpoints validates the set (r11)
  const hitsAll = await treeHitsOnce();
  const derivedFiles = [...new Set(hitsAll.filter((h) => (h.syntax === 'derived-offset' || h.syntax === 'dynamic-window' || h.baseSpan) && !cib.isHarnessPath(h.file)).map((h) => h.file))]; // the harness suite's fixture strings are not derivations
  check(`8n (n1): on this tree 0 derived-endpoint rows; every file the reader models a derivation in (${derivedFiles.length}: derived offsets, dynamic windows, base-pin spans) is in the sweep list of ${SWEEP.length} and calls assertDerivedEndpoint — directly, as a set through assertEndpoints, or through the lib allocator reserveEndpoint(Pair) (${calls.map(([f, n]) => `${f.replace(/^.*\//, '')}×${n}`).join(', ')})`,
    dRows.length === 0 && derivedFiles.every((f) => SWEEP.includes(f)) && calls.every(([, n]) => n >= 1), `${JSON.stringify(dRows.map((p) => p.detail.slice(0, 160)))} unmodelled: ${derivedFiles.filter((f) => !SWEEP.includes(f)).join(',')}`);
  // (n2) nested spawns — the static edge table held to the code, on the scratch tree
  const CHILD = "export const PORT_FLAGS = { '--port': 'http' };\nexport const PORT_INVENTORY = { http: 1, cdp: 1 };\nexport const PORT_OVERRIDES = { cdp: 'OB_CDP_PORT' };\nconst HTTP_PORT = Number(process.env.OB_E2E_PORT ?? 8000);\nconst cdpPort = process.env.OB_CDP_PORT !== undefined ? Number(process.env.OB_CDP_PORT) : Number(process.env.OB_E2E_CDP_PORT ?? (HTTP_PORT + 1243));\nassertDerivedEndpoint(cdpPort, {});\nconst c = launchChrome(u, { port: cdpPort });\n";
  put('record.mjs', CHILD);
  const PARENT_PRE = "export const PORT_INVENTORY = { http: 2, cdp: 1 };\nconst PORT = Number(process.env.OB_E2E_PORT ?? 27300);\nconst CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 9721);\nconst run = (cmd, a, opts = {}) => execFileSync(cmd, a, { stdio: 'inherit', ...opts });\nfor (const preset of ['break', 'draw']) {\n  run('node', ['tools/record.mjs', '--preset', preset, '--framestep', '--port', String(PORT)]);\n}\n";
  const PARENT_FIX = PARENT_PRE.replace("'--port', String(PORT)]);", "'--port', String(PORT)], { env: { ...process.env, OB_CDP_PORT: String(CDP_PORT) } });");
  const E = [{ parent: 'parent.mjs', child: 'record.mjs', http: '--port', cdp: 'OB_CDP_PORT' }];
  put('parent.mjs', PARENT_PRE);
  const pre = kinds(['parent.mjs', 'record.mjs'], 'nested-spawn-unpinned', { spawnEdges: E });
  put('parent.mjs', PARENT_FIX);
  const fixd = lintOf(['parent.mjs', 'record.mjs'], { spawnEdges: E }).filter((p) => /^nested-spawn-/.test(p.kind));
  check('8n (n2): the PRE-FIX cuepost-live-sheet loop (`run(\'node\', [\'tools/record.mjs\', …, \'--port\', String(PORT)])`, no cdp pin) is red BY NAME — nested-spawn-unpinned: parent.mjs spawns record.mjs without an explicit cdp pin; the fixed shape (OB_CDP_PORT in the spawn env) has 0 nested-spawn rows',
    pre.length === 1 && /parent\.mjs:\d+ spawns record\.mjs without an explicit cdp pin \(no OB_CDP_PORT: … in a spawn env object/.test(pre[0].detail) && fixd.length === 0, JSON.stringify([pre.map((p) => p.detail.slice(0, 200)), fixd.map((p) => p.kind)]));
  const undecl = kinds(['parent.mjs', 'record.mjs'], 'nested-spawn-undeclared', { spawnEdges: [] });
  const drift = kinds(['parent.mjs', 'record.mjs'], 'nested-spawn-drift', { spawnEdges: [...E, { parent: 'record.mjs', child: 'parent.mjs', http: '--port', cdp: 'OB_CDP_PORT' }] });
  check('8n (n2): an edge the reader finds but the table lacks is red (nested-spawn-undeclared, naming parent → child); a table edge the code does not have is red (nested-spawn-drift)',
    undecl.length === 1 && /parent\.mjs:\d+ spawns the browser tool record\.mjs .* the edge parent\.mjs → record\.mjs is not in NESTED_SPAWN_EDGES/.test(undecl[0].detail) && drift.length === 1 && /record\.mjs → parent\.mjs/.test(drift[0].detail), JSON.stringify([undecl, drift].map((l) => l.map((p) => p.detail.slice(0, 160)))));
  put('wide.mjs', CHILD.replace('cdp: 1', 'cdp: 30'));
  put('parentw.mjs', PARENT_FIX.replace(/record\.mjs/g, 'wide.mjs'));
  const inv = kinds(['parentw.mjs', 'wide.mjs'], 'nested-spawn-inventory', { spawnEdges: [{ parent: 'parentw.mjs', child: 'wide.mjs', http: '--port', cdp: 'OB_CDP_PORT' }] });
  put('claimer.mjs', "export const PORT_INVENTORY = { http: 1, cdp: 1 };\nconst band = await claimPortBand(30700, 30729);\nconst c = launchChrome(u, { port: band.cdp(0) });\n");
  put('reader.mjs', "export const PORT_INVENTORY = { http: 1, cdp: 1 };\nconst PORT = Number(process.env.OB_E2E_PORT ?? 30740);\nconst c = launchChrome(u, { port: PORT + 1 });\n");
  put('driver.mjs', "run(process.execPath, ['claimer.mjs', spec], { X: '1' });\nrun(process.execPath, ['reader.mjs', spec], { X: '1' });\n");
  const cc = lintOf(['driver.mjs', 'claimer.mjs', 'reader.mjs'], { spawnEdges: [{ parent: 'driver.mjs', child: 'claimer.mjs', pins: 'child-claims' }, { parent: 'driver.mjs', child: 'reader.mjs', pins: 'child-claims' }] }).filter((p) => /^nested-spawn-/.test(p.kind));
  check('8n (n2): the parent\'s extent covers the child\'s — a child declaring cdp 30 under a parent declaring cdp 1 is red (nested-spawn-inventory); `pins: \'child-claims\'` is verified on the child: a registry claimant passes, a layout-pin reader declared child-claims is red',
    inv.length === 1 && /spawns wide\.mjs \(PORT_INVENTORY cdp 30\) at cdp offset \+0 but declares cdp 1/.test(inv[0].detail) && cc.length === 1 && /driver\.mjs → reader\.mjs is declared child-claims, but the child reads the layout pins/.test(cc[0].detail), JSON.stringify([inv, cc].map((l) => l.map((p) => p.detail.slice(0, 160)))));
  fs.rmSync(dir, { recursive: true, force: true });
  // the tree: 0 rows, every table parent in the scan root set
  const nRows = treeLint.problems.filter((p) => /^nested-spawn-/.test(p.kind));
  const scan = new Set(cib.deriveScanFiles(repoRoot).map((f) => f.path));
  const parents = [...new Set(cib.NESTED_SPAWN_EDGES.map((e) => e.parent))];
  check(`8n (n2): on this tree 0 nested-spawn rows; NESTED_SPAWN_EDGES has ${cib.NESTED_SPAWN_EDGES.length} edges over ${parents.length} parents (${parents.map((p) => p.replace(/^.*\//, '')).join(', ')}), every parent in the scan root set`,
    nRows.length === 0 && parents.every((p) => scan.has(p)) && cib.NESTED_SPAWN_EDGES.length >= 12, `${JSON.stringify(nRows.map((p) => p.detail.slice(0, 160)))} missing: ${parents.filter((p) => !scan.has(p)).join(',')}`);
  // the class, live: a --port-only child derives INTO scenario-render's declared family; the fixed child logs the parent's pins
  const srFam = cib.portWindowFamiliesOf(fs.readFileSync(path.join(WEB_DIR, 'tools', 'scenario-render.mjs'), 'utf8'));
  const derivedChild = runTool('record.mjs', ['--port', '27300', '--print-endpoints']);
  const dm = /cdp (\d+) \(derived HTTP_PORT \+ 1243\)/.exec(derivedChild.stdout ?? '');
  check('8n (n2): the class, live — a record.mjs child given --port 27300 ALONE derives cdp 28543, inside scenario-render\'s declared rotation family (the collision the rule prevents); the fixed live-sheet shape hands it OB_CDP_PORT and the child logs the parent\'s pins (the positive control above)',
    dm !== null && Number(dm[1]) === 28543 && srFam.some((w) => 28543 >= w.start && 28543 <= w.end) && ok.status === 0, `${(derivedChild.stdout + derivedChild.stderr).slice(0, 200)} families ${JSON.stringify(srFam)}`);
  // source pins: the spawners carry both forms; the helper is the one place
  const src = (rel) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');
  check('8n: source pins — cuepost-live-sheet passes OB_CDP_PORT beside --port; e2e-cuepost\'s runCli passes --port PORT + 1 and OB_CDP_PORT CDP_PORT + 1 (inventory cdp 2); scenario-batch reserves and passes the child http port (--port httpPort) and pins the gate child; capture-525-combined and ios acceptance pass OB_E2E_PORT + OB_E2E_CDP_PORT; cdp.mjs exports assertDerivedEndpoint and both sinks call derivedEndpointProblem',
    /'--port', String\(PORT\), \.\.\.extra\],\s*\{ env: \{ \.\.\.process\.env, OB_CDP_PORT: String\(CDP_PORT\) \} \}/.test(src('web/tools/cuepost-live-sheet.mjs'))
    && /\[cli, \.\.\.args, '--port', String\(PORT \+ 1\)\]/.test(src('web/tools/e2e-cuepost.mjs')) && /OB_CDP_PORT: String\(CDP_PORT \+ 1\)/.test(src('web/tools/e2e-cuepost.mjs')) && /PORT_INVENTORY = \{ http: 2, cdp: 2 \}/.test(src('web/tools/e2e-cuepost.mjs'))
    && /'render', id, '--port', String\(httpPort\)/.test(src('web/tools/scenario-batch.mjs')) && /'verify', id, '--port', String\(httpPort\)/.test(src('web/tools/scenario-batch.mjs')) && /'gate', \.\.\.todo,\s*'--port', String\(gate\.http\)/.test(src('web/tools/scenario-batch.mjs'))
    && /OB_E2E_PORT: String\(PORT\), OB_E2E_CDP_PORT: String\(CDP\)/.test(src('web/tools/capture-525-combined.mjs')) && /OB_E2E_PORT: String\(PORT\), OB_E2E_CDP_PORT: String\(CDP_PORT\)/.test(src('ios/tools/acceptance.mjs'))
    && /^export function assertDerivedEndpoint\(/m.test(src('web/tools/cdp.mjs')) && (src('web/tools/cdp.mjs').match(/derivedEndpointProblem\(Number\(port\)/g) ?? []).length === 2,
    'one of the source pins drifted');
}

const __failedAfter8n = failed;
// ---- arm 8o (companion review r10): endpoint PAIRS as one unit; scans skip held endpoints; shell spawners derive, never a constant --
//   (a) lib/endpoint-pair.mjs is the ONE allocator: reserveEndpointPair returns both endpoints or nothing (a failure after
//       the first reservation releases its claim AND lock dir before the error propagates); spawnLeased pends holds for
//       BOTH endpoints across the spawn gap and leases the child into BOTH claims; lock dirs die with the process.
//   (b) a candidate scan skips every endpoint this process holds (its reservations, noted endpoints, the env pins) and
//       asserts only on exhaustion, naming the window and the held ports.
//   (c) render-all.sh honours an inherited OB_CDP_PORT and otherwise leaves the derivation to record.mjs's validated rule.
//   TEST MATRIX (fixtures under a PRIVATE registry OB_PORT_BANDS_DIR and a FAKE lock root OB_CDP_LOCK_DIR):
//     (1) first ten cdp candidates busy → the http scan skips the chosen cdp, the pair is leased to a child ("the batch runs")
//     (2) http window exhausted after cdp reserved → cdp claim released, lock dir gone, retry count 1, leak 0
//     (3) the parent SIGKILLed between spawn and the child's first scan → both endpoints stay protected until the child exits
//     (4) two render-all.sh runs with PORT=A / PORT=B (no CDP env) → distinct cdp endpoints, inside the range; inherited OB_CDP_PORT honoured
//     (5) the FIX9 arms (8n) still pass
{
  const cib = await import('./lib/ci-bands.mjs');
  const lib = await import('./lib/endpoint-pair.mjs');
  const { spawn } = await import('node:child_process');
  const table = cib.loadCiBands(); const lanesT = cib.loadLaneBands(cib.LANE_BANDS_FILE, table);
  const repoRoot = path.resolve(WEB_DIR, '..');
  const stage = fs.mkdtempSync('/tmp/obw-hygiene-8o-'); const REG = path.join(stage, 'reg'); const LOCKS = path.join(stage, 'locks');
  fs.mkdirSync(REG); fs.mkdirSync(LOCKS);
  const cleanEnv = (extra = {}) => { const env = { ...process.env, OB_PORT_BANDS: '', OB_PORT_BANDS_DIR: REG, OB_CDP_LOCK_DIR: LOCKS, ...extra }; for (const k of Object.keys(env)) if (((/^OB_\w*(PORT|CDP|BAND_START|BAND_END|PORT_BASE)\w*$/.test(k) && !/_(MS|TRIES|FAILS|SCALE|DIR)$/.test(k)) || ['GITHUB_ACTIONS', 'OB_CI_BANDS', 'CI'].includes(k)) && !(k in extra) && k !== 'OB_PORT_BANDS') delete env[k]; return env; };
  let B = null; for (let a = 0; a < 8 && B === null; a++) { const cand = 41000 + (((process.pid % 200) + a * 71 + 5) % 200) * 60; if (await windowFree(cand, cand + 59)) B = cand; }
  const LIBP = path.join(WEB_DIR, 'tools', 'lib', 'endpoint-pair.mjs'); const CDPP = path.join(WEB_DIR, 'tools', 'cdp.mjs');
  const FIX = path.join(stage, 'fixture.mjs');
  fs.writeFileSync(FIX, `import fs from 'node:fs'; import { spawn } from 'node:child_process';
const LIB = await import(${JSON.stringify(LIBP)}); const CDP = await import(${JSON.stringify(CDPP)});
const [mode, bStr] = process.argv.slice(2); const B = Number(bStr); const REG = process.env.OB_PORT_BANDS_DIR;
const out = (o) => console.log('RESULT ' + JSON.stringify(o));
const claimDirs = (p) => fs.readdirSync(REG).filter((d) => d.startsWith(p + '-' + p + '.'));
const leasesFor = (p, pid) => claimDirs(p).filter((d) => fs.existsSync(REG + '/' + d + '/lease-' + pid + '.json')).length;
const spec = (role) => ({ tool: 'fixture', role, expr: 'B' });
if (mode === 'busy10') {
  for (let p = B; p < B + 10; p++) fs.mkdirSync(LIB.lockDirFor(p, 'cdp'), { recursive: true });
  const pair = await LIB.reserveEndpointPair(B, B, 12, { cdp: spec('cdp'), http: spec('http') });
  const child = LIB.spawnLeased([pair.cdp, pair.http], () => spawn(process.execPath, ['-e', 'setTimeout(() => {}, 5000)'], { stdio: 'ignore' }));
  await new Promise((r) => setTimeout(r, 300));
  out({ cdp: pair.cdp, http: pair.http, childPid: child.pid, leases: [leasesFor(pair.cdp, child.pid), leasesFor(pair.http, child.pid)], locks: LIB.ownedLockDirs().length });
  child.kill('SIGTERM'); pair.release(); process.exit(0);
}
if (mode === 'exhaust') {
  const lockDirs0 = fs.readdirSync(process.env.OB_CDP_LOCK_DIR).length;
  for (let p = B + 50; p < B + 53; p++) fs.mkdirSync(LIB.lockDirFor(p, 'cdp'), { recursive: true });
  let err = null; try { await LIB.reserveEndpointPair(B + 40, B + 50, 3, { cdp: spec('cdp'), http: spec('http') }); } catch (e) { err = e.message; }
  const after = { cdpLockGone: !fs.existsSync(LIB.lockDirFor(B + 40, 'cdp')), owned: LIB.ownedLockDirs().length };
  fs.rmSync(LIB.lockDirFor(B + 50, 'cdp'), { recursive: true, force: true });
  const pair = await LIB.reserveEndpointPair(B + 40, B + 50, 3, { cdp: spec('cdp'), http: spec('http') });
  const lockDirs = fs.readdirSync(process.env.OB_CDP_LOCK_DIR).length - lockDirs0;
  out({ err, after, retry: { cdp: pair.cdp, http: pair.http }, owned: LIB.ownedLockDirs().length, lockDirs });
  pair.release(); process.exit(0);
}
if (mode === 'foreign') { // a foreign claimant: claim each port given, report
  const res = {}; for (const p of process.argv.slice(3).map(Number)) { try { const c = await CDP.claimPortBand(p, p, { layout: false }); c.release(); res[p] = 'CLAIMED'; } catch (e) { res[p] = 'REFUSED: ' + e.message.split('\\n')[0].slice(0, 90); } }
  out(res); process.exit(0);
}
if (mode === 'sigkill') {
  const pair = await LIB.reserveEndpointPair(B + 20, B + 30, 5, { cdp: spec('cdp'), http: spec('http') });
  const child = LIB.spawnLeased([pair.cdp, pair.http], () => spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'ignore', detached: true }));
  child.unref();
  console.log('SPAWNED ' + child.pid + ' ' + pair.cdp + ' ' + pair.http);
  setInterval(() => {}, 1000); // stay alive until SIGKILLed by the arm
}
if (mode === 'held') {
  const forget = LIB.noteHeld({ start: B, end: B + 2 }, 'fixture-held');
  let err = null; try { await LIB.reserveEndpoint(B, 3, spec('cdp')); } catch (e) { err = e.message; }
  forget(); out({ err }); process.exit(0);
}
`);
  const runFix = (mode, ...args) => spawnSync(process.execPath, [FIX, mode, String(B), ...args], { encoding: 'utf8', env: cleanEnv(), cwd: WEB_DIR, timeout: 90000 });
  const result = (r) => { const m = /^RESULT (.*)$/m.exec(r.stdout ?? ''); return m ? JSON.parse(m[1]) : { crashed: `status ${r.status} ${String(r.stderr ?? '').slice(-500)}` }; };
  // (1)
  const r1 = B === null ? null : result(runFix('busy10'));
  check(`8o (1): first ten cdp candidates busy (lock dirs ${B}-${B + 9}) → the pair allocator picks cdp ${B + 10}, the http scan from the SAME base SKIPS the reserved cdp and lands on ${B + 11} (never an assertion), and the spawned child is leased into BOTH claims — "the batch runs"`,
    r1 !== null && r1.cdp === B + 10 && r1.http === B + 11 && r1.leases[0] >= 1 && r1.leases[1] >= 1 && r1.locks === 2, JSON.stringify(r1));
  // (2)
  const r2 = B === null ? null : result(runFix('exhaust'));
  check(`8o (2): the http window exhausted AFTER the cdp reservation (locks on ${B + 50}-${B + 52}, tries 3) → the pair throws naming the window ("no reservable cdp endpoint in ${B + 50}..${B + 52}"), the cdp claim's lock dir (${B + 40}) is GONE and no lock is owned; one http lock freed → the retry succeeds (retry count 1) with exactly 2 owned locks and no leaked dir (the fake root grew by 4 = the 2 pre-made locks left + the 2 live ones)`,
    r2 !== null && new RegExp(`no reservable cdp endpoint in ${B + 50}\\.\\.${B + 52}: 3 candidates exhausted`).test(r2.err ?? '') && r2.after?.cdpLockGone === true && r2.after?.owned === 0 && r2.retry?.cdp === B + 40 && r2.retry?.http === B + 50 && r2.owned === 2 && r2.lockDirs === 4, JSON.stringify(r2));
  // the cdp CLAIM is gone too: a foreign claimant takes B while the fixture is out of the picture
  const rf0 = B === null ? null : result(runFix('foreign', String(B + 40)));
  check(`8o (2): after the failed pair the cdp CLAIM is released as well — a foreign claimant CLAIMS ${B + 40} under the same private registry (a leaked claim would refuse it)`, rf0 !== null && rf0[B + 40] === 'CLAIMED', JSON.stringify(rf0));
  // (3) SIGKILL between spawn and the child's first scan
  let r3 = { spawned: null, whileAlive: null, afterExit: null };
  if (B !== null) {
    const parent = spawn(process.execPath, [FIX, 'sigkill', String(B)], { env: cleanEnv(), cwd: WEB_DIR, stdio: ['ignore', 'pipe', 'pipe'] });
    let perr = ''; parent.stderr.on('data', (c) => { perr += c; });
    const spawned = await new Promise((resolve) => { let buf = ''; const t = setTimeout(() => resolve(null), 30000); parent.stdout.on('data', (c) => { buf += c; const m = /^SPAWNED (\d+) (\d+) (\d+)$/m.exec(buf); if (m) { clearTimeout(t); resolve({ child: Number(m[1]), cdp: Number(m[2]), http: Number(m[3]) }); } }); parent.once('exit', () => { clearTimeout(t); resolve(null); }); });
    r3.spawned = spawned; if (!spawned) r3.parentStderr = perr.slice(-500);
    if (spawned) {
      try { process.kill(parent.pid, 'SIGKILL'); } catch { /* already gone */ }
      await new Promise((r) => setTimeout(r, 300));
      r3.parentDead = !pidAlive(parent.pid);
      r3.whileAlive = result(runFix('foreign', String(spawned.cdp), String(spawned.http)));
      try { process.kill(spawned.child, 'SIGKILL'); } catch { /* gone */ }
      for (let i = 0; i < 50 && pidAlive(spawned.child); i++) await new Promise((r) => setTimeout(r, 100));
      r3.afterExit = result(runFix('foreign', String(spawned.cdp), String(spawned.http)));
    }
  }
  check('8o (3): the parent SIGKILLed right after spawnLeased (before the child ever scans the registry) → BOTH endpoints stay protected — a foreign claimant is REFUSED on the cdp and the http port ("overlaps the LIVE foreign claim", the child\'s lease keeps both claims live) — and both are CLAIMED once the child is gone',
    r3.spawned !== null && r3.parentDead === true && r3.whileAlive !== null && /REFUSED: .*LIVE foreign claim/.test(r3.whileAlive[r3.spawned.cdp] ?? '') && /REFUSED: .*LIVE foreign claim/.test(r3.whileAlive[r3.spawned.http] ?? '') && r3.afterExit !== null && r3.afterExit[r3.spawned.cdp] === 'CLAIMED' && r3.afterExit[r3.spawned.http] === 'CLAIMED', JSON.stringify(r3));
  // (b) the exhaustion message names the window and the held ports (in-process: every candidate held → no claim is ever attempted)
  const rh = B === null ? null : result(runFix('held'));
  check(`8o (b): a scan whose every candidate is HELD (noteHeld ${B}-${B + 2}) never asserts against them — it exhausts, naming the window and the held ports skipped`, rh !== null && new RegExp(`no reservable cdp endpoint in ${B}\\.\\.${B + 2}: 3 candidates exhausted; held endpoints skipped: ${B} \\(fixture-held\\), ${B + 1} \\(fixture-held\\), ${B + 2} \\(fixture-held\\)`).test(rh.err ?? ''), JSON.stringify(rh));
  // (4) render-all.sh: derive through record.mjs's validated rule; inherited pin honoured; never a constant
  const sh = (extra) => spawnSync('bash', [path.join(repoRoot, 'tools', 'demo', 'render-all.sh')], { encoding: 'utf8', env: { ...cleanEnv(extra), RENDER_ALL_DRY: '1', ONLY: 'jump', WORK: path.join(stage, 'work') }, cwd: repoRoot, timeout: 90000 });
  const ep = (r) => (/^\[record\] endpoints: http (\d+) \((.*?)\) cdp (\d+) \((.*?)\)$/m.exec(r.stdout ?? '') ?? []).slice(1);
  const a4 = B === null ? null : sh({ PORT: String(B + 55) }); const b4 = B === null ? null : sh({ PORT: String(B + 56) }); const c4 = B === null ? null : sh({ PORT: String(B + 55), OB_CDP_PORT: String(B + 58) });
  const [ea, eb, ec] = [a4, b4, c4].map((r) => (r ? ep(r) : []));
  const shText = fs.readFileSync(path.join(repoRoot, 'tools', 'demo', 'render-all.sh'), 'utf8');
  check(`8o (4): two render-all.sh runs (RENDER_ALL_DRY=1) with PORT=${B + 55} and PORT=${B + 56} and no CDP env derive DISTINCT cdp endpoints through record.mjs's validated rule (${B + 55 + 1243} / ${B + 56 + 1243}, inside 1024-65535, exit 0); with OB_CDP_PORT=${B + 58} inherited the child logs "cdp ${B + 58} (OB_CDP_PORT)"; the script carries no CDP constant (red-proof: 5bbec844 forced OB_CDP_PORT=9243 on every run)`,
    a4?.status === 0 && b4?.status === 0 && c4?.status === 0 && ea[0] === String(B + 55) && ea[2] === String(B + 55 + 1243) && /derived/.test(ea[3]) && eb[2] === String(B + 56 + 1243) && ec[2] === String(B + 58) && ec[3] === 'OB_CDP_PORT' && !/9243/.test(shText) && !/CDP_PORT:-\d/.test(shText), // a `${X:-<digits>}` default would be a constant; `${OB_CDP_PORT:-}` is the inherited-pin test
    JSON.stringify({ a: [a4?.status, ea], b: [b4?.status, eb], c: [c4?.status, ec], tail: (a4?.stdout ?? '').split('\n').slice(-3) }));
  // the .sh sweep: every shell spawner of a browser tool under tools/ passes pins through or nothing — never a CDP constant
  const shFiles = execFileSync('git', ['-C', repoRoot, 'ls-files', '--', 'tools/*.sh', 'tools/**/*.sh'], { encoding: 'utf8', timeout: SYNC_CHILD_TIMEOUT_MS }).trim().split('\n').filter(Boolean);
  const shSpawners = shFiles.filter((f) => /node [^\n]*\.mjs/.test(fs.readFileSync(path.join(repoRoot, f), 'utf8')));
  const shConst = shSpawners.filter((f) => /OB_(?:CDP_PORT|E2E_CDP_PORT|E2E_PORT)=["']?\d{4,5}/.test(fs.readFileSync(path.join(repoRoot, f), 'utf8')));
  check(`8o (c): the .sh sweep — ${shSpawners.length} shell files under tools/ spawn node tools (${shSpawners.join(', ')}); none pins a CDP / http endpoint to a constant (inherited pins pass through the environment; render-all.sh derives via record.mjs)`, shSpawners.length >= 2 && shConst.length === 0, JSON.stringify(shConst));
  // (5) the FIX9 arms
  check('8o (5): the FIX9 arms (8n) passed in this run — 0 new FAIL rows between the 8n header and its end', __failedAfter8n === __failedBefore8n, `fail delta ${__failedAfter8n - __failedBefore8n}`);
  // the lint knows the allocator: a batch-shaped fixture through the lib reads span 270 (0 drift rows); a +30 variant drifts by name
  const dir = fs.mkdtempSync('/tmp/obw-hygiene-8o-lint-');
  const put = (rel, text) => { fs.writeFileSync(path.join(dir, rel), text); return rel; };
  const kinds = (files, k) => cib.lintCiBands({ table, workflows: {}, toolDefaults: cib.scanToolDefaultFiles(files, dir), laneBands: lanesT }).problems.filter((p) => p.kind === k);
  const BATCHY = (off) => `import { reserveEndpointPair } from './lib/endpoint-pair.mjs';\nconst SLOT_CAP = 12;\nasync function f(slot) {\n  const batchBase = Number(process.env.OB_BATCH_PORT_BASE ?? 25670);\n  const pair = await reserveEndpointPair(batchBase + (slot % SLOT_CAP) * 20, batchBase + (slot % SLOT_CAP) * 20 + ${off}, 40,\n    { cdp: { tool: 'b', role: 'cdp', expr: 'x', pin: 'OB_BATCH_PORT_BASE' }, http: { tool: 'b', role: 'http', expr: 'y', pin: 'OB_BATCH_PORT_BASE' } });\n  return pair;\n}\n`;
  put('batchy.mjs', BATCHY(10)); put('batchy30.mjs', BATCHY(30));
  const d10 = kinds(['batchy.mjs'], 'pin-model-drift'); const u10 = kinds(['batchy.mjs'], 'derived-endpoint-unchecked'); const d30 = kinds(['batchy30.mjs'], 'pin-model-drift');
  check('8o: the lint reads the lib allocator — a scenario-batch-shaped file calling reserveEndpointPair(base + (slot % 12) * 20, … + 10, 40, specs) generates the listed span 270 (0 pin-model-drift, 0 derived-endpoint-unchecked rows); the same with + 30 drifts by name (290 ≠ 270)',
    d10.length === 0 && u10.length === 0 && d30.length === 1 && /generates 290 port\(s\) from OB_BATCH_PORT_BASE/.test(d30[0].detail), JSON.stringify([d10, u10, d30].map((l) => l.map((p) => p.detail.slice(0, 200)))));
  fs.rmSync(dir, { recursive: true, force: true });
  // source pins: batch and titlecard allocate through the lib; batch leases both endpoints; the render tools skip held candidates
  const src = (rel) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');
  check('8o: source pins — scenario-batch reserves each slot and the gate as reserveEndpointPair and spawns through spawnLeased (no local reservePort, no bare pendIntoOwnClaims); scenario-titlecard reserves through reserveEndpoint; scenario-render / hero-extend-render skip held candidates (heldReason) and note their owned server; cdp.mjs exports installSignalReaper; the lib\'s DEFAULT_TRIES equals the reader\'s 40',
    /reserveEndpointPair\(batchBase \+ \(slot % SLOT_CAP\) \* 20, batchBase \+ \(slot % SLOT_CAP\) \* 20 \+ 10, 40,/.test(src('web/tools/scenario-batch.mjs')) && /reserveEndpointPair\(batchBase, batchBase \+ 10, 40,/.test(src('web/tools/scenario-batch.mjs')) && (src('web/tools/scenario-batch.mjs').match(/spawnLeased\(/g) ?? []).length === 2 && !/reservePort\(|pendIntoOwnClaims\(/.test(src('web/tools/scenario-batch.mjs'))
    && (src('web/tools/scenario-titlecard.mjs').match(/reserveEndpoint\(/g) ?? []).length === 2 && !/reservePort\(/.test(src('web/tools/scenario-titlecard.mjs'))
    && /heldReason\(cand\) !== null/.test(src('web/tools/scenario-render.mjs')) && /noteHeld\(cand, 'the owned http server'\)/.test(src('web/tools/scenario-render.mjs')) && (src('web/tools/hero-extend-render.mjs').match(/heldReason\(cand\)/g) ?? []).length >= 2
    && /^export function installSignalReaper\(/m.test(src('web/tools/cdp.mjs')) && lib.DEFAULT_TRIES === 40 && /probes\.set\('reserveEndpointPair', \{ tries: 40, idx: 2/.test(src('web/tools/lib/ci-bands.mjs')),
    'one of the source pins drifted');
  fs.rmSync(stage, { recursive: true, force: true });
}

// ---- arm 8p (companion review r11): supplied pins are HELD before any scan; a validation path validates EVERY role --
//   (a) ios acceptance / e2e-ios pick through the lib's held set: a supplied pin of any role (OB_E2E_PORT / OB_E2E_CDP_PORT /
//       OB_CDP_PORT) and every earlier pick are skipped — OB_E2E_PORT=8381 with no cdp pin made the cdp scan land on 8381
//       and exit 2; a cdp pin EQUAL to the http pin is refused by name (not a scan). The OS-ephemeral pickers
//       (bake-cue-thumbs, synth-render) never hand back a held endpoint either.
//   (b) cdp.mjs assertEndpoints validates ALL declared roles as one set before a dry / print / validate path reports
//       success: record.mjs `--port 0 --print-endpoints` printed http 0 and exited 0 (RENDER_ALL_DRY certified it).
{
  const cib = await import('./lib/ci-bands.mjs');
  const cdpm = await import('./cdp.mjs');
  const repoRoot = path.resolve(WEB_DIR, '..');
  const cleanEnv = (extra = {}) => { const env = { ...process.env, ...extra }; for (const k of Object.keys(env)) if (/^OB_\w*(PORT|CDP|BAND_START|BAND_END|PORT_BASE)\w*$/.test(k) && !/_(MS|TRIES|FAILS|SCALE|DIR)$/.test(k) && !(k in extra)) delete env[k]; return env; };
  const run = (file, args, extra = {}) => spawnSync(process.execPath, [path.join(repoRoot, file), ...args], { encoding: 'utf8', env: cleanEnv(extra), cwd: WEB_DIR, timeout: 90000 });
  // (b) the helper as a set
  let dup = null; try { cdpm.assertEndpoints('fixture', { http: { value: 30000, derived: false }, cdp: { value: 30000, derived: false } }, { onFail: 'throw' }); } catch (e) { dup = e.message; }
  let low = null; try { cdpm.assertEndpoints('fixture', { http: { value: 0, derived: false }, cdp: { value: 9243, derived: false } }, { onFail: 'throw' }); } catch (e) { low = e.message; }
  const okSet = cdpm.assertEndpoints('fixture', { http: { value: 27300, derived: false }, cdp: { value: 9721, derived: false } }, { onFail: 'throw' });
  check('8p (b): assertEndpoints judges EVERY role — an http of 0 is refused by name before the cdp is even looked at, two roles on one port are refused ("equals the port it derives from" via base, or the set rule), a valid pair returns both values',
    /fixture: refusing to launch — the pinned http endpoint 0 lies outside the valid port range/.test(low ?? '') && /equals the/.test(dup ?? '') && okSet.http === 27300 && okSet.cdp === 9721, JSON.stringify([low, dup, okSet].map((x) => String(typeof x === 'object' ? JSON.stringify(x) : x).slice(0, 120))));
  const r0 = run('web/tools/record.mjs', ['--port', '0', '--print-endpoints']);
  const r65 = run('web/tools/record.mjs', ['--port', '65000', '--print-endpoints']);
  const rok = run('web/tools/record.mjs', ['--port', '27300', '--print-endpoints'], { OB_CDP_PORT: '9721' });
  check('8p (b): `record.mjs --port 0 --print-endpoints` is REFUSED by name (the pinned http endpoint 0 lies outside 1024-65535, exit 2 — red-proof: c9b6e296 printed "http 0" and exited 0); `--port 65000` → exit 2 (the derived cdp 66243); a valid pair → exit 0 with BOTH endpoints printed',
    r0.status === 2 && /^record: refusing to launch — the pinned http endpoint 0 lies outside the valid port range 1024-65535/m.test(r0.stderr) && !/\[record\] endpoints/.test(r0.stdout) && r65.status === 2 && /derived cdp endpoint 66243/.test(r65.stderr) && rok.status === 0 && /^\[record\] endpoints: http 27300 \(--port\) cdp 9721 \(OB_CDP_PORT\)$/m.test(rok.stdout),
    JSON.stringify([r0.status, (r0.stderr + r0.stdout).slice(0, 160), r65.status, rok.status, rok.stdout.slice(0, 120)]));
  const dry0 = spawnSync('bash', [path.join(repoRoot, 'tools', 'demo', 'render-all.sh')], { encoding: 'utf8', env: { ...cleanEnv({ PORT: '0' }), RENDER_ALL_DRY: '1', ONLY: 'jump', WORK: fs.mkdtempSync('/tmp/obw-hygiene-8p-work-') }, cwd: repoRoot, timeout: 90000 });
  check('8p (b): RENDER_ALL_DRY=1 with PORT=0 FAILS (exit 1) with the record.mjs refusal on its output — the dry run can no longer certify an invalid http endpoint', dry0.status === 1 && /refusing to launch — the pinned http endpoint 0/.test(dry0.stdout + dry0.stderr), `status ${dry0.status} ${(dry0.stdout + dry0.stderr).slice(-200)}`);
  // (a) the ios acceptance driver: a supplied http pin in the cdp window, no cdp pin — the cdp pick skips it
  let F = null; for (let p = 8381; p <= 8399 && F === null; p++) if (!(await tcpBusy(p)) && !(await tcpBusy(p + 1))) F = p;
  const acc = F === null ? null : run('ios/tools/acceptance.mjs', ['--print-endpoints'], { OB_E2E_PORT: String(F) });
  const am = acc ? /^\[acceptance\] endpoints: http (\d+) \((.*?)\) cdp (\d+) \((.*?)\)$/m.exec(acc.stdout) : null;
  check(`8p (a): ios acceptance with OB_E2E_PORT=${F} (free, inside the cdp window 8381-8399) and NO cdp pin picks a cdp ≠ ${F} and proceeds (--print-endpoints exit 0; red-proof: c9b6e296's picker did not hold the supplied pin and the cdp scan landed on it → exit 2)`,
    F !== null && acc?.status === 0 && am !== null && Number(am[1]) === F && am[2] === 'OB_E2E_PORT' && Number(am[3]) !== F && Number(am[3]) >= 8381 && Number(am[3]) <= 8399 && /pickFreePort\(8381\)/.test(am[4]), `F ${F} status ${acc?.status} ${(acc?.stdout ?? '').slice(0, 160)} ${(acc?.stderr ?? '').slice(0, 200)}`);
  const accEq = F === null ? null : run('ios/tools/acceptance.mjs', ['--print-endpoints'], { OB_E2E_PORT: String(F), OB_E2E_CDP_PORT: String(F) });
  check(`8p (a): a cdp pin EQUAL to the http pin (OB_E2E_PORT=OB_E2E_CDP_PORT=${F}) is refused BY NAME — "equals the port it derives from" — not scanned around`, F !== null && accEq?.status === 2 && /pinned cdp endpoint \d+ \(base \d+\) equals the port it derives from/.test(accEq?.stderr ?? ''), `status ${accEq?.status} ${(accEq?.stderr ?? '').slice(0, 200)}`);
  // the sweep: every scanner outside the lib picks through the held set; every print path validates all roles
  const src = (rel) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');
  check('8p: source pins — ios acceptance and e2e-ios pick through the lib\'s heldReason / noteHeld (no private picked-set); bake-cue-thumbs and synth-render\'s OS-ephemeral freePort re-draw a held endpoint; record.mjs and acceptance validate their endpoint SET through assertEndpoints (http + cdp) before printing; the lint accepts `value: NAME` inside assertEndpoints as the per-name check',
    /heldReason\(p\) !== null\) continue/.test(src('ios/tools/acceptance.mjs')) && /noteHeld\(p, 'picked by acceptance'\)/.test(src('ios/tools/acceptance.mjs')) && !/pickedPorts/.test(src('ios/tools/acceptance.mjs'))
    && /iosHeldReason\(p\) !== null\) continue/.test(src('ios/tools/e2e-ios.mjs')) && !/pickedPorts/.test(src('ios/tools/e2e-ios.mjs'))
    && /if \(heldReason\(port\) === null\) return port;/.test(src('tools/render/bake-cue-thumbs.mjs')) && /if \(heldReason\(port\) === null\) return port;/.test(src('web/tools/synth-render.mjs'))
    && /assertEndpoints\('record', \{\s*http: \{ value: HTTP_PORT/.test(src('web/tools/record.mjs')) && /cdp: \{ value: cdpPort, base: HTTP_PORT/.test(src('web/tools/record.mjs'))
    && /assertEndpoints\('acceptance', \{\s*http: \{ value: PORT/.test(src('ios/tools/acceptance.mjs'))
    && /^export function assertEndpoints\(/m.test(src('web/tools/cdp.mjs')) && /assertEndpoints\\\(\/\.test\(codeAll\)/.test(src('web/tools/lib/ci-bands.mjs')),
    'one of the source pins drifted');
  const treeRows = (await treeLintOnce()).problems.filter((p) => /^derived-endpoint-|^nested-spawn-/.test(p.kind));
  check('8p: on this tree 0 derived-endpoint / nested-spawn rows after the set-helper migration (record.mjs\'s derived cdp is still held to the helper through `value: cdpPort`)', treeRows.length === 0, JSON.stringify(treeRows.map((p) => p.detail.slice(0, 160))));
}

// ---- arm 8c: band-width law (GH-410 red-proofs) ---------------------------------
// The #305 merge grew e2e-playback's inventory to CDP+0..CDP+23; under the
// GH-338 layout (cdp(0)=start+15) that SILENTLY ESCAPED a 30-wide band and
// died mid-suite on a foreign lane's claim (lane T, build 17). The law now:
// suites DECLARE their inventory (a static `export const PORT_INVENTORY`),
// run-gate REFUSES a band narrower than the declaration and claims a
// WIDENED one — extended in place, or slid past live neighbors via the
// registry — and bandLayout throws on layout overflow. Staged like arm 8b:
// a PRIVATE registry (OB_PORT_BANDS_DIR seam) + private ledger, staged
// suite files in a temp dir, foreign neighbors as real child processes.
// PRE-FIX RED: run-gate claims the narrow band unchanged, the staged
// suite's CDP+23 escapes it (fits=false, and with a planted neighbor the
// escape port sits inside the FOREIGN claim — the exact lane-T kill), so
// (ii)/(iii) fail; (iv) fails because the narrow claim SUCCEEDS instead of
// refusing; the audit check fails on an undercounting declaration.
{
  const { spawn } = await import('node:child_process');
  const { parsePortInventory, bandLayout, bandWidthForInventory,
    BAND_CDP_OFFSET } = await import('./cdp.mjs');
  const cdpPath = path.join(WEB_DIR, 'tools', 'cdp.mjs');
  const runGate = path.join(WEB_DIR, 'tools', 'run-gate.mjs');
  const REG = `/tmp/ob-port-bands-hygiene-410-${process.pid}`;
  const LDG = fs.mkdtempSync('/tmp/obw-hygiene-410-ledger-');
  const stage = fs.mkdtempSync('/tmp/obw-hygiene-410-suite-');
  fs.rmSync(REG, { recursive: true, force: true });
  // the staged suite: declares the e2e-playback-shaped inventory, then
  // VERIFIES its own extreme derivation (CDP+23) sits inside the covering
  // OB_PORT_BANDS claim and outside every foreign claim — exactly what a
  // real suite's launchChrome would enforce mid-battery.
  const stagedPath = path.join(stage, 'staged-inventory.mjs');
  fs.writeFileSync(stagedPath, [
    "export const PORT_FLAGS = { '--port': 'http' };", // GH-687 review r10: the staged suite says what its --port means (arm (xiv) passes one)
    'export const PORT_INVENTORY = { http: 1, cdp: 24 };',
    `const { assertPortOutsideForeignBands } = await import(${JSON.stringify(cdpPath)});`,
    'const http0 = Number(process.env.OB_E2E_PORT);',
    'const cdp0 = Number(process.env.OB_E2E_CDP_PORT);',
    "const bands = (process.env.OB_PORT_BANDS ?? '').split(',')",
    '  .map((e) => /^(\\d+)-(\\d+)\\./.exec(e)).filter(Boolean)',
    '  .map((m) => ({ start: Number(m[1]), end: Number(m[2]) }));',
    'const covering = bands.find((b) => cdp0 >= b.start && cdp0 <= b.end) ?? null;',
    'const cdpMax = cdp0 + 23; // the #305 growth: the 24th session',
    'let escape = null;',
    "try { assertPortOutsideForeignBands(cdpMax, 'CDP port'); }",
    'catch (e) { escape = e.message.split(String.fromCharCode(10))[0]; }',
    'const fits = covering !== null && cdpMax <= covering.end',
    '  && http0 >= covering.start && http0 <= covering.end && escape === null;',
    "console.log('STAGED band=' + (covering ? covering.start + '-' + covering.end : 'none')",
    "  + ' http0=' + http0 + ' cdp0=' + cdp0 + ' cdpMax=' + cdpMax",
    "  + ' fits=' + fits + (escape ? ' ESCAPE: ' + escape : ''));",
    'process.exit(fits ? 0 : 1);',
  ].join('\n'));
  const legacyPath = path.join(stage, 'staged-legacy.mjs');
  fs.writeFileSync(legacyPath, [
    '// no PORT_INVENTORY declaration: the pre-410 posture',
    "console.log('STAGED-LEGACY cdp0=' + process.env.OB_E2E_CDP_PORT);",
    'process.exit(0);',
  ].join('\n'));
  const gateEnv = () => {
    const env = { ...process.env, OB_PORT_BANDS: '', OB_PORT_BANDS_DIR: REG,
      OB_GATE_LEDGER_DIR: LDG };
    // the staged suites must see ONLY run-gate's derivation, and no
    // inherited storm plumbing may stretch this arm's timings; every
    // port-like pin goes (GH-687: the runner's job-level OB_CDP_PORT would
    // otherwise be refused by run-gate's pin check)
    for (const k of Object.keys(env)) if (/^OB_\w*(PORT|CDP|BAND_START|BAND_END|PORT_BASE)\w*$/.test(k) && !/_(MS|TRIES|FAILS|SCALE|DIR)$/.test(k) && k !== 'OB_PORT_BANDS' && k !== 'OB_PORT_BANDS_DIR') delete env[k];
    delete env.OB_GATE_RTT_P50_MS;
    delete env.OB_GATE_RTT_FILE;
    return env;
  };
  const runWrapped = (bandStr, suitePath, extraEnv = {}) => spawnSync(
    process.execPath,
    [runGate, '--band', bandStr, '--no-canary', '--no-belt', '--', suitePath],
    { encoding: 'utf8', timeout: 90000, cwd: WEB_DIR,
      env: { ...gateEnv(), ...extraEnv } });
  // a live FOREIGN neighbor: a real child process claiming [s, e] in the
  // private registry and holding until killed (the arm 8b staging idiom)
  const holdClaim = async (s, e, opts = '') => {
    const kid = spawn(process.execPath, ['--input-type=module', '-e', `
      const { claimPortBand } = await import(${JSON.stringify(cdpPath)});
      await claimPortBand(${s}, ${e}${opts});
      console.log('claimed');
      setInterval(() => {}, 1000); // hold until killed
      setTimeout(() => process.exit(0), 120000); // orphan failsafe (review r6)
    `], { stdio: ['ignore', 'pipe', 'ignore'], env: gateEnv() });
    const ok = await new Promise((res) => {
      const t = setTimeout(() => res(false), 10000);
      kid.stdout.on('data', (d) => {
        if (String(d).includes('claimed')) { clearTimeout(t); res(true); }
      });
      kid.once('exit', () => { clearTimeout(t); res(false); });
    });
    return ok ? kid : (kid.kill('SIGKILL'), null);
  };
  // pid-scattered staging bases, clear of the registry mutex (47997), the
  // 46000-47279 run-gate canary block and arm 8b's 45000-53999+%9000 sets
  // (disjoint by the +200 per-scenario spacing and the private registry)
  const S0 = 49000 + ((process.pid * 61) % 4000);
  try {
    // (i) the pure seams, no registry: parser, width math, layout overflow
    const playbackSrc = fs.readFileSync(path.join(WEB_DIR, 'tools', 'e2e-playback.mjs'), 'utf8');
    const realDecl = parsePortInventory(playbackSrc);
    // the declaration is judged against what the suite LAUNCHES (the GH-687
    // declared-vs-used reader), not against a literal this arm would have to
    // chase: PR #704 grew playback to CDP + 26 (cdp 27) and left the old
    // literal 26 here, which turned this row red on main's own nightly
    const { cdpOffsetsUsed } = await import('./lib/ci-bands.mjs');
    const playbackUsed = cdpOffsetsUsed(playbackSrc);
    check('410 (i): e2e-playback declares exactly the CDP slots it launches — http 1, cdp = the highest '
      + `CDP + k used + 1 (${playbackUsed.maxOffset === null ? '?' : playbackUsed.maxOffset + 1} on this tree: `
      + 'the #305 growth, the GH-404 3t2 pair, the GH-525 S2 EQID arm, the S5 kit arm)',
    realDecl?.http === 1 && playbackUsed.maxOffset !== null && playbackUsed.unknown.length === 0
      && realDecl?.cdp === playbackUsed.maxOffset + 1,
    JSON.stringify({ declared: realDecl, highestUsed: playbackUsed.maxOffset, top: playbackUsed.top?.expr, unknown: playbackUsed.unknown.length }));
    check('410 (i): an undeclared suite parses as null (legacy posture)',
      parsePortInventory('const CDP = 9611;\n') === null);
    check('410 (i): a QUOTED/indented fixture string never reads as the '
      + 'file\'s own declaration (review r1 — line-start anchored)',
    parsePortInventory(
      "  'export const PORT_INVENTORY = { http: 1, cdp: 9 };',\n") === null
      && parsePortInventory(
        'export const PORT_INVENTORY = { http: 2, cdp: 7 };\n')?.cdp === 7);
    let malformed = null;
    try { parsePortInventory('export const PORT_INVENTORY = { http: PORT };'); }
    catch (e) { malformed = e; }
    check('410 (i): a MALFORMED declaration throws (never silently ignored)',
      /malformed/.test(String(malformed?.message)), String(malformed?.message));
    const throws = (decl) => {
      try { parsePortInventory(decl); return false; } catch { return true; }
    };
    check('410 (i): NON-LITERAL field values are refused, never truncated '
      + '(review r3 — `24 + 1` and `1.5` must not under-size the claim)',
    throws('export const PORT_INVENTORY = { http: 1, cdp: 24 + 1 };')
      && throws('export const PORT_INVENTORY = { http: 1, cdp: 1.5 };')
      && throws('export const PORT_INVENTORY = { cdp: 24 };')
      // review r5: valid JS whose LAST duplicate wins would under-size the
      // claim when the first is read — duplicates fail closed
      && throws('export const PORT_INVENTORY = { http: 1, cdp: 1, cdp: 25 };')
      // review r10: foreign syntax (a spread could override cdp at runtime)
      // fails closed too — the WHOLE body is validated, member by member
      && throws('export const PORT_INVENTORY = { http: 1, cdp: 1, ...MORE };')
      // review r13: an expression TAIL after the object (`&& {...}`) whose
      // runtime value differs must fail closed, never parse the first object
      && throws('export const PORT_INVENTORY = { http: 1, cdp: 1 } '
        + '&& { http: 1, cdp: 25 };')
      // review r16: infeasible sizes are refused BEFORE any candidate math
      // (an oversized cdp hung the wrapper in quadratic dedupe)
      && throws('export const PORT_INVENTORY = { http: 1, cdp: 100000 };')
      && throws('export const PORT_INVENTORY = { http: 16, cdp: 1 };'));
    check('410 (i): recognition is indentation-agnostic and fails CLOSED '
      + '(review r4 — an INDENTED declaration parses, a block-commented one '
      + 'never declares, an unparseable or ambiguous one throws instead of '
      + 'reading as undeclared)',
    parsePortInventory(
      '  export const PORT_INVENTORY = { http: 1, cdp: 7 };\n')?.cdp === 7
      && parsePortInventory(
        '/* export const PORT_INVENTORY = { http: 1, cdp: 9 }; */\n') === null
      && throws('export const PORT_INVENTORY = {\n  http: 1,\n  cdp: 24,\n};\n')
      && throws('export const PORT_INVENTORY = { http: 1, cdp: 7 };\n'
        + 'export const PORT_INVENTORY = { http: 1, cdp: 9 };\n'));
    check('410 (i): bandWidthForInventory — a 24-cdp inventory needs 39, a '
      + 'tiny one floors at BAND_MIN_WIDTH',
    bandWidthForInventory({ http: 1, cdp: 24 }) === 39
      && bandWidthForInventory({ http: 1, cdp: 1 }) === 30);
    let overflow = null;
    try { bandLayout(S0, S0 + 29, { http: 1, cdp: 24 }); }
    catch (e) { overflow = e; }
    check('410 (i): bandLayout THROWS on layout overflow instead of silently '
      + 'escaping (the fix-qa1-p2 class)',
    /LAYOUT OVERFLOW|cannot host/.test(String(overflow?.message)),
    String(overflow?.message ?? 'no throw'));
    const wide = bandLayout(S0, S0 + 38, { http: 1, cdp: 24 });
    check('410 (i): a 39-wide band hosts the inventory — cdp(23) is in-band',
      wide.cdp(23) === S0 + 38);
    check('410 (i): an exactly-fitting default band still validates (cdp 15)',
      bandLayout(S0, S0 + 29, { http: 1, cdp: 15 }).cdp(14) === S0 + 29);
    // (ii) free registry: the narrow band is refused and WIDENED in place
    const r2 = runWrapped(`${S0}-${S0 + 29}`, stagedPath);
    check('410 (ii): run-gate REFUSES the narrow band and claims a widened '
      + 'one with citation',
    /REFUSING the narrow claim/.test(r2.stdout)
      && new RegExp(`claimed WIDENED port band ${S0}-${S0 + 38}.*GH-410`)
        .test(r2.stdout),
    `status=${r2.status}\n${r2.stdout}\n${r2.stderr}`);
    check('410 (ii): the staged suite\'s FULL inventory (CDP+23) fits the '
      + 'widened claim', r2.status === 0 && /fits=true/.test(r2.stdout),
    `status=${r2.status} ${/STAGED[^\n]*/.exec(r2.stdout)?.[0] ?? 'no STAGED line'}`);
    // (iii) a live neighbor above: the widening SLIDES instead of colliding
    const S1 = S0 + 200;
    const above = await holdClaim(S1 + 30, S1 + 120);
    check('410 (iii) setup: a foreign neighbor holds the up-extension', !!above);
    if (above) {
      try {
        const r3 = runWrapped(`${S1}-${S1 + 29}`, stagedPath);
        check('410 (iii): with the up-extension held, run-gate slides the '
          + 'widened claim (extended down) and the inventory still fits',
        r3.status === 0 && /extended down/.test(r3.stdout)
          && /fits=true/.test(r3.stdout),
        `status=${r3.status}\n${r3.stdout}\n${r3.stderr}`);
      } finally {
        try { above.kill('SIGKILL'); } catch { /* raced */ }
      }
    }
    // (iv) every candidate blocked: an honest EX_TEMPFAIL refusal, and the
    // suite is NEVER spawned onto a band it would escape
    // cleanup is UNCONDITIONAL (review r6 P2): a holder that claimed while
    // its sibling failed must still be reaped, never leaked to its failsafe
    const S2 = S0 + 400;
    let up = null;
    let down = null;
    try {
      // the blockers cover the FULL x8 slide family each side (GH-483
      // deepened the free-space search from x2 — need 40 → ±(8·40) around
      // the assigned band, plus the in-place extensions)
      up = await holdClaim(S2 + 30, S2 + 360);
      down = await holdClaim(S2 - 340, S2 - 1);
      check('410 (iv) setup: foreign neighbors hold BOTH sides', !!up && !!down);
      if (up && down) {
        const r4 = runWrapped(`${S2}-${S2 + 29}`, stagedPath);
        check('410 (iv): with every widening candidate blocked run-gate '
          + 'refuses honestly (EX_TEMPFAIL 75, GH-410 citation, suite never '
          + 'spawned)',
        r4.status === 75 && /no widened band is claimable/.test(r4.stderr)
          && /GH-410/.test(r4.stderr) && !/STAGED/.test(r4.stdout),
        `status=${r4.status}\n${r4.stdout}\n${r4.stderr}`);
      }
    } finally {
      // the widened blocker span overlaps arm (v)'s band, and a SIGKILLed
      // holder is a ZOMBIE until reaped — process.kill(pid, 0) still reads
      // it live, so its stale claim would refuse arm (v)'s honest claim
      // (review GH-483 r2 P1): await each holder's close (the kernel reap)
      // before the range is ever reused.
      for (const kid of [up, down]) {
        if (kid) {
          try { kid.kill('SIGKILL'); } catch { /* raced */ }
          await new Promise((res) => {
            if (kid.exitCode !== null || kid.signalCode !== null) return res();
            const t = setTimeout(res, 5000);
            kid.once('close', () => { clearTimeout(t); res(); });
          });
        }
      }
    }
    // (v) backward compat: an UNDECLARED suite keeps the pre-410 claim
    const S3 = S0 + 600;
    const r5 = runWrapped(`${S3}-${S3 + 29}`, legacyPath);
    check('410 (v): an undeclared suite claims its assigned band unchanged '
      + '(no widening, pre-410 behavior)',
    r5.status === 0 && new RegExp(`claimed port band ${S3}-${S3 + 29}`)
      .test(r5.stdout) && !/WIDENED/.test(r5.stdout),
    `status=${r5.status}\n${r5.stdout}\n${r5.stderr}`);
    // (vii)+(viii) EXPLICIT PIN coverage (review r1 P1): a pinned suite
    // derives its whole inventory from the PIN — a relocated claim must
    // still cover the pinned extents, or it is no candidate at all.
    const S4 = S0 + 800;
    const r6 = runWrapped(`${S4}-${S4 + 29}`, stagedPath,
      { OB_E2E_PORT: String(S4), OB_E2E_CDP_PORT: String(S4 + 15) });
    check('410 (vii): with pinned ports and a free registry the widened '
      + 'claim covers the pin extents and the pinned suite fits',
    r6.status === 0 && /claimed WIDENED port band/.test(r6.stdout)
      && /fits=true/.test(r6.stdout),
    `status=${r6.status}\n${r6.stdout}\n${r6.stderr}`);
    const S5 = S0 + 1000;
    const pinUp = await holdClaim(S5 + 30, S5 + 120);
    check('410 (viii) setup: a foreign neighbor blocks the only '
      + 'pin-covering widening', !!pinUp);
    if (pinUp) {
      try {
        const r7 = runWrapped(`${S5}-${S5 + 29}`, stagedPath,
          { OB_E2E_PORT: String(S5), OB_E2E_CDP_PORT: String(S5 + 15) });
        check('410 (viii): the pin HULL is the only candidate shape under '
          + 'pins (sliding away from a pin is never an option) — with the '
          + 'hull held by a neighbor the wrapper refuses honestly, citing '
          + 'the pins (never a silent escape through the pin)',
        r7.status === 75
          && /overlaps the LIVE foreign claim/.test(r7.stderr)
          && /move\/unset the explicit .*pins/.test(r7.stderr)
          && !/STAGED/.test(r7.stdout),
        `status=${r7.status}\n${r7.stdout}\n${r7.stderr}`);
      } finally {
        try { pinUp.kill('SIGKILL'); } catch { /* raced */ }
      }
    }
    // (ix) review r2 P1: an ALREADY-WIDE band with a pin deriving past its
    // end must still trigger the coverage claim — the wide-band path used
    // to skip pin validation entirely
    const S6 = S0 + 1200;
    const r8 = runWrapped(`${S6}-${S6 + 39}`, stagedPath,
      { OB_E2E_PORT: String(S6), OB_E2E_CDP_PORT: String(S6 + 17) });
    check('410 (ix): a wide-enough band whose explicit pin derives past its '
      + 'end still claims the covering pin hull (the wide-band path never '
      + 'skips pin validation)',
    r8.status === 0 && /derive OUTSIDE the assigned/.test(r8.stdout)
      && /claimed WIDENED port band/.test(r8.stdout)
      && /fits=true/.test(r8.stdout),
    `status=${r8.status}\n${r8.stdout}\n${r8.stderr}`);
    // (x) review r3 P2: an ONLY-CDP pin below the band would put the naive
    // hull candidate's derived http(0) exactly on the pinned CDP port —
    // HTTP and Chrome sharing a socket. The wrapper must NEVER accept a
    // self-colliding claim: either a candidate whose derived http(0) is
    // off the pinned extent wins (the padded-down hull), or it refuses.
    const S7 = S0 + 1400;
    const r9 = runWrapped(`${S7 + 100}-${S7 + 129}`, stagedPath,
      { OB_E2E_CDP_PORT: String(S7) });
    const claimed9 = /claimed WIDENED port band (\d+)-\d+/.exec(r9.stdout);
    const start9 = claimed9 ? Number(claimed9[1]) : null;
    check('410 (x): an only-CDP pin below the band never yields a '
      + 'SELF-COLLIDING claim — the accepted hull keeps the derived http(0) '
      + 'off the pinned CDP ports (or the wrapper refuses honestly)',
    (r9.status === 0 && start9 !== null
      && !(start9 >= S7 && start9 <= S7 + 23) && /fits=true/.test(r9.stdout))
      || (r9.status === 75
        && /collides with the explicit OB_E2E_CDP_PORT pin/.test(r9.stderr)),
    `status=${r9.status} claimedStart=${start9} pin=${S7}\n${r9.stdout}\n${r9.stderr}`);
    // (xvii) review r19 P2: OVERLAPPING explicit pins (http and cdp
    // derivations sharing sockets) are refused before any claim work
    {
      const S15 = S0 + 2600;
      const r12 = runWrapped(`${S15}-${S15 + 29}`, stagedPath,
        { OB_E2E_PORT: String(S15), OB_E2E_CDP_PORT: String(S15) });
      check('410 (xvii): overlapping explicit pins are refused — an HTTP '
        + 'endpoint and a CDP endpoint can never share sockets',
      r12.status === 75 && /overlap the OB_E2E_CDP_PORT pin/.test(r12.stderr)
        && !/STAGED/.test(r12.stdout),
      `status=${r12.status}\n${r12.stdout}\n${r12.stderr}`);
    }
    // (xi) review r5 P2: a REVERSED assigned band must be refused at the
    // argv seam — the widening path derives candidates from it before any
    // claimPortBand validation would fire
    const r10 = runWrapped(`${S0 + 129}-${S0 + 100}`, stagedPath);
    check('410 (xi): a reversed --band range is refused at the argv seam '
      + '(the widening path never normalizes it into a claim)',
    r10.status === 2 && /not a valid range/.test(r10.stderr)
      && !/STAGED|claimed/.test(r10.stdout),
    `status=${r10.status}\n${r10.stdout}\n${r10.stderr}`);
    // (xii) the RUNTIME escape law (GH-410; lane V's PR #418 evidence): a
    // banded suite whose derivation leaves its own claim must get ONE
    // honest launch-time diagnosis naming the lane's claims and the
    // PORT_INVENTORY cure — pre-410 an unclaimed landing was SILENT
    // (xii-a red: 'no-throw') and a claimed-neighbor landing died with the
    // misleading claim-your-own-band foreign message (xii-b red).
    {
      const S8 = S0 + 1600;
      // an ENFORCED claim (declared inventory) — the arming precondition
      // (review r9 P1: un-enforced claims stay pre-410)
      const bandHolder = await holdClaim(S8, S8 + 29,
        ', { inventory: { http: 1, cdp: 15 } }');
      check('410 (xii) setup: a lane holder owns the staged band', !!bandHolder);
      if (bandHolder) {
        let neighbor = null;
        try {
          const probeEscape = () => spawnSync(process.execPath,
            ['--input-type=module', '-e', `
              const { assertPortOutsideForeignBands } =
                await import(${JSON.stringify(cdpPath)});
              try {
                assertPortOutsideForeignBands(${S8 + 39}, 'CDP port');
                console.log('no-throw');
              } catch (e) { console.log('threw: ' + e.message.split(String.fromCharCode(10))[0]); }
            `], { encoding: 'utf8', timeout: 20000,
              env: { ...gateEnv(),
                OB_PORT_BANDS: `${S8}-${S8 + 29}.${bandHolder.pid}` } });
          const xa = probeEscape();
          check('410 (xii-a): an offset escaping the lane\'s OWN claim onto '
            + 'an UNCLAIMED port throws the honest ESCAPE diagnosis '
            + '(pre-410: silent)',
          /threw: .*ESCAPES this lane's claimed band/.test(xa.stdout)
            && /PORT_INVENTORY/.test(xa.stdout), xa.stdout.trim());
          neighbor = await holdClaim(S8 + 30, S8 + 59);
          check('410 (xii-b) setup: a live neighbor owns the escape landing',
            !!neighbor);
          if (neighbor) {
            const xb = probeEscape();
            check('410 (xii-b): an escape landing on a CLAIMED neighbor '
              + 'names BOTH truths — the lane\'s own outgrown claim AND the '
              + 'foreign band — never the misleading claim-your-own-band '
              + 'crash alone (PR #418\'s uncaught mid-battery kill)',
            /threw: .*ESCAPES this lane's claimed band/.test(xb.stdout)
              && /foreign port band/.test(xb.stdout), xb.stdout.trim());
          }
        } finally {
          for (const kid of [bandHolder, neighbor]) {
            if (kid) { try { kid.kill('SIGKILL'); } catch { /* raced */ } }
          }
        }
      }
    }
    // (xiii) review r7 P1: a PURE RESERVATION (layout:false — the
    // scenario-batch single-port CDP hold) must NOT arm the escape law:
    // its render child legitimately binds sibling endpoints elsewhere
    {
      const S11 = S0 + 1800;
      const resHolder = await holdClaim(S11, S11, ', { layout: false }');
      check('410 (xiii) setup: a reservation holder owns one port', !!resHolder);
      if (resHolder) {
        try {
          const xr = spawnSync(process.execPath, ['--input-type=module', '-e', `
            const { assertPortOutsideForeignBands } =
              await import(${JSON.stringify(cdpPath)});
            try {
              assertPortOutsideForeignBands(${S11 + 5}, 'http port');
              console.log('no-throw');
            } catch (e) { console.log('threw: ' + e.message.split(String.fromCharCode(10))[0]); }
          `], { encoding: 'utf8', timeout: 20000,
            env: { ...gateEnv(), OB_PORT_BANDS: `${S11}-${S11}.${resHolder.pid}` } });
          check('410 (xiii): a pure reservation (layout:false) never makes '
            + 'a sibling endpoint read as an escape (the scenario-batch '
            + 'render pattern stays legal)',
          /no-throw/.test(xr.stdout), xr.stdout.trim());
          // (xiii-b) review r8 P1: under an ARMED law (a layout claim in
          // the lineage) a pure reservation still AUTHORIZES the ports it
          // covers — run-gate's canary probe pair beside the lane band is
          // exactly this shape — while a port outside BOTH still escapes
          const layoutHolder = await holdClaim(S11 + 40, S11 + 69,
            ', { inventory: { http: 1, cdp: 15 } }');
          check('410 (xiii-b) setup: a layout holder arms the law',
            !!layoutHolder);
          if (layoutHolder) {
            try {
              const probeBoth = (port) => spawnSync(process.execPath,
                ['--input-type=module', '-e', `
                const { assertPortOutsideForeignBands } =
                  await import(${JSON.stringify(cdpPath)});
                try {
                  assertPortOutsideForeignBands(${port}, 'http port');
                  console.log('no-throw');
                } catch (e) { console.log('threw: ' + e.message.split(String.fromCharCode(10))[0]); }
              `], { encoding: 'utf8', timeout: 20000,
                  env: { ...gateEnv(),
                    OB_PORT_BANDS: `${S11}-${S11}.${resHolder.pid},`
                    + `${S11 + 40}-${S11 + 69}.${layoutHolder.pid}` } });
              const xb1 = probeBoth(S11); // inside the pure reservation
              const xb2 = probeBoth(S11 + 90); // outside everything
              check('410 (xiii-b): with the law ARMED, a port inside an own '
                + 'pure reservation is AUTHORIZED (the run-gate canary '
                + 'probe shape) while a port outside every own claim still '
                + 'escapes',
              /no-throw/.test(xb1.stdout)
                && /threw: .*ESCAPES this lane's claimed band/.test(xb2.stdout),
              `in-reservation: ${xb1.stdout.trim()} | outside: ${xb2.stdout.trim()}`);
            } finally {
              try { layoutHolder.kill('SIGKILL'); } catch { /* raced */ }
            }
          }
        } finally {
          try { resHolder.kill('SIGKILL'); } catch { /* raced */ }
        }
      }
    }
    // (xv) review r9 P1: an UN-ENFORCED band claim (an undeclared suite —
    // hard-coded-port legacy gates — wrapped onto a band) never arms the
    // escape law: pre-410 wrappability is preserved verbatim
    {
      const S13 = S0 + 2200;
      const plainHolder = await holdClaim(S13, S13 + 29); // no inventory
      check('410 (xv) setup: a plain (un-enforced) band holder', !!plainHolder);
      if (plainHolder) {
        try {
          const xv = spawnSync(process.execPath, ['--input-type=module', '-e', `
            const { assertPortOutsideForeignBands } =
              await import(${JSON.stringify(cdpPath)});
            try {
              assertPortOutsideForeignBands(${S13 + 200}, 'CDP port');
              console.log('no-throw');
            } catch (e) { console.log('threw: ' + e.message.split(String.fromCharCode(10))[0]); }
          `], { encoding: 'utf8', timeout: 20000,
            env: { ...gateEnv(),
              OB_PORT_BANDS: `${S13}-${S13 + 29}.${plainHolder.pid}` } });
          check('410 (xv): an UN-ENFORCED band claim (undeclared suite) '
            + 'never arms the escape law — hard-coded-port legacy gates '
            + 'stay wrappable exactly as pre-410',
          /no-throw/.test(xv.stdout), xv.stdout.trim());
        } finally {
          try { plainHolder.kill('SIGKILL'); } catch { /* raced */ }
        }
      }
    }
    // (xvi) review r10 P2: a same-range re-claim with INCOMPATIBLE options
    // is refused — a bare hold must never silently ride (or disarm) an
    // inventory caller's enforcement metadata; same-option repeats keep
    // the reference-counted reuse. Runs in a CHILD against the PRIVATE
    // registry (review r11 P2: an unguarded host-global claim here would
    // abort the suite whenever a concurrent lane holds the range).
    {
      const S14 = S0 + 2400;
      const xvi = spawnSync(process.execPath, ['--input-type=module', '-e', `
        const { claimPortBand } = await import(process.argv[1]);
        const S = Number(process.argv[2]);
        const plain = await claimPortBand(S, S + 29);
        const again = await claimPortBand(S, S + 29); // same opts: fine
        again.release();
        try {
          await claimPortBand(S, S + 29, { inventory: { http: 1, cdp: 15 } });
          console.log('no-throw');
        } catch (e) { console.log('threw: ' + e.message.split(String.fromCharCode(10))[0]); }
        plain.release();
      `, cdpPath, String(S14)],
      { encoding: 'utf8', timeout: 20000, env: gateEnv() });
      check('410 (xvi): a held range REFUSES a re-claim with incompatible '
        + 'enforcement (same-option repeats stay reference-counted)',
      /threw: .*incompatible options/.test(xvi.stdout),
      `${xvi.stdout.trim()} ${xvi.stderr.trim()}`.trim());
    }
    // (xiv) review r7 P2: a CLI `--port N` in the wrapped command is a pin
    // (the suites' argOf('--port') outranks OB_E2E_PORT) — the widened
    // claim must cover it, or the suite's first bind escapes
    {
      const S12 = S0 + 2000;
      const r11 = spawnSync(process.execPath,
        [runGate, '--band', `${S12 + 100}-${S12 + 129}`, '--no-canary',
          '--no-belt', '--', stagedPath, '--port', String(S12)],
        { encoding: 'utf8', timeout: 90000, cwd: WEB_DIR, env: gateEnv() });
      const cl = /claimed WIDENED port band (\d+)-(\d+)/.exec(r11.stdout);
      check('410 (xiv): a CLI --port override is a PIN — the widened claim '
        + 'covers it and the suite fits',
      r11.status === 0 && cl !== null && Number(cl[1]) <= S12
        && S12 <= Number(cl[2]) && /fits=true/.test(r11.stdout),
      `status=${r11.status} claimed=${cl?.[0]}\n${r11.stdout}\n${r11.stderr}`);
    }
    // (vi) the inventory AUDIT: no env-banded suite's static derivations
    // may outgrow the default band without a covering declaration — the
    // next #305-style growth reds HERE, not in a foreign lane's turf.
    // (Scoped to suites deriving off an OB_E2E_CDP_PORT-fed const; the
    // bandless PORT+1100 convention pair predates bands and is out of the
    // GH-410 scope.)
    const drifts = [];
    for (const name of fs.readdirSync(path.join(WEB_DIR, 'tools'))
      .filter((n) => /^e2e.*\.mjs$/.test(n)
        // the auditor itself is excluded: this file STAGES declaration
        // fixtures and quotes derivations verbatim in prose, so a text
        // scan self-trips; its real inventory (+10 max, well inside the
        // default band) is exercised by its own arms every run
        && n !== 'e2e-harness-hygiene.mjs')) {
      const text = fs.readFileSync(path.join(WEB_DIR, 'tools', name), 'utf8');
      const cdpConst = /const (\w+) = Number\(.*?process\.env\.OB_E2E_CDP_PORT/
        .exec(text)?.[1];
      if (!cdpConst) continue; // not the env-banded convention
      const httpConst = /const (\w+) = Number\(.*?process\.env\.OB_E2E_PORT\b/
        .exec(text)?.[1];
      const maxOff = (c) => {
        if (!c) return 0;
        let mx = 0;
        for (const m of text.matchAll(
          new RegExp(`\\b${c}\\s*\\+\\s*(\\d+)\\b`, 'g'))) {
          mx = Math.max(mx, Number(m[1]));
        }
        return mx;
      };
      const needCdp = maxOff(cdpConst) + 1;
      const needHttp = maxOff(httpConst) + 1;
      let decl = null;
      try { decl = parsePortInventory(text); } catch {
        drifts.push(`${name}: malformed PORT_INVENTORY`);
        continue;
      }
      if (decl && (decl.cdp < needCdp || decl.http < needHttp)) {
        drifts.push(`${name}: PORT_INVENTORY undercounts (declares http `
          + `${decl.http} + cdp ${decl.cdp}, derives http ${needHttp} + cdp `
          + `${needCdp})`);
      } else if (!decl
        && (needCdp > BAND_CDP_OFFSET || needHttp > BAND_CDP_OFFSET)) {
        drifts.push(`${name}: derives http ${needHttp} + cdp ${needCdp} `
          + 'beyond the default 30-wide band with NO PORT_INVENTORY');
      }
    }
    check('410 (vi): inventory audit — every env-banded suite fits the '
      + 'default band or declares a covering PORT_INVENTORY',
    drifts.length === 0, drifts.join('; '));
    // (vi-b) the ONE known NESTED derivation the source-only audit cannot
    // see (review r8 P1): record.mjs's CDP fallback is the ABSOLUTE
    // 9243+(port-8000), which escapes any claimed band — every nested
    // record.mjs spawn in e2e-record must pin OB_CDP_PORT in-band.
    {
      const recSrc = fs.readFileSync(
        path.join(WEB_DIR, 'tools', 'e2e-record.mjs'), 'utf8');
      const heads = [...recSrc.matchAll(
        /spawnSync\('node', \[path\.join\(toolsDir, 'record\.mjs'\)/g)];
      check('410 (vi-b): every nested record.mjs spawn pins OB_CDP_PORT '
        + '(review r8 — the 9243+(port-8000) fallback escapes any band)',
      heads.length >= 2 && heads.every((h) =>
        recSrc.slice(h.index, h.index + 500).includes('OB_CDP_PORT')),
      `${heads.length} spawn head(s)`);
    }
  } finally {
    fs.rmSync(REG, { recursive: true, force: true });
    fs.rmSync(LDG, { recursive: true, force: true });
    fs.rmSync(stage, { recursive: true, force: true });
  }
}

// ---- arm 8e: the GH-483 widening-escape law (lineage never licenses overlap) ----
// The build-18 incident: run-gate's GH-410 hull widening extended 9330-9359
// to 9330-9369 OVER the live 9360-9389 neighbor claim — claimPortBand's
// overlap scan exempts claims the OB_PORT_BANDS lineage carries (bandIsOwn),
// and an inherited entry is an unverifiable pid-only hand-me-down, so the
// widened hull parked on the neighbor's turf without a word while the
// victim lane's own claims then failed for the whole suite lifetime. The
// law now (GH-483): an inherited entry authorizes USING that exact claim,
// never a NEW overlapping one — run-gate claims with lineageOverlap
// 'refuse', a candidate intersecting ANY live claim SLIDES to free space,
// and when no candidate is claimable (pins anchor the hull) the wrapper
// fails LOUDLY (EX_TEMPFAIL) naming the lineage law. Staged like the 410
// arm: a PRIVATE registry, fake live claims held by real child processes,
// a contaminated OB_PORT_BANDS in the gate's env.
// PRE-FIX RED: (i) the gate claims the hull straight over the live
// lineage-carried claim (status 0, overlapping range); (ii) same under
// pins — a silent status-0 overlap instead of the honest 75; (iii) the
// claim-time law itself (claimPortBand refuses the partial lineage
// overlap) throws nothing.
{
  const { spawn } = await import('node:child_process');
  const cdpPath = path.join(WEB_DIR, 'tools', 'cdp.mjs');
  const runGate = path.join(WEB_DIR, 'tools', 'run-gate.mjs');
  const REG = `/tmp/ob-port-bands-hygiene-483-${process.pid}`;
  const LDG = fs.mkdtempSync('/tmp/obw-hygiene-483-ledger-');
  const stage = fs.mkdtempSync('/tmp/obw-hygiene-483-suite-');
  fs.rmSync(REG, { recursive: true, force: true });
  const stagedPath = path.join(stage, 'staged-inventory.mjs');
  fs.writeFileSync(stagedPath, [
    "export const PORT_FLAGS = { '--port': 'http' };", // GH-687 review r10: the staged suite says what its --port means (arm (xiv) passes one)
    'export const PORT_INVENTORY = { http: 1, cdp: 25 };',
    "console.log('STAGED PASS http=' + process.env.OB_E2E_PORT",
    "  + ' cdp=' + process.env.OB_E2E_CDP_PORT);",
    'process.exit(0);',
  ].join('\n'));
  const gateEnv = (extra = {}) => {
    const env = { ...process.env, OB_PORT_BANDS: '', OB_PORT_BANDS_DIR: REG,
      OB_GATE_LEDGER_DIR: LDG, ...extra };
    if (!('OB_E2E_PORT' in extra)) delete env.OB_E2E_PORT;
    if (!('OB_E2E_CDP_PORT' in extra)) delete env.OB_E2E_CDP_PORT;
    delete env.OB_GATE_RTT_P50_MS;
    delete env.OB_GATE_RTT_FILE;
    return env;
  };
  const holdClaim = async (s, e) => {
    const kid = spawn(process.execPath, ['--input-type=module', '-e', `
      const { claimPortBand } = await import(${JSON.stringify(cdpPath)});
      await claimPortBand(${s}, ${e});
      console.log('claimed');
      setInterval(() => {}, 1000); // hold until killed
      setTimeout(() => process.exit(0), 120000); // orphan failsafe
    `], { stdio: ['ignore', 'pipe', 'ignore'], env: gateEnv() });
    const ok = await new Promise((res) => {
      const t = setTimeout(() => res(false), 10000);
      kid.stdout.on('data', (d) => {
        if (String(d).includes('claimed')) { clearTimeout(t); res(true); }
      });
      kid.once('exit', () => { clearTimeout(t); res(false); });
    });
    return ok ? kid : (kid.kill('SIGKILL'), null);
  };
  const runWrapped = (bandStr, extraEnv = {}) => spawnSync(
    process.execPath,
    [runGate, '--band', bandStr, '--no-canary', '--no-belt', '--', stagedPath],
    { encoding: 'utf8', timeout: 90000, cwd: WEB_DIR, env: gateEnv(extraEnv) });
  // pid-scattered base: only the registry mutex (47997) is real and shared —
  // the private registry keeps every claim fake and no staged suite binds
  const S = 56000 + ((process.pid * 53) % 1200);
  try {
    // (i) the incident shape, two fake live claims: the neighbor band above
    // rides the gate's OB_PORT_BANDS (the contaminated hand-me-down), a
    // second foreign claim blocks the down-extension — the widening must
    // SLIDE to free space, never park on either
    let above = null;
    let below = null;
    try {
      // cleanup is UNCONDITIONAL (review GH-483 r1 P2: a holder that
      // claimed while its sibling failed must still be reaped, never
      // leaked to its 120 s failsafe — the arm-iv precedent)
      above = await holdClaim(S + 30, S + 59);
      below = await holdClaim(S - 40, S - 1);
      check('483 (i) setup: fake live claims hold the neighbor band and the '
        + 'down-extension', !!above && !!below);
      if (above && below) {
        const r1 = runWrapped(`${S}-${S + 29}`,
          { OB_PORT_BANDS: `${S + 30}-${S + 59}.${above.pid}` });
        const cl = /claimed WIDENED port band (\d+)-(\d+)/.exec(r1.stdout);
        const disjoint = cl !== null
          && !(Number(cl[1]) <= S + 59 && S + 30 <= Number(cl[2]))
          && !(Number(cl[1]) <= S - 1 && S - 40 <= Number(cl[2]));
        check('483 (i): a lineage-carried live claim never hosts the widened '
          + 'hull — the claim SLIDES to free space past both live claims',
        r1.status === 0 && disjoint && /STAGED PASS/.test(r1.stdout),
        `status=${r1.status} claimed=${cl?.[0] ?? 'none'}\n${r1.stdout}\n${r1.stderr}`);
      }
    } finally {
      for (const kid of [above, below]) {
        if (kid) { try { kid.kill('SIGKILL'); } catch { /* raced */ } }
      }
    }
    // (ii) the pins twin: explicit pins anchor the hull ON the
    // lineage-carried claim — sliding away from a pin is never an option,
    // so the wrapper must refuse LOUDLY (75), never overlap in silence
    const S2 = S + 200;
    const pinAbove = await holdClaim(S2 + 30, S2 + 59);
    check('483 (ii) setup: a fake live claim holds the pin hull', !!pinAbove);
    if (pinAbove) {
      try {
        const r2 = runWrapped(`${S2}-${S2 + 29}`, {
          OB_PORT_BANDS: `${S2 + 30}-${S2 + 59}.${pinAbove.pid}`,
          OB_E2E_PORT: String(S2), OB_E2E_CDP_PORT: String(S2 + 15) });
        check('483 (ii): with pins anchoring the hull on the lineage-carried '
          + 'claim the wrapper fails LOUDLY (EX_TEMPFAIL, GH-483 lineage law '
          + 'named, suite never spawned) — never a silent overlap',
        r2.status === 75 && /GH-483/.test(r2.stderr)
          && /OB_PORT_BANDS lineage/.test(r2.stderr)
          && !/STAGED/.test(r2.stdout),
        `status=${r2.status}\n${r2.stdout}\n${r2.stderr}`);
      } finally {
        try { pinAbove.kill('SIGKILL'); } catch { /* raced */ }
      }
    }
    // (iii) the claim-time law, pure: under lineageOverlap 'refuse' a
    // PARTIAL overlap with a lineage-carried live claim throws GH-483, the
    // EXACT same range stays claimable (the idempotent nested-wrapper
    // pattern), and the default posture stays pre-483-permissive for
    // non-run-gate claimants
    const S3 = S + 400;
    const holder3 = await holdClaim(S3, S3 + 29);
    check('483 (iii) setup: a fake live claim backs the claim-time law probe',
      !!holder3);
    if (holder3) {
      try {
        const r3 = spawnSync(process.execPath, ['--input-type=module', '-e', `
          const { claimPortBand } = await import(process.argv[1]);
          const S3 = Number(process.argv[2]);
          try {
            await claimPortBand(S3 + 10, S3 + 49, { lineageOverlap: 'refuse' });
            console.log('partial: no-throw');
          } catch (e) {
            console.log('partial threw: ' + e.message.split(String.fromCharCode(10))[0]);
          }
          const exact = await claimPortBand(S3, S3 + 29, { lineageOverlap: 'refuse' });
          console.log('exact: claimed');
          exact.release();
          const legacy = await claimPortBand(S3 + 10, S3 + 49);
          console.log('legacy: claimed');
          legacy.release();
        `, cdpPath, String(S3)],
        { encoding: 'utf8', timeout: 20000,
          env: gateEnv({ OB_PORT_BANDS: `${S3}-${S3 + 29}.${holder3.pid}` }) });
        check('483 (iii): lineageOverlap \'refuse\' throws GH-483 on the '
          + 'partial overlap, permits the exact-range re-claim, and the '
          + 'default stays pre-483 for non-run-gate claimants',
        /partial threw: .*GH-483/.test(r3.stdout)
          && /exact: claimed/.test(r3.stdout)
          && /legacy: claimed/.test(r3.stdout),
        `${r3.stdout.trim()} ${r3.stderr.trim()}`.trim());
      } finally {
        try { holder3.kill('SIGKILL'); } catch { /* raced */ }
      }
    }
  } finally {
    fs.rmSync(REG, { recursive: true, force: true });
    fs.rmSync(LDG, { recursive: true, force: true });
    fs.rmSync(stage, { recursive: true, force: true });
  }
}

// ---- arm 8d: preflight starvation vs wrong-tree (GH-410 red-proofs) -------------
// Lane T's build-17 kills: under syspolicyd storms the GH-248 preflight's
// FIXED 2 s attempt window read a healthy-but-I/O-starved server as dead
// and killed runs with a tree diagnosis it had no response evidence for.
// The law now: attempt windows ESCALATE (storm-aware via the GH-347 canary
// hand-me-down), a timeout alone NEVER produces a tree verdict (bounded
// starvation cap + starvation diagnosis), and tree verdicts stay
// evidence-based and prompt. Fixtures are in-process node servers on this
// arm's own ports — no python, nothing to reap.
// PRE-FIX RED: (a) throws '…never bound…' after 15 s (the starved kill),
// (c) dies with the same tree-flavored verdict instead of the starvation
// diagnosis, (d) throws like (a) despite the canary hint.
{
  const nodeHttp = await import('node:http');
  const { preflightServedTree } = await import('./cdp.mjs');
  const listen = (srv, port) => new Promise((res, rej) => {
    srv.once('error', rej);
    srv.listen(port, '127.0.0.1', () => res(srv));
  });
  const fileServer = (root, delayMs) => nodeHttp.createServer((req, resp) => {
    setTimeout(() => {
      let body = null;
      try {
        const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        const f = path.join(root, rel);
        if (fs.statSync(f).isFile()) body = fs.readFileSync(f);
      } catch { /* 404 below */ }
      resp.statusCode = body ? 200 : 404;
      resp.end(body ?? 'absent');
    }, delayMs);
  });
  const saved = {
    budget: process.env.OB_CDP_PREFLIGHT_MS,
    skip: process.env.OB_SKIP_TREE_PREFLIGHT,
    rttEnv: process.env.OB_GATE_RTT_P50_MS,
    rttFile: process.env.OB_GATE_RTT_FILE,
  };
  const clearEnv = () => {
    delete process.env.OB_CDP_PREFLIGHT_MS;
    delete process.env.OB_SKIP_TREE_PREFLIGHT;
    delete process.env.OB_GATE_RTT_P50_MS;
    delete process.env.OB_GATE_RTT_FILE;
  };
  const wrongTree = fs.mkdtempSync('/tmp/obw-hygiene-410-tree-');
  fs.writeFileSync(path.join(wrongTree, 'app.html'),
    '<!doctype html><title>the WRONG tree</title>');
  fs.mkdirSync(path.join(wrongTree, 'tools', 'render'), { recursive: true });
  fs.writeFileSync(path.join(wrongTree, 'tools', 'render', 'grade.json'),
    '{"planted": true}');
  const rttHint = path.join(wrongTree, 'rtt.json'); // reused tmp home
  try {
    clearEnv();
    // (a) an I/O-starved server serving the RIGHT tree: every response is
    // delayed past the pre-410 fixed 2 s window — the preflight must WAIT
    // IT OUT and succeed (pre-fix: dies at 15 s with 'never bound')
    const starved = await listen(fileServer(WEB_DIR, 3000), PORT + 5);
    let aErr = null;
    const aT0 = Date.now();
    try {
      await preflightServedTree(`http://127.0.0.1:${PORT + 5}/app.html?seed=1`);
    } catch (e) { aErr = e; }
    check('preflight (a): an I/O-starved server serving the RIGHT tree is '
      + 'waited out and PASSES (no kill)', aErr === null,
    String(aErr?.message ?? '') + ` after ${Date.now() - aT0} ms`);
    // (a2) review r20: a LATE first success (past the base budget) must not
    // collapse the deadline mid-probes — the healthy-but-deeply-starved
    // right tree still passes. app.html requests 1-4 are black-holed
    // (deterministic timeouts walking the ladder past 15 s), then every
    // response arrives 3 s delayed.
    let a2App = 0;
    const lateHeld = [];
    const late = await listen(nodeHttp.createServer((req, resp) => {
      const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (pathname === '/app.html') {
        a2App += 1;
        if (a2App <= 4) { lateHeld.push(req); return; } // guaranteed timeouts
      }
      setTimeout(() => {
        let body = null;
        try {
          const f = path.join(WEB_DIR, pathname);
          if (fs.statSync(f).isFile()) body = fs.readFileSync(f);
        } catch { /* 404 below */ }
        resp.statusCode = body ? 200 : 404;
        resp.end(body ?? 'absent');
      }, 3000);
    }), PORT + 13);
    let a2Err = null;
    const a2T0 = Date.now();
    try {
      await preflightServedTree(`http://127.0.0.1:${PORT + 13}/app.html?seed=1`);
    } catch (e) { a2Err = e; }
    check('preflight (a2): a LATE first success never collapses the '
      + 'deadline mid-probes — the deeply-starved right tree still PASSES '
      + '(progress floors the runway)',
    a2Err === null,
    String(a2Err?.message ?? '').split('\n')[0]
      + ` after ${Date.now() - a2T0} ms`);
    for (const r of lateHeld) { try { r.socket.destroy(); } catch { /* gone */ } }
    late.closeAllConnections?.();
    await new Promise((res) => late.close(res));
    // (d) the GH-347 canary hand-me-down: a storm verdict (p50 400 ms via
    // OB_GATE_RTT_FILE) widens the FIRST window past the delay — same
    // starved server, no escalation needed, still a pass
    fs.writeFileSync(rttHint, JSON.stringify({ p50: 400, at: Date.now() }));
    process.env.OB_GATE_RTT_FILE = rttHint;
    let dErr = null;
    try {
      await preflightServedTree(`http://127.0.0.1:${PORT + 5}/app.html?seed=1`);
    } catch (e) { dErr = e; }
    delete process.env.OB_GATE_RTT_FILE;
    check('preflight (d): the CDP-RTT canary hand-me-down (OB_GATE_RTT_FILE '
      + 'storm verdict) scales the windows and the starved boot still '
      + 'PASSES', dErr === null, String(dErr?.message ?? ''));
    starved.closeAllConnections?.();
    await new Promise((res) => starved.close(res));
    // (b) a genuinely WRONG tree that answers TIMELY is still refused
    // promptly, on response evidence — never slowed by the starvation law
    const wrong = await listen(fileServer(wrongTree, 0), PORT + 6);
    let bErr = null;
    const bT0 = Date.now();
    try {
      await preflightServedTree(`http://127.0.0.1:${PORT + 6}/app.html?seed=1`);
    } catch (e) { bErr = e; }
    const bMs = Date.now() - bT0;
    check('preflight (b): a genuinely wrong tree is still refused PROMPTLY '
      + 'on response evidence',
    bErr !== null && /ANOTHER tree|differs from (this checkout|the requested tree)/.test(
      String(bErr?.message)) && bMs < 12000,
    `${bMs} ms — ${String(bErr?.message ?? 'no throw').split('\n')[0]}`);
    wrong.closeAllConnections?.();
    await new Promise((res) => wrong.close(res));
    // (c) a listener that ACCEPTS and never answers: a timeout alone must
    // NEVER produce a tree verdict — the terminal diagnosis names the
    // starved host, not the tree (explicit budget keeps this arm bounded)
    const black = await listen(nodeHttp.createServer(() => { /* hold */ }),
      PORT + 7);
    process.env.OB_CDP_PREFLIGHT_MS = '6000';
    let cErr = null;
    const cT0 = Date.now();
    try {
      await preflightServedTree(`http://127.0.0.1:${PORT + 7}/app.html?seed=1`);
    } catch (e) { cErr = e; }
    const cMs = Date.now() - cT0;
    delete process.env.OB_CDP_PREFLIGHT_MS;
    check('preflight (c): a timeout alone NEVER yields a tree verdict — the '
      + 'diagnosis names the starved host',
    cErr !== null && /I\/O-STARVED/.test(String(cErr?.message))
      && /NOT a tree verdict/i.test(String(cErr?.message))
      && !/never bound|died under us|ANOTHER tree/.test(String(cErr?.message)),
    String(cErr?.message ?? 'no throw').split('\n')[0]);
    // review r1 P2: an EXPLICIT budget is a ceiling — escalated windows are
    // clamped to the remaining deadline, so the verdict lands within about
    // one clamped attempt of the 6 s budget, never at 2x+
    check('preflight (c2): the explicit budget is honored — escalated '
      + 'windows clamp to the remaining deadline',
    cErr !== null && cMs < 10000, `${cMs} ms`);
    // (c3) review r17: a storm-scaled base window LARGER than the whole
    // budget must still mark a starved listener — every attempt is
    // clamped, and a clamped timeout on a target with NO other evidence
    // IS the starvation verdict, never 'never bound'. Reuses (c)'s
    // still-open black-hole listener.
    process.env.OB_CDP_PREFLIGHT_MS = '4000';
    process.env.OB_GATE_RTT_P50_MS = '400'; // base window 8 s > 4 s budget
    let c3Err = null;
    try {
      await preflightServedTree(`http://127.0.0.1:${PORT + 7}/app.html?seed=1`);
    } catch (e) { c3Err = e; }
    delete process.env.OB_CDP_PREFLIGHT_MS;
    delete process.env.OB_GATE_RTT_P50_MS;
    check('preflight (c3): all-clamped attempts (scaled window > budget) '
      + 'still yield the STARVED verdict on a silent listener, never '
      + '\'never bound\'',
    c3Err !== null && /I\/O-STARVED/.test(String(c3Err?.message))
      && !/never bound/.test(String(c3Err?.message)),
    String(c3Err?.message ?? 'no throw').split('\n')[0]);
    // (e) the LAUNDER case (review r1 P1): one mount black-holed, the other
    // answering a FAST 404 — the 404 must not launder the unresolved
    // starvation question into a wrong-tree verdict
    const mixed = await listen(nodeHttp.createServer((req, resp) => {
      if (req.url.startsWith('/app.html')) return; // black-hole this mount
      resp.statusCode = 404;
      resp.end('absent');
    }), PORT + 7 + 1);
    process.env.OB_CDP_PREFLIGHT_MS = '6000';
    let eErr = null;
    try {
      await preflightServedTree(`http://127.0.0.1:${PORT + 8}/app.html?seed=1`);
    } catch (e) { eErr = e; }
    delete process.env.OB_CDP_PREFLIGHT_MS;
    check('preflight (e): a fast 404 on one mount does NOT launder an '
      + 'unresolved starvation on another into a wrong-tree verdict',
    eErr !== null && /I\/O-STARVED/.test(String(eErr?.message))
      && !/NOT serving an app tree/.test(String(eErr?.message)),
    String(eErr?.message ?? 'no throw').split('\n')[0]);
    mixed.closeAllConnections?.();
    await new Promise((res) => mixed.close(res));
    black.closeAllConnections?.();
    await new Promise((res) => black.close(res));
    // (f) the 200-launder case (review r2 P2, the split-listener shadow):
    // the boot URL's OWN mount is starved while ANOTHER mount answers a
    // healthy 200 — committing to the 200 would judge the wrong listener,
    // so the verdict must stay with the starved host
    const shadow = await listen(nodeHttp.createServer((req, resp) => {
      if (req.url.startsWith('/web/')) {
        let body = null;
        try {
          const rel = decodeURIComponent(
            new URL(req.url, 'http://x').pathname).slice(4);
          const f = path.join(WEB_DIR, rel);
          if (fs.statSync(f).isFile()) body = fs.readFileSync(f);
        } catch { /* 404 below */ }
        resp.statusCode = body ? 200 : 404;
        resp.end(body ?? 'absent');
        return;
      }
      /* black-hole the boot mount */
    }), PORT + 9);
    process.env.OB_CDP_PREFLIGHT_MS = '6000';
    let fErr = null;
    try {
      await preflightServedTree(`http://127.0.0.1:${PORT + 9}/app.html?seed=1`);
    } catch (e) { fErr = e; }
    delete process.env.OB_CDP_PREFLIGHT_MS;
    check('preflight (f): a healthy 200 on a LOWER-priority mount never '
      + 'launders the boot mount\'s starvation — the starved host is named, '
      + 'the foreign listener is never judged in its place',
    fErr !== null && /I\/O-STARVED/.test(String(fErr?.message))
      && !/NOT serving an app tree|differs from (this checkout|the requested tree)/.test(
        String(fErr?.message)),
    String(fErr?.message ?? 'no throw (committed to the shadow mount)')
      .split('\n')[0]);
    shadow.closeAllConnections?.();
    await new Promise((res) => shadow.close(res));
    // (g) starvation evidence RESOLVES per target (review r13 P2): a server
    // that stalls once, then answers, then DIES must be diagnosed as dead
    // PROMPTLY — never relabeled starved for the whole cap on the strength
    // of the earlier (resolved) timeout
    let appReqs = 0;
    let heldReq = null; // request #1: HELD FOREVER — a deterministic,
    // load-independent timeout (an artificial 3 s stall raced the 2 s
    // window under host load: any retry stalling past its window
    // re-poisoned the target and flaked this arm with an HONEST starved
    // verdict about the fixture itself)
    let dead = false; // the "died" phase: every request is RESET on sight
    const dying = await listen(nodeHttp.createServer((req, resp) => {
      if (dead) { try { req.socket.destroy(); } catch { /* gone */ } return; }
      const pathname = new URL(req.url, 'http://x').pathname;
      if (pathname === '/app.html') {
        appReqs += 1;
        if (appReqs === 1) { heldReq = req; return; } // guaranteed timeout
      }
      let body = null;
      try {
        const f = path.join(WEB_DIR, decodeURIComponent(pathname));
        if (fs.statSync(f).isFile()) body = fs.readFileSync(f);
      } catch { /* 404 below */ }
      resp.statusCode = body ? 200 : 404;
      resp.end(body ?? 'absent');
      if (pathname === '/app.html') {
        // discovery just succeeded on the RETRY (the earlier timeout is
        // now RESOLVED): "die" before the identity probes run
        dead = true;
      }
    }), PORT + 11); // FRESH origin: arms (a)/(d) used PORT+5 and undici's
    // per-origin pool can hand their stale kept-alive sockets to this
    // arm's first fetch (measured: a stale-socket first attempt turned the
    // deliberate single hold into two starved attempts under load)
    process.env.OB_CDP_PREFLIGHT_MS = '8000';
    let gErr = null;
    const gT0 = Date.now();
    try {
      await preflightServedTree(`http://127.0.0.1:${PORT + 11}/app.html?seed=1`);
    } catch (e) { gErr = e; }
    const gMs = Date.now() - gT0;
    delete process.env.OB_CDP_PREFLIGHT_MS;
    check('preflight (g): answered-then-DIED is diagnosed dead promptly — '
      + 'a RESOLVED earlier timeout never relabels refusals as starvation',
    gErr !== null && /died under us|not healthy|never bound/.test(
      String(gErr?.message))
      && !/I\/O-STARVED/.test(String(gErr?.message)) && gMs < 20000,
    `${gMs} ms — ${String(gErr?.message ?? 'no throw').split('\n')[0]}`);
    try { heldReq?.socket.destroy(); } catch { /* gone */ }
    try { dying.closeAllConnections?.(); } catch { /* closed by fixture */ }
    await new Promise((res) => dying.close(() => res()));
    // (h) BODY starvation extends the deadline too (review r14 P1): prompt
    // 200 headers whose body stalls 12 s on one probe — success needs the
    // window ladder AND the starvation-cap extension past the 15 s base
    // budget (pre-fix: dies at ~22 s with the budget expired mid-ladder)
    const bodyStall = await listen(nodeHttp.createServer((req, resp) => {
      const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      let body = null;
      try {
        const f = path.join(WEB_DIR, pathname);
        if (fs.statSync(f).isFile()) body = fs.readFileSync(f);
      } catch { /* 404 below */ }
      if (body === null) { resp.statusCode = 404; resp.end('absent'); return; }
      if (pathname === '/tools/render/grade.json') {
        resp.writeHead(200);
        resp.flushHeaders?.();
        setTimeout(() => resp.end(body), 12000); // headers prompt, body starved
        return;
      }
      resp.statusCode = 200;
      resp.end(body);
    }), PORT + 12); // fresh origin, same rationale as (g)
    let hErr = null;
    const hT0 = Date.now();
    try {
      await preflightServedTree(`http://127.0.0.1:${PORT + 12}/app.html?seed=1`);
    } catch (e) { hErr = e; }
    check('preflight (h): a prompt-200 probe whose BODY is starved re-opens '
      + 'the starvation question — the deadline extends and the right tree '
      + 'still PASSES', hErr === null,
    String(hErr?.message ?? '').split('\n')[0] + ` after ${Date.now() - hT0} ms`);
    bodyStall.closeAllConnections?.();
    await new Promise((res) => bodyStall.close(res));
  } finally {
    for (const [k, v] of [['OB_CDP_PREFLIGHT_MS', saved.budget],
      ['OB_SKIP_TREE_PREFLIGHT', saved.skip],
      ['OB_GATE_RTT_P50_MS', saved.rttEnv],
      ['OB_GATE_RTT_FILE', saved.rttFile]]) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    fs.rmSync(wrongTree, { recursive: true, force: true });
  }
}

// ---- arm 8e: lane-parameterized artifact dirs (GH-410 third leg) ----------------
// The #408 landing incident: suite artifact scratch was a FIXED SHARED /tmp
// path (/tmp/obexport-e2e, /tmp/obrec-e2e) while every port was properly
// lane-split — a foreign lane's suite-start rmSync nuked another lane's
// artifacts MID-RUN. The scratch now rides the SAME lane axis the ports do
// (laneArtifactDir(tag, OB_E2E_CDP_PORT)). PRE-FIX RED: the audit check
// finds the fixed literals in the suites (and laneArtifactDir does not
// exist, so (a)/(b) crash red).
{
  const { laneArtifactDir } = await import('./cdp.mjs');
  // (a) the derivation is lane-distinct and validated
  let badTag = null;
  try { laneArtifactDir('obrec-e2e/../х', 9001); } catch (e) { badTag = e; }
  check('artifact dirs (a): laneArtifactDir is lane-distinct on the port '
    + 'axis and refuses unsafe tags',
  laneArtifactDir('obrec-e2e', 9001) === '/tmp/obrec-e2e-9001'
    && laneArtifactDir('obrec-e2e', 9002) === '/tmp/obrec-e2e-9002'
    && badTag !== null);
  // (b) two simulated lanes: lane B's suite-start wipe of its OWN dir
  // leaves lane A's mid-run artifacts unharmed
  const laneA = laneArtifactDir('obw-hygiene-artifacts', 9001);
  const laneB = laneArtifactDir('obw-hygiene-artifacts', 9002);
  fs.rmSync(laneA, { recursive: true, force: true });
  fs.rmSync(laneB, { recursive: true, force: true });
  fs.mkdirSync(laneA, { recursive: true });
  fs.writeFileSync(path.join(laneA, 'mid-run.mp4'), 'GH-410 lane A artifact');
  fs.rmSync(laneB, { recursive: true, force: true }); // lane B's start wipe
  fs.mkdirSync(laneB, { recursive: true });
  check('artifact dirs (b): a foreign lane\'s suite-start wipe cannot touch '
    + 'another lane\'s mid-run artifacts',
  fs.existsSync(path.join(laneA, 'mid-run.mp4')));
  fs.rmSync(laneA, { recursive: true, force: true });
  fs.rmSync(laneB, { recursive: true, force: true });
  // (c) the permanent guard: no suite may hard-code a fixed shared /tmp
  // scratch path again (harness-owned per-port/per-pid families excluded)
  const fixed = [];
  for (const name of fs.readdirSync(path.join(WEB_DIR, 'tools'))
    .filter((n) => /^e2e.*\.mjs$/.test(n) && n !== 'e2e-harness-hygiene.mjs')) {
    const text = fs.readFileSync(path.join(WEB_DIR, 'tools', name), 'utf8');
    // ALL string forms (review r21 P2: backtick template paths — the touch
    // suites' scenario-indexed failure shots — evaded the single-quote
    // scan). A path is exempt only when its LINE carries a per-run or
    // per-lane uniqueness source; a scenario index is not one.
    for (const line of text.split('\n')) {
      const m = /['"`]\/tmp\/([a-zA-Z0-9._${}-]+)/.exec(line);
      if (!m) continue;
      if (/^(obw-e2e-profile|ob-port-bands|obw-e2e-server|ob-cdp-port)/
        .test(m[1])) continue; // harness-owned, already per-port/per-pid
      if (/Date\.now|process\.pid|laneArtifactDir|mkdtemp|CDP_PORT/
        .test(line)) continue; // run- or lane-unique by construction
      fixed.push(`${name}: /tmp/${m[1]}`);
    }
  }
  check('artifact dirs (c): no suite hard-codes a fixed shared /tmp scratch '
    + 'path in ANY string form (the #408 cross-lane wipe class)',
  fixed.length === 0, fixed.join('; '));
}

// ---- arm 8f: the shared server-marker family has ONE owner (issue #664 c) ----
// The GH-294 sidecars (/tmp/obw-e2e-server-<pid>.json) are a DELIBERATELY
// shared cross-process directory — the startup sweep and e2e-retry's
// post-SIGKILL reap attribute a dead harness's servers through them, each
// revalidating pid + port + docroot + lstart before any signal — and arm 8e
// above exempts the family only BY NAME. A consumer that spelled the path
// itself (e2e-retry's `/tmp/${n}`) was this family in a string form the scan
// cannot vouch for: red on main every night. The family is now reached only
// through cdp.mjs's serverMarkerPath / readServerMarkers. Pins: the path
// derives from a validated pid; a planted sidecar is discovered with its
// recorded identity; a marker JSON carrying its own `file`/`name` keys can
// never redirect a consumer's rm off the computed path (refuter B4); and
// e2e-retry spells no /tmp path of its own (the (c) regression class).
{
  const { serverMarkerDir, serverMarkerPath, readServerMarkers } = await import('./cdp.mjs');
  // a PRIVATE marker dir for the plant (review r2 P2): under the shared
  // default a concurrent lane's startup sweep prunes any marker whose
  // identity matches no live http.server row — our node pid never does —
  // and could delete the plant between the write and the read. The seam is
  // the OB_PORT_BANDS_DIR precedent; restored before the arm ends.
  const savedDir = process.env.OB_SERVER_MARKER_DIR;
  const privDir = fs.mkdtempSync(path.join(os.tmpdir(), 'obw-hygiene-markers-'));
  process.env.OB_SERVER_MARKER_DIR = privDir;
  let badPid = null;
  try { serverMarkerPath('../x'); } catch (e) { badPid = e; }
  check('markers (8f): serverMarkerPath derives the sidecar from a validated '
    + 'pid only (refuses a non-pid) inside the family\'s directory',
  serverMarkerDir() === privDir
    && serverMarkerPath(4242) === path.join(privDir, 'obw-e2e-server-4242.json')
    && badPid !== null);
  const planted = serverMarkerPath(process.pid);
  fs.writeFileSync(planted, JSON.stringify({ pid: process.pid,
    harnessPid: process.pid, port: '1', webDir: '/nonexistent-ob-hygiene',
    file: '/tmp/obw-hygiene-hostile-redirect', name: 'hostile' }));
  let seen = null;
  try { seen = readServerMarkers().find((m) => m.pid === process.pid) ?? null; }
  finally {
    fs.rmSync(privDir, { recursive: true, force: true });
    savedDir === undefined ? delete process.env.OB_SERVER_MARKER_DIR
      : process.env.OB_SERVER_MARKER_DIR = savedDir;
  }
  check('markers (8f): a planted sidecar is discovered with its recorded '
    + 'identity (harnessPid + port + docroot)',
  seen !== null && seen.harnessPid === process.pid && seen.port === '1'
    && seen.webDir === '/nonexistent-ob-hygiene');
  check('markers (8f): hostile `file`/`name` keys inside the JSON never '
    + 'redirect the computed path (a consumer\'s rm stays on the sidecar)',
  seen !== null && seen.file === planted && seen.name === path.basename(planted));
  const retry = fs.readFileSync(path.join(WEB_DIR, 'tools', 'e2e-retry.mjs'), 'utf8');
  check('markers (8f): e2e-retry reaches the family through readServerMarkers '
    + 'and spells no /tmp path of its own',
  /readServerMarkers\(\)/.test(retry) && !/['"`]\/tmp\/\$\{/.test(retry));
}

// ---- arm 8g: the CI band table + the CI-range refusal (GH-687) -----------------
// Every CI browser job pins a fixed band; a LOCAL session that wrapped a
// suite onto one of those bands held a live registry claim the CI job then
// refused under GH-338 — red with nothing wrong in the tree (1-3 browser
// jobs per run over 24 h). web/tools/ci-bands.json is now the ONE source
// (lint r1-r9 in lib/ci-bands.mjs; ci.yml's ci-bands-lint job), and a claim
// inside the reserved range is REFUSED unless the process is a CI job
// (GITHUB_ACTIONS=true) or the operator says so (OB_CI_BANDS=1): at
// run-gate's argv seam (the early, named message, exit 2), in the widening
// loop (never INTO the range), and at claimPortBand itself (the choke
// point every claimer passes — the tools that claim a default band
// directly). PRE-FIX RED (red-proof): against an export carrying the old
// run-gate.mjs / cdp.mjs the local claim SUCCEEDS (f3, f6) and widening
// slides UP into the range (f4); against the old ci.yml the lint names
// eleven overlaps (the CLI's own red-proof, recorded in the PR).
// Staging follows arm 410: a PRIVATE registry (OB_PORT_BANDS_DIR), staged
// trivial suites, --no-canary --no-belt (no Chrome). Every LOCAL leg runs
// under ciScrub(): this suite itself runs inside the nightly under
// GITHUB_ACTIONS=true, and an inherited CI flag would make the refuse legs
// pass for the wrong reason (refuter finding, design v2 D4).
{
  const cib = await import('./lib/ci-bands.mjs');
  const { spawn } = await import('node:child_process');
  const cdpPath = path.join(WEB_DIR, 'tools', 'cdp.mjs');
  const runGate = path.join(WEB_DIR, 'tools', 'run-gate.mjs');
  const REG = `/tmp/ob-port-bands-hygiene-687-${process.pid}`;
  const LDG = fs.mkdtempSync('/tmp/obw-hygiene-687-ledger-');
  const stage = fs.mkdtempSync('/tmp/obw-hygiene-687-suite-');
  fs.rmSync(REG, { recursive: true, force: true });
  const table = cib.loadCiBands();
  const RES = table.reservedRange;
  // pins are scrubbed BY THE SAME RULE the seam uses (refuter P1: the nightly
  // job pins OB_CDP_PORT=18790 at JOB level and runs this suite — a hand list
  // that omitted it would have every local leg refused on the runner)
  const ciScrub = (env) => {
    const e = { ...env, OB_PORT_BANDS: '', OB_PORT_BANDS_DIR: REG, OB_GATE_LEDGER_DIR: LDG };
    for (const k of ['GITHUB_ACTIONS', 'OB_CI_BANDS', 'CI', 'OB_GATE_RTT_P50_MS', 'OB_GATE_RTT_FILE',
      'OB_E2E_BAND_START', 'OB_E2E_BAND_END']) delete e[k];
    for (const k of Object.keys(e)) if (cib.pinEnvEntries({ [k]: e[k] }).length) delete e[k];
    return e;
  };
  const localEnv = () => ciScrub(process.env);
  check('8g setup: the local legs carry neither CI key nor ANY port-like pin (this suite runs inside the nightly, whose job pins OB_CDP_PORT)',
    localEnv().GITHUB_ACTIONS === undefined && localEnv().OB_CI_BANDS === undefined
      && cib.pinEnvEntries(localEnv()).length === 0 && localEnv().OB_CDP_PORT === undefined
      && cib.pinEnvEntries({ ...localEnv(), OB_CDP_PORT: '18790' }).length === 1);

  // ---- f1: the pure refusal, every edge -----------------------------------------
  const shellRow = table.jobs.find((r) => r.job === 'e2e-shell');
  const gapStart = (() => { // an unassigned window inside the range
    for (let s0 = RES.start; s0 + 9 <= RES.end; s0 += 10) {
      if (!cib.ciBandOverlaps(table, s0, s0 + 9).length) return s0;
    }
    return null;
  })();
  const ref = (a, b, env) => cib.ciBandRefusal(table, a, b, env);
  check('8g f1: a local claim of a table band is refused and the message names the job',
    shellRow && /lies inside the CI reserved range/.test(ref(shellRow.range.start, shellRow.range.end, {}) ?? '')
      && new RegExp(`job ${shellRow.job}'s band ${shellRow.band}`).test(ref(shellRow.range.start, shellRow.range.end, {}))
      && /GH-687/.test(ref(shellRow.range.start, shellRow.range.end, {})));
  check('8g f1: a band STRADDLING either edge of the range is refused (touching is squatting)',
    ref(RES.start - 5, RES.start, {}) !== null && ref(RES.end, RES.end + 5, {}) !== null);
  check('8g f1: a band just below / just above the range is not refused',
    ref(RES.start - 30, RES.start - 1, {}) === null && ref(RES.end + 1, RES.end + 30, {}) === null);
  check('8g f1: unassigned headroom inside the range is refused and said so',
    gapStart !== null && /unassigned CI headroom/.test(ref(gapStart, gapStart + 9, {}) ?? ''), String(gapStart));
  check('8g f1: GITHUB_ACTIONS=true and OB_CI_BANDS=1 each permit the claim; GITHUB_ACTIONS=false does not',
    ref(shellRow.range.start, shellRow.range.end, { GITHUB_ACTIONS: 'true' }) === null
      && ref(shellRow.range.start, shellRow.range.end, { OB_CI_BANDS: '1' }) === null
      && ref(shellRow.range.start, shellRow.range.end, { GITHUB_ACTIONS: 'false' }) !== null
      && ref(shellRow.range.start, shellRow.range.end, { CI: 'true' }) !== null);

  // ---- f2: the lint rules on inline fixtures --------------------------------------
  const T = (rows, reserved = { start: 18700, end: 19999 }) => ({ v: 1, reserved, jobs: rows });
  const R = (job, band, pins, suites = ['x.mjs'], workflow = 'ci.yml') => ({ workflow, job, band, pins, suites });
  const wfText = (jobs) => 'name: x\non: push\njobs:\n' + jobs.map(([id, env, bands]) => `  ${id}:\n    runs-on: ubuntu\n`
    + (env ? '    env:\n' + Object.entries(env).map(([k, v]) => `      ${k}: "${v}"\n`).join('') : '')
    + '    steps:\n      # run-gate --band 11111-11119 in a comment must not count\n'
    + bands.map((b) => `      - run: >\n          node web/tools/run-gate.mjs --band ${b} -- node web/tools/x.mjs\n          || node web/tools/run-gate.mjs --band ${b} -- node web/tools/x.mjs\n`).join('')).join('');
  const kinds = (res) => res.problems.map((p) => p.kind);
  const lint = (rows, wfs, extra = {}) => {
    try { return cib.lintCiBands({ table: T(rows), workflows: wfs, ...extra }); } catch (e) {
      // a throwing lint (a fixture the fail-closed table law refuses) is one
      // red row, never an uncaught throw that ends the suite (2026-09-07: a
      // 20-wide plan row in a fixture met the new 30-port minimum)
      return { ok: false, problems: [{ kind: 'lint-throws', detail: e.message }], warnings: [] };
    }
  };
  const clean = lint([R('a', '18700-18729', { OB_E2E_PORT: 18700, OB_E2E_CDP_PORT: 18715 })],
    { 'ci.yml': wfText([['a', { OB_E2E_PORT: 18700, OB_E2E_CDP_PORT: 18715 }, ['18700-18729']]]) },
    { suiteText: () => 'export const PORT_INVENTORY = { http: 1, cdp: 10 };\n' });
  check('8g f2: a consistent table + workflow lints clean (retry idiom, folded run, commented band all parsed)',
    clean.ok, JSON.stringify(clean.problems));
  check('8g f2: two rows that intersect → overlap (both named)',
    kinds(lint([R('a', '18700-18729', {}), R('b', '18720-18749', {})],
      { 'ci.yml': wfText([['a', null, ['18700-18729']], ['b', null, ['18720-18749']]]) })).includes('overlap'));
  check('8g f2: a workflow --band that differs from the row → band-mismatch',
    kinds(lint([R('a', '18700-18729', {})], { 'ci.yml': wfText([['a', null, ['18700-18739']]]) })).includes('band-mismatch'));
  check('8g f2: one job passing two different bands → multi-band-job',
    kinds(lint([R('a', '18700-18729', {})], { 'ci.yml': wfText([['a', null, ['18700-18729', '18730-18759']]]) })).includes('multi-band-job'));
  check('8g f2: a row whose job passes no --band → table-row-missing-from-workflow',
    kinds(lint([R('a', '18700-18729', {})], { 'ci.yml': wfText([['a', null, []]]) })).includes('table-row-missing-from-workflow'));
  check('8g f2: a --band in a THIRD workflow with no row → workflow-job-missing-from-table',
    kinds(lint([R('a', '18700-18729', {})], { 'ci.yml': wfText([['a', null, ['18700-18729']]]),
      'weekly.yml': wfText([['z', null, ['18800-18829']]]) })).includes('workflow-job-missing-from-table'));
  check('8g f2: a job that sets a pin but passes no --band → pins-without-band',
    kinds(lint([R('a', '18700-18729', {})], { 'ci.yml': wfText([['a', null, ['18700-18729']], ['bare', { OB_E2E_PORT: 18800 }, []]]) })).includes('pins-without-band'));
  check('8g f2: a workflow pin the table row OMITS → pin-mismatch (one source means every pin; review r1 P2)',
    kinds(lint([R('a', '18700-18729', { OB_E2E_PORT: 18700 })], { 'ci.yml': wfText([['a', { OB_E2E_PORT: 18700, OB_CDP_PORT: 18720 }, ['18700-18729']]]) })).includes('pin-mismatch')
      && lint([R('a', '18700-18729', { OB_E2E_PORT: 18700, OB_CDP_PORT: 18720 })], { 'ci.yml': wfText([['a', { OB_E2E_PORT: 18700, OB_CDP_PORT: 18720 }, ['18700-18729']]]) }).ok);
  check('8g f2: a table pin that differs from the workflow env → pin-mismatch',
    kinds(lint([R('a', '18700-18729', { OB_E2E_PORT: 18700 })], { 'ci.yml': wfText([['a', { OB_E2E_PORT: 18701 }, ['18700-18729']]]) })).includes('pin-mismatch'));
  check('8g f2: a suite whose DECLARED CDP tail escapes the band → job-pin-tail-escapes (read from the suite, not a copied count)',
    kinds(lint([R('a', '18700-18729', { OB_E2E_PORT: 18700, OB_E2E_CDP_PORT: 18715 })],
      { 'ci.yml': wfText([['a', { OB_E2E_PORT: 18700, OB_E2E_CDP_PORT: 18715 }, ['18700-18729']]]) },
      { suiteText: () => 'export const PORT_INVENTORY = { http: 1, cdp: 16 };\n' })).includes('job-pin-tail-escapes'));
  check('8g f2: a tool default inside the range → tool-default-in-reserved; outside → clean',
    kinds(lint([R('a', '18700-18729', {})], { 'ci.yml': wfText([['a', null, ['18700-18729']]]) },
      { toolDefaults: [{ file: 't.mjs', line: 1, key: 'OB_E2E_PORT', value: 19100 }] })).includes('tool-default-in-reserved')
    && lint([R('a', '18700-18729', {})], { 'ci.yml': wfText([['a', null, ['18700-18729']]]) },
      { toolDefaults: [{ file: 't.mjs', line: 1, key: 'OB_E2E_PORT', value: 9100 }] }).ok);
  check('8g f2: a tool default inside a DECLARED LANE BAND → tool-default-in-lane-band naming the lane; outside every band → clean',
    kinds(lint([R('a', '18700-18729', {})], { 'ci.yml': wfText([['a', null, ['18700-18729']]]) },
      { toolDefaults: [{ file: 't.mjs', line: 1, key: 'OB_E2E_CDP_PORT', value: 9666 }],
        laneBands: { v: 1, bands: [{ lane: 'ci-red', band: '9660-9689' }, { lane: 'diamond', band: '9520-9549' }] } })).includes('tool-default-in-lane-band')
    && lint([R('a', '18700-18729', {})], { 'ci.yml': wfText([['a', null, ['18700-18729']]]) },
      { toolDefaults: [{ file: 't.mjs', line: 1, key: 'OB_E2E_CDP_PORT', value: 8830 }],
        laneBands: { v: 1, bands: [{ lane: 'ci-red', band: '9660-9689' }] } }).ok);
  check('8g f2: EVERY pin occurrence is linted — an in-table step pin AFTER an out-of-band job pin FAILS naming the earlier line (review r4 P2)',
    (() => {
      const wf = 'jobs:\n  a:\n    env:\n      OB_E2E_PORT: "18800"\n    steps:\n      - name: s\n        env:\n          OB_E2E_PORT: "18700"\n'
        + '        run: node web/tools/run-gate.mjs --band 18700-18729 -- node x.mjs\n';
      const res = lint([R('a', '18700-18729', { OB_E2E_PORT: 18700 })], { 'ci.yml': wf });
      return !res.ok && res.problems.some((p) => /line 4 OB_E2E_PORT=18800/.test(p.detail))
        && cib.parseWorkflowBands(wf).jobs.a.pinOccurrences.OB_E2E_PORT.length === 2;
    })());
  // (f8) the default SCAN covers every syntax the tree uses (review r5 P2: the
  // first scan saw only `OB_E2E_* ?? N` and called a tree clean that defaulted
  // 9770/9780/9772 through argOf): one scratch tool per syntax, each with a
  // default inside a declared band, each must be named — with its syntax
  {
    const scratch = fs.mkdtempSync('/tmp/obw-hygiene-687-scan-');
    // every in-band number is DERIVED from the committed tables (a literal
    // spelled here would itself be a hit on this file — the scanner reads
    // strings too, and rightly so)
    const lanesT = cib.loadLaneBands(cib.LANE_BANDS_FILE, table);
    const L = lanesT.bands; const mid = (i) => L[i % L.length].range.start + 5;
    const FIX = {
      'nullish-default': `const PORT = Number(process.env.OB_E2E_PORT ?? ${mid(0)});\n`,
      'or-default': `const CDP = +(process.env.OB_E2E_CDP_PORT || ${mid(1)});\n`,
      'flag-default': `const argOf = (k, d) => d;\nconst PORT = Number(argOf('--port', ${mid(2)}));\n`,
      'ternary-default': `const args = [];\nconst PORT = args.includes('--port') ? Number(args[1]) : ${mid(3)};\n`,
      'assignment': `const CDP_PORT = ${mid(4)};\n`,
      'arithmetic': `const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? (${mid(5)} + 2));\n`, // literal arithmetic (a BASE ± k is a derived-offset since r5)
      'derived-offset': `const PORT = Number(process.env.OB_E2E_PORT ?? ${mid(6)});\nconst CDP_PORT = PORT + 3;\n`,
      'dynamic-window': `export const PORT_WINDOW_FAMILY = { start: ${L[7 % L.length].range.start - 10}, end: ${L[7 % L.length].range.start - 10 + 98 + 96 + 63} };\nasync function win() {\n  const base = ${L[7 % L.length].range.start - 10} + (PORT % 99) + (process.pid % 97);\n  return claimPortBand(base, base + 63, { layout: false });\n}\n`,
      'band-string': `const argOf = (k, d) => d;\nconst BAND = argOf('--band', '${L[6 % L.length].band}');\n`,
      'claim-literal': `const band = await claimPortBand(${L[7 % L.length].range.start}, ${L[7 % L.length].range.end});\n`,
      'url-port': `const URL_ = arg('url', 'http://127.0.0.1:${RES.start + 100}/app.html');\n`,
      // review r7 P2: a literal that reaches a launch call through a local whose name says nothing
      'launch-arg-local': `const slot = ${mid(0)};\nconst chrome = await launchChrome(url, { port: slot });\n`,
    };
    for (const [syntax, src] of Object.entries(FIX)) fs.writeFileSync(path.join(scratch, `${syntax}.mjs`), src);
    // and one that must NOT hit: a band string in a comment, a table-row fixture, a regex literal
    const rb = `${RES.start}-${RES.start + 29}`;
    fs.writeFileSync(path.join(scratch, 'quiet.mjs'), `// run-gate --band ${rb} in a comment\nconst row = R('a', '${rb}', {});\nconst re = /line 4 OB_E2E_PORT=${RES.start + 100}/;\nconst OUT = 4096;\n`);
    const hits = cib.scanToolDefaults(scratch);
    const res = cib.lintCiBands({ table, workflows: {}, toolDefaults: hits, laneBands: lanesT });
    const named = (syntax) => res.problems.some((p) => p.detail.startsWith(`${syntax}.mjs:`) && p.detail.includes(`[${syntax}]`));
    const missing = cib.DEFAULT_SYNTAXES.filter((x) => !named(x));
    check('8g f8: every default syntax the tree uses is scanned and named with its syntax — nullish / or / flag / ternary / assignment / arithmetic / band-string / claim-literal / url-port / launch-arg-local (review r5 + r7 P2) / derived-offset / dynamic-window (companion r5-r6)',
      missing.length === 0 && cib.DEFAULT_SYNTAXES.length === 12, `unnamed: ${missing.join(', ')} | ${JSON.stringify(res.problems.map((p) => p.detail.slice(0, 60)))}`);
    check('8g f8: the one-hop trace REPORTS the hop (local = literal at line N → launchChrome({ port }) at line M)',
      res.problems.some((p) => p.detail.startsWith('launch-arg-local.mjs:') && /via one hop: slot = .* \(line 1\) → launchChrome\(\{ port \}\) \(line 2\)/.test(p.detail)),
      JSON.stringify(res.problems.filter((p) => p.detail.startsWith('launch-arg-local')).map((p) => p.detail.slice(0, 200))));
    // (f8, review r7 P2 #1) the gate keys on the ENV NAME too: `base` says nothing, OB_X_PORT_BASE does
    {
      const dir2 = fs.mkdtempSync('/tmp/obw-hygiene-687-envname-');
      fs.writeFileSync(path.join(dir2, 'batch.mjs'), `const base = Number(process.env.OB_X_PORT_BASE ?? ${mid(3)});\nconst p = base + 20;\n`);
      fs.writeFileSync(path.join(dir2, 'flagged.mjs'), `const where = Number(argOf('--cdp-base', ${mid(4)}));\n`);
      fs.writeFileSync(path.join(dir2, 'plain.mjs'), `const base = Number(process.env.OB_X_WIDTH ?? ${mid(5)});\n`); // no PORT/CDP/BASE in the env name → not a hit
      const r2 = cib.lintCiBands({ table, workflows: {}, toolDefaults: cib.scanToolDefaults(dir2), laneBands: lanesT });
      const lane = r2.problems.filter((p) => p.kind === 'tool-default-in-lane-band');
      check('8g f8: a default fed by an env var named PORT|CDP|BASE|BAND|SERVE is named even when the variable is called `base` (via env-name, reported); a flag named --cdp-base too; an unrelated env name is not a hit (review r7 P2)',
        lane.some((p) => p.detail.startsWith('batch.mjs:1') && /via env-name OB_X_PORT_BASE/.test(p.detail))
          && lane.some((p) => p.detail.startsWith('flagged.mjs:1') && /flag-default/.test(p.detail))
          && !lane.some((p) => p.detail.startsWith('plain.mjs')), JSON.stringify(lane.map((p) => p.detail.slice(0, 160))));
      fs.rmSync(dir2, { recursive: true, force: true });
    }
    // (f8, review r7 P2 #2) declared vs USED: the highest CDP + k launched, read from the enclosing loop
    {
      const dir3 = fs.mkdtempSync('/tmp/obw-hygiene-687-used-');
      const base = 8190; // outside every declared band: only the undercount rule may speak
      // every fixture here shares that one base ON PURPOSE — the subject is the offset
      // reader, not the allocation — so they declare the shared window the
      // tool-default-overlap rule takes as its only exemption (f20); without it the
      // family would name itself as 45 pairs and drown the rule under test
      const W = (name, body) => fs.writeFileSync(path.join(dir3, `${name}.mjs`), `export const SHARED_DEFAULT_WINDOW = 'f8-offset-fixtures';\nconst PORT = Number(process.env.OB_E2E_PORT ?? 8189);\nconst CDP = Number(process.env.OB_E2E_CDP_PORT ?? ${base});\n${body}`);
      W('under', "export const PORT_INVENTORY = { http: 1, cdp: 5 };\nconst c = await launchChrome(u, { port: CDP + 5 });\n");
      W('exact', "export const PORT_INVENTORY = { http: 1, cdp: 6 };\nconst c = await launchChrome(u, { port: CDP + 5 });\n");
      W('forlet', "export const PORT_INVENTORY = { http: 1, cdp: 4 };\nfor (let i = 0; i < 4; i++) {\n  const c = await launchChrome(u, { port: CDP + i });\n}\n");
      W('forof', "export const PORT_INVENTORY = { http: 1, cdp: 6 };\nfor (const [i, loc] of [['en'], ['zh-CN']].map((x, j) => [j, x[0]])) {\n  const c = await launchChrome(u, { port: CDP + 4 + i });\n}\n");
      // off tops out at 3 → four slots (the reader caught this fixture declaring 3: its own undercount rule)
      W('tuple', "export const PORT_INVENTORY = { http: 1, cdp: 4 };\nfor (const [loc, name, off] of [\n  ['en', 'a.png', 2],\n  ['zh-CN', 'b.png', 3]]) {\n  const c = await launchChrome(u, { port: CDP + off });\n}\n");
      W('modulo', "export const PORT_INVENTORY = { http: 1, cdp: 29 };\nconst probe = CDP + 6 + (process.pid % 23);\n");
      W('ternary', "export const PORT_INVENTORY = { http: 1, cdp: 28 };\nconst c = await launchChrome(u, { port: CDP + (leg === 'phone' ? 27 : 26) });\n");
      W('keys', "export const PORT_INVENTORY = { http: 1, cdp: 5 };\nconst SIMS = { 2: a, 3: b, 4: c };\nasync function run(shots) {\n  for (const n of shots) {\n    SIMS[n]();\n    const c = await launchChrome(u, { port: CDP + n });\n  }\n}\n");
      W('unknown', "export const PORT_INVENTORY = { http: 1, cdp: 5 };\nasync function run(list) {\n  for (const n of list) {\n    const c = await launchChrome(u, { port: CDP + n });\n  }\n}\n");
      const hits = cib.scanToolDefaults(dir3);
      const r3 = cib.lintCiBands({ table, workflows: {}, toolDefaults: hits, laneBands: lanesT });
      const kindOf = (f) => r3.problems.filter((p) => p.detail.startsWith(`${f}.mjs`)).map((p) => p.kind);
      const used = (f) => cib.cdpOffsetsUsed(fs.readFileSync(path.join(dir3, `${f}.mjs`), 'utf8')).maxOffset;
      check('8g f8: a capture declaring cdp 5 that launches CDP + 5 is named inventory-undercount (needs 6); declaring 6 is clean (review r7 P2)',
        kindOf('under').includes('inventory-undercount') && /needs cdp 6/.test(r3.problems.find((p) => p.detail.startsWith('under.mjs'))?.detail ?? '') && kindOf('exact').length === 0,
        JSON.stringify(kindOf('under')) + ' ' + JSON.stringify(kindOf('exact')));
      check('8g f8: the highest offset is read from the ENCLOSING loop — for-let range (+3), for-of array literal with .map (+5), tuple index (+3), % M (+28), a ternary of literals (+27), a for-of over an object-keyed list (+4)',
        used('forlet') === 3 && used('forof') === 5 && used('tuple') === 3 && used('modulo') === 28 && used('ternary') === 27 && used('keys') === 4
          && ['forlet', 'forof', 'tuple', 'modulo', 'ternary', 'keys'].every((f) => kindOf(f).length === 0),
        JSON.stringify({ forlet: used('forlet'), forof: used('forof'), tuple: used('tuple'), modulo: used('modulo'), ternary: used('ternary'), keys: used('keys') }));
      check('8g f8: a loop variable with no readable bound is offset-bound-unknown (fail-closed), never a silent pass',
        kindOf('unknown').includes('offset-bound-unknown'), JSON.stringify(kindOf('unknown')));
      fs.rmSync(dir3, { recursive: true, force: true });
    }
    check('8g f8: a band in a comment, a table-row fixture, a regex literal and an unrelated 4-digit literal are NOT hits',
      hits.every((h) => h.file !== 'quiet.mjs'), JSON.stringify(hits.filter((h) => h.file === 'quiet.mjs')));
    check('8g f8: a claim literal that spans several lanes names every one of them',
      (() => { // a 30-wide claim from the first lane's 20th port spans the first three lanes of the table
        const a = L[0].range.start + 20; const span = cib.scanToolDefaultsInText(`const band = await claimPortBand(${a}, ${a + 29});\n`, 'span.mjs');
        const r2 = cib.lintCiBands({ table, workflows: {}, toolDefaults: span, laneBands: lanesT });
        const want = L.filter((b) => cib.bandsIntersect(b.range, { start: a, end: a + 29 }));
        const laneProblems = r2.problems.filter((p) => p.kind === 'tool-default-in-lane-band'); // the empty
        // workflow map also yields workflow-missing rows — only the lane row is under test
        return laneProblems.length === 1 && want.length >= 2
          && want.every((b) => laneProblems[0].detail.includes(`${b.lane} lane band ${b.band}`)); })());
    fs.rmSync(scratch, { recursive: true, force: true });
  }
  const throws = (fn) => { try { fn(); return false; } catch { return true; } };
  // (f2, derived ranges — review r6 P1-b) a tool's FULL range comes from its
  // declared inventory; an undeclared deriver fails closed
  {
    const lanesT = cib.loadLaneBands(cib.LANE_BANDS_FILE, table);
    const plan = (lane) => lanesT.bands.find((b) => b.lane === lane && !b.legacy);
    const scratch = fs.mkdtempSync('/tmp/obw-hygiene-687-derived-');
    const light = plan('lighting'); const dia = plan('diamond');
    // base 20 ports below the lighting/diamond edge with 26 CDP slots: the SCALAR lies in lighting, the RANGE reaches diamond
    fs.writeFileSync(path.join(scratch, 'derived.mjs'), `const PORT = Number(process.env.OB_E2E_PORT ?? 8190);\nconst CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? ${dia.range.start - 20});\nexport const PORT_INVENTORY = { http: 1, cdp: 26 };\nconst c = CDP_PORT + 1;\n`);
    // the owner's fixture: base = the diamond plan start, 25 derived ports
    fs.writeFileSync(path.join(scratch, 'diamond.mjs'), `const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? ${dia.range.start});\nexport const PORT_INVENTORY = { http: 1, cdp: 26 };\nconst c = CDP_PORT + 25;\n`);
    // derives from a base, declares nothing: fail-closed
    fs.writeFileSync(path.join(scratch, 'undeclared.mjs'), 'const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 8190);\nconst c = CDP_PORT + 3;\n');
    const hits = cib.scanToolDefaults(scratch);
    const res = cib.lintCiBands({ table, workflows: {}, toolDefaults: hits, laneBands: lanesT });
    const rows = res.problems.filter((p) => p.kind === 'tool-default-in-lane-band');
    check('8g f2: a scalar in one lane whose DERIVED range (base + inventory) reaches the next lane is named against BOTH (derived ranges, not scalars)',
      rows.some((p) => p.detail.startsWith('derived.mjs:') && /\(derived: base \+ inventory 1\/26\)/.test(p.detail)
        && p.detail.includes(`${light.lane} lane band ${light.band}`) && p.detail.includes(`${dia.lane} lane band ${dia.band}`)),
      JSON.stringify(rows.map((p) => p.detail.slice(0, 120))));
    check('8g f2: a base at the diamond plan start with 25 derived ports is named against the diamond row (the owner\'s fixture)',
      rows.some((p) => p.detail.startsWith('diamond.mjs:') && p.detail.includes(`${dia.lane} lane band ${dia.band}`)));
    check('8g f2: a tool that derives ports from a base without a PORT_INVENTORY fails as undeclared-inventory (fail-closed)',
      res.problems.some((p) => p.kind === 'undeclared-inventory' && p.detail.startsWith('undeclared.mjs')) && !res.ok);
    fs.rmSync(scratch, { recursive: true, force: true });
    // legacy rows: WARN before `until`, FAIL after; the expired row itself fails
    const legacyT = { v: 1, bands: [{ lane: 'x', band: '9400-9429' }, { lane: 'x', band: '9700-9709', legacy: true, until: '2026-09-10' }] };
    const hit = [{ file: 't.mjs', line: 1, name: 'CDP', syntax: 'nullish-default', key: 'CDP', value: 9705, range: null }];
    // a self-consistent CI fixture (one row + its workflow) so the ONLY signal is the legacy hit
    const legacyCi = { table: T([R('a', '18700-18729', {})]), workflows: { 'ci.yml': wfText([['a', null, ['18700-18729']]]) } };
    const before = cib.lintCiBands({ ...legacyCi, toolDefaults: hit, laneBands: JSON.parse(JSON.stringify(legacyT)), now: Date.parse('2026-09-09T12:00:00Z') });
    const after = cib.lintCiBands({ ...legacyCi, toolDefaults: hit, laneBands: JSON.parse(JSON.stringify(legacyT)), now: Date.parse('2026-09-10T00:00:01Z') });
    check('8g f2: a default inside a LEGACY lane row WARNS (ok stays true) before `until` and FAILS after it; the expired row itself fails',
      before.ok && before.warnings.some((w) => w.kind === 'tool-default-in-legacy-lane-band' && /LEGACY band 9700-9709 \(until 2026-09-10\)/.test(w.detail))
        && !after.ok && after.problems.some((p) => p.kind === 'tool-default-in-legacy-lane-band') && after.problems.some((p) => p.kind === 'legacy-row-expired'),
      JSON.stringify({ before: before.warnings.length, after: after.problems.map((p) => p.kind) }));
  }
  // (f12, review r8 P2-2) inventories are READ from the suite files the row names
  {
    const scratch = fs.mkdtempSync('/tmp/obw-hygiene-687-suites-');
    fs.writeFileSync(path.join(scratch, 'wide.mjs'), 'const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 8190);\nexport const PORT_INVENTORY = { http: 1, cdp: 40 };\nconst c = CDP_PORT + 39;\n');
    fs.writeFileSync(path.join(scratch, 'fits.mjs'), 'const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 8190);\nexport const PORT_INVENTORY = { http: 1, cdp: 10 };\nconst c = CDP_PORT + 9;\n');
    fs.writeFileSync(path.join(scratch, 'bare.mjs'), 'const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 8190);\n');
    const suiteText = (f) => { try { return fs.readFileSync(path.join(scratch, f), 'utf8'); } catch { return null; } };
    const wfOf = (suite) => 'jobs:\n  a:\n    env:\n      OB_E2E_PORT: "18700"\n      OB_E2E_CDP_PORT: "18715"\n    steps:\n      - run: >\n          node web/tools/run-gate.mjs --band 18700-18729 --no-canary --no-belt --\n          node web/tools/' + suite + '\n';
    const lintS = (suite, listed = suite) => cib.lintCiBands({ table: T([{ workflow: 'ci.yml', job: 'a', band: '18700-18729', pins: { OB_E2E_PORT: 18700, OB_E2E_CDP_PORT: 18715 }, suites: [listed] }]), workflows: { 'ci.yml': wfOf(suite) }, suiteText });
    const wide = lintS('wide.mjs');
    check('8g f12: a job row whose suite declares cdp 40 against a 30-wide band FAILS naming the shortfall (needs 55, band is 30) and the escaping pin tail',
      !wide.ok && wide.problems.some((p) => p.kind === 'job-band-too-narrow' && /needs 55 \(shortfall 25\)/.test(p.detail))
        && wide.problems.some((p) => p.kind === 'job-pin-tail-escapes'), JSON.stringify(wide.problems.map((p) => p.detail.slice(0, 120))));
    check('8g f12: a suite whose inventory fits the band is clean; a suite that declares nothing fails closed (job-suite-undeclared); a row listing a suite the job does not run is job-suites-mismatch',
      lintS('fits.mjs').ok && lintS('bare.mjs').problems.some((p) => p.kind === 'job-suite-undeclared')
        && lintS('fits.mjs', 'wide.mjs').problems.some((p) => p.kind === 'job-suites-mismatch'),
      JSON.stringify([lintS('fits.mjs').problems, lintS('bare.mjs').problems.map((p) => p.kind), lintS('fits.mjs', 'wide.mjs').problems.map((p) => p.kind)]).slice(0, 300));
    const wfRetry = 'jobs:\n  a:\n    steps:\n      - run: >\n          node web/tools/run-gate.mjs --band 18700-18729 --no-canary --no-belt --\n          node web/tools/e2e-retry.mjs --\n          node web/tools/fits.mjs --scenario x\n';
    check('8g f12: the job\'s suites are derived by run-gate\'s own rule — the LAST web/tools/*.mjs after `--`, through e2e-retry and folded run blocks',
      JSON.stringify(cib.parseWorkflowBands(wfRetry).jobs.a.suites) === '["fits.mjs"]'
        && JSON.stringify(cib.parseWorkflowBands(wfOf('fits.mjs')).jobs.a.suites) === '["fits.mjs"]',
      JSON.stringify(cib.parseWorkflowBands(wfRetry).jobs.a.suites));
    const wf2 = 'jobs:\n  a:\n    steps:\n      - run: |\n          node web/tools/run-gate.mjs --band 18700-18729 --no-canary --no-belt -- node web/tools/fits.mjs --scenario x || node web/tools/run-gate.mjs --band 18700-18729 -- node web/tools/wide.mjs\n      - run: >\n          node web/tools/run-gate.mjs --band 18700-18729 --no-canary --no-belt --\n          node scripts/no-suite-here.js\n';
    const p2 = cib.parseWorkflowBands(wf2).jobs.a;
    check('8g f12: a literal `|` run block and a single-line `A || B` retry with TWO suites yield both suites; an invocation that names no suite is recorded fail-closed (run-gate-without-suite)',
      JSON.stringify([...new Set(p2.suites)].sort()) === '["fits.mjs","wide.mjs"]' && p2.gateWithoutSuite.length === 1
        && cib.lintCiBands({ table: T([{ workflow: 'ci.yml', job: 'a', band: '18700-18729', pins: {}, suites: ['fits.mjs', 'wide.mjs'] }]), workflows: { 'ci.yml': wf2 } }).problems.some((p) => p.kind === 'run-gate-without-suite'),
      JSON.stringify({ suites: p2.suites, noSuite: p2.gateWithoutSuite }));
    const collide = cib.lintCiBands({ table: T([{ workflow: 'ci.yml', job: 'a', band: '18700-18759', pins: { OB_E2E_PORT: 18700, OB_E2E_CDP_PORT: 18715, OB_CDP_PORT: 18720 }, suites: ['fits.mjs'] }]),
      workflows: { 'ci.yml': 'jobs:\n  a:\n    env:\n      OB_E2E_PORT: "18700"\n      OB_E2E_CDP_PORT: "18715"\n      OB_CDP_PORT: "18720"\n    steps:\n      - run: >\n          node web/tools/run-gate.mjs --band 18700-18759 --no-canary --no-belt --\n          node web/tools/fits.mjs\n' }, suiteText });
    check('8g f12: an OB_CDP_PORT pin that falls inside the suite\'s derived CDP range (cdp0 + cdp − 1) is job-pin-collides (the battery-shaped blind spot)',
      collide.problems.some((p) => p.kind === 'job-pin-collides' && /OB_CDP_PORT=18720 falls inside fits.mjs's derived CDP range 18715-18724/.test(p.detail)), JSON.stringify(collide.problems.map((p) => p.kind)));
    check('8g f12: a row that still carries a hand `inventory` count never LOADS (the count is read from the suite, not copied)',
      throws(() => cib.validateCiBands(T([{ workflow: 'ci.yml', job: 'a', band: '18700-18729', pins: {}, suites: ['x.mjs'], inventory: { http: 1, cdp: 2 } }]))));
    fs.rmSync(scratch, { recursive: true, force: true });
  }
  check('8g f2: a PLAN row narrower than 30 or a legacy row without an ISO `until` never LOADS',
    throws(() => cib.validateLaneBands({ v: 1, bands: [{ lane: 'a', band: '9400-9409' }] }))
      && throws(() => cib.validateLaneBands({ v: 1, bands: [{ lane: 'a', band: '9400-9429' }, { lane: 'a', band: '9700-9709', legacy: true }] }))
      && !throws(() => cib.validateLaneBands({ v: 1, bands: [{ lane: 'a', band: '9400-9429' }, { lane: 'a', band: '9700-9709', legacy: true, until: '2026-09-10' }] })));
  check('8g f2: the lane table never LOADS with overlapping lanes or a lane inside the CI reserved range (fail-closed)',
    throws(() => cib.validateLaneBands({ v: 1, bands: [{ lane: 'a', band: '9660-9689' }, { lane: 'b', band: '9680-9709' }] }))
      && throws(() => cib.validateLaneBands({ v: 1, bands: [{ lane: 'a', band: '18700-18729' }] }, table))
      && !throws(() => cib.validateLaneBands({ v: 1, bands: [{ lane: 'a', band: '9660-9689' }, { lane: 'b', band: '9690-9719' }] }, table)));
  check('8g f2: a row outside the reserved range or a pin outside its band never LOADS (fail-closed)',
    throws(() => cib.validateCiBands(T([R('a', '20000-20029', {})])))
      && throws(() => cib.validateCiBands(T([R('a', '18700-18729', { OB_E2E_PORT: 18800 })])))
      && throws(() => cib.validateCiBands({ v: 2, reserved: { start: 1, end: 2 }, jobs: [] })));
  check('8g f2: a quoted --band "A-B" is parsed like a bare one',
    cib.parseWorkflowBands('jobs:\n  q:\n    steps:\n      - run: node run-gate.mjs --band "18700-18729" -- x\n').jobs.q.bands.length === 1);
  check('8g f2: `--band=A-B` (a form run-gate does not parse) → band-syntax, never approved (review r2 P2)',
    kinds(lint([R('a', '18700-18729', {})], { 'ci.yml': 'jobs:\n  a:\n    steps:\n      - run: node web/tools/run-gate.mjs --band=18700-18729 -- node x.mjs\n' })).includes('band-syntax')
      && !lint([R('a', '18700-18729', {})], { 'ci.yml': 'jobs:\n  a:\n    steps:\n      - run: node web/tools/run-gate.mjs --band=18700-18729 -- node x.mjs\n' }).ok);

  // ---- f5: the committed files lint clean on THIS tree (the same check CI runs) ----
  const committed = await treeLintOnce();
  check('8g f5: the committed ci-bands.json, lane-bands.json, every workflow and every tool default lint clean',
    committed.ok && committed.laneBands?.bands.length >= 8, JSON.stringify(committed.problems).slice(0, 400));
  check('8g f5: the table covers every workflow job that passes --band (r1 over ALL workflows)',
    committed.files.includes('ci.yml') && committed.files.includes('e2e-nightly.yml') && committed.files.length >= 3);

  // ---- f3 / f4 / f7: run-gate live, private registry ------------------------------
  const trivial = path.join(stage, 'trivial.mjs');
  fs.writeFileSync(trivial, "export const PORT_FLAGS = { '--port': 'http' };\nconsole.log('STAGED-687 ran on ' + process.env.OB_E2E_PORT + '/' + process.env.OB_E2E_CDP_PORT);\n");
  const wide = path.join(stage, 'wide.mjs');
  fs.writeFileSync(wide, "export const PORT_INVENTORY = { http: 1, cdp: 24 };\nconsole.log('STAGED-687-WIDE ran ' + process.env.OB_PORT_BANDS);\n");
  const gate = (bandStr, suite, env) => spawnSync(process.execPath,
    [runGate, '--band', bandStr, '--no-canary', '--no-belt', '--', suite],
    { encoding: 'utf8', timeout: 90000, cwd: WEB_DIR, env });
  const regEmpty = () => !fs.existsSync(REG) || fs.readdirSync(REG).filter((n) => !n.startsWith('prep-')).length === 0;
  const laneBase = 45300 + ((process.pid * 37) % 600);
  {
    const r = gate(shellRow.band, trivial, localEnv());
    check('8g f3: run-gate REFUSES a local claim of a CI band at the seam (exit 2, the job named, nothing claimed, suite never ran)',
      r.status === 2 && new RegExp(`job ${shellRow.job}`).test(r.stderr) && /GH-687/.test(r.stderr)
        && !/STAGED-687 ran/.test(r.stdout) && regEmpty(),
      `status ${r.status} stderr ${r.stderr.slice(0, 200)}`);
  }
  {
    const r = gate(shellRow.band, trivial, { ...localEnv(), GITHUB_ACTIONS: 'true' });
    check('8g f3: under GITHUB_ACTIONS=true the same band is claimed and the suite runs',
      r.status === 0 && /\[run-gate\] claimed port band/.test(r.stdout) && /STAGED-687 ran/.test(r.stdout),
      `status ${r.status} ${(r.stderr + r.stdout).slice(0, 200)}`);
  }
  {
    const r = gate(shellRow.band, trivial, { ...localEnv(), OB_CI_BANDS: '1' });
    check('8g f3: under OB_CI_BANDS=1 (reproducing a CI job by hand) the band is claimed and the suite runs',
      r.status === 0 && /STAGED-687 ran/.test(r.stdout), `status ${r.status} ${(r.stderr + r.stdout).slice(0, 200)}`);
  }
  {
    const r = gate(`${laneBase}-${laneBase + 29}`, trivial, localEnv());
    check('8g f3: a lane band below the range is claimed as before (the refusal touches nothing else)',
      r.status === 0 && /STAGED-687 ran/.test(r.stdout), `status ${r.status} ${(r.stderr + r.stdout).slice(0, 200)}`);
  }
  {
    const atelier = table.jobs.find((j) => j.job === 'e2e-atelier');
    const r = gate(`${laneBase}-${laneBase + 29}`, trivial, { ...localEnv(), OB_E2E_PORT: String(atelier.pins.OB_E2E_PORT) });
    check('8g f7: an explicit env pin inside the range is refused at the seam even with a lane band (the job named)',
      r.status === 2 && /env pin OB_E2E_PORT=/.test(r.stderr) && new RegExp(`job ${atelier.job}`).test(r.stderr)
        && !/STAGED-687 ran/.test(r.stdout), `status ${r.status} ${r.stderr.slice(0, 200)}`);
    // review r1 P2: OB_CDP_PORT is a pin too (scenario-render honours it exactly
    // and skips its own claim) — the nightly's 18790 must be refused as well
    const nightly = table.jobs.find((j) => j.workflow === 'e2e-nightly.yml');
    const r2 = gate(`${laneBase}-${laneBase + 29}`, trivial, { ...localEnv(), OB_CDP_PORT: String(nightly.pins.OB_CDP_PORT) });
    check('8g f7: an OB_CDP_PORT pin inside the range is refused the same way (every pin key the table knows)',
      r2.status === 2 && /env pin OB_CDP_PORT=/.test(r2.stderr) && new RegExp(`job ${nightly.job}`).test(r2.stderr)
        && !/STAGED-687 ran/.test(r2.stdout), `status ${r2.status} ${r2.stderr.slice(0, 200)}`);
  }
  {
    // f4: assigned just below the range, inventory forces widening: UP would
    // enter the range → skipped by name; the claim goes DOWN
    const a = RES.start - 30; const b = RES.start - 1; // 30 wide: narrower is refused at the seam (f9)
    const r = gate(`${a}-${b}`, wide, localEnv());
    const m = /claimed WIDENED port band (\d+)-(\d+)/.exec(r.stdout);
    check('8g f4: widening never enters the CI range — the up-candidate is skipped BY NAME and the claim slides down',
      r.status === 0 && /\[run-gate\] widening skipped \d+-\d+ \(extended up\): .*GH-687/.test(r.stdout)
        && m && Number(m[2]) < RES.start && /STAGED-687-WIDE ran/.test(r.stdout),
      `status ${r.status} ${(r.stderr + r.stdout).slice(0, 300)}`);
  }
  // ---- f9 / f10: the narrow-band refusal and the boundary law (owner ruling after review r6 P1) ----
  {
    const lanesT = cib.loadLaneBands(cib.LANE_BANDS_FILE, table);
    const plan = lanesT.bands.filter((b) => !b.legacy);
    const mine = plan.find((b) => b.lane === 'ci-red') ?? plan[0];
    // f9: a 10-wide band is refused at the seam BY NAME (the lane table and the lane's 30-wide band)
    const r9 = gate(`${mine.range.start}-${mine.range.start + 9}`, trivial, localEnv());
    check('8g f9: a --band narrower than the 30-port layout minimum is REFUSED at the seam by name — the lane table and the lane\'s plan band cited, nothing claimed',
      r9.status === 2 && /is 10 wide/.test(r9.stderr) && /lane-bands\.json/.test(r9.stderr) && r9.stderr.includes(`${mine.lane} lane`) && r9.stderr.includes(mine.band)
        && !/STAGED-687 ran/.test(r9.stdout), `status ${r9.status} ${r9.stderr.slice(0, 220)}`);
    // f10: an inventory that does not fit the 30-wide plan band never widens across the neighbours — refused naming them
    const idx = plan.indexOf(mine); const below = plan[idx - 1]; const above = plan[idx + 1];
    const r10 = gate(mine.band, wide, localEnv());
    check('8g f10: widening never crosses a declared boundary — a suite whose inventory does not fit the lane\'s plan band is refused (exit 2) naming the neighbours it would enter, nothing claimed',
      r10.status === 2 && /never widens across a declared band boundary/.test(r10.stdout + r10.stderr)
        && (!above || (r10.stdout + r10.stderr).includes(`${above.lane} lane`)) && (!below || (r10.stdout + r10.stderr).includes(`${below.lane} lane`))
        && !/claimed WIDENED/.test(r10.stdout) && !/STAGED-687-WIDE ran/.test(r10.stdout) && regEmpty(),
      `status ${r10.status} ${(r10.stderr + r10.stdout).slice(0, 300)}`);
    // and a widening that stays inside its home band is still allowed (a 40-wide undeclared window in the private registry)
    const homeFree = 45600 + ((process.pid * 41) % 300);
    const r11 = gate(`${homeFree}-${homeFree + 29}`, wide, localEnv());
    check('8g f10: in undeclared space a widening that enters no declared band is claimed as before',
      r11.status === 0 && /claimed WIDENED port band/.test(r11.stdout) && /STAGED-687-WIDE ran/.test(r11.stdout), `status ${r11.status} ${(r11.stderr + r11.stdout).slice(0, 200)}`);
  }
  // ---- f11: env pins are validated on EVERY invocation, bandless included (review r8 P2) ----
  {
    const lanesT = cib.loadLaneBands(cib.LANE_BANDS_FILE, table);
    const plan = lanesT.bands.filter((b) => !b.legacy);
    const atelier = table.jobs.find((j) => j.job === 'e2e-atelier');
    const bandless = (env) => spawnSync(process.execPath, [runGate, '--no-canary', '--no-belt', '--', trivial],
      { encoding: 'utf8', timeout: 90000, cwd: WEB_DIR, env });
    const r1 = bandless({ ...localEnv(), OB_E2E_PORT: String(atelier.pins.OB_E2E_PORT) });
    check('8g f11: a BANDLESS run with OB_E2E_PORT inside the CI reserved range is refused at start (exit 2, the job named, the suite never ran)',
      r1.status === 2 && /env pin OB_E2E_PORT=/.test(r1.stderr) && new RegExp(`job ${atelier.job}`).test(r1.stderr) && !/STAGED-687 ran/.test(r1.stdout),
      `status ${r1.status} ${r1.stderr.slice(0, 200)}`);
    const lane0 = plan[1] ?? plan[0];
    const r2 = bandless({ ...localEnv(), OB_E2E_CDP_PORT: String(lane0.range.start + 15) });
    check('8g f11: a BANDLESS run with a pin inside a declared LANE band is refused by name with the --band remedy (an unclaimed squat)',
      r2.status === 2 && /env pin OB_E2E_CDP_PORT=/.test(r2.stderr) && r2.stderr.includes(`${lane0.lane} lane`) && r2.stderr.includes(`--band ${lane0.band}`) && !/STAGED-687 ran/.test(r2.stdout),
      `status ${r2.status} ${r2.stderr.slice(0, 200)}`);
    const r3 = bandless({ ...localEnv(), OB_E2E_BAND_START: String(RES.start - 5), OB_E2E_BAND_END: String(RES.start + 5) });
    check('8g f11: an OB_E2E_BAND_START/END range straddling the CI edge is refused too (every port-like pin by NAME)',
      r3.status === 2 && /OB_E2E_BAND_START\/END/.test(r3.stderr) && /CI reserved range/.test(r3.stderr), `status ${r3.status} ${r3.stderr.slice(0, 200)}`);
    const r4 = bandless({ ...localEnv(), OB_E2E_PORT: String(atelier.pins.OB_E2E_PORT), GITHUB_ACTIONS: 'true' });
    const r5 = bandless({ ...localEnv(), OB_E2E_PORT: '45700', OB_CDP_TIMEOUT_MS: '19000' });
    check('8g f11: under GITHUB_ACTIONS=true the same pin runs; a pin in undeclared space runs; a timing knob whose value looks like a port (OB_CDP_TIMEOUT_MS) is not a pin',
      r4.status === 0 && /STAGED-687 ran/.test(r4.stdout) && r5.status === 0 && /STAGED-687 ran/.test(r5.stdout),
      `r4 ${r4.status} ${r4.stderr.slice(0, 120)} | r5 ${r5.status} ${r5.stderr.slice(0, 120)}`);
    const pins = cib.pinEnvEntries({ OB_E2E_PORT: '9100', OB_CDP_PORT: '9200', OB_BATCH_PORT_BASE: '9300', OB_CDP_TIMEOUT_MS: '9400', OB_PORT_BANDS: '9500-9529.1', OB_PORT_BANDS_DIR: '/tmp/x', OB_E2E_BAND_START: '9600', OB_E2E_BAND_END: '9629', OB_X_WIDTH: '9700', OB_PACING_BASELINE_SAMPLES: '9800' });
    check('8g f11: pinEnvEntries keys on the env NAME (PORT|CDP|BAND_START|BAND_END|PORT_BASE) and excludes timing knobs, the pacing BASELINE knobs, the lineage list, the registry dir and unrelated names; BAND_START/END pair as a range',
      pins.map((x) => x.key).sort().join(',') === 'OB_BATCH_PORT_BASE,OB_CDP_PORT,OB_E2E_BAND_START/END,OB_E2E_PORT'
        && pins.find((x) => x.key === 'OB_E2E_BAND_START/END').range.end === 9629, JSON.stringify(pins.map((x) => x.key)));
    // refuter legs: an ARGV pin; OB_CI_BANDS=1 exempts only the CI range; a pin in a FOREIGN band under --band; inventory-widened pins; the legacy remedy
    const r6 = spawnSync(process.execPath, [runGate, '--no-canary', '--no-belt', '--', trivial, '--port', String(atelier.pins.OB_E2E_PORT)],
      { encoding: 'utf8', timeout: 90000, cwd: WEB_DIR, env: localEnv() });
    check('8g f11: a `--port <CI port>` flag in the wrapped command is a pin too — refused naming the job (argv pins)',
      r6.status === 2 && /argv pin --port=/.test(r6.stderr) && new RegExp(`job ${atelier.job}`).test(r6.stderr), `status ${r6.status} ${r6.stderr.slice(0, 200)}`);
    const r7 = bandless({ ...localEnv(), OB_CI_BANDS: '1', OB_E2E_CDP_PORT: String(lane0.range.start + 15) });
    check('8g f11: OB_CI_BANDS=1 exempts ONLY the CI-range rule — a bandless lane-band pin under it is still refused (GITHUB_ACTIONS=true exempts everything)',
      r7.status === 2 && r7.stderr.includes(`${lane0.lane} lane`), `status ${r7.status} ${r7.stderr.slice(0, 200)}`);
    const mine = plan.find((b) => b.lane === 'ci-red') ?? plan[0]; // (f9's binding is block-scoped)
    const other = plan.find((b) => b.lane !== mine.lane);
    const r8 = gate(mine.band, trivial, { ...localEnv(), OB_E2E_CDP_PORT: String(other.range.start + 15) });
    check('8g f11: with --band, a pin inside a FOREIGN declared band is refused naming that lane and the assigned band (a claim never binds in a foreign band)',
      r8.status === 2 && r8.stderr.includes(`${other.lane}`) && /outside the assigned band/.test(r8.stderr) && !/STAGED-687 ran/.test(r8.stdout), `status ${r8.status} ${r8.stderr.slice(0, 220)}`);
    const wide27 = path.join(stage, 'wide27.mjs');
    fs.writeFileSync(wide27, "export const PORT_INVENTORY = { http: 1, cdp: 27 };\nconsole.log('STAGED-687-W27 ran');\n");
    const r9b = spawnSync(process.execPath, [runGate, '--no-canary', '--no-belt', '--', wide27], { encoding: 'utf8', timeout: 90000, cwd: WEB_DIR, env: { ...localEnv(), OB_E2E_CDP_PORT: String(RES.start - 10) } });
    check('8g f11: a bandless pin 10 ports below the CI edge is widened by the suite\'s declared inventory (cdp 27 → +26) and refused (point checks are not enough)',
      r9b.status === 2 && /OB_E2E_CDP_PORT\(\+26\)=/.test(r9b.stderr) && /CI reserved range/.test(r9b.stderr) && !/STAGED-687-W27 ran/.test(r9b.stdout), `status ${r9b.status} ${r9b.stderr.slice(0, 220)}`);
    const legacy = lanesT.bands.find((b) => b.legacy);
    if (legacy) {
      const planOf = lanesT.bands.find((b) => b.lane === legacy.lane && !b.legacy);
      const r10 = bandless({ ...localEnv(), OB_E2E_CDP_PORT: String(legacy.range.start + 5) });
      check('8g f11: a bandless pin inside a LEGACY lane row is refused naming the legacy band, its expiry, and the lane\'s PLAN band as the remedy',
        r10.status === 2 && r10.stderr.includes(`legacy band ${legacy.band} (until ${legacy.until})`) && r10.stderr.includes(`--band ${planOf.band}`), `status ${r10.status} ${r10.stderr.slice(0, 220)}`);
    }
  }
  // the DERIVED scan set of this tree, computed once (f16 and the f6 tree arms read it)
  let treeHitsMemo = null;
  const treeHitsFor = () => { if (!treeHitsMemo) treeHitsMemo = __treeHitsMemo; if (!treeHitsMemo) { const root = path.resolve(WEB_DIR, '..'); treeHitsMemo = cib.scanToolDefaultFiles(cib.deriveScanFiles(root).map((f) => f.path), root); } return treeHitsMemo; };
  // ---- f13: ONE boundary predicate, THREE call sites (review r9 P2-2) --------------------
  // before r9 only the WIDENING path asked the boundary law: a valid-width --band spanning two
  // lane rows (9400-9459) or entering one from undeclared space (9380-9409) was claimed directly
  {
    const lanesT = cib.loadLaneBands(cib.LANE_BANDS_FILE, table);
    const plan = lanesT.bands.filter((b) => !b.legacy).sort((a, b) => a.range.start - b.range.start);
    const [p0, p1] = plan;
    const bandlessRun = (env) => spawnSync(process.execPath, [runGate, '--no-canary', '--no-belt', '--', trivial],
      { encoding: 'utf8', timeout: 90000, cwd: WEB_DIR, env });
    // site 1 — the ASSIGNED band
    const span = `${p0.range.start}-${p1.range.end}`;
    const r1 = gate(span, trivial, localEnv());
    check(`8g f13: --band ${span} (valid width, SPANS two lane rows) is refused at the seam naming BOTH lanes (exit 2, nothing claimed, suite never ran; red-proof: 9ff1c975 claimed it)`,
      r1.status === 2 && /spans the .* lane/.test(r1.stderr) && /never crosses a declared band boundary/.test(r1.stderr)
        && r1.stderr.includes(`${p0.lane} lane`) && r1.stderr.includes(`${p1.lane} lane`) && !/STAGED-687 ran/.test(r1.stdout) && regEmpty(),
      `status ${r1.status} ${r1.stderr.slice(0, 260)}`);
    const enter = `${p0.range.start - 20}-${p0.range.start + 9}`;
    const r2 = gate(enter, trivial, localEnv());
    check(`8g f13: --band ${enter} (valid width, ENTERS ${p0.lane}'s row from undeclared space) is refused naming the lane (exit 2, nothing claimed; red-proof: 9ff1c975 claimed it)`,
      r2.status === 2 && /enters the .* lane/.test(r2.stderr) && r2.stderr.includes(`${p0.lane} lane`) && !/STAGED-687 ran/.test(r2.stdout) && regEmpty(),
      `status ${r2.status} ${r2.stderr.slice(0, 260)}`);
    const r5 = gate(p1.band, trivial, localEnv());
    check(`8g f13: a band equal to ONE plan row (${p1.band}) passes the same predicate and claims as before`,
      r5.status === 0 && /STAGED-687 ran/.test(r5.stdout), `status ${r5.status} ${(r5.stderr + r5.stdout).slice(0, 200)}`);
    // site 3 — the env PIN as a range (BAND_START/END), with and without --band
    const spanEnv = { OB_E2E_BAND_START: String(p0.range.start), OB_E2E_BAND_END: String(p1.range.end) };
    const r3 = gate(p1.band, trivial, { ...localEnv(), ...spanEnv });
    check('8g f13: an env pin RANGE (OB_E2E_BAND_START/END) spanning two lane rows under --band is refused by the same predicate naming both lanes (outside the assigned band)',
      r3.status === 2 && /spans the .* lane/.test(r3.stderr) && r3.stderr.includes(`${p0.lane} lane`) && r3.stderr.includes(`${p1.lane} lane`) && /outside the assigned band/.test(r3.stderr),
      `status ${r3.status} ${r3.stderr.slice(0, 260)}`);
    const r4 = bandlessRun({ ...localEnv(), ...spanEnv });
    check('8g f13: bandless, the same spanning pin range is refused as an unclaimed squat naming both lanes',
      r4.status === 2 && /spans the .* lane/.test(r4.stderr) && r4.stderr.includes(`${p0.lane} lane`) && r4.stderr.includes(`${p1.lane} lane`) && /NO --band claim/.test(r4.stderr),
      `status ${r4.status} ${r4.stderr.slice(0, 260)}`);
    // the same env at all three sites (refuter r9 P2: OB_CI_BANDS=1 used to skip the seam block — width check
    // and boundary law — while the widening and pin sites still applied them)
    const c1 = gate(span, trivial, { ...localEnv(), OB_CI_BANDS: '1' });
    check('8g f13: under OB_CI_BANDS=1 (only the CI-range rule is waived) the spanning --band is still refused at the seam naming both lanes',
      c1.status === 2 && /spans the .* lane/.test(c1.stderr) && c1.stderr.includes(`${p0.lane} lane`) && c1.stderr.includes(`${p1.lane} lane`) && !/STAGED-687 ran/.test(c1.stdout),
      `status ${c1.status} ${c1.stderr.slice(0, 220)}`);
    const c2 = gate(`${p0.range.start}-${p0.range.start + 9}`, trivial, { ...localEnv(), OB_CI_BANDS: '1' });
    check('8g f13: under OB_CI_BANDS=1 a 10-wide --band gets the NAMED width refusal (exit 2), not the generic EX_TEMPFAIL',
      c2.status === 2 && /is 10 wide/.test(c2.stderr) && /lane-bands\.json/.test(c2.stderr), `status ${c2.status} ${c2.stderr.slice(0, 220)}`);
    const c3 = gate(p1.band, wide, { ...localEnv(), OB_CI_BANDS: '1' });
    const nb = plan.filter((b) => b !== p1 && Math.abs(b.range.start - p1.range.start) === 30);
    check('8g f13: under OB_CI_BANDS=1 the WIDENING site (live) still refuses every candidate that leaves the home row, naming the neighbours',
      c3.status === 2 && /never widens across a declared band boundary/.test(c3.stdout + c3.stderr) && nb.every((b) => (c3.stdout + c3.stderr).includes(`${b.lane} lane`)) && !/claimed WIDENED/.test(c3.stdout),
      `status ${c3.status} ${(c3.stderr + c3.stdout).slice(0, 260)}`);
    // the verb states the fact: a pin range straddling ONE row's edge 'enters' it and gets the move-the-pin cure, never a `--band <row>` remedy that cannot hold it
    const r6 = bandlessRun({ ...localEnv(), OB_E2E_BAND_START: String(p0.range.start - 10), OB_E2E_BAND_END: String(p0.range.start + 5) });
    check(`8g f13: a pin range straddling ${p0.lane}'s lower edge is refused as 'enters' (not 'lies inside') with the move-the-pin cure and no --band remedy`,
      r6.status === 2 && /enters the .* lane/.test(r6.stderr) && /move the pin into ONE declared band/.test(r6.stderr) && !/run with --band/.test(r6.stderr), `status ${r6.status} ${r6.stderr.slice(0, 240)}`);
    // site 2 — the WIDENING candidate is proved live by f10 (and c3 above); here the predicate itself and the wiring (one function, three sites)
    const D = cib.declaredBands(table, lanesT);
    const v = cib.bandBoundary(D, p0.range.start, p1.range.end);
    const homeP1 = D.find((d) => d.lane === p1.lane && !d.legacy);
    const w = cib.crossingRefusal(D, homeP1, p1.range.start, p1.range.end + 5);
    const w0 = cib.crossingRefusal(D, null, p0.range.start, p0.range.end); // from undeclared space onto ONE foreign row: a crossing (r6 law), refuter P3
    let rev = null; try { cib.bandBoundary(D, p0.range.end, p0.range.start); } catch (e) { rev = e.message; }
    const libText = fs.readFileSync(path.join(WEB_DIR, 'tools', 'lib', 'ci-bands.mjs'), 'utf8');
    const rgText = fs.readFileSync(runGate, 'utf8');
    const bodyOf = (name) => { const i = libText.indexOf(`export function ${name}(`); return i < 0 ? '' : libText.slice(i, libText.indexOf('\n}\n', i)); };
    check('8g f13: ONE predicate — bandBoundary reads the spanning band as `spans` two rows and a widening candidate as leaving its home; boundaryRefusal, crossingRefusal and pinRefusal are built on it (source); run-gate asks it at the --band seam, on every widening candidate and on every pin (source)',
      !v.ok && v.reason === 'spans' && v.touched.length === 2 && /leaves the .* lane.*never widens across a declared band boundary/.test(String(w))
        && /enters the .* lane.*never widens across/.test(String(w0)) && /not a range/.test(String(rev))
        && bodyOf('boundaryRefusal').includes('bandBoundary(') && bodyOf('crossingRefusal').includes('boundaryRefusal(') && bodyOf('pinRefusal').includes('bandBoundary(')
        && /ciBands\.boundaryRefusal\(declared, band\.start, band\.end/.test(rgText) && /ciBands\.crossingRefusal\(declared, assignedHome, c\.start, c\.end\)/.test(rgText) && /ciBands\.pinRefusal\(/.test(rgText),
      JSON.stringify({ v: v.reason, touched: v.touched.length, w: String(w).slice(0, 100), w0: String(w0).slice(0, 80), rev }));
  }
  // ---- f14: the tool-default scan's ROOT SET is derived from the tracked tree (review r9 P2-1) ----
  // before r9 the scan walked web/tools only while tools/render drove cdp.mjs into the diamond /
  // snooker / verifiers plan rows
  {
    const lanesT = cib.loadLaneBands(cib.LANE_BANDS_FILE, table);
    const plan = lanesT.bands.filter((b) => !b.legacy).sort((a, b) => a.range.start - b.range.start);
    // the first two rows: the spanning claim below must not also overlap the shell driver's
    // --band (rows 3+4) — one fixture, one subject, or the tool-default-overlap rule speaks too
    const [a, b] = [plan[0], plan[1]];
    const repo = fs.mkdtempSync('/tmp/obw-hygiene-687-roots-');
    const put = (rel, text) => { fs.mkdirSync(path.join(repo, path.dirname(rel)), { recursive: true }); fs.writeFileSync(path.join(repo, rel), text); };
    put('tools/render/sweep.mjs', `import * as cdp from '../../web/tools/cdp.mjs';\nexport const PORT_INVENTORY = { http: 1, cdp: 1 };\nconst band = await cdp.claimPortBand(${a.range.start + 10}, ${b.range.start + 9});\n`);
    put('docs/evidence/drive.mjs', `import { launchChrome } from '../../web/tools/cdp.mjs';\nconst PORT = Number(process.env.X_PORT ?? 8460);\nconst DBG = Number(process.env.X_DBG ?? ${plan[0].range.start + 3});\nconst PORT2 = PORT + 1;\nconst c = await launchChrome(u, { port: DBG });\n`);
    put('docs/notes/unrelated.mjs', `export const answer = ${plan[1].range.start + 1};\n`); // a port-shaped literal in a file that never touches the harness
    put('web/tools/plain.mjs', `console.log('no ports here');\n`);
    put('web/tools/untracked.mjs', `import './cdp.mjs';\nconst x = ${plan[2].range.start + 1};\n`); // written but never added
    // shell drivers (refuter r9): a quoted env pin on a run line into a plan row, a ${X:-N} default into another, a --band literal spanning two rows, a comment that must not count
    put('docs/evidence/battery.sh', `#!/bin/zsh\n# OB_E2E_CDP_PORT=${plan[3].range.start + 1} in a comment never counts\nrun_one e2e-tables "8453 ${plan[1].range.start + 15}" "OB_E2E_PORT=8453 OB_E2E_CDP_PORT=${plan[1].range.start + 15}" web/tools/e2e-tables.mjs\nexport OB_E2E_CDP_PORT="\${OB_E2E_CDP_PORT:-${plan[2].range.start + 15}}"\nnode web/tools/run-gate.mjs --band ${plan[3].range.start}-${plan[4].range.end} -- node web/tools/e2e.mjs\nOB_CDP_TIMEOUT_MS=${plan[5].range.start + 1}\n`);
    put('tools/render/clean.sh', `#!/bin/zsh\nexport OB_E2E_PORT="\${OB_E2E_PORT:-10300}" OB_E2E_CDP_PORT="\${OB_E2E_CDP_PORT:-10301}"\nnode web/tools/e2e.mjs\n`);
    const git = (...args) => spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8', timeout: SYNC_CHILD_TIMEOUT_MS });
    git('init', '-q'); git('add', 'tools', 'docs', 'web/tools/plain.mjs'); // battery.sh and clean.sh ride in with docs/ and tools/ git('-c', 'user.name=h', '-c', 'user.email=h@x', 'commit', '-qm', 'fixture');
    const set = cib.deriveScanFiles(repo).map((f) => f.path);
    check('8g f14: the root set is DERIVED (git ls-files + harness signatures): tools/render and docs/evidence drivers AND shell drivers are in it; an unrelated port-shaped literal, a plain tool and an untracked file are not',
      set.includes('tools/render/sweep.mjs') && set.includes('docs/evidence/drive.mjs') && set.includes('docs/evidence/battery.sh') && set.includes('tools/render/clean.sh')
        && !set.includes('docs/notes/unrelated.mjs') && !set.includes('web/tools/plain.mjs') && !set.includes('web/tools/untracked.mjs'), JSON.stringify(set));
    const hits = cib.scanToolDefaultFiles(set, repo);
    const r = cib.lintCiBands({ table, workflows: {}, toolDefaults: hits, laneBands: lanesT });
    const sweep = r.problems.filter((p) => p.detail.startsWith('tools/render/sweep.mjs'));
    check(`8g f14: a tools/render scratch claiming ${a.range.start + 10}-${b.range.start + 9} is named against ${a.lane} AND ${b.lane} (red-proof: 9ff1c975's lint scanned web/tools only and passed the tree)`,
      sweep.length === 1 && sweep[0].kind === 'tool-default-in-lane-band' && sweep[0].detail.includes(`${a.lane} lane`) && sweep[0].detail.includes(`${b.lane} lane`),
      JSON.stringify(sweep.map((p) => p.detail.slice(0, 200))));
    const drive = r.problems.filter((p) => p.detail.startsWith('docs/evidence/drive.mjs'));
    check('8g f14: a docs/evidence driver launching on an env-named default inside a plan row is named (one-hop trace) and its missing inventory fails closed',
      drive.some((p) => p.kind === 'tool-default-in-lane-band') && drive.some((p) => p.kind === 'undeclared-inventory'),
      JSON.stringify(drive.map((p) => p.kind + ' ' + p.detail.slice(0, 120))));
    const sh = r.problems.filter((p) => p.detail.startsWith('docs/evidence/battery.sh'));
    const shKinds = sh.map((p) => `${p.kind}@${/battery\.sh:(\d+)/.exec(p.detail)?.[1]}`).sort();
    check(`8g f14: the SHELL reader names a quoted env pin on a run line (${plan[1].lane}), a \${X:-N} default (${plan[2].lane}) and a --band literal spanning ${plan[3].lane}+${plan[4].lane}; a commented pin and a timing knob are not hits`,
      shKinds.join(',') === 'tool-default-in-lane-band@3,tool-default-in-lane-band@4,tool-default-in-lane-band@5'
        && sh.some((p) => p.detail.includes(`${plan[1].lane} lane`) && /shell-env-pin/.test(p.detail)) && sh.some((p) => /shell-env-default/.test(p.detail) && p.detail.includes(`${plan[2].lane} lane`))
        && sh.some((p) => /shell-band/.test(p.detail) && p.detail.includes(`${plan[3].lane} lane`) && p.detail.includes(`${plan[4].lane} lane`))
        && !r.problems.some((p) => p.detail.startsWith('tools/render/clean.sh')),
      JSON.stringify(sh.map((p) => p.detail.slice(0, 160))));
    const nogit = fs.mkdtempSync('/tmp/obw-hygiene-687-nogit-'); fs.writeFileSync(path.join(nogit, 'x.mjs'), 'import "./cdp.mjs";\n');
    let thrown = null; try { cib.deriveScanFiles(nogit); } catch (e) { thrown = e.message; }
    check('8g f14: a tree git cannot list makes the lint FAIL closed (the roots are never guessed from a directory)',
      /cannot derive the tool-default scan roots/.test(thrown ?? ''), String(thrown).slice(0, 160));
    fs.rmSync(repo, { recursive: true, force: true }); fs.rmSync(nogit, { recursive: true, force: true });
    const real = cib.deriveScanFiles(path.resolve(WEB_DIR, '..'));
    check('8g f14: on this tree the derived set reaches beyond web/tools — the suites AND the tools/render drivers review r9 named, read from git',
      real.some((f) => f.path === 'web/tools/e2e.mjs') && real.some((f) => f.path === 'tools/render/orbitsweep-489.mjs') && real.length > 120, `${real.length} files`);
  }
  // ---- f15: argv pins BY DECLARATION — run-gate never guesses a flag's meaning (review r10 P2 ×2) ----
  {
    const lanesT = cib.loadLaneBands(cib.LANE_BANDS_FILE, table);
    const plan = lanesT.bands.filter((b) => !b.legacy).sort((a, b) => a.range.start - b.range.start);
    const [p0, p1] = plan;
    const uiRow = table.jobs.find((r) => r.job === 'e2e-ui-audit');
    const W = (name, text) => { const f = path.join(stage, name); fs.writeFileSync(f, text); return f; };
    // the real capture-034-play declares --port as its CDP base (11 slots) and --serve as http — the scratch mirrors its header exactly
    const capText = fs.readFileSync(path.join(WEB_DIR, 'tools', 'capture-034-play.mjs'), 'utf8');
    const capFlags = cib.portFlagsOfText(capText).flags; const capInv = cib.inventoryOfText(capText);
    check('8g f15: capture-034-play declares PORT_FLAGS { --port: cdp, --serve: http } next to a cdp inventory > 1 (the shape review r10 named)',
      capFlags && capFlags['--port'] === 'cdp' && capFlags['--serve'] === 'http' && capInv && capInv.cdp > 1, JSON.stringify({ capFlags, capInv }));
    const flagged = W('flagged.mjs', `export const PORT_INVENTORY = { http: ${capInv?.http ?? 1}, cdp: ${capInv?.cdp ?? 11} };\nexport const PORT_FLAGS = { '--serve': 'http', '--port': 'cdp' };\nconsole.log('STAGED-FLAGS ran on ' + process.env.OB_E2E_PORT + '/' + process.env.OB_E2E_CDP_PORT + ' argv ' + process.argv.slice(2).join(' '));\n`);
    const laneb = W('laneb.mjs', `export const PORT_FLAGS = { '--http-port': 'http', '--http-port2': 'http', '--cdp-port': 'cdp', '--cdp-port2': 'cdp' };\nconsole.log('STAGED-LANEB ran');\n`);
    const undecl = W('undeclared.mjs', `export const PORT_INVENTORY = { http: 1, cdp: 1 };\nconsole.log('STAGED-UNDECLARED ran');\n`);
    const noneT = W('noneflag.mjs', `export const PORT_FLAGS = { '--viewport': 'none', '--port': 'http' };\nconsole.log('STAGED-NONE ran on ' + process.env.OB_E2E_PORT);\n`);
    const gateA = (bandStr, suite, extra, env = localEnv()) => spawnSync(process.execPath,
      [runGate, ...(bandStr ? ['--band', bandStr] : []), '--no-canary', '--no-belt', '--', suite, ...extra], { encoding: 'utf8', timeout: 90000, cwd: WEB_DIR, env });
    const cdpTailPort = p0.range.start + 26; // 9426 under 9400-9429: a cdp base whose 11 slots end at 9436, inside the next lane
    const tail = cdpTailPort + (capInv?.cdp ?? 11) - 1;
    const a = gateA(p0.band, flagged, ['--port', String(cdpTailPort), '--serve', String(p0.range.start + 1)]);
    check(`8g f15: capture-034-play's shape under --band ${p0.band} with --port ${cdpTailPort} is refused naming the declared cdp role and its tail ${tail} in ${p1.lane}'s band (exit 2, nothing ran; red-proof: b7943a31 ran it as an http pin)`,
      a.status === 2 && a.stderr.includes(`--port=${cdpTailPort}`) && /declared cdp/.test(a.stderr) && a.stderr.includes(`tail ${tail}`) && a.stderr.includes(`${p1.lane} lane`) && !/STAGED-FLAGS ran/.test(a.stdout),
      `status ${a.status} ${a.stderr.slice(0, 260)}`);
    const a2 = gateA(p0.band, flagged, [`--port=${cdpTailPort}`, '--serve', String(p0.range.start + 1)]);
    check('8g f15: run-gate treats the `--port=N` form as the same pin whether or not the tool\'s parser reads that form (fail-closed: refused the same way)', a2.status === 2 && a2.stderr.includes(`tail ${tail}`), `status ${a2.status} ${a2.stderr.slice(0, 160)}`);
    const b = gateA(p1.band, laneb, ['--http-port', String(uiRow.pins.OB_E2E_PORT)]);
    check(`8g f15: laneB-evidence's shape with --http-port ${uiRow.pins.OB_E2E_PORT} is refused naming the ${uiRow.job} job (a declared http flag is a pin; red-proof: b7943a31 knew no --http-port)`,
      b.status === 2 && /argv pin --http-port=/.test(b.stderr) && b.stderr.includes(`job ${uiRow.job}`) && !/STAGED-LANEB ran/.test(b.stdout), `status ${b.status} ${b.stderr.slice(0, 220)}`);
    const c = gateA(p1.band, undecl, ['--foo-port', String(p1.range.start + 3)]);
    check('8g f15: a tool passed a numeric port-like flag but declaring NO PORT_FLAGS is refused by name, in any band (fail-closed; red-proof: b7943a31 ran it)',
      c.status === 2 && /declares no PORT_FLAGS/.test(c.stderr) && /--foo-port=/.test(c.stderr) && !/STAGED-UNDECLARED ran/.test(c.stdout), `status ${c.status} ${c.stderr.slice(0, 220)}`);
    const d = gateA(p1.band, flagged, ['--foo-port', String(p1.range.start + 3)]);
    check('8g f15: a declared tool passed a flag OUTSIDE its declaration is refused naming the flag and the declared set',
      d.status === 2 && /declares no role for --foo-port/.test(d.stderr) && /--serve, --port/.test(d.stderr), `status ${d.status} ${d.stderr.slice(0, 220)}`);
    const e = gateA(p1.band, noneT, ['--viewport', '1280', '--port', String(p1.range.start)]);
    check("8g f15: a flag declared 'none' (numeric, not a port) passes; a declared http flag inside the band runs the tool on it",
      e.status === 0 && new RegExp(`STAGED-NONE ran on ${p1.range.start}`).test(e.stdout), `status ${e.status} ${(e.stderr + e.stdout).slice(0, 200)}`);
    const f = gateA(p1.band, undecl, ['--foo-port', String(p1.range.start + 3)], { ...localEnv(), GITHUB_ACTIONS: 'true' });
    check('8g f15: the declaration law holds in CI context too (GITHUB_ACTIONS=true waives band rules, never the no-guess rule)',
      f.status === 2 && /declares no PORT_FLAGS/.test(f.stderr), `status ${f.status} ${f.stderr.slice(0, 160)}`);
    // off-default in-band values (refuter r10: the layout's own http(0)/cdp(0) could not tell a pin-built hull from the plain layout); the
    // tool echoes its argv — run-gate does not rewrite the pins into the child's env (the suites' argv-first convention reads them itself)
    const g = gateA(p1.band, flagged, ['--port', String(p1.range.start + 17), '--serve', String(p1.range.start + 2)]);
    check('8g f15: with the roles declared, an off-default cdp --port and http --serve inside the band claim and the tool runs with them on its argv (the hull is built from the declared roles)',
      g.status === 0 && /STAGED-FLAGS ran on/.test(g.stdout) && g.stdout.includes(`--port ${p1.range.start + 17} --serve ${p1.range.start + 2}`) && !/refus/i.test(g.stderr),
      `status ${g.status} ${(g.stderr + g.stdout).slice(0, 220)}`);
    const i1 = gateA(p1.band, flagged, ['--port', '65536', '--serve', String(p1.range.start + 2)]);
    check('8g f15: a declared flag given a value no claim can hold (--port 65536) is refused as a shape mismatch, never passed through unjudged',
      i1.status === 2 && /no claim can hold/.test(i1.stderr) && !/STAGED-FLAGS ran/.test(i1.stdout), `status ${i1.status} ${i1.stderr.slice(0, 160)}`);
    const badDecl = W('baddecl.mjs', `export const PORT_FLAGS = { '--port': 'tcp' };\nconsole.log('STAGED-BAD ran');\n`);
    const h = gateA(p1.band, badDecl, ['--port', String(p1.range.start)]);
    check('8g f15: a PORT_FLAGS declaration that does not parse refuses the wrap (fail-closed), never reads as undeclared',
      h.status === 2 && /does not parse/.test(h.stderr) && !/STAGED-BAD ran/.test(h.stdout), `status ${h.status} ${h.stderr.slice(0, 160)}`);
  }
  // ---- f16: the lint reads what each tool's argv parser READS and holds PORT_FLAGS to it (review r10 P2, item 3) ----
  {
    const dir = fs.mkdtempSync('/tmp/obw-hygiene-687-flags-');
    const W = (name, body) => fs.writeFileSync(path.join(dir, `${name}.mjs`), body);
    const H = "const argOf = (k, d) => d; const arg = (k, d) => d; const flag = (k, d) => d; const args = process.argv.slice(2);\n";
    // one scratch per read syntax, each declared correctly → clean
    W('quoted', H + "export const PORT_FLAGS = { '--port': 'http' };\nconst PORT = Number(argOf('--port') ?? 8460);\nconst s = spawnStaticServer(webDir, PORT);\n");
    W('bare', H + "export const PORT_FLAGS = { '--serve': 'http', '--port': 'cdp' };\nconst PORT = Number(arg('serve', 8460));\nconst CDP = Number(arg('port', 8475));\nconst s = spawnStaticServer(webDir, PORT);\nconst c = await launchChrome(u, { port: CDP });\n");
    W('bareflag', H + "export const PORT_FLAGS = { '--cdp': 'cdp' };\nconst CDP = flag('cdp', 8475);\nconst c = await launchChrome(u, { port: CDP });\n");
    W('member', H + "export const PORT_FLAGS = { '--port': 'http' };\nconst PORT = args.includes('--port') ? Number(args[args.indexOf('--port') + 1]) : 8460;\nconst u = `http://127.0.0.1:${PORT}/app.html`;\n");
    W('compare', H + "export const PORT_FLAGS = { '--port': 'http' };\nconst a = {};\nfor (let i = 0; i < args.length; i++) { const k = args[i]; if (k === '--port') a.port = Number(args[++i]); }\n");
    W('eqform', H + "export const PORT_FLAGS = { '--cdp-port': 'cdp' };\nconst v = args.find((x) => x.startsWith('--cdp-port='));\nconst CDP = Number(v ? v.split('=')[1] : 8475);\nconst c = await launchChrome(u, { port: CDP });\n");
    W('list', H + "export const PORT_FLAGS = { '--port': 'http', '--kill-server-once': 'none' };\nconst VALUE_FLAGS = ['--outdir', '--port', '--times'];\nconst PORT_ARG = argOf('--port');\nconst once = args.includes('--kill-server-once');\n");
    W('bandflag', H + "export const PORT_FLAGS = { '--band': 'band' };\nconst band = argOf('--band', '9940-9969');\n");
    // NOT reads: a child's flag written, a CSS custom property, Chrome's own switch in a template
    W('writer', H + "export const PORT_INVENTORY = { http: 5, cdp: 1 };\nconst PORT = Number(process.env.OB_E2E_PORT ?? 8157);\nspawnSync('node', ['web/tools/record.mjs', '--port', String(PORT + 1)]);\nconst t = `--remote-debugging-port=${PORT + 2}`;\n");
    W('css', H + "const h = cs.getPropertyValue('--ob-replays-band-h');\n");
    // defects
    W('missing', H + "const PORT = Number(argOf('--port') ?? 8460);\n");
    W('undeclared', H + "export const PORT_FLAGS = { '--port': 'http' };\nconst PORT = Number(argOf('--port') ?? 8460);\nconst CDP = Number(argOf('--cdp') ?? 8475);\n");
    W('unread', H + "export const PORT_FLAGS = { '--port': 'http', '--cdp': 'cdp' };\nconst PORT = Number(argOf('--port') ?? 8460);\n");
    W('mismatch', H + "export const PORT_FLAGS = { '--port': 'http' };\nconst CDP = Number(argOf('--port') ?? 8475);\nconst c = await launchChrome(u, { port: CDP });\n");
    W('nonemis', H + "export const PORT_FLAGS = { '--port': 'none' };\nconst PORT = Number(argOf('--port') ?? 8460);\nconst s = spawnStaticServer(webDir, PORT);\n");
    W('malformed', H + "export const PORT_FLAGS = {\n  '--port': 'http' };\nconst PORT = Number(argOf('--port') ?? 8460);\n");
    // refuter r10: a `/*` inside a `//` comment must not blind the reader; a flag-name list must not steal the role check; push/two-line writes are writes
    W('globblind', H + "// frames live under out/<table>/*.png so the sweep can find them\nconst BAND = argOf('--band', '9940-9969');\nclaimPortBand(BAND);\n/* end of tool */\n");
    W('listwrong', H + "export const PORT_FLAGS = { '--port': 'cdp' };\nconst VALUE_FLAGS = ['--outdir', '--port', '--times'];\nconst PORT = Number(argOf('--port') ?? 8460);\nconst s = spawnStaticServer(webDir, PORT);\n");
    W('pushwrite', H + "const PORT = Number(process.env.OB_E2E_PORT ?? 8157);\nconst a = [];\na.push('--port', String(PORT));\nspawnSync('node', ['x.mjs', '--port',\n  String(PORT + 1)]);\n");
    const hits = cib.scanToolDefaults(dir).filter((d) => /^port-flag/.test(d.syntax));
    const kinds = (f) => hits.filter((d) => d.file === `${f}.mjs`).map((d) => d.syntax).sort().join(',');
    check('8g f16: every read syntax the tree uses — quoted argOf, bare arg/flag, includes/indexOf, a compare loop, a `--x=` prefix, a VALUE_FLAGS list, a band flag — is read and a correct declaration is clean',
      ['quoted', 'bare', 'bareflag', 'member', 'compare', 'eqform', 'list', 'bandflag'].every((f) => kinds(f) === ''),
      JSON.stringify(['quoted', 'bare', 'bareflag', 'member', 'compare', 'eqform', 'list', 'bandflag'].map((f) => [f, kinds(f)])));
    check("8g f16: a child's flag WRITTEN (`['--port', String(PORT + 1)]`), Chrome's own switch in a template and a CSS custom property are NOT reads (no declaration demanded)",
      kinds('writer') === '' && kinds('css') === '', JSON.stringify([kinds('writer'), kinds('css')]));
    check('8g f16: reading a port-like flag with NO PORT_FLAGS is port-flags-missing; a read outside the declaration is port-flag-undeclared; a declared flag never read is port-flag-unread',
      kinds('missing') === 'port-flags-missing' && kinds('undeclared') === 'port-flag-undeclared' && kinds('unread') === 'port-flag-unread',
      JSON.stringify([kinds('missing'), kinds('undeclared'), kinds('unread')]));
    check("8g f16: a role the USE contradicts is port-flag-role-mismatch — `--port` declared http but fed to launchChrome({ port }), or declared 'none' but fed to a static server; a declaration that does not parse is port-flags-malformed",
      kinds('mismatch') === 'port-flag-role-mismatch' && kinds('nonemis') === 'port-flag-role-mismatch' && kinds('malformed') === 'port-flags-malformed',
      JSON.stringify([kinds('mismatch'), kinds('nonemis'), kinds('malformed'), hits.filter((d) => d.file === 'mismatch.mjs').map((d) => d.text.slice(0, 120))]));
    check('8g f16: a `/*` inside a `//` comment does not blind the reader (the read behind it is still port-flags-missing — craft-look\'s header shape); a flag-name list before the reader call does not steal the role check (wrong role still named); `.push(\'--port\', …)` and a value on the next line are writes, not reads',
      kinds('globblind') === 'port-flags-missing' && kinds('listwrong') === 'port-flag-role-mismatch' && kinds('pushwrite') === '',
      JSON.stringify([kinds('globblind'), kinds('listwrong'), kinds('pushwrite')]));
    fs.rmSync(dir, { recursive: true, force: true });
    const treeFlags = treeHitsFor().filter((d) => /^port-flag/.test(d.syntax));
    const lb = cib.portFlagsOfText(fs.readFileSync(path.join(WEB_DIR, '..', 'docs', 'verification', 'help-overlay', 'laneB-evidence.mjs'), 'utf8')).flags;
    const cl = cib.portFlagsOfText(fs.readFileSync(path.join(WEB_DIR, '..', 'tools', 'render', 'craft-look.mjs'), 'utf8')).flags;
    check('8g f16: on this tree every tool in the derived set that reads a port-like flag declares it, role by role (0 port-flag problems); laneB-evidence declares --http-port/--http-port2 http and --cdp-port/--cdp-port2 cdp; craft-look (the header the old stripper blanked) declares --band as band',
      treeFlags.length === 0 && lb && lb['--http-port'] === 'http' && lb['--http-port2'] === 'http' && lb['--cdp-port'] === 'cdp' && lb['--cdp-port2'] === 'cdp' && cl && cl['--band'] === 'band',
      JSON.stringify(treeFlags.map((d) => `${d.file}:${d.line} ${d.syntax}`).slice(0, 8)));
  }
  // ---- f17: derivation forms and positional shell ports (review r11 P2 ×2) ----
  {
    const lanesT = cib.loadLaneBands(cib.LANE_BANDS_FILE, table);
    const plan = lanesT.bands.filter((b) => !b.legacy).sort((a, b) => a.range.start - b.range.start);
    const dir = fs.mkdtempSync('/tmp/obw-hygiene-687-r11-');
    const W = (name, body) => fs.writeFileSync(path.join(dir, name), body);
    // (1) a running counter: `PORT + (seq++)` derives — no inventory → undeclared-inventory; with one → the bound is unknown (fail-closed)
    W('counter.mjs', "const PORT = Number(process.env.OB_E2E_PORT ?? 8391);\nlet seq = 0;\nconst bootPort = PORT + (seq++);\nconst c = await launchChrome(u, { port: bootPort });\n");
    W('counterdecl.mjs', "const PORT = Number(process.env.OB_E2E_PORT ?? 8391);\nexport const PORT_INVENTORY = { http: 3, cdp: 3 };\nlet seq = 0;\nconst bootPort = PORT + (seq++);\n");
    W('bounded.mjs', "const PORT = Number(process.env.OB_E2E_PORT ?? 8391);\nexport const PORT_INVENTORY = { http: 3, cdp: 3 };\nfor(let attempt=0;attempt<3&&!done;attempt++){ const bootPort=PORT+attempt; }\n");
    W('paren.mjs', "const CDP = Number(process.env.OB_E2E_CDP_PORT ?? 8190);\nconst p = CDP + (2);\n");
    // refuter r11: compound assignment and prefix increment are running counters too (chrome-diet's `cdpPort += 1`); the `(X % M)` bound needs a plain operand
    W('pluseq.mjs', "let cdpPort = Number(process.env.OB_E2E_CDP_PORT ?? 8190);\ncdpPort += 1;\n");
    W('prefix.mjs', "let CDP = Number(process.env.OB_E2E_CDP_PORT ?? 8190);\n++CDP;\n");
    W('modrot.mjs', "const CDP0 = Number(process.env.OB_E2E_CDP_PORT ?? 8190);\nexport const PORT_INVENTORY = { http: 1, cdp: 12 };\nlet seq = 0;\nconst p = CDP0 + (seq++ % 12);\n");
    W('modtrap.mjs', "const CDP = Number(process.env.OB_E2E_CDP_PORT ?? 8190);\nexport const PORT_INVENTORY = { http: 1, cdp: 4 };\nconst p = CDP + (x - 1 % 4);\n");
    const hits = cib.scanToolDefaults(dir);
    const kinds = (f) => hits.filter((d) => d.file === f).map((d) => d.syntax).filter((k) => /undeclared-inventory|offset-bound-unknown|inventory-undercount/.test(k)).sort().join(',');
    check('8g f17: `PORT + (seq++)` DERIVES — undeclared → undeclared-inventory; declared → offset-bound-unknown (fail-closed); the bounded rewrite `PORT + attempt` under a 3-iteration loop is clean; `CDP + (2)` derives; `cdpPort += 1` and `++CDP` derive; `CDP0 + (seq++ % 12)` reads +11 and is clean; `(x - 1 % 4)` (an operator inside the modulus) stays fail-closed (red-proof: bb700804 saw none of the parenthesised or compound forms)',
      kinds('counter.mjs') === 'undeclared-inventory' && kinds('counterdecl.mjs') === 'offset-bound-unknown' && kinds('bounded.mjs') === '' && kinds('paren.mjs') === 'undeclared-inventory'
        && kinds('pluseq.mjs') === 'undeclared-inventory' && kinds('prefix.mjs') === 'undeclared-inventory' && kinds('modrot.mjs') === '' && kinds('modtrap.mjs') === 'offset-bound-unknown',
      JSON.stringify(['counter.mjs', 'counterdecl.mjs', 'bounded.mjs', 'paren.mjs', 'pluseq.mjs', 'prefix.mjs', 'modrot.mjs', 'modtrap.mjs'].map((f) => [f, kinds(f)])));
    const cr = fs.readFileSync(path.join(WEB_DIR, '..', 'docs', 'verification', 'cloth-sheen', 'capture-real.mjs'), 'utf8');
    const crH = cib.httpOffsetsUsed(cr);
    check('8g f17: capture-real (the tool review r11 named) now derives PORT + attempt under a bounded loop, declares { http 3, cdp 3 } and the reader reads +2 with no unknown bound',
      !/bootSeq/.test(cr) && crH.maxOffset === 2 && crH.unknown.length === 0 && cib.inventoryOfText(cr)?.cdp === 3 && cib.derivesFromBase(cr), `max +${crH.maxOffset} unknown ${crH.unknown.length}`);
    // (2) positional shell port lists, with the named exemption
    const bad = plan[2].range.start + 3; // a plan-row port inside a quoted positional list
    W('battery.sh', `#!/bin/zsh\nrun_one e2e-8ball "8163 ${bad}" "" web/tools/e2e-8ball.mjs\nrun_one e2e-touch "8457 ${plan[3].range.start + 7}" "OB_E2E_PORT=8457 OB_E2E_CDP_PORT=${plan[3].range.start + 7}" web/tools/e2e-touch.mjs\necho "built ${plan[4].range.start + 1} frames" # ci-bands: not-a-port ${plan[4].range.start + 1} — a frame count\necho "year 2026 count 32000"\necho "made ${plan[5].range.start + 2} rows" # ci-bands: not-a-port ${plan[5].range.start + 2}\nnode web/tools/run-gate.mjs --band "${plan[6].range.start}-${plan[6].range.end}" -- node web/tools/e2e.mjs\n`);
    const sh = cib.scanShellDefaultsInText(fs.readFileSync(path.join(dir, 'battery.sh'), 'utf8'), 'battery.sh');
    const r = cib.lintCiBands({ table, workflows: {}, toolDefaults: sh, laneBands: lanesT });
    const rows = r.problems.filter((p) => p.detail.startsWith('battery.sh')).map((p) => `${/battery\.sh:(\d+)/.exec(p.detail)?.[1]}:${p.kind}:${/= (\d+)/.exec(p.detail)?.[1] ?? /\[shell-quoted-port\]/.test(p.detail)}`).sort();
    check(`8g f17: a positional quoted port list ("8163 ${bad}") is read — the plan-row token is named against ${plan[2].lane} (red-proof: bb700804's shell reader saw env pins and --band only); the same token inside an env string is reported ONCE; a named \`# ci-bands: not-a-port <n> — <why>\` exemption silences its token while one without a reason does not; a quoted band literal is one hit; 32000 and 2026 (outside 8000-20000) are not ports`,
      sh.some((h) => h.syntax === 'shell-quoted-port' && h.value === bad && h.line === 2) && sh.filter((h) => h.line === 3 && h.value === plan[3].range.start + 7).length === 1
        && !sh.some((h) => h.value === plan[4].range.start + 1) && !sh.some((h) => h.value === 32000 || h.value === 2026)
        && sh.some((h) => h.line === 6 && h.value === plan[5].range.start + 2) // an exemption without its reason does not count
        && sh.filter((h) => h.line === 7).length === 1 && sh.find((h) => h.line === 7).syntax === 'shell-band' // a quoted band literal is ONE hit, not band + token
        && rows.some((x) => x.startsWith('2:tool-default-in-lane-band')) && r.problems.some((p) => p.detail.includes(`${plan[2].lane} lane`) && /shell-quoted-port/.test(p.detail)),
      JSON.stringify({ hits: sh.map((h) => `${h.line}:${h.syntax}:${h.value}`), rows }));
    fs.rmSync(dir, { recursive: true, force: true });
    const t001 = fs.readFileSync(path.join(WEB_DIR, '..', 'docs', 'verification', 'help-overlay', 't001-run-battery.sh'), 'utf8');
    const t001Hits = cib.scanShellDefaultsInText(t001, 't001');
    check('8g f17: t001-run-battery.sh (the battery review r11 named) has no quoted or pinned port inside any declared lane row on this tree',
      !t001Hits.some((h) => lanesT.bands.some((b) => h.value >= b.range.start && h.value <= b.range.end)), JSON.stringify(t001Hits.filter((h) => lanesT.bands.some((b) => h.value >= b.range.start && h.value <= b.range.end)).map((h) => `${h.line}:${h.value}`)));
  }
  // ---- f18: ONE pin-name list for refusal, extents and widening (companion to #705; review round 12 P2) ----
  // the GH-410 hull read OB_E2E_CDP_PORT only while the env-pin validation keyed on a name rule: a nested
  // browser handed OB_CDP_PORT bound an unclaimed port outside the claim
  {
    const lanesT = cib.loadLaneBands(cib.LANE_BANDS_FILE, table);
    const plan = lanesT.bands.filter((b) => !b.legacy).sort((a, b) => a.range.start - b.range.start);
    const mine = plan.find((b) => b.lane === 'ci-red') ?? plan[1];
    const W = (name, text) => { const f = path.join(stage, name); fs.writeFileSync(f, text); return f; };
    const cue = W('cuepostlike.mjs', "export const PORT_INVENTORY = { http: 2, cdp: 1 };\nexport const PORT_FLAGS = {};\nconsole.log('STAGED-CUE ran on ' + process.env.OB_E2E_PORT + '/' + process.env.OB_E2E_CDP_PORT + ' OB_CDP_PORT=' + process.env.OB_CDP_PORT + ' bands=' + process.env.OB_PORT_BANDS);\n");
    const noinv = W('noinv.mjs', "console.log('STAGED-NOINV ran bands=' + process.env.OB_PORT_BANDS);\n");
    const gateE = (bandStr, suite, env) => spawnSync(process.execPath, [runGate, '--band', bandStr, '--no-canary', '--no-belt', '--', suite], { encoding: 'utf8', timeout: 90000, cwd: WEB_DIR, env });
    const far = 8000; // undeclared space, a full inventory width away from every lane row
    // (1) the list itself: every pin-like OB_* name the tree and the harness read is listed; the drift row fires on a scratch
    const harnessUnlisted = [];
    for (const f of cib.HARNESS_PIN_READERS) for (const [n] of cib.pinNamesRead(fs.readFileSync(path.join(WEB_DIR, '..', f), 'utf8'))) if (!(n in cib.PIN_NAMES)) harnessUnlisted.push(`${f}:${n}`);
    const treeDrift = treeHitsFor().filter((d) => d.syntax === 'pin-name-drift');
    check('8g f18: PIN_NAMES is the ONE list — every pin-like OB_* name read by the tree (derived set) and by run-gate / claim code is listed (0 pin-name-drift rows); OB_E2E_PORT / OB_E2E_CDP_PORT are the layout names, OB_CDP_PORT / OB_MOCK_* are exact extra pins (width 1), OB_BATCH_PORT_BASE / OB_TITLECARD_PORT are CDP bases with a derived range model',
      harnessUnlisted.length === 0 && treeDrift.length === 0 && cib.PIN_NAMES.OB_E2E_PORT.layout === true && cib.PIN_NAMES.OB_E2E_CDP_PORT.layout === true && cib.PIN_NAMES.OB_CDP_PORT.role === 'cdp' && !cib.PIN_NAMES.OB_CDP_PORT.layout && cib.PIN_NAMES.OB_CDP_PORT.width === 1 && cib.PIN_NAMES.OB_BATCH_PORT_BASE.role === 'cdp' && cib.PIN_NAMES.OB_BATCH_PORT_BASE.model?.kind === 'base',
      JSON.stringify({ harnessUnlisted, treeDrift: treeDrift.map((d) => `${d.file}:${d.name}`) }));
    const drift = cib.pinNameDrift("const a = Number(process.env.OB_FOO_PORT ?? 8500);\nconst s = `${process.env.OB_BAR_CDP}`;\nconst c = process.env['OB_QUX_PORT_BASE'];\nconst t = process.env[`OB_TPL_PORT`];\nconst o = process.env?.OB_OPT_CDP;\nconst ok = process.env.OB_CDP_PORT;\nconst str = \"process.env.OB_STR_PORT\";\n// process.env.OB_COMMENT_PORT\n", 'x.mjs');
    check('8g f18: a scratch that reads process.env.OB_FOO_PORT (dotted), a template `${process.env.OB_BAR_CDP}`, the bracket form, a backtick bracket and optional chaining is pin-name-drift ×5 (red-proof: ded11f42 had no such row); a listed name, a string and a comment are not',
      drift.map((d) => d.name).sort().join(',') === 'OB_BAR_CDP,OB_FOO_PORT,OB_OPT_CDP,OB_QUX_PORT_BASE,OB_TPL_PORT', JSON.stringify(drift.map((d) => d.name)));
    // (2) refusal consumes the list: an unlisted pin-like env name is refused by name
    const u = gateE(mine.band, cue, { ...localEnv(), OB_FOO_PORT: String(mine.range.start + 3) });
    check('8g f18: an env name that LOOKS like a pin but is not in PIN_NAMES is refused by name at the seam (refusal, extents and widening must never disagree about a name)',
      u.status === 2 && /not in PIN_NAMES/.test(u.stderr) && !/STAGED-CUE ran/.test(u.stdout), `status ${u.status} ${u.stderr.slice(0, 200)}`);
    // (3) extents consume the list: a far OB_CDP_PORT under a declared inventory → a SECOND claim the child inherits (red-proof: ded11f42 ran it with the port unclaimed)
    const s1 = gateE(mine.band, cue, { ...localEnv(), OB_CDP_PORT: String(far) });
    check(`8g f18: OB_CDP_PORT=${far} --band ${mine.band} on a suite declaring { http 2, cdp 1 } registers a SECOND claim ${far}-${far} in the registry and the child inherits it through OB_PORT_BANDS (red-proof: ded11f42's hull read OB_E2E_CDP_PORT only — the nested browser bound ${far} unclaimed)`,
      s1.status === 0 && /registered a SECOND claim 8000-8000 for the explicit OB_CDP_PORT pin/.test(s1.stdout) && new RegExp(`STAGED-CUE ran on ${mine.range.start}/${mine.range.start + 15} OB_CDP_PORT=${far} bands=[^\\s]*${far}-${far}\\.`).test(s1.stdout),
      `status ${s1.status} ${(s1.stderr + s1.stdout).slice(0, 300)}`);
    const s2 = gateE(mine.band, noinv, { ...localEnv(), OB_CDP_PORT: String(far) });
    check('8g f18: the same far pin on a suite with NO inventory is REFUSED (exit 2) naming the pin and the missing inventory — the default is refusal, never an unclaimed bind (red-proof: ded11f42 ran it)',
      s2.status === 2 && /lies outside the assigned band/.test(s2.stderr) && /declares no PORT_INVENTORY to size a second claim/.test(s2.stderr) && !/STAGED-NOINV ran/.test(s2.stdout), `status ${s2.status} ${s2.stderr.slice(0, 220)}`);
    const s3 = gateE('45600-45629', cue, { ...localEnv(), OB_E2E_CDP_PORT: '47000' });
    check('8g f18: a far LAYOUT pin (OB_E2E_CDP_PORT 1400 above the band — a hull over 1024 ports is not a claim) is registered as a second claim too and the child keeps the pinned value in its env',
      s3.status === 0 && /registered a SECOND claim 47000-47000 for the explicit OB_E2E_CDP_PORT pin/.test(s3.stdout) && /STAGED-CUE ran on 45600\/47000/.test(s3.stdout), `status ${s3.status} ${(s3.stderr + s3.stdout).slice(0, 240)}`);
    const s3b = gateE('45600-45629', cue, { ...localEnv(), OB_E2E_CDP_PORT: '45700' });
    check('8g f18: a NEAR pin (100 above the band, hull inside undeclared space) is still covered by the contiguous hull as before (GH-410 r7 kept: claimed WIDENED, no second claim)',
      s3b.status === 0 && /claimed WIDENED port band 45600-45700/.test(s3b.stdout) && !/SECOND claim/.test(s3b.stdout) && /STAGED-CUE ran on 45600\/45700/.test(s3b.stdout), `status ${s3b.status} ${(s3b.stderr + s3b.stdout).slice(0, 240)}`);
    const s4 = gateE(mine.band, cue, { ...localEnv(), OB_CDP_PORT: String(mine.range.start + 20) });
    check('8g f18: an extra pin INSIDE the band on a free slot runs under the one claim (no second claim, nothing to widen)',
      s4.status === 0 && !/SECOND claim/.test(s4.stdout) && /STAGED-CUE ran/.test(s4.stdout), `status ${s4.status} ${(s4.stderr + s4.stdout).slice(0, 200)}`);
    const s5 = gateE(mine.band, cue, { ...localEnv(), OB_CDP_PORT: String(mine.range.start + 15) });
    check('8g f18: an extra pin on the suite\'s OWN derived cdp(0) slot is refused as a clash (two browsers on one port), EX_TEMPFAIL — an extra pin never replaces the derived half',
      s5.status === 75 && /collides with the explicit OB_CDP_PORT pin/.test(s5.stderr) && !/STAGED-CUE ran/.test(s5.stdout), `status ${s5.status} ${s5.stderr.slice(0, 200)}`);
    const other = plan.find((b) => b !== mine);
    const s6 = gateE(mine.band, cue, { ...localEnv(), OB_CDP_PORT: String(other.range.start + 5) });
    check('8g f18: an extra pin inside a FOREIGN lane row is still refused by placement before any claim (the r9 predicate, unchanged)',
      s6.status === 2 && /outside the assigned band/.test(s6.stderr) && s6.stderr.includes(`${other.lane} lane`), `status ${s6.status} ${s6.stderr.slice(0, 200)}`);
    // (4) source: the hull and the plumbing set read the list, not a name of their own
    const rg = fs.readFileSync(runGate, 'utf8');
    const hull = rg.slice(rg.indexOf('const allEnvPins = ciBands.pinEnvEntries'), rg.indexOf('const nearExtents')).replace(/^\s*\/\/.*$/gm, '').replace(/\/\/.*$/gm, ''); // code only, comments dropped
    check('8g f18: run-gate builds its extents from ciBands.pinEnvEntries + ciBands.pinExtentsFor (the list, THE extents function shared with the table lint) and its fingerprint plumbing set from Object.keys(ciBands.PIN_NAMES) — no OB_* name of its own left in the hull',
      hull.length > 200 && !/process\.env\.OB_|'OB_E2E/.test(hull) && /ciBands\.pinExtentsFor\(/.test(hull) && /Object\.keys\(ciBands\.PIN_NAMES\)/.test(rg), `hull ${hull.length} chars`);
    // (5) refuter P1 on the companion: an EXTRA pin is its own width — the nightly battery row (pins 18740 / 18755 / OB_CDP_PORT 18790 inside 18740-18799) replayed
    // under GITHUB_ACTIONS=true with a scratch mirroring e2e-userboot's { http 1, cdp 16 } must claim EXACTLY its band (sizing OB_CDP_PORT by cdp 16 widened it to 18805)
    const battery = table.jobs.find((r) => r.job === 'battery');
    const ub = W('userbootlike.mjs', "export const PORT_INVENTORY = { http: 1, cdp: 16 };\nexport const PORT_FLAGS = {};\nconsole.log('STAGED-UB ran bands=' + process.env.OB_PORT_BANDS);\n");
    const n1 = gateE(battery.band, ub, { ...localEnv(), GITHUB_ACTIONS: 'true', OB_E2E_PORT: String(battery.pins.OB_E2E_PORT), OB_E2E_CDP_PORT: String(battery.pins.OB_E2E_CDP_PORT), OB_CDP_PORT: String(battery.pins.OB_CDP_PORT) });
    check(`8g f18: the nightly battery row replayed (${battery.band}, pins ${battery.pins.OB_E2E_PORT}/${battery.pins.OB_E2E_CDP_PORT}/OB_CDP_PORT ${battery.pins.OB_CDP_PORT}, GITHUB_ACTIONS=true) with an e2e-userboot-shaped suite { http 1, cdp 16 } claims EXACTLY its band — an extra pin is one port, never the suite's cdp inventory (refuter P1: it widened to 18805, into e2e-settings' row)`,
      n1.status === 0 && new RegExp(`claimed port band ${battery.band} `).test(n1.stdout) && !/WIDENED|SECOND claim/.test(n1.stdout) && new RegExp(`STAGED-UB ran bands=${battery.band}\\.`).test(n1.stdout), `status ${n1.status} ${(n1.stderr + n1.stdout).slice(0, 260)}`);
    const rowT = { v: 1, reserved: { start: 18700, end: 19999 }, jobs: [{ workflow: 'ci.yml', job: 'a', band: '18700-18759', pins: { OB_E2E_PORT: 18700, OB_E2E_CDP_PORT: 18715, OB_CDP_PORT: 18759 }, suites: ['ub.mjs'] }] };
    const wfT = "jobs:\n  a:\n    env:\n      OB_E2E_PORT: \"18700\"\n      OB_E2E_CDP_PORT: \"18715\"\n      OB_CDP_PORT: \"18759\"\n    steps:\n      - run: >\n          node web/tools/run-gate.mjs --band 18700-18759 --no-canary --no-belt --\n          node web/tools/ub.mjs\n";
    const lintRow = (inv) => cib.lintCiBands({ table: rowT, workflows: { 'ci.yml': wfT }, suiteText: () => `export const PORT_INVENTORY = ${inv};\n` }).problems.map((p) => p.kind);
    check('8g f18: the table lint sizes a row\'s pins with THE SAME extents function — OB_CDP_PORT at the band\'s last port is clean for a cdp-16 suite (width 1), while the layout OB_E2E_CDP_PORT with a cdp inventory reaching past the band is job-pin-tail-escapes',
      lintRow('{ http: 1, cdp: 16 }').length === 0 && lintRow('{ http: 1, cdp: 46 }').includes('job-pin-tail-escapes'), JSON.stringify([lintRow('{ http: 1, cdp: 16 }'), lintRow('{ http: 1, cdp: 46 }')]));
    // band-role pins: one claim per run
    const b1 = gateE(mine.band, cue, { ...localEnv(), OB_E2E_BAND_START: String(mine.range.start), OB_E2E_BAND_END: String(mine.range.end) });
    const b2 = gateE(mine.band, noinv, { ...localEnv(), OB_E2E_BAND_START: '8000', OB_E2E_BAND_END: '8029' });
    check('8g f18: OB_E2E_BAND_START/END equal to the assigned band runs; a DIFFERENT band pin (a band the tool would claim itself) is refused — one claim per run (refuter: a far band pin on a no-inventory suite used to pass through)',
      b1.status === 0 && /STAGED-CUE ran/.test(b1.stdout) && b2.status === 2 && /is a band the tool would claim itself/.test(b2.stderr) && !/STAGED-NOINV ran/.test(b2.stdout), `b1 ${b1.status} | b2 ${b2.status} ${b2.stderr.slice(0, 160)}`);
    const g1 = gateE(mine.band, cue, { ...localEnv(), OB_E2E_BAND_START: '', OB_E2E_BAND_END: String(mine.range.end) });
    check(`8g f18: a blank OB_E2E_BAND_START beside a valid END is read as END-END (never 0-END or NaN — the rewrite crashed on NaN) and, being a band pin other than the assigned band, is refused by name (exit 2), never a crash`,
      g1.status === 2 && g1.stderr.includes(`OB_E2E_BAND_START/END=${mine.range.end}-${mine.range.end}`) && /is a band the tool would claim itself/.test(g1.stderr) && !/STAGED-CUE ran/.test(g1.stdout), `status ${g1.status} ${(g1.stderr + g1.stdout).slice(0, 200)}`);
    const v1 = gateE(mine.band, cue, { ...localEnv(), OB_CDP_PORT: '47997' });
    const v2 = gateE('45600-45639', W('ub16.mjs', "export const PORT_INVENTORY = { http: 1, cdp: 16 };\nexport const PORT_FLAGS = {};\nconsole.log('STAGED-UB16 ran');\n"), { ...localEnv(), OB_E2E_CDP_PORT: '65530' }); // a 40-wide undeclared band: the inventory fits, only the far pin is at issue
    check('8g f18: a far pin whose extent can never be a claim — an extra pin on the registry mutex port 47997, a far layout OB_E2E_CDP_PORT whose 16 slots pass 65535 — is refused by name (exit 2), not reported as contention (75)',
      v1.status === 2 && /can never be claimed/.test(v1.stderr) && /mutex port 47997/.test(v1.stderr) && !/STAGED-CUE ran/.test(v1.stdout)
        && v2.status === 2 && /can never be claimed/.test(v2.stderr) && /above 65535/.test(v2.stderr) && !/STAGED-UB16 ran/.test(v2.stdout), `v1 ${v1.status} ${v1.stderr.slice(0, 120)} | v2 ${v2.status} ${v2.stderr.slice(0, 120)}`);
  }
  // ---- f19: ONE width source — PIN_NAMES models (companion review r1 P2 ×2) ----
  // run-gate widened every env pin by the suite inventory even when the list said width 1 (a 15-CDP suite with
  // OB_CDP_PORT=9399 under 9430-9459 was refused as 9399-9413); base pins with GENERATED ranges (scenario-batch,
  // scenario-titlecard) were modelled as one-port http pins
  {
    const lanesT = cib.loadLaneBands(cib.LANE_BANDS_FILE, table);
    const plan = lanesT.bands.filter((b) => !b.legacy).sort((a, b) => a.range.start - b.range.start);
    const mine = plan.find((b) => b.lane === 'ci-red') ?? plan[1];
    const W = (name, text) => { const f = path.join(stage, name); fs.writeFileSync(f, text); return f; };
    const gateE = (bandStr, suite, env) => spawnSync(process.execPath, [runGate, '--band', bandStr, '--no-canary', '--no-belt', '--', suite], { encoding: 'utf8', timeout: 90000, cwd: WEB_DIR, env });
    const c15 = W('c15.mjs', "export const PORT_INVENTORY = { http: 1, cdp: 15 };\nexport const PORT_FLAGS = {};\nconsole.log('STAGED-C15 ran OB_CDP_PORT=' + process.env.OB_CDP_PORT + ' bands=' + process.env.OB_PORT_BANDS);\n");
    // (1) an exact-width name is never inventory-widened
    const below = mine.range.start - 31; // undeclared space just under the previous row
    const r1 = gateE(mine.band, c15, { ...localEnv(), OB_CDP_PORT: String(below) });
    check(`8g f19: a 15-CDP suite with OB_CDP_PORT=${below} under ${mine.band} RUNS with a second claim ${below}-${below} — an exact-width name is one port whatever the inventory (red-proof: e14b291e refused it as ${below}-${below + 14})`,
      r1.status === 0 && new RegExp(`registered a SECOND claim ${below}-${below} for the explicit OB_CDP_PORT pin`).test(r1.stdout) && new RegExp(`STAGED-C15 ran OB_CDP_PORT=${below} bands=[^\\s]*${below}-${below}\\.`).test(r1.stdout),
      `status ${r1.status} ${(r1.stderr + r1.stdout).slice(0, 260)}`);
    // (2) a BASE name carries its generated range: a base whose range crosses lane rows is refused naming them
    const bb = cib.PIN_NAMES.OB_BATCH_PORT_BASE.model.span;
    const baseAt = plan[0].range.start - 200; // 200 below the first row: base..base+259 spans it and the next
    const r2 = gateE(mine.band, c15, { ...localEnv(), OB_BATCH_PORT_BASE: String(baseAt) });
    check(`8g f19: OB_BATCH_PORT_BASE=${baseAt} (a CDP base generating ${bb} ports, ${baseAt}-${baseAt + bb - 1}) is refused naming the lane rows its range spans (red-proof: e14b291e accepted it as one http port)`,
      r2.status === 2 && r2.stderr.includes(`OB_BATCH_PORT_BASE(+${bb - 1})=${baseAt}-${baseAt + bb - 1}`) && r2.stderr.includes(`${plan[0].lane} lane`) && /spans|enters/.test(r2.stderr) && !/STAGED-C15 ran/.test(r2.stdout),
      `status ${r2.status} ${r2.stderr.slice(0, 260)}`);
    // (3) the models are DERIVED from the tools' own code by the reader, and the list equals the code on this tree
    const tc = cib.basePinSpanUsed(fs.readFileSync(path.join(WEB_DIR, 'tools', 'scenario-titlecard.mjs'), 'utf8'), 'OB_TITLECARD_PORT');
    const sb = cib.basePinSpanUsed(fs.readFileSync(path.join(WEB_DIR, 'tools', 'scenario-batch.mjs'), 'utf8'), 'OB_BATCH_PORT_BASE');
    check(`8g f19: the base-span reader derives scenario-titlecard's OB_TITLECARD_PORT range (${tc.span}: port | port + 41 → withCardSession → reservePort(portBase + pid % 23), 40-port probes) and scenario-batch's OB_BATCH_PORT_BASE range (${sb.span}: (slot % SLOT_CAP) * 20, 40-port probe) — equal to the list's models`,
      tc.span === cib.PIN_NAMES.OB_TITLECARD_PORT.model.span && tc.unknown.length === 0 && sb.span === cib.PIN_NAMES.OB_BATCH_PORT_BASE.model.span && sb.unknown.length === 0, JSON.stringify({ tc: [tc.span, tc.unknown], sb: [sb.span, sb.unknown] }));
    const R = (t) => { const r = cib.basePinSpanUsed(t, 'OB_X_PORT'); return r.span ?? 'UNKNOWN'; };
    const probeFn = "async function reservePort(base, tries = 40) {\n  for (let q = base; q < base + tries; q++) { }\n}\n";
    const fx = {
      exact: R("const p = Number(process.env.OB_X_PORT ?? 9000);\nconst c = await launchChrome(u, { port: p });\n"),
      plus3: R("const p = Number(process.env.OB_X_PORT ?? 9000);\nconst c = await launchChrome(u, { port: p + 3 });\n"),
      probe: R(probeFn + "const p = Number(process.env.OB_X_PORT ?? 9000);\nconst r = await reservePort(p + 1);\n"),
      hop: R(probeFn + "async function sess(url, portBase) {\n  const { port } = await reservePort(portBase + (process.pid % 23));\n}\nasync function main() {\n  const port = (Number(process.env.OB_X_PORT) || 12920) + 41;\n  await sess(u, port);\n}\n"),
      modconst: R("const CAP = 12;\n" + probeFn + "const base = Number(process.env.OB_X_PORT ?? 16400);\nconst r = await reservePort(base + (slot % CAP) * 20);\n"),
      unbounded: R("const base = Number(process.env.OB_X_PORT ?? 16400);\nconst c = await launchChrome(u, { port: base + slot });\n"),
      arrowPinned: R("const cdpPortFor = (offset) => (process.env.OB_X_PORT !== undefined\n  ? Number(process.env.OB_X_PORT)\n  : 16393 + offset);\n"),
      arrowDerives: R("const f = (offset) => (process.env.OB_X_PORT !== undefined ? Number(process.env.OB_X_PORT) + offset : 16393);\n"),
      direct: R("const c = await launchChrome(u, { port: Number(process.env.OB_X_PORT) });\n"),
      bracket: R("const c0 = Number(process.env['OB_X_PORT']);\nconst c = await launchChrome(u, { port: c0 + 2 });\n"),
      alias: R("const c0 = Number(process.env.OB_X_PORT ?? 8190);\nconst c1 = c0 + 1;\nconst c = await launchChrome(u, { port: c1 });\n"),
      template: R("const c0 = Number(process.env.OB_X_PORT ?? 8190);\nconst a = `--remote-debugging-port=${c0 + 1}`;\n"),
      twoTerms: R("const port = (Number(process.env.OB_X_PORT) || 12920) + 41 + 2;\nconst c = await launchChrome(u, { port });\n"),
      pluseq: R("let port = Number(process.env.OB_X_PORT ?? 9000);\nport += 41;\nconst c = await launchChrome(u, { port });\n"),
      secondLine: R(probeFn + "const p = Number(process.env.OB_X_PORT ?? 9000);\nconst r = await reservePort(\n  p + 7);\n"),
      falseProbe: R("function walk(base, tries = 40) {\n  const x = base + tries;\n}\nconst p = Number(process.env.OB_X_PORT ?? 9000);\nwalk(p + 2);\n"),
      urlOnly: R("const PORT = Number(process.env.OB_X_PORT ?? 8291);\nconst u = `http://127.0.0.1:${PORT}/app.html`;\n"),
      parenDefault: R("const cdpPort = Number(process.env.OB_X_PORT ?? (9243 + (args.port - 8000)));\nconst c = await launchChrome(u, { port: cdpPort });\n"),
      childArgv: R("const PORT = Number(process.env.OB_X_PORT ?? 8044);\nspawn('python3', ['-m', 'http.server', String(PORT)]);\n"),
      // second refuter pass: false-exact shapes must be UNKNOWN, helper declarations of every form must be seen
      times2: R("const p = Number(process.env.OB_X_PORT ?? 9000);\nconst c = await launchChrome(u, { port: p * 2 });\n"),
      minus1: R("const p = Number(process.env.OB_X_PORT ?? 9000);\nconst c = await launchChrome(u, { port: p - 1 });\n"),
      directMul: R("const c = await launchChrome(u, { port: Number(process.env.OB_X_PORT) * 2 });\n"),
      arrowHelper: R("const reservePort = async (base, tries = 40) => {\n  for (let q = base; q < base + tries; q++) { }\n};\nconst p = Number(process.env.OB_X_PORT ?? 9000);\nconst { port } = await reservePort(p);\n"),
      methodHelper: R("const H = {\n  async reservePort(base, tries = 40) {\n    for (let q = base; q < base + tries; q++) { }\n  },\n};\nconst p = Number(process.env.OB_X_PORT ?? 9000);\nconst { port } = await H.reservePort(p);\n"),
      importedHelper: R("import { reservePort } from './x.mjs';\nconst p = Number(process.env.OB_X_PORT ?? 9000);\nconst { port } = await reservePort(p);\n"),
      sibling: R("const p = Number(process.env.OB_X_PORT ?? 9000);\nconst c = await launchChrome(u, { port: p, cdpPort: p + 1 });\n"),
      optsHop: R(probeFn + "async function sess(u, opts) {\n  const { port } = await reservePort(opts.port + 5);\n}\nconst p = Number(process.env.OB_X_PORT ?? 9000);\nawait sess(u, { port: p + 2 });\n"),
      reassign2: R("let p = Number(process.env.OB_X_PORT ?? 9000);\np = 41 + p;\nconst c = await launchChrome(u, { port: p });\n"),
      incr: R("let p = Number(process.env.OB_X_PORT ?? 9000);\np++;\nconst c = await launchChrome(u, { port: p });\n"),
      mulEq: R("let p = Number(process.env.OB_X_PORT ?? 9000);\np *= 2;\nconst c = await launchChrome(u, { port: p });\n"),
      probeExplicit: R(probeFn + "const p = Number(process.env.OB_X_PORT ?? 9000);\nconst r = await reservePort(p, 100);\n"),
      probeVarTries: R(probeFn + "const p = Number(process.env.OB_X_PORT ?? 9000);\nconst r = await reservePort(p, TRIES);\n"),
      probeLE: R("async function reservePort(base, tries = 40) {\n  for (let q = base; q <= base + tries; q++) { }\n}\nconst p = Number(process.env.OB_X_PORT ?? 9000);\nconst r = await reservePort(p);\n"),
      mathMax: R("const p = Number(process.env.OB_X_PORT ?? 9000);\nconst c = await launchChrome(u, { port: Math.max(p + 3, x) });\n"),
    };
    const want = { exact: 1, plus3: 4, probe: 41, hop: 103, modconst: 260, unbounded: 'UNKNOWN', arrowPinned: 1, arrowDerives: 'UNKNOWN', direct: 1, bracket: 3, alias: 2, template: 2, twoTerms: 44, pluseq: 'UNKNOWN', secondLine: 47, falseProbe: 'UNKNOWN', urlOnly: 1, parenDefault: 1, childArgv: 1,
      times2: 'UNKNOWN', minus1: 'UNKNOWN', directMul: 'UNKNOWN', arrowHelper: 40, methodHelper: 40, importedHelper: 'UNKNOWN', sibling: 2, optsHop: 'UNKNOWN', reassign2: 'UNKNOWN', incr: 'UNKNOWN', mulEq: 'UNKNOWN', probeExplicit: 100, probeVarTries: 'UNKNOWN', probeLE: 41, mathMax: 'UNKNOWN' };
    check('8g f19: reader fixtures, 34 shapes (two refuter passes: fail-CLOSED, and every shape the tree uses) — exact / `+ 3` / probe / one hop with a binding offset and `% 23` / `(slot % CAP) * 20` / pinned-branch ternary in an arrow / direct `port: Number(env)` / bracket / alias / template / two binding terms / a call\'s second line / URL-only / parenthesised default / `String(PORT)` in a child argv / arrow-const and method helpers / sibling property / explicit probe argument / `<=` probe are READ; an unbounded term, a deriving pinned branch, `+=` and every other reassignment, a look-alike probe, `port: L * 2` / `L - 1`, an imported helper, an options object into a declared function, a non-literal probe window and `Math.max(L + 3, x)` are UNKNOWN',
      Object.keys(want).every((k) => fx[k] === want[k]), JSON.stringify(Object.fromEntries(Object.keys(want).filter((k) => fx[k] !== want[k]).map((k) => [k, [fx[k], want[k]]]))));
    // the DEFAULT lint sizes a base name's default by the model too (one width source for pins AND defaults)
    const dd = fs.mkdtempSync('/tmp/obw-hygiene-687-basedef-');
    fs.writeFileSync(path.join(dd, 'basedef.mjs'), `import { reserveEndpointPair } from './lib/endpoint-pair.mjs';\nexport const PORT_INVENTORY = { http: 1, cdp: 1 };\nconst SLOT_CAP = 12;\nconst base = Number(process.env.OB_BATCH_PORT_BASE ?? ${plan[0].range.start - 200});\nconst pair = await reserveEndpointPair(base + (slot % SLOT_CAP) * 20, base + (slot % SLOT_CAP) * 20 + 10, 40, { cdp: { pin: 'OB_BATCH_PORT_BASE' }, http: { pin: 'OB_BATCH_PORT_BASE' } });\n`);
    const ddHits = cib.scanToolDefaults(dd); const ddLint = cib.lintCiBands({ table, workflows: {}, toolDefaults: ddHits, laneBands: lanesT }).problems.filter((p) => p.detail.startsWith('basedef.mjs'));
    // titlecard's own shape: the base bound to a local named `port` (the env name, not the local, keys the model); a width-1 name's default is never inventory-widened
    const tcSpan = cib.PIN_NAMES.OB_TITLECARD_PORT.model.span;
    fs.writeFileSync(path.join(dd, 'tcdef.mjs'), probeFn + `export const PORT_INVENTORY = { http: 1, cdp: 15 };\nasync function sess(url, portBase) {\n  const { port } = await reservePort(portBase + (process.pid % 23));\n}\nasync function main() {\n  const port = Number(process.env.OB_TITLECARD_PORT) || ${plan[0].range.start - 90};\n  await sess(u, port);\n  const port2 = (Number(process.env.OB_TITLECARD_PORT) || ${plan[0].range.start - 90}) + 41;\n  await sess(u, port2);\n}\n`);
    fs.writeFileSync(path.join(dd, 'cdpdef.mjs'), "export const PORT_OVERRIDES = { cdp: 'OB_CDP_PORT' };\nexport const PORT_INVENTORY = { http: 1, cdp: 15 };\nconst cdpPort = Number(process.env.OB_CDP_PORT ?? 8380);\nconst c = await launchChrome(u, { port: cdpPort });\n");
    const ddHits2 = cib.scanToolDefaults(dd); const ddLint2 = cib.lintCiBands({ table, workflows: {}, toolDefaults: ddHits2, laneBands: lanesT }).problems;
    const tcHit = ddHits2.find((h) => h.file === 'tcdef.mjs' && h.envKey === 'OB_TITLECARD_PORT' && h.value === plan[0].range.start - 90);
    const cdpHit = ddHits2.find((h) => h.file === 'cdpdef.mjs' && h.envKey === 'OB_CDP_PORT');
    check(`8g f19: a tool DEFAULTING OB_BATCH_PORT_BASE to ${plan[0].range.start - 200} is named by the default lint against the rows its ${bb}-port generated range spans; a titlecard-shaped tool (the base bound to a local named \`port\`) defaulting OB_TITLECARD_PORT to ${plan[0].range.start - 90} gets the ${tcSpan}-port model range and is named too (the env name keys the model, not the local); a width-1 OB_CDP_PORT default under a cdp-15 suite is NOT inventory-widened (refuter: the default scan read a base as one port and widened an exact name)`,
      ddHits.some((h) => h.key === 'OB_BATCH_PORT_BASE' && h.range && h.range.end === plan[0].range.start - 200 + bb - 1) && ddLint.some((p) => p.kind === 'tool-default-in-lane-band' && p.detail.includes(`${plan[0].lane} lane`))
        && tcHit && tcHit.range && tcHit.range.end === plan[0].range.start - 90 + tcSpan - 1 && ddLint2.some((p) => p.detail.startsWith('tcdef.mjs') && p.kind === 'tool-default-in-lane-band' && p.detail.includes(`${plan[0].lane} lane`))
        && cdpHit && !cdpHit.range && !ddLint2.some((p) => p.detail.startsWith('cdpdef.mjs') && p.kind !== 'inventory-without-pin-reader') // r7: an OB_CDP_PORT-only reader under an inventory IS the per-role reader row; the width-1 default is still never widened
        && ddLint2.some((p) => p.detail.startsWith('cdpdef.mjs') && p.kind === 'inventory-without-pin-reader'),
      JSON.stringify({ dd: ddLint.map((p) => p.kind), tc: tcHit && [tcHit.value, tcHit.range], tcRows: ddLint2.filter((p) => p.detail.startsWith('tcdef.mjs')).map((p) => p.kind), cdp: cdpHit && [cdpHit.value, cdpHit.range], cdpRows: ddLint2.filter((p) => p.detail.startsWith('cdpdef.mjs')).map((p) => p.kind) }));
    fs.rmSync(dd, { recursive: true, force: true });
    // (4) the lint holds the list to the code: a scratch that generates a different range from a listed base name, or an unreadable one, is pin-model-drift
    const dir = fs.mkdtempSync('/tmp/obw-hygiene-687-model-');
    fs.writeFileSync(path.join(dir, 'short.mjs'), "const p = Number(process.env.OB_TITLECARD_PORT ?? 12920);\nconst c = await launchChrome(u, { port: p + 5 });\n");
    fs.writeFileSync(path.join(dir, 'unread.mjs'), "const b = Number(process.env.OB_BATCH_PORT_BASE ?? 16400);\nconst c = await launchChrome(u, { port: b + slot });\n");
    fs.writeFileSync(path.join(dir, 'exact.mjs'), "const c0 = Number(process.env.OB_CDP_PORT ?? 8190);\nconst c = await launchChrome(u, { port: c0 });\n");
    fs.writeFileSync(path.join(dir, 'wide.mjs'), "const c0 = Number(process.env.OB_CDP_PORT ?? 8190);\nconst c = await launchChrome(u, { port: c0 + 2 });\n");
    const hits = cib.scanToolDefaults(dir).filter((d) => d.syntax === 'pin-model-drift');
    const k = (f) => hits.filter((d) => d.file === f).length;
    check('8g f19: pin-model-drift — a scratch generating 6 ports from OB_TITLECARD_PORT (list: 103) is named; an unreadable derivation from OB_BATCH_PORT_BASE is named (fail-closed); an exact OB_CDP_PORT use is clean; `OB_CDP_PORT + 2` (3 ports from a width-1 name) is named',
      k('short.mjs') === 1 && k('unread.mjs') === 1 && k('exact.mjs') === 0 && k('wide.mjs') === 1, JSON.stringify(hits.map((d) => `${d.file}: ${d.text.slice(0, 90)}`)));
    fs.rmSync(dir, { recursive: true, force: true });
    const treeModel = treeHitsFor().filter((d) => d.syntax === 'pin-model-drift');
    const derivedExact = ['web/tools/scenario-render.mjs', 'web/tools/hero-extend-render.mjs', 'web/tools/record.mjs', 'tools/render/probe-audio.mjs', 'tools/render/bench-export.mjs', 'tools/render/probe-encoders.mjs'].map((f) => cib.basePinSpanUsed(fs.readFileSync(path.join(WEB_DIR, '..', f), 'utf8'), 'OB_CDP_PORT'));
    check('8g f19: the sweep — on this tree no tool generates an extent that differs from its name\'s model or width (0 pin-model-drift rows); the six OB_CDP_PORT readers are DERIVED exact by the reader (a `how` trail each, none defaulted), the two base names carry their derived spans, layout names are judged by the inventory law',
      treeModel.length === 0 && derivedExact.every((r) => r.span === 1 && r.how.length > 0), JSON.stringify({ drift: treeModel.map((d) => `${d.file}:${d.name}`), exact: derivedExact.map((r) => [r.span, r.how.length]) }));
    // (5) source: the refusal-side widen and the hull share the ONE width function
    const rg = fs.readFileSync(runGate, 'utf8'); const lib = fs.readFileSync(path.join(WEB_DIR, 'tools', 'lib', 'ci-bands.mjs'), 'utf8');
    const extentsBody = lib.slice(lib.indexOf('export function pinExtentsFor('), lib.indexOf('\n}\n', lib.indexOf('export function pinExtentsFor(')));
    check('8g f19: run-gate\'s refusal widen calls ciBands.pinExtentOf and pinExtentsFor calls pinWidthOf — the width comes from one place (source pins); no `inventory[role]` widening of an extra pin remains',
      /const r = ciBands\.pinExtentOf\(pin, inventory\)/.test(rg) && /pinWidthOf\(p, inventory\)/.test(extentsBody) && !/PIN_NAMES\[p\.key\]\?\.width/.test(extentsBody), 'source pins');
  }
  // ---- f20: a same-role CLI flag SHADOWS the layout env pin; no two tools default onto the same ports (companion review r2 P2 ×2) ----
  // (1) pinExtentsFor counted `OB_E2E_PORT=X --port X` as TWO pins: the equal case tripped the
  //     derivation-overlap refusal (75) and a differing pair widened the hull (or forced a second
  //     claim) around a port the tool never binds. The suites' documented pattern is
  //     `argOf('--port') ?? process.env.OB_E2E_PORT` — ONE pin, and the flag is the one that wins.
  // (2) the #705 relocation stacked tool DEFAULTS on top of each other in undeclared space
  //     (cloth-calibration capture 16783-16795 vs chrome-diet 16781-16792 vs tune 16785): a
  //     tool-default-overlap row now names every such pair across the whole derived root set.
  {
    const lanesT = cib.loadLaneBands(cib.LANE_BANDS_FILE, table);
    const plan = lanesT.bands.filter((b) => !b.legacy).sort((a, b) => a.range.start - b.range.start);
    const mine = plan.find((b) => b.lane === 'ci-red') ?? plan[1];
    const foreign = plan.find((b) => b !== mine);
    const below = plan[0].range.start - 1; // undeclared space under the FIRST plan row (a hull reaching it spans a row)
    const inBand = mine.range.start + 1;
    const W = (name, text) => { const f = path.join(stage, name); fs.writeFileSync(f, text); return f; };
    const INV = { http: 2, cdp: 1 };
    const HEAD = "const argOf = (f) => { const i = process.argv.indexOf(f); return i > 0 ? process.argv[i + 1] : null; };\n";
    // the shape the law is about: the flag first, the layout env name as its fallback
    const sh = W('shadow.mjs', `${HEAD}export const PORT_INVENTORY = { http: ${INV.http}, cdp: ${INV.cdp} };\nexport const PORT_FLAGS = { '--port': 'http', '--cdp': 'cdp' };\nconst PORT = Number(argOf('--port') ?? process.env.OB_E2E_PORT ?? 9000);\nconst CDP = Number(argOf('--cdp') ?? process.env.OB_E2E_CDP_PORT ?? 9100);\nconsole.log('STAGED-SHADOW ran port=' + PORT + ' cdp=' + CDP + ' env=' + process.env.OB_E2E_PORT + ' bands=' + process.env.OB_PORT_BANDS);\n`);
    const gateS = (bandStr, extra, env) => spawnSync(process.execPath,
      [runGate, '--band', bandStr, '--no-canary', '--no-belt', '--', sh, ...extra], { encoding: 'utf8', timeout: 90000, cwd: WEB_DIR, env });
    // (1a) EQUAL: one extent, and the run goes through
    const eqEnv = cib.pinEnvEntries({ OB_E2E_PORT: String(inBand) });
    const eqCli = cib.argvPortPins(['--port', String(inBand)], { flags: { '--port': 'http' }, error: null }, INV).pins;
    const eqEx = cib.pinExtentsFor(eqEnv, eqCli, INV);
    const a1 = gateS(mine.band, ['--port', String(inBand)], { ...localEnv(), OB_E2E_PORT: String(inBand) });
    check(`8g f20: OB_E2E_PORT=${inBand} --port ${inBand} (the EQUAL case) is ONE http extent ${inBand}-${inBand + INV.http - 1} named for the flag, and the run goes through (red-proof: 2d33b7c1 made two extents of it and exited 75 on their overlap)`,
      eqEx.length === 1 && eqEx[0].kind === 'http' && eqEx[0].name === '--port' && eqEx[0].lo === inBand && eqEx[0].hi === inBand + INV.http - 1
        && a1.status === 0 && new RegExp(`STAGED-SHADOW ran port=${inBand} `).test(a1.stdout) && !/overlap/.test(a1.stderr),
      `${JSON.stringify(eqEx)} | status ${a1.status} ${(a1.stderr + a1.stdout).slice(0, 220)}`);
    // (1b) DIFFERING: the flag's extent ONLY — the shadowed env value is never claimed and never widens the hull
    const dfEnv = cib.pinEnvEntries({ OB_E2E_PORT: String(below) });
    const dfEx = cib.pinExtentsFor(dfEnv, eqCli, INV);
    const a2 = gateS(mine.band, ['--port', String(inBand)], { ...localEnv(), OB_E2E_PORT: String(below) });
    check(`8g f20: OB_E2E_PORT=${below} --port ${inBand} (DIFFERING) claims ${mine.band} and nothing else — one http extent at the flag, no second claim for the shadowed value, and the child's OB_E2E_PORT FOLLOWS the flag (${inBand}) so a nested env reader binds inside the claim (red-proof: 2d33b7c1 sized ${below} as a pin of its own — its +1 tail entered ${plan[0].lane}'s row and the run was refused; the shadow alone still handed the child ${below})`,
      dfEx.length === 1 && dfEx[0].lo === inBand && a2.status === 0 && !/SECOND claim/.test(a2.stdout)
        && new RegExp(`bands=[^\\s]*${mine.range.start}-${mine.range.end}\\.`).test(a2.stdout) && !new RegExp(`bands=[^\\s]*${below}-`).test(a2.stdout)
        && new RegExp(`STAGED-SHADOW ran port=${inBand} cdp=\\d+ env=${inBand} `).test(a2.stdout) && new RegExp(`OB_E2E_PORT=${below} is shadowed by the declared --port ${inBand}`).test(a2.stdout),
      `${JSON.stringify(dfEx)} | status ${a2.status} ${(a2.stderr + a2.stdout).slice(0, 300)}`);
    // (1c) a shadowed env pin leaves the PLACEMENT refusal too — the tool never binds it, so a foreign row is not entered
    const inForeign = foreign.range.start + 3;
    const a3 = gateS(mine.band, ['--port', String(inBand)], { ...localEnv(), OB_E2E_PORT: String(inForeign) });
    check(`8g f20: OB_E2E_PORT=${inForeign} (inside ${foreign.lane}'s row) shadowed by --port ${inBand} RUNS — a value the tool never reads is not a squat — and the child never sees ${inForeign}: its env follows the flag (red-proof: 2d33b7c1 refused it naming ${foreign.lane})`,
      a3.status === 0 && new RegExp(`STAGED-SHADOW ran port=${inBand} cdp=\\d+ env=${inBand} `).test(a3.stdout) && !new RegExp(`${foreign.lane} lane`).test(a3.stderr),
      `status ${a3.status} ${(a3.stderr + a3.stdout).slice(0, 220)}`);
    // (1d) …and UNSHADOWED it is still refused: the rule is a shadow, never a hole
    const a4 = gateS(mine.band, [], { ...localEnv(), OB_E2E_PORT: String(inForeign) });
    check(`8g f20: the same OB_E2E_PORT=${inForeign} with NO --port flag is still refused naming ${foreign.lane} (exit 2, nothing ran) — only a same-role flag shadows`,
      a4.status === 2 && new RegExp(`${foreign.lane} lane`).test(a4.stderr) && /OB_E2E_PORT/.test(a4.stderr) && !/STAGED-SHADOW ran/.test(a4.stdout),
      `status ${a4.status} ${a4.stderr.slice(0, 220)}`);
    // (1e) only LAYOUT names are shadowed: an EXTRA pin is a port of its own that no flag stands in for
    const a5 = gateS(mine.band, ['--port', String(inBand), '--cdp', String(mine.range.start + 15)], { ...localEnv(), OB_CDP_PORT: String(below) });
    check(`8g f20: OB_CDP_PORT=${below} beside a declared --cdp flag is NOT shadowed — an extra pin is its own port and still registers the second claim ${below}-${below} (the shadow is scoped to the layout names)`,
      a5.status === 0 && new RegExp(`registered a SECOND claim ${below}-${below} for the explicit OB_CDP_PORT pin`).test(a5.stdout),
      `status ${a5.status} ${(a5.stderr + a5.stdout).slice(0, 260)}`);
    // (1f) source: refusal and extents ask the SAME function — the two lists never disagree about a shadow
    const rg2 = fs.readFileSync(runGate, 'utf8');
    const libBody = fs.readFileSync(path.join(WEB_DIR, 'tools', 'lib', 'ci-bands.mjs'), 'utf8');
    const shadowedFn = libBody.slice(libBody.indexOf('export function shadowedEnvPins('), libBody.indexOf('\n}\n', libBody.indexOf('export function shadowedEnvPins(')));
    check('8g f20: run-gate drops shadowed pins through ciBands.unshadowedEnvPins at BOTH sites — the refusal loop and the extents block — and the child-env follow reads the complement through ciBands.shadowedEnvPins, which is defined THROUGH unshadowedEnvPins (source pins; one rule, never two copies)',
      (rg2.match(/ciBands\.unshadowedEnvPins\(/g) ?? []).length === 2 && /pinRefusal/.test(rg2)
        && (rg2.match(/ciBands\.shadowedEnvPins\(/g) ?? []).length === 1 && /env\[pin\.key\] = String\(flag\.value\)/.test(rg2)
        && /unshadowedEnvPins\(envPins, cliPins\)/.test(shadowedFn) && !/cliRoles/.test(shadowedFn),
      `${(rg2.match(/ciBands\.unshadowedEnvPins\(/g) ?? []).length} unshadowed sites, ${(rg2.match(/ciBands\.shadowedEnvPins\(/g) ?? []).length} shadowed sites`);

    // (2) tool-default-overlap — the red-proof pair, its named exemption, and the sweep
    const dir = fs.mkdtempSync('/tmp/obw-hygiene-725-overlap-');
    const put = (rel, text) => { fs.mkdirSync(path.join(dir, path.dirname(rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); return rel; };
    const decl = (w) => (w ? `export const SHARED_DEFAULT_WINDOW = '${w}';\n` : '');
    // two scratch tools whose DERIVED default ranges intersect: 30100-30112 and 30098-30109
    const tool = (inv, base, w) => `${decl(w)}export const PORT_INVENTORY = { http: 1, cdp: ${inv} };\nconst CDP = Number(process.env.OB_E2E_CDP_PORT ?? ${base});\nconst x = CDP + ${inv - 1};\n`;
    const rows = (files) => cib.lintCiBands({ table, workflows: {}, toolDefaults: cib.scanToolDefaultFiles(files, dir), laneBands: lanesT })
      .problems.filter((p) => p.kind === 'tool-default-overlap');
    put('a.mjs', tool(13, 30100, null)); put('b.mjs', tool(12, 30098, null));
    const pair = rows(['a.mjs', 'b.mjs']);
    check('8g f20: two scratch tools defaulting to overlapping DERIVED ranges (30100-30112 vs 30098-30109) are named as a PAIR — both files, both ranges, and the cure (red-proof: ded11f42 had no such rule and the #705 relocation stacked three tools on 16781-16795)',
      pair.length === 1 && pair[0].detail.includes('a.mjs:') && pair[0].detail.includes('b.mjs:') && pair[0].detail.includes('30100-30112') && pair[0].detail.includes('30098-30109') && /SHARED_DEFAULT_WINDOW/.test(pair[0].detail),
      JSON.stringify(pair.map((p) => p.detail.slice(0, 220))));
    put('a.mjs', tool(13, 30100, 'cloth-family')); put('b.mjs', tool(12, 30098, 'cloth-family'));
    check("8g f20: the SAME named window on both tools is the exemption — `export const SHARED_DEFAULT_WINDOW = 'cloth-family';` clears the pair",
      rows(['a.mjs', 'b.mjs']).length === 0, JSON.stringify(rows(['a.mjs', 'b.mjs']).map((p) => p.detail.slice(0, 160))));
    put('b.mjs', tool(12, 30098, 'other-family'));
    const mism = rows(['a.mjs', 'b.mjs']);
    check('8g f20: the exemption is BY NAME — two DIFFERENT window names are still a pair, and the row shows both names',
      mism.length === 1 && /window 'cloth-family'/.test(mism[0].detail) && /window 'other-family'/.test(mism[0].detail), JSON.stringify(mism.map((p) => p.detail.slice(0, 200))));
    put('b.mjs', tool(12, 30098, null));
    check('8g f20: a window declared on ONE side only is no exemption (a shared window is an agreement, not a claim)', rows(['a.mjs', 'b.mjs']).length === 1);
    put('a.mjs', tool(13, 30100, 'cloth-family')); put('b.mjs', tool(12, 30098, 'cloth-family')); put('c.mjs', tool(4, 30105, null));
    const third = rows(['a.mjs', 'b.mjs', 'c.mjs']);
    check("8g f20: a THIRD tool overlapping a shared window without declaring it is named against BOTH members (the window exempts its members, never the ports)",
      third.length === 2 && third.every((p) => p.detail.includes('c.mjs:')) && third.some((p) => p.detail.includes('a.mjs:')) && third.some((p) => p.detail.includes('b.mjs:')),
      JSON.stringify(third.map((p) => p.detail.slice(0, 160))));
    put('self.mjs', "export const PORT_INVENTORY = { http: 1, cdp: 1 };\nconst PORT = Number(process.env.OB_E2E_PORT ?? 31000);\nconst CDP = Number(process.env.OB_E2E_CDP_PORT ?? 31000);\n");
    check('8g f20: a tool whose OWN two defaults sit on one port is not a pair — the rule is tool-vs-TOOL (its own halves are the inventory law\'s business)',
      rows(['self.mjs']).length === 0);
    // the path exemptions are the SCANNER's, keyed on the repo-relative path (refuter r9)
    const harnessShape = (base) => `const CDP = Number(process.env.OB_E2E_CDP_PORT ?? ${base});\nconst x = CDP + 2;\n`; // the layout's own default, no inventory: not a tool
    put('web/tools/cdp.mjs', harnessShape(30100)); put('tools/render/cdp.mjs', tool(12, 30098, null)); put('web/tools/lib/pacing.mjs', tool(6, 30101, null)); put('plainer.mjs', tool(5, 30099, null));
    const paths = rows(['web/tools/cdp.mjs', 'tools/render/cdp.mjs', 'web/tools/lib/pacing.mjs', 'plainer.mjs']);
    check('8g f20: the harness and lib exemptions are the scanner\'s own repo-relative predicates (isHarnessPath/isLibPath) — web/tools/cdp.mjs and web/tools/lib/ are exempt while tools/render/cdp.mjs is a tool like any other (refuter r9: by basename it would have walked free)',
      paths.length === 1 && paths[0].detail.includes('tools/render/cdp.mjs') && paths[0].detail.includes('plainer.mjs'), JSON.stringify(paths.map((p) => p.detail.slice(0, 200))));
    // a harness file that IS a suite (PORT_INVENTORY + layout defaults — the hygiene suite) is judged on its OWN defaults; a fixture literal deeper in it is not
    put('web/tools/e2e-harness-hygiene.mjs', `${tool(3, 30099, null)}const FIXTURE = Number(process.env.OB_E2E_CDP_PORT ?? 30098);\n`);
    const own = rows(['web/tools/e2e-harness-hygiene.mjs', 'plainer.mjs', 'tools/render/cdp.mjs']);
    check('8g f20: a HARNESS file that is itself a suite (declares an inventory, defaults the layout names) is judged on its OWN first default per env name — the hygiene suite\'s 30099-30101 is named against plainer.mjs and tools/render/cdp.mjs; its deeper fixture literal 30098 is not a second default (red-proof: 8c76bf6d\'s blanket exemption hid the real suite\'s 16367-16379 sitting on four suites\' CDP defaults)',
      own.length === 3 && own.filter((p) => p.detail.includes('e2e-harness-hygiene.mjs:2 ')).length === 2 && !own.some((p) => /e2e-harness-hygiene\.mjs:4 /.test(p.detail)),
      JSON.stringify(own.map((p) => p.detail.slice(0, 200))));
    // the reader: a declaration is an EXPORTED one-line const, nothing else
    check('8g f20: sharedWindowOf reads the exported one-liner only — a commented-out declaration, a bare (unexported) const, a string mention and a call are not declarations',
      cib.sharedWindowOf("export const SHARED_DEFAULT_WINDOW = 'w';\n") === 'w'
        && cib.sharedWindowOf('// export const SHARED_DEFAULT_WINDOW = \'w\';\n') === null
        && cib.sharedWindowOf("const SHARED_DEFAULT_WINDOW = 'w';\n") === null
        && cib.sharedWindowOf("const s = \"SHARED_DEFAULT_WINDOW = 'w'\";\n") === null
        && cib.sharedWindowOf("export const SHARED_DEFAULT_WINDOW = shared('w');\n") === null);
    fs.rmSync(dir, { recursive: true, force: true });
    // the SWEEP: the whole derived root set, every tool, this tree
    const treeOverlap = cib.lintCiBands({ table, workflows: {}, toolDefaults: treeHitsFor(), laneBands: lanesT }).problems.filter((p) => p.kind === 'tool-default-overlap');
    const REPO = path.resolve(WEB_DIR, '..');
    const windows = new Map();
    // JS files only, as the lint itself routes them (scanToolDefaultFiles sends shell drivers to scanShellDefaultsInText
    // before any reader): sharedWindowOf reads an `export const` one-liner, which a shell script cannot carry, and the
    // GH-750 readers are a JavaScript tokenizer that refuses shell text by name (js-scan-unreadable) instead of guessing
    for (const f of cib.deriveScanFiles(REPO).map((x) => x.path).filter((f) => !cib.isShellFile(f))) {
      const w = cib.sharedWindowOf(fs.readFileSync(path.join(REPO, f), 'utf8'));
      if (w) windows.set(w, [...(windows.get(w) ?? []), f]);
    }
    check(`8g f20: the sweep — on this tree no two tools in the derived root set default onto overlapping ports (0 tool-default-overlap rows), and every declared window has at least two members (${[...windows].map(([w, fs2]) => `${w}×${fs2.length}`).join(', ')})`,
      treeOverlap.length === 0 && windows.size > 0 && [...windows.values()].every((fs2) => fs2.length >= 2),
      JSON.stringify({ rows: treeOverlap.map((p) => p.detail.slice(0, 160)), windows: [...windows] }).slice(0, 500));
  }
  // ---- f6: the choke point — a DIRECT claimPortBand of a CI band --------------------
  const probe = (env) => spawnSync(process.execPath, ['--input-type=module', '-e', `
    const { claimPortBand } = await import(${JSON.stringify(cdpPath)});
    try { await claimPortBand(${shellRow.range.start}, ${shellRow.range.end}); console.log('CLAIMED'); }
    catch (e) { console.log('REFUSED ' + e.message.split(String.fromCharCode(10))[0]); }
  `], { encoding: 'utf8', timeout: 30000, env });
  {
    const r = probe(localEnv());
    check('8g f6: claimPortBand itself REFUSES a local claim of a CI band (the tools that claim directly hit the same wall)',
      /^REFUSED .*GH-687/m.test(r.stdout) && new RegExp(`job ${shellRow.job}`).test(r.stdout), (r.stdout + r.stderr).slice(0, 200));
    const c = probe({ ...localEnv(), GITHUB_ACTIONS: 'true' });
    check('8g f6: claimPortBand permits the same claim under GITHUB_ACTIONS=true', /^CLAIMED/m.test(c.stdout), (c.stdout + c.stderr).slice(0, 200));
  }
  // the tree arms judge the DERIVED root set (review r9 P2-1), the same set the committed lint scans
  const treeHits = treeHitsFor();
  check('8g f6: no tool in the derived scan set defaults a port or band into the reserved range (r9 on this tree)',
    treeHits.every((d) => !cib.bandCovers(RES, d.value)),
    JSON.stringify(treeHits.filter((d) => cib.bandCovers(RES, d.value))).slice(0, 300));
  {
    const lanes = cib.loadLaneBands(cib.LANE_BANDS_FILE, table);
    const q = (d) => d.range ?? { start: d.value, end: d.value };
    const inLane = treeHits.filter((d) => d.syntax !== 'undeclared-inventory')
      .map((d) => ({ d, lane: lanes.bands.find((b) => !b.legacy && cib.bandsIntersect(b.range, q(d))) })).filter((x) => x.lane);
    check('8g f6: no tool in the derived scan set defaults a port, a derived range or a band into ANY declared PLAN lane band (r10 on this tree)',
      inLane.length === 0, JSON.stringify(inLane.map((x) => `${x.d.file}:${x.d.line} ${x.d.value ?? cib.bandStr(x.d.range)} in ${x.lane.lane}`)).slice(0, 300));
    check('8g f6: no tool declares fewer CDP slots than it launches, and every offset\'s bound is readable (declared vs used, on this tree)',
      treeHits.every((d) => d.syntax !== 'inventory-undercount' && d.syntax !== 'offset-bound-unknown'),
      JSON.stringify(treeHits.filter((d) => d.syntax === 'inventory-undercount' || d.syntax === 'offset-bound-unknown').map((d) => `${d.file}:${d.line} ${d.text.slice(0, 80)}`)).slice(0, 400));
    check('8g f6: every tool that derives ports from a base declares its inventory (fail-closed on this tree)',
      treeHits.every((d) => d.syntax !== 'undeclared-inventory'),
      JSON.stringify(treeHits.filter((d) => d.syntax === 'undeclared-inventory').map((d) => d.file)).slice(0, 300));
  }
  fs.rmSync(REG, { recursive: true, force: true });
  fs.rmSync(LDG, { recursive: true, force: true });
  fs.rmSync(stage, { recursive: true, force: true });
}

// ---- arm 10: GH-425 pacing-storm discipline red-proofs -------------------------
// The pacing-arm class (RAF-delta p95 guards, frame budgets) reds box-wide
// under multi-lane gate storms while the GH-347 RTT belt reads calm (#425:
// 10+ distinct trees, byte-identical pristine-main p95s, RTT p50 1-2 ms).
// lib/pacing.mjs gives the class one discipline; these proofs pin every
// decision edge of it, plus the run-gate ledger contract and the live
// teeth. Decision proofs drive guardPacingArm with a SCRIPTED sampler —
// classification and flow stay real, only the axis reads are fabricated
// (a real synthetic storm would abuse the shared box and flap on a real
// one; the live axes are proven separately below with a REAL stall).
{
  // defaults: guard on, 300ms/1.5/3 bars — and the busy-CPU bar pinned
  // EXPLICITLY at the pre-GH-691 constant: the shipped default is now
  // DERIVED per run (no baseline here = UNDERIVED = guardPacingArm skips
  // by name), and these scripted proofs assert the discipline's flow at
  // documented bars, not the runner's rest
  const K = pacingKnobs({ OB_PACING_STORM_BUSYCPU: '300' });
  const CALM = { rttP50: 2, loadNorm: 0.2, shells: 1, busyCpu: 80 };
  const LOADSTORM = { rttP50: 2, loadNorm: 6, shells: 1, busyCpu: 80 };
  const RTTSTORM = { rttP50: 999, loadNorm: 0.2, shells: 1, busyCpu: 80 };
  const STAMPEDE = { rttP50: 2, loadNorm: 0.87, shells: 3, busyCpu: 80 };
  // ^ the measured 2026-08-07 red state: RAF p95 54-55 ms with THREE
  // foreign browsers, BELOW the load bar — the axis that makes the #425
  // class classifiable at all (shells = FOREIGN browser roots)
  const CHURN = { rttP50: 1, loadNorm: 0.75, shells: 0, busyCpu: 700 };
  // ^ the second measured red state: pristine main's GH-260 D at 73.5 ms
  // with ZERO foreign browsers at loadNorm 0.72-0.80 — corp agents +
  // foreign review/rustfmt summing ~700% (the GH-347 comment-1 species)

  // (a) classifier axes + OB_* overrides win
  check('pacing (a): calm sample classifies calm',
    classifyStorm(CALM, K).stormy === false);
  const l = classifyStorm(LOADSTORM, K);
  check('pacing (a): loadavg/cores storm classifies stormy on the load axis',
    l.stormy === true && l.axes.length === 1 && /loadavg/.test(l.axes[0]),
    JSON.stringify(l.axes));
  const r = classifyStorm(RTTSTORM, K);
  check('pacing (a): control-plane RTT storm classifies stormy on the RTT axis',
    r.stormy === true && r.axes.length === 1 && /RTT/.test(r.axes[0]),
    JSON.stringify(r.axes));
  const st = classifyStorm(STAMPEDE, K);
  check('pacing (a): the shell STAMPEDE classifies stormy below the load bar '
    + '(the measured #425 red state)', st.stormy === true
    && st.axes.length === 1 && /shell/.test(st.axes[0]), JSON.stringify(st.axes));
  const ch = classifyStorm(CHURN, K);
  check('pacing (a): foreign busy-CPU CHURN classifies stormy with zero '
    + 'browsers below the load bar (the pristine-main 73.5 ms receipt)',
  ch.stormy === true && ch.axes.length === 1 && /busy-CPU/.test(ch.axes[0]),
  JSON.stringify(ch.axes));
  check('pacing (a): an all-axes storm cites every axis',
    classifyStorm({ rttP50: 999, loadNorm: 6, shells: 21, busyCpu: 700 },
      K).axes.length === 4);
  check('pacing (a): OB_PACING_STORM_LOADNORM override wins (env law)',
    classifyStorm(LOADSTORM,
      pacingKnobs({ OB_PACING_STORM_LOADNORM: '9' })).stormy === false);
  check('pacing (a): OB_PACING_STORM_SHELLS override wins (env law)',
    classifyStorm(STAMPEDE,
      pacingKnobs({ OB_PACING_STORM_SHELLS: '40' })).stormy === false);
  check('pacing (a): OB_PACING_STORM_BUSYCPU override wins (env law)',
    classifyStorm(CHURN,
      pacingKnobs({ OB_PACING_STORM_BUSYCPU: '900' })).stormy === false);
  check('pacing (a): OB_PACING_GUARD=0 disables the discipline',
    pacingKnobs({ OB_PACING_GUARD: '0' }).guard === false);

  // (a2) the stampede COUNTER: browser roots only, own lineage excluded by
  // pid ancestry (review r1 P1: a wrapped suite + its run-gate probe is
  // ~2-3 roots / 12-15 process rows — a raw row count self-classified
  // every wrapped run as a storm). Fabricated ps rows: this "suite" is
  // pid 100 under wrapper pid 50; the wrapper's probe root (pid 60) and
  // the suite's own client root (pid 110) are SELF; the foreign lane's
  // root (pid 200, under its own wrapper 199) is the only storm vote;
  // helper rows (--type=) never count.
  const SHELL = '/cache/chrome-headless-shell --headless';
  const rows = [
    { pid: 50, ppid: 1, command: 'node run-gate.mjs' },
    { pid: 60, ppid: 50, command: `${SHELL} --remote-debugging-port=46001` },
    { pid: 61, ppid: 60, command: `${SHELL} --type=gpu-process` },
    { pid: 100, ppid: 50, command: 'node e2e-aim.mjs' },
    { pid: 110, ppid: 100, command: `${SHELL} --remote-debugging-port=9635` },
    { pid: 111, ppid: 110, command: `${SHELL} --type=renderer` },
    { pid: 112, ppid: 110, command: `${SHELL} --type=utility` },
    { pid: 199, ppid: 1, command: 'node run-gate.mjs' },
    { pid: 200, ppid: 199, command: `${SHELL} --remote-debugging-port=9435` },
    { pid: 201, ppid: 200, command: `${SHELL} --type=gpu-process` },
    // a CHROME_BIN-override lane: different binary NAME, but launched
    // through cdp.mjs so it wears the obw-e2e-profile marker (review r5 P2)
    { pid: 300, ppid: 1, command: '/Applications/Chromium.app/chrome '
      + '--headless --remote-debugging-port=9750 '
      + '--user-data-dir=/tmp/obw-e2e-profile-9750' },
    // the OWNER'S interactive Google Chrome (no marker, not the shell):
    // never a lane, must never storm-classify this box
    { pid: 400, ppid: 1, command: '/Applications/Google Chrome.app/'
      + 'Contents/MacOS/Google Chrome' },
    // a watcher shell line QUOTING a COMPLETE launch command (review r6 +
    // r14 P2): argv[0] anchoring must exclude it — the executable is
    // bash, whatever its arguments quote
    { pid: 500, ppid: 1, command: 'bash /tmp/watch.sh '
      + 'chrome-headless-shell --remote-debugging-port=9435 '
      + '--user-data-dir=/tmp/obw-e2e-profile-9435' },
  ];
  check('pacing (a2): own suite clients + the wrapper\'s probe are SELF; '
    + 'foreign lanes count — incl. a CHROME_BIN override wearing the '
    + 'obw-e2e-profile marker; the owner\'s interactive Chrome does NOT',
  countForeignShellRoots(rows, [100, 50]) === 2);
  check('pacing (a2): helper (--type=) rows never count as browsers',
    countForeignShellRoots(rows, []) === 4);
  check('pacing (a2): a shell line QUOTING a complete launch command never '
    + 'counts — argv[0] must be a Chromium-family executable (review r6 + '
    + 'r14 P2)',
  countForeignShellRoots(rows.filter((r) => r.pid === 500), []) === 0);
  check('pacing (a2): without lineage exclusion the same rows would '
    + 'self-classify (the review r1 P1 defect, pinned red)',
  countForeignShellRoots(rows, []) > countForeignShellRoots(rows, [100, 50]));
  // the busy-CPU AGGREGATOR: per-process >=50% floor, self-lineage
  // excluded — an injected in-app stall burns CPU in OUR browser and must
  // never read as churn (the teeth law on the fourth axis)
  const cpuRows = [
    { pid: 100, ppid: 50, pcpu: 4, command: 'node e2e.mjs' },
    { pid: 110, ppid: 100, pcpu: 120, command: 'chrome-headless-shell (self, stalled)' },
    { pid: 7142, ppid: 1, pcpu: 191.7, command: 'x2pagentd' },
    { pid: 473, ppid: 1, pcpu: 105.4, command: 'syspolicyd' },
    { pid: 999, ppid: 1, pcpu: 30, command: 'below-floor process' },
  ];
  check('pacing (a2): busy-CPU aggregates only FOREIGN >=50% processes '
    + '(self browser excluded — an injected stall is never churn; '
    + 'below-floor rows never count)',
  Math.round(busyForeignCpu(cpuRows, [100])) === 297
    && Math.round(busyForeignCpu(cpuRows, [])) === 417);
  check('pacing (a2): selfPidsFor adopts the parent ONLY when it is the '
    + 'run-gate wrapper', JSON.stringify(selfPidsFor(rows, 100, 50)) === '[100,50]');
  // parent swapped for a plain shell: pid 60's browser now belongs to a
  // SIBLING lane sharing the driver — it must stay foreign (review
  // r2 P1: blanket ppid exclusion swallowed every sibling's browsers)
  const orch = rows.map((r) => (r.pid === 50
    ? { ...r, command: '/bin/zsh -c lane-driver' } : r));
  check('pacing (a2): a bare-shell/driver parent is NOT self — '
    + 'sibling lanes\' browsers stay foreign (review r2 P1)',
  JSON.stringify(selfPidsFor(orch, 100, 50)) === '[100]'
    && countForeignShellRoots(orch, selfPidsFor(orch, 100, 50)) === 3);

  // (b) the run-gate ledger contract: the SKIPPED-STORM citation MUST match
  // run-gate.mjs's waiver harvest (its regex, pinned verbatim here — GH-347
  // review r2 P1/r8 P1: waived entries never vouch, so a storm-skipped suite
  // can never bank a green fingerprint), while DEFER/retry notices must NOT
  // match (a deferred-then-green run is full coverage and banks normally).
  // If run-gate's harvest wording ever changes, this pin is the tripwire.
  const WAIVER_HARVEST = /waiv|soft.?skip|\bskipp(?:ed|ing)?\b|\bSKIP\b/i;
  const cite = stormSkipLine('RAF-delta p95 guard', 'p95 54.80 ms > 34 ms',
    [classifyStorm(LOADSTORM, K)]);
  check('pacing (b): the SKIPPED-STORM citation matches run-gate\'s waiver '
    + 'harvest (a storm-skip can never bank)', WAIVER_HARVEST.test(cite), cite);
  check('pacing (b): the perf-aim advisory suffix matches the harvest too',
    WAIVER_HARVEST.test('[SKIPPED-STORM GH-425]'));
  const defer = deferLine('RAF-delta p95 guard', classifyStorm(LOADSTORM, K), 90000);
  check('pacing (b): the DEFER notice does NOT match the harvest '
    + '(deferred-then-green banks)', !WAIVER_HARVEST.test(defer), defer);

  // (c) guardPacingArm decision flow against a scripted sampler
  const mkSampler = (seq) => {
    let i = 0;
    return async () => seq[Math.min(i++, seq.length - 1)];
  };
  const drive = async ({ seq, judge, measures, knobs = {} }) => {
    const log = [];
    const fails = [];
    let calls = 0;
    const res = await guardPacingArm({
      chrome: null,
      label: 'proof arm',
      sampler: mkSampler(seq),
      measure: async (attempt) => { calls += 1; return measures?.[calls - 1] ?? attempt; },
      judge,
      fail: (m) => fails.push(m),
      log: (m) => log.push(m),
      knobs: { ...K, retryDelayMs: 1, ...knobs },
    });
    return { ...res, log: log.join('\n'), fails, calls };
  };
  const green = () => null;
  const red = () => 'p95 55.0 ms > 34 ms';
  const skip = await drive({ seq: [LOADSTORM], judge: red,
    knobs: { calmWaitMs: 0 } });
  check('pacing (c): a never-calm window storm-skips WITHOUT measuring '
    + '(never judge a storm window)', skip.verdict === 'storm-skip'
    && skip.calls === 0 && skip.fails.length === 0
    && /SKIPPED-STORM/.test(skip.log), skip.log);
  const deferred = await drive({ seq: [LOADSTORM, CALM], judge: green });
  check('pacing (c): storm-then-calm DEFERS then runs for real (green banks)',
    deferred.verdict === 'green' && deferred.calls === 1
    && /DEFER/.test(deferred.log) && !WAIVER_HARVEST.test(deferred.log),
    deferred.log);
  const belt = await drive({ seq: [CALM, LOADSTORM], judge: red,
    knobs: { maxMeasures: 1 } });
  check('pacing (c): a red bracketed by a storm sample reclassifies INFRA '
    + '(never a red verdict)', belt.verdict === 'storm-skip'
    && belt.fails.length === 0 && /INFRA/.test(belt.log)
    && /SKIPPED-STORM/.test(belt.log), belt.log);
  const retry = await drive({ seq: [CALM, LOADSTORM, CALM], measures: [50, 10],
    judge: (p) => (p > 34 ? 'p95 over' : null) });
  check('pacing (c): a storm-overlapped red RETRIES and a calm green stands',
    retry.verdict === 'green' && retry.calls === 2 && retry.fails.length === 0,
    retry.log);
  const teeth = await drive({ seq: [CALM], judge: red });
  check('pacing (c): a calm-bracketed red is CONFIRMED once then FAILS — '
    + 'the arm keeps its teeth (and the differential-first pointer never '
    + 'reads as a waiver)', teeth.verdict === 'red'
    && teeth.fails.length === 1 && teeth.calls === 2
    && /p95 55\.0/.test(teeth.fails[0]) && /CALM bracket/.test(teeth.log)
    && /[Dd]ifferential/.test(teeth.log) && !WAIVER_HARVEST.test(teeth.log),
  JSON.stringify(teeth.fails));
  const flicker = await drive({ seq: [CALM], measures: [50, 10],
    judge: (p) => (p > 34 ? 'p95 over' : null) });
  check('pacing (c): a calm boundary FLICKER passes on the confirming '
    + 're-measure with both readings logged (the one-retry convention; '
    + 'full coverage, never a waiver)', flicker.verdict === 'green'
    && flicker.calls === 2 && flicker.fails.length === 0
    && /CALM bracket/.test(flicker.log) && !WAIVER_HARVEST.test(flicker.log),
  flicker.log);
  const reserved = await drive({ seq: [CALM], measures: [50, 10],
    judge: (p) => (p > 34 ? 'p95 over' : null),
    knobs: { maxMeasures: 1 } });
  check('pacing (c): the confirmation slot is RESERVED — a calm red at the '
    + 'storm-retry cap still gets its confirming re-measure (review r5 P2)',
  reserved.verdict === 'green' && reserved.calls === 2
    && reserved.fails.length === 0, reserved.log);
  // storm budget vs confirmation budget (review r13 P2): storm-red,
  // calm-red + confirmation, storm-red, then a calm green — the calm
  // confirmation must NOT spend the maxMeasures=3 storm budget, so the
  // fourth measurement still happens and its green stands.
  const budget = await drive({
    seq: [CALM, LOADSTORM, CALM, CALM, CALM, LOADSTORM, CALM],
    measures: [50, 50, 50, 10],
    judge: (p) => (p > 34 ? 'p95 over' : null) });
  check('pacing (c): calm confirmations never spend the storm-retry budget '
    + '(review r13 P2 — premature waive pinned)',
  budget.verdict === 'green' && budget.calls === 4
    && budget.fails.length === 0, budget.log);
  const rawRed = await drive({ seq: [LOADSTORM], judge: red,
    knobs: { guard: false } });
  check('pacing (c): OB_PACING_GUARD=0 runs the raw arm (fails even under '
    + 'storm — quiet-box calibration path)', rawRed.verdict === 'red'
    && rawRed.calls === 1 && rawRed.fails.length === 1);

  // (c2) teeth ATTRIBUTION (issue #664 (d), the merged-tree finding): the
  // live proof's injection self-check has THREE states, and the two that
  // are not "attributable" must be told apart — a starved page (zero
  // frames: the hog could not run) is not an injection death. Driven pure
  // here, and through guardPacingArm's belt with a scripted REAL sampler
  // so the live wiring's outcomes are pinned without needing a real storm.
  const zeroWin = { hogPerWindow: [{ frames: 0, hog: 0 }, { frames: 0, hog: 0 }] };
  const liveWin = { hogPerWindow: [{ frames: 54, hog: 58 }, { frames: 54, hog: 58 }] };
  const deadWin = { hogPerWindow: [{ frames: 54, hog: 58 }, { frames: 40, hog: 3 }] };
  const SUITE_SRC_EARLY = fs.readFileSync(
    path.join(WEB_DIR, 'tools', 'e2e-harness-hygiene.mjs'), 'utf8');
  check('pacing (c2): a ZERO-frame window is attributed to a STARVED page, '
    + 'never to the injection', /ZERO frames/.test(attributeTeethWindows(zeroWin.hogPerWindow) ?? '')
    && !/not live/.test(attributeTeethWindows(zeroWin.hogPerWindow) ?? ''));
  check('pacing (c2): a populated window the hog barely touched is an '
    + 'injection death, named as such',
  /not live — hog advanced 3 of 40/.test(attributeTeethWindows(deadWin.hogPerWindow) ?? ''));
  check('pacing (c2): a full hogged window is attributable (null) while an '
    + 'UNDERSIZED one is starvation, never a proof — the teeth judge reds on '
    + 'such a window for the starvation alone, so calling it attributable '
    + 'would bank a pass the injection never earned (review r7 P2)',
  attributeTeethWindows(liveWin.hogPerWindow) === null
    && /HOST starved/.test(attributeTeethWindows([{ frames: 5, hog: 5 }]) ?? '')
    && /HOST starved/.test(
      attributeTeethWindows([{ frames: TEETH_MIN_FRAMES - 1, hog: 19 }]) ?? '')
    && attributeTeethWindows([{ frames: TEETH_MIN_FRAMES, hog: 20 }]) === null
    && attributeTeethWindows([]) !== null);
  check('pacing (c2): the teeth judge and the attribution share ONE floor '
    + '(no second spelling of the usable-window count to drift)',
  TEETH_MIN_FRAMES === 20
    && /w\.length < TEETH_MIN_FRAMES/.test(SUITE_SRC_EARLY)
    && !/w\.length < 20/.test(SUITE_SRC_EARLY));
  const driveOuter = async ({ seq, results, knobs = {}, sampleCost = null,
    ...clock }) => {
    const log = []; const fails = []; let calls = 0;
    const next = mkSampler(seq);
    const res = await guardPacingArm({
      chrome: null, label: 'teeth precondition proof',
      sampler: sampleCost ? async () => { sampleCost(); return next(); } : next,
      measure: async () => { calls += 1; return results[Math.min(calls - 1, results.length - 1)]; },
      judge: (r) => attributeTeethWindows(r.hogPerWindow),
      fail: (m) => fails.push(m), log: (m) => log.push(m),
      knobs: { ...K, retryDelayMs: 1, ...knobs },
      ...clock,
    });
    return { ...res, log: log.join('\n'), fails, calls };
  };
  const starvedStorm = await driveOuter({ seq: [CALM, LOADSTORM, CALM],
    results: [zeroWin, liveWin] });
  check('pacing (c2): a starved window that overlapped a REAL storm sample '
    + 'is INFRA — retried in a calmer window, the attributable proof stands, '
    + 'no FAIL claiming the injection died (the 2026-09-06 merged-tree red)',
  starvedStorm.verdict === 'green' && starvedStorm.calls === 2
    && starvedStorm.fails.length === 0 && /INFRA/.test(starvedStorm.log)
    && starvedStorm.measured === liveWin, starvedStorm.log);
  const starvedCalm = await driveOuter({ seq: [CALM], results: [zeroWin] });
  check('pacing (c2): a starved window on a CALM box is confirmed once and '
    + 'then an honest red that NAMES the starvation',
  starvedCalm.verdict === 'red' && starvedCalm.calls === 2
    && starvedCalm.fails.length === 1 && /ZERO frames/.test(starvedCalm.fails[0]),
  JSON.stringify(starvedCalm.fails));
  const neverCalm = await driveOuter({ seq: [LOADSTORM], results: [zeroWin],
    knobs: { calmWaitMs: 0 } });
  check('pacing (c2): a box that never calms SKIPS the teeth proof with the '
    + 'citation and never measures (the run cannot bank)',
  neverCalm.verdict === 'storm-skip' && neverCalm.calls === 0
    && WAIVER_HARVEST.test(neverCalm.log), neverCalm.log);
  // GH-935: a storm that outlasts the suite's watchdog budget. The calm
  // wait (120 s here) is longer than what the caller has left (50 s, the
  // nightly's ratio), so only the caller deadline can end the wait before
  // the watchdog does — on a virtual clock, one RTT-probe bound per sample.
  let vt = 0;
  const vWatchdogAt = 50000;
  let vWatchdogFired = null;
  const budgetStorm = await driveOuter({ seq: [LOADSTORM], results: [zeroWin],
    knobs: { calmWaitMs: 120000, retryDelayMs: 15000 },
    deadlineAt: vWatchdogAt - 25000,
    now: () => vt,
    sleep: async (ms) => { vt += ms; },
    sampleCost: () => {
      vt += 5000;
      if (vt >= vWatchdogAt && vWatchdogFired === null) vWatchdogFired = vt;
    } });
  check('pacing (c2): a storm across the whole remaining watchdog budget '
    + 'ends on SKIPPED-STORM naming the caller deadline — before the '
    + 'watchdog, never measuring (GH-935)',
  budgetStorm.verdict === 'storm-skip' && budgetStorm.bound === 'caller-deadline'
    && budgetStorm.calls === 0 && vWatchdogFired === null
    && /DEFER/.test(budgetStorm.log)
    && /caller deadline left no calm window/.test(budgetStorm.log)
    && WAIVER_HARVEST.test(budgetStorm.log), budgetStorm.log);
  const SUITE_SRC = fs.readFileSync(
    path.join(WEB_DIR, 'tools', 'e2e-harness-hygiene.mjs'), 'utf8');
  check('pacing (c2): the LIVE teeth proof is wired through the REAL-box '
    + 'precondition guard and its skip line is harvest-matched',
  /label: 'live teeth proof precondition \(REAL box\)'/.test(SUITE_SRC)
    && WAIVER_HARVEST.test('[hygiene] SKIP pacing (d) live teeth proof — SKIPPED-STORM:'));
  // Scoped to the live block, which starts BELOW this arm: a source pin
  // written as a bare regex over the whole file matches its own literal and
  // can never fail (caught by red-proofing the pin against pre-fix bytes).
  const LIVE_AT = SUITE_SRC.indexOf('// (d) LIVE ' + 'teeth:'); // built by
  // concatenation: an anchor spelled verbatim would find ITSELF on this line
  const LIVE_BLOCK = LIVE_AT >= 0 ? SUITE_SRC.slice(LIVE_AT) : '';
  // every guardPacingArm call in this suite, as source blocks; the needle is
  // built by concatenation so this arm's own source never forms a block
  const GUARD_NEEDLE = 'guardPacingArm' + '({';
  const GUARD_BLOCKS = SUITE_SRC.split(GUARD_NEEDLE).slice(1)
    .map((b) => b.slice(0, b.indexOf('});')));
  const REAL_GUARD = GUARD_BLOCKS.find((b) =>
    /label: 'live teeth proof precondition \(REAL box\)'/.test(b)) ?? '';
  // pinned on the REAL-box guard's OWN block (review r8 P2 put a scripted
  // guard carrying K back inside the live block, which a block-wide
  // "no K here" pin wrongly refused)
  check('pacing (c2): the LIVE precondition guard takes the OPERATOR env '
    + 'knobs while the scripted proofs stay env-frozen (the documented '
    + 'OB_PACING_GUARD=0 calibration path has to reach the real box)',
  /const LIVE_K = pacingKnobs\(\);/.test(LIVE_BLOCK)
    && REAL_GUARD !== '' && /knobs: LIVE_K,/.test(REAL_GUARD)
    && !/knobs: (K,|\{ ?\.\.\.K)/.test(REAL_GUARD)
    && pacingKnobs({ OB_PACING_GUARD: '0' }).guard === false
    && pacingKnobs({}).guard === true);
  // a shorthand `knobs }` names the set as much as `knobs: X` does (the GH-691
  // (e4) drives pass their knob set that way)
  const IMPLICIT = GUARD_BLOCKS.filter((b) => !/\bknobs(?::|\s*[,}]|\s*$)/.test(b));
  check('pacing (c2): every guardPacingArm in this suite NAMES its knob set — '
    + 'a scripted sample is judged against the bars it was written for (K) '
    + 'and only the REAL-box guard reads the operator env (LIVE_K); none '
    + 'inherits process.env implicitly, where a lowered bar turns the '
    + 'fabricated CALM sample stormy (review r8 P2)',
  GUARD_BLOCKS.length >= 5 && IMPLICIT.length === 0
    && classifyStorm(CALM, pacingKnobs({ OB_PACING_STORM_SHELLS: '1' })).stormy === true
    && classifyStorm(CALM, pacingKnobs({ OB_PACING_STORM_RTT_MS: '2' })).stormy === true
    && classifyStorm(CALM, K).stormy === false,
  `${IMPLICIT.length} of ${GUARD_BLOCKS.length} guard(s) without a knobs line`);

  // ---- (e) GH-691: the DERIVED busy-CPU bar — pure derivation, knob
  // precedence, the classifier's vote, the guard's SKIP by name, the
  // auditable log line, and the once-per-job env hand-off --------------------
  {
    const mk = (busy, shells = 0, load = 0.7) => busy.map((b, i) => ({ t: i * 5000, busyCpu: b, shells, loadNorm: load, util: 40 }));
    const B = (samples) => ({ v: 1, host: 'fixture', pid: 1, at: '2026-09-07T09:00:00.000Z', gapMs: 5000, durationMs: 55000, samples, source: 'fixture' });
    const REST = [800, 825, 810, 840, 790, 830, 820, 815, 835, 805, 845, 825];
    const SPIKY = [300, 1500, 300, 1500, 300, 1500, 300, 1500, 300, 1500, 300, 1500];
    const restB = B(mk(REST));
    const d = deriveBusyCpuBar(restB);
    check('pacing (e1): a rested, quiet window derives bar = median + max(3σ̂, one busy core) and says which bound bit',
      d.state === 'QUIET' && d.quiet && Math.abs(d.median - 822.5) < 1e-9 && d.margin === 100
        && /quantum/.test(d.marginHow) && Math.round(d.bar) === 923, JSON.stringify(d));
    const noisy = B(mk([600, 900, 700, 1100, 650, 1000, 800, 1200, 620, 950, 700, 1050]));
    const dn = deriveBusyCpuBar(noisy);
    check('pacing (e1): a wider rest window grows the margin with its own σ̂ (3σ̂ above the quantum) — derived, not authored',
      dn.state === 'QUIET' && dn.margin > 100 && /σ̂/.test(dn.marginHow)
        && Math.abs(dn.margin - 3 * dn.sigma) < 1e-9 && dn.marginFrac > 0, JSON.stringify(dn));
    check('pacing (e1): UNQUIET when σ̂/base exceeds the bound; UNRESTED when ANY sample saw a foreign browser or loadavg/cores at the bar',
      deriveBusyCpuBar(B(mk(SPIKY))).state === 'UNQUIET'
        && deriveBusyCpuBar(B(mk(REST, 1))).state === 'UNRESTED'
        && deriveBusyCpuBar(B(mk(REST, 0, 1.5))).state === 'UNRESTED'
        && deriveBusyCpuBar(B(mk(REST, 0, 1.49))).state === 'QUIET'
        && deriveBusyCpuBar(B([...mk(REST.slice(0, 11)), ...mk([820], 1)])).state === 'UNRESTED');
    check('pacing (e1): an idle box (median below one core) derives bar = one core, judged on that base (no zero bar, no divide-by-zero)',
      (() => { const i = deriveBusyCpuBar(B(mk([0, 0, 0, 10, 0, 0, 60, 0, 0, 0, 0, 0]))); return i.state === 'QUIET' && i.bar === 100 && Number.isFinite(i.dispersion); })());
    check('pacing (e1): an EMPTY / unparsable ps snapshot makes the window UNDERIVED by name, never a QUIET idle box (review r4 P2)',
      (() => {
        const failed = { ...restB, samples: [...mk(REST.slice(0, 11)), { t: 55000, busyCpu: null, shells: null, loadNorm: 0.7, util: null, psFailed: true }] };
        const dd = deriveBusyCpuBar(failed); const kk = pacingKnobs({ [BASELINE_ENV]: JSON.stringify(failed) });
        return dd.state === 'UNDERIVED' && dd.psFailures === 1 && Number.isNaN(dd.bar)
          && kk.busyCpuBarSource === 'UNDERIVED'
          && /ps snapshots were empty or unparsable/.test(baselineSkip(kk, 'x')?.line ?? '')
          && /UNDERIVED — 1 of 12 ps snapshots/.test(formatBaselineLine(kk, 'x'))
          && deriveBusyCpuBar(B(mk([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))).state === 'QUIET'; // a genuinely idle box still derives
      })());
    check('pacing (e1): the sampler records a failed ps as psFailed (an empty snapshot is never an idle box) and the window then derives UNDERIVED',
      (await (async () => {
        const bb = await sampleStormBaseline({ samples: 2, gapMs: 1, rowsNow: () => [] });
        return bb.samples.every((x) => x.psFailed === true && x.busyCpu === null) && deriveBusyCpuBar(bb).state === 'UNDERIVED'
          && pacingKnobs({ [BASELINE_ENV]: JSON.stringify(bb) }).busyCpuBarSource === 'UNDERIVED';
      })()));
    check('pacing (e1): the operator\'s fixed fraction overrides k·σ̂; k and the quantum are knobs; an empty window is UNDERIVED',
      Math.abs(deriveBusyCpuBar(restB, { marginFrac: 0.5 }).bar - 822.5 * 1.5) < 1e-9
        && deriveBusyCpuBar(restB, { quantum: 250 }).margin === 250
        && deriveBusyCpuBar(noisy, { k: 6 }).margin > dn.margin
        && deriveBusyCpuBar(B([])).state === 'UNDERIVED');
    const envB = { [BASELINE_ENV]: JSON.stringify(restB) };
    check('pacing (e2): precedence explicit > derived > UNDERIVED; a malformed or empty baseline is UNDERIVED, never the old constant',
      pacingKnobs(envB).busyCpuBarSource === 'derived' && Math.round(pacingKnobs(envB).busyCpuBar) === 923
        && pacingKnobs({ ...envB, OB_PACING_STORM_BUSYCPU: '300' }).busyCpuBarSource === 'env'
        && pacingKnobs({ ...envB, OB_PACING_STORM_BUSYCPU: '300' }).busyCpuBar === 300
        && pacingKnobs({ ...envB, OB_PACING_STORM_BUSYCPU: '300' }).baselineQuiet === null
        && pacingKnobs({}).busyCpuBarSource === 'UNDERIVED' && Number.isNaN(pacingKnobs({}).busyCpuBar)
        && pacingKnobs({ [BASELINE_ENV]: '{nope' }).busyCpuBarSource === 'UNDERIVED'
        && pacingKnobs({ [BASELINE_ENV]: JSON.stringify({ v: 1, samples: [] }) }).busyCpuBarSource === 'UNDERIVED');
    check('pacing (e2): every knob reaches the derivation (K, QUANTUM, SPREAD_MAX, MARGIN, SAMPLES, GAP_MS)',
      pacingKnobs({ ...envB, OB_PACING_STORM_BUSYCPU_K: '6' }).k === 6
        && pacingKnobs({ ...envB, OB_PACING_STORM_BUSYCPU_QUANTUM: '250' }).busyCpuBar === 822.5 + 250
        && pacingKnobs({ [BASELINE_ENV]: JSON.stringify(noisy), OB_PACING_BASELINE_SPREAD_MAX: '0.01' }).baselineState === 'UNQUIET'
        && pacingKnobs({ ...envB, OB_PACING_STORM_BUSYCPU_MARGIN: '0.5' }).busyCpuBar === 822.5 * 1.5
        && pacingKnobs({ OB_PACING_BASELINE_SAMPLES: '3', OB_PACING_BASELINE_GAP_MS: '200' }).baselineSamples === 3
        && pacingKnobs({ OB_PACING_BASELINE_GAP_MS: '200' }).baselineGapMs === 200);
    const kd = pacingKnobs(envB);
    check('pacing (e3): the busy axis votes against the DERIVED bar and cites baseline + margin; UNDERIVED casts NO vote (absent bar = absent axis)',
      classifyStorm({ ...CALM, busyCpu: 1000 }, kd).stormy === true
        && /bar = baseline median 823% \+ margin 100%/.test(classifyStorm({ ...CALM, busyCpu: 1000 }, kd).axes[0])
        && classifyStorm({ ...CALM, busyCpu: 900 }, kd).stormy === false
        && classifyStorm({ ...CALM, busyCpu: 99999 }, pacingKnobs({})).stormy === false
        && classifyStorm({ ...CALM, busyCpu: 99999 }, pacingKnobs({ OB_PACING_STORM_LOADNORM: '9' })).stormy === false
        && classifyStorm({ ...CALM, busyCpu: 99999 }, pacingKnobs({ ...envB, OB_PACING_STORM_BUSYCPU: '300' })).axes[0].includes('explicit OB_PACING_STORM_BUSYCPU'),
    JSON.stringify(classifyStorm({ ...CALM, busyCpu: 1000 }, kd).axes));
    const skipDrive = async (knobs) => {
      const log = []; let calls = 0;
      const r = await guardPacingArm({ chrome: null, label: 'e4', sampler: async () => CALM,
        measure: async () => { calls += 1; return 1; }, judge: () => null,
        fail: () => log.push('FAIL'), log: (l) => log.push(l), knobs });
      return { r, log, calls };
    };
    const un = await skipDrive(pacingKnobs({ [BASELINE_ENV]: JSON.stringify(B(mk(REST, 2))) }));
    check('pacing (e4): an UNRESTED baseline SKIPs by name at once — zero measurements, one synthetic sample carrying the state, the line harvest-matched',
      un.r.verdict === 'storm-skip' && un.calls === 0 && un.r.samples.length === 1
        && un.r.samples[0].baselineState === 'UNRESTED' && /storm bar UNRESTED/.test(un.r.samples[0].axes[0])
        && /SKIPPED-STORM e4: storm bar UNRESTED/.test(un.log[0]) && /foreign browsers max 2/.test(un.log[0])
        && WAIVER_HARVEST.test(un.log[0]), un.log.join(' | ').slice(0, 300));
    const uq = await skipDrive(pacingKnobs({ [BASELINE_ENV]: JSON.stringify(B(mk(SPIKY))) }));
    const ud = await skipDrive(pacingKnobs({}));
    check('pacing (e4): UNQUIET and UNDERIVED SKIP by name the same way, each naming its own remedy',
      uq.r.verdict === 'storm-skip' && uq.calls === 0 && /storm bar UNQUIET/.test(uq.log[0]) && /σ̂\/base/.test(uq.log[0])
        && ud.r.verdict === 'storm-skip' && ud.calls === 0 && /storm bar UNDERIVED/.test(ud.log[0])
        && /prime it/.test(ud.log[0]) && WAIVER_HARVEST.test(ud.log[0]) && WAIVER_HARVEST.test(uq.log[0]),
    (uq.log[0] ?? '').slice(0, 200));
    check('pacing (e4): baselineSkip is the ONE shared decision — UNRESTED / UNQUIET / UNDERIVED name their state, an explicit bar or a QUIET derived bar return null (review r1 P2)',
      baselineSkip(pacingKnobs({ [BASELINE_ENV]: JSON.stringify(B(mk(REST, 2))) }), 'x')?.state === 'UNRESTED'
        && baselineSkip(pacingKnobs({ [BASELINE_ENV]: JSON.stringify(B(mk(SPIKY))) }), 'x')?.state === 'UNQUIET'
        && baselineSkip(pacingKnobs({}), 'x')?.state === 'UNDERIVED'
        && /SKIPPED-STORM x: storm bar UNDERIVED/.test(baselineSkip(pacingKnobs({}), 'x').line)
        && baselineSkip(pacingKnobs({}), 'x').sample.stormy === true
        && (() => { const sm = baselineSkip(pacingKnobs({ [BASELINE_ENV]: JSON.stringify(B(mk(REST, 2, 0.9))) }), 'x').sample;
          return sm.synthetic === true && sm.loadNorm === 0.9 && sm.shells === 2 && Number.isFinite(sm.busyCpu) && sm.rttP50 === null
            && typeof sm.loadNorm.toFixed === 'function'; })()
        && baselineSkip(kd, 'x') === null
        && baselineSkip(pacingKnobs({ [BASELINE_ENV]: JSON.stringify(B(mk(REST, 2))), OB_PACING_STORM_BUSYCPU: '300' }), 'x') === null);
    check('pacing (e4): perf-aim\'s own belt loop consults baselineSkip before it waits for calm (the other live consumer honours the same decision)',
      /baselineSkip\(knobs, 'perf-aim --gate frame budget'\)/.test(fs.readFileSync(path.join(WEB_DIR, 'tools', 'perf-aim.mjs'), 'utf8')));
    const okd = await skipDrive(kd);
    const exp = await skipDrive(pacingKnobs({ [BASELINE_ENV]: JSON.stringify(B(mk(REST, 2))), OB_PACING_STORM_BUSYCPU: '300' }));
    check('pacing (e4): a QUIET derived bar measures (green banks); an explicit bar measures even with an unrested inherited baseline (precedence)',
      okd.r.verdict === 'green' && okd.calls === 1 && exp.r.verdict === 'green' && exp.calls === 1);
    const line = formatBaselineLine(kd, 'fixture');
    check('pacing (e5): the baseline line carries the SAMPLE and the BAR — median/min/p25/max, σ̂, n × gap, browsers, load, util, bar, margin as a fraction, how, state, raw samples — and is not a waiver',
      /median 823%/.test(line) && /min 790 \/ p25 810 \/ max 845/.test(line) && /σ̂ 19%/.test(line)
        && /12 samples × 5\.0 s/.test(line) && /foreign browsers max 0/.test(line) && /loadavg\/cores max 0\.70/.test(line)
        && /util median 40%/.test(line) && /storm bar 923% = median \+ margin 100%/.test(line)
        && /0\.12 of the baseline/.test(line) && /QUIET \(GH-691\)/.test(line) && /busy samples \[800 825/.test(line)
        && !WAIVER_HARVEST.test(line), line.slice(0, 300));
    check('pacing (e5): with an explicit bar the line says the derived bar is NOT in force',
      /EXPLICIT OB_PACING_STORM_BUSYCPU=300%/.test(formatBaselineLine(pacingKnobs({ ...envB, OB_PACING_STORM_BUSYCPU: '300' }), 'x')));
    // (e6) the once-per-job hand-off: the CLI emits a $GITHUB_ENV line from
    // a REAL (short) window; a pre-set baseline is re-emitted verbatim; a
    // child under run-gate inherits it untouched. The env is SCRUBBED of
    // any inherited baseline for the sampling leg (this suite may itself
    // run primed under the nightly's step) and of the CI flags (arm 8g law).
    {
      const cli = path.join(WEB_DIR, 'tools', 'storm-baseline.mjs');
      const scrub = () => {
        const e = { ...process.env, OB_PACING_BASELINE_SAMPLES: '3', OB_PACING_BASELINE_GAP_MS: '200' };
        for (const k of [BASELINE_ENV, 'OB_PACING_STORM_BUSYCPU', 'OB_PACING_GUARD', 'GITHUB_ACTIONS', 'OB_CI_BANDS', 'CI',
          'OB_E2E_BAND_START', 'OB_E2E_BAND_END']) delete e[k];
        for (const k of Object.keys(e)) if (/^OB_\w*(PORT|CDP|BAND_START|BAND_END|PORT_BASE)\w*$/.test(k) && !/_(MS|TRIES|FAILS|SCALE|DIR)$/.test(k) && k !== 'OB_PORT_BANDS' && k !== 'OB_PORT_BANDS_DIR') delete e[k];
        return e;
      };
      const t0 = Date.now();
      const r = spawnSync(process.execPath, [cli, '--github-env'], { encoding: 'utf8', timeout: 60000, env: scrub() });
      const m = /^OB_PACING_BASELINE=(\{.*\})\s*$/m.exec(r.stdout);
      let emitted = null; try { emitted = m && JSON.parse(m[1]); } catch { emitted = null; }
      check('pacing (e6): storm-baseline.mjs --github-env emits ONE `OB_PACING_BASELINE=<json>` line from a real window of the requested size, and logs the baseline line',
        r.status === 0 && !!emitted && emitted.v === 1 && emitted.source === 'sampled' && emitted.samples.length === 3
          && emitted.gapMs === 200 && Date.parse(emitted.at) >= t0 - 1000
          && /\[pacing-storm\] baseline \(sampled/.test(r.stderr) && r.stdout.trim().split('\n').length === 1,
      `status ${r.status} stdout ${r.stdout.slice(0, 120)} stderr ${r.stderr.slice(0, 160)}`);
      const fixture = JSON.stringify(restB);
      const r2 = spawnSync(process.execPath, [cli, '--github-env'], { encoding: 'utf8', timeout: 60000, env: { ...scrub(), [BASELINE_ENV]: fixture } });
      check('pacing (e6): a baseline already in the env is re-emitted VERBATIM (never re-sampled) and logged as inherited',
        r2.status === 0 && r2.stdout.trim() === `OB_PACING_BASELINE=${fixture}` && /baseline \(inherited/.test(r2.stderr),
      `status ${r2.status} ${r2.stdout.slice(0, 100)}`);
      const r3 = spawnSync(process.execPath, [cli, '--github-env'], { encoding: 'utf8', timeout: 60000, env: { ...scrub(), OB_PACING_STORM_BUSYCPU: '300' } });
      check('pacing (e6): with an explicit bar nothing is emitted and the log says the derived bar is not in force',
        r3.status === 0 && r3.stdout.trim() === '' && /EXPLICIT OB_PACING_STORM_BUSYCPU/.test(r3.stderr));
      const runGate = path.join(WEB_DIR, 'tools', 'run-gate.mjs');
      const REG = `/tmp/ob-port-bands-hygiene-691-${process.pid}`; const LDG = fs.mkdtempSync('/tmp/obw-hygiene-691-ledger-');
      const stage = fs.mkdtempSync('/tmp/obw-hygiene-691-suite-'); const staged = path.join(stage, 'echo-baseline.mjs');
      fs.writeFileSync(staged, "console.log('BASELINE-ECHO ' + (process.env.OB_PACING_BASELINE ?? 'none'));\n");
      const base = 45900 + ((process.pid * 53) % 90);
      const g = spawnSync(process.execPath, [runGate, '--band', `${base}-${base + 29}`, '--no-canary', '--no-belt', '--', staged],
        { encoding: 'utf8', timeout: 90000, cwd: WEB_DIR, env: { ...scrub(), OB_PORT_BANDS: '', OB_PORT_BANDS_DIR: REG, OB_GATE_LEDGER_DIR: LDG, [BASELINE_ENV]: fixture } });
      const echo = /^BASELINE-ECHO (.*)$/m.exec(g.stdout);
      const plumbing = (fs.readFileSync(runGate, 'utf8').match(/const ENV_PLUMBING = new Set\(\[[\s\S]*?\]\);/) ?? [''])[0].replace(/\/\/[^\n]*/g, '');
      check('pacing (e6): a suite wrapped by run-gate inherits the job\'s baseline VERBATIM (pass-through, no re-sample); OB_PACING_BASELINE is ledger plumbing, the derivation knobs are not',
        g.status === 0 && !!echo && echo[1] === fixture
          && /'OB_PACING_BASELINE'/.test(plumbing) && !/OB_PACING_STORM_BUSYCPU_K|OB_PACING_BASELINE_SPREAD_MAX|OB_PACING_STORM_BUSYCPU_MARGIN/.test(plumbing),
      `status ${g.status} ${(g.stderr + g.stdout).slice(0, 200)}`);
      fs.rmSync(REG, { recursive: true, force: true }); fs.rmSync(LDG, { recursive: true, force: true }); fs.rmSync(stage, { recursive: true, force: true });
    }
  }

  // (d) LIVE teeth: a REAL main-thread rAF stall (45 ms/frame — the exact
  // regression class the guards exist for; issue #664: per FRAME, inside
  // the callback — a timer-task burner is a different shape the class's
  // metric cannot see, measured below) on a real booted page. The
  // classifier is forced calm (the quiet-box scenario; the box we run on
  // may legitimately be stormy) — the arm must STILL red. And the axis-
  // independence pin: Browser.getVersion RTT must NOT inflate under the
  // stall while Runtime.evaluate RTT DOES — the mechanism that stops an
  // in-app regression from disguising itself as a storm.
  const pServer = spawnStaticServer(WEB_DIR, PORT + 5);
  await sleep(700);
  let pClient = null;
  try {
    pClient = await launchChrome(
      `http://127.0.0.1:${PORT + 5}/app.html?seed=1`, { port: CDP + 5 });
    // in-page cap on one measured window (a timer on the page under test,
    // so a starved page can overrun it — the teeth reserve below cites it)
    const FRESH_WINDOW_CAP_MS = 15000;
    const freshWindow = () => pClient.eval(`(() => new Promise((res) => {
      const ds = []; let last = performance.now(); const t0 = last;
      function step(ts) { ds.push(ts - last); last = ts;
        if (ts - t0 >= 2500) res(ds.slice(2));
        else requestAnimationFrame(step); }
      requestAnimationFrame(step);
      setTimeout(() => res(ds.slice(2)), ${FRESH_WINDOW_CAP_MS}); }))()`);
    const pct = (arr, q) => [...arr].sort((a, b) => a - b)[Math.floor(arr.length * q)];
    const preRtt = await controlRttP50(pClient);
    // timeout-paced burner, NOT rAF-paced, FOR THE RTT-CONTRAST PINS ONLY:
    // ~96% main-thread duty (45 ms burn / 2 ms gap) regardless of how the
    // storm spaces the frames — an rAF-paced stall's duty cycle rides the
    // box's frame interval and made the eval-RTT contrast below a lottery
    // (measured: eval p50 58 ms one run, 5 ms the next). It is NOT the
    // teeth stall any more (issue #664): see the long-frame hog below.
    await pClient.eval('window.__obHygieneBurn = true; (function burn() { '
      + 'if (!window.__obHygieneBurn) return; '
      + 'const t = performance.now(); while (performance.now() - t < 45); '
      + 'setTimeout(burn, 2); })(); true');
    await sleep(300); // let the stall loop take hold
    // random arrival phase per eval: back-to-back evals PHASE-LOCK to the
    // burner's 2 ms idle gap (each rides right behind the previous one and
    // reads ~1 ms — measured), so the pin is the MAX wait across 7
    // decorrelated arrivals: some eval provably landed mid-burn and waited
    // a burn slice. P(all 7 miss a 96%-duty burn) ≈ 3e-4.
    const evalRtts = [];
    for (let i = 0; i < 7; i++) {
      await sleep(15 + Math.floor(Math.random() * 47));
      const t0 = Date.now();
      await pClient.eval('1+1');
      evalRtts.push(Date.now() - t0);
    }
    const evalMax = Math.max(...evalRtts);
    let duringRtt = await controlRttP50(pClient);
    // host-storm guard (review r12 P2): these two contrast pins read the
    // LIVE control plane, so a genuine host-wide RTT storm — the very
    // condition this patch reclassifies elsewhere — could red the
    // never-skipped hygiene suite tree-independently. A storm-grade
    // pre-stall sample means the host was already stormy: cite and skip
    // the contrast pins (they prove axis independence, which a stormy
    // control plane cannot witness either way). A calm-pre/stormy-during
    // reading gets ONE re-sample (a storm arriving mid-proof); a repeat
    // on a calm host IS the contamination defect and fails.
    if (preRtt >= K.rttStormMs) {
      console.log('[hygiene] SKIP pacing (d) RTT-contrast pins — host '
        + `control plane stormy before the stall (p50 ${preRtt} ms >= `
        + `${K.rttStormMs}); the axis-independence proof needs a calm host `
        + '(GH-425 citation: this is a machine condition, not a tree verdict)');
    } else {
      if (duringRtt >= K.rttStormMs) duringRtt = await controlRttP50(pClient);
      check('pacing (d): the control-plane RTT axis does not inflate under an '
        + `in-app main-thread stall (pre ${preRtt} ms → during ${duringRtt} ms)`,
      duringRtt < Math.max(300, preRtt * 10));
      check('pacing (d): Runtime.evaluate RTT DOES ride the stalled main '
        + `thread (eval waits up to ${evalMax} ms [${evalRtts.join(',')}] vs `
        + `browser-domain p50 ${duringRtt} ms) — why the axis is `
        + 'Browser.getVersion', evalMax >= 15 && evalMax > duringRtt);
    }
    // ---- the TEETH stall is the LONG-FRAME class, not the timer burner -----
    // Issue #664 (d): nightly red 8/9 since 08-29 with the burner ALIVE
    // (eval waits 46-53 ms in the same logs, 20 burns/s measured). The rAF
    // timestamp is the compositor's FRAME TIME, not the callback's clock:
    // under a TIMER-task stall — the main thread busy OUTSIDE its frames —
    // consecutive frame times stay one or two vsyncs apart while the
    // callbacks actually run ~46-50 ms apart. Measured on the pinned shell
    // (2026-09-06) in two forms: catch-up PAIRS (the missed BeginMainFrame
    // replayed back-to-back in the burner's ~5 ms gap: wall spacing
    // 0.6/49.8 ms, ts deltas 16.7/33.4) and a LAGGING frame clock (0 pairs,
    // wall p95 46.3, ts p95 33.4). Either way the ts-delta p95 lands on
    // 33.4 ms — one tenth under the 34 ms bar. The class's metric — GH-260
    // D's `ts - last` — is blind to that stall SHAPE on a quiet box and only
    // reds when box noise breaks the pattern (the lone 08-31 PASS): teeth
    // inverted. A stall INSIDE the frame callback (45 ms per frame — the
    // app's own frame work growing, the regression these guards exist for)
    // holds BeginMainFrame itself, so the next frame time is a fresh vsync
    // three intervals on: ts-delta p95 50.1 ms, red under the same metric,
    // deterministically. The blind spot is RECORDED on every run as a note
    // — Chrome scheduler behaviour is not a law of ours to pin either way.
    {
      const bw = await pClient.eval(`(() => new Promise((res) => {
        const ts = []; const now = []; const t0 = performance.now();
        function step(t) { ts.push(t); now.push(performance.now());
          if (t - t0 >= 1500) res({ ts, now });
          else requestAnimationFrame(step); }
        requestAnimationFrame(step);
        setTimeout(() => res({ ts, now }), 15000); }))()`);
      const d = (a) => a.slice(1).map((v, i) => v - a[i]).slice(2);
      const dts = d(bw.ts); const dnow = d(bw.now);
      console.log('[hygiene] NOTE pacing (d): timer-task stall vs the rAF-'
        + `timestamp metric — ts-delta p95 ${pct(dts, 0.95)?.toFixed(1)} ms `
        + `vs callback wall-clock p95 ${pct(dnow, 0.95)?.toFixed(1)} ms over `
        + `${dts.length} frames (${dnow.filter((v) => v < 3).length} `
        + 'back-to-back catch-up callbacks) — the measured blind spot behind '
        + 'the long-frame teeth stall (issue #664)');
    }
    await pClient.eval('window.__obHygieneBurn = false; true');
    await sleep(150); // the last burn slice drains
    await pClient.eval('window.__obHygieneHog = { on: true, frames: 0 }; '
      + '(function hog() { const h = window.__obHygieneHog; if (!h.on) return; '
      + 'h.frames++; const t = performance.now(); '
      + 'while (performance.now() - t < 45); requestAnimationFrame(hog); })(); '
      + 'true');
    await sleep(300); // let the long-frame stall take hold
    const hogFrames = () => pClient.eval('window.__obHygieneHog.frames');
    // hog frames are counted PER measured window (a confirming re-measure
    // is a second window): the injection self-check below must not be
    // satisfiable by a hog that died after the first window — and it must
    // not red on a STARVED window either (review r1 P2: under extreme host
    // churn the collector can shrink to 0-2 frames, the `undersized` red the
    // teeth judge deliberately accepts; the hog advances once per collected
    // frame, so a frame floor there would fail a valid verdict). Each entry
    // records the window's frames and the hog frames it saw.
    // One teeth proof = the scripted-CALM guard over the hogged page. Its
    // collectors are per attempt so an outer retry never blends windows.
    const runTeethProof = async () => {
      const hogPerWindow = [];
      const liveFails = [];
      const liveLog = [];
      const live = await guardPacingArm({
        chrome: pClient,
        label: 'live stall teeth proof',
        sampler: async () => CALM, // quiet-box classification, REAL measurement
        // the fabricated CALM sample is judged against the bars it was
        // written for — the env-FROZEN set every scripted guard in this
        // suite carries. Left implicit it read process.env, so a lowered
        // operator bar (OB_PACING_STORM_SHELLS=1, or RTT_MS=2) turned the
        // quiet-box scenario stormy: the inner guard waited out the calm
        // bound, measured nothing, and the outer guard failed an otherwise
        // calm run on 'no teeth window was measured' (review r8 P2). Only the
        // REAL-box guard below reads the operator env (LIVE_K).
        knobs: K,
        // the window itself, not a pre-reduced p95: an UNDERSIZED window is
        // a red, never a vacuous green (the review-r8 law — under extreme
        // host churn the collector can starve to 0-2 deltas after the
        // warmup trim, and pct() on that is undefined; measured live at
        // loadNorm 2.35)
        measure: async () => {
          const h0 = await hogFrames();
          const w = await freshWindow();
          hogPerWindow.push({ frames: w.length, hog: (await hogFrames()) - h0 });
          return w;
        },
        judge: (w) => (w.length < TEETH_MIN_FRAMES
          ? `RAF window undersized under the stall: ${w.length} frames`
          : (pct(w, 0.95) > 34
            ? `RAF-delta p95 ${pct(w, 0.95).toFixed(1)} ms > 34 ms guard` : null)),
        fail: (m) => liveFails.push(m),
        log: (m) => liveLog.push(m),
      });
      return { live, hogPerWindow, liveFails, liveLog };
    };
    // The proof's PRECONDITION rides the REAL box (no scripted sampler:
    // the four live axes). The scripted-calm classifier above is the
    // quiet-box scenario the teeth are proven under — it cannot notice
    // that the box it runs on is NOT quiet. Measured 2026-09-06 on the
    // merged tree with this Mac at loadavg 28.9/40.2/39.4 (24 cores, 11
    // foreign shells: two CI e2e jobs plus sibling lanes' gates): the page
    // produced ZERO frames in both teeth windows, the teeth judge red on
    // `undersized` — for the wrong reason — and the injection self-check
    // reported {frames 0, hog 0} as a FAIL that read as an injection
    // death. A rAF-paced hog cannot run on a page that gets no rAF; that
    // window says nothing about the injection. So the outer guard judges
    // ATTRIBUTION (attributeTeethWindows): a starved or hog-dead window is
    // its red, which the standard belt then classifies — INFRA under a
    // storm sample (retry in a calmer window, SKIPPED-STORM with the
    // citation at the bound: run-gate's harvest matches it, the run can
    // never bank), or a confirmed honest red on a CALM box that names
    // which state it is. A stormy canary defers the proof up front. The
    // knobs are K unchanged: no new constant, the same bound every pacing
    // arm has. The teeth judge stays exactly as it was.
    // The scripted decision proofs above run on an env-FROZEN knob set
    // (pacingKnobs({})) so no operator env can move what they assert. This
    // one is not a scripted proof — it is a LIVE arm on the real box, so it
    // takes the operator's knobs exactly like the repo's other live consumer
    // (perf-aim.mjs): OB_PACING_GUARD=0 has to reach it (the documented
    // quiet-box calibration path — the box this suite runs on may never
    // clear the busy-CPU axis), and the bars/bounds stay tunable per run.
    // CI sets none of them, so the shipped behaviour is the same defaults
    // the frozen set carries.
    const LIVE_K = pacingKnobs();
    // GH-935: what the suite still needs after the REAL-box guard's wait
    // ends, so that wait is clamped to the watchdog instead of racing it
    // (a storm that outlasts the budget ends on SKIPPED-STORM, never on the
    // watchdog). Derived from the bounds the remaining steps already carry:
    //   teeth windows: outer attempts (1 + LIVE_K.calmRetries) x inner
    //     measures (1 + K.calmRetries — the inner judge reds by design, so
    //     it always spends its confirmation), each capped in-page at
    //     FRESH_WINDOW_CAP_MS;
    //   the canary's RTT probe: 5 rounds x boundMs 5000 (controlRttP50);
    //   the tail: the SIGSTOP probe's 5000 ms wall check, closeAndWait
    //     (killAndWait: 3000 + 5000 after SIGKILL) and stopStaticServer
    //     (2000 + 3000 after SIGKILL + 20 x 100 ms polls); the flip guard is
    //     scripted with calmWaitMs 0 and waits for nothing.
    // A heuristic, not a hard bound: the in-page cap is a timer on a page
    // the storm may be starving.
    const TEETH_RESERVE_MS = (1 + LIVE_K.calmRetries) * (1 + K.calmRetries) * FRESH_WINDOW_CAP_MS
      + 5 * 5000
      + 5000 + (3000 + 5000) + (2000 + 3000 + 20 * 100);
    // (e7) GH-691 red-proof on THIS box, side-effect free: ONE real sample
    // (all four axes) classified twice — under the OLD constant 300 and
    // under the shipped derived bar. The relation is asserted on the
    // sample's own numbers, so the arm is honest on a hosted runner (rest
    // < 300: the constant measures) and on ci-host (rest ~800-1100%:
    // the constant storms every time, the derived bar reads rest as rest).
    {
      const live = await sampleStorm(pClient, LIVE_K);
      const oldK = { ...LIVE_K, busyCpuBar: 300, busyCpuBarSource: 'env', baselineQuiet: null, baselineState: null };
      const underOld = classifyStorm(live, oldK);
      const busyVote = (c) => c.axes.some((a) => /busy-CPU/.test(a));
      console.log(`[hygiene] pacing (e7) live sample: busy ${Math.round(live.busyCpu)}% shells ${live.shells} `
        + `loadNorm ${live.loadNorm.toFixed(2)} rtt ${live.rttP50} ms | OLD constant 300 → `
        + `${busyVote(underOld) ? 'busy axis STORM' : 'busy axis calm'} (${underOld.stormy ? 'stormy' : 'calm'} overall) | `
        + `DERIVED bar ${LIVE_K.busyCpuBarSource === 'derived' ? `${Math.round(LIVE_K.busyCpuBar)}% (${LIVE_K.baselineState})` : LIVE_K.busyCpuBarSource} → `
        + `${LIVE_K.busyCpuBarSource === 'derived' ? (busyVote(live) ? 'busy axis STORM' : 'busy axis calm') : 'no vote'}`);
      check('pacing (e7): the same live sample votes STORM on the busy axis under the OLD constant '
        + 'iff busy >= 300, and under the DERIVED bar iff busy >= that bar (UNDERIVED never votes) — '
        + 'on this box the constant storms at rest while the derived bar reads rest as rest',
      busyVote(underOld) === (live.busyCpu >= 300)
        && (LIVE_K.busyCpuBarSource === 'derived'
          ? busyVote(live) === (live.busyCpu >= LIVE_K.busyCpuBar)
          : LIVE_K.busyCpuBarSource === 'UNDERIVED' ? busyVote(live) === false : true),
      JSON.stringify({ busy: live.busyCpu, bar: LIVE_K.busyCpuBar, source: LIVE_K.busyCpuBarSource, axes: live.axes }));
    }
    const attributionFails = [];
    const outer = await guardPacingArm({
      chrome: pClient,
      label: 'live teeth proof precondition (REAL box)',
      measure: async () => runTeethProof(),
      judge: (r) => attributeTeethWindows(r.hogPerWindow),
      fail: (m) => attributionFails.push(m),
      log: console.log, // DEFER / SKIPPED-STORM lines reach the run log
      knobs: LIVE_K,
      // the budget's deadline, and never past the stall timer: a calm wait is no check
      deadlineAt: Math.min(WATCHDOG_AT + WATCHDOG_MS, wd.stallDeadline()) - TEETH_RESERVE_MS,
    });
    if (outer.verdict === 'storm-skip' && outer.samples[0]?.baselineState) {
      // GH-691: no bar could be derived for this run — the proof cannot
      // tell rest from storm; skipped BY NAME (harvest-matched, unbanked)
      console.log('[hygiene] SKIP pacing (d) live teeth proof — SKIPPED-STORM: the pre-run '
        + `storm baseline is ${outer.samples[0].baselineState} (${LIVE_K.derived
          ? `median ${Math.round(LIVE_K.derived.median)}%, foreign browsers max ${LIVE_K.derived.shellsMax}, `
            + `loadavg/cores max ${LIVE_K.derived.loadNormMax.toFixed(2)}, σ̂/base ${LIVE_K.derived.dispersion.toFixed(2)}`
          : 'no baseline in the env'}) — no busy-CPU bar separates rest from storm in it, `
        + 'so the teeth proof would measure the machine; not a tree verdict, this run cannot bank (GH-691).');
    } else if (outer.verdict === 'storm-skip') {
      const last = outer.samples[outer.samples.length - 1];
      console.log('[hygiene] SKIP pacing (d) live teeth proof — SKIPPED-STORM: '
        + `the REAL box stayed stormy across the ${outer.bound === 'caller-deadline'
          ? `watchdog deadline (the ${WATCHDOG_MS / 1000} s budget or the ${STALL_MS / 1000} s stall bound, whichever is first, less a ${TEETH_RESERVE_MS / 1000} s teeth reserve)`
          : outer.bound === 'max-measures' ? 'storm-retry budget' : 'calm-wait bound'} [`
        + `${last?.axes?.join(' | ') ?? 'no axes'}] over ${outer.samples.length} `
        + 'samples; a teeth proof under a scripted calm classifier on a '
        + 'stormy box measures the machine (a starved page reds for the '
        + 'wrong reason). Not a tree verdict; this run cannot bank (GH-425).');
    } else {
      const r = outer.measured; // the attributable (or last confirming) proof
      const liveW = Array.isArray(r.live.measured) ? r.live.measured : [];
      // injection self-check FIRST (issue #664: a verdict here must be
      // attributable from the log alone — classifier, injection, metric or
      // a starved page): EVERY measured window saw the hog ADVANCE, and a
      // window saw it in at least half of its frames (≈50 hog frames per
      // 2.5 s window measured). An UNDERSIZED window (< TEETH_MIN_FRAMES)
      // never reaches this branch at all: attribution calls it host
      // starvation, so outer.verdict is not green and this arm reds with
      // the attribution message (review r7 P2)
      check('pacing (d): the long-frame hog was LIVE through every teeth '
        + 'window (injection self-check: per window {frames, hog} '
        + `${JSON.stringify(r.hogPerWindow)})`,
      outer.verdict === 'green', attributionFails.join(' || '));
      check('pacing (d): the stalled page REDS under a calm classifier '
        + '(the arm keeps its teeth on a quiet box) and the red is the '
        + "INJECTION's — an over-budget p95, never the undersized-window "
        + 'red, which a green attribution has already ruled out (review '
        + 'r16 P1 kept the undersized red; review r7 P2 moved it upstream)',
      r.live.verdict === 'red' && r.liveFails.length === 1
        && /p95/.test(r.liveFails[0]),
      JSON.stringify({ v: r.live.verdict, liveFails: r.liveFails,
        frames: liveW.length,
        tsP95: liveW.length ? Number(pct(liveW, 0.95).toFixed(1)) : null,
        hogPerWindow: r.hogPerWindow }));
    }
    const flipLog = [];
    const flip = await guardPacingArm({
      chrome: pClient,
      label: 'live stall storm flip',
      sampler: async () => LOADSTORM,
      measure: async () => freshWindow(),
      judge: (w) => (w.length < TEETH_MIN_FRAMES
        || pct(w, 0.95) > 34 ? 'red' : null),
      fail: () => check('pacing (d): storm flip must never fail()', false),
      log: (m) => flipLog.push(m),
      knobs: { ...K, calmWaitMs: 0 },
    });
    check('pacing (d): the same stalled page under a STORM classifier flips '
      + 'to SKIPPED-STORM with the citation', flip.verdict === 'storm-skip'
      && /SKIPPED-STORM/.test(flipLog.join('\n')), flipLog.join('\n'));
    // bounded RTT probe (review r2 P2): a browser that stops answering must
    // yield a storm-grade sample within the probe bound, never ride
    // cdp.mjs's generic command deadline past the pacing window. SIGSTOP
    // our OWN tracked child (the arm-4b idiom — never by name), probe,
    // SIGCONT.
    process.kill(pClient.pid, 'SIGSTOP');
    const t0b = Date.now();
    const bounded = await controlRttP50(pClient, { boundMs: 400 });
    const boundedWall = Date.now() - t0b;
    process.kill(pClient.pid, 'SIGCONT');
    check('pacing (d): a non-answering browser probes as the storm-grade '
      + `UNANSWERED sentinel within the bound (${bounded} in ${boundedWall} ms `
      + 'wall) — stormy under ANY raised RTT bar (review r17 P2)',
    bounded === Infinity && boundedWall < 5000
      && classifyStorm({ rttP50: bounded },
        pacingKnobs({ OB_PACING_STORM_RTT_MS: '99999' })).stormy === true);
  } finally {
    const gone = pClient ? await pClient.closeAndWait() : true;
    check('pacing: teeth-proof chrome confirmed gone', gone === true);
    const srvGone = await stopStaticServer(pServer);
    check('pacing: teeth-proof server confirmed gone (review r4 P2)',
      srvGone !== false);
  }
}

// ---- arm 9 (--battery): MAIN-BATTERY shape re-proof (red-proof a) -------------
// GH-294 finisher: prove the migrated harness end to end on a REAL gate.
// e2e.mjs (the representative main-battery shape: static server + primary
// session + detBoot relaunches on CDP+1/+2) runs as a child on dedicated
// ports; afterwards NOTHING of its tree may survive — chrome roots, shell
// helpers (as new PPID-1 debt), the http.server wrapper AND its
// socket-holding grandchild, or profile dirs.
if (BATTERY) {
  const bPort = PORT + 10;
  const bCdp = CDP + 10;
  const debtRows = () => {
    try {
      return execFileSync('ps', ['-axo', 'pid=,ppid=,command='],
        { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: SYNC_CHILD_TIMEOUT_MS })
        .split('\n').map((l) => /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(l))
        .filter(Boolean)
        .map((m) => ({ pid: Number(m[1]), ppid: Number(m[2]), command: m[3] }));
    } catch { return []; }
  };
  const ppid1Debt = () => new Set(debtRows()
    .filter((r) => r.ppid === 1
      && /chrome-headless-shell|http\.server/.test(r.command))
    .map((r) => r.pid));
  const before = ppid1Debt();
  console.log(`[hygiene] --battery: running e2e.mjs on :${bPort} (cdp `
    + `${bCdp}-${bCdp + 2})…`);
  const run = spawnSync(process.execPath, [path.join(WEB_DIR, 'tools', 'e2e.mjs')],
    { encoding: 'utf8', cwd: WEB_DIR, timeout: 900000,
      env: { ...process.env, OB_E2E_PORT: String(bPort),
        OB_E2E_CDP_PORT: String(bCdp) } });
  const tail = (s) => String(s ?? '').split('\n').slice(-12).join('\n');
  check('battery: e2e.mjs PASSES end-to-end on the shell', run.status === 0,
    `status=${run.status}\n${tail(run.stdout)}\n${tail(run.stderr)}`);
  // teardown is CONFIRMED inside e2e.mjs before it exits (stopStaticServer /
  // the exit backstop), but give the ps view a short settle window anyway.
  const survivors = () => debtRows().filter((r) =>
    (r.command.includes('http.server') && (r.command.endsWith(` ${bPort}`)
      || r.command.includes(` ${bPort} `)))
    || [bCdp, bCdp + 1, bCdp + 2].some((p) =>
      r.command.includes(`--remote-debugging-port=${p}`)
      || r.command.includes(`--user-data-dir=${profileOf(p)}`)));
  let left = survivors();
  for (let i = 0; i < 50 && left.length; i++) { await sleep(100); left = survivors(); }
  check('battery: zero surviving harness children (chrome root, helpers by '
    + 'marker, http.server wrapper+grandchild)', left.length === 0,
  JSON.stringify(left));
  const dirs = [bCdp, bCdp + 1, bCdp + 2].map(profileOf).filter((d) => fs.existsSync(d));
  check('battery: zero surviving profile dirs', dirs.length === 0, dirs.join(' '));
  const newDebt = [...ppid1Debt()].filter((pid) => !before.has(pid));
  check('battery: no NEW PPID-1 shell/http.server debt appeared',
    newDebt.length === 0, `pids ${newDebt.join(',')}`);
}

// ---- verdict: the gate itself must also leave nothing behind ------------------
{
  const leftovers = [CDP, CDP + 1, CDP + 2].map(profileOf).filter((d) => fs.existsSync(d));
  check('gate epilogue: zero obw-e2e-profile dirs for this run\'s ports',
    leftovers.length === 0, leftovers.join(' '));
}
const wdEnd = wd.finish();
console.log(await loadLine('end'));
console.log(verdictLine(wdEnd));
process.exit(failed || wdEnd.code ? 1 : 0);
