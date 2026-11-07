// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-lighting-stage.mjs — GH-1202 gate for the lighting leaf's side of main.js's staging seam (window.__obStage.lightSet,
// seam contract v1.1). The light-set changes the leaf makes — the rig swap (RectAreaLights in or out, the canopy's visibility,
// the emitter topology) and the venue term's light-set part (the superseded table-owned probe, the fill hook on the unbaked
// materials) — go through lightSet as exact, idempotent apply / revert pairs, and what must follow the real apply (the values,
// the GI re-key, the disposal, the env re-bake, the venue capture) runs only after it. Two kinds of change apply at once
// instead: setVenue (main.js's degradeVenue bakes the env cube right after it) and a rebuild (its rig and venue term land in
// the rebuild's own task); a staged change they overtake lands as nothing.
//
//   S1 no seam   window.__obStage deleted (an older main.js): every change applies at once — a fixture apply hangs the rig in
//                the same call — and the leaf hands nothing over after boot (state().staging): the leaf half of the
//                contract's "optional both ways" rule
//   S2 staged    the same steps under a stand-in __obStage doing what main.js's staged path does (apply(); revert() in one
//                task, then apply() in a task of its own, one change at a time; 'immediate' where a step says so: apply()
//                inside lightSet) and checking around every change: revert() restores exactly what apply() found (the
//                lights with their parents, slots, visibility and intensity; the canopy's visibility; the rig group's
//                children; the emitter uniforms and count; every mesh material's own keying hooks and its program key; the
//                census tags; the leaf's installed fixture, suppression record and legacy map; the scene.add wrapper); apply()
//                and revert() are idempotent; a rig change moves what keys programs; the leaf follows a change up only after
//                its real apply, follows an 'immediate' one up in the same task, and holds state().venue.pending while a change
//                waits. Each step names the changes that must reach the seam and those that must not (setVenue, a rebuild's
//                rig and venue term, a re-created superseded probe), and after every step the settled state equals S1's.
//                Two overtakes (a rebuild after the staging, and one in the same call) and a setVenue over a staged venue
//                change leave the overtaken change landing as nothing; a rebuild lands a staged swap at once even when its
//                target is already the new table's default; while a canopy swap is staged, state().fixture still names the rig
//                that hangs (targetFixture the selection), so lampfade's env-bake bracket and camerascript's canopy restore keep
//                the canopy hidden; a staged swap that lands announces ob:relight (the shell's glare dim, table.js's lamp gate);
//                a change main applies inside lightSet overtakes an older staged one of its kind, and one staged after it lands.
//                Once each step settles, the rig that hangs is the selection. An env re-bake queued during a staged batch fires
//                only once none of the leaf's changes is staged, a full debounce after the last one landed (the #1202 calm
//                campaign: a bake inside the batch linked the hall keys' other state inline).
//   L1 / L2      the late rig (?obholdlight=1500: the leaf lands after the first frames), without and with the stand-in
//                present from the document's start (an accessor keeps it when main.js publishes its own seam): the boot rig
//                and its venue term (the probe hide, the fill hook) reach the seam as exact pairs, and the settled boot
//                states agree
//   plants       (--plants) one boot each over a planted lightingvisuals.js, lampfade.js or camerascript.js served through CDP
//                Fetch; each must turn its arm red by the check it names, at the step it names; an anchor that is missing or not
//                unique fails the plant
//
//   node web/tools/e2e-lighting-stage.mjs [--port N] [--plants]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome, sleep, spawnStaticServer, stopStaticServer } from './cdp.mjs';
import { SETTLE_SRC } from '../../tools/render/lib/lighting-page.mjs';

export const PORT_INVENTORY = { http: 1, cdp: 1 };
export const PORT_FLAGS = { '--port': 'http' };

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const PORT = Number(args.includes('--port') ? args[args.indexOf('--port') + 1] : (process.env.OB_E2E_PORT ?? 8343));
const CDP = Number(process.env.OB_E2E_CDP_PORT ?? 16343); // every boot closes before the next reuses it
const PLANTS = args.includes('--plants');
const LEAF = 'scene/lightingvisuals.js';
const RIM = 'pool_pro_9ft_metal_rim'; // venue default pdt_studio; a table term that supersedes the table-owned obPdtVenueAmbient
const EIGHT = 'pool_pro_8ft'; // no table term: pdt_studio brings its fixture term (the fill hook), the others none
const PROBE = 'obPdtVenueAmbient';

// a step: rig = the fixture a 'lighting:rig' change must name; venue = true: a venue change that moves the light set must
// reach the seam, false: no venue change may (it applies at once); now / after = a page expression true right after the call,
// read in the call's own task before (now) or after (after) its queued microtasks; delay = the stand-in's wait before its real
// apply (default 40 ms); immediate = the stand-in answers 'immediate' (apply() inside lightSet); overtake = the table whose
// rebuild lands after (sync: in the same call, before) the staged rig change's staging and before its real apply; mark = the
// venue change a setVenue at once (window.__stageArm.mark) must find staged and not yet applied
const fixture = (fx, b = 1, more = {}) => ({ label: `fixture ${fx}${b === 1 ? '' : ` at ${b}`}${more.immediate ? ' (immediate)' : ''}`,
  expr: `__lighting.apply('${fx}', ${b})`, rig: fx, ...more });
const SWITCH = (id) => `__settings.changeEquipment('table_id', '${id}', { skipConfirm: true })`;
const OFF = '__lighting.state().venue.suppressed === null', ON = '__lighting.state().venue.suppressed !== null';
// one call answered 'immediate' by the stand-in (S2), whatever is staged; without a seam (S1) the call simply applies at once
const IMMEDIATE = (call) => `(window.__obStage === window.__stageArm?.standIn && (window.__stageArm.immediate = true), ${call},
  window.__stageArm && (window.__stageArm.immediate = false), true)`;
