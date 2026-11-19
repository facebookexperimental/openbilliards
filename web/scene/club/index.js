// Copyright (c) Meta Platforms, Inc. and affiliates.

// index.js — entry of the opt-in `club` look ("Club room"). Reached ONLY through the one guarded dynamic import in
// web/app/main.js when the boot look is `club`; nothing else in the app imports this directory (CONTRACT.md section 1, the leaf
// rule). The look is the `tournament` grade plus the services built here: a real room that is seen and reflected, a reflection
// service, an occlusion-and-shadow service, a post chain, and run-time adoption of the existing table, ball and cue materials.
//
// Degrade law: every module below this one is loaded by its own guarded dynamic import and built inside a try block. A module
// that fails to load, a create*() that throws, or one that does not finish inside its time budget leaves a stub with
// `enabled: false`; the frame stays the `tournament` frame for that part and the next service is built. A service that
// finishes after its budget is adopted late. Importing this module does nothing: all work starts in installClub().
//
// Lifecycle (CONTRACT.md sections 2 and 8.1). "Build hidden, then show" is the only path:
//   curtain the screen keeps the last `tournament` frame from before the first service is built until the complete look has
//           been drawn. The curtain is the app composer's own `renderToScreen` switch (the one the app's offline accumulator
//           uses): while it is up every frame is still rendered in full, into the composer's buffers, and nothing reaches the
//           canvas. So the app's loop, its frame census, its warm ticks and its environment bakes run exactly as they do
//           without the look, a service may change the scene in its create*() without a half-built frame being seen, and the
//           programs and textures of the finished look are compiled and uploaded before the first frame that shows it.
//           It goes up after one `tournament` frame has been delivered (so there is a picture to keep). Two bounds, one per
//           phase. The BUILD (from the raise to the end of the show pass, first capture included) has `curtainMaxMs`: a
//           build that outlasts it is shown as far as it is built and says so in state() (`life.curtain.capped`, an entry
//           in `errors`). After the show pass the look is complete, and the SETTLE can only end in a complete frame: it
//           ends after `settleFrames` hidden frames ('settled'); or at the first frame after `settleMaxMs` once one hidden
//           frame was drawn ('slow': a renderer whose frames are that long has compiled everything in that one frame); or
//           when no frame comes for `settleMs` ('timer': a hidden tab, or a renderer whose frames are further apart than
//           two such intervals: the software host of the lane ends here, with one hidden frame). While the curtain is up and the show pass has not
//           run, an environment re-bake a service asks of the app directly (`ctx.rebakeEnv`) is held: the show pass makes
//           the one capture of the finished look (`life.curtain.bakesHeld`).
//   build   tier -> assets + adopt -> the services in SERVICES order (each: import, create, bounded by serviceTimeoutMs).
//           The frame hook is attached first, so a create*() that waits for a frame tick is served.
//   show    a bounded wait (revealWaitMs) for what is known to be asynchronous (assets requested so far, every `ready`
//           promise a service exposes: svc.ready, room.lightmap.ready, occ.table.ready, occ.floor.ready), then ONE
//           synchronous pass that calls the optional `show()` and then the optional `settle()` of every service in order
//           (settle = take the finished state now: no fade-in after the drop), then the first environment capture (made at
//           once, in the same task), then `club.shown = true`. `club.ready` and `club.whenShown` follow when the curtain
//           is down: from then on the canvas shows the look.
//   late    what arrives after the show (a service past its budget, textures past the reveal wait, a light map, props)
//           comes in as one step each, followed by one environment capture; nothing is hidden and shown again.
//   refresh app events that change the table, the fixture, the brightness or the look are coalesced (refreshDelayMs) into one
//           pass: the optional `rebuild(reason)` of every enabled service in order, then one `env.capture(reason)`. The pass
//           waits while the table is PENDING and is parked while a studio window is open (`window.__cinelight === true`);
//           the close (`ob:cinelight`) runs it once. A camera move is not a reason: no pose change captures anything.
//   release textures of the app that the look no longer shows are freed on the GPU (tiers.js `releaseHidden`): the maps of
//           the app room's walls, floor and overlays (hidden by the club room), and maps a part swapped out of an adopted
//           material. The scene's bound textures are noted before the build and before every refresh pass; after each
//           service is built, in the show pass and after every refresh pass, a noted texture that a material still in the
//           scene no longer binds, or that only hidden objects of the app room bind, is disposed (`life.released`). Only the GPU copy goes: the texture object and its image stay, so
//           three uploads it again if it is ever drawn (a table change, a part that restores a map). Nothing of the look
//           itself is touched, and with the look off this module never runs.
//   notes   `state().notes`: what a reader of a frame record must not miss, in plain words (the baked room light refused or
//           absent, a capped curtain, a service that is off, files that fell back, anchors missed). Empty = nothing to say.
//   tier    fixed for the page load (geometry, materials and render targets are built for it). `club.setTier()` reports that:
//           it returns false for any other tier and state().tierChange says how a tier is changed (a reload).
//   state   `club.state()` (also `window.__club.state()`) is a plain object with everything a tool needs.
// Tool knobs on the boot URL: ?clubtier=lite|base|high (tiers.js; today also the opt-in to `high`, which the picker never
// chooses), ?clubknobs=name:value,... (single knobs of the picked tier, for on / off pairs: tiers.js knobsFor),
// ?clubtimeout=<ms> (the per-service budget; the curtain's bounds follow it), ?cluboff=<service,service> (do not build the
// named services), ?clubprobe=<frames> (sample the luminance of the first delivered frames: `club.probe`, below),
// ?clubcurtain=0 (no curtain: the build is seen as it happens). The services have their own: ?clubenv= (env/config.js),
// ?clubpost= (post.js), ?cluboccoff= (occlusion.js), ?clubmotion= and ?clubaudio= (tiers.js motionFor / audioFor).
//
// Round 4 (CONTRACT.md section 12): two more services, built last, both optional (a module that is not in the tree is
// reported as "not present", not as an error): `motion` (motion.js: chalk dust and cloth marks, drawn from the shot record
// and the playback clock; ONE 'frame' and ONE 'stateChange' listener on the app's state machine for all its parts) and
// `audio` (audio.js: the room's sound; its own listeners). Nothing of either exists unless this module was imported, that
// is unless the boot look is `club` (the identity arms pin the guard in main.js and the request log of a look-off boot).
//
// Round A1 (CONTRACT.md section 13): venues. The hand-over names the venue (`ctx.venue`: 'club' | 'arena'; anything else is
// 'club'). `club.venue` and `club.venueKnobs` (the frozen row of tiers.js VENUES) are set before the first service is built.
// Under `arena` the room service is built from ./arena/room.js instead of ./room.js (the one row of SERVICES that differs);
// a missing or failing arena room is a stub like any other failed service: the app's room stays and the rest is built.
// Under `club` nothing here takes another path: the service list is the SERVICES array itself.
import { pickTierInfo, knobsFor, TIERS, TIER_IDS, extraSceneRenders, VENUES, venueFor, venueTierKnobs } from './tiers.js';

