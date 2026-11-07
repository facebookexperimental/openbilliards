// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-input-clock.mjs — #1130 follow-up and #1136: the one input-clock stamp
// helper (web/app/inputclock.js), its consumers (shell.js, practice.js's hold
// echo), play.js's commit-latch copy, and the hold echo's pointer-only rule.
//
// The hold echo is guard 3 of #1130. Its pointer half, the hold's own trailing
// click landing on an act row, has no browser arm (a mouse hold's click goes
// to the chrome under the press; a touch hold cancels its touchend), so it is
// judged here; its keyboard half (#1136) also runs in a browser (e2e-practice
// P-E2). The helper is
// imported as the shipped ES module. practice.js's echo block (HOLD_ECHO_MS …
// holdEcho) and its primary() commit are sliced out of the shipped file and run
// in a node:vm context over a virtual page clock (performance.now), a
// window.event stand-in, and a shell ctx with or without the `inputClock`
// member. No browser, no ports.
//
//   H1-H8  the helper: an in-window stamp is kept; the 50 ms lead and the 60 s
//          age are the bounds; 0 (inside the page's first minute too), a
//          negative, an epoch-ms or a non-number stamp falls back to now; the
//          default `now` is the page clock
//   G1-G11 the echo under a current shell.js, on both clocks: the trailing
//          pointer click is dropped (in the window; queued behind a long task;
//          late-stamped); a click after the window on both clocks acts; a
//          keyboard activation (detail 0) acts 200 ms after the commit, with
//          or without a long task (#1136); foreign click and commit stamps
//          fall back to now (a raw stamp would keep the window open or shut);
//          nothing is dropped before a commit; a release queued behind a long
//          task keeps its own stamp, so a later deliberate click acts (G11)
//   S1-S4  the echo under a stale shell.js that lacks the member (and with no
//          shell at all): the handler's clock alone, the pre-#1130 bound, and
//          #1136 unchanged
//   W1     every act-row listener passes its own click to holdEcho
//   W2     one helper: no web/app line outside inputclock.js carries the stamp
//          predicate: the 60 s age bound (any common spelling; `now - 60000` or
//          `now - ts < 60000`), the 50 ms lead bound (`ts <= now + 50` or
//          `ts - now <= 50`), or a 60 s literal beside a 50 on one line (named
//          constants declared together); play.js's one commit-latch line
//          excepted; one plant per form. A heuristic census: two constants
//          declared on separate lines and used by name escape it
//   W3     play.js's commit latch keeps its own copy (play's packaging law 2
//          forbids the import; a ctx fallback would move it to the handler
//          clock under a stale shell.js): the copy reads neither the helper
//          nor the ctx and agrees with the helper on every stamp a browser
//          delivers (sliced, run in a vm). #1145 (build 21) keeps the copy by
//          decision; P9 and P9d plant the ctx and import routes, P9b and P9c a
//          drifted bound, P9e the handler's clock alone
//   W4     shell.js: its inputClock wrapper returns the module's stamp, and the
//          handler's clock for a module without the export (sliced, run in a
//          vm); the namespace import, contStamp and the shellCtx member
//
// --selftest-plants: each plant edits a source the way a regression would and
// must turn its target arm red.
//
//   node web/tools/test-input-clock.mjs [--selftest-plants]
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { inputClock as shippedClock } from '../app/inputclock.js';

const ARGV = process.argv.slice(2);
if (ARGV.length > 1 || (ARGV.length === 1 && ARGV[0] !== '--selftest-plants')) {
  console.error(`test-input-clock: unknown argument(s) ${JSON.stringify(ARGV)}; the only flag is --selftest-plants`);
  process.exit(2);
}

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(webDir, rel), 'utf8');
const CLOCK_SRC = read('app/inputclock.js');
const PRACTICE_SRC = read('app/practice.js');
const PLAY_SRC = read('app/play.js');
const SHELL_SRC = read('app/shell.js');

/** The helper from its source text, over a fixed page clock (4242) — the
 * plants edit the text; the unplanted arms judge the imported module. */