const HIDDEN = `__dbg.scene.getObjectByName('${PROBE}')?.visible === false`;
// a rebuild that keeps the table id re-creates the superseded probe at its build literal: simulated by swapping in a fresh copy
const REPROBE = `(() => { const old = __dbg.scene.getObjectByName('${PROBE}'); const fresh = old.clone(); fresh.visible = true;
  fresh.intensity = __lighting.state().venue.legacyBuild[0]; old.parent.add(fresh); old.parent.remove(old); return __lighting.tableChanged(); })()`;
// while a staged canopy swap waits, the installed rig is still the old one: lampfade's env-bake bracket and camerascript's canopy
// restore (a script stop) must leave the canopy hidden — state().fixture is the installed rig (review P2 on 6c1cb82a). The truth
// is the canopy light's own visibility (the swap pair sets it), never state(); both hooks must exist and the script stop must
// succeed, else the check judges nothing
const CANOPY_KEPT = `(() => { const lr = window.__stageArm.room.lightRefs, L = __lighting.state(), canopy = window.__stageArm.room.rectLight.visible === true;
  if (typeof window.__lampfade?.suspendForBake !== 'function' || typeof window.__test?.cameraScript !== 'function') return 'no hooks';
  if (L.targetFixture !== 'canopy_panel') return 'target ' + L.targetFixture;
  const undo = window.__lampfade.suspendForBake(); const bake = lr.lampFace.visible === canopy; if (undo) undo();
  const stopped = window.__test.cameraScript(null) === true; return bake && stopped && lr.lampFace.visible === canopy; })()`;
const STEPS = [ // the boot hangs the table's venue default, pdt_studio, with the venue term on
  fixture('perimeter_ring', 1, { venue: false }),
  fixture('pendant_bar', 1.2, { venue: false }),
  { label: 'a bake and a script stop while a canopy swap is staged', expr: "__lighting.apply('canopy_panel', 1)", rig: 'canopy_panel',
    venue: false, delay: 3000, now: CANOPY_KEPT },
  fixture('snooker_luminaire', 1.2, { venue: false, immediate: true,
    now: "__lighting.state().fixture === 'snooker_luminaire' && __lighting.state().staging.pending === 0" }),
  // main may apply a newer change inside lightSet while an older one of its kind is still staged: the immediate one must overtake
  // it (the older lands as nothing), and a change staged after an immediate one must land (review P2 on 9f204656, both orders)
  { label: 'an immediate pendant_bar over a staged perimeter_ring', rig: 'pendant_bar', stale: 'perimeter_ring', relights: 0, venue: false,
    delay: 3000, expr: `(__lighting.apply('perimeter_ring', 1), ${IMMEDIATE("__lighting.apply('pendant_bar', 1)")})` },
  { label: 'a staged perimeter_ring after an immediate snooker_luminaire', rig: 'perimeter_ring', relights: 1, venue: false,
    expr: `(${IMMEDIATE("__lighting.apply('snooker_luminaire', 1.2)")}, __lighting.apply('perimeter_ring', 1.2))` },
  { label: 'venue off (at once)', expr: '__lighting.setVenue(false)', venue: false, now: OFF },
  { label: 'venue on (at once)', expr: '__lighting.setVenue(true)', venue: false, now: ON },
  { label: 'venue off with a swap staged (at once)', expr: "(__lighting.apply('pdt_studio', 1), __lighting.setVenue(false))", rig: 'pdt_studio', venue: false, now: OFF },
  { label: 'venue on again (at once)', expr: '__lighting.setVenue(true)', venue: false, now: ON },
  { label: 'a re-created superseded probe (a rebuild that keeps the table id)', expr: REPROBE, venue: false, after: HIDDEN },
  { label: `table ${EIGHT} (at once)`, expr: SWITCH(EIGHT), table: EIGHT, venue: false },
  // the fixture term leaves: the unhook is staged after the swap and lands 400 ms after it, past the 120 ms debounce of the re-bake
  // the swap's follow-up queued: that re-bake must wait for the unhook ('held')
  fixture('canopy_panel', 1, { venue: true, delay: 400, rebake: 'held' }),
  // it comes back: the hook is staged after the swap and lands inside the debounce of the re-bake the swap's follow-up queued
  // ('early'); the hook's follow-up queues no re-bake of its own, so that re-bake fires a full debounce after the hook, not at its due
  fixture('pdt_studio', 1.2, { venue: true, delay: 10, rebake: 'early' }),
  { label: `a staged auto (canopy_panel) a rebuild overtakes after its staging (table ${RIM})`, table: RIM, rig: 'canopy_panel', venue: false,
    expr: `(__lighting.apply('auto', 1), setTimeout(() => ${SWITCH(RIM)}, 300), true)`, delay: 8000, overtake: { table: RIM, sync: false } },
  { label: `a staged pendant_bar a rebuild overtakes in the same call (table ${EIGHT})`, table: EIGHT, rig: 'pendant_bar', venue: false,
    expr: `(__lighting.apply('pendant_bar', 1), ${SWITCH(EIGHT)})`, delay: 8000, overtake: { table: EIGHT, sync: true } },
  { label: 'a setVenue at once over a staged venue change', rig: 'pdt_studio', venue: true, delay: 3000, mark: true,
    expr: "(__lighting.apply('pdt_studio', 1), setTimeout(() => { window.__stageArm && (window.__stageArm.mark = performance.now()); __lighting.setVenue(false); }, 4500), true)",
    wait: 7000 },
  { label: 'venue on (at once, again)', expr: '__lighting.setVenue(true)', venue: false },
  // the rebuild's reconcile keeps a target that is already the new table's default: the staged swap must still land at once
  // (review P2 on 6c1cb82a: an explicit fixture, auto requested and staged, then a table whose default is the same canopy)
  { label: 'a staged auto (canopy_panel) the rebuild keeps as the default (table pool_pro_9ft)', table: 'pool_pro_9ft', rig: 'canopy_panel',
    venue: false, expr: `(__lighting.apply('auto', 1), ${SWITCH('pool_pro_9ft')})`, delay: 8000, overtake: { table: 'pool_pro_9ft', sync: true },
    now: "__lighting.state().fixture === 'canopy_panel'" },
  fixture('perimeter_ring', 0.8),
];

