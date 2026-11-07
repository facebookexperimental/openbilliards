// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-sw-fill-control.mjs — GH-1039: the service worker's fill control,
// judged deterministically on the REAL web/sw.js logic in Node (no browser).
//
// The worker body runs under stub self / caches / fetch, a fake clock (every
// timer and Date.now) and a small synthetic manifest that replaces the two
// generated PRECACHE arrays (3 boot + 30 fill entries, real sha256 digests),
// so each order below happens on purpose, not by luck. Its web APIs are
// in-process too (review r1 P2 on 961ab724): crypto.subtle.digest (node:crypto
// createHash), Request / Response / Headers, so no worker step waits on the
// libuv thread pool; every async step the harness does not resolve itself is
// TRACKED, and the clock advances only once none is pending (no tick counting
// stands in for async work). --selftest also judges the tree with every
// digest delayed 25 ms on a real timer, which must stay green. One named
// line per scenario:
//   RACE        a client's {ob:'fill'} kicks the fill while activate is still
//               awaiting caches.keys(): activation must still wait for the
//               first chunk (boot + CHUNK cached at activation) and print its
//               "fill first turn inside activate" line. Pre-fix kickFill
//               returned a settled promise to activate (client-first: RED).
//               Control: activate first (green on both).
//   FAILED-TURN a turn whose caches.open throws must not log "fill complete",
//               and a later kick must finish the fill — via the message turn
//               and via the direct loop. Pre-fix the catch returned 0, the
//               worker logged a complete fill over the holes and fillKicked
//               stayed true (every later kick a no-op). A later life whose
//               first caches.open fails once recovers at the next kick (a
//               rejected open is never kept).
//   LATE-TURN   a turn message delivered after the 4 s fallback started the
//               direct loop must not start a second chain (more than LANES
//               fetches in flight). Control: delivered at 3.9 s.
//   JOIN-SIGNAL a verified fill miss is answered at once and its copy written
//               afterwards; {ob:'snapshot-joined', url} must reach the client
//               only AFTER the write (the copy is in the snapshot when it
//               arrives), and never on a store failure (GH-1039 P4).
//   RETIRED-GENERATION  the next generation's activate deletes this worker's
//               cache by name mid-fill: the fill must not re-create that name
//               (an orphan of a retired generation) and must stop fetching
//               beyond the chunk already in flight; a fetch after the delete
//               answers from the held handle without re-creating it either.
//               Control: no delete.
// The stale sweep (GH-1039 race 2: the browser re-creates a deleted older
// name EMPTY when it stores code cache for a script an old page loaded from
// it; #1162) — the worker under test is B, OLDER (A) predates it:
//   STALE-SWEEP activate deletes A; when A comes back by name, the next client
//               {ob:'fill'}, navigation or fill end (message turns and the
//               direct loop) removes it — also after B's worker was stopped
//               and restarted in between (a fresh life, no memory).
//   SWEPT-SIGNAL every sweep posts {ob:'swept'} once SETTLED (never while its
//               delete is pending): one answer per client ask with its id and
//               its real delete count (a re-created name, nothing to remove,
//               a worker installing), else a broadcast (activate, fill end).
//   ANSWER-PATH with the sweep's caches.keys() held, the navigation is
//               answered and the navigation / client-ask event still holds a
//               pending waitUntil (the sweep rides it, never the answer).
//   INSTALLING-SKIP nothing is swept while a worker installs or waits: C's
//               install cache and A both survive B's activate and later
//               sweeps while C installs (A goes once C is gone); the guard
//               is read again before each delete (a rollback that starts
//               under a re-created name — the first, or the second after the
//               first was deleted — while its probe is pending, the probe
//               answering its stale "empty", keeps its cache); a revert
//               deploy's cache under A's re-used name survives while its
//               worker installs or waits; so does C's with keys() unordered
//               (C listed before B), installing and waiting.
//   OLDER-ONLY  after activate, a newer generation's cache survives B's
//               sweeps, nothing installing or waiting: a failed install kept
//               for its resume (holding the first boot entry, or only a later
//               entry of the first install batch), and a revert deploy's
//               cache under A's re-used name once its worker failed or took
//               over (it holds the batch: not a re-creation).
//   RETIRED-SWEEPER after C activated, B deletes nothing — its name gone, or
//               re-created empty (keys() then lists C before it), or its fill
//               saw the delete (retired) before a revert re-used its name
//               holding the batch; and a revert A' that takes over while B's
//               guard probe is pending (B redundant) keeps A's re-used name.
//               C holds the first batch, as every real generation does.
//   RUNNING-SNAPSHOT no sweep deletes or changes B's own snapshot.
// Scope-tagged names (#1169: ob-sws-<8-hex scope hash>-<VERSION>):
//   SCOPE       another registration of the app on this origin keeps its
//               snapshots: neither B's activate nor a later sweep point
//               (client, navigation, fill end) deletes a name outside B's
//               prefix, a full one older than B's snapshot or an empty one.
//               B's snapshot is named under that prefix, outside the sweep
//               filter of every worker from before scope tags (they take
//               every other name that starts with 'ob-sw-').
//   PRE-SCOPE   a name from before scope tags (ob-sw-<VERSION>) is never
//               deleted, nor any entry of it, by any sweep (ruling
//               ab9466c0: one worker cannot prove whose it is): B's own
//               previous generation survives B's activate whole; another
//               registration's survives; one shared with another
//               registration keeps every entry and its name; one back
//               after the take-over (full or empty) and one older than B's
//               snapshot that survived a deferred activate survive the
//               later sweeps.
//
//   node web/tools/test-sw-fill-control.mjs [--sw <path>]   # judge a sw.js (default web/sw.js)
//   OB_FILLCTL_DIGEST_DELAY_MS=<ms>                          # every digest resolves that late (real timer)
//   node web/tools/test-sw-fill-control.mjs --selftest      # plants on the tree's sw.js
// Exit 0 PASS, 1 FAIL, 2 INVALID (a forced order did not happen / an anchor is missing).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SW_DEFAULT = path.resolve(HERE, '..', 'sw.js');
const ORIGIN = 'http://127.0.0.1:1';
// generation names carry the registration's scope (#1169): sw.js's PREFIX for the stub's scope, by the same hash
const scopeTag = (s) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
};
const SCOPE = `${ORIGIN}/`;
const PFX = `ob-sws-${scopeTag(SCOPE)}-`;
const OLDER = `${PFX}older`, NEWER = `${PFX}newer`;
const LANES = 6, CHUNK = 12, BOOT_N = 7, FILL_N = 30; // BOOT_N > LANES: the first install batch is boot entries, as in the tree

// ---- synthetic manifest ------------------------------------------------------
const BODIES = new Map();
const entry = (rel, i) => {
  const body = Buffer.from(`/* ${rel} */\n${'x'.repeat(200 + i * 7)}\n`);
  const sha = crypto.createHash('sha256').update(body).digest('hex').slice(0, 16);
  BODIES.set(new URL(rel, `${ORIGIN}/app.html`).href, body);
  return `  ['${rel}', '${sha}', ${body.length}],`;
};
const BOOT = Array.from({ length: BOOT_N }, (_, i) => entry(`./app/b${i}.js`, i));
const FILL = Array.from({ length: FILL_N }, (_, i) => entry(`./app/f${i}.js`, BOOT_N + i));
const TOTAL = BOOT_N + FILL_N;
const BOOT_HREFS = Array.from({ length: BOOT_N }, (_, i) => new URL(`./app/b${i}.js`, `${ORIGIN}/app.html`).href);

function prepare(src) {
  const a = src.match(/const PRECACHE = \[[\s\S]*?\n\];/g) || [];
  const b = src.match(/const PRECACHE_FILL = \[[\s\S]*?\n\];/g) || [];
  if (a.length !== 1 || b.length !== 1) return { invalid: `manifest arrays not found exactly once (PRECACHE ${a.length}, PRECACHE_FILL ${b.length})` };
  return { code: src.replace(a[0], `const PRECACHE = [\n${BOOT.join('\n')}\n];`).replace(b[0], `const PRECACHE_FILL = [\n${FILL.join('\n')}\n];`) };
}

// ---- one worker under a fake clock ------------------------------------------
// in-process web APIs for the worker: every body read and every digest is a
// tracked promise (resolved at once, or after a real-timer delay)
const toAB = (b) => {
  if (b == null) return new ArrayBuffer(0);
  if (b instanceof ArrayBuffer) return b.slice(0);
  const u = typeof b === 'string' ? Buffer.from(b) : Buffer.isBuffer(b) ? b : new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
  return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength);
};
function webApis(track, digestDelayMs) {
  class Headers {
    constructor(init) {
      this.m = new Map();
      const src = init instanceof Headers ? init.m.entries() : init ? Object.entries(init) : [];
      for (const [k, v] of src) this.m.set(String(k).toLowerCase(), String(v));
    }
    get(k) { return this.m.get(String(k).toLowerCase()) ?? null; }
    set(k, v) { this.m.set(String(k).toLowerCase(), String(v)); }
    has(k) { return this.m.has(String(k).toLowerCase()); }
    delete(k) { this.m.delete(String(k).toLowerCase()); }
  }
  class Response {
    constructor(body, init = {}) {
      this.ab = toAB(body); this.status = init.status ?? 200; this.statusText = init.statusText ?? '';
      this.ok = this.status >= 200 && this.status < 300; this.headers = new Headers(init.headers);
    }
    arrayBuffer() { return track(Promise.resolve(this.ab.slice(0))); }
    text() { return track(Promise.resolve(Buffer.from(this.ab).toString())); }
  }
  class Request {
    constructor(url, init = {}) { this.url = typeof url === 'string' ? url : url.url; this.cache = init.cache || 'default'; this.signal = init.signal || null; this.method = 'GET'; this.mode = init.mode || 'cors'; }
  }
  const later = () => (digestDelayMs ? new Promise((r) => setTimeout(r, digestDelayMs)) : Promise.resolve());
  const subtle = { digest: (alg, buf) => track(later().then(() => toAB(crypto.createHash('sha256').update(new Uint8Array(toAB(buf))).digest()))) };
  return { Headers, Response, Request, crypto: { subtle } };
}

