// Copyright (c) Meta Platforms, Inc. and affiliates.

// ci-bands-lint.mjs — fail the workflow when a CI job's port band drifts
// from the committed table (GH-687).
//
//   node web/tools/ci-bands-lint.mjs            # exit 1 on any problem
//   node web/tools/ci-bands-lint.mjs --json     # machine-readable result
//   node web/tools/ci-bands-lint.mjs --table <file> --workflows-dir <dir>
//
// One source: web/tools/ci-bands.json. The rules live in lib/ci-bands.mjs
// (lintCiBands) so the hygiene gate can drive them with fixtures; this CLI
// only reads the committed files and reports. Every problem is named with
// its workflow, job and both values — never a count alone.
import { lintCommittedCiBands, bandStr } from './lib/ci-bands.mjs';

const argv = process.argv.slice(2);
const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const json = argv.includes('--json');

let result;
try {
  result = lintCommittedCiBands({
    ...(opt('--table') ? { tableFile: opt('--table') } : {}),
    ...(opt('--workflows-dir') ? { workflowsDir: opt('--workflows-dir') } : {}),
  });
} catch (e) {
  // a table that does not load is itself the loudest lint failure
  if (json) console.log(JSON.stringify({ ok: false, problems: [{ kind: 'table-invalid', detail: e.message }] }));
  else console.error(`CI-BANDS LINT FAIL: ${e.message}`);
  process.exit(1);
}

if (json) {
  console.log(JSON.stringify({ ok: result.ok, problems: result.problems, warnings: result.warnings ?? [],
    reserved: bandStr(result.table.reservedRange),
    rows: result.table.jobs.map((r) => ({ workflow: r.workflow, job: r.job, band: r.band, pins: r.pins })),
    scanned: result.scanned.map((f) => f.path) }));
} else {
  console.log(`ci-bands: reserved ${bandStr(result.table.reservedRange)}, `
    + `${result.table.jobs.length} job rows, workflows ${result.files.join(', ')}; `
    + `tool-default scan over ${result.scanned.length} files derived from git ls-files (harness importers / claimers / port-env readers)`
    + (result.laneBands ? `; lane bands: ${result.laneBands.bands.map((b) => `${b.lane} ${b.band}`).join(', ')}` : ''));
  for (const r of result.table.jobs) {
    console.log(`  ${r.workflow.padEnd(16)} ${r.job.padEnd(24)} ${r.band}  `
      + Object.entries(r.pins).map(([k, v]) => `${k}=${v}`).join(' '));
  }
  for (const w of result.warnings ?? []) console.error(`  WARN ${w.kind}: ${w.detail}`);
  for (const p of result.problems) console.error(`  PROBLEM ${p.kind}: ${p.detail}`);
  console.log(result.ok ? 'CI-BANDS LINT OK' : `CI-BANDS LINT FAIL: ${result.problems.length} problem(s)`);
}
process.exit(result.ok ? 0 : 1);
