// run-arms.mjs — the hygiene watchdog arms wd (a)…(h): fixture.mjs driven through the watchdog, one child per
// shape (async, concurrent, each bounded), plus the static per-call-timeout check of the hygiene suite source,
// plus rows budget (k1)…(k6): the suite's OB_E2E_HYGIENE_BUDGET_MS knob (#954), read from the suite's own
// verdict line by running the suite itself with --budget-selftest (no arm runs; ~1 s per child).
// e2e-harness-hygiene.mjs runs these rows as its arm "wd"; this file's CLI runs them alone (calibration, plants).
// Usage: node run-arms.mjs [--module <watchdog module>] [--suite <hygiene suite source>]
// Prints 'ok  ' / 'FAIL' per row, then 'WD-ARMS PASS|FAIL (n)'; exit 0/1.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = (rel) => fileURLToPath(new URL(rel, import.meta.url));
// the fixture timing: every bound below is a multiple of these
// (a) and (b) end before the budget (lead + stall < budget); (c) checks every step < stall and ends before the ceiling;
// (f)-(h) block synchronously for less than the stall bound at a time
export const WD_FIXTURE = { budgetMs: 2000, stallMs: 600, ceilingMs: 4000, stepMs: 250 };
const SLACK_MS = 3000;
const CHILD_TIMEOUT_MS = 20000;

function runFixture(mode, module) {
  const { budgetMs, stallMs, ceilingMs, stepMs } = WD_FIXTURE;
  const env = { ...process.env };
  if (module) env.OB_WD_MODULE = module; else delete env.OB_WD_MODULE;
  const t0 = Date.now();
  return new Promise((resolve) => {
    execFile(process.execPath, [here('./fixture.mjs'), mode, String(budgetMs), String(stallMs), String(ceilingMs), String(stepMs)],
      { env, encoding: 'utf8', timeout: CHILD_TIMEOUT_MS, killSignal: 'SIGKILL' }, (e, stdout, stderr) => {
        const killed = !!(e && e.killed);
        const code = e ? (typeof e.code === 'number' ? e.code : null) : 0;
        resolve({ mode, code, killed, wall: Date.now() - t0, out: `${stdout}\n${stderr}` });
      });
  });
}

const firstLine = (out, re) => out.split('\n').find((l) => re.test(l)) ?? '';
const brief = (r) => `exit ${r.killed ? `killed at ${CHILD_TIMEOUT_MS} ms` : r.code}, wall ${r.wall} ms; `
  + `${r.out.split('\n').filter((l) => /hung|SLOW|WALL|END/.test(l)).slice(0, 3).join(' | ').slice(0, 300)}`;

/** All rows: [{ name, ok, detail }]. module: a watchdog module path (default lib/hygiene-watchdog.mjs);
 * suiteSrc: the hygiene suite source path for the static row (default the suite next to the tools). */
