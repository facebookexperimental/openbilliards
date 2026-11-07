// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-retry.mjs — BOUNDED one-retry runner for flake-prone browser gates
// (GH-559). The old ci.yml shape `node suite || node suite` retried on ANY
// red, so a genuine intermittent regression was indistinguishable from
// harness flake and a retried-green run was silent in the job log. This
// wrapper keeps exactly one retry but only for failures the suite owner has
// EXPLICITLY tagged as known-flake, and it always says what it did:
//
//   node web/tools/e2e-retry.mjs --allow FD [--allow 'C: one exact line'] \
//        -- node web/tools/e2e-atelier.mjs
//
// Every attempt is first CLASSIFIED from its own log (issue #816) as
//   JUDGED-PASS / JUDGED-FAIL — the suite printed ITS completion verdict
//                 line (recognizer bound to this invocation's suite token,
//                 see completionRe below), or
//   DIED         — no completion line: the suite stopped before its verdict
// and one line per attempt names the class and the FAIL rows it carried:
//   E2E-RETRY: attempt <n> <JUDGED-PASS|JUDGED-FAIL|DIED> rows=<k>
//
// Policy, in order:
//   1. first run exit 0 → final rc 0 (no retry);
//   2. first run JUDGED-FAIL with >= 1 `E2E-<SUITE> FAIL: <arm>: ...` row
//      and EVERY failing row allowed — an --allow entry without a colon
//      names a whole arm tag, one WITH a colon is a message prefix
//      (a single assertion) → ONE retry, loudly
//      bannered; the retry's exit code is final and a retried-green names
//      the first run's failures in the log (never a silent green);
//   3. first run JUDGED-FAIL with any row OUTSIDE the allow list (including
//      a FAIL row whose arm tag cannot be parsed, and the empty allowlist
//      ci.yml gives play / practice / replays) → final red, no retry, with
//      the JUDGED message — a real intermittent regression must not be
//      absorbed, and a judged red is never reported as a death;
//   4. first run DIED with NO FAIL rows at all (harness crash before any
//      assertion — the #170 cold-start class, "chrome debugger endpoint
//      never came up") → ONE retry, bannered. A reproducible crash is
//      still red on the retry; an assertion-level red is never reclassified
//      by this arm because case 3 already claimed it;
//   5. first run DIED after FAIL rows → the DIED message, final red (or the
//      infra retry of case 4 when every row seen was allowlisted).
//
//   --intersect (issue #806; the e2e-shell gate): the old `A || A` exit
//   semantics, classified. ANY red first run retries once (after the GH-926
//   budget check); the job is red iff both passes are red, as before, and
//   the log says why: each pass's row SET (a row = the text before the first
//   ':' of its FAIL line; a death, or a red with no FAIL row, is a named
//   pseudo-row), their intersection, then ONE verdict line — 'E2E-<SUITE>
//   RED: <rows>' when a row failed in both passes, 'E2E-<SUITE> FLAKE: <row>
//   (attempt 1), <row> (attempt 2)' when none did (still exit 1: disjoint
//   reds are how a load-dependent real defect looks, and a retry idiom must
//   not hide flake) — and one 'E2E-RETRY: SUMMARY {json}' line for tools
//   (verdict, rows per pass, intersection). The summary is wrapper
//   vocabulary, so it carries the 'E2E-RETRY:' prefix run-gate's countArms
//   excludes (its JSON quotes 'JUDGED-PASS'); the verdict line quotes FAIL
//   row labels only. It takes no --allow list.
//
// Arm tags are matched on the leading word of the FAIL message ('FD: ...'
// → FD; 'W(tablet): ...' → W), the same grammar the suites' fail() calls
// already use. Exit codes and FAIL lines pass through untouched — this
// wrapper only decides whether a second attempt is allowed to exist, and
// its own exit status is SET ONCE, by the final verdict at the bottom.
//
//   node web/tools/e2e-retry.mjs --selftest
// classifies the fixture logs under web/tools/fixtures/e2e-retry/ (one per
// real CI specimen, positive and negative controls), runs the GH-926 retry
// budget rows B1-B6 against this file, and exits 1 on the first mismatch,
// naming the case.
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import { psEnv, readServerMarkers, staticServerPythonPath } from './cdp.mjs';

/** After a SIGKILL escalation the suite cannot run its own teardown — its
 * DETACHED python http.server group (spawnStaticServer, detached: true)
 * survives holding the port and its band lease, poisoning the retry and
 * the next fixed-port CI job (GH-557 review r8 P2). The GH-294 sidecar
 * markers (/tmp/obw-e2e-server-<pid>.json, written at spawn with the
 * spawning harnessPid) attribute every such server with certainty: reap
 * exactly the groups whose marker names the dead suite, ps-verified as
 * still an http.server on the recorded port — never anything broader. */
/** Snapshot the live descendant tree of `pid` BEFORE it is SIGKILLed —
 * ancestry captured pre-kill is the only reliable identity for the shell
 * build's Chrome helpers (no --user-data-dir on their command lines; the
 * cdp.mjs GH-294 lesson). Sync pgrep walk + one ps row per pid. */
function snapshotDescendants(pid) {
  const kidsOf = (p) => {
    try {
      return execFileSync('pgrep', ['-P', String(p)], { encoding: 'utf8' })
        .split('\n').filter(Boolean).map(Number);
    } catch { return []; }
  };
  const pids = [];
  for (let frontier = kidsOf(pid), depth = 0;
    frontier.length && depth < 5; depth++) {
    pids.push(...frontier);
    frontier = frontier.flatMap(kidsOf);
  }
  const rows = [];
  for (const p of pids) {
    try {
      const cmd = execFileSync('ps', ['-o', 'command=', '-p', String(p)],
        { encoding: 'utf8' }).trim();
      if (cmd) rows.push({ pid: p, cmd });
    } catch { /* exited between walk and read */ }
  }
  return rows;
}

/** After the SIGKILL, terminate the captured descendants that survive
 * (GH-557 review r10 P1): the suite's cdp.mjs exit handlers never ran, so
 * its Chrome (CDP port + profile + band lease) reparents and lives on.
 * Identity discipline (the never-broad-kill-Chrome law): only pids from
 * the PRE-KILL ancestry snapshot, each revalidated to carry the SAME
 * command line, and only harness-shaped commands (the e2e profile marker,
 * a chrome-headless-shell binary, or an http.server). */
function reapChildDescendants(kin) {
  for (const r of kin ?? []) {
    let cmd = '';
    try {
      cmd = execFileSync('ps', ['-o', 'command=', '-p', String(r.pid)],
        { encoding: 'utf8' }).trim();
    } catch { continue; } // already gone
    if (cmd !== r.cmd) continue; // pid recycled: never signal it
    const harnessShaped = cmd.includes('/tmp/obw-e2e-profile-')
      || cmd.includes('chrome-headless-shell') || cmd.includes('http.server');
    if (!harnessShaped) continue;
    try {
      process.kill(r.pid, 'SIGKILL');
      console.error(`e2e-retry: reaped the killed suite's surviving `
        + `descendant pid ${r.pid} (${cmd.slice(0, 60)}…) — GH-557 review r10.`);
    } catch { /* raced its exit */ }
  }
}

/** The marker's LEADER is gone: sweep its group's identity-verified http.server
 * members one by one (review GH-562 r2); the marker falls only if all are confirmed. */
function sweepLeaderlessGroup(m) {
  // the LEADER (python wrapper) is gone but its socket-holding
  // grandchild can survive in the same process GROUP (pgid = leader
  // pid) — review GH-562 r2: skipping here left that server holding
  // OB_E2E_PORT. Sweep the group's identity-verified http.server
  // members individually; the marker falls only if all are confirmed.
  let members = [];
  try {
    members = execFileSync('pgrep', ['-g', String(m.pid)],
      { encoding: 'utf8' }).split('\n').filter(Boolean).map(Number);
  } catch { return; } // group empty too: sweep prunes the marker
  let allGone = true;
  for (const p of members) {
    let mc = '';
    try {
      mc = execFileSync('ps', ['-o', 'command=', '-p', String(p)],
        { encoding: 'utf8' });
    } catch { continue; }
    if (!mc.includes('http.server') || !mc.includes(` ${m.port}`)
      || (m.webDir && !mc.includes(String(m.webDir)))) continue;
    try { process.kill(p, 'SIGKILL'); } catch { continue; }
    let g = false;
    for (let i = 0; i < REAP_CONFIRM_TRIES && !g; i++) {
      try { process.kill(p, 0); } catch (e) { g = e.code === 'ESRCH'; continue; }
      try { execFileSync('sleep', [String(REAP_CONFIRM_SLEEP_MS / 1000)]); } catch { break; }
    }
    if (g) {
      console.error(`e2e-retry: reaped the dead leader's surviving `
        + `http.server member pid ${p} (:${m.port}) — GH-562 review r2.`);
    } else allGone = false;
  }
  if (allGone) {
    try { fs.rmSync(m.file, { force: true }); } catch { /* sweep */ }
  }
}

