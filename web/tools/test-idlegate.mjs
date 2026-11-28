// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-idlegate.mjs — the node arm for main.js's idle frame gate (idle-render unit 1, web/app/idlegate.js). Plain node, no browser,
// no wasm, simulated clocks only (nothing here reads the host's timing):
//   (1) the busy predicate busyReason() as a pure function: idle on an all-quiet record, each signal alone busy by its own name,
//       the earlier signal in BUSY_ORDER wins every pair, unknown fields are not signals, the reads stop at the first busy one;
//   (2) the pure step decide(): a busy tick steps from `last`; the first idle tick after a busy one renders (trailing); idle ticks
//       then skip, with a keepalive frame whose dt is the real elapsed time (`last` untouched on skipped ticks); the idle-to-busy
//       edge after skipped ticks steps one vsync; the keepalive rate stays at or below 15 fps on 30-240 Hz displays (gaps between
//       K - 2 x slack and K + one tick), and at 60 Hz with rAF jitter every keepalive comes on the fourth tick;
//   (3) the camera signature: sub-pixel thresholds per component, the layer mask, matrixWorld never read;
//   (4) the live gate over stand-ins (createIdleGate, with state.js's own machine): the arming rule (ready, the fade's start, the
//       #ob-boot node gone, the 5 s tail from the later of ready and the fade, the shell arrival and flights), each busy signal,
//       the listeners (window, capture), the pointer set and its 30 s bound, a nudge repeat past that bound (the aim signal), a
//       pointerless click, an env without the aim read, manual mode, the throttled venue read, the idle rate, the throw path;
//   (5) main.js's own frame() gate line, lifted verbatim: a skipped tick re-arms rAF and returns before the step;
//   (6) a source census of the wiring: main.js (namespace import, scripted and ?idlegate=0 boots never gated, the gate built
//       inside a try before frame(), the tick after the gpuGate hold and before the held-resize landing, the env keys idlegate.js
//       reads, __test.idleGate, canvas depth off on the shipped renderer only), postfx.js (resolveDepthBuffer: false, the bloom
//       targets' depthBuffer, the bloom wrapper after the strength register), shell.js (__shell.busy);
//   (7) postfx.js's skipZeroBloom, lifted verbatim: a strength-0 pass renders once, then returns at once; any other strength and
//       a pass that renders to the screen always render; the effective strength is read on every call;
//   plants: a copy of a source (idlegate.js, main.js, postfx.js, shell.js) with one rule broken must turn its check family RED
//   (27 plants).
//   node web/tools/test-idlegate.mjs      (exit 1 on any failed check or a plant that stays green)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(here, p), 'utf8');
const SRC = { gate: read('../app/idlegate.js'), main: read('../app/main.js'), postfx: read('../scene/postfx.js'),
  shell: read('../app/shell.js') };
const load = (code) => import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const { createStateMachine } = await load(read('../app/state.js'));

function checker() {
  const failed = [];
  let n = 0;
  const check = (name, ok, got) => {
    n += 1;
    if (!ok) failed.push(got === undefined ? name : `${name} — got ${JSON.stringify(got)}`);
  };
  return { check, failed, count: () => n };
}

const HZ = 60, TICK = 1000 / HZ;
const PINNED_ORDER = 'playback,activity,pointer,camera,aim,resize,switch,stage,shell,record,track,occlusion,gi,lampfade,decal,venue,'
  + 'env,atelier,ink';
const DOM_EVENTS = ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'lostpointercapture', 'wheel', 'keydown', 'keyup',
  'touchstart', 'touchmove', 'touchend', 'touchcancel', 'contextmenu', 'resize', 'orientationchange', 'focus', 'blur', 'pageshow',
  'visibilitychange', 'click', 'input', 'change'];
const SCENE_EVENTS = ['ob:settings', 'ob:relight', 'ob:cinelight', 'ob:table-state', 'ob:table-refused', 'ob:export-idle',
  'ob:shell-bands'];
const MACHINE_EVENTS = ['stateChange', 'shotComplete', 'playerChanged', 'foulCalled', 'gameWon'];

// (1) the busy predicate
function familyPredicate(G) {
  const { check, failed, count } = checker();
  const { busyReason, BUSY_ORDER } = G;
  check('BUSY_ORDER: 19 unique names, frozen', BUSY_ORDER.length === 19 && new Set(BUSY_ORDER).size === 19
    && Object.isFrozen(BUSY_ORDER), BUSY_ORDER);
  check('BUSY_ORDER: the pinned order (cheapest first)', BUSY_ORDER.join() === PINNED_ORDER, BUSY_ORDER.join());
  const quiet = Object.fromEntries(BUSY_ORDER.map((n) => [n, false]));
  check('an all-quiet record is idle', busyReason(quiet) === null);
  check('an empty record is idle', busyReason({}) === null);
  for (const n of BUSY_ORDER) {
    const r = busyReason({ ...quiet, [n]: true });
    check(`${n} alone is busy by its own name`, r === n, r);
  }
  const wrong = [];
  for (let i = 0; i < BUSY_ORDER.length; i++) for (let j = i + 1; j < BUSY_ORDER.length; j++) {
    const r = busyReason({ ...quiet, [BUSY_ORDER[j]]: true, [BUSY_ORDER[i]]: true });
    if (r !== BUSY_ORDER[i]) wrong.push(`${BUSY_ORDER[i]}<${BUSY_ORDER[j]}:${r}`);
  }
  check('the earlier name wins every pair (171 pairs)', wrong.length === 0, wrong.slice(0, 4));
  check('unknown fields are not signals', busyReason({ ...quiet, frame: true, nope: 1 }) === null);
  check('truthy values count', busyReason({ ...quiet, stage: 2 }) === 'stage' && busyReason({ ...quiet, env: 'x' }) === 'env');
  const reads = [];
  const lazy = {};
  for (const n of BUSY_ORDER) Object.defineProperty(lazy, n, { get: () => { reads.push(n); return n === 'camera' || n === 'ink'; } });
  const r = busyReason(lazy);
  check('the reads stop at the first busy signal', r === 'camera'
    && reads.join() === BUSY_ORDER.slice(0, BUSY_ORDER.indexOf('camera') + 1).join(), { r, reads });
  return { failed, count: count() };
}

