// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-gi-stage.mjs — node selftest of web/scene/gi.js's room writes through main.js's staging seam (GH-1202; maintainer ruling
// 973d6da0 on review's two P2s on 0f146178). No browser: gi.js runs in plain node ('three' maps to the vendored build, its table.js
// import to a stub whose footprint a scenario sets), fetch serves a manifest with two looks and one baked fixture, and the lightmaps
// load as stub images. The fake seam keeps main.js's lightSet shape: serialized; before the overlay fades a change applies at once;
// after it a change is applied, compiled and reverted in one go, then applied for real once the test lets its programs "link".
// A tournament pick is look.js's: the room regrade writes TOURNAMENT.hemi, then look.js's own re-assert statement runs, lifted verbatim
// from web/scene/look.js (gi.setLook('tournament'), the hemi re-asserted once it resolves). cinelight.js's studio window (hemi
// snapshotted then 0.05, `__cinelight` + ob:cinelight; the revert announces first, then restores) is mirrored. The LX scenarios and WW
// run look.js itself instead (a fresh module per world, its room / table / cloth imports stubbed over the scenario's scene) under the
// real cinelight.js rig, each pick made as main.js's __test.setLook makes it (applyLook, then the tournament vignette and bloom on a truthy
// return, main.js:2975-2988, mirrored).
//   R1  a default bind still staged when the user picks Tournament (review P2, gi.js:329-330): the default look's dim never lands
//       over the pick, and the tournament scene keeps hemi 1.25 with its own maps bound;
//   R1b the stale default stage lands while the tournament apply still loads its maps: dropped too (applySeq: a newer apply STARTED);
//   R1c completion: setLook('tournament') resolves, and appliedSeq reaches applySeq, only once its staged bind landed; a second
//       setLook('tournament') meanwhile is not an idempotent "done";
//   R2  a staged bind landing inside a studio window (review P2, gi.js:356-359): no gameplay map and no hemi write in the window;
//       the bind stays kept and lands once the rig reverts;
//   R2b a staged restore (the honesty gate) landing inside a studio window: the room shows its build values there, the hemi stays
//       cinelight's, the undim lands after the revert, and the apply completes only once the restore landed;
//   R3  a restore superseded by a newer apply still lands (the drop is the bind's alone: the newer apply found the room restored),
//       and the newer apply completes only after it;
//   R4  the footprint gate (a table no committed class fits): its staged restore lands before the apply completes;
//   F1  a staged restore's undim landing after look.js re-asserted the tournament hemi (a fixture change during the pick) leaves it;
//   F1s the same restore landing inside a studio window: the resume after the revert leaves cinelight's restored tournament hemi;
//   BL  resting balls keep their baked probes while a staged bind waits (a key change zeroed them; uGiOn is 1 already);
//   ER  a failed apply (the probes fetch rejects) with a staged restore: loadError and appliedSeq wait for the restore;
//   CX  the pick's bind lands inside a studio window (review P2 on 23de9fa5, gi.js:675-677): setLook resolves there, and look.js's
//       re-assert leaves cinelight's 0.05 (1.25 after the revert);
//   P22 the pick's maps arrive inside a studio window (#1276, the keep path, on main too): the same;
//   B1  the boot path (every write lands at once before the overlay fades): the bind lands synchronously, compiles ahead once, and
//       the apply completes in the same microtask turn as without the completion wait (B1-ref; 52ebd07e's file: 2 turns).
// Batch 2 (ruling cb904a26 on the seam census at acaac82c: nothing staged lands in the studio window, whatever the rig rule):
//   RC  the gi-restore interval: a restore still staged when the window opens — the room is at its build values at the open, BEFORE the
//       landing (the studio rig and cinelight's private cube never see the leaving bake), unchanged when it lands, R2b's end state;
//   RC2 a same-key restore (a failed look change's fallback: the request key is still the kept assets') landing only after the window:
//       the resume re-binds nothing (restoreRoom dropped the leaving bake's kept set when it submitted the restore), and the undim lands
//       with the restore;
//   D1  the rig rule off from the boot (?venue=off): the boot bind still staged when the window opens keeps the room as it opened through
//       the window, and lands, its default-look dim included, after the revert;
//   D2  the rule off through the degrade (gi.setVenueShading(false), the call degradeVenue makes, main.js), then a fixture change still
//       staged when the window opens: neither its restore nor its bind changes the room inside the window; the new bake after the revert;
//   D2w the degrade inside the window (the room suspended under the rule): the re-bind is not staged there; it lands after the revert;
//   DR  the rule off: a restore still staged when the window opens leaves the bake through the window, and lands after the revert;
//   D3  a synchronous seam (no KHR, or a scripted boot), the rule off: the pick's maps arrive inside the window — kept there, bound after
//       the revert (b98aea74: bindRoom's tail cleared its write's deferral and the bind never landed); D3f the same for a fixture
//       change, canopy -> pendant (review on ca392f41: the room kept its build values after the export);
//   D4  the rule off, nothing bound yet (a boot fixture without a committed bake): the first bind's maps arrive inside the window — the
//       build values and hemiBase come from the gameplay world after the revert, not the studio's (b98aea74: hemi 0.025 after it);
//   TX  the rule off, the async seam: the re-assert statement run INSIDE the window (review P2 on 171b2f6f; since ruling 741c231d a
//       pick made inside the window is parked whole, LX, so this is a setLook resolving inside a window, WW end to end) — its apply
//       completes there with the bind kept, so the re-assert waits for the close: hemi 1.25 after the revert (01cef35f: the snapshot's
//       0.45 stayed);
//   TXr the same with the rule on (the keep path; acaac82c ended at 0.45 too);
//   TXd the statement inside the window, then a Default GI request before it closes: the deferred re-assert stands down (no 1.25 after
//       the revert, before the Default bind lands);
// Batch 3 (review P2s on debcecb4; the P-A / P-B class pass): EVERY scenario also checks the seam's invariant — no landing writes a
// program-keying room state (the floor light map, the blob map) that its own compile pass did not;
//   PA  P-A, a bind (the rule off): a pendant bind queued behind a restore runs its compile pass inside the window and its real apply
//       after the close — that submission stays inert, the resume's fresh one (compiled) lands;
//   PAon the same with the rule on (the open suspends the room; the stale submission still lands nothing after the close);
//   PAr P-A, a restore: a footprint-gate restore queued behind a stale bind — the same;
//   PBl P-B, look.js: a second window installed synchronously after the first window's revert — the deferred tournament re-assert
//       neither lands inside it nor is lost (1.25 after its revert);
//   PBg P-B, gi.js: the same second window — the resume microtask of the first close stages nothing inside it; it resumes at the
//       second close;
//   SPX look.js's legacy branch (a cached pre-rename gi.js: 'tournament' rejects, the legacy id binds and stays the requested look):
//       the deferred re-assert still lands after the revert (a9f2bebf stood down on it).
// Ruling 741c231d (look.js parks a pick made inside the studio window whole: the traverse, gi.setLook, the lighting compose). Each end
// state is compared exactly with a no-export pick's: the material colours, lamp / fill / hemi intensity and colour, the exposure, the
// GI maps, main.js's tournament vignette and bloom, and the rig the lighting compose and the env re-bake ran under:
//   LX  Tournament picked inside the window, the rule on, on the staged and the synchronous seam: nothing in the window moves, and after
//       the revert the look is the no-export pick's (036db03a: the revert put the snapshot's colours, lamp face and exposure back under
//       the tournament maps and hemi; the compose and the re-bake had run under the studio rig);
//   LXoff the same with the rule off (the legacy dressing: the wall and floor grades too);
//   LX2 picks inside one window, each against the same picks made with no export: Tournament then Default and Default then Tournament
//       (Default regrades nothing and replaces no parked pick; cfe1f4b1 dropped the Tournament under main.js's tournament vignette and
//       bloom), two Tournament picks with different refs (the newest refs apply), and Tournament inside, then Tournament after the revert
//       but before its microtask (the later pick supersedes the parked one: one regrade) or Default there (the parked one still lands);
//   LXw a second window installed synchronously after the first revert: the parked pick neither lands inside it (its microtask applies
//       through applyLook, which checks the window again) nor is lost;
//   LXp the pick inside the window, then normal play: after the next export the look is unchanged, and no ob:cinelight listener of the
//       pick stays armed;
//   WW  why the deferred re-assert stays beside the parking: Tournament picked before any window, its maps loading across a first export
//       (its close re-binds gi.js's kept default bake, the dim with it: the kept set is keyed by fixture, not look) and arriving inside a
//       second, whose snapshot holds that dim: the look after its revert is still the no-export pick's (the #1276 skip: hemi 0.45).
// Amendment 3ce81342 (a P3 b98aea74 introduced; main has no such path):
//   SK  the rule off: a fixture change whose restore is still staged, then a same-key Tournament apply that fails (its restore removes the
//       pendant bind just made), then an export: the older restore declines inside the window and sets roomSuspended, and the close must
//       not re-bind the removed bind (cfe1f4b1: the pendant bake and the default dim after the revert, GI unbound).
// PLANTS (each from the shipped file by anchored edits; each must FAIL its scenarios): the stale drop (R1, R1b), the studio deferral
// (R2, D1), the completion wait at the bind (R1c), at the honesty gate (R2b, R3) and at the footprint gate (R4), the restore dropped when
// stale (R3), the restore's undim inside the window (R2b), the restore's and the resume's dim ownership (F1, F1s), the balls' sampling
// before the wait (BL), the failure's settled state before its restore landed (ER), setLook's in-flight term (R1c), look.js's
// studio-window guard (CX, P22), the open's suspension of a leaving bake (RC, RC2), restoreRoom's drop of the kept set its restore removes
// (SK, RC2), the window test without the rule term (D1, D2, DR), the restore's hold inside the window (D2, DR), the resume's window
// guard (D2w) and its restore (DR), and
// the keep path inside the window without the rule term (D3, D3f, D4), look.js's re-assert deferred to the window's close (TX, TXr)
// and its stand-down for a newer look (TXd), the submission latch (PA, PAr), look.js's re-check inside its microtask (PBl), the
// resume microtask's window check (PBg), look.js's parking of a pick made inside the window (LX, LXoff, LX2, LXw, LXp), the newest pick
// (LX2: the first one parked kept, or a later pick outside the window leaving it), Default replacing no parked pick, inside the window or
// after the revert (LX2), and the parked pick's listener removed at the close
// (LXp). The re-assert's deferral plant fails WW too.
//   node web/tools/test-gi-stage.mjs                                  (exit 0 = every scenario held and every plant was caught)
//   node web/tools/test-gi-stage.mjs [--gi <gi.js>] [--look <look.js>] (the scenarios alone against those files, the shipped one for an
//                                                                      option not given, e.g. pre-fix copies: exit 1 when one fails)
// node >= 22.15 (module.registerHooks).
import fs from 'node:fs';
import path from 'node:path';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GI = path.resolve(HERE, '../scene/gi.js');
const LOOK_JS = path.resolve(HERE, '../scene/look.js');
// one pass over argv: --gi <file> and --look <file>, each at most once, each with a value
const opt = {};
for (let i = 0, a = process.argv.slice(2); i < a.length; i += 2) {
  if (!['--gi', '--look'].includes(a[i]) || a[i] in opt || !a[i + 1] || a[i + 1].startsWith('--')) {
    console.error('usage: node web/tools/test-gi-stage.mjs [--gi <gi.js>] [--look <look.js>]');
    process.exit(2);
  }
  opt[a[i]] = path.resolve(a[i + 1]);
}
const given = opt['--gi'] || opt['--look'] ? { gi: opt['--gi'] ?? GI, look: opt['--look'] ?? LOOK_JS } : null;
/** look.js's tournament re-assert, the shipped statement lifted verbatim (`gi?.setLook('tournament')` to its closing catch), run with
 * the scenario's gi, the room's hemi and TOURNAMENT.hemi.intensity read from the same file: a plant of look.js changes what runs */