function reapChildServers(suitePid) {
  if (!Number.isInteger(suitePid)) return;
  // the marker family is reached through cdp.mjs's helper (issue #664 c):
  // the sidecars are a deliberately shared cross-process directory, and the
  // hygiene arm-8e string-form scan vouches for the family only by name —
  // this file spells no /tmp path of its own (hygiene arm 8f pins that).
  for (const m of readServerMarkers()) {
    if (m.harnessPid !== suitePid || !Number.isInteger(m.pid)) continue;
    // FULL identity validation before any signal (review r12 P2, the cdp.mjs
    // sweep discipline): the live row must be an http.server on the
    // recorded port AND docroot, and — when the marker recorded a birth
    // time — the pid's lstart must match, so a recycled pid can never be
    // signalled off a stale marker.
    let row = '';
    try {
      // GH-1143: the command in the caller's locale (a UTF-8 docroot prints as itself);
      // the birth token below is read apart, in C — the marker's form
      row = execFileSync('ps', ['-o', 'command=', '-p', String(m.pid)],
        { encoding: 'utf8' }).replace(/\n$/, '');
    } catch {
      sweepLeaderlessGroup(m);
      continue;
    }
    let lstart = '';
    if (m.lstart) {
      try {
        lstart = execFileSync('ps', ['-o', 'lstart=', '-p', String(m.pid)],
          { encoding: 'utf8', env: psEnv() }).trim();
      } catch {
        // the leader exited between the two reads: its group is swept as above;
        // a ps failure on a live leader is no verdict (the next sweep judges it)
        let leaderGone = false;
        try { process.kill(m.pid, 0); } catch (e) { leaderGone = e.code === 'ESRCH'; }
        if (leaderGone) sweepLeaderlessGroup(m);
        continue;
      }
    }
    const cmd = row;
    if (!cmd.includes('http.server') || !cmd.includes(` ${m.port}`)
      || (m.webDir && !cmd.includes(String(m.webDir)))
      || (m.lstart && lstart !== String(m.lstart).trim())) continue;
    try {
      process.kill(-m.pid, 'SIGKILL'); // the spawn's own process group
    } catch { /* raced its exit */ }
    // the marker is removed only on CONFIRMED exit (review r11 P2: a
    // lingering socket-holder must stay discoverable by the GH-294 sweep,
    // never be unmarked while alive). kill(pid, 0) throwing ESRCH is the
    // authoritative gone; bounded poll, else the marker stays.
    let gone = false;
    for (let i = 0; i < REAP_CONFIRM_TRIES && !gone; i++) {
      try { process.kill(m.pid, 0); } catch (e) {
        gone = e.code === 'ESRCH';
        continue;
      }
      try { execFileSync('sleep', [String(REAP_CONFIRM_SLEEP_MS / 1000)]); } catch { break; /* no verdict */ }
    }
    if (gone) {
      console.error(`e2e-retry: reaped the killed suite's surviving `
        + `http.server group (pid ${m.pid}, :${m.port}) — GH-557 review r8.`);
      try { fs.rmSync(m.file, { force: true }); } catch { /* sweep prunes */ }
    } else {
      console.error(`e2e-retry: http.server pid ${m.pid} (:${m.port}) not `
        + 'confirmed exited — its GH-294 marker is retained for the sweep.');
    }
  }
}

// The wrapper's teardown bounds, named once (GH-926: the retry budget sums
// them; the values are the literals these sites always carried):
//   REAP_CONFIRM_*   reapChildServers' bounded exit-confirm poll per pid
//   PORT_FREE_*      awaitPortFree before the retry: the budget, the poll
//                    gap, and the one probe that may overrun the budget
//   SIGKILL_ESCALATION_MS  the signal path's SIGTERM -> SIGKILL grace
const REAP_CONFIRM_TRIES = 8;
const REAP_CONFIRM_SLEEP_MS = 100;
const PORT_FREE_BUDGET_MS = 5000;
const PORT_FREE_POLL_MS = 250;
const PORT_FREE_PROBE_MS = 500;
const SIGKILL_ESCALATION_MS = 5000;

// signal forwarding (GH-557 review r1 P1): under the CI chain
// run-gate -> e2e-retry -> suite, a cancellation/timeout signals THIS
// wrapper — without forwarding, the suite (and its Chrome/static-server
// lineage) survived while run-gate released the port-band claim, leaving
// orphaned endpoints for the next job to collide with. The signal is
// forwarded to the active child (whose own cdp.mjs reapers then clean its
// browser/server lineage), escalated to SIGKILL after 5 s, and the
// wrapper exits with the conventional 128+N once the child closes —
// never retrying a signalled run.
let activeChild = null;
let lastChildPid = null; // survives close: the exit-path reap identity
let termSignal = null;
const SIG_EXIT = { SIGTERM: 143, SIGINT: 130, SIGHUP: 129 };
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
  process.on(sig, () => {
    termSignal = sig;
    if (activeChild && activeChild.exitCode === null
      && activeChild.signalCode === null) {
      try { activeChild.kill(sig); } catch { /* raced its exit */ }
      const t = setTimeout(() => {
        // capture the suite's descendant tree BEFORE the SIGKILL (review
        // r10 P1: post-kill, its Chrome reparents and ancestry is gone)
        const kin = lastChildPid ? snapshotDescendants(lastChildPid) : [];
        try { activeChild.kill('SIGKILL'); } catch { /* gone */ }
        // a SIGKILLed suite never ran its teardown: reap its detached
        // marker-attributed servers AND its captured Chrome descendants
        // SYNCHRONOUSLY (review r9 P1: a deferred timer was cancelled by
        // the termSignal exit racing it)
        if (lastChildPid) reapChildServers(lastChildPid);
        reapChildDescendants(kin);
      }, SIGKILL_ESCALATION_MS);
      t.unref();
    } else {
      process.exit(SIG_EXIT[sig]);
    }
  });
}

const argv = process.argv.slice(2);
const allow = new Set();
let cmd = null;
let suiteArg = null; // --suite TOKEN: only for a command whose suite cannot be derived
let selftest = false;
let intersect = false; // --intersect: issue #806 (see the header)
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--allow') { allow.add(argv[++i]); continue; }
  if (argv[i] === '--intersect') { intersect = true; continue; }
  if (argv[i] === '--suite') { suiteArg = argv[++i]; continue; }
  if (argv[i] === '--selftest') { selftest = true; continue; }
  if (argv[i] === '--') { cmd = argv.slice(i + 1); break; }
  console.error(`e2e-retry: unknown argument '${argv[i]}' (before --)`);
  process.exit(2);
}
if (!selftest && (!cmd || cmd.length === 0)) {
  console.error('usage: node web/tools/e2e-retry.mjs [--allow TAG]... [--suite TOKEN] -- <command...>'
    + '\n       node web/tools/e2e-retry.mjs --intersect [--suite TOKEN] -- <command...>'
    + '\n       node web/tools/e2e-retry.mjs --selftest');
  process.exit(2);
}
if (intersect && allow.size) {
  console.error('e2e-retry: --intersect retries ANY red once and classifies the two passes by their row sets — '
    + 'it takes no --allow list');
  process.exit(2);
}

const FAIL_RE = /^E2E-[A-Z0-9-]+ FAIL: (.*)$/;
// arm tag = the leading word of the message up to ':' — 'B', 'FD',
// 'W(tablet)' → 'W'. null = unparseable (never allowlisted).
const armTag = (msg) => /^([A-Za-z0-9]+)[^:]*:/.exec(msg)?.[1] ?? null;
// an allow entry WITH a colon is a full MESSAGE PREFIX (one specific
// assertion — e.g. the load-coupled float-budget line inside an arm whose
// other assertions must stay unretryable); without one it names a whole
// arm tag. Measured need: the C/H 'select→float-visible over budget'
// choreography probes red only under foreign box load (GH-559 data +
// two battery runs 2026-08-27), while the rest of C/H must stay hard.
const allowed = (msg) => {
  for (const a of allow) {
    if (a.includes(':') ? msg.startsWith(a) : armTag(msg) === a) return true;
  }
  return false;
};

// crash-class retry gate (GH-557 review r3 P2): a no-FAIL-line nonzero exit
// is retryable ONLY on a recognized INFRASTRUCTURE signature — an
// unstructured application exception (a rejected c.eval on a missing seam,
// a suite throw) must stay red, or an intermittent real regression could
// vanish on the second run. The signatures are the harness's own recorded
// infra classes, matched against the run's captured output:
//   #170  cold start        'chrome debugger endpoint never came up'
//   GH-248 CDP wedge        'Chrome is stalled, not slow'
//   GH-410 starved host     'I/O-STARVED host'
//   GH-557 lost bind        '[static-server] FATAL (GH-557)'
const INFRA_RE = /chrome debugger endpoint never came up|Chrome is stalled, not slow|I\/O-STARVED host|\[static-server\] FATAL \(GH-557\)/;

// ---- retry budget (GH-926) ---------------------------------------------------
// The allowlist alone decided the retry, with no clock: a 30-min atelier
// attempt 1 red on row C was retried with 24:38 of the 55-min job cap left,
// the runner cancelled the retry mid-suite, and its Chrome outlived the job
// on the band. A retry now also needs the CAP to hold it: remaining =
// cap - (now - T0) must cover attempt 1's own wall (a retry runs the same
// suite at the same pace) plus the wrapper's named teardown bounds above.
// cap = the job's own timeout-minutes in ci.yml (the one source, read
// relative to this file like the --selftest scan), job = GITHUB_JOB;
// T0 = OB_JOB_T0_S, the epoch-seconds stamp each wrapped job writes as its
// first step. Any missing input leaves the GH-559 decision as it was.
const RETRY_TEARDOWN_MS = REAP_CONFIRM_TRIES * REAP_CONFIRM_SLEEP_MS
  + PORT_FREE_BUDGET_MS + PORT_FREE_POLL_MS + PORT_FREE_PROBE_MS
  + SIGKILL_ESCALATION_MS;
// The runner's "Set up job" runs before the first step, i.e. before OB_JOB_T0_S exists, and the job's timeout clock
// already counts it: ~17 min on the self-hosted runner under sustained host load (measured on PR #1069's run of record).
// The caps carry a +35 min setup allowance for the whole per-job overhead (see ci.yml, SELF-HOSTED SETUP ALLOWANCE); the
// checkout and later steps run after the stamp and are already in (now - T0), so only the pre-stamp share is reserved
// here, rounded up so the retry budget never starts an attempt the runner will cancel.
const SETUP_BEFORE_T0_S = 18 * 60;
const CI_YML_URL = new URL('../../.github/workflows/ci.yml', import.meta.url);
/** The job-level timeout-minutes of `job` under ci.yml's `jobs:` map; null
 * when the job or its timeout is absent (step-level timeouts sit deeper and
 * never count). Throws when ci.yml is unreadable. */