// drive decide() the way main.js does: `last` moves only on a stepped tick (to the gate's value for the step, then to now)
function drive(G, { hz = HZ, seconds = 1, busy = () => false, jitter = () => 0, t0 = 1000 }) {
  const st = { idleRun: 0, skipped: 0, keepaliveAt: t0 + G.KEEPALIVE_MS, prevTick: t0, kind: 'off' }; // as at the arming tick
  let last = t0;
  const out = [];
  const period = 1000 / hz;
  for (let k = 1; k <= Math.round(seconds * hz); k++) {
    const now = t0 + k * period + jitter(k);
    const l = G.decide(st, now, last, busy(k) ? 'camera' : null);
    if (l === null) { out.push({ k, now, kind: st.kind, stepped: false }); continue; }
    out.push({ k, now, kind: st.kind, stepped: true, dtMs: now - l, sinceLast: now - last });
    last = now;
  }
  return out;
}

// (2) the pure step
function familyStep(G) {
  const { check, failed, count } = checker();
  const K = G.KEEPALIVE_MS;
  check('KEEPALIVE_MS = 1000 / 15, IDLE_FPS 15, ACTIVITY_MS 2000', K === 1000 / 15 && G.IDLE_FPS === 15 && G.ACTIVITY_MS === 2000);
  const allBusy = drive(G, { busy: () => true });
  check('busy ticks all step, each from the previous tick', allBusy.every((x) => x.stepped && x.kind === 'busy'
    && Math.abs(x.dtMs - TICK) < 1e-9), allBusy.slice(0, 3));
  // busy 1..10, idle 11..20, busy 21..
  const run = drive(G, { busy: (k) => k <= 10 || k >= 21, seconds: 0.5 });
  const kinds = run.slice(10, 21).map((x) => x.kind).join();
  check('busy to idle: trailing, then skips with a keepalive on the fourth tick, then the wake edge',
    kinds === 'trailing,skip,skip,skip,keepalive,skip,skip,skip,keepalive,skip,wake', kinds);
  check('the trailing frame steps one vsync', Math.abs(run[10].dtMs - TICK) < 1e-9, run[10]);
  const ka = run.filter((x) => x.kind === 'keepalive');
  check('a keepalive steps the real elapsed time (`last` untouched on skipped ticks)',
    ka.length === 2 && ka.every((x) => Math.abs(x.dtMs - 4 * TICK) < 1e-9 && Math.abs(x.dtMs - x.sinceLast) < 1e-9), ka);
  const wake = run[20];
  check('the idle-to-busy edge after skipped ticks steps one vsync (last = the previous tick)',
    wake.kind === 'wake' && wake.stepped && Math.abs(wake.dtMs - TICK) < 1e-9, wake);
  const afterKa = drive(G, { busy: (k) => k <= 10 || k >= 16, seconds: 0.4 })[15];
  check('busy right after a keepalive (nothing skipped) steps from the keepalive', afterKa.kind === 'busy'
    && Math.abs(afterKa.dtMs - TICK) < 1e-9, afterKa);
  // the rate bound over 10 s of idle at common and odd refresh rates
  const rates = {};
  let gapsOk = true;
  for (const hz of [30, 48, 50, 60, 75, 90, 100, 111, 120, 144, 165, 240]) {
    const r = drive(G, { hz, seconds: 10 });
    const st = r.filter((x) => x.stepped && x.kind !== 'trailing');
    rates[hz] = st.length;
    for (let i = 1; i < st.length; i++) {
      const gap = st[i].now - st[i - 1].now;
      if (gap < K - 8 - 1e-9 || gap > K + 1000 / hz + 1e-9) gapsOk = false;
    }
  }
  check('10 s idle: at most 151 keepalives (15 fps) and at least 120, at 30-240 Hz',
    Object.values(rates).every((n) => n <= 151 && n >= 120), rates);
  check('keepalive gaps within [K - 2 x slack, K + one tick]', gapsOk);
  const jit = (k) => ((k * 7919) % 31) / 10 - 1.5; // deterministic ±1.5 ms
  const jr = drive(G, { seconds: 10, jitter: jit });
  const jks = jr.filter((x) => x.stepped && x.kind !== 'trailing').map((x) => x.k);
  const cadence = new Set(jks.slice(1).map((k, i) => k - jks[i]));
  check('60 Hz with ±1.5 ms rAF jitter: every keepalive on the fourth tick', cadence.size === 1 && cadence.has(4), [...cadence]);
  check('every idle step stays under main.js\'s 0.1 s clamp', jr.every((x) => !x.stepped || x.dtMs < 100));
  return { failed, count: count() };
}

function makeCamera() {
  const f = 1 / Math.tan((20 * Math.PI) / 180);
  return { position: { x: 0, y: 1.6, z: 2.4 }, quaternion: { x: -0.3, y: 0, z: 0, w: Math.sqrt(1 - 0.09) },
    projectionMatrix: { elements: [f / 1.6, 0, 0, 0, 0, f, 0, 0, 0, 0, -1.002, -1, 0, 0, -0.1002, 0] }, layers: { mask: 1 },
    get matrixWorld() { throw new Error('matrixWorld read'); } };
}

// (3) the camera signature
function familySignature(G) {
  const { check, failed, count } = checker();
  const cam = makeCamera();
  const a = new Float64Array(24), b = new Float64Array(24);
  let threw = null;
  try { G.cameraSignature(cam, a); } catch (e) { threw = e.message; }
  check('the signature never reads matrixWorld', threw === null, threw);
  check('the signature: position, quaternion, projection, layer mask', a[2] === 2.4 && a[6] === cam.quaternion.w
    && a[7] === cam.projectionMatrix.elements[0] && a[21] === -0.1002 && a[23] === 1, [...a]);
  const moved = (edit) => {
    const c = makeCamera();
    G.cameraSignature(c, a);
    edit(c);
    G.cameraSignature(c, b);
    return G.signatureMoved(b, a);
  };
  check('the same pose has not moved', moved(() => {}) === false);
  check('2 µm of position moved', moved((c) => { c.position.z += 2e-6; }) === true);
  check('0.5 µm of position has not moved', moved((c) => { c.position.x += 5e-7; }) === false);
  check('2e-7 of a quaternion component moved', moved((c) => { c.quaternion.y += 2e-7; }) === true);
  check('5e-8 of a quaternion component has not moved', moved((c) => { c.quaternion.y += 5e-8; }) === false);
  check('2e-7 relative of a projection element moved', moved((c) => { c.projectionMatrix.elements[5] *= 1 + 2e-7; }) === true);
  check('5e-8 relative of a projection element has not moved',
    moved((c) => { c.projectionMatrix.elements[5] *= 1 + 5e-8; }) === false);
  check('a layer change moved', moved((c) => { c.layers.mask |= 2; }) === true);
  return { failed, count: count() };
}

