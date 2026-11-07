// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-swforced.mjs — #1167 item 2 / #1173: the forced take-over leg's pure
// parts, judged in Node (no browser). The leg itself (legSwForced in
// e2e-userboot-3g-sw.mjs) runs nightly behind its entry gate; this arm runs per
// PR and slices from the leg's source text (never an import: the leg module
// pulls in the browser tools):
//   ANCHORS   web/sw.js carries the lab anchor `const ALL_HREFS` exactly once,
//             and `const VERSION` once, before it (the A block reads VERSION
//             at the anchor while the worker script runs)
//   LABBYTES  forcedLabBytes over the real web/sw.js: A gains the A-only block
//             right before ALL_HREFS and compiles; no activate listener in A,
//             even when a delay is asked; B is A's bytes with the block
//             stripped, compiles, and carries the activate delay only when
//             asked; a missing or doubled anchor is INVALID for A and for B
//   HOLD      the A block run in a stub worker scope: the start loop only while
//             a worker waits, and only in A; a navigation (even one carrying the
//             token), a request without the token, or B never arms the hold; a
//             non-navigation request with the token arms it once; the next
//             navigation releases it; a 20 s cap releases it otherwise
//   CLASSIFY  classifyForced over record scenarios: REPAIRED; NEEDS-CTL, then
//             SILENT-SWAP (the stale page's controller answers B) or INVALID
//             (it does not); INVALID (no A document after the press; a
//             controllerchange in it; a stale page without a controller); FAIL
//             (the next document not B's or not controlled; a repair pair not
//             A>B; a third document; the repair over its bound from the
//             swapped document's response)
//   SETTLE    legSwForced's own text after B's 'activated' (sliced verbatim)
//             on a virtual clock, fed the binding events a scripted tab pushes
//             (rev 5: no record read is an eval): a healthy run is REPAIRED with
//             no FAIL and no record eval; a third main-phase document (at once,
//             3 s or 15 s after the repair's response) is a FAIL; a silent swap
//             is RED; a repair after the settle's cut is a FAIL over its bound,
//             never a SILENT-SWAP; a failed controller read is a named INVALID;
//             a loop page is RED; a slow app-loop commit and a busy boot leave
//             the repair its full window; a third navigation in flight at the
//             watch's end is recorded and FAILs; a dropped pagehide push is
//             recovered by the next document's re-emit, and a FAIL (fail closed)
//             when nothing re-emits it; a stale re-emitted copy never replaces
//             a newer one; a document over the DOMContentLoaded bound, one that
//             never reaches it, a freeze over the silence bound and a pressing
//             page frozen at the press end as a HANG (a 14 s freeze does not);
//             a commit that never comes ends as a STALL
//   PRESS     legSwForced's press wait (sliced verbatim): the press needs A's
//             restart seen after the forcing fetch, or A already up; a restart
//             that never comes is a named INVALID within its 10 s bound
//   RECORD    the new-document hook (FORCED_DOC_RECORD) and FORCED_READ over
//             stub page globals: one key per document (interleaved saves keep
//             every record), the id read when the root element appears, the
//             response time, controllerchange flagged, the repair pair and the
//             controller kept at pagehide, no record from a frame; the read
//             sorted by timeOrigin, foreign and malformed keys skipped; rev 5:
//             each stored save pushed through the binding with a count that
//             only rises, every stored record re-emitted at a document's start
//             and DOMContentLoaded, its DOMContentLoaded and pagehide stamped, a
//             1 s beat; no push and no throw without a binding (the swupdate
//             leg), nothing from a document whose record cannot be stored
//   BIND      forcedTake: a higher count replaces a document's copy, a lower
//             one never does; beats kept in order (600 at most); an unusable
//             payload refused
//   HANG      forcedHangCheck: DOMContentLoaded over FORCED_DCL_MS after the
//             commit, or not reached that long after it, is a HANG; a beat gap
//             over FORCED_SILENCE_MS from max(the press, DOMContentLoaded) to
//             the pagehide (or now, for the live document) is a HANG, a 14 s one
//             is not; a busy boot before DOMContentLoaded, a navigation between
//             documents, documents gone before the press and the time after the
//             leg's own about:blank close are no silence
//   PINS      the pre-registered values (FORCED_REPAIR_MS 20 s, FORCED_ACTIVATE_MS
//             60 s, FORCED_HOLD_MS 1.5 s, FORCED_FILL_MS 300 s, FORCED_LOOP_WATCH_MS
//             20 s, FORCED_LOOP_CLOSE 6; rev 5: FORCED_DCL_MS 20 s,
//             FORCED_SILENCE_MS 15 s, FORCED_BEAT_MS 1 s, the binding's name) and
//             the repair key shared with app/swupdate.js
//   POSTPRESS legSwForced after the press: no SW_PROBE, CacheStorage,
//             registration or raw Runtime.evaluate read, every eval through the
//             bounded, recorded ev(); the tab opened without SW_OBSERVER (its
//             registration poll), which newSwPage gates on its option; rev 5:
//             no FORCED_READ after the press (the records come from the binding)
//   DUMP      #1173 rev 5: forcedStallDump over a scripted state (times from
//             the press, the CDP quiet time at the timeout, the workers after
//             the press, the records, the binding's store and commits); the
//             leg's STALL / HANG catch prints it before its FAIL; a HANG leaves
//             the dump at its phase (the settle, the late watch) with the
//             records seen before it
//
//   node web/tools/test-swforced.mjs [--src <e2e-userboot-3g-sw.mjs>]
//   node web/tools/test-swforced.mjs --selftest
// Exit 0 PASS, 1 FAIL, 2 INVALID.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(HERE, '..');
const SRC_DEFAULT = path.join(HERE, 'e2e-userboot-3g-sw.mjs');
const MECHS = ['ANCHORS', 'LABBYTES', 'HOLD', 'CLASSIFY', 'SETTLE', 'PRESS', 'RECORD', 'BIND', 'HANG', 'PINS', 'POSTPRESS', 'DUMP'];
const BEGIN = '/* SWFORCED-A-BEGIN */', END = '/* SWFORCED-A-END */';

function lift(src) {
  const constAt = src.indexOf('const FORCED_HOLD_MS');
  const constEnd = constAt < 0 ? -1 : src.indexOf('\n/** the lab bytes', constAt);
  const labAt = src.indexOf('export function forcedLabBytes(');
  const clsAt = src.indexOf('export function classifyForced(');
  const dumpAt = src.indexOf('export function forcedStallDump(');
  const takeAt = src.indexOf('export function forcedTake('), docsAt = src.indexOf('export function forcedDocs('), hangAt = src.indexOf('export function forcedHangCheck(');
  const legAt = src.indexOf('export async function legSwForced(');
  if (constAt < 0 || constEnd < 0 || labAt < 0 || clsAt < 0 || dumpAt < 0 || takeAt < 0 || docsAt < 0 || hangAt < 0 || legAt < 0) {
    return { invalid: 'FORCED_HOLD_MS (up to "/** the lab bytes"), forcedLabBytes, classifyForced, forcedStallDump, forcedTake, forcedDocs, forcedHangCheck or legSwForced not found' };
  }
  const end = (at) => { const e = src.indexOf('\n}\n', at); return e < 0 ? -1 : e + 2; };
  const lEnd = end(labAt), cEnd = end(clsAt), dEnd = end(dumpAt), tEnd = end(takeAt), oEnd = end(docsAt), hEnd = end(hangAt), gEnd = end(legAt);
  if ([lEnd, cEnd, dEnd, tEnd, oEnd, hEnd, gEnd].some((e) => e < 0)) return { invalid: 'a lifted function has no closing brace line' };
  const consts = src.slice(constAt, constEnd);
  if (!/const FORCED_DOC_RECORD = `/.test(consts) || !/const FORCED_READ = `/.test(consts)) return { invalid: 'FORCED_DOC_RECORD / FORCED_READ not found in the constants' };
  const fns = [[labAt, lEnd], [clsAt, cEnd], [dumpAt, dEnd], [takeAt, tEnd], [docsAt, oEnd], [hangAt, hEnd]].map(([a, e]) => src.slice(a, e).replace('export function', 'function'));
  const body = `${consts}\n${fns.join('\n')}`;
  // eslint-disable-next-line no-new-func
  const make = new Function(`"use strict";\n${body}\nreturn { forcedLabBytes, classifyForced, forcedStallDump, forcedTake, forcedDocs, forcedHangCheck, FORCED_DOC_RECORD, FORCED_READ,
    FORCED_DOC_KEY, FORCED_REPAIR_KEY, FORCED_HOLD_MS, FORCED_HOLD_TOKEN, FORCED_REPAIR_MS, FORCED_ACTIVATE_MS, FORCED_ALL_HREFS, FORCED_FILL_MS, FORCED_LOOP_WATCH_MS,
    FORCED_LOOP_CLOSE, FORCED_BINDING, FORCED_DCL_MS, FORCED_SILENCE_MS, FORCED_BEAT_MS };`);
  const leg = src.slice(legAt, gEnd);
  // the leg's text after B's 'activated': the settle, the verdict, the late-document watch, the loop control
  const sA = leg.indexOf('    // the records come from the binding'), sB = leg.indexOf('    const largest = evals.reduce');
  if (sA < 0 || sB < sA) return { invalid: 'legSwForced\'s settle slice ("// the records come from the binding" .. "const largest = evals.reduce") not found' };
  // the press wait: from the forcing fetch's clock to the press
  const pA = leg.indexOf('    const tKick = Date.now();'), pB = leg.indexOf('    const pressAt = Date.now();');
  if (pA < 0 || pB < pA) return { invalid: 'legSwForced\'s press slice ("const tKick" .. "const pressAt") not found' };
  return { ...make(), leg, settle: leg.slice(sA, sB), press: leg.slice(pA, pB) };
}

// a Web Storage stand-in: the items are its own enumerable keys (Object.keys reads them), the methods are not
function storage() {
  const st = {};
  Object.defineProperties(st, {
    getItem: { value: (k) => (Object.prototype.hasOwnProperty.call(st, k) ? st[k] : null) },
    setItem: { value: (k, v) => { st[k] = String(v); } },
    removeItem: { value: (k) => { delete st[k]; } },
  });
  return st;
}

// a stub page for the record hook: sessionStorage, the controller, events, the root element appearing later; rev 5: an
// optional binding (under its name), a page clock (tick advances it), the beat timer, an opaque origin (any
// sessionStorage access throws, as on about:blank)
function page(st, { idAttr = 'aaaaaaaaaaaa', rootNow = false, timeOrigin = 1000, frame = false, binding = null, bindingName = null, opaque = false } = {}) {
  const ev = {}; const sw = { controller: {}, ls: [], addEventListener: (k, f) => { if (k === 'controllerchange') sw.ls.push(f); } };
  let root = rootNow ? { getAttribute: (k) => (k === 'data-ob-html' ? idAttr : null) } : null; const mos = []; const intervals = []; let clock = 0;
  const ctx = {
    navigator: { serviceWorker: sw },
    performance: { timeOrigin, now: () => clock, getEntriesByType: () => [{ responseStart: 42 }] },
    document: { get documentElement() { return root; }, visibilityState: 'visible' },
    MutationObserver: class { constructor(f) { this.f = f; mos.push(this); } observe() {} disconnect() { this.off = true; } },
    addEventListener: (k, f) => { (ev[k] = ev[k] || []).push(f); },
    setInterval: (f, ms) => { intervals.push({ f, ms }); return intervals.length; },
  };
  Object.defineProperty(ctx, 'sessionStorage', { get() { if (opaque) throw new Error('SecurityError: opaque origin'); return st; } });
  if (binding) ctx[bindingName] = binding;
  ctx.window = ctx; ctx.top = frame ? {} : ctx;
  return { ctx, intervals, tick: (ms) => { clock += ms; }, fire: (k) => (ev[k] || []).forEach((f) => f()), change: () => sw.ls.forEach((f) => f()),
    appear: () => { root = { getAttribute: (k) => (k === 'data-ob-html' ? idAttr : null) }; mos.forEach((m) => { if (!m.off) m.f(); }); } };
}

const flush = () => new Promise((r) => setImmediate(r));

// the A block in a stub worker scope: VERSION, a waiting worker or none, a stub clock (each read advances 100 ms),
// the fetch listeners and timers it registers
function workerScope(block, { version = 'v1', waiting = true } = {}) {
  const s = { clock: 0, fetch: [], timers: [], err: null };
  const ctx = {
    VERSION: version, URL, Date: { now: () => (s.clock += 100) },
    setTimeout: (f, ms) => { s.timers.push({ f, ms }); return s.timers.length; },
    self: { registration: { waiting: waiting ? {} : null }, addEventListener: (k, f) => { if (k === 'fetch') s.fetch.push(f); } },
  };
  try { vm.runInNewContext(block, ctx); } catch (e) { s.err = String(e && e.message); }
  // one fetch event: returns the promise the listeners held it with, or null
  s.hit = (url, mode) => { const e = { request: { url, mode }, held: null, waitUntil(p) { this.held = p; } }; s.fetch.forEach((f) => f(e)); return e.held; };
  return s;
}

