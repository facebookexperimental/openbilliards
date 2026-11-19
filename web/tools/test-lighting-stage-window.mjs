// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-lighting-stage-window.mjs — node selftest of web/scene/lightingvisuals.js's staged light-set changes against cinelight's
// studio window (GH-1202, the batch-2 review finding at lightingvisuals.js:2192-2194: a staged fixture swap landed inside it). No browser:
// the real lightingvisuals.js and the real web/app/cinelight.js run in plain node ('three' maps to the vendored build, the leaf's
// room.js / shading.js / table.js imports map to stubs) over a mock canopy room (rect 7.6, fill 2.2, hemi 0.22, as the review's
// reproduction built it) and a fake __obStage v1 with main.js's lightSet shape on a KHR boot after the overlay: serialized, a compile
// pass (apply, revert) in the change's turn, then the real apply once the test opens the stage's gate (its programs "linked").
// The contract, judged whichever route a fix takes (defer to the window's close, or drain before it opens):
//   (a) nothing lands inside the window: from installCineLight()'s return to revert(), no light in the scene changes (type, intensity,
//       colour, visibility), no mesh appears or goes, the applied fixture stays, the GI gain and fixture are not written, the env
//       re-bake does not fire and ob:relight is not announced;
//   (b) the export renders one rig, normalized through installCineLight(): inside the window the visible RectAreaLights total 7.6,
//       the fill reads 0.4 and the hemi 0.05;
//   (c) after the window, once everything owed has landed (every stage made after revert() opened, the debounce run), the gameplay
//       lighting equals a world that made the same swap with no export.
//   W1  the review's scenario: canopy -> pendant_bar at 1.2 still staged when the window opens; its stage lands inside the window
//   W2  the stage applied just before the window opened, its follow-up (the values, the GI gain and fixture, the re-bake, ob:relight)
//       not yet run
//   W3  the window opens and closes with the stage still waiting; it lands after the close (a guard: nothing to defer)
//   W4  no export: the swap lands as on acaac82c, the same seam calls (a compile pass and a real apply for the rig and each venue change
//       its follow-up makes) and the follow-up within the same 3 microtask turns of the real apply (a guard: with the window closed
//       the change is inert)
//   W5  back-to-back exports: the stage lands inside the first window, a second window opens after the first one's close, and the
//       change stays out of both
//   V1  the venue kind (applyVenue's staged path): on a table whose derived venue term supersedes the table-owned probe
//       (predator_apex_9ft: obPdtVenueAmbient, built at 9.91), the boot's venue apply hides that probe through the seam; its stage is
//       still waiting when the window opens and lands inside it. The probe keeps its state inside the window, and after the close the
//       world equals one with no export
//   R1  route A (defer to the window's close): a change that never hung goes back to the seam after the close, so main compiles it ahead
//       again; the first stage made after revert() is the rig's
//   R2  route A: a change that hung before the window opened does not go back to the seam (main's compile pass would revert the rig
//       that hangs); only its follow-up runs after the close
//   W6  back-to-back exports in one task: the first window's close and the second install run together, so the close's landing comes
//       due inside the second window; nothing of the parked change reaches the seam there, and it lands after the second close
//   O1  two swaps of one kind, the older parked: canopy -> pendant_bar lands inside the window (parked); inside it the next pick
//       (pdt_studio) is handed over and still waits in main's queue at the close. The newer pick wins: the older swap lands as stale
//       instead of going back behind it (it would land over the newer one)
//   O2  two swaps of one kind, the older hung: canopy -> pendant_bar hangs just before the window opens (its follow-up parks); the
//       next pick is handed over inside the window and main answers it at the close, before the parked follow-up runs. The newer
//       pick still wins, and the GI ends keyed to it
//   O3  the older swap's hand is refused (its compile pass falls inside the window); the next pick is handed over after the close
//       and waits behind the older stage in main's queue. The older swap lands as stale instead of going back behind the newer one
//   V2  W7 for the venue kind: on predator_apex_9ft the window opens in the boot's task, so the boot's venue stage (it hides the
//       superseded probe) has its compile pass inside the window; its real apply after the close stays inert, and it goes back to
//       the seam for a compile pass of its own
//   W6b W6 for a change that hung: its follow-up parked in the first window, and the close's landing comes due inside a second
//       window installed in the same task; the follow-up parks again and runs after the second close
//   W8  the env re-bake (C2-FIX1): a bake owed when the window opens comes due inside it and is deferred; the close re-arms it, a
//       second window opens in the same task, and the re-armed bake defers again: no bake inside either window, one after
//   V3  the venue capture loop (C2-FIX1): its attempts that come due inside a second window installed in the same task as the
//       first one's revert park there (venue.rigParked grows) and nothing of the venue term moves inside it
//   W7  a stage whose compile pass runs inside the window and whose real apply comes after the close: main compiled the studio draw
//       set, so that apply stays inert and the change goes back to the seam for a compile pass of its own outside the window (a cold
//       fixture would otherwise link inside the first gameplay frame after the export)
//   H1  the scene.add wrapper's fill hook: on predator_apex_9ft a ball is added in the task that opens the window (cinelight's own rims
//       come through the wrapper there too), so the hook it queues comes due inside the window. The ball's material keeps its program
//       key inside the window and is hooked after the close, as with no export (which hooks it: no scenario of the H family passes
//       with a wrapper that never hooks)
//   H1b cinelight's rims alone: a ball whose material was replaced in place (nothing queued) keeps it unhooked inside the window, and
//       the rims' parked hooks hook it after the close
//   H2  H1 after a revert: a ball added between the first close and a second install in the same task stays unhooked inside the
//       second window and is hooked after its close
//   H3  the hook reads the wrapper's gate again when it runs: a ball added, then the venue switched off at once in the same task
//       (main.js's degradeVenue), stays unhooked (a hook parked through a window runs at its close, long after its add); the same
//       add with the venue on is hooked
//   H4a H3 for a parked hook: the venue goes off while the ball's hook is parked in the window; after the close it stays unhooked
//   H4b the parked hook skips while one of our changes is staged: a pick handed inside the window is still live at the close, so the
//       ball stays unhooked right after it, and the staged change's venue apply hooks it once main lands it
//   H4c H4b with the window closed: a pick handed in the add's task is live before the hook runs; the hook skips and the staged
//       change hooks the ball (no fill hook outside the seam)
//   T1  a table rebuild (the superseded probe re-created at 9.91) decides that its venue term lands at once, and the window opens in
//       the same task: the venue reapply does not land inside the window (the probe keeps its state there) and lands after the close,
//       as with no export
//   T2  T1 after a revert: the first close, the rebuild and a second install in one task; the reapply lands after the second close
//   T3  T1's reapply parked in the first window, then a second window installed in the revert's task: the first window holds, the
//       close's landing comes due inside the second window, the reapply parks again and lands after its close (W6b's shape)
//   T4  the parked reapply keeps its at-once decision: right after the close, in microtasks only, the probe is hidden and the seam
//       saw no venue change
//   I1  main's seam answering 'immediate' (a scripted boot, the overlay up or no KHR_parallel_shader_compile): a pick inside the
//       window does not land there, and lands after the close
//   I2  I1 with a second window installed in the task of the first revert
// PLANTS (each one anchored edit of the shipped lightingvisuals.js; each must FAIL every scenario it names): the apply's window check
// (W1, W5, V1, W7), the follow-up's park (W2), the landing after cinelight's synchronous restore (W2), a hand the window refused goes
// back to the seam (W1, R1, V1, W7), a refused hand gives way to a newer change of its kind (O3), a refused compile pass keeps the
// hand's real apply inert (W7, V2), each hand starts unrefused (W1, R1, V1, W7), the re-bake's window check when it fires (W8), the
// capture attempt's window check (V3), the wrapper queues a hook for an add (H1, H2, H3), the fill hook's window check when it runs
// (H1, H1b, H2), the fill hook re-reads the venue term when it runs (H3, H4a), the fill hook re-reads our staged changes when it runs
// (H4b, H4c), a table change's venue reapply checks the window when it runs (T1, T2), every parked entry reads the window again when
// it lands (W6, W6b, H2, T3), a parked venue reapply reads the window again when it lands (T3), a parked venue reapply keeps its
// at-once decision (T4).
//   node web/tools/test-lighting-stage-window.mjs              (exit 0 = every scenario held and every plant was caught)
//   node web/tools/test-lighting-stage-window.mjs --lv <file>  (the scenarios alone against that lightingvisuals.js, e.g. a pre-fix
//                                                              copy: exit 1 when one fails)
// node >= 22.15 (module.registerHooks).
import fs from 'node:fs';
import path from 'node:path';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LV = path.resolve(HERE, '../scene/lightingvisuals.js');
// one pass over argv: --lv <file>, at most once, with a value
const argv = process.argv.slice(2);
if (!(argv.length === 0 || (argv.length === 2 && argv[0] === '--lv' && argv[1] !== '' && !argv[1].startsWith('--')))) {
  console.error('usage: node web/tools/test-lighting-stage-window.mjs [--lv <lightingvisuals.js>]');
  process.exit(2);
}
const given = argv.length === 2 ? path.resolve(argv[1]) : null;