// the live gate over stand-ins: a fake window/document/canvas, state.js's machine, a simulated clock; S.last follows main.js
function rig(G, { aimPhi = true } = {}) {
  const clock = { t: 0 };
  const listeners = new Map(), opts = new Map();
  const add = (t, fn, o) => { if (!listeners.has(t)) listeners.set(t, []); listeners.get(t).push(fn); opts.set(t, o); };
  const win = { performance: { now: () => clock.t }, addEventListener: add,
    visualViewport: { addEventListener: (t, fn, o) => add('visualViewport:' + t, fn, o) } };
  const attrs = new Set(), els = new Map([['ob-boot', {}]]);
  const doc = { documentElement: { hasAttribute: (a) => attrs.has(a) }, getElementById: (id) => els.get(id) ?? null,
    visibilityState: 'visible' };
  const canvas = { addEventListener: (t, fn, o) => add('canvas:' + t, fn, o) };
  const machine = createStateMachine('AIM');
  const camera = makeCamera();
  const e = { readyAt: null, overlay: true, holds: 0, waiters: 0, stage: 0, resize: false, venue: true, venueReads: 0, phi: Math.PI / 2 };
  const env = { gateReadyAt: () => e.readyAt, overlayUp: () => e.overlay, holds: () => e.holds, waiters: () => e.waiters,
    stagePending: () => e.stage, resizeHeld: () => e.resize, venueSettled: () => { e.venueReads += 1; return e.venue; },
    aimPhi: () => e.phi };
  if (!aimPhi) delete env.aimPhi; // a caller from before the aim read (a cached main.js)
  const errors = [];
  const gate = G.createIdleGate({ machine, camera, canvas, bootTailMs: 5000, env, win, doc, onError: (x) => errors.push(x) });
  const S = { last: 0 };
  const tick = (manual = false) => {
    clock.t += TICK;
    S.each?.();
    const l = gate.tick(clock.t, S.last, manual);
    if (l === null) return false;
    S.last = clock.t;
    return true;
  };
  const ticks = (n) => { let s = 0; for (let i = 0; i < n; i++) if (tick()) s += 1; return s; };
  const fire = (type, extra = {}) => { for (const fn of listeners.get(type) ?? []) fn({ type, target: win, buttons: 0, pointerId: 1, ...extra }); };
  return { clock, win, doc, attrs, els, machine, camera, e, gate, tick, ticks, fire, errors, opts, S };
}
const ARM_TICKS = Math.ceil(5000 / TICK) + 1;
function armed(G, opts) {
  const r = rig(G, opts);
  r.ticks(5);
  r.e.readyAt = r.clock.t;
  r.e.overlay = false;
  r.els.delete('ob-boot');
  r.ticks(ARM_TICKS + 8);
  return r;
}

