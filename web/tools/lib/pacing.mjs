// Copyright (c) Meta Platforms, Inc. and affiliates.

// lib/pacing.mjs — the GH-425 storm discipline for frame-PACING arms.
//
// The pacing/perf arm class (RAF-delta p95 guards, frame budgets) measures
// FRAME PACING: a legitimate product gate on a quiet machine, a pure load
// meter under a multi-lane gate storm. GH-425 proved the class red BOX-WIDE
// on the self-hosted runner, tree-independent (10+ distinct trees,
// pristine-main back-to-back byte-identical p95s), while run-gate's GH-347
// CDP-RTT belt read CALM (p50 1-2 ms): Runtime.evaluate RTT watches the
// CONTROL PLANE, and a lane-stampede CPU storm starves the page's RAF
// cadence without touching it. So this helper extends the #347 LAW — a
// canary before the measurement, a belt around it, storm hits reclassified
// as INFRA, and a storm-skip that can never bank a green fingerprint — with
// a classifier that can actually see this storm class:
//
//   stormy  ⇔  control-plane CDP RTT p50 >= 300 ms   (the #347 belt bar:
//              corp-endpoint-agent storms — x2pagentd socket-filter taxes)
//           OR 1-min loadavg / cores >= 1.5          (the GH-313 precedent
//              e2e-aim's D arm already used: builder/render CPU storms —
//              the #425 window ran load 22-55 on 24 cores)
//           OR foreign HARNESS BROWSERS >= 3 (the lane-STAMPEDE axis:
//              browser ROOTS only — helpers' --type= rows never count —
//              identified by the pinned shell name OR the
//              /tmp/obw-e2e-profile marker (CHROME_BIN overrides included;
//              the owner's interactive Chrome NEVER counts), and THIS
//              lane's own lineage (the suite's clients + the run-gate
//              wrapper's probe; ~2-3 roots ≈ 12-15 process rows, which a
//              raw row count self-classified as a storm — review r1 P1)
//              excluded by pid ancestry. The #425
//              red window ran 13-58 shell process rows across six lanes;
//              the 2026-08-07 calibration measured the app red at RAF
//              p95 54-55 ms with THREE foreign browsers at loadNorm
//              0.87-1.01 — compositor/BeginFrame contention starves
//              cadence far below the load bar.)
//           OR foreign busy-CPU aggregate >= the DERIVED bar (the CHURN
//              axis — the GH-347 comment-1 precondition "no >50%-CPU
//              builder/render processes" made an axis: sum of foreign
//              processes' %CPU, each >= 50%. The bar was a fixed 300% until
//              GH-691: the self-hosted runner RESTS at ~800-1100% of
//              corporate-agent CPU, so the constant read STORM at rest and
//              the teeth proof storm-skipped every night. The bar is now
//              derived per run from a pre-run RESTING baseline — see
//              "Derived busy-CPU bar" below. Receipts 2026-08-07: pristine main's GH-260 D
//              red at rafP95 73.5 ms and the e2e replay window at
//              35-42 ms, at loadNorm 0.72-0.80 / zero foreign browsers /
//              RTT 1 ms, while x2pagentd+syspolicyd+foreign review/rustfmt
//              summed ~700% — a 24-core loadavg hides burst contention
//              the cadence feels.)
//
// A probe-page cadence axis (the #425 suggestion) was measured and
// REJECTED: a blank second target in the same browser is rAF-independent
// of the app page (separate renderer — good teeth), but too cheap to
// starve — under a live storm that redded the app page at p95 51.1 ms the
// blank probe read 27.3 ms. The shell-count axis measures the same
// mechanism without the blind spot.
//
// The classifier errs deliberately toward OVER-classification: a false
// storm costs a bounded defer and at worst a LOUD unbanked skip-citation,
// while an under-classified storm recreates the #425 honest-red lottery
// and a false red blocks a lane. Every bar is an OB_* knob.
//
// TEETH (the non-negotiable): a genuine pacing regression in the app under
// test must STILL red on a quiet box. Both axes are therefore deliberately
// INDEPENDENT of the page under test: RTT is measured with a BROWSER-domain
// command (Browser.getVersion answers from the browser process — a wedged
// or stalling page main thread cannot inflate it, where Runtime.evaluate
// rides the page's main thread and an injected main-thread stall WOULD
// read as a storm), and loadavg is a host axis a single stalled renderer
// barely moves on a many-core box. e2e-harness-hygiene arm 10 red-proves
// both directions (a stalled page reds under a calm classifier; a storm
// classifier defers/skips with the citation).
//
// DISCIPLINE (guardPacingArm):
//   1. canary: sample before measuring; stormy → DEFER (log + resample)
//      within a bounded window (OB_PACING_CALM_WAIT_MS, default 120 s) —
//      the storm-contaminated measurement is never judged;
//   2. calm → measure for real → judge; green stands (storms only ever
//      INFLATE pacing metrics, so a green is a green even if a storm
//      arrives later — the asymmetry is safe by construction);
//   3. red → belt: resample; storm overlap → the red is INFRA, retry
//      within the window (bounded by OB_PACING_MAX_MEASURES too);
//   4. red with a calm bracket → ONE confirming re-measure
//      (OB_PACING_CALM_RETRIES, default 1 — the suites' recorded hosted
//      one-retry convention, in-process): a hard frame-budget collapse —
//      the defect class pacing arms guard — reds every measurement, while
//      a boundary flicker on a busy-but-calm box (measured live: 34.40 ms
//      against the 34 bar, brackets calm at loadNorm 0.9) is scheduling
//      noise; every reading is logged, and a flicker pass is FULL
//      coverage (the arm measured green inside a calm bracket), not a
//      waiver. A confirmed red → fail() — the arm keeps its teeth;
//   5. window exhausted while stormy → SKIPPED-STORM with a LOUD citation
//      line, never a silent green. The citation deliberately matches
//      run-gate.mjs's waiver harvest (/\bskipp(?:ed|ing)?\b/i — GH-347
//      review r2 P1/r8 P1: any waived/skipped arm marks the ledger entry
//      waived:true, which NEVER vouches for a skip): a suite with a
//      storm-skip records as an un-banked partial, the zero-quality-
//      reduction law. DEFER lines are worded to NOT match that harvest —
//      a deferred-then-really-green run is full coverage and banks
//      normally. Hygiene arm 10 pins both wordings against the regex.
//
// Env knobs (OB_* wins; all optional):
//   OB_PACING_GUARD=0             disable the discipline (raw pre-GH-425
//                                 arm behavior — quiet-box calibration)
//   OB_PACING_STORM_RTT_MS        control-plane RTT storm bar (default 300)
//   OB_PACING_STORM_LOADNORM      loadavg/cores storm bar (default 1.5)
//   OB_PACING_STORM_SHELLS        foreign-browser storm bar (default 3)
//   OB_PACING_STORM_BUSYCPU       foreign busy-CPU aggregate bar (% of
//                                 one core) — an EXPLICIT operator bar
//                                 that wins over the derived one; unset by
//                                 default (GH-691: the bar is derived)
//   OB_PACING_BASELINE            the pre-run baseline JSON (written by
//                                 primeStormBaseline / storm-baseline.mjs
//                                 into the job env; children inherit it)
//   OB_PACING_STORM_BUSYCPU_K     robust-σ multiple of the margin (default 3)
//   OB_PACING_STORM_BUSYCPU_QUANTUM  margin floor, % of one core (default
//                                 100 = one busy foreign core)
//   OB_PACING_STORM_BUSYCPU_MARGIN  operator override: a FIXED fraction of
//                                 the baseline median instead of k·σ̂
//   OB_PACING_BASELINE_SPREAD_MAX  quietness bound on σ̂/base (default 0.5)
//   OB_PACING_BASELINE_SAMPLES / _GAP_MS  the window (default 12 × 5000 ms)
//
// Derived busy-CPU bar (GH-691). Before the job's own load starts, a short
// window of ps snapshots is taken (12 × 5 s by default — ps %CPU is a
// decaying average over up to a minute, so 1 s spacing only sees floor
// crossings) and every sample records the foreign busy-CPU aggregate, the
// foreign browser count and loadavg/cores. The baseline is the window's
// MEDIAN; its dispersion is the scaled MAD (1.4826 × MAD, the robust σ);
// the margin is max(k × σ̂, one busy core) — the standard robust 3-σ bound,
// stated in the log as a fraction of the baseline; bar = median + margin.
// The window must be at REST to mean anything: every sample with zero
// foreign browsers and loadavg/cores under the load bar (else UNRESTED —
// the median would be a load estimate, not a rest estimate) and σ̂/base
// within the quietness bound (else UNQUIET). An UNRESTED/UNQUIET baseline
// makes guardPacingArm SKIP BY NAME up front (a SKIP row: harvested as
// waived, never banked); with no baseline at all (UNDERIVED) the busy axis
// casts no vote in classifyStorm (absent bar = absent axis) and
// guardPacingArm skips by name too, so an unprimed consumer is loud, never
// silently calm. Every run writes the samples and the resulting bar to
// its log (primeStormBaseline) so the decision is auditable. Measured
// provenance (ci-host, 2026-09-06, 666 samples): rest median 825%,
// rest-window MAD/median 0.19 — the constant 300 read storm in 100% of
// samples; the derived bar reads the same rest calm and still trips on
// ~+470% (3σ̂) of churn above it.
//   OB_PACING_CALM_WAIT_MS        bounded defer window (default 120000)
//   OB_PACING_RETRY_DELAY_MS      resample spacing (default 15000)
//   OB_PACING_MAX_MEASURES        storm-overlapped red measurement cap
//                                 (default 3; calm confirmations never
//                                 spend it — review r13 P2)
//   OB_PACING_CALM_RETRIES        calm-red confirming re-measures (default 1)
// Suite-local budget knobs (e.g. OB_PERF_BUDGET_SCALE) stay owned by the
// suites — this helper never scales a budget, it only decides WHEN a
// measurement is a machine verdict instead of a tree verdict.
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import { sleep } from '../cdp.mjs';

