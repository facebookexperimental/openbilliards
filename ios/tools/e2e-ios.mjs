// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-ios.mjs — feature-016 L3 Simulator e2e driver (T024;
// contracts/test-pyramid.md par.3, research R14, FR-013).
//
//   node ios/tools/e2e-ios.mjs [--scenario <name>] [--scenario-file <path>]
//                              [--airplane] [--udid <udid>]
//                              [--device 'iPhone 16'] [--app <path.app>]
//                              [--derived-data <dir>] [--keep-artifacts]
//
// EXECUTION [BLOCKED: local Xcode install] on this machine (Command Line
// Tools only — no simctl); the CI arm is T038 (hosted macOS runners ship
// Xcode). When the environment lacks a Simulator toolchain this tool exits
// 3 with the exact quickstart par.6 command recorded — a recorded external
// dependency, never silent drift.
//
// Pipeline (test-pyramid par.3):
//   1. boot/reuse a Simulator (xcrun simctl), install the DEBUG app when
//      --app/OB_APP_PATH is given;
//   2. clear + watch Documents/e2e/ in the app data container
//      (simctl get_app_container) — the DEBUG status seam (T025) plus the
//      ShellSeams eval channel live there; checkpoint markers are acked
//      instantly here (acceptance.mjs rides the same ack hook to take
//      simctl io screenshots first — OB_CHECKPOINT_SHOT_DIR);
//   3. run AppUITests/GestureDriver via xcodebuild test-without-building
//      with the scenario table + container path + the 014 PAGE_HELPERS_JS
//      (imported from web/tools/touch-cdp.mjs — single source, never
//      copied) in the TEST_RUNNER_ environment;
//   4. post-run scenario asserts over the mirrored artifacts:
//        recordByteCompare — SC-003: the shell's record-1.json bytes ==
//          the record produced by replaying the SAME (gesture-free)
//          scenario on a web-surface Chrome boot, both ?norec;
//        hapticsLogCompare — SC-005 in-shell: haptics-log.json (post
//          rate-bound) vs the in-page deriveCues derivation under the
//          frozen haptics-bridge.md par.5 bounds (COALESCE_MS 50 /
//          minGap 40 / globalMinGap 16): logged cues must match derived
//          cues 1:1 in class + clamped gain (order-preserving), and every
//          derived cue absent from the log must be rate-bound-explicable;
//        resumeClamp — SC-006: resume-probe.json dtApplied <= 0.1 s with
//          a real suspension gap;
//        perfRecord — SC-009: print app-perf.md row material;
//        zeroNonAppRequests — SC-001 (--airplane): injected as a final
//          in-page step asserting location.origin === 'app://local' and
//          every performance resource entry served from app://local/.
//
// Battery conventions: PASS/FAIL exit codes (0/1), watchdog hard-exit 2,
// environment-blocked exit 3, artifacts copied to /tmp/e2e-ios-<scenario>/,
// web reference arm on lsof-verified free ports in 8300-8399
// (OB_E2E_PORT/OB_E2E_CDP_PORT overrides; never 8000/8080). Every wait is
// a bounded poll under the global watchdog (anti-stall law).
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const BUNDLE_ID = 'org.openbilliards.app'; // ShellSeam.bundleID
const SCHEME = 'OpenBilliards';

// ---- args -------------------------------------------------------------------
const argOf = (flag) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const has = (flag) => process.argv.includes(flag);
const scenarioName = argOf('--scenario') ?? 'fullrack';
const scenarioFile = argOf('--scenario-file')
  ?? path.join(HERE, 'scenarios', `${scenarioName}.json`);
const AIRPLANE = has('--airplane');
const KEEP = has('--keep-artifacts');
const SHOT_DIR = process.env.OB_CHECKPOINT_SHOT_DIR ?? argOf('--shots-dir');

// ---- watchdog ---------------------------------------------------------------
const WATCHDOG_MS = Number(process.env.OB_E2E_WATCHDOG_MS ?? 900000);
let webServer = null;
let webClient = null;
let checkpointTimer = null;
setTimeout(() => {
  console.error(`[e2e-ios] WATCHDOG: run exceeded ${WATCHDOG_MS} ms — hard exit`);
  cleanup();
  process.exit(2);
}, WATCHDOG_MS).unref();

function cleanup() {
  try { clearInterval(checkpointTimer); } catch { /* not armed */ }
  try { webClient?.close(); } catch { /* already gone */ }
  try { webServer?.kill(); } catch { /* already gone */ }
}

// ---- scoring ----------------------------------------------------------------
let failures = 0;
const check = (name, ok, detail = '') => {
  if (ok) console.log('[e2e-ios] PASS', name);
  else {
    failures++;
    process.exitCode = 1;
    console.error('E2E-IOS FAIL:', name + (detail ? ' — ' + detail : ''));
  }
};

const run = (cmd, args, opts = {}) =>
  spawnSync(cmd, args, { encoding: 'utf8', ...opts });

// ---- environment preflight (recorded-blocked path, quickstart par.0) ---------
{
  const sim = run('xcrun', ['simctl', 'help']);
  if (sim.error || sim.status !== 0) {
    console.error('[e2e-ios] BLOCKED: no Simulator toolchain on this host '
      + '(xcrun simctl unavailable — Command Line Tools only).');
    console.error('[e2e-ios] Recorded execution gate (quickstart par.6): '
      + `node ios/tools/e2e-ios.mjs --scenario ${scenarioName}`);
    console.error('[e2e-ios] CI arm: T038 (.github/workflows/ios.yml '
      + 'simulator job, IOS_SIMULATOR_CI=enabled).');
    process.exit(3);
  }
}