// (4) the live gate
function familyLive(G) {
  const { check, failed, count } = checker();
  // arming
  {
    const r = rig(G);
    const s0 = r.ticks(400);
    check('unarmed (no ready, overlay up): every tick steps', s0 === 400 && r.gate.census().armed === false, s0);
    r.e.readyAt = r.clock.t;
    const s1 = r.ticks(ARM_TICKS + 10);
    check('ready, overlay still up: unarmed, every tick steps', s1 === ARM_TICKS + 10 && !r.gate.census().armed);
    r.e.overlay = false; // the fade starts
    const fadeAt = r.clock.t + TICK;
    r.ticks(54); // ~0.9 s: the node is still in the document
    r.els.delete('ob-boot');
    let armedAt = null;
    for (let i = 0; i < ARM_TICKS + 10 && armedAt === null; i++) { r.tick(); if (r.gate.census().armed) armedAt = r.clock.t; }
    check('arms on the first tick 5 s after the fade\'s start (ready came first)',
      armedAt !== null && armedAt - fadeAt >= 5000 && armedAt - fadeAt < 5000 + TICK, { armedAt, fadeAt });
  }
  {
    const r = rig(G);
    r.e.overlay = false;
    r.els.delete('ob-boot');
    r.ticks(30);
    const readyAt = r.clock.t;
    r.e.readyAt = readyAt; // ready after the fade
    let armedAt = null;
    for (let i = 0; i < ARM_TICKS + 10 && armedAt === null; i++) { r.tick(); if (r.gate.census().armed) armedAt = r.clock.t; }
    check('arms 5 s after ready when ready came after the fade', armedAt !== null && armedAt - readyAt >= 5000
      && armedAt - readyAt < 5000 + TICK, { armedAt, readyAt });
  }
  {
    const r = rig(G);
    r.e.readyAt = 0;
    r.e.overlay = false; // faded, but #ob-boot never leaves the document
    const s = r.ticks(ARM_TICKS * 2);
    check('a lingering #ob-boot node keeps it unarmed', s === ARM_TICKS * 2 && !r.gate.census().armed);
  }
  {
    const r = rig(G);
    r.win.__obShellArrival = 'pending';
    r.e.readyAt = 0; r.e.overlay = false; r.els.delete('ob-boot');
    r.ticks(ARM_TICKS * 2);
    const pend = r.gate.census().armed;
    r.win.__obShellArrival = 'done';
    r.win.__shell = { moving: () => true };
    r.ticks(30);
    const moving = r.gate.census().armed;
    r.win.__shell = { moving: () => false };
    r.tick();
    check('the shell arrival pending or a flight keeps it unarmed; it arms on the next tick after', !pend && !moving
      && r.gate.census().armed, { pend, moving });
  }
  // an armed gate with nothing going on: trailing, then 15 fps
  {
    const r = armed(G);
    const c = r.gate.census();
    check('armed and idle after the boot', c.armed && c.trailing === 1 && c.skipped > 0, c);
    const s = r.ticks(600);
    check('10 s idle at 60 Hz steps 150 times (15 fps)', s === 150, s);
    const rr = rig(G);
    check('no listener before arming is missing: window capture listeners for every activity and scene event',
      [...DOM_EVENTS, ...SCENE_EVENTS].every((t) => rr.opts.get(t)?.capture === true && rr.opts.get(t)?.passive === true),
      [...DOM_EVENTS, ...SCENE_EVENTS].filter((t) => rr.opts.get(t)?.capture !== true));
    check('visualViewport resize and webglcontextrestored are listened to', rr.opts.has('visualViewport:resize')
      && rr.opts.has('canvas:webglcontextrestored'));
  }
  // each busy signal: steps while it stands (reason = its name), then a trailing frame, then skips
  const sig = (name, set, clear, { settle = 0, lapse = 0 } = {}) => {
    const r = armed(G);
    set(r);
    if (settle) r.ticks(settle);
    const s = r.ticks(6);
    const reason = r.gate.census().last;
    const t0 = r.gate.census().trailing;
    clear(r);
    if (lapse) {
      r.ticks(lapse);
      const c = r.gate.census();
      check(`${name}: busy while it stands; after the clear's window, one trailing frame and idle`, s === 6 && reason === name
        && c.trailing === t0 + 1 && c.last === null, { s, reason, trailing: c.trailing - t0, last: c.last });
      return;
    }
    const trailing = r.tick();
    const after = r.ticks(2);
    check(`${name}: busy while it stands, then one trailing frame, then idle`, s === 6 && reason === name && trailing
      && after === 0, { s, reason, trailing, after });
  };
  const ACT = Math.ceil(2000 / TICK) + 2; // ticks past the activity window
  sig('playback', (r) => r.machine.to('PLAYBACK'), (r) => r.machine.to('SETTLED'), { settle: ACT, lapse: ACT });
  sig('pointer', (r) => r.fire('pointerdown', { pointerId: 7, buttons: 1 }), (r) => r.fire('pointerup', { pointerId: 7 }),
    { settle: ACT, lapse: ACT });
  sig('camera', (r) => { r.S.each = () => { r.camera.position.z += 1e-3; }; }, (r) => { r.S.each = null; });
  sig('camera', (r) => { r.S.each = () => { r.camera.layers.mask ^= 2; }; }, (r) => { r.S.each = null; });
  sig('aim', (r) => { r.S.each = () => { r.e.phi += 1e-4; }; }, (r) => { r.S.each = null; });
  sig('resize', (r) => { r.e.resize = true; }, (r) => { r.e.resize = false; });
  sig('switch', (r) => { r.attrs.add('data-ob-switching'); }, (r) => { r.attrs.delete('data-ob-switching'); });
  sig('switch', (r) => { r.e.holds = 1; }, (r) => { r.e.holds = 0; });
  sig('switch', (r) => { r.e.waiters = 1; }, (r) => { r.e.waiters = 0; });
  sig('stage', (r) => { r.e.stage = 1; }, (r) => { r.e.stage = 0; });
  sig('shell', (r) => { r.win.__shell = { busy: () => true, moving: () => false }; }, (r) => { r.win.__shell = { busy: () => false }; });
  sig('shell', (r) => { r.win.__shell = { moving: () => true }; }, (r) => { r.win.__shell = { moving: () => false }; });
  sig('record', (r) => { r.win.__record = { recording: () => true }; }, (r) => { r.win.__record = { recording: () => false }; });
  sig('track', (r) => { r.win.__track = { active: () => true }; }, (r) => { r.win.__track = { active: () => false }; });
  sig('occlusion', (r) => { r.win.__snkOccl = { pending: () => 2 }; }, (r) => { r.win.__snkOccl = { pending: () => 0 }; });
  sig('gi', (r) => { r.win.__gi = { state: { applySeq: 3, appliedSeq: 2 } }; }, (r) => { r.win.__gi.state.appliedSeq = 3; });
  {
    const r = armed(G);
    r.win.__gi = { state: { appliedSeq: 0 } }; // gi.js before its first apply: ?nogi, or a failed manifest (applySeq undefined)
    r.ticks(8);
    const c = r.gate.census();
    check('gi: a GI that never started an apply is not a signal', c.reasons.gi === 0 && c.last === null, c.reasons);
  }
  sig('decal', (r) => { r.win.__aim = { zoneDecalState: () => ({ fade: 0.4 }) }; }, (r) => { r.win.__aim = { zoneDecalState: () => ({ fade: 1 }) }; });
  sig('venue', (r) => { r.e.venue = false; }, (r) => { r.e.venue = true; }, { settle: 3, lapse: 8 });
  sig('env', (r) => { r.win.__rebakeEnv = { tail: () => ({ left: 2, error: null }) }; },
    (r) => { r.win.__rebakeEnv = { tail: () => ({ left: 0, error: null }) }; });
  sig('atelier', (r) => { r.win.__shell = { isOpen: () => true, busy: () => false }; r.win.__atelier = { floatState: () => ({ staged: true }) }; },
    (r) => { r.win.__shell = { isOpen: () => false, busy: () => false }; });
  const ink = (s, extra = {}) => (r) => { r.win.__aim = { adaptiveInk: () => s, previewVisible: () => true, ...extra }; };
  sig('ink', ink({ reason: 'live', staticFrozen: false }), ink({ reason: 'live', staticFrozen: true }));
  sig('ink', ink({ reason: 'warming', staticFrozen: false }), ink({ reason: 'context-lost', staticFrozen: false }));
  sig('ink', ink({ reason: 'boot-settle', staticFrozen: false }, { previewVisible: () => false, zoneDecalState: () => ({ on: true, pts: [0, 0, 0, 1, 1, 1], fade: 1 }) }),
    ink({ reason: 'boot-settle', staticFrozen: false }, { previewVisible: () => false, zoneDecalState: () => ({ on: true, pts: [0, 0, 0], fade: 1 }) }));
  {
    const r = armed(G);
    r.machine.to('PLAYBACK'); r.machine.to('SETTLED'); r.machine.to('WIN');
    r.ticks(ACT);
    ink({ reason: 'live', staticFrozen: false })(r);
    r.ticks(8);
    const c = r.gate.census();
    check('the ink outside AIM / BALL_IN_HAND is not a signal', c.reasons.ink === 0 && c.last === null, c.reasons);
  }
  // a lamp fade that moved during the last delivered frame
  {
    const r = armed(G);
    let v = 0.4;
    r.win.__lampfade = { value: () => v };
    r.tick(); // the first read
    r.ticks(4);
    v = 0.5;
    const s = r.tick();
    const reason = r.gate.census().last;
    check('lampfade: a fade value that changed since the previous tick is busy', s && reason === 'lampfade', { s, reason });
    check('lampfade: a still value is idle again (trailing, then skips)', r.tick() && r.ticks(2) === 0);
  }
  // activity: every DOM, scene, viewport, context and machine event keeps it busy ACTIVITY_MS, then it goes idle
  {
    const missed = [];
    const events = [...DOM_EVENTS.map((t) => [t, t === 'pointerdown' ? (r) => { r.fire(t); r.fire('pointerup'); } : (r) => r.fire(t)]), ...SCENE_EVENTS.map((t) => [t, (r) => r.fire(t)]),
      ['visualViewport:resize', (r) => r.fire('visualViewport:resize')], ['canvas:webglcontextrestored', (r) => r.fire('canvas:webglcontextrestored')],
      ...MACHINE_EVENTS.map((t) => [t, (r) => r.machine.emit(t, {})])];
    for (const [name, go] of events) {
      const r = armed(G);
      go(r);
      const during = r.ticks(Math.floor(1900 / TICK));
      const reason = r.gate.census().last;
      r.ticks(Math.ceil(200 / TICK) + 1);
      const after = r.gate.census().last;
      if (during !== Math.floor(1900 / TICK) || reason !== 'activity' || after !== null) missed.push({ name, during, reason, after });
    }
    check(`activity: ${events.length} event kinds keep it busy for ACTIVITY_MS, then idle`, missed.length === 0, missed);
  }
  // the pointer set
  {
    const r = armed(G);
    r.fire('pointerdown', { pointerId: 3, buttons: 1 });
    r.fire('blur', { target: {} }); // an element's blur (focus moved inside the page)
    r.fire('lostpointercapture', { pointerId: 3, buttons: 1 }); // capture released, the button still down
    r.fire('pointermove', { pointerId: 3, buttons: 1 });
    r.ticks(ACT);
    check('a held pointer survives an element blur, a capture release with the button down and a move',
      r.gate.census().pointers === 1 && r.ticks(3) === 3 && r.gate.census().last === 'pointer');
    r.fire('pointermove', { pointerId: 3, buttons: 0 }); // the up was missed
    check('a move with no button down drops the pointer', r.gate.census().pointers === 0);
    r.fire('pointerdown', { pointerId: 4, buttons: 1 });
    r.fire('blur', { target: r.win });
    check('the window\'s own blur clears the set', r.gate.census().pointers === 0);
    r.fire('pointerdown', { pointerId: 5, buttons: 1 });
    r.doc.visibilityState = 'hidden';
    r.fire('visibilitychange');
    check('a hidden page clears the set', r.gate.census().pointers === 0);
  }
  {
    const r = armed(G);
    r.fire('pointerdown', { pointerId: 6, buttons: 1 });
    r.ticks(Math.floor(29000 / TICK));
    const held = r.gate.census();
    r.ticks(Math.ceil(1500 / TICK));
    const late = r.gate.census();
    check('a still held pointer stays busy 29 s, and is dropped 30 s after the last pointer event (a lost up)',
      held.last === 'pointer' && held.pointers === 1 && late.pointers === 0 && late.last === null, { held: held.last, late: late.last, n: late.pointers });
  }
  // a still finger on a nudge button for 35 s: no pointer or touch event, while the button's repeat timer writes the azimuth
  // every 66 ms (touchwidgets.js's ratchet). The pointer set still clears at 30 s (the lost-up bound), and every tick that
  // follows an azimuth write renders.
  {
    const r = armed(G);
    r.fire('pointerdown', { pointerId: 8, buttons: 1 });
    const t0 = r.clock.t;
    let next = t0 + 66, changed = false;
    r.S.each = () => { changed = false; while (r.clock.t >= next) { r.e.phi += (0.05 * Math.PI) / 180; next += 66; changed = true; } };
    let held29 = null, cleared31 = null, writes = 0, missed = 0, notAim = 0;
    while (r.clock.t - t0 < 35000) {
      const s = r.tick();
      const dt = r.clock.t - t0;
      if (held29 === null && dt >= 29000) held29 = r.gate.census().pointers;
      if (cleared31 === null && dt >= 31000) cleared31 = r.gate.census().pointers;
      if (!changed) continue;
      writes += 1;
      if (!s) missed += 1;
      if (dt >= 31000 && r.gate.census().last !== 'aim') notAim += 1;
    }
    check('aim: a nudge held 35 s with no pointer event: the pointer set clears at 30 s, and every tick after a write renders',
      held29 === 1 && cleared31 === 0 && writes >= 500 && missed === 0 && notAim === 0, { held29, cleared31, writes, missed, notAim });
  }
  // a caller without the aim read (the mixed-cache rule: a cached main.js from before it) has no aim signal and never throws
  {
    const r = armed(G, { aimPhi: false });
    r.S.each = () => { r.e.phi += 1e-4; };
    r.ticks(30);
    const c = r.gate.census();
    check('aim: an env without aimPhi gives no onError, \'aim\' is never busy, and the gate still idles', r.errors.length === 0
      && c.error === null && c.reasons.aim === 0 && c.skipped > 0, { errors: r.errors.length, error: c.error, aim: c.reasons.aim, skipped: c.skipped });
  }
  // a pointerless activation (assistive technology: a detail-0 click, an input, a change) sent after ACTIVITY_MS wakes the gate
  for (const [type, extra] of [['click', { detail: 0 }], ['input', {}], ['change', {}]]) {
    const r = armed(G);
    r.ticks(ACT); // past ACTIVITY_MS
    for (let i = 0; i < 8 && r.tick(); i++); // end on a skipped tick, so the next delivered one is a wake
    const w0 = r.gate.census().wake;
    r.fire(type, extra);
    const s = r.tick();
    const c = r.gate.census();
    check(`activity: a pointerless ${type} sent after ACTIVITY_MS gives a wake tick, not a skip`, s && c.wake === w0 + 1
      && c.last === 'activity', { s, wake: c.wake - w0, last: c.last });
  }
  // manual mode
  {
    const r = armed(G);
    const ret = [];
    for (let i = 0; i < 5; i++) { r.clock.t += TICK; ret.push(r.gate.tick(r.clock.t, 123, true)); }
    check('manual ticks pass `last` through untouched', ret.every((x) => x === 123), ret);
    const after = r.ticks(Math.floor(1900 / TICK));
    check('the end of manual mode counts as activity', after === Math.floor(1900 / TICK) && r.gate.census().last === 'activity', after);
  }
  // the venue read is throttled to VENUE_READ_MS while idle
  {
    const r = armed(G);
    const n0 = r.e.venueReads;
    r.ticks(60);
    const reads = r.e.venueReads - n0;
    check('venue: read at most every 50 ms while idle (about 20 reads a second at 60 Hz)', reads >= 18 && reads <= 21, reads);
    r.e.venue = false;
    const n1 = r.e.venueReads;
    let s = 0, stepped = false;
    for (let i = 0; i < 6 && !s; i++) { const t = r.tick(); if (r.e.venueReads > n1) { s = i + 1; stepped = t; } }
    check('venue: an unsettled venue steps at the next read, at most 50 ms plus one tick later (4 ticks at 60 Hz)',
      stepped && s > 0 && s <= Math.ceil(50 / TICK) + 1 && r.gate.census().last === 'venue', { s, stepped });
  }
  // a throw inside a probe turns the gate off for good and is reported once
  {
    const r = armed(G);
    r.win.__record = { recording: () => { throw new Error('probe boom'); } };
    let escaped = null, steps = 0;
    try { for (let i = 0; i < 10; i++) if (r.tick()) steps += 1; } catch (e) { escaped = e.message; }
    const c = r.gate.census();
    check('a probe throw never leaves tick(): the tick steps, later ticks step, onError ran once',
      escaped === null && steps === 10 && c.error === 'probe boom' && r.errors.length === 1, { escaped, steps, error: c.error, n: r.errors.length });
  }
  {
    const c = armed(G).gate.census();
    const keys = ['armed', 'armedAt', 'ticks', 'skipped', 'busy', 'wake', 'trailing', 'keepalive', 'reasons', 'last', 'error', 'idleRun',
      'lastActivity', 'pointers'];
    check('the census record', keys.every((k) => k in c) && Object.keys(c.reasons).join() === PINNED_ORDER, Object.keys(c));
  }
  return { failed, count: count() };
}

