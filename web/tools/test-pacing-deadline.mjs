// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-pacing-deadline.mjs — node selftest of the GH-935 storm-guard deadline and the busy-row evidence.
// No browser and no chrome handle: every guard runs on the sampler seam, and the deadline rows run on
// the guard's clock seam (a virtual clock, so no row waits in real time except the D row's
// sub-second real-clock control). Other I/O: reading e2e-harness-hygiene.mjs and run-gate.mjs as
// text (the W rows), importing run-gate's verdict grammar (B3) and one read-only `ps` snapshot (B4).
// Usage: node web/tools/test-pacing-deadline.mjs
//   OB_PACING_MODULE=<path to pacing.mjs>, OB_HYGIENE_SRC=<path>, OB_RUNGATE_SRC=<path>,
//   OB_VERDICT_GRAMMAR=<path to lib/verdict-grammar.mjs> point the rows at other copies (defaults: the
//   files next to this one).
// Prints 'ok  ' / 'FAIL' per row, then 'PACING-DEADLINE SELFTEST PASS|FAIL (n)'; exit 0/1.
//
// Fixture anchors (the GH-935 nightly log, battery job): the baseline derived a 1152% busy-CPU bar
// (QUIET); the REAL-box guard started 369.6 s into the suite under a 420 s watchdog and read busy
// 1647 / 1424 / 1527 / 1613% until the watchdog fired, with no SKIPPED-STORM line. The sampler
// replays those four values and holds the last one.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const here = (rel) => new URL(rel, import.meta.url).pathname;
const MOD = process.env.OB_PACING_MODULE || here('./lib/pacing.mjs');
const HYGIENE = process.env.OB_HYGIENE_SRC || here('./e2e-harness-hygiene.mjs');
const RUNGATE = process.env.OB_RUNGATE_SRC || here('./run-gate.mjs');
// a namespace import: a named import of a symbol an older module lacks would fail at link time,
// which is a red for the wrong reason
const P = await import(pathToFileURL(MOD).href);

let n = 0, bad = 0;
function ok(title, cond, detail = '') {
  n++;
  if (cond) console.log(`ok   ${title}`);
  else { bad++; console.log(`FAIL ${title}${detail ? ` :: ${detail}` : ''}`); }
}
const J = JSON.stringify;

// run-gate's waiver harvest, read from its source so the rows judge the real rule; its arm census is the ONE verdict
// grammar (#1194), imported from the module run-gate reads it from
const RG = fs.readFileSync(RUNGATE, 'utf8');
const HARVEST_SRC = 'waived = /waiv|soft.?skip|\\bskipp(?:ed|ing)?\\b|\\bSKIP\\b/i.test(logText);';
const HARVEST = /waiv|soft.?skip|\bskipp(?:ed|ing)?\b|\bSKIP\b/i;
const VERDICT_GRAMMAR = process.env.OB_VERDICT_GRAMMAR || here('./lib/verdict-grammar.mjs');
let countArms = null; // a missing module fails the rows that need it, by name, instead of the whole selftest
try { ({ countArms } = await import(pathToFileURL(VERDICT_GRAMMAR).href)); } catch (e) { console.log(`FAIL setup: the verdict grammar did not load (${VERDICT_GRAMMAR}): ${e.message}`); }

const BAR = 1152;
const knobsAt = (over = {}) => ({ ...P.pacingKnobs({ OB_PACING_STORM_BUSYCPU: String(BAR) }),
  retryDelayMs: 1000, ...over });
const LOG_BUSY = [1647, 1424, 1527, 1613];
const sample = (busyCpu, busyTop) => ({ loadNorm: 0.5, shells: 0, busyCpu, rttP50: 2,
  ...(busyTop ? { busyTop } : {}) });
const CALM = sample(400);
// the most one canary / belt sample can take: controlRttP50's 5 rounds x boundMs 5000
const RTT_BOUND_MS = 5 * 5000;
// what one fixture sample costs on the virtual clock: a storm-slowed RTT probe (a fixture value,
// under the bound). A caller deadline at watchdog - RTT_BOUND_MS therefore leaves room for the one
// sample that can start before the deadline and end after it.
const SAMPLE_MS = 10000;
// the caller deadline the S / C rows use: the watchdog less one RTT bound (hygiene derives its own,
// larger reserve — the S0 row takes that case)
const DL = (wd) => wd - RTT_BOUND_MS;