// [service key, module, factory] in build order (CONTRACT.md section 2)
const SERVICES = [
  ['room', './room.js', 'createRoom'],
  ['env', './env.js', 'createEnv'],
  ['occ', './occlusion.js', 'createOcclusion'],
  ['post', './post.js', 'createPost'],
  ['mat', './mat/index.js', 'createMaterials'],
  // round 4 (CONTRACT.md section 12): motion before audio, so the audio service finds `club.motion` built
  ['motion', './motion.js', 'createMotion'],
  ['audio', './audio.js', 'createAudio'],
];
// Every dynamic import of this module has a LITERAL specifier (the repo's served-strings gate reads them: an import of a
// variable cannot be checked). One loader per module this file may load; a module name without a row here is refused.
const LOADERS = Object.freeze({
  './assets.js': () => import('./assets.js'),
  './adopt.js': () => import('./adopt.js'),
  './room.js': () => import('./room.js'),
  './arena/room.js': () => import('./arena/room.js'),
  './env.js': () => import('./env.js'),
  './occlusion.js': () => import('./occlusion.js'),
  './post.js': () => import('./post.js'),
  './mat/index.js': () => import('./mat/index.js'),
  './motion.js': () => import('./motion.js'),
  './audio.js': () => import('./audio.js'),
});
// services the look is whole without: a missing module is "not present", not an error (the message of a failed module
// fetch differs by engine; node says ERR_MODULE_NOT_FOUND)
const OPTIONAL = new Set(['motion', 'audio']);
const NOT_THERE = /failed to fetch|cannot find module|err_module_not_found|importing a module script failed|error loading dynamically imported module/i;
const loadModule = (file) => (Object.prototype.hasOwnProperty.call(LOADERS, file) ? LOADERS[file]() : Promise.reject(new Error(`club/index.js has no loader for ${file}`)));

/**
 * Time budgets of the lifecycle, in milliseconds (installClub's second argument overrides them: dev pages, node arms).
 * While the curtain is up the canvas is a still picture, so the waits under it are bounded: revealWaitMs (what is still
 * downloading after the build shows on its stand-in and swaps when it lands), curtainMaxMs (the cap on the build: from the
 * raise to the end of the show pass; most of it is program compilation and texture upload, which no timer can interrupt, so
 * the cap is what a slow compiler needs, not what a fast one takes; it stands CAP_OVER_BUDGET_MS over the per-service budget),
 * and the settle's three (settleFrames hidden frames;
 * settleMaxMs for a renderer whose frames are long; settleMs without a frame for a page that delivers none).
 */
export const LIFECYCLE = Object.freeze({
  serviceTimeoutMs: 12000, revealWaitMs: 2000, refreshDelayMs: 250, tableWaitMs: 500, tableWaitTries: 40,
  firstFrameWaitMs: 10000, curtainMaxMs: 15000, settleFrames: 3, settleMs: 600, settleMaxMs: 4000,
});
// the build cap stands this far over the per-service budget: one service may use its whole budget (it is then left as a stub
// and adopted late) and the others still build and show behind the curtain, so the look that appears is whole
const CAP_OVER_BUDGET_MS = 3000;

// ob:settings keys that change what the services baked or captured -> the reason handed to rebuild() / capture()
const SETTINGS_REASONS = Object.freeze({
  equipment: 'table', game: 'table', clothColor: 'cloth', fixture: 'fixture', fixtureAuto: 'fixture', brightness: 'brightness', look: 'look',
});
// reasons that only need a new environment capture (nothing a service baked went stale)
const CAPTURE_ONLY = new Set(['install', 'assets']);
const APP_EVENTS = ['ob:settings', 'ob:relight', 'ob:table-state', 'ob:cinelight'];
// the luminance probe: sample points as fractions of the drawing buffer (centre first), and what counts as a black frame
const PROBE_POINTS = Object.freeze([[0.5, 0.5], [0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75], [0.5, 0.2], [0.5, 0.8], [0.1, 0.5], [0.9, 0.5]]);
const PROBE_BLACK = 2;      // every sample at or under this 8-bit luminance = a black frame
const PROBE_MAX_FRAMES = 600;

/**
 * The rebuild reason an app event carries, or null when the event changes nothing the look baked. Pure.
 * `ob:settings` -> by key (SETTINGS_REASONS); `ob:relight` (the lighting leaf applied a rig) -> 'light'; `ob:table-state` ->
 * 'table' once the table is READY (PENDING and refusals rebuild nothing); `ob:cinelight` carries no reason (it parks / unparks).
 */
export function reasonForEvent(type, detail) {
  if (type === 'ob:settings') {
    const key = detail?.key;
    return typeof key === 'string' && Object.prototype.hasOwnProperty.call(SETTINGS_REASONS, key) ? SETTINGS_REASONS[key] : null;
  }
  if (type === 'ob:relight') return 'light';
  if (type === 'ob:table-state') return detail?.status === 'READY' ? 'table' : null;
  return null;
}

const stub = (reason) => ({ enabled: false, reason });
const thenable = (x) => !!x && typeof x.then === 'function';
const text = (e) => String(e?.message ?? e);

// stand-ins when assets.js / adopt.js cannot be loaded: every consumer call stays legal and reports nothing done
const assetsStub = (reason) => ({
  enabled: false, reason, base: null,
  texture: (_id, o) => o?.fallback ?? null, bytes: async () => null, ready: async () => undefined,
  state: () => ({ requested: 0, loaded: 0, fallback: 0, bytes: 0, failed: [`assets: ${reason}`] }),
});
const adoptStub = (reason) => ({
  enabled: false, reason,
  classify() {}, find: () => [], patch: () => false, patchClass: () => 0,
  state: () => ({ patched: 0, compiled: 0, anchorsHit: 0, anchorsMissed: [], keys: [] }),
});