function liftLook(src, from) {
  const a = "  gi?.setLook('tournament')\n"; const end = '?.catch?.(() => {});';
  const i = src.indexOf(a);
  if (i < 0 || src.indexOf(a, i + 1) >= 0) throw new Error(`${from}: the re-assert anchor is missing or not unique`);
  const j = src.indexOf(end, i);
  if (j < 0) throw new Error(`${from}: the re-assert statement has no end`);
  const stmt = src.slice(i, j + end.length);
  if (!stmt.includes('hemiRef.intensity = TOURNAMENT.hemi.intensity')) throw new Error(`${from}: the lifted statement holds no hemi re-assert`);
  const m = /\nconst TOURNAMENT = \{[\s\S]*?\n {2}hemi: \{ intensity: ([0-9.]+)/.exec(src);
  if (!m) throw new Error(`${from}: TOURNAMENT.hemi.intensity not found`);
  // the legacy look id the statement retries with (GH-973), read from the statement itself
  const legacy = (/setLook\?\.\('([a-z]+)'\)/.exec(stmt) || [])[1] ?? null;
  return { hemi: Number(m[1]), legacy, run: new Function('gi', 'hemiRef', 'TOURNAMENT', 'window', `'use strict';\n${stmt}`) };
}
let LOOK = null; // the lifted re-assert of the arm being run

// each arm is one gi.js source, served under the real file's URL plus a query; its 'three' import resolves to the vendored build
// (the app's import map does the same) and its './table.js' import to a stub: gi.js reads the active table's kernel footprint only
const GI_URL = pathToFileURL(GI).href;
const THREE_URL = pathToFileURL(path.resolve(HERE, '../vendor/three.module.min.js')).href;
const TABLE_STUB = 'export const activeTableId = () => globalThis.__giStageTable.id;\n'
  + 'export const specFor = () => ({ kernel: globalThis.__giStageTable.kernel });\n';
const TABLE_9FT = { id: 'stub_9ft', kernel: { length: 2.54, width: 1.27 } };
globalThis.__giStageTable = TABLE_9FT;
const SOURCES = new Map();
// look.js itself (ruling 741c231d): each arm's look.js source, served the same way, one FRESH module per look world (a parked pick is
// module state); its imports resolve to stubs over the world the scenario built — the room's lightRefs and dressing, the table's style
// and wood maps, the cloth visual
const LOOK_URL = pathToFileURL(LOOK_JS).href;
const LOOK_STUBS = {
  './table.js': "export const activeTableId = () => 'stub_9ft';\nexport const specFor = () => ({ render: { style: 'generic' } });\n"
    + 'export const makeWoodMap = (...a) => globalThis.__lookStage.woodMap(...a);\n',
  './clothvisuals.js': 'export const applyClothVisual = (...a) => globalThis.__lookStage.clothVisual(...a);\n',
  './room.js': 'export const activeRoom = { get instance() { return globalThis.__lookStage.room; } };\n',
  './shading.js': 'export {};\n',
};
const LOOK_SOURCES = new Map();
let LOOKARM = null; // the look.js source of the arm being run
let lookN = 0;
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'three') return { url: THREE_URL, shortCircuit: true };
    if (specifier === './table.js' && String(context.parentURL ?? '').startsWith(`${GI_URL}?arm=`)) {
      return { url: `data:text/javascript,${encodeURIComponent(TABLE_STUB)}`, shortCircuit: true };
    }
    if (Object.hasOwn(LOOK_STUBS, specifier) && String(context.parentURL ?? '').startsWith(`${LOOK_URL}?arm=`)) {
      return { url: `data:text/javascript,${encodeURIComponent(LOOK_STUBS[specifier])}`, shortCircuit: true };
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    const q = url.indexOf('?arm=');
    if (q > 0 && url.slice(0, q) === GI_URL) return { format: 'module', source: SOURCES.get(url.slice(q + 5)), shortCircuit: true };
    if (q > 0 && url.slice(0, q) === LOOK_URL) return { format: 'module', source: LOOK_SOURCES.get(url.slice(q + 5).replace(/&n=\d+$/, '')), shortCircuit: true };
    return next(url, context);
  },
});
const loadArm = (name, source) => { SOURCES.set(name, source); return import(`${GI_URL}?arm=${name}`); };
const freshLook = () => import(`${LOOK_URL}?arm=${LOOKARM}&n=${++lookN}`);

// the page: window events through one registry (cleared per scenario, so an earlier runtime never hears a later window), the lightmaps
// as stub images (each loads one task after its src is set, or waits while held)
const listeners = new Map();
globalThis.window = globalThis;
globalThis.addEventListener = (type, fn) => { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); };
globalThis.removeEventListener = (type, fn) => { const l = listeners.get(type); const i = l ? l.indexOf(fn) : -1; if (i >= 0) l.splice(i, 1); };
globalThis.dispatchEvent = (ev) => { for (const fn of (listeners.get(ev.type) ?? []).slice()) fn(ev); return true; };
globalThis.location = { search: '', href: 'http://localhost/', origin: 'http://localhost', pathname: '/' };
globalThis.sessionStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const images = { hold: false, queue: [] };
const fire = (img) => { for (const fn of img.ls.load.slice()) fn.call(img, { type: 'load' }); };
globalThis.document = {
  createElementNS: () => {
    const img = {
      width: 2, height: 2, ls: { load: [], error: [] }, url: '',
      addEventListener(t, fn) { this.ls[t]?.push(fn); },
      removeEventListener(t, fn) { const l = this.ls[t]; const i = l ? l.indexOf(fn) : -1; if (i >= 0) l.splice(i, 1); },
      set src(v) { this.url = String(v); if (images.hold) images.queue.push(img); else setTimeout(() => fire(img), 0); },
      get src() { return this.url; },
    };
    return img;
  },
};
const releaseImages = () => { images.hold = false; for (const img of images.queue.splice(0)) setTimeout(() => fire(img), 0); };
const THREE = await import('three');
const CINE = await import(pathToFileURL(path.resolve(HERE, '../app/cinelight.js')).href); // the real studio rig (imports 'three' only)
// the pool looks, plus one fixture with a committed bake (pendant_bar); any other fixture has none (the honesty gate)
const entry = (k) => ({ scale: 1, files: { plan: `gi-${k}-plan.png`, flank: `gi-${k}-flank.png`, floor: `gi-${k}-floor.png`,
  floorshadow: `gi-${k}-shadow.png`, probes: `gi-${k}-probes.json` } });
