// Copyright (c) Meta Platforms, Inc. and affiliates.

// index.js — entry of the looks that live in this leaf: Tournament's hall (the `arena` venue) and the `club` look ("Club
// room"). Reached ONLY through the one guarded dynamic import in web/app/main.js, on a boot that main.js's boot rules gave one
// of them; nothing else in the app imports this directory (CONTRACT.md section 1, the leaf
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
// is unless the boot shows a look of this leaf (the identity arms pin the guard in main.js and the request log of a boot without one).
//
// Round A1 (CONTRACT.md section 13): venues. The hand-over names the venue (`ctx.venue`: 'club' | 'arena'; anything else is
// 'club'). `club.venue` and `club.venueKnobs` (the frozen row of tiers.js VENUES) are set before the first service is built.
// Under `arena` the room service is built from ./arena/room.js instead of ./room.js (the one row of SERVICES that differs);
// a missing or failing arena room is a stub like any other failed service: the app's room stays and the rest is built.
// Under `club` nothing here takes another path: the service list is the SERVICES array itself.
//
// The stage flow (CONTRACT.md section 21): when main.js hands `ctx.stage` (it made the dark stage at first paint), there is
// no curtain: the hall is built OFF STAGE while the game is live, shown in one swap at rest and revealed by main's one
// dissolve; a hall that cannot be had is never shown in part and main reveals the old room. See "the stage flow" below.
// Without `ctx.stage` every line of the lifecycle above is as it was.
import { pickTierInfo, knobsFor, motionFor, TIERS, TIER_IDS, extraSceneRenders, VENUES, venueFor, venueTierKnobs } from './tiers.js';

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
// The stage flow (CONTRACT.md section 21) asks for EVERY module the hall will load in one go, right after the entry module
// has arrived: the rows of LOADERS and, below, the modules those load by their own dynamic imports under the arena venue
// on a tier that takes the stage (the room's three parts, the hall's reflection, the three material parts, the two motion
// parts). An import does nothing by contract, so asking early changes nothing but the order of the requests: the leaf
// arrives as one burst instead of a chain of round trips, and no build waits for a module. Not used by the curtain flow.
const STAGE_MODULES = Object.freeze([
  () => import('./arena/floor.js'), () => import('./arena/rig.js'), () => import('./arena/surround.js'),
  () => import('./env/hallcube.js'),
  () => import('./mat/cloth.js'), () => import('./mat/wood.js'), () => import('./mat/pocket.js'),
]);
// ... and the two motion parts, each asked for only on a tier that builds it (tiers.js motionFor: the light hall builds
// no dust, so its burst asks for no dust module)
const STAGE_MOTION = Object.freeze({ dust: () => import('./motion/dust.js'), marks: () => import('./motion/marks.js') });
/** The modules the stage flow asks for in one burst on a tier whose motion parts are `parts` (tiers.js motionFor). Pure. */
export const stageBurst = (parts) => [...STAGE_MODULES, ...(parts?.dust ? [STAGE_MOTION.dust] : []), ...(parts?.marks ? [STAGE_MOTION.marks] : [])];
// The stage flow's protocol between main.js and this file (main.js `club.stage.protocol`). 2 = the hand-over may carry
// `tier: 'lite'` (THE LIGHT HALL: the boot rules' verdict that the standard hall is too slow for this device) and the
// pace facts name the tier that was built. Main does not install a leaf of another number on a stage boot, and this
// file does not serve a stage of another number: either way the failure is headed `mismatch`, a class main stores
// nothing for. A stage that names NO protocol is step 1's hand-over: it is served to the letter of step 1.
export const STAGE_PROTOCOL = 2;
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
  // the stage flow only (CONTRACT.md section 21): rest = this many frames with no shot in progress and the camera's pose
  // unchanged; the reveal waits for rest at most stageRestMaxMs and then goes on
  stageRestFrames: 2, stageRestMaxMs: 20000,
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

// ---- the pace facts of the stage flow (pure; the node arm plants intervals) ---------------------------------------------------
// Numbers only: the per-device decision and its storage are the boot's, not this module's. All from the intervals between
// delivered frames, the page visible: the frame's own time stamp where the page has one (createPace's `stamp`), else
// performance.now() in the look's one frame hook.
const PACE_CLUSTER_MIN = 5;      // the fewest intervals that make a period
const PACE_CLUSTER_SHARE = 0.1;  // ... and their least share of all intervals (not asked of a cluster under the commonest interval when every interval is between two frame time stamps: framePeriod's `exact`)
const PACE_CLUSTER_WIDTH = 1.15; // the intervals of one period stand inside 15 % of the shortest of them
const PACE_WHOLE = 0.08;         // the commonest interval is a whole multiple of a period when it lies within this share of 2, 3, ... times it
const PACE_OVER = 1.5;           // an interval longer than this many periods is a late frame
const r2 = (x) => (Number.isFinite(x) ? Math.round(x * 100) / 100 : null);
const sorted = (list) => list.filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
const quantile = (v, q) => (v.length ? v[Math.min(v.length - 1, Math.max(0, Math.ceil(q * v.length) - 1))] : null);
/**
 * The display's frame period as the page can know it: the SHORTEST STABLE interval OF WHICH THE COMMONEST INTERVAL IS A
 * WHOLE MULTIPLE. A cluster is the intervals inside 15 % of its shortest; it counts when it holds at least
 * PACE_CLUSTER_MIN intervals and a tenth of all. The commonest interval is the median of the cluster that holds the most
 * intervals (the shortest of equals). From the shortest cluster up, the first is taken that holds the commonest interval
 * itself, or of whose median the commonest lies within PACE_WHOLE of 2, 3, ... times; the answer is that cluster's median.
 * Why it is the display's: a display presents frames a whole number of its periods apart, so what a page mostly delivers
 * is a whole multiple of the period, and a renderer that keeps up at least a tenth of the time puts a cluster ON the
 * period. Why the test: without the frame's own time stamp an interval is the time between two runs of the frame hook,
 * and a hook that runs late inside its frame and on time in the next gives a long interval and then a short one (21.7 ms
 * and 11.6 ms on a 16.7 ms display). The short halves of such pairs form a cluster UNDER the period; it is not a whole
 * fraction of what the page mostly delivers, and the search goes on to the next cluster up. A real shorter period passes
 * the test (8.3 ms under a hall at 16.7 ms: 2.0): a hall that misses every other frame of a fast display is still read
 * against that display. A hidden or throttled page delivers no animation frame at all, and intervals that touch a hidden
 * moment are not taken (createPace).
 * `exact` (createPace hands true when EVERY counted interval lies between two frame time stamps): such an interval is a
 * whole number of display periods, so a cluster UNDER the commonest interval that passes the whole-multiple test is the
 * display's period at PACE_CLUSTER_MIN intervals, WITHOUT the tenth of all. The tenth was the hole: the hall's own 60 to
 * 120 intervals are among "all", so a hall at two periods was read against ITS OWN pace whenever the stage had kept the
 * true period for fewer frames than a tenth of everything (a stage of 60 intervals with 12 on a 16.7 ms period, then a
 * hall of 91 at 33.3 ms: 12 of 151), and those are the devices the verdict exists for: a renderer that is busy loading
 * keeps the period least. Without the stamps (`exact` false: the hook's own clock, or a mix) the tenth stays for every
 * cluster: there a short interval may be the early half of a late-and-early pair, and a handful of those at half a
 * period would condemn a hall in step.
 * THE LIMIT, either way: a period can only be FOUND. When fewer than PACE_CLUSTER_MIN intervals of the whole boot stand on
 * a whole fraction of the commonest interval, the answer is the commonest interval itself, which is then the hall's own
 * pace (a renderer that NEVER keeps up answers with its best pace). `share` and `frames` say how wide the answer stands;
 * createPace adds how many of the STAGE's intervals stand on it (`stage`, `witnessed`), and the reader of the facts
 * (main.js) does not take a period nobody but the hall has shown as proof that the device holds its display's pace.
 * `thin`: the answer's cluster stands UNDER the tenth of all (only `exact` took it, by the five-interval rule). The data
 * of a real shorter period kept for a handful of frames and of two things that are not one are the same there: a display
 * whose rate changed during the boot (five intervals at the old rate, everything after in step with the new one), and an
 * engine whose frame time stamp is not the display's tick (five early halves of late-and-early pairs between stamps). So
 * the reader does not condemn a device on ONE boot whose period is thin (main.js lookAfterPace).
 * -> { ms, frames, share, thin } (ms null: too few).
 */
