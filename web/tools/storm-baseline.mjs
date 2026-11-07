// Copyright (c) Meta Platforms, Inc. and affiliates.

// storm-baseline.mjs — take the pre-run STORM BASELINE once per job (GH-691).
//
//   node web/tools/storm-baseline.mjs --github-env >> "$GITHUB_ENV"   # CI job step
//   node web/tools/storm-baseline.mjs                                 # JSON on stdout
//
// Run it as the first step after checkout, BEFORE the job's own load starts
// (no server, no browser, no build yet): it samples the runner at rest (12
// ps snapshots × 5 s by default — OB_PACING_BASELINE_SAMPLES / _GAP_MS) and
// writes OB_PACING_BASELINE into the job env, so every later step's suite
// derives its busy-CPU storm bar from that one rested window instead of
// re-sampling a box already carrying earlier steps' residue. The human
// line — the samples AND the resulting bar — goes to stderr, i.e. the job
// log, so the classifier's decision is auditable per run. A baseline
// already in the env is re-emitted verbatim (never re-sampled); an explicit
// OB_PACING_STORM_BUSYCPU or OB_PACING_GUARD=0 emits nothing (the bar is
// not derived in that run, and the line says so).
import { BASELINE_ENV, primeStormBaseline } from './lib/pacing.mjs';

const githubEnv = process.argv.includes('--github-env');
const baseline = await primeStormBaseline({ log: (line) => console.error(line) });
if (!baseline) {
  console.error('[storm-baseline] no baseline emitted (OB_PACING_GUARD=0 or an explicit '
    + 'OB_PACING_STORM_BUSYCPU is in force)');
  process.exit(0);
}
const json = process.env[BASELINE_ENV];
console.log(githubEnv ? `${BASELINE_ENV}=${json}` : json);
