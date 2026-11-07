// Copyright (c) Meta Platforms, Inc. and affiliates.

// acceptance.mjs — feature-016 L4 screenshot-acceptance driver (T026;
// contracts/test-pyramid.md par.4, research R15, FR-014).
//
//   node ios/tools/acceptance.mjs [--flow <name>] [--out <dir>]
//                                 [--udid <udid>] [--app <path.app>]
//
// EXECUTION [BLOCKED: local Xcode install]; CI arm T038. The judging agent
// is environment-pluggable (see JUDGE below); without one the run exits 3
// recorded-blocked — never a silent pass (FR-014's "written, versioned
// criteria" are judged, not skipped).
//
// Flows (test-pyramid par.4): cold-launch, break, aimed-shot-spin-power,
// pocket-call, background-resume. Each flow walks the T024 machinery
// (node ios/tools/e2e-ios.mjs) with OB_CHECKPOINT_SHOT_DIR set: the
// GestureDriver checkpoint rendezvous blocks until this side has taken
// `xcrun simctl io <udid> screenshot` and acked — so every capture lands
// at the exact scenario step the expectations name. Three flows ride the
// fullrack scenario's checkpoints (ONE simulator run covers break /
// aimed-shot-spin-power / pocket-call); background-resume rides the
// lifecycle scenario; cold-launch is a dedicated UNSTAMPED boot (R6: the
// real-user look, no scripted pin).
//
// Verdicts: each screenshot is judged against
// ios/tools/acceptance/expectations/<flow>.md by the judging agent named
// in OB_JUDGE_CMD — spawned as `$OB_JUDGE_CMD <screenshot.png>
// <expectations.md> <checkpoint>` and expected to print a single JSON
// object {"verdict": "pass"|"fail", "notes": "..."} on stdout (research
// R15: a screenshot-judging agent over written criteria; the repo
// acceptance culture). A run FAILS on any `fail` verdict or any
// expectation checkpoint lacking a screenshot.
//
// Run record (data-model.md par.6 archive shape): for each flow,
// <out>/<runId>/<flow>/run.json {flow, checkpoints: [{name, screenshot,
// expectation, verdict, notes}], simulator, appVersion, date} + the PNGs +
// expectations-version.json (sha256 per expectations file + git rev) at
// the run root. Default out root: OUT_ROOT below (the repo's ios-acceptance archive).
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const EXPECT_DIR = path.join(HERE, 'acceptance', 'expectations');

