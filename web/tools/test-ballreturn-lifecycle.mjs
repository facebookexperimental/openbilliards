// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-ballreturn-lifecycle.mjs — the ball-return CONTROLLER (web/scene/ballreturn/
// index.js) driven in plain node with the REAL state machine (web/app/state.js), the
// REAL table geometry (web/scene/table.js through table-in-node.mjs) and a small
// game facade that mirrors the game.js contract the module reads (`record`
// identity per shot / loadRecord, lazy `sinkInfo`, `playbackBalls`, `clock`,
// seek() re-parking every call, update() parking once, settle → AIM).
//
// LIMIT (verification round 9): the facade's sink hands a ball over after its landing
// (the legacy TTL 0.45 s > tLand), so a FALLING ball is posed here only in the
// shifted-base scenario L3 (one frame) and never beside another drawn ball — no L-arm can
// witness the drawn end of a fall against a queue (that class is the node gate's r16 / r18;
// the browser rows read what the app draws). Seal 3
// (review r1 P1-B / P2-1 / P2-4 + the adversarial review's lifecycle findings):
//
//   L1 continuation at the next shot (jump 0 at t = 0, rest equal)
//   L2 a QUIET record swap inside PLAYBACK (game.js loadRecord stage:'quiet' —
//      playback.js stageShot, offline-render segment/beat walk: no stateChange)
//      mid-roll → continuous at the new t = 0
//   L3 the same swap while the ball is in the air → lands at tLand − tSwap
//   L4 TrackEvents: a first posed frame past the landing fires it once; an in-base
//      re-solve on the crossing frame loses nothing
//   L5 replay() of a record reproduces its first playback for a carried ball
//   L6 a shot fired while a ball is still in the sink (pre-handoff, artificially
//      late) → shifted arrival, never a ledger teleport
//   L7 the obReturnPosed marker is true only on frames the extension poses
//   L8 an unserved pot keeps the legacy cull and never enters the tray ledger
//   L9 settled poses (station + route + orientation) survive the next solve
//   L10 Playback A → B → A (→ B): revisits reproduce each record's first playback
//      (snapshots keyed by record CONTENT, not object identity)
//   L7b the sink-window branch proper (a sink that keeps the ball pocketed)
//   L8b/L8c rejection carried per record (quiet revisit of an unserved pot; B → C → B)
//   L11 layout-omitted newcomers behind a trunk-resting ball pack along the trunk
//   L12 snapshots are per rack (an identical record after a rerack starts afresh)
//   L13 the Playback borrow (dvr PLAYBACK → quiet loads → close restore): own session,
//      live session restored bit for bit, archived record == a fresh boot of it
//   L14 fetchImpl is the one loader (rejecting / 404 → inert + law line, no throw)
//   L15 a track naming an unknown catalog table id is inert with the law line
//   L16 the terminal-chutes topology (schema 1.1) through the real controller
//
//   node web/tools/test-ballreturn-lifecycle.mjs       (~100 s, no ports, no browser)
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');
let failures = 0;
const checkLine = (name, ok, detail = '') => `${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : ' — ' + detail}`;
const check = (name, ok, detail = '') => { console.log(checkLine(name, ok, detail)); if (!ok) failures += 1; };
// argv: none runs the whole suite; the one flag, --selftest-drift, runs only the L77 to L83 drift checks' synthetic plants. Any other
// argument is refused (exit 2), so a mistyped flag can never pass as a green run of the whole suite.
const ARGV = process.argv.slice(2);
if (ARGV.length > 1 || (ARGV.length === 1 && ARGV[0] !== '--selftest-drift')) { console.error(`test-ballreturn-lifecycle: unknown argument(s) ${JSON.stringify(ARGV)}; the only flag is --selftest-drift`); process.exit(2); }
const SELFTEST_DRIFT = ARGV.length === 1;

// ---- browser facade for the controller ------------------------------------------
globalThis.location = { search: '?obtool=1&ballreturn=TEST-synthetic-wire-slide', href: 'http://localhost/?obtool=1', origin: 'http://localhost', pathname: '/' };
globalThis.window = globalThis;
globalThis.__test = { errors: [] };
// the documented loader (contract §3 fetchImpl): file URLs → the fixture JSON; a
// scenario may override it (a rejecting loader, a mutated definition)
const fileFetch = async (url) => { const p = fileURLToPath(url); if (!fs.existsSync(p)) return { ok: false, status: 404 }; return { ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(p, 'utf8')) }; };
delete globalThis.fetch; // prove the module never falls back to a global fetch when fetchImpl is given
globalThis.queueMicrotask ??= (fn) => Promise.resolve().then(fn);
const { tableContext } = await import('./table-in-node.mjs');
const TCTX = await tableContext('wpa_generic_9ft');
const POCKETS = TCTX.pockets;
const R = 0.028575;
const { createStateMachine } = await import('../app/state.js');
const { installBallReturn } = await import('../scene/ballreturn/index.js');
const { buildSinkPivot, poseInSink } = await import('../app/sinkpivot.js');
/** a PIVOT sink entry as game.js builds one (order 18 item 0): a ball arriving over the cup at 1.2 m/s along +z, no spin */
const pivotEntry = (t, pocketIdx = 4) => { const P = POCKETS[pocketIdx]; const pivot = buildSinkPivot({ x0: P.x, z0: P.z - 0.03, vx: 0, vz: 1.2, wx: 0, wy: 0, wz: 0, q0: [0, 0, 0, 1], px: P.x, pz: P.z, pr: P.r, r: R, falls: null }); return { t, pocket: P, fall: P, r: R, pivot }; };
const SETTLE_PAD = 0.4;   // game.js SETTLE_PAD mirror (settle ≈ duration + 0.4)
const SINK_SECONDS = 0.45; // game.js legacy sink TTL mirror
const DT = 1 / 60;
// --selftest-drift: only the L77 to L83 drift checks' plants (l77/l78/l79/l80/l80s/l81/l82/l83DriftSelftest at L77 to L83), in the
// environment set up above; then exit 0 only when all eight report every plant caught.
if (SELFTEST_DRIFT) { const rc77 = await l77DriftSelftest(); const rc78 = await l78DriftSelftest(); const rc79 = await l79DriftSelftest(); const rc80 = await l80DriftSelftest(); const rc80s = await l80sDriftSelftest(); const rc81 = await l81DriftSelftest(); const rc82 = await l82DriftSelftest(); const rc83 = await l83DriftSelftest(); process.exit(rc77 || rc78 || rc79 || rc80 || rc80s || rc81 || rc82 || rc83 ? 1 : 0); }

/** a THREE.Quaternion stand-in with the REAL Hamilton product, so an arm can read what a ball is actually turned by:
 * poseAll composes the solution's orientation with the rack's basis, and #737 r5 class D is a defect of that
 * composition — a stub `multiply(){}` cannot see it. Mutates in place and clones like THREE's does. */
const mkQuat = (x = 0, y = 0, z = 0, w = 1) => ({
  x, y, z, w,
  set(a, b, c, d) { this.x = a; this.y = b; this.z = c; this.w = d; return this; },
  clone() { return mkQuat(this.x, this.y, this.z, this.w); },
  copy(q) { this.x = q.x; this.y = q.y; this.z = q.z; this.w = q.w; return this; },
  identity() { this.x = 0; this.y = 0; this.z = 0; this.w = 1; return this; },
  multiply(q) {
    const ax = this.x, ay = this.y, az = this.z, aw = this.w, bx = q.x, by = q.y, bz = q.z, bw = q.w;
    this.x = ax * bw + aw * bx + ay * bz - az * by; this.y = ay * bw + aw * by + az * bx - ax * bz;
    this.z = az * bw + aw * bz + ax * by - ay * bx; this.w = aw * bw - ax * bx - ay * by - az * bz;
    return this;
  },
});
/** the angle between two orientations, in degrees (sign-insensitive: q and −q are the same rotation) */
const quatAngleDeg = (a, b) => { const d = Math.abs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w); return 2 * Math.acos(Math.min(1, d)) * 180 / Math.PI; };
const mkBall = (id) => ({
  // `baseQuat` is never null in the host: ballset.js builds it as `mesh.quaternion.clone()` and game.js re-pins it
  // over `playbackBalls` at `shoot()` and at every `loadRecord()` — the pins the facade mirrors below (companion 2 class A)
  id, pocketed: false, sinkT: -1, baseQuat: mkQuat(),
  mesh: { visible: true, position: { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
    quaternion: mkQuat(), scale: { setScalar() {} }, userData: {}, material: {} },
});
const legacyEntry = (t, pocketIdx = 4) => ({ t, pocket: POCKETS[pocketIdx], fall: POCKETS[pocketIdx], r: R, glide: 0.06, tFall: 0.021 });
const ttlOf = (s) => s.pivot?.ttl ?? SINK_SECONDS;

/** One controller + facade per scenario (installBallReturn is idempotent per page,
 * so each scenario runs in a fresh module realm via a cache-busting import). */
let realm = 0;
async function boot({ fetchImpl = fileFetch, expectEnabled = true, track = 'TEST-synthetic-wire-slide', tableModule = null, solveOpts = null, host = 'legacy', templateR = R, scene = null, furniture = 'none', nBalls = 10 } = {}) {
  globalThis.location.search = `?obtool=1&ballreturn=${track}`; // the module reads the arming at install
  const machine = createStateMachine('AIM');
  const balls = Array.from({ length: nBalls }, (_, i) => mkBall(i)); // nBalls > 10: a rack deep enough to fill a chute (L46)
  const game = { clock: 0, ballSet: { balls }, playbackBalls: [], sinkInfo: null, slowmo: false, record: null,
    template: { system: { balls: [{ params: { r: templateR } }] } }, duration: 0 }; // templateR ≠ R = a rack of another discipline on this bed (L32)
  // order 18 item 0: the OWNER host — game.js's two additions, stubbed: the support flag, the sink-pose accessor over its own
  // sinkpivot binding, and poseSink's guard applied in seek (below). host 'legacy' = a game.js without them (the stale host).
  if (host === 'owner') { game.ballReturnOwnsSupported = true; game.sinkPoseAt = (s, dt, out) => (s && s.pivot ? poseInSink(s.pivot, dt, out ?? {}) : null); }
  const sinkDrawn = new Map(); // id → the host's last drawn sink pose (for the arms: what game.js would show)
  const mod = await import(`../scene/ballreturn/index.js?realm=${++realm}`);
  const ctl = await mod.installBallReturn({ machine, game, fetchImpl, ...(tableModule ? { tableModule } : {}), ...(solveOpts ? { solveOpts } : {}), ...(scene ? { scene } : {}), ...(furniture !== undefined ? { furniture } : {}) }); // `scene`: the V16 seam; `furniture`: the headless waiver (L34)
  if (expectEnabled && !ctl?.enabled) throw new Error(`controller not enabled: ${ctl?.reason}`);
  const st = { sinks: new Map(), rec: 0 };
  const posOf = (id) => { const m = balls[id].mesh; return { x: m.position.x, y: m.position.y, z: m.position.z, vis: m.visible, pock: balls[id].pocketed, marker: !!m.userData.obReturnPosed }; };
  // game.js seek(t): the record's balls re-parked every call once their sink is over
  const seekBalls = (t) => {
    for (const b of game.playbackBalls) {
      const s = st.sinks.get(b.id);
      if (s && t >= s.t) {
        // poseSink's guard (order 18 item 0): a ball the module OWNS from before the crossing is parked as at the crossing.
        // Asked only INSIDE the sink's TTL, as game.js seek() asks it (game.js:484-485: `sdt < ttl && poseSink(...)`) — a ball
        // sought past its TTL is parked pocketed WITHOUT a module call, so the module's first solve of a record sought straight
        // past a pot sees that ball already pocketed (#737 r4 class A; the harness used to ask — and solve — one call early)
        const owned = t - s.t < ttlOf(s) && typeof game.ballReturnOwns === 'function' && game.ballReturnOwns(b.id, t - s.t);
        if (!owned && t - s.t < ttlOf(s)) { b.mesh.visible = true; b.pocketed = !!st.sinkPocketed; const sp = s.pivot && host === 'owner' ? poseInSink(s.pivot, t - s.t, {}) : null; if (sp) { b.mesh.position.set(sp.x, sp.y, sp.z); sinkDrawn.set(b.id, { t, x: sp.x, y: sp.y, z: sp.z }); } else b.mesh.position.set(s.pocket.x, 0, s.pocket.z); }
        else { b.pocketed = true; b.mesh.visible = false; b.mesh.position.set(0, -10, 0); }
      } else { b.pocketed = false; b.mesh.visible = true; b.mesh.position.set(0, 0, 0); } // live: game.js drives the position every frame
    }
  };
  const settle = () => {
    for (const b of game.playbackBalls) { const s = st.sinks.get(b.id); if (s) { b.pocketed = true; b.mesh.visible = false; } }
    machine.to('SETTLED', {}); machine.to('AIM');
  };
  const api = {
    machine, game, balls, ctl, st, posOf, sinkDrawn, host,
    /** game.shoot(): a NEW record object, playbackBalls = live balls, sinkInfo lazy, PLAYBACK with duration.
     * `events` = the record's own kernel event stream (BallOffTable …), set BEFORE the PLAYBACK emission because the
     * module reads it once per record OBJECT and the hook may solve inside `to('PLAYBACK')` (#737 r6) */
    shoot(sinks, duration, key, events = null) {
      machine.to('SIMULATING', { shot: {} });
      game.record = { key: key ?? `r${++st.rec}`, ...(events ? { events } : {}) }; game.sinkInfo = null; game.playbackBalls = balls.filter((b) => !b.pocketed); game.duration = duration; game.clock = 0;
      for (const b of game.playbackBalls) b.baseQuat.copy(b.mesh.quaternion); // game.js:936 — the record's OWN membership is re-pinned
      st.sinks = sinks;
      machine.to('PLAYBACK', { duration, strike: true });
    },
    /** game.loadRecord(stage:'quiet') inside PLAYBACK: a NEW record object, clock 0, NO stateChange;
     * balls absent from the record parked pocketed + invisible */
    quietLoad(sinks, duration, recordIds, key, events = null) {
      game.record = { key: key ?? `r${++st.rec}`, ...(events ? { events } : {}) }; game.sinkInfo = null; game.duration = duration; game.clock = 0; // a FRESH object every time, as game.js parses the archive JSON
      for (const b of balls) { const inRec = recordIds.includes(b.id); b.pocketed = !inRec; b.mesh.visible = inRec; if (!inRec) b.mesh.position.set(0, -10, 0); }
      game.playbackBalls = recordIds.map((id) => balls[id]);
      for (const b of game.playbackBalls) b.baseQuat.identity(); // game.js:1145 — a QUIET stage pins its membership's bases to identity
      st.sinks = sinks;
    },
    /** main.js frame(): game.update(dt) — advance the clock, seek the poses, settle SYNCHRONOUSLY when
     * clock ≥ duration + pad — and only THEN emit('frame', game.clock, dt). The realtime order (review
     * round 5: the settle tick lands in the same frame as the hook that follows it). */
    tick(dt = DT) {
      if (machine.state === 'PLAYBACK') {
        game.clock += dt; game.sinkInfo = st.sinks; seekBalls(Math.min(game.clock, game.duration));
        if (game.clock >= game.duration + SETTLE_PAD) settle();
      }
      machine.emit('frame', game.clock, dt);
    },
    runTicksToSettle() { for (let k = 0; machine.state === 'PLAYBACK' && k < 100000; k++) api.tick(); },
    /** a table switch resolves asynchronously (the loader): tick once to queue it, then wait for the activation seam to resolve */
    // one tick queues the switch, then ctl.whenActivated() resolves exactly when the current generation settles — the landing
    // frame is therefore the tick's own frame, not a host-timing frame; `settleTicks` is published for the rows to print
    async settleActivation() { api.tick(); let timer = null; const guard = new Promise((resolve) => { timer = setTimeout(() => resolve('timeout'), 10000); }); const outcome = await Promise.race([ctl.whenActivated().then(() => 'settled'), guard]); clearTimeout(timer); if (outcome !== 'settled') check('settleActivation hang guard: the current generation did not settle within 10000 ms', false); api.settleTicks = 1; },
    /** playback.js openPlayer: capture the live bed VERBATIM (record, sinks, duration, clock, per-ball state) */
    snapLive() {
      st.snap = { record: game.record, sinks: st.sinks, duration: game.duration, clock: game.clock, state: machine.state,
        balls: balls.map((b) => ({ id: b.id, pocketed: b.pocketed, vis: b.mesh.visible, x: b.mesh.position.x, y: b.mesh.position.y, z: b.mesh.position.z })) };
    },
    /** game.loadRecord(stage:'playback'): the Playback player borrows the bed from a settled state —
     * quiet staging of an ARCHIVED record + ONE emission PLAYBACK { replay, dvr } */
    dvrOpen(sinks, duration, recordIds, key, { snap = true, events = null } = {}) {
      if (snap) api.snapLive();
      game.record = { key: key ?? `dvr${++st.rec}`, ...(events ? { events } : {}) }; game.sinkInfo = null; game.duration = duration; game.clock = 0;
      for (const b of balls) { const inRec = recordIds.includes(b.id); b.pocketed = !inRec; b.mesh.visible = inRec; if (!inRec) b.mesh.position.set(0, -10, 0); }
      game.playbackBalls = recordIds.map((id) => balls[id]);
      for (const b of game.playbackBalls) b.baseQuat.identity(); // stage 'playback' is quiet in game.js (`entering` → quiet): identity
      st.sinks = sinks;
      machine.to('PLAYBACK', { duration, replay: true, dvr: true });
    },
    /** game.restoreRack → applyRack: a REBUILT ball set (new meshes), record null, sinkInfo null */
    rebuild() {
      const rebuilt = st.snap.balls.map((lb) => mkBall(lb.id));
      game.ballSet = { balls: rebuilt }; balls.splice(0, balls.length, ...rebuilt);
      game.record = null; game.sinkInfo = null; game.playbackBalls = [];
    },
    /** game.js applyRack: dispose the live ball set and build a NEW one — every ball object is
     * new, which is what makes a rack a different rack here, including the app's dominant
     * `game.rerack(game.seed)` (the equipment station's commit and revert, most rules re-racks),
     * whose kind and seed are unchanged. Announced with setState('AIM', { seed }) unless QUIET:
     * the only quiet re-racks are playback.js swapBed()'s `rerackKind(kind, seed, {quiet:true})`
     * for a cross-equipment archive and restoreRack() at the close. */
    rerack({ quiet = false, seed = 7 } = {}) {
      const fresh = balls.map((b) => mkBall(b.id));
      game.ballSet = { balls: fresh }; balls.splice(0, balls.length, ...fresh);
      game.sinkInfo = null; game.playbackBalls = [];
      if (!quiet) machine.to('AIM', { seed });
    },
    /** playback.js swapBed(): setEquipment + the QUIET rerack, one statement before
     * loadRecord(stage:'playback') emits the {dvr:true} PLAYBACK. */
    swapBedRack() { api.rerack({ quiet: true }); },
    /** game.loadRecord(recordJson, { recordRef: snap.record }) quiet / playback: the LIVE record back as g.record
     * (the ORIGINAL object), sinkInfo nulled (a NEW Map at the next seek), balls at the record's initial placements */
    restage() {
      const sn = st.snap;
      game.record = sn.record; game.duration = sn.duration; game.clock = 0; st.sinks = new Map(sn.sinks); game.sinkInfo = null;
      const liveIds = sn.balls.filter((lb) => !lb.pocketed || sn.sinks.has(lb.id)).map((lb) => lb.id);
      for (const b of balls) { const inRec = liveIds.includes(b.id); b.pocketed = !inRec; b.mesh.visible = inRec; if (!inRec) b.mesh.position.set(0, -10, 0); }
      game.playbackBalls = liveIds.map((id) => balls[id]);
      for (const b of game.playbackBalls) b.baseQuat.identity(); // the close re-stage is quiet / playback: identity, as game.js:1145
    },
    /** playback.js restorePoses: the captured per-ball state re-applied by id */
    restorePoses() { for (const lb of st.snap.balls) { const b = balls[lb.id]; b.pocketed = lb.pocketed; b.mesh.visible = lb.vis; b.mesh.position.set(lb.x, lb.y, lb.z); } },
    seek(t) { game.sinkInfo = st.sinks; game.clock = t; seekBalls(Math.min(t, game.duration)); },
    /** restoreLive variant 2 (the settled live shot): restoreRack (rebuild) → re-stage with recordRef → seek(duration)
     * → restorePoses → the RAF settle (ticks) → SETTLED → AIM */
    closeV2({ rebuild = true } = {}) { if (rebuild) api.rebuild(); api.restage(); api.seek(game.duration); api.restorePoses(); api.runTicksToSettle(); },
    /** restoreLive variant 1 (record retained but not the live routing identity): quiet re-stage with recordRef →
     * seek(snap.clock) → restorePoses → emitRestoredState(pre-open state) = a dvr-marked settled emission */
    closeV1({ rebuild = true } = {}) { if (rebuild) api.rebuild(); api.restage(); api.seek(st.snap.clock); api.restorePoses(); machine.to(st.snap.state ?? 'AIM', { dvr: true }); },
    /** restoreLive with NO live record: restoreRack (rebuild) → restorePoses → emitRestoredState(AIM) */
    closeV0() { api.rebuild(); api.restorePoses(); game.record = null; machine.to('AIM', { dvr: true }); },
    /** kept for the older scenarios: the seal-4 shape (rebuild + re-stage + replay from 0 + settle) */
    dvrClose() { api.closeV2(); },
    /** game.replay(): the SAME record object re-enters PLAYBACK */
    replay() { game.clock = 0; for (const b of game.playbackBalls) { b.pocketed = false; b.mesh.visible = true; } machine.to('PLAYBACK', { duration: game.duration, replay: true }); },
    /** one rendered frame at ball time t (PLAYBACK: the seek path; other states: game.clock frozen) */
    frame(t, dt = DT) {
      if (machine.state === 'PLAYBACK') {
        game.sinkInfo = st.sinks; // sinkIndex() is built lazily at the first seek/update
        game.clock = t;
        seekBalls(t);
      }
      machine.emit('frame', game.clock, dt);
      if (machine.state === 'PLAYBACK' && t >= game.duration + SETTLE_PAD) settle();
    },
    runToSettle() { for (let k = 1; machine.state === 'PLAYBACK' && k < 100000; k++) api.frame(k * DT); },
  };
  return api;
}
/** the named refusals of the current solve — absent on a module that predates the accessor, so an arm run against the
 * PRE-FIX export reports a miss instead of throwing (#737 r5 classes C/F) */
const refusalsOf = (ctl) => (typeof ctl.refusals === 'function' ? ctl.refusals() : []);
/** the record snapshots the module holds, and the writes its writer REFUSED for being read off the record's own clock —
 * both absent on a module that predates the accessors, so a pre-fix run reports a miss instead of throwing (#737 r8 A/B) */
const snapshotsOf = (ctl) => (typeof ctl.snapshots === 'function' ? ctl.snapshots() : null);
const breachesOf = (ctl) => (typeof ctl.snapshotBreaches === 'function' ? ctl.snapshotBreaches() : null);
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);

// ---- L1 continuation at the next shot ---------------------------------------------
{
  const H = await boot();
  H.shoot(new Map([[1, legacyEntry(1.0)]]), 2.0);
  H.runToSettle();
  for (let k = 0; k < 16; k++) H.frame(0); // AIM dwell: the module's own clock continues
  const before = H.posOf(1);
  const restBefore = new Map(H.ctl.solution().rest);
  check('L1a at the next shot ball 1 is rolling on the track (AIM, posed, marker)', H.machine.state === 'AIM' && before.vis && before.pock && before.marker && H.ctl.poseAt(1, H.ctl.clock().t)?.kind === 'roll', JSON.stringify(before));
  H.shoot(new Map(), 1.0); // the next shot: nothing potted
  const at0 = H.posOf(1);
  H.frame(0); const f0 = H.posOf(1); H.frame(DT); const f1 = H.posOf(1);
  check('L1b the pose is continuous across the new record\'s t = 0 (jump 0 at the stateChange and on the first frame)', dist(before, at0) <= 1e-9 && dist(before, f0) <= 1e-9 && dist(f0, f1) > 0 && dist(f0, f1) < 0.03, `${dist(before, at0)} ${dist(before, f0)} ${dist(f0, f1)}`);
  H.runToSettle();
  for (let k = 0; k < 600 && H.ctl.poseAt(1, H.ctl.clock().t)?.kind !== 'rest'; k++) H.frame(0);
  check('L1c the final station equals the single-shot solution\'s', near(H.ctl.solution().rest.get(1), restBefore.get(1)) && H.ctl.poseAt(1, H.ctl.clock().t)?.kind === 'rest', `${H.ctl.solution().rest.get(1)} vs ${restBefore.get(1)}`);
}

// ---- L2 quiet record swap mid-roll (no stateChange) ---------------------------------
{
  const H = await boot();
  H.shoot(new Map([[1, legacyEntry(1.0)]]), 6.0); // long record: ball 1 lands ≈ 1.255, rests ≈ 4.76
  for (let k = 1; k * DT <= 2.0; k++) H.frame(k * DT);
  const before = H.posOf(1);
  const solBefore = H.ctl.solution();
  const pBefore = H.ctl.poseAt(1, 2.0);
  H.quietLoad(new Map(), 3.0, [0, 2, 3, 4, 5, 6, 7, 8, 9]); // the engine walks to the next segment
  H.frame(0); const at0 = H.posOf(1);
  check('L2a after a QUIET record swap mid-roll ball 1 is posed at the new t = 0 where it was (no vanish, jump 0)', at0.vis && at0.pock && dist(before, at0) <= 1e-9, `${JSON.stringify(before)} → ${JSON.stringify(at0)}`);
  // the continued motion on the new base must equal the old solution's motion at
  // t + 2.0 (same closed forms), frame for frame
  let maxDev = 0;
  for (let k = 1; k * DT <= 2.5; k++) {
    H.frame(k * DT);
    const a = H.posOf(1);
    const b = H.ctl.poseAt(1, k * DT);
    if (!b || !a.vis) { maxDev = Infinity; break; }
    maxDev = Math.max(maxDev, Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z));
  }
  const restNew = H.ctl.solution().rest.get(1);
  check('L2b the continued roll is posed on every frame and ends at the single-record station', Number.isFinite(maxDev) && maxDev <= 1e-9 && near(restNew, solBefore.rest.get(1)), `${restNew} vs ${solBefore.rest.get(1)} maxDev ${maxDev}`);
  void pBefore;
}

// ---- L3 quiet record swap mid-air ---------------------------------------------------
{
  const H = await boot();
  H.shoot(new Map([[1, legacyEntry(1.0)]]), 6.0);
  const h1 = H.ctl.handoffs().find((h) => h.id === 1) ?? null;
  const tSw = 1.2; // tH 1.172 < 1.2 < tLand 1.255
  for (let k = 1; k * DT <= tSw + 1e-9; k++) H.frame(k * DT);
  const hh = H.ctl.handoffs().find((h) => h.id === 1);
  const tSwitch = H.ctl.clock().lastPose;
  H.quietLoad(new Map(), 3.0, [0, 2, 3, 4, 5, 6, 7, 8, 9]);
  H.frame(0);
  const pieces = H.ctl.solution().pieces.get(1);
  const fall = pieces?.[0];
  check('L3a a ball in the air at the quiet swap re-enters as a FALL with its times shifted to the new base (tLand − tSwitch)', !!fall && fall.kind === 'fall' && near(fall.t1, hh.tLand - tSwitch, 1e-9) && near(fall.t0, hh.tH - tSwitch, 1e-9), `${JSON.stringify(fall && { t0: fall.t0, t1: fall.t1 })} vs tLand−tSw ${hh.tLand - tSwitch}`);
  let firstVisible = null;
  for (let k = 1; k * DT <= 1.0; k++) { H.frame(k * DT); if (firstVisible === null && H.posOf(1).vis) firstVisible = k * DT; }
  check('L3b it becomes visible below the cup exit within one frame of its landing on the new base', firstVisible !== null && firstVisible <= hh.tLand - tSwitch + DT + 1e-9, `first visible ${firstVisible} landing ${hh.tLand - tSwitch}`);
  void h1;
}

// ---- L4 TrackEvents: first posed frame past the landing; in-base re-solve on the crossing frame
{
  const H = await boot();
  const got = [];
  H.ctl.onEvent((e) => got.push({ kind: e.kind, t: e.t, ball: e.ball }));
  H.shoot(new Map([[2, legacyEntry(0.3)]]), 3.0);
  H.frame(1.5); // a scripted jump: the first posed frame is past the landing (≈ 0.555)
  const land = got.filter((e) => e.kind === 'landing' && e.ball === 2);
  check('L4a a first posed frame PAST the landing fires the landing exactly once (base seeded at 0)', land.length === 1, JSON.stringify(got));
  H.frame(1.6);
  check('L4b it does not fire again on the next frame', got.filter((e) => e.kind === 'landing' && e.ball === 2).length === 1);
  // in-base re-solve on the crossing frame: pocket set changes exactly when a junction is crossed
  const H2 = await boot();
  const got2 = [];
  H2.ctl.onEvent((e) => got2.push({ kind: e.kind, t: e.t, ball: e.ball }));
  H2.shoot(new Map([[2, legacyEntry(0.3)]]), 6.0);
  H2.frame(DT);
  const junction = H2.ctl.events().find((e) => e.kind === 'junction' && e.ball === 2);
  let k = 2;
  for (; k * DT < junction.t - DT; k++) H2.frame(k * DT);
  H2.balls[7].pocketed = true; H2.balls[7].mesh.visible = false; // a key change (ledger grows) on the crossing frame → in-base re-solve
  H2.frame(junction.t + DT / 2);
  check('L4c an in-base re-solve on the frame that crosses a junction still delivers the junction once', got2.filter((e) => e.kind === 'junction' && e.ball === 2).length === 1 && H2.ctl.stats.solves >= 3, JSON.stringify(got2.filter((e) => e.kind !== 'contact')));
}

// ---- L5 replay reproduces the first playback for a carried ball ---------------------
{
  const H = await boot();
  H.shoot(new Map([[1, legacyEntry(1.0)]]), 2.0);
  H.runToSettle();
  for (let k = 0; k < 16; k++) H.frame(0); // AIM dwell ≈ 0.27 s → ball 1 mid-roll
  H.shoot(new Map(), 1.0);
  const first = [];
  for (let k = 0; H.machine.state === 'PLAYBACK'; k++) { H.frame(k * DT); if (k % 10 === 0) first.push([+(k * DT).toFixed(4), +H.posOf(1).x.toFixed(9), +H.posOf(1).y.toFixed(9)]); }
  for (let k = 0; k < 30; k++) H.frame(0); // dwell again before the user presses replay
  H.replay();
  const second = [];
  for (let k = 0; H.machine.state === 'PLAYBACK'; k++) { H.frame(k * DT); if (k % 10 === 0) second.push([+(k * DT).toFixed(4), +H.posOf(1).x.toFixed(9), +H.posOf(1).y.toFixed(9)]); }
  check('L5 a replay of the record reproduces its first playback frame for frame for the carried ball', JSON.stringify(first) === JSON.stringify(second) && first.length > 3, `${JSON.stringify(first.slice(0, 3))} vs ${JSON.stringify(second.slice(0, 3))}`);
}

// ---- L6 pre-handoff ball at the next shot (artificially late sink) ------------------
{
  const H = await boot();
  // a pot as the record's LAST motion event with a long sink: the legacy form clamps
  // the handoff at t + ttl (0.45 s) = 1.04 s, the record settles at duration + 0.4 =
  // 1.0 s — so at AIM the ball is still in the sink (game.js SETTLE_PAD keeps this
  // unreachable with the shipped constants; the path is guarded anyway)
  const entry = { ...legacyEntry(0.59), glide: 1.2, tFall: 0.6 };
  H.shoot(new Map([[1, entry]]), 0.6);
  H.runToSettle(); // settle at ≈ 1.0 s; the handoff (1.04 s) is later than that
  const h = H.ctl.handoffs().find((x) => x.id === 1);
  const tAim = H.ctl.clock().t;
  const preHandoff = !!h && tAim < h.tH;
  H.shoot(new Map(), 1.0);
  H.frame(0);
  const pieces = H.ctl.solution().pieces.get(1);
  const p0 = pieces?.[0];
  check('L6 a ball still in the sink at the next shot is a SHIFTED arrival on the new base (fall at tH − tSwitch), not a ledger teleport', preHandoff && !!p0 && p0.kind === 'fall' && near(p0.t0, h.tH - tAim, 1e-6), `preHandoff ${preHandoff} tH ${h?.tH} tAim ${tAim} first piece ${JSON.stringify(p0 && { kind: p0.kind, t0: p0.t0 })}`);
}

// ---- L7 the marker means "owns the pose right now" -----------------------------------
{
  const H = await boot();
  H.shoot(new Map([[1, legacyEntry(1.0)]]), 6.0);
  const h = (() => { H.frame(DT); return H.ctl.handoffs().find((x) => x.id === 1); })();
  H.frame(h.tLand + 0.5);                 // posed on the track
  const posed = H.posOf(1);
  H.frame(h.tH - 0.02);                    // scrub back INTO the sink window: game.js shows the sink (visible, not pocketed in this facade… pocketed false)
  const inSink = H.posOf(1);
  H.frame(0.5);                            // before the pot
  const early = H.posOf(1);
  check('L7 obReturnPosed is true only on frames the extension poses: posed → true; scrubbed back into the sink window → false; before the pot → false', posed.marker === true && inSink.marker === false && early.marker === false, JSON.stringify({ posed, inSink, early }));
}

// ---- L8 an unserved pot never enters the tray ledger ---------------------------------
{
  const H = await boot();
  // ball 1 into pocket 0 (an unserved corner — the fixture lists it with a reason), ball 2 into the served right middle
  H.shoot(new Map([[1, legacyEntry(1.0, 0)], [2, legacyEntry(1.0, 4)]]), 2.0);
  H.runToSettle();
  for (let k = 0; k < 400 && H.ctl.poseAt(2, H.ctl.clock().t)?.kind !== 'rest'; k++) H.frame(0);
  const afterFirst = { one: H.posOf(1), two: H.posOf(2), rest: [...H.ctl.solution().rest.keys()] };
  H.shoot(new Map(), 1.0); H.runToSettle();
  const rest2 = [...H.ctl.solution().rest.keys()];
  const one = H.posOf(1), two = H.posOf(2);
  check('L8 a ball potted into an UNSERVED pocket stays with the legacy cull (parked, never posed, absent from the ledger after the next shot); the served pot is present', !afterFirst.rest.includes(1) && !rest2.includes(1) && !one.vis && !one.marker && rest2.includes(2) && two.vis && two.pock, JSON.stringify({ afterFirst, rest2, one, two }));
}

// ---- L9 settled poses survive the next solve (position + orientation) -------------
{
  const H = await boot();
  const sinks = new Map(); for (let i = 1; i <= 6; i++) sinks.set(i, legacyEntry(0.5 + i * 0.5, 4)); // six pots: the 6th overflows onto the trunk
  H.shoot(sinks, 4.0);
  H.runToSettle();
  for (let k = 0; k < 2000 && [...sinks.keys()].some((id) => H.ctl.poseAt(id, H.ctl.clock().t)?.kind !== 'rest'); k++) H.frame(0);
  const before = new Map([...sinks.keys()].map((id) => [id, { ...H.posOf(id), q: H.ctl.poseAt(id, H.ctl.clock().t) }]));
  const trunkId = [...sinks.keys()].find((id) => H.ctl.poseAt(id, H.ctl.clock().t)?.runwayId === 'trunk');
  H.shoot(new Map(), 1.0);
  H.frame(0); H.frame(DT);
  let maxPos = 0, maxQ = 0;
  for (const id of sinks.keys()) {
    const a = before.get(id), b = { ...H.posOf(id), q: H.ctl.poseAt(id, DT) };
    maxPos = Math.max(maxPos, dist(a, b));
    maxQ = Math.max(maxQ, Math.abs(a.q.qw - b.q.qw), Math.abs(a.q.qx - b.q.qx), Math.abs(a.q.qy - b.q.qy), Math.abs(a.q.qz - b.q.qz));
  }
  H.runToSettle(); H.shoot(new Map(), 1.0); H.frame(0); H.frame(DT); // and a THIRD shot (ledger carried twice)
  for (const id of sinks.keys()) {
    const a = before.get(id), b = { ...H.posOf(id), q: H.ctl.poseAt(id, DT) };
    maxPos = Math.max(maxPos, dist(a, b));
    maxQ = Math.max(maxQ, Math.abs(a.q.qw - b.q.qw), Math.abs(a.q.qx - b.q.qx), Math.abs(a.q.qy - b.q.qy), Math.abs(a.q.qz - b.q.qz));
  }
  const trunkAfter = H.ctl.poseAt(trunkId, DT);
  check(`L9 after the second AND third shots every settled ball keeps its pose (max Δpos ${maxPos.toExponential(1)} m, max Δq ${maxQ.toExponential(1)}); the trunk-resting overflow ball (${trunkId}) is still on the trunk`, trunkId !== undefined && maxPos <= 1e-12 && maxQ <= 1e-12 && trunkAfter?.runwayId === 'trunk', JSON.stringify({ trunkId, runway: trunkAfter?.runwayId }));
}

// ---- L10 replay by record CONTENT: A → B → A revisits A's own first playback ---------
{
  const H = await boot();
  const sinkA = () => new Map([[1, legacyEntry(1.0)]]);
  const sample = (n) => { const out = []; for (let k = 0; k <= n; k++) { H.frame(k * DT); if (k % 15 === 0) out.push([+(k * DT).toFixed(4), +H.posOf(1).x.toFixed(9), +H.posOf(1).y.toFixed(9), H.posOf(1).vis]); } return JSON.stringify(out); };
  H.shoot(sinkA(), 6.0, 'A');              // A: first playback (fresh boot)
  const A1 = sample(150);                  // 2.5 s: ball 1 rolling
  H.quietLoad(new Map(), 3.0, [0, 2, 3, 4, 5, 6, 7, 8, 9], 'B'); // B staged quietly while ball 1 rolls
  const B1 = sample(60);
  H.quietLoad(sinkA(), 6.0, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 'A'); // A revisited: a FRESH object, same content
  const A2 = sample(150);
  H.quietLoad(new Map(), 3.0, [0, 2, 3, 4, 5, 6, 7, 8, 9], 'B'); // B revisited
  const B2 = sample(60);
  if (process.env.BR_DEBUG) { console.log('A1', A1); console.log('A2', A2); console.log('B1', B1); console.log('B2', B2); }
  check('L10a A → B → A: the revisit of A reproduces A\'s first playback frame for frame (ball 1 rolling from its handoff, not carried from B)', A1 === A2, `${A1.slice(0, 160)} vs ${A2.slice(0, 160)}`);
  check('L10b A → B → A → B: the revisit of B reproduces B\'s first playback (ball 1 continued from where A\'s first playback left it)', B1 === B2, `${B1.slice(0, 160)} vs ${B2.slice(0, 160)}`);
  const fresh = await boot(); fresh.shoot(sinkA(), 6.0, 'A');
  const F = (() => { const out = []; for (let k = 0; k <= 150; k++) { fresh.frame(k * DT); if (k % 15 === 0) out.push([+(k * DT).toFixed(4), +fresh.posOf(1).x.toFixed(9), +fresh.posOf(1).y.toFixed(9), fresh.posOf(1).vis]); } return JSON.stringify(out); })();
  check('L10c the revisited A equals a FRESH boot of A', A2 === F);
}

// ---- L7b the sink-window branch proper (a sink that keeps the ball pocketed) ---------
{
  const H = await boot();
  H.st.sinkPocketed = true; // the netted-class shape: visible AND pocketed while in the sink
  H.shoot(new Map([[1, legacyEntry(1.0)]]), 6.0);
  H.frame(DT);
  const h = H.ctl.handoffs().find((x) => x.id === 1);
  H.frame(h.tLand + 0.5); const posed = H.posOf(1);
  H.frame(h.tH - 0.02); const inSink = H.posOf(1);            // visible + pocketed, before the crossing → the wait branch
  // hidden before the crossing by something else: pocketed + invisible at tH − 0.2 (the second sub-branch)
  H.game.clock = h.tH - 0.2; H.balls[1].pocketed = true; H.balls[1].mesh.visible = false; H.machine.emit('frame', H.game.clock, DT);
  const hidden = H.posOf(1);
  check('L7b in the sink-window branch (ball pocketed: visible before the crossing, or hidden earlier by another owner) the marker is cleared on that frame', posed.marker === true && inSink.vis && inSink.pock && inSink.marker === false && hidden.marker === false, JSON.stringify({ posed, inSink, hidden }));
}

// ---- L8b / L8c rejection is carried per record, never a rack-wide sticky set ----------
{
  // L8b a quiet Playback revisit of the record whose pot was UNSERVED: the ball is live at
  // t = 0 of the revisit and pots again into the unserved corner — it must not be forgiven
  // into the tray
  const H = await boot();
  const R1 = () => new Map([[1, legacyEntry(1.0, 0)]]);
  H.shoot(R1(), 2.0, 'R1'); H.runToSettle();
  H.shoot(new Map(), 3.0, 'R2'); H.frame(DT); // Playback stages quietly only INSIDE a playing record (game.js loadRecord)
  H.quietLoad(R1(), 2.0, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 'R1'); // the revisit
  for (let k = 0; k * DT <= 1.8; k++) H.frame(k * DT);
  const afterRevisit = H.posOf(1);
  const rest = [...H.ctl.solution().rest.keys()];
  H.quietLoad(new Map(), 1.0, [0, 2, 3, 4, 5, 6, 7, 8, 9], 'R4'); // still in PLAYBACK (the revisit ran to 1.8 of 2.0 s)
  H.frame(0); H.frame(DT);
  const rest4 = [...H.ctl.solution().rest.keys()];
  check('L8b a quiet revisit that re-pots the ball into the UNSERVED corner keeps it culled (never posed, absent from the rest map, absent after the next staging)', !afterRevisit.vis && !afterRevisit.marker && !rest.includes(1) && !rest4.includes(1) && !H.posOf(1).vis, JSON.stringify({ afterRevisit, rest, rest4 }));
  // L8c B → C → B: C pots the tray ball 1 into an unserved corner after a revive; the revisit of B
  // must still show ball 1 in the tray exactly as B's first playback did
  const G = await boot();
  G.shoot(new Map([[1, legacyEntry(1.0, 4)]]), 2.0, 'A'); G.runToSettle();
  for (let k = 0; k < 900 && G.ctl.poseAt(1, G.ctl.clock().t)?.kind !== 'rest'; k++) G.frame(0);
  G.shoot(new Map(), 1.0, 'B');
  const sampleB = () => { const out = []; for (let k = 0; k <= 30; k++) { G.frame(k * DT); if (k % 10 === 0) out.push([+(k * DT).toFixed(4), +G.posOf(1).x.toFixed(9), +G.posOf(1).y.toFixed(9), G.posOf(1).vis, G.posOf(1).marker]); } return JSON.stringify(out); };
  const B1 = sampleB();
  G.quietLoad(new Map([[1, legacyEntry(0.5, 0)]]), 2.0, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 'C'); // ball 1 live again, potted UNSERVED
  for (let k = 0; k * DT <= 1.5; k++) G.frame(k * DT);
  const inC = G.posOf(1);
  G.quietLoad(new Map(), 1.0, [0, 2, 3, 4, 5, 6, 7, 8, 9], 'B');
  const B2 = sampleB();
  check('L8c B → C(unserved pot of the tray ball) → B: the revisit of B reproduces B\'s first playback (ball 1 in the tray), and in C the ball stayed culled', B1 === B2 && !inC.vis && !inC.marker, `${B1.slice(0, 120)} vs ${B2.slice(0, 120)} inC ${JSON.stringify(inC)}`);
}

// ---- L11 newcomers behind a trunk-resting ball pack along the TRUNK -----------------
{
  const H = await boot();
  const sinks = new Map(); for (let i = 1; i <= 6; i++) sinks.set(i, legacyEntry(0.5 + i * 0.5, 4)); // the 6th rests on the trunk
  H.shoot(sinks, 4.0, 'S'); H.runToSettle();
  for (let k = 0; k < 2000 && [...sinks.keys()].some((id) => H.ctl.poseAt(id, H.ctl.clock().t)?.kind !== 'rest'); k++) H.frame(0);
  H.shoot(new Map(), 3.0, 'T'); H.frame(DT); // staging happens inside a playing record
  H.quietLoad(new Map(), 3.0, [0, 9], 'N'); // a staged record whose initial state omits balls 7 and 8 → layout-omitted newcomers
  H.frame(0); H.frame(DT);
  const p7 = H.ctl.poseAt(7, DT), p8 = H.ctl.poseAt(8, DT), p6 = H.ctl.poseAt(6, DT);
  const onTrunk = p6?.runwayId === 'trunk' && p7?.runwayId === 'trunk' && p8?.runwayId === 'trunk';
  const d3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  const spaced = p7 && p8 && p6 && Math.abs(d3(p7, p6) - 2 * R) < 1e-9 && Math.abs(d3(p8, p7) - 2 * R) < 1e-9; // one diameter apart in SPACE (the chord law; exact 2r of path on the straight trunk)
  check('L11 layout-omitted newcomers behind a trunk-resting ball are seated on the TRUNK (one diameter apart), not on the tray line\'s flat extrapolation', onTrunk && spaced && p7.y > p6.y - 1e-9, JSON.stringify({ p6: p6 && [p6.runwayId, +p6.D.toFixed(6), +p6.y.toFixed(4)], p7: p7 && [p7.runwayId, +p7.D.toFixed(6), +p7.y.toFixed(4)], p8: p8 && [p8.runwayId, +p8.D.toFixed(6), +p8.y.toFixed(4)], gaps: p6 && p7 && p8 ? [+(d3(p7, p6) * 1000).toFixed(4), +(d3(p8, p7) * 1000).toFixed(4)] : null }));
}

// ---- L12 snapshots are per rack: an identical record in a NEW rack starts afresh ------
{
  const H = await boot();
  H.shoot(new Map([[3, legacyEntry(1.0, 4)]]), 2.0, 'P'); H.runToSettle();
  for (let k = 0; k < 16; k++) H.frame(0);                     // ball 3 mid-roll
  H.shoot(new Map(), 1.0, 'A'); H.runToSettle();                // snapshot(A) = ball 3 rolling
  // a new rack with the same seed: game.js rebuilds the ball set and emits AIM { seed }
  const balls2 = Array.from({ length: 10 }, (_, i) => ({ id: i, pocketed: false, sinkT: -1, baseQuat: mkQuat(), mesh: { visible: true, position: { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } }, quaternion: { set() {}, multiply() {} }, scale: { setScalar() {} }, userData: {}, material: {} } }));
  H.game.ballSet = { balls: balls2 }; H.balls.splice(0, H.balls.length, ...balls2); H.machine.to('AIM', { seed: 1 });
  H.shoot(new Map([[3, legacyEntry(1.0, 4)]]), 2.0, 'P'); H.runToSettle();
  for (let k = 0; k < 900 && H.ctl.poseAt(3, H.ctl.clock().t)?.kind !== 'rest'; k++) H.frame(0); // this time ball 3 RESTS before the next shot
  const atRest = H.posOf(3);
  H.shoot(new Map(), 1.0, 'A');                                  // identical content to the first rack's A
  H.frame(0); H.frame(DT);
  const after = H.posOf(3);
  check('L12 after a rerack an identical-content shot does NOT reuse the previous rack\'s snapshot: the resting ball stays at rest (no jump back into a roll)', dist(atRest, after) <= 1e-9 && H.ctl.poseAt(3, DT)?.kind === 'rest', `${JSON.stringify(atRest)} → ${JSON.stringify(after)} kind ${H.ctl.poseAt(3, DT)?.kind}`);
}

// ---- L13 the Playback borrow: its own session, the live session restored bit for bit ---
// Realtime frames run in main.js order (tick: update → settle → hook); the close follows
// playback.js restoreLive — variant 2 (the settled live shot: rebuild, re-stage the live
// record with recordRef, seek(duration), restorePoses, RAF settle), variant 1 (quiet
// re-stage + seek + the dvr-marked settled emission) and the no-live-record close —
// with the live balls at REST and still ROLLING at open, and a same-bed close.
{
  const scenario = async ({ borrowKind, rollingAtOpen, rebuild }) => {
    const H = await boot();
    const evs = []; H.ctl.onEvent((e) => evs.push([e.kind, +Number(e.t).toFixed(4), e.ball]));
    H.shoot(new Map([[1, legacyEntry(1.0, 4)], [2, legacyEntry(1.4, 4)]]), 2.5, 'live1'); H.runTicksToSettle();
    if (rollingAtOpen) { for (let k = 0; k < 20; k++) H.tick(); }                     // AIM dwell: both balls still rolling
    else { for (let k = 0; k < 900 && [1, 2].some((id) => H.ctl.poseAt(id, H.ctl.clock().t)?.kind !== 'rest'); k++) H.tick(); }
    const sol = H.ctl.solution();
    const before = { rest: [...sol.rest].sort(), ledger: H.ctl.ledger().slice(), clock: H.ctl.clock().t, nEvents: evs.length, p1: H.posOf(1), p2: H.posOf(2) };
    let dvrTrace = null;
    if (borrowKind) {
      H.dvrOpen(new Map([[5, legacyEntry(0.8, 4)]]), 2.0, [0, 2, 3, 4, 5, 6, 7, 8, 9], 'archived'); // ball 1 absent there, ball 5 potted
      const rows = [];
      for (let k = 0; k * DT <= 1.9; k++) { H.tick(); if (k % 20 === 0) rows.push([+H.game.clock.toFixed(3), +H.posOf(5).x.toFixed(9), +H.posOf(1).x.toFixed(9), H.posOf(1).vis, [...H.ctl.solution().rest.keys()].join('+')]); }
      H.frame(0.3); H.frame(1.9); // scrubs inside the player (renderAt order)
      dvrTrace = JSON.stringify(rows);
      if (borrowKind === 'v2') H.closeV2({ rebuild }); else if (borrowKind === 'v1') H.closeV1({ rebuild }); else H.closeV0();
    }
    const nEventsAtClose = evs.length; // the player's own events (and its scrubs) are not the live stream
    const atClose = { clock: H.ctl.clock().t, state: H.machine.state, borrowed: H.ctl.borrowed(), sameSolution: H.ctl.solution() === sol, rest: [...H.ctl.solution().rest].sort() };
    const after = [];
    for (let k = 0; k < 40; k++) { H.tick(); after.push({ t: H.ctl.clock().t, p1: H.posOf(1), p2: H.posOf(2) }); }
    return { ctl: H.ctl, before, atClose, after, dvrTrace, evAfter: evs.slice(nEventsAtClose) };
  };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  for (const rollingAtOpen of [false, true]) {
    const control = await scenario({ borrowKind: null, rollingAtOpen, rebuild: true });
    for (const [borrowKind, rebuild] of [['v2', true], ['v2', false], ['v1', true]]) {
      const run = await scenario({ borrowKind, rollingAtOpen, rebuild });
      const tag = `L13 ${borrowKind}${rebuild ? '' : ' same-bed'}, ${rollingAtOpen ? 'rolling' : 'at rest'} at open`;
      check(`${tag}: at close the live session is the stashed object (no re-solve), its continuation clock is the open value (${run.before.clock.toFixed(3)} s), rest map unchanged, not borrowed, settled`,
        run.atClose.sameSolution && Math.abs(run.atClose.clock - run.before.clock) <= 1e-12 && same(run.atClose.rest, run.before.rest) && !run.atClose.borrowed && run.atClose.state !== 'PLAYBACK',
        JSON.stringify({ clock: [run.before.clock, run.atClose.clock], borrowed: run.atClose.borrowed, state: run.atClose.state, sameSolution: run.atClose.sameSolution }));
      // after the close: the ball clock resumes from the open value by dt per frame, and every pose /
      // visibility / marker equals the never-borrowed control evaluated at the SAME continuation time
      let bad = null;
      for (let k = 0; k < run.after.length && !bad; k++) {
        const row = run.after[k];
        const tExp = run.before.clock + (k + 1) * DT;
        const c1 = control.ctl.poseAt(1, row.t), c2 = control.ctl.poseAt(2, row.t);
        if (Math.abs(row.t - tExp) > 1e-9) bad = { k, why: 'clock', t: row.t, tExp };
        else if (!c1 || !c2) bad = { k, why: 'control pose missing', t: row.t };
        else if (Math.hypot(row.p1.x - c1.x, row.p1.y - c1.y, row.p1.z - c1.z) > 1e-9 || Math.hypot(row.p2.x - c2.x, row.p2.y - c2.y, row.p2.z - c2.z) > 1e-9) bad = { k, why: 'pose', row, c1: [c1.x, c1.y, c1.z], c2: [c2.x, c2.y, c2.z] };
        else if (!row.p1.vis || !row.p1.marker || !row.p2.vis || !row.p2.marker) bad = { k, why: 'visibility/marker', row };
      }
      check(`${tag}: for 40 frames after the close the ball clock resumes from the open value by dt per frame and every pose equals the never-borrowed control at the same continuation time (visible, marked)`, !bad, JSON.stringify(bad));
      const stale = run.evAfter.filter((e) => e[1] <= run.before.clock + 1e-9);
      check(`${tag}: no TrackEvent delivered before the open is re-fired after the close`, stale.length === 0, JSON.stringify(stale.slice(0, 4)));
      if (borrowKind === 'v2' && rebuild && !rollingAtOpen) {
        check('L13 inside the borrow the archived record runs on a FRESH session (ball 1 a plain newcomer of that record, ball 5 rolling from its own pot)', (() => { const rows = JSON.parse(run.dvrTrace); return rows.some((r) => r[1] < -0.05) && rows.every((r) => r[4].split('+').includes('1')); })(), run.dvrTrace.slice(0, 200));
      }
    }
  }
  // the NO-live-record close (playback.js: the pre-open bed had a rack with no staged shot):
  // a rack whose layout omits balls 3 and 4 (ledger, no record) → open → close v0
  {
    const H = await boot();
    for (const id of [3, 4]) { H.balls[id].pocketed = true; H.balls[id].mesh.visible = false; }
    H.tick(); H.tick(); // the ledger seats 3 and 4 in the tray (no record, no shot)
    const sol0 = H.ctl.solution();
    const before = { p3: H.posOf(3), p4: H.posOf(4), rest: [...sol0.rest].sort(), clock: H.ctl.clock().t };
    H.dvrOpen(new Map([[5, legacyEntry(0.8, 4)]]), 2.0, [0, 1, 2, 5, 6, 7, 8, 9], 'archived0');
    for (let k = 0; k * DT <= 1.5; k++) H.tick();
    H.closeV0();
    const atClose = { same: H.ctl.solution() === sol0, borrowed: H.ctl.borrowed(), state: H.machine.state, clock: H.ctl.clock().t };
    H.tick();
    check('L13 v0 (no live record): the ledger-only live session is restored bit for bit at the dvr-marked AIM emission (same solution object, same rest map, poses back, not borrowed)', atClose.same && !atClose.borrowed && atClose.state === 'AIM' && same([...H.ctl.solution().rest].sort(), before.rest) && dist(H.posOf(3), before.p3) <= 1e-9 && dist(H.posOf(4), before.p4) <= 1e-9 && H.posOf(3).marker, JSON.stringify({ atClose, p3: [before.p3, H.posOf(3)] }));
  }
}

// ---- L14 the documented loader: fetchImpl is the one path; a failing loader = inert + law line, no throw
{
  const H = await boot({ fetchImpl: async () => { throw new Error('offline'); }, expectEnabled: false });
  check('L14a a rejecting fetchImpl → inert controller with the law line (no throw, no global fetch fallback)', H.ctl.enabled === false && /not loadable \(offline\)/.test(H.ctl.reason), H.ctl.reason);
  const H2 = await boot({ fetchImpl: async () => ({ ok: false, status: 404 }), expectEnabled: false });
  check('L14b a 404 from fetchImpl → inert with "not loadable (HTTP 404)"', H2.ctl.enabled === false && /not loadable \(HTTP 404\)/.test(H2.ctl.reason), H2.ctl.reason);
  // L15 a track naming an UNKNOWN catalog table id → inert with the law line (never the pin-table fallback)
  const H3 = await boot({ fetchImpl: async (url) => { const r = await fileFetch(url); const d = await r.json(); d.doc.table_id = 'no_such_table'; return { ok: true, status: 200, json: async () => d }; }, expectEnabled: false });
  check('L15 a track whose doc.table_id is not in the catalog is inert with the unknown-id law line', H3.ctl.enabled === false && /unknown catalog table id "no_such_table"/.test(H3.ctl.reason), H3.ctl.reason);
  const H4 = await boot({ fetchImpl: async (url) => { const r = await fileFetch(url); const d = await r.json(); delete d.doc.table_id; return { ok: true, status: 200, json: async () => d }; }, expectEnabled: false });
  check('L15b a track with no doc.table_id is refused under the JSON schema law line ([V0] /doc required), reported once — the shape gate runs before ownership', H4.ctl.enabled === false && /\[V0\].*\/doc required: missing property "table_id"/.test(H4.ctl.reason) && globalThis.__test.errors.some((e) => /\[V0\]/.test(e)), H4.ctl.reason);
}

// ---- L16 the terminal-chutes topology through the real controller (schema 1.1) -------
{
  const H = await boot({ track: 'TEST-terminal-chutes' });
  check('L16a the controller arms the terminal TEST fixture (topology terminal-chutes, two rests, no tray)', H.ctl.enabled && H.ctl.track.topology === 'terminal-chutes' && H.ctl.track.rests.size === 2 && H.ctl.track.tray === null, H.ctl.reason);
  const evs = []; H.ctl.onEvent((e) => evs.push([e.kind, e.ball, e.runwayId]));
  H.shoot(new Map([[1, legacyEntry(0.6, 4)], [2, legacyEntry(1.1, 4)]]), 2.0, 'T1'); H.runTicksToSettle();
  for (let k = 0; k < 900 && [1, 2].some((id) => H.ctl.poseAt(id, H.ctl.clock().t)?.kind !== 'rest'); k++) H.tick();
  const p1 = H.ctl.poseAt(1, H.ctl.clock().t), p2 = H.ctl.poseAt(2, H.ctl.clock().t);
  check('L16b two pots into the right middle queue in rc-chute one diameter apart (D = r, 3r), both posed and marked', p1?.runwayId === 'rc-chute' && p2?.runwayId === 'rc-chute' && Math.abs(p1.D - R) < 1e-9 && Math.abs(p2.D - 3 * R) < 1e-9 && H.posOf(1).vis && H.posOf(1).marker && H.posOf(2).marker, JSON.stringify({ p1: p1 && [p1.runwayId, p1.D], p2: p2 && [p2.runwayId, p2.D] }));
  check('L16c the wall event names the chute and a contact names both balls', evs.some((e) => e[0] === 'wall' && e[1] === 1 && e[2] === 'rc-chute') && evs.some((e) => e[0] === 'contact' && e[1] === 2), JSON.stringify(evs.slice(0, 6)));
  // a layout-omitted ball on a terminal system: no collector → it stays culled (never seated)
  H.balls[7].pocketed = true; H.balls[7].mesh.visible = false; H.tick(); H.tick();
  check('L16d a ball with no known chute on a terminal system stays culled (never seated, not in the rest map)', !H.ctl.solution().rest.has(7) && !H.posOf(7).vis && !H.posOf(7).marker, JSON.stringify(H.posOf(7)));
  // continuation across the next shot works on a chute as on a tray
  H.shoot(new Map([[3, legacyEntry(0.6, 1)]]), 2.0, 'T2'); H.runTicksToSettle();
  for (let k = 0; k < 900 && H.ctl.poseAt(3, H.ctl.clock().t)?.kind !== 'rest'; k++) H.tick();
  const p3 = H.ctl.poseAt(3, H.ctl.clock().t);
  check('L16e a pot into the OTHER middle rests in lc-chute at D = r while rc-chute keeps its two (no cross-chute contact)', p3?.runwayId === 'lc-chute' && Math.abs(p3.D - R) < 1e-9 && H.ctl.poseAt(1, H.ctl.clock().t)?.runwayId === 'rc-chute' && H.ctl.poseAt(2, H.ctl.clock().t)?.runwayId === 'rc-chute', JSON.stringify(p3 && [p3.runwayId, p3.D]));
  // L16f overflow through the real controller: six more pots into rc → 8 in the chain (chute 5, lead 1,
  // one seat within a ball length above the entry); the 8th cannot seat → REFUSED as overflow, culled,
  // carried into the next shot as a rejection (review round 6)
  H.balls[7].pocketed = false; H.balls[7].mesh.visible = true;
  const evs2 = []; H.ctl.onEvent((e) => evs2.push([e.kind, e.ball, +e.t.toFixed(3), e.D === undefined ? null : +(e.D * 1000).toFixed(1)]));
  H.shoot(new Map([[4, legacyEntry(0.5, 4)], [5, legacyEntry(0.9, 4)], [6, legacyEntry(1.3, 4)], [7, legacyEntry(1.7, 4)], [8, legacyEntry(2.1, 4)], [9, legacyEntry(2.5, 4)]]), 3.4, 'T3'); H.runTicksToSettle();
  for (let k = 0; k < 1500 && [4, 5, 6, 7, 8].some((id) => H.ctl.poseAt(id, H.ctl.clock().t)?.kind !== 'rest'); k++) H.tick();
  const sol6 = H.ctl.solution(); const rc4 = H.ctl.track.routes.get(4);
  const seated6 = [1, 2, 4, 5, 6, 7, 8].map((id) => sol6.rest.get(id));
  // (#737 r3 class B) read after the settle — a base switch — the refusal is CARRIED as a rejection (rejected ⊇ overflow), no longer re-decided there
  check('L16f six more pots into rc (8 in the chain): seven seat at most one ball length above the entry, the 8th is REFUSED as overflow — an overflow event, absent from the rest map, culled and unmarked, carried as a rejection at the settle', sol6.rejected.has(9) && !sol6.rest.has(9) && seated6.every((D) => D !== undefined && D <= rc4.total + 2 * R + 1e-9) && evs2.some((e) => e[0] === 'overflow' && e[1] === 9) && !H.posOf(9).vis && !H.posOf(9).marker, JSON.stringify({ seated: seated6.map((D) => D && +(D * 1000).toFixed(1)), total: +(rc4.total * 1000).toFixed(1), overflow: [...sol6.overflow], rejected: [...sol6.rejected], pos9: H.posOf(9), ev9: evs2.filter((e) => e[1] === 9) }));
  H.shoot(new Map(), 1.0, 'T4'); H.runTicksToSettle(); H.tick(); H.tick();
  check('L16g the refused ball stays culled across the next shot (carried as a rejection) and the seven keep their seats', !H.ctl.solution().rest.has(9) && !H.posOf(9).vis && H.ctl.solution().rejected.has(9) && [1, 2, 4, 5, 6, 7, 8].every((id) => H.ctl.solution().rest.has(id)), JSON.stringify({ rejected: [...H.ctl.solution().rejected], rest: [...H.ctl.solution().rest.keys()] }));
}

// ---- L17 (review r4 P2-2): a revived ball loses its carried rest station -------------
// pot 1 and 2 → revive 1 (respot: back on the table) → pot 3 (it rolls into the hole at
// the wall) → a layout marks 1 pocketed again with NO sink entry (layout-omitted): 1 must
// pack behind the queue, never be re-seated at its stale station under ball 3
{
  const H = await boot({ expectEnabled: true });
  H.shoot(new Map([[1, legacyEntry(0.6, 4)], [2, legacyEntry(1.1, 4)]]), 2.0, 'R1'); H.runTicksToSettle();
  for (let k = 0; k < 900 && [1, 2].some((id) => H.ctl.poseAt(id, H.ctl.clock().t)?.kind !== 'rest'); k++) H.tick();
  const d1 = H.ctl.solution().rest.get(1), d2 = H.ctl.solution().rest.get(2);
  // revive ball 1: back on the table
  H.balls[1].pocketed = false; H.balls[1].mesh.visible = true; H.balls[1].mesh.position.set(0.3, R, 0.1);
  H.tick(); H.tick();
  H.shoot(new Map([[3, legacyEntry(0.6, 4)]]), 2.0, 'R2'); H.runTicksToSettle();
  for (let k = 0; k < 900 && H.ctl.poseAt(3, H.ctl.clock().t)?.kind !== 'rest'; k++) H.tick();
  const d3 = H.ctl.solution().rest.get(3);
  const d2b = H.ctl.solution().rest.get(2);
  check('L17a after the revive the next pot PUSHES the un-backed ball 2 into the hole the revived ball left (2 → D = r, 3 behind it at 3r) and ball 1 is out of the solution', Math.abs(d1 - R) < 1e-9 && Math.abs(d2 - 3 * R) < 1e-9 && Math.abs(d2b - R) < 1e-9 && Math.abs(d3 - 3 * R) < 1e-9 && !H.ctl.solution().rest.has(1) && !H.posOf(1).marker, JSON.stringify({ d1, d2, d2b, d3, rest: [...H.ctl.solution().rest.keys()] }));
  // a layout re-adds ball 1 as pocketed with no sink entry → a layout-omitted ledger newcomer
  H.balls[1].pocketed = true; H.balls[1].mesh.visible = false;
  H.shoot(new Map(), 1.0, 'R3'); H.runTicksToSettle(); H.tick(); H.tick();
  const rest = [...H.ctl.solution().rest.entries()].sort((a, b) => a[1] - b[1]);
  let overlap = 0;
  for (let i = 1; i < rest.length; i++) if (rest[i][1] - rest[i - 1][1] < 2 * R - 1e-9) overlap += 1;
  check('L17b the layout-omitted revived ball packs BEHIND the queue (D = 5r), never at its stale station r (now ball 2\'s): no two rest stations closer than one ball diameter', overlap === 0 && Math.abs(H.ctl.solution().rest.get(1) - 5 * R) < 1e-9 && Math.abs(H.ctl.solution().rest.get(2) - R) < 1e-9, JSON.stringify(rest.map(([id, D]) => [id, +(D * 1000).toFixed(1)])));
}

// ---- L18–L20 (review r5): cross-bed Playback borrows and the activation fallback ------------
// A table-module shim over the real table.js: the active table is switchable and a table may be
// given a spec-armed return track without building a scene (the contract's tableModule seam).
const realTable = await import('../scene/table.js');
const mkTableShim = (initial, specTracks = {}) => {
  const state = { id: initial };
  const specFor = (id) => { const base = realTable.specFor?.(id) ?? null; if (!base || !specTracks[id]) return base; return { ...base, render: { ...(base.render ?? {}), pocketSystem: 'return-track', returnTrack: specTracks[id] } }; };
  return { shim: { ...realTable, activeTableId: () => state.id, specFor }, switchTo: (id) => { state.id = id; } };
};
{
  // L18 (P2): live shot on the TEST track (wpa) → DVR → the player re-equips to a table with ITS OWN
  // spec track (diamond, the alias prop) inside PLAYBACK → close (restoreRack re-equips wpa) → the live
  // session comes back bit for bit; control = the same shot never borrowed
  const run = async (borrowIt) => {
    const T = mkTableShim('wpa_generic_9ft', { diamond_proam_9ft: 'TEST-alias-diamond-wire-slide' });
    const H = await boot({ tableModule: T.shim });
    H.shoot(new Map([[1, legacyEntry(0.6, 4)], [2, legacyEntry(1.1, 4)]]), 2.0, 'S1'); H.runTicksToSettle();
    for (let k = 0; k < 900 && [1, 2].some((id) => H.ctl.poseAt(id, H.ctl.clock().t)?.kind !== 'rest'); k++) H.tick();
    const solBefore = H.ctl.solution(); const clockBefore = H.ctl.clock().t;
    const posesBefore = [1, 2].map((id) => H.posOf(id));
    let inner = null;
    if (borrowIt) {
      H.dvrOpen(new Map([[5, legacyEntry(0.8, 4)]]), 2.0, [0, 2, 3, 4, 5, 6, 7, 8, 9], 'archived');
      T.switchTo('diamond_proam_9ft'); await H.settleActivation();
      inner = { enabled: H.ctl.enabled, trackId: H.ctl.trackId, armedBy: H.ctl.armedBy, borrowed: H.ctl.borrowed?.() ?? null, reason: H.ctl.reason };
      for (let k = 0; k < 40; k++) H.tick();
      // close: restoreRack rebuilds the live rack ON THE LIVE TABLE (a switch back), then the live record is re-staged and sought
      H.rebuild(); T.switchTo('wpa_generic_9ft'); await H.settleActivation();
      H.restage(); H.seek(H.game.duration); H.restorePoses(); H.runTicksToSettle();
      for (let k = 0; k < 5; k++) H.tick();
    }
    return { H, solBefore, clockBefore, posesBefore, inner };
  };
  const ctrl = await run(false); const test = await run(true);
  const same = test.H.ctl.solution() === test.solBefore;
  const restEq = JSON.stringify([...test.H.ctl.solution().rest]) === JSON.stringify([...ctrl.H.ctl.solution().rest]);
  const poses = [1, 2].map((id) => test.H.posOf(id));
  const posesCtrl = [1, 2].map((id) => ctrl.H.posOf(id));
  check('L18a inside the borrow the player\'s bed switched to diamond: the alias track is installed for the PLAYBACK session by the table\'s own spec (armedBy spec — the URL track belongs to wpa), the live stash held', !!test.inner && test.inner.enabled === true && test.inner.trackId === 'TEST-alias-diamond-wire-slide' && test.inner.armedBy === 'spec' && test.inner.borrowed === true, JSON.stringify(test.inner));
  check('L18b after the close on the re-equipped live table the live session is the stashed object (no re-solve), rest map and poses equal the never-borrowed control, not borrowed', same && restEq && !(test.H.ctl.borrowed?.() ?? false) && JSON.stringify(poses) === JSON.stringify(posesCtrl), JSON.stringify({ same, restEq, borrowed: test.H.ctl.borrowed?.(), poses, posesCtrl, reason: test.H.ctl.reason }));
}
{
  // L19 (P2): the live bed is a LEDGER-ONLY session (a rack whose layout omits balls 3 and 4:
  // no record, no shot) → DVR of a NET table (inert inside) → the no-live-record close through
  // the switch back: the dvr-marked AIM emission arrives while the live table's track is still
  // activating — latched, handed back once the track is up (same solution object)
  const run = async (borrowIt) => {
    const T = mkTableShim('wpa_generic_9ft');
    const H = await boot({ tableModule: T.shim });
    for (const id of [3, 4]) { H.balls[id].pocketed = true; H.balls[id].mesh.visible = false; }
    H.tick(); H.tick(); // the ledger seats 3 and 4 in the tray
    const solBefore = H.ctl.solution();
    let inner = null;
    if (borrowIt) {
      H.snapLive();
      H.dvrOpen(new Map([[5, legacyEntry(0.8, 4)]]), 2.0, [0, 1, 2, 5, 6, 7, 8, 9], 'archived-net');
      T.switchTo('chinese8_pro_9ft'); await H.settleActivation();
      inner = { enabled: H.ctl.enabled, reason: H.ctl.reason, borrowed: H.ctl.borrowed?.() };
      for (let k = 0; k < 40; k++) H.tick();
      // close with no live record: restoreRack (rebuild + the switch back) → restorePoses → emitRestoredState(AIM, dvr)
      // BEFORE the live track's activation has resolved (the emission is latched)
      H.rebuild(); T.switchTo('wpa_generic_9ft'); H.restorePoses(); H.game.record = null; H.machine.to('AIM', { dvr: true });
      inner.borrowedAtEmission = H.ctl.borrowed?.(); inner.trackAtEmission = H.ctl.enabled;
      await H.settleActivation();
      for (let k = 0; k < 3; k++) H.tick();
    } else { for (let k = 0; k < 3; k++) H.tick(); }
    return { H, solBefore, inner };
  };
  const ctrl = await run(false); const test = await run(true);
  const restEq = JSON.stringify([...test.H.ctl.solution().rest].sort()) === JSON.stringify([...ctrl.H.ctl.solution().rest].sort());
  const poses = [3, 4].map((id) => test.H.posOf(id)); const posesCtrl = [3, 4].map((id) => ctrl.H.posOf(id));
  check('L19a inside the borrow the bed is a net table: inert (the URL track is wpa\'s — the ownership law line; no spec track), the live stash held', !!test.inner && test.inner.enabled === false && /defined for wpa_generic_9ft, active table is chinese8_pro_9ft|no return track/.test(test.inner.reason) && test.inner.borrowed === true, JSON.stringify(test.inner));
  check('L19b the no-live-record close emitted BEFORE the live track re-activated (still borrowed and inert at the emission) is latched: once the track is up the ledger-only live session is handed back — the same solution object, rest map and poses equal the never-borrowed control, not borrowed', !!test.inner && test.inner.borrowedAtEmission === true && test.inner.trackAtEmission === false && test.H.ctl.solution() === test.solBefore && restEq && !(test.H.ctl.borrowed?.() ?? false) && JSON.stringify(poses) === JSON.stringify(posesCtrl), JSON.stringify({ restEq, borrowed: test.H.ctl.borrowed?.(), reason: test.H.ctl.reason, inner: test.inner, poses, posesCtrl }));
}
{
  // L19c–e (review 7, P1): the APP order — restoreRack re-equips the bed and the close is emitted in
  // the SAME synchronous task (no yield for the module's activation). With a DVR bed that carries its
  // own track (diamond, alias by spec): v1 and v0 closes back on wpa must hand the live session back
  // once wpa's track is up (never restore it into the diamond activation); a close ON the foreign
  // bed (no switch back) must DROP the stash (contract §1), never pose wpa's tray on diamond
  const setup = async () => {
    const T = mkTableShim('wpa_generic_9ft', { diamond_proam_9ft: 'TEST-alias-diamond-wire-slide' });
    const H = await boot({ tableModule: T.shim });
    H.shoot(new Map([[1, legacyEntry(0.6, 4)], [2, legacyEntry(1.1, 4)]]), 2.0, 'S1'); H.runTicksToSettle();
    for (let k = 0; k < 900 && [1, 2].some((id) => H.ctl.poseAt(id, H.ctl.clock().t)?.kind !== 'rest'); k++) H.tick();
    return { T, H, solBefore: H.ctl.solution(), clockBefore: H.ctl.clock().t };
  };
  const control = await setup(); for (let k = 0; k < 43; k++) control.H.tick();
  const ctrlPoses = () => [1, 2].map((id) => control.H.posOf(id));
  // v1 in the app order
  {
    const { T, H, solBefore, clockBefore } = await setup();
    H.snapLive();
    H.dvrOpen(new Map([[5, legacyEntry(0.8, 4)]]), 2.0, [0, 2, 3, 4, 5, 6, 7, 8, 9], 'archived');
    T.switchTo('diamond_proam_9ft'); await H.settleActivation();
    for (let k = 0; k < 40; k++) H.tick();
    const inner = { trackId: H.ctl.trackId, enabled: H.ctl.enabled, borrowed: H.ctl.borrowed() };
    // restoreRack (rebuild + the switch back) → quiet re-stage → seek(open clock) → restorePoses → emitRestoredState — one task
    H.rebuild(); T.switchTo('wpa_generic_9ft'); H.restage(); H.seek(H.st.snap.clock); H.restorePoses(); H.machine.to('AIM', { dvr: true });
    const atEmission = { trackId: H.ctl.trackId, enabled: H.ctl.enabled, borrowed: H.ctl.borrowed(), reason: H.ctl.reason };
    await H.settleActivation();
    for (let k = 0; k < 3; k++) H.tick();
    const same = H.ctl.solution() === solBefore;
    const dk = Math.round((H.ctl.clock().t - clockBefore) / DT); // the hand-back frame HOLDS the continuation clock (L13 law); the frames after it advance by dt
    const clockOk = dk >= 0 && dk <= 3 && Math.abs(H.ctl.clock().t - clockBefore - dk * DT) < 1e-6;
    check('L19c v1 close in the APP order through a track-bearing DVR bed: at the emission the module is already torn down for wpa (inert, pending), the stash held; once wpa\'s track is up the live session is the stashed object, not borrowed', inner.trackId === 'TEST-alias-diamond-wire-slide' && inner.borrowed === true && atEmission.enabled === false && atEmission.borrowed === true && same && !H.ctl.borrowed() && clockOk, JSON.stringify({ inner, atEmission, same, clock: H.ctl.clock().t, clockBefore, borrowed: H.ctl.borrowed(), reason: H.ctl.reason }));
    let bad = null;
    for (let k = 0; k < 40 && !bad; k++) { H.tick(); control.H.tick(); const a = [1, 2].map((id) => H.posOf(id)); const b = ctrlPoses(); if (JSON.stringify(a) !== JSON.stringify(b)) bad = { k, a, b }; }
    check('L19c′ 40 frames after that close every pose equals the never-borrowed control', !bad, JSON.stringify(bad));
  }
  // v0 in the app order (no live record: a ledger-only live bed)
  {
    const T = mkTableShim('wpa_generic_9ft', { diamond_proam_9ft: 'TEST-alias-diamond-wire-slide' });
    const H = await boot({ tableModule: T.shim });
    for (const id of [3, 4]) { H.balls[id].pocketed = true; H.balls[id].mesh.visible = false; }
    H.tick(); H.tick();
    const solBefore = H.ctl.solution(); const before = [3, 4].map((id) => H.posOf(id));
    H.snapLive();
    H.dvrOpen(new Map([[5, legacyEntry(0.8, 4)]]), 2.0, [0, 1, 2, 5, 6, 7, 8, 9], 'archived0');
    T.switchTo('diamond_proam_9ft'); await H.settleActivation();
    for (let k = 0; k < 40; k++) H.tick();
    H.rebuild(); T.switchTo('wpa_generic_9ft'); H.restorePoses(); H.game.record = null; H.machine.to('AIM', { dvr: true });
    const atEmission = { enabled: H.ctl.enabled, borrowed: H.ctl.borrowed() };
    await H.settleActivation();
    for (let k = 0; k < 3; k++) H.tick();
    check('L19d v0 close in the APP order through a track-bearing DVR bed: latched at the emission (inert, still borrowed), the ledger-only live session handed back once wpa\'s track is up — same solution object, poses back, not borrowed', atEmission.enabled === false && atEmission.borrowed === true && H.ctl.solution() === solBefore && !H.ctl.borrowed() && JSON.stringify([3, 4].map((id) => H.posOf(id))) === JSON.stringify(before), JSON.stringify({ atEmission, same: H.ctl.solution() === solBefore, borrowed: H.ctl.borrowed(), poses: [3, 4].map((id) => H.posOf(id)), before }));
  }
  // a close ON the foreign bed, no switch back: the stash is dropped, nothing of wpa is posed on diamond
  {
    const { T, H, solBefore } = await setup();
    H.snapLive();
    H.dvrOpen(new Map([[5, legacyEntry(0.8, 4)]]), 2.0, [0, 2, 3, 4, 5, 6, 7, 8, 9], 'archived');
    T.switchTo('diamond_proam_9ft'); await H.settleActivation();
    for (let k = 0; k < 40; k++) H.tick();
    // the player closes while the bed stays on diamond: the live record re-staged there, settled emission there
    H.restage(); H.seek(H.st.snap.clock); H.restorePoses(); H.machine.to('AIM', { dvr: true });
    for (let k = 0; k < 3; k++) H.tick();
    // (the re-staged live record's pots are then a fresh solve OF THE DIAMOND SESSION on its own track — a legitimate playback of that record on the active bed, not the wpa stash)
    const fresh = H.ctl.solution() !== solBefore;
    check('L19e a close ON the foreign bed (no switch back): the wpa stash is DROPPED (contract §1) — not borrowed, the diamond session is a fresh solve of the re-staged record on its own track, never the wpa session object', !H.ctl.borrowed() && fresh && H.ctl.trackId === 'TEST-alias-diamond-wire-slide', JSON.stringify({ borrowed: H.ctl.borrowed(), sameAsWpa: !fresh, trackId: H.ctl.trackId }));
  }
}
{
  // L19f (verification 7): a close latched ON a trackless bed (the app never does this —
  // restoreRack re-equips the live table — but the state must not linger): once the bed
  // resolves inert the latched close is dropped, borrowed() false, and a later return to the
  // live table starts a fresh session (nothing stale handed back)
  const T = mkTableShim('wpa_generic_9ft');
  const H = await boot({ tableModule: T.shim });
  H.shoot(new Map([[1, legacyEntry(0.6, 4)], [2, legacyEntry(1.1, 4)]]), 2.0, 'S1'); H.runTicksToSettle();
  for (let k = 0; k < 900 && [1, 2].some((id) => H.ctl.poseAt(id, H.ctl.clock().t)?.kind !== 'rest'); k++) H.tick();
  const solBefore = H.ctl.solution();
  H.snapLive();
  H.dvrOpen(new Map([[5, legacyEntry(0.8, 4)]]), 2.0, [0, 2, 3, 4, 5, 6, 7, 8, 9], 'archived');
  T.switchTo('chinese8_pro_9ft'); await H.settleActivation();
  const inert = { enabled: H.ctl.enabled, borrowed: H.ctl.borrowed() };
  // the close is emitted ON the trackless bed (no switch back), then the bed resolves inert again
  H.rebuild(); H.restorePoses(); H.game.record = null; H.machine.to('AIM', { dvr: true });
  const atEmission = { borrowed: H.ctl.borrowed(), enabled: H.ctl.enabled };
  for (let k = 0; k < 5; k++) H.tick();
  await H.settleActivation();
  const after = { borrowed: H.ctl.borrowed(), enabled: H.ctl.enabled, reason: H.ctl.reason };
  T.switchTo('wpa_generic_9ft'); await H.settleActivation(); for (let k = 0; k < 3; k++) H.tick();
  check('L19f a close latched on a TRACKLESS bed is dropped once that bed resolves inert (borrowed() false on the inert controller); a later return to the live table is a fresh session, nothing stale handed back', inert.enabled === false && inert.borrowed === true && after.enabled === false && after.borrowed === false && !H.ctl.borrowed() && H.ctl.enabled === true && H.ctl.solution() !== solBefore, JSON.stringify({ inert, atEmission, after, backOnWpa: { enabled: H.ctl.enabled, borrowed: H.ctl.borrowed(), fresh: H.ctl.solution() !== solBefore } }));
}
{
  // L14c (review r6 P2): the loader passes NO cache override — under a service worker the
  // precached track is then served cache-first from the shell's own generation (a
  // `cache: 'no-cache'` init would take the worker's heal path into a mixed generation)
  const inits = [];
  const spy = async (url, init) => { inits.push({ url: String(url), init: init ?? null }); return fileFetch(url, init); };
  const H = await boot({ fetchImpl: spy });
  check('L14c the track request carries no cache override (plain request → the service worker\'s cache-first path, one generation with the shell) and `signal` is its ONLY init key — the abandon path of review r9 P2-3 added nothing else to the request', H.ctl.enabled === true && inits.length >= 1 && inits.every((x) => x.init !== null && Object.keys(x.init).length === 1 && x.init.signal !== undefined), JSON.stringify(inits.map((x) => [x.url.split('/').pop(), x.init ? Object.keys(x.init) : null])));
}
{
  // L21 (re-review, P1): the controller re-solves mid-hold — a two-feeder shot with a ball held
  // at the merge window when the NEXT shot is fired (continuations): the held ball comes back
  // held; across the new record no two return balls are ever closer than one diameter
  const H = await boot();
  H.shoot(new Map([[1, legacyEntry(0.5, 4)], [2, legacyEntry(0.53, 1)], [3, legacyEntry(0.56, 4)], [4, legacyEntry(0.59, 1)], [5, legacyEntry(0.62, 4)], [6, legacyEntry(0.65, 1)]]), 6.0, 'W'); H.runTicksToSettle();
  // the live solution at settle is a RE-SOLVE (the sink index grows tick by tick; the held ball
  // came back held as a continuation — 'release' without 'yield' in its event list): take the
  // hold's instants from a pure solve of the same arrivals
  const kin = await import('../scene/ballreturn/kinematics.js');
  const pureEntries = [[1, 0.5, 4], [2, 0.53, 1], [3, 0.56, 4], [4, 0.59, 1], [5, 0.62, 4], [6, 0.65, 1]].map(([id, t, pk]) => ({ id, handoff: kin.handoffFromSink(legacyEntry(t, pk), { track: H.ctl.track, pockets: POCKETS, r: R }) }));
  const pure = kin.solveShot({ track: H.ctl.track, r: R, ledger: [], arrivals: pureEntries });
  const sol = H.ctl.solution(); const y = pure.events.find((e) => e.kind === 'yield'); const rel = y ? pure.events.find((e) => e.kind === 'release' && e.ball === y.ball && e.t > y.t) : null;
  let fired = false; let minPair = Infinity; let at = null;
  if (y && rel) {
    // replay the shot and fire the next one while the hold is on (continuation into the new base)
    H.replay(); const tCut = 0.5 * (y.t + rel.t);
    for (let k = 0; k < 100000 && H.game.clock < tCut; k++) H.tick();
    H.shoot(new Map(), 3.0, 'X'); fired = true;
    const ids = [1, 2, 3, 4, 5, 6];
    for (let k = 0; k < 100000 && H.machine.state === 'PLAYBACK'; k++) {
      H.tick();
      const ps = ids.map((id) => [id, H.posOf(id)]).filter(([, q]) => q.vis && q.pock && q.marker);
      for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) { const d = Math.hypot(ps[i][1].x - ps[j][1].x, ps[i][1].y - ps[j][1].y, ps[i][1].z - ps[j][1].z); if (d < minPair) { minPair = d; at = [ps[i][0], ps[j][0], +H.game.clock.toFixed(3)]; } }
    }
  }
  check(`L21 a hold at the merge window survives the NEXT SHOT (a continuation re-solve inside the hold of ball ${y?.ball}): across the new record no two return balls come closer than one diameter (min ${Number.isFinite(minPair) ? (minPair * 1000).toFixed(4) : 'n/a'} mm)`, !!y && !!rel && fired && minPair >= 2 * R - 1e-6, JSON.stringify({ y: y && [y.ball, +y.t.toFixed(3)], rel: rel && +rel.t.toFixed(3), at, kinds: sol ? [...new Set(sol.events.map((e) => e.kind))] : null, n: sol?.events.length, rest: sol ? [...sol.rest].map(([i, D]) => i + ':' + (D * 1000).toFixed(1)) : null, reason: H.ctl.reason }));
}
{
  // L22 (review r7 P2): a table PREVIEW and its revert (a same-rack, same-track re-activation, not
  // Playback) keep the live return timeline: a settled shot whose balls still roll on the return
  // clock → preview a net table → revert → poses, ledger and the return clock continue exactly as
  // a never-previewed control's
  const run = async (preview) => {
    const T = mkTableShim('wpa_generic_9ft');
    const H = await boot({ tableModule: T.shim });
    H.shoot(new Map([[1, legacyEntry(0.6, 4)], [2, legacyEntry(1.1, 4)]]), 1.4, 'P'); H.runTicksToSettle(); // settles at 1.8 s while the balls still roll on the continuation clock
    for (let k = 0; k < 20; k++) H.tick();
    const before = { clock: H.ctl.clock().t, sol: H.ctl.solution() };
    if (preview) { T.switchTo('chinese8_pro_9ft'); await H.settleActivation(); for (let k = 0; k < 15; k++) H.tick(); T.switchTo('wpa_generic_9ft'); await H.settleActivation(); }
    const trace = [];
    for (let k = 0; k < 60; k++) { H.tick(); trace.push([+H.ctl.clock().t.toFixed(6), ...[1, 2].map((id) => { const q = H.posOf(id); return [+q.x.toFixed(6), +q.y.toFixed(6), +q.z.toFixed(6), q.vis, q.marker]; })]); }
    return { before, trace, same: H.ctl.solution() === before.sol, ledger: H.ctl.ledger(), rest: [...H.ctl.solution().rest] };
  };
  const ctrl = await run(false); const test = await run(true);
  // the preview costs the frames it took (activation ticks): compare the trace from the same continuation clock
  const t0 = test.trace[0][0]; const idx = ctrl.trace.findIndex((row) => Math.abs(row[0] - t0) < 1e-6);
  const aligned = idx >= 0 && test.trace.every((row, i) => ctrl.trace[idx + i] && JSON.stringify(row) === JSON.stringify(ctrl.trace[idx + i]));
  check('L22 a table preview (net table) and its revert keep the live return timeline: the same solution object, poses / visibility / markers and the return clock continue exactly as the never-previewed control (60 frames aligned on the continuation clock), ledger and rest map identical', test.same && aligned && JSON.stringify(test.rest) === JSON.stringify(ctrl.rest) && JSON.stringify(test.ledger) === JSON.stringify(ctrl.ledger), JSON.stringify({ same: test.same, idx, t0, first: test.trace[0], ctrlAt: idx >= 0 ? ctrl.trace[idx] : null, clockBefore: [ctrl.before.clock, test.before.clock] }));
  // L22e (#707 prep FIX1 A1): the re-activation of the SAME geometry is a V19 CACHE HIT — 0 solves this activation, the verdict
  // identical to the first's; the first activation solved the family off the UI thread (node has no Worker: the chunked path)
  {
    const T = mkTableShim('wpa_generic_9ft'); const H = await boot({ tableModule: T.shim }); // every boot imports its own module instance: its verdict cache starts empty (the first activation is a miss by construction)
    const first = { ...H.ctl.design }; const solves1 = H.ctl.stats.designSolvesNow; const mode1 = H.ctl.stats.designMode;
    T.switchTo('chinese8_pro_9ft'); await H.settleActivation(); T.switchTo('wpa_generic_9ft'); await H.settleActivation();
    const second = H.ctl.design; const stripD = (d) => { const { cached, ms, sliceMaxMs, solvesNow, mode, slices, ...rest } = d; return JSON.stringify(rest); };
    check(`L22e V19 off the UI thread (FIX1 A1): the first activation solved the family (${solves1} solves, mode ${mode1}, longest slice ${(first.sliceMaxMs ?? 0).toFixed(1)} ms), the re-activation after a preview and revert is a CACHE HIT (cached ${second.cached}, ${H.ctl.stats.designSolvesNow} solves this activation) with the identical verdict`, first.cached === false && solves1 > 0 && second.cached === true && H.ctl.stats.designSolvesNow === 0 && stripD(first) === stripD(second) && ['chunked', 'sync', 'worker'].includes(mode1), JSON.stringify({ first: [first.cached, mode1, solves1], second: [second.cached, H.ctl.stats.designSolvesNow] }));
    // L22f (maintainer ruling 2026-09-18 on FIX1 A1): a cache HIT is served only when the stored key MATERIAL equals this
    // activation's byte for byte — a hash collision costs one recompute, never a wrong verdict. Corrupt the stored entry's
    // material (the same hash key, different bytes) → the next re-activation is a MISS (solved again, identical verdict) and
    // re-stores the true material; the one after it is a HIT again.
    const entries = H.ctl.designCache(); const [k0] = [...entries.keys()]; const e0 = entries.get(k0);   // the LIVE instance's cache, through the facade
    const trueMaterial = e0.material; entries.set(k0, { material: trueMaterial + '|poisoned', dg: e0.dg });
    T.switchTo('chinese8_pro_9ft'); await H.settleActivation(); T.switchTo('wpa_generic_9ft'); await H.settleActivation();
    const third = H.ctl.design; const solves3 = H.ctl.stats.designSolvesNow; const restored = entries.get(k0)?.material === trueMaterial;
    T.switchTo('chinese8_pro_9ft'); await H.settleActivation(); T.switchTo('wpa_generic_9ft'); await H.settleActivation();
    const fourth = H.ctl.design;
    check(`L22f the cache hit is verified byte for byte: a stored entry with the same hash key but corrupted material → the re-activation RECOMPUTES (cached ${third.cached}, ${solves3} solves, identical verdict) and re-stores the true material (${restored}); the next re-activation is a hit again (cached ${fourth.cached}, ${H.ctl.stats.designSolvesNow} solves)`, third.cached === false && solves3 > 0 && stripD(third) === stripD(first) && restored && fourth.cached === true && H.ctl.stats.designSolvesNow === 0, JSON.stringify({ k0: k0.slice(0, 60), third: [third.cached, solves3], restored, fourth: [fourth.cached, H.ctl.stats.designSolvesNow] }));
    // L22g (#707 prep FIX2, review 707m2): the race A → B → A before A's sweep resolves. The cache is emptied so A's re-activation
    // must sweep; the sweep is caught mid-flight (still 'pending' after a breath); B (a netted bed) tears A down; A is re-selected
    // in the SAME task, before A's old sweep has reached its next breath. FIX1 let the live activation JOIN the old sweep and
    // inherit its null — the track stayed 'pending' for good (review's reproduction); now the live activation runs its own sweep,
    // enables, and the abandoned sweep is discarded at its next breath.
    {
      entries.clear();
      T.switchTo('chinese8_pro_9ft'); await H.settleActivation();
      const disc0 = H.ctl.stats.designDiscarded;
      T.switchTo('wpa_generic_9ft'); H.tick();                                  // A starts (its loader and sweep are asynchronous)
      await new Promise((r) => setTimeout(r, 12));                              // a breath or two into A's chunked sweep
      const staged = H.ctl.reason === 'pending' && H.ctl.designPending().size === 1;
      T.switchTo('chinese8_pro_9ft'); H.tick();                                 // B tears A down: A's sweep will abort at its next breath
      T.switchTo('wpa_generic_9ft'); H.tick();                                  // A again, in the same task: A's old sweep is still in flight
      const slotsAtRace = H.ctl.designPending().size; const cacheAtRace = entries.size;
      await H.settleActivation();
      const live = H.ctl.design; const disc = H.ctl.stats.designDiscarded - disc0;
      check(`L22g the A → B → A race before A's sweep resolves (FIX2): staged mid-sweep ${staged}; the re-selected A ENABLES (enabled ${H.ctl.enabled}, reason ${JSON.stringify(String(H.ctl.reason).slice(0, 40))}) with its OWN sweep (${H.ctl.stats.designSolvesNow} solves this activation, mode ${live?.mode}); exactly one abandoned sweep was discarded (${disc}), never a live activation's verdict`, staged && H.ctl.enabled === true && H.ctl.reason !== 'pending' && H.ctl.stats.designSolvesNow > 0 && live?.cached === false && disc === 1, JSON.stringify({ staged, enabled: H.ctl.enabled, reason: String(H.ctl.reason).slice(0, 80), solvesNow: H.ctl.stats.designSolvesNow, disc, slotsAtRace, cacheAtRace }));
      // L22h (FIX2): the pending slot is owned per GENERATION — during the race one slot exists, after the settle none, the live
      // activation swept for itself (solves counted above) while the older generation's sweep was discarded, never shared. A
      // same-generation overlap of the sweep cannot occur in this controller: every re-entry path tears down into a NEW generation
      // (teardownFor: the frame hook, the ob:settings re-check, the ownership retry) and the furniture re-check refuses to run over a
      // pending activation — so there is no 'shared' mode to assert; ownership is what the row pins.
      check(`L22h the pending slot is owned per generation (FIX2): ${slotsAtRace} slot during the race, ${H.ctl.designPending().size} after the settle; the live activation swept for itself (mode ${live?.mode}, ${H.ctl.stats.designSolvesNow} solves) and the older generation's sweep was discarded (${disc}), never shared — a same-generation overlap cannot occur: every re-entry path tears down into a NEW generation (teardownFor: the frame hook, the ob:settings re-check, the ownership retry) and recheckFurniture refuses to run over a pending activation (its guard, index.js:243 at this commit)`, slotsAtRace === 1 && H.ctl.designPending().size === 0 && live?.mode !== 'shared' && H.ctl.stats.designSolvesNow > 0 && disc === 1, JSON.stringify({ slotsAtRace, after: H.ctl.designPending().size, mode: live?.mode }));
      // L22i (FIX2): a cancelled sweep never lands in the cache — empty at the race, exactly the live verdict after the settle
      const stored = [...entries.values()];
      check(`L22i a cancelled sweep never lands in the cache (FIX2): ${cacheAtRace} entries at the race, ${stored.length} after the settle — the stored verdict is the live one (${stored[0]?.dg?.solves} solves, evaluated ${stored[0]?.dg?.evaluated}), no stored value null`, cacheAtRace === 0 && stored.length === 1 && !!stored[0].dg && stored[0].dg.evaluated === true && stored[0].dg.solves === 36 && stripD(stored[0].dg) === stripD({ ...live }), JSON.stringify({ cacheAtRace, stored: stored.map((e) => e?.dg?.solves ?? null) }));
    }
  }
}
{
  // L22b–d (review 9): previews that land on a TRACK-BEARING table, a shot fired on the
  // previewed bed, and the player opened on a previewed bed
  const traceOf = (H, n) => { const out = []; for (let k = 0; k < n; k++) { H.tick(); out.push([+H.ctl.clock().t.toFixed(6), ...[1, 2].map((id) => { const q = H.posOf(id); return [+q.x.toFixed(6), +q.y.toFixed(6), +q.z.toFixed(6), q.vis, q.marker]; })]); } return out; };
  const setup = async () => {
    const T = mkTableShim('wpa_generic_9ft', { diamond_proam_9ft: 'TEST-alias-diamond-wire-slide' });
    const H = await boot({ tableModule: T.shim });
    H.shoot(new Map([[1, legacyEntry(0.6, 4)], [2, legacyEntry(1.1, 4)]]), 1.4, 'P'); H.runTicksToSettle();
    for (let k = 0; k < 20; k++) H.tick();
    return { T, H, sol: H.ctl.solution() };
  };
  const ctrl = await setup(); const ctrlTrace = traceOf(ctrl.H, 90);
  const align = (trace) => { const t0 = trace[0][0]; const idx = ctrlTrace.findIndex((row) => Math.abs(row[0] - t0) < 1e-6); return idx >= 0 && trace.every((row, i) => ctrlTrace[idx + i] && JSON.stringify(row) === JSON.stringify(ctrlTrace[idx + i])); };
  // b: preview onto diamond (its own spec track activates a fresh session there) and back
  {
    const { T, H, sol } = await setup();
    T.switchTo('diamond_proam_9ft'); await H.settleActivation(); const onDiamond = { enabled: H.ctl.enabled, trackId: H.ctl.trackId }; for (let k = 0; k < 15; k++) H.tick();
    T.switchTo('wpa_generic_9ft'); await H.settleActivation();
    const tr = traceOf(H, 60);
    check('L22b a preview onto a TRACK-BEARING table (diamond, alias spec track: a fresh session there) and its revert keep the wpa live timeline: same solution object, 60 frames aligned on the continuation clock with the never-previewed control', onDiamond.enabled === true && onDiamond.trackId === 'TEST-alias-diamond-wire-slide' && H.ctl.solution() === sol && align(tr), JSON.stringify({ onDiamond, same: H.ctl.solution() === sol, first: tr[0] }));
  }
  // c: a shot fired on the previewed (inert) bed, then the revert — the live session resumes on the
  // NEW record's time base from the station it stood at (no rewind, no run-on, no jump)
  {
    const { T, H } = await setup();
    const before = [1, 2].map((id) => H.posOf(id));
    T.switchTo('chinese8_pro_9ft'); await H.settleActivation();
    const onNet = [1, 2].map((id) => H.posOf(id)); // an inert bed releases the poses (parked, invisible)
    H.shoot(new Map([[3, legacyEntry(0.7, 4)]]), 1.2, 'Q'); H.runTicksToSettle(); // a shot on the previewed bed: a NEW record, its clock already under way
    T.switchTo('wpa_generic_9ft'); await H.settleActivation();
    H.tick();
    const resume = [1, 2].map((id) => H.posOf(id));
    const gap = resume.map((q, i) => Math.hypot(q.x - before[i].x, q.y - before[i].y, q.z - before[i].z));
    let worstStep = 0; let prev = resume;
    for (let k = 0; k < 60; k++) { H.tick(); const now = [1, 2].map((id) => H.posOf(id)); for (let i = 0; i < 2; i++) worstStep = Math.max(worstStep, Math.hypot(now[i].x - prev[i].x, now[i].y - prev[i].y, now[i].z - prev[i].z)); prev = now; }
    const ok = onNet.every((q) => !q.vis && !q.marker) && resume.every((q) => q.vis && q.marker) && gap.every((d) => d < 0.02) && worstStep < 0.02;
    check(`L22c a shot fired on the previewed inert bed (a NEW record whose clock is already at ${H.game.clock.toFixed(3)} s), then the revert: the restored session resumes on that base from the stations it stood at (first posed frame within ${(Math.max(...gap) * 1000).toFixed(1)} mm of the pre-preview pose, worst later frame step ${(worstStep * 1000).toFixed(1)} mm), poses released while inert`, ok, JSON.stringify({ before, onNet, resume, gapMm: gap.map((d) => +(d * 1000).toFixed(2)), worstStepMm: +(worstStep * 1000).toFixed(2) }));
  }
  // d: the player opened on the previewed inert bed, a rebuilding close, the revert — the live session comes back
  {
    const { T, H, sol } = await setup();
    H.snapLive();
    T.switchTo('chinese8_pro_9ft'); await H.settleActivation();
    H.dvrOpen(new Map([[5, legacyEntry(0.8, 4)]]), 2.0, [0, 2, 3, 4, 5, 6, 7, 8, 9], 'archived-on-preview');
    const inner = { borrowed: H.ctl.borrowed(), enabled: H.ctl.enabled };
    for (let k = 0; k < 30; k++) H.tick();
    H.rebuild(); T.switchTo('wpa_generic_9ft'); H.restage(); H.seek(H.st.snap.clock); H.restorePoses(); H.machine.to('AIM', { dvr: true });
    await H.settleActivation(); for (let k = 0; k < 3; k++) H.tick();
    check('L22d the player opened on a previewed inert bed (the memo became the borrow), a rebuilding v1 close and the revert: the live wpa session is handed back (same solution object, not borrowed)', inner.borrowed === true && inner.enabled === false && H.ctl.solution() === sol && !H.ctl.borrowed(), JSON.stringify({ inner, same: H.ctl.solution() === sol, borrowed: H.ctl.borrowed(), reason: H.ctl.reason }));
  }
}
{
  // L20 (P2): the documented fallback order — a URL track of ANOTHER table on a table with its own
  // spec track → installed on the spec track (armedBy spec); on a table with none → inert + law line
  const T1 = mkTableShim('wpa_generic_9ft', { wpa_generic_9ft: 'TEST-synthetic-wire-slide' });
  const H1 = await boot({ tableModule: T1.shim, track: 'TEST-alias-diamond-wire-slide', expectEnabled: false });
  check('L20a URL arming names a track defined for diamond while the active table (wpa) carries its own spec track → the spec track is installed (armedBy spec)', H1.ctl.enabled === true && H1.ctl.trackId === 'TEST-synthetic-wire-slide' && H1.ctl.armedBy === 'spec', JSON.stringify({ enabled: H1.ctl.enabled, trackId: H1.ctl.trackId, armedBy: H1.ctl.armedBy, reason: H1.ctl.reason }));
  const T2 = mkTableShim('chinese8_pro_9ft');
  const H2 = await boot({ tableModule: T2.shim, track: 'TEST-alias-diamond-wire-slide', expectEnabled: false });
  check('L20b the same URL arming on a table with no spec track → inert with the ownership law line', H2.ctl.enabled === false && /defined for diamond_proam_9ft, active table is chinese8_pro_9ft/.test(H2.ctl.reason), H2.ctl.reason);
}

{
  // ---- L23 (review r8 P1): the CROSS-EQUIPMENT Playback open ---------------------------
  // playback.js openPlayer runs swapBed() — setEquipment + rerackKind(kind, seed, {quiet:true}),
  // i.e. a NEW ball set with NO state emission — BEFORE game.loadRecord emits the {dvr:true}
  // PLAYBACK (playback.js:1957 / :1650). The live return session is therefore stashed against a
  // ball set the game has already replaced: no memo could be recognised, no borrow was created,
  // and the close had nothing to hand back. a/b: the app's own order (swap and emission in ONE
  // task) onto a table with no track of its own and onto a table with its own spec track.
  // c: frames in between, while the switch's activation is still resolving — the window the
  // in-flight exemption covers. d: the exemption's BOUND — once that activation has settled, a
  // rack change retires the memo and no open may adopt it. e: a rerack that keeps the kind AND
  // the seed is still a new rack, and its memo is not resumed at a revert.
  const rowOf = (H) => [+H.ctl.clock().t.toFixed(6), ...[1, 2].map((id) => { const q = H.posOf(id); return [+q.x.toFixed(6), +q.y.toFixed(6), +q.z.toFixed(6), q.vis, q.marker]; })];
  const traceOf = (H, n) => { const out = []; for (let k = 0; k < n; k++) { H.tick(); out.push(rowOf(H)); } return out; };
  const ARCHIVE = new Map([[5, legacyEntry(0.8, 4)]]);
  const ARCHIVE_IDS = [0, 2, 3, 4, 5, 6, 7, 8, 9];
  const run = async (mode) => { // 'control' | 'net' | 'return' | 'net-frame' | 'preview-net' | 'preview-track'
    const T = mkTableShim('wpa_generic_9ft', { diamond_proam_9ft: 'TEST-alias-diamond-wire-slide' });
    const H = await boot({ tableModule: T.shim });
    H.shoot(new Map([[1, legacyEntry(0.6, 4)], [2, legacyEntry(1.1, 4)]]), 1.4, 'S1'); H.runTicksToSettle();
    for (let k = 0; k < 20; k++) H.tick(); // settled at 1.8 s with both balls still rolling on the return clock
    const sol = H.ctl.solution();
    const before = { clock: H.ctl.clock().t, row: rowOf(H), rest: JSON.stringify([...sol.rest]), ledger: JSON.stringify(H.ctl.ledger()) };
    let inner = null;
    if (mode !== 'control') {
      const bed = mode === 'return' ? 'diamond_proam_9ft' : 'chinese8_pro_9ft';
      // f/g: the open is made from a table PREVIEW whose switch RESOLVED long ago — the live
      // memo is not in flight any more, so only the last-seen live ball set can find it. g's
      // previewed bed carries its own track, so its session is memoed BESIDE the live one under
      // the same (still live) ball set: the OLDEST of the two is the live session
      if (mode.startsWith('preview-')) {
        T.switchTo(mode === 'preview-track' ? 'diamond_proam_9ft' : 'predator_apex_9ft');
        if (mode === 'preview-inflight') H.tick();               // observed, NOT settled: this switch stashed the live
        else { await H.settleActivation(); for (let k = 0; k < 5; k++) H.tick(); } // memo and is still resolving
      }
      H.snapLive();                       // openPlayer: the live bed captured verbatim (record, rack, poses)
      T.switchTo(bed); H.swapBedRack(); // swapBed(): re-equip + the QUIET rerack of the archive's own rack
      if (mode === 'net-frame') for (let k = 0; k < 3; k++) H.tick(); // the swap and the emission in separate tasks: frames land between them
      H.dvrOpen(ARCHIVE, 2.0, ARCHIVE_IDS, 'archived-cross', { snap: false }); // loadRecord(stage:'playback')
      await H.settleActivation();
      inner = { borrowed: H.ctl.borrowed(), enabled: H.ctl.enabled, trackId: H.ctl.trackId, borrows: H.ctl.stats.borrows };
      for (let k = 0; k < 30; k++) H.tick();
      // close (restoreLive with rackChanged): restoreRack rebuilds the LIVE rack on the LIVE bed,
      // the live record is re-staged and sought, and the pre-open state is re-emitted dvr-marked
      H.rebuild(); T.switchTo('wpa_generic_9ft'); H.restage(); H.seek(H.st.snap.clock); H.restorePoses(); H.machine.to(H.st.snap.state ?? 'AIM', { dvr: true });
      await H.settleActivation();
    }
    const trace = traceOf(H, 60);
    const after = { same: H.ctl.solution() === sol, borrowed: H.ctl.borrowed(), rest: JSON.stringify([...(H.ctl.solution()?.rest ?? [])]), ledger: JSON.stringify(H.ctl.ledger()) };
    return { H, sol, before, inner, trace, after };
  };
  const ctrl = await run('control');
  // the close HOLDS the return clock for the frames it takes (the restored session's own clock is
  // handed back before game.clock moves again): those frames must reproduce the pre-open row
  // exactly — the control stands at the same clock — and from the control's first frame on the two
  // timelines are the same frame for frame
  const heldRows = (trace) => trace.filter((row) => row[0] < ctrl.trace[0][0] - 1e-9);
  const align = (trace) => {
    const start = trace.findIndex((row) => Math.abs(row[0] - ctrl.trace[0][0]) < 1e-6);
    if (start < 0) return false;
    return heldRows(trace).every((row) => JSON.stringify(row) === JSON.stringify(ctrl.before.row))
      && trace.slice(start).every((row, i) => ctrl.trace[i] && JSON.stringify(row) === JSON.stringify(ctrl.trace[i]));
  };
  for (const [mode, label] of [['net', 'a bed with NO track of its own (net table), swap and emission in ONE task (the app order)'],
    ['return', 'a bed with ITS OWN spec track (diamond alias), swap and emission in ONE task'],
    ['net-frame', 'a net bed with THREE frames between the swap and the emission, the switch still resolving (the in-flight exemption keeps the memo the rack change would otherwise retire)'],
    ['preview-net', 'a net bed, opened from a SETTLED preview of an inert bed (the live memo is no longer in flight — only the last-seen live ball set finds it)'],
    ['preview-track', 'a net bed, opened from a SETTLED preview of a TRACK-BEARING bed, whose own session is memoed beside the live one under the same ball set (the oldest is the live one)'],
    ['preview-inflight', 'a net bed, opened while an EARLIER preview switch is still resolving — that teardown found no track, so it stashed nothing and disarmed the exemption; only the last-seen live ball set finds the memo the FIRST switch left']]) {
    const t = await run(mode);
    const borrowed = !!t.inner && t.inner.borrowed === true && t.inner.borrows === 1;
    const handedBack = t.after.same === true && t.after.borrowed === false;
    const identical = t.after.rest === t.before.rest && t.after.ledger === t.before.ledger && align(t.trace);
    check(`L23${({ net: 'a', return: 'b', 'net-frame': 'c', 'preview-net': 'f', 'preview-track': 'g', 'preview-inflight': 'h' })[mode]} the cross-equipment open on ${label}: the live session is captured as the borrow across the quiet rerack, and the close hands it back — same solution object, rest map and ledger unchanged, the ${heldRows(t.trace).length} held frame(s) reproduce the pre-open pose and the rest of the 60 are frame-for-frame the never-borrowed control's`,
      borrowed && handedBack && identical && t.before.row.join() === ctrl.before.row.join(),
      JSON.stringify({ inner: t.inner, after: { same: t.after.same, borrowed: t.after.borrowed }, restEq: t.after.rest === t.before.rest, ledgerEq: t.after.ledger === t.before.ledger, aligned: align(t.trace), held: heldRows(t.trace).length, first: t.trace[0], ctrlBefore: ctrl.before.row, ctrlFirst: ctrl.trace[0], reason: t.H.ctl.reason }));
  }
  // d: the exemption is BOUND to the switch that stashed the memo. Preview onto a net bed and let
  // that activation SETTLE; then re-rack (announced, as game.js does outside the quiet paths).
  // The memo is a memo of a rack that no longer exists and must be retired — a player opened on
  // that bed afterwards must borrow nothing, so no dead session can be restored at its close.
  {
    const T = mkTableShim('wpa_generic_9ft', { diamond_proam_9ft: 'TEST-alias-diamond-wire-slide' });
    const H = await boot({ tableModule: T.shim });
    H.shoot(new Map([[1, legacyEntry(0.6, 4)], [2, legacyEntry(1.1, 4)]]), 1.4, 'S1'); H.runTicksToSettle();
    for (let k = 0; k < 20; k++) H.tick();
    const sol = H.ctl.solution();
    T.switchTo('chinese8_pro_9ft'); await H.settleActivation(); // the switch RESOLVES: the exemption ends here
    for (let k = 0; k < 3; k++) H.tick();
    H.rerack();                                                  // a new rack on the previewed bed
    for (let k = 0; k < 3; k++) H.tick();
    H.dvrOpen(ARCHIVE, 2.0, ARCHIVE_IDS, 'archived-after-rerack');
    await H.settleActivation();
    const inner = { borrowed: H.ctl.borrowed(), borrows: H.ctl.stats.borrows };
    for (let k = 0; k < 20; k++) H.tick();
    H.rebuild(); T.switchTo('wpa_generic_9ft'); H.restage(); H.seek(H.st.snap.clock); H.restorePoses(); H.machine.to(H.st.snap.state ?? 'AIM', { dvr: true });
    await H.settleActivation(); for (let k = 0; k < 3; k++) H.tick();
    check('L23d the in-flight exemption ends with its switch: a rerack on a bed whose activation has already settled retires the memo, the player opened there borrows nothing, and the close cannot restore the dead session',
      inner.borrowed === false && inner.borrows === 0 && H.ctl.solution() !== sol && H.ctl.borrowed() === false,
      JSON.stringify({ inner, deadRestored: H.ctl.solution() === sol, borrowedAfter: H.ctl.borrowed(), reason: H.ctl.reason }));
  }
  // j: the same bound, isolated from (i). L23d's rerack is ANNOUNCED, so the `{seed}` retirement
  // added in refutation round 2 also covers it; only a QUIET rerack after a settled switch reads
  // the settle release on its own. The app fires no bare quiet rerack (its quiet paths are
  // swapBed's own cross-equipment open and restoreRack at a close) — like L19f this arm exists to
  // hold the state machine's bound, not to replay an app sequence.
  {
    const T = mkTableShim('wpa_generic_9ft', { diamond_proam_9ft: 'TEST-alias-diamond-wire-slide' });
    const H = await boot({ tableModule: T.shim });
    H.shoot(new Map([[1, legacyEntry(0.6, 4)], [2, legacyEntry(1.1, 4)]]), 1.4, 'S1'); H.runTicksToSettle();
    for (let k = 0; k < 20; k++) H.tick();
    const sol = H.ctl.solution();
    T.switchTo('chinese8_pro_9ft'); await H.settleActivation(); // the switch RESOLVES: the exemption ends here
    for (let k = 0; k < 3; k++) H.tick();
    H.rerack({ quiet: true });                                   // a new rack, announced by NOTHING
    for (let k = 0; k < 3; k++) H.tick();
    H.dvrOpen(ARCHIVE, 2.0, ARCHIVE_IDS, 'archived-after-quiet-rerack');
    await H.settleActivation();
    const inner = { borrowed: H.ctl.borrowed(), borrows: H.ctl.stats.borrows };
    for (let k = 0; k < 20; k++) H.tick();
    H.rebuild(); T.switchTo('wpa_generic_9ft'); H.restage(); H.seek(H.st.snap.clock); H.restorePoses(); H.machine.to(H.st.snap.state ?? 'AIM', { dvr: true });
    await H.settleActivation(); for (let k = 0; k < 3; k++) H.tick();
    check('L23j the exemption ends when its activation SETTLES, with nothing announced: after a settled switch and a QUIET rerack the player opened there borrows nothing and the close cannot restore the dead session (L23d\'s rerack is announced, so it reads the {seed} retirement too — this arm isolates the settle release)',
      inner.borrowed === false && inner.borrows === 0 && H.ctl.solution() !== sol && H.ctl.borrowed() === false,
      JSON.stringify({ inner, deadRestored: H.ctl.solution() === sol, borrowedAfter: H.ctl.borrowed(), reason: H.ctl.reason }));
  }
  // i: the equipment station's own order — settings.js broadcasts `ob:settings` (the bed switch)
  // and only THEN re-racks announced (settings.js:1286-1288), so this module first sees the switch
  // inside applyRack's `setState('AIM', { seed })` and the memo that teardown stashes is already a
  // memo of a DISPOSED rack. A player opened while the new bed's track load is still in flight must
  // not adopt it: the borrow path has no ball-set test of its own, so the announced rack is what
  // retires the exemption (refutation round 2).
  {
    const T = mkTableShim('wpa_generic_9ft', { diamond_proam_9ft: 'TEST-alias-diamond-wire-slide' });
    const H = await boot({ tableModule: T.shim });
    H.shoot(new Map([[1, legacyEntry(0.6, 4)], [2, legacyEntry(1.1, 4)]]), 1.4, 'S1'); H.runTicksToSettle();
    for (let k = 0; k < 20; k++) H.tick();
    const sol = H.ctl.solution();
    T.switchTo('chinese8_pro_9ft'); H.rerack();      // ONE task: the bed switch, then the announced rerack
    H.dvrOpen(ARCHIVE, 2.0, ARCHIVE_IDS, 'archived-during-fetch'); // the load is still in flight
    const inner = { borrowed: H.ctl.borrowed(), borrows: H.ctl.stats.borrows };
    await H.settleActivation();
    for (let k = 0; k < 20; k++) H.tick();
    H.rebuild(); T.switchTo('wpa_generic_9ft'); H.restage(); H.seek(H.st.snap.clock); H.restorePoses(); H.machine.to(H.st.snap.state ?? 'AIM', { dvr: true });
    await H.settleActivation(); for (let k = 0; k < 3; k++) H.tick();
    check('L23i a player opened during the track fetch that FOLLOWS an announced equipment change borrows nothing: the memo that switch stashed is a disposed rack, and no close can restore it',
      inner.borrowed === false && inner.borrows === 0 && H.ctl.solution() !== sol && H.ctl.borrowed() === false,
      JSON.stringify({ inner, deadRestored: H.ctl.solution() === sol, borrowedAfter: H.ctl.borrowed(), reason: H.ctl.reason }));
  }
  // e: a rerack that keeps the KIND and the SEED (game.rerack(game.seed) — the equipment
  // station's own commit and revert, and most rules re-racks) is still a different rack: every
  // ball object is new. Its memo must not be resumed at the revert.
  {
    const T = mkTableShim('wpa_generic_9ft');
    const H = await boot({ tableModule: T.shim });
    H.shoot(new Map([[1, legacyEntry(0.6, 4)], [2, legacyEntry(1.1, 4)]]), 1.4, 'S1'); H.runTicksToSettle();
    for (let k = 0; k < 20; k++) H.tick();
    const sol = H.ctl.solution(); const tBefore = H.ctl.clock().t; const poseBefore = H.posOf(1);
    T.switchTo('chinese8_pro_9ft'); await H.settleActivation();
    H.rerack({ seed: 7 });                                       // same kind, same seed, a brand-new ball set
    for (let k = 0; k < 3; k++) H.tick();
    T.switchTo('wpa_generic_9ft'); await H.settleActivation(); H.tick();
    // the FIRST posed frame is the one that witnesses it: a resumed dead session stands at the
    // stashed station on that frame even where ensureSolution's rack-rebuild reset catches it a
    // tick later, so the clock alone would gate this by a single dt (refutation round 2)
    const poseAfter = H.posOf(1);
    const dPose = Math.hypot(poseAfter.x - poseBefore.x, poseAfter.y - poseBefore.y, poseAfter.z - poseBefore.z);
    check(`L23e a same-seed, same-kind rerack during a preview is a NEW rack: the revert starts a fresh session instead of resuming the dead one (return clock ${H.ctl.clock().t.toFixed(3)} s, not the stashed ${tBefore.toFixed(3)} s; the first posed frame is ${(dPose * 1000).toFixed(1)} mm off the stashed station)`,
      H.ctl.solution() !== sol && H.ctl.clock().t < tBefore && dPose > 0.001,
      JSON.stringify({ resumedDead: H.ctl.solution() === sol, t: H.ctl.clock().t, tBefore, dPose, reason: H.ctl.reason }));
  }
}
{
  // ---- L24 (review r8 P2): a REFUSED solve releases every pose this module owns ---------
  // The refusal is the solver's own runaway guard (kinematics.js MAX_EVENTS), reached through the
  // documented solveOpts seam with a bound of one event — not an injected throw. Before the fix
  // the meshes stayed where the previous solution had posed them: poseAll() returns on a null
  // solution, and game.js parks a pocketed ball once (update()) or only for the record it is
  // playing (seek()), so a ball potted in an earlier record floated over the bed for the rest of
  // the rack instead of falling back to the sink's own cull. a is the gating half (it fails on
  // the pre-fix module); b is the recovery property, which passes on both trees.
  const solveOpts = {};
  const H = await boot({ solveOpts });
  H.shoot(new Map([[1, legacyEntry(0.6, 4)], [2, legacyEntry(1.1, 4)]]), 1.4, 'S1'); H.runTicksToSettle();
  for (let k = 0; k < 20; k++) H.tick();
  const posedBefore = [1, 2].map((id) => H.posOf(id));
  const owned = posedBefore.every((q) => q.marker === true && q.vis === true && q.pock === true);
  solveOpts.maxEvents = 1;                       // the next solve of a NEW key runs away
  const errsAt = globalThis.__test.errors.length; // this arm's own baseline: the error surface is a GLOBAL array
  H.shoot(new Map([[3, legacyEntry(0.5, 4)]]), 1.2, 'S2'); H.runTicksToSettle();
  for (let k = 0; k < 5; k++) H.tick();
  const after = H.balls.map((b) => H.posOf(b.id));
  const refused = H.ctl.solution() === null && /^solve failed for the current record: ball-return solve exceeded 1 events/.test(H.ctl.reason);
  const released = after.every((q) => q.marker === false);
  const parked = after.filter((q) => q.pock).every((q) => q.vis === false && q.x === 0 && q.y === -10 && q.z === 0);
  const reports = globalThis.__test.errors.slice(errsAt).filter((e) => /solve failed \(record left to the sink\)/.test(String(e?.message ?? e))).length;
  check(`L24a a refused solve (${H.ctl.reason}) releases every pose the module owns: no marker survives, every pocketed ball is back at game.js's park (invisible at 0, −10, 0), and the refusal reached the error surface exactly once although the record was re-solved several times as its ledger moved (reportOnce does not dedupe)`,
    owned && refused && released && parked && reports === 1,
    JSON.stringify({ owned, refused, released, parked, reports, reason: H.ctl.reason, posedBefore, after: after.filter((q) => q.pock) }));
  delete solveOpts.maxEvents;                    // the refusal is not a dead end: the next key solves again
  H.shoot(new Map([[4, legacyEntry(0.5, 4)]]), 1.2, 'S3'); H.runTicksToSettle();
  for (let k = 0; k < 20; k++) H.tick();
  const back = [1, 2, 3, 4].map((id) => H.posOf(id));
  // every mesh the module owns stands where the NEW solution's poseAt puts it — the stale poses
  // are gone, not merely overwritten by chance
  const t = H.ctl.clock().t;
  const onSolution = [1, 2, 3, 4].every((id) => { const q = H.posOf(id); const e = H.ctl.poseAt(id, t); return !!e && Math.hypot(q.x - e.x, q.y - e.y, q.z - e.z) < 1e-9; });
  check('L24b the refusal is not a dead end: the next solvable key poses the balls the module owns on the track again, each mesh exactly where the NEW solution\'s poseAt puts it (this arm passes on the pre-fix module too — L24a is the gating half)', H.ctl.solution() !== null && back.every((q) => q.marker === true && q.vis === true) && onSolution, JSON.stringify({ reason: H.ctl.reason, back, onSolution }));

  // ---- L24d (refutation round 2, F3): the latch holds ONE refusal, not the whole lifetime ----
  // reportOnce does not dedupe, so a latch is what keeps a single refusal off the error surface
  // while its record is re-solved as the ledger moves (L24a). A latch that is never released
  // also swallows the NEXT, DIFFERENT refusal — a failure the user must see — and leaves
  // ctl.reason describing a record the module has since re-solved. Both are read here, on the
  // session L24b has just recovered.
  const armed = H.ctl.reason;                    // after the recovery: this activation's own line again
  const errsB = globalThis.__test.errors.length;
  solveOpts.maxEvents = 2;                       // a DIFFERENT runaway bound → a different message
  H.shoot(new Map([[5, legacyEntry(0.5, 4)]]), 1.2, 'S4'); H.runTicksToSettle();
  for (let k = 0; k < 5; k++) H.tick();
  const second = globalThis.__test.errors.slice(errsB).filter((e) => /solve failed \(record left to the sink\)/.test(String(e?.message ?? e)));
  check(`L24d the recovery released the latch: after L24b ctl.reason is the activation's own line again ("${armed}"), and a LATER, different refusal (bound 2, not 1) reaches the error surface exactly once instead of being swallowed by the first refusal's latch`,
    /armed by \?ballreturn|table spec/.test(armed) && H.ctl.solution() === null && /exceeded 2 events/.test(H.ctl.reason) && second.length === 1 && /exceeded 2 events/.test(String(second[0])),
    JSON.stringify({ armed, reason: H.ctl.reason, second }));
  delete solveOpts.maxEvents;
}

{
  // ---- L24c: the solveOpts seam is ALLOW-LISTED (review r8 P2 review) -------------------
  // Only solver options the module names may cross the seam, so a caller can never replace the
  // solve's physical inputs (track, r, ledger, arrivals, continuations) with its own.
  const shotOf = async (solveOpts) => {
    const H = await boot(solveOpts ? { solveOpts } : {});
    H.shoot(new Map([[1, legacyEntry(0.6, 4)], [2, legacyEntry(1.1, 4)]]), 1.4, 'S1'); H.runTicksToSettle();
    for (let k = 0; k < 20; k++) H.tick();
    return { rest: JSON.stringify([...H.ctl.solution().rest]), ledger: JSON.stringify(H.ctl.ledger()), enabled: H.ctl.enabled,
      poses: JSON.stringify([1, 2].map((id) => { const q = H.posOf(id); return [+q.x.toFixed(9), +q.y.toFixed(9), +q.z.toFixed(9)]; })) };
  };
  const plain = await shotOf(null);
  const hostile = await shotOf({ r: 0.03, ledger: [], arrivals: [], continuations: [], track: null });
  check('L24c a solveOpts carrying the solve\'s own inputs (r, ledger, arrivals, continuations, track) changes nothing: the allow-list drops every key but maxEvents, so the solve is byte-identical to one with no seam at all',
    hostile.enabled === true && hostile.rest === plain.rest && hostile.ledger === plain.ledger && hostile.poses === plain.poses,
    JSON.stringify({ enabled: hostile.enabled, restEq: hostile.rest === plain.rest, ledgerEq: hostile.ledger === plain.ledger, posesEq: hostile.poses === plain.poses }));
}

{
  // ---- L24e (refutation round 2, F3): a refusal raised INSIDE a borrow stays with the archive
  // The Playback borrow runs the archived record on a FRESH session; the live session is stashed
  // whole and handed back at the close. A refusal of the ARCHIVE must not follow that hand-back
  // out: it would leave ctl.reason describing a record the live timeline never played, and the
  // latch (L24a) would swallow the FIRST live refusal carrying the same message — a failure the
  // user must see, reported never.
  const solveOpts = {};
  const H = await boot({ solveOpts });
  H.shoot(new Map([[1, legacyEntry(0.6, 4)], [2, legacyEntry(1.1, 4)]]), 2.0, 'S1'); H.runTicksToSettle();
  for (let k = 0; k < 900 && [1, 2].some((id) => H.ctl.poseAt(id, H.ctl.clock().t)?.kind !== 'rest'); k++) H.tick();
  const solBefore = H.ctl.solution(); const armed = H.ctl.reason;
  H.snapLive();
  solveOpts.maxEvents = 1;                       // the ARCHIVE's solve runs away, inside the borrow
  H.dvrOpen(new Map([[5, legacyEntry(0.8, 4)]]), 2.0, [0, 2, 3, 4, 5, 6, 7, 8, 9], 'archived');
  for (let k = 0; k < 5; k++) H.tick();
  const inner = { borrowed: H.ctl.borrowed(), refused: H.ctl.solution() === null, reason: H.ctl.reason };
  delete solveOpts.maxEvents;                    // (no tick in between: the archive never re-solves)
  H.rebuild(); H.restage(); H.seek(H.st.snap.clock); H.restorePoses(); H.machine.to('AIM', { dvr: true });
  for (let k = 0; k < 3; k++) H.tick();
  const after = { same: H.ctl.solution() === solBefore, borrowed: H.ctl.borrowed(), reason: H.ctl.reason };
  const errsB = globalThis.__test.errors.length;
  solveOpts.maxEvents = 1;                       // the SAME message, now on the LIVE timeline
  H.shoot(new Map([[3, legacyEntry(0.5, 4)]]), 1.2, 'S2'); H.runTicksToSettle();
  for (let k = 0; k < 5; k++) H.tick();
  const liveReports = globalThis.__test.errors.slice(errsB).filter((e) => /solve failed \(record left to the sink\)/.test(String(e?.message ?? e)));
  check('L24e a refusal raised INSIDE the Playback borrow belongs to the archive: at the close the live session is handed back with the activation\'s own reason (not the archive\'s failure text), and a later LIVE refusal carrying the same message is still reported once — the archive\'s latch did not follow the hand-back out',
    inner.borrowed === true && inner.refused === true && /exceeded 1 events/.test(inner.reason)
    && after.same === true && after.borrowed === false && after.reason === armed
    && liveReports.length === 1,
    JSON.stringify({ inner, after, armed, liveReports }));
}

// ---- L25 (review r9 P2-3): a hung load on the bed being LEFT never blocks the new bed ------
{
  // table A's track fetch hangs (a slow / dead network under an installed service worker is
  // exactly this) and the player switches to B. The generation guards already stopped A from
  // committing stale state; what they did not stop was B's activation being CHAINED behind
  // A's unresolved promise — B stayed inert for as long as A hung. Each generation now starts
  // its own activation and the abandoned request is aborted.
  const T = mkTableShim('wpa_generic_9ft', { diamond_proam_9ft: 'TEST-alias-diamond-wire-slide' });
  let held = null;                       // the diamond load: { signal, resolve } — released by hand
  const fetchImpl = async (url, init) => {
    if (String(url).includes('/tracks/TEST-alias-diamond-wire-slide')) { // the hung load under test is the TRACK's; the companions (hardware/, assemblies/, order 21) load normally
      return new Promise((resolve) => { held = { signal: init?.signal ?? null, release: () => resolve(fileFetch(url)) }; });
    }
    return fileFetch(url);
  };
  const H = await boot({ tableModule: T.shim, fetchImpl });
  H.shoot(new Map([[1, legacyEntry(0.6, 4)], [2, legacyEntry(1.1, 4)]]), 2.0, 'S1'); H.runTicksToSettle();
  for (let k = 0; k < 900 && [1, 2].some((id) => H.ctl.poseAt(id, H.ctl.clock().t)?.kind !== 'rest'); k++) H.tick();
  const live = { trackId: H.ctl.trackId, sol: H.ctl.solution(), poses: [1, 2].map((id) => H.posOf(id)) };
  const errsAt = globalThis.__test.errors.length;   // an abandoned load is not a load FAILURE: nothing of it may reach the error surface
  // switch to the bed whose fetch hangs: inert and pending while it waits
  T.switchTo('diamond_proam_9ft');
  for (let k = 0; k < 5; k++) { H.tick(); await new Promise((r) => setTimeout(r, 2)); }
  const hung = { enabled: H.ctl.enabled, reason: H.ctl.reason, requested: !!held, aborted: held?.signal?.aborted ?? null };
  // ...and back to wpa while the diamond request is STILL unresolved
  const t0 = process.hrtime.bigint();
  T.switchTo('wpa_generic_9ft'); await H.settleActivation();
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const back = { enabled: H.ctl.enabled, trackId: H.ctl.trackId, armedBy: H.ctl.armedBy, aborted: held?.signal?.aborted ?? null };
  check(`L25a the bed being left has a HUNG track fetch: the new bed installs without waiting on it (${ms.toFixed(0)} ms, the held request still unresolved) and the abandoned request is aborted`,
    hung.enabled === false && hung.reason === 'pending' && hung.requested === true && hung.aborted === false
    && back.enabled === true && back.trackId === 'TEST-synthetic-wire-slide' && back.armedBy === 'url' && back.aborted === true,
    JSON.stringify({ hung, back, ms: +ms.toFixed(1) }));
  // the abandoned load resolves LATE: nothing of it may land
  const solAfter = H.ctl.solution();
  held.release();
  for (let k = 0; k < 10; k++) { H.tick(); await new Promise((r) => setTimeout(r, 2)); }
  const late = { enabled: H.ctl.enabled, trackId: H.ctl.trackId, armedBy: H.ctl.armedBy, same: H.ctl.solution() === solAfter, poses: [1, 2].map((id) => H.posOf(id)) };
  const reports = globalThis.__test.errors.slice(errsAt).map((e) => String(e?.message ?? e));
  check('L25b the abandoned load resolving LATE changes nothing: the active track, its arming and the session on it are the live bed\'s, no pose comes from the abandoned bed\'s track, and the abandon reached no error surface (a switch away is not a load failure)',
    late.enabled === true && late.trackId === 'TEST-synthetic-wire-slide' && late.armedBy === 'url' && late.same === true
    && late.poses.every((q) => q.marker === true) && reports.length === 0, JSON.stringify({ late, liveTrackId: live.trackId, reports }));
}
{
  // L25c the same abandon when the fetch HONOURS the signal (the page-side request: it
  // rejects with an AbortError). L25a/b hold the other half — an implementation that ignores
  // the signal and resolves late, which is what the service worker's own inner fetch does.
  // Either way the module's catch is reached with myGen !== gen: silent, nothing reported.
  const T = mkTableShim('wpa_generic_9ft', { diamond_proam_9ft: 'TEST-alias-diamond-wire-slide' });
  let held = null;
  const fetchImpl = async (url, init) => {
    if (String(url).includes('/tracks/TEST-alias-diamond-wire-slide')) { // the hung load under test is the TRACK's; the companions (hardware/, assemblies/, order 21) load normally
      return new Promise((resolve, reject) => {
        const sig = init?.signal ?? null;
        held = { signal: sig, rejected: false };
        if (sig) sig.addEventListener('abort', () => { held.rejected = true; const e = new Error('The operation was aborted.'); e.name = 'AbortError'; reject(e); });
      });
    }
    return fileFetch(url);
  };
  const H = await boot({ tableModule: T.shim, fetchImpl });
  H.shoot(new Map([[1, legacyEntry(0.6, 4)], [2, legacyEntry(1.1, 4)]]), 2.0, 'S1'); H.runTicksToSettle();
  for (let k = 0; k < 900 && [1, 2].some((id) => H.ctl.poseAt(id, H.ctl.clock().t)?.kind !== 'rest'); k++) H.tick();
  const solBefore = H.ctl.solution();
  const errsAt = globalThis.__test.errors.length;
  T.switchTo('diamond_proam_9ft');
  for (let k = 0; k < 5; k++) { H.tick(); await new Promise((r) => setTimeout(r, 2)); }
  T.switchTo('wpa_generic_9ft'); await H.settleActivation();
  for (let k = 0; k < 10; k++) { H.tick(); await new Promise((r) => setTimeout(r, 2)); }
  const reports = globalThis.__test.errors.slice(errsAt).map((e) => String(e?.message ?? e));
  check('L25c a fetch that HONOURS the signal rejects with an AbortError: the live bed is back armed on its own track, the session is untouched, and the rejection is reported nowhere — an AbortError is never dressed up as "track not loadable"',
    held?.rejected === true && H.ctl.enabled === true && H.ctl.trackId === 'TEST-synthetic-wire-slide'
    && H.ctl.solution() === solBefore && reports.length === 0,
    JSON.stringify({ rejected: held?.rejected ?? null, enabled: H.ctl.enabled, trackId: H.ctl.trackId, same: H.ctl.solution() === solBefore, reports }));
}
{
  // L25d two hung beds in a row (A → B → C → A). The abort handle is per-generation: when
  // B's abandoned activation finally settles it must not clear C's handle, or the switch off
  // C would leave C's request running. Both hung requests are aborted, the live bed comes back.
  const T = mkTableShim('wpa_generic_9ft', { diamond_proam_9ft: 'TEST-alias-diamond-wire-slide', chinese8_pro_9ft: 'TEST-alias-diamond-wire-slide' });
  const held = [];
  const fetchImpl = async (url, init) => {
    if (String(url).includes('/tracks/TEST-alias-diamond-wire-slide')) { // the hung load under test is the TRACK's; the companions (hardware/, assemblies/, order 21) load normally
      return new Promise((resolve, reject) => {
        const sig = init?.signal ?? null;
        const rec = { signal: sig, rejected: false };
        held.push(rec);
        if (sig) sig.addEventListener('abort', () => { rec.rejected = true; const e = new Error('The operation was aborted.'); e.name = 'AbortError'; reject(e); });
      });
    }
    return fileFetch(url);
  };
  const H = await boot({ tableModule: T.shim, fetchImpl });
  H.shoot(new Map([[1, legacyEntry(0.6, 4)], [2, legacyEntry(1.1, 4)]]), 2.0, 'S1'); H.runTicksToSettle();
  for (let k = 0; k < 900 && [1, 2].some((id) => H.ctl.poseAt(id, H.ctl.clock().t)?.kind !== 'rest'); k++) H.tick();
  const errsAt = globalThis.__test.errors.length;
  T.switchTo('diamond_proam_9ft');
  for (let k = 0; k < 5; k++) { H.tick(); await new Promise((r) => setTimeout(r, 2)); }
  const afterB = held.map((h) => h.rejected);
  T.switchTo('chinese8_pro_9ft');                 // B abandoned, C requested; B's activation settles here
  for (let k = 0; k < 8; k++) { H.tick(); await new Promise((r) => setTimeout(r, 2)); }
  const afterC = held.map((h) => h.rejected);
  const t0 = process.hrtime.bigint();
  T.switchTo('wpa_generic_9ft'); await H.settleActivation();
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  for (let k = 0; k < 6; k++) { H.tick(); await new Promise((r) => setTimeout(r, 2)); }
  const reports = globalThis.__test.errors.slice(errsAt).map((e) => String(e?.message ?? e));
  check(`L25d through TWO hung beds the abort handle stays the CURRENT generation's: both requests end aborted (B at the switch to C, C at the switch back) and the live bed installs in ${ms.toFixed(0)} ms with nothing reported`,
    held.length === 2 && afterB.join() === 'false' && afterC.join() === 'true,false'
    && held.every((h) => h.rejected === true) && H.ctl.enabled === true && H.ctl.trackId === 'TEST-synthetic-wire-slide' && reports.length === 0,
    JSON.stringify({ requests: held.length, afterB, afterC, final: held.map((h) => h.rejected), enabled: H.ctl.enabled, trackId: H.ctl.trackId, ms: +ms.toFixed(1), reports }));
}
{
  // L25e the boundary, stated: only the bed being LEFT is abandoned. A hang on the bed the
  // player is STILL on is a wait, not a failure — the controller sits inert with reason
  // 'pending', reports nothing, nothing aborts the request, and it arms when the load lands.
  const T = mkTableShim('wpa_generic_9ft', { diamond_proam_9ft: 'TEST-alias-diamond-wire-slide' });
  let held = null;
  const fetchImpl = async (url, init) => {
    if (String(url).includes('/tracks/TEST-alias-diamond-wire-slide')) { // the hung load under test is the TRACK's; the companions (hardware/, assemblies/, order 21) load normally
      return new Promise((resolve) => { held = { signal: init?.signal ?? null, release: () => resolve(fileFetch(url)) }; });
    }
    return fileFetch(url);
  };
  const H = await boot({ tableModule: T.shim, fetchImpl });
  const errsAt = globalThis.__test.errors.length;
  T.switchTo('diamond_proam_9ft');
  for (let k = 0; k < 30; k++) { H.tick(); await new Promise((r) => setTimeout(r, 2)); }   // ~60 ms sitting on the hung bed
  const during = { enabled: H.ctl.enabled, reason: H.ctl.reason, aborted: held?.signal?.aborted ?? null, reports: globalThis.__test.errors.length - errsAt };
  held.release(); await H.settleActivation();
  for (let k = 0; k < 5; k++) { H.tick(); await new Promise((r) => setTimeout(r, 2)); }
  const after = { enabled: H.ctl.enabled, trackId: H.ctl.trackId, armedBy: H.ctl.armedBy, aborted: held?.signal?.aborted ?? null, reports: globalThis.__test.errors.length - errsAt };
  check('L25e the boundary: a hang on the bed the player is still ON is a wait, not an abandon — inert with reason \'pending\' for as long as it takes, the request never aborted, nothing reported, and the bed arms on its own track once the load lands',
    during.enabled === false && during.reason === 'pending' && during.aborted === false && during.reports === 0
    && after.enabled === true && after.trackId === 'TEST-alias-diamond-wire-slide' && after.armedBy === 'spec' && after.aborted === false && after.reports === 0,
    JSON.stringify({ during, after }));
}


// ---- L26 (review r10 P2-1/P2-2): the shallow merge and the follower's own rotation, through
// the real controller. TEST-shallow-merge is the 17.1° two-feeder fixture: the merge protocol
// must hold the waiting ball 102.05 mm up its approach — one diameter plus the 44.90 mm the
// clearance law adds — and the poses the controller hands the renderer must never interpenetrate.
{
  const { supportDerived } = await import('../scene/ballreturn/track.js');
  const H = await boot({ track: 'TEST-shallow-merge' });
  const entryMerges = [...H.ctl.track.routes.values()].flatMap((rt) => rt.merges).filter((m) => m.feeder !== 'trunk');
  check('L26a the controller arms the shallow-merge TEST fixture and its yield stations carry the pushed hold (one diameter + 44.90 mm on both entry merges, from the clearance law)',
    H.ctl.enabled && H.ctl.trackId === 'TEST-shallow-merge' && entryMerges.length === 4
    && entryMerges.every((m) => Math.abs(m.yieldD - m.D - 2 * R - 0.0449) < 1e-4),
    JSON.stringify([...H.ctl.track.routes.values()].flatMap((rt) => rt.merges.map((m) => [rt.pocket, m.feeder, +((m.yieldD - m.D - 2 * R) * 1000).toFixed(2)]))));
  // two pots into each middle, the pairs simultaneous: both feeders reach the merge together
  H.shoot(new Map([[1, legacyEntry(0.6, 4)], [2, legacyEntry(0.6, 1)], [3, legacyEntry(0.7, 4)], [4, legacyEntry(0.7, 1)]]), 2.0, 'S1'); H.runTicksToSettle();
  const rhoMin = Math.min(...[...H.ctl.track.runways.values()].map((rw) => supportDerived(rw.support, R).rho));
  let minPair = Infinity; let worstRatio = 0; let atR = null; let held = 0; const last = new Map();
  for (let k = 0; k < 4000 && [1, 2, 3, 4].some((id) => H.ctl.poseAt(id, H.ctl.clock().t)?.kind !== 'rest'); k++) {
    H.tick();
    const t = H.ctl.clock().t;
    const ps = [1, 2, 3, 4].map((id) => [id, H.ctl.poseAt(id, t)]).filter(([, p]) => p && p.kind !== 'fall');
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) minPair = Math.min(minPair, Math.hypot(ps[i][1].x - ps[j][1].x, ps[i][1].y - ps[j][1].y, ps[i][1].z - ps[j][1].z));
      const [id, p] = ps[i]; const pv = last.get(id);
      if (pv) {
        const ds = Math.hypot(p.x - pv.x, p.y - pv.y, p.z - pv.z);
        const dth = 2 * Math.min(Math.hypot(p.qx - pv.qx, p.qy - pv.qy, p.qz - pv.qz, p.qw - pv.qw), Math.hypot(p.qx + pv.qx, p.qy + pv.qy, p.qz + pv.qz, p.qw + pv.qw));
        if (ds > 1e-6) { const ratio = dth / (ds / rhoMin); if (ratio > worstRatio) { worstRatio = ratio; atR = [id, +t.toFixed(4), +(ds * 1000).toFixed(3), +dth.toFixed(5)]; } }
      }
      last.set(id, { x: p.x, y: p.y, z: p.z, qx: p.qx, qy: p.qy, qz: p.qz, qw: p.qw });
    }
    const sol0 = H.ctl.solution();
    if (sol0.events.some((e) => e.kind === 'yield' && e.t <= t) && ps.some(([, p]) => Math.abs(p.v ?? 0) < 1e-12)) held += 1;
  }
  const sol = H.ctl.solution();
  check(`L26b four pots, the two feeders simultaneous: every ball seats, the merge is exercised (${sol.events.filter((e) => e.kind === 'yield').length} yields, ${sol.events.filter((e) => e.kind === 'release').length} releases), and no two poses the controller hands the renderer are ever inside one diameter (min ${(minPair * 1000).toFixed(3)} mm vs ${(2 * R * 1000).toFixed(2)})`,
    minPair >= 2 * R - 1e-6 && [1, 2, 3, 4].every((id) => sol.rest.has(id)) && sol.events.filter((e) => e.kind === 'yield').length >= 2 && sol.events.filter((e) => e.kind === 'release').length >= 2,
    JSON.stringify({ minPairMm: +(minPair * 1000).toFixed(3), rest: [...sol.rest.keys()], kinds: sol.events.map((e) => e.kind + ':' + e.ball) }));
  check(`L26c no tick of the live pose stream turns a ball faster than its own support allows (worst step / (travel / rho) = ${worstRatio.toFixed(4)} at ${JSON.stringify(atR)}, rho ${(rhoMin * 1000).toFixed(3)} mm)`,
    worstRatio > 0.5 && worstRatio <= 1 + 1e-9, String(worstRatio));
  // the discriminating read of P2-2 through the controller: at every piece boundary of every
  // ball, the orientation the controller draws 1 ns before the boundary and at it may differ
  // only by the rotation those 1 ns of travel earn (Δs / rho). The follower's station comes
  // from the contact chain, so a rotation advanced by the PIECE's quadratic instead of the
  // ball's own displacement lands the next piece on a different q0 and this gap opens.
  for (const [nm, ctl] of [['shallow-merge', H], ['bend-90', await (async () => { const B = await boot({ track: 'TEST-bend-90' }); B.shoot(new Map([[1, legacyEntry(0.6, 4)], [2, legacyEntry(0.66, 4)], [3, legacyEntry(0.72, 4)], [4, legacyEntry(0.78, 4)], [5, legacyEntry(0.84, 4)], [6, legacyEntry(0.9, 4)]]), 2.0, 'S2'); B.runTicksToSettle(); for (let k = 0; k < 4000 && [1, 2, 3, 4, 5, 6].some((id) => B.ctl.poseAt(id, B.ctl.clock().t)?.kind !== 'rest'); k++) B.tick(); return B; })()]]) {
    const so = ctl.ctl.solution();
    const rho = Math.min(...[...ctl.ctl.track.runways.values()].map((rw) => supportDerived(rw.support, R).rho));
    let worst = 0; let at = null; let n = 0; let nf = 0;
    for (const [id, ps] of so.pieces) {
      for (let i = 0; i + 1 < ps.length; i++) {
        const t1 = ps[i].t1;
        if (!Number.isFinite(t1)) continue;
        if (ps[i].follow) nf += 1;
        for (const h of [1e-9, 1e-8]) {
          const a = ctl.ctl.poseAt(id, t1 - h); const b = ctl.ctl.poseAt(id, t1);
          if (!a || !b || a.kind === 'fall' || b.kind === 'fall' || a.qw === undefined) continue;
          const ds = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
          const dth = 2 * Math.min(Math.hypot(a.qx - b.qx, a.qy - b.qy, a.qz - b.qz, a.qw - b.qw), Math.hypot(a.qx + b.qx, a.qy + b.qy, a.qz + b.qz, a.qw + b.qw));
          n += 1;
          const excess = dth - ds / rho;
          if (excess > worst) { worst = excess; at = [id, +t1.toFixed(5), ps[i].kind, !!ps[i].follow, h]; }
        }
      }
    }
    check(`L26d ${nm}: the orientation the controller draws is continuous at every piece boundary of every ball (${n} reads over ${nf} boundaries a ball is CONTACT-DRIVEN through — the discriminating ones: a follower's station comes from the chain, not from its piece's quadratic) — the gap over 1 ns / 10 ns of travel exceeds that travel's own rotation by at most 1 µrad (worst ${worst.toExponential(3)} rad at ${JSON.stringify(at)})`,
      n > 20 && nf > 0 && worst <= 1e-6, JSON.stringify({ worst, nf }));
  }
}


// ---- L27 (seal 14, S1): the MID-EDGE landing fixture through the real controller.
// TEST-midedge-landing lands rc-run 151.3 mm DOWN the trunk at 35°, so lc-run's traffic —
// which enters at the trunk head — crosses rc-run's landing from upstream. The seal-13
// clearance pass excluded every peer station on a shared edge, upstream ones included, so
// rc-run's hold was pushed +0.00 mm and the two balls drew 32.72 mm apart, 24.4 mm inside
// the diameter. The hold the law now computes must survive the controller, not just the solver.
{
  const H = await boot({ track: 'TEST-midedge-landing' });
  const rc = [...H.ctl.track.routes.values()].flatMap((rt) => rt.merges).filter((m) => m.feeder === 'rc-run');
  check(`L27a the controller arms the mid-edge fixture and every rc-run merge carries a PUSHED hold (one diameter + ${rc.map((m) => ((m.yieldD - m.D - 2 * R) * 1000).toFixed(2)).join(' / ')} mm, from the upstream peers the seal-13 rule dropped)`,
    H.ctl.enabled && H.ctl.trackId === 'TEST-midedge-landing' && rc.length > 0 && rc.every((m) => m.yieldD - m.D - 2 * R > 1e-3),
    JSON.stringify([...H.ctl.track.routes.values()].flatMap((rt) => rt.merges.map((m) => [rt.pocket, m.feeder, +((m.yieldD - m.D - 2 * R) * 1000).toFixed(2)]))));
  // the verifier's own case and its mirror: the trunk ball 550 ms ahead of the feeder, and back
  let minPair = Infinity; let atP = null; let seated = 0; let runs = 0;
  for (const [first, second] of [[1, 4], [4, 1]]) {
    for (const gap of [0.30, 0.55, 0.80]) {
      const G = await boot({ track: 'TEST-midedge-landing' });
      G.shoot(new Map([[1, legacyEntry(0.5, first)], [2, legacyEntry(0.5 + gap, second)]]), 2.2, `M${first}${gap}`);
      G.runTicksToSettle();
      for (let k = 0; k < 6000 && [1, 2].some((id) => G.ctl.poseAt(id, G.ctl.clock().t)?.kind !== 'rest'); k++) {
        G.tick();
        const t = G.ctl.clock().t;
        const ps = [1, 2].map((id) => G.ctl.poseAt(id, t)).filter((q) => q && q.kind !== 'fall');
        if (ps.length === 2) {
          const d = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y, ps[0].z - ps[1].z);
          if (d < minPair) { minPair = d; atP = [first, gap, +t.toFixed(4)]; }
        }
      }
      runs += 1;
      if ([1, 2].every((id) => G.ctl.solution().rest.has(id))) seated += 1;
    }
  }
  check(`L27b ${runs} two-ball runs across the mid-edge landing (both orders, the feeder 300 / 550 / 800 ms behind and ahead): no two poses the controller hands the renderer are ever inside one diameter (min ${(minPair * 1000).toFixed(4)} mm vs ${(2 * R * 1000).toFixed(2)}, at ${JSON.stringify(atP)}) and both balls seat in every run (${seated}/${runs})`,
    runs === 6 && seated === runs && minPair >= 2 * R - 1e-6, JSON.stringify({ minPairMm: +(minPair * 1000).toFixed(4), atP, seated }));
}

// ---- L28 (seal 14, S2): a train with FREE resting balls ahead of it, through the controller.
// Nine balls seat from the wall; the two nearest the wall are then lifted out of the tray (a
// rack that no longer carries them), which leaves the front of the remaining train standing
// FREE on the flat. Under the seal-13 chain law the pushers behind it were read as a parted
// chain and blocked at v = 0 for the whole solution (tEnd 0, permanent): the balls simply
// never moved. They must roll down and re-seat against the wall.
{
  const H = await boot();
  const ids = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  for (const id of ids) { H.balls[id].pocketed = true; H.balls[id].mesh.visible = false; }
  H.tick(); H.tick();
  for (let k = 0; k < 6000 && ids.some((id) => H.ctl.poseAt(id, H.ctl.clock().t)?.kind !== 'rest'); k++) H.tick();
  const order = [...H.ctl.solution().rest.entries()].sort((a, b) => a[1] - b[1]).map(([i]) => i);
  const before = new Map(order.slice(2).map((id) => [id, H.posOf(id)]));
  for (const id of order.slice(0, 2)) { H.balls[id].pocketed = false; H.balls[id].mesh.visible = true; H.balls[id].mesh.position.set(0, 0, 0); }
  H.tick(); H.tick();
  const train = order.slice(2);
  const tEnd = H.ctl.solution().tEnd;
  for (let k = 0; k < 8000 && train.some((id) => H.ctl.poseAt(id, H.ctl.clock().t)?.kind !== 'rest'); k++) H.tick();
  const sol = H.ctl.solution();
  const rest = [...sol.rest.entries()].sort((a, b) => a[1] - b[1]);
  let moved = 0; for (const id of train) moved = Math.max(moved, dist(H.posOf(id), before.get(id)));
  let worstGap = 0;
  for (let i = 1; i < rest.length; i++) {
    const a = H.posOf(rest[i - 1][0]); const b = H.posOf(rest[i][0]);
    worstGap = Math.max(worstGap, Math.abs(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) - 2 * R));
  }
  check(`L28 the two balls nearest the wall are lifted out and the ${train.length}-ball train behind them — whose leading ball now stands FREE on the flat — rolls down and re-seats: tEnd ${tEnd.toFixed(4)} s (the seal-13 chain law parted the train here and held every pusher at v = 0 forever, tEnd 0), the train moved ${(moved * 1000).toFixed(1)} mm, all ${rest.length} seated with the front at the wall seat r (${(rest[0][1] * 1000).toFixed(2)} mm vs ${(R * 1000).toFixed(2)}) and every resting neighbour one diameter apart in SPACE (worst ${(worstGap * 1e9).toFixed(1)} nm)`,
    tEnd > 0 && rest.length === train.length && moved > 0.05 && Math.abs(rest[0][1] - R) < 1e-9 && worstGap < 1e-9,
    JSON.stringify({ tEnd, n: rest.length, movedMm: +(moved * 1000).toFixed(2), frontMm: +(rest[0][1] * 1000).toFixed(3), worstGapNm: +(worstGap * 1e9).toFixed(2) }));
}

// ---- L29 (seal 14, round 2): the OBTUSE merge through the real controller.
// TEST-obtuse-merge's feeder overshoots the trunk head and doubles back, meeting the trunk at
// 130° in plan. Across that bend the chord from the feeder's hold to the trunk's stations is far
// shorter than the arc, so seal 13 (+0.00 mm push) drew 45.32 mm and the seal-14 mid-edge fix
// (+1.80 mm) still drew 46.75 mm. Only an arrival pair ALIGNED on the merge instant finds it —
// the aligned lead here is ~4.99 s, so the gaps below bracket that, not the sub-second gaps
// a coarse sweep would try.
{
  const H = await boot({ track: 'TEST-obtuse-merge' });
  const rc = [...H.ctl.track.routes.values()].flatMap((rt) => rt.merges).filter((m) => m.feeder === 'rc-run');
  check(`L29a the controller arms the obtuse fixture and every rc-run merge carries a hold pushed one diameter + ${rc.map((m) => ((m.yieldD - m.D - 2 * R) * 1000).toFixed(2)).join(' / ')} mm (seal 13 +0.00, the seal-14 mid-edge fix +1.80)`,
    H.ctl.enabled && H.ctl.trackId === 'TEST-obtuse-merge' && rc.length > 0 && rc.some((m) => (m.yieldD - m.D - 2 * R) * 1000 > 5),
    JSON.stringify([...H.ctl.track.routes.values()].flatMap((rt) => rt.merges.map((m) => [rt.pocket, m.feeder, +((m.yieldD - m.D - 2 * R) * 1000).toFixed(2)]))));
  // the aligned lead is 4.9915 s (node arm r19b computes it from the solver by bisection); r19b's
  // worst offset on the seal-14 mid-edge tree is 60 ms EARLY of it, so the gaps step through that
  // window instead of the sub-second gaps a coarse sweep would try
  const GAPS = [4.87, 4.90, 4.9315, 4.96, 4.9915, 5.02, 5.05];
  let minPair = Infinity; let atP = null; let seated = 0; let runs = 0;
  for (const [first, second] of [[1, 4], [4, 1]]) {
    for (const gap of GAPS) {
      const G = await boot({ track: 'TEST-obtuse-merge' });
      G.shoot(new Map([[1, legacyEntry(0.5, first)], [2, legacyEntry(0.5 + gap, second)]]), gap + 2.2, `O${first}${gap}`);
      G.runTicksToSettle();
      for (let k = 0; k < 40000 && [1, 2].some((id) => G.ctl.poseAt(id, G.ctl.clock().t)?.kind !== 'rest'); k++) {
        G.tick();
        const t = G.ctl.clock().t;
        const ps = [1, 2].map((id) => G.ctl.poseAt(id, t)).filter((q) => q && q.kind !== 'fall');
        if (ps.length === 2) {
          const d = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y, ps[0].z - ps[1].z);
          if (d < minPair) { minPair = d; atP = [first, gap, +t.toFixed(4)]; }
        }
      }
      runs += 1;
      if ([1, 2].every((id) => G.ctl.solution().rest.has(id))) seated += 1;
    }
  }
  check(`L29b ${runs} two-ball runs across the OBTUSE merge (both orders, the pots ${GAPS[0]}–${GAPS[GAPS.length - 1]} s apart, stepping through the 4.9915 s aligned lead): no two poses the controller hands the renderer are ever inside one diameter (min ${(minPair * 1000).toFixed(4)} mm vs ${(2 * R * 1000).toFixed(2)}, at ${JSON.stringify(atP)}) and both balls seat in every run (${seated}/${runs})`,
    runs === 2 * GAPS.length && seated === runs && minPair >= 2 * R - 1e-6, JSON.stringify({ minPairMm: +(minPair * 1000).toFixed(4), atP, seated }));
}

// ---- L30 (seal 14, round 2): the PRODUCED ledger, carried by the controller itself.
// Refuter 1 broke FR-006 with hand-authored ledgers — a lone ball resting mid-tray, a stack with
// its wall-side balls deleted. Those are not layouts the module produces. This arm never authors
// one: it pots shot after shot and lets the controller carry its own rests forward, checking
// every pose it hands the renderer in every shot.
{
  let minPair = Infinity; let atP = null; let shots = 0; let posed = 0;
  for (const trackId of ['TEST-obtuse-merge', 'TEST-midedge-landing', 'TEST-synthetic-wire-slide']) {
    const H = await boot({ track: trackId });
    const live = [];
    // on the obtuse fixture the pair is potted at the ALIGNED lead (4.9315 s, r19b's worst
    // offset), so the carried-forward states walk through the merge breach too; elsewhere a
    // plain 0.4 s pair is enough to stack the tray
    const gap = trackId === 'TEST-obtuse-merge' ? 4.9315 : 0.4;
    for (const [a, b, pkA, pkB] of [[1, 2, 4, 1], [3, 4, 1, 4], [5, 6, 4, 4], [7, 8, 1, 1]]) {
      H.shoot(new Map([[a, legacyEntry(0.5, pkA)], [b, legacyEntry(0.5 + gap, pkB)]]), gap + 2.2, `C${trackId}${a}`);
      H.runTicksToSettle();
      live.push(a, b);
      shots += 1;
      for (let k = 0; k < 20000 && live.some((id) => H.ctl.poseAt(id, H.ctl.clock().t)?.kind !== 'rest'); k++) {
        H.tick();
        const t = H.ctl.clock().t;
        const ps = live.map((id) => [id, H.ctl.poseAt(id, t)]).filter(([, q]) => q && q.kind !== 'fall');
        posed += ps.length;
        for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
          const p = ps[i][1]; const q = ps[j][1];
          const d = Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
          if (d < minPair) { minPair = d; atP = { trackId, shot: shots, pair: [ps[i][0], ps[j][0]], t: +t.toFixed(4) }; }
        }
      }
    }
  }
  check(`L30 ${shots} shots over three fixtures with the CONTROLLER carrying its own rests forward (never an authored ledger; ${posed} drawn poses read back): no two poses are ever inside one diameter (min ${(minPair * 1000).toFixed(4)} mm vs ${(2 * R * 1000).toFixed(2)}, at ${JSON.stringify(atP)})`,
    shots === 12 && posed > 1000 && minPair >= 2 * R - 1e-6, JSON.stringify({ minPairMm: +(minPair * 1000).toFixed(4), atP, posed }));
}

// ---- L31 (order 18 item 0): the pocket-drop OWNERSHIP hand-off on the high fixture.
// TEST-terminal-chutes-high reproduces the XW101 class (sink clearance −34.7 mm): seven pots queue from the stop, the
// seventh drawn 5 mm below the entry; the eighth ball's sink pose meets it before its shield crossing. With the OWNER
// host the module takes the ball at tOwn < tH (the hand-off reads pivot+own), the host's sink drawing ends there (no
// frame draws the sinking ball within one diameter of a module ball), the ball is HELD where the sink left it (drawn
// through the opening while its top is above the shield — never inside another ball), and a cold seek into the window
// reads the same as a warm one. With the LEGACY host (no hook) the track is disabled by V13 and nothing is drawn.
{
  const H = await boot({ track: 'TEST-terminal-chutes-high', host: 'owner' });
  const sinks = new Map(); for (let id = 1; id <= 8; id++) sinks.set(id, pivotEntry(0.5 + (id - 1) * 1.0, 4));
  H.shoot(sinks, 9.0, 'OWN8');
  let worstHostVsModule = Infinity; let atW = null; let frames = 0; let heldDrawnAbove = 0; let doubleDrawn = 0; let ownPB = null; // the PLAYBACK solution's ownership read
  const others = [1, 2, 3, 4, 5, 6, 7];
  for (let k = 0; k < 4000 && H.machine.state === 'PLAYBACK'; k++) {
    H.tick(); frames += 1;
    const t = H.ctl.clock().t;
    const sd = H.sinkDrawn.get(8);
    if (sd && Math.abs(sd.t - t) < 1e-9) { // the host drew ball 8's sink this frame: its distance to every module-drawn ball
      for (const id of others) { const q = H.ctl.poseAt(id, t); if (!q) continue; const d = Math.hypot(sd.x - q.x, sd.y - q.y, sd.z - q.z); if (d < worstHostVsModule) { worstHostVsModule = d; atW = { t: +t.toFixed(4), other: id }; } }
      if (H.balls[8].mesh.userData.obReturnPosed) doubleDrawn += 1;
    }
    const p8 = H.ctl.poseAt(8, t); if (p8 && p8.kind === 'hold' && p8.y + R > -0.055) heldDrawnAbove += 1;
    if (!ownPB && p8 && H.machine.state === 'PLAYBACK') ownPB = H.ctl.ownership(); // read while the record's own base is live (a settle carries the hold to a new base)
  }
  const own = ownPB ?? H.ctl.ownership();
  const a8 = own.arrivals.find((a) => a.id === 8) ?? null; const o8 = own.owned.find((o) => o.id === 8) ?? null;
  const carried = H.ctl.poseAt(8, H.ctl.clock().t); // after the settle the hold is carried to the new base and re-held
  const s8 = sinks.get(8); const tHfree = a8?.own?.tHFree ?? null;
  // cold vs warm seek into the ownership window: a fresh realm answers the guard the same (the hook solves synchronously)
  const C = await boot({ track: 'TEST-terminal-chutes-high', host: 'owner' });
  C.shoot(new Map(sinks), 9.0, 'OWN8');
  const tMid = a8 ? 0.5 * (a8.tH + tHfree) : 7.6; // inside [tOwn, tH)
  C.game.clock = tMid; C.game.sinkInfo = C.st.sinks; // a cold seek: the module has not solved yet
  const coldAns = typeof C.game.ballReturnOwns === 'function' ? C.game.ballReturnOwns(8, tMid - s8.t) : null;
  const warmAns = typeof C.game.ballReturnOwns === 'function' ? C.game.ballReturnOwns(8, tMid - s8.t) : null;
  const Lg = await boot({ track: 'TEST-terminal-chutes-high', host: 'legacy', expectEnabled: false });
  check(`L31 the OWNERSHIP hand-off (order 18 item 0) on TEST-terminal-chutes-high: ball 8's hand-off reads ${a8?.source ?? 'n/a'} at tH ${a8 ? a8.tH.toFixed(4) : 'n/a'} vs the free crossing ${tHfree ? tHfree.toFixed(4) : 'n/a'} (early by ${a8 && tHfree ? ((tHfree - a8.tH) * 1e3).toFixed(1) : 'n/a'} ms, ${own.rounds} round(s)); after the settle the hold is carried (${carried?.kind ?? 'none'}); the host's sink drawing never came within one diameter of a module-drawn ball (min ${Number.isFinite(worstHostVsModule) ? (worstHostVsModule * 1e3).toFixed(2) : 'n/a'} mm at ${JSON.stringify(atW)}); ball 8 HELD and drawn through the opening (${heldDrawnAbove} frames, top above the shield), never double-drawn (${doubleDrawn}); cold seek into the window answers ${coldAns} = warm ${warmAns}; the LEGACY host keeps the track disabled (${Lg.ctl.enabled ? 'ENABLED' : Lg.ctl.reason.slice(0, 60)})`,
    !!a8 && a8.source === 'pivot+own' && !!o8 && tHfree !== null && a8.tH < tHfree - 1e-3 && carried?.kind === 'hold' && worstHostVsModule >= 2 * R - 1e-6 && heldDrawnAbove > 0 && doubleDrawn === 0 && coldAns === true && warmAns === true && !Lg.ctl.enabled && /V13/.test(Lg.ctl.reason),
    JSON.stringify({ a8, o8, frames, worstHostVsModule, atW, heldDrawnAbove, doubleDrawn, coldAns, warmAns, legacy: Lg.ctl.reason }));
}

// ---- L32 (order 19 item 5): a discipline switch on the SAME bed re-arms the track. V8 reads the LIVE ball radius; a rack
// rebuilt with another radius under the same table id (activateSnooker on the 12 ft bed: the 9-ball 28.575 → the snooker
// 26.25) must be read again — the first Chrome look (2026-09-07) found the XW101 track still refused under the snooker rules,
// the 9-ball verdict cached until the table itself changed. The re-read is outside PLAYBACK only (the archive's bed; the
// memo / borrow law owns cross-equipment opens). Here the other way round on the wire slide (refR 28.575): booted under a
// 26.25 rack (refused, V8), the rack rebuilt with 28.575 → armed on the next frame; a radius change under PLAYBACK not re-read.
{
  const W = await boot({ track: 'TEST-synthetic-wire-slide', host: 'owner', templateR: 0.02625, expectEnabled: false });
  const refused = !W.ctl.enabled && /V8/.test(W.ctl.reason ?? '') && W.ctl.trackId === 'TEST-synthetic-wire-slide';
  const reasonBefore = W.ctl.reason;
  W.game.template.system.balls[0].params.r = R;                  // the rack rebuilt with the track's own ball
  let armed = false; for (let i = 0; i < 100 && !armed; i++) { W.frame(0.016 * (i + 1)); await new Promise((r) => setTimeout(r, 20)); armed = W.ctl.enabled === true; }
  const reasonArmed = W.ctl.reason;
  W.shoot(new Map(), 1.0, 'L32');                                  // PLAYBACK: a radius change is the archive's business
  W.game.template.system.balls[0].params.r = 0.02625;
  for (let i = 0; i < 5; i++) { W.tick(); await new Promise((r) => setTimeout(r, 10)); }
  const stableInPlayback = W.ctl.enabled === true && W.machine.state === 'PLAYBACK';
  check('L32 a discipline switch on the same bed re-arms the track (order 19 item 5): refused under a 26.25 rack (V8), armed on the frame after the rack carries 28.575, a radius change under PLAYBACK not re-read',
    refused && armed && /armed by/.test(reasonArmed) && stableInPlayback, JSON.stringify({ reasonBefore, reasonArmed, armed, stableInPlayback, state: W.machine.state }));
}

// ---- L33 (order 19, refuter H's D1 / D2 on L32's law): the radius re-arm neither churns nor persists. (a) A discipline
// switch while the track fetch takes longer than a frame: with `armedR` left at the old radius across the async activation,
// every frame read "radius moved" and tore the in-flight activation down again (85 activations, 85 fetches in 1.5 s; L32 could
// not see it — its fetch resolves inside one frame). (b) A bed with no track for the arming and a rack of another radius: the
// stale `armedR` re-fetched every frame, forever. `armedR` is now NaN from every teardown until the next V8 read.
{
  const delayed = async (url) => { await new Promise((r) => setTimeout(r, 40)); return fileFetch(url); };
  const W = await boot({ track: 'TEST-synthetic-wire-slide', host: 'owner', fetchImpl: delayed });
  const act0 = W.ctl.stats.activations;
  W.game.template.system.balls[0].params.r = 0.02625;             // the rack rebuilt with another ball, the fetch 40 ms long
  let settled = null; const t0 = Date.now(); let frames = 0;
  while (Date.now() - t0 < 900) { W.frame(0.016 * (++frames)); if (settled === null && W.ctl.reason !== 'pending' && W.ctl.stats.activations > act0) settled = Date.now() - t0; await new Promise((r) => setTimeout(r, 16)); }
  await new Promise((r) => setTimeout(r, 120));
  const dA = W.ctl.stats.activations - act0; const refusedNow = !W.ctl.enabled && /V8/.test(W.ctl.reason ?? '');
  // (b) the same module on a bed the arming is not defined for, the rack still 26.25: one activation, then silence
  const { shim, switchTo } = mkTableShim('wpa_generic_9ft');
  let dB = null, reasonB = null;
  if (shim) {
    const V = await boot({ track: 'TEST-synthetic-wire-slide', host: 'owner', tableModule: shim, fetchImpl: delayed });
    switchTo('wpa_spec_9ft'); V.game.template.system.balls[0].params.r = 0.02625;
    const b0 = V.ctl.stats.activations; for (let i = 0; i < 40; i++) { V.frame(0.016 * (i + 1)); await new Promise((r) => setTimeout(r, 16)); }
    await new Promise((r) => setTimeout(r, 120));
    dB = V.ctl.stats.activations - b0; reasonB = V.ctl.reason;
  }
  check(`L33 the radius re-arm neither churns nor persists (refuter H, D1 / D2): a discipline switch during a 40 ms fetch = ${dA} activation over ${frames} frames (settled ${settled} ms), the V8 verdict read once; a bed with no track for the arming and a foreign radius = ${dB} activation over 40 frames`,
    dA === 1 && refusedNow && (dB === null || dB === 1), JSON.stringify({ dA, frames, settled, reason: W.ctl.reason, dB, reasonB }));
}

// ---- L34 (order 20 item 0): V16 in the controller through the `scene` seam. A box across the wire slide → the activation is
// REFUSED [V16] naming the box and the station span, nothing drawn, the facade's `furniture` carries the read; the box lifted
// clear → enabled with `furniture.evaluated true, violations 0`; no seam at all (this harness's other boots) → `evaluated
// false, why 'no scene'` and the track enabled — a headless host with nothing to clear against, stated, not a refusal.
{
  const THREE = await import('three');
  const { stationAt } = await import('../scene/ballreturn/track.js');
  const H0 = await boot({ track: 'TEST-synthetic-wire-slide', host: 'owner' });                 // this harness's default: the waiver
  const noSeam = H0.ctl.enabled === true && H0.ctl.furniture && H0.ctl.furniture.evaluated === false && H0.ctl.furniture.why === 'no scene';
  const H00 = await boot({ track: 'TEST-synthetic-wire-slide', host: 'owner', furniture: null, expectEnabled: false }); // no scene, no waiver: fail-closed
  const noWaiver = H00.ctl.enabled === false && /\[V16\]/.test(H00.ctl.reason ?? '') && /no scene/.test(H00.ctl.reason ?? '');
  const route = H0.ctl.track.routes.get(4); const D0 = 0.5 * route.total; const P = stationAt(route, D0, R, {});
  const mk = (lift) => { const scene = new THREE.Scene(); const box = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.02, 0.2), new THREE.MeshBasicMaterial()); box.name = 'obTestLeg'; box.position.set(P.x, P.y + lift, P.z); scene.add(box); scene.updateMatrixWorld(true); return scene; };
  const H1 = await boot({ track: 'TEST-synthetic-wire-slide', host: 'owner', scene: mk(0), expectEnabled: false });
  const refused = H1.ctl.enabled === false && /\[V16\]/.test(H1.ctl.reason ?? '') && /obTestLeg/.test(H1.ctl.reason ?? '') && H1.ctl.furniture?.evaluated === true && H1.ctl.furniture.violations.length > 0 && H1.ctl.track === null;
  const H2 = await boot({ track: 'TEST-synthetic-wire-slide', host: 'owner', scene: mk(0.01 + R + 0.002) });
  const clear = H2.ctl.enabled === true && H2.ctl.furniture?.evaluated === true && H2.ctl.furniture.violations.length === 0 && H2.ctl.stats.furnitureEvals >= 1;
  check(`L34 V16 through the scene seam (order 20 item 0): a box across the slide → refused [V16] naming it (${H1.ctl.furniture?.violations.length ?? 'n/a'} stations, ${H1.ctl.furniture?.byMesh?.[0]?.mesh ?? '—'}); lifted clear → enabled with 0 violations; no scene with the headless waiver (furniture: 'none') → evaluated false, enabled; no scene and NO waiver → refused [V16] (fail-closed)`,
    noSeam && noWaiver && refused && clear, JSON.stringify({ noSeam: H0.ctl.furniture, noWaiverReason: H00.ctl.reason, refusedReason: H1.ctl.reason, clear: H2.ctl.furniture && { n: H2.ctl.furniture.violations.length, stations: H2.ctl.furniture.stations }, evals: H2.ctl.stats.furnitureEvals }));
}

// ---- L35 (order 21, ruling 1): the wpa pocket-assembly declaration (assemblies/wpa_generic_9ft.json, V18) through the scene seam. A
// synthetic scene with a cylinder that matches the declared middle-well (parent obTable, CylinderGeometry, centre (0, −99, −703) mm,
// 137 × 200 × 137) and the HIGH fixture whose lc-lead runs inside it → ENABLED: the well passed on the entry segment only, measured;
// the same cylinder moved 250 mm inboard along the chute (still matching by name? no — the match is by box, so it no longer matches:
// an undeclared solid) → refused naming it; a cylinder matching the declaration but placed where the chute's END runs through it →
// refused as a declared assembly mesh BEYOND the entry segment.
{
  const THREE = await import('three');
  const mkWell = (cz, dyAlong = 0) => { const scene = new THREE.Scene(); const g = new THREE.Group(); g.name = 'obTable'; const well = new THREE.Mesh(new THREE.CylinderGeometry(0.0685, 0.0685, 0.2, 24), new THREE.MeshStandardMaterial()); well.position.set(0 + dyAlong, -0.099, cz); g.add(well); scene.add(g); scene.updateMatrixWorld(true); return scene; };
  const W1 = await boot({ track: 'TEST-terminal-chutes-high', host: 'owner', scene: mkWell(-0.703), furniture: null, expectEnabled: false }); // asserted below, never a throw: a refusal here must be a named FAIL (battery N65 crashed the harness through the default)
  const f1 = W1.ctl.furniture;
  const seg1 = f1 && f1.entrySegments && f1.entrySegments.find((e) => String(e.route) === '1');
  const ok1 = W1.ctl.enabled === true && !!W1.ctl.assembly && W1.ctl.assembly.meshes.length === 2 && f1 && f1.evaluated && f1.violations.length === 0 && f1.assemblyPass.length > 0 && f1.assemblyDeclared.length === 1 && f1.assemblyDeclared[0].id === 'middle-well-lc' && f1.assemblyDeclared[0].solidSimplification === true && !!seg1 && !seg1.wholeRoute && seg1.sEnd !== null;
  const W2 = await boot({ track: 'TEST-terminal-chutes-high', host: 'owner', scene: mkWell(-0.703 + 0.25), furniture: null, expectEnabled: false });
  const ok2 = W2.ctl.enabled === false && /\[V16\]/.test(W2.ctl.reason ?? '') && /CylinderGeometry/.test(W2.ctl.reason ?? '') && W2.ctl.furniture && W2.ctl.furniture.assemblyDeclared.length === 0;
  check(`L35 V18 the wpa wells are declared pocket assembly and passable on the entry segment only: the synthetic well at the declared box → enabled, ${f1 ? f1.assemblyPass.length : 'n/a'} stations passed on lc-lead / lc-chute, the entry segment ends at s ${seg1 && seg1.sEnd !== null ? (seg1.sEnd * 1e3).toFixed(1) : '—'} mm of ${seg1 ? seg1.runway : '—'}, solid_simplification recorded; the same cylinder 250 mm inboard (no longer matching the declared box) → refused [V16] naming it`,
    ok1 && ok2, JSON.stringify({ enabled1: W1.ctl.enabled, reason1: (W1.ctl.reason ?? '').slice(0, 160), f1: f1 && { n: f1.violations.length, pass: f1.assemblyPass.length, declared: f1.assemblyDeclared, entry: f1.entrySegments }, reason2: (W2.ctl.reason ?? '').slice(0, 200), declared2: W2.ctl.furniture?.assemblyDeclared }));
}

// ---- L36 (order 21 item 2): the XW101 on its own bed through the table shim, headless (the furniture row waived: no scene): the
// controller loads BOTH companions — the V17 hardware (five names, the strap iron the one solid stand-in, three omissions) and the
// V18 pocket assembly (thirteen meshes by name) — and enables the track under the snooker ball (templateR 26.25; V13's hook on the
// owner host); the facade carries both; a bed with no companions (the wire slide on wpa) carries the wpa wells and no hardware.
{
  const T = mkTableShim('wpbsa_snooker_12ft');
  const X = await boot({ track: 'wpbsa_snooker_12ft-xw101-slides', host: 'owner', templateR: 0.02625, tableModule: T.shim, expectEnabled: false }); // asserted below
  const hw = X.ctl.hardware, asm = X.ctl.assembly;
  const okX = X.ctl.enabled === true && X.ctl.trackId === 'wpbsa_snooker_12ft-xw101-slides' && !!hw && hw.meshNames.length === 5 && hw.meshes.filter((m) => m.solidSimplification).map((m) => m.name).join() === 'obPocketStrapIron' && hw.omissions.length === 3 && !!asm && asm.meshes.length === 13 && X.ctl.track && X.ctl.track.hardwareMeshNames.length === 5;
  const W = await boot({ track: 'TEST-synthetic-wire-slide', host: 'owner', expectEnabled: false });
  const okW = W.ctl.enabled === true && W.ctl.hardware === null && !!W.ctl.assembly && W.ctl.assembly.meshes.length === 2 && W.ctl.track.hardwareMeshNames.length === 0;
  check(`L36 the XW101's two companions load on its bed (order 21 item 2): hardware ${hw ? hw.meshNames.join(', ') : 'none'} (${hw ? hw.omissions.length : '—'} omissions; solid ${hw ? hw.meshes.filter((m) => m.solidSimplification).map((m) => m.name).join(', ') : '—'}), assembly ${asm ? asm.meshes.length : 'none'} meshes, the track enabled under the snooker ball; the wire slide on wpa: no hardware, the two wells`,
    okX && okW, JSON.stringify({ X: { enabled: X.ctl.enabled, reason: (X.ctl.reason ?? '').slice(0, 140), hw: hw && hw.meshNames, asm: asm && asm.meshes.length }, W: { enabled: W.ctl.enabled, hw: W.ctl.hardware, asm: W.ctl.assembly && W.ctl.assembly.meshes.length } }));
}

// ---- L37 (review r12 P2): an activation that lands INSIDE a record's PLAYBACK does the base-switch bookkeeping the PLAYBACK
// hook missed (the track was null when the state changed): its first solve is a base switch at the record clock it landed
// at, the record's content snapshot carries that origin, and a REPLAY of the record reproduces the first playback frame for
// frame from that origin (before it neither playback poses the carried ball: absent module / null pose). Flow: record A rolls
// ball 1 down the slide; a preview onto an inert bed memoises the live session MID-ROLL; the return to the wpa bed holds the
// TRACK fetch (the companions load normally); record B fires while the activation is pending; the held load is released
// mid-B; the carried ball's poses from the landing to its rest are recorded on a fixed clock grid; B is replayed and compared.
{
  const T = mkTableShim('wpa_generic_9ft');
  let held = null;
  const fetchImpl = async (url, init) => {
    if (held && String(url).includes('/tracks/TEST-synthetic-wire-slide')) return new Promise((resolve) => { held.release = () => resolve(fileFetch(url)); });
    return fileFetch(url);
  };
  const H = await boot({ tableModule: T.shim, fetchImpl });
  H.shoot(new Map([[1, legacyEntry(0.6, 4)]]), 2.0, 'A'); H.runTicksToSettle(); // A settles with ball 1 still on the slide (a 0.6 m/s entry rests ≈ 4.8 s on this base)
  for (let k = 0; k < 400 && H.ctl.poseAt(1, H.ctl.clock().t)?.kind !== 'roll'; k++) H.tick();
  const rollingAtPreview = H.ctl.poseAt(1, H.ctl.clock().t)?.kind === 'roll';
  T.switchTo('chinese8_pro_9ft'); await H.settleActivation();   // an inert bed: the live session (ball 1 mid-roll) goes to the memo
  held = {};                                                      // the next wpa activation's TRACK load is held by hand
  T.switchTo('wpa_generic_9ft'); H.tick(); const pendingBefore = H.ctl.reason === 'pending';
  H.shoot(new Map([[2, legacyEntry(0.5, 4)]]), 3.0, 'B');        // record B: PLAYBACK begins with the track still null → the hook is missed
  for (let k = 0; k < 12; k++) H.tick();                          // B's clock runs ≈ 0.2 s before the activation lands
  const pendingInB = H.ctl.reason === 'pending' && H.machine.state === 'PLAYBACK';
  held.release(); await H.settleActivation();                    // the activation lands inside B's PLAYBACK
  const landed = { enabled: H.ctl.enabled, state: H.machine.state, clock: +H.game.clock.toFixed(4) };
  const grid = []; for (let t = Math.ceil((H.game.clock + 0.02) * 20) / 20; t < 2.95; t += 0.05) grid.push(+t.toFixed(3));
  const sample = () => grid.map((t) => { H.frame(t); const q = H.posOf(1); const p = H.ctl.poseAt(1, t); return [t, q.vis, +q.x.toFixed(9), +q.y.toFixed(9), +q.z.toFixed(9), p ? p.kind : null]; });
  const first = sample();                                        // the first playback, from the landing clock on
  H.runTicksToSettle();                                          // B settles (ball 1 at rest in the tray by then)
  const restKind = H.ctl.poseAt(1, H.ctl.clock().t)?.kind;
  H.replay();                                                    // the same record object re-enters PLAYBACK from clock 0
  H.frame(Math.max(0.01, landed.clock / 2)); const beforeOrigin = { vis: H.posOf(1).vis, pose: H.ctl.poseAt(1, landed.clock / 2) }; // before the origin: nothing posed (as in the first playback, where the module was absent)
  const again = sample();
  const moved = Math.hypot(first[0][2] - first[first.length - 1][2], first[0][3] - first[first.length - 1][3], first[0][4] - first[first.length - 1][4]);
  const mismatch = first.findIndex((row, i) => JSON.stringify(row) !== JSON.stringify(again[i]));
  const ok = rollingAtPreview && pendingBefore && pendingInB && landed.enabled && landed.state === 'PLAYBACK' && first.every((row) => row[1] === true && row[5] !== null) && moved > 0.05 && restKind === 'rest' && mismatch === -1 && beforeOrigin.pose === null;
  check(`L37 an activation landing INSIDE record B's PLAYBACK (at B clock ${landed.clock} s, the live session memoised mid-roll) is a base switch with that origin: ball 1 posed by the module from the landing on (${first.length} grid frames, it moves ${(moved * 1000).toFixed(0)} mm to its rest), and B's REPLAY reproduces every frame bit for bit from the origin (mismatch index ${mismatch}) while posing nothing before it`,
    ok, JSON.stringify({ rollingAtPreview, pendingBefore, pendingInB, landed, frames: first.length, movedMm: +(moved * 1000).toFixed(1), restKind, mismatch, firstRow: first[0], againRow: again[0], lastRow: first[first.length - 1], beforeOrigin: { vis: beforeOrigin.vis, pose: beforeOrigin.pose && beforeOrigin.pose.kind } }));
}

// ---- L38–L41 (round 22d): refuter J's four defects against 22c's late-join law, each folded with the flow that exposed it ----------
// A held-fetch factory (the return activation's TRACK load released by hand; the companions load normally), as L37's.
const heldFetch = (needle = '/tracks/TEST-synthetic-wire-slide') => { const S = { held: null, requested: 0 }; const fetchImpl = async (url) => { if (S.held && String(url).includes(needle)) { S.requested += 1; return new Promise((res) => { S.held.release = () => res(fileFetch(url)); }); } return fileFetch(url); }; return { fetchImpl, hold: () => { S.held = {}; }, release: () => { const r = S.held?.release; S.held = null; if (r) r(); }, requested: () => S.requested }; }; // `needle`: the request held by hand (the track by default; L50 holds the hardware companion)
const rowsOf = (H, ids, n) => { const out = []; for (let k = 0; k < n; k++) { H.tick(); out.push([+H.ctl.clock().t.toFixed(6), ...ids.map((id) => { const q = H.posOf(id); const p = H.ctl.poseAt(id, H.ctl.clock().t); return [q.vis, q.marker, +q.x.toFixed(9), +q.z.toFixed(9), p ? p.kind : null]; })]); } return out; };
const alignRows = (first, again) => { const t0 = first[0][0]; const idx = again.findIndex((r) => Math.abs(r[0] - t0) < 1e-6); if (idx < 0) return { idx, ok: false, at: -2 }; const n = Math.min(first.length, again.length - idx); let at = -1; for (let i = 0; i < n; i++) if (JSON.stringify(first[i]) !== JSON.stringify(again[idx + i])) { at = i; break; } return { idx, ok: at < 0 && n > 0, at, n }; };
{
  // L38 (D1, P1): a session that joins a record at or after its SETTLE clock — the revert onto a record fired and settled while the
  // track was away (L22c's flow, landing in AIM), and the held fetch released after B settled — replays that record with every carried
  // ball continuing from where the first playback drew it. 22c's replay solved once at the origin, then the settle's re-solve read the
  // previous solution at the last POSED frame (before the origin), found no continuation and dropped the balls to the ledger: every
  // carried ball at its END station (1 188 / 1 337 mm off). Now a ball whose motion begins after the read instant is carried as its
  // first piece's initial state, dated, and solveShot seats it at its own t0 (the 'resume' event).
  const T = mkTableShim('wpa_generic_9ft');
  const H = await boot({ tableModule: T.shim });
  H.shoot(new Map([[1, legacyEntry(0.6, 4)], [2, legacyEntry(1.1, 4)]]), 1.4, 'P'); H.runTicksToSettle();
  for (let k = 0; k < 20; k++) H.tick();
  T.switchTo('chinese8_pro_9ft'); await H.settleActivation();
  H.shoot(new Map([[3, legacyEntry(0.7, 4)]]), 1.2, 'Q'); H.runTicksToSettle();          // Q fired and settled while away
  T.switchTo('wpa_generic_9ft'); await H.settleActivation();                              // the revert lands in AIM at Q's settle clock
  const landed = { state: H.machine.state, clock: +H.game.clock.toFixed(4) };
  const first = rowsOf(H, [1, 2, 3], 90);
  const ledgerFirst = H.ctl.ledger().slice();
  H.replay(); H.runTicksToSettle();                                                       // Q replayed from 0, through its settle
  const again = rowsOf(H, [1, 2, 3], 90);
  const ledgerAgain = H.ctl.ledger().slice();
  const al = alignRows(first, again);
  // the second door: the held fetch released only after B has SETTLED (the landing in AIM at the settle clock)
  const F = heldFetch(); const T2 = mkTableShim('wpa_generic_9ft'); const H2 = await boot({ tableModule: T2.shim, fetchImpl: F.fetchImpl });
  H2.shoot(new Map([[1, legacyEntry(0.6, 4)]]), 2.0, 'A'); H2.runTicksToSettle();
  for (let k = 0; k < 400 && H2.ctl.poseAt(1, H2.ctl.clock().t)?.kind !== 'roll'; k++) H2.tick();
  T2.switchTo('chinese8_pro_9ft'); await H2.settleActivation(); F.hold(); T2.switchTo('wpa_generic_9ft'); H2.tick();
  H2.shoot(new Map([[2, legacyEntry(0.5, 4)]]), 1.0, 'B'); H2.runTicksToSettle();         // B settles while the activation is pending
  F.release(); await H2.settleActivation();
  const landed2 = { state: H2.machine.state, clock: +H2.game.clock.toFixed(4) };
  const first2 = rowsOf(H2, [1, 2], 60);
  H2.replay(); H2.runTicksToSettle();
  const again2 = rowsOf(H2, [1, 2], 60);
  const al2 = alignRows(first2, again2);
  const ok = landed.state === 'AIM' && al.ok && first.every((r) => [1, 2, 3].every((j) => r[j][0] === true && r[j][4] !== null)) && JSON.stringify(ledgerFirst) === JSON.stringify(ledgerAgain)
    && landed2.state === 'AIM' && al2.ok && first2.every((r) => r[1][0] === true && r[1][4] === 'roll' || r[1][4] === 'rest');
  check(`L38 a record joined at or after its settle clock (the AIM revert at Q clock ${landed.clock}; the held fetch released after B settled, at ${landed2.clock}) replays with every carried ball continuing from where the first playback drew it: 90 + 60 rows aligned on the return clock bit for bit (mismatch ${al.at} / ${al2.at}), the ledger unchanged by the replay (${ledgerAgain.length} balls) — 22c ledgered them at their END stations`,
    ok, JSON.stringify({ landed, al, first0: first[0], again0: again[al.idx ?? 0], ledgerFirst, ledgerAgain, landed2, al2, first2_0: first2[0], again2_0: again2[al2.idx ?? 0] }));
}
{
  // L39 (D2, P1): the SAME record object re-entering PLAYBACK (a replay) while the activation is pending is a PLAYBACK the hook
  // missed just the same: the memo's session restored at the landing must switch base (the record's clock is BEHIND the memo's last
  // posed record clock — a re-entry, not the same PLAYBACK run on) and resume from the record's snapshot at its origin. 22c required
  // `game.record !== recordRef`: the carried ball was hidden for the whole replay and popped in at its seat at the settle.
  const F = heldFetch(); const T = mkTableShim('wpa_generic_9ft'); const H = await boot({ tableModule: T.shim, fetchImpl: F.fetchImpl });
  H.shoot(new Map([[2, legacyEntry(0.6, 4)]]), 1.4, 'A0'); H.runTicksToSettle();
  for (let k = 0; k < 400 && H.ctl.poseAt(2, H.ctl.clock().t)?.kind !== 'roll'; k++) H.tick();
  H.shoot(new Map([[1, legacyEntry(0.6, 4)]]), 2.4, 'A');                               // A's first playback: ball 2 rolls on from A clock 0
  const firstA = []; for (let k = 0; k < 60; k++) { H.tick(); firstA.push([+H.game.clock.toFixed(4), ...(() => { const q = H.posOf(2); return [q.vis, q.marker, +q.x.toFixed(9), +q.z.toFixed(9)]; })()]); }
  H.runTicksToSettle();
  T.switchTo('chinese8_pro_9ft'); await H.settleActivation(); F.hold(); T.switchTo('wpa_generic_9ft'); H.tick();
  const pendingBefore = H.ctl.reason === 'pending';
  H.replay(); for (let k = 0; k < 12; k++) H.tick();                                   // A re-enters PLAYBACK while the track is pending
  const pendingInReplay = H.ctl.reason === 'pending' && H.machine.state === 'PLAYBACK';
  F.release(); await H.settleActivation();
  const landed = { state: H.machine.state, clock: +H.game.clock.toFixed(4), sameRecord: H.game.record?.key === 'A' };
  const again = []; let hidden = 0; for (let k = 0; k < 60; k++) { H.tick(); if (H.machine.state !== 'PLAYBACK') break; const q = H.posOf(2); const row = [+H.game.clock.toFixed(4), q.vis, q.marker, +q.x.toFixed(9), +q.z.toFixed(9)]; again.push(row); if (!q.vis) hidden++; }
  const idx = firstA.findIndex((r) => Math.abs(r[0] - again[0][0]) < 1e-6);
  const overlap = idx >= 0 ? Math.min(again.length, firstA.length - idx) : 0;             // A's first playback was recorded for 60 frames from clock 0
  let mm = -1; for (let i = 0; i < overlap; i++) if (JSON.stringify(firstA[idx + i]) !== JSON.stringify(again[i])) { mm = i; break; }
  const ok = pendingBefore && pendingInReplay && landed.state === 'PLAYBACK' && landed.sameRecord && idx >= 0 && mm === -1 && hidden === 0 && overlap >= 40;
  check(`L39 the same record REPLAYED while the activation is pending (A re-entered at clock ${landed.clock} with the track pending): the landing switches base as the hook would have and resumes from A's snapshot — ${overlap} replay frames equal A's first playback frame for frame (mismatch ${mm}), ${hidden} hidden frames — 22c hid the carried ball for the whole replay`,
    ok, JSON.stringify({ pendingBefore, pendingInReplay, landed, idx, overlap, mm, hidden, firstAtLanding: firstA[idx], againAtLanding: again[0] }));
}
{
  // L40 (D3, P2): a carried ball REVIVED while the track was away (respot / ball in hand on the previewed bed) and potted AGAIN in the
  // new record before the landing: the new record's own hand-off is the truth and the previous record's roll is stale. 22c carried the
  // stale roll and skipped the record's own hand-off — the ball was drawn by nobody until the settle. Late (the fetch held past the
  // re-pot) against a control (the track active throughout): the same arrivals, the same frames.
  const run = async (late) => {
    const F = heldFetch(); const T = mkTableShim('wpa_generic_9ft'); const H = await boot({ tableModule: T.shim, fetchImpl: F.fetchImpl });
    H.shoot(new Map([[1, legacyEntry(0.6, 4)]]), 2.0, 'A'); H.runTicksToSettle();
    for (let k = 0; k < 400 && H.ctl.poseAt(1, H.ctl.clock().t)?.kind !== 'roll'; k++) H.tick();
    if (late) { T.switchTo('chinese8_pro_9ft'); await H.settleActivation(); F.hold(); T.switchTo('wpa_generic_9ft'); H.tick(); }
    // revived: back on the table (ball in hand), the module's posed flag cleared as game.js does on a respot
    H.balls[1].pocketed = false; H.balls[1].mesh.visible = true; H.balls[1].mesh.position.set(0.3, 0, 0.3); H.balls[1].mesh.userData.obReturnPosed = false;
    if (!late) { H.tick(); H.tick(); }
    H.shoot(new Map([[1, legacyEntry(0.5, 4)]]), 3.0, 'B');                              // potted again in B
    for (let k = 0; k < 60; k++) H.tick();                                                // B clock 1.0: the sink's TTL over, ball 1 pocketed again
    if (late) { F.release(); await H.settleActivation(); }
    const landed = { state: H.machine.state, clock: +H.game.clock.toFixed(4), pocketed: H.balls[1].pocketed };
    const rows = []; for (let k = 0; k < (late ? 30 : 40); k++) { H.tick(); const q = H.posOf(1); const p = H.ctl.poseAt(1, H.game.clock); rows.push([+H.game.clock.toFixed(4), q.vis, q.marker, +q.x.toFixed(9), +q.z.toFixed(9), p ? p.kind : null]); }
    return { landed, arrivals: H.ctl.ownership().arrivals.map((a) => a.id), rows };
  };
  const late = await run(true), control = await run(false);
  const idx = control.rows.findIndex((r) => Math.abs(r[0] - late.rows[0][0]) < 1e-6); // the late landing is resolved by settleActivation's one tick: align on the record clock
  let mm = -1; for (let i = 0; i < late.rows.length; i++) if (!control.rows[idx + i] || JSON.stringify(late.rows[i]) !== JSON.stringify(control.rows[idx + i])) { mm = i; break; }
  const ok = late.landed.state === 'PLAYBACK' && late.landed.pocketed && late.arrivals.includes(1) && control.arrivals.includes(1) && idx >= 0 && mm === -1 && late.rows.some((r) => r[1] === true && r[5] === 'roll');
  check(`L40 a carried ball revived while the track was away and potted again in the new record (the landing at B clock ${late.landed.clock}): B's own hand-off is used (arrivals ${JSON.stringify(late.arrivals)} = the control's ${JSON.stringify(control.arrivals)}), ${late.rows.length} frames equal the control's (mismatch ${mm}) — 22c carried the stale roll and drew nothing until the settle`,
    ok, JSON.stringify({ late: { landed: late.landed, arrivals: late.arrivals, row0: late.rows[0], row5: late.rows[5] }, control: { arrivals: control.arrivals, rowAligned: control.rows[idx] }, idx, mm }));
}
{
  // L41 (D4, P3): a memo restore that lands INSIDE a Playback borrow (the archive's bed) gets the hook's bookkeeping too. 22c exempted
  // a borrow (`!borrow`): the borrowed session's base was switched with origin 0 by ensureSolution instead, and the borrowed ball jumped
  // 154.4 mm at its first drawn frame; without the guard 3.3 mm (one frame of its own roll). Harness-admitted (the app's cross-equipment
  // open re-racks); the live session is handed back unchanged either way.
  const T = mkTableShim('wpa_generic_9ft'); const H = await boot({ tableModule: T.shim });
  H.shoot(new Map([[1, legacyEntry(0.6, 4)], [2, legacyEntry(1.1, 4)]]), 1.4, 'S1'); H.runTicksToSettle();
  for (let k = 0; k < 20; k++) H.tick();
  const liveSol = H.ctl.solution();
  H.dvrOpen(new Map([[5, legacyEntry(0.6, 4)]]), 3.0, [0, 3, 4, 5, 6, 7, 8, 9], 'X');
  while (H.game.clock < 1.2) H.tick();
  const memoPos = H.posOf(5);
  T.switchTo('chinese8_pro_9ft'); await H.settleActivation();                             // the memo is the DVR session
  H.quietLoad(new Map([[6, legacyEntry(0.6, 4)]]), 3.0, [0, 3, 4, 6, 7, 8, 9], 'Y');       // a quiet walk to archive Y while away
  while (H.game.clock < 0.5) H.tick();
  T.switchTo('wpa_generic_9ft'); await H.settleActivation();
  H.tick();
  const back = { borrowed: H.ctl.borrowed(), clock: +H.game.clock.toFixed(4), b5: H.posOf(5), kind: H.ctl.poseAt(5, H.game.clock)?.kind };
  const jump = Math.hypot(back.b5.x - memoPos.x, back.b5.y - memoPos.y, back.b5.z - memoPos.z);
  H.runTicksToSettle(); H.closeV2(); for (let k = 0; k < 3; k++) H.tick();
  const closed = { same: H.ctl.solution() === liveSol, borrowed: H.ctl.borrowed() };
  const ok = back.borrowed === true && back.b5.vis === true && jump < 0.01 && closed.same && closed.borrowed === false;
  check(`L41 a memo restore landing inside a Playback borrow (Y clock ${back.clock}) does the hook's bookkeeping: the borrowed ball moves ${(jump * 1000).toFixed(1)} mm at its first drawn frame (22c's guard: 154.4 mm), the live session handed back unchanged at the close`,
    ok, JSON.stringify({ memoPos: [+memoPos.x.toFixed(4), +memoPos.z.toFixed(4)], back: { ...back, b5: [+back.b5.x.toFixed(4), +back.b5.z.toFixed(4), back.b5.vis] }, jumpMm: +(jump * 1000).toFixed(1), closed }));
}

// ---- L42 (order 23b, the round-2 ruling): V19, the DESIGN gate, in the controller. TEST-hairpin-170 (a 170° hairpin whose two-ball
// drop from pocket 4 rests wedged 'mutual' across the vertex) is REFUSED at declaration — nothing enabled, the reason names [V19], the
// seed and the hold, the facade's `design` carries the read (offenders, solves, the gate's wall-clock); the shipped wire slide passes the
// same gate (design.evaluated, no offender) and enables as before. Refuter B's F5 read the same jam class from six arrivals on the y3 seam.
{
  const Hh = await boot({ track: 'TEST-hairpin-170', host: 'owner', expectEnabled: false });
  const d = Hh.ctl.design;
  const off = d && d.offenders ? d.offenders.find((x) => /pocket 4, 2 balls 0\.03 s apart/.test(x.seed)) ?? null : null;
  const okH = Hh.ctl.enabled === false && /\[V19\]/.test(Hh.ctl.reason ?? '') && /mutual/.test(Hh.ctl.reason ?? '') && !!d && d.evaluated === true && d.refused === true && !!off && off.heldBy === 'mutual';
  const Hw = await boot({ track: 'TEST-synthetic-wire-slide', host: 'owner' });
  const dw = Hw.ctl.design;
  const okW = Hw.ctl.enabled === true && !!dw && dw.evaluated === true && dw.refused === false && dw.offenders.length === 0 && dw.solves > 0;
  check(`L42 V19 the design gate in the controller (order 23b ruling): TEST-hairpin-170 refused at declaration — enabled ${Hh.ctl.enabled}, reason ${(Hh.ctl.reason ?? '').slice(0, 150)}…, offenders ${d ? d.offenders.length : 'n/a'} (the two-ball drop from pocket 4 → '${off ? off.heldBy : '—'}'), ${d ? d.solves : '—'} solves in ${d && Number.isFinite(d.ms) ? d.ms.toFixed(0) : '—'} ms; the wire slide passes — enabled ${Hw.ctl.enabled}, ${dw ? dw.solves : '—'} solves, ${dw ? dw.offenders.length : '—'} offenders, ${dw && Number.isFinite(dw.ms) ? dw.ms.toFixed(0) : '—'} ms`,
    okH && okW, JSON.stringify({ H: { enabled: Hh.ctl.enabled, reason: (Hh.ctl.reason ?? '').slice(0, 200), off }, W: { enabled: Hw.ctl.enabled, reason: (Hw.ctl.reason ?? '').slice(0, 120), dw: dw && { solves: dw.solves, offenders: dw.offenders.length } } }));
}

// ---- L43 (#737 review round 2, class A): the session snapshot carries OWNERSHIP. TEST-terminal-chutes-high, eight pivot pots
// 60 ms apart into the two chutes on the owner host; the record paused at a playback instant T with balls held / owned; a table
// PREVIEW elsewhere (the memo) and the revert onto the same rack (the restore). Every ball's pose at T after the round trip must be
// the pose before it, byte for byte (position, visibility, the module's own poseAt), and ballReturnOwns must answer the same. Before
// the fix the stash kept solutionKey but not ownMap: the restore skipped the ownership pass, ballReturnOwns() read an empty map and
// the host resumed sinking a held ball (≈ 15 mm off at the same T).
{
  const T8 = mkTableShim('wpa_generic_9ft', { wpa_generic_9ft: 'TEST-terminal-chutes-high' });
  const H = await boot({ track: 'TEST-terminal-chutes-high', host: 'owner', tableModule: T8.shim });
  const sinks = new Map(); for (let i = 1; i <= 8; i++) sinks.set(i, pivotEntry(0.40 + 0.06 * (i - 1), i % 2 ? 4 : 1));
  H.shoot(sinks, 3.0, 'E8');
  const T = 1.20; H.frame(T);
  const snap = (label) => { const rows = {}; for (let i = 1; i <= 8; i++) { const s = sinks.get(i); rows[i] = { ...H.posOf(i), owns: typeof H.game.ballReturnOwns === 'function' ? H.game.ballReturnOwns(i, T - s.t) : null, p: H.ctl.poseAt(i, T) }; } return { label, state: H.machine.state, enabled: H.ctl.enabled, owned: H.ctl.ownership().owned.length, rows }; };
  const before = snap('before');
  T8.switchTo('chinese8_pro_9ft'); await H.settleActivation();                     // the preview elsewhere: the live session memoised
  const away = { enabled: H.ctl.enabled, trackId: H.ctl.trackId };
  T8.switchTo('wpa_generic_9ft'); await H.settleActivation();                      // the revert onto the SAME rack: the memo restored
  H.frame(T);
  const after = snap('after');
  const diffs = []; for (let i = 1; i <= 8; i++) { const a = before.rows[i], b = after.rows[i]; const dmm = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) * 1e3; if (dmm > 0 || a.vis !== b.vis || a.owns !== b.owns || JSON.stringify(a.p) !== JSON.stringify(b.p)) diffs.push({ id: i, dmm: +dmm.toFixed(3), vis: [a.vis, b.vis], owns: [a.owns, b.owns], pSame: JSON.stringify(a.p) === JSON.stringify(b.p) }); }
  const ok = before.enabled === true && after.enabled === true && away.trackId !== 'TEST-terminal-chutes-high' && before.owned > 0 && after.owned === before.owned && diffs.length === 0;
  check(`L43 ownership survives the preview → revert round trip (#737 r2 class A): eight pivot pots on the high fixture, paused at T ${T}; ${before.owned} owned hand-offs before, ${after.owned} after; ${diffs.length} balls differ after the round trip${diffs.length ? ' — ' + diffs.map((d) => `ball ${d.id} ${d.dmm} mm vis ${d.vis} owns ${d.owns}`).join('; ') : ' (byte-identical poses, the same ballReturnOwns answers)'}; away on ${away.trackId ?? 'none'} (enabled ${away.enabled})`,
    ok, JSON.stringify({ before: { owned: before.owned, r8: before.rows[8] }, after: { owned: after.owned, r8: after.rows[8] }, diffs, away }));
}

// ---- L44 (#737 review round 2, class C): the incoming ORIENTATION is carried through an early hand-off and a HOLD; the reset to
// the rack base happens only where the ball is hidden. TEST-terminal-chutes-high with L31's flow (eight pivot pots one second apart
// into pocket 4; seven queue from the stop and the eighth finds no seat) with a 90° incoming orientation (q0 = 90° about y at the
// sink entry), owner host: ball 8 is HELD
// at its own pose — above the shield line, drawn through the opening from the own instant on. For every ball whose first drawn pose is
// above the shield: the angular step from the host's last drawn sink pose to the module's first drawn pose ≤ 0.5°; the hold's
// orientation constant frame to frame; and the fall → roll boundary continuous (≤ 0.5° across the landing instant). A ball first
// drawn BELOW the shield was hidden on the way in — its rack-base reset is the spec's, stated and excluded. Before the fix the first
// drawn pose of a held ball was the identity: a 90° snap while the ball was visible.
{
  const q90 = [0, Math.sin(Math.PI / 4), 0, Math.cos(Math.PI / 4)];
  const SHIELD_Y = -0.055; // SINK_SHIELD_Y (kinematics.js — the mirror of sinkpivot.js's cull line)
  const pivotEntryQ = (t, pocketIdx, q0) => { const P = POCKETS[pocketIdx]; const pivot = buildSinkPivot({ x0: P.x, z0: P.z - 0.03, vx: 0, vz: 1.2, wx: 0, wy: 0, wz: 0, q0, px: P.x, pz: P.z, pr: P.r, r: R, falls: null }); return { t, pocket: P, fall: P, r: R, pivot }; };
  const angle = (a, b) => { if (!a || !b) return NaN; const d = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]); return 2 * Math.acos(Math.min(1, d)) * 180 / Math.PI; };
  const qOf = (p) => (p ? [p.qx, p.qy, p.qz, p.qw] : null);
  const T8 = mkTableShim('wpa_generic_9ft', { wpa_generic_9ft: 'TEST-terminal-chutes-high' });
  const H = await boot({ track: 'TEST-terminal-chutes-high', host: 'owner', tableModule: T8.shim });
  const sinks = new Map(); for (let i = 1; i <= 8; i++) sinks.set(i, pivotEntryQ(0.5 + (i - 1) * 1.0, 4, q90)); // L31's flow: the queue reaches the stop, ball 8 is HELD
  H.shoot(sinks, 9.0, 'E8Q'); H.frame(0.5);
  const owned = H.ctl.ownership().owned; const hos = H.ctl.handoffs();
  const evKinds = H.ctl.events().reduce((m, e) => { m[e.kind] = (m[e.kind] ?? 0) + 1; return m; }, {});
  const rows = []; let worst = { deg: 0 }; let above = 0, below = 0, held = 0;
  for (const o of owned) {
    const s = sinks.get(o.id); const h = hos.find((x) => x.id === o.id); if (!s || !h) continue;
    const tOwn = s.t + o.dtOwn;
    const qHost = qOf(poseInSink(s.pivot, Math.max(0, o.dtOwn - 1e-4), {}));            // the host's last drawn sink pose before the hand-off
    let tFirst = null, pFirst = null; for (let t = tOwn + 1e-4; t <= tOwn + 0.6; t += 1e-3) { const p = H.ctl.poseAt(o.id, t); if (p) { tFirst = t; pFirst = p; break; } }
    if (!qHost || !pFirst) continue;
    const aboveShield = pFirst.y + R > SHIELD_Y; if (aboveShield) above += 1; else below += 1;
    const isHold = pFirst.kind === 'hold'; if (isHold) held += 1;
    const stepIn = aboveShield ? angle(qHost, qOf(pFirst)) : 0;                            // the class: visible at the first drawn pose
    // the hold / fall: the orientation constant frame to frame while the ball is drawn before its landing
    let stepFall = 0, prev = qOf(pFirst); const tLand = Number.isFinite(h.tLand) ? h.tLand : null;
    for (let t = tFirst + DT; t <= tFirst + 0.5; t += DT) { const p = H.ctl.poseAt(o.id, t); if (!p || p.kind === 'roll' || p.kind === 'rest') break; const q = qOf(p); stepFall = Math.max(stepFall, angle(prev, q)); prev = q; }
    // the landing: the fall → roll boundary continuous (the roll starts from the orientation the fall ended with)
    let stepLand = 0; if (tLand !== null) { const a = H.ctl.poseAt(o.id, tLand - 1e-4), b = H.ctl.poseAt(o.id, tLand + 1e-4); if (a && b) stepLand = angle(qOf(a), qOf(b)); }
    const ok = stepIn <= 0.5 && stepFall <= 0.5 && stepLand <= 0.5;
    const w = Math.max(stepIn, stepFall, stepLand); if (w > worst.deg) worst = { deg: +w.toFixed(2), id: o.id };
    rows.push({ id: o.id, dtOwn: +o.dtOwn.toFixed(4), gapMs: +((tFirst - tOwn) * 1e3).toFixed(1), first: pFirst.kind, firstTopMm: +((pFirst.y + R) * 1e3).toFixed(1), aboveShield, stepIn: +stepIn.toFixed(2), stepFall: +stepFall.toFixed(2), stepLand: +stepLand.toFixed(2), ok });
  }
  const ok = above >= 1 && held >= 1 && rows.every((r) => r.ok);
  check(`L44 the incoming orientation carried through an early own and a hold (#737 r2 class C): L31's eight pivot pots (1.0 s apart, pocket 4) with a 90° incoming orientation on the high fixture — ${owned.length} owned, ${above} first drawn ABOVE the shield (${held} held at the own pose), ${below} below (hidden on the way in: the rack-base reset is the spec's); events ${JSON.stringify(evKinds)}; worst step ${worst.deg}° (ball ${worst.id ?? '—'}; bound 0.5°; before the fix 90.00° at a held ball's first drawn pose) — ${rows.map((r) => `ball ${r.id}: first drawn '${r.first}' ${r.gapMs} ms after the own, top ${r.firstTopMm} mm (${r.aboveShield ? 'above' : 'below'}), in ${r.stepIn}°, hold/fall ${r.stepFall}°, landing ${r.stepLand}°`).join('; ')}`,
    ok, JSON.stringify({ owned: owned.length, above, below, held, evKinds, rows }));
}

// ---- L45 (#737 review round 3, class A): an EARLY ownership over a FREE entry seat must SCHEDULE the remaining fall, not activate
// the ball at the seat. The xw101 slides on the snooker bed, four pivot pots 30 ms apart into pocket 4 at 2.4 m/s, owner host: the
// arrivals are owned (the queue takes them from game.js) while the entry seat is still free, and each one is left standing at the
// pose the sink had reached — above the shield, with vDown 0 — so the fall to the entry from THAT height ends later than the
// hand-off's booked landing. For every OWNED ball the takeover must be continuous: the module's PHYSICAL pose just after the own
// instant within that ball's own per-frame ROLL step of the host's last drawn sink pose, and any consecutive DRAWN frame across
// the host → module handover within the same bound. Before the fix the free-entry branch activated the ball AT the entry at the
// own instant: physical steps of 82.41 / 53.31 / 77.24 mm against a 22.10 mm roll step, and ball 2 moved 87.0 mm in ONE drawn
// frame (host sink → module roll, both poses visible).
{
  const { poseAt: kPose } = await import('../scene/ballreturn/kinematics.js');
  const SNK = await tableContext('wpbsa_snooker_12ft');
  const RS = 0.02625;                                     // the snooker ball this track is built for
  const entryS = (t, pocketIdx, vz) => { const P = SNK.pockets[pocketIdx]; const pivot = buildSinkPivot({ x0: P.x, z0: P.z - 0.03, vx: 0, vz, wx: 0, wy: 0, wz: 0, q0: [0, 0, 0, 1], px: P.x, pz: P.z, pr: P.r, r: RS, falls: null }); return { t, pocket: P, fall: P, r: RS, pivot }; };
  const T = mkTableShim('wpbsa_snooker_12ft');
  const H = await boot({ track: 'wpbsa_snooker_12ft-xw101-slides', host: 'owner', templateR: RS, tableModule: T.shim });
  const IDS = [1, 2, 3, 4];
  const sinks = new Map(); for (const i of IDS) sinks.set(i, entryS(0.5 + 0.03 * (i - 1), 4, 2.4));
  H.shoot(sinks, 4.0, 'A4');
  // the DRAWN sequence, per frame: the host's sink pose while game.js owns the ball, the module's pose once it does. A frame with
  // neither is a HIDDEN frame (a pose between the exit line and the shield is culled) — steps are read across consecutive frames only.
  const drawn = new Map(IDS.map((id) => [id, []]));
  let frame = 0, ownPB = null, solPB = null;
  for (let k = 0; k < 4000 && H.machine.state === 'PLAYBACK'; k++) {
    H.tick(); frame += 1; const t = H.ctl.clock().t;
    for (const id of IDS) {
      const p = H.ctl.poseAt(id, t);
      if (p) { drawn.get(id).push([frame, p.x, p.y, p.z, 'mod', p.kind]); continue; }
      const sd = H.sinkDrawn.get(id);
      if (sd && Math.abs(sd.t - t) < 1e-9) drawn.get(id).push([frame, sd.x, sd.y, sd.z, 'host', 'sink']);
    }
    if (!ownPB) { const o = H.ctl.ownership(); if (o && o.owned.length) ownPB = o; }
    if (H.machine.state === 'PLAYBACK') solPB = H.ctl.solution() ?? solPB; // the settle's re-solve is a NEW base: its times are not tOwn's
  }
  const rows = [];
  for (const id of IDS) {
    const o = ownPB?.owned.find((x) => x.id === id); if (!o) continue;   // the OWNED arrivals only (ball 1 hands off at the crossing)
    const tr = drawn.get(id); const s = sinks.get(id);
    let rollStep = 0, handover = null;
    for (let i = 1; i < tr.length; i++) {
      const consecutive = tr[i][0] === tr[i - 1][0] + 1;
      if (!consecutive) continue;
      const d = Math.hypot(tr[i][1] - tr[i - 1][1], tr[i][2] - tr[i - 1][2], tr[i][3] - tr[i - 1][3]);
      if (tr[i][5] === 'roll' && tr[i - 1][5] === 'roll') rollStep = Math.max(rollStep, d);
      if (handover === null && tr[i - 1][4] === 'host' && tr[i][4] === 'mod') handover = { mm: d * 1e3, kinds: `${tr[i - 1][5]}>${tr[i][5]}` };
    }
    const tOwn = s.t + o.dtOwn;
    const hp = poseInSink(s.pivot, Math.max(0, o.dtOwn - 1e-4), {});                 // the host's last drawn sink pose
    const mp = solPB ? kPose(solPB, id, tOwn + 1e-4, {}, true) : null;               // the module's PHYSICAL pose just after the own
    const physMm = hp && mp ? Math.hypot(hp.x - mp.x, hp.y - mp.y, hp.z - mp.z) * 1e3 : null;
    const boundMm = rollStep * 1e3;
    rows.push({ id, tOwn: +tOwn.toFixed(4), physMm: physMm === null ? null : +physMm.toFixed(2), handoverMm: handover ? +handover.mm.toFixed(2) : null, kinds: handover?.kinds ?? null, rollMm: +boundMm.toFixed(2),
      ok: physMm !== null && boundMm > 0 && physMm <= boundMm && (handover === null || handover.mm <= boundMm) });
  }
  const ok = rows.length >= 3 && rows.every((r) => r.ok);
  check(`L45 an early own over a free seat schedules the remaining fall (#737 r3 class A): four pivot pots 30 ms apart at 2.4 m/s into pocket 4 of the xw101 slides, ${ownPB?.owned.length ?? 0} owned — ${rows.map((r) => `ball ${r.id} own ${r.tOwn} s: physical takeover ${r.physMm} mm, drawn handover ${r.handoverMm === null ? 'hidden' : `${r.handoverMm} mm (${r.kinds})`}, bound = its roll step ${r.rollMm} mm`).join('; ')} — before the fix 82.41 / 53.31 / 77.24 mm physical against a 22.10 mm roll step, ball 2 jumping 87.0 mm in one drawn frame (sink>roll)`,
    ok, JSON.stringify({ owned: ownPB?.owned.length ?? 0, rows }));
}

// ---- L46 (#737 review round 3, class B): a HOLD is a ball — it must clear every ball the solution draws or holds. TEST-terminal-chutes-high,
// eleven pots one second apart into pocket 4 on the owner host: the queue reaches the sink's own initial pose, so an arrival owned at
// dt = 0 would be held exactly where a held ball already stands. The hold's clearance is validated against every held / seated ball
// (one diameter, to EXPORT_GRAIN — the exporter's own 0.1 mm vertex rounding); a hold with no room is REFUSED by name. And the refusal
// is STATE: carried across the settle's base switch, so the same record re-solves to the same pair. Before the fix balls 10 and 11 were
// drawn at identical coordinates (0.0 mm apart, 10 already inside 9) with no refusal in the log, and the settle's re-solve — which
// re-offered a refused ball as a fresh arrival — held a DIFFERENT pair (8 + 9 live, 10 + 11 after the settle).
{
  const N = 11;
  const H = await boot({ track: 'TEST-terminal-chutes-high', host: 'owner', nBalls: N + 2 });
  const IDS = Array.from({ length: N }, (_, i) => i + 1);
  const sinks = new Map(); for (const i of IDS) sinks.set(i, pivotEntry(0.5 + (i - 1) * 1.0, 4));
  H.shoot(sinks, N + 1.5, 'B11');
  const evs = []; H.ctl.onEvent((e) => evs.push(e));
  let solPB = null, seen = null; const solves = []; const solObjs = [];
  for (let k = 0; k < 6000 && H.machine.state === 'PLAYBACK'; k++) {
    H.tick(); const s1 = H.ctl.solution(); if (s1) solPB = s1;
    if (s1 && s1 !== seen) { seen = s1; solObjs.push(s1); solves.push({ at: +H.ctl.clock().t.toFixed(3), holds: (s1.events ?? []).filter((e) => e.kind === 'hold').map((e) => e.ball).sort((a, b) => a - b), rej: [...(s1.rejected ?? [])].sort((a, b) => a - b) }); }
  }
  const tEnd = H.ctl.clock().t;
  const sol = H.ctl.solution();                                     // after the settle: the same record, re-solved on a new base
  const vis = IDS.map((id) => ({ id, p: H.ctl.poseAt(id, tEnd) })).filter((r) => r.p);
  let worst = { mm: Infinity, pair: null };
  for (let i = 0; i < vis.length; i++) for (let j = i + 1; j < vis.length; j++) { const a = vis[i].p, b = vis[j].p; const d = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) * 1e3; if (d < worst.mm) worst = { mm: d, pair: [vis[i].id, vis[j].id] }; }
  // the refusal is named in the solve that DECIDED it; the settle's re-solve carries it as state and re-emits nothing (that carry IS the class)
  const refusals = [...new Set(solObjs.concat(sol ? [sol] : []).flatMap((s1) => s1.events ?? []).concat(evs).filter((e) => e.kind === 'overflow' && /no clear hold/.test(e.reason ?? '')).map((e) => `${e.ball}: ${(e.reason ?? '').slice(0, 64)}`))];
  const live = solves[solves.length - 1] ?? { holds: [], rej: [] };
  const after = { holds: (sol?.events ?? []).filter((e) => e.kind === 'hold').map((e) => e.ball).sort((a, b) => a - b), rej: [...(sol?.rejected ?? [])].sort((a, b) => a - b) };
  const twoRmm = 2 * R * 1e3;
  const clear = vis.length >= 2 && worst.mm >= twoRmm - 0.1;         // EXPORT_GRAIN: the grain the geometry is quantised at
  const stable = JSON.stringify([live.holds, live.rej]) === JSON.stringify([after.holds, after.rej]);
  const ok = clear && refusals.length >= 1 && stable;
  check(`L46 a hold must clear every ball it stands among, and its refusal is carried (#737 r3 class B): eleven pots into pocket 4 on the high fixture — ${vis.length} balls drawn at ${tEnd.toFixed(2)} s, closest pair ${worst.mm === Infinity ? 'n/a' : worst.mm.toFixed(2)} mm (balls ${worst.pair?.join(' + ') ?? '—'}; bound one diameter ${twoRmm.toFixed(2)} mm less the 0.1 mm export grain), ${refusals.length} named refusal${refusals.length === 1 ? '' : 's'} [${refusals.join('; ')}], and the settle's re-solve holds the same pair (live holds ${live.holds.join(',')} / rejects ${live.rej.join(',')} — after ${after.holds.join(',')} / ${after.rej.join(',')}) — before the fix balls 10 and 11 were drawn 0.00 mm apart with no refusal, and the pair flipped at the settle`,
    ok, JSON.stringify({ drawn: vis.map((r) => r.id), minPairMm: worst.mm === Infinity ? null : +worst.mm.toFixed(2), pair: worst.pair, twoRmm: +twoRmm.toFixed(2), refusals, live, after, solves: solves.slice(-3) }));
}

// ---- L47 (#737 review round 3, class C): the ARCHIVE-RACK boundary reads the ball radius like a table change. playback.js swaps the
// rack before the PLAYBACK emission and checkTable never reads a radius inside PLAYBACK, so an archived record of ANOTHER ballset on
// the SAME table ran on the live activation: a 26.25 mm snooker ball posed on a track built for 28.575 mm, V8 bypassed because
// stationAt takes the reference-radius path. The boundary now re-reads it (both doors: with and without playback.js's quiet rerack)
// and V8 refuses by name; a SAME-radius archive keeps the live activation untouched (one activation, not two); and the live session
// is handed back bit for bit at the close either way. Before the fix all three archives ran enabled, ball 5 posed rolling at
// x −191.5 mm — 3.1 mm off the pose its own ballset gives (−188.4 mm).
{
  const runArchive = async (archiveR, swap) => {
    const T = mkTableShim('wpa_generic_9ft');
    const H = await boot({ host: 'owner', tableModule: T.shim });
    H.shoot(new Map([[1, legacyEntry(1.0, 4)], [2, legacyEntry(1.4, 4)]]), 2.5, 'live1'); H.runTicksToSettle();
    for (let k = 0; k < 900 && [1, 2].some((id) => H.ctl.poseAt(id, H.ctl.clock().t)?.kind !== 'rest'); k++) H.tick();
    const sol = H.ctl.solution();
    const before = { enabled: H.ctl.enabled, p1: H.posOf(1), p2: H.posOf(2), rest: [...sol.rest].sort() };
    H.snapLive();
    if (swap) H.swapBedRack();                                       // playback.js swapBed: the archive's rack, quietly
    H.game.template.system.balls[0].params.r = archiveR;              // …of the archive's ballset
    H.dvrOpen(new Map([[5, legacyEntry(0.8, 4)]]), 2.0, [0, 2, 3, 4, 5, 6, 7, 8, 9], `archived-${archiveR}`, { snap: false });
    await H.settleActivation();
    const inArchive = { enabled: H.ctl.enabled, reason: (H.ctl.reason ?? '').slice(0, 120), activations: H.ctl.stats.activations };
    for (let k = 0; k < 80; k++) H.tick();
    H.frame(1.9); const posed5 = { marker: H.posOf(5).marker, xmm: +(H.posOf(5).x * 1e3).toFixed(1), kind: H.ctl.poseAt(5, 1.9)?.kind ?? null };
    H.game.template.system.balls[0].params.r = R;                     // the close: restoreRack rebuilds the LIVE rack
    H.closeV2({ rebuild: true }); await H.settleActivation();
    for (let k = 0; k < 5; k++) H.tick();
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const after = { enabled: H.ctl.enabled, sameSolution: H.ctl.solution() === sol, rest: [...(H.ctl.solution()?.rest ?? [])].sort() };
    return { inArchive, posed5, after, restored: same(before.p1, after.p1 ?? H.posOf(1)) && same(before.p2, H.posOf(2)) && same(before.rest, after.rest) };
  };
  const swapd = await runArchive(0.02625, true), plain = await runArchive(0.02625, false), sameR = await runArchive(R, false);
  const refused = (c) => c.inArchive.enabled === false && /V8/.test(c.inArchive.reason) && /26\.250 mm/.test(c.inArchive.reason) && c.inArchive.activations === 2 && c.posed5.marker === false && c.posed5.kind === null && c.restored === true && c.after.enabled === true && c.after.sameSolution === true;
  const ok = refused(swapd) && refused(plain) && sameR.inArchive.enabled === true && sameR.inArchive.activations === 1 && sameR.posed5.marker === true && sameR.posed5.kind === 'roll' && sameR.restored === true;
  check(`L47 the archive-rack boundary re-reads the ball radius (#737 r3 class C): a 26.25 mm archived record on the 28.575 mm track is refused — with playback.js's quiet rerack "${swapd.inArchive.reason}" (enabled ${swapd.inArchive.enabled}, ${swapd.inArchive.activations} activations, ball 5 posed ${swapd.posed5.kind ?? 'not at all'}), without it enabled ${plain.inArchive.enabled} — while a SAME-radius archive keeps the live activation (enabled ${sameR.inArchive.enabled}, ${sameR.inArchive.activations} activation, ball 5 '${sameR.posed5.kind}' at x ${sameR.posed5.xmm} mm) and all three hand the live session back bit for bit (restored ${swapd.restored}/${plain.restored}/${sameR.restored}, same solution object ${swapd.after.sameSolution}/${plain.after.sameSolution}/${sameR.after.sameSolution}) — before the fix all three ran enabled with ball 5 rolling at x −191.5 mm on the wrong ballset`,
    ok, JSON.stringify({ swapd, plain, sameR }));
}

// ---- L48 (#737 review round 3, class D): a CARRIED FALL is rebased onto the new base's ORIGIN, exactly like a carried roll. Record A
// pots ball 1; the fall is memoised MID-AIR by a table preview; the player then loads ARCHIVE record B (ball 1 is not in its rack, so
// it is off the table there) and B runs to 0.5 s while the return activation's track load is held by hand; the release lands the
// activation inside B's PLAYBACK, whose origin is therefore 0.5 s. The carried fall must resume with the SAME elapsed it had at the
// memo — a 0 mm step at the carry. Before the fix the shift subtracted the previous base's time alone and not the new origin: the
// fall was dated 0.011 s BEFORE record B begins, so at B's origin the ball had fast-forwarded through its whole fall and 0.44 s of
// roll — 160.03 mm away from where A left it, rolling instead of falling.
{
  const { poseAt: kPose } = await import('../scene/ballreturn/kinematics.js');
  const F = heldFetch();
  const T = mkTableShim('wpa_generic_9ft');
  const H = await boot({ tableModule: T.shim, fetchImpl: F.fetchImpl });
  H.shoot(new Map([[1, legacyEntry(0.6, 4)]]), 2.0, 'A');
  let h1 = null, inFall = false;
  for (let k = 0; k < 400 && !inFall; k++) { H.tick(); h1 = H.ctl.handoffs().find((h) => h.id === 1) ?? null; const t = H.ctl.clock().t; inFall = !!h1 && t > h1.tH + 0.004 && t < h1.tLand - 0.004; }
  const tMemo = H.ctl.clock().t; const solA = H.ctl.solution();
  const physA = kPose(solA, 1, tMemo, {}, true);                       // where record A left the ball, mid-fall
  const elapsedA = tMemo - h1.tH;
  T.switchTo('chinese8_pro_9ft'); await H.settleActivation();          // the preview memoises the live session MID-FALL
  F.hold(); T.switchTo('wpa_generic_9ft'); H.tick();                   // the return activation's track load is held by hand
  const pendingBefore = H.ctl.reason === 'pending';
  H.quietLoad(new Map([[2, legacyEntry(0.4, 4)]]), 3.0, [0, 2, 3, 4, 5, 6, 7, 8, 9], 'B'); // ARCHIVE record B: ball 1 is not in its rack
  for (let k = 0; k < 30; k++) H.tick();                               // B runs to exactly 0.5 s while the activation is pending
  const tB = +H.game.clock.toFixed(6);
  F.release();                                                         // released WITHOUT a tick: the landing clock is B's 0.5 s exactly
  for (let k = 0; k < 400 && H.ctl.reason === 'pending'; k++) await new Promise((r) => setTimeout(r, 2));
  const tCarry = +H.game.clock.toFixed(6);
  const landed = { enabled: H.ctl.enabled, state: H.machine.state, clock: tCarry };
  H.tick();                                                            // the first frame after the landing: the base switch + re-solve
  const solB = H.ctl.solution();
  const pieceB = (solB?.pieces.get(1) ?? []).map((p) => [p.kind, +p.t0.toFixed(4), +Number(p.t1).toFixed(4)]);
  const atCarry = solB ? kPose(solB, 1, tCarry, {}, true) : null;
  const carryMm = physA && atCarry ? Math.hypot(physA.x - atCarry.x, physA.y - atCarry.y, physA.z - atCarry.z) * 1e3 : null;
  const p0B = solB?.pieces.get(1)?.[0] ?? null;                        // unrounded: the printed piece list is to 4 decimals
  const elapsedB = p0B ? tCarry - p0B.t0 : null;
  const ok = pendingBefore && tB === 0.5 && landed.clock === 0.5 && landed.enabled === true && landed.state === 'PLAYBACK'
    && !!atCarry && atCarry.kind === 'fall' && carryMm !== null && carryMm <= 1e-6
    && elapsedB !== null && Math.abs(elapsedB - elapsedA) <= 1e-9 && !!p0B && p0B.kind === 'fall' && p0B.t0 >= 0;
  check(`L48 a carried fall resumes at the new base's origin (#737 r3 class D): ball 1's fall memoised at A ${tMemo.toFixed(6)} s (${(elapsedA * 1e3).toFixed(1)} ms in) and restored into archive record B already running at ${tCarry} s — the fall is re-dated to ${pieceB[0]?.[1]} s (inside B, not before it), the module's pose at B's origin is '${atCarry?.kind}' ${carryMm === null ? 'n/a' : carryMm.toFixed(3)} mm from where A left the ball, and its elapsed fall is ${elapsedB === null ? 'n/a' : (elapsedB * 1e3).toFixed(1)} ms against A's ${(elapsedA * 1e3).toFixed(1)} ms — before the fix the fall was dated −0.011 s (before B begins), the pose at the origin was 'roll' 160.03 mm away and 511 ms in`,
    ok, JSON.stringify({ pendingBefore, tB, landed, tMemo: +tMemo.toFixed(6), elapsedA: +elapsedA.toFixed(6), physA: physA && { k: physA.kind, x: +(physA.x * 1e3).toFixed(3), y: +(physA.y * 1e3).toFixed(3), z: +(physA.z * 1e3).toFixed(3) }, atCarry: atCarry && { k: atCarry.kind, x: +(atCarry.x * 1e3).toFixed(3), y: +(atCarry.y * 1e3).toFixed(3), z: +(atCarry.z * 1e3).toFixed(3) }, carryMm: carryMm === null ? null : +carryMm.toFixed(3), elapsedB: elapsedB === null ? null : +elapsedB.toFixed(6), pieceB: pieceB.slice(0, 3) }));
}

// ---- L49 (#737 review round 4, class A): a NEW record's own pot OUTRANKS every state carried from another record. Record A pots
// ball 1 into the UNSERVED corner (pocket 0: rejected, culled); record B is staged quietly inside A's playback and pots ball 1 into
// the served right middle (pocket 4) at 0.5 s. Sought straight to 2.0 s, B's first solve finds ball 1 already `pocketed` (past the
// sink TTL) and the pre-fix carry read A's rejection first: the ball B had itself potted into a served pocket was drawn nowhere,
// while a stepwise seek through 0.5 s (ball 1 not yet pocketed at B's first solve) showed it rolling on the slide. The two seek
// histories must give one pose — the scrub law (the ownership ledger) across the record boundary, not only inside a record.
{
  const run = async (direct) => {
    const H = await boot();
    H.shoot(new Map([[1, legacyEntry(0.3, 0)]]), 1.5, 'A');
    for (let k = 1; k * DT <= 1.0; k++) H.frame(k * DT);                              // A to 1.0 s: ball 1 potted unserved, rejected
    const rejA = H.ctl.solution()?.rejected?.has(1) === true;
    H.quietLoad(new Map([[1, legacyEntry(0.5, 4)]]), 2.5, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 'B'); // B: ball 1 on the table again, potted SERVED at 0.5 s
    if (!direct) for (let k = 1; k < 120; k++) H.frame(k * DT);                        // through the pot, frame by frame…
    H.frame(2.0);                                                                       // …or straight to 2.0 s (1.5 s past the pot, 1.05 s past the TTL)
    const q = H.posOf(1); const p = H.ctl.poseAt(1, 2.0);
    return { rejA, rejB: H.ctl.solution()?.rejected?.has(1) === true, vis: q.vis, marker: q.marker, kind: p?.kind ?? null, x: +(q.x * 1e3).toFixed(3), y: +(q.y * 1e3).toFixed(3), z: +(q.z * 1e3).toFixed(3) };
  };
  const D = await run(true), S = await run(false);
  const mm = Math.hypot(D.x - S.x, D.y - S.y, D.z - S.z);
  const ok = D.rejA && S.rejA && D.rejB === false && S.rejB === false && D.vis === true && S.vis === true && D.marker === true && S.marker === true
    && D.kind !== null && D.kind === S.kind && mm <= 1e-6;
  check(`L49 a new record's own pot outranks the carried rejection (#737 r4 class A): A pots ball 1 unserved (rejected ${D.rejA}/${S.rejA}), quiet record B pots it served at 0.5 s — sought straight to 2.0 s the ball is ${D.vis && D.marker ? `drawn '${D.kind}'` : 'NOT drawn'} at (${D.x}, ${D.y}, ${D.z}) mm, sought frame by frame ${S.vis && S.marker ? `drawn '${S.kind}'` : 'NOT drawn'} at (${S.x}, ${S.y}, ${S.z}) mm — ${mm.toFixed(3)} mm apart, B's rejected has ball 1: ${D.rejB}/${S.rejB} — before the fix the direct seek drew nothing (A's rejection carried into B) while the stepwise seek showed the ball rolling`,
    ok, JSON.stringify({ D, S, mm: +mm.toFixed(3) }));
}

// ---- L50 (#737 review round 4, class B): the archive-rack radius is read on the boundary WHATEVER the activation's state. (a) the wpa
// activation is PENDING with V8 already read for the live 28.575 mm rack (its hardware companion's fetch held by hand — the request
// after V8); the player opens a 26.25 mm archive on the same bed; the fetch is released inside the archive. The pre-fix hook returned
// at `!track` before the radius read, and the pending activation committed its 28.575 mm track under the 26.25 mm rack — enabled,
// unrevalidated. (b) the track is REFUSED by V8 for a 26.25 mm live rack; a compatible 28.575 mm archive opens — the pre-fix hook
// returned at `!track` and the track stayed refused under a rack it fits. The close re-arms the live radius through checkTable both
// ways: (a) enabled again with the live session handed back, (b) refused again by name.
{
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  // (a) pending → the archive's own activation, refused by name
  const F = heldFetch('/hardware/TEST-synthetic-wire-slide');
  const T = mkTableShim('wpa_generic_9ft');
  const H = await boot({ tableModule: T.shim, fetchImpl: F.fetchImpl });
  H.shoot(new Map([[1, legacyEntry(1.0, 4)], [2, legacyEntry(1.4, 4)]]), 2.5, 'live1'); H.runTicksToSettle();
  for (let k = 0; k < 900 && [1, 2].some((id) => H.ctl.poseAt(id, H.ctl.clock().t)?.kind !== 'rest'); k++) H.tick();
  const before = { p1: H.posOf(1), p2: H.posOf(2) };
  T.switchTo('chinese8_pro_9ft'); await H.settleActivation();                          // an inert bed: the live session goes to the memo
  F.hold(); T.switchTo('wpa_generic_9ft'); H.tick();                                   // the wpa activation: V8 reads 28.575 mm, then waits on the held hardware fetch
  for (let k = 0; k < 200 && F.requested() === 0; k++) await new Promise((r) => setTimeout(r, 2));
  const pending = { reason: H.ctl.reason, hardwareRequested: F.requested() };          // past V8 (the hardware request follows it), still pending
  H.snapLive(); H.game.template.system.balls[0].params.r = 0.02625;                   // the archive's ballset
  H.dvrOpen(new Map([[5, legacyEntry(0.8, 4)]]), 2.0, [0, 2, 3, 4, 5, 6, 7, 8, 9], 'archived-26.25', { snap: false });
  const atOpen = { reason: H.ctl.reason, activations: H.ctl.stats.activations };
  F.release(); await H.settleActivation();                                             // the held fetch lands inside the archive
  const inArchive = { enabled: H.ctl.enabled, reason: (H.ctl.reason ?? '').slice(0, 120), activations: H.ctl.stats.activations };
  for (let k = 0; k < 40; k++) H.tick();
  H.frame(1.9); const posed5 = { marker: H.posOf(5).marker, kind: H.ctl.poseAt(5, 1.9)?.kind ?? null };
  H.game.template.system.balls[0].params.r = R; H.closeV2({ rebuild: true }); await H.settleActivation();
  for (let k = 0; k < 5; k++) H.tick();
  const afterA = { enabled: H.ctl.enabled, reason: (H.ctl.reason ?? '').slice(0, 60), restored: same(before.p1, H.posOf(1)) && same(before.p2, H.posOf(2)) };
  const okA = pending.reason === 'pending' && pending.hardwareRequested === 1 && inArchive.enabled === false && /V8/.test(inArchive.reason) && /26\.250 mm/.test(inArchive.reason)
    && inArchive.activations > atOpen.activations - 1 && posed5.marker === false && posed5.kind === null && afterA.enabled === true && afterA.restored === true;
  // (b) refused → the compatible archive's own activation, enabled; the close refuses again for the live rack
  const G = await boot({ templateR: 0.02625, expectEnabled: false });
  const refusedLive = { enabled: G.ctl.enabled, reason: (G.ctl.reason ?? '').slice(0, 120) };
  G.game.template.system.balls[0].params.r = R;                                        // a compatible archive
  G.dvrOpen(new Map([[5, legacyEntry(0.8, 4)]]), 2.0, [0, 2, 3, 4, 5, 6, 7, 8, 9], 'archived-28.575');
  await G.settleActivation();
  const inCompat = { enabled: G.ctl.enabled, reason: (G.ctl.reason ?? '').slice(0, 60), activations: G.ctl.stats.activations };
  for (let k = 0; k < 40; k++) G.tick();
  G.frame(1.9); const posed5b = { marker: G.posOf(5).marker, kind: G.ctl.poseAt(5, 1.9)?.kind ?? null, xmm: +(G.posOf(5).x * 1e3).toFixed(1) };
  G.game.template.system.balls[0].params.r = 0.02625; G.closeV2({ rebuild: true }); await G.settleActivation();
  for (let k = 0; k < 5; k++) G.tick();
  const afterB = { enabled: G.ctl.enabled, reason: (G.ctl.reason ?? '').slice(0, 120) };
  const okB = refusedLive.enabled === false && /V8/.test(refusedLive.reason) && /26\.250 mm/.test(refusedLive.reason) && inCompat.enabled === true && posed5b.marker === true && posed5b.kind === 'roll'
    && afterB.enabled === false && /V8/.test(afterB.reason) && /26\.250 mm/.test(afterB.reason);
  check(`L50 the archive-rack radius is read whatever the activation's state (#737 r4 class B): (a) PENDING after V8 (reason '${pending.reason}', hardware requested ${pending.hardwareRequested}) + a 26.25 mm archive → "${inArchive.reason}" (enabled ${inArchive.enabled}, ball 5 posed ${posed5.kind ?? 'not at all'}), the close enabled ${afterA.enabled} with the live session restored ${afterA.restored}; (b) REFUSED for a 26.25 mm live rack ("${refusedLive.reason.slice(0, 60)}…") + a compatible 28.575 mm archive → enabled ${inCompat.enabled} (ball 5 '${posed5b.kind}' at x ${posed5b.xmm} mm), the close refused again (enabled ${afterB.enabled}) — before the fix (a) committed the pending track enabled under the 26.25 mm rack and (b) stayed refused under the rack it fits`,
    okA && okB, JSON.stringify({ pending, atOpen, inArchive, posed5, afterA, refusedLive, inCompat, posed5b, afterB }));
}

// ---- L51 (#737 review round 5, class A): the FIRST record played inside a Playback borrow gets a content snapshot too.
// The dvr-marked borrow branch returned before the base-switch bookkeeping every other record gets, so that record solved
// with no base switch — no content key, no `baseSnapshots` entry. Record A omits ball 5 (a ledger newcomer on the tray);
// record B is staged quietly inside the same borrow and pots ball 5 into the UNSERVED corner; the session then revisits A.
// With nothing to replay A from, the revisit read B's rejection through the carry and drew ball 5 nowhere at all.
{
  const idsA = [0, 1, 2, 3, 4, 6, 7, 8, 9];              // A OMITS ball 5
  const idsB = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];           // B has it on the table, and pots it unserved
  const H = await boot();
  H.shoot(new Map(), 0.6, 'LIVE'); H.runToSettle();       // a settled live shot for the player to borrow from
  H.dvrOpen(new Map(), 2.0, idsA, 'A');                   // the player opens on record A — the FIRST record of the borrow
  for (let k = 1; k <= 24; k++) H.frame(k * DT);
  const t1 = H.ctl.clock().t; const p1 = H.ctl.poseAt(5, t1); const v1 = H.posOf(5);
  const snap1 = H.ctl.borrowed();
  H.quietLoad(new Map([[5, legacyEntry(0.3, 0)]]), 1.5, idsB, 'B'); // B: ball 5 potted into the UNSERVED corner → rejected
  for (let k = 1; k <= 48; k++) H.frame(k * DT);
  const rejB = H.ctl.solution()?.rejected?.has(5) === true;
  H.quietLoad(new Map(), 2.0, idsA, 'A');                 // the REVISIT: a fresh object, the same content as A
  for (let k = 1; k <= 24; k++) H.frame(k * DT);
  const t2 = H.ctl.clock().t; const p2 = H.ctl.poseAt(5, t2); const v2 = H.posOf(5);
  const mm = p1 && p2 ? Math.hypot(p1.x - p2.x, p1.y - p2.y, p1.z - p2.z) * 1e3 : NaN;
  const ok = snap1 === true && !!p1 && v1.marker === true && rejB === true && !!p2 && v2.marker === true && p1.kind === p2.kind && mm <= 1e-6;
  check(`L51 the first record of a Playback borrow is snapshotted too (#737 r5 class A): record A omits ball 5 → drawn '${p1?.kind ?? 'not at all'}' at (${p1 ? (p1.x * 1e3).toFixed(3) : '—'}, ${p1 ? (p1.y * 1e3).toFixed(3) : '—'}, ${p1 ? (p1.z * 1e3).toFixed(3) : '—'}) mm; quiet record B pots it unserved (rejected ${rejB}); the revisit to A draws it ${p2 && v2.marker ? `'${p2.kind}'` : 'NOT at all'} ${Number.isFinite(mm) ? `${mm.toFixed(3)} mm` : '—'} from the first visit — before the fix the borrow's first record stored no snapshot and the revisit carried B's rejection instead (ball 5 drawn nowhere)`,
    ok, JSON.stringify({ p1, v1: { vis: v1.vis, marker: v1.marker }, rejB, p2, v2: { vis: v2.vis, marker: v2.marker }, mm: Number.isFinite(mm) ? +mm.toFixed(4) : null }));
}

// ---- L52 (#737 review round 5, class B): a record's content snapshot is COMPLETED with the ledger stations its own solve
// assigned. The snapshot is written from the CARRIED states alone, before the solve, so a ball the record is the first to
// omit (a ledger newcomer, which has no carried state by definition) is absent from it; the revisit then fell through to
// `carriedRest`, the live mutable map, which the record visited in between had re-stationed. R0 is played first so that A
// is snapshotted whatever the borrow-entry rule does (this arm is class B alone).
{
  const idsAll = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  const idsA = [0, 1, 2, 3, 4, 6, 7, 8, 9];               // A omits ball 5, and pots ball 1 into the SERVED middle
  const idsB = [0, 1, 3, 4, 5, 6, 7, 8, 9];               // B omits ball 2, and pots ball 5 into the SERVED middle
  const H = await boot();
  H.shoot(new Map(), 0.6, 'LIVE'); H.runToSettle();
  H.dvrOpen(new Map(), 1.2, idsAll, 'R0');                 // a throwaway first record: nothing omitted, nothing stationed
  for (let k = 1; k <= 12; k++) H.frame(k * DT);
  H.quietLoad(new Map([[1, legacyEntry(0.3, 4)]]), 2.0, idsA, 'A');
  for (let k = 1; k <= 48; k++) H.frame(k * DT);
  const t1 = H.ctl.clock().t; const p1 = H.ctl.poseAt(5, t1); const led1 = H.ctl.ledger().slice();
  H.quietLoad(new Map([[5, legacyEntry(0.3, 4)]]), 2.0, idsB, 'B'); // B re-stations ball 5: it ARRIVES through the middle
  for (let k = 1; k <= 48; k++) H.frame(k * DT);
  const pB = H.ctl.poseAt(5, H.ctl.clock().t);
  H.quietLoad(new Map([[1, legacyEntry(0.3, 4)]]), 2.0, idsA, 'A'); // back to A
  for (let k = 1; k <= 48; k++) H.frame(k * DT);
  const t2 = H.ctl.clock().t; const p2 = H.ctl.poseAt(5, t2); const led2 = H.ctl.ledger().slice();
  const mm = p1 && p2 ? Math.hypot(p1.x - p2.x, p1.y - p2.y, p1.z - p2.z) * 1e3 : NaN;
  const movedInB = p1 && pB ? Math.hypot(p1.x - pB.x, p1.y - pB.y, p1.z - pB.z) * 1e3 : NaN;
  const ok = !!p1 && !!p2 && p1.kind === p2.kind && mm <= 1e-6 && Number.isFinite(movedInB) && movedInB > 1;
  check(`L52 a revisit reproduces the ledger stations of the first visit (#737 r5 class B): record A omits ball 5 → ledger [${led1.join(',')}], drawn '${p1?.kind ?? 'none'}' at (${p1 ? (p1.x * 1e3).toFixed(3) : '—'}, ${p1 ? (p1.z * 1e3).toFixed(3) : '—'}) mm; record B pots ball 5 and re-stations it ${Number.isFinite(movedInB) ? movedInB.toFixed(1) : '—'} mm away; the revisit to A draws it '${p2?.kind ?? 'none'}' ${Number.isFinite(mm) ? `${mm.toFixed(3)} mm` : '—'} from the first visit (ledger [${led2.join(',')}]) — before the fix A's snapshot never named the ball it was the first to omit and the revisit took B's station out of the live carriedRest`,
    ok, JSON.stringify({ p1, pB, p2, mm: Number.isFinite(mm) ? +mm.toFixed(4) : null, movedInB: Number.isFinite(movedInB) ? +movedInB.toFixed(3) : null, led1, led2 }));
}

// ---- L53 (#737 review round 5, class C): on an OWNERSHIP-REQUIRED track an arrival with no sink pose law is REFUSED BY
// NAME, never served. The ownership pass skips any arrival whose sink carries no pivot (a LEGACY sink: handoffFromSink
// falls back to the cup mouth and tags the source 'legacy') because there is nothing to scan — and that `continue` left
// the early-contact check unrun on the very track whose V13 row says the nearest drawn seat lies INSIDE the sink's last
// drawn pose (−34.7 mm on the high fixture). Eight legacy pots, 0.8 s apart, into pocket 4.
{
  const H = await boot({ track: 'TEST-terminal-chutes-high', host: 'owner' });
  const sinks = new Map(); for (let id = 1; id <= 8; id++) sinks.set(id, legacyEntry(0.5 + (id - 1) * 0.8, 4));
  H.shoot(sinks, 7.5, 'LEG8');
  let worst = Infinity; let atW = null; let drawn = 0; let frames = 0; let ownedEver = 0;
  const named = new Map(); // read WHILE the record plays: after the settle the refused balls are carried as rejected, not arrivals
  for (let k = 0; k < 4000 && H.machine.state === 'PLAYBACK'; k++) {
    H.tick(); frames += 1;
    const t = H.ctl.clock().t;
    ownedEver = Math.max(ownedEver, H.ctl.ownership().owned.length);
    for (const x of refusalsOf(H.ctl)) if (!named.has(x.id)) named.set(x.id, x.reason);
    // every ball the MODULE drew this frame, against every ball the HOST is drawing in its cup (inside the legacy TTL,
    // where game.js owns the sinking ball and this module must not have put anything within one diameter of it)
    const mine = []; for (const b of H.balls) if (b.mesh.userData.obReturnPosed) mine.push([b.id, { x: b.mesh.position.x, y: b.mesh.position.y, z: b.mesh.position.z }]);
    drawn = Math.max(drawn, mine.length);
    for (const [id, s] of sinks) {
      if (!(t >= s.t && t - s.t < ttlOf(s))) continue;
      const hp = { x: s.pocket.x, y: 0, z: s.pocket.z }; // game.js's legacy sink drawing: the ball in the cup mouth
      for (const [mid, q] of mine) { if (mid === id) continue; const d = Math.hypot(hp.x - q.x, hp.y - q.y, hp.z - q.z); if (d < worst) { worst = d; atW = { t: +t.toFixed(3), host: id, module: mid, mm: +(d * 1e3).toFixed(2) }; } }
    }
  }
  const refus = [...named].map(([id, reason]) => ({ id, reason }));
  const v13 = refus.filter((x) => /\[V13\]/.test(x.reason) && /legacy sink/.test(x.reason));
  const served = new Set(refus.map((x) => x.id));
  const allAccounted = [1, 2, 3, 4, 5, 6, 7, 8].every((id) => served.has(id));
  const ok = H.ctl.enabled === true && allAccounted && v13.length === 8 && drawn === 0 && !(worst < 2 * R - 1e-9);
  check(`L53 a legacy arrival on an ownership-required track is refused by name (#737 r5 class C): eight legacy pots 0.8 s apart into pocket 4 of TEST-terminal-chutes-high (V13, sink clearance −34.7 mm; ${frames} frames) — ${v13.length}/8 named [V13] "no sink pose law", ${drawn} balls drawn by the module, ${ownedEver} ownerships evaluated, closest host-drawn cup to a module-drawn ball ${Number.isFinite(worst) ? `${(worst * 1e3).toFixed(2)} mm` : 'n/a (nothing drawn)'} vs one diameter ${(2 * R * 1e3).toFixed(2)} at ${JSON.stringify(atW)} — before the fix all eight were served with the early-contact check unrun (0 ownerships on a track that exists to require them)`,
    ok, JSON.stringify({ enabled: H.ctl.enabled, refusals: refus.map((x) => ({ id: x.id, reason: x.reason.slice(0, 90) })), drawn, ownedEver, worstMm: Number.isFinite(worst) ? +(worst * 1e3).toFixed(2) : null, atW, frames }));
}

// ---- L54 (#737 review round 5, class D): the return solution OWNS the orientation basis of every ball it holds.
// `b.baseQuat` is the RACK's basis and game.js re-pins it at every staging, so reading it live at pose time made a ledger
// ball's drawn orientation depend on which OTHER records a Playback session had visited in between: A → B → A turned
// ball 5 on the tray by whatever B's staging had left on the shared ball object. Ball 5 is omitted by BOTH records, so it
// never returns to the table (a revived ball legitimately gives its basis up) and only the composition can move it.
{
  const idsA = [0, 1, 2, 3, 4, 6, 7, 8, 9];               // both omit ball 5
  const idsB = [0, 1, 3, 4, 6, 7, 8, 9];                  // B omits ball 2 as well: a different record, ball 5 still off the table
  const qA = mkQuat(0, Math.SQRT1_2, 0, Math.SQRT1_2);     // the basis A's rack was staged with (90° about y)
  const qB = mkQuat(Math.SQRT1_2, 0, 0, Math.SQRT1_2);     // …and B's (90° about x)
  const H = await boot();
  const stage = (q) => { for (const b of H.balls) b.baseQuat = q.clone(); }; // game.js applyRack: the basis pinned on every ball
  stage(qA);
  H.shoot(new Map(), 0.6, 'LIVE'); H.runToSettle();
  H.dvrOpen(new Map(), 2.0, idsA, 'A');
  for (let k = 1; k <= 24; k++) H.frame(k * DT);
  const p1 = H.ctl.poseAt(5, H.ctl.clock().t); const q1 = H.balls[5].mesh.quaternion.clone(); const m1 = H.posOf(5).marker;
  H.quietLoad(new Map(), 2.0, idsB, 'B'); stage(qB);       // another record, staged with its own basis
  for (let k = 1; k <= 24; k++) H.frame(k * DT);
  const qMid = H.balls[5].mesh.quaternion.clone();
  H.quietLoad(new Map(), 2.0, idsA, 'A');                  // back to A (the rack is NOT rebuilt: the same ball objects)
  for (let k = 1; k <= 24; k++) H.frame(k * DT);
  const p2 = H.ctl.poseAt(5, H.ctl.clock().t); const q2 = H.balls[5].mesh.quaternion.clone(); const m2 = H.posOf(5).marker;
  const deg = quatAngleDeg(q1, q2);
  const posMm = p1 && p2 ? Math.hypot(p1.x - p2.x, p1.y - p2.y, p1.z - p2.z) * 1e3 : NaN;
  const basisDeg = quatAngleDeg(qA, qB);
  const ok = m1 === true && m2 === true && !!p1 && !!p2 && posMm <= 1e-6 && deg <= 1e-9;
  check(`L54 the solution owns a held ball's orientation basis (#737 r5 class D): ball 5 sits on the tray of record A (drawn ${m1}), the session visits record B — staged with a basis ${basisDeg.toFixed(1)}° away, re-pinned on the shared ball object — and returns to A (drawn ${m2}); ball 5's drawn orientation moved ${deg.toFixed(4)}° between the two visits (its station moved ${Number.isFinite(posMm) ? posMm.toFixed(4) : '—'} mm) — before the fix poseAll read `+"`b.baseQuat`"+` live and the revisit composed against B's basis (${basisDeg.toFixed(1)}°)`,
    ok, JSON.stringify({ m1, m2, deg: +deg.toFixed(6), posMm: Number.isFinite(posMm) ? +posMm.toFixed(6) : null, basisDeg: +basisDeg.toFixed(3), q1, qMid, q2 }));
}

// ---- L55 (#737 review round 5, class E): the host's ownership hook may arrive AFTER the track does. game.js binds
// `sinkPoseAt` only inside its async `import('./sinkpivot.js')`, so on a cold load an activation that resolves first
// reads the hook absent and V13 refuses an ownership-required track — permanently, because the verdict is cached against
// the table id and only a table or radius change re-activates. The accessor then sits there, live, for the whole session.
{
  const H = await boot({ track: 'TEST-terminal-chutes-high', host: 'legacy', expectEnabled: false });
  const before = { enabled: H.ctl.enabled, reason: H.ctl.reason, activations: H.ctl.stats.activations };
  for (let k = 0; k < 30; k++) { H.tick(); } // the frame hook runs and runs: nothing re-reads the hook
  const stillRefused = { enabled: H.ctl.enabled, reason: H.ctl.reason };
  // …the import lands (game.js's own two lines, one frame later)
  H.game.ballReturnOwnsSupported = true;
  H.game.sinkPoseAt = (s, dt, out) => (s && s.pivot ? poseInSink(s.pivot, dt, out ?? {}) : null);
  for (let k = 0; k < 200 && !H.ctl.enabled; k++) { H.tick(); await new Promise((r) => setTimeout(r, 2)); }
  const after = { enabled: H.ctl.enabled, reason: H.ctl.reason, activations: H.ctl.stats.activations };
  // and the track now works: a pivot pot is served and owned
  H.shoot(new Map([[1, pivotEntry(0.5, 4)]]), 2.0, 'AFTER');
  for (let k = 0; k < 400 && H.machine.state === 'PLAYBACK'; k++) H.tick();
  const served = H.ctl.solution()?.pieces?.has(1) === true;
  const ok = before.enabled === false && /V13/.test(before.reason) && stillRefused.enabled === false
    && after.enabled === true && after.activations > before.activations && served === true;
  check(`L55 a V13 refusal is retried when the ownership hook appears (#737 r5 class E): a fresh host loads the track before sinkpivot.js binds — refused "${before.reason.slice(0, 58)}…" and still refused after 30 frames (${stillRefused.enabled}); the accessor then lands and the track activates on the next frame (enabled ${after.enabled}, ${before.activations} → ${after.activations} activations), serving a pivot pot (${served}) — before the fix nothing re-read the hook and the track stayed disabled for the whole session`,
    ok, JSON.stringify({ before, stillRefused, after, served }));
}

// ---- L56 (#737 review round 5, class F): a ball driven OFF THE TABLE is not a pot. The kernel gives it the terminal
// `BallOffTable` event and leaves its motion Pocketed — the same motion a potted ball has — while game.js's sinkIndex()
// reads `BallPocket` events alone. So it reached this module reading `pocketed`, with no hand-off and no rejection, and
// looked exactly like a layout-omitted newcomer: the ledger packed a ball that had flown off the rail into the tray. The
// kernel is frozen (ADR-0017), so the record's own event stream is what settles it. Control: the SAME record without the
// event, where ball 5 is a genuine omission and must still be served.
{
  const idsNo5 = [0, 1, 2, 3, 4, 6, 7, 8, 9];
  const run = async (events) => {
    const H = await boot();
    H.shoot(new Map(), 0.6, 'LIVE'); H.runToSettle();
    H.dvrOpen(new Map(), 1.2, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 'R0');
    for (let k = 1; k <= 12; k++) H.frame(k * DT);
    H.quietLoad(new Map(), 2.0, idsNo5, 'OFF', events);
    for (let k = 1; k <= 36; k++) H.frame(k * DT);
    const p = H.ctl.poseAt(5, H.ctl.clock().t); const v = H.posOf(5);
    return { kind: p?.kind ?? null, drawn: v.marker === true && v.vis === true, ledger: H.ctl.ledger().slice(),
      rejected: H.ctl.solution()?.rejected?.has(5) === true, refusals: refusalsOf(H.ctl).filter((x) => x.id === 5) };
  };
  const OFF = await run([{ t: 0.31, kind: { BallOffTable: { ball: 5 } } }]);
  const CTRL = await run(null);
  const named = OFF.refusals.length === 1 && /\[OFF-TABLE\]/.test(OFF.refusals[0].reason);
  const ok = OFF.drawn === false && OFF.kind === null && !OFF.ledger.includes(5) && OFF.rejected === true && named
    && CTRL.drawn === true && CTRL.kind !== null && CTRL.ledger.includes(5) && CTRL.refusals.length === 0;
  check(`L56 a ball driven off the table is never returned (#737 r5 class F): a record whose event stream carries one BallOffTable for ball 5 — drawn ${OFF.drawn} (${OFF.kind ?? 'no pose'}), ledger [${OFF.ledger.join(',')}], rejected ${OFF.rejected}, named ${named ? `"${OFF.refusals[0].reason.slice(0, 64)}…"` : 'NO'}; the same record WITHOUT the event (a genuine layout omission) still serves it: drawn ${CTRL.drawn} '${CTRL.kind}', ledger [${CTRL.ledger.join(',')}] — before the fix the off-table ball read `+"`pocketed`"+` with no hand-off and the ledger packed it into the tray exactly like the omission`,
    ok, JSON.stringify({ OFF, CTRL }));
}

// ==== #737 r6 — the record-boundary INVARIANT SWEEP (contract §27.12) =============================================
// Rounds 3-6 each found another carry/reset defect at a record boundary, so round 6 wrote the TABLE first: every kind of
// per-ball return state × every boundary event, each cell CARRY / RESET / RE-VALIDATE(against which record). L57 and L58
// arm the two classes review named; L59-L65 walk EVERY state kind across ONE boundary event each, so a future change that
// breaks a cell the table declares is caught by the arm for that boundary and not only by the arm for that class.
//
// The six state kinds, and what each arm reads them through:
//   S1 ownership + validation record  — game.ballReturnOwns(id, dt) (the pass's ownMap), the [V13] verdict
//   S2 hold / fall / rest + its time origin — ctl.poseAt(id, t).kind and its coordinates
//   S3 ledger station (+ its route)   — ctl.ledger(), solution.pieces[…].route vs the LIVE track's route object
//   S4 orientation basis + qRel       — the ball mesh's drawn quaternion (basis ∘ qRel), read after a posed frame
//   S5 rejection / refusal            — solution.rejected and the named rows of ctl.refusals()
//   S6 sink classification (off-table) — whether the record's own stream/index decides the ball at all
const boundaryWalk = (H, ids, { own = false } = {}) => {
  const t = H.ctl.clock().t;
  const sol = H.ctl.solution();
  const led = H.ctl.ledger();
  const refs = new Map(refusalsOf(H.ctl).map((x) => [x.id, x.reason]));
  const rows = new Map();
  for (const id of ids) {
    const p = H.ctl.poseAt(id, t);
    const ps = sol?.pieces?.get(id) ?? [];
    const rt = ps.length ? (ps[ps.length - 1].route ?? null) : null;
    const live = rt ? (rt.pocket >= 0 ? (H.ctl.track?.routes?.get(rt.pocket) ?? null) : (H.ctl.track?.trayRoute ?? null)) : null;
    const m = H.balls[id].mesh;
    rows.set(id, {
      kind: p?.kind ?? null,                                                       // S2
      pos: p ? [p.x, p.y, p.z] : null,                                             // S2 / S3
      D: p && Number.isFinite(p.D) ? p.D : null,                                   // S3 (the station along the route it is drawn at)
      drawn: H.posOf(id).marker === true,
      q: { x: m.quaternion.x, y: m.quaternion.y, z: m.quaternion.z, w: m.quaternion.w }, // S4 (basis ∘ qRel)
      ledger: led.includes(id),                                                    // S3
      rejected: sol?.rejected?.has(id) === true,                                   // S5
      refusal: refs.get(id) ?? null,                                               // S5
      pocket: rt ? rt.pocket : null,                                               // S3
      bound: rt ? rt === live : null,                                              // S3 (route identity on the LIVE track)
      own: own && typeof H.game.ballReturnOwns === 'function' ? H.game.ballReturnOwns(id, 1e-3) === true : null, // S1
    });
  }
  return rows;
};
const walkMm = (a, b) => (a && b ? Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) * 1e3 : null);
// quatAngleDeg is 2·acos(|dot|): on two BIT-IDENTICAL quaternions whose norm is 1 − 1e-16 it still reports ~2e-6°, so the
// arms compare orientations at 1e-3° — five orders below the drifts they exist to catch (159°, 120°, 88.9°)
const DEG_EPS = 1e-3;
/** a ball the KERNEL drove off the table: pocketed with no sink entry, and the record's stream says why (r5 class F) */
const offTableEvents = (ids, t = 0.31) => ids.map((id) => ({ t, kind: { BallOffTable: { ball: id } } }));
/** the ball is already OFF the table when the record is staged (the kernel's terminal BallOffTable): pocketed, out of the
 * record's ball list — exactly what game.js hands the module, and what `shoot(..., events)` must be told about */
const markOffTable = (H, id) => { const b = H.balls[id]; b.pocketed = true; b.mesh.visible = false; b.mesh.position.set(0, -10, 0); };

// ---- L57 a carried arrival keeps the record its ownership was VALIDATED against (#737 r6 class A) -----------------
{
  const H = await boot({ track: 'TEST-terminal-chutes-high', host: 'owner' });
  const sinks = new Map(); for (let id = 1; id <= 8; id++) sinks.set(id, pivotEntry(0.5 + (id - 1) * 1.0, 4));
  H.shoot(sinks, 9.0, 'R6A-8pots');
  H.runTicksToSettle();
  for (let k = 0; k < 600; k++) H.tick();
  const before = boundaryWalk(H, [7, 8], { own: true });
  // the NEXT shot: a new record object, game.sinkInfo nulled and rebuilt EMPTY — ball 8 is in no index at all
  H.shoot(new Map(), 1.0, 'R6A-next');
  H.runTicksToSettle();
  for (let k = 0; k < 120; k++) H.tick();
  const after = boundaryWalk(H, [7, 8], { own: true });
  const b8 = before.get(8), a8 = after.get(8), b7 = before.get(7), a7 = after.get(7);
  const mm8 = walkMm(b8.pos, a8.pos), mm7 = walkMm(b7.pos, a7.pos);
  const ok = b8.kind === 'hold' && a8.kind === 'hold' && a8.drawn === true && Number.isFinite(mm8) && mm8 < 1e-6
    && after.get(8).rejected === false && Number.isFinite(mm7) && mm7 < 1e-6 && a7.kind === 'rest';
  check(`L57 a carried arrival keeps the record its ownership was VALIDATED against (#737 r6 class A): eight pivot pots 1.0 s apart into pocket 4 of TEST-terminal-chutes-high (V13) leave ball 8 '${b8.kind}' at (${b8.pos ? (b8.pos[0] * 1e3).toFixed(2) : '—'}, ${b8.pos ? (b8.pos[2] * 1e3).toFixed(2) : '—'}) mm above the seat and ball 7 '${b7.kind}'; one more shot — a new record whose index names nobody — and ball 8 is still ${a8.drawn ? `drawn '${a8.kind}'` : 'NOT drawn'} ${Number.isFinite(mm8) ? `${mm8.toFixed(4)} mm` : '—'} from where it was (rejected ${a8.rejected}), ball 7 still '${a7.kind}' ${Number.isFinite(mm7) ? `${mm7.toFixed(4)} mm` : '—'} away — before the fix the V13 filter re-read the NEW record's index for a ball that is not in it, refused it as a legacy sink without a pivot and hid it for the rest of the session`,
    ok, JSON.stringify({ before: [...before], after: [...after] }));
}

// ---- L58 the record snapshot stores and restores the orientation BASIS (#737 r6 class B) --------------------------
{
  const idsA = [0, 1, 2, 3, 4, 6, 7, 8, 9];   // A OMITS ball 5 → the module stations it on the tray
  const idsB = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]; // B has it ON the table → the live-ball purge drops the basis A captured
  const W159 = 0.1822;                                          // 2·acos(0.1822) = 159.0°
  const qA = mkQuat(0, Math.sqrt(1 - W159 * W159), 0, W159);    // A's rack basis, normalised: 159.0° from identity
  const qI = mkQuat(0, 0, 0, 1);               // B's staging re-pins the SHARED ball object to identity
  const H = await boot();
  const stage = (q) => { for (const b of H.balls) b.baseQuat = q.clone(); };
  stage(qA);
  H.shoot(new Map(), 0.6, 'R6B-live'); H.runToSettle();
  H.dvrOpen(new Map(), 1.2, idsB, 'R6B-R0');
  for (let k = 1; k <= 12; k++) H.frame(k * DT);
  H.quietLoad(new Map(), 2.0, idsA, 'R6B-A'); stage(qA);
  for (let k = 1; k <= 36; k++) H.frame(k * DT);
  const w1 = boundaryWalk(H, [5]);
  H.quietLoad(new Map(), 2.0, idsB, 'R6B-B'); stage(qI);
  for (let k = 1; k <= 36; k++) H.frame(k * DT);
  const onTableInB = H.balls[5].pocketed === false;
  H.quietLoad(new Map(), 2.0, idsA, 'R6B-A');  // the REVISIT — the live basis is B's identity now
  for (let k = 1; k <= 36; k++) H.frame(k * DT);
  const w2 = boundaryWalk(H, [5]);
  const deg = quatAngleDeg(w1.get(5).q, w2.get(5).q);
  const mm = walkMm(w1.get(5).pos, w2.get(5).pos);
  const ok = onTableInB && w1.get(5).drawn === true && w2.get(5).drawn === true && deg < DEG_EPS && Number.isFinite(mm) && mm < 1e-6;
  check(`L58 the record snapshot stores and restores the orientation BASIS (#737 r6 class B): record A omits ball 5 (drawn '${w1.get(5).kind}'), record B plays it on the table (${onTableInB}) and re-pins the shared ball object to a basis ${quatAngleDeg(qA, qI).toFixed(1)}° away, the revisit to A draws it ${w2.get(5).drawn ? `'${w2.get(5).kind}'` : 'NOT at all'} — orientation moved ${deg.toFixed(4)}°, station ${Number.isFinite(mm) ? mm.toFixed(4) : '—'} mm, between the two visits to the same frame — before the fix the snapshot carried the station and the relative quaternion but not the basis, the live-ball purge had dropped it, and the revisit composed against B's identity (${quatAngleDeg(qA, qI).toFixed(1)}°)`,
    ok, JSON.stringify({ w1: [...w1], w2: [...w2], deg, mm }));
}

// ---- L59 boundary E1: a NEW SHOT in the same rack, every state kind ------------------------------------------------
{
  const H = await boot({ host: 'owner' });
  const sinks = new Map([[1, pivotEntry(0.4, 4)], [2, pivotEntry(0.9, 1)], [3, legacyEntry(1.3, 0)]]); // 0 = an UNSERVED corner
  markOffTable(H, 4);                                          // the kernel drove ball 4 off the table…
  H.shoot(sinks, 2.0, 'R6E1-A', offTableEvents([4]));           // …and the record's own stream says so
  H.runTicksToSettle();
  for (let k = 0; k < 240; k++) H.tick();
  const before = boundaryWalk(H, [1, 2, 3, 4], { own: true });
  // E1: game.shoot() — a new record object, a new time base, sinkInfo nulled and rebuilt EMPTY
  H.shoot(new Map(), 1.0, 'R6E1-B');
  H.runTicksToSettle();
  for (let k = 0; k < 120; k++) H.tick();
  const after = boundaryWalk(H, [1, 2, 3, 4], { own: true });
  const mm1 = walkMm(before.get(1).pos, after.get(1).pos), mm2 = walkMm(before.get(2).pos, after.get(2).pos);
  const deg1 = quatAngleDeg(before.get(1).q, after.get(1).q);
  const carriedName = typeof after.get(4).refusal === 'string' && /\[CARRIED\]/.test(after.get(4).refusal) && /\[OFF-TABLE\]/.test(after.get(4).refusal);
  const ok = Number.isFinite(mm1) && mm1 < 1e-6 && Number.isFinite(mm2) && mm2 < 1e-6      // S2/S3 station CARRIES
    && after.get(1).kind === 'rest' && after.get(2).kind === 'rest' && after.get(1).bound === true // S3 route on the LIVE track
    && deg1 < DEG_EPS                                                                       // S4 basis + qRel CARRY
    && after.get(3).rejected === true && after.get(3).drawn === false                        // S5 rejection CARRIES
    && after.get(4).rejected === true && after.get(4).drawn === false && carriedName         // S5 the NAME carries, S6 off-table stays off-table
    && before.get(4).refusal !== null && /\[OFF-TABLE\]/.test(before.get(4).refusal);
  check(`L59 boundary E1 (a NEW SHOT in the same rack) — every state kind walked: after record A (ball 1 pivot-potted into the served corner, ball 2 into the served middle, ball 3 into an UNSERVED corner, ball 4 driven off the table) the next shot leaves ball 1 '${after.get(1).kind}' ${Number.isFinite(mm1) ? mm1.toFixed(4) : '—'} mm and ${deg1.toFixed(4)}° from its A pose on the LIVE track's route (bound ${after.get(1).bound}), ball 2 '${after.get(2).kind}' ${Number.isFinite(mm2) ? mm2.toFixed(4) : '—'} mm, ball 3 rejected ${after.get(3).rejected} drawn ${after.get(3).drawn}, ball 4 rejected ${after.get(4).rejected} and still NAMED "${(after.get(4).refusal ?? 'nothing').slice(0, 48)}…" — before the fix the carried refusal was the bare {kind:'rejected'} and the row vanished from the facade at the next solve while the ball stayed culled`,
    ok, JSON.stringify({ before: [...before], after: [...after] }));
}

// ---- L60 boundary E2: QUIET STAGING of another record, every state kind ---------------------------------------------
{
  const idsA = [0, 1, 3, 5, 6, 7, 8, 9];   // A omits ball 2 (driven OFF the table) and ball 4 (a layout omission → the tray)
  const idsB = [0, 5, 6, 7, 8, 9];         // B omits all four: nothing of A's is revived, so every kind must CARRY
  const H = await boot({ host: 'owner' });
  H.shoot(new Map(), 0.6, 'R6E2-live'); H.runToSettle();
  H.dvrOpen(new Map([[1, pivotEntry(0.4, 4)], [3, legacyEntry(0.9, 0)]]), 12.0, idsA, 'R6E2-A', { events: offTableEvents([2]) });
  for (let k = 1; k <= 600; k++) H.frame(k * DT);   // 10 s: ball 1 is at rest on its chute
  const before = boundaryWalk(H, [1, 2, 3, 4], { own: true });
  // E2: game.loadRecord(stage:'quiet') — a NEW record object inside PLAYBACK, clock 0, no stateChange
  H.quietLoad(new Map(), 12.0, idsB, 'R6E2-B');
  for (let k = 1; k <= 300; k++) H.frame(k * DT);
  const after = boundaryWalk(H, [1, 2, 3, 4], { own: true });
  const mm1 = walkMm(before.get(1).pos, after.get(1).pos), mm4 = walkMm(before.get(4).pos, after.get(4).pos);
  const deg4 = quatAngleDeg(before.get(4).q, after.get(4).q), deg1 = quatAngleDeg(before.get(1).q, after.get(1).q);
  const carriedName = typeof after.get(2).refusal === 'string' && /\[CARRIED\]/.test(after.get(2).refusal) && /\[OFF-TABLE\]/.test(after.get(2).refusal);
  const ok = before.get(1).kind === 'rest' && before.get(4).kind === 'rest' && before.get(3).rejected === true
    && typeof before.get(2).refusal === 'string' && /\[OFF-TABLE\]/.test(before.get(2).refusal)
    && Number.isFinite(mm1) && mm1 < 1e-6 && after.get(1).kind === 'rest' && after.get(1).bound === true && deg1 < DEG_EPS
    && Number.isFinite(mm4) && mm4 < 1e-6 && after.get(4).ledger === true && deg4 < DEG_EPS
    && after.get(3).rejected === true && after.get(3).drawn === false
    && after.get(2).rejected === true && after.get(2).drawn === false && carriedName;
  check(`L60 boundary E2 (QUIET STAGING of another record) — every state kind walked: inside a Playback borrow record A pivot-pots ball 1 (→ '${before.get(1).kind}'), pots ball 3 into an unserved corner (rejected ${before.get(3).rejected}), carries a kernel BallOffTable for ball 2 (named "${(before.get(2).refusal ?? 'nothing').slice(0, 28)}…") and omits ball 4 (→ ledger '${before.get(4).kind}'); the quiet load of record B — which omits all four — leaves ball 1 ${Number.isFinite(mm1) ? mm1.toFixed(4) : '—'} mm / ${deg1.toFixed(4)}° away on the LIVE track's route (bound ${after.get(1).bound}), ball 4 ${Number.isFinite(mm4) ? mm4.toFixed(4) : '—'} mm / ${deg4.toFixed(4)}° away and still in the ledger (${after.get(4).ledger}), ball 3 rejected ${after.get(3).rejected}, ball 2 rejected ${after.get(2).rejected} and still NAMED "${(after.get(2).refusal ?? 'nothing').slice(0, 48)}…" — before the fix the carried refusal was the bare {kind:'rejected'}, so the row vanished from the facade at the quiet load while the ball stayed culled`,
    ok, JSON.stringify({ before: [...before], after: [...after] }));
}


// ---- L61 boundary E3: the Playback BORROW's entry and exit, every state kind ----------------------------------------
{
  const H = await boot({ host: 'owner' });
  markOffTable(H, 2);
  H.shoot(new Map([[1, pivotEntry(0.4, 4)], [3, legacyEntry(0.9, 0)]]), 2.0, 'R6E3-live', offTableEvents([2]));
  H.runTicksToSettle();
  for (let k = 0; k < 240; k++) H.tick();
  const live = boundaryWalk(H, [1, 2, 3], { own: true });
  // E3 IN: the Playback player borrows the bed — the DVR runs on a FRESH session: the live stations, the live
  // rejections and the live refusals are NOT visible inside it (the archive's own layout decides everything)
  H.dvrOpen(new Map(), 1.2, [0, 4, 5, 6, 7, 8, 9], 'R6E3-dvr');
  for (let k = 1; k <= 60; k++) H.frame(k * DT);
  const inBorrow = boundaryWalk(H, [1, 2, 3], { own: true });
  // the DVR's own layout re-packs ball 1 as a TRAY newcomer (pocket -1, in the ledger) — the live chute
  // arrival it owns (pocket 4, not in the ledger) is invisible inside the borrow. Its tray slot happens to
  // coincide with the live chute's end station, so the station is not the discriminator: ownership is.
  const leaked = [1, 2, 3].some((id) => inBorrow.get(id).rejected || inBorrow.get(id).refusal !== null)
    || inBorrow.get(1).pocket !== -1 || inBorrow.get(1).ledger !== true
    || live.get(1).pocket !== 4 || live.get(1).ledger !== false;
  // E3 OUT: the live record is re-staged and handed back (closeV2 = the settled-live-shot close)
  H.closeV2();
  for (let k = 0; k < 120; k++) H.tick();
  const back = boundaryWalk(H, [1, 2, 3], { own: true });
  const mm1 = walkMm(live.get(1).pos, back.get(1).pos);
  const deg1 = quatAngleDeg(live.get(1).q, back.get(1).q);
  const ok = leaked === false && Number.isFinite(mm1) && mm1 < 1e-6 && deg1 < DEG_EPS && back.get(1).kind === live.get(1).kind
    && back.get(1).bound === true && back.get(3).rejected === true && live.get(3).rejected === true
    && back.get(2).rejected === true && typeof back.get(2).refusal === 'string' && /\[OFF-TABLE\]/.test(back.get(2).refusal)
    && typeof live.get(2).refusal === 'string' && /\[OFF-TABLE\]/.test(live.get(2).refusal);
  check(`L61 boundary E3 (the Playback BORROW's entry and exit) — every state kind walked: the live shot leaves ball 1 '${live.get(1).kind}' at x ${live.get(1).pos ? (live.get(1).pos[0] * 1e3).toFixed(2) : '—'} mm, ball 3 rejected in an unserved corner and ball 2 named off-table; inside the borrow none of it leaks — the archive's own layout re-packs all three as TRAY newcomers (ball 1 pocket ${inBorrow.get(1).pocket} / ledger ${inBorrow.get(1).ledger}, against the live pocket ${live.get(1).pocket} / ledger ${live.get(1).ledger}), rejections ${[1, 2, 3].filter((id) => inBorrow.get(id).rejected).length}, named refusals ${[1, 2, 3].filter((id) => inBorrow.get(id).refusal !== null).length}; the close hands the live session back with ball 1 '${back.get(1).kind}' ${Number.isFinite(mm1) ? mm1.toFixed(4) : '—'} mm / ${deg1.toFixed(4)}° from where it was on the live route (bound ${back.get(1).bound}), ball 3 rejected ${back.get(3).rejected}, ball 2 named "${(back.get(2).refusal ?? 'nothing').slice(0, 40)}…" — this cell was already enforced (stashSession/restoreSession, r3 P1 + r5 class D), so the arm passes on the PRE-FIX export too: it is the table's regression guard for the borrow row, not a defect witness`,
    ok, JSON.stringify({ live: [...live], inBorrow: [...inBorrow], back: [...back], leaked }));
}


// ---- L62 boundary E4: a REVISIT of a record already played, every state kind ------------------------------------------
{
  const idsA = [0, 1, 3, 4, 6, 7, 8, 9];        // A omits ball 2 (off the table) and ball 5 (a layout omission → the tray)
  const idsB = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];  // B revives every one of them and re-pins the shared ball objects
  const W159 = 0.1822;
  const qA = mkQuat(0, Math.sqrt(1 - W159 * W159), 0, W159);
  const qI = mkQuat(0, 0, 0, 1);
  const H = await boot({ host: 'owner' });
  const stage = (q) => { for (const b of H.balls) b.baseQuat = q.clone(); };
  const sinksA = () => new Map([[1, pivotEntry(0.4, 4)], [3, legacyEntry(0.9, 0)]]);
  stage(qA);
  H.shoot(new Map(), 0.6, 'R6E4-live'); H.runToSettle();
  H.dvrOpen(new Map(), 12.0, idsB, 'R6E4-R0');
  for (let k = 1; k <= 12; k++) H.frame(k * DT);
  H.quietLoad(sinksA(), 12.0, idsA, 'R6E4-A', offTableEvents([2])); stage(qA);
  for (let k = 1; k <= 600; k++) H.frame(k * DT);
  const v1 = boundaryWalk(H, [1, 2, 3, 5], { own: true });
  H.quietLoad(new Map([[6, pivotEntry(0.4, 4)]]), 12.0, idsB, 'R6E4-B'); stage(qI); // B re-stations and re-pins everything
  for (let k = 1; k <= 600; k++) H.frame(k * DT);
  H.quietLoad(sinksA(), 12.0, idsA, 'R6E4-A', offTableEvents([2]));                 // the REVISIT: a fresh object, same content
  for (let k = 1; k <= 600; k++) H.frame(k * DT);
  const v2 = boundaryWalk(H, [1, 2, 3, 5], { own: true });
  const mm1 = walkMm(v1.get(1).pos, v2.get(1).pos), mm5 = walkMm(v1.get(5).pos, v2.get(5).pos);
  const deg5 = quatAngleDeg(v1.get(5).q, v2.get(5).q), deg1 = quatAngleDeg(v1.get(1).q, v2.get(1).q);
  const ok = v1.get(1).kind === 'rest' && v1.get(5).kind === 'rest' && v1.get(3).rejected === true
    && typeof v1.get(2).refusal === 'string' && /\[OFF-TABLE\]/.test(v1.get(2).refusal)
    && Number.isFinite(mm1) && mm1 < 1e-6 && Number.isFinite(mm5) && mm5 < 1e-6 && deg5 < DEG_EPS
    && Math.abs(deg1 - quatAngleDeg(qA, qI)) < DEG_EPS
    && v2.get(1).kind === v1.get(1).kind && v2.get(5).kind === v1.get(5).kind && v2.get(1).bound === true && v2.get(5).bound === true
    && v2.get(3).rejected === true && v2.get(2).rejected === true
    && typeof v2.get(2).refusal === 'string' && /\[OFF-TABLE\]/.test(v2.get(2).refusal);
  check(`L62 boundary E4 (a REVISIT of a record already played) — every state kind walked: record A pivot-pots ball 1 ('${v1.get(1).kind}'), pots ball 3 into an unserved corner, carries a BallOffTable for ball 2 and omits ball 5 ('${v1.get(5).kind}' on the tray); record B revives all four and re-pins the shared ball objects to a basis ${quatAngleDeg(qA, qI).toFixed(1)}° away; the revisit to A reproduces ball 5 — the OMITTED one, purged from the live scene and held only by the snapshot — ${Number.isFinite(mm5) ? mm5.toFixed(4) : '—'} mm / ${deg5.toFixed(4)}° from the first visit, while ball 1 — the one record A POTS, still a live table ball whose basis the module re-derives at solve time — reproduces its station to ${Number.isFinite(mm1) ? mm1.toFixed(4) : '—'} mm and follows the world's current basis exactly (${deg1.toFixed(4)}° vs the staged ${quatAngleDeg(qA, qI).toFixed(4)}°); both seated on the LIVE track's routes (bound ${v2.get(1).bound}/${v2.get(5).bound}), ball 3 rejected ${v2.get(3).rejected}, ball 2 named "${(v2.get(2).refusal ?? 'nothing').slice(0, 40)}…" — before the fix ball 5's revisit restored the station and the relative quaternion but not the BASIS, and composed them against whatever the record in between had left on the shared ball object (${quatAngleDeg(qA, qI).toFixed(1)}°)`,
    ok, JSON.stringify({ v1: [...v1], v2: [...v2] }));
}


// ---- L63 boundary E5: a TABLE CHANGE and its revert (the rack memo), every state kind ---------------------------------
{
  const T = mkTableShim('wpa_generic_9ft');
  const H = await boot({ tableModule: T.shim, host: 'owner' });
  H.shoot(new Map([[1, pivotEntry(0.4, 4)], [2, pivotEntry(0.9, 4)], [3, legacyEntry(1.3, 0)]]), 2.0, 'R6E5-A');
  H.runTicksToSettle();
  for (let k = 0; k < 900 && [1, 2].some((id) => H.ctl.poseAt(id, H.ctl.clock().t)?.kind !== 'rest'); k++) H.tick();
  const before = boundaryWalk(H, [1, 2, 3], { own: true });
  const trackBefore = H.ctl.track;
  // E5: a table PREVIEW onto another bed and the revert — `validateTrack` builds a NEW track object with NEW route objects
  T.switchTo('chinese8_pro_9ft'); await H.settleActivation(); for (let k = 0; k < 15; k++) H.tick();
  T.switchTo('wpa_generic_9ft'); await H.settleActivation();
  const rebuilt = trackBefore !== H.ctl.track;
  H.shoot(new Map(), 1.0, 'R6E5-B');   // the next record on the re-activated track
  H.runTicksToSettle();
  for (let k = 0; k < 120; k++) H.tick();
  const after = boundaryWalk(H, [1, 2, 3], { own: true });
  const mm1 = walkMm(before.get(1).pos, after.get(1).pos), mm2 = walkMm(before.get(2).pos, after.get(2).pos);
  const deg1 = quatAngleDeg(before.get(1).q, after.get(1).q);
  const stale = [1, 2].map((id) => {
    const ps = H.ctl.solution()?.pieces?.get(id) ?? [];
    const rt = ps.length ? (ps[ps.length - 1].route ?? null) : null;
    return rt ? ([...trackBefore.routes.values()].includes(rt) || rt === trackBefore.trayRoute) : null;
  });
  const ok = rebuilt && Number.isFinite(mm1) && mm1 < 1e-6 && Number.isFinite(mm2) && mm2 < 1e-6 && deg1 < DEG_EPS
    && after.get(1).kind === 'rest' && after.get(2).kind === 'rest'
    && after.get(1).bound === true && after.get(2).bound === true && stale.every((x) => x === false)
    && after.get(3).rejected === true && after.get(3).drawn === false;
  check(`L63 boundary E5 (a TABLE CHANGE and its revert — the rack memo) — every state kind walked: two balls resting on the tray and one rejected in an unserved corner, then a preview onto another bed and the revert (track object rebuilt ${rebuilt}); the next record draws ball 1 '${after.get(1).kind}' ${Number.isFinite(mm1) ? mm1.toFixed(4) : '—'} mm / ${deg1.toFixed(4)}° and ball 2 '${after.get(2).kind}' ${Number.isFinite(mm2) ? mm2.toFixed(4) : '—'} mm from their pre-preview poses, both seated on the LIVE track's own route objects (bound ${after.get(1).bound}/${after.get(2).bound}, still the previous track's ${stale.join('/')}), ball 3 rejected ${after.get(3).rejected} — before the fix only the memo's carriedRest was re-bound and the RESTORED SOLUTION's own pieces outranked it, so every carried ball of a reverted session stayed seated on a route object the current track does not own (the solver compares routes by identity)`,
    ok, JSON.stringify({ before: [...before], after: [...after], stale }));
}

// ---- L64 boundary E6: the host's ownership module LOADS LATE, every state kind -----------------------------------------
{
  const H = await boot({ track: 'TEST-terminal-chutes-high', host: 'legacy', expectEnabled: false });
  const refusedAtBoot = H.ctl.enabled === false && /V13/.test(String(H.ctl.reason));
  H.shoot(new Map([[1, pivotEntry(0.4, 4)]]), 2.0, 'R6E6-A');
  for (let k = 0; k < 30; k++) H.tick();
  const beforeHook = { enabled: H.ctl.enabled, drawn: H.posOf(1).marker === true, activations: H.ctl.stats.activations };
  // E6: sinkpivot.js binds and game.js publishes the accessor — the refusal is RE-VALIDATED (r5 class E)
  H.game.ballReturnOwnsSupported = true;
  H.game.sinkPoseAt = (s, dt, out) => (s && s.pivot ? poseInSink(s.pivot, dt, out ?? {}) : null);
  await H.settleActivation();
  H.shoot(new Map([[1, pivotEntry(0.4, 4)]]), 2.0, 'R6E6-B');
  H.runTicksToSettle();
  for (let k = 0; k < 240; k++) H.tick();
  const after = boundaryWalk(H, [1], { own: true });
  const ok = refusedAtBoot && beforeHook.enabled === false && beforeHook.drawn === false
    && H.ctl.enabled === true && H.ctl.stats.activations > beforeHook.activations
    && after.get(1).drawn === true && after.get(1).rejected === false && after.get(1).refusal === null;
  check(`L64 boundary E6 (the host's ownership module LOADS LATE) — every state kind walked: on an ownership-required track a host without the accessor is refused at boot (${refusedAtBoot}) and stays refused through a pivot pot (enabled ${beforeHook.enabled}, ball 1 drawn ${beforeHook.drawn}, ${beforeHook.activations} activation(s)); the accessor lands, the track re-activates (enabled ${H.ctl.enabled}, ${H.ctl.stats.activations} activations) and the next record's pivot arrival is served — ball 1 ${after.get(1).drawn ? `drawn '${after.get(1).kind}'` : 'NOT drawn'}, rejected ${after.get(1).rejected}, refusal ${after.get(1).refusal ?? 'none'} — the table declares this cell RE-VALIDATE(the live record) and r5 class E already enforced it, so the arm passes before the fix too`,
    ok, JSON.stringify({ refusedAtBoot, beforeHook, after: [...after] }));
}

// ---- L65 boundary E7: the sink's TTL EXPIRES, every state kind ---------------------------------------------------------
{
  const H = await boot({ host: 'owner' });
  const entry = pivotEntry(0.4, 4);
  const ttl = ttlOf(entry);
  const tCross = entry.t + ttl;   // the instant game.js stops asking the sink and hands the mesh over for good
  H.shoot(new Map([[1, entry]]), 3.0, 'R6E7-A');
  const trail = [];
  for (let k = 1; k * DT <= 3.0 + SETTLE_PAD - DT; k++) {
    const t = k * DT;
    H.frame(t);
    const p = H.ctl.poseAt(1, t);
    const sol = H.ctl.solution();
    const ps = sol?.pieces?.get(1) ?? [];
    const rt = ps.length ? (ps[ps.length - 1].route ?? null) : null;
    trail.push({ t, kind: p?.kind ?? null, pos: p ? [p.x, p.y, p.z] : null, drawn: H.posOf(1).marker === true,
      rejected: sol?.rejected?.has(1) === true, refused: refusalsOf(H.ctl).some((x) => x.id === 1),
      ledger: H.ctl.ledger().includes(1),
      bound: rt ? rt === (rt.pocket >= 0 ? (H.ctl.track.routes.get(rt.pocket) ?? null) : H.ctl.track.trayRoute) : null });
  }
  const posed = trail.filter((r) => r.pos);
  const firstPosed = posed.length ? posed[0].t : null;
  const gapAfterStart = posed.length ? trail.filter((r) => r.t > firstPosed && !r.pos).length : -1;
  let maxJump = 0, jumpAt = null;
  for (let i2 = 1; i2 < posed.length; i2++) { const d = walkMm(posed[i2 - 1].pos, posed[i2].pos); if (d > maxJump) { maxJump = d; jumpAt = posed[i2].t; } }
  const lastBefore = [...posed].reverse().find((r) => r.t < tCross) ?? null;
  const firstAfter = posed.find((r) => r.t >= tCross) ?? null;
  const acrossMm = lastBefore && firstAfter ? walkMm(lastBefore.pos, firstAfter.pos) : null;
  const firstDrawn = trail.find((r) => r.drawn)?.t ?? null;
  const drawnGap = firstDrawn === null ? -1 : trail.filter((r) => r.t > firstDrawn && !r.drawn).length;
  H.runToSettle();
  for (let k = 0; k < 60; k++) H.tick();
  const settled = boundaryWalk(H, [1], { own: true });
  const ok = posed.length > 0 && gapAfterStart === 0 && maxJump < 40 && Number.isFinite(acrossMm) && acrossMm <= maxJump + 1e-9
    && lastBefore.kind !== null && firstAfter.kind !== null && posed.every((r) => r.bound === true)
    && trail.every((r) => !r.rejected && !r.refused && !r.ledger)
    && firstDrawn !== null && drawnGap === 0
    && settled.get(1).kind === 'rest' && settled.get(1).bound === true && settled.get(1).drawn === true;
  check(`L65 boundary E7 (the sink's TTL EXPIRES) — every state kind walked: a pivot pot at ${entry.t.toFixed(2)} s with the host's TTL ${(ttl * 1e3).toFixed(0)} ms (crossing at ${tCross.toFixed(4)} s) — the module's solved motion is a pure function of t across it: first pose at ${firstPosed === null ? '—' : firstPosed.toFixed(4)} s, ${gapAfterStart} gaps after it, largest frame step ${maxJump.toFixed(3)} mm (at ${jumpAt === null ? '—' : jumpAt.toFixed(4)} s) and ${Number.isFinite(acrossMm) ? acrossMm.toFixed(3) : '—'} mm across the crossing itself ('${lastBefore?.kind}' → '${firstAfter?.kind}'), the module takes the mesh over at ${firstDrawn === null ? 'never' : `${firstDrawn.toFixed(4)} s`} and never hands it back (${drawnGap} unposed frames after), nothing is rejected, refused or dropped to the ledger at any frame, and the ball settles '${settled.get(1).kind}' on the live route (bound ${settled.get(1).bound}) — the TTL is the HOST's hand-back instant and resets no module state, so the arm passes on the PRE-FIX export too: it is the table's guard for that row`,
    ok, JSON.stringify({ ttl, tCross, firstPosed, gapAfterStart, maxJump, jumpAt, acrossMm, firstDrawn, drawnGap, lastBefore, firstAfter, settled: [...settled] }));
}


// ---- L66 boundary E8: the activation COMPLETES after PLAYBACK has begun, every state kind -----------------------------
{
  // Door A (#737 r7 class A): a FRESH activation — the session's first equipped bed, no rack memo to restore — lands inside
  // a record already playing. Without the join it never switches base for that record and stores no content snapshot of it,
  // so a later REVISIT restores nothing and starts from whatever the record in between left carried: its END states.
  const idsA = [0, 1, 3, 4, 7, 8, 9];             // A omits balls 5 and 6 (layout omissions → the tray, one behind the other) and 2 (off the table)
  const idsB = [0, 1, 2, 3, 4, 5, 7, 8, 9];       // B revives ball 5 and pots it down the chute; ball 6 is B's ONLY tray ball
  const sinksA = () => new Map([[1, pivotEntry(0.4, 4)], [3, legacyEntry(0.9, 0)]]);
  const evA = offTableEvents([2]);
  const T = mkTableShim('chinese8_pro_9ft');      // booted on a netted bed: armed, inert, and NO memo for the wpa track
  const H = await boot({ tableModule: T.shim, expectEnabled: false, host: 'owner' });
  const bootReason = String(H.ctl.reason ?? '');
  const inertAtBoot = H.ctl.enabled !== true && bootReason.length > 0;
  for (const id of [2, 5, 6]) markOffTable(H, id); // ball 2: the kernel drove it off the table (A's stream says so); balls 5 and 6: A's layout simply omits them
  H.shoot(sinksA(), 12.0, 'R7E8-A', evA);
  for (let k = 0; k < 30; k++) H.tick();          // half a second of A drawn by game.js alone
  const inertInRecord = H.ctl.enabled !== true && H.machine.state === 'PLAYBACK';
  T.switchTo('wpa_generic_9ft'); await H.settleActivation();   // E8: the activation completes HERE, mid-PLAYBACK
  const landed = { state: H.machine.state, clock: +H.game.clock.toFixed(4), enabled: H.ctl.enabled === true };
  for (let k = 0; k < 600; k++) H.tick();
  const v1 = boundaryWalk(H, [1, 2, 3, 5, 6], { own: true });
  H.quietLoad(new Map([[5, pivotEntry(0.4, 4)]]), 12.0, idsB, 'R7E8-B');   // B revives every ball and pots the omitted one
  for (let k = 0; k < 600; k++) H.tick();
  const inB = boundaryWalk(H, [5, 6], { own: true });
  H.quietLoad(sinksA(), 12.0, idsA, 'R7E8-A', evA);                        // the REVISIT: a fresh object, A's content
  for (let k = 0; k < 600; k++) H.tick();
  const v2 = boundaryWalk(H, [1, 2, 3, 5, 6], { own: true });
  const mm1 = walkMm(v1.get(1).pos, v2.get(1).pos), mm5 = walkMm(v1.get(5).pos, v2.get(5).pos), mm6 = walkMm(v1.get(6).pos, v2.get(6).pos);
  const deg5 = quatAngleDeg(v1.get(5).q, v2.get(5).q), deg1 = quatAngleDeg(v1.get(1).q, v2.get(1).q);
  const okA = inertAtBoot && inertInRecord && landed.state === 'PLAYBACK' && landed.enabled
    && v1.get(1).kind !== null && v1.get(1).drawn === true
    && v1.get(5).kind !== null && v1.get(5).ledger === true && v1.get(6).ledger === true && v1.get(3).rejected === true
    && typeof v1.get(2).refusal === 'string' && /\[OFF-TABLE\]/.test(v1.get(2).refusal) && v1.get(2).kind === null
    && Number.isFinite(mm5) && mm5 < 1e-6 && deg5 < DEG_EPS && Number.isFinite(mm1) && mm1 < 1e-6 && deg1 < DEG_EPS
    && Number.isFinite(mm6) && mm6 < 1e-6
    && v2.get(5).kind === v1.get(5).kind && v2.get(5).pocket === v1.get(5).pocket && v2.get(6).ledger === true
    && v2.get(1).bound === true && v2.get(5).bound === true
    && v2.get(3).rejected === true && v2.get(2).rejected === true && v2.get(2).kind === null
    && typeof v2.get(2).refusal === 'string' && /\[OFF-TABLE\]/.test(v2.get(2).refusal);

  // Door B (#737 r7 classes B/C): the re-activation completes at record Q's clock 1.5 s — AFTER the landing of a ball Q
  // itself potted. The solve must open at the EARLIER of the two openings, and the settle's re-solve must carry the
  // continuation forward as the SEED the solve was given, not as the piece the resume produced.
  const T2 = mkTableShim('wpa_generic_9ft');
  const H2 = await boot({ tableModule: T2.shim, host: 'owner' });
  H2.shoot(new Map([[1, legacyEntry(0.6, 4)]]), 1.4, 'R7E8-P'); H2.runTicksToSettle();
  for (let k = 0; k < 400 && H2.ctl.poseAt(1, H2.ctl.clock().t)?.kind !== 'roll'; k++) H2.tick();
  T2.switchTo('chinese8_pro_9ft'); await H2.settleActivation();            // away: ball 1 keeps rolling in the stashed session
  H2.shoot(new Map([[2, legacyEntry(0.1, 4)]]), 3.0, 'R7E8-Q');            // Q pots ball 2 early — its hand-off lands at 0.3551 s
  for (let k = 0; k < 90; k++) H2.tick();                                  // Q clock 1.5, still PLAYBACK
  const awayInRecord = H2.ctl.enabled !== true && H2.machine.state === 'PLAYBACK';
  T2.switchTo('wpa_generic_9ft'); await H2.settleActivation();             // E8 again: the re-activation completes mid-PLAYBACK
  const joinAt = +H2.game.clock.toFixed(6);
  H2.tick();                                                                // the first frame solved on the joined base
  const scan = [];
  for (let k = 0; k * DT <= joinAt + 1e-9; k++) { const t = k * DT; scan.push({ t: +t.toFixed(6), p: H2.ctl.poseAt(2, t), c: H2.ctl.poseAt(1, t) }); }
  const rollAt = scan.find((r) => r.p?.kind === 'roll')?.t ?? null;         // ball 2's own landing — 0.3551 s, not the join
  const posed = scan.filter((r) => r.p);
  let gaps = 0; for (let i = 1; i < scan.length; i++) if (scan[i - 1].p && !scan[i].p) gaps += 1;
  let maxJump = 0; for (let i = 1; i < posed.length; i++) { const d = walkMm([posed[i - 1].p.x, posed[i - 1].p.y, posed[i - 1].p.z], [posed[i].p.x, posed[i].p.y, posed[i].p.z]); if (d > maxJump) maxJump = d; }
  const carriedFrom = scan.find((r) => r.c)?.t ?? null;                     // ball 1 is ABSENT before the origin it was carried at (round 22d D1)
  const wB = boundaryWalk(H2, [1, 2], { own: true });
  H2.runTicksToSettle();
  const firstRows = rowsOf(H2, [1, 2], 60);                                 // …and Q replays over the join frame for frame (the seed cell)
  H2.replay(); H2.runTicksToSettle();
  const againRows = rowsOf(H2, [1, 2], 60);
  const alB = alignRows(firstRows, againRows);
  const okB = awayInRecord && rollAt !== null && Math.abs(rollAt - 0.355088) < 0.02 && gaps === 0 && maxJump < 40
    && carriedFrom !== null && carriedFrom > rollAt + 0.5 && Math.abs(carriedFrom - joinAt) < 3 * DT
    && wB.get(1).bound === true && wB.get(2).bound === true && wB.get(1).drawn === true && wB.get(2).drawn === true
    && wB.get(1).rejected === false && wB.get(2).rejected === false && alB.ok;

  check(`L66 boundary E8 (the activation COMPLETES after PLAYBACK has begun) — every state kind walked. Door A, a FRESH activation (inert on the netted bed at boot ${inertAtBoot} — "${bootReason.slice(0, 40)}", still inert ${inertInRecord} inside record A, equipped at A clock ${landed.clock}): A pots ball 1 ('${v1.get(1).kind}', drawn ${v1.get(1).drawn}) and ball 3 into an unserved corner (rejected ${v1.get(3).rejected}), names ball 2 off-table ("${(v1.get(2).refusal ?? 'nothing').slice(0, 28)}…") and omits balls 5 and 6 to the tray ('${v1.get(5).kind}', stations ${(v1.get(5).pos[0] * 1e3).toFixed(3)} and ${(v1.get(6).pos[0] * 1e3).toFixed(3)} mm); record B revives ball 5 and pots it down the chute (pocket ${inB.get(5).pocket}), leaving ball 6 alone at the tray's first station (${(inB.get(6).pos[0] * 1e3).toFixed(3)} mm), and the REVISIT of A reproduces the first visit — ball 5 ${Number.isFinite(mm5) ? mm5.toFixed(4) : '—'} mm / ${deg5.toFixed(4)}°, ball 6 ${Number.isFinite(mm6) ? mm6.toFixed(4) : '—'} mm, ball 1 ${Number.isFinite(mm1) ? mm1.toFixed(4) : '—'} mm / ${deg1.toFixed(4)}°, both on the LIVE track's routes (bound ${v2.get(1).bound}/${v2.get(5).bound}), ball 3 still rejected, ball 2 still named off-table — before the fix the late activation took no base switch and stored no snapshot for A, so the revisit inherited B's END states — the two tray balls came back SWAPPED (57.150 mm each) with ball 5 still wearing the chute route and basis B gave it (pocket 4, 148.772°). Door B, the re-activation completing at record Q's clock ${joinAt.toFixed(4)}: Q's own pot lands at ${rollAt === null ? 'never' : `${rollAt.toFixed(4)} s`} — its own instant, not the join — and runs unbroken to it (${posed.length} posed samples, ${gaps} gaps, largest step ${maxJump.toFixed(3)} mm), while the ball carried from P is absent until the origin it was carried at (${carriedFrom === null ? 'never' : `${carriedFrom.toFixed(4)} s`}); Q then replays over the join frame for frame (${alB.n} rows, mismatch ${alB.at}) — before the fix the solve opened at the continuation and Q's own landing was delayed to ${joinAt.toFixed(4)} s with the ball frozen at the entry, and the settle's re-solve read the carried ball out of the piece its resume PRODUCED (a cluster join merged twice: 0.3332 → 0.3133 → 0.3033 m/s, 0.166 mm at the first drawn frame)`,
    okA && okB, JSON.stringify({ inertAtBoot, bootReason, inertInRecord, landed, v1: [...v1], inB: [...inB], v2: [...v2], mm1, mm5, mm6, deg1, deg5, okA,
      awayInRecord, joinAt, rollAt, gaps, maxJump: +maxJump.toFixed(4), carriedFrom, posed: posed.length, alB, wB: [...wB], okB }));
}

// ---- L67 the record snapshot is taken at the RECORD'S OWN CLOCK (#737 r8 class A) ---------------------------------------
{
  // §27.12: a record's snapshot is the pose the record SHOWS AT ITS OWN ORIGIN. The completion pass filled it from
  // `carriedRest`, the ledger memo — and that memo already holds the END of the solve (continuationAt(…, Infinity)): where the
  // ball came to rest AFTER the record's own arrivals had pushed it down the tray. A revisit then started from the future.
  // The sequence: record P omits balls 4 and 5 to the tray (one behind the other); record A revives ball 4, keeps ball 5
  // omitted, keeps ball 2 off the layout and POTS ball 1 at 0.3 s — the arrival pushes the two seated balls one station along,
  // so ball 2's pose at A's origin and its pose at A's end are two different stations; record B then revives everything and
  // pots ball 6; the REVISIT of A must open where A opened.
  const idsAll = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  const idsP = idsAll.filter((i) => i !== 4 && i !== 5);   // P omits 4 and 5 → the tray, one behind the other
  const idsA = idsAll.filter((i) => i !== 2 && i !== 5);   // A revives 4, keeps 5 omitted, omits 2, and pots ball 1
  const H = await boot({ host: 'owner' });
  const sinksA = () => new Map([[1, pivotEntry(0.3, 4)]]);
  const early = 6;                                          // six frames in: A's own opening, before its arrival has landed
  H.shoot(new Map(), 0.6, 'R8A-live'); H.runToSettle();
  H.dvrOpen(new Map(), 12.0, idsAll, 'R8A-R0');
  for (let k = 1; k <= 12; k++) H.frame(k * DT);
  H.quietLoad(new Map(), 12.0, idsP, 'R8A-P');
  for (let k = 1; k <= 600; k++) H.frame(k * DT);
  const wP = boundaryWalk(H, [4, 5], { own: true });
  H.quietLoad(sinksA(), 12.0, idsA, 'R8A-A');
  for (let k = 1; k <= early; k++) H.frame(k * DT);
  const o1 = boundaryWalk(H, [2, 5], { own: true });         // A's OWN opening
  for (let k = early + 1; k <= 600; k++) H.frame(k * DT);
  const v1 = boundaryWalk(H, [1, 2, 5], { own: true });
  const snapsA = snapshotsOf(H.ctl);
  const cellA = snapsA ? snapsA[snapsA.length - 1] : null;   // the record just solved: A's own content snapshot
  const cell = (id) => (cellA ? cellA.states.find((x) => x.id === id) ?? null : null);
  H.quietLoad(new Map([[6, pivotEntry(0.4, 4)]]), 12.0, idsAll, 'R8A-B');
  for (let k = 1; k <= 600; k++) H.frame(k * DT);
  H.quietLoad(sinksA(), 12.0, idsA, 'R8A-A');                // the REVISIT: a fresh object, A's content
  for (let k = 1; k <= early; k++) H.frame(k * DT);
  const o2 = boundaryWalk(H, [2, 5], { own: true });
  for (let k = early + 1; k <= 600; k++) H.frame(k * DT);
  const v2 = boundaryWalk(H, [1, 2, 5], { own: true });
  const o2mm = walkMm(o1.get(2).pos, o2.get(2).pos), o5mm = walkMm(o1.get(5).pos, o2.get(5).pos);
  const e1mm = walkMm(v1.get(1).pos, v2.get(1).pos), e2mm = walkMm(v1.get(2).pos, v2.get(2).pos), e5mm = walkMm(v1.get(5).pos, v2.get(5).pos);
  const degO2 = quatAngleDeg(o1.get(2).q, o2.get(2).q), degE2 = quatAngleDeg(v1.get(2).q, v2.get(2).q);
  const breaches = breachesOf(H.ctl);
  const mmOf = (w, id) => (w.get(id).pos ? (w.get(id).pos[0] * 1e3).toFixed(3) : '—');
  const ok = wP.get(4).kind === 'rest' && wP.get(5).kind === 'rest'
    && o1.get(2).kind === 'rest' && o1.get(5).kind === 'rest' && v1.get(1).kind === 'rest'
    && !!cellA && cell(2) && cell(2).kind === 'rest' && cell(5) && cell(5).kind === 'rest'
    // the cells hold the OPENING stations, one station apart, not the two the record ENDS on
    && Math.abs(cell(2).D - o1.get(2).D) < 1e-9 && Math.abs(cell(5).D - o1.get(5).D) < 1e-9
    && Math.abs(cell(2).D - v1.get(2).D) > 1e-3
    && Number.isFinite(o2mm) && o2mm < 1e-6 && Number.isFinite(o5mm) && o5mm < 1e-6 && degO2 < DEG_EPS
    && Number.isFinite(e1mm) && e1mm < 1e-6 && Number.isFinite(e2mm) && e2mm < 1e-6 && Number.isFinite(e5mm) && e5mm < 1e-6 && degE2 < DEG_EPS
    && breaches === 0;
  check(`L67 the record snapshot is taken at the RECORD'S OWN CLOCK (#737 r8 class A): P omits balls 4 and 5 to the tray (${mmOf(wP, 4)} and ${mmOf(wP, 5)} mm); A revives 4, keeps 5 seated and pots ball 1 at 0.3 s — A OPENS with ball 2 at D ${o1.get(2).D === null ? '—' : (o1.get(2).D * 1e3).toFixed(3)} mm and ENDS with it at ${v1.get(2).D === null ? '—' : (v1.get(2).D * 1e3).toFixed(3)} mm (the arrival pushed it one station along), and A's own snapshot cell holds ${cell(2) ? (cell(2).D * 1e3).toFixed(3) : '—'} mm for ball 2 and ${cell(5) ? (cell(5).D * 1e3).toFixed(3) : '—'} mm for ball 5 — the OPENING, not the end (${breaches} write refused by the snapshot writer for being read off the record's clock); record B revives everything and pots ball 6; the REVISIT of A opens where A opened — ball 2 ${Number.isFinite(o2mm) ? o2mm.toFixed(4) : '—'} mm / ${degO2.toFixed(4)}°, ball 5 ${Number.isFinite(o5mm) ? o5mm.toFixed(4) : '—'} mm — and ends where A ended (ball 1 ${Number.isFinite(e1mm) ? e1mm.toFixed(4) : '—'} mm, ball 2 ${Number.isFinite(e2mm) ? e2mm.toFixed(4) : '—'} mm / ${degE2.toFixed(4)}°, ball 5 ${Number.isFinite(e5mm) ? e5mm.toFixed(4) : '—'} mm) — before the fix the cell carried the ledger memo's END-of-solve station (continuationAt(…, ∞)) and the revisit opened ball 2 at ${v1.get(2).D === null ? '—' : (v1.get(2).D * 1e3).toFixed(3)} mm, 57.150 mm down the tray from where A shows it, sharing a station with ball 5`,
    ok, JSON.stringify({ wP: [...wP], o1: [...o1], v1: [...v1], o2: [...o2], v2: [...v2], cellA, o2mm, o5mm, e1mm, e2mm, e5mm, degO2, degE2, breaches }));
}


// ---- L68 the record snapshot is TOTAL: a hidden ball has a cell of its own (#737 r8 class B) ---------------------------
{
  // §27.12: a ball the record's layout omits with no station this session is HIDDEN — and pre-fix it simply had no snapshot
  // cell, so restoring the record left it to the mutable `carriedRest` fallback and a LATER record's route and station
  // answered for it. The sequence, on the terminal-chutes fixture (no tray: every seated ball is in a pocket's own chute):
  // record A omits ball 1 and nothing else has ever potted it — hidden; record B pots it into pocket 4's chute; the REVISIT
  // of A must hide it again. Gated with the completeness assertion the order asks for: every record's snapshot has one entry
  // per ball, and the writer refused nothing.
  const idsAll = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  const idsA = idsAll.filter((i) => i !== 1);               // A omits ball 1: hidden, no chute known
  const H = await boot({ host: 'owner', track: 'TEST-terminal-chutes' });
  const drawsOf = (n) => { let d = 0; for (let k = 1; k <= n; k++) { H.frame(k * DT); if (H.posOf(1).marker === true) d += 1; } return d; };
  H.shoot(new Map(), 0.6, 'R8B-live'); H.runToSettle();
  H.dvrOpen(new Map(), 12.0, idsAll, 'R8B-R0');
  for (let k = 1; k <= 12; k++) H.frame(k * DT);
  H.quietLoad(new Map(), 12.0, idsA, 'R8B-A');
  const drawsA1 = drawsOf(300);
  const a1 = boundaryWalk(H, [1], { own: true });
  const snapA = (snapshotsOf(H.ctl) ?? []).slice(-1)[0] ?? null;
  const cellA1 = snapA ? snapA.states.find((x) => x.id === 1) ?? null : null;
  H.quietLoad(new Map([[1, pivotEntry(0.4, 4)]]), 12.0, idsAll, 'R8B-B');
  const drawsB = drawsOf(300);
  const b = boundaryWalk(H, [1], { own: true });
  H.quietLoad(new Map(), 12.0, idsA, 'R8B-A');              // the REVISIT of A
  const drawsA2 = drawsOf(300);
  const a2 = boundaryWalk(H, [1], { own: true });
  const snaps = snapshotsOf(H.ctl) ?? [];
  const complete = snaps.length > 0 && snaps.every((s) => s.size === H.balls.length);
  const sizes = snaps.map((s) => s.size).join('/');
  const breaches = breachesOf(H.ctl);
  const ok = a1.get(1).kind === null && a1.get(1).drawn === false && drawsA1 === 0
    && !!cellA1 && cellA1.kind === 'hidden' && typeof cellA1.why === 'string' && cellA1.why.length > 0
    && b.get(1).kind === 'rest' && b.get(1).drawn === true && b.get(1).pocket === 4 && drawsB > 0
    && a2.get(1).kind === null && a2.get(1).drawn === false && drawsA2 === 0
    && complete && breaches === 0;
  check(`L68 the record snapshot is TOTAL — a hidden ball has a cell of its own (#737 r8 class B), on TEST-terminal-chutes (no tray, terminal chutes): record A omits ball 1 with no chute known anywhere in the session — '${a1.get(1).kind}', ${drawsA1} draws in 300 frames — and A's own snapshot holds an explicit cell for it ('${cellA1 ? cellA1.kind : 'NO CELL'}': ${cellA1 && cellA1.why ? cellA1.why : '—'}); record B pots ball 1 into pocket ${b.get(1).pocket}'s chute ('${b.get(1).kind}', ${drawsB} draws, z ${b.get(1).pos ? (b.get(1).pos[2] * 1e3).toFixed(2) : '—'} mm); the REVISIT of A hides it again — '${a2.get(1).kind}', ${drawsA2} draws. Completeness: ${snaps.length} record snapshots, entries ${sizes} against ${H.balls.length} balls (${complete ? 'every ball has a cell' : 'INCOMPLETE'}), ${breaches} write refused by the writer for being read off the record's clock — before the fix the omitted ball had NO cell and the mutable ledger memo answered for it, so the revisit drew ball 1 at rest in B's chute (pocket 4)`,
    ok, JSON.stringify({ a1: [...a1], b: [...b], a2: [...a2], drawsA1, drawsB, drawsA2, cellA1, snaps: snaps.map((s) => ({ origin: s.origin, size: s.size })), complete, breaches }));
}

// ---- L69 (#737 r9 class A): the furniture RE-CHECK is keyed with the SAME builder V16 keys its cache with -------------------
// The app broadcasts `ob:settings` for EVERY settings change — sound, quality, the equipment station's bed switch alike — and the
// module answers by re-reading the furniture and comparing it against the key the live activation was cleared against: the same
// furniture, nothing to do. Round 8 added the declared-environment component to V16's key and left this comparison building its
// own string without it, so NO broadcast ever matched: a sound slider tore the live activation down (the returned balls parked,
// both companions re-fetched, the design gate re-run). ONE builder, both sides. The arm hands the module the app's own broadcast.
{
  const THREE = await import('three');
  const scene = new THREE.Scene();
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.02, 0.2), new THREE.MeshBasicMaterial());
  box.name = 'obTestLeg'; box.position.set(0, 1.0, 0); scene.add(box); scene.updateMatrixWorld(true); // a metre above the bed: real furniture, clear of every station
  // Node has no window.addEventListener, so the module's registration (index.js, inside its own try/catch) is a no-op in this
  // harness — install the seam for THIS boot only and hand the broadcast to exactly the handlers that boot registered
  const bus = [];
  const hadAdd = Object.prototype.hasOwnProperty.call(globalThis, 'addEventListener');
  const savedAdd = globalThis.addEventListener;
  globalThis.addEventListener = (type, fn) => { if (type === 'ob:settings') bus.push(fn); };
  let H = null; let bootErr = null;
  try { H = await boot({ track: 'TEST-synthetic-wire-slide', host: 'owner', scene }); } catch (e) { bootErr = e?.message ?? String(e); }
  finally { if (hadAdd) globalThis.addEventListener = savedAdd; else delete globalThis.addEventListener; }
  let listeners = bus.length; let dA = null; let parked = null; let moved = null; let before = null; let after = null;
  let e0 = null; let e1 = null; let k0 = null; let k1 = null; let restBefore = false; let parkedAtOnce = null;
  if (H) {
    const a0 = H.ctl.stats.activations; e0 = H.ctl.stats.furnitureEvals; k0 = H.ctl.furniture?.key ?? null;
    H.shoot(new Map([[1, legacyEntry(1.0)]]), 2.0);
    H.runToSettle();
    for (let k = 0; k < 900 && H.ctl.poseAt(1, H.ctl.clock().t)?.kind !== 'rest'; k++) H.frame(0);
    restBefore = H.ctl.poseAt(1, H.ctl.clock().t)?.kind === 'rest';
    before = H.posOf(1);
    const ev = typeof CustomEvent === 'function' ? new CustomEvent('ob:settings', { detail: { key: 'sound', value: 0.5 } }) : { type: 'ob:settings', detail: { key: 'sound', value: 0.5 } };
    for (const fn of bus) fn(ev);                     // settings.js's broadcast: the sound slider, nothing about the bed
    // the module answers on the MICROTASK queue the listener queues (`queueMicrotask(checkTable)` + the re-check); a teardown
    // there parks every ball this module posed, and the re-activation that follows waits on a FETCH, so the park is visible
    // here and (on a fast disk) can be over before the next frame — the drain below is the belt, this is the probe
    parkedAtOnce = false;
    for (let i = 0; i < 400 && !parkedAtOnce; i++) { await Promise.resolve(); if (H.posOf(1).marker !== true) parkedAtOnce = true; }
    for (let i = 0; i < 40 && !parkedAtOnce; i++) { await new Promise((r) => setImmediate(r)); if (H.posOf(1).marker !== true) parkedAtOnce = true; }
    parked = 0;
    for (let k = 0; k < 90; k++) { H.frame(0); if (H.posOf(1).marker !== true) parked += 1; await new Promise((r) => setTimeout(r, 2)); } // the re-check is async (the `three` import, the read): drained
    after = H.posOf(1);
    dA = H.ctl.stats.activations - a0;
    e1 = H.ctl.stats.furnitureEvals; k1 = H.ctl.furniture?.key ?? null;
    moved = dist(before, after);
  }
  const ok = !bootErr && !!H && listeners === 1 && restBefore && before.marker === true
    && dA === 0 && parkedAtOnce === false && parked === 0 && moved <= 1e-12 && after.marker === true && after.vis === before.vis
    && H.ctl.enabled === true && H.ctl.trackId === 'TEST-synthetic-wire-slide' && H.ctl.reason !== 'pending'
    && e1 === e0 && k1 === k0 && k0 !== null;
  check(`L69 a settings broadcast over UNCHANGED furniture is not a re-activation (#737 r9 class A): the module registered ${listeners} \`ob:settings\` listener; ball 1 at rest on the track, the app broadcasts a SOUND change → ${dA} re-activations, ${parkedAtOnce === null ? 'n/a' : parkedAtOnce ? 'PARKED on the listener\u0027s own microtask queue' : 'never unposed on the listener\u0027s microtask queue'}, ${parked} of 90 frames unposed, the ball moved ${moved === null ? 'n/a' : (moved * 1e3).toFixed(6)} mm, V16 evaluations ${e0} → ${e1} and the cleared key unchanged (pre-fix: 1 re-activation and a park, because the comparison rebuilt the key without the environment component V16 appends)`,
    ok, JSON.stringify({ bootErr, listeners, restBefore, before, after, dA, parkedAtOnce, parked, moved, e0, e1, keySame: k1 === k0, key: (k0 ?? '').slice(-40), enabled: H?.ctl.enabled, reason: H?.ctl.reason }));
}

// ---- L70 (#737 companion 2, class A — review round 12 P2): the ORIENTATION BASIS is rebound from RECORD MEMBERSHIP, never from
// the sampled `pocketed` flag. game.js writes `baseQuat` in exactly two places — `shoot()` (game.js:936) and `loadRecord()`
// (game.js:1145/1147) — and both write it over `game.playbackBalls`, the record's own membership: a record that REINTRODUCES a
// ball pins that ball's basis (identity for a quiet stage), a ball still in the return system and absent from the record does not
// have its pinned. r5 class D read the live flag instead — it dropped the captured basis of every ball that was NOT `pocketed` at
// the frame the module happened to solve on. That flag is a function of the SEEK HISTORY: a quietly staged record that reintroduces
// a previously returned ball and is sought straight past that ball's sink TTL reads it `pocketed` at the record's first solve (the
// purge skips it, the PREVIOUS record's basis survives) and NOT pocketed when the frame at t = 0 was rendered first (the purge
// drops it, the new record's identity pin is captured). Same record, same frame, same station — two orientations. The reproduction
// below reads them 90.0° apart before the fix (the reviewer measured 91.7° on their own staging).
{
  const qA = mkQuat(0, Math.SQRT1_2, 0, Math.SQRT1_2);     // the rack A was STRUCK with (90° about y) — shoot() pins it as A's basis
  const idsAll = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  const idsNo5 = [0, 1, 2, 3, 4, 6, 7, 8, 9];              // …the control: B omits ball 5, so B pins nothing for it
  const run = async (direct, reintroduce) => {
    const H = await boot();
    for (const b of H.balls) b.mesh.quaternion.copy(qA);   // the rack as it stands at the stroke
    H.shoot(new Map([[5, legacyEntry(0.3, 4)]]), 1.5, 'A'); // game.js:936: baseQuat = the mesh orientation = qA, over A's membership
    for (let k = 1; k * DT <= 1.0; k++) H.frame(k * DT);    // A to 1.0 s: ball 5 potted into the served right middle and in the system
    const heldA = H.posOf(5).marker;
    H.quietLoad(new Map(reintroduce ? [[5, legacyEntry(0.5, 4)]] : []), 2.5, reintroduce ? idsAll : idsNo5, 'B'); // B: quiet stage, identity bases over ITS membership
    if (!direct) for (let k = 1; k < 120; k++) H.frame(k * DT); // through the pot, frame by frame…
    H.frame(2.0);                                             // …or straight to 2.0 s (1.5 s past the pot, 1.05 s past the TTL)
    const pos = H.posOf(5); const p = H.ctl.poseAt(5, 2.0);
    const drawn = H.balls[5].mesh.quaternion.clone();
    // what the PRE-FIX reader would have composed on this frame: the solved pose against record A's basis (the red arm)
    const asPre = p ? mkQuat(p.qx, p.qy, p.qz, p.qw).multiply(qA) : null;
    return { heldA, marker: pos.marker, kind: p?.kind ?? null, drawn, asPre,
      x: +(pos.x * 1e3).toFixed(4), y: +(pos.y * 1e3).toFixed(4), z: +(pos.z * 1e3).toFixed(4) };
  };
  const D = await run(true, true), S = await run(false, true);       // the reintroduction, two seek histories
  const CD = await run(true, false), CS = await run(false, false);   // the CARRY control: B omits ball 5
  const mm = Math.hypot(D.x - S.x, D.y - S.y, D.z - S.z);
  const deg = quatAngleDeg(D.drawn, S.drawn);
  const mmC = Math.hypot(CD.x - CS.x, CD.y - CS.y, CD.z - CS.z);
  const degC = quatAngleDeg(CD.drawn, CS.drawn);
  const basisDeg = quatAngleDeg(qA, mkQuat());                        // 90.0°: the two bases this scenario can compose against
  const redDeg = D.asPre ? quatAngleDeg(D.drawn, D.asPre) : NaN;      // the RED ARM: the pre-fix composition is measurably elsewhere
  const carryDeg = CD.asPre ? quatAngleDeg(CD.drawn, CD.asPre) : NaN; // …and the CARRIED ball is still composed against A's basis
  const ok = D.heldA === true && S.heldA === true && CD.heldA === true && CS.heldA === true
    && D.marker === true && S.marker === true && CD.marker === true && CS.marker === true
    && D.kind !== null && D.kind === S.kind && CD.kind !== null && CD.kind === CS.kind
    && mm <= 1e-6 && deg <= 1e-4 && mmC <= 1e-6 && degC <= 1e-4          // 1e-4 deg = the quaternion round-trip's own floor; the defect is 90°
    && Math.abs(redDeg - basisDeg) <= 1e-4 && basisDeg > 1 && carryDeg <= 1e-4;
  check(`L70 the orientation basis is rebound from RECORD MEMBERSHIP, not the sampled pocketed flag (#737 companion 2, class A): record A is struck with a rack ${basisDeg.toFixed(1)}° from identity and pots ball 5 into the served right middle (held ${D.heldA}); the quietly staged record B REINTRODUCES ball 5 and pots it again at 0.5 s — sought straight to 2.0 s it is drawn '${D.kind}' at (${D.x}, ${D.y}, ${D.z}) mm, sought frame by frame '${S.kind}' at (${S.x}, ${S.y}, ${S.z}) mm: ${mm.toFixed(4)} mm and ${deg.toFixed(4)}° apart — before the fix the two seek histories agreed on the station and stood ${basisDeg.toFixed(1)}° apart in orientation, because the direct seek found ball 5 already \`pocketed\` (past its sink TTL) and the live-ball purge kept A's basis for a ball B had just re-pinned to identity (the reviewer measured 91.7° on their own staging). RED ARM: on that same frame the pre-fix composition — the solved pose against A's basis — sits ${redDeg.toFixed(4)}° from what is drawn (= the ${basisDeg.toFixed(1)}° between the two bases), so the ${deg.toFixed(4)}° above is a measurement and not a tautology. CARRY control: a record B that does NOT reintroduce ball 5 pins nothing for it, and the ball keeps the basis it was captured against — ${mmC.toFixed(4)} mm / ${degC.toFixed(4)}° between the same two seek histories, and ${carryDeg.toFixed(4)}° from A's own composition (the clear reads membership, so it never over-clears)`,
    ok, JSON.stringify({ D: { heldA: D.heldA, marker: D.marker, kind: D.kind, x: D.x, y: D.y, z: D.z }, S: { marker: S.marker, kind: S.kind, x: S.x, y: S.y, z: S.z }, CD: { marker: CD.marker, kind: CD.kind, x: CD.x, y: CD.y, z: CD.z }, CS: { marker: CS.marker, kind: CS.kind, x: CS.x, y: CS.y, z: CS.z }, mm: +mm.toFixed(6), deg: +deg.toFixed(6), mmC: +mmC.toFixed(6), degC: +degC.toFixed(6), basisDeg: +basisDeg.toFixed(4), redDeg: +redDeg.toFixed(6), carryDeg: +carryDeg.toFixed(6) }));
}

// ---- L70 (#707 prep FIX5, review 707m5 P2): an activation that completes AFTER the record has SETTLED still snapshots it ---------
// FIX1 made activation asynchronous (the design gate off the UI thread), so a track can land seconds after the shot. Review's
// sequence on TEST-terminal-chutes (no tray: a ball the record omits with no station is HIDDEN, L68): record A omits ball 1 and
// settles while the track is still pending; the activation lands in AIM; record B pots ball 1 into pocket 4's chute; a quiet
// revisit of A. index.js:1381 (boundary E8) joined a record only INSIDE PLAYBACK, so the landing in AIM took no base switch, A's
// first solve stored no snapshot, and the revisit of A carried B's END: ball 1 drawn at rest in B's chute during A — a revisit
// that does not render its own record (the ownership ledger:50–54). Now the completion joins the record whatever the machine's state:
// the same `lateJoinSwitch` the pre-settlement path calls, the record's own clock (frozen at its settle) as the origin.
// The pending FRESH activation (no memo — the E8 path, not the memo path L38/L39 exercise): boot on the diamond bed, where the
// URL-armed wpa track is refused, then hold the track fetch and switch to the wpa bed, which has never activated.
const L70_BASE_DIGEST = '294352f2a02fe857'; // L70d: sha256 (first 16 hex) of the pre-settlement snapshot's STATES, every number quantised to 1e-6 (CIWIRE-FIX2: portable across ARM64 / x64; re-pinned from 294352f2a02fe857, the raw-float digest of 16760237)
const L70_QUANTUM = 1e-6; const L70_PERTURB = Number(process.env.OB_PIN_PERTURB ?? 0) || 0; let l70Perturbed = L70_PERTURB === 0;
const l70Replacer = (k, v) => { if (typeof v !== 'number' || Number.isInteger(v) || !Number.isFinite(v)) return v; if (!l70Perturbed) { v += L70_PERTURB; l70Perturbed = true; } const q = Math.round(v / L70_QUANTUM); return q === 0 ? 0 : q * L70_QUANTUM; };
const L70_boot = async ({ companionDelayMs = 0 } = {}) => {
  const F = heldFetch('/tracks/TEST-terminal-chutes'); const T = mkTableShim('diamond_proam_9ft');
  const fetchImpl = companionDelayMs ? async (url, init) => { if (!String(url).includes('/tracks/')) await new Promise((r) => setTimeout(r, companionDelayMs)); return F.fetchImpl(url, init); } : F.fetchImpl;
  const H = await boot({ host: 'owner', track: 'TEST-terminal-chutes', tableModule: T.shim, fetchImpl, expectEnabled: false });
  F.hold(); T.switchTo('wpa_generic_9ft'); H.tick();
  return { F, T, H, pending: H.ctl.reason === 'pending' && H.ctl.enabled === false };
};
const L70_hide = (H, id) => { const b = H.balls[id]; b.pocketed = true; b.mesh.visible = false; b.mesh.position.set(0, -10, 0); }; // the record's layout omits the ball (quietLoad's parking, ahead of a shoot)
const L70_show = (H, id) => { const b = H.balls[id]; b.pocketed = false; b.mesh.visible = true; b.mesh.position.set(0, 0, 0); };
const L70_walk = (H, n) => { let d = 0; for (let k = 1; k <= n; k++) { H.tick(); if (H.posOf(1).marker === true) d += 1; } const w = boundaryWalk(H, [1], { own: true }).get(1); return { d, kind: w.kind, drawn: w.drawn, pocket: w.pocket, D: w.D === null ? null : +w.D.toFixed(6), ledger: w.ledger }; };
{
  const idsAll = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]; const idsA = idsAll.filter((i) => i !== 1);
  const { F, H, pending } = await L70_boot();
  L70_hide(H, 1);
  H.shoot(new Map(), 0.6, 'L70-A'); H.runTicksToSettle();                    // A omits ball 1 and settles while the track is pending
  const settleA = +H.game.clock.toFixed(6); const atSettle = { state: H.machine.state, pending: H.ctl.reason === 'pending' };
  for (let k = 0; k < 30; k++) H.tick();                                      // an AIM dwell: the completion instant is not the settle instant
  const clockBeforeLanding = +H.ctl.clock().t.toFixed(6);                    // the module's own clock has never run (the track was pending)
  F.release(); await H.settleActivation();
  const landed = { state: H.machine.state, gameClock: +H.game.clock.toFixed(6), enabled: H.ctl.enabled, reason: H.ctl.reason, clock: +H.ctl.clock().t.toFixed(6) };
  H.tick();                                                                   // the first frame after the landing = the first solve
  const snapsA = (snapshotsOf(H.ctl) ?? []).map((s) => ({ origin: +s.origin.toFixed(6), size: s.size, cell1: s.states.find((x) => x.id === 1) ?? null }));
  const clockAfterFirstFrame = +H.ctl.clock().t.toFixed(6);
  const a0 = L70_walk(H, 30);                                                 // A after the landing: ball 1 hidden
  L70_show(H, 1);
  H.shoot(new Map([[1, pivotEntry(0.4, 4)]]), 12.0, 'L70-B');                // B pots ball 1 into pocket 4's chute
  const b1 = L70_walk(H, 300);
  H.quietLoad(new Map(), 12.0, idsA, 'L70-A');                                // the REVISIT of A — a fresh object, A's content
  const a1 = L70_walk(H, 300);
  H.quietLoad(new Map([[1, pivotEntry(0.4, 4)]]), 12.0, idsAll, 'L70-B');    // B revisited
  const b2 = L70_walk(H, 300);
  H.quietLoad(new Map(), 12.0, idsA, 'L70-A');                                // A revisited again
  const a2 = L70_walk(H, 300);
  const snaps = snapshotsOf(H.ctl) ?? []; const breaches = breachesOf(H.ctl);
  const complete = snaps.length > 0 && snaps.every((s) => s.size === H.balls.length);
  const okA = pending && atSettle.state === 'AIM' && atSettle.pending && landed.state === 'AIM' && landed.enabled === true
    && snapsA.length === 1 && snapsA[0].cell1?.kind === 'hidden'
    && a0.kind === null && a0.drawn === false && a0.d === 0
    && b1.kind === 'rest' && b1.pocket === 4 && b1.drawn === true && b1.d > 0
    && a1.kind === null && a1.drawn === false && a1.d === 0
    && JSON.stringify(b2) === JSON.stringify(b1) && JSON.stringify(a2) === JSON.stringify(a1)
    && snaps.length === 2 && complete && breaches === 0;
  check(`L70a review's sequence (#707 prep FIX5): record A omits ball 1 and settles at ${settleA} while the track is pending; the activation lands in ${landed.state} (enabled ${landed.enabled}); the first frame stores ${snapsA.length} snapshot(s) (ball 1: ${snapsA[0]?.cell1?.kind ?? 'no cell'}); B pots ball 1 into pocket ${b1.pocket} (${b1.kind}, ${b1.d} draws); the quiet REVISIT of A shows ball 1 '${a1.kind}' with ${a1.d} draws in 300 frames (16760237: 0 snapshots after the landing, the revisit 'rest' in pocket 4, 300/300 draws); A and B byte-stable across two revisits (${JSON.stringify(a2) === JSON.stringify(a1)} / ${JSON.stringify(b2) === JSON.stringify(b1)}); ${snaps.length} snapshots, complete ${complete}, breaches ${breaches}`,
    okA, JSON.stringify({ pending, settleA, atSettle, landed, snapsA, a0, b1, a1, b2, a2, snaps: snaps.map((s) => ({ origin: s.origin, size: s.size })), complete, breaches }));
  const okB = snapsA.length === 1 && near(snapsA[0].origin, settleA, 1e-9) && settleA > 0 && clockBeforeLanding === 0 && near(landed.clock, settleA, 1e-9) && near(clockAfterFirstFrame, settleA + DT, 1e-6);
  check(`L70b the late snapshot's time origin is the record's OWN settle clock: origin ${snapsA[0]?.origin ?? 'none'} = settle ${settleA} (the module's clock read ${clockBeforeLanding} before the landing and ${landed.clock} after it; the next frame continued to ${clockAfterFirstFrame} = origin + dt) — not a re-based 0 and not the completion instant`,
    okB, JSON.stringify({ snapsA, settleA, clockBeforeLanding, landed, clockAfterFirstFrame }));
}
{
  // L70c a completion that finds the session already switched to ANOTHER record: A settled and B was shot (a base switch the hook
  // missed — the track was pending) and settled too before the track landed. The completion joins the CURRENT record only: one
  // snapshot, dated B's settle clock; nothing is written for the stale record A (its first playback ran without this module and
  // cannot be reconstructed — as a torn-down generation's completion writes nothing, FIX2).
  const { F, H, pending } = await L70_boot();
  L70_hide(H, 1);
  H.shoot(new Map(), 0.6, 'L70c-A'); H.runTicksToSettle(); const settleA = +H.game.clock.toFixed(6);
  L70_show(H, 1);
  H.shoot(new Map([[1, pivotEntry(0.4, 4)]]), 0.9, 'L70c-B'); H.runTicksToSettle(); const settleB = +H.game.clock.toFixed(6);
  const stillPending = H.ctl.reason === 'pending';
  F.release(); await H.settleActivation(); H.tick();
  const snaps = (snapshotsOf(H.ctl) ?? []).map((s) => ({ origin: +s.origin.toFixed(6), size: s.size, cell1: s.states.find((x) => x.id === 1)?.kind ?? null }));
  const w = L70_walk(H, 400);
  const ok = pending && stillPending && H.machine.state === 'AIM' && H.ctl.enabled === true && settleA !== settleB
    && snaps.length === 1 && near(snaps[0].origin, settleB, 1e-9) && !snaps.some((s) => near(s.origin, settleA, 1e-9))
    && w.kind === 'rest' && w.pocket === 4;
  check(`L70c a completion after a base switch to ANOTHER record (A settled at ${settleA}, then B shot and settled at ${settleB}, both with the track pending) joins the CURRENT record only: ${snaps.length} snapshot(s), origin ${snaps[0]?.origin ?? 'none'} = B's settle clock, none dated A's — the stale record is discarded; B's ball 1 ${w.kind} in pocket ${w.pocket}`,
    ok, JSON.stringify({ pending, stillPending, settleA, settleB, snaps, w, state: H.machine.state, enabled: H.ctl.enabled }));
}
{
  // L70d the PRE-settlement path is unchanged: the same fresh activation landing INSIDE A's PLAYBACK (boundary E8 as before FIX5)
  // snapshots A at the landing clock, and the snapshot's STATES are byte-identical to the base's (the origin varies with the landing
  // frame, so it is asserted against the landing clock and kept out of the digest).
  const { createHash } = await import('node:crypto');
  const { F, H, pending } = await L70_boot();
  L70_hide(H, 1);
  H.shoot(new Map([[2, pivotEntry(0.3, 4)]]), 3.0, 'L70d-A');                // A omits ball 1 and pots ball 2
  for (let k = 0; k < 56; k++) H.tick();                                      // A under way
  F.release(); await H.settleActivation();                                    // the activation lands INSIDE PLAYBACK
  // the landing frame is the settle tick's own frame (dwell 56 + 1 = frame 57, clock 0.95): settleActivation ticks once and
  // then waits on ctl.whenActivated(), so the frame does not move with host timing. The snapshot's origin is compared with
  // the RAW clock — `clock` is the 6-decimal display form and rounds 58/60 away from the raw origin by 3e-7
  const landed = { state: H.machine.state, clock: +H.game.clock.toFixed(6), clockRaw: H.game.clock, ticks: H.settleTicks ?? null };
  H.tick();
  const snaps = snapshotsOf(H.ctl) ?? [];
  const statesBytes = JSON.stringify(snaps.map((s) => s.states), l70Replacer);
  const digest = createHash('sha256').update(statesBytes).digest('hex').slice(0, 16);
  const ok = pending && landed.state === 'PLAYBACK' && snaps.length === 1 && near(snaps[0].origin, landed.clockRaw, 1e-9) && snaps[0].size === H.balls.length && digest === L70_BASE_DIGEST;
  check(`L70d the pre-settlement path is unchanged: the activation landing INSIDE A's PLAYBACK (clock ${landed.clock}, raw ${landed.clockRaw}, after ${landed.ticks} settle tick(s) — the landing frame is resolved by the activation seam) snapshots A at that raw clock as before (${snaps.length} snapshot, size ${snaps[0]?.size}); the snapshot's states sha256 ${digest} vs the pin ${L70_BASE_DIGEST} (${statesBytes.length} B; every number quantised to ${L70_QUANTUM} before hashing — CIWIRE-FIX2)`,
    ok, JSON.stringify({ pending, landed, origin: snaps[0]?.origin, digest, statesBytes: statesBytes.slice(0, 400) }));
}


// ---- L71 (#707 prep FIX6 A): the falls the CONTROLLER validates are the host's kernel-disc request, read from the falls module's one export ----
// index.js called pocketVisualFalls(id) un-opted (the plate cups) while game.js opts into the kernel discs at its one read site; on
// snooker the corners differ by 27.87 mm. The activation's cups + falls are published on the facade (`ctl.geometry()`, a harness seam).
{
  const { loadTableModule } = await import('./table-in-node.mjs'); const TM = await loadTableModule();
  const T = mkTableShim('wpbsa_snooker_12ft');
  const H = await boot({ tableModule: T.shim, track: 'wpbsa_snooker_12ft-xw101-slides', templateR: 0.02625, expectEnabled: false });
  const geo = typeof H.ctl.geometry === 'function' ? H.ctl.geometry() : null;
  const host = TM.pocketVisualFalls('wpbsa_snooker_12ft', { contract: 'kernel' });   // game.js:1478's request, verbatim - the oracle
  const plate = TM.pocketVisualFalls('wpbsa_snooker_12ft');
  const gap = (A, B) => (A ?? []).map((a, i) => +(Math.hypot(a.x - B[i].x, a.z - B[i].z) * 1e3).toFixed(2));
  // …and what the validators CONSUMED, not only what was read (review C1): on this legacy-host boot the refusal is V13's, whose per-pocket
  // clearances schema.js computes from `ctx.falls?.[idx] ?? cup`; the mm the controller printed must be validateTrack's over this
  // geometry with the HOST's falls, and that reading must differ from the plate cups' (the pin discriminates on this table)
  const { validateTrack: vt71 } = await import('../scene/ballreturn/schema.js');
  const v13 = (F) => { try { return (vt71(geo.def, { pockets: geo.cups, falls: F }).ownershipRequired?.pockets ?? []).map((p) => +p.mm); } catch (e) { return ['threw: ' + String(e.message).slice(0, 60)]; } };
  const reasonHits = [...String(H.ctl.reason ?? '').matchAll(/pocket (\d) \((-?[\d.]+) mm\)|, (\d) \((-?[\d.]+) mm\)/g)]; const reasonMm = reasonHits.map((m) => +(m[2] ?? m[4])); const reasonPk = reasonHits.map((m) => +(m[1] ?? m[3]));
  const v13Host = geo ? v13(host) : [], v13Plate = geo ? v13(plate) : [];
  const consumed = geo && reasonMm.length >= 1 && reasonMm.length === v13Host.length && JSON.stringify(reasonMm) === JSON.stringify(v13Host) && JSON.stringify(v13Host) !== JSON.stringify(v13Plate);
  const ok = !!geo && Array.isArray(geo.falls) && JSON.stringify(geo.falls) === JSON.stringify(host) && gap(plate, host).filter((g) => g > 27.8 && g < 27.9).length === 4 && H.ctl.trackId === 'wpbsa_snooker_12ft-xw101-slides' && consumed;
  check(`L71 the controller validates the fall the HOST draws (FIX6 A): on wpbsa_snooker_12ft / XW101 the activation's falls ${geo ? (JSON.stringify(geo.falls) === JSON.stringify(host) ? 'equal' : 'DIFFER from') : 'are unreadable (no seam) against'} game.js's kernel-disc request - gap per pocket ${geo ? gap(geo.falls, host).join('/') : '?'} mm (the plate cups the base read: ${gap(plate, host).join('/')} mm); the V13 clearances the controller PRINTED [${reasonMm.join('/')}] = validateTrack over this geometry with the host's falls [${v13Host.join('/')}] and not the plate cups' [${v13Plate.join('/')}] (consumed ${consumed}; ${reasonMm.length} printed / ${v13Host.length} computed, negative pockets [${reasonPk.join(',')}] — the c3 merge: the count follows the module, ruling b); activation ${H.ctl.enabled ? 'enabled' : 'refused: ' + String(H.ctl.reason).slice(0, 60)}`,
    ok, JSON.stringify({ geo: geo ? { cups: geo.cups?.length, falls: geo.falls } : null, reasonMm, v13Host, v13Plate, enabled: H.ctl.enabled, trackId: H.ctl.trackId }));
  // L72 one builder, from the design-cache side: the live activation's design entry sits under geometryKey's key with geometryKey's material
  const { geometryKey } = await import('../scene/ballreturn/furniture.js');
  const H2 = await boot({});
  const g2 = typeof H2.ctl.geometry === 'function' ? H2.ctl.geometry() : null;
  const gk = g2 && H2.ctl.track ? geometryKey({ tableId: 'wpa_generic_9ft', trackId: 'TEST-synthetic-wire-slide', r: H2.ctl.track.refR, def: g2.def, cups: g2.cups, falls: g2.falls }) : null;
  const dc = H2.ctl.designCache(); const entry = gk ? dc.get(gk.key) : null;
  check(`L72 one builder, from the design-cache side: the live activation's V19 entry sits under geometryKey's key (${gk ? (dc.has(gk.key) ? 'found' : 'MISSING') : 'no geometry'}: ${(gk?.key ?? '').slice(0, 60)}…) with geometryKey's material (${entry ? entry.material === gk.material : '?'}); ${dc.size} entr${dc.size === 1 ? 'y' : 'ies'} in the cache`,
    !!gk && !!entry && entry.material === gk.material && dc.size === 1 && H2.ctl.enabled === true, JSON.stringify({ key: gk?.key, has: !!entry, sizes: dc.size, enabled: H2.ctl.enabled }));
  // L73 a table module WITHOUT the export (a cached table.js under the cache-poison pairing): the controller is un-opted, as before
  const T3 = mkTableShim('wpbsa_snooker_12ft'); const shimNoExport = { ...T3.shim }; delete shimNoExport.POCKET_FALLS_CONTRACT_KERNEL;
  const H3 = await boot({ tableModule: shimNoExport, track: 'wpbsa_snooker_12ft-xw101-slides', templateR: 0.02625, expectEnabled: false });
  const g3 = typeof H3.ctl.geometry === 'function' ? H3.ctl.geometry() : null;
  check(`L73 a table module WITHOUT the export (the cache-poison pairing) leaves the controller un-opted as before: its falls ${g3 ? (JSON.stringify(g3.falls) === JSON.stringify(plate) ? 'equal the plate datums' : 'are NOT the plate datums') : 'unreadable'} (gap to the host ${g3 ? gap(g3.falls, host).join('/') : '?'} mm)`,
    !!g3 && JSON.stringify(g3.falls) === JSON.stringify(plate) && gap(g3.falls, host).filter((g) => g > 27.8 && g < 27.9).length === 4, JSON.stringify({ falls: g3?.falls, hasExport: 'POCKET_FALLS_CONTRACT_KERNEL' in shimNoExport }));
}


// ---- L74 (#707 prep FIX7 A): a furniture change during a PENDING activation is deferred, never discarded ----------------------
// recheckFurniture returns over an activation in flight (the guard in index.js recheckFurniture, from round 20a — FIX2's construction
// relied on it), so a furniture change under the
// same table id + radius that lands after V16 finished but while V19 is still pending was DROPPED: the activation enabled on stale
// clearance and later frames compare table id / radius only. Review's sequence: a slow design gate + a box moved onto the route-4
// runway while V19 is pending -> enabled with 0 reported violations while a fresh V16 read finds them. Now the broadcast during a
// pending activation sets a generation-scoped mark and the completion re-reads V16 through the same path before enabling.
// Harness: the pending window is opened by clearing the V19 cache (a re-activation of the same geometry is otherwise a cache HIT)
// and re-selecting the table; the module's `ob:settings` listener is captured by stubbing addEventListener before the boot (L69).
{
  const THREE = await import('three'); const { stationAt } = await import('../scene/ballreturn/track.js');
  const FM = await import('../scene/ballreturn/furniture.js'); const { validateTrack: vt74 } = await import('../scene/ballreturn/schema.js');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const bus = []; const hadAdd = Object.prototype.hasOwnProperty.call(globalThis, 'addEventListener'); const savedAdd = globalThis.addEventListener;
  globalThis.addEventListener = (type, fn) => { if (type === 'ob:settings') bus.push(fn); };
  const broadcast = () => { const ev = typeof CustomEvent === 'function' ? new CustomEvent('ob:settings', { detail: { key: 'furniture', value: 1 } }) : { type: 'ob:settings', detail: { key: 'furniture', value: 1 } }; for (const fn of bus) fn(ev); };
  const S = (() => { const scene = new THREE.Scene(); const box = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.02, 0.2), new THREE.MeshBasicMaterial()); box.name = 'obTestLeg74'; scene.add(box); return { scene, box }; })();
  const H0 = await boot({ track: 'TEST-synthetic-wire-slide', host: 'owner' });                         // a plain boot lends the route-4 station
  const route = H0.ctl.track.routes.get(4); const P = stationAt(route, 0.5 * route.total, R, {});
  const CLEAR = 0.01 + R + 0.002; const place = (lift) => { S.box.position.set(P.x, P.y + lift, P.z); S.scene.updateMatrixWorld(true); };
  place(CLEAR);
  const T = mkTableShim('wpa_generic_9ft');
  const H = await boot({ track: 'TEST-synthetic-wire-slide', host: 'owner', tableModule: T.shim, scene: S.scene }); // the first activation: the box clear -> enabled
  const clean = { key: H.ctl.furniture?.key ?? null, stations: H.ctl.furniture?.stations ?? null, violations: H.ctl.furniture?.violations?.length ?? null };
  const rereads = () => H.ctl.stats.furnitureRereads ?? 0;
  /** open a PENDING window on the same table id with V16 already read and V19 in flight: away, back, the V19 cache cleared */
  const stage = async () => { T.switchTo('chinese8_pro_9ft'); await H.settleActivation(); H.ctl.designCache().clear(); T.switchTo('wpa_generic_9ft'); H.tick(); let ok = false; for (let i = 0; i < 400 && !ok; i++) { await sleep(2); H.tick(); ok = H.ctl.reason === 'pending' && H.ctl.designPending().size === 1; } return ok; };
  const settle = async () => { let enabledFrames = 0; for (let i = 0; i < 800 && H.ctl.reason === 'pending'; i++) { H.tick(); if (H.ctl.enabled) enabledFrames += 1; await sleep(2); } for (let i = 0; i < 30; i++) { H.tick(); if (H.ctl.enabled) enabledFrames += 1; } return enabledFrames; };
  // L74a review's sequence
  const stagedA = await stage(); const rrA0 = rereads();
  place(0); broadcast();                                                                                     // the box moves ONTO the runway while V19 is pending; settings.js broadcasts
  const framesA = await settle();
  const geoA = H.ctl.geometry(); const trkA = vt74(geoA.def, { pockets: geoA.cups, falls: geoA.falls });
  const freshA = await FM.furnitureClearance({ track: trkA, def: geoA.def, r: R, scene: S.scene, tableId: 'wpa_generic_9ft', trackId: 'TEST-synthetic-wire-slide-L74fresh', pockets: geoA.cups, falls: geoA.falls }); // the truth: a fresh V16 read of the same geometry against the scene as it is now (a distinct trackId keeps it out of the shared cache)
  const a = { staged: stagedA, enabled: H.ctl.enabled, reason: String(H.ctl.reason).slice(0, 160), reported: H.ctl.furniture?.violations?.length ?? null, fresh: freshA.violations.length, rereads: rereads() - rrA0, framesEnabled: framesA };
  check(`L74a review's sequence (FIX7 A): V16 read clean, V19 pending (staged ${a.staged}); the box moves onto the route-4 runway and settings.js broadcasts; the activation ends ${a.enabled ? 'ENABLED' : 'REFUSED'} — reported ${a.reported} violations while a fresh V16 read of the same geometry finds ${a.fresh}; re-read count ${a.rereads}; ${a.framesEnabled} frames enabled (0957bb04: enabled, 0 reported)`,
    a.staged && !a.enabled && /\[V16\]/.test(a.reason) && /obTestLeg74/.test(a.reason) && a.rereads === 1 && a.framesEnabled === 0 && a.fresh > 0 && a.reported === a.fresh, JSON.stringify(a));
  // L74b the same box in and then back out before completion -> enabled, the re-read counted once, the verdict a clean activation's
  place(CLEAR); const stagedB = await stage(); const rrB0 = rereads();
  place(0); broadcast(); await sleep(4); place(CLEAR); broadcast();
  const framesB = await settle();
  const b = { staged: stagedB, enabled: H.ctl.enabled, rereads: rereads() - rrB0, key: H.ctl.furniture?.key ?? null, stations: H.ctl.furniture?.stations ?? null, violations: H.ctl.furniture?.violations?.length ?? null, cached: H.ctl.furniture?.cached === true, framesEnabled: framesB };
  check(`L74b the box moved in and back out before completion: enabled ${b.enabled}, re-read count ${b.rereads}, the verdict identical to the clean activation's (key equal ${b.key === clean.key}, ${b.stations} stations, ${b.violations} violations) and served as a cache HIT (${b.cached})`,
    b.staged && b.enabled && b.rereads === 1 && b.key === clean.key && b.stations === clean.stations && b.violations === 0 && b.cached, JSON.stringify({ b, clean }));
  // L74c a change AFTER completion still goes through recheckFurniture (a teardown + a new activation), no re-read counted
  const actC0 = H.ctl.stats.activations; const rrC0 = rereads();
  // the post-completion re-check is asynchronous (the listener's microtask, the `three` import, the read): drain until the teardown shows as 'pending', then settle
  const drain = async () => { for (let i = 0; i < 300 && H.ctl.reason !== 'pending'; i++) { await sleep(2); H.tick(); } return H.ctl.reason === 'pending'; };
  place(0); broadcast(); const tornC = await drain(); await settle(); const refusedC = { torn: tornC, enabled: H.ctl.enabled, reason: String(H.ctl.reason).slice(0, 120), activations: H.ctl.stats.activations - actC0 };
  place(CLEAR); broadcast(); const tornC2 = await drain(); await settle(); const backC = { torn: tornC2, enabled: H.ctl.enabled, activations: H.ctl.stats.activations - actC0, rereads: rereads() - rrC0 };
  check(`L74c a furniture change AFTER completion still goes through recheckFurniture: the box in -> a new activation (${refusedC.activations}) refused ${/\[V16\]/.test(refusedC.reason) ? '[V16]' : 'NOT'} naming ${/obTestLeg74/.test(refusedC.reason) ? 'the box' : 'nothing'}; the box out -> another (${backC.activations} total) enabled ${backC.enabled}; re-reads counted ${backC.rereads}`,
    !refusedC.enabled && /\[V16\]/.test(refusedC.reason) && /obTestLeg74/.test(refusedC.reason) && refusedC.activations === 1 && backC.enabled && backC.activations === 2 && backC.rereads === 0, JSON.stringify({ refusedC, backC }));
  // L74g the recheckFurniture generation settles the seam too: a waiter taken while its activation is pending resolves when it lands
  FM.clearFurnitureCache(); // re-open the V16 sweep window (one route per task, as L74e's first-boot arm): a cached clearance lands inside drain's poll and the pending generation is never observed
  const actG0 = H.ctl.stats.activations;
  place(0); broadcast(); const tornG1 = await drain();
  let timerG1 = null; const guardG1 = new Promise((resolve) => { timerG1 = setTimeout(() => resolve('timeout'), 10000); });
  const outcomeG1 = await Promise.race([H.ctl.whenActivated().then(() => 'settled'), guardG1]); clearTimeout(timerG1);
  await settle(); const refusedG = { enabled: H.ctl.enabled, reason: String(H.ctl.reason).slice(0, 120) };
  place(CLEAR); broadcast(); const tornG2 = await drain();
  let timerG2 = null; const guardG2 = new Promise((resolve) => { timerG2 = setTimeout(() => resolve('timeout'), 10000); });
  const outcomeG2 = await Promise.race([H.ctl.whenActivated().then(() => 'settled'), guardG2]); clearTimeout(timerG2);
  await settle(); const backG = { enabled: H.ctl.enabled, activations: H.ctl.stats.activations - actG0 };
  check(`L74g a post-completion furniture re-check settles the seam: the box in -> drain ${tornG1}, seam outcome '${outcomeG1}', the activation refused ${/\[V16\]/.test(refusedG.reason) ? '[V16]' : 'NOT'} naming ${/obTestLeg74/.test(refusedG.reason) ? 'obTestLeg74' : 'nothing'}; the box out -> drain ${tornG2}, seam outcome '${outcomeG2}', enabled ${backG.enabled}; activations delta ${backG.activations}`,
    tornG1 && outcomeG1 === 'settled' && !refusedG.enabled && /\[V16\]/.test(refusedG.reason) && /obTestLeg74/.test(refusedG.reason) && tornG2 && outcomeG2 === 'settled' && backG.enabled && backG.activations === 2, JSON.stringify({ tornG1, outcomeG1, refusedG, tornG2, outcomeG2, backG }));
  // L74d the mark of a TORN-DOWN generation is discarded: marked while pending, torn down by a table switch, the box cleared, the table re-selected -> a fresh activation, no re-read
  const stagedD = await stage(); const rrD0 = rereads();
  place(0); broadcast();                                                                                     // the mark, on the pending generation
  T.switchTo('chinese8_pro_9ft'); H.tick();                                                                  // torn down before completion: the mark's generation is dead
  place(CLEAR); await H.settleActivation();
  T.switchTo('wpa_generic_9ft'); await H.settleActivation(); await settle();
  const d = { staged: stagedD, enabled: H.ctl.enabled, rereads: rereads() - rrD0, violations: H.ctl.furniture?.violations?.length ?? null };
  check(`L74d the mark of a torn-down generation is discarded: marked while pending, the table switched away (teardown) and back with the box cleared -> enabled ${d.enabled}, ${d.violations} violations, re-reads on the stale generation ${d.rereads}`,
    d.staged && d.enabled && d.rereads === 0 && d.violations === 0, JSON.stringify(d));
  // L74f (review C5) the box moved in and then to a DIFFERENT clear pose before completion: enabled on the RE-READ's key (not the first
  // read's), and a broadcast over that now-unchanged furniture is not a re-activation (L69's law) — the stale-verdict plant fails here
  const stagedF = await stage(); const rrF0 = rereads();
  place(0); broadcast(); await sleep(4); place(CLEAR + 0.05); broadcast();
  await settle();
  const f1 = { staged: stagedF, enabled: H.ctl.enabled, rereads: rereads() - rrF0, keyDiffers: (H.ctl.furniture?.key ?? null) !== clean.key, violations: H.ctl.furniture?.violations?.length ?? null };
  const actF = H.ctl.stats.activations; broadcast(); const tornF = await drain(); await settle();
  const f2 = { torn: tornF, activations: H.ctl.stats.activations - actF, enabled: H.ctl.enabled };
  check(`L74f the box moved in and then to a DIFFERENT clear pose before completion: enabled ${f1.enabled} on the re-read's key (differs from the clean key ${f1.keyDiffers}), ${f1.violations} violations, re-read count ${f1.rereads}; a broadcast over that unchanged furniture afterwards is not a re-activation (torn ${f2.torn}, ${f2.activations} activations)`,
    f1.staged && f1.enabled && f1.rereads === 1 && f1.keyDiffers && f1.violations === 0 && !f2.torn && f2.activations === 0 && f2.enabled, JSON.stringify({ f1, f2 }));
  place(CLEAR);
  // L74e (review C1) the session's FIRST activation: its `ctl.furniture` is null while its own V16 sweep runs — the longest pending window;
  // a broadcast there must mark too. A fresh boot is NOT awaited; the read is caught in flight through the shared furniture module's
  // evaluation counter (the sweep yields once per route), the box moved onto the runway, the boot's own listener called; the control
  // leaves the box where it is: enabled, one re-read, served as a cache hit. The box starts a METRE above the station (not at the
  // clearance lift): the first read's bounding-box snapshot then never touches it, so only the deferred re-read can see the move —
  // at the clearance lift the yielding sweep's live triangle reads caught the move mid-read and the FIRST read refused with a mixed
  // count (6 of 39) on every tree, the pre-existing non-atomic snapshot recorded for b19, which would have hidden the mark.
  const S2 = (() => { const scene = new THREE.Scene(); const box = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.02, 0.2), new THREE.MeshBasicMaterial()); box.name = 'obTestLeg74e'; scene.add(box); return { scene, box }; })();
  const place2 = (lift) => { S2.box.position.set(P.x, P.y + lift, P.z); S2.scene.updateMatrixWorld(true); };
  const firstBoot = async (moveTo) => {
    const FAR = 1.0; FM.clearFurnitureCache(); place2(FAR); const busBefore = bus.length; const e0 = FM.furnitureEvaluations();
    const pending = boot({ track: 'TEST-synthetic-wire-slide', host: 'owner', scene: S2.scene, expectEnabled: false });
    let inflight = false; for (let i = 0; i < 3000 && !inflight; i++) { await sleep(1); inflight = FM.furnitureEvaluations() > e0; }
    const listener = bus.length > busBefore; place2(moveTo);
    const ev = typeof CustomEvent === 'function' ? new CustomEvent('ob:settings', { detail: { key: 'furniture', value: 2 } }) : { type: 'ob:settings', detail: { key: 'furniture', value: 2 } }; for (const fn of bus.slice(busBefore)) fn(ev);
    const Hx = await pending; let frames = 0; for (let i = 0; i < 30; i++) { Hx.tick(); if (Hx.ctl.enabled) frames += 1; }
    return { inflight, listener, enabled: Hx.ctl.enabled, reason: String(Hx.ctl.reason).slice(0, 140), reported: Hx.ctl.furniture?.violations?.length ?? null, cached: Hx.ctl.furniture?.cached === true, rereads: Hx.ctl.stats.furnitureRereads ?? 0, frames, geo: Hx.ctl.geometry() };
  };
  const e = await firstBoot(0);
  const trkE = vt74(e.geo.def, { pockets: e.geo.cups, falls: e.geo.falls }); const freshE = await FM.furnitureClearance({ track: trkE, def: e.geo.def, r: R, scene: S2.scene, tableId: 'wpa_generic_9ft', trackId: 'TEST-synthetic-wire-slide-L74e-fresh', pockets: e.geo.cups, falls: e.geo.falls });
  const eCtl = await firstBoot(1.0);
  check(`L74e the session's FIRST activation (review C1): a broadcast during its own V16 sweep (caught in flight ${e.inflight}, the boot's listener ${e.listener}) after the box moved onto the runway → the activation ends ${e.enabled ? 'ENABLED' : 'REFUSED'} — reported ${e.reported} violations while a fresh read finds ${freshE.violations.length}, re-read count ${e.rereads}, ${e.frames} frames enabled (0957bb04 and the un-hoisted FIX7: enabled, 0 reported); control — the same broadcast with the box left clear → enabled ${eCtl.enabled}, ${eCtl.rereads} re-read served as a cache hit (${eCtl.cached}), ${eCtl.reported} violations`,
    e.inflight && e.listener && !e.enabled && /\[V16\]/.test(e.reason) && /obTestLeg74e/.test(e.reason) && e.rereads === 1 && e.frames === 0 && freshE.violations.length > 0 && e.reported === freshE.violations.length && eCtl.inflight && eCtl.enabled && eCtl.rereads === 1 && eCtl.cached && eCtl.reported === 0, JSON.stringify({ e: { ...e, geo: undefined }, fresh: freshE.violations.length, eCtl: { ...eCtl, geo: undefined } }));
  if (hadAdd) globalThis.addEventListener = savedAdd; else delete globalThis.addEventListener;
}

// ---- L75 (#707 prep FIX7 B): companion ownership through the catalog identity — the controller-level proof of r71a-d ---------
// A hardware companion declaring the renamed `diamond_proam_9ft` on the supported alias `pool_pro_9ft_measured` (e2e-tables'
// alias row) was refused by V17's raw id compare while the track passed tableIdsMatch(); the companion is served by fetchImpl.
{
  const mkCompanion = (tableId) => ({ schema: 'ball-return-hardware/1.0', track_id: 'TEST-alias-diamond-wire-slide', table_id: tableId, provenance: { tag: 'TEST', source: 'FIX7 B arm: a companion declaring the renamed id, loaded on its alias' }, mesh_names: ['obTestHw75'] });
  const mkAssembly = () => ({ schema: 'ball-return-assembly/1.0', table_id: 'diamond_proam_9ft', provenance: { tag: 'TEST', source: 'FIX7 B arm: the pool_pro_9ft assembly file, read by its alias' }, meshes: [{ id: 'obTestWell75', kind: 'well', name: 'obTestWell75', solid_simplification: true, provenance: { tag: 'TEST', source: 'FIX7 B arm: a synthetic well' } }] });
  const fetchFor = (companion, asked) => async (url) => { const u = String(url); if (u.includes('/hardware/TEST-alias-diamond-wire-slide.json')) return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(companion)) }; if (u.includes('/assemblies/')) { asked.push(u.slice(u.lastIndexOf('/assemblies/'))); if (u.endsWith('/assemblies/pool_pro_9ft.json')) return { ok: true, status: 200, json: async () => mkAssembly() }; } return fileFetch(url); };
  const run = async (activeId, companionTableId) => { const T = mkTableShim(activeId); const asked = []; const H = await boot({ tableModule: T.shim, track: 'TEST-alias-diamond-wire-slide', fetchImpl: fetchFor(mkCompanion(companionTableId), asked), expectEnabled: false }); return { active: activeId, declared: companionTableId, enabled: H.ctl.enabled, hw: H.ctl.hardware?.meshNames ?? null, asm: H.ctl.assembly?.tableId ?? null, askedAsm: asked, reason: String(H.ctl.reason).slice(0, 150), trackId: H.ctl.trackId }; };
  const canon = await run('diamond_proam_9ft', 'diamond_proam_9ft'); const alias = await run('pool_pro_9ft_measured', 'diamond_proam_9ft'); const foreign = await run('pool_pro_9ft_measured', 'wpbsa_snooker_12ft');
  const asmOk = canon.asm === 'diamond_proam_9ft' && alias.asm === 'diamond_proam_9ft' && alias.askedAsm.includes('/assemblies/pool_pro_9ft.json') && !alias.askedAsm.some((u) => u.includes('pool_pro_9ft_measured'));
  const ok = canon.enabled && canon.hw?.[0] === 'obTestHw75' && alias.enabled && alias.hw?.[0] === 'obTestHw75' && alias.trackId === 'TEST-alias-diamond-wire-slide' && !foreign.enabled && /\[V17\]/.test(foreign.reason) && /wpbsa_snooker_12ft/.test(foreign.reason) && /pool_pro_9ft_measured/.test(foreign.reason) && asmOk;
  check(`L75 companion ownership through the catalog identity (FIX7 B), in this node harness (mkTableShim + a fetchImpl-served companion): renamed id ${canon.enabled ? 'enabled' : 'refused'} with the companion ${canon.hw ? 'INSTALLED' : 'absent'}; the alias pool_pro_9ft_measured ${alias.enabled ? 'enabled' : 'refused'} with the companion ${alias.hw ? 'INSTALLED' : 'absent'} (0957bb04: refused [V17] declared for table diamond_proam_9ft, loaded on pool_pro_9ft_measured); a genuinely foreign wpbsa_snooker_12ft companion still ${foreign.enabled ? 'ENABLED' : 'refused'} ${/\[V17\]/.test(foreign.reason) ? '[V17] naming both ids' : ''}; the V18 assembly FILE is read under the canonical id on both (renamed-id run ${canon.asm}, alias ${alias.asm}; the alias asked for ${JSON.stringify(alias.askedAsm)})`,
    ok, JSON.stringify({ canon, alias, foreign }));
}

{
  // L76a the event-resolved landing does not move with companion latency: L70d's scenario (dwell 56) at 0 ms and at 40 ms
  // companion delay lands on the same frame, with the same settle tick count, origin and snapshot digest.
  const { createHash } = await import('node:crypto');
  const runL76a = async (companionDelayMs) => {
    const { F, H, pending } = await L70_boot({ companionDelayMs });
    L70_hide(H, 1);
    H.shoot(new Map([[2, pivotEntry(0.3, 4)]]), 3.0, 'L70d-A');
    for (let k = 0; k < 56; k++) H.tick();
    F.release(); await H.settleActivation();
    const landed = { state: H.machine.state, clockRaw: H.game.clock, ticks: H.settleTicks ?? null };
    H.tick();
    const snaps = snapshotsOf(H.ctl) ?? [];
    const statesBytes = JSON.stringify(snaps.map((s) => s.states), l70Replacer);
    const digest = createHash('sha256').update(statesBytes).digest('hex').slice(0, 16);
    return { pending, landed, origin: snaps[0]?.origin ?? null, digest };
  };
  const a0 = await runL76a(0); const a40 = await runL76a(40);
  const ok = a0.landed.state === 'PLAYBACK' && a40.landed.state === 'PLAYBACK'
    && a0.landed.clockRaw === a40.landed.clockRaw && a0.landed.ticks === a40.landed.ticks
    && a0.origin === a40.origin && a0.digest === a40.digest;
  check(`L76a the activation landing does not move with companion latency: at 0 ms delay clock ${a0.landed.clockRaw}, after ${a0.landed.ticks} settle tick(s), origin ${a0.origin}, digest ${a0.digest} (landing ${a0.landed.state}); at 40 ms delay clock ${a40.landed.clockRaw}, after ${a40.landed.ticks} settle tick(s), origin ${a40.origin}, digest ${a40.digest} (landing ${a40.landed.state})`,
    ok, JSON.stringify({ a0, a40 }));
}
{
  // L76b a superseded generation never resolves whenActivated(): two held track loads, the first superseded before it lands.
  const perRequestHold = () => {
    const held = []; let holding = false;
    const fetchImpl = async (url, init) => {
      if (holding && String(url).includes('/tracks/')) return new Promise((resolve) => { held.push({ url, release: () => resolve(fileFetch(url)) }); });
      return fileFetch(url);
    };
    return { fetchImpl, hold: () => { holding = true; }, heldCount: () => held.length, releaseAt: (i) => { const h = held[i]; if (h) h.release(); } };
  };
  const F = perRequestHold(); const T = mkTableShim('diamond_proam_9ft');
  const H = await boot({ track: 'TEST-terminal-chutes', tableModule: T.shim, fetchImpl: F.fetchImpl, expectEnabled: false });
  F.hold(); T.switchTo('wpa_generic_9ft'); H.tick();
  let resolved = false; const waiter = H.ctl.whenActivated().then(() => { resolved = true; });
  T.switchTo('diamond_proam_9ft'); H.tick();
  const heldCount = F.heldCount();
  F.releaseAt(0); await new Promise((r) => setTimeout(r, 0));
  const afterN = { resolved, reason: H.ctl.reason };
  F.releaseAt(1);
  let timer = null; const guard = new Promise((resolve) => { timer = setTimeout(() => resolve('timeout'), 10000); });
  const outcome = await Promise.race([waiter.then(() => 'settled'), guard]); clearTimeout(timer);
  if (outcome !== 'settled') check('L76b hang guard: whenActivated() did not resolve for generation n+1 within 10000 ms', false);
  const afterNext = { resolved, reason: H.ctl.reason };
  const ok = heldCount === 2 && afterN.resolved === false && afterN.reason === 'pending' && afterNext.resolved === true && afterNext.reason !== 'pending';
  check(`L76b a superseded generation never resolves whenActivated(): ${heldCount} held; generation-n state after n resolved ${afterN.resolved}, '${afterN.reason}'; after n+1 resolved ${afterNext.resolved}, '${afterNext.reason}' (not 'pending')`,
    ok, JSON.stringify({ heldCount, afterN, afterNext }));
}

// ---- L77 (#789): the TABLE_SPECS drift test of the neutral-key rename (MAPPING-PROPOSAL.md:323, PLAN-J row 9) -----------------
// Every rename pair (old, neutral) is read from the served SDK catalog, where each kept old table entry names its neutral twin in
// `superseded_by`. For each pair the two keys are one spec object (an alias bound before a later reassignment fails here), both
// canonicalize to the neutral id, and the neutral key comes first in key order (canonicalTableId returns the first bound key).
// The measured twin is the one exception: it shares the pool_pro_9ft object on purpose and canonicalizes to pool_pro_9ft. The
// retired v8 Measured table id is served only as a digest alias row (CATALOG_ALIAS_DIGESTS), so no TABLE_SPECS key may hash to
// a table row of that mirror.
// One check function, l77DriftCheck(specs, report): the suite runs it on the real TABLE_SPECS through check(), and the
// --selftest-drift mode runs the same function on a synthetic TABLE_SPECS fixture (l77DriftSelftest below).
function l77RenamePairs(SDK) {
  return SDK.catalogEntries('table_id').filter((e) => typeof e.superseded_by === 'string').map((e) => [e.id, e.superseded_by]);
}
async function l77DriftCheck(specs, report) {
  const TID = await import('../scene/ballreturn/tableid.js');
  const SDK = await import('../dist/pool-sdk/catalog.js');
  const keys = Object.keys(specs);
  const pairs = l77RenamePairs(SDK);
  report(`L77 the served SDK catalog names six table rename pairs: ${pairs.map(([o, n]) => `${o} -> ${n}`).join(', ')}`, pairs.length === 6, JSON.stringify(pairs));
  for (const [old, neutral] of pairs) {
    const oneSpec = !!specs[neutral] && specs[old] === specs[neutral];
    const cOld = TID.canonicalTableId(specs, old); const cNeutral = TID.canonicalTableId(specs, neutral);
    const iOld = keys.indexOf(old); const iNeutral = keys.indexOf(neutral);
    report(`L77 ${old} -> ${neutral}: one spec object ${oneSpec}; canonical(${old}) ${cOld}; canonical(${neutral}) ${cNeutral}; key order ${iNeutral} < ${iOld}`,
      oneSpec && cOld === neutral && cNeutral === neutral && iNeutral >= 0 && iNeutral < iOld);
  }
  const twin = 'pool_pro_9ft_measured'; const cTwin = TID.canonicalTableId(specs, twin);
  const twinShared = !!specs.pool_pro_9ft && specs[twin] === specs.pool_pro_9ft;
  report(`L77 the measured twin ${twin} is the pool_pro_9ft spec object (${twinShared}) and canonicalizes to pool_pro_9ft (${cTwin})`, twinShared && cTwin === 'pool_pro_9ft');
  const retired = SDK.CATALOG_ALIAS_DIGESTS.filter((r) => r.axis === 'table');
  const hits = keys.filter((k) => retired.some((r) => r.digest === SDK.fnv1a64Hex(k)));
  report(`L77 no TABLE_SPECS key is a retired table id served only by digest (${retired.length} table digest row(s), ${keys.length} keys; keys on a digest: ${hits.length ? hits.join(', ') : 'none'})`,
    retired.length > 0 && hits.length === 0);
}
// --selftest-drift: the in-suite synthetic plant of l77DriftCheck. The fixture is the real TABLE_SPECS (same key order, same spec
// objects) with exactly one required key removed: the neutral key of a superseded_by pair. The plant is caught only when the same
// check reports no failure on the real TABLE_SPECS (the control) and at least one failure on the fixture, every failure line naming
// the removed key; a plant that produces no failure line is NOT CAUGHT. Returns the exit code: 0 only when every plant is caught.
async function l77DriftSelftest() {
  const tag = '[L77 selftest-drift]';
  const { loadTableModule } = await import('./table-in-node.mjs'); const TM = await loadTableModule();
  const SDK = await import('../dist/pool-sdk/catalog.js');
  const real = TM.TABLE_SPECS; const realKeys = Object.keys(real); const pairs = l77RenamePairs(SDK);
  const run = async (specs) => { const rows = []; await l77DriftCheck(specs, (name, ok, detail = '') => rows.push({ ok, line: checkLine(name, ok, detail) })); return rows; };
  const control = await run(real); const controlFails = control.filter((r) => !r.ok);
  const plants = [{ name: 'drop-neutral-key', drop: 'pool_pro_8ft' }];
  let caught = 0;
  for (const { name, drop } of plants) {
    const pair = pairs.find(([, n]) => n === drop);
    const fixture = Object.fromEntries(Object.entries(real).filter(([k]) => k !== drop));
    const wellFormed = !!pair && Object.hasOwn(real, drop) && Object.keys(fixture).length === realKeys.length - 1;
    console.log(`${tag} plant ${name}: a TABLE_SPECS fixture of the ${realKeys.length} real keys without ${drop} (the neutral key of ${pair ? pair[0] : 'no superseded_by pair'}); control on the real TABLE_SPECS: ${control.length} checks, ${controlFails.length} failure(s)`);
    if (!wellFormed || controlFails.length) {
      for (const r of controlFails) console.log(`${tag} control ${r.line}`);
      console.log(`${tag} ${name} INVALID: ${wellFormed ? 'the control is red, so a failure on the fixture is not the plant\'s' : 'the removed key is not a neutral key of a superseded_by pair bound in TABLE_SPECS'}`);
      continue;
    }
    const rows = await run(fixture); const fails = rows.filter((r) => !r.ok);
    if (fails.length && fails.every((r) => r.line.includes(drop))) { caught += 1; for (const r of fails) console.log(`${tag} ${name} CAUGHT: ${r.line}`); }
    else if (!fails.length) console.log(`${tag} ${name} NOT CAUGHT: the check produced no failure line on the fixture (${rows.length} checks, 0 failures)`);
    else { console.log(`${tag} ${name} NOT CAUGHT: ${fails.length} failure line(s), not every one names ${drop}`); for (const r of fails) console.log(`${tag} ${name} fixture ${r.line}`); }
  }
  console.log(`${tag} ${caught} of ${plants.length} plants caught`);
  return caught === plants.length ? 0 : 1;
}
{
  const { loadTableModule } = await import('./table-in-node.mjs'); const TM = await loadTableModule();
  await l77DriftCheck(TM.TABLE_SPECS, check);
}

// ---- L78 (#789): the drift test of the boot-mirror leaf web/scene/equipmentalias.js (PLAN-J row 11, rule 4 of section 1.9) ----
// The settings store and the scene boot mirror read the leaf through a namespace import. Its digest table must deep-equal the
// SDK alias digest table (kernel -> SDK is pinned by sdk/ts/test/catalog.test.ts); its FNV-1a 64 must agree with the SDK on the
// published vectors; its pure lookup is driven by one synthetic row (the real rows carry only digests); no current catalog id
// may hit a digest row; and its table rename map must equal the map built from the served catalog (each table entry carrying
// ui_hidden AND superseded_by). No retired or old id is typed here: every id is read from the SDK data.
// One check function, l78DriftCheck(EA, report): the suite runs it on the real leaf through check(), and the --selftest-drift
// mode runs the same function on synthetic leaf fixtures (l78DriftSelftest below). A missing leaf export is a FAIL, never a SKIP.
function l78RenameMap(SDK) {
  return Object.fromEntries(SDK.catalogEntries('table_id').filter((e) => e.ui_hidden === true && typeof e.superseded_by === 'string').map((e) => [e.id, e.superseded_by]));
}
async function l78DriftCheck(EA, report) {
  const SDK = await import('../dist/pool-sdk/catalog.js');
  const { isDeepStrictEqual } = await import('node:util');
  {
    const leafRows = Array.isArray(EA.ALIAS_DIGESTS) ? EA.ALIAS_DIGESTS : null; const sdkRows = SDK.CATALOG_ALIAS_DIGESTS;
    const missing = sdkRows.filter((r) => !(leafRows ?? []).some((l) => isDeepStrictEqual(l, r))).map((r) => `${r.axis}:${r.digest}`);
    const extra = (leafRows ?? []).filter((l) => !sdkRows.some((r) => isDeepStrictEqual(l, r))).map((l) => `${l?.axis}:${l?.digest}`);
    report(`L78a the leaf digest table deep-equals the SDK alias digest table (${leafRows ? leafRows.length : 0} leaf row(s), ${sdkRows.length} SDK row(s))`,
      !!leafRows && leafRows.length > 0 && isDeepStrictEqual(leafRows, sdkRows),
      leafRows ? `missing ${missing.join(', ') || 'none'}; extra ${extra.join(', ') || 'none'}` : 'leaf export absent: ALIAS_DIGESTS');
  }
  {
    const hash = typeof EA.fnv1a64Hex === 'function' ? EA.fnv1a64Hex : null;
    for (const [input, want] of [['', 'cbf29ce484222325'], ['a', 'af63dc4c8601ec8c'], ['foobar', '85944171f73967e8']]) {
      const leaf = hash ? hash(input) : undefined; const sdk = SDK.fnv1a64Hex(input);
      report(`L78b FNV-1a 64 of ${JSON.stringify(input)}: leaf ${leaf}, SDK ${sdk}, published ${want}`, leaf === want && sdk === want,
        hash ? '' : 'leaf export absent: fnv1a64Hex');
    }
  }
  {
    const probe = 'r78_synthetic_probe';
    const ok = typeof EA.aliasDigestTarget === 'function' && typeof EA.fnv1a64Hex === 'function';
    const rows = ok ? [{ axis: 'table', digest: EA.fnv1a64Hex(probe), neutral_id: 'pool_pro_9ft' }] : [];
    for (const [axis, id, want] of [['table_id', probe, 'pool_pro_9ft'], ['cloth_id', probe, undefined], ['table_id', 'pool_pro_9ft', undefined], ['table_id', 42, undefined], ['table', probe, undefined]]) {
      const got = ok ? EA.aliasDigestTarget(rows, axis, id) : undefined;
      report(`L78c the pure lookup over one synthetic row (${probe} on table): (${axis}, ${JSON.stringify(id)}) -> ${got} (want ${want})`, ok && got === want,
        ok ? '' : 'leaf export absent: aliasDigestTarget or fnv1a64Hex');
    }
  }
  {
    const canon = typeof EA.canonicalEquipmentId === 'function' ? EA.canonicalEquipmentId : null;
    const axes = Object.keys(SDK.EQUIPMENT_AXES); let n = 0; const moved = [];
    for (const axis of axes) for (const e of SDK.catalogEntries(axis)) { n += 1; const c = canon ? canon(axis, e.id) : undefined; if (c !== e.id) moved.push(`${axis}:${e.id} -> ${c}`); }
    report(`L78d canonicalEquipmentId is the identity on every current catalog id (${axes.length} axes, ${n} ids, ${moved.length} moved)`, !!canon && n > 0 && !moved.length,
      canon ? moved.slice(0, 8).join(', ') : 'leaf export absent: canonicalEquipmentId');
    const odd = canon ? [undefined, null, 42].map((v) => canon('table_id', v)) : [];
    report('L78d canonicalEquipmentId returns a non-string value unchanged', !!canon && odd[0] === undefined && odd[1] === null && odd[2] === 42,
      canon ? String(odd) : 'leaf export absent: canonicalEquipmentId');
    for (const r of SDK.CATALOG_ALIAS_DIGESTS) {
      const twin = SDK.catalogEntry(`${r.axis}_id`, r.neutral_id);
      report(`L78d the SDK digest row ${r.axis}:${r.digest} maps to a live catalog entry ${r.neutral_id} (${twin ? (twin.ui_hidden ? 'ui_hidden' : 'live') : 'absent'})`, !!twin && !twin.ui_hidden);
    }
  }
  {
    const want = l78RenameMap(SDK); const have = EA.TABLE_RENAMES && typeof EA.TABLE_RENAMES === 'object' ? EA.TABLE_RENAMES : null;
    const wantPairs = Object.entries(want); const havePairs = Object.entries(have ?? {});
    const missing = wantPairs.filter(([o, n]) => !(have && Object.hasOwn(have, o) && have[o] === n)).map(([o, n]) => `${o} -> ${n}`);
    const extra = havePairs.filter(([o, n]) => !(Object.hasOwn(want, o) && want[o] === n)).map(([o, n]) => `${o} -> ${n}`);
    report(`L78e the leaf TABLE_RENAMES equals the served catalog's table renames (ui_hidden + superseded_by): ${havePairs.length} leaf pair(s), ${wantPairs.length} catalog pair(s)`,
      !!have && wantPairs.length > 0 && isDeepStrictEqual({ ...have }, want) && !missing.length && !extra.length,
      have ? `missing ${missing.join(', ') || 'none'}; extra ${extra.join(', ') || 'none'}` : 'leaf export absent: TABLE_RENAMES');
    const dead = havePairs.filter(([, n]) => { const e = SDK.catalogEntry('table_id', n); return !e || e.ui_hidden; }).map(([, n]) => n);
    report(`L78e every TABLE_RENAMES value is a live catalog table (${dead.length ? 'not live: ' + dead.join(', ') : 'all live'})`, !!have && !dead.length);
    const fn = typeof EA.renamedTableId === 'function' ? EA.renamedTableId : null;
    for (const [o, n] of wantPairs) {
      const got = fn ? fn(o) : undefined;
      report(`L78e renamedTableId(${o}) -> ${got} (want ${n})`, got === n, fn ? '' : 'leaf export absent: renamedTableId');
    }
    const kept = ['pool_pro_9ft', 'wpa_generic_9ft', '__proto__', 'constructor', undefined]; const bad = fn ? kept.filter((g) => fn(g) !== g) : kept;
    report("L78e renamedTableId returns its input for a neutral id, a twinless ui_hidden id, '__proto__', 'constructor' and undefined", !!fn && !bad.length,
      fn ? 'changed: ' + bad.map(String).join(', ') : 'leaf export absent: renamedTableId');
  }
}
// --selftest-drift: the in-suite synthetic plants of l78DriftCheck, one per leaf data table. Each fixture is the real leaf with
// exactly one row removed: the rename pair whose neutral id is pool_pro_8ft, and the cloth digest row (its digest read from the
// SDK). A plant is caught only when the same check reports no failure on the real leaf (the control) and at least one failure on
// the fixture, every failure line naming the removed row; a plant that produces no failure line is NOT CAUGHT. Returns the exit
// code: 0 only when every plant is caught.
async function l78DriftSelftest() {
  const tag = '[L78 selftest-drift]';
  const SDK = await import('../dist/pool-sdk/catalog.js');
  const EA = await import('../scene/equipmentalias.js').catch(() => ({}));
  const run = async (ea) => { const rows = []; await l78DriftCheck(ea, (name, ok, detail = '') => rows.push({ ok, line: checkLine(name, ok, detail) })); return rows; };
  const control = await run(EA); const controlFails = control.filter((r) => !r.ok);
  const renames = EA.TABLE_RENAMES && typeof EA.TABLE_RENAMES === 'object' ? EA.TABLE_RENAMES : {};
  const digests = Array.isArray(EA.ALIAS_DIGESTS) ? EA.ALIAS_DIGESTS : [];
  const clothRow = SDK.CATALOG_ALIAS_DIGESTS.find((r) => r.axis === 'cloth');
  const keptPairs = Object.fromEntries(Object.entries(renames).filter(([, n]) => n !== 'pool_pro_8ft'));
  const keptRows = digests.filter((r) => !(clothRow && r.axis === clothRow.axis && r.digest === clothRow.digest));
  const plants = [
    { name: 'drop-rename-pair', marker: 'pool_pro_8ft', what: 'TABLE_RENAMES without the pair whose neutral id is pool_pro_8ft',
      fixture: { ...EA, TABLE_RENAMES: Object.freeze(keptPairs) }, wellFormed: Object.keys(keptPairs).length === Object.keys(renames).length - 1 },
    { name: 'drop-digest-row', marker: clothRow ? clothRow.digest : '(no cloth digest row)', what: 'ALIAS_DIGESTS without the cloth digest row',
      fixture: { ...EA, ALIAS_DIGESTS: Object.freeze(keptRows) }, wellFormed: !!clothRow && keptRows.length === digests.length - 1 },
  ];
  let caught = 0;
  for (const { name, marker, what, fixture, wellFormed } of plants) {
    console.log(`${tag} plant ${name}: the leaf with ${what} (marker ${marker}); control on the real leaf: ${control.length} checks, ${controlFails.length} failure(s)`);
    if (!wellFormed || controlFails.length) {
      for (const r of controlFails) console.log(`${tag} control ${r.line}`);
      console.log(`${tag} ${name} INVALID: ${wellFormed ? 'the control is red, so a failure on the fixture is not the plant\'s' : 'the fixture does not remove exactly one row of the real leaf'}`);
      continue;
    }
    const rows = await run(fixture); const fails = rows.filter((r) => !r.ok);
    if (fails.length && fails.every((r) => r.line.includes(marker))) { caught += 1; for (const r of fails) console.log(`${tag} ${name} CAUGHT: ${r.line}`); }
    else if (!fails.length) console.log(`${tag} ${name} NOT CAUGHT: the check produced no failure line on the fixture (${rows.length} checks, 0 failures)`);
    else { console.log(`${tag} ${name} NOT CAUGHT: ${fails.length} failure line(s), not every one names ${marker}`); for (const r of fails) console.log(`${tag} ${name} fixture ${r.line}`); }
  }
  console.log(`${tag} ${caught} of ${plants.length} plants caught`);
  return caught === plants.length ? 0 : 1;
}
{
  const EA = await import('../scene/equipmentalias.js').catch(() => ({}));
  await l78DriftCheck(EA, check);
}

// ---- L79 (#789): the structural drift test of the renamed equipment ids (PLAN-J row 12, section 6.1 OPEN 1) ----
// The rename map is built from data: every SDK catalog table, cloth and ballset entry carrying ui_hidden AND superseded_by gives
// one { axis, old, neutral } entry, so no old or retired id is typed here. The kernel side is the canonical wasm, loaded by the SDK
// engine from the committed web/dist/pool-wasm/pool_wasm.js. Asserts: L79-1 every old id is a kernel catalog id; L79-2 the
// per-axis rename counts; L79-3a every kernel alias digest row resolves through the leaf web/scene/equipmentalias.js to its
// kernel twin (a direct (axis, digest) lookup in the leaf's ALIAS_DIGESTS, plus the leaf's pure lookup driven by one synthetic
// row, since the digests have no preimage here); L79-3b the kernel resolves each row's twin in new_rack_scenario; L79-5 every
// id-keyed map binds each old key's twin to a deep-equal value, with the per-map pair counts pinned; L79-6 the three twin-value
// pins, which name only neutral ids. One check function, l79DriftCheck(ctx, report), takes the maps and the rename map from ctx,
// so the --selftest-drift mode runs the same function on fixtures (l79DriftSelftest below). Every line has a stable key (the tag
// plus its subject). A load failure or a missing export is a FAIL line, never a SKIP.
function l79RenameMap(SDK) {
  return ['table_id', 'cloth_id', 'ballset_id'].flatMap((axis) => SDK.catalogEntries(axis)
    .filter((e) => e.ui_hidden === true && typeof e.superseded_by === 'string').map((e) => ({ axis, old: e.id, neutral: e.superseded_by })));
}
// The context, built once: each input that fails to load is null, with its error string in ctx.errors; nothing throws out.
async function l79Context() {
  const errors = {};
  const load = async (name, fn) => { try { return await fn(); } catch (e) { errors[name] = String((e && e.message) || e); return null; } };
  const SDK = await load('SDK', () => import('../dist/pool-sdk/catalog.js'));
  const eng = await load('engine', async () => (await import('../dist/pool-sdk/engine.js')).init(path.join(ROOT, 'dist', 'pool-wasm', 'pool_wasm.js')));
  const kernelIds = SDK && eng ? await load('kernel catalog', () => {
    const cat = eng.catalog();
    return Object.fromEntries(Object.entries(SDK.EQUIPMENT_AXES).map(([axis, key]) => [axis, new Set((cat[key] ?? []).map((e) => e.id))]));
  }) : null;
  const rows = eng ? await load('kernel alias rows', () => JSON.parse(eng.kernel.catalog_alias_digests_json())) : null;
  const EA = await import('../scene/equipmentalias.js').catch(() => ({}));
  const mods = {
    'synth.js': await load('synth.js', () => import('../app/synth.js')),
    'lightingvisuals.js': await load('lightingvisuals.js', () => import('../scene/lightingvisuals.js')),
    'clothvisuals.js': await load('clothvisuals.js', () => import('../scene/clothvisuals.js')),
    'ballset.js': await load('ballset.js', () => import('../app/ballset.js')),
  };
  const pick = (mod, pathKeys) => {
    if (!mods[mod]) return { map: null, why: `${mod} failed to load: ${errors[mod]}` };
    let v = mods[mod]; for (const k of pathKeys) v = v && typeof v === 'object' ? v[k] : undefined;
    return v && typeof v === 'object' ? { map: v, why: '' } : { map: null, why: `export absent: ${pathKeys.join('.')}` };
  };
  const maps = [
    ['TABLE_ACOUSTICS', 'table_id', 'synth.js', ['TABLE_ACOUSTICS']],
    ['BALLSET_ACOUSTICS', 'ballset_id', 'synth.js', ['BALLSET_ACOUSTICS']],
    ['CLOTH_ACOUSTICS', 'cloth_id', 'synth.js', ['CLOTH_ACOUSTICS']],
    ['VENUE_TERMS.byTable', 'table_id', 'lightingvisuals.js', ['VENUE_TERMS', 'byTable']],
    ['TABLE_FIXTURES', 'table_id', 'lightingvisuals.js', ['TABLE_FIXTURES']],
    ['CLOTH_VISUALS', 'cloth_id', 'clothvisuals.js', ['CLOTH_VISUALS']],
  ].map(([name, axis, mod, keys]) => ({ name, axis, ...pick(mod, keys) }));
  const style = mods['ballset.js'] ? (typeof mods['ballset.js'].poolSetStyle === 'function' ? { fn: mods['ballset.js'].poolSetStyle, why: '' } : { fn: null, why: 'export absent: poolSetStyle' })
    : { fn: null, why: `ballset.js failed to load: ${errors['ballset.js']}` };
  return { errors, SDK, eng, kernelIds, rows, EA, renames: SDK ? l79RenameMap(SDK) : null, maps, poolSetStyle: style.fn, poolSetStyleWhy: style.why };
}
async function l79DriftCheck(ctx, report) {
  const { isDeepStrictEqual } = await import('node:util');
  const probe = 'r79_synthetic_probe';
  const wantAxis = { table_id: 6, cloth_id: 2, ballset_id: 4 };
  const wantPairs = { TABLE_ACOUSTICS: 3, BALLSET_ACOUSTICS: 4, CLOTH_ACOUSTICS: 2, 'VENUE_TERMS.byTable': 3, TABLE_FIXTURES: 1, CLOTH_VISUALS: 2 };
  const wantSets = 4;
  const renames = Array.isArray(ctx.renames) ? ctx.renames : null;
  const renameWhy = renames ? '' : `SDK catalog failed to load: ${ctx.errors.SDK}`;
  const kernelWhy = ctx.kernelIds ? '' : `kernel catalog unavailable: ${ctx.errors.engine ?? ctx.errors['kernel catalog'] ?? ctx.errors.SDK}`;
  const oldIds = new Set((renames ?? []).map((e) => `${e.axis}:${e.old}`));
  // L79-1: every old id is a kernel catalog id.
  for (const axis of Object.keys(wantAxis)) {
    const entries = (renames ?? []).filter((e) => e.axis === axis);
    const bad = ctx.kernelIds ? entries.filter((e) => !ctx.kernelIds[axis]?.has(e.old)).map((e) => e.old) : [];
    report(`L79-1 ${axis}`, `L79-1 ${axis}: ${entries.length} key(s), ${bad.length} not a kernel catalog id: ${bad.join(', ') || 'none'}`,
      !!renames && !!ctx.kernelIds && !bad.length, renameWhy || kernelWhy);
  }
  // L79-2: the per-axis rename counts (counts, not ids), then the total with the short axes named.
  {
    const short = []; let total = 0;
    for (const [axis, w] of Object.entries(wantAxis)) {
      const n = (renames ?? []).filter((e) => e.axis === axis).length; total += n; if (n !== w) short.push(axis);
      report(`L79-2 ${axis}`, `L79-2 ${axis}: ${n} rename key(s) (want ${w})`, !!renames && n === w, renameWhy);
    }
    const want = Object.values(wantAxis).reduce((a, b) => a + b, 0);
    report('L79-2 total', `L79-2 total: ${total} (want ${want}); short axes: ${short.join(', ') || 'none'}`, !!renames && total === want && !short.length, renameWhy);
  }
  // L79-3a and L79-3b: the kernel alias digest rows (read from the wasm, never a literal).
  {
    const rows = ctx.rows;
    const shaped = Array.isArray(rows) && rows.length > 0 && rows.every((r) => r && typeof r.axis === 'string' && typeof r.digest === 'string' && typeof r.neutral_id === 'string');
    report('L79-3a guard', `L79-3a guard: the kernel alias digest rows are a non-empty array of { axis, digest, neutral_id } strings (${Array.isArray(rows) ? rows.length : 0} row(s))`, shaped,
      Array.isArray(rows) ? 'a row is malformed or the array is empty' : `kernel alias rows unavailable: ${ctx.errors.engine ?? ctx.errors['kernel alias rows']}`);
    const EA = ctx.EA ?? {};
    const leafRows = Array.isArray(EA.ALIAS_DIGESTS) ? EA.ALIAS_DIGESTS : null;
    const drive = typeof EA.aliasDigestTarget === 'function' && typeof EA.fnv1a64Hex === 'function';
    for (const row of shaped ? rows : []) {
      const key = `${row.axis}:${row.digest}`; const axisId = `${row.axis}_id`;
      const got = leafRows ? leafRows.find((l) => l && l.axis === row.axis && l.digest === row.digest)?.neutral_id : undefined;
      const live = !!ctx.kernelIds && !!ctx.kernelIds[axisId]?.has(got); const isOld = oldIds.has(`${axisId}:${got}`);
      report(`L79-3a ${key}`, `L79-3a ${key}: the leaf digest table maps it to ${got} (kernel row neutral_id ${row.neutral_id}; ${live ? 'a kernel catalog id' : 'not a kernel catalog id'}; ${isOld ? 'an old id of the rename map' : 'not an old id'})`,
        !!leafRows && got === row.neutral_id && live && !isOld, leafRows ? kernelWhy : 'leaf export absent: ALIAS_DIGESTS');
      const syn = drive ? [{ axis: row.axis, digest: EA.fnv1a64Hex(probe), neutral_id: row.neutral_id }] : [];
      const d = drive ? EA.aliasDigestTarget(syn, axisId, probe) : undefined;
      report(`L79-3a drive ${key}`, `L79-3a drive ${key}: the leaf's pure lookup over one synthetic row (${probe} on ${row.axis}) -> ${d} (want ${row.neutral_id})`, drive && d === row.neutral_id,
        drive ? '' : 'leaf export absent: aliasDigestTarget or fnv1a64Hex');
      let err; let out;
      if (!ctx.eng) err = `engine unavailable: ${ctx.errors.engine}`;
      else {
        try { out = JSON.parse(ctx.eng.kernel.new_rack_scenario('nine', 0n, JSON.stringify({ [axisId]: row.neutral_id }))); err = out && out.error !== undefined ? String(out.error) : undefined; }
        catch (e) { err = `threw: ${(e && e.message) || e}`; }
      }
      report(`L79-3b ${key}`, `L79-3b ${key}: the kernel resolves ${axisId} ${row.neutral_id} in new_rack_scenario (${err === undefined ? 'no error' : 'error: ' + err})`, err === undefined);
    }
  }
  // L79-5: every map binds each old key's twin to a deep-equal value; the pair counts are pinned per map.
  for (const m of ctx.maps ?? []) {
    const w = wantPairs[m.name];
    const pairs = m.map && renames ? renames.filter((e) => e.axis === m.axis && Object.hasOwn(m.map, e.old)) : [];
    for (const e of pairs) {
      const has = Object.hasOwn(m.map, e.neutral);
      report(`L79-5 ${m.name}:${e.old}`, `L79-5 ${m.name}: ${e.old} -> ${e.neutral}`, has && isDeepStrictEqual(m.map[e.neutral], m.map[e.old]),
        has ? 'the twin value differs from the old key value' : `twin key absent: ${e.neutral}`);
    }
    report(`L79-5 ${m.name}:count`, `L79-5 ${m.name} [${m.axis}]: ${pairs.length} pair(s) compared (want ${w})`, !!m.map && !!renames && pairs.length === w, m.why || renameWhy);
  }
  {
    const fn = ctx.poolSetStyle; const sets = fn && renames ? renames.filter((e) => e.axis === 'ballset_id') : [];
    let styled = 0;
    for (const e of sets) {
      const s = fn(e.old, 0) !== null; if (s) styled += 1;
      const diff = []; for (let i = 0; i <= 15; i += 1) if (!isDeepStrictEqual(fn(e.neutral, i), fn(e.old, i))) diff.push(i);
      report(`L79-5 poolSetStyle:${e.old}`, `L79-5 poolSetStyle: ${e.old} -> ${e.neutral} (${s ? 'styled' : 'no style'}; ball ids 0..15)`, !diff.length, `differs at ball id(s) ${diff.join(', ')}`);
    }
    const why = fn ? renameWhy : ctx.poolSetStyleWhy;
    report('L79-5 poolSetStyle:count', `L79-5 poolSetStyle [ballset_id]: ${sets.length} set(s) compared (want ${wantSets})`, !!fn && !!renames && sets.length === wantSets, why);
    report('L79-5 poolSetStyle:styled', `L79-5 poolSetStyle [ballset_id]: ${styled} styled set(s) (want >= 1)`, !!fn && styled >= 1, why);
  }
  // L79-6: the twin-value pins (neutral ids only); both keys must be own keys, so undefined never equals undefined.
  for (const [name, pin, base] of [['TABLE_ACOUSTICS', 'pool_pro_9ft_measured', 'pool_pro_9ft'], ['CLOTH_ACOUSTICS', 'pool_worsted_measured', 'pool_worsted_new'], ['VENUE_TERMS.byTable', 'pool_pro_9ft_measured', 'pool_pro_9ft']]) {
    const m = (ctx.maps ?? []).find((x) => x.name === name); const map = m ? m.map : null;
    const missing = map ? [pin, base].filter((k) => !Object.hasOwn(map, k)) : [];
    report(`L79-6 ${name}.${pin}`, `L79-6 ${name}.${pin} deep-equals ${name}.${base}`, !!map && !missing.length && isDeepStrictEqual(map[pin], map[base]),
      !map ? (m ? m.why : `map absent: ${name}`) : missing.length ? `key(s) absent: ${missing.join(', ')}` : 'the values differ');
  }
}
// --selftest-drift: the in-suite synthetic plants of l79DriftCheck. Each fixture changes exactly one thing of the real context,
// selected by data (the markers are read from data or are the synthetic probe). A plant is CAUGHT only when the control (the real
// context) has 0 failures, the set of failing keys on the fixture equals the plant's expected set exactly, and every failing line
// names the marker. A plant with no failure, or with a different failing set, is NOT CAUGHT (both sets printed); a plant whose
// fixture guard is false or whose expected set is empty is INVALID. Returns the exit code: 0 only when every plant is caught.
async function l79DriftSelftest() {
  const tag = '[L79 selftest-drift]';
  const probe = 'r79_synthetic_probe';
  const ctx = await l79Context();
  const run = async (c) => { const rows = []; await l79DriftCheck(c, (key, name, ok, detail = '') => rows.push({ key, ok, line: checkLine(name, ok, detail) })); return rows; };
  const control = await run(ctx); const controlFails = control.filter((r) => !r.ok);
  const renames = Array.isArray(ctx.renames) ? ctx.renames : [];
  const maps = ctx.maps ?? [];
  const mapOf = (name) => maps.find((m) => m.name === name)?.map ?? null;
  const withMap = (name, map) => maps.map((m) => (m.name === name ? { ...m, map } : m));
  const tableMaps = maps.filter((m) => m.axis === 'table_id');
  const plants = [];
  {
    const target = renames.find((e) => e.axis === 'table_id' && tableMaps.every((m) => m.map && !Object.hasOwn(m.map, e.old)));
    const fixed = renames.map((e) => (e === target ? { ...e, old: probe } : e));
    plants.push({ name: 'foreign-map-key', marker: probe, what: `the rename map with the table entry ${target ? target.old + ' -> ' + target.neutral : '(none in no table map)'} keyed by the probe`,
      fixture: { ...ctx, renames: fixed }, expected: target ? ['L79-1 table_id'] : [], wellFormed: !!target && fixed.filter((e, i) => e !== renames[i]).length === 1 });
  }
  {
    const last = renames.filter((e) => e.axis === 'ballset_id').at(-1);
    const kept = renames.filter((e) => e !== last);
    const expected = last ? [`L79-2 ${last.axis}`, 'L79-2 total', ...maps.filter((m) => m.axis === last.axis && m.map && Object.hasOwn(m.map, last.old)).map((m) => `L79-5 ${m.name}:count`),
      'L79-5 poolSetStyle:count'] : [];
    plants.push({ name: 'drop-rename-pair', marker: last ? last.axis : '(no ballset entry)', what: `the rename map without its last ballset entry ${last ? last.old + ' -> ' + last.neutral : '(none)'}`,
      fixture: { ...ctx, renames: kept }, expected, wellFormed: !!last && kept.length === renames.length - 1 });
  }
  {
    const EA = ctx.EA ?? {}; const digests = Array.isArray(EA.ALIAS_DIGESTS) ? EA.ALIAS_DIGESTS : [];
    const row = digests.find((r) => r && r.axis === 'table');
    const fixed = Object.freeze(digests.map((r) => (r === row ? Object.freeze({ ...r, neutral_id: probe }) : r)));
    plants.push({ name: 'leaf-digest-row', marker: probe, what: `the leaf ALIAS_DIGESTS with the table row ${row ? row.digest : '(none)'} mapped to the probe`,
      fixture: { ...ctx, EA: { ...EA, ALIAS_DIGESTS: fixed } }, expected: row ? [`L79-3a ${row.axis}:${row.digest}`] : [], wellFormed: !!row && fixed.filter((r, i) => r !== digests[i]).length === 1 });
  }
  {
    const rows = Array.isArray(ctx.rows) ? ctx.rows : [];
    const row = rows.find((r) => r && r.axis === 'cloth');
    const fixed = rows.map((r) => (r === row ? { ...r, neutral_id: probe } : r));
    plants.push({ name: 'kernel-row', marker: probe, what: `the kernel alias rows with the cloth row ${row ? row.digest : '(none)'} mapped to the probe`,
      fixture: { ...ctx, rows: fixed }, expected: row ? [`L79-3a ${row.axis}:${row.digest}`, `L79-3b ${row.axis}:${row.digest}`] : [], wellFormed: !!row && fixed.filter((r, i) => r !== rows[i]).length === 1 });
  }
  {
    const tf = mapOf('TABLE_FIXTURES');
    const olds = tf ? renames.filter((e) => e.axis === 'table_id' && Object.hasOwn(tf, e.old)) : [];
    const pair = olds.length === 1 ? olds[0] : null;
    const fixed = tf && pair ? Object.freeze(Object.fromEntries(Object.entries(tf).filter(([k]) => k !== pair.neutral))) : null;
    plants.push({ name: 'drop-map-twin', marker: pair ? pair.neutral : '(no single old key)', what: `TABLE_FIXTURES without the twin key ${pair ? pair.neutral : '(none)'} of its one old key`,
      fixture: { ...ctx, maps: withMap('TABLE_FIXTURES', fixed) }, expected: pair ? [`L79-5 TABLE_FIXTURES:${pair.old}`] : [],
      wellFormed: !!fixed && Object.hasOwn(tf, pair.neutral) && Object.keys(fixed).length === Object.keys(tf).length - 1 });
  }
  {
    const ta = mapOf('TABLE_ACOUSTICS'); const pin = 'pool_pro_9ft_measured';
    const real = ta && Object.hasOwn(ta, pin) ? ta[pin] : null;
    const fixed = real && typeof real.thump === 'number' ? { ...ta, [pin]: { ...real, thump: real.thump + 1 } } : null;
    plants.push({ name: 'twin-value', marker: pin, what: `a TABLE_ACOUSTICS copy whose ${pin} thump is one more than the real value`,
      fixture: { ...ctx, maps: withMap('TABLE_ACOUSTICS', fixed) }, expected: fixed ? [`L79-6 TABLE_ACOUSTICS.${pin}`] : [], wellFormed: !!fixed });
  }
  let caught = 0;
  for (const { name, marker, what, fixture, expected, wellFormed } of plants) {
    console.log(`${tag} plant ${name}: ${what} (marker ${marker}); control on the real context: ${control.length} checks, ${controlFails.length} failure(s)`);
    if (!wellFormed || !expected.length || controlFails.length) {
      for (const r of controlFails) console.log(`${tag} control ${r.line}`);
      console.log(`${tag} ${name} INVALID: ${controlFails.length ? 'the control is red, so a failure on the fixture is not the plant\'s' : 'the fixture does not change exactly one thing of the real context, or its expected set is empty'}`);
      continue;
    }
    const rows = await run(fixture); const fails = rows.filter((r) => !r.ok);
    const got = [...new Set(fails.map((r) => r.key))].sort(); const want = [...new Set(expected)].sort();
    const sameSet = got.length === want.length && got.every((k, i) => k === want[i]);
    if (fails.length && sameSet && fails.every((r) => r.line.includes(marker))) { caught += 1; for (const r of fails) console.log(`${tag} ${name} CAUGHT: ${r.line}`); }
    else if (!fails.length) console.log(`${tag} ${name} NOT CAUGHT: the check produced no failure line on the fixture (${rows.length} checks, 0 failures)`);
    else {
      console.log(`${tag} ${name} NOT CAUGHT: failing keys {${got.join(' | ')}}, expected {${want.join(' | ')}}${fails.every((r) => r.line.includes(marker)) ? '' : `; not every failure line names ${marker}`}`);
      for (const r of fails) console.log(`${tag} ${name} fixture ${r.line}`);
    }
  }
  console.log(`${tag} ${caught} of ${plants.length} plants caught`);
  return caught === plants.length ? 0 : 1;
}
{
  const ctx = await l79Context();
  await l79DriftCheck(ctx, (key, name, ok, detail) => check(name, ok, detail));
}

// ---- L80 (#789, review b19tJ3 P1): the app-default equipment under the the ownership ledger mixed-cache contract ----
// A returning browser can load the fresh settings.js / scene/table.js next to a stale cached SDK catalog, games module or
// kernel that predates the neutral ids. The production functions are sliced BY NAME from web/app/settings.js and
// web/scene/table.js with the vendored acorn (line + sha256 printed) and run in a fresh vm context per cell and per plant
// (their module-level memo and note cells never leak between runs). Pairings: F all fresh (the control); K the archived
// b6b5dc3f kernel (web/tools/fixtures/b6b5dc3f-wasm, refused unless version() is 0.1.0+b6b5dc3f); C1 a stale SDK catalog;
// C2 a stale SDK catalog and games module; KC all three stale. The stale SDK catalog is a MODEL built from the b6b5dc3f
// kernel's own catalog_json() (the SDK catalog mirrors the kernel), and the stale games model maps each fresh class through
// the reverse of TABLE_RENAMES (L80-0 checks both models). Profiles: P0 no blob, P1 a pre-rename blob, P2 a blob holding
// a table only the fresh kernel knows. Checks per cell: L80b every axis is a catalog id of the cell's SDK catalog (what
// ScenarioBuilder.equipment validates); L80c the cell's kernel racks nine-ball on the spec; L80d the scene boot id
// (resolveBootTableId) builds the same TABLE_SPECS object and the cell's kernel serves its geometry (main.js
// checkActiveTableMirror); on P0 only: L80e every legacy id in the spec was announced once; L80f (F) no note, the spec is
// DEFAULTS.equipment and the scene is APP_DEFAULT_TABLE_ID; L80g (stale cells) the spec is the pre-rename tuple.
// Review follow-up (review b19tJ3 P1): P3 a blob holding a NON-default pre-rename table; L80h (P3) settings keep that saved table
// (its neutral twin only where catalog and kernel are fresh), never the app default; L80i (blob profiles) bootWriteBack writes
// the blob back only when every sibling is fresh (a stale-sibling degrade never replaces the saved choice); L80j (P0) the load()
// full-reset path (storage read throws) hands out the same gated tuple as L80f / L80g.
// Review follow-up 2 (review b19tJ3 P1): the blob goes through loadEquipment and persist()'s savedEquipmentBlob. L80k (blob
// profiles) after one non-equipment set() the stored equipment and equipmentByGame keep every saved id (fresh cells: the
// sanitized spec); L80l (blob profiles) after a user table pick the pick is stored (an axis moved off its degraded id ends the hold);
// L80m (F) the stored blob is byte-identical to the pre-hold persist() expression; L80n (K P2) a saved neutral table the stale
// kernel lacks takes its pre-rename twin in settings and scene alike.
// Review follow-up 3 (review b19tJ3 P1): G a stale games module alone (kernel and SDK catalog fresh): its classes list the
// pre-rename ids, which defaultEquipmentFor and the class checks of sanitizeSpec / resolveBootTableId accept as the renamed
// table's twin, so settings play the neutral app default (L80g: the gated tuple is DEFAULTS.equipment there) and a saved
// renamed table stays (L80h, L80i write-back, L80k) in settings and scene alike (L80d). P4 (F, G) a blob holding ids no
// sibling knows: they heal to the default and the boot write-back persists it (L80o, L80i). P5 (F, G) a table the stale games
// class lacks with no rename twin: G falls to the default in settings and scene and holds the saved id (no write-back, L80k).
// C1 P2, C1 P3 and C2 P3 (recorded residuals before) run too: sanitizeSpec keeps the pre-rename twin of a neutral table a stale
// SDK catalog lacks and accepts a saved pre-rename id through its neutral twin in a fresh class, so both readers build one
// TABLE_SPECS entry.
// The constants live in a hoisted function: --selftest-drift dispatches near the top of the file, before a top-level const here
// would be initialised.
function l80Consts() {
  return {
    SETTINGS_NAMES: ['LEGACY_DEFAULT_EQUIPMENT', 'AXES', 'DISCIPLINE_CLOTH', 'GAME_CLOTH', 'kernelCatalogMemo', 'kernelEquipmentKnown',
      'equipmentDegradeNoted', 'staleSiblingSeen', 'appDefaultEquipment', 'defaultEquipmentFor', 'legalTableIds', 'migratedEquipmentId', 'sanitizeSpec',
      'KEY', 'bootWriteBack', 'load', 'loadEquipment', 'savedEquipmentBlob',
      'ctx', 'kernelCatalogList', 'EQUIPMENT_KIND_AXIS', 'sceneTableVerdict', 'equipmentTwinCandidates', 'equipmentSupported',
      'kernelAliasMemo', 'kernelAliasRows', 'equipmentDigestTwin', 'sdkEquipmentKnown'],
    TABLE_NAMES: ['resolveBootTableId', 'kernelTableIds', 'kernelTableKnown', 'appDefaultTableId', 'bootLegalTableIds', 'bootClassDefaultTableId',
      'resolvableTableId'],
    PROFILES: {
      P0: null,
      P1: { table_id: 'diamond_proam_9ft', cloth_id: 'simonis_860_tournament', ballset_id: 'aramith_pool' },
      P2: { table_id: 'pool_pro_8ft' },
      P3: { table_id: 'diamond_redlabel_9ft' },
      P4: { table_id: 'no_such_table_9ft', cloth_id: 'no_such_cloth' },
      P5: { table_id: 'pool_pro_9ft_measured' },
    },
    // profiles run only in these cells (every other profile runs in every cell, less the recorded residual skips)
    PROFILE_CELLS: { P4: ['F', 'G'], P5: ['F', 'G'] },
    // profiles whose saved table a stale games class lacks with no rename twin: a stale-sibling degrade under G
    G_DEGRADE: ['P5'],
    // P3's table (a NON-default pre-rename id the archived kernel lists) as the cell's settings should keep it: its neutral twin
    // where the SDK catalog and kernel are fresh, else the pre-rename id itself.
    P3_KEEP: { fresh: 'pool_pro_9ft_older_gen', stale: 'diamond_redlabel_9ft' },
    // P2's table under a stale kernel with a fresh SDK catalog: its pre-rename twin (TABLE_RENAMES reversed)
    P2_TWIN: 'diamond_proam_8ft',
    // the user pick of L80l: the first of these that is neither the loaded nor the saved table
    PICKS: ['pool_pro_7ft', 'diamond_proam_7ft'],
    STALE_VERSION: '0.1.0+b6b5dc3f',
    // L80p: the pre-rename scene (S3) is web/scene/table.js at STALE_SCENE_REV (the parent of the v20 rename commit
    // 6f333d92), read from STALE_SCENE_FIXTURE (gen-stale-scene-fixture.mjs extracts it; the suite never reads git history,
    // a CI checkout is depth 1); its TABLE_SPECS keys (checked against that extract by L80-0 stale scene) are the ground
    // truth of what a stale scene builds.
    STALE_SCENE_REV: '7352fa8ed2acdb401d66251b5ddc9ca245361e3d',
    STALE_SCENE_FIXTURE: 'tools/fixtures/scene-table-stale-7352fa8e.mjs',
    STALE_SCENE_KEYS: ['wpa_generic_9ft', 'wpa_spec_9ft', 'diamond_redlabel_9ft', 'diamond_proam_9ft', 'predator_apex_9ft', 'rasson_ox_9ft',
      'wpbsa_snooker_12ft', 'umb_carom_284', 'chinese8_pro_9ft', 'joy_q8_9ft', 'diamond_proam_8ft', 'diamond_proam_7ft'],
    // L80p cells: [kernel, SDK catalog, scene] with scene 'fresh' (the handle carries the resolvesTable probe), 'stale' (a handle
    // without it: the pre-rename scene) or 'none' (no handle yet). Census columns: FRESH, S1 (SDK catalog), S2 (kernel), S3 (scene).
    PRED_CELLS: { FRESH: ['fresh', 'fresh', 'fresh'], S1: ['fresh', 'stale', 'fresh'], S2: ['stale', 'fresh', 'fresh'], S3: ['fresh', 'fresh', 'stale'],
      S1S2: ['stale', 'stale', 'fresh'], S2S3: ['stale', 'fresh', 'stale'], S1S2S3: ['stale', 'stale', 'stale'], NOSCENE: ['fresh', 'fresh', 'none'] },
    // L80p cases [kind, id]; the S4 column is the saved pre-rename ids (diamond_proam_9ft, rasson_ox_9ft, simonis_760_fast,
    // aramith_pool_worn, predator_z2) run in every cell. RETIRED ('@retired') stands for the kind's retired digest-row id,
    // recovered at run time from the kernel catalog source by its digest (l80Context: ctx.retired), never written here.
    PRED_CASES: [['table', 'pool_pro_9ft'], ['table', 'pool_pro_9ft_k55'], ['table', 'pool_pro_9ft_measured'], ['table', 'diamond_proam_9ft'],
      ['table', 'rasson_ox_9ft'], ['table', 'wpbsa_snooker_12ft'], ['table', 'no_such_table_9ft'], ['cloth', 'pool_worsted_new'],
      ['cloth', 'pool_worsted_fast'], ['cloth', 'simonis_760_fast'], ['cloth', 'no_such_cloth'], ['table', '@retired'], ['cloth', '@retired'],
      ['cloth', 'pool_worsted_measured'], ['ballset', 'pool_standard'], ['ballset', 'pool_used'],
      ['ballset', 'aramith_pool_worn'], ['cue', 'pro_ld_pivot_141'], ['cue', 'predator_z2'], ['cushion', 'stronge_realistic'], ['cushion', 'no_such_model']],
    // L80q: the twin the ruled order must return, per cell ('self' = ok with the id itself, null = refuse). The pins each name the
    // rung that decides: TABLE_RENAMES reversed (k55 -> rasson_ox_9ft, never the default), the superseded_by reverse from the
    // SDK catalog (S2) or the kernel catalog (S1) for cloth and ballset, the pre-rename default when no loaded sibling knows a pair
    // (S1S2), and refusal when no rung is left (cushion). '@retired' (as a case or a twin) is the kind's retired digest-row id:
    // a stale sibling lists it in plain text, so it is the twin of its neutral id there (the digest reverse); the residual is
    // a stale scene with fresh lists (S3), where no loaded list names it and the pre-rename default is taken.
    PRED_TWINS: {
      'table:pool_pro_9ft': { FRESH: 'self', S1: 'diamond_proam_9ft', S2: 'diamond_proam_9ft', S3: 'diamond_proam_9ft', S1S2: 'diamond_proam_9ft',
        S2S3: 'diamond_proam_9ft', S1S2S3: 'diamond_proam_9ft', NOSCENE: 'self' },
      'table:pool_pro_9ft_k55': { FRESH: 'self', S1: 'rasson_ox_9ft', S2: 'rasson_ox_9ft', S3: 'rasson_ox_9ft', S1S2S3: 'rasson_ox_9ft' },
      'table:pool_pro_9ft_measured': { FRESH: 'self', S1: '@retired', S2: '@retired', S3: 'diamond_proam_9ft', S1S2S3: '@retired' },
      'table:@retired': { FRESH: 'self', S1: 'self', S2: 'self', S3: 'self', S1S2S3: 'self', NOSCENE: 'self' },
      'table:no_such_table_9ft': { FRESH: 'diamond_proam_9ft', S3: 'diamond_proam_9ft' },
      'table:diamond_proam_9ft': { FRESH: 'self', S1: 'self', S2: 'self', S3: 'self', S1S2S3: 'self' },
      'table:wpbsa_snooker_12ft': { FRESH: 'self', S1S2S3: 'self' },
      'cloth:pool_worsted_fast': { FRESH: 'self', S1: 'simonis_760_fast', S2: 'simonis_760_fast', S1S2: 'simonis_860_tournament' },
      'cloth:pool_worsted_new': { FRESH: 'self', S1: 'simonis_860_tournament', S2: 'simonis_860_tournament' },
      'cloth:simonis_760_fast': { FRESH: 'self', S1S2S3: 'self' },
      'cloth:pool_worsted_measured': { FRESH: 'self', S1: '@retired', S2: '@retired', S1S2: '@retired' },
      'cloth:@retired': { FRESH: 'self', S1: 'self', S2: 'self', S1S2: 'self' },
      'ballset:pool_used': { FRESH: 'self', S1: 'aramith_pool_worn', S2: 'aramith_pool_worn', S1S2: 'aramith_pool' },
      'ballset:aramith_pool_worn': { FRESH: 'self', S1S2S3: 'self' },
      'cue:predator_z2': { FRESH: 'self', S1S2S3: 'self' },
      'cushion:no_such_model': { FRESH: null, S1S2S3: null },
    },
  };
}
// Top-level declarations of `src` by name: { code, line, sha } (export keyword stripped), plus DEFAULTS.equipment's literal.
async function l80Slices(src, names, file) {
  const { parse } = await import('../../tools/render/lib/vendor/acorn/acorn.mjs');
  const { createHash } = await import('node:crypto');
  const ast = parse(src, { ecmaVersion: 'latest', sourceType: 'module' });
  const out = {}; const missing = [];
  const put = (name, node) => {
    const code = src.slice(node.start, node.end); const line = src.slice(0, node.start).split('\n').length;
    out[name] = { code, line, sha: createHash('sha256').update(code).digest('hex') };
  };
  for (const top of ast.body) {
    const d = top.type === 'ExportNamedDeclaration' ? top.declaration : top;
    if (!d) continue;
    if (d.type === 'FunctionDeclaration' && names.includes(d.id.name)) put(d.id.name, d);
    if (d.type === 'VariableDeclaration') {
      for (const v of d.declarations) {
        if (v.id.type === 'Identifier' && names.includes(v.id.name)) put(v.id.name, d);
        if (v.id.name === 'DEFAULTS' && names.includes('DEFAULTS.equipment')) {
          const obj = v.init?.arguments?.[0];
          const prop = obj?.properties?.find((p) => p.key?.name === 'equipment');
          if (prop) put('DEFAULTS.equipment', prop.value);
        }
      }
    }
  }
  for (const n of names) if (!out[n]) missing.push(n);
  return { slices: out, missing, file };
}
async function l80Context() {
  const errors = {};
  const load = async (name, fn) => { try { return await fn(); } catch (e) { errors[name] = String((e && e.message) || e); return null; } };
  const settingsSrc = fs.readFileSync(path.join(ROOT, 'app', 'settings.js'), 'utf8');
  const tableSrc = fs.readFileSync(path.join(ROOT, 'scene', 'table.js'), 'utf8');
  const settings = await l80Slices(settingsSrc, [...l80Consts().SETTINGS_NAMES, 'DEFAULTS.equipment'], 'web/app/settings.js');
  const table = await l80Slices(tableSrc, l80Consts().TABLE_NAMES, 'web/scene/table.js');
  const { init } = await import('../dist/pool-sdk/engine.js');
  const fresh = await load('fresh kernel', () => init(path.join(ROOT, 'dist', 'pool-wasm', 'pool_wasm.js')));
  const stale = await load('stale kernel', async () => {
    const e = await init(path.join(ROOT, 'tools', 'fixtures', 'b6b5dc3f-wasm', 'pool_wasm.js'));
    if (e.version() !== l80Consts().STALE_VERSION) throw new Error(`archived kernel stamps ${e.version()}, want ${l80Consts().STALE_VERSION}`);
    return e;
  });
  const SDK = await import('../dist/pool-sdk/catalog.js');
  const SDKI = await import('../dist/pool-sdk/index.js');
  const games = await import('../dist/pool-sdk/games/index.js');
  const EA = await import('../scene/equipmentalias.js');
  const TM = await import('./table-in-node.mjs').then((m) => m.loadTableModule());
  // the retired digest-row id of each digest axis, recovered from the kernel catalog source by its digest (never plain text
  // in this file); every L80p/q line is scrubbed of it (l80Scrub)
  const retired = await load('retired ids', () => {
    const src = fs.readFileSync(path.join(ROOT, '..', 'crates', 'pool-core', 'src', 'catalog.rs'), 'utf8');
    const found = { table_id: new Set(), cloth_id: new Set() };
    for (const [, id] of src.matchAll(/"([a-z0-9_]+)"/g)) for (const axis of Object.keys(found)) if (EA.aliasDigestTarget(EA.ALIAS_DIGESTS, axis, id)) found[axis].add(id);
    const bad = Object.entries(found).filter(([, ids]) => ids.size !== 1).map(([axis, ids]) => `${axis} ${ids.size}`);
    if (bad.length) throw new Error(`want one retired id per digest axis in catalog.rs, found ${bad.join(', ')}`);
    return Object.fromEntries(Object.entries(found).map(([axis, ids]) => [axis, [...ids][0]]));
  }) ?? { table_id: null, cloth_id: null };
  const staleCat = stale ? stale.catalog() : null;
  const staleEntry = (axis, id) => staleCat?.[SDK.EQUIPMENT_AXES[axis]]?.find((e) => e.id === id);
  const reverse = Object.fromEntries(Object.entries(EA.TABLE_RENAMES).map(([o, n]) => [n, o]));
  const staleGame = (id) => {
    const e = games.getGameEntry(id); const tc = e.table_class;
    // a digest-alias twin has no plain-text preimage here, so an id the archived kernel does not list is left out of the model
    const known = new Set(staleCat?.tables?.map((t) => t.id) ?? []);
    return tc.kind !== 'catalog' ? e : { ...e, table_class: { ...tc, table_ids: tc.table_ids.map((t) => reverse[t] ?? t).filter((t) => known.has(t)) } };
  };
  const catalogs = { fresh: SDK.catalogEntry, stale: staleEntry };
  const catalogLists = { fresh: SDK.catalogEntries, stale: (axis) => staleCat?.[SDK.EQUIPMENT_AXES[axis]] ?? [] };
  const staleScene = await load('stale scene source', async () => {
    const src = fs.readFileSync(path.join(ROOT, l80Consts().STALE_SCENE_FIXTURE), 'utf8');
    if (!src.includes(`\n// Source: git show ${l80Consts().STALE_SCENE_REV}:web/scene/table.js\n`)) throw new Error(`${l80Consts().STALE_SCENE_FIXTURE} does not name ${l80Consts().STALE_SCENE_REV} as its source`);
    return src;
  });
  const gameMods = { fresh: games, stale: { getGameEntry: staleGame, DEFAULT_GAME: games.DEFAULT_GAME } };
  const kernels = { fresh, stale };
  const cells = { F: ['fresh', 'fresh', 'fresh'], K: ['stale', 'fresh', 'fresh'], C1: ['fresh', 'stale', 'fresh'], C2: ['fresh', 'stale', 'stale'], KC: ['stale', 'stale', 'stale'],
    G: ['fresh', 'fresh', 'stale'] };
  return { errors, settings, table, kernels, catalogs, catalogLists, gameMods, cells, SDK, SDKI, EA, TM, staleCat, staleGame, staleScene, retired };
}
// A line with every retired digest-row id token replaced by its axis sentinel (@retired_table / @retired_cloth).
function l80Scrub(ctx, text) {
  const map = {};
  if (ctx.retired.table_id) map[ctx.retired.table_id] = '@retired_table';
  if (ctx.retired.cloth_id) map[ctx.retired.cloth_id] = '@retired_cloth';
  return String(text).replace(/[a-z0-9_]+/g, (tok) => (Object.hasOwn(map, tok) ? map[tok] : tok));
}
// One run of every cell x profile on (possibly planted) slice code: fresh vm contexts, nothing shared between runs.
async function l80Run(ctx, plant = null) {
  const vm = await import('node:vm');
  const code = (sl, names) => names.map((n) => sl.slices[n]?.code ?? '').join('\n');
  let sCode = `const DEFAULTS = Object.freeze({ equipment: ${ctx.settings.slices['DEFAULTS.equipment']?.code ?? '{}'} });\n` + code(ctx.settings, l80Consts().SETTINGS_NAMES)
    + '\nglobalThis.__out = { sanitizeSpec, defaultEquipmentFor, DEFAULTS, LEGACY_DEFAULT_EQUIPMENT, bootWriteBack, load, loadEquipment, savedEquipmentBlob };';
  let tCode = code(ctx.table, l80Consts().TABLE_NAMES) + '\nglobalThis.__out = { resolveBootTableId };';
  let anchorFound = true;
  if (plant) {
    const target = plant.file === 'table' ? tCode : sCode;
    anchorFound = target.split(plant.anchor).length === 2;
    const planted = target.replace(plant.anchor, plant.replacement);
    if (plant.file === 'table') tCode = planted; else sCode = planted;
  }
  const results = [];
  for (const [cell, [k, c, g]] of Object.entries(ctx.cells)) {
    for (const [prof, eq] of Object.entries(l80Consts().PROFILES)) {
      if (l80Consts().PROFILE_CELLS[prof] && !l80Consts().PROFILE_CELLS[prof].includes(cell)) continue;
      const eng = ctx.kernels[k]; const notes = [];
      const r = { cell, prof, k, c, g, notes, err: null };
      try {
        const sdkNs = { EQUIPMENT_AXES: ctx.SDKI.EQUIPMENT_AXES, DISCIPLINE_DEFAULT_CUE_IDS: c === 'fresh' ? ctx.SDKI.DISCIPLINE_DEFAULT_CUE_IDS : undefined };
        const blob = eq ? JSON.stringify({ game: 'nine_ball', equipment: eq }) : null;
        // storage.throws drives load() into its full-reset catch (the corrupt-blob / storage-failure path)
        const storage = { throws: false };
        const sbox = vm.createContext({ catalogEntry: ctx.catalogs[c], catalogEntries: ctx.catalogLists[c], getGameEntry: ctx.gameMods[g].getGameEntry, sdk: sdkNs, poolWasm: eng?.kernel ?? {},
          equipmentAlias: ctx.EA, console: { warn: (m) => notes.push(String(m)) },
          localStorage: { getItem: (key) => { if (storage.throws) throw new Error('storage unavailable'); return key === 'ob-settings-v1' ? blob : null; } } });
        vm.runInContext(sCode, sbox);
        const S = sbox.__out;
        r.defaults = S.DEFAULTS.equipment; r.legacy = S.LEGACY_DEFAULT_EQUIPMENT;
        r.spec = { ...S.sanitizeSpec(eq ?? undefined, S.defaultEquipmentFor('nine_ball'), 'nine_ball') };
        r.wrote = false;
        S.bootWriteBack(() => { r.wrote = true; });
        // a session: loadEquipment (load()'s equipment half), one non-equipment set() (persist writes savedEquipmentBlob), then a
        // user table pick (commitSetting sets persistedEquipment and equipmentByGame[game] to the pick, then persist)
        const saved = blob ? JSON.parse(blob) : {};
        const L = S.loadEquipment(saved.equipmentByGame, { ...(saved.equipment ?? {}) }, 'nine_ball');
        r.loaded = { ...L.equipment };
        r.held = JSON.parse(JSON.stringify(L.held));
        r.setJson = JSON.stringify(S.savedEquipmentBlob(L.equipment, 'nine_ball', L.byGame, L.held));
        r.oldJson = JSON.stringify({ equipment: L.equipment, equipmentByGame: { ...L.byGame, nine_ball: { ...L.equipment } } });
        const pick = { ...L.equipment, table_id: l80Consts().PICKS.find((t) => t !== L.equipment.table_id && t !== eq?.table_id) };
        r.pick = pick;
        r.pickJson = JSON.stringify(S.savedEquipmentBlob(pick, 'nine_ball', { ...L.byGame, nine_ball: { ...pick } }, L.held));
        storage.throws = true;
        const reset = S.load();
        r.reset = { ...reset.equipment };
        r.resetStored = JSON.parse(JSON.stringify(S.savedEquipmentBlob(reset.equipment, S.DEFAULTS.game, reset.equipmentByGame, reset.heldEquipment ?? {})));
        const tbox = vm.createContext({ TABLE_SPECS: ctx.TM.TABLE_SPECS, SCRIPTED_PIN_TABLE_ID: ctx.TM.SCRIPTED_PIN_TABLE_ID, APP_DEFAULT_TABLE_ID: ctx.TM.APP_DEFAULT_TABLE_ID,
          gamesMod: ctx.gameMods[g], equipmentAlias: ctx.EA, glue: eng?.kernel ?? {}, URLSearchParams, location: { search: '' },
          sessionStorage: { getItem: () => null }, localStorage: { getItem: (key) => (key === 'ob-settings-v1' ? blob : null) } });
        vm.runInContext(tCode, tbox);
        r.scene = tbox.__out.resolveBootTableId();
      } catch (e) { r.err = String((e && e.message) || e); }
      results.push(r);
    }
  }
  return { results, anchorFound };
}
async function l80Check(ctx, run, report) {
  const tag = (r) => `${r.cell} ${r.prof}`;
  const axes = ['table_id', 'cloth_id', 'ballset_id', 'cue_id', 'cushion_model_id'];
  for (const r of run.results) {
    const k = tag(r); const eng = ctx.kernels[r.k];
    const pair = `kernel ${r.k}, SDK catalog ${r.c}, games ${r.g}`;
    if (r.err) { report(`L80 ${k}`, `L80 ${k} (${pair}): the sliced settings/scene code ran`, false, r.err); continue; }
    const unknown = axes.filter((a) => !ctx.catalogs[r.c](a, r.spec[a]));
    report(`L80b ${k}`, `L80b ${k} (${pair}): spec ${JSON.stringify(r.spec)} is known to the cell's SDK catalog`, !unknown.length, `unknown: ${unknown.map((a) => `${a} ${r.spec[a]}`).join(', ')}`);
    let rackErr = null; let rackTable = null;
    try { rackTable = eng.nineBallRack(1, r.spec).system.equipment?.table_id; } catch (e) { rackErr = String((e && e.message) || e); }
    report(`L80c ${k}`, `L80c ${k} (${pair}): the cell's kernel racks nine-ball on table ${r.spec.table_id}`, !rackErr && rackTable === r.spec.table_id,
      rackErr ?? `the template's table is ${rackTable}`);
    let geoErr = null;
    try { geoErr = JSON.parse(eng.kernel.table_geometry_json_for(r.scene, R)).error ?? null; } catch (e) { geoErr = String((e && e.message) || e); }
    const sameSpec = !!ctx.TM.TABLE_SPECS[r.scene] && ctx.TM.TABLE_SPECS[r.scene] === ctx.TM.TABLE_SPECS[r.spec.table_id];
    report(`L80d ${k}`, `L80d ${k} (${pair}): scene ${r.scene} builds the spec of ${r.spec.table_id} and the kernel serves its geometry`, sameSpec && !geoErr,
      [sameSpec ? '' : `scene ${r.scene} is a different table from ${r.spec.table_id}`, geoErr ? `kernel rejects '${r.scene}': ${geoErr}` : ''].filter(Boolean).join('; '));
    // sibFresh: the gated app default is DEFAULTS.equipment; fresh: the saved blob heals as under F (a stale games class alone
    // accepts a renamed table through its twin, so only a G_DEGRADE profile is a stale-sibling degrade there)
    const sibFresh = r.k === 'fresh' && r.c === 'fresh';
    const fresh = sibFresh && !(r.g === 'stale' && l80Consts().G_DEGRADE.includes(r.prof));
    if (r.prof !== 'P0') {
      report(`L80i ${k}`, `L80i ${k} (${pair}): the boot write-back ${fresh ? 'persists' : 'keeps the saved blob (no write)'}`, r.wrote === fresh,
        r.wrote ? 'the degraded spec was written over the saved blob' : 'no write-back with every sibling fresh');
    }
    if (r.prof === 'P3') {
      const want = l80Consts().P3_KEEP[r.k === 'fresh' && r.c === 'fresh' ? 'fresh' : 'stale'];
      report(`L80h ${k}`, `L80h ${k} (${pair}): the saved non-default pre-rename table stays ${want}`, r.spec.table_id === want, `got ${r.spec.table_id}`);
    }
    if (r.prof !== 'P0') {
      // a stale cell stores every saved id, and on each axis the partial blob lacks the saved default (an axis the degraded base
      // filled is held, never written as the choice)
      const stored = JSON.parse(r.setJson); const want = fresh ? r.loaded : { ...r.defaults, ...l80Consts().PROFILES[r.prof] };
      const off = axes.filter((a) => stored.equipment[a] !== want[a] || stored.equipmentByGame.nine_ball?.[a] !== want[a]);
      report(`L80k ${k}`, `L80k ${k} (${pair}): one non-equipment set() stores ${fresh ? 'the sanitized spec' : 'every saved id and the saved default on every filled axis'}`, !off.length,
        `held ${JSON.stringify(r.held)}; got ${off.map((a) => `${a} ${stored.equipment[a]} / ${stored.equipmentByGame.nine_ball?.[a]} (want ${want[a]})`).join(', ')}`);
      const picked = JSON.parse(r.pickJson);
      report(`L80l ${k}`, `L80l ${k} (${pair}): a user table pick stores ${r.pick.table_id}`,
        picked.equipment.table_id === r.pick.table_id && picked.equipmentByGame.nine_ball?.table_id === r.pick.table_id,
        `stored ${picked.equipment.table_id} / ${picked.equipmentByGame.nine_ball?.table_id}`);
    }
    if (r.cell === 'F') {
      report(`L80m ${k}`, `L80m ${k} (${pair}): the stored blob is byte-identical to the pre-hold persist() expression`, r.setJson === r.oldJson && !Object.keys(r.held).length,
        `held ${JSON.stringify(r.held)}; ${r.setJson} vs ${r.oldJson}`);
    }
    if (r.prof === 'P4') {
      const stored = JSON.parse(r.setJson);
      const off = ['table_id', 'cloth_id'].filter((a) => r.spec[a] !== r.defaults[a] || r.loaded[a] !== r.defaults[a] || stored.equipment[a] !== r.defaults[a]);
      report(`L80o ${k}`, `L80o ${k} (${pair}): ids no sibling knows heal to the default, persisted at boot`, !off.length && r.wrote,
        `${off.map((a) => `${a} spec ${r.spec[a]} / loaded ${r.loaded[a]} / stored ${stored.equipment[a]} (want ${r.defaults[a]})`).join(', ')}${r.wrote ? '' : '; no boot write-back'}`);
    }
    if (r.cell === 'K' && r.prof === 'P2') {
      const want = l80Consts().P2_TWIN;
      report(`L80n ${k}`, `L80n ${k} (${pair}): the saved neutral table takes its pre-rename twin ${want} in settings and scene`, r.spec.table_id === want && r.scene === want,
        `settings ${r.spec.table_id}, scene ${r.scene}`);
    }
    if (r.prof !== 'P0') continue; // L80e and later judge P0 only (a blob may hold a legacy id by choice)
    const resetWant = sibFresh ? r.defaults : { ...r.defaults, ...r.legacy };
    const resetOff = axes.filter((a) => r.reset[a] !== resetWant[a]);
    const resetStoredOff = axes.filter((a) => r.resetStored.equipment[a] !== r.defaults[a]);
    report(`L80j ${k}`, `L80j ${k} (${pair}): the load() full-reset path hands out the gated app default and holds it (a persist stores DEFAULTS.equipment)`,
      !resetOff.length && !resetStoredOff.length,
      `got ${resetOff.map((a) => `${a} ${r.reset[a]} (want ${resetWant[a]})`).join(', ')}; stored ${resetStoredOff.map((a) => `${a} ${r.resetStored.equipment[a]}`).join(', ')}`);
    const silent = Object.keys(r.legacy).filter((a) => r.spec[a] === r.legacy[a] && r.notes.filter((n) => n.includes(a) && n.includes(r.legacy[a])).length !== 1);
    report(`L80e ${k}`, `L80e ${k} (${pair}): each legacy id in the spec was announced once (${r.notes.length} note(s))`, !silent.length, `unannounced or repeated: ${silent.join(', ')}`);
    if (r.cell === 'F') {
      const off = axes.filter((a) => r.spec[a] !== r.defaults[a]);
      const sceneOff = r.scene !== ctx.TM.APP_DEFAULT_TABLE_ID;
      report(`L80f ${k}`, `L80f ${k} (${pair}): no degrade note, spec is DEFAULTS.equipment and scene is APP_DEFAULT_TABLE_ID`, !r.notes.length && !off.length && !sceneOff,
        [r.notes.length ? `notes: ${r.notes.join(' | ')}` : '', off.length ? `differs from DEFAULTS on ${off.map((a) => `${a} ${r.spec[a]}`).join(', ')}` : '', sceneOff ? `scene ${r.scene}` : ''].filter(Boolean).join('; '));
    } else {
      const want = sibFresh ? r.defaults : r.legacy;
      const off = Object.keys(r.legacy).filter((a) => r.spec[a] !== want[a]);
      report(`L80g ${k}`, `L80g ${k} (${pair}): P0 lands on the ${sibFresh ? 'neutral app-default' : 'pre-rename'} tuple`, !off.length, `got ${off.map((a) => `${a} ${r.spec[a]} (want ${want[a]})`).join(', ')}`);
    }
  }
}
// L80p/q/r (#789): equipmentSupported, the one support predicate, sliced with its helpers and driven per PRED_CELLS cell
// (kernel x SDK catalog x scene handle) over PRED_CASES. The scene handle of a 'fresh' cell carries resolvesTable, sliced from
// web/scene/table.js (resolvableTableId) over the real TABLE_SPECS; a 'stale' cell hands over a handle without it (the
// pre-rename scene); 'none' hands over no handle. Ground truth, independent of the predicate: the cell's SDK catalog (fresh
// catalogEntry or the stale model), the cell's kernel catalog (catalog()), the cell's scene (the real TABLE_SPECS, or the
// STALE_SCENE_KEYS of the pre-rename revision). L80p per case: every axis verdict is null or equals the truth; ok means no
// axis rejects, and an ok id or a returned twin is supported by all three truths (a sound degrade); L80q the ruled twin order
// (PRED_TWINS pins); L80r (FRESH, S3) the default handle (ctx.tableBuild) gives the verdicts the explicit axes.scene gives, and a
// malformed kind or id is refused.
async function l80pRun(ctx, plant = null) {
  const vm = await import('node:vm');
  const code = (sl, names) => names.map((n) => sl.slices[n]?.code ?? '').join('\n');
  let sCode = `const DEFAULTS = Object.freeze({ equipment: ${ctx.settings.slices['DEFAULTS.equipment']?.code ?? '{}'} });\n` + code(ctx.settings, l80Consts().SETTINGS_NAMES)
    + '\nglobalThis.__out = { equipmentSupported, ctx };';
  let tCode = code(ctx.table, l80Consts().TABLE_NAMES) + '\nglobalThis.__out = { resolvableTableId };';
  let anchorFound = true;
  if (plant) {
    const target = plant.file === 'table' ? tCode : sCode;
    anchorFound = target.split(plant.anchor).length === 2;
    const planted = target.replace(plant.anchor, plant.replacement);
    if (plant.file === 'table') tCode = planted; else sCode = planted;
  }
  const results = [];
  for (const [cell, [k, c, sc]] of Object.entries(l80Consts().PRED_CELLS)) {
    const eng = ctx.kernels[k]; const r = { cell, k, c, sc, cases: [], err: null };
    try {
      // the fresh SDK namespace carries the barrel's validateEquipmentIds and DEFAULT_EQUIPMENT (the digest-row verdict); the
      // stale model has neither (a pre-v20 SDK lists the retired ids in plain text)
      const sdkNs = c === 'fresh' ? { EQUIPMENT_AXES: ctx.SDKI.EQUIPMENT_AXES, validateEquipmentIds: ctx.SDKI.validateEquipmentIds, DEFAULT_EQUIPMENT: ctx.SDKI.DEFAULT_EQUIPMENT }
        : { EQUIPMENT_AXES: ctx.SDKI.EQUIPMENT_AXES };
      const sbox = vm.createContext({ catalogEntry: ctx.catalogs[c], catalogEntries: ctx.catalogLists[c], getGameEntry: ctx.gameMods.fresh.getGameEntry,
        sdk: sdkNs, poolWasm: eng?.kernel ?? {}, equipmentAlias: ctx.EA, console: { warn: () => {} }, localStorage: { getItem: () => null } });
      vm.runInContext(sCode, sbox);
      const tbox = vm.createContext({ TABLE_SPECS: ctx.TM.TABLE_SPECS, SCRIPTED_PIN_TABLE_ID: ctx.TM.SCRIPTED_PIN_TABLE_ID, APP_DEFAULT_TABLE_ID: ctx.TM.APP_DEFAULT_TABLE_ID,
        gamesMod: ctx.gameMods.fresh, equipmentAlias: ctx.EA, glue: eng?.kernel ?? {}, URLSearchParams, location: { search: '' },
        sessionStorage: { getItem: () => null }, localStorage: { getItem: () => null } });
      vm.runInContext(tCode, tbox);
      const S = sbox.__out;
      const handle = sc === 'fresh' ? { status: () => ({}), resolvesTable: tbox.__out.resolvableTableId } : sc === 'stale' ? { status: () => ({}) } : null;
      const cases = l80Consts().PRED_CASES.map(([kind, key]) => [kind, key === '@retired' ? ctx.retired[`${kind}_id`] : key, key]);
      for (const [kind, id, key] of cases) r.cases.push({ kind, id, key, got: S.equipmentSupported(id, kind, { scene: handle }) });
      S.ctx.tableBuild = handle;
      r.viaCtx = cases.map(([kind, id]) => S.equipmentSupported(id, kind));
      r.badKind = S.equipmentSupported('pool_pro_9ft', 'felt', { scene: handle });
      r.badId = S.equipmentSupported(undefined, 'table', { scene: handle });
    } catch (e) { r.err = String((e && e.message) || e); }
    results.push(r);
  }
  return { results, anchorFound };
}
function l80pCheck(ctx, run, reportRaw) {
  const C = l80Consts();
  const report = (key, name, ok, detail = '') => reportRaw(l80Scrub(ctx, key), l80Scrub(ctx, name), ok, l80Scrub(ctx, detail));
  const sdkValidates = (axis, id) => { try { ctx.SDKI.validateEquipmentIds({ ...ctx.SDKI.DEFAULT_EQUIPMENT, [axis]: id }); return true; } catch { return false; } };
  for (const r of run.results) {
    const pair = `kernel ${r.k}, SDK catalog ${r.c}, scene ${r.sc}`;
    if (r.err) { report(`L80p ${r.cell}`, `L80p ${r.cell} (${pair}): the sliced predicate ran`, false, r.err); continue; }
    const eng = ctx.kernels[r.k];
    const kcat = eng ? eng.catalog() : {};
    // the kernel's own digest rows (a kernel without the export has none): a row counts when the kernel lists its target
    const krows = typeof eng?.kernel?.catalog_alias_digests_json === 'function' ? JSON.parse(eng.kernel.catalog_alias_digests_json()) : [];
    const truth = (kind, id) => {
      const axis = { table: 'table_id', cloth: 'cloth_id', ballset: 'ballset_id', cushion: 'cushion_model_id', cue: 'cue_id' }[kind];
      const klist = kcat[ctx.SDK.EQUIPMENT_AXES[axis]] ?? [];
      const krow = ctx.EA.aliasDigestTarget(krows, axis, id);
      // the pre-rename scene builds its STALE_SCENE_KEYS and the retired table (L80-0 stale scene checks both against the extract)
      const sceneHas = kind !== 'table' ? null : r.sc === 'stale' ? C.STALE_SCENE_KEYS.includes(id) || id === ctx.retired.table_id
        : Object.hasOwn(ctx.TM.TABLE_SPECS, ctx.EA.canonicalEquipmentId('table_id', id));
      return { sdkCatalog: !!ctx.catalogs[r.c](axis, id) || (r.c === 'fresh' && sdkValidates(axis, id)),
        kernelIds: klist.some((e) => e.id === id) || (typeof krow === 'string' && klist.some((e) => e.id === krow)), sceneSpecs: sceneHas };
    };
    const supported = (t) => t.sdkCatalog && t.kernelIds && t.sceneSpecs !== false;
    for (const { kind, id, key, got } of r.cases) {
      const k = `${r.cell} ${kind}:${key}`;
      const t = truth(kind, id);
      const bad = [];
      for (const ax of ['sdkCatalog', 'kernelIds', 'sceneSpecs']) {
        const v = got.verdict?.[ax];
        // the scene axis has no verdict off the table kind or without a handle; elsewhere a null verdict may not hide a rejection
        // the probe could see (a stale scene judges only the renamed ids and the digest-row pairs, the one class it can know)
        const mustKnow = ax !== 'sceneSpecs' ? true : kind === 'table' && (r.sc === 'fresh'
          || (r.sc === 'stale' && (Object.hasOwn(ctx.EA.TABLE_RENAMES, id) || Object.values(ctx.EA.TABLE_RENAMES).includes(id)
            || id === ctx.retired.table_id || ctx.EA.ALIAS_DIGESTS.some((d) => d.axis === 'table' && d.neutral_id === id))));
        if (mustKnow ? v !== t[ax] : (v !== null && v !== t[ax])) bad.push(`${ax} ${v} (truth ${t[ax]})`);
      }
      const okWant = ['sdkCatalog', 'kernelIds', 'sceneSpecs'].every((ax) => got.verdict?.[ax] !== false);
      if (got.ok !== okWant) bad.push(`ok ${got.ok} with verdict ${JSON.stringify(got.verdict)}`);
      if (got.ok && got.twin !== id) bad.push(`ok but twin ${got.twin}`);
      if (got.ok && !supported(t)) bad.push(`ok but the cell does not support ${id}: ${JSON.stringify(t)}`);
      if (!got.ok && got.twin !== null && !supported(truth(kind, got.twin))) bad.push(`twin ${got.twin} is not supported by the cell: ${JSON.stringify(truth(kind, got.twin))}`);
      if (!got.ok && typeof got.reason !== 'string') bad.push('a refused or degraded id carries no reason');
      report(`L80p ${k}`, `L80p ${k} (${pair}): verdict ${JSON.stringify(got.verdict)}, ok ${got.ok}, twin ${got.twin} agree with the cell`, !bad.length, bad.join('; '));
      const pin = C.PRED_TWINS[`${kind}:${key}`]?.[r.cell];
      if (pin !== undefined) {
        const want = pin === 'self' ? id : pin === '@retired' ? ctx.retired[`${kind}_id`] : pin;
        report(`L80q ${k}`, `L80q ${k} (${pair}): the ruled twin order returns ${want}${pin === 'self' ? ' (ok)' : ''}`,
          got.twin === want && got.ok === (pin === 'self'), `got ok ${got.ok}, twin ${got.twin}, reason ${got.reason}`);
      }
    }
    if (r.cell === 'FRESH' || r.cell === 'S3') {
      const k = r.cell;
      const same = r.cases.every((cs, i) => JSON.stringify(cs.got) === JSON.stringify(r.viaCtx[i]));
      const refused = r.badKind.ok === false && r.badKind.twin === null && r.badId.ok === false && r.badId.twin === null;
      report(`L80r ${k}`, `L80r ${k} (${pair}): the held handle (ctx.tableBuild) judges as axes.scene does; a malformed kind or id is refused`, same && refused,
        `${same ? '' : 'ctx.tableBuild verdicts differ; '}${refused ? '' : `felt ${JSON.stringify(r.badKind)}, undefined ${JSON.stringify(r.badId)}`}`);
    }
  }
}
// L80s/t/u/v (#789, loaders): the three loaders routed through equipmentSupported (appDefaultEquipment, sanitizeSpec with
// migratedEquipmentId, defaultEquipmentFor), sliced as in L80p and driven per discipline (nine_ball, snooker, carom_3cushion,
// heyball) across the census columns (l80sConsts().CELLS: kernel x SDK catalog x scene handle; the games module fresh). Profiles: D0
// no blob (the first-visit pairing defaultEquipmentFor hands out, then loadEquipment on an empty blob), D4 a blob of saved
// pre-rename ids, D1 a blob of ids only the fresh siblings know, DB (nine_ball) sanitizeSpec over the UNGATED
// DEFAULTS.equipment base with ids no sibling knows (the base must itself pass the predicate). Ground truth as in L80p (the
// cell's SDK catalog, kernel catalog and scene keys) plus a rename family built from the data alone (TABLE_RENAMES, every
// superseded_by of the cell's SDK catalog and kernel, the GH-490 joy_q8_9ft literal). L80s every axis of the loaded
// spec (and of the D0 pairing) is supported by the cell and the table is in the discipline's class; L80t each axis is in the
// family of the saved id, else of the discipline's pairing, else of the app default, else of the pre-rename default: the first
// of those the cell supports (a twin, never a fall to the default while a twin exists; the family is what the cell's own SDK
// catalog and kernel can pair); L80u D0: FRESH hands out the exact pairing with no note and no hold,
// a stale column holds every degraded axis as { saved: the pairing id, shown: the twin } with a console note naming both;
// blob profiles: persist() (savedEquipmentBlob) writes the saved id back on every axis the stale column changed from what
// FRESH loads; L80v the cell's kernel racks the discipline's kind on the loaded spec.
function l80sConsts() {
  return {
    CELLS: { FRESH: ['fresh', 'fresh', 'fresh'], S1: ['fresh', 'stale', 'fresh'], S2: ['stale', 'fresh', 'fresh'], S3: ['fresh', 'fresh', 'stale'],
      S1S2: ['stale', 'stale', 'fresh'], S1S2S3: ['stale', 'stale', 'stale'] },
    RACK: { nine_ball: 'nine', snooker: 'snooker', carom_3cushion: 'carom', heyball: 'fifteen' },
    // the FRESH first-visit pairing per discipline (nine_ball: DEFAULTS.equipment); a stale SDK catalog carries no
    // DISCIPLINE_DEFAULT_CUE_IDS map, so its cue is the app default's there
    PAIRING: {
      snooker: { table_id: 'wpbsa_snooker_12ft', cloth_id: 'snooker_napped', ballset_id: 'snooker', cue_id: 'snooker_ash', cushion_model_id: 'mathavan_fitted' },
      carom_3cushion: { table_id: 'umb_carom_284', cloth_id: 'carom_worsted_heated', ballset_id: 'carom', cue_id: 'carom_conical', cushion_model_id: 'han2005_default' },
      heyball: { table_id: 'chinese8_pro_9ft', cloth_id: 'snooker_napped', ballset_id: 'pool_standard', cue_id: 'standard', cushion_model_id: 'han2005_default' },
    },
    PROFILES: {
      D0: {},
      D4: {
        nine_ball: { table_id: 'rasson_ox_9ft', cloth_id: 'simonis_760_fast', ballset_id: 'aramith_pool_worn', cue_id: 'predator_z2' },
        snooker: { table_id: 'wpbsa_snooker_12ft', cloth_id: 'snooker_napped', ballset_id: 'snooker', cue_id: 'predator_314' },
        carom_3cushion: { table_id: 'umb_carom_284', cloth_id: 'carom_worsted_heated', ballset_id: 'carom', cue_id: 'meucci_reddot' },
        heyball: { table_id: 'joy_q8_9ft', cloth_id: 'snooker_napped', ballset_id: 'aramith_pool', cue_id: 'standard' },
      },
      D1: {
        nine_ball: { table_id: 'pool_pro_9ft_k55', cloth_id: 'pool_worsted_fast', ballset_id: 'pool_used' },
        heyball: { ballset_id: 'pool_used' },
      },
      DB: { nine_ball: { table_id: 'no_such_table_9ft', cloth_id: 'no_such_cloth', ballset_id: 'no_such_ballset' } },
    },
    PLANT_COUNT: 8,
  };
}
async function l80sRun(ctx, plant = null) {
  const vm = await import('node:vm');
  const code = (sl, names) => names.map((n) => sl.slices[n]?.code ?? '').join('\n');
  let sCode = `const DEFAULTS = Object.freeze({ equipment: ${ctx.settings.slices['DEFAULTS.equipment']?.code ?? '{}'} });\n` + code(ctx.settings, l80Consts().SETTINGS_NAMES)
    + '\nglobalThis.__out = { sanitizeSpec, defaultEquipmentFor, loadEquipment, savedEquipmentBlob, DEFAULTS, LEGACY_DEFAULT_EQUIPMENT, ctx };';
  const tCode = code(ctx.table, l80Consts().TABLE_NAMES) + '\nglobalThis.__out = { resolvableTableId };';
  let anchorFound = true;
  if (plant) { anchorFound = sCode.split(plant.anchor).length === 2; sCode = sCode.replace(plant.anchor, plant.replacement); }
  const C = l80sConsts(); const results = [];
  for (const [cell, [k, c, sc]] of Object.entries(C.CELLS)) {
    for (const game of Object.keys(C.RACK)) {
      for (const [prof, byGame] of Object.entries(C.PROFILES)) {
        const eq = prof === 'D0' ? null : byGame[game];
        if (prof !== 'D0' && !eq) continue;
        const eng = ctx.kernels[k]; const notes = [];
        const r = { cell, game, prof, k, c, sc, eq, notes, err: null };
        try {
          const sdkNs = { EQUIPMENT_AXES: ctx.SDKI.EQUIPMENT_AXES, DISCIPLINE_DEFAULT_CUE_IDS: c === 'fresh' ? ctx.SDKI.DISCIPLINE_DEFAULT_CUE_IDS : undefined };
          const sbox = vm.createContext({ catalogEntry: ctx.catalogs[c], catalogEntries: ctx.catalogLists[c], getGameEntry: ctx.gameMods.fresh.getGameEntry,
            sdk: sdkNs, poolWasm: eng?.kernel ?? {}, equipmentAlias: ctx.EA, console: { warn: (m) => notes.push(String(m)) }, localStorage: { getItem: () => null } });
          vm.runInContext(sCode, sbox);
          const tbox = vm.createContext({ TABLE_SPECS: ctx.TM.TABLE_SPECS, SCRIPTED_PIN_TABLE_ID: ctx.TM.SCRIPTED_PIN_TABLE_ID, APP_DEFAULT_TABLE_ID: ctx.TM.APP_DEFAULT_TABLE_ID,
            gamesMod: ctx.gameMods.fresh, equipmentAlias: ctx.EA, glue: eng?.kernel ?? {}, URLSearchParams, location: { search: '' },
            sessionStorage: { getItem: () => null }, localStorage: { getItem: () => null } });
          vm.runInContext(tCode, tbox);
          const S = sbox.__out;
          S.ctx.tableBuild = sc === 'fresh' ? { status: () => ({}), resolvesTable: tbox.__out.resolvableTableId } : { status: () => ({}) };
          r.defaults = { ...S.DEFAULTS.equipment }; r.legacy = { ...S.LEGACY_DEFAULT_EQUIPMENT };
          if (prof === 'DB') {
            r.loaded = { ...S.sanitizeSpec({ ...eq }, { ...S.DEFAULTS.equipment }, game) };
          } else if (prof === 'D0') {
            const held = {};
            r.pairing = { ...S.defaultEquipmentFor(game, held) };
            r.pairHeld = JSON.parse(JSON.stringify(held));
            const L = S.loadEquipment(undefined, {}, game);
            r.loaded = { ...L.equipment };
            r.stored = JSON.parse(JSON.stringify(S.savedEquipmentBlob(L.equipment, game, L.byGame, L.held)));
          } else {
            const L = S.loadEquipment({ [game]: { ...eq } }, { ...eq }, game);
            r.loaded = { ...L.equipment };
            r.stored = JSON.parse(JSON.stringify(S.savedEquipmentBlob(L.equipment, game, L.byGame, L.held)));
          }
        } catch (e) { r.err = String((e && e.message) || e); }
        results.push(r);
      }
    }
  }
  return { results, anchorFound };
}
function l80sCheck(ctx, run, report) {
  const C = l80Consts(); const SC = l80sConsts();
  const axes = ['table_id', 'cloth_id', 'ballset_id', 'cue_id', 'cushion_model_id'];
  const renames = ctx.EA.TABLE_RENAMES;
  const kcats = { fresh: ctx.kernels.fresh?.catalog() ?? {}, stale: ctx.kernels.stale?.catalog() ?? {} };
  // the rename family a cell can know: TABLE_RENAMES (app-side), the GH-490 literal, and the superseded_by pairs of the cell's
  // own SDK catalog and kernel (a pair neither loaded sibling carries is unknowable there: the chain ends at the legacy default)
  const edgeMemo = new Map();
  const family = (r, id) => {
    const key = `${r.c} ${r.k}`;
    if (!edgeMemo.has(key)) {
      const edges = new Map();
      const link = (a, b) => { if (typeof a !== 'string' || typeof b !== 'string') return; for (const [x, y] of [[a, b], [b, a]]) { if (!edges.has(x)) edges.set(x, new Set()); edges.get(x).add(y); } };
      for (const [o, n] of Object.entries(renames)) link(o, n);
      link('joy_q8_9ft', 'chinese8_pro_9ft');
      for (const a of axes) {
        for (const e of ctx.catalogLists[r.c](a) ?? []) link(e.id, e.superseded_by);
        for (const e of kcats[r.k][ctx.SDK.EQUIPMENT_AXES[a]] ?? []) link(e.id, e.superseded_by);
      }
      edgeMemo.set(key, edges);
    }
    const edges = edgeMemo.get(key);
    const out = new Set([id]); const q = [id]; while (q.length) for (const n of edges.get(q.pop()) ?? []) if (!out.has(n)) { out.add(n); q.push(n); } return out;
  };
  const inClass = (game, id) => {
    const tc = ctx.gameMods.fresh.getGameEntry(game).table_class;
    return tc.kind !== 'catalog' || tc.table_ids.includes(id) || tc.table_ids.includes(renames[id]) || tc.table_ids.some((t) => renames[t] === id);
  };
  const supported = (r, axis, id) => typeof id === 'string' && !!ctx.catalogs[r.c](axis, id)
    && (kcats[r.k][ctx.SDK.EQUIPMENT_AXES[axis]] ?? []).some((e) => e.id === id)
    && (axis !== 'table_id' || ((r.sc === 'stale' ? C.STALE_SCENE_KEYS.includes(id) : Object.hasOwn(ctx.TM.TABLE_SPECS, ctx.EA.canonicalEquipmentId('table_id', id)))
      && inClass(r.game, id)));
  const pairingOf = (r) => {
    const p = { ...(SC.PAIRING[r.game] ?? r.defaults) };
    if (r.c === 'stale' && SC.PAIRING[r.game]) p.cue_id = r.defaults.cue_id;
    return p;
  };
  const freshLoaded = Object.fromEntries(run.results.filter((r) => r.cell === 'FRESH' && !r.err).map((r) => [`${r.game} ${r.prof}`, r.loaded]));
  for (const r of run.results) {
    const k = `${r.cell} ${r.game} ${r.prof}`;
    const pair = `kernel ${r.k}, SDK catalog ${r.c}, scene ${r.sc}`;
    if (r.err) { report(`L80s ${k}`, `L80s ${k} (${pair}): the sliced loaders ran`, false, r.err); continue; }
    const specs = r.pairing ? [['pairing', r.pairing], ['loaded', r.loaded]] : [['loaded', r.loaded]];
    const unsound = specs.flatMap(([n, s]) => axes.filter((a) => !supported(r, a, s[a])).map((a) => `${n} ${a} ${s[a]}`));
    report(`L80s ${k}`, `L80s ${k} (${pair}): every loaded axis is supported by the cell, the table in the ${r.game} class`, !unsound.length, `unsupported: ${unsound.join(', ')}`);
    const pairing = pairingOf(r);
    const off = axes.filter((a) => {
      const want = [r.eq?.[a], pairing[a], r.defaults[a], r.legacy[a]].find((id) => typeof id === 'string' && [...family(r, id)].some((m) => supported(r, a, m)));
      return want !== undefined && !family(r, want).has(r.loaded[a]);
    });
    report(`L80t ${k}`, `L80t ${k} (${pair}): each axis is a twin of the saved id, else of the pairing, else of the default, else of the pre-rename default`, !off.length,
      `off: ${off.map((a) => `${a} ${r.loaded[a]} (saved ${r.eq?.[a]}, pairing ${pairing[a]})`).join(', ')}`);
    if (r.prof === 'D0') {
      const bad = [];
      for (const a of axes) {
        const moved = r.pairing[a] !== pairing[a]; const h = r.pairHeld[a];
        if (r.cell === 'FRESH' && moved) bad.push(`${a} ${r.pairing[a]} (want ${pairing[a]})`);
        if (moved && !(h && h.saved === pairing[a] && h.shown === r.pairing[a])) bad.push(`${a} shows ${r.pairing[a]} with hold ${JSON.stringify(h)}`);
        if (moved && !r.notes.some((n) => n.includes(pairing[a]) && n.includes(r.pairing[a]))) bad.push(`${a} degrade not noted`);
        if (!moved && h) bad.push(`${a} held without a degrade: ${JSON.stringify(h)}`);
      }
      if (r.cell === 'FRESH' && r.notes.length) bad.push(`notes: ${r.notes.join(' | ')}`);
      report(`L80u ${k}`, `L80u ${k} (${pair}): the first-visit pairing ${r.cell === 'FRESH' ? 'is the exact pairing' : 'holds and notes every degraded axis'}`, !bad.length, bad.join('; '));
      // no blob: every axis is a fill of the (possibly degraded) pairing, so persist() writes the cell's saved pairing
      const off = axes.filter((a) => r.stored.equipment[a] !== pairing[a] || r.stored.equipmentByGame[r.game]?.[a] !== pairing[a]);
      report(`L80w ${k}`, `L80w ${k} (${pair}): persist() writes the saved pairing, never a degraded fill`, !off.length,
        `got ${off.map((a) => `${a} ${r.stored.equipment[a]} / ${r.stored.equipmentByGame[r.game]?.[a]} (loaded ${r.loaded[a]}, want ${pairing[a]})`).join(', ')}`);
    } else if (r.stored) {
      // a saved axis the column changed writes its saved id back; an axis the blob lacks, filled by a degraded pairing, writes the
      // saved pairing id (held, never persisted as the choice)
      const fl = freshLoaded[`${r.game} ${r.prof}`] ?? {};
      const bad = axes.filter((a) => {
        const moved = r.cell !== 'FRESH' && r.loaded[a] !== fl[a];
        const want = !moved ? r.loaded[a] : Object.hasOwn(r.eq, a) ? r.eq[a] : pairing[a];
        return r.stored.equipment[a] !== want || r.stored.equipmentByGame[r.game]?.[a] !== want;
      });
      report(`L80u ${k}`, `L80u ${k} (${pair}): persist() writes ${r.cell === 'FRESH' ? 'the loaded spec' : 'the saved id back on every axis the column changed, the saved pairing on every filled one'}`, !bad.length,
        `got ${bad.map((a) => `${a} ${r.stored.equipment[a]} / ${r.stored.equipmentByGame[r.game]?.[a]} (saved ${r.eq[a]}, loaded ${r.loaded[a]}, FRESH ${fl[a]}, pairing ${pairing[a]})`).join(', ')}`);
    }
    let rackErr = null;
    try { ctx.kernels[r.k].rack(SC.RACK[r.game], 1, r.loaded); } catch (e) { rackErr = String((e && e.message) || e); }
    report(`L80v ${k}`, `L80v ${k} (${pair}): the cell's kernel racks ${SC.RACK[r.game]} on the loaded spec`, !rackErr, rackErr ?? '');
  }
}
// L80-0: the inputs themselves (slices found, archived kernel loaded, the two stale models sane).
function l80Guards(ctx, report) {
  for (const s of [ctx.settings, ctx.table]) {
    for (const [n, v] of Object.entries(s.slices)) console.log(`SUPPLY ${n}: ${s.file}:${v.line} sha256=${v.sha}`);
    report(`L80-0 slices ${s.file}`, `L80-0 every named declaration is sliced from ${s.file}`, !s.missing.length, `missing: ${s.missing.join(', ')}`);
  }
  report('L80-0 kernels', `L80-0 the fresh kernel and the archived ${l80Consts().STALE_VERSION} kernel load`, !!ctx.kernels.fresh && !!ctx.kernels.stale, JSON.stringify(ctx.errors));
  report('L80-0 retired', 'L80-0 one retired digest-row id per digest axis is recovered from catalog.rs (the @retired cases)', !!ctx.retired.table_id && !!ctx.retired.cloth_id,
    ctx.errors['retired ids'] ?? 'not recovered');
  {
    // the STALE_SCENE_KEYS literal against the pre-rename revision's own source: each listed key is a TABLE_SPECS key there (a
    // literal member or an alias assignment) and no neutral id (a TABLE_RENAMES value or a digest-row twin) is one
    const C = l80Consts(); const src = ctx.staleScene ?? '';
    const isKey = (id) => src.includes(`\n  ${id}: {\n`) || src.includes(`\nTABLE_SPECS.${id} = `) || (id === ctx.TM.SCRIPTED_PIN_TABLE_ID && src.includes('\n  [SCRIPTED_PIN_TABLE_ID]: {\n'));
    const neutral = [...Object.values(ctx.EA.TABLE_RENAMES), ...ctx.EA.ALIAS_DIGESTS.filter((d) => d.axis === 'table').map((d) => d.neutral_id)];
    const missing = [...C.STALE_SCENE_KEYS, ctx.retired.table_id].filter((id) => !isKey(id)).map((id) => l80Scrub(ctx, id));
    const present = neutral.filter((id) => isKey(id));
    console.log(`L80-0 note: the stale scene is web/${C.STALE_SCENE_FIXTURE}, the extract of ${C.STALE_SCENE_REV}:web/scene/table.js (${src.length} bytes read)`);
    report('L80-0 stale scene', `L80-0 the ${C.STALE_SCENE_REV.slice(0, 8)} scene's TABLE_SPECS holds every STALE_SCENE_KEYS id, the retired table and no neutral id`, !!src && !missing.length && !present.length,
      `${src ? '' : 'source not read; '}missing: ${missing.join(', ')}; neutral present: ${present.join(', ')}`);
  }
  if (!ctx.staleCat) return;
  console.log(`L80-0 note: the stale SDK catalog is a model (the ${l80Consts().STALE_VERSION} kernel's catalog_json), the stale games module a model (fresh classes through the reverse of TABLE_RENAMES, ids the archived kernel lacks left out)`);
  const tables = new Set(ctx.staleCat.tables.map((t) => t.id));
  const cls = ctx.staleGame('nine_ball').table_class.table_ids; const bad = cls.filter((t) => !tables.has(t));
  report('L80-0 stale games', `L80-0 the stale nine_ball class (${cls.join(', ')}) names only ${l80Consts().STALE_VERSION} kernel tables`, !bad.length, `unknown: ${bad.join(', ')}`);
  const legacy = { table_id: 'diamond_proam_9ft', cloth_id: 'simonis_860_tournament', ballset_id: 'aramith_pool' };
  const odd = Object.entries(legacy).filter(([a, id]) => { const e = ctx.catalogs.stale(a, id); return !e || e.superseded_by !== undefined || e.ui_hidden === true; });
  report('L80-0 stale catalog', 'L80-0 the stale catalog model serves the pre-rename ids as live entries', !odd.length, `odd: ${odd.map(([a, id]) => `${a} ${id}`).join(', ')}`);
}
// --selftest-drift: each plant turns one degrade path off in the sliced source (an anchor that is not found exactly once
// makes the plant INVALID). CAUGHT only when the control is green and the failing key set equals the expected set.
async function l80DriftSelftest() {
  const tag = '[L80 selftest-drift]';
  const ctx = await l80Context();
  const collect = async (plant) => { const run = await l80Run(ctx, plant); const rows = []; await l80Check(ctx, run, (key, name, ok, detail = '') => rows.push({ key, ok, line: checkLine(name, ok, detail) })); return { rows, anchorFound: run.anchorFound }; };
  const control = (await collect(null)).rows; const controlFails = control.filter((r) => !r.ok);
  const cells = (list, profs = ['P0', 'P1', 'P2']) => list.flatMap((c) => profs.map((p) => `${c} ${p}`));
  const plants = [
    { name: 'no-catalog-gate', file: 'settings', anchor: 'sdkCatalog: sdkEquipmentKnown(axis, c),', replacement: 'sdkCatalog: null,',
      // the predicate no longer reads the SDK catalog: sanitizeSpec's own catalogEntry check still heals every axis to a twin
      // (the spec is right, L80b/L80g), but the app default goes unannounced (L80e), ungated on the reset path (L80j), and no
      // stale sibling is seen (the degraded blob is written back, L80i); the ungated base holds nothing, so a persist writes
      // the degraded fill of each axis a partial blob lacks (L80k)
      expected: ['L80e C1 P0', 'L80e C2 P0', 'L80i C1 P1', 'L80i C1 P2', 'L80i C1 P3', 'L80i C2 P1', 'L80i C2 P2', 'L80i C2 P3',
        'L80j C1 P0', 'L80j C2 P0', 'L80k C1 P2', 'L80k C1 P3', 'L80k C2 P2', 'L80k C2 P3'] },
    { name: 'no-kernel-gate', file: 'settings', anchor: 'function kernelEquipmentKnown(axis, id) {\n', replacement: 'function kernelEquipmentKnown(axis, id) {\n  return null;\n',
      // KC P2 stays green: the stale-catalog twin keep holds the pre-rename table in settings as the scene does
      expected: [...cells(['K'], ['P0', 'P1', 'P2', 'P3']).map((k) => `L80c ${k}`), 'L80g K P0', 'L80h K P3',
        ...cells(['K'], ['P1', 'P2', 'P3']).map((k) => `L80i ${k}`), 'L80j K P0', 'L80k K P1', 'L80k K P3', 'L80n K P2'] },
    { name: 'no-sanitize-kernel-gate', file: 'settings', anchor: 'const rejected = verdict.kernelIds === false || verdict.sceneSpecs === false;', replacement: 'const rejected = verdict.sceneSpecs === false;',
      expected: [...cells(['K'], ['P0', 'P1', 'P2', 'P3']).map((k) => `L80c ${k}`), 'L80g K P0', 'L80h K P3',
        'L80k K P1', 'L80k K P3', 'L80n K P2'] },
    { name: 'no-scene-walk', file: 'table', anchor: 'function appDefaultTableId() {\n', replacement: 'function appDefaultTableId() {\n  return APP_DEFAULT_TABLE_ID;\n',
      // P1 and P2 no longer reach the walk: the scene keeps (P1) or takes (P2) a pre-rename table the archived kernel knows
      expected: cells(['K', 'KC'], ['P0']).map((k) => `L80d ${k}`) },
    { name: 'no-scene-class-twin', file: 'table', anchor: '\n    || legal.some((t) => renames[t] === APP_DEFAULT_TABLE_ID)', replacement: '',
      // reached only by a table the stale class lacks under every twin (G P5): the class-twin keep accepts the rest first
      expected: ['L80d G P5'] },
    { name: 'overreach', file: 'settings', anchor: '    if (v.ok) continue;\n    staleSiblingSeen = true;', replacement: '    staleSiblingSeen = true;',
      // every supported default axis counts as a degrade: a note (L80f) and a stale sibling, so fresh cells never write back
      // (L80i, L80o), and every default fill is held as its own id (L80m); the id itself is its twin, so the reset path hands
      // out the same tuple
      expected: ['L80f F P0', 'L80i F P1', 'L80i F P2', 'L80i F P3', 'L80i F P4', 'L80i F P5', 'L80i G P1', 'L80i G P2', 'L80i G P3', 'L80i G P4',
        ...['P0', 'P1', 'P2', 'P3', 'P4', 'P5'].map((p) => `L80m F ${p}`), 'L80o F P4', 'L80o G P4'] },
    { name: 'no-pre-rename-keep', file: 'settings', anchor: 'const twin = rejected || (!entry && sdkStale)', replacement: 'const twin = false',
      expected: ['L80h K P3', 'L80d K P3', 'L80d K P2', 'L80d KC P2', 'L80n K P2', 'L80d C1 P2', 'L80d C2 P2'] },
    { name: 'no-scene-pre-rename-keep', file: 'table', anchor: 'if (back && TABLE_SPECS[id] && kernelTableKnown(id) === false', replacement: 'if (false && TABLE_SPECS[id] && kernelTableKnown(id) === false',
      expected: ['L80d K P3', 'L80d KC P3', 'L80d K P2', 'L80d KC P2', 'L80n K P2'] },
    { name: 'no-write-back-guard', file: 'settings', anchor: ' && !staleSiblingSeen) persist();', replacement: ') persist();',
      expected: ['K P1', 'K P2', 'K P3', 'C1 P1', 'C1 P2', 'C1 P3', 'C2 P1', 'C2 P2', 'C2 P3', 'KC P1', 'KC P2', 'KC P3', 'G P5'].map((k) => `L80i ${k}`) },
    { name: 'no-reset-gate', file: 'settings', anchor: 'const equipment = appDefaultEquipment(held);', replacement: 'const equipment = { ...DEFAULTS.equipment };',
      expected: ['K', 'C1', 'C2', 'KC'].map((c) => `L80j ${c} P0`) },
    { name: 'no-persist-restore', file: 'settings', anchor: 'out[axis] = h.saved;', replacement: 'out[axis] = spec[axis];',
      // every hold writes its shown id: the saved ids (L80k P2, G P5), the degraded base's fills (L80k P3) and the reset path's
      // default (L80j)
      expected: [...['K', 'C1', 'C2', 'KC'].flatMap((c) => [`L80j ${c} P0`, `L80k ${c} P2`, `L80k ${c} P3`]), 'L80k G P5'] },
    { name: 'no-clear-on-pick', file: 'settings', anchor: 'if (spec[axis] === h.shown) out[axis]', replacement: 'out[axis]',
      expected: [...['K', 'C1', 'C2', 'KC'].map((c) => `L80l ${c} P2`), 'L80l G P5'] },
    { name: 'no-scene-neutral-twin', file: 'table', anchor: ': Object.keys(renames).find((k) => renames[k] === id);', replacement: ': undefined;',
      expected: ['L80d K P2', 'L80d KC P2', 'L80n K P2'] },
    { name: 'no-neutral-twin', file: 'settings', anchor: 'for (const old of Object.keys(renames)) if (renames[old] === id) add(old);', replacement: '',
      // the loaded catalogs' superseded_by pairs carry the table renames too; the map alone decides only where every sibling is stale
      expected: ['L80d KC P2'] },
    { name: 'no-default-class-twin', file: 'settings', anchor: '\n    || entry.table_class.table_ids.some((t) => renames[t] === DEFAULTS.equipment.table_id)', replacement: '',
      expected: ['L80d G P0', 'L80d G P4', 'L80d G P5', 'L80g G P0', 'L80o G P4'] },
    { name: 'no-class-twin', file: 'settings', anchor: '\n    && !legal.some((t) => renames[t] === v.table_id)', replacement: '',
      expected: ['L80d G P2', 'L80d G P3', 'L80h G P3', 'L80i G P1', 'L80i G P2', 'L80i G P3', 'L80i G P4', 'L80k G P1', 'L80k G P2', 'L80k G P3', 'L80k G P4', 'L80o G P4'] },
    { name: 'no-scene-class-twin-keep', file: 'table', anchor: '\n      && !legal.some((t) => renames[t] === id)', replacement: '',
      expected: ['L80d C2 P2', 'L80d C2 P3', 'L80d G P2', 'L80d G P3'] },
    { name: 'unknown-counts-stale', file: 'settings', anchor: 'const staleReject = rejected && !!entry;', replacement: 'const staleReject = rejected;',
      expected: ['L80i F P4', 'L80i G P4', 'L80k F P4', 'L80k G P4', 'L80m F P4', 'L80o F P4', 'L80o G P4'] },
    { name: 'no-catalog-twin-keep', file: 'settings', anchor: 'const twin = rejected || (!entry && sdkStale)', replacement: 'const twin = rejected',
      expected: ['L80d C1 P2', 'L80d C2 P2'] },
    { name: 'no-class-reverse-twin', file: 'settings', anchor: "\n    && !(Object.hasOwn(renames, v.table_id) && legal.includes(renames[v.table_id]))", replacement: '',
      expected: ['L80d C1 P3', 'L80h C1 P3'] },
    { name: 'no-stale-games-guard', file: 'settings', anchor: 'if (staleGames) staleSiblingSeen = true;', replacement: '',
      expected: ['L80i G P5'] },
    // an axis the degraded base filled is no longer held: a persist writes the degraded fill as the choice
    { name: 'no-base-hold', file: 'settings', anchor: '    } else if (held && baseHeld?.[axis] && v[axis] === baseHeld[axis].shown && raw[axis] !== v[axis]) {\n      held[axis] = { saved: baseHeld[axis].saved, shown: v[axis] };\n', replacement: '',
      expected: ['K', 'C1', 'C2', 'KC'].flatMap((c) => [`L80k ${c} P2`, `L80k ${c} P3`]) },
    // the full-reset path no longer holds its degraded default
    { name: 'no-reset-hold', file: 'settings', anchor: 'const equipment = appDefaultEquipment(held);', replacement: 'const equipment = appDefaultEquipment();',
      expected: ['K', 'C1', 'C2', 'KC'].map((c) => `L80j ${c} P0`) },
  ];
  let caught = 0;
  for (const p of plants) {
    console.log(`${tag} plant ${p.name}: ${p.file} anchor ${JSON.stringify(p.anchor)}; control: ${control.length} checks, ${controlFails.length} failure(s)`);
    const { rows, anchorFound } = await collect(p);
    if (!anchorFound || controlFails.length) {
      for (const r of controlFails) console.log(`${tag} control ${r.line}`);
      console.log(`${tag} ${p.name} INVALID: ${controlFails.length ? 'the control is red' : 'the anchor is not found exactly once in the sliced source'}`);
      continue;
    }
    const fails = rows.filter((r) => !r.ok);
    const got = [...new Set(fails.map((r) => r.key))].sort(); const want = [...new Set(p.expected)].sort();
    if (fails.length && got.length === want.length && got.every((k, i) => k === want[i])) { caught += 1; for (const r of fails) console.log(`${tag} ${p.name} CAUGHT: ${r.line}`); }
    else {
      console.log(`${tag} ${p.name} NOT CAUGHT: failing keys {${got.join(' | ')}}, expected {${want.join(' | ')}}`);
      for (const r of fails) console.log(`${tag} ${p.name} fixture ${r.line}`);
    }
  }
  // the predicate plants (L80p/q/r): each turns one rung of equipmentSupported or its scene probe off
  const pcollect = async (plant) => { const run = await l80pRun(ctx, plant); const rows = []; l80pCheck(ctx, run, (key, name, ok, detail = '') => rows.push({ key, ok, line: checkLine(name, ok, detail) })); return { rows, anchorFound: run.anchorFound }; };
  const pcontrol = (await pcollect(null)).rows; const pcontrolFails = pcontrol.filter((r) => !r.ok);
  const pplants = [
    { name: 'no-scene-probe', file: 'settings', anchor: "if (typeof scene.resolvesTable === 'function') {", replacement: 'if (false) {',
      // a probing handle is judged as a pre-rename scene: the neutral tables it builds read as unbuildable, and the tables the
      // fresh probe judges (snooker, an unknown id) lose their verdict
      expected: [...['FRESH', 'S1', 'S2', 'S1S2'].flatMap((c) => ['no_such_table_9ft', 'pool_pro_9ft', 'pool_pro_9ft_k55', 'pool_pro_9ft_measured',
        'wpbsa_snooker_12ft'].map((t) => `L80p ${c} table:${t}`)), ...['pool_pro_9ft', 'pool_pro_9ft_k55', 'pool_pro_9ft_measured'].map((t) => `L80q FRESH table:${t}`)] },
    { name: 'no-stale-scene-rule', file: 'settings', anchor: 'if (Object.values(renames).includes(id)) return false;\n', replacement: '',
      // a pre-rename scene no longer rejects a renamed neutral id (the digest-row twin keeps its own rule)
      expected: [...['S3', 'S2S3', 'S1S2S3'].flatMap((c) => ['pool_pro_9ft', 'pool_pro_9ft_k55'].map((t) => `L80p ${c} table:${t}`)),
        'L80q S3 table:pool_pro_9ft', 'L80q S3 table:pool_pro_9ft_k55'] },
    { name: 'no-renames-reverse', file: 'settings', anchor: 'for (const old of Object.keys(renames)) if (renames[old] === id) add(old);', replacement: '',
      // the catalogs carry the table pairs too; the rename map alone decides only where both are stale
      expected: ['L80q S1S2S3 table:pool_pro_9ft_k55'] },
    { name: 'no-superseded-reverse', file: 'settings', anchor: 'if (e?.superseded_by === id) add(e.id);', replacement: 'if (false) add(e.id);',
      expected: ['L80q S1 cloth:pool_worsted_fast', 'L80q S2 cloth:pool_worsted_fast', 'L80q S1 ballset:pool_used', 'L80q S2 ballset:pool_used'] },
    { name: 'no-kernel-superseded', file: 'settings', anchor: '[sdkList, kernelCatalogList(axis) ?? []]', replacement: '[sdkList]',
      // the kernel list also carries the stale kernel's plain-text retired ids (the digest reverse under S2)
      expected: ['L80q S1 cloth:pool_worsted_fast', 'L80q S1 ballset:pool_used', 'L80q S2 cloth:pool_worsted_measured', 'L80q S2 table:pool_pro_9ft_measured'] },
    { name: 'no-legacy-default', file: 'settings', anchor: 'add(LEGACY_DEFAULT_EQUIPMENT[axis]);', replacement: '',
      // the last rung: an id with no loaded pair refuses instead of taking the pre-rename default
      // (the digest twin under S2 takes the stale kernel's retired id first; the S3 residual still takes the default)
      expected: ['L80q FRESH table:no_such_table_9ft', 'L80q S1S2 ballset:pool_used', 'L80q S1S2 cloth:pool_worsted_fast',
        'L80q S3 table:no_such_table_9ft', 'L80q S3 table:pool_pro_9ft_measured'] },
    { name: 'ok-ignores-scene', file: 'settings', anchor: '&& v.sceneSpecs !== false;', replacement: ';',
      expected: ['pool_pro_9ft', 'pool_pro_9ft_k55', 'pool_pro_9ft_measured'].flatMap((t) => [`L80p S3 table:${t}`, `L80q S3 table:${t}`]) },
    { name: 'probe-ignores-specs', file: 'table', anchor: "&& Object.hasOwn(TABLE_SPECS, id) ? id : null;", replacement: '? id : null;',
      // the fresh probe then calls any string buildable
      expected: ['FRESH', 'S1', 'S2', 'S1S2'].map((c) => `L80p ${c} table:no_such_table_9ft`) },
    { name: 'no-held-handle', file: 'settings', anchor: ': ctx.tableBuild ?? (typeof window', replacement: ': (typeof window',
      expected: ['L80r FRESH', 'L80r S3'] },
    // the fresh kernel no longer reads its digest rows: it rejects the retired ids (every fresh-kernel cell), so a stale SDK's
    // retired twin of a neutral id is refused too (S1)
    { name: 'no-kernel-digest-rows', file: 'settings', anchor: "if (typeof poolWasm.catalog_alias_digests_json !== 'function') return null;", replacement: 'return null;',
      expected: [...['FRESH', 'S1', 'S3', 'NOSCENE'].flatMap((c) => [`L80p ${c} table:@retired`, `L80p ${c} cloth:@retired`]),
        ...['FRESH', 'S1', 'S3', 'NOSCENE'].map((c) => `L80q ${c} table:@retired`), 'L80q FRESH cloth:@retired', 'L80q S1 cloth:@retired',
        'L80q S1 table:pool_pro_9ft_measured', 'L80q S1 cloth:pool_worsted_measured'] },
    // the fresh SDK no longer accepts a digest-row id: the mirror of the above over the fresh-SDK cells (the twin under S2)
    { name: 'no-sdk-digest-validate', file: 'settings', anchor: 'try { sdk.validateEquipmentIds({ ...sdk.DEFAULT_EQUIPMENT, [axis]: id }); return true; } catch { return false; }', replacement: 'return false;',
      expected: [...['FRESH', 'S2', 'S3', 'S2S3', 'NOSCENE'].flatMap((c) => [`L80p ${c} table:@retired`, `L80p ${c} cloth:@retired`]),
        ...['FRESH', 'S2', 'S3', 'NOSCENE'].map((c) => `L80q ${c} table:@retired`), 'L80q FRESH cloth:@retired', 'L80q S2 cloth:@retired',
        'L80q S2 table:pool_pro_9ft_measured', 'L80q S2 cloth:pool_worsted_measured'] },
    // a pre-rename scene loses its verdict on the retired table it builds
    { name: 'no-stale-scene-digest', file: 'settings', anchor: "  if (equipmentDigestTwin('table_id', id) !== null) return true;\n", replacement: '',
      expected: ['S3', 'S2S3', 'S1S2S3'].map((c) => `L80p ${c} table:@retired`) },
    // a neutral digest twin no longer reaches the retired id a stale sibling lists: the pre-rename default instead
    { name: 'no-digest-reverse', file: 'settings', anchor: "const digestTwin = typeof equipmentAlias.aliasDigestTarget === 'function'", replacement: "const digestTwin = false && typeof equipmentAlias.aliasDigestTarget === 'function'",
      expected: [...['S1', 'S2', 'S1S2S3'].map((c) => `L80q ${c} table:pool_pro_9ft_measured`), ...['S1', 'S2', 'S1S2'].map((c) => `L80q ${c} cloth:pool_worsted_measured`)] },
  ];
  for (const p of pplants) {
    console.log(`${tag} plant ${p.name}: ${p.file} anchor ${JSON.stringify(p.anchor)}; control: ${pcontrol.length} checks, ${pcontrolFails.length} failure(s)`);
    const { rows, anchorFound } = await pcollect(p);
    if (!anchorFound || pcontrolFails.length) {
      for (const r of pcontrolFails) console.log(`${tag} control ${r.line}`);
      console.log(`${tag} ${p.name} INVALID: ${pcontrolFails.length ? 'the control is red' : 'the anchor is not found exactly once in the sliced source'}`);
      continue;
    }
    const fails = rows.filter((r) => !r.ok);
    const got = [...new Set(fails.map((r) => r.key))].sort(); const want = [...new Set(p.expected)].sort();
    if (fails.length && got.length === want.length && got.every((k, i) => k === want[i])) { caught += 1; for (const r of fails) console.log(`${tag} ${p.name} CAUGHT: ${r.line}`); }
    else {
      console.log(`${tag} ${p.name} NOT CAUGHT: failing keys {${got.join(' | ')}}, expected {${want.join(' | ')}}`);
      for (const r of fails) console.log(`${tag} ${p.name} fixture ${r.line}`);
    }
  }
  const total = plants.length + pplants.length;
  console.log(`${tag} ${caught} of ${total} plants caught`);
  return caught === total ? 0 : 1;
}

// --selftest-drift: each plant turns one loader's use of the predicate off in the sliced source (an anchor not found exactly
// once makes the plant INVALID). CAUGHT only when the control is green and the failing key set equals the expected set; the
// plant count is asserted (l80sConsts().PLANT_COUNT).
async function l80sDriftSelftest() {
  const tag = '[L80s selftest-drift]';
  const ctx = await l80Context();
  const collect = async (plant) => { const run = await l80sRun(ctx, plant); const rows = []; l80sCheck(ctx, run, (key, name, ok, detail = '') => rows.push({ key, ok, line: checkLine(name, ok, detail) })); return { rows, anchorFound: run.anchorFound }; };
  const control = (await collect(null)).rows; const controlFails = control.filter((r) => !r.ok);
  const plants = [
    // E1: appDefaultEquipment takes DEFAULTS.equipment ungated
    { name: 'E1-no-predicate', anchor: 'const v = equipmentSupported(spec[axis], kind);', replacement: 'const v = { ok: true };', expected: ['S1', 'S2', 'S3', 'S1S2', 'S1S2S3'].flatMap((c) => [`L80s ${c} nine_ball D0`, `L80w ${c} nine_ball D0`]) },
    // E1: appDefaultEquipment judges without the scene probe
    { name: 'E1-no-scene', anchor: 'const v = equipmentSupported(spec[axis], kind);', replacement: 'const v = equipmentSupported(spec[axis], kind, { scene: null });', expected: ['L80s S3 nine_ball D0', 'L80w S3 nine_ball D0'] },
    // E2: sanitizeSpec keeps only the pre-migration id, never a rename twin of the predicate's order
    { name: 'E2-no-rename-twin', anchor: '[back, ...equipmentTwinCandidates(axis, v[axis], false).slice(1)]', replacement: '[back]', expected: ['L80t S1 heyball D1', 'L80t S2 heyball D1', ...['S1', 'S2', 'S3', 'S1S2', 'S1S2S3'].map((c) => `L80t ${c} nine_ball D1`)] },
    // E2: sanitizeSpec judges a saved id without the scene probe
    { name: 'E2-no-scene', anchor: 'const verdict = equipmentSupported(v[axis], kind).verdict;', replacement: 'const verdict = equipmentSupported(v[axis], kind, { scene: null }).verdict;', expected: ['D0', 'D1', 'D4'].map((p) => `L80s S3 nine_ball ${p}`) },
    // E2: the base fallback taken as given (it need not pass the predicate): only the ungated base of DB reaches it
    { name: 'E2-base-ungated', anchor: 'v[axis] = b.ok || b.twin === null ? base[axis] : b.twin;', replacement: 'v[axis] = base[axis];', expected: [...['S1', 'S2', 'S3', 'S1S2', 'S1S2S3'].map((c) => `L80s ${c} nine_ball DB`), 'L80t S1S2 nine_ball DB', 'L80t S1S2S3 nine_ball DB',
        'L80v S2 nine_ball DB', 'L80v S1S2 nine_ball DB', 'L80v S1S2S3 nine_ball DB'] },
    // E2: migratedEquipmentId no longer follows a ui_hidden entry's superseded_by twin: wherever the SDK catalog is fresh a
    // saved retired cue (and the pool cloth and ballset) falls to the pairing instead of its twin
    { name: 'E2-no-migration', anchor: "if (old?.ui_hidden === true && typeof old.superseded_by === 'string') {", replacement: 'if (false) {', expected: [...['FRESH', 'S2', 'S3'].flatMap((c) => ['nine_ball', 'snooker', 'carom_3cushion'].map((g) => `L80t ${c} ${g} D4`)), 'L80u S2 nine_ball D4', 'L80u S3 nine_ball D4'] },
    // E3: the heyball ballset pairing (entry.ballset_ids[0]) taken ungated; snooker and carom keep their supported ballset but
    // no longer clear the app default's ballset hold (take() owns that), so a stale column holds a ballset they never show
    { name: 'E3-heyball-ballset', anchor: "if (ballset) take('ballset_id', derive('ballset', ballset));", replacement: 'if (ballset) spec.ballset_id = ballset;', expected: [...['S1', 'S2', 'S1S2', 'S1S2S3'].map((c) => `L80s ${c} heyball D0`),
        ...['S1', 'S2', 'S1S2', 'S1S2S3'].flatMap((c) => ['heyball', 'snooker', 'carom_3cushion'].map((g) => `L80u ${c} ${g} D0`))] },
    // E1/E2: a fill of the degraded pairing is no longer held: persist() writes the degraded fill as the choice
    { name: 'E1-no-base-hold', anchor: '    } else if (held && baseHeld?.[axis] && v[axis] === baseHeld[axis].shown && raw[axis] !== v[axis]) {\n      held[axis] = { saved: baseHeld[axis].saved, shown: v[axis] };\n', replacement: '',
      expected: [...['S1', 'S2', 'S1S2', 'S1S2S3'].flatMap((c) => [`L80w ${c} heyball D0`, `L80w ${c} nine_ball D0`]), 'L80w S3 nine_ball D0'] },
  ];
  let caught = 0;
  for (const p of plants) {
    console.log(`${tag} plant ${p.name}: anchor ${JSON.stringify(p.anchor)}; control: ${control.length} checks, ${controlFails.length} failure(s)`);
    const { rows, anchorFound } = await collect(p);
    if (!anchorFound || controlFails.length) {
      for (const r of controlFails) console.log(`${tag} control ${r.line}`);
      console.log(`${tag} ${p.name} INVALID: ${controlFails.length ? 'the control is red' : 'the anchor is not found exactly once in the sliced source'}`);
      continue;
    }
    const fails = rows.filter((r) => !r.ok);
    const got = [...new Set(fails.map((r) => r.key))].sort(); const want = [...new Set(p.expected)].sort();
    if (fails.length && got.length === want.length && got.every((k, i) => k === want[i])) { caught += 1; for (const r of fails) console.log(`${tag} ${p.name} CAUGHT: ${r.line}`); }
    else {
      console.log(`${tag} ${p.name} NOT CAUGHT: failing keys {${got.join(' | ')}}, expected {${want.join(' | ')}}`);
      for (const r of fails) console.log(`${tag} ${p.name} fixture ${r.line}`);
    }
  }
  const counted = plants.length === l80sConsts().PLANT_COUNT;
  console.log(`${tag} ${caught} of ${plants.length} plants caught; ${plants.length} plant(s) declared, ${l80sConsts().PLANT_COUNT} required${counted ? '' : ' (COUNT MISMATCH)'}`);
  return caught === plants.length && counted ? 0 : 1;
}

// L81 (#789, set choke): the whole web/app/settings.js module (every top-level declaration; the imports dropped, `export`
// stripped, buildPanel's DOM body stubbed) runs in a node:vm context whose imported bindings are stubs over the real SDK
// catalog, the real kernels, the real games module and equipmentalias.js, per mixed-cache cell (kernel x SDK catalog x scene;
// the census columns). A session then drives createSettings' own api: changeEquipment (E11), its cue fast path (E12),
// preview.stage (E13), preview.keep (E14), changeGame (E15) and set. The scene handle is a model of web/scene/table.js
// prepareEquipment: a fresh scene canonicalises the id, a pre-rename (7352fa8e) scene takes it as given, a TABLE_SPECS miss
// builds SCRIPTED_PIN_TABLE_ID, and status() carries requested_table and request_id; a fresh handle carries the sliced
// resolvableTableId probe, a pre-rename one none, and a 'lying' handle (pre-rename TABLE_SPECS, a probe that accepts every id)
// exists only to reach the post-prepare read-back. The game's rerack refuses an id the cell's kernel does not list, as the
// kernel does. --selftest-drift plants turn the gate off at one call site each (l81DriftSelftest).
function l81Consts() {
  return {
    // [kernel, SDK catalog, scene]; 'cueless' = the fresh SDK catalog before the cue rename (no pro_ld_pivot_* entries, the
    // branded cues live), a model; as the kernel, the fresh kernel whose catalog lists no pro_ld_pivot_* cue (a model)
    CELLS: { FRESH: ['fresh', 'fresh', 'fresh'], S1: ['fresh', 'stale', 'fresh'], S2: ['stale', 'fresh', 'fresh'], S3: ['fresh', 'fresh', 'stale'],
      CUE: ['fresh', 'cueless', 'fresh'], KCUE: ['cueless', 'fresh', 'fresh'], KCUSH: ['cushion', 'fresh', 'fresh'] },
    // fresh-only ids saved (a stale sibling degrades and holds each of them)
    B1: { game: 'nine_ball', equipment: { table_id: 'pool_pro_8ft', cloth_id: 'pool_worsted_fast', ballset_id: 'pool_used' } },
    // the S4 column: saved pre-rename ids, a pre-rename pairing for eight_ball too
    B4: { game: 'nine_ball', equipment: { table_id: 'diamond_proam_8ft', cloth_id: 'simonis_760_fast', ballset_id: 'aramith_pool_worn', cue_id: 'predator_z2' },
      equipmentByGame: { eight_ball: { table_id: 'diamond_proam_7ft' } } },
    // every binding settings.js imports, each stubbed by l81Boot
    STUBS: ['catalogEntries', 'catalogEntry', 'sdk', 'equipmentAlias', 'kernel_version', 'poolWasm', 'DEFAULT_GAME', 'GAME_CATALOG', 'getGameEntry',
      'LOCALES', 'LOCALE_NAMES', 'applyDom', 'getLocale', 'has', 'onLocaleChange', 'setLocale', 't', 'i18nNs', 'bootCopy'],
    PLANT_COUNT: 14,
  };
}
// settings.js as one script: { code, imports (local names), odd (top-level statements neither imported nor declared), panel }.
async function l81Module(src) {
  const { parse } = await import('../../tools/render/lib/vendor/acorn/acorn.mjs');
  const ast = parse(src, { ecmaVersion: 'latest', sourceType: 'module' });
  const parts = []; const imports = []; const odd = []; let panel = false;
  for (const top of ast.body) {
    if (top.type === 'ImportDeclaration') { for (const s of top.specifiers) imports.push(s.local.name); continue; }
    const d = top.type === 'ExportNamedDeclaration' ? top.declaration : top.type === 'ExportDefaultDeclaration' ? null : top;
    if (!d || !/Declaration$/.test(d.type)) { odd.push(src.slice(top.start, Math.min(top.end, top.start + 60))); continue; }
    if (d.type === 'FunctionDeclaration' && d.id.name === 'buildPanel') { parts.push('function buildPanel() {}'); panel = true; continue; }
    parts.push(src.slice(d.start, d.end));
  }
  return { code: parts.join('\n') + '\nglobalThis.__out = { createSettings, ctx, KEY };', imports, odd, panel };
}
// The fresh kernel with every pro_ld_pivot_* cue dropped from its catalog (the synthetic stale cue column).
function l81CuelessKernel(eng, key) {
  const drop = (cat) => ({ ...cat, [key]: (cat[key] ?? []).filter((e) => !e.id.startsWith('pro_ld_pivot_')) });
  return { version: () => eng.version(), catalog: () => drop(eng.catalog()),
    kernel: { ...eng.kernel, catalog_json: (...a) => JSON.stringify(drop(JSON.parse(eng.kernel.catalog_json(...a)))) } };
}
// The fresh kernel whose cushion list drops grip_fitted and lists stronge_realistic as its superseded entry (a model: a saved
// grip_fitted degrades to stronge_realistic and is held, the recommended cushion of the pool_pro tables).
function l81CushionKernel(eng, key) {
  const swap = (cat) => ({ ...cat, [key]: (cat[key] ?? []).filter((e) => e.id !== 'grip_fitted')
    .map((e) => (e.id === 'stronge_realistic' ? { ...e, superseded_by: 'grip_fitted' } : e)) });
  return { version: () => eng.version(), catalog: () => swap(eng.catalog()),
    kernel: { ...eng.kernel, catalog_json: (...a) => JSON.stringify(swap(JSON.parse(eng.kernel.catalog_json(...a)))) } };
}
// One boot of createSettings in a fresh vm context. cfg: { k, c, scene: 'fresh' | 'stale' | 'lying' | 'none', blob, lateGlue,
// shotIndex, rerackThrows, noHeyball, g: 'fresh' | 'stale' }. g: the games module (default fresh; stale = the pre-v20 classes
// model, l80Context staleGame, its GAME_CATALOG the fresh one). lateGlue: the kernel glue throws until B.glue.ready is set (catalog_json before the wasm
// instance exists). rerackThrows: every rerack refuses with that message (L82s). noHeyball: the rules capability carries no
// heyballChain (a stale cached flow.js, L83 E16). Window events are recorded in B.events.
async function l81Boot(ctx, mod, cfg) {
  const vm = await import('node:vm');
  const eng = cfg.k === 'cueless' ? l81CuelessKernel(ctx.kernels.fresh, ctx.SDKI.EQUIPMENT_AXES.cue_id)
    : cfg.k === 'cushion' ? l81CushionKernel(ctx.kernels.fresh, ctx.SDKI.EQUIPMENT_AXES.cushion_model_id) : ctx.kernels[cfg.k];
  const notes = [];
  const store = new Map();
  if (cfg.blob) store.set('ob-settings-v1', JSON.stringify(cfg.blob));
  const glue = { ready: !cfg.lateGlue };
  const kcat = eng.catalog();
  const canon = (axis, id) => ctx.EA.canonicalEquipmentId(axis, id);
  // the pre-cue-rename catalog model
  const cueless = ctx.catalogLists.fresh('cue_id').filter((e) => !e.id.startsWith('pro_ld_pivot_')).map((e) => {
    if (e.superseded_by === undefined) return e;
    const { superseded_by: _s, ui_hidden: _h, ...rest } = e; return rest;
  });
  const catalogs = { ...ctx.catalogs, cueless: (axis, id) => (axis === 'cue_id' ? cueless.find((e) => e.id === id) : ctx.catalogs.fresh(axis, id)) };
  const lists = { ...ctx.catalogLists, cueless: (axis) => (axis === 'cue_id' ? cueless : ctx.catalogLists.fresh(axis)) };
  const game = { shotIndex: cfg.shotIndex ?? 0, seed: 7, template: null, spec: null, reracks: 0, swaps: 0, games: [], errs: [],
    setEquipment(spec) { this.spec = { ...spec }; },
    setGame(id) { this.games.push(id); return Promise.resolve(true); },
    rerack() {
      this.reracks += 1;
      if (cfg.rerackThrows) { this.errs.push(cfg.rerackThrows); throw new Error(cfg.rerackThrows); }
      const bad = Object.entries(this.spec ?? {}).filter(([axis, id]) => {
        const list = kcat[ctx.SDK.EQUIPMENT_AXES[axis]] ?? [];
        return typeof id === 'string' && !list.some((e) => e.id === id || e.id === canon(axis, id));
      });
      if (bad.length) {
        const e = `unknown equipment ${bad.map(([a, id]) => `${a} ${id}`).join(', ')}`;
        this.errs.push(e); throw new Error(e);
      }
    },
    swapCue() { this.swaps += 1; return null; },
    syncShadows() {},
  };
  const games = { GAME_CATALOG: ctx.gameMods.fresh.GAME_CATALOG, ...ctx.gameMods[cfg.g ?? 'fresh'] };
  const tbox = vm.createContext({ TABLE_SPECS: ctx.TM.TABLE_SPECS, SCRIPTED_PIN_TABLE_ID: ctx.TM.SCRIPTED_PIN_TABLE_ID, APP_DEFAULT_TABLE_ID: ctx.TM.APP_DEFAULT_TABLE_ID,
    gamesMod: games, equipmentAlias: ctx.EA, glue: eng.kernel, URLSearchParams, location: { search: '' },
    sessionStorage: { getItem: () => null }, localStorage: { getItem: () => null } });
  vm.runInContext(l80Consts().TABLE_NAMES.map((n) => ctx.table.slices[n]?.code ?? '').join('\n') + '\nglobalThis.__out = { resolvableTableId };', tbox);
  const scene = { built: [], req: 0 };
  const staleKeys = new Set(l80Consts().STALE_SCENE_KEYS);
  const mkHandle = (kind) => {
    if (kind === 'none') return null;
    let readiness = { status: 'READY', requested_table: ctx.TM.APP_DEFAULT_TABLE_ID, retained_table: null };
    const h = {
      status: () => ({ ...readiness, request_id: scene.req }),
      prepareEquipment(value) {
        const id = kind === 'fresh' ? canon('table_id', value?.table_id) : value?.table_id;
        const next = (kind === 'fresh' ? !!ctx.TM.TABLE_SPECS[id] : staleKeys.has(id)) ? id : ctx.TM.SCRIPTED_PIN_TABLE_ID;
        scene.req += 1; scene.built.push(next);
        readiness = { status: 'READY', requested_table: next, retained_table: next };
        return true;
      },
      cancelPreparation() { scene.req += 1; },
    };
    if (kind === 'fresh') h.resolvesTable = tbox.__out.resolvableTableId;
    if (kind === 'lying') h.resolvesTable = (id) => id;
    return h;
  };
  const poolWasm = { catalog_json: (...a) => { if (!glue.ready) throw new Error('the kernel glue is not initialised'); return eng.kernel.catalog_json(...a); } };
  const sdk = { EQUIPMENT_AXES: ctx.SDKI.EQUIPMENT_AXES, DISCIPLINE_DEFAULT_CUE_IDS: cfg.c === 'fresh' ? ctx.SDKI.DISCIPLINE_DEFAULT_CUE_IDS : undefined,
    DEFAULT_EQUIPMENT: cfg.c === 'fresh' ? ctx.SDKI.DEFAULT_EQUIPMENT : undefined };
  const stubs = { catalogEntries: lists[cfg.c], catalogEntry: catalogs[cfg.c], sdk, equipmentAlias: ctx.EA, kernel_version: () => eng.version(), poolWasm,
    DEFAULT_GAME: games.DEFAULT_GAME, GAME_CATALOG: games.GAME_CATALOG, getGameEntry: games.getGameEntry,
    LOCALES: ['en'], LOCALE_NAMES: { en: 'English' }, applyDom() {}, getLocale: () => 'en', has: () => false, onLocaleChange() {}, setLocale() {},
    t: (k) => k, i18nNs: {}, bootCopy: { t: (k) => k } };
  const events = [];
  const window = { dispatchEvent: (e) => { events.push(e); return true; }, addEventListener() {}, removeEventListener() {}, confirm: () => true };
  const sbox = vm.createContext({ ...stubs, window,
    CustomEvent: class { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } },
    document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
    localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => { store.set(k, String(v)); }, removeItem: (k) => { store.delete(k); } },
    console: { warn: (...a) => notes.push(a.map(String).join(' ')), error: (...a) => notes.push(`error: ${a.map(String).join(' ')}`), info() {}, log() {} },
    setTimeout: () => 0, clearTimeout() {}, queueMicrotask: (fn) => { Promise.resolve().then(fn); },
    location: { search: '', href: 'http://localhost/', origin: 'http://localhost', pathname: '/' }, URLSearchParams, URL });
  vm.runInContext(mod.code, sbox);
  const out = sbox.__out;
  Object.assign(out.ctx, { game, tableBuild: mkHandle(cfg.scene), shareCueSwapGuard: true, rulesCapabilities: cfg.noHeyball ? {} : { heyballChain() {} }, replayActive: () => false });
  const api = out.createSettings({ machine: null });
  await new Promise((r) => setImmediate(r));
  return { api, notes, store, game, scene, glue, stubs, events,
    setScene: (kind) => { out.ctx.tableBuild = mkHandle(kind); },
    stored: () => JSON.parse(store.get(out.KEY) ?? 'null'),
    shown: () => api.get().equipment, cueSwap: () => out.ctx.cueSwap };
}
// The sessions: [key, title, cell, extra cfg, body]; a body returns '' when every claim holds, else what failed.
function l81Scenarios(ctx) {
  const C = l81Consts();
  const fails = (...claims) => claims.filter(([ok]) => !ok).map(([, m]) => m).join('; ');
  const refusedNote = (B, what) => B.notes.some((n) => n.startsWith(`[settings] refused ${what}`));
  const noteText = (B) => JSON.stringify(B.notes);
  const blobOf = (B) => B.store.get('ob-settings-v1') ?? null;
  // a user pick the loaded siblings cannot play: refused, nothing prepared, persisted, reracked or shown
  const refusedPick = async (B, act, what, gone) => {
    const built0 = B.scene.built.length; const blob0 = blobOf(B); const shown0 = JSON.stringify(B.shown());
    const r = await act();
    return fails([r === false, `resolved ${JSON.stringify(r)}`], [B.scene.built.length === built0, `prepared ${B.scene.built.slice(built0).join(', ')}`],
      [blobOf(B) === blob0, `persisted ${blobOf(B)}`], [B.game.reracks === 0, `${B.game.reracks} rerack(s)`], [JSON.stringify(B.shown()) === shown0, `shows ${JSON.stringify(B.shown())}`],
      [!gone || B.api.preview.active() === null, `a transaction is live: ${JSON.stringify(B.api.preview.active())}`], [refusedNote(B, what), `no refusal note: ${noteText(B)}`]);
  };
  const cloth2 = async (B, first, second, via) => {
    if (via === 'keep') {
      const a = B.api.preview.stage('cloth_id', first); const ka = await B.api.preview.keep({ skipConfirm: true });
      const b = B.api.preview.stage('cloth_id', second); const kb = await B.api.preview.keep({ skipConfirm: true });
      return [a === true && ka?.committed === true && b === true && kb?.committed === true, `stage/keep ${a}/${JSON.stringify(ka)}, ${b}/${JSON.stringify(kb)}`];
    }
    const a = await B.api.changeEquipment('cloth_id', first, { skipConfirm: true });
    const b = await B.api.changeEquipment('cloth_id', second, { skipConfirm: true });
    return [a === true && b === true, `picks resolved ${a}, ${b}`];
  };
  // L81 P2: the cloth the boot degraded to (its superseded_by twin, E2) is picked away and back; the explicit commit ends the hold
  // of the axis it selected only: the cloth stores the re-pick, the unselected degraded table and ballset stay held (stored as
  // the saved B1 ids while their twins show), and a later non-equipment persist (a sound toggle) still writes the saved ids
  const release = async (B, via) => {
    const shown0 = B.shown();
    const picks = await cloth2(B, 'worn_slow', shown0.cloth_id, via);
    const st = B.stored()?.equipment ?? {};
    B.api.set('soundOn', !B.api.get().soundOn);
    const later = B.stored()?.equipment ?? {};
    return fails([shown0.cloth_id === 'simonis_760_fast' && shown0.ballset_id === 'aramith_pool_worn' && shown0.table_id === 'diamond_proam_8ft',
      `boot shows ${JSON.stringify(shown0)} (want the twins diamond_proam_8ft, simonis_760_fast, aramith_pool_worn)`], picks,
      [st.cloth_id === shown0.cloth_id, `stored cloth ${st.cloth_id} (want the re-picked ${shown0.cloth_id})`],
      [st.table_id === C.B1.equipment.table_id && st.ballset_id === C.B1.equipment.ballset_id, `unselected holds kept: stored table ${st.table_id}, ballset ${st.ballset_id} (want the saved ${C.B1.equipment.table_id}, ${C.B1.equipment.ballset_id})`],
      [later.table_id === C.B1.equipment.table_id && later.ballset_id === C.B1.equipment.ballset_id && later.cloth_id === shown0.cloth_id,
        `the later persist stored ${JSON.stringify(later)} (want the saved table and ballset, the re-picked cloth)`],
      [B.shown().table_id === shown0.table_id && B.shown().ballset_id === shown0.ballset_id, `shows ${JSON.stringify(B.shown())} (want the twins still shown)`],
      [!B.game.errs.length, B.game.errs.join('; ')]);
  };
  // L81 B digest: the saved table and cloth are the retired digest-row ids (ctx.retired, recovered by digest, never typed here);
  // a stale sibling shows a degraded table (and cloth) and holds the saved ids. A cue swap and a kept ballset each commit only
  // their own axis, so every persist still writes the saved table and cloth back (an axis with no hold stores what it shows: the
  // fresh-sibling migration of the retired cloth to its twin under S3)
  const digestHold = async (B, cell) => {
    const saved = { table_id: ctx.retired.table_id, cloth_id: ctx.retired.cloth_id };
    const shown0 = B.shown();
    const want = (axis) => (shown0[axis] === ctx.EA.canonicalEquipmentId(axis, saved[axis]) ? shown0[axis] : saved[axis]);
    const keeps = (st, when) => [['table_id', 'cloth_id'].every((axis) => st[axis] === want(axis)),
      `${when}: stored table ${st.table_id}, cloth ${st.cloth_id} (want ${want('table_id')}, ${want('cloth_id')})`];
    const q = await B.api.changeEquipment('cue_id', 'pro_ld_pivot_118', { skipConfirm: true });
    const st1 = B.stored()?.equipment ?? {};
    // a ballset the cell's siblings play and the fresh catalog does not demote (the archived kernel lists no neutral pool ballset)
    const ball = { S1: 'aramith_pool_worn', S2: 'carom', S3: 'pool_used' }[cell];
    const s = B.api.preview.stage('ballset_id', ball); const kp = await B.api.preview.keep({ skipConfirm: true });
    const st2 = B.stored()?.equipment ?? {};
    B.api.set('soundOn', !B.api.get().soundOn);
    const st3 = B.stored()?.equipment ?? {};
    return fails([shown0.table_id !== saved.table_id && shown0.table_id !== ctx.EA.canonicalEquipmentId('table_id', saved.table_id),
      `boot shows table ${shown0.table_id} (want a degraded table)`],
    [q === true && st1.cue_id === 'pro_ld_pivot_118', `cue swap ${q}, stored cue ${st1.cue_id}`], keeps(st1, 'after the cue swap'),
    [s === true && kp?.committed === true && st2.ballset_id === ball, `stage ${s}, keep ${JSON.stringify(kp)}, stored ballset ${st2.ballset_id}`], keeps(st2, 'after the ballset keep'),
    keeps(st3, 'after a later persist'), [B.shown().table_id === shown0.table_id, `shows table ${B.shown().table_id}`], [!B.game.errs.length, B.game.errs.join('; ')]);
  };
  const preRenameNote = (notes) => notes.some((n) => n.includes('cloth_id simonis_760_fast is the pre-rename id of pool_worsted_fast'));
  return [
    ['L81 FRESH', 'every sibling fresh: a table pick, a cue swap, a kept staged cloth and a first game visit commit with no refusal', 'FRESH', {}, async (B) => {
      const t = await B.api.changeEquipment('table_id', 'pool_pro_7ft');
      const q = await B.api.changeEquipment('cue_id', 'pro_ld_pivot_118', { skipConfirm: true });
      const s = B.api.preview.stage('cloth_id', 'pool_worsted_fast'); const kp = await B.api.preview.keep({ skipConfirm: true });
      const nine = B.stored()?.equipmentByGame?.nine_ball ?? {};
      const g = await B.api.changeGame('eight_ball', { skipConfirm: true });
      return fails([t === true && nine.table_id === 'pool_pro_7ft', `table pick ${t}, stored ${nine.table_id}`],
        [q === true && B.game.swaps === 1 && nine.cue_id === 'pro_ld_pivot_118', `cue swap ${q}, ${B.game.swaps} swap(s), stored ${nine.cue_id}`],
        [s === true && kp?.committed === true && nine.cloth_id === 'pool_worsted_fast', `stage ${s}, keep ${JSON.stringify(kp)}, stored ${nine.cloth_id}`],
        [g === true && B.stored()?.game === 'eight_ball', `changeGame ${g}`], [!B.notes.some((n) => n.includes('refused')), noteText(B)], [!B.game.errs.length, B.game.errs.join('; ')]);
    }],
    ['L81 E11 S1', 'a stale SDK catalog: a pre-rename cloth pick commits with its disclosure; a table the catalog lacks is refused', 'S1', {}, async (B) => {
      const a = await B.api.changeEquipment('cloth_id', 'simonis_760_fast');
      const b = await B.api.changeEquipment('table_id', 'pool_pro_7ft');
      return fails([a === true && B.stored()?.equipment?.cloth_id === 'simonis_760_fast', `pick ${a}, stored ${B.stored()?.equipment?.cloth_id}`],
        [preRenameNote(B.notes), `no pre-rename disclosure: ${noteText(B)}`], [b === false, `table pick ${b}`], [!B.game.errs.length, B.game.errs.join('; ')]);
    }],
    ['L81 E11 S2', 'a stale kernel: a table it lacks is refused before prepare and persist', 'S2', {}, (B) => refusedPick(B, () => B.api.changeEquipment('table_id', 'pool_pro_7ft'), 'table_id pool_pro_7ft')],
    ['L81 E11 S3', 'a pre-rename scene: a table it cannot build is refused before prepare and persist', 'S3', {}, (B) => refusedPick(B, () => B.api.changeEquipment('table_id', 'pool_pro_7ft'), 'table_id pool_pro_7ft')],
    ['L81 E11 S4', 'saved pre-rename ids, fresh siblings: a cloth pick stores the pick and holds nothing', 'FRESH', { blob: C.B4 }, async (B) => {
      const a = await B.api.changeEquipment('cloth_id', 'pool_worsted_new');
      const st = B.stored()?.equipment ?? {};
      return fails([a === true && st.cloth_id === 'pool_worsted_new', `pick ${a}, stored ${st.cloth_id}`],
        [JSON.stringify(st) === JSON.stringify(B.shown()), `stored ${JSON.stringify(st)} differs from shown ${JSON.stringify(B.shown())}`]);
    }],
    ['L81 readback', 'a scene whose probe accepts a table it then substitutes: refused after prepare, the committed tuple prepared again', 'FRESH', { scene: 'lying' }, async (B) => {
      const built0 = B.scene.built.length; const blob0 = blobOf(B); const table0 = B.shown().table_id;
      const a = await B.api.changeEquipment('table_id', 'pool_pro_7ft');
      const built = B.scene.built.slice(built0);
      return fails([a === false, `resolved ${a}`], [built.length === 2 && built[0] === ctx.TM.SCRIPTED_PIN_TABLE_ID, `prepared ${built.join(', ')}`],
        [blobOf(B) === blob0 && B.shown().table_id === table0, `persisted ${blobOf(B)}, shows ${B.shown().table_id}`],
        [B.notes.some((n) => n.includes('the loaded scene prepared')), `no read-back note: ${noteText(B)}`]);
    }],
    ['L81 P2 S1', 'a stale SDK catalog holds saved fresh ids: an explicit re-pick of the cloth it shows releases the cloth hold only', 'S1', { blob: C.B1 }, (B) => release(B, 'pick')],
    ['L81 P2 S2', 'a stale kernel holds saved fresh ids: an explicit re-pick of the cloth it shows releases the cloth hold only', 'S2', { blob: C.B1 }, (B) => release(B, 'pick')],
    // the S1 pairing for cues: the fresh kernel lists pro_ld_pivot_141, the stale SDK catalog lacks it and lists its pre-rename
    // twin predator_z2 (the archived catalog lists every fresh cue, so the pre-cue-rename catalog model stands in for it)
    ['L81 E12 S1', 'a stale SDK catalog: the cue fast path refuses a cue the fresh kernel lists but the catalog lacks, and swaps its pre-rename twin with the disclosure', 'CUE', {}, async (B) => {
      const cue0 = B.shown().cue_id; const blob0 = blobOf(B);
      const a = await B.api.changeEquipment('cue_id', 'pro_ld_pivot_141', { skipConfirm: true });
      const refused = [a === false && B.game.swaps === 0 && B.shown().cue_id === cue0 && blobOf(B) === blob0,
        `a pick of pro_ld_pivot_141 resolved ${a}: ${B.game.swaps} swap(s), shows ${B.shown().cue_id}, persisted ${blobOf(B)}`];
      const b = await B.api.changeEquipment('cue_id', 'predator_z2', { skipConfirm: true });
      return fails([B.api.equipmentSupported('pro_ld_pivot_141', 'cue')?.verdict?.kernelIds === true, 'the fresh kernel does not list pro_ld_pivot_141'], refused,
        [b === true && B.game.swaps === 1 && B.game.reracks === 0 && B.stored()?.equipment?.cue_id === 'predator_z2',
          `swap ${b}, ${B.game.swaps} swap(s), ${B.game.reracks} rerack(s), stored ${B.stored()?.equipment?.cue_id}`],
        [B.notes.some((n) => n.includes('cue_id predator_z2 is the pre-rename id of pro_ld_pivot_141')), `no pre-rename disclosure: ${noteText(B)}`]);
    }],
    ['L81 E12 S2', 'a stale kernel holding saved fresh ids: a cue swap stores the cue and keeps every other hold (the saved ids stay stored)', 'S2', { blob: C.B1 }, async (B) => {
      const a = await B.api.changeEquipment('cue_id', 'pro_ld_pivot_118', { skipConfirm: true });
      const st = B.stored()?.equipment ?? {}; const b1 = C.B1.equipment;
      return fails([a === true && B.game.swaps === 1 && st.cue_id === 'pro_ld_pivot_118', `swap ${a}, stored ${st.cue_id}`],
        [st.table_id === b1.table_id && st.cloth_id === b1.cloth_id && st.ballset_id === b1.ballset_id,
          `other holds kept: stored ${JSON.stringify(st)} (want the saved ${b1.table_id}, ${b1.cloth_id}, ${b1.ballset_id})`],
        [B.shown().table_id === 'diamond_proam_8ft' && B.shown().cloth_id === 'simonis_760_fast', `shows ${JSON.stringify(B.shown())}`]);
    }],
    ['L81 E12 S4', 'a pre-cue-rename catalog: the cue fast path refuses a cue the catalog lacks, and an explicit re-pick of a held degraded cue releases the hold', 'CUE', {}, async (B) => {
      const r0 = await B.api.set('equipment', { ...B.shown(), cue_id: 'pro_ld_pivot_141' });
      const shown0 = B.shown().cue_id; const stored0 = B.stored()?.equipment?.cue_id;
      const a = await B.api.changeEquipment('cue_id', 'pro_ld_pivot_141', { skipConfirm: true });
      const b = await B.api.changeEquipment('cue_id', 'standard', { skipConfirm: true });
      const c = await B.api.changeEquipment('cue_id', 'predator_z2', { skipConfirm: true });
      const st = B.stored()?.equipment ?? {};
      return fails([r0 !== false && shown0 === 'predator_z2' && stored0 === 'pro_ld_pivot_141', `set ${r0}: shows cue ${shown0}, stores ${stored0} (want the degrade predator_z2 held over pro_ld_pivot_141)`],
        [a === false && B.shown().cue_id === 'predator_z2', `a pick of pro_ld_pivot_141 resolved ${a}, shows ${B.shown().cue_id}`],
        [b === true && c === true, `swaps ${b}, ${c}`], [st.cue_id === 'predator_z2', `stored cue ${st.cue_id} (want the re-picked predator_z2)`]);
    }],
    ['L81 E12 S5', 'a kernel without the renamed cues: the cue fast path refuses a picked cue it lacks, never degrading it to its twin', 'KCUE', {}, async (B) => {
      const cue0 = B.shown().cue_id; const blob0 = JSON.stringify(B.stored() ?? null);
      const a = await B.api.changeEquipment('cue_id', 'pro_ld_pivot_141', { skipConfirm: true });
      return fails([cue0 !== 'pro_ld_pivot_141' && cue0 !== 'predator_z2', `boot shows cue ${cue0}`],
        [a === false && B.game.swaps === 0 && B.shown().cue_id === cue0, `a pick of pro_ld_pivot_141 resolved ${a}, ${B.game.swaps} swap(s), shows ${B.shown().cue_id}`],
        [JSON.stringify(B.stored() ?? null) === blob0, `persisted ${JSON.stringify(B.stored())}`]);
    }],
    ['L81 E12 options', 'a kernel without the renamed cues: the cue picker list (ctx.cueSwap.options) leaves out every cue it rejects but the current one', 'KCUE', {}, async (B) => {
      const listed = B.cueSwap().options().map((o) => o.id);
      const lacks = B.stubs.catalogEntries('cue_id').map((e) => e.id).filter((id) => B.api.equipmentSupported(id, 'cue')?.ok === false);
      const cur = B.shown().cue_id;
      return fails([lacks.length > 0, 'the kernel lists every catalog cue (no rejected cue to leave out)'],
        [!listed.some((id) => id !== cur && lacks.includes(id)), `lists rejected cue(s) ${listed.filter((id) => id !== cur && lacks.includes(id)).join(', ')}`],
        [listed.includes(cur), `leaves out the current cue ${cur}`]);
    }],
    ['L81 E13 S1', 'a stale SDK catalog: staging a pre-rename cloth previews it with its disclosure', 'S1', {}, async (B) => {
      const s = B.api.preview.stage('cloth_id', 'simonis_760_fast');
      return fails([s === true && B.shown().cloth_id === 'simonis_760_fast' && B.api.preview.active() !== null, `stage ${s}, shows ${B.shown().cloth_id}`],
        [preRenameNote(B.notes), `no pre-rename disclosure: ${noteText(B)}`]);
    }],
    ['L81 E13 S2', 'a stale kernel: staging a table it lacks is refused before the scene switch', 'S2', {}, (B) => refusedPick(B, () => B.api.preview.stage('table_id', 'pool_pro_7ft'), 'table_id pool_pro_7ft', true)],
    ['L81 E13 S3', 'a pre-rename scene: staging a table it cannot build is refused before the scene switch', 'S3', {}, (B) => refusedPick(B, () => B.api.preview.stage('table_id', 'pool_pro_7ft'), 'table_id pool_pro_7ft', true)],
    ['L81 E13 S4', 'saved pre-rename ids, fresh siblings: staging a cloth previews it', 'FRESH', { blob: C.B4 }, async (B) => {
      const s = B.api.preview.stage('cloth_id', 'pool_worsted_new');
      return fails([s === true && B.shown().cloth_id === 'pool_worsted_new' && B.api.preview.active() !== null, `stage ${s}, shows ${B.shown().cloth_id}`]);
    }],
    ['L81 E14 S1', 'a stale SDK catalog: keeping a staged pre-rename cloth commits it with its disclosure', 'S1', {}, async (B) => {
      const s = B.api.preview.stage('cloth_id', 'simonis_760_fast'); const n0 = B.notes.length;
      const kp = await B.api.preview.keep({ skipConfirm: true });
      return fails([s === true && kp?.committed === true && B.stored()?.equipment?.cloth_id === 'simonis_760_fast', `stage ${s}, keep ${JSON.stringify(kp)}`],
        [preRenameNote(B.notes.slice(n0)), `keep disclosed nothing: ${JSON.stringify(B.notes.slice(n0))}`]);
    }],
    ['L81 E14 S2', 'the stale kernel answers only after a table was staged: keep refuses with the transaction still live', 'S2', { lateGlue: true, shotIndex: 1 }, async (B) => {
      const s = B.api.preview.stage('table_id', 'pool_pro_7ft');
      B.glue.ready = true;
      const kp = await B.api.preview.keep({ skipConfirm: true });
      return fails([s === true, `stage ${s}`], [kp?.committed === false, `keep ${JSON.stringify(kp)}`],
        [B.api.preview.active()?.equipment?.table_id !== undefined, `the transaction is gone: ${JSON.stringify(B.api.preview.active())}`],
        [B.stored()?.equipment?.table_id !== 'pool_pro_7ft', 'persisted the staged table'], [refusedNote(B, 'table_id pool_pro_7ft'), `no refusal note: ${noteText(B)}`]);
    }],
    ['L81 E14 S3', 'a pre-rename scene arrives after a table was staged: keep refuses with the transaction still live', 'FRESH', { scene: 'none' }, async (B) => {
      const s = B.api.preview.stage('table_id', 'pool_pro_7ft');
      B.setScene('stale');
      const kp = await B.api.preview.keep({ skipConfirm: true });
      return fails([s === true, `stage ${s}`], [kp?.committed === false, `keep ${JSON.stringify(kp)}`],
        [B.api.preview.active()?.equipment?.table_id !== undefined, `the transaction is gone: ${JSON.stringify(B.api.preview.active())}`],
        [B.stored()?.equipment?.table_id !== 'pool_pro_7ft', 'persisted the staged table'], [refusedNote(B, 'table_id pool_pro_7ft'), `no refusal note: ${noteText(B)}`]);
    }],
    ['L81 E14 S4', 'a stale SDK catalog holds saved fresh ids: a kept re-stage of the cloth it shows releases the cloth hold only', 'S1', { blob: C.B1 }, (B) => release(B, 'keep')],
    ['L81 B digest S1', 'a stale SDK catalog holds the saved digest-row table and cloth: a cue swap and a ballset keep keep them stored', 'S1', { blob: { game: 'nine_ball', equipment: { table_id: ctx.retired.table_id, cloth_id: ctx.retired.cloth_id } } }, (B) => digestHold(B, 'S1')],
    ['L81 B digest S2', 'a stale kernel holds the saved digest-row table and cloth: a cue swap and a ballset keep keep them stored', 'S2', { blob: { game: 'nine_ball', equipment: { table_id: ctx.retired.table_id, cloth_id: ctx.retired.cloth_id } } }, (B) => digestHold(B, 'S2')],
    ['L81 B digest S3', 'a pre-rename scene holds the saved digest-row table: a cue swap and a ballset keep keep it stored', 'S3', { blob: { game: 'nine_ball', equipment: { table_id: ctx.retired.table_id, cloth_id: ctx.retired.cloth_id } } }, (B) => digestHold(B, 'S3')],
    // a programmatic commit with no chosen axis moves a held axis off its degraded id and back: the hold was pruned on the first
    // commit (the axis no longer showed the degraded id), so the second stores the shown twin, never the saved id again
    ['L81 B prune', 'a stale kernel holding saved fresh ids: a hold whose axis moved off the degraded id is pruned and never comes back', 'S2', { blob: C.B1 }, async (B) => {
      const shown0 = B.shown().cloth_id;
      const a = await B.api.set('equipment', { ...B.shown(), cloth_id: 'worn_slow' });
      const st1 = B.stored()?.equipment ?? {};
      const b = await B.api.set('equipment', { ...B.shown(), cloth_id: shown0 });
      const st2 = B.stored()?.equipment ?? {};
      return fails([a !== false && b !== false && st1.cloth_id === 'worn_slow', `set ${a}, ${b}; stored cloth ${st1.cloth_id} after the first`],
        [st2.cloth_id === shown0, `stored cloth ${st2.cloth_id} (want the shown ${shown0}: the pruned hold came back)`],
        [st2.table_id === C.B1.equipment.table_id && st2.ballset_id === C.B1.equipment.ballset_id, `stored table ${st2.table_id}, ballset ${st2.ballset_id} (want the saved ids)`]);
    }],
    // an explicit commit naming the cloth chosen while it still shows its held twin (the pick equals the degraded id shown)
    ['L81 B chosen', 'a stale kernel holding saved fresh ids: an explicit pick of the shown held cloth releases that axis only', 'S2', { blob: C.B1 }, async (B) => {
      const shown0 = B.shown();
      const a = await B.api.set('equipment', { ...shown0 }, { chosen: ['cloth_id'] });
      const st = B.stored()?.equipment ?? {};
      B.api.set('soundOn', !B.api.get().soundOn);
      const later = B.stored()?.equipment ?? {};
      return fails([a !== false && st.cloth_id === shown0.cloth_id && shown0.cloth_id === 'simonis_760_fast', `set ${a}, stored cloth ${st.cloth_id} (want the picked ${shown0.cloth_id})`],
        [st.table_id === C.B1.equipment.table_id && st.ballset_id === C.B1.equipment.ballset_id, `stored table ${st.table_id}, ballset ${st.ballset_id} (want the saved ids)`],
        [JSON.stringify(later) === JSON.stringify(st), `the later persist stored ${JSON.stringify(later)} (want ${JSON.stringify(st)})`]);
    }],
    // a kept table whose recommended cushion equals the held cushion's degraded id: keep rewrites the cushion for the user
    // (ownedAxes), so the hold ends and the pairing is stored, exactly as the changeEquipment re-rack of the same table stores it
    ['L81 B keep cushion', 'a kernel showing the saved cushion as its superseded twin: a kept table whose recommended cushion is that twin stores the pairing and ends the cushion hold', 'KCUSH',
      { blob: { game: 'nine_ball', equipment: { table_id: 'pool_pro_9ft', cushion_model_id: 'grip_fitted' } } }, async (B) => {
        const shown0 = B.shown(); const st0 = B.stored()?.equipment ?? {};
        const s = B.api.preview.stage('table_id', 'pool_pro_8ft'); const kp = await B.api.preview.keep({ skipConfirm: true });
        const st = B.stored()?.equipment ?? {};
        B.api.set('soundOn', !B.api.get().soundOn);
        const later = B.stored()?.equipment ?? {};
        return fails([shown0.cushion_model_id === 'stronge_realistic' && (st0.cushion_model_id ?? 'grip_fitted') === 'grip_fitted',
          `boot shows cushion ${shown0.cushion_model_id}, stores ${st0.cushion_model_id} (want the twin stronge_realistic shown, grip_fitted held)`],
        [s === true && kp?.committed === true && st.table_id === 'pool_pro_8ft', `stage ${s}, keep ${JSON.stringify(kp)}, stored table ${st.table_id}; notes ${noteText(B)}`],
        [st.cushion_model_id === 'stronge_realistic', `stored cushion ${st.cushion_model_id} (want the paired stronge_realistic: the auto-paired cushion kept its hold)`],
        [later.cushion_model_id === 'stronge_realistic', `the later persist stored cushion ${later.cushion_model_id}`],
        [!B.game.errs.length, B.game.errs.join('; ')]);
      }],
    ['L81 E15 S1', 'a stale SDK catalog: a first eight_ball visit adopts a pairing the catalog lists', 'S1', {}, async (B) => {
      const g = await B.api.changeGame('eight_ball', { skipConfirm: true });
      const eq = B.shown(); const unknown = Object.entries(eq).filter(([a, id]) => !ctx.catalogs.stale(a, id));
      return fails([g === true && B.stored()?.game === 'eight_ball', `changeGame ${g}`], [!unknown.length, `unknown to the catalog: ${JSON.stringify(unknown)}`],
        [!B.game.errs.length, B.game.errs.join('; ')]);
    }],
    ['L81 E15 S2', 'a stale kernel: a first heyball visit plays the pre-rename ballset and holds the pairing', 'S2', {}, async (B) => {
      const g = await B.api.changeGame('heyball', { skipConfirm: true });
      const st = B.stored() ?? {};
      return fails([g === true, `changeGame ${g}`], [B.shown().ballset_id === 'aramith_pool', `shows ballset ${B.shown().ballset_id}`],
        [st.equipment?.ballset_id === 'pool_standard' && st.equipmentByGame?.heyball?.ballset_id === 'pool_standard', `stored ${st.equipment?.ballset_id} / ${st.equipmentByGame?.heyball?.ballset_id}`],
        [!B.game.errs.length, B.game.errs.join('; ')]);
    }],
    ['L81 E15 S3', 'a pre-rename scene: a first eight_ball visit builds the pre-rename table and holds the pairing', 'S3', {}, async (B) => {
      const g = await B.api.changeGame('eight_ball', { skipConfirm: true });
      const st = B.stored() ?? {};
      return fails([g === true, `changeGame ${g}`], [B.scene.built.at(-1) === 'diamond_proam_9ft' && B.shown().table_id === 'diamond_proam_9ft',
        `built ${B.scene.built.join(', ')}, shows ${B.shown().table_id}`], [st.equipment?.table_id === 'pool_pro_9ft', `stored ${st.equipment?.table_id}`]);
    }],
    ['L81 E15 S4', 'saved pre-rename ids, fresh siblings: eight_ball adopts its saved pairing', 'FRESH', { blob: C.B4 }, async (B) => {
      const g = await B.api.changeGame('eight_ball', { skipConfirm: true });
      return fails([g === true && B.shown().table_id === 'pool_pro_7ft' && B.stored()?.equipment?.table_id === 'pool_pro_7ft', `changeGame ${g}, shows ${B.shown().table_id}, stored ${B.stored()?.equipment?.table_id}`],
        [!B.game.errs.length, B.game.errs.join('; ')]);
    }],
    ['L81 set S2', 'a stale kernel: set() degrades an unchosen axis to its twin and stores the request; an axis with no twin refuses', 'S2', {}, async (B) => {
      const a = await B.api.set('equipment', { ...B.shown(), cloth_id: 'pool_worsted_fast' });
      const shown = B.shown().cloth_id; const st = B.stored()?.equipment?.cloth_id;
      const b = await B.api.set('equipment', { ...B.shown(), cushion_model_id: 'no_such_model' });
      return fails([a !== false && shown === 'simonis_760_fast' && st === 'pool_worsted_fast', `set ${a}, shows ${shown}, stored ${st}`],
        [b === false && B.shown().cushion_model_id !== 'no_such_model', `no_such_model set ${b}`]);
    }],
  ];
}
async function l81Run(ctx, plant = null) {
  const mod = await l81Module(fs.readFileSync(path.join(ROOT, 'app', 'settings.js'), 'utf8'));
  let anchorFound = true;
  if (plant) { anchorFound = mod.code.split(plant.anchor).length === 2; mod.code = mod.code.replace(plant.anchor, () => plant.replacement); }
  const results = [];
  for (const [key, title, cell, extra, body] of l81Scenarios(ctx)) {
    const [k, c, scene] = l81Consts().CELLS[cell];
    let detail;
    try { detail = await body(await l81Boot(ctx, mod, { k, c, scene, ...extra })); } catch (e) { detail = `threw: ${(e && e.message) || e}`; }
    results.push({ key, title: `${key} (${cell}): ${title}`, ok: !detail, detail });
  }
  return { results, anchorFound, mod };
}
// L81-0: the module ran whole, with every import it declares stubbed and nothing else at top level.
function l81Guards(ctx, run, report) {
  const C = l81Consts(); const m = run.mod;
  const unstubbed = m.imports.filter((n) => !C.STUBS.includes(n)); const extra = C.STUBS.filter((n) => !m.imports.includes(n));
  report('L81-0 stubs', `L81-0 every binding settings.js imports (${m.imports.length}) is stubbed`, !unstubbed.length && !extra.length,
    `unstubbed: ${unstubbed.join(', ')}; stubbed but not imported: ${extra.join(', ')}`);
  report('L81-0 module', 'L81-0 settings.js top level is declarations only and buildPanel is the one stubbed body', !m.odd.length && m.panel,
    `other statements: ${JSON.stringify(m.odd)}; buildPanel ${m.panel ? 'stubbed' : 'absent'}`);
  console.log('L81-0 note: the scene handle is a model of web/scene/table.js prepareEquipment (fresh: canonical id; 7352fa8e: the id as given), the cue-rename catalog a model (the fresh catalog without pro_ld_pivot_*)');
}
async function l81Check(ctx, run, report) {
  for (const r of run.results) report(l80Scrub(ctx, r.key), l80Scrub(ctx, r.title), r.ok, l80Scrub(ctx, r.detail));
}
// --selftest-drift: each plant turns the gate off at one call site of the whole-module source (an anchor not found exactly once
// makes the plant INVALID). CAUGHT only when the control is green and the failing key set equals the expected set.
async function l81DriftSelftest() {
  const tag = '[L81 selftest-drift]';
  const ctx = await l80Context();
  const collect = async (plant) => { const run = await l81Run(ctx, plant); const rows = []; await l81Check(ctx, run, (key, name, ok, detail = '') => rows.push({ key, ok, line: checkLine(name, ok, detail) })); return { rows, anchorFound: run.anchorFound }; };
  const control = (await collect(null)).rows; const controlFails = control.filter((r) => !r.ok);
  const plants = [
    // E11: changeEquipment's pick no longer names its axis chosen (pre-check and set() alike): a pick the siblings lack
    // degrades to its twin and commits, and the pre-rename disclosure goes silent
    { name: 'E11-no-chosen', anchor: 'const chosen = [axis];', replacement: 'const chosen = [];', expected: ['L81 E11 S1', 'L81 E11 S2', 'L81 E11 S3'] },
    // E12: the cue picker list no longer asks the predicate: a cue the kernel lacks is listed selectable
    { name: 'E12-options-ungated', anchor: "(e.id === values.equipment.cue_id || equipmentSupported(e.id, 'cue').ok !== false)", replacement: 'true', expected: ['L81 E12 options'] },
    // E12: the cue fast path no longer names its axis chosen: a cue the kernel lacks degrades to its twin, and a pre-rename cue
    // pick under a stale catalog loses its disclosure
    { name: 'E12-no-chosen', anchor: '{ requestKey: axis, chosen: [axis] }), request = equipmentRevision;', replacement: '{ requestKey: axis }), request = equipmentRevision;', expected: ['L81 E12 S1', 'L81 E12 S5'] },
    // E13: preview.stage no longer names its axis chosen: a table the siblings lack stages as its twin
    { name: 'E13-no-chosen', anchor: 'const picked = [kind];', replacement: 'const picked = [];', expected: ['L81 E13 S1', 'L81 E13 S2', 'L81 E13 S3'] },
    // E14: keep's pre-check off: set() still refuses, but after previewTx = null (the transaction is lost)
    { name: 'E14-no-precheck', anchor: 'if (pickRefused(next, [...eqAxes, ...adoptAxes]))', replacement: 'if (false)', expected: ['L81 E14 S2', 'L81 E14 S3'] },
    // E15: the game switch adopts the ungated app default instead of the gated pairing set() computed (defaultEquipmentFor
    // gates the pairing itself now, so dropping options.pairing alone re-derives the same gated spec)
    { name: 'E15-no-pairing', anchor: 'options.pairing ?? equipmentByGame[value] ?? defaultEquipmentFor(value)', replacement: 'equipmentByGame[value] ?? { ...DEFAULTS.equipment }', expected: ['L81 E15 S1', 'L81 E15 S2', 'L81 E15 S3'] },
    // E15: the gated pairing's own degrades (defaultEquipmentFor's held) no longer join the commit's holds: the twin is stored
    { name: 'E15-no-pair-hold', anchor: 'if (!degraded[axis] && next[axis] === h.shown) degraded[axis] = h;', replacement: '', expected: ['L81 E15 S2', 'L81 E15 S3'] },
    // set() commits ungated: the pre-checks at E11, E13 and E14 still refuse a pick, but the disclosures and set()'s own degrade
    // go (the first-visit pairing stays gated: defaultEquipmentFor degrades and holds it before set() commits)
    { name: 'set-no-gate', anchor: 'const gate = gated ? equipmentCommitGate(', replacement: 'const gate = false ? equipmentCommitGate(',
      expected: ['L81 E11 S1', 'L81 E12 S1', 'L81 E12 S4', 'L81 E12 S5', 'L81 E13 S1', 'L81 E14 S1', 'L81 set S2'] },
    // the post-prepare read-back off: a substituted table commits
    { name: 'no-readback', anchor: 'if (canonical(built.requested_table) !== canonical(next.table_id)) {', replacement: 'if (false) {', expected: ['L81 readback'] },
    // an explicit commit no longer releases the holds of its chosen/owned axes (the prune alone still ends a hold whose axis moved)
    { name: 'no-release', anchor: 'const released = releasedAxes(options);', replacement: 'const released = new Set();', expected: ['L81 B chosen', 'L81 B keep cushion'] },
    // the pre-change contract: an explicit commit ends every hold, the unselected degraded axes too (the saved ids are lost)
    { name: 'release-all', anchor: 'const hold = holdDegraded(Object.fromEntries(kept), degraded);', replacement: 'const hold = holdDegraded({}, degraded);',
      expected: ['L81 P2 S1', 'L81 P2 S2', 'L81 E12 S2', 'L81 E14 S4', 'L81 B digest S1', 'L81 B digest S2', 'L81 B digest S3', 'L81 B chosen', 'L81 B prune'] },
    // a hold whose axis no longer shows its degraded id is kept: it comes back when a later commit returns to that id
    { name: 'no-prune', anchor: '!released.has(axis) && stored[axis] === h.shown', replacement: '!released.has(axis)', expected: ['L81 B prune'] },
    // preview.keep commits its auto-paired recommended cushion as unowned: a held cushion whose twin is that pairing stays held
    { name: 'keep-unowned-cushion', anchor: "set('equipment', next, { chosen: [...eqAxes, ...adoptAxes], ownedAxes })", replacement: "set('equipment', next, { chosen: [...eqAxes, ...adoptAxes] })", expected: ['L81 B keep cushion'] },
    // a degrade is committed without its hold: the degrade becomes the saved choice
    { name: 'no-degrade-hold', anchor: 'const hold = holdDegraded(Object.fromEntries(kept), degraded);', replacement: 'const hold = Object.fromEntries(kept);', expected: ['L81 set S2', 'L81 E12 S4'] },
  ];
  let caught = 0;
  for (const p of plants) {
    console.log(`${tag} plant ${p.name}: anchor ${JSON.stringify(p.anchor)}; control: ${control.length} checks, ${controlFails.length} failure(s)`);
    const { rows, anchorFound } = await collect(p);
    if (!anchorFound || controlFails.length) {
      for (const r of controlFails) console.log(`${tag} control ${r.line}`);
      console.log(`${tag} ${p.name} INVALID: ${controlFails.length ? 'the control is red' : 'the anchor is not found exactly once in the module source'}`);
      continue;
    }
    const fails = rows.filter((r) => !r.ok);
    const got = [...new Set(fails.map((r) => r.key))].sort(); const want = [...new Set(p.expected)].sort();
    if (fails.length && got.length === want.length && got.every((k, i) => k === want[i])) { caught += 1; for (const r of fails) console.log(`${tag} ${p.name} CAUGHT: ${r.line}`); }
    else {
      console.log(`${tag} ${p.name} NOT CAUGHT: failing keys {${got.join(' | ')}}, expected {${want.join(' | ')}}`);
      for (const r of fails) console.log(`${tag} ${p.name} fixture ${r.line}`);
    }
  }
  const counted = plants.length === l81Consts().PLANT_COUNT;
  console.log(`${tag} ${caught} of ${plants.length} plants caught; ${plants.length} plant(s) declared, ${l81Consts().PLANT_COUNT} required${counted ? '' : ' (COUNT MISMATCH)'}`);
  return caught === plants.length && counted ? 0 : 1;
}

// L82 (#789, the scene stage of the mixed-cache census): the scene sink and the boot / active-table gates run as production text
// per census column. L82p: buildTable's nested prepareEquipment, sliced verbatim from web/scene/table.js (fresh) and from
// 7352fa8e (S3), in a vm whose builder state is stubs and whose kernel probe is the sliced kernelTableKnown over a real kernel's
// glue. L82q: resolveBootTableId's ?table= branch (the sliced bootQueryTableId) under the fresh and archived kernels. L82m:
// web/app/main.js checkActiveTableMirror and armActiveTableMirror (sliced top-level functions) against a real kernel's
// table_geometry_json_for, with the scene mirror built from table-in-node's makeGeom, and the boot call's mode selection. L82b:
// main.js bootRack and its boot wiring. L82s: settings.js's boot staging catch (the whole module booted by l81Boot). L82k: the
// kernel->scene seams (main.js rerackKind, flow.js activateSnooker / caromActivate, drills.js's stale-settings switch, which the snooker pin takes)
// re-rack before their equipment broadcast, so a kernel refusal never switches the scene (census E22.S2). --selftest-drift
// plants turn one gate off each (l82DriftSelftest).
function l82Consts() {
  return {
    FILES: { table: ['scene', 'table.js'], main: ['app', 'main.js'], settings: ['app', 'settings.js'], flow: ['app', 'flow.js'], drills: ['app', 'drills.js'] },
    MAIN_NAMES: ['checkActiveTableMirror', 'armActiveTableMirror', 'bootRack'],
    STALE_SCENE_NAMES: ['resolveBootTableId', 'bootLegalTableIds', 'bootClassDefaultTableId'],
    // a neutral table the archived kernel b6b5dc3f lacks, with a pre-rename twin it lists (TABLE_RENAMES reversed)
    K55: 'pool_pro_9ft_k55', K55_TWIN: 'rasson_ox_9ft',
    // a neutral table the archived kernel lacks with no plain-text twin (a digest alias)
    MEASURED: 'pool_pro_9ft_measured',
    PLANT_COUNT: 21,
  };
}
// The sources one run reads; a plant edits one file's text (its anchor must occur exactly once) before anything is sliced from it.
function l82Sources(plant) {
  const src = {};
  for (const [key, parts] of Object.entries(l82Consts().FILES)) src[key] = fs.readFileSync(path.join(ROOT, ...parts), 'utf8');
  let anchorFound = true;
  if (plant) {
    anchorFound = src[plant.file].split(plant.anchor).length === 2;
    src[plant.file] = src[plant.file].replace(plant.anchor, () => plant.replacement);
  }
  return { src, anchorFound };
}
// A function nested in buildTable, verbatim: its two-space-indented declaration to the first two-space closing brace.
function l82Nested(src, name) {
  const head = `\n  function ${name}(`; const a = src.indexOf(head);
  if (a < 0 || src.indexOf(head, a + 1) >= 0) throw new Error(`nested ${name} is not declared exactly once`);
  const b = src.indexOf('\n  }\n', a);
  if (b < 0) throw new Error(`nested ${name} is unclosed`);
  return src.slice(a + 1, b + 4);
}
async function l82Ast(src) {
  const { parse } = await import('../../tools/render/lib/vendor/acorn/acorn.mjs');
  return parse(src, { ecmaVersion: 'latest', sourceType: 'module' });
}
// Every node under `node` the predicate accepts (plain recursive walk over acorn's node objects).
function l82Find(node, pred, out = []) {
  if (!node || typeof node.type !== 'string') return out;
  if (pred(node)) out.push(node);
  for (const [k, v] of Object.entries(node)) {
    if (k === 'type' || k === 'start' || k === 'end') continue;
    if (Array.isArray(v)) for (const c of v) l82Find(c, pred, out);
    else if (v && typeof v.type === 'string') l82Find(v, pred, out);
  }
  return out;
}
function l82One(nodes, what) {
  if (nodes.length !== 1) throw new Error(`${what}: ${nodes.length} matches, expected 1`);
  return nodes[0];
}
// The scene mirror api.activeGeom publishes, built from the fresh scene's own makeGeom (table-in-node).
function l82Geom(ctx, id, pending = false) {
  const G = ctx.TM.makeGeom(id);
  return { id, pending, length: G.L, width: G.W, noseHeightFrac: G.kernel.noseHeightFrac,
    pockets: G.pockets.map((p) => ({ x: p.x, z: p.z, r: p.r })),
    markings: G.render.markings === 'snooker' ? ctx.TM.SNOOKER_MARKINGS : G.render.markings === 'carom' ? ctx.TM.CAROM_MARKINGS : null };
}
// One builder around a sliced prepareEquipment. The builder state (built, readiness, the request counter) is the stub set the
// nested function closes over in buildTable; rebuild / setReadiness / refuseBuild record what the sink asked for.
async function l82Prepare(ctx, { k, code, probe, keys, init }) {
  const vm = await import('node:vm');
  const notes = [];
  const box = vm.createContext({ TABLE_SPECS: keys, SCRIPTED_PIN_TABLE_ID: ctx.TM.SCRIPTED_PIN_TABLE_ID, equipmentAlias: ctx.EA,
    glue: ctx.kernels[k].kernel, console: { warn: (...a) => notes.push(a.map(String).join(' ')) } });
  vm.runInContext(`let equipmentRequest = 0, _clothCondition = '', _activeTableId = ${JSON.stringify(init)};
const built = { id: ${JSON.stringify(init)} }, previousActiveId = ${JSON.stringify(init)}, group = { visible: true, userData: {} }, log = [];
let readiness = { status: 'READY', requested_table: built.id, retained_table: null };
const _clothLegApply = null;
function sanitizeClothConditionId(id) { return id ?? ''; }
function makeGeom(id) { return { id }; }
function styleMaterials() {} function populate() {} function _tableHalfApply() {} function scheduleRebake() {}
function rebuild(id) { log.push('rebuild ' + id); built.id = id; }
function setReadiness(status, next) { log.push(status + ' ' + next); readiness = { status, requested_table: next, retained_table: built.id }; }
function refuseBuild(error, next) { log.push('refuse ' + next); readiness = { status: 'REFUSED', requested_table: next, retained_table: built.id }; return false; }
function prepareTableTransport() { return null; }
${probe}
${code}
globalThis.__out = { prepareEquipment, status: () => readiness, built, log };`, box);
  return { ...box.__out, notes };
}
// main.js's sliced gates in one vm: the real kernel glue, the fresh scene's checkRailKernelAlignment, recorded reports/notes.
async function l82Main(ctx, src, k) {
  const vm = await import('node:vm');
  const sl = await l80Slices(src.main, l82Consts().MAIN_NAMES, 'web/app/main.js');
  if (sl.missing.length) throw new Error(`main.js lacks ${sl.missing.join(', ')}`);
  const window = new EventTarget(); const reports = []; const notes = [];
  const box = vm.createContext({ glue: ctx.kernels[k].kernel, reportError: (m, o) => reports.push({ m: String(m), o: o ?? null }),
    console: { warn: (...a) => notes.push(a.map(String).join(' ')) }, checkRailKernelAlignment: ctx.TM.checkRailKernelAlignment,
    window, queueMicrotask: (fn) => queueMicrotask(fn), bootCopy: { t: (key, p) => `${key}(${p?.message ?? ''})` } });
  vm.runInContext(l82Consts().MAIN_NAMES.map((n) => sl.slices[n].code).join('\n')
    + '\nglobalThis.__out = { checkActiveTableMirror, armActiveTableMirror, bootRack };', box);
  return { ...box.__out, window, reports, notes };
}
function l82Machine() {
  const handlers = [];
  return { on(ev, fn) { if (ev === 'stateChange') handlers.push(fn); }, emit(next, info) { for (const fn of handlers) fn(next, 'PLAYING', info); } };
}
// hoisted (--selftest-drift runs before a top-level const here would be initialised)
async function l82Tick() { await Promise.resolve(); await new Promise((r) => setImmediate(r)); }
// The fresh scene's table-axis slices (resolveBootTableId, the kernel probe, resolvableTableId, bootQueryTableId) in one vm.
async function l82TableBox(ctx, src, k, search) {
  const vm = await import('node:vm');
  const names = [...l80Consts().TABLE_NAMES, 'bootQueryTableId'];
  const sl = await l80Slices(src.table, names, 'web/scene/table.js');
  if (sl.missing.length) throw new Error(`table.js lacks ${sl.missing.join(', ')}`);
  const notes = [];
  const box = vm.createContext({ TABLE_SPECS: ctx.TM.TABLE_SPECS, SCRIPTED_PIN_TABLE_ID: ctx.TM.SCRIPTED_PIN_TABLE_ID, APP_DEFAULT_TABLE_ID: ctx.TM.APP_DEFAULT_TABLE_ID,
    gamesMod: ctx.gameMods.fresh, equipmentAlias: ctx.EA, glue: ctx.kernels[k].kernel, URLSearchParams, location: { search },
    sessionStorage: { getItem: () => null }, localStorage: { getItem: () => null }, console: { warn: (...a) => notes.push(a.map(String).join(' ')) } });
  vm.runInContext(names.map((n) => sl.slices[n].code).join('\n') + '\nglobalThis.__out = { resolveBootTableId, resolvableTableId, kernelTableKnown };', box);
  return { ...box.__out, notes, slices: sl.slices };
}
// The scenarios: [key, title, body(env)]; a body returns '' when every claim holds, else what failed.
function l82Scenarios(ctx) {
  const C = l82Consts(); const PIN = ctx.TM.SCRIPTED_PIN_TABLE_ID;
  const fails = (...claims) => claims.filter(([ok]) => !ok).map(([, m]) => m).join('; ');
  const staleKeys = Object.fromEntries(l80Consts().STALE_SCENE_KEYS.map((key) => [key, {}]));
  const freshPrep = async (env, k, init = 'pool_pro_9ft') => {
    const t = await l80Slices(env.src.table, ['kernelTableIds', 'kernelTableKnown'], 'web/scene/table.js');
    return l82Prepare(ctx, { k, code: l82Nested(env.src.table, 'prepareEquipment'), init, keys: ctx.TM.TABLE_SPECS,
      probe: t.slices.kernelTableIds.code + '\n' + t.slices.kernelTableKnown.code });
  };
  const stalePrep = (env, init) => l82Prepare(ctx, { k: 'fresh', code: l82Nested(ctx.staleScene, 'prepareEquipment'), init, keys: staleKeys, probe: '' });
  const rack = (k, id) => ctx.kernels[k].nineBallRack(1, id ? { table_id: id } : undefined);
  const handle = (h) => ({ activeGeom: () => l82Geom(ctx, h.id, h.pending === true), status: () => ({ status: h.status ?? 'READY' }),
    ...(h.resolves ? { resolvesTable: h.resolves } : {}) });
  const query = async (env, k, id) => { const T = await l82TableBox(ctx, env.src, k, `?table=${id}`); return { got: T.resolveBootTableId(), notes: T.notes }; };
  // the pre-rename scene's boot id for a user boot with nothing saved: its own resolveBootTableId over its own TABLE_SPECS keys
  const staleBootId = async () => {
    const vm = await import('node:vm');
    const sl = await l80Slices(ctx.staleScene, C.STALE_SCENE_NAMES, `${l80Consts().STALE_SCENE_REV.slice(0, 8)}:web/scene/table.js`);
    const def = ctx.staleScene.match(/^export const APP_DEFAULT_TABLE_ID = '([a-z0-9_]+)';$/m)?.[1];
    const box = vm.createContext({ TABLE_SPECS: staleKeys, SCRIPTED_PIN_TABLE_ID: PIN, APP_DEFAULT_TABLE_ID: def, gamesMod: ctx.gameMods.fresh,
      URLSearchParams, location: { search: '' }, sessionStorage: { getItem: () => null }, localStorage: { getItem: () => null } });
    vm.runInContext(C.STALE_SCENE_NAMES.map((n) => sl.slices[n]?.code ?? '').join('\n') + '\nglobalThis.__out = resolveBootTableId();', box);
    return box.__out;
  };
  // a game whose rerack composes on a real kernel (unknown ids throw, as the kernel does); the seams read game.template
  const seamGame = (k, id) => ({ equipment: { table_id: id }, seed: 3, gameId: 'nine_ball', rulesetId: null, log: [],
    template: rack('fresh', 'pool_pro_8ft'),
    rerack(seed) { this.log.push('rerack'); this.template = ctx.kernels[k].nineBallRack(seed, this.equipment); },
    rerackKind(kind, seed) { this.log.push('rerackKind'); this.template = ctx.kernels[k].rack(kind, seed, this.equipment); } });
  const seams = async (env, k, id) => {
    const vm = await import('node:vm');
    const out = {};
    const pick = async (file, what, pred) => { const ast = await l82Ast(env.src[file]); return l82One(l82Find(ast, pred), `${file} ${what}`); };
    const prop = (name) => (n) => n.type === 'Property' && n.key?.name === name && /FunctionExpression$/.test(n.value?.type ?? '');
    const code = {
      rerackKind: [env.src.main, await pick('main', 'rerackKind', prop('rerackKind'))],
      activateSnooker: [env.src.flow, await pick('flow', 'activateSnooker', prop('activateSnooker'))],
      caromActivate: [env.src.flow, await pick('flow', 'caromActivate', prop('caromActivate'))],
      drills: [env.src.drills, await pick('drills', 'stale-settings switch', (n) => n.type === 'IfStatement'
        && env.src.drills.slice(n.test.start, n.test.end) === "typeof window.__rules?.setGame === 'function'"
        && env.src.drills.slice(n.consequent.start, n.consequent.end).includes("'ob:settings'"))],
    };
    for (const [name, [text, node]] of Object.entries(code)) {
      const game = seamGame(k, id); const reported = [];
      const window = { dispatchEvent: (e) => { if (e?.type === 'ob:settings') game.log.push(`broadcast ${e.detail?.value?.table_id}`); return true; },
        __rules: { setGame: async () => { try { game.rerack(game.seed); return true; } catch { return false; } } } };
      const box = vm.createContext({ game, window, reportError: (m) => reported.push(String(m)), replayLocked: () => false, ctx: { settings: null },
        rulesReady: Promise.resolve({ getRuleset() {}, caromRuleset: {} }),
        CustomEvent: class { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } } });
      // the drills block names its game by the enclosing switch's `id` parameter (switchGamePersisted, GH-980): the snooker pin's id
      const body = name === 'drills'
        ? `(async (id) => { let ok; ${text.slice(node.consequent.start, node.consequent.end)} return ok; })`
        : `(${text.slice(node.value.start, node.value.end)})`;
      let ret; let threw = null;
      try { ret = await vm.runInContext(body, box)(...(name === 'rerackKind' ? ['nine', 3] : name === 'caromActivate' ? [3] : name === 'drills' ? ['snooker'] : [])); } catch (e) { threw = String((e && e.message) || e); }
      out[name] = { log: game.log, ret, threw, reported, tag: game.template?.system?.equipment?.table_id };
    }
    return out;
  };
  return [
    ['L82p FRESH', 'a live switch to a table the scene builds is READY under its id; an id with no scene spec is refused before anything moves, disclosed', async (env) => {
      const B = await freshPrep(env, 'fresh');
      const a = B.prepareEquipment({ table_id: 'pool_pro_8ft' });
      const s1 = B.status(); const log1 = B.log.length;
      const b = B.prepareEquipment({ table_id: 'no_such_table_9ft' });
      return fails([a === true && B.built.id === 'pool_pro_8ft' && s1.status === 'READY' && s1.requested_table === 'pool_pro_8ft', `pool_pro_8ft: ${a}, built ${B.built.id}, ${JSON.stringify(s1)}`],
        [b === false, `no_such_table_9ft resolved ${JSON.stringify(b)}`], [B.built.id === 'pool_pro_8ft' && B.log.length === log1, `moved: built ${B.built.id}, log ${B.log.slice(log1).join(', ')}`],
        [JSON.stringify(B.status()) === JSON.stringify(s1), `readiness ${JSON.stringify(B.status())}`],
        [B.notes.some((n) => n.startsWith('[table] refused table no_such_table_9ft: no scene spec')), `no refusal note: ${JSON.stringify(B.notes)}`]);
    }],
    ['L82p boot', 'the boot build must build: an id with no scene spec builds the scripted pin, disclosed, and status() names the pin; no table_id is the kernel default', async (env) => {
      const B = await freshPrep(env, 'fresh', null);
      const a = B.prepareEquipment({ table_id: 'no_such_table_9ft' }, { boot: true });
      const s = B.status();
      const D = await freshPrep(env, 'fresh');
      const d = D.prepareEquipment({});
      return fails([a === true && B.built.id === PIN && s.requested_table === PIN, `boot: ${a}, built ${B.built.id}, ${JSON.stringify(s)}`],
        [B.notes.some((n) => n.startsWith(`[table] no scene spec for no_such_table_9ft — building the scripted pin ${PIN}`)), `no pin note: ${JSON.stringify(B.notes)}`],
        [d === true && D.built.id === PIN && !D.notes.length, `no table_id: ${d}, built ${D.built.id}, notes ${JSON.stringify(D.notes)}`]);
    }],
    ['L82p S2', 'a stale kernel: a table it lacks is refused (disclosed); its pre-rename twin (the settings degrade) builds READY under the twin id', async (env) => {
      const B = await freshPrep(env, 'stale');
      const a = B.prepareEquipment({ table_id: C.K55 }); const builtA = B.built.id;
      const b = B.prepareEquipment({ table_id: C.K55_TWIN });
      return fails([a === false && builtA === 'pool_pro_9ft', `${C.K55}: ${a}, built ${builtA}`],
        [B.notes.some((n) => n.startsWith(`[table] refused table ${C.K55}: the loaded kernel lacks it`)), `no refusal note: ${JSON.stringify(B.notes)}`],
        [b === true && B.built.id === C.K55_TWIN && B.status().requested_table === C.K55_TWIN, `${C.K55_TWIN}: ${b}, built ${B.built.id}, ${JSON.stringify(B.status())}`]);
    }],
    ['L82p S2 retired', 'a stale kernel: a retired table id it lists (a replay plays it verbatim) builds READY as its canonical scene spec, no refusal', async (env) => {
      const B = await freshPrep(env, 'stale');
      const id = ctx.retired.table_id; const canonical = ctx.EA.canonicalEquipmentId('table_id', id);
      const a = B.prepareEquipment({ table_id: id });
      return fails([canonical !== id, `${id} has no canonical id`],
        [a === true && B.built.id === canonical && B.status().status === 'READY', `${id}: ${a}, built ${B.built.id}, ${JSON.stringify(B.status())}`],
        [!B.notes.some((n) => n.startsWith('[table] refused')), `refused: ${JSON.stringify(B.notes)}`]);
    }],
    ['L82p S3', 'the pre-rename scene (7352fa8e) builds the pin for a neutral id and reports the pin as requested_table, so set()\'s read-back (L81 readback) refuses it', async (env) => {
      const B = await stalePrep(env, 'wpa_spec_9ft');
      const a = B.prepareEquipment({ table_id: 'pool_pro_9ft' });
      return fails([a === true && B.built.id === PIN, `${a}, built ${B.built.id}`], [B.status().requested_table === PIN, `requested_table ${B.status().requested_table}`]);
    }],
    ['L82p S4', 'a saved pre-rename id builds its own scene entry (the renamed twin keeps a TABLE_SPECS key), READY under that id', async (env) => {
      const B = await freshPrep(env, 'fresh');
      const a = B.prepareEquipment({ table_id: 'diamond_proam_8ft' });
      return fails([a === true && B.built.id === 'diamond_proam_8ft' && B.status().requested_table === 'diamond_proam_8ft' && !B.notes.length,
        `${a}, built ${B.built.id}, ${JSON.stringify(B.status())}, notes ${JSON.stringify(B.notes)}`]);
    }],
    ['L82q FRESH', '?table= builds a table the scene and the kernel both know, silently', async (env) => {
      const r = await query(env, 'fresh', 'pool_pro_8ft');
      return fails([r.got === 'pool_pro_8ft' && !r.notes.length, `${r.got}, notes ${JSON.stringify(r.notes)}`]);
    }],
    ['L82q S2', '?table= under a stale kernel: a table it lacks takes its pre-rename twin, else the pin; both disclosed', async (env) => {
      const a = await query(env, 'stale', C.K55); const b = await query(env, 'stale', C.MEASURED); const c = await query(env, 'stale', C.K55_TWIN);
      return fails([a.got === C.K55_TWIN && a.notes.some((n) => n.includes(`building its pre-rename twin ${C.K55_TWIN}`)), `${C.K55}: ${a.got}, ${JSON.stringify(a.notes)}`],
        [b.got === PIN && b.notes.some((n) => n.includes(`?table=${C.MEASURED}: the loaded kernel lacks it — building the scripted pin`)), `${C.MEASURED}: ${b.got}, ${JSON.stringify(b.notes)}`],
        [c.got === C.K55_TWIN, `${C.K55_TWIN} (saved pre-rename spelling): ${c.got}, ${JSON.stringify(c.notes)}`]);
    }],
    ['L82q S4', '?table= with a pre-rename id builds its own scene entry, silently', async (env) => {
      const r = await query(env, 'fresh', 'diamond_proam_9ft');
      return fails([r.got === 'diamond_proam_9ft' && !r.notes.length, `${r.got}, notes ${JSON.stringify(r.notes)}`]);
    }],
    ['L82q unknown', '?table= with an id no scene spec names builds the pin, disclosed', async (env) => {
      const r = await query(env, 'fresh', 'no_such_table_9ft');
      return fails([r.got === PIN && r.notes.some((n) => n.includes('?table=no_such_table_9ft: no scene spec')), `${r.got}, notes ${JSON.stringify(r.notes)}`]);
    }],
    ['L82q S3', 'a ?table= boot on a scene without the resolvesTable probe (pre-rename) that built another table is disclosed by the query-mode drift gate', async (env) => {
      const M = await l82Main(ctx, env.src, 'fresh');
      M.armActiveTableMirror(l82Machine(), handle({ id: PIN }), { template: rack('fresh', 'pool_pro_9ft') }, { against: 'query', query: 'pool_pro_9ft' });
      const T = await l82TableBox(ctx, env.src, 'fresh', '');
      const N = await l82Main(ctx, env.src, 'fresh');
      N.armActiveTableMirror(l82Machine(), handle({ id: C.MEASURED, resolves: T.resolvableTableId }), { template: rack('fresh', C.MEASURED) }, { against: 'query', query: C.MEASURED });
      return fails([M.notes.some((n) => n.startsWith(`[table] ?table=pool_pro_9ft built ${PIN} (active-table drift gate)`)), `no note: ${JSON.stringify(M.notes)}`],
        [!M.reports.length, `reports ${JSON.stringify(M.reports)}`], [!N.notes.length && !N.reports.length, `a query the scene built: ${JSON.stringify(N.notes)} ${JSON.stringify(N.reports)}`]);
    }],
    ['L82q S4 settings', 'a ?table= boot is scripted-only: the scene mirrors its own id, a saved rack table that differs raises no drift', async (env) => {
      const M = await l82Main(ctx, env.src, 'fresh');
      M.armActiveTableMirror(l82Machine(), handle({ id: 'pool_pro_8ft' }), { template: rack('fresh', 'pool_pro_9ft') }, { against: 'query', query: 'pool_pro_8ft' });
      return fails([!M.reports.length && !M.notes.length, `${JSON.stringify(M.reports)} ${JSON.stringify(M.notes)}`]);
    }],
    ['L82q S4 boot', 'main.js boot() arms a ?table= boot in query mode, and under the mode it arms a saved rack table that differs from the query raises no drift', async (env) => {
      // the mode expression boot() passes (its fourth argument), evaluated for a user ?table= boot with a good rack
      const ast = await l82Ast(env.src.main);
      const boot = l82One(l82Find(ast, (n) => n.type === 'FunctionDeclaration' && n.id?.name === 'boot'), 'main.js boot()');
      const call = l82One(l82Find(boot, (n) => n.type === 'CallExpression' && n.callee?.name === 'armActiveTableMirror'), 'boot() armActiveTableMirror call');
      const vm = await import('node:vm');
      const arg = env.src.main.slice(call.arguments[3].start, call.arguments[3].end);
      const mode = vm.runInNewContext(`(${arg})`, { scripted: false, bootRackError: null, bootQ: new URLSearchParams('?table=pool_pro_8ft') });
      const M = await l82Main(ctx, env.src, 'fresh');
      M.armActiveTableMirror(l82Machine(), handle({ id: 'pool_pro_8ft' }), { template: rack('fresh', 'pool_pro_9ft') }, mode);
      return fails([mode?.against === 'query' && mode.query === 'pool_pro_8ft', `boot() arms ${JSON.stringify(mode)}`],
        [!M.reports.length && !M.notes.length, `${JSON.stringify(M.reports)} ${JSON.stringify(M.notes)}`]);
    }],
    ['L82m FRESH', 'a user boot mirrors the rack\'s table: a match is silent, a scene that built another table is drift naming both, with the reload recovery', async (env) => {
      const M = await l82Main(ctx, env.src, 'fresh');
      M.armActiveTableMirror(l82Machine(), handle({ id: 'pool_pro_9ft' }), { template: rack('fresh', 'pool_pro_9ft') }, { against: 'template' });
      const N = await l82Main(ctx, env.src, 'fresh');
      N.armActiveTableMirror(l82Machine(), handle({ id: 'wpa_spec_9ft' }), { template: rack('fresh', 'pool_pro_9ft') }, { against: 'template' });
      return fails([!M.reports.length, `match reported ${JSON.stringify(M.reports)}`],
        [N.reports.length === 1 && N.reports[0].m.includes("(scene 'wpa_spec_9ft' vs the rack's table 'pool_pro_9ft')") && N.reports[0].o?.reload === true, `mismatch: ${JSON.stringify(N.reports)}`]);
    }],
    ['L82m S2', 'a stale kernel: a scene table it rejects is reported; the pre-rename twin rack under the neutral scene id is silent', async (env) => {
      const M = await l82Main(ctx, env.src, 'stale');
      M.armActiveTableMirror(l82Machine(), handle({ id: C.K55 }), { template: rack('stale') }, { against: 'self' });
      const N = await l82Main(ctx, env.src, 'stale');
      N.armActiveTableMirror(l82Machine(), handle({ id: C.K55 }), { template: rack('stale', C.K55_TWIN) }, { against: 'template' });
      return fails([M.reports.length === 1 && M.reports[0].m.includes(`kernel rejects '${C.K55}'`), `rejected: ${JSON.stringify(M.reports)}`],
        [!N.reports.length, `twin reported ${JSON.stringify(N.reports)}`]);
    }],
    ['L82m S3', 'the pre-rename scene\'s boot table (its own resolver, nothing saved) under the fresh default rack is reported as drift, with the reload recovery', async (env) => {
      const sid = await staleBootId();
      const M = await l82Main(ctx, env.src, 'fresh');
      M.armActiveTableMirror(l82Machine(), handle({ id: sid }), { template: rack('fresh', ctx.TM.APP_DEFAULT_TABLE_ID) }, { against: 'template' });
      return fails([sid !== ctx.TM.APP_DEFAULT_TABLE_ID, `the stale scene built ${sid}`],
        [M.reports.length === 1 && M.reports[0].m.includes(`(scene '${sid}' vs the rack's table '${ctx.TM.APP_DEFAULT_TABLE_ID}')`) && M.reports[0].o?.reload === true, `${sid}: ${JSON.stringify(M.reports)}`]);
    }],
    ['L82m rerun', 'the template gate re-runs one microtask after every fresh rack (AIM with a seed, coalesced), never on a quiet or layout rack', async (env) => {
      const M = await l82Main(ctx, env.src, 'fresh'); const m = l82Machine(); const game = { template: rack('fresh', 'pool_pro_9ft') };
      M.armActiveTableMirror(m, handle({ id: 'pool_pro_9ft' }), game, { against: 'template' });
      const r0 = M.reports.length;
      game.template = rack('fresh', 'pool_pro_8ft');
      m.emit('AIM', { layout: true }); m.emit('AIM', undefined); m.emit('PLAYING', { seed: 1 }); await l82Tick();
      const r1 = M.reports.length;
      m.emit('AIM', { seed: 1 }); m.emit('AIM', { seed: 1 }); const sync = M.reports.length; await l82Tick();
      return fails([r0 === 0 && r1 === 0, `before a fresh rack: ${r0}, ${r1}`], [sync === 0, `ran synchronously (${sync})`],
        [M.reports.length === 1 && M.reports[0].m.includes("vs the rack's table 'pool_pro_8ft'"), `after the fresh rack: ${JSON.stringify(M.reports)}`]);
    }],
    ['L82m pending', 'a PENDING table is checked when ob:table-state turns READY (PENDING events wait, REFUSED drops the wait)', async (env) => {
      const M = await l82Main(ctx, env.src, 'fresh'); const h = { id: 'wpa_spec_9ft', status: 'PENDING' };
      M.armActiveTableMirror(l82Machine(), handle(h), { template: rack('fresh', 'pool_pro_9ft') }, { against: 'template' });
      const r0 = M.reports.length;
      M.window.dispatchEvent(new CustomEvent('ob:table-state', { detail: { status: 'PENDING' } })); const r1 = M.reports.length;
      h.status = 'READY'; M.window.dispatchEvent(new CustomEvent('ob:table-state', { detail: { status: 'READY' } })); const r2 = M.reports.length;
      M.window.dispatchEvent(new CustomEvent('ob:table-state', { detail: { status: 'READY' } }));
      const N = await l82Main(ctx, env.src, 'fresh'); const g = { id: 'wpa_spec_9ft', status: 'PENDING' };
      N.armActiveTableMirror(l82Machine(), handle(g), { template: rack('fresh', 'pool_pro_9ft') }, { against: 'template' });
      N.window.dispatchEvent(new CustomEvent('ob:table-state', { detail: { status: 'REFUSED' } }));
      g.status = 'READY'; N.window.dispatchEvent(new CustomEvent('ob:table-state', { detail: { status: 'READY' } }));
      return fails([r0 === 0 && r1 === 0, `while PENDING: ${r0}, ${r1}`], [r2 === 1 && M.reports.length === 1, `READY: ${r2}, then ${M.reports.length} (once)`],
        [!N.reports.length, `after REFUSED: ${JSON.stringify(N.reports)}`]);
    }],
    ['L82m refused', 'a refused boot rack: the boot check mirrors the scene\'s own id (silent), and the template gate still re-runs after the next fresh rack', async (env) => {
      const M = await l82Main(ctx, env.src, 'fresh'); const m = l82Machine(); const game = { template: rack('fresh', 'pool_pro_9ft') };
      M.armActiveTableMirror(m, handle({ id: 'pool_pro_8ft' }), game, { against: 'template', boot: 'self' });
      const r0 = M.reports.length;
      m.emit('AIM', { seed: 1 }); await l82Tick();
      return fails([r0 === 0, `the boot check reported ${JSON.stringify(M.reports)}`],
        [M.reports.length === 1 && M.reports[0].m.includes("(scene 'pool_pro_8ft' vs the rack's table 'pool_pro_9ft')"), `after the fresh rack: ${JSON.stringify(M.reports)}`]);
    }],
    ['L82m boot', 'main.js boot() arms the gate: a user boot mirrors the rack\'s table, a scripted boot its own id, a refused boot rack its own id at boot and the template after, a ?table= boot the query (its own id when the rack is refused)', async (env) => {
      const ast = await l82Ast(env.src.main);
      const boot = l82One(l82Find(ast, (n) => n.type === 'FunctionDeclaration' && n.id?.name === 'boot'), 'main.js boot()');
      const call = l82One(l82Find(boot, (n) => n.type === 'CallExpression' && n.callee?.name === 'armActiveTableMirror'), 'boot() armActiveTableMirror call');
      const direct = l82Find(boot, (n) => n.type === 'CallExpression' && n.callee?.name === 'checkActiveTableMirror');
      const arg = env.src.main.slice(call.arguments[3].start, call.arguments[3].end);
      const vm = await import('node:vm');
      const mode = (scripted, bootRackError, search) => JSON.stringify(vm.runInNewContext(`(${arg})`, { scripted, bootRackError, bootQ: new URLSearchParams(search) }));
      const want = { user: '{"against":"template"}', scripted: '{"against":"self"}', refused: '{"against":"template","boot":"self"}', query: '{"against":"query","query":"pool_pro_8ft"}',
        refusedQuery: '{"against":"self"}' };
      const got = { user: mode(false, null, ''), scripted: mode(true, null, '?table=pool_pro_8ft'), refused: mode(false, new Error('x'), ''), query: mode(false, null, '?table=pool_pro_8ft'),
        refusedQuery: mode(false, new Error('x'), '?table=pool_pro_8ft') };
      return fails([JSON.stringify(got) === JSON.stringify(want), `modes ${JSON.stringify(got)}`], [!direct.length, `boot() also calls checkActiveTableMirror directly (${direct.length})`]);
    }],
    ['L82b', 'bootRack: a refused boot rack is reported with the reload recovery and falls back to the kernel-default nine-ball rack; a good rack reports nothing', async (env) => {
      const M = await l82Main(ctx, env.src, 'fresh');
      const calls = [];
      const bad = { rerack() { calls.push('rerack'); throw new Error('unknown equipment table_id x'); }, setEquipment(s) { calls.push(`setEquipment ${s}`); },
        rerackKind(kind, seed) { calls.push(`rerackKind ${kind} ${seed}`); } };
      const e = M.bootRack(bad, 5);
      const r = M.reports.slice();
      const ok = M.bootRack({ rerack() {} }, 5);
      return fails([e instanceof Error || String(e).includes('unknown equipment'), `returned ${e}`],
        [r.length === 1 && r[0].o?.reload === true && r[0].m.includes('boot rack refused: unknown equipment table_id x') && r[0].m.startsWith('error.reloadMessage'), `reports ${JSON.stringify(r)}`],
        [calls.join(',') === 'rerack,setEquipment null,rerackKind nine 5', `calls ${calls.join(',')}`], [ok === null && M.reports.length === 1, `good rack: ${ok}, ${M.reports.length} report(s)`]);
    }],
    ['L82b boot', 'main.js boot() composes its first rack through bootRack only', async (env) => {
      const ast = await l82Ast(env.src.main);
      const boot = l82One(l82Find(ast, (n) => n.type === 'FunctionDeclaration' && n.id?.name === 'boot'), 'main.js boot()');
      const guarded = l82Find(boot, (n) => n.type === 'CallExpression' && n.callee?.name === 'bootRack');
      const raw = l82Find(boot, (n) => n.type === 'CallExpression' && n.callee?.type === 'MemberExpression' && n.callee.object?.name === 'game' && n.callee.property?.name === 'rerack');
      return fails([guarded.length === 1, `${guarded.length} bootRack call(s)`], [!raw.length, `${raw.length} unguarded game.rerack call(s) in boot()`]);
    }],
    ['L82s E6', 'settings.js: a refused boot staging rack is disclosed on the console and on the ob:table-refused wire with the reload recovery', async (env) => {
      const mod = await l81Module(env.src.settings);
      const B = await l81Boot(ctx, mod, { k: 'fresh', c: 'fresh', scene: 'fresh', blob: { game: 'eight_ball' }, rerackThrows: 'unknown equipment table_id x' });
      await l82Tick();
      const ev = B.events.filter((e) => e.type === 'ob:table-refused');
      const G = await l81Boot(ctx, mod, { k: 'fresh', c: 'fresh', scene: 'fresh', blob: { game: 'eight_ball' } });
      await l82Tick();
      return fails([B.game.games.includes('eight_ball'), `staged ${JSON.stringify(B.game.games)}`],
        [B.notes.some((n) => n.startsWith('[settings] boot game staging failed — the boot rack stands:') && n.includes('unknown equipment table_id x')), `no note: ${JSON.stringify(B.notes)}`],
        [ev.length === 1 && ev[0].detail?.recovery === 'reload' && ev[0].detail?.message === 'error.reloadMessage'
          && String(ev[0].detail?.error?.message).includes('unknown equipment table_id x'), `events ${JSON.stringify(ev.map((e) => [e.detail?.message, String(e.detail?.error?.message)]))}`],
        [G.game.reracks === 1 && !G.events.some((e) => e.type === 'ob:table-refused'), `good staging: ${G.game.reracks} rerack(s), ${G.events.length} event(s)`]);
    }],
    ['L82k FRESH', 'each kernel->scene seam re-racks, then broadcasts the new rack\'s table', async (env) => {
      const s = await seams(env, 'fresh', 'pool_pro_9ft');
      const bad = Object.entries(s).filter(([, r]) => r.threw || r.log.length !== 2 || !/^rerack/.test(r.log[0]) || r.log[1] !== 'broadcast pool_pro_9ft');
      return fails([!bad.length, bad.map(([n, r]) => `${n}: ${r.threw ?? ''} ${r.log.join(' > ')}`).join('; ')]);
    }],
    ['L82k S2', 'a stale kernel refusing the rack: no seam broadcasts (the scene keeps its table)', async (env) => {
      const s = await seams(env, 'stale', C.K55);
      const bad = Object.entries(s).filter(([, r]) => r.log.some((l) => l.startsWith('broadcast')) || !/^rerack/.test(r.log[0] ?? ''));
      return fails([!bad.length, bad.map(([n, r]) => `${n}: ${r.log.join(' > ')}`).join('; ')],
        [s.caromActivate.ret === false && s.caromActivate.reported.length === 1, `caromActivate ${s.caromActivate.ret}, ${JSON.stringify(s.caromActivate.reported)}`],
        [!!s.rerackKind.threw && !!s.activateSnooker.threw && s.drills.ret === false, `rerackKind ${s.rerackKind.threw}, activateSnooker ${s.activateSnooker.threw}, drills ${s.drills.ret}`]);
    }],
  ];
}
async function l82Run(ctx, plant = null) {
  const { src, anchorFound } = l82Sources(plant);
  const env = { src };
  const results = [];
  for (const [key, title, body] of l82Scenarios(ctx)) {
    let detail;
    try { detail = await body(env); } catch (e) { detail = `threw: ${(e && e.message) || e}`; }
    results.push({ key, title: `${key}: ${title}`, ok: !detail, detail });
  }
  return { results, anchorFound };
}
function l82Guards(ctx, report) {
  const { src } = l82Sources(null);
  let n = 0; let err = '';
  try { l82Nested(src.table, 'prepareEquipment'); l82Nested(ctx.staleScene ?? '', 'prepareEquipment'); n = 2; } catch (e) { err = String(e.message ?? e); }
  report('L82-0 slices', 'L82-0 prepareEquipment is sliced from the fresh scene and from 7352fa8e', n === 2 && !ctx.errors['stale scene source'] && !ctx.errors['stale kernel'], err || JSON.stringify(ctx.errors));
  console.log('L82-0 note: the scene mirror is the fresh makeGeom (for the pre-rename scene\'s boot table too, a model of its numbers); the builder state around prepareEquipment is stubs; the seams\' game is a stub whose rerack composes on a real kernel');
}
async function l82Check(ctx, run, report) {
  for (const r of run.results) report(r.key, r.title, r.ok, r.detail);
}
// --selftest-drift: each plant turns one gate off in one file's text (an anchor not found exactly once makes the plant INVALID).
// CAUGHT only when the control is green and the failing key set equals the expected set.
async function l82DriftSelftest() {
  const tag = '[L82 selftest-drift]';
  const ctx = await l80Context();
  const collect = async (plant) => { const run = await l82Run(ctx, plant); const rows = []; await l82Check(ctx, run, (key, name, ok, detail = '') => rows.push({ key, ok, line: checkLine(name, ok, detail) })); return { rows, anchorFound: run.anchorFound }; };
  const control = (await collect(null)).rows; const controlFails = control.filter((r) => !r.ok);
  const plants = [
    // E8: the ?table= branch back to the pre-stage rule (TABLE_SPECS only): the kernel axis and the disclosure go
    { name: 'E8-query-ungated', file: 'table', anchor: 'if (qc) return bootQueryTableId(qc);', replacement: 'if (qc) return TABLE_SPECS[qc] ? qc : SCRIPTED_PIN_TABLE_ID;', expected: ['L82q S2', 'L82q unknown'] },
    // E8: the pre-rename twin rung off: a table the loaded kernel lacks lands on the pin
    { name: 'E8-no-twin', file: 'table', anchor: 'if (TABLE_SPECS[id] && back && TABLE_SPECS[back] && kernelTableKnown(back) === true) {', replacement: 'if (false) {', expected: ['L82q S2'] },
    // E9: the live-switch refusal off: an unknown id builds the pin READY under the switch
    { name: 'E9-no-refusal', file: 'table', anchor: 'if (id && unbuildable && !boot) {', replacement: 'if (false) {', expected: ['L82p FRESH', 'L82p S2'] },
    // E9: the boot build substitutes the pin silently
    { name: 'E9-boot-silent', file: 'table', anchor: 'if (id && !TABLE_SPECS[id]) console.warn(', replacement: 'if (false) console.warn(', expected: ['L82p boot'] },
    // E9: the kernel axis off at the sink: a table the loaded kernel lacks builds READY
    { name: 'E9-no-kernel-axis', file: 'table', anchor: ": kernelTableKnown(id) === false && kernelTableKnown(value?.table_id) !== true ? 'the loaded kernel lacks it' : null;", replacement: ': null;', expected: ['L82p S2'] },
    // E9: the kernel axis asks only the canonical id again: a retired id the stale kernel lists is refused
    { name: 'E9-raw-id-blind', file: 'table', anchor: ' && kernelTableKnown(value?.table_id) !== true', replacement: '', expected: ['L82p S2 retired'] },
    // E10: the gate compares the scene with its own id again (the pre-stage self-compare)
    { name: 'E10-self-compare', file: 'main', anchor: "const rackId = mode.against === 'template' ? template.system.equipment?.table_id ?? null : null;", replacement: 'const rackId = null;',
      expected: ['L82m FRESH', 'L82m S2', 'L82m S3', 'L82m rerun', 'L82m pending', 'L82m refused'] },
    // E7.S3: the scene/rack split is reported without the reload recovery
    { name: 'E7-no-reload', file: 'main', anchor: ", { reload: which !== '' });", replacement: ');', expected: ['L82m FRESH', 'L82m S3'] },
    // E10: boot-only again: a fresh rack never re-runs the gate
    { name: 'E10-no-rerun', file: 'main', anchor: 'queueMicrotask(() => run(each));', replacement: '', expected: ['L82m rerun', 'L82m refused'] },
    // E10: a PENDING table is never checked once it turns READY
    { name: 'E10-no-ready-wait', file: 'main', anchor: "if (e?.detail?.status === 'READY') run(m);", replacement: '', expected: ['L82m pending'] },
    // E8.S3: the query-mode substitution goes silent
    // E8.S4: a user ?table= boot arms the template gate again (a saved rack table that differs from the query is drift)
    { name: 'E8-query-mode', file: 'main', anchor: ": { against: 'query', query: bootQ.get('table') })", replacement: ": { against: 'template' })",
      expected: ['L82m boot', 'L82q S4 boot'] },
    { name: 'E8-query-silent', file: 'main', anchor: 'if (want !== gm.id) console.warn(', replacement: 'if (false) console.warn(', expected: ['L82q S3'] },
    // E10: a refused boot rack arms the template gate against a rack that never composed
    // E10: a refused boot rack mirrors its own id for good again: the template gate is never armed after it
    { name: 'E10-boot-mode', file: 'main', anchor: "bootRackError ? { against: 'template', boot: 'self' }", replacement: "bootRackError ? { against: 'self' }", expected: ['L82m boot'] },
    // E10: the boot override is ignored: a refused boot rack's boot check mirrors a template it never racked
    { name: 'E10-boot-override', file: 'main', anchor: 'run(boot ? { ...each, against: boot } : each);', replacement: 'run(each);', expected: ['L82m refused'] },
    // E6: bootRack reports but keeps no rack (no kernel-default fallback)
    { name: 'E6-no-fallback', file: 'main', anchor: "game.rerackKind?.('nine', seed);", replacement: '', expected: ['L82b'] },
    // E6: boot() racks unguarded again
    { name: 'E6-boot-unguarded', file: 'main', anchor: 'const bootRackError = bootRack(game, seed);', replacement: 'const bootRackError = null; game.rerack(seed);', expected: ['L82b boot'] },
    // E6: the settings staging catch swallows the refusal again
    { name: 'E6-staging-swallowed', file: 'settings', anchor: '}).catch((error) => {\n      // #789 (E6)', replacement: '}).catch((error) => { return;\n      // #789 (E6)', expected: ['L82s E6'] },
    // E22.S2: rerackKind broadcasts without re-racking (the old template reaches the scene)
    { name: 'E22-rerackKind', file: 'main', anchor: '      game.rerackKind(kind, seed);\n', replacement: '', expected: ['L82k FRESH', 'L82k S2'] },
    // E22.S2: activateSnooker broadcasts without re-racking
    { name: 'E22-activateSnooker', file: 'flow', anchor: '      game.rerack(game.seed);\n      // rebuild the VISUAL table', replacement: '      // rebuild the VISUAL table', expected: ['L82k FRESH', 'L82k S2'] },
    // E22.S2: caromActivate broadcasts without re-racking
    { name: 'E22-caromActivate', file: 'flow', anchor: "        game.rerack(seed);\n      } catch (e) {\n        reportError('carom activate", replacement: "      } catch (e) {\n        reportError('carom activate", expected: ['L82k FRESH', 'L82k S2'] },
    // E22.S2: the drills stale-settings pin broadcasts the old rack after a refused setGame
    { name: 'E22-drills-ok', file: 'drills', anchor: 'if (ok && eq?.table_id) {', replacement: 'if (eq?.table_id) {', expected: ['L82k S2'] },
  ];
  let caught = 0;
  for (const p of plants) {
    console.log(`${tag} plant ${p.name}: ${p.file} anchor ${JSON.stringify(p.anchor)}; control: ${control.length} checks, ${controlFails.length} failure(s)`);
    const { rows, anchorFound } = await collect(p);
    if (!anchorFound || controlFails.length) {
      for (const r of controlFails) console.log(`${tag} control ${l80Scrub(ctx, r.line)}`);
      console.log(`${tag} ${p.name} INVALID: ${controlFails.length ? 'the control is red' : 'the anchor is not found exactly once in the file'}`);
      continue;
    }
    const fails = rows.filter((r) => !r.ok);
    const got = [...new Set(fails.map((r) => r.key))].sort(); const want = [...new Set(p.expected)].sort();
    if (fails.length && got.length === want.length && got.every((k, i) => k === want[i])) { caught += 1; for (const r of fails) console.log(`${tag} ${p.name} CAUGHT: ${l80Scrub(ctx, r.line)}`); }
    else {
      console.log(`${tag} ${p.name} NOT CAUGHT: failing keys {${got.join(' | ')}}, expected {${want.join(' | ')}}`);
      for (const r of fails) console.log(`${tag} ${p.name} fixture ${l80Scrub(ctx, r.line)}`);
    }
  }
  const counted = plants.length === l82Consts().PLANT_COUNT;
  console.log(`${tag} ${caught} of ${plants.length} plants caught; ${plants.length} plant(s) declared, ${l82Consts().PLANT_COUNT} required${counted ? '' : ' (COUNT MISMATCH)'}`);
  return caught === plants.length && counted ? 0 : 1;
}

// L83 (#789, the share-persist stage of the mixed-cache census): the boot write-back, the heyball boot fallback, the share /
// replay import, the replay exit restore, the archive swap and the atelier listing, each judged by the settings predicate per
// census column. Settings-side sessions boot the whole settings.js module (l81Boot); the consumers' helpers are top-level
// functions sliced verbatim with acorn from web/app/share.js (replayEquipmentRefusal, staleCatalogRejection) and atelier.js
// (equipmentPickRefused) and called with the booted settings api; playback.js swapBed (nested in createPlayback, its gate
// inline) is sliced verbatim and run with that api as window.__settings over a recording game stub; the call sites (share.js
// startReplay and the decode catch, the swapBed gate's place, the two atelier disabled rules) are checked in the AST.
// --selftest-drift plants turn one gate off each (l83DriftSelftest).
function l83Consts() {
  const C = l81Consts();
  return {
    FILES: { share: ['app', 'share.js'], playback: ['app', 'playback.js'], atelier: ['app', 'atelier.js'] },
    NESTED: { playback: ['swapBed'] },
    HELPERS: { share: ['REPLAY_EQUIPMENT_KIND', 'replayEquipmentRefusal', 'staleCatalogRejection'], atelier: ['equipmentPickRefused', 'tableOutOfClass'] },
    // a saved heyball session over fresh-only ids (a stale sibling degrades them) and over pre-rename ids (fresh siblings migrate)
    HB1: { game: 'heyball', equipment: C.B1.equipment },
    HB4: { game: 'heyball', equipment: C.B4.equipment },
    // a neutral table the archived kernel and the pre-rename scene both lack (each has a pre-rename twin)
    TABLE: 'pool_pro_7ft',
    // E21: a visible table outside the nine_ball class
    OUT: 'wpbsa_snooker_12ft',
    // E17.S2 kernel-known: the recorded b6b5dc3f share (legacy-links.json) whose event stream kernel-corpus.json pins, and the
    // same share over the retired cloth id (ctx.retired.cloth_id, recovered from catalog.rs by its digest, never written here).
    // No recorded share carries that cloth: its pin is a golden, the archived kernel's own event stream for that spec, which the
    // cloth's twin (the settings degrade) does not reproduce
    RECORD: 'v7-retired-table-id-b6b5dc3f',
    CLOTH_TWIN: 'simonis_860_tournament',
    CLOTH_EVENTS_SHA256: '9f0590459c6902a8987ec143914ed22b8d5b0aefeb5d3c5931ad4f613baaee4e',
    PLANT_COUNT: 36,
  };
}
// The consumer sources and the whole settings module; a plant edits one file's text (its anchor must occur exactly once).
async function l83Sources(plant) {
  const src = {};
  for (const [key, parts] of Object.entries(l83Consts().FILES)) src[key] = fs.readFileSync(path.join(ROOT, ...parts), 'utf8');
  const mod = await l81Module(fs.readFileSync(path.join(ROOT, 'app', 'settings.js'), 'utf8'));
  let anchorFound = true;
  if (plant && plant.file === 'settings') {
    anchorFound = mod.code.split(plant.anchor).length === 2; mod.code = mod.code.replace(plant.anchor, () => plant.replacement);
  } else if (plant) {
    anchorFound = src[plant.file].split(plant.anchor).length === 2; src[plant.file] = src[plant.file].replace(plant.anchor, () => plant.replacement);
  }
  return { src, mod, anchorFound };
}
// The named top-level declarations of one consumer, verbatim, evaluated together in a vm: { name: value }.
async function l83Helpers(src, names) {
  const vm = await import('node:vm');
  const ast = await l82Ast(src);
  const parts = names.map((n) => {
    const hits = ast.body.filter((d) => (d.type === 'FunctionDeclaration' && d.id.name === n)
      || (d.type === 'VariableDeclaration' && d.declarations.some((v) => v.id.name === n)));
    return src.slice(l82One(hits, `top-level ${n}`).start, hits[0].end);
  });
  const box = vm.createContext({});
  vm.runInContext(`${parts.join('\n')}\nglobalThis.__out = { ${names.join(', ')} };`, box);
  return box.__out;
}
// playback.js swapBed, verbatim (l82Nested), run in a fresh vm with `api` as window.__settings over a game stub that records
// each re-equip: { ret: swapBed's return, equipped: the setEquipment calls it made }.
async function l83SwapBed(src) {
  const vm = await import('node:vm');
  const text = l82Nested(src, 'swapBed');
  return (api, equipment) => {
    const equips = []; const warns = [];
    const game = { equipment: null, template: null, setEquipment(e) { equips.push(e); }, rerackKind() {} };
    const box = vm.createContext({ window: { __settings: api }, console: { warn: (...a) => { warns.push(a.map(String).join(' ')); } }, game, rebroadcastEquipment: () => null });
    vm.runInContext(`${text}\nglobalThis.__swap = swapBed;`, box);
    return { ret: box.__swap('nine_ball', 1, equipment), equipped: equips.length, warns };
  };
}
// the one node of `type` declaring `name` under `ast` (function declarations: hoisted, the drift selftest runs before this line)
function l83Named(ast, type, name) { return l82One(l82Find(ast, (n) => n.type === type && n.id?.name === name), `${type} ${name}`); }
// every plain call of `name` under `node`
function l83Calls(node, name) { return l82Find(node, (n) => n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === name); }
// the statement of `fn`'s body that declares `name` from a call of `callee`, and whether the next statement is an if that returns
function l83GuardAt(fn, name, callee) {
  const body = fn.body.body;
  const i = body.findIndex((s) => s.type === 'VariableDeclaration' && s.declarations.some((d) => d.id.name === name
    && d.init?.type === 'CallExpression' && d.init.callee.name === callee));
  const next = body[i + 1];
  const returns = i >= 0 && next?.type === 'IfStatement' && l82Find(next.consequent, (n) => n.type === 'ReturnStatement').length > 0;
  return { at: i < 0 ? -1 : body[i].start, returns };
}
// The sessions: [key, title, cell, extra cfg, body]; body(B, env) returns '' when every claim holds, else what failed.
function l83Scenarios(ctx) {
  const C = l81Consts(); const L = l83Consts();
  const fails = (...claims) => claims.filter(([ok]) => !ok).map(([, m]) => m).join('; ');
  const blobOf = (B) => B.store.get('ob-settings-v1') ?? null;
  const noteText = (B) => JSON.stringify(B.notes);
  const fallbackNote = (B) => B.notes.some((n) => n.includes('heyball needs the GH-491 flow adapter chain'));
  // E16 under a stale sibling: the fallback plays nine_ball this session and the saved heyball blob stays byte-identical; a
  // later ordinary persist (a sound toggle) stores the toggle and still the saved heyball game with its spec as the top level
  const heldFallback = (B) => {
    const boot = fails([B.api.get().game === 'nine_ball', `plays ${B.api.get().game}`], [fallbackNote(B), `no fallback note: ${noteText(B)}`],
      [blobOf(B) === JSON.stringify(L.HB1), `the blob was rewritten: ${blobOf(B)}`]);
    const sound = !B.api.get().soundOn;
    B.api.set('soundOn', sound);
    const st = B.stored() ?? {};
    return fails([!boot, boot], [st.soundOn === sound, `the toggle stored soundOn ${st.soundOn}`],
      [st.game === 'heyball', `the later persist stored game ${st.game}`],
      [JSON.stringify(st.equipment) === JSON.stringify(st.equipmentByGame?.heyball), `stored top-level ${JSON.stringify(st.equipment)}, heyball ${JSON.stringify(st.equipmentByGame?.heyball)}`]);
  };
  // E18: a replay's transient equipment, then the exit restore: the boot-shown spec again, nothing stored, the rack composes
  const restore = async (B, sender) => {
    const shown0 = JSON.stringify(B.shown()); const blob0 = blobOf(B);
    const a = await B.api.setTransientEquipment(sender(B.shown()));
    const during = JSON.stringify(B.shown());
    const r = await B.api.restorePersistedEquipment();
    let rack = '';
    try { B.game.rerack(); } catch (e) { rack = String(e?.message ?? e); }
    return fails([a !== false && during !== shown0, `transient ${JSON.stringify(a)}, shows ${during}`],
      [r !== false && JSON.stringify(B.shown()) === shown0, `restore ${JSON.stringify(r)}, shows ${JSON.stringify(B.shown())} (want ${shown0})`],
      [blobOf(B) === blob0, `stored ${blobOf(B)}`], [!rack, `the restored rack refused: ${rack}`]);
  };
  const otherCloth = (eq) => ({ ...eq, cloth_id: 'worn_slow' });
  const refusesTable = (fn, B) => { const r = fn(B.api, { table_id: L.TABLE }); return [typeof r === 'string' && r.includes(L.TABLE), `returned ${JSON.stringify(r)}`]; };
  // E19: the archived tag through swapBed: refused (the 'refused' sentinel; the table is named on the console only) before
  // any re-equip, or staged (one re-equip)
  // E17.S2 kernel-known: the recorded share re-simulated on the archived kernel over a rack it composes for `spec` (table,
  // cloth, options and ball params from the spec; the recorded ball states and shot): the events JSON and its sha256
  const record = (() => {
    const links = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'fixtures', 'legacy-links.json'), 'utf8'));
    const e = (Array.isArray(links) ? links : links.entries).find((x) => x.name === L.RECORD);
    const pins = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'fixtures', 'kernel-corpus.json'), 'utf8'));
    const pin = JSON.stringify(pins).match(new RegExp(`"name":"${L.RECORD}#0"[^}]*"events_sha256":"([0-9a-f]{64})"`));
    return { equipment: e.decoded.equipment, seed: e.decoded.seed, scenario: JSON.parse(e.scenarios[0]), eventsSha: pin?.[1] ?? null };
  })();
  const simulate = (spec) => {
    const eng = ctx.kernels.stale; const R = eng.nineBallRack(record.seed, spec);
    const balls = R.system.balls.map((b, i) => ({ ...b, state: record.scenario.system.balls[i].state }));
    const events = JSON.stringify(JSON.parse(eng.simulateJson(JSON.stringify({ system: { ...R.system, balls }, shot: record.scenario.shot, options: R.options }))).events);
    return { events, sha: createHash('sha256').update(events).digest('hex') };
  };
  // E21: the six renamed tables under a half-stale SDK (the games module or the equipment catalog stale, not both). The card id
  // is the id the loaded catalog offers (the neutral id, else its pre-rename id); a cell is half-stale only when some card id is
  // outside the class as given. Each card is enabled (tableOutOfClass, then the predicate), changeEquipment and preview.stage
  // commit it (the shown table is the card's table or its renamed twin), and the class law still holds (L.OUT stays out).
  const renames = ctx.EA.TABLE_RENAMES;
  const sameTable = (a, b) => ctx.EA.renamedTableId(a) === ctx.EA.renamedTableId(b);
  const e21Ids = (B) => Object.keys(renames).map((o) => (B.stubs.catalogEntry('table_id', renames[o]) ? renames[o] : o)).filter((id) => B.stubs.catalogEntry('table_id', id));
  const e21Legal = (B) => { const tc = B.stubs.getGameEntry(B.api.get().game).table_class; return tc.kind === 'catalog' ? tc.table_ids : null; };
  const e21Cards = (B, env) => {
    const legal = e21Legal(B); const ids = e21Ids(B);
    const off = ids.filter((id) => env.atelier.tableOutOfClass(B.api, legal, id) || env.atelier.equipmentPickRefused(B.api, 'table_id', id));
    return fails([ids.length === 6, `${ids.length} renamed table card(s): ${ids.join(', ')}`],
      [!!legal && ids.some((id) => !legal.includes(id)), `not half-stale: every card id is in the class as given (${JSON.stringify(legal)})`],
      [off.length === 0, `disabled: ${off.join(', ')}`], [env.atelier.tableOutOfClass(B.api, legal, L.OUT) === true, `${L.OUT} is enabled under ${B.api.get().game}`]);
  };
  const e21Commit = async (B, stage) => {
    const legal = e21Legal(B); const ids = e21Ids(B); const bad = [];
    for (const id of ids) {
      let r = stage ? B.api.preview.stage('table_id', id) : await B.api.changeEquipment('table_id', id, { skipConfirm: true });
      if (stage && r !== false) r = await B.api.preview.keep({ skipConfirm: true });
      if (r === false || !sameTable(B.shown().table_id, id)) bad.push(`${id}: ${JSON.stringify(r)}, shows ${B.shown().table_id}`);
    }
    const o = stage ? B.api.preview.stage('table_id', L.OUT) : await B.api.changeEquipment('table_id', L.OUT, { skipConfirm: true });
    return fails([ids.length === 6, `${ids.length} renamed table(s)`], [!!legal && ids.some((id) => !legal.includes(id)), 'not half-stale'],
      [bad.length === 0, `not committed: ${bad.join('; ')}`], [o === false, `${L.OUT} ${stage ? 'staged' : 'committed'} under ${B.api.get().game}: ${JSON.stringify(o)}`]);
  };
  const swapRefuses = (env, B) => { const r = env.swapBed(B.api, { table_id: L.TABLE });
    return fails([r.ret === 'refused' && r.equipped === 0, `returned ${JSON.stringify(r.ret)} after ${r.equipped} re-equip(s)`],
      [r.warns.length === 1 && r.warns[0].includes(L.TABLE), `console ${JSON.stringify(r.warns)} (want one warning naming ${L.TABLE})`]); };
  return [
    ['L83 E4 S3', 'a pre-rename scene degrades saved fresh ids at load: the blob is held (no write-back) and the twin shown', 'S3', { blob: C.B1 }, async (B) => fails(
      [blobOf(B) === JSON.stringify(C.B1), `the boot wrote the blob back: ${blobOf(B)}`],
      [B.shown().table_id === 'diamond_proam_8ft', `shows ${B.shown().table_id} (want the pre-rename twin diamond_proam_8ft)`])],
    ['L83 E16 S1', 'a stale SDK catalog and a stale flow.js: the heyball fallback plays nine_ball and keeps the saved blob', 'S1', { blob: L.HB1, noHeyball: true }, async (B) => heldFallback(B)],
    ['L83 E16 S2', 'a stale kernel and a stale flow.js: the heyball fallback plays nine_ball and keeps the saved blob', 'S2', { blob: L.HB1, noHeyball: true }, async (B) => heldFallback(B)],
    ['L83 E16 S3', 'a pre-rename scene and a stale flow.js: the heyball fallback plays nine_ball and keeps the saved blob', 'S3', { blob: L.HB1, noHeyball: true }, async (B) => heldFallback(B)],
    ['L83 E16 release', 'a stale SDK catalog and a stale flow.js: explicit game commits after the fallback release the held game', 'S1', { blob: L.HB1, noHeyball: true }, async (B) => {
      const g = [await B.api.changeGame('eight_ball', { skipConfirm: true }), await B.api.changeGame('nine_ball', { skipConfirm: true })];
      B.api.set('soundOn', !B.api.get().soundOn);
      const st = B.stored() ?? {};
      return fails([g.every((x) => x === true) && B.api.get().game === 'nine_ball', `changeGame ${g.join(', ')}, plays ${B.api.get().game}`], [st.game === 'nine_ball', `stored game ${st.game}`]);
    }],
    ['L83 E16 S4', 'saved pre-rename ids, fresh siblings, a stale flow.js: the fallback plays nine_ball, the saved heyball game stays held with the migrated ids', 'FRESH', { blob: L.HB4, noHeyball: true }, async (B) => {
      const st0 = B.stored() ?? {};
      const boot = fails([B.api.get().game === 'nine_ball', `plays ${B.api.get().game}`], [fallbackNote(B), `no fallback note: ${noteText(B)}`],
        [st0.game === 'heyball', `the fallback stored game ${st0.game}`],
        [!Object.values(st0.equipment ?? {}).includes(C.B4.equipment.table_id), `stored the pre-rename table: ${JSON.stringify(st0.equipment)}`]);
      const sound = !B.api.get().soundOn;
      B.api.set('soundOn', sound);
      const st = B.stored() ?? {};
      return fails([!boot, boot], [st.soundOn === sound, `the toggle stored soundOn ${st.soundOn}`], [st.game === 'heyball', `the later persist stored game ${st.game}`],
        [JSON.stringify(st.equipment) === JSON.stringify(st.equipmentByGame?.heyball), `stored top-level ${JSON.stringify(st.equipment)}, heyball ${JSON.stringify(st.equipmentByGame?.heyball)}`]);
    }],
    ['L83 E17 FRESH', 'every sibling fresh: the sender\'s neutral table replays', 'FRESH', {}, async (B, env) => {
      const r = env.share.replayEquipmentRefusal(B.api, { table_id: L.TABLE });
      return fails([r === null, `refused: ${r}`]);
    }],
    ['L83 E17 S2', 'a stale kernel: the sender\'s table it lacks is refused before setTransientEquipment (no twin replay)', 'S2', {}, async (B, env) => {
      const built0 = B.scene.built.length;
      return fails(refusesTable(env.share.replayEquipmentRefusal, B), [B.scene.built.length === built0, `prepared ${B.scene.built.slice(built0).join(', ')}`]);
    }],
    ['L83 E17 S2 kernel-known', 'a stale kernel: the sender\'s retired ids it lists replay verbatim (no twin), the replayed event stream equal to the pinned one (kernel-corpus.json for the recorded share; a golden its twin misses for the retired cloth); a cloth it lacks is refused before setTransientEquipment', 'S2', {}, async (B, env) => {
      const out = [];
      const legs = [['the recorded share', record.equipment, record.eventsSha, null],
        ['the retired cloth', { ...record.equipment, cloth_id: ctx.retired.cloth_id }, L.CLOTH_EVENTS_SHA256, { ...record.equipment, cloth_id: L.CLOTH_TWIN }]];
      for (const [label, sender, sha, twin] of legs) {
        const r = env.share.replayEquipmentRefusal(B.api, sender);
        const a = await B.api.setTransientEquipment(sender);
        const applied = B.game.spec ?? {};
        const mine = simulate(applied);
        out.push([r === null, `${label}: refused: ${r}`], [a !== false, `${label}: transient ${JSON.stringify(a)}`],
          [Object.entries(sender).every(([axis, id]) => applied[axis] === id), `${label}: applied ${JSON.stringify(applied)} (want ${JSON.stringify(sender)})`],
          [typeof sha === 'string' && mine.sha === sha, `${label}: replayed events ${mine.sha} (pinned ${sha})`]);
        if (twin) { const t = simulate(twin).sha; out.push([t !== sha, `${label}: the twin replays the pinned stream too (${t}): the pin cannot tell a twin from the sender's id`]); }
      }
      const spec0 = JSON.stringify(B.game.spec); const built0 = B.scene.built.length;
      const r = env.share.replayEquipmentRefusal(B.api, { ...record.equipment, cloth_id: 'pool_worsted_fast' });
      out.push([typeof r === 'string' && r.includes('pool_worsted_fast'), `a cloth the kernel lacks: returned ${JSON.stringify(r)}`],
        [JSON.stringify(B.game.spec) === spec0 && B.scene.built.length === built0, `the refusal applied ${JSON.stringify(B.game.spec)}, prepared ${B.scene.built.slice(built0).join(', ')}`]);
      return fails(...out);
    }],
    ['L83 E17 S3', 'a pre-rename scene: the sender\'s neutral table it cannot build is refused (no twin replay), nothing prepared or stored', 'S3', {}, async (B, env) => {
      const blob0 = blobOf(B); const built0 = B.scene.built.length;
      const r = env.share.replayEquipmentRefusal(B.api, { table_id: L.TABLE });
      const a = await B.api.setTransientEquipment({ ...B.shown(), table_id: L.TABLE });
      return fails([typeof r === 'string' && r.includes(L.TABLE), `returned ${JSON.stringify(r)}`],
        [a === false && B.scene.built.length === built0, `transient ${JSON.stringify(a)}, built ${B.scene.built.slice(built0).join(', ')}`],
        [blobOf(B) === blob0, `stored ${blobOf(B)}`]);
    }],
    ['L83 E17 S1', 'a stale SDK catalog: a decode rejection naming an id the kernel lists is a stale cache (reload copy); an unknown id is a bad link', 'S1', {}, async (B, env) => {
      const f = env.share.staleCatalogRejection;
      const a = f(B.api, new Error(`unknown equipment tables id '${L.TABLE}'`));
      const b = f(B.api, new Error('unknown equipment tables id \'no_such_table\''));
      const c = f(B.api, new Error('bad envelope'));
      return fails([typeof a === 'string' && a.length > 0, `stale catalog read as ${JSON.stringify(a)}`], [b === null, `an unknown id read as ${JSON.stringify(b)}`], [c === null, `a bad envelope read as ${JSON.stringify(c)}`]);
    }],
    ['L83 E17 S1 decoded', 'a stale SDK catalog, fresh kernel: a decoded share replays on the sender\'s ids verbatim, an id the cached catalog lacks but the kernel lists included (disclosed, no twin)', 'S1', {}, async (B, env) => {
      const out = [];
      for (const [label, sender] of [['the recorded share', record.equipment], ['a kernel-listed table the cached catalog lacks', { ...record.equipment, table_id: L.TABLE }]]) {
        const r = env.share.replayEquipmentRefusal(B.api, sender);
        const a = await B.api.setTransientEquipment(sender);
        const applied = B.game.spec ?? {};
        out.push([r === null, `${label}: refused: ${r}`], [a !== false, `${label}: transient ${JSON.stringify(a)}`],
          [Object.entries(sender).every(([axis, id]) => applied[axis] === id), `${label}: applied ${JSON.stringify(applied)} (want ${JSON.stringify(sender)})`]);
      }
      return fails(...out);
    }],
    ['L83 E17 order', 'share.js: startReplay refuses through the predicate before kernelGate, and the decode catch reads a stale catalog first', null, null, async (B, env) => {
      const fn = l83Named(env.ast.share, 'FunctionDeclaration', 'startReplay');
      const g = l83GuardAt(fn, 'refusal', 'replayEquipmentRefusal');
      const gate = l83Calls(fn, 'kernelGate')[0];
      // the decode catch: shows the badLink toast and resolves the boot intent (GH-525); the innermost such catch
      const catches = l82Find(env.ast.share, (n) => n.type === 'CatchClause' && env.src.share.slice(n.start, n.end).includes("t('share.badLink'")
        && env.src.share.slice(n.start, n.end).includes('shellBootIntent = false'));
      const katch = l82One(catches.filter((c) => !catches.some((o) => o !== c && o.start >= c.start && o.end <= c.end)), 'the decode badLink catch');
      const stale = l83Calls(katch, 'staleCatalogRejection');
      return fails([g.at >= 0 && g.returns && gate && g.at < gate.start, `refusal at ${g.at} (returns ${g.returns}), kernelGate at ${gate?.start}`],
        [stale.length === 1, `${stale.length} staleCatalogRejection call(s) in the decode catch`]);
    }],
    ['L83 E17 toast', 'share.js: the replay refusals (startReplay\'s predicate refusal and the decode catch\'s stale catalog) toast share.stagingRefused inside error.reloadMessage, never bare', null, null, async (B, env) => {
      // showToast(t('error.reloadMessage', { message: t('share.stagingRefused') })): the reload composite, the only copy
      const tCall = (n, key) => n?.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === 't' && n.arguments[0]?.value === key;
      const composite = (c) => tCall(c.arguments[0], 'error.reloadMessage') && c.arguments[0].arguments[1]?.type === 'ObjectExpression'
        && c.arguments[0].arguments[1].properties.some((p) => p.key?.name === 'message' && tCall(p.value, 'share.stagingRefused'));
      const toasts = (node) => { const all = l83Calls(node, 'showToast'); return { all: all.length, composite: all.filter(composite).length }; };
      const fn = l83Named(env.ast.share, 'FunctionDeclaration', 'startReplay');
      const body = fn.body.body;
      const i = body.findIndex((st) => st.type === 'VariableDeclaration' && st.declarations.some((d) => d.id.name === 'refusal'));
      const refused = i >= 0 && body[i + 1]?.type === 'IfStatement' ? toasts(body[i + 1].consequent) : null;
      // the decode catch (as L83 E17 order finds it): shows the badLink toast and resolves the boot intent; the innermost
      const catches = l82Find(env.ast.share, (n) => n.type === 'CatchClause' && env.src.share.slice(n.start, n.end).includes("t('share.badLink'")
        && env.src.share.slice(n.start, n.end).includes('shellBootIntent = false'));
      const katch = l82One(catches.filter((c) => !catches.some((o) => o !== c && o.start >= c.start && o.end <= c.end)), 'the decode badLink catch');
      const branch = l82Find(katch, (n) => n.type === 'IfStatement' && n.test.type === 'BinaryExpression' && n.test.left?.name === 'stale');
      const stale = branch.length === 1 ? toasts(branch[0].consequent) : null;
      return fails([refused?.all === 1 && refused.composite === 1, `startReplay's refusal toasts ${JSON.stringify(refused)}`],
        [stale?.all === 1 && stale.composite === 1, `the decode catch's stale branch toasts ${JSON.stringify(stale)} (${branch.length} branch(es))`]);
    }],
    ['L83 E18 S1', 'a stale SDK catalog holding saved fresh ids: the replay exit restores the shown twins and stores nothing', 'S1', { blob: C.B1 }, async (B) => restore(B, otherCloth)],
    ['L83 E18 S2', 'a stale kernel after a heyball visit: the replay exit restores the pre-rename ballset, the rack composes', 'S2', {}, async (B) => {
      const g = await B.api.changeGame('heyball', { skipConfirm: true });
      return fails([g === true && B.shown().ballset_id === 'aramith_pool', `changeGame ${g}, shows ${B.shown().ballset_id}`]) || restore(B, otherCloth);
    }],
    ['L83 E18 S3', 'a pre-rename scene holding saved fresh ids: the replay exit rebuilds the twin, not the pin', 'S3', { blob: C.B1 }, async (B) => {
      const out = await restore(B, (eq) => ({ ...eq, table_id: 'diamond_proam_9ft' }));
      return fails([B.scene.built.at(-1) === 'diamond_proam_8ft', `built ${B.scene.built.join(', ')}`]) || out;
    }],
    ['L83 E19 FRESH', 'every sibling fresh: an archived record\'s neutral and pre-rename tables stage', 'FRESH', {}, async (B, env) => {
      const rs = [{ table_id: L.TABLE }, { table_id: 'diamond_proam_8ft' }, null].map((eq) => env.swapBed(B.api, eq));
      return fails([rs.every((r) => r.ret === null && r.equipped === 1), `swapped ${JSON.stringify(rs)}`]);
    }],
    ['L83 E19 S1', 'a stale SDK catalog: an archived record\'s post-rename table the kernel and scene list stages as recorded', 'S1', {}, async (B, env) => {
      const rs = [{ table_id: L.TABLE }, { table_id: 'diamond_proam_8ft' }].map((eq) => env.swapBed(B.api, eq));
      const v = B.api.equipmentSupported(L.TABLE, 'table');
      return fails([v?.verdict?.sdkCatalog === false, `the stale catalog accepts ${L.TABLE}: ${JSON.stringify(v)}`],
        [rs.every((r) => r.ret === null && r.equipped === 1), `swapped ${JSON.stringify(rs)}`]);
    }],
    ['L83 E19 S2', 'a stale kernel: an archived record\'s table it lacks is refused before the re-equip', 'S2', {}, async (B, env) => swapRefuses(env, B)],
    ['L83 E19 S3', 'a pre-rename scene: an archived record\'s table it cannot build is refused before the re-equip', 'S3', {}, async (B, env) => swapRefuses(env, B)],
    ['L83 E19 order', 'playback.js: swapBed refuses through the predicate before game.setEquipment', null, null, async (B, env) => {
      // the verdict: a const whose init calls the gate read from window.__settings.equipmentGate, then an if that returns
      const fn = l83Named(env.ast.playback, 'FunctionDeclaration', 'swapBed');
      const body = fn.body.body; const text = (n) => env.src.playback.slice(n.start, n.end);
      const src = body.find((s) => s.type === 'VariableDeclaration' && /window\.__settings\??\.equipmentGate/.test(text(s)));
      const gname = src?.declarations[0].id.name;
      const i = body.findIndex((s) => s.type === 'VariableDeclaration' && gname && l83Calls(s, gname).length > 0);
      const next = body[i + 1];
      const returns = i >= 0 && next?.type === 'IfStatement' && l82Find(next.consequent, (n) => n.type === 'ReturnStatement').length > 0;
      const eq = l82Find(fn, (n) => n.type === 'MemberExpression' && n.property?.name === 'setEquipment')[0];
      return fails([!!src, 'swapBed never reads window.__settings.equipmentGate'],
        [i >= 0 && returns && eq && body[i].start < eq.start, `verdict at ${i < 0 ? -1 : body[i].start} (returns ${returns}), setEquipment at ${eq?.start}`]);
    }],
    ['L83 E20 FRESH', 'every sibling fresh: the atelier lists the neutral table pickable', 'FRESH', {}, async (B, env) => fails([env.atelier.equipmentPickRefused(B.api, 'table_id', L.TABLE) === false, 'disabled'])],
    ['L83 E20 S2', 'a stale kernel: the atelier lists a table it lacks with the pick disabled', 'S2', {}, async (B, env) => fails([env.atelier.equipmentPickRefused(B.api, 'table_id', L.TABLE) === true, 'pickable'])],
    ['L83 E20 S3', 'a pre-rename scene: the atelier lists a table it cannot build with the pick disabled', 'S3', {}, async (B, env) => fails([env.atelier.equipmentPickRefused(B.api, 'table_id', L.TABLE) === true, 'pickable'])],
    ['L83 E20 rail', 'atelier.js: the card rails\' disabled rules (the equipment rail and the cue rail) ask the predicate', null, null, async (B, env) => {
      const hits = l82Find(env.ast.atelier, (n) => n.type === 'Property' && n.key?.name === 'disabled' && n.value.type === 'ArrowFunctionExpression' && l83Calls(n.value, 'equipmentPickRefused').length);
      const cue = hits.filter((n) => l83Calls(n.value, 'equipmentPickRefused').some((c) => c.arguments[1]?.value === 'cue_id'));
      // the equipment rail's rule asks twice: the non-table axes' early return, and the table branch's final return
      const rail = hits.filter((n) => !cue.includes(n));
      const body = rail.length === 1 && rail[0].value.body.type === 'BlockStatement' ? rail[0].value.body.body : [];
      const axes = body.filter((st) => st.type === 'IfStatement' && l83Calls(st.consequent, 'equipmentPickRefused').length === 1);
      const last = body.at(-1);
      const table = last?.type === 'ReturnStatement' && l83Calls(last, 'equipmentPickRefused').length === 1;
      return fails([hits.length === 2 && cue.length === 1, `${hits.length} rail disabled rule(s) ask the predicate, ${cue.length} for the cue rail`],
        [axes.length === 1 && table, `the equipment rail rule asks in ${axes.length} non-table branch(es); its table branch ${table ? 'asks' : 'does not ask'}`]);
    }],
    ['L83 E20 cue rows', 'atelier.js: the cue option rows\' disabled value asks the predicate', null, null, async (B, env) => {
      const rows = l83Calls(env.ast.atelier, 'optionRow').filter((c) => c.arguments[0]?.value === 'cue_id');
      const asked = rows.filter((c) => c.arguments[3]?.type === 'ObjectExpression' && c.arguments[3].properties.some((p) => p.key?.name === 'disabled' && l83Calls(p.value, 'equipmentPickRefused').length));
      return fails([rows.length === 1 && asked.length === 1, `${rows.length} cue optionRow call(s), ${asked.length} asking the predicate`]);
    }],
    ['L83 E20 cue', 'a kernel without the renamed cues: the atelier lists a cue it lacks with the pick disabled', 'KCUE', {}, async (B, env) => {
      const lacks = B.stubs.catalogEntries('cue_id').map((e) => e.id).filter((id) => B.api.equipmentSupported(id, 'cue')?.ok === false);
      return fails([lacks.length > 0, 'no catalog cue is rejected'], [lacks.every((id) => env.atelier.equipmentPickRefused(B.api, 'cue_id', id) === true), 'pickable']);
    }],
    ['L83 E20 fill', 'atelier.js: the option list\'s disabled value asks the predicate', null, null, async (B, env) => {
      const hits = l82Find(env.ast.atelier, (n) => n.type === 'Property' && n.key?.name === 'disabled' && n.value.type === 'LogicalExpression' && l83Calls(n.value, 'equipmentPickRefused').length);
      return fails([hits.length === 1, `${hits.length} option-list disabled value(s) ask the predicate`]);
    }],
    ['L83 E21 S1g cards', 'S1, games half (a pre-v20 pool-sdk games module, the fresh catalog.js): the atelier lists the six renamed tables pickable', 'FRESH', { g: 'stale' }, async (B, env) => e21Cards(B, env)],
    ['L83 E21 S1g commit', 'S1, games half (a pre-v20 pool-sdk games module, the fresh catalog.js): changeEquipment commits each renamed table', 'FRESH', { g: 'stale' }, async (B) => e21Commit(B, false)],
    ['L83 E21 S1g stage', 'S1, games half (a pre-v20 pool-sdk games module, the fresh catalog.js): preview.stage stages and keeps each renamed table', 'FRESH', { g: 'stale' }, async (B) => e21Commit(B, true)],
    ['L83 E21 S1c cards', 'S1, catalog half (a stale pool-sdk catalog.js, the fresh games module): the atelier lists the six pre-rename tables pickable', 'S1', {}, async (B, env) => e21Cards(B, env)],
    ['L83 E21 S1c commit', 'S1, catalog half (a stale pool-sdk catalog.js, the fresh games module): changeEquipment commits each pre-rename table', 'S1', {}, async (B) => e21Commit(B, false)],
    ['L83 E21 S1c stage', 'S1, catalog half (a stale pool-sdk catalog.js, the fresh games module): preview.stage stages and keeps each pre-rename table', 'S1', {}, async (B) => e21Commit(B, true)],
    ['L83 E21 sites', 'atelier.js: the card rail\'s table branch and the option list\'s disabled value judge the class through tableCardOutOfClass, which asks tableOutOfClass (the only call)', null, null, async (B, env) => {
      const rail = l82Find(env.ast.atelier, (n) => n.type === 'Property' && n.key?.name === 'disabled' && n.value.type === 'ArrowFunctionExpression' && l83Calls(n.value, 'legalTables').length);
      const last = rail.length === 1 && rail[0].value.body.type === 'BlockStatement' ? rail[0].value.body.body.at(-1) : null;
      const fill = l82Find(env.ast.atelier, (n) => n.type === 'Property' && n.key?.name === 'disabled' && n.value.type === 'LogicalExpression' && l83Calls(n.value, 'equipmentPickRefused').length);
      const raw = l82Find(env.ast.atelier, (n) => n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && n.callee.object?.name === 'legal' && n.callee.property?.name === 'includes');
      // each site passes (legal, e.id), legal bound once in the enclosing function to legalTables() (the option list:
      // axis === 'table_id' ? legalTables() : null); the wrapper tableCardOutOfClass = (legal, id) => ... &&
      // tableOutOfClass(sapi(), legal, id) is the one tableOutOfClass call in atelier.js
      const argsOk = (call) => call?.arguments.length === 2 && call.arguments[0].type === 'Identifier' && call.arguments[0].name === 'legal'
        && call.arguments[1].type === 'MemberExpression' && call.arguments[1].object.name === 'e' && call.arguments[1].property.name === 'id';
      const wrap = l82Find(env.ast.atelier, (n) => n.type === 'VariableDeclarator' && n.id.name === 'tableCardOutOfClass');
      const wfn = wrap.length === 1 ? wrap[0].init : null;
      const wparams = wfn?.type === 'ArrowFunctionExpression' && wfn.params.length === 2 && wfn.params.every((p, i) => p.type === 'Identifier' && p.name === ['legal', 'id'][i]);
      const wcall = wfn?.body?.type === 'LogicalExpression' && wfn.body.operator === '&&' ? wfn.body.right : null;
      const wcallOk = wcall?.type === 'CallExpression' && wcall.callee.name === 'tableOutOfClass' && wcall.arguments.length === 3 && l83Calls(wcall.arguments[0], 'sapi').length === 1
        && wcall.arguments[1].type === 'Identifier' && wcall.arguments[1].name === 'legal' && wcall.arguments[2].type === 'Identifier' && wcall.arguments[2].name === 'id';
      const allRaw = l83Calls(env.ast.atelier, 'tableOutOfClass');
      const isLegalTables = (n) => n?.type === 'CallExpression' && n.callee.name === 'legalTables' && n.arguments.length === 0;
      const bindsLegal = (fn) => { const ds = l82Find(fn, (n) => n.type === 'VariableDeclarator' && n.id.name === 'legal'); const i = ds[0]?.init;
        return ds.length === 1 && (isLegalTables(i) || (i?.type === 'ConditionalExpression' && isLegalTables(i.consequent) && i.alternate.type === 'Literal' && i.alternate.value === null)); };
      const fillFn = fill.length === 1 ? l82Find(env.ast.atelier, (n) => /Function/.test(n.type) && n.start <= fill[0].start && fill[0].end <= n.end
        && l82Find(n, (m) => m.type === 'VariableDeclarator' && m.id.name === 'legal').length).sort((a, b) => (a.end - a.start) - (b.end - b.start))[0] : null;
      return fails([rail.length === 1 && last?.type === 'ReturnStatement' && l83Calls(last, 'tableCardOutOfClass').length === 1, `${rail.length} card rail rule(s); its table branch does not ask tableCardOutOfClass`],
        [fill.length === 1 && l83Calls(fill[0].value, 'tableCardOutOfClass').length === 1, 'the option list\'s disabled value does not ask tableCardOutOfClass'],
        [rail.length === 1 && argsOk(l83Calls(last ?? {}, 'tableCardOutOfClass')[0]) && bindsLegal(rail[0].value), 'the card rail does not pass (legal = legalTables(), e.id)'],
        [!!fillFn && argsOk(l83Calls(fill[0].value, 'tableCardOutOfClass')[0]) && bindsLegal(fillFn), 'the option list does not pass (legal = legalTables(), e.id)'],
        [wrap.length === 1 && wparams && wcallOk && allRaw.length === 1 && allRaw[0] === wcall, `${wrap.length} tableCardOutOfClass declaration(s); it does not end in && tableOutOfClass(sapi(), legal, id), or atelier.js has ${allRaw.length} tableOutOfClass call(s) (one: the wrapper's)`],
        [raw.length === 1, `${raw.length} legal.includes call(s) in atelier.js (one: tableOutOfClass's fallback)`]);
    }],
  ];
}
async function l83Run(ctx, plant = null) {
  const { src, mod, anchorFound } = await l83Sources(plant);
  const env = { src, ast: {} };
  const results = [];
  let setup = '';
  try {
    for (const [file, names] of Object.entries(l83Consts().HELPERS)) { env.ast[file] = await l82Ast(src[file]); env[file] = await l83Helpers(src[file], names); }
    env.ast.playback = await l82Ast(src.playback); env.swapBed = await l83SwapBed(src.playback);
  } catch (e) { setup = `the consumer helpers did not slice: ${(e && e.message) || e}`; }
  for (const [key, title, cell, extra, body] of l83Scenarios(ctx)) {
    let detail = setup;
    if (!detail) {
      try {
        const B = cell ? await l81Boot(ctx, mod, { ...Object.fromEntries(['k', 'c', 'scene'].map((n, i) => [n, l81Consts().CELLS[cell][i]])), ...extra }) : null;
        detail = await body(B, env);
      } catch (e) { detail = `threw: ${(e && e.message) || e}`; }
    }
    results.push({ key, title: `${key}${cell ? ` (${cell})` : ''}: ${title}`, ok: !detail, detail });
  }
  return { results, anchorFound, setup };
}
// L83-0: every consumer helper slices exactly once from its file and evaluates.
function l83Guards(ctx, run, report) {
  const want = [...Object.values(l83Consts().HELPERS).flat(), ...Object.values(l83Consts().NESTED).flat()];
  report('L83-0 helpers', `L83-0 the ${want.length} consumer functions (${want.join(', ')}) slice verbatim and evaluate`, !run.setup, run.setup);
  console.log('L83-0 note: the settings module boots whole (l81Boot, its scene handle a model of table.js prepareEquipment); the consumer helpers are sliced verbatim and called with that api; their call sites are checked in the AST, not run');
}
async function l83Check(ctx, run, report) {
  for (const r of run.results) report(r.key, r.title, r.ok, r.detail);
}
// --selftest-drift: each plant turns one gate off in one file's text (an anchor not found exactly once makes the plant INVALID).
// CAUGHT only when the control is green and the failing key set equals the expected set.
async function l83DriftSelftest() {
  const tag = '[L83 selftest-drift]';
  const ctx = await l80Context();
  const collect = async (plant) => { const run = await l83Run(ctx, plant); const rows = []; await l83Check(ctx, run, (key, name, ok, detail = '') => rows.push({ key, ok, line: checkLine(name, ok, detail) })); return { rows, anchorFound: run.anchorFound }; };
  const control = (await collect(null)).rows; const controlFails = control.filter((r) => !r.ok);
  const plants = [
    // E4: the boot write-back ignores a stale sibling again
    // (the E16 sessions hold their blob only while neither the boot nor the fallback writes it)
    { name: 'E4-write-back', file: 'settings', anchor: '!staleSiblingSeen) persist()', replacement: 'true) persist()', expected: ['L83 E4 S3', 'L83 E16 S1', 'L83 E16 S2', 'L83 E16 S3'] },
    // E4.S3: the predicate never reads the held scene handle (a stale scene is invisible)
    { name: 'E4-scene-blind', file: 'settings', anchor: ': ctx.tableBuild ?? (typeof window === \'undefined\' ? null : window.__tableBuild);', replacement: ': null;',
      expected: ['L83 E4 S3', 'L83 E16 S3', 'L83 E17 S3', 'L83 E18 S3', 'L83 E19 S3', 'L83 E20 S3'] },
    // E16: the heyball fallback writes the blob after a stale sibling again
    { name: 'E16-fallback-stores', file: 'settings', anchor: "api.set('game', DEFAULTS.game, { skipStore: true });", replacement: "api.set('game', DEFAULTS.game);",
      expected: ['L83 E16 S1', 'L83 E16 S2', 'L83 E16 S3', 'L83 E16 S4'] },
    // E16.S4: the fallback stores again when no other sibling is stale (a stale flow.js alone)
    { name: 'E16-fresh-stores', file: 'settings', anchor: "api.set('game', DEFAULTS.game, { skipStore: true });",
      replacement: "api.set('game', DEFAULTS.game, staleSiblingSeen ? { skipStore: true } : undefined);", expected: ['L83 E16 S4'] },
    // E16: a later persist writes the game the fallback shows over the held saved game
    { name: 'E16-game-unheld', file: 'settings', anchor: 'const savedGame = heldGame?.shown === persistedGame ? heldGame.saved : persistedGame;', replacement: 'const savedGame = persistedGame;',
      expected: ['L83 E16 S1', 'L83 E16 S2', 'L83 E16 S3', 'L83 E16 S4'] },
    // E16: a stored game commit no longer releases the held game
    { name: 'E16-never-released', file: 'settings', anchor: 'heldGame = skipStore && value !== saved ? { saved, shown: value } : null;',
      replacement: 'heldGame = skipStore && value !== saved ? { saved, shown: value } : heldGame;', expected: ['L83 E16 release'] },
    // the commit gate is no longer on the settings api: every consumer feature-detects it away (the pre-#789 path)
    { name: 'api-no-gate', file: 'settings', anchor: 'api.equipmentGate = (spec, chosen, opts) => equipmentCommitGate(spec, chosen, opts?.verbatim ? { verbatim: true } : {});', replacement: '',
      expected: ['L83 E17 S2', 'L83 E17 S2 kernel-known', 'L83 E17 S3', 'L83 E19 S2', 'L83 E19 S3'] },
    // E18: the exit restore re-applies the held saved ids as the choice instead of the spec the session showed: refused, the
    // replay's equipment stays
    { name: 'E18-restore-saved', file: 'settings', anchor: "const result = set('equipment', persistedEquipment, { persist: false, endInherited: true });",
      replacement: "const held = heldEquipment[persistedGame] ?? {}; const result = set('equipment', { ...persistedEquipment, ...Object.fromEntries(Object.entries(held).map(([a, h]) => [a, h.saved])) }, { persist: false, endInherited: true, chosen: Object.keys(held) });",
      expected: ['L83 E18 S1', 'L83 E18 S2', 'L83 E18 S3'] },
    // E17.S2/E19.S2: the verbatim gate no longer asks the kernel: an id the stale kernel lacks replays (and an archive stages) as recorded
    { name: 'E17-kernel-blind', file: 'settings', anchor: 'c?.verdict.kernelIds === true && c.verdict.sceneSpecs !== false', replacement: 'c !== null && c.verdict.sceneSpecs !== false',
      expected: ['L83 E17 S2', 'L83 E17 S2 kernel-known', 'L83 E19 S2'] },
    // E17.S1/S2/S3: the replay commit degrades again: a retired id the cached catalog lacks, or a table the pre-rename scene cannot
    // build, is replaced by its twin
    { name: 'E17-twin-commit', file: 'settings', anchor: "set('equipment', spec, { persist: false, verbatim: true });", replacement: "set('equipment', spec, { persist: false });",
      expected: ['L83 E17 S1 decoded', 'L83 E17 S2 kernel-known', 'L83 E17 S3'] },
    // E17.S1/S2: the replay predicate asks the degrading gate: a retired id the SDK catalog lacks is refused (its twin degrade)
    { name: 'E17-not-verbatim', file: 'share', anchor: 'gate(equipment, [], { verbatim: true })', replacement: 'gate(equipment, [])', expected: ['L83 E17 S1 decoded', 'L83 E17 S2 kernel-known'] },
    // E17: startReplay no longer asks the predicate
    { name: 'E17-unrouted', file: 'share', anchor: 'const refusal = replayEquipmentRefusal(ctx.settings, shared?.equipment);', replacement: 'const refusal = null;', expected: ['L83 E17 order'] },
    // E17.S1: the decode catch no longer asks the predicate
    { name: 'E17-catch-unrouted', file: 'share', anchor: 'const stale = staleCatalogRejection(ctx.settings, e);', replacement: 'const stale = null;', expected: ['L83 E17 order'] },
    // E17: startReplay's refusal toasts the bare share.stagingRefused copy (a replay that never began reads as ended)
    { name: 'E17-toast-bare', file: 'share', anchor: "a refused link is a resolution\n      showToast(t('error.reloadMessage', { message: t('share.stagingRefused') }));",
      replacement: "a refused link is a resolution\n      showToast(t('share.stagingRefused'));", expected: ['L83 E17 toast'] },
    // E17.S1: the decode catch's stale-catalog branch toasts the bare copy
    { name: 'E17-catch-toast-bare', file: 'share', anchor: "replay refused: ${stale}`);\n            showToast(t('error.reloadMessage', { message: t('share.stagingRefused') }));",
      replacement: "replay refused: ${stale}`);\n            showToast(t('share.stagingRefused'));", expected: ['L83 E17 toast'] },
    // E17.S1: a stale catalog's rejection reads as a bad link again
    { name: 'E17-stale-badlink', file: 'share', anchor: 'return v?.verdict?.sdkCatalog === false && v.verdict.kernelIds === true ? v.reason : null;', replacement: 'return null;', expected: ['L83 E17 S1'] },
    // E19: every archive axis chosen (and not verbatim): an id only the stale SDK catalog lacks refuses the archived record
    { name: 'E19-chosen', file: 'playback', anchor: 'archiveGate(equipment, [], { verbatim: true })', replacement: "archiveGate(equipment, ['table_id', 'cloth_id', 'ballset_id', 'cushion_model_id', 'cue_id'])",
      expected: ['L83 E19 S1'] },
    // E19: the gate in ordinary mode: a table the kernel or scene lacks degrades to its twin and stages
    { name: 'E19-ordinary', file: 'playback', anchor: 'archiveGate(equipment, [], { verbatim: true })', replacement: 'archiveGate(equipment, [])',
      expected: ['L83 E19 S2', 'L83 E19 S3'] },
    // E19: swapBed's refusal no longer returns: the refused tag is re-equipped anyway
    { name: 'E19-no-return', file: 'playback', anchor: "      return 'refused';\n", replacement: '',
      expected: ['L83 E19 S2', 'L83 E19 S3', 'L83 E19 order'] },
    // E20: the helper never disables a pick
    { name: 'E20-never', file: 'atelier', anchor: 'return supported(id, kind)?.ok === false;', replacement: 'return false;', expected: ['L83 E20 S2', 'L83 E20 S3', 'L83 E20 cue'] },
    // E20: the card rail's disabled rule no longer asks the predicate
    { name: 'E20-rail', file: 'atelier', anchor: "        if (axis !== 'table_id') return equipmentPickRefused(sapi(), axis, e.id);\n        const legal = legalTables();\n        return tableCardOutOfClass(legal, e.id) || equipmentPickRefused(sapi(), axis, e.id);\n",
      replacement: "        if (axis !== 'table_id') return false;\n        const legal = legalTables();\n        return tableCardOutOfClass(legal, e.id);\n", expected: ['L83 E20 rail'] },
    // E20: only the card rail's table branch stops asking the predicate (the non-table axes still ask)
    { name: 'E20-rail-table', file: 'atelier', anchor: '        return tableCardOutOfClass(legal, e.id) || equipmentPickRefused(sapi(), axis, e.id);\n',
      replacement: '        return tableCardOutOfClass(legal, e.id);\n', expected: ['L83 E20 rail'] },
    // E20: only the card rail's non-table axes stop asking the predicate (the table branch still asks)
    { name: 'E20-rail-axes', file: 'atelier', anchor: "        if (axis !== 'table_id') return equipmentPickRefused(sapi(), axis, e.id);\n",
      replacement: "        if (axis !== 'table_id') return false;\n", expected: ['L83 E20 rail'] },
    // E20: the option list's disabled value no longer asks the predicate
    { name: 'E20-fill', file: 'atelier', anchor: '          disabled: tableCardOutOfClass(legal, e.id)\n            || equipmentPickRefused(sapi(), axis, e.id) }));\n',
      replacement: '          disabled: tableCardOutOfClass(legal, e.id) }));\n', expected: ['L83 E20 fill', 'L83 E21 sites'] },
    // E20: the cue rail lists every cue pickable again
    { name: 'E20-cue-rail', file: 'atelier', anchor: "disabled: () => equipmentPickRefused(sapi(), 'cue_id', id),", replacement: 'disabled: () => false,', expected: ['L83 E20 rail'] },
    // E20: the cue option rows list every cue pickable again
    { name: 'E20-cue-rows', file: 'atelier', anchor: "\n          { disabled: equipmentPickRefused(api, 'cue_id', e.id) }));", replacement: '));', expected: ['L83 E20 cue rows'] },
    // E21: changeEquipment's class check is the exact-id test again (a renamed table refused under a half-stale SDK)
    { name: 'E21-commit-exact', file: 'settings', anchor: '        if (!tableInClass(legalTableIds(values.game), id)) return false;\n',
      replacement: '        { const legal = legalTableIds(values.game); if (legal && !legal.includes(id)) return false; }\n', expected: ['L83 E21 S1g commit', 'L83 E21 S1c commit'] },
    // E21: preview.stage's class check is the exact-id test again
    { name: 'E21-stage-exact', file: 'settings', anchor: '            if (!tableInClass(legalTableIds(values.game), value)) return false;\n',
      replacement: '            { const legal = legalTableIds(values.game); if (legal && !legal.includes(value)) return false; }\n', expected: ['L83 E21 S1g stage', 'L83 E21 S1c stage'] },
    // E21: the class predicate accepts every table (the class law gone)
    { name: 'E21-class-open', file: 'settings', anchor: '  return twins.some((t) => legal.includes(t));\n', replacement: '  return true;\n',
      expected: ['L83 E21 S1g cards', 'L83 E21 S1g commit', 'L83 E21 S1g stage', 'L83 E21 S1c cards', 'L83 E21 S1c commit', 'L83 E21 S1c stage'] },
    // E21: settings without the class seam (an older settings.js): the atelier's exact-id fallback disables the renamed cards
    { name: 'E21-api-absent', file: 'settings', anchor: '  api.tableInClass = (id) => tableInClass(legalTableIds(values.game), id);\n', replacement: '',
      expected: ['L83 E21 S1g cards', 'L83 E21 S1c cards'] },
    // E21: the atelier helper never asks the seam
    { name: 'E21-helper-exact', file: 'atelier', anchor: "  if (typeof inClass === 'function') return inClass(id) === false;\n", replacement: '',
      expected: ['L83 E21 S1g cards', 'L83 E21 S1c cards'] },
    // E21: the card rail's table branch judges the class by the exact id again
    { name: 'E21-rail-exact', file: 'atelier', anchor: '        return tableCardOutOfClass(legal, e.id) || equipmentPickRefused(sapi(), axis, e.id);\n',
      replacement: '        return (legal !== null && !legal.includes(e.id)) || equipmentPickRefused(sapi(), axis, e.id);\n', expected: ['L83 E21 sites'] },
    // E21: the option list judges the class by the exact id again
    { name: 'E21-fill-exact', file: 'atelier', anchor: '          disabled: tableCardOutOfClass(legal, e.id)\n',
      replacement: '          disabled: (legal !== null && !legal.includes(e.id))\n', expected: ['L83 E21 sites'] },
    // E21: the card rail drops the class list (null: no restriction)
    { name: 'E21-rail-null', file: 'atelier', anchor: '        return tableCardOutOfClass(legal, e.id) || equipmentPickRefused(sapi(), axis, e.id);\n',
      replacement: '        return tableCardOutOfClass(null, e.id) || equipmentPickRefused(sapi(), axis, e.id);\n', expected: ['L83 E21 sites'] },
    // E21: the option list binds no class list
    { name: 'E21-fill-unbound', file: 'atelier', anchor: "      const legal = axis === 'table_id' ? legalTables() : null;\n",
      replacement: '      const legal = null;\n', expected: ['L83 E21 sites'] },
    // E21: the card class wrapper drops the class list (null: no restriction) for every non-equipped card
    { name: 'E21-wrapper-null', file: 'atelier', anchor: '    && tableOutOfClass(sapi(), legal, id);\n',
      replacement: '    && tableOutOfClass(sapi(), null, id);\n', expected: ['L83 E21 sites'] },
  ];
  let caught = 0;
  for (const p of plants) {
    console.log(`${tag} plant ${p.name}: ${p.file} anchor ${JSON.stringify(p.anchor)}; control: ${control.length} checks, ${controlFails.length} failure(s)`);
    const { rows, anchorFound } = await collect(p);
    if (!anchorFound || controlFails.length) {
      for (const r of controlFails) console.log(`${tag} control ${l80Scrub(ctx, r.line)}`);
      console.log(`${tag} ${p.name} INVALID: ${controlFails.length ? 'the control is red' : 'the anchor is not found exactly once in the file'}`);
      continue;
    }
    const fails = rows.filter((r) => !r.ok);
    const got = [...new Set(fails.map((r) => r.key))].sort(); const want = [...new Set(p.expected)].sort();
    if (fails.length && got.length === want.length && got.every((k, i) => k === want[i])) { caught += 1; for (const r of fails) console.log(`${tag} ${p.name} CAUGHT: ${l80Scrub(ctx, r.line)}`); }
    else {
      console.log(`${tag} ${p.name} NOT CAUGHT: failing keys {${got.join(' | ')}}, expected {${want.join(' | ')}}`);
      for (const r of fails) console.log(`${tag} ${p.name} fixture ${l80Scrub(ctx, r.line)}`);
    }
  }
  const counted = plants.length === l83Consts().PLANT_COUNT;
  console.log(`${tag} ${caught} of ${plants.length} plants caught; ${plants.length} plant(s) declared, ${l83Consts().PLANT_COUNT} required${counted ? '' : ' (COUNT MISMATCH)'}`);
  return caught === plants.length && counted ? 0 : 1;
}

{
  const ctx = await l80Context();
  l80Guards(ctx, (key, name, ok, detail) => check(name, ok, detail));
  await l80Check(ctx, await l80Run(ctx), (key, name, ok, detail) => check(name, ok, detail));
  l80pCheck(ctx, await l80pRun(ctx), (key, name, ok, detail) => check(name, ok, detail));
  l80sCheck(ctx, await l80sRun(ctx), (key, name, ok, detail) => check(name, ok, detail));
  const run81 = await l81Run(ctx);
  l81Guards(ctx, run81, (key, name, ok, detail) => check(name, ok, detail));
  await l81Check(ctx, run81, (key, name, ok, detail) => check(name, ok, detail));
  l82Guards(ctx, (key, name, ok, detail) => check(name, ok, detail));
  await l82Check(ctx, await l82Run(ctx), (key, name, ok, detail) => check(name, ok, detail));
  const run83 = await l83Run(ctx);
  l83Guards(ctx, run83, (key, name, ok, detail) => check(name, ok, detail));
  await l83Check(ctx, run83, (key, name, ok, detail) => check(name, ok, detail));
}

console.log(failures ? `${failures} FAIL` : 'ALL PASS');
process.exit(failures ? 1 : 0);