// (5) main.js's frame() gate line, lifted verbatim
function familyFrame(src) {
  const { check, failed, count } = checker();
  const lines = src.main.split('\n');
  const gateLine = lines.find((l) => l.trim().startsWith('if (idleGate) {'));
  check('main.js: the frame() gate line is liftable', !!gateLine);
  if (!gateLine) return { failed, count: count() };
  const decision = new Function('idleGate', 'now', 'last', 'manual', 'requestAnimationFrame', 'frame', `${gateLine}\nreturn { last };`);
  let raf = 0;
  const rafFn = (f) => { raf += 1; check('the skip re-arms rAF with frame', f === 'frame-fn'); };
  const r1 = decision({ tick: () => null }, 100, 50, false, rafFn, 'frame-fn');
  check('a skipped tick re-arms rAF and returns before the step', r1 === undefined && raf === 1, r1);
  const r2 = decision({ tick: () => 83.25 }, 100, 50, false, rafFn, 'frame-fn');
  check('a stepped tick steps from the gate\'s `last`', r2?.last === 83.25 && raf === 1, r2);
  const r3 = decision(null, 100, 50, false, rafFn, 'frame-fn');
  check('no gate (scripted, ?idlegate=0, stale leaf): the tick steps from `last` untouched', r3?.last === 50 && raf === 1, r3);
  let seen = null;
  decision({ tick: (...a) => { seen = a; return a[1]; } }, 100, 50, true, rafFn, 'frame-fn');
  check('tick() reads now, last and the manual flag', JSON.stringify(seen) === '[100,50,true]', seen);
  return { failed, count: count() };
}

