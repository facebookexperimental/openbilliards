// Copyright (c) Meta Platforms, Inc. and affiliates.

// bench-rules.mjs — the rules-adjudication perf gate (feature 013,
// conformance-gate.md §4; research R14; FR-008/SC-006): per-judgment
// latency measured against the COMMITTED web/dist/pool-rules artifact
// under node, reached through the SDK wrapper's `judgeRaw` hook (the
// bench-wasm.mjs P-V enforcement style applied to verdicts — never a
// local rebuild).
//
// Workloads:
//   gated  the break-class 22-ball snooker judge case with the HIGHEST
//          event count among snooker cases (the §4 worst-case record) —
//          budget p50 < 1 ms/judgment
//   gated  the global max-events judge case in the corpus (harvest fact:
//          an eightball break-class record carries even more events than
//          the snooker one) — same budget, extra SC-006 evidence
//   gated  feature 022 preset sweep (FR-014/SC-009): the worst-case judge
//          record of EACH frozen variant slice in
//          scripts/fixtures/rules-corpus-variants/ — the same
//          < 1 ms/judgment budget under both shipped presets
//   info   full-corpus sweep (every case kind once) — context only
//
// Inputs are pre-serialized once (the crate boundary is strings); the
// timed region is exactly the wasm judgment call. Budgets target a quiet
// 2020-class laptop (reference numbers: the internal app-perf record);
// CI widens by OB_PERF_BUDGET_SCALE (default 1).
//
// Run:  node scripts/bench-rules.mjs            # exit 1 on budget FAIL

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCALE = Number(process.env.OB_PERF_BUDGET_SCALE || '1');

// The committed SDK mirror resolves the committed artifact (backend.ts
// candidate 1: web/dist/pool-sdk/rules/ -> ../../pool-rules/).
const rules = await import(
  new URL(`file://${root}/web/dist/pool-sdk/rules/index.js`).href);
const { wasm } = await import(
  new URL(`file://${root}/web/dist/pool-sdk/rules/backend.js`).href);

const corpus = JSON.parse(readFileSync(
  path.join(root, 'scripts', 'fixtures', 'rules-corpus.json'), 'utf8'));

function bench(label, iters, warmup, fn) {
  for (let i = 0; i < warmup; i++) fn();
  const times = [];
  for (let i = 0; i < iters; i++) {
    const t0 = process.hrtime.bigint();
    fn();
    times.push(Number(process.hrtime.bigint() - t0) / 1e6); // ms
  }
  times.sort((a, b) => a - b);
  const mean = times.reduce((s, x) => s + x, 0) / times.length;
  const p50 = times[Math.floor(times.length / 2)];
  console.log(
    `${label}: mean ${mean.toFixed(4)} ms, p50 ${p50.toFixed(4)} ms, `
    + `min ${times[0].toFixed(4)} ms, max ${times.at(-1).toFixed(4)} ms `
    + `(n=${iters})`,
  );
  return { mean, p50, min: times[0], max: times.at(-1) };
}

console.log(`rules_version: ${wasm.rules_version()} (committed dist)`);

// ---- gated workloads: the worst-case records in the corpus ----
const j = (v) => JSON.stringify(v ?? null);
const maxEvents = (cases) => cases.reduce(
  (a, b) => (b.record.events.length > a.record.events.length ? b : a));
const judgeCases = corpus.cases.filter((c) => c.kind === 'judge');
const benchCase = (c) => {
  const [state, record, call] = [j(c.state), j(c.record), j(c.call)];
  console.log(`workload: ${c.id} (${c.record.events.length} events, `
    + `${record.length} record bytes)`);
  return bench(`judge ${c.id}`, 200, 20, () => {
    const bytes = rules.judgeRaw(c.ruleset, state, record, call);
    if (bytes !== c.expect) throw new Error(`byte divergence: ${bytes}`);
  });
};
const snooker = maxEvents(judgeCases.filter(
  (c) => c.ruleset === 'snooker-v1'));
const global = maxEvents(judgeCases);
const gated = [
  ['snooker break-class worst case', benchCase(snooker)],
  ...(global.id === snooker.id
    ? [] : [['global max-events case', benchCase(global)]]),
];