// each arm is one lightingvisuals.js source, served under the real file's URL plus a query; its 'three' import resolves to the vendored
// build (the app's import map does the same) and its room.js / shading.js / table.js imports to stubs: the room is the scenario's mock
const LV_URL = pathToFileURL(LV).href;
const THREE_URL = pathToFileURL(path.resolve(HERE, '../vendor/three.module.min.js')).href;
// (VENUE_PROTOCOL is the owner handshake value, so V1's world can derive a venue term; the W and R worlds run ?venue=off with no
// renderer, so it changes nothing there. The table id is pool_pro_9ft unless a scenario sets another)
const STUB = {
  './room.js': 'export const activeRoom = { get instance() { return globalThis.__lvStageRoom ?? null; } };\nexport const VENUE_PROTOCOL = 2;\n',
  './table.js': "export const activeTableId = () => globalThis.__lvStageTable ?? 'pool_pro_9ft';\nexport const specFor = () => ({ kernel: { length: 2.54, width: 1.27 } });\n",
  './shading.js': 'export const SPIKE_EMITTERS = { count: 1 };\nexport const VENUE_PROTOCOL = 2;\n',
};
const SOURCES = new Map();
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'three') return { url: THREE_URL, shortCircuit: true };
    if (Object.hasOwn(STUB, specifier) && String(context.parentURL ?? '').startsWith(`${LV_URL}?arm=`)) {
      return { url: `data:text/javascript,${encodeURIComponent(STUB[specifier])}`, shortCircuit: true };
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    const q = url.indexOf('?arm=');
    if (q > 0 && url.slice(0, q) === LV_URL) return { format: 'module', source: SOURCES.get(url.slice(q + 5)), shortCircuit: true };
    return next(url, context);
  },
});
const loadArm = (name, source) => { SOURCES.set(name, source); return import(`${LV_URL}?arm=${name}`); };

// the page: window events through one bus per world (a later world never reaches an earlier one's listeners), no venue path
// (?venue=off, as the review's reproduction ran), frames as 16 ms timers
globalThis.window = globalThis;
globalThis.location = { search: '?venue=off', href: 'http://localhost/?venue=off', origin: 'http://localhost', pathname: '/' };
globalThis.sessionStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.requestAnimationFrame = (f) => setTimeout(() => f(performance.now()), 16);
globalThis.cancelAnimationFrame = (h) => clearTimeout(h);
let bus = null;
const freshBus = () => {
  bus = new EventTarget();
  globalThis.addEventListener = bus.addEventListener.bind(bus);
  globalThis.removeEventListener = bus.removeEventListener.bind(bus);
  globalThis.dispatchEvent = bus.dispatchEvent.bind(bus);
};
freshBus();
const THREE = await import('three');
const { installCineLight } = await import(pathToFileURL(path.resolve(HERE, '../app/cinelight.js')).href);

const turn = () => new Promise((r) => setTimeout(r, 0));
/** let microtasks and zero-delay timers run; `ms` more lets the leaf's debounced work (the env re-bake) fire */
const settle = async (ms = 0) => { for (let i = 0; i < 8; i++) await turn(); if (ms) { await new Promise((r) => setTimeout(r, ms)); for (let i = 0; i < 8; i++) await turn(); } };
const DEBOUNCE_WAIT_MS = 400;

/** main.js's lightSet (seam contract v1.2) on a KHR boot after the overlay, its program poll replaced by a gate the test opens */
function makeSeam() {
  const seam = { gates: [], log: [], answers: [] }; // answers: { why, p } per lightSet call (O2 times the close by one)
  let tail = null;
  const stageOne = (change) => new Promise((resolve) => {
    if (typeof change.revert !== 'function') { change.apply(); seam.log.push(`${change.why}:immediate`); resolve('immediate'); return; }
    change.apply(); change.revert(); // the compile pass: apply, compile the draw set, revert — one task, no frame renders it
    seam.log.push(`${change.why}:compiled`);
    seam.gates.push({ why: change.why, open: () => { change.apply(); seam.log.push(`${change.why}:staged`); resolve('staged'); } });
  });
  seam.lightSet = (change) => {
    if (typeof change?.apply !== 'function') return Promise.resolve('immediate');
    const run = () => stageOne(change);
    const p = (tail || Promise.resolve()).then(run, run);
    const clear = () => { if (tail === t) tail = null; };
    const t = p.then(clear, clear);
    tail = t;
    seam.answers.push({ why: change.why, p });
    return p;
  };
  /** open every gate, including the ones the leaf makes while earlier ones land, until none is waiting (at most 64: a leaf that keeps
   * re-staging fails its scenario instead of hanging the run) */
  seam.openAll = async () => { const out = []; for (;;) { await settle(); if (out.length >= 64) { out.push('runaway: 64 stages opened'); return out; } const g = seam.gates.shift(); if (!g) return out; g.open(); out.push(g.why); } };
  return seam;
}

// V1's renderer: what the leaf reads before it derives a venue term (floatRenderTargetSupported: WebGL2 with EXT_color_buffer_float)
const FLOAT_RENDERER = { extensions: { has: (n) => n === 'EXT_color_buffer_float' }, capabilities: { isWebGL2: true }, info: { programs: [] } };

