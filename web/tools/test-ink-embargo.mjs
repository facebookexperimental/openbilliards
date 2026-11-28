// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-ink-embargo.mjs — GH-1244: the adaptive preview ink (previewink.js)
// kicks and resolves no readback through the boot overlay's fade. The shipped
// OB-INK-EMBARGO block runs on a virtual hook-frame clock against explicit
// #ob-boot timelines (present, carrying ob-boot--out, gone) and a fake
// document: the embargo starts at the first frame that sees ob-boot--out (or
// the node gone after it was seen), drops the in-flight readback, ends once
// the node has been gone 6 hook frames AND 1.0 s of render clock has passed
// after that frame, or at 3.0 s, and then re-arms GH-496's settle meter and
// re-anchors its cap unless the first latch already happened. No overlay at
// the first hook frame means no embargo. The virtual clock follows the hook:
// tClock advances after the block runs, and not at all on warming frames.
// Frame times are binary fractions of a second, so every sum is exact.
// The guards the hook keeps outside the block (the resolve poll, the sampling
// gate, the boot-settle hold, degrade()) are read from the shipped source as
// a census, each with its own planted red. No browser; the browser legs live
// in e2e-inkboot.mjs.
//   node web/tools/test-ink-embargo.mjs [--file path/to/previewink.js] [--selftest-plants]
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

export const PORT_FLAGS = {};

function block(src, name) {
  const begin = src.indexOf(`// ${name}:BEGIN`);
  const end = src.indexOf(`// ${name}:END`, begin);
  if (begin < 0 || end <= begin) throw new Error(`${name} markers missing from previewink.js`);
  return src.slice(begin, end);
}

const F60 = 1 / 64; // a ~60 Hz hook frame (exact in binary)
const F16 = 1 / 16; // a slow, storm-held frame (62.5 ms, exact)

// Run the block over a timeline: one entry per hook frame, { dt, dom, warm }
// with dom 'present' | 'out' | 'gone' | 'throws'. tClock advances by dt after
// the block runs, except on warming frames (the hook's own order). Returns the
// per-frame record and the state at the end frame.
function simulate(code, frames, { bootLatched = false, stableRuns = 5, bootCapAt = 8 } = {}) {
  let dom = 'gone';
  const drops = [];
  const el = { classList: { contains: (c) => dom === 'out' && c === 'ob-boot--out' } };
  const ctx = vm.createContext({
    document: { getElementById: (id) => {
      if (dom === 'throws') throw new Error('detached document');
      return id === 'ob-boot' && (dom === 'present' || dom === 'out') ? el : null;
    } },
    dropPending: (live) => { drops.push({ frame: ctx.frame, live }); },
    status: { bootEmbargo: false },
    SMP: { stableRuns },
    bootLatched, bootCapAt, tClock: 0, frame: -1, Math,
  });
  vm.runInContext(code, ctx, { filename: 'shipped-ink-embargo.js', timeout: 1000 });
  if (typeof ctx.embargoStep !== 'function') throw new Error('the block defines no embargoStep');
  const on = [];
  const flags = [];
  let endState = null;
  for (let i = 0; i < frames.length; i++) {
    ctx.frame = i;
    dom = frames[i].dom;
    const r = ctx.embargoStep(frames[i].dt);
    on.push(r === true);
    flags.push(ctx.status.bootEmbargo === true);
    if (i > 0 && on[i - 1] && !on[i]) endState = { frame: i, stableRuns: ctx.SMP.stableRuns, bootCapAt: ctx.bootCapAt, tClock: ctx.tClock };
    if (!frames[i].warm) ctx.tClock += frames[i].dt;
  }
  const start = on.indexOf(true);
  const end = start < 0 ? -1 : on.indexOf(false, start);
  return { on, flags, start, end, drops, endState, after: { stableRuns: ctx.SMP.stableRuns, bootCapAt: ctx.bootCapAt } };
}

// timeline builder: [n, dom, dt, warm] runs
const tl = (...runs) => runs.flatMap(([n, dom, dt = F60, warm = false]) => Array.from({ length: n }, () => ({ dt, dom, warm })));

