// Copyright (c) Meta Platforms, Inc. and affiliates.

// idlegate.js — the idle frame gate (idle-render unit 1). A pure leaf with no import-time side effects: main.js reaches it through a
// namespace import and feature detection (the ownership ledger rule 5), so a stale or missing copy keeps the full-rate loop.
//
// main.js's frame() renders the whole post-processed scene on every rAF tick. On an interactive boot, once the boot is over, this
// gate lets a tick through only while something can change what the canvas shows. An idle tick re-arms rAF and returns without a
// step: no game update, no 'frame' hook, no render. An idle stretch still delivers a keepalive frame about every KEEPALIVE_MS
// (a gap may come up to 2 x KEEPALIVE_SLACK_MS early; the long-run rate stays at or below 15 fps), so a change no signal sees
// is drawn within about one keepalive interval.
//
// The clock: on an idle tick main.js leaves `last` at the last delivered frame, so a keepalive frame steps the real elapsed time
// (under main.js's 0.1 s clamp). The one exception is the idle-to-busy edge: when ticks were skipped since the last delivered frame,
// `last` moves to the previous tick, so the first busy frame steps one vsync, as it does at full rate (a shot fired from idle is
// first drawn one vsync in, with no cue-pull snap and no jump in the aim chase).
//
// The gate arms once, on the first tick where the boot is over: ready has been seen (gateReadyAt), the #ob-boot overlay node is
// gone, bootTailMs (main.js's GATE_BOOT_TAIL_MS) has passed since the later of ready and the fade's start, the shell arrival has
// settled and no shell flight runs. The fade, the opening flight, previewink's boot embargo and the boot window the compile
// measurements read all run at full rate before it.

export const IDLE_FPS = 15;
export const KEEPALIVE_MS = 1000 / IDLE_FPS;
export const ACTIVITY_MS = 2000; // input, a machine event or a scene event keeps the loop at full rate this long
// a keepalive may come this much early (rAF timestamps jitter); each one moves the schedule by a whole KEEPALIVE_MS, so the
// long-run rate stays at or below IDLE_FPS
const KEEPALIVE_SLACK_MS = 4;
const VENUE_READ_MS = 50; // the venue term is read at most this often while idle (its read builds the lighting state record)
const POINTER_STALE_MS = 30000; // a pointer held down this long with no pointer or touch event is dropped (a lost up)
const SIG_LEN = 24; // position 3, quaternion 4, projection 16, layer mask 1

// The busy signals, in the order the live gate reads them (cheapest first; the first busy one wins). Each name is a reason that
// __test.idleGate() counts and the gate's selftest checks.
export const BUSY_ORDER = Object.freeze([
  'playback',  // machine state PLAYBACK: game.update and the shot presentation run
  'activity',  // input, a resize, a focus change, a machine event or a scene event within ACTIVITY_MS
  'pointer',   // a pointer is down (a held, still touch repeats aim nudges from a timer with no further events), up to 30 s;
               // past that bound the 'aim' signal sees the repeats
  'camera',    // the camera's position, rotation, projection or layers moved since the previous tick (chase, fov settle, flights)
  'aim',       // the cue's azimuth (main's game.phi) changed since the previous tick: a nudge repeat timer, an assistive nudge
  'resize',    // a resize held by a compile hold lands in the next step that renders (setSize clears the drawing buffer)
  'switch',    // the game-switch overlay stands (html[data-ob-switching]), holds the loop, or waits for a delivered frame
  'stage',     // a staged light-set change is compiled and waiting at main.js's seam
  'shell',     // a shell or atelier camera flight, the shell's open ramp, or a hall-key change at main.js's seam
  'record',    // the realtime recorder is capturing the canvas
  'track',     // a camera track follower runs
  'occlusion', // the snooker occlusion bake is still draining
  'gi',        // a GI apply has started and not completed
  'lampfade',  // the occluder fade moved during the last delivered frame
  'decal',     // the drill objective-zone decal is fading in or out
  'venue',     // the venue term is not settled (capture, staging or a queued env rebake)
  'env',       // env-cube bakes are still queued (one runs per delivered frame)
  'atelier',   // a cue float is staged at the equipment station (its turntable spins at panel rate)
  'ink',       // the adaptive preview ink samples or solves and has not frozen
]);

