// Copyright (c) Meta Platforms, Inc. and affiliates.

// run-gate.mjs — the lane gate wrapper: GH-338 port-band claim + the GH-347
// GREEN-FINGERPRINT GATE LEDGER (owner-approved ceremony acceleration,
// zero quality reduction).
//
//   node web/tools/run-gate.mjs [--band 9300-9329] [--suite id]
//        [--skip-if-green] [--no-canary] [--no-belt] [--deadline <s>] [--] <command…>
//   node web/tools/run-gate.mjs --selftest-ledger
//
// GH-1140 (deadline): --deadline <s> (or OB_RUN_GATE_DEADLINE_S; the flag wins;
// off by default) gives run-gate a clock of its own, counted from its start. A CI
// step's timeout-minutes is the runner's clock: whatever the runner does when it
// runs out decides whether run-gate tears down at all, and the step reads as a
// runner timeout with no line naming the suite. At <s> run-gate prints
// "[run-gate] deadline <s> s reached — ending the suite tree", ends the suite's
// tree through the GH-1082 signal path (the group's TERM, the grace, SIGKILL, the
// tree checked gone, then the band released) and exits 124 (GNU timeout's code).
// The ledger entry carries deadline + deadlineElapsedMs and is red even when a
// storm belt sample overlapped (a hung suite is never excused as infrastructure);
// the ledger line names the deadline. That field and the deadline line, not the
// code alone, identify the cause: a wrapped command may exit 124 itself. A
// deadline reached before the suite spawned ran nothing: exit 75 (not run, as
// for a band refusal), no ledger entry. A value that is not a whole number of
// seconds in 1-86400 (digits only, no leading zero), or the one-token form
// --deadline=<s>, is refused by name before anything runs. The knob is not
// passed to the suite.
//
// GH-338 (band claim): with --band, the lane's assigned port band is claimed
// in the host-global registry for the child suite's lifetime (OB_PORT_BANDS
// lineage; OB_E2E_PORT/OB_E2E_CDP_PORT derived from the ONE cdp.mjs
// bandLayout unless already pinned). The child is LEASED into the claim the
// moment it spawns (GH-389: the claim's lease was single-PID while its
// ownership is a lineage — a SIGKILLed wrapper left a live suite child on a
// band the stale-claim sweep then reaped and handed to a foreign lane), so
// the claim lives while wrapper OR child does. A signal-killed child exits
// 128+N — never a green.
//
// GH-347 (ledger): every wrapped run appends one JSON line to
// ~/.openbilliards/gate-ledger/ledger.jsonl (OB_GATE_LEDGER_DIR overrides;
// append-only, machine-local) recording the GREEN FINGERPRINT:
//   { suite, suiteHash (sha256 of the suite file), tree (git rev-parse
//     HEAD^{tree} of THIS repo — the tree the suite judged), dirty (any
//     porcelain output → the tree hash cannot vouch for the run),
//     harness { shellPin, cdpHash }, arms_v3 (the arm count — a runtime
//     proxy so a run that silently shrank never qualifies) and failArms_v3
//     (the failed arms' names; an uncaught crash reads 'uncaught: <class>:
//     <message>', and entries from before #1210 name it by its message
//     alone, which is safe because no reader compares names across
//     entries), both read by ONE verdict grammar
//     (lib/verdict-grammar.mjs, #1194; entries from older parsers carry
//     arms / failArms, or the arms_v2 / failArms_v2 of #1194's first round,
//     and are never compared with them), result
//     ('green' | 'red' | 'infra-storm'), exitCode, startedUTC, endedUTC,
//     logPath, rttP50Ms, giBootMs, belt [ {t, p50} ], host }
//
// SKIP RULE (--skip-if-green; conservative whole-tree identity — a skipped
// suite is byte-provably the same test on the same bytes):
//   skip ONLY when a ledger entry matches ALL of: identical tree hash,
//   dirty:false, identical suite-file hash, identical harness identity
//   (chrome-shell.pin + cdp.mjs hash), result green, age <= 24 h, and its
//   arms_v3 >= the MAXIMUM arms_v3 recorded for that invocation fingerprint
//   (a shrunken run never silently qualifies; an entry from an older parser is
//   re-read from its own log by the same grammar while that log exists, so
//   the history carries over #1194). Any mismatch -> run.
//   NEVER-SKIP: e2e.mjs and e2e-userboot.mjs (the smoke canary pair) always
//   run even on a full cache hit — they catch machine drift (shell/GL/OS)
//   that tree identity cannot. A skip prints its ledger CITATION (tree hash
//   + timestamp + log path): a skip is a proof reference, never silence.
//
// READINESS CANARY (GH-347 comment 2: load average is the WRONG axis — the
// build-16 bisect reproduced the flaky-arm cluster at load 12 and 71 alike;
// the decisive variable is CDP RTT under corp-agent storms): before the
// suite runs, a probe boot of the REAL app measures
//   (a) the GI-BOOT GAUGE — window.__gi.state.ready within 10 s (asset-I/O
//       drag; the hosted-regate evidence measured 3.5-14 s under storms
//       against healthy ~1-2 s), and
//   (b) CDP RTT — 5x Runtime.evaluate, run when p50 < 100 ms.
// Not calm -> poll every 30 s (never run hot) within OB_GATE_CALM_WAIT_MS
// (default 10 min), then exit 75 (EX_TEMPFAIL) honestly. The probe page
// STAYS ALIVE as the MID-RUN RTT BELT: p50 sampled every 30 s during the
// suite; a RED run that overlapped a storm sample (p50 >= 300 ms) is
// recorded as 'infra-storm', not 'red' — reclassification is a ledger
// verdict only (the child's exit code passes through untouched, and an
// infra entry never satisfies a skip).
//
// HOSTED FALLBACK (GH-347 comment 3, documented for storm-bound hosts): a
// GitHub-hosted macos regate is a viable storm fallback for FUNCTIONAL
// suites with two provisioning preconditions — the signed-python PATH shim
// (/usr/bin/python3; the brew/python.org 3.14 socket-filter tax silently
// blows the GH-248 15 s served-tree preflight) and the pinned
// chrome-headless-shell install (the GH-294 command). Known
// hosted-incompatible arms (no real GPU / VM cadence): e2e-aim GH-260 D
// RAF-delta, the e2e-aim fixed-sleep read family, e2e-drills arm-s2
// same-port relaunch. (e2e-playback 16m(n) capture-latch left this list
// with GH-423: its windows are counted in the tab's own rAF ticks, so VM
// cadence no longer reads the latch loop as dead.)
//
//   --selftest-ledger runs the FIVE skip-rule red-proofs (different tree /
//   stale / harness mismatch / lower arm count / non-green result must NOT
//   skip) plus the dirty-tree guard, the never-skip set and the qualifying
//   skip + citation — pure decision-function proofs on a fabricated ledger.
import { spawn, execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ciBands from './lib/ci-bands.mjs';
import { attemptsOf, countArms, ledgerArmFields, verdictLines } from './lib/verdict-grammar.mjs';
import {
  BAND_CDP_OFFSET, BAND_MIN_WIDTH, BAND_MUTEX_PORT, bandWidthForInventory, chromeShellPin,
  claimPortBand, deferSignalReaper, launchChrome, leasePortClaim,
  parsePortInventory, pendPortClaim, resolveChromeShell, sleep,
  spawnStaticServer, stopStaticServer, transferPortClaim,
} from './cdp.mjs';

const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_DIR = path.resolve(WEB_DIR, '..');
const LEDGER_DIR = process.env.OB_GATE_LEDGER_DIR
  ?? path.join(os.homedir(), '.openbilliards', 'gate-ledger');
const LEDGER_FILE = path.join(LEDGER_DIR, 'ledger.jsonl');
const CALM_WAIT_MS = (() => { // NaN would make the calm loop unbounded
  const v = Number(process.env.OB_GATE_CALM_WAIT_MS ?? 600000);
  return Number.isFinite(v) && v >= 0 ? v : 600000;
})();
const RTT_CALM_P50_MS = 100;   // comment-2 threshold: run when p50 < 100 ms
const RTT_STORM_P50_MS = 300;  // belt reclassification threshold
const GI_BOOT_BUDGET_MS = 10000; // the GI-boot gauge (asset-I/O drag)
const SKIP_MAX_AGE_MS = 24 * 3600 * 1000;
// the smoke canary pair ALWAYS runs — machine drift (shell/GL/OS) is
// invisible to tree identity (GH-347 design point 3) — and so do the
// MUTABLE-STATE gates (review r3+r4 P1): suites judging artifact
// directories, machine environment, remote CI state or repo hygiene can
// change verdict on an identical tree, so a banked green proves nothing
// tomorrow. Rather than enumerate them, cacheability is a POSITIVE
// allowlist: only the e2e-* battery suites may ever skip (cacheableSuite
// below); everything else — ci-lane-status, pages-artifact-gate,
// acceptance/ceremony checks, perf tools — always runs.
export const NEVER_SKIP = new Set(['e2e', 'e2e-userboot',
  'e2e-harness-hygiene',
  // GH-412 closure recommendation (folded in via GH-410): one of the two
  // suites outside every wave lane's local battery that let the #370
  // opening-state re-baseline reach a hosted-CI red — chrome-shell-cheap,
  // so it always runs like the smoke canaries.
  'e2e-touch-disciplines']);
/** Only tree-judging battery suites are ever skippable. */
export function cacheableSuite(base) {
  return typeof base === 'string' && /^e2e-/.test(base)
    && !NEVER_SKIP.has(base);
}

const sha256File = (p) => createHash('sha256')
  .update(fs.readFileSync(p)).digest('hex');

/** PATH host tools some battery suites shell out to (e2e-record/e2e-export
 * → ffmpeg/ffprobe): their identity rides the harness fingerprint (review
 * r7 P1 — a replaced or upgraded binary within 24 h must invalidate every
 * bank; conservative over-invalidation of non-video suites is the
 * zero-quality-reduction tiebreak). */
function hostToolId(tool) {
  try {
    const bin = execFileSync('/bin/sh', ['-c', `command -v ${tool}`],
      { encoding: 'utf8', timeout: 5000 }).trim();
    if (!bin) return 'absent';
    return fileId(fs.realpathSync(bin));
  } catch { return 'absent'; }
}
/** Content identity of one executable path (digest-backed). */
function fileId(real) {
  try {
    return `${real}:${sha256File(real).slice(0, 16)}`;
  } catch { return `${real}:unreadable`; }
}
/** The browser binary that ACTUALLY runs (review r9 P1: a CHROME_BIN
 * override replaced at the same path left shellPin unchanged). */
function browserId() {
  try { return fileId(fs.realpathSync(resolveChromeShell().bin)); }
  catch { return 'absent'; }
}

/** The harness identity a green is only valid under (design point 1). */
function harnessIdentity() {
  return {
    shellPin: chromeShellPin(),
    cdpHash: sha256File(path.join(WEB_DIR, 'tools', 'cdp.mjs')),
    node: process.version, // runtime identity (review r3 P1)
    browser: browserId(),        // the RESOLVED binary, digest-backed (r9 P1)
    python3: hostToolId('python3'), // serves every browser suite (r9 P1)
    ffmpeg: hostToolId('ffmpeg'),
    ffprobe: hostToolId('ffprobe'),
  };
}

// tracked capture PNGs the suites RE-SHOOT as normal output (the repo's
// gate-capture convention: e2e.mjs refreshes app-preview-*, userboot/
// combined shoot their screens). They are outputs, never fixtures — a
// diff here is a run byproduct, not tree divergence, and without this
// exclusion every wrapped e2e.mjs run would self-dirty at bank time and
// no canary could ever vouch.
// every tracked web-ROOT png is a re-shot capture by repo convention
// (fixtures live under web/tools/fixtures/ and subdirs, which stay dirty
// signals) — review r12 P2: enumerating suites undercounted
const CAPTURE_BYPRODUCT_RE = /^web\/[A-Za-z0-9._-]+\.png$/;

/** The machine BOOT this run happened in (review r11 P1: a canary green
 * from before a reboot/OS update proves nothing about the current machine
 * state — the 24 h window alone let stale smoke votes authorize skips). */
function bootId() {
  try {
    return execFileSync('sysctl', ['-n', 'kern.boottime'],
      { encoding: 'utf8', timeout: 5000 }).trim();
  } catch {
    // stable across invocations: the boot epoch rounded to 10 s absorbs
    // the sampling jitter of Date.now() - uptime (review r12 P2)
    return `boot-epoch-${Math.round((Date.now() - os.uptime() * 1000) / 10000)}`;
  }
}

/** The EXACT tree this run judges: HEAD^{tree} of this checkout, plus a
 * dirty flag — a working tree with porcelain output beyond the named
 * capture byproducts cannot be vouched for by its HEAD tree hash, so a
 * dirty run records honestly and never qualifies for a skip. */
function treeIdentity() {
  const git = (args) => execFileSync('git', args,
    { cwd: REPO_DIR, encoding: 'utf8' }).trim();
  // NOTE: the porcelain XY code can START with a space — parse each line
  // with the 2-char-code regex, never with a fixed offset over trimmed text
  const dirtyLines = execFileSync('git', ['status', '--porcelain'],
    { cwd: REPO_DIR, encoding: 'utf8' }).split('\n')
    .filter((l) => l.trim() !== '')
    .filter((l) => !CAPTURE_BYPRODUCT_RE.test(
      l.replace(/^.{2}\s+/, '').replace(/^"|"$/g, '')));
  return {
    tree: git(['rev-parse', 'HEAD^{tree}']),
    dirty: dirtyLines.length > 0,
  };
}

// The arm count and the failed arms' names come from ONE verdict grammar, lib/verdict-grammar.mjs (#1194):
// a line counts only at the verdict position, an e2e-retry log counts its final attempt, the wrapper's own
// 'E2E-RETRY:' narration never counts (GH-816), and only a suite summary's own '(N …' is a count — that summary is
// never one more arm, so '(0 arms)' reads 0.
// A suite file named in ARMS_REV (by its base name, suiteBase, so the rule follows the file under any --suite label)
// once printed a count-less summary after its OK lines, which read as one more arm, and now prints '(N arms)':
// e2e-practice since 2026-09-05, e2e-replays and e2e-settings-persist since the #1194 follow-up. For it no suite
// summary is an arm, so its old logs count as its new ones do, and its entries carry armsRev: one counted under another
// rule (no armsRev, or another) is re-read from its own log (withArmsV3) and is never compared as it stands
// (ledgerSkipDecision). A suite whose summary gains a count later joins this table in the same change.
export const ARMS_REV = Object.freeze({ 'e2e-practice': 1, 'e2e-replays': 1, 'e2e-settings-persist': 1 });
const armsRevOf = (base) => ARMS_REV[base] ?? 0;
const armOpts = (base) => (armsRevOf(base) ? { summaryArm: false } : {});

/** Read every ledger entry for `suite` (malformed lines are skipped —
 * append-only files on a crashing host can carry a torn tail). */
function ledgerEntries(suite) {
  let text = '';
  try { text = fs.readFileSync(LEDGER_FILE, 'utf8'); } catch { return []; }
  const out = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line);
      if (e.suite === suite) out.push(e);
    } catch { /* torn tail */ }
  }
  return out;
}