/**
 * Install the club look. `ctx` = { renderer, scene, camera, composer, room, table, gi, machine, game, rebakeEnv, query } from
 * main.js (every member is feature-detected by its consumers). Resolves to the club object; never rejects.
 * `opts` (dev pages and node arms only; main.js passes none): { services, load, window, serviceTimeoutMs, revealWaitMs,
 * refreshDelayMs, tableWaitMs, tableWaitTries, firstFrameWaitMs, curtainMaxMs, settleFrames, settleMs, settleMaxMs } — `services` replaces
 * SERVICES, `load(file)` replaces the table of literal loaders (LOADERS).
 */
export async function installClub(ctx, opts = {}) {
  const cfg = { ...LIFECYCLE };
  for (const k of Object.keys(LIFECYCLE)) if (Number.isFinite(opts?.[k]) && opts[k] >= 0) cfg[k] = opts[k];
  // ?clubtimeout=<ms> (1 000 .. 120 000): the per-service budget, for capture tools on a slow renderer (a software GL host
  // compiles the post chain for longer than the default budget; a service that misses it is only adopted late). The curtain's
  // cap, the wait for the first frame and the settle timer follow it, so a slow tool boot is not shown half built either.
  let probeAsked = 0;
  try {
    const asked = Number(ctx?.query?.get?.('clubtimeout'));
    if (Number.isFinite(asked) && asked >= 1000) {
      cfg.serviceTimeoutMs = Math.min(asked, 120000);
      cfg.curtainMaxMs = Math.max(cfg.curtainMaxMs, cfg.serviceTimeoutMs + CAP_OVER_BUDGET_MS); cfg.firstFrameWaitMs = Math.max(cfg.firstFrameWaitMs, cfg.serviceTimeoutMs);
      cfg.settleMs = Math.max(cfg.settleMs, Math.min(cfg.serviceTimeoutMs, 60000)); // a slow renderer still gets its hidden settle frames
      cfg.settleMaxMs = Math.max(cfg.settleMaxMs, 3 * cfg.settleMs);
    }
    const frames = Number(ctx?.query?.get?.('clubprobe'));
    if (Number.isFinite(frames) && frames >= 1) probeAsked = Math.min(Math.floor(frames), PROBE_MAX_FRAMES);
  } catch { /* unreadable query: the default budget, no probe */ }
  // the venue (CONTRACT.md 13.3): from the hand-over; a dev page or a node arm may name it in `opts.venue`
  let venue = 'club';
  try { venue = venueFor(ctx?.venue ?? opts?.venue); } catch { venue = 'club'; }
  const venueKnobs = VENUES[venue];
  const listed = Array.isArray(opts?.services) ? opts.services : SERVICES;
  // the room of the venue: the row that names the club room's module is built from the venue's module instead
  const services = venue === 'club' ? listed : listed.map((row) => (row?.[0] === 'room' && row[1] === VENUES.club.room ? ['room', venueKnobs.room, row[2]] : row));
  const load = typeof opts?.load === 'function' ? opts.load : loadModule;
  const win = opts?.window ?? (typeof window !== 'undefined' ? window : null);
  const now = () => { try { return performance.now(); } catch { return Date.now(); } };
  const delay = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
  const t0 = now();
  const since = () => Math.round(now() - t0);

  const frameFns = [];
  const errors = [];
  const note = (where, e) => { if (errors.length < 64) errors.push(`${where}: ${text(e)}`); };
  // per-service build record: { ms, late, timedOut } (state() merges it with the live enabled / reason)
  const built = {};
  const life = {
    events: {}, refreshes: 0, lastRefresh: null, captures: 0, lastCapture: null, parked: 0, tableWaits: 0,
    frames: 0, frameErrors: 0, shows: 0, settles: 0, installMs: null, shownAtMs: null, readyAtMs: null, revealWaited: null,
    eventLog: [], // the first app events seen: [type, key or status, ms since the install began, 'build' | 'shown']
    // the curtain: state 'none' (no composer to hold: dev pages, node arms) | 'waiting' (for the first tournament frame) |
    // 'up' | 'down'; framesBefore = frames delivered to the screen before it went up; hidden = frames rendered behind it;
    // settled = hidden frames after the show pass; why = what brought it down ('settled' | 'slow' | 'timer' | 'cap' |
    // 'failed'); builtAtMs / showDoneAtMs = the services were built / the show pass with its capture ended (ms since the
    // install began); bakesHeld = re-bakes asked of the app during the hidden build and left to the show pass's capture;
    // under = what the renderer did behind it (programs linked, textures and geometries created: renderer.info at the
    // raise against the drop), the size of the work a first show costs on any renderer
    curtain: { state: 'none', off: false, firstFrame: null, framesBefore: 0, hidden: 0, settled: 0, upAtMs: null, builtAtMs: null, showDoneAtMs: null, downAtMs: null, why: null, capped: false, bakesHeld: 0, under: null },
    // textures of the app the look no longer shows, freed on the GPU (see `release` in the header): passes run, textures and
    // bytes freed (RGBA8-equivalent with mips, the ledger's rule), the first rows, and what was skipped and why
    released: { on: false, passes: 0, noted: 0, textures: 0, bytes: 0, list: [], skipped: 0, error: null },
    tierAsked: [],
    tierPick: null, // { tier, why, forced, gpu, knobsChanged }: how the tier was picked (tiers.js pickTierInfo) and ?clubknobs=
  };
  const pending = new Set(); // reasons waiting for the next refresh pass
  let timer = null, tableTries = 0, resolveShown = () => {};

  // ---- the curtain ---------------------------------------------------------------------------------------------------------
  const composer = ctx?.composer ?? null;
  // ?clubcurtain=0 (tools only): build in plain sight, to see or to probe what the curtain hides
  let curtainOff = false;
  try { curtainOff = ctx?.query?.get?.('clubcurtain') === '0'; } catch { curtainOff = false; }
  const canHold = !curtainOff && !!composer && typeof composer.render === 'function' && typeof composer.renderToScreen === 'boolean';
  const curtain = life.curtain;
  curtain.off = curtainOff;
  let curtainPrev = true, capClock = null, settleClock = null, settleLeft = -1, settleFrom = 0, framesSinceArm = 0, resolveDown = () => {};
  let bakeGate = false; // true from the raise to the show pass's capture: a direct re-bake request is held (rebakeGated)
  const whenDown = new Promise((resolve) => { resolveDown = resolve; });
  // what the renderer holds (feature-detected: renderer.info of three). The programs are remembered by id at the raise, so
  // the drop can count the ones linked behind the curtain (a re-keyed material links a new program and frees the old one).
  let idsAtUp = null, infoAtUp = null;
  const rendererInfo = () => {
    try {
      const info = ctx?.renderer?.info;
      if (!info) return null;
      return { programs: Array.isArray(info.programs) ? info.programs.length : null, textures: info.memory?.textures ?? null, geometries: info.memory?.geometries ?? null };
    } catch { return null; }
  };
  const programIds = () => { try { const list = ctx?.renderer?.info?.programs; return Array.isArray(list) ? new Set(list.map((p) => p?.id)) : null; } catch { return null; } };
  function raise() {
    if (!canHold || curtain.state === 'up' || curtain.state === 'down') return;
    try {
      curtainPrev = composer.renderToScreen;
      composer.renderToScreen = false;
      curtain.state = 'up'; curtain.upAtMs = since(); curtain.framesBefore = life.frames;
      bakeGate = true;
      infoAtUp = rendererInfo(); idsAtUp = programIds();
      capClock = setTimeout(() => { curtain.capped = true; note('curtain', `the build outlasted ${cfg.curtainMaxMs} ms before its show pass ended; the look is shown as far as it is built`); drop('cap'); }, cfg.curtainMaxMs);
    } catch (e) { curtain.state = 'none'; bakeGate = false; note('curtain', e); }
  }
  function drop(why) {
    bakeGate = false;
    if (curtain.state !== 'up') { resolveDown(); return; }
    clearTimeout(capClock); clearTimeout(settleClock);
    // put the switch back only if it still stands as this module left it (another holder's value is not overwritten)
    try { if (composer.renderToScreen === false) composer.renderToScreen = curtainPrev; } catch (e) { note('curtain', e); }
    curtain.state = 'down'; curtain.why = why; curtain.downAtMs = since();
    try {
      const at = rendererInfo(), ids = programIds();
      if (at && infoAtUp) {
        let linked = null;
        if (ids && idsAtUp) { linked = 0; for (const id of ids) if (!idsAtUp.has(id)) linked += 1; }
        curtain.under = { programsAtUp: infoAtUp.programs, programsAtDown: at.programs, programsLinked: linked, texturesAtUp: infoAtUp.textures, texturesAtDown: at.textures, geometriesAtUp: infoAtUp.geometries, geometriesAtDown: at.geometries };
      }
    } catch (e) { note('curtain', e); }
    idsAtUp = null;
    resolveDown();
  }
  // the settle's idle timer: no frame for settleMs ends it. A timer that fires right after a long frame (the frame outlasted
  // it) is not idleness: it waits one more interval for the next frame.
  function armSettle() {
    clearTimeout(settleClock);
    framesSinceArm = 0;
    settleClock = setTimeout(() => { if (framesSinceArm > 0 && curtain.state === 'up') armSettle(); else drop('timer'); }, cfg.settleMs);
  }
  // An environment re-bake a service asks of the app directly (`club.ctx.rebakeEnv`) while the look is being built behind
  // the curtain is held: the cube would be baked from a half-built room, a frame nobody sees, and the show pass makes the
  // capture of the finished look anyway. Outside that window the request goes straight through.
  const rebakeGated = function clubRebakeEnv(...args) {
    if (bakeGate) { curtain.bakesHeld += 1; return undefined; }
    return ctx.rebakeEnv(...args);
  };
  // What the services get as `club.ctx`: the hand-over object itself behind one shadowed member. Every other read falls
  // through to main.js's object (so a member the app replaces later is seen), and nothing is written on it.
  let serviceCtx = ctx;
  try {
    if (ctx && typeof ctx === 'object' && typeof ctx.rebakeEnv === 'function' && canHold) {
      serviceCtx = Object.create(ctx, { rebakeEnv: { value: rebakeGated, enumerable: true } });
    }
  } catch { serviceCtx = ctx; }

  // ---- the luminance probe (tools only: a read-back per frame while it runs, nothing when it is off) ------------------------
  // For each of the next n frames the composer draws: whether it reached the screen, the phase of the lifecycle, and the 8-bit
  // luminance at PROBE_POINTS read from the canvas right after the draw. `black` counts frames that reached the screen with
  // every sample at or under PROBE_BLACK. A frame behind the curtain is listed with `held: true` and no samples.
  const probe = { on: false, left: 0, frames: [], black: 0, blackShown: 0, onScreen: 0, held: 0, error: null };
  let probeWrapper = null, probePlain = null, probeHadOwn = false;
  function probeStop() {
    probe.on = false; probe.left = 0;
    try {
      if (probeWrapper && composer.render === probeWrapper) { if (probeHadOwn) composer.render = probePlain; else delete composer.render; }
    } catch (e) { probe.error = text(e); }
    probeWrapper = null;
  }
  function probeSample() {
    const renderer = ctx?.renderer, gl = renderer?.getContext?.();
    if (!gl) return null;
    if (renderer.getRenderTarget?.() !== null) renderer.setRenderTarget(null);
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, px = new Uint8Array(4), lum = [];
    for (const [fx, fy] of PROBE_POINTS) {
      gl.readPixels(Math.min(w - 1, Math.floor(fx * w)), Math.min(h - 1, Math.floor((1 - fy) * h)), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      lum.push(Math.round(0.2126 * px[0] + 0.7152 * px[1] + 0.0722 * px[2]));
    }
    return lum;
  }
  function probeStart(n) {
    if (!composer || typeof composer.render !== 'function') { probe.error = 'no composer to probe'; return false; }
    const count = Math.min(PROBE_MAX_FRAMES, Math.max(1, Math.floor(Number(n) || 0)));
    probe.left = count; probe.error = null;
    if (probe.on) return true;
    probe.on = true;
    probeHadOwn = Object.prototype.hasOwnProperty.call(composer, 'render');
    probePlain = composer.render;
    const plain = probePlain;
    probeWrapper = function clubProbeRender(...args) {
      const toScreen = this.renderToScreen !== false;
      const out = plain.apply(this, args);
      if (!probe.on) return out;
      try {
        const rec = { n: probe.frames.length, ms: since(), frame: life.frames, phase: club.ready ? 'ready' : club.shown ? 'shown' : 'build', held: !toScreen };
        if (toScreen) {
          rec.lum = probeSample();
          probe.onScreen += 1;
          if (rec.lum && rec.lum.every((v) => v <= PROBE_BLACK)) { rec.black = true; probe.black += 1; if (club.shown) probe.blackShown += 1; }
        } else probe.held += 1;
        if (probe.frames.length < PROBE_MAX_FRAMES) probe.frames.push(rec);
        probe.left -= 1;
        if (probe.left <= 0) probeStop();
      } catch (e) { probe.error = text(e); probeStop(); }
      return out;
    };
    composer.render = probeWrapper;
    return true;
  }

  // ---- textures the look no longer shows (tiers.js `releaseHidden`) -----------------------------------------------------------
  // `noted`: every texture a scene material bound at a note point (before the build, before every refresh pass) -> whether
  // an object that was SHOWN bound it then. These are the app's own long-lived maps; the map holds them only until they are
  // released. What is released at a pass (after each service is built, in the show pass, after every refresh pass), and
  // nothing else:
  //   unbound  a noted texture that no scene material binds any more while a material that bound it is still in the scene
  //            (a part swapped it out of an adopted material). A texture whose objects left the scene is not touched;
  //   hidden   a noted texture that was drawn at the note and is now bound only by hidden objects that ALL sit inside the
  //            app room's group (`ctx.room.group`): the walls, floor and overlays the club room replaces. A texture whose
  //            hidden binder is anywhere else (the cue between shots, an aim overlay, a pocketed ball) is the app's own
  //            business and is left alone.
  // Only the GPU copy is freed (`texture.dispose()`): three uploads the image again if the object is ever drawn. A texture
  // without an image that can be uploaded again (a render target, a video, a cube) is never touched. Never throws.
  const notedTextures = new Map();
  const texturesOfMaterial = (m, visit) => {
    if (!m || typeof m !== 'object') return;
    for (const k in m) { const v = m[k]; if (v && v.isTexture === true) visit(v); }
    const u = m.uniforms;
    if (u && typeof u === 'object') for (const k in u) { const v = u[k]?.value; if (v && v.isTexture === true) visit(v); }
  };
  const shownInScene = (o) => { for (let p = o; p; p = p.parent) if (p.visible === false) return false; return true; };
  const appRoomGroup = () => { const g = ctx?.room?.group; return g && g.isObject3D === true ? g : null; };
  // texture -> { shown: an object that is shown binds it, outside: a HIDDEN object outside the app room's group binds it,
  // mats: the materials that bind it }; `materials` (a property of the map): every material in the scene
  const boundNow = () => {
    const scene = ctx?.scene;
    if (!scene || typeof scene.traverse !== 'function') return null;
    const map = new Map();
    map.materials = new Set();
    const roomGroup = appRoomGroup();
    const inRoom = (o) => { if (!roomGroup) return false; for (let p = o; p; p = p.parent) if (p === roomGroup) return true; return false; };
    scene.traverse((o) => {
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : null;
      if (!mats) return;
      const vis = shownInScene(o);
      const out = !vis && !inRoom(o);
      for (const m of mats) {
        map.materials.add(m);
        texturesOfMaterial(m, (t) => {
          const e = map.get(t);
          if (!e) map.set(t, { shown: vis, outside: out, mats: [m] }); else { if (vis) e.shown = true; if (out) e.outside = true; if (!e.mats.includes(m)) e.mats.push(m); }
        });
      }
    });
    for (const t of [scene.environment, scene.background]) if (t && t.isTexture === true) map.set(t, { shown: true, outside: false, mats: [] });
    return map;
  };
  function noteBound() {
    if (!life.released.on) return;
    try {
      const map = boundNow();
      if (map) for (const [t, e] of map) {
        const old = notedTextures.get(t);
        // (the materials are held weakly: a table build the app's cache evicted shares maps with materials that are still
        // drawn, and a strong list here kept every such build's disposed materials for the life of the page)
        const mats = old?.mats ?? new WeakSet();
        for (const m of e.mats) mats.add(m);
        notedTextures.set(t, { shown: e.shown || old?.shown === true, mats });
      }
      life.released.noted = notedTextures.size;
    } catch (e) { life.released.error = text(e); }
  }
  const releasable = (t) => {
    if (t.isRenderTargetTexture === true || t.isVideoTexture === true || t.isDepthTexture === true || t.isCubeTexture === true) return false;
    const im = t.image;
    if (!im || typeof im !== 'object') return false;
    if (im.data !== undefined) return !!im.data && im.width > 0 && im.height > 0; // a data texture whose bytes are still there
    return (im.naturalWidth || im.width || 0) > 0 && (im.naturalHeight || im.height || 0) > 0; // an image, canvas or bitmap that can be uploaded again
  };
  function releaseHidden(why) {
    const rel = life.released;
    if (!rel.on || !notedTextures.size) return;
    try {
      const map = boundNow();
      if (!map) return;
      rel.passes += 1;
      for (const [t, noted] of [...notedTextures]) {
        const now = map.get(t); // undefined = bound by nothing
        let was = null;
        if (!now) { if ([...map.materials].some((m) => noted.mats.has(m))) was = 'unbound'; else { notedTextures.delete(t); continue; } } // gone with its objects: no longer tracked (nothing is held alive)
        else if (!now.shown && !now.outside && noted.shown) was = 'hidden';
        if (!was) continue; // still drawn, or hidden by the app itself: stays noted
        notedTextures.delete(t); // one release per texture; if it is drawn again it is uploaded again and noted anew at the next pass
        if (!releasable(t)) { rel.skipped += 1; continue; }
        const im = t.image, w = im.naturalWidth || im.width || 0, h = im.naturalHeight || im.height || 0;
        const bytes = Math.round(w * h * 4 * (t.generateMipmaps !== false ? 4 / 3 : 1));
        t.dispose();
        rel.textures += 1; rel.bytes += bytes;
        if (rel.list.length < 48) rel.list.push({ name: t.name || null, w, h, bytes, was, at: why });
      }
      rel.noted = notedTextures.size;
    } catch (e) { rel.error = text(e); note('release', e); }
  }

  // ---- notes: what a reader of state() or of a frame record must not miss ---------------------------------------------------------
  function notes() {
    const out = [];
    const add = (s) => { if (out.length < 24) out.push(s); };
    try {
      const lm = club.room?.enabled === true ? club.room.lightmap?.state?.() : null;
      if (lm && lm.on !== true) add(`room light: the baked light map is NOT in use (${lm.reason ?? 'no reason given'}); the room is lit by the analytic fallback`);
      else if (lm && Array.isArray(lm.stale) && lm.stale.length) add(`room light: the baked light map is in use but stale: ${lm.stale.join('; ')}`);
      if (lm && lm.on === true && lm.volume === false) add('room light: the baked light map is in use without its light volume (furniture reads the analytic light)');
    } catch (e) { add(`room light: state unreadable (${text(e)})`); }
    for (const [key] of services) {
      const s = club[key];
      if (s?.enabled !== true) add(`${key}: off (${s?.reason ?? 'no reason given'})`);
    }
    // round A2 (CONTRACT.md 14.2): the tool switch `?clubcloth=app` (the arena venue only; the cloth part sets the member
    // only then): whoever reads a frame record must see that the bed in it is the app's own cloth, not the look's
    try { if (club.mat?.parts?.cloth?.appCloth === true) add('cloth: the app\'s own cloth is shown, not the look\'s (?clubcloth=app, a tool switch of the arena venue)'); } catch { /* no material parts */ }
    if (curtain.capped) add('curtain: the build outlasted its cap; the look was shown as far as it was built');
    try {
      const a = club.assets?.state?.();
      if (a?.fallback > 0) add(`assets: ${a.fallback} of ${a.requested} files fell back to stand-ins (${(a.failed ?? []).slice(0, 4).join('; ')})`);
    } catch { /* no asset state */ }
    try {
      const missed = club.adopt?.state?.()?.anchorsMissed?.length ?? 0;
      if (missed > 0) add(`adopt: ${missed} patch anchors missed (those patches are skipped whole)`);
    } catch { /* no adopt state */ }
    if (life.released.error) add(`release: ${life.released.error}`);
    // round 4: what the motion and audio services say about themselves (a part switched off after a throw, a refused write)
    for (const key of ['motion', 'audio']) {
      try { for (const s of club[key]?.state?.()?.notes ?? []) add(`${key}: ${s}`); } catch (e) { add(`${key}: state unreadable (${text(e)})`); }
    }
    return out;
  }

  const club = {
    enabled: true,
    tier: 'base',
    knobs: TIERS.base,
    venue, venueKnobs, // 'club' | 'arena' and the frozen row of tiers.js VENUES (CONTRACT.md 13.3)
    ctx: serviceCtx,
    time: { value: 0 },
    assets: null, adopt: null,
    room: stub('not built'), env: stub('not built'), occ: stub('not built'), post: stub('not built'), mat: stub('not built'),
    motion: stub('not built'), audio: stub('not built'),
    onFrame(fn) { if (typeof fn === 'function' && !frameFns.includes(fn)) frameFns.push(fn); return () => club.offFrame(fn); },
    offFrame(fn) { const i = frameFns.indexOf(fn); if (i >= 0) frameFns.splice(i, 1); },
    ready: false,
    // additive (round 1): the reveal and the refresh pass
    shown: false,
    whenShown: null, // Promise<void>, resolved when the curtain is down (the canvas shows the look)
    refresh(reason) { refresh(typeof reason === 'string' && reason ? reason : 'manual'); },
    /**
     * The tier is fixed for the page load: geometry, materials and render targets are built for it. Returns true only for the
     * tier in force; any other request is recorded (state().tierChange.asked) and changes nothing. A tier is changed by a
     * reload (the picker in tiers.js, or ?clubtier= for tools).
     */
    setTier(tier) {
      if (tier === club.tier) return true;
      if (life.tierAsked.length < 8) life.tierAsked.push(String(tier));
      return false;
    },
    /** Tools: sample the luminance of the next n frames the composer draws (see the probe above); stop() ends it early. */
    probe: { start: (n = 60) => probeStart(n), stop: () => probeStop(), state: () => ({ ...probe, frames: probe.frames.map((f) => ({ ...f })) }) },
    state() {
      const svc = {};
      for (const [key] of services) {
        const s = club[key];
        let own = null;
        try { own = key === 'post' ? null : (s?.state?.() ?? s?.counts?.() ?? null); } catch (e) { own = { error: text(e) }; }
        svc[key] = { enabled: s?.enabled === true, reason: s?.reason ?? null, ...(built[key] ?? {}), ...(own ? { state: own } : {}) };
      }
      const safe = (fn) => { try { return fn() ?? null; } catch (e) { return { error: text(e) }; } };
      return {
        ready: club.ready, shown: club.shown, enabled: club.enabled, tier: club.tier, knobs: { ...club.knobs },
        venue: club.venue, venueKnobs: { ...club.venueKnobs, grade: { ...club.venueKnobs.grade } },
        // what the tier costs per frame beyond the one scene render every look makes (tiers.js extraSceneRenders)
        cost: { extraSceneRenders: extraSceneRenders(club.knobs, club.venueKnobs) },
        tierChange: { supported: false, how: 'reload (the tier is picked at install; ?clubtier=lite|base|high forces one)', tiers: [...TIER_IDS], asked: life.tierAsked.slice() },
        services: svc, errors: errors.slice(),
        // plain-word warnings for whoever reads this object or a frame record (empty when there is nothing to say)
        notes: safe(() => notes()) ?? [],
        adopt: safe(() => club.adopt?.state?.()), assets: safe(() => club.assets?.state?.()),
        post: safe(() => club.post?.counts?.()),
        life: { ...life, events: { ...life.events }, eventLog: life.eventLog.map((x) => x.slice()), curtain: { ...curtain, under: curtain.under ? { ...curtain.under } : null }, released: { ...life.released, list: life.released.list.map((x) => ({ ...x })) }, tierAsked: life.tierAsked.slice(), tierPick: life.tierPick ? { ...life.tierPick, knobsChanged: life.tierPick.knobsChanged.slice() } : null, pending: [...pending], studio: studio(), tablePending: tablePending(), frameHooks: frameFns.length, budget: { ...cfg } },
        probe: probe.frames.length || probe.on || probe.error ? { on: probe.on, left: probe.left, onScreen: probe.onScreen, held: probe.held, black: probe.black, blackShown: probe.blackShown, error: probe.error, frames: probe.frames.map((f) => ({ ...f })) } : null,
      };
    },
  };
  club.whenShown = new Promise((resolve) => { resolveShown = resolve; });
  // published before the build so a tool can read state() of an install that is still running (`ready` stays false until the end)
  try { if (win) win.__club = club; } catch { /* a sealed window stand-in: tools read the returned object */ }

  const studio = () => { try { return win?.__cinelight === true; } catch { return false; } };
  const tablePending = () => { try { return ctx?.table?.status?.()?.status === 'PENDING'; } catch { return false; } };
  // call an optional method of an enabled service; a throw or a rejection is recorded and never travels
  const call = (key, method, ...args) => {
    const s = club[key];
    if (s?.enabled !== true || typeof s[method] !== 'function') return false;
    try { const r = s[method](...args); if (thenable(r)) r.then(undefined, (e) => note(`${key}.${method}`, e)); } catch (e) { note(`${key}.${method}`, e); }
    return true;
  };
  // one environment capture: the reflection service owns it when it is enabled; without it, a capture the club look itself
  // caused (install, late assets or a late service) falls back to the app's own re-bake, and app events are left to the app.
  // `atOnce` (the show pass): the service bakes in this task, so the first frame of the look already reflects the room.
  const capture = (why, own, atOnce = false) => {
    life.captures += 1; life.lastCapture = why;
    if (atOnce ? call('env', 'capture', why, { now: true }) : call('env', 'capture', why)) return;
    if (own && club.room?.enabled === true) { try { ctx?.rebakeEnv?.(); } catch (e) { note('rebakeEnv', e); } }
  };
  const arm = (ms) => { if (timer !== null) clearTimeout(timer); timer = setTimeout(() => flush(), ms); };
  function flush(atOnce = false) {
    if (timer !== null) { clearTimeout(timer); timer = null; }
    if (!pending.size || !club.shown) return; // before the show pass the reasons wait; the show pass ends with a flush
    if (studio()) { life.parked += 1; return; } // parked: the ob:cinelight close arms the pass again
    if (tablePending() && tableTries < cfg.tableWaitTries) { tableTries += 1; life.tableWaits += 1; arm(cfg.tableWaitMs); return; }
    tableTries = 0;
    const reasons = [...pending]; pending.clear();
    const why = reasons.join('+');
    life.refreshes += 1; life.lastRefresh = why;
    const own = reasons.some((r) => CAPTURE_ONLY.has(r) || r.startsWith('late:'));
    noteBound(); // what the app binds now (a new table brings new maps), before the parts swap theirs in
    if (reasons.some((r) => !CAPTURE_ONLY.has(r))) for (const [key] of services) call(key, 'rebuild', why);
    releaseHidden(why);
    capture(why, own, atOnce);
  }
  function refresh(reason) { pending.add(reason); arm(cfg.refreshDelayMs); }

  // app events -> reasons (capture phase, as the app's own idle gate listens: a handler that stops the event cannot hide it)
  const onAppEvent = (e) => {
    try {
      const type = e?.type;
      life.events[type] = (life.events[type] ?? 0) + 1;
      if (life.eventLog.length < 16) life.eventLog.push([type, e?.detail?.key ?? e?.detail?.status ?? null, since(), club.shown ? 'shown' : 'build']);
      if (type === 'ob:cinelight') { if (!studio() && pending.size) arm(cfg.refreshDelayMs); return; }
      const reason = reasonForEvent(type, e?.detail);
      if (reason) refresh(reason);
    } catch (err) { note('event', err); }
  };

  // build one service inside its budget; the loser of the race is adopted late if it ever arrives
  async function build(key, file, factory) {
    const tb = now();
    built[key] = { ms: null, late: false, timedOut: false };
    let settled = false, clock = null;
    const work = (async () => {
      const mod = typeof file === 'function' ? await file() : await load(file);
      const make = mod?.[factory];
      if (typeof make !== 'function') return stub(`${typeof file === 'string' ? file : key} has no ${factory}`);
      const svc = await make(club);
      return svc && typeof svc === 'object' ? svc : stub(`${factory} returned nothing`);
    })();
    const budget = new Promise((resolve) => { clock = setTimeout(() => resolve(null), cfg.serviceTimeoutMs); });
    try {
      const svc = await Promise.race([work, budget]);
      if (svc) { settled = true; club[key] = svc; built[key].ms = Math.round(now() - tb); return; }
      built[key].timedOut = true;
      club[key] = stub(`not ready after ${cfg.serviceTimeoutMs} ms (adopted late if it arrives)`);
      note(key, `not ready after ${cfg.serviceTimeoutMs} ms`);
      console.warn(`[club] ${key} did not finish inside ${cfg.serviceTimeoutMs} ms — the others go on without it`);
      work.then((late) => {
        if (settled) return;
        settled = true; club[key] = late; built[key].late = true; built[key].ms = Math.round(now() - tb);
        // a late service comes in as one step: it arrives fully built, shows, and one refresh pass follows
        if (club.shown) { call(key, 'show'); refresh(`late:${key}`); }
      }, (e) => { settled = true; club[key] = stub(text(e)); note(key, e); });
    } catch (e) {
      settled = true;
      built[key].ms = Math.round(now() - tb);
      // an optional service whose module is not in the tree (round 4: the audio and motion services are optional): it is
      // reported as not present, without an error line of the look
      if (OPTIONAL.has(key) && NOT_THERE.test(`${text(e)} ${String(e?.code ?? '')}`)) { club[key] = stub(`not present (${typeof file === 'string' ? file : key})`); built[key].present = false; return; }
      club[key] = stub(text(e));
      note(key, e);
      console.warn(`[club] ${key} is unavailable — that part stays on the tournament look:`, e);
    } finally { clearTimeout(clock); }
  }

  try {
    const picked = pickTierInfo({ renderer: ctx?.renderer, query: ctx?.query });
    const tuned = knobsFor(picked.tier, ctx?.query); // ?clubknobs= (tools): single knobs of the picked tier
    club.tier = picked.tier;
    // (round A2: a venue's own per-id texture caps for this tier are laid over the tier's; the club row has none, and the
    // function then hands back the very object it was given)
    club.knobs = venueTierKnobs(tuned.knobs, picked.tier, venueKnobs);
    life.tierPick = { tier: picked.tier, why: picked.why, forced: picked.forced, gpu: picked.facts?.gpu ?? null, knobsChanged: tuned.changed };
    life.released.on = club.knobs.releaseHidden === true;
    // one frame hook for the whole look: the app emits 'frame' once per delivered frame, before its composer renders.
    // Attached before the services are built, and never lets a throw reach the app's loop.
    let resolveFirstFrame = () => {};
    const firstFrame = new Promise((resolve) => { resolveFirstFrame = resolve; });
    try {
      ctx?.machine?.on?.('frame', (clock, dt) => {
        club.time.value = clock; life.frames += 1;
        if (life.frames === 1) resolveFirstFrame();
        if (curtain.state === 'up') {
          // this frame is drawn right after the hook: behind the curtain, or as the first frame of the look
          framesSinceArm += 1;
          if (settleLeft === 0) drop('settled');
          else if (settleLeft > 0 && curtain.settled >= 1 && now() - settleFrom > cfg.settleMaxMs) drop('slow');
          else { curtain.hidden += 1; if (settleLeft > 0) { settleLeft -= 1; curtain.settled += 1; } }
        }
        for (const fn of [...frameFns]) {
          try { fn(clock, dt); } catch (e) { club.offFrame(fn); life.frameErrors += 1; note('frame', e); console.warn('[club] a frame hook threw and was removed:', e); }
        }
      });
    } catch (e) { note('frame hook', e); }
    try { for (const type of APP_EVENTS) win?.addEventListener?.(type, onAppEvent, { capture: true, passive: true }); } catch (e) { note('events', e); }
    if (probeAsked) probeStart(probeAsked);

    // ?cluboff=post,occ (tools only): the named services are not built, so a broken frame can be traced to one service
    let off = new Set();
    try { off = new Set(String(ctx?.query?.get?.('cluboff') ?? '').split(',').map((k) => k.trim()).filter(Boolean)); } catch { /* unreadable query: build all */ }

    const [assetsMod, adoptMod] = await Promise.all(['./assets.js', './adopt.js'].map((f) => Promise.resolve().then(() => load(f)).catch((e) => { note(f, e); return null; })));

    // The curtain goes up after one tournament frame was delivered, so the canvas holds a picture to keep (raised before any
    // frame, it would leave an empty canvas behind the boot overlay). The macrotask after the hook lets that frame's draw
    // finish. The wait is long on purpose: a visible page delivers its first frame as soon as the app can draw one, and a
    // hidden page shows nothing either way. The service modules are fetched meanwhile (an import does nothing by contract),
    // so the curtain is up for the build only, not for the downloads.
    if (canHold) {
      const warm = [];
      for (const [key, file] of services) if (typeof file === 'string' && !off.has(key)) warm.push(Promise.resolve().then(() => load(file)).catch(() => null));
      curtain.state = 'waiting';
      if (life.frames === 0 && typeof ctx?.machine?.on === 'function') {
        let waitClock = null;
        curtain.firstFrame = await Promise.race([firstFrame.then(() => 'seen'), new Promise((resolve) => { waitClock = setTimeout(() => resolve('timeout'), cfg.firstFrameWaitMs); })]);
        clearTimeout(waitClock);
      } else curtain.firstFrame = life.frames > 0 ? 'seen' : 'none';
      if (curtain.firstFrame === 'seen') await delay(0);
      await Promise.race([Promise.all(warm), delay(Math.min(cfg.serviceTimeoutMs, 4000))]);
      raise();
    }

    noteBound(); // the app's textures as the tournament frame binds them, before any service changes the scene
    try { club.assets = typeof assetsMod?.createAssets === 'function' ? assetsMod.createAssets(club) : assetsStub('assets.js is unavailable'); } catch (e) { note('assets', e); club.assets = assetsStub(text(e)); }
    try { club.adopt = typeof adoptMod?.createAdopt === 'function' ? adoptMod.createAdopt(club) : adoptStub('adopt.js is unavailable'); } catch (e) { note('adopt', e); club.adopt = adoptStub(text(e)); }

    for (const [key, file, factory] of services) {
      if (off.has(key)) { club[key] = stub('off by ?cluboff'); built[key] = { ms: 0, late: false, timedOut: false, off: true }; continue; }
      await build(key, file, factory);
      // free what this service hid or swapped out right away, so the app room's maps are gone before the club room's are
      // uploaded by the next hidden frame (the peak under the curtain stays near the steady state)
      releaseHidden(`build:${key}`);
    }
    life.installMs = since();
    curtain.builtAtMs = life.installMs;

    // show: a bounded wait for what is known to be asynchronous, then one synchronous pass
    const waits = [];
    try { waits.push(club.assets?.ready?.()); } catch (e) { note('assets.ready', e); }
    waits.push(club.room?.lightmap?.ready, club.occ?.table?.ready, club.occ?.floor?.ready);
    for (const [key] of services) waits.push(club[key]?.ready);
    const all = Promise.allSettled(waits.filter(thenable)).then(() => 'settled');
    let waitClock = null;
    const cap = new Promise((resolve) => { waitClock = setTimeout(() => resolve('timeout'), cfg.revealWaitMs); });
    life.revealWaited = await Promise.race([all, cap]);
    clearTimeout(waitClock);
    for (const [key] of services) if (call(key, 'show')) life.shows += 1;
    // settle: behind the curtain a service takes its finished state at once, so nothing fades or eases in after the drop.
    // The hook is the optional `settle()` (the occlusion service has it since round 2: no fade, and never a bake in this
    // task). One service has it under another name and is bridged until it grows the hook: the post chain's `dof.snap()`
    // (the rest gates of the lens and the occlusion pass).
    for (const [key] of services) if (call(key, 'settle')) life.settles += 1;
    try {
      if (typeof club.post?.settle !== 'function' && club.post?.enabled === true && typeof club.post.dof?.snap === 'function') { club.post.dof.snap(); life.settles += 1; }
    } catch (e) { note('post.dof.snap', e); }
    club.shown = true;
    life.shownAtMs = since();
    releaseHidden('show'); // the app room is hidden and the parts have swapped their maps in: free what is no longer drawn
    bakeGate = false; // the look is whole: from here a re-bake is the real thing
    // First capture with the room in place, in this task. Reasons that arrived while the look was building (the lighting
    // leaf's rig at boot) join it: one rebuild pass and ONE capture, not a capture now and a second one after the delay.
    // A studio window parks it (the refresh pass runs it on the close); a table that is still PENDING makes the pass wait.
    if (studio() || pending.size) { pending.add('install'); flush(true); }
    else capture('install', true, true);
    if (pending.size && timer === null && !studio()) arm(cfg.refreshDelayMs);
    if (life.revealWaited === 'timeout') all.then(() => refresh('assets')); // what arrived after the cap is captured once
    // The build is over (its cap is cleared). The curtain comes down settleFrames hidden frames from here (the frame hook
    // counts them), at the first frame after settleMaxMs once one hidden frame was drawn, or when no frame comes for settleMs.
    curtain.showDoneAtMs = since();
    if (curtain.state === 'up') {
      clearTimeout(capClock);
      settleLeft = Math.max(0, Math.floor(cfg.settleFrames));
      settleFrom = now();
      armSettle();
      await whenDown;
    }
  } catch (e) {
    club.enabled = false;
    note('install', e);
    console.warn('[club] the club look failed to install — the tournament look stays:', e);
  }
  drop('failed'); // a no-op unless an error left the curtain up: the screen is never left held
  if (curtain.state === 'waiting') curtain.state = 'none';
  if (!club.assets) club.assets = assetsStub('install failed');
  if (!club.adopt) club.adopt = adoptStub('install failed');
  club.shown = true;
  life.readyAtMs = since();
  resolveShown();
  club.ready = true;
  return club;
}
