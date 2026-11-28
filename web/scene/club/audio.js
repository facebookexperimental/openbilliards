// Copyright (c) Meta Platforms, Inc. and affiliates.

// audio.js — the audio service of the opt-in `club` look (CONTRACT.md 12.2): `createAudio(club)`.
// A quiet club room around the table: room tone, a few sparse far sounds that belong to the room, and chalk on the tip
// between some shots. Everything is synthesised in code (audio/render.js); no file is requested. The app's own sounds
// (balls, cushions, pockets, the cue strike, rolling, bed landings, the return track) are not touched, not copied and not
// doubled: this service adds only where the app is silent.
//
// ONE AUDIO PATH, AND WHY THIS SERVICE HAS ITS OWN CONTEXT. The app's AudioContext, its master gain and its noise buffer
// live in a closure of web/app/sound.js (`let audio = null` inside createSound); `window.__sound` and `ctx.sound` expose
// setMuted, setVolume, the getters muted / volume / scheduled, and captureStream() only. captureStream() returns a
// MediaStream of the master mix, not a node to connect to, and calling it sets the app's gesture latch and creates the
// app's context: it is never called here. With no accessor and no app edit allowed this round, the service creates a
// second AudioContext and makes it behave as one path would:
//   - it is created only after a real user gesture, by the same test the app uses (transient user activation inside a
//     trusted pointerdown / pointerup / keydown; the sticky `hasBeenActive` for a context made outside a handler), and it
//     keeps listening until the context really runs, and again whenever it leaves `running` by itself;
//   - its output gain follows `window.__sound.muted` and `window.__sound.volume` on every delivered frame (and on
//     `ob:settings`, on a state change and on a half-second timer, because the app does not deliver frames while it idles)
//     with a 30 ms ramp; without `window.__sound` it stays silent;
//   - it is suspended while the page is hidden, and after 3 s of mute or volume 0; nothing is created at all while the
//     app is muted;
//   - it goes to its own destination only: the in-app recording taps the APP's master (sound.js captureStream), and the
//     export renders the APP's voice plan offline (export-audio.js), so nothing of this service is in either.
// The seam that would make it one context is one accessor in sound.js (the round-4 sound study names it); see the report.
//
// TWO LEVELS, AND THE PROOF THE HIGH ONE NEEDS. The ruling: ambience stays below the game's sounds. The app voices its
// impacts from a recorded bank when it has one and from a modal fallback, 24 dB quieter, when it has not (a failed load,
// or a shot struck before the load ended). Nothing public says which. So the service starts LOW (plan.js LOW_TRIM: room
// and chalk each at least 6 dB under the FALLBACK's medium click, 50 ms level and peak) and steps up to plan.js LEVELS
// only when all three hold: (a) every file of the bank has, among the page's own resource entries
// (`performance.getEntriesByType('resource')`, read-only), a finished response with a success status and a body
// (plan.js bankProof); (b) that has stood for a second (the app builds the bank right after the last response); (c) no
// playback is running and the app's voices are over (a shot is voiced one way for its whole length, decided when it
// starts). Where the proof cannot be made (an engine without `responseStatus`, entries dropped from a full buffer, a
// renamed file) the service stays low for the page load. It never steps down: the app keeps a bank once it has one.
//
// LAWS (CONTRACT.md 12.3). Read-only: the service reads `machine.state`, `game.shotIndex`, the camera's view matrix,
// `window.__sound` and the page's resource entries; it writes nothing outside itself. Listeners never throw: every body
// runs inside guard(); a part that throws is switched off with a note, the rest goes on. Nothing exists with the look off
// (this module is loaded by club/index.js only) and with `?clubaudio=off` (no listener, no context, no node). Plans are
// pure functions of a seed and an index or a time (audio/plan.js); no Math.random. ONE wall-clock read, when the service
// starts: the seed of this page load's plan (the lead's ruling: the ambience is live-only and never exported, so it may
// differ between sessions; `?clubaudioseed=<n>` fixes it for tests and proofs). After that the only clock is the audio
// context's. What a shot decides (chalk or not, and which take) is a function of that seed and the shot index, nothing
// else. The BUFFERS are always rendered from the fixed AUDIO_SEED, so the sounds that were measured are the sounds
// that play.
//
// Switches: `?clubaudio=off|sfx|full` (tiers.js audioFor; `sfx` = chalk only, `full` = the room as well),
// `?clubaudioseed=<int>` (tools). `set({ mode, levels, seed })` at run time.
import * as tiers from './tiers.js';
import { AUDIO_SEED, LEVELS, LOW_TRIM, TIMING, chalkPlan, chalkEarliest, farEvents, panFor, parseMode, sessionSeed, bankProof } from './audio/plan.js';
import { renderAssets, describeAssets } from './audio/render.js';
import { buildGraph } from './audio/graph.js';

