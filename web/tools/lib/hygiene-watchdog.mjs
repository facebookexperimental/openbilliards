// Copyright (c) Meta Platforms, Inc. and affiliates.

// hygiene-watchdog.mjs — the e2e-harness-hygiene watchdog (GH-935 follow-up).
//
// Two questions the old single 420 s timer answered with one line ("harness hung"):
//   * is the suite still making progress?  A STALL — no check completed for STALL_MS — is the only path that
//     prints "harness hung". The line names the last completed check, its leg and how late the timer fired.
//   * did the suite fit its budget?  Crossing the budget while checks still complete is SLOW: the suite runs
//     on to completion (or the ceiling) and ends on a named SLOW verdict with the per-leg table, exit 1.
//     SLOW is never green and never "hung"; classifying it (box or tree) is triage on the step's own lines.
//
// Neither timer can fire while the event loop is blocked (a synchronous child call, an in-process scan), so
// every timer verdict prints its own lateness, and every check and finish() also read the three deadlines
// against elapsed time: a blocked stretch that carried the run past a deadline is judged at the next check or
// at the suite end, not excused because the timer never got a turn. Synchronous child calls in the suite carry
// a per-call `timeout:` (unboundedSyncCalls below is the static check), which bounds that lateness.
// A terminal verdict ("harness hung", the SLOW ceiling) is synchronous: it prints, runs the synchronous
// onVerdict diagnostics and exits inside the call that detected it, so no later check or leg runs after it.

import os from 'node:os';
import { execFile, execFileSync } from 'node:child_process';

// STALL_MS derivation (five nightly battery hygiene runs, two green and three red, measured from the logs'
// own timestamps): the largest gap between two consecutive check lines was 76.8 / 81.3 / 94.0 / 161.2 /
// 90.9 s, every time the 8j tree scan plus the committed lint. 161.2 s is the run that went about 2x slow
// everywhere. STALL_MS = ceil(1.5 x 161.2 s) = 242 s; the 1.5 margin is the only judgment in the number.
export const STALL_MS = 242000;
// CEILING_FACTOR derivation (the same five runs): the slowest run was about 2x the green one (the 8j leg
// 161 s vs 81 s), projecting a full suite to about 2 x 394 s = 788 s; the hard stop for a slow run that is
// still progressing is 2 x the budget.
export const CEILING_FACTOR = 2;
// per-call bound for a synchronous child call (the suite's existing probe convention)
export const SYNC_CHILD_TIMEOUT_MS = 20000;
// SYNC_LATENESS_BOUND_MS: the largest per-call timeout among the suite's synchronous child calls outside the
// --battery leg (the arm 8i fixture probe, 150000 ms); syncCallTimeouts below holds every call under it. With
// the run's in-process scan time, it bounds how late a timer can fire: max(this, the scans).
export const SYNC_LATENESS_BOUND_MS = 150000;

/** The leg a check belongs to: the check name up to its first colon ('8g f3', 'pacing (c)', '410 (ii)'). */
export function legOf(name) {
  const s = String(name);
  const i = s.indexOf(':');
  return (i > 0 ? s.slice(0, i) : s.split(' ').slice(0, 2).join(' ')).trim().slice(0, 40);
}

const sec = (ms) => (ms / 1000).toFixed(1);

/**
 * createWatchdog — arms the stall, budget and ceiling timers at creation.
 *   progress(name, ok)  one completed check (re-arms the stall timer); a deadline already past ends the run here
 *   finish()            the suite reached its end: reads the deadlines against elapsed time, clears the timers;
 *                       returns { slow, code } where code is 1 on SLOW (the caller ORs its own FAIL count in)
 *   stallDeadline()     the epoch ms at which the stall timer is due (callers bounding a wait by it)
 *   table(limit)        the per-leg wall lines (a check's wall = time since the previous check)
 * Hooks (all injectable for the fixtures): now, log, err, exit, onVerdict (synchronous, called before exit).
 * latenessBound() -> { ms, how }: the bound a stall line checks its own lateness against.
 */
