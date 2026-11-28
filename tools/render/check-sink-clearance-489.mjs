#!/usr/bin/env node

// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * check-sink-clearance-489 — GH-489 SNK-R36 (review round 10 P2 B): the BALL / LEATHER clearance of the drop animation,
 * replayed in node without a browser — the reviewer's own method, generalised into an instrument.
 *
 * For every scripted S2p corner pot (v0 0.94 slow scratch, 1.2 with the cue-ball scratch, 2.5, 4.5 — the e2e-snooker lane) and both S2m
 * middle pots (0.9, 1.8), the shot is simulated through the SELECTED TREE's committed WASM; at each BallPocket event
 * the capture state is read the way game.js reads it (position at the event, velocity over the final ≤ 20 ms leg,
 * pre-motion); game.js's lip-pivot GATE is mirrored (nearest visual fall to the kernel cup; the R34 identity form);
 * the pivot is built by the tree's OWN sinkpivot.js (buildSinkPivot — passed the tree's pocketVisualFalls() and
 * pocketPlateDatums() explicitly, exactly the arrays the browser's dynamic import hands it) and the pose sampled with
 * its OWN poseInSink every 0.5 ms until the shield cull; when the gate rejects, game.js's legacy glide law is mirrored
 * (labelled `glide(mirror)`). Against the pose the tool holds every vertex the pocket's BUILT leather builders return
 * (table.js snkPlateSpec → snkPlateGeoms: on a corner `cap` + `ends`, on a middle `cap` + `valance`; the stitches, emboss,
 * fall wall, ring and track are the BROWSER row's alone — world frame, the geometry the app draws) and reports the
 * minimum of (distance − ball radius) over the WHOLE descent: negative = penetration, in mm.
 *
 * The browser row (e2e-snooker S2p/S2m through window.__test.sinkClearance) is the GATE — it reads the real game.js
 * path and every built mesh of the pocket (incl. the fall wall); this instrument is the fast loop, the red arm against
 * an older tree, and the record of the (c)/(d) variants. Rows: exit 0 when every row's min clearance ≥ --min-mm
 * (default 0), 1 otherwise, 2 on usage / unknown table.
 *
 *   node tools/render/check-sink-clearance-489.mjs [--web <dir>] [--table wpbsa_snooker_12ft] [--json out.json]
 *        [--min-mm 0] [--falls kernel|plate|derived] [--no-throats] [--shots s2p,s2m]
 *
 *   --falls plate    (d) the pre-R34 corner aperture: the plate datum is handed to the gate + pivot (record only)
 *   --falls derived  (c) a plate-centred disc whose radius is that shot's capture distance (record only)
 *   --no-throats     the pivot gets `throats: []` — the SNK-R36 pre-roll branch disabled (the red arm on a new tree)
 *   --envelope-arms  ORDER-SNK-COMPANION-ENVELOPE-CACHE (review 775r12 P2 on #637, class E1): the collar envelope's per-build memo —
 *                    (a) cold build once, warm calls < 1 ms (both printed, ratio guarded); (a2) a warm call returns the SAME frozen
 *                    object; (b) the rebuilt envelope (after an invalidation) is byte-identical to the first build; (c) invalidation:
 *                    a buildTable() (node: it throws at `window` AFTER its per-build reset) → the next call rebuilds (new object) — the
 *                    stale-cache red arm; the throat-off arm bit (the cap swap under the tree's own arm convention) returns null and
 *                    leaves the memo intact; middles / non-snooker never build; (d) the memo variable is read and written only by
 *                    pocketCollarEnvelope and reset only by the two build sites (a source census); ruling (C) — (e) after a build
 *                    + one idle tick the first pot reads warm, (f) a pot before the tick gets the lazy build and the tick does not
 *                    rebuild, (g) non-snooker builds schedule nothing (the cells give node a fake window + a capturing
 *                    requestIdleCallback and run the tick by hand). Runs BEFORE this tool's own envelope read so the first call it
 *                    times is the process's first. Exit 0 ARMED / 1 NOT ARMED.
 *   --sweep          the KERNEL-REACHABLE census into pocket 5 (refuter 1 of SNK-R36): one cue ball on 396 lanes — bearings
 *                    −70…+70° off the corner diagonal (step 7°) × distances 0.6 / 1.2 m × aim offsets −8…+8° (step 2°) ×
 *                    v0 1.0 / 2.5 — every capture at pocket 5 replayed with THIS tree's pose law (and, with `--old <tree>`,
 *                    that tree's sinkpivot.js on the same capture) against the built cap: counts of penetrating captures,
 *                    the worst rows, the roll-direction census. INFORMATIONAL (exit 0; the numbers are the record of the
 *                    off-axis OPEN row of §R3c.42); `--json` writes every capture.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
// FIX10 law (main's parse-first fence, applied at the #637 main merge): ONE parse of the whole argv to completion BEFORE any effect — help exits 0,
// a malformed line exits 2 — the tool's own opt()/has() readers below read the same argv; unknown options stay ignored (this tool never refused them).
const { parseArgv: __parseArgv } = await import('./lib/argv.mjs');
const __P = __parseArgv({ tag: 'sink-clearance', value: ['--falls', '--gate', '--json', '--min-mm', '--old', '--shots', '--table', '--v0', '--web'], bool: ['--envelope-arms', '--no-throats', '--sweep'] });

const opt = (k, d = null) => { const v = __P.value(k); return v === null || v === undefined ? d : v; }; // reads through the ONE parse
const has = (k) => __P.has(k); // reads through the ONE parse
const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(opt('--web', path.join(HERE, '..', '..', 'web')));
const TABLE = opt('--table', 'wpbsa_snooker_12ft');
const JSON_OUT = opt('--json', null);
const MIN_MM = Number(opt('--min-mm', '0'));
const FALLS = opt('--falls', 'kernel');
const NO_THROATS = has('--no-throats');
const V0 = opt('--v0', null); // SNK-R37 record: override the named lanes' shot speed (the slow-lane scan behind Amendment 026d)
const SHOTS = String(opt('--shots', 's2p,s2m')).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const R = 0.02625; // WPBSA Sec1 R2 (MFR) — the S2 rack's ball radius
const STEP = 0.0005; // pose sampling step [s]
if (!['kernel', 'plate', 'derived'].includes(FALLS)) { console.error(`[sink-clearance] unknown --falls '${FALLS}' (kernel | plate | derived)`); process.exit(2); }
for (const f of ['scene/table.js', 'app/sinkpivot.js', 'dist/pool-wasm/pool_wasm.js', 'dist/pool-wasm/pool_wasm_bg.wasm', 'vendor/three.module.min.js']) {
  if (!fs.existsSync(path.join(WEB, f))) { console.error(`[sink-clearance] REFUSED — ${WEB} has no ${f}: not a web tree`); process.exit(2); }
}

// ---- the tree's three for its bare `import 'three'` (the dump-slide-chutes-489 instrument: node_modules/three at the
// tree root materialised from the tree's own vendor copy, written only when absent or different) ----
const root = path.dirname(WEB);
const vendor = fs.readFileSync(path.join(WEB, 'vendor', 'three.module.min.js'));
const nm = path.join(root, 'node_modules', 'three');
fs.mkdirSync(nm, { recursive: true });
const idx = path.join(nm, 'index.js'), pkg = path.join(nm, 'package.json');
const pkgJson = JSON.stringify({ name: 'three', version: '0.0.0-vendored-copy', type: 'module', main: 'index.js', module: 'index.js' }, null, 2) + '\n';
if (!fs.existsSync(idx) || !fs.readFileSync(idx).equals(vendor)) fs.writeFileSync(idx, vendor);
if (!fs.existsSync(pkg) || fs.readFileSync(pkg, 'utf8') !== pkgJson) fs.writeFileSync(pkg, pkgJson);

// ---- table.js with its private builders exported: a /tmp copy whose imports point back into the tree ----
const tableUrl = pathToFileURL(path.join(WEB, 'scene', 'table.js'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ob-sink-clearance-'));
let src = fs.readFileSync(path.join(WEB, 'scene', 'table.js'), 'utf8');
src = src.replace(/(from\s+|import\s*\(\s*)(['"])([^'"]+)\2/g, (a, pre, q, spec) => {
  if (spec === 'three') return `${pre}${q}${pathToFileURL(idx).href}${q}`;
  if (spec.startsWith('.')) return `${pre}${q}${new URL(spec, tableUrl).href}${q}`;
  return a;
});
for (const name of ['snookerFallCtx', 'snkPlateSpec', 'snkPlateGeoms']) {
  if (!new RegExp(`\\bfunction ${name}\\s*\\(`).test(src)) { console.error(`[sink-clearance] REFUSED — ${WEB}/scene/table.js has no ${name}(): not a tree this instrument reads`); process.exit(2); }
}
src += '\nexport { snookerFallCtx as __snookerFallCtx, snkPlateSpec as __snkPlateSpec, snkPlateGeoms as __snkPlateGeoms };\n';
const tableCopy = path.join(tmp, 'table.__clearance__.mjs');
fs.writeFileSync(tableCopy, src);
let T, S, W;
try {
  T = await import(pathToFileURL(tableCopy).href);
  S = await import(pathToFileURL(path.join(WEB, 'app', 'sinkpivot.js')).href);
  W = await import(pathToFileURL(path.join(WEB, 'dist', 'pool-wasm', 'pool_wasm.js')).href);
  await W.default({ module_or_path: fs.readFileSync(path.join(WEB, 'dist', 'pool-wasm', 'pool_wasm_bg.wasm')) });
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
if (!T.TABLE_SPECS || !Object.prototype.hasOwnProperty.call(T.TABLE_SPECS, TABLE)) {
  console.error(`[sink-clearance] REFUSED — unknown table '${TABLE}' in ${WEB}/scene/table.js (known: ${Object.keys(T.TABLE_SPECS || {}).join(', ')})`); process.exit(2);
}
const G = T.makeGeom(TABLE);
const fcx = T.__snookerFallCtx(G);
const GATE = opt('--gate', 'identity'); // LAND-26 (i): identity = the fresh game.js (R34 identity gate, opted kernel discs); plain = a CACHED pre-LAND-26 game.js (`distance <= fall.r`) paired with THIS table.js — it does not opt in and receives the plate cups
if (!['identity', 'plain'].includes(GATE)) { console.error(`[sink-clearance] unknown --gate '${GATE}' (identity | plain)`); process.exit(2); }
const VISUAL = GATE === 'plain' ? T.pocketVisualFalls(TABLE) : T.pocketVisualFalls(TABLE, { contract: 'kernel' }); // what game.js + sinkpivot read in the browser (opted, or the un-opted mixed pairing)
const PLATE = typeof T.pocketPlateDatums === 'function' ? T.pocketPlateDatums(TABLE) : null; // the leather throat
if (!Array.isArray(VISUAL) || !Array.isArray(PLATE)) { console.error(`[sink-clearance] REFUSED — ${TABLE} exports no visual falls / plate datums (not a snooker entry)`); process.exit(2); }
// ---- --envelope-arms: ORDER-SNK-COMPANION-ENVELOPE-CACHE — the memo's cells (before the tool's own first envelope read) ----
if (has('--envelope-arms')) {
  const cells = [];
  const cell = (name, ok, detail) => { cells.push({ name, ok: !!ok, detail }); console.log(`[envelope-arms] ${ok ? 'ok ' : 'RED'} ${name} — ${detail}`); };
  const timed = (f) => { const a = performance.now(); const r = f(); return [r, performance.now() - a]; };
  if (typeof T.pocketCollarEnvelope !== 'function') { console.log('[envelope-arms] NOT ARMED — table.js exports no pocketCollarEnvelope'); process.exit(1); }
  // middles / non-snooker never build: a pool table answers null in microseconds and before any snooker build
  const [poolV, poolMs] = timed(() => T.pocketCollarEnvelope('wpa_9ft'));
  cell('non-snooker call builds nothing', poolV === null && poolMs < 1, `wpa_9ft → ${poolV} in ${poolMs.toFixed(3)} ms`);
  // (a) cold once, warm < 1 ms
  const [cold, coldMs] = timed(() => T.pocketCollarEnvelope(TABLE));
  const warmMs = [];
  let warm = null;
  for (let i = 0; i < 5; i++) { const [r, ms] = timed(() => T.pocketCollarEnvelope(TABLE)); warmMs.push(ms); warm = r; }
  const warmMax = Math.max(...warmMs);
  cell('(a) cold build once, warm < 1 ms', Array.isArray(cold) && coldMs > 5 && warmMax < 1 && coldMs / Math.max(warmMax, 1e-6) > 20,
    `cold ${coldMs.toFixed(1)} ms; warm ${warmMs.map((m) => m.toFixed(3)).join(' / ')} ms (max ${warmMax.toFixed(3)}); ratio ${(coldMs / Math.max(warmMax, 1e-6)).toFixed(0)}×`);
  // (a2) identity + frozen
  const corners = Array.isArray(cold) ? cold.filter(Boolean) : [];
  const frozen = Array.isArray(cold) && Object.isFrozen(cold) && corners.every((e) => Object.isFrozen(e) && Object.isFrozen(e.ends) && e.ends.every((v) => Object.isFrozen(v)));
  cell('(a2) a warm call returns the SAME deep-frozen object', warm === cold && frozen, `same object ${warm === cold}; frozen ${frozen}; corners ${corners.length}, middles ${Array.isArray(cold) ? cold.length - corners.length : '?'}`);
  // the middles are null entries of the same array — a middle pot never triggers a second build
  const [afterMid, afterMidMs] = timed(() => T.pocketCollarEnvelope(TABLE));
  cell('a middle-pocket read is a memo hit', afterMid === cold && afterMidMs < 1, `entry[4] (middle) ${cold ? cold[4] : '?'}; call ${afterMidMs.toFixed(3)} ms same object ${afterMid === cold}`);
  // (c) the arm bit = the cap swap under the tree's own convention: null under the arm, the memo intact after it
  const prevArm = process.env.OB_ARM;
  process.env.OB_ARM = 'throat-off';
  const armed = T.pocketCollarEnvelope(TABLE);
  if (prevArm === undefined) delete process.env.OB_ARM; else process.env.OB_ARM = prevArm;
  const afterArm = T.pocketCollarEnvelope(TABLE);
  cell('(c) throat-off arm returns null and leaves the memo intact', armed === null && afterArm === cold, `under the arm ${armed}; after it same object ${afterArm === cold}`);
  // (c) invalidation on a build: buildTable() in node throws at `window` after its per-build reset — the next read must rebuild
  let buildErr = null;
  try { T.buildTable({ shared: {}, tableId: TABLE }); } catch (e) { buildErr = String(e && e.message || e).slice(0, 60); }
  const [rebuilt, rebuiltMs] = timed(() => T.pocketCollarEnvelope(TABLE));
  cell('(c) a buildTable() invalidates: the next read is a NEW cold build', rebuilt !== cold && rebuiltMs > 5, `buildTable ${buildErr ? 'threw (' + buildErr + ') after its reset' : 'returned'}; rebuilt ${rebuiltMs.toFixed(1)} ms; new object ${rebuilt !== cold}`);
  // (b) byte-identical envelope across builds
  cell('(b) the rebuilt envelope is byte-identical to the first build', JSON.stringify(rebuilt) === JSON.stringify(cold), `JSON ${JSON.stringify(rebuilt).length} chars equal ${JSON.stringify(rebuilt) === JSON.stringify(cold)}`);
  const [again, againMs] = timed(() => T.pocketCollarEnvelope(TABLE));
  cell('after the rebuild the memo is warm again', again === rebuilt && againMs < 1, `${againMs.toFixed(3)} ms same object ${again === rebuilt}`);
  // (d) the memo is private run state: the source census — declaration, the read + write inside pocketCollarEnvelope, the two build-site resets
  const srcLines = src.split('\n');
  const mentions = srcLines.map((l, i) => [i + 1, l]).filter(([, l]) => /\b_collarEnvMemo\b/.test(l) && !/^\s*\/\//.test(l));
  const kinds = mentions.map(([n, l]) => /^let _collarEnvMemo = null;/.test(l) ? 'decl' : /_collarEnvMemo = null;/.test(l.trim()) ? 'reset' : /_collarEnvMemo = \{/.test(l) ? 'write' : /_collarEnvMemo !== null && _collarEnvMemo\.id/.test(l) ? 'read' : 'OTHER:' + n);
  const census = kinds.reduce((m, k) => { m[k] = (m[k] || 0) + 1; return m; }, {});
  cell('(d) no unrelated reader: the memo appears as 1 declaration, 1 read, 1 write, 2 resets and nothing else', census.decl === 1 && census.read === 1 && census.write === 1 && census.reset === 2 && Object.keys(census).length === 4, `census ${JSON.stringify(census)} at lines ${mentions.map(([n]) => n).join(', ')}`);
  // ---- ruling (C): the idle pre-warm. In node there is no window, so the tree schedules nothing (the build path above stayed
  // untouched); the cells below give the process a FAKE window + a capturing requestIdleCallback — the tree's own browser seam —
  // and run the captured tick by hand, so "one idle tick" is deterministic. Cleaned up after.
  const ticks = [];
  globalThis.window = globalThis.window || {};
  const hadRic = Object.prototype.hasOwnProperty.call(globalThis, 'requestIdleCallback');
  const prevRic = globalThis.requestIdleCallback;
  globalThis.requestIdleCallback = (fn) => { ticks.push(fn); return ticks.length; };
  const runTicks = () => { const t = ticks.splice(0); const a = performance.now(); for (const fn of t) fn(); return [t.length, performance.now() - a]; };
  // (e) build → one idle tick → the first pot is a warm read of the object the pre-warm produced
  const beforeE = T.pocketCollarEnvelope(TABLE);
  try { T.buildTable({ shared: {}, tableId: TABLE }); } catch (e) { /* node: throws past the reset + the schedule */ }
  const scheduledE = ticks.length;
  const [ranE, tickMsE] = runTicks();
  const [firstPot, firstPotMs] = timed(() => T.pocketCollarEnvelope(TABLE));
  cell('(e) after a build + one idle tick the first pot reads warm', scheduledE === 1 && ranE === 1 && tickMsE > 5 && firstPotMs < 1 && firstPot !== beforeE && Object.isFrozen(firstPot) && JSON.stringify(firstPot) === JSON.stringify(beforeE),
    `scheduled ${scheduledE} tick(s); the tick built in ${tickMsE.toFixed(1)} ms; first pot ${firstPotMs.toFixed(3)} ms, a new frozen object (${firstPot !== beforeE}) byte-identical to the previous build`);
  // (f) a pot before the idle tick: the lazy fallback builds a correct envelope; the later tick is a memo hit, not a rebuild
  try { T.buildTable({ shared: {}, tableId: TABLE }); } catch (e) { /* as above */ }
  const scheduledF = ticks.length;
  const [earlyPot, earlyPotMs] = timed(() => T.pocketCollarEnvelope(TABLE));
  const [ranF, tickMsF] = runTicks();
  const [afterTick, afterTickMs] = timed(() => T.pocketCollarEnvelope(TABLE));
  cell('(f) a pot before the idle tick gets the lazy build; the tick then does NOT rebuild', scheduledF === 1 && ranF === 1 && earlyPotMs > 5 && JSON.stringify(earlyPot) === JSON.stringify(beforeE) && tickMsF < 1 && afterTick === earlyPot && afterTickMs < 1,
    `early pot built in ${earlyPotMs.toFixed(1)} ms (byte-identical ${JSON.stringify(earlyPot) === JSON.stringify(beforeE)}); the tick took ${tickMsF.toFixed(3)} ms; the read after it is the same object (${afterTick === earlyPot}) in ${afterTickMs.toFixed(3)} ms`);
  // (g) non-snooker builds schedule nothing; the scheduler call sits after the early returns (source order) at exactly the two build sites
  for (const other of ['wpa_9ft', 'chinese8_pro_9ft']) { try { T.buildTable({ shared: {}, tableId: other }); } catch (e) { /* as above */ } }
  const scheduledG = ticks.length;
  ticks.splice(0);
  const fnStart = src.indexOf('function collarEnvelopePrewarm(');
  const fnEnd = fnStart >= 0 ? src.indexOf('\n}\n', fnStart) : -1;
  const body = fnStart >= 0 && fnEnd > fnStart ? src.slice(fnStart, fnEnd) : '';
  const iStyle = body.indexOf("spec.render.style !== 'snooker'"), iArm = body.indexOf("obArmOn('throat-off')"), iSched = body.indexOf('ric(run');
  const callSites = (src.match(/^\s+collarEnvelopePrewarm\((built\.id|id)\);$/gm) || []).length;
  const defs = (src.match(/^function collarEnvelopePrewarm\(/gm) || []).length;
  cell('(g) non-snooker tables schedule nothing; the scheduler call follows the early returns at exactly the two build sites', scheduledG === 0 && defs === 1 && callSites === 2 && iStyle >= 0 && iArm > iStyle && iSched > iArm,
    `wpa_9ft + chinese8_pro_9ft builds scheduled ${scheduledG} tick(s); source: definition ${defs}, call sites ${callSites}, order style-return @${iStyle} < arm-return @${iArm} < schedule @${iSched}`);
  // the tree scheduled nothing while there was no window (the node build path above): the cells before this block ran without a tick
  if (hadRic) globalThis.requestIdleCallback = prevRic; else delete globalThis.requestIdleCallback;
  delete globalThis.window;
  const red = cells.filter((c) => !c.ok);
  const out = { tool: 'check-sink-clearance-489 --envelope-arms', web: WEB, table: TABLE, coldMs: +coldMs.toFixed(2), warmMs: warmMs.map((m) => +m.toFixed(4)), rebuiltMs: +rebuiltMs.toFixed(2), cells, verdict: red.length ? 'NOT ARMED' : 'ARMED' };
  if (JSON_OUT) { fs.mkdirSync(path.dirname(path.resolve(JSON_OUT)), { recursive: true }); fs.writeFileSync(JSON_OUT, JSON.stringify(out, null, 1)); }
  console.log(`[envelope-arms] cells ${cells.length}; ${red.length ? 'NOT ARMED — ' + red.map((c) => c.name).join('; ') : 'ARMED — the envelope is built once per table build (cold ' + coldMs.toFixed(0) + ' ms) at idle time after the build, every read is the same frozen object in < 1 ms, a build drops it, the rebuilt one is byte-identical, a pot before the idle tick falls back to the lazy build'}`);
  process.exit(red.length ? 1 : 0);
}

// LAND-26 (b″): the collar's END COLUMNS per corner throat (table.js pocketCollarEnvelope; null on a tree without the export) — the end-steer's
// input. `--no-throats` disables it with the pre-roll branch (`arcs: []`), so the red arm still runs the whole SNK-R36 body off.
const ENV = typeof T.pocketCollarEnvelope === 'function' ? T.pocketCollarEnvelope(TABLE) : null;
const ENV_N = Array.isArray(ENV) ? ENV.filter((e) => e && Array.isArray(e.ends) && e.ends.length).length : 0;
const ARCS = NO_THROATS ? [] : ENV;
console.log(`[sink-clearance] tree ${WEB} table ${TABLE} falls=${FALLS} gate=${GATE}${NO_THROATS ? ' throats=[] (branch disabled)' : ''} ends=${Array.isArray(ENV) ? ENV_N + ' corner(s) with end columns' : 'none (no pocketCollarEnvelope export)'}${NO_THROATS ? ' → arcs=[]' : ''}`);

// ---- the pocket's BUILT leather, world frame (the geometry the browser draws) ----
const leatherCache = new Map();
function leatherVertices(pi) {
  if (leatherCache.has(pi)) return leatherCache.get(pi);
  let verts = [];
  let note = null;
  try {
    const spec = T.__snkPlateSpec(G, fcx, fcx.cups[pi], G.pockets[pi]);
    const geos = T.__snkPlateGeoms(spec);
    for (const [name, geo] of Object.entries(geos || {})) {
      for (const g of (Array.isArray(geo) ? geo : [geo])) {
        if (!g || !g.getAttribute) continue;
        const p = g.getAttribute('position');
        for (let i = 0; i < p.count; i++) verts.push({ name, i, x: p.getX(i), y: p.getY(i), z: p.getZ(i) });
      }
    }
  } catch (e) { note = `no node geometry for pocket ${pi}: ${String(e && e.message || e).slice(0, 120)} (the browser row decides)`; verts = []; }
  const out = { verts, note, meshes: [...new Set(verts.map((v) => v.name))] };
  leatherCache.set(pi, out);
  return out;
}

// ---- shots (the e2e-snooker lane, byte for byte) ----
const CTR = { x: 0.9209965818486914, y: 1.8164965818486913 }, ANCHOR = { x: 0.25, y: 1.0 };
const U = (() => { const dx = CTR.x - ANCHOR.x, dy = CTR.y - ANCHOR.y, n = Math.hypot(dx, dy); return { x: dx / n, y: dy / n }; })();
const LANE = (t) => ({ x: CTR.x - U.x * t, y: CTR.y - U.y * t });
const SPHI = Math.atan2(U.y, U.x);
const MIDC = { x: 0.9405874, y: 0 };
const shots = [];
if (SHOTS.includes('s2p')) {
  shots.push({ tag: 'S2p', v0: 2.5, phi: SPHI, place: { 0: LANE(0.95), 1: LANE(0.35) } });
  shots.push({ tag: 'S2p-fast', v0: 4.5, phi: SPHI, place: { 0: LANE(0.95), 1: LANE(0.35) } });
  shots.push({ tag: 'S2p-scratch', v0: 1.2, phi: SPHI, place: { 0: LANE(0.95), 1: LANE(0.35) } });
  shots.push({ tag: 'S2p-slow', v0: 0.94, phi: SPHI, place: { 0: LANE(0.95), 1: LANE(0.35) } }); // LAND-11 T2: the suite's SNK-R37 A1 slow scratch (e2e-snooker S2p-slow, v0 0.94 on the same lane) — its own mirror row, same tag
  // GH-489 #637 LAND-18 X3 (review 775r5 P2 (d)): AIRBORNE corner captures — the cue ball alone, 5° elevation, 2 m/s: 0.10 / 0.15 m from the
  // capture centre the ball is still in its hop (motion 5) at capture → game.js rejects the pivot and glides; the plate datum is the glide
  // target (game.js:1491 + `|| preMotion === 5`). 0.25 m has landed (pivot, unchanged) and theta 0 at 0.10 m is the control (unchanged).
  const AIR_THETA = 5 * Math.PI / 180;
  shots.push({ tag: 'S2p-air10', v0: 2.0, phi: SPHI, theta: AIR_THETA, only: [0], place: { 0: LANE(0.10) } });
  shots.push({ tag: 'S2p-air15', v0: 2.0, phi: SPHI, theta: AIR_THETA, only: [0], place: { 0: LANE(0.15) } });
  shots.push({ tag: 'S2p-air25', v0: 2.0, phi: SPHI, theta: AIR_THETA, only: [0], place: { 0: LANE(0.25) } });
  shots.push({ tag: 'S2p-air10-flat', v0: 2.0, phi: SPHI, theta: 0, only: [0], place: { 0: LANE(0.10) } });
}
if (SHOTS.includes('s2m')) {
  shots.push({ tag: 'S2m-slow', v0: 0.9, phi: 0, place: { 0: { x: MIDC.x - 0.85, y: 0 }, 1: { x: MIDC.x - 0.25, y: 0 } } });
  shots.push({ tag: 'S2m-fast', v0: 1.8, phi: 0, place: { 0: { x: MIDC.x - 0.85, y: 0 }, 1: { x: MIDC.x - 0.25, y: 0 } } });
}

// ---- game.js mirrors (labelled): capture state, gate, legacy glide ----
const SINK_G = 9.8, LIP_POP_M = 0.0015, SINK_FLOOR_Y = -0.16, SINK_SHIELD_Y = -0.055; // game.js constants (mirror)
function glideEntry(pos, vel, fall, pocket) { // game.js 1470-1476 + 1673-1686
  const speed = Math.hypot(vel.x, vel.z);
  const dist = Math.hypot(pos.x - fall.x, pos.z - fall.z);
  const glide = Math.min(0.22, Math.max(Math.min(0.06, Math.max(0.012, 1.5 * dist / Math.max(speed, 1e-6))), dist / Math.max(speed, 0.3)));
  let tFall = 0.35 * glide;
  if (fall !== pocket) {
    const cbx = pos.x + vel.x * glide * 0.5, cbz = pos.z + vel.z * glide * 0.5;
    let uG = 1;
    for (let u = 0; u <= 1.0001; u += 1 / 64) {
      const w0 = (1 - u) * (1 - u), w1 = 2 * u * (1 - u), w2 = u * u;
      const bx = w0 * pos.x + w1 * cbx + w2 * fall.x, bz = w0 * pos.z + w1 * cbz + w2 * fall.z;
      if (Math.hypot(bx - fall.x, bz - fall.z) <= fall.r - R - 0.002) { uG = u; break; }
    }
    tFall = Math.max(tFall, uG * glide);
  }
  return { pos, vel, fall, glide, tFall, speed };
}
function glidePose(s, dt) { // game.js 2105-2170 legacy branch (no rest spec)
  const u = Math.min(1, dt / s.glide);
  const fall = s.fall;
  const cx = s.pos.x + s.vel.x * s.glide * 0.5, cz = s.pos.z + s.vel.z * s.glide * 0.5;
  const w0 = (1 - u) * (1 - u), w1 = 2 * u * (1 - u), w2 = u * u;
  let x = w0 * s.pos.x + w1 * cx + w2 * fall.x;
  let z = w0 * s.pos.z + w1 * cz + w2 * fall.z;
  const tr = dt - s.glide;
  if (tr > 0) {
    const amp = Math.min(0.006, Math.max(0, fall.r - R) * 0.3) * Math.sin(18 * tr) * Math.exp(-5 * tr);
    const vl = Math.max(s.speed, 1e-6);
    x += (-s.vel.z / vl) * amp; z += (s.vel.x / vl) * amp;
  }
  const tf = Math.max(0, dt - s.tFall);
  const pop = tf > 0 ? 0 : LIP_POP_M * Math.sin(Math.PI * dt / s.tFall);
  const y = Math.max(SINK_FLOOR_Y, R + pop - 0.5 * SINK_G * tf * tf);
  if (y < R) {
    const disc = Math.sqrt(Math.max(0, R * R - y * y));
    const lim = fall.r + 0.004 - 0.0005 - disc;
    const ox = x - fall.x, oz = z - fall.z, d = Math.hypot(ox, oz);
    if (d > lim && d > 1e-9) { x = fall.x + (ox / d) * Math.max(lim, 0); z = fall.z + (oz / d) * Math.max(lim, 0); }
  }
  if (y + R < SINK_SHIELD_Y) return null;
  return { x, y, z };
}

function nearest(list, x, z, maxD2 = Infinity) {
  let best = null, bd = Infinity;
  for (const c of list) { const d = (c.x - x) ** 2 + (c.z - z) ** 2; if (d < bd) { bd = d; best = c; } }
  return bd <= maxD2 ? best : null;
}

// ---- --sweep: the kernel-reachable census into pocket 5 (informational; the off-axis OPEN row) ----
if (has('--sweep')) {
  const OLD = opt('--old', null);
  let O = null;
  if (OLD) {
    const f = path.join(path.resolve(OLD), 'web', 'app', 'sinkpivot.js');
    if (!fs.existsSync(f)) { console.error(`[sink-clearance] REFUSED — --old ${OLD} has no web/app/sinkpivot.js`); process.exit(2); }
    O = await import(pathToFileURL(f).href);
  }
  const PI = 5, cup = G.pockets[PI], fall = VISUAL[PI];
  const L = leatherVertices(PI);
  if (!L.verts.length) { console.error(`[sink-clearance] REFUSED — no leather geometry for pocket ${PI} (${L.note})`); process.exit(2); }
  // a coarse grid over the leather cloud keeps 400 poses × 33 k vertices × 400 captures tractable
  const CELL = 0.02; const grid = new Map(); const key = (i, j, k) => `${i},${j},${k}`;
  for (const v of L.verts) { const kk = key(Math.floor(v.x / CELL), Math.floor(v.y / CELL), Math.floor(v.z / CELL)); if (!grid.has(kk)) grid.set(kk, []); grid.get(kk).push(v); }
  const minClear = (p) => {
    const i0 = Math.floor(p.x / CELL), j0 = Math.floor(p.y / CELL), k0 = Math.floor(p.z / CELL); let best = Infinity, bv = null;
    for (let i = i0 - 3; i <= i0 + 3; i++) for (let j = j0 - 3; j <= j0 + 3; j++) for (let k = k0 - 3; k <= k0 + 3; k++) {
      const cell = grid.get(key(i, j, k)); if (!cell) continue;
      for (const v of cell) { const d = Math.hypot(p.x - v.x, p.y - v.y, p.z - v.z) - R; if (d < best) { best = d; bv = v; } }
    }
    return { mm: best * 1000, v: bv };
  };
  const runLaw = (M, sp) => {
    const e = M.buildSinkPivot(sp); if (!e) return { min: null };
    let best = { mm: Infinity, dt: null, v: null, pose: null }; const hz = (e.ttl ?? 0.75) + 0.05;
    for (let dt = 0; dt <= hz; dt += 0.001) { const p = M.poseInSink(e, dt, {}); if (!p) { if (dt > 0) break; continue; } const c = minClear(p); if (c.mm < best.mm) best = { mm: c.mm, dt, v: c.v, pose: [p.x, p.y, p.z] }; }
    const steer = e.steer ? { how: e.steer.how, on: e.steer.on, angleDeg: +(e.steer.angle * 180 / Math.PI).toFixed(3), gammaDeg: +(e.steer.gamma * 180 / Math.PI).toFixed(3), clearBeforeMm: +(e.steer.clearBefore * 1000).toFixed(3), clearAfterMm: +(e.steer.clearAfter * 1000).toFixed(3), residual: e.steer.residual } : null;
    return { min: +best.mm.toFixed(3), atMs: best.dt === null ? null : +(best.dt * 1000).toFixed(1), mesh: best.v ? best.v.name : null, vertex: best.v ? best.v.i : null, pose: best.pose, roll: e.roll ? { distMm: +(e.roll.dist * 1000).toFixed(3), tMs: +(e.roll.t * 1000).toFixed(2), how: e.roll.how } : null, tPivot: e.tPivot, glide: e.glide, steer, dir: [e.dx, e.dz] };
  };
  const diag = Math.atan2(-cup.z, -cup.x);
  const lanes = [];
  for (let db = -70; db <= 70; db += 7) for (const dist of [0.6, 1.2]) {
    const ang = diag + db * Math.PI / 180; const sx = cup.x + dist * Math.cos(ang), sz = cup.z + dist * Math.sin(ang);
    if (Math.abs(sx) > G.L / 2 - 0.06 || Math.abs(sz) > G.W / 2 - 0.06) continue; // on the bed, off the cushions
    for (let off = -8; off <= 8; off += 2) for (const v0 of [1.0, 2.5]) lanes.push({ db, dist, off, v0, sx, sz });
  }
  const res = []; let simErr = 0, otherPocket = 0;
  for (const ln of lanes) {
    const sc = JSON.parse(W.new_rack_scenario('snooker', 1n)); sc.system.balls = sc.system.balls.filter((b) => b.id === 0);
    const b0 = sc.system.balls[0]; b0.state.pos.x = ln.sz; b0.state.pos.y = ln.sx; // kernel (x = three z, y = three x)
    const aim = Math.atan2(cup.x - ln.sx, cup.z - ln.sz);
    sc.shot = { ...sc.shot, v0: ln.v0, phi: aim + ln.off * Math.PI / 180, theta: 0, a: 0, b: 0 };
    let r; try { r = JSON.parse(W.simulate_json(JSON.stringify(sc))); } catch { simErr++; continue; }
    if (r.error) { simErr++; continue; }
    const e = r.events.find((ev) => ev.kind && ev.kind.BallPocket); if (!e) continue;
    const rec = JSON.stringify(r); const sm = W.WasmSampler.from_record_json(rec); const n = sm.sample_into(0, new Float64Array(0)); const buf = new Float64Array(n * 8);
    let tPrev = 0; for (const pe of r.events) { if (pe.t >= e.t) break; if (pe.post && pe.post.some(([id2]) => id2 === 0)) tPrev = pe.t; }
    const leg = e.t - tPrev, tb = Math.max(0, e.t - (leg > 0 ? Math.min(1e-6, leg / 2) : 1e-6)), ta = Math.min(tb, Math.max(tPrev, tb - 0.02));
    sm.sample_into(ta, buf); const prev = { x: buf[1], z: buf[0] }; sm.sample_into(tb, buf); const pos = { x: buf[1], y: buf[2], z: buf[0] }; const pm = buf[7]; sm.free();
    const dtv = Math.max(tb - ta, 1e-12); const vel = { x: (pos.x - prev.x) / dtv, z: (pos.z - prev.z) / dtv };
    const pk = nearest(G.pockets, pos.x, pos.z); if (pk !== cup) { otherPocket++; continue; }
    if (pm === 5 || !(pos.y < R * 1.25)) continue; // game.js gate: no airborne pivot
    const speed = Math.hypot(vel.x, vel.z);
    const bearing = Math.atan2(pos.z - cup.z, pos.x - cup.x), vdir = Math.atan2(vel.z, vel.x);
    const sp = { x0: pos.x, z0: pos.z, vx: vel.x, vz: vel.z, wx: 0, wy: 0, wz: 0, q0: [0, 0, 0, 1], px: fall.x, pz: fall.z, pr: fall.r, r: R, falls: VISUAL };
    const N = runLaw(S, { ...sp, throats: NO_THROATS ? [] : PLATE, arcs: ARCS });
    const OL = O ? runLaw(O, { ...sp }) : null;
    res.push({ lane: { db: ln.db, dist: ln.dist, off: ln.off, v0: ln.v0 }, capture: { t: +e.t.toFixed(4), pos: [pos.x, pos.y, pos.z], vel: [vel.x, vel.z], speed: +speed.toFixed(3), premotion: pm, bearingDeg: +((bearing - diag) * 180 / Math.PI).toFixed(1), velOffDiagDeg: +((((vdir - diag) * 180 / Math.PI + 540) % 360) - 180).toFixed(1) }, phi: sc.shot.phi, start: [ln.sx, ln.sz], newLaw: N, oldLaw: OL });
  }
  const ok = res.filter((r) => r.newLaw.min !== null);
  const neg = ok.filter((r) => r.newLaw.min < 0);
  const oldOk = O ? ok.filter((r) => r.oldLaw && r.oldLaw.min !== null) : [];
  const oldNeg = oldOk.filter((r) => r.oldLaw.min < 0);
  const worse = O ? ok.filter((r) => r.oldLaw && r.oldLaw.min !== null && r.newLaw.min < r.oldLaw.min - 1e-6) : [];
  const how = ok.reduce((m, r) => { const k = r.newLaw.roll ? r.newLaw.roll.how : 'no-roll'; m[k] = (m[k] || 0) + 1; return m; }, {});
  ok.sort((a, b) => a.newLaw.min - b.newLaw.min);
  console.log(`[sink-clearance] SWEEP pocket ${PI}: ${lanes.length} lanes, ${simErr} sim errors, ${otherPocket} captures elsewhere, ${ok.length} captures at pocket ${PI} (bearings ${Math.min(...ok.map((r) => r.capture.bearingDeg))}…${Math.max(...ok.map((r) => r.capture.bearingDeg))}° off the diagonal); roll-direction census ${JSON.stringify(how)}`);
  const steered = ok.filter((r) => r.newLaw.steer);
  const steerResidual = steered.filter((r) => r.newLaw.steer.residual);
  const stillNeg = steered.filter((r) => r.newLaw.min < 0);
  console.log(`[sink-clearance] SWEEP end-steer (b″): ${steered.length}/${ok.length} rows steered` + (steered.length ? ` (angles ${Math.min(...steered.map((r) => r.newLaw.steer.angleDeg))}…${Math.max(...steered.map((r) => r.newLaw.steer.angleDeg))}°, swept-path clearance to the end columns before ${Math.min(...steered.map((r) => r.newLaw.steer.clearBeforeMm))}…${Math.max(...steered.map((r) => r.newLaw.steer.clearBeforeMm))} mm → after ${Math.min(...steered.map((r) => r.newLaw.steer.clearAfterMm))}…${Math.max(...steered.map((r) => r.newLaw.steer.clearAfterMm))} mm; on ${JSON.stringify(steered.reduce((m, r) => { m[r.newLaw.steer.on] = (m[r.newLaw.steer.on] || 0) + 1; return m; }, {}))})` : '') + `; bounded at ĉ (residual named) ${steerResidual.length}; steered rows still penetrating ${stillNeg.length}` + (stillNeg.length ? ` (worst ${Math.min(...stillNeg.map((r) => r.newLaw.min))} mm)` : ''));
  console.log(`[sink-clearance] SWEEP this tree${NO_THROATS ? ' (branch disabled)' : ''}: ${neg.length}/${ok.length} captures penetrate, worst ${ok.length ? ok[0].newLaw.min : 'n/a'} mm` + (O ? ` | ${OLD}: ${oldNeg.length}/${oldOk.length} penetrate, worst ${oldOk.length ? Math.min(...oldOk.map((r) => r.oldLaw.min)) : 'n/a'} mm | new worse than old: ${worse.length}/${oldOk.length}` : ''));
  for (const r of ok.slice(0, 6)) console.log(`[sink-clearance] SWEEP worst: lane db ${r.lane.db}° dist ${r.lane.dist} off ${r.lane.off}° v0 ${r.lane.v0} → capture ${r.capture.speed} m/s, bearing ${r.capture.bearingDeg}°, velocity ${r.capture.velOffDiagDeg}° off the diagonal, roll ${r.newLaw.roll ? r.newLaw.roll.distMm + ' mm (' + r.newLaw.roll.how + ')' : 'none'}${r.newLaw.steer ? ', ' + r.newLaw.steer.how + ' ' + r.newLaw.steer.angleDeg + '° on the ' + r.newLaw.steer.on + (r.newLaw.steer.residual ? ' (RESIDUAL: bounded at ĉ)' : '') : ''} → ${r.newLaw.min} mm at ${r.newLaw.atMs} ms (${r.newLaw.mesh} #${r.newLaw.vertex})${r.oldLaw ? ' | old ' + r.oldLaw.min + ' mm' : ''}`);
  const out = { tool: 'check-sink-clearance-489 --sweep', web: WEB, old: OLD, pocket: PI, lanes: lanes.length, simErrors: simErr, capturesElsewhere: otherPocket, captures: ok.length, penetrating: neg.length, worstMm: ok.length ? ok[0].newLaw.min : null, ends: Array.isArray(ENV) ? ENV_N : null, steer: { rows: steered.length, angleDeg: steered.map((r) => r.newLaw.steer.angleDeg), residualRows: steerResidual.length, stillPenetrating: stillNeg.length, residualWorstMm: stillNeg.length ? Math.min(...stillNeg.map((r) => r.newLaw.min)) : null }, old: O ? { penetrating: oldNeg.length, of: oldOk.length, worstMm: oldOk.length ? Math.min(...oldOk.map((r) => r.oldLaw.min)) : null, newWorseThanOld: worse.length } : null, how, rows: ok };
  if (JSON_OUT) { fs.mkdirSync(path.dirname(path.resolve(JSON_OUT)), { recursive: true }); fs.writeFileSync(JSON_OUT, JSON.stringify(out, null, 1)); }
  process.exit(0);
}

const rows = [];
for (const sh of shots) {
  const sc = JSON.parse(W.new_rack_scenario('snooker', 1n));
  sc.system.balls = sc.system.balls.filter((b) => [...(sh.only ?? [0, 1]), 16, 17, 18, 19, 20, 21].includes(b.id)); // LAND-18 X3: `only` = the cue-ball-only airborne rows
  for (const [id, p] of Object.entries(sh.place)) { const b = sc.system.balls.find((q) => q.id === Number(id)); Object.assign(b.state.pos, { x: p.x, y: p.y }); }
  sc.shot = { ...sc.shot, v0: V0 !== null && Number.isFinite(Number(V0)) ? Number(V0) : sh.v0, phi: sh.phi, theta: sh.theta ?? 0, a: 0, b: 0 }; // LAND-18 X3: per-row elevation
  const rec = W.simulate_json(JSON.stringify(sc));
  const r = JSON.parse(rec);
  if (r.error) { rows.push({ tag: sh.tag, v0: sh.v0, error: r.error }); continue; }
  const sm = W.WasmSampler.from_record_json(rec);
  const n = sm.sample_into(0, new Float64Array(0));
  const buf = new Float64Array(n * 8);
  const pockets = r.events.filter((e) => e.kind && e.kind.BallPocket);
  if (!pockets.length) rows.push({ tag: sh.tag, v0: sh.v0, error: 'no BallPocket event' });
  for (const e of pockets) {
    const id = e.kind.BallPocket.ball, i = sc.system.balls.findIndex((b) => b.id === id);
    let tPrev = 0;
    for (const pe of r.events) { if (pe.t >= e.t) break; if (pe.post && pe.post.some(([id2]) => id2 === id)) tPrev = pe.t; }
    const leg = e.t - tPrev, tb = Math.max(0, e.t - (leg > 0 ? Math.min(1e-6, leg / 2) : 1e-6)), ta = Math.min(tb, Math.max(tPrev, tb - 0.02));
    sm.sample_into(ta, buf); const prev = { x: buf[8 * i + 1], y: buf[8 * i + 2], z: buf[8 * i] };
    sm.sample_into(tb, buf); const pos = { x: buf[8 * i + 1], y: buf[8 * i + 2], z: buf[8 * i] };
    const premotion = buf[8 * i + 7];
    const dtv = Math.max(tb - ta, 1e-12);
    const vel = { x: (pos.x - prev.x) / dtv, y: 0, z: (pos.z - prev.z) / dtv };
    const speed = Math.hypot(vel.x, vel.z);
    // game.js 1444-1461: the kernel cup nearest the capture point; the visual fall nearest THAT cup
    const pocket = nearest(G.pockets, pos.x, pos.z);
    const pi = G.pockets.indexOf(pocket);
    let falls = VISUAL;
    if (FALLS === 'plate') falls = PLATE;
    if (FALLS === 'derived') falls = PLATE.map((c, k) => (G.pockets[k].corner ? { x: c.x, z: c.z, r: Math.hypot(pos.x - c.x, pos.z - c.z) } : c));
    let fall = nearest(falls, pocket.x, pocket.z, 0.12 * 0.12) || pocket;
    // game.js:1491 (LAND-18 X3): an AIRBORNE capture (motion 5) takes the plate datum as its glide target regardless of leaf freshness
    if (fall !== pocket && premotion === 5) { const pl = nearest(PLATE, pocket.x, pocket.z, 0.12 * 0.12); if (pl) fall = pl; }
    const identity = fall === pocket || (fall.x === pocket.x && fall.z === pocket.z && fall.r === pocket.r);
    const dist = Math.hypot(pos.x - fall.x, pos.z - fall.z);
    // plain = the cached game.js gate (pre-R34 plain form) on the un-opted aperture; identity = the fresh game.js's R34 identity gate
    const gate = GATE === 'plain' ? (premotion !== 5 && pos.y < R * 1.25 && dist <= fall.r)
      : (premotion !== 5 && pos.y < R * 1.25 && (identity ? true : (S.SINK_CAPS?.throatClamp === true && dist <= fall.r)));
    const throat = nearest(PLATE, pocket.x, pocket.z, 0.12 * 0.12);
    let pivot = null;
    if (gate) {
      pivot = S.buildSinkPivot({ x0: pos.x, z0: pos.z, vx: vel.x, vz: vel.z, wx: 0, wy: 0, wz: 0, q0: [0, 0, 0, 1],
        px: fall.x, pz: fall.z, pr: fall.r, r: R, falls, throats: NO_THROATS ? [] : PLATE, arcs: ARCS });
    }
    const L = leatherVertices(pi);
    const poseAt = pivot ? (dt) => S.poseInSink(pivot, dt, {}) : ((s) => (dt) => glidePose(s, dt))(glideEntry(pos, vel, fall, pocket));
    const horizon = pivot ? (pivot.ttl ?? 0.75) + 0.05 : 0.9;
    let best = { clearance: Infinity, dt: null, name: null, i: null, pose: null };
    let samples = 0;
    for (let dt = 0; dt <= horizon; dt += STEP) {
      const p = poseAt(dt);
      if (!p) { if (dt > 0) break; continue; }
      samples++;
      for (const v of L.verts) {
        const d = Math.hypot(p.x - v.x, p.y - v.y, p.z - v.z) - R;
        if (d < best.clearance) best = { clearance: d, dt, name: v.name, i: v.i, pose: { x: p.x, y: p.y, z: p.z } };
      }
    }
    const row = {
      tag: sh.tag, v0: sh.v0, ball: id, pocket: pi, corner: !!pocket.corner,
      capture: { t: +e.t.toFixed(6), pos: [pos.x, pos.y, pos.z], vel: [vel.x, vel.z], speed: +speed.toFixed(4), premotion },
      fall: { x: fall.x, z: fall.z, r: fall.r, identity, distMm: +(dist * 1000).toFixed(3) },
      throat: throat ? { x: throat.x, z: throat.z, r: throat.r, captureOutsideMm: +((Math.hypot(pos.x - throat.x, pos.z - throat.z) - throat.r) * 1000).toFixed(3) } : null,
      gate, path: pivot ? 'pivot' : (gate ? 'gate-pass-but-null-pivot → glide(mirror)' : 'glide(mirror)'),
      pivot: pivot ? { tPivot: pivot.tPivot, glide: pivot.glide, ttl: pivot.ttl, tEnd: pivot.tEnd, px: pivot.px, pz: pivot.pz, pr: pivot.pr,
        roll: pivot.roll ? { distMm: +(pivot.roll.dist * 1000).toFixed(3), tMs: +(pivot.roll.t * 1000).toFixed(3), entry: [pivot.roll.x1, pivot.roll.z1], dir: [pivot.roll.dx, pivot.roll.dz], how: pivot.roll.how } : null,
        steer: pivot.steer ? { how: pivot.steer.how, on: pivot.steer.on, angleDeg: +(pivot.steer.angle * 180 / Math.PI).toFixed(3), clearBeforeMm: +(pivot.steer.clearBefore * 1000).toFixed(3), clearAfterMm: +(pivot.steer.clearAfter * 1000).toFixed(3), residual: pivot.steer.residual } : null } : null,
      leather: { meshes: L.meshes, vertices: L.verts.length, note: L.note },
      minClearanceMm: Number.isFinite(best.clearance) ? +(best.clearance * 1000).toFixed(3) : null,
      atMs: best.dt === null ? null : +(best.dt * 1000).toFixed(2), atMesh: best.name, atVertex: best.i, atPose: best.pose, samples,
    };
    rows.push(row);
    const ok = L.verts.length ? row.minClearanceMm >= MIN_MM : null;
    console.log(`[sink-clearance] ${sh.tag} v0 ${sh.v0} ball ${id} pocket ${pi}${pocket.corner ? ' (corner)' : ' (middle)'}: capture speed ${speed.toFixed(3)} m/s, `
      + `fall ${identity ? 'kernel-identity' : 'non-identity'} r ${(fall.r * 1000).toFixed(2)} mm, throat ${throat ? (throat.r * 1000).toFixed(2) + ' mm at ' + row.throat.captureOutsideMm + ' mm outside' : 'n/a'}, `
      + `gate ${gate ? 'PASS' : 'reject'}, path ${row.path}${row.pivot && row.pivot.roll ? `, roll ${row.pivot.roll.distMm} mm / ${row.pivot.roll.tMs} ms (${row.pivot.roll.how})` : ''}`
      + `${row.pivot ? `, tPivot ${(row.pivot.tPivot * 1000).toFixed(1)} ms, glide ${(row.pivot.glide * 1000).toFixed(1)} ms` : ''} → `
      + (L.verts.length ? `min clearance ${row.minClearanceMm} mm at ${row.atMs} ms (${best.name} #${best.i}) ${ok ? 'OK' : 'FAIL'}` : `no leather geometry in node (${L.note})`));
  }
  sm.free();
}
const judged = rows.filter((r) => r.minClearanceMm !== null && r.minClearanceMm !== undefined);
const fails = judged.filter((r) => r.minClearanceMm < MIN_MM);
const out = { tool: 'check-sink-clearance-489', web: WEB, table: TABLE, falls: FALLS, throatsDisabled: NO_THROATS, minMm: MIN_MM, ballRadiusMm: R * 1000, stepMs: STEP * 1000, rows, verdict: fails.length ? 'FAIL' : 'PASS' };
if (JSON_OUT) { fs.mkdirSync(path.dirname(path.resolve(JSON_OUT)), { recursive: true }); fs.writeFileSync(JSON_OUT, JSON.stringify(out, null, 1)); }
const errors = rows.filter((r) => r.error);
if (!judged.length) { console.log('[sink-clearance] FAIL — no row could be judged (no leather geometry / no capture): a vacuous pass is refused'); process.exit(1); }
console.log(`[sink-clearance] ${fails.length ? 'FAIL' : 'PASS'} — ${judged.length - fails.length}/${judged.length} rows with min clearance ≥ ${MIN_MM} mm over the whole descent`
  + (fails.length ? ` (worst ${Math.min(...fails.map((r) => r.minClearanceMm))} mm: ${fails.map((r) => r.tag + '/' + r.ball).join(', ')})` : '')
  + (errors.length ? `; ${errors.length} shot(s) without a capture: ${errors.map((r) => r.tag + ': ' + r.error).join('; ')}` : ''));
process.exit(fails.length || errors.length ? 1 : 0);