/** a mock canopy room (the review's reproduction), the seam, recorders for the follow-up's side effects, and the leaf over them.
 * `venue`: V1's world, with the venue path on, a renderer that can derive the term and the table-owned probe the term supersedes; its
 * capture then waits on the GI stub (never settled) under a hold bound no scenario reaches, so it makes no further change */
function world(mod, { venue = false } = {}) {
  freshBus();
  window.__cinelight = false;
  window.__cinelightEnv = false;
  const scene = new THREE.Scene();
  const group = new THREE.Group();
  scene.add(group);
  const rect = new THREE.RectAreaLight(0xffffff, 7.6, 2.05, 0.66);
  const fill = new THREE.PointLight(0xffffff, 2.2);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.22);
  group.add(rect, fill, hemi);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  const hood = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  group.add(face, hood);
  if (venue) { const probe = new THREE.LightProbe(undefined, 9.91); probe.name = 'obPdtVenueAmbient'; scene.add(probe); }
  const room = { rectLight: rect, hemi, lightRefs: { group, fill, rectLights: [rect], lampFace: face, hood, rods: [] } };
  globalThis.__lvStageRoom = room;
  const seam = makeSeam();
  window.__obStage = { version: 1, lightSet: seam.lightSet };
  const inWindow = () => window.__cinelight === true;
  const rec = { rebakes: [], gains: [], giFixtures: [], relights: [] };
  bus.addEventListener('ob:relight', () => rec.relights.push(inWindow()));
  const gi = { setGain: () => rec.gains.push(inWindow()), setFixture: (f) => { rec.giFixtures.push(inWindow()); rec.giKey = f; } };
  const shared = { uLightPos: { value: new THREE.Vector3() }, uRoomMax: { value: new THREE.Vector3(4, 2, 4) } };
  if (venue) location.search = ''; // the leaf reads its venue flag once, here
  let light;
  try {
    light = mod.createLighting({ scene, shared, gi, rebakeEnv: () => rec.rebakes.push(inWindow()), fixture: 'canopy_panel',
      brightness: 1, look: 'default', protocol: 2, budgetMs: venue ? 1e9 : 5000, ...(venue ? { renderer: FLOAT_RENDERER } : {}) });
  } finally { location.search = '?venue=off'; }
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(2, 2, 3);
  const renderer = { toneMappingExposure: 1 };
  return { scene, room, seam, rec, light, studio: () => installCineLight({ scene, renderer, camera }) };
}

const r4 = (x) => Math.round(x * 1e4) / 1e4;
const lit = (o) => { for (let p = o; p; p = p.parent) if (p.visible === false) return false; return true; };
/** every light (type, intensity, colour, visibility) as a sorted multiset, the visible meshes, the applied fixture */
function shot(w) {
  const lights = [];
  let meshes = 0;
  w.scene.traverse((o) => {
    if (o.isLight) lights.push(`${o.type}|${r4(o.intensity)}|${o.color.getHexString()}${o.groundColor ? '/' + o.groundColor.getHexString() : ''}|${lit(o) ? 'on' : 'off'}`);
    else if (o.isMesh && lit(o)) meshes += 1;
  });
  lights.sort();
  return { fixture: w.light.state().fixture, lights, meshes };
}
/** (b): installCineLight's normalization holds over what hangs */
function normalized(w) {
  let total = 0;
  w.scene.traverse((o) => { if (o.isRectAreaLight && lit(o)) total += o.intensity; });
  const fill = w.room.lightRefs.fill.intensity, hemi = w.room.hemi.intensity;
  return { ok: Math.abs(total - 7.6) < 1e-6 && r4(fill) === 0.4 && r4(hemi) === 0.05, total: r4(total), fill: r4(fill), hemi: r4(hemi) };
}
/** the follow-up's side effects recorded while the window was open */
const inWindowEffects = (rec) => ({ rebakes: rec.rebakes.filter(Boolean).length, gains: rec.gains.filter(Boolean).length,
  giFixtures: rec.giFixtures.filter(Boolean).length, relights: rec.relights.filter(Boolean).length });
const noEffects = (e) => e.rebakes === 0 && e.gains === 0 && e.giFixtures === 0 && e.relights === 0;
const J = (o) => JSON.stringify(o);
const same = (a, b) => J(a) === J(b);
const diff = (a, b) => {
  const out = [];
  if (a.fixture !== b.fixture) out.push(`fixture ${a.fixture} vs ${b.fixture}`);
  if (a.meshes !== b.meshes) out.push(`meshes ${a.meshes} vs ${b.meshes}`);
  const only = (x, y) => { const m = new Map(); for (const k of y) m.set(k, (m.get(k) ?? 0) + 1); return x.filter((k) => { const n = m.get(k) ?? 0; if (n > 0) { m.set(k, n - 1); return false; } return true; }); };
  const ga = only(a.lights, b.lights), gb = only(b.lights, a.lights);
  if (ga.length || gb.length) out.push(`lights only here ${J(ga)}, only in the reference ${J(gb)}`);
  return out.length ? out.join('; ') : 'equal';
};

/** the same swap with no export: what the gameplay lighting must equal after the window */
async function reference(mod) {
  const w = world(mod);
  w.light.apply('pendant_bar', 1.2);
  await w.seam.openAll();
  await settle(DEBOUNCE_WAIT_MS);
  return shot(w);
}

/** the two picks of O1 and O2 with no export, each landed before the next: the scene and the GI key the window cases must equal */
async function reference2(mod) {
  const w = world(mod);
  w.light.apply('pendant_bar', 1.2);
  await w.seam.openAll();
  await settle();
  w.light.apply('pdt_studio', 1.2);
  await w.seam.openAll();
  await settle(DEBOUNCE_WAIT_MS);
  return { shot: shot(w), giKey: w.rec.giKey };
}

/** a window: install, watch it while `inside` runs and the debounce passes, revert; returns what (a) and (b) read */
async function exportWindow(w, inside = async () => {}) {
  const cine = w.studio();
  const atOpen = shot(w);
  const normAtOpen = normalized(w);
  const effects0 = inWindowEffects(w.rec);
  await inside();
  await settle(DEBOUNCE_WAIT_MS);
  const atClose = shot(w);
  const normAtClose = normalized(w);
  const effects = inWindowEffects(w.rec);
  cine.revert();
  const held = same(atOpen, atClose) && normAtOpen.ok && normAtClose.ok && same(effects0, effects) && noEffects(effects);
  return { held, detail: `at the open ${J(normAtOpen)}, at the close ${J(normAtClose)}; inside: ${diff(atClose, atOpen)}; side effects inside ${J(effects)}` };
}

/** a ball as main builds one (a sphere under an unnamed root, MeshPhysicalMaterial): the scene.add wrapper hooks its material */
const newBall = () => new THREE.Mesh(new THREE.SphereGeometry(0.028575, 8, 6), new THREE.MeshPhysicalMaterial());
/** the fill hook on a mesh's material: its own program cache key ending '|venuefill', the material version (needsUpdate bumps it) and
 * the census tag */
