// Copyright (c) Meta Platforms, Inc. and affiliates.

// GH-1099: exercise the real recorder seam and DVR capture controller against
// delayed first frames, cancellation and bounded failure. No browser required.
// The fake recorder fires 'start' on its first frame (Chromium's observed
// order in #1099) and delivers a non-empty chunk every timeslice once frames
// flow; `noStartEvent` drops the 'start' event (an engine that never fires
// it: readiness must come from the first encoded chunk), `dieAt` kills the
// recorder before its first frame (an encoder that died: the startup bound
// must fail the run, never the 75 s cap). PLANTS at the end: the pre-fix
// controller (no startup gate), the gate without its startup bound, and a
// record.js without the chunk fallback must each fail their named case.
//   node web/tools/test-playback-recorder-startup.mjs   (exit 0 = every check held, every plant caught)
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DEFAULT_RECORD = fileURLToPath(new URL('../app/record.js', import.meta.url));
const DEFAULT_PLAYBACK = fileURLToPath(new URL('../app/playback.js', import.meta.url));
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

function recorderHarness(source, options = {}) {
  const state = { now: 0, instances: [], streams: [], draws: [], playCalls: [], stops: [],
    nextId: 0, raf: [], intervals: new Map(), listeners: new Map(), nativeReadyAt: options.readyAt ?? 0 };
  const canvas = { width: 640, height: 360, captureStream(rate) {
    const track = { readyState: 'live', stop() { this.readyState = 'ended'; } };
    const stream = { rate, getTracks: () => [track] };
    state.streams.push(stream); return stream;
  } };
  class Recorder {
    static isTypeSupported() { return true; }
    constructor(stream, config) {
      this.stream = stream; this.mimeType = config.mimeType; this.state = 'inactive';
      this.frames = []; this.began = false; state.instances.push(this);
    }
    start(timeslice) {
      if (options.startThrows) throw Error('native start refused');
      this.timeslice = timeslice; this.state = 'recording'; this.acceptedAt = state.now;
    }
    frame(T) {
      if (options.dieAt !== undefined && state.now >= options.dieAt && this.state !== 'inactive') {
        this.state = 'inactive'; this.died = true; // the encoder died before its first frame
      }
      if (this.state !== 'recording' || state.now < state.nativeReadyAt) return;
      if (!this.began) {
        this.began = true; this.startedAt = state.now; this.lastDataAt = state.now;
        if (!options.noStartEvent) this.onstart?.call(this, { type: 'start' });
      }
      this.frames.push({ T, at: state.now });
      if (state.now - this.lastDataAt >= (this.timeslice ?? 1000)) { // a timeslice of encoded bytes
        this.lastDataAt = state.now;
        this.firstDataAt ??= state.now;
        this.ondataavailable?.call(this, { data: new Blob(['timeslice-chunk']) });
      }
    }
    stop() {
      if (this.state === 'inactive') throw Error('inactive recorder'); // a dead recorder too
      this.state = 'inactive';
      state.stops.push({ at: state.now, frames: this.frames.length });
      Promise.resolve().then(() => {
        // A zero-frame stop can deliver start only after the recorder stopped.
        if (!this.began) this.onstart?.call(this, { type: 'start' });
        this.ondataavailable?.call(this, { data: new Blob(this.frames.length ? ['real-frame-model'] : []) });
        this.onstop?.call(this, { type: 'stop' });
      });
    }
    pause() { this.state = 'paused'; }
    resume() { this.state = 'recording'; }
  }
  const win = {};
  const context = vm.createContext({
    window: win, canvas, MediaRecorder: Recorder, Blob,
    ctx: {}, t: key => key, performance: { now: () => state.now },
    console, Math, SHARE_MAX_BYTES: 384 * 1024 * 1024,
    setTimeout, clearTimeout,
  });
  const m0 = source.indexOf('const MIMES ='), m1 = source.indexOf('];', m0) + 2;
  const c0 = source.indexOf('export function createRecord(');
  if (m0 < 0 || m1 <= m0 || c0 < 0) throw Error('record.js source boundaries moved');
  vm.runInContext(source.slice(m0, m1) + '\n' + source.slice(c0).replace('export function ', 'function ')
    + '\ncreateRecord({ canvas });', context);
  return { state, context, api: win.__record, win };
}

function captureController(source) {
  const root = source.indexOf('  async function startRealtime() {');
  const a = source.indexOf('      finished = await new Promise((resolve) => {', root);
  const b = source.indexOf('\n    } catch {', a);
  if (root < 0 || a < root || b <= a) throw Error('Playback capture-controller boundaries moved');
  return source.slice(a, b);
}