// page side: the exact snapshot, its diff and the stand-in seam. Installable at the document's start (L2): the module
// references it needs are resolved when the first change arrives, from the app's own module map.
const ARM_SRC = `(() => {
  if (window.__stageArm) return true;
  const own = (o, k) => (Object.prototype.hasOwnProperty.call(o, k) ? o[k] : '(none)');
  const keyOf = (m) => { try { return String(m.customProgramCacheKey()); } catch (e) { return 'threw: ' + e.message; } };
  const arm = { records: [], unresolved: 0, tail: Promise.resolve(), delayMs: 40, immediate: false, mark: null, relights: 0, room: null, shading: null, table: null };
  window.addEventListener('ob:relight', () => { arm.relights += 1; }); // the async-repaint wire (a staged swap that lands announces it)
  arm.ensure = async () => {
    if (!arm.room) arm.room = (await import('./scene/room.js')).activeRoom.instance;
    if (!arm.shading) arm.shading = await import('./scene/shading.js');
    if (!arm.table) arm.table = await import('./scene/table.js');
    return true;
  };
  const snap = () => {
    const scene = window.__dbg.scene, lights = [], mats = new Map(), tags = [];
    scene.traverse((o) => {
      if (o.isLight) lights.push([o.uuid, o.type, o.visible, o.parent ? o.parent.uuid : null, o.parent ? o.parent.children.indexOf(o) : -1, o.intensity, o.castShadow]);
      if (!o.isMesh) return;
      tags.push([o.uuid, own(o.userData, 'obVenueClass')]);
      for (const m of [].concat(o.material)) if (m && !mats.has(m)) mats.set(m, [own(m, 'onBeforeCompile'), own(m, 'customProgramCacheKey'), keyOf(m)]);
    });
    const lr = arm.room.lightRefs, u = window.__gi.uniforms, st = window.__lighting.state();
    const v = (x) => x.toArray(), vs = (un) => un.value.map(v);
    return { lights, mats, tags, rig: lr.group.children.map((c) => c.uuid),
      canopy: [lr.lampFace.visible, lr.hood.visible, ...lr.rods.map((r) => r.visible), arm.room.rectLight.visible],
      rectLights: lr.rectLights.map((l) => l.uuid), fixtureMeshes: (window.__lighting.fixtureMeshes() || []).map((m) => m.uuid),
      emitters: JSON.stringify([v(u.uLightPos.value), vs(u.uLightPosN), v(u.uLightHalf.value), vs(u.uLightHalfN), u.uLightCount.value,
        v(u.uRoomMax.value), arm.shading.SPIKE_EMITTERS.count]),
      leaf: JSON.stringify([st.fixture, st.venue.suppressed, st.venue.legacyBuild]), add: own(scene, 'add') };
  };
  const diff = (a, b) => {
    const out = [];
    const list = (name, x, y) => {
      for (let i = 0; i < Math.max(x.length, y.length); i++) {
        if (JSON.stringify(x[i]) !== JSON.stringify(y[i])) { out.push(name + '[' + i + '] ' + JSON.stringify(x[i]) + ' -> ' + JSON.stringify(y[i])); return; }
      }
    };
    for (const k of ['lights', 'tags', 'rig', 'canopy', 'rectLights', 'fixtureMeshes']) list(k, a[k], b[k]);
    if (a.emitters !== b.emitters) out.push('emitters ' + a.emitters + ' -> ' + b.emitters);
    if (a.leaf !== b.leaf) out.push('leaf ' + a.leaf + ' -> ' + b.leaf);
    if (a.add !== b.add) out.push('the own scene.add changed');
    for (const [m, e] of a.mats) {
      const f = b.mats.get(m), id = 'material ' + (m.name || m.type) + ' ' + m.uuid.slice(0, 8);
      if (!f) { out.push(id + ' left the scene'); continue; }
      if (e[0] !== f[0]) out.push(id + ': its own onBeforeCompile changed');
      if (e[1] !== f[1]) out.push(id + ': its own customProgramCacheKey changed');
      if (e[2] !== f[2]) out.push(id + ': key ' + e[2].slice(-40) + ' -> ' + f[2].slice(-40));
    }
    for (const m of b.mats.keys()) if (!a.mats.has(m)) out.push('material ' + (m.name || m.type) + ' ' + m.uuid.slice(0, 8) + ' joined the scene');
    return out;
  };
  // the leaf counts a change as pending from before it hands it over until its follow-up, so it can never count fewer than
  // the seam has not resolved of its changes: fewer = a follow-up ran before its real apply. Other owners' changes (the shell's
  // hall keys, where a main.js with its own seam keeps the stand-in) are staged the same way and recorded, but not counted.
  const leafPending = () => window.__lighting.state().staging.pending;
  arm.standIn = { version: 1, lightSet(change) {
    const rec = { why: String(change.why), moved: null, exact: null, idemApply: null, idemRevert: null, early: [], immediate: arm.immediate,
      stagedAt: null, realAt: null, stagedTable: null, tableAtReal: null, pendingAtReal: null };
    arm.records.push(rec);
    if (arm.immediate) { change.apply(); rec.realAt = performance.now(); return Promise.resolve('immediate'); } // main.js's at-once path
    const leaf = rec.why.startsWith('lighting:');
    if (leaf) arm.unresolved += 1;
    const early = (at) => { const n = leafPending(); if (n < arm.unresolved) rec.early.push(at + ': the leaf counts ' + n + ' pending, the seam ' + arm.unresolved); };
    const run = async () => {
      if (!arm.room) await arm.ensure(); // installed at the document's start: the first change resolves the module references
      early('at staging');
      rec.stagedAt = performance.now(); rec.stagedTable = arm.table.activeTableId?.() ?? null;
      const s0 = snap(); change.apply(); const s1 = snap(); change.apply(); const s1b = snap();
      change.revert(); const s2 = snap(); change.revert(); const s2b = snap();
      rec.moved = diff(s0, s1); rec.idemApply = diff(s1, s1b); rec.exact = diff(s0, s2); rec.idemRevert = diff(s2, s2b);
      await new Promise((r) => setTimeout(r, arm.delayMs));
      early('at the real apply');
      const v = window.__lighting.state().venue;
      rec.pendingAtReal = [v.pending === true, v.capturePending === true || v.rebakeQueued === true];
      rec.realAt = performance.now(); rec.tableAtReal = arm.table.activeTableId?.() ?? null;
      change.apply(); if (leaf) arm.unresolved -= 1;
      return 'staged';
    };
    const p = arm.tail.then(run, run);
    arm.tail = p.then(() => {}, () => {});
    return p;
  } };
  window.__stageArm = arm;
  return true;
})()`;

