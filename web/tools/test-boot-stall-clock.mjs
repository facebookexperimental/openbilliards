// Copyright (c) Meta Platforms, Inc. and affiliates.

// GH-1115: the boot overlay's slow register and stall card count IDLE time
// only. Execute the shipped clock block of app.html's #ob-boot driver (and its
// ?obstallms= seam) on a virtual clock against explicit schedules: on-time
// ticks for an idle main thread, one late tick after a busy span (a long
// task), throttled ticks in a hidden tab, progress beats. No browser; the
// browser legs live in e2e-userboot-stall.mjs.
//   node web/tools/test-boot-stall-clock.mjs [--html path/to/app.html] [--selftest-plants]
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

export const PORT_FLAGS = {};

function block(html, name) {
  const begin = html.indexOf(`// ${name}:BEGIN`);
  const end = html.indexOf(`// ${name}:END`, begin);
  if (begin < 0 || end <= begin) throw new Error(`${name} markers missing from app.html`);
  return html.slice(begin, end);
}

// Run the clock block against a schedule. Steps: ['idle', ms] (ticks on time),
// ['busy', ms] (no tick can run; the interval fires once, late, at the end),
// ['hiddenIdle', ms, everyMs] (hidden tab: throttled ticks), ['hide'], ['show'],
// ['progress'] (a resource entry), ['advance'] (a stage advance), ['beat'].
function simulate(code, steps, { stallMs = 120000 } = {}) {
  let time = 0, tickFn = null, due = 1000;
  const listeners = { visibilitychange: [], 'ob:boot-beat': [] };
  const attrs = new Set();
  const out = { stall: null, slow: null, credits: [] };
  const doc = { visibilityState: 'visible', addEventListener: (t, fn) => listeners[t]?.push(fn) };
  const ctx = vm.createContext({
    el: { hasAttribute: (a) => attrs.has(a), setAttribute: (a) => { attrs.add(a); if (a === 'data-slow' && out.slow === null) out.slow = time; } },
    gone: false, failed: false, lastStage: 0, lastProgress: 0, urgent: false,
    SLOW_MS: 30000, STALL_MS: stallMs,
    wantDict() {}, fill() {}, renderBytes() {},
    fail(kind) { if (ctx.failed) return; ctx.failed = true; if (kind === 'stall' && out.stall === null) out.stall = time; },
    now: () => time,
    setInterval: (fn, ms) => { if (ms !== 1000) throw new Error(`clock period ${ms} ms, expected 1000`); tickFn = fn; return 1; },
    clearInterval() {}, document: doc, window: { addEventListener: (t, fn) => listeners[t]?.push(fn) }, Math,
  });
  vm.runInContext(code, ctx, { filename: 'shipped-boot-clock.js', timeout: 1000 });
  if (!tickFn) throw new Error('the clock block registered no interval');
  const tick = () => { const before = ctx.lastProgress; tickFn(); if (ctx.lastProgress > before) out.credits.push([time, ctx.lastProgress - before]); };
  for (const [kind, a, b] of steps) {
    if (kind === 'idle') { const end = time + a; while (due <= end) { time = due; tick(); due += 1000; } time = end; }
    else if (kind === 'busy') { time += a; if (due <= time) { tick(); due = time + 1000; } }
    else if (kind === 'hiddenIdle') { const end = time + a; let next = time + b; while (next <= end) { time = next; tick(); next += b; } time = end; due = time + 1000; }
    else if (kind === 'hide' || kind === 'show') { doc.visibilityState = kind === 'hide' ? 'hidden' : 'visible'; for (const fn of listeners.visibilitychange) fn(); }
    else if (kind === 'progress') ctx.lastProgress = time;
    else if (kind === 'advance') { ctx.lastStage = ctx.lastProgress = time; attrs.delete('data-slow'); }
    else if (kind === 'beat') for (const fn of listeners['ob:boot-beat']) fn();
    else throw new Error(`unknown step ${kind}`);
  }
  return { ...out, state: { lastProgress: ctx.lastProgress, lastStage: ctx.lastStage, lastTick: ctx.lastTick, failed: ctx.failed } };
}

