// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-swupdate-retrigger.mjs — #1167: the update notice's take-over re-trigger, judged on the REAL
// app/swupdate.js in Node (no browser).
//
// After a Reload press posts skip-waiting, Chrome can hold the take-over: a fetch from another tab that
// restarts the outgoing worker in the instant it was stopped leaves it with the default idle delay and no
// new activation attempt, so the page sat inert until the 10 s belt reload. retriggerTakeover() fires one
// throwaway dedicated Worker per tick on an empty in-scope script (an in-scope main-resource request makes
// the browser retry the activation). This arm slices the constants and retriggerTakeover() from the
// source, runs them under a fake clock with a stub container / waiting worker / Worker factory, and
// judges:
//   TIMING   no tick at the press; the first one TICK_MS later, then one per TICK_MS, and TICK_MS is at
//            least FLOOR_MS (fixed here, not read from the code: a normal take-over is milliseconds)
//   CAP      never more than MAX_TICKS, and the last one at least CAP_MARGIN_MS before the belt (chained
//            timers drift; the belt is one timer set at the press)
//   STOP     no tick after controllerchange (and the listener is removed); none once the waiting worker
//            leaves 'installed' / 'activating' (activated, redundant)
//   WORKER   every Worker is terminated in the same task that created it, and its error handled
//            (preventDefault); a throwing Worker constructor stays inside the tick
//   URL      RETRIGGER_URL, resolved for a site served under a sub-path (as GitHub Pages serves web/), is
//            [scope] inside the worker's scope (the directory of sw.js), [exists] a file in web/, and
//            outside the snapshot: [snapshot] not a PRECACHE / PRECACHE_FILL entry of web/sw.js (whose
//            HANDLED_URLS is that manifest, so the worker passes it through with no fill kick) and
//            [walk] outside gen-sw-precache's walk (INVALID when the walk's anchors are not found)
//   WIRING   the Reload handler schedules the belt first, unconditionally, at its top level; then calls
//            the re-trigger only with a waiting worker, after posting skip-waiting, inside a try (a
//            throwing re-trigger never cancels the belt)
//   DEFAULTS its DEFAULT env runs under the browser's `this` rules, through a tick, a controllerchange
//            stop and a cap stop: setTimeout / clearTimeout called as env methods throw 'Illegal
//            invocation' in a browser (a lab run with no DevTools caught exactly that in a first draft:
//            no ticks and no belt, the page inert until +105 s), so the stubs here throw the same way;
//            and its Worker is started on RETRIGGER_URL
//
//   node web/tools/test-swupdate-retrigger.mjs [--src <swupdate.js>]
//   node web/tools/test-swupdate-retrigger.mjs --selftest     # plants on the tree's swupdate.js
// Exit 0 PASS, 1 FAIL, 2 INVALID (an anchor is missing).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(HERE, '..');
const SRC_DEFAULT = path.join(WEB, 'app', 'swupdate.js');
const ORIGIN = 'http://127.0.0.1:1';
// web/ served under a sub-path, as on GitHub Pages; the worker's scope is the directory of sw.js
const SCOPE = `${ORIGIN}/site/web/`;
const MODULE_URL = `${SCOPE}app/swupdate.js`;
const MECHS = ['TIMING', 'CAP', 'STOP', 'WORKER', 'URL', 'WIRING', 'DEFAULTS'];
const FLOOR_MS = 1000; // the shortest press -> first tick and tick spacing allowed
const CAP_MARGIN_MS = 2000; // the last tick at least this long before the belt