const manifest = () => ({
  sceneHash: 'test-gi-stage', bounds: { plan: { x0: -1.5, z0: -1, x1: 1.5, z1: 1 } },
  looks: { default: entry('d'), tournament: entry('t') },
  fixtures: { pendant_bar: { looks: { default: entry('pd'), tournament: entry('pt') } } },
});
const PROBES = { grid: { x0: -1, z0: -1, dx: 1, dz: 1, nx: 3, nz: 3 }, coeffs: Array.from({ length: 9 }, () => new Array(27).fill(0.1)) };
const fetchFail = new Set();
globalThis.fetch = async (url) => {
  const u = String(url); const f = u.replace(/^.*\//, '');
  if (f === 'gi-manifest.json') return { ok: true, status: 200, json: async () => manifest() };
  if (f.endsWith('-probes.json') && !fetchFail.has(f)) return { ok: true, status: 200, json: async () => PROBES };
  return { ok: false, status: 404, json: async () => { throw new Error(`no fixture for ${u}`); } };
};

const settle = async (n = 12) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0)); };
/** main.js's lightSet, its program poll replaced by a gate the test opens (seam contract v1.2: no timer apply) */
function makeSeam() {
  const seam = { immediate: false, gates: [], log: [], sig: null, unlinked: [] };
  let tail = null;
  const stageApply = (apply, why, mode) => { apply(); seam.log.push(`${why}:${mode}`); return mode; };
  const stageOne = (change) => new Promise((resolve) => {
    if (typeof change.revert !== 'function' || seam.immediate) { resolve(stageApply(change.apply, change.why, 'immediate')); return; }
    const s0 = seam.sig?.(); change.apply(); const compiled = seam.sig?.(); change.revert(); // the compile pass: apply, compile the draw set, revert — one task, no frame renders it
    seam.log.push(`${change.why}:compiled`);
    seam.gates.push({ why: change.why, open: () => {
      // batch 3 (P-A): a landing that changes the program-keying room state must carry what its own compile pass applied
      const b = seam.sig?.(); const mode = stageApply(change.apply, change.why, 'staged'); const a = seam.sig?.();
      if (a !== b && a !== compiled) seam.unlinked.push(`${change.why} landed ${a}; its compile pass: ${s0} -> ${compiled}`);
      resolve(mode);
    } });
  });
  seam.lightSet = (change) => {
    if (typeof change?.apply !== 'function') return Promise.resolve('immediate');
    if (!tail && (typeof change.revert !== 'function' || seam.immediate)) return Promise.resolve(stageApply(change.apply, change.why, 'immediate'));
    const run = () => stageOne(change);
    const p = (tail || Promise.resolve()).then(run, run);
    const t = p.then(() => { if (tail === t) tail = null; });
    tail = t;
    return p;
  };
  seam.land = async () => { await settle(); const g = seam.gates.shift(); if (!g) throw new Error('no staged room write is waiting'); g.open(); await settle(); return g.why; };
  seam.landAll = async () => { const out = []; for (;;) { await settle(); if (!seam.gates.length) return out; out.push(await seam.land()); } };
  return seam;
}
let current = null; // the scenario's world (run() reads its seam's invariant)
function world(mod, { immediate = false, venue = true } = {}) {
  listeners.clear(); window.__cinelight = false; window.__lighting = undefined; images.hold = false; images.queue.length = 0; fetchFail.clear();
  globalThis.__giStageTable = TABLE_9FT;
  const seam = makeSeam(); seam.immediate = immediate;
  const ahead = [];
  const shared = { uGiOn: { value: 0 }, uGiPlan: { value: null }, uGiFlank: { value: null }, uGiBounds: { value: new THREE.Vector4() },
    uGiScale: { value: 0 }, uGiIrr: { value: 0 } };
  const blobTex = new THREE.Texture(); blobTex.name = 'blob-build';
  const room = {
    floor: new THREE.Mesh(new THREE.PlaneGeometry(9, 6), new THREE.MeshStandardMaterial()),
    blob: new THREE.Mesh(new THREE.PlaneGeometry(4.6, 3.2), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true })),
    hemi: new THREE.HemisphereLight(0xffffff, 0x444444, 0.9),
  };
  // the injected venue switch (main.js's venueflag leaf): gi.setVenueShading flips it, as degradeVenue does; `venue: false` = ?venue=off
  const venueflag = { on: venue, venueShading() { return this.on; }, setVenueShading(on) { this.on = on === true; } };
  const gi = mod.createGI({ shared, venueflag, compileAhead: (objs, why) => ahead.push(why), stage: seam.lightSet });
  mod.registerBallSet([]); // the module's ball list, emptied (an earlier scenario's balls never reach this runtime)
  seam.sig = () => `${nameOf(room.floor.material.lightMap)}|${nameOf(room.blob.material.map)}`;
  current = { gi, seam, room, shared, ahead };
  return current;
}
const nameOf = (t) => (t == null ? 'none' : t.name || String(t.image?.url ?? '').replace(/^.*\//, '').replace(/\.png$/, '') || '?');
const view = (w) => ({ floor: nameOf(w.room.floor.material.lightMap), blob: nameOf(w.room.blob.material.map),
  hemi: Math.round(w.room.hemi.intensity * 1e4) / 1e4, giOn: w.shared.uGiOn.value });
const done = (w) => { const s = w.gi.state; return !!s.ready && s.appliedSeq === s.applySeq; };
const staged = (w) => w.seam.gates.map((g) => g.why).join(',');
const watch = (p) => { const r = { resolved: false, rejected: false }; p.then(() => { r.resolved = true; }, () => { r.rejected = true; }); return r; };
/** look.js applyLook('tournament'): the room regrade writes TOURNAMENT.hemi, then look.js's own re-assert statement (lifted) runs on
 * the room's hemi; rec.settled = its setLook resolved, rec.resolved = the re-assert wrote */
function pick(w, rec, { legacy = false } = {}) {
  w.room.hemi.intensity = LOOK.hemi;
  // legacy: a cached pre-rename gi.js — its manifest has no 'tournament' (that call rejects), and its requested look is the legacy id
  const gi = { setLook: (l) => { if (legacy && l === 'tournament') return Promise.reject(new Error(`no look '${l}'`));
      const p = w.gi.setLook(l); p?.then?.(() => { rec.settled = true; }, () => {}); return p; },
    get state() { return legacy ? { ...w.gi.state, requestedLook: LOOK.legacy } : w.gi.state; } };
  const hemiRef = { get intensity() { return w.room.hemi.intensity; }, set intensity(v) { w.room.hemi.intensity = v; rec.resolved = true; } };
  LOOK.run(gi, hemiRef, { hemi: { intensity: LOOK.hemi } }, globalThis);
}
/** cinelight.js installCineLight / revert, the parts gi.js meets: the snapshot, the darkened world and hemi, the announce, the private
 * env bake (w.cube = the room it photographs) and the probe-swap announce */
function studio(w) {
  const snap = { hemi: w.room.hemi.intensity, blob: w.room.blob.material.color.getHex() };
  w.room.blob.material.color.multiplyScalar(0.55); w.room.hemi.intensity = 0.05;
  window.__cinelight = true; window.dispatchEvent(new Event('ob:cinelight'));
  w.cube = view(w);
  window.dispatchEvent(new Event('ob:cinelight'));
  return () => {
    window.__cinelight = false; window.dispatchEvent(new Event('ob:cinelight'));
    w.room.hemi.intensity = snap.hemi; w.room.blob.material.color.setHex(snap.blob);
  };
}
const ball = (x, z) => ({ pocketed: false, mesh: { visible: true, position: { x, z }, material: { userData: { giSH: { value: new Float32Array(27) } } } } });
const lit = (b) => Array.from(b.mesh.material.userData.giSH.value).some((v) => v !== 0);
const J = (o) => JSON.stringify(o);
const sameRoom = (a, b) => a.floor === b.floor && a.blob === b.blob && a.hemi === b.hemi;
/** every staged room write landed while the studio window stays open (at most 8): the room after each landing */
async function landInWindow(w) {
  const out = [];
  for (let i = 0; i < 8; i++) { await settle(); if (!w.seam.gates.length) break; await w.seam.land(); out.push(view(w)); }
  return out;
}
/** a look world (ruling 741c231d): world() plus the scene look.js regrades and cinelight darkens — the room's hemi, floor and blob
 * (gi.js's refs), a fill, the lamp, the wall box, the lamp face, the cloth / rail / apron materials — a fresh look.js module, and the
 * refs main.js hands applyLook. The lighting compose and the env re-bake record the rig they ran under. The boot bind lands at once */
async function lookWorld(mod, { immediate = false, venue = true } = {}) {
  const look = await freshLook();
  const w = world(mod, { immediate: true, venue });
  const std = (color, extra) => new THREE.MeshStandardMaterial({ color, ...extra });
  const fill = new THREE.PointLight(0xffdcae, 0.3);
  const lamp = new THREE.RectAreaLight(0xfff7ec, 7, 1.2, 0.6);
  const walls = new THREE.Mesh(new THREE.BoxGeometry(9, 3, 6), std(0xcabfae, { side: THREE.BackSide }));
  const lampFace = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.6), new THREE.MeshBasicMaterial({ color: new THREE.Color(10, 9, 7.1) }));
  const mats = { clothMat: std(0x1f6b3a), woodMat: std(0x6b4a2e), apronMat: std(0x5a3c24) };
  const scene = new THREE.Scene();
  scene.add(w.room.hemi, fill, lamp, walls, lampFace, w.room.floor, w.room.blob,
    ...Object.values(mats).map((m) => new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m)));
  const lightRefs = { hemi: w.room.hemi, fill, rectLights: [lamp], walls, lampFace, floor: w.room.floor };
  const rig = () => (window.__cinelight === true ? 'studio' : 'gameplay');
  const log = { compose: [], rebake: [] };
  globalThis.__lookStage = {
    room: { lightRefs, dressing: { mode: venue ? 'class' : 'legacy' } },
    woodMap: (seed, r, g, b) => Object.assign(new THREE.Texture(), { name: `wood-${seed}-${r}-${g}-${b}` }),
    clothVisual: (mat, id, variant) => { mat.color.setHex(0x9a9ea2); mat.roughness = 0.93; mat.userData.visual = `${id}/${variant}`; },
  };
  window.__lighting = { regrade: (id) => { log.compose.push(`${id}@${rig()}`); for (const l of lightRefs.rectLights) l.intensity *= 0.9; } };
  const renderer = { toneMappingExposure: 1.05 };
  Object.assign(w, { look, scene, renderer, camera: { position: new THREE.Vector3(0, 1.6, 2.4) }, lightRefs, mats, log,
    refs: { renderer, scene, ...mats, gi: w.gi, rebakeEnv: () => log.rebake.push(rig()) }, post: { falloff: 0.46, bloom: 0.35 } });
  await w.gi.load('default', { room: w.room });
  w.seam.immediate = immediate;
  return w;
}
/** a pick the way main.js's __test.setLook makes it (main.js:2975-2988, the path of every app pick): applyLook, then on a truthy return
 * for 'tournament' the vignette falloff 0.62 and the bloom 0.03, written at once (cinelight does not snapshot them) */
function setLook(w, name, refs = w.refs) {
  const ok = w.look.applyLook(name, refs);
  if (ok && name === 'tournament') { w.post.falloff = 0.62; w.post.bloom = 0.03; }
  return ok;
}
/** the real cinelight.js rig over a look world (no cube camera: one announce at the install; the revert announces first, then restores) */
const cine = (w) => { const h = CINE.installCineLight({ scene: w.scene, renderer: w.renderer, camera: w.camera }); return () => h.revert(); };
/** the full look state, exact values: the material colours (and what the regrade writes beside them), lamp / fill / hemi intensity and
 * colour, the exposure, the GI maps, and the rig each lighting compose and env re-bake ran under */
function lookState(w) {
  const c = (col) => col.toArray();
  const { hemi, fill, rectLights, walls, lampFace, floor } = w.lightRefs; const { clothMat, woodMat, apronMat } = w.mats;
  return {
    cloth: [c(clothMat.color), clothMat.roughness, clothMat.userData.visual ?? null],
    wood: [c(woodMat.color), woodMat.map?.name ?? null], apron: [c(apronMat.color), apronMat.map?.name ?? null],
    walls: [c(walls.material.color), walls.material.envMapIntensity], lampFace: c(lampFace.material.color), floor: c(floor.material.color),
    hemi: [hemi.intensity, c(hemi.color), c(hemi.groundColor)], fill: [fill.intensity, c(fill.color)],
    lamp: rectLights.map((l) => [l.intensity, c(l.color)]), exposure: w.renderer.toneMappingExposure,
    gi: [nameOf(floor.material.lightMap), nameOf(w.room.blob.material.map), c(w.room.blob.material.color), w.room.blob.material.opacity,
      w.shared.uGiOn.value, w.gi.state.look, w.gi.state.requestedLook],
    compose: w.log.compose.join(','), rebake: w.log.rebake.join(','), post: [w.post.falloff, w.post.bloom],
  };
}
/** the keys where `got` is not `want`, each with both values */
const lookOff = (want, got) => Object.keys(want).filter((k) => J(want[k]) !== J(got[k])).map((k) => `${k} ${J(got[k])} (want ${J(want[k])})`);
/** what moved between two looks inside one window — main.js's own vignette and bloom (`post`) land at once there (main.js is unchanged by
 * ruling 741c231d; cinelight does not snapshot them), so they are left to the end-state comparison */
const lookMoved = (a, b) => Object.keys(a).filter((k) => k !== 'post' && J(a[k]) !== J(b[k]));
/** the no-export reference: the same boot, the picks made with no studio window, every staged write landed */
async function lookRef(mod, opts, picks) {
  const w = await lookWorld(mod, opts);
  for (const p of picks) setLook(w, p);
  await settle(); await w.seam.landAll(); await settle();
  if (w.seam.unlinked.length) throw new Error(`the no-export reference: ${w.seam.unlinked.join('; ')}`);
  return lookState(w);
}
const cineListeners = () => (listeners.get('ob:cinelight') ?? []).length;
/** LX / LXoff: Tournament picked inside the window, on the staged and the synchronous seam — nothing in the window moves, and after the
 * revert the look is the no-export pick's */
