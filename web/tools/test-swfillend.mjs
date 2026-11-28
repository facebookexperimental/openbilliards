// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-swfillend.mjs — #1416: the fill-end record of the service-worker legs
// (swscope, swlegacy, swshared, swnested in e2e-userboot-3g-sw.mjs), judged in
// Node (no browser). The legs run nightly; this arm runs per PR and slices
// from the legs' source text (never an import: the leg module pulls in the
// browser tools):
//   PINS    the boot guard's mark and its benign-notification text are
//           app.html's own (and main.js clears that mark); the guard still
//           looks at window.__test and data-optional (what `acts` mirrors);
//           the binding's name, the 60 s wait, the 10 s cut, the 500 ms beat
//   RECORD  the new-document hook (FILL_END_REC) over stub page globals: its
//           start push with the guard's mark read AT THE START ('1', null,
//           'unreadable' on an opaque origin) and the path; every window error
//           pushed from the capture phase with what the guard looks at; a
//           fill-end sweep pushed, another sweep not; a beat; nothing from a
//           frame; no throw without a binding, and the queued pushes delivered
//           in order once it attaches
//   TAKE    fillEndTake: each kind kept with the leg's clock; an error's
//           `acts` (the app not up, not optional, not benign); beats capped;
//           an unusable payload refused and counted
//   SINCE   fillEndOf: the wanted version's first broadcast at or after
//           `since`, whichever document held it; one from before `since`
//           (an older worker life) or of another version is never taken
//   BOOT    coldBootRead and its lines over scripted stores: heard by the
//           booted document; heard by the document BEFORE the navigation (the
//           line carries the worker's restart, the commit and that document's
//           silence); a second document with the guard's mark is the boot
//           guard's reload (a FAIL line with the error), also when the first
//           document's start push is lost; a second document without the mark
//           is another reload; a second commit alone counts; errors the guard
//           ignores make no line; another registration's worker is not read
//   STEP    coldFillEnd's own text on a virtual clock: a fill end heard by
//           any document since the stop is taken with no second step; none
//           for 60 s (10 s after the worker's completion line) starts the
//           second step: the workers stopped AGAIN, then the booted document's
//           own {ob:'fill'}, and that fill end is taken with a named line; a
//           silent second step, workers that would not stop and an ask that
//           was not posted are FAIL lines; a boot with a second document
//           fails whatever was heard; a boot of which no fill end is asked
//           waits for nothing and still prints its line
//   LEGS    the four legs' text: the recorder before the first visit and the
//           browser session watched; the leg's clock on its lines; every cold
//           boot through coldStop, coldVisit and coldFillEnd (no bare
//           stopWorkers, no document-side read of fill ends)
//
//   node web/tools/test-swfillend.mjs [--src <e2e-userboot-3g-sw.mjs>]
//   node web/tools/test-swfillend.mjs --selftest
// Exit 0 PASS, 1 FAIL, 2 INVALID.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(HERE, '..');
const SRC_DEFAULT = path.join(HERE, 'e2e-userboot-3g-sw.mjs');
const MECHS = ['PINS', 'RECORD', 'TAKE', 'SINCE', 'BOOT', 'STEP', 'LEGS'];
const PURE = ['fillEndStore', 'fillEndTake', 'fillEndOf', 'coldBootRead', 'coldBootLine', 'coldBootReload'];
const TIMED = ['fillEndHeard', 'coldFillEnd'];
const LEG_HEADS = { swscope: 'export async function legSwScope(', swlegacy: 'export async function legSwLegacy(', swshared: 'export async function legSwShared(', swnested: 'async function nestedSide(' };
// the cold boots of each leg (call sites): swscope's later sweeps and offline boots, one loop or boot in each other leg
const COLD_SITES = { swscope: 2, swlegacy: 1, swshared: 1, swnested: 1 };
const CONSTS = ['FILL_END_BINDING', 'FILL_END_MARK', 'FILL_END_BENIGN', 'FILL_END_BEAT_MS', 'FILL_END_MS', 'FILL_END_DONE_MS', 'FILL_END_REC'];

function lift(src) {
  const constAt = src.indexOf('const FILL_END_BINDING');
  const constEnd = constAt < 0 ? -1 : src.indexOf("\n/** one leg's store", constAt);
  if (constAt < 0 || constEnd < 0) return { invalid: 'the constants (const FILL_END_BINDING up to "/** one leg\'s store") not found' };
  const cut = (head) => { const at = src.indexOf(head); if (at < 0) return null; const e = src.indexOf('\n}\n', at); return e < 0 ? null : src.slice(at, e + 2); };
  const text = {};
  for (const f of PURE) { text[f] = cut(`export function ${f}(`); if (!text[f]) return { invalid: `export function ${f} not found` }; }
  for (const f of TIMED) { text[f] = cut(`async function ${f}(`); if (!text[f]) return { invalid: `async function ${f} not found` }; }
  const legs = {};
  for (const [k, head] of Object.entries(LEG_HEADS)) { legs[k] = cut(head); if (!legs[k]) return { invalid: `the ${k} leg (${head}) not found` }; }
  const body = `${src.slice(constAt, constEnd)}\n${PURE.map((f) => text[f].replace('export function', 'function')).join('\n')}\n${TIMED.map((f) => text[f]).join('\n')}`;
  // the timed parts call the leg module's sleep and stopWorkers: both are handed in
  // eslint-disable-next-line no-new-func
  const make = new Function('sleep', 'stopWorkers', `"use strict";\n${body}\nreturn { ${[...PURE, ...TIMED, ...CONSTS].join(', ')} };`);
  return { make, legs };
}

