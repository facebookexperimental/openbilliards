// Copyright (c) Meta Platforms, Inc. and affiliates.

// index.js — the ball-return extension controller (feature 037, issue #650).
//
// A HOOK CONSUMER, nothing else: it registers `machine.on('frame')` and
// `machine.on('stateChange')` (additive registrations per the ownership ledger (internal))
// and reads the public `game` object (`sinkInfo`, `ballSet`, `playbackBalls`,
// `template`, `clock`). It re-poses only balls the frozen sink animation has
// ALREADY retired (kernel motion state Pocketed; game.js parks them at (0, −10, 0)
// with `pocketed = true`) whose handoff instant has passed, plus the balls already
// resting in the tray. game.js, table.js, sinkpivot.js, main.js and state.js are
// byte-untouched; the kernel never learns this module exists.
//
// Constitution: a DISCLOSED deviation from P-II / the ownership ledger rule 4 (owner
// ruling 2026-09-04, #650; review r1 P1-A) — post-pocket presentation only, no
// read-back into game state, kinematics pinned, replay-scrub identical. See
// the ownership ledger rule 4 and spec §2 "Constitution alignment".
//
// Activation (contract §1): a scripted boot (`?obtool` / `?cinema`) may arm a
// track by `?ballreturn=<track id>`; otherwise the ACTIVE table's render spec
// must carry `pocketSystem: 'return-track'` + `returnTrack: '<id>'`. Absent =
// inert. Nothing is persisted. The definition is fetched from ./tracks/<id>.json,
// validated (schema.js) and built (track.js); refusal = inert + one report on
// scripted boots. Activation is re-resolved on EVERY table switch of the session
// (review r1 P2-1): the app's `ob:settings` broadcast prompts a check, the frame
// hook confirms `activeTableId()`; a switch releases every pose, drops all state
// and resolves again for the new table (generation-guarded against races).
//
// Purity: render time → pose is a lookup over the precomputed solution
// (kinematics.js). The solution is a deterministic function of (the record's sink
// index, the set of pocketed ids, the session arrival order, the continuation
// state carried from the previous solution at the switch); it is re-solved only
// when that key changes. A ball still on the track when the time base changes is
// CONTINUED from its station / speed / orientation (review r1 P1-B), never
// re-seated. Host seam: one guarded dynamic import at the top of
// web/app/drills.js createDrills (contract §2; moved from playback.js on the
// design review, report §2 A8).
import { validateTrack, shapeRefusal } from './schema.js';
import { handoffFromSink, ownHandoff, solveShot, poseAt, continuationAt, createEventCursor, designGate, designGateChunked } from './kinematics.js';
import { furnitureCacheKey, furnitureClearance, furnitureOf, furnitureEvaluations, geometryKey } from './furniture.js';
import { validateAssembly, assemblyMatcher } from './assembly.js';
import { validateHardware } from './hardware.js';
import { tableIdsMatch, canonicalTableId } from './tableid.js'; // the ONE catalog identity comparison (+ the canonical id a companion FILE lives under) — shared with V17 (hardware.js) and V18 (assembly.js) since #707 prep FIX7 B

export const BALLRETURN_CAPS = Object.freeze({ schema: 1, pureLookup: true, audioEvents: true, continuation: true, reactivation: true });

let installed = null;

/**
 * Does a track defined for `trackTableId` belong to the active table `activeId`?
 * Aliased catalog ids (table.js: `pool_pro_9ft_measured` → `pool_pro_9ft`,
 * `joy_q8_9ft` → `chinese8_pro_9ft`) share ONE spec object, so the match is by spec
 * identity, never by the raw id string (review r3 P2). Returns true, false, or
 * 'unknown' when the track names an id the catalog does not carry (specFor() would
 * silently fall back to the pin table — that fallback must never grant a match).
 */
export { tableIdsMatch }; // (#707 prep FIX7 B) the function itself lives in tableid.js — one home, three readers (the track here, V17, V18)

function scriptedBoot() {
  try {
    const q = new URLSearchParams(location.search);
    const on = (k) => q.has(k) && q.get(k) !== '0';
    if (on('obtool') || on('cinema')) return true;
    if (q.get('obtool') === '0') return false;
    return sessionStorage.getItem('ob-scripted') === '1';
  } catch { return false; }
}

function reportOnce(msg, scripted) {
  try {
    if (scripted && Array.isArray(window.__test?.errors)) window.__test.errors.push(`[ballreturn] ${msg}`);
    else console.warn('[ballreturn]', msg);
  } catch { /* no surface */ }
}

/**
 * Install the extension. Never throws synchronously; resolves to the controller
 * (enabled or inert with a reason). Idempotent per page; hooks register once and
 * outlive table switches (activation state is re-resolved per table).
 */