const hookOf = (mesh) => {
  const m = mesh.material;
  return { hooked: Object.hasOwn(m, 'customProgramCacheKey') && String(m.customProgramCacheKey()).endsWith('|venuefill'), version: m.version, tag: mesh.userData.obVenueClass ?? null };
};
/** table.js's rebuild of a Predator table: the table-owned probe re-created at its build literal (a new object under the same name) */
const rebuildProbe = (w) => {
  w.scene.getObjectByName('obPdtVenueAmbient')?.removeFromParent();
  const p = new THREE.LightProbe(undefined, 9.91);
  p.name = 'obPdtVenueAmbient';
  w.scene.add(p);
  return p;
};
/** n microtask turns, no timer turn: what runs right after a synchronous step */
const micro = async (n = 3) => { for (let i = 0; i < n; i++) await Promise.resolve(); };
/** main's lightSet when it answers 'immediate' (stageNow: a scripted boot, the overlay up, or no KHR): the apply runs in the call */
const immediateSeam = (w) => { window.__obStage = { version: 1, lightSet: (change) => { change.apply(); w.seam.log.push(`${change.why}:immediate`); return Promise.resolve('immediate'); } }; };
/** H1 / H2's end state: the same ball added on the same table with no export */
async function referenceBall(mod) {
  const w = world(mod, { venue: true });
  await w.seam.openAll();
  await settle();
  const ball = newBall();
  w.scene.add(ball);
  await settle(DEBOUNCE_WAIT_MS);
  return hookOf(ball);
}
/** T1 / T2's end state: the same rebuild with no export */
async function referenceRebuild(mod) {
  const w = world(mod, { venue: true });
  await w.seam.openAll();
  await settle();
  rebuildProbe(w);
  w.light.tableChanged();
  await w.seam.openAll();
  await settle(DEBOUNCE_WAIT_MS);
  return shot(w);
}

// W4's baseline, read on acaac82c (the pre-fix leaf): the swap's real apply flips the fixture and announces ob:relight within 3
// microtask turns, and the seam sees one compile pass and one real apply for the rig and for each of the two venue changes its
// follow-up makes. With the window closed a fix changes neither
const W4_BASE = { turns: 3, log: ['lighting:rig pendant_bar:compiled', 'lighting:rig pendant_bar:staged', 'lighting:venue:compiled',
  'lighting:venue:staged', 'lighting:venue:compiled', 'lighting:venue:staged'] };