// One guard on a virtual clock. The sampler costs SAMPLE_MS per sample and throws once the clock
// reaches the fixture watchdog (recording when it fired). A guard that ignores the clock seam still
// advances it through its samples, so it ends on the watchdog within seconds of real time
// (retryDelayMs 1000 real) instead of waiting out the calm bound.
async function drive({ seq, t0, watchdogAt, deadlineAt, knobs = knobsAt(), judge = () => null,
  seam = true, strictSeam = false }) {
  let t = t0;
  let i = 0;
  let sleeps = 0;
  let fired = null;
  let calls = 0;
  const lines = [];
  const args = {
    chrome: null,
    label: 'live teeth proof precondition (REAL box)',
    sampler: async () => {
      t += SAMPLE_MS;
      // strictSeam (the D2/D3 rows, whose calm wait is 120 s): a guard that sleeps in real time
      // between canaries is refused at its third sample instead of waiting the bound out for real
      if (strictSeam && i >= 2 && sleeps === 0) throw new Error('the guard ignored the clock seam');
      if (t >= watchdogAt) { fired = t; throw new Error(`fixture watchdog fired at ${t} ms`); }
      return seq[Math.min(i++, seq.length - 1)];
    },
    measure: async () => { calls += 1; return calls; },
    judge,
    fail: (m) => lines.push(`FAIL() ${m}`),
    log: (m) => lines.push(m),
    knobs,
  };
  if (seam) Object.assign(args, { now: () => t, sleep: async (ms) => { sleeps += 1; t += ms; } });
  if (deadlineAt !== undefined) args.deadlineAt = deadlineAt;
  let res = null;
  let threw = null;
  try { res = await P.guardPacingArm(args); } catch (e) { threw = e.message; }
  const text = lines.join('\n');
  return { res, threw, fired, calls, lines, text, t,
    defers: lines.filter((l) => /\] DEFER /.test(l)),
    skips: lines.filter((l) => /SKIPPED-STORM/.test(l)) };
}
const brief = (r) => J({ verdict: r.res?.verdict, bound: r.res?.bound, threw: r.threw, fired: r.fired,
  calls: r.calls, t: r.t, lines: r.lines.map((l) => l.slice(0, 160)) });

const STORM = LOG_BUSY.map((b) => sample(b));
// the log's timing: suite clock 0 at the first hygiene line, guard at 369.6 s, watchdog at 420 s
const T0 = 369600;
const WD = 420000;

// ---- precondition: the fixture's bar is in force, so no row can end on the GH-691 baseline skip
ok('Q the fixture bar is in force (explicit 1152%, no baseline skip) and the replayed samples vote '
  + 'stormy on the busy axis alone',
P.baselineSkip(knobsAt(), 'q') === null
  && STORM.every((s) => { const c = P.classifyStorm(s, knobsAt()); return c.stormy && c.axes.length === 1; })
  && P.classifyStorm(CALM, knobsAt()).stormy === false);

