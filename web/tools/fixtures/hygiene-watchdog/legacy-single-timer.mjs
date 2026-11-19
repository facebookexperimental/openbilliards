// legacy-single-timer.mjs — the calibration copy: the hygiene suite's single global watchdog as it stood before
// the stall/budget split, verbatim in behavior, wrapped in the createWatchdog shape so fixture.mjs can drive it.
// The arms must tell it apart from lib/hygiene-watchdog.mjs: under it a slow-but-progressing run reads
// "harness hung".
export function createWatchdog({ budgetMs, tag = '[hygiene]' }) {
  const t0 = Date.now();
  const watchdog = setTimeout(() => {
    console.error(`${tag} FAIL global watchdog (${budgetMs / 1000} s) — harness hung`);
    process.exit(1);
  }, budgetMs);
  watchdog.unref?.();
  return {
    progress() {},
    finish() { clearTimeout(watchdog); return { slow: false, code: 0 }; },
    stallDeadline: () => t0 + budgetMs,
    table: () => [],
    slow: false,
  };
}