async function lookInWindow(mod, venue) {
  const rows = [];
  for (const immediate of [false, true]) {
    const want = await lookRef(mod, { immediate, venue }, ['tournament']);
    const w = await lookWorld(mod, { immediate, venue });
    const close = cine(w);
    const open = lookState(w);
    const ok = setLook(w, 'tournament');
    await settle();
    const moved = lookMoved(open, lookState(w));
    close();
    await settle(); await w.seam.landAll(); await settle();
    rows.push({ seam: immediate ? 'sync' : 'staged', ok, moved, off: lookOff(want, lookState(w)) });
  }
  const pass = rows.every((r) => r.ok === true && !r.moved.length && !r.off.length);
  return { pass, detail: rows.map((r) => `${r.seam} seam: applyLook ${r.ok}; moved inside the window [${r.moved}]; after the revert, off the no-export pick [${r.off.join('; ')}]`).join(' | ') };
}

const SCENARIOS = {
  async R1(mod) {
    const w = world(mod);
    w.gi.load('default', { room: w.room }).catch(() => {});
    await settle();
    const st = staged(w);
    const rec = { resolved: false };
    pick(w, rec);
    await settle();
    const hemis = [];
    for (;;) { await settle(); if (!w.seam.gates.length) break; await w.seam.land(); hemis.push(w.room.hemi.intensity); }
    await settle();
    const v = view(w);
    const pass = st === 'gi-bind' && hemis.length > 0 && hemis.every((h) => h === 1.25) && v.hemi === 1.25 && v.floor === 'gi-t-floor'
      && v.blob === 'gi-t-shadow' && w.gi.state.look === 'tournament' && done(w) && rec.resolved;
    return { pass, detail: `staged at the pick [${st}]; hemi after each landing ${J(hemis)}; end ${J(v)} look ${w.gi.state.look} done ${done(w)} re-asserted ${rec.resolved}` };
  },
  async R1b(mod) {
    const w = world(mod);
    try {
      w.gi.load('default', { room: w.room }).catch(() => {});
      await settle();
      images.hold = true;
      const rec = { resolved: false };
      pick(w, rec);
      await settle();
      await w.seam.land();
      const atLanding = view(w);
      releaseImages();
      await w.seam.landAll();
      await settle();
      const v = view(w);
      const pass = atLanding.hemi === 1.25 && atLanding.floor === 'none' && v.hemi === 1.25 && v.floor === 'gi-t-floor' && done(w) && rec.resolved;
      return { pass, detail: `the default stage landed while the tournament maps loaded: ${J(atLanding)}; end ${J(v)} done ${done(w)}` };
    } finally { releaseImages(); }
  },
  async R1c(mod) {
    const w = world(mod, { immediate: true });
    await w.gi.load('default', { room: w.room });
    w.seam.immediate = false;
    const rec = { resolved: false };
    pick(w, rec);
    await settle();
    const again = watch(w.gi.setLook('tournament'));
    await settle();
    const before = { staged: w.seam.gates.length, resolved: rec.resolved, again: again.resolved, done: done(w), seqOpen: w.gi.probeState().seqOpen };
    await w.seam.landAll();
    await settle();
    const after = { resolved: rec.resolved, again: again.resolved, done: done(w), seqOpen: w.gi.probeState().seqOpen, ...view(w) };
    const pass = before.staged === 1 && !before.resolved && !before.again && !before.done && before.seqOpen
      && after.resolved && after.again && after.done && !after.seqOpen && after.hemi === 1.25 && after.floor === 'gi-t-floor';
    return { pass, detail: `while the tournament bind waited ${J(before)}; after it landed ${J(after)}` };
  },
  async R2(mod) {
    const w = world(mod);
    w.gi.load('default', { room: w.room }).catch(() => {});
    await settle();
    const st = staged(w);
    const close = studio(w);
    await w.seam.land();
    const inWindow = { ...view(w), suspended: w.gi.state.roomSuspended };
    close();
    await w.seam.landAll();
    await settle();
    const end = { ...view(w), suspended: w.gi.state.roomSuspended };
    const pass = st === 'gi-bind' && inWindow.floor === 'none' && inWindow.blob === 'blob-build' && inWindow.hemi === 0.05 && inWindow.suspended
      && inWindow.giOn === 0 && end.floor === 'gi-d-floor' && end.blob === 'gi-d-shadow' && end.hemi === 0.45 && !end.suspended && end.giOn === 1 && done(w);
    return { pass, detail: `staged [${st}]; landed inside the studio window ${J(inWindow)}; after the revert ${J(end)} done ${done(w)}` };
  },
  async R2b(mod) {
    const w = world(mod, { immediate: true });
    await w.gi.load('default', { room: w.room });
    w.seam.immediate = false;
    const fx = watch(w.gi.setFixture('hall_sconce'));
    await settle();
    const st = staged(w);
    const waiting = { done: done(w), resolved: fx.resolved };
    const close = studio(w);
    await w.seam.land();
    const inWindow = view(w);
    close();
    await w.seam.landAll();
    await settle();
    const s = w.gi.state;
    const end = { ...view(w), suspended: s.roomSuspended, hemiRestorePending: s.hemiRestorePending, resolved: fx.resolved };
    const pass = st === 'gi-restore' && !waiting.done && !waiting.resolved && inWindow.floor === 'none' && inWindow.blob === 'blob-build'
      && inWindow.hemi === 0.05 && end.floor === 'none' && end.blob === 'blob-build' && end.hemi === 0.9 && !end.suspended && !end.hemiRestorePending
      && end.resolved && done(w);
    return { pass, detail: `staged [${st}], while it waited ${J(waiting)}; landed inside the studio window ${J(inWindow)}; after the revert ${J(end)} done ${done(w)}` };
  },
  async R3(mod) {
    const w = world(mod, { immediate: true });
    await w.gi.load('default', { room: w.room });
    w.seam.immediate = false;
    w.gi.setFixture('hall_sconce').catch(() => {});
    await settle();
    const st = staged(w);
    const fx = watch(w.gi.setFixture('wall_sconce'));
    await settle();
    const waiting = { done: done(w), resolved: fx.resolved };
    const landed = await w.seam.landAll();
    await settle();
    const v = view(w);
    const pass = st === 'gi-restore' && !waiting.done && !waiting.resolved && v.floor === 'none' && v.blob === 'blob-build' && v.hemi === 0.9
      && w.gi.state.fixture === 'wall_sconce' && fx.resolved && done(w);
    return { pass, detail: `staged [${st}], then a newer apply, which waited ${J(waiting)}; landed [${landed}]; end ${J(v)} fixture ${w.gi.state.fixture} done ${done(w)}` };
  },
  async R4(mod) {
    const w = world(mod, { immediate: true });
    await w.gi.load('default', { room: w.room });
    w.seam.immediate = false;
    globalThis.__giStageTable = { id: 'stub_12ft', kernel: { length: 3.569, width: 1.778 } }; // no committed class fits
    const tc = watch(w.gi.tableChanged());
    await settle();
    const st = staged(w);
    const waiting = { done: done(w), resolved: tc.resolved };
    await w.seam.landAll();
    await settle();
    const v = view(w);
    const pass = st === 'gi-restore' && !waiting.done && !waiting.resolved && v.floor === 'none' && v.blob === 'blob-build' && v.hemi === 0.9
      && w.gi.state.fits === false && tc.resolved && done(w);
    return { pass, detail: `the footprint gate staged [${st}], while it waited ${J(waiting)}; end ${J(v)} fits ${w.gi.state.fits} done ${done(w)}` };
  },
  async F1(mod) {
    const w = world(mod, { immediate: true });
    try {
      await w.gi.load('default', { room: w.room });
      w.seam.immediate = false;
      images.hold = true;
      const rec = { resolved: false };
      pick(w, rec);
      await settle();
      w.gi.setFixture('hall_sconce').catch(() => {});
      await settle();
      const st = staged(w);
      releaseImages();
      await settle();
      const reasserted = rec.resolved;
      await w.seam.landAll();
      await settle();
      const v = view(w);
      const pass = st === 'gi-restore' && reasserted && v.hemi === 1.25 && v.floor === 'none' && v.blob === 'blob-build' && done(w);
      return { pass, detail: `the pick's apply superseded by a fixture change whose restore staged [${st}]; re-asserted before it landed ${reasserted}; end ${J(v)} done ${done(w)}` };
    } finally { releaseImages(); }
  },
  async F1s(mod) {
    const w = world(mod, { immediate: true });
    try {
      await w.gi.load('default', { room: w.room });
      w.seam.immediate = false;
      images.hold = true;
      const rec = { resolved: false };
      pick(w, rec);
      await settle();
      w.gi.setFixture('hall_sconce').catch(() => {});
      await settle();
      releaseImages();
      await settle();
      const reasserted = rec.resolved;
      const close = studio(w);
      await w.seam.land();
      const inWindow = view(w);
      close();
      await w.seam.landAll();
      await settle();
      const s = w.gi.state;
      const v = { ...view(w), hemiRestorePending: s.hemiRestorePending, suspended: s.roomSuspended };
      const pass = reasserted && inWindow.hemi === 0.05 && inWindow.floor === 'none' && v.hemi === 1.25 && v.floor === 'none' && !v.hemiRestorePending
        && !v.suspended && done(w);
      return { pass, detail: `re-asserted ${reasserted}; the restore landed inside the studio window ${J(inWindow)}; after the revert ${J(v)} done ${done(w)}` };
    } finally { releaseImages(); }
  },
  async BL(mod) {
    const w = world(mod, { immediate: true });
    const balls = [ball(0.3, 0.2), ball(-0.4, 0.1)];
    try {
      mod.registerBallSet(balls);
      await w.gi.load('default', { room: w.room });
      const atBoot = balls.every(lit);
      w.seam.immediate = false;
      w.gi.setFixture('pendant_bar').catch(() => {});
      await settle();
      const waiting = { staged: staged(w), giOn: w.shared.uGiOn.value, lit: balls.every(lit) };
      await w.seam.landAll();
      await settle();
      const end = { lit: balls.every(lit), floor: view(w).floor, done: done(w) };
      const pass = atBoot && waiting.giOn === 1 && waiting.lit && end.lit && end.floor === 'gi-pd-floor' && end.done;
      return { pass, detail: `lit at the boot ${atBoot}; while the pendant bind waited ${J(waiting)}; end ${J(end)}` };
    } finally { mod.registerBallSet([]); }
  },
  async ER(mod) {
    const w = world(mod, { immediate: true });
    await w.gi.load('default', { room: w.room });
    w.seam.immediate = false;
    fetchFail.add('gi-pd-probes.json');
    const fx = watch(w.gi.setFixture('pendant_bar'));
    await settle();
    const s = w.gi.state;
    const waiting = { staged: staged(w), loadError: s.loadError, settled: s.appliedSeq === s.applySeq, rejected: fx.rejected };
    await w.seam.landAll();
    await settle();
    const end = { loadError: typeof s.loadError, settled: s.appliedSeq === s.applySeq, rejected: fx.rejected, ...view(w) };
    const pass = waiting.staged === 'gi-restore' && waiting.loadError === null && !waiting.settled && !waiting.rejected
      && end.loadError === 'string' && end.settled && end.rejected && end.floor === 'none' && end.hemi === 0.9;
    return { pass, detail: `the pendant probes rejected with the restore staged: ${J(waiting)}; after it landed ${J(end)}` };
  },
  async CX(mod) {
    const w = world(mod, { immediate: true });
    await w.gi.load('default', { room: w.room });
    w.seam.immediate = false;
    const rec = { resolved: false, settled: false };
    pick(w, rec);
    await settle();
    const st = staged(w);
    const pending = { settled: rec.settled, resolved: rec.resolved }; // the window must open before setLook resolves
    const close = studio(w);
    await w.seam.land();
    const inWindow = { hemi: w.room.hemi.intensity, settled: rec.settled, floor: view(w).floor };
    close();
    await w.seam.landAll();
    await settle();
    const v = view(w);
    const pass = st === 'gi-bind' && !pending.settled && !pending.resolved && inWindow.settled && inWindow.hemi === 0.05 && inWindow.floor === 'none'
      && v.hemi === 1.25 && v.floor === 'gi-t-floor' && done(w);
    return { pass, detail: `the pick's bind staged [${st}], setLook pending at the window ${J(pending)}; it landed inside the studio window, where setLook resolved: ${J(inWindow)}; after the revert ${J(v)} done ${done(w)}` };
  },
  async P22(mod) {
    const w = world(mod, { immediate: true });
    try {
      await w.gi.load('default', { room: w.room });
      w.seam.immediate = false;
      images.hold = true;
      const rec = { resolved: false, settled: false };
      pick(w, rec);
      await settle();
      const pending = { settled: rec.settled, resolved: rec.resolved }; // the window must open before setLook resolves
      const close = studio(w);
      releaseImages();
      await settle();
      const inWindow = { hemi: w.room.hemi.intensity, settled: rec.settled, floor: view(w).floor, staged: staged(w) };
      close();
      await w.seam.landAll();
      await settle();
      const v = view(w);
      const pass = !pending.settled && !pending.resolved && inWindow.settled && inWindow.hemi === 0.05 && inWindow.floor === 'none' && inWindow.staged === ''
        && v.hemi === 1.25 && v.floor === 'gi-t-floor' && done(w);
      return { pass, detail: `setLook pending at the window ${J(pending)}; the pick's maps arrived inside the studio window (the keep path), where setLook resolved: ${J(inWindow)}; after the revert ${J(v)} done ${done(w)}` };
    } finally { releaseImages(); }
  },
  async RC(mod) {
    const w = world(mod, { immediate: true });
    await w.gi.load('default', { room: w.room });
    w.seam.immediate = false;
    const fx = watch(w.gi.setFixture('hall_sconce'));
    await settle();
    const st = staged(w);
    const close = studio(w);
    const atOpen = { ...view(w), suspended: w.gi.state.roomSuspended };
    const cube = w.cube;
    const landed = await landInWindow(w);
    close();
    await w.seam.landAll();
    await settle();
    const s = w.gi.state;
    const end = { ...view(w), suspended: s.roomSuspended, hemiRestorePending: s.hemiRestorePending, resolved: fx.resolved };
    const pass = st === 'gi-restore' && atOpen.floor === 'none' && atOpen.blob === 'blob-build' && atOpen.hemi === 0.05 && atOpen.suspended
      && sameRoom(cube, atOpen) && landed.length === 1 && landed.every((v) => sameRoom(v, atOpen))
      && end.floor === 'none' && end.blob === 'blob-build' && end.hemi === 0.9 && !end.suspended && !end.hemiRestorePending && end.resolved && done(w);
    return { pass, detail: `the restore staged [${st}] when the window opened: at the open, before it landed ${J(atOpen)}; the private cube saw ${J(cube)}; inside the window after each landing ${J(landed)}; after the revert ${J(end)} done ${done(w)}` };
  },
  async RC2(mod) {
    const w = world(mod, { immediate: true });
    await w.gi.load('default', { room: w.room });
    w.seam.immediate = false;
    fetchFail.add('gi-t-probes.json');
    const lk = watch(w.gi.setLook('tournament')); // the same bake key: the failure's fallback stages the restore
    await settle();
    const st = staged(w);
    const close = studio(w);
    const atOpen = { ...view(w), suspended: w.gi.state.roomSuspended };
    close();
    await settle();
    const atClose = { staged: staged(w), ...view(w) };
    await w.seam.landAll();
    await settle();
    const s = w.gi.state;
    const end = { ...view(w), suspended: s.roomSuspended, hemiRestorePending: s.hemiRestorePending, loadError: typeof s.loadError, rejected: lk.rejected };
    const pass = st === 'gi-restore' && atOpen.floor === 'none' && atOpen.blob === 'blob-build' && atOpen.hemi === 0.05 && atOpen.suspended
      && atClose.staged === 'gi-restore' && atClose.floor === 'none' && end.floor === 'none' && end.blob === 'blob-build' && end.hemi === 0.9
      && !end.suspended && !end.hemiRestorePending && end.loadError === 'string' && end.rejected && s.appliedSeq === s.applySeq;
    return { pass, detail: `a failed tournament apply's restore staged [${st}] when the window opened: at the open ${J(atOpen)}; the window closed before it landed ${J(atClose)}; after it landed ${J(end)}` };
  },
  async D1(mod) {
    const w = world(mod, { venue: false });
    w.gi.load('default', { room: w.room }).catch(() => {});
    await settle();
    const st = staged(w);
    const close = studio(w);
    const atOpen = view(w);
    const landed = await landInWindow(w);
    close();
    await w.seam.landAll();
    await settle();
    const s = w.gi.state;
    const end = { ...view(w), hemiDimmed: s.hemiDimmed, suspended: s.roomSuspended };
    const pass = st === 'gi-bind' && atOpen.floor === 'none' && atOpen.blob === 'blob-build' && atOpen.hemi === 0.05 && atOpen.giOn === 1
      && landed.length === 1 && landed.every((v) => sameRoom(v, atOpen))
      && end.floor === 'gi-d-floor' && end.blob === 'gi-d-shadow' && end.hemi === 0.45 && end.hemiDimmed && !end.suspended && end.giOn === 1 && done(w);
    return { pass, detail: `?venue=off: the boot bind staged [${st}] when the window opened ${J(atOpen)}; inside the window after each landing ${J(landed)}; after the revert ${J(end)} done ${done(w)}` };
  },
  async D2(mod) {
    const w = world(mod, { immediate: true });
    await w.gi.load('default', { room: w.room });
    const venue = w.gi.setVenueShading(false); // the call degradeVenue makes into gi (main.js): the rig rule is off from here
    w.seam.immediate = false;
    const fx = watch(w.gi.setFixture('pendant_bar'));
    await settle();
    const st = staged(w);
    const close = studio(w);
    const atOpen = view(w);
    const landed = await landInWindow(w);
    close();
    await w.seam.landAll();
    await settle();
    const s = w.gi.state;
    const end = { ...view(w), hemiDimmed: s.hemiDimmed, suspended: s.roomSuspended, resolved: fx.resolved };
    const pass = venue === false && st === 'gi-restore' && atOpen.floor === 'gi-d-floor' && atOpen.blob === 'gi-d-shadow' && atOpen.hemi === 0.05
      && landed.length === 2 && landed.every((v) => sameRoom(v, atOpen))
      && end.floor === 'gi-pd-floor' && end.blob === 'gi-pd-shadow' && end.hemi === 0.45 && end.hemiDimmed && !end.suspended && end.resolved && done(w);
    return { pass, detail: `degraded (venue ${venue}); the pendant change staged [${st}] when the window opened ${J(atOpen)}; inside the window after each landing ${J(landed)}; after the revert ${J(end)} done ${done(w)}` };
  },
  async D2w(mod) {
    const w = world(mod, { immediate: true });
    await w.gi.load('default', { room: w.room });
    w.seam.immediate = false;
    const close = studio(w);
    const atOpen = { ...view(w), suspended: w.gi.state.roomSuspended };
    const venue = w.gi.setVenueShading(false); // the degrade, reached inside the window
    await settle();
    const inWindow = { staged: staged(w), ...view(w) };
    const landed = await landInWindow(w);
    close();
    await w.seam.landAll();
    await settle();
    const end = { ...view(w), suspended: w.gi.state.roomSuspended };
    const pass = venue === false && atOpen.suspended && atOpen.floor === 'none' && atOpen.blob === 'blob-build' && atOpen.giOn === 0
      && inWindow.staged === '' && sameRoom(inWindow, atOpen) && inWindow.giOn === 1 && landed.length === 0
      && end.floor === 'gi-d-floor' && end.blob === 'gi-d-shadow' && end.hemi === 0.45 && !end.suspended && end.giOn === 1 && done(w);
    return { pass, detail: `the window opened on the bound bake ${J(atOpen)}; degraded inside it (venue ${venue}): ${J(inWindow)}; landed there ${J(landed)}; after the revert ${J(end)} done ${done(w)}` };
  },
  async DR(mod) {
    const w = world(mod, { immediate: true, venue: false });
    await w.gi.load('default', { room: w.room });
    w.seam.immediate = false;
    const fx = watch(w.gi.setFixture('hall_sconce'));
    await settle();
    const st = staged(w);
    const close = studio(w);
    const atOpen = view(w);
    const landed = await landInWindow(w);
    close();
    await settle();
    const atClose = staged(w);
    await w.seam.landAll();
    await settle();
    const s = w.gi.state;
    const end = { ...view(w), suspended: s.roomSuspended, hemiRestorePending: s.hemiRestorePending, resolved: fx.resolved };
    const pass = st === 'gi-restore' && atOpen.floor === 'gi-d-floor' && atOpen.blob === 'gi-d-shadow' && atOpen.hemi === 0.05
      && landed.length === 1 && landed.every((v) => sameRoom(v, atOpen)) && atClose === 'gi-restore'
      && end.floor === 'none' && end.blob === 'blob-build' && end.hemi === 0.9 && !end.suspended && !end.hemiRestorePending && end.resolved && done(w);
    return { pass, detail: `?venue=off: the restore staged [${st}] when the window opened ${J(atOpen)}; inside the window after each landing ${J(landed)}; staged after the revert [${atClose}]; end ${J(end)} done ${done(w)}` };
  },
  async D3(mod) {
    const w = world(mod, { immediate: true, venue: false });
    try {
      await w.gi.load('default', { room: w.room });
      images.hold = true;
      const rec = { resolved: false, settled: false };
      pick(w, rec);
      await settle();
      const close = studio(w);
      const atOpen = view(w);
      releaseImages();
      await settle();
      const inWindow = { ...view(w), settled: rec.settled };
      close();
      await w.seam.landAll();
      await settle();
      const v = { ...view(w), suspended: w.gi.state.roomSuspended };
      const pass = atOpen.floor === 'gi-d-floor' && atOpen.hemi === 0.05 && inWindow.settled && sameRoom(inWindow, atOpen)
        && v.floor === 'gi-t-floor' && v.blob === 'gi-t-shadow' && v.hemi === 1.25 && !v.suspended && done(w);
      return { pass, detail: `a synchronous seam, ?venue=off: the pick's maps arrived inside the studio window ${J(inWindow)} (at the open ${J(atOpen)}); after the revert ${J(v)} done ${done(w)}` };
    } finally { releaseImages(); }
  },
  async D3f(mod) {
    const w = world(mod, { immediate: true, venue: false });
    try {
      await w.gi.load('default', { room: w.room });
      images.hold = true;
      const fx = watch(w.gi.setFixture('pendant_bar')); // canopy -> pendant: its restore lands at once, before the window
      await settle();
      const close = studio(w);
      const atOpen = view(w);
      releaseImages();
      await settle();
      const inWindow = view(w);
      close();
      await w.seam.landAll();
      await settle();
      const s = w.gi.state;
      const v = { ...view(w), suspended: s.roomSuspended, hemiDimmed: s.hemiDimmed, resolved: fx.resolved };
      const pass = atOpen.floor === 'none' && atOpen.hemi === 0.05 && sameRoom(inWindow, atOpen)
        && v.floor === 'gi-pd-floor' && v.blob === 'gi-pd-shadow' && v.hemi === 0.45 && v.hemiDimmed && !v.suspended && v.resolved && done(w);
      return { pass, detail: `a synchronous seam, ?venue=off, canopy -> pendant: the pendant maps arrived inside the studio window ${J(inWindow)} (at the open ${J(atOpen)}); after the revert ${J(v)} done ${done(w)}` };
    } finally { releaseImages(); }
  },
  async D4(mod) {
    const w = world(mod, { immediate: true, venue: false });
    try {
      await w.gi.load('default', { room: w.room, fixture: 'hall_sconce' }); // no committed bake: nothing bound, no build values taken
      w.seam.immediate = false;
      images.hold = true;
      const fx = watch(w.gi.setFixture('pendant_bar'));
      await settle();
      const close = studio(w);
      const atOpen = view(w);
      releaseImages();
      const landed = await landInWindow(w);
      const inWindow = { ...view(w), hemiBase: w.gi.state.hemiBase ?? null };
      close();
      await w.seam.landAll();
      await settle();
      const s = w.gi.state;
      const end = { ...view(w), hemiBase: s.hemiBase, blobBase: s.roomBase ? s.roomBase.blobColor.toString(16) : null, resolved: fx.resolved };
      const pass = atOpen.floor === 'none' && atOpen.hemi === 0.05 && sameRoom(inWindow, atOpen) && landed.every((v) => sameRoom(v, atOpen))
        && inWindow.hemiBase === null && end.floor === 'gi-pd-floor' && end.blob === 'gi-pd-shadow' && end.hemi === 0.45 && end.hemiBase === 0.9
        && end.blobBase === 'ffffff' && end.resolved && done(w);
      return { pass, detail: `?venue=off, nothing bound at the boot (hall_sconce): the pendant maps arrived inside the studio window ${J(inWindow)}, landings there ${J(landed)}; after the revert ${J(end)} done ${done(w)}` };
    } finally { releaseImages(); }
  },
  async TX(mod) {
    const w = world(mod, { immediate: true, venue: false });
    await w.gi.load('default', { room: w.room });
    w.seam.immediate = false;
    const close = studio(w);
    const rec = { resolved: false, settled: false };
    pick(w, rec); // the Tournament regrade starts after installCineLight
    await settle();
    const inWindow = { settled: rec.settled, floor: view(w).floor };
    close();
    await settle();
    const afterClose = view(w).hemi;
    await w.seam.landAll();
    await settle();
    const v = view(w);
    const pass = afterClose === 1.25 && v.floor === 'gi-t-floor' && v.blob === 'gi-t-shadow' && v.hemi === 1.25 && done(w);
    return { pass, detail: `?venue=off, async seam: the pick made inside the studio window ${J(inWindow)}; hemi after the revert ${afterClose}; end ${J(v)} done ${done(w)}` };
  },
  async TXr(mod) {
    const w = world(mod, { immediate: true });
    await w.gi.load('default', { room: w.room });
    w.seam.immediate = false;
    const close = studio(w);
    const rec = { resolved: false, settled: false };
    pick(w, rec);
    await settle();
    const inWindow = { settled: rec.settled, floor: view(w).floor };
    close();
    await settle();
    const afterClose = view(w).hemi;
    await w.seam.landAll();
    await settle();
    const v = view(w);
    const pass = afterClose === 1.25 && v.floor === 'gi-t-floor' && v.blob === 'gi-t-shadow' && v.hemi === 1.25 && done(w);
    return { pass, detail: `the rule on: the pick made inside the studio window ${J(inWindow)}; hemi after the revert ${afterClose}; end ${J(v)} done ${done(w)}` };
  },
  async TXd(mod) {
    const w = world(mod, { immediate: true });
    try {
      await w.gi.load('default', { room: w.room });
      w.seam.immediate = false;
      images.hold = true;
      const close = studio(w);
      const rec = { resolved: false, settled: false };
      pick(w, rec); // Tournament inside the window, its maps still loading
      await settle();
      w.room.hemi.intensity = 0.9; // then Default (look.js's regrade) before the window closes
      const dp = watch(w.gi.setLook('default'));
      releaseImages();
      await settle();
      const inWindow = { tournamentSettled: rec.settled, defaultResolved: dp.resolved };
      close();
      await settle();
      const afterClose = view(w).hemi;
      await w.seam.landAll();
      await settle();
      const v = view(w);
      const pass = inWindow.tournamentSettled && afterClose === 0.45 && v.hemi === 0.45 && v.floor === 'gi-d-floor' && w.gi.state.look === 'default' && done(w);
      return { pass, detail: `Tournament then Default inside the studio window ${J(inWindow)}; hemi after the revert ${afterClose}; end ${J(v)} look ${w.gi.state.look} done ${done(w)}` };
    } finally { releaseImages(); }
  },
  async PA(mod) {
    const w = world(mod, { immediate: true, venue: false });
    await w.gi.load('default', { room: w.room });
    w.seam.immediate = false;
    const fx = watch(w.gi.setFixture('pendant_bar')); // its restore, then its bind queued behind it
    await settle();
    const st = staged(w);
    const close = studio(w);
    await w.seam.land(); // the restore lands inside the window; the bind's compile pass runs there
    const inWindow = { staged: staged(w), ...view(w) };
    close();
    await settle();
    const stale = await w.seam.land(); // that bind's real apply, after the close
    const afterStale = view(w);
    await w.seam.landAll(); // the resume's fresh submission
    await settle();
    const v = view(w);
    const pass = st === 'gi-restore' && inWindow.staged === 'gi-bind' && stale === 'gi-bind' && afterStale.floor === 'gi-d-floor'
      && v.floor === 'gi-pd-floor' && v.blob === 'gi-pd-shadow' && v.hemi === 0.45 && fx.resolved && done(w);
    return { pass, detail: `?venue=off: staged [${st}]; inside the window the bind compiled ${J(inWindow)}; its real apply after the close left ${J(afterStale)}; end ${J(v)} done ${done(w)}` };
  },
  async PAon(mod) {
    const w = world(mod, { immediate: true });
    await w.gi.load('default', { room: w.room });
    w.seam.immediate = false;
    const fx = watch(w.gi.setFixture('pendant_bar'));
    await settle();
    const st = staged(w);
    const close = studio(w);
    await w.seam.land();
    const inWindow = { staged: staged(w), ...view(w) };
    close();
    await settle();
    const stale = await w.seam.land();
    const afterStale = view(w);
    await w.seam.landAll();
    await settle();
    const v = view(w);
    const pass = st === 'gi-restore' && inWindow.staged === 'gi-bind' && inWindow.floor === 'none' && stale === 'gi-bind' && afterStale.floor === 'none'
      && v.floor === 'gi-pd-floor' && v.blob === 'gi-pd-shadow' && v.hemi === 0.45 && fx.resolved && done(w);
    return { pass, detail: `the rule on: staged [${st}]; inside the window the bind compiled ${J(inWindow)}; its real apply after the close left ${J(afterStale)}; end ${J(v)} done ${done(w)}` };
  },
  async PAr(mod) {
    const w = world(mod, { immediate: true, venue: false });
    await w.gi.load('default', { room: w.room });
    w.seam.immediate = false;
    w.gi.setLook('tournament').catch(() => {}); // its bind is staged
    await settle();
    globalThis.__giStageTable = { id: 'stub_12ft', kernel: { length: 3.569, width: 1.778 } }; // then a table no class fits
    const tc = watch(w.gi.tableChanged()); // its restore waits behind the bind
    await settle();
    const st = staged(w);
    const close = studio(w);
    await w.seam.land(); // the (stale) bind lands inside the window; the restore's compile pass runs there
    const inWindow = { staged: staged(w), ...view(w) };
    close();
    await settle();
    const stale = await w.seam.land(); // that restore's real apply, after the close
    const afterStale = view(w);
    await w.seam.landAll(); // the resume's fresh restore
    await settle();
    const v = view(w);
    const pass = st === 'gi-bind' && inWindow.staged === 'gi-restore' && stale === 'gi-restore' && afterStale.floor === 'gi-d-floor'
      && v.floor === 'none' && v.blob === 'blob-build' && v.hemi === 0.45 && w.gi.state.fits === false && tc.resolved && done(w);
    return { pass, detail: `?venue=off: staged [${st}]; inside the window the restore compiled ${J(inWindow)}; its real apply after the close left ${J(afterStale)}; end ${J(v)} fits ${w.gi.state.fits} done ${done(w)}` };
  },
  async PBl(mod) {
    const w = world(mod, { immediate: true });
    await w.gi.load('default', { room: w.room });
    w.seam.immediate = false;
    const close1 = studio(w);
    const rec = { resolved: false, settled: false };
    pick(w, rec); // Tournament inside the first window: setLook resolves there, the re-assert waits for the close
    await settle();
    close1();
    const close2 = studio(w); // the next export installs synchronously after the revert
    await settle();
    const inWindow2 = view(w).hemi;
    close2();
    await settle();
    const afterClose2 = view(w).hemi;
    await w.seam.landAll();
    await settle();
    const v = view(w);
    const pass = rec.settled && inWindow2 === 0.05 && afterClose2 === 1.25 && v.hemi === 1.25 && v.floor === 'gi-t-floor' && done(w);
    return { pass, detail: `the pick resolved in the first window ${rec.settled}; hemi inside the second window ${inWindow2}; after its revert ${afterClose2}; end ${J(v)} done ${done(w)}` };
  },
  async SPX(mod) {
    const w = world(mod, { immediate: true });
    await w.gi.load('default', { room: w.room });
    w.seam.immediate = false;
    const close = studio(w);
    const rec = { resolved: false, settled: false };
    pick(w, rec, { legacy: true });
    await settle();
    close();
    await settle();
    const afterClose = view(w).hemi;
    await w.seam.landAll();
    await settle();
    const v = view(w);
    const pass = LOOK.legacy !== null && rec.settled && afterClose === 1.25 && v.hemi === 1.25 && v.floor === 'gi-t-floor' && done(w);
    return { pass, detail: `the legacy branch (${LOOK.legacy}) resolved inside the window ${rec.settled}; hemi after the revert ${afterClose}; end ${J(v)} done ${done(w)}` };
  },
  async PBg(mod) {
    const w = world(mod);
    w.gi.load('default', { room: w.room }).catch(() => {});
    await settle();
    const close1 = studio(w);
    await w.seam.land(); // the boot bind lands inside the first window: kept
    close1();
    const close2 = studio(w); // the next export installs synchronously after the revert
    await settle();
    const inWindow2 = { staged: staged(w), ...view(w), suspended: w.gi.state.roomSuspended };
    close2();
    await w.seam.landAll();
    await settle();
    const v = { ...view(w), suspended: w.gi.state.roomSuspended };
    const pass = inWindow2.staged === '' && inWindow2.floor === 'none' && inWindow2.suspended
      && v.floor === 'gi-d-floor' && v.blob === 'gi-d-shadow' && v.hemi === 0.45 && !v.suspended && done(w);
    return { pass, detail: `the second window opened before the first close's microtasks: ${J(inWindow2)}; after its revert ${J(v)} done ${done(w)}` };
  },
  async SK(mod) {
    // the rule off: a fixture change whose restore is still staged, then a same-key Tournament apply that fails (its restore removes the
    // pendant bind just made), then an export: the older restore declines inside the window, and the close must not re-bind the removed bind
    const w = world(mod, { immediate: true, venue: false });
    await w.gi.load('default', { room: w.room });
    w.seam.immediate = false;
    w.gi.setFixture('pendant_bar').catch(() => {});
    await settle();
    fetchFail.add('gi-pt-probes.json');
    const failed = watch(w.gi.setLook('tournament'));
    await settle();
    const before = { staged: staged(w), kept: w.gi.state.roomAssets?.key ?? null };
    const close = studio(w);
    await w.seam.land(); // the fixture change's restore lands inside the window: it declines
    const inWindow = { suspended: !!w.gi.state.roomSuspended, kept: w.gi.state.roomAssets?.key ?? null };
    close();
    await settle(); await w.seam.landAll(); await settle();
    const v = { ...view(w), baked: !!w.gi.state.roomBaked, giBound: !!w.gi.state.giBound };
    const pass = v.floor === 'none' && v.blob === 'blob-build' && v.hemi === 0.9 && !v.baked && !v.giBound && failed.rejected;
    return { pass, detail: `?venue=off: staged before the window [${before.staged}], kept ${before.kept}; inside after the older restore declined ${J(inWindow)}; end ${J(v)} the failed apply rejected ${failed.rejected}` };
  },
  async LX(mod) { return lookInWindow(mod, true); },
  async LXoff(mod) { return lookInWindow(mod, false); },
  async LX2(mod) {
    // picks inside one window: Tournament then Default, and Default then Tournament, both end as the same picks with no export (Default
    // regrades nothing, and main.js has written the tournament vignette and bloom on the Tournament's true); two Tournament picks with
    // different refs: the newest refs apply; and a Tournament pick after the revert, before its microtask (outside the window), supersedes
    // the parked one: one regrade, as one pick with no export
    const rows = [];
    const stale = () => ({ clothMat: new THREE.MeshStandardMaterial(), woodMat: new THREE.MeshStandardMaterial(), apronMat: new THREE.MeshStandardMaterial() });
    for (const [label, inside, after, want] of [
      ['tournament then default inside', ['tournament', 'default'], null, ['tournament', 'default']],
      ['default then tournament inside', ['default', 'tournament'], null, ['default', 'tournament']],
      ['tournament (other refs) then tournament inside', ['tournament*', 'tournament'], null, ['tournament']],
      ['tournament inside, tournament after the revert', ['tournament'], 'tournament', ['tournament']],
      ['tournament inside, default after the revert', ['tournament'], 'default', ['tournament', 'default']],
    ]) {
      const ref = await lookRef(mod, { venue: true }, want);
      const w = await lookWorld(mod, { venue: true });
      const close = cine(w);
      for (const p of inside) setLook(w, p.replace('*', ''), p.endsWith('*') ? { ...w.refs, ...stale() } : w.refs);
      await settle();
      close();
      if (after) setLook(w, after);
      await settle(); await w.seam.landAll(); await settle();
      rows.push({ label, off: lookOff(ref, lookState(w)) });
    }
    return { pass: rows.every((r) => !r.off.length), detail: rows.map((r) => `${r.label}: off the same picks with no export [${r.off.join('; ')}]`).join(' | ') };
  },
  async LXw(mod) {
    const rows = [];
    for (const immediate of [false, true]) {
      const want = await lookRef(mod, { immediate, venue: true }, ['tournament']);
      const w = await lookWorld(mod, { immediate, venue: true });
      const close1 = cine(w);
      setLook(w, 'tournament');
      await settle();
      close1();
      const close2 = cine(w); // the next export installs synchronously after the revert, before its microtasks run
      const open2 = lookState(w);
      await settle();
      const moved = lookMoved(open2, lookState(w));
      close2();
      await settle(); await w.seam.landAll(); await settle();
      rows.push({ seam: immediate ? 'sync' : 'staged', moved, off: lookOff(want, lookState(w)) });
    }
    return { pass: rows.every((r) => !r.moved.length && !r.off.length),
      detail: rows.map((r) => `${r.seam} seam: moved inside the second window [${r.moved}]; after its revert, off the no-export pick [${r.off.join('; ')}]`).join(' | ') };
  },
  async LXp(mod) {
    const want = await lookRef(mod, { venue: true }, ['tournament']);
    const w = await lookWorld(mod, { venue: true });
    const base = cineListeners();
    const close = cine(w);
    setLook(w, 'tournament');
    await settle();
    close();
    await settle(); await w.seam.landAll(); await settle();
    const off1 = lookOff(want, lookState(w)); const l1 = cineListeners();
    // then normal play: the next export with no pick (its resume landed) and time passing — nothing re-applies, nothing stays armed
    const close2 = cine(w);
    await settle();
    close2();
    await settle(); await w.seam.landAll(); await settle(36);
    const off2 = lookOff(want, lookState(w)); const l2 = cineListeners();
    const pass = !off1.length && !off2.length && l1 === base && l2 === base;
    return { pass, detail: `after the revert, off the no-export pick [${off1.join('; ')}], ob:cinelight listeners ${l1} (${base} before the pick); after the next export [${off2.join('; ')}], listeners ${l2}` };
  },
  async WW(mod) {
    // why look.js keeps its deferred re-assert beside the parking: the pick made before any window, its maps loading across a first
    // export (whose close re-binds gi.js's kept default bake, its dim with it: the kept set is keyed by fixture, not look) and arriving
    // inside a second one, whose snapshot then holds that dim
    const want = await lookRef(mod, { venue: true }, ['tournament']);
    const w = await lookWorld(mod, { venue: true });
    try {
      images.hold = true;
      setLook(w, 'tournament');
      await settle();
      const close1 = cine(w);
      await settle();
      close1();
      await settle(); await w.seam.landAll();
      const between = { hemi: w.room.hemi.intensity, floor: view(w).floor, done: done(w) };
      const close2 = cine(w);
      releaseImages();
      await settle();
      const inWindow = done(w);
      close2();
      await settle(); await w.seam.landAll(); await settle();
      const off = lookOff(want, lookState(w));
      const pass = between.hemi === 0.45 && between.floor === 'gi-d-floor' && !between.done && inWindow && !off.length;
      return { pass, detail: `between the exports ${J(between)}; setLook resolved inside the second ${inWindow}; after its revert, off the no-export pick [${off.join('; ')}]` };
    } finally { releaseImages(); }
  },
  async B1(mod) {
    const w = world(mod, { immediate: true });
    images.hold = true;
    const p = w.gi.load('default', { room: w.room });
    await settle();
    const held = images.queue.splice(0);
    images.hold = false;
    let ticks = -1;
    await new Promise((resolve) => setTimeout(() => {
      for (const img of held) fire(img);
      let n = 0;
      const tick = () => { if (w.gi.state.ready) { ticks = n; resolve(); return; } if (++n > 500) { resolve(); return; } queueMicrotask(tick); };
      queueMicrotask(tick);
    }, 0));
    await p;
    const v = view(w);
    const pass = held.length === 4 && ticks >= 0 && w.ahead.join(',') === 'gi-bind' && w.seam.log.join(',') === 'gi-bind:immediate'
      && v.floor === 'gi-d-floor' && v.hemi === 0.45 && done(w);
    return { pass, ticks, detail: `${held.length} lightmaps released in one task; ready after ${ticks} microtask turns; compile-ahead [${w.ahead}]; seam [${w.seam.log}]; end ${J(v)}` };
  },
};