function makeWorker(code, { fetchHoldMs = 0, holdFill = null, openFailAt = 0, hasFailAt = 0, deliverMs = 0, postThrows = false, keysGate = null, keysOrder = null, putGate = null, putThrowsFor = null, shared = null, digestDelayMs = Number(process.env.OB_FILLCTL_DIGEST_DELAY_MS || 0) } = {}) {
  let now = 0, seq = 0; const timers = [];
  const setT = (fn, ms = 0) => { const id = ++seq; timers.push({ id, at: now + Math.max(0, Math.floor(Number(ms) || 0)), fn }); return id; };
  const clearT = (id) => { const i = timers.findIndex((t) => t.id === id); if (i >= 0) timers.splice(i, 1); };
  // quiescence, not a tick count: one macrotask turn drains every microtask
  // chain; a TRACKED step still pending (a planted real-timer delay) is awaited
  // and the drain repeats, until a turn ends with nothing pending
  const pending = new Set();
  const track = (p) => { pending.add(p); p.then(() => pending.delete(p), () => pending.delete(p)); return p; };
  const tick = () => new Promise((r) => setImmediate(r));
  const flush = async () => {
    for (;;) {
      await tick();
      if (pending.size) { await Promise.allSettled([...pending]); continue; }
      await tick();
      if (!pending.size) return;
    }
  };
  const web = webApis(track, digestDelayMs);
  const { Response } = web;
  const advance = async (ms) => {
    const end = now + ms;
    for (;;) {
      await flush();
      timers.sort((x, y) => x.at - y.at || x.id - y.id);
      const t = timers[0];
      if (!t || t.at > end) break;
      timers.shift(); now = t.at; t.fn();
    }
    now = end; await flush();
  };
  const BASE = 1_800_000_000_000;
  class FakeDate extends Date { constructor(...a) { super(...(a.length ? a : [BASE + now])); } static now() { return BASE + now; } }

  const handlers = {}; const logs = []; const posts = [];
  const stats = { calls: 0, inflight: 0, maxInflight: 0, perUrl: new Map() };
  let opens = 0, hases = 0; const planted = { failed: false };
  const failOnce = () => { if (planted.failed) return false; planted.failed = true; return true; }; // ONE planted turn failure per scenario
  // a NAMED CacheStorage: open creates by name, delete removes the name (a held
  // Cache object stays usable but no name reaches it)
  // shared: a later life of the same origin (a worker restart) sees the same
  // CacheStorage and event log, and none of the earlier life's memory
  const named = shared ? shared.named : new Map(); const events = shared ? shared.events : []; let own = null;
  const mkCache = () => { const st = new Map(); return { st,
    keys: async () => [...st.keys()].map((url) => ({ url })),
    put: async (k) => {
      const u = typeof k === 'string' ? k : k.url;
      if (putThrowsFor === u) throw Object.assign(new Error('planted QuotaExceededError'), { name: 'QuotaExceededError' });
      if (putGate && putGate.url === u) await putGate.promise;
      st.set(u, true);
    },
    match: async (k) => (st.has(typeof k === 'string' ? k : k.url) ? new Response('cached') : undefined),
    delete: async (k) => st.delete(typeof k === 'string' ? k : k.url) }; };
  if (!shared) { const older = mkCache(); for (const u of BOOT_HREFS) older.st.set(u, true); named.set(OLDER, older); } // A: a real older snapshot
  // the browser side of a generation change: a name created (or re-created
  // empty, the code-cache write-back) by someone other than this worker
  const recreate = (name, urls = []) => { const c = mkCache(); for (const u of urls) c.st.set(u, true); named.set(name, c); events.push(`create ${name}`); return c; };
  let keysHold = keysGate; let keysCalls = 0, keysWhileHeld = 0; let delHold = null, delWhileHeld = 0; let matchHold = null;
  const holdMatch = (name) => { const g = gate(); const mh = { name, g, calls: 0 }; matchHold = mh;
    return { get calls() { return mh.calls; }, release: () => { matchHold = null; g.release(); } }; };
  const holdDeletes = () => { const g = gate(); delHold = g; return { release: () => { delHold = null; g.release(); } }; };
  // every caches.keys() call waits until release (counted while the hold is armed)
  const holdKeys = () => { const g = gate(); let armed = true; keysHold = { promise: g.promise, get armed() { return armed; } };
    return { release: () => { armed = false; g.release(); } }; };
  const caches = {
    open: async (name) => {
      opens++;
      if (openFailAt && opens === openFailAt && failOnce()) throw new Error(`planted caches.open failure #${opens}`);
      if (!named.has(name)) { named.set(name, mkCache()); events.push(`create ${name}`); }
      if (!own && name !== OLDER) own = name; // B's snapshot: the first name its code opens (SCOPE judges its prefix)
      return named.get(name);
    },
    has: async (name) => { hases++; if (hasFailAt && hases === hasFailAt && failOnce()) throw new Error(`planted caches.has failure #${hases}`); return named.has(name); },
    // names in creation order (an ordered map, like the spec's); keysOrder
    // 'reversed' stands in for an engine without that order
    keys: () => {
      keysCalls++;
      const held = keysHold; if (held && held.armed) keysWhileHeld++;
      return (held ? held.promise : Promise.resolve()).then(() => { const k = [...named.keys()]; return keysOrder === 'reversed' ? k.reverse() : k; });
    },
    // a held delete settles (and is logged) only at release
    delete: async (name) => { if (delHold) { delWhileHeld++; await delHold.promise; } events.push(`delete ${name}`); return named.delete(name); },
    // with cacheName: only that cache, and a missing name is undefined (never created)
    // a held match (holdMatch) answers what the cache held when it was CALLED,
    // after the release: a probe whose answer is stale by the time it lands
    match: async (k, o = {}) => {
      const u = typeof k === 'string' ? k : k.url;
      const list = o.cacheName !== undefined ? [named.get(o.cacheName)].filter(Boolean) : [...named.values()];
      const hit = list.some((c) => c.st.has(u));
      const mh = matchHold;
      if (mh && mh.name === o.cacheName) { mh.calls++; await mh.g.promise; }
      return hit ? new Response('cached') : undefined;
    },
  };
  const fetchStub = async (req) => {
    const url = typeof req === 'string' ? req : req.url;
    stats.calls++; stats.perUrl.set(url, (stats.perUrl.get(url) || 0) + 1);
    stats.inflight++; stats.maxInflight = Math.max(stats.maxInflight, stats.inflight);
    try {
      const isFill = !url.includes('/app/b') && (req.cache === 'force-cache' || req.cache === 'reload'); // the worker's own fill fetches
      if (isFill && holdFill) await holdFill.promise;
      if (fetchHoldMs) await new Promise((r) => setT(r, fetchHoldMs));
      const body = BODIES.get(url);
      return body ? new Response(body, { status: 200 }) : new Response('nf', { status: 404 });
    } finally { stats.inflight--; }
  };
  const dispatchMessage = (data, source = null) => {
    const waits = [];
    handlers.message?.({ data, source, waitUntil: (p) => waits.push(Promise.resolve(p).catch(() => {})) });
    return waits;
  };
  // a window client: what it is posted lands in `posts` with its id ('window'
  // = every window client, clients.matchAll)
  const client = (id) => ({ id, postMessage: (data) => posts.push({ to: id, data, inSnapshot: !!(own && named.get(own)?.st.has(data && data.url)) }) });
  const me = { state: 'activated' }; // self.serviceWorker
  const reg = { scope: SCOPE, installing: null, waiting: null,
    active: { postMessage: (m) => { if (postThrows) throw new Error('planted postMessage failure'); setT(() => dispatchMessage(m), deliverMs); } } };
  const self = {
    addEventListener: (k, f) => { handlers[k] = f; },
    location: { href: `${ORIGIN}/sw.js`, origin: ORIGIN },
    registration: reg,
    serviceWorker: me,
    clients: { matchAll: async () => [client('window')], claim: async () => {},
      get: async (id) => (id === 'c1' ? client('c1') : null) },
    skipWaiting: async () => {},
  };
  const out = (lvl) => (...a) => logs.push(`${lvl} ${a.map(String).join(' ')}`);
  const con = { log: out('log'), warn: out('warn'), error: out('error'), info: out('log') };
  new Function('self', 'caches', 'fetch', 'setTimeout', 'clearTimeout', 'console', 'Date', 'Request', 'Response', 'Headers', 'crypto', code)(
    self, caches, fetchStub, setT, clearT, con, FakeDate, web.Request, web.Response, web.Headers, web.crypto);
  const fire = (name, extra = {}) => {
    let p = null;
    handlers[name]?.({ ...extra, waitUntil: (x) => { p = Promise.resolve(x); } });
    return p;
  };
  const fetchEvent = (url, { mode, waits = [] } = {}) => {
    let answer = null;
    handlers.fetch?.({ request: new web.Request(url, { mode }), clientId: 'c1', respondWith: (p) => { answer = Promise.resolve(p); },
      waitUntil: (p) => { waits.push(Promise.resolve(p).catch(() => {})); } });
    return answer;
  };
  // a later life of an activated generation: its snapshot already holds `urls`
  const seed = (name, urls) => { recreate(name, urls); own = name; };
  const adopt = (name) => { own = name; }; // a restarted life: its snapshot exists already
  return { handlers, logs, stats, planted, advance, flush, fire, dispatchMessage, named, events, caches, posts, fetchEvent,
    reg, me, client, recreate, holdKeys, holdDeletes, holdMatch, seed, adopt, shared: { named, events }, get keysCalls() { return keysCalls; }, get keysWhileHeld() { return keysWhileHeld; },
    get delWhileHeld() { return delWhileHeld; },
    get own() { return own; }, get store() { return (own && named.get(own)?.st) || new Map(); }, get now() { return now; } };
}
const gate = () => { let release; const promise = new Promise((r) => { release = r; }); return { promise, release }; };
const settledFlag = (p) => { const s = { done: false, err: null }; if (p) p.then(() => { s.done = true; }, (e) => { s.done = true; s.err = e; }); return s; };
const fillLines = (logs, re) => logs.filter((l) => re.test(l));
const isComplete = (l) => /\[sw\] fill complete/.test(l);

let WOPTS = {}; // judge-wide worker options (the selftest's slow-digest determinism pass)
let STRICT = true; // false only while judging a plant: an interleaving a planted rule never reaches is not INVALID there
// a precondition another mechanism's rule decides: INVALID on the tree, a vacuous pass under a plant
const precondition = (why) => (STRICT ? { invalid: why } : { bad: [], vacuous: why });
async function installed(code, opts) {
  const w = makeWorker(code, { ...WOPTS, ...opts });
  const ip = settledFlag(w.fire('install'));
  for (let i = 0; i < 30 && !ip.done; i++) await w.advance(i ? 1000 : 0);
  if (!ip.done || ip.err || w.store.size !== BOOT_N) return { w, invalid: `install did not settle with ${BOOT_N} boot entries (done ${ip.done}, err ${ip.err && ip.err.message}, cached ${w.store.size})` };
  return { w };
}