/** #1194: an entry recorded by an older parser (no arms_v3: main's arms, or the arms_v2 of #1194's first round, where
 * a count-bearing summary counted once more), or counted under another rule for its suite (armsRev: see ARMS_REV), is
 * re-read from its own log by the verdict grammar, while that log exists, so the arm history carries over the switch
 * and a stale count never blocks a fresh green; one whose log is gone keeps no comparable count and neither vouches
 * nor sets the maximum. Only the entries `keep` selects are read (the ones the decision can look at); `readLog` is the
 * seam the selftest fakes. */
export function withArmsV3(entries, keep = () => true, readLog = (p) => fs.readFileSync(p, 'utf8')) {
  return entries.map((e) => {
    const rev = armsRevOf(e.suiteBase ?? e.suite);
    if ((Number.isFinite(e.arms_v3) && (e.armsRev ?? 0) === rev) || !e.logPath || !keep(e)) return e;
    try { return { ...e, arms_v3: countArms(readLog(e.logPath), armOpts(e.suiteBase ?? e.suite)), armsRev: rev }; } catch { return e; }
  });
}

/** The GH-347 skip decision, pure and testable: returns the qualifying
 * entry or null. `entries` are this suite's ledger rows; `identity` is
 * { suite, suiteHash, tree, dirty, harness }; `now` in ms. */
export function ledgerSkipDecision(entries, identity, now = Date.now()) {
  // the cacheability check keys on the LABEL, the FILE and every .mjs in
  // the command (review GH-347 r1 P2 + r2 P2 + r4 P1: neither `--suite
  // smoke`, a node-option prefix, nor a non-battery gate may smuggle past
  // the law) — only e2e-* battery suites are ever skippable
  if (!cacheableSuite(identity.suite) || !cacheableSuite(identity.suiteBase)
    || identity.anyCanary === true) return null;
  if (identity.externalInputs === true) return null; // bytes outside the tree
  if (identity.dirty) return null; // the current tree cannot be vouched for
  // the arm maximum is scoped to THIS invocation fingerprint (review r8
  // P2: a bigger mode's count must not permanently block a smaller mode's
  // legitimate cache hits — each mode competes against its own history).
  // #1194: counts are compared within ONE grammar version only (arms_v3), and
  // for a suite in ARMS_REV within its rule (armsRev); an entry recorded by an
  // older parser (arms or arms_v2, no arms_v3) or under another rule neither
  // sets the maximum nor vouches
  const rev = armsRevOf(identity.suiteBase ?? identity.suite);
  const counted = (e) => Number.isFinite(e.arms_v3) && (e.armsRev ?? 0) === rev;
  const maxKnownArms = entries.filter((e) =>
    e.argsHash === identity.argsHash && e.envHash === identity.envHash)
    .reduce((m, e) => Math.max(m, counted(e) ? e.arms_v3 : 0), 0);
  // the NEWEST fully-matching completed entry decides (review r2 P1: an
  // older green must never outvote a newer red of the same fingerprint)
  const matching = entries.filter((e) => e.tree === identity.tree
    && e.suiteHash === identity.suiteHash
    && e.argsHash === identity.argsHash
    && e.envHash === identity.envHash
    && e.harness?.shellPin === identity.harness.shellPin
    && e.harness?.cdpHash === identity.harness.cdpHash
    && e.harness?.node === identity.harness.node
    && e.harness?.browser === identity.harness.browser
    && e.harness?.python3 === identity.harness.python3
    && e.harness?.ffmpeg === identity.harness.ffmpeg
    && e.harness?.ffprobe === identity.harness.ffprobe)
    .sort((a, b) => Date.parse(b.endedUTC ?? 0) - Date.parse(a.endedUTC ?? 0));
  const e = matching[0];
  if (!e) return null;
  if (e.result !== 'green') return null; // the newest verdict stands
  if (e.dirty) return null;              // recorded tree unvouched
  if (e.waived) return null;             // partial coverage never vouches
  if (e.externalInputs) return null;     // mutable out-of-tree inputs
  const age = now - Date.parse(e.endedUTC ?? 0);
  if (!(age >= 0 && age <= SKIP_MAX_AGE_MS)) return null; // stale (or clock lies)
  // a zero-arm green (an early exit 0 before any check line) is never
  // trusted evidence, even on a fresh ledger (review GH-347 r1 P1)
  if (!(counted(e) && e.arms_v3 >= Math.max(1, maxKnownArms))) return null;
  return e;
}

/** The smoke-canary vouch (review r9 P1): a cache hit is only honored when
 * BOTH always-run canaries hold a fresh green at the SAME tree + harness —
 * machine drift is otherwise invisible to a skip-only preflight. Pure and
 * selftested. */
export function canaryVouch(e2eEntries, userbootEntries, identity,
  now = Date.now()) {
  // per canary: the NEWEST same-tree/harness entry decides (review r10 P1 —
  // an older green must never outvote a newer red), and it must be a REAL
  // bare canary run: the right suite FILE, hermetic, with arms.
  const vouches = (entries, base) => {
    const matching = entries.filter((e) => e.tree === identity.tree
      && e.suiteBase === base
      // the COMPLETE harness + environment fingerprint (review r11 P1) —
      // a green under another Node/python/env never vouches
      && JSON.stringify(e.harness) === JSON.stringify(identity.harness)
      && e.envHash === identity.envHash)
      .sort((a, b) => Date.parse(b.endedUTC ?? 0) - Date.parse(a.endedUTC ?? 0));
    const e = matching[0];
    if (!e) return false;
    const age = now - Date.parse(e.endedUTC ?? 0);
    return e.result === 'green' && !e.dirty && !e.waived
      && e.externalInputs !== true
      // the CURRENT machine boot only (review r11 P1: reboots/OS updates
      // reset the smoke vote regardless of the 24 h window)
      && e.boot === identity.boot
      && Number.isFinite(e.arms_v3) && e.arms_v3 >= 1
      && age >= 0 && age <= SKIP_MAX_AGE_MS;
  };
  return vouches(e2eEntries, 'e2e') && vouches(userbootEntries, 'e2e-userboot');
}

function appendLedger(entry) {
  fs.mkdirSync(path.join(LEDGER_DIR, 'logs'), { recursive: true });
  fs.appendFileSync(LEDGER_FILE, `${JSON.stringify(entry)}\n`);
}

/** 5x Runtime.evaluate RTT p50 on a live probe client. */
async function rttP50(chrome) {
  const rtts = [];
  for (let i = 0; i < 5; i++) {
    const t0 = Date.now();
    await chrome.eval('1+1');
    rtts.push(Date.now() - t0);
    await sleep(100);
  }
  rtts.sort((a, b) => a - b);
  return rtts[2];
}