// the settled state compared across the arms (no identities: separate boots)
const SETTLED = `(() => {
  const L = __lighting.state(), lights = [], spike = new Set(), tags = {}; let fill = 0;
  __dbg.scene.traverse((o) => {
    if (o.isLight && o.visible) lights.push([o.type, +o.intensity.toFixed(5), o.color.getHexString(), o.width ?? null, o.height ?? null,
      o.position.toArray().map((x) => +x.toFixed(4))]);
    if (!o.isMesh) return;
    const t = o.userData.obVenueClass; if (t) tags[t] = (tags[t] || 0) + 1;
    for (const m of [].concat(o.material)) { if (!m) continue; let k = ''; try { k = String(m.customProgramCacheKey()); } catch { k = 'threw'; }
      if (k.includes('|venuefill')) fill += 1; if (k.startsWith('spike')) spike.add(k.split('|')[0]); }
  });
  const u = __gi.uniforms;
  return { fixture: L.fixture, targetFixture: L.targetFixture, brightness: L.brightness, auto: L.auto, lights, fill, spike: [...spike].sort(), tags,
    count: u.uLightCount.value, roomMaxY: +u.uRoomMax.value.y.toFixed(4), venue: { on: L.venue.on, suppressed: L.venue.suppressed,
    legacy: L.venue.legacyBuild, derived: L.venue.derived ?? null }, gi: __gi.state.fixture ?? null };
})()`;