const CASES = [
  ['E1 no overlay at the first hook frame: no embargo, nothing dropped',
    (sim) => sim(tl([200, 'gone'])), (r) => r.start === -1 && r.drops.length === 0 && !r.flags.some(Boolean)],
  ['E2 a normal fade (64 Hz): on from the ob-boot--out frame, the readback dropped once there, off once 1.0 s has passed after it (the node gone 6+ frames)',
    (sim) => sim(tl([10, 'present'], [13, 'out'], [200, 'gone'])),
    (r) => r.start === 10 && r.end === 74 && r.drops.length === 1 && r.drops[0].frame === 10 && r.drops[0].live === true
      && r.flags.slice(10, 74).every(Boolean) && !r.flags[74] && !r.flags.slice(0, 10).some(Boolean)],
  ['E3 reduced motion (the node removed with no ob-boot--out frame): on from the removal frame, off at 1.0 s',
    (sim) => sim(tl([10, 'present'], [200, 'gone'])), (r) => r.start === 10 && r.end === 74 && r.drops.length === 1],
  ['E4 a stuck fade (the removal never seen): off at the 3.0 s cap',
    (sim) => sim(tl([10, 'present'], [400, 'out'])), (r) => r.start === 10 && r.end === 202],
  ['E5 slow frames (62.5 ms): the node gone 6 frames at 0.5 s does not end it; 1.0 s does',
    (sim) => sim(tl([5, 'present', F16], [3, 'out', F16], [60, 'gone', F16])), (r) => r.start === 5 && r.end === 21],
  ['E6 a late removal (the 900 ms belt, 1.25 s): 1.0 s does not end it; the node gone 6 frames does',
    (sim) => sim(tl([10, 'present'], [80, 'out'], [100, 'gone'])), (r) => r.start === 10 && r.end === 95],
  ['E7 a late module (ob-boot--out at its first hook frame): on from that frame',
    (sim) => sim(tl([5, 'out'], [200, 'gone'])), (r) => r.start === 0 && r.end === 64],
  ['E8 the first latch came first: the meter and the cap are left alone at the end',
    (sim) => sim(tl([10, 'present'], [13, 'out'], [200, 'gone']), { bootLatched: true, stableRuns: 5, bootCapAt: 8 }),
    (r) => r.endState?.frame === 74 && r.endState.stableRuns === 5 && r.endState.bootCapAt === 8],
  ['E9 before the first latch the end re-arms the meter (0) and re-anchors the cap (render clock + 8 s)',
    (sim) => sim(tl([10, 'present'], [13, 'out'], [200, 'gone']), { bootLatched: false, stableRuns: 5, bootCapAt: 8 }),
    (r) => r.endState?.frame === 74 && r.endState.stableRuns === 0 && r.endState.bootCapAt === 74 * F60 + 8],
  ['E10 a lookup that throws reads as no overlay (no throw out of the hook)',
    (sim) => sim(tl([50, 'throws'])), (r) => r.start === -1 && r.drops.length === 0],
  ['E11 once ended it never re-arms (ob-boot--out seen again later)',
    (sim) => sim(tl([10, 'present'], [13, 'out'], [100, 'gone'], [50, 'out'])), (r) => r.end === 74 && r.on.lastIndexOf(true) === 73],
  ['E12 warming frames (tClock stands still) end it on the same frame: its clock is its own sum of dt',
    (sim) => sim(tl([10, 'present'], [13, 'out', F60, true], [200, 'gone', F60, true])),
    (r) => r.end === 74 && r.endState?.bootCapAt === 10 * F60 + 8],
  ['E13 the start frame\'s own dt (a 62.5 ms frame) is not counted',
    (sim) => sim(tl([10, 'present'], [1, 'out', F16], [12, 'out'], [200, 'gone'])), (r) => r.start === 10 && r.end === 74],
];