// ---- selftest: the five skip-rule red-proofs + guards -------------------------
function selftestLedger() {
  let failed = 0;
  const check = (name, ok) => {
    if (ok) console.log('[run-gate selftest] PASS', name);
    else { failed++; console.error('[run-gate selftest] FAIL', name); }
  };
  const now = Date.parse('2026-08-06T00:00:00Z');
  const harness = { shellPin: '151.0.7922.71', cdpHash: 'aaa111',
    browser: '/x/chrome:abc' };
  const identity = { suite: 'e2e-8ball', suiteBase: 'e2e-8ball',
    suiteHash: 'suite-hash-1', argsHash: 'args-1', envHash: 'env-1',
    boot: 'boot-1', anyCanary: false, tree: 'tree-hash-1', dirty: false,
    harness };
  const green = { suite: 'e2e-8ball', suiteHash: 'suite-hash-1',
    argsHash: 'args-1', envHash: 'env-1', tree: 'tree-hash-1', dirty: false,
    harness, arms_v3: 33, result: 'green', waived: false,
    endedUTC: new Date(now - 3600 * 1000).toISOString(),
    logPath: '/tmp/x.log' };
  check('a matching fresh green with full arms SKIPS (citation returned)',
    ledgerSkipDecision([green], identity, now) === green);
  // RED-PROOF 1: different tree hash must NOT skip
  check('red-proof 1: a different tree hash does NOT skip',
    ledgerSkipDecision([{ ...green, tree: 'tree-hash-2' }], identity, now) === null);
  // RED-PROOF 2: stale (>24 h) must NOT skip
  check('red-proof 2: a stale (>24 h) green does NOT skip',
    ledgerSkipDecision([{ ...green,
      endedUTC: new Date(now - 25 * 3600 * 1000).toISOString() }],
    identity, now) === null);
  // RED-PROOF 3: harness identity mismatch must NOT skip
  check('red-proof 3a: a chrome-shell pin mismatch does NOT skip',
    ledgerSkipDecision([{ ...green,
      harness: { ...harness, shellPin: '152.0.0.0' } }], identity, now) === null);
  check('red-proof 3b: a cdp.mjs hash mismatch does NOT skip',
    ledgerSkipDecision([{ ...green,
      harness: { ...harness, cdpHash: 'bbb222' } }], identity, now) === null);
  // RED-PROOF 4: tampered/lower arm count must NOT skip (a second entry
  // establishes the known count; the shrunken green may not qualify)
  check('red-proof 4: a green with FEWER arms than the known max does NOT skip',
    ledgerSkipDecision([{ ...green, arms_v3: 12 },
      { ...green, result: 'red', arms_v3: 33 }], identity, now) === null);
  // RED-PROOF 5: result != green must NOT skip
  check('red-proof 5: a red result does NOT skip',
    ledgerSkipDecision([{ ...green, result: 'red' }], identity, now) === null);
  check('red-proof 5b: an infra-storm result does NOT skip',
    ledgerSkipDecision([{ ...green, result: 'infra-storm' }], identity, now) === null);
  // guards beyond the five: dirty trees and the never-skip canaries
  check('guard: a DIRTY current tree never skips',
    ledgerSkipDecision([green], { ...identity, dirty: true }, now) === null);
  check('guard: a DIRTY recorded entry never satisfies',
    ledgerSkipDecision([{ ...green, dirty: true }], identity, now) === null);
  check('guard: the e2e smoke canary NEVER skips',
    ledgerSkipDecision([{ ...green, suite: 'e2e' }],
      { ...identity, suite: 'e2e' }, now) === null);
  check('guard: the e2e-userboot canary NEVER skips',
    ledgerSkipDecision([{ ...green, suite: 'e2e-userboot' }],
      { ...identity, suite: 'e2e-userboot' }, now) === null);
  check('guard: e2e-touch-disciplines NEVER skips (GH-412 — the suite '
    + 'outside every lane battery that let a semantic change reach CI red)',
  ledgerSkipDecision([{ ...green, suite: 'e2e-touch-disciplines' }],
    { ...identity, suite: 'e2e-touch-disciplines',
      suiteBase: 'e2e-touch-disciplines' }, now) === null);
  check('guard: a different INVOCATION (argsHash) does NOT skip',
    ledgerSkipDecision([{ ...green, argsHash: 'args-2' }], identity, now) === null);
  check('guard: a ZERO-arm green is never trusted evidence (fresh ledger)',
    ledgerSkipDecision([{ ...green, arms_v3: 0 }], identity, now) === null);
  check('guard: a relabeled canary file (--suite smoke over e2e.mjs) NEVER skips',
    ledgerSkipDecision([{ ...green, suite: 'smoke' }],
      { ...identity, suite: 'smoke', suiteBase: 'e2e' }, now) === null);
  check('guard: a different ENVIRONMENT (envHash) does NOT skip',
    ledgerSkipDecision([{ ...green, envHash: 'env-2' }], identity, now) === null);
  check('guard: a NEWER matching red outvotes an older green (newest wins)',
    ledgerSkipDecision([green, { ...green, result: 'red', arms_v3: 33,
      endedUTC: new Date(now - 600 * 1000).toISOString() }],
    identity, now) === null);
  check('guard: a WAIVED green (partial coverage) never vouches',
    ledgerSkipDecision([{ ...green, waived: true }], identity, now) === null);
  check('guard: a canary anywhere in the command NEVER skips',
    ledgerSkipDecision([green], { ...identity, anyCanary: true }, now) === null);
  check('guard: a NON-BATTERY gate (ci-lane-status / pages-artifact-gate) '
    + 'is never cacheable',
  ledgerSkipDecision([{ ...green, suite: 'ci-lane-status' }],
    { ...identity, suite: 'ci-lane-status', suiteBase: 'ci-lane-status' },
    now) === null
    && ledgerSkipDecision([{ ...green, suite: 'pages-artifact-gate' }],
      { ...identity, suite: 'pages-artifact-gate',
        suiteBase: 'pages-artifact-gate' }, now) === null);
  check('guard: a NON-HERMETIC invocation (extra args / out-of-repo suite) '
    + 'never skips — current or recorded',
    ledgerSkipDecision([green], { ...identity, externalInputs: true }, now)
      === null
    && ledgerSkipDecision([{ ...green, externalInputs: true }], identity, now)
      === null);
  check('guard: arm counting sees PASS and ok-line families',
    countArms('[hygiene] PASS x\nok: 22: zero console errors\nE2E PASS\nnoise')
      === 3);
  check('guard: the e2e-retry wrapper\'s own narration never counts as arms '
    + '(GH-816 review 885r1 P2: practice read 75 for 37, a bare PASS 3 for 1)',
    countArms('E2E-PRACTICE PASS (37 arms)\n'
      + 'E2E-RETRY: attempt 1 JUDGED-PASS rows=0 (completion line: E2E-PRACTICE PASS (37 arms))\n'
      + 'E2E-RETRY: verdict green — exit 0 on attempt 1 (JUDGED-PASS)') === 37
    && countArms('E2E-BARE PASS\n'
      + 'E2E-RETRY: attempt 1 JUDGED-PASS rows=0 (completion line: E2E-BARE PASS)\n'
      + 'E2E-RETRY: verdict green — exit 0 on attempt 1 (JUDGED-PASS)') === 1);
  check('guard: the arm maximum is scoped per invocation — a bigger mode '
    + 'never blocks a smaller mode\'s own green (review r8)',
  ledgerSkipDecision([
    { ...green, argsHash: 'args-2', envHash: 'env-1', arms_v3: 100 },
    { ...green, arms_v3: 5 },
  ], identity, now)?.arms_v3 === 5);
  check('guard: #1194 an entry recorded by the old parser (arms, no arms_v3) '
    + 'never vouches and never sets the arm maximum',
  ledgerSkipDecision([{ ...green, arms_v3: undefined, arms: 33 }], identity, now) === null
    && ledgerSkipDecision([{ ...green, arms_v3: undefined, arms: 100,
      endedUTC: new Date(Date.parse(green.endedUTC) - 3600e3).toISOString() },
      { ...green, arms_v3: 5 }], identity, now)?.arms_v3 === 5);
  check('guard: #1194 an old entry is re-read from its own log, so the arm '
    + 'history carries over: its 33 arms block a shrunken v3 green of 5',
  ledgerSkipDecision(withArmsV3([{ ...green, arms_v3: undefined, arms: 33, logPath: 'old.log',
    endedUTC: new Date(Date.parse(green.endedUTC) - 3600e3).toISOString() },
  { ...green, arms_v3: 5 }], () => true,
  (p) => (p === 'old.log' ? Array.from({ length: 33 }, (_, i) => `[x] PASS arm ${i}`).join('\n') : '')),
  identity, now) === null);
  check('guard: #1194 an entry banked by the first-round grammar (arms_v2, where '
    + '3 arm lines and \'(3 arms)\' counted 4) never blocks a fresh green\'s skip: '
    + 're-read from its own log it counts 3, and without that read it sets no '
    + 'maximum (review r3)',
  ledgerSkipDecision(withArmsV3([{ ...green, arms_v3: undefined, arms_v2: 4, logPath: 'v2.log',
    endedUTC: new Date(Date.parse(green.endedUTC) - 3600e3).toISOString() },
  { ...green, arms_v3: 3 }], () => true,
  (p) => (p === 'v2.log' ? 'P-A OK: a\nP-B OK: b\nP-C OK: c\nE2E-PRACTICE PASS (3 arms)' : '')),
  identity, now)?.arms_v3 === 3
    && ledgerSkipDecision([{ ...green, arms_v3: undefined, arms_v2: 4,
      endedUTC: new Date(Date.parse(green.endedUTC) - 3600e3).toISOString() },
    { ...green, arms_v3: 3 }], identity, now)?.arms_v3 === 3);
  // #1194 follow-up (review): e2e-replays printed a count-less summary after its
  // OK lines and now prints '(N arms)'; its greens before and after compare alike
  const rIdentity = { ...identity, suite: 'e2e-replays', suiteBase: 'e2e-replays' };
  const rOld = { ...green, suite: 'e2e-replays', arms_v3: undefined, logPath: 'replays-old.log',
    endedUTC: new Date(Date.parse(green.endedUTC) - 3600e3).toISOString() };
  const rNew = { ...green, suite: 'e2e-replays', arms_v3: 2, armsRev: ARMS_REV['e2e-replays'] };
  const rLogs = { 'replays-old.log': '0 OK: a\n1 OK: b\nE2E-REPLAYS: PASS',
    'replays-wide.log': '0 OK: a\n1 OK: b\n2 OK: c\n3 OK: d\n4 OK: e\nE2E-REPLAYS: PASS' };
  const rRead = (p) => { if (!(p in rLogs)) throw new Error('no log'); return rLogs[p]; };
  check('guard: #1194 follow-up a pre-change e2e-replays green (2 OK lines and '
    + 'a count-less summary) never blocks a post-change green at the same coverage '
    + '(\'(2 arms)\'): it skips whether the old entry was banked by main\'s parser, '
    + 'banked as arms_v3 3 before the suite rule, or lost its log (review)',
  [{ arms: 3 }, { arms_v3: 3 }, { arms_v3: 3, logPath: 'gone.log' }].every((was) =>
    ledgerSkipDecision(withArmsV3([{ ...rOld, ...was }, rNew], () => true, rRead), rIdentity, now)?.arms_v3 === 2)
    && ledgerSkipDecision([{ ...rOld, arms_v3: 3 }, rNew], rIdentity, now)?.arms_v3 === 2);
  const rWide = { ...rOld, arms_v3: 6, logPath: 'replays-wide.log' };
  check('guard: #1194 follow-up a pre-change e2e-replays green re-read from its '
    + 'log keeps its real count: 5 OK lines (banked as arms_v3 6) block a shrunken '
    + 'post-change green of 2 or 4, and a post-change green of 5 skips',
  [2, 4].every((n) => ledgerSkipDecision(withArmsV3([rWide, { ...rNew, arms_v3: n }], () => true, rRead),
    rIdentity, now) === null)
    && ledgerSkipDecision(withArmsV3([rWide, { ...rNew, arms_v3: 5 }], () => true, rRead),
      rIdentity, now)?.arms_v3 === 5);
  // the rule follows the suite FILE: a relabeled run (--suite) and e2e-practice
  rLogs['practice-old.log'] = 'P-A OK: a\nP-B OK: b\nE2E-PRACTICE PASS';
  const lId = { ...identity, suite: 'e2e-replays-full', suiteBase: 'e2e-replays' };
  const pId = { ...identity, suite: 'e2e-practice', suiteBase: 'e2e-practice' };
  check('guard: #1194 follow-up the rule follows the suite file: a relabeled '
    + 'e2e-replays run (--suite e2e-replays-full) and e2e-practice (whose summary '
    + 'gained its count on 2026-09-05) skip a post-change green over a pre-change '
    + 'one at the same coverage',
  ledgerSkipDecision(withArmsV3([{ ...rOld, suite: lId.suite, suiteBase: lId.suiteBase, arms: 3 },
    { ...rNew, suite: lId.suite, suiteBase: lId.suiteBase }], () => true, rRead), lId, now)?.arms_v3 === 2
    && ledgerSkipDecision(withArmsV3([{ ...rOld, suite: pId.suite, suiteBase: pId.suiteBase, arms: 3,
      logPath: 'practice-old.log' }, { ...rNew, suite: pId.suite, suiteBase: pId.suiteBase,
      armsRev: ARMS_REV['e2e-practice'] }], () => true, rRead), pId, now)?.arms_v3 === 2);
  check('guard: #1194 only a suite summary\'s own count is harvested — an arm '
    + 'line\'s detail number never is (tablecache read 770 for 33)',
  countArms('[e2e-tablecache] PASS C1 desktop snooker: cache hit == fresh build (222 meshes)\n'
    + 'E2E-TABLECACHE: ALL PASS') === 2);
  check('guard: #1194 a retried log counts its final attempt only',
  countArms('[x] PASS a\nE2E-X FAIL: b\nE2E-RETRY: attempt 1 JUDGED-FAIL rows=1 (completion line: E2E-X: FAILED)\n'
    + 'E2E-RETRY: attempt 1 JUDGED-FAIL — retrying once\n[x] PASS a\n[x] PASS b\nE2E-X: PASS\n'
    + 'E2E-RETRY: attempt 2 JUDGED-PASS rows=0 (completion line: E2E-X: PASS)') === 3);
  check('guard: a verdict line\'s numeric claim is harvested as the REAL '
    + 'arm inventory (review r6)',
  countArms('E2E-8BALL PASS (33 scenario blocks, T1-T17)') === 33
    && countArms('E2E-PLAYBACK PASS (795 ok-arms)') === 795);
  // #1194 r2 (review): a run whose arm filter matched nothing prints only its
  // count-bearing summary; that summary is its count, never one more arm
  const zeroArmLog = 'E2E-DRILLSESSION PASS (0 arms)\n'
    + 'E2E-RETRY: attempt 1 JUDGED-PASS rows=0 (completion line: E2E-DRILLSESSION PASS (0 arms))\n'
    + 'E2E-RETRY: verdict green — exit 0 on attempt 1 (JUDGED-PASS)';
  const zeroArm = { ...green, arms_v3: ledgerArmFields(zeroArmLog, 'green').arms_v3 };
  check('guard: #1194 a zero-arm run (\'E2E-DRILLSESSION PASS (0 arms)\') '
    + 'records arms_v3 0', zeroArm.arms_v3 === 0);
  check('guard: #1194 the zero-arm guard refuses that run\'s skip, also where '
    + 'only zero-arm runs share its fingerprint',
  ledgerSkipDecision([zeroArm], identity, now) === null
    && ledgerSkipDecision([zeroArm, { ...zeroArm,
      endedUTC: new Date(Date.parse(green.endedUTC) - 3600e3).toISOString() }],
    identity, now) === null);
  check('guard: #1194 a count-bearing summary is never one more arm: '
    + '20 arm lines and \'(20 arms)\' read 20, and that green skips',
  ledgerSkipDecision([{ ...green, arms_v3: ledgerArmFields(Array.from({ length: 20 },
    (_, i) => `D${i + 1} OK`).join('\n') + '\nE2E-DRILLSESSION PASS (20 arms)', 'green').arms_v3 }],
  identity, now)?.arms_v3 === 20);
  const canaryE2e = { result: 'green', dirty: false, waived: false,
    suiteBase: 'e2e', externalInputs: false, arms_v3: 4, envHash: 'env-1',
    boot: 'boot-1', tree: 'tree-hash-1', harness,
    endedUTC: new Date(now - 3600 * 1000).toISOString() };
  const canaryUb = { ...canaryE2e, suiteBase: 'e2e-userboot' };
  check('guard: a cache hit needs BOTH fresh same-tree canaries (review r9)',
    canaryVouch([canaryE2e], [canaryUb], identity, now) === true
    && canaryVouch([], [canaryUb], identity, now) === false
    && canaryVouch([canaryE2e], [{ ...canaryUb, tree: 'tree-hash-2' }],
      identity, now) === false
    && canaryVouch([{ ...canaryE2e, harness: { ...harness,
      browser: '/x/chrome:zzz' } }], [canaryUb], identity, now) === false);
  check('guard: only a REAL bare canary run vouches — relabeled/non-hermetic'
    + '/zero-arm entries do not (review r10)',
  canaryVouch([{ ...canaryE2e, suiteBase: 'smoke' }], [canaryUb],
    identity, now) === false
    && canaryVouch([{ ...canaryE2e, externalInputs: true }], [canaryUb],
      identity, now) === false
    && canaryVouch([{ ...canaryE2e, arms_v3: 0 }], [canaryUb],
      identity, now) === false);
  check('guard: the NEWEST canary verdict decides — an older green never '
    + 'outvotes a newer red (review r10)',
  canaryVouch([canaryE2e, { ...canaryE2e, result: 'red',
    endedUTC: new Date(now - 600 * 1000).toISOString() }], [canaryUb],
  identity, now) === false);
  check('guard: a canary green from a PREVIOUS BOOT or another env/harness '
    + 'never vouches (review r11)',
  canaryVouch([{ ...canaryE2e, boot: 'boot-0' }], [canaryUb],
    identity, now) === false
    && canaryVouch([{ ...canaryE2e, envHash: 'env-2' }], [canaryUb],
      identity, now) === false
    && canaryVouch([{ ...canaryE2e, harness: { ...harness, node: 'v25' } }],
      [canaryUb], identity, now) === false);
  console.log(failed ? '[run-gate selftest] FAIL' : '[run-gate selftest] PASS');
  process.exit(failed ? 1 : 0);
}