const plantOf = (src, a, b, n = 1) => {
  const k = src.split(a).length - 1;
  if (k !== n) throw new Error(`plant anchor found ${k} time(s), want ${n}: ${a.trim().slice(0, 70)}`);
  return src.split(a).join(b);
};
const IMMEDIATE_LINE = '    if (change.applied()) { epoch[kind]++; entry.e = epoch[kind]; follow(false); }\n';
const REBAKE_DEBOUNCE_MS = 120; // the leaf's default re-bake debounce (no ?venueDebounce seam in these boots)
const STAGE_HOLD_LINE = '    if (stagesPending > 0) { rebakeTimer = setTimeout(fireQueuedRebake, VENUE_POLL_MS); if (venue.rebakeSched) venue.rebakeSched.dueAt = performance.now() + VENUE_POLL_MS; return; }\n';
const LANDING_WAIT_LINE = '    if (wait > 0) { rebakeTimer = setTimeout(fireQueuedRebake, wait); if (venue.rebakeSched) venue.rebakeSched.dueAt = performance.now() + wait; return; }\n';
// [name, the arm it runs, the check that must turn red, the step (label substring) it must turn red at, the planted source]
// (`src` = the leaf; a plant that names another served file returns [file, source])
const PLANT_SET = (src, read) => [
  ['revert leaves the emitter topology', 'S2', 'exact', 'fixture perimeter_ring', () => plantOf(src, '        restoreEmitters(prev.emitters);\n', '')],
  ['revert re-attaches the rig in removal order', 'S2', 'exact', 'fixture perimeter_ring', () => plantOf(src, '    for (const [o, idx] of recs.slice().reverse()) {\n', '    for (const [o, idx] of recs.slice()) {\n')],
  ['revert leaves the fill hook state', 'S2', 'exact', 'fixture pdt_studio at 1.2', () => plantOf(src, "      putOwn(m, 'onBeforeCompile', e.compile);\n      putOwn(m, 'customProgramCacheKey', e.key);\n", '')],
  ['revert leaves the probe as apply set it', 'L2', 'exact', 'the late rig', () => plantOf(src, '    for (const p of snap.probes) { p.o.intensity = p.intensity; p.o.visible = p.visible; }\n', '    for (const p of snap.probes) p.o.intensity = p.intensity;\n')],
  ['a second apply re-reads what the swap replaces', 'S2', 'exact', 'fixture perimeter_ring', () => plantOf(src, '        if (prev) return;\n', '')],
  ['the follow-up runs before the real apply', 'S2', 'early', 'fixture perimeter_ring', () => plantOf(src, IMMEDIATE_LINE, '    follow(false);\n')],
  ["an 'immediate' change is followed up a microtask later", 'S2', 'now', 'fixture snooker_luminaire at 1.2 (immediate)', () => plantOf(src, IMMEDIATE_LINE, '    if (change.applied()) { epoch[kind]++; entry.e = epoch[kind]; }\n')],
  ['an immediate change leaves an older stage of its kind live', 'S2', 'target', 'an immediate pendant_bar over a staged perimeter_ring', () => plantOf(src, IMMEDIATE_LINE, '    if (change.applied()) follow(false);\n')],
  ['an immediate change keeps its old epoch', 'S2', 'settle', 'fixture snooker_luminaire at 1.2 (immediate)', () => plantOf(src, IMMEDIATE_LINE, '    if (change.applied()) { epoch[kind]++; follow(false); }\n')],
  ['a re-bake fires while the leaf has changes staged', 'S2', 'rebake', 'fixture canopy_panel', () => plantOf(src, STAGE_HOLD_LINE, '')],
  ['the re-bake ignores the batch\'s last landing', 'S2', 'rebake', 'fixture pdt_studio at 1.2', () => plantOf(src, LANDING_WAIT_LINE, '')],
  ['the leaf ignores the seam', 'S2', 'none', 'fixture perimeter_ring', () => plantOf(src, "    return s && s.version === 1 && typeof s.lightSet === 'function' ? s : null;\n", '    return null;\n')],
  ['setVenue goes through the seam', 'S2', 'now', 'venue off (at once)', () => plantOf(src, '      atOnce++; // GH-1202: at once — main.js\'s degradeVenue bakes the env cube right after this call\n      try { venueReapply(); } finally { atOnce--; }\n', '      venueReapply();\n')],
  ['a rebuild stages its rig and venue term', 'S2', 'atonce', 'a re-created superseded probe', () => plantOf(src, '    const rebuilt = mark.some((x, i) => x !== lastBuild[i]);\n', '    const rebuilt = false;\n')],
  ['a rebuild keeps a staged swap whose target is its default', 'S2', 'now', 'the rebuild keeps as the default', () => plantOf(src, "      if (livePending('rig')) applyFixture(state.fixture, () => { applyValues(); scheduleRebake(); });\n", '')],
  ['state().fixture names the target while a swap is staged', 'S2', 'now', 'a bake and a script stop', () => plantOf(src, '        fixture: appliedFixture,\n', '        fixture: state.fixture,\n')],
  ['a staged swap lands without announcing ob:relight', 'S2', 'relight', 'fixture perimeter_ring', () => plantOf(src, "      if (late) window.dispatchEvent(new CustomEvent('ob:relight'));\n", '')],
  ["an 'immediate' swap announces ob:relight inside the call", 'S2', 'relight', '(immediate)', () => plantOf(src, "      if (late) window.dispatchEvent(new CustomEvent('ob:relight'));\n", "      window.dispatchEvent(new CustomEvent('ob:relight'));\n")],
  ['a rebuild stages its rig', 'S2', 'atonce', 'overtakes after its staging', () => plantOf(src, '    const seam = atOnce ? null : stageSeam();\n    if (!seam) { epoch.rig++; change.apply(); follow(); return; }\n', '    const seam = stageSeam();\n    if (!seam) { epoch.rig++; change.apply(); follow(); return; }\n')],
  ['a rebuild that keeps the table id is not seen', 'S2', 'now', 'a re-created superseded probe', () => plantOf(src, '  const buildMark = () => [tableMod.activeTableId?.() ?? null, ...SUPERSEDED.map((n) => scene?.getObjectByName?.(n) ?? null)];\n', '  const buildMark = () => [tableMod.activeTableId?.() ?? null];\n')],
  ['a staged change an at-once change overtook still lands', 'S2', 'settle', 'overtakes after its staging', () => plantOf(src, '    const guarded = { apply: () => { if (!live()) return; if (rigWindowOpen()) { skipped = true; return; } if (!skipped) change.apply(); }, revert: change.revert };\n', '    const guarded = { apply: () => { if (rigWindowOpen()) { skipped = true; return; } if (!skipped) change.apply(); }, revert: change.revert };\n')],
  ['venue.pending drops while a change is staged', 'S2', 'pending', 'fixture perimeter_ring', () => plantOf(src, 'pending: venue.pending || stagesPending > 0 || ', 'pending: venue.pending || ', 2)],
];

async function waitSettled(c, budgetMs = 90000) {
  let run = 0; const t0 = Date.now();
  while (Date.now() - t0 < budgetMs) {
    const s = await c.eval(`(() => { const s = ${SETTLE_SRC}; return !!s.settled && window.__lighting.state().staging.pending === 0; })()`).catch(() => false);
    run = s ? run + 1 : 0;
    if (run >= 3) return true;
    await sleep(250);
  }
  return false;
}

/** The stand-in's records for one step: every staged pair exact and idempotent, no follow-up before its real apply,
 * venue.pending held at the real apply, the named rig change present (exactly once where a rebuild overtakes it) and moving
 * what keys programs, the venue change present (venue: true) or absent (venue: false), the overtake / mark timing real. */