const GESTURES = Object.freeze(['pointerdown', 'pointerup', 'keydown']);
const MAX_ERRORS = 8;      // this many caught errors switch the whole service off
const TIMER_MS = 500;      // the housekeeping timer (the app delivers no frames while it idles)
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const text = (e) => String(e?.message ?? e);

function offService(reason) {
  const st = { enabled: false, mode: 'off', reason, context: 'none', contexts: 0, listeners: 0, sources: { started: 0, live: 0 }, notes: [] };
  return { enabled: false, reason, state: () => ({ ...st, sources: { ...st.sources }, notes: [] }), set: () => false, dispose() {} };
}

/**
 * Build the audio service. `club` is the installer's object (its `ctx.machine`, `ctx.game`, `ctx.camera`, `ctx.query`,
 * `knobs`, `onFrame`). `deps` (dev pages and node arms only; the installer passes none) replaces the platform:
 * { window, navigator, document, performance, now, AudioContext, OfflineAudioContext, render, setInterval, clearInterval }.
 * Resolves to { enabled, reason?, state(), set(opts), dispose() }; never rejects.
 */
export async function createAudio(club, deps = {}) {
  const win = deps.window ?? (typeof window !== 'undefined' ? window : null);
  const nav = deps.navigator ?? (typeof navigator !== 'undefined' ? navigator : null);
  const doc = deps.document ?? (typeof document !== 'undefined' ? document : null);
  const Live = deps.AudioContext ?? (typeof AudioContext !== 'undefined' ? AudioContext : undefined);
  const Offline = deps.OfflineAudioContext ?? (typeof OfflineAudioContext !== 'undefined' ? OfflineAudioContext : undefined);
  const render = typeof deps.render === 'function' ? deps.render : renderAssets;
  const setTimer = deps.setInterval ?? ((fn, ms) => setInterval(fn, ms));
  const clearTimer = deps.clearInterval ?? ((id) => clearInterval(id));
  const perf = deps.performance ?? (typeof performance !== 'undefined' ? performance : null);

  const ctx = club?.ctx ?? null;
  const qget = (k) => { try { return ctx?.query?.get?.(k) ?? null; } catch { return null; } };
  // Round A1 (CONTRACT.md 13.3): the venue's cap. Under the `arena` venue the mode stops at the venue row's `audioMax`
  // ('sfx': the hall has no room ambience this round), at boot, for `?clubaudio=full` and for set({ mode }) alike. Under the
  // club venue `venueMax` is null and capMode() returns its argument: nothing below takes another path.
  let venueMax = null;
  try { venueMax = typeof tiers.isArena === 'function' && tiers.isArena(club) ? (tiers.venueKnobsOf(club)?.audioMax ?? null) : null; } catch { venueMax = null; }
  const MODES = ['off', 'sfx', 'full'];
  const capMode = (m) => (venueMax !== null && MODES.includes(venueMax) && MODES.indexOf(m) > MODES.indexOf(venueMax) ? venueMax : m);
  let mode;
  {
    let tierMode;
    try { tierMode = typeof tiers.audioFor === 'function' ? tiers.audioFor(club?.knobs, ctx?.query)?.mode : club?.knobs?.audio; } catch { tierMode = club?.knobs?.audio; }
    mode = capMode(parseMode(qget('clubaudio'), tierMode));
  }
  if (mode === 'off') return offService('off (?clubaudio=off, or the tier knob `audio`)');
  if (typeof Live !== 'function') return offService('no AudioContext in this engine');

  const machine = ctx?.machine ?? null;
  // the game, for reads only (the motion service's read-only view of it when there is one)
  const game = club?.motion?.kit?.dust?.game ?? club?.motion?.kit?.marks?.game ?? ctx?.game ?? null;
  // the plan's seed for this page load: `?clubaudioseed=` when given, else from the wall clock, read here and nowhere else
  let seed, seedFrom;
  {
    const s = qget('clubaudioseed');
    if (s !== null && s !== '' && Number.isFinite(Number(s))) { seed = Math.floor(Number(s)) >>> 0; seedFrom = '?clubaudioseed'; }
    else {
      let clock = 0;
      try { clock = typeof deps.now === 'function' ? deps.now() : Date.now(); } catch { clock = 0; }
      seed = sessionSeed(clock); seedFrom = 'the wall clock at start';
    }
  }

  let disposed = false, dead = null;
  let ac = null, graph = null, timer = null, rendering = false;
  let latched = false, armed = false, asleep = null, resumeAsked = false, silentSince = null;
  let levels = { ...LEVELS, farPeakDb: { ...LEVELS.farPeakDb } };
  const assets = { version: null, bytes: 0, failed: [] };
  const tried = { bed: false, far: false, chalk: false };
  const follow = { muted: true, volume: 0, applied: null, source: 'none' };
  const bed = { on: false, t0: 0, base: 0 };
  const duck = { on: false, count: 0 };
  const far = { upTo: TIMING.firstFarAfter, scheduled: 0, late: 0, byKind: {}, last: null };
  const chalk = { owed: false, pending: null, playing: null, decisions: 0, played: 0, cut: 0, dropped: 0, ownShots: 0, last: null, lastDecision: null };
  const app = { count: null, at: -Infinity, tail: false, leftPlayback: -Infinity };
  // which step the levels are on, and what the proof of the app's recorded bank looks like so far
  const voicing = { level: 'low', proven: false, seenAt: null, steppedAt: null, checks: 0, nextPoll: 0, last: null };
  const stats = { contexts: 0, ticks: 0, errorCount: 0, errors: [], notes: [], listeners: 0, renders: 0, renderSec: null };
  const off = {}; // part ('bed' | 'far' | 'chalk') -> why it was switched off

  // ---- errors: nothing leaves a listener -------------------------------------------------------------------------------
  function fail(where, e) {
    stats.errorCount += 1;
    if (stats.errors.length < 16) stats.errors.push(`${where}: ${text(e)}`);
    if (stats.errorCount >= MAX_ERRORS && !disposed) {
      dead = `switched off after ${stats.errorCount} errors (last: ${where}: ${text(e)})`;
      if (stats.notes.length < 8) stats.notes.push(dead);
      shutdown();
    }
  }
  const guard = (where, fn) => function guarded(...args) {
    try { return fn(...args); } catch (e) { try { fail(where, e); } catch { /* nothing may leave a listener */ } return undefined; }
  };
  /** Run one part's step; a throw switches that part off for good and leaves a note. */
  function part(name, fn) {
    if (off[name]) return;
    try { fn(); } catch (e) {
      off[name] = text(e);
      if (stats.errors.length < 16) stats.errors.push(`${name}: ${text(e)}`);
      if (stats.notes.length < 8) stats.notes.push(`${name}: off (${text(e)})`);
    }
  }

  // ---- reads (all feature-detected; nothing is written) ----------------------------------------------------------------
  const machineState = () => { try { return machine?.state ?? game?.state ?? null; } catch { return null; } };
  const hidden = () => { try { return doc?.visibilityState === 'hidden'; } catch { return false; } };
  const viewElements = () => { try { return ctx?.camera?.matrixWorldInverse?.elements ?? null; } catch { return null; } };
  const shotIndex = () => { try { const v = game?.shotIndex; return Number.isInteger(v) && v >= 0 ? v : chalk.ownShots; } catch { return chalk.ownShots; } };
  function readApp() {
    let s = null;
    try { s = win?.__sound ?? null; } catch { s = null; }
    let muted, volume;
    try { muted = s?.muted; volume = s?.volume; } catch { muted = undefined; volume = undefined; }
    if (typeof muted === 'boolean' && typeof volume === 'number' && Number.isFinite(volume)) {
      follow.muted = muted; follow.volume = clamp(volume, 0, 1); follow.source = 'window.__sound';
    } else { follow.muted = true; follow.volume = 0; follow.source = 'none (no window.__sound: silent)'; }
    // the app's own voices: its counter of scheduled nodes moves whenever it schedules one
    let n;
    try { n = s?.scheduled; } catch { n = undefined; }
    if (typeof n === 'number') {
      if (app.count !== null && n !== app.count) { app.at = ac ? ac.currentTime : 0; app.tail = machineState() !== 'PLAYBACK'; }
      app.count = n;
    }
  }
  const wanted = () => (mode === 'off' || follow.muted ? 0 : follow.volume);

  // ---- the gesture latch (the app's test, web/app/sound.js grantsActivation / gestureOk) -------------------------------
  const grantsActivation = (e) => {
    if (!e || e.isTrusted === false) return false;
    const ua = nav?.userActivation;
    // transient activation: inside a granting event's own handler it is true by construction
    if (ua) return ua.isActive === true;
    if (e.type === 'pointerdown') return e.pointerType === 'mouse';
    if (e.type === 'keydown') return e.key !== 'Escape';
    return e.type === 'pointerup' && e.pointerType !== 'mouse';
  };
  const gestureOk = () => latched || nav?.userActivation?.hasBeenActive === true;
  const onGesture = guard('gesture', (e) => {
    if (disposed || !grantsActivation(e)) return;
    latched = true;
    readApp();
    wake(true);
    tick('gesture');
  });
  const gestureOpts = { capture: true, passive: true };
  function arm() {
    if (armed || disposed) return;
    armed = true;
    for (const ev of GESTURES) { try { win?.addEventListener?.(ev, onGesture, gestureOpts); } catch (e) { fail('arm', e); } }
  }
  function disarm() {
    if (!armed) return;
    armed = false;
    for (const ev of GESTURES) { try { win?.removeEventListener?.(ev, onGesture, gestureOpts); } catch { /* gone with the window */ } }
  }

  // ---- the context -------------------------------------------------------------------------------------------------
  function createContext() {
    if (ac || disposed) return;
    let made = null;
    try { made = new Live({ latencyHint: 'playback' }); } catch { made = null; }
    if (!made) { try { made = new Live(); } catch (e) { dead = `no AudioContext: ${text(e)}`; if (stats.notes.length < 8) stats.notes.push(dead); shutdown(); return; } }
    ac = made;
    stats.contexts += 1;
    ac.onstatechange = guard('statechange', () => {
      if (!ac || disposed) return;
      if (ac.state === 'running') { disarm(); return; }
      // it left `running` by itself (an interruption, the system took the output): one more try, then wait for a gesture
      if (!asleep && ac.state !== 'closed') { resumeAsked = false; arm(); }
    });
    graph = buildGraph(ac, assets, levels);
    timer = setTimer(guard('timer', () => tick('timer')), TIMER_MS);
    prepare();
  }
  /** Create (after a gesture) and resume. Outside a gesture's handler one resume is tried; the armed listeners do the rest. */
  function wake(inGesture = false) {
    if (disposed || !gestureOk()) return;
    if (!(wanted() > 0) || hidden()) return; // nothing is created or resumed for silence
    if (!ac) createContext();
    if (!ac) return;
    if (ac.state === 'running') { disarm(); return; }
    if (!inGesture && resumeAsked) return;
    resumeAsked = true;
    let p = null;
    try { p = ac.resume(); } catch (e) { fail('resume', e); }
    if (p && typeof p.then === 'function') p.then(guard('resumed', () => { if (ac && ac.state === 'running') { disarm(); tick('resumed'); } }), () => {});
  }
  function sleep(why, now) {
    asleep = why;
    resumeAsked = false;
    if (chalk.pending) { chalk.pending = null; chalk.dropped += 1; }
    if (graph) { graph.out.gain.cancelScheduledValues(now); graph.out.gain.setTargetAtTime(0, now, 0.01); follow.applied = null; }
    let p = null;
    try { p = ac.suspend(); } catch (e) { fail('suspend', e); }
    if (p && typeof p.then === 'function') p.then(undefined, () => {});
  }

  // ---- the buffers: rendered after the context exists, in the background ------------------------------------------------
  function prepare() {
    if (rendering || disposed || !ac) return;
    const need = {
      bed: mode === 'full' && !assets.bed && !tried.bed,
      far: mode === 'full' && !assets.far && !tried.far,
      chalk: mode !== 'off' && !assets.chalk && !tried.chalk,
    };
    if (!need.bed && !need.far && !need.chalk) return;
    rendering = true;
    const t0 = ac.currentTime;
    for (const k of Object.keys(need)) if (need[k]) tried[k] = true;
    // always the fixed seed: the takes that were measured (levels, no stack of harmonics) are the takes that play
    Promise.resolve().then(() => render(Offline, AUDIO_SEED, need)).then(guard('render', (got) => {
      rendering = false;
      if (disposed) return;
      stats.renders += 1;
      stats.renderSec = ac ? +(ac.currentTime - t0).toFixed(3) : null;
      for (const k of ['bed', 'far', 'chalk']) if (got?.[k]) { assets[k] = got[k]; assets.bytes += got[k].bytes ?? 0; }
      assets.version = got?.version ?? assets.version;
      for (const f of got?.failed ?? []) { assets.failed.push(f); if (stats.notes.length < 8) stats.notes.push(`render: ${f}`); }
      prepare(); // a mode change while this render ran may want more
      tick('assets');
    }), guard('render', (e) => { rendering = false; fail('render', e); }));
  }

  // ---- one step: follow the app, sleep or wake, keep the room and the chalk going ----------------------------------------
  function tick(_why) {
    if (disposed) return;
    stats.ticks += 1;
    readApp();
    const want = wanted();
    if (!ac) { wake(false); return; }
    const now = ac.currentTime;
    // 1. the app's mute and volume, with a short ramp
    if (graph && want !== follow.applied && !asleep) {
      graph.out.gain.cancelScheduledValues(now);
      graph.out.gain.setTargetAtTime(want, now, TIMING.followTau);
      follow.applied = want;
    }
    // 2. sleep and wake: hidden at once, silence after a few seconds
    if (want > 0) silentSince = null; else if (silentSince === null) silentSince = now;
    const why = hidden() ? 'hidden' : (!(want > 0) && now - silentSince >= TIMING.silentSuspend ? 'silent' : null);
    if (why && !asleep) sleep(why, now);
    else if (!why && asleep) { asleep = null; resumeAsked = false; }
    if (asleep) return;
    if (ac.state !== 'running') { wake(false); if (ac?.state !== 'running') return; }
    if (!graph) return;
    if (mode !== 'off') prepare();
    // 2b. the level step: low until the app's recorded bank is established from the page's own resource entries
    part('level', () => {
      if (voicing.level === 'high') return;
      if (!voicing.proven) {
        if (now < voicing.nextPoll) return;
        // every two seconds at first; later only when a shot has ended (the state listener re-arms it: the app retries a
        // failed bank when a playback begins)
        voicing.nextPoll = now < TIMING.bankPollFor ? now + TIMING.bankPollStep : Infinity;
        voicing.checks += 1;
        let entries = null;
        try { entries = typeof perf?.getEntriesByType === 'function' ? perf.getEntriesByType('resource') : null; } catch { entries = null; }
        const proof = bankProof(entries);
        voicing.last = { ok: proof.ok, wanted: proof.wanted, why: entries ? proof.why : 'this engine gives no resource entries', entries: entries ? entries.length : null };
        if (!proof.proven) return;
        voicing.proven = true;
        voicing.seenAt = now;
      }
      if (now - voicing.seenAt < TIMING.bankHold) return;
      const st = machineState();
      if (st === 'PLAYBACK' || st === 'SIMULATING') return;
      if (now < Math.max(app.at + (app.tail ? TIMING.appQuietTail : TIMING.appQuietPlayback), app.leftPlayback + TIMING.appQuietPlayback)) return;
      voicing.level = 'high';
      voicing.steppedAt = now;
      graph.setTrim({ roomDb: 0, chalkDb: 0 }, now, TIMING.levelTau);
    });
    // 3. the room tone
    part('bed', () => {
      if (mode === 'full') {
        if (!graph.bedOn() && assets.bed) {
          bed.t0 = now + 0.05;
          if (graph.startBed(bed.t0, TIMING.bedFadeIn, bed.base)) { bed.on = true; far.upTo = Math.max(far.upTo, bed.base); }
        }
      } else if (graph.bedOn()) {
        bed.base += Math.max(0, now - bed.t0);
        graph.stopBed(now, TIMING.bedFadeOut);
        bed.on = false;
      }
    });
    // 3b. the room tone steps back while the app's own voices sound: a playback (a strike or a replay), and after it until
    // the guard that also holds the chalk back has passed
    part('duck', () => {
      if (!bed.on) { duck.on = false; return; }
      const st = machineState();
      const busy = st === 'PLAYBACK' || st === 'SIMULATING'
        || now < Math.max(app.at + (app.tail ? TIMING.appQuietTail : TIMING.appQuietPlayback), app.leftPlayback + TIMING.appQuietPlayback);
      if (busy === duck.on) return;
      duck.on = busy;
      if (busy) duck.count += 1;
      graph.setDuck(busy ? levels.bedDuckDb : 0, now, busy ? TIMING.duckIn : TIMING.duckOut);
    });
    // 4. the room's far sounds: the plan for the stretch of room time that has come into reach
    part('far', () => {
      if (!bed.on || !assets.far || mode !== 'full') return;
      const room = bed.base + (now - bed.t0);
      const to = room + TIMING.farLookahead;
      if (to < far.upTo + TIMING.farScheduleStep) return;
      if (to - far.upTo > 600) far.upTo = room; // a long gap without a step (a stalled page): what was missed stays missed
      const view = viewElements();
      for (const ev of farEvents(seed, far.upTo, to, { farTable: club?.knobs?.farTable !== false })) {
        const when = bed.t0 + (ev.t - bed.base);
        if (when < now + 0.01) { far.late += 1; continue; }
        if (graph.playFar(ev, when, panFor(ev.place, view, ev.pan0)) === null) continue;
        far.scheduled += 1;
        far.byKind[ev.kind] = (far.byKind[ev.kind] ?? 0) + 1;
        far.last = { kind: ev.kind, variant: ev.variant, t: +ev.t.toFixed(3) };
      }
      far.upTo = to;
    });
    // 5. chalk: a take that is due starts once the app's own voices are over
    part('chalk', () => {
      if (chalk.playing && now >= chalk.playing.end) chalk.playing = null;
      const p = chalk.pending;
      if (!p) return;
      const st = machineState();
      if (st !== 'AIM' && st !== 'BALL_IN_HAND') return; // a strike or a replay cancels it in the state listener
      if (now > p.due + TIMING.chalkExpire) { chalk.pending = null; chalk.dropped += 1; return; }
      if (!(want > 0) || !assets.chalk) return;
      if (now < chalkEarliest({ due: p.due, appVoiceAt: app.at, appVoiceTail: app.tail, leftPlayback: app.leftPlayback })) return;
      chalk.pending = null;
      const h = graph.playChalk(p.plan, now + 0.02, TIMING.chalkCut);
      if (!h) return;
      chalk.playing = h;
      chalk.played += 1;
      chalk.last = { shot: p.shot, variant: p.plan.variant, start: +h.start.toFixed(3), end: +h.end.toFixed(3) };
    });
  }

  // ---- the machine: when chalk is owed, and when it must stop -----------------------------------------------------------
  const onState = guard('stateChange', (next, prev, info) => {
    if (disposed) return;
    tick('state'); // reads the app's counter first: the app's own listeners ran before this one
    const now = ac ? ac.currentTime : 0;
    if (prev === 'PLAYBACK' && next !== 'PLAYBACK') app.leftPlayback = now;
    if (next === 'SIMULATING' || next === 'PLAYBACK') {
      // the player shot (or a replay starts): no chalk under the app's voices
      if (chalk.pending) { chalk.pending = null; chalk.dropped += 1; }
      if (chalk.playing) { if (chalk.playing.cut(now)) chalk.cut += 1; chalk.playing = null; }
      if (next === 'PLAYBACK' && info?.strike === true) { chalk.owed = true; chalk.ownShots += 1; }
      return;
    }
    if ((next === 'AIM' || next === 'BALL_IN_HAND') && !voicing.proven) voicing.nextPoll = Math.min(voicing.nextPoll, now);
    if ((next === 'AIM' || next === 'BALL_IN_HAND') && chalk.owed) {
      // the player has the table back after a shot of their own: the plan says whether chalk is heard before the next one
      chalk.owed = false;
      const shot = shotIndex();
      const plan = chalkPlan(seed, shot);
      chalk.decisions += 1;
      chalk.lastDecision = { shot, play: plan.play, variant: plan.variant };
      if (plan.play && ac && !asleep && !off.chalk) chalk.pending = { plan, shot, due: now + plan.delay };
    }
  });

  // ---- listeners (each one is removed by dispose) ------------------------------------------------------------------------
  const unsubs = [];
  const listen = (target, type, fn, opts) => {
    try {
      if (typeof target?.addEventListener !== 'function') return;
      target.addEventListener(type, fn, opts);
      unsubs.push(() => { try { target.removeEventListener(type, fn, opts); } catch { /* gone */ } });
      stats.listeners += 1;
    } catch (e) { fail('listen', e); }
  };
  function shutdown() {
    if (disposed) return;
    disposed = true;
    disarm();
    for (const u of unsubs.splice(0)) { try { u(); } catch { /* gone */ } }
    if (timer !== null) { try { clearTimer(timer); } catch { /* gone */ } timer = null; }
    try { graph?.dispose(); } catch { /* nothing to stop */ }
    graph = null;
    if (ac) {
      try { ac.onstatechange = null; const p = ac.close?.(); if (p && typeof p.then === 'function') p.then(undefined, () => {}); } catch { /* already closed */ }
      ac = null;
    }
    chalk.pending = null; chalk.playing = null;
    api.enabled = false;
    api.reason = dead ?? 'disposed';
  }

  const api = {
    enabled: true,
    /** Plain numbers for tools (also copied into club.state().services.audio.state by the installer). */
    state() {
      const now = ac ? ac.currentTime : null;
      return {
        enabled: !disposed, mode, seed, seedFrom, renderSeed: AUDIO_SEED, reason: disposed ? (dead ?? 'disposed') : null,
        ...(venueMax !== null ? { venueMax } : {}), // round A1: the venue's cap on the mode (absent under the club venue)
        // the level step: 'low' (plan.js LOW_TRIM under the levels) until the app's recorded bank is proven, then 'high'
        voicing: {
          level: voicing.level, trim: voicing.level === 'high' ? { roomDb: 0, chalkDb: 0 } : { ...LOW_TRIM }, bankProven: voicing.proven,
          provenAt: voicing.seenAt, steppedAt: voicing.steppedAt, checks: voicing.checks, last: voicing.last ? { ...voicing.last } : null,
        },
        // the one audio path: 'own' = a second AudioContext, because the app exposes none (see the header)
        path: 'own AudioContext (the app exposes neither its context nor a bus)',
        context: ac ? ac.state : 'none', contexts: stats.contexts, sampleRate: ac?.sampleRate ?? null, time: now,
        // a context reads `running` before its output has delivered a callback: until then its time stands at 0, nothing is
        // rendered and every gain reads its first value. A tool waits for 'started' before it reads a gain or a level.
        clock: !ac ? 'none' : (now > 0 ? 'started' : 'not started'),
        latched, gestureOk: gestureOk(), armed, asleep,
        followed: { muted: follow.muted, volume: follow.volume, gain: follow.applied, source: follow.source },
        assets: { ...describeAssets(assets), rendering, renders: stats.renders, renderSec: stats.renderSec },
        bed: { on: bed.on, roomTime: bed.on && now !== null ? +(bed.base + now - bed.t0).toFixed(3) : +bed.base.toFixed(3), ducked: duck.on, ducks: duck.count },
        far: { scheduled: far.scheduled, late: far.late, upTo: +far.upTo.toFixed(3), byKind: { ...far.byKind }, last: far.last },
        chalk: {
          owed: chalk.owed, pending: chalk.pending ? { shot: chalk.pending.shot, variant: chalk.pending.plan.variant, due: +chalk.pending.due.toFixed(3) } : null,
          playing: !!chalk.playing, decisions: chalk.decisions, played: chalk.played, cut: chalk.cut, dropped: chalk.dropped, last: chalk.last, lastDecision: chalk.lastDecision,
        },
        app: { scheduled: app.count, lastVoiceAt: Number.isFinite(app.at) ? +app.at.toFixed(3) : null, tail: app.tail, leftPlayback: Number.isFinite(app.leftPlayback) ? +app.leftPlayback.toFixed(3) : null },
        sources: graph ? graph.counts() : { started: 0, live: 0, ended: 0, bedSources: 0 },
        levels: { ...levels, farPeakDb: { ...levels.farPeakDb } },
        listeners: stats.listeners + (armed ? GESTURES.length : 0), ticks: stats.ticks,
        off: { ...off }, errors: stats.errors.slice(), notes: stats.notes.slice(),
      };
    },
    /**
     * Change at run time: { mode: 'off' | 'sfx' | 'full', levels: { bedRmsDb, bedDuckDb, humRmsDb, chalkPeakDb, farPeakDb: {...} },
     * seed }. Returns true when something changed. (`off` at run time silences and suspends; `?clubaudio=off` at boot
     * builds nothing at all.)
     */
    set: guard('set', (opts = {}) => {
      if (disposed || !opts || typeof opts !== 'object') return false;
      let changed = false;
      if ((opts.mode === 'off' || opts.mode === 'sfx' || opts.mode === 'full') && capMode(opts.mode) !== mode) { mode = capMode(opts.mode); changed = true; }
      if (opts.levels && typeof opts.levels === 'object') {
        const next = { ...levels, farPeakDb: { ...levels.farPeakDb } };
        for (const k of ['bedRmsDb', 'bedDuckDb', 'humRmsDb', 'chalkPeakDb']) if (Number.isFinite(opts.levels[k])) next[k] = clamp(opts.levels[k], -120, 0);
        if (opts.levels.farPeakDb && typeof opts.levels.farPeakDb === 'object') for (const k of Object.keys(next.farPeakDb)) if (Number.isFinite(opts.levels.farPeakDb[k])) next.farPeakDb[k] = clamp(opts.levels.farPeakDb[k], -120, 0);
        levels = next;
        if (graph && ac) graph.setLevels(levels, ac.currentTime);
        changed = true;
      }
      if (Number.isFinite(opts.seed)) { seed = Math.floor(opts.seed) >>> 0; seedFrom = 'set({ seed })'; changed = true; }
      tick('set');
      return changed;
    }),
    dispose: guard('dispose', () => { shutdown(); }),
  };

  // attach: the machine's state, a step per delivered frame, the page's visibility, the app's settings
  try {
    if (typeof machine?.on === 'function') { const un = machine.on('stateChange', onState); stats.listeners += 1; unsubs.push(typeof un === 'function' ? un : () => {}); }
  } catch (e) { fail('machine.on', e); }
  try {
    const onFrame = guard('frame', () => tick('frame'));
    if (typeof club?.onFrame === 'function') { club.onFrame(onFrame); stats.listeners += 1; unsubs.push(() => club.offFrame?.(onFrame)); }
    else if (typeof machine?.on === 'function') { const un = machine.on('frame', onFrame); stats.listeners += 1; unsubs.push(typeof un === 'function' ? un : () => {}); }
  } catch (e) { fail('frame hook', e); }
  listen(doc, 'visibilitychange', guard('visibility', () => tick('visibility')), { passive: true });
  // the app's settings event: once now, and once more after the task that raised it (the app may set its sound's mute or
  // volume right after it dispatches the event)
  const afterTask = guard('settings', () => tick('settings'));
  listen(win, 'ob:settings', guard('settings', () => { tick('settings'); Promise.resolve().then(afterTask); }), { passive: true });
  arm();
  tick('create'); // a gesture made before the look was installed already counts (sticky activation), as it does for the app
  return api;
}
