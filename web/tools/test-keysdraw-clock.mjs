// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-keysdraw-clock.mjs — node selftest of the covered arrival's draw-wait budget in web/app/shell.js (#1202 build 21;
// review P2 on 24c194cb and P1 on 62a1db8a, maintainer rulings 7233f299 and 5a6dd876). No browser.
// The `>>> keys-draw visible clock` / `<<< keys-draw visible clock` block is lifted verbatim and run on a scripted clock:
// tick(t, visible) is the shell's 250 ms interval, vis(t, visible) its visibilitychange listener. The budget
// (KEYS_DRAW_CAP_MS, 8 s) spends only gaps seen visible at both ends, and a visibilitychange charges nothing: a hide's time
// is uncertain (a synchronous draw can hold its delivery), and a return's gap was hidden. Under-charging only makes the
// cap later. It must hold in both orders of a tab's return (Blink dispatches the event with the state change; WebKit
// queues it, so an overdue tick can read 'visible' first):
//   VISIBLE         32 visible ticks: it caps at exactly 8 s, not one tick before;
//   HIDDEN          ticks to 7.5 s, hidden at 7.6 s for 60 s with its timers suspended, back event-first: the first tick
//                   after it does not cap (7750: the 100 ms before the hide is not charged), it caps at the counted 8 s;
//   HIDDEN-ONTICK   the same with a tick at the hide (7.6 s): 7850, the figure of the 62a1db8a ruling;
//   TICKFIRST       the HIDDEN return in WebKit's order, the overdue tick before the queued event (7740);
//   TICKFIRST-ONTICK the same with a tick at the hide: 7840, the figure of the 62a1db8a ruling;
//   LATEHIDE        the review P1: 7.5 s spent, a hide at 7.6 s delivered late as vis(8500, false): it does not cap;
//   HIDDENSTART     a document hidden when the wait starts charges nothing until it is seen visible, in either order;
//   THROTTLED       hidden ticks at a throttled 1 s cadence add nothing;
//   LONGDRAW        one 9 s gap between two visible ticks (a long synchronous draw while visible) adds 1 s;
//   CYCLES          20 hide/show cycles of 5 s hidden each add only their visible tick gaps.
// PLANTS: the 62a1db8a clock (a hide charges the gap since the mark) must FAIL LATEHIDE; the 3ba61180 clock (a tick charges
// whenever it reads visible) must FAIL TICKFIRST; the 24c194cb clock (vis() moves nothing as well) must FAIL HIDDEN.
// The shell's wiring is checked by source, comments stripped: keysDrawn seeds the clock with the visibility at the start,
// ticks it on a 250 ms interval, feeds every visibilitychange to vis(), reads visibility as document.visibilityState ===
// 'visible', and its finish clears the interval and the listener.
//   node web/tools/test-keysdraw-clock.mjs   (exit 0 = every expectation held and every plant was caught)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SHELL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../app/shell.js');
const src = fs.readFileSync(SHELL, 'utf8');
const OPEN = '// >>> keys-draw visible clock';
const CLOSE = '// <<< keys-draw visible clock';
let bad = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`); if (!cond) bad += 1; return cond; };

const a = src.indexOf(OPEN);
const b = src.indexOf(CLOSE);
if (a < 0 || b < 0 || b < a || src.indexOf(OPEN, a + 1) >= 0 || src.indexOf(CLOSE, b + 1) >= 0) {
  console.log('KEYSDRAW-CLOCK FAIL: the lifted block is not marked exactly once in web/app/shell.js');
  process.exit(1);
}
const block = src.slice(a, b);
const CAP = Number((/const KEYS_DRAW_CAP_MS = (\d+);/.exec(src) ?? [])[1]);
ok(CAP === 8000, `KEYS_DRAW_CAP_MS is 8000 (read ${CAP})`);
// strict mode: a reference to anything of the module's scope throws when a row calls it
const lift = (text) => new Function(`'use strict';\n${text}\nreturn keysDrawClock;`)();
const near = (x, y) => Math.abs(x - y) < 1e-9;
const capAfter = (c, from) => { for (let t = from; t <= from + 4000; t += 250) if (c.tick(t, true)) return t; return null; };

function scenarios(make, label, say = ok) {
  const out = {};
  {
    const c = make(CAP, 0, true);
    let capAt = null;
    for (let t = 250; t <= 9000 && capAt === null; t += 250) if (c.tick(t, true)) capAt = t;
    out.VISIBLE = capAt === 8000;
    say(out.VISIBLE, `${label} VISIBLE: caps at 8000 ms of visible ticks (capped at ${capAt})`);
  }
  const ret = (onTick, tickFirst) => {
    const c = make(CAP, 0, true);
    for (let t = 250; t <= 7500; t += 250) c.tick(t, true);
    if (onTick) c.tick(7600, true);
    c.vis(7600, false); // hidden at 7.6 s; its timers stand still for 60 s
    let capped = false;
    if (tickFirst) { capped = c.tick(67600, true) || capped; c.vis(67610, true); } // WebKit: the overdue tick first
    else c.vis(67600, true); // Blink: the event with the state change
    capped = c.tick(67850, true) || capped;
    return { capped, spent: c.spent(), capAt: capAfter(c, 68100) };
  };
  {
    const r = ret(false, false);
    out.HIDDEN = !r.capped && near(r.spent, 7750) && r.capAt === 68100;
    say(out.HIDDEN, `${label} HIDDEN: no cap at the first tick after the return (spent ${r.spent}, want 7750; capped ${r.capped}); `
      + `caps at ${r.capAt} (want 68100)`);
  }
  {
    const r = ret(true, false);
    out.HIDDEN_ONTICK = !r.capped && near(r.spent, 7850) && r.capAt === 68100;
    say(out.HIDDEN_ONTICK, `${label} HIDDEN-ONTICK: with a tick at the hide (spent ${r.spent}, want 7850; capped ${r.capped}); `
      + `caps at ${r.capAt} (want 68100)`);
  }
  {
    const r = ret(false, true);
    out.TICKFIRST = !r.capped && near(r.spent, 7740) && r.capAt === 68350;
    say(out.TICKFIRST, `${label} TICKFIRST: the overdue tick before the queued event (spent ${r.spent}, want 7740; capped ${r.capped}); `
      + `caps at ${r.capAt} (want 68350)`);
  }
  {
    const r = ret(true, true);
    out.TICKFIRST_ONTICK = !r.capped && near(r.spent, 7840) && r.capAt === 68100;
    say(out.TICKFIRST_ONTICK, `${label} TICKFIRST-ONTICK: with a tick at the hide (spent ${r.spent}, want 7840; capped ${r.capped}); `
      + `caps at ${r.capAt} (want 68100)`);
  }
  {
    const c = make(CAP, 0, true);
    for (let t = 250; t <= 7500; t += 250) c.tick(t, true);
    const cappedAtHide = c.vis(8500, false); // the hide at 7.6 s, delivered late after a synchronous draw
    const spentAtHide = c.spent();
    c.vis(68500, true);
    const capAt = capAfter(c, 68750);
    out.LATEHIDE = !cappedAtHide && near(spentAtHide, 7500) && capAt === 69000;
    say(out.LATEHIDE, `${label} LATEHIDE: a hide delivered late as vis(8500, false) does not cap (spent ${spentAtHide}, want 7500; `
      + `capped ${cappedAtHide}); caps at ${capAt} (want 69000)`);
  }
  {
    const e = make(CAP, 0, false); // hidden at the start, the event first
    e.tick(1000, false); e.tick(2000, false);
    e.vis(5000, true);
    e.tick(5250, true);
    const w = make(CAP, 0, false); // hidden at the start, WebKit's order
    w.tick(1000, false);
    w.tick(5000, true);
    w.vis(5010, true);
    w.tick(5250, true);
    out.HIDDENSTART = near(e.spent(), 250) && near(w.spent(), 240);
    say(out.HIDDENSTART, `${label} HIDDENSTART: a wait that starts hidden charges only what it sees visible (spent ${e.spent()} and `
      + `${w.spent()}, want 250 and 240)`);
  }
  {
    const c = make(CAP, 0, true);
    c.tick(250, true);
    c.vis(300, false);
    for (let t = 1300; t <= 60300; t += 1000) c.tick(t, false);
    out.THROTTLED = near(c.spent(), 250);
    say(out.THROTTLED, `${label} THROTTLED: hidden ticks at 1 s add nothing (spent ${c.spent()}, want 250)`);
  }
  {
    const c = make(CAP, 0, true);
    c.tick(250, true);
    const capped = c.tick(9250, true); // one 9 s synchronous block between two visible ticks
    out.LONGDRAW = !capped && near(c.spent(), 1250);
    say(out.LONGDRAW, `${label} LONGDRAW: a 9 s gap adds 1 s (spent ${c.spent()}, want 1250)`);
  }
  {
    const c = make(CAP, 0, true);
    let t = 0;
    let capped = false;
    for (let i = 0; i < 20; i++) {
      capped = c.tick(t + 100, true) || capped; // 100 ms visible, then hidden
      capped = c.vis(t + 150, false) || capped;
      for (let h = 1150; h <= 5150; h += 1000) capped = c.tick(t + h, false) || capped;
      capped = c.vis(t + 5150, true) || capped;
      t += 5150;
    }
    out.CYCLES = !capped && near(c.spent(), 20 * 100);
    say(out.CYCLES, `${label} CYCLES: 20 hide/show cycles add only their visible tick gaps (spent ${c.spent()}, want ${20 * 100}, `
      + `capped ${capped})`);
  }
  return out;
}

// the block as shipped
const shipped = scenarios(lift(block), 'shipped');

// PLANTS: the earlier clocks, rebuilt from the shipped block
const VIS = /vis: \(t, visible\) => \{[\s\S]*?return spent >= capMs; \},/;
const plant62 = block.replace(VIS, 'vis: (t, visible) => { if (!visible && markVisible) spent += Math.min(1000, Math.max(0, t - mark)); '
  + 'mark = t; markVisible = visible; return spent >= capMs; },');
const plant3b = block.replace('if (visible && markVisible) spent +=', 'if (visible) spent +=')
  .replace(VIS, 'vis: (t, visible) => { if (!visible) spent += Math.min(1000, Math.max(0, t - mark)); mark = t; markVisible = visible; '
    + 'return spent >= capMs; },');
const plant24 = block.replace('if (visible && markVisible) spent +=', 'if (visible) spent +=')
  .replace(VIS, 'vis: (t, visible) => spent >= capMs,');
ok(plant62 !== block && plant3b !== block && plant24 !== block && plant3b !== plant24, 'PLANTS applied (the 62a1db8a, 3ba61180 and 24c194cb clocks)');
const report = (held, msg) => console.log(`plant ${held ? 'held   ' : 'differs'} ${msg}`);
const p62 = scenarios(lift(plant62), 'PLANT-62a1db8a', report);
const p3b = scenarios(lift(plant3b), 'PLANT-3ba61180', report);
const p24 = scenarios(lift(plant24), 'PLANT-24c194cb', report);
ok(p62.LATEHIDE === false, 'PLANT-62a1db8a caught: its late hide charges the gap since the mark and caps');
ok(p3b.TICKFIRST === false, 'PLANT-3ba61180 caught: its overdue tick in WebKit\'s order charges the hidden gap and caps');
ok(p24.HIDDEN === false, 'PLANT-24c194cb caught: its first tick after a long hidden interval caps');

// the shell's wiring, with comments stripped
const raw = (/function keysDrawn\(\) \{[\s\S]*?\n {2}\}\n/.exec(src) ?? [''])[0];
const fn = raw.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
ok(/\n {6}const visible = \(\) => document\.visibilityState === 'visible';/.test(fn), 'keysDrawn reads visibility as document.visibilityState === \'visible\'');
ok(/\n {6}const budget = keysDrawClock\(KEYS_DRAW_CAP_MS, performance\.now\(\), visible\(\)\);/.test(fn),
  'keysDrawn seeds its budget with the visibility at the start');
ok(/\n {6}clock = setInterval\(\(\) => \{ if \(budget\.tick\(performance\.now\(\), visible\(\)\)\) finish\('capped'\); \}, 250\);/.test(fn),
  'keysDrawn ticks it every 250 ms');
ok(/\n {6}onVis = \(\) => \{ if \(budget\.vis\(performance\.now\(\), visible\(\)\)\) finish\('capped'\); \};/.test(fn)
  && /\n {6}document\.addEventListener\('visibilitychange', onVis\);/.test(fn), 'keysDrawn feeds every visibilitychange to vis()');
ok(/\n {8}clearInterval\(clock\);/.test(fn) && /\n {8}if \(onVis\) document\.removeEventListener\('visibilitychange', onVis\);/.test(fn),
  'keysDrawn\'s finish clears the interval and the listener');

const all = Object.values(shipped).every(Boolean);
console.log(bad === 0 && all ? 'KEYSDRAW-CLOCK PASS' : `KEYSDRAW-CLOCK FAIL (${bad})`);
process.exitCode = bad === 0 && all ? 0 : 1;