const num = (v, d) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : d;
};

export const BASELINE_ENV = 'OB_PACING_BASELINE';

/** Parse a baseline JSON (env string or object); null when absent or
 * malformed — a malformed baseline is UNDERIVED, never the old constant. */
export function parseStormBaseline(raw) {
  if (!raw) return null;
  try {
    const b = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!b || b.v !== 1 || !Array.isArray(b.samples) || b.samples.length === 0) return null;
    if (!b.samples.every((x) => Number.isFinite(x.busyCpu) || x.psFailed === true)) return null;
    return b;
  } catch { return null; }
}

/** Resolve the discipline's knobs from an env (process.env by default).
 * The busy-CPU bar's PRECEDENCE: an explicit OB_PACING_STORM_BUSYCPU
 * ('env') > a derived bar from OB_PACING_BASELINE ('derived') > none
 * ('UNDERIVED', bar NaN — the axis casts no vote, guardPacingArm skips by
 * name). baselineQuiet/baselineState are null unless the bar is derived:
 * an operator's explicit bar is never overridden by an inherited baseline. */
export function pacingKnobs(env = process.env) {
  const loadNormBar = num(env.OB_PACING_STORM_LOADNORM, 1.5);
  const k = num(env.OB_PACING_STORM_BUSYCPU_K, 3);
  const quantum = num(env.OB_PACING_STORM_BUSYCPU_QUANTUM, 100);
  const marginFrac = env.OB_PACING_STORM_BUSYCPU_MARGIN !== undefined
    ? num(env.OB_PACING_STORM_BUSYCPU_MARGIN, NaN) : null;
  const spreadMax = num(env.OB_PACING_BASELINE_SPREAD_MAX, 0.5);
  const baseline = parseStormBaseline(env[BASELINE_ENV]);
  const derived = baseline
    ? deriveBusyCpuBar(baseline, { k, quantum, marginFrac, spreadMax, loadNormBar }) : null;
  const explicit = env.OB_PACING_STORM_BUSYCPU;
  let busyCpuBar = NaN; let busyCpuBarSource = 'UNDERIVED';
  let baselineQuiet = null; let baselineState = null;
  if (explicit !== undefined && Number.isFinite(Number(explicit)) && Number(explicit) >= 0) {
    busyCpuBar = Number(explicit); busyCpuBarSource = 'env';
  } else if (derived && Number.isFinite(derived.bar)) {
    busyCpuBar = derived.bar; busyCpuBarSource = 'derived';
    baselineQuiet = derived.quiet; baselineState = derived.state;
  }
  return {
    guard: env.OB_PACING_GUARD !== '0',
    rttStormMs: num(env.OB_PACING_STORM_RTT_MS, 300),
    loadNormBar,
    shellsBar: num(env.OB_PACING_STORM_SHELLS, 3),
    busyCpuBar, busyCpuBarSource, baseline, derived, baselineQuiet, baselineState,
    k, quantum, marginFrac, spreadMax,
    baselineSamples: Math.max(1, Math.round(num(env.OB_PACING_BASELINE_SAMPLES, 12))),
    baselineGapMs: num(env.OB_PACING_BASELINE_GAP_MS, 5000),
    calmWaitMs: num(env.OB_PACING_CALM_WAIT_MS, 120000),
    retryDelayMs: num(env.OB_PACING_RETRY_DELAY_MS, 15000),
    maxMeasures: Math.max(1, num(env.OB_PACING_MAX_MEASURES, 3)),
    calmRetries: num(env.OB_PACING_CALM_RETRIES, 1),
  };
}