// ---- --selftest-census: the wrapper's narration never counts as arms ----------
// GH-816 (review 885r1 P2). The ledger's arm count is harvested from the
// wrapped command's COMBINED output — the suite's lines plus the e2e-retry
// wrapper's own narration. This proof runs the REAL wrapper over every
// recorded PASS/FAIL fixture of the wrapped suites (the specimens the
// wrapper's own --selftest classifies: fixtures/e2e-retry/<suite>-{pass,fail}.log)
// plus a bare one-line PASS specimen, replaying each fixture as the suite's
// stdout with the exit status its verdict implies, and asserts per specimen:
//   (1) countArms(combined) === countArms(fixture) — the suite's own number;
//   (2) exactly one attempt ran (no retry doubled the suite's lines);
//   (3) every line the wrapper ADDED starts with 'E2E-RETRY:' or
//       'e2e-retry:' — the vocabulary invariant the exclusion relies on;
//   (4) sensitivity (PASS specimens): the same combined text with the
//       completion line repeated, unprefixed, inside the attempt reads one
//       more passing verdict (the reader sees such a line), while (4b) a
//       verdict-shaped line behind the wrapper's prefix ('E2E-RETRY-X PASS')
//       adds nothing (the prefix filter is live). The wrapper's real lines are
//       kept out twice over (#1194): by that prefix, and because none of them
//       holds a verdict word at the verdict position. A summary's own count is
//       taken once, as a maximum, never summed.
// The DIED / foreign / sibling controls are not specimens here: the wrapper
// may legitimately retry them (two real attempts, two real outputs).
// Plain node, no browser. Exits 1 on any failing row, naming it.
function selftestCensus() {
  const dir = path.join(WEB_DIR, 'tools', 'fixtures', 'e2e-retry');
  const wrapper = path.join(WEB_DIR, 'tools', 'e2e-retry.mjs');
  const replay = 'const fs = require("node:fs");'
    + ' process.stdout.write(fs.readFileSync(process.argv[1], "utf8"));'
    + ' process.exitCode = Number(process.argv[2]);';
  const specimens = fs.readdirSync(dir).sort()
    .map((f) => /^([a-z0-9-]+)-(pass|fail)\.log$/.exec(f))
    .filter(Boolean)
    .map((m) => ({ name: m[0], file: path.join(dir, m[0]), suite: m[1].toUpperCase(),
      exit: m[2] === 'pass' ? 0 : 1 }));
  const bareDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ob-run-gate-census-'));
  const bare = path.join(bareDir, 'bare-pass.log');
  fs.writeFileSync(bare, 'E2E-BARE PASS\n');
  specimens.push({ name: 'bare-pass.log (synthetic)', file: bare, suite: 'BARE', exit: 0 });
  const rows = [];
  let failed = 0;
  const check = (name, ok, detail) => { rows.push({ name, ok, detail }); if (!ok) failed += 1; };
  check('specimen inventory: five wrapped suites x both verdicts + bare',
    specimens.length >= 11, `${specimens.length} specimens`);
  for (const s of specimens) {
    const fixture = fs.readFileSync(s.file, 'utf8');
    const own = countArms(fixture);
    const r = spawnSync(process.execPath,
      [wrapper, '--suite', s.suite, '--', process.execPath, '-e', replay, s.file, String(s.exit)],
      { encoding: 'utf8' });
    const out = r.stdout ?? '';
    const err = r.stderr ?? '';
    const combined = `${out}${err}`;
    const attempts = (err.match(/^E2E-RETRY: attempt \d+ /gm) ?? []).length;
    const fixtureLines = new Set(fixture.split('\n'));
    const added = combined.split('\n').filter((l) => l.trim() && !fixtureLines.has(l));
    const foreign = added.filter((l) => !/^(E2E-RETRY:|e2e-retry:)/.test(l));
    const got = countArms(combined);
    const tag = `${s.name} [${s.suite}]`;
    check(`${tag}: wrapper exit mirrors the suite`, r.status === s.exit, `want ${s.exit} got ${r.status}`);
    check(`${tag}: one attempt`, attempts === 1, `attempt lines ${attempts}`);
    check(`${tag}: wrapper-added lines all prefixed`, foreign.length === 0, foreign.slice(0, 2).join(' | '));
    check(`${tag}: arms = the suite's own number`, got === own, `own ${own} combined ${got}`);
    if (s.exit === 0) {
      // the --intersect mode (#806) narrates a green pass too (its SUMMARY json quotes 'JUDGED-PASS'): the same rules
      const ri = spawnSync(process.execPath,
        [wrapper, '--intersect', '--suite', s.suite, '--', process.execPath, '-e', replay, s.file, String(s.exit)],
        { encoding: 'utf8' });
      const ci = `${ri.stdout ?? ''}${ri.stderr ?? ''}`;
      const addedI = ci.split('\n').filter((l) => l.trim() && !fixtureLines.has(l));
      check(`${tag} --intersect: one attempt, wrapper lines prefixed, arms = the suite's own number`,
        ri.status === 0 && (ri.stderr ?? '').match(/^E2E-RETRY: attempt \d+ /gm)?.length === 1
          && addedI.every((l) => /^(E2E-RETRY:|e2e-retry:)/.test(l)) && countArms(ci) === own,
        `rc ${ri.status} arms ${countArms(ci)} own ${own} unprefixed ${addedI.filter((l) => !/^(E2E-RETRY:|e2e-retry:)/.test(l)).slice(0, 1)}`);
      // sensitivity (#1194): the same verdict line, unprefixed and INSIDE the attempt, does count — so the equality
      // above is the exclusion's doing (the 'E2E-RETRY:' prefix and the attempt's end), not a reader blind to the line
      const completion = /^E2E-RETRY: attempt 1 \S+ rows=\d+ \(completion line: (.*)\)$/m.exec(err)?.[1];
      const planted = combined.replace(/^E2E-RETRY: attempt 1 /m, `${completion ?? '<no completion line>'}\nE2E-RETRY: attempt 1 `);
      const passLines = (text) => { const last = attemptsOf(text).length - 1; return verdictLines(text).filter((r) => r.attempt === last && r.v.kind === 'pass').length; };
      check(`${tag}: the same verdict line, unprefixed inside the attempt, is one more passing verdict`,
        completion !== undefined && passLines(planted) === passLines(combined) + 1 && countArms(planted) >= own,
        `passing verdicts ${passLines(combined)} -> ${passLines(planted)}; arms ${countArms(planted)} own ${own}`);
      const prefixed = combined.replace(/^E2E-RETRY: attempt 1 /m, 'E2E-RETRY-X PASS\nE2E-RETRY: attempt 1 ');
      check(`${tag}: a verdict-shaped line behind the wrapper prefix adds nothing (the prefix filter is live)`,
        passLines(prefixed) === passLines(combined) && countArms(prefixed) === own,
        `passing verdicts ${passLines(combined)} -> ${passLines(prefixed)}; arms ${countArms(prefixed)} own ${own}`);
    }
  }
  for (const r of rows) console.log(`${r.ok ? 'ok' : 'FAIL'}: ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
  console.log(`[run-gate census selftest] ${failed ? 'FAIL' : 'PASS'} (${rows.length - failed}/${rows.length} rows)`);
  process.exit(failed ? 1 : 0);
}

// ---- argv ---------------------------------------------------------------------
const argv = process.argv.slice(2);
if (argv.includes('--selftest-ledger')) selftestLedger();
if (argv.includes('--selftest-census')) selftestCensus();
let band = null;
let ciTable = null; // the GH-687 table, loaded only on the --band path outside CI
let laneTable = null; // the declared lane bands (plan + legacy rows)
let declared = null; // every declared band: the boundary law's list
let suiteArg = null;
let skipIfGreen = false;
let noCanary = false;
let noBelt = false;
let deadlineArg = null; // GH-1140: --deadline <s>, validated after the loop
const rest = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--band') {
    const m = /^(\d+)-(\d+)$/.exec(argv[i + 1] ?? '');
    if (!m) {
      console.error('run-gate: --band needs start-end (e.g. 9300-9329)');
      process.exit(2);
    }
    band = { start: Number(m[1]), end: Number(m[2]) };
    // validate the ASSIGNED range here (review GH-410 r5 P2): the widening
    // path derives candidates from it before any claimPortBand check runs,
    // so a reversed/out-of-range band must be refused at the argv seam —
    // exactly the refusal claimPortBand gave it pre-410.
    if (band.start > band.end || band.start < 1024 || band.end > 65535) {
      console.error(`run-gate: --band ${argv[i + 1]} is not a valid range `
        + '(need 1024 <= start <= end <= 65535)');
      process.exit(2);
    }
    // GH-687: a band inside the CI reserved range is refused at the seam
    // unless this process IS a CI job (GITHUB_ACTIONS=true) or the operator
    // says so (OB_CI_BANDS=1) — the message names the job whose band it is.
    // Same class as a malformed band (exit 2): waiting would never help, and
    // no widening can slide a local lane into the range (the candidate loop
    // below skips such candidates by the same rule). claimPortBand repeats
    // the check as the choke point; this is the early, named refusal. The
    // table is loaded lazily and only here (a bare `run-gate -- cmd` never
    // touches it; a CI job never loads it).
    // the seam block runs whenever this is not a CI runner (review r9 refuter: OB_CI_BANDS=1
    // used to skip the width check and the boundary law too, while the widening and pin
    // sites still applied them — one env, three disagreeing sites); ciBandRefusal itself
    // waives the CI-range rule under OB_CI_BANDS=1, nothing else is waived
    if (process.env.GITHUB_ACTIONS !== 'true') {
      let table = ciTable;
      if (!table) {
        try { table = ciBands.loadCiBands(); } catch (e) {
          console.error(`run-gate: cannot read the CI band table (${e.message}) — refusing `
            + 'the band claim rather than skipping the GH-687 check');
          process.exit(2);
        }
        ciTable = table;
        try { laneTable = ciBands.loadLaneBands(ciBands.LANE_BANDS_FILE, table); } catch (e) {
          console.error(`run-gate: cannot read the lane band table (${e.message}) — refusing `
            + 'the band claim rather than skipping the boundary law');
          process.exit(2);
        }
        declared = ciBands.declaredBands(table, laneTable);
      }
      // owner ruling 2026-09-07 (review r6 P1): a band narrower than the layout
      // minimum cannot be claimed at all (claimPortBand refuses < 30) and used
      // to be silently WIDENED into a neighbour — refuse it here, by name
      const width = band.end - band.start + 1;
      if (width < BAND_MIN_WIDTH) {
        const home = ciBands.bandHome(declared, band.start, band.end);
        const planRow = home?.lane ? laneTable.bands.find((r) => r.lane === home.lane && !r.legacy) : null;
        console.error(`run-gate: --band ${band.start}-${band.end} is ${width} wide — the lane layout needs `
          + `>= ${BAND_MIN_WIDTH} (an http half + a CDP half). web/tools/lane-bands.json declares 30-wide `
          + 'plan bands per lane'
          + (home?.lane ? `; this band lies in the ${home.lane} lane's ${home.legacy ? 'legacy ' : ''}band ${ciBands.bandStr(home.range)}`
            + (planRow ? ` — use the lane's plan band ${planRow.band}` : '') : '')
          + ' (GH-687)');
        process.exit(2);
      }
      // the CI-range refusal first (it names the job whose band it is; it waives
      // itself under GITHUB_ACTIONS=true / OB_CI_BANDS=1), then the boundary law
      const msg = ciBands.ciBandRefusal(table, band.start, band.end, process.env);
      if (msg) { console.error(`run-gate: ${msg}`); process.exit(2); }
      // review r9 P2-2: the SAME boundary predicate that judges every widening
      // candidate and every env pin (ciBands.bandBoundary) judges the
      // ASSIGNED band — a valid-width band spanning two lane rows (9400-9459)
      // or entering one from undeclared space (9380-9409) used to be claimed
      // directly because only the widening path asked
      const bMsg = ciBands.boundaryRefusal(declared, band.start, band.end, { what: `--band ${band.start}-${band.end}` });
      if (bMsg) { console.error(`run-gate: ${bMsg} (GH-687)`); process.exit(2); }
      // every pin key the table knows — OB_CDP_PORT included (review r1 P2:
      // scenario-render honours that exact pin and skips its own claim)
    }
    i++;
  } else if (argv[i] === '--suite') {
    suiteArg = argv[++i];
  } else if (argv[i] === '--skip-if-green') {
    skipIfGreen = true;
  } else if (argv[i] === '--no-canary') {
    noCanary = true;
  } else if (argv[i] === '--no-belt') {
    noBelt = true;
  } else if (argv[i] === '--deadline') {
    if (deadlineArg !== null) { // review P2: a repeated flag would silently take the last value
      console.error(`run-gate: --deadline given twice (${deadlineArg}, then ${argv[i + 1] ?? ''}) — refused: one deadline per run (GH-1140) — nothing was run`);
      process.exit(2);
    }
    deadlineArg = argv[++i] ?? '';
  } else if (rest.length === 0 && argv[i].startsWith('--deadline=')) {
    // the one-token form would otherwise become the child command (ENOENT, no deadline)
    console.error(`run-gate: ${argv[i]} refused: pass the deadline as two arguments, --deadline <s> (GH-1140) — nothing was run`);
    process.exit(2);
  } else if (argv[i] === '--' && rest.length === 0) {
    rest.push(...argv.slice(i + 1));
    break;
  } else {
    rest.push(argv[i]);
  }
}
if (!rest.length) {
  console.error('run-gate: no command given — usage: '
    + 'node web/tools/run-gate.mjs --band <start-end> [--suite id] '
    + '[--skip-if-green] [--deadline <s>] [--] <command…>');
  process.exit(2);
}
// GH-1140: the deadline in whole seconds, the flag over the env (an empty env value
// is unset); anything else is refused by name before a band is claimed or a suite runs
const DEADLINE_MAX_S = 86400;
const deadlineS = (() => {
  const envV = process.env.OB_RUN_GATE_DEADLINE_S ?? '';
  const [v, what] = deadlineArg !== null ? [deadlineArg, `--deadline ${deadlineArg}`] : [envV, `OB_RUN_GATE_DEADLINE_S=${envV}`];
  if (deadlineArg === null && envV === '') return null;
  if (!/^[1-9]\d{0,4}$/.test(v) || Number(v) > DEADLINE_MAX_S) {
    console.error(`run-gate: ${what} refused: the deadline is a whole number of seconds in 1-${DEADLINE_MAX_S}, digits only with no leading zero (GH-1140) — nothing was run`);
    process.exit(2);
  }
  return Number(v);
})();

// suite identity: the first .mjs in the command is the suite file
// suite detection: the LAST .mjs in the command is the entrypoint (review
// GH-347 r2 P2: `node --import setup.mjs suite.mjs` would otherwise
// misattribute to setup.mjs); the never-skip law additionally scans EVERY
// argument for a canary basename below.
const mjsArgs = rest.filter((a) => a.endsWith('.mjs'));
const suiteFile = mjsArgs.at(-1) ?? null;
const suite = suiteArg
  ?? (suiteFile ? path.basename(suiteFile, '.mjs') : path.basename(rest[0]));
const suiteHash = suiteFile ? sha256File(path.resolve(suiteFile)) : null;
// the INVOCATION is part of the fingerprint (review GH-347 r1 P1): a green
// `--inert` run must never vouch for a `--seam` run of the same file. The
// suite file itself is hashed by content above; everything else about the
// command line is normalized here.
const argsHash = createHash('sha256').update(JSON.stringify(
  rest.filter((a) => a !== suiteFile))).digest('hex');
// behavior-changing ENVIRONMENT is part of the fingerprint too (review r2
// P1: OB_PERF_BUDGET_SCALE=10 relaxes e2e-aim's RAF budget tenfold with an
// identical argv). Every OB_* knob counts EXCEPT the pure port/lane
// plumbing that cannot change an assertion; CHROME_BIN swaps the browser
// itself. Unknown future knobs are conservative by construction: they
// change the hash, so the entry simply never matches.
const ENV_PLUMBING = new Set([...Object.keys(ciBands.PIN_NAMES), // every pin name, from THE list (companion to #705)
  'OB_PORT_BANDS', 'OB_GATE_LEDGER_DIR', 'OB_GATE_CALM_WAIT_MS', 'OB_GATE_RTT_P50_MS', 'OB_GATE_RTT_FILE', 'OB_PACING_BASELINE',
  'OB_RUN_GATE_DEADLINE_S']); // GH-1140: a deadline cuts a run short (a red, never evidence) but changes no assertion
const envHash = createHash('sha256').update(JSON.stringify(
  Object.entries(process.env)
    .filter(([k]) => (k.startsWith('OB_') && !ENV_PLUMBING.has(k))
      || k.startsWith('NODE_') // NODE_OPTIONS etc. rewire the runtime (r3 P1)
      || k === 'CHROME_BIN')
    .sort(([a], [b]) => (a < b ? -1 : 1)))).digest('hex');
const anyCanaryInCommand = mjsArgs.some((a) =>
  NEVER_SKIP.has(path.basename(a, '.mjs')));
// cacheable evidence requires a HERMETIC invocation (review r4+r5 P1): the
// suite file must live INSIDE this repo (tree-covered) and the command may
// carry NO other arguments at all — any extra token (a /tmp corpus dir, a
// --url, a git ref, a flag that flips an arm set) is a mutable input the
// tree hash cannot vouch for. Non-hermetic runs record honestly and are
// never skip evidence. The ceremony battery convention is exactly the
// hermetic shape: `node web/tools/<suite>.mjs` bare.
const suiteInRepo = suiteFile ? (() => {
  try {
    return fs.realpathSync(path.resolve(suiteFile))
      .startsWith(REPO_DIR + path.sep);
  } catch { return false; }
})() : false;
// bare boolean flags (--inert, --seam, --audit …) are hermetic: they name
// a MODE, argsHash already separates the modes, and they carry no mutable
// bytes. Anything with a VALUE shape (paths, urls, refs, --k=v) is not
// (review r7 P2 — e2e-haptics has no bare invocation at all).
const extraArgs = rest.filter((a) => a !== suiteFile
  && a !== 'node' && a !== process.execPath
  && !/^--[a-z][a-z0-9-]*$/.test(a));
const externalInputs = !(suiteInRepo && extraArgs.length === 0);
const identity = { suite,
  suiteBase: suiteFile ? path.basename(suiteFile, '.mjs') : null,
  anyCanary: anyCanaryInCommand, externalInputs,
  suiteHash, argsHash, envHash, boot: bootId(), ...treeIdentity(),
  harness: harnessIdentity() };

// ---- skip decision (design points 2-4) -----------------------------------------
if (skipIfGreen) {
  if (!cacheableSuite(suite) || !cacheableSuite(identity.suiteBase)) {
    console.log(`[run-gate] ${suite} is not a cacheable battery suite `
      + '(never-skip canary / mutable-state gate) — running regardless of '
      + 'the ledger');
  } else if (suiteHash === null) {
    console.log('[run-gate] no .mjs suite file in the command — identity is '
      + 'incomplete, refusing to skip');
  } else {
    const sameMode = (e) => e.argsHash === identity.argsHash && e.envHash === identity.envHash;
    const sameTree = (e) => e.tree === identity.tree;
    const hit = ledgerSkipDecision(withArmsV3(ledgerEntries(suite), sameMode), identity);
    if (hit && !canaryVouch(withArmsV3(ledgerEntries('e2e'), sameTree),
      withArmsV3(ledgerEntries('e2e-userboot'), sameTree), identity)) {
      console.log('[run-gate] a qualifying green exists but the smoke '
        + 'canaries (e2e + e2e-userboot) hold no fresh green at THIS tree — '
        + 'run them first (machine-drift law); running this suite');
    } else if (hit) {
      console.log(`[run-gate] SKIP ${suite} — byte-provably redundant. `
        + `Citation: tree ${hit.tree.slice(0, 12)}… green at ${hit.endedUTC} `
        + `(${hit.arms_v3} arms), log ${hit.logPath}`);
      process.exit(0);
    }
    console.log(`[run-gate] no qualifying green for ${suite} at tree `
      + `${identity.tree.slice(0, 12)}…${identity.dirty ? ' (tree DIRTY)' : ''}`
      + ' — running');
  }
}

