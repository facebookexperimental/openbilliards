// Copyright (c) Meta Platforms, Inc. and affiliates.

// GH-1092: run the actual worker-stop leg against deterministic worker and
// timer schedules. The browser experiment supplies the real-link evidence;
// this arm protects staging, cleanup and the unchanged failure predicates.
// GH-1039 P4: 'completion-line-before-census-count' — the worker logs
// "fill complete" while the page's census still returns the earlier count
// once (its keys() was issued before the last writes landed): the resume
// check must count again on the line, never judge the stale sample.
// #1112: the reader lifts legSwStop up to its own closing brace (V8 finds it), so
// later exports and module code never enter the lifted body; four extraction
// cases over sources of the arm's own hold the reader to that.
// node web/tools/test-swstop-staging.mjs [--source path/to/native.mjs]
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

export const PORT_FLAGS = {};

/** #1112: the end (exclusive) of the function declared at `at` ('export async function name(…'): the first '}' at which
 * the declaration, without its `export`, compiles as one function expression. V8 does the parsing, so a brace inside a
 * string, template literal, comment or regular expression never ends it, and nothing after the function (more exports,
 * executable module code) is lifted. Throws when no prefix compiles. */
export function functionEnd(source, at) {
  const fnStart = source.startsWith('export ', at) ? at + 'export '.length : at;
  for (let p = source.indexOf('}', fnStart); p >= 0; p = source.indexOf('}', p + 1)) {
    try { new vm.Script(`(${source.slice(fnStart, p + 1)})`); return p + 1; } catch { /* not the function's end yet */ }
  }
  throw new Error('Native worker-stop source: no prefix of legSwStop parses as one function (it never closes, or it uses a '
    + 'module-only construct such as import.meta, which a lifted script body cannot hold)');
}

export function sourceBodies(source) {
  const begin = source.indexOf('const FILL_HOLD_MS = ');
  const leg = source.indexOf('export async function legSwStop(');
  if (begin < 0 || leg <= begin) throw new Error('Native worker-stop source boundaries moved');
  // legSwStop ALONE, up to its own closing brace (#1112): the leg module exports more legs after it (legSwUpdate,
  // #1047) and defines helpers between them; a second `export` inside the vm body is a SyntaxError, and module code
  // after the function would run in the lifted body
  const stop = source.slice(leg, functionEnd(source, leg));
  return source.slice(begin, leg) + stop.replace('export async function', 'async function');
}

/** #1112's extraction arm: the reader over small sources of its own, independent of the native leg — a trailing export,
 * executable module code after the function, braces inside strings / a template / a regex / comments, and a missing
 * target. Each case lifts legSwStop alone and runs it; [{ name, ok, detail }] */
export async function extractionCases() {
  const lift = async (source) => {
    const body = sourceBodies(source);
    return { body, value: await vm.runInContext(`${body}\nlegSwStop({})`, vm.createContext({}), { timeout: 1000 }) };
  };
  const out = [];
  const run = async (name, fn) => { try { out.push({ name, ...(await fn()) }); } catch (e) { out.push({ name, ok: false, detail: String(e) }); } };
  await run('a trailing export stays out', async () => {
    const r = await lift("const FILL_HOLD_MS = 1;\nexport async function legSwStop(o) { return 'stop'; }\nexport async function legSwUpdate() { return 'update'; }\n");
    return { ok: r.value === 'stop' && !r.body.includes('legSwUpdate'), detail: r };
  });
  await run('executable module code after the function never runs', async () => {
    const r = await lift("const FILL_HOLD_MS = 1;\nexport async function legSwStop(o) { return 'stop'; }\nthrow new Error('module tail executed');\n");
    return { ok: r.value === 'stop' && !r.body.includes('module tail'), detail: r };
  });
  await run('braces in strings, a template, a regex and comments do not end it', async () => {
    const r = await lift("const FILL_HOLD_MS = 1;\nexport async function legSwStop(o) {\n  const a = { b: { c: '}' } }; const re = /\\}+/; const t = `${'}'}{`; // }\n"
      + "  /* } { */ if (a.b.c === '}' && re.test('}}') && t === '}{') { return 'stop'; }\n  return 'wrong';\n}\nconst after = 1; tail();\n");
    return { ok: r.value === 'stop' && r.body.trimEnd().endsWith("return 'wrong';\n}") && !r.body.includes('tail()'), detail: r };
  });
  await run('a missing target is refused by name', async () => {
    try { sourceBodies("const FILL_HOLD_MS = 1;\nexport async function legSwUpdate() {}\n"); return { ok: false, detail: 'lifted' }; } catch (e) {
      return { ok: /boundaries moved/.test(String(e)), detail: String(e) };
    }
  });
  return out;
}