const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b); const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
};

/**
 * Derive the busy-CPU storm bar from a pre-run baseline (pure; hygiene arm
 * pacing (e) drives it with fixtures). Returns
 *   { bar, quiet, state: 'QUIET'|'UNQUIET'|'UNRESTED'|'UNDERIVED', median,
 *     mad, sigma, base, dispersion, margin, marginFrac, marginHow, rested,
 *     n, min, max, shellsMax, loadNormMax }
 * bar = median + margin; margin = max(k × σ̂, quantum) unless the operator
 * fixed a fraction (marginFrac × median); σ̂ = 1.4826 × MAD; dispersion =
 * σ̂ / max(median, quantum) (the quantum floors the base so an idle box —
 * median below one busy core — is judged on the bar it will actually get);
 * QUIET ⇔ rested ∧ dispersion ≤ spreadMax; rested ⇔ every sample has zero
 * foreign browser roots and loadavg/cores < loadNormBar.
 */
export function deriveBusyCpuBar(baseline, { k = 3, quantum = 100, marginFrac = null,
  spreadMax = 0.5, loadNormBar = 1.5 } = {}) {
  const all = baseline?.samples ?? [];
  const psFailures = all.filter((x) => x.psFailed === true || !Number.isFinite(x.busyCpu)).length;
  if (psFailures > 0) {
    // no rest estimate exists when any snapshot failed — the window is
    // UNDERIVED (a SKIP by name), never a QUIET idle box (review r4 P2)
    return { bar: NaN, quiet: false, state: 'UNDERIVED', n: all.length, psFailures,
      why: `${psFailures} of ${all.length} ps snapshots were empty or unparsable` };
  }
  const samples = all;
  if (!samples.length) return { bar: NaN, quiet: false, state: 'UNDERIVED', n: 0, psFailures: 0, why: 'no samples' };
  const xs = samples.map((x) => x.busyCpu);
  const med = median(xs);
  const mad = median(xs.map((x) => Math.abs(x - med)));
  const sigma = 1.4826 * mad;
  const base = Math.max(med, quantum);
  const dispersion = sigma / base;
  const shellsMax = Math.max(...samples.map((x) => Number(x.shells ?? 0)));
  const loadNormMax = Math.max(...samples.map((x) => Number(x.loadNorm ?? 0)));
  const rested = samples.every((x) => Number(x.shells ?? 0) === 0 && Number(x.loadNorm ?? 0) < loadNormBar);
  let margin; let marginHow;
  if (marginFrac !== null && Number.isFinite(marginFrac)) {
    margin = marginFrac * med; marginHow = `fixed fraction ${marginFrac} of the median (OB_PACING_STORM_BUSYCPU_MARGIN)`;
  } else if (k * sigma >= quantum) {
    margin = k * sigma; marginHow = `${k} × σ̂ ${sigma.toFixed(0)}%`;
  } else {
    margin = quantum; marginHow = `the quantum ${quantum}% (one busy foreign core; ${k} × σ̂ = ${(k * sigma).toFixed(0)}% is below it)`;
  }
  const bar = med + margin;
  const state = !rested ? 'UNRESTED' : (dispersion > spreadMax ? 'UNQUIET' : 'QUIET');
  const sorted = [...xs].sort((a, b) => a - b);
  return { bar, quiet: state === 'QUIET', state, median: med, mad, sigma, base, dispersion,
    margin, marginFrac: med > 0 ? margin / med : null, marginHow, rested, n: xs.length,
    min: sorted[0], max: sorted[sorted.length - 1], p25: quantile(sorted, 0.25),
    shellsMax, loadNormMax, spreadMax, loadNormBar };
}

/** One baseline sample from a ps snapshot (foreign axes exactly as the
 * live classifier computes them; util = Σ %CPU of ALL rows / cores). */
export function baselineSampleFrom(rows, selfPids, t) {
  const cores = Math.max(1, os.cpus().length);
  // an EMPTY snapshot is a failed / unparsable ps (a live box always lists
  // at least this process) — recorded, never read as an idle box (review r4
  // P2: zero-CPU zero-browser samples used to derive a QUIET 100% bar)
  if (!Array.isArray(rows) || rows.length === 0) {
    return { t, busyCpu: null, shells: null, loadNorm: Number(loadNormNow().toFixed(2)), util: null, psFailed: true };
  }
  return { t,
    busyCpu: Math.round(busyForeignCpu(rows, selfPids)),
    shells: countForeignShellRoots(rows, selfPids),
    loadNorm: Number(loadNormNow().toFixed(2)),
    util: Math.round(rows.reduce((a, r) => a + (Number.isFinite(r.pcpu) ? r.pcpu : 0), 0) / cores) };
}

/** Take the pre-run baseline window: N ps snapshots gapMs apart. Read-only
 * (ps only — no top, no sockets). ~55 s at the defaults. */