export async function runWdArms({ module = null, suiteSrc = here('../../e2e-harness-hygiene.mjs') } = {}) {
  const { budgetMs, stallMs, ceilingMs, stepMs } = WD_FIXTURE;
  const lead = 3 * stepMs;
  const [a, b, b2, c, c2, d, f, g, h] = await Promise.all(['hang', 'stuck-sync', 'blocked-check', 'slow', 'ceiling', 'normal',
    'sync-budget', 'sync-ceiling', 'sync-progress'].map((m) => runFixture(m, module)));
  const rows = [];
  const row = (name, ok, r) => rows.push({ name, ok: !!ok, detail: brief(r) });

  const aLine = firstLine(a.out, /harness hung: no check completed for/);
  row(`wd (a): an unresolved async leg reads "harness hung" within the stall bound, naming the last check`,
    a.code === 1 && aLine && !/SLOW/.test(a.out) && /last completed check 'lead: check 3'/.test(aLine)
      && a.wall >= lead + stallMs && a.wall <= lead + stallMs + SLACK_MS, a);

  const bLine = firstLine(b.out, /harness hung/);
  const late = Number((bLine.match(/fired ([\d.]+) s late/) ?? [])[1]);
  // the child is killed at 2 x stall, so the timer fires about one stall late; the per-call timeout bounds it
  row(`wd (b): a stuck sync child reads "harness hung … fired L s late", L bounded by its per-call timeout (L = ${late} s)`,
    b.code === 1 && /lateness bound [\d.]+ s \(.*\): within/.test(bLine) && Number.isFinite(late) && late * 1000 >= stallMs / 2 && late * 1000 <= stallMs + SLACK_MS, b);

  const b2Line = firstLine(b2.out, /harness hung/);
  row(`wd (b2): a check completing after a blocked gap longer than the stall bound still reads "harness hung"`,
    b2.code === 1 && /measured at the next check 'after-block: check'/.test(b2Line), b2);

  row(`wd (c): slow but progressing past the budget reads SLOW (exit 1), never "hung"`,
    c.code === 1 && !/hung/.test(c.out)
      && firstLine(c.out, new RegExp(`SLOW: budget ${(budgetMs / 1000).toFixed(1)} s crossed`))
      && firstLine(c.out, new RegExp(`SLOW: budget ${(budgetMs / 1000).toFixed(1)} s, wall [\\d.]+ s, \\d+ checks`))
      && /\[wd-fixture\] LEG /.test(c.out) && /\[wd-fixture\] END code 1/.test(c.out), c);

  row(`wd (c2): progressing past the ceiling stops on a named SLOW ceiling verdict (exit 1), never "hung"`,
    c2.code === 1 && !c2.killed && !/hung/.test(c2.out)
      && firstLine(c2.out, new RegExp(`SLOW: ceiling ${(ceilingMs / 1000).toFixed(1)} s reached .*the remaining legs did not run`))
      && c2.wall >= ceilingMs && c2.wall <= ceilingMs + SLACK_MS, c2);

  row(`wd (d): a normal run is green (exit 0, a WALL line, no SLOW or hung line)`,
    d.code === 0 && /\[wd-fixture\] WALL /.test(d.out) && !/hung|SLOW/.test(d.out), d);

  const B = (budgetMs / 1000).toFixed(1); const C = (ceilingMs / 1000).toFixed(1);
  row(`wd (f): a synchronous block crossing the budget right before the suite end reads SLOW (exit 1), never WALL`,
    f.code === 1 && !/hung/.test(f.out) && !/\[wd-fixture\] WALL /.test(f.out)
      && firstLine(f.out, new RegExp(`SLOW: budget ${B} s crossed \\(measured at the suite end`))
      && firstLine(f.out, new RegExp(`SLOW: budget ${B} s, wall [\\d.]+ s, \\d+ checks`)) && /\[wd-fixture\] END code 1/.test(f.out), f);

  row(`wd (g): a synchronous block crossing the ceiling right before the suite end reads the SLOW ceiling verdict (exit 1)`,
    g.code === 1 && !g.killed && !/hung/.test(g.out) && !/\[wd-fixture\] END /.test(g.out)
      && firstLine(g.out, new RegExp(`SLOW: ceiling ${C} s reached \\(measured at the suite end.*every leg had run`)), g);

  const hLines = h.out.split('\n');
  const hAt = hLines.findIndex((l) => new RegExp(`SLOW: ceiling ${C} s reached \\(measured at the next check 'sync-leg: check \\d+'`).test(l));
  const hAfter = hAt < 0 ? [] : hLines.slice(hAt + 1).filter((l) => /^\[wd-fixture\] (CHECK|END) /.test(l));
  row(`wd (h): a ceiling crossed in a synchronous stretch stops the run at the next check (no check line after the verdict, exit 1 within the ceiling + ${SLACK_MS} ms)`,
    h.code === 1 && !h.killed && !/hung/.test(h.out) && hAt >= 0 && hAfter.length === 0 && h.wall <= ceilingMs + SLACK_MS,
    { ...h, out: `${h.out}\n${hAfter.length ? `after the verdict: ${hAfter.slice(0, 2).join(' | ')}` : ''}` });

  const W = await import(new URL('../../lib/hygiene-watchdog.mjs', import.meta.url).href);
  let calls = null; let bad = null; let err = '';
  try {
    const src = fs.readFileSync(suiteSrc, 'utf8');
    calls = await W.syncCallTimeouts(src); bad = await W.unboundedSyncCalls(src);
  } catch (e) { err = String(e.message).split('\n')[0]; }
  const maxT = calls ? Math.max(0, ...calls.filter((c) => !c.battery && c.timeoutMs !== null).map((c) => c.timeoutMs)) : null;
  // the census on two one-call sources: timeout 0 is no timeout to node, so it is flagged; a positive one is not
  let zero = null; let pos = null; let err0 = '';
  try {
    const src0 = (t) => `import { spawnSync } from 'node:child_process';\nspawnSync('true', [], { timeout: ${t} });\n`;
    zero = await W.unboundedSyncCalls(src0(0)); pos = await W.unboundedSyncCalls(src0(1000));
  } catch (e) { err0 = String(e.message).split('\n')[0]; }
  rows.push({
    name: 'wd (e0): the census flags a synchronous child call with timeout: 0 (no timeout to node) and passes timeout: 1000',
    ok: Array.isArray(zero) && zero.length === 1 && Array.isArray(pos) && pos.length === 0,
    detail: zero === null ? `unreadable: ${err0}` : `timeout 0: ${zero.length} flagged ${zero.map((z) => z.why).join('; ')}; timeout 1000: ${pos.length} flagged`,
  });
  rows.push({
    name: `wd (e): every synchronous child call in the hygiene suite carries a per-call timeout within the ${W.SYNC_LATENESS_BOUND_MS} ms lateness bound`
      + (calls ? ` (${calls.length} calls, largest outside --battery ${maxT} ms)` : ''),
    // a census that found no calls is a parse that read nothing, not a clean suite
    ok: Array.isArray(calls) && calls.length >= 30 && bad.length === 0,
    detail: calls === null ? `unreadable: ${err}` : `${calls.length} calls; ${bad.length} unbounded: ${bad.map((h) => `line ${h.line} ${h.callee} (${h.why})`).join('; ')}`,
  });
  rows.push(...await budgetRows(suiteSrc));
  return rows;
}