// SIGNAL LAW (review GH-347 r1+r2 P1/P2): the cdp.mjs server reaper would
// process.exit() in the SAME signal dispatch, preempting the child's close
// handler (ledger finalize) — so the reaper is DEFERRED to this wrapper,
// which forwards the signal, escalates a child that ignores it, and lets
// the close handler finalize the ledger and exit with 128+N.
deferSignalReaper();
let childRef = null;
let signalCount = 0;
let lastSignal = null; // GH-1082: the last COUNTED signal, { sig, at }
const SIGNAL_DEDUP_MS = 1000; // a same-name repeat inside this is one event delivered twice
let wrapperSignal = null; // the first signal FORCES a red verdict (r5 P1)
let deadlineHit = null; // GH-1140: { s, elapsedMs } once run-gate's own deadline fired
const sigTimers = []; // escalation timers — cancelled once the child closes
let childClosed = false;
// ---- GH-1082: the suite's whole process tree, never just the direct child -------
// A cancelled or timed-out CI job ended only the step's shell: run-gate, the
// suite and its Chrome lived on under launchd, and the suite's lease kept the
// band claimed, so the next job in that band was refused (exit 75). The suite
// now runs in its OWN process group (spawn detached). Every signal path ends
// that group, escalating to SIGKILL after the grace. The child's descendants
// that left the group (a detached static server) are snapshotted at the first
// signal and SIGKILLed by pid when their start time still matches. An
// interrupted run releases its band only once that tree is gone.
const GROUP_SPAWN = process.platform !== 'win32';
const TREE_GRACE_MS = 10000; // TERM → KILL (the pre-1082 child escalation window)
const TREE_REAP_MS = 5000;   // after the KILL: the bound to observe the tree gone
let treeSnap = [];           // [{ pid, lstart }] the child + its descendants at the first signal
const psTree = () => {
  try {
    return execFileSync('ps', ['-A', '-o', 'pid=,ppid=,pgid=,stat=,lstart='], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }) // -A: POSIX all (BSD ps + procps)
      .split('\n').map((l) => /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.*\S)/.exec(l)).filter(Boolean)
      .map((m) => ({ pid: Number(m[1]), ppid: Number(m[2]), pgid: Number(m[3]), stat: m[4], lstart: m[5] }));
  } catch { return null; }
};
const snapTree = () => {
  const rows = psTree();
  if (!rows || !childRef?.pid) return;
  const kids = new Map();
  for (const r of rows) { if (!kids.has(r.ppid)) kids.set(r.ppid, []); kids.get(r.ppid).push(r); }
  const root = rows.find((r) => r.pid === childRef.pid);
  const out = root ? [{ pid: root.pid, lstart: root.lstart }] : [];
  for (const q = [childRef.pid]; q.length;) {
    for (const r of kids.get(q.shift()) ?? []) { out.push({ pid: r.pid, lstart: r.lstart }); q.push(r.pid); }
  }
  treeSnap = out;
};
/** What is left of the suite tree: the child's process group plus the
 * snapshotted descendants still alive under the SAME start time (pid reuse
 * is never matched). A zombie is not left: it holds no socket, and a parent
 * that never reaps it (a subreaper or container keeping adopted zombies)
 * would otherwise get the band transferred to a corpse that kill(pid, 0)
 * still reads as live — cdp.mjs confirmExitSync's rule (review GH-1082 P2).
 * null = no ps verdict. */
const treeLeft = () => {
  const rows = psTree();
  if (!rows) return null;
  const left = new Map();
  if (GROUP_SPAWN && childRef?.pid) {
    for (const r of rows) if (r.pgid === childRef.pid && r.pid !== process.pid && !r.stat.startsWith('Z')) left.set(r.pid, r);
  }
  for (const s of treeSnap) {
    const r = rows.find((x) => x.pid === s.pid);
    if (r && r.lstart === s.lstart && !r.stat.startsWith('Z')) left.set(r.pid, r);
  }
  return [...left.values()];
};
const signalTree = (sig) => {
  if (!childRef?.pid) return;
  const left = treeLeft();
  let grouped = false;
  // the group is signalled only while it provably has members (or ps gave no
  // verdict over a child not yet closed) — a recycled pgid is never signalled
  if (GROUP_SPAWN && (left === null ? !childClosed : left.some((r) => r.pgid === childRef.pid))) {
    try { process.kill(-childRef.pid, sig); grouped = true; } catch { /* group gone */ }
  }
  if (!grouped && !childClosed) { try { childRef.kill(sig); } catch { /* raced */ } }
  // a TERM lets the suite tear its own detached children down; a KILL takes
  // the snapshotted descendants outside the group too
  if (sig === 'SIGKILL') {
    for (const r of left ?? []) {
      if (r.pgid !== childRef.pid) { try { process.kill(r.pid, 'SIGKILL'); } catch { /* raced */ } }
    }
  }
};
/** Wait for the tree to be gone, SIGKILL whatever outlives `graceMs`, and
 * return the survivors ([] = gone, null = no ps verdict). */
const reapTree = async (graceMs) => {
  let left = treeLeft();
  for (const until = Date.now() + graceMs; left?.length && Date.now() < until;) { await sleep(200); left = treeLeft(); }
  if (left?.length) {
    console.error(`[run-gate] GH-1082: ${left.length} process(es) of the suite tree outlived the grace — SIGKILL `
      + `pid(s) ${left.map((r) => r.pid).join(', ')}`);
    signalTree('SIGKILL');
    for (const until = Date.now() + TREE_REAP_MS; left?.length && Date.now() < until;) { await sleep(200); left = treeLeft(); }
  }
  return left;
};
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  // process.on, not once (review r3 P2): a second Ctrl-C during shutdown
  // must ESCALATE under our control, never fall to the default handler
  // (which would kill the wrapper before the ledger finalizes)
  process.on(sig, () => {
    // GH-1082: ONE event can arrive twice — a process-group signal reaches
    // this wrapper directly AND through a parent that forwards it (the
    // CI-window lease's `run`, GNU timeout). A same-name repeat inside
    // SIGNAL_DEDUP_MS is that one event, never the escalation; a later
    // repeat, or a different signal, still escalates to SIGKILL.
    const now = Date.now();
    if (lastSignal && lastSignal.sig === sig && now - lastSignal.at < SIGNAL_DEDUP_MS) return;
    lastSignal = { sig, at: now };
    signalCount += 1;
    wrapperSignal = wrapperSignal ?? sig;
    if (!childRef) process.exit(128 + (os.constants.signals[sig] ?? 1));
    if (signalCount === 1) snapTree(); // GH-1082: before a dying child orphans its descendants
    signalTree(signalCount >= 2 ? 'SIGKILL' : sig); // GH-1082: the suite's whole group
    if (signalCount > 1) return; // timers below are already armed
    const t1 = setTimeout(() => {
      if (!childClosed) signalTree('SIGKILL');
    }, TREE_GRACE_MS);
    t1.unref?.();
    const t2 = setTimeout(() => {
      if (childClosed) return; // finalization owns the exit now (r6 P2)
      console.error('[run-gate] child ignored the signal AND SIGKILL — '
        + 'exiting without its close (the ledger entry for this run is lost)');
      // the band stays claimed under the SURVIVOR (review r12 P2: our exit
      // hook would free ports the child's Chrome/server may still own)
      releaseHoldsByChildState('signal last resort'); // leased holds go; an unleased one travels with the transferred dir
      try { if (claim) transferPortClaim(claim, childRef.pid); } catch { /* frees at exit */ }
      for (const x of extraClaims) { try { transferPortClaim(x, childRef.pid); } catch { /* frees at exit */ } } // second claims travel with the main one
      process.exit(deadlineHit ? 124 : 128 + (os.constants.signals[sig] ?? 1)); // GH-1140: a deadline keeps its code
    }, 20000);
    t2.unref?.();
    sigTimers.push(t1, t2);
  });
}
// ---- GH-1140: run-gate's own deadline ---------------------------------------------
// Counted from the process start (performance.now()), so the canary wait and the band
// claim count too: the runner's step clock covers them. Before the suite spawns there
// is no tree and nothing ran: run-gate exits 75 at once (the band is released by the
// exit hooks, as on any pre-spawn exit). After it, the deadline is the GH-1082 SIGTERM
// path, which ends the group, SIGKILLs it after the grace, snapshots and kills the
// descendants that left it, and releases the band only once the tree is gone. A run
// already ending (the child closed, or a real signal arrived first) is left to that path.
if (deadlineS !== null) {
  const dueMs = deadlineS * 1000;
  const fireDeadline = () => {
    if (childClosed || wrapperSignal) return;
    const now = performance.now();
    // Node keys timers on whole libuv milliseconds, so a callback can run a moment before
    // performance.now() reaches the deadline: re-arm for the rest, never fire early
    if (now < dueMs) { const again = setTimeout(fireDeadline, Math.ceil(dueMs - now) + 1); again.unref?.(); return; }
    deadlineHit = { s: deadlineS, elapsedMs: Math.round(now) };
    const line = `[run-gate] deadline ${deadlineS} s reached`;
    if (!childRef) {
      console.error(`${line} before the suite started — not run, exit 75 (GH-1140)`);
      process.exit(75);
    }
    console.error(`${line} — ending the suite tree (GH-1140)`);
    logStream.write(`${line} — ending the suite tree (GH-1140)\n`);
    process.emit('SIGTERM', 'SIGTERM');
  };
  const dt = setTimeout(fireDeadline, Math.max(0, Math.ceil(dueMs - performance.now())));
  dt.unref?.();
}

// ---- band claim (GH-338 + GH-410) -------------------------------------------------
// GH-410: the suite's DECLARED PORT INVENTORY (a static text export —
// parsePortInventory; a suite is never import()ed to ask it, importing one
// RUNS it) sizes the claim. A band narrower than the declared need is
// REFUSED and a widened band claimed instead — extended in place when the
// registry allows, slid to a neighboring range otherwise — so a suite's
// internal `CDP + i` derivations can never escape the lane's claim (the
// build-17 escape: e2e-playback's #305 growth to CDP+23 landed 9 ports
// outside its 30-wide band and died mid-suite on a foreign lane's claim).
// Suites with no declaration keep the exact pre-410 behavior.
let inventory = null;
// review r10 P2 ×2: the suite's PORT_FLAGS (the same one-line static export
// law) says what its numeric port-like flags MEAN — run-gate never guesses
// (`--port` used to be taken as the http pin although capture-034-play reads
// it as its CDP port; `--http-port` was no pin at all).
let portFlags = { flags: null, error: null };
let portOverrides = { overrides: {}, error: null };
if (suiteFile) {
  let suiteText;
  try {
    suiteText = fs.readFileSync(path.resolve(suiteFile), 'utf8');
    inventory = parsePortInventory(suiteText);
  } catch (e) {
    console.error(`run-gate: ${suiteFile}: ${e.message}`);
    process.exit(2);
  }
  portFlags = ciBands.portFlagsOfText(suiteText);
  // PORT_OVERRIDES (companion review r8 P2-1): which env name REPLACES a role's endpoint
  portOverrides = ciBands.portOverridesOf(suiteText);
  if (portOverrides.error) { console.error(`run-gate: ${suiteFile}: ${portOverrides.error} — fail-closed (GH-725)`); process.exit(2); }
}

