// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-locale-settle.mjs — node selftest of settledRead (web/tools/lib/locale-settle.mjs), the settled read behind
// e2e-shell K05 / Q1(c), e2e-settings G5 D2/D4 and e2e-replays R5d. No browser. The helper's page-side expression runs
// in a vm context over a stub compositor: requestAnimationFrame callbacks run only when the stub delivers a frame
// (every 16 ms while it is live, in registration order, the way a browser runs one frame's callbacks), while
// setTimeout / clearTimeout / performance are node's own — timers stay live while frames stall. Only an animation
// frame may count toward the run of equal reads (review P2: a 250 ms timer wakeup was counted as a frame, so a read
// with no frame delivered settled after ~750 ms, before the shell's rAF-scheduled band publish had run):
//   frames stalled for the whole cap, timers live    → unsettled, n 0, returned at the cap (never early, never late)
//   frames stall after two equal reads               → timers never complete the run; unsettled at the cap
//   an rAF-scheduled write pending across a 1 s stall → the read waits for the frame, settles on the written value
//   live frames + a still probe (a fresh object per read, the consumers' shape) → settled after exactly 3 frames
//   live frames + a moving probe → unsettled at the cap; a probe that changes AFTER equal reads (A A A B B C …)
//   restarts the run on every change and settles on C only
// unsettledNote() words the three unsettled results apart (no frame / frames stopped / still moving).
// PLANTS: the same scenarios against the pre-fix wakeup (the 250 ms timer resolving as a frame) must FAIL every stall
// scenario; against a frame wait without the deadline, the two never-thawing stalls by name (no verdict within
// WATCHDOG ms of the cap); against a run that never restarts on a change, the A-B-C probe — each while the other
// scenarios still hold.
//   node web/tools/test-locale-settle.mjs   (exit 0 = every expectation held and every plant was caught)
import vm from 'node:vm';
import { settledRead, unsettledNote } from './lib/locale-settle.mjs';

const FIXED_WAIT = 'const frame = () => Promise.race([new Promise((r) => requestAnimationFrame(() => r(true))), deadline]);';
const OLD_WAIT = 'const frame = () => new Promise((r) => { requestAnimationFrame(() => r(true)); setTimeout(() => r(true), 250); });';
const NO_BOUND_WAIT = 'const frame = () => new Promise((r) => requestAnimationFrame(() => r(true)));';
const FIXED_RESET = 'same = s === last ? same + 1 : 0;';
const NO_RESET = 'same = s === last ? same + 1 : same;';
const CAP = 1500; // the stall scenarios' cap: the pre-fix rule settled at ~750 ms, well inside it
const SLACK = 50; // node timer granularity against performance.now()
const LATE = 500; // "returned at the cap": a starved event loop was seen up to ~110 ms late
const WATCHDOG = 2000; // a read still pending this long after its cap has lost its bound