/** an arm = one gi.js module, one lifted look.js re-assert and that look.js source; the scenarios run in sequence (LOOK and LOOKARM are
 * the arm's while they run) */
async function run(arm, names = Object.keys(SCENARIOS)) {
  const out = {};
  const keep = { log: console.log, warn: console.warn, debug: console.debug };
  LOOK = arm.look; LOOKARM = arm.lookArm;
  for (const name of names) {
    console.log = console.warn = console.debug = () => {};
    current = null;
    try { out[name] = await SCENARIOS[name](arm.mod); } catch (e) { out[name] = { pass: false, detail: `threw: ${e?.stack ?? e}` }; } finally { Object.assign(console, keep); }
    const un = current?.seam?.unlinked ?? [];
    if (un.length) out[name] = { ...out[name], pass: false, detail: `P-A: a landing wrote what its compile pass did not [${un.join('; ')}]; ${out[name].detail}` };
  }
  return out;
}

if (given) {
  const lookSrc = fs.readFileSync(given.look, 'utf8'); LOOK_SOURCES.set('given', lookSrc);
  const res = await run({ mod: await loadArm('given', fs.readFileSync(given.gi, 'utf8')), look: liftLook(lookSrc, given.look), lookArm: 'given' });
  for (const [name, r] of Object.entries(res)) console.log(`${r.pass ? 'PASS' : 'FAIL'} ${name} ${r.detail}`);
  const bad = Object.values(res).filter((r) => !r.pass).length;
  console.log(`TEST-GI-STAGE (--gi ${given.gi} --look ${given.look}): ${bad ? `FAIL (${bad} of ${Object.keys(res).length} scenarios failed)` : 'OK'}`);
  process.exit(bad ? 1 : 0);
}

