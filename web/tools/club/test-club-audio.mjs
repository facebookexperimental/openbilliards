// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-club-audio.mjs — node arm for the club look's audio service (CONTRACT.md 12; the round-4 laws).
// What it holds: the plans are pure functions of a seed and a shot index or a time; no Math.random, no wall clock, no
// captureStream, no request in the service's sources; with `clubaudio=off` no AudioContext is constructed and no listener is
// attached; no context and no source before the gesture latch (the app's activation test); the app's mute and volume are
// followed; the page's visibility suspends and resumes; chalk never starts under the app's own voices and is cut by a
// strike; listeners never throw; dispose leaves nothing behind; the game and the machine are only read.
// Round-4 follow-up: two levels (low by default, high only with the proof of the app's recorded bank from the page's
// resource entries), a per-session seed for the plan (one wall-clock read), no chair, and a detector for a stack of
// harmonics in the band of speech.
// The platform is faked (a recording AudioContext, a window, a document, a navigator); the state machine is the app's own.
// Run: node web/tools/club/test-club-audio.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createStateMachine } from '../../app/state.js';
import { createAudio } from '../../scene/club/audio.js';
import {
  AUDIO_SEED, LEVELS, LOW_TRIM, TIMING, CHALK_VARIANTS, FAR_KINDS, FAR_KIND_IDS, BANK_FILES, chalkPlan, chalkEarliest, farEvents, farEvent, panFor,
  parseMode, mix, mulberry32, dbToGain, bankProof, sessionSeed,
} from '../../scene/club/audio/plan.js';
import { SFX_FILES } from '../../app/synth.js';
import { noiseData, slowCurve, seamLoop, humData, roomImpulse, grainStroke, rmsPeak, BED, RATES } from '../../scene/club/audio/render.js';
import { buildGraph } from '../../scene/club/audio/graph.js';
import { fft, levels as measureLevels, stft, spectrumOf, activeSpans, overlapSeconds, harmonicStack } from '../../scene/club/audio/measure.js';

let n = 0;
const ok = async (name, fn) => { await fn(); n += 1; console.log(`OK ${name}`); };
const here = dirname(fileURLToPath(import.meta.url));
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setImmediate(r)); };