// a stub page for the hook: the guard's mark in sessionStorage (or an opaque origin: any access throws), the window's
// listeners, the worker container's, the beat timer, an optional binding (attach() adds it later)
function page(name, { mark = null, frame = false, bound = true, opaque = false, up = false, sw = true } = {}) {
  const got = []; const ev = {}; const swLs = []; const timers = [];
  const ctx = {
    performance: { timeOrigin: 5000.4 },
    location: { pathname: '/web/app.html', search: '?sw=1&u=x' },
    navigator: sw ? { serviceWorker: { addEventListener: (k, f) => { if (k === 'message') swLs.push(f); } } } : {},
    addEventListener: (k, f, cap) => { (ev[k] = ev[k] || []).push({ f, cap }); },
    setInterval: (f, ms) => { timers.push({ f, ms }); return timers.length; },
  };
  Object.defineProperty(ctx, 'sessionStorage', { get() { if (opaque) throw new Error('SecurityError: opaque origin'); return { getItem: (k) => (k === 'ob-bootfix-attempted' ? mark : null) }; } });
  ctx.window = ctx; ctx.top = frame ? {} : ctx;
  if (up) ctx.__test = {};
  const attach = () => { ctx[name] = (s) => { got.push(JSON.parse(s)); }; };
  if (bound) attach();
  return { ctx, got, timers, attach, error: (e) => (ev.error || []).forEach((l) => l.f(e)), capture: () => (ev.error || []).map((l) => l.cap), message: (data) => swLs.forEach((f) => f({ data })) };
}

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// a scripted store for BOOT and STEP: S is the booting registration's worker script
const S = 'http://127.0.0.1:1/sw.js', S2 = 'http://127.0.0.1:1/web/sw.js';
function scene(L, { docs = [], fes = [], errs = [], commits = [], runs = [], done = [], beats = {} } = {}) {
  const st = L.fillEndStore();
  for (const d of docs) L.fillEndTake(st, { k: 'doc', to: d.to, mark: d.mark === undefined ? null : d.mark, path: '/app.html' }, d.at);
  for (const f of fes) L.fillEndTake(st, { k: 'fe', to: f.to, version: f.version, removed: 0, deferred: null }, f.at);
  for (const e of errs) L.fillEndTake(st, { k: 'err', to: e.to, msg: e.msg, src: e.src || '', optional: !!e.optional, benign: !!e.benign, up: !!e.up }, e.at);
  for (const [to, list] of Object.entries(beats)) for (const at of list) L.fillEndTake(st, { k: 'b', to: Number(to) }, at);
  for (const at of commits) st.commits.push({ at, url: 'http://127.0.0.1:1/app.html' });
  for (const r of runs) st.runs.push({ at: r.at, id: r.id || '1', script: r.script === undefined ? S : r.script, st: r.st });
  for (const d of done) st.done.push({ at: d.at, script: d.script === undefined ? S : d.script });
  return st;
}
// a boot on the leg's clock: the stop at 1000
const BOOT = { stop: 1000, ask: 1005, nav: 1012, ready: 3710, end: 3800 };
const BEFORE = { to: 10, at: 100 }, BOOTED = { to: 11, at: 1150 };
const beatsOf = (from, to) => { const out = []; for (let t = from; t <= to; t += 500) out.push(t); return out; };

