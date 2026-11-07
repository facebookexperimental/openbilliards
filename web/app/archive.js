// Copyright (c) Meta Platforms, Inc. and affiliates.

// archive.js — Playback (回放) PHASE A: the always-recording session archive
// (GH-225, the replay-clip DVR amendment + owner
// refinements; the archive Phase-A plan is the schema and
// tap record). Wyze-style "always recording": every REAL user shot — in all
// three session modes (match play, practice incl. drills, playground) — is
// appended to a durable IndexedDB archive at settle, so the Phase-C
// Playback browser can list sessions and scrub any of them without the
// user ever hitting record. Phase B's renderTimeline reads
// `__archive.records(sessionId)` (ordered recordJsons) + markers.
//
// LEAF module (cache-poison contract): reached ONLY via the
// guarded dynamic import() in main.js beside the help/drills seams. Static
// imports: kernel_version (the bugreport.js dynamically-imported-leaf
// precedent — the call still sits in try/catch) and settings.js `ctx`
// (share.js's flow-adapter bus; the export predates every deployed graph).
//
// SESSION MODEL (ARCHIVE-PHASE-A.md): a session = one continuous
// game/practice/playground context. Splits ride (1) share.js resetLog via
// the additive ctx.archiveSessionReset seam — inheriting the codec's EXACT
// boundary discrimination (same-seed decision/rules re-racks are MID-GAME
// and do not split), (2) ob:settings mode/game changes (play→playground
// keeps the table, so no rerack seam fires), and (3) onDrill('start').
// A seed-bearing rerack while a drill run is LIVE is the drill's own
// multi-rack protocol → a rack SEGMENT, not a split (concat-plan risk G1);
// a foreign rerack mid-drill stops the drill in the same dispatch, and the
// deferred split converts at that onDrill('stop'). Empty sessions are
// never persisted — a context materializes at its FIRST shot row.
//
// HERMETIC-BOOT LAW (issue #14): scripted boots (sessionStorage
// 'ob-scripted', the bugreport.js read) install a DISARMED seam and never
// touch IndexedDB; e2e-archive opts back in with ?archive=1 (the ?norec
// convention inverted, carried across same-tab navigations like
// ob-scripted). The archive never uses localStorage at all, and even on
// armed real-user boots the DB opens lazily at the first archived settle —
// zero writes until a real user shot. IndexedDB unavailable/broken
// (private mode, shell quirks) degrades to a silent no-op (one
// console.warn, never a console error).
//
// EXCLUSIONS: in-app HUD Replay re-settles carry the SAME record object →
// lastRecord identity guard (the share.js/drills.js pattern); shared-replay
// passes (ctx.replayActive) belong to the sender and are never archived.
// game.loadRecord playback settles are indistinguishable from live shots at
// the hook surface (share.js's recorder has the same recorded property):
// every current caller is scripted (disarmed), and the Phase-C player MUST
// wrap playback in __archive.suspend(true/false) — the latch ships now.
// The archive is read-only over records/judgments/seams — it never touches
// shot inputs (issue #14 determinism guard stays byte-identical).
import { kernel_version } from '../dist/pool-wasm/pool_wasm.js';
import { ctx } from './settings.js';

const DB_NAME = 'ob-archive-v1';
const DB_VERSION = 1;
const SESSIONS = 'sessions';
const SHOTS = 'shots';
// Retention defaults (the design charter: "cap by size/count with oldest-eviction").
// Bytes are recordJson char counts (ASCII JSON ⇒ ~bytes); whole oldest
// sessions are evicted, never the live one. configure() overrides (e2e).
const MAX_BYTES_DEFAULT = 50 * 1024 * 1024;
const MAX_SESSIONS_DEFAULT = 100;
const DRILL_EVENTS_CAP = 512; // long century runs: oldest drill markers shift