// ---- the fake platform --------------------------------------------------------------------------------------------------
function fakeParam(value, log, name) {
  return {
    value,
    setValueAtTime(v, t) { log.push([name, 'set', v, t]); this.value = v; },
    linearRampToValueAtTime(v, t) { log.push([name, 'ramp', v, t]); this.value = v; },
    exponentialRampToValueAtTime(v, t) { log.push([name, 'exp', v, t]); this.value = v; },
    setTargetAtTime(v, t, tau) { log.push([name, 'target', v, t, tau]); this.value = v; },
    setValueCurveAtTime(c, t, d) { log.push([name, 'curve', c.length, t, d]); },
    cancelScheduledValues(t) { log.push([name, 'cancel', t]); },
  };
}
function fakeAudio({ startState = 'suspended', failAfterNodes = Infinity } = {}) {
  const world = { contexts: [], constructed: 0 };
  class FakeContext {
    constructor(opts) {
      world.constructed += 1;
      world.contexts.push(this);
      this.opts = opts; this.state = startState; this.t = 0; this.sampleRate = 48000; this.destination = { name: 'destination' };
      this.log = []; this.nodes = 0; this.sources = []; this.calls = { resume: 0, suspend: 0, close: 0 }; this.onstatechange = null;
    }
    get currentTime() { return this.t; }
    #node(kind) { this.nodes += 1; if (this.nodes > failAfterNodes) throw new Error(`fake: ${kind} refused`); return { kind, connect() {}, disconnect() {} }; }
    createGain() { const g = this.#node('gain'); g.id = this.nodes; g.gain = fakeParam(1, this.log, `gain${g.id}`); return g; }
    createStereoPanner() { const p = this.#node('pan'); p.pan = fakeParam(0, this.log, 'pan'); return p; }
    createBufferSource() {
      const s = this.#node('source');
      s.playbackRate = fakeParam(1, this.log, 'rate'); s.loop = false; s.buffer = null; s.started = null; s.stopped = null; s.onended = null;
      s.start = (when = 0, off = 0) => { s.started = { when, off, at: this.t, state: this.state }; };
      s.stop = (when = 0) => { s.stopped = when; };
      this.sources.push(s);
      return s;
    }
    #to(state) { if (this.state === state) return; this.state = state; this.onstatechange?.(); }
    resume() { this.calls.resume += 1; this.#to('running'); return Promise.resolve(); }
    suspend() { this.calls.suspend += 1; this.#to('suspended'); return Promise.resolve(); }
    close() { this.calls.close += 1; this.#to('closed'); return Promise.resolve(); }
  }
  return { world, FakeContext };
}
function fakeTarget() {
  const map = new Map();
  return {
    map,
    addEventListener(type, fn) { if (!map.has(type)) map.set(type, new Set()); map.get(type).add(fn); },
    removeEventListener(type, fn) { map.get(type)?.delete(fn); },
    fire(type, ev = {}) { for (const fn of [...(map.get(type) ?? [])]) fn({ type, ...ev }); },
    count() { let c = 0; for (const s of map.values()) c += s.size; return c; },
  };
}
const fakeBuffer = (seconds) => ({ duration: seconds });
const take = (seconds) => ({ buffer: fakeBuffer(seconds), rate: 24000, seconds, rms: 0.1, peak: 1, bytes: Math.round(seconds * 24000) * 4 });
/** A render stand-in: the shape audio/render.js renderAssets resolves to, with no samples behind it. */
function fakeRender(log) {
  return async (_Offline, seed, want) => {
    log.push({ seed, want: { ...want } });
    const out = { version: 1, bytes: 0, failed: [] };
    if (want.bed) { out.bed = { a: { buffer: fakeBuffer(31), rate: 16000, seconds: 31, rms: 0.2, peak: 0.9, bytes: 31 * 16000 * 4 }, b: { buffer: fakeBuffer(43), rate: 16000, seconds: 43, rms: 0.25, peak: 0.9, bytes: 43 * 16000 * 4 }, hum: { buffer: fakeBuffer(1), rate: 16000, seconds: 1, rms: 0.8, peak: 1.5, bytes: 64000 }, bytes: 74 * 64000 + 64000 }; out.bytes += out.bed.bytes; }
    if (want.far) { out.far = { rate: 24000, bytes: 0, takes: {} }; for (const k of FAR_KIND_IDS) out.far.takes[k] = Array.from({ length: FAR_KINDS[k].variants }, () => take(1.2)); }
    if (want.chalk) out.chalk = { rate: 32000, bytes: 0, takes: Array.from({ length: CHALK_VARIANTS }, () => take(0.7)) };
    return out;
  };
}
/** One staged page: the service over the fakes. `opts`: { query, knobs, sound, activation, startState, game, failAfterNodes, visibility }. */
async function stage(opts = {}) {
  const { world, FakeContext } = fakeAudio({ startState: opts.startState ?? 'suspended', failAfterNodes: opts.failAfterNodes });
  const win = fakeTarget();
  const doc = fakeTarget();
  doc.visibilityState = opts.visibility ?? 'visible';
  if (opts.sound !== null) win.__sound = opts.sound ?? { muted: false, volume: 0.8, scheduled: 0 };
  const nav = opts.activation === null ? {} : { userActivation: opts.activation ?? { isActive: false, hasBeenActive: false } };
  const machine = opts.machine ?? createStateMachine('AIM');
  const game = opts.game ?? { shotIndex: 0, seed: 7, get state() { return machine.state; } };
  const timers = [];
  const renders = [];
  const frames = [];
  // the page's resource entries (opts.entries: an array, or a function returning one), and how often they were read
  const perf = { reads: 0, getEntriesByType(type) { perf.reads += 1; const e = typeof opts.entries === 'function' ? opts.entries() : opts.entries; return type === 'resource' ? (e ?? []) : []; } };
  const club = {
    // the plan's seed is fixed for the arm unless a check asks for the wall clock (`query` without a seed)
    ctx: { machine, game, camera: opts.camera ?? null, query: new URLSearchParams(opts.query ?? `clubaudioseed=${AUDIO_SEED}`) },
    knobs: opts.knobs ?? { audio: 'full', farTable: true },
    onFrame(fn) { frames.push(fn); }, offFrame(fn) { const i = frames.indexOf(fn); if (i >= 0) frames.splice(i, 1); },
  };
  const deps = {
    window: win, document: doc, navigator: nav, AudioContext: FakeContext, OfflineAudioContext: function Offline() {},
    performance: opts.performance === undefined ? perf : opts.performance, now: opts.now ?? (() => 1763128800000),
    render: opts.render ?? fakeRender(renders),
    setInterval: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearInterval: (id) => { if (timers[id - 1]) timers[id - 1].cleared = true; },
  };
  const svc = await createAudio(club, deps);
  const frame = () => { for (const fn of [...frames]) fn(0, 1 / 60); };
  const gesture = async (type = 'pointerdown', ev = {}) => {
    if (nav.userActivation) { nav.userActivation.isActive = true; nav.userActivation.hasBeenActive = true; }
    win.fire(type, { isTrusted: true, pointerType: 'mouse', ...ev });
    if (nav.userActivation) nav.userActivation.isActive = false;
    await flush();
  };
  const ac = () => world.contexts[0] ?? null;
  const started = () => (ac()?.sources ?? []).filter((s) => s.started);
  const advance = (dt, steps = 1) => { for (let i = 0; i < steps; i++) { ac().t += dt / steps; frame(); } };
  return { svc, world, win, doc, nav, machine, game, club, timers, renders, frames, frame, gesture, ac, started, advance, perf };
}

// ---- 1. the plans are pure ------------------------------------------------------------------------------------------------
await ok('chalkPlan is a pure function of (seed, shot index)', () => {
  for (const seed of [AUDIO_SEED, 1, 987654321, mix(AUDIO_SEED, 7)]) {
    const seq = Array.from({ length: 400 }, (_, k) => chalkPlan(seed, k));
    // asked again, in another order, with other calls in between: the same answers
    const order = Array.from({ length: 400 }, (_, k) => k).sort((a, b) => ((a * 7919) % 400) - ((b * 7919) % 400));
    for (const k of order) { chalkPlan(seed ^ 0x55, (k * 3) % 50); assert.deepEqual(chalkPlan(seed, k), seq[k]); }
    // half of the shots, never more than two in a row with it or without it, never the same take twice running
    const plays = seq.filter((p) => p.play);
    assert.equal(plays.length, 200);
    let run = 0, gap = 0;
    for (const p of seq) { if (p.play) { run += 1; gap = 0; } else { gap += 1; run = 0; } assert.ok(run <= 2 && gap <= 2); }
    for (let i = 1; i < plays.length; i++) assert.notEqual(plays[i].variant, plays[i - 1].variant);
    const used = new Set(plays.map((p) => p.variant));
    assert.equal(used.size, CHALK_VARIANTS);
    for (const p of seq) {
      assert.ok(Number.isInteger(p.variant) && p.variant >= 0 && p.variant < CHALK_VARIANTS);
      assert.ok(p.delay >= 0.9 && p.delay <= 2.6 && p.gainDb <= 0 && p.gainDb >= -4 && p.rate >= 0.96 && p.rate <= 1.04 && Math.abs(p.pan) <= 0.15);
    }
  }
  // another seed is another plan; a damaged index is shot 0, not a throw
  assert.notDeepEqual(Array.from({ length: 40 }, (_, k) => chalkPlan(1, k).play), Array.from({ length: 40 }, (_, k) => chalkPlan(2, k).play));
  for (const bad of [NaN, -3, undefined, null, Infinity, 'x']) assert.deepEqual(chalkPlan(5, bad), chalkPlan(5, 0));
  assert.deepEqual(chalkPlan(5, 3.9), chalkPlan(5, 3));
});

await ok('farEvents is a pure function of (seed, window), sparse, and does not come round', () => {
  const whole = farEvents(AUDIO_SEED, 0, 1800);
  // asked in the service's small steps, forwards or backwards: the same events
  const pieces = [];
  for (let t = 0; t < 1800; t += 1.6) pieces.push(...farEvents(AUDIO_SEED, t, Math.min(1800, t + 1.6)));
  assert.deepEqual(pieces, whole);
  const back = [];
  for (let t = 1800 - 7.5; t >= 0; t -= 7.5) back.unshift(...farEvents(AUDIO_SEED, t, t + 7.5));
  assert.deepEqual(back, whole);
  for (let i = 1; i < whole.length; i++) assert.ok(whole[i].t >= whole[i - 1].t);
  assert.ok(whole.every((e) => e.t >= TIMING.firstFarAfter));
  // sparse: between one sound in 30 s and one in 8 s on average, and every kind is heard
  assert.ok(whole.length > 1800 / 30 && whole.length < 1800 / 8, `events in 30 min: ${whole.length}`);
  for (const kind of FAR_KIND_IDS) {
    const own = whole.filter((e) => e.kind === kind);
    assert.ok(own.length >= 3, `${kind}: ${own.length}`);
    for (let i = 1; i < own.length; i++) assert.ok(own[i].t - own[i - 1].t >= 2 * FAR_KINDS[kind].margin - 1e-9); // a take (1.9 s at most) never meets the next of its kind
    for (const e of own) {
      assert.deepEqual(farEvent(AUDIO_SEED, kind, e.slot), e);
      assert.ok(e.variant >= 0 && e.variant < FAR_KINDS[kind].variants && e.gainDb <= 0 && e.gainDb >= -6 && e.rate >= 0.95 && e.rate <= 1.05);
      assert.ok(FAR_KINDS[kind].places.includes(e.place));
    }
  }
  // not a loop: no stretch of five minutes has the gaps of the five minutes after it
  const sig = (a, b) => farEvents(AUDIO_SEED, a, b).map((e) => `${e.kind}${e.variant}@${(e.t - a).toFixed(1)}`).join(' ');
  for (let t = 0; t < 1200; t += 300) assert.notEqual(sig(t, t + 300), sig(t + 300, t + 600));
  assert.notDeepEqual(farEvents(AUDIO_SEED + 1, 0, 600).map((e) => e.t), farEvents(AUDIO_SEED, 0, 600).map((e) => e.t));
  // a room without the second table has none of its sounds
  const lite = farEvents(AUDIO_SEED, 0, 1800, { farTable: false });
  assert.ok(lite.length > 0 && lite.every((e) => e.kind === 'glass'));
  // three kinds; the chair is gone (round 4: nothing that may be taken for a voice)
  assert.deepEqual([...FAR_KIND_IDS], ['balls', 'glass', 'butt']);
  assert.deepEqual(Object.keys(LEVELS.farPeakDb).sort(), [...FAR_KIND_IDS].sort());
  assert.ok(!('chair' in FAR_KINDS) && farEvent(AUDIO_SEED, 'chair', 3) === null);
  assert.deepEqual(farEvents(AUDIO_SEED, 50, 50), []);
  assert.deepEqual(farEvents(AUDIO_SEED, NaN, 10), farEvents(AUDIO_SEED, 0, 10));
});

await ok('chalkEarliest, panFor, parseMode, mix', () => {
  assert.equal(chalkEarliest({ due: 10 }), 10);
  assert.equal(chalkEarliest({ due: 10, appVoiceAt: 9, appVoiceTail: false }), 9 + TIMING.appQuietPlayback);
  assert.equal(chalkEarliest({ due: 10, appVoiceAt: 9, appVoiceTail: true }), 9 + TIMING.appQuietTail);
  assert.equal(chalkEarliest({ due: 10, leftPlayback: 9.5 }), 9.5 + TIMING.appQuietPlayback);
  assert.ok(TIMING.appQuietPlayback >= 2.0 + 0.15 && TIMING.appQuietTail >= 2.0 + 0.09 + 0.55 + 0.52 * 3.57);
  // a camera at the origin looking down -z (identity view): +x is to the right
  const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  assert.ok(panFor([3, -3], I) > 0 && panFor([-3, -3], I) < 0 && Math.abs(panFor([0, -3], I)) < 1e-9);
  assert.ok(Math.abs(panFor([50, 0.001], I)) <= 0.7 + 1e-9);
  assert.equal(panFor([1, 1], null, 0.25), 0.25);
  assert.equal(panFor([0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], -0.2), -0.2);
  assert.equal(parseMode('sfx', 'full'), 'sfx');
  assert.equal(parseMode(null, 'off'), 'off');
  assert.equal(parseMode('loud', 'sfx'), 'sfx');
  assert.equal(parseMode(undefined, undefined), 'full');
  assert.equal(parseMode(null, false), 'off');
  assert.equal(mix(1, 2), mix(1, 2));
  assert.notEqual(mix(1, 2), mix(2, 1));
  assert.notEqual(mix(1, 2 ** 40), mix(1, 0));
  assert.equal(mix(NaN), mix(0));
});

// ---- 2. no randomness, no wall clock, no request, no recording tap in the sources ------------------------------------------
await ok('the service sources hold no Math.random, wall clock, request, dynamic import or captureStream', () => {
  const dir = join(here, '../../scene/club');
  const files = ['audio.js', 'audio/plan.js', 'audio/render.js', 'audio/graph.js', 'audio/measure.js'];
  const banned = [/Math\.random/, /performance\.now/, /new Date\b/, /captureStream/, /\bfetch\s*\(/, /XMLHttpRequest/, /\bimport\s*\(/, /new Audio\b/, /decodeAudioData/, /localStorage/, /SpeechSynthesis|speechSynthesis/];
  for (const f of files) {
    // comments may name what is avoided; the code may not use it
    const code = readFileSync(join(dir, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
    for (const re of banned) assert.ok(!re.test(code), `${f} uses ${re}`);
    // the wall clock: read once, in the service, for the plan's seed (the lead's ruling); nowhere else
    assert.equal((code.match(/Date\.now/g) ?? []).length, f === 'audio.js' ? 1 : 0, `${f}: wall-clock reads`);
    // the page's performance object: the resource entries only
    for (const m of code.matchAll(/\bperf(?:ormance)?\??\.([A-Za-z]+)/g)) assert.equal(m[1], 'getEntriesByType', `${f} uses performance.${m[1]}`);
    // static imports stay inside the club directory
    for (const m of code.matchAll(/from\s+'([^']+)'/g)) assert.ok(m[1].startsWith('./'), `${f} imports ${m[1]}`);
  }
});

await ok('nothing asks Math.random at run time (plans, pure helpers, a whole staged session)', async () => {
  const real = Math.random;
  Math.random = () => { throw new Error('Math.random was called'); };
  try {
    chalkPlan(3, 11); farEvents(3, 0, 300);
    noiseData(64, 1); slowCurve(mulberry32(1), 10); roomImpulse(8000, 1); humData(16000, 1, 60, 1);
    const s = await stage({});
    await s.gesture();
    s.advance(20, 100);
    s.machine.to('SIMULATING'); s.machine.to('PLAYBACK', { strike: true }); s.advance(1, 10); s.machine.to('SETTLED'); s.machine.to('AIM'); s.advance(8, 40);
    assert.equal(s.svc.state().errors.length, 0);
    s.svc.dispose();
  } finally { Math.random = real; }
});

// ---- 3. off = nothing -------------------------------------------------------------------------------------------------------
await ok('clubaudio=off (query or tier knob): no AudioContext, no listener, no node, however the page is used', async () => {
  for (const o of [{ query: 'clubaudio=off' }, { knobs: { audio: 'off' } }, { query: 'clubaudio=off', knobs: { audio: 'full' } }]) {
    const s = await stage({ ...o, activation: { isActive: true, hasBeenActive: true } });
    assert.equal(s.svc.enabled, false);
    assert.match(s.svc.reason, /off/);
    await s.gesture(); await s.gesture('keydown', { key: 'a' });
    s.machine.to('PLAYBACK', { strike: true }); s.machine.to('SETTLED'); s.machine.to('AIM');
    s.frame();
    assert.equal(s.world.constructed, 0);
    assert.equal(s.win.count() + s.doc.count() + s.frames.length + s.timers.length, 0);
    assert.equal(s.renders.length, 0);
    assert.equal(s.svc.state().context, 'none');
    assert.equal(s.svc.set({ mode: 'full' }), false);
    s.svc.dispose();
  }
  // the query wins over the knob the other way too
  const s = await stage({ query: 'clubaudio=sfx', knobs: { audio: 'off' } });
  assert.equal(s.svc.enabled, true);
  assert.equal(s.svc.state().mode, 'sfx');
  s.svc.dispose();
  // an engine without WebAudio: a stub, no throw
  const none = await createAudio({ ctx: { query: new URLSearchParams('') }, knobs: { audio: 'full' } }, { window: fakeTarget(), document: fakeTarget(), navigator: {}, AudioContext: null });
  assert.equal(none.enabled, typeof AudioContext === 'function');
});

// ---- 4. the gesture latch -----------------------------------------------------------------------------------------------------
await ok('no context and no source before a real gesture; the app\'s activation test decides what a gesture is', async () => {
  const s = await stage({});
  // frames, state changes, settings events, a hidden-visible round trip: nothing is created
  for (let i = 0; i < 50; i++) s.frame();
  s.machine.to('SIMULATING'); s.machine.to('PLAYBACK', { strike: true }); s.machine.to('SETTLED'); s.machine.to('AIM');
  s.win.fire('ob:settings', { detail: { key: 'volume' } });
  s.doc.fire('visibilitychange');
  // events that grant nothing: a synthetic one, and a trusted one outside transient activation (a touch pointerdown, Escape)
  s.win.fire('pointerdown', { isTrusted: false, pointerType: 'mouse' });
  s.win.fire('keydown', { isTrusted: true, key: 'Escape' });
  s.win.fire('pointerdown', { isTrusted: true, pointerType: 'touch' });
  await flush();
  assert.equal(s.world.constructed, 0);
  assert.equal(s.renders.length, 0);
  assert.equal(s.svc.state().latched, false);
  assert.equal(s.svc.state().armed, true);
  // the granting event
  await s.gesture('pointerdown');
  assert.equal(s.world.constructed, 1);
  assert.equal(s.ac().calls.resume, 1);
  assert.equal(s.ac().state, 'running');
  assert.equal(s.renders.length, 1);
  assert.deepEqual(s.renders[0].want, { bed: true, far: true, chalk: true });
  assert.equal(s.svc.state().armed, false); // running: the gesture listeners are gone, as in the app
  s.frame();
  // every source that started did so after the latch, on a running context
  assert.ok(s.started().length === 3, `bed sources: ${s.started().length}`);
  for (const src of s.started()) assert.ok(src.started.state === 'running' && src.started.when >= 0 && src.loop === true);
  assert.equal(s.svc.state().latched, true);
  s.svc.dispose();
});

await ok('the activation table without navigator.userActivation, and sticky activation at install', async () => {
  const cases = [
    ['pointerdown', { pointerType: 'mouse' }, true], ['pointerdown', { pointerType: 'touch' }, false], ['pointerdown', { pointerType: 'pen' }, false],
    ['pointerup', { pointerType: 'touch' }, true], ['pointerup', { pointerType: 'mouse' }, false], ['keydown', { key: 'Escape' }, false], ['keydown', { key: ' ' }, true],
  ];
  for (const [type, ev, grants] of cases) {
    const s = await stage({ activation: null });
    s.win.fire(type, { isTrusted: true, ...ev });
    await flush();
    assert.equal(s.world.constructed, grants ? 1 : 0, `${type} ${JSON.stringify(ev)}`);
    s.win.fire(type, { isTrusted: false, ...ev });
    s.svc.dispose();
  }
  // the user had already used the page when the look was installed: the context is made at once (sticky activation)
  const s = await stage({ activation: { isActive: false, hasBeenActive: true } });
  await flush();
  assert.equal(s.world.constructed, 1);
  s.svc.dispose();
  // a context the engine does not start outside a gesture: one resume is tried, then the service waits, armed
  const t = await stage({ activation: { isActive: false, hasBeenActive: true } });
  const ac = t.ac();
  ac.resume = function () { this.calls.resume += 1; return Promise.resolve(); }; // stays suspended
  ac.state = 'suspended'; ac.onstatechange(); // the system took the output away
  for (let i = 0; i < 20; i++) t.frame();
  await flush();
  assert.ok(ac.calls.resume <= 2, `resume calls outside a gesture: ${ac.calls.resume}`);
  assert.equal(t.svc.state().armed, true);
  assert.equal(t.started().length, 0);
  t.svc.dispose();
});

// ---- 5. mute, volume, visibility ---------------------------------------------------------------------------------------------
const outTargets = (ac) => ac.log.filter((e) => e[0] === 'gain1' && e[1] === 'target'); // the first gain the graph makes is `out`
await ok('the output follows window.__sound.muted and .volume with a short ramp; silence suspends after a few seconds', async () => {
  const s = await stage({});
  await s.gesture();
  s.frame();
  let t = outTargets(s.ac());
  assert.deepEqual(t[t.length - 1].slice(2), [0.8, 0, TIMING.followTau]);
  s.win.__sound.volume = 0.3; s.advance(0.1);
  t = outTargets(s.ac());
  assert.deepEqual(t[t.length - 1].slice(2, 3), [0.3]);
  assert.equal(s.svc.state().followed.gain, 0.3);
  const before = t.length;
  s.advance(1, 60); // nothing changes: nothing is written
  assert.equal(outTargets(s.ac()).length, before);
  s.win.__sound.muted = true; s.advance(0.02);
  t = outTargets(s.ac());
  assert.equal(t[t.length - 1][2], 0);
  assert.equal(s.ac().calls.suspend, 0);
  s.advance(TIMING.silentSuspend + 0.1, 10);
  assert.equal(s.ac().calls.suspend, 1);
  assert.equal(s.svc.state().asleep, 'silent');
  // unmuted: resumed, and the ramp goes back to the app's volume
  const resumes = s.ac().calls.resume;
  s.win.__sound.muted = false; s.frame(); await flush(); s.frame();
  assert.equal(s.ac().calls.resume, resumes + 1);
  t = outTargets(s.ac());
  assert.equal(t[t.length - 1][2], 0.3);
  assert.equal(s.svc.state().asleep, null);
  // volume 0 is silence too; the settings event alone (no frame) is enough to follow
  s.win.__sound.volume = 0; s.win.fire('ob:settings', { detail: { key: 'volume' } });
  t = outTargets(s.ac());
  assert.equal(t[t.length - 1][2], 0);
  // the half-second timer follows when the app delivers no frame
  s.win.__sound.volume = 0.5; s.timers[0].fn();
  t = outTargets(s.ac());
  assert.equal(t[t.length - 1][2], 0.5);
  s.svc.dispose();
});

await ok('the clock: the one ramp of the output is set at context time 0 while the context already reads running; state().clock says so until the time moves, and nothing is applied again when it does', async () => {
  const s = await stage({});
  assert.equal(s.svc.state().clock, 'none');
  await s.gesture();
  for (let i = 0; i < 40; i++) s.frame(); // the output has delivered no callback yet: frames go by, the time stands at 0
  assert.equal(s.ac().state, 'running');
  assert.equal(s.ac().currentTime, 0);
  assert.equal(s.svc.state().clock, 'not started', 'a tool must not read a gain yet: nothing has been rendered');
  let t = outTargets(s.ac());
  assert.equal(t.length, 1, 'one ramp');
  assert.deepEqual(t[0].slice(2), [0.8, 0, TIMING.followTau]);
  assert.equal(s.svc.state().followed.gain, 0.8);
  s.advance(1, 60); // the output starts: the ramp set at time 0 runs by the audio clock
  assert.equal(s.svc.state().clock, 'started');
  t = outTargets(s.ac());
  assert.equal(t.length, 1, 'no second application');
  await s.svc.dispose?.();
});

await ok('muted or without window.__sound: a gesture creates nothing; unmuting later does', async () => {
  const s = await stage({ sound: { muted: true, volume: 0.8, scheduled: 0 } });
  await s.gesture();
  for (let i = 0; i < 10; i++) s.frame();
  assert.equal(s.world.constructed, 0);
  s.win.__sound.muted = false; s.frame(); await flush();
  assert.equal(s.world.constructed, 1); // the gesture was latched; sticky activation carries it
  s.svc.dispose();
  const z = await stage({ sound: { muted: false, volume: 0, scheduled: 0 } });
  await z.gesture();
  assert.equal(z.world.constructed, 0);
  z.svc.dispose();
  const none = await stage({ sound: null });
  await none.gesture();
  none.frame();
  assert.equal(none.world.constructed, 0);
  assert.match(none.svc.state().followed.source, /silent/);
  none.svc.dispose();
});

await ok('a hidden page suspends at once and a visible one resumes; nothing is created while hidden', async () => {
  const s = await stage({});
  await s.gesture(); s.frame();
  s.doc.visibilityState = 'hidden'; s.doc.fire('visibilitychange');
  assert.equal(s.ac().calls.suspend, 1);
  assert.equal(s.svc.state().asleep, 'hidden');
  const r = s.ac().calls.resume;
  s.frame(); s.timers[0].fn();
  assert.equal(s.ac().calls.resume, r); // not while hidden
  s.doc.visibilityState = 'visible'; s.doc.fire('visibilitychange'); await flush();
  assert.equal(s.ac().calls.resume, r + 1);
  assert.equal(s.svc.state().context, 'running');
  s.svc.dispose();
  const h = await stage({ visibility: 'hidden' });
  await h.gesture();
  assert.equal(h.world.constructed, 0);
  h.svc.dispose();
});

// ---- 6. the room and the modes ---------------------------------------------------------------------------------------------------
await ok('full: the bed loops and the far plan on the audio clock; sfx: neither', async () => {
  const s = await stage({});
  await s.gesture(); s.frame();
  const bedSources = s.started();
  assert.equal(bedSources.length, 3);
  const t0 = bedSources[0].started.when;
  assert.deepEqual(bedSources.map((b) => b.buffer.duration), [31, 43, 1]);
  // the bed bus fades in over the look's time
  assert.ok(s.ac().log.some((e) => e[1] === 'ramp' && e[2] === 1 && Math.abs(e[3] - (t0 + TIMING.bedFadeIn)) < 1e-9));
  s.advance(600, 600 * 4); // ten minutes of room time at four steps a second
  const farSources = s.started().slice(3);
  const plan = farEvents(AUDIO_SEED, 0, 600 + TIMING.farLookahead - 0.2);
  assert.ok(farSources.length >= plan.length - 1 && farSources.length <= plan.length + 1, `far sources ${farSources.length} against a plan of ${plan.length}`);
  farSources.forEach((src, i) => {
    assert.ok(Math.abs(src.started.when - (t0 + plan[i].t)) < 1e-6, `far sound ${i} at ${src.started.when} against ${t0 + plan[i].t}`);
    assert.ok(src.started.when > src.started.at, 'a far sound is scheduled ahead, never late');
    assert.equal(src.loop, false);
  });
  const st = s.svc.state();
  assert.equal(st.far.scheduled, farSources.length);
  assert.equal(st.far.late, 0);
  assert.equal(st.sources.bedSources, 3);
  // the steady state: no new node between far sounds (three sources, their gains and panners were made once)
  const nodes = s.ac().nodes;
  const quiet = (() => { let t = 600; for (;;) { const e = farEvents(AUDIO_SEED, t, t + 3.5); if (!e.length) return t; t = e[e.length - 1].t + 0.5; } })();
  s.advance(quiet - 600, Math.ceil((quiet - 600) * 4)); const at = s.ac().nodes; s.advance(1.5, 90);
  assert.equal(s.ac().nodes, at, 'frames between far sounds create no node');
  assert.ok(at >= nodes);
  // run time: sfx stops the room; full brings it back where it was
  assert.equal(s.svc.set({ mode: 'sfx' }), true);
  s.advance(0.5, 5);
  assert.ok(bedSources.every((b) => b.stopped !== null));
  assert.equal(s.svc.state().bed.on, false);
  const count = s.started().length;
  s.advance(120, 480);
  assert.equal(s.started().length, count, 'sfx schedules no room sound');
  s.svc.set({ mode: 'full' }); s.advance(0.5, 5);
  assert.equal(s.svc.state().bed.on, true);
  assert.ok(s.svc.state().bed.roomTime > 600);
  s.svc.dispose();

  const x = await stage({ query: 'clubaudio=sfx' });
  await x.gesture(); x.advance(300, 1200);
  assert.deepEqual(x.renders[0].want, { bed: false, far: false, chalk: true });
  assert.equal(x.started().length, 0);
  assert.equal(x.svc.state().assets.bytes, 0);
  x.svc.dispose();
  // the lite tier (tiers.js: audio 'sfx', no second table)
  const lite = await stage({ knobs: { audio: 'sfx', farTable: false } });
  assert.equal(lite.svc.state().mode, 'sfx');
  lite.svc.dispose();
  const noFar = await stage({ knobs: { audio: 'full', farTable: false } });
  await noFar.gesture(); noFar.advance(900, 3600);
  assert.ok(noFar.svc.state().far.scheduled > 0);
  assert.deepEqual(Object.keys(noFar.svc.state().far.byKind).sort(), ['glass']);
  noFar.svc.dispose();
});

await ok('the bed gains bring each loop to the level in LEVELS (and set({ levels }) moves them)', async () => {
  const { FakeContext } = fakeAudio({ startState: 'running' });
  const ac = new FakeContext();
  const assets = await fakeRender([])(null, 1, { bed: true, far: true, chalk: true });
  const g = buildGraph(ac, assets, LEVELS);
  g.startBed(0.05, 4);
  const gains = ac.log.length; // (values are read off the nodes below)
  assert.ok(gains >= 0);
  const target = dbToGain(LEVELS.bedRmsDb);
  // loop rms x its gain = the target; the hum sits at its own level
  const vals = [];
  const realGain = ac.createGain.bind(ac);
  ac.createGain = () => { const n2 = realGain(); vals.push(n2); return n2; };
  const g2 = buildGraph(ac, assets, LEVELS);
  g2.startBed(0.05, 4);
  const [, , , , , roomTrim, chalkTrim, ga, gb, gh] = vals; // out, bedBus, duck, farBus, sfxBus, the two trims, then the three loops
  // a graph starts on the low step
  assert.ok(Math.abs(roomTrim.gain.value - dbToGain(LOW_TRIM.roomDb)) < 1e-12 && Math.abs(chalkTrim.gain.value - dbToGain(LOW_TRIM.chalkDb)) < 1e-12);
  assert.ok(Math.abs(ga.gain.value * 0.2 - target) < 1e-12);
  assert.ok(Math.abs(gb.gain.value * 0.25 - target) < 1e-12);
  assert.ok(Math.abs(gh.gain.value * 0.8 - dbToGain(LEVELS.humRmsDb)) < 1e-12);
  // a far take and a chalk take play at their peak level (the takes are at peak 1) plus the plan's trim
  const ev = farEvents(AUDIO_SEED, 0, 400)[0];
  g2.playFar(ev, 1, 0);
  assert.ok(Math.abs(vals[vals.length - 1].gain.value - dbToGain(LEVELS.farPeakDb[ev.kind] + ev.gainDb)) < 1e-12);
  const cp = { ...chalkPlan(1, 0), variant: 1 };
  const h = g2.playChalk(cp, 2);
  assert.ok(Math.abs(vals[vals.length - 1].gain.value - dbToGain(LEVELS.chalkPeakDb + cp.gainDb)) < 1e-12);
  assert.ok(h.end > h.start && h.cut(2.1) === true && h.cut(h.end + 1) === false);
  // louder than the game is not a level this service takes: the app's medium ball-ball voice peaks near -10 dBFS (the dev page measures it)
  assert.ok(LEVELS.bedRmsDb <= -40 && LEVELS.chalkPeakDb <= -20 && Object.values(LEVELS.farPeakDb).every((v) => v <= -30) && LEVELS.humRmsDb <= LEVELS.bedRmsDb - 12);
});

// ---- 7. chalk -----------------------------------------------------------------------------------------------------------------
const playing = (seed, from = 0) => { for (let k = from; ; k++) if (chalkPlan(seed, k).play) return k; };
const silent = (seed, from = 0) => { for (let k = from; ; k++) if (!chalkPlan(seed, k).play) return k; };
await ok('chalk: only after a shot of the player, by the plan of the shot index, never under the app\'s voices, cut by a strike', async () => {
  const seed = AUDIO_SEED; // the plan's seed alone: the rack's seed has no say
  const s = await stage({ game: null });
  s.game.seed = 7;
  await s.gesture(); s.frame();
  const sources0 = s.started().length;
  // a shot whose NEXT index has chalk in the plan
  const k = playing(seed, 1);
  const shoot = (index, { tail = false, voices = 6 } = {}) => {
    s.machine.to('SIMULATING'); s.game.shotIndex = index; s.machine.to('PLAYBACK', { duration: 3, strike: true });
    for (let i = 0; i < voices; i++) { s.win.__sound.scheduled += 1; s.advance(0.4, 4); } // the app schedules its voices while it plays
    if (tail) { const un = s.machine.on('stateChange', (next) => { if (next === 'SETTLED') s.win.__sound.scheduled += 3; }); s.machine.to('SETTLED'); un(); } else s.machine.to('SETTLED');
    s.machine.to('AIM');
  };
  shoot(k);
  const tEnd = s.ac().t;
  const lastVoice = tEnd - 0.4;
  assert.equal(s.svc.state().chalk.decisions, 1);
  assert.deepEqual(s.svc.state().chalk.lastDecision, { shot: k, play: true, variant: chalkPlan(seed, k).variant });
  assert.ok(s.svc.state().chalk.pending);
  s.advance(8, 800);
  const chalks = s.started().slice(sources0).filter((x) => x.buffer.duration === 0.7);
  assert.equal(chalks.length, 1);
  const due = tEnd + chalkPlan(seed, k).delay;
  const earliest = Math.max(due, lastVoice + TIMING.appQuietPlayback, tEnd + TIMING.appQuietPlayback);
  assert.ok(chalks[0].started.when >= earliest - 1e-9, `chalk at ${chalks[0].started.when}, earliest ${earliest}`);
  assert.ok(chalks[0].started.when <= earliest + 0.05, 'and no later than a frame or two after it may');
  assert.ok(Math.abs(chalks[0].playbackRate.value - chalkPlan(seed, k).rate) < 1e-12);
  assert.equal(s.svc.state().chalk.played, 1);

  // the end-of-playback pass of the app (the return track): the longer guard
  const k2 = playing(seed, k + 1);
  shoot(k2, { tail: true });
  const tEnd2 = s.ac().t;
  s.advance(10, 1000);
  const chalks2 = s.started().slice(sources0).filter((x) => x.buffer.duration === 0.7);
  assert.equal(chalks2.length, 2);
  assert.ok(chalks2[1].started.when >= tEnd2 + TIMING.appQuietTail - 1e-9, `chalk at ${chalks2[1].started.when} after a tail pass at ${tEnd2}`);

  // a shot whose next index has no chalk: none
  const k3 = silent(seed, k2 + 1);
  shoot(k3); s.advance(10, 500);
  assert.equal(s.started().slice(sources0).filter((x) => x.buffer.duration === 0.7).length, 2);
  assert.equal(s.svc.state().chalk.lastDecision.play, false);

  // a replay is not a shot: nothing is owed
  const dec = s.svc.state().chalk.decisions;
  s.machine.to('PLAYBACK', { replay: true }); s.advance(1, 10); s.machine.to('SETTLED'); s.machine.to('AIM'); s.advance(10, 500);
  assert.equal(s.svc.state().chalk.decisions, dec);

  // the player shoots while a take sounds: it is ramped out within the cut time and stopped; a pending one is dropped
  const k4 = playing(seed, k3 + 1);
  shoot(k4);
  let guardLoop = 0;
  while (!s.svc.state().chalk.playing && guardLoop++ < 2000) s.advance(0.01);
  assert.ok(s.svc.state().chalk.playing);
  const sounding = s.started().slice(sources0).filter((x) => x.buffer.duration === 0.7).pop();
  s.advance(0.1, 5);
  const tStrike = s.ac().t;
  s.machine.to('SIMULATING');
  assert.ok(sounding.stopped !== null && sounding.stopped <= tStrike + TIMING.chalkCut + 1e-9, 'the take is stopped within the cut time');
  assert.ok(s.ac().log.some((e) => e[1] === 'target' && e[2] === 0 && e[3] === tStrike && e[4] <= TIMING.chalkCut));
  assert.equal(s.svc.state().chalk.cut, 1);
  s.game.shotIndex = playing(seed, k4 + 1); s.machine.to('PLAYBACK', { strike: true }); s.advance(0.5, 5); s.machine.to('SETTLED'); s.machine.to('AIM');
  assert.ok(s.svc.state().chalk.pending);
  s.machine.to('SIMULATING'); // shot again before it could start
  assert.equal(s.svc.state().chalk.pending, null);
  s.machine.to('PLAYBACK', { strike: true });
  const during = s.started().length;
  for (let i = 0; i < 30; i++) { s.win.__sound.scheduled += 1; s.advance(0.1); }
  assert.equal(s.started().filter((x) => x.buffer.duration === 0.7).length, s.started().slice(0, during).filter((x) => x.buffer.duration === 0.7).length, 'no chalk starts during PLAYBACK');
  assert.equal(s.svc.state().errors.length, 0);
  s.svc.dispose();
});

await ok('chalk: the nested order of the app\'s transitions (AIM delivered before SETTLED) gives the same guard; mute drops it', async () => {
  const seed = AUDIO_SEED;
  const machine = createStateMachine('AIM');
  // flow.js routes SETTLED -> AIM from inside its own SETTLED listener, registered BEFORE the club: later listeners see AIM first
  machine.on('stateChange', (next) => { if (next === 'SETTLED') machine.to('AIM'); });
  const s = await stage({ machine, game: null });
  s.game.seed = 3;
  // the app's sound listener sits between flow and the club: its end-of-playback pass runs after the nested AIM was delivered
  const order = [];
  machine.on('stateChange', (next, prev) => { order.push(`${prev}>${next}`); });
  await s.gesture(); s.frame();
  const k = playing(seed, 1);
  machine.to('SIMULATING'); s.game.shotIndex = k; machine.to('PLAYBACK', { strike: true });
  s.win.__sound.scheduled += 1; s.advance(1, 10);
  const un = machine.on('stateChange', () => {}); un();
  s.win.__sound.scheduled += 2; // (stands for the pass: counted before the club's SETTLED handler reads it)
  machine.to('SETTLED');
  assert.deepEqual(order.slice(-2), ['SETTLED>AIM', 'PLAYBACK>SETTLED']);
  const tEnd = s.ac().t;
  assert.equal(machine.state, 'AIM');
  assert.ok(s.svc.state().chalk.pending);
  assert.equal(s.svc.state().app.tail, true);
  s.advance(10, 1000);
  const c = s.started().filter((x) => x.buffer.duration === 0.7);
  assert.equal(c.length, 1);
  assert.ok(c[0].started.when >= tEnd + TIMING.appQuietTail - 1e-9);
  // muted when the take is due: it waits, and is dropped when the context goes to sleep
  machine.to('SIMULATING'); s.game.shotIndex = playing(seed, k + 1); machine.to('PLAYBACK', { strike: true }); s.advance(1, 10); machine.to('SETTLED');
  assert.ok(s.svc.state().chalk.pending);
  s.win.__sound.muted = true; s.advance(6, 60);
  assert.equal(s.svc.state().chalk.pending, null);
  assert.equal(s.started().filter((x) => x.buffer.duration === 0.7).length, 1);
  s.svc.dispose();
});

await ok('the room tone steps back under a playback and comes back when the app\'s voices are over', async () => {
  const s = await stage({});
  await s.gesture(); s.advance(10, 40);
  const duckTargets = () => s.ac().log.filter((e) => e[0] === 'gain3' && e[1] === 'target'); // out, bedBus, duck: the third gain
  assert.equal(duckTargets().length, 0);
  assert.equal(s.svc.state().bed.ducked, false);
  s.machine.to('SIMULATING');
  const tStrike = s.ac().t;
  let d = duckTargets();
  assert.equal(d.length, 1);
  assert.ok(Math.abs(d[0][2] - dbToGain(LEVELS.bedDuckDb)) < 1e-12 && d[0][3] === tStrike && d[0][4] === TIMING.duckIn);
  s.machine.to('PLAYBACK', { strike: true });
  for (let i = 0; i < 5; i++) { s.win.__sound.scheduled += 1; s.advance(0.4, 4); }
  s.machine.to('SETTLED'); s.machine.to('AIM');
  const tEnd = s.ac().t;
  assert.equal(duckTargets().length, 1, 'held down through the playback');
  s.advance(TIMING.appQuietPlayback - 0.1, 20);
  assert.equal(s.svc.state().bed.ducked, true, 'and until the app\'s voices are over');
  s.advance(0.3, 6);
  d = duckTargets();
  assert.equal(d.length, 2);
  assert.ok(d[1][2] === 1 && d[1][3] >= tEnd + TIMING.appQuietPlayback - 1e-9 && d[1][4] === TIMING.duckOut);
  assert.equal(s.svc.state().bed.ducked, false);
  // a replay ducks too (the app voices it); no bed, no duck
  s.machine.to('PLAYBACK', { replay: true });
  assert.equal(duckTargets().length, 3);
  s.svc.dispose();
  const x = await stage({ query: 'clubaudio=sfx' });
  await x.gesture(); x.advance(2, 8);
  x.machine.to('SIMULATING'); x.machine.to('PLAYBACK', { strike: true }); x.advance(1, 4);
  assert.equal(x.ac().log.filter((e) => e[0] === 'gain3' && e[1] === 'target').length, 0);
  assert.equal(x.svc.state().bed.ducked, false);
  x.svc.dispose();
  assert.ok(LEVELS.bedDuckDb <= 0 && LEVELS.bedDuckDb >= -20);
});

// ---- 8. listeners never throw; a broken part is switched off ---------------------------------------------------------------------
await ok('listeners never throw: a hostile game, window, machine and engine', async () => {
  const boom = () => { throw new Error('boom'); };
  const hostileGame = new Proxy({}, { get: boom, set: boom, has: boom });
  const s = await stage({ game: hostileGame, camera: new Proxy({}, { get: boom }) });
  Object.defineProperty(s.win, '__sound', { get: boom, configurable: true });
  await s.gesture(); s.frame();
  s.machine.to('PLAYBACK', { strike: true }); s.machine.to('SETTLED'); s.machine.to('AIM');
  assert.equal(s.world.constructed, 0); // an unreadable window.__sound is silence
  Object.defineProperty(s.win, '__sound', { value: { muted: false, volume: 0.8, get scheduled() { return boom(); } }, configurable: true });
  s.frame(); await flush();
  assert.equal(s.world.constructed, 1);
  s.advance(60, 240);
  s.machine.to('SIMULATING'); s.machine.to('PLAYBACK', { strike: true }); s.advance(1, 4); s.machine.to('SETTLED'); s.machine.to('AIM'); s.advance(10, 100);
  assert.equal(s.svc.state().chalk.decisions, 2); // both shots were decided: the unreadable shot index falls back to the service's own count
  assert.equal(s.svc.state().chalk.lastDecision.shot, 2);
  s.svc.dispose();

  // an engine that starts refusing nodes: the part that hit it is switched off with a note, nothing is thrown
  for (const failAfterNodes of [0, 2, 5, 9, 13, 20]) {
    const t = await stage({ failAfterNodes });
    await t.gesture();
    t.advance(400, 1600);
    t.machine.to('SIMULATING'); t.machine.to('PLAYBACK', { strike: true }); t.advance(1, 4); t.machine.to('SETTLED'); t.machine.to('AIM'); t.advance(10, 100);
    const st = t.svc.state();
    assert.ok(st.errors.length > 0 || Object.keys(st.off).length > 0 || st.enabled === false, `failAfterNodes ${failAfterNodes}: the failure is recorded`);
    assert.ok(st.notes.length > 0 || st.errors.length > 0);
    t.svc.dispose();
  }
  // a render that rejects, and one that returns nothing: no throw, the room simply does not come
  for (const render of [async () => { throw new Error('render failed'); }, async () => null, () => { throw new Error('sync'); }]) {
    const r = await stage({ render });
    await r.gesture(); r.advance(30, 120);
    r.machine.to('PLAYBACK', { strike: true }); r.machine.to('SETTLED'); r.machine.to('AIM'); r.advance(10, 100);
    assert.equal(r.started().length, 0);
    r.svc.dispose();
  }
  // a constructor that throws: off for good, with the reason
  const dead = await createAudio({ ctx: { machine: createStateMachine('AIM'), query: new URLSearchParams('') }, knobs: { audio: 'full' } }, {
    window: Object.assign(fakeTarget(), { __sound: { muted: false, volume: 1, scheduled: 0 } }), document: fakeTarget(), navigator: { userActivation: { isActive: true, hasBeenActive: true } },
    AudioContext: function Throws() { throw new Error('no device'); }, OfflineAudioContext: null, setInterval: () => 1, clearInterval: () => {},
  });
  assert.equal(dead.enabled, false);
  assert.match(dead.state().reason, /no device/);
  // odd arguments to set() and a second dispose
  const q = await stage({});
  assert.equal(q.svc.set(null), false);
  assert.equal(q.svc.set({ mode: 'loud', levels: { bedRmsDb: 'x' } }), true); // (the levels object was taken; its bad member ignored)
  assert.equal(q.svc.state().levels.bedRmsDb, LEVELS.bedRmsDb);
  q.svc.set({ levels: { bedRmsDb: 12, farPeakDb: { glass: -50 } } });
  assert.equal(q.svc.state().levels.bedRmsDb, 0);
  assert.equal(q.svc.state().levels.farPeakDb.glass, -50);
  q.svc.dispose(); q.svc.dispose();
  assert.equal(q.svc.set({ mode: 'sfx' }), false);
});

// ---- 9. dispose, and read-only ---------------------------------------------------------------------------------------------------
await ok('dispose leaves nothing: no listener, no timer, no source, a closed context', async () => {
  const s = await stage({});
  const machineListeners = () => { let c = 0; const probe = s.machine.on('stateChange', () => { c += 1; }); probe(); return c; };
  assert.ok(s.win.count() >= 4 && s.doc.count() === 1 && s.frames.length === 1); // three gestures + ob:settings; visibility; one frame hook
  await s.gesture(); s.advance(30, 120);
  assert.equal(s.timers.length, 1);
  const ac = s.ac();
  s.svc.dispose();
  assert.equal(s.win.count() + s.doc.count() + s.frames.length, 0);
  assert.equal(s.timers[0].cleared, true);
  assert.equal(ac.calls.close, 1);
  assert.ok(ac.sources.filter((x) => x.started).every((x) => x.stopped !== null));
  assert.equal(s.svc.enabled, false);
  // after dispose the machine's events reach nothing of the service
  const nodes = ac.nodes;
  s.machine.to('PLAYBACK', { strike: true }); s.machine.to('SETTLED'); s.machine.to('AIM'); s.frame();
  await s.gesture();
  assert.equal(ac.nodes, nodes);
  assert.equal(s.world.constructed, 1);
  assert.equal(machineListeners(), 0);
});

await ok('read-only: the game, the machine, the camera and window.__sound are never written', async () => {
  const writes = [];
  const guardObj = (name, obj) => new Proxy(obj, {
    set(_t, k) { writes.push(`${name}.${String(k)}`); return true; },
    defineProperty(_t, k) { writes.push(`${name}.${String(k)}`); return true; },
    deleteProperty(_t, k) { writes.push(`${name}.${String(k)}`); return true; },
  });
  const machine = createStateMachine('AIM');
  const sound = { muted: false, volume: 0.8, scheduled: 0, setMuted() { writes.push('sound.setMuted()'); }, setVolume() { writes.push('sound.setVolume()'); }, captureStream() { writes.push('sound.captureStream()'); return null; } };
  const s = await stage({
    machine, sound: guardObj('sound', sound),
    game: guardObj('game', { shotIndex: 2, seed: 9, record: Object.freeze({ events: [] }), clock: 0, slowmo: false, paused: false }),
    camera: guardObj('camera', { matrixWorldInverse: guardObj('view', { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] }) }),
  });
  await s.gesture(); s.advance(120, 480);
  for (let i = 0; i < 4; i++) { machine.to('SIMULATING'); machine.to('PLAYBACK', { strike: true }); s.advance(1, 10); machine.to('SETTLED'); machine.to('AIM'); s.advance(9, 90); }
  s.svc.set({ mode: 'sfx' }); s.advance(5, 20);
  s.svc.dispose();
  assert.deepEqual(writes, []);
  assert.equal(machine.state, 'AIM');
});

// ---- 10. the pure helpers of the render and of the measurements ---------------------------------------------------------------------
await ok('render helpers: seeded noise, slow curves, the loop seam, the hum, the room response, grains', () => {
  assert.deepEqual(Array.from(noiseData(32, 5)), Array.from(noiseData(32, 5)));
  assert.notDeepEqual(Array.from(noiseData(32, 5)), Array.from(noiseData(32, 6)));
  const nd = noiseData(48000, 9);
  const r = rmsPeak(nd);
  assert.ok(Math.abs(r.rms - 1 / Math.sqrt(3)) < 0.01 && r.peak <= 1);
  const c = slowCurve(mulberry32(4), 44.5, { lo: 0.8, hi: 1.2, knot: 8, step: 0.5 });
  assert.equal(c.length, 90);
  assert.ok(c.every((v) => v >= 0.8 - 1e-6 && v <= 1.2 + 1e-6));
  let maxStep = 0;
  for (let i = 1; i < c.length; i++) maxStep = Math.max(maxStep, Math.abs(c[i] - c[i - 1]));
  assert.ok(maxStep < 0.08, `a slow curve moves slowly (largest step ${maxStep})`);
  assert.deepEqual(Array.from(slowCurve(mulberry32(4), 44.5, { lo: 0.8, hi: 1.2 })), Array.from(c));
  // the seam: the loop's first sample continues its last one, and equal power holds through the fade
  const loop = 4000, fade = 800, total = loop + fade;
  const ramp = Float32Array.from({ length: total }, (_, i) => Math.sin(i * 0.002)); // a slow wave: neighbours differ by < 0.002
  const out = seamLoop(ramp, loop, fade);
  assert.equal(out.length, loop);
  assert.ok(Math.abs(out[0] - ramp[loop]) < 0.003, 'the head starts from the sample after the loop\'s end');
  assert.ok(Math.abs(out[0] - out[loop - 1]) < 0.006, 'no jump across the seam');
  assert.ok(Math.abs(out[fade] - ramp[fade]) < 1e-6 && Math.abs(out[fade - 1] - ramp[fade - 1]) < 0.003, 'the fade ends on the head itself');
  const noisy = noiseData(total, 3), seamed = seamLoop(noisy, loop, fade);
  const inFade = rmsPeak(seamed, 0, fade).rms, after = rmsPeak(seamed, fade, loop).rms;
  assert.ok(Math.abs(20 * Math.log10(inFade / after)) < 0.6, `equal power through the seam (${(20 * Math.log10(inFade / after)).toFixed(2)} dB)`);
  // the hum closes exactly on itself: whole cycles in the loop
  const h = humData(RATES.bed, BED.humSeconds, BED.humHz, 1);
  assert.equal(h.length, RATES.bed * BED.humSeconds);
  const w = 2 * Math.PI * BED.humHz / RATES.bed;
  assert.ok(Math.abs((BED.humHz * BED.humSeconds) % 1) < 1e-12);
  const next = h[1] - h[0], wrap = h[0] - h[h.length - 1];
  assert.ok(Math.abs(next - wrap) < 5 * w * w, 'the step across the loop point is the step inside the loop');
  // loop lengths are whole numbers of seconds (so are the hum's cycles) and share no factor
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  assert.equal(gcd(BED.seconds[0], BED.seconds[1]), 1);
  assert.equal(gcd(BED.secondsWide[0], BED.secondsWide[1]), 1);
  // stated bytes of the bed at its normal rate: (31 + 43 + 1) s x 16 000 x 4 bytes, mono
  assert.equal((BED.seconds[0] + BED.seconds[1] + BED.humSeconds) * RATES.bed * 4, 4800000);
  const ir = roomImpulse(24000, 1);
  let e = 0; for (const v of ir) e += v * v;
  assert.ok(Math.abs(e - 1) < 1e-4);
  const late = rmsPeak(ir, Math.round(0.6 * 24000), ir.length).rms, early = rmsPeak(ir, Math.round(0.05 * 24000), Math.round(0.15 * 24000)).rms;
  assert.ok(20 * Math.log10(late / early) < -30, 'the response decays');
  const curve = new Float32Array(400);
  grainStroke(curve, 0, 4000, mulberry32(2), { dur: 0.1, level: 0.9 });
  assert.ok(curve.every((v) => v >= 0 && v <= 0.9 + 1e-6) && curve[0] < 0.2 && curve[399] < 0.2 && Math.max(...curve) > 0.4);
});

await ok('measurements: FFT, levels in dBFS, bands, spans', () => {
  const rate = 16000, nSamp = 16000;
  const sine = Float32Array.from({ length: nSamp }, (_, i) => Math.sin(2 * Math.PI * 1000 * i / rate));
  const L = measureLevels(sine, rate);
  assert.ok(Math.abs(L.peakDb) < 0.01 && Math.abs(L.rmsDb + 3.01) < 0.02 && Math.abs(L.rmsWinDb + 3.01) < 0.05);
  const re = Float32Array.from(sine.subarray(0, 1024)), im = new Float32Array(1024);
  fft(re, im);
  let best = 0;
  for (let b = 1; b < 512; b++) if (Math.hypot(re[b], im[b]) > Math.hypot(re[best], im[best])) best = b;
  assert.equal(best, 64); // 1000 Hz at 16 kHz in 1024 points
  const sp = stft(sine, rate, 1024);
  const spec = spectrumOf(sp);
  assert.ok(Math.abs(spec.centroidHz - 1000) < 30);
  assert.ok(spec.bandsDb[500] < -40 && spec.bandsDb[1000] === 0 && spec.bandsDb[8000] === null);
  assert.ok(Math.abs(sp.power[5 * sp.bins + 64] - 1) < 0.05, 'a full-scale sine reads 1 at its bin');
  const gated = new Float32Array(rate);
  for (let i = 2000; i < 4000; i++) gated[i] = 0.5;
  for (let i = 9000; i < 9500; i++) gated[i] = 0.5;
  const spans = activeSpans(gated, rate, -60);
  assert.equal(spans.length, 2);
  assert.ok(Math.abs(spans[0][0] - 0.125) < 0.006 && Math.abs(spans[0][1] - 0.25) < 0.006);
  assert.ok(Math.abs(overlapSeconds(spans, [[0.2, 0.6]]) - (0.05 + 0.03125)) < 0.01);
  assert.equal(overlapSeconds(spans, [[0.3, 0.5]]), 0);
});

// ---- 11. the follow-up: the bank proof, the two levels, the session seed, the harmonic check ----------------------------------------
const BASE = 'https://example.test/play/assets/sfx/';
const entry = (file, over = {}) => ({ name: BASE + file, entryType: 'resource', responseEnd: 812.5, responseStatus: 200, decodedBodySize: 30044, transferSize: 30300, ...over });
const bankEntries = (over = {}) => BANK_FILES.map((f) => entry(f, over));
await ok('bankProof: the recorded bank is established only by a finished, successful, non-empty response for EVERY file', () => {
  // the list is the app's own (web/app/synth.js SFX_FILES), file for file
  const appFiles = [];
  for (const tiersOf of Object.values(SFX_FILES)) for (const list of Object.values(tiersOf)) appFiles.push(...list);
  assert.deepEqual([...BANK_FILES].sort(), appFiles.sort());
  assert.equal(BANK_FILES.length, 39);
  const good = bankProof(bankEntries());
  assert.deepEqual({ proven: good.proven, ok: good.ok, wanted: good.wanted, missing: good.missing }, { proven: true, ok: 39, wanted: 39, missing: [] });
  // among the page's other entries, with a query string, revalidated from the cache (304)
  const mixed = [{ name: 'https://example.test/play/app/main.js', responseEnd: 5, responseStatus: 200, decodedBodySize: 9 }, ...bankEntries({ responseStatus: 304 }).map((e) => ({ ...e, name: `${e.name}?v=3#x` }))];
  assert.equal(bankProof(mixed).proven, true);
  // nothing, null, not an array
  for (const none of [[], null, undefined, {}, 'x']) assert.equal(bankProof(none).proven, false);
  assert.match(bankProof([]).why, /no bank file/);
  // one file short, in every way a file can be short
  const short = (over) => bankProof(bankEntries().map((e, i) => (i === 17 ? { ...e, ...over } : e)));
  assert.equal(bankProof(bankEntries().filter((_, i) => i !== 17)).proven, false);
  for (const over of [
    { responseStatus: 404 }, { responseStatus: 500 }, { responseStatus: 0 }, { responseStatus: undefined }, { responseStatus: '200' },
    { responseEnd: 0 }, { decodedBodySize: 0 }, { decodedBodySize: 44 }, { decodedBodySize: undefined },
    { contentType: 'text/html; charset=utf-8' }, { contentType: 'application/json' },
    { name: 'https://example.test/play/assets/other/cue-h2.wav' }, { name: 'https://example.test/play/assets/sfx/old/cue-h2.wav' }, { name: 42 },
  ]) {
    const r = short(over);
    assert.equal(r.proven, false, JSON.stringify(over));
    assert.equal(r.ok, 38);
    assert.deepEqual(r.missing, [BANK_FILES[17]]);
  }
  // an engine whose entries carry no status cannot make the proof at all
  assert.equal(bankProof(bankEntries({ responseStatus: undefined })).ok, 0);
  // a content type that is audio, or none, passes; a first attempt that failed and a second that arrived passes
  assert.equal(bankProof(bankEntries({ contentType: 'audio/wav' })).proven, true);
  assert.equal(bankProof(bankEntries({ contentType: '' })).proven, true);
  assert.equal(bankProof([...bankEntries({ responseStatus: 503, decodedBodySize: 0 }), ...bankEntries()]).proven, true);
  // pure: the entries are not touched
  const frozen = Object.freeze(bankEntries().map((e) => Object.freeze(e)));
  assert.equal(bankProof(frozen).proven, true);
});

const trims = (ac) => ({ room: ac.log.filter((e) => e[0] === 'gain6' && e[1] === 'target'), chalk: ac.log.filter((e) => e[0] === 'gain7' && e[1] === 'target') });
await ok('two levels: low by default; the high level needs the proof, a second of hold, and no playback', async () => {
  // no bank among the entries: low for good, through shots and minutes
  const low = await stage({ entries: [{ name: 'https://example.test/play/app/main.js', responseEnd: 5, responseStatus: 200, decodedBodySize: 9 }] });
  await low.gesture(); low.advance(5, 20);
  low.machine.to('SIMULATING'); low.machine.to('PLAYBACK', { strike: true }); low.advance(2, 8); low.machine.to('SETTLED'); low.machine.to('AIM'); low.advance(300, 1200);
  assert.deepEqual(low.svc.state().voicing.trim, { ...LOW_TRIM });
  assert.equal(low.svc.state().voicing.level, 'low');
  assert.equal(low.svc.state().voicing.bankProven, false);
  assert.equal(trims(low.ac()).room.length + trims(low.ac()).chalk.length, 0);
  assert.match(low.svc.state().voicing.last.why, /no bank file/);
  // the entries are read every two seconds for half a minute, then only when a shot has ended
  const reads = low.perf.reads;
  assert.ok(reads >= 10 && reads <= 20, `reads in five minutes: ${reads}`);
  low.advance(120, 480);
  assert.equal(low.perf.reads, reads);
  low.machine.to('SIMULATING'); low.machine.to('PLAYBACK', { strike: true }); low.advance(1, 4); low.machine.to('SETTLED'); low.machine.to('AIM'); low.advance(1, 4);
  assert.equal(low.perf.reads, reads + 1);
  low.svc.dispose();

  // the bank is there from the start: the step comes after the hold, as one ramp on each trim, and is never repeated
  const hi = await stage({ entries: bankEntries() });
  await hi.gesture(); hi.frame();
  assert.equal(hi.svc.state().voicing.bankProven, true);
  assert.equal(hi.svc.state().voicing.level, 'low', 'proven is not yet high');
  hi.advance(TIMING.bankHold - 0.2, 4);
  assert.equal(trims(hi.ac()).room.length, 0);
  hi.advance(0.4, 4);
  let t = trims(hi.ac());
  assert.equal(t.room.length, 1); assert.equal(t.chalk.length, 1);
  assert.deepEqual([t.room[0][2], t.room[0][4], t.chalk[0][2], t.chalk[0][4]], [1, TIMING.levelTau, 1, TIMING.levelTau]);
  assert.ok(t.room[0][3] >= TIMING.bankHold);
  assert.deepEqual(hi.svc.state().voicing.trim, { roomDb: 0, chalkDb: 0 });
  const readsHi = hi.perf.reads;
  hi.advance(120, 480);
  hi.machine.to('SIMULATING'); hi.machine.to('PLAYBACK', { strike: true }); hi.advance(1, 4); hi.machine.to('SETTLED'); hi.machine.to('AIM'); hi.advance(5, 20);
  t = trims(hi.ac());
  assert.equal(t.room.length, 1, 'it never steps again, and never down');
  assert.equal(hi.perf.reads, readsHi, 'and the entries are not read again');
  hi.svc.dispose();

  // the bank lands while a shot plays (that shot is voiced by the fallback to its end): the step waits for the guard after it
  let have = [];
  const mid = await stage({ entries: () => have });
  await mid.gesture(); mid.advance(3, 12);
  mid.machine.to('SIMULATING'); mid.machine.to('PLAYBACK', { strike: true });
  mid.win.__sound.scheduled += 1; mid.advance(0.5, 2);
  have = bankEntries(); // the last response arrives now
  for (let i = 0; i < 6; i++) { mid.win.__sound.scheduled += 1; mid.advance(0.5, 4); }
  assert.equal(mid.svc.state().voicing.bankProven, true);
  assert.equal(mid.svc.state().voicing.level, 'low', 'not during the playback');
  const lastVoice = mid.ac().t - 0.5;
  mid.machine.to('SETTLED'); mid.machine.to('AIM');
  const tEnd = mid.ac().t;
  mid.advance(TIMING.appQuietPlayback - 0.2, 20);
  assert.equal(mid.svc.state().voicing.level, 'low', 'not while the shot\'s voices may still sound');
  mid.advance(0.5, 10);
  assert.equal(mid.svc.state().voicing.level, 'high');
  assert.ok(trims(mid.ac()).room[0][3] >= Math.max(tEnd, lastVoice) + TIMING.appQuietPlayback - 1e-9);
  mid.svc.dispose();

  // where the proof cannot be made the service stays low: no status on the entries, no performance object, one that throws
  for (const o of [{ entries: bankEntries({ responseStatus: undefined }) }, { performance: null }, { performance: {} }, { performance: { getEntriesByType() { throw new Error('denied'); } } }, { entries: bankEntries().slice(1) }]) {
    const x = await stage(o);
    await x.gesture(); x.advance(60, 240);
    assert.equal(x.svc.state().voicing.level, 'low', JSON.stringify(Object.keys(o)));
    assert.equal(x.svc.state().errors.length, 0);
    x.svc.dispose();
  }
  // the numbers the low step was set from (measured on the dev page, 2026-11, app volume 1): the app's modal fallback click
  // (medium) and cue strike, and what this service puts out on the high step; low = high + LOW_TRIM, each 6 dB under or more
  const fallback = { click: { peak: -35.03, win: -51.79 }, cue: { peak: -36.78, win: -53.12 } };
  const high = { room: { peak: -36.15, win: -45.61 }, chalk: { peak: -25.01, win: -37.05 } };
  for (const ref of Object.values(fallback)) {
    assert.ok(high.room.win + LOW_TRIM.roomDb <= ref.win - 6 && high.room.peak + LOW_TRIM.roomDb <= ref.peak - 6);
    assert.ok(high.chalk.win + LOW_TRIM.chalkDb <= ref.win - 6 && high.chalk.peak + LOW_TRIM.chalkDb <= ref.peak - 6);
  }
  // and under a playback even the high step's room tone is 6 dB under those modal voices (some voices are modal with any bank)
  for (const ref of Object.values(fallback)) assert.ok(high.room.win + LEVELS.bedDuckDb <= ref.win - 6 && high.room.peak + LEVELS.bedDuckDb <= ref.peak - 6);
});

await ok('the plan\'s seed: one wall-clock read per page load, `?clubaudioseed=` for proofs; what a shot decides needs the seed and the shot index only', async () => {
  const a = await stage({ query: '', now: () => 1763128800000 });
  const b = await stage({ query: '', now: () => 1763128800001 });
  const c = await stage({ query: '', now: () => 1763128800000 });
  assert.equal(a.svc.state().seed, sessionSeed(1763128800000));
  assert.equal(a.svc.state().seedFrom, 'the wall clock at start');
  assert.notEqual(a.svc.state().seed, b.svc.state().seed);
  assert.equal(a.svc.state().seed, c.svc.state().seed);
  assert.notDeepEqual(farEvents(a.svc.state().seed, 0, 600).map((e) => e.t), farEvents(b.svc.state().seed, 0, 600).map((e) => e.t));
  // the clock is asked once, whatever the session does
  let asked = 0;
  const once = await stage({ query: '', now: () => { asked += 1; return 5; } });
  await once.gesture(); once.advance(60, 240);
  once.machine.to('SIMULATING'); once.machine.to('PLAYBACK', { strike: true }); once.advance(1, 4); once.machine.to('SETTLED'); once.machine.to('AIM'); once.advance(10, 40);
  assert.equal(asked, 1);
  // the buffers are rendered from the fixed seed in every session: the sounds that were measured are the ones that play
  assert.equal(once.renders[0].seed, AUDIO_SEED);
  // the room follows the session's seed
  const t0 = once.started()[0].started.when;
  const planned = farEvents(sessionSeed(5), 0, 60);
  once.started().filter((x) => x.buffer.duration === 1.2).forEach((src, i) => assert.ok(Math.abs(src.started.when - (t0 + planned[i].t)) < 1e-6));
  for (const x of [a, b, c, once]) x.svc.dispose();
  // a seed in the query wins over the clock; a clock that throws is seed 0, not a throw
  const q = await stage({ query: 'clubaudioseed=77', now: () => { throw new Error('no clock'); } });
  assert.equal(q.svc.state().seed, 77);
  assert.equal(q.svc.state().seedFrom, '?clubaudioseed');
  q.svc.dispose();
  const z = await stage({ query: '', now: () => { throw new Error('no clock'); } });
  assert.equal(z.svc.state().seed, sessionSeed(0));
  z.svc.dispose();
  // chalk: the same seed and shot index give the same decision whatever the rack's seed, the time or the room's history
  const decisions = [];
  for (const [rack, wait] of [[1, 3], [999, 40], [-5, 200]]) {
    const s = await stage({ query: 'clubaudioseed=4242', game: null });
    s.game.seed = rack;
    await s.gesture(); s.advance(wait, wait * 2);
    const seen = [];
    for (let k = 1; k <= 8; k++) {
      s.machine.to('SIMULATING'); s.game.shotIndex = k; s.machine.to('PLAYBACK', { strike: true }); s.advance(0.5, 2); s.machine.to('SETTLED'); s.machine.to('AIM');
      seen.push(s.svc.state().chalk.lastDecision);
      s.advance(6, 24);
    }
    decisions.push(seen);
    s.svc.dispose();
  }
  assert.deepEqual(decisions[0], decisions[1]);
  assert.deepEqual(decisions[0], decisions[2]);
  decisions[0].forEach((d, i) => { const p = chalkPlan(4242, i + 1); assert.deepEqual(d, { shot: i + 1, play: p.play, variant: p.variant }); });
});

await ok('harmonicStack: a stack of harmonics in the band of speech is flagged; resonances, partials, thumps and noise are not', () => {
  const rate = 24000, len = Math.round(0.35 * rate);
  const env = (i) => Math.min(1, i / 400) * Math.min(1, (len - i) / 400);
  const bell = (f, c, w) => Math.exp(-(((f - c) / w) ** 2));
  const vowel = (f0) => {
    const v = new Float32Array(len);
    for (let k = 1; k * f0 < 3400; k++) {
      const f = f0 * k, amp = bell(f, 700, 180) + 0.7 * bell(f, 1200, 200) + 0.4 * bell(f, 2500, 250) + 0.03;
      for (let i = 0; i < len; i++) v[i] += amp * Math.sin(2 * Math.PI * f * i / rate) * env(i) * 0.2;
    }
    return v;
  };
  const rnd = mulberry32(5);
  for (const f0 of [90, 140, 220, 330]) {
    const r = harmonicStack(vowel(f0), rate);
    assert.equal(r.flagged, true, `a vowel on ${f0} Hz`);
    assert.ok(r.maxRun >= 3 && r.heldSec >= 0.08);
  }
  // the same under noise at a quarter of its level, and at another sample rate
  assert.equal(harmonicStack(Float32Array.from(vowel(140), (x) => x + (rnd() * 2 - 1) * 0.05), rate).flagged, true);
  const v = vowel(140);
  assert.equal(harmonicStack(Float32Array.from({ length: 2 * len }, (_, i) => v[i >> 1]), 48000).flagged, true);
  // too short to be a syllable's core: not flagged (two frames)
  assert.equal(harmonicStack(v.subarray(0, Math.round(0.06 * rate)), rate).flagged, false);
  // what the room's sounds are made of
  const decay = (parts) => { const o = new Float32Array(len); for (const [f, d, amp = 1] of parts) for (let i = 0; i < len; i++) o[i] += amp * Math.sin(2 * Math.PI * f * i / rate) * Math.exp(-6.9 * i / rate / d); return o; };
  const cases = {
    'a ball\'s resonances': decay([[1220, 0.04], [1950, 0.052], [2720, 0.04], [4050, 0.026]]),
    'a glass\'s partials': decay([[2100, 0.16], [2100 * 2.31, 0.09, 0.5], [2100 * 4.2, 0.05, 0.2]]),
    'a thump': decay([[150, 0.06], [720, 0.018, 0.3]]),
    'a chalk squeak (one gliding tone)': Float32Array.from({ length: len }, (_, i) => Math.sin(2 * Math.PI * (2500 + 600 * i / len) * i / rate) * env(i)),
  };
  for (const [name, x] of Object.entries(cases)) assert.equal(harmonicStack(x, rate).flagged, false, name);
  assert.deepEqual(harmonicStack(cases['a ball\'s resonances'], rate).peaks, [1220, 1950, 2720]);
  let wrong = 0;
  for (let t = 0; t < 60; t++) { const r = mulberry32(100 + t); if (harmonicStack(Float32Array.from({ length: len }, (_, i) => (r() * 2 - 1) * env(i) * 0.3), rate).flagged) wrong += 1; }
  assert.equal(wrong, 0, 'noise is never flagged');
  assert.equal(harmonicStack(new Float32Array(len), rate).flagged, false);
  assert.equal(harmonicStack(new Float32Array(10), rate).flagged, false);
});

console.log(`\n${n} checks passed`);