function seamValue(code, search) {
  const ctx = vm.createContext({ q: new URLSearchParams(search), STALL_MS: 120000, Math, Number });
  vm.runInContext(code, ctx, { filename: 'shipped-boot-seam.js', timeout: 1000 });
  return ctx.STALL_MS;
}

const CASES = [
  ['C1 dead boot (idle, on-time ticks): stall card at 120 s, slow register at 30 s',
    (sim) => sim([['idle', 125000]]), (r) => r.stall === 120000 && r.slow === 30000],
  ['C2 a 210 s busy task is credited: no card when it ends; idle time after it still reaches 120 s',
    (sim) => sim([['idle', 2000], ['busy', 210000], ['idle', 130000]]),
    (r) => r.credits.some(([t, c]) => t === 212000 && c === 209000) && r.stall === 329000],
  ['C3 the late tick runs BEFORE the stage advance after the task: still no card',
    (sim) => sim([['idle', 2000], ['busy', 210000], ['advance'], ['idle', 5000]]), (r) => r.stall === null],
  ['C4 hidden tab: throttled ticks are not busy time; a dead boot still cards (no credit)',
    (sim) => sim([['idle', 5000], ['hide'], ['hiddenIdle', 200000, 60000]]),
    (r) => r.credits.length === 0 && r.stall === 125000],
  ['C5 no credit for a gap that spans a visibility change',
    (sim) => sim([['idle', 2000], ['hide'], ['show'], ['busy', 50000], ['idle', 1000]]),
    (r) => r.credits.length === 0 && r.state.lastProgress === 0],
  ['C6 slow register on an idle boot: set at 30 s',
    (sim) => sim([['idle', 31000]]), (r) => r.slow === 30000 && r.stall === null],
  ['C7 slow register stays quiet through 40 s of busy work; idle time after it still sets it',
    (sim) => sim([['idle', 2000], ['busy', 40000], ['idle', 2000]]), (r) => r.slow === null],
  ['C7b ... and it fires once idle time reaches 30 s (lastStage credited by the busy span)',
    (sim) => sim([['idle', 2000], ['busy', 40000], ['idle', 40000]]), (r) => r.slow === 69000],
  ['C8 a progress beat restarts the stall clock',
    (sim) => sim([['idle', 100000], ['beat'], ['idle', 125000]]), (r) => r.stall === 220000],
  ['C9 the tick bookkeeping advances while failed (no stale gap after the card)',
    (sim) => sim([['idle', 121000], ['busy', 10000]]), (r) => r.stall === 120000 && r.state.lastTick === 131000],
  ['C10 policy: back-to-back busy chunks under LATE_MS (1.4 s) are not credited',
    (sim) => sim(Array.from({ length: 100 }, () => ['busy', 1400])), (r) => r.credits.length === 0 && r.stall === 120400],
  ['C11 a resource entry after the card leaves the card up (stall is sticky until ready)',
    (sim) => sim([['idle', 121000], ['progress'], ['idle', 5000]]), (r) => r.stall === 120000 && r.state.failed === true],
];
const SEAM = [
  ['S1 no ?obstallms: 120 s', '', 120000],
  ['S2 ?obstallms=5000: 5 s', '?obstallms=5000', 5000],
  ['S3 ?obstallms=1000: floored to 3 s', '?obstallms=1000', 3000],
  ['S4 ?obstallms=999999: capped at 120 s', '?obstallms=999999', 120000],
  ['S5 ?obstallms=abc: ignored', '?obstallms=abc', 120000],
  ['S6 ?obstallms=-5: ignored', '?obstallms=-5', 120000],
  ['S7 ?obstallms=5000.5: ignored', '?obstallms=5000.5', 120000],
];

