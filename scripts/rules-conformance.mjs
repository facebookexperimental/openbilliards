// Copyright (c) Meta Platforms, Inc. and affiliates.

// rules-conformance.mjs — the wasm/TS leg of the cross-surface rules
// conformance gate (feature 013, conformance-gate.md §3 step 3; migration
// gate M5): node + the COMMITTED web/dist/pool-rules artifact, reached
// through the SDK wrapper's `judgeRaw` hook (web/dist/pool-sdk mirror —
// never a local rebuild, P-III doctrine applied to rules).
//
//   node scripts/rules-conformance.mjs [--cases <corpus.json>]
//                                      [--ruleset <id>] [--out <f.jsonl>]
//
// Replays every corpus case (scripts/fixtures/rules-corpus.json, the
// frozen byte oracle; `--cases` points at a feature-022 per-preset
// variant slice instead) through the crate wasm surface and byte-compares
// each output line against the harvested `expect` (cmp-strength equality,
// NO normalization — "write it raw": bytes go to the .jsonl and into the
// comparison untouched, error payloads included). 022 slice cases
// carrying a preset id or a task-config envelope route initialState kinds
// through the artifact's preset_initial_state_json /
// task_initial_state_json exports (the FR-001 one-mechanism entry;
// registry-api.md §2). `--ruleset` filters to
// one ruleset's subset (per-port migration gate M5; rulesets not yet
// registered in the crate would fail with unknown-ruleset by design).
// `--out` additionally writes one byte-line per case in case order (the
// /tmp/judgments-ts.jsonl leg the T037 driver `cmp`s against the
// CLI and Python legs).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};
const rulesetFilter = flag('--ruleset');
const outPath = flag('--out');
const casesPath = flag('--cases')
  ?? path.join(root, 'scripts', 'fixtures', 'rules-corpus.json');

// The committed SDK mirror resolves the committed artifact (backend.ts
// candidate 1: web/dist/pool-sdk/rules/ -> ../../pool-rules/).
const rulesUrl = new URL(
  `file://${root}/web/dist/pool-sdk/rules/index.js`);
const rules = await import(rulesUrl.href);
const { wasm } = await import(
  new URL(`file://${root}/web/dist/pool-sdk/rules/backend.js`).href);

const corpus = JSON.parse(readFileSync(casesPath, 'utf8'));

const cases = corpus.cases.filter(
  (c) => rulesetFilter === undefined || c.ruleset === rulesetFilter);
if (cases.length === 0) {
  console.error(`rules-conformance: no corpus cases for ${rulesetFilter}`);
  process.exit(1);
}

const j = (v) => JSON.stringify(v ?? null);
const lines = [];
let failures = 0;
for (const c of cases) {
  let bytes;
  switch (c.kind) {
    case 'initialState':
    case 'initialState-error':
      // 022 slice routing (registry-api.md §2): preset id or task-config
      // envelope through the artifact's entry fns; error kinds ship the
      // structured payload bytes (SC-006). 013 corpus cases keep the
      // frozen per-ruleset path.
      bytes = c.preset !== undefined
        ? wasm.rules_preset_initial_state_json(c.preset, c.breaker ?? 1)
        : c.task_config !== undefined
          ? wasm.rules_task_initial_state_json(
              JSON.stringify(c.task_config), c.breaker ?? 1)
          : wasm.rules_initial_state_json(c.ruleset, c.breaker);
      break;
    case 'judge':
    case 'judge-error':
      bytes = rules.judgeRaw(c.ruleset, j(c.state), j(c.record), j(c.call));
      break;
    case 'applyDecision':
    case 'applyDecision-error':
      bytes = wasm.rules_apply_decision_json(
        c.ruleset, j(c.state), j(c.decision));
      break;
    case 'hudState':
      bytes = wasm.rules_hud_state_json(c.ruleset, j(c.state));
      break;
    default:
      console.error(`${c.id}: unknown corpus case kind '${c.kind}'`);
      process.exit(1);
  }
  lines.push(bytes);
  if (bytes !== c.expect) {
    failures += 1;
    console.error(`FAIL ${c.id}\n  crate:  ${bytes}\n  oracle: ${c.expect}`);
  }
}

if (outPath) writeFileSync(outPath, `${lines.join('\n')}\n`);

const scope = rulesetFilter ?? path.basename(casesPath, '.json');
if (failures > 0) {
  console.error(`rules-conformance (wasm leg, ${scope}): `
    + `${failures}/${cases.length} cases DIVERGED`);
  process.exit(1);
}
console.log(`rules-conformance (wasm leg, ${scope}): `
  + `${cases.length}/${cases.length} cases byte-identical `
  + `(rules ${wasm.rules_version()})`);