export async function sampleStormBaseline({ samples = 12, gapMs = 5000, rowsNow = hostRowsNow } = {}) {
  const t0 = Date.now();
  const out = [];
  for (let i = 0; i < samples; i++) {
    const rows = rowsNow();
    out.push(baselineSampleFrom(rows, selfPidsFor(rows, process.pid, process.ppid), Date.now() - t0));
    if (i < samples - 1) await sleep(gapMs);
  }
  return { v: 1, host: os.hostname(), cores: Math.max(1, os.cpus().length), pid: process.pid,
    at: new Date(t0).toISOString(), gapMs, durationMs: Date.now() - t0, samples: out, source: 'sampled' };
}

/** The one auditable line every run writes (the sample AND the bar). */
export function formatBaselineLine(knobs, how = 'sampled') {
  const b = knobs.baseline; const d = knobs.derived;
  if (knobs.busyCpuBarSource === 'env') {
    return `[pacing-storm] baseline (${how}): busy-CPU bar is the EXPLICIT OB_PACING_STORM_BUSYCPU=${knobs.busyCpuBar}% — `
      + (d ? `the derived bar (${Math.round(d.bar)}% from median ${Math.round(d.median)}%) is not in force`
        : 'no baseline is sampled while an explicit bar is in force') + ' (GH-691)';
  }
  if (!b || !d) return `[pacing-storm] baseline (${how}): none — busy-CPU bar ${knobs.busyCpuBarSource}`;
  if (d.state === 'UNDERIVED') {
    return `[pacing-storm] baseline (${how}, ${b.host ?? '?'} pid ${b.pid ?? '?'} at ${b.at}): UNDERIVED — ${d.why}; `
      + 'no storm bar can be derived: pacing arms SKIP by name (GH-691)';
  }
  const utils = b.samples.map((x) => x.util).filter(Number.isFinite);
  return `[pacing-storm] baseline (${how}, ${b.host ?? '?'} pid ${b.pid ?? '?'} at ${b.at}): foreign busy-CPU median `
    + `${Math.round(d.median)}% (min ${Math.round(d.min)} / p25 ${Math.round(d.p25)} / max ${Math.round(d.max)}; `
    + `σ̂ ${d.sigma.toFixed(0)}% = ${d.dispersion.toFixed(2)} of base ${Math.round(d.base)}%; `
    + `${d.n} samples × ${(b.gapMs / 1000).toFixed(1)} s = ${((b.durationMs ?? 0) / 1000).toFixed(1)} s; `
    + `foreign browsers max ${d.shellsMax}, loadavg/cores max ${d.loadNormMax.toFixed(2)}`
    + (utils.length ? `, host util median ${Math.round(median(utils))}%` : '') + ') '
    + `→ storm bar ${Math.round(d.bar)}% = median + margin ${Math.round(d.margin)}% `
    + `(${d.marginFrac === null ? 'n/a' : d.marginFrac.toFixed(2)} of the baseline; ${d.marginHow}) — ${d.state}`
    + (d.state === 'QUIET' ? '' : ': pacing arms SKIP by name')
    + ` (GH-691) | busy samples [${b.samples.map((x) => Math.round(x.busyCpu)).join(' ')}]`;
}

/** Prime the process (and its children, via process.env) with a pre-run
 * baseline. An env baseline is honoured VERBATIM (the job's storm-baseline
 * step or a fixture — never re-sampled); an explicit bar makes sampling
 * pointless; guard off samples nothing. Call it BEFORE the consumer's own
 * load starts (before the first server/browser). */
export async function primeStormBaseline({ env = process.env, log = console.log } = {}) {
  const k0 = pacingKnobs(env);
  if (!k0.guard) return null;
  if (k0.baseline) { log(formatBaselineLine(k0, 'inherited')); return k0.baseline; }
  if (k0.busyCpuBarSource === 'env') { log(formatBaselineLine(k0, 'not sampled')); return null; }
  const b = await sampleStormBaseline({ samples: k0.baselineSamples, gapMs: k0.baselineGapMs });
  env[BASELINE_ENV] = JSON.stringify(b);
  log(formatBaselineLine(pacingKnobs(env), 'sampled'));
  return b;
}

/** The busy-CPU axis citation for a derived / explicit bar. */
export function busyBarCitation(knobs) {
  if (knobs.busyCpuBarSource === 'env') return 'explicit OB_PACING_STORM_BUSYCPU';
  const d = knobs.derived; const b = knobs.baseline;
  return `bar = baseline median ${Math.round(d.median)}% + margin ${Math.round(d.margin)}% (${d.marginHow}), `
    + `${d.n} samples × ${(b.gapMs / 1000).toFixed(1)} s at ${b.at}, ${d.state} (GH-691)`;
}

/** The one decision every consumer shares (review r1 P2 on GH-691: perf-aim's
 * own belt loop must honour it exactly as guardPacingArm does): when the
 * busy-CPU bar cannot be in force — UNDERIVED (nobody primed) or a DERIVED
 * bar whose window was UNRESTED / UNQUIET — return the state, the by-name
 * SKIPPED-STORM line for `label`, and one synthetic stormy sample carrying
 * the citation; null when a bar is in force (explicit or QUIET-derived). */
export function baselineSkip(knobs, label) {
  const state = knobs.busyCpuBarSource === 'UNDERIVED' ? 'UNDERIVED'
    : (knobs.busyCpuBarSource === 'derived' && knobs.baselineQuiet === false) ? knobs.baselineState : null;
  if (!state) return null;
  // the synthetic sample carries the axis fields every consumer's report
  // reads (review r2 P2: perf-aim serialises storm.loadNorm.toFixed(2)) —
  // the WINDOW's own numbers (max load / max browsers / median busy), a
  // null RTT (no probe was made), and `synthetic: true` so no reader can
  // mistake it for a live probe
  const d = knobs.derived;
  return { state, line: baselineSkipLine(label, knobs),
    sample: { stormy: true, synthetic: true, baselineState: state,
      loadNorm: d ? d.loadNormMax : 0, shells: d ? d.shellsMax : 0,
      busyCpu: d ? d.median : 0, rttP50: null,
      axes: [`storm bar ${state} (GH-691)`] } };
}

/** The SKIP-by-name line for an UNDERIVED / UNRESTED / UNQUIET baseline.
 * MUST stay matched by run-gate.mjs's waiver harvest (SKIPPED / waived). */