// The hook's guards outside the block, read from the shipped source.
const after = (src, a, b) => { const i = src.indexOf(a); return i >= 0 ? src.indexOf(b, i) : -1; };
const calls = (src, name) => src.split(`${name}(`).length - 1 - src.split(`function ${name}(`).length + 1;
const CENSUS = [
  ['G1 the hook steps the embargo once per frame, before any resolve or kick',
    (src) => src.split('const embargo = embargoStep(dtc);').length === 2
      && after(src, "machine.on('frame'", 'const embargo = embargoStep(dtc);') > 0
      && src.indexOf('const embargo = embargoStep(dtc);') < src.indexOf('if (!embargo) pollReadback();')],
  ['G2 the one resolve poll is skipped while the embargo holds',
    (src) => calls(src, 'pollReadback') === 1 && src.split('if (!embargo) pollReadback();').length === 2],
  ['G3 the one sampleStep call sits behind the embargo-closed sampling gate',
    (src) => {
      if (calls(src, 'sampleStep') !== 1) return false;
      const gate = src.indexOf('if (!embargo && (FRZ.still < AD.stillHold');
      const call = src.indexOf('sampleStep();');
      return gate > 0 && call > gate && call - gate < 700 && src.slice(gate, call).includes('|| FRZ.escWant)) {');
    }],
  ['G4 the boot-settle hold keeps the first latch off while the embargo holds, whatever the cap',
    (src) => src.split('if (!bootLatched && (embargo || (tClock < bootCapAt').length === 2],
  ['G5 degrade() clears bootEmbargo',
    (src) => { const a = src.indexOf('const degrade = (why) => {'); const b = src.indexOf('};', a); return a > 0 && src.slice(a, b).includes('status.bootEmbargo = false;'); }],
  ['G6 kickReadback has one call site, inside sampleStep',
    (src) => calls(src, 'kickReadback') === 1 && (() => {
      const a = src.indexOf('function sampleStep() {'), b = src.indexOf('function kickReadback(');
      const c = src.indexOf('kickReadback(gw, gh, rb.width, rb.height)');
      return a > 0 && c > a && c < b;
    })()],
];

function runCases(code, log) {
  const failed = [];
  for (const [name, run, ok] of CASES) {
    let r, good = false, why = '';
    try { r = run((frames, o) => simulate(code, frames, o)); good = ok(r); } catch (e) { why = e.message; }
    if (!good) failed.push(name);
    log(`  ${good ? 'ok  ' : 'BAD '} ${name}${good ? '' : ` — ${why || JSON.stringify({ start: r?.start, end: r?.end, drops: r?.drops, endState: r?.endState })}`}`);
  }
  return failed;
}
function runCensus(src, log) {
  const failed = [];
  for (const [name, ok] of CENSUS) {
    let good = false;
    try { good = ok(src); } catch { good = false; }
    if (!good) failed.push(name);
    log(`  ${good ? 'ok  ' : 'BAD '} ${name}`);
  }
  return failed;
}