function judge(all, label, { rig, venue, overtake, mark, stale: staleFx }, markAt, no) {
  const recs = all.filter((r) => r.why.startsWith('lighting:')); // the leaf's own changes
  for (const r of recs) {
    if (r.immediate) continue; // applied inside lightSet: nothing staged to judge
    for (const k of ['exact', 'idemApply', 'idemRevert']) {
      if (r[k] === null) no('exact', `${label}: ${r.why} was never staged`);
      else if (r[k].length) no(k === 'exact' ? 'exact' : 'idem', `${label}: ${r.why}: ${k === 'exact' ? 'revert() did not restore what apply() found' : `${k} is not idempotent`}: ${r[k].slice(0, 4).join(' | ')}`);
    }
    if (r.early.length) no('early', `${label}: ${r.why}: ${r.early.join('; ')}`);
    if (r.pendingAtReal && r.pendingAtReal[0] !== true) no('pending', `${label}: ${r.why}: venue.pending read false while the change waited for its real apply`);
    // an overtaken pick is stale by its staging when the rebuild ran in the same call (a pool table builds synchronously)
    const stale = (overtake?.sync && r.why === `lighting:rig ${rig}`) || (staleFx && r.why === `lighting:rig ${staleFx}`);
    if (r.why.startsWith('lighting:rig') && !stale && !(r.moved?.length > 0)) no('exact', `${label}: ${r.why} moved nothing that keys a program`);
  }
  const whys = recs.map((r) => r.why).join(', ') || 'none';
  const rigs = recs.filter((r) => r.why === `lighting:rig ${rig}`);
  if (rig && !rigs.length) no('none', `${label}: no 'lighting:rig ${rig}' change reached the seam (${whys})`);
  if (venue === true && !recs.some((r) => r.why === 'lighting:venue' && r.moved?.length > 0)) no('none', `${label}: no venue change that moves the light set reached the seam (${whys})`);
  if (venue === false && recs.some((r) => r.why === 'lighting:venue')) no('atonce', `${label}: a venue change reached the seam where it must apply at once (${whys})`);
  if (overtake) {
    if (recs.filter((r) => r.why.startsWith('lighting:rig')).length > 1) no('atonce', `${label}: a second rig change reached the seam: the rebuild's re-hang must apply at once (${whys})`);
    const r = rigs[0];
    const ok = r && r.tableAtReal === overtake.table && (overtake.sync ? r.stagedTable === overtake.table : r.stagedTable !== overtake.table);
    if (!ok) no('invalid', `${label}: INVALID (precondition): the ${overtake.table} rebuild did not land ${overtake.sync ? 'before the staging' : 'between the staging and the real apply'} (${JSON.stringify(rigs.map((x) => [x.stagedTable, x.tableAtReal]))})`);
  }
  if (mark && !recs.some((r) => r.why === 'lighting:venue' && r.stagedAt !== null && r.stagedAt < markAt && r.realAt > markAt)) {
    no('invalid', `${label}: INVALID (precondition): the setVenue at ${Math.round(markAt)} did not fall between a venue change's staging and its real apply (${JSON.stringify(recs.map((x) => [x.why, Math.round(x.stagedAt), Math.round(x.realAt)]))})`);
  }
}

/** One boot. mode 'S1' (no seam), 'S2' (the stand-in after boot), 'L1' / 'L2' (the late rig without / with the stand-in from
 * the document's start). A plant boot stops at the first failure of the check it names. Resolves { bad: [[check, message]],
 * settled: { label: state }, pendingReads }. */