// ---- args / env ---------------------------------------------------------------
const argOf = (flag) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const ONLY = argOf('--flow');
// GH-725 review r9 P2-2: this driver passes BOTH pins to e2e-ios explicitly — the lane's assigned pins, else a free
// pair picked HERE from e2e-ios's own window (one suite in two files: SHARED_DEFAULT_WINDOW 'e2e-ios'); the child
// never picks for itself under a driver. The picked pair is validated or refused by name (cdp.mjs).
export const SHARED_DEFAULT_WINDOW = 'e2e-ios';
export const PORT_WINDOW_FAMILIES = [{ start: 8371, end: 8399 }, { start: 8381, end: 8399 }];
// GH-725 review r10 P2 (b) + r11 P2 (a): a pick never returns an endpoint this process HOLDS — a supplied pin of any
// role (OB_E2E_PORT / OB_E2E_CDP_PORT / OB_CDP_PORT are held by the lib's env rule before any scan) or an earlier pick
// (noted held); a supplied OB_E2E_PORT=8381 with no cdp pin used to make the cdp scan land on 8381 and exit 2
const { heldReason, noteHeld } = await import(path.join(HERE, '..', '..', 'web', 'tools', 'lib', 'endpoint-pair.mjs'));
function pickFreePort(preferred) {
  for (let p = preferred; p < 8400; p++) {
    if (heldReason(p) !== null) continue; // a supplied pin or an earlier pick
    const r = spawnSync('lsof', ['-i', `:${p}`], { encoding: 'utf8' });
    if (r.status !== 0) { noteHeld(p, 'picked by acceptance'); return p; } // lsof exits 1 when nothing listens
  }
  throw new Error(`no free port in ${preferred}-8399 (held: ${[...heldReason ? [] : []]}${['OB_E2E_PORT', 'OB_E2E_CDP_PORT', 'OB_CDP_PORT'].filter((k) => process.env[k] !== undefined).map((k) => `${k}=${process.env[k]}`).join(',') || 'none'})`);
}
const PORT = Number(process.env.OB_E2E_PORT ?? pickFreePort(8371));
const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? pickFreePort(8381));
{
  // r11 P2 (b): every role validated as ONE set — the dry path (--print-endpoints) certifies nothing before it passes
  const { assertEndpoints } = await import(path.join(HERE, '..', '..', 'web', 'tools', 'cdp.mjs'));
  const httpFrom = 'OB_E2E_PORT' in process.env ? 'OB_E2E_PORT' : 'pickFreePort(8371)'; // labels only: the reads above decide
  const debugFrom = 'OB_E2E_CDP_PORT' in process.env ? 'OB_E2E_CDP_PORT' : 'pickFreePort(8381)'; // (named without 'cdp': a label, not a port binding, to the lint's name gate)
  assertEndpoints('acceptance', {
    http: { value: PORT, expr: httpFrom, window: PORT_WINDOW_FAMILIES[0], derived: process.env.OB_E2E_PORT === undefined, pin: 'OB_E2E_PORT' },
    cdp: { value: CDP_PORT, base: PORT, expr: debugFrom, window: PORT_WINDOW_FAMILIES[1], derived: process.env.OB_E2E_CDP_PORT === undefined, pin: 'OB_E2E_CDP_PORT' },
  });
  console.log(`[acceptance] endpoints: http ${PORT} (${httpFrom}) cdp ${CDP_PORT} (${debugFrom})`);
  if (process.argv.includes('--print-endpoints')) process.exit(0); // resolve + validate + print, walk nothing (the battery's dry probe)
}
const OUT_ROOT = argOf('--out')
  ?? path.join(REPO, 'docs', 'verification', 'ios-acceptance');
const JUDGE = process.env.OB_JUDGE_CMD;

// ---- watchdog -------------------------------------------------------------------
const WATCHDOG_MS = Number(process.env.OB_E2E_WATCHDOG_MS ?? 1800000);
setTimeout(() => {
  console.error(`[acceptance] WATCHDOG: run exceeded ${WATCHDOG_MS} ms — hard exit`);
  process.exit(2);
}, WATCHDOG_MS).unref();

// ---- flow table (test-pyramid par.4 flows -> scenarios/checkpoints) --------------
// cold-launch is a dedicated inline scenario: UNSTAMPED real-user boot
// (boot.query null -> no -OBBootQuery; shell-app.md par.1 / research R6),
// asserting the 'tournament' look before the interactive capture.
const COLD_LAUNCH_SCENARIO = {
  v: 1,
  name: 'cold-launch',
  notes: ['016 T026 inline flow scenario: unstamped real-user boot (R6).'],
  boot: { query: null, ephemeralStore: true, statusSeam: true },
  phases: [{
    name: 'cold-launch',
    steps: [
      { kind: 'waitEval', js: 'window.__test?.ready === true', tries: 60 },
      { kind: 'assertEval',
        name: 'real-user boot look unstamped (R6: tournament, never the scripted green pin)',
        js: "window.__test.bootLook === 'tournament'" },
      { kind: 'sleep', ms: 1500 },
      { kind: 'checkpoint', name: 'interactive' },
    ],
  }],
};