/** The busy predicate: the first name in BUSY_ORDER whose signal in `s` is truthy, or null when the tick is idle. `s` is a plain
 * record in the selftest; the live gate hands it a record whose fields read the probes, so the reads stop at the first busy one. */
export function busyReason(s) {
  for (const name of BUSY_ORDER) if (s[name]) return name;
  return null;
}

/** The gate's step, pure over its state record `st` ({ idleRun, skipped, keepaliveAt, prevTick, kind }). Returns the `last`
 * main.js steps from on this tick, or null to skip the tick. */
export function decide(st, now, last, reason) {
  let out = null;
  if (reason !== null) {
    st.kind = st.skipped > 0 ? 'wake' : 'busy';
    out = st.skipped > 0 ? Math.max(last, st.prevTick) : last; // the wake edge steps one vsync
    st.idleRun = 0;
  } else {
    st.idleRun += 1;
    // the first idle tick after a busy one still renders: a signal clears in the task that made its last visual write (a stage
    // apply, a venue accept), and an env bake lands after the render that ran it
    if (st.idleRun === 1) { st.kind = 'trailing'; out = last; }
    else if (now >= st.keepaliveAt - KEEPALIVE_SLACK_MS) { st.kind = 'keepalive'; out = last; }
    else st.kind = 'skip';
  }
  st.prevTick = now;
  if (out === null) { st.skipped += 1; return null; }
  st.skipped = 0;
  st.keepaliveAt = st.kind === 'keepalive' ? Math.max(st.keepaliveAt + KEEPALIVE_MS, now + KEEPALIVE_MS - KEEPALIVE_SLACK_MS)
    : now + KEEPALIVE_MS;
  return out;
}

/** Write the camera's signature (position, quaternion, projection matrix, layer mask) into `out`, a Float64Array of SIG_LEN.
 * matrixWorld is not used: it is stale until the render updates it. */
export function cameraSignature(camera, out) {
  const p = camera.position, q = camera.quaternion, m = camera.projectionMatrix.elements;
  out[0] = p.x; out[1] = p.y; out[2] = p.z;
  out[3] = q.x; out[4] = q.y; out[5] = q.z; out[6] = q.w;
  for (let i = 0; i < 16; i++) out[7 + i] = m[i];
  out[23] = camera.layers.mask;
  return out;
}

/** True when two camera signatures differ by more than a sub-pixel amount: 1 µm of position, 1e-7 of a quaternion component,
 * 1e-7 relative of a projection element, or any layer change. An exponential chase keeps making deltas far below a pixel for a
 * while after it looks still; those do not count. */
export function signatureMoved(a, b) {
  for (let i = 0; i < 3; i++) if (Math.abs(a[i] - b[i]) > 1e-6) return true;
  for (let i = 3; i < 7; i++) if (Math.abs(a[i] - b[i]) > 1e-7) return true;
  for (let i = 7; i < 23; i++) if (Math.abs(a[i] - b[i]) > 1e-7 * (1 + Math.abs(a[i]))) return true;
  return a[23] !== b[23];
}

// DOM events that count as activity. They are read on window in the capture phase: the shell's canvas gate registers after these
// and cannot hide them; main.js's switch shield registers before them and swallows trusted action events while
// html[data-ob-switching] stands, a window the 'switch' signal covers. The pointer events also track which pointers are down.
const DOM_ACTIVITY = ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'lostpointercapture', 'wheel', 'keydown', 'keyup',
  'touchstart', 'touchmove', 'touchend', 'touchcancel', 'contextmenu', 'resize', 'orientationchange', 'focus', 'blur', 'pageshow',
  'visibilitychange',
  // semantic activations: an assistive-technology or programmatic activation of a control fires these with no pointer or key
  // event (a button's click, a slider's or a toggle's input and change)
  'click', 'input', 'change'];
// app events that change the scene with no input: settings commits and stagings (capture: table.js stops a pending equipment
// broadcast), the lighting leaf, the studio rig, table readiness, a deferred re-rack, the shell's band geometry
const SCENE_EVENTS = ['ob:settings', 'ob:relight', 'ob:cinelight', 'ob:table-state', 'ob:table-refused', 'ob:export-idle',
  'ob:shell-bands'];