/** V19 verdicts by built table + track bytes (#707 prep FIX1 A1): a re-activation of the same geometry is a lookup, 0 solves. */
const designCache = new Map();
const DESIGN_CACHE_MAX = 32;
export async function installBallReturn({ machine, game, fetchImpl, tableModule, solveOpts, scene: sceneSeam = null, furniture: furnitureWaiver = null, design: designModeOpt = null } = {}) {
  if (installed) return installed;
  if (!machine || !game || typeof machine.on !== 'function') return null;
  const scripted = scriptedBoot();
  // the ONE documented loader (contract §3): the caller's fetchImpl, else the global
  // fetch — a node harness / controlled loader supplies its own (review r3 P2)
  const doFetch = typeof fetchImpl === 'function' ? fetchImpl
    : (typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : null);

  // ---- activation state (reset on every table switch) ---------------------------
  let track = null;           // the built Track for the active table, or null (inert)
  let pockets = [];           // kernel cups {x, z, r} of the active table (three frame)
  let tableId = null;         // the table this activation was resolved for
  let armedR = NaN; // the ball radius the current activation was read for (order 19 item 5: a discipline switch re-arms)
  let gen = 0;                // activation generation (drops a stale async activation)
  let settledGen = -1;        // the generation whose activation has settled (enabled or inert), or -1 when none has
  let activatedWaiters = [];  // resolvers parked by ctl.whenActivated() for the current generation to settle
  const settled = (g) => {
    if (g !== gen) return;
    settledGen = g;
    const waiters = activatedWaiters; activatedWaiters = [];
    for (const resolve of waiters) resolve();
  };
  // ---- solution state (reset with the activation, and on rack rebuilds) ----------
  let solution = null;
  let solArrivals = new Map(); // id → handoff used as an ARRIVAL by `solution`
  // order 18 item 0 — the OWNERSHIP hand-off: id → { dtOwn } for arrivals the module takes EARLY (the sink pose met a ball it
  // draws or holds before the shield crossing); game.js's poseSink asks `game.ballReturnOwns(id, dt)` and parks the ball from
  // dtOwn on. The answer is a pure function of the record: it solves synchronously when asked (the PLAYBACK key excludes the
  // playback balls' own pocketed flags, so a call from inside game.js's seek loop reads a stable key — refuter E).
  let ownMap = new Map();
  let ownRounds = 0;
  const hostOwnsHook = () => game.ballReturnOwnsSupported === true && typeof game.sinkPoseAt === 'function';
  /** The scene V16 reads (order 20 item 0): the harness seam, else the ball set's parent (the app adds the ball group to its
   * Scene), else the app's debug handle; null in a headless host. */
  const sceneOf = () => sceneSeam ?? (game.ballSet?.group?.parent ?? null) ?? (typeof window !== 'undefined' ? (window.__dbg?.scene ?? null) : null);
  let furnitureKey = null; // the V16 cache key of the current activation (the geometry key | the furniture hashes)
  let furniturePendingMark = -1; // (#707 prep FIX7 A) the GENERATION whose pending activation received a furniture broadcast: its completion re-reads V16 before enabling; a torn-down generation's mark dies with it (never equals a live myGen)
  let armedGeom = null;    // { def, cups, falls } the current activation validated against — the geometry BOTH caches key on (FIX6 B); the furniture recheck rebuilds the key from it, the facade publishes it (L71)
  let assemblyDecl = null; // the V18 declaration of the current activation (for the re-check's hash)
  // ---- V19 off the UI thread (#707 prep FIX1 A1, review 707m1 P2-1) ---------------------------------------------------------
  // The design family (kinematics.js designGateSteps) ran synchronously on the browser thread at activation — ≈ 260 ms on the
  // synthetic track, 3.8 s for XW101's 90 solves — and again on every re-activation. Now: a module Worker runs it where the host
  // has one (design-worker.js rebuilds the Track from the same bytes with the same validateTrack, so the verdict is the same);
  // else time-budgeted slices between host breaths (designGateChunked, ≤ 4 ms per slice, bounded below by one solve); the
  // verdict is CACHED per built table + track bytes + radius (a synchronous FNV-1a 64 content key, the hit verified against the
  // stored key material byte for byte), so a preview-and-revert or a discipline switch that keeps the
  // geometry is a lookup with 0 solves. The mode is `design: 'worker' | 'chunked' | 'sync'` (the install option; a scripted
  // boot may pin it with ?ballreturnDesign=); default worker where `Worker` exists, else chunked. The generation guard around
  // the await is the same one every other await of activate() carries: a stale verdict is dropped, never applied.
  const designMode = (() => {
    let m = designModeOpt;
    if (!m && scripted) { try { m = new URLSearchParams(location.search).get('ballreturnDesign'); } catch { m = null; } }
    if (m === 'worker' || m === 'chunked' || m === 'sync') return m;
    return typeof Worker === 'function' ? 'worker' : 'chunked';
  })();
  let designWorker = null, designWorkerDead = false, designJobSeq = 0;
  const designJobs = new Map(); // job id → { resolve, timer }
  const designPending = new Map(); // key → { material, promise, gen }: the in-flight sweep of a geometry, owned by ONE generation. FIX2 (review 707m2): FIX1's de-duplication let a live activation JOIN an older generation's sweep of the same geometry; when that sweep was cancelled by the table switch in between (A → B → A), the live activation received its null and stayed 'pending' with nothing to retry it. Sharing is gone: every re-entry path tears down into a NEW generation (teardownFor, index.js — the frame hook, the ob:settings re-check, the ownership retry; recheckFurniture refuses to run over a pending activation), so a same-generation overlap of the sweep cannot occur and a join branch would be a guard that never fires. Now an older generation's in-flight sweep is ABANDONED — its slot taken by the live activation, its result discarded when it lands (designDiscarded) — and the live activation always runs its own sweep. A cancelled sweep is never cached and never returned to a live activation.
  const DESIGN_JOB_DEADLINE_MS = 30000; // a worker that never replies (torn down without an error event, a hung solve) is not waited for: the job fails over to the chunked path
  const designWorkerGet = () => {
    if (designWorkerDead || designMode !== 'worker') return null;
    if (designWorker) return designWorker;
    try {
      designWorker = new Worker(new URL('./design-worker.js', import.meta.url), { type: 'module' });
      designWorker.onmessage = (e) => { const j = designJobs.get(e.data?.id); if (!j) return; designJobs.delete(e.data.id); clearTimeout(j.timer); j.resolve(e.data); };
      designWorker.onmessageerror = () => { // a reply this thread cannot deserialize: every pending job fails over, the worker is not trusted again
        designWorkerDead = true;
        for (const j of designJobs.values()) { clearTimeout(j.timer); j.resolve({ ok: false, failed: true, error: 'design worker reply not deserializable' }); }
        designJobs.clear();
        try { designWorker.terminate(); } catch { /* gone */ }
        designWorker = null;
      };
      designWorker.onerror = (e) => { // a module load or runtime failure: every pending job falls back, the worker is not retried
        designWorkerDead = true;
        for (const j of designJobs.values()) { clearTimeout(j.timer); j.resolve({ ok: false, failed: true, error: String(e?.message ?? e) }); }
        designJobs.clear();
        try { designWorker.terminate(); } catch { /* gone */ }
        designWorker = null;
      };
      return designWorker;
    } catch { designWorkerDead = true; return null; }
  };
  // the cache key is a SYNCHRONOUS content hash (FNV-1a 64 over the track bytes + cups + falls): a cache hit must complete in
  // the same task as before this change — an awaited crypto.subtle digest would add a macrotask to every re-activation and
  // move the join instant of a late activation by a frame (lifecycle L66 Door B pins that instant)
  // (#707 prep FIX6 B) the key builder is furniture.js `geometryKey` — ONE builder for this cache and V16's clearance cache
  /** The V19 verdict of a built track: { ...verdict, cached, mode, ms, sliceMaxMs, solvesNow }. Throws only when no path could run. */
  const designVerdict = async ({ def, built, cups, falls, tableIdKey, trackId, alive = () => true, gen: myGen = null }) => {
    const t0 = performance.now();
    const tK = performance.now();                                            // this thread's synchronous share of the gate starts HERE: the key text, the material, the hash, the post
    const { key, material } = geometryKey({ tableId: tableIdKey, trackId, r: built.refR, def, cups, falls }); // the built table (cups + visual falls) and the track bytes — everything the verdict depends on, as bytes (material) and as the digest (key)
    let sliceMaxMs = performance.now() - tK;
    const hit = designCache.get(key);
    // a HIT returns the stored verdict only when the stored key MATERIAL equals this activation's byte for byte (a synchronous
    // string compare: length, then bytes — no macrotask, so a late activation's join instant does not move); a 64-bit hash
    // collision therefore costs one recompute, never a wrong verdict applied to the presentation (maintainer ruling 2026-09-18)
    if (hit && hit.material === material) return { ...hit.dg, cached: true, mode: 'cache', ms: performance.now() - t0, sliceMaxMs, solvesNow: 0 };
    // an older generation's sweep of the same geometry may still be in flight (A → B → A faster than a sweep): it is never
    // joined — its result is discarded when it lands, by its own caller's generation guard and by the abort predicate at its
    // next breath — and this activation runs its own sweep, which owns the pending slot from now on
    let resolveJob; const promise = new Promise((res) => { resolveJob = res; }); const job = { material, promise, gen: myGen }; designPending.set(key, job);
    try {
    let dg = null, mode = designMode;
    if (mode === 'worker') {
      const w = designWorkerGet();
      if (w) {
        const id = ++designJobSeq;
        const reply = await new Promise((resolve) => {
          const timer = setTimeout(() => { if (designJobs.delete(id)) resolve({ ok: false, failed: true, error: `design worker reply deadline (${DESIGN_JOB_DEADLINE_MS} ms)` }); }, DESIGN_JOB_DEADLINE_MS);
          designJobs.set(id, { resolve, timer });
          const tP = performance.now();
          try { w.postMessage({ id, def, pockets: cups, falls, r: built.refR }); } catch (e) { designJobs.delete(id); clearTimeout(timer); resolve({ ok: false, failed: true, error: String(e?.message ?? e) }); }
          sliceMaxMs = Math.max(sliceMaxMs, performance.now() - tP);        // the post completes this thread's share of the sweep
        });
        if (reply.ok) dg = reply.dg;
        else if (reply.stale || !alive()) { ctl.stats.designDiscarded += 1; resolveJob(null); return null; } // cancelled by a table switch: this activation is dead — no fallback sweep for a verdict nobody will read
        else if (!reply.failed) dg = { evaluated: false, refused: true, reason: `ball-return track refused [V19]: the design gate could not be evaluated (${reply.error})`, offenders: [] }; // the gate itself threw in the worker: the same refusal the sync path gave
        else mode = 'chunked';                                                  // the worker is gone: this thread runs the slices
      } else mode = 'chunked';
    }
    // the chunked path is the WORKER-ABSENT FALLBACK, not a non-blocking one: it yields BETWEEN seeds, and a slice is bounded
    // below by ONE solve (measured: 37 ms on the synthetic track, 431 ms for an XW101 six-ball train) — the ≤ 16.7 ms bound on
    // this thread holds for the Worker default only; here the measured max slice is published as a known number (sliceMaxMs)
    if (!dg && mode === 'chunked') {
      const res = await designGateChunked(built, { pockets: cups, r: built.refR }, { budgetMs: 4, abort: () => !alive() }); // a superseded activation stops slicing this thread
      if (res.aborted) { ctl.stats.designDiscarded += 1; resolveJob(null); return null; }  // superseded: the sweep stopped, its partial work discarded, never cached
      const { slices, sliceMaxMs: sm, ...rest } = res; dg = { ...rest, slices }; sliceMaxMs = Math.max(sliceMaxMs, sm);
    }
    if (!dg && mode === 'sync') { const tS = performance.now(); dg = designGate(built, { pockets: cups, r: built.refR }); sliceMaxMs = Math.max(sliceMaxMs, performance.now() - tS); }
    if (dg.evaluated !== false) { Object.freeze(dg); if (!designCache.has(key) && designCache.size >= DESIGN_CACHE_MAX) designCache.delete(designCache.keys().next().value); designCache.set(key, { material, dg }); }
    resolveJob(dg);
    return { ...dg, cached: false, mode, ms: performance.now() - t0, sliceMaxMs, solvesNow: dg.solves ?? 0 };
    } finally { if (designPending.get(key) === job) designPending.delete(key); } // only this job's slot: a newer generation may own it by now
  };
  /** A table switch while a Worker job is in flight: the job's reply would be dropped by the generation guard anyway — resolve it
   *  as stale now and hand the next activation a FRESH worker instead of queueing it behind a sweep nobody will read. */
  const designCancelInFlight = () => {
    if (!designJobs.size || !designWorker) return;
    for (const j of designJobs.values()) { clearTimeout(j.timer); j.resolve({ ok: false, failed: true, stale: true, error: 'superseded by a table switch' }); }
    designJobs.clear();
    try { designWorker.terminate(); } catch { /* gone */ }
    designWorker = null;                                                     // not dead: the next activation spawns a fresh one
  };
  /** The base-switch bookkeeping the PLAYBACK hook would have done had the track been active when the record changed (a shot
   * fired while this track was away or still activating): the restored / carried states resume on the NEW base at the record's
   * current clock, and the first solve is a base switch — it stores the record's content snapshot (review round 9; review r12 P2). */
  const lateJoinSwitch = () => {
    switchT = Number.isFinite(clock.lastPose) ? clock.lastPose : clock.t;
    baseGen += 1;
    clock.t = Number.isFinite(game.clock) ? game.clock : 0;
    switchOrigin = clock.t;   // the new record is already under way: the carried states resume HERE, not at 0
    clock.lastBall = game.clock;
  };
  /** The table rebuilt under the same id (the equipment broadcast): when the furniture hash moved, V16 is read again on the
   * live definition — an enabled track can be refused, a refused one re-admitted. Never inside PLAYBACK (the archive's bed). */
  let furnitureRecheckOwed = false; // a broadcast skipped inside PLAYBACK is owed when PLAYBACK ends (refuter C, D3)
  const recheckFurniture = async () => {
    const sc = sceneOf();
    if (!sc) return;
    if (machine.state === 'PLAYBACK') { furnitureRecheckOwed = true; return; }
    furnitureRecheckOwed = false;
    if ((tableMod.activeTableId?.() ?? null) !== tableId) return; // a table change is checkTable's (one activation, not two)
    // never over an activation in flight — and never DROPPED either (#707 prep FIX7 A, review 707m7 P2-1): a furniture change that
    // lands after this activation's V16 read and before its V19 completes would otherwise enable the track on stale clearance (a box
    // moved onto the runway during the sweep: enabled with 0 reported violations, 39 on a fresh read — lifecycle L74a). The broadcast
    // marks the pending GENERATION; the completion re-reads V16 through the same path before enabling (`readClearance` in activate);
    // a torn-down generation's mark dies with its generation (L74d). The mark is set whatever this bed's LAST read was — the session's
    // FIRST activation included, whose `ctl.furniture` is still null while its own V16 sweep runs (the longest pending window there
    // is: review C1, L74e) — so it sits BEFORE the evaluated-read guard below, which only the post-completion key compare needs. A
    // broadcast that itself switched the table (checkTable tore down and re-activated on the same broadcast) marks the new activation
    // too: its completion re-read is a cache hit over unchanged furniture. Everything after the completion is this function's, as before.
    if (ctl.reason === 'pending') { furniturePendingMark = gen; return; }
    if (!ctl.furniture || !ctl.furniture.evaluated) return; // nothing evaluated for this bed (trackless, or refused before V16): nothing to compare the furniture against
    const myGen = gen;
    let THREE = null; try { THREE = await import('three'); } catch { return; }
    if (myGen !== gen) return;
    const fset = furnitureOf(THREE, sc, { excludeGroup: game.ballSet?.group ?? null, hardwareNames: track?.hardwareMeshNames ?? [], assembly: assemblyMatcher(assemblyDecl) });
    // the SAME builder V16 keys its cache with — never a hand-built copy of it (#737 r9 class A: round 8's `env` component was
    // missing here, so no broadcast ever matched and a sound-settings change tore the activation down)
    const key = furnitureCacheKey({ tableId, trackId: ctl.trackId ?? '?', r: track?.refR, def: armedGeom?.def ?? null, cups: armedGeom?.cups ?? null, falls: armedGeom?.falls ?? null, furniture: fset, environmentNames: track?.environmentMeshNames ?? [] }); // the activation's own geometry (FIX6 B): only the furniture may differ here
    if (furnitureKey && furnitureKey === key) return;
    const g = teardownFor(tableId); // the same id, a new activation: V16 reads the rebuilt furniture
    activate(g).catch(() => {}).then(() => { if (g === gen) { inFlightMemo = null; loadAbort = null; } settled(g); });
  };
  const ownsHook = (id, dt) => { const sol = ensureSolution(); if (!sol) return false; const o = ownMap.get(id); return !!o && dt >= o.dtOwn - 1e-9; };
  let handoffs = null;        // Map id → handoff for the indexed record
  let indexedFor = null;      // the game.sinkInfo Map identity the handoffs came from
  let solutionKey = null;
  let sinksGen = 0;           // bumps on every (re)index — part of the solution key
  let baseGen = 0;            // bumps at every PLAYBACK start — a new time base always re-solves
  let switchT = null;         // the previous solution's time at a time-base switch (consumed by the next solve)
  let switchOrigin = 0;       // where the carried states land on the NEW base (0 for a record that starts at 0; the
                              // new base's current clock when a track returns to a record already under way — review 9)
  let recordRef;              // game.record identity — a NEW record with no stateChange (quiet loadRecord) is a base switch too
  let borrow = null;          // the Playback player has BORROWED the bed (game.js loadRecord stage:'playback', the
                              // {dvr:true} PLAYBACK): { live: <stashed session>, liveRecord, closing } — the DVR runs on
                              // its own fresh session and the live session is restored bit for bit at close (review r3 P1)
  let rackMemos = new Map();  // trackId → { ballSet, trackId, session, carriedRest, sessionOrder, rejected }: the LIVE
                              // session of every track of the CURRENT rack, stashed at each teardown so a table preview
                              // and its revert (same rack, same track) resume the timeline bit for bit — a preview onto
                              // another track-bearing table memoes that table's session beside it; a rack change clears
                              // them all; the Playback player opening on a previewed bed adopts one as its borrow (seal 9)
  let liveBallSet = null;     // the ball set of the LIVE rack as this module last OBSERVED it (refreshed at the top of
                              // checkTable, never while the app is in PLAYBACK). A quiet rerack replaces game.ballSet with
                              // no hook in between, so at a cross-equipment Playback open `game.ballSet` is already the
                              // archive's while every memo of the live rack still carries this one — which is what makes
                              // the live session findable there (refutation round 2, F1: the in-flight exemption alone
                              // covered only a switch that had not resolved yet, so an open made from a SETTLED table
                              // preview still lost the live session).
  let inFlightMemo = null;    // the trackId of the memo the switch NOW RESOLVING stashed, until that activation settles
                              // or the memo is taken. Playback's cross-equipment open re-equips the bed and re-racks it
                              // QUIETLY (playback.js swapBed: rerackKind(..., {quiet:true}) — a new ball set with NO
                              // state emission) one statement BEFORE loadRecord emits the {dvr:true} PLAYBACK, so the
                              // live session this switch stashes carries a ball set the game has already replaced: the
                              // identity test below cannot see it and the close would have nothing to hand back (review
                              // r8 P1). Only THIS memo — the one the unresolved switch took away — is exempt, and only
                              // until that switch resolves; every other memo lives and dies by ball-set identity.
  let baseSnapshots = new Map();  // record CONTENT key → { states, origin }: the carried states its first PLAYBACK started from, and the record clock they started at (a replay /
                                  // a revisit through a freshly parsed copy reuses them — review r2 P1); bounded FIFO
  const recordKeys = new WeakMap(); // record object → its content key (computed once per object)
  const SNAPSHOT_CAP = 1024;      // per rack (cleared with the rack): a Playback session revisiting more distinct
                                  // records than this in ONE rack loses the oldest snapshot (disclosed, contract §4)
  let indexRejected = new Set();  // ids the CURRENT sink index names WITHOUT a handoff (unserved pocket / netted /
                                  // dressed): never ours — the legacy cull stands (review r2 P2-1). Rejection is
                                  // CARRIED per record like every other state (solution.rejected → carried
                                  // {kind:'rejected'} → the snapshot), never a rack-wide sticky set (review round 4)
  let seedRejected = null;        // rejected ids restored from a rack memo for the first solve after a re-activation
  let refusalReported = null;     // the message of the refusal the error surface is CURRENTLY describing: a record the
                                  // solver refuses is re-solved whenever its ledger moves, and reportOnce does NOT dedupe,
                                  // so without this the same law line lands once per solve. Cleared by the next SUCCESSFUL
                                  // solve, not only at a teardown — a later, DIFFERENT refusal is news and must be reported
                                  // (refutation round 2)
  let armedReason = '';           // this activation's healthy `ctl.reason`, restored when a refusal is over
  let cursor = null;          // render-time TrackEvent cursor for `solution` (FR-012)
  let ballSetRef = null;      // rack identity (a rebuild clears the session order)
  const sessionOrder = [];    // arrival order across shots of this rack
  let ledgerLast = [];
  const carriedRest = new Map(); // id → { kind:'rest', D, route, q } — the last settled pose (station, route, orientation)
  const baseBasis = new Map();   // id → the rack orientation basis THIS module captured for a ball it holds (#737 r5 class D)
  let ownHookOwed = false;       // a V13 refusal is waiting for the host's ownership hook to appear (#737 r5 class E)
  let snapshotBreaches = 0;      // writes REFUSED by the snapshot writer because they were not read at the record's own clock (#737 r8 class A)
  const listeners = new Set();
  const clock = { t: 0, lastBall: null, lastPose: null };
  const poseTmp = {};

  const ctl = {
    caps: BALLRETURN_CAPS,
    enabled: false, trackId: null, tableId: null, armedBy: null, reason: 'pending', track: null,
    stats: { indexMs: 0, poseUs: 0, solves: 0, activations: 0, borrows: 0, furnitureEvals: 0, refineSteps: 0, refineBudget: 0, degradations: 0, designSolvesNow: 0, designSliceMaxMs: 0, designMode: null, designDiscarded: 0, furnitureRereads: 0 }, // furnitureRereads: V16 re-reads at a completion after a furniture broadcast landed while the activation was pending (FIX7 A); designSolvesNow / designSliceMaxMs / designMode: the V19 read of the CURRENT activation (0 solves on a cache hit; the longest synchronous slice the gate cost this thread; worker | chunked | sync | cache); designDiscarded: sweeps whose result no live activation used — cancelled by a table switch, superseded by a newer generation (session total)
    assembly: null, // V18 (order 21): the table's pocket-assembly declaration as loaded — { tableId, meshes: [...] } or null (none declared), the refusal when invalid
    hardware: null, // V17 (order 21 item 2): the track's own-hardware companion as loaded — { trackId, meshNames, meshes, omissions } or null
    furniture: null, // V16 (order 20 item 0): the furniture-clearance read of the current activation — { row, evaluated, why?, stations, meshes, violations, byMesh, reason }
    design: null, // V19 (order 23b, the round-2 ruling): the DESIGN gate's read of the current activation — { evaluated, refused, reason, solves, skipped, seeds, offenders[], family, ms }
    borrowed: () => !!borrow && !borrow.lost,
    solution: () => solution,
    events: () => (solution ? solution.events.slice() : []),
    ledger: () => ledgerLast.slice(),
    refusals: () => (solution?.refusals ? [...solution.refusals].map(([id, reason]) => ({ id, reason })) : []), // (#737 r5 classes C/F) the ids this solve refuses to draw, named

    ownership: () => ({ host: hostOwnsHook(), rounds: ownRounds, owned: [...ownMap].map(([id, o]) => ({ id, dtOwn: o.dtOwn })), arrivals: [...solArrivals].map(([id, h]) => ({ id, tH: h.tH, source: h.source, own: h.own ?? null })) }),
    handoffs: () => (handoffs ? [...handoffs].map(([id, h]) => ({ id, tH: h.tH, tLand: h.tLand, v0: h.v0, pocket: h.pocket, source: h.source })) : []),
    poseAt: (id, t) => (solution ? poseAt(solution, id, t, {}) : null),
    clock: () => ({ t: clock.t, lastPose: clock.lastPose, gameClock: game.clock, state: machine.state, slowmo: !!game.slowmo }),
    onEvent: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    // (#737 r8 classes A + B, §27.12: the record snapshot) every record snapshot as stored — its clock, and one entry per
    // ball of the set. `size` is the completeness assertion's read (entries == ball count); `breaches` counts the writes the
    // writer REFUSED because they were not read at that clock.
    snapshots: () => [...baseSnapshots.values()].map((s) => ({ origin: s.origin, size: s.states.size, states: [...s.states].map(([id, st]) => ({ id, kind: st.kind, why: st.why ?? null, D: Number.isFinite(st.D) ? st.D : null, pocket: st.route ? (st.route.pocket ?? null) : null })) })),
    snapshotBreaches: () => snapshotBreaches,
    designCache: () => designCache, // HARNESS seam (the byte-compare arm L22f corrupts a stored entry's material and expects a recompute); the Map is module-level — a harness that imports one module instance per boot reaches it only through the facade
    designPending: () => designPending, // HARNESS seam (FIX2 arms: the slot of an in-flight sweep belongs to the live generation)
    geometry: () => armedGeom, // HARNESS seam (FIX6 A, lifecycle L71–L73): { def, cups, falls } the current activation validated against — null until an activation has built the geometry for this bed
    whenActivated: () => (settledGen === gen ? Promise.resolve() : new Promise((resolve) => { activatedWaiters.push(resolve); })), // HARNESS seam: resolves at once if the current generation has settled, else when it settles; a superseded generation never resolves it (its settled() call returns on the generation guard, so the waiters are resolved by the next current generation's settle)
  };
  installed = ctl;
  if (scripted) window.__ballreturn = ctl; // gate surface, inert or enabled (scripted boots only)

  let tableMod = tableModule ?? null; // node harness seam (contract §1): the table module to consult; default = the app's
  if (!tableMod) { try { tableMod = await import('../table.js'); } catch { ctl.reason = 'table.js unavailable'; return ctl; } }

  const rackRadius = () => {
    const r = game.template?.system?.balls?.[0]?.params?.r;
    return Number.isFinite(r) && r > 0 ? r : (track?.refR ?? 0.028575);
  };
  /** The `solveOpts` seam, allow-listed: ONLY the solver options named here reach solveShot,
   * so the seam can never replace the solve's physical inputs (track, r, ledger, arrivals,
   * continuations) with a caller's — a typo or a hostile key is dropped, not honoured. The app
   * passes no solveOpts at all; the node gate passes `{ maxEvents }` to reach the solver's own
   * runaway refusal instead of injecting a throw (review r8 P2 arm). */
  const SOLVE_SEAM_KEYS = ['maxEvents'];
  const seamOpts = () => {
    const out = {};
    for (const k of SOLVE_SEAM_KEYS) if (solveOpts && solveOpts[k] !== undefined) out[k] = solveOpts[k];
    return out;
  };
  const orderIds = (ids) => ids.slice().sort((a, b) => {
    const ia = sessionOrder.indexOf(a);
    const ib = sessionOrder.indexOf(b);
    return ((ia < 0 ? Infinity : ia) - (ib < 0 ? Infinity : ib)) || (a - b);
  });
  /** Put a ball we posed back where game.js left it — the park (GH-276 form:
   * invisible at (0, −10, 0), scale 1) — and drop the marker. game.js never
   * re-parks a ball it has already parked (update() parks once, seek() only the
   * record's own balls), so a teardown that only cleared the marker would leave
   * the mesh floating at track coordinates over the next table (review). */
  const park = (b) => {
    const m = b.mesh;
    if (b.pocketed) { m.visible = false; m.position.set(0, -10, 0); m.scale.setScalar(1); }
    m.userData.obReturnPosed = false;
  };
  /** Release every pose we own. */
  const releaseAll = () => {
    for (const b of game.ballSet?.balls ?? []) {
      if (b?.mesh?.userData?.obReturnPosed) park(b);
    }
  };
  /** A stable identity for a record: a digest of its content (kernel version, initial
   * state, shot, events) — the same record re-parsed from the archive gets the same
   * key, so Playback's A → B → A revisits A's own first-playback snapshot. */
  const recordKey = (rec) => {
    if (!rec || typeof rec !== 'object') return null;
    let k = recordKeys.get(rec);
    if (k) return k;
    try {
      const str = JSON.stringify(rec);
      let h1 = 0x811c9dc5 >>> 0, h2 = 0x01000193 >>> 0;
      for (let i = 0; i < str.length; i++) {
        const c = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
        h2 = Math.imul(h2 ^ (c * 31 + i % 7), 0x811c9dc5) >>> 0;
      }
      k = `${str.length}:${h1.toString(16)}:${h2.toString(16)}`;
    } catch { k = null; }
    if (k) recordKeys.set(rec, k);
    return k;
  };
  const cloneCarried = (m) => new Map([...m].map(([id, st]) => [id, { ...st, q: Array.isArray(st.q) ? st.q.slice() : st.q }]));
  /** (#737 r6 class B, the invariant table §27.12: ORIENTATION BASIS × revisit-restore) the snapshot of a record's
   * starting states is also the snapshot of the BASES those states are drawn against. `baseQuat` belongs to the rack and
   * game.js re-pins it at every staging; r5 class D stopped reading it live by capturing it once per ball into
   * `baseBasis`, but that map is session-wide and the record-boundary clear empties it for anything the next record
   * puts back on the table (the live-ball purge did, before companion 2 class A moved the reader to membership). A → B → A, where A omits ball 5 and B plays it: B's staging re-pinned the shared ball object and the
   * purge dropped the basis A had captured, so revisiting A restored the station and the relative quaternion and then
   * composed them against whatever basis B had left — the same frame of the same record, drawn 159° apart. One snapshot
   * record per ball: {station, qRel, basis, ownership}. */
  const snapCarried = (m) => new Map([...cloneCarried(m)].map(([id, st]) => [id, baseBasis.has(id) ? { ...st, basis: baseBasis.get(id) } : st]));
  const SNAP_T_EPS = 1e-9;
  /** (#737 r8 class A, §27.12: SNAPSHOT TIME = RECORD CLOCK) the ONLY writer of a snapshot state. A record's snapshot is the
   * picture of the return system AT THAT RECORD'S OWN CLOCK — the states its first playback started from — so every write
   * carries the instant it was read at and the writer REFUSES any read taken anywhere else, counting it on the facade
   * (`snapshotBreaches`) rather than trusting the caller. Round 5's completion pass handed it `continuationAt(sol, id,
   * Infinity)`, the END of the solve: where an arrival pushes a newly seated ledger ball down a tray gap the ball moves
   * AFTER the origin, and the revisit then started it where the first visit had LEFT it — one station short, the future
   * written into the past. */
  const snapWrite = (snap, id, st, tRead) => {
    if (!snap || !st) return false;
    if (!(Math.abs(tRead - snap.origin) <= SNAP_T_EPS)) { snapshotBreaches += 1; return false; }
    snap.states.set(id, { ...st, q: Array.isArray(st.q) ? st.q.slice() : st.q });
    return true;
  };
  /** (#737 r8 class A) the state a solution shows for a ball AT the record's own clock. A ball stands at its first piece's
   * own initial station until that piece opens — nothing poses it before — so the read at or before that piece is that
   * piece's seat, never the piece the solve ENDS on. */
  const stateAtOrigin = (sol, id, t) => {
    const p0 = sol.pieces.get(id)?.[0];
    if (!p0) return null;
    if (p0.kind === 'rest') return { kind: 'rest', D: p0.D0, route: p0.route, q: Array.isArray(p0.q0) ? p0.q0.slice() : p0.q0 };
    return continuationAt(sol, id, Math.max(t, p0.t0));
  };
  /** (#737 r5 class F) the ids a record drove OFF THE TABLE. The kernel gives a jumped ball the terminal `BallOffTable`
   * event and leaves its motion Pocketed — the SAME motion a potted ball has — while game.js's `sinkIndex()` indexes
   * `BallPocket` events alone. So an off-table ball reaches this module reading `pocketed` with no hand-off and no
   * rejection, and the ledger admitted it as a layout-omitted NEWCOMER: a ball that flew off the rail was packed into
   * the tray. The kernel is frozen (ADR-0017: presentation only, no read-back), so the classification is made here,
   * from the record's own event stream, and the row is named. Computed once per record object. */
  const offTableSets = new WeakMap();
  const offTableOf = (rec) => {
    if (!rec || typeof rec !== 'object') return null;
    let s = offTableSets.get(rec);
    if (s) return s;
    s = new Set();
    try { for (const e of rec.events ?? []) { const off = e?.kind?.BallOffTable; if (off && off.ball !== undefined && off.ball !== null) s.add(off.ball); } } catch { /* not an event stream */ }
    offTableSets.set(rec, s);
    return s;
  };
  const offTableReason = (id) => `[OFF-TABLE] ball ${id} left the table in this record (kernel BallOffTable) — not a pot: never drawn in a chute or on the tray`;
  /** (#737 r6, the invariant table §27.12: REJECTION/REFUSAL × every boundary) a refusal that CARRIES keeps its reason.
   * r5 made every refusal a named row on the facade (`ctl.refusals()`), and r3 class B made rejection state that carries
   * across the record boundary — but the carried form was the bare `{kind:'rejected'}`, so the row vanished at the next
   * solve while the ball stayed culled: the facade said nothing was refused and the ball was gone. The name travels with
   * the state, prefixed once so a reader can tell a refusal decided HERE from one inherited from an earlier record. */
  const carriedReason = (reason) => (reason ? (reason.startsWith('[CARRIED] ') ? reason : `[CARRIED] ${reason}`) : null);
  /** (#737 r5 class D) the orientation basis a ball we own is composed against. `b.baseQuat` is the RACK's basis and
   * game.js re-pins it every time it stages a rack, so reading it live made a ledger ball's orientation depend on which
   * OTHER records a Playback session had visited in between — A → B → A turned ball 5 on the tray, because B's staging
   * had overwritten the shared ball object's basis. The return solution owns the basis of every ball it holds: captured
   * (cloned, never aliased) the first frame we pose it, kept until the RECORD THAT REINTRODUCES IT re-pins it (the
   * membership clear at the record boundary, companion 2 class A) or the rack changes. */
  const basisFor = (b) => {
    const held = baseBasis.get(b.id);
    if (held) return held;
    const src = b.baseQuat ?? null;
    if (!src) return null;
    const q = typeof src.clone === 'function' ? src.clone() : src; // a host whose basis cannot be cloned keeps the live object
    baseBasis.set(b.id, q);
    return q;
  };
  /** (#737 r6, the record-boundary invariant table §27.12: LEDGER STATION / HOLD-FALL-REST × revisit-restore) bind a carried
   * route reference to the LIVE track object. Routes belong to the track, and a re-activation (a table preview and its
   * revert, an equipment broadcast, the archive-rack boundary) BUILDS A NEW ONE: `validateTrack` returns fresh route objects
   * for the same definition. The solver's lane law compares routes by IDENTITY (`front.route === rear.route`, kinematics.js),
   * so a state carried across a re-activation seated its ball on a route the current track does not own. Only the memo's
   * `carriedRest` was re-bound, and `continuationAt(prev, …)` — which reads the RESTORED solution's own pieces — outranks it
   * in the ledger, so every resting ball of a reverted session was still seated on the previous track object. Bound at the
   * point of USE instead: whatever produced the state (the carry, a content snapshot, a rack memo), the route the solve sees
   * is this track's. A no-op (same object) on the ordinary path; a track that no longer carries the route keeps what it had. */
  const bindRoute = (route) => {
    if (!route || !track) return route;
    const live = route.pocket >= 0 ? track.routes.get(route.pocket) : track.trayRoute;
    return live ?? route;
  };
  const bindHandoff = (h) => { if (!h || !h.route) return h; const live = bindRoute(h.route); return live === h.route ? h : { ...h, route: live }; };
  const shiftHandoff = (h, dt) => (dt ? { ...h, tH: h.tH - dt, tLand: h.tLand - dt } : h);
  const removeDebugVisual = () => {
    try {
      const s = window.__dbg?.scene;
      const g = s?.getObjectByName?.('obBallReturnDebug');
      if (g) s.remove(g);
    } catch { /* no scene */ }
  };
  /** Everything that is per-session (rack-scoped) state: stashed at a Playback borrow,
   * restored at its close. Maps / arrays are copied so the DVR session cannot alias them. */
  const stashSession = () => ({
    trackId: ctl.trackId, tableId,
    solution, solArrivals: new Map(solArrivals), handoffs: handoffs ? new Map(handoffs) : null, indexedFor, solutionKey,
    sinksGen, baseGen, switchT, switchOrigin, cursor, ballSetRef, sessionOrder: sessionOrder.slice(), ledgerLast: ledgerLast.slice(),
    carriedRest: new Map(carriedRest), recordRef, baseSnapshots: new Map(baseSnapshots), indexRejected: new Set(indexRejected),
    baseBasis: new Map(baseBasis), // the bases this session captured travel with it (#737 r5 class D)
    seedRejected: seedRejected ? new Set(seedRejected) : null, clock: { ...clock },
    // (#737 review r2, class A) OWNERSHIP travels with the solution it was computed for: the early hand-offs (ownMap, the
    // instants poseSink asks about) and the pass count — restoring solutionKey without them made ensureSolution keep the
    // solution and skip the pass, ballReturnOwns() read an empty map, and the host resumed sinking an already-held ball
    ownMap: new Map([...ownMap].map(([id, o]) => [id, { ...o }])), ownRounds,
  });
  const restoreSession = (st) => {
    solution = st.solution; solArrivals = new Map(st.solArrivals); handoffs = st.handoffs ? new Map(st.handoffs) : null;
    indexedFor = st.indexedFor; solutionKey = st.solutionKey; sinksGen = st.sinksGen; baseGen = st.baseGen; switchT = st.switchT; switchOrigin = st.switchOrigin ?? 0;
    cursor = st.cursor; sessionOrder.length = 0; sessionOrder.push(...st.sessionOrder); ledgerLast = st.ledgerLast.slice();
    carriedRest.clear(); for (const [k, v] of st.carriedRest) carriedRest.set(k, v);
    baseBasis.clear(); if (st.baseBasis instanceof Map) for (const [k, v] of st.baseBasis) baseBasis.set(k, v); // (#737 r5 class D)
    recordRef = st.recordRef; baseSnapshots = new Map(st.baseSnapshots); indexRejected = new Set(st.indexRejected);
    seedRejected = st.seedRejected ? new Set(st.seedRejected) : null;
    clock.t = st.clock.t; clock.lastBall = st.clock.lastBall; clock.lastPose = st.clock.lastPose;
    // the one rule (the ownership ledger, the within-record pose guarantee): a solution and its ownership are restored TOGETHER — a
    // stash from before this field existed carries no ownMap and forces the pass to run again (solutionKey dropped)
    if (st.ownMap instanceof Map) { ownMap = new Map([...st.ownMap].map(([id, o]) => [id, { ...o }])); ownRounds = st.ownRounds ?? 0; }
    else { ownMap = new Map(); ownRounds = 0; solutionKey = null; }
    // the restore may have REBUILT the rack (restoreRack → applyRack): it is the same rack by
    // content, so the live session binds to the new ball set instead of resetting on it
    ballSetRef = game.ballSet;
    // a refusal that happened INSIDE the borrow belongs to the archive, not to the session being
    // handed back: it must not follow the live timeline out (refutation round 2)
    if (refusalReported !== null) { refusalReported = null; if (armedReason) ctl.reason = armedReason; }
  };
  /** Playback opened on the live bed: park what we posed, stash the live session, start a fresh one. */
  const enterBorrow = () => {
    if (borrow && !borrow.lost) return;
    if (borrow?.lost) borrow = null;
    releaseAll();
    // the LIVE record is the one this session last solved for (recordRef): at the
    // dvr-marked emission game.record is already the archived record (game.js
    // loadRecord sets it before setState), so it must not be read from there
    borrow = { live: stashSession(), liveRecord: recordRef ?? null, closing: false };
    resetSolutionState();
    // (#737 r5 class A) a FRESH borrow is a new time base, and it needs the bookkeeping the PLAYBACK hook does for every
    // other record — which the dvr-marked borrow branch returns before ever reaching. Without it the FIRST record played
    // inside the borrow solved with `switchT === null`: no base switch, so no content key, so no `baseSnapshots` entry for
    // it. An A → B → A revisit inside one Playback session then had nothing to replay A from and fell back to B's solution
    // plus the mutable `carriedRest` — A's tray ball was drawn at another station on the second visit (the replay
    // guarantee, the ownership ledger). The reset above left nothing to carry, so this base starts at 0 and the snapshot the first
    // solve stores is the empty one it honestly started from. Only on the fresh entry: a borrow already open returns at the
    // top of this function, so a LATER record inside the same session keeps its ordinary carry from the one before it.
    switchT = 0; baseGen += 1;
    ctl.stats.borrows += 1;
  };
  /** The memo the Playback player borrows when it opens on a bed this module does not own.
   * Two ways in, in this order:
   *   1. a memo of the LIVE rack (ball-set identity) — the player previewed an inert bed and
   *      opened the player there; nothing touched the rack (review round 9);
   *   2. else a memo of the ball set this module last SAW as the live rack — the CROSS-EQUIPMENT
   *      open, where swapBed() quietly re-racked one statement earlier, so the live session's
   *      ball set is already gone from `game.ballSet` and (1) cannot match (review r8 P1). The
   *      oldest such memo is the live one: a preview stashes the live bed's session first and
   *      the previewed bed's beside it;
   *   3. else the memo of the switch that is still resolving — the same open with a frame
   *      between the swap and the emission, where (2) has already advanced to the new ball set.
   *      Bounded to that switch: once its activation settles `inFlightMemo` is null.
   * A memo whose rack the game has genuinely replaced is never adopted: an announced rerack
   * emits AIM, and that hook refreshes `liveBallSet` and retires the memo through the clear in
   * checkTable before any of these three can see it. */
  const pickBorrowMemo = () => {
    for (const m of rackMemos.values()) if (m.session && m.ballSet === game.ballSet) return m;
    for (const m of rackMemos.values()) if (m.session && m.ballSet === liveBallSet) return m;
    const m = inFlightMemo !== null ? rackMemos.get(inFlightMemo) : null;
    return m?.session ? m : null;
  };
  /** The live record's sink index is rebuilt by the close re-stage (same record, same
   * entries): adopt it without a re-solve so the restored session stays bit for bit. */
  const adoptIndex = () => { if (game.sinkInfo && game.sinkInfo !== indexedFor) indexedFor = game.sinkInfo; };
  /** The live record is back (re-staged with recordRef): restore the live session and hold
   * its clock through the close's settle seek. */
  const beginClose = () => {
    const live = borrow.live;
    releaseAll();
    restoreSession(live);
    borrow = { live: null, liveRecord: null, closing: true, closingFor: ctl.trackId };
    adoptIndex();
  };
  /** Playback handed the bed back (the dvr-marked settled emission): drop the DVR session,
   * restore the live one bit for bit, and hand the ball clock to the continuation branch. */
  const exitBorrow = () => {
    if (!borrow) return;
    releaseAll();
    const live = borrow.live;
    borrow = null;
    if (live) restoreSession(live);
    adoptIndex();
    clock.lastBall = game.clock;
  };
  const resetSolutionState = () => {
    solution = null; solArrivals = new Map(); handoffs = null; indexedFor = null; solutionKey = null;
    ownMap = new Map(); ownRounds = 0; // (#737 r6, §27.12 OWNERSHIP × borrow entry) the pass belongs to the solution: a fresh session starts with none
    cursor = null; switchT = null; switchOrigin = 0; ballSetRef = null; sessionOrder.length = 0; ledgerLast = []; carriedRest.clear(); baseBasis.clear();
    indexRejected = new Set(); seedRejected = null; recordRef = undefined; baseSnapshots = new Map(); refusalReported = null;
    clock.t = 0; clock.lastBall = null; clock.lastPose = null;
  };

  /** (Re)build handoffs for the current record's sink index. */
  const indexSinks = (sinks) => {
    handoffs = new Map();
    indexedFor = sinks;
    sinksGen += 1;            // a solution keyed before the lazy sink index existed must re-solve
    indexRejected = new Set();
    if (!sinks) return;
    const r = rackRadius();
    const qTmp = {};
    for (const [id, s] of sinks) {
      const h = handoffFromSink(s, { track, pockets, r });
      // (#737 review r2, class C) the ball's ORIENTATION at the hand-off instant, read from the host's own sink pose law
      // (game.sinkPoseAt = game.js's binding of sinkpivot.js): carried through the fall and a hold while the ball is drawn
      // above the shield; the reset to the rack base happens only where the ball is hidden (kinematics.js, spec §6)
      if (h && hostOwnsHook() && s.pivot) { const sp = game.sinkPoseAt(s, Math.max(0, h.tH - s.t - 1e-6), qTmp); if (sp && [sp.qx, sp.qy, sp.qz, sp.qw].every(Number.isFinite)) h.q = [sp.qx, sp.qy, sp.qz, sp.qw]; }
      if (h) handoffs.set(id, h);
      else indexRejected.add(id); // unserved pocket / netted / dressed: the legacy cull keeps it
    }
  };

  /** Solve for the current (state, base, sinks, pocketed set) key — pure in the key
   * plus the continuation state carried from the previous solution. */
  const ensureSolution = () => {
    const balls = game.ballSet?.balls;
    if (!balls || !track) return null;
    if (game.ballSet !== ballSetRef) { // rack rebuilt
      ballSetRef = game.ballSet;
      sessionOrder.length = 0;
      carriedRest.clear();
      indexRejected = new Set(); seedRejected = null;
      baseSnapshots = new Map(); // snapshots are per rack: an identical record in a NEW rack starts afresh (review round 4)
      baseBasis.clear();         // …and so are the bases: a rebuilt rack pins its own (#737 r5 class D)
      solution = null; solArrivals = new Map(); handoffs = null; indexedFor = null; solutionKey = null; cursor = null;
    }
    const inPlayback = machine.state === 'PLAYBACK';
    // record identity: a NEW record entered without a stateChange (game.js
    // loadRecord `stage: 'quiet'` inside PLAYBACK — playback.js stageShot, the
    // offline-render segment / beat walk) resets game.clock to 0 silently; that is
    // a time-base switch exactly like a shot (review P1) — same bookkeeping
    const rec = game.record ?? null;
    if (borrow && !borrow.closing && borrow.liveRecord && rec === borrow.liveRecord && borrow.live && borrow.live.trackId === ctl.trackId) beginClose(); // (a stateChange path reached here first; only under the live track)
    if (borrow?.closing) { adoptIndex(); return solution; } // no re-solve while the close re-stage seeks the live record
    let newRecord = false;
    if (rec !== recordRef) {
      if (recordRef !== undefined && switchT === null && inPlayback) {
        switchT = Number.isFinite(clock.lastPose) ? clock.lastPose : clock.t;
        baseGen += 1;
      }
      newRecord = recordRef !== undefined;
      recordRef = rec;
      // (#737 companion 2, class A) …and the ORIENTATION BASIS of every ball this record REINTRODUCES is this
      // record's to pin. game.js re-pins `baseQuat` at exactly two places — `shoot()` and `loadRecord()` — and both
      // write it over `game.playbackBalls`, the record's own membership: a ball the record puts back on the table
      // gets a fresh basis (identity for a quiet stage), a ball still in the return system and absent from the new
      // record keeps the one it was captured against. So MEMBERSHIP is the reader, at the record boundary, where
      // the pin happens. r5 class D purged the basis from the sampled `pocketed` flag instead (below), and that
      // flag is a function of the SEEK HISTORY: a quietly staged record that reintroduces a previously returned
      // ball reads it `pocketed` when the first seek lands past its sink TTL and NOT pocketed when the frame at
      // t = 0 was rendered first, so the same record's frame at t = 2 was drawn 91.7° apart depending on which
      // came first (review round 12 P2). Clearing a ball game.js did NOT re-pin is a no-op — `baseQuat` is written
      // nowhere else, so the re-capture returns the same quaternion — which is why membership can be read
      // unconditionally here. A REVISIT restores the snapshot's own bases below and outranks this.
      for (const b of game.playbackBalls ?? []) if (b) baseBasis.delete(b.id);
    }
    const sinks = game.sinkInfo ?? null;
    const indexChanged = sinks !== indexedFor; // a NEW index arriving in this very solve belongs to the NEW record
    if (indexChanged) indexSinks(sinks);
    const pocketedIds = [];
    for (const b of balls) if (b.pocketed) pocketedIds.push(b.id);
    pocketedIds.sort((a, b) => a - b);
    const playbackIds = new Set((game.playbackBalls ?? []).map((b) => b.id));
    const keyIds = inPlayback ? pocketedIds.filter((id) => !playbackIds.has(id)) : pocketedIds;
    const key = `${inPlayback ? 'P' : 'I'}|${baseGen}|${sinksGen}|${keyIds.join(',')}`;
    if (key === solutionKey) return solution; // a key that FAILED to solve stays null until the key changes
    const t0 = performance.now();
    const r = rackRadius();
    const pocketedSet = new Set(pocketedIds);
    const offTable = offTableOf(rec); // ids this record drove off the table — never a pot (#737 r5 class F)

    // ---- continuation from the previous solution (P1-B) -------------------------
    // Every ball the previous solution still knows (and that is still off the
    // table) is CARRIED: rolling → continuation at its station/speed/orientation,
    // settled → ledger entry at its rest station, still falling → the same arrival
    // with its handoff times shifted to the new base. Read at tPrev = the last time
    // the previous solution was posed at (on its own base); on a time-base switch
    // (a new record) the continuation starts at t0 = 0, otherwise at tPrev itself.
    const prev = solution;
    const baseSwitch = switchT !== null;
    const tPrev = baseSwitch ? switchT : (Number.isFinite(clock.lastPose) ? clock.lastPose : clock.t);
    // a REPLAY of a record (same record object re-entering PLAYBACK) restarts from
    // the carried states its first playback started from, so the replay
    // reproduces the first playback frame for frame (review P3)
    const recKey = baseSwitch ? recordKey(rec) : null;
    const replayOf = recKey ? baseSnapshots.get(recKey) : null; // a replay OR a revisit (fresh parse, same content)
    // …AT THE RECORD CLOCK they started from: a session that joined the record late (a revert or an activation landing
    // mid-record, review r12 P2) started its carried states at record clock `origin` > 0, and the replay resumes them
    // there — before it the module posed nothing in the first playback (it was absent) and poses nothing now (poseAt
    // is null before a ball's first piece); from it the two playbacks agree frame for frame
    const tOrigin = replayOf ? replayOf.origin : (baseSwitch ? switchOrigin : tPrev);
    switchT = null; switchOrigin = 0;
    // the sink index is STALE (still the previous record's) only when the record
    // changed and the index did not: game.js nulls it at loadRecord/shoot and
    // rebuilds it lazily at the first seek — when that rebuild lands in the same
    // solve as the record change, the index is the new record's own
    const staleIndex = baseSwitch && newRecord && !indexChanged;
    let carried; // id → { kind:'roll', route, D, v, q } | { kind:'rest', D } | { kind:'fall', handoff }
    if (replayOf) {
      carried = cloneCarried(replayOf.states);
      // …and the BASES they are composed against (class B): unconditionally, because the purge below and another
      // record's staging may both have run since — the snapshot, not the live rack, says what this record's frame is
      for (const [id, st] of replayOf.states) if (st.basis) baseBasis.set(id, st.basis);
    } else {
      carried = new Map();
      // (#737 r4 class A, the general form of round 22d's D3) a NEW record's OWN pot outranks every state carried from another
      // record. A ball this record's own index names — a hand-off into a served pocket, or a pot into an unserved one — was ON THE
      // TABLE when the record began: whatever the previous record's solution knew of it (a rejection, a fall or hold in flight, a
      // roll, a rest) is the state of a ball since revived, and it applies to no frame of this record. The carry is a WITHIN-record
      // law (the ownership ledger, beside the continuation guarantee). D3 skipped a carried roll/rest for such a ball, but the rejection
      // was decided before it and won: a quietly staged record sought straight past its sink TTL (the ball already `pocketed` at
      // the record's first solve) drew nothing for a ball it had itself potted into a served pocket, while a stepwise seek through
      // the pot showed it. Read where the record's own index is present (`!staleIndex`): a ball is `pocketed` by the new record
      // only after game.js's seek, which rebuilds the index first, so the record's first solve that can see such a ball sees its
      // own index too.
      const ownIndex = baseSwitch && newRecord && !staleIndex;
      const ownPot = (id) => ownIndex && ((handoffs?.has(id) ?? false) || indexRejected.has(id));
      if (prev) {
        // every ball the previous solution knows that is still off the table
        // (`pocketed`) is carried — a revived ball reads pocketed === false and is
        // not; a ball potted in THIS record that an earlier in-base solve already
        // saw is carried as 'fall'/'roll' and re-enters identically (same closed
        // forms), so game.playbackBalls' freshness at a stateChange never matters
        for (const id of pocketedIds) {
          if (ownPot(id)) continue; // this record's own pot: nothing carried from another record applies — its index decides it below
          // (#737 r3 class B) rejection is state — decided BEFORE the in-flight fallback below: a ball the previous solution
          // REFUSED has no pieces, exactly like an arrival that had not handed off yet, so the fallback re-offered it as a
          // fresh 'fall' on the new base (dated before the base's own instants) and it won the hold its refusal had just been
          // decided against — the same record re-solved at the settle held a different pair of balls (eleven pots into
          // pocket 4 on the high fixture: 8 + 9 held live, 10 + 11 after the settle). Refused stays refused off the table.
          if (prev.rejected?.has(id)) { carried.set(id, { kind: 'rejected', reason: carriedReason(prev.refusals?.get(id)) }); continue; } // …with the name it was refused under (#737 r6, §27.12)
          let st = continuationAt(prev, id, tPrev);
          if (!st) {
            // (round 22d, refuter J's D1) a ball whose motion on the previous solution BEGINS after tPrev — a late-joined session's
            // carried states start at their origin, and the settle's re-solve reads at the last POSED frame, before it — is carried
            // as its first piece's initial state, DATED on the new base (solveShot seats a continuation at its own t0), never dropped
            // to the ledger: dropped, every carried ball of the AIM revert's replay stood at its END station (1 188 / 1 337 mm off)
            // …and it is carried as the SEED the previous solve was given for it (#737 r7 class C, boundary event E8), not as the
            // piece that seat PRODUCED: an event at the resume's own instant — a cluster join with a ball that entered before it —
            // writes the post-event state into the piece, and the next solve, which re-derives that same event from the other
            // members' pre-event states, applies it a SECOND time (the AIM revert's settle re-solve merged the chain twice:
            // 0.3332 → 0.3133 → 0.3033 m/s, 0.166 mm at the first drawn frame, and the replay no longer reproduced the first
            // playback). The seed replays this solve's own event sequence exactly. A resume the previous solve never reached
            // (its solve ended first) has no piece at all and is kept by the same read.
            const seed = prev.resumed?.get(id);
            const p0 = prev.pieces.get(id)?.[0];
            if (seed && seed.t0 > tPrev) {
              st = { kind: 'roll', route: seed.route, D: seed.D, v: seed.v, q: Array.isArray(seed.q) ? seed.q.slice() : seed.q, t0: baseSwitch ? tOrigin + (seed.t0 - tPrev) : seed.t0 };
              if (seed.follow === true) st.follow = true;
              if (seed.hold) st.hold = { ...seed.hold };
            } else if (p0 && p0.t0 > tPrev && p0.kind !== 'fall' && p0.kind !== 'hold') {
              const st0 = continuationAt(prev, id, p0.t0);
              if (st0) { if (st0.kind === 'roll') st0.t0 = baseSwitch ? tOrigin + (p0.t0 - tPrev) : p0.t0; st = st0; }
            }
          }
          if (!st) {
            // prev knew it only as an arrival that had NOT handed off yet at tPrev
            // (still in the sink — a pot as the record's last event with a long
            // sink; unreachable with game.js SETTLE_PAD 0.4 vs a max handoff delay
            // of 0.31 s, guarded anyway): still ours, on the new base
            const hp = solArrivals.get(id);
            if (hp) carried.set(id, { kind: 'fall', handoff: shiftHandoff(hp, baseSwitch ? tPrev - tOrigin : 0) }); // rebased like the roll (#737 r3 class D)
            continue;
          }
          if (st.kind === 'hold') { // order 18 item 0: a ball held where the sink left it resumes as an OWNED arrival at the new base's own instant
            const hp = solArrivals.get(id); if (!hp) continue;
            carried.set(id, { kind: 'fall', handoff: ownHandoff(shiftHandoff(hp, baseSwitch ? tPrev - tOrigin : 0), { t: baseSwitch ? tOrigin : tPrev, x: st.x, y: st.y, z: st.z, q: st.q }, true) }); // the hold resumes at the new base's ORIGIN (#737 r3 class D) // the held ball's orientation carries across the base (class C)
            continue;
          }
          if (st.kind === 'fall') {
            const hp = solArrivals.get(id); // the previous solution's OWN arrival (its times live on the previous base)
            if (!hp) continue;
            // shifted ONCE, here — and REBASED exactly like the rolling continuation (#737 r3 class D): the instant tPrev on the previous
            // base is tOrigin on this one (a late join's record clock, not 0); subtracting tPrev alone fast-forwarded a carried fall by the
            // origin (85 mm at the first drawn frame, then an immediate roll) when a fall memoised at A 0.746 s was restored into B at 0.5 s
            st.handoff = shiftHandoff(hp, baseSwitch ? tPrev - tOrigin : 0);
          }
          // (round 22d, refuter J's D3: a roll / rest carried for a ball the NEW record pots itself was stale — the ball vanished
          // until the settle) — now the `ownPot` skip at the top of this loop, for every carried kind (#737 r4 class A)
          carried.set(id, st);
        }
      }
      // rejection is state too: a ball the previous solution classified as rejected
      // (potted where we do not serve) stays rejected while it is off the table
      const prevRejected = prev?.rejected ?? seedRejected;
      if (prevRejected) for (const id of pocketedIds) if (!carried.has(id) && !ownPot(id) && prevRejected.has(id)) carried.set(id, { kind: 'rejected', reason: carriedReason(prev?.refusals?.get(id)) }); // never over the record's own pot (#737 r4 class A), with its name (r6)
      seedRejected = null;
    }
    // (#737 r8 class B, §27.12: the record snapshot is TOTAL) every ball of the set carries an EXPLICIT state into the
    // solve — `hidden` where the module holds nothing for it — so the snapshot below names them all and no consumer has to
    // fall back to a session-wide mutable map for a ball the snapshot forgot. Before this, a ball no record had yet given a
    // station (a layout omission on a terminal-chutes system: hidden, no chute, nothing carried) was simply ABSENT from the
    // snapshot, and the ledger read `carriedRest` — the live map — instead: record A omitted ball 1, record B potted it into
    // pocket 4, and the revisit of A drew ball 1 sitting in B's chute. The three `hidden` reasons are diagnostic only; every
    // consumer treats `hidden` as "nothing carried", exactly as an absent entry used to read.
    for (const b of balls) {
      if (!b) continue;
      const id = b.id;
      if (carried.has(id)) continue;
      if (!b.pocketed) { carried.set(id, { kind: 'hidden', why: 'on the table' }); continue; }
      // a ball this record's own index names is the index's to decide (an arrival below, or a rejection): nothing is carried
      // for it, exactly as when it had no entry at all
      if (handoffs?.has(id)) { carried.set(id, { kind: 'hidden', why: "named by this record's index" }); continue; }
      // …otherwise the session's own last settled pose for it, if it has one (a rack memo's restore has no previous SOLUTION
      // to carry from — this is where its stations re-enter), folded in HERE so the snapshot records it
      const memo = carriedRest.get(id);
      if (memo && Number.isFinite(memo.D)) { carried.set(id, { kind: 'rest', D: memo.D, route: memo.route, q: Array.isArray(memo.q) ? memo.q.slice() : memo.q }); continue; }
      carried.set(id, { kind: 'hidden', why: 'off the table, no station this session' });
    }
    if (recKey && !replayOf && !baseSnapshots.has(recKey)) {
      const snap = { states: new Map(), origin: tOrigin };
      for (const [id, st] of snapCarried(carried)) snapWrite(snap, id, st, tOrigin); // the carry is dated at tOrigin by construction (every kind is rebased above)
      baseSnapshots.set(recKey, snap);
      while (baseSnapshots.size > SNAPSHOT_CAP) baseSnapshots.delete(baseSnapshots.keys().next().value);
    }

    // ---- arrivals of this record --------------------------------------------------
    const solRefusals = new Map(); // id → the reason this solve REFUSES to draw it (#737 r5 classes C/F); merged into solution.rejected
    const arrivals = [];
    const arrivalMap = new Map();
    const pushArrival = (id, h0) => { const h = bindHandoff(h0); arrivals.push({ id, handoff: h }); arrivalMap.set(id, h); }; // on the LIVE track's route (#737 r6, §27.12 revisit-restore)
    for (const [id, h] of handoffs ?? []) {
      const st = carried.get(id);
      if (st && st.kind !== 'hidden') { if (st.kind === 'fall') pushArrival(id, st.handoff); continue; } // `hidden` = nothing carried (#737 r8 class B)
      if (staleIndex) {
        // the sink index still belongs to the PREVIOUS record: a ball it names is
        // ours only if it is still off the table, and its times live on the OLD base
        if (!pocketedSet.has(id)) continue;
        pushArrival(id, shiftHandoff(h, tPrev - tOrigin)); // the old base's times, rebased to this base's origin (#737 r3 class D)
        continue;
      }
      if (inPlayback || pocketedSet.has(id)) pushArrival(id, h);
    }
    for (const [id, st] of carried) { // a carried 'fall' whose id the current index no longer names
      if (st.kind === 'fall' && !arrivalMap.has(id)) pushArrival(id, st.handoff);
    }
    // (#737 r5 class C) on an OWNERSHIP-REQUIRED track (V13: the nearest drawn seat lies inside the sink's last drawn
    // pose) an arrival this module cannot ask a sink pose for is REFUSED BY NAME, never served. The ownership pass below
    // skips any arrival whose sink carries no `pivot` or whose hand-off did not come from one — a LEGACY sink, where
    // `handoffFromSink` fell back to the cup mouth and tagged the source 'legacy' — because there is no pose law to scan;
    // that `continue` left the early-contact check unrun. On a track that needs the hand-off precisely BECAUSE the drawn
    // sink overlaps the seat, an unscanned arrival is drawn straight through whatever is held there: eight legacy pots
    // into one chute on the high fixture left the host's sinking ball and a module-drawn ball inside one diameter. The
    // check cannot be run, so the ball stays where game.js left it (culled in the pocket, the legacy cull) and the row is
    // named on the facade — the same fail-closed rule the track's own gates follow.
    // (#737 r5 class F) and an off-table ball is refused wherever it entered: a sink index that names one (a host that
    // indexed it) must not turn it into an arrival either.
    // (#737 r6 class A, the invariant table §27.12: OWNERSHIP + VALIDATION RECORD × new shot / quiet staging) the V13 verdict
    // is a verdict ABOUT ONE RECORD'S INDEX, and it is read where that index is. A carried arrival — a ball this module is
    // already holding or still landing when the next record starts — is not in the new record's index at all: `game.sinkInfo`
    // has been nulled and rebuilt for the new shot, so the re-read below found no entry and refused a ball it had already
    // served as "a legacy sink, no pivot". Eight pivot pots into one chute on the high fixture leave ball 8 held above the
    // seat; the very next shot hid it for the rest of the session. So: the verdict is STAMPED on the hand-off with the index
    // generation it was read against (`sinksGen`, monotone per (re)index and stashed/restored with the session) and travels
    // with the ball through the carry, the content snapshot and the borrow; it is re-read only while that same index stands.
    // The index the arrivals were built from is `indexedFor` — the same Map as `game.sinkInfo` at this point of the solve,
    // named for what it is.
    if (track.ownershipRequired || (offTable && offTable.size)) {
      for (let i = arrivals.length - 1; i >= 0; i--) {
        const a = arrivals[i];
        if (offTable?.has(a.id)) { arrivals.splice(i, 1); arrivalMap.delete(a.id); solRefusals.set(a.id, offTableReason(a.id)); continue; }
        if (!track.ownershipRequired) continue;
        const val = a.handoff?.ownValid ?? null;
        if (val && val.gen !== sinksGen) continue; // validated against ANOTHER record's index: that verdict stands (never re-read here)
        const sInfo = indexedFor?.get(a.id) ?? null;
        const src = String(a.handoff?.source ?? 'none');
        if (hostOwnsHook() && sInfo && sInfo.pivot && src.startsWith('pivot')) {
          const stamped = { ...a.handoff, ownValid: { gen: sinksGen, key: recKey ?? null, source: src, pocket: a.handoff?.pocket ?? null } };
          a.handoff = stamped; arrivalMap.set(a.id, stamped); // the ownership data this arrival was validated with, carried from here on
          continue;
        }
        arrivals.splice(i, 1); arrivalMap.delete(a.id);
        solRefusals.set(a.id, `[V13] pocket ${a.handoff?.pocket ?? '?'}: no sink pose law for this arrival (${sInfo && sInfo.pivot ? `hand-off source ${src}` : 'legacy sink, no pivot'}${hostOwnsHook() ? '' : '; host lacks the ownership hook'}) — the early-contact check cannot be run on an ownership-required track`);
      }
    }

    // ---- continuations + ledger ---------------------------------------------------
    const continuations = [];
    const ledgerIds = [];
    const ledgerSt = new Map(); // id → { D, route, q }
    // a ball that is ON THE TABLE (revived: respot / ball in hand / layout) has left
    // the return system: its carried rest station is retired now, so a later layout
    // or archived record that omits it packs it afresh instead of re-seating it at a
    // station another ball may since have taken (review r4 P2-2)
    // The STATION only: the orientation basis is rebound from record MEMBERSHIP at the boundary above, never from
    // this sampled `pocketed` flag — the flag depends on where the first seek landed, the membership does not
    // (#737 companion 2, class A; r5 class D purged the basis here too)
    for (const b of game.ballSet?.balls ?? []) { if (!b || b.pocketed) continue; carriedRest.delete(b.id); }
    const solRejected = new Set(indexRejected); // this record's own rejections (pocketed or not yet) + carried ones
    for (const id of solRefusals.keys()) solRejected.add(id); // the named refusals of this solve (#737 r5 classes C/F)
    for (const id of orderIds(pocketedIds)) {
      if (arrivalMap.has(id)) continue;
      // (#737 r5 class F) a ball driven off the table reads `pocketed` here with no hand-off and no rejection — the common
      // case is no sink entry at all, so it never reached the arrivals filter above and would enter the ledger as a
      // newcomer. Name it and cull it: it is not a pot, and nothing in a chute or on the tray may draw it.
      if (offTable?.has(id) && !solRefusals.has(id)) solRefusals.set(id, offTableReason(id));
      const cst0 = carried.get(id);
      if (cst0?.kind === 'rejected' || indexRejected.has(id) || solRefusals.has(id)) {
        if (cst0?.reason && !solRefusals.has(id)) solRefusals.set(id, cst0.reason); // the carried refusal is still a NAMED row (#737 r6, §27.12)
        solRejected.add(id); continue; // stays culled, never in the tray (a named refusal counts too: r5 classes C/F)
      }
      if (inPlayback && playbackIds.has(id)) continue;
      const st = carried.get(id);
      if (st && st.kind === 'roll') { continuations.push({ id, route: bindRoute(st.route), D: st.D, v: st.v, q: st.q, t0: Number.isFinite(st.t0) ? st.t0 : tOrigin, follow: st.follow === true, hold: st.hold ?? null }); continue; }
      ledgerIds.push(id);
      const rest = st && st.kind === 'rest' ? st : null; // the carry alone — the `carriedRest` fallback is folded into it above (#737 r8 class B)
      if (rest && Number.isFinite(rest.D)) ledgerSt.set(id, { D: rest.D, route: bindRoute(rest.route), q: rest.q });
    }
    // ledger = balls off the table that are neither arrivals nor continuations;
    // each keeps the rest pose it had — station, ROUTE (an overflow ball on the
    // trunk stays on the trunk) and orientation (a hole left by a revived ball stays
    // a hole on the level tray); newcomers (layout-omitted) pack behind the last
    // carried one in session order.
    // a terminal-chutes system has no collector: a ball with no known chute (a
    // layout-omitted newcomer, a memo without a route) is NOT posed — it stays culled
    // as game.js left it (schema 1.1 ruling; the solver skips route-less entries too)
    const ledger = ledgerIds
      .filter((id) => track.trayRoute || (ledgerSt.has(id) && ledgerSt.get(id).route))
      .map((id) => (ledgerSt.has(id) ? { id, ...ledgerSt.get(id) } : id));
    try {
      solution = solveShot({ track, r, ledger, arrivals, continuations, ...seamOpts() });
      // ---- order 18 item 0: the ownership pass (monotone fixed point) -------------------------
      // For every arrival with a pivot entry: the first instant in [s.t, tH] at which the host's sink pose
      // (game.sinkPoseAt — game.js's own binding of sinkpivot.js) comes within one diameter of any ball this
      // solution draws or holds (poseAt with `physical`: culled perches and holds count — they are balls). An
      // ownership can only move EARLIER between rounds (min), so the loop terminates on the 1 ms grid; each
      // round re-solves with the early hand-offs in place. Sinks without a pivot (legacy) keep tH: no pose law.
      const own = new Map(); ownRounds = 0;
      if (hostOwnsHook() && game.sinkInfo && arrivals.length) {
        const freeOf = new Map(arrivals.map((a) => [a.id, a.handoff.own ? { ...a.handoff, tH: a.handoff.own.tHFree } : a.handoff]));
        const tmp = {}, pose = {};
        const scan = (sol) => {
          const out = new Map(); const ids = [...sol.pieces.keys()];
          for (const a of arrivals) {
            const h0 = freeOf.get(a.id); const s = game.sinkInfo.get(a.id);
            if (!h0 || !s || !s.pivot || !String(h0.source).startsWith('pivot')) continue;
            const tFree = h0.tH; const hit = (dt) => { const sp = game.sinkPoseAt(s, dt, tmp); if (!sp) return null; for (const id of ids) { if (id === a.id) continue; const q = poseAt(sol, id, s.t + dt, pose, true); if (q && Math.hypot(sp.x - q.x, sp.y - q.y, sp.z - q.z) <= 2 * r) return sp; } return false; };
            let found = null;
            for (let dt = 0; s.t + dt <= tFree + 1e-12; dt += 1e-3) { const v = hit(dt); if (v === null) break; if (v) { found = dt; break; } }
            if (found === null) continue;
            let lo = Math.max(0, found - 1e-3), hi = found;
            for (let it = 0; it < 12; it++) { const mid = 0.5 * (lo + hi); if (hit(mid)) hi = mid; else lo = mid; }
            const sp = game.sinkPoseAt(s, hi, tmp); out.set(a.id, { t: s.t + hi, x: sp.x, y: sp.y, z: sp.z, dtOwn: hi, q: [sp.qx, sp.qy, sp.qz, sp.qw].every(Number.isFinite) ? [sp.qx, sp.qy, sp.qz, sp.qw] : undefined }); // the orientation at the early hand-off (class C)
          }
          return out;
        };
        for (let round = 0; round < 8; round++) {
          const sc = scan(solution); let changed = false;
          for (const [id, o] of sc) { const cur = own.get(id); if (!cur || o.t < cur.t - 1e-9) { own.set(id, o); changed = true; } }
          if (!changed) break;
          for (const a of arrivals) if (own.has(a.id)) a.handoff = ownHandoff(freeOf.get(a.id), own.get(a.id));
          solution = solveShot({ track, r, ledger, arrivals, continuations, ...seamOpts() });
          ownRounds = round + 1;
        }
      }
      ownMap = new Map([...own].map(([id, o]) => [id, { dtOwn: o.dtOwn }]));
      for (const a of arrivals) if (own.has(a.id)) arrivalMap.set(a.id, a.handoff); // the solution's arrival map carries the EARLY hand-offs (poseAll's wait rule, the carry)
    } catch (e) {
      // a runaway / inconsistent solve (kinematics.js MAX_EVENTS or a thrown
      // invariant): this record stays on the sink's own cull (no pose from
      // us), the key is remembered so the frame hook does not re-solve every
      // frame, and scripted boots see it on the error surface
      solution = null;
      solArrivals = new Map();
      solutionKey = key;
      ledgerLast = ledgerIds;
      cursor = null;
      // …and every mesh the PREVIOUS solution posed is handed back to game.js FIRST (review r8
      // P2): poseAll() returns on a null solution, and game.js parks a pocketed ball at the
      // moment it is potted (update()) or for the record it is playing (seek()), so a pose this
      // module left standing here would float over the bed until something else re-parks that
      // mesh — for the balls of an EARLIER record nothing in the rack does, so they hang there
      // until the rack itself is disposed
      releaseAll();
      ctl.reason = `solve failed for the current record: ${e.message}`;
      if (refusalReported !== e.message) { reportOnce(`solve failed (record left to the sink): ${e.message}`, scripted); refusalReported = e.message; }
      return null;
    }
    // the refusal is over: the error surface stops describing a record this activation has since
    // re-solved, and a LATER refusal — a different failure the user must see — is reportable again
    if (refusalReported !== null) { refusalReported = null; ctl.reason = armedReason; }
    for (const id of solution.overflow ?? []) solRejected.add(id); // refused at a blocked entry: stays in the pocket, carried as rejected
    solution.rejected = solRejected;
    solution.refusals = solRefusals; // named, per id (#737 r5 classes C/F)
    solArrivals = arrivalMap;
    for (const id of solution.rest.keys()) { // the settled pose of every ball (station + route + orientation)
      const st = continuationAt(solution, id, Infinity);
      if (st && st.kind === 'rest') carriedRest.set(id, st);
    }
    // (#737 r5 class B, corrected by r8 class A) COMPLETE the record's content snapshot with the stations this solve assigned. The snapshot is
    // written before the solve from `carried` alone — the states inherited from the previous solution — so a ball this
    // record is the first to omit (a layout omission: a ledger NEWCOMER, which has no carried state by definition) has no
    // entry in it at all. On a revisit the ledger loop then fell through to `carriedRest.get(id)`, the LIVE mutable map,
    // which any record visited in between may have re-stationed: A → B → A drew A's omitted ball at the station B had
    // given it. Only the LEDGER ids of this solve are added — never an arrival's rest, which would make a replay start a
    // ball at the end of the fall it must be seen to make — and only where the snapshot carries nothing for the ball (r8:
    // an explicit `hidden`), so the states the first playback truly started from are never overwritten.
    // …and the station it records is the one the record shows AT ITS OWN CLOCK (#737 r8 class A): `carriedRest` holds the
    // END of this solve, and a ledger newcomer does not stay where it was seated — an arrival landing on the tray packs the
    // gap a revived ball left, sliding every ball below it one station down. Saving the end made the revisit start the ball
    // where the FIRST visit had finished with it.
    if (recKey && !replayOf) {
      const snap = baseSnapshots.get(recKey);
      if (snap) {
        for (const id of ledgerIds) {
          const cur = snap.states.get(id);
          if ((cur && cur.kind !== 'hidden') || !solution.rest.has(id)) continue;
          const st = stateAtOrigin(solution, id, snap.origin);
          if (st && st.kind === 'rest' && Number.isFinite(st.D)) snapWrite(snap, id, st, snap.origin);
        }
        // (#737 r6 class B) …and the basis of every ball the snapshot names, captured EAGERLY here — `basisFor` otherwise
        // runs at the first frame this record poses the ball, which is after the snapshot was written, and by the revisit
        // the rack it was read from is gone. Read while this record is the staged one, so it is this record's own basis.
        if (snap.states.size) for (const b of balls) {
          if (!b || !b.pocketed) continue;
          const st = snap.states.get(b.id);
          if (!st || st.kind === 'hidden' || st.basis) continue; // a `hidden` entry has no pose to compose (#737 r8 class B)
          const bq = basisFor(b);
          if (bq) st.basis = bq;
        }
      }
    }
    solutionKey = key;
    ledgerLast = ledgerIds;
    // TrackEvent cursor: seeded at 0 on a new base (a jump to the first posed frame
    // crosses everything before it exactly once), at the previous cursor's time on an
    // in-base re-solve (nothing crossed between two frames is lost — review P3);
    // the very first solve of a session seeds at its first advance (no burst)
    const prevCursorT = cursor ? cursor.lastT : null;
    cursor = createEventCursor(solution.events);
    const seed = baseSwitch ? 0 : prevCursorT;
    if (Number.isFinite(seed)) cursor.advance(seed);
    if (inPlayback) {
      // session arrival order: this shot's arrivals by the time they come to rest
      const restT = (id) => { const ps = solution.pieces.get(id); return ps ? ps[ps.length - 1].t0 : Infinity; };
      for (const a of arrivals.slice().sort((x, y) => (restT(x.id) - restT(y.id)) || (x.id - y.id))) {
        if (!sessionOrder.includes(a.id)) sessionOrder.push(a.id);
      }
    }
    ctl.stats.indexMs = performance.now() - t0;
    ctl.stats.solves += 1;
    // the solve's draw on the DERIVED refinement budget (kinematics.js WALK_BUDGET): a coarse
    // resolution is NAMED, never silent, and this is where a session sees one (order 23b round 10)
    ctl.stats.refineSteps = solution.walk?.refine ?? 0;
    ctl.stats.refineBudget = solution.walk?.budget ?? 0;
    ctl.stats.degradations += solution.degradations?.length ?? 0;
    return solution;
  };

  /** FR-012: deliver the TrackEvents the ball clock crossed since the last frame. */
  const emitEvents = (t) => {
    if (!cursor || !listeners.size) { cursor?.advance(t); return; }
    for (const ev of cursor.advance(t)) {
      for (const fn of listeners) { try { fn(ev); } catch { /* listener */ } }
    }
  };

  /** Pose every ball this module owns at time t (pure lookup). */
  const poseAll = (t) => {
    const sol = ensureSolution();
    if (!sol) return;
    const p0 = performance.now();
    const gi = window.__gi;
    for (const b of game.ballSet.balls) {
      if (!b.mesh) continue;
      if (!b.pocketed) { // revived (respot / layout / scrub back): released at once
        if (b.mesh.userData.obReturnPosed) b.mesh.userData.obReturnPosed = false;
        continue;
      }
      if (!sol.pieces.has(b.id)) { // not ours (netted / dressed / unserved pocket / live)
        if (b.mesh.userData.obReturnPosed) park(b); // …but we posed it under a previous solution
        continue;
      }
      const h = solArrivals.get(b.id);
      let tt = t;
      if (h) {
        if (t < h.tH) {
          // game.js still owns the sink (visible): wait. An INVISIBLE ball
          // before its closed-form crossing tH was not culled by the sink —
          // game.js hides a sink ball only at a sample time ≥ the crossing
          // (poseSink returns false once the top is below the shield), and the
          // closed form matches poseInSink to 1 µs (node arm b1) — so it was
          // hidden for another reason (parked / netted / dressed) and is not
          // ours yet. 0.05 s [GUARD, not load-bearing]: tolerance for host
          // clock skew between game.clock and the frame that hid the ball; any
          // value from a few ms up behaves identically on every path measured.
          if (b.mesh.visible || t < h.tH - 0.05) {
            if (b.mesh.userData.obReturnPosed) b.mesh.userData.obReturnPosed = false; // not ours on this frame
            continue;
          }
          tt = h.tH;
        }
      }
      const p = poseAt(sol, b.id, tt, poseTmp);
      if (!p) { if (b.mesh.userData.obReturnPosed) park(b); continue; } // back inside the cup (scrub) → as the sink left it
      b.mesh.position.set(p.x, p.y, p.z);
      b.mesh.quaternion.set(p.qx, p.qy, p.qz, p.qw);
      const bq = basisFor(b); // the basis THIS solution owns, not whatever the rack happens to carry now (#737 r5 class D)
      if (bq) b.mesh.quaternion.multiply(bq);
      b.mesh.scale.setScalar(1);
      b.mesh.visible = true;
      b.mesh.userData.obReturnPosed = true;
      // GI ambient: gi.js updateBallProbes skips pocketed balls, so a posed
      // ball's per-material SH would keep whatever was sampled while it was
      // live (render-history dependence, the GH-276 class). Own it: sample the
      // baked probe grid at the ball's CURRENT plan position (clamped at the
      // grid edge) — a pure function of t. Feature-detected; absent GI = no-op.
      const sh = b.mesh.material?.userData?.giSH;
      if (sh && gi && typeof gi.sampleSH === 'function') gi.sampleSH(p.x, p.z, sh.value);
    }
    clock.lastPose = t;
    emitEvents(t);
    ctl.stats.poseUs = (performance.now() - p0) * 1000;
  };

  // ---- activation per active table ------------------------------------------------
  /** The candidate tracks for a table, in the documented order (contract §1): the URL
   * arming of a scripted boot — which applies only if that track is defined for the
   * table — then the table's own spec flag; nothing → inert. */
  const resolveTrackIds = (id, spec) => {
    const out = [];
    if (scripted) {
      try {
        const v = new URLSearchParams(location.search).get('ballreturn');
        if (v && /^[A-Za-z0-9_-]{1,80}$/.test(v)) out.push({ trackId: v, armedBy: 'url' });
      } catch { /* no location */ }
    }
    if (spec?.render?.pocketSystem === 'return-track' && typeof spec.render.returnTrack === 'string' && !out.some((c) => c.trackId === spec.render.returnTrack)) {
      out.push({ trackId: spec.render.returnTrack, armedBy: 'spec' });
    }
    return out;
  };

  let loadAbort = null;       // AbortController of the load in flight (aborted when a switch supersedes it)
  /** The synchronous half of a switch: run the moment a hook observes a new active table
   * (review r5 / review 7: the app re-equips the bed and emits the close in ONE task —
   * every hook that follows must already see this module torn down for the new bed, never
   * the previous bed's track). Returns the generation the async load must carry. */
  const teardownFor = (id) => {
    const myGen = ++gen;
    // the superseded activation's request is ABANDONED here (review r9 P2-3): the new bed
    // must not wait on the old bed's fetch. The generation guards already stop a stale
    // load from committing; the abort ends the PAGE's request (under an installed worker
    // a cache MISS leaves the worker's own inner fetch running — it carries no signal —
    // so this is a page-side release, not a network cancel in every case), and dropping
    // the serialisation (below) stops it from holding the new activation behind it
    if (loadAbort) { try { loadAbort.abort(); } catch { /* no abort support */ } loadAbort = null; }
    // (review r5 P2): the borrow SURVIVES every switch — the player may re-equip the bed
    // for a cross-equipment archive and restoreRack re-equips the live table at close;
    // the stash is handed back when the live track is active again (frame hook). A
    // borrow caught CLOSING by a switch has already restored its session into the bed
    // being torn down: nothing is left to hand back (marked lost)
    if (borrow) { releaseAll(); if (borrow.closing) { borrow = { live: null, liveRecord: null, closing: false, closeSeen: true, lost: true }; } }
    // a same-rack, same-track return (a table PREVIEW and its revert — not Playback) must
    // find the live timeline exactly as it left it: the WHOLE session is stashed (solution,
    // continuations' base, handoffs, snapshots, the return clock), not only the rest map
    // (review r7 P2: the rest-map memo rebuilt the record at the frozen game.clock and
    // balls that had advanced or stopped jumped back and replayed the track)
    inFlightMemo = null;
    if (track && ballSetRef) {
      rackMemos.set(ctl.trackId, { ballSet: ballSetRef, trackId: ctl.trackId, session: stashSession(), carriedRest: new Map(carriedRest), sessionOrder: sessionOrder.slice(), rejected: new Set(solution?.rejected ?? []) });
      inFlightMemo = ctl.trackId; // this switch is not resolved yet: its memo is the live session (review r8 P1)
    }
    releaseAll();
    removeDebugVisual();
    resetSolutionState();
    track = null; pockets = []; tableId = id; armedGeom = null; furniturePendingMark = -1; // no geometry validated for this bed until an activation builds one (FIX6 review C2)
    armedR = NaN; // (refuter H, D1/D2) no verdict, no radius to compare against: until the next V8 read a radius change is nothing to re-arm on — with the old radius left here every frame of a fetch longer than a frame re-tore the activation down (85 activations in 1.5 s), and a bed with no track re-fetched forever
    game.ballReturnOwns = null; ownMap = new Map(); // order 18 item 0: no track, no ownership — poseSink's path is unchanged
    ctl.track = null; ctl.enabled = false; ctl.trackId = null; ctl.armedBy = null; ctl.tableId = id; ctl.reason = 'pending';
    ctl.design = null; ctl.stats.designSolvesNow = 0; ctl.stats.designSliceMaxMs = 0; ctl.stats.designMode = null; // the V19 read is per activation: a bed refused before V19 shows none
    designCancelInFlight();
    ctl.stats.activations += 1;
    return myGen;
  };
  async function activate(genArg) {
    const id = tableMod.activeTableId?.() ?? null;
    let myGen = genArg;
    if (myGen === undefined) {
      if (id === tableId && ctl.reason !== 'pending') return; // a queued duplicate: this id is already resolved
      myGen = teardownFor(id);
    }
    if (myGen !== gen) return; // superseded by a later switch before the load began
    // feature-detected: an environment without AbortController simply keeps the old
    // behaviour of a request that runs to completion and is discarded by the gen guard
    const ac = typeof AbortController === 'function' ? new AbortController() : null;
    if (ac) loadAbort = ac;
    const spec = tableMod.specFor?.(id) ?? null;
    const candidates = resolveTrackIds(id, spec);
    if (!candidates.length) { ctl.reason = 'no return track on this table (pocketSystem net)'; if (borrow?.lost || borrow?.closeSeen) borrow = null; return; } // a latched close resolving on a trackless bed has nothing to hand back (verification 7)
    // the first candidate that loads, has the published shape and is DEFINED FOR this
    // table wins; a URL-armed track of another table falls through to the spec track
    let def = null; let trackId = null; let armedBy = null; let lastReason = null; let lastReport = false;
    for (const cand of candidates) {
      let d = null;
      try {
        if (!doFetch) throw new Error('no fetch implementation');
        const url = new URL(`./tracks/${cand.trackId}.json`, import.meta.url);
        // the plain request path (review r6 P2): under an installed service worker a
        // precached track is served cache-first from the SAME generation as the shell;
        // a `cache: 'no-cache'` init would take the worker's heal path — a network fetch
        // written into the OLD generation's cache (a mixed-generation snapshot)
        // ...and `signal` is the ONLY init key: an abandoned load is cancelled without
        // moving the request off the worker's cache-first path (review r9 P2-3)
        const res = await doFetch(url, ac ? { signal: ac.signal } : undefined);
        if (!res || !res.ok) throw new Error(`HTTP ${res?.status ?? 'no response'}`);
        d = await res.json();
      } catch (e) {
        if (myGen !== gen) return; // superseded by a later switch
        lastReason = `track ${cand.trackId} not loadable (${e?.message ?? e})`; lastReport = true;
        continue;
      }
      if (myGen !== gen) return;
      const shape = shapeRefusal(d); // the published JSON schema, before ownership is even asked
      if (shape) { lastReason = shape; lastReport = true; continue; }
      const match = tableIdsMatch(tableMod.TABLE_SPECS ?? null, d?.doc?.table_id, id);
      if (match !== true) {
        // a URL-armed TEST track on another table is an EXPECTED inert (the arming
        // is "for the built table"); a spec-flagged mismatch is a definition error
        lastReason = match === 'unknown'
          ? `track ${cand.trackId} names an unknown catalog table id ${JSON.stringify(d?.doc?.table_id)} (active table ${id})`
          : `track ${cand.trackId} is defined for ${d?.doc?.table_id}, active table is ${id}`;
        lastReport = cand.armedBy === 'spec' || match === 'unknown';
        continue;
      }
      def = d; trackId = cand.trackId; armedBy = cand.armedBy;
      break;
    }
    if (!def) { ctl.reason = lastReason; if (lastReport) reportOnce(ctl.reason, scripted); if (borrow?.lost || borrow?.closeSeen) borrow = null; return; }
    ctl.trackId = trackId; ctl.armedBy = armedBy;
    let built = null;
    let cups = [];
    let falls = null;
    try {
      const Gm = tableMod.makeGeom?.(id);
      cups = (Gm?.pockets ?? []).map((p) => ({ x: p.x, z: p.z, r: p.r }));
      // the fall the HOST draws: the fresh game.js requests the kernel-disc aperture at its one read site, so this module requests
      // the same through the falls module's named export — never a literal of its own (#707 prep FIX6 A, review 707m6 P2-1; the law:
      // the ownership ledger "Recorded deviation … the kernel-disc contract"). Un-opted, snooker's corners came back as the plate cups,
      // 27.87 mm from the host's fall centre, and V13/V16 validated a fall path the app never shows (a lowered-chute XW101 with a
      // 5 mm box on the host's fall arc into corner 0 read 0 obstacle hits here against the host's 8 — r69a; review 707m6's own probe
      // read 0 against 4). A table.js without the export (the cache-poison pairing) is un-opted as before (lifecycle L73).
      falls = tableMod.pocketVisualFalls?.(id, tableMod.POCKET_FALLS_CONTRACT_KERNEL) ?? null;
      armedGeom = { def, cups, falls };
      built = validateTrack(def, { pockets: cups, falls });
      // the centre path and every capacity identity are built for the track's
      // reference ball radius: a ball set of another radius is refused, not fudged
      const rr = rackRadius();
      armedR = rr; // the radius this verdict is read for (order 19 item 5): a later rack with another radius re-arms
      if (Number.isFinite(rr) && Math.abs(rr - built.refR) > 1e-6) throw new Error(`ball-return track refused [V8]: the active ball radius ${(rr * 1000).toFixed(3)} mm is not the track's reference ${(built.refR * 1000).toFixed(3)} mm`);
    } catch (e) {
      if (myGen !== gen) return;
      ctl.reason = e?.message ?? String(e);
      reportOnce(ctl.reason, scripted);
      return;
    }
    if (myGen !== gen) return;
    if (built.ownershipRequired && !hostOwnsHook()) { // V13 (order 17 item 1b → order 18 item 0): a negative sink clearance needs the OWNERSHIP hand-off; only a host
      ctl.reason = `${built.ownershipRequired.reason} — the host lacks the ownership hook (ballReturnOwnsSupported / sinkPoseAt)`; // without the hook (a stale game.js) keeps the track disabled
      ownHookOwed = true; // …but a hook that has not arrived YET is not a stale host: owed a retry (#737 r5 class E)
      reportOnce(ctl.reason, scripted);
      return;
    }
    // V16 (order 20 item 0) — FURNITURE CLEARANCE, fail-closed: every station of every runway clears every table-body mesh
    // by one ball radius, else the track is refused for this table naming the meshes and the station spans (the first Chrome
    // look, §23.6: the XW101's ball at rest inside `obSnkLeg`). The scene: the harness seam, else the ball set's parent
    // (the app's Scene), else the debug handle. No scene at all (a headless host without the seam) = nothing to clear
    // against: `evaluated: false`, stated in the facade, the track not refused for it.
    // V17 (order 21 item 2): the track's own-hardware companion — ./hardware/<trackId>.json; none = no hardware declared (the
    // wires would count as furniture); an invalid one is a refusal (fail-closed)
    let hwDecl = null;
    try {
      if (doFetch) {
        const hres = await doFetch(new URL(`./hardware/${trackId}.json`, import.meta.url), ac ? { signal: ac.signal } : undefined);
        if (hres && hres.ok) hwDecl = validateHardware(await hres.json(), { trackId, tableId: id, specs: tableMod.TABLE_SPECS ?? null }); // the companion's table through the catalog identity, as the track's (FIX7 B)
      }
    } catch (e) {
      if (myGen !== gen) return;
      if (/\[V17\]/.test(e?.message ?? '')) { ctl.reason = e.message; ctl.hardware = { refused: e.message }; reportOnce(ctl.reason, scripted); return; }
      hwDecl = null;
    }
    if (myGen !== gen) return;
    ctl.hardware = hwDecl;
    built.hardwareMeshNames = hwDecl ? hwDecl.meshNames.slice() : [];
    built.environmentMeshNames = hwDecl ? hwDecl.environmentMeshNames.slice() : []; // #737 r8 class C: the declared environment, read by V16
    // V18 (order 21, ruling 1): the table's pocket-assembly declaration — ./assemblies/<tableId>.json; none = the assembly is
    // furniture; an invalid one is a refusal (fail-closed: a broken declaration could hide furniture)
    let asmDecl = null;
    try {
      if (doFetch) {
        // the declaration FILE lives under the table's CANONICAL id: an alias table (pool_pro_9ft_measured IS the pool_pro_9ft spec) reads
        // assemblies/pool_pro_9ft.json, never a file named after the alias (FIX7 B; the declared table_id then matches through the catalog)
        const ares = await doFetch(new URL(`./assemblies/${canonicalTableId(tableMod.TABLE_SPECS ?? null, id)}.json`, import.meta.url), ac ? { signal: ac.signal } : undefined);
        if (ares && ares.ok) asmDecl = validateAssembly(await ares.json(), { tableId: id, specs: tableMod.TABLE_SPECS ?? null }); // the same identity for the assembly companion (FIX7 B)
      }
    } catch (e) {
      if (myGen !== gen) return;
      if (/\[V18\]/.test(e?.message ?? '')) { ctl.reason = e.message; ctl.assembly = { refused: e.message }; reportOnce(ctl.reason, scripted); return; }
      asmDecl = null; // not loadable (a 404 is the common case): none declared
    }
    if (myGen !== gen) return;
    ctl.assembly = asmDecl;
    assemblyDecl = asmDecl;
    // V16 through ONE path — read here, and read AGAIN at the completion when a furniture broadcast landed while this activation was
    // pending (#707 prep FIX7 A): the same furnitureClearance call, the same key builder (FIX6), the same three refusals. Returns the
    // refusal text (null = clear), or dead when the generation moved under the read.
    const readClearance = async () => {
      let fc = null;
      // pockets + falls: the visible fall joins the sweep (FIX4 A)
      try { fc = await furnitureClearance({ track: built, def, r: built.refR, scene: sceneOf(), tableId: id, trackId, excludeGroup: game.ballSet?.group ?? null, assembly: assemblyMatcher(asmDecl), pockets: cups, falls }); } catch (e) { fc = { row: 'V16', evaluated: false, why: `furniture read failed: ${e?.message ?? e}`, violations: [], byMesh: [], reason: null }; }
      if (myGen !== gen) return { dead: true, refusal: null };
      ctl.stats.furnitureEvals = furnitureEvaluations();
      ctl.furniture = fc;
      furnitureKey = fc.key ?? null;
      if (fc.evaluated && fc.violations.length) return { dead: false, refusal: fc.reason };
      // (FIX4 A) the visible fall is part of what V16 validates: a sweep that could not read it (no cups for a served pocket — a host
      // without table geometry) is not a clearance read of the whole drawn trajectory — fail-closed, by name
      if (fc.evaluated && fc.fallSwept === false && [...built.routes.values()].some((rt) => Number.isInteger(rt.pocket))) {
        return { dead: false, refusal: `ball-return track refused [V16]: the visible fall into the served pockets could not be swept (no pocket cups reached the furniture read — ${cups.length} cups, falls ${falls ? falls.length : 'none'})` };
      }
      // no scene to read (a headless host): fail-closed unless the host WAIVES the row explicitly (`furniture: 'none'` — the node
      // harnesses, which have no furniture) — a host whose scene this module cannot find gets no unchecked track (refuter B, d)
      if (!fc.evaluated && furnitureWaiver !== 'none') {
        return { dead: false, refusal: `ball-return track refused [V16]: no scene to read the furniture clearance against (${fc.why}); a headless host waives the row with furniture: 'none'` };
      }
      return { dead: false, refusal: null };
    };
    const clearance = await readClearance();
    if (clearance.dead) return;
    if (clearance.refusal) {
      ctl.reason = clearance.refusal;
      reportOnce(ctl.reason, scripted);
      return;
    }
    // V19 (order 23b, the round-2 ruling; contract §27.7) — the DESIGN gate: the track's own law over the default drop family;
    // a family member that leaves a ball undelivered (a 'mutual' wedge, a 'corner' stop, a hold that never releases, a LOCK)
    // refuses the track at declaration, naming the seed. Fail-closed: a gate that cannot be evaluated refuses too.
    // …off the UI thread (FIX1 A1): a Worker or budgeted slices, cached per built table + track bytes; the generation guard
    // after the await drops a verdict that arrived for an activation the table has since left
    let dg;
    try { dg = await designVerdict({ def, built, cups, falls, tableIdKey: id, trackId, alive: () => myGen === gen, gen: myGen }); }
    catch (e) { dg = { evaluated: false, refused: true, reason: `ball-return track refused [V19]: the design gate could not be evaluated (${e?.message ?? e})`, offenders: [], cached: false, mode: designMode, ms: 0, sliceMaxMs: 0, solvesNow: 0 }; }
    if (myGen !== gen || dg === null) return;                                // superseded (the generation moved; a shared or chunked sweep stopped for it)
    ctl.stats.designSolvesNow = dg.solvesNow ?? 0; ctl.stats.designSliceMaxMs = dg.sliceMaxMs ?? 0; ctl.stats.designMode = dg.mode ?? designMode;
    ctl.design = dg;
    if (dg.refused) {
      ctl.reason = dg.reason;
      reportOnce(ctl.reason, scripted);
      return;
    }
    // (#707 prep FIX7 A) a furniture broadcast landed while this activation was pending (during the fetches or the companions — which
    // load BEFORE V16 —, during the V16 read itself, or during the design gate): re-read V16 against the furniture as it is NOW, through
    // the same path, BEFORE enabling — a re-read that refuses
    // ends the activation refused by name (L74a); one whose furniture is back where it was is a cache hit with the same verdict
    // (L74b). A broadcast landing during the re-read itself is answered by one more; anything after that goes to the post-completion
    // recheck (queued below), which compares keys once the track is enabled.
    for (let pass = 0; furniturePendingMark === myGen && pass < 2; pass++) {
      furniturePendingMark = -1; ctl.stats.furnitureRereads += 1;
      const again = await readClearance();
      if (again.dead) return;
      if (again.refusal) {
        ctl.reason = again.refusal;
        reportOnce(ctl.reason, scripted);
        return;
      }
    }
    if (furniturePendingMark === myGen) { furniturePendingMark = -1; queueMicrotask(() => { recheckFurniture().catch(() => {}); }); }
    track = built; pockets = cups;
    const rackMemo = rackMemos.get(trackId) ?? null; // only THIS track's memo is consumed; a preview onto another track leaves the others in place
    // the memo applies iff it is a memo of the LIVE rack: game.js rebuilds the whole ball set on
    // every rack change (applyRack disposes and re-creates), announced or quiet, so object
    // identity sees a rerack that keeps the kind AND the seed just as well as one that does not
    if (rackMemo && rackMemo.ballSet === game.ballSet && rackMemo.trackId === trackId) {
      rackMemos.delete(trackId);
      if (rackMemo.session) {
        // the live timeline, bit for bit (routes of the stashed pieces are the previous track
        // object's — identical geometry for the same track id; carried rests are re-bound by
        // pocket index so later solves seat on this track's routes)
        restoreSession(rackMemo.session);
        // a record that changed while this track was away (a shot fired on the previewed bed)
        // is a NEW time base for the restored session: the base-switch bookkeeping the
        // PLAYBACK hook would have done had the track been active (review round 9)
        // …INCLUDING when the app is already INSIDE that record's PLAYBACK (review round 12, P2): the PLAYBACK hook was missed
        // because `track` was null when the state changed, and an activation that lands mid-record (the companion loads and the
        // furniture read make it seconds long on a big scene) must do the hook's bookkeeping itself — else the first solve has no
        // base switch, stores no content snapshot for the record, and a later REPLAY of it starts from the carried balls' END
        // states instead of their start (the replay guarantee, the ownership ledger). A Playback borrow owns its own base and is left alone.
        // …and (round 22d, refuter J's D2 / D4) a REPLAY of the same record entered while the track was away is a PLAYBACK the hook
        // missed just the same — the record's clock is BEHIND the memo's last posed record clock (a re-entry; a PLAYBACK still under
        // way from before the preview has run on); and a borrow is not exempt: the hook's bookkeeping is what the borrowed session
        // needs too (the guard made the borrowed ball jump 154 mm at the first drawn frame)
        const reEntered = machine.state === 'PLAYBACK' && Number.isFinite(clock.lastBall) && game.clock + 1e-9 < clock.lastBall;
        if (game.record && (game.record !== recordRef || reEntered)) lateJoinSwitch();
        for (const [k, v] of [...carriedRest]) carriedRest.set(k, { ...v, route: v.route ? (track.routes.get(v.route.pocket) ?? track.trayRoute) : track.trayRoute });
        ballSetRef = rackMemo.ballSet;
      } else {
        ballSetRef = rackMemo.ballSet;
        for (const [k, v] of rackMemo.carriedRest) {
          // routes belong to the track object: re-resolve by pocket index on the rebuilt one
          const route = v.route ? (track.routes.get(v.route.pocket) ?? track.trayRoute) : track.trayRoute; // null on a terminal system → not seated
          carriedRest.set(k, { ...v, route });
        }
        sessionOrder.push(...rackMemo.sessionOrder);
        seedRejected = new Set(rackMemo.rejected);
        // (a ledger-only memo needs no switch: rests are immovable, so a replay's carried rests read the same at the record's start and end)
      }
    }
    // (#737 r7 class A — boundary event E8, the activation COMPLETES after PLAYBACK has begun) a FRESH activation — no memo to
    // restore: the session's first load, or a track that arrives seconds after the shot on a big scene — joins the record here
    // exactly as the restored session above does. Without it the first solve finds `recordRef` undefined, takes NO base switch
    // and stores no content snapshot for the record, so a later revisit of it starts from whatever the records in between left
    // carried — their END states — instead of the states this record started from (the replay guarantee, the ownership ledger). The
    // module's record identity is the live one from here on, so a borrow entered before the first solve knows the record to
    // hand back to as well. `switchT === null` = the memo path above has not already done the hook's bookkeeping.
    // (#707 prep FIX5, review 707m5 P2) …and AFTER the record has SETTLED. Since FIX1 the design gate runs off the UI thread, so a
    // fresh activation can land in AIM with the shot's record already played: the hook was missed the same way, and a join made
    // only inside PLAYBACK left that record with no base switch and no snapshot — a later quiet revisit of it carried the records
    // in between (ball 1 drawn at rest in B's chute during A; TEST-terminal-chutes, lifecycle L70a). Outside PLAYBACK a record on
    // the game is one that has been PLAYED (game.js sets it at the shot and keeps it through SETTLED / AIM), so the join is made
    // whatever the machine's state, with the SAME bookkeeping (`lateJoinSwitch` — no second snapshot path): the record's own
    // clock, frozen at its settle, is the origin — never a re-based 0 and never the completion instant (L70b) — and the first
    // frame's solve stores the snapshot in L68's total form. The completion joins the record CURRENT at the landing: one that was
    // shot and settled while pending behind another is stale and gets nothing (L70c), as a torn-down generation's completion
    // writes nothing at all (FIX2, the `myGen` guard above).
    if (recordRef === undefined && game.record) {
      recordRef = game.record;
      if (switchT === null) lateJoinSwitch();
    }
    ctl.track = track;
    ctl.enabled = true;
    game.ballReturnOwns = ownsHook; // order 18 item 0: poseSink asks from now on (null again at teardown)
    ctl.reason = armedBy === 'url' ? 'armed by ?ballreturn (scripted boot)' : 'table spec';
    armedReason = ctl.reason;
    if (track.debugVisual && track.status === 'TEST') {
      import('./debugvisual.js')
        .then((m) => { if (myGen === gen) m.attachDebugVisual?.({ scene: window.__dbg?.scene, track, r: rackRadius() }); })
        .catch(() => {});
    }
  }
  /** The archive-rack boundary's radius predicate (#737 r3 class C, r4 class B): the rack a `dvr` PLAYBACK opens on carries a ball
   * radius other than the one the current activation's verdict was read for. `armedR` is NaN until V8 has read one — an activation
   * still fetching its track compares against nothing here and reads the rack's radius itself when the track arrives. */
  const archiveRadiusMoved = () => { const rA = game.template?.system?.balls?.[0]?.params?.r ?? null; return Number.isFinite(rA) && rA > 0 && Number.isFinite(armedR) && Math.abs(rA - armedR) > 1e-12; };
  const checkTable = () => {
    // the live rack as this module can see it. NEVER refreshed inside PLAYBACK: the bed there is
    // the archive's, and the memo the close must hand back belongs to the rack this held last
    if (machine.state !== 'PLAYBACK' && game.ballSet) liveBallSet = game.ballSet;
    // a new rack: no memo of the old one can apply. ONE exemption — the memo of the switch that
    // is still resolving (inFlightMemo), which a QUIET rerack under a cross-equipment Playback
    // open has already made unrecognisable and which that open is about to borrow (review r8 P1)
    if (rackMemos.size && machine.state !== 'PLAYBACK' && game.ballSet && ![...rackMemos.values()].some((m) => m.ballSet === game.ballSet)) {
      for (const k of [...rackMemos.keys()]) if (k !== inFlightMemo) rackMemos.delete(k);
    }
    const id = tableMod.activeTableId?.() ?? null;
    // (order 19 item 5) the SAME bed with a different ball is a new activation too: a discipline switch
    // on one table (the 9-ball set → the snooker rules on the 12 ft bed, e2e-snooker's activateSnooker)
    // rebuilds the rack and changes the radius the schema's V8 reads, and the verdict cached for the
    // old radius ("the active ball radius 28.575 mm is not the track's reference 26.250 mm") stood
    // until the table itself changed — the XW101 track stayed refused under the snooker rules in the
    // first Chrome look (2026-09-07). Read outside PLAYBACK only (the bed there is the archive's; the
    // memo/borrow law owns cross-equipment opens) and only when the template carries a radius.
    const liveR = machine.state !== 'PLAYBACK' ? (game.template?.system?.balls?.[0]?.params?.r ?? null) : null;
    const radiusMoved = id === tableId && Number.isFinite(liveR) && liveR > 0 && Number.isFinite(armedR) && Math.abs(liveR - armedR) > 1e-12;
    // (#737 r5 class E) the ownership hook can arrive AFTER the track did. game.js binds `sinkPoseAt` only inside its
    // async `import('./sinkpivot.js')`, so on a cold load an activation that resolves first reads `hostOwnsHook()` false
    // and V13 refuses an ownership-required track — PERMANENTLY, because nothing re-read it: the verdict is cached
    // against the table id and only a table change or a radius change re-activates. A fresh host (the first open of the
    // XW101 bed) therefore kept the track disabled for the whole session while the accessor sat there, live. One retry,
    // exactly when the hook appears: the flag is set only by that refusal and cleared before the re-activation, and the
    // hook cannot un-appear, so this fires at most once per refusal.
    if (ownHookOwed && hostOwnsHook() && id === tableId) {
      ownHookOwed = false;
      const g2 = teardownFor(id);
      activate(g2).catch(() => {}).then(() => { if (g2 === gen) { inFlightMemo = null; loadAbort = null; } settled(g2); });
      return;
    }
    if (id === tableId && !radiusMoved) return; // already resolved (or torn down) for this id and ball: teardownFor sets it synchronously
    const g = teardownFor(id); // synchronous: every hook after this line sees the new bed, inert until its track loads
    // each generation's activation starts NOW, never chained behind the previous one
    // (review r9 P2-3: a hung fetch on the bed being left blocked the new bed's install).
    // The exemption ends with the switch: once THIS activation has settled (enabled or
    // inert) the memo it stashed is an ordinary memo again, and the clear above retires it
    activate(g).catch(() => {}).then(() => { if (g === gen) { inFlightMemo = null; loadAbort = null; } settled(g); });
  };

  // ---- hooks (registered once; they consult the current activation) --------------
  machine.on('frame', (t, dt) => {
    checkTable();
    if (!track) return;
    // The BALL clock is game.clock (written by seek() and update() on every
    // path); the hook argument may be the CAMERA clock under the GH-299
    // two-clock renderAt/renderAccum seam (tCam / walking sub-frame t while the
    // balls are seeked at tBall). In PLAYBACK, or whenever game.clock moved, the
    // pose is a pure lookup at game.clock. After SETTLED in realtime game.clock
    // freezes while a ball may still be rolling: continue by wall dt at the
    // playback rate (the update() slow-motion mirror) until every piece ends.
    // the close of a borrow re-stages the LIVE record (recordRef = the original
    // object) and seeks it to its settle (playback.js): detect it HERE, before any
    // clock arithmetic (main.js runs game.update — which advances game.clock and can
    // settle synchronously — before this hook), restore the live session and hold
    // its continuation time through those PLAYBACK frames; when the machine has left
    // PLAYBACK the ball clock is handed to the CONTINUATION branch (lastBall =
    // game.clock), never to game.clock itself (review round 5, P1/P2)
    if (borrow && !borrow.closing && borrow.liveRecord && game.record === borrow.liveRecord && borrow.live && borrow.live.trackId === ctl.trackId) beginClose();
    if (borrow && !borrow.closing && borrow.closeSeen) {
      // the player closed while this module was inert or activating (a cross-equipment
      // session): hand the live session back now that its track is active again; a
      // live session of ANOTHER track has nothing to restore into (contract §1)
      if (borrow.live && borrow.live.trackId === ctl.trackId) exitBorrow();
      else borrow = null;
    }
    if (borrow?.closing) {
      adoptIndex();
      clock.lastBall = game.clock;
      poseAll(clock.t);                                  // hold — including the tick in which update() settled
      if (machine.state !== 'PLAYBACK') borrow = null;   // live again from the NEXT tick (continuation branch: lastBall = game.clock)
      return;
    }
    const gc = game.clock;
    const tb = Number.isFinite(gc) ? gc : t;
    let tt;
    if (machine.state === 'PLAYBACK' || tb !== clock.lastBall) tt = tb;
    else tt = clock.t + (Number.isFinite(dt) ? Math.max(0, dt) * (game.slowmo ? 0.25 : 1) : 0);
    if (!Number.isFinite(tt)) tt = tb;
    clock.lastBall = tb;
    clock.t = tt;
    poseAll(tt);
  });
  machine.on('stateChange', (next, prev, info) => {
    if (prev === 'PLAYBACK' && next !== 'PLAYBACK' && furnitureRecheckOwed) queueMicrotask(() => { recheckFurniture().catch(() => {}); }); // the furniture broadcast owed from inside PLAYBACK
    checkTable();
    // An ANNOUNCED fresh rack retires the in-flight exemption — `setState('AIM', { seed })`
    // (game.js:414) is emitted by applyRack for every rack the app does NOT stage quietly, and
    // main.js reads the same signal as "fresh table". It must be handled HERE, after the
    // checkTable above, because that is where the teardown that arms the exemption runs: the
    // equipment station broadcasts `ob:settings` (the bed switch) and only THEN re-racks
    // (settings.js:1286-1288), so this module first sees the switch inside this very emission
    // and would otherwise hold the memo of a rack applyRack has already disposed — adoptable by
    // any player opened during the new bed's track fetch, with no ball-set test on that path
    // (refutation round 2). The quiet re-racks the exemption exists for emit nothing, so they
    // are untouched.
    if (info && Object.prototype.hasOwnProperty.call(info, 'seed')) inFlightMemo = null;
    // the close's dvr-marked settled emission may arrive while this bed carries no
    // track yet (restoreRack re-equipped the live table; its activation is async):
    // latch it, the frame hook hands the live session back once the track is up
    if (borrow && !borrow.closing && info && info.dvr === true && next !== 'PLAYBACK') {
      // a bed that has ALREADY resolved without a track cannot receive the stash: the close
      // is dropped there and then (verification 7); a bed still activating latches it
      if (!track && ctl.reason !== 'pending') borrow = null; else borrow.closeSeen = true;
    }
    if (!track && !borrow && info && info.dvr === true && next === 'PLAYBACK') {
      // the player opened on a previewed (inert) bed: the live session of this rack sits in a
      // memo — it becomes the borrow, so a close that rebuilds the rack still hands it back on
      // the live track (review round 9)
      const memo = pickBorrowMemo();
      if (memo) { borrow = { live: memo.session, liveRecord: memo.session.recordRef ?? null, closing: false }; rackMemos.delete(memo.trackId); if (inFlightMemo === memo.trackId) inFlightMemo = null; ctl.stats.borrows += 1; }
    }
    if (info && info.dvr === true && next === 'PLAYBACK' && archiveRadiusMoved()) {
      // (#737 r3 class C) the ARCHIVE-RACK boundary reads the ball radius like a table change. playback.js swaps the rack before
      // this emission and checkTable never reads a radius inside PLAYBACK, so an archived record of another ballset on the SAME
      // table ran on the live activation — a 26.25 mm ball solved and drawn on the 28.575 mm track, V8 bypassed. The archive's rack
      // gets its own activation, which V8 refuses (enabled false, the row named); the close re-arms the live radius through
      // checkTable and the latched close hands the stash back once the track is up. A same-radius archive keeps the activation.
      // (#737 r4 class B) …WHATEVER the activation's state. Read after the inert return below, an activation still PENDING (its
      // hardware companion's fetch held after V8 had read the live radius) committed its track under the archive's rack, enabled
      // and unrevalidated, and a REFUSED track stayed refused under a compatible archive. One predicate (`archiveRadiusMoved`), one
      // place, before the inert return: an enabled track stashes the live session in the borrow first (it survives the teardown);
      // an inert bed has no session of its own to stash — its live session, if any, sits in the memo the block above adopted.
      if (track) enterBorrow();
      const g = teardownFor(tableId);
      activate(g).catch(() => {}).then(() => { if (g === gen) { inFlightMemo = null; loadAbort = null; } settled(g); });
      return;
    }
    if (!track) return;
    if (borrow && !borrow.closing && borrow.liveRecord && game.record === borrow.liveRecord && borrow.live && borrow.live.trackId === ctl.trackId) beginClose();
    if (info && info.dvr === true) {
      if (next === 'PLAYBACK') { enterBorrow(); poseAll(0); return; } // the player borrowed the bed (game.js loadRecord stage:'playback'); same radius (above)
      // a dvr-marked settled-state re-emission = the close restore's last step
      // (game.emitRestoredState / restoreRack state): hand the live session back
      if (borrow) {
        // a borrow already closing (the re-stage was seen) or a live session of THIS track:
        // hand it back now; a live session of another track waits for its track (latched)
        if ((borrow.closing && borrow.closingFor === ctl.trackId) || (borrow.live && borrow.live.trackId === ctl.trackId)) { exitBorrow(); poseAll(clock.t); } else { borrow.closeSeen = true; }
        return;
      }
    }
    if (info && Object.prototype.hasOwnProperty.call(info, 'seed')) {
      sessionOrder.length = 0; solution = null; solArrivals = new Map(); solutionKey = null; cursor = null; baseSnapshots = new Map(); baseBasis.clear(); // new rack
    }
    if (next === 'PLAYBACK' && info && Number.isFinite(info.duration)) {
      // a NEW time base: remember where the previous solution stood (its own
      // base) so balls still rolling are continued, not re-seated (P1-B)
      switchT = Number.isFinite(clock.lastPose) ? clock.lastPose : clock.t;
      baseGen += 1;
      clock.t = 0;
    }
    poseAll(clock.t);
  });
  try {
    // the app's equipment broadcast (settings.js / playback.js / flow.js): a
    // prompt to re-check the active table; the frame hook is the belt
    window.addEventListener('ob:settings', () => { queueMicrotask(checkTable); queueMicrotask(() => { recheckFurniture().catch(() => {}); }); });
  } catch { /* no window */ }

  const run = activate(); const g0 = gen; await run; settled(g0);
  return ctl;
}