function lift(src) {
  const start = src.indexOf('const RETRIGGER_URL');
  const fnAt = src.indexOf('export function retriggerTakeover(');
  if (start < 0 || fnAt < 0) return { invalid: 'RETRIGGER_URL / retriggerTakeover not found' };
  // the function body ends at the first line that is exactly '}' after its start
  const end = src.indexOf('\n}\n', fnAt);
  if (end < 0) return { invalid: 'retriggerTakeover has no closing brace line' };
  const belt = src.match(/const RELOAD_BELT_MS = (\d+);/);
  if (!belt) return { invalid: 'RELOAD_BELT_MS not found' };
  const body = src.slice(start, end + 2).replace('export function', 'function').replaceAll('import.meta.url', JSON.stringify(MODULE_URL));
  // the browser globals the DEFAULT env reaches, under WebIDL's `this` rule: a timer called as a method of
  // another object throws (the clock behind them is swapped per run through browserGlobals)
  const strictThis = (name, fn) => function (...a) { if (this !== undefined && this !== globalThis) throw new TypeError(`Illegal invocation (${name})`); return fn(...a); };
  const setTimeoutB = strictThis('setTimeout', (f, ms) => browserGlobals.clock.setTimer(f, ms));
  const clearTimeoutB = strictThis('clearTimeout', (id) => browserGlobals.clock.clearTimer(id));
  class WorkerB { constructor(u) { this.url = u; this.terminated = false; this.onerror = null; browserGlobals.workers.push(this); } terminate() { this.terminated = true; } }
  // strict, as the module is: a sloppy slice would let an undeclared binding become a global and pass
  // eslint-disable-next-line no-new-func
  const make = new Function('navigator', 'Worker', 'setTimeout', 'clearTimeout', `"use strict";\n${body}\nreturn { RETRIGGER_URL, TICK_MS, MAX_TICKS, retriggerTakeover };`);
  return { ...make({ get serviceWorker() { return browserGlobals.sw; } }, WorkerB, setTimeoutB, clearTimeoutB), belt: Number(belt[1]) };
}
const browserGlobals = { clock: null, sw: null, workers: [] };

// a fake clock: timers run only through advance(); after(at) runs once each timer's task has returned
function clock(after = null) {
  let now = 0, seq = 0; const timers = [];
  return {
    get now() { return now; },
    setTimer: (fn, ms) => { const id = ++seq; timers.push({ id, at: now + ms, fn }); return id; },
    clearTimer: (id) => { const i = timers.findIndex((t) => t.id === id); if (i >= 0) timers.splice(i, 1); },
    advance(ms) {
      const end = now + ms;
      for (;;) { timers.sort((a, b) => a.at - b.at || a.id - b.id); const t = timers[0]; if (!t || t.at > end) break; timers.shift(); now = t.at; t.fn(); if (after) after(now); }
      now = end;
    },
  };
}
function env(c) {
  const listeners = new Map(); const workers = [];
  const sw = {
    addEventListener: (k, f) => { listeners.set(k, [...(listeners.get(k) || []), f]); },
    removeEventListener: (k, f) => { listeners.set(k, (listeners.get(k) || []).filter((g) => g !== f)); },
    fire: (k) => { for (const f of [...(listeners.get(k) || [])]) f({}); },
    count: (k) => (listeners.get(k) || []).length,
  };
  const makeWorker = (url) => { const w = { url, at: c.now, terminated: false, onerror: null, terminate() { this.terminated = true; } }; workers.push(w); return w; };
  return { sw, workers, e: { sw, makeWorker, setTimer: c.setTimer, clearTimer: c.clearTimer } };
}