// machine events: racks, layouts, shot starts and settles, drill re-lays, share-replay shots, flow's adjudications
const MACHINE_EVENTS = ['stateChange', 'shotComplete', 'playerChanged', 'foulCalled', 'gameWon'];
const INK_ALIVE = new Set(['live', 'warming', 'boot-settle']);

/**
 * The live gate. `env` reads main.js's own state: gateReadyAt(), overlayUp(), holds(), waiters(), stagePending(), resizeHeld(),
 * venueSettled(), and aimPhi() when present (a caller without it, such as a cached main.js from before that read, has no aim
 * signal). `win` and `doc` default to the page's (the selftest passes stand-ins).
 * tick(now, last, manual) returns the `last` main.js steps from on this tick, or null to skip it; census() is the record
 * __test.idleGate() returns. A throw inside tick() turns the gate off for good (every later tick steps) and goes to onError once.
 */
export function createIdleGate({ machine, camera, canvas = null, bootTailMs = 5000, env, onError = null,
  win = globalThis.window, doc = globalThis.document }) {
  let lastActivity = -Infinity, lastPointer = -Infinity;
  const pointers = new Set();
  const mark = () => { lastActivity = win.performance.now(); };
  const onDom = (e) => {
    mark();
    const t = e.type;
    if (t.startsWith('pointer') || t.startsWith('touch') || t === 'lostpointercapture') lastPointer = lastActivity;
    if (t === 'pointerdown') pointers.add(e.pointerId);
    else if (t === 'pointerup' || t === 'pointercancel') pointers.delete(e.pointerId);
    else if (t === 'pointermove' || t === 'lostpointercapture') { if (!e.buttons) pointers.delete(e.pointerId); }
    else if ((t === 'blur' && e.target === win) || (t === 'visibilitychange' && doc.visibilityState === 'hidden')) pointers.clear();
  };
  const opts = { capture: true, passive: true };
  for (const t of DOM_ACTIVITY) win.addEventListener(t, onDom, opts);
  for (const t of SCENE_EVENTS) win.addEventListener(t, mark, opts);
  win.visualViewport?.addEventListener?.('resize', mark, { passive: true });
  canvas?.addEventListener?.('webglcontextrestored', mark); // a restored context needs a repaint
  for (const ev of MACHINE_EVENTS) machine.on(ev, mark);

  let sigA = new Float64Array(SIG_LEN), sigB = new Float64Array(SIG_LEN), sigFresh = false;
  let fade = null; // the occluder fade's value at the previous tick
  let phi = null; // the cue's azimuth at the previous tick
  let venueAt = -Infinity, venueBusy = false;
  const cur = { now: 0, moved: false, aimed: false, faded: false };
  const probes = {
    playback: () => machine.state === 'PLAYBACK',
    activity: () => cur.now - lastActivity < ACTIVITY_MS,
    pointer: () => {
      if (pointers.size === 0) return false;
      if (cur.now - lastPointer < POINTER_STALE_MS) return true;
      pointers.clear(); // an up that never came: no pointer or touch event for POINTER_STALE_MS
      return false;
    },
    camera: () => cur.moved,
    aim: () => cur.aimed,
    resize: () => env.resizeHeld() === true,
    switch: () => doc.documentElement.hasAttribute('data-ob-switching') || env.holds() > 0 || env.waiters() > 0,
    stage: () => env.stagePending() > 0,
    shell: () => { const s = win.__shell; return !!s && (typeof s.busy === 'function' ? s.busy() : s.moving?.()) === true; },
    record: () => win.__record?.recording?.() === true,
    track: () => win.__track?.active?.() === true,
    occlusion: () => (win.__snkOccl?.pending?.() ?? 0) > 0,
    // gi.js's own open-sequence rule (probeState's seqOpen): applySeq stays undefined until an apply starts (?nogi, a failed
    // manifest), and appliedSeq starts at 0
    gi: () => { const s = win.__gi?.state; return !!s && s.applySeq !== undefined && s.applySeq !== s.appliedSeq; },
    lampfade: () => cur.faded,
    decal: () => { const z = win.__aim?.zoneDecalState?.(); return !!z && z.fade > 0 && z.fade < 1; },
    venue: () => {
      if (cur.now - venueAt >= VENUE_READ_MS) { venueAt = cur.now; venueBusy = env.venueSettled() !== true; }
      return venueBusy;
    },
    env: () => { const t = win.__rebakeEnv?.tail?.(); return !!t && t.left > 0 && !t.error && win.__cinelight !== true; },
    atelier: () => win.__shell?.isOpen?.() === true && win.__atelier?.floatState?.()?.staged === true,
    ink: () => {
      const st = machine.state;
      if (st !== 'AIM' && st !== 'BALL_IN_HAND') return false;
      const aim = win.__aim, s = aim?.adaptiveInk?.();
      if (!s || !INK_ALIVE.has(s.reason) || s.staticFrozen) return false;
      if (aim.previewVisible?.() === true) return true;
      const z = aim.zoneDecalState?.();
      return !!(z?.on && z.pts?.length >= 6); // previewink's live zone (its hidden-line branch still samples)
    },
  };
  // the record busyReason reads: each field runs its probe when read
  const signals = Object.create(null);
  for (const name of BUSY_ORDER) Object.defineProperty(signals, name, { get: probes[name] });

  const st = { idleRun: 0, skipped: 0, keepaliveAt: -Infinity, prevTick: -Infinity, kind: 'off' };
  const census = { armed: false, armedAt: null, ticks: 0, skipped: 0, busy: 0, wake: 0, trailing: 0, keepalive: 0,
    reasons: Object.fromEntries(BUSY_ORDER.map((n) => [n, 0])), last: null, error: null };
  let armed = false, fadeAt = null;
  const armable = (now) => {
    if (fadeAt === null && !env.overlayUp()) fadeAt = now;
    const ready = env.gateReadyAt();
    if (ready === null || fadeAt === null || doc.getElementById('ob-boot')) return false;
    if (now - Math.max(ready, fadeAt) < bootTailMs) return false;
    return win.__obShellArrival !== 'pending' && win.__shell?.moving?.() !== true;
  };
  // a tick that steps without the gate's say (before arming, manual mode): the next decision starts from it
  const pass = (now) => { st.prevTick = now; st.keepaliveAt = now + KEEPALIVE_MS; st.skipped = 0; st.idleRun = 0; };

  const step = (now, last, manual) => {
    cameraSignature(camera, sigB);
    cur.now = now;
    cur.moved = sigFresh && signatureMoved(sigB, sigA);
    const t = sigA; sigA = sigB; sigB = t;
    sigFresh = true;
    // the aim and the lamp fade compare with the previous tick, read on every tick (before arming too), so the first armed tick
    // compares with a real value
    const p = env.aimPhi?.() ?? null;
    cur.aimed = phi !== null && !Object.is(p, phi);
    phi = p;
    const f = win.__lampfade?.value?.() ?? null;
    cur.faded = f !== fade;
    fade = f;
    // manual mode (an offline render, the live replay player): frame() renders nothing itself, and its end counts as activity
    if (manual) { lastActivity = now; pass(now); return last; }
    if (!armed) {
      if (!armable(now)) { pass(now); return last; }
      armed = true;
      census.armed = true;
      census.armedAt = Math.round(now);
    }
    const reason = busyReason(signals);
    const out = decide(st, now, last, reason);
    if (reason !== null) census.reasons[reason] += 1;
    census[st.kind === 'skip' ? 'skipped' : st.kind] += 1;
    census.last = reason;
    return out;
  };

  return {
    tick(now, last, manual) {
      census.ticks += 1;
      if (census.error !== null) return last;
      try {
        return step(now, last, manual);
      } catch (e) {
        census.error = String(e?.message ?? e);
        try { onError?.(e); } catch { /* the report must not stop the loop */ }
        return last;
      }
    },
    census: () => ({ ...census, reasons: { ...census.reasons }, idleRun: st.idleRun, lastActivity: Math.round(lastActivity),
      pointers: pointers.size }),
  };
}