// (6) the wiring census
function familyWiring(src) {
  const { check, failed, count } = checker();
  const m = src.main;
  check('main.js: one namespace import of idlegate.js', m.split("import * as idleGateNs from './idlegate.js';").length === 2);
  check('main.js: no named import from idlegate.js (the ownership ledger rule 5)', !/import\s*\{[^}]*\}\s*from\s*'\.\/idlegate\.js'/.test(m));
  check('main.js: createIdleGate feature-detected', m.includes('idleGateNs.createIdleGate?.({'));
  const mk = m.indexOf('const idleGate = ');
  const mkLine = m.slice(mk, m.indexOf('\n', mk));
  check('main.js: scripted boots and ?idlegate=0 never build the gate', mkLine.includes("scripted || new URLSearchParams(location.search).get('idlegate') === '0' ? null"), mkLine);
  const fAt = m.indexOf('function frame(now) {', mk);
  const made = m.slice(mk, fAt);
  check('main.js: the gate is built before frame() with the boot tail and the canvas', mk > 0 && fAt > mk
    && made.includes('bootTailMs: GATE_BOOT_TAIL_MS') && made.includes('canvas: renderer.domElement') && made.includes('onError:'), { mk, fAt });
  check('main.js: a throw while the gate is built is caught and reported (the loop still starts)',
    made.includes("} catch (e) { reportError('idle gate: ' + (e?.message ?? String(e))); return null; }"));
  const envRead = [...new Set([...src.gate.matchAll(/env\.(\w+)(?:\?\.)?\(/g)].map((x) => x[1]))].sort(); // a call or a feature-detected one
  const envGiven = [...new Set([...(made.match(/env: \{([\s\S]*?)\} \}\)/)?.[1] ?? '').matchAll(/(\w+):/g)].map((x) => x[1]))].sort();
  check('main.js: env gives exactly the reads idlegate.js makes', envRead.length === 8 && envRead.join() === envGiven.join(), { envRead, envGiven });
  const fStart = m.indexOf('  function frame(now) {');
  const fEnd = m.indexOf('\n  requestAnimationFrame(frame);\n', fStart);
  const at = (needle) => { const i = m.indexOf(needle, fStart); return i > fStart && i < fEnd ? i : -1; };
  const iGpu = at('if (gpuGate && !manual && gpuGate.hold())');
  const iGate = at('if (idleGate) { const l = idleGate.tick(now, last, manual);');
  const iResize = at('if (resizeHeld) { resizeHeld = false;');
  const iDt = at('const dt = Math.min(0.1, (now - last) / 1000);');
  check('main.js: in frame(), the gate after the gpuGate hold, before the held-resize landing and the dt',
    iGpu > 0 && iGate > iGpu && iResize > iGate && iDt > iResize, { iGpu, iGate, iResize, iDt });
  check('main.js: the census on __test', m.includes('idleGate: () => (idleGate ? idleGate.census() : null),'));
  const rOpts = m.slice(m.indexOf('const renderer = new THREE.WebGLRenderer(bakeAlpha'), m.indexOf('renderer.setSize(W, H);'));
  const [bakeBranch, shipped] = rOpts.split('\n    : ');
  check('main.js: canvas depth off on the shipped renderer on interactive boots only; the bake renderer unchanged',
    /^\{ antialias: false, depth: scripted, powerPreference: 'high-performance' \}\);/.test(shipped ?? '') && !bakeBranch.includes('depth'),
    { shipped: shipped?.slice(0, 80), bake: bakeBranch.slice(-120) });
  const p = src.postfx;
  check('postfx.js: the composer target resolves colour only', p.includes('new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples, resolveDepthBuffer: false })'));
  const iLoop = p.indexOf('for (const t of [bloom.renderTargetBright, ...bloom.renderTargetsHorizontal, ...bloom.renderTargetsVertical]) t.depthBuffer = false;');
  check('postfx.js: the 11 bloom targets carry no depth buffer, set before the pass is added', iLoop > 0 && iLoop < p.indexOf('composer.addPass(bloom);'));
  const iReg = p.indexOf("Object.defineProperty(bloom, 'strength', {");
  const iWrap = p.indexOf('  skipZeroBloom(bloom);');
  check('postfx.js: the bloom wrapper installed after the strength register', iReg > 0 && iWrap > iReg && p.split('skipZeroBloom(bloom);').length === 2);
  check('postfx.js: bloom.enabled never written', !/bloom\.enabled\s*=/.test(p));
  check('shell.js: __shell.busy (a flight, the open ramp, a keys change at main\'s seam)',
    src.shell.includes('    busy: () => mover.moving() || !!ramp || keysPending > 0,'));
  return { failed, count: count() };
}