// ---- scenario ---------------------------------------------------------------
if (!fs.existsSync(scenarioFile)) {
  console.error(`[e2e-ios] no scenario table at ${scenarioFile}`);
  process.exit(1);
}
const scenario = JSON.parse(fs.readFileSync(scenarioFile, 'utf8'));
const name = scenario.name ?? scenarioName;
if (AIRPLANE) {
  // SC-001 arm: the assert must run in-page BEFORE the driver terminates
  // the app — inject it as the final step of the last phase.
  const phases = scenario.phases ?? [];
  if (phases.length) {
    phases[phases.length - 1].steps = [
      ...(phases[phases.length - 1].steps ?? []),
      {
        kind: 'assertEval',
        name: 'SC-001 airplane arm: zero non-app:// requests for the session',
        js: "(() => { if (location.origin !== 'app://local') return false; "
          + "const bad = performance.getEntriesByType('resource')"
          + ".map((r) => r.name).filter((u) => !u.startsWith('app://local/'));"
          + ' return bad.length === 0; })()',
      },
    ];
  }
}

// ---- simulator --------------------------------------------------------------
function pickSimulator() {
  const want = argOf('--udid') ?? process.env.OB_IOS_UDID;
  const list = JSON.parse(run('xcrun',
    ['simctl', 'list', 'devices', '--json']).stdout);
  const all = Object.values(list.devices ?? {}).flat()
    .filter((d) => d.isAvailable);
  if (want) return all.find((d) => d.udid === want) ?? null;
  const booted = all.find((d) => d.state === 'Booted' && /iPhone/.test(d.name));
  if (booted) return booted;
  const wanted = argOf('--device') ?? process.env.OB_SIM_DEVICE ?? 'iPhone 16';
  return all.find((d) => d.name === wanted)
    ?? all.filter((d) => /iPhone/.test(d.name)).pop() ?? null;
}

const device = pickSimulator();
if (!device) {
  console.error('[e2e-ios] no available iPhone simulator (simctl list devices)');
  process.exit(3);
}
if (device.state !== 'Booted') {
  console.log(`[e2e-ios] booting ${device.name} (${device.udid})`);
  run('xcrun', ['simctl', 'boot', device.udid]);
  const bs = run('xcrun', ['simctl', 'bootstatus', device.udid, '-b'],
    { timeout: 180000 });
  if (bs.status !== 0) {
    console.error('[e2e-ios] simulator never reached booted state');
    process.exit(1);
  }
}
console.log(`[e2e-ios] simulator: ${device.name} (${device.udid})`);

// ---- app install + container ------------------------------------------------
const appPath = argOf('--app') ?? process.env.OB_APP_PATH;
if (appPath) {
  const inst = run('xcrun', ['simctl', 'install', device.udid, appPath]);
  check('DEBUG app installed', inst.status === 0, inst.stderr);
}
const cont = run('xcrun',
  ['simctl', 'get_app_container', device.udid, BUNDLE_ID, 'data']);
if (cont.status !== 0) {
  console.error(`[e2e-ios] app container unavailable for ${BUNDLE_ID} — `
    + 'install the DEBUG app first (T033 build, or pass --app <path.app>)');
  process.exit(1);
}
const container = cont.stdout.trim();
// Fixed HOST-side seam dir (reinstall-proof): xcodebuild
// test-without-building reinstalls the app and every install MOVES the
// data container, so a container-relative path goes stale before the app
// writes (T038 CI evidence: new container UUID per scenario, run
// 29135590139). Simulator processes share the host filesystem — the app
// (StatusSeam) and the UITest runner (StatusSeamClient) both take
// OB_SEAM_DIR from their environment and rendezvous here.
const e2eDir = process.env.OB_SEAM_DIR
  ?? path.join('/tmp', `ob-seam-${name}-${process.pid}`);
fs.rmSync(e2eDir, { recursive: true, force: true });
fs.mkdirSync(e2eDir, { recursive: true });
console.log(`[e2e-ios] container: ${container}`);
console.log(`[e2e-ios] seam dir (host rendezvous): ${e2eDir}`);

// GH-446(c): stamp the RUNNER CLASS into the seam mirror so flake triage
// can auto-bucket probe-timing reds by lane (hosted VMs storm; the
// self-hosted mac and local runs mostly don't). GITHUB_ACTIONS +
// RUNNER_ENVIRONMENT are the actions-runner contract ('github-hosted' |
// 'self-hosted'). Written before the driver spawns, so the stamp rides the
// /tmp/e2e-ios-<scenario> copy-out, the ios.yml red-path seam dump, and the
// ios-l3-evidence artifact like every other seam file.
const runnerClass = process.env.GITHUB_ACTIONS === 'true'
  ? (process.env.RUNNER_ENVIRONMENT === 'github-hosted' ? 'hosted' : 'self-hosted')
  : 'local';
fs.writeFileSync(path.join(e2eDir, 'runner-class.json'), JSON.stringify({
  runnerClass,
  runnerName: process.env.RUNNER_NAME ?? os.hostname(),
  image: process.env.ImageOS ?? null,
  scenario: name,
  stampedUTC: new Date().toISOString(),
}));
console.log(`[e2e-ios] runner class: ${runnerClass}`);

