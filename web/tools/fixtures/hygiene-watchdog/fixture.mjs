// fixture.mjs — one millisecond-scale suite shape driven through the hygiene watchdog (run by run-arms.mjs).
// Usage: node fixture.mjs <mode> <budgetMs> <stallMs> <ceilingMs> <stepMs>
//   modes: hang | stuck-sync | blocked-check | slow | ceiling | normal | sync-budget | sync-ceiling | sync-progress
//   OB_WD_MODULE=<path> drives another watchdog module with the same createWatchdog shape (the calibration copy).
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const [mode, budgetMs, stallMs, ceilingMs, stepMs] = [process.argv[2], ...process.argv.slice(3, 7).map(Number)];
const MOD = process.env.OB_WD_MODULE || new URL('../../lib/hygiene-watchdog.mjs', import.meta.url).pathname;
const { createWatchdog } = await import(pathToFileURL(MOD).href);
const T0 = Date.now();
// the verdict lines go to stdout with the check lines, so their order is the order they were printed in
const wd = createWatchdog({ budgetMs, stallMs, ceilingMs, tag: '[wd-fixture]', err: (s) => console.log(s) });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// a synchronous stretch that never yields to the event loop (no timer can fire inside it), without burning CPU
const blockUntil = (at) => { const ms = at - Date.now(); if (ms > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); };
// a pending handle, as a suite awaiting a socket or a child holds one (the watchdog's own timers are unref'd)
const hold = () => setInterval(() => {}, 1 << 30);
let k = 0;
// a check prints its line, then reports its progress (the suite's check() order)
const checkNow = (leg) => { const name = `${leg}: check ${++k}`; console.log(`[wd-fixture] CHECK ${name} +${Date.now() - T0}`); wd.progress(name, true); };
const step = async (leg) => { await sleep(stepMs); checkNow(leg); };
const stepsUntil = async (leg, at) => { while (Date.now() - T0 + stepMs < at) await step(leg); };

for (let i = 0; i < 3; i++) await step('lead');
if (mode === 'hang') {
  hold();
  await new Promise(() => {});
} else if (mode === 'stuck-sync') {
  // a stuck child bounded by its own per-call timeout, longer than the stall bound; then the suite yields
  spawnSync('sleep', ['60'], { timeout: stallMs * 2 });
  hold();
  await new Promise(() => {});
} else if (mode === 'blocked-check') {
  // the same block, but the next check completes before the timer gets a turn
  spawnSync('sleep', ['60'], { timeout: stallMs * 2 });
  wd.progress('after-block: check', true);
  hold();
  await new Promise(() => {});
} else if (mode === 'slow') {
  // progressing (a check every stepMs, under the stall bound) until past the budget, done before the ceiling
  while (Date.now() - T0 < budgetMs + 2 * stepMs) await step('slow-leg');
} else if (mode === 'ceiling') {
  hold();
  for (;;) await step('endless-leg');
} else if (mode === 'sync-budget') {
  // progressing, then one synchronous block (shorter than the stall bound) across the budget right before the end
  await stepsUntil('lead', budgetMs - 100);
  blockUntil(T0 + budgetMs + 100);
} else if (mode === 'sync-ceiling') {
  // the same across the ceiling (the budget timer has fired on the way)
  await stepsUntil('lead', ceilingMs - 100);
  blockUntil(T0 + ceilingMs + 100);
} else if (mode === 'sync-progress') {
  // synchronous checks (each block shorter than the stall bound) carry the run past the ceiling without a yield;
  // the run must stop at the first check past it, so no later check line and no END line
  hold();
  await stepsUntil('lead', ceilingMs - 300);
  for (let i = 0; i < 30; i++) { blockUntil(Date.now() + 200); checkNow('sync-leg'); }
  await step('after-sync');
} else if (mode !== 'normal') {
  console.error(`fixture: unknown mode ${mode}`);
  process.exit(2);
}
const r = wd.finish();
console.log(`[wd-fixture] END code ${r.code}`);
process.exit(r.code);