// SETTLE: the leg's slice after B's 'activated' on a virtual clock (each eval 5 ms, each sleep advances it), fed the
// binding events a scripted tab pushes (rev 5). A scripted document has `to` (its timeOrigin: its navigation starts
// there), visibleAt (its commit: the CDP commit event and its first push) and readyAt (its DOMContentLoaded; default =
// its commit); the next document's commit is its pagehide (or the leg's own about:blank close). At each look the harness
// replays, in time order, through the leg's own forcedTake: each document's pushes (its start, its DOMContentLoaded, its
// pagehide), every later document's re-emits of the stored copies (at that document's start and DOMContentLoaded), and
// its beats (1 s from its commit, or from its DOMContentLoaded when it boots busy; none inside a freeze, none after its
// pagehide). A scenario may drop a document's pagehide push or every re-emit of it, deliver a stale re-emitted copy
// after the newer one, deliver a document's own pushes and beats `lag` ms late (Infinity: never; its CDP commit is not
// late), keep a document from DOMContentLoaded, freeze one, fail the controller read, or hang the app-loop commit (the
// leg's own 60 s timer then fires).
class SettleStall extends Error {}
class SettleHang extends Error {}
const SETTLE_NAMES = ['ev', 'Stall', 'Hang', 'diag', 'evals', 'classifyForced', 'forcedHangCheck', 'forcedDocs', 'store', 'commits', 'contexts', 'idA', 'idB',
  'pressAt', 'FORCED_ACTIVATE_MS', 'FORCED_REPAIR_MS', 'FORCED_LOOP_WATCH_MS', 'FORCED_LOOP_CLOSE', 'sleep', 'Date', 'c', 'PORT2', 'tag', 'fail', 'at',
  'bDone', 'bAct', 'setupMs', 'fillWaitMs', 'activateDelayMs', 'restartMs', 'navSettled', 'setTimeout', 'clearTimeout', 'dump'];
