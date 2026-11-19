// Copyright (c) Meta Platforms, Inc. and affiliates.

// motion.js — the motion service of the club look (CONTRACT.md section 12): chalk dust at the cue tip and marks on the
// cloth, drawn from the shot record and the playback clock. Owner: wiring (this file wires; each effect is its own part
// with its own owner: motion/dust.js, motion/marks.js). Importing this module does nothing: all work starts in
// createMotion().
//
// What this file does, and nothing else:
//   - loads the parts with LITERAL dynamic imports (the served-strings gate reads them). A part that is missing, fails to
//     load, returns nothing or throws leaves the others running and is reported in state();
//   - puts ONE group in the scene, named MOTION_ROOT_NAME, with one child group per part: everything a part draws lives
//     under its group. The name starts with `obAim`, the prefix the app already treats as "not an object of the room":
//     the ball return's furniture walk skips it (web/scene/ballreturn/furniture.js EXCLUDE_NAME, any ancestor), the app's
//     environment bake hides it (main.js hideGameplayVisualsForBake), the studio bake and the venue probe hide it
//     (cinelight.js, lightingvisuals.js), and the club's own reflection service hides it in its cube, ambient and mirror
//     pictures (env.js: the `obAim*` rule, and `env.exclude(root)` which this file calls so nothing depends on a cache);
//   - subscribes ONE 'frame' listener and ONE 'stateChange' listener on the app's state machine and calls each part's
//     `update(t, record, info)` from the frame listener. A listener body never throws: a part that throws is switched
//     off (its group hidden, its `dispose()` tried once), a note is kept in state(), the other part goes on;
//   - hands every part the same small kit (below): the game and the machine as READ-ONLY views.
//
// The time a part is given (the two clocks of `__test.renderAt(t, dt, tCam)`, reports/r4-STUDY-motion.md section 2):
// `t` is the BALL clock, `game.clock`: the time the ball meshes are posed at. In live play and in a one-clock
// `renderAt(t)` during PLAYBACK it is also the time the 'frame' event carries. In the two-clock calls (`renderAt(t, dt,
// tCam)`, `renderAccum(subs, { tBall })`) the event carries the CAMERA clock while the balls are posed at the ball clock;
// an effect that belongs to the balls (dust at the strike, a mark where a ball met a cushion) follows the balls, so the
// part gets the ball clock and the event's own time only as `info.tEvent`. Outside PLAYBACK `game.clock` holds its last
// value (the balls rest where that playback left them) and so does `t`. `dt` is never handed on: an effect is a pure
// function of the record and `t`.
import * as THREE from 'three';
import { motionFor } from './tiers.js';

// [part key, module, loader, factory]. Literal specifiers only.
const PARTS = [
  ['dust', './motion/dust.js', () => import('./motion/dust.js'), 'applyDust'],
  ['marks', './motion/marks.js', () => import('./motion/marks.js'), 'applyMarks'],
];

/** The scene group that holds everything the motion parts draw. The `obAim` prefix is load-bearing (see the header). */
export const MOTION_ROOT_NAME = 'obAimClubMotion';
/** A part's own group under the root: `obAimClubMotion.<key>` (also `obAim*`, so the rule holds for a re-parented group). */
export const partGroupName = (key) => `${MOTION_ROOT_NAME}.${key}`;

// members of the game a part may CALL through the read-only view (each is a plain read in game.js)
const GAME_CALLS = Object.freeze(['cueBall', 'activeBalls']);
// members a part may not even read: the sampler and its buffer (reading a pose goes through the ball meshes)
const GAME_HIDDEN = Object.freeze(['sampler', 'buf']);
const MAX_NOTES = 24;

const text = (e) => String(e?.message ?? e);
const missing = (e) => /failed to fetch|cannot find module|err_module_not_found|importing a module script failed|error loading dynamically imported module|404/i.test(text(e) + ' ' + String(e?.code ?? ''));

/**
 * A read-only view of the game for a motion part (law 1 of the round). Reads fall through to the live object, so a part
 * always sees the current record, clock and ball set; a write, a define or a delete is refused (a TypeError in module
 * code, which the caller's try block turns into "part switched off") and noted; a function member is only handed out when
 * it is on the short list of plain reads (GAME_CALLS, bound to the game); the sampler and its buffer read as undefined.
 * The view is shallow: the record and the meshes it leads to are the app's own objects and stay read-only by law.
 */