// ---- S: a storm across the whole remaining budget: the guard defers, then skips before the watchdog
{
  const r = await drive({ seq: STORM, t0: T0, watchdogAt: WD, deadlineAt: DL(WD) });
  ok('S a storm that outlasts the caller budget ends on SKIPPED-STORM before the fixture watchdog '
    + '(base: the watchdog fired before any storm-skip)',
  r.res?.verdict === 'storm-skip' && r.fired === null && r.threw === null, brief(r));
  ok('S the guard deferred first, never measured, and the skip names the caller deadline (not the '
    + 'calm-wait bound)',
  r.defers.length >= 1 && r.calls === 0 && r.res?.bound === 'caller-deadline'
    && r.skips.length === 1 && /the caller deadline left no calm window to measure in/.test(r.skips[0])
    && !/never reached a calm window/.test(r.skips[0]), brief(r));
  ok('S the SKIPPED-STORM line matches the run-gate harvest and no DEFER line does',
  r.skips.length === 1 && HARVEST.test(r.skips[0]) && r.defers.length >= 1
    && r.defers.every((l) => !HARVEST.test(l)), brief(r));
  ok('S every DEFER prints the clamped time left (within the caller budget, never the 120 s calm wait)',
  r.defers.length >= 1 && r.defers.every((l) => {
    const m = /\((\d+) s left in the bounded wait\)/.exec(l);
    return m && Number(m[1]) <= Math.ceil((DL(WD) - T0) / 1000);
  }), brief(r));
}
// S0: the log's timing with a deadline that has already passed when the guard starts (hygiene's
// derived reserve is larger than the 50 s the log had left): one sample, an immediate named skip
{
  const r = await drive({ seq: STORM, t0: T0, watchdogAt: WD, deadlineAt: WD - 105000 });
  ok('S0 a deadline already past at guard start skips on the first stormy sample, no DEFER, no measure',
  r.res?.verdict === 'storm-skip' && r.res?.bound === 'caller-deadline' && r.fired === null
    && r.defers.length === 0 && r.calls === 0 && r.res?.samples?.length === 1
    && /the caller deadline left no calm window/.test(r.skips[0] ?? ''), brief(r));
}
// S1: calm canary, a red measurement, a stormy belt read after the caller deadline (the belt's own
// bound check, which stops after the belt's own read: 2 samples); S1b: the deadline passes during the
// retry wait (the canary loop's check, one canary read later: 3 samples)
for (const [tag, dl, n] of [['S1', T0 + 15000, 2], ['S1b', T0 + 25000, 3]]) {
  const r = await drive({ seq: [CALM, STORM[0], STORM[1]], t0: T0, watchdogAt: WD,
    deadlineAt: dl, judge: () => 'p95 over' });
  ok(`${tag} a storm-overlapped red whose retry runs past the caller deadline skips and says so`,
  r.res?.verdict === 'storm-skip' && r.res?.bound === 'caller-deadline' && r.calls === 1 && r.fired === null
    && r.res?.samples?.length === n
    && /measured red under storm overlap \(p95 over\); the caller deadline ended the wait/.test(r.text)
    && !/FAIL\(\)/.test(r.text), brief(r));
}

// ---- C: storm, then calm inside the budget: deferred, then measured for real, green
{
  const r = await drive({ seq: [STORM[0], STORM[1], CALM], t0: T0, watchdogAt: WD, deadlineAt: DL(WD) });
  ok('C a storm that clears inside the caller budget defers, then measures, then banks green',
  r.res?.verdict === 'green' && r.calls === 1 && r.defers.length === 2 && r.skips.length === 0
    && r.fired === null && !HARVEST.test(r.text), brief(r));
}
// C2: calm arrives only after the deadline: the skip lands first, nothing is measured
{
  const r = await drive({ seq: [...STORM, STORM[3], CALM], t0: T0, watchdogAt: WD + 60000,
    deadlineAt: T0 + 40000 });
  ok('C2 calm arriving after the caller deadline is never reached: storm-skip, 0 measures',
  r.res?.verdict === 'storm-skip' && r.res?.bound === 'caller-deadline' && r.calls === 0
    && r.fired === null, brief(r));
}