const VM_PAGE_NOW = 4242;
function clockFrom(src) {
  const body = src.replace(/^export function inputClock\(/m, 'function inputClock(');
  if (body === src) throw new Error('inputclock.js: the inputClock export moved');
  const context = vm.createContext({ performance: { now: () => VM_PAGE_NOW } });
  return vm.runInContext(`${body}\ninputClock;`, context, { filename: 'inputclock.js', timeout: 1000 });
}

/** practice.js's echo block + primary(), sliced at their source boundaries. */
function echoSource(src) {
  const a = src.indexOf('  const HOLD_ECHO_MS = 600;');
  const h = src.indexOf('  const holdEcho = ', a);
  const b = src.indexOf(';\n', h); // the holdEcho statement is one arrow expression
  const p = src.indexOf('  const primary = () => {');
  const q = src.indexOf('\n  };', p);
  if (a < 0 || h < 0 || b < 0 || p < 0 || q < 0) {
    throw new Error('practice.js: the hold-echo / primary() source boundaries moved');
  }
  return `${src.slice(a, b + 1)}\n${src.slice(p, q + '\n  };'.length)}`;
}

/** The sliced echo over a virtual clock. `shellKind`: 'fresh' (the ctx member,
 * the helper on the virtual clock), 'stale' (a shell ctx without it) or 'none'
 * (no shell at all). commit() runs primary() inside a release event stamped
 * `stamp`; echo() judges a click { detail, timeStamp } handled at `at`. */
function practiceEcho(src, shellKind, clock) {
  const page = { now: 0 };
  const win = { event: null };
  const acts = [];
  const shell = shellKind === 'fresh' ? { inputClock: (ts) => clock(ts, page.now) }
    : shellKind === 'stale' ? { isOpen: () => true } : undefined;
  const context = vm.createContext({ performance: { now: () => page.now }, window: win });
  const make = vm.runInContext(`(function (shell, actions) {\n${echoSource(src)}\nreturn { holdEcho, primary };\n})`,
    context, { filename: 'practice-echo.js', timeout: 1000 });
  const api = make(shell, { drills: () => { acts.push('drills'); return true; } });
  return {
    acts,
    commit(stamp, at) {
      page.now = at;
      win.event = stamp === undefined ? null : { type: 'pointerup', timeStamp: stamp };
      try { api.primary(); } finally { win.event = null; }
    },
    echo(detail, stamp, at) {
      page.now = at;
      const e = { type: 'click', detail, timeStamp: stamp };
      win.event = e; // the click dispatching now (a pre-#1136 holdEcho read window.event)
      try { return api.holdEcho(e); } finally { win.event = null; }
    },
  };
}

const want = (cond, msg) => { if (!cond) throw new Error(msg); };
const eq = (got, exp, what) => want(Object.is(got, exp), `${what}: got ${got}, want ${exp}`);

// the commit the G/S arms share: the release is stamped 4990 and handled at 5000
const COMMIT = [4990, 5000];

const ARMS = [
  // ---- the helper ----
  { id: 'H1', fn: ({ clock }) => eq(clock(900, 1000), 900, 'an in-window stamp is kept') },
  { id: 'H2', fn: ({ clock }) => {
    eq(clock(1050, 1000), 1050, 'a stamp 50 ms ahead is kept');
    eq(clock(1051, 1000), 1000, 'a stamp 51 ms ahead falls back to now');
  } },
  { id: 'H3', fn: ({ clock }) => {
    eq(clock(10001, 70000), 10001, 'a stamp 59 999 ms old is kept');
    eq(clock(10000, 70000), 70000, 'a stamp 60 000 ms old falls back to now');
  } },
  { id: 'H4', fn: ({ clock }) => eq(clock(0, 1000), 1000, 'a 0 stamp inside the first minute falls back to now') },
  { id: 'H5', fn: ({ clock }) => eq(clock(-5, 1000), 1000, 'a negative stamp falls back to now') },
  { id: 'H6', fn: ({ clock }) => eq(clock(1.76e12, 5000), 5000, 'an epoch-ms stamp falls back to now') },
  { id: 'H7', fn: ({ clock }) => {
    for (const v of [undefined, null, NaN, Infinity, -Infinity, '900', {}]) {
      eq(clock(v, 1000), 1000, `a ${typeof v} stamp ${String(v)} falls back to now`);
    }
  } },
  { id: 'H8', fn: ({ clock, pageNow }) => {
    const before = pageNow(); const v = clock(undefined); const after = pageNow();
    want(v >= before && v <= after, `the default now is the page clock: got ${v}, page clock ${before}..${after}`);
  } },
  // ---- the echo under a current shell.js (both clocks) ----
  { id: 'G1', fn: ({ src, clock }) => {
    const p = practiceEcho(src, 'fresh', clock); p.commit(...COMMIT);
    eq(p.acts.length, 1, 'the commit ran the drills action once');
    eq(p.echo(1, 5050, 5060), true, 'the trailing pointer click 60 ms after the commit is dropped');
  } },
  { id: 'G2', fn: ({ src, clock }) => {
    const p = practiceEcho(src, 'fresh', clock); p.commit(...COMMIT);
    eq(p.echo(1, 5100, 5900), true, 'a pointer click made 110 ms after the commit but handled 900 ms after it (a long task) is dropped');
  } },
  { id: 'G3', fn: ({ src, clock }) => {
    const p = practiceEcho(src, 'fresh', clock); p.commit(...COMMIT);
    eq(p.echo(1, 5640, 5595), true, 'a late-stamped pointer click (stamp 650 ms after, handled 595 ms after) is dropped');
  } },
  { id: 'G4', fn: ({ src, clock }) => {
    const p = practiceEcho(src, 'fresh', clock); p.commit(...COMMIT);
    eq(p.echo(1, 5700, 5710), false, 'a pointer click after the window on both clocks acts');
  } },
  { id: 'G5', fn: ({ src, clock }) => {
    const p = practiceEcho(src, 'fresh', clock); p.commit(...COMMIT);
    eq(p.echo(0, 5190, 5200), false, 'a keyboard Enter (a detail-0 click) 200 ms after the commit acts');
    eq(p.echo(1, 5250, 5260), true, 'and the trailing pointer click is still dropped');
  } },
  { id: 'G6', fn: ({ src, clock }) => {
    const p = practiceEcho(src, 'fresh', clock); p.commit(...COMMIT);
    eq(p.echo(0, 5100, 5900), false, 'a keyboard activation queued behind a long task acts');
  } },
  { id: 'G7', fn: ({ src, clock }) => {
    const p = practiceEcho(src, 'fresh', clock); p.commit(...COMMIT);
    eq(p.echo(1, 1.76e12, 5100), true, 'an epoch-ms click stamp falls back to now and is judged there (dropped)');
    eq(p.echo(1, 0, 6000), false, 'a click stamped 0 falls back to now, after the window on both clocks: it acts (a raw 0 reads as inside the window)');
    eq(p.echo(1, -3, 6000), false, 'a negative click stamp falls back to now likewise: it acts');
  } },
  { id: 'G8', fn: ({ src, clock }) => {
    for (const stamp of [undefined, 0]) {
      const p = practiceEcho(src, 'fresh', clock); p.commit(stamp, 5000);
      eq(p.echo(1, 5050, 5060), true, `a commit with ${stamp === undefined ? 'no event' : 'a 0 stamp'}: the click in the window is dropped`);
      eq(p.echo(1, 5700, 5710), false, `a commit with ${stamp === undefined ? 'no event' : 'a 0 stamp'}: the click after it acts`);
    }
  } },
  { id: 'G10', fn: ({ src, clock }) => {
    for (const stamp of [1.76e12, Infinity]) {
      const p = practiceEcho(src, 'fresh', clock); p.commit(stamp, 5000);
      eq(p.echo(1, 5050, 5060), true, `a commit stamped ${stamp}: the click in the window is dropped`);
      eq(p.echo(1, 10000, 10010), false, `a commit stamped ${stamp} falls back to now: a pointer click 5 s later acts (a raw stamp keeps the window open)`);
    }
  } },
  { id: 'G11', fn: ({ src, clock }) => {
    const p = practiceEcho(src, 'fresh', clock); p.commit(4000, 5000);
    eq(p.echo(1, 5200, 5700), false, 'a release queued 1 s behind a long task keeps its own stamp: a deliberate pointer click 1.2 s after it acts');
  } },
  { id: 'G9', fn: ({ src, clock }) => {
    const p = practiceEcho(src, 'fresh', clock);
    eq(p.echo(1, 5050, 5060), false, 'before any commit a pointer click acts');
  } },
  // ---- the echo under a stale shell.js ----
  { id: 'S1', fn: ({ src, clock }) => {
    const p = practiceEcho(src, 'stale', clock); p.commit(...COMMIT);
    eq(p.echo(1, 5100, 5900), false, 'a stale shell: a click queued past the window acts (the handler clock alone, the pre-#1130 bound)');
  } },
  { id: 'S2', fn: ({ src, clock }) => {
    const p = practiceEcho(src, 'stale', clock); p.commit(...COMMIT);
    eq(p.echo(1, 5250, 5300), true, 'a stale shell: the trailing pointer click inside the handler window is dropped');
  } },
  { id: 'S3', fn: ({ src, clock }) => {
    const p = practiceEcho(src, 'stale', clock); p.commit(...COMMIT);
    eq(p.echo(0, 5190, 5200), false, 'a stale shell: a keyboard activation 200 ms after the commit acts');
  } },
  { id: 'S4', fn: ({ src, clock }) => {
    const p = practiceEcho(src, 'none', clock); p.commit(...COMMIT);
    eq(p.echo(1, 5050, 5060), true, 'no shell ctx: the trailing pointer click is dropped');
    eq(p.echo(1, 5700, 5710), false, 'no shell ctx: a click after the window acts');
  } },
  // ---- wiring ----
  { id: 'W1', fn: ({ src }) => {
    const lines = src.split('\n');
    const calls = [];
    lines.forEach((l, i) => { if (/holdEcho\(/.test(l) && !/const holdEcho = /.test(l)) calls.push(i); });
    eq(calls.length, 4, 'holdEcho call sites (Drills, Free practice, All assists, the last-drill row)');
    for (const i of calls) {
      want(/holdEcho\(e\)/.test(lines[i]), `practice.js:${i + 1} does not pass its click: ${lines[i].trim()}`);
      const head = lines.slice(Math.max(0, i - 1), i + 1).join('\n');
      want(/addEventListener\('click', \(e\) => \{/.test(head),
        `practice.js:${i + 1} is not inside a click listener taking (e): ${lines[i].trim()}`);
    }
  } },
  { id: 'W2', fn: ({ src, clockSrc, playSrc }) => {
    // a copy of the predicate, judged per line: the 60 s age bound in any common spelling, in the helper's form or the
    // house form `now - ts < 60000` (AGE); the 50 ms lead bound, `ts <= now + 50` or `ts - now <= 50` (LEAD); or a 60 s
    // literal beside a standalone 50 (PAIR: house-style copies, named constants declared together)
    const SIXTY = '(?:60000|60_000|6e4|6E4|60e3|60E3|60\\s*\\*\\s*1000|1000\\s*\\*\\s*60)';
    const CLAUSES = [
      ['AGE', new RegExp(`now(\\(\\))?\\s*-\\s*(${SIXTY}|[\\w.?]+\\s*<=?\\s*${SIXTY})\\b`)],
      ['LEAD', /<=\s*[\w.]*now(\(\))?\s*\+\s*50\b|-\s*[\w.]*now(\(\))?\s*<=?\s*50\b/],
      ['PAIR', { test: (l) => new RegExp(`\\b${SIXTY}\\b`).test(l) && /\b50\b/.test(l) }],
    ];
    const hits = [];
    const walk = (rel) => {
      for (const ent of fs.readdirSync(path.join(webDir, rel), { withFileTypes: true })) {
        const r = `${rel}/${ent.name}`;
        if (ent.isDirectory()) { walk(r); continue; }
        if (!r.endsWith('.js')) continue;
        const text = r === 'app/practice.js' ? src : r === 'app/inputclock.js' ? clockSrc : r === 'app/play.js' ? playSrc : read(r);
        // play.js's commit-latch line is the one kept copy (W3 holds it to the helper's verdicts)
        const lines = text.split('\n').filter((l) => !(r === 'app/play.js' && /\bevStamp = \(\) =>/.test(l)));
        for (const [name, re] of CLAUSES) if (lines.some((l) => re.test(l))) hits.push(`${name} ${r}`);
      }
    };
    walk('app');
    want(['AGE', 'LEAD', 'PAIR'].every((c) => hits.includes(`${c} app/inputclock.js`)),
      `the census no longer sees the helper itself (a clause broke): ${JSON.stringify(hits)}`);
    const foreign = hits.filter((h) => !h.endsWith(' app/inputclock.js'));
    want(foreign.length === 0, `the stamp predicate must live only in app/inputclock.js (and play.js's evStamp line); found ${JSON.stringify(foreign)}`);
  } },
  { id: 'W3', fn: ({ playSrc, clock }) => {
    want(!/shell\??\.inputClock|inputclock\.js/.test(playSrc),
      'play.js neither imports the helper nor reads it through the shell ctx (play packaging law 2; a stale shell.js must not move its latch)');
    const latch = playSrc.split('\n').filter((l) => /\bevStamp = \(\) =>/.test(l));
    eq(latch.length, 1, 'play.js evStamp lines (the one kept copy; W2 excepts exactly this line)');
    const line = latch[0];
    const at = line.indexOf('evStamp = ') + 'evStamp = '.length;
    const end = line.indexOf('; //', at);
    want(end > at, 'play.js: the evStamp arrow no longer ends before its comment on the same line');
    const page = { now: 0 };
    const win = { event: null };
    const context = vm.createContext({ performance: { now: () => page.now }, window: win });
    const evStamp = vm.runInContext(`(${line.slice(at, end)})`, context, { filename: 'play-evstamp.js', timeout: 1000 });
    // every stamp a browser delivers: inside the window, both bounds, foreign epoch ms, Infinity, NaN, no event. The
    // copy differs from the helper only on a 0 or negative stamp inside the page's first minute, which no browser sends
    for (const [ts, now] of [[900, 1000], [1050, 1000], [1051, 1000], [10001, 70000], [10000, 70000], [1.76e12, 5000],
      [Infinity, 1000], [NaN, 1000], [undefined, 1000], [123456.5, 123500]]) {
      page.now = now;
      win.event = ts === undefined ? null : { type: 'click', timeStamp: ts };
      eq(evStamp(), clock(ts, now), `play.js's latch stamp agrees with the helper at stamp ${ts}, now ${now}`);
    }
  } },
  { id: 'W4', fn: ({ shellSrc, clock }) => {
    const a = shellSrc.indexOf('  function inputClock(ts) {');
    const b = shellSrc.indexOf('\n  }', a);
    want(a > 0 && b > a, 'shell.js: the inputClock wrapper moved');
    const fnSrc = shellSrc.slice(a, b + '\n  }'.length);
    const page = { now: 1000 };
    const context = vm.createContext({ performance: { now: () => page.now } });
    const wrapper = (ns) => vm.runInContext(`(function (stampNs) {\n${fnSrc}\nreturn inputClock;\n})`, context, { filename: 'shell-inputclock.js', timeout: 1000 })(ns);
    eq(wrapper({ inputClock: (ts) => clock(ts, page.now) })(900), 900, "the shell's wrapper returns the module's stamp");
    eq(wrapper({})(900), 1000, "the shell's wrapper for a module without the export (the handler clock)");
    want(/^import \* as stampNs from '\.\/inputclock\.js';/m.test(shellSrc), "shell.js: the namespace import of './inputclock.js'");
    want(/const contStamp = \(e\) => inputClock\(e\?\.timeStamp\);/.test(shellSrc), "shell.js: the continuation guard's contStamp goes through inputClock");
    const c0 = shellSrc.indexOf('function shellCtx(section) {');
    const c1 = shellSrc.indexOf('\n  }', c0);
    want(c0 > 0 && /\n\s+inputClock,\n/.test(shellSrc.slice(c0, c1)), 'shellCtx hands inputClock to the content modules');
  } },
];

const NEW_ECHO = `  const holdEcho = (e) => (e?.detail ?? 0) > 0
    && (inputClock(e.timeStamp) - holdCommitAt.input < HOLD_ECHO_MS
      || performance.now() - holdCommitAt.handled < HOLD_ECHO_MS);`;
const PLANTS = [
  // the pre-#1136 echo (905fb239's form): every click is judged, keyboard ones included
  ['P1', 'G5', 'practice', (s) => s.replace(NEW_ECHO, `  const holdEcho = () => inputClock(window.event?.timeStamp) - holdCommitAt.input < HOLD_ECHO_MS
    || performance.now() - holdCommitAt.handled < HOLD_ECHO_MS;`)],
  ['P1b', 'G6', 'practice', (s) => s.replace('(e?.detail ?? 0) > 0\n    && ', '')],
  // the pre-#1130 echo: the handler's clock alone
  ['P2', 'G2', 'practice', (s) => s.replace('inputClock(e.timeStamp) - holdCommitAt.input < HOLD_ECHO_MS\n      || ', '')],
  // the input bound alone: a late-stamped click escapes
  ['P3', 'G3', 'practice', (s) => s.replace('\n      || performance.now() - holdCommitAt.handled < HOLD_ECHO_MS', '')],
  // no feature detection: a stale shell (or none) breaks the echo
  ['P4', 'S1', 'practice', (s) => s.replace("typeof shell?.inputClock === 'function' ? shell.inputClock : () => performance.now()", 'shell.inputClock')],
  ['P4b', 'S4', 'practice', (s) => s.replace("typeof shell?.inputClock === 'function' ? shell.inputClock : () => performance.now()", 'shell.inputClock')],
  // a call site that stops passing its click
  ['P5', 'W1', 'practice', (s) => s.replace("drills.b.addEventListener('click', (e) => { if (!holdEcho(e)) actions.drills(); });",
    "drills.b.addEventListener('click', () => { if (!holdEcho()) actions.drills(); });")],
  // a second copy of the predicate comes back: one plant per AGE spelling (age-only, so only AGE can catch it), one
  // lead-only copy in play.js (LEAD), the house forms of each bound (AGE / LEAD), and the forms only PAIR can see (a
  // renamed clock, named constants declared together); the 5th field is the clause that must catch it, alone
  ...['60000', '60_000', '6e4', '6E4', '60e3', '60E3', '60 * 1000', '1000 * 60'].map((k, i) => [`P6.${i + 1}`, 'W2', 'practice',
    (s) => s.replace('  const HOLD_ECHO_MS = 600;', `  const HOLD_ECHO_MS = 600;\n  const ownAge = (ts) => (ts > performance.now() - ${k} ? ts : performance.now());`),
    'AGE app/practice.js']),
  ['P6.9', 'W2', 'play', (s) => s.replace('  let committing = null;',
    '  const ownLead = (ts) => (ts <= performance.now() + 50 ? ts : performance.now());\n  let committing = null;'), 'LEAD app/play.js'],
  ['P6.10', 'W2', 'practice', (s) => s.replace('  const HOLD_ECHO_MS = 600;',
    '  const HOLD_ECHO_MS = 600;\n  const ownClock = (ts) => { const t0 = performance.now(); return Number.isFinite(ts) && ts > 0 && t0 - ts < 60000 && ts - t0 <= 50 ? ts : t0; };'),
  'PAIR app/practice.js'],
  ['P6.11', 'W2', 'practice', (s) => s.replace('  const HOLD_ECHO_MS = 600;',
    '  const HOLD_ECHO_MS = 600;\n  const STAMP_AGE_MS = 60000, STAMP_LEAD_MS = 50;'), 'PAIR app/practice.js'],
  ['P6.12', 'W2', 'practice', (s) => s.replace('  const HOLD_ECHO_MS = 600;',
    '  const HOLD_ECHO_MS = 600;\n  const ownT = (ts) => { const t = performance.now(); return ts > t - 60000 && ts <= t + 50 ? ts : t; };'),
  'PAIR app/practice.js'],
  ['P6.13', 'W2', 'practice', (s) => s.replace('  const HOLD_ECHO_MS = 600;',
    '  const HOLD_ECHO_MS = 600;\n  const ownAgeH = (ts) => (performance.now() - ts < 60000 ? ts : performance.now());'), 'AGE app/practice.js'],
  ['P6.14', 'W2', 'practice', (s) => s.replace('  const HOLD_ECHO_MS = 600;',
    '  const HOLD_ECHO_MS = 600;\n  const ownLeadH = (ts) => (ts - performance.now() <= 50 ? ts : performance.now());'), 'LEAD app/practice.js'],
  // the helper loses its positive-stamp clause (the pre-consolidation contStamp form)
  ['P7', 'H4', 'clock', (s) => s.replace('Number.isFinite(ts) && ts > 0 && ', '')],
  // the helper loses its lead bound
  ['P8', 'H2', 'clock', (s) => s.replace(' && ts <= now + 50', '')],
  // play.js's latch through the shell ctx (the round-1 form): a stale shell.js would move it to the handler clock
  ['P9', 'W3', 'play', (s) => s.replace('evStamp = () => { const now = performance.now(), ts = window.event?.timeStamp; return ts > now - 60000 && ts <= now + 50 ? ts : now; };',
    "evStamp = () => (typeof shell.inputClock === 'function' ? shell.inputClock(window.event?.timeStamp) : performance.now());")],
  // play.js's copy drifts from the helper (a wider lead bound)
  ['P9b', 'W3', 'play', (s) => s.replace('return ts > now - 60000 && ts <= now + 50 ? ts : now; }; // the activation',
    'return ts > now - 60000 && ts <= now + 100 ? ts : now; }; // the activation')],
  // #1145: the copy drifts from the helper the other way (a narrower age bound)
  ['P9c', 'W3', 'play', (s) => s.replace('return ts > now - 60000 && ts <= now + 50 ? ts : now; }; // the activation',
    'return ts > now - 30000 && ts <= now + 50 ? ts : now; }; // the activation')],
  // #1145: play.js imports the helper (law 2 unamended; under an older shell.js one failed fetch degrades the place)
  ['P9d', 'W3', 'play', (s) => s.replace("import { GAME_CATALOG, getGameEntry } from '../dist/pool-sdk/games/index.js';",
    "import { GAME_CATALOG, getGameEntry } from '../dist/pool-sdk/games/index.js';\nimport * as stampNs from './inputclock.js';")],
  // #1145: a consolidation that drops the event stamps (the latch on the handler's clock alone)
  ['P9e', 'W3', 'play', (s) => s.replace('evStamp = () => { const now = performance.now(), ts = window.event?.timeStamp; return ts > now - 60000 && ts <= now + 50 ? ts : now; };',
    'evStamp = () => performance.now();')],
  // shell.js's wrapper without feature detection, and without the ctx member
  ['P10', 'W4', 'shell', (s) => s.replace("return typeof stampNs.inputClock === 'function' ? stampNs.inputClock(ts) : performance.now();",
    'return stampNs.inputClock(ts);')],
  ['P11', 'W4', 'shell', (s) => s.replace(/(\n        showThenOpen,\n)(        \/\/ [^\n]*\n)*        inputClock,\n/, '$1')],
  // the hold commit records the raw release stamp: a foreign stamp keeps the window open
  ['P12', 'G10', 'practice', (s) => s.replace('holdCommitAt = { input: inputClock(window.event?.timeStamp), handled: performance.now() };',
    'holdCommitAt = { input: window.event?.timeStamp ?? performance.now(), handled: performance.now() };')],
  // the echo reads the raw click stamp: a 0 stamp reads as inside the window
  ['P13', 'G7', 'practice', (s) => s.replace('inputClock(e.timeStamp) - holdCommitAt.input', 'e.timeStamp - holdCommitAt.input')],
  // the hold commit ignores its release stamp (the pre-#1130 commit): a queued release opens the window late
  ['P14', 'G11', 'practice', (s) => s.replace('holdCommitAt = { input: inputClock(window.event?.timeStamp), handled: performance.now() };',
    'holdCommitAt = { input: performance.now(), handled: performance.now() };')],
];

async function runArm(a, srcs) {
  try { await a.fn(srcs); return null; } catch (e) { return String(e?.message ?? e).split('\n')[0]; }
}
const shipped = { src: PRACTICE_SRC, clockSrc: CLOCK_SRC, playSrc: PLAY_SRC, shellSrc: SHELL_SRC, clock: shippedClock, pageNow: () => performance.now() };

let bad = 0;
if (ARGV[0] === '--selftest-plants') {
  for (const [id, target, file, plant, by] of PLANTS) {
    const source = { clock: CLOCK_SRC, practice: PRACTICE_SRC, play: PLAY_SRC, shell: SHELL_SRC }[file];
    const planted = plant(source);
    if (planted === source) { bad++; console.log(`BAD ${id}: the plant did not apply (its anchor moved)`); continue; }
    const srcs = file === 'clock'
      ? { ...shipped, clockSrc: planted, clock: clockFrom(planted), pageNow: () => VM_PAGE_NOW }
      : { ...shipped, [{ practice: 'src', play: 'playSrc', shell: 'shellSrc' }[file]]: planted };
    const why = await runArm(ARMS.find((a) => a.id === target), srcs);
    // attribution: a plant that names its clause must be caught by that clause and by no other
    const others = by ? ['AGE', 'LEAD', 'PAIR'].filter((c) => !by.startsWith(`${c} `)).map((c) => `${c} ${by.split(' ')[1]}`) : [];
    if (why === null) { bad++; console.log(`BAD ${id}: arm ${target} stayed green on the plant`); } else if (by && (!why.includes(by) || others.some((o) => why.includes(o)))) {
      bad++; console.log(`BAD ${id}: arm ${target} red, but not by ${by} alone — ${why}`);
    } else {
      console.log(`ok  ${id}: arm ${target} red on the plant — ${why}`);
    }
  }
  console.log(bad ? `test-input-clock --selftest-plants: ${bad} FAILURE(S)` : `test-input-clock --selftest-plants: OK (${PLANTS.length} plants)`);
} else {
  // the vm copy of the shipped helper must agree with the imported module, so
  // the clock plants judge the same function the arms judge unplanted
  const copy = clockFrom(CLOCK_SRC);
  for (const [ts, now] of [[900, 1000], [1050, 1000], [1051, 1000], [0, 1000], [1.76e12, 5000], [undefined, 1000]]) {
    if (!Object.is(copy(ts, now), shippedClock(ts, now))) { bad++; console.log(`BAD the vm copy disagrees with the module at (${ts}, ${now})`); }
  }
  for (const a of ARMS) {
    const why = await runArm(a, shipped);
    if (why !== null) bad++;
    console.log(`${why === null ? 'ok ' : 'BAD'} ${a.id}${why === null ? '' : ` — ${why}`}`);
  }
  console.log(bad ? `test-input-clock: ${bad} FAILURE(S)` : `test-input-clock: OK (${ARMS.length} arms)`);
}
process.exitCode = bad ? 1 : 0;