export function baselineSkipLine(label, knobs) {
  const d = knobs.derived; const b = knobs.baseline;
  const state = knobs.busyCpuBarSource === 'UNDERIVED' ? 'UNDERIVED' : d.state;
  const why = state === 'UNDERIVED'
    ? (b && d?.psFailures
      ? `the pre-run baseline window (${d.n} snapshots at ${b.at}) has no rest estimate: ${d.why} — `
        + 'ps failed on this box; fix ps (or PATH) and prime again'
      : 'no pre-run baseline in the env — prime it (primeStormBaseline() in the suite, or the '
        + 'storm-baseline step writing OB_PACING_BASELINE to $GITHUB_ENV), or set an explicit '
        + 'OB_PACING_STORM_BUSYCPU for a calibration run')
    : state === 'UNRESTED'
      ? `the pre-run baseline window (${d.n} × ${(b.gapMs / 1000).toFixed(1)} s at ${b.at}) was not at rest: `
        + `foreign browsers max ${d.shellsMax} (need 0), loadavg/cores max ${d.loadNormMax.toFixed(2)} `
        + `(need < ${d.loadNormBar}) — its median would be a load estimate, not a rest estimate`
      : `the pre-run baseline window (${d.n} × ${(b.gapMs / 1000).toFixed(1)} s at ${b.at}) was UNQUIET: `
        + `σ̂/base ${d.dispersion.toFixed(2)} > ${d.spreadMax} [busy ${b.samples.map((x) => Math.round(x.busyCpu)).join(' ')}] `
        + '— no bar separates rest from storm in it';
  return `[pacing-storm] SKIPPED-STORM ${label}: storm bar ${state} — ${why}; a pacing arm cannot tell `
    + 'rest from storm without a rested baseline (GH-691). PARTIAL COVERAGE: run-gate records this run '
    + 'waived — it can never bank a green fingerprint. Re-run once the box is at rest for a real verdict.';
}

/** 1-min loadavg normalized by core count (the GH-313 axis). */
export function loadNormNow() {
  return os.loadavg()[0] / Math.max(1, os.cpus().length);
}

/** Pure core of the stampede axis (hygiene arm 10 drives this directly):
 * count chrome-headless-shell BROWSER ROOTS (helper rows carry --type=
 * and never count) whose pid ancestry does NOT pass through any of
 * selfPids. Ancestry — not process group — because sibling lanes launched
 * from one driver session share a pgid, while the lineage law is
 * exact: this suite's clients descend from process.pid and the run-gate
 * wrapper's probe descends from process.ppid (review GH-425 r1 P1: a
 * wrapped suite plus its probe is ~2-3 roots / 12-15 process rows on its
 * own, and a raw row count self-classified every wrapped run). */
export function countForeignShellRoots(rows, selfPids) {
  const parent = new Map(rows.map((r) => [r.pid, r.ppid]));
  const self = new Set(selfPids);
  const isSelf = (pid) => {
    for (let p = pid, hops = 0; p > 1 && hops < 64; p = parent.get(p) ?? 0, hops += 1) {
      if (self.has(p)) return true;
    }
    return false;
  };
  // harness-browser identity, STRUCTURAL not substring (review r6 P2: a
  // watcher/grep shell line QUOTING these names must not count): a root
  // must carry the --remote-debugging-port= argument every cdp.mjs launch
  // passes, AND be either the pinned shell by executable name or ANY
  // binary wearing the actual --user-data-dir=…/obw-e2e-profile-<port>
  // argument (the harness profile law — CHROME_BIN overrides included;
  // review r5 P2). Deliberately NOT a bare 'Chrome' match: the owner's
  // interactive Google Chrome lives on this box (the never-broad-kill
  // law's register) and is not a lane — it must never storm-classify the
  // machine. Helper rows carry --type= on every Chromium binary and never
  // count.
  const isHarnessRoot = (cmd) => {
    if (/--type=/.test(cmd)) return false;
    if (!/ --remote-debugging-port=\d+/.test(cmd)) return false;
    // anchor to argv[0] (review r14 P2): a watcher/shell line QUOTING a
    // complete launch command must never count — only a Chromium-family
    // EXECUTABLE can be a browser root. (A CHROME_BIN whose path contains
    // spaces truncates at the first token and is missed — an accepted
    // residual: CHROME_BIN is the headed-forensics seam, the pinned shell
    // is the law, and a missed browser only under-counts.)
    const argv0 = cmd.trim().split(/\s+/, 1)[0];
    if (!/chrom/i.test(argv0)) return false;
    return /(^|\/)chrome-headless-shell$/.test(argv0)
      || / --user-data-dir=\S*\/obw-e2e-profile-\d+/.test(cmd);
  };
  return rows.filter((r) => isHarnessRoot(r.command) && !isSelf(r.pid)).length;
}

/** Self pids for the lineage exclusion: always this process; the PARENT
 * only when it provably IS this lane's run-gate wrapper (its probe chrome
 * is our sibling, not our descendant). A bare suite's parent shell or a
 * multi-lane driver is NOT self — excluding it would swallow every
 * sibling lane's browsers and blind the classifier (review r2 P1). */
export function selfPidsFor(rows, pid, ppid) {
  const self = [pid];
  const parent = rows.find((r) => r.pid === ppid);
  if (parent && /run-gate\.mjs/.test(parent.command)) self.push(ppid);
  return self;
}

/** Pure core of the busy-CPU axis (hygiene arm 10 drives this directly):
 * the aggregate %CPU of FOREIGN processes individually at/above the
 * per-process floor (default 50% — the GH-347 comment-1 load-gate
 * precondition verbatim: "no >50%-CPU builder/render processes"). This is
 * the churn species a 24-core loadavg hides: the 2026-08-07 receipts
 * measured pristine main's GH-260 D at rafP95 73.5 ms and the e2e replay
 * window at 35-42 ms — at loadNorm 0.72-0.80, zero foreign browsers, RTT
 * 1 ms — while x2pagentd/syspolicyd/foreign review+rustfmt summed ~700%
 * CPU (the #347 comment-2 corp-agent actors hitting the CADENCE axis
 * instead of RTT). Self-lineage is excluded by the same ancestry law, so
 * an injected in-app stall (our own browser burning a core) can never
 * disguise a genuine regression as churn. */