async function captureCase(recordSource, controller, options = {}) {
  const h = recorderHarness(recordSource, options), { state, context, api } = h;
  const pb = { T: 0, playing: false };
  let actionDone = false, finished = null, error = null;
  Object.assign(context, {
    rec: api, pb, card: {}, rtCancel: null, RT_CAP_SEC: 75, RT_START_SEC: 10,
    P: { bar: { style: {} }, ptext: { textContent: '' } },
    document: { hidden: false,
      addEventListener: (name, fn) => state.listeners.set(name, fn),
      removeEventListener: (name, fn) => { if (state.listeners.get(name) === fn) state.listeners.delete(name); },
    },
    effWindow: () => ({ tIn: 0, tOut: 2.5 }),
    setPlaying: on => { pb.playing = on; state.playCalls.push({ on, at: state.now, T: pb.T }); },
    renderAtT: T => {
      pb.T = T; state.draws.push({ T, at: state.now });
      state.instances.at(-1)?.frame(T);
    },
    requestAnimationFrame: fn => { state.raf.push(fn); return state.raf.length; },
    setInterval: (fn, ms) => { const id = ++state.nextId; state.intervals.set(id, { fn, ms, at: state.now + ms }); return id; },
    clearInterval: id => state.intervals.delete(id),
  });
  if (options.legacy) delete api.started;
  if (options.readyThrows) api.started = () => { throw Error('unreadable readiness'); };
  const pending = vm.runInContext(`(async () => {
    let finished = false, startFailed = false;
    ${controller}
    return { finished, startFailed };
  })()`, context);
  pending.then(value => { finished = value; }, cause => { error = cause; });
  await flush();
  for (let i = 0; i < 4000 && finished === null && !error; i++) {
    state.now += 20;
    if (!actionDone && options.action && state.now >= options.actionAt) {
      actionDone = true;
      if (options.action === 'cancel') context.rtCancel?.();
      if (options.action === 'hide') {
        context.document.hidden = true; state.listeners.get('visibilitychange')?.();
      }
      if (options.action === 'close') context.card = null;
      if (options.action === 'external-stop') api.stop(false);
    }
    if (pb.playing) {
      pb.T = Math.min(2.5, pb.T + 0.02);
      state.draws.push({ T: pb.T, at: state.now });
      state.instances.at(-1)?.frame(pb.T);
      if (pb.T >= 2.5) pb.playing = false;
    }
    for (const timer of [...state.intervals.values()]) {
      if (state.now >= timer.at) { timer.at += timer.ms; timer.fn(); }
    }
    if (!options.rafStall) { // rafStall: a visible-but-throttled page — rAF never runs, timers do
      const callbacks = state.raf.splice(0);
      for (const fn of callbacks) fn(state.now);
    }
    await flush();
  }
  await flush();
  return { ...h, pb, finished, error, actionDone };
}