// GH-687 (review r8 P2, r10 P2): every port-like PIN is validated on EVERY
// invocation, bandless included — env pins by NAME (OB_E2E_PORT widened by
// the http inventory, OB_E2E_CDP_PORT / OB_CDP_PORT by the cdp inventory),
// argv pins by the tool's DECLARATION (PORT_FLAGS: role → inventory), so a
// base 10 ports below the CI edge with a 27-slot inventory is refused too.
// GITHUB_ACTIONS=true waives the band/CI-range rules (the runner has no lane
// tables); OB_CI_BANDS=1 waives only the CI-range rule; NEITHER waives the
// declaration rule above. The tables load here once (lazily) and serve the
// --band seam below as well.
// every numeric port-like flag in the wrapped command must be DECLARED by the
// tool (review r10 P2: unknown flag = fail-closed, by name; a tool passed such
// a flag with no PORT_FLAGS at all is refused) — in EVERY context, CI included:
// this is about not guessing, not about which band is whose
const argvPins = ciBands.argvPortPins(rest, portFlags, inventory, { tool: suiteFile ? path.basename(suiteFile) : 'the wrapped command' });
if (argvPins.refusal) { console.error(`run-gate: ${argvPins.refusal}`); process.exit(2); }
if (process.env.GITHUB_ACTIONS !== 'true') {
  if (!ciTable) {
    try { ciTable = ciBands.loadCiBands(); laneTable = ciBands.loadLaneBands(ciBands.LANE_BANDS_FILE, ciTable); } catch (e) {
      console.error(`run-gate: cannot read the band tables (${e.message}) — refusing to run rather than skipping the GH-687 pin check`);
      process.exit(2);
    }
    declared = ciBands.declaredBands(ciTable, laneTable);
  }
  const assignedHome = band ? ciBands.bandHome(declared, band.start, band.end) : null;
  // env pins widen by ONE width source — PIN_NAMES (companion review r1 P2-1: a
  // layout name derives the suite inventory, a base name its model's span, an
  // exact name is never widened); argv pins arrive widened by their DECLARED role
  const widen = (pin) => {
    if (!pin.role || pin.role === 'band') return pin;
    const r = ciBands.pinExtentOf(pin, inventory);
    return r.end > r.start ? { ...pin, range: r, key: `${pin.key}(+${r.end - r.start})` } : pin;
  };
  // a layout env pin shadowed by a same-role declared CLI flag is not a pin at all (the tool never binds it)
  const liveEnvPins = ciBands.unshadowedEnvPins(ciBands.pinEnvEntries(process.env), argvPins.pins);
  for (const pin of [...liveEnvPins.map(widen), ...argvPins.pins]) {
    const msg = ciBands.pinRefusal(ciTable, laneTable, pin, { hasBand: band !== null, assignedHome, env: process.env });
    if (msg) { console.error(`run-gate: ${msg}`); process.exit(2); }
  }
}
let claim = null;
let activeOverridesTop = []; // the roles whose endpoint an override REPLACES (r8): the canary's reserved set uses them
const extraClaims = []; // second claims for far pins (companion to #705); reaped with this pid like the main claim
if (band) {
  const assigned = { ...band };
  const given = band.end - band.start + 1;
  const need = inventory ? bandWidthForInventory(inventory) : BAND_MIN_WIDTH;
  // EXPLICIT env pins constrain the claim (review GH-410 r1 P1 + r2 P1): a
  // pinned suite derives its whole inventory from the PIN, not from the
  // claim's layout — so every accepted claim must cover the pinned
  // derivation extents, WHATEVER the assigned band's width (r2: a wide
  // band with an escaping pin skipped the check entirely). Extents exist
  // only under a declared inventory — without one the derivation shape is
  // unknowable and behavior stays pre-410.
  // EVERY pin comes from THE list (companion to #705, review round 12 P2: the hull
  // read OB_E2E_CDP_PORT only, so a nested browser handed OB_CDP_PORT bound an
  // unclaimed port outside the claim): env pins by PIN_NAMES (role + whether the
  // name is one the layout exports), argv pins by the tool's PORT_FLAGS declaration.
  const allEnvPins = ciBands.pinEnvEntries(process.env);
  let envPins = ciBands.unshadowedEnvPins(allEnvPins, argvPins.pins).filter((p) => p.role === 'http' || p.role === 'cdp'); // a same-role CLI flag shadows the layout env pin (one pin, never two)
  let cliPins = argvPins.pins.filter((p) => p.role === 'http' || p.role === 'cdp');
  // AN OVERRIDE REPLACES THE DERIVED ENDPOINT OF ITS ROLE (companion review r8 P2-1):
  // for a role the suite declares in PORT_OVERRIDES, a set override env is THE
  // effective endpoint — precedence override > layout pin > derived default. Only
  // it is reserved and collision-checked (it becomes the role's layout-replacing
  // lead, sized by the inventory); the layout pin / flag of that role is replaced;
  // and because it REPLACES the endpoint (not an extra one), it must sit inside the
  // assigned band — outside, it is refused by name (never a second claim).
  const activeOverrides = [];
  for (const [role, envName] of Object.entries(portOverrides.overrides)) {
    const pin = allEnvPins.find((p) => p.key === envName);
    if (!pin) continue;
    if (pin.value < assigned.start || pin.value > assigned.end) {
      console.error(`run-gate: the ${role} role's effective endpoint is the declared override ${envName}=${pin.value} (PORT_OVERRIDES), `
        + `which lies outside the assigned band ${assigned.start}-${assigned.end} — a replacement endpoint must sit inside the claim; `
        + 'move the pin or the band (GH-725 review r8)');
      process.exit(2);
    }
    envPins = envPins.filter((p) => p !== pin && !(p.role === role && p.layout));
    cliPins = cliPins.filter((p) => p.role !== role);
    envPins.push({ ...pin, layout: true, override: true });
    activeOverrides.push({ role, envName, value: pin.value }); activeOverridesTop = activeOverrides;
    console.log(`[run-gate] ${role} role: the declared override ${envName}=${pin.value} REPLACES the layout endpoint (PORT_OVERRIDES) — only it is reserved for that role`);
  }
  // a BAND-role pin (OB_E2E_BAND_START/END: a band the tool claims itself) is one
  // claim per run — it must be THE assigned band, or it is refused (a second band
  // handed to the child with no claim is the same class)
  for (const p of allEnvPins.filter((x) => x.role === 'band')) {
    if (p.range.start !== assigned.start || p.range.end !== assigned.end) {
      console.error(`run-gate: env pin ${p.key}=${p.range.start}-${p.range.end} is a band the tool would claim itself, but the assigned band is `
        + `${assigned.start}-${assigned.end} — one claim per run: drop the pin or assign that band (companion to #705)`);
      process.exit(2);
    }
  }
  // THE extents function (shared with the table lint — one list, one sizing): the
  // LAYOUT pin of each role derives the inventory, an EXTRA pin its own width
  // (OB_CDP_PORT is honoured EXACTLY by scenario-render: 1 port — sizing it by the
  // suite's cdp inventory pushed the nightly job's hull past its CI band)
  const pinExtents = ciBands.pinExtentsFor(envPins, cliPins, inventory);
  if (!inventory) {
    // no inventory: nothing can size a second claim, so a listed pin OUTSIDE the
    // assigned band is REFUSED (the default) — never an unclaimed bind
    const outside = [...cliPins, ...envPins].filter((p) => p.value < assigned.start || p.value > assigned.end);
    if (outside.length) {
      console.error(`run-gate: ${outside.map((p) => `${p.key}=${p.value}`).join(', ')} lies outside the assigned band `
        + `${assigned.start}-${assigned.end} and ${suite} declares no PORT_INVENTORY to size a second claim for it — `
        + 'the tool (or a nested browser it hands the pin to) would bind an unclaimed port (review round 12 on #705). '
        + 'Declare the inventory (count the nested browser\'s slots) so run-gate can register the pin as a second claim, or move the pin into the band');
      process.exit(2);
    }
  }
  // NEAR pins are covered by the contiguous hull as before (GH-410 r7: a CLI --port
  // 100 below the band makes the claim cover it). A pin is FAR — registered as a
  // SECOND claim after the main one, never hull-widened and never an unclaimed
  // bind — when the hull it would force is not a claim at all: it crosses a
  // declared band boundary (the r6/r9 law; OB_CDP_PORT=8000 under 9430-9459
  // would span the maintainer row) or it exceeds 1024 ports.
  const homeForHull = declared ? ciBands.bandHome(declared, assigned.start, assigned.end) : null;
  const isFar = (p) => {
    const lo = Math.min(assigned.start, p.lo), hi = Math.max(assigned.end, p.hi);
    if (hi - lo + 1 > 1024) return true;
    return declared ? ciBands.boundaryRefusal(declared, lo, hi, { what: 'hull', home: homeForHull }) !== null : false;
  };
  const farPins = pinExtents.filter(isFar);
  const nearExtents = pinExtents.filter((p) => !isFar(p));
  // two pins whose derivation extents OVERLAP would put an HTTP server and
  // a Chrome endpoint on the same sockets whatever band is claimed (review
  // GH-410 r19 P2) — refuse before any claim work
  for (let i = 0; i < pinExtents.length; i++) {
    for (let j = i + 1; j < pinExtents.length; j++) {
      const a = pinExtents[i];
      const b = pinExtents[j];
      if (a.lo <= b.hi && b.lo <= a.hi) {
        console.error(`[run-gate] the explicit ${a.name} pin's derivations `
          + `${a.lo}-${a.hi} overlap the ${b.name} pin's ${b.lo}-${b.hi} — `
          + 'an HTTP endpoint and a Chrome CDP endpoint would share ports. '
          + 'Move or unset a pin (GH-410); EX_TEMPFAIL');
        process.exit(75);
      }
    }
  }
  const pinsUncovered = nearExtents.some((p) =>
    p.lo < assigned.start || p.hi > assigned.end);
  // the UNPINNED halves are derived from the claim's layout — they must
  // stay disjoint from every pinned extent (review GH-410 r3 P2: a CDP pin
  // sitting below the band lands exactly on a candidate's derived http(0),
  // binding HTTP and Chrome to one port). Returns the clash or null.
  const derivedPinClash = (start) => {
    if (!pinExtents.length) return null;
    const pinnedKinds = new Set(pinExtents.filter((p) => p.layout).map((p) => p.kind)); // only the LAYOUT pin replaces a derived half
    const derived = [];
    if (!pinnedKinds.has('http')) {
      derived.push({ what: `derived http ${start}-${start + inventory.http - 1}`,
        lo: start, hi: start + inventory.http - 1 });
    }
    if (!pinnedKinds.has('cdp')) {
      derived.push({ what: 'derived cdp '
        + `${start + BAND_CDP_OFFSET}-${start + BAND_CDP_OFFSET + inventory.cdp - 1}`,
      lo: start + BAND_CDP_OFFSET,
      hi: start + BAND_CDP_OFFSET + inventory.cdp - 1 });
    }
    for (const d of derived) {
      const p = pinExtents.find((p2) => d.lo <= p2.hi && p2.lo <= d.hi);
      if (p) {
        return `${d.what} collides with the explicit ${p.name} pin's `
          + `derivations ${p.lo}-${p.hi}`;
      }
    }
    return null;
  };
  if (inventory && (given < need || pinsUncovered)) {
    console.log(`[run-gate] ${suite} declares PORT_INVENTORY http `
      + `${inventory.http} + cdp ${inventory.cdp}${given < need
        ? ` — needs a band >= ${need} wide, and the assigned `
          + `${assigned.start}-${assigned.end} is only ${given}`
        : ` — the explicit port pins derive OUTSIDE the assigned `
          + `${assigned.start}-${assigned.end}`}. REFUSING the narrow claim `
      + 'and claiming a widened one (GH-410).');
    // candidates: with pins, the claim must cover the HULL of the assigned
    // start and every pinned extent (sliding away from a pin is never an
    // option), padded to the inventory width in either direction. Without
    // pins: keep as much of the assigned turf as possible — extend up,
    // extend down, then slide to adjacent ranges. Every candidate is
    // registry-arbitrated (claimPortBand refuses live foreign overlaps and
    // mutex-covering ranges), so neighbors are respected by the same law
    // as any claim — and the arbitration runs with the GH-483 lineage law
    // armed (lineageOverlap 'refuse'): a live claim reachable only through
    // an inherited OB_PORT_BANDS entry refused nothing here pre-483
    // (bandIsOwn read it as own turf), which is exactly how the build-18
    // widening escaped over the live neighbor claim (9330-9359 widened to
    // 9330-9369 over 9360-9389). A candidate intersecting ANY live claim
    // now SLIDES to free space; when every candidate is refused, the exit
    // is the loud EX_TEMPFAIL below — never a silent overlap.
    let cands;
    if (nearExtents.length) {
      const hullLo = Math.min(assigned.start, ...nearExtents.map((p) => p.lo));
      const hullHi = Math.max(...nearExtents.map((p) => p.hi));
      cands = [{ start: hullLo, end: Math.max(hullHi, hullLo + need - 1),
        how: 'pin hull, padded up' }];
      // DOWN-SHIFT family (review GH-410 r6 P2): the derived halves anchor
      // at the candidate START, so a derived extent landing on a pin is
      // cleared by moving start further down while the end stays anchored
      // at the pin hull's top (coverage never breaks). One-sided-pin
      // layouts (an http pin at the assigned start with the up extension
      // held) have a valid claim a few ports lower — shift until the
      // clash filter passes or the shift bound (one full width) is spent.
      for (let shift = 0; shift <= need; shift++) {
        const s = Math.min(hullLo, hullHi - need + 1) - shift;
        cands.push({ start: s, end: hullHi,
          how: shift ? `pin hull, padded down, shifted ${shift}`
            : 'pin hull, padded down' });
      }
      cands = cands.filter((c, i, a) => a.findIndex((o) =>
        o.start === c.start && o.end === c.end) === i);
    } else {
      cands = [
        { start: assigned.start, end: assigned.start + need - 1, how: 'extended up' },
        { start: assigned.end - need + 1, end: assigned.end, how: 'extended down' },
      ];
      // the slide family (GH-483: SLIDE to free space) — bounded but deep
      // enough to clear a crowded neighborhood on either side before the
      // honest refusal; every step stays registry-arbitrated.
      for (let k = 1; k <= 8; k++) {
        cands.push({ start: assigned.end + 1 + (k - 1) * need,
          end: assigned.end + k * need,
          how: k > 1 ? `slid up x${k}` : 'slid up' });
        cands.push({ start: assigned.start - k * need,
          end: assigned.start - 1 - (k - 1) * need,
          how: k > 1 ? `slid down x${k}` : 'slid down' });
      }
    }
    const refusals = [];
    let ciSkipped = 0; // GH-687 skips — when every candidate is one, exit 2 not 75
    const assignedHome = declared ? ciBands.bandHome(declared, assigned.start, assigned.end) : null;
    for (const c of cands) {
      if (c.start < 1024 || c.end > 65535) continue;
      // GH-687: widening never slides a local lane INTO the CI reserved
      // range (ciTable is null in CI context, where the rule is waived)
      const ciMsg = ciTable ? ciBands.ciBandRefusal(ciTable, c.start, c.end, process.env) : null;
      if (ciMsg) {
        ciSkipped += 1;
        refusals.push(`  ${c.start}-${c.end} (${c.how}): ${ciMsg.split(' — ')[0]} (GH-687)`);
        console.log(`[run-gate] widening skipped ${c.start}-${c.end} (${c.how}): `
          + `${ciMsg.split(' — ')[0]} — a local lane never widens into the CI range (GH-687)`);
        continue;
      }
      // the boundary law (owner ruling 2026-09-07, review r6 P1): a candidate
      // never crosses a declared band boundary — inside its home band it
      // stays inside; in undeclared space it enters no declared band
      const crossMsg = declared ? ciBands.crossingRefusal(declared, assignedHome, c.start, c.end) : null;
      if (crossMsg) {
        ciSkipped += 1;
        refusals.push(`  ${c.start}-${c.end} (${c.how}): ${crossMsg} (GH-687)`);
        console.log(`[run-gate] widening refused ${c.start}-${c.end} (${c.how}): ${crossMsg} (GH-687)`);
        continue;
      }
      // belt: no accepted candidate may abandon a pinned extent
      const uncovered = nearExtents.find((p) => p.lo < c.start || p.hi > c.end);
      if (uncovered) {
        refusals.push(`  ${c.start}-${c.end} (${c.how}): does not cover the `
          + `explicit ${uncovered.name} pin's derivations `
          + `${uncovered.lo}-${uncovered.hi} (GH-410)`);
        continue;
      }
      const clash = derivedPinClash(c.start);
      if (clash) {
        refusals.push(`  ${c.start}-${c.end} (${c.how}): ${clash} (GH-410)`);
        continue;
      }
      try {
        claim = await claimPortBand(c.start, c.end,
          { inventory, lineageOverlap: 'refuse' });
        band = { start: c.start, end: c.end };
        console.log(`[run-gate] claimed WIDENED port band ${c.start}-${c.end} `
          + `(${c.end - c.start + 1} wide, ${c.how} from the assigned `
          + `${assigned.start}-${assigned.end}) for the suite's lifetime `
          + `(${claim.dir}) — the inventory fits: `
          + `cdp(${inventory.cdp - 1}) = ${claim.cdp(inventory.cdp - 1)} `
          + `<= ${c.end} (GH-410)`);
        break;
      } catch (e) {
        // a wedged/unbindable REGISTRY MUTEX is registry-wide, not
        // candidate-specific (review r28 P2: retrying it across a 40-wide
        // inventory's whole shift family turned a 10 s diagnosis into
        // minutes) — abort the search with the honest cause
        if (/registry mutex/.test(e.message)) {
          console.error(`[run-gate] band search aborted: ${e.message.split('\n')[0]} `
            + '(GH-338/GH-410); EX_TEMPFAIL');
          process.exit(75);
        }
        refusals.push(`  ${c.start}-${c.end} (${c.how}): ${e.message.split('\n')[0]}`);
      }
    }
    if (!claim && ciSkipped > 0 && ciSkipped === refusals.length) {
      // every candidate was a GH-687 skip: a policy refusal, not contention
      console.error(`[run-gate] band ${assigned.start}-${assigned.end} cannot be widened for `
        + `${suite}'s declared inventory (needs ${need} wide) without crossing a declared band `
        + `boundary${assignedHome ? ` — it lies in ${assignedHome.name}` : ''}:\n${refusals.join('\n')}\n`
        + 'A 30-wide lane band hosts inventories up to cdp 15; assign a band that fits '
        + 'the inventory inside one declared band, or run the suite on its CI band under OB_CI_BANDS=1 (GH-687)');
      process.exit(2);
    }
    if (!claim) {
      console.error(`[run-gate] no widened band is claimable around the `
        + `assigned ${assigned.start}-${assigned.end} for ${suite}'s declared `
        + `inventory (needs ${need} wide) — the registry refused every `
        + `candidate:\n${refusals.join('\n')}\nFree a neighboring claim or `
        + 'assign a wider band'
        + (nearExtents.length ? ' (or move/unset the explicit '
          + `${nearExtents.map((p) => p.name).join('/')} pins)` : '')
        + ' (GH-410); EX_TEMPFAIL');
      process.exit(75);
    }
  } else {
    // refuses on live foreign overlap; with a declared inventory the layout
    // ALSO refuses a band it cannot host (GH-410 — never a silent escape).
    // Reaching here with pins means the assigned band COVERS them (the
    // pinsUncovered trigger above — review r2 P1); the derived unpinned
    // halves must still be disjoint from them (review r3 P2).
    const clash = derivedPinClash(band.start);
    if (clash) {
      console.error(`[run-gate] band ${band.start}-${band.end}: ${clash} — `
        + 'an HTTP endpoint and a Chrome CDP endpoint would share a port. '
        + 'Move or unset the pin (GH-410); EX_TEMPFAIL');
      process.exit(75);
    }
    // a refused assigned-band claim is an honest EX_TEMPFAIL, not a crash
    // (GH-483: the build-18 incident's victim lane died on an unhandled
    // throw when the escaped widened claim squatted its band — the verdict
    // belongs to the infra class, and the message must name the squatter)
    try {
      claim = await claimPortBand(band.start, band.end,
        { inventory, lineageOverlap: 'refuse' });
    } catch (e) {
      console.error(`[run-gate] cannot claim the assigned band `
        + `${band.start}-${band.end}: ${e.message.split('\n')[0]} — wait `
        + 'for or free the conflicting claim, or assign a disjoint band '
        + '(GH-338/GH-483); EX_TEMPFAIL');
      process.exit(75);
    }
    console.log(`[run-gate] claimed port band ${band.start}-${band.end} `
      + `(${claim.dir}) for the suite's lifetime`);
  }
  // SECOND claims for the far pins: the pin's derivation extent is registered in
  // the GH-338 registry under this lineage (the child inherits it through
  // OB_PORT_BANDS), so the nested browser's bind is a claimed bind; a refusal
  // here is contention, the honest EX_TEMPFAIL
  for (const p of farPins) {
    if (p.hi > 65535 || (p.lo <= BAND_MUTEX_PORT && BAND_MUTEX_PORT <= p.hi)) {
      console.error(`run-gate: the explicit ${p.name} pin's derivations ${p.lo}-${p.hi} can never be claimed `
        + `(${p.hi > 65535 ? 'above 65535' : `they cover the registry mutex port ${BAND_MUTEX_PORT}`}) — move or unset the pin (GH-338)`);
      process.exit(2);
    }
    try {
      const extra = await claimPortBand(p.lo, p.hi, { layout: false, lineageOverlap: 'refuse' });
      extraClaims.push(extra);
      console.log(`[run-gate] registered a SECOND claim ${p.lo}-${p.hi} for the explicit ${p.name} pin `
        + `(${p.kind}, ${p.hi - p.lo + 1} slot(s), ${extra.dir}) — the pin lies outside the assigned band, never an unclaimed bind`);
    } catch (e) {
      console.error(`[run-gate] cannot register the explicit ${p.name} pin's ${p.lo}-${p.hi} as a second claim: `
        + `${e.message.split('\n')[0]} — the tool would bind an unclaimed port; move or unset the pin (GH-338); EX_TEMPFAIL`);
      process.exit(75);
    }
  }
} else {
  console.log('[run-gate] NOTE: no --band given — running without a port-band '
    + 'claim (the lane is invisible to the GH-338 registry)');
}