export function framePeriod(intervals, exact = false) {
  const v = sorted(Array.isArray(intervals) ? intervals : []);
  const need = Math.max(PACE_CLUSTER_MIN, Math.ceil(v.length * PACE_CLUSTER_SHARE));
  const ends = []; // ends[i]: one past the last interval inside 15 % of v[i] (the cluster that starts at v[i])
  for (let i = 0, j = 0; i < v.length; i++) { if (j < i) j = i; while (j < v.length && v[j] <= v[i] * PACE_CLUSTER_WIDTH) j += 1; ends.push(j); }
  let top = -1; // the cluster that holds the most intervals (the shortest of equals): its median is the commonest interval
  for (let i = 0; i < v.length; i++) if (ends[i] - i >= need && (top < 0 || ends[i] - i > ends[top] - top)) top = i;
  if (top < 0) return { ms: null, frames: 0, share: 0, thin: false };
  const common = quantile(v.slice(top, ends[top]), 0.5);
  for (let i = 0; i < v.length; i++) {
    const j = ends[i];
    if (j - i < (exact === true && v[j - 1] < common ? PACE_CLUSTER_MIN : need)) continue; // (a cluster wholly under the commonest interval, between frame time stamps: no share of all is asked)
    const ms = quantile(v.slice(i, j), 0.5), k = Math.round(common / ms);
    if (!((common >= v[i] && common <= v[j - 1]) || (k >= 2 && Math.abs(common / ms - k) <= PACE_WHOLE * k))) continue; // not a whole fraction of what the page mostly delivers
    return { ms: r2(ms), frames: j - i, share: r2((j - i) / v.length), thin: j - i < need };
  }
  return { ms: null, frames: 0, share: 0, thin: false };
}
/** Count, median, 95th percentile and the share of intervals longer than PACE_OVER periods (null without a period). */
export function paceStats(intervals, periodMs) {
  const v = sorted(Array.isArray(intervals) ? intervals : []);
  const late = Number.isFinite(periodMs) && periodMs > 0 ? v.filter((x) => x > PACE_OVER * periodMs).length : null;
  return { frames: v.length, median: r2(quantile(v, 0.5)), p95: r2(quantile(v, 0.95)), over: late === null || !v.length ? null : r2(late / v.length) };
}
/**
 * The recorder behind the facts. tick() once per delivered frame; phase(name) as the install goes on: 'before' (the leaf's
 * hook is attached, its first build has not begun: only module fetches and their evaluation), 'loading' (the build off
 * stage: files decode, shaders compile), 'reveal' (the swap, the kept frame, the dissolve: not counted), 'wait' (the reveal
 * has ended; the hall's window opens hallDelayMs later). An interval counts when the page was visible at both of its ends
 * and was not hidden in between (hide(): a `visibilitychange` to hidden). The hall's window closes at hallFrames
 * intervals, or at hallMaxMs of counted time once hallMinFrames are in, or at hallEndMs of counted time, or hallHardMs
 * after it opened by the clock (a page that went away); tick() then returns the facts ONCE (null on every other call).
 * `stamp()` (optional): the time stamp of the frame being drawn, in ms (the page's `document.timeline.currentTime` inside
 * the app's frame event: the time the browser gives an animation frame, which moves in whole display periods however
 * late the hook runs inside its frame). Where it answers a finite number the intervals are taken from it, else from
 * `now()`; `period.clock` says which: 'frame' (every counted interval between two stamps), 'now' (none) or 'mixed'. A
 * second tick inside one frame (the stamp has not moved) is not a frame and is not counted. The one second before the
 * hall's window is always measured by `now()`.
 * `period.stage`: how many of the STAGE's own intervals (before the reveal) stand within 15 % of the period;
 * `period.witnessed`: at least PACE_CLUSTER_MIN of them do, so frames that were not the hall's have shown this period. A
 * period that is not witnessed is the hall's own pace and nothing more (framePeriod, THE LIMIT).
 * `period.thin`: framePeriod's own word (its cluster stands under the tenth of all intervals).
 * facts(): { period: { ms, frames, share, thin, clock, stage, witnessed, how }, hall: { frames, median, p95, over, complete, minFrames, closedBy } | null,
 * stage: { frames, median, p95, over, loading: true, before: { frames, median, p95, over } }, hidden }.
 * The stage's numbers are taken while the leaf loads: they are not a clean baseline (`loading: true` says so), and no
 * stage frame lies before the leaf's first work, because the hook exists only once the leaf's entry module has run:
 * `before` is the nearest thing.
 */