async function runArm(mode, { plant = null, stopOn = null } = {}) {
  const bad = [], settled = {};
  const no = (check, msg) => bad.push([check, msg]);
  const late = mode === 'L1' || mode === 'L2';
  const c = await launchChrome(`http://127.0.0.1:${PORT}/`, { port: CDP, tool: false });
  const errors = [];
  let pendingReads = 0; // staged real applies where venue.pending had no other reason to read true
  try {
    await c.send('Page.enable'); await c.send('Runtime.enable');
    c.onEvent((m, p) => {
      if (m === 'Runtime.exceptionThrown') errors.push(p.exceptionDetails.exception?.description ?? p.exceptionDetails.text);
      else if (m === 'Runtime.consoleAPICalled' && p.type === 'error') errors.push(p.args.map((a) => a.value ?? a.description).join(' '));
      else if (m === 'Fetch.requestPaused') {
        c.send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 200, body: Buffer.from(plant.src).toString('base64'),
          responseHeaders: [{ name: 'Content-Type', value: 'text/javascript; charset=utf-8' }, { name: 'Cache-Control', value: 'no-store' }] }).catch(() => {});
      }
    });
    if (plant) await c.send('Fetch.enable', { patterns: [{ urlPattern: `*${plant.file}*`, requestStage: 'Request' }] });
    // L2: an accessor keeps the stand-in when main.js publishes its own seam (main's object is kept aside, unused by the leaf)
    if (mode === 'L2') await c.send('Page.addScriptToEvaluateOnNewDocument', { source: `${ARM_SRC}; Object.defineProperty(window, '__obStage', { configurable: true,
      get: () => window.__stageArm.standIn, set: (v) => { window.__stageArm.mainSeam = v; } });` });
    await c.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/app.html?obtool=1&seed=1&table=${RIM}${late ? '&obholdlight=1500' : ''}` });
    let ready = false;
    for (let i = 0; i < 300 && !ready; i++) { await sleep(200); ready = await c.eval('window.__test?.ready === true && !!window.__lighting').catch(() => false); }
    if (!ready) { no('boot', 'the app never became ready'); return { bad, settled, pendingReads }; }
    await sleep(1800);
    if (!(await waitSettled(c))) { no('boot', 'the boot never settled'); return { bad, settled, pendingReads }; }
    if (!(await c.eval('!!window.__lighting.state().staging'))) { no('boot', 'the lighting leaf has no staging census (a leaf without the GH-1202 seam)'); return { bad, settled, pendingReads }; }
    await c.eval(ARM_SRC);
    await c.eval('window.__stageArm.ensure()');
    if (late) {
      settled.boot = await c.eval(SETTLED);
      if (mode === 'L2') {
        if (!(await c.eval('window.__obStage === window.__stageArm.standIn'))) no('invalid', 'INVALID (precondition): the stand-in is not the seam the leaf reads');
        judge(await c.eval('window.__stageArm.records'), 'the late rig', { rig: 'pdt_studio', venue: true }, 0, no);
      }
    } else {
      // the census after boot: a main.js with its own seam already answered the boot's changes ('immediate')
      const changes0 = await c.eval('window.__lighting.state().staging.changes');
      if (mode === 'S2') await c.eval('(window.__obStage = window.__stageArm.standIn, true)');
      for (const step of STEPS) {
        if (stopOn && bad.some(([k]) => k === stopOn)) break;
        const { label, expr, rig, now, after, table: id, delay = 40, immediate = false, wait = 0 } = step;
        const [r0, relight0, t0] = mode === 'S2' ? await c.eval(`(window.__stageArm.delayMs = ${delay}, window.__stageArm.immediate = ${immediate}, window.__stageArm.mark = null,
          [window.__stageArm.records.length, window.__stageArm.relights, performance.now()])`) : [0, 0, 0];
        // now: read in the call's own task, before anything is awaited; after: once its queued microtasks ran, same task
        const at = await c.eval(`(async () => { ${mode === 'S1' ? 'delete window.__obStage;' : ''} const ret = ${expr}; const s = __lighting.state();
          const at = { applied: s.fixture, pending: s.staging.pending, now: ${now ?? 'null'} }; const ok = await ret;
          await null; return { ...at, ok, after: ${after ?? 'null'} }; })()`);
        // apply() and the settings seam answer false when they refuse; setVenue / tableChanged return other things
        if (at.ok === false && (rig || id) && !expr.includes('setVenue')) { no('step', `${label}: the call refused`); continue; }
        if (mode === 'S1' && rig && !id && !step.mark && (at.applied !== rig || at.pending !== 0)) {
          no('S1', `${label}: without the seam the rig did not hang in the same call (applied ${at.applied}, pending ${at.pending})`);
        }
        if (now && at.now !== true) no('now', `${label}: the change did not apply in the call's own task (${now} read ${at.now})`);
        if (after && at.after !== true) no('now', `${label}: the change did not apply in the call's own task, its microtasks included (${after} read ${at.after})`);
        if (wait) await sleep(wait);
        if (id) {
          let landed = false;
          for (let i = 0; i < 150 && !landed; i++) { await sleep(200); landed = await c.eval(`import('./scene/table.js').then((m) => m.activeTableId() === '${id}')`).catch(() => false); }
          if (!landed) { no('step', `${label}: the switch never landed`); continue; }
          await sleep(800); // the equipment broadcast's own lighting re-check lands first
        }
        if (!(await waitSettled(c))) { no('settle', `${label}: never settled`); continue; }
        await sleep(300);
        settled[label] = await c.eval(SETTLED);
        if (mode === 'S2') {
          const recs = await c.eval(`window.__stageArm.records.slice(${r0})`);
          pendingReads += recs.filter((r) => r.pendingAtReal && !r.pendingAtReal[1]).length;
          judge(recs, label, step, await c.eval('window.__stageArm.mark ?? -1'), no);
          // a staged swap that lands fresh announces ob:relight; an 'immediate' one lands inside the call, before the settings
          // broadcast, and announces nothing (an overtaken one is stale)
          const relights = (await c.eval('window.__stageArm.relights')) - relight0;
          if (step.relights !== undefined) { if (relights !== step.relights) no('relight', `${label}: ob:relight announced ${relights} time(s), want ${step.relights}`); }
          else if (rig && !immediate && !step.overtake && relights < 1) no('relight', `${label}: the staged swap landed without announcing ob:relight`);
          else if (immediate && relights > 0) no('relight', `${label}: the 'immediate' swap announced ob:relight ${relights} time(s) inside the call`);
          // a re-bake queued during the staged batch fires with none of the leaf's changes staged, a full debounce after the last landed
          if (step.rebake) {
            const bakes = (await c.eval('__lighting.state().staging.bakes')).filter((b) => b.at >= t0);
            const reals = (w) => recs.filter((r) => r.why.startsWith(w) && Number.isFinite(r.realAt)).map((r) => r.realAt);
            const lastReal = Math.max(...reals('lighting:')), rigAt = Math.min(...reals('lighting:rig')), venueAt = Math.max(...reals('lighting:venue'));
            // a re-bake was pending before the batch's last landing (the one the swap's follow-up queued); for 'early' the batch ends
            // inside that re-bake's debounce, and for 'held' it outlasts it, or a re-bake that ignored the batch would fire after it
            // anyway (and pass)
            const first = bakes[0];
            if (!first || !(first.queued > 0 && first.queued < venueAt)) {
              no('invalid', `${label}: INVALID (precondition): no re-bake was queued before the batch's last landing (queued ${first?.queued}, venue landed ${Math.round(venueAt)})`);
            }
            if (step.rebake === 'early' && !(venueAt - first.queued < REBAKE_DEBOUNCE_MS - 10)) {
              no('invalid', `${label}: INVALID (precondition): the venue stage landed ${Math.round(venueAt - first.queued)} ms after the re-bake was queued, not inside its ${REBAKE_DEBOUNCE_MS} ms debounce`);
            }
            if (step.rebake === 'held' && !(venueAt - rigAt > REBAKE_DEBOUNCE_MS)) {
              no('invalid', `${label}: INVALID (precondition): the venue stage landed ${Math.round(venueAt - rigAt)} ms after the rig, not past the ${REBAKE_DEBOUNCE_MS} ms debounce`);
            }
            if (!bakes.length) no('rebake', `${label}: no env re-bake fired after the staged batch`);
            for (const b of bakes) if (b.staged > 0) no('rebake', `${label}: a re-bake fired with ${b.staged} of the leaf's change(s) still staged`);
            if (first && !(first.at >= lastReal + REBAKE_DEBOUNCE_MS - 2)) {
              no('rebake', `${label}: the re-bake fired ${Math.round(first.at - lastReal)} ms after the batch's last landing, inside the ${REBAKE_DEBOUNCE_MS} ms debounce`);
            }
          }
        }
        // once settled the rig that hangs is the selection (an older change landing over a newer one leaves them apart)
        if (settled[label].fixture !== settled[label].targetFixture) {
          no('target', `${label}: the installed rig ${settled[label].fixture} is not the selection ${settled[label].targetFixture}`);
        }
      }
      const end = await c.eval(`(() => { const s = __lighting.state().staging; return { s, n: window.__stageArm.records.filter((r) => r.why.startsWith('lighting:')).length }; })()`);
      const handed = end.s.changes - changes0;
      if (mode === 'S1' && (handed !== 0 || end.s.pending !== 0)) no('S1', `without the seam the leaf handed ${handed} change(s) over after boot (pending ${end.s.pending})`);
      if (mode === 'S2') {
        if (end.n === 0) no('none', 'the stand-in seam received no light-set change');
        if (handed !== end.n) no('none', `the leaf's census counts ${handed} answered change(s) after boot, the seam received ${end.n}`);
        if (pendingReads === 0) no('invalid', 'INVALID (precondition): no staged real apply read venue.pending with no capture or re-bake pending (the pending check judged nothing)');
      }
    }
    if (errors.length) no('console', `console errors: ${errors.slice(0, 3).join(' | ')}`);
    return { bad, settled, pendingReads };
  } finally {
    try { await c.closeAndWait(); } catch { /* gone */ }
  }
}