// ---- RACE --------------------------------------------------------------------
async function race(code, order) {
  const keys = gate(), hold = gate();
  const { w, invalid } = await installed(code, { keysGate: keys, holdFill: hold });
  if (invalid) return { invalid };
  const act = settledFlag(w.fire('activate'));
  if (order === 'client-first') {
    w.dispatchMessage({ ob: 'fill', why: 'client' });
    await w.advance(0);
    if (w.stats.calls <= BOOT_N) return { invalid: 'client-first: the client kick did not start the first chunk before activate resumed' };
    keys.release();
  } else {
    keys.release();
    await w.advance(0);
    if (w.stats.calls <= BOOT_N) return { invalid: 'activate-first: the activate kick did not start the first chunk' };
    w.dispatchMessage({ ob: 'fill', why: 'client' });
  }
  await w.advance(0);
  const settledEarly = act.done;
  const cachedAtSettle = settledEarly ? w.store.size : null;
  hold.release();
  await w.advance(0);
  const line = fillLines(w.logs, /fill first turn inside activate/)[0] || null;
  const bad = [];
  if (settledEarly) bad.push(`activation settled with ${cachedAtSettle}/${TOTAL} cached while the first chunk was still in flight (want >= ${BOOT_N + CHUNK})`);
  if (!act.done) bad.push('activation never settled after the first chunk landed');
  if (!line) bad.push('no "fill first turn inside activate" line');
  return { bad, line, cachedAfter: w.store.size };
}

// ---- FAILED-TURN ---------------------------------------------------------------
async function failedTurn(code, via) {
  // the next turn's first CacheStorage call throws: caches.open #3 (install, turn 1,
  // turn 2) for a worker that opens per turn, caches.has #2 (turn 1, turn 2) for one
  // that holds its snapshot handle
  const planted = { openFailAt: 3, hasFailAt: 2 };
  const { w, invalid } = await installed(code, via === 'direct' ? { ...planted, postThrows: true } : planted);
  if (invalid) return { invalid };
  const act = settledFlag(w.fire('activate'));
  await w.advance(0);
  if (!act.done) return { invalid: 'activation did not settle' };
  await w.advance(10000);
  if (!w.planted.failed) return { invalid: `the planted turn failure never happened (${via})` };
  const premature = w.logs.find(isComplete) && w.store.size < TOTAL;
  const cachedAtFailure = w.store.size;
  w.dispatchMessage({ ob: 'fill', why: 'client' });
  await w.advance(30000);
  const bad = [];
  if (premature) bad.push(`"fill complete" was logged with ${cachedAtFailure}/${TOTAL} cached after a failed turn`);
  if (w.store.size !== TOTAL) bad.push(`a client kick after the failed turn did not finish the fill: ${w.store.size}/${TOTAL}`);
  if (!w.logs.some(isComplete)) bad.push('no "fill complete" line after the re-armed fill');
  return { bad, cachedAtFailure, cachedAfter: w.store.size };
}

// ---- LATE-TURN -----------------------------------------------------------------
async function lateTurn(code, deliverMs) {
  const { w, invalid } = await installed(code, { fetchHoldMs: 1000, deliverMs });
  if (invalid) return { invalid };
  w.fire('activate');
  await w.advance(120000);
  const dupes = [...w.stats.perUrl.entries()].filter(([, n]) => n > 1).length;
  const bad = [];
  if (w.stats.maxInflight > LANES) bad.push(`${w.stats.maxInflight} fetches in flight (law: <= ${LANES})`);
  if (dupes) bad.push(`${dupes} entries fetched twice`);
  if (w.store.size !== TOTAL) bad.push(`fill incomplete: ${w.store.size}/${TOTAL}`);
  return { bad, maxInflight: w.stats.maxInflight, dupes, cachedAfter: w.store.size };
}

// ---- JOIN-SIGNAL ---------------------------------------------------------------------
async function joinSignal(code, mode) {
  const target = new URL('./app/f20.js', `${ORIGIN}/app.html`).href; // a fill entry the fill has not reached
  const g = gate();
  const { w, invalid } = await installed(code, mode === 'write' ? { putGate: { url: target, promise: g.promise } } : { putThrowsFor: target });
  if (invalid) return { invalid };
  const ans = w.fetchEvent(target);
  if (!ans) return { invalid: 'the fetch handler did not answer the fill miss' };
  // the answer is OBSERVED, never awaited (review r1 P2 on 921ff128): with the
  // write held, an answer that waits for storage stays pending — a named red,
  // not a hang — and the gate is released afterwards either way (cleanup)
  const answered = settledFlag(ans); let res = null;
  ans.then((r) => { res = r; }, () => {});
  await w.flush();
  const joins = () => w.posts.filter((p) => p.data && p.data.ob === 'snapshot-joined' && p.data.url === target);
  const bad = [];
  const answerLaw = (when) => {
    if (!answered.done) bad.push(`the fill-miss answer waited for the snapshot write (still pending ${when})`);
    else if (answered.err) bad.push(`the fill-miss answer rejected ${when}: ${answered.err.message}`);
    else if (!res || res.status !== 200) bad.push(`the fill miss was answered ${res && res.status} ${when}, not 200`);
  };
  if (mode === 'write') {
    const early = joins().length;
    const answeredWhileHeld = answered.done && !answered.err;
    answerLaw('while the write was held');
    g.release(); await w.flush();
    const all = joins();
    if (early) bad.push(`snapshot-joined reached the client before the copy was written (${early} signal(s) while the write was held)`);
    if (!all.length) bad.push('no snapshot-joined signal after the write settled');
    else if (all.some((p) => !p.inSnapshot)) bad.push('snapshot-joined arrived while the copy was not in the snapshot');
    if (all.length > 1) bad.push(`${all.length} snapshot-joined signals for one write`);
    return { bad, signals: all.length, early, answeredWhileHeld };
  }
  answerLaw('after a failing write');
  if (joins().length) bad.push(`snapshot-joined was posted although the write failed (${joins().length})`);
  return { bad, signals: joins().length };
}

// ---- RETIRED-GENERATION ----------------------------------------------------------
async function retired(code, doDelete) {
  const { w, invalid } = await installed(code, { fetchHoldMs: 1000 });
  if (invalid) return { invalid };
  const name = w.own;
  if (!name) return { invalid: 'the worker never opened its own generation cache' };
  w.fire('activate');
  await w.advance(1500); // mid-fill: the first chunk's fetches are held 1 s each
  if (w.stats.calls <= BOOT_N) return { invalid: 'the fill had not started when the next generation activated' };
  const callsAtDelete = w.stats.calls;
  if (doDelete) await w.caches.delete(name); // the next generation's activate
  await w.advance(120000);
  const recreated = doDelete && w.named.has(name);
  const after = w.stats.calls - callsAtDelete;
  const bad = [];
  if (doDelete) {
    if (recreated) bad.push(`the retired generation re-created its deleted cache (${w.events.filter((e) => e.endsWith(name)).map((e) => e.split(' ')[0]).join(' → ')})`);
    if (after > CHUNK) bad.push(`the retired generation kept filling: ${after} fetches after its cache was deleted (want <= ${CHUNK}, the chunk in flight)`);
  } else if (w.store.size !== TOTAL) bad.push(`the undisturbed fill did not complete: ${w.store.size}/${TOTAL}`);
  return { bad, fetchesAfterDelete: doDelete ? after : 0, recreated, cachedAfter: w.store.size };
}

// a later life whose FIRST caches.open fails once (kernel's review on 6ba078ba:
// a rejected open must not be kept): the next kick opens again and finishes
async function failedFirstOpen(code) {
  const version = (code.match(/const VERSION = '([^']+)';/) || [])[1];
  if (!version) return { invalid: 'no VERSION line in sw.js' };
  const w = makeWorker(code, { ...WOPTS, openFailAt: 1 });
  w.seed(`${PFX}${version}`, BOOT_HREFS);
  w.dispatchMessage({ ob: 'fill', why: 'client' });
  await w.advance(10000);
  if (!w.planted.failed) return { invalid: 'the planted first-open failure never happened' };
  const cachedAtFailure = w.store.size;
  w.dispatchMessage({ ob: 'fill', why: 'client' });
  await w.advance(60000);
  const bad = [];
  if (w.store.size !== TOTAL) bad.push(`a later kick never recovered from one failed caches.open: ${w.store.size}/${TOTAL} (the rejected open was kept)`);
  return { bad, cachedAtFailure, cachedAfter: w.store.size };
}

// after the next generation deleted this snapshot, a fetch (subresource and
// navigation) answers from the held handle and never re-creates the name
async function retiredFetch(code) {
  const { w, invalid } = await installed(code);
  if (invalid) return { invalid };
  const name = w.own;
  await w.caches.delete(name); // the next generation's activate
  const sub = w.fetchEvent(BOOT_HREFS[0]);
  const nav = w.fetchEvent(BOOT_HREFS[1], { mode: 'navigate' });
  if (!sub || !nav) return { invalid: 'the fetch handler did not answer' };
  const st = [sub, nav].map(settledFlag);
  await w.advance(30000);
  const bad = [];
  if (w.named.has(name)) bad.push(`a fetch after the delete re-created the retired generation's cache (${w.events.filter((e) => e.endsWith(name)).map((e) => e.split(' ')[0]).join(' → ')})`);
  if (st.some((x) => !x.done || x.err)) bad.push('a fetch after the delete was not answered');
  return { bad, recreated: w.named.has(name) };
}