const SA = 'aaaaaaaaaaaa', SB = 'bbbbbbbbbbbb', SLOOP = 'bbbbbbbbbbb0', SP = 1000000, S_STALL = 20000;
// run an async thunk with a real-time guard: a wait that never ends is a result ('HUNG'), never a stuck arm
async function guarded(thunk, ms = 3000) {
  let t; const guard = new Promise((res) => { t = setTimeout(() => res({ hung: true }), ms); });
  try { return await Promise.race([thunk().then((o) => ({ o }), (e) => ({ e })), guard]); } finally { clearTimeout(t); }
}
async function settleRun(L, sc) {
  let clock = SP + 13300, loopAt = null, navStart = null, blankAt = null; // the slice starts at B's 'activated' (press + 13.3 s)
  const fails = [], evals = [], timers = [];
  const store = { recs: new Map(), beats: new Map(), ctxTo: new Map(), recByCtx: new Map(), dclByCtx: new Map(), beatsCut: new Set(), phDirect: new Set() }; const commits = []; const contexts = [];
  const dump = { pressAt: SP, where: "B's activate", boot: null, lastGood: null, cdp: { n: 0, lastAt: null, last: null }, page: [], store, commits, contexts };
  // each scripted document has its own main-world context (id = 100 + its index by commit)
  const all = () => sc.records(loopAt, navStart).map((d) => ({ readyAt: d.visibleAt, ...d })).sort((a, b) => a.visibleAt - b.visibleAt).map((d, i) => ({ ...d, ctx: 100 + i }));
  // the store and the commits as the tab would have pushed them by the clock
  const feed = () => {
    const docs = all().filter((d) => d.visibleAt <= clock);
    const endOf = (i) => (i + 1 < docs.length ? docs[i + 1].visibleAt : (blankAt != null && blankAt >= docs[i].visibleAt ? blankAt : Infinity));
    const version = (d, t, end, first = false) => { // d's stored record at time t (first: the hook's first save)
      const r = { to: d.to, id: d.id, cc: !!d.cc, ctl: null, pair: null, rs: null, n: 1, dcl: null, ph: null };
      if (first) return r;
      if (!d.noDcl && t >= d.readyAt && d.readyAt < end) Object.assign(r, { rs: d.rs, ctl: d.ctl, dcl: d.readyAt, n: 2 });
      if (t >= end) Object.assign(r, { rs: d.rs, ctl: d.ctl, pair: d.pair, ph: end, n: 3 });
      return r;
    };
    const out = [];
    docs.forEach((d, i) => {
      const end = endOf(i), lag = d.lag || 0, own = { ctx: d.ctx };
      out.push({ t: d.visibleAt + lag, msg: { rec: version(d, d.visibleAt, end, true), tr: 'start' }, meta: own });
      if (!d.noDcl && d.readyAt < end) out.push({ t: d.readyAt + lag, msg: { rec: version(d, d.readyAt, end), tr: 'dcl' }, meta: own });
      if (end !== Infinity && !d.dropPagehide) out.push({ t: end + lag, msg: { rec: version(d, end, end), tr: 'ph' }, meta: own });
      for (const t0 of [d.visibleAt, ...(!d.noDcl && d.readyAt < end ? [d.readyAt] : [])]) {
        docs.slice(0, i).forEach((e, k) => {
          if (e.dropReemits) return;
          // a stale re-emit: the previous document's copy from before its pagehide, arriving after the newer copy
          const stale = sc.staleReemit && k === i - 1 && t0 === d.visibleAt;
          out.push({ t: t0 + lag + (stale ? 1 : 0), msg: { rec: version(e, stale ? endOf(k) - 1 : t0, endOf(k)), tr: 're' }, meta: own });
        });
      }
      // beats every 1 s (from DOMContentLoaded when the page boots busy) and one at DOMContentLoaded, each with the
      // page's DOMContentLoaded stamp once it has one
      const dOf = (x) => (!d.noDcl && d.readyAt < end && x >= d.readyAt ? d.readyAt : null);
      const beatAt = (x) => { if (!(d.freeze && x >= d.freeze[0] && x < d.freeze[1])) out.push({ t: x + lag, msg: { beat: d.to, t: x, d: dOf(x) }, meta: own }); };
      for (let x = d.busy ? d.readyAt : d.visibleAt; x < end && x <= clock; x += 1000) beatAt(x);
      if (!d.noDcl && d.readyAt < end && d.readyAt <= clock) beatAt(d.readyAt);
    });
    for (const m of [store.recs, store.beats, store.ctxTo, store.recByCtx, store.dclByCtx, store.beatsCut, store.phDirect]) m.clear();
    for (const x of out.filter((y) => y.t <= clock).sort((a, b) => a.t - b.t)) L.forcedTake(store, x.msg, x.meta);
    // CDP's view (never late): each commit with its loader's DOMContentLoaded, each document's context and its end
    commits.length = 0; contexts.length = 0;
    docs.forEach((d, i) => {
      const end = endOf(i);
      commits.push({ t: d.visibleAt, url: 'http://127.0.0.1/app.html', loaderId: `L${d.ctx}`, dcl: !d.noDcl && d.readyAt < end && d.readyAt <= clock ? d.readyAt : null, dcl2: null });
      contexts.push({ id: d.ctx, t: d.visibleAt, end: end !== Infinity && end <= clock ? end : null });
    });
    if (blankAt != null && blankAt <= clock) { commits.push({ t: blankAt, url: 'about:blank', loaderId: 'Lblank', dcl: blankAt, dcl2: null }); contexts.push({ id: 999, t: blankAt, end: null }); }
    commits.sort((a, b) => a.t - b.t);
  };
  const ev = async (expr, step) => {
    const t0 = clock; clock += 5;
    try {
      if (/^fetch\(new URL\('app\.html'/.test(expr)) {
        clock += sc.ctlDelay || 0;
        if (sc.ctl instanceof Error) throw sc.ctl;
        return `<!doctype html>\n<html lang="en" data-ob-html="${sc.ctl}">\n`;
      }
      throw new Error(`the settle slice ran an unexpected eval: ${expr.slice(0, 60)}`);
    } finally { evals.push(`${step}@${t0 - SP}+${clock - t0}`); }
  };
  const navSettled = async () => {
    const flying = all().filter((d) => d.to <= clock && clock < d.visibleAt);
    if (flying.length) clock = Math.min(Math.max(...flying.map((d) => d.visibleAt)), clock + S_STALL);
  };
  const c = { send: async (m, p) => {
    if (m === 'Page.navigate' && /app-loop/.test(p.url)) {
      navStart = clock;
      if (sc.navHang) { setImmediate(() => timers.forEach((t) => { if (!t.cleared) t.f(); })); return new Promise(() => {}); }
      clock += sc.navMs || 0; loopAt = clock;
    } else if (m === 'Page.navigate' && /^about:/.test(p.url)) blankAt = clock;
  } };
  // a virtual sleep yields one macrotask turn: a wait that never ends cannot starve the real-time guard
  const vsleep = async (ms) => { clock += ms; await new Promise((r) => setImmediate(r)); };
  const vSetTimeout = (f, ms) => { const t = { f, ms, cleared: false }; timers.push(t); return t; };
  const vClearTimeout = (t) => { if (t) t.cleared = true; };
  const hangCheck = (s, o) => { feed(); return L.forcedHangCheck(s, o); };
  // eslint-disable-next-line no-new-func
  const fn = new Function(...SETTLE_NAMES, `"use strict";\nreturn (async () => {\n${L.settle}\nreturn { cls: r.cls, why: r.why, loop: result.loop };\n})();`);
  const out = await guarded(() => fn(ev, SettleStall, SettleHang, [], evals, L.classifyForced, hangCheck, L.forcedDocs, store, commits, contexts, SA, SB,
    SP, L.FORCED_ACTIVATE_MS, L.FORCED_REPAIR_MS, L.FORCED_LOOP_WATCH_MS, L.FORCED_LOOP_CLOSE, vsleep, { now: () => clock }, c, 1, 'swforced',
    (m) => fails.push(m), (t, from) => (t == null || from == null ? null : t - from), { t: SP + 13290 }, { t: SP + 10500 }, 9000, 600, 0, 40,
    navSettled, vSetTimeout, vClearTimeout, dump));
  if (out.hung) return { cls: 'HUNG', fails, evals, dump };
  if (out.e) {
    if (out.e instanceof SettleStall) return { cls: 'STALL', why: out.e.message, fails, evals, dump };
    if (out.e instanceof SettleHang) return { cls: 'HANG', why: out.e.message, fails, evals, dump };
    throw out.e;
  }
  return { ...out.o, fails, evals, dump };
}
function settleScenarios(L) {
  const R = L.FORCED_REPAIR_MS;
  const doc = (to, id, x = {}) => ({ to, id, cc: false, ctl: true, pair: null, rs: 300, visibleAt: to + 5, ...x });
  // the app-loop documents: the first starts at the navigation (its timeOrigin), commits at the commit and boots bootMs
  // (busy: no beat before its DOMContentLoaded); each next one starts 100 ms after the previous one's DOMContentLoaded
  // (verifyGeneration's reload) and commits 300 ms later
  const loopDocs = (n, bootMs = 0) => (la, ns) => {
    if (la == null) return [];
    const out = []; let start = ns, commit = la;
    for (let i = 0; i < n; i++) {
      const d = doc(start + 10, SLOOP, { visibleAt: commit, readyAt: commit + bootMs, busy: bootMs > 0, pair: i < n - 1 ? `${SLOOP}>${SB}` : null });
      out.push(d); start = d.readyAt + 100; commit = start + 300;
    }
    return out;
  };
  // a main-phase document survives the leg's own app-loop navigation only if it committed before that navigation began
  const main = (ns, docs) => docs.filter((d) => ns == null || d.visibleAt <= ns);
  // doc0 = the pressing page (before the press), doc1 = the swap (the belt, +10.2 s, its response 0.3 s later), doc2 = the repair
  const doc0 = doc(SP - 100000, SA, { rs: 100 }), doc1 = doc(SP + 10200, SA, { pair: `${SA}>${SB}` }), doc2 = doc(SP + 10700, SB, { rs: 2600 });
  const resp2 = doc2.to + doc2.rs, resp1 = doc1.to + doc1.rs, watchEnd = resp2 + R + 2000;
  const healthy = (la, ns) => [doc0, doc1, doc2, ...loopDocs(2)(la, ns)];
  const with2 = (x) => (la, ns) => [doc0, doc1, { ...doc2, ...x }, ...loopDocs(2)(la, ns)];
  const third = (d3) => (la, ns) => [...main(ns, [doc0, doc1, doc2, d3]), ...loopDocs(2)(la, ns)];
  const FAIL3 = { cls: 'FAIL', fail: /3 documents after the press/ };
  // the store ends with the swapped document's pagehide copy (count 3, its stamp, the repair pair)
  const pagehideKept = (s) => { const r = s.recs.get(doc1.to); return !!r && r.n === 3 && r.ph != null && r.pair === `${SA}>${SB}`; };
  return [
    ['healthy', { records: healthy }, { cls: 'REPAIRED', fail: null }],
    ['a third document at once (commits 1 s after the repair\'s DOMContentLoaded)', { records: third(doc(SP + 13250, SB, { rs: 200, visibleAt: SP + 13308 })) }, FAIL3],
    ['a third document 3 s after the repair\'s response', { records: third(doc(resp2 + 3000, SB, { rs: 200 })) }, FAIL3],
    ['a third document 15 s after the repair\'s response', { records: third(doc(resp2 + 15000, SB, { rs: 200 })) }, FAIL3],
    ['a third navigation in flight at the watch\'s end (commits 3.5 s later)', { records: third(doc(watchEnd - 500, SB, { rs: 200, visibleAt: watchEnd + 3000 })) }, FAIL3],
    ['a third document committed at the watch\'s end whose first push arrives 2 s after its commit', { records: third(doc(watchEnd - 500, SB, { rs: 200, visibleAt: watchEnd + 100, lag: 2000 })) }, FAIL3],
    ['a silent swap', { ctl: SB, records: () => [doc0, doc(SP + 10200, SA)] }, { cls: 'SILENT-SWAP', fail: /silent swap/ }],
    ['a stale page under A', { ctl: SA, records: () => [doc0, doc(SP + 10200, SA)] }, { cls: 'INVALID', fail: /controller answers id/ }],
    ['a repair after the settle\'s cut', { ctl: SB, ctlDelay: 3000, records: (la, ns) => [...main(ns, [doc0, doc(SP + 10200, SA, { pair: `${SA}>${SB}` }), doc(resp1 + R + 3500, SB, { rs: 200 })]), ...loopDocs(2)(la, ns)] }, { cls: 'FAIL', fail: /after the swapped document's response \(bound/ }],
    ['the controller read fails', { ctl: new Error('Execution context was destroyed.'), records: () => [doc0, doc(SP + 10200, SA)] }, { cls: 'INVALID', fail: /controller read failed/ }],
    ['the loop page reloads on', { records: (la, ns) => [doc0, doc1, doc2, ...loopDocs(8)(la, ns)] }, { cls: 'REPAIRED', fail: /loop: \d+ documents/ }],
    ['a slow app-loop commit (20.5 s)', { navMs: 20500, records: healthy }, { cls: 'REPAIRED', fail: null }],
    ['a busy app-loop boot (8 s per document)', { records: (la, ns) => [doc0, doc1, doc2, ...loopDocs(2, 8000)(la, ns)] }, { cls: 'REPAIRED', fail: null }],
    ['the repair document reaches DOMContentLoaded 3 s after its commit', { records: with2({ readyAt: doc2.visibleAt + 3000 }) }, { cls: 'REPAIRED', fail: null }],
    ['the swapped document\'s pagehide push is dropped; the repair document re-emits its stored copy', { records: (la, ns) => [doc0, { ...doc1, dropPagehide: true }, doc2, ...loopDocs(2)(la, ns)] }, { cls: 'REPAIRED', fail: null, store: pagehideKept }],
    ['a dropped pagehide push that no document re-emits (fail closed)', { records: (la, ns) => [doc0, { ...doc1, dropPagehide: true, dropReemits: true }, doc2, ...loopDocs(2)(la, ns)] }, { cls: 'FAIL', fail: /repair pair/ }],
    ['a stale re-emitted copy arrives after the newer one', { staleReemit: true, records: healthy }, { cls: 'REPAIRED', fail: null, store: pagehideKept }],
    ['the repair document reaches DOMContentLoaded 21 s after its commit', { records: with2({ readyAt: doc2.visibleAt + 21000, busy: true }) }, { cls: 'HANG', fail: null, why: /DOMContentLoaded/ }],
    ['the repair document never reaches DOMContentLoaded', { records: with2({ noDcl: true }) }, { cls: 'HANG', fail: null, why: /has not reached DOMContentLoaded/ }],
    ['the repair document freezes 16 s after its DOMContentLoaded', { records: with2({ freeze: [doc2.visibleAt + 2000, doc2.visibleAt + 18000] }) }, { cls: 'HANG', fail: null, why: /silent/ }],
    ['a 14 s freeze after DOMContentLoaded', { records: with2({ freeze: [doc2.visibleAt + 2000, doc2.visibleAt + 16000] }) }, { cls: 'REPAIRED', fail: null }],
    ['the pressing page freezes at the press and no document follows', { records: () => [{ ...doc0, freeze: [SP, Infinity] }] }, { cls: 'HANG', fail: null, why: /the live document/ }],
    ['the app-loop commit never comes', { navHang: true, records: healthy }, { cls: 'STALL', fail: null }],
    // review P2 on cd4fce09: a third app-loop document commits near the watch's end and its pushes arrive 3 s late (2.3 s
    // into the settle that starts at the watch's end, +20 s: its last look counts the document, and the loop has 3)
    ['a third app-loop document commits at the watch\'s end, its pushes 3 s late', { records: (la, ns) => [doc0, doc1, doc2, ...loopDocs(2)(la, ns),
      ...(la == null ? [] : [doc(la + 19200, SLOOP, { visibleAt: la + 19300, lag: 3000 })])] }, { cls: 'REPAIRED', fail: /loop: 3 documents/ }],
    // the same document whose pushes never arrive: still unaccounted at the settle's last look
    ['a third app-loop document commits at the watch\'s end and none of its pushes arrive', { records: (la, ns) => [doc0, doc1, doc2, ...loopDocs(2)(la, ns),
      ...(la == null ? [] : [doc(la + 19200, SLOOP, { visibleAt: la + 19300, lag: Infinity })])] }, { cls: 'REPAIRED', fail: /an unaccounted document after the loop watch/ }],
    // review P2 on 9ab5caf3: the loop's one repair reload commits at the watch's end and its record arrives 2.5 s into the
    // settle, during its last wait (a valid run)
    ['the app-loop repair reload commits at the watch\'s end, its record arriving 2.5 s into the settle', { records: (la, ns) => [doc0, doc1, doc2,
      ...(la == null ? [] : [doc(ns + 10, SLOOP, { visibleAt: la, pair: `${SLOOP}>${SB}` }), doc(la + 19000, SLOOP, { visibleAt: la + 19300, lag: 3200 })])] }, { cls: 'REPAIRED', fail: null }],
    // review P2 on cd4fce09: the repair navigation starts 20 ms after the swap's commit (inside the old 50 ms slack)
    ['the repair navigation starts 20 ms after the swap\'s commit', { records: (la, ns) => [doc0, doc1, { ...doc2, to: doc1.visibleAt + 20, visibleAt: doc1.visibleAt + 500 }, ...loopDocs(2)(la, ns)] }, { cls: 'REPAIRED', fail: null }],
  ];
}
// PRESS: the press wait (sliced verbatim, from "const tKick" up to "const pressAt") on a virtual clock; the scenario's
// worker events join `runs` as the clock passes them
async function pressRun(L, sc) {
  let clock = 0;
  const fails = [];
  const runs = [{ t: -400, id: 'A', st: 'stopped', status: 'activated' }, ...(sc.before || [])];
  const pending = [...(sc.events || [])];
  const sleep = async (ms) => { clock += ms; while (pending.length && pending[0].t <= clock) runs.push(pending.shift()); await new Promise((r) => setImmediate(r)); };
  const latest = (pred) => { for (let i = runs.length - 1; i >= 0; i--) if (pred(runs[i])) return runs[i]; return null; };
  // eslint-disable-next-line no-new-func
  const fn = new Function('t2', 'latest', 'aV', 'sleep', 'Date', 'fail', 'tag', 'FORCED_HOLD_TOKEN',
    `"use strict";\nreturn (async () => {\n${L.press}\nreturn { aUp, restartMs };\n})();`);
  const out = await guarded(() => fn({ eval: async () => true }, latest, { id: 'A' }, sleep, { now: () => clock }, (m) => fails.push(m), 'swforced', L.FORCED_HOLD_TOKEN));
  if (out.hung) return { hung: true, fails };
  if (out.e) throw out.e;
  return { ...(out.o || { returned: true }), fails };
}

async function judgeLifted(L, { src, sw, swupdate }) {
  const red = Object.fromEntries(MECHS.map((m) => [m, []]));
  const count = (s, needle) => s.split(needle).length - 1;
  // ANCHORS (the real web/sw.js)
  const nH = count(sw, L.FORCED_ALL_HREFS);
  if (nH !== 1) red.ANCHORS.push(`${JSON.stringify(L.FORCED_ALL_HREFS)} appears ${nH} times in web/sw.js (the forced recipe needs exactly one)`);
  const vers = sw.match(/^const VERSION = '[^']+';$/gm) || [];
  if (vers.length !== 1) red.ANCHORS.push(`const VERSION appears ${vers.length} times in web/sw.js (want one)`);
  else if (nH === 1 && sw.indexOf(vers[0]) > sw.indexOf(L.FORCED_ALL_HREFS)) red.ANCHORS.push('const VERSION comes after const ALL_HREFS in web/sw.js (the A block reads VERSION there)');
  // LABBYTES (the real web/sw.js)
  {
    const acts = (s) => count(s, "addEventListener('activate'");
    const compiles = (s) => { try { new vm.Script(s); return null; } catch (e) { return String(e && e.message); } };
    const a = L.forcedLabBytes(sw, 'A');
    if (a.invalid) red.LABBYTES.push(`A over web/sw.js: ${a.invalid}`);
    else {
      if (count(a.sw, BEGIN) !== 1 || count(a.sw, `${END}\n${L.FORCED_ALL_HREFS}`) !== 1) red.LABBYTES.push('A: the A-only block is not right before ALL_HREFS');
      const ca = compiles(a.sw); if (ca) red.LABBYTES.push(`A does not compile: ${ca}`);
      const ad = L.forcedLabBytes(sw, 'A', { activateDelayMs: 15000 });
      if (ad.invalid || acts(ad.sw) !== acts(sw)) red.LABBYTES.push('A carries an activate listener of its own when a delay is asked (the delay is B\'s only)');
      const b = L.forcedLabBytes(a.sw, 'B');
      if (b.invalid) red.LABBYTES.push(`B: ${b.invalid}`);
      else {
        if (/SWFORCED-A-BEGIN|SWFORCED-A-END|__forcedRel/.test(b.sw)) red.LABBYTES.push('B still carries the A-only block');
        if (acts(b.sw) !== acts(sw)) red.LABBYTES.push('B carries an activate delay nobody asked for');
        const cb = compiles(b.sw); if (cb) red.LABBYTES.push(`B does not compile: ${cb}`);
      }
      const bd = L.forcedLabBytes(a.sw, 'B', { activateDelayMs: 15000 });
      if (bd.invalid || acts(bd.sw) !== acts(sw) + 1 || !/setTimeout\(r, 15000\)/.test(bd.sw) || compiles(bd.sw)) red.LABBYTES.push('B: the asked activate delay is missing, doubled or does not compile');
    }
    for (const [what, s] of [['no ALL_HREFS', sw.split(L.FORCED_ALL_HREFS).join('const X_HREFS')], ['a doubled ALL_HREFS', `${sw}\n// ${L.FORCED_ALL_HREFS}\n`]]) {
      for (const gen of ['A', 'B']) if (!L.forcedLabBytes(s, gen).invalid) red.LABBYTES.push(`${what} (${gen}): not INVALID`);
    }
  }
  // HOLD (the A block alone, over a minimal worker)
  {
    const a = L.forcedLabBytes(`const VERSION = 'v1';\n${L.FORCED_ALL_HREFS} = [];\n`, 'A');
    const b0 = a.sw ? a.sw.indexOf(BEGIN) : -1, b1 = a.sw ? a.sw.indexOf(END) : -1;
    if (!(b0 >= 0 && b1 > b0)) red.HOLD.push(`no A-only block to run (${a.invalid || 'markers missing'})`);
    else {
      const block = a.sw.slice(b0, b1 + END.length);
      const T = L.FORCED_HOLD_TOKEN, H = 'http://127.0.0.1:1';
      const sW = workerScope(block, { waiting: true }), sN = workerScope(block, { waiting: false }), sB = workerScope(block, { version: 'v1-b' });
      for (const [k, s] of [['A with a waiting worker', sW], ['A alone', sN], ['B', sB]]) if (s.err) red.HOLD.push(`the A block threw in ${k}: ${s.err}`);
      if (!(sW.clock >= 1500)) red.HOLD.push(`no start loop of 1500 ms while a worker waits (stub clock ${sW.clock})`);
      if (sN.clock !== 0) red.HOLD.push('the start loop ran with no waiting worker');
      if (sB.clock !== 0) red.HOLD.push('the start loop ran in B');
      if (sN.hit(`${H}/app.html?sw=1`, 'navigate')) red.HOLD.push('a navigation armed the hold');
      if (sN.hit(`${H}/app.html?${T}`, 'navigate')) red.HOLD.push('a navigation carrying the token armed the hold');
      if (sN.hit(`${H}/manifest.webmanifest`, 'cors')) red.HOLD.push('a request without the token armed the hold');
      const held = sN.hit(`${H}/manifest.webmanifest?${T}`, 'cors');
      if (!held || typeof held.then !== 'function') red.HOLD.push('the non-navigation token request did not arm the hold');
      else {
        let done = false; held.then(() => { done = true; });
        if (sN.timers.length !== 1 || sN.timers[0].ms !== 20000) red.HOLD.push(`the hold is not capped at 20 s (timers ${JSON.stringify(sN.timers.map((t) => t.ms))})`);
        if (sN.hit(`${H}/manifest.webmanifest?${T}`, 'cors')) red.HOLD.push('a second token request armed again');
        await flush();
        if (done) red.HOLD.push('the hold released before any navigation');
        sN.hit(`${H}/app.html?sw=1-belt`, 'navigate'); await flush();
        if (!done) red.HOLD.push('the next navigation did not release the hold');
      }
      const sC = workerScope(block, { waiting: false });
      const heldC = sC.hit(`${H}/manifest.webmanifest?${T}`, 'cors');
      if (heldC && sC.timers.length) {
        let doneC = false; heldC.then(() => { doneC = true; }); sC.timers[0].f(); await flush();
        if (!doneC) red.HOLD.push('the cap did not release the hold');
      }
      if (workerScope(block, { version: 'v1-b', waiting: false }).hit(`${H}/manifest.webmanifest?${T}`, 'cors')) red.HOLD.push('B armed the hold');
    }
  }
  // CLASSIFY
  {
    const A = 'aaaaaaaaaaaa', B = 'bbbbbbbbbbbb', P = 10000, AB = `${A}>${B}`;
    const d = (to, id, x = {}) => ({ to, id, cc: false, ctl: true, pair: null, rs: 100, ...x });
    const cases = [
      ['repaired', [d(9000, A), d(P + 10, A, { pair: AB }), d(P + 500, B)], {}, 'REPAIRED'],
      ['a single A document before the controller read', [d(P + 10, A)], {}, 'NEEDS-CTL'],
      ['silent swap (the stale page\'s controller answers B)', [d(P + 10, A)], { ctlId: B }, 'SILENT-SWAP'],
      ['a stale page under A (no swap)', [d(P + 10, A)], { ctlId: A }, 'INVALID'],
      ['a stale page whose controller answers no id', [d(P + 10, A)], { ctlId: null }, 'INVALID'],
      ['a stale page without a controller (its fetch reaches B\'s app.html on the network)', [d(P + 10, A, { ctl: false })], { ctlId: B }, 'INVALID'],
      ['a stale page that never recorded its controller', [d(P + 10, A, { ctl: null })], {}, 'INVALID'],
      ['take-over before the belt', [d(P + 10, B)], {}, 'INVALID'],
      ['double reload', [d(P + 10, A, { cc: true }), d(P + 400, B)], {}, 'INVALID'],
      ['no document', [d(9000, A)], {}, 'INVALID'],
      ['next not B', [d(P + 10, A, { pair: AB }), d(P + 500, A)], {}, 'FAIL'],
      ['an uncontrolled repair document', [d(P + 10, A, { pair: AB }), d(P + 500, B, { ctl: false })], {}, 'FAIL'],
      ['a repair document that never reached DOMContentLoaded (ctl unknown)', [d(P + 10, A, { pair: AB }), d(P + 500, B, { ctl: null })], {}, 'FAIL'],
      ['pair not A>B', [d(P + 10, A, { pair: null }), d(P + 500, B)], {}, 'FAIL'],
      ['a third document', [d(P + 10, A, { pair: AB }), d(P + 500, B), d(P + 900, B)], {}, 'FAIL'],
      ['over the bound from the response', [d(P + 10, A, { pair: AB }), d(P + 10 + 100 + L.FORCED_REPAIR_MS + 1, B)], {}, 'FAIL'],
      ['a slow answer, a prompt repair (over the bound from the start, inside it from the response)', [d(P + 10, A, { pair: AB, rs: 18000 }), d(P + 10 + 21000, B)], {}, 'REPAIRED'],
      ['no response time on the swapped document', [d(P + 10, A, { pair: AB, rs: null }), d(P + 500, B)], {}, 'FAIL'],
    ];
    for (const [what, docs, x, want] of cases) {
      const r = L.classifyForced(docs, { idA: A, idB: B, pressAt: P, ...x });
      if (r.cls !== want) red.CLASSIFY.push(`${what}: ${r.cls} (want ${want})`);
    }
  }
  // SETTLE
  for (const [what, sc, want] of settleScenarios(L)) {
    let out;
    try { out = await settleRun(L, sc); } catch (e) {
      if (e instanceof ReferenceError) throw new Error(`the settle slice uses a name this arm does not provide (${e.message}): add it to SETTLE_NAMES`);
      red.SETTLE.push(`${what}: threw ${String(e && e.message).slice(0, 120)}`); continue;
    }
    if (out.cls !== want.cls) red.SETTLE.push(`${what}: ${out.cls} (want ${want.cls}; fails ${JSON.stringify(out.fails).slice(0, 160)}; why ${JSON.stringify(out.why || null).slice(0, 120)})`);
    else if (want.fail === null && out.fails.length) red.SETTLE.push(`${what}: FAIL lines ${JSON.stringify(out.fails).slice(0, 160)} (want none)`);
    else if (want.fail && !out.fails.some((f) => want.fail.test(f))) red.SETTLE.push(`${what}: no FAIL line matching ${want.fail} (got ${JSON.stringify(out.fails).slice(0, 160)})`);
    else if (want.why && !want.why.test(out.why || '')) red.SETTLE.push(`${what}: the HANG names ${JSON.stringify(out.why)} (want ${want.why})`);
    else if (want.store && !want.store(out.dump.store)) red.SETTLE.push(`${what}: the store kept ${JSON.stringify(out.dump.store.recs.get(SP + 10200) || null)} for the swapped document (want its pagehide copy)`);
    else if (out.evals.some((e) => /record read/.test(e))) red.SETTLE.push(`${what}: a record read by eval (${out.evals.filter((e) => /record read/.test(e)).slice(0, 2)})`);
  }
  // PRESS
  for (const [what, sc, want] of [
    ['A restarts 30 ms after the forcing fetch', { events: [{ t: 30, id: 'A', st: 'starting', status: 'activated' }] }, { restartMs: 30 }],
    ['A already up before the forcing fetch', { before: [{ t: -10, id: 'A', st: 'running', status: 'activated' }] }, { restartMs: -10 }],
    ['A never restarts', {}, { invalid: /did not restart A within 10 s/ }],
  ]) {
    let out;
    try { out = await pressRun(L, sc); } catch (e) {
      if (e instanceof ReferenceError) throw new Error(`the press slice uses a name this arm does not provide (${e.message})`);
      red.PRESS.push(`${what}: threw ${String(e && e.message).slice(0, 120)}`); continue;
    }
    if (out.hung) { red.PRESS.push(`${what}: the press wait never ended`); continue; }
    if (want.invalid) { if (!out.returned || !out.fails.some((f) => want.invalid.test(f))) red.PRESS.push(`${what}: pressed anyway (want a named INVALID; ${JSON.stringify(out).slice(0, 160)})`); }
    else if (out.returned || out.fails.length || out.restartMs !== want.restartMs) red.PRESS.push(`${what}: ${JSON.stringify(out).slice(0, 160)} (want the press after restartMs ${want.restartMs})`);
  }
  // RECORD
  {
    const st = storage(), K = L.FORCED_DOC_KEY;
    const run = (pg, what) => { try { vm.runInNewContext(L.FORCED_DOC_RECORD, pg.ctx); } catch (e) { red.RECORD.push(`the hook threw (${what}): ${String(e && e.message).slice(0, 100)}`); } };
    const p1 = page(st, { timeOrigin: 1000 }); run(p1, 'no binding');
    const p2 = page(st, { timeOrigin: 2000, idAttr: 'bbbbbbbbbbbb', rootNow: true }); run(p2, 'no binding');
    // interleaved: the first document's root appears and it loads after the second one started
    try { p1.appear(); p1.fire('DOMContentLoaded'); p2.change(); p2.fire('DOMContentLoaded');
      st.setItem(L.FORCED_REPAIR_KEY, 'aaaaaaaaaaaa>bbbbbbbbbbbb'); p1.fire('pagehide'); } catch (e) { red.RECORD.push(`the hook's listeners threw: ${String(e && e.message).slice(0, 100)}`); }
    const keys0 = Object.keys(st).length;
    const fr = page(st, { timeOrigin: 3000, frame: true }); run(fr, 'a frame');
    try { fr.appear(); fr.fire('DOMContentLoaded'); fr.fire('pagehide'); } catch (e) { red.RECORD.push(`a frame's listeners threw: ${String(e && e.message).slice(0, 100)}`); }
    if (Object.keys(st).length !== keys0) red.RECORD.push('a frame wrote a record (only the top document records)');
    st.setItem(`${K}500`, JSON.stringify({ to: 500, id: 'cccccccccccc' })); st.setItem(`${K}x`, '{'); st.setItem('unrelated', '1');
    let recs = null;
    try { recs = vm.runInNewContext(L.FORCED_READ, { sessionStorage: st }); } catch (e) { red.RECORD.push(`FORCED_READ threw: ${e && e.message}`); }
    if (recs) {
      const tos = Array.from(recs, (r) => r && r.to);
      if (JSON.stringify(tos) !== '[500,1000,2000]') red.RECORD.push(`the read gave timeOrigins ${JSON.stringify(tos)} (want [500,1000,2000]: one record per document, sorted, foreign and malformed keys skipped)`);
      else {
        const [, r1, r2] = recs;
        if (r1.id !== 'aaaaaaaaaaaa') red.RECORD.push(`the late root's id was not read (${JSON.stringify(r1.id)})`);
        if (r2.id !== 'bbbbbbbbbbbb') red.RECORD.push(`the present root's id was not read (${JSON.stringify(r2.id)})`);
        if (r1.rs !== 42 || r2.rs !== 42) red.RECORD.push(`response times ${r1.rs} / ${r2.rs} (want 42 / 42)`);
        if (r1.pair !== 'aaaaaaaaaaaa>bbbbbbbbbbbb' || r1.ctl !== true) red.RECORD.push(`pagehide did not keep the pair / controller: ${JSON.stringify(r1)}`);
        if (r2.ctl !== true || r2.pair !== null) red.RECORD.push(`the second record: ${JSON.stringify(r2)} (want controlled, no pair)`);
        if (r1.cc !== false || r2.cc !== true) red.RECORD.push(`controllerchange flags ${r1.cc} / ${r2.cc} (want false / true)`);
      }
    }
    // rev 5: the binding path (the records above ran without a binding: the swupdate leg's case)
    try { p1.intervals.forEach((i) => i.f()); } catch (e) { red.RECORD.push(`a beat tick without a binding threw: ${e && e.message}`); }
    const st2 = storage(); const pushes = []; const bind = (s) => { pushes.push(JSON.parse(s)); };
    const B = { binding: bind, bindingName: L.FORCED_BINDING };
    const q1 = page(st2, { timeOrigin: 5000, rootNow: true, ...B }); run(q1, 'a binding');
    const own = () => pushes.filter((x) => x.rec && x.rec.to === 5000 && x.tr !== 're');
    if (!own().length) red.RECORD.push('no record pushed at the document start');
    else if (own()[0].tr !== 'start' || own()[0].rec.b !== 'function') red.RECORD.push(`the first push: ${JSON.stringify(own()[0])} (want tr 'start' and b 'function': the binding seen at the hook's start)`);
    if (!pushes.some((x) => x.beat === 5000 && x.t === 5000)) red.RECORD.push('no beat at the document start (page clock)');
    if (q1.intervals.length !== 1 || q1.intervals[0].ms !== L.FORCED_BEAT_MS) red.RECORD.push(`the beat timer: ${JSON.stringify(q1.intervals.map((i) => i.ms))} (want one at ${L.FORCED_BEAT_MS} ms)`);
    else { const n0 = pushes.length; q1.tick(1000); q1.intervals[0].f(); if (!pushes.slice(n0).some((x) => x.beat === 5000 && x.t === 6000)) red.RECORD.push('the timer\'s beat is not stamped on the page clock'); }
    q1.tick(500); try { q1.fire('DOMContentLoaded'); } catch (e) { red.RECORD.push(`DOMContentLoaded threw: ${String(e && e.message).slice(0, 100)}`); }
    const dclRec = own().pop();
    if (!pushes.some((x) => x.beat === 5000 && x.t === 6500 && x.d === 6500)) red.RECORD.push('no beat at DOMContentLoaded carrying its stamp (d)');
    if (!dclRec || dclRec.tr !== 'dcl' || dclRec.rec.dcl !== 6500 || dclRec.rec.rs !== 42 || dclRec.rec.ctl !== true || dclRec.rec.vis !== 'visible') red.RECORD.push(`the DOMContentLoaded push: ${JSON.stringify(dclRec)} (want tr 'dcl', dcl 6500 on the page clock, rs 42, controlled, vis 'visible')`);
    st2.setItem(L.FORCED_REPAIR_KEY, 'aaaaaaaaaaaa>bbbbbbbbbbbb'); q1.tick(100); try { q1.fire('pagehide'); } catch (e) { red.RECORD.push(`pagehide threw: ${String(e && e.message).slice(0, 100)}`); }
    const phRec = own().pop();
    if (!phRec || phRec.tr !== 'ph' || phRec.rec.ph !== 6600 || phRec.rec.pair !== 'aaaaaaaaaaaa>bbbbbbbbbbbb') red.RECORD.push(`the pagehide push: ${JSON.stringify(phRec)} (want tr 'ph', ph 6600, the pair)`);
    const ns = own().map((x) => x.rec.n);
    if (ns.some((n, i) => i && n < ns[i - 1]) || new Set(ns).size < 3) red.RECORD.push(`the counts ${JSON.stringify(ns)} do not rise with the saves`);
    // the next document of the tab re-emits the stored copies at its start and at its DOMContentLoaded
    const k0 = pushes.length;
    const q2 = page(st2, { timeOrigin: 7000, idAttr: 'bbbbbbbbbbbb', rootNow: true, ...B }); run(q2, 'the next document');
    const re1 = pushes.slice(k0).filter((x) => x.rec && x.rec.to === 5000);
    if (!re1.length || re1[0].rec.ph !== 6600 || re1.some((x) => x.tr !== 're')) red.RECORD.push(`the next document's start did not re-emit the stored pagehide copy as a re-emit (${JSON.stringify(re1[0] || null)})`);
    const k1 = pushes.length; try { q2.fire('DOMContentLoaded'); } catch (e) { red.RECORD.push(`the next document's DOMContentLoaded threw: ${String(e && e.message).slice(0, 100)}`); }
    if (!pushes.slice(k1).some((x) => x.rec && x.rec.to === 5000)) red.RECORD.push('the next document\'s DOMContentLoaded did not re-emit the stored copies');
    // no binding: stored, nothing pushed, no timer, no throw
    const st3 = storage(); const q3 = page(st3, { timeOrigin: 9000, rootNow: true });
    try { vm.runInNewContext(L.FORCED_DOC_RECORD, q3.ctx); q3.fire('DOMContentLoaded'); q3.fire('pagehide'); } catch (e) { red.RECORD.push(`without a binding the hook threw: ${e && e.message}`); }
    if (!Object.keys(st3).some((k) => k.startsWith(K))) red.RECORD.push('without a binding the record was not stored');
    try { q3.intervals.forEach((i) => i.f()); } catch (e) { red.RECORD.push(`a beat tick without a binding threw: ${e && e.message}`); }
    // a binding that attaches after the hook ran still receives the later saves
    const k3 = pushes.length; const q5 = page(storage(), { timeOrigin: 13000, rootNow: true }); run(q5, 'a late binding');
    q5.ctx[L.FORCED_BINDING] = bind; try { q5.fire('DOMContentLoaded'); } catch (e) { red.RECORD.push(`a late binding: DOMContentLoaded threw: ${e && e.message}`); }
    if (!pushes.slice(k3).some((x) => x.rec && x.rec.to === 13000 && x.rec.dcl != null)) red.RECORD.push('a binding that attaches after the hook ran receives nothing (the hook captured it once)');
    else if (pushes.slice(k3).find((x) => x.rec && x.rec.to === 13000).rec.b !== 'undefined') red.RECORD.push('a binding that attached late: the record does not say the hook ran without it (b)');
    // an opaque origin (the leg's about:blank close): no record pushed, no beat, no throw
    const k2 = pushes.length; const q4 = page(storage(), { timeOrigin: 11000, rootNow: true, opaque: true, ...B });
    try { vm.runInNewContext(L.FORCED_DOC_RECORD, q4.ctx); q4.fire('DOMContentLoaded'); q4.intervals.forEach((i) => i.f()); } catch (e) { red.RECORD.push(`an opaque origin made the hook throw: ${e && e.message}`); }
    if (pushes.slice(k2).some((x) => (x.rec && x.rec.to === 11000) || x.beat === 11000)) red.RECORD.push('a document whose record cannot be stored pushed a record or a beat');
  }
  // BIND
  {
    const S = () => ({ recs: new Map(), beats: new Map(), ctxTo: new Map(), recByCtx: new Map(), dclByCtx: new Map(), beatsCut: new Set(), phDirect: new Set() });
    const s = S();
    const r = (n, tr, x = {}) => ({ rec: { to: 100, id: 'a', n, ...x }, tr });
    if (L.forcedTake(s, r(1, 'start'), { ctx: 7 }) !== true) red.BIND.push('a record payload was refused');
    if (s.ctxTo.get(7) !== 100 || (s.recByCtx.get(7) || {}).n !== 1) red.BIND.push('a document\'s own push did not tie its context to its record');
    L.forcedTake(s, r(2, 'dcl', { dcl: 5 }), { ctx: 7 }); L.forcedTake(s, r(1, 're'), { ctx: 8 });
    if ((s.recs.get(100) || {}).n !== 2) red.BIND.push(`a lower count replaced the copy (n ${(s.recs.get(100) || {}).n}, want 2)`);
    if (s.ctxTo.has(8) || s.recByCtx.has(8)) red.BIND.push('a re-emit tied the re-emitting document\'s context to another document\'s record');
    if (s.dclByCtx.get(7) !== 5) red.BIND.push(`the context's DOMContentLoaded stamp from its own record: ${s.dclByCtx.get(7)} (want 5)`);
    L.forcedTake(s, r(3, 'ph', { ph: 9, pair: 'a>b' }), { ctx: 7 });
    if ((s.recs.get(100) || {}).n !== 3 || s.recs.get(100).pair !== 'a>b') red.BIND.push(`a higher count (the pagehide copy) did not replace the copy (${JSON.stringify(s.recs.get(100))})`);
    if (!s.phDirect.has(100)) red.BIND.push('a pagehide copy that arrived directly was not counted');
    const s2 = S(); L.forcedTake(s2, r(3, 're', { ph: 9 }), { ctx: 8 });
    if (s2.phDirect.size) red.BIND.push('a re-emitted pagehide copy was counted as direct');
    // two documents sharing a time origin keep their own records (by context)
    const s3 = S(); L.forcedTake(s3, r(5, 'dcl', { id: 'A', dcl: 50 }), { ctx: 1 }); L.forcedTake(s3, r(1, 'start', { id: 'B' }), { ctx: 2 });
    if ((s3.recByCtx.get(2) || {}).id !== 'B' || s3.dclByCtx.has(2)) red.BIND.push('two documents with one time origin share a record or a DOMContentLoaded stamp');
    // a push without a trigger is the document's own
    const s4 = S(); L.forcedTake(s4, { rec: { to: 7, n: 1 } }, { ctx: 3 });
    if (!s4.recByCtx.has(3)) red.BIND.push('a push without a trigger was not taken as the document\'s own');
    // beats by context, the DOMContentLoaded stamp a beat carries, the 1800 cap
    const s5 = S(); L.forcedTake(s5, { beat: 100, t: 10, d: null }, { ctx: 7 }); L.forcedTake(s5, { beat: 100, t: 20, d: 15 }, { ctx: 7 });
    if (s5.dclByCtx.get(7) !== 15) red.BIND.push(`the DOMContentLoaded stamp a beat carries: ${s5.dclByCtx.get(7)} (want 15)`);
    for (let i = 0; i < 1805; i++) L.forcedTake(s, { beat: 100, t: 1000 + i }, { ctx: 7 });
    const b = s.beats.get(7) || [];
    if (b.length !== 1800 || b[0] !== 1005 || b[1799] !== 2804 || !s.beatsCut.has(7)) red.BIND.push(`beats kept ${b.length} under the context (${b[0]}..${b[b.length - 1]}; want the last 1800 in order, the cut marked)`);
    if (L.forcedTake(s, { beat: 100, t: 1 }, {}) !== false) red.BIND.push('a beat without its context was taken');
    for (const bad of [{}, { rec: {} }, { rec: { to: '1' } }, { beat: 'x', t: 1 }, { beat: 1 }, null]) if (L.forcedTake(s, bad, { ctx: 7 }) !== false) red.BIND.push(`an unusable payload was taken: ${JSON.stringify(bad)}`);
    if (JSON.stringify(L.forcedDocs({ recs: new Map([[3, { to: 3 }], [1, { to: 1 }]]) }).map((d) => d.to)) !== '[1,3]') red.BIND.push('forcedDocs does not sort by timeOrigin');
  }
  // HANG
  {
    const P = 1000000, D = L.FORCED_DCL_MS, Q = L.FORCED_SILENCE_MS;
    const every = (a, b) => { const o = []; for (let x = a; x <= b; x += 1000) o.push(x); return o; };
    // a scripted tab: each document { to, c (its commit), cx (its context's creation; default c), dcl (CDP's and its own),
    // end (its context's end), beats, norec, ownDcl (its own stamp, when CDP's is missing), blank }, paired by order
    const run = (docs, now) => {
      const store = { recs: new Map(), beats: new Map(), ctxTo: new Map(), recByCtx: new Map(), dclByCtx: new Map(), beatsCut: new Set(), phDirect: new Set() };
      const commits = [], contexts = [];
      docs.forEach((d, i) => {
        const ctx = 100 + i;
        commits.push({ t: d.c, url: d.blank ? 'about:blank' : 'http://127.0.0.1/app.html', loaderId: `L${i}`, dcl: d.cdpDcl === undefined ? (d.dcl ?? null) : d.cdpDcl, dcl2: null });
        contexts.push({ id: ctx, t: d.cx ?? d.c, end: d.end ?? null });
        if (d.blank) return;
        if (!d.norec) { const rec = { to: d.to, id: `doc${i}`, rs: 300, dcl: d.ownDcl === undefined ? (d.dcl ?? null) : d.ownDcl, n: 3 }; store.recs.set(d.to, rec); store.ctxTo.set(ctx, d.to); store.recByCtx.set(ctx, rec); if (rec.dcl != null) store.dclByCtx.set(ctx, rec.dcl); }
        if (d.beatD != null) store.dclByCtx.set(ctx, d.beatD);
        store.beats.set(ctx, d.beats || []); if (d.cut) store.beatsCut.add(ctx);
      });
      return L.forcedHangCheck(store, { pressAt: P, commits, contexts, now });
    };
    // doc0 = the pressing page (ends at the swap's commit), doc1 = the swap, doc2 = the repair (live)
    const d0 = { to: P - 100000, c: P - 99900, dcl: P - 99000, end: P + 10505, beats: every(P - 99000, P + 10400) };
    const d1 = { to: P + 10200, c: P + 10505, dcl: P + 10600, end: P + 11005, beats: every(P + 10505, P + 10950) };
    const d2 = { to: P + 10700, c: P + 11005, dcl: P + 11200, beats: every(P + 11005, P + 40000) };
    const H = [d0, d1, d2];
    const cases = [
      ['healthy', H, P + 40500, null],
      ['DOMContentLoaded 21 s after the commit', [d0, d1, { ...d2, dcl: d2.c + D + 1000, beats: every(d2.c + D + 1000, P + 60000) }], P + 60500, /reached DOMContentLoaded \d+ ms after its commit/],
      ['DOMContentLoaded not reached 21 s after the commit', [d0, d1, { ...d2, dcl: null, beats: [] }], d2.c + D + 1000, /has not reached DOMContentLoaded/],
      ['DOMContentLoaded not reached 19 s after the commit', [d0, d1, { ...d2, dcl: null, beats: [] }], d2.c + D - 1000, null],
      ['a document replaced before DOMContentLoaded within 20 s', [d0, d1, { ...d2, dcl: null, beats: [], end: d2.c + 5000 }, { to: P + 16000, c: P + 16005, blank: true }], d2.c + 60000, null],
      ['the live document silent 16 s after its DOMContentLoaded', [d0, d1, { ...d2, beats: every(P + 11005, P + 20000) }], P + 20005 + Q + 1000, /the live document .* silent/],
      ['a document frozen until its context ends 17 s later', [d0, { ...d1, end: P + 28005 }, { ...d2, to: P + 27900, c: P + 28005, dcl: P + 28200, beats: every(P + 28005, P + 40000) }], P + 40500, /a document .* silent/],
      ['a 14 s gap', [d0, d1, { ...d2, beats: [...every(P + 11200, P + 20200), ...every(P + 34200, P + 40200)] }], P + 40500, null],
      ['a busy boot: 16 s from the commit to DOMContentLoaded, no beat before it', [d0, d1, { ...d2, dcl: d2.c + 16000, beats: every(d2.c + 16000, P + 40000) }], P + 40500, null],
      ['the pressing page silent 16 s from the press on', [{ ...d0, end: null, beats: every(P - 99000, P) }], P + Q + 1000, /the live document .* silent .* from the press/],
      ['a document gone before the press', [{ to: P - 200000, c: P - 199900, dcl: P - 199000, end: P - 99900, beats: every(P - 199000, P - 150100) }, ...H], P + 40500, null],
      ['silence after the leg\'s own about:blank close', [d0, d1, { ...d2, beats: every(P + 11005, P + 30000), end: P + 30050 }, { to: P + 30040, c: P + 30050, blank: true }], P + 90000, null],
      ['the repair navigation 20 ms after the swap\'s commit', [d0, d1, { ...d2, to: d1.c + 20, c: d1.c + 500, dcl: d1.c + 700, beats: every(d1.c + 500, P + 40000) }], P + 40500, null],
      ['a context created before its commit event arrives', [d0, d1, { ...d2, cx: d2.c - 30 }], P + 40500, null],
      ['a document kept in the back/forward cache (its context never ends; the next context starts)', [d0, { ...d1, end: null }, d2], P + 40500, null],
      ['a freeze right after DOMContentLoaded, its own stamp lost (CDP\'s counts)', [d0, d1, { ...d2, ownDcl: null, beats: every(P + 11005, P + 11300) }], P + 11300 + Q + 2000, /the live document .* silent/],
      ['the CDP DOMContentLoaded missing, the beat\'s stamp counts', [d0, d1, { ...d2, cdpDcl: null, ownDcl: null, beatD: P + 11200, beats: every(P + 11005, P + 12300) }], P + 12300 + Q + 2000, /silent/],
      ['beats beyond the cap leave no false gap', [d0, d1, { ...d2, beats: every(P + 11005, P + 40000), cut: true }], P + 40500, null],
    ];
    for (const [what, docs, now, want] of cases) {
      const h = run(docs, now);
      if (want === null ? h.why !== null : !want.test(h.why || '')) red.HANG.push(`${what}: ${JSON.stringify(h.why)} (want ${want === null ? 'no HANG' : want})`);
    }
    // a cut beat list starts at its first kept beat (an 1800-beat cap can drop the beats right after DOMContentLoaded)
    {
      const store = { recs: new Map(), beats: new Map([[100, every(P + 30000, P + 40000)]]), ctxTo: new Map(), recByCtx: new Map([[100, { id: 'x', dcl: P + 1000 }]]), dclByCtx: new Map([[100, P + 1000]]), beatsCut: new Set([100]), phDirect: new Set() };
      const h = L.forcedHangCheck(store, { pressAt: P, commits: [{ t: P + 900, url: 'http://127.0.0.1/app.html', dcl: P + 1000 }], contexts: [{ id: 100, t: P + 900, end: null }], now: P + 40500 });
      if (h.why !== null) red.HANG.push(`a cut beat list: ${JSON.stringify(h.why)} (want no HANG: the gap starts at the first kept beat)`);
    }
    // the fallback DOMContentLoaded (the main-frame event, no loader id) counts when the loader's event is missing
    {
      const store = { recs: new Map(), beats: new Map(), ctxTo: new Map(), recByCtx: new Map(), dclByCtx: new Map(), beatsCut: new Set(), phDirect: new Set() };
      const h = L.forcedHangCheck(store, { pressAt: P, commits: [{ t: P + 11005, url: 'http://127.0.0.1/app.html', loaderId: 'L', dcl: null, dcl2: P + 11300 }], contexts: [], now: P + 40000 });
      if (h.why !== null || h.dclMax !== 295) red.HANG.push(`the domContentEventFired fallback: ${JSON.stringify(h)} (want no HANG, dclMax 295)`);
    }
    const u1 = run([d0, d1, { ...d2, norec: true }], d2.c + 1000);
    if (u1.unmatched !== 1 || !u1.unaccounted.length || u1.unaccounted[0].t !== d2.c) red.HANG.push(`one document after the press with no record of its own: ${JSON.stringify(u1.unaccounted)} (want its commit)`);
    if (run(H, P + 40500).unmatched !== 0) red.HANG.push('the healthy tab has unaccounted documents');
    // a commit just before the press whose context comes after it cannot hide a later unaccounted commit (pairing)
    const u2 = run([{ ...d0, c: P - 10, cx: P + 5 }, d1, { ...d2, norec: true }], d2.c + 1000);
    if (u2.unmatched !== 1) red.HANG.push(`a context made after the press for a commit before it hid an unaccounted document (unmatched ${u2.unmatched}, want 1)`);
  }
  // PINS (change a bound only with a new pre-registration)
  if (L.FORCED_REPAIR_MS !== 20000) red.PINS.push(`FORCED_REPAIR_MS ${L.FORCED_REPAIR_MS} (pre-registered 20000)`);
  if (L.FORCED_ACTIVATE_MS !== 60000) red.PINS.push(`FORCED_ACTIVATE_MS ${L.FORCED_ACTIVATE_MS} (pre-registered 60000)`);
  for (const [k, v] of [['FORCED_HOLD_MS', 1500], ['FORCED_FILL_MS', 300000], ['FORCED_LOOP_WATCH_MS', 20000], ['FORCED_LOOP_CLOSE', 6]]) {
    if (L[k] !== v) red.PINS.push(`${k} ${L[k]} (PLAN rev 2.1 / PREREG: ${v})`);
  }
  for (const [k, v] of [['FORCED_DCL_MS', 20000], ['FORCED_SILENCE_MS', 15000], ['FORCED_BEAT_MS', 1000], ['FORCED_BINDING', '__obForcedRec']]) {
    if (L[k] !== v) red.PINS.push(`${k} ${JSON.stringify(L[k])} (PREREG rev 5: ${JSON.stringify(v)})`);
  }
  const rk = (swupdate.match(/^const REPAIR_KEY = '([^']+)';$/m) || [])[1];
  if (rk !== L.FORCED_REPAIR_KEY) red.PINS.push(`the record hook keeps ${JSON.stringify(L.FORCED_REPAIR_KEY)}, app/swupdate.js's REPAIR_KEY is ${JSON.stringify(rk)}`);
  // POSTPRESS (legSwForced's text)
  {
    const PRESS = 'const pressAt = Date.now();';
    const nP = count(L.leg, PRESS);
    if (nP !== 1) red.POSTPRESS.push(`legSwForced has ${nP} press points (want one)`);
    else {
      const post = L.leg.slice(L.leg.indexOf(PRESS));
      for (const [re, what] of [[/SW_PROBE/, 'SW_PROBE'], [/\bcaches\./, 'a CacheStorage read'], [/getRegistration/, 'a registration read'],
        [/serviceWorker\.ready/, 'serviceWorker.ready'], [/Runtime\.evaluate/, 'a raw Runtime.evaluate'], [/FORCED_READ/, 'FORCED_READ (rev 5: the records come from the binding)']]) if (re.test(post)) red.POSTPRESS.push(`${what} after the press`);
      const raw = count(post, '.eval(');
      if (raw) red.POSTPRESS.push(`${raw} eval(s) after the press outside ev()`);
      if (count(post, 'boundedEval(') !== 1 || !/const ev = \(expr, step\) => \{ const t0 = Date\.now\(\); return boundedEval\(c, expr, step\)\.finally\(\(\) => evals\.push\(/.test(post)) {
        red.POSTPRESS.push(`boundedEval is used ${count(post, 'boundedEval(')} time(s) after the press (want once: inside ev(), which records each eval)`);
      }
    }
    if (!/newSwPage\(PORT2, cdp, \{ observer: false \}\)/.test(L.leg)) red.POSTPRESS.push('legSwForced opens its tab with SW_OBSERVER (a registration poll after the press)');
    if (count(src, '{ source: SW_OBSERVER }') !== 1 || !src.includes("  if (observer) await c.send('Page.addScriptToEvaluateOnNewDocument', { source: SW_OBSERVER });")) {
      red.POSTPRESS.push('newSwPage does not gate SW_OBSERVER on its observer option');
    }
  }
  // DUMP (#1173 rev 5)
  {
    const P = 1000000;
    const d = { pressAt: P, where: 'the loop watch', boot: { frame: 'f', commit: P + 50000, dcl: 0, started: P + 70500, stopped: 0 },
      lastGood: [{ to: P + 10200, rs: 300, id: 'aaaaaaaaaaaa', cc: false, ctl: true, pair: 'aaaaaaaaaaaa>bbbbbbbbbbbb' }, { to: P + 10700, rs: 2600, id: 'bbbbbbbbbbbb', cc: false, ctl: true, pair: null }],
      cdp: { n: 41, lastAt: P + 71000, last: 'Page.frameStartedLoading' }, page: [{ m: 'frameNavigated', t: P + 50000 }, { m: 'frameStartedLoading', t: P + 70500 }],
      store: { recs: new Map([[1, {}], [2, {}]]), beats: new Map([[103, [P + 11005, P + 12005]]]), ctxTo: new Map([[103, 2]]), recByCtx: new Map([[103, {}]]), dclByCtx: new Map(), beatsCut: new Set(), phDirect: new Set() },
      commits: [{ t: P - 5000, url: 'x' }, { t: P + 10505, url: 'x', dcl: P + 10600 }, { t: P + 90000, url: 'about:blank' }],
      contexts: [{ id: 101, t: P - 9000, end: P - 5000 }, { id: 102, t: P + 10505, end: P + 11005 }, { id: 103, t: P + 11005, end: null }] };
    const runs = [{ t: P - 5000, id: '1', st: 'running', status: 'activated' }, { t: P + 13000, id: '2', st: 'running', status: 'activated' }];
    const evals = Array.from({ length: 45 }, (_, i) => `the record read@${13000 + i * 1000}+${i === 44 ? 20000 : 1}`);
    const out = L.forcedStallDump(d, { step: 'the record read did not answer within 20 s', phase: 'after the press', evals, diag: ['x'], runs, now: P + 91000 });
    const want = { step: 'the record read did not answer within 20 s', phase: 'after the press', where: 'the loop watch', sincePressMs: 91000,
      evals: evals.slice(-40), boot: { commit: 50000, dcl: null, started: 70500, stopped: null }, page: ['frameNavigated@50000', 'frameStartedLoading@70500'],
      cdp: { events: 41, last: 'Page.frameStartedLoading', lastMs: 71000, quietMs: 20000 }, runs: ['13000:2:running/activated'], diag: ['x'],
      docs: ['10200+300:aaaaaaaaaaaa/ctl/pair=aaaaaaaaaaaa>bbbbbbbbbbbb', '10700+2600:bbbbbbbbbbbb/ctl'],
      binding: { records: 2, beats: ['ctx103:2@12005'], commits: ['10505:dcl+95', '90000:blank'], contexts: ['ctx102@10505..11005:norec', 'ctx103@11005..live'] } };
    if (JSON.stringify(out) !== JSON.stringify(want)) red.DUMP.push(`forcedStallDump gave ${JSON.stringify(out).slice(0, 240)} (want ${JSON.stringify(want).slice(0, 240)})`);
    const cat = L.leg.indexOf('  } catch (e) {\n    if (!(e instanceof Stall) && !(e instanceof Hang)) throw e;\n');
    const tail = cat < 0 ? '' : L.leg.slice(cat, L.leg.indexOf('  } finally {', cat));
    const iDump = tail.indexOf('SWFORCED STALL-DUMP ${JSON.stringify(forcedStallDump(dump, { step: e.message, phase, evals, diag, runs, now: Date.now() }))}');
    const iFail = tail.indexOf("fail(`[${tag}] ${e instanceof Hang ? 'HANG' : 'STALL'} ${phase}: ${e.message}`);");
    if (iDump < 0 || iFail < 0 || iDump > iFail) red.DUMP.push('the STALL / HANG catch does not print forcedStallDump(dump, ...) before its FAIL');
    // a HANG in the settle (the repair document never reaches DOMContentLoaded) and in the late watch (it freezes)
    const scs = settleScenarios(L);
    for (const [name, where, recs] of [['the repair document never reaches DOMContentLoaded', 'the settle', 3], ['the repair document freezes 16 s after its DOMContentLoaded', 'the late watch', 3]]) {
      const sc = scs.find(([what]) => what === name);
      let s = null; try { s = sc ? await settleRun(L, sc[1]) : null; } catch (e) { red.DUMP.push(`${name}: threw ${String(e && e.message).slice(0, 100)}`); continue; }
      const got = s && s.dump ? [s.dump.where, (s.dump.lastGood || []).length] : null;
      if (!s || s.cls !== 'HANG') red.DUMP.push(`${name}: ended ${s && s.cls} (want HANG)`);
      else if (JSON.stringify(got) !== JSON.stringify([where, recs])) red.DUMP.push(`${name}: the dump at ${JSON.stringify(got)} (want ${JSON.stringify([where, recs])}: the phase and the records seen before it)`);
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

// file: the leg source unless 'sw' / 'swupdate'; apply() for an anchor that moves with every regeneration; also =
// the collateral a plant turns red by construction; expect 'INVALID' = the arm must refuse, never PASS
const PLANTS = [
  { mech: 'ANCHORS', file: 'sw', also: ['LABBYTES'], name: 'a second ALL_HREFS anchor', old: 'const ALL_HREFS = PRECACHE.concat(', new: '// const ALL_HREFS (a copy)\nconst ALL_HREFS = PRECACHE.concat(' },
  { mech: 'ANCHORS', file: 'sw', name: 'VERSION moved after ALL_HREFS', apply: (s) => { const m = s.match(/^const VERSION = '[^']+';\n/m); const h = s.match(/^const ALL_HREFS = [^\n]*\n/m); return m && h ? s.replace(m[0], '').replace(h[0], `${h[0]}${m[0]}`) : null; } },
  { mech: 'LABBYTES', name: 'the A block left in B', old: "  let out = b0 >= 0 && b1 > b0 ? sw.slice(0, b0) + '/* swforced: the A-only block stripped from B */' + sw.slice(b1 + END.length) : sw;", new: '  let out = sw;' },
  { mech: 'LABBYTES', name: 'a doubled anchor accepted', old: '  if (n !== 1) return { invalid: `lab anchor missing: ${FORCED_ALL_HREFS} (found ${n})` };', new: '  if (n === 0) return { invalid: `lab anchor missing: ${FORCED_ALL_HREFS} (found ${n})` };' },
  { mech: 'LABBYTES', name: 'the activate delay always added to B', old: '  if (activateDelayMs > 0) {', new: '  if (activateDelayMs >= 0) {' },
  { mech: 'LABBYTES', name: 'the activate delay added to A too', old: "  if (gen === 'A') {\n    const hold = ", new: "  if (activateDelayMs > 0) sw = sw.replace(FORCED_ALL_HREFS, `self.addEventListener('activate', (e) => { e.waitUntil(new Promise((r) => setTimeout(r, ${activateDelayMs}))); });\\n${FORCED_ALL_HREFS}`);\n  if (gen === 'A') {\n    const hold = " },
  { mech: 'LABBYTES', also: ['HOLD'], name: 'A\'s block does not compile', old: '    e.waitUntil(p); return;\n  }\n', new: '    e.waitUntil(p); return;\n' },
  { mech: 'HOLD', name: 'the hold never released at the navigation', old: "  if (e.request.mode === 'navigate' && typeof __forcedRel === 'function') { const f = __forcedRel; __forcedRel = 'released'; f(); }\n", new: '' },
  { mech: 'HOLD', name: 'a navigation may arm the hold', old: "  if (e.request.mode !== 'navigate' && u.search.indexOf(", new: '  if (u.search.indexOf(' },
  { mech: 'HOLD', name: 'the token not required', old: "u.search.indexOf('${FORCED_HOLD_TOKEN}') >= 0 && __forcedRel === null", new: '__forcedRel === null' },
  { mech: 'HOLD', name: 'the cap at 200 s', old: "__forcedRel = 'cap'; f(); } }, 20000);", new: "__forcedRel = 'cap'; f(); } }, 200000);" },
  { mech: 'HOLD', name: 'B arms the hold', old: "  if (VERSION.endsWith('-b')) return;\n", new: '' },
  { mech: 'HOLD', name: 'the start loop without a waiting worker', old: "if (self.registration && self.registration.waiting && !VERSION.endsWith('-b')) {", new: "if (!VERSION.endsWith('-b')) {" },
  { mech: 'CLASSIFY', name: 'a controllerchange counted as a swap', old: "  if (doc1.cc) return { cls: 'INVALID',", new: "  if (false) return { cls: 'INVALID'," },
  { mech: 'CLASSIFY', name: 'a stale page without a controller counted', old: "    if (doc1.ctl !== true) return { cls: 'INVALID', why: `the stale A page has no controller (ctl ${JSON.stringify(doc1.ctl)}): no swap`, doc1 };\n", new: '' },
  { mech: 'SETTLE', also: ['DUMP'], name: 'no late-document watch after REPAIRED', old: "    if (r.cls === 'REPAIRED') {\n      dump.where = 'the late watch';\n      const until = r.doc2.to + (r.doc2.rs ?? 0) + FORCED_REPAIR_MS + 2000;\n      while (Date.now() < until) { await sleep(1000); await docsNow(); }\n      await navSettled();\n      await docsSettled('after the late watch');\n      r = classifyForced(lastGood || [], { idA, idB, pressAt: P0 });\n    }\n", new: '' },
  { mech: 'SETTLE', name: 'no re-read after the controller read', old: "        await docsSettled('after the controller read');\n        r = classifyForced(lastGood || [], { idA, idB, pressAt: P0, ctlId });", new: '        r = classifyForced(lastGood || [], { idA, idB, pressAt: P0, ctlId });' },
  { mech: 'SETTLE', name: 'the controller read\'s error uncaught', old: "\n        .catch((e) => { if (e instanceof Stall) throw e; return { err: String(e.message || e).slice(0, 120) }; });", new: ';' },
  { mech: 'SETTLE', name: 'the loop watch timed from before the navigation', old: '      while (Date.now() - loopT0 < FORCED_LOOP_WATCH_MS) {', new: '      while (Date.now() - loopAt < FORCED_LOOP_WATCH_MS) {' },
  { mech: 'SETTLE', also: ['DUMP'], name: 'docsNow skips the hang guards', old: '      hang = forcedHangCheck(store, { pressAt, commits, contexts, now: Date.now() });\n      if (hang.why) throw new Hang(hang.why);\n', new: '' },
  { mech: 'SETTLE', name: 'no wait for a navigation in flight before the verdict', old: '      while (Date.now() < until) { await sleep(1000); await docsNow(); }\n      await navSettled();\n', new: '      while (Date.now() < until) { await sleep(1000); await docsNow(); }\n' },
  { mech: 'SETTLE', name: 'the loop split anchored at the commit', old: '      const loopDocs = ld.filter((d) => d.to >= loopAt - 50);\n      const mainDocs = ld.filter((d) => d.to < loopAt - 50).length;', new: '      const loopDocs = ld.filter((d) => d.to >= loopT0 - 50);\n      const mainDocs = ld.filter((d) => d.to < loopT0 - 50).length;' },
  { mech: 'SETTLE', also: ['DUMP'], name: 'a HANG swallowed', old: '      if (hang.why) throw new Hang(hang.why);\n', new: '      if (hang.why) diag.push(hang.why);\n' },
  { mech: 'SETTLE', name: 'the verdict does not wait for every commit\'s record', old: '        if (!hang.unmatched) return;\n', new: '        return;\n' },
  { mech: 'SETTLE', name: 'an unaccounted document accepted (review P2 on cd4fce09)', old: '      fail(`[${tag}] an unaccounted document ${where}: ', new: '      void (`[${tag}] an unaccounted document ${where}: ' },
  { mech: 'SETTLE', name: 'no last look after the settle\'s last wait (review P2 on 9ab5caf3)', old: '      await docsNow();\n      if (!hang.unmatched) return;\n      fail(`[${tag}] an unaccounted document ', new: '      fail(`[${tag}] an unaccounted document ' },
  { mech: 'SETTLE', name: 'the last look leaves lastGood stale', old: '      await docsNow();\n      if (!hang.unmatched) return;\n      fail(`[${tag}] an unaccounted document ', new: '      hang = forcedHangCheck(store, { pressAt, commits, contexts, now: Date.now() });\n      if (hang.why) throw new Hang(hang.why);\n      if (!hang.unmatched) return;\n      fail(`[${tag}] an unaccounted document ' },
  { mech: 'SETTLE', name: 'the app-loop commit unbounded', old: "      await Promise.race([c.send('Page.navigate', { url: `http://127.0.0.1:${PORT2}/app-loop.html?sw=1&u=3g-${tag}-loop` }),\n        new Promise((_, rej) => { navTimer = setTimeout(() => rej(new Stall('the app-loop navigation did not commit within 60 s')), 60000); })])\n        .finally(() => clearTimeout(navTimer));", new: "      await c.send('Page.navigate', { url: `http://127.0.0.1:${PORT2}/app-loop.html?sw=1&u=3g-${tag}-loop` });" },
  { mech: 'PRESS', name: 'the press waits for nothing', old: '    while (!aUp && Date.now() - tKick < 10000) { await sleep(20); const l = latest((r) => r.id === aV.id); if (aIsUp(l) && l.t >= tKick) aUp = l; }\n', new: '' },
  { mech: 'PRESS', name: 'A\'s restart not required', old: "    if (!aUp) { fail(`[${tag}] INVALID: the forcing fetch did not restart A within 10 s`); return; }\n    const restartMs = aUp.t - tKick;", new: '    const restartMs = aUp ? aUp.t - tKick : null;' },
  { mech: 'PRESS', name: 'the restart wait unbounded', old: '    while (!aUp && Date.now() - tKick < 10000) {', new: '    while (!aUp) {' },
  { mech: 'SETTLE', name: 'the loop page may reload six times', old: '      if (loopDocs.length > 2) fail(', new: '      if (loopDocs.length > 6) fail(' },
  { mech: 'CLASSIFY', also: ['SETTLE'], name: 'no controller read', old: "    if (ctlId === undefined) return { cls: 'NEEDS-CTL', why: null, doc1 };\n", new: '' },
  { mech: 'CLASSIFY', also: ['SETTLE'], name: 'the stale page\'s controller not checked', old: "    if (ctlId !== idB) return { cls: 'INVALID',", new: "    if (false) return { cls: 'INVALID'," },
  { mech: 'CLASSIFY', name: 'an uncontrolled repair accepted', old: '  if (doc2.ctl !== true) return', new: '  if (doc2.ctl === false) return' },
  { mech: 'CLASSIFY', also: ['SETTLE'], name: 'no check of the repair pair', old: '  if (doc1.pair !== `${idA}>${idB}`) return', new: '  if (false) return' },
  { mech: 'CLASSIFY', also: ['SETTLE'], name: 'a third document allowed', old: '  if (after.length > 2) return', new: '  if (after.length > 3) return' },
  { mech: 'CLASSIFY', also: ['SETTLE'], name: 'no repair bound', old: '  if (!(fromAnswer !== null && fromAnswer <= FORCED_REPAIR_MS)) return', new: '  if (false) return' },
  { mech: 'CLASSIFY', name: 'the bound measured from the swapped document start', old: '  const fromAnswer = doc1.rs == null ? null : doc2.to - (doc1.to + doc1.rs);', new: '  const fromAnswer = doc2.to - doc1.to;' },
  { mech: 'RECORD', name: 'one key for every document', old: '  const key = ${JSON.stringify(FORCED_DOC_KEY)} + rec.to;', new: "  const key = ${JSON.stringify(FORCED_DOC_KEY)} + 'tab';" },
  { mech: 'RECORD', name: 'the id read only when the root already exists', old: '  if (!readId()) { const mo = new MutationObserver(() => { if (readId()) mo.disconnect(); }); mo.observe(document, { childList: true }); }\n', new: '  readId();\n' },
  { mech: 'RECORD', name: 'no response time', old: "  const nav = () => { const n = performance.getEntriesByType('navigation')[0]; if (n && n.responseStart) rec.rs = Math.round(n.responseStart); };", new: '  const nav = () => {};' },
  { mech: 'RECORD', name: 'controllerchange not flagged', old: "  if (sw) sw.addEventListener('controllerchange', () => { rec.cc = true; save('cc'); });", new: "  if (sw) sw.addEventListener('controllerchange', () => { save('cc'); });" },
  { mech: 'RECORD', name: 'no pair kept at pagehide', old: "    try { rec.pair = sessionStorage.getItem(${JSON.stringify(FORCED_REPAIR_KEY)}); } catch (e) { /* lab record */ } save('ph'); });", new: "    save('ph'); });" },
  { mech: 'RECORD', name: 'frames record too', old: '  if (window.top !== window) return;\n', new: '' },
  { mech: 'RECORD', name: 'the read unsorted', old: '.filter(Boolean).sort((a, b) => a.to - b.to)`;', new: '.filter(Boolean)`;' },
  { mech: 'PINS', name: 'the repair bound loosened', old: 'const FORCED_REPAIR_MS = 20000;', new: 'const FORCED_REPAIR_MS = 30000;' },
  { mech: 'PINS', name: 'the activate bound loosened', old: 'const FORCED_ACTIVATE_MS = 60000;', new: 'const FORCED_ACTIVATE_MS = 90000;' },
  { mech: 'PINS', also: ['HOLD'], name: 'no start loop', old: 'const FORCED_HOLD_MS = 1500;', new: 'const FORCED_HOLD_MS = 0;' },
  { mech: 'PINS', name: 'the fill wait shortened', old: 'const FORCED_FILL_MS = 300000;', new: 'const FORCED_FILL_MS = 1000;' },
  { mech: 'PINS', also: ['SETTLE'], name: 'the loop watch shortened', old: 'const FORCED_LOOP_WATCH_MS = 20000;', new: 'const FORCED_LOOP_WATCH_MS = 2000;' },
  { mech: 'PINS', name: 'the loop closed later', old: 'const FORCED_LOOP_CLOSE = 6;', new: 'const FORCED_LOOP_CLOSE = 60;' },
  { mech: 'PINS', file: 'swupdate', name: 'swupdate.js\'s repair key renamed', old: "const REPAIR_KEY = 'ob-html-repair';", new: "const REPAIR_KEY = 'ob-html-repair-2';" },
  { mech: 'POSTPRESS', name: 'a probe after the press', old: "    phase = 'after the press';\n", new: "    phase = 'after the press';\n    await c.eval(SW_PROBE).catch(() => null);\n" },
  { mech: 'POSTPRESS', name: 'an unbounded eval after the press', old: "    const inert = await ev('!!(document.body && document.body.inert)', 'the press check')", new: "    const inert = await c.eval('!!(document.body && document.body.inert)')" },
  { mech: 'POSTPRESS', name: 'a CacheStorage read through ev() after the press', old: "    // B's activate: the CDP event, never an eval;", new: "    await ev('caches.keys().then((k) => k.length)', 'a cache read');\n    // B's activate: the CDP event, never an eval;" },
  { mech: 'POSTPRESS', name: 'a registration read through ev() after the press', old: "    // B's activate: the CDP event, never an eval;", new: "    await ev('navigator.serviceWorker.getRegistration().then((r) => !!r)', 'a registration read');\n    // B's activate: the CDP event, never an eval;" },
  { mech: 'POSTPRESS', name: 'the tab opened with SW_OBSERVER', old: 'newSwPage(PORT2, cdp, { observer: false })', new: 'newSwPage(PORT2, cdp, {})' },
  { mech: 'POSTPRESS', name: 'newSwPage ignores its observer option', old: "  if (observer) await c.send('Page.addScriptToEvaluateOnNewDocument', { source: SW_OBSERVER });", new: "  await c.send('Page.addScriptToEvaluateOnNewDocument', { source: SW_OBSERVER });" },
  { mech: 'DUMP', name: 'no dump on a STALL', old: "    log(`[${tag}] SWFORCED STALL-DUMP ${JSON.stringify(forcedStallDump(dump, { step: e.message, phase, evals, diag, runs, now: Date.now() }))}`);\n", new: '' },
  { mech: 'DUMP', name: 'dump times not from the press', old: '  const rel = (t) => (t && d.pressAt != null ? t - d.pressAt : null);', new: '  const rel = (t) => t || null;' },
  { mech: 'DUMP', name: 'the CDP quiet time from the press', old: 'quietMs: d.cdp.lastAt ? now - d.cdp.lastAt : null', new: 'quietMs: d.cdp.lastAt ? d.cdp.lastAt - d.pressAt : null' },
  { mech: 'DUMP', name: 'the dump keeps no records', old: '      lastGood = d; dump.lastGood = d; return d;', new: '      lastGood = d; return d;' },
  { mech: 'DUMP', name: 'the settle not named in the dump', old: "    dump.where = 'the settle';\n", new: '' },
  { mech: 'BIND', also: ['SETTLE', 'DUMP'], name: 'a dropped Runtime.bindingCalled record (every pagehide copy)', old: "  if (msg && msg.rec && typeof msg.rec.to === 'number') {\n    const old", new: "  if (msg && msg.rec && typeof msg.rec.to === 'number') {\n    if (msg.rec.ph != null) return true;\n    const old" },
  { mech: 'BIND', also: ['SETTLE', 'DUMP'], name: 'forcedTake keeps the first copy of a document', old: '    if (!old || (msg.rec.n || 0) > (old.n || 0)) store.recs.set(msg.rec.to, msg.rec);', new: '    if (!old) store.recs.set(msg.rec.to, msg.rec);' },
  { mech: 'BIND', also: ['SETTLE'], name: 'a re-emit ties its context (review P2 on cd4fce09: no unambiguous document)', old: "    if (msg.tr !== 're' && meta.ctx != null) {", new: '    if (meta.ctx != null) {' },
  { mech: 'BIND', also: ['SETTLE'], name: 'beats kept by time origin, not by context', old: '    const b = store.beats.get(meta.ctx) || [];\n    b.push(msg.t); if (b.length > 1800) { b.shift(); store.beatsCut.add(meta.ctx); }\n    store.beats.set(meta.ctx, b);', new: '    const b = store.beats.get(msg.beat) || [];\n    b.push(msg.t); if (b.length > 1800) { b.shift(); store.beatsCut.add(msg.beat); }\n    store.beats.set(msg.beat, b);' },
  { mech: 'BIND', also: ['SETTLE'], name: 'forcedTake keeps the last copy (a stale re-emit wins)', old: '    if (!old || (msg.rec.n || 0) > (old.n || 0)) store.recs.set(msg.rec.to, msg.rec);', new: '    store.recs.set(msg.rec.to, msg.rec);' },
  { mech: 'HANG', name: 'a late DOMContentLoaded accepted', old: '      if (ms > FORCED_DCL_MS) why = ', new: '      if (false) why = ' },
  { mech: 'HANG', also: ['SETTLE', 'DUMP'], name: 'a DOMContentLoaded never reached accepted', old: '    } else if (until - c.t > FORCED_DCL_MS) {', new: '    } else if (false) {' },
  { mech: 'HANG', name: 'no domContentEventFired fallback', old: 'cdpDcl = c.dcl ?? c.dcl2 ?? null;', new: 'cdpDcl = c.dcl ?? null;' },
  { mech: 'HANG', also: ['SETTLE'], name: 'a context judged up to now after it ended', old: 'end = Math.min(x.end ?? Infinity, next ? next.t : Infinity, now);', new: 'end = now;' },
  { mech: 'HANG', also: ['SETTLE'], name: 'unmatched not counted', old: '  return { why, dclMax, silenceMax, unmatched: unaccounted.length, unaccounted };', new: '  return { why, dclMax, silenceMax, unmatched: 0, unaccounted: [] };' },
  { mech: 'HANG', also: ['SETTLE', 'DUMP'], name: 'no silence bound', old: '    if (gap > FORCED_SILENCE_MS) why = ', new: '    if (false) why = ' },
  { mech: 'HANG', also: ['SETTLE'], name: 'silence counted before DOMContentLoaded', old: 'from = Math.max(pressAt, dcl), end', new: 'from = pressAt, end' },
  { mech: 'RECORD', name: 'no re-emit at the document start', old: "  save('start'); reemit();\n", new: "  save('start');\n" },
  { mech: 'RECORD', name: 'no re-emit at DOMContentLoaded', old: "rec.dcl = now(); save('dcl'); reemit(); beat(); });", new: "rec.dcl = now(); save('dcl'); beat(); });" },
  { mech: 'RECORD', name: 'a record pushed although it was not stored', old: 'if (ok) push({ rec, tr }); };', new: 'push({ rec, tr }); };' },
  { mech: 'RECORD', name: 'no trigger on the pushes', old: 'if (ok) push({ rec, tr }); };', new: 'if (ok) push({ rec }); };' },
  { mech: 'RECORD', name: 'a re-emit marked as the document\'s own push', old: "push({ rec: r, tr: 're' });", new: "push({ rec: r, tr: 'start' });" },
  { mech: 'RECORD', name: 'the binding type not recorded', old: "    b: typeof window[${JSON.stringify(FORCED_BINDING)}] };", new: '    b: null };' },
  { mech: 'RECORD', name: 'no beat', old: '  beat(); setInterval(beat, ${FORCED_BEAT_MS});', new: '' },
  { mech: 'RECORD', name: 'a beat from a document that stores nothing', old: '  function beat() { if (stored) push(', new: '  function beat() { push(' },
  { mech: 'RECORD', name: 'the visibility not recorded', old: ' rec.vis = document.visibilityState || null;', new: '' },
  { mech: 'RECORD', name: 'the count does not rise', old: '  const save = (tr) => { rec.n += 1; rec.vis', new: '  const save = (tr) => { rec.vis' },
  { mech: 'RECORD', name: 'the binding called without a check', old: "  const push = (o) => { const b = window[${JSON.stringify(FORCED_BINDING)}]; if (typeof b === 'function') try { b(JSON.stringify(o)); } catch (e) { /* lab record */ } };", new: '  const push = (o) => { window[${JSON.stringify(FORCED_BINDING)}](JSON.stringify(o)); };' },
  { mech: 'RECORD', name: 'the binding read once at the hook\'s start', old: "  const push = (o) => { const b = window[${JSON.stringify(FORCED_BINDING)}]; if (typeof b === 'function') try { b(JSON.stringify(o)); } catch (e) { /* lab record */ } };", new: "  const b0 = window[${JSON.stringify(FORCED_BINDING)}]; const push = (o) => { const b = b0; if (typeof b === 'function') try { b(JSON.stringify(o)); } catch (e) { /* lab record */ } };" },
  { mech: 'POSTPRESS', name: 'a record read by eval after the press', old: "    // the records come from the binding's events", new: "    await ev(FORCED_READ, 'the record read');\n    // the records come from the binding's events" },
  { mech: 'PINS', also: ['SETTLE'], name: 'the DOMContentLoaded bound loosened', old: 'const FORCED_DCL_MS = 20000;', new: 'const FORCED_DCL_MS = 30000;' },
  { mech: 'PINS', also: ['HANG', 'SETTLE', 'DUMP'], name: 'the silence bound loosened', old: 'const FORCED_SILENCE_MS = 15000;', new: 'const FORCED_SILENCE_MS = 20000;' },
  { mech: 'PINS', name: 'the beat slowed', old: 'const FORCED_BEAT_MS = 1000;', new: 'const FORCED_BEAT_MS = 5000;' },
  { mech: 'PINS', name: 'the binding renamed', old: "const FORCED_BINDING = '__obForcedRec';", new: "const FORCED_BINDING = '__obForcedRec2';" },
  { mech: 'HANG', also: ['SETTLE', 'DUMP'], name: 'contexts paired off by one', old: 'x = xs[k], cdpDcl', new: 'x = xs[k + 1], cdpDcl' },
  { mech: 'HANG', name: 'a context lives on after its successor (the back/forward cache)', old: 'end = Math.min(x.end ?? Infinity, next ? next.t : Infinity, now);', new: 'end = Math.min(x.end ?? Infinity, now);' },
  { mech: 'HANG', name: 'guard 2 needs the record\'s own DOMContentLoaded stamp', old: '    const dcl = cdpDcl ?? store.dclByCtx.get(x.id) ?? null;', new: '    const dcl = (store.recByCtx.get(x.id) || {}).dcl ?? null;' },
  { mech: 'HANG', name: 'a cut beat list read from DOMContentLoaded', old: 'let last = store.beatsCut.has(x.id) && bs.length && bs[0] > from ? bs[0] : from, gap = 0;', new: 'let last = from, gap = 0;' },
  { mech: 'RECORD', name: 'no beat at DOMContentLoaded', old: "save('dcl'); reemit(); beat(); });", new: "save('dcl'); reemit(); });" },
  { mech: 'RECORD', name: 'beats carry no DOMContentLoaded stamp', old: 'push({ beat: rec.to, t: now(), d: rec.dcl });', new: 'push({ beat: rec.to, t: now() });' },
  { mech: 'BIND', name: 'a push without a trigger not taken as the document\'s own', old: "    if (msg.tr !== 're' && meta.ctx != null) {", new: "    if (msg.tr && msg.tr !== 're' && meta.ctx != null) {" },
  { expect: 'INVALID', name: 'the constants\' end marker renamed', old: '\n/** the lab bytes of the forced recipe', new: '\n/** lab bytes of the forced recipe' },
];

let verdictPrinted = false;
const verdict = (line, code) => { verdictPrinted = true; console.log(line); process.exit(code); };
process.on('beforeExit', () => { if (!verdictPrinted) { verdictPrinted = true; console.log('[swforced] INVALID: no verdict'); process.exitCode = 2; } });

const args = process.argv.slice(2);
const srcPath = path.resolve(args.includes('--src') ? args[args.indexOf('--src') + 1] : SRC_DEFAULT);
const files = {
  src: fs.readFileSync(srcPath, 'utf8'),
  sw: fs.readFileSync(path.join(WEB, 'sw.js'), 'utf8'),
  swupdate: fs.readFileSync(path.join(WEB, 'app', 'swupdate.js'), 'utf8'),
};
if (!args.includes('--selftest')) {
  const { invalid, red } = await judge(files);
  if (invalid.length) verdict(`[swforced] verdict INVALID: ${invalid.join('; ')}`, 2);
  for (const m of MECHS) console.log(`[swforced] ${red[m].length ? 'FAIL' : 'ok'} ${m}${red[m].length ? `: ${red[m].join('; ')}` : ''}`);
  const reds = MECHS.filter((m) => red[m].length);
  if (reds.length) verdict(`[swforced] verdict FAIL — ${reds.join(', ')}`, 1);
  verdict(`[swforced] verdict PASS — ${MECHS.length} mechanisms (${MECHS.join(', ')})`, 0);
}
const base = await judge(files);
if (base.invalid.length || MECHS.some((m) => base.red[m].length)) verdict(`[swforced selftest] the tree is not green: ${JSON.stringify(base)}`, 2);
let bad = 0;
for (const p of PLANTS) {
  const key = p.file || 'src';
  let planted = null;
  if (p.apply) planted = p.apply(files[key]);
  else if (files[key].split(p.old).length - 1 === 1) planted = files[key].replace(p.old, () => p.new);
  if (planted == null || planted === files[key]) { console.log(`[swforced selftest] INVALID plant "${p.name}": its anchor is not found exactly once in ${key}`); bad++; continue; }
  const r = await judge({ ...files, [key]: planted });
  const hit = MECHS.filter((m) => r.red[m] && r.red[m].length);
  const want = p.expect === 'INVALID' ? [] : [p.mech, ...(p.also || [])].sort();
  const ok = p.expect === 'INVALID' ? r.invalid.length > 0 : !r.invalid.length && JSON.stringify([...hit].sort()) === JSON.stringify(want);
  console.log(`[swforced selftest] ${ok ? 'caught' : 'MISSED'} plant "${p.name}" -> ${p.expect === 'INVALID' ? `INVALID ${JSON.stringify(r.invalid)}` : `red ${JSON.stringify(hit)}`}${p.expect !== 'INVALID' && r.invalid.length ? ` invalid ${JSON.stringify(r.invalid)}` : ''}`);
  if (!ok) bad++;
}
verdict(bad ? `[swforced selftest] FAIL (${bad})` : `[swforced selftest] OK: ${PLANTS.length} plants each caught on its own mechanism (collateral declared)`, bad ? 1 : 0);
