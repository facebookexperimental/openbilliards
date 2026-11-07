// Copyright (c) Meta Platforms, Inc. and affiliates.

// Per-discipline kernel budget gate (constitution Principle V table; feature
// 012 T056 wires it as an asserting harness + CI job).
//
// Canonical-binary doctrine (P-III): budgets are measured on the COMMITTED
// canonical wasm at web/dist/pool-wasm — NOT a local rebuild. The gitignored
// nodejs pkg was observed to diverge event-wise from dist on chaotic shots
// (the internal app-perf record, feature 012 trunk entry), so this harness
// loads dist through the committed SDK loader, exactly like the app and the
// G-KERNEL corpus arm. Override with POOL_WASM_DIST=/path/to/pool_wasm.js.
//
// Workloads (constitution v1.3.0 Performance Budget — PER-SHOT rows re-based
// on the measured compliant-chain break cost with ~25-30% headroom, PER-FRAME
// rows strict and unchanged; measured bases in
// the internal break-flip proposal §3.2 and break-flip perceptual
// study §6, plus the app-perf record):
//   pool     15-ball break fixture                      p50 < 10 ms  (PER-SHOT)
//   snooker  22-ball break v0=8 (seeds 1,2,3,5)   worst p50 < 18 ms  (PER-SHOT)
//   snooker  any-shot ceiling (v0=12 slider-max break)  min < 20 ms  (PER-SHOT)
//   carom    3-ball power shot v0=7                     p50 < 1 ms   (PER-SHOT, unchanged)
//   typical  two-ball shot (001 SC-004)                 p50 < 1 ms   (PER-SHOT, unchanged)
//   sampler  whole-table sample_into, 22-ball record    < 50 us/call (PER-FRAME, strict)
//
// Statistics: p50 where the budget row says p50; the any-shot ceiling gates
// MIN (ambient host load only ever inflates a sample, so min is the honest
// load-robust estimate of the kernel's cost — budgets target a quiet
// 2020-class laptop). CI hosts are not the reference machine: the workflow
// sets OB_PERF_BUDGET_SCALE to widen every limit by that factor (default 1).
//
// Run:  node scripts/bench-wasm.mjs            # prints table, exit 1 on FAIL

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const distGlue =
  process.env.POOL_WASM_DIST ??
  path.join(root, "web", "dist", "pool-wasm", "pool_wasm.js");
const { init } = await import(
  path.join(root, "web", "dist", "pool-sdk", "engine.js")
);
const eng = await init(distGlue);
const SCALE = Number(process.env.OB_PERF_BUDGET_SCALE || "1");

const fixture = (name) =>
  readFileSync(
    path.join(root, "crates", "pool-wasm", "tests", "fixtures", name),
    "utf8",
  );

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
    `${label}: mean ${mean.toFixed(3)} ms, p50 ${p50.toFixed(3)} ms, ` +
      `min ${times[0].toFixed(3)} ms (n=${iters})`,
  );
  return { mean, p50, min: times[0] };
}

const simulate = (scenarioJson) => {
  const out = eng.simulateJson(scenarioJson);
  if (out.startsWith('{"error"')) throw new Error(out);
  return out;
};
const withV0 = (scenario, v0) =>
  JSON.stringify({ ...scenario, shot: { ...scenario.shot, v0 } });

console.log(`kernel_version: ${eng.version()} (canonical dist)`);

// ---- pool (constitutional workload) + 001 SC-004 typical shot
const breakScenario = fixture("break_scenario.json");
const twoBall = fixture("two_ball_scenario.json");
const pool = bench("pool 15-ball break", 100, 10, () => simulate(breakScenario));
const typical = bench("two-ball typical shot", 200, 20, () => simulate(twoBall));

// ---- snooker break-class: v0=8 smash across seeds (22 balls); the gate is
// the WORST per-seed p50 (sequential basis 9.5-10.8 ms, app-perf.md; the
// v1.3.0 budget is sized for the compliant class, 13.97-14.32 ms worst seed).
let snookerBreak = { p50: 0, seed: 0 };
for (const seed of [1, 2, 3, 5]) {
  const s = withV0(eng.snookerRack(seed), 8);
  const r = bench(`snooker break v0=8 seed ${seed}`, 30, 3, () => simulate(s));
  if (r.p50 > snookerBreak.p50) snookerBreak = { p50: r.p50, seed };
}

// ---- snooker any-shot ceiling: the worst measured shot class is the
// straight v0=12 slider-max break (176 events, sequential min 13.7 ms on the
// trunk record; compliant min 15.18-15.44 ms) — gate min < 20 ms.
const snookerMax = bench("snooker break v0=12 (any-shot ceiling)", 30, 3, () =>
  simulate(withV0(eng.snookerRack(1), 12)),
);

// ---- carom: 3 balls, pocketless, power shot
const carom = bench("carom power shot v0=7", 100, 10, () =>
  simulate(withV0(eng.caromStart(true), 7)),
);

// ---- feature 021 rail-hugger stress row (tasks T020; the maximal
// hop-event-count shot: CB frozen to a long rail via frozen_seat, θ=25°,
// v0=4, realistic preset, NoseContact default). Fixture generated by
// `cargo run -p pool-core --release --example rail_seat_scan --
// --dump-rail-hugger`; gated on the constitution v1.3.0 ANY-SHOT ceiling.
const railHugger = bench("rail-hugger stress θ=25° v0=4", 100, 10, () =>
  simulate(
    readFileSync(path.join(root, "scripts", "fixtures", "rail_hugger_scenario.json"), "utf8"),
  ),
);

// ---- whole-table sample_into on the 22-ball snooker record (worst-case
// per-frame batch: most balls in flight)
const snookerRecord = simulate(withV0(eng.snookerRack(1), 8));
const sampler = eng.sampler(snookerRecord);
const tEnd = JSON.parse(snookerRecord).events.at(-1).t;
let q = 0;
const sampleMs = bench("whole-table sample (22-ball, x1000)", 20, 2, () => {
  // 1000 queries per iteration for timer resolution.
  for (let i = 0; i < 1000; i++)
    q += sampler.sampleAt(((i % 100) / 100) * tEnd)[0];
}).p50;
console.log(`sample_into per call: ${(sampleMs * 1000 / 1000).toFixed(2)} us`);

// ---- budget table (constitution v1.3.0) ----
console.log(`--- per-discipline budgets (scale x${SCALE}) ---`);
let failed = 0;
const gate = (label, got, limit) => {
  const lim = limit * SCALE;
  const ok = got < lim;
  if (!ok) failed++;
  console.log(
    `${label}: ${got.toFixed(3)} ms vs ${lim} ms -> ${ok ? "PASS" : "FAIL"}`,
  );
};
gate("pool break p50 (< 10 ms)", pool.p50, 10);
gate("typical shot p50 (< 1 ms)", typical.p50, 1);
gate(
  `snooker break-class worst-seed p50, seed ${snookerBreak.seed} (< 18 ms)`,
  snookerBreak.p50,
  18,
);
gate("snooker any-shot min (< 20 ms)", snookerMax.min, 20);
gate("carom p50 (< 1 ms)", carom.p50, 1);
gate("rail-hugger stress min (< 20 ms any-shot ceiling)", railHugger.min, 20);
gate("sample_into per call (< 0.05 ms)", sampleMs / 1000, 0.05);
if (failed) {
  console.error(`${failed} budget gate(s) FAILED`);
  process.exit(1);
}