// Planted reds: each mutation must turn its target red (block plants run the cases, source plants the census).
function plants(code, src) {
  const sub = (s, a, b) => { if (!s.includes(a)) throw new Error(`plant anchor missing: ${a.slice(0, 60)}`); return s.replace(a, b); };
  return [
    ['P1 no settle (ends 6 frames after the removal)', 'block', sub(code, '(EMB.gone >= EMB_LAW.goneFrames && EMB.t >= EMB_LAW.settle)', '(EMB.gone >= EMB_LAW.goneFrames)'), ['E2 ', 'E3 ', 'E5 ']],
    ['P2 no cap', 'block', sub(code, '\n      || EMB.t >= EMB_LAW.cap)', ')'), ['E4 ']],
    ['P3 edge-only trigger (a removal seen before ob-boot--out starts nothing)', 'block', sub(code, '} else if (!EMB.seen) {', '} else {'), ['E3 ']],
    ['P4 ends at the removal (no gone-frame count)', 'block', sub(code, 'EMB.gone >= EMB_LAW.goneFrames', 'EMB.gone >= 1'), ['E6 ']],
    ['P5 the meter is not re-armed', 'block', sub(code, '        SMP.stableRuns = 0;\n', ''), ['E9 ']],
    ['P6 the in-flight readback is not dropped', 'block', sub(code, '      dropPending(true);\n', ''), ['E2 ', 'E3 ']],
    ['P7 an embargo with no overlay (no first-frame check)', 'block',
      sub(code, "      } else if (!EMB.seen) {\n        EMB.done = true; // no overlay at the first hook frame: no embargo\n        return false;\n      }", '      }'), ['E1 ']],
    ['P8 the cap is not re-anchored', 'block', sub(code, '        bootCapAt = Math.max(bootCapAt, tClock + 8);\n', ''), ['E9 ']],
    ['P9 the meter is re-armed after the first latch too', 'block', sub(code, '      if (!bootLatched) {', '      if (true) {'), ['E8 ']],
    ['P10 it re-arms after it ended', 'block', sub(code, '    if (EMB.done) return false;\n', ''), ['E11 ']],
    ['P11 the clock is tClock (stands still on warming frames)', 'block',
      sub(sub(code, '      EMB.gone = el ? 0 : 1;\n', '      EMB.gone = el ? 0 : 1;\n      EMB.t0 = tClock + dtc;\n'), '    EMB.t += dtc;\n', '    EMB.t = tClock + dtc - EMB.t0;\n'), ['E12 ']],
    ['P12 the start frame\'s dt is counted', 'block', sub(code, '      status.bootEmbargo = true;\n      return true;\n', '      status.bootEmbargo = true;\n      EMB.t += dtc;\n      return true;\n'), ['E2 ', 'E13 ']],
    ['P13 the hook never steps the embargo', 'source', sub(src, 'const embargo = embargoStep(dtc);', 'const embargo = false;'), ['G1 ']],
    ['P14 the resolve poll runs through the embargo', 'source', sub(src, 'if (!embargo) pollReadback();', 'pollReadback();'), ['G2 ']],
    ['P15 the sampling gate ignores the embargo', 'source', sub(src, 'if (!embargo && (FRZ.still < AD.stillHold', 'if ((FRZ.still < AD.stillHold'), ['G3 ']],
    ['P16 the hold lets the first latch land mid-embargo', 'source', sub(src, 'if (!bootLatched && (embargo || (tClock < bootCapAt', 'if (!bootLatched && (false || (tClock < bootCapAt'), ['G4 ']],
    ['P17 degrade() leaves bootEmbargo set', 'source', sub(src, '    status.bootEmbargo = false; // GH-1244: a dead module embargoes nothing\n', ''), ['G5 ']],
    ['P18 a second kick site', 'source', sub(src, '    if (!embargo) pollReadback();', '    if (!embargo) pollReadback();\n    if (SMP.cool < 0) kickReadback(1, 1, 1, 1);'), ['G6 ']],
  ];
}

export function runInkEmbargoArm({ src = fs.readFileSync(new URL('../app/previewink.js', import.meta.url), 'utf8'), log = console.log, selftestPlants = false } = {}) {
  const code = block(src, 'OB-INK-EMBARGO');
  const failed = [...runCases(code, log), ...runCensus(src, log)];
  log(failed.length ? `INK-EMBARGO: ${failed.length} row(s) BAD` : `INK-EMBARGO: OK (${CASES.length} cases, ${CENSUS.length} census rows)`);
  if (!selftestPlants || failed.length) return failed.length === 0;
  let bad = 0;
  const all = plants(code, src);
  for (const [name, kind, mutated, targets] of all) {
    let red;
    try { red = kind === 'block' ? runCases(mutated, () => {}) : runCensus(mutated, () => {}); } catch (e) { red = [`(${e.message})`]; }
    const hit = targets.filter((t) => red.some((n) => n.startsWith(t)));
    const ok = hit.length === targets.length;
    if (!ok) bad++;
    log(`  ${ok ? 'ok  ' : 'BAD '} plant ${name}: red on ${red.map((n) => n.split(' ')[0]).join(', ') || 'nothing'} (targets ${targets.map((t) => t.trim()).join(', ')})`);
  }
  log(bad ? `INK-EMBARGO --selftest-plants: ${bad} plant(s) not caught` : `INK-EMBARGO --selftest-plants: OK (${all.length} plants)`);
  return bad === 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  const i = process.argv.indexOf('--file');
  const src = fs.readFileSync(i > 0 ? process.argv[i + 1] : new URL('../app/previewink.js', import.meta.url), 'utf8');
  process.exitCode = runInkEmbargoArm({ src, selftestPlants: process.argv.includes('--selftest-plants') }) ? 0 : 1;
}