function jobCapMinutes(job) {
  const lines = fs.readFileSync(CI_YML_URL, 'utf8').split('\n');
  const jobs = lines.indexOf('jobs:');
  if (jobs < 0) return null;
  const start = lines.findIndex((l, i) => i > jobs && new RegExp(`^  ${job.replace(/[^\w-]/g, '\\$&')}:\\s*(#.*)?$`).test(l));
  if (start < 0) return null;
  for (let i = start + 1; i < lines.length && !/^ {0,2}[^\s#]/.test(lines[i]); i++) {
    const m = /^ {4}timeout-minutes:\s*(\d+)\s*(#.*)?$/.exec(lines[i]);
    if (m) return Number(m[1]);
  }
  return null;
}
/** Budget verdict for a retry of an attempt that took `attemptMs`:
 * { known: false, why } when an input is missing, else { known: true,
 * ok, attemptS, remainingS, capMin }. */
function retryBudget(attemptMs, env = process.env) {
  const stamp = env.OB_JOB_T0_S;
  const nowS = Date.now() / 1000;
  if (stamp === undefined || stamp === '') return { known: false, why: 'OB_JOB_T0_S unset' };
  if (!/^\d+$/.test(stamp) || Number(stamp) > nowS) {
    return { known: false, why: `OB_JOB_T0_S invalid: '${stamp.slice(0, 40)}'` };
  }
  const job = env.GITHUB_JOB;
  if (!job) return { known: false, why: 'GITHUB_JOB unset' };
  let capMin;
  try { capMin = jobCapMinutes(job); } catch (e) {
    return { known: false, why: `ci.yml unreadable: ${e.code ?? e.message}` };
  }
  if (capMin === null) return { known: false, why: `no timeout-minutes for job ${job}` };
  const remainingS = capMin * 60 - (nowS - Number(stamp)) - SETUP_BEFORE_T0_S;
  const needS = (attemptMs + RETRY_TEARDOWN_MS) / 1000;
  return { known: true, ok: remainingS >= needS, attemptS: attemptMs / 1000, remainingS, capMin };
}

// ---- completion-verdict recognizer (issue #816) ------------------------------
// The five suites ci.yml wraps do NOT share one completion grammar; measured
// on their own CI logs (runs 35066679268 green; 34880425359 / 34828419540 /
// 34780986545 / 35067397851 red) (export-z2: the #864 local band-9490 runs;
// export-z2.provenance.txt):
//   e2e-atelier   'E2E-ATELIER: PASS'            'E2E-ATELIER: FAILED'
//   e2e-play      'E2E-PLAY PASS'                'E2E-PLAY: FAIL'
//   e2e-practice  'E2E-PRACTICE PASS (37 arms)'  'E2E-PRACTICE FAIL'
//   e2e-replays   'E2E-REPLAYS: PASS'            'E2E-REPLAYS: FAIL (1 failure(s))'
//   e2e-export-z2 'E2E-EXPORT-Z2 PASS (…)'     'E2E-EXPORT-Z2 FAIL (N failure(s))'
// and, measured on their CI job logs for #806 (settings / switch / ui .provenance.txt):
//   e2e-settings  'E2E-SETTINGS: PASS'           'E2E-SETTINGS: FAILED'
//   e2e-switch    'E2E-SWITCH PASS (44 arms)'    'E2E-SWITCH FAIL (1 failure(s))'
//   e2e-ui        'E2E-UI PASS'                  'E2E-UI: FAILED'
// The former /^E2E-[A-Z0-9-]+: (PASS|FAILED)\s*$/m accepted only atelier's
// pair, so every JUDGED red of play / practice / replays was routed to the
// "DIED before its completion verdict" message. The grammar accepted here:
//   ^E2E-<SUITE>:? (PASS|FAIL|FAILED)( (…))?$      — one line, anchored
// BOUND to this invocation's suite token: 'E2E-REPLAYS: PASS' never
// completes an e2e-play run, nor does a sibling leg's 'E2E-PLAY-BROWSE'
// tag. It stays collision-proof against the per-arm rows the whole tree
// prints ('E2E-<TAG> FAIL: <message>' — 71 files): a row puts a colon
// AFTER the verb, which the grammar never admits (only a parenthetical may
// follow the verb), so the first failing arm can never score as completion
// (the GH-559 hazard the old anchored form guarded against). The suites'
// own lines are untouched: run-gate's countArms harvests the arm count
// from 'E2E-PRACTICE PASS (N arms)' (the GH-347 anti-shrinkage guard).
const SUITE_TOKEN_RE = /^[A-Z0-9-]+$/;
function completionRe(suite) {
  if (!SUITE_TOKEN_RE.test(suite)) throw new Error(`e2e-retry: bad suite token '${suite}'`);
  return new RegExp(`^E2E-${suite}:? (PASS|FAIL|FAILED)( \\(.*\\))?\\s*$`, 'm');
}
/** The suite token of a wrapped command: the LAST `e2e-<name>.mjs` script
 * on the line, uppercased — run-gate's own suite-derivation rule
 * (lib/ci-bands.mjs WRAPPER_FILES), so the wrapper and the ledger agree on
 * which suite a run line is about. null when no such script is present. */
function suiteTokenOf(command) {
  let tok = null;
  for (const a of command ?? []) {
    const m = /(?:^|\/)e2e-([a-z0-9-]+)\.mjs$/.exec(a);
    if (m && m[1] !== 'retry') tok = m[1].toUpperCase();
  }
  return tok;
}
/** Classify one attempt's captured output: JUDGED-PASS / JUDGED-FAIL when
 * the suite's own completion line is present, DIED otherwise; `fails` are
 * the per-arm FAIL rows (unchanged grammar), `line` the completion line. */
function classifyOutput(out, suite) {
  const fails = out.split('\n').map((l) => FAIL_RE.exec(l)?.[1]).filter(Boolean);
  const m = completionRe(suite).exec(out);
  if (!m) return { cls: 'DIED', verdict: null, line: null, fails };
  const verdict = m[1] === 'PASS' ? 'PASS' : 'FAIL';
  return { cls: verdict === 'PASS' ? 'JUDGED-PASS' : 'JUDGED-FAIL', verdict, line: m[0].trim(), fails };
}
/** --intersect (#806): a row is the text before the first ':' of its FAIL
 * line; a pass that died, or went red with no FAIL row, contributes a named
 * pseudo-row, so a red pass never reads as an empty set. */
const rowLabel = (msg) => { const i = msg.indexOf(':'); return (i < 0 ? msg : msg.slice(0, i)).trim(); };
function rowSet(a) {
  const s = [...new Set(a.fails.map(rowLabel))];
  if (a.cls === 'DIED') s.push('DIED');
  else if (a.code !== 0 && !s.length) s.push(`${a.cls} without a FAIL row`);
  return s;
}
function intersectSummary(verdict, passes, both, rc) {
  console.error(`E2E-RETRY: SUMMARY ${JSON.stringify({ suite: SUITE, mode: 'intersect', verdict, rc,
    passes: passes.map((a) => ({ cls: a.cls, rc: a.code, rows: rowSet(a) })), intersection: both })}`);
}
function intersectVerdict(first, second) {
  const s1 = rowSet(first), s2 = rowSet(second);
  const both = s1.filter((r) => s2.includes(r));
  console.error(`E2E-RETRY: pass 1 ${first.cls} row set [${s1.join(' | ')}]`);
  console.error(`E2E-RETRY: pass 2 ${second.cls} row set [${s2.join(' | ')}]`);
  console.error(`E2E-RETRY: intersection [${both.join(' | ')}]`);
  if (second.code === 0) {
    intersectSummary('RETRIED-GREEN', [first, second], both, 0);
    return { rc: 0, msg: `E2E-RETRY: RETRIED-GREEN — the first run's failures were: ${
      first.fails.length ? first.fails.join(' | ') : `(none: ${first.cls})`}. This green consumed the one retry (--intersect, #806).` };
  }
  const rc = second.code || 1;
  if (both.length) {
    intersectSummary('RED', [first, second], both, rc);
    return { rc, msg: `E2E-${SUITE} RED: ${both.join(' | ')}` };
  }
  intersectSummary('FLAKE', [first, second], both, rc);
  return { rc, msg: `E2E-${SUITE} FLAKE: ${[...s1.map((r) => `${r} (attempt 1)`), ...s2.map((r) => `${r} (attempt 2)`)].join(', ')}` };
}
/** ONE line per attempt, fixed shape, so the attempt split is visible in
 * the job log; the FAIL rows follow by name. */
function reportAttempt(n, a) {
  console.error(`E2E-RETRY: attempt ${n} ${a.cls} rows=${a.fails.length}`
    + (a.line ? ` (completion line: ${a.line})` : ' (no completion line)'));
  a.fails.forEach((f, i) => console.error(`E2E-RETRY:   row ${i + 1}: ${f.slice(0, 200)}`));
}

// ---- --selftest: the classifier over the fixture logs ------------------------
// One fixture per real specimen shape (positive AND negative controls);
// the expected class and row count per fixture live HERE so a fixture can
// never vouch for itself. Exits 1 on the first mismatch, naming the case.
const SELFTEST_CASES = [
  // #806: e2e-settings, e2e-switch (e2e-switch-paths runs the same suite) and the plain e2e-ui step, both verdict shapes, verbatim from CI job logs (<suite>.provenance.txt)
  { file: 'settings-pass.log', suite: 'SETTINGS', cls: 'JUDGED-PASS', rows: 0 }, // main push 38352665680 job 115148362591
  { file: 'settings-fail.log', suite: 'SETTINGS', cls: 'JUDGED-FAIL', rows: 2 }, // run 38067188187 job 114391334876, pass 2
  { file: 'switch-pass.log', suite: 'SWITCH', cls: 'JUDGED-PASS', rows: 0 }, // main push 38352665680 job 115148362421
  { file: 'switch-fail.log', suite: 'SWITCH', cls: 'JUDGED-FAIL', rows: 1 }, // run 38216036242 job 114700878147, pass 2 (a caught driver error)
  { file: 'ui-pass.log', suite: 'UI', cls: 'JUDGED-PASS', rows: 0 }, // main push 38352665680 job 115148362807
  { file: 'ui-fail.log', suite: 'UI', cls: 'JUDGED-FAIL', rows: 1 }, // main push 35020105012 job 104553359400, pass 2
  // #1180: e2e-pbcoarse (the e2e-ui-audit job's third step), both verdict shapes, verbatim from local runs of that step's
  // command (pbcoarse.provenance.txt: no CI job log yet)
  { file: 'pbcoarse-pass.log', suite: 'PBCOARSE', cls: 'JUDGED-PASS', rows: 0 }, // the review-delta tip, tree 2622ca8e
  { file: 'pbcoarse-fail.log', suite: 'PBCOARSE', cls: 'JUDGED-FAIL', rows: 3 }, // f75a24d3 under the delta's suite, tree 3474cb42
  // the five wrapped suites, both verdict shapes, verbatim from their logs (export-z2: the #864 local band-9490 runs; provenance in export-z2.provenance.txt)
  { file: 'atelier-pass.log', suite: 'ATELIER', cls: 'JUDGED-PASS', rows: 0 },
  { file: 'atelier-fail.log', suite: 'ATELIER', cls: 'JUDGED-FAIL', rows: 1 },
  { file: 'play-pass.log', suite: 'PLAY', cls: 'JUDGED-PASS', rows: 0 },
  { file: 'play-fail.log', suite: 'PLAY', cls: 'JUDGED-FAIL', rows: 2 }, // run 34828419540 job 103925787414
  { file: 'practice-pass.log', suite: 'PRACTICE', cls: 'JUDGED-PASS', rows: 0 },
  { file: 'practice-fail.log', suite: 'PRACTICE', cls: 'JUDGED-FAIL', rows: 1 }, // run 34780986545 job 103818823615
  { file: 'replays-pass.log', suite: 'REPLAYS', cls: 'JUDGED-PASS', rows: 0 },
  { file: 'replays-fail.log', suite: 'REPLAYS', cls: 'JUDGED-FAIL', rows: 1 }, // runs 34880425359 / 35067397851
  { file: 'export-z2-pass.log', suite: 'EXPORT-Z2', cls: 'JUDGED-PASS', rows: 0 }, // #864 local run run-20260926T112500Z (the C7 head record run)
  { file: 'export-z2-fail.log', suite: 'EXPORT-Z2', cls: 'JUDGED-FAIL', rows: 10 }, // #864 local run run-20260926T153500Z (the C8 before arm: base playback.js under the C7 harness)
  { file: 'shell-pass.log', suite: 'SHELL', cls: 'JUDGED-PASS', rows: 0 }, // run 36090769095 job 107952338252, pass 2 (shell.provenance.txt)
  { file: 'shell-fail.log', suite: 'SHELL', cls: 'JUDGED-FAIL', rows: 4 }, // main push 38352665680 job 115148362681, pass 2
  // deaths: FAIL rows then a throw, no completion line
  { file: 'died-mid-suite.log', suite: 'REPLAYS', cls: 'DIED', rows: 2 },
  // an infra death before any assertion (the #170 class): DIED, zero rows
  { file: 'died-infra.log', suite: 'PLAY', cls: 'DIED', rows: 0, infra: true },
  // NEGATIVE controls: none of these lines is a completion verdict
  { file: 'per-arm-row-only.log', suite: 'PLAY', cls: 'DIED', rows: 1 },
  { file: 'foreign-suite.log', suite: 'PLAY', cls: 'DIED', rows: 0 },
  { file: 'sibling-leg-tag.log', suite: 'PLAY', cls: 'DIED', rows: 1 },
  { file: 'unanchored-mentions.log', suite: 'REPLAYS', cls: 'DIED', rows: 0 },
];
if (selftest) {
  const dir = new URL('./fixtures/e2e-retry/', import.meta.url);
  const rows = [];
  // showOnPass: a timing case prints its detail on a pass too (GH-926 B6).
  const check = (name, ok, detail, showOnPass = false) => { rows.push({ name, ok, detail, showOnPass }); };
  for (const c of SELFTEST_CASES) {
    let text = null;
    try { text = fs.readFileSync(new URL(c.file, dir), 'utf8'); } catch { /* named below */ }
    if (text === null) { check(c.file, false, 'fixture missing'); continue; }
    const got = classifyOutput(text, c.suite);
    check(`${c.file} [${c.suite}] class`, got.cls === c.cls, `want ${c.cls} got ${got.cls}`);
    check(`${c.file} [${c.suite}] rows`, got.fails.length === c.rows, `want ${c.rows} got ${got.fails.length}`);
    check(`${c.file} [${c.suite}] infra signature`, INFRA_RE.test(text) === Boolean(c.infra),
      `want ${Boolean(c.infra)} got ${INFRA_RE.test(text)}`);
  }
  // the old COMPLETED_RE semantics are gone: the exact specimen lines
  check('play judged line accepted', completionRe('PLAY').test('E2E-PLAY: FAIL'), 'E2E-PLAY: FAIL');
  check('practice judged line accepted', completionRe('PRACTICE').test('E2E-PRACTICE FAIL'), 'E2E-PRACTICE FAIL');
  check('replays judged line accepted', completionRe('REPLAYS').test('E2E-REPLAYS: FAIL (1 failure(s))'), 'nested parens');
  check('export-z2 judged line accepted', completionRe('EXPORT-Z2').test('E2E-EXPORT-Z2 FAIL (10 failure(s))'), 'hyphenated suite, nested parens');
  check('export-z2 leg row never completes', !completionRe('EXPORT-Z2').test('E2E-EXPORT-Z2 FAIL: DVR864 L6a FAIL: L6a pin endT'), 'colon after verb');
  check('per-arm row never completes', !completionRe('PLAY').test('E2E-PLAY FAIL: P1: the mount never settled'), 'colon after verb');
  check('per-arm row with parenthetical never completes', !completionRe('PLAY').test('E2E-PLAY FAIL: (P1) never settled'), '');
  check('foreign suite never completes', !completionRe('PLAY').test('E2E-REPLAYS: PASS'), '');
  check('sibling leg tag never completes', !completionRe('PLAY').test('E2E-PLAY-BROWSE: PASS'), '');
  check('unanchored mention never completes', !completionRe('PLAY').test('note: E2E-PLAY: FAIL seen earlier'), '');
  check('bad suite token refused', (() => { try { completionRe('PLAY; x'); return false; } catch { return true; } })(), '');
  // suite-token derivation = run-gate's rule (last e2e-*.mjs on the line)
  check('token: plain run line', suiteTokenOf(['node', 'web/tools/e2e-play.mjs']) === 'PLAY', '');
  check('token: with flags after', suiteTokenOf(['node', 'web/tools/e2e-practice.mjs', '--band', '1']) === 'PRACTICE', '');
  check('token: none derivable', suiteTokenOf(['node', 'tools/other.mjs']) === null, '');
  check('token: hyphenated suite', suiteTokenOf(['node', 'web/tools/e2e-export-z2.mjs']) === 'EXPORT-Z2', '');
  // every suite ci.yml wraps under this file must have BOTH fixture shapes
  // here — a suite entering scope later fails this until its lines are
  // recorded (the "every wrapped suite" rule of issue #816)
  try {
    const ci = fs.readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8')
      .split('\n').filter((l) => !/^\s*#/.test(l)).join('\n');
    // scope the scan to ONE `run:` block at a time: a wrapped suite is the
    // LAST e2e-<name>.mjs that follows the ` -- ` separator inside a block
    // that invokes e2e-retry.mjs — never a mention paired with the next
    // script in the file (the --selftest step itself wraps nothing)
    const wrapped = new Set();
    for (const block of ci.split(/\n(?=\s*-\s+name:|\s*run:)/)) {
      if (!/web\/tools\/e2e-retry\.mjs/.test(block) || /--selftest/.test(block)) continue;
      const sepm = /(?:^|\s)--(?=\s|$)/m.exec(block); // the first standalone `--` token (not --allow / --band)
      if (!sepm) continue;
      const tail = block.slice(sepm.index + sepm[0].length);
      let last = null;
      for (const m of tail.matchAll(/web\/tools\/e2e-([a-z0-9-]+)\.mjs/g)) if (m[1] !== 'retry') last = m[1];
      if (last) wrapped.add(last.toUpperCase());
    }
    check('ci.yml wraps at least one suite', wrapped.size > 0, '');
    for (const w of wrapped) {
      const have = (cls) => SELFTEST_CASES.some((c) => c.suite === w && c.cls === cls);
      check(`ci.yml-wrapped suite ${w} has PASS and FAIL fixtures`, have('JUDGED-PASS') && have('JUDGED-FAIL'), '');
    }
  } catch (e) { check('ci.yml readable', false, e.message); }
  // BUDGET rows (GH-926): THIS file (never a fixed path, so a copy runs its
  // own code) wraps a replay of the record job's attempt-1 lines (atelier
  // job log :146 + :776) that passes on attempt 2. The cap is read here
  // from ci.yml independently of the subject's reader. Self-contained
  // imports: the block also runs appended to a pre-fix copy (base red).
  {
    const { spawnSync } = await import('node:child_process');
    const os = await import('node:os');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const self = fileURLToPath(import.meta.url);
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'ob-e2e-retry-budget-'));
    const replay = path.join(scratch, 'replay.cjs');
    fs.writeFileSync(replay, [
      "const fs = require('node:fs');",
      'const [counter, mode, suite] = process.argv.slice(2);',
      "const n = (fs.existsSync(counter) ? Number(fs.readFileSync(counter, 'utf8')) : 0) + 1;",
      'fs.writeFileSync(counter, String(n));',
      'if (n > 1) { console.log(`E2E-${suite}: PASS`); process.exit(0); }',
      "if (mode === 'infra') { console.error('chrome debugger endpoint never came up'); process.exit(1); }",
      "console.log('E2E-ATELIER FAIL: C: select→float-visible over budget (300 ms)');",
      "console.log('E2E-ATELIER: FAILED');",
      'process.exit(1);',
    ].join('\n'));
    let ciText = '';
    try { ciText = fs.readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8'); } catch { /* rows below go red */ }
    const capOf = (job) => {
      const m = new RegExp(`\\n  ${job}:\\n(?:(?!\\n  \\S)[\\s\\S])*?\\n    timeout-minutes: (\\d+)`).exec(ciText);
      return m ? Number(m[1]) : null;
    };
    const atelierCap = capOf('e2e-atelier');
    const playCap = capOf('e2e-play');
    // the record job's allow entry, kept as a literal: ci.yml retired the
    // atelier known-flake allowlist (#839/#926), and these rows exercise the
    // wrapper's budget route for an allowlisted judged red, not ci.yml's list
    const allowC = 'C: select→float-visible over budget';
    check('budget: ci.yml gives e2e-atelier / e2e-play a cap',
      atelierCap !== null && playCap !== null, `${atelierCap} ${playCap}`);
    const nowS = () => Math.floor(Date.now() / 1000);
    let caseNo = 0;
    const runCase = ({ job, t0, allowArgs, mode, suite }) => {
      const counter = path.join(scratch, `counter-${++caseNo}`);
      const env = { ...process.env };
      for (const k of ['OB_JOB_T0_S', 'GITHUB_JOB', 'OB_E2E_PORT']) delete env[k];
      if (job !== undefined) env.GITHUB_JOB = job;
      if (t0 !== undefined) env.OB_JOB_T0_S = String(t0);
      const r = spawnSync(process.execPath, [self, ...allowArgs, '--suite', suite, '--',
        process.execPath, replay, counter, mode, suite], { encoding: 'utf8', env, timeout: 20000 });
      const err = r.stderr ?? '';
      return {
        rc: r.status,
        err,
        attempts: (err.match(/^E2E-RETRY: attempt \d+ (JUDGED-PASS|JUDGED-FAIL|DIED) rows=/gm) ?? []).length,
        attempt1: /^E2E-RETRY: attempt 1 (JUDGED-PASS|JUDGED-FAIL|DIED) rows=/m.test(err),
        budget: /^E2E-RETRY: RED WITHOUT RETRY — BUDGET: attempt 1 took \d+s; \d+s of the \d+-min job cap remain \(GH-926\)$/m.exec(err)?.[0] ?? null,
        unknown: /^E2E-RETRY: retry budget unknown \((.+)\) — GH-559 rule unchanged \(GH-926\)$/m.exec(err)?.[1] ?? null,
        green: /^E2E-RETRY: RETRIED-GREEN /m.test(err),
      };
    };
    const judged = { allowArgs: ['--allow', allowC], mode: 'judged', suite: 'ATELIER' };
    const b1 = runCase({ ...judged, job: 'e2e-atelier', t0: nowS() - (atelierCap ?? 0) * 60 });
    check('budget B1 exhausted: one attempt, the BUDGET line, rc 1',
      b1.attempts === 1 && b1.attempt1 && b1.budget !== null
        && b1.budget.includes(`of the ${atelierCap}-min job cap`) && b1.rc === 1,
      `attempt lines ${b1.attempts}, BUDGET line ${b1.budget ? 'present' : 'absent'}, rc ${b1.rc}`);
    const b2 = runCase({ ...judged, job: 'e2e-atelier', t0: nowS() });
    check('budget B2 ample: retried green, rc 0',
      b2.attempts === 2 && b2.green && b2.budget === null && b2.unknown === null && b2.rc === 0,
      `attempt lines ${b2.attempts}, green ${b2.green}, rc ${b2.rc}`);
    const b3 = runCase({ ...judged, job: 'e2e-atelier' });
    check('budget B3 no stamp: retry + budget unknown',
      b3.attempts === 2 && b3.green && b3.rc === 0 && /OB_JOB_T0_S/.test(b3.unknown ?? ''),
      `attempt lines ${b3.attempts}, unknown ${b3.unknown}, rc ${b3.rc}`);
    const b4 = runCase({ ...judged, job: 'test', t0: nowS() });
    check('budget B4 job test (no timeout-minutes): retry + budget unknown',
      b4.attempts === 2 && b4.green && b4.rc === 0 && /\btest\b/.test(b4.unknown ?? ''),
      `attempt lines ${b4.attempts}, unknown ${b4.unknown}, rc ${b4.rc}`);
    const b5 = runCase({ allowArgs: [], mode: 'infra', suite: 'PLAY', job: 'e2e-play', t0: nowS() - (playCap ?? 0) * 60 });
    check('budget B5 infra-DIED route (empty allowlist) exhausted: BUDGET line, no retry',
      b5.attempts === 1 && b5.attempt1 && b5.budget !== null && b5.rc === 1,
      `attempt lines ${b5.attempts}, BUDGET line ${b5.budget ? 'present' : 'absent'}, rc ${b5.rc}`);
    // B6 (review r2 P2): a suite that starts a real spawnStaticServer, prints
    // an infra signature and is SIGKILLed, on a budget that denies the
    // retry — the denied route must still reap the detached server (exit
    // confirmed, marker gone) before its verdict. Private marker dir and
    // band registry (the cdp.mjs test seams), CI band keys removed, a port
    // the OS just handed out. The suite logs each phase to a side file as
    // it reaches it and the wrapper's lines are stamped as they arrive, so
    // the detail names where the time went on a pass, a fail or a timeout;
    // the server pid comes from that file, so a wrapper killed mid-run
    // still leaves a pid to check and stop. The case's wall budget is
    // derived from the bounds it contains (below), never a bare literal.
    //
    // The listening conjunct needs a CONTROL of the same kind: a second
    // `python3 -m http.server` (spawnStaticServer's command) on a spare port
    // and an empty docroot, probed with the same bounded connect. A host
    // where that control never answers cannot say anything about the suite's
    // server listening (a hosted macOS record run: every connect timed out),
    // so there the row asserts the reap proof alone and prints why; a
    // reachable control with an unreachable suite server is a spawn
    // regression and stays red. Whenever a listener reads unreachable the
    // detail carries its stderr, its process group's TCP sockets (a python3
    // shim can hold the socket in a child), one [::1] connect and the
    // resolved interpreter, so the host's cause is named without blocking.
    {
      const net = await import('node:net');
      // B6_UP_MS: the listener poll deadline (each connect bounded by
      // B6_CONNECT_MS), for the suite and the control alike. B6_STARTUP_MS:
      // one node start + the cdp.mjs import, allowed once per process
      // (wrapper, suite). The wrapper's part is RETRY_TEARDOWN_MS (reap
      // confirm + port-free + SIGKILL escalation bounds); the sum is doubled
      // for a slow host. The control runs before the wrapper, on its own
      // B6_UP_MS deadline plus B6_CONTROL_STOP_MS for its exit confirmation.
      const B6_UP_MS = 10000; const B6_CONNECT_MS = 500; const B6_STARTUP_MS = 5000;
      const B6_CONTROL_STOP_MS = 2000; const B6_PROBE_HOST = '127.0.0.1';
      const B6_BUDGET_MS = 2 * (B6_UP_MS + B6_CONNECT_MS + 2 * B6_STARTUP_MS + RETRY_TEARDOWN_MS);
      const freePort = () => new Promise((res) => {
        const srv = net.createServer();
        srv.once('error', () => res(null));
        srv.listen(0, '127.0.0.1', () => { const p = srv.address().port; srv.close(() => res(p)); });
      });
      // One bounded connect: 'accepted' | 'refused' | 'timeout' | 'error <code>'.
      // Its source is also the generated suite's probe (the suite imports net).
      const probe = (host, port, ms) => new Promise((r) => {
        const c = net.connect({ port: Number(port), host, timeout: ms });
        c.once('connect', () => { c.destroy(); r('accepted'); });
        c.once('timeout', () => { c.destroy(); r('timeout'); });
        c.once('error', (e) => r(e.code === 'ECONNREFUSED' ? 'refused' : `error ${e.code}`));
      });
      const tally = (kinds) => Object.entries(kinds.reduce((o, k) => ({ ...o, [k]: (o[k] ?? 0) + 1 }), {}))
        .map(([k, n]) => `${k} ×${n}`).join(', ');
      const lsofOf = (pid) => {
        try {
          return execFileSync('lsof', ['-nP', '-a', '-g', String(pid), '-iTCP'], { encoding: 'utf8', timeout: 5000 }).trim().replace(/\s+/g, ' ');
        } catch (e) { return `lsof ${e.status ?? e.code}: ${String(e.stdout ?? '').trim().replace(/\s+/g, ' ')}`; }
      };
      const shOut = (argv) => {
        try { return execFileSync(argv[0], argv.slice(1), { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'] }).trim(); } catch (e) {
          return `rc ${e.status ?? e.code} ${String(e.stderr ?? '').trim()}`;
        }
      };
      const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code !== 'ESRCH'; } };
      const port = await freePort();
      const cport = await freePort();
      const mrk = path.join(scratch, 'mrk'); const reg = path.join(scratch, 'reg'); const doc = path.join(scratch, 'doc');
      const cdoc = path.join(scratch, 'control-doc');
      for (const d of [mrk, reg, doc, cdoc]) fs.mkdirSync(d);

      // The control: spawnStaticServer's command, spawn shape and python env (its #1228 getfqdn shim on PYTHONPATH,
      // so a host whose own name resolves slowly delays neither), no claims.
      const ct0 = Date.now();
      let control = null;
      if (cport !== null) {
        const cp = spawn('python3', ['-m', 'http.server', '-d', cdoc, String(cport)], { stdio: ['ignore', 'ignore', 'pipe'], detached: true,
          env: { ...process.env, PYTHONPATH: staticServerPythonPath() } });
        let cerr = '';
        cp.stderr.on('data', (c) => { cerr = (cerr + c).slice(-2000); });
        cp.once('error', (e) => { cerr += `spawn ${e.code}`; });
        const kinds = []; const until = Date.now() + B6_UP_MS; let up = false;
        while (!(up = (kinds[kinds.length] = await probe(B6_PROBE_HOST, cport, B6_CONNECT_MS)) === 'accepted') && Date.now() < until) {
          await new Promise((r) => setTimeout(r, 100));
        }
        const diag = up || !Number.isInteger(cp.pid) ? null
          : `lsof [${lsofOf(cp.pid)}]; [::1] connect ${await probe('::1', cport, B6_CONNECT_MS)}; stderr ${JSON.stringify(cerr.slice(-400))}`;
        if (Number.isInteger(cp.pid)) {
          try { process.kill(-cp.pid, 'SIGKILL'); } catch { /* already gone */ }
          const stopBy = Date.now() + B6_CONTROL_STOP_MS;
          while (alive(cp.pid) && Date.now() < stopBy) await new Promise((r) => setTimeout(r, 50));
        }
        control = { pid: cp.pid, up, kinds, ms: Date.now() - ct0, diag, left: Number.isInteger(cp.pid) && alive(cp.pid) };
      }

      const phaseFile = path.join(scratch, 'b6-phases.txt');
      const suiteJs = path.join(scratch, 'died-server.mjs');
      fs.writeFileSync(suiteJs, [
        "import fs from 'node:fs'; import net from 'node:net'; import { execFileSync } from 'node:child_process';",
        'const [doc, port, phaseFile] = process.argv.slice(2);',
        'const ph = (m) => fs.appendFileSync(phaseFile, `${Date.now()} ${m}\\n`);',
        "ph('suite-start');",
        `const { spawnStaticServer } = await import(${JSON.stringify(new URL('./cdp.mjs', import.meta.url).href)});`,
        "ph('cdp-imported');",
        'const proc = spawnStaticServer(doc, Number(port));',
        "let err = ''; proc.stderr?.on('data', (c) => { err = (err + c).slice(-2000); });",
        'ph(`server-spawned pid ${proc.pid}`);',
        `const probe = ${probe.toString()};`,
        `const until = Date.now() + ${B6_UP_MS}; const kinds = []; let live = false;`,
        `while (!(live = (kinds[kinds.length] = await probe(${JSON.stringify(B6_PROBE_HOST)}, port, ${B6_CONNECT_MS})) === 'accepted') && Date.now() < until) `
          + 'await new Promise((r) => setTimeout(r, 100));',
        'const polls = kinds.length - 1;',
        'ph(`B6-SERVER pid ${proc.pid} listening ${live} polls ${polls}`);',
        'ph(`probe-kinds ${JSON.stringify(kinds)}`);',
        // The server is still alive here: its sockets and a [::1] connect are
        // read before the suite dies and the wrapper reaps the group.
        'if (!live) {',
        "  let ls = ''; try { ls = execFileSync('lsof', ['-nP', '-a', '-g', String(proc.pid), '-iTCP'], { encoding: 'utf8', timeout: 5000 }); }",
        "  catch (e) { ls = `lsof ${e.status ?? e.code}: ${e.stdout ?? ''}`; }",
        "  ph(`diag lsof [${ls.trim().replace(/\\s+/g, ' ')}]; [::1] connect ${await probe('::1', port, " + B6_CONNECT_MS + ")}; stderr ${JSON.stringify(err.slice(-400))}`);",
        '}',
        'console.log(`B6-SERVER pid ${proc.pid} listening ${live}`);',
        "console.error('chrome debugger endpoint never came up');",
        "ph('suite-sigkill');",
        "process.kill(process.pid, 'SIGKILL');",
      ].join('\n'));
      const env = { ...process.env, OB_SERVER_MARKER_DIR: mrk, OB_PORT_BANDS_DIR: reg,
        GITHUB_JOB: 'e2e-play', OB_JOB_T0_S: String(nowS() - (playCap ?? 0) * 60) };
      for (const k of ['GITHUB_ACTIONS', 'OB_CI_BANDS', 'CI', 'OB_E2E_PORT', 'OB_E2E_CDP_PORT', 'OB_CDP_PORT', 'OB_PORT_BANDS']) delete env[k];
      const t0 = Date.now();
      const stamped = [];
      const r = port === null ? null : await new Promise((res) => {
        const ch = spawn(process.execPath, [self, '--suite', 'PLAY', '--', process.execPath, suiteJs, doc, String(port), phaseFile],
          { env, stdio: ['ignore', 'pipe', 'pipe'] });
        const out = { stdout: '', stderr: '' };
        for (const [k, s] of [['stdout', ch.stdout], ['stderr', ch.stderr]]) {
          s.setEncoding('utf8');
          let part = '';
          s.on('data', (c) => {
            out[k] += c; part += c;
            let i;
            while ((i = part.indexOf('\n')) >= 0) { stamped.push({ t: Date.now() - t0, line: part.slice(0, i) }); part = part.slice(i + 1); }
          });
        }
        let timedOut = false;
        const timer = setTimeout(() => { timedOut = true; ch.kill('SIGTERM'); }, B6_BUDGET_MS);
        ch.once('close', (status, signal) => { clearTimeout(timer); res({ ...out, status, signal, timedOut, wallMs: Date.now() - t0 }); });
      });
      const err = r?.stderr ?? '';
      const phases = (() => { try { return fs.readFileSync(phaseFile, 'utf8').split('\n').filter(Boolean); } catch { return []; } })()
        .map((l) => { const [ms, ...rest] = l.split(' '); return { t: Number(ms) - t0, what: rest.join(' ') }; });
      const shown = phases.filter((p) => !/^(probe-kinds|diag) /.test(p.what));
      const suiteKinds = (() => { try { return JSON.parse(phases.find((p) => p.what.startsWith('probe-kinds '))?.what.slice(12) ?? '[]'); } catch { return []; } })();
      const suiteDiag = phases.find((p) => p.what.startsWith('diag '))?.what.slice(5) ?? null;
      const at = (re) => { const s = stamped.find((x) => re.test(x.line)); return s ? `+${s.t}` : '-'; };
      const budgetText = `${B6_BUDGET_MS} ms budget = 2 × (up ${B6_UP_MS} + connect ${B6_CONNECT_MS} + 2 × startup ${B6_STARTUP_MS} `
        + `+ teardown ${RETRY_TEARDOWN_MS})`;
      const phaseDetail = `from wrapper start: phases [${shown.map((p) => `${p.what} +${p.t}`).join(', ')}]; wrapper [DIED ${at(/^E2E-RETRY: attempt 1 DIED /)}, `
        + `reap ${at(/reaped the killed suite's surviving http\.server group/)}, BUDGET ${at(/^E2E-RETRY: RED WITHOUT RETRY — BUDGET/)}]; `
        + `wall ${r?.wallMs ?? '-'} ms of a ${budgetText}${r?.timedOut ? ' — TIMED OUT' : ''}`;
      // Every server the suite spawned is collected — from the side file and
      // from the markers spawnStaticServer wrote (a regressed wrapper that
      // retries starts a second one; a suite stuck inside the spawn call
      // leaves only its marker); each survivor is stopped by its group,
      // after its command line is matched to this case's docroot and port.
      const markers = (() => { try { return fs.readdirSync(mrk).filter((n) => /^obw-e2e-server-\d+\.json$/.test(n)); } catch { return ['<unreadable>']; } })();
      const spawned = [...new Set([...phases.map((p) => /^server-spawned pid (\d+)$/.exec(p.what)), ...markers.map((n) => /(\d+)\.json$/.exec(n))]
        .filter(Boolean).map((m) => Number(m[1])))];
      const ups = phases.map((p) => /^B6-SERVER pid (\d+) listening (true|false) polls \d+$/.exec(p.what)).filter(Boolean)
        .map((m) => ({ pid: Number(m[1]), up: m[2] === 'true' }));
      const survivors = spawned.filter((pid) => alive(pid));
      const spid = spawned.length === 1 ? spawned[0] : null;
      const suiteUp = ups.length > 0 && ups.every((u) => u.up);
      const ctrlUp = control?.up === true;
      // The reap proof: required on every host.
      const reapProof = r !== null && !r.timedOut && spid !== null && ups.length === 1 && ups[0].pid === spid
        && survivors.length === 0 && markers.length === 0 && control !== null && !control.left
        && (err.match(/^E2E-RETRY: attempt \d+ (JUDGED-PASS|JUDGED-FAIL|DIED) rows=/gm) ?? []).length === 1
        && /^E2E-RETRY: attempt 1 DIED rows=0/m.test(err)
        && /^E2E-RETRY: RED WITHOUT RETRY — BUDGET: attempt 1 took \d+s; \d+s of the \d+-min job cap remain \(GH-926\)$/m.test(err)
        && err.includes(`reaped the killed suite's surviving http.server group (pid ${spid}, :${port})`)
        && r.status === 1;
      const count = (kinds, k) => kinds.filter((x) => x === k).length;
      let verdict;
      if (control === null) verdict = 'no control port';
      else if (ctrlUp && suiteUp) verdict = 'control reachable, suite server reachable — full assertion';
      else if (ctrlUp && ups.length === 0) verdict = 'the suite reported no server line (the python control is reachable)';
      else if (ctrlUp) verdict = 'SPAWN REGRESSION: the python control is reachable and the suite server is not';
      else verdict = `python listener unreachable on this host (control connect timed out ×${count(control.kinds, 'timeout')}; `
        + `suite server ×${count(suiteKinds, 'timeout')}) — reap proof asserted without the listening conjunct`;
      const listenOk = ctrlUp ? suiteUp : control !== null;
      const diags = [];
      if (control && !control.up) diags.push(`control pid ${control.pid} :${cport} probes [${tally(control.kinds)}] ${control.diag ?? ''}`.trim());
      if (!suiteUp) diags.push(`suite server probes [${tally(suiteKinds)}] ${suiteDiag ?? 'no diag line'}`);
      if (diags.length) diags.push(`python3 ${shOut(['python3', '--version'])} at ${shOut(['/bin/sh', '-c', 'command -v python3'])}`);
      check('budget B6 DIED with a live static server, retry denied: server reaped (exit confirmed, marker gone), BUDGET line, rc 1',
        reapProof && listenOk,
        `${verdict}; control ${control ? `pid ${control.pid} :${cport} ${ctrlUp ? 'reachable' : 'unreachable'} in ${control.ms} ms${control.left ? ' LEFT ALIVE' : ''}` : 'none'}; `
          + `port ${port}, servers [${spawned.map((pid) => `${pid} listening ${ups.find((u) => u.pid === pid)?.up ?? 'unreported'}`).join(', ') || 'never spawned'}], `
          + `alive after [${survivors.join(', ')}], markers [${markers.join(', ')}], rc ${r?.status}${r?.signal ? ` signal ${r.signal}` : ''}; ${phaseDetail}`
          + (diags.length ? `; diagnostics: ${diags.join(' | ')}` : ''), true);
      for (const pid of survivors) {
        let cmd = '';
        try { cmd = execFileSync('ps', ['-o', 'command=', '-p', String(pid)], { encoding: 'utf8' }); } catch { continue; }
        if (cmd.includes('http.server') && cmd.includes(doc) && cmd.includes(` ${port}`)) {
          try { process.kill(-pid, 'SIGKILL'); } catch { /* raced */ }
        }
      }
    }
    try { fs.rmSync(scratch, { recursive: true, force: true }); } catch { /* tmpdir reaper */ }
  }
  // --intersect rows (#806): THIS file wraps a replay whose passes print planned FAIL rows, and every verdict shape is
  // read off the wrapper's own lines (GITHUB_JOB unset: the budget is unknown, so the retry is allowed)
  {
    const { spawnSync } = await import('node:child_process');
    const os = await import('node:os');
    const path = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const self = fileURLToPath(import.meta.url);
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'ob-e2e-retry-intersect-'));
    const replay = path.join(scratch, 'replay.cjs');
    fs.writeFileSync(replay, [
      "const fs = require('node:fs');",
      'const [counter, plan] = process.argv.slice(2);',
      "const n = (fs.existsSync(counter) ? Number(fs.readFileSync(counter, 'utf8')) : 0) + 1;",
      'fs.writeFileSync(counter, String(n));',
      'const rows = JSON.parse(plan)[n - 1] ?? [];',
      "if (rows === 'DIED') { console.error('TypeError: planted death'); process.exit(1); }",
      "if (rows === 'NOROW') { console.log('E2E-SHELL FAIL'); process.exit(1); }",
      'for (const r of rows) console.error(`E2E-SHELL FAIL: ${r}: planted payload ${n}`);',
      "console.log(rows.length ? 'E2E-SHELL FAIL' : 'E2E-SHELL PASS');",
      'process.exit(rows.length ? 1 : 0);',
    ].join('\n'));
    let k = 0;
    const runI = (plan, extra = [], envOver = {}) => {
      const counter = path.join(scratch, `counter-${++k}`);
      const env = { ...process.env };
      for (const key of ['OB_JOB_T0_S', 'GITHUB_JOB', 'OB_E2E_PORT']) delete env[key];
      Object.assign(env, envOver);
      const r = spawnSync(process.execPath, [self, '--intersect', ...extra, '--suite', 'SHELL', '--',
        process.execPath, replay, counter, JSON.stringify(plan)], { encoding: 'utf8', env, timeout: 20000 });
      const err = r.stderr ?? '';
      const lines = err.trim().split('\n');
      let summary = null;
      try { summary = JSON.parse(/^E2E-RETRY: SUMMARY (\{.*\})$/m.exec(err)?.[1] ?? 'null'); } catch { summary = null; }
      return { rc: r.status, err, last: lines[lines.length - 1] ?? '', summary,
        attempts: (err.match(/^E2E-RETRY: attempt \d+ (JUDGED-PASS|JUDGED-FAIL|DIED) rows=/gm) ?? []).length };
    };
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const i1 = runI([[]]);
    check('intersect I1 green on pass 1: one attempt, rc 0, summary GREEN',
      i1.rc === 0 && i1.attempts === 1 && i1.summary?.verdict === 'GREEN', `rc ${i1.rc} attempts ${i1.attempts} last ${i1.last}`);
    const i2 = runI([['A3 dl rail → practice'], []]);
    check('intersect I2 red then green: two attempts, rc 0, RETRIED-GREEN names the first run',
      i2.rc === 0 && i2.attempts === 2 && i2.summary?.verdict === 'RETRIED-GREEN'
        && /^E2E-RETRY: RETRIED-GREEN .*A3 dl rail → practice/.test(i2.last), `rc ${i2.rc} last ${i2.last}`);
    const i3 = runI([['A3 dl rail → practice', 'D'], ['K05 desktop ja']]);
    check('intersect I3 disjoint: rc 1, the FLAKE line lists every row by attempt, empty intersection',
      i3.rc === 1 && i3.attempts === 2
        && i3.last === 'E2E-SHELL FLAKE: A3 dl rail → practice (attempt 1), D (attempt 1), K05 desktop ja (attempt 2)'
        && i3.summary?.verdict === 'FLAKE' && same(i3.summary?.intersection, [])
        && same(i3.summary?.passes?.map((q) => q.rows), [['A3 dl rail → practice', 'D'], ['K05 desktop ja']]),
      `rc ${i3.rc} last ${i3.last}`);
    const i4 = runI([['A3 rm rail → equipment', 'D'], ['D', 'H desktop']]);
    check('intersect I4 intersecting: rc 1, RED names the shared row only',
      i4.rc === 1 && i4.last === 'E2E-SHELL RED: D' && i4.summary?.verdict === 'RED' && same(i4.summary?.intersection, ['D']),
      `rc ${i4.rc} last ${i4.last}`);
    const i5 = runI(['DIED', 'DIED']);
    check('intersect I5 died twice: rc 1, RED: DIED (a death is a named pseudo-row)',
      i5.rc === 1 && i5.attempts === 2 && i5.last === 'E2E-SHELL RED: DIED', `rc ${i5.rc} last ${i5.last}`);
    const i6 = runI([[]], ['--allow', 'D']);
    check('intersect I6 refuses an --allow list (exit 2, nothing run)', i6.rc === 2 && i6.attempts === 0, `rc ${i6.rc}`);
    // GH-926 under --intersect: a cap with no room for a second pass denies the retry (the e2e-shell job's own cap)
    const shellCap = /\n  e2e-shell:\n(?:(?!\n  \S)[\s\S])*?\n    timeout-minutes: (\d+)/.exec(
      (() => { try { return fs.readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8'); } catch { return ''; } })())?.[1];
    const i7 = runI([['A3 dl rail → practice'], []], [], { GITHUB_JOB: 'e2e-shell',
      OB_JOB_T0_S: String(Math.floor(Date.now() / 1000) - Number(shellCap ?? 0) * 60) });
    check('intersect I7 budget exhausted: one attempt, the BUDGET line, rc 1, summary BUDGET',
      shellCap !== undefined && i7.rc === 1 && i7.attempts === 1 && i7.summary?.verdict === 'BUDGET'
        && /^E2E-RETRY: RED WITHOUT RETRY — BUDGET: /m.test(i7.err), `cap ${shellCap} rc ${i7.rc} attempts ${i7.attempts} last ${i7.last}`);
    const i8 = runI(['DIED', ['A3 dl rail → practice']]);
    check('intersect I8 a death then a judged red: FLAKE names the DIED pseudo-row by attempt',
      i8.rc === 1 && i8.last === 'E2E-SHELL FLAKE: DIED (attempt 1), A3 dl rail → practice (attempt 2)', `rc ${i8.rc} last ${i8.last}`);
    const i9 = runI(['NOROW', 'NOROW']);
    check('intersect I9 a red with no FAIL row in both passes: RED names the pseudo-row',
      i9.rc === 1 && i9.last === 'E2E-SHELL RED: JUDGED-FAIL without a FAIL row', `rc ${i9.rc} last ${i9.last}`);
    // F1 (GH-816's vocabulary rule): every line --intersect adds is prefixed, or is the one verdict line
    const added = [i1, i2, i3, i4, i5, i7, i8, i9].flatMap((x) => x.err.split('\n'))
      .filter((l) => l.trim() && !/^(E2E-RETRY:|e2e-retry:|E2E-SHELL (RED|FLAKE): |E2E-SHELL FAIL: |TypeError: planted death)/.test(l));
    check('intersect: every wrapper line is E2E-RETRY:-prefixed or the verdict line', added.length === 0, added.slice(0, 2).join(' | '));
    let ciYml = '';
    try { ciYml = fs.readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8'); } catch { /* red below */ }
    check('intersect: ci.yml runs e2e-shell under e2e-retry --intersect',
      /e2e-retry\.mjs --intersect --\s+node web\/tools\/e2e-shell\.mjs/.test(ciYml), '');
    try { fs.rmSync(scratch, { recursive: true, force: true }); } catch { /* tmpdir reaper */ }
  }
  let bad = 0;
  for (const r of rows) {
    if (!r.ok) bad++;
    console.log(`${r.ok ? 'ok' : 'FAIL'}: ${r.name}${!r.detail || (r.ok && !r.showOnPass) ? '' : ` — ${r.detail}`}`);
  }
  console.log(`E2E-RETRY-SELFTEST: ${bad ? 'FAILED' : 'PASS'} (${rows.length - bad}/${rows.length} cases)`);
  process.exit(bad ? 1 : 0);
}

const SUITE = suiteArg ?? suiteTokenOf(cmd);
if (!SUITE || !SUITE_TOKEN_RE.test(SUITE)) {
  console.error('e2e-retry: cannot bind the suite token — the command names no '
    + 'web/tools/e2e-<name>.mjs script; pass --suite TOKEN (uppercase, e.g. PLAY).');
  process.exit(2);
}

function run() {
  return new Promise((resolve) => {
    const p = spawn(cmd[0], cmd.slice(1), { stdio: ['ignore', 'pipe', 'pipe'] });
    activeChild = p;
    lastChildPid = p.pid;
    // one buffer PER stream (issue #816): the suites print their verdict
    // line on either stream (e2e-play's FAIL and e2e-replays' FAIL go to
    // stderr) and the anchored recognizer must never see a stdout chunk
    // spliced into the middle of a stderr line. The classifier reads the
    // two joined on a line boundary; order across streams is not needed.
    const bufs = { out: '', err: '' };
    p.stdout.on('data', (c) => { process.stdout.write(c); bufs.out += c; });
    p.stderr.on('data', (c) => { process.stderr.write(c); bufs.err += c; });
    p.on('close', (code, signal) => {
      activeChild = null;
      const out = `${bufs.out}\n${bufs.err}`;
      resolve({ code: signal ? 1 : (code ?? 1), out, ...classifyOutput(out, SUITE) });
    });
    p.on('error', (e) => {
      console.error(`e2e-retry: spawn failed: ${e.message}`);
      resolve({ code: 1, out: '', ...classifyOutput('', SUITE) });
    });
  });
}


const t1 = performance.now(); // attempt 1's wall, monotonic (GH-926)
const first = await run();
const firstMs = performance.now() - t1;
if (termSignal) {
  // signalled: never retry — and reap the dead suite's marker-attributed
  // servers SYNCHRONOUSLY before exiting (review r9 P1: exiting first
  // cancelled the deferred reap and stranded the port + lease). Idempotent
  // with the escalation-path reap; a gracefully-exited suite has no
  // matching markers left.
  reapChildServers(lastChildPid);
  process.exit(SIG_EXIT[termSignal]);
}
reportAttempt(1, first);

// The final verdict is built here and applied ONCE at the bottom: every
// branch sets `final` (rc + the line that names the route); only a retry
// leaves it unset. `retryWhy` names the route into the second attempt.
let final = null;
let retryWhy = null;
const tags = [...new Set(first.fails.map(armTag))];
const allowText = [...allow].join(', ');
if (first.code === 0) {
  final = { rc: 0, msg: `E2E-RETRY: verdict green — exit 0 on attempt 1 (${first.cls})`
    + (first.cls === 'JUDGED-PASS' ? '' : ' — accepted on the exit status; the log carried no completion line') };
  if (intersect) intersectSummary('GREEN', [first], [], 0);
} else if (intersect) {
  // #806: the `A || A` route — any red retries once; the verdict compares the two passes' row sets
  retryWhy = `E2E-RETRY: attempt 1 ${first.cls} — retrying once (--intersect, #806: any red retries once; the `
    + "verdict compares the two passes' row sets).";
} else if (first.cls !== 'DIED') {
  // JUDGED to completion (issue #816): the suite printed its own verdict
  // line, so this is never a death — route by the allowlist only.
  // (GH-557 review r4 P2 kept: the allowlisted-flake branch is only for
  // runs the suite judged to completion; a run that emitted an allowlisted
  // FAIL and then DIED mid-suite must clear the infra gate below instead.)
  const outside = first.fails.filter((m) => !allowed(m));
  if (first.fails.length === 0) {
    final = { rc: first.code, msg: 'E2E-RETRY: RED WITHOUT RETRY — JUDGED-FAIL: the suite '
      + `judged this run to completion (${first.line}) with exit ${first.code} and no `
      + 'E2E-<SUITE> FAIL: row to weigh against the allowlist — a judged red is final.' };
  } else if (outside.length) {
    final = { rc: first.code, msg: `E2E-RETRY: RED WITHOUT RETRY — JUDGED-FAIL: the suite `
      + `judged this run to completion (${first.line}); failing arm(s) [${
        tags.map((t) => t ?? '<unparsed>').join(', ')}] include arms outside `
      + `the known-flake allowlist [${allowText}] (GH-559: a retry must never `
      + 'absorb a possible real regression).' };
  } else {
    retryWhy = `E2E-RETRY: attempt 1 JUDGED-FAIL ONLY in known-flake arm(s) [${
      tags.join(', ')}] — retrying once (GH-559; allowlist [${allowText}]).`;
  }
} else if (INFRA_RE.test(first.out) && first.fails.every(allowed)) {
  // (GH-557 review r5 P1: an infra death may only retry when every FAIL
  // line seen before it was allowlisted — a real non-allowlisted red
  // followed by an infra crash must stay red)
  retryWhy = 'E2E-RETRY: attempt 1 DIED '
    + (first.fails.length ? 'MID-SUITE (no completion verdict) ' : 'with no FAIL lines ')
    + `on a recognized infrastructure signature (${INFRA_RE.exec(first.out)[0]}) `
    + '— retrying once (GH-559/GH-557).';
} else {
  final = { rc: first.code, msg: 'E2E-RETRY: RED WITHOUT RETRY — DIED: the run '
    + (first.fails.length
      ? 'emitted FAIL lines but DIED before its completion verdict'
      : 'died with no FAIL lines')
    + (INFRA_RE.test(first.out)
      ? ', and a FAIL line outside the allowlist forbids the infra retry'
      : ' and carries NO recognized infrastructure signature')
    + ' (an unstructured application/suite exception — or a real red '
    + 'preceding an infra death — is not retryable; GH-557 review r3-r5).' };
}

// GH-926: both retry routes above clear the same budget check — a retry
// the job cap cannot hold is cancelled mid-suite and strands its browser.
if (!final) {
  const budget = retryBudget(firstMs);
  if (!budget.known) {
    console.error(`E2E-RETRY: retry budget unknown (${budget.why}) — GH-559 rule unchanged (GH-926)`);
  } else if (!budget.ok) {
    final = { rc: first.code, msg: `E2E-RETRY: RED WITHOUT RETRY — BUDGET: attempt 1 took ${
      Math.round(budget.attemptS)}s; ${Math.max(0, Math.floor(budget.remainingS))}s of the ${
      budget.capMin}-min job cap remain (GH-926)` };
    if (intersect) intersectSummary('BUDGET', [first], [], first.code);
  }
}
// A no-retry exit after a DIED attempt reaps first (GH-926 review r2 P2): a
// suite that died never ran its teardown, so its detached server can still
// hold the pinned port with its marker on disk. The retry route reaps before
// attempt 2 (below); every route that ends without one — the non-retryable
// death and a retry the budget denies — runs the same identity-validated,
// exit-confirmed reap before the verdict. Nothing re-binds, so no port wait.
if (final && first.cls === 'DIED') reapChildServers(lastChildPid);
if (!final) {
  console.error(retryWhy);
  // confirmed cleanup BEFORE the retry (review r12 P2): a crashed first run's
  // cdp exit hook SIGKILLs its detached server without confirming the socket
  // closed — an immediate retry on the same pinned OB_E2E_PORT could lose the
  // bind to the still-exiting server (and now fail closed, wasting the one
  // retry). Reap the first run's marker-attributed leftovers (identity-
  // validated, exit-confirmed) and wait — bounded — for the pinned port to
  // actually refuse connections.
  reapChildServers(lastChildPid);
  await awaitPortFree(Number(process.env.OB_E2E_PORT), PORT_FREE_BUDGET_MS);

  const second = await run();
  if (termSignal) {
    reapChildServers(lastChildPid);
    process.exit(SIG_EXIT[termSignal]);
  }
  reportAttempt(2, second);
  if (intersect) {
    final = intersectVerdict(first, second);
  } else if (second.code === 0) {
    final = { rc: 0, msg: `E2E-RETRY: RETRIED-GREEN — the first run's failures were: ${
      first.fails.length ? first.fails.join(' | ') : '(none: harness crash)'}. `
      + 'This green consumed the one known-flake retry (GH-559).' };
  } else {
    final = { rc: second.code, msg: `E2E-RETRY: red on the retry as well (attempt 2 ${
      second.cls}) — final verdict red.` };
  }
}

async function awaitPortFree(port, budgetMs) {
  if (!Number.isInteger(port)) return;
  const net = await import('node:net');
  const t0 = Date.now();
  for (;;) {
    const held = await new Promise((res) => {
      const c = net.connect({ port, host: '127.0.0.1' });
      const done = (v) => { c.destroy(); res(v); };
      c.once('connect', () => done(true));
      c.once('error', () => done(false));
      setTimeout(() => done(true), PORT_FREE_PROBE_MS).unref();
    });
    if (!held) return;
    if (Date.now() - t0 > budgetMs) {
      console.error(`e2e-retry: :${port} still held ${budgetMs} ms after the `
        + 'first run died — the retry may lose the bind (named, not hidden).');
      return;
    }
    await new Promise((r) => { setTimeout(r, PORT_FREE_POLL_MS); });
  }
}

// the ONE place the wrapper's exit status is set (driver-rc-is-the-verdict)
console.error(final.msg);
process.exit(final.rc);