const SCENARIOS = {
  async W1(mod) {
    const ref = await reference(mod);
    const w = world(mod);
    w.light.apply('pendant_bar', 1.2);
    await settle();
    const staged = w.seam.gates.length;
    const win = await exportWindow(w, () => w.seam.openAll());
    const landed = await w.seam.openAll();
    await settle(DEBOUNCE_WAIT_MS);
    const after = shot(w);
    const pass = staged === 1 && win.held && same(after, ref);
    return { pass, detail: `staged ${staged}; window: ${win.detail}; after the close (landed ${J(landed)}): ${diff(after, ref)}` };
  },
  async W2(mod) {
    const ref = await reference(mod);
    const w = world(mod);
    w.light.apply('pendant_bar', 1.2);
    await settle();
    const staged = w.seam.gates.length;
    // the real apply, then the window in the same task: the swap hangs at the install, its follow-up has not run
    w.seam.gates.shift()?.open();
    const hungAtOpen = w.light.state().fixture;
    const win = await exportWindow(w);
    const landed = await w.seam.openAll();
    await settle(DEBOUNCE_WAIT_MS);
    const after = shot(w);
    const pass = staged === 1 && hungAtOpen === 'pendant_bar' && win.held && same(after, ref);
    return { pass, detail: `staged ${staged}, hung at the open ${hungAtOpen}; window: ${win.detail}; after the close (landed ${J(landed)}): ${diff(after, ref)}` };
  },
  async W3(mod) {
    const ref = await reference(mod);
    const w = world(mod);
    w.light.apply('pendant_bar', 1.2);
    await settle();
    const staged = w.seam.gates.length;
    const win = await exportWindow(w);
    const landed = await w.seam.openAll();
    await settle(DEBOUNCE_WAIT_MS);
    const after = shot(w);
    const pass = staged === 1 && win.held && landed.length >= 1 && same(after, ref);
    return { pass, detail: `staged ${staged}; window: ${win.detail}; after the close (landed ${J(landed)}): ${diff(after, ref)}` };
  },
  async W4(mod) {
    const ref = await reference(mod);
    const w = world(mod);
    w.light.apply('pendant_bar', 1.2);
    await settle();
    const g = w.seam.gates.shift();
    g?.open();
    // the follow-up rides the real apply's microtask chain: no timer turn between the land and the values
    let turns = 0;
    while (turns < 50 && !(w.light.state().fixture === 'pendant_bar' && w.rec.relights.length > 0)) { turns += 1; await Promise.resolve(); }
    const flipped = { fixture: w.light.state().fixture, relights: w.rec.relights.length, fill: r4(w.room.lightRefs.fill.intensity), turns };
    await w.seam.openAll();
    await settle(DEBOUNCE_WAIT_MS);
    const after = shot(w);
    const log = w.seam.log.slice();
    const pass = !!g && turns <= W4_BASE.turns && flipped.fixture === 'pendant_bar' && same(log, W4_BASE.log) && same(after, ref);
    return { pass, turns, detail: `after the real apply, in microtasks only: ${J(flipped)}; seam ${J(log)}; end: ${diff(after, ref)}` };
  },
  async W5(mod) {
    const ref = await reference(mod);
    const w = world(mod);
    w.light.apply('pendant_bar', 1.2);
    await settle();
    const staged = w.seam.gates.length;
    const first = await exportWindow(w, () => w.seam.openAll());
    await settle(); // the first close's owed work starts (a change that never hung goes back to the seam)
    const second = await exportWindow(w, () => w.seam.openAll());
    const landed = await w.seam.openAll();
    await settle(DEBOUNCE_WAIT_MS);
    const after = shot(w);
    const pass = staged === 1 && first.held && second.held && same(after, ref);
    return { pass, detail: `staged ${staged}; first window: ${first.detail}; second window: ${second.detail}; after (landed ${J(landed)}): ${diff(after, ref)}` };
  },
  async V1(mod) {
    globalThis.__lvStageTable = 'predator_apex_9ft';
    try {
      const rw = world(mod, { venue: true });
      await rw.seam.openAll();
      await settle(DEBOUNCE_WAIT_MS);
      const ref = shot(rw);
      const probe = rw.scene.getObjectByName('obPdtVenueAmbient');
      const suppressed = probe.visible === false && probe.intensity === 0; // the reference world's venue path is live
      const w = world(mod, { venue: true });
      await settle();
      const staged = w.seam.gates.map((g) => g.why);
      const win = await exportWindow(w, () => w.seam.openAll());
      const landed = await w.seam.openAll();
      await settle(DEBOUNCE_WAIT_MS);
      const after = shot(w);
      const pass = same(staged, ['lighting:venue']) && suppressed && win.held && same(after, ref);
      return { pass, detail: `staged ${J(staged)}; the reference suppresses the table-owned probe: ${suppressed}; window: ${win.detail}; after the close (landed ${J(landed)}): ${diff(after, ref)}` };
    } finally { globalThis.__lvStageTable = undefined; }
  },
  async R1(mod) {
    const ref = await reference(mod);
    const w = world(mod);
    w.light.apply('pendant_bar', 1.2);
    await settle();
    await exportWindow(w, () => w.seam.openAll());
    const landed = await w.seam.openAll();
    await settle(DEBOUNCE_WAIT_MS);
    const after = shot(w);
    const pass = landed[0] === 'lighting:rig pendant_bar' && same(after, ref);
    return { pass, detail: `the stages made after revert(): ${J(landed)}; after: ${diff(after, ref)}` };
  },
  async R2(mod) {
    const ref = await reference(mod);
    const w = world(mod);
    w.light.apply('pendant_bar', 1.2);
    await settle();
    w.seam.gates.shift()?.open();
    await exportWindow(w);
    const landed = await w.seam.openAll();
    await settle(DEBOUNCE_WAIT_MS);
    const after = shot(w);
    const pass = !landed.includes('lighting:rig pendant_bar') && same(after, ref);
    return { pass, detail: `the stages made after revert(): ${J(landed)}; after: ${diff(after, ref)}` };
  },
  async W6(mod) {
    const ref = await reference(mod);
    const w = world(mod);
    w.light.apply('pendant_bar', 1.2);
    await settle();
    const cine = w.studio();
    await w.seam.openAll(); // the stage lands inside the first window
    await settle();
    cine.revert();
    const seamAtOpen = w.seam.log.length;
    let seamInside = -1;
    const second = await exportWindow(w, async () => { await w.seam.openAll(); seamInside = w.seam.log.length; }); // installs at once, in this task
    const landed = await w.seam.openAll();
    await settle(DEBOUNCE_WAIT_MS);
    const after = shot(w);
    const pass = second.held && seamInside === seamAtOpen && same(after, ref);
    return { pass, detail: `seam calls inside the second window: ${seamInside - seamAtOpen}; second window: ${second.detail}; after (landed ${J(landed)}): ${diff(after, ref)}` };
  },
  async O1(mod) {
    const ref = await reference2(mod);
    const w = world(mod);
    w.light.apply('pendant_bar', 1.2);
    await settle();
    const win = await exportWindow(w, async () => { await w.seam.openAll(); w.light.apply('pdt_studio', 1.2); await settle(); });
    const landed = await w.seam.openAll();
    await settle(DEBOUNCE_WAIT_MS);
    const after = shot(w);
    const pass = win.held && after.fixture === 'pdt_studio' && w.rec.giKey === ref.giKey && same(after, ref.shot);
    return { pass, detail: `window: ${win.detail}; after (landed ${J(landed)}): fixture ${after.fixture}, GI key ${w.rec.giKey} (the reference: ${ref.giKey}); ${diff(after, ref.shot)}` };
  },
  async O2(mod) {
    const ref = await reference2(mod);
    const w = world(mod);
    w.light.apply('pendant_bar', 1.2);
    await settle();
    w.seam.gates.shift()?.open(); // the older swap's real apply; the window opens in the same task (W2's shape)
    const cine = w.studio();
    w.light.apply('pdt_studio', 1.2);
    const answer = w.seam.answers.at(-1);
    // every stage ahead of the newer pick's opens inside the window (nothing lands there) until its own gate is next
    let next = null;
    for (let i = 0; i < 8 && !next; i++) { await settle(); const g = w.seam.gates.shift(); if (g?.why === 'lighting:rig pdt_studio') next = g; else g?.open(); }
    // the close rides main's answer to the newer pick, right behind the leaf's first step on it: the leaf's follow-up on it is then
    // queued ahead of the close's landing
    answer?.p.then(() => cine.revert());
    next?.open(); // its real apply inside the window: nothing lands
    const landed = await w.seam.openAll();
    await settle(DEBOUNCE_WAIT_MS);
    const after = shot(w);
    const pass = !!next && answer?.why === 'lighting:rig pdt_studio' && window.__cinelight === false && after.fixture === 'pdt_studio'
      && w.rec.giKey === ref.giKey && same(after, ref.shot);
    return { pass, detail: `after (landed ${J(landed)}): fixture ${after.fixture}, GI key ${w.rec.giKey} (the reference: ${ref.giKey}); ${diff(after, ref.shot)}` };
  },
  async W7(mod) {
    const ref = await reference(mod);
    const w = world(mod);
    const cine = w.studio();
    w.light.apply('pendant_bar', 1.2);
    await settle(); // its compile pass runs inside the window
    const compiledInside = w.seam.log.filter((e) => e === 'lighting:rig pendant_bar:compiled').length;
    cine.revert();
    await settle();
    const atClose = w.seam.log.length;
    const g = w.seam.gates.shift();
    g?.open(); // its real apply, after the close
    const hungAtApply = w.light.state().fixture === 'pendant_bar';
    const landed = await w.seam.openAll();
    await settle(DEBOUNCE_WAIT_MS);
    const after = shot(w);
    const seamAfter = w.seam.log.slice(atClose);
    const recompiled = seamAfter.includes('lighting:rig pendant_bar:compiled');
    const pass = compiledInside === 1 && g?.why === 'lighting:rig pendant_bar' && !hungAtApply && recompiled && same(after, ref);
    return { pass, detail: `compile passes inside the window ${compiledInside}; the real apply after the close hung the rig: ${hungAtApply}; the seam after the close ${J(seamAfter)} (landed ${J(landed)}); after: ${diff(after, ref)}` };
  },
  async O3(mod) {
    const ref = await reference2(mod);
    const w = world(mod);
    const cine = w.studio();
    w.light.apply('pendant_bar', 1.2);
    await settle(); // the older swap's compile pass falls inside the window
    cine.revert();
    await settle();
    w.light.apply('pdt_studio', 1.2); // the next pick, behind the older stage in main's queue
    await settle();
    const landed = await w.seam.openAll();
    await settle(DEBOUNCE_WAIT_MS);
    const after = shot(w);
    const pass = after.fixture === 'pdt_studio' && w.rec.giKey === ref.giKey && same(after, ref.shot);
    return { pass, detail: `after (landed ${J(landed)}): fixture ${after.fixture}, GI key ${w.rec.giKey} (the reference: ${ref.giKey}); ${diff(after, ref.shot)}` };
  },
  async V2(mod) {
    globalThis.__lvStageTable = 'predator_apex_9ft';
    try {
      const rw = world(mod, { venue: true });
      await rw.seam.openAll();
      await settle(DEBOUNCE_WAIT_MS);
      const ref = shot(rw);
      const w = world(mod, { venue: true });
      const probe = w.scene.getObjectByName('obPdtVenueAmbient');
      const cine = w.studio(); // in the boot's task: the boot's venue stage has its compile pass inside the window
      await settle();
      const compiledInside = w.seam.log.filter((e) => e === 'lighting:venue:compiled').length;
      cine.revert();
      await settle();
      const atClose = w.seam.log.length;
      const g = w.seam.gates.shift();
      g?.open(); // its real apply, after the close
      const suppressedAtApply = probe.visible === false;
      const landed = await w.seam.openAll();
      await settle(DEBOUNCE_WAIT_MS);
      const after = shot(w);
      const seamAfter = w.seam.log.slice(atClose);
      const recompiled = seamAfter.includes('lighting:venue:compiled');
      const pass = compiledInside === 1 && g?.why === 'lighting:venue' && !suppressedAtApply && recompiled && same(after, ref);
      return { pass, detail: `venue compile passes inside the window ${compiledInside}; the real apply after the close suppressed the probe: ${suppressedAtApply}; the seam after the close ${J(seamAfter)} (landed ${J(landed)}); after: ${diff(after, ref)}` };
    } finally { globalThis.__lvStageTable = undefined; }
  },
  async W6b(mod) {
    const ref = await reference(mod);
    const w = world(mod);
    w.light.apply('pendant_bar', 1.2);
    await settle();
    w.seam.gates.shift()?.open(); // the real apply; the first window opens in the same task (W2's shape)
    const cine = w.studio();
    await settle(); // the follow-up comes due inside the first window and parks
    const hung = w.light.state().fixture;
    cine.revert();
    const second = await exportWindow(w); // installs at once, in this task: the close's landing comes due inside it
    const landed = await w.seam.openAll();
    await settle(DEBOUNCE_WAIT_MS);
    const after = shot(w);
    const pass = hung === 'pendant_bar' && second.held && same(after, ref);
    return { pass, detail: `hung in the first window: ${hung}; second window: ${second.detail}; after (landed ${J(landed)}): ${diff(after, ref)}` };
  },
  async W8(mod) {
    const w = world(mod);
    w.light.apply('pendant_bar', 1.2);
    await w.seam.openAll();
    await settle(DEBOUNCE_WAIT_MS);
    const n0 = w.rec.rebakes.length;
    w.light.apply('pendant_bar', 1.3); // a brightness pick: the values now, and a debounced re-bake owed
    const cine = w.studio(); // the owed bake comes due inside this window
    await settle(DEBOUNCE_WAIT_MS);
    const firstInside = w.rec.rebakes.slice(n0).filter(Boolean).length;
    const firstOutside = w.rec.rebakes.slice(n0).filter((x) => x === false).length;
    cine.revert();
    const second = await exportWindow(w); // installs at once, in this task: the re-armed bake comes due inside it
    await settle(DEBOUNCE_WAIT_MS);
    const bakes = w.rec.rebakes.slice(n0);
    const pass = firstInside === 0 && firstOutside === 0 && second.held && bakes.filter(Boolean).length === 0 && bakes.filter((x) => x === false).length === 1;
    return { pass, detail: `bakes from the pick (true = inside a window): ${J(bakes)}; second window: ${second.detail}` };
  },
  async V3(mod) {
    globalThis.__lvStageTable = 'predator_apex_9ft';
    try {
      const w = world(mod, { venue: true });
      await w.seam.openAll(); // the boot's venue stage lands; its capture loop waits on the GI and polls
      await settle();
      const cine = w.studio();
      await settle(DEBOUNCE_WAIT_MS);
      const parked0 = w.light.state().venue?.rigParked ?? 0;
      cine.revert();
      const second = await exportWindow(w); // installs at once, in this task
      const parked1 = w.light.state().venue?.rigParked ?? 0;
      const pass = second.held && parked1 > parked0 && parked0 > 0;
      return { pass, detail: `capture attempts parked: ${parked0} by the first close, ${parked1} by the second; second window: ${second.detail}` };
    } finally { globalThis.__lvStageTable = undefined; }
  },
  async H1(mod) {
    globalThis.__lvStageTable = 'predator_apex_9ft';
    try {
      const ref = await referenceBall(mod);
      const w = world(mod, { venue: true });
      await w.seam.openAll(); // the boot's venue stage lands: the probe hidden, the scene.add wrapper installed
      await settle();
      const ball = newBall();
      w.scene.add(ball); // the wrapper queues the hook, and the window opens in this task (its rims queue two more)
      const cine = w.studio();
      const atOpen = hookOf(ball);
      await settle(DEBOUNCE_WAIT_MS);
      const atClose = hookOf(ball);
      cine.revert();
      await settle();
      const after = hookOf(ball);
      const pass = ref.hooked && !atOpen.hooked && same(atOpen, atClose) && same(after, ref);
      return { pass, detail: `the ball's fill hook at the open ${J(atOpen)}, at the close ${J(atClose)}, after ${J(after)} (no export: ${J(ref)})` };
    } finally { globalThis.__lvStageTable = undefined; }
  },
  async H2(mod) {
    globalThis.__lvStageTable = 'predator_apex_9ft';
    try {
      const ref = await referenceBall(mod);
      const w = world(mod, { venue: true });
      await w.seam.openAll();
      await settle();
      const cine1 = w.studio();
      await settle(DEBOUNCE_WAIT_MS);
      const ball = newBall();
      cine1.revert();
      w.scene.add(ball); // after the first close; the second window opens in the same task
      const cine2 = w.studio();
      const atOpen = hookOf(ball);
      await settle(DEBOUNCE_WAIT_MS);
      const atClose = hookOf(ball);
      cine2.revert();
      await settle();
      const after = hookOf(ball);
      const pass = ref.hooked && !atOpen.hooked && same(atOpen, atClose) && same(after, ref);
      return { pass, detail: `the ball's fill hook at the second open ${J(atOpen)}, at its close ${J(atClose)}, after ${J(after)} (no export: ${J(ref)})` };
    } finally { globalThis.__lvStageTable = undefined; }
  },
  async H3(mod) {
    globalThis.__lvStageTable = 'predator_apex_9ft';
    try {
      const ref = await referenceBall(mod); // the control: the same add with the venue on is hooked
      const w = world(mod, { venue: true });
      await w.seam.openAll();
      await settle();
      const ball = newBall();
      w.scene.add(ball); // the wrapper queues the hook
      w.light.setVenue(false); // main.js's degradeVenue in the same task: at once, the probe restored and every hook removed
      await settle(DEBOUNCE_WAIT_MS);
      const after = hookOf(ball);
      const on = w.light.state().venue?.on;
      const pass = ref.hooked && on === false && !after.hooked && after.version === 0;
      return { pass, detail: `venue on ${on}; the ball's fill hook after ${J(after)} (the venue left on: ${J(ref)})` };
    } finally { globalThis.__lvStageTable = undefined; }
  },
  async T1(mod) {
    globalThis.__lvStageTable = 'predator_apex_9ft';
    try {
      const ref = await referenceRebuild(mod);
      const w = world(mod, { venue: true });
      await w.seam.openAll();
      await settle();
      const probe = rebuildProbe(w);
      w.light.tableChanged(); // the rebuild decides that its venue term lands at once; the window opens in this task
      const win = await exportWindow(w);
      await settle();
      const landed = await w.seam.openAll();
      await settle(DEBOUNCE_WAIT_MS);
      const after = shot(w);
      const pass = win.held && probe.visible === false && same(after, ref);
      return { pass, detail: `window: ${win.detail}; the re-created probe after the close ${J({ visible: probe.visible, intensity: r4(probe.intensity) })}; after (landed ${J(landed)}): ${diff(after, ref)}` };
    } finally { globalThis.__lvStageTable = undefined; }
  },
  async T2(mod) {
    globalThis.__lvStageTable = 'predator_apex_9ft';
    try {
      const ref = await referenceRebuild(mod);
      const w = world(mod, { venue: true });
      await w.seam.openAll();
      await settle();
      const cine1 = w.studio();
      await settle(DEBOUNCE_WAIT_MS);
      cine1.revert();
      const probe = rebuildProbe(w); // the first close, a rebuild and the second window in one task
      w.light.tableChanged();
      const second = await exportWindow(w);
      await settle();
      const landed = await w.seam.openAll();
      await settle(DEBOUNCE_WAIT_MS);
      const after = shot(w);
      const pass = second.held && probe.visible === false && same(after, ref);
      return { pass, detail: `second window: ${second.detail}; the re-created probe after its close ${J({ visible: probe.visible, intensity: r4(probe.intensity) })}; after (landed ${J(landed)}): ${diff(after, ref)}` };
    } finally { globalThis.__lvStageTable = undefined; }
  },
  async H1b(mod) {
    globalThis.__lvStageTable = 'predator_apex_9ft';
    try {
      const w = world(mod, { venue: true });
      await w.seam.openAll();
      await settle();
      const ball = newBall();
      w.scene.add(ball);
      await settle(); // hooked by its own add
      ball.material = new THREE.MeshPhysicalMaterial(); // replaced in place: unhooked, nothing queued
      const before = hookOf(ball);
      const cine = w.studio(); // only cinelight's rims queue a hook now
      await settle(DEBOUNCE_WAIT_MS);
      const atClose = hookOf(ball);
      cine.revert();
      await settle();
      const after = hookOf(ball);
      const pass = !before.hooked && same(before, atClose) && after.hooked;
      return { pass, detail: `the replaced material before the open ${J(before)}, at the close ${J(atClose)}, after ${J(after)}` };
    } finally { globalThis.__lvStageTable = undefined; }
  },
  async H4a(mod) {
    globalThis.__lvStageTable = 'predator_apex_9ft';
    try {
      const w = world(mod, { venue: true });
      await w.seam.openAll();
      await settle();
      const ball = newBall();
      w.scene.add(ball);
      const cine = w.studio();
      await settle(); // the ball's hook parks
      w.light.setVenue(false); // the venue goes off inside the window (a model: setVenue is main.js's degrade path)
      await settle(DEBOUNCE_WAIT_MS);
      cine.revert();
      await settle(DEBOUNCE_WAIT_MS);
      const after = hookOf(ball);
      const on = w.light.state().venue?.on;
      const pass = on === false && !after.hooked && after.version === 0;
      return { pass, detail: `venue on ${on}; the ball after the close ${J(after)}` };
    } finally { globalThis.__lvStageTable = undefined; }
  },
  async H4b(mod) {
    globalThis.__lvStageTable = 'predator_apex_9ft';
    try {
      const w = world(mod, { venue: true });
      await w.seam.openAll();
      await settle();
      const ball = newBall();
      w.scene.add(ball);
      const cine = w.studio();
      await settle(); // the ball's hook parks
      w.light.apply('pendant_bar', 1.2); // a pick inside the window: its compile pass is refused
      await settle();
      await w.seam.openAll(); // its real apply inside the window: inert, its follow-up parks
      await settle(DEBOUNCE_WAIT_MS);
      const atClose = hookOf(ball);
      cine.revert();
      await micro();
      const right = hookOf(ball);
      const pendingRight = w.light.state().staging.pending;
      await settle();
      const landed = await w.seam.openAll();
      await settle(DEBOUNCE_WAIT_MS);
      const after = hookOf(ball);
      const pass = !atClose.hooked && !right.hooked && pendingRight > 0 && after.hooked;
      return { pass, detail: `the ball at the close ${J(atClose)}; right after it ${J(right)} (stages pending ${pendingRight}); after (landed ${J(landed)}) ${J(after)}` };
    } finally { globalThis.__lvStageTable = undefined; }
  },
  async H4c(mod) {
    globalThis.__lvStageTable = 'predator_apex_9ft';
    try {
      const w = world(mod, { venue: true });
      await w.seam.openAll();
      await settle();
      const ball = newBall();
      w.scene.add(ball);
      w.light.apply('pendant_bar', 1.2); // a rig change handed in the add's task: live before the hook runs
      await micro();
      const right = hookOf(ball);
      await settle();
      const landed = await w.seam.openAll();
      await settle(DEBOUNCE_WAIT_MS);
      const after = hookOf(ball);
      const pass = !right.hooked && after.hooked;
      return { pass, detail: `the ball right after the add ${J(right)}; after (landed ${J(landed)}) ${J(after)}` };
    } finally { globalThis.__lvStageTable = undefined; }
  },
  async T3(mod) {
    globalThis.__lvStageTable = 'predator_apex_9ft';
    try {
      const ref = await referenceRebuild(mod);
      const w = world(mod, { venue: true });
      await w.seam.openAll();
      await settle();
      const probe = rebuildProbe(w);
      w.light.tableChanged(); // T1's shape: the first window opens in the rebuild's task, so the reapply parks in it
      const cine1 = w.studio();
      const atOpen1 = shot(w);
      await settle(DEBOUNCE_WAIT_MS);
      const atClose1 = shot(w);
      cine1.revert();
      const second = await exportWindow(w); // installs at once, in the revert's task: the close's landing comes due inside it
      await settle();
      const landed = await w.seam.openAll();
      await settle(DEBOUNCE_WAIT_MS);
      const after = shot(w);
      const first = same(atOpen1, atClose1);
      const pass = first && second.held && probe.visible === false && same(after, ref);
      return { pass, detail: `the first window held: ${first} (${diff(atClose1, atOpen1)}); second window: ${second.detail}; the probe after its close ${J({ visible: probe.visible, intensity: r4(probe.intensity) })}; after (landed ${J(landed)}): ${diff(after, ref)}` };
    } finally { globalThis.__lvStageTable = undefined; }
  },
  async T4(mod) {
    globalThis.__lvStageTable = 'predator_apex_9ft';
    try {
      const w = world(mod, { venue: true });
      await w.seam.openAll();
      await settle();
      const probe = rebuildProbe(w);
      w.light.tableChanged();
      const cine = w.studio();
      await settle(DEBOUNCE_WAIT_MS);
      const inside = { visible: probe.visible, intensity: r4(probe.intensity) };
      const n0 = w.seam.log.length;
      cine.revert();
      await micro();
      const right = { visible: probe.visible, intensity: r4(probe.intensity) };
      await settle();
      const seamAfter = w.seam.log.slice(n0);
      const pass = inside.visible === true && right.visible === false && !seamAfter.some((e) => e.startsWith('lighting:venue'));
      return { pass, detail: `the probe inside the window ${J(inside)}; right after the close ${J(right)}; the seam after the close ${J(seamAfter)}` };
    } finally { globalThis.__lvStageTable = undefined; }
  },
  async I1(mod) {
    const r = world(mod);
    immediateSeam(r);
    r.light.apply('pendant_bar', 1.2);
    await settle(DEBOUNCE_WAIT_MS);
    const ref = shot(r);
    const w = world(mod);
    immediateSeam(w);
    const win = await exportWindow(w, async () => { w.light.apply('pendant_bar', 1.2); await settle(); });
    await settle(DEBOUNCE_WAIT_MS);
    const after = shot(w);
    const pass = win.held && after.fixture === 'pendant_bar' && same(after, ref);
    return { pass, detail: `window: ${win.detail}; seam ${J(w.seam.log)}; after: ${diff(after, ref)}` };
  },
  async I2(mod) {
    const r = world(mod);
    immediateSeam(r);
    r.light.apply('pendant_bar', 1.2);
    await settle(DEBOUNCE_WAIT_MS);
    const ref = shot(r);
    const w = world(mod);
    immediateSeam(w);
    const cine = w.studio();
    w.light.apply('pendant_bar', 1.2);
    await settle();
    cine.revert();
    const second = await exportWindow(w); // installs at once, in the revert's task
    await settle(DEBOUNCE_WAIT_MS);
    const after = shot(w);
    const pass = second.held && after.fixture === 'pendant_bar' && same(after, ref);
    return { pass, detail: `second window: ${second.detail}; seam ${J(w.seam.log)}; after: ${diff(after, ref)}` };
  },
};