// ---- checkpoint ack hook (L4 rendezvous; test-pyramid par.4) ------------------
const checkpointsSeen = [];
checkpointTimer = setInterval(() => {
  let names;
  try { names = fs.readdirSync(e2eDir); } catch { return; }
  for (const f of names) {
    const m = /^checkpoint-(.+)\.json$/.exec(f);
    if (!m || m[1].endsWith('.ack')) continue;
    const ack = path.join(e2eDir, `checkpoint-${m[1]}.ack.json`);
    if (fs.existsSync(ack)) continue;
    if (SHOT_DIR) {
      fs.mkdirSync(SHOT_DIR, { recursive: true });
      const png = path.join(SHOT_DIR, `${name}-${m[1]}.png`);
      // Prefer the driver's XCUIScreen capture (written BEFORE the marker;
      // ~1 s at the checkpoint instant) — simctl io costs ~45 s per capture
      // on hosted runners and stalls the scenario clock (run 29145125984).
      const driverPng = path.join(e2eDir, `checkpoint-${m[1]}.png`);
      if (fs.existsSync(driverPng)) {
        fs.copyFileSync(driverPng, png);
        console.log(`[e2e-ios] checkpoint ${m[1]} -> ${png} (driver capture)`);
      } else {
        const shot = run('xcrun',
          ['simctl', 'io', device.udid, 'screenshot', png]);
        if (shot.status !== 0) console.error(`[e2e-ios] screenshot failed at checkpoint ${m[1]}`);
        else console.log(`[e2e-ios] checkpoint ${m[1]} -> ${png}`);
      }
    }
    checkpointsSeen.push(m[1]);
    fs.writeFileSync(ack, JSON.stringify({ ackedAt: Date.now() }));
  }
}, 150);

// ---- the driver run -----------------------------------------------------------
const { PAGE_HELPERS_JS } = await import(
  path.join(REPO, 'web', 'tools', 'touch-cdp.mjs'));

const derived = argOf('--derived-data') ?? process.env.OB_DERIVED_DATA
  ?? path.join(REPO, 'ios', 'DerivedData');
const xctestrun = process.env.OB_XCTESTRUN ?? (() => {
  const dir = path.join(derived, 'Build', 'Products');
  if (!fs.existsSync(dir)) return null;
  const runs = fs.readdirSync(dir).filter((f) => f.endsWith('.xctestrun'))
    .map((f) => path.join(dir, f))
    .sort((a, b) => fs.statSync(a).mtimeMs - fs.statSync(b).mtimeMs);
  return runs.pop() ?? null;
})();

const xcArgs = ['test-without-building'];
if (xctestrun) xcArgs.push('-xctestrun', xctestrun);
else {
  xcArgs.push('-project', path.join(REPO, 'ios', 'OpenBilliards.xcodeproj'),
    '-scheme', SCHEME, '-derivedDataPath', derived);
}
xcArgs.push('-destination', `platform=iOS Simulator,id=${device.udid}`,
  '-only-testing:AppUITests/GestureDriver/testScenario');