export function createArchive({ machine, game }) {
  if (!machine || !game || window.__archive) return null;

  // ---- arming (hermetic-boot law) -----------------------------------------
  let scripted = false;
  try { scripted = sessionStorage.getItem('ob-scripted') === '1'; } catch { /* storage unavailable */ }
  let optIn = false;
  try {
    const q = new URLSearchParams(location.search);
    optIn = q.has('archive') && q.get('archive') !== '0';
    if (optIn) sessionStorage.setItem('ob-archive-optin', '1');
    else if (q.get('archive') === '0') sessionStorage.removeItem('ob-archive-optin');
    else optIn = sessionStorage.getItem('ob-archive-optin') === '1';
  } catch { /* storage unavailable — stay disarmed on scripted boots */ }
  const armed = !scripted || optIn;
  if (!armed) {
    // disarmed seam: same surface, inert, ZERO storage access — the
    // e2e-archive hermetic arm asserts enabled() === false alongside the
    // indexedDB.databases() emptiness probe.
    window.__archive = {
      enabled: () => false,
      suspend: () => false,
      suspended: () => false,
      onDrill: () => {},
      flush: async () => true,
      configure: () => null,
      current: () => null,
      sessions: async () => [],
      session: async () => null,
      records: async () => [],
      record: async () => null,
      shot: async () => null,
      deleteSession: async () => false,
      purge: async () => false,
      usage: async () => ({ enabled: false, sessions: 0, bytes: 0 }),
    };
    return window.__archive;
  }

  let kv = null;
  try { kv = String(kernel_version()); } catch { kv = null; }

  // ---- state ----------------------------------------------------------------
  let db = null;
  let dbFailed = false;
  let warned = false;
  let writeQueue = Promise.resolve();
  let syncScheduled = false;
  let suspended = false; // Phase-C playback latch (__archive.suspend)
  let lastRecord = null; // in-app Replay identity guard (share.js pattern)
  let lastRowKey = null; // last consumed judgment-ledger row {rack|seed|shot}
  let segmentPending = true;   // next archived shot opens a rack segment
  let segmentDeferred = false; // mid-settle rules re-rack → latch at NEXT settle
  let pendingDrillSplit = false; // mid-drill foreign rerack → split at 'stop'
  const dirty = new Set();     // contexts with unpersisted rows/meta
  const caps = { maxBytes: MAX_BYTES_DEFAULT, maxSessions: MAX_SESSIONS_DEFAULT };

  const warnOnce = (e) => {
    if (warned) return;
    warned = true;
    console.warn('[archive] session archive unavailable — recording disabled:', e);
  };

  /** Fresh in-memory session context. Persisted only once a shot lands
   * (id stays null until then — "no writes until a real user shot"). */
  function contextFrom(reason) {
    let mode = null, gid = null, variant = null;
    try {
      const s = ctx.settings?.get?.();
      mode = s?.mode ?? null;
      gid = s?.game ?? null;
    } catch { /* stale settings seam */ }
    gid = gid ?? game.gameId ?? null;
    try { variant = gid ? (ctx.settings?.variantFor?.(gid) ?? null) : null; } catch { variant = null; }
    return {
      id: null,
      pending: [], // shot rows awaiting the macrotask write
      meta: {
        v: 1,
        reason, // boundary that opened this session (debug/browse aid)
        startTs: null,
        endTs: null,
        kernelVersion: kv,
        rulesVersion: null, // stamped at the first shot (rules boot is async)
        gameId: gid,
        variant,
        mode,
        playground: mode === 'playground', // latched true by sandbox shots
        drill: null, // { id, events: [...], score?, max?, assist?, outcome? }
        segments: [], // [{ seed, startIdx, ts }] — rack segments
        shots: 0,
        bytes: 0,
      },
    };
  }
  let cur = contextFrom('boot');

  /** Session boundary: close the current context (its final meta — and any
   * shot rows still awaiting their macrotask write — ride the next sync)
   * and open a fresh one. */
  function split(reason) {
    if (cur.id !== null || cur.pending.length > 0) { dirty.add(cur); scheduleSync(); }
    cur = contextFrom(reason);
    segmentPending = true;
    segmentDeferred = false;
    pendingDrillSplit = false;
  }

  /** Drop the current context WITHOUT persisting it (deleteSession/purge —
   * a re-persist would resurrect the just-deleted rows). */
  function detach(reason) {
    dirty.delete(cur);
    cur = contextFrom(reason);
    segmentPending = true;
    segmentDeferred = false;
    pendingDrillSplit = false;
  }

  // ---- taps -------------------------------------------------------------------
  // (1) share.js resetLog — the codec's session boundary (published seam;
  // share.js calls it exactly when the recorder log resets: seed-bearing
  // fresh racks, NEVER same-seed decision/rules re-racks). While a drill
  // run is live the rerack is the drill's own multi-rack protocol → keep
  // the session; a FOREIGN rerack stops the drill synchronously in the
  // same stateChange dispatch, so the deferred split converts at 'stop'.
  ctx.archiveSessionReset = () => {
    let drillLive = false;
    try { drillLive = window.__drills?.state?.()?.done === false; } catch { drillLive = false; }
    if (drillLive) { pendingDrillSplit = true; return; }
    split('rerack');
  };

  // (2) mode/game context changes (owner refinement 3: a mode/game switch
  // starts a new session — play→playground keeps the table, so the rerack
  // seam above never fires for it). Rerack-driven changes double-fire with
  // seam (1): harmless — a 0-shot context is replaced, never persisted.
  // A LIVE drill is closed out deterministically BEFORE the split (review
  // nit): drills.js's own foreign-context silent stop races this listener
  // (leaf load order decides), and when it lands after, the 'stop' hits
  // the fresh non-drill context and is dropped — synthesize it here so
  // the archived outcome never depends on registration order.
  window.addEventListener('ob:settings', (e) => {
    const k = e?.detail?.key;
    if (k !== 'mode' && k !== 'game') return;
    const d = cur.meta.drill;
    if (d && !d.outcome) {
      d.events.push({ ev: 'stop', ts: Date.now() });
      if (d.events.length > DRILL_EVENTS_CAP) d.events.shift();
      d.outcome = 'stopped';
    }
    split(k);
  });

  // (3) rack segments: every fresh table (rerack OR scripted layout with a
  // seed) marks the NEXT archived shot as a segment opener. Additive
  // registration (module-ownership rule 2). Judged rulebook re-racks (022
  // eightball-v2 re_break, 025 14.1 three-foul) run game.rerack
  // synchronously INSIDE flow.js's shotComplete dispatch — prev is the
  // transient SETTLED, and this stateChange precedes the archive of the
  // shot that CAUSED the re-rack (handler 5 below registers after flow).
  // Latching segmentPending now would open the new rack segment one shot
  // early, so defer: the latch converts AFTER that shot is archived
  // (share.js's expectRulesRerack awareness, segment-shaped).
  machine.on('stateChange', (next, prev, info) => {
    if (next !== 'AIM' || info?.seed === undefined) return;
    if (prev === 'SETTLED') segmentDeferred = true;
    else segmentPending = true;
  });

  // (4) drill lifecycle — drills.js mirror() fans every '[drills]' console
  // event out here (window seam; drills.js may not import this module).
  function onDrill(event, payload) {
    const data = payload && typeof payload === 'object' ? { ...payload } : null;
    if (event === 'start') {
      // a fresh drill run is a fresh session; a context that never saw a
      // shot (e.g. the mode-pin split just before) is adopted in place
      if (cur.meta.shots > 0 || cur.pending.length > 0 || cur.meta.drill) split('drill');
      cur.meta.drill = { id: data?.id ?? null, events: [] };
      cur.meta.mode = 'practice'; // drills.js start() pins the selector
      pendingDrillSplit = false;
    }
    const d = cur.meta.drill;
    if (!d) return; // stray event on a non-drill session (e.g. the stop
                    // fired by a mode switch AFTER its split) — ignore
    d.events.push({ ev: String(event), ts: Date.now(), ...(data ? { data } : {}) });
    if (d.events.length > DRILL_EVENTS_CAP) d.events.shift();
    if (event === 'complete') {
      d.outcome = 'complete';
      if (Number.isFinite(data?.score)) d.score = data.score;
      if (Number.isFinite(data?.max)) d.max = data.max;
      if (typeof data?.assist === 'string') d.assist = data.assist;
    }
    if (event === 'stop') {
      d.outcome = d.outcome ?? 'stopped';
      if (pendingDrillSplit) { split('rerack'); return; } // foreign rerack landed
    }
    if (cur.id !== null) { dirty.add(cur); scheduleSync(); }
  }

  // (5) the per-shot append — registered AFTER flow.js/share.js (dynamic
  // leaf; boot()'s synchronous createFlow/createShare ran first), so the
  // judgment row and the share log push for this settle already happened.
  machine.on('shotComplete', (record, outcome) => {
    if (suspended || !record || dbFailed) return;
    if (record === lastRecord) return; // in-app Replay re-settle
    lastRecord = record;
    if (ctx.replayActive?.() === true) return; // shared-replay pass
    const ts = Date.now();
    let json;
    try { json = JSON.stringify(record); } catch { return; }

    // judgment row: the ledger TAIL copied at THIS settle (the cap-128 ring
    // wraps long sessions — never snapshot at session end). Guards: never
    // in playground (flow suppresses judgment there by design — markers
    // degrade to ts + pots), seed must match, and a row is consumed at most
    // once (a stale tail — e.g. rows pushed by skipped replay shots — must
    // never re-attach to a later unjudged settle).
    let judgment = null;
    let mode = null;
    try { mode = ctx.settings?.get?.()?.mode ?? null; } catch { mode = null; }
    if (mode !== 'playground') {
      try {
        const rows = window.__rules?.judgments?.() ?? [];
        const row = rows[rows.length - 1];
        if (row && row.seed === game.seed) {
          const key = `${row.rack}|${row.seed}|${row.shot}`;
          if (key !== lastRowKey) { judgment = row; lastRowKey = key; }
        }
      } catch { judgment = null; }
    }

    // per-shot pots from the kernel record itself (outcome.pocketed is
    // CUMULATIVE): balls pocketed now that were ON TABLE at this record's
    // initial snapshot — the playground marker degrade, no re-adjudication.
    let pots = [];
    try {
      const up = new Set((record.initial?.balls ?? []).map((b) => b.id));
      pots = (outcome?.pocketed ?? []).filter((id) => up.has(id));
    } catch { pots = []; }

    // codec-v6 axes for THIS shot, delta-copied from the share recorder's
    // rack-local log (share.js pushed the shot right before this handler):
    // committed free placements (moves) and the BIH cue placement.
    let placements = null;
    try {
      const log = window.__share?.log?.();
      if (log && Number.isFinite(log.shots) && log.shots > 0) {
        const k = log.shots - 1;
        const moves = (log.moves ?? []).filter((m) => m.shotIndex === k)
          .map((m) => ({ ...m }));
        const cue = log.placements?.[k] ? { ...log.placements[k] } : null;
        if (moves.length || cue) placements = { cue, moves };
      }
    } catch { placements = null; }

    const m = cur.meta;
    const idx = m.shots;
    m.startTs = m.startTs ?? ts;
    m.endTs = ts;
    m.rulesVersion = m.rulesVersion
      ?? (() => { try { return window.__rules?.rulesVersion?.() ?? null; } catch { return null; } })();
    m.gameId = m.gameId ?? game.gameId ?? null;
    if (mode === 'playground') m.playground = true; // the share.js v6 latch
    const seed = judgment?.seed ?? game.seed;
    if (segmentPending || m.segments.length === 0) {
      m.segments.push({ seed, startIdx: idx, ts });
      segmentPending = false;
    }
    if (segmentDeferred) {
      // a rules re-rack fired inside THIS settle's dispatch: the shot just
      // archived belongs to the pre-re-rack table; the NEXT one opens the
      // new rack segment
      segmentPending = true;
      segmentDeferred = false;
    }
    pendingDrillSplit = false; // a settled shot proves the rerack was ours
    cur.pending.push({
      idx,
      ts,
      seed,
      shot: judgment?.shot ?? Math.max(0, game.shotIndex - 1),
      rack: judgment?.rack ?? null,
      recordJson: json,
      judgment,
      outcome: outcome ? JSON.parse(JSON.stringify(outcome)) : null,
      pots,
      placements,
    });
    m.shots += 1;
    m.bytes += json.length;
    dirty.add(cur);
    scheduleSync(); // macrotask — never IO inside the settle dispatch
  });

  // ---- IndexedDB plumbing ----------------------------------------------------
  function openDb() {
    if (db) return Promise.resolve(db);
    if (dbFailed) return Promise.reject(new Error('archive db unavailable'));
    return new Promise((resolve, reject) => {
      let req;
      try { req = indexedDB.open(DB_NAME, DB_VERSION); } catch (e) {
        dbFailed = true; reject(e); return;
      }
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains(SESSIONS)) {
          d.createObjectStore(SESSIONS, { keyPath: 'id', autoIncrement: true });
        }
        if (!d.objectStoreNames.contains(SHOTS)) {
          d.createObjectStore(SHOTS, { keyPath: ['sid', 'idx'] });
        }
      };
      req.onsuccess = () => {
        db = req.result;
        db.onversionchange = () => { try { db.close(); } catch { /* ok */ } db = null; };
        resolve(db);
      };
      req.onerror = () => { dbFailed = true; reject(req.error ?? new Error('open failed')); };
    });
  }

  /** True when the archive DB already exists — readers use it so a probe on
   * a virgin armed boot never CREATES the database (write-free until a real
   * shot). Falls open (true) where databases() is unsupported. */
  async function dbExists() {
    if (db) return true;
    try {
      if (typeof indexedDB.databases === 'function') {
        return (await indexedDB.databases()).some((x) => x.name === DB_NAME);
      }
    } catch { /* fall through */ }
    return true;
  }

  const reqp = (r) => new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  const txDone = (tx) => new Promise((resolve, reject) => {
    // abort/error REJECT (review nit): a quota-aborted readwrite commits
    // nothing — callers must not treat it as success (persistDirty
    // re-queues its rows; every reject funnels into warnOnce)
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('archive tx aborted'));
    tx.onerror = () => reject(tx.error ?? new Error('archive tx failed'));
  });
  const shotRange = (sid) => IDBKeyRange.bound([sid, 0], [sid, Number.MAX_SAFE_INTEGER]);

  function scheduleSync() {
    if (syncScheduled) return;
    syncScheduled = true;
    setTimeout(() => {
      syncScheduled = false;
      writeQueue = writeQueue.then(persistDirty).catch(warnOnce);
    }, 0);
  }

  async function persistDirty() {
    const work = [...dirty].filter((c) => c.id !== null || c.pending.length > 0);
    dirty.clear();
    if (!work.length || dbFailed) return;
    let d;
    try { d = await openDb(); } catch (e) { warnOnce(e); return; }
    try {
      const tx = d.transaction([SESSIONS, SHOTS], 'readwrite');
      const ss = tx.objectStore(SESSIONS);
      const sh = tx.objectStore(SHOTS);
      const issued = []; // [ctx, rows, wasFresh] — for abort re-queue
      const flushCtx = (c, wasFresh) => {
        const rows = c.pending.splice(0);
        issued.push([c, rows, wasFresh]);
        for (const row of rows) sh.put({ sid: c.id, ...row });
        ss.put({ ...c.meta, id: c.id }); // structured clone snapshots meta
      };
      for (const c of work) {
        if (c.id === null) {
          const add = ss.add({ ...c.meta });
          add.onsuccess = () => { c.id = add.result; flushCtx(c, true); };
        } else {
          flushCtx(c, false);
        }
      }
      try {
        await txDone(tx);
      } catch (e) {
        // aborted tx (quota, shell quirk): NOTHING committed — re-queue the
        // spliced rows so the next settle's sync retries them, and surface
        // the failure (review nit: no silent row loss)
        for (const [c, rows, wasFresh] of issued) {
          c.pending.unshift(...rows);
          if (wasFresh) c.id = null; // the session row never committed
          dirty.add(c);
        }
        throw e;
      }
      await enforceRetention(d);
    } catch (e) { warnOnce(e); }
  }

  /** Oldest-eviction over BOTH caps; the live session is never evicted. */
  async function enforceRetention(d) {
    const metas = await reqp(d.transaction(SESSIONS).objectStore(SESSIONS).getAll());
    metas.sort((a, b) => a.id - b.id);
    let total = metas.reduce((s, m) => s + (m.bytes || 0), 0);
    const evict = [];
    while (metas.length - evict.length > caps.maxSessions || total > caps.maxBytes) {
      const oldest = metas[evict.length];
      if (!oldest || oldest.id === cur.id) break; // never the live session
      evict.push(oldest.id);
      total -= oldest.bytes || 0;
    }
    if (!evict.length) return;
    const tx = d.transaction([SESSIONS, SHOTS], 'readwrite');
    for (const id of evict) {
      tx.objectStore(SESSIONS).delete(id);
      tx.objectStore(SHOTS).delete(shotRange(id));
    }
    await txDone(tx);
  }

  /** Await all pending writes (e2e seam): one macrotask hop so a settle's
   * scheduled sync enqueues first, then the queue tail. */
  async function flush() {
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    await writeQueue;
    return true;
  }

  // ---- readers ---------------------------------------------------------------
  async function withDb(fn, empty) {
    if (dbFailed || !(await dbExists())) return empty;
    try { return await fn(await openDb()); } catch (e) { warnOnce(e); return empty; }
  }

  const listSessions = () => withDb(async (d) => {
    const metas = await reqp(d.transaction(SESSIONS).objectStore(SESSIONS).getAll());
    metas.sort((a, b) => b.id - a.id); // newest first
    return metas;
  }, []);

  const shotRows = (d, sid) => reqp(
    d.transaction(SHOTS).objectStore(SHOTS).getAll(shotRange(sid)));

  /** Session detail: meta + KEY-MOMENT markers (DVR amendment §2) — per-shot
   * rows (judgment fields where present, pots always) merged with the
   * drill event stream, ts-ordered. */
  const sessionDetail = (id) => withDb(async (d) => {
    const meta = await reqp(d.transaction(SESSIONS).objectStore(SESSIONS).get(id));
    if (!meta) return null;
    const rows = await shotRows(d, id);
    rows.sort((a, b) => a.idx - b.idx);
    const markers = rows.map((r) => ({
      kind: 'shot',
      idx: r.idx,
      ts: r.ts,
      seed: r.seed,
      shot: r.shot,
      pots: r.pots ?? [],
      ...(r.judgment ? {
        legal: r.judgment.legal,
        fouls: r.judgment.fouls,
        pocketed: r.judgment.pocketed,
        terminal: r.judgment.terminal ?? r.judgment.gameOver ?? null,
        judgeError: r.judgment.judgeError,
      } : {}),
    }));
    for (const e of meta.drill?.events ?? []) {
      markers.push({ kind: 'drill', ev: e.ev, ts: e.ts, data: e.data ?? null });
    }
    markers.sort((a, b) => a.ts - b.ts);
    return { ...meta, markers };
  }, null);

  const recordsOf = (id) => withDb(async (d) => {
    const rows = await shotRows(d, id);
    rows.sort((a, b) => a.idx - b.idx);
    return rows.map((r) => r.recordJson);
  }, []);

  const shotOf = (id, k) => withDb(async (d) => {
    const row = await reqp(d.transaction(SHOTS).objectStore(SHOTS).get([id, k]));
    return row ?? null;
  }, null);

  /** Destructive writes ride the SAME serialized queue as persistDirty
   * (review nit): an in-flight persist could otherwise commit its rows
   * AFTER the clear/delete transaction and resurrect the purged session. */
  function queued(job) {
    const p = writeQueue.then(job);
    writeQueue = p.then(() => {}, () => {});
    return p;
  }

  const deleteSession = (id) => queued(() => withDb(async (d) => {
    if (cur.id === id) detach('deleted'); // never resurrect a deleted row
    // review P2: a CLOSED context (post-split) can still sit in `dirty`
    // awaiting its scheduled sync — that persist is appended to the queue
    // by a macrotask and would land AFTER this delete, re-putting the
    // session row. Scrub every matching context (detach only covers cur).
    for (const c of [...dirty]) {
      if (c.id === id) { c.pending.length = 0; dirty.delete(c); }
    }
    const tx = d.transaction([SESSIONS, SHOTS], 'readwrite');
    tx.objectStore(SESSIONS).delete(id);
    tx.objectStore(SHOTS).delete(shotRange(id));
    await txDone(tx);
    return true;
  }, false));

  const purge = () => queued(() => withDb(async (d) => {
    detach('purged');
    dirty.clear();
    const tx = d.transaction([SESSIONS, SHOTS], 'readwrite');
    tx.objectStore(SESSIONS).clear();
    tx.objectStore(SHOTS).clear();
    await txDone(tx);
    return true;
  }, false));

  const usage = async () => {
    const out = {
      enabled: !dbFailed,
      sessions: 0,
      bytes: 0,
      caps: { ...caps },
    };
    const metas = await listSessions();
    out.sessions = metas.length;
    out.bytes = metas.reduce((s, m) => s + (m.bytes || 0), 0);
    try {
      const est = await navigator.storage?.estimate?.();
      if (est) out.estimate = { usage: est.usage, quota: est.quota };
    } catch { /* best-effort */ }
    return out;
  };

  // ---- seam (e2e / debug / Phase-B+C read surface) ---------------------------
  window.__archive = {
    enabled: () => !dbFailed,
    /** Phase-C playback latch: while suspended, settles are never archived
     * (game.loadRecord playback re-emits shotComplete — the player MUST
     * bracket playback with suspend(true)/suspend(false)). */
    suspend: (on) => { suspended = on === true; return suspended; },
    suspended: () => suspended,
    onDrill,
    flush,
    /** e2e/debug retention override. */
    configure: (c = {}) => {
      if (Number.isFinite(c.maxBytes) && c.maxBytes > 0) caps.maxBytes = c.maxBytes;
      if (Number.isInteger(c.maxSessions) && c.maxSessions > 0) caps.maxSessions = c.maxSessions;
      return { ...caps };
    },
    /** Phase-C ADDITIVE: id of the LIVE (still-recording) session, null
     * until its first shot persists. The player uses it to decide whether
     * the opened session is the current one (the v5 replay-link row is
     * live-session-only in the Phase-C first cut — deferral recorded in
     * the OWNERSHIP ledger). */
    current: () => cur.id,
    sessions: listSessions,
    session: sessionDetail,
    records: recordsOf,
    record: async (id, k) => (await shotOf(id, k))?.recordJson ?? null,
    shot: shotOf,
    deleteSession,
    purge,
    usage,
  };
  return window.__archive;
}