function judgeLifted(L, src, files) {
  const red = Object.fromEntries(MECHS.map((m) => [m, []]));
  const run = (secs, waitingState = 'installed', action = null) => {
    // a Worker still running when the task that created it returns was not terminated at once
    const lateKill = [];
    let x = null;
    const c = clock((at) => { const live = x.workers.filter((w) => !w.terminated).length; if (live) lateKill.push(`${live} at ${at} ms`); });
    x = env(c); const waiting = { state: waitingState };
    L.retriggerTakeover(waiting, x.e);
    const atPress = x.workers.length;
    for (let ms = 0; ms < secs * 1000; ms += 250) { if (action) action(c.now, x, waiting); c.advance(250); }
    return { x, atPress, c, lateKill };
  };
  // TIMING
  {
    const { x, atPress } = run(L.TICK_MS * 3 / 1000 + 0.1);
    if (atPress !== 0) red.TIMING.push(`${atPress} Worker(s) at the press (want 0: a normal take-over is milliseconds)`);
    if (!(L.TICK_MS >= FLOOR_MS)) red.TIMING.push(`TICK_MS = ${L.TICK_MS} ms is below the ${FLOOR_MS} ms floor (a tick inside a normal take-over)`);
    const first = x.workers[0];
    if (!first || first.at !== L.TICK_MS) red.TIMING.push(`the first tick at ${first ? first.at : 'never'} ms (want ${L.TICK_MS})`);
    const gaps = x.workers.slice(1).map((w, i) => w.at - x.workers[i].at);
    if (gaps.some((g) => g !== L.TICK_MS)) red.TIMING.push(`tick spacing ${JSON.stringify(gaps)} (want ${L.TICK_MS})`);
  }
  // CAP
  {
    const { x } = run(60);
    if (x.workers.length !== L.MAX_TICKS) red.CAP.push(`${x.workers.length} ticks in 60 s with nothing taking over (want exactly MAX_TICKS = ${L.MAX_TICKS})`);
    if (L.MAX_TICKS * L.TICK_MS > L.belt - CAP_MARGIN_MS) red.CAP.push(`MAX_TICKS * TICK_MS = ${L.MAX_TICKS * L.TICK_MS} ms leaves less than ${CAP_MARGIN_MS} ms before the ${L.belt} ms belt`);
    const last = x.workers[x.workers.length - 1];
    if (last && last.at > L.belt - CAP_MARGIN_MS) red.CAP.push(`a tick at ${last.at} ms, less than ${CAP_MARGIN_MS} ms before the belt`);
  }
  // STOP
  {
    const { x } = run(8, 'installed', (now, xx) => { if (now === 2500) xx.sw.fire('controllerchange'); });
    const after = x.workers.filter((w) => w.at > 2500).length;
    if (after) red.STOP.push(`${after} tick(s) after controllerchange`);
    if (x.sw.count('controllerchange')) red.STOP.push('the controllerchange listener was not removed');
    for (const st of ['activated', 'redundant']) {
      const r = run(8, 'installed', (now, _xx, waiting) => { if (now === 3500) waiting.state = st; });
      const late = r.x.workers.filter((w) => w.at > 3500).length;
      if (late) red.STOP.push(`${late} tick(s) after the waiting worker went '${st}'`);
    }
    const act = run(4, 'activating');
    if (!act.x.workers.length) red.STOP.push("no tick while the waiting worker is 'activating' (a held activation is still retried)");
  }
  // WORKER
  {
    const { x, lateKill } = run(3.2);
    if (!x.workers.length) red.WORKER.push('no Worker was created');
    if (lateKill.length) red.WORKER.push(`Worker(s) still running when the tick's task returned: ${lateKill.join(', ')}`);
    else if (x.workers.some((w) => !w.terminated)) red.WORKER.push(`${x.workers.filter((w) => !w.terminated).length} Worker(s) not terminated`);
    let prevented = 0;
    for (const w of x.workers) {
      if (typeof w.onerror !== 'function') continue;
      w.onerror({ preventDefault: () => { prevented++; } });
    }
    if (prevented !== x.workers.length) red.WORKER.push(`the error is handled (preventDefault) on ${prevented} of ${x.workers.length} Worker(s)`);
    // an engine with no usable Worker: the throw stays inside the tick, and the next tick still comes
    const c = clock(); const y = env(c); let made = 0;
    y.e.makeWorker = () => { made++; throw new ReferenceError('Worker is not defined'); };
    try { L.retriggerTakeover({ state: 'installed' }, y.e); c.advance(L.TICK_MS * 2 + 1); } catch (e) { red.WORKER.push(`a throwing Worker constructor escapes the tick: ${e.message}`); }
    if (made === 1) red.WORKER.push('with a throwing Worker constructor the ticks stopped after the first');
  }
  // URL (each clause tagged, so the selftest can plant each on its own)
  {
    const { sw, gen } = files;
    const rm = gen.match(/const ROOT_FILES = (\[[^\]]*\]);/), dm = gen.match(/const WALK_DIRS = (\[[^\]]*\]);/);
    if (!rm || !dm) throw new Error("gen-sw-precache's ROOT_FILES / WALK_DIRS anchors were not found (the walk clause cannot judge)");
    const roots = JSON.parse(rm[1].replace(/'/g, '"')), dirs = JSON.parse(dm[1].replace(/'/g, '"'));
    if (!L.RETRIGGER_URL.startsWith(SCOPE)) red.URL.push(`[scope] ${L.RETRIGGER_URL} is outside the worker's scope ${SCOPE}`);
    else {
      const rel = L.RETRIGGER_URL.slice(SCOPE.length).replace(/[?#].*$/, '');
      if (!fs.existsSync(path.join(WEB, rel)) || !fs.statSync(path.join(WEB, rel)).isFile()) red.URL.push(`[exists] web/${rel} is not a file (a 404 would log a console error)`);
      if (sw.includes(`'./${rel}'`)) red.URL.push(`[snapshot] ./${rel} is a snapshot entry in web/sw.js (the worker would answer it and kick its fill)`);
      if (roots.includes(rel) || dirs.some((d) => rel.startsWith(`${d}/`))) red.URL.push(`[walk] ${rel} is inside gen-sw-precache's walk (${JSON.stringify({ roots, dirs })})`);
    }
  }
  // WIRING: inside the Reload handler, the belt first; then skip-waiting, then the re-trigger inside a try,
  // both only with a waiting worker
  {
    const m = src.match(/const waiting = reg\.waiting;\s*if \(waiting\) \{([\s\S]*?)\}\s*else reloadOnce\(\);/);
    if (!m) red.WIRING.push("the Reload handler's `if (waiting) { … } else reloadOnce();` block was not found");
    else {
      const blk = m[1];
      const a = blk.indexOf("waiting.postMessage({ ob: 'skip-waiting' })"), b = blk.indexOf('retriggerTakeover(waiting)');
      if (a < 0) red.WIRING.push('the waiting branch does not post skip-waiting');
      if (b < 0) red.WIRING.push('the waiting branch does not call retriggerTakeover(waiting)');
      if (a >= 0 && b >= 0 && b < a) red.WIRING.push('retriggerTakeover runs before skip-waiting is posted');
      if (b >= 0 && !/try \{\s*retriggerTakeover\(waiting\);\s*\} catch/.test(blk)) red.WIRING.push('retriggerTakeover is not guarded by a try (a throw would skip what follows)');
      const belt = src.lastIndexOf('setTimeout(reloadOnce, RELOAD_BELT_MS);', m.index);
      const handlerAnchor = "button('ob-btn--primary', 'update.reload', () => {";
      const handlerStart = src.lastIndexOf(handlerAnchor, m.index);
      if (handlerStart < 0) red.WIRING.push("the Reload handler's opening was not found");
      else if (belt < 0 || belt < handlerStart) red.WIRING.push('the belt is not scheduled before the waiting branch (a throwing re-trigger could cancel it)');
      else {
        // unconditional, at the handler's top level: its own statement line, braces balanced since the
        // handler opened, no return before it
        const before = src.slice(handlerStart + handlerAnchor.length, belt);
        const lineStart = src.slice(src.lastIndexOf('\n', belt) + 1, belt);
        const depth = (before.match(/\{/g) || []).length - (before.match(/\}/g) || []).length;
        if (!/^\s*$/.test(lineStart) || depth !== 0 || /\breturn\b/.test(before.replace(/\/\/.*$/gm, ''))) {
          red.WIRING.push(`the belt is not an unconditional statement at the handler's top level (line prefix ${JSON.stringify(lineStart.trim())}, brace depth ${depth})`);
        }
      }
    }
  }
  // DEFAULTS: the default env, under the browser's `this` rule: ticks, then a controllerchange stop (one
  // run) and a cap stop (another), so both timers run in each path that calls them
  for (const path_ of ['controllerchange', 'cap']) {
    const c = clock(); const x = env(c);
    browserGlobals.clock = c; browserGlobals.sw = x.sw; browserGlobals.workers = [];
    const waiting = { state: 'installed' };
    let threw = null;
    try {
      L.retriggerTakeover(waiting);
      for (let ms = 0; ms < 12000; ms += 250) { if (path_ === 'controllerchange' && ms === 3000) x.sw.fire('controllerchange'); c.advance(250); }
    } catch (e) { threw = e; }
    // only the defaults' own law here (timing, cap and termination are the other mechanisms')
    if (threw) red.DEFAULTS.push(`the default env throws in a browser (${path_} run): ${threw.message}`);
    else if (!browserGlobals.workers.length) red.DEFAULTS.push(`the default env started no Worker (${path_} run)`);
    else if (browserGlobals.workers.some((w) => w.url !== L.RETRIGGER_URL)) red.DEFAULTS.push(`the default Worker is started on ${JSON.stringify([...new Set(browserGlobals.workers.map((w) => w.url))])}, not RETRIGGER_URL`);
  }
  return red;
}

const readFiles = () => ({ sw: fs.readFileSync(path.join(WEB, 'sw.js'), 'utf8'), gen: fs.readFileSync(path.join(HERE, 'gen-sw-precache.mjs'), 'utf8') });
function judge(src, files = readFiles()) {
  try {
    const L = lift(src);
    if (L.invalid) return { invalid: [L.invalid], red: {} };
    return { invalid: [], red: judgeLifted(L, src, files) };
  } catch (e) { return { invalid: [`threw: ${e && e.message}`], red: {} }; }
}

// a plant edits swupdate.js (old -> new), or web/sw.js / gen-sw-precache.mjs (file: 'sw' | 'gen'); it must
// turn exactly its own mechanism red (and, with clause, only that tagged clause), or with invalid: true
// make the verdict INVALID
const PLANTS = [
  { mech: 'TIMING', name: 'a tick at the press', old: '  timer = env.setTimer(tick, TICK_MS);\n  return', new: '  tick();\n  return' },
  { mech: 'TIMING', name: 'ticks inside a normal take-over', old: 'const TICK_MS = 1000;', new: 'const TICK_MS = 10;' },
  { mech: 'CAP', name: 'no tick cap', old: 'if (n >= MAX_TICKS || (', new: 'if ((' },
  { mech: 'CAP', name: 'the cap reaches the belt', old: 'const MAX_TICKS = 8;', new: 'const MAX_TICKS = 10;' },
  { mech: 'CAP', name: 'the cap inside the belt margin', old: 'const MAX_TICKS = 8;', new: 'const MAX_TICKS = 9;' },
  { invalid: true, name: 'an undeclared binding (a ReferenceError in the strict module)', old: '  let n = 0, timer = null, done = false;', new: '  let timer = null, done = false; n = 0;' },
  { invalid: true, name: 'a constant the slice cannot evaluate', old: 'const MAX_TICKS = 8;', new: 'const MAX_TICKS = Math.floor(RELOAD_BELT_MS / TICK_MS) - 2;' },
  { mech: 'STOP', name: 'no stop on controllerchange', old: "  env.sw.addEventListener('controllerchange', stop);\n", new: '' },
  { mech: 'STOP', name: 'no stop when the waiting worker moves on', old: "(waiting.state !== 'installed' && waiting.state !== 'activating')", new: '(false)' },
  { mech: 'WORKER', name: 'the Worker left running', old: '      w.terminate();\n', new: '' },
  { mech: 'WORKER', name: 'the Worker terminated a moment later', old: '      w.terminate();\n', new: '      env.setTimer(() => w.terminate(), 100);\n' },
  { mech: 'WORKER', name: 'a throwing Worker constructor unguarded', old: '    } catch { /* no Worker here: the belt stays the only retry */ }\n', new: '    } finally { /* unguarded */ }\n' },
  { mech: 'WORKER', name: 'its error unhandled', old: '      w.onerror = (e) => { e.preventDefault(); };\n', new: '' },
  { mech: 'URL', name: 'a snapshot entry as the target', old: "new URL('../sw-retrigger.js', import.meta.url)", new: "new URL('./swupdate.js', import.meta.url)" },
  { mech: 'URL', clause: 'scope', name: 'a target at the origin root', old: "new URL('../sw-retrigger.js', import.meta.url)", new: "new URL('/sw-retrigger.js', import.meta.url)" },
  { mech: 'URL', clause: 'exists', name: 'a target that is not there', old: "new URL('../sw-retrigger.js', import.meta.url)", new: "new URL('../sw-retrigger-gone.js', import.meta.url)" },
  { mech: 'URL', clause: 'snapshot', name: 'the target made a snapshot entry', file: 'sw', old: 'const PRECACHE = [\n', new: "const PRECACHE = [\n  ['./sw-retrigger.js', '0000000000000000', 474],\n" },
  { mech: 'URL', clause: 'walk', name: 'the target inside the walk', file: 'gen', old: "const ROOT_FILES = ['app.html', 'manifest.webmanifest'];", new: "const ROOT_FILES = ['app.html', 'manifest.webmanifest', 'sw-retrigger.js'];" },
  { invalid: true, name: "the walk's anchors renamed", file: 'gen', old: 'const WALK_DIRS = ', new: 'const WALK_ROOTS = ' },
  { mech: 'WIRING', name: 'the handler never re-triggers', old: '        try { retriggerTakeover(waiting); } catch { /* the belt stays the retry */ }\n', new: '' },
  { mech: 'WIRING', name: 'the re-trigger unguarded', old: 'try { retriggerTakeover(waiting); } catch { /* the belt stays the retry */ }', new: 'retriggerTakeover(waiting);' },
  { mech: 'WIRING', name: 'the belt removed', old: "      setTimeout(reloadOnce, RELOAD_BELT_MS);\n      const waiting = reg.waiting;", new: "      const waiting = reg.waiting;" },
  { mech: 'WIRING', name: "the belt after the branch (the first draft's order)",
    old: "      setTimeout(reloadOnce, RELOAD_BELT_MS);\n      const waiting = reg.waiting;\n      if (waiting) {\n        waiting.postMessage({ ob: 'skip-waiting' });\n        try { retriggerTakeover(waiting); } catch { /* the belt stays the retry */ }\n      } else reloadOnce(); // it took over already (another tab's Reload)\n",
    new: "      const waiting = reg.waiting;\n      if (waiting) {\n        waiting.postMessage({ ob: 'skip-waiting' });\n        try { retriggerTakeover(waiting); } catch { /* the belt stays the retry */ }\n      } else reloadOnce(); // it took over already (another tab's Reload)\n      setTimeout(reloadOnce, RELOAD_BELT_MS);\n" },
  { mech: 'WIRING', name: 'a conditional belt', old: '      setTimeout(reloadOnce, RELOAD_BELT_MS);\n', new: '      if (!reg.waiting) setTimeout(reloadOnce, RELOAD_BELT_MS);\n' },
  { mech: 'WIRING', name: 'a return before the belt', old: '      setTimeout(reloadOnce, RELOAD_BELT_MS);\n', new: '      if (reg.waiting) return;\n      setTimeout(reloadOnce, RELOAD_BELT_MS);\n' },
  { mech: 'DEFAULTS', name: "a bare setTimeout in the default env (the first draft's bug)", old: 'setTimer: (f, ms) => setTimeout(f, ms),', new: 'setTimer: setTimeout,' },
  { mech: 'DEFAULTS', name: 'a bare clearTimeout in the default env', old: 'clearTimer: (id) => clearTimeout(id),', new: 'clearTimer: clearTimeout,' },
  { mech: 'DEFAULTS', name: 'the default Worker on another script', old: 'makeWorker: () => new Worker(RETRIGGER_URL),', new: "makeWorker: () => new Worker('./x.js')," },
];

let verdictPrinted = false;
const verdict = (line, code) => { verdictPrinted = true; console.log(line); process.exit(code); };
process.on('beforeExit', () => { if (!verdictPrinted) { verdictPrinted = true; console.log('[retrigger] INVALID: no verdict'); process.exitCode = 2; } });

const args = process.argv.slice(2);
const srcPath = path.resolve(args.includes('--src') ? args[args.indexOf('--src') + 1] : SRC_DEFAULT);
const src = fs.readFileSync(srcPath, 'utf8');
if (!args.includes('--selftest')) {
  const { invalid, red } = judge(src);
  if (invalid.length) verdict(`[retrigger] verdict INVALID: ${invalid.join('; ')}`, 2);
  for (const m of MECHS) console.log(`[retrigger] ${red[m].length ? 'FAIL' : 'ok'} ${m}${red[m].length ? `: ${red[m].join('; ')}` : ''}`);
  const reds = MECHS.filter((m) => red[m].length);
  if (reds.length) verdict(`[retrigger] verdict FAIL — ${reds.join(', ')}`, 1);
  verdict(`[retrigger] verdict PASS — ${MECHS.length} mechanisms (${MECHS.join(', ')})`, 0);
}
const base = judge(src);
if (base.invalid.length || MECHS.some((m) => base.red[m].length)) verdict(`[retrigger selftest] the tree's swupdate.js is not green: ${JSON.stringify(base)}`, 2);
let bad = 0;
const files0 = readFiles();
for (const p of PLANTS) {
  const target = p.file ? files0[p.file] : src;
  const n = target.split(p.old).length - 1;
  if (n !== 1) { console.log(`[retrigger selftest] INVALID plant "${p.name}": anchor count ${n}`); bad++; continue; }
  const r = p.file ? judge(src, { ...files0, [p.file]: target.replace(p.old, p.new) }) : judge(src.replace(p.old, p.new), files0);
  const hit = MECHS.filter((m) => r.red[m] && r.red[m].length);
  const clauses = p.clause ? r.red[p.mech].map((x) => (x.match(/^\[(\w+)\]/) || [])[1]) : [];
  const ok = p.invalid ? r.invalid.length > 0
    : !r.invalid.length && hit.length === 1 && hit[0] === p.mech && (!p.clause || (clauses.length === 1 && clauses[0] === p.clause));
  console.log(`[retrigger selftest] ${ok ? 'caught' : 'MISSED'} plant "${p.name}" -> ${p.invalid ? 'want INVALID' : 'red'} ${JSON.stringify(hit)}${p.clause ? ` clauses ${JSON.stringify(clauses)}` : ''}${r.invalid.length ? ` invalid ${JSON.stringify(r.invalid)}` : ''}`);
  if (!ok) bad++;
}
verdict(bad ? `[retrigger selftest] FAIL (${bad})` : `[retrigger selftest] OK: ${PLANTS.length} plants each caught on its own mechanism (or clause; ${PLANTS.filter((p) => p.invalid).length} INVALID)`, bad ? 1 : 0);