const launchStart = Date.now();
console.log(`[e2e-ios] xcodebuild ${xcArgs.join(' ')}`);
const driver = await new Promise((resolve) => {
  const p = spawn('xcodebuild', xcArgs, {
    env: {
      ...process.env,
      TEST_RUNNER_OB_SCENARIO: name,
      TEST_RUNNER_OB_SCENARIO_JSON: JSON.stringify(scenario),
      TEST_RUNNER_OB_CONTAINER: container,
      TEST_RUNNER_OB_SEAM_DIR: e2eDir,
      TEST_RUNNER_OB_PAGE_HELPERS:
        Buffer.from(PAGE_HELPERS_JS, 'utf8').toString('base64'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  p.stdout.on('data', (d) => { out += d; process.stdout.write(d); });
  p.stderr.on('data', (d) => { out += d; process.stderr.write(d); });
  p.on('close', (code) => resolve({ code, out }));
  p.on('error', (e) => resolve({ code: -1, out: String(e) }));
});
const driverWallS = (Date.now() - launchStart) / 1000;
check(`GestureDriver run green (scenario ${name})`, driver.code === 0,
  `xcodebuild exit ${driver.code}`);
console.log(`[e2e-ios] driver wall time ${driverWallS.toFixed(1)} s `
  + `(includes xcodebuild spin-up; SC-006 phase bounds live in the table)`);

// recorded-blocked transport rows are surfaced, never silent
const report = readSeamJSON('driver-report.json');
if (report?.unavailableTransportRows?.length) {
  console.log('[e2e-ios] recorded-blocked transport rows '
    + `(${report.unavailableTransportRows.length}; GestureDriver header law):`);
  for (const row of report.unavailableTransportRows) console.log('  -', row);
}

// ---- artifact helpers ---------------------------------------------------------
function readSeamJSON(nameIn) {
  try {
    return JSON.parse(fs.readFileSync(path.join(e2eDir, nameIn), 'utf8'));
  } catch { return null; }
}
function readSeamBytes(nameIn) {
  try { return fs.readFileSync(path.join(e2eDir, nameIn)); } catch { return null; }
}

// ---- web reference arm (recordByteCompare) ------------------------------------
// the two free-port scans below reach [8371, 8399] and [8381, 8399] — declared as dynamic window families and linted as bands (GH-725 review r6)
export const PORT_WINDOW_FAMILIES = [{ start: 8371, end: 8399 }, { start: 8381, end: 8399 }];
// one suite in two files: ios/tools/acceptance.mjs drives this suite on the same window (GH-725 review r9)
export const SHARED_DEFAULT_WINDOW = 'e2e-ios';
// GH-725 review r10 P2 (b) + r11 P2 (a): a pick never returns an endpoint this process HOLDS — a supplied pin of any role
// (the lib's env rule: OB_E2E_PORT / OB_E2E_CDP_PORT / OB_CDP_PORT are held before any scan) or an earlier pick (noted)
const { heldReason: iosHeldReason, noteHeld: iosNoteHeld } = await import(path.join(REPO, 'web', 'tools', 'lib', 'endpoint-pair.mjs'));
function pickFreePort(preferred) {
  for (let p = preferred; p < 8400; p++) {
    if (iosHeldReason(p) !== null) continue; // a supplied pin or an earlier pick
    const r = run('lsof', ['-i', `:${p}`]);
    if (r.status !== 0) { iosNoteHeld(p, 'picked by e2e-ios'); return p; } // lsof exits 1 when nothing listens
  }
  throw new Error(`no free port in ${preferred}-8399 (supplied pins are held: ${['OB_E2E_PORT', 'OB_E2E_CDP_PORT', 'OB_CDP_PORT'].filter((k) => process.env[k] !== undefined).map((k) => `${k}=${process.env[k]}`).join(',') || 'none'})`);
}

async function webReferenceRecord(assert) {
  const PORT = Number(process.env.OB_E2E_PORT ?? pickFreePort(8371));
  const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? pickFreePort(8381));
  const { launchChrome, sleep, assertDerivedEndpoint } = await import(
    path.join(REPO, 'web', 'tools', 'cdp.mjs'));
  // GH-725 review r9 P2-1: the picked / pinned endpoints are validated or refused by name before the server binds
  assertDerivedEndpoint(PORT, { tool: 'e2e-ios', role: 'http', expr: 'pickFreePort(8371)', window: PORT_WINDOW_FAMILIES[0], derived: process.env.OB_E2E_PORT === undefined });
  assertDerivedEndpoint(CDP_PORT, { tool: 'e2e-ios', role: 'cdp', base: PORT, expr: 'pickFreePort(8381)', window: PORT_WINDOW_FAMILIES[1], derived: process.env.OB_E2E_CDP_PORT === undefined });
  const webDir = path.join(REPO, 'web');
  // stderr piped, never 'ignore': a server that cannot bind must say WHY
  // (the GH-248 preflight message calls out exactly this silence).
  webServer = spawn('python3',
    ['-m', 'http.server', '-d', webDir, String(PORT)],
    { stdio: ['ignore', 'ignore', 'pipe'] });
  let serverErr = '';
  webServer.stderr.on('data', (d) => { serverErr += d; });
  let serverExit = null;
  webServer.on('exit', (code, sig) => { serverExit = `${code ?? sig}`; });
  // Bounded bind-wait BEFORE launchChrome (GH-270 second finding): hosted
  // runs are fresh VMs, so python3's FIRST launch pays the Gatekeeper/
  // XProtect scan every run — the pre-GH-248 flow hid that inside Chrome's
  // own cold start (plus the 90 s ready poll below), but the shared
  // harness's served-tree preflight now probes at +0.7 s and dies at its
  // 15 s budget ("the static server never bound :8371" — deterministic on
  // every hosted run since 60d06d14 while the same arm passes locally).
  // Same bounded-poll law as every other wait in this file; 120 s cap
  // sized like the 90 s ready bound below, for the same runner.
  const bindDeadline = Date.now() + 120000;
  let bound = false;
  while (!bound && Date.now() < bindDeadline && serverExit === null) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/app.html`,
        { signal: AbortSignal.timeout(2000) });
      bound = r.ok;
      if (!bound) break; // answering but not our tree: preflight diagnoses
    } catch { await sleep(500); /* not bound yet */ }
  }
  if (!bound && serverExit !== null) {
    throw new Error(`web reference server exited (${serverExit}) before `
      + `binding :${PORT} — stderr: ${serverErr.trim() || '(empty)'}`);
  }
  if (!bound && Date.now() >= bindDeadline) {
    throw new Error(`web reference server never answered :${PORT} within `
      + `120 s — stderr so far: ${serverErr.trim() || '(empty)'}`);
  }
  const q = scenario.web?.bootQuery ?? scenario.boot?.query ?? 'obtool&norec';
  const url = `http://127.0.0.1:${PORT}/app.html?${q}`;
  console.log(`[e2e-ios] web reference boot ${url} cdp=${CDP_PORT}`);
  webClient = await launchChrome(url, { port: CDP_PORT });
  const ev = (expr) => webClient.eval(expr);
  let ready = false;
  // 90 s bound: the reference boot shares the runner with the Simulator
  // (WebKit + xcodebuild residue) — the old 30 s budget expired on a
  // healthy but slow cold Chrome (T038 CI evidence: run 29137238254).
  for (let i = 0; i < 300 && !ready; i++) {
    ready = (await ev('window.__test?.ready === true').catch(() => false)) === true;
    if (!ready) await sleep(300);
  }
  if (!ready) {
    const diag = await ev(
      '(() => ({ href: location.href, ready: document.readyState, '
      + 'test: typeof window.__test, errs: window.__test?.errors ?? null }))()',
    ).catch((e) => `diag eval failed: ${e}`);
    throw new Error(
      `web reference boot never ready — ${JSON.stringify(diag)}`);
  }
  for (const phase of scenario.phases ?? []) {
    for (const js of phase.setup ?? []) { await ev(js); await sleep(250); }
    for (const step of phase.steps ?? []) {
      if (step.transport === 'unavailable') continue;
      switch (step.kind) {
        case 'eval': await ev(step.js); break;
        case 'assertEval': {
          const v = await ev(step.js);
          if (v !== true) throw new Error(`web arm assert failed: ${step.name ?? step.js}`);
          break;
        }
        case 'waitEval': {
          let ok = null;
          for (let i = 0; i < (step.tries ?? 40) && !ok; i++) {
            ok = await ev(step.js);
            if (!ok) await sleep(150);
          }
          if (!ok) throw new Error(`web arm wait never truthy: ${step.js}`);
          break;
        }
        case 'sleep': await sleep(step.ms ?? 500); break;
        case 'checkpoint': break; // L4 rendezvous is shell-side only
        default:
          throw new Error('recordByteCompare scenarios must stay gesture-free '
            + `for the web arm (saw step kind '${step.kind}')`);
      }
    }
  }
  const record = await ev(assert.recordJs);
  if (typeof record !== 'string') throw new Error('web arm record not a string');
  webClient.close(); webClient = null;
  webServer.kill(); webServer = null;
  return Buffer.from(record, 'utf8');
}

// ---- SC-005 comparator (hapticsLogCompare) -------------------------------------
// Model per haptics-bridge.md par.5 + the table notes: derived cues are
// JS-coalesced per class (50 ms window keyed on shot time), then the log
// must be an order-preserving 1:1 subsequence (class + clamped gain), with
// every skipped derived cue explicable by the TRANSPORT:
//   (a) page-side stale-skip — web/app/haptics.js posts cue c at the first
//       PLAYBACK frame t in [c.t - LOOKAHEAD 0.15, c.t + STALE 0.05]; when
//       no frame lands in that window (CI simulator hitch > ~0.2 s) the cue
//       never reaches the bridge at all;
//   (b) native rate bounds (minGap/globalMinGap) — applied by
//       HapticRateLimiter at ARRIVAL WALL time, so cues posted in the same
//       frame burst arrive ~simultaneously and all but the first drop even
//       when their SHOT-time spacing looks wide.
// Both effects are modeled on the MEASURED frame cadence when the scenario
// captured it (frames = [[wallMs, playbackClockS], ...] from the in-page
// rAF sampler); without frame data the old shot-time proxy remains as the
// fallback (016 L3 round 1; run-14 evidence: all 7 inexplicable drops were
// cadence-shaped, first at the t=0 cue strike before the first frame).
const HAPTICS_LOOKAHEAD_S = 0.15; // web/app/haptics.js LOOKAHEAD (mirrored)
const HAPTICS_STALE_S = 0.05;     // web/app/haptics.js STALE (mirrored)
const EPS_FRAME_S = 0.025;        // rAF sample vs frame-event skew (~1.5 frames)
// When `dropsAccounted` is true the native gate counters already reconcile
// every drop (validated - admitted = rate drops by construction; coalesced -
// validated = page-side stale-skips), so per-drop explanations are skipped —
// message-delivery wall times are unobservable from page-side data and the
// cadence estimate misclassifies same-frame bursts that the OS delivered
// spread out (016 L3 round 1b evidence: cushion t=0.1598 admitted in one
// run, rate-dropped in another, identical cadence).
function compareHaptics(logCues, derivedRaw,
  { coalesceMs, minGapMs, globalMinGapMs }, frames = null,
  dropsAccounted = false) {
  const EPS_T = 0.075; // coalesce window + timing jitter
  const EPS_GAIN = 1e-6;
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  // JS-side coalescing (haptics-bridge par.1/par.5): per class, one survivor
  // per window carrying the group max gain
  const coalesced = [];
  const windowStart = new Map();
  for (const c of derivedRaw) {
    const w = windowStart.get(c.type);
    if (w && (c.t - w.t) * 1000 < coalesceMs) {
      w.gain = Math.max(w.gain, clamp01(c.gain));
    } else {
      const survivor = { t: c.t, type: c.type, gain: clamp01(c.gain) };
      coalesced.push(survivor);
      windowStart.set(c.type, survivor);
    }
  }
  const useFrames = Array.isArray(frames) && frames.length >= 30;
  // First frame whose playback clock covers cue time t. pad > 0 shrinks the
  // window: "a frame DEFINITELY covered t" despite sampling skew (used to
  // rule stale-skip out); pad = 0 estimates the arrival wall time.
  const frameCovering = (t, pad = 0) => {
    for (const [wallMs, clockS] of frames) {
      if (clockS >= t - HAPTICS_LOOKAHEAD_S + pad
          && clockS <= t + HAPTICS_STALE_S - pad) return wallMs;
    }
    return null;
  };
  const arrivalMs = (d) =>
    (useFrames ? frameCovering(d.t) : null) ?? d.t * 1000;
  const problems = [];
  let di = 0;
  const lastAdmitByClass = new Map(); // class -> arrival ms
  let lastAdmitAny = -Infinity;
  // +18 ms slack: arrival estimates are frame-quantized, so an off-by-one
  // frame (16.7 ms) plus dispatch jitter must not flip explicability.
  const RATE_SLACK_MS = 18;
  const rateExplicable = (d) => {
    const a = arrivalMs(d);
    const lastCls = lastAdmitByClass.get(d.type) ?? -Infinity;
    return a - lastCls < minGapMs + RATE_SLACK_MS
      || a - lastAdmitAny < globalMinGapMs + RATE_SLACK_MS;
  };
  const dropExplicable = (d) =>
    (useFrames && frameCovering(d.t, EPS_FRAME_S) === null) // stale-skipped
    || rateExplicable(d);
  for (const [li, l] of logCues.entries()) {
    let matched = false;
    while (di < coalesced.length) {
      const d = coalesced[di];
      di++;
      if (d.type === l.type && Math.abs(d.gain - clamp01(l.gain)) <= EPS_GAIN
          && (l.t == null || Math.abs(d.t - l.t) <= EPS_T)) {
        const a = arrivalMs(d);
        lastAdmitByClass.set(d.type, a);
        lastAdmitAny = a;
        matched = true;
        break;
      }
      // a derived cue the shell never logged: must be a transport casualty
      if (!dropsAccounted && !dropExplicable(d)) {
        problems.push(`derived cue dropped without a transport reason: `
          + `${d.type} gain=${d.gain} t=${d.t}`);
      }
    }
    if (!matched) {
      problems.push(`logged cue #${li} has no derivation match: `
        + JSON.stringify(l));
    }
  }
  for (; di < coalesced.length; di++) {
    const d = coalesced[di];
    if (!dropsAccounted && !dropExplicable(d)) {
      problems.push(`trailing derived cue never logged and not `
        + `transport-explicable: ${d.type} gain=${d.gain} t=${d.t}`);
    }
  }
  return { problems, coalescedCount: coalesced.length, usedFrames: useFrames };
}

// ---- post-run asserts -----------------------------------------------------------
for (const assert of scenario.asserts ?? []) {
  switch (assert.kind) {
    case 'zeroNonAppRequests':
      if (AIRPLANE) {
        console.log('[e2e-ios] SC-001 arm asserted in-page '
          + '(injected final step; see driver output)');
      } else {
        console.log('[e2e-ios] note: SC-001 arm dormant (run with --airplane)');
      }
      break;
    case 'recordByteCompare': {
      const shell = readSeamBytes(assert.artifact);
      check(`shell record artifact present (${assert.artifact})`, !!shell);
      if (!shell) break;
      try {
        const web = await webReferenceRecord(assert);
        check('SC-003 determinism: shell record bytes == web-surface record bytes',
          Buffer.compare(shell, web) === 0,
          `shell ${shell.length} B vs web ${web.length} B`);
      } catch (e) {
        check('SC-003 web reference arm ran', false, e.message);
      }
      break;
    }
    case 'hapticsLogCompare': {
      const log = readSeamJSON(assert.log);
      const derivedRaw = readSeamJSON(assert.derived);
      check(`haptics log present (${assert.log})`, Array.isArray(log),
        'StatusSeam (T025) mirrors the post-rate-bound cue log');
      check(`derivation present (${assert.derived})`, Array.isArray(derivedRaw));
      if (!Array.isArray(log) || !Array.isArray(derivedRaw)) break;
      check('derivation non-empty for a break shot', derivedRaw.length > 0);
      check('haptics log non-empty (bridge live end-to-end)', log.length > 0);
      // Native gate counters (StatusSeam haptics-stats.json): the primary
      // reconciliation arm — validated - admitted IS the rate-drop count
      // (the limiter is the only gate between the counters), so per-drop
      // wall-time modeling is unnecessary when they are present.
      const stats = readSeamJSON(assert.stats ?? 'haptics-stats.json');
      const haveStats = !!stats && Number.isInteger(stats.validated)
        && Number.isInteger(stats.droppedDecode)
        && Number.isInteger(stats.admitted);
      check('haptics gate counters mirrored (haptics-stats.json)', haveStats,
        'StatusSeam mirrors {validated, droppedDecode, admitted}');
      // measured frame cadence (see compareHaptics header): diagnostic +
      // fallback drop model; loud when the table names a frames artifact
      // but the sampler produced none
      let frames = null;
      if (assert.frames) {
        frames = readSeamJSON(assert.frames);
        check(`frame clock captured (${assert.frames})`,
          Array.isArray(frames) && frames.length >= 30,
          'in-page rAF sampler thin/missing — drop explicability degrades '
          + 'to the shot-time proxy');
      }
      const { problems, coalescedCount, usedFrames } = compareHaptics(
        log, derivedRaw, {
          coalesceMs: assert.coalesceMs ?? 50,
          minGapMs: assert.minGapMs ?? 40,
          globalMinGapMs: assert.globalMinGapMs ?? 16,
        }, frames, haveStats);
      if (haveStats) {
        check('SC-005 wire shape: zero decode drops at the native gate',
          stats.droppedDecode === 0, `droppedDecode=${stats.droppedDecode}`);
        check(`SC-005 log completeness: admitted (${stats.admitted}) == `
          + `logged (${log.length})`, stats.admitted === log.length);
        check(`SC-005 volume: validated (${stats.validated}) within `
          + `[admitted, coalesced (${coalescedCount})]`,
        stats.validated >= stats.admitted
          && stats.validated <= coalescedCount);
        console.log(`[e2e-ios] SC-005 reconciliation: coalesced `
          + `${coalescedCount} = validated ${stats.validated} + `
          + `${coalescedCount - stats.validated} page-side stale-skips; `
          + `validated = admitted ${stats.admitted} + `
          + `${stats.validated - stats.admitted} rate-bound drops`);
      }
      check(`SC-005 in-shell: log (${log.length}) matches deriveCues `
        + `(${derivedRaw.length} raw / ${coalescedCount} coalesced) `
        + `1:1 order-preserving${haveStats ? ' (drops counter-reconciled)'
          : ` under the transport model (${usedFrames
            ? `measured cadence, ${frames.length} frames`
            : 'shot-time proxy'})`}`,
      problems.length === 0, problems.slice(0, 5).join(' | '));
      break;
    }
    case 'resumeClamp': {
      const probe = readSeamJSON(assert.artifact);
      check(`resume probe present (${assert.artifact})`, !!probe);
      if (!probe) break;
      check('SC-006 resume: page actually suspended '
        + `(max rAF gap ${probe.maxGapMs?.toFixed?.(0)} ms >= ${assert.minGapMs})`,
      probe.maxGapMs >= (assert.minGapMs ?? 1500));
      check(`SC-006 resume: first post-resume dt ${probe.dtAppliedS} s <= ${assert.maxDtS}`,
        probe.dtAppliedS <= (assert.maxDtS ?? 0.1));
      break;
    }
    case 'capabilitiesReport': {
      // Issue #51 QA matrix: print the measured WKWebView capability table
      // and hold the honesty laws the fixes ship on. Simulator WebKit may
      // diverge from device WebKit for media (hardware encoders,
      // MediaRecorder codec sets) — treat this as the simulator column;
      // the on-device column rides the runbook §6 recipe.
      const cap = readSeamJSON(assert.artifact ?? 'capabilities.json');
      check('capability matrix artifact present + probe completed',
        !!cap && cap.probed === true);
      if (!cap) break;
      console.log('[e2e-ios] WKWebView capability matrix (SIMULATOR column '
        + '— device WebKit may differ for media):');
      for (const line of [
        `origin=${cap.origin} secureContext=${cap.secureContext}`,
        `MediaRecorder=${cap.mediaRecorder} negotiated=${cap.record?.mime} `
          + `ext=${cap.record?.ext}`,
        `isTypeSupported=${JSON.stringify(cap.mimes)}`,
        `captureStream=${cap.captureStream} canvasPixelsLit=`
          + `${cap.canvasPixels?.lit}/${cap.canvasPixels?.sampled}`,
        `WebCodecs=${JSON.stringify(cap.webcodecs)}`,
        `exportSupport=${JSON.stringify(cap.exportSupport)} `
          + `exportTiers=${JSON.stringify(cap.exportTiers)}`,
        `transcodeProbe=${JSON.stringify(cap.transcodeProbe)}`, // #157 decode legs
        `navigator.share=${cap.share} canShare=${cap.canShare} `
          + `clipboard=${cap.clipboard}`,
        `bridges=${JSON.stringify(cap.bridges)}`,
        `liveRecord=${JSON.stringify(cap.liveRecord)} `
          + `shareExercised=${cap.shareExercised} shareBytes=${cap.shareBytes}`,
        `photosTarget=${cap.photosTarget} transcode=${JSON.stringify(cap.transcode)}`,
        `sheetRows=${JSON.stringify(cap.sheetRows)}`,
      ]) console.log('  ' + line);
      // Law 1 (working, not just present): when the record button ships
      // (__record.supported), a live capture must produce REAL bytes —
      // the e2e-record.mjs floor guards against WebKit's black-frame
      // captureStream soft spot masquerading as a working recorder.
      if (cap.liveRecord?.exercised === true) {
        check('capabilities: live capture produced real bytes (> 100 KB '
          + `for ~4 s; got ${cap.liveRecord.bytes})`,
        cap.liveRecord.bytes > 100_000);
        check('capabilities: WebGL canvas renders live pixels '
          + `(${cap.canvasPixels?.lit}/${cap.canvasPixels?.sampled} lit via `
          + `${cap.canvasPixels?.via})`,
        (cap.canvasPixels?.lit ?? 0) > (cap.canvasPixels?.sampled ?? 4096) * 0.05);
      } else {
        console.log('[e2e-ios] live-record arm skipped '
          + '(MediaRecorder negotiated no mime) — Record ships NO button '
          + 'in this WebKit, by design');
      }
      // Law 2 (honest sheet): the Re-rack row always ships. GH-225 Phase D
      // (2026-07-27) retired the Export + Record rows outright — the sheet
      // contract is now ['ob-share', 'rerack'] — so the issue-#51 "Export
      // row ships iff a capture path exists" honesty law is SUPERSEDED by a
      // stricter one: those rows must be ABSENT no matter what the capture
      // matrix says. Retargeted rather than deleted, so a resurrected ghost
      // fails here too (the web-side negative-arm law, applied on device).
      check('capabilities: touch sheet carries the Re-rack row',
        Array.isArray(cap.sheetRows) && cap.sheetRows.includes('hud.rerack'),
        JSON.stringify(cap.sheetRows));
      const probesConclusive = typeof cap.record === 'object'
        && typeof cap.exportSupport === 'object';
      // a capture path is a PROBED offline tier (mp4/webm), not the bare
      // webcodecs interface triple (all-probes-false is a dead dialog —
      // review F4, mirrors export.js's noneAvailable computation)
      const capturePath = cap.record?.supported === true
        || cap.exportSupport?.mp4 === true
        || cap.exportSupport?.webm === true;
      // The retired rows are absent UNCONDITIONALLY (GH-225 Phase D) — no
      // longer keyed on the capture matrix, which is why this arm no longer
      // branches on probesConclusive. The matrix is still PRINTED above and
      // reported below, because it is the input to the phone-coverage
      // residue the wave recorded (a WebCodecs-less phone has no video path
      // once the Export row and the phone export dialog are gone).
      check('capabilities: the retired Export + Record rows are ABSENT '
        + `(Phase D; capturePath=${capturePath}, probes `
        + `${probesConclusive ? 'conclusive' : 'inconclusive'})`,
      Array.isArray(cap.sheetRows)
        && !cap.sheetRows.includes('export.button')
        && !cap.sheetRows.includes('record.button'),
      JSON.stringify(cap.sheetRows));
      // exactly two rows, Share + Re-rack — the e2e-settings "actionsRows
      // pinned to EXACTLY 2" law applied on device, so a resurrected ghost
      // row fails here instead of passing. Membership, not index order:
      // the ORDER contract is gated web-side (e2e-touch S13 / touch-cdp
      // drawerRows), and this arm must never fail for a reason the device
      // cannot explain.
      check('capabilities: the touch sheet carries exactly the Share + '
        + 'Re-rack rows',
      Array.isArray(cap.sheetRows) && cap.sheetRows.length === 2
        && cap.sheetRows.includes('share.button')
        && cap.sheetRows.includes('hud.rerack'),
      JSON.stringify(cap.sheetRows));
      if (!probesConclusive) {
        // a THROWN probe records a string, not a verdict — log it, never
        // let it silently disappear from the acceptance record
        console.log('[e2e-ios] capability probes inconclusive: '
          + JSON.stringify({ record: cap.record,
            exportSupport: cap.exportSupport }));
      }
      // Law 4, RETARGETED by GH-251: record.js's transcode tier + obPhotos
      // leg are DELETED — the DVR save card owns webm→Photos (GH-252
      // probed transcode + the obSaveVideo wire; e2e-playback arms
      // 4f2/14a gate it). A record-control stop now routes the share
      // ladder for EVERY container, so the honest host-side assertion is
      // exactly that; the decode-probe matrix (cap.transcodeProbe, kept
      // seam member) remains the committed capability evidence.
      if (cap.photosExercised === true) {
        check('capabilities: post-GH-251 routing — every stop(true) lands '
          + `on the share ladder (target=${cap.photosTarget})`,
        cap.photosTarget === 'share',
        JSON.stringify({ target: cap.photosTarget, ext: cap.record?.ext,
          transcode: cap.transcode }));
      }
      // Law 3 (bridge handoff end-to-end): when the share arm ran and the
      // obShare bridge exists, the native side must have decoded the file
      // (StatusSeam share-log.json mirror).
      if (cap.shareExercised === true && cap.bridges?.obShare === true) {
        const shareLog = readSeamJSON(assert.shareLog ?? 'share-log.json');
        check('capabilities: obShare handoff decoded natively '
          + `(share-log.json; got ${JSON.stringify(shareLog)?.slice(0, 200)})`,
        Array.isArray(shareLog) && shareLog.length >= 1
          && shareLog[0].bytes > 0);
        // presented stage (review F6): decode-only is not end-to-end —
        // where the scenario actually presents the sheet
        // (assert.requirePresented), the seam entry must carry
        // presented:true (flipped by ShareController only AFTER
        // presenter.present ran).
        if (assert.requirePresented === true) {
          check('capabilities: obShare handoff PRESENTED the share sheet '
            + '(share-log.json presented stage)',
          Array.isArray(shareLog)
            && shareLog.some((e) => e.presented === true),
          JSON.stringify(shareLog)?.slice(0, 200));
        }
      } else {
        console.log('[e2e-ios] obShare handoff arm skipped '
          + `(shareExercised=${cap.shareExercised}, `
          + `bridge=${cap.bridges?.obShare})`);
      }
      break;
    }
    case 'perfRecord': {
      const perf = readSeamJSON(assert.artifact);
      check(`perf probe present (${assert.artifact})`, !!perf);
      if (!perf) break;
      console.log('[e2e-ios] SC-009 rows for the app-perf record:');
      console.log(`  simulator: ${device.name}`);
      if (perf.nav) {
        console.log(`  cold-launch (page-side nav entry): DCL `
          + `${perf.nav.domContentLoadedMs?.toFixed?.(0)} ms, load `
          + `${perf.nav.loadEventEndMs?.toFixed?.(0)} ms`);
      }
      if (perf.raf) {
        console.log(`  rAF cadence (n=${perf.raf.n}): p50 `
          + `${perf.raf.p50Ms?.toFixed?.(1)} ms, p95 ${perf.raf.p95Ms?.toFixed?.(1)} ms, `
          + `p99 ${perf.raf.p99Ms?.toFixed?.(1)} ms, max ${perf.raf.maxMs?.toFixed?.(1)} ms`);
      }
      console.log(`  driver wall (incl. xcodebuild spin-up): ${driverWallS.toFixed(1)} s`);
      break;
    }
    default:
      check(`known assert kind '${assert.kind}'`, false);
  }
}

// ---- artifact copy-out ----------------------------------------------------------
const outDir = `/tmp/e2e-ios-${name}`;
try {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.cpSync(e2eDir, outDir, { recursive: true });
  console.log(`[e2e-ios] artifacts: ${outDir}`);
} catch { /* container may be gone */ }
if (!KEEP) fs.rmSync(e2eDir, { recursive: true, force: true });

cleanup();
console.log(failures
  ? `[e2e-ios] FAIL (${failures} failing assertions)`
  : `[e2e-ios] ALL PASS (${name}${AIRPLANE ? ', airplane' : ''}; `
    + `checkpoints: ${checkpointsSeen.join(', ') || 'none'})`);
process.exit(failures ? 1 : 0);