const FLOWS = [
  { flow: 'cold-launch', scenario: 'cold-launch', inline: COLD_LAUNCH_SCENARIO,
    checkpoints: ['interactive'] },
  { flow: 'break', scenario: 'fullrack',
    checkpoints: ['break-aimed', 'break-settled'] },
  { flow: 'aimed-shot-spin-power', scenario: 'fullrack',
    checkpoints: ['pot-aimed', 'pot-settled'] },
  { flow: 'pocket-call', scenario: 'fullrack',
    checkpoints: ['call-composed'] },
  { flow: 'background-resume', scenario: 'lifecycle',
    checkpoints: ['pre-background', 'post-resume', 'recovered'] },
];

const flows = ONLY ? FLOWS.filter((f) => f.flow === ONLY) : FLOWS;
if (!flows.length) {
  console.error(`[acceptance] no flow named '${ONLY}'`);
  process.exit(1);
}

// ---- environment gates (recorded-blocked, never silent) --------------------------
for (const f of flows) {
  const exp = path.join(EXPECT_DIR, `${f.flow}.md`);
  if (!fs.existsSync(exp)) {
    console.error(`[acceptance] missing expectations file: ${exp}`);
    process.exit(1);
  }
}
if (!JUDGE) {
  console.error('[acceptance] BLOCKED: no judging agent configured '
    + '(set OB_JUDGE_CMD to a command printing {"verdict","notes"} JSON '
    + 'for <screenshot.png> <expectations.md> <checkpoint> — research R15).');
  console.error('[acceptance] Recorded execution gate (quickstart par.6): '
    + 'node ios/tools/acceptance.mjs');
  process.exit(3);
}

// ---- run id + capture dir ---------------------------------------------------------
const runId = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  + '-' + Math.random().toString(36).slice(2, 6);
const runDir = path.join(OUT_ROOT, runId);
const shotDir = path.join(os.tmpdir(), `ob-acceptance-${runId}`);
fs.mkdirSync(shotDir, { recursive: true });

// ---- scoring ----------------------------------------------------------------------
let failures = 0;
const check = (name, ok, detail = '') => {
  if (ok) console.log('[acceptance] PASS', name);
  else {
    failures++;
    process.exitCode = 1;
    console.error('ACCEPTANCE FAIL:', name + (detail ? ' — ' + detail : ''));
  }
};

// ---- 1. walk the scenarios via the T024 machinery ----------------------------------
const passthrough = [];
for (const flag of ['--udid', '--app', '--device', '--derived-data']) {
  const v = argOf(flag);
  if (v) passthrough.push(flag, v);
}

const scenarioRuns = new Map(); // scenario -> exit code
for (const f of flows) {
  if (scenarioRuns.has(f.scenario)) continue;
  const args = [path.join(HERE, 'e2e-ios.mjs')];
  if (f.inline) {
    const tmp = path.join(shotDir, `${f.scenario}.scenario.json`);
    fs.writeFileSync(tmp, JSON.stringify(f.inline, null, 2));
    args.push('--scenario', f.scenario, '--scenario-file', tmp);
  } else {
    args.push('--scenario', f.scenario);
  }
  args.push(...passthrough);
  console.log(`[acceptance] walking scenario '${f.scenario}' via T024: node ${args.join(' ')}`);
  const code = await new Promise((resolve) => {
    const p = spawn('node', args, {
      env: { ...process.env, OB_CHECKPOINT_SHOT_DIR: shotDir, OB_E2E_PORT: String(PORT), OB_E2E_CDP_PORT: String(CDP_PORT) }, // both pins (GH-725 review r9)
      stdio: 'inherit',
    });
    p.on('close', resolve);
    p.on('error', () => resolve(-1));
  });
  scenarioRuns.set(f.scenario, code);
  if (code === 3) {
    console.error('[acceptance] BLOCKED by the L3 environment gate (see above)');
    process.exit(3);
  }
  check(`scenario '${f.scenario}' walked green (checkpoint captures are `
    + 'still judged either way)', code === 0, `e2e-ios exit ${code}`);
}

