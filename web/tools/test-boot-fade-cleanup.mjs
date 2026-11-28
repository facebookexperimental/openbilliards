// Copyright (c) Meta Platforms, Inc. and affiliates.

// GH-1061: delayed rendering must not let a wall-clock fallback remove an
// opaque foreground boot field. Execute the shipped inline driver against
// explicit event/visibility schedules; native CSS ordering stays covered by
// e2e-userboot-firstframe. No browser or real-time performance measurement.
// node web/tools/test-boot-fade-cleanup.mjs [--html path/to/app.html]
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

export const PORT_FLAGS = {};

function fadeDriver(html) {
  const start = html.indexOf('  function remove() {');
  const end = html.indexOf('  // ---- copy ', start);
  if (start < 0 || end <= start) throw new Error('Boot remove/fade source boundaries moved');
  return html.slice(start, end);
}

function simulate(code, scenario) {
  let time = 0, opacity = 1, cause = 'initial', serial = 0;
  let maxTimers = 0, maxFrames = 0, queuedAfterRemoval = 0, steps = 0;
  const jobs = [], suspendedFrames = [], removals = [], rootEnds = [], listeners = new Map();
  const classes = new Set(), documentState = { hidden: !!scenario.hidden };
  const el = {
    isConnected: true,
    classList: { contains: (name) => classes.has(name), add: (name) => classes.add(name) },
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    parentNode: { removeChild(node) {
      if (node !== el) throw new Error('Wrong boot node removed');
      removals.push({ time, opacity, hidden: documentState.hidden, cause });
      el.isConnected = false; el.parentNode = null;
    } },
  };
  function queue(fn, delay, kind) {
    if (!el.isConnected) queuedAfterRemoval++;
    const job = { time: time + delay, fn, kind, id: ++serial };
    if (kind === 'frame' && scenario.framesStopped) suspendedFrames.push(job);
    else jobs.push(job);
    maxTimers = Math.max(maxTimers, jobs.filter((j) => j.kind === 'timer').length);
    maxFrames = Math.max(maxFrames, jobs.filter((j) => j.kind === 'frame').length + suspendedFrames.length);
    return job.id;
  }
  const context = vm.createContext({
    el, gone: false, document: documentState,
    matchMedia: () => ({ matches: !!scenario.reduced }),
    getComputedStyle: () => ({ opacity: String(opacity) }),
    setTimeout: (fn, ms) => queue(fn, ms, 'timer'),
    requestAnimationFrame: (fn) => queue(fn, 16, 'frame'),
    parseFloat,
  });
  vm.runInContext(code + '\nfade();', context, { filename: 'shipped-boot-fade.js', timeout: 1000 });
  function event(target, propertyName, type = 'transitionend') {
    if (!el.isConnected) return;
    const e = { target: target === 'root' ? el : {}, propertyName };
    if (target === 'root' && propertyName === 'opacity' && type === 'transitionend') {
      rootEnds.push({ time, opacity });
    }
    for (const fn of listeners.get(type) ?? []) fn(e);
  }
  const external = (at, why, fn) => jobs.push({ time: at, cause: why, fn, kind: 'external', id: ++serial });
  external(150, 'child-opacity-end', () => event('child', 'opacity'));
  external(180, 'child-transform-end', () => event('child', 'transform'));
  if (scenario.rootEnd !== undefined) external(scenario.rootEnd, 'root-opacity-end', () => {
    opacity = 0; event('root', 'opacity');
  });
  if (scenario.silentEnd !== undefined) external(scenario.silentEnd, 'silent-opacity-end', () => { opacity = 0; });
  if (scenario.cancelAt !== undefined) external(scenario.cancelAt, 'root-opacity-cancel', () => {
    opacity = 0; event('root', 'opacity', 'transitioncancel');
  });
  if (scenario.hiddenAt !== undefined) external(scenario.hiddenAt, 'visibility-hidden', () => { documentState.hidden = true; });
  // A fixed virtual observation horizon, not a new production deadline.
  while (jobs.length) {
    jobs.sort((a, b) => a.time - b.time || a.id - b.id);
    if (jobs[0].time > 2000) break;
    if (++steps > 1000) throw new Error('Unbounded cleanup callback loop');
    const job = jobs.shift(); time = job.time; cause = job.cause ?? job.kind; job.fn();
  }
  return { name: scenario.name, removals, rootEnds, connected: el.isConnected,
    outClass: classes.has('ob-boot--out'), maxTimers, maxFrames, queuedAfterRemoval,
    pendingTimers: jobs.filter((j) => j.kind === 'timer').length,
    pendingFrames: jobs.filter((j) => j.kind === 'frame').length + suspendedFrames.length };
}