let bad = 0, total = 0;
const report = (name, ok, detail = '') => { total++; if (!ok) bad++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`); };

/** A stub compositor: rAF callbacks queue until the next delivered frame. `stalled` starts it frozen; `stallAfter`
 * freezes it after that many delivered frames; resume() thaws it. */
function compositor({ stalled = false, stallAfter = Infinity } = {}) {
  let queue = [];
  let live = !stalled;
  let delivered = 0;
  const pump = setInterval(() => {
    if (!live || !queue.length) return;
    const run = queue;
    queue = [];
    delivered += 1;
    for (const cb of run) cb(performance.now());
    if (delivered >= stallAfter) live = false;
  }, 16);
  return {
    raf: (cb) => { queue.push(cb); return queue.length; },
    resume: () => { live = true; },
    stop: () => clearInterval(pump),
  };
}

/** One settledRead over a stub page; `rewrite` maps the page-side source (the identity, or a plant). A read still
 * pending WATCHDOG ms after its cap resolves { hung: true }, so a lost bound fails by name instead of holding the job. */
async function read(rewrite, { comp, probe, capMs }) {
  const ctx = vm.createContext({ requestAnimationFrame: comp.raf, setTimeout, clearTimeout, performance, probe });
  let seen = '';
  const c = { eval: async (src) => { seen = src; return vm.runInContext(rewrite(src), ctx); } };
  let dog = 0;
  const hung = new Promise((r) => { dog = setTimeout(() => r({ hung: true }), capMs + WATCHDOG); });
  const t0 = performance.now();
  try {
    const r = await Promise.race([settledRead(c, 'probe.read()', { capMs }), hung]);
    return { r, ms: Math.round(performance.now() - t0), seen };
  } finally { clearTimeout(dog); comp.stop(); }
}

const fmt = (x) => (x.r.hung ? `no verdict ${x.ms} ms after the read started (the bound was lost)`
  : `settled ${x.r.settled} n ${x.r.n} run ${x.r.run} value ${JSON.stringify(x.r.value)} after ${x.ms} ms`);

/** Run every scenario against one rewrite; returns { out: { key: { name, ok, detail } }, raw: { key: result }, seen }. */
async function scenarios(rewrite) {
  const out = {};
  const raw = {};
  let seen = '';
  const put = (key, name, x, ok) => { seen = x.seen; raw[key] = x.r; out[key] = { name, ok, detail: fmt(x) }; };
  { // frames stalled for the whole cap, timers live
    const x = await read(rewrite, { comp: compositor({ stalled: true }), probe: { read: () => 'bands-en' }, capMs: CAP });
    put('stalled', `frames stalled for the whole ${CAP} ms cap: unsettled with n 0, returned at the cap, never early`, x,
      x.r.settled === false && x.r.n === 0 && x.r.run === 0 && x.r.value === 'bands-en' && x.ms >= CAP - SLACK && x.ms < CAP + LATE);
  }
  { // two equal reads, then the frames stall
    const x = await read(rewrite, { comp: compositor({ stallAfter: 2 }), probe: { read: () => 'bands-en' }, capMs: CAP });
    put('partial', 'frames stall after two equal reads: timer wakeups never complete the run, unsettled at the cap', x,
      x.r.settled === false && x.r.n === 2 && x.r.run === 2 && x.ms >= CAP - SLACK && x.ms < CAP + LATE);
  }
  { // K05's case: the shell's band publish is rAF-scheduled (scheduleBands) and the frames stall for 1 s
    const comp = compositor({ stalled: true });
    const probe = { v: 'bands-en', read() { return this.v; } };
    comp.raf(() => { probe.v = 'bands-ja'; });
    const thaw = setTimeout(() => comp.resume(), 1000);
    const x = await read(rewrite, { comp, probe, capMs: 3000 });
    clearTimeout(thaw);
    put('pending', 'an rAF-scheduled write pending across a 1 s stall: the read waits for the frame and settles on the written value', x,
      x.r.settled === true && x.r.value === 'bands-ja' && x.r.n === 4 && x.r.run === 3 && x.ms >= 1000 - SLACK);
  }
  { // live frames, still probe: a fresh object per read with the same content, like every consumer's probe
    const x = await read(rewrite, { comp: compositor(), probe: { read: () => ({ lang: 'ja', rail: [826, 524, 916, 888] }) }, capMs: 3000 });
    put('still', 'live frames, still probe (a fresh object per read): settled after exactly 3 frames', x,
      x.r.settled === true && x.r.n === 3 && x.r.run === 3 && x.r.value?.lang === 'ja' && x.r.value?.rail?.[0] === 826 && x.ms < 3000);
  }
  { // live frames, moving probe
    let k = 0;
    const x = await read(rewrite, { comp: compositor(), probe: { read: () => k++ }, capMs: 600 });
    put('moving', 'live frames, moving probe: unsettled at the cap with the frames counted', x,
      x.r.settled === false && x.r.n >= 3 && x.r.run === 0 && x.ms >= 600 - SLACK);
  }
  { // live frames, a probe that changes after equal reads: every change restarts the run
    const seq = ['A', 'A', 'A', 'B', 'B', 'C'];
    let i = 0;
    const x = await read(rewrite, { comp: compositor(), probe: { read: () => seq[Math.min(i++, seq.length - 1)] }, capMs: 3000 });
    put('abc', 'a probe that changes after equal reads (A A A B B C …): the run restarts on each change, settled on C after 8 frames', x,
      x.r.settled === true && x.r.value === 'C' && x.r.n === 8 && x.r.run === 3);
  }
  return { out, raw, seen };
}

const fixed = await scenarios((s) => s);
for (const v of Object.values(fixed.out)) report(v.name, v.ok, v.detail);

// the caller's note tells the three unsettled results apart, from the real results above
{
  const { stalled, partial, moving } = fixed.raw;
  const notes = [stalled, partial, moving].map((r) => (r && !r.hung ? unsettledNote(r) : 'no result'));
  const m = /^the probe last changed at frame (\d+) of (\d+), 0 equal frame\(s\) before the cap$/.exec(notes[2]);
  report('unsettledNote: no frame / frames stopped / still moving are worded apart',
    notes[0] === 'no animation frame arrived before the cap (a stalled compositor)'
      && notes[1] === 'only 2 frame(s) arrived before the cap, the probe unchanged (frames stalled or slow)'
      && !!m && m[1] === m[2] && Number(m[2]) === moving?.n,
    notes.map((s) => JSON.stringify(s)).join(' | '));
}

// plants: each must fail exactly its named scenarios while the rest hold
const PLANTS = [
  ['pre-fix wakeup (a 250 ms timer resolves as a frame)', FIXED_WAIT, OLD_WAIT, ['stalled', 'partial', 'pending']],
  ['frame wait without the deadline', FIXED_WAIT, NO_BOUND_WAIT, ['stalled', 'partial']],
  ['a run that never restarts on a change', FIXED_RESET, NO_RESET, ['abc']],
];
for (const [label, line, plant, fails] of PLANTS) {
  const planted = await scenarios((s) => s.replace(line, plant));
  const rows = Object.entries(planted.out);
  report(`PLANT ${label}: ${fails.join(' / ')} must FAIL, the rest hold`,
    fixed.seen.includes(line) && rows.every(([k, v]) => (fails.includes(k) ? !v.ok : v.ok)),
    fixed.seen.includes(line) ? rows.map(([k, v]) => `${k} ${v.ok ? 'held' : 'failed'} (${v.detail})`).join('; ')
      : `the planted line was not found in the page-side source — update the PLANTS row with the code (${line})`);
}

console.log(bad ? `FAIL test-locale-settle ${total - bad}/${total} (${bad} failed)`
  : `PASS test-locale-settle ${total}/${total} (6 scenarios + the note + ${PLANTS.length} plants)`);
process.exit(bad ? 1 : 0);