export function readOnlyGame(game, note = () => {}) {
  if (!game || typeof game !== 'object') return null;
  const refused = new Set();
  const refuse = (what, key) => {
    const k = `${what} ${String(key)}`;
    if (!refused.has(k)) { refused.add(k); try { note(`game is read-only: ${k} refused`); } catch { /* a note never throws */ } }
    return false;
  };
  const bound = new Map();
  return new Proxy(game, {
    get(target, key) {
      if (typeof key === 'string' && GAME_HIDDEN.includes(key)) { refuse('read of', key); return undefined; }
      const v = Reflect.get(target, key, target);
      if (typeof v !== 'function') return v;
      if (typeof key !== 'string' || !GAME_CALLS.includes(key)) { refuse('call of', key); return undefined; }
      let fn = bound.get(key);
      if (!fn || fn.of !== v) { fn = { of: v, call: (...args) => v.apply(target, args) }; bound.set(key, fn); }
      return fn.call;
    },
    set(_t, key) { return refuse('write of', key); },
    defineProperty(_t, key) { return refuse('define of', key); },
    deleteProperty(_t, key) { return refuse('delete of', key); },
    setPrototypeOf() { return refuse('prototype of', 'game'); },
    preventExtensions() { return refuse('freeze of', 'game'); },
  });
}

/** A read-only view of the state machine: the state and `is(...)`; no `on`, `emit` or `to` (this file owns the listeners). */
export function readOnlyMachine(machine) {
  const view = {};
  Object.defineProperty(view, 'state', { enumerable: true, get: () => { try { return machine?.state ?? null; } catch { return null; } } });
  view.is = (...states) => { try { return states.includes(machine?.state); } catch { return false; } };
  return Object.freeze(view);
}

/**
 * The table as a part needs it, read from the game's template at the time of the call (a table change is seen): the bed
 * plane and the scale. `{ bedY, ballR, length, width, halfL, halfW }` in metres, world axes (the long axis is world x, so
 * `halfL` is the half extent along x and `halfW` along z, both of the playing surface between the cushion noses as the
 * kernel has it), or null while there is no template. Pure read.
 */
export function tableOf(game) {
  try {
    const sys = game?.template?.system;
    const length = Number(sys?.table?.length), width = Number(sys?.table?.width), ballR = Number(sys?.balls?.[0]?.params?.r);
    if (!(length > 0) || !(width > 0) || !(ballR > 0)) return null;
    return { bedY: 0, ballR, length, width, halfL: length / 2, halfW: width / 2 };
  } catch { return null; }
}

/**
 * Build the motion service. `club` is the installer's object (dev pages: any object with `ctx: { scene, machine, game,
 * query }`, `knobs`, `tier`). `opts` (dev pages and node arms only): `{ parts }` replaces the table of parts with rows
 * `[key, label, load, factory]`. Resolves to `{ enabled, reason, parts, kit, root, state(), dispose() }`; never rejects.
 */