// each plant is one anchored edit of the shipped leaf (its anchor occurs exactly once) and names the scenarios it must fail
const PLANTS = [
  { name: "the apply's window check", from: 'if (rigWindowOpen()) { skipped = true; return; } ', to: '', fails: ['W1', 'W5', 'V1', 'W7'] },
  { name: "the follow-up's park", from: 'if (live() && rigWindowOpen()) { staging.deferred++; parked.push(() => follow(true)); return; }', to: '', fails: ['W2'] },
  { name: "the landing after cinelight's synchronous restore", from: 'if (parked.length) queueMicrotask(landParked);', to: 'if (parked.length) landParked();', fails: ['W2'] },
  { name: 'a hand the window refused goes back to the seam', from: 'else { staging.deferred++; hand(); return; }', to: 'else { staging.deferred++; }', fails: ['W1', 'R1', 'V1', 'W7'] },
  { name: 'a refused hand gives way to a newer change of its kind', from: 'if (entry.n < handedN[kind]) entry.e = -1; else', to: 'if (false) entry.e = -1; else', fails: ['O3'] },
  { name: "a refused compile pass keeps the hand's real apply inert", from: 'if (!skipped) change.apply();', to: 'change.apply();', fails: ['W7', 'V2'] },
  { name: 'each hand starts unrefused', from: 'const call = () => { skipped = false; ', to: 'const call = () => { ', fails: ['W1', 'R1', 'V1', 'W7'] },
  { name: "the re-bake's window check when it fires", from: 'const fireRebake = () => { if (rigWindowOpen()) {', to: 'const fireRebake = () => { if (false) {', fails: ['W8'] },
  { name: "the capture attempt's window check", from: 'if (rigWindowOpen()) { // C2-FIX1 A: no capture inside the studio window', to: 'if (false) { // C2-FIX1 A: no capture inside the studio window', fails: ['V3'] },
  { name: 'the wrapper queues a hook for an add', from: 'if (armed() && !livePending()) queueMicrotask(function hookAdded() {', to: 'if (false) queueMicrotask(function hookAdded() {', fails: ['H1', 'H2', 'H3'] },
  { name: "the fill hook's window check when it runs", from: 'if (rigWindowOpen()) { parked.push(hookAdded); return; }', to: '', fails: ['H1', 'H1b', 'H2'] },
  { name: 'the fill hook re-reads the venue term when it runs', from: 'try { if (armed() && !livePending()) hookUnbaked(); }', to: 'try { if (!livePending()) hookUnbaked(); }', fails: ['H3', 'H4a'] },
  { name: 'the fill hook re-reads our staged changes when it runs', from: 'try { if (armed() && !livePending()) hookUnbaked(); }', to: 'try { if (armed()) hookUnbaked(); }', fails: ['H4b', 'H4c'] },
  { name: "a table change's venue reapply checks the window when it runs", from: 'if (rigWindowOpen()) { parked.push(reapply); return; } ', to: '', fails: ['T1', 'T2'] },
  { name: 'every parked entry reads the window again when it lands', from: 'const landParked = () => { for (const f of parked.splice(0)) f(); };',
    to: 'const landParked = () => { const was = window.__cinelight; window.__cinelight = false; try { for (const f of parked.splice(0)) f(); } finally { window.__cinelight = was; } };', fails: ['W6', 'W6b', 'H2', 'T3'] },
  { name: 'a parked venue reapply reads the window again when it lands', from: 'if (rigWindowOpen()) { parked.push(reapply); return; } ',
    to: 'if (rigWindowOpen()) { parked.push(() => { if (now) atOnce++; try { venueReapply(); } catch { /* ok */ } finally { if (now) atOnce--; } }); return; } ', fails: ['T3'] },
  { name: 'a parked venue reapply keeps its at-once decision', from: 'const reapply = () => { if (rigWindowOpen()) { parked.push(reapply); return; } if (now) atOnce++; try { venueReapply(); } catch { /* ok */ } finally { if (now) atOnce--; } };',
    to: 'let wasParked = false; const reapply = () => { if (rigWindowOpen()) { wasParked = true; parked.push(reapply); return; } const n2 = now && !wasParked; if (n2) atOnce++; try { venueReapply(); } catch { /* ok */ } finally { if (n2) atOnce--; } };', fails: ['T4'] },
];