export function createPace({ now, visible, stamp, hallDelayMs = 1000, hallFrames = 120, hallMinFrames = 60, hallMaxMs = 3000, hallEndMs = 10000, hallHardMs = 11000 } = {}) {
  const clock = typeof now === 'function' ? now : () => Date.now();
  const seen = typeof visible === 'function' ? visible : () => true;
  const frameTime = () => { if (typeof stamp !== 'function') return null; try { const s = stamp(); return typeof s === 'number' && Number.isFinite(s) ? s : null; } catch { return null; } };
  const sets = { before: [], loading: [], hall: [] };
  let phase = 'before', last = null, lastSeen = false, wasHidden = false, hidden = 0, waitFrom = null, hallFrom = null, hallMs = 0, closedBy = null, told = false;
  let lastStamped = false, stamped = 0, clocked = 0; // the last tick read a stamp; counted intervals between two stamps, and the others
  function facts() {
    const stageAll = sets.before.concat(sets.loading);
    const exact = stamped > 0 && clocked === 0; // every counted interval lies between two frame time stamps
    const period = framePeriod(stageAll.concat(sets.hall), exact);
    const seen = period.ms === null ? 0 : stageAll.filter((x) => x >= period.ms / PACE_CLUSTER_WIDTH && x <= period.ms * PACE_CLUSTER_WIDTH).length;
    return {
      period: { ...period, clock: exact ? 'frame' : (stamped === 0 ? 'now' : 'mixed'), stage: seen, witnessed: seen >= PACE_CLUSTER_MIN,
        how: exact
          ? 'the shortest interval that at least 5 intervals stand with, inside 15 % (a tenth of all where it is the commonest interval itself), and of which the commonest interval is a whole multiple (median of that cluster)'
          : 'the shortest interval that at least 5 intervals and a tenth of all stand with, inside 15 %, and of which the commonest interval is a whole multiple (median of that cluster)' },
      hall: hallFrom === null ? null : { ...paceStats(sets.hall, period.ms), complete: sets.hall.length >= hallMinFrames, minFrames: hallMinFrames, delayMs: hallDelayMs, closedBy },
      stage: { ...paceStats(stageAll, period.ms), loading: true, before: paceStats(sets.before, period.ms) },
      hidden,
    };
  }
  return {
    hide() { wasHidden = true; },
    phase(name) { if (phase === 'done') return; phase = String(name); if (phase === 'wait') waitFrom = clock(); },
    tick() {
      const wall = clock(), s = frameTime(), t = s !== null ? s : wall, vis = seen() === true;
      if (s !== null && lastStamped && last !== null && t <= last) return null; // the stamp has not moved: a second call inside one frame
      const counts = last !== null && vis && lastSeen && !wasHidden;
      const dt = last === null ? null : t - last, both = s !== null && lastStamped;
      if (last !== null && !counts) hidden += 1;
      last = t; lastSeen = vis; wasHidden = false; lastStamped = s !== null;
      if (phase === 'wait' && wall - waitFrom >= hallDelayMs) { phase = 'hall'; hallFrom = t; return null; } // (the interval that ends here began before the window)
      if (phase === 'done' || !(phase in sets)) return null;
      if (counts) { sets[phase].push(dt); if (both) stamped += 1; else clocked += 1; if (phase === 'hall') hallMs += dt; }
      if (phase !== 'hall') return null;
      if (sets.hall.length >= hallFrames) closedBy = 'frames';
      else if (hallMs >= hallMaxMs && sets.hall.length >= hallMinFrames) closedBy = 'time';
      else if (hallMs >= hallEndMs) closedBy = 'slow';
      else if (t - hallFrom >= hallHardMs) closedBy = 'clock';
      if (closedBy === null || told) return null;
      phase = 'done'; told = true;
      return facts();
    },
    facts,
  };
}

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
  const loader = typeof opts?.load === 'function' ? opts.load : loadModule;
  // `asking`: the module requests this file has made that have neither arrived nor failed (every call of the loader, a
  // build's own module, the stage flow's burst). The stage flow reads it when a budget runs out (`stageAwaits` below);
  // nothing else does.
  let asking = 0;
  const asked = (p) => { if (thenable(p)) { asking += 1; const done = () => { asking -= 1; }; p.then(done, done); } return p; };
  const load = (file) => asked(loader(file));
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
    if (settledRule) curtain.quietAtDrop = unquiet(true) === null; // (the arena venue: see `unquiet` below)
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
    if (bakeGate || club.offStage === true) { curtain.bakesHeld += 1; return undefined; } // (`offStage`: the stage flow, where the swap makes the capture)
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

  // ---- the settled hall (the arena venue) ----------------------------------------------------------------------
  // What would still change the picture of the look if it were shown now, as a list of reasons, or null (never throws).
  // `cubeOnly`: the reasons that end by themselves within a few frames of the show pass: the reflection service's capture
  // and its walk of the app's cube (env.js), the app's own tail of bakes, the ambient values made when the cube has
  // arrived, and the bed following them (mat/cloth.js). Under the arena venue the curtain's settle frames do not count
  // while one of these stands (`settledRule`, the frame hook), bounded by settleMaxMs as before: the hall that is shown,
  // and the hall a tool then captures, is the SAME picture whatever the boot's timing was. The full list adds what the
  // stage flow waits for off stage and under its kept frame (files, the occlusion bake and its level, late room parts,
  // the floor shadow's hand-over, a pending refresh pass). Under the club venue `settledRule` is false: nothing asks.
  let settledRule = false;
  try { settledRule = venue === 'arena'; } catch { settledRule = false; }
  function unquiet(cubeOnly = false) {
    const why = [];
    try {
      const e = club.env?.enabled === true ? club.env.state?.() : null;
      if (e && (e.pending?.length > 0 || e.heldForTextures === true)) why.push('cube capture');
      if (e?.walk?.left > 0) why.push('cube walk');
      let tail = null;
      try { tail = win?.__rebakeEnv?.tail?.() ?? null; } catch { tail = null; }
      if (tail && Number(tail.left) > 0) why.push('cube tail');
      if (e?.ambient?.enabled === true && e.ambient.bakesAt !== e.bakesSeen) why.push('ambient values');
      if (club.mat?.parts?.cloth?.ambientSynced?.() === false) why.push('cloth ambient');
      if (cubeOnly) return why.length ? why : null;
      const a = club.assets?.state?.();
      if (a && (a.requested || 0) > (a.loaded || 0) + (a.fallback || 0)) why.push('files');
      const o = club.occ?.enabled === true ? club.occ.state?.() : null;
      if (o && !(o.errors?.length > 0)) {
        if (!(o.tableReady && o.floorReady) || o.baking) why.push('occlusion bake');
        else if (club.shown && o.fade < 1) { club.occ.settle?.(); why.push('occlusion level'); } // a bake that ended under the kept frame: its level now, no fade in view
      }
      const rs = club.room?.enabled === true ? club.room.state?.() : null;
      if (rs) {
        for (const k of ['rig', 'surround', 'floorPart']) if (rs[k]?.status === 'building' || rs[k]?.status === 'late') why.push(`room part ${k}`);
        if (rs.lightmap?.late === true && rs.lightmap.file?.status === 'loading') why.push('room light map');
        if (rs.shadowOwner === 'occ-pending' || (o?.floorReady === true && o.patched?.floor > 0 && !(o.errors?.length > 0) && rs.shadowOwner === 'room')) why.push('floor shadow');
      }
      if (pending.size > 0 || timer !== null) why.push('refresh pass');
    } catch (e) { note('settled', e); }
    return why.length ? why : null;
  }

  // ---- the stage flow (CONTRACT.md section 21) --------------------------------------------------------------------------------------
  // main.js made the DARK STAGE at first paint (the table lit and playable, the old room not seen) and says so by handing
  // `ctx.stage`: { reveal({ rest, swap, held }) -> Promise | false, failed(reason, rest), report(pace), over }. Absent = the
  // curtain flow, which no line of this section changes. With it there is no curtain and the install runs in another order:
  //   off stage  everything is built while the game is live on the stage, and NOTHING of it reaches a frame: the room hidden
  //              with its swap deferred (arena/room.js `stageShow`), the wraps and direct writes on the app's materials
  //              queued (adopt.js `defer`), the reflection service without its scene hooks and without a capture (env.js),
  //              the motion root hidden (`club.offStage`), the occlusion maps baked into their own targets. Then the files
  //              and bakes are waited for (the service budget), and the hall's programs are compiled and its textures
  //              uploaded ahead of the swap (stageWarm).
  //   rest       the reveal is asked of main, which waits for REST: no shot in progress (the state machine is not in
  //              SIMULATING / PLAYBACK / SETTLED), the camera's pose and the cue's pose unchanged for stageRestFrames
  //              frames, and the app's own boot tail of cube bakes over; at most stageRestMaxMs, then the reveal goes on.
  //   swap       ONE synchronous pass in the task of the last live stage frame, after that frame was drawn and kept: the
  //              room's swap, the queued wraps, the show pass with its rebuild and its one capture (stageSwap).
  //   kept       the kept frame stands over the live hall while the hall is not quiet (`unquiet`: the cube's walk above
  //              all, one bake per frame), at most settleMaxMs after the swap's END; the game is live under it and the
  //              picture stands still.
  //   dissolve   main dissolves the kept frame away; `club.ready` follows its END.
  //   failure    a hall that cannot be had (assets or adopt missing, a service off, failed or past its budget, a file
  //              that fell back, the baked light missing, a patch anchor missed, the files' wait run out, the leaf's own
  //              tier `lite`, main's bound) is never shown in part: the queue is dropped, what was built is disposed,
  //              and main is told ONCE (`failed(reason, rest)`): the old room comes back by the same dissolve.
  // `state().life.stage` (present only with a stage) carries the facts, times in ms since the install began.
  const STAGE_MOVING = new Set(['SIMULATING', 'PLAYBACK', 'SETTLED']);
  const stageCtx = (() => { try { const x = ctx?.stage; return x && typeof x === 'object' && typeof x.reveal === 'function' && typeof x.failed === 'function' ? x : null; } catch { return null; } })();
  const stage = {
    on: stageCtx !== null, phase: stageCtx ? 'off stage' : null, failed: null, builtAtMs: null, waited: null, warm: null, readyAtMs: null,
    rest: null, swapAtMs: null, swapMs: null, installed: null, keptFrames: 0, unquiet: null, quietAtReveal: null, linkedInSwap: null, linkedAfterSwap: null,
    dissolveAtMs: null, endAtMs: null, pace: null, rebakeWaitedMs: null,
  };
  if (stage.on) life.stage = stage;
  const stageOver = () => { try { return stageCtx?.over === true; } catch { return false; } };
  // rest: tracked in the frame hook (the pose as the frame's writers left it against the frame before), read by stageRest
  let restRun = 0, restSig = null, restFrom = null, swapClock = 0, idsAtSwap = null;
  // the renderer's programs that were not there at the swap's begin (null: no renderer to ask)
  const linkedSinceSwap = () => { const ids = programIds(); if (!ids || !idsAtSwap) return null; let n = 0; for (const id of ids) if (!idsAtSwap.has(id)) n += 1; return n; };
  let restCues = [], restCueAt = -1e9, restCueSig = new Float64Array(0);
  function stageTrack() {
    let still = true;
    try { if (STAGE_MOVING.has(ctx?.machine?.state)) still = false; } catch { /* no machine: the camera alone says */ }
    try {
      const a = ctx?.camera?.matrixWorld?.elements, b = ctx?.camera?.projectionMatrix?.elements;
      if (a && b) {
        let same = restSig !== null;
        if (!restSig) restSig = new Float64Array(32);
        for (let i = 0; i < 16; i++) { if (restSig[i] !== a[i] || restSig[16 + i] !== b[i]) same = false; restSig[i] = a[i]; restSig[16 + i] = b[i]; }
        if (!same) still = false;
      }
    } catch { /* an unreadable camera: the state machine alone says */ }
    // the cue (every scene object named obCueStick: the aim's rod, the post's and the strike's share the name, as the
    // occlusion service finds them): a stroke or an aim that turns moves one of them while the state machine still says
    // AIM. The list is taken again every 30 frames (a new list is a move); no cue = the two above say.
    try {
      if (life.frames - restCueAt > 30 || restCues.some((c) => !c.parent)) {
        restCueAt = life.frames;
        const found = [];
        ctx?.scene?.traverse?.((o) => { if (o.name === 'obCueStick') found.push(o); });
        if (found.length !== restCues.length || found.some((c, i) => c !== restCues[i])) { restCues = found; restCueSig = new Float64Array(8 * found.length).fill(NaN); }
      }
      for (let k = 0; k < restCues.length; k++) {
        const c = restCues[k], p = c.position, q = c.quaternion;
        const v = [p.x, p.y, p.z, q.x, q.y, q.z, q.w, c.visible === false ? 0 : 1];
        for (let i = 0; i < 8; i++) { if (restCueSig[8 * k + i] !== v[i]) still = false; restCueSig[8 * k + i] = v[i]; }
      }
    } catch { /* an unreadable cue: the two above say */ }
    restRun = still ? restRun + 1 : 0;
  }
  function stageRest() { // asked by main once per presented frame, after that frame was drawn
    const t = now();
    if (restFrom === null) restFrom = t;
    const waitedMs = Math.round(t - restFrom);
    // (while the app's own boot tail still walks its cube, a swap would ride that tail: eight kept frames instead of one.
    // The stage stays live until it has ended)
    let booting = false;
    try { booting = win?.__rebakeEnv?.tail?.()?.boot === 'running'; } catch { booting = false; }
    if (restRun >= cfg.stageRestFrames && !booting) { stage.rest = { why: 'rest', waitedMs }; return true; }
    if (waitedMs > cfg.stageRestMaxMs) { stage.rest = { why: 'bound', waitedMs }; return true; }
    return false;
  }
  // What the hall still awaits from the network, in a few words, or null: everything it HAS ASKED the network for on this
  // boot has arrived or failed. Counted: `asking` (the module requests of this file) and the asset loader's files, its
  // manifest included (assets.js `state().pending`). A file the hall has not asked for yet is NOT awaited: when every
  // request is back and the build has not got to its next one, the build is the slow part (a device that cannot build
  // the hall in time must be told so, or it would show the unfinished stage on every try). Not seen: a file whose bytes
  // are in while this thread has not yet been told; a request a service makes by itself, outside the loader and outside
  // the burst's list. A state that cannot be read counts as awaited: a guess never blames the device.
  // Main asks the same question when its own bound fires (`ctx.stage.pending`, set below).
  function stageAwaits() {
    try {
      if (asking > 0) return `module requests not in: ${asking}`;
      const a = club.assets?.state?.() ?? {};
      const n = Number.isFinite(a.pending) ? a.pending : (a.requested || 0) - (a.loaded || 0) - (a.fallback || 0);
      return n > 0 ? `files not in: ${n}` : null;
    } catch (e) { return `unreadable (${text(e)})`; }
  }
  if (stageCtx) { try { stageCtx.pending = stageAwaits; } catch { /* a sealed hand-over: main reads no answer as the network's side */ } }
  // The line main is told BEGINS WITH THE FAILURE'S CLASS, as main's boot rules read it (main.js `lookFailClass`): `import`
  // or `assets` = something of the hall did not arrive over the network (never a verdict on the device); `timeout` = a
  // budget ran out (a verdict only the second time); anything else = the build (the old room for this app version). The
  // class is read from the boot's facts, not from which line happened to come first: a module whose fetch failed (the
  // engines' own words, NOT_THERE, in the line or in an error line), a file request that failed (the asset loader's
  // list), a service past its budget (the build record). A line that already names a fetch is left as it is.
  // A BUDGET THAT RAN OUT IS `timeout` ONLY WHEN NOTHING WAS STILL AWAITED FROM THE NETWORK (`stageAwaits`): the build was
  // the slow part, which is the device's doing. While something is awaited the line is headed `assets`, also a line that
  // already says `timeout`: a slow link is not a slow device, and two `timeout` boots keep the old room for a whole version.
  function stageCause(reason) {
    const line = String(reason);
    if (/^(import|assets|late|mismatch)\b/.test(line)) return line;
    const says = /^timeout\b/.test(line);
    if (!says) {
      if (NOT_THERE.test(line) || /\.js is unavailable$/.test(line) || errors.some((e) => NOT_THERE.test(e))) return `import: ${line}`;
      try { if ((club.assets?.state?.()?.failed ?? []).some((f) => /request failed/.test(String(f)))) return `assets: ${line}`; } catch { /* no asset state: the line says */ }
      if (!Object.values(built).some((b) => b?.timedOut === true)) return line;
    }
    const awaits = stageAwaits();
    if (awaits) return `assets: ${awaits}; ${line.replace(/^timeout:?\s*/, '')}`;
    return says ? line : `timeout: ${line}`;
  }
  // the hall cannot be had: once, and never after the swap (from there the hall is on its way)
  function stageFail(reason, tell = true) {
    if (!stage.on || stage.failed !== null || stage.swapAtMs !== null) return;
    stage.failed = stageCause(reason); stage.phase = 'failed';
    note('stage', `the hall could not be had (${stage.failed}); the old room is shown`);
    club.enabled = false; // (`club.offStage` stays as it is, true once the build began: a service whose factory outlives its budget reads it live until it is disposed, and nothing of a failed hall may reach the scene)
    try { club.adopt?.drop?.(); } catch (e) { note('adopt.drop', e); }
    for (const [key] of [...services].reverse()) {
      try { const svc = club[key]; if (svc && typeof svc.dispose === 'function') svc.dispose(); } catch (e) { note(`${key}.dispose`, e); }
      club[key] = stub(`the stage failed (${stage.failed})`);
    }
    frameFns.length = 0;
    if (timer !== null) { clearTimeout(timer); timer = null; }
    pending.clear();
    try { for (const type of APP_EVENTS) win?.removeEventListener?.(type, onAppEvent, { capture: true }); } catch (e) { note('events', e); }
    if (tell) { try { stageCtx.failed(stage.failed, stageRest); } catch (e) { note('stage.failed', e); } }
    stageReport(pace.facts());
  }
  // the first thing that keeps the built hall from being THE hall, or null
  function stageBlocker() {
    if (errors.length) return errors[0];
    for (const [key] of services) { if (!OPTIONAL.has(key) && club[key]?.enabled !== true) return `${key}: ${club[key]?.reason ?? 'off'}`; }
    try { for (const [k, part] of Object.entries(club.mat?.parts ?? {})) if (part?.enabled !== true) return `mat.${k}: ${part?.reason ?? 'off'}`; } catch { /* no parts */ }
    for (const line of notes()) if (!/^(motion|audio): /.test(line)) return line;
    const a = club.assets?.state?.();
    if (a && (a.requested || 0) > (a.loaded || 0) + (a.fallback || 0)) return 'assets: files are still loading';
    const o = club.occ?.state?.();
    if (o && (o.errors?.length > 0 || !(o.tableReady && o.floorReady) || o.baking)) return `occ: ${o.errors?.[0] ?? 'the bake has not ended'}`;
    const rs = club.room?.state?.();
    if (rs) for (const k of ['rig', 'surround', 'floorPart']) if (rs[k] && rs[k].status !== 'built') return `room part ${k}: ${rs[k].status}${rs[k].error ? ` (${rs[k].error})` : ''}`;
    return null;
  }
  // A RE-BAKE IN FLIGHT at a stage check is waited for, not failed on. The occlusion service bakes again by itself when the
  // table or the lamps over it changed and held for a few frames (a rig the lighting leaf applies late, a fixture or a
  // table picked while the stage is live) and when the floor moved (occlusion.js `update`); such a bake ends by itself in
  // its slices. Read as a blocker ("the bake has not ended") it was a failure of class `build`: ONE such boot kept the old
  // room for the whole app version, with no way out for the player. So the check waits for it, inside one service budget
  // (main's bound stands over all), and a re-bake that outlasts the budget is a `timeout`: the device's doing only the
  // second time in a row, and the player can clear it. A first bake that never ended, a bake that failed and every other
  // line of stageBlocker stay what they were.
  const STAGE_REBAKE_POLL_MS = 20;
  const rebaking = () => { try { const o = club.occ?.state?.(); return !!o && !(o.errors?.length > 0) && o.tableReady === true && o.floorReady === true && !!o.baking; } catch { return false; } };
  async function stageRebake() {
    const t = now();
    while (stage.failed === null && !stageOver() && rebaking() && now() - t < cfg.serviceTimeoutMs) await delay(STAGE_REBAKE_POLL_MS);
    stage.rebakeWaitedMs = (stage.rebakeWaitedMs ?? 0) + Math.round(now() - t);
    if (stage.failed === null && !stageOver() && rebaking()) stageFail(`timeout: occ: a re-bake had not ended after ${cfg.serviceTimeoutMs} ms`);
  }
  // Ahead of the swap, off stage: the programs the hall's frames will use are compiled under the state the swap will leave
  // (adopt.rehearse: the queued wraps on, three's compile over the whole scene, the wraps off again, one task; with
  // KHR_parallel_shader_compile the drivers then link in the background and the wait below polls for it), and the hall's
  // textures are uploaded in slices of STAGE_WARM_SLICE_MS. TWO PASSES, each its own task: as the play camera sees the scene,
  // and as a camera on the default layer alone sees it. The swap's ONE capture draws through cube cameras, and those are
  // on the default layer alone: they light the scene without the lights of any other layer (the open shell's key lights
  // are on the play camera's own layer). Another count of lights is another program for every lit material, so with the
  // first pass alone each of those programs was first linked inside the swap's task, where the game cannot answer. With
  // both, the swap links nothing (`linkedInSwap`: 0). Geometry buffers and the post chain's programs are made by the
  // first hall frame, under the kept frame. A renderer without `compile` (dev pages, node arms) warms nothing.
  const STAGE_WARM_SLICE_MS = 6;
  async function stageWarm() {
    const warm = { programs: null, pending: null, textures: 0, passes: 0, ms: null, why: null };
    stage.warm = warm;
    const r = ctx?.renderer, T = club.adopt?.THREE, t = now();
    try {
      if (typeof r?.compile !== 'function' || typeof club.adopt?.rehearse !== 'function' || !T?.WebGLRenderTarget) { warm.why = 'the renderer or the adopter cannot rehearse'; return; }
      const before = programIds();
      // (a render target stands in for the composer's: three keys a program by "to a target" against "to the screen")
      const rt = new T.WebGLRenderTarget(4, 4, { depthBuffer: false });
      const pass = (camera) => {
        const was = r.getRenderTarget();
        try { club.adopt.rehearse(() => { r.setRenderTarget(rt); r.compile(ctx.scene, camera); }); } finally { r.setRenderTarget(was); }
        warm.passes += 1;
      };
      // the capture's eye: the play camera's twin (itself alone, not what hangs on it) on the default layer alone; none
      // when the play camera is on that layer alone already, or cannot be cloned
      let plain = null;
      try { const twin = ctx.camera.clone(false); twin.layers.mask = new T.Layers().mask; if (twin.layers.mask !== ctx.camera.layers.mask) plain = twin; } catch { plain = null; }
      try {
        pass(ctx.camera);
        if (plain) { await delay(0); if (!stageOver() && stage.failed === null) pass(plain); } // (the stage's frames go on between the two)
      } finally { rt.dispose(); }
      const fresh = [];
      if (before) for (const prog of r.info?.programs ?? []) if (!before.has(prog?.id)) fresh.push(prog);
      warm.programs = fresh.length;
      const until = now() + Math.min(cfg.serviceTimeoutMs, 4000);
      const left = () => fresh.filter((prog) => { try { return typeof prog.isReady === 'function' && prog.isReady() !== true; } catch { return false; } }).length;
      while (left() > 0 && now() < until && !stageOver()) await delay(10);
      warm.pending = left();
      if (typeof r.initTexture === 'function' && typeof r.properties?.get === 'function') {
        const seen = new Set();
        const take = (tex) => { if (tex && tex.isTexture === true && !seen.has(tex) && releasable(tex)) seen.add(tex); };
        ctx.scene.traverse((o) => {
          for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) {
            texturesOfMaterial(m, take);
            const u = r.properties.get(m)?.uniforms; // the uniforms the compile above gathered (the patches' maps live there)
            if (u && typeof u === 'object') for (const k in u) take(u[k]?.value);
          }
        });
        let slice = now();
        for (const tex of seen) {
          if (stageOver() || stage.failed !== null) break;
          if (r.properties.get(tex)?.__webglTexture !== undefined) continue;
          r.initTexture(tex); warm.textures += 1;
          if (now() - slice > STAGE_WARM_SLICE_MS) { await delay(0); slice = now(); } // the stage's frames go on between slices
        }
      }
    } catch (e) { note('stage warm', e); warm.why = text(e); } finally { warm.ms = Math.round(now() - t); }
  }
  // the swap: called by main in the task of the last live stage frame, after that frame was drawn and kept
  function stageSwap() {
    const t = now();
    stage.swapAtMs = since(); stage.phase = 'kept'; swapClock = t; idsAtSwap = programIds();
    try { club.room?.stageShow?.(); } catch (e) { note('room.stageShow', e); } // (while `offStage` still stands: the room's own capture request is dropped)
    club.offStage = false;
    try { stage.installed = club.adopt?.flush?.() ?? null; } catch (e) { note('adopt.flush', e); }
    pending.add('stage'); // every service reads the scene again as it now stands, then the ONE capture of the hall
    try { showPass(); } catch (e) { note('stage.show', e); } // (main's frame is never handed a throw)
    const end = now();
    stage.swapMs = Math.round(end - t);
    swapClock = end; // the kept frame's allowance runs from the swap's END: a swap that outlasts settleMaxMs must not have spent it
    try { stage.linkedInSwap = linkedSinceSwap(); } catch (e) { note('stage', e); }
  }
  // asked by main once per presented frame after the swap, after the hall was drawn under the kept frame: true = keep it
  // (while the hall is not quiet, for at most settleMaxMs after the swap's end)
  function stageKept() {
    const why = now() - swapClock <= cfg.settleMaxMs ? unquiet() : null;
    if (why) { stage.keptFrames += 1; stage.unquiet = why; return true; }
    stage.quietAtReveal = unquiet() === null;
    stage.dissolveAtMs = since(); stage.phase = 'dissolve';
    try { stage.linkedAfterSwap = linkedSinceSwap(); } catch (e) { note('stage', e); }
    return false;
  }
  // the pace facts: handed to main ONCE
  let paceTold = false;
  function stageReport(facts) {
    if (paceTold || !stage.on) return;
    const told = facts && typeof facts === 'object' ? { ...facts, tier: club.tier ?? null } : facts; // (protocol 2: the facts name the tier that was built; main books the report on that tier's rung)
    paceTold = true; stage.pace = told;
    try { stageCtx.report?.(told); } catch (e) { note('stage.report', e); }
  }
  const pace = createPace({ now, visible: () => { try { const d = win?.document; return d ? d.visibilityState === 'visible' : true; } catch { return true; } },
    stamp: () => { try { return win?.document?.timeline?.currentTime ?? null; } catch { return null; } } }); // the frame's own time stamp, where the page has one
  if (stage.on) { try { win?.document?.addEventListener?.('visibilitychange', () => { if (win.document.visibilityState !== 'visible') pace.hide(); }); } catch (e) { note('stage pace', e); } }

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
    onFrame(fn) { if (stage.failed !== null) return () => {}; if (typeof fn === 'function' && !frameFns.includes(fn)) frameFns.push(fn); return () => club.offFrame(fn); }, // (a failed stage runs no hook of the look)
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
        life: { ...life, ...(stage.on ? { stage: JSON.parse(JSON.stringify(stage)) } : {}), events: { ...life.events }, eventLog: life.eventLog.map((x) => x.slice()), curtain: { ...curtain, under: curtain.under ? { ...curtain.under } : null }, released: { ...life.released, list: life.released.list.map((x) => ({ ...x })) }, tierAsked: life.tierAsked.slice(), tierPick: life.tierPick ? { ...life.tierPick, knobsChanged: life.tierPick.knobsChanged.slice() } : null, pending: [...pending], studio: studio(), tablePending: tablePending(), frameHooks: frameFns.length, budget: { ...cfg } },
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
  async function build(key, file, factory, budgetMs = cfg.serviceTimeoutMs) { // (the stage flow hands the room two budgets: nothing is held while it builds)
    const tb = now();
    built[key] = { ms: null, late: false, timedOut: false };
    let settled = false, clock = null;
    const work = (async () => {
      const mod = typeof file === 'function' ? await asked(file()) : await load(file);
      const make = mod?.[factory];
      if (typeof make !== 'function') return stub(`${typeof file === 'string' ? file : key} has no ${factory}`);
      const svc = await make(club);
      return svc && typeof svc === 'object' ? svc : stub(`${factory} returned nothing`);
    })();
    const budget = new Promise((resolve) => { clock = setTimeout(() => resolve(null), budgetMs); });
    try {
      const svc = await Promise.race([work, budget]);
      if (svc) { settled = true; club[key] = svc; built[key].ms = Math.round(now() - tb); return; }
      built[key].timedOut = true;
      club[key] = stub(`not ready after ${budgetMs} ms (adopted late if it arrives)`);
      note(key, `not ready after ${budgetMs} ms`);
      console.warn(`[club] ${key} did not finish inside ${budgetMs} ms — the others go on without it`);
      work.then((late) => {
        if (settled) return;
        settled = true; built[key].late = true; built[key].ms = Math.round(now() - tb);
        // (the stage flow: a service past its budget failed the stage; what arrives afterwards is disposed, never shown)
        if (stage.on) { try { late?.dispose?.(); } catch (e) { note(`${key}.dispose`, e); } return; }
        club[key] = late;
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

  // The show pass: ONE synchronous pass (the curtain flow: behind the curtain, after its bounded wait; the stage flow: main
  // calls it through stageSwap in the task of the last live stage frame).
  function showPass() {
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
  }

  try {
    // (the stage flow, protocol 2: on a boot of the light rung main hands `tier: 'lite'`; it is taken before this file's
    // own rule and before the query, on a stage boot alone. Nothing else is ever handed: every other boot picks as before)
    const own = pickTierInfo({ renderer: ctx?.renderer, query: ctx?.query }), handedLite = stage.on && ctx?.tier === 'lite';
    const picked = handedLite ? { ...own, tier: 'lite', why: `handed by the boot rules: the light hall (this file's own rule: ${own.tier}, ${own.why})`, forced: false } : own;
    const tuned = knobsFor(picked.tier, ctx?.query); // ?clubknobs= (tools): single knobs of the picked tier
    club.tier = picked.tier;
    // (round A2: a venue's own per-id texture caps for this tier are laid over the tier's; the club row has none, and the
    // function then hands back the very object it was given)
    club.knobs = venueTierKnobs(tuned.knobs, picked.tier, venueKnobs);
    life.tierPick = { tier: picked.tier, why: picked.why, forced: picked.forced, gpu: picked.facts?.gpu ?? null, knobsChanged: tuned.changed, ...(handedLite ? { handed: true } : null) };
    life.released.on = club.knobs.releaseHidden === true;
    // one frame hook for the whole look: the app emits 'frame' once per delivered frame, before its composer renders.
    // Attached before the services are built, and never lets a throw reach the app's loop.
    let resolveFirstFrame = () => {};
    const firstFrame = new Promise((resolve) => { resolveFirstFrame = resolve; });
    try {
      ctx?.machine?.on?.('frame', (clock, dt) => {
        club.time.value = clock; life.frames += 1;
        if (life.frames === 1) resolveFirstFrame();
        if (stage.on) { stageTrack(); const facts = pace.tick(); if (facts) stageReport(facts); }
        if (curtain.state === 'up') {
          // this frame is drawn right after the hook: behind the curtain, or as the first frame of the look
          framesSinceArm += 1;
          // (the arena venue: a hidden frame of a hall whose cube or ambient values have not arrived yet
          // does not count: ONE more hidden frame follows the frame that finds the hall quiet. Until settleMaxMs: past it
          // the lines below end the settle as they always did. Under the club venue `moving` is null and the chain is
          // what it was.)
          const moving = settledRule && settleLeft >= 0 && now() - settleFrom <= cfg.settleMaxMs ? unquiet(true) : null;
          if (moving) { curtain.unquiet = moving; curtain.waited = (curtain.waited ?? 0) + 1; curtain.hidden += 1; settleLeft = 1; }
          else if (settleLeft === 0) drop('settled');
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

    // The stage flow: what it cannot do without is checked before another byte of the leaf is asked for (the arena's room,
    // the one with a deferred swap; a composer; a leaf whose own tier rule agrees with the verdict that made the stage:
    // `lite` by this file's own rule = this device keeps the old room; a `lite` the boot rules HANDED is the light hall; a
    // stage of another protocol is not served). Then every module of the hall is asked for at once (STAGE_MODULES).
    const warmed = new Map(); // module file -> module, for the build loop (no second import, no wait)
    let stageModules = null;
    if (stage.on) {
      if (stageCtx.protocol !== undefined && stageCtx.protocol !== STAGE_PROTOCOL) stageFail(`mismatch: the app speaks stage protocol ${String(stageCtx.protocol)}, the leaf ${STAGE_PROTOCOL}`);
      else if (venue !== 'arena') stageFail(`venue: the stage flow is the arena's (${venue})`);
      else if (!canHold) stageFail('no composer to present the hall');
      else if (club.tier === 'lite' && !handedLite) stageFail('tier: the leaf picked lite for this device');
      else if (stageOver()) stageFail('late: the stage was over before the build began', false);
      else {
        const asks = [];
        for (const [key, file] of services) if (typeof file === 'string' && !off.has(key)) asks.push(Promise.resolve().then(() => load(file)).then((mod) => { warmed.set(file, mod); }, () => null));
        if (loader === loadModule) for (const ask of stageBurst(motionFor(club.knobs, ctx?.query))) asks.push(Promise.resolve().then(() => asked(ask())).catch(() => null)); // (the two motion parts: each only where this tier builds it)
        stageModules = Promise.race([Promise.all(asks), delay(cfg.serviceTimeoutMs)]);
      }
    }
    const [assetsMod, adoptMod] = stage.failed !== null ? [null, null] : await Promise.all(['./assets.js', './adopt.js'].map((f) => Promise.resolve().then(() => load(f)).catch((e) => { note(f, e); return null; })));

    // The curtain goes up after one tournament frame was delivered, so the canvas holds a picture to keep (raised before any
    // frame, it would leave an empty canvas behind the boot overlay). The macrotask after the hook lets that frame's draw
    // finish. The wait is long on purpose: a visible page delivers its first frame as soon as the app can draw one, and a
    // hidden page shows nothing either way. The service modules are fetched meanwhile (an import does nothing by contract),
    // so the curtain is up for the build only, not for the downloads.
    if (canHold && stage.failed === null) { // (a stage that has already failed asks for no module: the old room needs none)
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
      if (!stage.on) raise(); // (the stage flow has no curtain: the game stays live on the stage)
    }
    if (stage.on && stage.failed === null) { club.offStage = true; pace.phase('loading'); await stageModules; }

    noteBound(); // the app's textures as the tournament frame binds them, before any service changes the scene
    try { club.assets = typeof assetsMod?.createAssets === 'function' ? assetsMod.createAssets(club) : assetsStub('assets.js is unavailable'); } catch (e) { note('assets', e); club.assets = assetsStub(text(e)); }
    try { club.adopt = typeof adoptMod?.createAdopt === 'function' ? adoptMod.createAdopt(club) : adoptStub('adopt.js is unavailable'); } catch (e) { note('adopt', e); club.adopt = adoptStub(text(e)); }
    if (stage.on && stage.failed === null) {
      // off stage every change to a material the stage draws is queued (adopt.js): no adopter, no stage flow
      if (club.assets?.enabled !== true || club.adopt?.enabled !== true || typeof club.adopt.defer !== 'function') stageFail(`${club.assets?.enabled !== true ? 'assets' : 'adopt'}: ${(club.assets?.enabled !== true ? club.assets?.reason : club.adopt?.reason) ?? 'no deferred mode'}`);
      else club.adopt.defer();
    }

    for (const [key, file, factory] of services) {
      if (stage.failed !== null) break;
      if (off.has(key)) { club[key] = stub('off by ?cluboff'); built[key] = { ms: 0, late: false, timedOut: false, off: true }; continue; }
      if (stage.on && stageOver()) { stageFail('late: the stage was over while the hall was built', false); break; }
      // (the stage flow: nothing is held while the room is built, so it gets two budgets; main's bound stands over all.
      // A module the burst above brought is handed over as it is: no second import)
      const have = stage.on ? warmed.get(file) : undefined;
      await build(key, have !== undefined ? () => have : file, factory, stage.on && key === 'room' ? 2 * cfg.serviceTimeoutMs : cfg.serviceTimeoutMs);
      if (stage.on) { if (!OPTIONAL.has(key) && club[key]?.enabled !== true) stageFail(`${key}: ${club[key]?.reason ?? 'not built'}`); continue; } // (off stage nothing was hidden or swapped: nothing to free yet)
      // free what this service hid or swapped out right away, so the app room's maps are gone before the club room's are
      // uploaded by the next hidden frame (the peak under the curtain stays near the steady state)
      releaseHidden(`build:${key}`);
    }
    life.installMs = since();
    curtain.builtAtMs = life.installMs;
    if (stage.on) stage.builtAtMs = life.installMs;

    // show: a bounded wait for what is known to be asynchronous, then one synchronous pass
    const waits = [];
    if (stage.failed === null) {
      try { waits.push(club.assets?.ready?.()); } catch (e) { note('assets.ready', e); }
      waits.push(club.room?.lightmap?.ready, club.occ?.table?.ready, club.occ?.floor?.ready);
      for (const [key] of services) waits.push(club[key]?.ready);
    }
    const all = Promise.allSettled(waits.filter(thenable)).then(() => 'settled');
    if (stage.on) {
      // ---- the stage flow: wait off stage, warm, then the one reveal (see the section above) ----
      if (stage.failed === null) {
        let waitClock = null;
        stage.waited = await Promise.race([all, new Promise((resolve) => { waitClock = setTimeout(() => resolve('timeout'), cfg.serviceTimeoutMs); })]);
        clearTimeout(waitClock);
        life.revealWaited = stage.waited;
        if (stage.waited === 'timeout') stageFail(`timeout: the hall's files or bakes were not in after ${cfg.serviceTimeoutMs} ms`);
      }
      // (a re-bake in flight is waited for before each check: `stageRebake`. No re-bake, no wait: not one task more)
      if (stage.failed === null && rebaking()) await stageRebake();
      if (stage.failed === null) { const blocked = stageBlocker(); if (blocked) stageFail(blocked); }
      if (stage.failed === null) await stageWarm();
      if (stage.failed === null && rebaking()) await stageRebake();
      if (stage.failed === null) {
        // (a patch whose anchor the compile above did not find is skipped whole: a hall without it is not the hall)
        const blocked = stageBlocker();
        if (blocked) stageFail(blocked);
        else if (stageOver()) stageFail('late: the stage was over when the hall was ready', false);
      }
      if (stage.failed === null) {
        stage.readyAtMs = since(); stage.phase = 'rest';
        let shown = null;
        try { shown = stageCtx.reveal({ rest: stageRest, swap: stageSwap, held: stageKept }); } catch (e) { note('stage.reveal', e); shown = null; }
        if (!thenable(shown)) stageFail('late: main had ended the stage', false);
        else {
          pace.phase('reveal');
          await shown;
          stage.endAtMs = since(); stage.phase = 'hall';
          pace.phase('wait'); // the hall's window opens a second from here (createPace)
        }
      }
    } else {
      let waitClock = null;
      const cap = new Promise((resolve) => { waitClock = setTimeout(() => resolve('timeout'), cfg.revealWaitMs); });
      life.revealWaited = await Promise.race([all, cap]);
      clearTimeout(waitClock);
      showPass();
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
  // (the stage flow: an install that threw before its swap fails the stage like any other cause; a failed stage never
  // shows the look, so `shown` stays false there and no refresh pass or late service ever runs)
  if (stage.on && stage.swapAtMs === null && stage.failed === null) stageFail(errors.length ? errors[errors.length - 1] : 'the install ended before the hall was shown');
  club.shown = !(stage.on && stage.failed !== null);
  life.readyAtMs = since();
  resolveShown();
  club.ready = true;
  return club;
}