const BUDGET_ENV = 'OB_E2E_HYGIENE_BUDGET_MS';
/** the suite run with --budget-selftest <ms> under a given knob (undefined: unset) */
function runSuite(suiteSrc, budget, selftestMs, extra = [], pathPrefix = null) {
  const env = { ...process.env };
  if (pathPrefix) env.PATH = `${pathPrefix}:${process.env.PATH ?? ''}`;
  if (budget === undefined) delete env[BUDGET_ENV]; else env[BUDGET_ENV] = budget;
  const t0 = Date.now();
  return new Promise((resolve) => {
    execFile(process.execPath, [suiteSrc, ...extra, '--budget-selftest', String(selftestMs)],
      { env, encoding: 'utf8', timeout: CHILD_TIMEOUT_MS, killSignal: 'SIGKILL' }, (e, stdout, stderr) => {
        const code = e ? (typeof e.code === 'number' ? e.code : null) : 0;
        resolve({ budget, code, killed: !!(e && e.killed), wall: Date.now() - t0, out: `${stdout}\n${stderr}` });
      });
  });
}
const verdictOf = (r) => firstLine(r.out, /HARNESS-HYGIENE /).replace(/^.*?\[hygiene\] /, '');
const briefSuite = (r) => `exit ${r.killed ? 'killed' : r.code}, wall ${r.wall} ms; ${r.out.split('\n').filter((l) => /HARNESS-HYGIENE|SLOW:|WALL|refused/.test(l)).slice(0, 3).join(' | ').slice(0, 400)}`;
/** budget (k1)…(k6): unset keeps 420 s, a set knob is the budget the watchdog judges, running past it is
 * SLOW (red) while staying inside it is green, an invalid value is refused by name before anything runs,
 * --battery keeps its own 1200 s, and a starved host diagnostic (a slow ps) never eats the timed window */