// ---- stale generations (GH-1039 race 2, the browser re-creator; #1162) ---------------
// The worker under test is generation B; OLDER (A) exists before B
// installs. The browser side of each order is staged on the named stub:
// recreate() is a by-name open from outside the worker (Chrome's code-cache
// write-back re-creates a deleted name EMPTY), w.reg.installing / waiting a
// newer worker C. Every real generation's snapshot holds the first boot entry
// (PRECACHE[0], app.html in the tree), so the newer caches below do too.
const NAV = () => BOOT_HREFS[0];
const NEWGEN = () => [BOOT_HREFS[0], ...['c0', 'c1', 'c2'].map((n) => `${ORIGIN}/app/${n}.js`)];
const entriesOf = (w, name) => [...(w.named.get(name)?.st.keys() || [])].sort().join('|');
const sameAs = (w, name, urls) => entriesOf(w, name) === urls.slice().sort().join('|');
const evOf = (w, name) => w.events.filter((e) => e.endsWith(` ${name}`)).map((e) => e.split(' ')[0]).join(' → ') || 'none';
async function activated(code, opts = {}, before = null) {
  const r = await installed(code, opts);
  if (r.invalid) return r;
  const { w } = r;
  if (before) before(w);
  const act = settledFlag(w.fire('activate'));
  for (let i = 0; i < 30 && !act.done; i++) await w.advance(i ? 1000 : 0);
  if (!act.done || act.err) return { invalid: `activation did not settle (${act.err && act.err.message})` };
  return { w };
}
const ask = (w, id, to = 'page') => w.dispatchMessage({ ob: 'fill', why: 'client', id }, w.client(to));