// (7) postfx.js's bloom wrapper, lifted verbatim
function familyBloom(src) {
  const { check, failed, count } = checker();
  const p = src.postfx;
  const at = p.indexOf('function skipZeroBloom(bloom) {');
  const end = p.indexOf('\n}\n', at);
  check('postfx.js: skipZeroBloom is liftable', at > 0 && end > at);
  if (!(at > 0 && end > at)) return { failed, count: count() };
  const skipZeroBloom = new Function(`${p.slice(at, end + 2)}\nreturn skipZeroBloom;`)();
  const calls = [];
  let strength = 0;
  const pass = { enabled: true, renderToScreen: false, render(...a) { calls.push([this, ...a]); } };
  Object.defineProperty(pass, 'strength', { get: () => strength });
  skipZeroBloom(pass);
  pass.render('R', 'W', 'B', 0.016, false);
  check('the first render runs at strength 0 (its programs compile at boot)', calls.length === 1);
  check('the pass and every argument are forwarded', calls[0]?.[0] === pass && calls[0].slice(1).join() === 'R,W,B,0.016,false', calls[0]?.slice(1));
  pass.render('R', 'W', 'B', 0.016, false);
  pass.render('R', 'W', 'B', 0.016, false);
  check('later renders at strength 0 return at once', calls.length === 1, calls.length);
  strength = 0.03;
  pass.render('R', 'W', 'B', 0.016, false);
  check('strength 0.03 (the tournament look) renders', calls.length === 2, calls.length);
  strength = 0;
  pass.renderToScreen = true;
  pass.render('R', 'W', 'B', 0.016, false);
  check('a pass rendering to the screen renders at strength 0', calls.length === 3, calls.length);
  pass.renderToScreen = false;
  pass.render('R', 'W', 'B', 0.016, false);
  strength = 0.16;
  pass.render('R', 'W', 'B', 0.016, false);
  check('the effective strength is read on every call', calls.length === 4, calls.length);
  check('enabled is left alone', pass.enabled === true);
  return { failed, count: count() };
}