export async function runPlaybackRecorderStartupArm(options = {}) {
  const record = fs.readFileSync(options.recordSource ?? DEFAULT_RECORD, 'utf8');
  const playback = fs.readFileSync(options.playbackSource ?? DEFAULT_PLAYBACK, 'utf8');
  const controller = captureController(playback), checks = [];
  const check = (name, pass) => {
    checks.push({ name, pass: !!pass });
    if (!pass) console.error('PLAYBACK-RECORDER-STARTUP RED:', name);
  };
  {
    const { api, state } = recorderHarness(record);
    check('additive native-start readiness exists', typeof api.started === 'function');
    check('initial readiness is false', api.started?.() === false);
    check('synchronous start contract retained', api.start(false) === true && api.recording() === true);
    check('accepted start is not a native start', api.started?.() === false);
    state.instances[0].frame(0);
    check('native first frame arms readiness', api.started?.() === true);
    api.pause(); check('pause retains established readiness', api.started?.() === true);
    api.resume(); check('resume retains established readiness', api.started?.() === true);
    api.stop(false); check('stop immediately retires readiness', api.started?.() === false);
    await flush();
    check('native blob handoff retained', api.lastSize() > 0);
    check('second start remains synchronous', api.start(false) === true);
    state.instances[0].onstart?.call(state.instances[0], { type: 'start' });
    check('old start event cannot arm a new recorder', api.started?.() === false);
    state.instances[1].state = 'inactive';
    state.instances[1].onstart?.call(state.instances[1], { type: 'start' });
    check('inactive start event cannot arm readiness', api.started?.() === false);
    api.stop(false); await flush();
    check('inactive-stop cleanup still reaches idle', api.recording() === false
      && state.streams.every(s => s.getTracks().every(t => t.readyState === 'ended')));
  }
  {
    const { api, state } = recorderHarness(record);
    api.start(false); state.instances[0].frame(0);
    check('a started recorder reports started()', api.started?.() === true);
    state.instances[0].state = 'inactive'; // the encoder died after starting
    check('a recorder that died after starting no longer reports started()', api.started?.() === false);
    api.stop(false); await flush();
  }
  {
    const { api, state } = recorderHarness(record);
    api.start(false); const A = state.instances[0];
    A.frame(0);
    api.stop(false); // A's finalize is still pending
    api.start(false); // B: no frame yet
    A.ondataavailable?.call(A, { data: new Blob(['late-chunk-from-A']) });
    check("a superseded recorder's late chunk cannot arm the next recorder", api.started?.() === false);
    await flush(); api.stop(false); await flush();
  }
  {
    const { api, state } = recorderHarness(record, { startThrows: true });
    check('native start failure preserves false return', api.start(false) === false);
    check('native start failure stays idle and unready', api.recording() === false && api.started?.() === false);
    check('native start failure releases tracks', state.streams.every(s => s.getTracks().every(t => t.readyState === 'ended')));
  }
  for (const readyAt of [0, 40, 3000, 9000]) {
    const h = await captureCase(record, controller, { readyAt });
    const first = h.state.instances[0], prefix = `first frame at${readyAt}ms`;
    check(prefix + ': native controller completes', !h.error && h.finished?.finished === true
      && h.finished.startFailed === false);
    check(prefix + ': initial pose is supplied before play', h.state.draws.length > 0
      && h.state.draws[0].T === 0
      && h.state.draws.filter(f => f.at < readyAt).every(f => f.T === 0));
    const play = h.state.playCalls.find(c => c.on);
    check(prefix + ': playback waits for native readiness', first.began
      && !!play && play.at >= first.startedAt);
    check(prefix + ': full trim survives startup', h.pb.T === 2.5
      && h.state.stops[0]?.at >= readyAt + 2500 && h.api.lastSize() > 0);
    check(prefix + ': no leaked lifecycle owners', h.api.recording() === false
      && h.context.rtCancel === null && !h.state.intervals.size && !h.state.listeners.size);
  }
  for (const item of [
    { name: 'cancel during startup', action: 'cancel', actionAt: 200, readyAt: 4000, finished: false },
    { name: 'cancel during capture', action: 'cancel', actionAt: 4400, readyAt: 4000, finished: false },
    { name: 'hidden during startup', action: 'hide', actionAt: 200, readyAt: 4000, finished: true },
    { name: 'card disappears during startup', action: 'close', actionAt: 200, readyAt: 4000, finished: false },
    { name: 'external stop during startup', action: 'external-stop', actionAt: 200, readyAt: 4000, finished: false, startFailed: true },
  ]) {
    const h = await captureCase(record, controller, item);
    check(item.name + ': settles promptly', !h.error && h.finished?.finished === item.finished
      && h.state.now <= item.actionAt + 20
      && (item.startFailed === undefined || h.finished.startFailed === item.startFailed));
    check(item.name + ': no leaked recorder or owners', h.api.recording() === false
      && h.context.rtCancel === null && !h.state.intervals.size && !h.state.listeners.size);
    if (item.actionAt < item.readyAt) check(item.name + ': no premature playback', !h.state.playCalls.some(c => c.on));
  }
  {
    const h = await captureCase(record, controller, { readyAt: Infinity });
    check('no first frame: the startup bound fails the run honestly at ~10 s (never the 75 s cap)', !h.error
      && h.finished?.finished === false && h.finished.startFailed === true
      && h.state.now > 10000 && h.state.now <= 10100);
    check('no first frame: clip never advances or claims data', h.pb.T === 0 && h.api.lastSize() === 0
      && !h.state.playCalls.some((c) => c.on));
    check('no first frame: recorder, interval and listener released', !h.api.recording()
      && h.context.rtCancel === null && !h.state.intervals.size && !h.state.listeners.size);
  }
  {
    const h = await captureCase(record, controller, { readyAt: 0, noStartEvent: true });
    const first = h.state.instances[0];
    const play = h.state.playCalls.find((c) => c.on);
    check('no start event: the first encoded chunk arms readiness and the capture completes', !h.error
      && h.finished?.finished === true && h.finished.startFailed === false && h.pb.T === 2.5 && h.api.lastSize() > 0);
    check('no start event: playback waits for the first chunk', first.firstDataAt !== undefined
      && !!play && play.at >= first.firstDataAt);
  }
  {
    const h = await captureCase(record, controller, { readyAt: Infinity, dieAt: 500 });
    check('recorder dies before its first frame: honest startFailed within the startup bound', !h.error
      && h.state.instances[0].died === true && h.finished?.finished === false
      && h.finished.startFailed === true && h.state.now > 10000 && h.state.now <= 10100);
    check('recorder dies before its first frame: no play, no data, lifecycle released',
      !h.state.playCalls.some((c) => c.on) && h.api.lastSize() === 0 && !h.api.recording()
      && h.context.rtCancel === null && !h.state.intervals.size && !h.state.listeners.size);
  }
  {
    const h = await captureCase(record, controller, { readyAt: Infinity, rafStall: true });
    check('rAF stalled during startup: the wall dog alone fails the run at the startup bound', !h.error
      && h.finished?.finished === false && h.finished.startFailed === true
      && h.state.now > 10000 && h.state.now <= 11040);
    check('rAF stalled during startup: lifecycle released', !h.api.recording()
      && h.context.rtCancel === null && !h.state.intervals.size && !h.state.listeners.size);
  }
  {
    const h = await captureCase(record, controller, { startThrows: true });
    check('constructor/start refusal: original failure result', !h.error && h.finished?.finished === false && h.finished.startFailed);
    check('constructor/start refusal: no play or lifecycle allocation', !h.state.playCalls.some(c => c.on)
      && !h.state.intervals.size && !h.state.listeners.size && !h.api.recording());
  }
  {
    const h = await captureCase(record, controller, { readyThrows: true });
    check('unreadable readiness: honest bounded startup failure', !h.error
      && h.finished?.finished === false && h.finished.startFailed && h.state.now <= 20);
    check('unreadable readiness: cleanup preserved', !h.api.recording()
      && h.context.rtCancel === null && !h.state.intervals.size && !h.state.listeners.size);
  }
  {
    const h = await captureCase(record, controller, { legacy: true });
    check('stale recorder without new seam: compatible capture', !h.error
      && h.finished?.finished === true && h.api.lastSize() > 0 && h.pb.T === 2.5);
    check('stale recorder without new seam: cleanup preserved', !h.api.recording()
      && h.context.rtCancel === null && !h.state.intervals.size && !h.state.listeners.size);
  }
  // ---- plants: each must fail exactly the case it targets ----
  const plantCase = async (label, rec, ctl, opts, holds) => {
    const swapped = rec !== record || ctl !== controller;
    let caught = false, detail = '';
    if (!swapped) detail = 'the plant anchor did not apply';
    else {
      const h = await captureCase(rec, ctl, opts);
      caught = !holds(h);
      detail = JSON.stringify({ finished: h.finished, now: h.state.now, T: h.pb.T, size: h.api.lastSize() });
    }
    check(`PLANT ${label}: caught`, caught);
    if (!caught) console.error(`PLAYBACK-RECORDER-STARTUP PLANT NOT CAUGHT: ${label} ${detail}`);
  };
  const swap = (src, a, b) => (src.split(a).length === 2 ? src.replace(a, b) : src);
  const fullTrim = (h) => !h.error && h.finished?.finished === true && h.pb.T === 2.5 && h.api.lastSize() > 0
    && h.state.stops[0]?.at >= 3000 + 2500;
  await plantCase('the pre-fix controller (no startup gate) loses the trim to a 3 s first frame', record,
    swap(controller, 'let playbackStarted = false;', 'let playbackStarted = true; setPlaying(true);'),
    { readyAt: 3000 }, fullTrim);
  await plantCase('the gate without its startup bound holds a dead recorder to the cap', record,
    swap(swap(controller, '} else if (!playbackStarted && sec > RT_START_SEC) {', '} else if (false) {'),
      'if ((performance.now() - rtT0) / 1000 > RT_START_SEC) {', 'if (false) {'),
    { readyAt: Infinity, dieAt: 500 },
    (h) => h.finished?.finished === false && h.finished.startFailed === true && h.state.now <= 11040);
  await plantCase('a record.js without the chunk fallback never starts on an engine without a start event',
    swap(record, "instead of never\n        if (rec === r && r.state !== 'inactive') recordingStarted = true;", 'instead of never'),
    controller, { readyAt: 0, noStartEvent: true }, fullTrimNoDelay);
  function fullTrimNoDelay(h) {
    return !h.error && h.finished?.finished === true && h.pb.T === 2.5 && h.api.lastSize() > 0;
  }
  const red = checks.filter(c => !c.pass).length;
  console.log(`PLAYBACK-RECORDER-STARTUP: ${checks.length - red} OK / ${red} RED (native seam/controller; delayed frames, no start event, a dead recorder, cancel, stale events, the startup bound in the tick and the wall dog; 3 plants)`);
  if (red) {
    const message = `Playback recorder startup: ${red} failed checks`;
    if (typeof options.fail === 'function') options.fail(message);
    else throw Error(message);
  }
  return checks;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const option = flag => { const i = process.argv.indexOf(flag); return i < 0 ? undefined : process.argv[i + 1]; };
  await runPlaybackRecorderStartupArm({ recordSource: option('--record-source'), playbackSource: option('--playback-source') });
}