// ---- 2. judge every checkpoint against the written expectations --------------------
function judge(png, expectationFile, checkpoint) {
  const r = spawnSync(JUDGE, [png, expectationFile, checkpoint],
    { encoding: 'utf8', shell: true, timeout: 300000 });
  if (r.status !== 0) {
    return { verdict: 'fail', notes: `judge exited ${r.status}: ${r.stderr}` };
  }
  try {
    const m = r.stdout.match(/\{[\s\S]*\}/);
    const v = JSON.parse(m ? m[0] : r.stdout);
    if (v.verdict !== 'pass' && v.verdict !== 'fail') throw new Error('bad verdict');
    return { verdict: v.verdict, notes: String(v.notes ?? '') };
  } catch (e) {
    return { verdict: 'fail', notes: `unparseable judge output (${e.message}): ${r.stdout.slice(0, 300)}` };
  }
}

const simName = (() => {
  const r = spawnSync('xcrun', ['simctl', 'list', 'devices', '--json'],
    { encoding: 'utf8' });
  try {
    const all = Object.values(JSON.parse(r.stdout).devices).flat();
    return all.find((d) => d.state === 'Booted')?.name ?? 'unknown';
  } catch { return 'unknown'; }
})();
const appVersion = (() => {
  try {
    const y = fs.readFileSync(path.join(REPO, 'ios', 'project.yml'), 'utf8');
    return /MARKETING_VERSION:\s*"?([\d.]+)"?/.exec(y)?.[1] ?? 'unknown';
  } catch { return 'unknown'; }
})();

fs.mkdirSync(runDir, { recursive: true });
const expectationsVersion = { gitRev: null, files: {} };
{
  const rev = spawnSync('git', ['-C', REPO, 'rev-parse', 'HEAD'],
    { encoding: 'utf8' });
  expectationsVersion.gitRev = rev.status === 0 ? rev.stdout.trim() : 'unknown';
}

for (const f of flows) {
  const expectationFile = path.join(EXPECT_DIR, `${f.flow}.md`);
  const expText = fs.readFileSync(expectationFile);
  expectationsVersion.files[`${f.flow}.md`] =
    createHash('sha256').update(expText).digest('hex');
  const flowDir = path.join(runDir, f.flow);
  fs.mkdirSync(flowDir, { recursive: true });
  const checkpoints = [];
  for (const cp of f.checkpoints) {
    const src = path.join(shotDir, `${f.scenario}-${cp}.png`);
    const rel = `${f.scenario}-${cp}.png`;
    if (!fs.existsSync(src)) {
      // FR-014: an expectation lacking a screenshot FAILS the run
      checkpoints.push({ name: cp, screenshot: null,
        expectation: `expectations/${f.flow}.md`,
        verdict: 'fail', notes: 'no screenshot captured at this checkpoint' });
      check(`[${f.flow}] checkpoint '${cp}' captured`, false, src);
      continue;
    }
    fs.copyFileSync(src, path.join(flowDir, rel));
    const { verdict, notes } = judge(src, expectationFile, cp);
    checkpoints.push({ name: cp, screenshot: rel,
      expectation: `expectations/${f.flow}.md`, verdict, notes });
    check(`[${f.flow}] checkpoint '${cp}' judged pass`, verdict === 'pass', notes);
  }
  const record = {
    flow: f.flow,
    checkpoints,
    simulator: simName,
    appVersion,
    date: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(flowDir, 'run.json'),
    JSON.stringify(record, null, 2));
}
fs.writeFileSync(path.join(runDir, 'expectations-version.json'),
  JSON.stringify(expectationsVersion, null, 2));

console.log(`[acceptance] run record: ${runDir}`);
console.log(failures
  ? `[acceptance] FAIL (${failures} failing checks)`
  : '[acceptance] ALL PASS');
process.exit(failures ? 1 : 0);