async function budgetRows(suiteSrc) {
  // a suite without the seam (pre-#954) would ignore --budget-selftest and run every arm, browsers
  // included, once per row: such a subject is judged unrunnable here and never started
  let seam = false;
  try { seam = fs.readFileSync(suiteSrc, 'utf8').includes("process.argv.indexOf('--budget-selftest')"); } catch { /* unreadable */ }
  if (!seam) {
    return ['k1', 'k2', 'k3', 'k4', 'k5', 'k6'].map((k) => ({ name: `budget (${k}): not run — the suite has no --budget-selftest seam (pre-#954)`, ok: false, detail: suiteSrc }));
  }
  const INVALID = ['abc', '0', '999', '7200001', '1e6', '600s', '-5', '12.5', ' 600000'];
  // k6: a stand-in ps first on PATH that sleeps, then runs the real ps (the suite's LOAD lines call ps)
  const realPs = (process.env.PATH ?? '').split(':').map((d) => path.join(d, 'ps'))
    .find((f) => { try { fs.accessSync(f, fs.constants.X_OK); return true; } catch { return false; } }) ?? '/bin/ps';
  const shimRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ob-hyg-ps-delay-'));
  const shim = (sec) => {
    const d = path.join(shimRoot, `ps-${sec}`); fs.mkdirSync(d);
    fs.writeFileSync(path.join(d, 'ps'), `#!/bin/sh\nsleep ${sec}\nexec ${realPs} "$@"\n`, { mode: 0o755 });
    return d;
  };
  const DELAYS = [1.25, 3];
  const shims = DELAYS.map(shim);
  const timedShim = (d) => new Promise((resolve) => { const t0 = Date.now(); execFile(path.join(d, 'ps'), ['-axo', 'stat='], { timeout: CHILD_TIMEOUT_MS }, () => resolve(Date.now() - t0)); });
  const [k1, k2, k3, k3c, k5, k6a, k6b, shimA, shimB, ...k4] = await Promise.all([
    runSuite(suiteSrc, undefined, 300), runSuite(suiteSrc, '600000', 300),
    runSuite(suiteSrc, '2000', 3000), runSuite(suiteSrc, '2000', 300),
    runSuite(suiteSrc, '600000', 300, ['--battery']),
    runSuite(suiteSrc, '2000', 3000, [], shims[0]), runSuite(suiteSrc, '2000', 3000, [], shims[1]),
    timedShim(shims[0]), timedShim(shims[1]),
    ...INVALID.map((v) => runSuite(suiteSrc, v, 300))]);
  try { fs.rmSync(shimRoot, { recursive: true, force: true }); } catch { /* temp */ }
  const rows = [];
  const row = (name, ok, detail) => rows.push({ name, ok: !!ok, detail });
  row('budget (k1): with OB_E2E_HYGIENE_BUDGET_MS unset the budget is 420 s, on the WALL line and the verdict line',
    k1.code === 0 && /WALL [\d.]+ s of budget 420\.0 s/.test(k1.out) && verdictOf(k1) === 'HARNESS-HYGIENE PASS (budget 420 s, default)', briefSuite(k1));
  row('budget (k2): OB_E2E_HYGIENE_BUDGET_MS=600000 is the budget in effect, on the WALL line and the verdict line',
    k2.code === 0 && /WALL [\d.]+ s of budget 600\.0 s/.test(k2.out) && verdictOf(k2) === `HARNESS-HYGIENE PASS (budget 600 s, ${BUDGET_ENV})`, briefSuite(k2));
  row('budget (k3): a run past a set 2 s budget (3 s of progressing checks) ends SLOW, exit 1, the verdict naming the 2 s budget; '
    + 'the same knob over a 0.3 s run stays PASS',
  k3.code === 1 && /SLOW: budget 2\.0 s crossed/.test(k3.out) && verdictOf(k3) === `HARNESS-HYGIENE SLOW (budget 2 s, ${BUDGET_ENV})`
    && k3c.code === 0 && verdictOf(k3c) === `HARNESS-HYGIENE PASS (budget 2 s, ${BUDGET_ENV})`, `${briefSuite(k3)} || control: ${briefSuite(k3c)}`);
  const refused = k4.map((r) => ({ v: r.budget, ok: r.code === 2 && r.out.includes(`${BUDGET_ENV}=${r.budget} refused`) && !/LOAD start|WALL|HARNESS-HYGIENE/.test(r.out) }));
  row(`budget (k4): an invalid OB_E2E_HYGIENE_BUDGET_MS is refused by name before anything runs (exit 2): ${INVALID.map((v) => JSON.stringify(v)).join(', ')}`,
    refused.every((x) => x.ok), refused.filter((x) => !x.ok).map((x) => `${JSON.stringify(x.v)}: ${briefSuite(k4[INVALID.indexOf(x.v)])}`).join(' || ') || 'all refused');
  row('budget (k5): --battery keeps its own 1200 s with the knob set, and says the knob applies to the non-battery shape only',
    k5.code === 0 && verdictOf(k5) === `HARNESS-HYGIENE PASS (budget 1200 s, --battery; ${BUDGET_ENV} applies to the non-battery shape only)`, briefSuite(k5));
  // the construction first: each stand-in really takes its delay (else the row proves nothing)
  const slowPs = shimA >= DELAYS[0] * 1000 && shimB >= DELAYS[1] * 1000;
  const k6ok = (r) => r.code === 1 && /SLOW: budget 2\.0 s crossed/.test(r.out) && verdictOf(r) === `HARNESS-HYGIENE SLOW (budget 2 s, ${BUDGET_ENV})`;
  row(`budget (k6): with ps delayed ${DELAYS.join(' s and ')} s (a stand-in first on PATH; measured ${shimA} / ${shimB} ms), k3's run still ends on its own SLOW verdict line naming the 2 s budget, exit 1 — host diagnostics never run inside the timed window`,
    slowPs && k6ok(k6a) && k6ok(k6b), `stand-in ${shimA} / ${shimB} ms; ${DELAYS[0]} s: ${briefSuite(k6a)} || ${DELAYS[1]} s: ${briefSuite(k6b)}`);
  return rows;
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  const argOf = (f) => { const i = process.argv.indexOf(f); return i > 0 ? process.argv[i + 1] : undefined; };
  const rows = await runWdArms({ module: argOf('--module') ?? null, suiteSrc: argOf('--suite') });
  for (const r of rows) console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.name}${r.ok ? '' : ` :: ${r.detail}`}`);
  const bad = rows.filter((r) => !r.ok).length;
  console.log(`WD-ARMS ${bad ? 'FAIL' : 'PASS'} (${rows.length})`);
  process.exit(bad ? 1 : 0);
}