export function runBootFadeCleanupArm({
  html = fs.readFileSync(new URL('../app.html', import.meta.url), 'utf8'),
  fail = (message) => console.error(message), log = console.log,
} = {}) {
  const code = fadeDriver(html);
  const scenarios = [
    { name: 'normal-own-end', rootEnd: 200 },
    { name: 'delayed-own-end', rootEnd: 1200 },
    { name: 'hidden-lost-end', hidden: true },
    { name: 'reduced-motion', reduced: true },
    { name: 'early-silent-end', silentEnd: 200 },
    { name: 'late-silent-end', silentEnd: 1200 },
    { name: 'late-cancel', cancelAt: 1200 },
    { name: 'later-hidden', hiddenAt: 1200 },
    { name: 'later-hidden-no-frames', hiddenAt: 1200, framesStopped: true },
    { name: 'foreground-no-frames', framesStopped: true },
  ];
  const rows = scenarios.map((s) => simulate(code, s));
  let ok = 0, red = 0;
  const check = (name, value, detail) => {
    if (value) { ok++; return; }
    red++; fail(`BOOT-FADE-CLEANUP ${name}: ${detail}`);
  };
  for (let i = 0; i < scenarios.length; i++) {
    const s = scenarios[i], r = rows[i], m = r.removals[0];
    check(`${s.name} removes at most once`, r.removals.length <= 1, JSON.stringify(r.removals));
    check(`${s.name} ignores child transitions`, !r.removals.some((x) => x.cause.startsWith('child-')), JSON.stringify(r.removals));
    check(`${s.name} bounds pending work`, r.maxTimers <= 1 && r.maxFrames <= 1 && r.queuedAfterRemoval === 0,
      JSON.stringify({ timers: r.maxTimers, frames: r.maxFrames, queuedAfterRemoval: r.queuedAfterRemoval }));
    if (s.reduced) {
      check(`${s.name} exits immediately without fade`, !!m && m.time === 0 && !r.outClass && !r.pendingTimers && !r.pendingFrames,
        JSON.stringify(r));
    } else {
      check(`${s.name} preserves opaque foreground`, !r.removals.some((x) => !x.hidden && x.opacity > 0), JSON.stringify(r.removals));
      if (s.rootEnd !== undefined) {
        check(`${s.name} exits on its own zero-opacity event`, !!m && m.time === s.rootEnd && m.cause === 'root-opacity-end'
          && r.rootEnds.length === 1 && r.rootEnds[0].opacity === 0, JSON.stringify(r));
      } else if (s.framesStopped && s.hiddenAt === undefined) {
        check(`${s.name} stays connected while rendering is paused`, r.connected, JSON.stringify(r));
      } else {
        check(`${s.name} eventually cleans a hidden or transparent field`, !!m && !r.connected
          && (m.hidden || m.opacity === 0) && r.rootEnds.length === 0, JSON.stringify(r));
      }
    }
    if (!r.connected) {
      // A hidden page can keep one suspended frame until rendering resumes.
      check(`${s.name} stops retry timers after removal`, r.pendingTimers === 0 && r.pendingFrames <= (s.framesStopped ? 1 : 0), JSON.stringify(r));
    }
  }
  log(`BOOT-FADE-CLEANUP: ${ok} OK / ${red} RED (${rows.length} source schedules; native firstframe assertions unchanged)`);
  return { ok, red, rows };
}

const isMain = () => { try { return fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } };
if (isMain()) {
  const args = process.argv.slice(2);
  if (args.length && !(args.length === 2 && args[0] === '--html')) throw new Error('Usage: test-boot-fade-cleanup.mjs [--html path]');
  const options = args.length ? { html: fs.readFileSync(args[1], 'utf8') } : {};
  const result = runBootFadeCleanupArm(options);
  if (result.red) process.exitCode = 1;
}