export function busyForeignCpu(rows, selfPids, { perProcFloor = 50 } = {}) {
  return foreignBusyRows(rows, selfPids, perProcFloor)
    .reduce((a, r) => a + r.pcpu, 0);
}

/** The rows the busy axis sums: >= perProcFloor %CPU, outside this lane's
 * lineage (pid ancestry). Shared by the vote and the printed evidence so
 * the two can never disagree about which processes counted. */
function foreignBusyRows(rows, selfPids, perProcFloor) {
  const parent = new Map(rows.map((r) => [r.pid, r.ppid]));
  const self = new Set(selfPids);
  const isSelf = (pid) => {
    for (let p = pid, hops = 0; p > 1 && hops < 64; p = parent.get(p) ?? 0, hops += 1) {
      if (self.has(p)) return true;
    }
    return false;
  };
  return rows.filter((r) => Number.isFinite(r.pcpu) && r.pcpu >= perProcFloor
    && !isSelf(r.pid));
}

/** GH-935 evidence: the n busiest rows the busy axis counted, as
 * {pid, nice, pcpu} only — never the command text (CI logs are public;
 * argv carries paths and tokens). Evidence only: the vote, the bar and the
 * baseline never read it. */
export function topForeignBusyRows(rows, selfPids, { perProcFloor = 50, n = 5 } = {}) {
  return foreignBusyRows(rows, selfPids, perProcFloor)
    .sort((a, b) => b.pcpu - a.pcpu).slice(0, n)
    .map((r) => ({ pid: r.pid, nice: r.nice ?? null, pcpu: r.pcpu }));
}

/** Parse `ps -axo pid=,ppid=,pcpu=,nice=,command=` text. Pure (hygiene and
 * the GH-935 selftest drive it with fixed text). nice is an integer, or
 * null where ps prints '-' (procps, for a process with no nice value). */
export function parsePsRows(text) {
  return String(text).split('\n')
    .map((l) => /^\s*(\d+)\s+(\d+)\s+([\d.]+)\s+(-|-?\d+)\s+(.*)$/.exec(l))
    .filter(Boolean)
    .map((m) => ({ pid: Number(m[1]), ppid: Number(m[2]), pcpu: Number(m[3]),
      nice: m[4] === '-' ? null : Number(m[4]), command: m[5] }));
}

/** One ps snapshot (pid, ppid, %CPU, nice, command). Read-only — this
 * helper never signals anything (the never-broad-kill law). */