// one rule broken per copy; each must turn its family RED
const PLANTS = [
  ['wake edge removed', 'gate', 'out = st.skipped > 0 ? Math.max(last, st.prevTick) : last; // the wake edge steps one vsync', 'out = last;', 'step'],
  ['trailing frame removed', 'gate', "if (st.idleRun === 1) { st.kind = 'trailing'; out = last; }", "if (false) { st.kind = 'trailing'; out = last; }", 'step'],
  ['no keepalive slack', 'gate', 'const KEEPALIVE_SLACK_MS = 4;', 'const KEEPALIVE_SLACK_MS = 0;', 'step'],
  ['keepalive schedule restarts at the tick', 'gate', 'Math.max(st.keepaliveAt + KEEPALIVE_MS, now + KEEPALIVE_MS - KEEPALIVE_SLACK_MS)',
    'now + KEEPALIVE_MS - KEEPALIVE_SLACK_MS', 'step'],
  ['the last busy signal wins', 'gate', 'for (const name of BUSY_ORDER) if (s[name]) return name;\n  return null;',
    'let r = null;\n  for (const name of BUSY_ORDER) if (s[name]) r = name;\n  return r;', 'predicate'],
  ['coarse camera epsilon', 'gate', 'if (Math.abs(a[i] - b[i]) > 1e-6) return true;', 'if (Math.abs(a[i] - b[i]) > 1e-3) return true;', 'signature'],
  ['any blur clears the pointers', 'gate', "(t === 'blur' && e.target === win)", "t === 'blur'", 'live'],
  ['a held pointer never goes stale', 'gate', 'if (cur.now - lastPointer < POINTER_STALE_MS) return true;', 'return true;', 'live'],
  ['arms with #ob-boot in the document', 'gate', " || doc.getElementById('ob-boot')", '', 'live'],
  ['a probe throw escapes tick()', 'gate', 'census.error = String(e?.message ?? e);', 'throw e;', 'live'],
  ['manual mode is not activity', 'gate', 'if (manual) { lastActivity = now; pass(now); return last; }', 'if (manual) { pass(now); return last; }', 'live'],
  ['the venue read unthrottled', 'gate', 'if (cur.now - venueAt >= VENUE_READ_MS)', 'if (true)', 'live'],
  ['scene events in the bubble phase', 'gate', 'for (const t of SCENE_EVENTS) win.addEventListener(t, mark, opts);',
    'for (const t of SCENE_EVENTS) win.addEventListener(t, mark);', 'live'],
  ['gi without the never-started guard', 'gate', 's.applySeq !== undefined && s.applySeq !== s.appliedSeq', 's.applySeq !== s.appliedSeq', 'live'],
  ['click dropped from the activity events', 'gate', "  'click', 'input', 'change'];", "  'input', 'change'];", 'live'],
  ['the aim probe removed', 'gate', '    aim: () => cur.aimed,\n', '', 'live'],
  ['the aim read without its feature detect', 'gate', 'const p = env.aimPhi?.() ?? null;', 'const p = env.aimPhi();', 'live'],
  ['a skipped tick that does not re-arm rAF', 'main', 'if (l === null) { requestAnimationFrame(frame); return; }',
    'if (l === null) { return; }', 'frame'],
  ['the gate built unguarded', 'main', "    } catch (e) { reportError('idle gate: ' + (e?.message ?? String(e))); return null; }",
    '    } finally { /* planted: a throw escapes */ }', 'wiring'],
  ['the gate after the held-resize landing', 'main', null, null, 'wiring'],
  ['a named import', 'main', "import * as idleGateNs from './idlegate.js';", "import { createIdleGate as idleGateNs } from './idlegate.js';", 'wiring'],
  ['scripted boots gated', 'main', "scripted || new URLSearchParams(location.search).get('idlegate') === '0' ? null",
    "new URLSearchParams(location.search).get('idlegate') === '0' ? null", 'wiring'],
  ['canvas depth off on every boot', 'main', "depth: scripted, powerPreference", 'depth: false, powerPreference', 'wiring'],
  ['resolve keeps depth', 'postfx', 'samples, resolveDepthBuffer: false })', 'samples })', 'wiring'],
  ['__shell.busy without the keys change', 'shell', ' || !!ramp || keysPending > 0,', ' || !!ramp,', 'wiring'],
  ['bloom skipped before its first render', 'postfx', 'if (rendered && !bloom.renderToScreen && bloom.strength === 0) return;',
    'if (!bloom.renderToScreen && bloom.strength === 0) return;', 'bloom'],
  ['a to-screen bloom skipped', 'postfx', 'if (rendered && !bloom.renderToScreen && bloom.strength === 0) return;',
    'if (rendered && bloom.strength === 0) return;', 'bloom'],
];

const FAMILIES = {
  predicate: (G) => familyPredicate(G), step: (G) => familyStep(G), signature: (G) => familySignature(G), live: (G) => familyLive(G),
  frame: (G, s) => familyFrame(s), wiring: (G, s) => familyWiring(s), bloom: (G, s) => familyBloom(s),
};

let checks = 0, fails = 0;
const G = await load(SRC.gate);
for (const [name, fam] of Object.entries(FAMILIES)) {
  let res;
  try { res = fam(G, SRC); } catch (e) { res = { failed: [`threw: ${e.message}`], count: 1 }; }
  checks += res.count;
  for (const f of res.failed) { fails += 1; console.log(`FAIL ${name}: ${f}`); }
}
let red = 0;
for (const [name, file, from, to, fam] of PLANTS) {
  const src = { ...SRC };
  if (from === null) { // move the gate line below the held-resize landing
    const lines = SRC.main.split('\n');
    const gi = lines.findIndex((l) => l.trim().startsWith('if (idleGate) {'));
    const ri = lines.findIndex((l) => l.trim().startsWith('if (resizeHeld) { resizeHeld = false;'));
    if (gi < 0 || ri < 0) { fails += 1; console.log(`FAIL plant '${name}': its anchors are missing`); continue; }
    const g = lines.splice(gi, 1)[0];
    lines.splice(lines.findIndex((l) => l.trim().startsWith('if (resizeHeld) { resizeHeld = false;')) + 1, 0, g);
    src.main = lines.join('\n');
  } else {
    if (SRC[file].split(from).length !== 2) { fails += 1; console.log(`FAIL plant '${name}': its anchor does not occur exactly once`); continue; }
    src[file] = SRC[file].replace(from, () => to);
  }
  let res;
  try { res = FAMILIES[fam](file === 'gate' ? await load(src.gate) : G, src); } catch (e) { res = { failed: [`threw: ${e.message}`], count: 1 }; }
  checks += 1;
  if (res.failed.length === 0) { fails += 1; console.log(`FAIL plant '${name}' stayed GREEN in family ${fam}`); continue; }
  red += 1;
  console.log(`plant RED '${name}' (${fam}, ${res.failed.length} failed): ${res.failed[0].slice(0, 150)}`);
}
console.log(`${fails === 0 ? 'PASS' : 'FAIL'} test-idlegate: ${checks} checks, ${fails} failed; ${red}/${PLANTS.length} plants RED`);
process.exit(fails === 0 ? 0 : 1);