const env = { ...process.env };
delete env.OB_RUN_GATE_DEADLINE_S; // GH-1140: this wrapper's clock, never a nested run-gate's
// a LAYOUT env pin shadowed by a same-role declared CLI flag FOLLOWS the flag into the
// child's env (companion review r2 P2-1): the hull covers the flag's value only, so a
// nested reader of the env name (e2e-cuepost → scenario-render, the #724 row-13 shape)
// must see that value — never the shadowed one, which it would bind UNCLAIMED. One pin
// in the hull, one pin in the env.
for (const { pin, flag } of ciBands.shadowedEnvPins(ciBands.pinEnvEntries(process.env), argvPins.pins)) {
  if (!flag || String(flag.value) === String(process.env[pin.key])) continue;
  console.log(`[run-gate] ${pin.key}=${process.env[pin.key]} is shadowed by the declared ${flag.key} ${flag.value} — the child's ${pin.key} follows the flag (one pin, never two)`);
  env[pin.key] = String(flag.value);
}
if (claim && env.OB_E2E_PORT === undefined) env.OB_E2E_PORT = String(claim.http(0));
if (claim && env.OB_E2E_CDP_PORT === undefined) env.OB_E2E_CDP_PORT = String(claim.cdp(0));

// ---- readiness canary + belt probe ----------------------------------------------
// probe ports: NEVER inside the suite's own inventory (review GH-347 r1 P1:
// e2e-playback launches on CDP+13, so no band slot is safely 'spare').
// The probe claims its own dedicated 2-port range through the GH-338
// registry — pid-scattered, retried on conflict, released with the run.
let probeClaim = null;
let probeHttp = null;
let probeCdp = null;
// ONE reserved-extents set for every allocator in this wrapper (companion review r7
// P2-2): the main band, the layout pins with the suite's inventory behind them (+40
// covers every documented internal derivation — +1/+2/+13, the venom/showcase
// +6..+29 families — review r11 P2), and EVERY extra claim this process holds. The
// canary used to check the band and the two layout pins only: a far pin's second
// claim was invisible to it, and layout:false let the registry accept the wrapper's
// own overlapping probe claim.
const effectiveLayoutPins = { http: env.OB_E2E_PORT, cdp: env.OB_E2E_CDP_PORT };
for (const o of (typeof activeOverridesTop !== 'undefined' ? activeOverridesTop : [])) effectiveLayoutPins[o.role] = o.value; // the override IS the role's endpoint (r8)
const reservedExtents = ciBands.reservedExtentsFor({ band, inventory,
  layoutPins: effectiveLayoutPins,
  extraClaims: extraClaims.map((x) => ({ start: x.start, end: x.end })) });
// TEST SEAM (hygiene arm 8l): the first probe candidate, honoured only under a
// NON-default registry (OB_PORT_BANDS_DIR) — inert in production.
const probeBaseSeam = process.env.OB_PORT_BANDS_DIR && /^\d{4,5}$/.test(process.env.OB_RUN_GATE_PROBE_BASE ?? '') ? Number(process.env.OB_RUN_GATE_PROBE_BASE) : null;
if (!noCanary) {
  for (let attempt = 0; attempt < 8 && probeClaim === null; attempt++) {
    const base = attempt === 0 && probeBaseSeam !== null ? probeBaseSeam : 46000 + (((process.pid % 640) + attempt * 83) % 640) * 2;
    if (!ciBands.allocatorCandidateAllowed(base, base + 1, reservedExtents)) {
      const hit = reservedExtents.find((e) => base <= e.end && e.start <= base + 1);
      console.log(`[run-gate] canary candidate ${base}-${base + 1} falls inside a reserved extent (${hit.why}) — skipped`);
      continue;
    }
    try {
      probeClaim = await claimPortBand(base, base + 1, { layout: false });
      probeHttp = base;
      probeCdp = base + 1;
      console.log(`[run-gate] canary probe range ${base}-${base + 1} claimed — outside every reserved extent (${reservedExtents.length}: ${reservedExtents.map((e) => `${e.start}-${e.end}`).join(', ')})`);
    } catch { /* a live claim holds it: scatter to the next candidate */ }
  }
  if (probeClaim === null) {
    console.error('run-gate: no free canary probe range in the 46000 block');
    process.exit(75);
  }
}
let probe = null; // { chrome, server }
let giBootMs = null;
let rttMs = null;
if (!noCanary) {
  const deadline = Date.now() + CALM_WAIT_MS;
  for (;;) {
    const server = spawnStaticServer(WEB_DIR, probeHttp);
    await sleep(700);
    let chrome = null;
    try {
      const t0 = Date.now();
      chrome = await launchChrome(
        `http://127.0.0.1:${probeHttp}/app.html?seed=1`, { port: probeCdp });
      // (a) GI-boot gauge: real boot → __gi.state.ready within budget
      let ready = false;
      while (!ready && Date.now() - t0 < 30000) {
        ready = (await chrome.eval('window.__gi?.state?.ready === true')) === true;
        if (!ready) await sleep(250);
      }
      giBootMs = ready ? Date.now() - t0 : Infinity;
      // (b) CDP RTT canary
      rttMs = await rttP50(chrome);
      if (ready && giBootMs <= GI_BOOT_BUDGET_MS && rttMs < RTT_CALM_P50_MS) {
        console.log(`[run-gate] calm: GI boot ${giBootMs} ms `
          + `(<= ${GI_BOOT_BUDGET_MS}), CDP RTT p50 ${rttMs} ms `
          + `(< ${RTT_CALM_P50_MS}) — the probe stays live as the mid-run belt`);
        probe = { chrome, server };
        break;
      }
      console.log(`[run-gate] NOT calm (GI boot ${giBootMs} ms, RTT p50 `
        + `${rttMs} ms) — polling until calm, never running hot`);
      // CONFIRMED teardown before the next iteration reuses the claimed
      // probe ports (review r3 P2: close() only signals)
      const gone = await (chrome.closeAndWait?.() ?? (chrome.close(), true));
      const serverGone = await stopStaticServer(server);
      chrome = null;
      if (gone === false || serverGone === false) {
        console.error('[run-gate] probe teardown UNCONFIRMED — refusing to '
          + 'reuse the probe ports (EX_TEMPFAIL)');
        process.exit(75);
      }
    } catch (e) {
      // deterministic setup failures carry their remedy and must FAIL FAST
      // (review r3 P2: a missing pinned shell throws the install command —
      // retrying it every 30 s for ten minutes buries the fix)
      if (/is not installed on this machine/.test(e.message)) {
        await stopStaticServer(server);
        throw e;
      }
      // a survivor Chrome still owns the claimed CDP port + profile —
      // retrying the same ports would attach to or wipe it (review r4 P2)
      if (e.chromeSurvived) {
        // the range stays claimed under the SURVIVOR'S lifetime, not ours
        // (review r9 P2: our exit reaper would free it while the Chrome
        // still owns the port + profile)
        try {
          if (e.chromePid) transferPortClaim(probeClaim, e.chromePid);
          console.error('[run-gate] canary Chrome SURVIVED teardown — its '
            + 'probe claim now rides the survivor pid; EX_TEMPFAIL');
        } catch (te) {
          console.error(`[run-gate] survivor claim transfer failed `
            + `(${te.message}) — the claim frees at exit; EX_TEMPFAIL`);
        }
        await stopStaticServer(server);
        process.exit(75);
      }
      console.log(`[run-gate] canary boot failed (${e.message.split('\n')[0]})`
        + ' — retrying');
      if (chrome) {
        const gone = await (chrome.closeAndWait?.() ?? (chrome.close(), true));
        if (gone === false) {
          console.error('[run-gate] probe teardown UNCONFIRMED — refusing to '
            + 'reuse the probe ports (EX_TEMPFAIL)');
          await stopStaticServer(server);
          process.exit(75);
        }
      }
      await stopStaticServer(server);
    }
    if (Date.now() > deadline) {
      console.error(`[run-gate] host never calmed within ${CALM_WAIT_MS} ms `
        + `(last: GI boot ${giBootMs} ms, RTT p50 ${rttMs} ms) — refusing to `
        + 'run hot (EX_TEMPFAIL); consider the hosted-macos storm fallback '
        + '(header notes)');
      process.exit(75);
    }
    await sleep(30000);
  }
}

// ---- run the child, tee the log, sample the belt ---------------------------------
fs.mkdirSync(path.join(LEDGER_DIR, 'logs'), { recursive: true });
// GH-410: hand the canary's CDP-RTT verdict to the child — the suite's
// served-tree preflights (cdp.mjs stormRttP50) scale their attempt windows
// with the SAME axis the GH-347 machinery measures. The spawn-time p50
// rides the env; the belt below keeps the file fresh so mid-suite
// relaunches see a storm that arrives AFTER the calm launch.
const rttFile = path.join(LEDGER_DIR, 'logs', `rtt-${process.pid}.json`);
if (rttMs !== null) {
  env.OB_GATE_RTT_P50_MS = String(rttMs);
  try {
    fs.writeFileSync(rttFile, JSON.stringify({ p50: rttMs, at: Date.now() }));
    env.OB_GATE_RTT_FILE = rttFile;
  } catch { /* unwritable: the env snapshot still travels */ }
}
const startedUTC = new Date().toISOString();
const logPath = path.join(LEDGER_DIR, 'logs',
  `${suite}-${startedUTC.replace(/[:.]/g, '-')}-${process.pid}-`
  + `${Math.random().toString(36).slice(2, 8)}.log`);
// the log fd opens SYNCHRONOUSLY before the suite spawns (review r6 P2: an
// async open error after the spawn would crash the wrapper, release the
// band claim and leave the suite running untracked); a later write error
// voids the run as evidence rather than killing anything.
const logFd = fs.openSync(logPath, 'wx'); // exclusive: collisions throw (r9 P2)
const logStream = fs.createWriteStream(null, { fd: logFd });
let logBroken = false;
logStream.on('error', (e) => {
  if (!logBroken) {
    logBroken = true;
    console.error(`[run-gate] log write failed (${e.message}) — this run `
      + 'records as unvouchable evidence');
  }
});
const [head, ...args] = rest;
const cmd = head.endsWith('.mjs') ? process.execPath : head;
const cmdArgs = head.endsWith('.mjs') ? [path.resolve(head), ...args] : args;
// GH-389: a pending hold brackets the spawn (review r4 P1 — a SIGKILL
// landing between spawn() and the lease write would leave the claim
// holder-less under the live child; the bounded grace keeps it alive long
// enough for the child's own first-scan self-lease to adopt).
// Lease state is PER CLAIM (companion review r4 P2): the main claim and each
// second claim carry their own hold and their own leased flag. A hold is
// released early ONLY when ITS claim's lease provably published; an unleased
// claim keeps its hold armed (the 45 s grace — the child's first scan adopts
// the claim within it) until there is no child to bridge to (spawn error,
// close) or the wrapper's exit backstop. Before r4 one flag stood for all:
// a failed EXTRA-claim lease after a successful main lease still dropped
// every hold, and a wrapper crash before the child self-leased exposed the
// live extra range to a foreign claimant.
const claimRecords = [
  ...(claim ? [{ key: `${band.start}-${band.end}`, claim, hold: null, leased: false }] : []),
  ...extraClaims.map((x) => ({ key: `${x.start}-${x.end}`, claim: x, hold: null, leased: false })),
];
for (const r of claimRecords) { try { r.hold = pendPortClaim(r.claim); } catch { /* grace only */ } }
// ONE cleanup for EVERY hold on EVERY exit path (companion review r3 P2-2: the
// spawn-error path released the main claim's hold only, so a second claim's
// hold outlived a failed spawn and kept that claim dir — released:true — refusing
// an immediate retry for the whole 45 s grace). Idempotent (each handle latches);
// the 'exit' backstop covers an exception that skips every other path.
// `leasedOnly` is the post-lease call: only the claims whose lease published.
const releaseHolds = ({ leasedOnly = false } = {}) => {
  for (const r of claimRecords) {
    if (leasedOnly && !r.leased) continue;
    try { r.hold?.release(); } catch { /* dir raced away */ }
  }
};
// ONE owner of hold release, KEYED ON THE CHILD (companion review r6 P2-2): an
// unleased hold may be released only once the child is known closed (close /
// spawn error observed). The generic 'exit' listener defers to that state — a
// wrapper dying (uncaught exception, signal last resort) while the child lives
// RETAINS the unleased holds, logged by name, so a foreign claimant is refused
// the range until the child adopts it or the grace expires; it never opens the
// live range by releasing a hold the child has not replaced with a lease.
let spawnFailed = false;
const retainedHolds = () => claimRecords.filter((r) => r.hold && !r.leased).map((r) => r.key);
const releaseHoldsByChildState = (where) => {
  const childAlive = childRef !== null && !childClosed && !spawnFailed;
  if (!childAlive) { releaseHolds(); return; }
  releaseHolds({ leasedOnly: true });
  const kept = retainedHolds();
  if (kept.length) {
    console.error(`[run-gate] ${where} with the child (pid ${childRef.pid}) alive: pending hold(s) for ${kept.join(', ')} RETAINED `
      + '(unleased; the child\'s first registry scan adopts them or they expire with the 45 s grace) — never released over a live child');
  }
};
process.once('exit', () => releaseHoldsByChildState('exit'));
// a wrapper exception must not free a live child's band: log it, force the
// verdict red, and let the child's close finalize the run (the child's stdio
// pipes keep the loop alive); with no live child, exit 70 (EX_SOFTWARE) at once.
let wrapperFault = null;
const onWrapperFault = (kind) => (e) => {
  if (wrapperFault) return; // one fault is the verdict; a second is noise
  wrapperFault = e instanceof Error ? e : new Error(String(e));
  console.error(`[run-gate] wrapper ${kind}: ${wrapperFault.stack ?? wrapperFault.message}`);
  if (childRef !== null && !childClosed && !spawnFailed) {
    console.error(`[run-gate] the child (pid ${childRef.pid}) is alive — finalizing on its close (verdict forced RED); `
      + (retainedHolds().length ? `pending hold(s) for ${retainedHolds().join(', ')} retained` : 'no unleased hold to retain'));
    return;
  }
  releaseHolds();
  process.exit(70);
};
process.on('uncaughtException', onWrapperFault('uncaught exception'));
process.on('unhandledRejection', onWrapperFault('unhandled rejection'));
// TEST SEAM (hygiene arm 8k (k2)): throw from the wrapper shortly after the spawn,
// honoured only under a NON-default registry (OB_PORT_BANDS_DIR) — inert in production.
const throwFault = process.env.OB_PORT_BANDS_DIR && process.env.OB_RUN_GATE_FAULT_THROW === 'after-spawn';
// TEST SEAM (hygiene arm 8i (i3)): fail the lease of ONE named claim key, honoured
// only under a NON-default registry (OB_PORT_BANDS_DIR) — inert in production.
const leaseFault = process.env.OB_PORT_BANDS_DIR && process.env.OB_RUN_GATE_FAULT_LEASE
  ? String(process.env.OB_RUN_GATE_FAULT_LEASE) : null;