async function runSchedule(body, scenario) {
  let clock = 0, nextTimer = 0, calls = 0, stage = 'activation';
  let entries = 1, running = true, stopCount = 0, messages = 0;
  let swFetch = null, completionAt = Infinity, complete = false, returned = false;
  let secondNavigationAt = null, closeCount = 0, browserCloseCount = 0, staleReads = 0, staleEntries = 0;
  const timers = new Map(), intervals = new Map(), pauses = [], stops = [], failures = [], logs = [];
  const total = 49;
  const sw = { console: [], maxInflight: scenario.excessInflight ? 13 : 6,
    exc: scenario.workerException ? ['controlled worker exception'] : [] };
  const update = () => {
    if (!complete && clock >= completionAt && !scenario.stalledFill) {
      complete = true;
      if (scenario.staleCensusAtCompletion) { staleReads = 1; staleEntries = entries; }
      entries = total;
      if (!scenario.noCompletionLine) sw.console.push('[sw] fill complete (3 turns, 0 refused)');
    }
  };
  const setTimer = (callback, ms) => { const id = ++nextTimer; timers.set(id, { at: clock + ms, callback }); return id; };
  const advance = (ms) => {
    const end = clock + ms;
    for (let n = 0; n < 5000; n++) {
      const due = [...timers.entries()].filter(([, v]) => v.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) { clock = end; update(); return; }
      clock = due[1].at;
      timers.delete(due[0]);
      due[1].callback();
      update();
    }
    throw new Error('Unbounded native timer schedule');
  };
  const pause = (kind, url, onGo = () => {}) => {
    const row = { kind, stage, at: clock, released: [], afterReturn: [] };
    pauses.push(row);
    swFetch.onPaused({ request: { url } }, { go: () => {
      row.released.push(clock); row.afterReturn.push(returned); onGo();
    } });
  };
  const snapshot = () => {
    update();
    if (staleReads > 0) { staleReads--; return { entries: staleEntries, ready: true, reg: { active: 'activated' } }; }
    return { entries, ready: true, reg: { active: 'activated' } };
  };
  const c = {
    async send(method) {
      if (++calls > 1400) throw new Error('Unbounded native CDP schedule');
      if (method !== 'Page.navigate') throw new Error('Unexpected native command: ' + method);
      if (stopCount < 2) {
        pause('boot', 'http://127.0.0.1:12345/boot.js');
        pause('activation-fill', 'http://127.0.0.1:12345/fill-0.js');
      } else {
        secondNavigationAt = clock;
        stage = 'reload-resume';
        // Five serial groups remain after the staged stops. A controlled
        // link cost is independent of the native Fetch delay being tested.
        const wave = (n) => {
          if (!n) { completionAt = clock + (scenario.linkWorkMs ?? 100); return; }
          pause('resume-fill', 'http://127.0.0.1:12345/fill-' + n + '.js', () => wave(n - 1));
        };
        wave(5);
      }
      return {};
    },
    async eval(expression) {
      if (++calls > 1400) throw new Error('Unbounded native CDP schedule');
      if (expression === 'native-sw-probe') return snapshot();
      if (expression.startsWith('caches.match(')) return complete && !scenario.missingLateEntry;
      if (expression.includes("postMessage({ ob: 'fill', why: 'client' })")) {
        messages++;
        if (messages === 1) {
          stage = 'client-rearm'; running = true;
          pause('client-rearm-fill', 'http://127.0.0.1:12345/fill-1.js', () => {
            if (!scenario.clientNeverProgresses) entries = 19;
          });
        } else if (scenario.corruptCompleteSnapshot) entries = total - 1;
        return undefined;
      }
      throw new Error('Unexpected native evaluation: ' + expression);
    },
    close() { closeCount++; },
  };
  const context = vm.createContext({
    Date: { now: () => clock }, console: { log: (line) => logs.push(line) },
    setTimeout: setTimer, clearTimeout: (id) => timers.delete(id),
    setInterval: (callback, ms) => { const id = ++nextTimer; intervals.set(id, { callback, ms }); return id; },
    clearInterval: (id) => intervals.delete(id),
    sleep: async (ms) => advance(ms),
    pathOf: (url) => { const u = new URL(url); return u.pathname.slice(1) + u.search; },
    readSwManifest: () => ({ boot: ['./boot.js'],
      fill: [...Array.from({ length: 47 }, (_, i) => './fill-' + i + '.js'), './assets/table/soil.json'] }),
    newSwPage: async () => c,
    swControl: async () => ({
      running: () => running ? { versionId: 'v' } : null,
      versions: new Map([['v', {}]]),
      async stop() {
        stopCount++;
        if (stopCount === 1 && scenario.missingFirstStop) return null;
        running = false;
        stage = stopCount === 1 ? 'first-stop' : 'second-stop';
        stops.push({ number: stopCount, at: clock, entries });
        pause('pending-' + stage, 'http://127.0.0.1:12345/fill-pending.js');
        if (stopCount === 2) running = true; // the following navigation restarts it
        return { versionId: 'v', runningStatus: 'stopped' };
      },
    }),
    attachBrowserSession: async (_cdp, options) => {
      swFetch = options.swFetch;
      return { sw, onEvent: (cb) => cb('Target.attachedToTarget', {
        targetInfo: { type: 'service_worker' }, sessionId: 'worker' }),
      sendTo: async () => ({}), close: () => { browserCloseCount++; } };
    },
    waitActivated: async () => {
      if (scenario.throwDuringActivation) throw new Error('controlled activation transport error');
      if (scenario.neverActivated) return null;
      advance(1500);
      entries = scenario.earlyActivation ? 1 : 13;
      if (!scenario.noActivationLine) sw.console.push('[sw] fill first turn inside activate: 13 cached, 12 left');
      return snapshot();
    },
    isActivated: (value) => value?.reg?.active === 'activated',
    SW_PROBE: 'native-sw-probe', WEB_DIR: 'unused', path: { join: (...a) => a.join('/') },
    fs: { readFileSync: () => "postMessage({ ob: 'fill'" },
    // The source arm calls itself at leg entry in production. Its own
    // invocation is a no-op only in this lifted execution, avoiding recursion.
    runSwStopStagingArm: async () => {},
    options: { PORT: 12345, cdp: 12360, fail: (line) => failures.push(line), log: (line) => logs.push(line) },
  });
  let error = null;
  try { await vm.runInContext(body + '\nlegSwStop(options)', context, { timeout: 1000 }); }
  catch (cause) { error = String(cause); }
  const pendingAtReturn = timers.size;
  const endedAt = clock;
  returned = true;
  advance(5000); // late callbacks are observed, never discarded by this arm
  return { name: scenario.name, failures, logs, error, pauses, stops, secondNavigationAt,
    pendingAtReturn, intervalCount: intervals.size, endedAt, calls, closeCount, browserCloseCount };
}