export function createWatchdog({
  budgetMs, stallMs = STALL_MS, ceilingMs = CEILING_FACTOR * budgetMs, now = Date.now,
  log = (s) => console.log(s), err = (s) => console.error(s), exit = (c) => process.exit(c),
  onVerdict = () => {}, tag = '[hygiene]',
  latenessBound = () => ({ ms: SYNC_LATENESS_BOUND_MS, how: `the ${sec(SYNC_LATENESS_BOUND_MS)} s per-call timeout` }),
}) {
  const t0 = now();
  const budgetDue = t0 + budgetMs; const ceilingDue = t0 + ceilingMs;
  let last = t0; let lastName = null; let checks = 0; let fails = 0; let slow = false; let done = false;
  let slowAt = null;
  const legs = new Map();
  let stallDue = t0 + stallMs; let stallTimer = null;
  const tableLines = (limit = 12) => {
    const rows = [...legs.entries()].sort((a, b) => b[1].wall - a[1].wall);
    const shown = rows.slice(0, limit);
    const rest = rows.slice(limit);
    const out = shown.map(([leg, r]) => `${tag} LEG ${sec(r.wall).padStart(6)} s  ${leg} (${r.n} check${r.n === 1 ? '' : 's'}${r.fail ? `, ${r.fail} FAIL` : ''}, from +${sec(r.first - t0)} s)`);
    if (rest.length) out.push(`${tag} LEG ${sec(rest.reduce((s, [, r]) => s + r.wall, 0)).padStart(6)} s  (${rest.length} more legs)`);
    return out;
  };
  const slowest = (k = 5) => [...legs.entries()].sort((a, b) => b[1].wall - a[1].wall).slice(0, k)
    .map(([leg, r]) => `${leg} ${sec(r.wall)} s`).join(', ');
  const at = () => (lastName === null ? 'before the first check' : `'${lastName}' (leg ${legOf(lastName)}) at +${sec(last - t0)} s`);
  const boundText = (lateMs) => {
    let b = null;
    try { b = latenessBound(); } catch { /* reported below */ }
    if (!b || !Number.isFinite(b.ms)) return '; lateness bound unavailable';
    return `; lateness bound ${sec(b.ms)} s (${b.how}): ${lateMs <= b.ms ? 'within' : 'EXCEEDED'}`;
  };
  let timers = [];
  const stop = () => { for (const t of timers) clearTimeout(t); timers = []; if (stallTimer) clearTimeout(stallTimer); stallTimer = null; };
  // no await between the verdict and the exit: the caller's control flow stops where it stands
  const verdictExit = (lines) => {
    if (done) return;
    done = true; stop();
    for (const l of lines) err(l);
    for (const l of tableLines(Infinity)) err(l);
    try { onVerdict(); } catch { /* the verdict already stands */ }
    exit(1);
  };
  // the deadlines against elapsed time (two comparisons, no await), at every check and at finish(): a deadline
  // the event loop was blocked through is judged here. true = a terminal verdict was issued.
  const reconcile = (t, where, rest) => {
    if (t > stallDue) {
      // the gap outran the stall bound while the event loop was blocked (the timer never got a turn); the
      // check that ended the block does not excuse it
      verdictExit([`${tag} FAIL harness hung: no check completed for ${sec(t - last)} s (stall bound ${sec(stallMs)} s), `
        + `measured at ${where}; last completed check ${at()}; the event loop was blocked `
        + `${sec(t - stallDue)} s past the bound${boundText(t - stallDue)}`]);
      return true;
    }
    if (t >= ceilingDue) {
      verdictExit([`${tag} SLOW: ceiling ${sec(ceilingMs)} s reached (measured at ${where}, ${sec(t - ceilingDue)} s past it; the timer had no turn) `
        + `after ${checks} checks (${fails} FAIL); last completed check ${at()}; ${rest}; slowest legs: ${slowest()}`]);
      return true;
    }
    if (!slow && t >= budgetDue) {
      slow = true; slowAt = t;
      log(`${tag} SLOW: budget ${sec(budgetMs)} s crossed (measured at ${where}, ${sec(t - budgetDue)} s past it; the timer had no turn); `
        + `last completed check ${at()}; continuing to completion or the ${sec(ceilingMs)} s ceiling`);
    }
    return false;
  };
  const armStall = () => {
    if (stallTimer) clearTimeout(stallTimer);
    stallDue = last + stallMs;
    const due = stallDue;
    stallTimer = setTimeout(() => {
      const late = now() - due;
      verdictExit([`${tag} FAIL harness hung: no check completed for ${sec(stallMs)} s; last completed check ${at()}; `
        + `fired ${sec(Math.max(0, late))} s late (event loop blocked that long)${boundText(late)}`]);
    }, Math.max(0, due - now()));
    stallTimer.unref?.();
  };
  armStall();
  const tb = setTimeout(() => {
    if (done) return;
    slow = true; slowAt = now();
    log(`${tag} SLOW: budget ${sec(budgetMs)} s crossed (fired ${sec(Math.max(0, slowAt - budgetDue))} s late); last completed check ${at()}; `
      + `continuing to completion or the ${sec(ceilingMs)} s ceiling`);
  }, budgetMs);
  tb.unref?.();
  const tc = setTimeout(() => {
    verdictExit([`${tag} SLOW: ceiling ${sec(ceilingMs)} s reached (fired ${sec(Math.max(0, now() - ceilingDue))} s late) after ${checks} checks `
      + `(${fails} FAIL); last completed check ${at()}; the remaining legs did not run; slowest legs: ${slowest()}`]);
  }, ceilingMs);
  tc.unref?.();
  timers = [tb, tc];
  return {
    progress(name, ok = true) {
      if (done) return;
      const t = now();
      if (reconcile(t, `the next check '${String(name)}'`, 'the remaining legs did not run')) return;
      const leg = legOf(name);
      const r = legs.get(leg) ?? { wall: 0, n: 0, fail: 0, first: last };
      r.wall += t - last; r.n++; if (!ok) r.fail++;
      legs.set(leg, r);
      checks++; if (!ok) fails++;
      last = t; lastName = String(name);
      armStall();
    },
    finish() {
      if (done) return { slow, code: 1 };
      const t = now();
      if (reconcile(t, 'the suite end', 'every leg had run')) return { slow: true, code: 1 };
      done = true; stop();
      const wall = t - t0;
      if (slow) {
        err(`${tag} SLOW: budget ${sec(budgetMs)} s, wall ${sec(wall)} s, ${checks} checks (${fails} FAIL); slowest legs: ${slowest()}`);
        for (const l of tableLines(Infinity)) err(l);
        return { slow, code: 1 };
      }
      log(`${tag} WALL ${sec(wall)} s of budget ${sec(budgetMs)} s, ${checks} checks; slowest legs: ${slowest()}`);
      for (const l of tableLines()) log(l);
      return { slow, code: 0 };
    },
    stallDeadline: () => stallDue,
    table: tableLines,
    get slow() { return slow; },
  };
}