function runCases(clock, seam, log) {
  const failed = [];
  for (const [name, run, ok] of CASES) {
    let r, good = false, why = '';
    try { r = run((steps, o) => simulate(clock, steps, o)); good = ok(r); } catch (e) { why = e.message; }
    if (!good) failed.push(name);
    log(`  ${good ? 'ok  ' : 'BAD '} ${name}${good ? '' : ` — ${why || JSON.stringify({ stall: r?.stall, slow: r?.slow, credits: r?.credits?.slice(0, 3), state: r?.state })}`}`);
  }
  for (const [name, search, want] of SEAM) {
    let got, why = '';
    try { got = seamValue(seam, search); } catch (e) { why = e.message; }
    const good = got === want;
    if (!good) failed.push(name);
    log(`  ${good ? 'ok  ' : 'BAD '} ${name}${good ? '' : ` — got ${got} ${why}`}`);
  }
  return failed;
}

// Planted reds: each mutation of the shipped block must turn its target red.
function plants(clock, seam) {
  const sub = (src, a, b) => { if (!src.includes(a)) throw new Error(`plant anchor missing: ${a.slice(0, 60)}`); return src.replace(a, b); };
  const credit = '      lastProgress = Math.min(t, lastProgress + gap - TICK_MS);\n      lastStage = Math.min(t, lastStage + gap - TICK_MS);\n';
  return [
    ['P1 no busy credit (the pre-GH-1115 clock)', sub(clock, credit, ''), seam, ['C2 ', 'C3 ', 'C7 ']],
    ['P2 no visibility gate', sub(clock, " && visEpoch === tickEpoch\n      && document.visibilityState === 'visible'", ''), seam, ['C4 ', 'C5 ']],
    ['P3 no beat listener', sub(clock, "window.addEventListener('ob:boot-beat', function () { lastProgress = now(); });", ''), seam, ['C8 ']],
    ['P4 the stage clock is not credited', sub(clock, '      lastStage = Math.min(t, lastStage + gap - TICK_MS);\n', ''), seam, ['C7 ']],
    ['P5 the tick bookkeeping stops while failed', sub(sub(clock, '    lastTick = t;\n    tickEpoch = visEpoch;\n    if (failed) return;', '    if (failed) return;\n    lastTick = t;\n    tickEpoch = visEpoch;'), '', ''), seam, ['C9 ']],
    ['P6 the seam is not clamped', clock, sub(seam, 'Math.min(120000, Math.max(3000, Number(stallQ)))', 'Number(stallQ)'), ['S3 ', 'S4 ']],
  ];
}

export function runBootStallClockArm({ html = fs.readFileSync(new URL('../app.html', import.meta.url), 'utf8'), log = console.log, selftestPlants = false } = {}) {
  const clock = block(html, 'OB-BOOT-CLOCK'), seam = block(html, 'OB-BOOT-STALL-SEAM');
  const failed = runCases(clock, seam, log);
  log(failed.length ? `BOOT-STALL-CLOCK: ${failed.length} case(s) BAD` : `BOOT-STALL-CLOCK: OK (${CASES.length} clock cases, ${SEAM.length} seam cases)`);
  if (!selftestPlants || failed.length) return failed.length === 0;
  let bad = 0;
  for (const [name, c, s, targets] of plants(clock, seam)) {
    const red = runCases(c, s, () => {});
    const hit = targets.filter((t) => red.some((n) => n.startsWith(t)));
    const ok = hit.length === targets.length;
    if (!ok) bad++;
    log(`  ${ok ? 'ok  ' : 'BAD '} plant ${name}: red on ${red.map((n) => n.split(' ')[0]).join(', ') || 'nothing'} (targets ${targets.map((t) => t.trim()).join(', ')})`);
  }
  log(bad ? `BOOT-STALL-CLOCK --selftest-plants: ${bad} plant(s) not caught` : `BOOT-STALL-CLOCK --selftest-plants: OK (${plants(clock, seam).length} plants)`);
  return bad === 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  const i = process.argv.indexOf('--html');
  const html = fs.readFileSync(i > 0 ? process.argv[i + 1] : new URL('../app.html', import.meta.url), 'utf8');
  process.exitCode = runBootStallClockArm({ html, selftestPlants: process.argv.includes('--selftest-plants') }) ? 0 : 1;
}