export function hostRowsNow() {
  try {
    return parsePsRows(execFileSync('ps', ['-axo', 'pid=,ppid=,pcpu=,nice=,command='],
      { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
  } catch { return []; }
}

/** Live foreign-browser count (one-off convenience; sampleStorm shares a
 * single ps snapshot for both process axes). */
export function foreignShellRootsNow(rows = hostRowsNow()) {
  return countForeignShellRoots(rows,
    selfPidsFor(rows, process.pid, process.ppid));
}

/** Control-plane CDP RTT p50: 5x Browser.getVersion on the suite's own
 * client. Deliberately NOT Runtime.evaluate (run-gate's probe-page canary
 * can afford it — its page is idle by construction): on the page under
 * test, an in-app main-thread stall — the exact regression pacing arms
 * exist to catch — would inflate an evaluate round-trip and let a real
 * red hide behind a storm verdict. Browser.getVersion answers from the
 * browser process and still pays the socket-layer tax the #347 storms
 * actually consist of. */
export async function controlRttP50(chrome, { rounds = 5, gapMs = 100,
  boundMs = 5000 } = {}) {
  const rtts = [];
  for (let i = 0; i < rounds; i++) {
    const t0 = Date.now();
    // each probe is BOUNDED (review r2 P2): an unanswered Browser.getVersion
    // would otherwise ride cdp.mjs's generic command deadline and blow the
    // advertised OB_PACING_CALM_WAIT_MS window. A timed-out probe IS the
    // storm evidence — short-circuit with the bound as a storm-grade
    // sample. A REJECTED send still throws: a wedged/poisoned client is
    // the GH-248 law's case, not a storm sample.
    const p = chrome.send('Browser.getVersion');
    let boundTimer = null;
    const bound = new Promise((res) => {
      boundTimer = setTimeout(() => res(false), boundMs);
      boundTimer.unref?.(); // never holds a finished run alive (review r17 P3)
    });
    const answered = await Promise.race([p.then(() => true), bound]);
    clearTimeout(boundTimer);
    if (!answered) {
      p.catch(() => { /* late settle after the bound — already classified */ });
      // Infinity, not boundMs (review r17 P2): an unanswered probe must
      // vote stormy under ANY OB_PACING_STORM_RTT_MS, including bars
      // raised above the probe bound.
      return Infinity;
    }
    rtts.push(Date.now() - t0);
    if (i < rounds - 1) await sleep(gapMs);
  }
  rtts.sort((a, b) => a - b);
  return rtts[Math.floor(rounds / 2)];
}

/** Pure storm verdict on one sample — hygiene arm 10 drives this directly.
 * Absent axes (a fabricated test sample, a failed ps read) simply do not
 * vote. */
export function classifyStorm(sample, knobs) {
  const axes = [];
  if (sample.loadNorm >= knobs.loadNormBar) {
    axes.push(`loadavg/cores ${sample.loadNorm.toFixed(2)} >= ${knobs.loadNormBar}`);
  }
  if (sample.rttP50 >= knobs.rttStormMs) {
    axes.push(Number.isFinite(sample.rttP50)
      ? `control-plane CDP RTT p50 ${sample.rttP50} ms >= ${knobs.rttStormMs} ms`
      : 'control-plane CDP RTT probe UNANSWERED within its bound (storm-grade)');
  }
  if (sample.shells >= knobs.shellsBar) {
    axes.push(`${sample.shells} foreign chrome-headless-shell browsers >= ${knobs.shellsBar}`);
  }
  // UNDERIVED (no explicit bar, no baseline) casts NO vote: absent bar =
  // absent axis, the header's law — the loudness lives in guardPacingArm
  if (knobs.busyCpuBarSource !== 'UNDERIVED' && Number.isFinite(knobs.busyCpuBar)
    && sample.busyCpu >= knobs.busyCpuBar) {
    axes.push(`foreign busy-CPU aggregate ${Math.round(sample.busyCpu)}% >= `
      + `${Math.round(knobs.busyCpuBar)}% (>=50%-CPU processes, the GH-347 comment-1 axis; `
      + `${busyBarCitation(knobs)})`);
  }
  return { ...sample, stormy: axes.length > 0, axes };
}

/** One classified storm sample (all four axes; the two process axes share
 * a single ps snapshot). */
export async function sampleStorm(chrome, knobs) {
  const rows = hostRowsNow();
  const self = selfPidsFor(rows, process.pid, process.ppid);
  return classifyStorm({ loadNorm: loadNormNow(),
    shells: countForeignShellRoots(rows, self),
    busyCpu: busyForeignCpu(rows, self),
    busyTop: topForeignBusyRows(rows, self),
    rttP50: await controlRttP50(chrome) }, knobs);
}

/** The busy rows a sample carries, as ` top pid/nice/%cpu: ...` — digits,
 * '-', '.', '/' and ',' only, so no row can put a waiver word or an arm
 * marker into a line run-gate harvests or counts. '' when absent. */
export function busyTopText(sample) {
  const top = Array.isArray(sample?.busyTop) ? sample.busyTop : [];
  const num = (v) => (Number.isFinite(v) ? String(v) : '-');
  const rows = top.map((r) => `${num(r.pid)}/${num(r.nice)}/${num(r.pcpu)}`);
  return rows.length ? ` top pid/nice/%cpu: ${rows.join(', ')}` : '';
}

/** The usable-window floor, shared by the teeth judge and the attribution
 * below so the two can never drift apart. A 45 ms/frame injected stall
 * yields ~55 rAF callbacks in the 2.5 s window (measured 2026-09-06:
 * {frames 54, hog 58}); under 20 the page is being starved by the HOST,
 * which is a fact about the box and says nothing about the injection.
 * NOT a tolerance: the teeth judge already red at this exact count. */
export const TEETH_MIN_FRAMES = 20;

/** Attribute a LIVE teeth proof's windows to the injected stall (issue
 * #664 (d)). An undersized or empty window is STARVATION (a host fact, so
 * the caller's storm belt classifies it: INFRA under a storm sample, an
 * honest named red on a calm box) — never an attributable proof, because
 * the teeth judge reds on such a window for the starvation alone and would
 * otherwise bank a pass the injection never earned (review r7 P2).
 * Each entry is one measured rAF window: `frames` it collected,
 * `hog` the injected long-frame stall's own frame count over the same span.
 * Returns null when every window is attributable to the injection, else a
 * red naming which of the OTHER two states it is:
 *   - a window with ZERO frames: the page produced no rAF at all, so a
 *     rAF-paced hog could not run — a STARVED page (a box storm, a wedge),
 *     which is not evidence about the injection either way. Measured
 *     2026-09-06 on the merged tree at loadavg 28.9/40.2/39.4 on 24 cores
 *     with 11 foreign shells: two windows of {frames 0, hog 0} while the
 *     teeth judge still red on `undersized` — red for the wrong reason;
 *   - a populated window the hog barely touched: the injection is not
 *     live (a full-size window >= 20 frames needs the hog in half of them,
 *     a smaller one only needs it to have advanced — review r1 P2).
 * Pure so hygiene arm 10 can pin all three states with scripted input. */
export function attributeTeethWindows(perWindow) {
  if (!Array.isArray(perWindow) || perWindow.length === 0) {
    return 'no teeth window was measured';
  }
  const starved = perWindow.find((w) => !(w.frames >= TEETH_MIN_FRAMES));
  if (starved) {
    return starved.frames >= 1
      ? `only ${starved.frames} rAF frames in a teeth window (< `
        + `${TEETH_MIN_FRAMES}) — the HOST starved the page, so the arm's `
        + 'red is the starvation, not a verdict on the injection'
      : 'ZERO frames in a teeth window — the page produced no rAF at all, '
        + 'so the rAF-paced hog could not run: a STARVED page, not an '
        + 'injection verdict';
  }
  const dead = perWindow.find((w) => !(w.hog >= Math.floor(w.frames / 2)));
  if (dead) {
    return `the injection is not live — hog advanced ${dead.hog} of `
      + `${dead.frames} frames in a teeth window`;
  }
  return null;
}

/** The SKIPPED-STORM citation. MUST stay matched by run-gate.mjs's waiver
 * harvest (the 'skipped' word) — hygiene arm 10 pins it. */
export function stormSkipLine(label, detail, samples) {
  const last = samples[samples.length - 1];
  return `[pacing-storm] SKIPPED-STORM ${label}: ${detail} — box stormy `
    + `[${last.axes.join(' | ')}]${busyTopText(last)} across ${samples.length} samples; a pacing `
    + 'arm under a box storm measures the MACHINE, not the tree (GH-425, '
    + 'the GH-347 INFRA law). PARTIAL COVERAGE: run-gate records this run '
    + 'waived — it can never bank a green fingerprint. Re-run in a quiet '
    + 'window for a real verdict.';
}

/** The defer notice. MUST stay UNmatched by run-gate.mjs's waiver harvest
 * (no skip/waive words): a deferred-then-green run is full coverage. */
export function deferLine(label, sample, leftMs) {
  return `[pacing-storm] DEFER ${label}: box stormy `
    + `[${sample.axes.join(' | ')}]${busyTopText(sample)} — holding the measurement for a calm `
    + `window (${Math.ceil(leftMs / 1000)} s left in the bounded wait)`;
}

/**
 * Run one pacing arm under the GH-425 storm discipline.
 *
 *   guardPacingArm({
 *     chrome,               // cdp.mjs client (send + eval)
 *     label,                // arm name for the log lines
 *     measure,              // async (attempt) => measurement
 *     judge,                // (measurement) => null | red-detail string
 *     fail,                 // the suite's fail() — called ONLY on a real red
 *     log,                  // console.log by default
 *     knobs,                // pacingKnobs() by default
 *     sampler,              // test seam (hygiene): async () => sample —
 *                           //   replaces sampleStorm, classification and
 *                           //   flow logic stay REAL
 *     deadlineAt,           // epoch ms the caller must be done waiting by
 *                           //   (GH-935: a suite watchdog minus what the
 *                           //   arm still needs); the calm wait is clamped
 *                           //   to it, so the storm-skip runs before the
 *                           //   watchdog instead of racing it
 *     now, sleep,           // clock seam (tests): Date.now / cdp sleep
 *   }) → { verdict: 'green'|'red'|'storm-skip', measured, samples, bound? }
 *
 * `bound` rides on a storm-skip only: 'calm-wait', 'caller-deadline' or
 * 'max-measures' — which bound ended the wait.
 *
 * measure(attempt) must collect a FRESH window every call: the judged
 * measurement is always bracketed canary→measure→belt. A window collected
 * BEFORE the canary must never be judged — a storm that ended inside it
 * would read calm on both brackets and file a machine verdict as a real
 * red (review GH-425 r1 P2). Suites may still REPORT pre-canary windows.
 */
export async function guardPacingArm({ chrome, label, measure, judge,
  fail, log = console.log, knobs = pacingKnobs(), sampler = null,
  deadlineAt = Infinity, now = Date.now, sleep: pause = sleep }) {
  if (!knobs.guard) {
    const measured = await measure(0);
    const red = judge(measured);
    if (red) { fail(red); return { verdict: 'red', measured, samples: [] }; }
    return { verdict: 'green', measured, samples: [] };
  }
  // GH-691: a bar that cannot be derived cannot be waited out — the
  // baseline is fixed for the run. UNDERIVED (nobody primed) and a derived
  // bar whose window was UNRESTED / UNQUIET skip BY NAME at once, with one
  // synthetic sample so `last.axes` consumers keep reading the citation.
  // An explicit bar ('env') is never subject to this (precedence).
  const bskip = baselineSkip(knobs, label);
  if (bskip) {
    log(bskip.line);
    return { verdict: 'storm-skip', measured: null, samples: [bskip.sample] };
  }
  const take = sampler
    ? async () => classifyStorm(await sampler(), knobs)
    : () => sampleStorm(chrome, knobs);
  // a NaN deadline would disable every skip branch (NaN <= 0 is false)
  if (Number.isNaN(Number(deadlineAt))) {
    throw new TypeError(`guardPacingArm ${label}: deadlineAt is not a number`);
  }
  const calmBoundAt = now() + knobs.calmWaitMs;
  const deadline = Math.min(calmBoundAt, deadlineAt);
  const callerBound = deadline < calmBoundAt;
  const bound = callerBound ? 'caller-deadline' : 'calm-wait';
  const samples = [];
  let attempt = 0;
  let stormMeasures = 0; // only STORM-overlapped reds spend maxMeasures
  let lastRed = null;
  let calmRetriesLeft = Math.max(0, knobs.calmRetries ?? 0);
  for (;;) {
    // ---- canary: never judge a storm-window measurement -------------------
    let s = await take();
    samples.push(s);
    while (s.stormy) {
      const leftMs = deadline - now();
      if (leftMs <= 0) {
        let detail = lastRed
          ? `measured red under storm overlap (${lastRed})`
          : 'never reached a calm window to measure in';
        if (callerBound) {
          detail = lastRed
            ? `${detail}; the caller deadline ended the wait`
            : 'the caller deadline left no calm window to measure in';
        }
        log(stormSkipLine(label, detail, samples));
        return { verdict: 'storm-skip', measured: null, samples, bound };
      }
      log(deferLine(label, s, leftMs));
      await pause(Math.min(knobs.retryDelayMs, Math.max(1, leftMs)));
      s = await take();
      samples.push(s);
    }
    // ---- measure + judge ---------------------------------------------------
    const measured = await measure(attempt);
    attempt += 1;
    const red = judge(measured);
    if (!red) {
      // storms only inflate pacing metrics — a green needs no belt check
      return { verdict: 'green', measured, samples };
    }
    // ---- belt: a red that overlapped a storm is INFRA, not a verdict ------
    const post = await take();
    samples.push(post);
    if (!post.stormy) {
      // calm-bracketed red: one confirming re-measure (header point 4 —
      // the recorded hosted one-retry convention, in-process). A hard
      // collapse confirms; a boundary flicker passes with both readings
      // on the record. The confirmation slot is RESERVED — it never
      // competes with the storm-retry budget (review r5 P2: storm retries
      // consuming maxMeasures used to leave the first calm red
      // unconfirmable), so total measurements stay bounded by
      // maxMeasures + calmRetries.
      if (calmRetriesLeft > 0) {
        calmRetriesLeft -= 1;
        log(`[pacing-storm] ${label}: red measurement (${red}) inside a `
          + 'CALM bracket — one confirming re-measure (the one-retry '
          + 'convention); a genuine collapse reds again');
        continue;
      }
      // honest red — with the differential-first pointer: residual actors
      // no calm axis reads (corp-agent churn — x2pagentd/syspolicyd, the
      // #347 comment-2 species — measured redding PRISTINE MAIN at rafP95
      // 73.5 ms at loadNorm 0.8 with zero foreign browsers, 2026-08-07)
      // can still starve cadence tree-independently.
      log(`[pacing-storm] ${label}: red CONFIRMED under calm storm axes. `
        + 'Differential-first before blaming the tree (the #404/#407 '
        + 'protocol): if pristine main reds this leg in the same window, '
        + 'it is a machine verdict (GH-425), not a tree verdict.');
      fail(red);
      return { verdict: 'red', measured, samples };
    }
    lastRed = red;
    stormMeasures += 1;
    log(`[pacing-storm] ${label}: red measurement overlapped a storm sample `
      + `[${post.axes.join(' | ')}] — INFRA class, retrying in a calmer window`);
    // only storm-overlapped measurements spend the maxMeasures budget
    // (review r13 P2: counting the reserved calm confirmation against it
    // skipped after two storm hits and one confirmation — a premature
    // waive); total measurements stay <= maxMeasures + calmRetries.
    if (stormMeasures >= knobs.maxMeasures || now() >= deadline) {
      const hit = stormMeasures >= knobs.maxMeasures ? 'max-measures' : bound;
      log(stormSkipLine(label, `measured red under storm overlap (${red})`
        + (hit === 'caller-deadline' ? '; the caller deadline ended the wait' : ''),
      samples));
      return { verdict: 'storm-skip', measured, samples, bound: hit };
    }
    await pause(Math.min(knobs.retryDelayMs, Math.max(1, deadline - now())));
  }
}
