// Copyright (c) Meta Platforms, Inc. and affiliates.

// ci-lane-status.mjs — hosted iOS-lane status probe for the release
// preflight (GH-270 visibility fix; release-ceremony step 2).
//
//   node ios/tools/ci-lane-status.mjs
//
// Queries the LATEST completed run of the `ios` workflow on main via the
// gh CLI and classifies it:
//
//   green        -> exit 0
//   accepted-red -> exit 0 with a loud warning: every failure signature in
//                   the run's failed-step log matches an entry in
//                   ios/tools/accepted-reds.json (an OPEN, owner-visible
//                   standing red — each entry carries its GH issue)
//   new-red      -> exit 1 (HALT the release ceremony): the lane is red
//                   with at least one signature no accepted entry covers
//
// Background (GH-270): the hosted simulator lane failed byte-identically on
// every main push for days while every merge gated locally — nobody
// watches the hosted lane. This probe makes a standing red impossible to
// miss at the one ceremony every ship passes through. It is deliberately
// NOT new CI infrastructure: a read-only gh query the preflight runs by
// hand (or any agent runs for the owner).
//
// accepted-reds.json schema: [{ "issue": 270, "match": "substring",
// "note": "..." }] — `match` is a plain substring tested against the
// failed-run log lines; keep entries FEW and delete them when the issue
// closes (an empty list [] is the healthy state).
//
// Exit codes: 0 = green/accepted-red; 1 = new-red; 2 = environment error
// (gh missing/unauthenticated, no runs found).

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ACCEPTED_PATH = path.join(HERE, 'accepted-reds.json');

const gh = (args, opts = {}) => {
  try {
    return execFileSync('gh', args, { encoding: 'utf8', ...opts });
  } catch (err) {
    if (opts.lenient) return err.stdout ?? '';
    console.error(`[ci-lane-status] gh ${args.join(' ')} failed: ${err.message}`);
    process.exit(2);
  }
};

const runs = JSON.parse(gh([
  'run', 'list', '--workflow', 'ios', '--branch', 'main', '-L', '1',
  '--status', 'completed',
  '--json', 'databaseId,conclusion,headSha,createdAt,displayTitle,url',
]));
if (!Array.isArray(runs) || runs.length === 0) {
  console.error('[ci-lane-status] no completed ios workflow runs on main — cannot classify');
  process.exit(2);
}
const run = runs[0];
console.log(`[ci-lane-status] latest ios run on main: ${run.url}`);
console.log(`[ci-lane-status]   head ${run.headSha.slice(0, 8)} (${run.createdAt}) — ${run.displayTitle}`);
console.log(`[ci-lane-status]   conclusion: ${run.conclusion}`);

// The workflow conclusion alone cannot prove the lane ran: with
// IOS_SIMULATOR_CI unset/disabled the simulator job is SKIPPED and the
// workflow still concludes 'success' on shellcore alone (review P2) — the
// exact silence this probe exists to end. Require the simulator job
// present and green before saying green.
const jobs = JSON.parse(gh(['run', 'view', String(run.databaseId),
  '--json', 'jobs', '--jq', '[.jobs[] | {name, conclusion}]']));
const sim = jobs.find((j) => j.name === 'simulator');
for (const j of jobs) {
  console.log(`[ci-lane-status]   job ${j.name}: ${j.conclusion}`);
}
if (!sim || sim.conclusion === 'skipped') {
  console.log('[ci-lane-status] VERDICT: new-red — the hosted simulator job '
    + 'did not run (skipped/missing; is IOS_SIMULATOR_CI still enabled?). '
    + 'An unexecuted lane is NOT green. HALT the release ceremony.');
  process.exit(1);
}
if (run.conclusion === 'success' && sim.conclusion === 'success') {
  console.log('[ci-lane-status] VERDICT: green');
  process.exit(0);
}

// red: pull the failed-step log and extract the failure signatures —
// xcodebuild test assertions, compiler/tool error lines, per-arm harness
// verdicts (E2E-* / ACCEPTANCE), and non-generic workflow annotations.
// GENERIC lines are excluded on both sides of the ledger (review R1 P1 +
// R2 P2): the `##[error]Process completed with exit code N` footer rides
// EVERY failed step, and the `[e2e-*] FAIL (N failing assertions|checks)`
// count-only summaries ride every failing harness — treating either as a
// signature makes accepted-red unreachable until an operator whitelists
// an issue-independent line, i.e. a rubber stamp. A red run whose log
// yields NO specific signature stays new-red by construction.
const log = gh(['run', 'view', String(run.databaseId), '--log-failed'],
  { lenient: true, maxBuffer: 64 * 1024 * 1024 });
const signatures = [...new Set(log.split('\n')
  .filter((l) => /: error: |error: -\[|XCTAssertTrue failed|\bE2E-[A-Z0-9-]+ FAIL|ACCEPTANCE FAIL|##\[error\]/.test(l))
  .map((l) => l.replace(/^.*?\dZ /, '').trim())
  .filter((l) => l
    && !/^##\[error\]Process completed with exit code/.test(l)
    && !/^\[[a-z0-9-]+\] FAIL \(\d+ failing (assertions|checks)\)$/.test(l)))];
console.log(`[ci-lane-status] failure signatures (${signatures.length}):`);
for (const s of signatures) console.log(`[ci-lane-status]   ${s}`);
if (signatures.length === 0) {
  console.log('[ci-lane-status] VERDICT: new-red — the run failed but no '
    + 'specific signature could be extracted (unknown failure shape). '
    + 'HALT the release ceremony and read the run log directly.');
  process.exit(1);
}

let accepted = [];
if (fs.existsSync(ACCEPTED_PATH)) {
  accepted = JSON.parse(fs.readFileSync(ACCEPTED_PATH, 'utf8'));
}
const uncovered = signatures.filter(
  (s) => !accepted.some((a) => a.match && s.includes(a.match)));

if (uncovered.length === 0) {
  console.log('[ci-lane-status] VERDICT: accepted-red — every signature matches '
    + `an accepted-reds.json entry (${accepted.map((a) => `GH-${a.issue}`).join(', ')}).`);
  console.log('[ci-lane-status] WARNING: shipping over a standing red. Confirm the '
    + 'linked issues are open and owner-visible.');
  process.exit(0);
}

console.log('[ci-lane-status] VERDICT: new-red — HALT the release ceremony.');
console.log('[ci-lane-status] Triage the run above; either fix the lane or (owner '
  + 'call) file a GH issue and record it in ios/tools/accepted-reds.json.');
process.exit(1);