export async function createMotion(club, opts = {}) {
  const ctx = club?.ctx ?? {};
  const scene = ctx.scene?.isObject3D === true ? ctx.scene : null;
  const machine = ctx.machine && typeof ctx.machine.on === 'function' ? ctx.machine : null;
  const rows = Array.isArray(opts?.parts) ? opts.parts : PARTS;
  const notes = [];
  const note = (s) => { if (notes.length < MAX_NOTES) notes.push(String(s)); };
  let want = { dust: true, marks: true, why: {} };
  try { want = motionFor(club?.knobs, ctx.query); } catch (e) { note(`knobs unreadable (${text(e)}): every part is asked for`); }

  if (!scene) return { enabled: false, reason: 'no scene', parts: {}, kit: null, root: null, state: () => ({ enabled: false, reason: 'no scene', parts: {}, notes: notes.slice() }), dispose() {} };

  // ---- the root group and the kit ------------------------------------------------------------------------------------------
  const root = new THREE.Group();
  root.name = MOTION_ROOT_NAME;
  root.userData.clubMotion = true;
  root.visible = false; // shown by the frame listener while a record exists
  scene.add(root);
  let undoExclude = null;
  try { if (club?.env?.enabled === true && typeof club.env.exclude === 'function') undoExclude = club.env.exclude(root); } catch (e) { note(`env.exclude failed (${text(e)}): the obAim name rule alone keeps the root out of the club's captures`); }

  const game = readOnlyGame(ctx.game, note);
  const machineView = readOnlyMachine(machine);
  const table = () => tableOf(ctx.game);
  const parts = {};
  // per part: what state() reports beside the part's own state
  const info = {};
  const groups = {};
  const kitFor = (key) => {
    const group = new THREE.Group();
    group.name = partGroupName(key);
    group.userData.clubMotion = true;
    root.add(group);
    groups[key] = group;
    return Object.freeze({
      key, root: group, scene, game, machine: machineView, table,
      knobs: club?.knobs ?? {}, tier: club?.tier ?? null, want: Object.freeze({ ...want, why: undefined }),
      note: (s) => note(`${key}: ${s}`),
    });
  };
  const kits = {};

  for (const [key, label, load, fn] of rows) {
    info[key] = { present: null, loaded: false, calls: 0, errors: 0, off: null };
    if (want[key] === false) { parts[key] = { enabled: false, reason: want.why?.[key] ?? 'off' }; info[key].off = parts[key].reason; continue; }
    try {
      const mod = await load();
      info[key].present = true; info[key].loaded = true;
      if (typeof mod?.[fn] !== 'function') { parts[key] = { enabled: false, reason: `${label} has no ${fn}` }; continue; }
      kits[key] = kitFor(key);
      const part = await mod[fn](club, kits[key]);
      parts[key] = part && typeof part === 'object' ? part : { enabled: false, reason: `${fn} returned nothing` };
      if (parts[key].enabled === true && typeof parts[key].update !== 'function') parts[key] = { enabled: false, reason: `${fn} returned no update(t, record)` };
    } catch (e) {
      // a module that is not there (or one of its own imports is not): reported, never an error of the look
      if (info[key].present === null && missing(e)) { info[key].present = false; parts[key] = { enabled: false, reason: `not present (${label}: ${text(e).slice(0, 120)})` }; }
      else {
        parts[key] = { enabled: false, reason: text(e) };
        console.warn(`[club] motion part '${key}' is unavailable — the others go on:`, e);
      }
    }
    if (parts[key].enabled !== true && groups[key]) groups[key].visible = false;
  }
  // the parts that are built and not switched off: one array, rebuilt only when a part is switched off (the frame listener
  // allocates nothing)
  let liveKeys = Object.keys(parts).filter((k) => parts[k]?.enabled === true && info[k].off === null);
  const live = () => liveKeys;

  // ---- the two listeners ---------------------------------------------------------------------------------------------------
  const stats = { frames: 0, updates: 0, lastT: null, lastEvent: null, lastState: null, record: false, twoClock: 0, states: 0, entry: null };
  // what a part gets as the third argument of update(): valid during the call only (one object, rewritten every frame)
  const call = { state: null, playback: false, tEvent: 0, duration: null, entry: null, twoClock: false };
  // switch a part off for good (a throw, or a refused write): hide what it drew, try its dispose once, keep the note
  function switchOff(key, where, e) {
    info[key].errors += 1;
    info[key].off = `${where}: ${text(e)}`;
    liveKeys = liveKeys.filter((k) => k !== key); // a new array: a loop over the old one finishes on it
    note(`${key} switched off after ${where} threw: ${text(e)}`);
    try { if (groups[key]) groups[key].visible = false; } catch { /* the group is ours */ }
    try { parts[key]?.dispose?.(); } catch (err) { note(`${key}.dispose threw: ${text(err)}`); }
    try { console.warn(`[club] motion part '${key}' threw in ${where} and was switched off:`, e); } catch { /* no console */ }
  }
  function onFrame(tEvent) {
    try {
      stats.frames += 1;
      const g = ctx.game;
      const record = g?.record ?? null;
      const clock = Number(g?.clock);
      const t = Number.isFinite(clock) ? clock : Number(tEvent);
      const state = machineView.state;
      stats.lastEvent = tEvent; stats.lastState = state; stats.record = !!record;
      const on = !!record && Number.isFinite(t);
      if (root.visible !== on) root.visible = on;
      if (!on) {
        // no record (a new rack) or no usable clock: nothing of a shot is drawn; a part with output outside its group
        // (a term in a patched material) is told through the optional clear()
        for (const key of live()) { const p = parts[key]; if (typeof p.clear === 'function') { try { p.clear(); } catch (e) { switchOff(key, 'clear', e); } } }
        return;
      }
      stats.lastT = t;
      call.state = state; call.playback = state === 'PLAYBACK'; call.tEvent = Number(tEvent);
      call.duration = Number.isFinite(Number(g?.duration)) ? Number(g.duration) : null;
      call.entry = stats.entry; call.twoClock = Number.isFinite(call.tEvent) && call.tEvent !== t;
      if (call.twoClock) stats.twoClock += 1;
      for (const key of live()) {
        try { parts[key].update(t, record, call); info[key].calls += 1; stats.updates += 1; } catch (e) { switchOff(key, 'update', e); }
      }
    } catch (e) { note(`frame listener: ${text(e)}`); }
  }
  function onState(next, prev, entryInfo) {
    try {
      stats.states += 1;
      // how the current playback was entered: { strike } a live stroke, { replay } a replay, { replay, dvr } a loaded record
      if (next === 'PLAYBACK') stats.entry = Object.freeze({ strike: entryInfo?.strike === true, replay: entryInfo?.replay === true, dvr: entryInfo?.dvr === true });
      for (const key of live()) {
        const p = parts[key];
        if (typeof p.onState !== 'function') continue;
        try { p.onState(next, prev, stats.entry, ctx.game?.record ?? null); } catch (e) { switchOff(key, 'onState', e); }
      }
    } catch (e) { note(`stateChange listener: ${text(e)}`); }
  }
  const listeners = { frame: 0, stateChange: 0 };
  let offFrame = null, offState = null;
  if (machine && live().length) {
    try { offFrame = machine.on('frame', onFrame); listeners.frame = 1; } catch (e) { note(`machine.on('frame') failed: ${text(e)}`); }
    try { offState = machine.on('stateChange', onState); listeners.stateChange = 1; } catch (e) { note(`machine.on('stateChange') failed: ${text(e)}`); }
  } else if (!machine) note('no state machine: the parts are built and never updated');

  let disposed = false;
  const any = () => liveKeys.some((k) => parts[k]?.enabled === true); // a part may also switch itself off (its own `enabled`)
  const svc = {
    get enabled() { return !disposed && any(); },
    get reason() { return disposed ? 'disposed' : any() ? null : 'no motion part is built'; },
    parts, root,
    /** per part: the kit it was built with (dev pages, node arms) */
    kit: kits,
    /** table / fixture / look changed (the installer's refresh pass): a part with a `rebuild(reason)` re-finds what it patched */
    rebuild(reason) {
      for (const key of live()) { const p = parts[key]; if (typeof p.rebuild === 'function') { try { p.rebuild(reason); } catch (e) { switchOff(key, 'rebuild', e); } } }
    },
    /** tools: run one frame by hand (the same path the 'frame' listener takes) */
    tick(tEvent) { onFrame(tEvent); },
    state() {
      const o = {};
      for (const key of Object.keys(parts)) {
        const p = parts[key];
        let own = null;
        try { own = p.state?.() ?? null; } catch (e) { own = { error: text(e) }; }
        o[key] = { enabled: p.enabled === true && info[key].off === null, reason: info[key].off ?? p.reason ?? null, ...info[key], objects: groups[key]?.children?.length ?? 0, ...(own ? { state: own } : {}) };
      }
      return {
        enabled: svc.enabled, reason: svc.reason, root: root.name, rootVisible: root.visible, inScene: root.parent === scene,
        want: { dust: want.dust, marks: want.marks }, listeners: { ...listeners }, excludedFromEnv: typeof undoExclude === 'function',
        ...stats, entry: stats.entry ? { ...stats.entry } : null, parts: o, notes: notes.slice(),
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      try { offFrame?.(); } catch (e) { note(`unsubscribe frame: ${text(e)}`); }
      try { offState?.(); } catch (e) { note(`unsubscribe stateChange: ${text(e)}`); }
      offFrame = offState = null; listeners.frame = 0; listeners.stateChange = 0;
      for (const key of Object.keys(parts)) { try { parts[key]?.dispose?.(); } catch (e) { note(`${key}.dispose threw: ${text(e)}`); } }
      try { undoExclude?.(); } catch { /* the service is gone */ }
      try { root.removeFromParent(); } catch (e) { note(`root: ${text(e)}`); }
    },
  };
  return svc;
}