// ---- 022 preset sweep rows (FR-014/SC-009): per shipped preset, the
// max-events judge case of its frozen slice, adjudicated through the
// SAME committed artifact with the resolved config riding the state
// (config-in-state carriage) — a variant judgment must cost what a v1
// judgment costs, under BOTH presets.
const variantsDir = path.join(
  root, 'scripts', 'fixtures', 'rules-corpus-variants');
const slices = readdirSync(variantsDir)
  .filter((n) => n.endsWith('.json')).sort()
  .map((f) => JSON.parse(readFileSync(path.join(variantsDir, f), 'utf8')));
for (const slice of slices) {
  const worst = maxEvents(slice.cases.filter((c) => c.kind === 'judge'));
  gated.push([`preset ${slice.preset} worst case`, benchCase(worst)]);
}

// The v2 interpreter at break-class scale: the corpus's global
// max-events eightball record re-judged through eightball-v2 with the
// resolved wpa-8ball config riding the state. Expected bytes = the
// frozen v1 expect + the additive variant block spliced into `next`
// (the T007 fidelity-differential identity, contracts/registry-api.md
// §7) — proving the config-in-state machinery adds no per-judgment
// cost class at the worst-case workload.
if (global.ruleset === 'eightball-v1') {
  const wpaSlice = slices.find((s) => s.preset === 'wpa-8ball');
  const init = wpaSlice.cases.find(
    (c) => c.kind === 'initialState' && c.task_config !== undefined).expect;
  // GH-396 (the GH-371 state growth): v2 states carry the trailing
  // additive `kitchenBih` flag AFTER the variant block, so the old
  // slice-to-last-byte extraction grabbed `{…},"kitchenBih":true` and
  // died in JSON.parse. Parse the whole state instead (JS object-key
  // insertion order re-serializes the block byte-identically: the
  // domain is ints/strings/bools only). The expected v2 bytes are the
  // amended T007 identity: v1 expect + the variant block + the
  // kitchenBih flag spliced into `next` (false here — the max-events
  // record is a mid-rack stroke, not a kitchen grant).
  const variantBlock = JSON.stringify(JSON.parse(init).variant);
  gated.push(['eightball-v2 break-class worst case (wpa config)', benchCase({
    id: `${global.id} via eightball-v2`,
    ruleset: 'eightball-v2',
    state: { ...global.state, variant: JSON.parse(variantBlock) },
    record: global.record,
    call: global.call,
    expect: `${global.expect.slice(0, -2)},"variant":${variantBlock}`
      + ',"kitchenBih":false}}',
  })]);
}

// ---- info: full-corpus sweep, every case kind once per iteration ----
const prepared = corpus.cases.map((c) => ({
  kind: c.kind,
  ruleset: c.ruleset,
  breaker: c.breaker,
  state: j(c.state),
  record: j(c.record),
  call: j(c.call),
  decision: j(c.decision),
}));
const runCase = (p) => {
  switch (p.kind) {
    case 'initialState':
      return wasm.rules_initial_state_json(p.ruleset, p.breaker);
    case 'judge':
    case 'judge-error':
      return rules.judgeRaw(p.ruleset, p.state, p.record, p.call);
    case 'applyDecision':
    case 'applyDecision-error':
      return wasm.rules_apply_decision_json(p.ruleset, p.state, p.decision);
    case 'hudState':
      return wasm.rules_hud_state_json(p.ruleset, p.state);
    default:
      throw new Error(`unknown corpus case kind '${p.kind}'`);
  }
};
const sweep = bench('full corpus sweep (442 cases)', 20, 2, () => {
  for (const p of prepared) runCase(p);
});
console.log(`  per case (sweep p50 / cases): `
  + `${(sweep.p50 / prepared.length * 1000).toFixed(2)} us`);

// ---- budget gate (conformance-gate.md §4) ----
console.log(`--- rules adjudication budget (scale x${SCALE}) ---`);
const limit = 1 * SCALE;
let failed = 0;
for (const [label, r] of gated) {
  const ok = r.p50 < limit;
  if (!ok) failed++;
  console.log(`${label} p50 (< 1 ms): ${r.p50.toFixed(4)} ms vs `
    + `${limit} ms -> ${ok ? 'PASS' : 'FAIL'}`);
}
if (failed) {
  console.error(`${failed} rules adjudication budget gate(s) FAILED`);
  process.exit(1);
}