// GH-1140 (review P2): the pre-spawn work is mostly synchronous (git, hashing, the registry), so the deadline's timer
// may not have had a turn; an expired deadline is checked here, synchronously, so nothing spawns past it
if (deadlineS !== null && performance.now() >= deadlineS * 1000) {
  console.error(`[run-gate] deadline ${deadlineS} s reached before the suite started — not run, exit 75 (GH-1140)`);
  process.exit(75);
}
const child = spawn(cmd, cmdArgs, { stdio: ['inherit', 'pipe', 'pipe'], env, detached: GROUP_SPAWN }); // GH-1082: own group
childRef = child; // known from the spawn on: the fault and signal handlers key on it (r6 P2-2)
// GH-1082: a CI cancel or timeout can end only the step's shell, and run-gate,
// reparented, is then never signalled. Under GitHub Actions (or with
// OB_RUN_GATE_PARENT_WATCH=1; =0 turns it off) a changed parent pid is
// handled as a SIGHUP: the suite's tree ends and the band is released.
// Off by default elsewhere: a local `(nohup node run-gate … &)` starts
// orphaned on purpose.
const parentWatch = process.env.OB_RUN_GATE_PARENT_WATCH === '1'
  || (process.env.OB_RUN_GATE_PARENT_WATCH !== '0' && process.env.GITHUB_ACTIONS === 'true');
if (parentWatch && child.pid) {
  const ppid0 = process.ppid;
  const watch = setInterval(() => {
    if (process.ppid === ppid0 || childClosed) return;
    clearInterval(watch);
    console.error(`[run-gate] GH-1082: the parent (pid ${ppid0}) is gone (now pid ${process.ppid}) — `
      + 'the job was cancelled or timed out: ending the suite tree as on SIGHUP');
    process.emit('SIGHUP', 'SIGHUP');
  }, 2000);
  watch.unref?.();
}
// GH-389: register the child as a HOLDER of the band claim right at spawn —
// the wrapper is itself a live holder at this instant, so no stale-reap can
// race the registration. If the wrapper is later SIGKILLed (no exit hooks),
// the claim now lives until the CHILD dies, instead of being reaped out
// from under it and handed to a foreign lane. Best-effort: on failure the
// child's own first registry scan self-leases (cdp.mjs lineage law).
if (child.pid) {
  const unleased = [];
  for (const r of claimRecords) {
    try {
      if (leaseFault === r.key) throw new Error('lease refused by OB_RUN_GATE_FAULT_LEASE (test seam)');
      leasePortClaim(r.claim, child.pid); r.leased = true;
    } catch (e) { unleased.push(`${r.key} (${e.message.split('\n')[0]})`); }
  }
  // a PARTIAL lease is reported by name, never silently continued (r4 P2): the
  // named claims ride their pending holds until the child's first scan adopts
  // them; a wrapper crash inside that window leaves those ranges REFUSED to a
  // foreign claimant (the hold is a holder), never exposed.
  if (unleased.length) {
    console.error(`[run-gate] lease NOT published for claim(s) ${unleased.join('; ')} — their pending holds stay armed `
      + '(45 s grace) until the child\'s first registry scan adopts them or the wrapper exits (GH-389)');
  }
}
// a hold is released only once ITS claim's lease PROVABLY published (review r5
// P1; per claim since r4); otherwise it stays armed and self-expires — within
// its grace the child's own first scan adopts the claim.
releaseHolds({ leasedOnly: true });
if (throwFault && child.pid) setTimeout(() => { throw new Error('injected wrapper exception after the spawn (OB_RUN_GATE_FAULT_THROW test seam)'); }, 1500);
child.on('error', (e) => {
  // ENOENT/EACCES spawn failures must still produce a RED ledger entry
  // (review r12 P2): route through the normal close finalizer. EVERY hold is
  // released here too (review GH-389 r10 P2; companion r3 P2-2 for the second
  // claims): there is no child to bridge to, and an armed hold would keep the
  // released claim refusing an immediate retry for the whole grace window.
  spawnFailed = true;
  releaseHolds();
  console.error(`[run-gate] child spawn failed: ${e.message}`);
  logStream.write(`[run-gate] child spawn failed: ${e.message}\n`);
  child.emit('close', 127, null);
});
child.stdout.on('data', (d) => { process.stdout.write(d); logStream.write(d); });
child.stderr.on('data', (d) => { process.stderr.write(d); logStream.write(d); });

const belt = [];
let beltTimer = null;
let beltInflight = null; // the ACTIVE sample must settle before the verdict
if (probe && !noBelt) {
  beltTimer = setInterval(() => {
    beltInflight = (async () => {
      try {
        const p50 = await rttP50(probe.chrome);
        belt.push({ t: new Date().toISOString(), p50 });
        // keep the child's storm view fresh (GH-410 — see rttFile above)
        try {
          fs.writeFileSync(rttFile, JSON.stringify({ p50, at: Date.now() }));
        } catch { /* stale file: readers age it out at 5 min */ }
        if (p50 >= RTT_STORM_P50_MS) {
          console.error(`[run-gate belt] STORM sample: CDP RTT p50 ${p50} ms `
            + '— a red from this window will be recorded as infra-storm');
        }
      } catch { /* probe died: belt simply stops sampling */ }
    })();
  }, 30000);
  beltTimer.unref?.();
}

// 'close' (not 'exit') finalizes the log: exit can precede stdio drain and
// a late PASS line would be missed by the arm count (review GH-347 r1 P2)
child.once('close', async (code, signal) => {
  childClosed = true;
  // the child is CLOSED — a spawn hold still armed (its lease never got a
  // birth-time verdict) has nothing left to bridge to, and would keep the
  // released claim refusing an immediate rerun for the grace window
  // (review GH-389 r11 P2) — every hold, through the one cleanup
  releaseHolds();
  for (const t of sigTimers) clearTimeout(t); // finalization owns the exit
  if (beltTimer) clearInterval(beltTimer);
  // GH-1082: an interrupted run releases its band only once the suite's tree
  // is gone (the group + the snapshotted descendants; SIGKILL after the grace).
  // A survivor keeps the band claimed under its own pid, never freed over it.
  if (wrapperSignal) {
    const left = await reapTree(TREE_GRACE_MS);
    if (left === null) {
      console.error('[run-gate] GH-1082: no ps verdict on the suite tree — the band is released on the child\'s close');
    } else if (left.length) {
      console.error(`[run-gate] GH-1082: the suite tree is NOT gone after SIGKILL (pid(s) ${left.map((r) => r.pid).join(', ')}) — `
        + `the band stays claimed under pid ${left[0].pid}`);
      try { if (claim) transferPortClaim(claim, left[0].pid); } catch { /* frees at exit */ }
      for (const x of extraClaims) { try { transferPortClaim(x, left[0].pid); } catch { /* frees at exit */ } }
    } else {
      console.error(`[run-gate] GH-1082: the suite tree is gone (group ${childRef.pid}, ${treeSnap.length} process(es) snapshotted) — `
        + 'the band is released at exit');
    }
  }
  // a CDP stall mid-sample IS the storm evidence — settle the in-flight
  // sample (bounded) before closing the probe and classifying (review r4
  // P2: discarding it recorded a storm-window red as a plain red). A
  // sample still hanging after the bound records as a stall sentinel.
  if (beltInflight) {
    const settled = await Promise.race([
      beltInflight.then(() => true),
      sleep(8000).then(() => false),
    ]).catch(() => true);
    if (settled === false) {
      belt.push({ t: new Date().toISOString(), p50: 99999, stalled: true });
    }
  }
  let probeGone = true;
  if (probe) {
    try {
      probeGone = (await (probe.chrome.closeAndWait?.()
        ?? (probe.chrome.close(), true))) !== false;
    } catch { probeGone = false; }
    if ((await stopStaticServer(probe.server)) === false) probeGone = false;
  }
  if (probeClaim && probeGone) {
    probeClaim.release();
  } else if (probeClaim) {
    // an unconfirmed endpoint may still own the ports — hold the claim to
    // process exit (the registry's dead-pid reap frees it then) rather
    // than handing the range to a successor over a live socket (r3 P2)
    console.error('[run-gate] probe teardown UNCONFIRMED — holding its port '
      + 'claim until process exit');
  }
  await new Promise((res) => logStream.end(res));
  try { fs.rmSync(rttFile, { force: true }); } catch { /* aged out anyway */ }
  // an interrupted run is NEVER green, even when the child handled the
  // forwarded signal and exited 0 (review r5 P1): the wrapper's own signal
  // state forces the conventional 128+N red.
  const sigForVerdict = signal ?? wrapperSignal;
  let exitCode = sigForVerdict
    ? 128 + (os.constants.signals[sigForVerdict] ?? 1)
    : (code ?? 1);
  if (deadlineHit) exitCode = 124; // GH-1140: the deadline's own code, whatever the child did after it
  if (wrapperFault && exitCode === 0) exitCode = 70; // a wrapper exception is a RED gate even over a green child (EX_SOFTWARE)
  // verdict: green on exit 0; a red that overlapped a storm belt sample is
  // an INFRA reclassification (ledger honesty — never a gate green)
  const stormHit = belt.some((b) => b.p50 >= RTT_STORM_P50_MS);
  // GH-1140: a deadline is red even over a storm sample — a hung suite is never excused as infrastructure
  const result = exitCode === 0 ? 'green' : (stormHit && !deadlineHit ? 'infra-storm' : 'red');
  let arms = 0;
  let failed = []; // GH-1082: the FAILED arms' names (ledger honesty for 0-arm reds); none for a green (#1194)
  let waived = false;
  try {
    const logText = fs.readFileSync(logPath, 'utf8');
    ({ arms_v3: arms, failArms_v3: failed } = ledgerArmFields(logText, result, armOpts(identity.suiteBase)));
    // a run that WAIVED or SKIPPED any arm (load waivers, capability
    // soft-skips, platform limitations) is partial coverage — recorded
    // honestly, never skip evidence (review GH-347 r2 P1 + r8 P1). The
    // match is deliberately broad: a false positive only costs a cache
    // hit, never quality.
    waived = /waiv|soft.?skip|\bskipp(?:ed|ing)?\b|\bSKIP\b/i.test(logText);
    if (logBroken) waived = true; // an incomplete log cannot vouch (r6 P2)
  } catch { /* none */ }
  // REVALIDATE the tree before banking (review GH-347 r1 P1): a checkout
  // that moved (or dirtied) under the canary wait or the run itself cannot
  // be vouched for by the identity captured at start — the entry records
  // dirty + treeMoved and never qualifies as skip evidence.
  let treeNow = null;
  try { treeNow = treeIdentity(); } catch { treeNow = { tree: 'unreadable', dirty: true }; }
  const treeMoved = treeNow.tree !== identity.tree
    || treeNow.dirty !== identity.dirty;
  if (treeMoved) {
    console.error('[run-gate] the tree MOVED under the run '
      + `(${identity.tree.slice(0, 12)}…${identity.dirty ? ' dirty' : ''} → `
      + `${treeNow.tree.slice(0, 12)}…${treeNow.dirty ? ' dirty' : ''}) — `
      + 'recording as unvouchable (never skip evidence)');
  }
  const entry = { ...identity, dirty: identity.dirty || treeMoved, treeMoved,
    waived, arms_v3: arms, failArms_v3: failed, ...(armsRevOf(identity.suiteBase) ? { armsRev: armsRevOf(identity.suiteBase) } : {}), result, exitCode, startedUTC,
    ...(deadlineHit ? { deadline: deadlineHit.s, deadlineElapsedMs: deadlineHit.elapsedMs } : {}), // GH-1140
    endedUTC: new Date().toISOString(), logPath,
    rttP50Ms: rttMs, giBootMs, belt, host: os.hostname() };
  try {
    appendLedger(entry);
    // GH-1082 named what a 0-arm red failed, GH-1140 a deadline's; #1210: every red that names a failure prints it next
    // to its count (lanes classify reds from this line), and a red that names none keeps the count form alone
    const failNote = failed.length
      ? `; FAIL: ${failed.slice(0, 3).join(' | ')}${failed.length > 3 ? ` (+${failed.length - 3} more)` : ''}` : '';
    const deadlineNote = deadlineHit ? `; DEADLINE ${deadlineHit.s} s at ${(deadlineHit.elapsedMs / 1000).toFixed(1)} s` : '';
    console.log(`[run-gate] ledger: ${suite} ${result} (${arms} arms${deadlineNote}${failNote}) at tree `
      + `${identity.tree.slice(0, 12)}…${identity.dirty ? ' DIRTY' : ''} → `
      + `${LEDGER_FILE}`);
  } catch (e) {
    console.error(`[run-gate] ledger append failed: ${e.message}`);
  }
  // a signal-killed child is a RED gate, never a 0 (review GH-338 r2 P1)
  process.exit(exitCode);
});