async function run(mod, names = Object.keys(SCENARIOS)) {
  const out = {};
  const keep = { log: console.log, warn: console.warn, debug: console.debug, info: console.info };
  for (const name of names) {
    console.log = console.warn = console.debug = console.info = () => {};
    try { out[name] = await SCENARIOS[name](mod); } catch (e) { out[name] = { pass: false, detail: `threw: ${e?.stack ?? e}` }; } finally { Object.assign(console, keep); }
  }
  return out;
}

const file = given ?? LV;
const src = fs.readFileSync(file, 'utf8');
const res = await run(await loadArm(given ? 'given' : 'shipped', src));
for (const [name, r] of Object.entries(res)) console.log(`${r.pass ? 'PASS' : 'FAIL'} ${name} ${r.detail}`);
const bad = Object.values(res).filter((r) => !r.pass).length;
let missed = 0;
if (!given) {
  for (const [i, p] of PLANTS.entries()) {
    const n = src.split(p.from).length - 1;
    if (n !== 1) { missed += 1; console.log(`PLANT MISSED ${p.name}: its anchor occurs ${n} times (want 1)`); continue; }
    const r = await run(await loadArm(`plant${i}`, src.replace(p.from, p.to)), p.fails);
    const caught = p.fails.every((s) => !r[s].pass);
    if (!caught) missed += 1;
    console.log(`PLANT ${caught ? 'CAUGHT' : 'MISSED'} ${p.name}: ${p.fails.map((s) => `${s} ${r[s].pass ? 'held' : 'failed'}`).join(', ')}`);
  }
}
const why = [bad ? `${bad} of ${Object.keys(res).length} scenarios failed` : '', missed ? `${missed} of ${PLANTS.length} plants missed` : ''].filter(Boolean).join('; ');
console.log(`TEST-LIGHTING-STAGE-WINDOW${given ? ` (--lv ${given})` : ''}: ${why ? `FAIL (${why})` : 'OK'}`);
process.exit(why ? 1 : 0);