// STEP: coldFillEnd on a virtual clock. plan = { store, events: [{ at, run(store) }], left: what stopWorkers returns,
// ask: what the booted document's ask returns, onAsk(store, now): what the ask sets off }
async function step(L, make, plan, want, boot = { ...BOOT, end: null }) {
  let clock = plan.start == null ? boot.ready : plan.start;
  const store = plan.store; const fired = new Set(); const stops = []; const asks = []; const evals = []; const logs = []; const fails = [];
  const fire = () => { (plan.events || []).forEach((e, i) => { if (!fired.has(i) && clock >= e.at) { fired.add(i); e.run(store, clock); } }); };
  const sleep = async (n) => { clock += n; fire(); };
  const stopWorkers = async () => { stops.push(clock); clock += 120; fire(); return plan.left || []; };
  const T = make(sleep, stopWorkers); // the timed parts on this plan's clock (L: the same text, for the plan's own takes)
  const c = { eval: async (expr) => {
    evals.push(expr); clock += 5; fire();
    if (expr === '1') return 1;
    if (/postMessage\(\{ ob: 'fill'/.test(expr)) { asks.push(clock); if (plan.ask !== undefined && plan.ask !== true) { if (plan.ask instanceof Error) throw plan.ask; return plan.ask; } if (plan.onAsk) plan.onAsk(store, clock, L); return true; }
    return null;
  } };
  const rec = { store, ms: () => clock };
  fire();
  const t0 = clock;
  const got = await T.coldFillEnd(rec, c, {}, { fail: (m) => fails.push(m), log: (m) => logs.push(m), tag: 'leg' }, boot, 'offline outer', want);
  return { got, logs, fails, stops, asks, evals, waited: clock - t0, clock, boot };
}

async function judgeLifted(lifted, files) {
  const red = Object.fromEntries(MECHS.map((m) => [m, []]));
  const never = async () => { throw new Error('a pure part slept'); };
  const L = lifted.make(never, never);
  const WANT = { who: 'the outer registration', version: 'v1', script: S };

  // PINS
  {
    const r = red.PINS;
    if (L.FILL_END_BINDING !== '__obFillEndRec') r.push(`the binding is named ${L.FILL_END_BINDING}`);
    if (L.FILL_END_MS !== 60000) r.push(`FILL_END_MS ${L.FILL_END_MS} (pre-registered 60000)`);
    if (L.FILL_END_DONE_MS !== 10000) r.push(`FILL_END_DONE_MS ${L.FILL_END_DONE_MS} (pre-registered 10000)`);
    if (L.FILL_END_BEAT_MS !== 500) r.push(`FILL_END_BEAT_MS ${L.FILL_END_BEAT_MS} (pre-registered 500)`);
    if (!files.app.includes(`sessionStorage.setItem('${L.FILL_END_MARK}', '1')`)) r.push(`app.html's boot guard does not set '${L.FILL_END_MARK}' to '1'`);
    if (!files.app.includes(`sessionStorage.getItem('${L.FILL_END_MARK}') === '1'`)) r.push(`app.html's boot guard does not read '${L.FILL_END_MARK}'`);
    if (!files.main.includes(`sessionStorage.removeItem('${L.FILL_END_MARK}')`)) r.push(`app/main.js does not clear '${L.FILL_END_MARK}' on a healthy boot`);
    if (!files.app.includes(`/${L.FILL_END_BENIGN}/.test(e.message || '')`)) r.push('the benign-notification text is not the one app.html\'s boot guard tests');
    if (!files.app.includes('if (window.__test || acted) return;')) r.push('app.html\'s boot guard no longer stands down on window.__test (what `up` mirrors)');
    if (!files.app.includes("tgt.hasAttribute('data-optional')")) r.push('app.html\'s boot guard no longer skips data-optional (what `optional` mirrors)');
    if (!files.app.includes("(e.message === 'Script error.' && !e.filename && !e.lineno)")) r.push('app.html\'s boot guard no longer skips the detail-less "Script error." (what `benign` mirrors)');
  }

  // RECORD
  {
    const r = red.RECORD; const B = L.FILL_END_BINDING;
    const run = (p) => { try { vm.runInNewContext(L.FILL_END_REC, p.ctx); return null; } catch (e) { return String(e && e.message); } };
    let p = page(B); let err = run(p);
    if (err) r.push(`the hook threw: ${err}`);
    if (!eq(p.got[0], { k: 'doc', mark: null, path: '/web/app.html?sw=1&u=x', to: 5000 })) r.push(`a healthy document's start push: ${JSON.stringify(p.got[0])}`);
    if (!eq(p.capture(), [true])) r.push(`the error listener is not one capture-phase listener: ${JSON.stringify(p.capture())}`);
    if (p.timers.length !== 1 || p.timers[0].ms !== L.FILL_END_BEAT_MS) r.push(`the beat timer: ${JSON.stringify(p.timers.map((t) => t.ms))}`);
    else { p.timers[0].f(); if (!eq(p.got[p.got.length - 1], { k: 'b', to: 5000 })) r.push(`the beat push: ${JSON.stringify(p.got[p.got.length - 1])}`); }
    const errOf = (ev) => { const q = page(B); run(q); q.error(ev); return q.got.find((x) => x.k === 'err') || null; };
    const elem = (opt) => ({ getAttribute: () => null, hasAttribute: (k) => opt && k === 'data-optional', src: 'http://h/app/x.js' });
    let e = errOf({ message: 'boom', filename: 'http://h/app/y.js', lineno: 3, error: {}, target: {} });
    if (!eq(e, { k: 'err', msg: 'boom', src: 'http://h/app/y.js', optional: false, benign: false, up: false, to: 5000 })) r.push(`a runtime error's push: ${JSON.stringify(e)}`);
    e = errOf({ target: elem(false) });
    if (!e || e.src !== 'http://h/app/x.js' || e.optional || e.benign || e.msg !== '') r.push(`an element load error's push: ${JSON.stringify(e)}`);
    e = errOf({ target: elem(true) });
    if (!e || e.optional !== true) r.push(`an optional element's error is not marked optional: ${JSON.stringify(e)}`);
    e = errOf({ message: 'ResizeObserver loop completed with undelivered notifications.', target: {} });
    if (!e || e.benign !== true) r.push(`the ResizeObserver notification is not marked benign: ${JSON.stringify(e)}`);
    e = errOf({ message: 'ResizeObserver loop limit exceeded', error: {}, target: {} });
    if (!e || e.benign !== false) r.push(`a ResizeObserver text WITH an error object is marked benign: ${JSON.stringify(e)}`);
    e = errOf({ message: 'ResizeObserver loop of another kind', target: {} });
    if (!e || e.benign !== false) r.push(`another ResizeObserver text than the guard's two is marked benign: ${JSON.stringify(e)}`);
    e = errOf({ message: 'Script error.', target: {} });
    if (!e || e.benign !== true) r.push(`the detail-less "Script error." is not marked benign: ${JSON.stringify(e)}`);
    e = errOf({ message: 'Script error.', filename: 'http://h/a.js', target: {} });
    if (!e || e.benign !== false) r.push(`a "Script error." with a file is marked benign: ${JSON.stringify(e)}`);
    p = page(B, { up: true }); run(p); p.error({ message: 'late', target: {} });
    if (!(p.got.find((x) => x.k === 'err') || {}).up) r.push('an error after the app is up is not marked up');
    p = page(B, { mark: '1' }); run(p);
    if (!p.got[0] || p.got[0].mark !== '1') r.push(`a document born of the guard's reload does not push the mark '1': ${JSON.stringify(p.got[0])}`);
    p = page(B, { opaque: true }); err = run(p);
    if (err || !p.got[0] || p.got[0].mark !== 'unreadable') r.push(`an opaque origin: ${err || JSON.stringify(p.got[0])}`);
    p = page(B); run(p);
    p.message({ ob: 'swept', why: 'fill end', version: 'v1', removed: 2, deferred: null });
    p.message({ ob: 'swept', why: 'navigation', version: 'v1', removed: 0, deferred: null });
    p.message({ ob: 'update-waiting' }); p.message(null);
    if (!eq(p.got.filter((x) => x.k !== 'doc'), [{ k: 'fe', version: 'v1', removed: 2, deferred: null, to: 5000 }])) r.push(`the sweeps pushed: ${JSON.stringify(p.got.filter((x) => x.k !== 'doc'))}`);
    p = page(B, { frame: true }); err = run(p); p.error({ message: 'x', target: {} });
    if (err || p.got.length || p.timers.length) r.push(`a frame records (${err || `${p.got.length} pushes, ${p.timers.length} timers`})`);
    p = page(B, { sw: false }); err = run(p);
    if (err || !p.got[0]) r.push(`a page without the worker API: ${err || 'no start push'}`);
    p = page(B, { bound: false }); err = run(p);
    let threw = null; try { p.error({ message: 'early', target: {} }); } catch (x) { threw = String(x && x.message); }
    if (err || threw) r.push(`without a binding the hook threw: ${err || threw}`);
    p.attach(); if (p.timers[0]) p.timers[0].f();
    if (!eq(p.got.map((x) => x.k), ['doc', 'err', 'b'])) r.push(`the pushes queued before the binding attached arrive as ${JSON.stringify(p.got.map((x) => x.k))} (want doc, err, b)`);
  }

  // TAKE
  {
    const r = red.TAKE; const st = L.fillEndStore();
    const ok = [
      L.fillEndTake(st, { k: 'doc', to: 7, mark: '1', path: '/a' }, 40),
      L.fillEndTake(st, { k: 'doc', to: 8, path: '/b' }, 50),
      L.fillEndTake(st, { k: 'fe', to: 7, version: 'v1', removed: 1, deferred: 'x' }, 60),
      L.fillEndTake(st, { k: 'err', to: 7, msg: 'm', src: 's', optional: false, benign: false, up: false }, 70),
      L.fillEndTake(st, { k: 'err', to: 7, msg: 'm', optional: true, benign: false, up: false }, 71),
      L.fillEndTake(st, { k: 'err', to: 7, msg: 'm', optional: false, benign: true, up: false }, 72),
      L.fillEndTake(st, { k: 'err', to: 7, msg: 'm', optional: false, benign: false, up: true }, 73),
      L.fillEndTake(st, { k: 'b', to: 7 }, 80),
    ];
    if (ok.some((x) => x !== true)) r.push(`a usable payload was refused: ${JSON.stringify(ok)}`);
    if (!eq(st.docs, [{ to: 7, at: 40, mark: '1', path: '/a' }, { to: 8, at: 50, mark: null, path: '/b' }])) r.push(`the documents kept: ${JSON.stringify(st.docs)}`);
    if (!eq(st.fes, [{ to: 7, at: 60, version: 'v1', removed: 1, deferred: 'x' }])) r.push(`the fill ends kept: ${JSON.stringify(st.fes)}`);
    if (!eq(st.errs.map((x) => x.acts), [true, false, false, false])) r.push(`which errors the guard acts on: ${JSON.stringify(st.errs.map((x) => x.acts))} (want only the first)`);
    if (!eq(st.beats.get(7), [80])) r.push(`the beats kept: ${JSON.stringify(st.beats.get(7))}`);
    const bad = [L.fillEndTake(st, null, 1), L.fillEndTake(st, { k: 'doc' }, 1), L.fillEndTake(st, { k: 'zz', to: 1 }, 1), L.fillEndTake(st, { k: 'fe', to: 1, version: 'v' }, undefined)];
    if (bad.some((x) => x !== false) || st.bad !== 4) r.push(`unusable payloads: ${JSON.stringify(bad)}, counted ${st.bad} (want four refused and counted)`);
    if (st.fes.length !== 1 || st.docs.length !== 2) r.push('an unusable payload reached the store');
    for (let i = 0; i < 300; i++) L.fillEndTake(st, { k: 'b', to: 9 }, 1000 + i);
    const b9 = st.beats.get(9);
    if (b9.length !== 240 || b9[b9.length - 1] !== 1299) r.push(`the beats of one document: ${b9.length} kept, the last ${b9[b9.length - 1]} (want the newest 240)`);
  }

  // SINCE
  {
    const r = red.SINCE;
    const st = scene(L, { fes: [{ to: 1, version: 'v1', at: 100 }, { to: 2, version: 'v2', at: 250 }, { to: 3, version: 'v1', at: 300 }, { to: 4, version: 'v1', at: 400 }] });
    const a = L.fillEndOf(st, 'v1', 200);
    if (!a || a.at !== 300 || a.to !== 3) r.push(`the first v1 broadcast since 200: ${JSON.stringify(a)} (want the one at 300, whichever document held it)`);
    if (L.fillEndOf(scene(L, { fes: [{ to: 1, version: 'v1', at: 100 }] }), 'v1', 200) !== null) r.push('R1: a broadcast from before `since` (an older worker life) was taken');
    if (L.fillEndOf(scene(L, { fes: [{ to: 2, version: 'v2', at: 250 }] }), 'v1', 200) !== null) r.push('R2: another version\'s broadcast was taken');
    const b = L.fillEndOf(st, 'v1', 300);
    if (!b || b.at !== 300) r.push('a broadcast AT `since` is not taken');
    if (L.fillEndOf(L.fillEndStore(), 'v1', 0) !== null) r.push('an empty store answers a broadcast');
  }

  // BOOT
  {
    const r = red.BOOT;
    const runs = [{ at: 1030, st: 'starting' }, { at: 1041, st: 'running' }];
    // G1: one document, its fill end after the stop
    let st = scene(L, { docs: [BEFORE, BOOTED], commits: [1140], fes: [{ to: 11, version: 'v1', at: 3560 }], runs, done: [{ at: 3547 }], beats: { 10: beatsOf(600, 1100) } });
    let x = L.coldBootRead(st, BOOT, WANT); let line = L.coldBootLine('leg', 'offline outer', BOOT, x);
    if (x.n !== 1 || x.reload !== null || x.held !== 'booted' || x.doc !== 1 || x.worker !== 1030 || x.done !== 3547 || !eq(x.commits, [1140]) || !eq(x.marks, [null])) r.push(`G1 read: ${JSON.stringify(x)}`);
    for (const w of ['[leg] offline outer: cold boot', 'ask 5,', 'navigate 12,', 'worker 30,', 'commit 140,', 'complete 2547,', 'fill end 2560 heard by document 1 of the tab (the booted document)', 'ready 2710;', 'documents 1,', 'errors the guard acts on 0;', 'silent at most 100 ms']) {
      if (!line.includes(w)) r.push(`G1 line lacks "${w}": ${line}`);
    }
    if (L.coldBootReload('leg', 'offline outer', x) !== null) r.push('G1: a one-document boot has a reload line');
    // G2: the fill end held by the document before; the booted one committed later
    const late = { ...BOOT, ready: 4700, end: 4800 };
    st = scene(L, { docs: [BEFORE, { to: 11, at: 4395 }], commits: [4390], fes: [{ to: 10, version: 'v1', at: 1820 }], runs: [{ at: 1004, st: 'starting' }], done: [{ at: 1810 }], beats: { 10: beatsOf(600, 1300) } });
    x = L.coldBootRead(st, late, WANT); line = L.coldBootLine('leg', 'offline outer', late, x);
    if (x.held !== 'before' || x.doc !== 0 || x.n !== 1 || x.reload !== null || x.silence !== 3290) r.push(`G2 read: ${JSON.stringify(x)} (want held before, document 0, one document, silence 3290)`);
    for (const w of ['fill end 820 heard by document 0 of the tab (the document BEFORE the navigation)', 'worker 4,', 'commit 3390,', 'silent at most 3290 ms']) if (!line.includes(w)) r.push(`G2 line lacks "${w}": ${line}`);
    // R4: two documents, the second with the mark, an error in the first
    const two = { docs: [BEFORE, BOOTED, { to: 12, at: 1600, mark: '1' }], commits: [1140, 1590], errs: [{ to: 11, at: 1300, msg: 'boom', src: 'http://h/app/x.js' }], runs };
    st = scene(L, { ...two, fes: [{ to: 12, version: 'v1', at: 3560 }] });
    x = L.coldBootRead(st, BOOT, WANT); let f = L.coldBootReload('leg', 'offline outer', x);
    if (x.n !== 2 || x.reload !== 'guard' || x.held !== 'booted' || !eq(x.marks, [null, '1']) || x.acts.length !== 1) r.push(`R4 read: ${JSON.stringify(x)}`);
    if (!f || !f.includes("the boot took 2 documents: the app's boot guard reloaded it") || !f.includes('"boom" http://h/app/x.js')) r.push(`R4 line: ${f}`);
    // an error with no source URL (a thrown error with no file name) leaves no blank before the bracket
    st = scene(L, { ...two, errs: [{ to: 11, at: 1300, msg: 'boom' }] });
    x = L.coldBootRead(st, BOOT, WANT); f = L.coldBootReload('leg', 'offline outer', x);
    if (!f || !f.includes('the error before the app was up: "boom")')) r.push(`R4 line, an error with no source: ${f}`);
    if (!L.coldBootLine('leg', 'w', BOOT, x).includes('errors the guard acts on 1 ("boom");')) r.push('an error with no source leaves a blank on the boot\'s line');
    st = scene(L, { ...two, fes: [{ to: 11, version: 'v1', at: 1500 }] });
    x = L.coldBootRead(st, BOOT, WANT);
    if (x.held !== 'replaced') r.push(`a fill end heard by the document that was then reloaded reads ${x.held} (want replaced)`);
    if (!L.coldBootLine('leg', 'w', BOOT, x).includes('a document of this boot that was then REPLACED')) r.push('the line does not name the replaced document');
    // R4 with the first document's start push lost: the commits count, the mark names the guard
    st = scene(L, { docs: [BEFORE, { to: 12, at: 1600, mark: '1' }], commits: [1140, 1590] });
    x = L.coldBootRead(st, BOOT, WANT);
    if (x.n !== 2 || x.reload !== 'guard') r.push(`a guard reload whose first document left no start push: n ${x.n}, reload ${x.reload}`);
    // R5: two documents, no mark
    st = scene(L, { docs: [BEFORE, BOOTED, { to: 12, at: 1600 }], commits: [1140, 1590] });
    x = L.coldBootRead(st, BOOT, WANT); f = L.coldBootReload('leg', 'offline outer', x);
    if (x.reload !== 'other' || !f || !f.includes("a reload that is not the boot guard's") || !f.includes('[null,null]')) r.push(`R5: reload ${x.reload}, line ${f}`);
    // a second commit alone (no start push of the second document) is a second document
    st = scene(L, { docs: [BEFORE, BOOTED], commits: [1140, 1590] });
    x = L.coldBootRead(st, BOOT, WANT);
    if (x.n !== 2 || x.reload !== 'other') r.push(`two commits and one start push: n ${x.n}, reload ${x.reload} (want 2, other)`);
    // R6: what the guard ignores makes no error of the line and no reload
    st = scene(L, { docs: [BEFORE, BOOTED], commits: [1140], errs: [{ to: 11, at: 1300, msg: 'late', up: true }, { to: 11, at: 1310, msg: 'kit', optional: true }, { to: 11, at: 1320, msg: 'ro', benign: true }, { to: 10, at: 900, msg: 'old document' }] });
    x = L.coldBootRead(st, BOOT, WANT);
    if (x.acts.length !== 0 || x.reload !== null || !L.coldBootLine('leg', 'w', BOOT, x).includes('errors the guard acts on 0;')) r.push(`R6: ${x.acts.length} acting errors, reload ${x.reload}`);
    st = scene(L, { docs: [BEFORE, BOOTED], commits: [1140], errs: [{ to: 11, at: 1300, msg: 'boom', src: 'u' }] });
    x = L.coldBootRead(st, BOOT, WANT);
    if (x.acts.length !== 1 || x.reload !== null || !L.coldBootLine('leg', 'w', BOOT, x).includes('errors the guard acts on 1 ("boom" u)')) r.push('an acting error in a one-document boot is not on the line');
    // no fill end asked; an older life's broadcast; another registration's worker
    st = scene(L, { docs: [BEFORE, BOOTED], commits: [1140], fes: [{ to: 10, version: 'v1', at: 900 }], runs: [{ at: 1020, st: 'starting', script: S2 }, { at: 1500, st: 'stopped' }, { at: 1600, st: 'running' }], done: [{ at: 1700, script: S2 }, { at: 3547 }] });
    x = L.coldBootRead(st, BOOT, WANT);
    if (x.fe !== null || x.held !== null) r.push('a broadcast from before the stop is read as this boot\'s');
    if (x.worker !== 1600 || x.done !== 3547) r.push(`another registration's worker is read: worker ${x.worker}, complete ${x.done} (want 1600, 3547)`);
    x = L.coldBootRead(scene(L, { docs: [BEFORE, BOOTED], commits: [1140], fes: [{ to: 11, version: 'v1', at: 3000 }] }), BOOT, {});
    if (x.fe !== null || !L.coldBootLine('leg', 'again outer', BOOT, x).includes('fill end -,')) r.push('a boot of which no fill end is asked reads one');
    x = L.coldBootRead(scene(L, { docs: [BEFORE], fes: [{ to: 99, version: 'v1', at: 3000 }] }), BOOT, WANT);
    if (x.held !== 'unknown' || x.n !== 0 || x.silence !== null) r.push(`a broadcast from a document with no start push: held ${x.held}, n ${x.n}, silence ${x.silence}`);
  }

  // STEP
  {
    const r = red.STEP; const mk = lifted.make;
    const base = () => scene(L, { docs: [BEFORE, BOOTED], commits: [1140], beats: { 10: beatsOf(600, 1100) } });
    const hear = (at, to = 11, version = 'v1') => ({ at, run: (st) => L.fillEndTake(st, { k: 'fe', to, version, removed: 0, deferred: null }, at) });
    // heard by a document while the leg waits: taken, no second step
    let o = await step(L, mk, { store: base(), events: [hear(4200)] }, WANT);
    if (!o.got || o.got.at !== 4200 || o.fails.length || o.stops.length || o.asks.length || o.logs.length !== 1) r.push(`a fill end heard while waiting: ${JSON.stringify({ got: o.got, fails: o.fails, stops: o.stops.length, asks: o.asks.length, logs: o.logs.length })}`);
    // heard before the leg came to ask (by the document before): taken at once
    const st2 = scene(L, { docs: [BEFORE, { to: 11, at: 3400 }], commits: [3390], fes: [{ to: 10, version: 'v1', at: 1500 }] });
    o = await step(L, mk, { store: st2 }, WANT);
    if (!o.got || o.got.to !== 10 || o.waited !== 0 || o.fails.length || !o.logs[0].includes('the document BEFORE the navigation')) r.push(`G2 through the leg: ${JSON.stringify({ got: o.got, waited: o.waited, fails: o.fails, log: o.logs[0] })}`);
    // G3: none for 60 s, then the second step is heard
    o = await step(L, mk, { store: base(), onAsk: (st, now) => L.fillEndTake(st, { k: 'fe', to: 11, version: 'v1', removed: 0, deferred: null }, now + 40) }, WANT);
    if (!o.got || o.fails.length || o.stops.length !== 1 || o.asks.length !== 1) r.push(`G3: ${JSON.stringify({ got: o.got, fails: o.fails, stops: o.stops.length, asks: o.asks.length })}`);
    else {
      if (o.stops[0] - o.boot.ready < 60000 || o.stops[0] - o.boot.ready > 60300) r.push(`G3: the second step began ${o.stops[0] - o.boot.ready} ms after the leg came to ask (want the 60 s wait)`);
      if (!(o.stops[0] < o.asks[0])) r.push('G3: the booted document asked before the workers were stopped again');
      if (o.evals.indexOf('1') < 0 || o.evals.indexOf('1') > o.evals.findIndex((e) => /postMessage/.test(e))) r.push('G3: no page round trip between the stop and the ask');
      if (o.logs.length !== 2 || !o.logs[1].includes('second step: the workers stopped again and the booted document asked a fill') || !o.logs[1].includes('by document 1 of the tab')) r.push(`G3 lines: ${JSON.stringify(o.logs)}`);
      if (!o.logs[0].includes('fill end -,')) r.push('G3: the boot\'s line claims a fill end of the first life');
    }
    // the cut: 10 s after the worker's completion line the first wait ends
    const st4 = base(); st4.done.push({ at: 3500, script: S });
    o = await step(L, mk, { store: st4, onAsk: (st, now) => L.fillEndTake(st, { k: 'fe', to: 11, version: 'v1', removed: 0, deferred: null }, now + 40) }, WANT);
    if (!o.got || o.stops.length !== 1 || o.stops[0] < 13500 || o.stops[0] > 13800) r.push(`the cut after the completion line: the second step began at ${o.stops[0]} on the leg's clock (want 10 s after the line at 3500)`);
    const st4b = base(); st4b.done.push({ at: 3500, script: S2 });
    o = await step(L, mk, { store: st4b, onAsk: (st, now) => L.fillEndTake(st, { k: 'fe', to: 11, version: 'v1', removed: 0, deferred: null }, now + 40) }, WANT);
    if (o.stops.length !== 1 || o.stops[0] - o.boot.ready < 60000) r.push('another registration\'s completion line cut the wait');
    // R3: the second step silent too
    o = await step(L, mk, { store: base() }, WANT);
    if (o.got !== null || o.fails.length !== 1 || !o.fails[0].includes("no fill-end {ob:'swept'} from the outer registration's worker (v1)") || !o.fails[0].includes('none after the second step') || o.waited < 120000) r.push(`R3: ${JSON.stringify({ got: o.got, fails: o.fails, waited: o.waited })}`);
    // R1 through the leg: a broadcast from before the stop, and one from before the second stop, are not taken
    const st6 = scene(L, { docs: [BEFORE, BOOTED], commits: [1140], fes: [{ to: 10, version: 'v1', at: 900 }] });
    o = await step(L, mk, { store: st6 }, WANT);
    if (o.got !== null || o.fails.length !== 1 || o.stops.length !== 1) r.push('R1 through the leg: an older life\'s broadcast was taken');
    o = await step(L, mk, { store: base(), onAsk: (st, now) => L.fillEndTake(st, { k: 'fe', to: 11, version: 'v2', removed: 0, deferred: null }, now + 40) }, WANT);
    if (o.got !== null || o.fails.length !== 1) r.push('R2 through the leg: another version\'s broadcast was taken in the second step');
    // the second step that cannot be made
    o = await step(L, mk, { store: base(), left: ['7:running'] }, WANT);
    if (o.got !== null || o.asks.length || o.fails.length !== 1 || !o.fails[0].includes('not made: workers still running: 7:running')) r.push(`workers that would not stop: ${JSON.stringify({ asks: o.asks.length, fails: o.fails })}`);
    o = await step(L, mk, { store: base(), ask: 'no active worker' }, WANT);
    if (o.got !== null || o.fails.length !== 1 || !o.fails[0].includes('not made: no active worker')) r.push(`an ask that was not posted: ${JSON.stringify(o.fails)}`);
    o = await step(L, mk, { store: base(), ask: new Error('ctx gone') }, WANT);
    if (o.got !== null || o.fails.length !== 1 || !o.fails[0].includes('not made: Error: ctx gone')) r.push(`an ask that threw: ${JSON.stringify(o.fails)}`);
    // a second document fails whatever was heard
    const st8 = scene(L, { docs: [BEFORE, BOOTED, { to: 12, at: 1600, mark: '1' }], commits: [1140, 1590], errs: [{ to: 11, at: 1300, msg: 'boom', src: 'u' }], fes: [{ to: 12, version: 'v1', at: 3560 }] });
    o = await step(L, mk, { store: st8 }, WANT);
    if (!o.got || o.fails.length !== 1 || !o.fails[0].includes("the app's boot guard reloaded it") || o.stops.length) r.push(`a healed boot whose fill end was heard: ${JSON.stringify({ got: !!o.got, fails: o.fails, stops: o.stops.length })}`);
    // no fill end asked of this boot: no wait, its line, a reload still fails
    o = await step(L, mk, { store: base() }, null);
    if (o.got !== null || o.waited !== 0 || o.logs.length !== 1 || o.fails.length || o.stops.length) r.push(`a boot of which no fill end is asked: ${JSON.stringify({ waited: o.waited, logs: o.logs.length, fails: o.fails, stops: o.stops.length })}`);
    const st9 = scene(L, { docs: [BEFORE, BOOTED, { to: 12, at: 1600 }], commits: [1140, 1590] });
    o = await step(L, mk, { store: st9 }, null);
    if (o.fails.length !== 1 || !o.fails[0].includes("a reload that is not the boot guard's")) r.push('a reload in a boot of which no fill end is asked does not fail');
  }

  // LEGS
  {
    const r = red.LEGS; const count = (t, s) => t.split(s).length - 1;
    if (files.src.includes('__obFillEnds')) r.push('a document-side list of fill ends (window.__obFillEnds) is still in the file');
    if (/fill(Ended|EndHeard)\(c,/.test(files.src)) r.push('a fill-end read still takes the tab (c) instead of the record');
    for (const [k, t] of Object.entries(lifted.legs)) {
      const recAt = t.indexOf('const rec = await fillEndRecorder(c, ms);'), navAt = t.indexOf("c.send('Page.navigate'");
      if (recAt < 0 || navAt < 0 || recAt > navAt) r.push(`${k}: the recorder is not set up before the first visit`);
      if (count(t, 'rec.watch(b);') !== 1) r.push(`${k}: the browser session is not watched once (${count(t, 'rec.watch(b);')})`);
      if (!t.includes('const { ms, log, failAt } = legClock(say, gateFail);') || !t.includes('const fail = (m) => { failed += 1; failAt(m); };')) r.push(`${k}: the leg's lines do not carry its clock`);
      if (!t.includes('attachBrowserSession(cdp, { log, pump: true })')) r.push(`${k}: the worker console lines are not printed through the leg's log`);
      if (count(t, 'stopWorkers(')) r.push(`${k}: a bare stopWorkers (${count(t, 'stopWorkers(')}); a cold boot goes through coldStop`);
      const n = COLD_SITES[k];
      for (const fn of ['coldStop(rec, ctl, c)', 'coldVisit(rec, c, boot, ', 'coldFillEnd(rec, c, ctl, { fail, log, tag }, boot, ']) if (count(t, fn) !== n) r.push(`${k}: ${count(t, fn)} x ${fn} (want ${n})`);
      let at = 0;
      for (let i = 0; i < n; i++) {
        const a = t.indexOf('coldStop(rec, ctl, c)', at), b = t.indexOf('coldVisit(rec, c, boot, ', a), c2 = t.indexOf('coldFillEnd(rec, c, ctl, ', b);
        if (a < 0 || b < a || c2 < b) { r.push(`${k}: cold boot ${i + 1} is not coldStop, coldVisit, coldFillEnd in that order`); break; }
        const next = t.indexOf('coldStop(rec, ctl, c)', a + 1);
        if (next >= 0 && next < c2) { r.push(`${k}: cold boot ${i + 1} stops again before its line`); break; }
        at = c2 + 1;
      }
    }
    if (count(lifted.legs.swscope, 'fillEnded(rec, fail, tag, ') !== 1) r.push('swscope: B\'s own fill end is not asked once of the record');
    if (!lifted.legs.swscope.includes('const sinceB = ms();') || lifted.legs.swscope.indexOf('const sinceB = ms();') > lifted.legs.swscope.indexOf("url('sb', 'b')")) r.push('swscope: B\'s fill end is not asked from before B\'s first visit');
    for (const k of ['swlegacy', 'swshared', 'swnested']) {
      const t = lifted.legs[k];
      if (count(t, 'fillEndHeard(rec, v, sinceTake, 20000)') !== 1) r.push(`${k}: the tolerant read after the take-over is not one read of the record`);
      if (t.indexOf('const sinceTake = ms();') < 0 || t.indexOf('const sinceTake = ms();') > t.indexOf("postMessage({ ob: 'skip-waiting' })")) r.push(`${k}: the take-over's fill end is not asked from before the take-over message`);
    }
  }
  return red;
}

async function judge(files) {
  try {
    const L = lift(files.src);
    if (L.invalid) return { invalid: [L.invalid], red: {} };
    return { invalid: [], red: await judgeLifted(L, files) };
  } catch (e) { return { invalid: [`threw: ${e && e.message}`], red: {} }; }
}

// file: the leg source unless 'app' / 'main'; also = the collateral a plant turns red by construction; expect
// 'INVALID' = the arm must refuse, never PASS
const PLANTS = [
  { mech: 'SINCE', also: ['BOOT', 'STEP'], name: '`since` ignored (an older worker life passes)', old: 'return store.fes.find((x) => x.version === version && x.at >= since) || null;', new: 'return store.fes.find((x) => x.version === version) || null;' },
  { mech: 'SINCE', also: ['STEP'], name: 'the version test dropped', old: 'return store.fes.find((x) => x.version === version && x.at >= since) || null;', new: 'return store.fes.find((x) => x.at >= since) || null;' },
  { mech: 'BOOT', also: ['STEP'], name: 'the second document not counted', old: '  const n = Math.max(docs.length, commits.length);', new: '  const n = Math.min(1, docs.length);' },
  { mech: 'BOOT', name: 'a second commit alone not counted', old: '  const n = Math.max(docs.length, commits.length);', new: '  const n = docs.length;' },
  { mech: 'BOOT', name: 'the guard named only by the second start push', old: "(docs.some((d) => d.mark === '1') ? 'guard' : 'other')", new: "(docs[1] && docs[1].mark === '1' ? 'guard' : 'other')" },
  { mech: 'BOOT', also: ['STEP'], name: 'a guard reload reported as another reload', old: "(docs.some((d) => d.mark === '1') ? 'guard' : 'other')", new: "'other'" },
  { mech: 'BOOT', also: ['STEP'], name: 'the document before read as the booted one', old: "holder.at < from ? 'before' : ", new: '' },
  { mech: 'BOOT', name: 'every error of the tab on the boot\'s line', old: '  const acts = store.errs.filter((e) => e.acts && ids.has(e.to));', new: '  const acts = store.errs.filter((e) => ids.has(e.to));' },
  { mech: 'BOOT', name: 'any registration\'s worker read as the booting one', old: '(script == null || x.script === script);', new: 'true;' },
  { mech: 'BOOT', name: 'a blank where the reload\'s error has no source', old: 'the error before the app was up: ${JSON.stringify(e.msg)}${e.src ? ` ${e.src}` : \'\'}`', new: 'the error before the app was up: ${JSON.stringify(e.msg)} ${e.src}`' },
  { mech: 'RECORD', name: 'the mark not read at the document\'s start', old: 'try { mark = sessionStorage.getItem(${JSON.stringify(FILL_END_MARK)}); } catch (e) { mark = \'unreadable\'; }', new: '' },
  { mech: 'RECORD', name: 'frames record too', old: '  if (window !== window.top) return;\n  const to = Math.round(performance.timeOrigin);', new: '  const to = Math.round(performance.timeOrigin);' },
  { mech: 'RECORD', name: 'the error listener not in the capture phase', old: '      up: !!window.__test });\n  }, true);', new: '      up: !!window.__test });\n  });' },
  { mech: 'RECORD', name: 'every sweep pushed as a fill end', old: "if (d && d.ob === 'swept' && d.why === 'fill end') push({ k: 'fe'", new: "if (d && d.ob === 'swept') push({ k: 'fe'" },
  { mech: 'RECORD', name: 'the binding called without a check', old: "if (typeof b === 'function') try { while (q.length) b(q.shift()); } catch (e) { /* lab record */ } };", new: 'while (q.length) b(q.shift()); };' },
  { mech: 'RECORD', name: 'a push made before the binding attached is dropped', old: "  const push = (o) => { o.to = to; q.push(JSON.stringify(o)); if (q.length > 40) q.shift();\n", new: "  const push = (o) => { o.to = to; q.length = 0; q.push(JSON.stringify(o));\n" },
  { mech: 'RECORD', name: 'no beat', old: "  setInterval(() => push({ k: 'b' }), ${FILL_END_BEAT_MS});\n", new: '' },
  { mech: 'RECORD', name: 'a ResizeObserver text with an error object marked benign', old: 'benign: !!(e && !e.error && (', new: 'benign: !!(e && (' },
  { mech: 'TAKE', also: ['BOOT'], name: 'an error after the app is up counted as one the guard acts on', old: 'acts: !msg.optional && !msg.benign && !msg.up });', new: 'acts: !msg.optional && !msg.benign });' },
  { mech: 'TAKE', name: 'an unusable payload kept', old: "  if (!msg || typeof msg.to !== 'number' || typeof at !== 'number') { store.bad += 1; return false; }", new: "  if (!msg) { store.bad += 1; return false; }" },
  { mech: 'TAKE', name: 'the beats uncapped', old: 'if (b.length > 240) b.shift();', new: '' },
  { mech: 'STEP', name: 'the second step taken without a stop', old: "  const left = await stopWorkers(ctl, c);\n  await c.eval('1').catch(() => {});\n  const since = rec.ms();", new: "  const left = [];\n  await c.eval('1').catch(() => {});\n  const since = rec.ms();" },
  { mech: 'STEP', name: 'no page round trip before the second step\'s clock', old: "  const left = await stopWorkers(ctl, c);\n  await c.eval('1').catch(() => {});\n  const since = rec.ms();", new: '  const left = await stopWorkers(ctl, c);\n  const since = rec.ms();' },
  { mech: 'STEP', name: 'a silent second step passes', old: '  else fail(`[${tag}] no fill-end {ob:\'swept\'} from ${want.who}\'s worker', new: '  else log(`[${tag}] no fill-end {ob:\'swept\'} from ${want.who}\'s worker' },
  { mech: 'STEP', name: 'a second document does not fail', old: '  if (reload) fail(reload);\n', new: '' },
  { mech: 'STEP', name: 'the second step asked although workers still run', old: "  const posted = left.length ? `workers still running: ${left.join(', ')}`\n    : await c.eval(", new: '  const posted = await c.eval(' },
  { mech: 'STEP', name: 'no cut after the completion line', old: 'return d != null && rec.ms() - d >= FILL_END_DONE_MS; });', new: 'return false; });' },
  { mech: 'STEP', name: 'any worker\'s completion line cuts the wait', old: 'rec.store.done.find((x) => x.at >= boot.stop && x.script === want.script);', new: 'rec.store.done.find((x) => x.at >= boot.stop);' },
  { mech: 'PINS', also: ['STEP'], name: 'the wait shortened', old: 'const FILL_END_MS = 60000;', new: 'const FILL_END_MS = 6000;' },
  { mech: 'PINS', also: ['STEP'], name: 'the cut shortened', old: 'const FILL_END_DONE_MS = 10000;', new: 'const FILL_END_DONE_MS = 1000;' },
  { mech: 'PINS', name: 'the beat slowed', old: 'const FILL_END_BEAT_MS = 500;', new: 'const FILL_END_BEAT_MS = 5000;' },
  { mech: 'PINS', name: 'the binding renamed', old: "const FILL_END_BINDING = '__obFillEndRec';", new: "const FILL_END_BINDING = '__obFillEndRec2';" },
  { mech: 'PINS', also: ['RECORD'], name: 'another mark than the boot guard\'s', old: "const FILL_END_MARK = 'ob-bootfix-attempted';", new: "const FILL_END_MARK = 'ob-bootfix';" },
  { mech: 'PINS', file: 'app', name: 'app.html\'s boot guard renames its mark', apply: (s) => s.split("'ob-bootfix-attempted'").join("'ob-bootfix-tried'") },
  { mech: 'PINS', file: 'main', name: 'main.js no longer clears the mark', old: "sessionStorage.removeItem('ob-bootfix-attempted')", new: "sessionStorage.removeItem('ob-bootfix-other')" },
  { mech: 'PINS', also: ['RECORD'], name: 'another benign text than the boot guard\'s', old: "const FILL_END_BENIGN = '^ResizeObserver loop (completed with undelivered notifications|limit exceeded)';", new: "const FILL_END_BENIGN = '^ResizeObserver loop';" },
  { mech: 'LEGS', name: 'a leg stops its workers outside coldStop', old: '      const boot = await coldStop(rec, ctl, c);\n      if (boot.left.length) { fail(`[${tag}] INVALID: workers still running before the ${step} ${s} boot: ${boot.left.join(\', \')}`); return; }', new: '      const boot = await coldStop(rec, ctl, c); await stopWorkers(ctl, c);\n      if (boot.left.length) { fail(`[${tag}] INVALID: workers still running before the ${step} ${s} boot: ${boot.left.join(\', \')}`); return; }' },
  { mech: 'LEGS', name: 'a cold boot without its line', old: "    await coldFillEnd(rec, c, ctl, { fail, log, tag }, boot, 'offline', booted ? { who: 'the new version', version: v, script: `http://127.0.0.1:${PORT2}/sw.js` } : null);\n", new: '' },
  { mech: 'LEGS', name: 'a leg\'s fail lines without its clock', old: "  const tag = 'swshared-desktop';\n  const { ms, log, failAt } = legClock(say, gateFail); // #1416: every line of the leg ends in its clock\n  let failed = 0;\n  const fail = (m) => { failed += 1; failAt(m); };", new: "  const tag = 'swshared-desktop';\n  const { ms, log, failAt } = legClock(say, gateFail); // #1416: every line of the leg ends in its clock\n  let failed = 0;\n  const fail = (m) => { failed += 1; gateFail(m); };" },
  { mech: 'LEGS', name: 'the take-over\'s fill end asked from the leg\'s start', old: '    const fe = await fillEndHeard(rec, v, sinceTake, 20000);\n', new: '    const fe = await fillEndHeard(rec, v, 0, 20000);\n' },
  { mech: 'LEGS', name: 'B\'s fill end asked from after B\'s first visit', old: "    const sinceB = ms(); // B's fill end is asked from here on\n    await c.send('Page.navigate', { url: url('sb', 'b') });", new: "    await c.send('Page.navigate', { url: url('sb', 'b') });\n    const sinceB = ms(); // B's fill end is asked from here on" },
  { expect: 'INVALID', name: 'the constants\' end marker renamed', old: "\n/** one leg's store: ", new: "\n/** a leg's store: " },
];

let verdictPrinted = false;
const verdict = (line, code) => { verdictPrinted = true; console.log(line); process.exit(code); };
process.on('beforeExit', () => { if (!verdictPrinted) { verdictPrinted = true; console.log('[swfillend] INVALID: no verdict'); process.exitCode = 2; } });

const args = process.argv.slice(2);
const srcPath = path.resolve(args.includes('--src') ? args[args.indexOf('--src') + 1] : SRC_DEFAULT);
const files = {
  src: fs.readFileSync(srcPath, 'utf8'),
  app: fs.readFileSync(path.join(WEB, 'app.html'), 'utf8'),
  main: fs.readFileSync(path.join(WEB, 'app', 'main.js'), 'utf8'),
};
if (!args.includes('--selftest')) {
  const { invalid, red } = await judge(files);
  if (invalid.length) verdict(`[swfillend] verdict INVALID: ${invalid.join('; ')}`, 2);
  for (const m of MECHS) console.log(`[swfillend] ${red[m].length ? 'FAIL' : 'ok'} ${m}${red[m].length ? `: ${red[m].join('; ')}` : ''}`);
  const reds = MECHS.filter((m) => red[m].length);
  if (reds.length) verdict(`[swfillend] verdict FAIL — ${reds.join(', ')}`, 1);
  verdict(`[swfillend] verdict PASS — ${MECHS.length} mechanisms (${MECHS.join(', ')})`, 0);
}
const base = await judge(files);
if (base.invalid.length || MECHS.some((m) => base.red[m].length)) verdict(`[swfillend selftest] the tree is not green: ${JSON.stringify(base)}`, 2);
let bad = 0;
for (const p of PLANTS) {
  const key = p.file || 'src';
  let planted = null;
  if (p.apply) planted = p.apply(files[key]);
  else if (files[key].split(p.old).length - 1 === 1) planted = files[key].replace(p.old, () => p.new);
  if (planted == null || planted === files[key]) { console.log(`[swfillend selftest] INVALID plant "${p.name}": its anchor is not found exactly once in ${key}`); bad++; continue; }
  const r = await judge({ ...files, [key]: planted });
  const hit = MECHS.filter((m) => r.red[m] && r.red[m].length);
  const want = p.expect === 'INVALID' ? [] : [p.mech, ...(p.also || [])].sort();
  const ok = p.expect === 'INVALID' ? r.invalid.length > 0 : !r.invalid.length && JSON.stringify([...hit].sort()) === JSON.stringify(want);
  console.log(`[swfillend selftest] ${ok ? 'caught' : 'MISSED'} plant "${p.name}" -> ${p.expect === 'INVALID' ? `INVALID ${JSON.stringify(r.invalid)}` : `red ${JSON.stringify(hit)}`}${p.expect !== 'INVALID' && r.invalid.length ? ` invalid ${JSON.stringify(r.invalid)}` : ''}`);
  if (!ok) bad++;
}
verdict(bad ? `[swfillend selftest] FAIL (${bad})` : `[swfillend selftest] OK: ${PLANTS.length} plants each caught on its own mechanism (collateral declared)`, bad ? 1 : 0);