const PS_ARGS = ['-axo', 'stat=,nice='];
const loadHead = (phase, tag) => {
  const cores = os.cpus().length;
  const l1 = os.loadavg()[0];
  return `${tag} LOAD ${phase}: load1 ${l1.toFixed(2)} (cores ${cores}, load1/cores ${(l1 / cores).toFixed(2)})`;
};
const loadTail = (head, e, out) => {
  if (e) return `${head}, runnable nice-0 unavailable: ${String(e.message).split('\n')[0].slice(0, 120)}`;
  const rows = out.split('\n').map((l) => l.trim().split(/\s+/)).filter((p) => p.length >= 2 && p[0]);
  if (!rows.length) return `${head}, runnable nice-0 unavailable: ps printed no rows`;
  const run0 = rows.filter((p) => p[0].startsWith('R') && Number(p[1]) === 0).length;
  return `${head}, runnable nice-0 ${run0} of ${rows.length} processes`;
};

/** One LOAD line from the step's own box: load1 and the runnable nice-0 processes (one async ps, bounded).
 * A failed sample prints `unavailable` with its error, never a zero. */
export function loadLine(phase, { tag = '[hygiene]', timeoutMs = 5000 } = {}) {
  const head = loadHead(phase, tag);
  return new Promise((resolve) => {
    execFile('ps', PS_ARGS, { encoding: 'utf8', timeout: timeoutMs, maxBuffer: 16 << 20 }, (e, out) => resolve(loadTail(head, e, out)));
  });
}