// ---- D: no caller deadline. D runs on the REAL clock (no seam) with a sub-second calm wait, so it
// holds on base and fix alike: the calm-wait skip and its detail are unchanged.
{
  const r = await drive({ seq: STORM, t0: 0, watchdogAt: Infinity, seam: false,
    knobs: knobsAt({ calmWaitMs: 60, retryDelayMs: 10 }) });
  ok('D without deadlineAt the guard skips at the calm-wait bound with the unchanged detail',
  r.res?.verdict === 'storm-skip' && r.calls === 0 && r.threw === null
    && /: never reached a calm window to measure in — box stormy/.test(r.skips[0] ?? '')
    && (r.res?.bound === undefined || r.res.bound === 'calm-wait'), brief(r));
}
// D2: same on the virtual clock — the calm wait is the only bound, spent in full
{
  const r = await drive({ seq: STORM, t0: 0, watchdogAt: Infinity,
    knobs: knobsAt({ calmWaitMs: 120000, retryDelayMs: 15000 }), strictSeam: true });
  ok('D2 without deadlineAt the virtual-clock guard waits the full 120 s calm bound, then skips as before',
  r.res?.verdict === 'storm-skip' && r.res?.bound === 'calm-wait' && r.t >= 120000
    && /: never reached a calm window to measure in — box stormy/.test(r.skips[0] ?? ''), brief(r));
}
// D3: a deadline later than the calm bound changes nothing; a NaN deadline is refused loudly
{
  const late = await drive({ seq: STORM, t0: 0, watchdogAt: Infinity, deadlineAt: 10 ** 9,
    knobs: knobsAt({ calmWaitMs: 120000, retryDelayMs: 15000 }), strictSeam: true });
  const nan = await drive({ seq: STORM, t0: 0, watchdogAt: Infinity, deadlineAt: NaN,
    knobs: knobsAt({ calmWaitMs: 120000, retryDelayMs: 15000 }), strictSeam: true });
  ok('D3 a caller deadline past the calm bound leaves the calm-wait skip as it was; NaN throws',
  late.res?.bound === 'calm-wait' && /never reached a calm window/.test(late.skips[0] ?? '')
    && nan.res === null && /deadlineAt is not a number/.test(nan.threw ?? ''),
  `${brief(late)} || ${brief(nan)}`);
}

// ---- W: source pins on the hygiene wiring and run-gate's harvest
{
  const src = fs.readFileSync(HYGIENE, 'utf8');
  const blocks = src.split('guardPacingArm' + '({').slice(1).map((b) => b.slice(0, b.indexOf('});')));
  const real = blocks.find((b) => /label: 'live teeth proof precondition \(REAL box\)'/.test(b)) ?? '';
  const dl = /^\s*deadlineAt:\s*(.+),\s*$/m.exec(real);
  ok('W the REAL-box guard keeps `knobs: LIVE_K,` and passes deadlineAt = the earlier of the watchdog '
    + 'budget instant and the stall deadline, less the teeth reserve',
  real !== '' && /knobs: LIVE_K,/.test(real) && dl !== null
    && /^Math\.min\(WATCHDOG_AT \+ WATCHDOG_MS, wd\.stallDeadline\(\)\) - TEETH_RESERVE_MS$/.test(dl[1].replace(/\s+/g, ' ').trim()),
  dl ? dl[1] : 'no deadlineAt line');
  ok('W WATCHDOG_AT is stamped where the watchdog is armed',
  /const WATCHDOG_MS = [^\n]+\n(?:\/\/[^\n]*\n)*const WATCHDOG_AT = Date\.now\(\);/.test(src));
  ok('W run-gate still holds the waiver harvest verbatim and reads its arm count from the verdict grammar',
  RG.includes(HARVEST_SRC) && RG.includes("from './lib/verdict-grammar.mjs'") && typeof countArms === 'function');
}