const shipped = fs.readFileSync(GI, 'utf8');
const shippedLook = fs.readFileSync(LOOK_JS, 'utf8');
const one = (src, a, b) => { if (src.split(a).length !== 2) throw new Error(`plant anchor missing or not unique: ${a.slice(0, 70)}`); return src.replace(a, b); };
const WAIT = 'if (roomTail && !(await roomSettled(seq))) return;';
const GATE_WAIT = (cls) => `      state.bakeClass = ${cls};\n      state.bakeFixture = fixture;\n      state.look = look;\n      ${WAIT}`;
const PLANTS = [
  ['P1 the stale drop removed (a superseded staged bind still writes)', ['R1', 'R1b'],
    (s) => one(s, '      if (at?.stale) return false;\n', '      // PLANT: a superseded bind still writes\n')],
  ['P2 the studio deferral removed (a staged bind writes inside the studio window)', ['R2', 'D1'],
    (s) => one(s, '      if (at?.studio) { state.roomBaked = false; state.roomSuspended = true; return false; }\n', '      // PLANT: the bind writes inside the studio window\n')],
  ['P3a the bind completes before its staged write lands (its wait and the balls\' sampling removed)', ['R1c'],
    (s) => one(s, '    if (roomTail) {\n      if (venueShading() && liveBalls) sampleBallBlocks(api, liveBalls);\n      if (!(await roomSettled(seq))) return;\n    }\n',
      '    // PLANT: completes at once\n')],
  ['P3b the honesty gate completes before its staged restore lands', ['R2b', 'R3'],
    (s) => one(s, GATE_WAIT('cls'), GATE_WAIT('cls').replace(WAIT, '/* PLANT: completes at once */'))],
  ['P3c the footprint gate completes before its staged restore lands', ['R4'],
    (s) => one(s, GATE_WAIT('null'), GATE_WAIT('null').replace(WAIT, '/* PLANT: completes at once */'))],
  ['P4 the restore dropped when stale (a superseded restore writes nothing)', ['R3'],
    (s) => one(s, '    roomWrite(floorMesh, blob, hemi, (at) => {\n      if (at?.studio) {\n',
      '    roomWrite(floorMesh, blob, hemi, (at) => {\n      if (at?.stale) return false; // PLANT\n      if (at?.studio) {\n')],
  ['P5 the restore writes its undim inside the studio window', ['R2b'],
    (s) => one(s, '        if (undim) state.hemiRestorePending = true;\n',
      '        if (undim) { state.hemiRestorePending = true; hemi.intensity = state.hemiBase; } // PLANT: the undim lands inside the studio window too\n')],
  ['P6 the restore undoes a dim it no longer owns', ['F1'],
    (s) => one(s, '      if (undim && ownDim(hemi)) hemi.intensity = state.hemiBase;\n', '      if (undim) hemi.intensity = state.hemiBase; // PLANT\n')],
  ['P7 the resume undoes a dim it no longer owns', ['F1s'],
    (s) => one(s, 'state.hemiRestorePending && ownDim(state.room.hemi)) {', 'state.hemiRestorePending && state.hemiBase !== undefined) { /* PLANT */')],
  ['P8 the resting balls wait for the landing', ['BL'],
    (s) => one(s, '      if (venueShading() && liveBalls) sampleBallBlocks(api, liveBalls);\n', '      // PLANT: the balls wait for the landing\n')],
  ['P9 a failure settles before its staged restore lands', ['ER'],
    (s) => one(s, '    if (!roomTail) publishError(seq, e);\n', '    publishError(seq, e); // PLANT\n')],
  ['P10 setLook reads done while its staged bind waits', ['R1c'],
    (s) => one(s, ' && (state.appliedSeq === applySeq || !roomTail)) {', ') { /* PLANT */')],
  ['P11 look.js re-asserts the tournament hemi inside the studio window (its guard removed)', ['CX', 'P22'],
    (s) => one(s, '      if (window.__cinelight !== true) { reassert(); return; }\n', '      reassert(); return; // PLANT\n'), 'look'],
  ['P12 the open suspends a bound bake only (a restore still staged leaves the bake in the studio rig)', ['RC', 'RC2'],
    (s) => one(s, '    const leaving = !state.roomBaked && roomShowsBake();\n', '    const leaving = false; // PLANT\n')],
  ['P14 the window test keeps the rig rule term (with the rule off a staged write lands inside the window)', ['D1', 'D2', 'DR'],
    (s) => one(s, "      const studio = activeRig() !== 'gameplay';\n", "      const studio = rigRuleActive() && activeRig() !== 'gameplay';\n")],
  ['P15 the restore writes on inside the window (the flags kept)', ['D2', 'DR'],
    (s) => one(s, '        state.roomSuspended = true;\n        return false;\n      }\n', '        state.roomSuspended = true;\n      } // PLANT: and writes on\n')],
  ['P16 the resume runs inside the window (its window guard removed)', ['D2w'],
    (s) => one(s, "    if (activeRig() !== 'gameplay') return;\n", '    // PLANT: the resume runs inside the window\n')],
  ['P17 the resume leaves the bake a rule-off window kept (no restore after the revert)', ['DR'],
    (s) => one(s, '    else if (state.room && state.roomBase && roomShowsBake()) restoreWrite(state.hemiRestorePending, null);\n', '    // PLANT: no restore\n')],
  ['P18 the keep path inside the window keeps the rig rule term (with the rule off a bind completing there calls bindRoom)', ['D3', 'D3f', 'D4'],
    (s) => one(s, "      if (activeRig() !== 'gameplay') {\n", "      if (rigRuleActive() && activeRig() !== 'gameplay') {\n")],
  ['P19 look.js skips its re-assert when setLook resolves inside the window (no deferral to the close)', ['TX', 'TXr', 'WW'],
    (s) => one(s, "      window.addEventListener('ob:cinelight', onClose);\n", '      // PLANT: skipped inside the window, as before\n'), 'look'],
  ['P20 look.js\'s deferred re-assert ignores a newer look', ['TXd'],
    (s) => one(s, "if (gi?.state?.requestedLook !== 'default') reassert();", 'reassert(); /* PLANT */'), 'look'],
  ['P24 look.js\'s deferred re-assert stands down unless the requested look reads \'tournament\' (the legacy branch lost)', ['SPX'],
    (s) => one(s, "if (gi?.state?.requestedLook !== 'default') reassert();", "if (gi?.state?.requestedLook === 'tournament') reassert(); /* PLANT */"), 'look'],
  ['P21 a submission whose compile pass met the window lands after it anyway (the latch removed)', ['PA', 'PAon', 'PAr'],
    (s) => one(s, '      if (met && !studio) { snap = null; return; }\n', '      // PLANT: no latch\n')],
  ['P22 look.js\'s deferred re-assert does not check the window again in its microtask', ['PBl'],
    (s) => one(s, "          if (window.__cinelight === true) { window.addEventListener('ob:cinelight', onClose); return; }\n", '          // PLANT: no re-check\n'), 'look'],
  ['P23 the resume microtask of a close does not check the window again', ['PBg'],
    (s) => one(s, "queueMicrotask(() => { if (activeRig() === 'gameplay') resumeRoomNow(); });", 'queueMicrotask(() => { resumeRoomNow(); }); /* PLANT */')],
  ['P30 restoreRoom keeps the assets of the bind its restore removes (the close re-binds them)', ['SK', 'RC2'],
    (s) => one(s, '    // come back): a restore still staged when a window opens left them for the resume after the revert — under the rule the open\n'
      + '    // dropped them, but with the rule off a restore that declines inside the window sets roomSuspended, and the resume re-bound them\n'
      + '    state.roomAssets = null;\n', '    // PLANT: kept\n')],
  ['P31 a Default replaces a parked Tournament (its regrade never lands under main.js\'s tournament vignette and bloom)', ['LX2'],
    (s) => one(s, "  if (name === 'default') return true;\n", "  if (name === 'default') { parkLook(name, refs); return true; } // PLANT\n"), 'look'],
  ['P32 a Default made after the revert drops the parked Tournament (outside the window it still regrades nothing)', ['LX2'],
    (s) => one(s, "  if (name === 'default') return true;\n", "  if (name === 'default') { if (window.__cinelight !== true) parked = null; return true; } // PLANT\n"), 'look'],
  ['P25 look.js applies a pick made inside the window at once (the parking removed)', ['LX', 'LXoff', 'LX2', 'LXw', 'LXp'],
    (s) => one(s, '  if (parkLook(name, refs)) return true;\n', '  // PLANT: applied at once\n'), 'look'],
  ['P27 the first pick parked in a window wins', ['LX2'],
    (s) => one(s, '  parked = { name, refs }; armParked(); return true;', '  parked ??= { name, refs }; armParked(); return true; /* PLANT */'), 'look'],
  ['P28 a pick made after the revert leaves the parked one', ['LX2'],
    (s) => one(s, '  if (window.__cinelight !== true) { parked = null; return false; }', '  if (window.__cinelight !== true) return false; /* PLANT */'), 'look'],
  ['P29 the parked pick\'s listener stays armed after its close', ['LXp'],
    (s) => one(s, "  window.removeEventListener('ob:cinelight', onParkedClose); parkedArmed = false;\n", '  // PLANT: stays armed\n'), 'look'],
];
let fails = 0;
LOOK_SOURCES.set('shipped', shippedLook);
const shippedArm = { mod: await loadArm('shipped', shipped), look: liftLook(shippedLook, 'web/scene/look.js'), lookArm: 'shipped' };
const res = await run(shippedArm);
for (const [name, r] of Object.entries(res)) { console.log(`${r.pass ? 'PASS' : 'FAIL'} ${name} ${r.detail}`); if (!r.pass) fails++; }
let refTicks = null;
for (const [i, [label, targets, edit, file = 'gi']] of PLANTS.entries()) {
  let arm;
  try {
    if (file === 'look') {
      const src = edit(shippedLook); LOOK_SOURCES.set(`p${i + 1}`, src);
      arm = { mod: shippedArm.mod, look: liftLook(src, `look.js (${label.split(' ')[0]})`), lookArm: `p${i + 1}` };
    } else arm = { mod: await loadArm(`p${i + 1}`, edit(shipped)), look: shippedArm.look, lookArm: 'shipped' };
  } catch (e) { console.log(`FAIL ${label}: ${e.message}`); fails++; continue; }
  const ref = label.startsWith('P3a ');
  const pr = await run(arm, ref ? [...targets, 'B1'] : targets);
  if (ref) refTicks = pr.B1.ticks;
  const caught = targets.every((t) => !pr[t].pass);
  console.log(`${caught ? 'CAUGHT' : 'MISSED'} ${label}: ${targets.map((t) => `${t} ${pr[t].pass ? 'passed' : 'failed'}`).join(', ')}`);
  for (const t of targets) console.log(`    ${t}: ${pr[t].detail}`);
  if (!caught) fails++;
}
// B1's reference: the completion wait adds nothing on the boot path (the P3a arm is the shipped file without it)
const b1 = res.B1.ticks;
const same = refTicks !== null && b1 === refTicks;
console.log(`${same ? 'PASS' : 'FAIL'} B1-ref the boot-path apply completes in the same microtask turn with and without the completion wait (${b1} vs ${refTicks})`);
if (!same) fails++;
console.log(`TEST-GI-STAGE: ${fails ? `FAIL (${fails})` : 'OK'}`);
process.exit(fails ? 1 : 0);