// STALE-SWEEP: activate deletes A; when A comes back empty by name, the next
// sweep point removes it — a client's {ob:'fill'}, a navigation, the fill's
// end (message turns and the direct loop)
async function staleSweep(code, via) {
  if (via === 'activate') {
    const hold = gate();
    const { w, invalid } = await installed(code, { holdFill: hold });
    if (invalid) return { invalid };
    w.fire('activate');
    await w.advance(0); // the first chunk is held: no fill end can sweep yet
    const bad = [];
    if (w.named.has(OLDER)) bad.push(`activate did not delete the older generation (${evOf(w, OLDER)})`);
    hold.release(); await w.advance(120000);
    return { bad, older: evOf(w, OLDER) };
  }
  const fillEnd = via.startsWith('fill end');
  const { w, invalid } = await activated(code, fillEnd ? { fetchHoldMs: 1000, postThrows: via === 'fill end (direct loop)' } : {});
  if (invalid) return { invalid };
  if (fillEnd) {
    if (w.store.size >= TOTAL || w.logs.some(isComplete)) return { invalid: 'the fill was already complete when A came back' };
  } else {
    await w.advance(120000);
    if (w.store.size !== TOTAL) return { invalid: `the fill did not complete before A came back: ${w.store.size}/${TOTAL}` };
  }
  if (!w.named.has(OLDER)) w.recreate(OLDER);
  if (via === 'client') ask(w, 's1');
  else if (via === 'navigation') { if (!w.fetchEvent(NAV(), { mode: 'navigate' })) return { invalid: 'no navigation answer' }; }
  await w.advance(fillEnd ? 120000 : 3000);
  if (fillEnd && !w.logs.some(isComplete)) return { invalid: 'the fill never completed' };
  if (via === 'fill end (direct loop)' && !w.logs.some((l) => /fill complete \(direct loop/.test(l))) return { invalid: 'the fill did not end on the direct loop' };
  const bad = [];
  if (w.named.has(OLDER)) bad.push(`the re-created ${OLDER} survived the ${via} sweep (${evOf(w, OLDER)})`);
  return { bad, older: evOf(w, OLDER) };
}

// STALE-SWEEP after a restart (review P2 on e2f8ed51): A comes back after B's
// worker was stopped and started again (the browser stops idle workers); the
// fresh life (same CacheStorage, no memory of the delete) still removes it
async function staleAfterRestart(code, via) {
  const { w, invalid } = await activated(code);
  if (invalid) return { invalid };
  await w.advance(120000);
  if (w.store.size !== TOTAL) return { invalid: `the fill did not complete: ${w.store.size}/${TOTAL}` };
  const mine = w.own;
  w.recreate(OLDER);
  const w2 = makeWorker(code, { ...WOPTS, shared: w.shared }); // the restarted life
  w2.adopt(mine);
  if (via === 'client') w2.dispatchMessage({ ob: 'fill', why: 'client', id: 'r1' }, w2.client('page'));
  else if (!w2.fetchEvent(NAV(), { mode: 'navigate' })) return { invalid: 'no navigation answer in the restarted life' };
  await w2.advance(30000);
  const bad = [];
  if (w2.named.has(OLDER)) bad.push(`the re-created ${OLDER} survived the restarted life's ${via} sweep (${evOf(w2, OLDER)})`);
  if (!w2.named.has(mine)) bad.push("the restarted life's sweep deleted its own snapshot");
  return { bad, older: evOf(w2, OLDER) };
}

// SWEPT-SIGNAL: every sweep posts {ob:'swept'} once it SETTLED — to the asking
// client with its id (removed, nothing to remove, deferred alike), else to
// every window client (activate, fill end)
async function sweptSignal(code) {
  const { w, invalid } = await activated(code);
  if (invalid) return { invalid };
  await w.advance(120000);
  if (w.store.size !== TOTAL) return { invalid: `the fill did not complete: ${w.store.size}/${TOTAL}` };
  const swept = (to, f = () => true) => w.posts.filter((p) => p.to === to && p.data && p.data.ob === 'swept' && f(p.data)).map((p) => p.data);
  const bad = [];
  const act = swept('window', (d) => d.why === 'activate');
  if (act.length !== 1 || act[0].removed !== 1) bad.push(`activate: ${JSON.stringify(act)} (want one broadcast, removed 1)`);
  if (!swept('window', (d) => d.why === 'fill end').length) bad.push('the fill-end sweep posted nothing');
  // one answer per ask, its id echoed, and `removed` = the deletes that sweep
  // made (what the sweep decides is judged by the mechanisms above, not here)
  const answer = async (id, stage, holdDel = false) => {
    const ev0 = w.events.length;
    const dh = holdDel ? w.holdDeletes() : null;
    ask(w, id, id);
    if (dh) {
      await w.advance(0);
      if (swept(id).length && w.delWhileHeld) bad.push(`${stage}: answered while its delete was still pending`);
      dh.release();
    }
    await w.advance(3000);
    const got = swept(id);
    const deletes = w.events.slice(ev0).filter((e) => e.startsWith('delete ')).length;
    if (got.length !== 1 || got[0].id !== id || got[0].removed !== deletes) bad.push(`${stage}: ${got.length} answer(s) ${JSON.stringify(got)} for ${deletes} delete(s)`);
    return got[0] || null;
  };
  w.recreate(OLDER);
  const a1 = await answer('a1', 'a re-created name', true);
  const a2 = await answer('a2', 'nothing to remove');
  w.recreate(OLDER); w.reg.installing = { state: 'installing' };
  const a3 = await answer('a3', 'a worker installing');
  w.reg.installing = null;
  return { bad, answers: [a1, a2, a3].map((d) => (d ? `removed ${d.removed}${d.deferred ? ' (deferred)' : ''}` : 'none')).join(', ') };
}

// ANSWER-PATH: the sweep rides the event's waitUntil, never its answer: with
// the sweep's caches.keys() held, the navigation is answered and the event
// (navigation, client ask) still holds a pending waitUntil, which settles at release
async function answerPath(code, via) {
  const { w, invalid } = await activated(code);
  if (invalid) return { invalid };
  await w.advance(120000); // the fill is complete: its kick is a settled promise, the sweep is the only pending work
  w.recreate(OLDER);
  const hold = w.holdKeys();
  const waits = []; let ans = null;
  if (via === 'navigation') ans = w.fetchEvent(NAV(), { mode: 'navigate', waits });
  else waits.push(...ask(w, 'p1'));
  if (via === 'navigation' && !ans) { hold.release(); return { invalid: 'no navigation answer' }; }
  const answered = settledFlag(ans); let res = null;
  if (ans) ans.then((r) => { res = r; }, () => {});
  const st = waits.map(settledFlag);
  await w.flush();
  const bad = [];
  if (via === 'navigation') {
    if (!answered.done) bad.push("the navigation answer waited for the stale sweep's caches.keys() (pending while keys() was held)");
    else if (answered.err || !res || res.status !== 200) bad.push(`the navigation was answered ${answered.err ? answered.err.message : res && res.status}`);
  }
  const heldBy = st.filter((x) => !x.done).length;
  if (!heldBy) bad.push(`no ${via} waitUntil was pending while the sweep's keys() was held (the sweep is not extended by the event)`);
  const keysHeld = w.keysWhileHeld;
  hold.release();
  await w.advance(3000);
  if (st.some((x) => !x.done)) bad.push(`a ${via} waitUntil never settled after the release`);
  return { bad, keysCallsWhileHeld: keysHeld, waitsPendingWhileHeld: heldBy };
}

// INSTALLING-SKIP (#1162): nothing is swept while a worker installs or waits
async function installingSkip(code, variant) {
  const C = NEWGEN();
  const revert = variant.startsWith('revert deploy');
  const unordered = variant.startsWith('keys() unordered');
  const rollback = variant.startsWith('a rollback starts');
  const second = variant === 'a rollback starts under the second name while its probe is pending';
  const before = revert || rollback ? null : (w) => { w.recreate(NEWER, C); w.reg.installing = { state: 'installing' }; };
  const { w, invalid } = await activated(code, unordered ? { keysOrder: 'reversed' } : {}, before);
  if (invalid) return { invalid };
  await w.advance(120000);
  const bad = [];
  if (rollback) {
    if (w.named.has(OLDER)) return { invalid: `activate did not delete the older generation (${evOf(w, OLDER)})` };
    // review P2 on e2f8ed51: B's sweep probes the empty re-created A; a revert
    // deploy's install starts under A's name and fills it (the same cache)
    // while the probe is pending, and the probe then answers its stale "empty"
    // second: two re-created names; the first goes after a fresh guard read,
    // the rollback starts under the second while ITS probe is pending
    const target = second ? `${PFX}older2` : OLDER;
    w.recreate(OLDER);
    if (second) w.recreate(target);
    const mh = w.holdMatch(target);
    ask(w, 'k1');
    await w.advance(0);
    // a worker that decides without probing (a planted rule elsewhere) never
    // meets this interleaving: the rollback then starts after its sweep
    const probed = mh.calls > 0;
    const sweeps = w.posts.some((p) => p.to === 'page' && p.data && p.data.ob === 'swept'); // a worker without re-sweeps never answers
    if (!probed && sweeps && STRICT) { mh.release(); return { invalid: 'the sweep answered without probing the re-created name' }; }
    w.reg.installing = { state: 'installing' };
    const inst = w.named.get(target) || w.recreate(target); // the installer opens the name: the same cache, or a new one
    for (const u of C) inst.st.set(u, true);
    mh.release();
    await w.advance(3000);
    if (!sameAs(w, target, C)) bad.push(`the rollback's install cache (${target}) was deleted after its probe answered stale (${evOf(w, target)})`);
    if (second && w.named.has(OLDER)) return precondition(`the first re-created name survived the sweep (${evOf(w, OLDER)})`);
    return { bad, probed, swept: sweeps, target: evOf(w, target) };
  }
  if (revert) {
    // a revert of A's tree: same VERSION, so A's cache name comes back WITH its install's entries
    if (w.named.has(OLDER)) return { invalid: `activate did not delete the older generation (${evOf(w, OLDER)})` };
    w.recreate(OLDER, C);
    if (variant === 'revert deploy waiting') w.reg.waiting = { state: 'installed' }; else w.reg.installing = { state: 'installing' };
    ask(w, 'k1'); w.fetchEvent(NAV(), { mode: 'navigate' });
    await w.advance(3000);
    if (!sameAs(w, OLDER, C)) bad.push(`the revert deploy's cache (A's name, re-used) was deleted while its worker was ${variant === 'revert deploy waiting' ? 'waiting' : 'installing'} (${evOf(w, OLDER)})`);
    return { bad, older: evOf(w, OLDER) };
  }
  // keys() unordered lists C BEFORE B: only the skip keeps it, installing and then waiting (installed)
  if (variant === 'keys() unordered, C waiting') { w.reg.installing = null; w.reg.waiting = { state: 'installed' }; }
  ask(w, 'k1'); w.fetchEvent(NAV(), { mode: 'navigate' });
  await w.advance(3000);
  if (!sameAs(w, NEWER, C)) bad.push(`C's install cache was deleted while C ${w.reg.waiting ? 'waited' : 'installed'} (${evOf(w, NEWER)})`);
  if (variant === 'installing at activate') {
    if (!w.named.has(OLDER)) bad.push(`A was swept while C installed (${evOf(w, OLDER)})`);
    w.reg.installing = null; // C's install failed: it is gone
    ask(w, 'k2');
    await w.advance(3000);
    if (w.named.has(OLDER)) bad.push(`A survived the first sweep after C was gone (${evOf(w, OLDER)})`);
  }
  return { bad, newer: evOf(w, NEWER), older: evOf(w, OLDER) };
}

// OLDER-ONLY: after activate, a newer generation's cache is never this
// worker's to delete, nothing installing or waiting: a failed install kept
// for its resume, and a revert deploy's cache under A's re-used name once
// its worker stopped installing (failed) or took over (B still in its life)
async function olderOnly(code, variant) {
  // 'only a later first-batch entry': the install landed something of its
  // first batch, not PRECACHE[0] (its fetch failed or was still in flight)
  const C = variant === 'failed install holding only a later first-batch entry' ? [BOOT_HREFS[LANES - 1], ...NEWGEN().slice(1)] : NEWGEN();
  const { w, invalid } = await activated(code);
  if (invalid) return { invalid };
  await w.advance(120000);
  const name = variant.startsWith('failed install') ? NEWER : OLDER;
  if (name === OLDER && w.named.has(OLDER)) return { invalid: `activate did not delete the older generation (${evOf(w, OLDER)})` };
  w.recreate(name, C);
  ask(w, 'o1'); w.fetchEvent(NAV(), { mode: 'navigate' });
  await w.advance(3000);
  const bad = [];
  if (!sameAs(w, name, C)) bad.push(`a newer generation's cache (${variant}) was deleted (${evOf(w, name)})`);
  return { bad, cache: evOf(w, name) };
}

// RETIRED-SWEEPER: after C activated (B's snapshot deleted; C's created after
// B's), B still finishing events deletes nothing — also when the browser
// re-created B's name empty (keys() then lists C BEFORE B's name)
async function retiredSweeper(code, variant) {
  const C = NEWGEN();
  if (variant === 'a revert deploy took over while the guard was pending') return retiredTakeover(code);
  if (variant === 'retired by its fill, its name re-used holding the batch') return retiredByFill(code);
  const { w, invalid } = await activated(code);
  if (invalid) return { invalid };
  await w.advance(120000);
  const mine = w.own;
  w.recreate(NEWER, C); await w.caches.delete(mine); await w.caches.delete(OLDER);
  if (variant === 're-created empty') w.recreate(mine);
  ask(w, 'r1'); w.fetchEvent(NAV(), { mode: 'navigate' });
  await w.advance(3000);
  const bad = [];
  if (!sameAs(w, NEWER, C)) bad.push(`a retired worker deleted the newer generation's snapshot (${variant}: ${evOf(w, NEWER)})`);
  return { bad, newer: evOf(w, NEWER) };
}

// a revert deploy A' (A's VERSION) resumed into A's surviving cache (listed
// BEFORE B's) and takes over while B's sweep awaits its guard probe: B is
// redundant by the time the guard reads, so A's name (now A''s active
// snapshot) stays
async function retiredTakeover(code) {
  const C = NEWGEN();
  const { w, invalid } = await activated(code, {}, (w) => { w.reg.installing = { state: 'installing' }; }); // A survives B's activate
  if (invalid) return { invalid };
  await w.advance(120000);
  if (!w.named.has(OLDER)) return precondition('A did not survive the deferred activate');
  for (const u of C) w.named.get(OLDER).st.set(u, true); // A' resumes into A's cache
  w.reg.installing = null; w.reg.waiting = { state: 'installed' };
  const mh = w.holdMatch(w.own); // the guard's probe of B's own snapshot
  ask(w, 't1');
  await w.advance(0);
  const probed = mh.calls > 0;
  if (!probed && STRICT) { mh.release(); return { invalid: "the sweep never reached its guard's probe" }; }
  w.reg.waiting = null; w.reg.active = { state: 'activated' }; w.me.state = 'redundant'; // A' took over
  mh.release();
  await w.advance(3000);
  const bad = [];
  if (!w.named.has(OLDER)) bad.push(`a replaced worker deleted the new active generation's snapshot (A's re-used name: ${evOf(w, OLDER)})`);
  return { bad, probed, older: evOf(w, OLDER) };
}

// B's fill noticed its snapshot deleted (retired), then a revert deploy B'
// re-used B's name and failed holding the batch: keys() lists C before it,
// and only the retired flag keeps B from sweeping C
async function retiredByFill(code) {
  const C = NEWGEN();
  const { w, invalid } = await activated(code, { fetchHoldMs: 1000 });
  if (invalid) return { invalid };
  const mine = w.own;
  w.recreate(NEWER, C); await w.caches.delete(mine); // C activated mid-fill
  await w.advance(120000);
  if (!w.logs.some((l) => /fill stopped/.test(l))) return precondition('the fill never noticed its snapshot deleted');
  w.recreate(mine, BOOT_HREFS); // B''s failed install, under B's name
  ask(w, 'r2'); w.fetchEvent(NAV(), { mode: 'navigate' });
  await w.advance(3000);
  const bad = [];
  if (!sameAs(w, NEWER, C)) bad.push(`a retired worker deleted the newer generation's snapshot (${evOf(w, NEWER)})`);
  return { bad, newer: evOf(w, NEWER) };
}

// RUNNING-SNAPSHOT: no sweep ever deletes or changes this generation's snapshot
async function runningSnapshot(code) {
  const { w, invalid } = await activated(code, { fetchHoldMs: 1000 });
  if (invalid) return { invalid };
  const mine = w.own;
  await w.advance(120000);
  const want = entriesOf(w, mine);
  w.recreate(OLDER);
  ask(w, 'n1'); w.fetchEvent(NAV(), { mode: 'navigate' });
  await w.advance(3000);
  const bad = [];
  if (w.events.includes(`delete ${mine}`)) bad.push(`a sweep deleted this generation's snapshot (${evOf(w, mine)})`);
  else if (entriesOf(w, mine) !== want) bad.push("the running snapshot's entries changed across the sweeps");
  return { bad, own: evOf(w, mine), cachedAfter: w.store.size };
}

// SCOPE (#1169): another registration of the app on this origin keeps its snapshots. Its full snapshot predates B's
// (the usual order: keys() lists it first, so the older rule would take it) and its empty name comes after B's (the
// newer-name probe would take it). Both survive B's activate and each later sweep point. The activate via holds the
// first fill chunk, so no fill end can stand in for the activate sweep; B's own older generation (A) going at activate
// is its control. The later vias hold every fetch 1 s, so they check both names right after activate (the fill still
// pending), after the fill end, and after their own sweep: a red names its sweep.
const OTHER = `ob-sws-${scopeTag(`${ORIGIN}/web/`)}-`;
// keys() lists `name` before B's snapshot (B's snapshot moved to the end of the creation order)
const olderThanMine = (x, name) => { const mine = x.named.get(x.own); x.named.delete(x.own); x.named.set(x.own, mine); return name; };
async function otherScope(code, via) {
  const full = `${OTHER}0.1.0+other`, empty = `${OTHER}0.1.0+other-empty`;
  const stage = (x) => { x.recreate(full, BOOT_HREFS); olderThanMine(x, full); x.recreate(empty); };
  const lost = (w) => [[full, 'snapshot'], [empty, 'empty name']].filter(([n]) => !w.named.has(n));
  const bad = [];
  if (via === 'activate') {
    const hold = gate();
    const { w, invalid } = await installed(code, { holdFill: hold });
    if (invalid) return { invalid };
    stage(w);
    w.fire('activate');
    await w.advance(0); // the first chunk is held: no fill end can sweep yet
    if (w.named.has(OLDER)) bad.push(`activate did not delete B's own older generation (${evOf(w, OLDER)})`);
    for (const [n, what] of lost(w)) bad.push(`B's activate deleted another scope's ${what} (${evOf(w, n)})`);
    hold.release(); await w.advance(120000);
    return { bad, other: evOf(w, full), otherEmpty: evOf(w, empty) };
  }
  const { w, invalid } = await activated(code, { fetchHoldMs: 1000 }, stage);
  if (invalid) return { invalid };
  if (w.store.size >= TOTAL || w.logs.some(isComplete)) return { invalid: 'the fill was already complete after activate' };
  for (const [n, what] of lost(w)) bad.push(`B's activate deleted another scope's ${what} (${evOf(w, n)})`);
  if (bad.length) return { bad };
  await w.advance(120000);
  if (!w.logs.some(isComplete) || w.store.size !== TOTAL) return { invalid: `the fill did not complete: ${w.store.size}/${TOTAL}` };
  for (const [n, what] of lost(w)) bad.push(`B's fill end deleted another scope's ${what} (${evOf(w, n)})`);
  if (bad.length || via === 'fill end') return { bad, other: evOf(w, full), otherEmpty: evOf(w, empty) };
  if (via === 'client') ask(w, 'o1');
  else if (!w.fetchEvent(NAV(), { mode: 'navigate' })) return { invalid: 'no navigation answer' };
  await w.advance(3000);
  for (const [n, what] of lost(w)) bad.push(`B's ${via} sweep deleted another scope's ${what} (${evOf(w, n)})`);
  return { bad, other: evOf(w, full), otherEmpty: evOf(w, empty) };
}

// SCOPE (#1169, prefix amendment 25b21850): B's snapshot is named under this scope's prefix, ob-sws-<8-hex hash of the
// scope>-. Every worker from before scope tags sweeps every other name that starts with 'ob-sw-' as its own generation
// (`if (!n.startsWith('ob-sw-') || n === CACHE) continue;`), so a registration still running one would delete a
// snapshot named that way at each of its sweeps; 'ob-sws-' falls outside that filter.
const PRE_SCOPE_SWEEPS = (n) => n.startsWith('ob-sw-');
async function ownName(code) {
  const version = (code.match(/const VERSION = '([^']+)';/) || [])[1];
  if (!version) return { invalid: 'no VERSION line in sw.js' };
  const { w, invalid } = await activated(code);
  if (invalid) return { invalid };
  const bad = [];
  if (w.own !== `${PFX}${version}`) bad.push(`B's snapshot ${w.own} is not ${PFX}${version} (this scope's prefix + VERSION)`);
  if (PRE_SCOPE_SWEEPS(w.own)) bad.push(`B's snapshot ${w.own} starts with 'ob-sw-': a registration still running a worker from before scope tags sweeps it as its own generation`);
  return { bad, own: w.own };
}

// PRE-SCOPE (#1169, ruling ab9466c0): no sweep deletes a name from before scope tags or any entry of it. B's own
// previous generation, holding B's boot set, survives B's activate whole (checked with the fill still pending); a
// pre-scope name that came back after the take-over survives the client and navigation sweeps: a full copy another
// registration's pre-scope worker wrote (the nested /web/: a copy holding B's first batch would be kept by the
// newer-generation probe under any rule) or an empty one (an old page's code-cache write-back re-created it by name).
const PRE = 'ob-sw-0.1.0+15210514_rules-0.1.10+72a839f6_tree-600d26e9';
const OTHER_BOOT = BOOT_HREFS.map((u) => u.replace(`${ORIGIN}/`, `${ORIGIN}/web/`)); // the nested /web/ registration's
const count = (w, name) => w.named.get(name)?.st.size ?? 0;
async function preScopeName(code, via) {
  const { w, invalid } = await activated(code, via === 'activate' ? { fetchHoldMs: 1000 } : {}, (x) => x.recreate(PRE, BOOT_HREFS));
  if (invalid) return { invalid };
  const bad = [];
  if (via === 'activate') {
    if (w.store.size >= TOTAL || w.logs.some(isComplete)) return { invalid: 'the fill was already complete after activate' };
    if (!w.named.has(PRE)) bad.push(`B's activate deleted B's own pre-scope generation (${evOf(w, PRE)})`);
    else if (!sameAs(w, PRE, BOOT_HREFS)) bad.push(`B's activate changed B's pre-scope generation: ${count(w, PRE)} entries left of ${BOOT_HREFS.length}`);
    return { bad, pre: evOf(w, PRE) };
  }
  await w.advance(120000);
  if (w.store.size !== TOTAL) return { invalid: `the fill did not complete: ${w.store.size}/${TOTAL}` };
  w.recreate(PRE, via.endsWith('(empty)') ? [] : OTHER_BOOT); // another registration's full copy, or the write-back's empty name
  if (via.startsWith('client')) ask(w, 'p1');
  else if (!w.fetchEvent(NAV(), { mode: 'navigate' })) return { invalid: 'no navigation answer' };
  await w.advance(3000);
  if (!w.named.has(PRE)) bad.push(`a later ${via} sweep deleted a pre-scope name (${evOf(w, PRE)})`);
  return { bad, pre: evOf(w, PRE) };
}

// PRE-SCOPE (#1169): a pre-scope name holding ANOTHER scope's boot set (here the nested /web/: its URLs lie under B's
// root scope) is that registration's snapshot, maybe live. B's activate (checked with the fill still pending) and B's
// fill end leave it whole, and B's own pre-scope generation beside it too (ruling ab9466c0: no legacy delete of any
// kind).
const PRE_OTHER = 'ob-sw-0.1.0+15210514_rules-0.1.10+72a839f6_tree-0babe000';
async function preScopeOther(code) {
  const { w, invalid } = await activated(code, { fetchHoldMs: 1000 }, (x) => { x.recreate(PRE, BOOT_HREFS); x.recreate(PRE_OTHER, OTHER_BOOT); });
  if (invalid) return { invalid };
  if (w.store.size >= TOTAL || w.logs.some(isComplete)) return { invalid: 'the fill was already complete after activate' };
  const bad = [];
  const check = (at) => {
    if (!w.named.has(PRE)) bad.push(`B's ${at} deleted B's own pre-scope generation (${evOf(w, PRE)})`);
    if (!w.named.has(PRE_OTHER)) bad.push(`B's ${at} deleted another registration's pre-scope snapshot (${evOf(w, PRE_OTHER)})`);
    else if (!sameAs(w, PRE_OTHER, OTHER_BOOT)) bad.push(`B's ${at} took entries from another registration's pre-scope snapshot`);
  };
  check('activate');
  if (bad.length) return { bad, pre: evOf(w, PRE), other: evOf(w, PRE_OTHER) };
  await w.advance(120000);
  if (!w.logs.some(isComplete) || w.store.size !== TOTAL) return { invalid: `the fill did not complete: ${w.store.size}/${TOTAL}` };
  check('fill end');
  return { bad, pre: evOf(w, PRE), other: evOf(w, PRE_OTHER) };
}

// PRE-SCOPE (#1169): B's own pre-scope generation, older than B's snapshot (the upgrade's order) and holding B's boot
// set, that survived a DEFERRED activate (a newer worker installing at the take-over) stays until the next activate: no
// later sweep point deletes it, though the ordinary older rule would. The control: that sweep ran undeferred (its
// {ob:'swept'} answer, deferred null), read without the older rule.
async function preScopeDeferred(code, via) {
  const fillEnd = via === 'fill end';
  const { w, invalid } = await activated(code, fillEnd ? { fetchHoldMs: 1000 } : {}, (x) => {
    x.recreate(PRE, BOOT_HREFS); olderThanMine(x, PRE); x.reg.installing = { state: 'installing' };
  });
  if (invalid) return { invalid };
  if (!w.named.has(PRE) || !w.named.has(OLDER)) return precondition('the deferred activate deleted a name (its guard did not defer)');
  if (!fillEnd) {
    await w.advance(120000); // the fill ends while the newer worker installs: its sweep defers too
    if (w.store.size !== TOTAL) return { invalid: `the fill did not complete: ${w.store.size}/${TOTAL}` };
  } else if (w.store.size >= TOTAL || w.logs.some(isComplete)) return { invalid: 'the fill was already complete after activate' };
  w.reg.installing = null; // the newer install failed: nothing installs or waits now
  if (via === 'client') ask(w, 'd1');
  else if (via === 'navigation') { if (!w.fetchEvent(NAV(), { mode: 'navigate' })) return { invalid: 'no navigation answer' }; }
  await w.advance(fillEnd ? 120000 : 3000);
  if (fillEnd && !w.logs.some(isComplete)) return { invalid: 'the fill never completed' };
  if (!w.posts.some((p) => p.data && p.data.ob === 'swept' && p.data.why === via && p.data.deferred === null)) return precondition(`no undeferred ${via} sweep answered`);
  const bad = [];
  if (!w.named.has(PRE)) bad.push(`the ${via} sweep deleted a pre-scope generation that survived a deferred activate (${evOf(w, PRE)})`);
  return { bad, pre: evOf(w, PRE), older: evOf(w, OLDER) };
}

// PRE-SCOPE (#1169, ruling ab9466c0): a pre-scope cache is named by VERSION alone, so two registrations of one VERSION
// wrote into the same one. B's activate keeps every entry of it, B's and the other registration's, and the name (that
// registration may still run the pre-scope worker and boot offline from them; above-scope URLs resolve the same for
// both). The stub's B has the root scope, so the other registration's entries sit under another origin here.
const OTHER_REG = ['app.html', 'app/main.js', 'dist/pool-sdk/index.js'].map((p) => `http://127.0.0.1:2/forkb/${p}`);
async function preScopeShared(code) {
  const { w, invalid } = await activated(code, {}, (x) => x.recreate(PRE, [...BOOT_HREFS, ...OTHER_REG]));
  if (invalid) return { invalid };
  const bad = [];
  const st = w.named.get(PRE)?.st;
  if (!st) bad.push(`B's activate deleted a pre-scope cache another registration shares (${evOf(w, PRE)})`);
  else {
    const mine = BOOT_HREFS.filter((u) => st.has(u)), theirs = OTHER_REG.filter((u) => st.has(u));
    if (mine.length !== BOOT_HREFS.length) bad.push(`B's activate deleted ${BOOT_HREFS.length - mine.length} of B's own entries from the shared pre-scope cache`);
    if (theirs.length !== OTHER_REG.length) bad.push(`B's activate deleted ${OTHER_REG.length - theirs.length} of the other registration's entries`);
  }
  return { bad, pre: evOf(w, PRE) };
}

// ---- judge one sw.js text ----------------------------------------------------------
const MECHS = ['RACE', 'FAILED-TURN', 'LATE-TURN', 'RETIRED-GENERATION', 'JOIN-SIGNAL',
  'STALE-SWEEP', 'SWEPT-SIGNAL', 'ANSWER-PATH', 'INSTALLING-SKIP', 'OLDER-ONLY', 'RETIRED-SWEEPER', 'RUNNING-SNAPSHOT',
  'SCOPE', 'PRE-SCOPE'];
async function judge(src, say = console.log, wopts = {}) {
  WOPTS = wopts;
  try { return await judgeWith(src, say); } finally { WOPTS = {}; }
}
async function judgeWith(src, say) {
  const prep = prepare(src);
  if (prep.invalid) return { invalid: [prep.invalid], red: {} };
  const { code } = prep;
  const red = Object.fromEntries(MECHS.map((m) => [m, []])); const invalid = [];
  const run = async (mech, label, fn) => {
    const r = await fn();
    if (r.invalid) { invalid.push(`${mech} ${label}: ${r.invalid}`); say(`[fill-control] INVALID ${mech} ${label}: ${r.invalid}`); return; }
    const extra = Object.entries(r).filter(([k]) => k !== 'bad').map(([k, v]) => `${k} ${typeof v === 'string' ? JSON.stringify(v) : v}`).join(', ');
    if (r.bad.length) { red[mech].push(`${label}: ${r.bad.join('; ')}`); say(`[fill-control] FAIL ${mech} ${label}: ${r.bad.join('; ')} (${extra})`); }
    else say(`[fill-control] ok ${mech} ${label} (${extra})`);
  };
  await run('RACE', 'client-first', () => race(code, 'client-first'));
  await run('RACE', 'activate-first (control)', () => race(code, 'activate-first'));
  await run('FAILED-TURN', 'message turn', () => failedTurn(code, 'message'));
  await run('FAILED-TURN', 'direct loop', () => failedTurn(code, 'direct'));
  await run('FAILED-TURN', "a later life's first open fails once", () => failedFirstOpen(code));
  await run('LATE-TURN', 'turn message at 5 s', () => lateTurn(code, 5000));
  await run('LATE-TURN', 'turn message at 3.9 s (control)', () => lateTurn(code, 3900));
  await run('RETIRED-GENERATION', 'cache deleted mid-fill', () => retired(code, true));
  await run('RETIRED-GENERATION', 'no delete (control)', () => retired(code, false));
  await run('RETIRED-GENERATION', 'a fetch after the delete', () => retiredFetch(code));
  await run('JOIN-SIGNAL', 'after the write', () => joinSignal(code, 'write'));
  await run('JOIN-SIGNAL', 'store failure (no signal)', () => joinSignal(code, 'fail'));
  await run('STALE-SWEEP', 'activate deletes the older generation', () => staleSweep(code, 'activate'));
  for (const via of ['client', 'navigation', 'fill end', 'fill end (direct loop)']) await run('STALE-SWEEP', `re-created after the delete, swept at the ${via}`, () => staleSweep(code, via));
  for (const via of ['client', 'navigation']) await run('STALE-SWEEP', `re-created, then the worker restarted, swept at the ${via}`, () => staleAfterRestart(code, via));
  await run('SWEPT-SIGNAL', 'every sweep answers once settled', () => sweptSignal(code));
  for (const via of ['navigation', 'client ask']) await run('ANSWER-PATH', `the ${via} with keys() held`, () => answerPath(code, via));
  for (const v of ['installing at activate', 'a rollback starts while the probe is pending', 'a rollback starts under the second name while its probe is pending', 'revert deploy installing', 'revert deploy waiting', 'keys() unordered, C installing', 'keys() unordered, C waiting']) await run('INSTALLING-SKIP', v, () => installingSkip(code, v));
  for (const v of ['failed install', 'failed install holding only a later first-batch entry', 'revert deploy, its install failed or taking over']) await run('OLDER-ONLY', v, () => olderOnly(code, v));
  for (const v of ['name gone', 're-created empty', 'a revert deploy took over while the guard was pending', 'retired by its fill, its name re-used holding the batch']) await run('RETIRED-SWEEPER', v, () => retiredSweeper(code, v));
  await run('RUNNING-SNAPSHOT', 'every sweep point', () => runningSnapshot(code));
  await run('SCOPE', "B's snapshot is named under this scope's prefix, outside the pre-scope sweep filter", () => ownName(code));
  for (const via of ['activate', 'client', 'navigation', 'fill end']) await run('SCOPE', `another scope's names at B's ${via}`, () => otherScope(code, via));
  await run('PRE-SCOPE', "B's activate keeps B's own pre-scope generation whole", () => preScopeName(code, 'activate'));
  await run('PRE-SCOPE', "another registration's pre-scope snapshot survives B's activate and fill end", () => preScopeOther(code));
  await run('PRE-SCOPE', "a pre-scope cache another registration shares keeps every entry and its name at B's activate", () => preScopeShared(code));
  for (const via of ['client', 'navigation', 'client (empty)', 'navigation (empty)']) await run('PRE-SCOPE', `a pre-scope name back after the take-over survives the ${via} sweep`, () => preScopeName(code, via));
  for (const via of ['client', 'navigation', 'fill end']) await run('PRE-SCOPE', `a pre-scope generation that survived a deferred activate survives the ${via} sweep`, () => preScopeDeferred(code, via));
  return { invalid, red };
}

// ---- plants (selftest): each reverts ONE fix on the tree's sw.js --------------------
const PLANTS = [
  { mech: 'RACE', name: 'join reverted (the moved log kept)',
    old: 'if (fillKicked) return kickTurn || Promise.resolve();', new: 'if (fillKicked) return Promise.resolve();' },
  { mech: 'FAILED-TURN', name: 'a throwing turn counted as done',
    old: "try { left = await fillChunk(); } catch (e) { fillFailed('', e); return -1; }", new: 'left = await fillChunk().catch(() => 0);' },
  { mech: 'FAILED-TURN', name: 'a throwing direct-loop chunk counted as done',
    old: "try { left = await fillChunk(); } catch (e) { fillFailed('direct loop, ', e); return; }", new: 'left = await fillChunk().catch(() => 0);' },
  { mech: 'LATE-TURN', name: 'stale turn messages run again',
    old: '  if (fillDirect) return;\n  clearTimeout(turnTimer);', new: '  clearTimeout(turnTimer);' },
  { mech: 'RETIRED-GENERATION', name: 'the snapshot re-opened by name every turn',
    old: 'async function fillChunk() {\n  const cache = await openSnapshot();', new: 'async function fillChunk() {\n  const cache = await caches.open(CACHE);' },
  { mech: 'JOIN-SIGNAL', name: 'the answer waits for the snapshot write',
    old: '    event.waitUntil(cache.put(url.href, cleanCopy(res, buf.slice(0))).then(\n      () => notifyJoined(event.clientId, url.href),',
    new: '    await cache.put(url.href, cleanCopy(res, buf.slice(0)));\n    event.waitUntil(Promise.resolve().then(\n      () => notifyJoined(event.clientId, url.href),' },
  { mech: 'JOIN-SIGNAL', name: 'the signal posted before the write settles',
    old: '      () => notifyJoined(event.clientId, url.href),', new: '      (notifyJoined(event.clientId, url.href), () => {}),' },
  { mech: 'RETIRED-GENERATION', name: 'no stop once the snapshot is deleted',
    old: '  if (!(await caches.has(CACHE))) { retired = true; return 0; }\n', new: '  if (!(await caches.has(CACHE))) { /* plant: keep filling */ }\n' },
  // kernel's review on 6ba078ba: the two held-handle details no plant covered
  { mech: 'RETIRED-GENERATION', name: 'the fetch path re-opens the snapshot by name',
    old: '  event.respondWith((async () => {\n    const cache = await openSnapshot();\n    if (!heal) {', new: '  event.respondWith((async () => {\n    const cache = await caches.open(CACHE);\n    if (!heal) {' },
  { mech: 'FAILED-TURN', name: 'a rejected snapshot open is kept',
    old: 'snapshotP = caches.open(CACHE).catch((e) => { snapshotP = null; throw e; })', new: 'snapshotP = caches.open(CACHE)' },
  // GH-1039 race 2 (the browser re-creator) and #1162
  { mech: 'STALE-SWEEP', name: 'a re-created name is never recognised (the activate-time delete only)',
    old: '      if (!older && (await holdsBoot(n))) continue; // a newer generation\'s snapshot or resumable install',
    new: '      if (!older) continue;' },
  { mech: 'STALE-SWEEP', name: "the direct loop's fill end does not sweep",
    old: "  fillRest('direct loop, ');\n  if (!retired) await sweepStale('fill end');", new: "  fillRest('direct loop, ');" },
  { mech: 'INSTALLING-SKIP', name: 'the installing / waiting skip removed',
    old: "\n      : reg && (reg.installing || reg.waiting) ? 'a newer worker is installing or waiting' : null);", new: '\n      : null);' },
  { mech: 'INSTALLING-SKIP', name: 'the waiting half of the skip dropped',
    old: '(reg.installing || reg.waiting)', new: '(reg.installing)' },
  { mech: 'INSTALLING-SKIP', name: 'names before CACHE not older after activate',
    old: "      const older = why === 'activate' || i < mine;", new: "      const older = why === 'activate';" },
  { mech: 'INSTALLING-SKIP', name: 'the guard read once, before the first delete only',
    old: "    for (const [i, n] of names.entries()) {\n      if (n === CACHE || !n.startsWith(PREFIX)) continue; // this scope's generations only: never another scope's, never a pre-scope name (#1169)\n      const older = why === 'activate' || i < mine;\n      if (!older && (await holdsBoot(n))) continue; // a newer generation's snapshot or resumable install\n      held = await guard();",
    new: "    let guarded = false;\n    for (const [i, n] of names.entries()) {\n      if (n === CACHE || !n.startsWith(PREFIX)) continue; // this scope's generations only: never another scope's, never a pre-scope name (#1169)\n      const older = why === 'activate' || i < mine;\n      if (!older && (await holdsBoot(n))) continue; // a newer generation's snapshot or resumable install\n      if (!guarded) { held = await guard(); guarded = true; }" },
  { mech: 'INSTALLING-SKIP', name: 'the guard read once before the loop, not before each delete',
    old: "    for (const [i, n] of names.entries()) {\n      if (n === CACHE || !n.startsWith(PREFIX)) continue; // this scope's generations only: never another scope's, never a pre-scope name (#1169)\n      const older = why === 'activate' || i < mine;\n      if (!older && (await holdsBoot(n))) continue; // a newer generation's snapshot or resumable install\n      held = await guard();",
    new: "    const pre = await guard();\n    for (const [i, n] of names.entries()) {\n      if (n === CACHE || !n.startsWith(PREFIX)) continue; // this scope's generations only: never another scope's, never a pre-scope name (#1169)\n      const older = why === 'activate' || i < mine;\n      if (!older && (await holdsBoot(n))) continue; // a newer generation's snapshot or resumable install\n      held = pre;" },
  { mech: 'OLDER-ONLY', name: 'every other generation swept after activate (no older-only rule)',
    old: "      const older = why === 'activate' || i < mine;", new: '      const older = true;' },
  { mech: 'OLDER-ONLY', name: 'no re-creation probe (every newer name swept)',
    old: "      if (!older && (await holdsBoot(n))) continue; // a newer generation's snapshot or resumable install\n", new: '' },
  { mech: 'OLDER-ONLY', name: 'the probe checks only the first boot entry',
    old: 'for (const h of ALL_HREFS.slice(0, LANES))', new: 'for (const h of ALL_HREFS.slice(0, 1))' },
  { mech: 'RETIRED-SWEEPER', name: 'no retirement probe (a re-created empty name passes)',
    old: '!(await holdsBoot(CACHE)) || retired ||', new: 'retired ||' },
  { mech: 'RETIRED-SWEEPER', name: 'a redundant worker still sweeps',
    old: " || (me && me.state === 'redundant')", new: '' },
  { mech: 'RETIRED-SWEEPER', name: 'the retired flag ignored',
    old: '!(await holdsBoot(CACHE)) || retired || (me', new: '!(await holdsBoot(CACHE)) || (me' },
  { mech: 'RETIRED-SWEEPER', name: 'the retirement probe searches every cache',
    old: '!(await holdsBoot(CACHE))', new: '!(await caches.match(ALL_HREFS[0]))' },
  { mech: 'SWEPT-SIGNAL', name: 'a sweep with nothing to do posts nothing',
    old: "  const msg = { ob: 'swept',", new: "  if (!removed && !held) return removed;\n  const msg = { ob: 'swept'," },
  { mech: 'SWEPT-SIGNAL', name: 'the answer posted before the deletes settle',
    old: '      if (await caches.delete(n)) removed++;', new: '      caches.delete(n); removed++;' },
  { mech: 'ANSWER-PATH', name: 'the navigation answer awaits the sweep',
    old: '    event.respondWith((async () => {\n      const cache = await openSnapshot();\n      const hit = await cache.match(req, { ignoreSearch: true });',
    new: "    event.respondWith((async () => {\n      await sweepStale('navigation');\n      const cache = await openSnapshot();\n      const hit = await cache.match(req, { ignoreSearch: true });" },
  { mech: 'ANSWER-PATH', name: 'the navigation sweep outside waitUntil',
    old: "    event.waitUntil(sweepStale('navigation'));", new: "    sweepStale('navigation');" },
  { mech: 'ANSWER-PATH', name: 'the client sweep outside waitUntil',
    old: "event.waitUntil(Promise.all([kickFill('client'), sweepStale('client', event.source, event.data.id)]));",
    new: "sweepStale('client', event.source, event.data.id); event.waitUntil(kickFill('client'));" },
  { mech: 'SCOPE', name: 'every ob-sw* name treated as this scope (no prefix check)', collateral: true,
    old: "(n === CACHE || !n.startsWith(PREFIX))", new: "(n === CACHE || !n.startsWith('ob-sw'))" },
  // B's own older generation lies under the stub's ob-sws- prefix, so a worker under another prefix keeps it (collateral)
  { mech: 'SCOPE', name: 'the prefix before the amendment (ob-sw-s), inside the pre-scope sweep filter', collateral: true,
    old: "const PREFIX = `ob-sws-${scopeTag(SCOPE)}-`;", new: "const PREFIX = `ob-sw-s${scopeTag(SCOPE)}-`;" },
  { mech: 'SCOPE', name: 'later sweeps take every ob-sw-* name as this scope\'s (the prefix checked at activate only)', collateral: true,
    old: "(n === CACHE || !n.startsWith(PREFIX))", new: "(n === CACHE || (why === 'activate' && !n.startsWith(PREFIX)))" },
  // #1169 ruling ab9466c0: no legacy delete of any kind. Each plant re-enables one (a reverting mutant)
  { mech: 'PRE-SCOPE', name: 'a pre-scope name taken at activate (any legacy delete at the take-over)',
    old: "      if (n === CACHE || !n.startsWith(PREFIX)) continue; // this scope's generations only: never another scope's, never a pre-scope name (#1169)\n", new: "      if (n === CACHE || (!n.startsWith(PREFIX) && !(why === 'activate' && /^ob-sw-\\d/.test(n)))) continue;\n" },
  { mech: 'PRE-SCOPE', name: 'a pre-scope name taken by a later sweep',
    old: "      if (n === CACHE || !n.startsWith(PREFIX)) continue; // this scope's generations only: never another scope's, never a pre-scope name (#1169)\n", new: "      if (n === CACHE || (!n.startsWith(PREFIX) && !(why !== 'activate' && /^ob-sw-\\d/.test(n)))) continue;\n" },
  { mech: 'PRE-SCOPE', name: "this scope's entries taken out of a pre-scope cache at activate (the withdrawn per-entry rule)",
    old: "      if (n === CACHE || !n.startsWith(PREFIX)) continue; // this scope's generations only: never another scope's, never a pre-scope name (#1169)\n",
    new: "      if (why === 'activate' && /^ob-sw-\\d/.test(n)) { const pc = await caches.open(n); for (const r of await pc.keys()) if (r.url.startsWith(SCOPE)) await pc.delete(r); }\n      if (n === CACHE || !n.startsWith(PREFIX)) continue; // this scope's generations only: never another scope's, never a pre-scope name (#1169)\n" },
  // deleting the running snapshot at activate also stops the fill, and an
  // activate that never sweeps also breaks its broadcast: those plants turn
  // other mechanisms red (or their preconditions INVALID) with theirs
  { mech: 'RUNNING-SNAPSHOT', name: 'a sweep that also deletes CACHE', collateral: true,
    old: "      if (n === CACHE || !n.startsWith(PREFIX)) continue; // this scope's generations only: never another scope's, never a pre-scope name (#1169)",
    new: "      if (!n.startsWith(PREFIX)) continue;" },
  { mech: 'STALE-SWEEP', name: 'older snapshots probed like re-creations (kept when they hold the batch)', collateral: true,
    old: '      if (!older && (await holdsBoot(n))) continue;', new: '      if (await holdsBoot(n)) continue;' },
  { mech: 'STALE-SWEEP', name: 'activate does not sweep', collateral: true,
    old: "    await sweepStale('activate'); // the older generations' snapshots (and their re-creations, later sweeps)\n", new: '' },
];

// review r1 P2 on 921ff128: the file never exits without its verdict line. A
// scenario whose awaited promise never settles drains the event loop; that
// is reported INVALID (exit 2), never a silent exit 0.
let verdictPrinted = false;
const verdict = (line, code) => { verdictPrinted = true; console.log(line); process.exit(code); };
process.on('beforeExit', () => {
  if (verdictPrinted) return;
  verdictPrinted = true;
  console.log('[fill-control] INVALID: no verdict — a scenario never settled (the event loop drained)');
  process.exitCode = 2;
});

async function main() {
  const args = process.argv.slice(2);
  const swArg = args.includes('--sw') ? args[args.indexOf('--sw') + 1] : null;
  const swPath = path.resolve(swArg || SW_DEFAULT);
  const src = fs.readFileSync(swPath, 'utf8');
  if (!args.includes('--selftest')) {
    console.log(`[fill-control] judging ${path.relative(process.cwd(), swPath) || swPath}`);
    const { invalid, red } = await judge(src);
    const reds = Object.entries(red).filter(([, v]) => v.length);
    // a red mechanism is the verdict even where an older tree cannot stage
    // some order (its preconditions are INVALID, counted beside it)
    if (reds.length) verdict(`[fill-control] verdict FAIL — ${reds.map(([k]) => k).join(', ')}${invalid.length ? ` (+${invalid.length} INVALID)` : ''}`, 1);
    if (invalid.length) verdict(`[fill-control] verdict INVALID (${invalid.length})`, 2);
    verdict(`[fill-control] verdict PASS — ${MECHS.length} mechanisms (${MECHS.join(', ')}) green with their controls`, 0);
  }
  // selftest: the tree must be green; each plant must turn ITS mechanism red and only it
  let bad = 0;
  const base = await judge(src, () => {});
  if (base.invalid.length || Object.values(base.red).some((v) => v.length)) {
    verdict(`[fill-control selftest] the tree's sw.js is not green: ${JSON.stringify(base)}`, 2);
  }
  // determinism (review r1 P2): the same verdicts with every digest resolving
  // 25 ms late on a REAL timer — a harness that advanced its clock by counting
  // ticks while worker steps were still pending would go red here
  const slow = await judge(src, () => {}, { digestDelayMs: 25 });
  const slowRed = Object.entries(slow.red).filter(([, v]) => v.length).map(([k]) => k);
  const slowOk = !slow.invalid.length && !slowRed.length;
  console.log(`[fill-control selftest] determinism: every digest 25 ms late on a real timer -> ${slowOk ? 'green' : `NOT green ${JSON.stringify({ red: slowRed, invalid: slow.invalid })}`}`);
  if (!slowOk) bad++;
  for (const p of PLANTS) {
    const n = src.split(p.old).length - 1;
    if (n !== 1) { console.log(`[fill-control selftest] INVALID plant "${p.name}": anchor count ${n}`); bad++; continue; }
    STRICT = false;
    const r = await judge(src.replace(p.old, p.new), () => {});
    STRICT = true;
    const hit = Object.entries(r.red).filter(([, v]) => v.length).map(([k]) => k);
    const own = r.invalid.filter((x) => x.startsWith(`${p.mech} `));
    const ok = p.collateral ? hit.includes(p.mech) && !own.length : !r.invalid.length && hit.length === 1 && hit[0] === p.mech;
    const inv = r.invalid.length ? (p.collateral ? ` (+${r.invalid.length} collateral INVALID)` : ` invalid ${JSON.stringify(r.invalid)}`) : '';
    console.log(`[fill-control selftest] ${ok ? 'caught' : 'MISSED'} plant "${p.name}" -> red ${JSON.stringify(hit)}${inv}`);
    if (!ok) bad++;
  }
  verdict(bad ? `[fill-control selftest] FAIL (${bad})` : `[fill-control selftest] OK: ${PLANTS.length} plants each caught on its own mechanism (${PLANTS.filter((p) => p.collateral).length} with collateral)`, bad ? 1 : 0);
}
main().catch((e) => verdict(`[fill-control] INVALID ${e && e.stack}`, 2));