// ---- B: the nice-aware busy rows (evidence only)
const PS_TEXT = [
  '    1     0   0.0   0 /sbin/launchd',
  '901001     1  88.5  19 /usr/bin/some tool --with spaces',
  '901002     1 612.0   0 builder',
  '901003     1  75.0 -20 /opt/agent/bin/agentd',
  '901004     1  51.0   - kworker/u8:2',
  '901005     1  12.0   5 idle-ish',
  'garbage line',
].join('\n');
{
  const has = typeof P.parsePsRows === 'function';
  const rows = has ? P.parsePsRows(PS_TEXT) : [];
  const nices = rows.map((r) => r.nice);
  // the pre-GH-935 row shape (no nice column) for the same processes
  const legacy = PS_TEXT.split('\n').map((l) => /^\s*(\d+)\s+(\d+)\s+([\d.]+)\s+(?:-|-?\d+)\s+(.*)$/.exec(l))
    .filter(Boolean).map((m) => ({ pid: Number(m[1]), ppid: Number(m[2]), pcpu: Number(m[3]), command: m[4] }));
  ok('B1 parsePsRows reads nice as 0 / 19 / -20 / null (for "-") and keeps commands with spaces',
  has && rows.length === 6 && J(nices) === J([0, 19, 0, -20, null, 5])
    && rows[1].command === '/usr/bin/some tool --with spaces' && rows[2].pcpu === 612,
  has ? J(rows) : 'parsePsRows absent');
  ok('B1 the busy sum is the same with and without the nice column (the vote is unchanged)',
  has && P.busyForeignCpu(rows, [process.pid]) === P.busyForeignCpu(legacy, [process.pid])
    && P.busyForeignCpu(rows, [process.pid]) === 88.5 + 612 + 75 + 51,
  has ? `${P.busyForeignCpu(rows, [process.pid])} vs ${P.busyForeignCpu(legacy, [process.pid])}` : '');
  const top = typeof P.topForeignBusyRows === 'function' ? P.topForeignBusyRows(rows, [process.pid]) : null;
  ok('B1 topForeignBusyRows lists the counted rows busiest first as {pid, nice, pcpu} only',
  top !== null && J(top) === J([{ pid: 901002, nice: 0, pcpu: 612 }, { pid: 901001, nice: 19, pcpu: 88.5 },
    { pid: 901003, nice: -20, pcpu: 75 }, { pid: 901004, nice: null, pcpu: 51 }]), J(top));
  const s = P.classifyStorm(sample(1647, top ?? []), knobsAt());
  const defer = P.deferLine('live teeth proof precondition (REAL box)', s, 60000);
  const skip = P.stormSkipLine('live teeth proof precondition (REAL box)', 'x', [s]);
  ok('B2 the DEFER and SKIPPED-STORM lines carry the rows as pid/nice/%cpu and no command text',
  /top pid\/nice\/%cpu: 901002\/0\/612, 901001\/19\/88\.5, 901003\/-20\/75, 901004\/-\/51/.test(defer)
    && /top pid\/nice\/%cpu: 901002\/0\/612/.test(skip) && !/builder|agentd|tool/.test(defer + skip), defer);
  const planted = P.classifyStorm(sample(1647, [{ pid: 'SKIPPED PASS ok: waived', nice: 'ok ', pcpu: 'PASS (9 arms)' },
    { pid: 7, nice: 0, pcpu: 99 }]), knobsAt());
  const pd = P.deferLine('arm', planted, 60000);
  ok('B3 a planted busy row cannot put a waiver word into a DEFER line or add run-gate arm-census hits',
  !HARVEST.test(pd) && typeof countArms === 'function' && countArms(pd) === 0 && countArms(defer) === 0
    && /top pid\/nice\/%cpu: -\/-\/-, 7\/0\/99/.test(pd), pd);
}
{
  const rows = P.hostRowsNow();
  const withNice = rows.filter((r) => Number.isInteger(r.nice));
  ok('B4 a live ps snapshot parses (rows > 0) and every nice value is an integer or null, some integer',
  rows.length > 0 && withNice.length > 0 && rows.every((r) => r.nice === null || Number.isInteger(r.nice)),
  J({ rows: rows.length, withNice: withNice.length, first: rows.slice(0, 2).map((r) => ({ pid: r.pid, nice: r.nice })) }));
}
{
  let d = null;
  let psFailed = null;
  if (typeof P.parsePsRows === 'function') {
    const b = await P.sampleStormBaseline({ samples: 12, gapMs: 0, rowsNow: () => P.parsePsRows(PS_TEXT) });
    psFailed = b.samples.some((x) => x.psFailed === true);
    d = P.pacingKnobs({ [P.BASELINE_ENV]: JSON.stringify(b) });
  }
  ok('B5 the baseline path over the new ps text derives a bar (not UNDERIVED) with no failed snapshot',
  d !== null && psFailed === false && d.busyCpuBarSource === 'derived' && Number.isFinite(d.busyCpuBar)
    && Math.round(d.derived.median) === Math.round(88.5 + 612 + 75 + 51),
  d ? J({ source: d.busyCpuBarSource, bar: d.busyCpuBar, psFailed }) : 'parsePsRows absent');
}

console.log(bad ? `PACING-DEADLINE SELFTEST FAIL (${bad} of ${n})` : `PACING-DEADLINE SELFTEST PASS (${n})`);
process.exitCode = bad ? 1 : 0;