/** loadLine with one synchronous ps (bounded): the terminal verdict's diagnostics, which must not yield. */
export function loadLineSync(phase, { tag = '[hygiene]', timeoutMs = 5000 } = {}) {
  const head = loadHead(phase, tag);
  try {
    return loadTail(head, null, execFileSync('ps', PS_ARGS, { encoding: 'utf8', timeout: timeoutMs, maxBuffer: 16 << 20 }));
  } catch (e) { return loadTail(head, e, ''); }
}

const SYNC_CALLEES = new Set(['spawnSync', 'execFileSync', 'execSync']);
const KNOWN_TIMEOUTS = { SYNC_CHILD_TIMEOUT_MS };
/** Every synchronous child call in `source`: [{ line, callee, timeoutMs, battery, why }]. timeoutMs is null when
 * the options carry no readable `timeout` (no options object literal, no property, or a value that is neither a
 * number literal nor SYNC_CHILD_TIMEOUT_MS). battery: the call sits inside an `if (BATTERY …)` branch.
 * Read with the repo's one patched acorn reader, so code inside a string (a fixture's source) is not a call. */
export async function syncCallTimeouts(source) {
  const { obParser, OB_PARSE_OPTIONS } = await import('../../../tools/render/lib/acorn-obparser.mjs');
  const ast = obParser().parse(source, OB_PARSE_OPTIONS);
  const out = [];
  const mentionsBattery = (t) => JSON.stringify(t, (k, v) => (k === 'loc' ? undefined : v)).includes('"name":"BATTERY"');
  const walk = (n, battery = false) => {
    if (!n || typeof n.type !== 'string') return;
    if (n.type === 'IfStatement' && mentionsBattery(n.test)) {
      walk(n.test, battery); walk(n.consequent, true); walk(n.alternate, battery);
      return;
    }
    if (n.type === 'CallExpression') {
      const c = n.callee;
      const name = c.type === 'Identifier' ? c.name : (c.type === 'MemberExpression' && !c.computed ? c.property.name : null);
      if (SYNC_CALLEES.has(name)) {
        const minArgs = name === 'execSync' ? 1 : 2;
        const opt = n.arguments.length > minArgs - 1 ? n.arguments[n.arguments.length - 1] : null;
        const isOpts = opt && opt.type === 'ObjectExpression';
        const prop = isOpts ? opt.properties.find((p) => p.type === 'Property' && !p.computed
          && ((p.key.type === 'Identifier' && p.key.name === 'timeout') || (p.key.type === 'Literal' && p.key.value === 'timeout'))) : null;
        const v = prop?.value;
        const timeoutMs = !v ? null : (v.type === 'Literal' && typeof v.value === 'number') ? v.value
          : (v.type === 'Identifier' && v.name in KNOWN_TIMEOUTS) ? KNOWN_TIMEOUTS[v.name] : null;
        const why = !isOpts ? 'no options object literal' : !prop ? 'no timeout property' : timeoutMs === null ? 'timeout value not readable' : '';
        out.push({ line: source.slice(0, n.start).split('\n').length, callee: name, timeoutMs, battery, why });
      }
    }
    for (const k of Object.keys(n)) {
      if (k === 'loc') continue;
      const v = n[k];
      if (Array.isArray(v)) v.forEach((x) => walk(x, battery)); else if (v && typeof v === 'object') walk(v, battery);
    }
  };
  walk(ast);
  return out;
}

/** The synchronous child calls that break the lateness bound: no readable timeout, a timeout that is not
 * positive (node reads `timeout: 0` as no timeout), or (outside the --battery leg, whose stall bound is its
 * whole budget) a timeout above SYNC_LATENESS_BOUND_MS. */
export async function unboundedSyncCalls(source) {
  return (await syncCallTimeouts(source))
    .filter((c) => c.timeoutMs === null || !(c.timeoutMs > 0) || (!c.battery && c.timeoutMs > SYNC_LATENESS_BOUND_MS))
    .map((c) => ({ ...c, why: c.why || (c.timeoutMs > 0 ? `timeout ${c.timeoutMs} ms above the ${SYNC_LATENESS_BOUND_MS} ms bound`
      : `timeout ${c.timeoutMs} ms is not a positive bound (0 means no timeout)`) }));
}