const sameSettled = (a, b, labels, no) => {
  for (const label of labels) {
    const x = JSON.stringify(a[label]), y = JSON.stringify(b[label]);
    if (x === undefined || y === undefined) continue; // the step's own failure is reported
    if (x !== y) no('settled', `${label}: the staged arm settled elsewhere\n  no seam ${x}\n  staged  ${y}`);
  }
};

const server = spawnStaticServer(webDir, PORT);
await sleep(700);
let failed = false;
const report = (arm, bad) => { for (const [check, msg] of bad) { failed = true; console.error(`E2E-LIGHTING-STAGE FAIL [${arm} ${check}] ${msg}`); } };
try {
  const s1 = await runArm('S1'), s2 = await runArm('S2'), l1 = await runArm('L1'), l2 = await runArm('L2');
  const labels = STEPS.map((s) => s.label);
  sameSettled(s1.settled, s2.settled, labels, (k, m) => s2.bad.push([k, m]));
  sameSettled(l1.settled, l2.settled, ['boot'], (k, m) => l2.bad.push([k, m]));
  for (const [arm, r] of [['S1', s1], ['S2', s2], ['L1', l1], ['L2', l2]]) report(arm, r.bad);
  if (!failed) {
    console.log(`OK   S1 / S2: ${labels.length} steps; every staged pair exact and idempotent, no follow-up before its real apply, `
      + `the 'immediate' one followed up in its task, venue.pending held (${s2.pendingReads} staged real apply(ies) with nothing else pending), `
      + 'setVenue, the rebuilds and a re-created probe at once, the overtaken changes landed as nothing, every settled state equal');
    console.log('OK   L1 / L2: the late rig and its venue term staged as exact pairs; the settled boot states agree');
  }
  if (PLANTS) {
    const read = (f) => fs.readFileSync(path.join(webDir, f), 'utf8');
    for (const [name, arm, check, at, make] of PLANT_SET(read(LEAF), read)) {
      let planted;
      try { planted = make(); } catch (e) { failed = true; console.error(`E2E-LIGHTING-STAGE FAIL [plant] ${name}: ${e.message}`); continue; }
      const [file, src] = Array.isArray(planted) ? planted : [LEAF, planted];
      const r = await runArm(arm, { plant: { file, src }, stopOn: check === 'settled' ? null : check });
      if (arm === 'S2') sameSettled(s1.settled, r.settled, labels, (k, m) => r.bad.push([k, m]));
      if (arm === 'L2') sameSettled(l1.settled, r.settled, ['boot'], (k, m) => r.bad.push([k, m]));
      const hit = r.bad.find(([k, m]) => k === check && m.includes(at));
      if (hit) console.log(`OK   plant refused: ${name} — ${check} at '${at}': ${hit[1].slice(0, 150).replace(/\n/g, ' ')}`);
      else { failed = true; console.error(`E2E-LIGHTING-STAGE FAIL [plant] ${name}: no '${check}' failure at '${at}' (${r.bad.map(([k, m]) => `${k}: ${m.slice(0, 80)}`).join(' | ') || `${arm} stayed green`})`); }
    }
  }
} finally {
  await stopStaticServer(server);
}
console.log(failed ? 'E2E-LIGHTING-STAGE FAIL' : 'E2E-LIGHTING-STAGE PASS');
process.exitCode = failed ? 1 : 0;