export async function runSwStopStagingArm({
  source = fs.readFileSync(new URL('./e2e-userboot-3g-sw.mjs', import.meta.url), 'utf8'),
  fail = (message) => console.error(message), log = console.log,
} = {}) {
  const body = sourceBodies(source);
  const schedules = [
    { name: 'normal-resume', full: true },
    { name: 'link-work-near-original-budget', full: true, linkWorkMs: 176000 },
    { name: 'completion-line-before-census-count', full: true, staleCensusAtCompletion: true },
    { name: 'stalled-fill-stays-red', full: true, stalledFill: true, required: ['did not complete the fill', 'late fill entry is missing', 'no "[sw] fill complete"', 'changed the snapshot'] },
    { name: 'missing-late-entry-stays-red', full: true, missingLateEntry: true, required: ['late fill entry is missing'] },
    { name: 'missing-completion-line-stays-red', full: true, noCompletionLine: true, required: ['no "[sw] fill complete"'] },
    { name: 'corrupt-complete-snapshot-stays-red', full: true, corruptCompleteSnapshot: true, required: ['changed the snapshot'] },
    { name: 'missing-activation-line-stays-red', full: true, noActivationLine: true, required: ['no "fill first turn inside activate"'] },
    { name: 'early-activation-stays-red', full: true, earlyActivation: true, required: ['activation completed before the first fill chunk'] },
    { name: 'excess-concurrency-stays-red', full: true, excessInflight: true, required: ['requests in flight'] },
    { name: 'worker-exceptions-stay-red', full: true, workerException: true, required: ['SW exceptions:', 'SW exceptions after the no-op re-arm:'] },
    { name: 'client-rearm-without-progress-stays-red', full: true, clientNeverProgresses: true, required: ['re-arm message did not resume'] },
    { name: 'activation-failure-cleans-staging', neverActivated: true, required: ['never activated'] },
    { name: 'activation-transport-error-cleans-staging', throwDuringActivation: true, error: 'controlled activation transport error' },
    { name: 'missing-first-stop-stays-red', missingFirstStop: true, required: ['no running activated version to stop'] },
  ];
  let ok = 0, red = 0;
  const rows = [];
  const check = (name, value, detail) => {
    if (value) { ok++; return; }
    red++;
    fail(`SWSTOP-STAGING ${name}: ${JSON.stringify(detail)}`);
  };
  for (const scenario of schedules) {
    const row = await runSchedule(body, scenario);
    rows.push(row);
    check(row.name + ' preserves the native outcome', scenario.error
      ? row.error?.includes(scenario.error)
      : !row.error && (scenario.required
        ? scenario.required.every((s) => row.failures.some((f) => f.includes(s)))
        : row.failures.length === 0), { error: row.error, failures: row.failures });
    check(row.name + ' closes both native sessions', row.closeCount === 1 && row.browserCloseCount === 1, row);
    check(row.name + ' leaves no timer or delayed response', row.pendingAtReturn === 0 && row.intervalCount === 0
      && row.pauses.every((p) => p.released.length === 1 && p.afterReturn.every((v) => !v)), row);
    check(row.name + ' leaves boot requests unheld', row.pauses.filter((p) => p.kind === 'boot')
      .every((p) => p.released[0] === p.at), row);
    if (!scenario.full) continue;
    check(row.name + ' reaches both native stops', row.stops.length === 2 && row.stops.every((s) => s.entries < 49), row);
    check(row.name + ' retains stop-staging delay', row.pauses.filter((p) =>
      ['activation-fill', 'pending-first-stop', 'client-rearm-fill'].includes(p.kind))
      .every((p) => p.released[0] - p.at === 1500), row);
    check(row.name + ' drains the second-stop timer before navigation', row.pauses.filter((p) => p.kind === 'pending-second-stop')
      .every((p) => p.released[0] === row.stops[1].at && p.released[0] <= row.secondNavigationAt), row);
    check(row.name + ' never adds staging delay to resume', row.pauses.filter((p) => p.kind === 'resume-fill')
      .length === 5 && row.pauses.filter((p) => p.kind === 'resume-fill').every((p) => p.released[0] === p.at), row);
    if (scenario.stalledFill) check(row.name + ' preserves the 180s completion budget',
      row.endedAt - row.secondNavigationAt === 182500, row);
  }
  const cases = await extractionCases();
  for (const c of cases) check(`extraction: ${c.name}`, c.ok, c.detail);
  log(`SWSTOP-STAGING: ${ok} OK / ${red} RED (${rows.length} native lifecycle schedules; two stops, original budgets and cache predicates; `
    + `${cases.length} extraction cases)`);
  return { ok, red, rows };
}

const isMain = () => { try { return fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } };
if (isMain()) {
  const args = process.argv.slice(2);
  if (args.length && !(args.length === 2 && args[0] === '--source')) throw new Error('Use only --source PATH');
  const result = await runSwStopStagingArm(args.length ? { source: fs.readFileSync(args[1], 'utf8') } : {});
  if (result.red) process.exitCode = 1;
}
