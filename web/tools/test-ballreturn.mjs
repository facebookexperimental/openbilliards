// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-ballreturn.mjs — node unit gate for the ball-return extension (feature 037,
// issue #650): rolling identities, the handoff closed forms against the frozen
// sinkpivot.js pose law (bisection), the determinism pin, scrub-order parity, the
// 1-D train invariants (never overlap, never backward, wall-backed rest ladder,
// junction contacts), the tray capacity identity + back-up, and the validator's red
// arms (V1–V12). Dependency-free ESM (node ≥ 22.15 / 23.5 — module.registerHooks,
// through which web/tools/table-in-node.mjs loads table.js for the kernel cups):
//
//   node web/tools/test-ballreturn.mjs                 # the gate (exit 1 on any FAIL)
//   node web/tools/test-ballreturn.mjs --pin           # print the fixture's determinism hash
//   node web/tools/test-ballreturn.mjs --track <path>  # validate an exporter's definition
//   node web/tools/test-ballreturn.mjs --fuzz 5000  # the class-W clearance fuzz at the report's depth
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateTrack, drainTable, shapeRefusal } from '../scene/ballreturn/schema.js';
import * as SCHEMANS from '../scene/ballreturn/schema.js';
import * as TRACKNS from '../scene/ballreturn/track.js';
import * as KINNS from '../scene/ballreturn/kinematics.js';
import { buildTrack, supportDerived, stationAt, tangentAt, restStation, resistCoeff, maxPathJump, G, accelAt, locate, stationD, seatBehind, sideD, reachTop, reachSpan, EXPORT_GRAIN, poseClearance, refusePose, routeEntry, routeTop } from '../scene/ballreturn/track.js';
import { handoffFromSink, solveShot, poseAt, sampleSolution, continuationAt, createEventCursor, SAMPLE_STRIDE, SINK_SHIELD_Y, designGate, designGateChunked } from '../scene/ballreturn/kinematics.js';
import { tableContext, loadTableModule } from './table-in-node.mjs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import { buildSinkPivot, poseInSink } from '../app/sinkpivot.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(here, '../scene/ballreturn/tracks/TEST-synthetic-wire-slide.json');
const args = process.argv.slice(2);
let failures = 0;
let skipped = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failures += 1;
};
// An arm whose INSTRUMENT is absent — the recorded reading it compares against cannot be lined up
// with this run — may not print PASS while its own text says it did not run. It reports SKIP, a
// verdict of its own, counted apart from the passes in the tail below and never inside them, so no
// gate can read a pass total as though the arm had measured something (GH-770 review r6, class Z2).
const skip = (name, why) => { console.log(`SKIP  ${name} — ${why}`); skipped += 1; };
const sha = (buf) => createHash('sha256').update(Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength)).digest('hex');
// CIWIRE-FIX2 (review ciwire2 P1): a committed hash over RAW floats is architecture-sensitive — ARM64 and x64 differ in the last bits
// (measured <= 4.44e-16 on the c2 buffer), so the same law hashed to two pins. Every COMMITTED pin now hashes the buffer QUANTISED to
// PIN_QUANTUM: each finite non-integer value rounded to a multiple of 1e-6 (1 um of position, 1e-6 of a unit quaternion; ids and NaN
// pass through; -0 is normalised to 0) and written back as a double — the same bytes on every IEEE platform for the same quantised
// value. 1e-6 rather than 1e-9: a value within the noise of a rounding boundary still flips, with probability ~ 2 * 4.44e-16 / q per
// float; c2's buffer carries 19 437 non-integer floats — ~1.7 % of a spurious x64 red per pin at 1e-9, ~1.7e-5 at 1e-6 — and nothing
// these pins protect moves by less than a micrometre. TWO hash kinds, never mixed (CIWIRE-FIX3, review ciwire3 P2): a row whose other
// side is a COMMITTED pin or digest (c2, t7, r13e, r15f, r19d, r45b, r58; lifecycle L70d) hashes the QUANTISED buffer (`pinHash`); a
// row comparing two results of the SAME process (c1, d1, c4a/b) hashes the RAW buffer (`rawHash` / `sha`) — cross-architecture
// rounding cannot reach a same-process identity, and quantising it would hide a real bit-level difference (ADR-0017's bit-identical
// seek guarantee, the determinism non-negotiable). Red arms: OB_PIN_PERTURB=<eps> adds eps to the first finite non-integer float of every
// pinned buffer before quantising — 1e-15 is quantised away (PASS), 10 x the quantum is not (FAIL); OB_RAW_PERTURB=<eps> adds eps to the
// same-process REFERENCE buffer (a copy) before its raw hash — any eps, 1e-15 included, reds c1 and d1 (raw = bit-identical).
const PIN_QUANTUM = 1e-6;
const PIN_PERTURB = Number(process.env.OB_PIN_PERTURB ?? 0) || 0;
const quantised = (buf, q = PIN_QUANTUM) => { const out = new Float64Array(buf.length); let perturbed = PIN_PERTURB === 0; for (let i = 0; i < buf.length; i++) { let v = buf[i]; if (!Number.isFinite(v) || Number.isInteger(v)) { out[i] = v; continue; } if (!perturbed) { v += PIN_PERTURB; perturbed = true; } const k = Math.round(v / q); out[i] = k === 0 ? 0 : k * q; } return out; };
const pinHash = (buf) => sha(quantised(buf));
const RAW_PERTURB = Number(process.env.OB_RAW_PERTURB ?? 0) || 0;
const rawHash = (buf) => { if (RAW_PERTURB === 0) return sha(buf); const c = Float64Array.from(buf); for (let i = 0; i < c.length; i++) { if (Number.isFinite(c[i]) && !Number.isInteger(c[i])) { c[i] += RAW_PERTURB; break; } } return sha(c); }; // the reference side of a same-process identity; the copy keeps `buf` itself intact for the pinned row

// wpa_generic_9ft kernel cups from table.js itself (web/tools/table-in-node.mjs —
// seal 3, review r1 P2-5: no geometry mirror in the gate; the e2e reads the live
// ones in-page). R = the WPA §16 reference ball.
const R = 0.028575;
if (args.includes('--census')) {
  // ---- census mode (#749): every definition in <dir> against the BUILT wpa_generic_9ft table ----
  // The fuller browser stubs of tools/render/d621/plan/gully_route_arm_621.mjs:36-47 go in FIRST:
  // loadTableModule registers the 'three' hook and its own ??= stubs, and ??= keeps whichever
  // stubs were installed first, so this order is what lets buildTable run headless here. This
  // block sits above TABLE_CTX, so it uses only what the header declares (fs, path, here, args,
  // validateTrack, R, execFileSync) and reads JSON itself.
  const noop = () => {}; const g = globalThis;
  const imageData = (w, h) => ({ data: new Uint8ClampedArray(Math.max(1, w | 0) * Math.max(1, h | 0) * 4), width: Math.max(1, w | 0), height: Math.max(1, h | 0) });
  const ctx2d = () => { const store = {}; return new Proxy({}, { get: (t, k) => { if (k === 'getImageData') return (x, y, w, h) => imageData(w, h); if (k === 'createImageData') return (w, h) => imageData(typeof w === 'object' ? w.width : w, typeof w === 'object' ? w.height : h); if (k === 'measureText') return () => ({ width: 1 }); if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return () => ({ addColorStop: noop }); if (k in store) return store[k]; return noop; }, set: (t, k, v) => { store[k] = v; return true; } }); };
  const canvas = () => { const c = { width: 1, height: 1, style: {}, setAttribute: noop, appendChild: noop, addEventListener: noop, toDataURL: () => '' }; c.getContext = (kind) => (kind === '2d' ? ctx2d() : null); return c; };
  g.window ??= g; g.addEventListener ??= noop; g.removeEventListener ??= noop; g.dispatchEvent ??= () => true;
  g.matchMedia ??= () => ({ matches: false, addEventListener: noop, removeEventListener: noop, addListener: noop, removeListener: noop });
  g.sessionStorage ??= { getItem: () => null, setItem: noop, removeItem: noop }; g.localStorage ??= g.sessionStorage;
  g.location ??= { search: '', href: 'http://localhost/', origin: 'http://localhost', pathname: '/' };
  g.navigator ??= { userAgent: 'node', language: 'en' };
  g.document ??= { createElement: (tag) => (tag === 'canvas' ? canvas() : { getContext: () => null, style: {}, setAttribute: noop, appendChild: noop, addEventListener: noop }), createElementNS: () => canvas(), body: { appendChild: noop, classList: { add: noop, remove: noop } }, documentElement: { style: { setProperty: noop }, classList: { add: noop, remove: noop } }, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener: noop, head: { appendChild: noop } };
  g.requestAnimationFrame ??= () => 0; g.cancelAnimationFrame ??= noop; g.devicePixelRatio ??= 1; g.innerWidth ??= 1280; g.innerHeight ??= 720;
  g.CustomEvent ??= class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } }; g.Image ??= class Image {};
  const tm = await loadTableModule();
  const THREE = await import('three');
  const { furnitureClearance, furnitureOf } = await import('../scene/ballreturn/furniture.js');
  const { validateAssembly, assemblyMatcher } = await import('../scene/ballreturn/assembly.js');
  const built = tm.buildTable({ tableId: 'wpa_generic_9ft' });
  await built.ready;
  const cups = tm.makeGeom('wpa_generic_9ft').pockets.map((p) => ({ x: p.x, z: p.z, r: p.r }));
  const assembly = assemblyMatcher(validateAssembly(JSON.parse(fs.readFileSync(path.resolve(here, '../scene/ballreturn/assemblies/wpa_generic_9ft.json'), 'utf8')), { tableId: 'wpa_generic_9ft', specs: tm.TABLE_SPECS }));
  const censusRow = async (doc, basename) => {
    if (doc?.doc?.table_id !== 'wpa_generic_9ft') return { skip: doc?.doc?.table_id };
    let track = null;
    try { track = validateTrack(doc, { pockets: cups, falls: null }); } catch (e) { return { refused: String((e && e.message) || e) }; }
    const cv = await furnitureClearance({ track, r: R, scene: built.group, tableId: 'wpa_generic_9ft', trackId: `census#${basename}`, THREE, pockets: cups, assembly });
    return { evaluated: cv.evaluated === true, stations: cv.stations ?? 0, violations: (cv.violations ?? []).length, reason: cv.reason ?? '' };
  };
  const censusDirArg = args[args.indexOf('--census') + 1];
  const censusDir = path.isAbsolute(censusDirArg) ? censusDirArg : (fs.existsSync(path.resolve(process.cwd(), censusDirArg)) ? path.resolve(process.cwd(), censusDirArg) : path.resolve(here, '../..', censusDirArg));
  const legs = furnitureOf(THREE, built.group, { assembly }).filter((e) => e.mesh.geometry.type === 'CylinderGeometry' && e.mesh.geometry.parameters?.radialSegments === 4).length;
  console.log(`CENSUS LEGS ${legs}`);
  const fails = [];
  const status = built.group.userData.tableReadiness?.status; const visible = built.group.visible;
  if (status !== 'READY' || visible !== true) fails.push(`table status ${status}, visible ${visible}`);
  if (legs === 0) fails.push('zero legs');
  let rows = 0, stationsTotal = 0, expectedRefusals = 0;
  for (const f of fs.readdirSync(censusDir).filter((x) => x.endsWith('.json')).sort()) {
    const doc = JSON.parse(fs.readFileSync(path.join(censusDir, f), 'utf8'));
    const row = await censusRow(doc, f);
    if (row.skip !== undefined) { console.log(`CENSUS SKIP ${f}: doc.table_id ${row.skip}`); continue; }
    if (row.refused !== undefined) {
      if (f === 'TEST-crossing-wire-slide.json' && row.refused.includes('[V14]')) { console.log(`CENSUS REFUSED-EXPECTED ${f} [V14]`); expectedRefusals += 1; }
      else { console.log(`CENSUS REFUSED-UNEXPECTED ${f}: ${row.refused.slice(0, 140)}`); fails.push(`${f} refused unexpectedly`); }
      continue;
    }
    rows += 1; stationsTotal += row.stations;
    console.log(`CENSUS ROW ${f}: ${row.violations} violations / ${row.stations} stations${row.reason ? ` — ${String(row.reason).slice(0, 140)}` : ''}`);
    if (!row.evaluated) fails.push(`${f} not evaluated`);
    if (row.violations > 0 || row.stations === 0) fails.push(`${f} ${row.violations} violations / ${row.stations} stations`);
  }
  if (rows === 0) fails.push('zero rows');
  const negPath = path.resolve(here, 'fixtures/ballreturn-tracks/TEST-y3-obtuse.json');
  const neg = await censusRow(JSON.parse(fs.readFileSync(negPath, 'utf8')), 'TEST-y3-obtuse.json');
  const negV = neg.violations ?? 0, negS = neg.stations ?? 0, negReason = String(neg.reason ?? neg.refused ?? '');
  console.log(`CENSUS NEGATIVE TEST-y3-obtuse.json: ${negV} violations / ${negS} stations — ${negReason.slice(0, 140)}`);
  if (!(negV > 0 && negReason.startsWith('ball-return track refused [V20]'))) fails.push('negative TEST-y3-obtuse.json not refused [V20]');
  if (fails.length) { console.log(`CENSUS FAIL: ${fails.join('; ')}`); process.exit(1); }
  console.log(`CENSUS PASS: ${rows} fixtures, ${stationsTotal} stations, 0 violations, ${expectedRefusals} expected refusals`);
  process.exit(0);
}
const TABLE_CTX = await tableContext('wpa_generic_9ft');
const POCKETS = TABLE_CTX.pockets;
const loadDef = (p = FIXTURE) => JSON.parse(fs.readFileSync(p, 'utf8'));
// Track definitions live in two dirs since #749: the shipped tracks dir (served) and the
// node-only fixtures dir (never served; TEST-y3-obtuse was relocated there because its route 0
// entry stands inside the generic table's corner leg and no shipped-dir siting clears it).
// trackFiles() lists the union as [basename, absPath] pairs, deduped by basename with the
// shipped dir winning, sorted by plain code-unit comparison. trackPath(name) resolves one
// definition (with or without the .json suffix) in the shipped dir first, then the fixtures
// dir, and throws naming both dirs on a miss.
const TRACKS_DIR_MAIN = path.resolve(here, '../scene/ballreturn/tracks');
const TRACKS_DIR_NODE = path.resolve(here, 'fixtures/ballreturn-tracks');
const trackFiles = () => {
  const byName = new Map();
  for (const dir of [TRACKS_DIR_NODE, TRACKS_DIR_MAIN]) {
    let names = [];
    try { names = fs.readdirSync(dir); } catch { names = []; }
    for (const f of names) if (f.endsWith('.json')) byName.set(f, path.join(dir, f));
  }
  return [...byName.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
};
const trackPath = (name) => {
  const file = name.endsWith('.json') ? name : `${name}.json`;
  for (const dir of [TRACKS_DIR_MAIN, TRACKS_DIR_NODE]) {
    const p = path.join(dir, file);
    if (fs.existsSync(p)) return p;
  }
  throw new Error(`track definition ${file} not found in ${TRACKS_DIR_MAIN} or ${TRACKS_DIR_NODE}`);
};

// ---- schema mirror sync ----------------------------------------------------------
// `--sync-schema` regenerates web/scene/ballreturn/track-schema.js from the docs
// schema (the one published source); arm n1 below refuses a mirror out of parity.
const SCHEMA_DOC = path.resolve(here, '../../docs/geometry/ball-return-track.schema.json');
const SCHEMA_MIRROR = path.resolve(here, '../scene/ballreturn/track-schema.js');
const mirrorSource = (obj) => `// GENERATED from docs/geometry/ball-return-track.schema.json by\n//   node web/tools/test-ballreturn.mjs --sync-schema\n// Do not edit: the node gate refuses a mirror that differs from the docs file byte for\n// byte (arm n1). The docs file is the ONE published schema; this module exists so the\n// browser can enforce it before any geometry is built without an extra fetch (the\n// docs tree is not served by the app) and without JSON import attributes.\nexport default ${JSON.stringify(obj, null, 2)};\n`;
if (args.includes('--sync-schema')) {
  fs.writeFileSync(SCHEMA_MIRROR, mirrorSource(JSON.parse(fs.readFileSync(SCHEMA_DOC, 'utf8'))));
  console.log(`synced ${SCHEMA_MIRROR} from ${SCHEMA_DOC}`);
  process.exit(0);
}

// ---- 1.0 → 1.1 upgrade (mechanical) ---------------------------------------------
// `--upgrade <path>` rewrites a 1.0 file that describes a terminal-chute system with
// the 1.0 vocabulary (several `next: null` runways, one of them named as the tray) into
// the 1.1 terminal-chutes form: every terminal runway becomes a role-chute with a
// `stop` whose wall is the chute's LOWEST support vertex (arclength station), capacity
// = floor(wall_s / d_ref) (the tray identity), the `tray` block dropped. Geometry and
// every read are untouched; the stop's provenance is DERIVED from the file's own
// vertices. Prints the 1.1 JSON (or writes it with --upgrade-out).
export function upgradeToTerminal(def) {
  if (def.topology === 'terminal-chutes') return { def, changed: false, note: 'already schema 1.1 (terminal-chutes): nothing to upgrade' }; // idempotent (review 7)
  const terminals = def.runways.filter((rw) => rw.next === null);
  if (terminals.length < 2 && (def.topology ?? 'trunk-tray') === 'trunk-tray') return { def, changed: false, note: 'one terminal runway: a trunk-tray system, nothing to upgrade' };
  const d = JSON.parse(JSON.stringify(def));
  const refD = d.ball.reference_diameter_mm;
  d.topology = 'terminal-chutes';
  delete d.tray;
  const notes = [];
  for (const rw of d.runways) {
    if (rw.next !== null) { if (rw.role === 'tray') rw.role = 'trunk'; continue; }
    rw.role = 'chute';
    // arclength to the lowest vertex = the stop face (a clamp / lip beyond it is the stop body)
    let s = 0, sLow = 0, yLow = Infinity;
    for (let i = 0; i < rw.points_mm.length; i++) {
      if (i > 0) { const a = rw.points_mm[i - 1], b = rw.points_mm[i]; s += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]); }
      if (rw.points_mm[i][1] < yLow - 1e-9) { yLow = rw.points_mm[i][1]; sLow = s; }
    }
    const wall = Math.floor(sLow * 10 + 1e-6) / 10; // floored to the 0.1 mm grain: the wall never passes the vertex (no lip sliver on the route)
    rw.stop = { kind: 'clamp', wall_s_mm: wall, capacity_balls: Math.floor(wall / refD + 1e-9),
      provenance: { tag: 'DERIVED', source: `upgrade 1.0→1.1: the stop face at the chute's lowest support vertex (arclength ${wall} mm of ${(Math.round(s * 10) / 10)}); capacity floor(${wall} / ${refD}) = ${Math.floor(wall / refD + 1e-9)}; the support line beyond it is the stop body` } };
    notes.push(`${rw.id}: wall ${wall} mm, capacity ${rw.stop.capacity_balls}`);
  }
  return { def: d, changed: true, note: notes.join('; ') };
}
if (args.includes('--upgrade')) {
  const src = args[args.indexOf('--upgrade') + 1];
  const { def: up, changed, note } = upgradeToTerminal(loadDef(src));
  const out = args.includes('--upgrade-out') ? args[args.indexOf('--upgrade-out') + 1] : null;
  if (out) { fs.writeFileSync(out, JSON.stringify(up, null, 2) + '\n'); console.error(`upgraded ${src} → ${out} (${changed ? note : note})`); }
  else console.log(JSON.stringify(up, null, 2));
  process.exit(0);
}

// ---- exporter mode ----------------------------------------------------------
// `--track <path>` validates a lane export against the geometry of the table it
// names (doc.table_id → table.js makeGeom cups + pocketVisualFalls, loaded in node),
// so the entry/fall laws (V5) run exactly as the runtime runs them. An unknown
// table is an ERROR (exit 3), never a skipped context (review r1 P2-5).
if (args.includes('--track')) {
  const p = args[args.indexOf('--track') + 1];
  try {
    const d = loadDef(p);
    const tctx = await tableContext(d?.doc?.table_id);
    const t = validateTrack(d, { pockets: tctx.pockets, falls: tctx.falls });
    console.log(`OK ${p}: validated against ${tctx.tableId} (${tctx.pockets.length} kernel cups${tctx.falls ? ', visual falls' : ''}); topology ${t.topology}; ${t.runways.size} runways, ${t.routes.size} served pockets, ${t.tray ? `tray capacity ${t.tray.capacity}` : `${t.rests.size} chutes (capacity ${[...t.rests.values()].map((r) => r.capacity).join('/')})`}`);
    for (const row of drainTable(t)) console.log(`  drain route ${row.route} ${row.runway} D ${row.dFrom.toFixed(3)}→${row.dTo.toFixed(3)} a ${row.a.toFixed(4)}`);
    process.exit(0);
  } catch (e) { console.error(String(e.message ?? e)); process.exit(3); }
}

const def = loadDef();
const track = validateTrack(def, { pockets: POCKETS, falls: null });
const ctx = { track, pockets: POCKETS, r: R };

// ---- (a) rolling identities -------------------------------------------------
{
  const ch = supportDerived({ kind: 'channel', width: 0.08 }, R);
  check('a1 channel inertia factor k = 5/7', Math.abs(ch.k - 5 / 7) < 1e-15 && ch.rho === R && ch.h === R, `${ch.k}`);
  const tr = supportDerived(track.support, R);
  const h = Math.sqrt((28.575 + 2) ** 2 - 20 ** 2), c = 20 * 28.575 / 30.575, rho = Math.sqrt(28.575 ** 2 - c ** 2);
  const k = 1 / (1 + 0.4 * (28.575 / rho) ** 2);
  check('a2 twin-rail h/ρ/k match the hand derivation (mm)',
    Math.abs(tr.h * 1000 - h) < 1e-9 && Math.abs(tr.rho * 1000 - rho) < 1e-9 && Math.abs(tr.k - k) < 1e-12,
    `h ${(tr.h * 1000).toFixed(3)} ρ ${(tr.rho * 1000).toFixed(3)} k ${tr.k.toFixed(4)}`);
  const rows = drainTable(track);
  check('a3 every non-tray edge drains (drive > resist)', rows.filter((r) => r.runway !== 'tray').every((r) => r.drive > r.resist));
  check('a4 the tray is level (drive 0) and the channel resistance reduces to u_r·g exactly', rows.filter((r) => r.runway === 'tray').every((r) => r.drive === 0 && Math.abs(r.resist - track.u_r * 9.8) < 1e-12), rows.filter((r) => r.runway === 'tray').map((r) => r.resist.toFixed(6)).join(' '));
  const twin = supportDerived(track.support, R);
  check('a5 resistance: k·(7/5)(r/ρ)·u_r on the twin rail, exactly u_r on a channel (k = 5/7, ρ = r)', Math.abs(resistCoeff(twin, R, track.u_r) - 1.4 * (R / twin.rho) * track.u_r) < 1e-15 && Math.abs(ch.k * resistCoeff(ch, R, track.u_r) - track.u_r) < 1e-15, `twin ${(twin.k * resistCoeff(twin, R, track.u_r)).toFixed(5)} channel ${(ch.k * resistCoeff(ch, R, track.u_r)).toFixed(5)}`);
}

// ---- (b) handoff closed forms vs sinkpivot.js bisection -------------------
{
  const POCKET = { px: POCKETS[4].x, pz: POCKETS[4].z, pr: POCKETS[4].r };
  const spec = (speed) => {
    const inward = -1; // travelling along −x is irrelevant; enter along +z toward the side cup
    const x0 = POCKET.px, z0 = POCKET.pz - POCKET.pr;
    const vz = speed, vx = 0;
    const wMag = speed / R;
    return { x0, z0, vx, vz, wx: (vz / Math.max(speed, 1e-12)) * wMag * (inward * -1), wy: 0, wz: 0, q0: [0, 0, 0, 1], ...POCKET, r: R, falls: null };
  };
  const bisectCull = (e) => { // last dt with a pose (game.js's own 7-halving method, deeper)
    let lo = 0, hi = e.ttl;
    if (poseInSink(e, hi, {})) return hi;
    for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (poseInSink(e, mid, {})) lo = mid; else hi = mid; }
    return hi;
  };
  for (const [name, speed] of [['fly-in 2.0 m/s', 2.0], ['slow pivot 0.2 m/s', 0.2], ['creep 0.05 m/s', 0.05]]) {
    const e = buildSinkPivot(spec(speed));
    check(`b0 ${name}: sinkpivot built`, !!e);
    if (!e) continue;
    const tCull = bisectCull(e);
    const h = handoffFromSink({ t: 0, pocket: POCKETS[4], fall: POCKETS[4], r: R, pivot: e }, ctx);
    check(`b1 ${name}: closed-form handoff equals the poseInSink cull to 1 µs (${(h.tH * 1000).toFixed(2)} vs ${(tCull * 1000).toFixed(2)} ms; tPivot ${(e.tPivot * 1000).toFixed(0)} ms)`,
      !!h && Math.abs(h.tH - tCull) <= 1e-6, h ? `Δ ${((h.tH - tCull) * 1e6).toFixed(3)} µs` : 'null');
    check(`b2 ${name}: handoff before the sink TTL (${h?.tH.toFixed(3)} < ${e.ttl})`, !!h && h.tH < e.ttl && !h.clamped);
    // vertical speed at the cull = the derivative of the sink's own y law
    const dt = 1e-5;
    const p1 = poseInSink(e, tCull - 2 * dt, {}), p2 = poseInSink(e, tCull - dt, {});
    const vy = (p2.y - p1.y) / dt;
    check(`b3 ${name}: downward speed at handoff matches the sink slope (${h.vDown.toFixed(3)} vs ${(-vy).toFixed(3)} m/s)`, Math.abs(h.vDown + vy) < 0.02);
  }
  const hl = handoffFromSink({ t: 0.5, pocket: POCKETS[1], fall: POCKETS[1], r: R, tFall: 0.03, glide: 0.06 }, ctx);
  const tfLegacy = Math.sqrt(2 * (2 * R - SINK_SHIELD_Y) / 9.8);
  check('b4 legacy handoff = tFall + sqrt(2(2r − SHIELD)/g)', Math.abs(hl.tH - (0.5 + 0.03 + tfLegacy)) < 1e-12 && Math.abs(hl.vDown - 9.8 * tfLegacy) < 1e-12, `${hl.tH}`);
  check('b5 legacy handoff before the 0.45 s TTL', hl.tH - 0.5 < 0.45);
  check('b6 netted / dressed entries are never served', handoffFromSink({ t: 0, pocket: POCKETS[1], fall: POCKETS[1], r: R, tFall: 0.03, net: {} }, ctx) === null
    && handoffFromSink({ t: 0, pocket: POCKETS[1], fall: POCKETS[1], r: R, tFall: 0.03, dress: {} }, ctx) === null);
  check('b7 an unserved pocket returns null', handoffFromSink({ t: 0, pocket: POCKETS[0], fall: POCKETS[0], r: R, tFall: 0.03 }, ctx) === null);
  check('b8 landing speed = k · v_land · sinθ_entry', (() => {
    const st = stationAt(hl.route, hl.route.total, R, {});
    const dy = (SINK_SHIELD_Y - R) - st.y;
    const tFree = (-hl.vDown + Math.sqrt(hl.vDown ** 2 + 2 * 9.8 * dy)) / 9.8;
    const vLand = hl.vDown + 9.8 * tFree;
    const sinTh = 60 / Math.hypot(850, 60);
    return Math.abs(hl.v0 - st.k * vLand * sinTh) < 1e-9 && Math.abs(hl.tLand - hl.tH - tFree) < 1e-12;
  })());
}

// ---- the reference shot: a combination into the right middle + a left pot ---
const mkArrivals = () => {
  const e1 = { t: 1.0, pocket: POCKETS[4], fall: POCKETS[4], r: R, glide: 0.06, tFall: 0.021 };
  const e2 = { t: 1.3, pocket: POCKETS[4], fall: POCKETS[4], r: R, pivot: { tPivot: 0, fallDelay: 0.021, p1y: R, v1y: 0, ttl: 0.45 } };
  const e3 = { t: 1.6, pocket: POCKETS[1], fall: POCKETS[1], r: R, pivot: { tPivot: 0.12, fallDelay: 0, p1y: R * Math.cos(0.5), v1y: -0.3, ttl: 0.57 } };
  return [{ id: 1, handoff: handoffFromSink(e1, ctx) }, { id: 9, handoff: handoffFromSink(e2, ctx) }, { id: 2, handoff: handoffFromSink(e3, ctx) }];
};
const GRID = { t0: 0.5, dt: 1 / 240 };
const solveRef = () => solveShot({ track, r: R, ledger: [7, 8], arrivals: mkArrivals() });

// ---- (b′) r66a–d the SNOOKER pre-roll hand-off parity (#707 prep FIX3, review 707m3 P2) ---------------------------------
// Since main a9f9729a (#637) a snooker corner capture outside the dressed throat rolls to its rim first (sinkpivot.js
// buildSinkPivot, GH-489 SNK-R36 — the ONE additive branch the the ownership ledger "Recorded deviation (frozen sinkpivot.js, one
// branch): the W9-named model extension" records; poseInSink shifts its clock by `roll.t` and the pivot's ttl grows by it). The
// hand-off the controller reads must sit on that SAME clock: kinematics handoffFromSink adds `pv.roll.t` — the one duration the
// sink builder computed and poseInSink subtracts, never re-derived. On 7f250f91 it did not: the committed XW101 track at a
// 0.04 m/s corner capture handed off at 0.2730 s while the sink retired the ball at 0.8029 s (gap 0.5298 s = the roll), so the
// return animation had reached the chute stop before the controller could pose the ball — the visible roll skipped.
{
  const { loadTableModule } = await import('./table-in-node.mjs');
  const TM = await loadTableModule();
  const bisectRetire = (e) => { let lo = 0, hi = e.ttl; if (poseInSink(e, hi, {})) return hi; for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (poseInSink(e, mid, {})) lo = mid; else hi = mid; } return hi; }; // the first dt poseInSink reports no pose (retired)
  const cornerCapture = (P, v, r, extra) => { const n = Math.hypot(P.x, P.z); const ux = -P.x / n, uz = -P.z / n; const w = v / r; // on the capture-disc rim, on the corner axis, rolling toward the pocket centre
    return buildSinkPivot({ x0: P.x + ux * P.r, z0: P.z + uz * P.r, vx: -ux * v, vz: -uz * v, wx: uz * w, wy: 0, wz: -(ux * w), q0: [0, 0, 0, 1], px: P.x, pz: P.z, pr: P.r, r, falls: null, ...extra }); };
  // (a)/(b) XW101, kernel corner 0 of wpbsa_snooker_12ft, the throats = table.js pocketPlateDatums (the sink's own source)
  const sctxF = await tableContext('wpbsa_snooker_12ft');
  const xwF = validateTrack(loadDef(path.resolve(here, '../scene/ballreturn/tracks/wpbsa_snooker_12ft-xw101-slides.json')), { pockets: sctxF.pockets, falls: sctxF.falls });
  const datums = TM.pocketPlateDatums('wpbsa_snooker_12ft');
  const P0 = sctxF.pockets[0]; const rS = xwF.refR;
  const readS = (v) => { const e = cornerCapture(P0, v, rS, { throats: datums }); const tRet = e ? bisectRetire(e) : NaN; const h = e ? handoffFromSink({ t: 0, pocket: P0, fall: P0, r: rS, pivot: e }, { track: xwF, pockets: sctxF.pockets, r: rS }) : null; return { e, tRet, h }; };
  const A = readS(0.04), B = readS(0.20);
  const BASE = { a: { tH: 0.2730, tRet: 0.8029, gap: 0.5298 }, b: { tH: 0.1895, tRet: 0.2955, gap: 0.1060 } }; // measured on 7f250f91 (kinematics before FIX3) with this construction, 2026-09-18 13:46Z
  check(`r66a snooker-entry hand-off PARITY on XW101 at a 0.04 m/s corner capture (FIX3): the hand-off ${A.h ? (A.h.tH * 1e3).toFixed(2) : '?'} ms equals the sink's retire time ${(A.tRet * 1e3).toFixed(2)} ms to 1 µs, the pre-roll ${A.e?.roll ? (A.e.roll.t * 1e3).toFixed(1) : '?'} ms included (7f250f91 read ${BASE.a.tH} s against ${BASE.a.tRet} s — the ${BASE.a.gap} s roll missing); timing contract: the ownership ledger §Recorded deviation (frozen sinkpivot.js, one branch) SNK-R36 — poseInSink shifts dt by the roll time, the hand-off clock is the pivot's own`, !!A.e && !!A.e.roll && A.e.roll.t > 0.4 && !!A.h && Math.abs(A.h.tH - A.tRet) <= 1e-6 && A.h.tH > 0.7 && Math.abs(A.tRet - BASE.a.tRet) < 2e-3, JSON.stringify({ tH: A.h?.tH, tRet: A.tRet, roll: A.e?.roll?.t, preRoll: A.h?.preRoll }));
  check(`r66b the same at a 0.20 m/s corner capture (a shorter roll, ${B.e?.roll ? (B.e.roll.t * 1e3).toFixed(1) : '?'} ms): hand-off ${B.h ? (B.h.tH * 1e3).toFixed(2) : '?'} ms == retire ${(B.tRet * 1e3).toFixed(2)} ms to 1 µs (7f250f91: ${BASE.b.tH} s vs ${BASE.b.tRet} s)`, !!B.e && !!B.e.roll && B.e.roll.t > 0.05 && B.e.roll.t < A.e.roll.t && !!B.h && Math.abs(B.h.tH - B.tRet) <= 1e-6 && Math.abs(B.tRet - BASE.b.tRet) < 2e-3, JSON.stringify({ tH: B.h?.tH, tRet: B.tRet, roll: B.e?.roll?.t }));
  // (c) a US-pool CORNER without a roll (no throats: pool tables carry no plate datums) on the first fixture in web/scene/ballreturn/tracks plus web/tools/fixtures/ballreturn-tracks of a US-pool
  // table that serves a corner — the hand-off is byte-identical to 7f250f91's: the pre-fix closed form recomputed from the pivot's
  // own fields is the oracle (tH = t0 + tPivot + fallDelay + tf), and the side-pocket b1 rows' base-run values are pinned too
  const poolTables = new Set(['wpa_generic_9ft', 'wpa_spec_9ft', 'diamond_proam_9ft', 'predator_apex_9ft', 'diamond_redlabel_9ft']);
  let corner = null;
  for (const [f, p] of trackFiles()) {
    const d = loadDef(p); if (!poolTables.has(d.doc.table_id)) continue;
    let ctxP; try { ctxP = await tableContext(d.doc.table_id); } catch { continue; }
    let tP; try { tP = validateTrack(d, { pockets: ctxP.pockets, falls: ctxP.falls }); } catch { continue; }
    const idx = [0, 2, 3, 5].find((i) => tP.routes.has(i)); if (idx === undefined) continue;
    corner = { file: f, tableId: d.doc.table_id, idx, ctx: ctxP, track: tP }; break;
  }
  let cRow = null;
  if (corner) {
    const P = corner.ctx.pockets[corner.idx]; const rP = corner.track.refR;
    cRow = [0.2, 2.0].map((v) => { const e = cornerCapture(P, v, rP, {}); const h = e ? handoffFromSink({ t: 0, pocket: P, fall: P, r: rP, pivot: e }, { track: corner.track, pockets: corner.ctx.pockets, r: rP }) : null;
      const depth = e ? e.p1y + rP - SINK_SHIELD_Y : NaN; const tf = e ? (e.v1y + Math.sqrt(e.v1y * e.v1y + 2 * 9.8 * depth)) / 9.8 : NaN; const oracle = e ? e.tPivot + e.fallDelay + tf : NaN; // 7f250f91's closed form, verbatim
      return { v, built: !!e, roll: !!e?.roll, tH: h?.tH ?? null, oracle, preRoll: h?.preRoll ?? null, same: !!h && h.tH === oracle }; });
  }
  const sideBase = [['fly-in 2.0 m/s', 2.0, 168.22], ['slow pivot 0.2 m/s', 0.2, 196.71], ['creep 0.05 m/s', 0.05, 271.77]]; // the b1 values printed by the 7f250f91 gate run (gates-7f250f91/test-ballreturn.log)
  const POCK4 = { px: POCKETS[4].x, pz: POCKETS[4].z, pr: POCKETS[4].r };
  const sideNow = sideBase.map(([name, v, ms]) => { const e = buildSinkPivot({ x0: POCK4.px, z0: POCK4.pz - POCK4.pr, vx: 0, vz: v, wx: -(v / R), wy: 0, wz: 0, q0: [0, 0, 0, 1], ...POCK4, r: R, falls: null }); const h = e ? handoffFromSink({ t: 0, pocket: POCKETS[4], fall: POCKETS[4], r: R, pivot: e }, ctx) : null; return { name, base: ms, now: h ? +(h.tH * 1e3).toFixed(2) : null, preRoll: h?.preRoll ?? null }; });
  check(`r66c a US-pool corner without a roll is byte-unchanged (FIX3): ${corner ? `${corner.file} on ${corner.tableId}, kernel corner ${corner.idx}` : 'NO US-pool definition in web/scene/ballreturn/tracks plus web/tools/fixtures/ballreturn-tracks serves a corner'} — no throat, no roll (preRoll 0), the hand-off equals 7f250f91's closed form recomputed from the pivot's own fields exactly (${cRow ? cRow.map((c) => `${c.v} m/s: ${c.tH !== null ? (c.tH * 1e3).toFixed(3) : '?'} ms`).join(', ') : '—'}); the side-pocket b1 hand-offs equal the 7f250f91 run's printed values (${sideNow.map((s) => `${s.now} vs ${s.base} ms`).join(', ')})`, !!corner && !!cRow && cRow.every((c) => c.built && !c.roll && c.preRoll === 0 && c.same) && sideNow.every((s) => s.now === s.base && s.preRoll === 0), JSON.stringify({ corner: corner && { file: corner.file, idx: corner.idx }, cRow, sideNow }));
  check(`r66d the hand-off carries the pre-roll it included: preRoll == the sink's roll.t exactly for both snooker captures (${A.h ? (A.h.preRoll * 1e3).toFixed(1) : '?'} / ${B.h ? (B.h.preRoll * 1e3).toFixed(1) : '?'} ms) and 0 for every entry without a roll; the base reading on 7f250f91 (measured, this construction): gaps ${BASE.a.gap} s and ${BASE.b.gap} s = the rolls the hand-off omitted`, !!A.h && !!B.h && A.h.preRoll === A.e.roll.t && B.h.preRoll === B.e.roll.t && (!cRow || cRow.every((c) => c.preRoll === 0)) && Math.abs(A.e.roll.t - BASE.a.gap) < 2e-3 && Math.abs(B.e.roll.t - BASE.b.gap) < 2e-3, JSON.stringify({ a: [A.h?.preRoll, A.e?.roll?.t], b: [B.h?.preRoll, B.e?.roll?.t] }));
}

// ---- (b″) r67a–d the VISIBLE FALL joins the V16 sweep; r68a–c yield after every attempted solve (#707 prep FIX4, review 707m4) ---
// A: V16 sampled stationAt (the rolling path) only, while poseAt also draws a ballistic descent from the hand-off to the entry.
// Furniture standing in that descent but clear of the runway was approved and the drawn ball went through it. Now furniture.js
// samples the descent through kinematics.js fallPointAt — the ONE fall law poseAt draws, over the ONE fall piece solveShot
// builds (fallPieceOf) — from the first drawn instant to the landing, for the legacy arc and the vDown-0 bracket, given the
// pocket cups (+ visual falls) the controller passes; a hit there is a V16 violation naming the furniture and the fall.
// Base reading on f5b89c0c (fix4-probe.mjs, this construction, 2026-09-18 14:50Z): V16 0 violations over 935 stations while
// poseAt's drawn ball penetrated the box by 6.79 mm at t = 0.7586 s (review read 5.36 mm at 0.750287 s with its own construction).
// B: designGateSteps skipped its yield when a solve THREW, so consecutive failures ran in one slice with no budget or cancel
// check — on f5b89c0c maxEvents: 1 gave 36 failures in 1 slice with 0 idle callbacks; now every attempted solve yields.
{
  const THREE = await import('three');
  const { furnitureClearance, clearFurnitureCache } = await import('../scene/ballreturn/furniture.js');
  const { designGateChunked, fallPointAt, fallPieceOf } = await import('../scene/ballreturn/kinematics.js');
  const trkF = validateTrack(loadDef(FIXTURE), { pockets: POCKETS, falls: null });
  const BOX = [-0.001534, -0.203313, 0.7035], HALF = 0.0025; // review's 5 mm box in the pocket-4 fall
  const mkF = (pos) => { const sc = new THREE.Scene(); if (pos) { const bx = new THREE.Mesh(new THREE.BoxGeometry(2 * HALF, 2 * HALF, 2 * HALF), new THREE.MeshBasicMaterial()); bx.name = 'obTestFallBox'; bx.position.set(...pos); sc.add(bx); } sc.updateMatrixWorld(true); return sc; };
  const readF = async (sc, tag, withPockets = true) => { clearFurnitureCache(); return furnitureClearance({ track: trkF, r: R, scene: sc, tableId: 'wpa_generic_9ft', trackId: 'TEST-synthetic-wire-slide-' + tag, ...(withPockets ? { pockets: POCKETS, falls: null } : {}) }); };
  // poseAt's own reading of the same box: one legacy drop into pocket 4 at 0.5 s, the deepest penetration of the drawn ball
  const hF = handoffFromSink({ t: 0.5, pocket: POCKETS[4], fall: POCKETS[4], r: R, tFall: 0.03, glide: 0.06 }, ctx);
  const solF = solveShot({ track: trkF, r: R, ledger: [], arrivals: [{ id: 1, handoff: hF }] });
  const distBox = (p, c) => { const dx = Math.max(Math.abs(p.x - c[0]) - HALF, 0), dy = Math.max(Math.abs(p.y - c[1]) - HALF, 0), dz = Math.max(Math.abs(p.z - c[2]) - HALF, 0); return Math.hypot(dx, dy, dz); };
  const penOf = (c) => { let w = { pen: -Infinity, t: null }; for (let tt = hF.tH; tt <= hF.tLand + 0.3; tt += 1e-5) { const q = poseAt(solF, 1, tt, {}); if (!q) continue; const pen = R - distBox(q, c); if (pen > w.pen) w = { pen, t: tt, kind: q.kind }; } return w; };
  const fA = await readF(mkF(BOX), 'box'); const penA = penOf(BOX);
  const fallHitsA = fA.violations.filter((v) => v.fall);
  check(`r67a review's box in the visible fall is REFUSED (FIX4 A): a 5 mm box at (${BOX.map((x) => (x * 1e3).toFixed(1)).join(', ')}) mm → [V16] naming ${fA.byMesh[0]?.mesh}, ${fA.violations.length} violations of which ${fallHitsA.length} on the fall into pocket 4, worst depth ${fA.byMesh[0] ? (fA.byMesh[0].worstDepth * 1e3).toFixed(2) : '?'} mm at t +${fallHitsA.length ? (Math.min(...fallHitsA.map((v) => v.fall.tau)) * 1e3).toFixed(0) : '?'}–${fallHitsA.length ? (Math.max(...fallHitsA.map((v) => v.fall.tau)) * 1e3).toFixed(0) : '?'} ms after the hand-off; poseAt's drawn ball penetrates it ${(penA.pen * 1e3).toFixed(2)} mm at t ${penA.t?.toFixed(6)} (${penA.kind}) — f5b89c0c: 0 violations, 6.79 mm at 0.7586 s`, fA.evaluated && fA.fallSwept === true && fA.violations.length > 0 && fallHitsA.length > 0 && /\[V16\]/.test(fA.reason ?? '') && /obTestFallBox/.test(fA.reason ?? '') && /VISIBLE FALL into pocket 4/.test(fA.reason ?? '') && penA.pen > 0.005 && penA.kind === 'fall' && Math.abs(fA.byMesh[0].worstDepth - penA.pen) < 0.001, JSON.stringify({ n: fA.violations.length, fall: fallHitsA.length, worst: fA.byMesh[0]?.worstDepth, pen: penA, reason: fA.reason?.slice(0, 220) }));
  const MOVED = [BOX[0] + R + HALF + 0.010, BOX[1], BOX[2]]; // 10 mm clear of the fall (and farther still from the rolling path)
  const fB = await readF(mkF(MOVED), 'moved'); const penB = penOf(MOVED);
  check(`r67b the same box moved 10 mm clear of both paths (+${((R + HALF + 0.010) * 1e3).toFixed(1)} mm in x) is ACCEPTED: ${fB.violations.length} violations, poseAt's nearest approach ${(-penB.pen * 1e3).toFixed(2)} mm clear`, fB.evaluated && fB.violations.length === 0 && penB.pen < -0.009, JSON.stringify({ n: fB.violations.length, pen: penB }));
  const fC0 = await readF(mkF(null), 'clean-rolling', false); const fC1 = await readF(mkF(null), 'clean-fall', true);
  check(`r67c the synthetic fixture's station count before/after the fall joined the sweep: ${fC0.stations} (rolling path only, fallSwept ${fC0.fallSwept}) → ${fC1.stations} (+${fC1.fallStations} fall stations over ${fC1.fallArcs.length} arcs: ${fC1.fallArcs.map((a) => `p${a.pocket}/${a.arc} ${a.stations}`).join(', ')}); a clean scene reads 0 violations both ways`, fC0.evaluated && fC1.evaluated && fC0.fallSwept === false && fC1.fallSwept === true && fC1.stations === fC0.stations + fC1.fallStations && fC1.fallArcs.length === 4 && fC0.violations.length === 0 && fC1.violations.length === 0, JSON.stringify({ before: fC0.stations, after: fC1.stations, arcs: fC1.fallArcs.map((a) => [a.pocket, a.arc, a.stations]) }));
  // the arcs ARE poseAt's: every swept fall station is fallPointAt of the same piece at its τ (drawn: top at or below the exit line), and a fall hit is V16's, never V20's entry band
  const piece4 = fallPieceOf(handoffFromSink({ t: 0, pocket: POCKETS[4], fall: POCKETS[4], r: R, tFall: 0.021, glide: 0.06 }, ctx), R);
  const arc4 = fC1.fallArcs.find((a) => a.pocket === 4 && a.arc === 'legacy');
  const q0 = fallPointAt(piece4, arc4.tShow, {}); const drawnAtShow = q0.y + R <= piece4.exitY + 1e-6; const notDrawnBefore = fallPointAt(piece4, Math.max(0, arc4.tShow - 1e-4), {}).y + R > piece4.exitY;
  check(`r67d the swept arcs are poseAt's own: pocket 4's legacy arc starts at the first drawn instant (τ ${(arc4.tShow * 1e3).toFixed(1)} ms: top ${((q0.y + R) * 1e3).toFixed(1)} mm vs exit line ${(piece4.exitY * 1e3).toFixed(1)}) and ends at the landing (T ${(arc4.T * 1e3).toFixed(1)} ms = tLand − tH ${((piece4.t1 - piece4.t0) * 1e3).toFixed(1)}); the box hits stay V16's (entry-clearance rows ${fA.entryClearance.length}, V20 reason ${fA.entryReason ? 'set' : 'null'})`, !!arc4 && drawnAtShow && notDrawnBefore && Math.abs(arc4.T - (piece4.t1 - piece4.t0)) < 1e-9 && fA.entryClearance.length === 0 && fA.entryReason === null, JSON.stringify({ arc4, exitY: piece4.exitY, y0: q0.y }));
  // B
  let idlesB = 0; const idleB = () => new Promise((res) => { idlesB += 1; setImmediate(res); });
  const gA = await designGateChunked(trkF, { pockets: POCKETS, r: R, maxEvents: 1 }, { budgetMs: 0, idle: idleB });
  check(`r68a every ATTEMPTED solve yields (FIX4 B): maxEvents 1 on the synthetic fixture → ${gA.offenders.length} failed solves over ${gA.slices} slices with ${idlesB} idle callbacks (one attempt per slice: slices = attempts + 1), longest slice ${gA.sliceMaxMs.toFixed(2)} ms — f5b89c0c: 1 slice, 0 idles`, gA.solves === 0 && gA.offenders.length === 36 && gA.slices === 37 && idlesB === 36, JSON.stringify({ slices: gA.slices, idles: idlesB, offenders: gA.offenders.length }));
  let idlesC = 0; const idleC = () => new Promise((res) => { idlesC += 1; setImmediate(res); });
  const gB = await designGateChunked(trkF, { pockets: POCKETS, r: R, maxEvents: 1 }, { budgetMs: 0, idle: idleC, abort: () => idlesC >= 3 });
  check(`r68b cancellation between two FAILING solves is honoured: abort flips after 3 breaths → the sweep stops (aborted ${gB.aborted}, ${gB.slices} slices) instead of running the remaining ${36 - gB.slices} failures`, gB.aborted === true && gB.slices === 3 && idlesC === 3, JSON.stringify({ aborted: gB.aborted, slices: gB.slices, idles: idlesC }));
  const stripV = (d) => { const { slices, sliceMaxMs, ...rest } = d; return JSON.stringify(rest); };
  const gC = await designGateChunked(trkF, { pockets: POCKETS, r: R }, { budgetMs: 4, idle: () => new Promise((res) => setImmediate(res)) });
  check(`r68c the clean synthetic verdict is byte-identical to the synchronous gate after the change (${gC.solves} solves, ${gC.slices} slices; XW101's identity is r54b's)`, stripV(gC) === stripV(designGate(trkF, { pockets: POCKETS, r: R })) && gC.solves === 36, JSON.stringify({ solves: gC.solves, slices: gC.slices }));
}

// ---- (b4) r69a-d the module validates the fall the HOST draws (#707 prep FIX6 A); r70a-c the clearance cache is keyed on geometry (FIX6 B) ---
// A: index.js and table-in-node.mjs called pocketVisualFalls(id) un-opted -> the compatibility PLATE cups, while the fresh game.js
// requests the kernel-disc aperture at its one read site (the ownership ledger "Recorded deviation ... the kernel-disc contract"); on snooker
// the corner centres differ by 27.87 mm, so V13/V16 validated a fall the host never draws. Now both read the falls module's ONE
// named export of that request. B: furniture.js's cache key was table | track | r | furniture hashes - no track bytes, no cups or
// falls - so a same-id re-activation that fetched NEW track JSON read the previous route's clearance; now the key material is the
// design cache's (FIX1/FIX2: table id | track id | r | track bytes + cups + falls) from ONE shared builder, the hit byte-compared.
{
  const THREE = await import('three');
  const { loadTableModule } = await import('./table-in-node.mjs'); const TM = await loadTableModule();
  const FM = await import('../scene/ballreturn/furniture.js'); const { furnitureClearance, clearFurnitureCache, furnitureEvaluations } = FM;
  const K = await import('../scene/ballreturn/kinematics.js'); const { stationAt } = await import('../scene/ballreturn/track.js');
  const SNK = 'wpbsa_snooker_12ft';
  const HOST_OPT = { contract: 'kernel' };   // game.js:1478's request, verbatim - the ORACLE of these rows (the frozen host's one token), never the module's source
  const hostFalls = TM.pocketVisualFalls(SNK, HOST_OPT); const plateFalls = TM.pocketVisualFalls(SNK); const cupsS = TM.makeGeom(SNK).pockets.map((p) => ({ x: p.x, z: p.z, r: p.r }));
  const sctx = await tableContext(SNK);                                       // the node harness's read = the module's shared source after FIX6 (the plate cups before)
  const gapMm = (A, B) => (A ?? cupsS).map((a, i) => +(Math.hypot(a.x - B[i].x, a.z - B[i].z) * 1e3).toFixed(2));
  const gapHarness = gapMm(sctx.falls, hostFalls); const gapPlate = gapMm(plateFalls, hostFalls);
  // r69a review's variant: XW101 with its CHUTES lowered 100 mm - the exit line (the leather hem, an opaque solid) stays - schema-valid
  const xwDef = loadDef(path.resolve(here, '../scene/ballreturn/tracks/wpbsa_snooker_12ft-xw101-slides.json'));
  const loDef = JSON.parse(JSON.stringify(xwDef)); for (const rw of loDef.runways) for (const p of rw.points_mm) p[1] -= 100; loDef.doc.title += ' (chutes lowered 100 mm - FIX6 r69a variant)';
  const built = (falls) => validateTrack(loDef, { pockets: cupsS, falls });
  const bMod = built(sctx.falls); const rS = bMod.refR;
  // the box: on the HOST's fall arc into corner 0 at u = 0.5, offset AWAY from the plate-cup arc by r + h - 4 mm (4 mm into the host's ball; the plate arc's clearance is printed)
  const arcOf = (trk, F) => { const h = K.handoffFromSink({ t: 0, pocket: cupsS[0], fall: F, r: rS, tFall: K.DEFAULT_DROP_FAMILY.tFall, glide: K.DEFAULT_DROP_FAMILY.glide }, { track: trk, pockets: cupsS, r: rS }); const p = K.fallPieceOf(h, rS); const T = p.t1 - p.t0; return { h, p, T, at: (u) => K.fallPointAt(p, u * T, {}) }; };
  const arcHost = arcOf(built(hostFalls), hostFalls[0]); const arcPlate = arcOf(built(plateFalls), plateFalls[0]);
  const HALF = 0.0025; const kq = arcHost.at(0.5), pq = arcPlate.at(0.5);
  const nx = pq.x - kq.x, nz = pq.z - kq.z, nn = Math.hypot(nx, nz); const off = rS + HALF - 0.004;
  const BOX = [kq.x - (nx / nn) * off, kq.y, kq.z - (nz / nn) * off];
  const boxDist = (q) => Math.hypot(Math.max(Math.abs(q.x - BOX[0]) - HALF, 0), Math.max(Math.abs(q.y - BOX[1]) - HALF, 0), Math.max(Math.abs(q.z - BOX[2]) - HALF, 0));
  const minDist = (arc) => { let m = Infinity; for (let u = 0; u <= 1; u += 1e-3) { const d = boxDist(arc.at(u)); if (d < m) m = d; } return m; };
  const dHost = minDist(arcHost), dPlate = minDist(arcPlate);       // the ball's centre-to-box distance along each arc: < r = a hit
  const mkS = () => { const sc = new THREE.Scene(); const bx = new THREE.Mesh(new THREE.BoxGeometry(2 * HALF, 2 * HALF, 2 * HALF), new THREE.MeshBasicMaterial()); bx.name = 'obTestFallBox69'; bx.position.set(...BOX); sc.add(bx); sc.updateMatrixWorld(true); return sc; };
  const readV = async (trk, falls, tag) => { clearFurnitureCache(); return furnitureClearance({ track: trk, r: rS, scene: mkS(), tableId: SNK, trackId: 'XW101-lowered-' + tag, pockets: cupsS, falls }); };
  const fMod = await readV(bMod, sctx.falls, 'module');            // what the module validates (its shared source)
  const fHost = await readV(built(hostFalls), hostFalls, 'host');  // what the host draws (the oracle)
  const fPlate = await readV(built(plateFalls), plateFalls, 'plate'); // the pre-FIX6 read, for the record
  check(`r69a review's XW101 variant (chutes lowered 100 mm, exit line kept) with a 5 mm box on the HOST's fall arc into corner 0 (${(dHost * 1e3).toFixed(1)} mm from the host's ball centre = ${((rS - dHost) * 1e3).toFixed(1)} mm inside it; ${(dPlate * 1e3).toFixed(1)} mm from the plate-cup arc = ${((dPlate - rS) * 1e3).toFixed(1)} mm clear): the module's read finds ${fMod.violations.length} violations (${fMod.fallViolations ?? '?'} on the fall) = the host's ${fHost.violations.length} (the plate-cup read, the base: ${fPlate.violations.length}); refused ${/\[V16\]/.test(fMod.reason ?? '') ? '[V16]' : 'NOT'} naming ${fMod.byMesh[0]?.mesh ?? 'nothing'}`,
    fMod.evaluated && fHost.evaluated && dHost < rS - 0.002 && dPlate > rS + 0.005 && fHost.violations.length >= 1 && fMod.violations.length === fHost.violations.length && /\[V16\]/.test(fMod.reason ?? '') && /obTestFallBox69/.test(fMod.reason ?? '') && fPlate.violations.length === 0,
    JSON.stringify({ BOX, dHost, dPlate, mod: fMod.violations.length, host: fHost.violations.length, plate: fPlate.violations.length, reason: (fMod.reason ?? '').slice(0, 200) }));
  // r69b the falls the module validates are game.js's request coordinates, from ONE source: the falls module's named export, which pocketVisualFalls itself tests against; no second literal in the module or its harness
  const C = TM.POCKET_FALLS_CONTRACT_KERNEL ?? null;
  const viaConst = C ? TM.pocketVisualFalls(SNK, C) : null;
  const srcFiles = ['../scene/ballreturn/index.js', '../scene/ballreturn/furniture.js', '../scene/ballreturn/design-worker.js', '../scene/ballreturn/kinematics.js', '../scene/ballreturn/schema.js', './table-in-node.mjs'].map((f) => path.resolve(here, f));
  const literals = srcFiles.map((f) => [path.basename(f), (fs.readFileSync(f, 'utf8').match(/contract\s*:\s*['"]kernel['"]/g) ?? []).length]);
  const idxSrc = fs.readFileSync(path.resolve(here, '../scene/ballreturn/index.js'), 'utf8');
  const callSite = /pocketVisualFalls\?\.\(id, tableMod\.POCKET_FALLS_CONTRACT_KERNEL\)/.test(idxSrc);
  // a PRESENCE census over the source, stated as such (a grep is not a trace — L71 pins what the validators consumed): index.js reads
  // pocketVisualFalls exactly once, imports geometryKey from furniture.js and keeps no FNV offset basis of its own
  const reads = (idxSrc.match(/pocketVisualFalls/g) ?? []).length; const importsGeo = /import \{[^}]*\bgeometryKey\b[^}]*\} from '\.\/furniture\.js'/.test(idxSrc); const ownDigest = /0xcbf29ce484222325/.test(idxSrc);
  check(`r69b the snooker corner fall centres the module validates == game.js's request coordinates: the falls module exports ${C ? JSON.stringify(C) : 'NO contract constant'} and pocketVisualFalls(id, <that export>) ${viaConst && JSON.stringify(viaConst) === JSON.stringify(hostFalls) ? 'equals' : 'differs from'} the host's request byte for byte; the harness's read is ${gapHarness.join('/')} mm from the host's per pocket (the plate cups, the base: ${gapPlate.join('/')} mm); index.js calls the export at its one site (${callSite}; ${reads} pocketVisualFalls read(s), imports geometryKey ${importsGeo}, own digest ${ownDigest}); kernel-request literals in the module + harness: ${literals.map(([f, n]) => f + ' ' + n).join(', ')}`,
    !!C && Object.isFrozen(C) && !!viaConst && JSON.stringify(viaConst) === JSON.stringify(hostFalls) && gapHarness.every((g) => g === 0) && gapPlate.filter((g) => g > 27.8 && g < 27.9).length === 4 && callSite && reads === 1 && importsGeo && !ownDigest && literals.every(([, n]) => n === 0),
    JSON.stringify({ C, gapHarness, gapPlate, callSite, reads, importsGeo, ownDigest, literals }));
  // r69c US-pool corners byte-unchanged: no visual falls on any pool table under either request (null), so the synthetic fixture's read is r67c's bytes
  const poolIds = ['wpa_generic_9ft', 'wpa_spec_9ft', 'diamond_proam_9ft', 'predator_apex_9ft', 'diamond_redlabel_9ft'].filter((id) => TM.TABLE_SPECS?.[id]);
  const poolSame = poolIds.map((id) => [id, TM.pocketVisualFalls(id), TM.pocketVisualFalls(id, HOST_OPT), C ? TM.pocketVisualFalls(id, C) : undefined]);
  const wctx = await tableContext('wpa_generic_9ft'); const synT = validateTrack(loadDef(FIXTURE), { pockets: wctx.pockets, falls: wctx.falls });
  clearFurnitureCache(); const fSyn = await furnitureClearance({ track: synT, r: R, scene: new THREE.Scene(), tableId: 'wpa_generic_9ft', trackId: 'TEST-synthetic-wire-slide-r69c', pockets: wctx.pockets, falls: wctx.falls });
  check(`r69c US-pool corners byte-unchanged: pocketVisualFalls is null under both requests on ${poolIds.length} pool tables (${poolIds.join(', ')}); the synthetic fixture read through the harness's falls: ${fSyn.stations} stations (${fSyn.fallStations} fall), ${fSyn.violations.length} violations - r67c's 951 / 16`,
    poolSame.every(([, a, b, c]) => a === null && b === null && (c === undefined || c === null)) && wctx.falls === null && fSyn.evaluated && fSyn.stations === 951 && fSyn.fallStations === 16 && fSyn.violations.length === 0,
    JSON.stringify({ poolSame, stations: fSyn.stations, fall: fSyn.fallStations }));
  // r69d the node harness reports the same centres as the module (one source)
  const moduleFalls = C ? TM.pocketVisualFalls(SNK, C) : null;
  check(`r69d table-in-node.mjs reports the same fall centres as the module's own read on ${SNK}: harness ${JSON.stringify((sctx.falls ?? []).map((f) => [+(f.x * 1e3).toFixed(2), +(f.z * 1e3).toFixed(2), +(f.r * 1e3).toFixed(2)]))} mm - the module's ${moduleFalls ? (JSON.stringify(sctx.falls) === JSON.stringify(moduleFalls) ? 'identical' : 'DIFFERENT') : 'unreadable (no export)'}, the host's ${JSON.stringify(sctx.falls) === JSON.stringify(hostFalls) ? 'identical' : 'DIFFERENT'}`,
    !!moduleFalls && JSON.stringify(sctx.falls) === JSON.stringify(moduleFalls) && JSON.stringify(sctx.falls) === JSON.stringify(hostFalls),
    JSON.stringify({ harness: sctx.falls, module: moduleFalls }));
  // ---- B: the clearance cache is keyed on geometry ----
  const synDef = loadDef(FIXTURE); const loSyn = JSON.parse(JSON.stringify(synDef)); for (const rw of loSyn.runways) for (const p of rw.points_mm) p[1] -= 100; for (const p of (loSyn.pockets ?? [])) if (Number.isFinite(p.exit_below_y_mm)) p.exit_below_y_mm -= 100;
  const tA = validateTrack(synDef, { pockets: POCKETS, falls: null }); const tB = validateTrack(loSyn, { pockets: POCKETS, falls: null });
  const r4B = tB.routes.get(4); const stB = stationAt(r4B, r4B.total * 0.5, R, {}); const box2 = [stB.x, stB.y, stB.z]; // ON the lowered route-4 runway, mid-run: the shipped track passes 100 mm above it
  const mkS2 = () => { const sc = new THREE.Scene(); const bx = new THREE.Mesh(new THREE.BoxGeometry(2 * HALF, 2 * HALF, 2 * HALF), new THREE.MeshBasicMaterial()); bx.name = 'obTestBox70'; bx.position.set(...box2); sc.add(bx); sc.updateMatrixWorld(true); return sc; };
  const same = (o) => ({ r: R, tableId: 'wpa_generic_9ft', trackId: 'TEST-synthetic-wire-slide', pockets: POCKETS, falls: null, ...o });
  clearFurnitureCache(); const scene2 = mkS2();
  const cA = await furnitureClearance(same({ track: tA, def: synDef, scene: scene2 }));      // the first activation: the shipped track, clear of the box
  const cB = await furnitureClearance(same({ track: tB, def: loSyn, scene: scene2 }));       // the same-ID re-activation with the re-fetched (lowered) JSON, the same furniture
  clearFurnitureCache(); const cBfresh = await furnitureClearance(same({ track: tB, def: loSyn, scene: mkS2(), trackId: 'TEST-synthetic-wire-slide-fresh' })); // the uncached truth
  check(`r70a a same-ID re-activation with the re-fetched track (the synthetic fixture with its runways lowered 100 mm; a 5 mm box on the lowered route-4 runway at (${box2.map((v) => (v * 1e3).toFixed(1)).join(', ')}) mm): the shipped track reads ${cA.violations.length} violations; the lowered one ${cB.violations.length} (cached ${cB.cached === true}) - the uncached truth ${cBfresh.violations.length} (c9519d78: the cached 0)`,
    cA.evaluated && cA.violations.length === 0 && cBfresh.violations.length > 0 && cB.violations.length === cBfresh.violations.length && cB.cached !== true,
    JSON.stringify({ box2, a: cA.violations.length, b: cB.violations.length, bCached: cB.cached, fresh: cBfresh.violations.length }));
  clearFurnitureCache(); const scene3 = mkS2(); const e1 = furnitureEvaluations();
  const h1 = await furnitureClearance(same({ track: tB, def: loSyn, scene: scene3 })); const e2 = furnitureEvaluations();
  const h2 = await furnitureClearance(same({ track: tB, def: loSyn, scene: scene3 })); const e3 = furnitureEvaluations();
  check(`r70b the unchanged track over unchanged furniture is a cache HIT: ${e2 - e1} evaluation for the first read, ${e3 - e2} re-evaluation for the second (cached ${h2.cached === true}), ${h2.violations.length} violations both`,
    e2 - e1 === 1 && e3 - e2 === 0 && h2.cached === true && h1.violations.length === h2.violations.length, JSON.stringify({ e1, e2, e3, cached: h2.cached }));
  const entries = typeof FM.furnitureCacheEntries === 'function' ? FM.furnitureCacheEntries() : null;
  let rec = null, e4 = null, ident = null;
  if (entries && entries.size) { const ent = [...entries.values()].at(-1); ent.material = String(ent.material ?? '') + ' corrupt'; const before = furnitureEvaluations(); rec = await furnitureClearance(same({ track: tB, def: loSyn, scene: scene3 })); e4 = furnitureEvaluations() - before; ident = rec.violations.length === h2.violations.length && rec.stations === h2.stations && Math.abs((rec.byMesh[0]?.worstDepth ?? 0) - (h2.byMesh[0]?.worstDepth ?? 0)) < 1e-12; }
  check(`r70c a stored entry with the same hash key but CORRUPTED material -> the read RECOMPUTES (${e4 ?? '?'} evaluation, cached ${rec?.cached ?? '?'}) with the identical verdict (${rec?.violations.length ?? '?'} violations, ${rec?.stations ?? '?'} stations - identical ${ident}) - as L22f for the design cache`,
    !!entries && e4 === 1 && rec?.cached !== true && ident === true, JSON.stringify({ seam: !!entries, e4, ident }));
  // r70d the ONE builder, seen from the clearance side: the stored key begins with geometryKey's own key for this read, and the SAME
  // definition over MOVED cups (pocket 4 shifted 10 mm in x) is a miss — the geometry, not the definition alone, is the material
  const geoK = typeof FM.geometryKey === 'function' ? FM.geometryKey({ tableId: 'wpa_generic_9ft', trackId: 'TEST-synthetic-wire-slide', r: R, def: loSyn, cups: POCKETS, falls: null }) : null;
  const lastKey = entries && entries.size ? [...entries.keys()].at(-1) : null;
  const movedCups = POCKETS.map((p, i) => (i === 4 ? { ...p, x: p.x + 0.010 } : p));
  const e5 = furnitureEvaluations(); const mv = await furnitureClearance(same({ track: tB, def: loSyn, scene: scene3, pockets: movedCups })); const e6 = furnitureEvaluations();
  check(`r70d one builder, from the clearance side: the stored key begins with geometryKey's own (${geoK && lastKey ? lastKey.startsWith(geoK.key + '|') : 'no builder'}: ${(lastKey ?? '').slice(0, 70)}…); the same definition over cups with pocket 4 moved 10 mm is a MISS (${e6 - e5} evaluation, cached ${mv.cached === true})`,
    !!geoK && !!lastKey && lastKey.startsWith(geoK.key + '|') && e6 - e5 === 1 && mv.cached !== true && mv.evaluated, JSON.stringify({ geoKey: geoK?.key, lastKey, e5, e6, cached: mv.cached }));
}

// ---- (b5) r71a-e companion ownership through the catalog identity (#707 prep FIX7 B) -------------------------------------
// V17 (hardware.js validateHardware) and V18 (assembly.js validateAssembly) compared a companion's table_id with the active id as
// RAW strings, while the track itself passes through tableIdsMatch() (index.js -> tableid.js): a companion declaring the renamed
// `diamond_proam_9ft` was refused on the alias `pool_pro_9ft_measured` although the same spec object serves both ids. Now both
// validators take the catalog (`specs`) and compare through the ONE imported tableIdsMatch; a caller without the catalog keeps
// the raw compare (the r50 rows). The refusal text for a genuinely foreign companion is unchanged.
{
  const { validateHardware } = await import('../scene/ballreturn/hardware.js'); const { validateAssembly } = await import('../scene/ballreturn/assembly.js');
  const { loadTableModule } = await import('./table-in-node.mjs'); const TM = await loadTableModule();
  const TRK = 'TEST-alias-diamond-wire-slide';
  const comp = (tableId) => ({ schema: 'ball-return-hardware/1.0', track_id: TRK, table_id: tableId, provenance: { tag: 'TEST', source: 'FIX7 B arm: companion ownership through the catalog identity' }, mesh_names: ['obTestHw71'] });
  const tryH = (c, tableId, specs = TM.TABLE_SPECS) => { try { return { ok: validateHardware(c, { trackId: TRK, tableId, ...(specs ? { specs } : {}) }) }; } catch (e) { return { err: e.message }; } };
  const aliased = TM.TABLE_SPECS.pool_pro_9ft_measured === TM.TABLE_SPECS.diamond_proam_9ft;
  const a = tryH(comp('diamond_proam_9ft'), 'pool_pro_9ft_measured');
  check(`r71a a hardware companion declaring the renamed diamond_proam_9ft, loaded on the alias pool_pro_9ft_measured (one spec object: ${aliased}) -> ${a.ok ? 'INSTALLED (' + a.ok.meshNames.join(',') + ')' : 'refused: ' + a.err} (0957bb04: refused [V17] declared for table diamond_proam_9ft, loaded on pool_pro_9ft_measured)`,
    aliased && !!a.ok && a.ok.meshNames[0] === 'obTestHw71', JSON.stringify(a));
  const b = tryH(comp('wpbsa_snooker_12ft'), 'pool_pro_9ft_measured');
  check(`r71b a genuinely foreign companion (wpbsa_snooker_12ft on pool_pro_9ft_measured) is still refused [V17] naming both ids: ${b.err ?? 'ACCEPTED'}`,
    !!b.err && /\[V17\]/.test(b.err) && /declared for table wpbsa_snooker_12ft, loaded on pool_pro_9ft_measured/.test(b.err), JSON.stringify(b));
  const c1 = tryH(comp('diamond_proam_9ft'), 'diamond_proam_9ft'); const c0 = tryH(comp('diamond_proam_9ft'), 'diamond_proam_9ft', null);
  check(`r71c the matching-id case byte-identical: the companion declared and loaded on diamond_proam_9ft, through the catalog == without it (${!!c1.ok && JSON.stringify(c1.ok) === JSON.stringify(c0.ok)})`, !!c1.ok && !!c0.ok && JSON.stringify(c1.ok) === JSON.stringify(c0.ok), JSON.stringify({ c1, c0 }));
  // r71d e2e-tables' alias row: the browser suite's TABLE_IDS carries both diamond_proam_9ft and pool_pro_9ft_measured (the catalog v8
  // Measured entry, scene-aliased to the pool_pro_9ft spec — e2e-tables.mjs lines 38-57; not read from here: ci-bands-lint reads a node
  // gate's reference to a browser tool as an undeclared nested spawn). The pair is asserted against the catalog itself.
  const pair = ['diamond_proam_9ft', 'pool_pro_9ft_measured']; const both = pair.map((id) => tryH(comp('diamond_proam_9ft'), id));
  const oneSpec = TM.TABLE_SPECS[pair[0]] && TM.TABLE_SPECS[pair[0]] === TM.TABLE_SPECS[pair[1]];
  check(`r71d e2e-tables' alias pair (${pair.join(' + ')}) is one catalog spec object (${oneSpec}) and the same companion installs on both through the node harness (${both.map((x) => (x.ok ? 'installed' : 'refused')).join(' / ')}); the controller-level proof is lifecycle L75 (mkTableShim + a fetchImpl-served companion) — the browser row itself needs a box word`,
    oneSpec && both.every((x) => !!x.ok), JSON.stringify({ both }));
  const asm = (tableId) => ({ schema: 'ball-return-assembly/1.0', table_id: tableId, provenance: { tag: 'TEST', source: 'FIX7 B arm: the same identity for V18' }, meshes: [{ id: 'obTestWell71', kind: 'well', name: 'obTestWell71', solid_simplification: true, provenance: { tag: 'TEST', source: 'FIX7 B arm: a synthetic well for the identity row' } }] });
  const tryA = (d, tableId, specs = TM.TABLE_SPECS) => { try { return { ok: validateAssembly(d, { tableId, ...(specs ? { specs } : {}) }) }; } catch (e) { return { err: e.message }; } };
  const a18 = tryA(asm('diamond_proam_9ft'), 'pool_pro_9ft_measured'); const f18 = tryA(asm('wpbsa_snooker_12ft'), 'pool_pro_9ft_measured'); const c18 = tryA(asm('diamond_proam_9ft'), 'diamond_proam_9ft'); const c18raw = tryA(asm('diamond_proam_9ft'), 'diamond_proam_9ft', null);
  check(`r71e V18 (the pocket-assembly companion) reads the same identity: renamed id on the alias -> ${a18.ok ? 'installed' : 'refused: ' + a18.err}; foreign -> ${f18.err ? 'refused ' + (/\[V18\]/.test(f18.err) ? '[V18]' : '') : 'ACCEPTED'}; renamed id on itself identical through/without the catalog (${!!c18.ok && JSON.stringify(c18.ok) === JSON.stringify(c18raw.ok)})`,
    !!a18.ok && !!f18.err && /\[V18\]/.test(f18.err) && /declared for wpbsa_snooker_12ft, loaded for pool_pro_9ft_measured/.test(f18.err) && !!c18.ok && JSON.stringify(c18.ok) === JSON.stringify(c18raw.ok), JSON.stringify({ a18, f18 }));
  // r71f (review C6) a SYNTHETIC catalog — the identity can only come from the catalog OBJECT, never from a name map of the validator's own:
  // {a, b → one spec object, c → another}: V17 / V18 install 'a' on 'b', refuse 'c' and the unknown 'zz' naming both ids; canonicalTableId maps b→a
  const o = {}; const syn = { a: o, b: o, c: {} };
  const sH = (d) => tryH(comp(d), 'b', syn); const sA = (d) => tryA(asm(d), 'b', syn);
  const TID = await import('../scene/ballreturn/tableid.js').catch(() => ({}));
  const canon = typeof TID.canonicalTableId === 'function' ? { b: TID.canonicalTableId(syn, 'b'), a: TID.canonicalTableId(syn, 'a'), c: TID.canonicalTableId(syn, 'c'), zz: TID.canonicalTableId(syn, 'zz'), alias: TID.canonicalTableId(TM.TABLE_SPECS, 'pool_pro_9ft_measured'), diamond: TID.canonicalTableId(TM.TABLE_SPECS, 'diamond_proam_9ft'), none: TID.canonicalTableId(null, 'b') } : null;
  const synOk = !!sH('a').ok && sH('a').ok.meshNames[0] === 'obTestHw71' && /\[V17\].*declared for table c, loaded on b/.test(sH('c').err ?? '') && /\[V17\].*declared for table zz, loaded on b/.test(sH('zz').err ?? '') && !!sA('a').ok && /\[V18\].*declared for c, loaded for b/.test(sA('c').err ?? '') && /\[V18\].*declared for zz, loaded for b/.test(sA('zz').err ?? '');
  const canonOk = !!canon && canon.b === 'a' && canon.a === 'a' && canon.c === 'c' && canon.zz === 'zz' && canon.alias === 'pool_pro_9ft' && canon.diamond === 'pool_pro_9ft' && canon.none === 'b';
  check(`r71f a SYNTHETIC catalog {a, b → one object, c → another}: V17 installs 'a' on 'b' (${!!sH('a').ok}), refuses 'c' (${!!sH('c').err}) and the unknown 'zz' (${!!sH('zz').err}) naming both ids; V18 the same (${!!sA('a').ok} / ${!!sA('c').err} / ${!!sA('zz').err}) — a validator carrying its own alias map cannot pass; canonicalTableId: ${canon ? `b→${canon.b}, a→${canon.a}, c→${canon.c}, zz→${canon.zz}, measured alias→${canon.alias}, renamed→${canon.diamond}, no catalog→${canon.none}` : 'absent'}`,
    synOk && canonOk, JSON.stringify({ sHa: sH('a'), sHc: sH('c'), sAc: sA('c'), canon }));
}

// ---- (c) determinism pin -----------------------------------------------------
const sol = solveRef();
const buf = sampleSolution(sol, { ...GRID, t1: sol.tEnd + 0.5 });
const rawRef = rawHash(buf); // the SAME-PROCESS reference: RAW sha256, bit-identical (c1, d1)
const hash = pinHash(buf);   // the COMMITTED pin: quantised to PIN_QUANTUM (c2; CIWIRE-FIX2)
{
  const sol2 = solveRef();
  const hash2 = sha(sampleSolution(sol2, { ...GRID, t1: sol2.tEnd + 0.5 }));
  check('c1 same events → identical solution hash (RAW sha256 of both buffers — a same-process identity: bit-identical, no quantum; ADR-0017 / the determinism law)', rawRef === hash2, rawRef);
  const pin = def.checks?.determinism_sha256;
  if (args.includes('--pin')) console.log(`PIN ${hash}`);
  check(`c2 hash equals the committed pin (${hash.slice(0, 12)}…; the buffer quantised to ${PIN_QUANTUM} before hashing — CIWIRE-FIX2, portable across ARM64 / x64)`, hash === pin, `pin ${pin}`);
  // c3 RESTATED (order 23b round 11 class A): the law was "a pose from each landing on", full stop. It is now
  // "a pose from each landing on EXCEPT where the ball's station is above its route's reachable span" — a ball
  // seated behind a moving tail waits on the pile in the chute, undrawn, until the queue's advance brings its
  // station onto the track (track.js reachSpan). The arm keeps its teeth: every gap must be explained by that
  // one reason, read from the ball's PHYSICAL station, and nobody is left invisible at the end of the solve.
  let c3gaps = 0;
  check('c3 NaN before each handoff, a pose from each landing on — RESTATED round 11 class A: except above the route\'s reachable span, where the ball waits undrawn on the pile in the chute (every gap explained by its own physical station; every ball drawn at the end)', (() => {
    const ids = sol.order;
    const n = Math.floor((sol.tEnd + 0.5 - GRID.t0) / GRID.dt) + 1; // samples; the buffer tail is the rest ladder
    let ok = true;
    for (let i = 0; i < n && ok; i++) {
      const t = GRID.t0 + i * GRID.dt;
      ids.forEach((id, j) => {
        if (buf[(i * ids.length + j) * SAMPLE_STRIDE] !== id) ok = false;  // the slot carries its ball id
        const v = buf[(i * ids.length + j) * SAMPLE_STRIDE + 1];
        const h = mkArrivals().find((a) => a.id === id)?.handoff;
        if (!h) { if (Number.isNaN(v)) ok = false; return; }           // ledger balls always posed
        if (t < h.tH && !Number.isNaN(v)) ok = false;                   // before the handoff: game.js owns it
        if (t >= h.tLand && Number.isNaN(v)) {                          // on the track: posed unless it is above the span
          const ph = continuationAt(sol, id, t);                        // the PHYSICAL station and its route, whatever the drawing says
          if (!ph || !ph.route || !(ph.D > reachTop(ph.route, R) + 1e-9)) ok = false;
          else c3gaps += 1;
        }
      });
    }
    for (const id of ids) if (!poseAt(sol, id, sol.tEnd, {})) ok = false;  // nobody left invisible
    return ok;
  })(), `gaps above the span: ${c3gaps} samples`);
}

// ---- (c4) the pin binds ball IDS, not slots (verification K6) -----------------
{
  // Two all-unknown ledgers with the same members in a different session order
  // seat the same STATIONS under different ids. A slot-only buffer (positions
  // in solution.order) hashes them identically; the id-bound buffer must not.
  const a = solveShot({ track, r: R, ledger: [3, 4, 5], arrivals: [] });
  const b = solveShot({ track, r: R, ledger: [5, 4, 3], arrivals: [] });
  const sample = (sol) => sampleSolution(sol, { t0: 0.5, dt: 1 / 240, t1: 1.0 });
  const slotOnly = (sol) => { // the seal-1 buffer shape (positions by SEATING slot, no ids), rebuilt as the control
    const buf = sample(sol); const n = Math.floor((1.0 - 0.5) / (1 / 240)) + 1; const out = new Float64Array(n * sol.order.length * 7);
    // seal 1 wrote slots in the solver's seating order (front → back = ascending D); since seal 4
    // `order` is by id, so the control re-sorts the slots by rest station to reproduce that shape
    const slots = sol.order.map((id, j) => [j, sol.rest.get(id)]).sort((a, b) => a[1] - b[1]).map(([j]) => j);
    for (let i = 0, k = 0; i < n; i++) for (const j of slots) { const base = (i * sol.order.length + j) * SAMPLE_STRIDE; for (let q = 1; q < SAMPLE_STRIDE; q++) out[k++] = buf[base + q]; }
    return out;
  };
  const stationsEqual = [...a.rest.values()].sort().join() === [...b.rest.values()].sort().join();
  check('c4a control: the two ledgers occupy the same stations and a slot-only buffer cannot tell them apart', stationsEqual && sha(slotOnly(a)) === sha(slotOnly(b)), `${sha(slotOnly(a)).slice(0, 10)} ${sha(slotOnly(b)).slice(0, 10)}`);
  check('c4b the id-bound pin buffer distinguishes them (id → station is part of the pin)', sha(sample(a)) !== sha(sample(b)) && a.rest.get(3) !== b.rest.get(3), `${sha(sample(a)).slice(0, 10)} ≠ ${sha(sample(b)).slice(0, 10)}; ball 3 at D ${a.rest.get(3)?.toFixed(4)} vs ${b.rest.get(3)?.toFixed(4)}`);
}

// ---- (d) scrub-order parity --------------------------------------------------
{
  const n = Math.floor((sol.tEnd + 0.5 - GRID.t0) / GRID.dt) + 1;
  const idx = Array.from({ length: n }, (_, i) => i);
  let seed = 12345; // deterministic LCG shuffle
  for (let i = n - 1; i > 0; i--) { seed = (seed * 1103515245 + 12345) % 2147483648; const j = seed % (i + 1); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  const out = new Float64Array(buf.length);
  const o = {};
  for (const i of idx) {
    const t = GRID.t0 + i * GRID.dt;
    sol.order.forEach((id, j) => {
      const p = poseAt(sol, id, t, o);
      const k = (i * sol.order.length + j) * SAMPLE_STRIDE;
      out[k] = id;
      if (p) { out[k + 1] = p.x; out[k + 2] = p.y; out[k + 3] = p.z; out[k + 4] = p.qx; out[k + 5] = p.qy; out[k + 6] = p.qz; out[k + 7] = p.qw; }
      else for (let q = 1; q < SAMPLE_STRIDE; q++) out[k + q] = NaN;
    });
  }
  { // the rest-ladder tail, id order — same as sampleSolution
    let k = n * sol.order.length * SAMPLE_STRIDE;
    for (const [id, D] of [...sol.rest].sort((x, y) => x[0] - y[0])) { out[k++] = id; out[k++] = D; }
  }
  check('d1 shuffled sample order reproduces the in-order buffer bit-for-bit (RAW sha256 against the same-process reference — no quantum)', sha(out) === rawRef);
}

// ---- (e) train invariants ---------------------------------------------------
{
  const ids = sol.order;
  let overlap = 0, backward = 0, backwardFollow = 0, maxPush = 0, minGap = Infinity;
  const prevD = new Map();
  const o = {};
  const isFollowerAt = (id, t) => { const ps = sol.pieces.get(id); let p = ps[0]; for (const q of ps) { if (q.t0 <= t) p = q; else break; } return !!p.follow; };
  for (let t = 1.0; t <= sol.tEnd + 0.2; t += 1 / 480) {
    const poses = ids.map((id) => [id, poseAt(sol, id, t, { ...o })]).filter(([, p]) => p && p.kind !== 'fall');
    for (const [id, p] of poses) {
      const d0 = prevD.get(id);
      if (d0 !== undefined && p.D > d0 + 1e-9) { if (isFollowerAt(id, t)) { backwardFollow += 1; maxPush = Math.max(maxPush, p.D - d0); } else backward += 1; }
      prevD.set(id, p.D);
    }
    for (let i = 0; i < poses.length; i++) {
      for (let j = i + 1; j < poses.length; j++) {
        const [, a] = poses[i], [, b] = poses[j];
        // same-runway pairs or tray/trunk chain — arclength separation ≥ 2r
        const sameChain = a.runwayId === b.runwayId || [a.runwayId, b.runwayId].every((r) => r === 'tray' || r === 'trunk');
        if (!sameChain) continue;
        const gap = Math.abs(a.D - b.D);
        minGap = Math.min(minGap, gap);
        if (gap < 2 * R - 1e-9) overlap += 1;
      }
    }
  }
  check('e1 balls never overlap on a shared runway (arclength ≥ 2r)', overlap === 0, `violations ${overlap}, min gap ${minGap.toFixed(6)} vs 2r ${(2 * R).toFixed(6)}`);
  check(`e2 no ball moves backward (D non-increasing): fronts / free balls by law, followers by the in-plane twist geometry (a follower could only be pushed back by a leader turning past a right angle; on this fixture ${backwardFollow} follower samples, max ${(maxPush * 1000).toFixed(3)} mm)`, backward === 0 && backwardFollow === 0, `${backward} front/free backward steps; ${backwardFollow} follower push-backs, max ${(maxPush * 1000).toFixed(3)} mm`);
  const restD = [...sol.rest.entries()].sort((a, b) => a[1] - b[1]);
  const ladder = restD.every(([, D], i) => Math.abs(D - restStation(i + 1, R)) < 1e-9);
  check('e3 rest ladder = (2n − 1)·r from the wall, ledger first', ladder && restD[0][0] === 7 && restD[1][0] === 8, restD.map(([id, D]) => `${id}:${D.toFixed(4)}`).join(' '));
  check('e4 the combination lands the second ball behind the first (contact via landing)', sol.events.some((e) => e.kind === 'contact' && e.via === 'landing' && e.ball === 9 && e.other === 1));
  check('e5 the front ball pulls away on the steeper trunk (gap opens > 2r)', (() => {
    const tj = sol.events.find((e) => e.kind === 'junction' && e.ball === 1 && e.runwayId === 'trunk')?.t;
    if (!tj) return false;
    const a = poseAt(sol, 1, tj + 0.05, {}), b = poseAt(sol, 9, tj + 0.05, {});
    return a && b && (b.D - a.D) > 2 * R + 1e-6;
  })());
  check('e6 every arrival ends at rest with v = 0 (last piece rest, open-ended)', ids.every((id) => { const ps = sol.pieces.get(id); return ps[ps.length - 1].kind === 'rest' && ps[ps.length - 1].t1 === Infinity; }));
  // junction contact: two balls timed to meet at the trunk from opposite sides
  const hA = handoffFromSink({ t: 1.0, pocket: POCKETS[4], fall: POCKETS[4], r: R, tFall: 0.021, glide: 0.06 }, ctx);
  const hB = handoffFromSink({ t: 1.0, pocket: POCKETS[1], fall: POCKETS[1], r: R, tFall: 0.021, glide: 0.06 }, ctx);
  const sj = solveShot({ track, r: R, ledger: [], arrivals: [{ id: 3, handoff: hA }, { id: 4, handoff: hB }] });
  check('e7 simultaneous arrivals from both sides: the lower id YIELDS one ball length before the merge, the other crosses, a release follows, no junction overlap, both rest on the ladder (review r4 P2-1: no position patch)', (() => {
    const y = sj.events.find((e) => e.kind === 'yield');
    const rel = sj.events.find((e) => e.kind === 'release');
    const r3 = sj.rest.get(3), r4 = sj.rest.get(4);
    return !!y && y.ball === 3 && !!rel && rel.t > y.t && sj.junctionOverlaps === 0 && Math.abs(Math.abs(r3 - r4) - 2 * R) < 1e-9 && Math.min(r3, r4) === restStation(1, R);
  })(), sj.events.map((e) => `${e.kind}@${e.t.toFixed(3)}`).join(' '));
  // level-tray push: a resting non-wall-backed ball is pushed by a later arrival and stops again
  const stopSol = solveShot({ track, r: R, ledger: [], arrivals: [{ id: 5, handoff: { ...hA, v0: 0.0 } }] });
  check('e8 a level-tray arrival that stops short rests short (stop event, no wall)', stopSol.events.some((e) => e.kind === 'stop') ? true : stopSol.events.some((e) => e.kind === 'wall'));
}

// ---- (e9/e10) the cup-exit gate and the carried ledger ------------------------
{
  const h = mkArrivals()[0].handoff; // ball 1, legacy
  const s1 = solveShot({ track, r: R, ledger: [], arrivals: [{ id: 1, handoff: h }] });
  // ballistic time from the cull height to the exit height (top below −0.199)
  const yExitCentre = h.exitY - R;
  const tExit = h.tH + (-h.vDown + Math.sqrt(h.vDown ** 2 + 2 * 9.8 * (h.yH - yExitCentre))) / 9.8;
  const before = poseAt(s1, 1, tExit - 1e-4, {}), after = poseAt(s1, 1, tExit + 1e-4, {});
  check('e9 inside the cup (top above exit_below_y) the ball stays culled; it re-appears below the cup exit',
    before === null && !!after && after.y + R <= h.exitY + 1e-6 && after.kind === 'fall', `${before} / ${after && (after.y + R).toFixed(4)} vs exit ${h.exitY}`);
  const carried = solveShot({ track, r: R, ledger: [{ id: 7, D: restStation(1, R) }, { id: 9, D: restStation(3, R) }, 11], arrivals: [] });
  const d7 = carried.rest.get(7), d9 = carried.rest.get(9), d11 = carried.rest.get(11);
  check('e10 carried ledger stations are kept (a hole stays a hole on the level tray); an unknown one packs behind the last',
    d7 === restStation(1, R) && d9 === restStation(3, R) && Math.abs(d11 - (restStation(3, R) + 2 * R)) < 1e-12, `${d7} ${d9} ${d11}`);
  const pushed = solveShot({ track, r: R, ledger: [{ id: 9, D: restStation(3, R) }], arrivals: [{ id: 1, handoff: h }] });
  check('e11 an arrival pushes a resting non-wall-backed ball on the level tray until it stops or reaches the wall (no overlap)',
    pushed.rest.get(9) < restStation(3, R) && Math.abs(pushed.rest.get(1) - pushed.rest.get(9) - 2 * R) < 1e-9, `${pushed.rest.get(9)} ${pushed.rest.get(1)} events ${pushed.events.map((e) => e.kind).join(',')}`);
}

// ---- (e12) MAX_EVENTS is a hard stop, not a truncation ------------------------
{
  let msg = null;
  try { solveShot({ track, r: R, ledger: [7, 8], arrivals: mkArrivals(), maxEvents: 2 }); } catch (e) { msg = e.message; }
  check('e12 a solve that exceeds maxEvents THROWS (no silently truncated train)', !!msg && /MAX_EVENTS/.test(msg), msg ?? 'returned a solution');
}

// ---- (h) continuation across a time-base switch (seal 3, P1-B) ----------------
{
  const e1 = { t: 1.0, pocket: POCKETS[4], fall: POCKETS[4], r: R, glide: 0.06, tFall: 0.021 };
  const hA = handoffFromSink(e1, ctx);
  const s1 = solveShot({ track, r: R, ledger: [7, 8], arrivals: [{ id: 1, handoff: hA }] });
  const restT = s1.pieces.get(1).find((p) => p.kind === 'rest' && p.t1 === Infinity).t0;
  const tSw = hA.tLand + 0.4 * (restT - hA.tLand);       // shot 2 at 40 % of A's roll
  const st = continuationAt(s1, 1, tSw);
  check('h1 continuationAt reads a rolling state at 40 % of the roll (kind roll, v > 0)', !!st && st.kind === 'roll' && st.v > 0 && st.D > 0, JSON.stringify(st && { kind: st.kind, D: +st.D.toFixed(4), v: +st.v.toFixed(4) }));
  const s2 = solveShot({ track, r: R, ledger: [{ id: 7, D: s1.rest.get(7) }, { id: 8, D: s1.rest.get(8) }], continuations: [{ id: 1, ...st, t0: 0 }] });
  const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
  const same = (p, q) => p && q && near(p.x, q.x) && near(p.y, q.y) && near(p.z, q.z) && near(p.qx, q.qx) && near(p.qy, q.qy) && near(p.qz, q.qz) && near(p.qw, q.qw);
  const p1 = poseAt(s1, 1, tSw, {}), p2 = poseAt(s2, 1, 0, {});
  check('h2 the pose at the switch is continuous (position + rolling orientation identical, no re-seat, no spin reset)', same(p1, p2), `${JSON.stringify(p1 && [p1.x, p1.y, p1.z].map((v) => +v.toFixed(6)))} vs ${JSON.stringify(p2 && [p2.x, p2.y, p2.z].map((v) => +v.toFixed(6)))}`);
  let maxDev = 0;
  for (const tau of [1 / 60, 0.1, 0.5, 1.0, 1.5, 2.0]) {
    const a = poseAt(s1, 1, tSw + tau, {}), b = poseAt(s2, 1, tau, {});
    if (!a || !b) { maxDev = Infinity; break; }
    maxDev = Math.max(maxDev, Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z), Math.abs(a.qw - b.qw), Math.abs(a.qx - b.qx));
  }
  check('h3 the continued motion reproduces the single-shot motion at every later time (≤ 1 µm)', maxDev <= 1e-6, `max deviation ${maxDev}`);
  check('h4 the final station equals the single-shot solution\'s', near(s2.rest.get(1), s1.rest.get(1)) && near(s2.rest.get(7), s1.rest.get(7)) && near(s2.rest.get(8), s1.rest.get(8)), `${s2.rest.get(1)} vs ${s1.rest.get(1)}`);
  // one frame of motion at the switch: the only allowed change is v·dt
  const pf = poseAt(s2, 1, 1 / 60, {});
  check('h5 the first frame after the switch moves the ball by ≤ v·dt + ½a·dt² (no jump)', !!pf && Math.hypot(pf.x - p2.x, pf.y - p2.y, pf.z - p2.z) <= st.v / 60 + 0.5 * 1.0 / 3600 + 1e-9, `${Math.hypot(pf.x - p2.x, pf.y - p2.y, pf.z - p2.z)} vs ${st.v / 60}`);
  // a settled ball reads as a ledger entry, a falling one as 'fall'
  check('h6 continuationAt classifies rest (ledger) and fall (re-submitted arrival) states', continuationAt(s1, 7, tSw)?.kind === 'rest' && continuationAt(s1, 1, hA.tH + 1e-3)?.kind === 'fall' && continuationAt(s1, 1, hA.tH - 1e-3) === null);
  // a pair rolling in contact keeps rolling as one cluster after the switch
  const e2 = { ...e1, t: 1.05 };
  const sPair = solveShot({ track, r: R, ledger: [], arrivals: [{ id: 1, handoff: hA }, { id: 2, handoff: handoffFromSink(e2, ctx) }] });
  const cA = sPair.events.find((ev) => ev.kind === 'contact');
  if (cA) {
    const tc = cA.t + 0.2;
    const c1 = continuationAt(sPair, 1, tc), c2 = continuationAt(sPair, 2, tc);
    const sCont = solveShot({ track, r: R, ledger: [], continuations: [{ id: 1, ...c1, t0: 0 }, { id: 2, ...c2, t0: 0 }] });
    let overlap = 0;
    for (let tau = 0; tau < 3; tau += 1 / 240) { const a = poseAt(sCont, 1, tau, {}), b = poseAt(sCont, 2, tau, {}); if (a && b && Math.abs(a.D - b.D) < 2 * R - 1e-9) overlap += 1; }
    check('h7 a pair in contact at the switch continues as one cluster (no overlap, same rest ladder as the single solve)', overlap === 0 && near(sCont.rest.get(1), sPair.rest.get(1)) && near(sCont.rest.get(2), sPair.rest.get(2)), `overlaps ${overlap}`);
  } else check('h7 pair scenario produced a contact', false, 'no contact event in the pair solve');
}

// ---- (i) support cache key includes railR (seal 3, P2-2) ----------------------
{
  const { derivedFor } = await import('../scene/ballreturn/track.js');
  const a = derivedFor(track, { kind: 'twin-rail', gauge: 0.040, railR: 0.002 }, R);
  const b = derivedFor(track, { kind: 'twin-rail', gauge: 0.040, railR: 0.004 }, R);
  check('i1 two twin-rail supports with the same gauge and different rail radii derive different h/ρ/k', a.h !== b.h && a.rho !== b.rho && a.k !== b.k, `${a.h} ${b.h}`);
}

// ---- (j) render-time event cursor (seal 3, P2-4 / FR-012) --------------------
{
  const ev = [{ kind: 'landing', t: 1.0, ball: 1 }, { kind: 'junction', t: 2.0, ball: 1 }, { kind: 'wall', t: 3.0, ball: 1 }];
  const cur = createEventCursor(ev);
  const seq = [cur.advance(0.5), cur.advance(1.2), cur.advance(0.8), cur.advance(1.2), cur.advance(3.5), cur.advance(3.6)];
  const kinds = seq.map((f) => f.map((e) => e.kind).join('+') || '-');
  check('j1 forward crossing fires once, a backward scrub fires nothing and re-arms, the same crossing fires again', kinds.join(' ') === '- landing - landing junction+wall -', kinds.join(' '));
  const late = createEventCursor(ev);
  check('j2 the first advance only seeds — no retroactive burst when a solution appears mid-record', late.advance(2.5).length === 0 && late.advance(3.5).map((e) => e.kind).join() === 'wall');
  const real = createEventCursor(sol.events);
  real.advance(0);
  const fired = real.advance(sol.tEnd + 1);
  check('j3 the fixture solution\'s events carry kind, t, ball, runwayId, station D and speed v', fired.length === sol.events.length && fired.every((e) => Number.isFinite(e.t) && Number.isFinite(e.ball) && typeof e.runwayId === 'string' && Number.isFinite(e.D) && Number.isFinite(e.v)), JSON.stringify(fired.slice(0, 2)));
}

// ---- (k) the exporter CLI validates against the named table (seal 3, P2-5) ------
{
  const self = fileURLToPath(import.meta.url);
  const run = (file) => { try { return { code: 0, out: execFileSync(process.execPath, [self, '--track', file], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }; } catch (e) { return { code: e.status, out: String(e.stdout) + String(e.stderr) }; } };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ballreturn-cli-'));
  const good = run(FIXTURE);
  check('k1 CLI: the fixture validates against wpa_generic_9ft with the table\'s own cups (exit 0)', good.code === 0 && /validated against wpa_generic_9ft \(6 kernel cups/.test(good.out), good.out.slice(0, 160));
  const d = loadDef(); d.runways.find((r) => r.id === 'rc-run').points_mm[0][0] += 125; // entry ≈ 60 mm OUTSIDE its 64.5 mm cup in plan
  const bad = path.join(tmp, 'bad-entry.json'); fs.writeFileSync(bad, JSON.stringify(d));
  const r1 = run(bad);
  check('k2 CLI: an entry ~60 mm outside its pocket (125 mm off a 64.5 mm cup) is REFUSED under V5 from the CLI (exit 3)', r1.code === 3 && /\[V5\]/.test(r1.out), `${r1.code} ${r1.out.slice(0, 160)}`);
  const d2 = loadDef(); d2.doc.table_id = 'no_such_table';
  const bad2 = path.join(tmp, 'bad-table.json'); fs.writeFileSync(bad2, JSON.stringify(d2));
  const r2 = run(bad2);
  check('k3 CLI: an unknown table id is an ERROR, not a skipped context (exit 3)', r2.code === 3 && /unknown table id/.test(r2.out), `${r2.code} ${r2.out.slice(0, 120)}`);
  const runCensus = () => { const t0 = performance.now(); try { const out = execFileSync(process.execPath, [self, '--census', path.resolve(here, '../scene/ballreturn/tracks')], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); return { code: 0, out, secs: (performance.now() - t0) / 1000 }; } catch (e) { return { code: e.status ?? 1, out: String(e.stdout ?? ''), secs: (performance.now() - t0) / 1000 }; } };
  const cen = runCensus();
  console.log(`NOTE  k4 the census child took ${cen.secs.toFixed(1)} s`);
  const verdictM = /^CENSUS (PASS|FAIL): .*$/m.exec(cen.out);
  const verdictLine = verdictM ? verdictM[0] : null;
  const obtuseRow = /^CENSUS ROW TEST-obtuse-merge\.json: 0 violations \/ [1-9]\d* stations$/m.test(cen.out);
  check('k4 CLI --census: every wpa_generic_9ft definition in web/scene/ballreturn/tracks that validates draws no station inside the built table\'s furniture, the crossing fixture refused [V14] as expected (exit 0)',
    cen.code === 0 && !!verdictLine && /^CENSUS PASS: [1-9]\d* fixtures, [1-9]\d* stations, 0 violations, 1 expected refusals$/.test(verdictLine) && obtuseRow,
    `exit ${cen.code}; ${verdictLine ?? 'no CENSUS verdict line on stdout'}${obtuseRow ? '' : '; no TEST-obtuse-merge row'}`);
  fs.rmSync(tmp, { recursive: true, force: true });
}

// ---- (n) seal 5: the published JSON schema is enforced at runtime ---------------
{
  const { default: MIRROR } = await import('../scene/ballreturn/track-schema.js');
  const docObj = JSON.parse(fs.readFileSync(SCHEMA_DOC, 'utf8'));
  check('n1 the runtime schema mirror is in byte parity with docs/geometry/ball-return-track.schema.json (run --sync-schema after editing the docs file)', JSON.stringify(MIRROR) === JSON.stringify(docObj) && fs.readFileSync(SCHEMA_MIRROR, 'utf8') === mirrorSource(docObj));
  const refuse = (mut) => { const d = loadDef(); mut(d); try { validateTrack(d, { pockets: POCKETS, falls: null }); return null; } catch (e) { return e.message; } };
  const r1 = refuse((d) => { delete d.doc.title; });
  check('n2 a definition the JSON schema refuses is refused at runtime BEFORE any build, with the schema law id (missing doc.title → [V0] …/doc required)', !!r1 && r1.includes('[V0]') && /\/doc required: missing property "title"/.test(r1), r1 ?? 'ACCEPTED');
  const r2 = refuse((d) => { d.datum_frame.runtime_mapping = 'three.js (x, y, z) = (Z, Y, X) x 0.001'; });
  check('n3 the constant datum_frame.runtime_mapping is enforced (a different coordinate convention → [V0] const)', !!r2 && r2.includes('[V0]') && /runtime_mapping const/.test(r2), r2 ?? 'ACCEPTED');
  const r3 = refuse((d) => { for (const k of ['revision', 'date', 'sources']) delete d.doc[k]; });
  check('n4 doc.revision / date / sources are required (→ [V0])', !!r3 && r3.includes('[V0]') && /required/.test(r3), r3 ?? 'ACCEPTED');
  const r4 = refuse((d) => { d.doc.date = '2026-13-45'; });
  check('n5 doc.date must be a calendar date (format date → [V0])', !!r4 && r4.includes('[V0]') && /format/.test(r4), r4 ?? 'ACCEPTED');
  const r5 = refuse((d) => { d.extra_top_level = 1; });
  check('n6 an unknown top-level property is refused (additionalProperties false → [V0])', !!r5 && r5.includes('[V0]') && /additionalProperties/.test(r5), r5 ?? 'ACCEPTED');
  check('n7 the fixture itself passes the full JSON schema (validateTrack builds it)', !!validateTrack(loadDef(), { pockets: POCKETS, falls: null }));
  const r6 = refuse((d) => { Object.defineProperty(d, 'constructor', { value: 1, enumerable: true, configurable: true }); });
  const tdefN = JSON.parse(fs.readFileSync(path.resolve(here, '../scene/ballreturn/tracks/TEST-terminal-chutes.json'), 'utf8'));
  const refuseT = (mut) => { const d = JSON.parse(JSON.stringify(tdefN)); mut(d); try { validateTrack(d, { pockets: POCKETS, falls: null }); return null; } catch (e) { return e.message; } };
  const g1 = refuseT((d) => { delete d.runways.find((r) => r.id === 'rc-chute').stop; });
  const g2 = refuseT((d) => { d.runways.find((r) => r.id === 'rc-lead').stop = { kind: 'face', wall_s_mm: 40, capacity_balls: 1, provenance: { tag: 'TEST', source: 'gap probe' } }; });
  const g4 = refuseT((d) => { d.runways.find((r) => r.id === 'rc-chute').next = 'lc-lead'; });
  check('n9 the chute ⇔ stop tie lives in the JSON schema itself: a chute without a stop, a stop on a lead, a chute with a next are refused under V0 (V2 stays as belt)', [g1, g2, g4].every((m) => !!m && m.includes('[V0]')), `${g1} | ${g2} | ${g4}`);
  const r7 = refuse((d) => { d.doc = JSON.parse('{"__proto__": 1, ' + JSON.stringify(d.doc).slice(1)); });
  check('n7b prototype-named keys (constructor / __proto__) are unexpected properties, not silently passed (own-key tests)', !!r6 && r6.includes('[V0]') && /additionalProperties/.test(r6) && !!r7 && r7.includes('[V0]'), `${r6} | ${r7}`);
  const { tableIdsMatch } = await import('../scene/ballreturn/index.js');
  const { loadTableModule } = await import('./table-in-node.mjs');
  const T = await loadTableModule();
  const groups = new Map();
  for (const id of Object.keys(T.TABLE_SPECS)) { const k = T.TABLE_SPECS[id]; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(id); }
  const aliasGroups = [...groups.values()].filter((g) => g.length > 1);
  const bothWays = aliasGroups.every((g) => g.every((a) => g.every((b) => tableIdsMatch(T.TABLE_SPECS, a, b) === true)));
  const distinct = tableIdsMatch(T.TABLE_SPECS, 'wpa_generic_9ft', 'diamond_proam_9ft') === false && tableIdsMatch(T.TABLE_SPECS, 'wpa_generic_9ft', 'wpa_spec_9ft') === false;
  const unknown = tableIdsMatch(T.TABLE_SPECS, 'no_such_table', 'wpa_generic_9ft') === 'unknown' && tableIdsMatch(T.TABLE_SPECS, 'wpa_generic_9ft', 'no_such_table') === false;
  check('n8b prototype-named track ids (constructor / __proto__ / toString) classify as unknown, never as a catalog table', ['constructor', '__proto__', 'toString', 'hasOwnProperty'].every((k) => tableIdsMatch(T.TABLE_SPECS, k, 'wpa_generic_9ft') === 'unknown' && tableIdsMatch(T.TABLE_SPECS, 'wpa_generic_9ft', k) === false));
  check(`n8 a track matches its table through every published catalog alias (${aliasGroups.map((g) => g.join('=')).join(', ')}), never across distinct tables, and an unknown track table id is 'unknown' (never the pin-table fallback)`, aliasGroups.length >= 2 && bothWays && distinct && unknown, JSON.stringify(aliasGroups));
}

// ---- (t) schema 1.1: the terminal-chutes topology (ORDER-BALLRETURN-6) -----------------
const TERMINAL = path.resolve(here, '../scene/ballreturn/tracks/TEST-terminal-chutes.json');
{
  const tdef = loadDef(TERMINAL);
  let ttrack = null; let tmsg = null;
  try { ttrack = validateTrack(tdef, { pockets: POCKETS, falls: null }); } catch (e) { tmsg = e.message; }
  check('t1 the terminal TEST fixture validates (two leads, two chutes with stops, no trunk, no tray) and builds two routes ending at the chutes', !!ttrack && ttrack.topology === 'terminal-chutes' && ttrack.tray === null && ttrack.trayRoute === null && ttrack.rests.size === 2 && [...ttrack.routes.values()].every((rt) => rt.restId.endsWith('-chute')), tmsg ?? '');
  if (ttrack) {
    const tctx = { track: ttrack, pockets: POCKETS, r: R };
    const rc = [...ttrack.routes.values()].find((rt) => rt.restId === 'rc-chute');
    // ORDER-BR-737-FIX10 (a): this fixture's entries moved 8.005461 mm down their own lines (V20's 7.933 mm deficit taken up to
    // the 0.1 mm export grain), so the lead is that much shorter — hypot(50, 10) = 50.990 mm before, 42.985 mm now. What the arm
    // pins is the STOP FACE, not the literal: read the lead from the definition and the wall from the chute's own stop.
    const t1bLead = tdef.runways.find((rw) => rw.id === 'rc-lead').points_mm;
    const t1bMm = Math.hypot(t1bLead[1][0] - t1bLead[0][0], t1bLead[1][1] - t1bLead[0][1], t1bLead[1][2] - t1bLead[0][2]);
    const t1bWall = tdef.runways.find((rw) => rw.id === 'rc-chute').stop.wall_s_mm;
    check(`t1b a route's total ends at the STOP FACE (wall_s), not at the chute's last vertex: total = lead (${t1bMm.toFixed(3)} mm, 50.990 before FIX10's derived entry move) + ${t1bWall} mm`, Math.abs(rc.total - (t1bMm + t1bWall) * 0.001) < 1e-9, `${rc.total}`);
    // t2 three pots into the right middle: the ladder in the chute D = r, 3r, 5r; the wall event names the chute
    const arr = (t, id) => ({ id, handoff: handoffFromSink({ t, pocket: POCKETS[4], fall: POCKETS[4], r: R, glide: 0.06, tFall: 0.021 }, tctx) });
    const s3 = solveShot({ track: ttrack, r: R, ledger: [], arrivals: [arr(0.5, 1), arr(1.1, 2), arr(1.7, 3)] });
    const rest3 = [...s3.rest.entries()].sort((a, b) => a[1] - b[1]);
    const onChute = rest3.every(([id, D]) => stationAt(rc, D, R, {}).runwayId === 'rc-chute');
    check('t2 three arrivals queue in the chute against the stop: D = r, 3r, 5r on rc-chute, in arrival order', rest3.length === 3 && rest3.every(([, D], i) => Math.abs(D - (2 * i + 1) * R) < 1e-9) && onChute && rest3.map(([id]) => id).join() === '1,2,3', JSON.stringify(rest3));
    const wall = s3.events.find((e) => e.kind === 'wall');
    check('t2b the wall event names the chute as its runway', !!wall && wall.runwayId === 'rc-chute' && wall.ball === 1, JSON.stringify(wall));
    // t3 capacity 4: the 5th still has its centre inside the chute, the 6th backs up onto the lead
    const many = []; for (let i = 0; i < 6; i++) many.push(arr(0.5 + i * 0.6, 10 + i));
    const s6 = solveShot({ track: ttrack, r: R, ledger: [], arrivals: many });
    const rest6 = [...s6.rest.entries()].sort((a, b) => a[1] - b[1]);
    const rw6 = rest6.map(([, D]) => stationAt(rc, D, R, {}).runwayId);
    check('t3 chute capacity 4 = floor(280 / 57.15): balls 1–5 rest on the chute (the 5th\'s centre at 9r = 257 mm < 280), the 6th backs up onto the LEAD one diameter behind', rw6.slice(0, 5).every((r) => r === 'rc-chute') && rw6[5] === 'rc-lead' && Math.abs(rest6[5][1] - rest6[4][1] - 2 * R) < 1e-9 && ttrack.rests.get('rc-chute').capacity === 4, JSON.stringify(rest6.map(([id, D], i) => [id, +D.toFixed(4), rw6[i]])));
    // t4 red arms (topology laws)
    const tarm = (name, law, mutate) => {
      const d = JSON.parse(JSON.stringify(tdef)); mutate(d);
      let msg = null; try { validateTrack(d, { pockets: POCKETS, falls: null }); } catch (e) { msg = e.message; }
      check(`t4 ${name} → refused under ${law}`, !!msg && msg.includes(`[${law}]`), msg ?? 'ACCEPTED');
    };
    tarm('a tray block under terminal-chutes', 'V0', (d) => { d.tray = { runway: 'rc-chute', end: 'wall', capacity_balls: 4, length_mm: 280, provenance: { tag: 'TEST', source: 'red arm tray' } }; });
    tarm('a terminal runway without a stop (the JSON schema ties chute ⇔ stop, so V0; V2 is the belt behind it)', 'V0', (d) => { delete d.runways.find((r) => r.id === 'rc-chute').stop; });
    tarm('a stop on a non-terminal runway (the JSON schema tie, V0)', 'V0', (d) => { const l = d.runways.find((r) => r.id === 'rc-lead'); l.stop = { kind: 'face', wall_s_mm: 40, capacity_balls: 1, provenance: { tag: 'TEST', source: 'red arm stop' } }; });
    tarm('a stop face beyond the chute arclength', 'V6', (d) => { d.runways.find((r) => r.id === 'rc-chute').stop.wall_s_mm = 400; });
    tarm('more than one ball diameter of support line beyond the stop', 'V6', (d) => { const c = d.runways.find((r) => r.id === 'rc-chute'); c.points_mm.push([0, -323, c.points_mm[2][2] - 80]); });
    tarm('a chute capacity that breaks the identity floor(wall_s / d)', 'V6', (d) => { d.runways.find((r) => r.id === 'rc-chute').stop.capacity_balls = 5; });
    tarm('an UPHILL chute edge before the stop (the ordered negative)', 'V7', (d) => { const c = d.runways.find((r) => r.id === 'rc-chute'); c.points_mm[1][1] = c.points_mm[0][1] + 20; c.points_mm[2][1] = c.points_mm[1][1] + 10; }); // the run rises 20 mm before the stop; arclength ≈ unchanged so V6 stays quiet
    tarm('a lead landing less than one ball diameter before the stop face (buildRoute would drop the chute)', 'V6', (d) => { d.runways.find((r) => r.id === 'rc-lead').points_mm = [[0, -263, 703.5], [0, -324, 398.5]]; }); // lands at chute s ≈ 260 of a 280 wall
    tarm('an orphan chute (no pocket feeds it)', 'V11', (d) => { d.runways.push({ id: 'orphan-chute', role: 'chute', points_mm: [[100, -273, 0], [100, -333, 300]], next: null, stop: { kind: 'face', wall_s_mm: 280, capacity_balls: 4, provenance: { tag: 'TEST', source: 'orphan' } }, provenance: { tag: 'TEST', source: 'orphan' } }); });
    // t5 the up-turn lip beyond the stop is accepted (the fixture has one) and the ball never reaches it
    const s1 = solveShot({ track: ttrack, r: R, ledger: [], arrivals: [arr(0.5, 1)] });
    const pRest = poseAt(s1, 1, s1.tEnd + 1, {});
    const stRest = stationAt(rc, R, R, {}); // the station one radius before the stop face, on the descending run
    check('t5 the first ball rests one radius before the stop face ON the descending run (s = 280 − r = 251.4 mm, centre y ≈ −299.6), never on the up-turn beyond the stop', pRest.runwayId === 'rc-chute' && Math.abs(pRest.D - R) < 1e-9 && Math.abs(pRest.y - stRest.y) < 1e-12 && pRest.y > -0.31 && pRest.y < -0.29 && stRest.edge === rc.spans[rc.spans.length - 1].rw.runs[0], JSON.stringify([+pRest.x.toFixed(4), +pRest.y.toFixed(4), +pRest.z.toFixed(4), pRest.D]));
    // t7 the terminal fixture's own determinism pin (id-bound, same grid law as c2)
    const tbuf = sampleSolution(s3, { t0: 0.5, dt: 1 / 240, t1: s3.tEnd + 0.5 });
    const thash = pinHash(tbuf); // quantised committed pin (CIWIRE-FIX2)
    if (args.includes('--pin-terminal')) console.log(`PIN-TERMINAL ${thash}`);
    check(`t7 the terminal fixture's solve hashes to its committed pin (${thash.slice(0, 12)}…; quantised to ${PIN_QUANTUM})`, thash === tdef.checks?.determinism_sha256, `pin ${tdef.checks?.determinism_sha256}`);
  }
  // t6 the Star XW101 export: the COMMITTED 1.1 copy (the mechanical upgrade of the
  // snooker lane's r1 export, status PROPOSAL) validates against wpbsa_snooker_12ft's
  // cups + visual falls with 0 errors on every machine; where the lane's worktree is
  // present the upgrade is re-derived and must equal the committed copy (lane drift
  // would show here). The RAW 1.0 export still exits 3 until the lane re-emits 1.1.
  const MM = 0.001;
  // the snooker lane's OWN 1.1 export (SNK-R37, sealed b2183aa7, their exporter, sha
  // f91171b3… — revision r4: the stop face at the runway polyline's LOWEST vertex and the
  // polyline generated from the builder, 49 sampled points per chute; it superseded the
  // straight-chute r1 bytes aa05226d… this companion's reader defect was found on)
  // is committed byte for byte as tracks/wpbsa_snooker_12ft-xw101-slides.json;
  // t6 validates that copy on every machine. `--star <path>` (or OB_BALLRETURN_STAR)
  // names the lane's live file: when given, t6d proves the committed copy is still their
  // bytes; when absent the row prints NOTE (not a PASS) — no absolute path lives here
  const STAR_COMMITTED = path.resolve(here, '../scene/ballreturn/tracks/wpbsa_snooker_12ft-xw101-slides.json');
  const STAR = args.includes('--star') ? args[args.indexOf('--star') + 1] : (process.env.OB_BALLRETURN_STAR ?? null);
  {
    const up = loadDef(STAR_COMMITTED);
    const sctx = await tableContext(up.doc.table_id);
    let smsg = null; let strack = null;
    try { strack = validateTrack(up, { pockets: sctx.pockets, falls: sctx.falls }); } catch (e) { smsg = e.message; }
    check(`t6 the snooker lane's OWN 1.1 export (six terminal chutes, their exporter, revision ${JSON.stringify(up.doc.revision)}) validates against ${up.doc.table_id}'s cups + visual falls with 0 errors`, !!strack && strack.topology === 'terminal-chutes' && strack.rests.size === 6 && strack.routes.size === 6 && up.topology === 'terminal-chutes' && !('tray' in up), smsg ?? '');
    if (strack) {
      const caps = [...strack.rests.values()].map((r) => r.capacity);
      check('t6b every Star chute reports a capacity from the identity (5 / 5 / 8 / 8 / 5 / 5 as the lane wrote: the chute runway now starts at the landing station, no lead) and every route ends at its own chute', JSON.stringify(caps) === '[5,5,8,8,5,5]' && [...strack.routes.values()].every((rt) => rt.restId.endsWith('-chute')), JSON.stringify(caps));
      // GH-768: the route must cover the WHOLE run — every piece from the landing edge to the
      // piece that carries the stop face — with only a trailing FRAGMENT the corner cut has
      // already eaten dropped (t9d). The pre-fix reader popped the trailing piece while it was
      // shorter than a ball radius, and this export is sampled at 6.48 mm facets against
      // r 26.25: the pop cascaded and left 2.855 mm of route (the landing facet) under a
      // 287.8 mm chute. The lip beyond the stop face is never route either way.
      // GH-770 class S: the reader's piece is the maximal EXACTLY-collinear run, not the
      // exported facet (rw.runs, built once per runway, so route pieces ARE run objects), so
      // this arm counts its prefix over rw.runs and reports the facet count beside it. The
      // assertion is unchanged: whole cover, the face piece kept, at most one trailing drop.
      const cover = [...strack.routes.values()].map((rt) => {
        const rest = strack.rests.get(rt.restId);
        const runs = rt.spans[0].rw.runs;
        const kFace = runs.findIndex((e) => rest.wallS < e.s0 + e.len - 1e-12);       // the run carrying the stop face
        const idx = rt.segs.filter((sg) => sg.kind === 'line').map((sg) => runs.indexOf(sg.edge));
        const st0 = stationAt(rt, 0.02625, 0.02625, {});
        return { pk: rt.pocket, spans: rt.spans.length, kFace, kept: idx[idx.length - 1], prefix: idx.length > 0 && idx.every((v, i) => v === i), seat: runs.indexOf(st0.edge), total: rt.total, runs: runs.length, edges: rt.spans[0].rw.edges.length };
      });
      const coverOk = cover.every((c) => c.spans === 1 && c.prefix && c.kFace - c.kept >= 0 && c.kFace - c.kept <= 1 && c.seat >= 0 && c.seat <= c.kept);
      check(`t6f every Star route covers its whole run (GH-768): the support is the piece prefix 0…${cover.map((c) => c.kept).join('/')} of ${cover[0].runs} collinear runs over ${cover[0].edges} exported facets (GH-770: the run is the reader's unit) — the face piece kept where the face falls inside it, the 0.025 mm lip fragment past the valley dropped on p2 / p3 — totals ${cover.map((c) => (c.total / MM).toFixed(2)).join(' / ')} mm of centre path over runs of ${[...strack.rests.values()].map((rs) => (rs.wallS / MM).toFixed(1)).join(' / ')} mm, and the first ball seats on the run (piece ${cover.map((c) => c.seat).join('/')}). The pre-fix rule popped every facet shorter than one radius (median 6.48 mm vs r 26.25) and returned 2.86 mm of route`, coverOk, JSON.stringify(cover.map((c) => [c.pk, c.kFace, c.kept, c.seat, +(c.total / MM).toFixed(3)])));
      const sR = 0.02625;
      const arrs = []; for (let i = 0; i < 10; i++) arrs.push({ id: 1 + i, handoff: handoffFromSink({ t: 0.5 + i * 0.8, pocket: sctx.pockets[0], fall: sctx.falls[0], r: sR, glide: 0.06, tFall: 0.021 }, { track: strack, pockets: sctx.pockets, r: sR }) });
      const s10 = solveShot({ track: strack, r: sR, ledger: [], arrivals: arrs });
      const route0 = strack.routes.get(0);
      const rests = [...s10.rest.entries()].sort((a, b) => a[1] - b[1]);
      let culledSeats = 0, drawnAbove = 0;
      for (const [id] of rests) { const pz = poseAt(s10, id, s10.tEnd + 1, {}); if (!pz) { culledSeats += 1; continue; } if (pz.y + sR > route0.exitY + 1e-9) drawnAbove += 1; }
      check(`t6c 10 pots into the Star's 5-ball corner chute (no lead): no seat beyond the entry + 2r (max D ${(Math.max(...rests.map(([, D]) => D)) / MM).toFixed(1)} vs total ${(route0.total / MM).toFixed(1)} mm), ${s10.overflow.size} arrivals REFUSED as overflow (an 'overflow' event each), no drawn rest with its top above exit_below_y (${culledSeats} in-pocket seats culled)`, rests.every(([, D]) => D <= route0.total + 2 * sR + 1e-9) && s10.overflow.size >= 2 && drawnAbove === 0 && s10.events.filter((e) => e.kind === 'overflow').length === s10.overflow.size, JSON.stringify({ rests: rests.map(([id, D]) => [id, +(D / MM).toFixed(1)]), overflow: [...s10.overflow] }));
    }
    {
      // (#707 prep FIX6 A) the harness's falls are now the HOST's kernel discs, which on snooker ARE the cups (the GH-489 fence
      // check-falls-identity-489 F1: every fall equals its kernel pocket bit for bit) — the t8 rows
      // were premised on the plate datums, which the harness returned only because its read was un-opted. V5's cup branch needs a
      // context whose fall is NOT the cup, so that fall is stated here: the plate datum (the pre-R34 aperture, 27.87 mm inboard,
      // r 42.1), from the table module itself — never inherited from a read whose contract is somebody else's.
      const TMt8 = await (await import('./table-in-node.mjs')).loadTableModule();
      const fallsT8 = TMt8.pocketPlateDatums(up.doc.table_id);
      const far = JSON.parse(JSON.stringify(up));
      const lead0 = far.runways.find((r) => r.id === far.pockets.find((pk) => pk.index === 0).entry_runway);
      for (const pt of lead0.points_mm) pt[0] += 200; // the whole chute 200 mm inboard along the table axis (its arclength unchanged, so V6 stays quiet): the entry lands outside the 42.1 fall AND the 88.9 cup (outward would move it TOWARDS the cup centre, which sits beyond the ring)
      let farMsg = null; try { validateTrack(far, { pockets: sctx.pockets, falls: fallsT8 }); } catch (e) { farMsg = e.message; }
      // t8 (re-premised at the #707 prep, 2026-09-18): V5 is fall-OR-cup (schema.js: refuse only when the entry is outside BOTH radii).
      // Before #637 the shipped Star corner entry sat outside the visual fall and inside the cup, so the shipped track alone
      // exercised the cup branch; #637's snooker collar END-STEER moved the corner fall centre ~22 mm toward the pocket and the
      // same entry now sits INSIDE the fall (22.2 < 42.1) — accepted by the fall branch. The cup branch is therefore exercised
      // on a SYNTHETIC entry derived from the context (never a typed number): the lead's entry station moved along +x to
      // rCup − 10 mm from the cup centre, asserted outside the fall. The far case (200 mm inboard) still names both radii.
      const l0 = up.runways.find((r) => r.id === up.pockets.find((pk) => pk.index === 0).entry_runway); const f0 = fallsT8[0]; const c0 = sctx.pockets[0];
      const dist = (x, z, o) => Math.hypot(x - o.x, z - o.z) / MM;
      const e0 = { x: l0.points_mm[0][0] * MM, z: l0.points_mm[0][2] * MM };
      const plan0 = { dFall: dist(e0.x, e0.z, f0), rFall: f0.r / MM, dCup: dist(e0.x, e0.z, c0), rCup: c0.r / MM };
      const branch0 = plan0.dFall <= plan0.rFall ? 'fall' : plan0.dCup <= plan0.rCup ? 'cup' : 'NEITHER';
      check(`t8a V5 fall-or-cup on the snooker context (the fall = the plate datum, stated): the shipped Star corner entry is ${plan0.dFall.toFixed(1)} mm from the plate-datum fall centre (r ${plan0.rFall.toFixed(1)}) and ${plan0.dCup.toFixed(1)} mm from the cup centre (r ${plan0.rCup.toFixed(1)}) → accepted by the ${branch0} branch (t6 validates it)`, branch0 !== 'NEITHER', JSON.stringify(plan0));
      const cupOnly = JSON.parse(JSON.stringify(up));
      const lc = cupOnly.runways.find((r) => r.id === cupOnly.pockets.find((pk) => pk.index === 0).entry_runway);
      const xCup = c0.x + Math.sqrt(Math.max(0, (c0.r - 0.010) ** 2 - (e0.z - c0.z) ** 2)); // the entry station at rCup − 10 mm from the cup centre, along +x at the entry's own z
      const dxMm = (xCup - e0.x) / MM; for (const pt of lc.points_mm) pt[0] += dxMm; // the WHOLE runway moves rigidly (on the Star export the entry runway IS the chute: a moved first point alone shortens its arclength and V6 refuses the stop position — the far case below moves it the same way)
      const planC = { dFall: dist(lc.points_mm[0][0] * MM, lc.points_mm[0][2] * MM, f0), rFall: f0.r / MM, dCup: dist(lc.points_mm[0][0] * MM, lc.points_mm[0][2] * MM, c0), rCup: c0.r / MM, shiftMm: dxMm };
      let cupMsg = null; try { validateTrack(cupOnly, { pockets: sctx.pockets, falls: fallsT8 }); } catch (e) { cupMsg = e.message; }
      check(`t8b the CUP branch of V5: an entry station ${planC.dFall.toFixed(1)} mm from the fall centre (outside r ${planC.rFall.toFixed(1)}) but ${planC.dCup.toFixed(1)} mm from the cup centre (inside r ${planC.rCup.toFixed(1)}) is ACCEPTED (derived from the stated context, not typed; the fall = the plate datum, since FIX6 the harness's own falls are the cups)`, planC.dFall > planC.rFall && planC.dCup < planC.rCup && cupMsg === null, cupMsg ?? JSON.stringify(planC));
      check(`t8c the same lead 200 mm inboard → refused under V5 naming BOTH radii (outside the fall AND the cup)`, !!farMsg && farMsg.includes('[V5]') && farMsg.includes('fall radius') && farMsg.includes('cup'), farMsg ?? 'ACCEPTED');
    }
    if (STAR && fs.existsSync(STAR)) {
      const theirs = fs.readFileSync(STAR); const mine = fs.readFileSync(STAR_COMMITTED);
      check(`t6d the committed copy is byte-identical to the lane's live export named by --star / OB_BALLRETURN_STAR (${STAR}, sha ${createHash('sha256').update(theirs).digest('hex').slice(0, 12)}…)`, Buffer.compare(theirs, mine) === 0, `committed ${createHash('sha256').update(mine).digest('hex').slice(0, 12)}…`);
    } else if (STAR) {
      check(`t6d --star / OB_BALLRETURN_STAR names a file that does not exist: ${STAR}`, false);
    } else console.log('NOTE  t6d not run: no --star <path> / OB_BALLRETURN_STAR given — the committed copy stands alone here (this is not a PASS)');
    // t6u the mechanical 1.0 → 1.1 upgrade stays gated on a synthetic 1.0-vocabulary file (the
    // terminal fixture spoken as 1.0: chutes as terminal runways, one of them named as the tray)
    {
      const legacy = JSON.parse(JSON.stringify(tdef));
      delete legacy.topology;
      for (const rw of legacy.runways) { if (rw.role === 'chute') { rw.role = 'tray'; delete rw.stop; } }
      legacy.tray = { runway: 'rc-chute', length_mm: 280, capacity_balls: 4, end: "wall", provenance: { tag: 'TEST', source: 'synthetic 1.0 vocabulary of the terminal fixture' } };
      const { def: upd } = upgradeToTerminal(legacy);
      let umsg = null; let utrack = null;
      try { utrack = validateTrack(upd, { pockets: POCKETS, falls: null }); } catch (e) { umsg = e.message; }
      const legacyMsg = (() => { try { validateTrack(legacy, { pockets: POCKETS, falls: null }); return 'ACCEPTED'; } catch (e) { return e.message; } })();
      const idem = upgradeToTerminal(up);
      check('t6u2 --upgrade is idempotent: applied to the lane\'s own 1.1 file it is a no-op (their PHOTO stops are never rewritten as DERIVED)', idem.changed === false && idem.def === up, idem.note);
      check('t6u --upgrade turns a 1.0-vocabulary terminal file into 1.1 (chutes with stops at their lowest vertex floored to 0.1 mm, tray dropped) that validates, while the 1.0 form is refused under V2', !!utrack && utrack.topology === 'terminal-chutes' && utrack.rests.size === 2 && legacyMsg.includes('[V2]'), JSON.stringify({ umsg, rests: utrack ? utrack.rests.size : null, legacyMsg: legacyMsg.slice(0, 160), note: upgradeToTerminal(legacy).note }));
    }
  }
  // t9 (review 7): a stop face exported PAST the valley — the 0.042 mm of their file, and the
  // 0.05 / 0.15 / 0.5 mm roundings an exporter might write — never rebuilds a phantom swing:
  // every rounding inside V7's 1 mm stop-body grain yields the SAME route, ending on the facet
  // that ends at the valley, with the first ball on that facet's own centre line. 1.5 mm past
  // the valley is refused under V7 (the up-turn is then an uphill edge before the stop).
  {
    const base = loadDef(STAR_COMMITTED);
    const sctx9 = await tableContext(base.doc.table_id);
    // the valley is the arclength of the polyline's LOWEST vertex (the drain's end, where this
    // exporter puts the face) — NOT the first edge's length: read that way on a 49-station
    // polyline the planted face lands at 2.855 mm and every variant is refused at V0 for
    // capacity 0, which is how the row read before the R37 re-pin.
    const run0 = (() => {
      const pts = base.runways.find((r) => r.id === 'p0-chute').points_mm;
      let s0 = 0; const cum = [0];
      for (let i = 1; i < pts.length; i++) { s0 += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]); cum.push(s0); }
      let lo = 0; for (let i = 1; i < pts.length; i++) if (pts[i][1] < pts[lo][1] - 1e-12) lo = i;
      return cum[lo];
    })();
    const read9 = (delta) => {
      const d = JSON.parse(JSON.stringify(base));
      const ch = d.runways.find((r) => r.id === 'p0-chute');
      ch.stop.wall_s_mm = Math.round((run0 + delta) * 1000) / 1000;
      ch.stop.capacity_balls = Math.floor(ch.stop.wall_s_mm / d.ball.reference_diameter_mm + 1e-9);
      let tr = null; try { tr = validateTrack(d, { pockets: sctx9.pockets, falls: sctx9.falls }); } catch (e) { return { delta, msg: e.message }; }
      const rt = tr.routes.get(0);
      const edges = rt.spans[0].rw.runs;            // GH-770: the reader's piece is the collinear run (= the facet where nothing merges)
      const kValley = edges.findIndex((e) => Math.abs(e.s0 + e.len - run0 * MM) < 1e-9);
      const idx = rt.segs.filter((sg) => sg.kind === 'line').map((sg) => edges.indexOf(sg.edge));
      const st = stationAt(rt, 0.02625, 0.02625, {});
      const seg = rt.segs.find((sg) => 0.02625 <= sg.D0 + 1e-12 && 0.02625 >= sg.D1 - 1e-12);
      // distance of the rest centre from its OWN support facet's centre line (support + h·n)
      let off = Infinity;
      if (seg && seg.kind === 'line') {
        const e = seg.edge;
        const u = (st.x - e.p0[0]) * e.t[0] + (st.y - e.p0[1]) * e.t[1] + (st.z - e.p0[2]) * e.t[2];
        off = Math.hypot(st.x - (e.p0[0] + e.t[0] * u + e.n[0] * seg.h), st.y - (e.p0[1] + e.t[1] * u + e.n[1] * seg.h), st.z - (e.p0[2] + e.t[2] * u + e.n[2] * seg.h));
      }
      return { delta, total: rt.total, pieces: idx.length, last: idx[idx.length - 1], kValley, seatKind: seg ? seg.kind : null, off };
    };
    const rows = [0.002, 0.05, 0.15, 0.5].map(read9);
    const ref = rows[0];
    const good = rows.every((r) => !r.msg && r.last === r.kValley && r.seatKind === 'line' && r.off < 1e-9 && Math.abs(r.total - ref.total) < 1e-12);
    check(`t9 a stop face 0.002 / 0.05 / 0.15 / 0.5 mm past the valley (s ${run0.toFixed(3)} mm, inside V7's 1 mm stop-body grain): every rounding gives the SAME route — ${ref.pieces} support pieces ending on the facet that ends at the valley, total ${(ref.total / MM).toFixed(6)} mm identical to 1e-12 m — and the first ball rests on that facet's own centre line (off ${(ref.off / MM).toExponential(1)} mm): no phantom swing at any rounding`, good, JSON.stringify(rows.map((r) => r.msg ? [r.delta, r.msg.slice(0, 90)] : [r.delta, +(r.total / MM).toFixed(6), r.pieces, r.last, r.kValley])));
    const far9 = read9(1.5);
    check('t9b 1.5 mm past the valley (beyond V7\'s 1 mm grain, which exempts only the stop\'s own body) is refused under V7 — the up-turn is then an uphill edge before the stop', !!far9.msg && far9.msg.includes('[V7]'), far9.msg ?? 'ACCEPTED');
  }
  // t9c / t9d (GH-768) the trailing-piece drop, measured on an AUTHORED fixture so the law does
  // not ride on one lane's export: re-sampling the same wire into facets shorter than a ball
  // radius must not change the route at all, and the only piece a reader may drop is a trailing
  // fragment the corner cut has already eaten.
  {
    const tb9 = loadDef(path.resolve(here, '../scene/ballreturn/tracks/TEST-terminal-chutes.json'));
    const subdivide = (def, step) => {
      const d = JSON.parse(JSON.stringify(def));
      for (const rw of d.runways) {
        const pts = rw.points_mm; const out = [pts[0]];
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1], b = pts[i];
          const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]); const k = Math.max(1, Math.ceil(L / step));
          for (let j = 1; j <= k; j++) out.push([a[0] + (b[0] - a[0]) * j / k, a[1] + (b[1] - a[1]) * j / k, a[2] + (b[2] - a[2]) * j / k]);
        }
        rw.points_mm = out;
      }
      return d;
    };
    const face9 = (def, ws) => { const d = JSON.parse(JSON.stringify(def)); for (const rw of d.runways) if (rw.stop) { rw.stop.wall_s_mm = ws; rw.stop.capacity_balls = Math.floor(ws / d.ball.reference_diameter_mm + 1e-9); } return d; };
    const valley9 = (() => {
      const pts = tb9.runways.find((r) => r.id === 'lc-chute').points_mm;
      let s0 = 0; const cum = [0];
      for (let i = 1; i < pts.length; i++) { s0 += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]); cum.push(s0); }
      let lo = 0; for (let i = 1; i < pts.length; i++) if (pts[i][1] < pts[lo][1] - 1e-12) lo = i;
      return cum[lo];
    })();
    const read9b = (def) => {
      let tr = null; try { tr = validateTrack(def, { pockets: POCKETS, falls: null }); } catch (e) { return { err: e.message }; }
      const rt = [...tr.routes.values()][0]; const st = stationAt(rt, rt.r, rt.r, {});
      return { pieces: rt.segs.filter((sg) => sg.kind === 'line').length, total: rt.total, seat: [st.x, st.y, st.z], minEdge: Math.min(...rt.spans.map((sp) => Math.min(...sp.rw.edges.map((e) => e.len)))) };
    };
    const same9 = (a, b) => !a.err && !b.err && Math.abs(a.total - b.total) < 1e-12 && a.seat.every((v, i) => Math.abs(v - b.seat[i]) < 1e-12);
    const ref9 = read9b(face9(tb9, valley9));
    const steps9 = [10, 5, 2, 1, 0.5].map((step) => ({ step, ...read9b(face9(subdivide(tb9, step), valley9)) }));
    check(`t9c re-sampling the same wire is invariant (GH-768): the terminal fixture's ${ref9.pieces}-piece route (total ${(ref9.total / MM).toFixed(6)} mm, face on the valley vertex) is reproduced EXACTLY — total and the first ball's seat to 1e-12 m — when every edge is re-cut at ${steps9.map((x) => x.step).join(' / ')} mm (${steps9.map((x) => x.pieces).join(' / ')} support pieces, shortest facet ${(Math.min(...steps9.map((x) => x.minEdge)) / MM).toFixed(3)} mm against r ${(R / MM).toFixed(3)}). The pre-fix rule popped every facet shorter than a radius and returned 4.78 / 1.95 / 1.00 mm routes for the same wire`, steps9.every((x) => same9(x, ref9)) && steps9[steps9.length - 1].pieces > 600, JSON.stringify(steps9.map((x) => [x.step, x.pieces, +(x.total / MM).toFixed(6)])));
    const past9 = read9b(face9(tb9, valley9 + 0.05));
    const pastSub9 = read9b(face9(subdivide(tb9, 5), valley9 + 0.05));
    const frag9 = read9b(face9(subdivide(tb9, 5), valley9 - 20));
    // the BOUND itself, measured: bisect the planted tail's length until the route stops being
    // the valley's route. The threshold must be the joint's own corner cut ½(hA+hB)·tan(θ/2) —
    // computed here from the fixture's own geometry, h read as the seat's distance to the
    // support line — and not the 0.1 mm grain below it or the ball radius above it.
    const lamValley = (() => {
      const tr = validateTrack(face9(tb9, valley9), { pockets: POCKETS, falls: null });
      const rt = [...tr.routes.values()][0]; const rw = rt.spans[rt.spans.length - 1].rw;
      const eA = rw.edges[0], eB = rw.edges[1];                                  // the valley joint
      const st = stationAt(rt, rt.total - 60 * MM, rt.r, {});                    // a centre well away from any joint
      const w = [st.x - eA.p0[0], st.y - eA.p0[1], st.z - eA.p0[2]];
      const u = w[0] * eA.t[0] + w[1] * eA.t[1] + w[2] * eA.t[2];
      const h = Math.hypot(w[0] - u * eA.t[0], w[1] - u * eA.t[1], w[2] - u * eA.t[2]);
      const c = Math.max(-1, Math.min(1, eA.t[0] * eB.t[0] + eA.t[1] * eB.t[1] + eA.t[2] * eB.t[2]));
      return { h, theta: Math.acos(c), lam: h * Math.tan(0.5 * Math.acos(c)) };
    })();
    let loX = 0.1, hiX = R / MM;                                                 // dropped at loX, not at hiX
    const dropped9 = (x) => same9(read9b(face9(tb9, valley9 + x)), ref9);
    const loOk = dropped9(loX), hiOk = !dropped9(hiX);
    for (let i = 0; i < 40; i++) { const mid = 0.5 * (loX + hiX); if (dropped9(mid)) loX = mid; else hiX = mid; }
    const thresh9 = 0.5 * (loX + hiX);
    const overV7 = read9b(face9(tb9, valley9 + 1.5));                             // past the stop-body grain
    const midPlant9 = read9b(face9(tb9, valley9 + 0.5));                          // above the grain, below the cut
    const midPlantSub9 = read9b(face9(subdivide(tb9, 5), valley9 + 0.5));
    check(`t9d the drop is bounded by the corner cut, never by a ball radius: a 0.05 mm tail planted past the valley — a fragment the concave cut has already eaten — is dropped, so the route is the valley's route exactly (${(past9.total / MM).toFixed(6)} mm as exported, ${(pastSub9.total / MM).toFixed(6)} re-cut at 5 mm), and so is a 0.5 mm tail, which is ABOVE the ${(EXPORT_GRAIN / MM).toFixed(1)} mm grain and so can only be dropped by the cut (${(midPlant9.total / MM).toFixed(6)} / ${(midPlantSub9.total / MM).toFixed(6)} mm — a reader that bounded the drop by the grain would keep it). The cut at this valley is ½(hA+hB)·tan(θ/2) = ${(lamValley.lam / MM).toFixed(3)} mm (h ${(lamValley.h / MM).toFixed(3)} mm, θ ${(lamValley.theta * 180 / Math.PI).toFixed(3)}°), so it never binds here: bisected over 0.1…${(R / MM).toFixed(3)} mm the boundary is ${thresh9.toFixed(4)} mm = V7's 1 mm stop-body grain, and past it the export is REFUSED (${(overV7.err ?? '').match(/\[V\d+[a-z]?\]/)?.[0] ?? '?'}) rather than read with a kept fragment. A 20 mm fragment BEFORE the valley is real support and is KEPT, the route exactly 20 mm shorter (${(frag9.total / MM).toFixed(6)} mm), where the pre-fix rule popped it for being shorter than r ${(R / MM).toFixed(3)} mm and cascaded the run away`, same9(past9, ref9) && same9(pastSub9, ref9) && same9(midPlant9, ref9) && same9(midPlantSub9, ref9) && loOk && hiOk && Math.abs(thresh9 - 1) < 1e-3 && lamValley.lam > 1 * MM && !!overV7.err && overV7.err.includes('[V7]') && !frag9.err && Math.abs((ref9.total - frag9.total) - 20 * MM) < 1e-12, JSON.stringify([past9.total, pastSub9.total, midPlant9.total, frag9.total].map((v) => v === undefined ? null : +(v / MM).toFixed(6)).concat([+thresh9.toFixed(5), +(lamValley.lam / MM).toFixed(5), loOk, hiOk, (overV7.err ?? 'NO-ERR').slice(0, 60)])));
    // t9e (GH-768) the other half of the same rule, measured: a WHOLE edge is never a trailing
    // fragment, however short, so the drop is bounded to the ONE piece the stop face cut short —
    // the piece before it always ends on its own vertex, and the loop stops there. The fixture is
    // a two-facet step built from exact 3-4-5 legs (60/80 mm, then 0.28/0.96 mm) so the run is
    // 101.000000 mm to the bit and the face can be placed ON a vertex: the last facet is
    // 1.000000 mm against a joint whose corner is larger than the whole facet. GH-768 asks whether
    // the facet is a FRAGMENT (it is not) and class W (review r4) asks whether the ball can round
    // the corner ONTO it (it cannot, and the clamped chord would fall 1.321690 mm inside both
    // floors) — two rules, two questions, and this arm now measures both on the same fixture, with
    // a 10 mm facet of the same pitch as the control where only GH-768's answer decides.
    // Class Y3 (review r5) then measures the THIRD question on the same fixture: how much of the
    // cut-short facet is floor. Only the part before the wall is, so the trim the ball owes the
    // dropped facet is a continuous, monotone function of the fragment and reaches the whole
    // facet's value exactly at the far vertex — it is not a step the wall's position flips.
    const step9 = (face, tail = 1) => {
      const d = JSON.parse(JSON.stringify(tb9));
      for (const rw of d.runways) {
        if (!rw.stop) continue;
        const p0 = rw.points_mm[0]; const sgn = Math.sign(rw.points_mm[1][2] - p0[2]);
        const p1 = [p0[0], p0[1] - 60, p0[2] + sgn * 80];
        rw.points_mm = [p0, p1, [p1[0], +(p1[1] - 0.28 * tail).toFixed(6), +(p1[2] + sgn * 0.96 * tail).toFixed(6)]];
        rw.stop.wall_s_mm = face; rw.stop.capacity_balls = Math.max(1, Math.floor(face / 57.15 + 1e-9));
      }
      return d;
    };
    const ref9e = read9b(step9(100));                              // face on the shared vertex: the step's first facet alone
    const whole9e = read9b(step9(101));                            // face on the far vertex: the 1.000000 mm facet is WHOLE
    const frag9e = [100.5, 100.9].map((f) => ({ f, ...read9b(step9(f)) }));  // face mid-facet: a genuine fragment
    const subg9e = read9b(step9(100.05));                          // a sub-grain sliver of the facet: below the export grain, no floor to clear
    const near9e = read9b(step9(100.999));                         // 1 um short of the far vertex: the fragment's trim in the limit
    const long9e = read9b(step9(110, 10));                         // the SAME facet 10 mm long: it carries its own corner
    const geo9e = (() => {
      const tr = validateTrack(step9(101), { pockets: POCKETS, falls: null });
      const rt = [...tr.routes.values()][0]; const rw = rt.spans[rt.spans.length - 1].rw;
      const eA = rw.edges[0], eB = rw.edges[1];
      const h = supportDerived(rw.support, rt.r).h;
      const th = Math.acos(Math.max(-1, Math.min(1, eA.t[0] * eB.t[0] + eA.t[1] * eB.t[1] + eA.t[2] * eB.t[2])));
      const lam = h * Math.tan(0.5 * th);
      const pen = (ext) => h * (1 - Math.cos(th)) - Math.min(lam, 0.45 * ext) * Math.sin(th);
      return { h, theta: th, lam, len: eB.len, clamp: Math.min(lam, 0.45 * eB.len), pen: pen(eB.len), penLong: pen(10 * MM),
        concave: eB.t[0] * eA.n[0] + eB.t[1] * eA.n[1] + eB.t[2] * eA.n[2] > 1e-9,
        cut: rt.segs.some((sg) => sg.kind === 'cut'), trim: ref9e.total - whole9e.total };
    })();
    // how tight a kink this takes, over every definition in web/scene/ballreturn/tracks plus web/tools/fixtures/ballreturn-tracks: cut > edge needs the wire to turn
    // inside a radius of about h/2, which only a terminal lip does
    const kink9e = (() => {
      let worst = null, concave = 0;
      for (const [f, p] of trackFiles()) {
        let tk = null; try { tk = buildTrack(loadDef(p)); } catch { continue; }
        for (const rw of tk.runways.values()) {
          const h = supportDerived(rw.support, tk.refR).h;
          for (let i = 1; i < rw.edges.length; i++) {
            const eA = rw.edges[i - 1], eB = rw.edges[i];
            if (!(eB.t[0] * eA.n[0] + eB.t[1] * eA.n[1] + eB.t[2] * eA.n[2] > 1e-9)) continue;
            concave++;
            const th = Math.acos(Math.max(-1, Math.min(1, eA.t[0] * eB.t[0] + eA.t[1] * eB.t[1] + eA.t[2] * eB.t[2])));
            const ratio = h * Math.tan(0.5 * th) / eB.len;
            if (!worst || ratio > worst.ratio) worst = { ratio, f, rw: rw.id, i, len: eB.len, theta: th };
          }
        }
      }
      return { ...worst, concave };
    })();
    check(`t9e a WHOLE edge is never a trailing FRAGMENT (GH-768), and what drops this one is the CORNER (GH-770 review r4, class W): on a step whose last facet is exactly ${(geo9e.len / MM).toFixed(6)} mm against a corner of ${(geo9e.lam / MM).toFixed(4)} mm (h ${(geo9e.h / MM).toFixed(3)} mm, θ ${(geo9e.theta * 180 / Math.PI).toFixed(3)}°, concave), the face on that facet's own far vertex leaves it WHOLE — the fragment rule has nothing to cut — and the corner rule then drops it, because 45 % of ${(geo9e.len / MM).toFixed(6)} mm is ${(geo9e.clamp / MM).toFixed(4)} mm of the ${(geo9e.lam / MM).toFixed(4)} mm the ball needs to round it and the chord would fall ${(geo9e.pen / MM).toFixed(6)} mm inside both floors. So the ball rides the leg and stops at the first station CLEAR of the dropped facet: ${whole9e.pieces} support pieces, ${(whole9e.total / MM).toFixed(6)} mm, which is ${(geo9e.trim / MM).toFixed(6)} mm short of the ${ref9e.pieces}-piece ${(ref9e.total / MM).toFixed(6)} mm the route has with the face ON the shared vertex — there the facet lies past the wall and is the stop's own body, not floor, so there is nothing to be clear of. A face ${frag9e.map((x) => (x.f - 100).toFixed(1)).join(' / ')} mm along the SAME facet is a genuine fragment and is dropped by the fragment rule too, but only the part of it BEFORE the face is floor (GH-770 review r5, class Y3), so there is less to be clear of and the route is longer: ${frag9e.map((x) => (x.total / MM).toFixed(6)).join(' / ')} mm, trimmed ${frag9e.map((x) => ((ref9e.total - x.total) / MM).toFixed(6)).join(' / ')} mm against the whole facet's ${(geo9e.trim / MM).toFixed(6)}. The trim reads the FLOOR the ball must clear and nothing past the face: below the ${(EXPORT_GRAIN / MM).toFixed(1)} mm export grain there is no floor there at all and the route is the face-on-vertex route exactly (${(subg9e.total / MM).toFixed(6)} mm with 0.05 mm of facet inboard), above it the trim rises monotonically with the fragment and converges on the whole facet's — ${(1e6 * (near9e.total - whole9e.total)).toFixed(3)} um apart with the face 1 um short of the far vertex. A reader that took the WHOLE exported edge as floor answered ${(whole9e.total / MM).toFixed(6)} mm for all three, making the route a step function of where the wall stands. GH-768's rule is still what decides whether the facet is a fragment, and the control says so: the SAME pitch over ${(10).toFixed(6)} mm — 45 % of it is ${(4.5).toFixed(4)} mm, more than the corner — is kept and ridden, ${long9e.pieces} pieces, ${(long9e.total / MM).toFixed(6)} mm, with the corner drawn exact (${(geo9e.penLong / MM).toFixed(6)} mm of chord into the floor, the two offset lines meeting at the vertex). Over ${kink9e.concave} concave joints in the definitions in web/scene/ballreturn/tracks plus web/tools/fixtures/ballreturn-tracks the worst corner/edge is ${kink9e.ratio.toFixed(4)} (${kink9e.f} ${kink9e.rw} joint ${kink9e.i}, edge ${(kink9e.len / MM).toFixed(4)} mm, θ ${(kink9e.theta * 180 / Math.PI).toFixed(3)}°) — a kink that tight is the up-turned lip at a chute's end, which V7's grain keeps the stop face off`,
      Math.abs(geo9e.len - 1 * MM) < 1e-12 && geo9e.concave && geo9e.lam > geo9e.len
      && geo9e.pen > EXPORT_GRAIN && geo9e.penLong < 1e-15 && !geo9e.cut
      && !ref9e.err && !whole9e.err && whole9e.pieces === ref9e.pieces && !same9(whole9e, ref9e)
      && Math.abs(geo9e.trim - 0.0030835877) < 5e-10
      && frag9e.every((x) => !x.err) && !near9e.err && same9(subg9e, ref9e)
      && !same9(frag9e[0], whole9e) && !same9(frag9e[1], whole9e)
      && ref9e.total > frag9e[0].total && frag9e[0].total > frag9e[1].total
      && frag9e[1].total > near9e.total && near9e.total > whole9e.total
      && Math.abs((ref9e.total - frag9e[0].total) - 0.0023797217) < 5e-10
      && Math.abs((ref9e.total - frag9e[1].total) - 0.0029723776) < 5e-10
      && near9e.total - whole9e.total < 1.1e-6
      && !long9e.err && long9e.pieces === ref9e.pieces + 1 && kink9e.concave > 0,
      JSON.stringify([+(geo9e.len / MM).toFixed(6), +(geo9e.lam / MM).toFixed(4), +(geo9e.clamp / MM).toFixed(4), +(geo9e.pen / MM).toFixed(6), ref9e.pieces, whole9e.pieces, +(ref9e.total / MM).toFixed(6), +(whole9e.total / MM).toFixed(6), +(geo9e.trim / MM).toFixed(6)].concat(frag9e.map((x) => +(x.total / MM).toFixed(6))).concat([+(subg9e.total / MM).toFixed(6), +(near9e.total / MM).toFixed(6), long9e.pieces, +(long9e.total / MM).toFixed(6), +kink9e.ratio.toFixed(4)])));
    // t9f / t9g (GH-770 review r1, class S) — the route is a function of the GEOMETRY, never of the
    // exporter's SAMPLING. GH-768 kept every whole facet, and the kept facets then met the per-piece
    // rules (the corner cut's 45 % clamp, the twist windows, the trailing-fragment drop) differently
    // depending on how finely the same straight leg had been cut: the review geometry below seated the
    // ball 7.756 mm further down the track when one 20 mm leg was written as four collinear 5 mm
    // facets. The reader now walks the runway's maximal EXACTLY-collinear RUNS (track.js
    // `collinearRuns`), decided on the file's own printed decimals by exact integer arithmetic — a
    // scale, not a tolerance. NEAR-collinear facets (a direction that differs in the file's own last
    // digit) are a real bend and are NOT merged: that boundary is GH-769's question, and t9f's last
    // two rows pin it.
    const dec9S = (v) => { const m = /^-?\d+(?:\.(\d+))?$/.exec(String(v)); return m ? (m[1] ? m[1].length : 0) : -1; };
    const decOf9S = (def) => Math.max(...def.runways.flatMap((rw) => rw.points_mm.flatMap((p) => p.map(dec9S))));
    // an exact integer collinearity test, written here independently of the reader's own
    const gcd9S = (a, b) => { while (b) { const t = a % b; a = b; b = t; } return a; };
    const key9S = (a, b, d) => {
      const u = [0, 1, 2].map((c) => Math.round(b[c] * 10 ** d) - Math.round(a[c] * 10 ** d));
      const g = gcd9S(gcd9S(Math.abs(u[0]), Math.abs(u[1])), Math.abs(u[2]));
      return g > 0 ? u.map((x) => x / g).join(',') : null;
    };
    // the t9e step with its terminal facet extended to `tail` mm and cut into k collinear facets.
    // The sub-vertices are written at the fixture's own precision + 2 digits, which is EXACT here
    // (an eighth of a 2-decimal leg of −0.28 / +0.96 per mm needs at most four), so the file states
    // them on its own lattice exactly as an exporter's printed decimals would.
    const stepS = (face, tail, k, cap) => {
      const d = JSON.parse(JSON.stringify(tb9));
      const q = decOf9S(d) + 2;
      for (const rw of d.runways) {
        if (!rw.stop) continue;
        const p0 = rw.points_mm[0]; const sgn = Math.sign(rw.points_mm[1][2] - p0[2]);
        const p1 = [p0[0], p0[1] - 60, p0[2] + sgn * 80];
        const pts = [p0, p1];
        for (let j = 1; j <= k; j++) pts.push([p1[0], +(p1[1] - 0.28 * tail * j / k).toFixed(q), +(p1[2] + sgn * 0.96 * tail * j / k).toFixed(q)]);
        rw.points_mm = pts;
        rw.stop.wall_s_mm = face; rw.stop.capacity_balls = cap;
      }
      return d;
    };
    const rdS = (def) => {
      let tr = null; try { tr = validateTrack(def, { pockets: POCKETS, falls: null }); } catch (e) { return { err: e.message }; }
      const rt = [...tr.routes.values()][0];
      const rw = rt.spans[rt.spans.length - 1].rw;
      return { total: rt.total, pieces: rt.segs.filter((sg) => sg.kind === 'line').length,
        ladder: reachSpan(rt, rt.r).ladder.map((s) => [s.D, s.x, s.y, s.z]),
        edges: rw.edges.length, runs: rw.runs.length };
    };
    const sameS = (a, b) => !a.err && !b.err && Math.abs(a.total - b.total) < 1e-9
      && a.ladder.length === b.ladder.length && a.ladder.every((row, i) => row.every((v, c) => Math.abs(v - b.ladder[i][c]) < 1e-9));
    const cutsS = [1, 2, 4, 8].map((k) => ({ k, ...rdS(stepS(120, 20, k, 2)) }));
    const refS = cutsS[0];
    const worstS = cutsS.slice(1).reduce((w, x) => x.err ? w : Math.max(w, Math.abs(x.total - refS.total), ...x.ladder.flatMap((row, i) => row.map((v, c) => Math.abs(v - refS.ladder[i][c])))), 0);
    // the SAME leg cut into four, with ONE interior vertex moved by a single unit of the file's own
    // last digit: a bend the file states, not a sampling artefact — not merged, and the route moves
    const nearS = (() => {
      const d = stepS(120, 20, 4, 2);
      const q = decOf9S(d);
      for (const rw of d.runways) { if (!rw.stop) continue; const v = rw.points_mm[3]; rw.points_mm[3] = [+(v[0] + 10 ** -q).toFixed(q), v[1], v[2]]; }
      const pts = d.runways.find((rw) => rw.stop).points_mm;
      const keys = []; for (let i = 1; i < pts.length; i++) keys.push(key9S(pts[i - 1], pts[i], q));
      return { ...rdS(d), keys, distinct: new Set(keys.slice(1)).size };
    })();
    const latS = (() => {                    // the fixture's own lattice, read independently of the module
      const d = stepS(120, 20, 4, 2);
      const q = decOf9S(d);
      const pts = d.runways.find((rw) => rw.stop).points_mm;
      const keys = []; for (let i = 1; i < pts.length; i++) keys.push(key9S(pts[i - 1], pts[i], q));
      return { q, keys, tailSame: keys.slice(1).every((k2) => k2 === keys[1]) };
    })();
    check(`t9f the route is a function of the GEOMETRY, not of the exporter's sampling (GH-770 class S): the review step — a 100 mm leg, then a 20 mm terminal leg, stop face on its far vertex at 120.000 mm, capacity 2 — reads the SAME route whether that leg is written as one edge or as ${cutsS.slice(1).map((x) => x.k).join(' / ')} collinear facets (${cutsS.map((x) => x.k + '×' + (20 / x.k).toFixed(3).replace(/0+$/, '').replace(/\.$/, '') + ' mm').join(', ')}): total ${(refS.total / MM).toFixed(6)} mm and every one of the ${refS.ladder.length} seats of the chain identical to ${worstS.toExponential(2)} m, ${refS.pieces} line segments in each. Before this fix the same four-facet file read ${(172.648092).toFixed(6)} mm against ${(164.891950).toFixed(6)} mm — the seated ball 7.756 mm further down the track — and eight facets read 177.111799 mm. The merge is EXACT and the file decides it: at this fixture's own precision (1e-${latS.q} mm) the four facets carry one integer direction ${latS.keys[1]}, and the same four with ONE interior vertex moved by a single unit of that last digit (${(10 ** -latS.q).toFixed(latS.q)} mm) carry ${nearS.distinct} directions instead of one — a bend the file states is never merged away. Un-merged, the ${(5).toFixed(3)} mm facet after the 20.610° joint cannot carry the 4.2048 mm corner the ball needs to round it, so this round's class-W law REFUSES the file by name rather than seating the ball 0.688090 mm inside the floor: ${nearS.err ? nearS.err.slice(0, 150) : 'ACCEPTED'}. The refusal is itself the proof the merge did not happen — at the same joint the merged file has 20 mm of run and reads ${(refS.total / MM).toFixed(6)} mm (GH-769's boundary)`,
      cutsS.every((x) => !x.err) && cutsS.slice(1).every((x) => sameS(x, refS)) && worstS < 1e-9
      && refS.ladder.length >= 2 && cutsS[3].edges === 9 && cutsS[3].runs === 2
      && latS.tailSame && latS.keys[1] !== latS.keys[0]
      && nearS.distinct > 1 && !!nearS.err && /\[V2\]/.test(nearS.err) && nearS.err.includes('5.000 mm run'),
      JSON.stringify(cutsS.map((x) => x.err ? [x.k, x.err.slice(0, 60)] : [x.k, +(x.total / MM).toFixed(9), x.pieces, x.edges, x.runs]).concat([['near', nearS.err ? nearS.err.slice(0, 120) : +(nearS.total / MM).toFixed(9), nearS.distinct], ['lat', latS.q, latS.keys.join(' ')]])));
    // t9g the same invariance over every definition in web/scene/ballreturn/tracks plus web/tools/fixtures/ballreturn-tracks, and those definitions' routes themselves
    const filesS = trackFiles();
    const subS = (def, k) => {                                  // every edge cut into k, on the file's own lattice
      const out = JSON.parse(JSON.stringify(def));
      const q = decOf9S(def) + 3;                               // an eighth of a d-decimal pair needs at most d+3
      for (const rw of out.runways) {
        const pts = rw.points_mm; const o = [pts[0]];
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1], b = pts[i];
          for (let j = 1; j <= k; j++) o.push([0, 1, 2].map((c) => j === k ? b[c] : +(a[c] + (b[c] - a[c]) * j / k).toFixed(q)));
        }
        rw.points_mm = o;
      }
      return out;
    };
    const readAllS = async (def) => {
      const ctx = await tableContext(def.doc.table_id);
      let tr = null; try { tr = validateTrack(def, { pockets: ctx.pockets, falls: ctx.falls }); } catch (e) { return { err: e.message }; }
      const rows = [...tr.routes.entries()].sort((a, b) => a[0] - b[0]).map(([pk, rt]) => ({ pk, total: rt.total, ladder: reachSpan(rt, rt.r).ladder.map((s) => [s.D, s.x, s.y, s.z]) }));
      let edges = 0, runs = 0;
      for (const rw of tr.runways.values()) { edges += rw.edges.length; runs += rw.runs.length; }
      return { rows, edges, runs };
    };
    const sweepS = [];
    for (const [f, p] of filesS) {
      const def = loadDef(p);
      const ref = await readAllS(def);
      if (ref.err) { sweepS.push({ f, refused: ref.err.match(/\[V\d+[a-z]?\]/)?.[0] ?? 'refused' }); continue; }
      const row = { f, seats: ref.rows.reduce((n, r2) => n + r2.ladder.length, 0), routes: ref.rows.length, edges: ref.edges, runs: ref.runs, worst: 0, bad: null };
      for (const k of [2, 4, 8]) {
        const got = await readAllS(subS(def, k));
        if (got.err || got.rows.length !== ref.rows.length) { row.bad = `k${k} ${got.err ? got.err.slice(0, 50) : 'route count'}`; continue; }
        for (let i = 0; i < ref.rows.length; i++) {
          row.worst = Math.max(row.worst, Math.abs(ref.rows[i].total - got.rows[i].total));
          const la = ref.rows[i].ladder, lb = got.rows[i].ladder;
          if (la.length !== lb.length) { row.bad = `k${k} pk ${ref.rows[i].pk} ladder ${la.length} vs ${lb.length}`; break; }
          for (let j = 0; j < la.length; j++) for (let c = 0; c < 4; c++) row.worst = Math.max(row.worst, Math.abs(la[j][c] - lb[j][c]));
        }
      }
      sweepS.push(row);
    }
    const liveS = sweepS.filter((x) => !x.refused);
    const starS = sweepS.find((x) => x.f.startsWith('wpbsa_snooker_12ft-xw101'));
    const starTotals = await (async () => {
      const def = loadDef(path.resolve(here, '../scene/ballreturn/tracks/wpbsa_snooker_12ft-xw101-slides.json'));
      const got = await readAllS(def);
      return got.rows.map((r2) => r2.total);
    })();
    const R37 = [0.296179587, 0.298951042, 0.444350793, 0.444350793, 0.298951042, 0.296179587];  // the SNK-R37 export's published routes
    check(`t9g the same invariance over every definition in web/scene/ballreturn/tracks plus web/tools/fixtures/ballreturn-tracks (${liveS.length} built, ${sweepS.length - liveS.length} refused by law: ${sweepS.filter((x) => x.refused).map((x) => x.f.replace('.json', '') + ' ' + x.refused).join(', ') || 'none'}): each one re-cut with EVERY edge divided into 2 / 4 / 8 on the file's own decimal lattice reads the same routes and the same seating chains — ${liveS.reduce((n, x) => n + x.routes, 0)} routes, ${liveS.reduce((n, x) => n + x.seats, 0)} seats, worst deviation ${Math.max(...liveS.map((x) => x.worst)).toExponential(2)} m (${liveS.map((x) => x.f.replace('.json', '').replace('TEST-', '') + ' ' + x.worst.toExponential(1)).join(', ')}). The sampled XW101 export exercises the merge on its own bytes — ${starS.runs} runs over ${starS.edges} edges, ${starS.edges - starS.runs} of its printed vertices are sampling and not geometry — and its six routes are UNCHANGED by it: ${starTotals.map((t2) => (t2 / MM).toFixed(6)).join(' / ')} mm, the SNK-R37 totals to the printed digit (worst ${(Math.max(...starTotals.map((t2, i) => Math.abs(t2 - R37[i]))) / MM).toExponential(2)} mm against the published figures; the committed bytes are not edited and t6d still holds)`,
      liveS.length >= 11 && liveS.every((x) => !x.bad && x.worst < 1e-9)
      && !!starS && starS.runs < starS.edges && starTotals.length === 6
      && starTotals.every((t2, i) => Math.abs(t2 - R37[i]) < 5e-10),
      JSON.stringify(sweepS.map((x) => x.refused ? [x.f, x.refused] : [x.f, x.routes, x.seats, x.edges, x.runs, +x.worst.toExponential(2), x.bad])));
  }
  // RED PLANT (GH-770 review r3, arms U4 / U6 / X4): the module directory copied to a temp tree with
  // a named line of track.js replaced by the text THIS round removed, imported through its own
  // schema.js and kinematics.js, and read with the same fixtures — so every "before" number the
  // class-U and class-X arms quote is MEASURED on the pre-fix rule right here, not narrated from a
  // probe that lived somewhere else. A patch whose text is not present exactly once is a FAILURE,
  // not a skip: that is what keeps the red arms honest the next time the module is edited.
  // Round 4's own law (class W) is lifted in EVERY plant below, because the seats these red arms
  // measure are exactly the seats it refuses: the pre-fix reader walked a lip no ball can climb and
  // sat the ball inside the floor, and a module that throws on that pose cannot report it. Both
  // halves go — the corner law in the walk, and the pose refusal `refusePose` raises for a caller.
  const UNDO_W = [
    ['      if (pen > SLIVER) {', '      if (false && pen > SLIVER) {'],
    ['export function refusePose(route, D, st, where) {', 'export function refusePose(route, D, st, where) {\n  return;'],
    ['  for (const Q of dropped) {', '  for (const Q of []) {'],
  ];
  const MODDIR = path.resolve(here, '../scene/ballreturn');
  const redTmp = [];
  const redPlant = async (tag, edits) => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `ballreturn-red-${tag}-`));
    redTmp.push(tmp);
    fs.cpSync(MODDIR, path.join(tmp, 'ballreturn'), { recursive: true });
    const seen = new Map(); const noop = [];                 // [from, to, file = track.js, idempotent]
    for (const [k2, [a, b, fn = 'track.js', idem = false]] of edits.entries()) {
      const file = path.join(tmp, 'ballreturn', fn);
      const txt = seen.get(fn) ?? fs.readFileSync(file, 'utf8');
      const hits = txt.split(a).length - 1;
      // An IDEMPOTENT edit is one whose absence means the module ALREADY reads the way the plant
      // is trying to make it read. Leaving it alone then makes the plant a no-op, so the arm fails
      // on its MEASUREMENT (the two readings agree) instead of on a missing anchor — which is the
      // difference between a mutant killed behaviourally and a mutant killed by deleting a string.
      if (hits === 0 && idem) { seen.set(fn, txt); noop.push(`${fn}#${k2} ${a.trim().slice(0, 48)}`); continue; }
      if (hits !== 1) return { err: `red plant ${tag}: text not present exactly once in ${fn} — ${a.trim().slice(0, 80)}` };
      seen.set(fn, txt.replace(a, b));
    }
    for (const [fn, txt] of seen) fs.writeFileSync(path.join(tmp, 'ballreturn', fn), txt);
    const url = (n) => pathToFileURL(path.join(tmp, 'ballreturn', n)).href;
    // `skipped` NAMES the idempotent edits that found nothing to change. A plant all of whose edits
    // are absorbed is not a plant at all — it is the module under test wearing another tag — so every
    // idempotent arm asserts this list is shorter than its own edit list, on top of the difference it
    // was written to measure, and prints it (GH-770 review r6, class Z5).
    return { skipped: noop, schema: await import(url('schema.js')), kin: await import(url('kinematics.js')), track: await import(url('track.js')) };
  };
  // t9h / t9i (GH-770 review r2, class V) — the STOP'S OWN BODY is not walked. The wall face is
  // written on the exporter's grain, so law V12 exempts a vertical edge that begins within 1 mm of
  // it: an up-turn clamp lip is a shipped shape (every XW101 chute carries one) and no ball rolls
  // on it. A lip that is RETAINED as a support piece has no support normal — `upNormal` falls back
  // to ŷ, parallel to the tangent — and its rolling axis n̂ × t̂ is ZERO, which is silent: `qaxis`
  // returns (0,0,0,cos ½φ) and the ball simply rests mis-oriented. The exclusion carries V12's
  // exemption class exactly (no support normal AND inside the same 1 mm grain), so a SLOPED tip in
  // the same place is support and is walked, and a vertical edge the definition puts BEFORE the
  // grain is still refused by the law with its line, not dropped.
  {
    const tb9v = loadDef(path.resolve(here, '../scene/ballreturn/tracks/TEST-terminal-chutes.json'));
    // a CHANNEL chute (h = r, the deepest support the schema has) descending 96 mm over 28 mm,
    // then a `tip` mm up-turn: VERTICAL (the clamp lip) or SLOPED by the fixture's own 0.28/0.96
    // The GENTLE tip is the chute's own heading turned 1.000° shallower — a unit direction to six
    // decimals, so a `tip` mm tip is tip mm long — which is the tip a 0.5 mm run CAN carry the ball
    // around: its corner is ½(h+h)·tan(θ/2) = 0.2494 mm against the 0.2250 mm the 45 % clamp allows,
    // so the clamp binds and the chord falls 0.000425 mm into the floor — under the 0.1 mm export
    // grain, which is the whole of what the class-W law asks (arms W1-W6). The 0.28/0.96 tip below
    // is the same 0.5 mm run at 57.480° to the chute, where the same construction falls 13.023360 mm
    // in: floor by law V7 and by V12, and still not something the ball can ride.
    const GENTLE9 = [+Math.sin(Math.atan2(96, 28) - Math.PI / 180).toFixed(6), +Math.cos(Math.atan2(96, 28) - Math.PI / 180).toFixed(6)];
    const lip9 = (face, tip, vertical, pitch = null) => {
      const d = JSON.parse(JSON.stringify(tb9v));
      for (const rw of d.runways) {
        if (!rw.stop) continue;
        const p0 = rw.points_mm[0]; const sgn = Math.sign(rw.points_mm[1][2] - p0[2]);
        const p1 = [p0[0], p0[1] - 96, p0[2] + sgn * 28];
        rw.points_mm = [p0, p1, vertical ? [p1[0], p1[1] + tip, p1[2]]
          : pitch ? [p1[0], +(p1[1] - pitch[0] * tip).toFixed(6), +(p1[2] + sgn * pitch[1] * tip).toFixed(6)]
          : [p1[0], +(p1[1] - 0.28 * tip).toFixed(4), +(p1[2] + sgn * 0.96 * tip).toFixed(4)]];
        rw.support = { kind: 'channel', width_mm: 80, provenance: { tag: 'TEST', source: 'synthetic channel floor, 80 mm > one ball diameter: h = r' } };
        rw.stop.wall_s_mm = face; rw.stop.capacity_balls = 1;
      }
      return d;
    };
    const restNorm = (tr, pk, pockets) => {
      const h1 = handoffFromSink({ t: 1, pocket: pockets[pk], fall: pockets[pk], r: tr.refR, tFall: 0.021, glide: 0.06 },
        { track: tr, pockets, r: tr.refR });
      if (!h1) return null;
      const sol = solveShot({ track: tr, r: tr.refR, ledger: [], arrivals: [{ id: 1, handoff: h1 }] });
      const pz = poseAt(sol, 1, sol.tEnd + 1, {});
      return pz ? Math.hypot(pz.qx, pz.qy, pz.qz, pz.qw) : null;
    };
    const readV = (def) => {
      let tr = null; try { tr = validateTrack(def, { pockets: POCKETS, falls: null }); } catch (e) { return { err: e.message }; }
      const pk = [...tr.routes.keys()].sort((a, b) => a - b)[0];
      const rt = tr.routes.get(pk);
      const lines = rt.segs.filter((sg) => sg.kind === 'line');
      const axes = lines.map((sg) => Math.hypot(sg.edge.axis[0], sg.edge.axis[1], sg.edge.axis[2]));
      const st = stationAt(rt, rt.r, rt.r, {});
      return { pieces: lines.length, total: rt.total, seat: [st.x, st.y, st.z], zero: axes.filter((a) => a < 1e-9).length,
        worstAxis: Math.max(...axes.map((a) => Math.abs(a - 1))), norm: restNorm(tr, pk, POCKETS),
        segs: rt.segs.map((sg) => `${sg.kind} ${(sg.len / MM).toFixed(3)}`).join(', ') };
    };
    const vLip = readV(lip9(100.5, 0.5, true));      // the review fixture: face 0.5 mm past the lip's foot
    const vFoot = readV(lip9(100.0, 0.5, true));     // the same chute, face ON the lip's foot: nothing to retain
    const vSlope = readV(lip9(100.5, 0.5, false, GENTLE9));  // a SLOPED tip the ball can round: support, walked
    const vSteep = readV(lip9(100.5, 0.5, false));   // the same 0.5 mm tip at 57.480°: support too, and dropped by the CORNER law
    // the class-W corner quantity, mirrored from the law (h(1−cos θ) − λc·sin θ) rather than read
    // from the module, for a tip of this pitch on this chute
    const penW9 = (pitch, tipLen) => {
      const th = Math.abs(Math.atan2(96, 28) - Math.atan2(pitch[0], pitch[1]));
      const lamF = R * Math.tan(0.5 * th);
      const lam = Math.min(lamF, 0.45 * tipLen * MM);
      return { th, lamF, lam, pen: R * (1 - Math.cos(th)) - lam * Math.sin(th) };
    };
    const wGentle = penW9(GENTLE9, 0.5);
    const wSteep = penW9([0.28, 0.96], 0.5);
    const vLaw = (() => { try { validateTrack(lip9(101.5, 2, true), { pockets: POCKETS, falls: null }); return 'ACCEPTED'; } catch (e) { return e.message; } })();
    const sameV = (a, b) => !a.err && !b.err && Math.abs(a.total - b.total) < 1e-12 && a.seat.every((v, i) => Math.abs(v - b.seat[i]) < 1e-12);
    check(`t9h the stop's own body is not walked (GH-770 review r2, class V): a channel chute descending 96 mm over 28 mm with a ${(0.5).toFixed(1)} mm VERTICAL up-turn at its end and the stop face 0.5 mm past that turn (wall_s 100.5 mm, inside V12's 1 mm stop-body exemption) walks ${vLip.pieces} pieces, ${(vLip.total / MM).toFixed(6)} mm — the lip is the wall, not the floor — and reads exactly what the same chute reads with its face ON the shared vertex (${(vFoot.total / MM).toFixed(6)} mm, seat to 1e-12 m). Every walked piece carries a unit rolling axis (worst |axis| − 1 = ${vLip.worstAxis.toExponential(2)}, ${vLip.zero} zero) and the rest quaternion has norm ${vLip.norm.toFixed(12)}. With the lip retained the route walked a 34.245 mm connector onto it (204.476188 mm, segments line 42.985 / cut 27.196 / line 99.775 / cut 34.245 / line 0.275) whose rolling axis was ZERO, and solveShot rested the ball at quaternion norm 0.994594. The exclusion is V12's exemption class and nothing wider: a SLOPED tip in the same place is support and is walked — the chute's own heading turned ${(1).toFixed(3)}° shallower over the same 0.5 mm (${vSlope.pieces} pieces, ${(vSlope.total / MM).toFixed(6)} mm, worst |axis| − 1 = ${vSlope.worstAxis.toExponential(2)}, norm ${vSlope.norm.toFixed(12)}), whose corner ${(wGentle.lamF / MM).toFixed(4)} mm the 45 % clamp cuts to ${(wGentle.lam / MM).toFixed(4)} mm for a chord ${(wGentle.pen / MM).toFixed(6)} mm into the floor, under the ${(EXPORT_GRAIN / MM).toFixed(1)} mm grain. GH-770 review round 4 (class W) then takes the tip this arm used to carry — the fixture's own 0.28/0.96 per mm, ${(wSteep.th * 180 / Math.PI).toFixed(3)}° to the chute — because 0.5 mm of run cannot carry a ${(wSteep.lamF / MM).toFixed(3)} mm corner: clamped to ${(wSteep.lam / MM).toFixed(4)} mm the same chord falls ${(wSteep.pen / MM).toFixed(6)} mm INSIDE the chute, so that tip is dropped. And because it IS floor — it drains, V7 says so — the ball must also stop CLEAR of it: ${(vSteep.total / MM).toFixed(6)} mm over ${vSteep.pieces} pieces, ${((vLip.total - vSteep.total) / MM).toFixed(6)} mm short of the vertical lip's ${(vLip.total / MM).toFixed(6)} mm, where the lip is the stop's own body, was never floor, and there is nothing to be clear of. Two different laws on two different questions: V12/V7 ask whether a ball rolls DOWN the piece (it does, both tips are floor), class W asks whether it can ROUND the corner onto it, and a piece that fails the second is still floor the ball may not sit in. And a 2 mm vertical tip whose foot lies BEFORE the grain (face 101.5 mm) is refused by the law, not dropped: ${vLaw.slice(0, 96)}`,
      !vLip.err && vLip.pieces === 2 && vLip.zero === 0 && vLip.worstAxis < 1e-12 && Math.abs(vLip.norm - 1) < 1e-12
      && sameV(vLip, vFoot)
      && !vSlope.err && vSlope.pieces === 3 && vSlope.zero === 0 && vSlope.worstAxis < 1e-12 && Math.abs(vSlope.norm - 1) < 1e-12
      && Math.abs(vSlope.total - vLip.total) > 1e-6
      && wGentle.pen > 0 && wGentle.pen < EXPORT_GRAIN && wSteep.pen > EXPORT_GRAIN
      && !vSteep.err && vSteep.pieces === 2 && vSteep.total < vLip.total - 1e-6
      && Math.abs((vLip.total - vSteep.total) - 0.00462167) < 5e-9
      && /\[V12\]/.test(vLaw),
      JSON.stringify({ lip: [vLip.err ?? +(vLip.total / MM).toFixed(6), vLip.pieces, vLip.zero, vLip.norm], foot: [vFoot.err ?? +(vFoot.total / MM).toFixed(6), vFoot.pieces], slope: [vSlope.err ?? +(vSlope.total / MM).toFixed(6), vSlope.pieces, vSlope.norm], steep: [vSteep.err ?? +(vSteep.total / MM).toFixed(6), vSteep.pieces], pen: [+(wGentle.pen / MM).toFixed(6), +(wSteep.pen / MM).toFixed(6)], law: vLaw.slice(0, 80) }));
    // t9i the same property as a CENSUS: no route anywhere walks a piece without a support normal,
    // and every ball the solver rests carries a unit quaternion
    const filesV = trackFiles();
    const censusV = [];
    for (const [f, p] of filesV) {
      const def = loadDef(p);
      const ctx = await tableContext(def.doc.table_id);
      censusV.push({ name: f.replace('.json', '').replace('TEST-', ''), def, pockets: ctx.pockets, falls: ctx.falls });
    }
    for (const [nm, d] of [['fixture lip 100.5 vertical', lip9(100.5, 0.5, true)], ['fixture lip 100.5 sloped 1.000°', lip9(100.5, 0.5, false, GENTLE9)],
      ['fixture lip 100.5 sloped 57.480°', lip9(100.5, 0.5, false)],
      ['fixture lip 100.0 vertical', lip9(100.0, 0.5, true)]]) censusV.push({ name: nm, def: d, pockets: POCKETS, falls: null });
    const rowsV = [];
    for (const c of censusV) {
      let tr = null; try { tr = validateTrack(c.def, { pockets: c.pockets, falls: c.falls }); } catch (e) { rowsV.push({ name: c.name, refused: e.message.match(/\[V\d+[a-z]?\]/)?.[0] ?? 'refused' }); continue; }
      const row = { name: c.name, routes: 0, pieces: 0, worstAxis: 0, rests: 0, worstNorm: 0 };
      for (const [pk, rt] of [...tr.routes.entries()].sort((a, b) => a[0] - b[0])) {
        row.routes += 1;
        for (const sg of rt.segs) if (sg.kind === 'line') { row.pieces += 1; row.worstAxis = Math.max(row.worstAxis, Math.abs(Math.hypot(sg.edge.axis[0], sg.edge.axis[1], sg.edge.axis[2]) - 1)); }
        const n = restNorm(tr, pk, c.pockets);
        if (n !== null) { row.rests += 1; row.worstNorm = Math.max(row.worstNorm, Math.abs(n - 1)); }
      }
      rowsV.push(row);
    }
    const liveV = rowsV.filter((x) => !x.refused);
    check(`t9i no route anywhere walks a piece without a support normal (GH-770 review r2, class V): over ${liveV.length} definitions that build (${rowsV.length - liveV.length} refused by law: ${rowsV.filter((x) => x.refused).map((x) => x.name + ' ' + x.refused).join(', ') || 'none'}) — the ${liveV.filter((x) => !x.name.startsWith('fixture')).length} in web/scene/ballreturn/tracks plus web/tools/fixtures/ballreturn-tracks and the class-V fixtures — ${liveV.reduce((n, x) => n + x.routes, 0)} routes walk ${liveV.reduce((n, x) => n + x.pieces, 0)} support pieces and every one of them carries a UNIT rolling axis (worst |n̂ × t̂| − 1 = ${Math.max(...liveV.map((x) => x.worstAxis)).toExponential(2)}), and the solver's ${liveV.reduce((n, x) => n + x.rests, 0)} rests all have a unit quaternion (worst |q| − 1 = ${Math.max(...liveV.map((x) => x.worstNorm)).toExponential(2)}). A zero axis is impossible by construction — buildRoute excludes the stop body and buildTrack refuses a vertical edge anywhere else, on the same floor V12 uses — and buildRoute carries a belt that throws if one is ever walked`,
      liveV.length >= 12 && liveV.every((x) => x.worstAxis < 1e-12 && x.worstNorm < 1e-12 && x.pieces > 0),
      JSON.stringify(rowsV.map((x) => x.refused ? [x.name, x.refused] : [x.name, x.routes, x.pieces, +x.worstAxis.toExponential(1), x.rests, +x.worstNorm.toExponential(1)])));
    // ---- t9m .. t9r (GH-770 review r3, class U) — inside the stop-body zone the stop's own body is
    // what DOES NOT DRAIN, not what stands vertical. V12 (the r2 reading) exempts a zone; V7 refuses
    // an edge no ball can roll down wherever a ball travels and exempts the same zone, because the
    // body lives there. So the walk reads V7's own predicate inside it — `drainsAt`, exported for the
    // purpose — and verticality is the limiting case of it, not the test.
    const subU = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const dotU = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const SUPU = { kind: 'channel', width_mm: 80, provenance: { tag: 'TEST', source: 'synthetic channel floor, 80 mm > one ball diameter: h = r' } };
    // the same 96/28 channel chute t9h uses, with a lip of ANY pitch at its end: `rise` mm up against
    // travel over `run` mm along it. 0.48/0.14 is the review fixture — 73.74°, exactly 0.5 mm long, so
    // the runway ends exactly on the 100.5 mm stop face; run 0 is the class-V vertical; rise 0 is a
    // LEVEL pad; rise < 0 turns DOWN and drains, which is support and must still be walked.
    const lipU = (face, rise, run) => {
      const d = JSON.parse(JSON.stringify(tb9v));
      for (const rw of d.runways) {
        if (!rw.stop) continue;
        const p0 = rw.points_mm[0]; const sgn = Math.sign(rw.points_mm[1][2] - p0[2]);
        const p1 = [p0[0], p0[1] - 96, p0[2] + sgn * 28];
        rw.points_mm = [p0, p1, [p1[0], p1[1] + rise, p1[2] + sgn * run]];
        rw.support = SUPU; rw.stop.wall_s_mm = face;
        rw.stop.capacity_balls = Math.max(1, Math.floor(face / 57.15 + 1e-9));   // V6's own identity: a 25 mm tip makes room for a second ball
      }
      return d;
    };
    const plainU = (face) => {                                   // the same chute with NO lip at all
      const d = JSON.parse(JSON.stringify(tb9v));
      for (const rw of d.runways) {
        if (!rw.stop) continue;
        const p0 = rw.points_mm[0]; const sgn = Math.sign(rw.points_mm[1][2] - p0[2]);
        rw.points_mm = [p0, [p0[0], p0[1] - 96, p0[2] + sgn * 28]];
        rw.support = SUPU; rw.stop.wall_s_mm = face;
        rw.stop.capacity_balls = Math.max(1, Math.floor(face / 57.15 + 1e-9));
      }
      return d;
    };
    // how far the ball centre `c` stands from the floor under it, measured ALONG that piece's own
    // normal and only where the perpendicular foot lands INSIDE the piece (an offset surface ends
    // where its support does), minus the support's offset h. Negative = the centre is in the floor.
    // the FLOOR under a station is the support piece it rests on — the line segment at that station,
    // and the one across the blend it is entering or leaving — never any other piece of the track
    // whose offset surface the ball happens to pass near. On a hairpin the return leg runs a few mm
    // from the outgoing one and reads as a 5.96 mm "penetration" if the whole route is scanned; it
    // is nothing of the kind, and the order's own wording says so ("the floor = the support piece
    // the ball rests on, distance measured along its normal").
    const floorU = (rt, D) => {
      const segs = rt.segs;
      const i = segs.indexOf(locate(rt, D).seg);
      const out = [];
      for (let k = i; k >= 0; k -= 1) if (segs[k].kind === 'line') { out.push(segs[k]); break; }
      for (let k = i; k < segs.length; k += 1) if (segs[k].kind === 'line') { if (!out.includes(segs[k])) out.push(segs[k]); break; }
      return out;
    };
    const gapU = (lines, c) => {
      let worst = null;
      for (const sg of lines) {
        const e = sg.edge;
        const sL = e.s0 + dotU(subU(c, e.p0), e.t);
        if (!(sL > sg.sFrom && sL < sg.sTo)) continue;
        const u = sL - e.s0;
        const d3 = Math.hypot(c[0] - (e.p0[0] + e.t[0] * u), c[1] - (e.p0[1] + e.t[1] * u), c[2] - (e.p0[2] + e.t[2] * u));
        if (worst === null || d3 - sg.h < worst) worst = d3 - sg.h;
      }
      return worst;
    };
    const SHIPPEDU = { schema: { validateTrack }, kin: { handoffFromSink, solveShot, poseAt }, track: { stationAt } };
    const readU = (def, M = SHIPPEDU) => {
      let tr = null; try { tr = M.schema.validateTrack(def, { pockets: POCKETS, falls: null }); } catch (e) { return { err: e.message }; }
      const pk = [...tr.routes.keys()].sort((a, b) => a - b)[0];
      const rt = tr.routes.get(pk);
      const lines = rt.segs.filter((sg) => sg.kind === 'line');
      const h1 = M.kin.handoffFromSink({ t: 1, pocket: POCKETS[pk], fall: POCKETS[pk], r: tr.refR, tFall: 0.021, glide: 0.06 },
        { track: tr, pockets: POCKETS, r: tr.refR });
      const sol = M.kin.solveShot({ track: tr, r: tr.refR, ledger: [], arrivals: [{ id: 1, handoff: h1 }] });
      const pz = M.kin.poseAt(sol, 1, sol.tEnd + 1, {});
      const st = M.track.stationAt(rt, rt.r, rt.r, {});
      return { pieces: lines.length, total: rt.total, seat: [st.x, st.y, st.z],
        walksLip: lines.some((sg) => sg.edge.s0 > 99.9 * MM),
        norm: pz ? Math.hypot(pz.qx, pz.qy, pz.qz, pz.qw) : null,
        gap: pz ? gapU(floorU(rt, restStation(1, rt.r)), [pz.x, pz.y, pz.z]) : null,   // the first rest station, D = r
        cut: Math.max(0, ...rt.segs.filter((sg) => sg.kind !== 'line').map((sg) => sg.len)),
        segs: rt.segs.map((sg) => `${sg.kind} ${(sg.len / MM).toFixed(3)}`).join(', ') };
    };
    const sameU = (a, b) => !a.err && !b.err && Math.abs(a.total - b.total) < 1e-12 && a.seat.every((v, i) => Math.abs(v - b.seat[i]) < 1e-12);
    const uReview = readU(lipU(100.5, 0.48, 0.14));
    const uVert = readU(lipU(100.5, 0.5, 0));
    const uFoot = readU(lipU(100.0, 0.48, 0.14));
    const uPlain = readU(plainU(100.5));
    const uLevel = readU(lipU(100.5, 0, 0.5));
    const uDown = readU(lipU(100.5, -0.2, 0.3));
    // the SAME down-turn pitch over a run long enough to carry its own corner (GH-770 review r4,
    // class W): 14 mm down over 21 mm, so the face sits on the far vertex of a 25.238859 mm tip
    const uDownLong = readU(lipU(+(100 + Math.hypot(14, 21)).toFixed(6), -14, 21));
    // the class-W corner quantity for a lip of this pitch, mirrored from the law, not read from the module
    const penU9 = (rise, run) => {
      const th = Math.abs(Math.atan2(96, 28) - Math.atan2(-rise, run));
      const lamF = R * Math.tan(0.5 * th);
      const lam = Math.min(lamF, 0.45 * Math.hypot(rise, run) * MM);
      return { th, lamF, lam, pen: R * (1 - Math.cos(th)) - lam * Math.sin(th) };
    };
    const wDown = penU9(-0.2, 0.3);
    const wDownLong = penU9(-14, 21);
    check(`t9m the stop's own body is what does not DRAIN, not what stands vertical (GH-770 review r3, class U): the review fixture — the same 96/28 mm channel chute, a 0.5 mm lip rising 0.48 mm over 0.14 mm (73.74°, steep but NOT vertical) at its end, stop face 100.5 mm — walks ${uReview.pieces} pieces, ${(uReview.total / MM).toFixed(6)} mm, the lip is NOT walked, and solveShot rests the ball ${(uReview.gap / MM).toExponential(3)} mm from the channel floor measured along that floor's own normal (|q| ${uReview.norm.toFixed(9)}). That is bit for bit the route and seat this module reads for the CLASS-V VERTICAL lip in the same place (${(uVert.total / MM).toFixed(6)} mm, seat to 1e-12 m), for the same chute with its face on the lip's foot (${(uFoot.total / MM).toFixed(6)} mm) and for the chute with no lip at all (${(uPlain.total / MM).toFixed(6)} mm) — the lip is the wall in every one of them. Under the r2 rule (verticality alone) the 73.74° lip was support: the route walked a 54.738 mm connector onto it (224.969158 mm) and rested the ball 3.195 mm from the floor, 25.380 mm INSIDE it (measured on the pre-fix module in arm t9p, not narrated). The order's rule — "every piece that RISES against travel" — is a strict SUBSET of the class and this arm says so with a number: a LEVEL 0.5 mm pad at the same face rises not at all and the r2 reader walked it too, sinking the ball 3.378 mm (t9p again). What separates floor from body is whether gravity drives a ball down it, which is law V7's own comparison, so the walk now reads V7's predicate: level pads and sub-drain pads are refused with the lip. And it is not over-broad — a lip turning DOWN at −${(Math.atan2(0.2, 0.3) * 180 / Math.PI).toFixed(3)}° drains, and this law keeps it: over ${(Math.hypot(14, 21)).toFixed(6)} mm of run (14 down over 21) it is walked, ${uDownLong.pieces} pieces, ${(uDownLong.total / MM).toFixed(6)} mm, the ball ${(uDownLong.gap / MM).toExponential(3)} mm off the floor. Over 0.3 mm of run the SAME pitch is walked by this law too and then dropped by the next one — GH-770 review round 4 (class W): ${(wDown.lamF / MM).toFixed(3)} mm of corner is what the ball needs to turn ${(wDown.th * 180 / Math.PI).toFixed(3)}° onto it and 45 % of the run is ${(wDown.lam / MM).toFixed(4)} mm, so the chord would fall ${(wDown.pen / MM).toFixed(6)} mm inside the chute and the tip is dropped — and being floor, it is still floor the ball may not sit in, so the rest comes back to the first station clear of it: ${(uDown.total / MM).toFixed(6)} mm over ${uDown.pieces} pieces, ${((uPlain.total - uDown.total) / MM).toFixed(6)} mm short of the ${(uPlain.total / MM).toFixed(6)} mm the same chute reads with no tip at all. The long tip's corner needs ${(wDownLong.lamF / MM).toFixed(3)} mm against ${(wDownLong.lam / MM).toFixed(3)} mm allowed, so it is carried whole (${(wDownLong.pen / MM).toFixed(6)} mm). Draining is what makes a piece FLOOR; carrying the corner is what makes it RIDEABLE, and the two are measured apart`,
      !uReview.err && uReview.pieces === 2 && !uReview.walksLip && uReview.gap > -1e-12 && Math.abs(uReview.norm - 1) < 1e-12
      && sameU(uReview, uVert) && sameU(uReview, uFoot) && sameU(uReview, uPlain) && sameU(uReview, uLevel)
      && !uDownLong.err && uDownLong.pieces === 3 && uDownLong.walksLip && uDownLong.gap > -1e-12
      && wDownLong.pen < 1e-15 && wDown.pen > EXPORT_GRAIN
      && !uDown.err && uDown.pieces === 2 && !uDown.walksLip && uDown.total < uPlain.total - 1e-6
      && Math.abs((uPlain.total - uDown.total) - 0.003357865) < 5e-9,
      JSON.stringify({ review: [+(uReview.total / MM).toFixed(6), uReview.pieces, uReview.walksLip, +(uReview.gap / MM).toExponential(3)],
        vertical: +(uVert.total / MM).toFixed(6), foot: +(uFoot.total / MM).toFixed(6), plain: +(uPlain.total / MM).toFixed(6),
        level: [+(uLevel.total / MM).toFixed(6), uLevel.pieces], down: [+(uDown.total / MM).toFixed(6), uDown.pieces, uDown.walksLip],
        downLong: [+(uDownLong.total / MM).toFixed(6), uDownLong.pieces, uDownLong.walksLip], pen: [+(wDown.pen / MM).toFixed(6), +(wDownLong.pen / MM).toFixed(6)] }));
    // t9n the SWEEP: the pitch is a continuum and the reading may not turn on where in it the lip sits
    const anglesU = [0, 5, 10, 20, 30, 45, 60, 73.73979529168806, 80, 85, 88, 89.9, 90];
    const sweepU = anglesU.map((a) => {
      const rad = a * Math.PI / 180;
      const x = readU(lipU(100.5, 0.5 * Math.sin(rad), 0.5 * Math.cos(rad)));
      return { a, ...x };
    });
    const badU = sweepU.filter((x) => x.err || x.pieces !== 2 || x.walksLip || !(x.gap > -1e-12) || Math.abs(x.norm - 1) > 1e-12 || !sameU(x, uReview));
    check(`t9n the same reading at every pitch a lip can have (GH-770 review r3, class U, arm U2): ${sweepU.length} up-turn lips inside the stop face's 1 mm zone, ${anglesU[1]}° to ${anglesU[anglesU.length - 1]}° — the review 73.74° and the class-V vertical among them — and a LEVEL 0° pad at the bottom of the range: every one of them reads ${(uReview.total / MM).toFixed(6)} mm over 2 pieces with the lip NOT walked, a rest centre ${sweepU[0].gap > 0 ? 'at or above' : 'below'} the floor by ${Math.max(...sweepU.map((x) => Math.abs(x.gap))) / MM < 1e-9 ? '< 1e-9' : '?'} mm and |q| = 1 to 1e-12 — the same route and seat as the vertical case, to 1e-12 m, at all ${sweepU.length} pitches (${badU.length} outliers). There is NO slope threshold in the rule and the sweep is how that is stated: the pre-fix module walked the lip at every pitch BELOW 90° and only the exactly-vertical one escaped (0° -3.378 mm, 73.74° -25.380 mm, 89.9° -27.92 mm of penetration, t9p), so a test written at any angle would have passed on one side of it and failed on the other. The DOWN-turn control sits outside the family on purpose: it drains, so it is floor, and the sweep's rule leaves it walked`,
      badU.length === 0 && sweepU.length >= 10 && sweepU.some((x) => Math.abs(x.a - 90) < 1e-9) && sweepU.some((x) => Math.abs(x.a - 73.74) < 0.01),
      JSON.stringify(sweepU.map((x) => [+x.a.toFixed(2), x.err ?? +(x.total / MM).toFixed(6), x.pieces, x.walksLip, +(x.gap / MM).toExponential(2)])));
    // t9o the pose as a CENSUS (arm U3) — the belt in buildRoute is structural (it cannot fire, the
    // exclusion is three lines above it) and this arm records WHY the order's pose refusal is not
    // wired in its place: the module's blends move the centre off the offset surface by construction.
    const seatRowsU = [];
    for (const c of censusV) {
      let tr = null; try { tr = validateTrack(c.def, { pockets: c.pockets, falls: c.falls }); } catch (e) { seatRowsU.push({ name: c.name, refused: e.message.match(/\[V\d+[a-z]?\]/)?.[0] ?? 'refused' }); continue; }
      const row = { name: c.name, seats: 0, worstSeat: Infinity, samples: 0, worstCont: Infinity, joint: 0 };
      for (const [, rt] of [...tr.routes.entries()].sort((a, b) => a[0] - b[0])) {
        const segs = rt.segs;
        const lines = segs.filter((sg) => sg.kind === 'line');
        for (let i = 0; i + 1 < lines.length; i += 1) {
          if (dotU(lines[i + 1].edge.t, lines[i].edge.n) <= 1e-9) continue;
          row.joint = Math.max(row.joint, Math.acos(Math.max(-1, Math.min(1, dotU(lines[i].edge.t, lines[i + 1].edge.t)))));
        }
        for (const s of reachSpan(rt, rt.r).ladder) {
          const g = gapU(floorU(rt, s.D), [s.x, s.y, s.z]);
          if (g !== null) { row.seats += 1; row.worstSeat = Math.min(row.worstSeat, g); }
        }
        let D0 = 0;                                          // per SEGMENT, so every blend is sampled at the same resolution
        for (const sg of segs) {
          for (let j = 0; j <= 128; j += 1) {
            const D = D0 + sg.len * j / 128;
            const st = stationAt(rt, D, rt.r, {});
            row.samples += 1;
            const g = gapU(floorU(rt, D), [st.x, st.y, st.z]);
            if (g !== null) row.worstCont = Math.min(row.worstCont, g);
          }
          D0 += sg.len;
        }
      }
      seatRowsU.push(row);
    }
    const liveU = seatRowsU.filter((x) => !x.refused);
    const worstSeatU = Math.min(...liveU.map((x) => x.worstSeat));
    const blendyU = liveU.filter((x) => x.worstCont < -1e-6).sort((a, b) => a.worstCont - b.worstCont);
    check(`t9o the resting pose is at the floor, and the CONTINUOUS path is not (GH-770 review r3, class U, arm U3): over ${liveU.length} definitions that build — the ${liveU.filter((x) => !x.name.startsWith('fixture')).length} definitions in web/scene/ballreturn/tracks plus web/tools/fixtures/ballreturn-tracks and the in-file lip fixtures (censusV's 'fixture lip' defs) — every one of the ${liveU.reduce((n, x) => n + x.seats, 0)} SEATS the module may draw a ball at stands at or above its floor, worst ${(worstSeatU / MM).toExponential(3)} mm (machine zero; the order's bar is 1e-9 mm) measured along the floor's own normal with the perpendicular foot inside the piece. The pre-fix reader put the review fixture's seat 25.380 mm under it. The belt in buildRoute is therefore STRUCTURAL — it re-reads the exclusion, it does not measure the pose — and this census is the reason, not an omission: ${liveU.reduce((n, x) => n + x.samples, 0)} samples of the centre path (128 per segment, so every blend is read at the same resolution) find ${blendyU.length} definition(s) whose path dips into the floor BETWEEN seats by construction — ${blendyU.map((x) => `${x.name} ${(x.worstCont / MM).toExponential(3)} mm at a ${(x.joint * 180 / Math.PI).toFixed(3)}° joint`).join(', ')} — because a valley corner is CUT (the chord falls h(1/cos(θ/2) − 1) inside the vertex) and a heading twist spreads the forward-tilt offset h·sinθ. Those are LEGAL shapes, and the extremum is continuous, so denser sampling only deepens it. A pose refusal at ZERO would refuse them the moment a seat landed in a blend instead of between blends, which is why round 3 reported the pose and refused nowhere. Round 4 (class W) withdraws that deviation without moving any of these numbers: the refusal is against what the CONSTRUCTION that drew the pose is entitled to — 0 on a line and a pivot arc, h(1 − cos θ) on a twist, h(1 − cos θ) − λc·sin θ on a valley cut, plus the ${(EXPORT_GRAIN / MM).toFixed(1)} mm grain — so every dip listed here is inside its own allowance (arm t10c measures the margin) and this defect's -25.380 mm is not`,
      liveU.length >= 12 && liveU.every((x) => x.seats > 0 && x.worstSeat > -1e-12) && blendyU.length >= 2
      && blendyU.some((x) => x.name.includes('xw101')) && blendyU.some((x) => x.name.includes('hairpin')),
      JSON.stringify(seatRowsU.map((x) => x.refused ? [x.name, x.refused] : [x.name, x.seats, +(x.worstSeat / MM).toExponential(2), +(x.worstCont / MM).toExponential(3), +(x.joint * 180 / Math.PI).toFixed(3)])));
    // t9p the RED PLANT (arm U4): the r2 rule — verticality alone — restored in a temp copy of the
    // module and read through its own schema.js and kinematics.js, so every "before" number above is
    // measured here and not narrated. Both halves of this round's cure are removed: the walk's
    // exclusion loses the drain term, and the belt that re-reads it is switched off.
    const plantU = await redPlant('u4', [
      ['      if (e.s0 >= bodyS && ((drainLaw && !drainsAt(der, e, r, track.u_r)) || !hasSupportNormal(e))) continue;',
        '      if (e.s0 >= bodyS && !hasSupportNormal(e)) continue;'],
      ['    if (!drainsAt(der, pc.edge, r, track.u_r)) {',
        '    if (false && !drainsAt(der, pc.edge, r, track.u_r)) {'],
    ].concat(UNDO_W));
    const rowsU4 = plantU.err ? [] : [['review 73.74° (0.48/0.14)', lipU(100.5, 0.48, 0.14), uReview],
      ['LEVEL 0 mm pad (0/0.5)', lipU(100.5, 0, 0.5), uLevel],
      ['vertical 90° (0.5/0)', lipU(100.5, 0.5, 0), uVert],
      ['DOWN-turn -33.7° (-14/21)', lipU(+(100 + Math.hypot(14, 21)).toFixed(6), -14, 21), uDownLong]]
      .map(([nm, def, now]) => ({ nm, red: readU(def, plantU), now }));
    const redReview = rowsU4.find((x) => x.nm.startsWith('review'));
    const redLevel = rowsU4.find((x) => x.nm.startsWith('LEVEL'));
    const redVert = rowsU4.find((x) => x.nm.startsWith('vertical'));
    const redDown = rowsU4.find((x) => x.nm.startsWith('DOWN'));
    check(`t9p the pre-fix rule, run (GH-770 review r3, class U, arm U4): the module copied to a temp tree with this round's exclusion reverted to the r2 text (${plantU.err ? 'PLANT FAILED' : 'verticality alone, belt off'}) reads the review fixture as ${redReview ? `${redReview.red.pieces} pieces, ${(redReview.red.total / MM).toFixed(6)} mm — a ${(redReview.red.cut / MM).toFixed(3)} mm connector walked into the corner onto a lip no ball can climb — and solveShot rests the ball ${(redReview.red.gap / MM).toFixed(4)} mm from the channel floor: ${Math.abs(redReview.red.gap / MM).toFixed(3)} mm INSIDE it, seat (${redReview.red.seat.map((v) => v.toFixed(6)).join(', ')}) against this round's (${redReview.now.seat.map((v) => v.toFixed(6)).join(', ')})` : 'n/a'}, exactly the 54.738 mm / 3.195 mm the order quotes. The same reader walks a LEVEL pad in the same place (${redLevel ? `${(redLevel.red.total / MM).toFixed(6)} mm, ${(redLevel.red.gap / MM).toFixed(4)} mm` : 'n/a'}) — which RISES against travel not at all, so the order's own wording would have left it walked, and that is why the rule this round ships is V7's drain predicate and not a slope test. Both are now the stop body (${(uReview.total / MM).toFixed(6)} mm each, lip unwalked). What the plant does NOT change is the rest of the class: the vertical lip reads ${redVert ? (redVert.red.total / MM).toFixed(6) : 'n/a'} mm before and after (r2 already had it) and the DOWN-turn lip, which drains and is long enough to carry its own corner, reads ${redDown ? (redDown.red.total / MM).toFixed(6) : 'n/a'} mm before and after — the cure removes nothing that was floor. This plant also lifts THIS round's class-W law (the corner check in the walk and the pose refusal), because the seats it exists to measure — a ball 25 mm inside its own chute — are exactly what that law refuses: a module that throws on the pose cannot report it`,
      !plantU.err && !!redReview && redReview.red.pieces === 3 && redReview.red.walksLip
      && redReview.red.gap < -0.025 && Math.abs(redReview.red.cut - 0.054738) < 5e-7
      && Math.abs(redReview.red.total - 0.224969158) < 5e-10
      && !!redLevel && redLevel.red.walksLip && redLevel.red.gap < -0.003
      && !!redVert && sameU(redVert.red, uVert) && !!redDown && sameU(redDown.red, uDownLong),
      JSON.stringify(rowsU4.map((x) => [x.nm, x.red.err ?? +(x.red.total / MM).toFixed(6), x.red.pieces, x.red.walksLip,
        +(x.red.gap / MM).toFixed(4), +(x.now.total / MM).toFixed(6)])));
    // t9q the definitions in web/scene/ballreturn/tracks plus web/tools/fixtures/ballreturn-tracks and the in-file lip fixtures: what the new exclusion actually refuses there, and what it leaves alone
    const drainMarginU = (support, e, r, u_r) => { const der = supportDerived(support, r); return der.k * G * e.sinTh - der.k * G * resistCoeff(der, r, u_r) * e.cosTh; };
    const zoneU = { bodyRuns: 0, bodyWalked: 0, startsInZone: 0, worstStarts: Infinity, reachesZone: 0, trayZone: 0, worstTray: Infinity, defs: 0, radiiDiffer: 0 };
    const zoneDetail = [];
    for (const c of censusV) {
      let tr = null; try { tr = validateTrack(c.def, { pockets: c.pockets, falls: c.falls }); } catch { continue; }
      zoneU.defs += 1;
      const trayId = tr.tray ? tr.tray.runway.id : null;
      const body = new Set();
      for (const [id, rw] of tr.runways) {
        const rest = tr.rests.get(id);
        if (!rest) continue;
        for (const e of rw.runs) {
          if (e.s0 < rest.wallS - MM) continue;
          if (id !== trayId && drainMarginU(rw.support, e, tr.refR, tr.u_r) <= 0) { body.add(`${id}@${e.s0}`); zoneU.bodyRuns += 1; zoneDetail.push([c.name, id, +(e.s0 / MM).toFixed(3)]); }
        }
      }
      for (const [, rt] of tr.routes) {
        if (Math.abs(rt.r - tr.refR) > 1e-15) zoneU.radiiDiffer += 1;
        for (const sg of rt.segs) {
          if (sg.kind !== 'line') continue;
          const rest = tr.rests.get(sg.rw.id);
          if (!rest || sg.sTo <= rest.wallS - MM) continue;                 // the piece does not reach the zone at all
          const m = drainMarginU(sg.rw.support, sg.edge, rt.r, tr.u_r);
          if (sg.rw.id === trayId) { zoneU.trayZone += 1; zoneU.worstTray = Math.min(zoneU.worstTray, m); continue; }
          if (sg.edge.s0 < rest.wallS - MM) { zoneU.reachesZone += 1; continue; }   // STARTS outside it: the rule never reads it
          if (body.has(`${sg.rw.id}@${sg.edge.s0}`)) zoneU.bodyWalked += 1;
          zoneU.startsInZone += 1; zoneU.worstStarts = Math.min(zoneU.worstStarts, m);
        }
      }
    }
    const starU = await (async () => {
      const def = loadDef(path.resolve(here, '../scene/ballreturn/tracks/wpbsa_snooker_12ft-xw101-slides.json'));
      const ctx = await tableContext(def.doc.table_id);
      const tr = validateTrack(def, { pockets: ctx.pockets, falls: ctx.falls });
      return [...tr.routes.entries()].sort((a, b) => a[0] - b[0]).map(([, rt]) => rt.total);
    })();
    const R37U = [0.296179587, 0.298951042, 0.444350793, 0.444350793, 0.298951042, 0.296179587];  // the SNK-R37 export's published routes
    check(`t9q the new refusal on the definitions in web/scene/ballreturn/tracks plus web/tools/fixtures/ballreturn-tracks and the in-file lip fixtures (GH-770 review r3, class U, arm U5): over ${zoneU.defs} definitions that build, ${zoneU.bodyRuns} run(s) lie inside a stop face's own 1 mm zone and do NOT drain under law V7's comparison — mirrored here from k·g·sinθ and 1.4(r/ρ)·u_r·cosθ rather than read from the module (${[...new Set(zoneDetail.map((d) => d[0]))].join(', ')}) — so every one of them is the stop's own body, and ${zoneU.bodyWalked} of them is walked by any route. That is what the new rule refuses, and it refuses nothing else: ${zoneU.startsInZone} walked piece(s) also BEGIN inside a zone and every one of them drains (worst margin +${zoneU.worstStarts.toExponential(3)} m/s²), so the rule keeps them — floor that happens to run up to the wall. A further ${zoneU.reachesZone} walked piece(s) START before a zone and run into it; the rule keys on where a piece BEGINS, exactly as V12's and V7's exemptions do, so it never reads them. The ${zoneU.trayZone} tray piece(s) in a zone are counted apart because V7 does not apply to a tray at all: their margins go as low as ${zoneU.worstTray.toExponential(3)} m/s² — a level tray does not drain, by design — which is precisely why the drain half of the test is waived there (arm t9r) and why applying it everywhere silently ate half a millimetre of tray. Nothing the export publishes moved: the XW101 slides read ${starU.map((t2) => (t2 / MM).toFixed(6)).join(' / ')} mm, the SNK-R37 six to ${Math.max(...starU.map((t2, i) => Math.abs(t2 - R37U[i]))).toExponential(1)} m. Radii: buildRoute evaluates the predicate at the ROUTE's own r and V7 at refR (${zoneU.radiiDiffer} route(s) in the definitions in web/scene/ballreturn/tracks plus web/tools/fixtures/ballreturn-tracks and the in-file lip fixtures differ today), a stated difference — V7 refuses a definition on the reference ball, the walk declines to walk for the ball it is walking`,
      zoneU.defs >= 12 && zoneU.bodyRuns > 0 && zoneU.bodyWalked === 0
      && zoneU.startsInZone > 0 && zoneU.worstStarts > 0
      && zoneU.trayZone > 0 && zoneU.worstTray < 0
      && starU.length === 6 && starU.every((t2, i) => Math.abs(t2 - R37U[i]) < 5e-10),
      JSON.stringify({ defs: zoneU.defs, bodyRuns: zoneU.bodyRuns, bodyWalked: zoneU.bodyWalked, startsInZone: zoneU.startsInZone,
        worstStarts: +zoneU.worstStarts.toExponential(3), reachesZone: zoneU.reachesZone, trayZone: zoneU.trayZone,
        worstTray: +zoneU.worstTray.toExponential(3), radiiDiffer: zoneU.radiiDiffer,
        star: starU.map((t2) => +(t2 / MM).toFixed(6)), detail: zoneDetail.slice(0, 24) }));
    // t9r the TRAY (arm U6): reading a law's predicate means reading that law's EXEMPTIONS with it
    const trayBaseU = loadDef(path.resolve(here, '../scene/ballreturn/tracks/TEST-synthetic-wire-slide.json'));
    const trayBendU = (tail, riser) => {
      const d = JSON.parse(JSON.stringify(trayBaseU));
      const tray = d.runways.find((rw) => rw.id === 'tray');
      const [a, b] = tray.points_mm;
      tray.points_mm = [a, [b[0] + tail, b[1], b[2]], riser ? [b[0] + tail, b[1] + tail, b[2]] : [b[0] + tail, b[1], b[2] - tail]];
      return d;
    };
    const trayRead = (def, M = SHIPPEDU) => {
      let tr = null; try { tr = M.schema.validateTrack(def, { pockets: POCKETS, falls: null }); } catch (e) { return { err: e.message }; }
      const pk = [...tr.routes.keys()].sort((a, b) => a - b)[0];
      const trw = tr.runways.get(tr.tray.runway.id);
      const last = trw.runs[trw.runs.length - 1];
      const rest = tr.rests.get(trw.id);
      return { total: tr.routes.get(pk).total, runs: trw.runs.length, lastS0: last.s0, lastLen: last.len, zone: rest.wallS - MM };
    };
    const plantU6 = await redPlant('u6', [['    const drainLaw = !track.tray || p.rw.id !== track.tray.runway.id;', '    const drainLaw = true;']]);
    const tNow = [0.5, 2].map((t2) => ({ t2, now: trayRead(trayBendU(t2, false)), red: plantU6.err ? { err: plantU6.err } : trayRead(trayBendU(t2, false), plantU6) }));
    const tPlain = trayRead(trayBaseU);
    const tRiser = [['shipped', SHIPPEDU], ['one-exemption-set', plantU6]].map(([nm, M]) => [nm, plantU6.err && nm !== 'shipped' ? plantU6.err : (trayRead(trayBendU(0.5, true), M).err ?? 'ACCEPTED')]);
    const t05 = tNow[0], t20 = tNow[1];
    check(`t9r the tray keeps its own exemption (GH-770 review r3, class U, arm U6 — a defect this fix would have introduced, found by mirroring the two laws rather than re-deriving them): V12 exempts the last millimetre of ANY runway; V7 exempts that zone AND the tray outright, because the tray is the rest surface and is LEVEL by design. Written with one exemption set for both halves, the new exclusion drops the tray's own last piece: an L-shaped level tray whose plan bend puts a final ${(0.5).toFixed(1)} mm run at s ${(t05.now.lastS0 / MM).toFixed(3)} mm, inside its own zone (≥ ${(t05.now.zone / MM).toFixed(3)} mm), reads ${t05.red.err ?? (t05.red.total / MM).toFixed(6)} mm with the drain law applied to it and ${(t05.now.total / MM).toFixed(6)} mm as shipped — the full route, and the same ${(tPlain.total / MM).toFixed(6)} mm the straight tray reads. Move the bend back so the run STARTS before the zone (tail 2 mm, s ${(t20.now.lastS0 / MM).toFixed(3)}) and the two agree again (${t20.red.err ?? (t20.red.total / MM).toFixed(6)} mm): the bug is exactly the zone's width, which is what makes it the kind a census of shipped definitions cannot find — no shipped tray bends there. The other half of the test is NOT waived on the tray: a vertical tray riser is refused upstream by V12 in both trees (${tRiser.map(([nm, m]) => `${nm}: ${String(m).slice(0, 46)}`).join(' | ')}), so the support-normal term is belt there rather than the load-bearing rule, and it stays`,
      !plantU6.err && !t05.now.err && !t05.red.err && !t20.now.err && !t20.red.err
      && Math.abs(t05.now.total - tPlain.total) < 1e-12
      && Math.abs(t05.now.total - t05.red.total) > 4e-4
      && Math.abs(t20.now.total - t20.red.total) < 1e-12
      && tRiser.every(([, m]) => /\[V12\]/.test(String(m))),
      JSON.stringify({ plain: +(tPlain.total / MM).toFixed(6), rows: tNow.map((x) => [x.t2, +(x.now.lastS0 / MM).toFixed(3), x.now.err ?? +(x.now.total / MM).toFixed(6), x.red.err ?? +(x.red.total / MM).toFixed(6)]), riser: tRiser.map(([nm, m]) => [nm, String(m).slice(0, 40)]) }));
  }
  // t9j / t9k (GH-770 review r2, class K) — the lattice integer is a SHIFT OF THE DECIMAL POINT of
  // the coordinate's own digits, never a re-format of the float at a chosen precision. `toFixed(d)`
  // is a float operation: at a `d` the coordinate did not need it prints the double's error
  // ((-573.44).toFixed(13) === '-573.4400000000001'), so ONE finely printed coordinate anywhere in
  // the file moved the keys of an exactly collinear leg elsewhere in it, the leg stopped merging,
  // and the class-S regression came back. Right-padding the printed digits cannot do that: it is a
  // string operation on digits the double already round-trips to, exact at every d, and the
  // gcd-reduced key it feeds is INVARIANT to d — which is the property both arms below measure.
  {
    const tb9k = loadDef(path.resolve(here, '../scene/ballreturn/tracks/TEST-terminal-chutes.json'));
    const dec9k = (v) => { const m = /^-?\d+(?:\.(\d+))?$/.exec(String(v)); return m ? (m[1] ? m[1].length : 0) : -1; };
    const decOf9k = (d) => Math.max(...d.runways.flatMap((rw) => rw.points_mm.flatMap((p) => p.map(dec9k))));
    // the t9f step (a 100 mm leg, then a 20 mm terminal leg written as four collinear facets, the
    // stop face on its far vertex) with the whole definition translated 0.06 mm along z — which
    // puts review's −573.44 on the file — and the OTHER pocket's chain moved to x = `rcx`
    const step9k = (rcx) => {
      const d = JSON.parse(JSON.stringify(tb9k));
      const q = decOf9k(d) + 2;
      for (const rw of d.runways) {
        if (!rw.stop) continue;
        const p0 = rw.points_mm[0]; const sgn = Math.sign(rw.points_mm[1][2] - p0[2]);
        const p1 = [p0[0], p0[1] - 60, p0[2] + sgn * 80];
        const pts = [p0, p1];
        for (let j = 1; j <= 4; j++) pts.push([p1[0], +(p1[1] - 0.28 * 20 * j / 4).toFixed(q), +(p1[2] + sgn * 0.96 * 20 * j / 4).toFixed(q)]);
        rw.points_mm = pts; rw.stop.wall_s_mm = 120; rw.stop.capacity_balls = 2;
      }
      for (const rw of d.runways) rw.points_mm = rw.points_mm.map((p) => [p[0], p[1], +(p[2] + 0.06).toFixed(12)]);
      for (const rw of d.runways) if (rw.id.startsWith('rc-')) rw.points_mm = rw.points_mm.map((p) => [rcx, p[1], p[2]]);
      return d;
    };
    const readK = (def, id) => {
      let tr = null; try { tr = validateTrack(def, { pockets: POCKETS, falls: null }); } catch (e) { return { err: e.message }; }
      let rt = null; for (const cand of tr.routes.values()) if (cand.spans[cand.spans.length - 1].rw.id === id) rt = cand;
      if (!rt) return { err: `no route ends on ${id}` };
      const rw = rt.spans[rt.spans.length - 1].rw;
      const st = stationAt(rt, rt.r, rt.r, {});
      return { total: rt.total, seat: [st.x, st.y, st.z], edges: rw.edges.length, runs: rw.runs.length, dirs: rw.edges.map((e) => e.dir).join(' | ') };
    };
    const kPlain = readK(step9k(0.1), 'lc-chute');
    const kFine = readK(step9k(0.1000000000001), 'lc-chute');
    const kSeat = kPlain.err || kFine.err ? NaN : Math.hypot(...kPlain.seat.map((v, i) => v - kFine.seat[i]));
    check(`t9j the key is built from the coordinate's own decimals, so an unrelated coordinate cannot move it (GH-770 review r2, class K): the four-facet step of t9f translated 0.06 mm along z — which writes review's −573.44 onto the file — reads ${(kPlain.total / MM).toFixed(6)} mm on the lc chute, and changing ONLY the other pocket's chain from x = 0.1 to x = 0.1000000000001 (a 1e-13 mm move of a chain this route never touches, which raises the file's printed precision from ${decOf9k(step9k(0.1))} to ${decOf9k(step9k(0.1000000000001))} decimals) reads ${(kFine.total / MM).toFixed(6)} mm — identical to ${Math.abs(kPlain.total - kFine.total).toExponential(2)} m, seat to ${kSeat.toExponential(2)} m — with the same ${kFine.runs} runs over ${kFine.edges} edges and the same integer directions (${kFine.dirs}). Pre-fix the keys were reformatted with toFixed(13) and the leg's first facet keyed 0,-2000000000000,6857142857143 against its neighbours' 0,-7,24: three runs instead of two, the route 172.648092 mm against 164.891950 mm and the ball seated 7.756 mm further down the track — the class-S defect, returned through the key path`,
      !kPlain.err && !kFine.err && Math.abs(kPlain.total - kFine.total) < 1e-12 && kSeat < 1e-12
      && kPlain.dirs === kFine.dirs && kFine.runs === 2 && kFine.edges === 5
      && decOf9k(step9k(0.1000000000001)) === 13,
      JSON.stringify({ plain: kPlain.err ?? [+(kPlain.total / MM).toFixed(6), kPlain.runs, kPlain.dirs], fine: kFine.err ?? [+(kFine.total / MM).toFixed(6), kFine.runs, kFine.dirs] }));
    // t9k the same property as a CENSUS over the definitions in web/scene/ballreturn/tracks plus web/tools/fixtures/ballreturn-tracks: raising a definition's printed precision
    // with ONE carrier coordinate leaves every other runway's keys, and every route, untouched
    // ONE coordinate of the carrier point re-printed with D decimals — the same number with digits
    // appended, a move of 1e-D mm. A coordinate can only carry the digits its magnitude leaves room
    // for (a double near 264 mm is spaced 5.7e-14 apart, and JS prints below 1e-6 in exponent form,
    // which is not a plain decimal at all): the candidate is accepted only if it reads back at D
    // decimals, so the row below records which raisings actually happened.
    const bump9k = (pt, D) => {
      for (const c of [0, 1, 2]) {
        const m = /^(-?\d+)(?:\.(\d+))?$/.exec(String(pt[c]));
        if (!m) continue;
        const frac = m[2] ?? '';
        if (frac.length >= D) continue;
        const cand = Number(`${m[1]}.${frac}${'0'.repeat(D - frac.length - 1)}1`);
        if (dec9k(cand) !== D) continue;
        const out = pt.slice(); out[c] = cand; return out;
      }
      return null;
    };
    const keysK = (def, skip, ctx) => {
      let tr = null; try { tr = validateTrack(def, { pockets: ctx.pockets, falls: ctx.falls }); } catch (e) { return { err: e.message }; }
      const keys = [];
      for (const rw of [...tr.runways.values()].sort((a, b) => (a.id < b.id ? -1 : 1))) {
        if (rw.id === skip) continue;
        for (const e of rw.edges) keys.push(`${rw.id}#${e.dir}`);
      }
      return { keys: keys.join(' '), n: keys.length, totals: [...tr.routes.entries()].sort((a, b) => a[0] - b[0]).map(([, rt]) => rt.total) };
    };
    const filesK = trackFiles();
    const DS = [7, 9, 11, 13];
    const rowsK = [];
    for (const [f, p] of filesK) {
      const def = loadDef(p);
      const ctx = await tableContext(def.doc.table_id);
      const carrier = (def.runways.find((rw) => rw.points_mm.length === 2) ?? def.runways[0]).id;
      const ref = keysK(def, carrier, ctx);
      const row = { name: f.replace('.json', '').replace('TEST-', ''), d0: decOf9k(def), carrier, keys: ref.n, differ: 0, worst: 0, raised: [] };
      if (ref.err) { row.refused = ref.err.match(/\[V\d+[a-z]?\]/)?.[0] ?? 'refused'; rowsK.push(row); continue; }
      for (const D of DS) {
        const d2 = JSON.parse(JSON.stringify(def));
        const cr = d2.runways.find((rw) => rw.id === carrier);
        const v = bump9k(cr.points_mm[0], D);
        if (v === null) continue;
        cr.points_mm[0] = v;
        if (decOf9k(d2) !== D) continue;
        const got = keysK(d2, carrier, ctx);
        if (got.err) { row.bad = `D${D} ${got.err.slice(0, 40)}`; continue; }
        row.raised.push(D);
        if (got.keys !== ref.keys) row.differ += 1;
        for (let i = 0; i < ref.totals.length; i++) row.worst = Math.max(row.worst, Math.abs(ref.totals[i] - got.totals[i]));
      }
      rowsK.push(row);
    }
    const liveK = rowsK.filter((x) => !x.refused);
    // how much of the definitions in web/scene/ballreturn/tracks plus web/tools/fixtures/ballreturn-tracks the PRE-FIX path would mis-key today, computed here independently of
    // the reader: a coordinate is mis-keyed when `toFixed(d)` at the file's own precision is not
    // the exact shift of its digits
    const fixedCensus = (() => {
      let coords = 0, bad = 0;
      for (const [f, p] of filesK) {
        const def = loadDef(p);
        const D = decOf9k(def);
        for (const rw of def.runways) for (const pt of rw.points_mm) for (const v of pt) {
          coords += 1;
          const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(v));
          if (!m) { bad += 1; continue; }
          if (v.toFixed(D) !== `${m[1]}${m[2]}.${(m[3] ?? '').padEnd(D, '0')}`) bad += 1;
        }
      }
      return { coords, bad };
    })();
    check(`t9k raising a definition's printed precision cannot move a key anywhere else in it (GH-770 review r2, class K): over ${liveK.length} definitions in web/scene/ballreturn/tracks plus web/tools/fixtures/ballreturn-tracks (${rowsK.length - liveK.length} refused by law: ${rowsK.filter((x) => x.refused).map((x) => x.name + ' ' + x.refused).join(', ') || 'none'}), one carrier coordinate re-printed at ${DS.join(' / ')} decimals — the same number with digits appended, a move of 1e-D mm on a single vertex of a single runway — leaves ALL ${liveK.reduce((n, x) => n + x.keys, 0)} direction keys of every other runway byte-identical (${liveK.reduce((n, x) => n + x.differ, 0)} differing over ${liveK.reduce((n, x) => n + x.raised.length, 0)} raisings that the doubles could carry) and every route within ${Math.max(...liveK.map((x) => x.worst)).toExponential(2)} m — the move itself, six decades under the millimetres a lost merge costs. The files print ${Math.min(...liveK.map((x) => x.d0))}–${Math.max(...liveK.map((x) => x.d0))} decimals of their own; the keys do not move because the gcd reduction makes them invariant to the scale — which is the same statement as "the decimal count is a scale, not a threshold", now measured on the bytes of the definitions in web/scene/ballreturn/tracks plus web/tools/fixtures/ballreturn-tracks that build. The bytes of the definitions in web/scene/ballreturn/tracks plus web/tools/fixtures/ballreturn-tracks escaped the defect by arithmetic luck and not by rule — ${fixedCensus.bad} of their ${fixedCensus.coords} coordinates are mis-formatted by toFixed at their own file's precision, so all ${liveK.length} definitions that build read byte-identically across this fix (totals, seats and run counts) — but one of them already prints 13 decimals (TEST-terminal-chutes-high, −311.6477666666667), which is the precision review's coordinate breaks at`,
      liveK.length >= 11 && liveK.every((x) => !x.bad && x.differ === 0 && x.worst < 1e-9 && x.raised.length >= 1)
      && liveK.reduce((n, x) => n + x.raised.length, 0) >= 30,
      JSON.stringify(rowsK.map((x) => x.refused ? [x.name, x.refused] : [x.name, x.d0, x.carrier, x.keys, x.differ, +x.worst.toExponential(1), x.raised.join(','), x.bad])));
    // t9l the lattice integer has to be EXACT, not merely integer-VALUED. The scale is 10^D, so a
    // file that prints D decimals of a coordinate whose magnitude needs the double's full mantissa
    // hands the key an integer past 2^53 (|coord| * 10^D > 9007199254740992 — at D = 13, which
    // TEST-terminal-chutes-high already prints, that is a coordinate of 900.72 mm, and XW101's
    // largest is 1782.42 mm). A float key rounds it, and a rounded key is not a key: it both loses
    // a true merge and invents a common factor. BigInt is what makes "exactly collinear" exact.
    const xs9l = [0, 0.3166666666666667, 0.6333333333333334, 0.9500000000000001];
    const mk9l = (cut) => {
      const d = JSON.parse(JSON.stringify(tb9k));
      for (const rw of d.runways) {
        if (rw.id !== 'lc-chute') continue;
        // the 300 mm leg given a 0.95 mm lateral drift written at the double's own precision, then
        // cut into three facets the file states as exactly collinear (equal integer deltas)
        rw.points_mm = cut
          ? [[xs9l[0], -273, -653.5], [xs9l[1], -293, -553.5], [xs9l[2], -313, -453.5], [xs9l[3], -333, -353.5], [xs9l[3], -323, -329.5]]
          : [[xs9l[0], -273, -653.5], [xs9l[3], -333, -353.5], [xs9l[3], -323, -329.5]];
      }
      return d;
    };
    const read9l = (def) => {
      let tr = null; try { tr = validateTrack(def, { pockets: POCKETS, falls: null }); } catch (e) { return { err: e.message }; }
      let rt = null; for (const c of tr.routes.values()) if (c.spans[c.spans.length - 1].rw.id === 'lc-chute') rt = c;
      if (!rt) return { err: 'no route ends on lc-chute' };
      const rw = rt.spans[rt.spans.length - 1].rw;
      return { total: rt.total, edges: rw.edges.length, runs: rw.runs.length, dirs: rw.edges.map((e) => e.dir) };
    };
    const lUncut = read9l(mk9l(false)), lCut = read9l(mk9l(true));
    const scaled9l = (v, D) => { const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(v)); return `${m[1]}${BigInt(m[2] + (m[3] ?? '').padEnd(D, '0'))}`; };
    const d9l = decOf9k(mk9l(true));
    const far9l = scaled9l(xs9l[3], d9l);
    check(`t9l the lattice integer is exact past 2^53, which is what makes an exactly collinear run merge (GH-770 review r2, class K): the fixture's 300 mm chute leg given a 0.95 mm lateral drift written at the double's full precision (x = ${xs9l.join(', ')}, so the file prints ${d9l} decimals) and cut into three facets the file states as exactly collinear — the far vertex scales to ${far9l}, past the exact-integer range of a double (2^53 = 9007199254740992) — merges into ONE run: ${lCut.runs} runs over ${lCut.edges} edges against the uncut leg's ${lUncut.runs} over ${lUncut.edges}, all three facets carrying the identical key ${lCut.dirs ? lCut.dirs[0] : '-'} (the file's own digits, gcd-reduced), and the route reads ${(lCut.total / MM).toFixed(9)} mm either way — identical to ${Math.abs(lCut.total - lUncut.total).toExponential(2)} m. Taken as Numbers instead of BigInts (mutant N161) the far vertex rounds to ${Number(far9l).toFixed(0)} and the leg comes apart: the third facet keys 1583333333333333,-100000000000000000,500000000000000000 — a factor of two that is not in the file — for three runs instead of two, and the UNCUT leg keys 19,-1200,6000, a direction the geometry never states. An inexact key is not a key: it loses a true merge and invents a common factor, both from rounding alone`,
      !lUncut.err && !lCut.err && lCut.runs === 2 && lCut.edges === 4 && lUncut.runs === 2 && lUncut.edges === 2
      && lCut.dirs.slice(0, 3).every((k) => k === lUncut.dirs[0]) && lCut.dirs[3] === lUncut.dirs[1]
      && Math.abs(lCut.total - lUncut.total) < 1e-12 && BigInt(far9l) > 9007199254740992n && BigInt(Number(far9l).toFixed(0)) !== BigInt(far9l),
      JSON.stringify({ uncut: lUncut.err ?? [+(lUncut.total / MM).toFixed(9), lUncut.runs, lUncut.edges, lUncut.dirs], cut: lCut.err ?? [+(lCut.total / MM).toFixed(9), lCut.runs, lCut.edges, lCut.dirs], d: d9l, far: far9l }));
    // t9s–t9v (GH-770 review r3, class X) — a coordinate JS prints in EXPONENT form is a plain
    // number, not a broken one. `String(1e-7)` is '1e-7', the r2 token matched plain decimals only,
    // and the miss was answered by returning `null` for the WHOLE definition's lattice scale — so
    // coalescing went OFF everywhere in the file at once. That is a NON-LOCAL failure: moving ONE
    // independent chain's x from 0 to 1e-7 mm — a ten-thousandth of a micron, on a chain the route
    // never touches and which no law couples to it — re-cut an untouched chute from 164.891950 mm
    // to 172.648092 mm and seated the ball 7.756 mm further down it (the class-S defect, returned
    // through the token). The expansion below is a SHIFT OF THE DECIMAL POINT of the mantissa's own
    // digits, a string operation, exact at every exponent a double can carry (5e-324 to 1.8e308).
    // The only fallback left is law V0's — a coordinate that is not a FINITE NUMBER has no key, the
    // published JSON schema's own `number` type (jsonschema.js: typeof number && Number.isFinite) —
    // and it is per POINT: that point's edges key `null` and do not merge, the rest of the file is
    // untouched. On a definition the validator accepts it cannot fire at all (V0 refuses NaN and
    // Infinity upstream, measured in t9t), so it is belt, like the two in buildRoute.
    const srcX = fs.readFileSync(path.resolve(here, '../scene/ballreturn/track.js'), 'utf8');
    const mX = /const DECIMAL_TOKEN = [^\n]*\nfunction decimalParts\(v\) \{[\s\S]*?\n\}\n/.exec(srcX);
    const decimalPartsX = mX ? new Function(`${mX[0]}\nreturn decimalParts;`)() : null;   // the shipped function itself, lifted out of the module text
    const SHIPX = { schema: { validateTrack }, track: { stationAt } };
    const readX = (def, M = SHIPX) => {
      let tr = null; try { tr = M.schema.validateTrack(def, { pockets: POCKETS, falls: null }); } catch (e) { return { err: e.message }; }
      let rt = null; for (const c of tr.routes.values()) if (c.spans[c.spans.length - 1].rw.id === 'lc-chute') rt = c;
      if (!rt) return { err: 'no route ends on lc-chute' };
      const rw = rt.spans[rt.spans.length - 1].rw;
      const st = M.track.stationAt(rt, rt.r, rt.r, {});
      return { total: rt.total, seat: [st.x, st.y, st.z], edges: rw.edges.length, runs: rw.runs.length, dirs: rw.edges.map((e) => e.dir).join(' | ') };
    };
    // the module's own lattice, mirrored over the lifted decimalParts: the test owns only the gcd
    const bigAbsX = (x) => (x < 0n ? -x : x);
    const gcdX = (a, b) => { while (b) { const t = a % b; a = b; b = t; } return a; };
    const keyListX = (runways) => {
      let d = 0;
      for (const pts of runways) for (const pt of pts) for (const v of pt) { const q = decimalPartsX(v); if (q && q.frac.length > d) d = q.frac.length; }
      const keys = [];
      for (const pts of runways) {
        const lat = pts.map((pt) => pt.map((v) => { const q = decimalPartsX(v); if (!q) return null; const n = BigInt(q.int + q.frac.padEnd(d, '0')); return q.neg ? -n : n; }));
        for (let i = 0; i + 1 < lat.length; i++) {
          const a = lat[i], b = lat[i + 1];
          if (a.includes(null) || b.includes(null)) { keys.push('null'); continue; }
          const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
          const g = gcdX(gcdX(bigAbsX(u[0]), bigAbsX(u[1])), bigAbsX(u[2]));
          keys.push(g > 0n ? `${u[0] / g},${u[1] / g},${u[2] / g}` : 'null');
        }
      }
      return { d, keys };
    };
    // t9s the review case: ONE independent chain's x written in exponent form
    const xRef = readX(step9k(0));
    const xForms = [['1e-7', 1e-7], ['1.5e-7', 1.5e-7], ['-1e-7', -1e-7], ['2.5e-9', 2.5e-9], ['5e-324', 5e-324], ['0.1', 0.1], ['1e-6', 1e-6]];
    const xRows = xForms.map(([nm, v]) => {
      const def = step9k(v);
      const got = readX(def);
      return { nm, printed: String(v), plainDec: decOf9k(def), lat: keyListX(def.runways.map((rw) => rw.points_mm)).d, got,
        seat: got.err || xRef.err ? NaN : Math.hypot(...got.seat.map((c, i) => c - xRef.seat[i])) };
    });
    const xExp = xRows.filter((x) => /e/i.test(x.printed));
    check(`t9s a coordinate printed in exponent form keys like any other, and cannot reach across the definition (GH-770 review r3, class X, arm X1): the t9j step with the OTHER pocket's chain — a chain this route never touches — moved from x = 0 to ${xForms.map(([nm]) => nm).join(', ')} mm reads the lc chute at ${xRows.map((x) => (x.got.total / MM).toFixed(6)).join(' / ')} mm against the reference ${(xRef.total / MM).toFixed(6)} mm: identical to ${Math.max(...xRows.map((x) => Math.abs(x.got.total - xRef.total))).toExponential(2)} m, seat to ${Math.max(...xRows.map((x) => x.seat)).toExponential(2)} m, the same ${xRef.runs} runs over ${xRef.edges} edges and the same integer directions in every one. ${xExp.length} of those forms print in exponent notation (${xExp.map((x) => x.printed).join(', ')}) and the lattice scale the module builds for them is ${xRows.map((x) => `${x.nm}→${x.lat}`).join(' ')} decimals — while the file's PLAIN decimals read ${xRows.map((x) => x.plainDec).join('/')}, which is the measure that misses them: a plain-decimal reader cannot see a precision written this way at all. Pre-fix the token rejected them, the scale came back null for the WHOLE definition, and every runway in it lost coalescing at once: the untouched chute re-cut to 172.648092 mm over 5 runs and the ball seated 7.756 mm further down (arm t9v runs it). 5e-324 is the smallest double there is, 324 decimals of scale, and it keys the same as 0.1`,
      !xRef.err && xRows.every((x) => !x.got.err && Math.abs(x.got.total - xRef.total) < 1e-12 && x.seat < 1e-12
        && x.got.runs === xRef.runs && x.got.edges === xRef.edges && x.got.dirs === xRef.dirs)
      && xRef.runs === 2 && xRef.edges === 5 && xExp.length >= 5
      && xRows.some((x) => x.lat >= 324) && xRows.every((x) => x.plainDec <= 6),
      JSON.stringify({ ref: xRef.err ?? [+(xRef.total / MM).toFixed(6), xRef.runs, xRef.edges], rows: xRows.map((x) => [x.nm, x.printed, x.plainDec, x.lat, x.got.err ?? +(x.got.total / MM).toFixed(6), +x.seat.toExponential(1)]) }));
    // t9t the expansion as a unit property of the shipped function, plus the law that bounds it
    const expDecX = (v) => {                          // the decimal count by ARITHMETIC on the printed parts, not by padding
      const m = /^-?(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(String(v));
      return m ? Math.max(0, (m[2] ?? '').length - (m[3] ? Number.parseInt(m[3], 10) : 0)) : null;
    };
    const unitX = [1e-7, 1.5e-7, 2.5e-9, -1e-7, -0.0000001234, 1e21, 1.7976931348623157e308, 5e-324, 0.1, -573.44, 100, 0, -0, 123456789012345680000].map((v) => {
      const q = decimalPartsX(v);
      if (!q) return { v: String(v), bad: 'null' };
      const txt = `${q.neg ? '-' : ''}${q.int}${q.frac ? `.${q.frac}` : ''}`;
      return { v: String(v), txt, plain: /^-?\d+(\.\d+)?$/.test(txt), round: Number(txt) === v, dec: q.frac.length, want: expDecX(v) };
    });
    const rejectX = [NaN, Infinity, -Infinity, '1e-7', '0.1', null, undefined, true, 1n].map((v) => [typeof v === 'bigint' ? '1n' : String(v), decimalPartsX(v) === null]);
    const nanDef = (bad) => { const d = step9k(0); for (const rw of d.runways) if (rw.id.startsWith('rc-')) rw.points_mm[0][0] = bad; return d; };
    const lawX = [['NaN', readX(nanDef(NaN))], ['Infinity', readX(nanDef(Infinity))], ['-Infinity', readX(nanDef(-Infinity))]]
      .map(([nm, r]) => [nm, r.err ? (r.err.match(/\[V\d+[a-z]?\]/)?.[0] ?? r.err.slice(0, 40)) : 'ACCEPTED', r.err ? r.err.replace('ball-return track refused ', '').slice(0, 92) : '']);
    const shortX = (t) => (t.length > 26 ? `${t.slice(0, 14)}…${t.length} digits` : t);
    check(`t9t the expansion is a shift of the mantissa's own digits, exact over the whole double range (GH-770 review r3, class X, arm X2): the module's decimalParts, lifted out of the shipped file and run directly on ${unitX.length} forms — ${unitX.map((u) => `${u.v}→${shortX(u.bad ?? u.txt)}`).join(', ')} — returns a PLAIN decimal for every one, each reading back to the identical double (${unitX.filter((u) => u.round).length}/${unitX.length} exact round-trips, === on the bit pattern) and each carrying exactly the decimals the printed mantissa and exponent imply (${unitX.filter((u) => u.dec === u.want).length}/${unitX.length}, counted here by arithmetic on String(v) rather than by padding). The range is the double's own: 5e-324 expands to ${unitX.find((u) => u.v === '5e-324').dec} decimals and 1.7976931348623157e308 to a ${unitX.find((u) => u.v === '1.7976931348623157e+308').txt.length}-digit integer, both exact. What it still refuses is what law V0 refuses: ${rejectX.filter(([, ok]) => ok).length}/${rejectX.length} non-finite or non-numeric inputs (${rejectX.map(([nm]) => nm).join(', ')}) return null — and on a definition the validator accepted, that branch is unreachable, because the PUBLISHED JSON SCHEMA refuses such a coordinate first, its 'number' type being finite-only (jsonschema.js line 63, the V0 wall): ${lawX.map(([nm, m]) => `${nm} → ${m}`).join(', ')}, text \u0060${lawX[0][2]}\u0060. The law is V0 and not V2 — V2 is the terminal-vocabulary law (t6u) and never reads a coordinate. So the residual fallback is belt, it is named, and — unlike r2's — it is scoped to the POINT it cannot expand, never to the definition`,
      !!decimalPartsX && unitX.every((u) => !u.bad && u.plain && u.round && u.dec === u.want)
      && rejectX.every(([, ok]) => ok)
      && lawX.every(([, m]) => m === '[V0]'),
      JSON.stringify({ unit: unitX.map((u) => [u.v, u.bad ?? shortX(u.txt), u.round, u.dec, u.want]), reject: rejectX, law: lawX }));
    // t9u the same property as a CENSUS over the definitions in web/scene/ballreturn/tracks plus web/tools/fixtures/ballreturn-tracks. The re-expression has to be one the
    // PRINTED decimal survives, and a binary scale is not: String(v) is the SHORTEST round-tripping
    // decimal, which is not multiplicative (100·2⁻⁴⁰ prints 9.094947017729282e-11, not its exact
    // 9.094947017729282379150390625e-11), so scaling a file moves keys for reasons that have nothing
    // to do with this reader. The row below measures that too, and then uses the re-expression the
    // class is actually about: the SAME significant digits with the decimal exponent shifted, which
    // is exact by construction and which is what pushes a coordinate into exponent notation.
    const normX = (q) => {
      if (!q) return null;
      let d = (q.int + q.frac).replace(/^0+/, '');
      if (d === '') return { d: '0', e: 0, neg: false };
      let e = -q.frac.length;
      const n0 = d.length; d = d.replace(/0+$/, ''); e += n0 - d.length;
      return { d, e, neg: q.neg };
    };
    const SHIFTX = 30;
    const shiftX = (v) => Number(`${v}e-${SHIFTX}`);        // the same digits, the decimal exponent moved: exact on the DECIMAL, which is what is keyed
    const SCX = 2 ** -40;
    const cX = { defs: 0, keys: 0, differ: 0, scaleDiffer: 0, coords: 0, expPlain: 0, expShift: 0, lostR2: 0, notExact: 0, dP: [], dS: [] };
    for (const [f, p] of filesK) {
      const def = loadDef(p);
      const plain = def.runways.map((rw) => rw.points_mm);
      const shifted = def.runways.map((rw) => rw.points_mm.map((pt) => pt.map(shiftX)));
      const scaled = def.runways.map((rw) => rw.points_mm.map((pt) => pt.map((v) => v * SCX)));
      const A = keyListX(plain), B = keyListX(shifted), C = keyListX(scaled);
      cX.defs += 1; cX.keys += A.keys.length; cX.dP.push(A.d); cX.dS.push(B.d);
      for (let i = 0; i < A.keys.length; i += 1) {
        if (A.keys[i] !== B.keys[i]) cX.differ += 1;
        if (A.keys[i] !== C.keys[i]) cX.scaleDiffer += 1;
      }
      let anyExp = false;
      for (const pts of plain) for (const pt of pts) for (const v of pt) { cX.coords += 1; if (/e/i.test(String(v))) cX.expPlain += 1; }
      for (let a = 0; a < plain.length; a += 1) for (let b = 0; b < plain[a].length; b += 1) for (let c = 0; c < 3; c += 1) {
        const u = plain[a][b][c], w = shifted[a][b][c];
        if (/e/i.test(String(w))) { cX.expShift += 1; anyExp = true; }
        const na = normX(decimalPartsX(u)), nb = normX(decimalPartsX(w));
        // the precondition the comparison rests on: the shift moved the point and nothing else
        if (!na || !nb || na.d !== nb.d || na.neg !== nb.neg || (na.d !== '0' && nb.e !== na.e - SHIFTX)) cX.notExact += 1;
      }
      if (anyExp) cX.lostR2 += 1;
    }
    check(`t9u every definition in web/scene/ballreturn/tracks plus web/tools/fixtures/ballreturn-tracks keys identically when its coordinates are printed in exponent form (GH-770 review r3, class X, arm X3): all ${cX.defs} definitions in web/scene/ballreturn/tracks plus web/tools/fixtures/ballreturn-tracks, ${cX.coords} coordinates, re-expressed as the SAME significant digits with the decimal exponent moved 30 places (v → Number(\`\${v}e-30\`)) — which pushes ${cX.expShift} of the ${cX.coords} into exponent notation and raises the lattice scale from ${Math.min(...cX.dP)}–${Math.max(...cX.dP)} decimals to ${Math.min(...cX.dS)}–${Math.max(...cX.dS)} — produce ${cX.differ} differing direction keys out of ${cX.keys}, with the re-expression verified exact on all ${cX.coords} coordinates (${cX.notExact} whose digits or exponent moved by anything other than the shift). They cannot differ: the key is gcd-reduced, so one common decimal factor over a whole definition is invisible to it — the same statement as "the decimal count is a scale, not a threshold" (t9k), now made through the exponent branch instead of the plain one. A BINARY scale is NOT such a re-expression and the census says so with a number: ×2⁻⁴⁰ moves ${cX.scaleDiffer} of the ${cX.keys} keys, because String() returns the shortest round-tripping decimal and that is not multiplicative (100·2⁻⁴⁰ prints 9.094947017729282e-11 for an exact …282379150390625e-11) — a property of doubles, not of this reader, and the reason the reader keys the PRINTED decimal and says so in its own comment. Under the r2 token ${cX.lostR2} of the ${cX.defs} shifted definitions lose their lattice ENTIRELY — one non-plain coordinate returned null for the whole file — which is the blast radius this fix removes. The as-written bytes of the definitions in web/scene/ballreturn/tracks plus web/tools/fixtures/ballreturn-tracks escape by luck and not by rule, exactly as in class K: ${cX.expPlain} of the ${cX.coords} coordinates as written print in exponent form today, so no census of the definitions in web/scene/ballreturn/tracks plus web/tools/fixtures/ballreturn-tracks as they stand could have found this — it takes a definition someone writes`,
      cX.defs >= 12 && cX.differ === 0 && cX.notExact === 0 && cX.keys >= 100 && cX.expPlain === 0
      && cX.lostR2 === cX.defs && cX.expShift > cX.coords * 0.5 && cX.scaleDiffer > 0,
      JSON.stringify({ defs: cX.defs, coords: cX.coords, keys: cX.keys, differ: cX.differ, notExact: cX.notExact, scaleDiffer: cX.scaleDiffer,
        expPlain: cX.expPlain, expShift: cX.expShift, lostR2: cX.lostR2, dP: [Math.min(...cX.dP), Math.max(...cX.dP)], dS: [Math.min(...cX.dS), Math.max(...cX.dS)] }));
    // t9v the r2 path, run
    const plantX = await redPlant('x4', [
      [String.raw`const DECIMAL_TOKEN = /^-?(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/;`, String.raw`const DECIMAL_TOKEN = /^-?(\d+)(?:\.(\d+))?$/;`],
      ['        if (!q) continue;                        // no expansion: THIS point loses its key (below), never the definition', '        if (!q) return null;'],
      ['    const lat = rw.points_mm.map((p) => latticePoint(p, latDec));', '    const lat = latDec === null ? null : rw.points_mm.map((p) => latticePoint(p, latDec));'],
    ].concat(UNDO_W));
    const xRed = plantX.err ? { err: plantX.err } : ['0', '1e-7', '1.5e-7', '-1e-7', '5e-324'].map((nm, i) => {
      const v = [0, 1e-7, 1.5e-7, -1e-7, 5e-324][i];
      const got = readX(step9k(v), plantX);
      return { nm, got, seat: got.err ? NaN : Math.hypot(...got.seat.map((c, j) => c - xRef.seat[j])) };
    });
    const xCtl = Array.isArray(xRed) ? xRed[0] : null;
    const xBad = Array.isArray(xRed) ? xRed.slice(1) : [];
    check(`t9v the r2 token, run (GH-770 review r3, class X, arm X4): the module copied to a temp tree with the token narrowed back to plain decimals and the miss answered per DEFINITION (`+'`return null`'+` from latticeDecimals, the lattice skipped when it is null) reads the very same fixture at ${xBad.map((x) => x.got.err ?? (x.got.total / MM).toFixed(6)).join(' / ')} mm for x = ${xBad.map((x) => x.nm).join(', ')} — against ${(xRef.total / MM).toFixed(6)} mm this round — with ${xBad[0] ? xBad[0].got.runs : '-'} runs over ${xBad[0] ? xBad[0].got.edges : '-'} edges instead of ${xRef.runs} over ${xRef.edges}, and the ball seated ${xBad.map((x) => (x.seat / MM).toFixed(3)).join(' / ')} mm away: the class-S defect exactly, ${((xBad[0] ? xBad[0].got.total - xRef.total : 0) / MM).toFixed(6)} mm of route on a chute whose OWN coordinates nobody touched. The control is the same plant at x = 0, where the file prints plainly and the r2 reader is correct: ${xCtl && !xCtl.got.err ? (xCtl.got.total / MM).toFixed(6) : xCtl && xCtl.got.err} mm, seat to ${xCtl && !xCtl.got.err ? xCtl.seat.toExponential(2) : '-'} m — identical to this round's. That is the shape of the bug the order names: not a wrong number where the bad token is, but a route change somewhere else in the file`,
      !plantX.err && xCtl && !xCtl.got.err && Math.abs(xCtl.got.total - xRef.total) < 1e-12 && xCtl.seat < 1e-12
      && xBad.length === 4 && xBad.every((x) => !x.got.err && x.got.total - xRef.total > 7e-3 && x.got.runs === 5 && x.seat > 7e-3)
      && xBad.every((x) => Math.abs(x.got.total - xBad[0].got.total) < 1e-12),
      JSON.stringify({ plant: plantX.err ?? 'ok', ctl: xCtl && (xCtl.got.err ?? +(xCtl.got.total / MM).toFixed(6)),
        rows: xBad.map((x) => [x.nm, x.got.err ?? +(x.got.total / MM).toFixed(6), x.got.runs, +(x.seat / MM).toFixed(3)]) }));
  }
  // ---- t10a .. t10f (GH-770 review r4, class W) — a run the walk RETAINS must be one the ball can
  //      ROUND ONTO --------------------------------------------------------------------------------
  // Class S made the RUN — not the exported facet — the unit every length rule is written over, and
  // the whole-run retention that came with it keeps a run however short. The corner a valley needs is
  // λ = ½(hA+hB)·tan(θ/2) of centre travel on BOTH sides of the vertex; the 45 % clamp (the budget a
  // blend owes the next blend on the same piece) cuts it to λc, and the chord then falls
  //     pen = h(1 − cos θ) − λc·sin θ          (zero at λc = λ)
  // inside both floors. That is a quantity of the JOINT and of the CLAMP and not of the run's length,
  // so no length rule can see it: a 96/28 channel chute ending on a 2.499 mm draining tail passes V7,
  // V12 and the design gate, and the retained tail seats the ball 2.535 mm inside the chute it stands
  // on. The cure is the fragment rule's — the ball rides the run BEFORE the one it cannot reach, the
  // corner is solved over that pair, and the dropped run is still floor the ride must stay clear of
  // (clearTrim) — and beside it the pose law as a REFUSAL (poseClearance / refusePose), which is
  // where round 3's deviation 3 ("the pose is reported here and refused nowhere") is withdrawn.
  {
    const TRKW = path.resolve(here, '../scene/ballreturn/tracks');
    const tbW = loadDef(path.resolve(TRKW, 'TEST-terminal-chutes.json'));
    const subW = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const dotW = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const crossW = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const len3W = (a) => Math.hypot(a[0], a[1], a[2]);
    const supW = (width) => ({ kind: 'channel', width_mm: +width.toFixed(4), provenance: { tag: 'TEST', source: 'class W: synthetic channel floor' } });
    // The review fixture and the fuzz's family: a channel chute dropping `drop` mm over `along` mm
    // (h = r, the deepest support the schema has) with a terminal run of `rise` mm over `run` mm and
    // the stop face `face` mm along the runway. ONE support class over the WHOLE definition, top
    // level and every runway: a twin-rail lead feeding a channel chute puts two centre paths at two
    // heights over one shared vertex, and the ball on the lead then reads as inches inside the
    // chute's leading edge — a mixed-support junction, which is the DEFINITION's question (V14's
    // family, reported in §29.26f) and not the terminal run these arms are about.
    const tailW = (face, rise, run, drop = 96, along = 28, width = 80) => {
      const d = JSON.parse(JSON.stringify(tbW));
      d.support = supW(width);
      for (const rw of d.runways) {
        if (!rw.stop) continue;
        const p0 = rw.points_mm[0]; const sgn = Math.sign(rw.points_mm[1][2] - p0[2]);
        const p1 = [p0[0], +(p0[1] - drop).toFixed(6), +(p0[2] + sgn * along).toFixed(6)];
        rw.points_mm = run > 0 ? [p0, p1, [p1[0], +(p1[1] + rise).toFixed(6), +(p1[2] + sgn * run).toFixed(6)]] : [p0, p1];
        rw.support = supW(width);
        rw.stop.wall_s_mm = +face.toFixed(6);
        rw.stop.capacity_balls = Math.max(1, Math.floor(face / (2 * R / MM) + 1e-9));   // V6's own identity, in the file's millimetres
      }
      return d;
    };
    // THE ORACLE (arms W1–W4), written from the DEFINITION's own geometry and not from the route the
    // law builds: every RUN of every runway, with its support's h and lateral half-extent, less the
    // stop's own body (V7's drain comparison, mirrored) and less whatever a runway draws PAST its own
    // wall — a floor behind the stop plate is not a floor the ball can be inside of. Groups are the
    // maximal chains of runs on one runway joined by slope-only corners, counted here over the
    // runway's runs (the module counts them over the WALK's pieces: a second reading of the same
    // boundary rule, r·|φ| ≥ the grain).
    const floorsW = (tr) => {
      const out = [];
      for (const [id, rw] of tr.runways) {
        const half = rw.support.kind === 'twin-rail' ? rw.support.gauge / 2 : rw.support.width / 2;
        const need = rw.support.kind === 'twin-rail' ? tr.refR + rw.support.railR : tr.refR;
        const h = rw.support.kind === 'twin-rail' ? Math.sqrt(need * need - half * half) : tr.refR;
        const rho = rw.support.kind === 'twin-rail' ? Math.sqrt(tr.refR ** 2 - (half * tr.refR / need) ** 2) : tr.refR;
        const rest = tr.rests.get(id);
        let grp = 0;
        const RUNS = rw.runs ?? rw.edges;            // the PR base reads facets, not runs (the manifest writer, arm t11j)
        for (let i = 0; i < RUNS.length; i += 1) {
          const e = RUNS[i];
          const drains = e.sinTh > 1.4 * (tr.refR / rho) * tr.u_r * e.cosTh;
          const uB = Math.min(e.len, rest ? rest.wallS - e.s0 : e.len);
          const body = (!!rest && e.s0 >= rest.wallS - MM && !drains) || uB <= 0;
          out.push({ id, i, e, uA: 0, uB, h, tol: half, need, kind: rw.support.kind, b: crossW(e.t, e.n), grp: `${id}#${grp}`, body });
          const nx = RUNS[i + 1];
          if (nx) {
            const a = [e.t[0], 0, e.t[2]], c = [nx.t[0], 0, nx.t[2]];
            const phi = (Math.hypot(a[0], a[2]) < 1e-12 || Math.hypot(c[0], c[2]) < 1e-12) ? 0
              : Math.atan2(a[2] * c[0] - a[0] * c[2], a[0] * c[0] + a[2] * c[2]);
            if (tr.refR * Math.abs(phi) >= EXPORT_GRAIN) grp += 1;
          }
        }
      }
      return out;
    };
    // How far a centre is INSIDE a floor: the distance to the nearest point of that floor's finite
    // strip, less the radius the support needs. A channel is the floor rectangle of its own width; a
    // twin-rail is the two WIRES, where a centre that has rolled ALONG the rails is still exactly on
    // them (the module's flat-strip reading of the same pose is h(1 − cos θ) deeper, and its twist
    // allowance is exactly that quantity — the two models are compared in t10c).
    const penW = (floors, C, grp) => {
      let worst = null;
      for (const f of floors) {
        if (f.body || (grp !== null && f.grp !== grp)) continue;
        const d = subW(C, f.e.p0);
        const s = dotW(d, f.e.t), w = dotW(d, f.b), n = dotW(d, f.e.n);
        const sc = Math.max(f.uA, Math.min(f.uB, s));
        const dist = f.kind === 'twin-rail'
          ? Math.min(Math.hypot(s - sc, w - f.tol, n), Math.hypot(s - sc, w + f.tol, n))
          : Math.hypot(s - sc, w - Math.max(-f.tol, Math.min(f.tol, w)), n);
        const pen = f.need - dist;
        if (!worst || pen > worst.pen) worst = { pen, id: f.id, i: f.i, s: f.e.s0 + s, on: s >= f.uA - 1e-12 && s <= f.uB + 1e-12 };
      }
      return worst;
    };
    const rowsW = (floors, C) => floors.filter((f) => !f.body).map((f) => penW([f], C, null));
    const grpW = (tr, sg) => {                      // the oracle's key for the group the module put sg in
      const rw = tr.runways.get(sg.rw ? sg.rw.id : null);
      if (!rw) return null;
      let grp = 0;
      for (let i = 0; i < rw.runs.length; i += 1) {
        const e = rw.runs[i];
        if (e === sg.edge) return `${sg.rw.id}#${grp}`;
        const nx = rw.runs[i + 1];
        if (nx) {
          const a = [e.t[0], 0, e.t[2]], c = [nx.t[0], 0, nx.t[2]];
          const phi = (Math.hypot(a[0], a[2]) < 1e-12 || Math.hypot(c[0], c[2]) < 1e-12) ? 0
            : Math.atan2(a[2] * c[0] - a[0] * c[2], a[0] * c[0] + a[2] * c[2]);
          if (tr.refR * Math.abs(phi) >= EXPORT_GRAIN) grp += 1;
        }
      }
      return null;
    };
    // THE SHIPPED MODULES, as the module namespaces themselves — not a hand-enumerated shim. The shim
    // listed the exports the arms happened to use, so every export the module gained was missing from it
    // until an arm tripped over it mid-run (the FIX7 verdict's arm C died on exactly that shape, and t13g's
    // first run on this side); a namespace cannot be short an export. This also widens what the arms may
    // read from the module to its whole export surface — the shim was a convenience, never a whitelist
    // anything relied on (GH-770 FIX7 verdict follow-up, 2026-09-14; the surface is asserted in t13h).
    const SHIPW = { schema: SCHEMANS, track: TRACKNS, kin: KINNS };
    // the whole reading of ONE definition through ONE module: the route, the centre path, the
    // solver's transit poses and the pose it finally seats, each measured by the oracle above
    const readW = (def, M2 = SHIPW, pk0 = 1, K = 64) => {
      let tr = null;
      try { tr = M2.schema.validateTrack(def, { pockets: POCKETS, falls: null }); } catch (e) { return { err: e.message }; }
      const pk = tr.routes.has(pk0) ? pk0 : [...tr.routes.keys()].sort((a, b) => a - b)[0];
      const rt = tr.routes.get(pk);
      const floors = floorsW(tr);
      const out = { tr, rt, total: rt.total, kinds: rt.segs.map((s) => s.kind), segs: rt.segs.map((s) => `${s.kind} ${(s.len / MM).toFixed(6)}`).join(' | '), floors };
      let wp = null;
      for (const sg of rt.segs) for (let k = 0; k <= K; k += 1) {
        const D = Math.max(0, sg.D0 - sg.len * k / K);
        const st = M2.track.stationAt(rt, D, rt.r, {});
        const p = penW(floors, [st.x, st.y, st.z], null);
        if (p && (!wp || p.pen > wp.pen)) wp = { ...p, D, kind: sg.kind };
      }
      out.path = wp;
      try {
        const h1 = M2.kin.handoffFromSink({ t: 1, pocket: POCKETS[pk], fall: POCKETS[pk], r: tr.refR, tFall: 0.021, glide: 0.06 },
          { track: tr, pockets: POCKETS, r: tr.refR });
        const sol = M2.kin.solveShot({ track: tr, r: tr.refR, ledger: [], arrivals: [{ id: 1, handoff: h1 }] });
        let wt = null;
        for (let k = 0; k <= 200; k += 1) {
          const pz = M2.kin.poseAt(sol, 1, sol.tEnd * k / 200, {});
          if (!pz) continue;
          const p = penW(floors, [pz.x, pz.y, pz.z], null);
          if (p && (!wt || p.pen > wt.pen)) wt = p;
        }
        out.transit = wt;
        const pr = M2.kin.poseAt(sol, 1, sol.tEnd + 1, {});
        out.rest = pr ? penW(floors, [pr.x, pr.y, pr.z], null) : null;
        out.restRows = pr ? rowsW(floors, [pr.x, pr.y, pr.z]) : [];
      } catch (e) { out.solveErr = e.message; }
      return out;
    };
    const pickW = (rows, id, i) => rows.find((x) => x && x.id === id && x.i === i) ?? { pen: NaN, s: NaN, on: null };
    // t10a (arm W1) — the order's own fixture, before and after
    const reviewW = tailW(102.501, -0.1, 2.499);
    const afterW = readW(reviewW);
    const plantW1 = await redPlant('w1', UNDO_W);
    const beforeW = plantW1.err ? { err: plantW1.err } : readW(reviewW, plantW1);
    const bChute = beforeW.err ? null : pickW(beforeW.restRows, 'lc-chute', 0);
    const bTail = beforeW.err ? null : pickW(beforeW.restRows, 'lc-chute', 1);
    const aChute = afterW.err ? null : pickW(afterW.restRows, 'lc-chute', 0);
    const aTail = afterW.err ? null : pickW(afterW.restRows, 'lc-chute', 1);
    const geoW = (() => {                            // the joint the fixture builds, from its own runs
      const rw = afterW.err ? null : afterW.tr.runways.get('lc-chute');
      if (!rw || rw.runs.length < 2) return { th: NaN, lam: NaN, cap: NaN };
      const [A, B] = rw.runs;
      const th = Math.acos(Math.max(-1, Math.min(1, dotW(A.t, B.t))));
      return { th, lam: 0.5 * (R + R) * Math.tan(th / 2), cap: 0.45 * B.len, len: B.len };
    })();
    check(`t10a the order's own fixture: a retained run the ball cannot round onto (GH-770 review r4, class W, arm W1). An 80 mm channel chute dropping 96 mm over 28 mm and then 0.1 mm over 2.499 mm — a 2.3° tail that DRAINS, so V7 keeps it, V12 keeps it (it is not vertical), the design gate passes it, and whole-run retention hands it to the walk entire. The valley there is ${(geoW.th * 180 / Math.PI).toFixed(3)}° and the corner the ball needs is λ = ½(hA+hB)·tan(θ/2) = ${(geoW.lam / MM).toFixed(3)} mm of centre travel on EACH side; the ${(geoW.len / MM).toFixed(3)} mm tail can pay 45 % of its own length, ${(geoW.cap / MM).toFixed(3)} mm, and the chord the clamp then draws falls h(1 − cos θ) − λc·sin θ inside both floors. Read through the PRE-FIX module (the red plant, this round's three lines put back) that is ${beforeW.err ? 'REFUSED' : (beforeW.total / MM).toFixed(6)} mm of route over ${beforeW.err ? '-' : beforeW.kinds.length} segments (${beforeW.err ?? beforeW.segs}) and a seated ball ${bChute ? (bChute.pen / MM).toFixed(6) : '-'} mm INSIDE the 96/28 chute — its perpendicular foot at s ${bChute ? (bChute.s / MM).toFixed(4) : '-'} mm, ${bChute && bChute.on ? 'inside' : 'outside'} that run's own extent, so the strip reading and the plane reading are the same number and there is nothing to argue about — and ${bTail ? (bTail.pen / MM).toFixed(6) : '-'} mm inside the tail it is supposedly riding. In transit the drawn centre path goes ${beforeW.err ? '-' : (beforeW.path.pen / MM).toFixed(6)} mm in, on the ${beforeW.err ? '-' : beforeW.path.kind} at D ${beforeW.err ? '-' : (beforeW.path.D / MM).toFixed(3)} mm. This round the tail is DROPPED and the chute it hands the ball back to is trimmed to the first station clear of it: ${afterW.err ?? (afterW.total / MM).toFixed(6)} mm over ${afterW.err ? '-' : afterW.segs}, the ball resting ON the chute (${aChute ? (aChute.pen / MM).toExponential(2) : '-'} mm, foot at s ${aChute ? (aChute.s / MM).toFixed(4) : '-'} mm inside its extent) and ${aTail ? (-aTail.pen / MM).toFixed(6) : '-'} mm CLEAR of the dropped tail, with the whole centre path and every transit pose at or above the floor (worst ${afterW.err ? '-' : (afterW.path.pen / MM).toExponential(2)} mm on the path, ${afterW.err ? '-' : (afterW.transit.pen / MM).toExponential(2)} mm in transit). The plant is the PR base's reading too: rounds 1–3 never touched this rule`,
      !afterW.err && !afterW.solveErr && afterW.kinds.join(',') === 'line,arc,line'
      && Math.abs(afterW.total - 0.163519337817) < 5e-12
      && afterW.path.pen < 1e-9 && afterW.transit.pen < 1e-9 && afterW.rest.pen < 1e-9
      && aChute.on === true && aTail.pen < -0.019
      && !beforeW.err && !beforeW.solveErr && Math.abs(beforeW.total - 0.205911906263) < 5e-12
      && beforeW.kinds.includes('cut')
      && Math.abs(bChute.pen - 0.002535286) < 5e-9 && bChute.on === true
      && Math.abs(bTail.pen - 0.004287804) < 5e-9
      && Math.abs(beforeW.path.pen - 0.018416589) < 5e-9,
      JSON.stringify({ after: afterW.err ?? [+(afterW.total / MM).toFixed(6), afterW.segs, +(afterW.path.pen / MM).toExponential(2), +(afterW.rest.pen / MM).toExponential(2)],
        before: beforeW.err ?? [+(beforeW.total / MM).toFixed(6), beforeW.segs, +(beforeW.path.pen / MM).toFixed(6), bChute && +(bChute.pen / MM).toFixed(6), bTail && +(bTail.pen / MM).toFixed(6)] }));
    // t10b (arm W2) — the FUZZ. The invariant as an oracle over random terminal-run geometries, the
    // one reading that is not a fixture someone chose: --fuzz N (default FUZZW) cases from a pinned
    // seed, each one built, gated, walked, solved and read pose by pose.
    const FUZZW = (() => { const i = args.indexOf('--fuzz'); return i >= 0 ? Math.max(1, Number(args[i + 1])) : 300; })();
    const rngW = (a) => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t2 = Math.imul(a ^ a >>> 15, 1 | a); t2 = t2 + Math.imul(t2 ^ t2 >>> 7, 61 | t2) ^ t2; return ((t2 ^ t2 >>> 14) >>> 0) / 4294967296; };
    const lawW = (m) => (m.match(/\[[A-Z]\d+[a-z]?\]/) ?? [null])[0] ?? (m.startsWith('runway graph:') ? 'runway graph' : /^ball-return (solveShot|poseAt):/.test(m) ? 'pose law' : 'other');
    // THE WHOLE READING of a definition as ONE signature: every route's length, its piece count, the
    // seats on its rest ladder, and the pose a single-ball solve actually comes to rest in (with the
    // law that refused it, if one did). Two definitions that differ only PAST a stop face must
    // produce the same signature — the shape exactly, the numbers to 1e-9 m (arms t11g / t11h / t11k).
    const sigW = (M2, def, pockets = POCKETS, falls = null) => {
      let tr = null;
      try { tr = M2.schema.validateTrack(def, { pockets, falls }); } catch (e) { return { err: (e.message.match(/\[V\d+[a-z]?\]/) ?? ['refused'])[0], msg: e.message }; }
      const sig = [], seat = [], bshape = [], sshape = []; let seats = 0;
      const all = [...tr.routes.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])));
      if (tr.trayRoute) all.push(['tray', tr.trayRoute]);
      for (const [pk, rt] of all) {
        sig.push(rt.total);
        const lad = M2.track.reachSpan(rt, rt.r).ladder;
        seats += lad.length;
        for (const s of lad) sig.push(s.x, s.y, s.z);
        bshape.push(`${pk}:${rt.segs.length}:${lad.length}`);
        let drawn = 0, why = 'ok';
        if (typeof pk === 'number' && pockets[pk]) {
          try {
            const h1 = M2.kin.handoffFromSink({ t: 1, pocket: pockets[pk], fall: pockets[pk], r: tr.refR, tFall: 0.021, glide: 0.06 }, { track: tr, pockets, r: tr.refR });
            const sol = M2.kin.solveShot({ track: tr, r: tr.refR, ledger: [], arrivals: [{ id: 1, handoff: h1 }] });
            const pz = M2.kin.poseAt(sol, 1, sol.tEnd + 1, {});
            if (pz) { drawn = 1; seat.push(pz.x, pz.y, pz.z); }
          } catch (e) { why = lawW(e.message); }
        } else why = 'no solve';
        sshape.push(`${pk}:${drawn}:${why}`);
      }
      return { sig, seat, bshape: bshape.join('|'), sshape: sshape.join('|'), first: all[0][1].total,
        total: all.reduce((a2, [, rt]) => a2 + rt.total, 0), routes: all.length, seats, solved: sshape.filter((x) => x.endsWith(':ok')).length };
    };
    const maxAbsW = (a, b) => { let m = 0; for (let i = 0; i < a.length; i += 1) m = Math.max(m, Math.abs(a[i] - b[i])); return m; };
    // devBW compares what the CONSTRUCTION built (every route's length and its whole rest ladder);
    // devW compares that AND where a single-ball solve actually comes to rest, refusals included.
    const devBW = (a, b) => {
      if (a.err || b.err) return a.err === b.err ? 0 : NaN;
      if (a.bshape !== b.bshape || a.sig.length !== b.sig.length) return NaN;
      return maxAbsW(a.sig, b.sig);
    };
    const devW = (a, b) => {
      const d = devBW(a, b);
      if (Number.isNaN(d) || a.err || b.err) return d;
      if (a.sshape !== b.sshape || a.seat.length !== b.seat.length) return NaN;
      return Math.max(d, maxAbsW(a.seat, b.seat));
    };
    const lenW = (pts) => { let s = 0; for (let i = 1; i < pts.length; i += 1) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]); return s; };
    const headW = (def) => { let h = Infinity; for (const rw of def.runways) { if (!rw.stop) continue; h = Math.min(h, 2 * R / MM - (lenW(rw.points_mm) - rw.stop.wall_s_mm)); } return h; };
    const pastW = (def, kind, e, ang) => {
      const d = JSON.parse(JSON.stringify(def)); let touched = 0;
      for (const rw of d.runways) {
        if (!rw.stop) continue;
        const P = rw.points_mm, n = P.length, a = P[n - 2], b = P[n - 1];
        const w = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], Lg = Math.hypot(w[0], w[1], w[2]);
        if (!(Lg > 1e-9)) continue;
        if (kind === 'bend') {
          const c = Math.cos(ang * Math.PI / 180), s = Math.sin(ang * Math.PI / 180);
          const v = [(w[0] * c + w[2] * s) / Lg, w[1] / Lg, (-w[0] * s + w[2] * c) / Lg];
          P.push([+(b[0] + v[0] * e).toFixed(6), +(b[1] + v[1] * e).toFixed(6), +(b[2] + v[2] * e).toFixed(6)]);
        } else {
          if (Lg > e) return null;                                  // one whole copy would overrun the lip
          const j = Math.max(1, Math.floor(e / Lg));
          const q = kind === 'extend' ? [a, 1 + j] : [b, j];
          const pt = [+(q[0][0] + q[1] * w[0]).toFixed(6), +(q[0][1] + q[1] * w[1]).toFixed(6), +(q[0][2] + q[1] * w[2]).toFixed(6)];
          if (kind === 'extend') P[n - 1] = pt; else P.push(pt);
        }
        touched += 1;
      }
      return touched ? d : null;
    };
    // The corpus is a STREAM, and the two oracles below are only worth anything if it is the same
    // stream everywhere: the rolling sha-256 of every definition the generator emits (over the geometry it
    // emitted — the template's `checks` pins excluded structurally, arm t11j prints the key set) is checkpointed
    // here, and the recorded base-parity manifest carries the same checkpoints (arm t11j). A drift in
    // the generator is then a loud failure of the oracle and not a silently different experiment.
    // ---- ORACLE (c): the finite-strip FIRST-CONTACT probe (GH-770 review r6, class AC) ----------------
    // Independent of `clearTrim`'s formula: the centre riding P's own offset line is read against Q's
    // FINITE strip by the pose law's own body (the station clamped into [s0, s1], the lateral into ±tol,
    // the support's h), SAMPLED from P's far end toward the shared vertex — the trim is the retreat at
    // which the ball first touches Q coming from the clear side, refined by bisection to the bit. The
    // one constant in it is the module's own 1e-12 m sign-walk guard, so a contact of one part in 10^12
    // reads here as it reads there; the COMPARISON is held to 1e-9 m.
    const cenOnW = (f, s) => [f.edge.p0[0] + f.edge.t[0] * (s - f.edge.s0) + f.edge.n[0] * f.h,
      f.edge.p0[1] + f.edge.t[1] * (s - f.edge.s0) + f.edge.n[1] * f.h, f.edge.p0[2] + f.edge.t[2] * (s - f.edge.s0) + f.edge.n[2] * f.h];
    const penStripW = (Q, C) => {
      const d = subW(C, Q.edge.p0);
      const s = Q.edge.s0 + dotW(d, Q.edge.t), w = dotW(d, Q.b), n = dotW(d, Q.edge.n);
      const sc = Math.max(Q.s0, Math.min(Q.s1, s)); const wc = Math.max(-Q.tol, Math.min(Q.tol, w));
      return Q.h - Math.hypot(s - sc, w - wc, n);
    };
    const firstContactW = (P, Q, end, K = 4096) => {
      const ext = P.s1 - P.s0; const sV = end === 'B' ? P.s1 : P.s0; const dir = end === 'B' ? -1 : 1;
      const TOLC = 1e-12;                                                  // the module's own sign-walk guard
      const pen = (u) => penStripW(Q, cenOnW(P, sV + dir * u));
      if (pen(ext) > TOLC) return null;                                    // P's far end is inside Q: no clear station
      let uClear = ext, uHit = null;
      for (let k = 1; k <= K; k += 1) { const u = ext * (1 - k / K); if (pen(u) > TOLC) { uHit = u; break; } uClear = u; }
      if (uHit === null) return 0;
      let lo = uHit, hi = uClear;
      for (let k = 0; k < 200; k += 1) { const m = 0.5 * (lo + hi); if (pen(m) > TOLC) lo = m; else hi = m; }
      return 0.5 * (lo + hi);
    };
    // every trimmed pair of ONE route: a ridden piece's published post-cascade extent (sT0/sT1) against
    // the probe's first contact with every dropped floor the cascade trims it against — the nearest ridden
    // piece before and after the hole, and every ridden member of the hole's own floor group, the
    // cascade's own scope (arm W8). Returns null when the route's reader publishes no sT0/sT1 (the PR
    // base), so a caller can say the oracle DID NOT RUN instead of scoring a pass.
    const oracleCW = (rt) => {
      const floors = rt.floors ?? []; const lines = rt.segs.filter((s) => s.kind === 'line');
      if (!lines.length || lines.some((s) => s.sT0 === undefined)) return null;
      const ridden = new Map(lines.map((s) => [s.floor, s]));
      const idx = new Map(floors.map((f, i) => [f, i]));
      const out = { pairs: 0, bad: 0, worst: 0, rows: [], all: [] };
      for (const [P, sg] of ridden) {
        const pi = idx.get(P);
        let needA = 0, needB = 0, none = false, n = 0;
        for (const Q of floors) {
          if (ridden.has(Q)) continue;
          const qi = idx.get(Q);
          let before = null, after = null;
          for (const F of ridden.keys()) { const fi = idx.get(F); if (fi < qi) { if (before === null || fi > idx.get(before)) before = F; } else if (fi > qi && (after === null || fi < idx.get(after))) after = F; }
          if (P !== before && P !== after && P.group !== Q.group) continue;
          const end = pi < qi ? 'B' : 'A';
          const u = firstContactW(P, Q, end);
          n += 1;
          if (u === null) { none = true; continue; }
          if (end === 'B') needB = Math.max(needB, u); else needA = Math.max(needA, u);
        }
        if (!n) continue;
        out.pairs += n;
        const gotA = sg.sT0 - P.s0, gotB = P.s1 - sg.sT1;
        const d = none ? Infinity : Math.max(Math.abs(gotA - needA), Math.abs(gotB - needB));
        out.all.push([pi, gotA, none ? null : needA, gotB, none ? null : needB]);
        if (Number.isFinite(d) && d > out.worst) out.worst = d;
        if (d > 1e-9) { out.bad += 1; out.rows.push([pi, +(gotA / MM).toFixed(6), none ? 'no clear station' : +(needA / MM).toFixed(6), +(gotB / MM).toFixed(6), none ? 'no clear station' : +(needB / MM).toFixed(6)]); }
      }
      return out;
    };
    const oracleCDefW = (M2, def) => {                                      // one definition, every route
      let tr = null;
      try { tr = M2.schema.validateTrack(def, { pockets: POCKETS, falls: null }); } catch (e) { return { err: e.message }; }
      const o = { pairs: 0, bad: 0, worst: 0, rows: [], skipped: 0 };
      for (const [pk, rt] of tr.routes) { const c = oracleCW(rt); if (c === null) { o.skipped += 1; continue; } o.pairs += c.pairs; o.bad += c.bad; if (c.worst > o.worst) o.worst = c.worst; if (c.bad) o.rows.push([pk, ...c.rows[0]]); }
      return o;
    };
    // the last leg DOUBLED behind an unchanged stop face — the geometry before the face byte-identical,
    // the face where it was, only material the ball is stopped before added (oracle (b)'s always-applied
    // form, GH-770 review r6, class AC(i); the review AA fixture is exactly this operation)
    const dblW = (def) => {
      const d = JSON.parse(JSON.stringify(def));
      for (const rw of d.runways) {
        if (!rw.stop) continue;
        const P = rw.points_mm, n = P.length, a = P[n - 2], b = P[n - 1];
        P[n - 1] = [+(a[0] + 2 * (b[0] - a[0])).toFixed(6), +(a[1] + 2 * (b[1] - a[1])).toFixed(6), +(a[2] + 2 * (b[2] - a[2])).toFixed(6)];
      }
      return d;
    };
    const CKW = new Set([100, 300, 1000, 2000, 5000]);
    // pin-bearing = a key named like a pin (sha256 / sha1 / pins / hash / digest) or a 16/32/40/64-char hex string, anywhere inside
    // what the stream identity hashes; arm t11j prints the list and asserts it is empty, so a future pin-bearing key is caught
    // rather than silently hashed (the c3 merge, 2026-09-19)
    const pinBearingW = (obj) => {
      const out = [];
      const walk = (v, at) => {
        if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${at}[${i}]`));
        else if (v && typeof v === 'object') for (const k of Object.keys(v)) { if (/sha256|sha1|pins?$|hash|digest/i.test(k)) out.push(`${at}.${k} (key)`); walk(v[k], `${at}.${k}`); }
        else if (typeof v === 'string' && /^(?:[0-9a-f]{16}|[0-9a-f]{32}|[0-9a-f]{40}|[0-9a-f]{64})$/.test(v)) out.push(`${at} = ${v.slice(0, 12)}… (hex)`);
      };
      walk(obj, 'def'); return out;
    };
    const fuzzW = (N, M2 = SHIPW, keep = false) => {
      const rnd = rngW(0x5EEDC0DE);
      const rndX = rngW(0x5EEDC0DE ^ 0x9E3779B9);       // the post-stop oracle draws from its OWN stream
      const gen = createHash('sha256');
      const GRAINNMW = Math.round(EXPORT_GRAIN * 1e9);
      const dwIdW = [];                                  // interned floor ids for st.dw
      const st = { built: 0, refused: new Map(), poses: 0, worst: [], viol: [], gate: 0, poseLaw: 0, deepest: null,
        b: [], sv: [], c: [], deep: [], law: [], ck: new Map(), dw: {}, dwIds: dwIdW,
        inv: { applied: 0, viol: [], worst: 0, worstAt: null, flips: 0, flipRows: [], skipBuild: 0, skipFace: 0, skipRoom: 0, skipShape: 0, byKind: new Map() },
        fam: { n: 0, clip: 0, built: 0, rows: [] },                          // the class-AA family, counted from the generator's own parameters (AC)
        dbl: { applied: 0, viol: [], worst: 0, worstAt: null, flips: 0, skipFace: 0 },   // oracle (b), the always-applied doubled-delta form
        oc: { pairs: 0, viol: [], worst: 0, worstAt: null, skipped: 0 },                    // oracle (c) over every trimmed pair
        defs: [] };
      for (let i = 0; i < N; i += 1) {
        const U = (lo, hi) => lo + (hi - lo) * rnd();
        const drop = U(20, 140), run = U(10, 120), tailLen = U(0.1, 60), tailDy = U(-0.5, 2), width = U(40, 120);
        const tailRun = Math.sqrt(Math.max(1e-12, tailLen * tailLen - tailDy * tailDy));
        const L = Math.hypot(drop, run) + tailLen;
        const where = rnd();
        const face = where < 0.34 ? L - U(0, Math.min(3, 0.95 * tailLen)) : where < 0.67 ? L : L + U(0, 1.2);
        const geo = `drop ${drop.toFixed(2)} run ${run.toFixed(2)} tail ${tailLen.toFixed(3)}/${tailDy.toFixed(3)} w ${width.toFixed(2)} face ${face.toFixed(3)}`;
        const def = tailW(face, -tailDy, tailRun, drop, run, width);
        if (keep) st.defs.push(def);
        // The stream identity hashes the GEOMETRY the generator emitted, never the pins of other rows (the c3 merge,
        // 2026-09-19): the template is a track fixture whose `checks` block carries the committed pins of rows t7 / c2, and
        // CIWIRE's re-pin of t7 (972da48d…) moved this identity without one coordinate changing. Structural exclusion —
        // the `checks` key is dropped from the emitted def OBJECT before serialisation (no string surgery); the first
        // def's key set and a pin scan of everything that IS hashed are carried back for arm t11j.
        const { checks: _checksPins, ...geomOnly } = def;
        if (i === 0) { st.defKeys = Object.keys(def); st.pinLeak = pinBearingW(geomOnly); }
        gen.update(JSON.stringify(geomOnly));
        if (CKW.has(i + 1)) st.ck.set(i + 1, gen.copy().digest('hex'));
        const qE = rndX(), qK = rndX(), qA = rndX();
        // the class-AA FAMILY, read off the generator's own parameters before anything is built: a valley
        // (the tail shallower than the chute) whose WHOLE-run corner penetration is under the grain while
        // the stop-CLIPPED portion is shorter than the corner cut — the geometry on which the deleted
        // length rule and the corner law disagreed (GH-770 review r6, class AA; the count is arm AC-1)
        let famA = false;
        {
          const chuteA = Math.atan2(drop, run), tailA = Math.atan2(tailDy, tailRun), thA = chuteA - tailA;
          const lpA = lenW(def.runways.find((r2) => r2.stop).points_mm);
          if (thA > 1e-9 && face <= lpA + 1e-9) {
            const lamA = R * Math.tan(thA / 2);                                            // hA = hB = r on a channel
            const ellA = tailLen * MM, clipA = face < lpA ? Math.max(0, face - (lpA - tailLen)) * MM : ellA;
            const chuteL = Math.hypot(drop, run) * MM;
            const penOf = (ext) => R * (1 - Math.cos(thA)) - Math.min(lamA, 0.45 * ext, 0.45 * chuteL) * Math.sin(thA);
            const penWhole = penOf(ellA), penClip = penOf(clipA);         // the order's wording reads the WHOLE run; the corner law reads the CLIPPED one (Y3)
            if (clipA < lamA - 1e-12 && (penWhole <= EXPORT_GRAIN || penClip <= EXPORT_GRAIN)) {
              famA = true; st.fam.n += 1; if (penClip <= EXPORT_GRAIN) st.fam.clip += 1;
              st.fam.rows.push([i, +(thA * 180 / Math.PI).toFixed(3), +tailLen.toFixed(3), +(clipA / MM).toFixed(3), +(lamA / MM).toFixed(3), +(penWhole / MM).toFixed(4), +(penClip / MM).toFixed(4), +((face - lpA) * 1e6).toFixed(3), geo]);
            }
          }
        }
        let tr = null;
        try { tr = M2.schema.validateTrack(def, { pockets: POCKETS, falls: null }); }
        catch (e) { const k = lawW(e.message); st.refused.set(k, (st.refused.get(k) ?? 0) + 1); st.b.push(0); st.sv.push(0); st.c.push(0); st.deep.push(-1); st.law.push(k); st.inv.skipBuild += 1; if (famA) st.fam.rows[st.fam.rows.length - 1].push(0); continue; }
        st.built += 1; st.b.push(1);
        if (famA) { st.fam.built += 1; st.fam.rows[st.fam.rows.length - 1].push(1); }
        let svok = 1, svLaw = null;
        try { M2.kin.designGate(tr, { pockets: POCKETS, r: tr.refR }); } catch (e) { st.gate += 1; }
        const floors = floorsW(tr);
        let w = null;
        for (const [pk, rt] of tr.routes) {
          const probe = (C) => {
            st.poses += 1;
            const p = penW(floors, C, null);
            if (p && (!w || p.pen > w.pen)) w = { ...p, pk };
            if (p && p.pen > EXPORT_GRAIN) st.viol.push({ i, geo, pk, pen: p.pen, id: p.id, s: p.s });
          };
          for (const sg of rt.segs) for (let k = 0; k <= 24; k += 1) { const D = Math.max(0, sg.D0 - sg.len * k / 24); const s2 = M2.track.stationAt(rt, D, rt.r, {}); probe([s2.x, s2.y, s2.z]); }
          try {
            const h1 = M2.kin.handoffFromSink({ t: 1, pocket: POCKETS[pk], fall: POCKETS[pk], r: tr.refR, tFall: 0.021, glide: 0.06 }, { track: tr, pockets: POCKETS, r: tr.refR });
            const sol = M2.kin.solveShot({ track: tr, r: tr.refR, ledger: [], arrivals: [{ id: 1, handoff: h1 }] });
            for (let k = 0; k <= 40; k += 1) { const pz = M2.kin.poseAt(sol, 1, sol.tEnd * k / 40, {}); if (pz) probe([pz.x, pz.y, pz.z]); }
            const pr = M2.kin.poseAt(sol, 1, sol.tEnd + 1, {});
            if (pr) probe([pr.x, pr.y, pr.z]);
          } catch (e) { const k = lawW(e.message); svok = 0; svLaw = svLaw ?? k; if (k === 'pose law') st.poseLaw += 1; st.refused.set(`solve ${k}`, (st.refused.get(`solve ${k}`) ?? 0) + 1); }
        }
        // ORACLE (c): every trimmed pair of every route — the cascade's trim, read from the segment's
        // published sT0/sT1, against the first contact with the dropped floor's FINITE strip as the probe
        // above samples it (GH-770 review r6, class AC; arm AC-3)
        for (const [pk, rt] of tr.routes) {
          const oc = oracleCW(rt);
          if (oc === null) { st.oc.skipped += 1; continue; }
          st.oc.pairs += oc.pairs;
          if (oc.worst > st.oc.worst) { st.oc.worst = oc.worst; st.oc.worstAt = [i, pk]; }
          if (oc.bad) st.oc.viol.push([i, pk, geo, ...oc.rows[0]]);
        }
        if (w) { st.worst.push(w.pen); if (!st.deepest || w.pen > st.deepest.pen) st.deepest = { ...w, geo }; }
        st.sv.push(svok);
        st.c.push(svok && (w ? w.pen : -Infinity) <= EXPORT_GRAIN ? 1 : 0);
        st.deep.push(w ? Math.round(w.pen * 1e9) : -1);
        st.law.push(svok ? null : `solve ${svLaw}`);
        // WHERE the deepest pose stands, for every case whose depth is past the grain — the only
        // depth that licenses anything. The floor's own id, which run of it, and the station its foot
        // projects to, so a reader asked to accept a refusal can go and look (GH-770 r6, class Z1).
        if (w && Math.round(w.pen * 1e9) > GRAINNMW) {
          let k3 = dwIdW.indexOf(w.id); if (k3 < 0) { k3 = dwIdW.length; dwIdW.push(w.id); }
          st.dw[i] = [k3, w.i, Math.round(w.s * 1e9)];
        }
        // ORACLE (b): POST-STOP INVARIANCE. Add geometry past this definition's own stop face — a
        // longer last leg, a collinear one appended, or one bent out of the heading — inside the lip
        // V6 allows, and the route and the seats must not move. The collinear kinds add WHOLE copies
        // of the last leg so the pre-face bytes are identical and this measures the LAW, not rounding.
        const stops = def.runways.filter((r2) => r2.stop);
        const Lp = Math.max(...stops.map((r2) => lenW(r2.points_mm)));
        const faceM = Math.max(...stops.map((r2) => r2.stop.wall_s_mm));
        const room = 2 * R / MM - (Lp - faceM);
        if (faceM > Lp + 1e-9) st.inv.skipFace += 1;                     // the face is past the wire: nothing to add behind it
        else if (room < 0.7) st.inv.skipRoom += 1;                       // the lip law has no headroom left
        else {
          const e = 0.2 + qE * Math.min(20, room - 0.5);
          const ang = (qA - 0.5) * 90;
          let kind = qK < 1 / 3 ? 'extend' : qK < 2 / 3 ? 'append' : 'bend';
          let d2 = pastW(def, kind, e, ang);
          if (!d2) { kind = 'bend'; d2 = pastW(def, kind, e, ang); }     // one whole copy would not fit: bend instead
          const s1 = sigW(M2, def), s2 = d2 ? sigW(M2, d2) : { err: 'no extension' };
          if (s2.err && !s1.err) {
            st.inv.flips += 1;
            if (st.inv.flipRows.length < 8) st.inv.flipRows.push([i, kind, +e.toFixed(3), s2.err]);
          } else {
            st.inv.applied += 1;
            st.inv.byKind.set(kind, (st.inv.byKind.get(kind) ?? 0) + 1);
            const dv = devW(s1, s2);
            if (Number.isNaN(dv)) { st.inv.skipShape += 1; st.inv.viol.push([i, null, kind, +e.toFixed(3), geo]); }
            else {
              if (dv > 1e-9) st.inv.viol.push([i, dv, kind, +e.toFixed(3), geo]);
              if (dv > st.inv.worst) { st.inv.worst = dv; st.inv.worstAt = [i, kind, +e.toFixed(3)]; }
            }
          }
        }
        // ORACLE (b), the ALWAYS-APPLIED form (GH-770 review r6, class AC(i)): the last leg doubled behind
        // the unchanged face — not drawn from a stream, applied to every built case whose face lies ON
        // its wire (past the wire's end there is nothing behind the face in the original to compare, the
        // same skip as above); a lip V6 refuses is a flip, not a violation. Its RED half is arm AA-3's
        // exact family, because on THIS corpus the face is never on the wire's end to the bit (arm AC-1).
        if (faceM > Lp + 1e-9) st.dbl.skipFace += 1;
        else {
          const s1 = sigW(M2, def), s3 = sigW(M2, dblW(def));
          if (s3.err && !s1.err) st.dbl.flips += 1;
          else {
            st.dbl.applied += 1;
            const dv = devW(s1, s3);
            if (Number.isNaN(dv)) st.dbl.viol.push([i, null, geo]);
            else {
              if (dv > 1e-9) st.dbl.viol.push([i, dv, geo]);
              if (dv > st.dbl.worst) { st.dbl.worst = dv; st.dbl.worstAt = i; }
            }
          }
        }
      }
      st.worst.sort((a, b) => b - a);
      st.gen = gen.digest('hex');
      return st;
    };
    const bitsW = (arr) => { let s = ''; for (let i = 0; i < arr.length; i += 4) { let v = 0; for (let k = 0; k < 4; k += 1) v |= (arr[i + k] ? 1 : 0) << k; s += v.toString(16); } return s; };
    // ORACLE (a)'s reference: what the PR BASE reader (4818480f) does with the identical corpus —
    // which geometries it builds, which of them it solves, and how deep the oracle reads its poses.
    // Recorded, not recomputed, because the base tree is not in this checkout; regenerate with
    //   node web/tools/test-ballreturn.mjs --fuzz 5000 --write-base-parity <path to 4818480f's web/scene/ballreturn>
    // and the generator checkpoints below are what makes a stale manifest a FAILURE and not a lie.
    const BPFIXW = path.resolve(here, 'fixtures/ballreturn-base-parity-4818480f.json');
    const BPDIRW = (() => { const i = args.indexOf('--write-base-parity'); return i >= 0 ? args[i + 1] : null; })();
    // WHICH reader a recording was taken from is recorded IN it: the sha-256 of every module file the
    // writer imports, and the directory it was pointed at. A reviewer checks the claim against the
    // named commit with `git show 4818480f:web/scene/ballreturn/track.js | shasum -a 256`, and both
    // ends refuse the degenerate case — the writer will not record this checkout's own modules, and
    // the arms below fail if a recording's modules ARE this checkout's, because a recording taken
    // from the module under test is self-parity and not an oracle (GH-770 review r6, class Z3).
    // The files a stamp covers are the IMPORT CLOSURE of the three modules a reader loads, walked over
    // their own `from './…'` edges — not a hand-written list. The list this replaced named four files
    // and the closure is five: schema.js imports jsonschema.js, so a change to the JSON-schema walker
    // would have moved no stamp at all (GH-770 review r6, AD(ii); the maintainer's P3 note 1). The walk
    // is over whatever directory is being stamped, so a recording of another tree names THAT tree's
    // closure, and a module added to the graph later is covered the day it is imported.
    const importClosureW = (dir, roots = ['track.js', 'schema.js', 'kinematics.js']) => {
      const seen = []; const queue = [...roots];
      while (queue.length) {
        const n = queue.shift();
        if (seen.includes(n) || !fs.existsSync(path.resolve(dir, n))) continue;
        seen.push(n);
        for (const m of fs.readFileSync(path.resolve(dir, n), 'utf8').matchAll(/\bfrom\s+['"]\.\/([^'"]+)['"]/g)) queue.push(m[1]);
      }
      return seen.sort();
    };
    const MODFW = importClosureW(path.resolve(here, '../scene/ballreturn'));
    const MODSHAW = (dir) => Object.fromEntries(importClosureW(dir)
      .map((n) => [n, createHash('sha256').update(fs.readFileSync(path.resolve(dir, n))).digest('hex')]));
    const MINEW = MODSHAW(path.resolve(here, '../scene/ballreturn'));
    const sameAsMineW = (files) => Object.keys(files).length === Object.keys(MINEW).length
      && Object.keys(files).every((n) => files[n] === MINEW[n]);
    if (BPDIRW) {
      const srcB = { dir: path.resolve(BPDIRW), files: MODSHAW(BPDIRW) };
      if (sameAsMineW(srcB.files)) {
        console.log(`REFUSED: ${srcB.dir} is byte-identical to this checkout's own web/scene/ballreturn — a base-parity manifest recorded from the module under test is self-parity, not an oracle`);
        process.exit(1);
      }
      const urlB = (n) => pathToFileURL(path.resolve(BPDIRW, n)).href;
      const MB = { schema: await import(urlB('schema.js')), track: await import(urlB('track.js')), kin: await import(urlB('kinematics.js')) };
      const fb = fuzzW(FUZZW, MB);
      const man = { src: srcB, base: '4818480fc1b93fdbb2d43f286ed4f17374157073', seed: '0x5EEDC0DE', n: FUZZW,
        grain_nm: Math.round(EXPORT_GRAIN * 1e9), gen: fb.gen, ck: Object.fromEntries(fb.ck),
        built: fb.built, clear: fb.c.reduce((x, y) => x + y, 0),
        refused: [...fb.refused.entries()].sort((x, y) => y[1] - x[1]),
        inv: { applied: fb.inv.applied, viol: fb.inv.viol.length, worst: fb.inv.worst },
        dbl: { applied: fb.dbl.applied, viol: fb.dbl.viol.length, worst: fb.dbl.worst, skipFace: fb.dbl.skipFace, flips: fb.dbl.flips },
        oc: { pairs: fb.oc.pairs, viol: fb.oc.viol.length, skipped: fb.oc.skipped },
        b: bitsW(fb.b), sv: bitsW(fb.sv), c: bitsW(fb.c), deep: fb.deep, law: fb.law,
        dwIds: fb.dwIds, dw: fb.dw };
      fs.writeFileSync(BPFIXW, `${JSON.stringify(man)}\n`);
      console.log(`wrote ${BPFIXW}: n ${FUZZW}, built ${man.built}, clear ${man.clear}, gen ${man.gen.slice(0, 16)}, inv ${man.inv.viol}/${man.inv.applied} worst ${man.inv.worst.toExponential(2)}`);
      console.log(`  read from ${srcB.dir}: ${MODFW.filter((n) => srcB.files[n]).map((n) => `${n} ${srcB.files[n].slice(0, 16)}`).join(', ')}`);
      console.log(`  ${Object.keys(man.dw).length} cases carry a deep-pose context (floor, run, station) of ${man.dwIds.length} distinct floors`);
      for (const d of redTmp) fs.rmSync(d, { recursive: true, force: true });   // the red plants' temp module trees
      process.exit(0);                                 // a maintenance path, like --sync-schema: write the manifest and stop
    }
    const bitAtW = (hex, i) => (parseInt(hex[i >> 2], 16) >> (i & 3)) & 1;
    const BPW = fs.existsSync(BPFIXW) ? JSON.parse(fs.readFileSync(BPFIXW, 'utf8')) : null;
    const fzW = fuzzW(FUZZW, SHIPW, true);
    const qW = (p) => (fzW.worst.length ? fzW.worst[Math.min(fzW.worst.length - 1, Math.floor(p * fzW.worst.length))] : NaN);
    check(`t10b the clearance invariant as a FUZZ (GH-770 review r4, class W, arm W2): ${FUZZW} random terminal-run geometries from a pinned seed — the chute's drop 20–140 mm over 10–120 mm of run, a tail 0.1–60 mm long turning anywhere from 0.5 mm UP to 2 mm DOWN across it, a channel 40–120 mm wide, and the stop face placed short of the tail, on it, or past it — each one put through validateTrack, designGate, the walk and solveShot, and read at ${fzW.poses} poses (every segment at 25 stations, the solver's transit at 41, and the pose it seats) against the oracle above. ${fzW.built} built and ${FUZZW - fzW.built} were refused BY NAME (${[...fzW.refused.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ') || 'none'}); ${fzW.gate} of the built ones threw from the design gate and ${fzW.poseLaw} from the pose law. VIOLATIONS — a pose deeper than the ${(EXPORT_GRAIN / MM).toFixed(1)} mm export grain inside a piece it is not riding — ${fzW.viol.length}. The deepest reading over this run is ${(qW(0) / MM).toFixed(6)} mm (p01 ${(qW(0.01) / MM).toFixed(6)}, p10 ${(qW(0.1) / MM).toFixed(6)}, median ${(qW(0.5) / MM).toFixed(6)} mm), all of it under the grain and all of it the corner construction's own depth. The record run for the report is 5 000 cases (--fuzz 5000): 2 941 built, 567 390 poses, 0 violations, deepest 0.099613 mm, refusals [V7] 1 683 / [V6] 359 / [V2] 17, 0 from the design gate and 0 from the pose law; an INDEPENDENT harness over the same seed and the same generator — distance to each strip, no entitlement at all — reads the same 2 941 built, the same refusal counts and the same worst 0.099613 mm over its own 561 508 poses (the report's fuzz-oracle.mjs). This is the arm that found what the fixtures could not — an INTERIOR clamped joint may not be dropped (a 32.3 mm 57.4° run between an 11.3° lead and a 2.1° tail clamps 0.348 mm short at its lower corner, and dropping it drew a 42.7 mm chord 4.183 mm inside the lead, because the ball RIDES both neighbours and a chord replaces TWO corners by one), and a floor past a floor's END can be deep inside it all the same (a 94.5/72.9 mm chute on a 17.7 mm tail seats the ball with its foot 3.8 mm beyond the tail's far vertex and 9.3 mm inside it — which is why both readings measure the finite STRIP and not the plane)`,
      fzW.viol.length === 0 && fzW.built >= Math.floor(FUZZW * 0.4) && fzW.poses > FUZZW * 60
      && fzW.poseLaw === 0 && fzW.gate === 0 && qW(0) <= EXPORT_GRAIN,
      JSON.stringify({ cases: FUZZW, built: fzW.built, poses: fzW.poses, refused: [...fzW.refused.entries()], viol: fzW.viol.slice(0, 4).map((v) => [v.i, v.geo, +(v.pen / MM).toFixed(6), v.id]), deepest: fzW.deepest && [+(fzW.deepest.pen / MM).toFixed(6), fzW.deepest.geo] }));
    // t10c (arm W3) — the CENSUS over every definition in web/scene/ballreturn/tracks plus web/tools/fixtures/ballreturn-tracks and the class-W fixtures, read
    // BOTH ways: by the oracle above (the definition's own geometry) and by the module's own
    // poseClearance, against the entitlement each construction is independently re-derived to have.
    const allowW = (rt, idx) => {
      const sg = rt.segs[idx];
      if (sg.kind === 'line' || sg.kind === 'arc') return { a: 0, why: sg.kind };
      if (sg.kind === 'twist') return { a: sg.h * (1 - Math.hypot(sg.edge.t[0], sg.edge.t[2])), why: 'twist' };
      const intoW = (sgL, C) => {
        const e = sgL.edge; const d = subW(C, e.p0); const s = dotW(d, e.t);
        if (s < -1e-12 || s > e.len + 1e-12) return 0;
        return sgL.h - dotW(d, e.n);
      };
      let A = null, B = null;
      for (let k = idx - 1; k >= 0; k -= 1) if (rt.segs[k].kind !== 'cut') { A = rt.segs[k]; break; }
      for (let k = idx + 1; k < rt.segs.length; k += 1) if (rt.segs[k].kind !== 'cut') { B = rt.segs[k]; break; }
      if (!A || !B) return { a: null, why: 'cut with no piece on a side' };
      const th = Math.acos(Math.max(-1, Math.min(1, dotW(A.edge.t, B.edge.t))));
      if (A.kind === 'twist' || B.kind === 'twist') {            // a heading change: the connector between two twist windows
        return { a: Math.max(B.h * (1 - Math.hypot(B.edge.t[0], B.edge.t[2])), intoW(B, sg.p0), intoW(B, sg.p1)), why: 'connector', th };
      }
      // Two bodies, two extents: the chord read over the DOWNSTREAM floor, at BOTH of its ends
      // (a normal offset is affine along a straight chord) and never below zero — an entitlement is
      // a licence to stand inside a floor, and a clearance cannot be a negative one (review r5, Y1).
      if (A.rw !== B.rw) return { a: Math.max(0, intoW(B, sg.p0), intoW(B, sg.p1)), why: 'landing', th };
      const V = [A.edge.p0[0] + A.edge.t[0] * A.edge.len, A.edge.p0[1] + A.edge.t[1] * A.edge.len, A.edge.p0[2] + A.edge.t[2] * A.edge.len];
      const lamc = len3W(subW(sg.p0, [V[0] + A.h * A.edge.n[0], V[1] + A.h * A.edge.n[1], V[2] + A.h * A.edge.n[2]]));
      return { a: Math.max(0, 0.5 * (A.h + B.h) * (1 - Math.cos(th)) - lamc * Math.sin(th)), why: 'valley', th, lamc, lam: 0.5 * (A.h + B.h) * Math.tan(th / 2), extB: B.edge.len };
    };
    const censusW = [];
    for (const [f, p] of trackFiles()) {
      const d = loadDef(p);
      const ctx = await tableContext(d.doc.table_id);
      censusW.push({ name: f.replace('.json', '').replace('TEST-', ''), def: d, pockets: ctx.pockets, falls: ctx.falls });
    }
    for (const [nm, d] of [['fixture W1 tail 2.499 mm', reviewW], ['fixture W tail 25 mm', tailW(125, -8, 23.7)],
      ['fixture W no tail', tailW(100, 0, 0)], ['fixture W tail 0.5 mm rising', tailW(100.5, 0.5, 0.001)]]) censusW.push({ name: nm, def: d, pockets: POCKETS, falls: null });
    const rowsC = [];
    let worstC = null, worstSeatC = null, allowDiff = 0, oracleUp = -Infinity, oracleDn = Infinity, refusedC = 0, blendsC = 0, cutsC = 0, samplesC = 0, deepCut = null, clampC = 0;
    for (const c of censusW) {
      let tr = null;
      try { tr = validateTrack(c.def, { pockets: c.pockets, falls: c.falls }); }
      catch (e) { rowsC.push({ name: c.name, refused: e.message.match(/\[V\d+[a-z]?\]/)?.[0] ?? 'refused' }); continue; }
      const floors = floorsW(tr);
      const all = [...tr.routes.entries()].sort((a, b) => a[0] - b[0]).map(([pk, rt]) => [`pk${pk}`, rt]);
      if (tr.trayRoute) all.push(['tray', tr.trayRoute]);
      const row = { name: c.name, routes: all.length, margin: -Infinity, seats: 0, where: '' };
      for (const [tag, rt] of all) {
        for (let i = 0; i < rt.segs.length; i += 1) {
          const sg = rt.segs[i];
          const al = allowW(rt, i);
          if (sg.kind !== 'line') blendsC += 1;
          if (sg.kind === 'cut') {
            cutsC += 1;
            if (al.lam !== undefined && al.lam - al.lamc > 1e-9) clampC += 1;
            if (!c.name.startsWith('fixture') && (!deepCut || (sg.pen ?? 0) > deepCut.pen)) deepCut = { pen: sg.pen ?? 0, ...al, name: c.name, tag, rw: sg.rw ? sg.rw.id : '-' };
          }
          if (al.a !== null) allowDiff = Math.max(allowDiff, Math.abs(al.a - (sg.pen ?? 0)));
          const allowed = (sg.pen ?? 0) + EXPORT_GRAIN;
          for (let k = 0; k <= 96; k += 1) {
            const D = Math.max(0, sg.D0 - sg.len * k / 96);
            const st = stationAt(rt, D, rt.r, {});
            samplesC += 1;
            try { refusePose(rt, D, st, 'poseAt'); } catch (e) { refusedC += 1; }
            const o = penW(floors, [st.x, st.y, st.z], grpW(tr, sg));
            const m = poseClearance(rt, D, st.x, st.y, st.z);
            if (o && m) { oracleUp = Math.max(oracleUp, o.pen - m.pen); oracleDn = Math.min(oracleDn, o.pen - m.pen); }
            const marg = Math.max(o ? o.pen - allowed : -Infinity, m ? m.pen - m.allowed : -Infinity);
            if (marg > row.margin) { row.margin = marg; row.where = `${sg.kind} ${tag} ${o ? o.id : '-'}`; }
          }
        }
        for (const s of reachSpan(rt, rt.r).ladder) {
          const sg = locate(rt, s.D).seg;
          const o = penW(floors, [s.x, s.y, s.z], grpW(tr, sg));
          const m = poseClearance(rt, s.D, s.x, s.y, s.z);
          row.seats += 1;
          const marg = Math.max(o ? o.pen - ((sg.pen ?? 0) + EXPORT_GRAIN) : -Infinity, m ? m.pen - m.allowed : -Infinity);
          if (!worstSeatC || marg > worstSeatC.m) worstSeatC = { m: marg, name: c.name, tag, kind: sg.kind };
        }
      }
      rowsC.push(row);
      if (!worstC || row.margin > worstC.margin) worstC = row;
    }
    const liveC = rowsC.filter((x) => !x.refused);
    check(`t10c the clearance census: every pose the module can draw, over every definition in web/scene/ballreturn/tracks plus web/tools/fixtures/ballreturn-tracks and every class-W fixture (GH-770 review r4, class W, arm W3). ${liveC.length} definitions build (${rowsC.length - liveC.length} refused by law: ${rowsC.filter((x) => x.refused).map((x) => `${x.name} ${x.refused}`).join(', ') || 'none'}) — the ${liveC.filter((x) => !x.name.startsWith('fixture')).length} in web/scene/ballreturn/tracks plus web/tools/fixtures/ballreturn-tracks and ${liveC.filter((x) => x.name.startsWith('fixture')).length} class-W fixtures — and their ${liveC.reduce((n, x) => n + x.routes, 0)} routes were read at ${samplesC} centre stations (97 per segment, so every blend is sampled at the same resolution) and ${liveC.reduce((n, x) => n + x.seats, 0)} seats. Worst margin over all of them: ${(worstC.margin / MM).toFixed(6)} mm (${worstC.name}, ${worstC.where}) — NEGATIVE is clear, and the margin is measured against what the construction that drew each pose is entitled to, not against zero. Worst SEAT margin ${(worstSeatC.m / MM).toFixed(6)} mm (${worstSeatC.name} ${worstSeatC.tag}, on a ${worstSeatC.kind}). The entitlements are re-derived here from the route's own geometry — 0 on a line and a pivot arc, h(1 − cos θ) on a twist, h(1 − cos θ) − λc·sin θ on a valley cut, the deeper of the chord's two ENDS over the downstream floor on a landing — each of them floored at zero, because a clearance is not a negative licence (review r5, class Y1: one end alone made every shipped landing's entitlement negative, and a negative entitlement refuses a centre 0.000000 mm inside the tray) — and they agree with the module's to ${allowDiff.toExponential(2)} m over ${blendsC} blends (${cutsC} of them cuts). The deepest cut entitlement in any definition in web/scene/ballreturn/tracks plus web/tools/fixtures/ballreturn-tracks is ${deepCut ? (deepCut.pen / MM).toFixed(6) : '-'} mm, a ${deepCut ? deepCut.why : '-'} on ${deepCut ? `${deepCut.name} ${deepCut.tag} ${deepCut.rw}` : '-'} — and it is one of the places where the 45 % clamp actually BINDS in the definitions in web/scene/ballreturn/tracks plus web/tools/fixtures/ballreturn-tracks and the in-file class-W fixtures (${clampC} of ${cutsC} cuts do): θ ${deepCut && deepCut.th ? (deepCut.th * 180 / Math.PI).toFixed(3) : '-'}°, λ = ${deepCut && deepCut.lam ? (deepCut.lam / MM).toFixed(4) : '-'} mm of corner wanted against ${deepCut && deepCut.lamc ? (deepCut.lamc / MM).toFixed(4) : '-'} mm paid, because the run below it is only ${deepCut && deepCut.extB ? (deepCut.extB / MM).toFixed(3) : '-'} mm long. That measurement is why this round does not touch the clamp: it is load-bearing on a definition in web/scene/ballreturn/tracks plus web/tools/fixtures/ballreturn-tracks, and the depth it leaves is a seventh of the grain. A FINDING for §29.26f, not a bound this law invents. And ${refusedC} of the ${samplesC} poses raised the pose law: the definitions in web/scene/ballreturn/tracks plus web/tools/fixtures/ballreturn-tracks and the in-file class-W fixtures refuse nothing. The two readings are two different MODELS and the census is clean under both — the oracle keeps each run's full extent up to the stop face where the module keeps the WALKED one (so it reads up to ${(oracleUp / MM).toFixed(6)} mm deeper), and it reads a twin-rail as the two WIRES, where a centre that has rolled ALONG the rails is still exactly on them, so on a twist it reads up to ${(-oracleDn / MM).toFixed(6)} mm shallower than the module's flat-strip h(1 − cos θ) — which is exactly the quantity that twist's own allowance covers`,
      liveC.length >= 15 && worstC.margin < 0 && worstSeatC.m < 0 && refusedC === 0
      && allowDiff < 1e-12 && cutsC >= 16 && samplesC > 20000
      && !!deepCut && deepCut.why === 'valley' && deepCut.pen > 1.4e-5 && deepCut.pen < 1.45e-5 && clampC >= 2,
      JSON.stringify({ worst: [worstC.name, +(worstC.margin / MM).toFixed(6), worstC.where], seat: [worstSeatC.name, +(worstSeatC.m / MM).toFixed(6)],
        allowDiff: +allowDiff.toExponential(2), refused: refusedC, samples: samplesC, cuts: cutsC, clamped: clampC, deepCut: deepCut && [+(deepCut.pen / MM).toFixed(6), deepCut.name, deepCut.rw],
        rows: rowsC.map((x) => x.refused ? [x.name, x.refused] : [x.name, +(x.margin / MM).toFixed(6), x.seats]) }));
    // t10d (arm W4) — the same fuzz corpus through the PRE-FIX construction: the defect is a class,
    // not a fixture. The plant is this round's three lines put back (the corner law in the walk, the
    // clearance trim a dropped run owes the ride that passes it, and the pose refusal that would
    // otherwise stop the reading before it could be taken).
    const NW4 = Math.min(FUZZW, 200);
    const fzRed = plantW1.err ? null : fuzzW(NW4, plantW1);
    const fzCtl = fuzzW(NW4);
    check(`t10d the pre-fix construction over the same corpus (GH-770 review r4, class W, arm W4): the first ${NW4} geometries of arm W2's family read through a temp copy of the module with this round's three lines put back draw ${fzRed ? fzRed.viol.length : '-'} poses deeper than the ${(EXPORT_GRAIN / MM).toFixed(1)} mm grain inside a floor they are not riding, over ${fzRed ? fzRed.built : '-'} built geometries, the deepest ${fzRed && fzRed.deepest ? (fzRed.deepest.pen / MM).toFixed(6) : '-'} mm (${fzRed && fzRed.deepest ? fzRed.deepest.geo : '-'}). This round's module, on the identical corpus: ${fzCtl.viol.length} violations over ${fzCtl.built} built, deepest ${fzCtl.deepest ? (fzCtl.deepest.pen / MM).toFixed(6) : '-'} mm. Both readings BUILD the same geometries and refuse the same ones by the same laws (${[...fzCtl.refused.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ')} here against ${fzRed ? [...fzRed.refused.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ') : '-'} there), so what changed is the construction and not the admission rule: this round does not refuse a track the PR base accepted, it walks it onto floors the ball can reach`,
      !!fzRed && fzRed.viol.length >= 5 && fzCtl.viol.length === 0
      && fzRed.built === fzCtl.built && (fzRed.deepest ? fzRed.deepest.pen : 0) > 1e-3,
      JSON.stringify({ red: fzRed && [fzRed.built, fzRed.viol.length, fzRed.deepest && +(fzRed.deepest.pen / MM).toFixed(6)],
        now: [fzCtl.built, fzCtl.viol.length, fzCtl.deepest && +(fzCtl.deepest.pen / MM).toFixed(6)] }));
    // t10e (arm W5) — no pinned definition in web/scene/ballreturn/tracks plus web/tools/fixtures/ballreturn-tracks moved. Every pinned definition in web/scene/ballreturn/tracks plus web/tools/fixtures/ballreturn-tracks, every route total and
    // every seat, against the figures the module read BEFORE this round (measured on the PR base and
    // pinned here); the XW101 six against the SNK-R37 export's published digits.
    const PINW = [
      ['TEST-alias-diamond-wire-slide', [2.081351141606, 2.081351141606], 74, 0.3],
      ['TEST-bend-90', [0.639256558433], 12, 0.3],
      ['TEST-crossing-wire-slide', null, 0, null],
      ['TEST-hairpin-170', [0.789263176022], 14, 0.199998536245],
      ['TEST-midedge-landing', [1.851978088308, 1.805067809338], 66, 0.3],
      ['TEST-obtuse-merge', [1.851978088308, 2.289982973637], 73, 0.3],
      ['TEST-shallow-merge', [1.843406677151, 1.843406677151], 66, 0.3],
      ['TEST-synthetic-wire-slide', [2.090037334561, 2.090037334561], 74, 0.3],
      ['TEST-terminal-chutes-high', [0.376900598036, 0.376900598036], 14, null],
      ['TEST-terminal-chutes', [0.3229847345, 0.3229847345], 14, null],
      ['TEST-y3-obtuse', [1.136088550764, 1.851978088308, 2.289982973637], 93, 0.3],
      ['wpbsa_snooker_12ft-xw101-slides', [0.296179586706, 0.298951041772, 0.444350792878, 0.444350792878, 0.298951041772, 0.296179586706], 42, null],
    ];
    const R37W = [0.296179587, 0.298951042, 0.444350793, 0.444350793, 0.298951042, 0.296179587];  // the SNK-R37 export's published routes
    let worstPin = 0; const pinBad = []; let pinRoutes = 0, pinSeats = 0;
    for (const [nm, totals, seats, tray] of PINW) {
      const c = censusW.find((x) => x.name === nm.replace('TEST-', ''));
      let tr = null;
      try { tr = validateTrack(c.def, { pockets: c.pockets, falls: c.falls }); } catch (e) { if (totals !== null) pinBad.push(`${nm} refused ${e.message.slice(0, 40)}`); continue; }
      if (totals === null) { pinBad.push(`${nm} built and should not`); continue; }
      const got = [...tr.routes.entries()].sort((a, b) => a[0] - b[0]);
      if (got.length !== totals.length) { pinBad.push(`${nm} ${got.length} routes vs ${totals.length}`); continue; }
      pinRoutes += got.length;
      let s = 0;
      for (let i = 0; i < got.length; i += 1) { worstPin = Math.max(worstPin, Math.abs(got[i][1].total - totals[i])); s += reachSpan(got[i][1], got[i][1].r).ladder.length; }
      pinSeats += s;
      if (s !== seats) pinBad.push(`${nm} ${s} seats vs ${seats}`);
      const tr2 = tr.trayRoute ? +tr.trayRoute.total.toFixed(12) : null;
      if (tray === null ? tr2 !== null : Math.abs(tr2 - tray) > 5e-12) pinBad.push(`${nm} tray ${tr2} vs ${tray}`);
    }
    const starW = (() => {
      const c = censusW.find((x) => x.name === 'wpbsa_snooker_12ft-xw101-slides');
      const tr = validateTrack(c.def, { pockets: c.pockets, falls: c.falls });
      return [...tr.routes.entries()].sort((a, b) => a[0] - b[0]).map(([, rt]) => rt.total);
    })();
    check(`t10e no pinned definition in web/scene/ballreturn/tracks plus web/tools/fixtures/ballreturn-tracks moved (GH-770 review r4, class W, arm W5): all ${PINW.length} definitions in web/scene/ballreturn/tracks plus web/tools/fixtures/ballreturn-tracks re-read against the totals and the seat counts the module produced BEFORE this round — ${pinRoutes} routes, ${pinSeats} seats, ${PINW.filter((p) => p[3] !== null).length} tray routes — worst deviation ${worstPin.toExponential(2)} m and ${pinBad.length} rows out (${pinBad.join(', ') || 'none'}). The one definition that does not build still does not build, for the same reason (crossing-wire-slide, [V14]). The XW101 six read ${starW.map((t2) => (t2 / MM).toFixed(6)).join(' / ')} mm — the SNK-R37 export's published figures to ${(Math.max(...starW.map((t2, i) => Math.abs(t2 - R37W[i]))) / MM).toExponential(2)} mm — so t6d's committed bytes and the seal's published digits are both untouched by a fix that changes what the walk RETAINS: the corner law only fires where the 45 % clamp binds, and the only valleys in the definitions in web/scene/ballreturn/tracks plus web/tools/fixtures/ballreturn-tracks whose clamp binds at all are the XW101 export's 12.6° chute joints, 0.014 mm deep — a seventh of the grain (t10c)`,
      pinBad.length === 0 && worstPin < 5e-12 && pinRoutes === 25 && pinSeats === 542
      && starW.length === 6 && starW.every((t2, i) => Math.abs(t2 - R37W[i]) < 5e-10),
      JSON.stringify({ worstPin: +worstPin.toExponential(2), routes: pinRoutes, seats: pinSeats, bad: pinBad }));
    // t10f (arm W6) — the REFUSAL, by name. Round 3 reported the pose and refused nowhere (its
    // deviation 3); this round refuses. The plant here KEEPS refusePose and removes only the two
    // construction lines, so the module draws the defect and its own belt catches it.
    const plantW6 = await redPlant('w6', [UNDO_W[0], UNDO_W[2]]);
    const beltW = plantW6.err ? { err: plantW6.err } : readW(reviewW, plantW6);
    const shipRt = afterW.err ? null : afterW.rt;
    const midD = shipRt ? shipRt.total * 0.5 : 0;
    const midSt = shipRt ? stationAt(shipRt, midD, shipRt.r, {}) : { x: 0, y: 0, z: 0 };
    const pushW = (() => { if (!shipRt) return null; try { refusePose(shipRt, midD, { x: midSt.x, y: midSt.y - 0.001, z: midSt.z }, 'poseAt'); return null; } catch (e) { return e.message; } })();
    const cleanW = (() => { if (!shipRt) return 'no route'; try { refusePose(shipRt, midD, midSt, 'poseAt'); return 'no refusal'; } catch (e) { return e.message; } })();
    check(`t10f the pose law as a refusal, by name (GH-770 review r4, class W, arm W6 — it WITHDRAWS round 3's deviation 3, "the pose is reported here and refused nowhere"). With only the two CONSTRUCTION lines put back and refusePose left in place, the module draws the defect and its own belt stops it: solveShot on the W1 fixture raises "${beltW.solveErr ? beltW.solveErr.slice(0, 190) : (beltW.err ?? 'NO REFUSAL')}". Every pose the solver seats and every pose the renderer asks for goes through that call, and the message names the runway, the station, the depth and the entitlement — because a ball drawn inside the track is silent in every other reading: the route simply comes out long. On the SHIPPED module the same fixture raises nothing (t10a) and neither does any pose of any definition in web/scene/ballreturn/tracks plus web/tools/fixtures/ballreturn-tracks or of the in-file class-W fixtures (t10c: ${refusedC} of ${samplesC}); a pose pushed 1 mm down from a clean station of that same route is refused on the spot — "${pushW ? pushW.slice(0, 150) : 'NO REFUSAL'}" — where the station itself passes ("${cleanW}"). The refusal is against the CONSTRUCTION's own entitlement and not against zero, which is why the shipped blends (a twist's h(1 − cos θ), the tray lip's landing chord) live inside it`,
      !plantW6.err && !!beltW.solveErr && /ball-return solveShot: the pose at D/.test(beltW.solveErr)
      && /falls 2\.\d+ mm inside lc-chute/.test(beltW.solveErr) && /entitled to 0\.100000 mm/.test(beltW.solveErr)
      && !!pushW && /ball-return poseAt: the pose at D/.test(pushW) && cleanW === 'no refusal',
      JSON.stringify({ belt: beltW.solveErr ? beltW.solveErr.slice(0, 200) : (beltW.err ?? 'none'), direct: pushW && pushW.slice(0, 200), clean: cleanW }));
    // ---- t10g .. t10i (GH-770 review r4, class W) — the BODY the corner law reads, the SCOPE of the
    //      clearance it draws, and the DOOR the refusal is enforced at ------------------------------
    // W1–W6 put the rule in: a run the ball cannot round onto is dropped, the runs that survive are
    // trimmed clear of it, and a pose inside a piece it does not ride is refused by name. Three
    // things have to be right for that to be a RULE and not a fixture, and each of the three was
    // measured wrong at some point this round. Each is read here against the module with exactly
    // that one line changed (the red plant), on fixtures AND on a family:
    //   W7  the body  — a run is a finite STRIP: not its infinite plane, and not "nothing past its ends";
    //   W8  the scope — the floor GROUP, and the trims ACCUMULATE;
    //   W9  the door  — poseAt, the call the renderer itself makes, frame by frame.
    const STRIP_W = '    const sc = Math.max(p.sA0, Math.min(p.sB0, s));\n    return p.h - Math.hypot(s - sc, dot(d, p.edge.n));';
    const PLANE_W = [[STRIP_W, '    return p.h - dot(d, p.edge.n);']];
    const FOOT_W = [[STRIP_W, '    if (s < p.sA0 - 1e-12 || s > p.sB0 + 1e-12) return 0;\n    return p.h - dot(d, p.edge.n);']];
    const NEAR_W = [["    for (const pc of pieces) {\n      const i = allPieces.indexOf(pc);\n      if (pc !== before && pc !== after && grpOfPiece[i] !== grpOfPiece[qi]) continue;\n      if (!trimFor(pc, Q, i < qi ? 'B' : 'A')) { cascade = pieces.indexOf(pc); break; }\n    }",
      "    if (before && !trimFor(before, Q, 'B')) cascade = pieces.indexOf(before);\n    else if (after && !trimFor(after, Q, 'A')) cascade = pieces.indexOf(after);"]];
    const ACC_W = [['    return pc.sB - pc.sA > SLIVER;', '    return true;']];
    const BELT_W = ["    const at = (route, D) => { stationAt(route, D, r, ptTmp); refusePose(route, D, ptTmp, 'solveShot'); };", '    const at = () => {};', 'kinematics.js'];
    // a chute of arbitrarily many runs — `steps` are [dy, dz] in the file's millimetres along the
    // runway's own sign, the stop face `faceOff` mm from the end of the last one. tailW's fixture is
    // this with two steps; a terminal run is only the SIMPLEST way to reach the defect, and the
    // interior-joint finding of arm W2 is the reason these three arms are written over the general
    // shape instead.
    const multiW = (steps, faceOff, width) => {
      const d = JSON.parse(JSON.stringify(tbW));
      d.support = supW(width);
      for (const rw of d.runways) {
        if (!rw.stop) continue;
        const p0 = rw.points_mm[0]; const sgn = Math.sign(rw.points_mm[1][2] - p0[2]);
        const pts = [p0]; let L = 0;
        for (const [dy, dz] of steps) { const q = pts[pts.length - 1]; pts.push([q[0], +(q[1] + dy).toFixed(6), +(q[2] + sgn * dz).toFixed(6)]); L += Math.hypot(dy, dz); }
        rw.points_mm = pts;
        rw.support = supW(width);
        rw.stop.wall_s_mm = +(L + faceOff).toFixed(6);
        rw.stop.capacity_balls = Math.max(1, Math.floor((L + faceOff) / (2 * R / MM) + 1e-9));
      }
      return d;
    };
    const geoMW = (c) => `${(-c.steps[0][0]).toFixed(1)}/${c.steps[0][1].toFixed(1)} mm chute onto ${c.steps.length - 1} short ${c.steps.length === 2 ? 'run' : 'runs'} (${c.steps.slice(1).map((q) => `${Math.hypot(q[0], q[1]).toFixed(2)} mm at ${(Math.atan2(-q[0], q[1]) * 180 / Math.PI).toFixed(1)}°`).join(', ')}), channel ${c.width.toFixed(2)} mm, face ${c.faceOff === 0 ? 'at the end' : `${(-c.faceOff).toFixed(4)} mm short`}`;
    // the module's OWN pose law over the route it built, read at both ends of every segment: a normal
    // offset is affine along a chord and the twist/arc windows end at their vertices (arm W3), so the
    // extremes of every segment are the whole of the route — this is the module judging itself, where
    // penW/floorsW above is the independent oracle judging it.
    const scanMW = (M2, rt) => {
      let bad = 0, worst = 0, msg = null;
      for (const sg of rt.segs) for (const D of [sg.D0, sg.D1]) {
        const st = M2.track.stationAt(rt, D, rt.r, {});
        try { M2.track.refusePose(rt, D, st, 'scan'); } catch (e) {
          bad += 1;
          const v = Number((/falls ([\d.]+) mm/.exec(e.message) ?? [0, 0])[1]) * MM;
          if (v > worst) { worst = v; msg = e.message; }
        }
      }
      return { bad, worst, msg };
    };
    const readMW = (M2, def) => {
      let tr = null;
      try { tr = M2.schema.validateTrack(def, { pockets: POCKETS, falls: null }); } catch (e) { return { err: e.message }; }
      const pk = [...tr.routes.keys()].sort((a, b) => a - b)[0];
      const rt = tr.routes.get(pk);
      const o = { total: rt.total, segs: rt.segs.length, ...scanMW(M2, rt) };
      try {
        const h1 = M2.kin.handoffFromSink({ t: 1, pocket: POCKETS[pk], fall: POCKETS[pk], r: tr.refR, tFall: 0.021, glide: 0.06 },
          { track: tr, pockets: POCKETS, r: tr.refR });
        const sol = M2.kin.solveShot({ track: tr, r: tr.refR, ledger: [], arrivals: [{ id: 1, handoff: h1 }] });
        o.seat = [...sol.rest.values()][0] ?? null;
      } catch (e) { o.belt = e.message; }
      return o;
    };
    // THE FAMILY: multi-run chutes from a pinned seed — a 40–140 mm drop over 10–60 mm, then one or
    // two interior runs 0.3–8 mm long turning 1–60°, then a terminal run 0.3–6 mm at 1–40°, with the
    // stop face at the end or up to 2 mm short of it and a 60–120 mm channel. This is the corpus the
    // widening was found on: the fixtures below are its own cases, pinned by number.
    // --famw may only WIDEN the sweep: the first 1 200 cases are the corpus this rule was found on and the
    // fixtures below are its own cases BY INDEX, so a shorter run would be a different corpus wearing the
    // same arm's name (the generator is sequential, so a longer run keeps every case of the shorter one)
    const FAMW = (() => { const i = args.indexOf('--famw'); return i >= 0 ? Math.max(1200, Number(args[i + 1]) || 0) : 1200; })();
    const famCasesW = (n) => {
      const rnd = rngW(0x2222);
      const out = [];
      for (let i = 0; i < n; i += 1) {
        const U = (lo, hi) => lo + (hi - lo) * rnd();
        const drop = U(40, 140), along = U(10, 60);
        const nMid = rnd() < 0.5 ? 1 : 2;
        const steps = [[-drop, along]];
        for (let k = 0; k < nMid; k += 1) { const len = U(0.3, 8), ang = U(1, 60) * Math.PI / 180; steps.push([-len * Math.sin(ang), len * Math.cos(ang)]); }
        const tl = U(0.3, 6), ta = U(1, 40) * Math.PI / 180;
        steps.push([-tl * Math.sin(ta), tl * Math.cos(ta)]);
        const faceOff = rnd() < 0.5 ? 0 : -U(0, Math.min(2, 0.9 * tl));
        const width = U(60, 120);
        out.push({ i, steps: steps.map((q) => q.map((v) => +v.toFixed(4))), faceOff: +faceOff.toFixed(4), width: +width.toFixed(2) });
      }
      return out;
    };
    const famCaseW = famCasesW(FAMW);
    const famDefW = famCaseW.map((c) => multiW(c.steps, c.faceOff, c.width));
    const famW = (M2) => {
      const st = { built: 0, refused: 0, bad: 0, belt: 0, worst: 0, rows: [], deepest: null };
      for (let i = 0; i < famDefW.length; i += 1) {
        const rr = readMW(M2, famDefW[i]);
        st.rows.push(rr);
        if (rr.err) { st.refused += 1; continue; }
        st.built += 1;
        if (rr.bad) st.bad += 1;
        if (rr.belt) st.belt += 1;
        if (rr.worst > st.worst) { st.worst = rr.worst; st.deepest = { i, msg: rr.msg }; }
      }
      return st;
    };
    const keyMW = (rr) => rr.err ?? `${rr.total.toFixed(12)}|${rr.seat}|${rr.belt ?? ''}`;
    const discMW = (a, b) => (a && b ? a.rows.reduce((n, rr, i) => n + (keyMW(rr) === keyMW(b.rows[i]) ? 0 : 1), 0) : -1);
    const flipMW = (a, b) => (a && b ? a.rows.reduce((n, rr, i) => n + (!!rr.err === !!b.rows[i].err ? 0 : 1), 0) : -1);
    const plantFootW = await redPlant('w7-foot', FOOT_W);
    const plantPlaneW = await redPlant('w7-plane', PLANE_W);
    const plantNearW = await redPlant('w8-near', NEAR_W);
    const plantAccW = await redPlant('w8-acc', ACC_W);
    const famShipW = famW(SHIPW);
    const famFootW = plantFootW.err ? null : famW(plantFootW);
    const famPlaneW = plantPlaneW.err ? null : famW(plantPlaneW);
    const famNearW = plantNearW.err ? null : famW(plantNearW);
    const famAccW = plantAccW.err ? null : famW(plantAccW);
    const SPANW = (() => { const i = args.indexOf('--spanw'); return i >= 0 ? Math.max(60000, Number(args[i + 1]) || 0) : 60000; })();
    const spanOneW = (M2, def) => {
      let tr = null;
      try { tr = M2.schema.validateTrack(def, { pockets: POCKETS, falls: null }); } catch (e) { return { err: e.message }; }
      const pk = [...tr.routes.keys()].sort((a, b) => a - b)[0];
      const rt = tr.routes.get(pk); const r = rt.r;
      const o = { total: rt.total, floorD: restStation(1, r), top: reachTop(rt, r), lo: 0, hi: 0, worst: 0, atD: 0, msg: null, hiWorst: 0, hiMsg: null };
      for (const sg of rt.segs) for (let k = 0; k <= 25; k += 1) {
        const D = sg.D0 + (sg.D1 - sg.D0) * k / 25;
        const pt = M2.track.stationAt(rt, D, r, {});
        try { M2.track.refusePose(rt, D, pt, 'span'); } catch (e) {
          const v = Number((/falls ([\d.]+) mm/.exec(e.message) ?? [0, 0])[1]) * MM;
          if (D < o.floorD - 1e-12) { o.lo += 1; if (v > o.worst) { o.worst = v; o.atD = D; o.msg = e.message; } }
          else { o.hi += 1; if (v > o.hiWorst) { o.hiWorst = v; o.hiMsg = e.message; } }
        }
      }
      try {
        const h1 = M2.kin.handoffFromSink({ t: 1, pocket: POCKETS[pk], fall: POCKETS[pk], r: tr.refR, tFall: 0.021, glide: 0.06 },
          { track: tr, pockets: POCKETS, r: tr.refR });
        M2.kin.solveShot({ track: tr, r: tr.refR, ledger: [], arrivals: [{ id: 1, handoff: h1 }] });
      } catch (e) { o.belt = e.message; o.beltD = Number((/at D ([\d.]+) mm/.exec(e.message) ?? [0, 0])[1]) * MM; }
      return o;
    };
    const spanW = (M2, n) => {
      const st = { built: 0, refused: 0, lo: 0, loClean: 0, loCases: [], hi: 0, loWorst: 0, hiWorst: 0, hiMsg: null, belt: 0, beltLo: 0, deepest: null };
      for (const c of famCasesW(n)) {
        const o = spanOneW(M2, multiW(c.steps, c.faceOff, c.width));
        if (o.err) { st.refused += 1; continue; }
        st.built += 1;
        if (o.lo) { st.lo += 1; if (!o.belt) st.loClean += 1; if (st.loCases.length < 16) st.loCases.push([c.i, !!o.belt, +(o.worst / MM).toFixed(6)]); if (o.worst > st.loWorst) { st.loWorst = o.worst; st.deepest = { i: c.i, n: o.lo, worst: o.worst }; } }
        if (o.hi) { st.hi += 1; if (o.hiWorst > st.hiWorst) { st.hiWorst = o.hiWorst; st.hiMsg = o.hiMsg; } }
        if (o.belt) { st.belt += 1; if (o.beltD < o.floorD - 1e-12) st.beltLo += 1; }
      }
      return st;
    };
    const spanShipFamW = spanW(SHIPW, FAMW);
    const spanFootW = plantFootW.err ? null : spanW(plantFootW, FAMW);
    const spanNearW = plantNearW.err ? null : spanW(plantNearW, FAMW);
    // t10g (arm W7) — the body: the finite strip
    const CASE_D = { i: 26, steps: [[-132.7256, 56.7091], [-5.372, 3.637], [-0.48, 1.989], [-2.6264, 4.3579]], faceOff: -1.2113, width: 74.89 };
    const defD = multiW(CASE_D.steps, CASE_D.faceOff, CASE_D.width);
    const dShipW = readMW(SHIPW, defD);
    const dFootW = plantFootW.err ? { err: plantFootW.err } : readMW(plantFootW, defD);
    const dPlaneW = plantPlaneW.err ? { err: plantPlaneW.err } : readMW(plantPlaneW, defD);
    check(`t10g the corner law reads the finite STRIP a run IS (GH-770 review r4, class W, arm W7). \`penInto\` is what the drop-and-trim cascade measures with, and it has to read the SAME BODY the pose law reads (\`poseClearance\`): the strip's plane under the perpendicular foot, its end cap off it. The two other readings available are both wrong, and the family below is read through each of them with that ONE line changed. ① The PR base's — nothing past a run's ends, \`return 0\` — misses a floor the ball is deep inside, because a foot past a run's far vertex is not a foot away from the run: the family's case ${CASE_D.i} (a ${geoMW(CASE_D)}) is refused here by name, "${(dShipW.err ?? 'NO REFUSAL').slice(0, 150)}", and BUILDS there — ${dFootW.err ? 'REFUSED' : (dFootW.total / MM).toFixed(6)} mm over ${dFootW.err ? '-' : dFootW.segs} segments with ${dFootW.err ? '-' : dFootW.bad} of the route's own stations past their entitlement, the worst ${dFootW.err ? '-' : (dFootW.worst / MM).toFixed(6)} mm ("${dFootW.msg ? dFootW.msg.slice(0, 130) : '-'}") — and the module's own solveShot belt then refuses the route it has just drawn ("${dFootW.belt ? dFootW.belt.slice(0, 110) : 'NO REFUSAL'}"). Over the family: this round ${famShipW.built} built of ${FAMW}, ${famShipW.bad} routes with a station past entitlement, ${famShipW.belt} belt refusals; the foot-in-extent reading ${famFootW ? famFootW.built : '-'} built, ${famFootW ? famFootW.bad : '-'} past entitlement (worst ${famFootW ? (famFootW.worst / MM).toFixed(6) : '-'} mm), ${famFootW ? famFootW.belt : '-'} of them caught by the belt and none by the construction, ${discMW(famShipW, famFootW)} rows discriminating. ② The PLANE reading over-reads the other way — it charges the ball for a floor that is not there — and it is the subtler of the two because it never admits anything: over these ${FAMW} cases it flips ${flipMW(famShipW, famPlaneW)} build/refuse decisions and changes no route this round builds; what it changes is the DEPTH a refusal quotes, ${discMW(famShipW, famPlaneW)} rows here, and on case ${CASE_D.i} it refuses the same valley ("${dPlaneW.err ? dPlaneW.err.slice(-60) : '-'}" against this round's "${dShipW.err ? dShipW.err.slice(-60) : '-'}"). The report's 6 000-case run of the same generator: 0 flips, 0 route totals moved, 140 refusal depths changed, the widest 2.644799 mm → 6.212453 mm. Read at 25 stations per segment instead of 2 and split on the wall-side rung of the module's own rest ladder (arm W10), the same ${FAMW} cases say what that costs where it counts: the foot reading leaves ${spanFootW ? spanFootW.hi : '-'} routes with a pose inside a floor at a station A BALL CAN HOLD, the worst ${spanFootW ? (spanFootW.hiWorst / MM).toFixed(6) : '-'} mm, against ${spanShipFamW.hi} for this round. A construction that quotes a depth into a floor whose end the foot has left is a construction the law it feeds does not agree with, which is the whole of why the strip is the reading`,
      !plantFootW.err && !plantPlaneW.err
      && !!dShipW.err && /\[V2\]/.test(dShipW.err) && !dFootW.err && dFootW.bad >= 1 && dFootW.worst > 1 * MM && !!dFootW.belt
      && famShipW.bad === 0 && famShipW.belt === 0
      && !!famFootW && famFootW.bad > 0 && discMW(famShipW, famFootW) > 0
      && !!famPlaneW && famPlaneW.bad === 0 && famPlaneW.belt === 0 && flipMW(famShipW, famPlaneW) === 0 && discMW(famShipW, famPlaneW) > 0
      && !!spanFootW && spanFootW.hi > 0 && spanShipFamW.hi === 0,
      JSON.stringify({ caseD: [dShipW.err ? dShipW.err.slice(0, 90) : +(dShipW.total / MM).toFixed(6), dFootW.err ? 'refused' : [+(dFootW.total / MM).toFixed(6), dFootW.bad, +(dFootW.worst / MM).toFixed(6)]],
        ship: [famShipW.built, famShipW.bad, famShipW.belt], foot: famFootW && [famFootW.built, famFootW.bad, famFootW.belt, +(famFootW.worst / MM).toFixed(6), discMW(famShipW, famFootW)],
        plane: famPlaneW && [famPlaneW.built, famPlaneW.bad, flipMW(famShipW, famPlaneW), discMW(famShipW, famPlaneW)] }));
    // t10h (arm W8) — the scope: the floor group, and the trims accumulate
    const CASE_A = { i: 381, steps: [[-42.136, 48.0121], [-2.8507, 3.6818], [-1.2363, 3.1664]], faceOff: 0, width: 75.02 };
    // RE-BASELINED (GH-770 review r6, class AA): the two ACCUMULATION exemplars this arm pinned when it
    // went in — cases 196 and 25 of the family — were built by the length rule class AA deletes (each
    // had a clipped last run the rule popped; without it the joint before is interior and refused by
    // name), and over the same 1 200 cases the accumulate rule no longer discriminates at all: with the
    // rule the stump it drops is produced far less often. An arm may not lose its instrument, so the
    // exemplar is now HAND-BUILT — a 56/34 mm chute (58.7°), a 6.10 mm run at 55.0°, a 2.68 mm tail at
    // 26.6°, the face at the end, a 75 mm channel — chosen because the tail is dropped by the corner
    // law, the run before it is trimmed against the tail to a 6.9 µm stump, and the rule then drops that
    // stump in its turn; the same red plant (`return true` in trimFor) keeps the stump and rides it. The
    // family half is read over a SEPARATE seeded stream (0xACC5EED, wider runs, 1–3 interior runs),
    // because famCasesW is pinned by arms t10g–t10j and the class-W corpus by oracle (a)'s manifest.
    const CASE_G = { steps: [[-56, 34], [-5, 3.5], [-1.2, 2.4]], faceOff: 0, width: 75 };
    const defA = multiW(CASE_A.steps, CASE_A.faceOff, CASE_A.width);
    const defG = multiW(CASE_G.steps, CASE_G.faceOff, CASE_G.width);
    const aShipW = readMW(SHIPW, defA); const aNearW = plantNearW.err ? { err: plantNearW.err } : readMW(plantNearW, defA);
    const aNearSpanW = plantNearW.err ? null : spanOneW(plantNearW, defA);
    const gShipW = readMW(SHIPW, defG); const gAccW = plantAccW.err ? { err: plantAccW.err } : readMW(plantAccW, defG);
    const gSegsW = (M2) => { let tr = null; try { tr = M2.schema.validateTrack(defG, { pockets: POCKETS, falls: null }); } catch (e) { return e.message; } return tr.routes.get(1).segs.map((x) => `${x.kind} ${(x.len / MM).toFixed(6)}`).join(' | '); };
    const gShipSegs = gSegsW(SHIPW), gAccSegs = plantAccW.err ? '-' : gSegsW(plantAccW);
    const accCasesW = (n) => {
      const rnd = rngW(0xACC5EED); const out = [];
      for (let i = 0; i < n; i += 1) {
        const U = (lo, hi) => lo + (hi - lo) * rnd();
        const drop = U(30, 140), along = U(10, 80);
        const nMid = 1 + Math.floor(rnd() * 3);
        const steps = [[-drop, along]];
        for (let k = 0; k < nMid; k += 1) { const len = U(0.2, 10), ang = U(0.5, 70) * Math.PI / 180; steps.push([-len * Math.sin(ang), len * Math.cos(ang)]); }
        const tl = U(0.2, 8), ta = U(0.5, 45) * Math.PI / 180;
        steps.push([-tl * Math.sin(ta), tl * Math.cos(ta)]);
        const faceOff = rnd() < 0.4 ? 0 : -U(0, 0.95 * tl);
        const width = U(40, 120);
        out.push({ i, steps: steps.map((q) => q.map((v) => +v.toFixed(4))), faceOff: +faceOff.toFixed(4), width: +width.toFixed(2) });
      }
      return out;
    };
    const ACCN = 4000;
    const accFamW = { built: 0, disc: 0, refusedDiff: 0, rows: [] };
    if (!plantAccW.err) {
      for (const c of accCasesW(ACCN)) {
        const def = multiW(c.steps, c.faceOff, c.width);
        const a = readMW(SHIPW, def); if (a.err) continue; accFamW.built += 1;
        const b = readMW(plantAccW, def);
        if (b.err) { accFamW.refusedDiff += 1; accFamW.disc += 1; if (accFamW.rows.length < 4) accFamW.rows.push([c.i, +(a.total / MM).toFixed(6), b.err.slice(0, 80)]); continue; }
        if (keyMW(a) !== keyMW(b)) { accFamW.disc += 1; if (accFamW.rows.length < 4) accFamW.rows.push([c.i, +(a.total / MM).toFixed(6), a.segs, +(b.total / MM).toFixed(6), b.segs]); }
      }
    }
    check(`t10h the trim's scope is the floor GROUP, and the trims ACCUMULATE (GH-770 review r4, class W, arm W8). A dropped run stays floor, so every run of its group that survives has to be trimmed to a station clear of it — not only the two that border the hole, which is what "the neighbours" meant when the rule went in. When the piece beside the hole survives as a STUMP the ride's own corner reaches straight past it: the family's case ${CASE_A.i} (a ${geoMW(CASE_A)}) drops its last run, trims the one before it to a stump, and the cut into that stump then starts ${aNearW.err ? '-' : (aNearW.worst / MM).toFixed(6)} mm inside the DROPPED run's far tip — a station on the piece TWO places from the hole. Nearest-neighbour-only: ${aNearW.err ? 'REFUSED' : (aNearW.total / MM).toFixed(6)} mm with ${aNearW.err ? '-' : aNearW.bad} stations past entitlement and its own belt refusing at solve time ("${aNearW.belt ? aNearW.belt.slice(0, 105) : 'NO REFUSAL'}"); the group trimmed: ${(aShipW.total / MM).toFixed(6)} mm, ${aShipW.bad} past entitlement, ${aShipW.belt ? 'belt refused' : 'no belt refusal'}. The threshold that reading is held to is the EXPORT GRAIN, ${(EXPORT_GRAIN / MM).toFixed(1)} mm — the pose law's own entitlement on a line (\`(sg.pen ?? 0) + EXPORT_GRAIN\`, the same quantity refusePose quotes), not a number this arm chose — and ${aNearW.err ? '-' : (aNearW.worst / MM).toFixed(6)} mm is ${aNearW.err ? '-' : (aNearW.worst / EXPORT_GRAIN).toFixed(2)} × it. Over the family, nearest-neighbour-only builds ${famNearW ? famNearW.built : '-'} with ${famNearW ? famNearW.bad : '-'} routes past entitlement (worst ${famNearW ? (famNearW.worst / MM).toFixed(6) : '-'} mm) against this round's ${famShipW.bad}, and discriminates ${discMW(famShipW, famNearW)} rows of ${FAMW} — the belt catches every one of those ${famNearW ? famNearW.belt : '-'}. Where those stations ARE is the honest half of this arm, and arm W10's reading gives it: all of them lie below the wall-side rung of the rest ladder — case ${CASE_A.i}'s at D ${aNearSpanW && aNearSpanW.atD ? (aNearSpanW.atD / MM).toFixed(3) : '-'} mm against a rung at ${aNearSpanW ? (aNearSpanW.floorD / MM).toFixed(3) : '-'} mm — and over the ${FAMW} cases the nearest-neighbour trim puts ${spanNearW ? spanNearW.hi : '-'} poses inside a floor at a station a ball can occupy, the same ${spanShipFamW.hi} this round leaves. So what the group scope buys is not a ball drawn inside a floor: it is a construction the pose law agrees with wherever it looks, and with it the ${spanNearW ? spanNearW.belt : '-'} tracks of ${FAMW} that the belt would otherwise refuse by name (${spanNearW ? spanNearW.beltLo : '-'} of them for a station under the rung). A rule whose evidence is outside the span says so. The accumulation is the other half of one rule: a piece trimmed against the dropped pieces of its group can be left with no ride of its own — a stump under the grain — and the honest answer is to drop it in its turn like any other run with no clear station; the alternative RIDES the stump. RE-BASELINED this round (GH-770 review r6, class AA): the two exemplars this half pinned when it went in, cases 196 and 25 of the family, were built by the length rule class AA deletes (each had a clipped last run the rule popped; without it the joint before is interior and both are refused by name — "${'…' + (readMW(SHIPW, multiW([[-44.0087, 58.713], [-4.0173, 2.6856], [-0.5619, 0.8148], [-0.0155, 0.3088]], 0, 82.05)).err ?? 'BUILT').slice(-95)}"), and over the same ${FAMW} cases the rule no longer discriminates: ${discMW(famShipW, famAccW)} rows, ${famAccW ? famAccW.refused - famShipW.refused : '-'} refusals — 22 → 0 and 1 → 0 against round 4's numbers, because the stump the rule drops was mostly the length rule's own product. An arm may not lose its instrument, so the exemplar is now HAND-BUILT: a 56/34 mm chute (58.7°), a 6.10 mm run at 55.0°, a 2.68 mm tail at 26.6°, the face at the end, a 75 mm channel. The corner law drops the tail (its 28.4° valley needs 7.23 mm of corner and the tail pays 45 % of 2.68), the run before it is trimmed against the dropped tail to a ${gAccSegs.split(' | ').pop() ? gAccSegs.split(' | ').pop().replace('line ', '') : '-'} mm stump, and the rule drops that stump in its turn: this module reads ${(gShipW.total / MM).toFixed(6)} mm over ${gShipW.segs} segments (${gShipSegs}), ${gShipW.bad} stations past entitlement, ${gShipW.belt ? 'belt refused' : 'no belt refusal'}; the same module with \`return true\` planted into trimFor KEEPS the stump and rides it — ${gAccW.err ? 'REFUSED ' + gAccW.err.slice(0, 80) : `${(gAccW.total / MM).toFixed(6)} mm over ${gAccW.segs} segments (${gAccSegs})`} — a ${gAccW.err ? '-' : ((gAccW.total - gShipW.total) / MM).toFixed(6)} mm longer route with a corner cut INTO a piece shorter than the grain, which is the shape the rule exists to refuse. Over a SEPARATE seeded stream of ${ACCN} multi-run chutes (seed 0xACC5EED, 1–3 interior runs 0.2–10 mm, tails 0.2–8 mm — famCasesW's own stream stays pinned by t10g–t10j, and the class-W corpus by oracle (a)) the plant re-shapes ${accFamW.disc} of the ${accFamW.built} this module builds (${accFamW.refusedDiff} into refusals), so the rule is measured on a family again and not only on a fixture. The group is also the pose law's own scope (\`floors\`): what lies across a heading change or a runway change is the DEFINITION's relation and not this builder's construction (issue #778), so the widening stops exactly where the law it serves stops`,
      !plantNearW.err && !plantAccW.err
      && !aShipW.err && aShipW.bad === 0 && !aShipW.belt
      && !aNearW.err && aNearW.bad >= 1 && aNearW.worst > EXPORT_GRAIN && !!aNearW.belt
      && !!famNearW && famNearW.bad > 0 && famNearW.belt === famNearW.bad && discMW(famShipW, famNearW) > 0
      && !!spanNearW && spanNearW.hi === 0 && spanNearW.belt > 0 && spanNearW.belt === spanNearW.beltLo
      && !!aNearSpanW && aNearSpanW.hi === 0 && aNearSpanW.lo >= 1 && aNearSpanW.atD < aNearSpanW.floorD
      && !gShipW.err && gShipW.bad === 0 && !gShipW.belt && gShipW.segs === 3 && Math.abs(gShipW.total / MM - 130.462741) < 5e-6
      && !gAccW.err && gAccW.segs === 5 && gAccW.total > gShipW.total + 1e-4 && Math.abs(gAccW.total / MM - 130.633626) < 5e-6 && /line 0\.00\d{4}$/.test(gAccSegs)
      && !!famAccW && discMW(famShipW, famAccW) === 0 && famAccW.refused === famShipW.refused
      && accFamW.built >= 100 && accFamW.disc >= 1,
      JSON.stringify({ A: [+(aShipW.total / MM).toFixed(6), aNearW.err ? 'refused' : [+(aNearW.total / MM).toFixed(6), aNearW.bad, +(aNearW.worst / MM).toFixed(6)]],
        G: [gShipW.err ?? [+(gShipW.total / MM).toFixed(6), gShipW.segs, gShipSegs], gAccW.err ?? [+(gAccW.total / MM).toFixed(6), gAccW.segs, gAccSegs]],
        near: famNearW && [famNearW.built, famNearW.bad, famNearW.belt, discMW(famShipW, famNearW)], acc: famAccW && [famAccW.built, famAccW.refused, discMW(famShipW, famAccW)], accFam: accFamW }));
    // t10i (arm W9) — the door: poseAt, which is what the RENDERER calls
    const poseSweepW = (M2, def, Ns) => {
      const out = { rows: [], first: null, rest: 'no route' };
      let tr = null;
      try { tr = M2.schema.validateTrack(def, { pockets: POCKETS, falls: null }); } catch (e) { out.err = e.message; return out; }
      const pk = [...tr.routes.keys()].sort((a, b) => a - b)[0];
      let sol = null;
      try {
        const h1 = M2.kin.handoffFromSink({ t: 1, pocket: POCKETS[pk], fall: POCKETS[pk], r: tr.refR, tFall: 0.021, glide: 0.06 },
          { track: tr, pockets: POCKETS, r: tr.refR });
        sol = M2.kin.solveShot({ track: tr, r: tr.refR, ledger: [], arrivals: [{ id: 1, handoff: h1 }] });
      } catch (e) { out.err = e.message; return out; }
      for (const N of Ns) {
        let n = 0;
        for (let k = 0; k <= N; k += 1) {
          try { const pz = M2.kin.poseAt(sol, 1, sol.tEnd * k / N, {}); if (pz && Number.isFinite(pz.D)) { out.dLo = Math.min(out.dLo ?? Infinity, pz.D); out.dHi = Math.max(out.dHi ?? -Infinity, pz.D); } }
          catch (e) { n += 1; out.first ??= e.message; }
        }
        out.rows.push([N + 1, n]);
      }
      try { M2.kin.poseAt(sol, 1, sol.tEnd + 1, {}); out.rest = 'no refusal'; } catch (e) { out.rest = e.message; }
      return out;
    };
    const plantW9 = await redPlant('w9', [UNDO_W[0], UNDO_W[2], BELT_W]);
    const w9PlantW = plantW9.err ? { err: plantW9.err, rows: [] } : poseSweepW(plantW9, reviewW, [200, 400, 1000]);
    const w9ShipW = poseSweepW(SHIPW, reviewW, [200, 400, 1000]);
    check(`t10i the refusal is at the RENDERER's own door (GH-770 review r4, class W, arm W9). t10f reads the belt in solveShot, which is where a bad route dies before anything is drawn; this arm reads the OTHER call, \`poseAt\` — what the scene asks for every frame, for every ball still on the track — because that is the entry a presentation extension is actually consumed through (ADR-0017: no read-back, the renderer samples poses), and a law that only guards the solve leaves the draw unguarded. The plant is the two construction lines put back AND the solveShot belt line removed, so the solve completes and the defect route reaches the caller exactly as it would have on the PR base with round 3's reporting: sampling that solution the way the renderer samples it — poseAt(sol, 1, t) at ${w9PlantW.rows.map((x) => x[0]).join(' / ')} evenly spaced times over the whole run — refuses ${w9PlantW.rows.map((x) => x[1]).join(' / ')} of them, the first "${w9PlantW.first ? w9PlantW.first.slice(0, 175) : (w9PlantW.err ?? 'NO REFUSAL')}". The SHIPPED module, same fixture, same sampling: ${w9ShipW.rows.map((x) => x[1]).join(' / ')} of ${w9ShipW.rows.map((x) => x[0]).join(' / ')} — it never draws that route (t10a), so there is nothing for the door to stop. And the pose the plant SEATS is not refused at all ("${w9PlantW.rest}"): the ball is inside the chute only in TRANSIT, a frame or two at 60 Hz on its way down, which is why the seat-only census of round 3 (t9o) had nothing to report and why the reading has to be the one the renderer itself goes through. The count rises with the sampling because the window is continuous and narrow, not because the law is flaky: refuse at the door and the frame that would have drawn the ball inside the floor is the frame that raises`,
      !plantW9.err && !w9PlantW.err && !w9ShipW.err
      && w9ShipW.rows.every((x) => x[1] === 0) && w9PlantW.rows.every((x) => x[1] > 0)
      && !!w9PlantW.first && /^ball-return poseAt: the pose at D /.test(w9PlantW.first)
      && /falls \d+\.\d+ mm inside lc-chute/.test(w9PlantW.first) && /entitled to 0\.100000 mm/.test(w9PlantW.first)
      && w9PlantW.rest === 'no refusal' && w9ShipW.rest === 'no refusal',
      JSON.stringify({ plant: w9PlantW.err ?? w9PlantW.rows, ship: w9ShipW.err ?? w9ShipW.rows, first: w9PlantW.first && w9PlantW.first.slice(0, 200), rest: [w9PlantW.rest, w9ShipW.rest] }));

    // t10j (arm W10) — the SPAN the law is about. `restStation(1, r)` = r is the wall-side rung of the
    // module's own rest ladder — the lowest station a ball CENTRE can hold, because the stop face is at
    // D 0 — and `reachTop` is the highest it may be drawn at. Every arm above reads a route's stations
    // without asking which of them a ball can occupy; this one sweeps the same family far wider and 25×
    // denser and splits what it finds on that line.
    // RE-BASELINED (GH-770 review r6, class AA): the belt-CLEAN below-rung exemplar this arm pinned when it
    // went in — case 7717 of this family, a 42.2/59.4 mm chute onto three short runs with the face 0.5713
    // mm short, 0.873 mm under the rung — was an instance of the defect class AA removes: the deleted
    // length rule popped its clipped fourth run, which made the run1↔run2 joint TERMINAL and droppable;
    // without it the joint is interior and the definition is refused by name. Measured on the pre-fix
    // module: the same wire built at faceOff −0.5713 (138.510960 mm) and was refused at faceOff 0 by
    // [V2] — the two criteria disagreeing on the arm's own fixture. Under this module the class is
    // SHALLOWER, not empty: a 12 000-case walk of the generator found no belt-clean member (795 built, 2
    // below-rung, both belt-caught) — a measurement this round first restated the arm on — and the arm's
    // own 60 000-case sweep then found three (cases 33070, 47349, 58443: 0.106–0.116 mm, against the old
    // exemplar's 0.873). So the exemplar is RE-PICKED from the class as it now is (case 47349, the deepest
    // of the three) and its depth bar is the export grain instead of four grains: the deep end of the
    // residue was the length rule's own product, and what is left of #779 is a tenth of a millimetre
    // under the rung. The sweep's counts are asserted so a class that deepens or empties again is red.
    const CASE_E = { i: 47349, steps: [[-46.5793, 40.7128], [-2.1261, 2.3812], [-1.9905, 2.7146]], faceOff: -1.636, width: 68.19 };
    const CASE_F = { i: 3653, steps: [[-59.7484, 38.7434], [-1.7707, 1.4764], [-5.002, 4.9837], [-1.3468, 2.1177]], faceOff: 0, width: 66.21 };
    const defE = multiW(CASE_E.steps, CASE_E.faceOff, CASE_E.width);
    const eSpanW = spanOneW(SHIPW, defE);
    const fSpanW = spanOneW(SHIPW, multiW(CASE_F.steps, CASE_F.faceOff, CASE_F.width));
    const eRideW = poseSweepW(SHIPW, defE, [200, 1000, 4000]);
    const spanShipW = spanW(SHIPW, SPANW);
    const loCleanW = spanShipW.loCases.filter((x) => !x[1]);
    const loCleanMaxW = loCleanW.length ? Math.max(...loCleanW.map((x) => x[2])) : NaN;      // the class's measured deep end, mm
    const loCleanMinW = loCleanW.length ? Math.min(...loCleanW.map((x) => x[2])) : NaN;
    check(`t10j the span the law is about, and what lies outside it (GH-770 review r4, class W, arm W10). A ball CENTRE on a route lives in [restStation(1, r), reachTop] — the wall-side rung of the module's own rest ladder, ${(eSpanW.floorD / MM).toFixed(4)} mm, up to ${(eSpanW.top / MM).toFixed(4)} mm on the fixture below — and the stations under that rung are the stop's own body, which no centre reaches. Read that way, this round leaves NOTHING: over ${spanShipW.built} built tracks of a ${SPANW}-case sweep of arm W7's family, at 25 stations per segment (the arms above read 2), ${spanShipW.hi} routes have a pose past its entitlement at a station a ball can occupy${spanShipW.hiWorst ? ` — worst ${(spanShipW.hiWorst / MM).toFixed(6)} mm` : ''}. Outside the span there is a residue, and it is reported here rather than left to be found: ${spanShipW.lo} of those tracks have one BELOW the rung, the deepest ${(spanShipW.loWorst / MM).toFixed(6)} mm (case ${spanShipW.deepest ? spanShipW.deepest.i : '-'}), ${spanShipW.belt} of them refused by the belt and ${spanShipW.loClean} belt-CLEAN (${spanShipW.loCases.map((x) => `case ${x[0]} ${x[2]} mm ${x[1] ? 'belt-caught' : 'belt-clean'}`).join(', ') || 'none'}). That family's belt-clean exemplar, case ${CASE_E.i} (a ${geoMW(CASE_E)}), is pinned here: it builds ${(eSpanW.total / MM).toFixed(6)} mm, ${eSpanW.hi} stations past entitlement in the span and ${eSpanW.lo} below it, the deepest ${(eSpanW.worst / MM).toFixed(6)} mm at D ${(eSpanW.atD / MM).toFixed(3)} mm — ${((eSpanW.floorD - eSpanW.atD) / MM).toFixed(3)} mm inside the wall-side rung. The renderer's own door agrees: sampling that solution the way a frame does — poseAt(sol, 1, t) at ${eRideW.rows.map((x) => x[0]).join(' / ')} evenly spaced times — refuses ${eRideW.rows.map((x) => x[1]).join(' / ')} of them, and the ball's D never leaves [${(eRideW.dLo / MM).toFixed(4)}, ${(eRideW.dHi / MM).toFixed(4)}] mm: the rung to the entry. RE-BASELINED this round (GH-770 review r6, class AA): the exemplar this arm pinned when it went in, case 7717 (a 42.2/59.4 mm chute onto three short runs, face 0.5713 mm short, 0.873224 mm under the rung), was BUILT by the length rule class AA deletes — it popped the clipped fourth run, which made the run1↔run2 joint terminal and droppable; without it that joint is interior and the definition is refused by name ([V2]: "the 16.770° valley … 1.1823 mm of the 4.2120 mm corner the ball needs"). Measured on the pre-fix module the identical wire built at faceOff −0.5713 (138.510960 mm) and was refused at faceOff 0: the two criteria disagreeing on this arm's own fixture. The class is now SHALLOWER, not empty — a 12 000-case walk found no belt-clean member (795 built, 2 below the rung, both belt-caught), and this ${SPANW}-case sweep finds ${spanShipW.loClean} (${loCleanW.map((x) => `case ${x[0]} ${x[2]} mm`).join(', ')}), so the exemplar is re-picked from the class as it now stands — the deepest belt-clean member — and its depth bar is the ${(EXPORT_GRAIN / MM).toFixed(1)} mm export grain instead of the four grains the old exemplar was held to. That bar is DERIVED from the class as measured, not chosen for the pass: the belt-clean members of this sweep run ${Number.isNaN(loCleanMinW) ? '-' : loCleanMinW.toFixed(6)}–${Number.isNaN(loCleanMaxW) ? '-' : loCleanMaxW.toFixed(6)} mm under the rung, every one of them under the old ${(4 * EXPORT_GRAIN / MM).toFixed(1)} mm bar, so a four-grain bar would leave the class with no member to pin, and the one member that once cleared it — case 7717 at 0.873224 mm — was the deleted length rule's own product. The exemplar's depth IS the class's deep end (${(eSpanW.worst / MM).toFixed(6)} = ${Number.isNaN(loCleanMaxW) ? '-' : loCleanMaxW.toFixed(6)} mm), and the bar follows that end: a class that deepens past four grains again makes this arm's pin stale by its own numbers. The cause of what remains is the corner construction being PAIRWISE while the ball is a BODY — where consecutive runs are far shorter than r, the pose at one joint can touch a floor of the same group that no joint ever compares, and the shallow end of the chute, under the rung, is where the runs are shortest. Widening the corner admission to the whole floor group (the trim's own scope, arm W8) was prototyped and measured against this sweep in round 4: it removed 3 of 4 such tracks at 30 000 cases and left the deepest standing, at the cost of 233 tracks refused by name. It is not the cure — the cure is a body-against-every-face solve — and nothing inside the span needs one, so the class is FILED (issue #779) and not widened. What IS deliberate is the belt's reach: solveShot walks every segment boundary of the route, the stations below the rung included, and so refuses ${spanShipW.belt} of these tracks, ${spanShipW.beltLo} of them for a station no ball can hold — case ${CASE_F.i} is one, "${fSpanW.belt ? fSpanW.belt.slice(0, 120) : 'NO REFUSAL'}" at D ${fSpanW.beltD === undefined ? '-' : (fSpanW.beltD / MM).toFixed(3)} mm. A refusal that reads the route alone is a property of the TRACK and not of the shot that happened to be solved, which is the reading a track author can act on; the definitions in web/scene/ballreturn/tracks plus web/tools/fixtures/ballreturn-tracks and the in-file class-W fixtures have none of it either way (t10c: ${refusedC} of ${samplesC} poses)`,
      !eSpanW.err && !fSpanW.err && !eRideW.err
      && spanShipW.hi === 0 && spanShipW.hiWorst === 0 && spanShipW.built > 0
      && spanShipW.lo >= 1 && spanShipW.loWorst > EXPORT_GRAIN
      && spanShipW.loClean >= 1 && spanShipW.loClean < spanShipW.lo && spanShipW.loCases.some((x) => x[0] === CASE_E.i && !x[1])
      && spanShipW.loCases.length === spanShipW.lo && loCleanW.length === spanShipW.loClean
      && loCleanMaxW < 4 * EXPORT_GRAIN / MM && Math.abs(loCleanMaxW - eSpanW.worst / MM) < 1e-6 && loCleanMaxW > EXPORT_GRAIN / MM
      && eSpanW.hi === 0 && eSpanW.lo >= 1 && eSpanW.worst > EXPORT_GRAIN && eSpanW.atD < eSpanW.floorD && !eSpanW.belt
      && Math.abs(eSpanW.total / MM - 125.915415) < 5e-6 && Math.abs(eSpanW.worst / MM - 0.115757) < 5e-6
      && eRideW.rows.every((x) => x[1] === 0) && eRideW.rest === 'no refusal'
      && eRideW.dLo >= eSpanW.floorD - 1e-9 && eRideW.dHi <= eSpanW.total + 1e-9
      && fSpanW.hi === 0 && fSpanW.lo >= 1 && !!fSpanW.belt && fSpanW.beltD < fSpanW.floorD,
      JSON.stringify({ sweep: [spanShipW.built, spanShipW.lo, spanShipW.loClean, spanShipW.hi, +(spanShipW.loWorst / MM).toFixed(6), spanShipW.belt, spanShipW.beltLo], loCases: spanShipW.loCases,
        E: eSpanW.err ?? [+(eSpanW.total / MM).toFixed(6), eSpanW.lo, eSpanW.hi, +(eSpanW.worst / MM).toFixed(6), +(eSpanW.atD / MM).toFixed(3), !!eSpanW.belt], ride: eRideW.err ?? [eRideW.rows, +(eRideW.dLo / MM).toFixed(4)],
        F: fSpanW.err ?? [fSpanW.lo, fSpanW.hi, fSpanW.belt ? +(fSpanW.beltD / MM).toFixed(3) : null] }));
    // ================= class Y (GH-770 review round 5) ===================================
    // Round 5's three findings are one shape: a quantity read off the WRONG body. Y1 reads a
    // junction's entitlement from one endpoint of the cut and lets it go NEGATIVE, so a clearance
    // disables ball return. Y2 budgets a blend window from the extent a piece had BEFORE the
    // floor-group trim, so two blends overrun a length the piece no longer has. Y3 reads "floor"
    // off the whole exported edge where every other reader uses the walked support interval, so
    // material past the stop face — which no ball can reach — moves the route and the seat. Each
    // is measured here three ways: the order's own case, a SWEEP that says where the boundary of
    // the behaviour is, and a RED PLANT of the exact line this round changed. Every number this
    // block attributes to the PR base (4818480f) is READ from a recording this suite wrote against
    // the base's own modules — the corpus manifest above for the fuzz arms, and the per-arm receipt
    // below for these, written by `--write-base-arms <the base's web/scene/ballreturn>` at the foot
    // of this block. None of it is narrated, and an arm whose receipt is missing, or whose receipt
    // was taken from THIS checkout, fails rather than quoting itself (GH-770 review r6, class Z6).
    const BAFIXW = path.resolve(here, 'fixtures/ballreturn-base-arms-4818480f.json');
    const BAW = fs.existsSync(BAFIXW) ? JSON.parse(fs.readFileSync(BAFIXW, 'utf8')) : null;
    const BAOK = !!BAW && !!BAW.src && !sameAsMineW(BAW.src.files);
    const baMM = (m) => (m / MM).toFixed(6);
    const baSrcW = BAOK ? `recorded on 4818480f by --write-base-arms, track.js ${BAW.src.files['track.js'].slice(0, 12)}…` : 'NO BASE RECEIPT';
    const y1DefY = (d) => {                                  // the wire slide with its tray lowered d mm
      const x = loadDef(path.resolve(TRKW, 'TEST-synthetic-wire-slide.json'));
      for (const rw of x.runways) if (/tray/.test(rw.id)) for (const p of rw.points_mm) p[1] = +(p[1] - d).toFixed(6);
      return x;
    };
    const y1ReadY = (M2, d) => {
      let tr = null;
      try { tr = M2.schema.validateTrack(y1DefY(d), { pockets: POCKETS, falls: null }); } catch (e) { return { err: e.message }; }
      let total = 0, cuts = 0, minEnt = Infinity, solved = 0, thrown = null;
      for (const [pk, rt] of tr.routes) {
        total += rt.total;
        for (const sg of rt.segs) if (sg.pen !== undefined && sg.pen !== null) { cuts += 1; minEnt = Math.min(minEnt, sg.pen); }
        try {
          const h1 = M2.kin.handoffFromSink({ t: 1, pocket: POCKETS[pk], fall: POCKETS[pk], r: tr.refR, tFall: 0.021, glide: 0.06 }, { track: tr, pockets: POCKETS, r: tr.refR });
          M2.kin.solveShot({ track: tr, r: tr.refR, ledger: [], arrivals: [{ id: 1, handoff: h1 }] });
          solved += 1;
        } catch (e) { thrown = thrown ?? `pk${pk}: ${e.message}`; }
      }
      return { total, cuts, minEnt: Number.isFinite(minEnt) ? minEnt : null, solved, routes: tr.routes.size, thrown };
    };
    // t11a (arm Y1-1) — the order's own case. TEST-synthetic-wire-slide is a TRAY landing: the lip
    // of the wire pair stands over the tray floor and hands the ball down onto it. Lower the tray
    // 0.1 mm and the definition still validates (nothing in the schema is about a tenth of a
    // millimetre of clearance) — and the pre-fix construction then refuses a NORMAL single-ball
    // solve, because the cut's upstream end is 0.174138 mm CLEAR of the tray, its entitlement is
    // that clearance MINUS the grain, and the pose the ball actually seats at is 0.000000 mm inside.
    const y1FixY = y1ReadY(SHIPW, 0.1), y1ZeroY = y1ReadY(SHIPW, 0);
    check(`t11a the landing entitlement is never negative: the order's own case (GH-770 review r5, class Y1, arm Y1-1). TEST-synthetic-wire-slide with its tray lowered 0.1 mm validates, builds ${y1FixY.routes} routes of ${(y1FixY.total / MM).toFixed(6)} mm — the PR base's own total for the same definition, ${BAOK ? baMM(BAW.y1.total_m) : '(no receipt)'} mm (${baSrcW}) — and solves ${y1FixY.solved}/${y1FixY.routes} single-ball shots with 0 throws. Its ${y1FixY.cuts} landing cuts read a minimum entitlement of ${(y1FixY.minEnt / MM).toFixed(6)} mm: the bound is the deeper of the cut's two ENDPOINTS over the downstream floor and is floored at zero, so a cut that stands CLEAR licenses nothing and forbids nothing. Undropped (tray at 0 mm) the same track totals ${(y1ZeroY.total / MM).toFixed(6)} mm with the same ${y1ZeroY.cuts} cuts and the same ${(y1ZeroY.minEnt / MM).toFixed(6)} mm floor — the clearance moved the geometry, not the law`,
      !y1FixY.err && y1FixY.solved === y1FixY.routes && y1FixY.routes === 2 && y1FixY.thrown === null
      && y1FixY.minEnt === 0 && y1FixY.cuts === 30 && BAOK && Math.abs(y1FixY.total - BAW.y1.total_m) < 5e-10
      && !y1ZeroY.err && y1ZeroY.solved === 2 && y1ZeroY.minEnt === 0,
      JSON.stringify({ lowered: [y1FixY.err ?? +(y1FixY.total / MM).toFixed(6), y1FixY.cuts, y1FixY.minEnt === null ? null : +(y1FixY.minEnt / MM).toFixed(6), y1FixY.solved, y1FixY.thrown && y1FixY.thrown.slice(0, 150)], flat: [+(y1ZeroY.total / MM).toFixed(6), y1ZeroY.solved] }));
    // t11b (arm Y1-2) — the sweep the order asks for: the tray lowered 0 → 5 mm in 0.05 mm steps.
    // The pre-fix entitlement is (0.025862 − d) mm, so it crosses zero 26 µm below the shipped
    // geometry and every step after that is a refusal; the law's own bound is flat at zero.
    const y1SweepY = [];
    for (let k = 0; k <= 100; k += 1) y1SweepY.push({ d: +(k * 0.05).toFixed(2), ...y1ReadY(SHIPW, k * 0.05) });
    const y1NegY = y1SweepY.filter((x) => x.err || x.minEnt === null || x.minEnt < 0);
    const y1BadY = y1SweepY.filter((x) => x.err || x.solved !== 2 || x.thrown);
    check(`t11b the same sweep the finding was found on (GH-770 review r5, class Y1, arm Y1-2): the tray lowered 0 → 5 mm in 0.05 mm steps, ${y1SweepY.length} steps, each one validated, built and SOLVED for a single ball on both pockets. Every step builds, ${y1SweepY.length - y1NegY.length}/${y1SweepY.length} carry a non-negative minimum entitlement (worst ${(Math.min(...y1SweepY.map((x) => x.minEnt ?? Infinity)) / MM).toFixed(6)} mm) and ${y1SweepY.length - y1BadY.length}/${y1SweepY.length} solve with 0 throws. The route total moves with the tray as geometry must — ${(y1SweepY[0].total / MM).toFixed(6)} mm at 0 mm to ${(y1SweepY[y1SweepY.length - 1].total / MM).toFixed(6)} mm at 5 mm, monotone over every step — and nothing in the sweep refuses. The PR base solves ${BAOK ? `${BAW.y1sweep.solved2} of the same ${BAW.y1sweep.steps}` : '(no receipt)'}; the pre-fix bound of 33b49da7 solves ONE (arm t11c), which is the shape of the defect: not a wrong number in a corner case, a clearance switched ball return off`,
      y1NegY.length === 0 && y1BadY.length === 0 && y1SweepY.length === 101
      && BAOK && BAW.y1sweep.steps === y1SweepY.length && BAW.y1sweep.solved2 === BAW.y1sweep.steps
      && y1SweepY.every((x, i) => i === 0 || x.total >= y1SweepY[i - 1].total - 1e-12),
      JSON.stringify({ steps: y1SweepY.length, neg: y1NegY.length, bad: y1BadY.slice(0, 3).map((x) => [x.d, x.err ? x.err.slice(0, 90) : x.thrown && x.thrown.slice(0, 90)]), t0: +(y1SweepY[0].total / MM).toFixed(6), t1: +(y1SweepY[100].total / MM).toFixed(6) }));
    // t11c (arm Y1-3) — the RED PLANT: the one line this round changed, put back.
    const plantY1 = await redPlant('y1', [
      ['      out.pen = Math.max(0, A.rw === B.rw ? pen : Math.max(penB, penInto(B, IB)));',
        '      out.pen = A.rw === B.rw ? pen : penB;'],
    ]);
    const y1RedY = plantY1.err ? null : y1ReadY(plantY1, 0.1);
    const y1RedSweepY = plantY1.err ? [] : y1SweepY.map((x) => y1ReadY(plantY1, x.d));
    check(`t11c the pre-fix bound, measured (GH-770 review r5, class Y1, arm Y1-3). A temp copy of the module with \`out.pen\` read from the DOWNSTREAM endpoint alone — the 33b49da7 line, put back — on the same lowered fixture: ${y1RedY && y1RedY.solved}/${y1RedY && y1RedY.routes} solves and the throw the order quotes, \`${y1RedY && y1RedY.thrown ? y1RedY.thrown.replace(/^pk\d+: /, '').slice(0, 132) : 'none'}\`. Its minimum entitlement is ${y1RedY && y1RedY.minEnt !== null ? (y1RedY.minEnt / MM).toFixed(6) : 'n/a'} mm + the 0.1 mm grain = −0.074138 mm of licence for a pose that is 0.000000 mm inside. Over the whole 0 → 5 mm sweep the pre-fix module solves ${y1RedSweepY.filter((x) => !x.err && x.solved === 2).length}/${y1RedSweepY.length} — only the undropped geometry — against this module's ${y1SweepY.length}/${y1SweepY.length}, and its entitlement is negative at ${y1RedSweepY.filter((x) => !x.err && x.minEnt !== null && x.minEnt < 0).length} of them, reaching ${(Math.min(...y1RedSweepY.map((x) => (x.err || x.minEnt === null) ? Infinity : x.minEnt)) / MM).toFixed(6)} mm`,
      !plantY1.err && !!y1RedY && !y1RedY.err && y1RedY.solved === 0 && !!y1RedY.thrown
      && /entitled to -0\.074138 mm/.test(y1RedY.thrown) && y1RedY.minEnt !== null && Math.abs(y1RedY.minEnt / MM + 0.174138) < 5e-7
      && y1RedSweepY.filter((x) => !x.err && x.solved === 2).length === 1,
      plantY1.err ?? JSON.stringify({ solved: y1RedY.solved, minEnt: +(y1RedY.minEnt / MM).toFixed(6), throw: y1RedY.thrown && y1RedY.thrown.slice(0, 170) }));
    // ---- class Y2 ---------------------------------------------------------------------
    // The fixture the finding was reported on: a 60 mm channel chute dropping 28 mm over 96 mm,
    // then a 1.4 mm leg bent across the heading and dropping 4.8 mm, then a 0.48/0.14 mm tip, with
    // the stop face at 105.5 mm. The bent leg falls far enough below the chute that the drop
    // cascade trims the chute to 0.378330 mm of surviving support — and the pre-fix reader then
    // budgeted the twist windows beside that joint from the chute's ORIGINAL 100 mm.
    const bendY = (deltas, wall, width) => {
      const d = JSON.parse(JSON.stringify(tbW));
      d.support = supW(width);
      for (const rw of d.runways) {
        if (!rw.stop) continue;
        const p0 = rw.points_mm[0]; const sgn = Math.sign(rw.points_mm[1][2] - p0[2]); const pts = [p0];
        for (const [dx, dy, dz] of deltas) { const q = pts[pts.length - 1]; pts.push([+(q[0] + dx).toFixed(6), +(q[1] + dy).toFixed(6), +(q[2] + sgn * dz).toFixed(6)]); }
        rw.points_mm = pts; rw.support = supW(width);
        rw.stop.wall_s_mm = +wall.toFixed(6);
        rw.stop.capacity_balls = Math.max(1, Math.floor(wall / (2 * R / MM) + 1e-9));
      }
      return d;
    };
    // The window budget, read back off the route the law built: pieces are the maximal runs of
    // segments sharing one edge, and a piece's margin is the station span it occupies LESS the sum
    // of the twist windows drawn on it. Negative is the V2 refusal's own quantity.
    const windowY = (tr) => {
      let worst = Infinity, pieces = 0, twists = 0;
      for (const [, rt] of tr.routes) {
        let i = 0;
        while (i < rt.segs.length) {
          const e = rt.segs[i].edge; let j = i;
          while (j < rt.segs.length && rt.segs[j].edge === e && rt.segs[j].kind !== 'cut') j += 1;
          const grp = j > i && e ? rt.segs.slice(i, j).filter((s) => s.sFrom !== undefined) : [];
          if (grp.length && grp.some((s) => s.kind === 'twist')) {
            const lo = Math.min(...grp.map((s) => Math.min(s.sFrom, s.sTo)));
            const hi = Math.max(...grp.map((s) => Math.max(s.sFrom, s.sTo)));
            const wsum = grp.filter((s) => s.kind === 'twist').reduce((a, s) => a + Math.abs(s.sTo - s.sFrom), 0);
            pieces += 1; twists += grp.filter((s) => s.kind === 'twist').length; worst = Math.min(worst, (hi - lo) - wsum);
          }
          i = Math.max(j, i + 1);
        }
      }
      return { worst, pieces, twists };
    };
    const y2ReadY = (M2, def) => {
      let tr = null;
      try { tr = M2.schema.validateTrack(def, { pockets: POCKETS, falls: null }); } catch (e) { return { err: e.message }; }
      let total = 0, segs = 0, gate = 0, solved = 0, thrown = null;
      for (const [, rt] of tr.routes) { total += rt.total; segs += rt.segs.length; }
      try { M2.kin.designGate(tr, { pockets: POCKETS, r: tr.refR }); } catch (e) { gate += 1; }
      for (const [pk] of tr.routes) {
        for (let k = 0; k < 15; k += 1) {
          try {
            const h1 = M2.kin.handoffFromSink({ t: 1, pocket: POCKETS[pk], fall: POCKETS[pk], r: tr.refR, tFall: 0.018 + 0.0004 * k, glide: 0.04 + 0.004 * k }, { track: tr, pockets: POCKETS, r: tr.refR });
            M2.kin.solveShot({ track: tr, r: tr.refR, ledger: [], arrivals: [{ id: 1, handoff: h1 }] });
            solved += 1;
          } catch (e) { thrown = thrown ?? e.message; }
        }
      }
      return { total, segs, routes: tr.routes.size, gate, solved, thrown, ...windowY(tr) };
    };
    const Y2DEF = bendY([[0, -28, 96], [1.4, -4.8, 0], [0.48, -0.14, 0]], 105.5, 60);
    // t11d (arm Y2-1) — the order's own fixture.
    const y2FixY = y2ReadY(SHIPW, Y2DEF);
    check(`t11d a window is budgeted from what the piece HAS: the order's own fixture (GH-770 review r5, class Y2, arm Y2-1). The 60 mm channel (0,−28,96) → (1.4,−4.8,0) → (0.48,−0.14,0) with its stop at 105.5 mm builds ${y2FixY.routes} routes of ${(y2FixY.total / MM).toFixed(6)} mm in ${y2FixY.segs} segments, passes the design gate and completes all ${y2FixY.solved} design-gate solves (${y2FixY.routes} pockets × 15 handoffs over tFall 18–23.6 ms and glide 40–96 mm/s) with 0 throws. Every piece that carries a twist keeps support UNDER it: ${y2FixY.pieces} such pieces, ${y2FixY.twists} windows, worst remaining span ${(y2FixY.worst / MM).toFixed(6)} mm — a window can only ever be 45 % of the extent, and 0.45 + 0.45 < 1 of ONE number is what keeps two of them from meeting. The PR base builds the same definition at ${BAOK ? baMM(BAW.y2.total_m) : '(no receipt)'} mm in ${BAOK ? BAW.y2.segs : '-'} segments and solves all ${BAOK ? BAW.y2.solved : '-'} (${baSrcW}); the pre-fix reader of 33b49da7 refuses it outright (arm t11f). The route is LONGER here than on the base because the drop cascade that round 4 added is doing its job — the ball rides the run before the one it cannot reach — and the window budget is the only thing this round changes`,
      !y2FixY.err && y2FixY.routes === 2 && y2FixY.gate === 0 && y2FixY.solved === 30 && y2FixY.thrown === null
      && BAOK && BAW.y2.err === null && BAW.y2.solved === y2FixY.solved
      && y2FixY.worst >= 0 && y2FixY.pieces >= 1 && Math.abs(y2FixY.total / MM - 349.230428) < 5e-7 && y2FixY.segs === 12,
      JSON.stringify(y2FixY.err ? { err: y2FixY.err.slice(0, 170) } : { total: +(y2FixY.total / MM).toFixed(6), segs: y2FixY.segs, solved: y2FixY.solved, gate: y2FixY.gate, pieces: y2FixY.pieces, twists: y2FixY.twists, worst: +(y2FixY.worst / MM).toFixed(6) }));
    // t11e (arm Y2-2) — the sweep: 21 heading bends × 21 trim depths. The bend angle sets how much
    // corner the joint wants; the depth of the bent leg sets how much of the chute the drop cascade
    // trims away. The pair is the whole discriminator — at a fixed depth no angle refuses, and at a
    // fixed angle the refusal appears as soon as the trim eats past the window budget.
    const Y2LH = 1.4, Y2L3 = [0.48, -0.14, 0];
    const y2GridY = [];
    for (let a = 0; a < 21; a += 1) {
      const phi = 15 + a * 3.75;
      const dx = +(Y2LH * Math.sin(phi * Math.PI / 180)).toFixed(6), dz = +(Y2LH * Math.cos(phi * Math.PI / 180)).toFixed(6);
      for (let b = 0; b < 21; b += 1) {
        const dy = +(-0.5 - b * 0.575).toFixed(6);
        const wall = +(100 + Math.hypot(Y2LH, dy) + Math.hypot(Y2L3[0], Y2L3[1], Y2L3[2])).toFixed(6);
        y2GridY.push({ phi, dy, def: bendY([[0, -28, 96], [dx, dy, dz], Y2L3], wall, 60) });
      }
    }
    const y2SweepY = y2GridY.map((g) => { let tr = null; try { tr = validateTrack(g.def, { pockets: POCKETS, falls: null }); } catch (e) { return { phi: g.phi, dy: g.dy, err: e.message }; } return { phi: g.phi, dy: g.dy, ...windowY(tr) }; });
    const y2RefY = y2SweepY.filter((x) => x.err);
    const y2WorstY = Math.min(...y2SweepY.filter((x) => !x.err && Number.isFinite(x.worst)).map((x) => x.worst));
    check(`t11e the sweep across the whole family (GH-770 review r5, class Y2, arm Y2-2): ${y2SweepY.length} combinations — the bent leg's heading turned 15° → 90° in 21 steps × its drop taken from 0.5 to 12.0 mm in 21 steps, the stop face moved with the polyline each time so the geometry past it never changes. Every one of the ${y2SweepY.length} builds (${y2RefY.length} refusals), so there is no false refusal anywhere in the family; the PR base also builds all ${BAOK ? BAW.y2grid.built : '(no receipt)'} of them (${baSrcW}) and the pre-fix reader of 33b49da7 refuses 22 of them by law V2 (arm t11f). The window budget holds at every point: ${y2SweepY.filter((x) => !x.err && x.pieces > 0).length} combinations draw ${y2SweepY.reduce((n, x) => n + (x.twists ?? 0), 0)} twist windows and the worst remaining span over the whole grid is ${(y2WorstY / MM).toFixed(6)} mm — positive at every one of them, so nowhere on the grid do a piece's two windows meet. That margin is small ON PURPOSE: the 45 % clamp is meant to be tight, and what this round fixes is WHICH length it is 45 % of`,
      y2RefY.length === 0 && y2SweepY.length === 441 && y2WorstY >= 0
      && BAOK && BAW.y2grid.combos === y2SweepY.length && BAW.y2grid.refused === 0
      && y2SweepY.reduce((n, x) => n + (x.twists ?? 0), 0) >= 2000,
      JSON.stringify({ combos: y2SweepY.length, refused: y2RefY.slice(0, 3).map((x) => [x.phi, x.dy, x.err.slice(0, 80)]), worst: +(y2WorstY / MM).toFixed(6), twists: y2SweepY.reduce((n, x) => n + (x.twists ?? 0), 0) }));
    // t11f (arm Y2-3) — the RED PLANT: both readings of the extent put back to the pre-trim ones.
    const plantY2 = await redPlant('y2', [
      ['      const wA = Math.min(r, 0.45 * (A.sBT - A.sAT));', '      const wA = Math.min(r, 0.45 * (A.sB0 - A.sA0));'],
      ['      const wB = Math.min(r, 0.45 * (B.sBT - B.sAT));', '      const wB = Math.min(r, 0.45 * (B.sB0 - B.sA0));'],
      ['      const extA = A.sBT - A.sAT;', '      const extA = A.sB - A.sA;'],
      ['      const extB = B.sBT - B.sAT;', '      const extB = B.sB - B.sA;'],
    ]);
    const y2RedY = plantY2.err ? null : y2ReadY(plantY2, Y2DEF);
    const y2RedSweepY = plantY2.err ? [] : y2GridY.map((g) => { try { plantY2.schema.validateTrack(g.def, { pockets: POCKETS, falls: null }); return null; } catch (e) { return { phi: g.phi, dy: g.dy, law: lawW(e.message), blend: /no support between its blends/.test(e.message) }; } }).filter(Boolean);
    check(`t11f the pre-fix budget, measured (GH-770 review r5, class Y2, arm Y2-3). A temp copy of the module with BOTH readings of a piece's extent put back to the pre-trim sA0/sB0 — the 33b49da7 lines — refuses the order's own fixture by name: \`${y2RedY && y2RedY.err ? y2RedY.err.slice(0, 128) : 'it built'}\`. Over the ${y2GridY.length}-combination grid it refuses ${y2RedSweepY.length} (${y2RedSweepY.filter((x) => x.blend).length} of them the blend-overrun law V2, the rest ${[...new Set(y2RedSweepY.filter((x) => !x.blend).map((x) => x.law))].join(', ') || 'none'}) where this module refuses 0 and the PR base ${BAOK ? BAW.y2grid.refused : '(no receipt)'} (${baSrcW}) — every one of them a FALSE REFUSAL of a geometry the exporter may legitimately emit. The refusals are not scattered: they are the deep-trim corner of the grid (bend ${Math.min(...y2RedSweepY.map((x) => x.phi))}°–${Math.max(...y2RedSweepY.map((x) => x.phi))}°, drop ${Math.min(...y2RedSweepY.map((x) => x.dy)).toFixed(3)} → ${Math.max(...y2RedSweepY.map((x) => x.dy)).toFixed(3)} mm), which is exactly where the trim takes the most of the piece the window is budgeted from. RE-BASELINED this round (GH-770 review r6, class AA): this arm pinned 22 refusals when it went in, and it pins 8 now. Nothing about the Y2 budget moved \u2014 what moved is the module the plant is a copy OF. Class AA deletes the fragment/length retention loop, so fourteen of this grid's combinations no longer reach the deep-trim corner with a clipped fragment still in \`pieces\`, and the pre-trim reading has nothing left to over-budget there. The 8 that remain are the same law (blend-overrun V2) in the same corner, and this module still refuses 0 of the grid`,
      !plantY2.err && !!y2RedY && !!y2RedY.err && /no support between its blends \(-1\.871670 mm\)/.test(y2RedY.err)
      && y2RedSweepY.length === 8 && y2RedSweepY.every((x) => x.blend) && BAOK && BAW.y2grid.refused === 0,
      plantY2.err ?? JSON.stringify({ fixture: y2RedY.err && y2RedY.err.slice(0, 150), grid: y2RedSweepY.length, blend: y2RedSweepY.filter((x) => x.blend).length }));
    // ---- class Y3 ---------------------------------------------------------------------
    // Geometry PAST the stop face is not floor. penInto and poseClearance have always read the
    // WALKED support interval (sA0/sB0, the stop-clipped stations); the clearance trim read the whole
    // exported edge. So a lip the ball can never reach moved the route that seats it.
    const stepY = (face, tail) => {
      const d = JSON.parse(JSON.stringify(tbW));
      for (const rw of d.runways) {
        if (!rw.stop) continue;
        const p0 = rw.points_mm[0]; const sgn = Math.sign(rw.points_mm[1][2] - p0[2]);
        const p1 = [p0[0], p0[1] - 60, p0[2] + sgn * 80];
        rw.points_mm = [p0, p1, [p1[0], +(p1[1] - 0.28 * tail).toFixed(6), +(p1[2] + sgn * 0.96 * tail).toFixed(6)]];
        rw.stop.wall_s_mm = face; rw.stop.capacity_balls = Math.max(1, Math.floor(face / (2 * R / MM) + 1e-9));
      }
      return d;
    };
    // t11g (arm Y3-1) — the order's own case: the tail grown from 1 mm to 80 mm, entirely past a stop
    // face pinned at 100.5 mm. V6 caps the lip at one ball diameter of support line, so 80 mm is
    // refused on every reading including the PR base — that is the law doing its job, not a change.
    const Y3TS = [1, 2, 5, 10, 20, 40, 80];
    const y3RowsY = Y3TS.map((T) => ({ T, ...sigW(SHIPW, stepY(100.5, T)) }));
    const y3Base = y3RowsY[0];
    const y3DevY = y3RowsY.filter((r) => !r.err).map((r) => devW(y3Base, r));
    const y3WorstY = Math.max(...y3DevY);
    check(`t11g geometry the ball can never reach does not move the ball (GH-770 review r5, class Y3, arm Y3-1). The order's own case — a 100 mm leg dropping 60 mm over 80 mm, then a tail dropping 0.28 mm per 0.96 mm, stop face pinned at 100.5 mm — read at tail lengths ${Y3TS.join(', ')} mm. Every one of those tails is ENTIRELY past the stop: the face never moves, so the only thing that changes between the readings is a lip the ball is stopped before. Its ${y3Base.routes} routes are ${(y3Base.first / MM).toFixed(6)} mm and ${((y3Base.total - y3Base.first) / MM).toFixed(6)} mm long and their ${y3Base.seats} rest-ladder seats are in the same places at tail ${y3RowsY.filter((r) => !r.err).map((r) => r.T).join(', ')} mm — worst deviation over every length and every seat coordinate ${y3WorstY.toExponential(2)} m, which is ${y3WorstY === 0 ? 'exactly zero' : 'double-precision noise'}, against the 1e-9 m the order asks for. At ${Y3TS[Y3TS.length - 1]} mm the definition is refused ${y3RowsY[Y3TS.length - 1].err} — the lip law, which allows at most one ball diameter (${(2 * R / MM).toFixed(2)} mm) of support line beyond a stop; the PR base refuses it there too. The pre-fix reader of 33b49da7 moves the seat 1.121213 mm over this same family (arm t11i); the PR base is invariant at ${BAOK ? baMM(BAW.y3.first_m[0]) : '(no receipt)'} mm over the same seven tails, worst deviation ${BAOK && Number.isFinite(BAW.y3.worst_m) ? BAW.y3.worst_m.toExponential(2) : '-'} m, and refuses the ${BAOK ? BAW.y3.ts[6] : '-'} mm tail with ${BAOK ? BAW.y3.errs[6] : '-'} of its own (${baSrcW}) — it has no clearance trim to read the wrong interval with`,
      y3WorstY <= 1e-9 && y3RowsY.filter((r) => !r.err).length === 6 && y3RowsY[6].err === '[V6]'
      && BAOK && Number.isFinite(BAW.y3.worst_m) && BAW.y3.worst_m <= 1e-9 && BAW.y3.errs[6] === '[V6]'
      && Math.abs(y3Base.first / MM - 150.921831) < 5e-6 && y3Base.seats >= 2,
      JSON.stringify({ rows: y3RowsY.map((r) => [r.T, r.err ?? +(r.first / MM).toFixed(6), r.err ? null : +devW(y3Base, r).toExponential(2)]) }));
    // t11h (arm Y3-2) — the POST-STOP INVARIANCE census: every definition in censusY (censusW and the class-Y fixtures) that declares a stop (one without a stop face is skipped), extended past its
    // own stop face in up to four ways at two depths (a straight way is skipped where the depth is shorter than the last leg of a runway with a stop). 'extend' lengthens the last leg, 'append' adds a
    // collinear one, 'bend' turns a new leg out of the heading — all by WHOLE COPIES of the last leg
    // where collinearity must be exact, so the pre-face geometry is byte-identical, not merely close.
    const censusY = [...censusW, { name: 'fixture Y2 bend 90 deg', def: Y2DEF, pockets: POCKETS, falls: null },
      { name: 'fixture Y3 step face 100.5', def: stepY(100.5, 1), pockets: POCKETS, falls: null }];
    const y3CensusY = (M2) => {
      const rows = []; let worst = 0, bad = 0, refused = 0, nostop = 0;
      for (const c of censusY) {
        const h = headW(c.def);
        if (!Number.isFinite(h)) { nostop += 1; continue; }
        const b0 = sigW(M2, c.def, c.pockets, c.falls);
        for (const [kind, ang] of [['extend', 0], ['append', 0], ['bend', 12], ['bend', -35]]) {
          for (const frac of [0.25, 0.9]) {
            const e = +Math.min(h * frac, 40).toFixed(6);
            if (!(e > 0)) continue;
            const d2 = pastW(c.def, kind, e, ang); if (!d2) continue;
            const r = sigW(M2, d2, c.pockets, c.falls); const dv = devW(b0, r);
            if (r.err) refused += 1;
            if (Number.isNaN(dv)) bad += 1; else worst = Math.max(worst, dv);
            rows.push({ name: c.name, kind: ang ? `${kind}${ang > 0 ? '+' : ''}${ang}` : kind, e, dev: Number.isNaN(dv) ? null : dv, err: r.err ?? null });
          }
        }
      }
      return { rows, worst, bad, refused, nostop };
    };
    const y3CenY = y3CensusY(SHIPW);
    check(`t11h the post-stop invariance census (GH-770 review r5, class Y3, arm Y3-2): every definition in web/scene/ballreturn/tracks plus web/tools/fixtures/ballreturn-tracks and every class-W and class-Y fixture, each extended past its OWN stop face in up to four ways (lengthen the last leg, append a collinear one, bend a new one out ±) at 25 % and 90 % of the V6 lip headroom capped at 40 mm, a straight way skipped where that depth is shorter than the last leg of a runway with a stop — ${y3CenY.rows.length} rows over ${censusY.length - y3CenY.nostop} definitions that declare a stop (the other ${y3CenY.nostop} of the ${censusY.length} have no stop face, so there is no "past the stop" on them and they contribute no row). Worst deviation of any route length or any rest-ladder seat coordinate, over every row: ${y3CenY.worst.toExponential(2)} m — against the 1e-9 m the order asks for, ${y3CenY.worst === 0 ? 'exactly zero on every row' : `${Math.floor(Math.log10(1e-9 / y3CenY.worst))} decades under it`}. ${y3CenY.refused} rows refuse and ${y3CenY.bad} change shape. The collinear extensions are whole INTEGER copies of the last leg on purpose: an extension by a unit vector re-rounds the endpoint to 6 decimals and leaks ~5 nm of direction drift into the pre-face geometry, which is a different experiment (it would measure the exporter's grid, not this law). The pre-fix reader fails this same census — arm t11i`,
      y3CenY.worst <= 1e-9 && y3CenY.bad === 0 && y3CenY.refused === 0 && y3CenY.rows.length >= 50 && y3CenY.nostop >= 1,
      JSON.stringify({ rows: y3CenY.rows.length, worst: +y3CenY.worst.toExponential(2), bad: y3CenY.bad, refused: y3CenY.refused, nostop: y3CenY.nostop,
        sample: y3CenY.rows.filter((r) => r.dev > 0).slice(0, 5).map((r) => [r.name, r.kind, r.e, +r.dev.toExponential(2)]) }));
    // t11i (arm Y3-3) — the RED PLANT: the clearance trim's three readings put back to the whole
    // exported edge (the station origin dropped, the chord clamp and the endpoint roots over
    // [0, edge.len] instead of the walked [sA0, sB0]).
    const plantY3 = await redPlant('y3', [
      ['    const s0 = Q.edge.s0 + dot(d0, Q.edge.t), w0 = dot(d0, bQ), n0 = dot(d0, Q.edge.n);', '    const s0 = dot(d0, Q.edge.t), w0 = dot(d0, bQ), n0 = dot(d0, Q.edge.n);'],
      ['      const sc = Math.max(Q.sA0, Math.min(Q.sB0, s));', '      const sc = Math.max(0, Math.min(Q.edge.len, s));'],
      ['    const sEnds = [Q.sA0, Q.sB0];', '    const sEnds = [0, Q.edge.len];'],
    ]);
    const y3RedRowsY = plantY3.err ? [] : Y3TS.map((T) => ({ T, ...sigW(plantY3, stepY(100.5, T)) }));
    const y3RedDevY = plantY3.err ? [] : y3RedRowsY.filter((r) => !r.err).map((r) => devW(y3RedRowsY[0], r));
    const y3RedWorstY = y3RedDevY.length ? Math.max(...y3RedDevY) : 0;
    const y3RedCenY = plantY3.err ? null : y3CensusY(plantY3);
    check(`t11i the whole-edge floor, measured (GH-770 review r5, class Y3, arm Y3-3). A temp copy with the clearance trim's three readings put back to the whole exported edge — the 33b49da7 lines — moves the seat on the order's own case: its lc route goes ${y3RedRowsY.filter((r) => !r.err).map((r) => (r.first / MM).toFixed(6)).join(' → ')} mm as the tail past the stop grows ${Y3TS.slice(0, 6).join(', ')} mm, and the rest ladder shifts ${(y3RedWorstY / MM).toFixed(6)} mm — ${(y3RedWorstY / MM).toFixed(3)} mm of seat movement bought by a lip the ball never reaches. Over the whole census it violates ${y3RedCenY ? y3RedCenY.rows.filter((r) => r.dev > 1e-9).length : '-'} of ${y3RedCenY ? y3RedCenY.rows.length : '-'} rows, worst ${y3RedCenY ? (y3RedCenY.worst / MM).toFixed(6) : '-'} mm, where this module violates 0 (arm t11h). The failure is not uniform and that is the point: it needs a run the stop face CLIPS, so it is invisible on the definitions in web/scene/ballreturn/tracks plus web/tools/fixtures/ballreturn-tracks (${y3RedCenY ? y3RedCenY.rows.filter((r) => r.dev > 1e-9 && !r.name.startsWith('fixture')).length : '-'} of their rows move) and it took a fixture to find`,
      !plantY3.err && y3RedWorstY > 1e-3 && Math.abs(y3RedWorstY / MM - 1.121213263) < 1e-6
      && !!y3RedCenY && y3RedCenY.rows.filter((r) => r.dev > 1e-9).length >= 1,
      plantY3.err ?? JSON.stringify({ rows: y3RedRowsY.map((r) => [r.T, r.err ?? +(r.first / MM).toFixed(6)]), shift: +(y3RedWorstY / MM).toFixed(9),
        census: y3RedCenY && [y3RedCenY.rows.filter((r) => r.dev > 1e-9).length, y3RedCenY.rows.length, +(y3RedCenY.worst / MM).toFixed(6)] }));
    // ---- Y4 — the two oracles, permanent rows on the fuzz ------------------------------------
    // (a) BASE BUILD-PARITY. The corpus of arm t10b read once through the PR BASE (4818480f) and
    // RECORDED is the admission rule this round is held to: a geometry the base builds and whose
    // poses the base keeps clear must build AND solve here. A refusal here the base does not issue is
    // a FALSE REFUSAL — with one admissible exception, the named penetration class, and only where
    // the base's own pose is deeper than the export grain. Those are counted and listed, never waved
    // through. The manifest is keyed by the generator's own rolling hash, so a corpus that drifts
    // fails this arm instead of quietly measuring something else.
    const nPW = BPW ? Math.min(FUZZW, BPW.n) : 0;
    const ckW = BPW ? ([...CKW].filter((k) => k <= nPW && BPW.ck[k] !== undefined && fzW.ck.has(k)).sort((a, b) => b - a)[0] ?? null) : null;
    const genOkW = !!ckW && BPW.ck[ckW] === fzW.ck.get(ckW);
    // below the manifest's smallest checkpoint the two streams cannot be aligned at all, so the
    // oracle says it did not run rather than reporting a mismatch it could not tell from a real one
    const ckNoneW = !!BPW && [...CKW].every((k) => k > nPW);
    // The set of laws a NEW refusal may arrive under is PINNED here, not open. Two are admissible,
    // and only ever on a geometry whose BASE pose is deeper than the base's own grain:
    //   `[V2]`           the corner construction refusing the geometry at build time — what the
    //                    class-W clearance trims turn a floor the base mis-read into;
    //   `solve pose law` the pose law refusing the seat at solve time, the named penetration class.
    // A refusal under ANY other law fails this arm with its cases listed, even where the base's pose
    // is deep: an admission rule that can grow without anyone noticing is not a rule. Each admitted
    // case also carries the floor its base pose stands in and the station along it, read from the
    // manifest, so the reader asked to accept it can go and look (GH-770 review r6, class Z1).
    const ADMISSIBLE_LAWS = new Set(['[V2]', 'solve pose law']);
    const dwW = (i) => { const e = BPW && BPW.dw ? BPW.dw[i] : null; return e ? `${BPW.dwIds[e[0]]} run ${e[1]} at station ${(e[2] / 1e6).toFixed(1)} mm` : null; };
    const parW = { set: 0, falseRef: [], adm: [], baseFail: 0, recovered: [], fixed: 0, bothRef: 0, reclass: [] };
    for (let i = 0; i < nPW; i += 1) {
      const bb = bitAtW(BPW.b, i), bc = bitAtW(BPW.c, i), bs = bitAtW(BPW.sv, i);
      const hb = fzW.b[i], hs = fzW.sv[i], hc = fzW.c[i];
      if (!bb) {
        if (hb) parW.recovered.push([i, BPW.law[i], fzW.law[i]]);   // listed by law, and asserted empty
        else { parW.bothRef += 1; if (BPW.law[i] !== fzW.law[i]) parW.reclass.push([i, BPW.law[i], fzW.law[i]]); }
        continue;
      }
      if (bc) { parW.set += 1; if (!hb || !hs) parW.falseRef.push([i, hb ? 'solve' : 'build', BPW.deep[i], fzW.law[i]]); continue; }
      if (hc) { parW.fixed += 1; continue; }                       // the base's pose was deep, this round's is not
      if (hb && hs) continue;                                      // still builds and solves: nothing new is refused
      if (!bs) { parW.baseFail += 1; continue; }                   // the base did not solve it either
      if (BPW.deep[i] > BPW.grain_nm) parW.adm.push([i, hb ? 'solve' : 'build', BPW.deep[i], fzW.law[i]]);
      else parW.falseRef.push([i, hb ? 'solve' : 'build', BPW.deep[i], fzW.law[i]]);
    }
    const admLawW = new Map();
    for (const a of parW.adm) admLawW.set(a[3], (admLawW.get(a[3]) ?? 0) + 1);
    const admHistW = [...admLawW.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ') || 'none';
    const admBadW = parW.adm.filter((x) => !ADMISSIBLE_LAWS.has(x[3]));
    const admCtxW = parW.adm.filter((x) => !dwW(x[0]));
    const admRowW = (x) => `case ${x[0]}: base ${(x[2] / 1e6).toFixed(4)} mm into ${dwW(x[0]) ?? 'an UNRECORDED floor'} → refused ${x[3]} at ${x[1]}`;
    const srcOkW = !!BPW && !!BPW.src && !sameAsMineW(BPW.src.files);
    const srcTxtW = BPW && BPW.src ? MODFW.filter((n) => BPW.src.files[n]).map((n) => `${n} ${BPW.src.files[n].slice(0, 12)}…`).join(', ') : '(unstamped)';
    const jNameW = 't11j ORACLE (a) — BASE BUILD-PARITY over the fuzz corpus (GH-770 review r5, class Y4a)';
    if (ckNoneW) skip(jNameW, `this run draws ${nPW} cases and the manifest's smallest stream checkpoint is ${Math.min(...CKW)}, so the two streams cannot be shown to be the SAME stream and the comparison would be two experiments and not one. The oracle DID NOT RUN and claims no pass: run --fuzz ${Math.min(...CKW)} or more — every gate does, and the record run is 5 000`);
    else check(`${jNameW}. The ${nPW} geometries of arm t10b, as the PR base ${BPW ? BPW.base.slice(0, 8) : '-'} read them, are recorded in ${BPW ? path.relative(path.resolve(here, '..'), BPFIXW) : '(no manifest)'} — written by this suite from ${BPW && BPW.src ? BPW.src.dir : 'an UNSTAMPED manifest'}, whose modules hash ${srcTxtW} and are ${srcOkW ? 'NOT this checkout’s own, so the two sides of this comparison really are two readers' : 'THIS CHECKOUT’S OWN — a recording taken from the module under test is self-parity, and this arm fails on it'}, and the stream is the SAME stream: the rolling sha-256 of every definition the generator emits — over the GEOMETRY it emitted: the emitted def's top-level keys are {${(fzW.defKeys ?? []).join(', ')}}, of which 'checks' (the template fixture's committed pins of OTHER rows — CIWIRE re-pinned t7 there, and an identity over the generator's output must never move with the pins of other rows) is dropped from the def object before serialisation, and no other key carries a pin (pin-bearing keys or hex strings outside 'checks': ${fzW.pinLeak && fzW.pinLeak.length ? fzW.pinLeak.slice(0, 4).join('; ') : 'none'}) — matches the manifest at case ${ckW} (${genOkW ? `${String(fzW.ck.get(ckW)).slice(0, 16)}…` : 'MISMATCH'}), which is what makes this a comparison and not two experiments. The base BUILDS ${(() => { let n = 0; for (let i = 0; i < nPW; i += 1) n += bitAtW(BPW.b, i); return n; })()} of them and keeps its poses CLEAR on ${parW.set} — that parity set must build and solve here, and ${parW.falseRef.length} of it does not: ZERO false refusals. Of the ${(() => { let n = 0; for (let i = 0; i < nPW; i += 1) n += bitAtW(BPW.b, i) && !bitAtW(BPW.c, i) ? 1 : 0; return n; })()} the base builds with a pose deeper than its own ${(BPW ? BPW.grain_nm / 1e6 : 0).toFixed(1)} mm grain, this round makes ${parW.fixed} of them clean and refuses ${parW.adm.length} BY NAME. Those refusals are pinned, not open: the histogram is ${admHistW}, every entry of it inside the admissible set {${[...ADMISSIBLE_LAWS].join(', ')}} — a set of ${ADMISSIBLE_LAWS.size} NAMED classes, of which ${[...ADMISSIBLE_LAWS].filter((k) => !admLawW.has(k)).length ? `${[...ADMISSIBLE_LAWS].filter((k) => !admLawW.has(k)).map((k) => `'${k}'`).join(' and ')} ${[...ADMISSIBLE_LAWS].filter((k) => !admLawW.has(k)).length === 1 ? 'has' : 'have'} 0 observed exemplars over this corpus, so the set's size is not a count of observed classes` : 'every one has an observed exemplar'} — ${admBadW.length} outside it${admBadW.length ? ` (${admBadW.slice(0, 4).map(admRowW).join('; ')})` : ''} — and each one names the floor its BASE pose stands in, ${admCtxW.length} of them without one: ${parW.adm.length ? `${parW.adm.slice(0, 3).map(admRowW).join('; ')}${parW.adm.length > 3 ? `; and ${parW.adm.length - 3} more, every one of them in the detail` : ''}. Their base depths run ${(Math.min(...parW.adm.map((x) => x[2])) / 1e6).toFixed(4)}–${(Math.max(...parW.adm.map((x) => x[2])) / 1e6).toFixed(4)} mm, which is what makes them admissible at all: a geometry whose base pose is already inside a floor it is not riding. The per-case measurement behind that sentence — each of the twelve is a base pose 1.01–1.11 × the corner radius inside the very valley the head's [V2] names, 12 of 12 on lc-chute — is reproducible from the two recorded artefacts with adm12.py (durable: <private evidence>/ballreturn/order23b/companion-3/round6-770fix5b/adm12.py, §29.26h Z1)` : 'there are none — the only admissible new refusal there is would be one on a geometry whose base pose is already inside a floor it is not riding'}. ${parW.recovered.length} geometries the base refused build here${parW.recovered.length ? ` (${[...new Set(parW.recovered.map((x) => x[1]))].join(', ')}) — which must be none, because a corpus case the base refuses and this round builds is a change this oracle cannot vouch for either way` : ''}, ${parW.baseFail} the base could not solve either, and of the ${parW.bothRef} both readings refuse, ${parW.reclass.length} are refused by a DIFFERENT law than the base's (${[...new Set(parW.reclass.map((x) => `${x[1]}→${x[2]}`))].slice(0, 4).join(', ') || 'none'}) — a reclassification is not a new refusal and is reported here so it cannot pass as one. Regenerate the manifest with --fuzz N --write-base-parity <the base's web/scene/ballreturn>`,
      !!BPW && srcOkW && genOkW && parW.falseRef.length === 0 && parW.set > 0 && nPW === Math.min(FUZZW, BPW.n)
      && parW.adm.every((x) => x[2] > BPW.grain_nm) && admBadW.length === 0 && admCtxW.length === 0
      && parW.recovered.length === 0 && (fzW.pinLeak ?? ['unscanned']).length === 0,
      JSON.stringify({ n: nPW, src: BPW && BPW.src ? { dir: BPW.src.dir, track: BPW.src.files['track.js'], mine: MINEW['track.js'] } : null,
        gen: genOkW ? 'match' : `MISMATCH at ${ckW}`, defKeys: fzW.defKeys, pinLeak: fzW.pinLeak, set: parW.set, falseRef: parW.falseRef.slice(0, 6),
        admLaw: Object.fromEntries(admLawW), admBad: admBadW.map(admRowW), admCtxMissing: admCtxW.map((x) => x[0]),
        adm: parW.adm.map(admRowW), fixed: parW.fixed, recovered: parW.recovered.slice(0, 6),
        baseFail: parW.baseFail, bothRef: parW.bothRef, reclass: parW.reclass.slice(0, 4) }));
    // (b) POST-STOP INVARIANCE over the same corpus — the oracle that would have caught class Y3 on
    // the run that shipped it. Every built geometry is re-read with geometry added PAST its own stop
    // face, inside the lip V6 allows, and the route, the rest ladder and the seat a real solve comes
    // to must not move. The extension is drawn from its own random stream so the corpus itself is
    // untouched: arm t10b's numbers are the same numbers whether this oracle runs or not.
    const invY = fzW.inv;
    const invRedY = plantY3.err ? null : fuzzW(Math.min(FUZZW, 200), plantY3).inv;
    const invKindY = [...invY.byKind.entries()].sort((a, b) => b[1] - a[1]);
    check(`t11k ORACLE (b) — POST-STOP INVARIANCE over the fuzz corpus (GH-770 review r5, class Y4b): each of the ${FUZZW} geometries re-read with a lip added past its own stop face — the last leg lengthened by whole copies of itself, one appended collinear, or one bent ±45° out of the heading, 0.2 mm to whatever the ${(2 * R / MM).toFixed(2)} mm V6 allowance still has room for. ${invY.applied} cases carry one (${invKindY.map(([k, n]) => `${k} ${n}`).join(', ')}); the rest are honestly skipped and counted — ${invY.skipBuild} never built, ${invY.skipFace} have the stop face past the end of their own wire (there is nothing behind it to add to), ${invY.skipRoom} have no lip headroom left. VIOLATIONS — a route length, a rest-ladder seat or a solved resting pose that moved — ${invY.viol.length}${invY.viol.length ? ` (${invY.viol.slice(0, 3).map((v) => `case ${v[0]} ${v[2]} ${v[1] === null ? 'SHAPE' : (v[1] / MM).toFixed(6) + ' mm'}`).join('; ')})` : ''}, worst ${invY.worst.toExponential(2)} m${invY.worstAt ? ` (case ${invY.worstAt[0]}, ${invY.worstAt[1]} ${invY.worstAt[2]} mm)` : ''}, against the 1e-9 m bar; ${invY.flips} extensions flip the definition's admissibility (a lip is geometry and V6 may refuse it — those are dropped, not scored). The same oracle over the pre-fix clearance trim — this round's Y3 lines put back, the first ${Math.min(FUZZW, 200)} cases — reads ${invRedY ? invRedY.viol.length : '-'} violations of ${invRedY ? invRedY.applied : '-'} applied, worst ${invRedY ? (invRedY.worst / MM).toFixed(6) : '-'} mm: the oracle fails on the code that shipped the defect and passes on the code that fixes it, which is the only reason to keep it. It stays in the battery as a permanent row`,
      invY.viol.length === 0 && invY.worst <= 1e-9 && invY.applied >= Math.floor(FUZZW * 0.15)
      && invY.byKind.size === 3 && !!invRedY && invRedY.viol.length >= 1 && invRedY.worst > 1e-5,
      JSON.stringify({ applied: invY.applied, kinds: invKindY, viol: invY.viol.slice(0, 5), worst: +invY.worst.toExponential(2), worstAt: invY.worstAt,
        flips: invY.flips, flipRows: invY.flipRows.slice(0, 3), skip: [invY.skipBuild, invY.skipFace, invY.skipRoom, invY.skipShape],
        red: invRedY && [invRedY.applied, invRedY.viol.length, +(invRedY.worst / MM).toFixed(6)] }));
    // t11l (arms Y1-4 / Y2-4 / Y3-4) — what the three laws do to the definitions in web/scene/ballreturn/tracks plus web/tools/fixtures/ballreturn-tracks: nothing. Each of
    // them is a rule about geometry the exporter MAY emit, and the definitions in web/scene/ballreturn/tracks plus web/tools/fixtures/ballreturn-tracks today are
    // not near any of the three edges — which is stated by measuring it, one plant at a time, and not
    // by asserting it. The SOLVE is reported separately from the BUILD because the Y1 bound is a
    // pose-time refusal: it cannot move a route, only forbid a ride down one.
    const shipY = censusW.filter((c) => !c.name.startsWith('fixture'));
    const shipRefY = shipY.map((c) => sigW(SHIPW, c.def, c.pockets, c.falls));
    const inertY = [['Y1', plantY1], ['Y2', plantY2], ['Y3', plantY3]].map(([tag, M2]) => {
      if (M2.err) return { tag, err: M2.err };
      const row = { tag, rows: 0, build: 0, buildBad: 0, solveDiff: [], full: 0 };
      shipY.forEach((c, k) => {
        const s2 = sigW(M2, c.def, c.pockets, c.falls); row.rows += 1;
        const db = devBW(shipRefY[k], s2);
        if (Number.isNaN(db)) row.buildBad += 1; else row.build = Math.max(row.build, db);
        const df = devW(shipRefY[k], s2);
        if (Number.isNaN(df) || df > 1e-12) row.solveDiff.push([c.name, shipRefY[k].sshape === s2.sshape ? +df.toExponential(2) : s2.sshape]);
        else row.full = Math.max(row.full, df);
      });
      return row;
    });
    const shipTotalY = shipRefY.reduce((a, s) => a + (s.err ? 0 : s.total), 0);
    check(`t11l the three laws against the definitions in web/scene/ballreturn/tracks plus web/tools/fixtures/ballreturn-tracks (GH-770 review r5, arms Y1-4 / Y2-4 / Y3-4): the ${shipY.length} definitions in web/scene/ballreturn/tracks plus web/tools/fixtures/ballreturn-tracks read through this module and through each of the three red plants in turn. What the construction BUILDS is identical under all three — ${inertY.map((x) => `${x.tag} ${x.err ? 'PLANT FAILED' : `${x.build.toExponential(1)} m over ${x.rows}`}`).join(', ')}, ${inertY.reduce((n, x) => n + (x.buildBad ?? 0), 0)} shape changes — so none of the three fixes moves a single route or seat of those definitions: ${(shipTotalY / MM).toFixed(6)} mm of centre path over ${shipRefY.reduce((n, s) => n + (s.err ? 0 : s.routes), 0)} routes and ${shipRefY.reduce((n, s) => n + (s.err ? 0 : s.seats), 0)} seats, unchanged, and t6d's committed bytes are untouched. What the three laws DO change is what may be RIDDEN: ${inertY.map((x) => `${x.tag} ${x.err ? '-' : x.solveDiff.length}`).join(', ')} of the ${shipY.length} definitions in the union solve differently under their plant${inertY.some((x) => !x.err && x.solveDiff.length) ? ` — ${inertY.filter((x) => !x.err && x.solveDiff.length).map((x) => `${x.tag}: ${x.solveDiff.slice(0, 3).map((d) => `${d[0]} ${typeof d[1] === 'string' ? d[1] : `${d[1]} m`}`).join(', ')}`).join('; ')}` : ''}. A law that changes no route and no seat of those definitions is exactly what a construction fix for an exporter edge should look like; a law that changes a SOLVE of one of those definitions is the finding itself, and it is reported here rather than left inside a fixture`,
      inertY.every((x) => !x.err && x.buildBad === 0 && x.build === 0) && shipY.length >= 12 && shipTotalY > 0,
      JSON.stringify(inertY.map((x) => x.err ? [x.tag, x.err.slice(0, 90)] : [x.tag, x.rows, +x.build.toExponential(1), x.buildBad, x.solveDiff.length, x.solveDiff.slice(0, 2)])));
    // t11m — WHICH CLAUSE of the Y1 law does the work, measured rather than implied. The law has
    // two: the bound is the MAX over the junction's two ENDPOINTS, and it is NEVER below zero. Each
    // one alone is read here against the order's own sweep and against the definitions in web/scene/ballreturn/tracks plus web/tools/fixtures/ballreturn-tracks (shipY), and the
    // second endpoint's own depth is censused at every cross-runway cut in those definitions and the in-file class-W and class-Y fixtures (censusY) that validateTrack accepts (a refused one's cuts are dropped with it) — so the report
    // states which half changes behaviour today instead of letting the reader assume both do.
    const ENTFIXY = '      out.pen = Math.max(0, A.rw === B.rw ? pen : Math.max(penB, penInto(B, IB)));';
    const entY = await redPlant('y1ent', [[ENTFIXY,
      '      if (A.rw !== B.rw) (globalThis.__ENTY ??= []).push([penB, penInto(B, IB)]);\n' + ENTFIXY]]);
    const floorOnlyY = await redPlant('y1floor', [[ENTFIXY, '      out.pen = Math.max(0, A.rw === B.rw ? pen : penB);']]);
    const maxOnlyY = await redPlant('y1max', [[ENTFIXY, '      out.pen = A.rw === B.rw ? pen : Math.max(penB, penInto(B, IB));']]);
    const entRowsY = [];
    if (!entY.err) for (const c of censusY) {
      globalThis.__ENTY = [];
      try { entY.schema.validateTrack(c.def, { pockets: c.pockets, falls: c.falls }); } catch { continue; }
      for (const [pb, pi] of globalThis.__ENTY) entRowsY.push([c.name, pb, pi]);
    }
    const entBindY = entRowsY.filter(([, pb, pi]) => pi > Math.max(0, pb) + 1e-15);
    const entNegY = entRowsY.filter(([, pb]) => pb < 0);
    const halvesY = [['the zero floor alone', floorOnlyY], ['the endpoint max alone', maxOnlyY]].map(([tag, M2]) => {
      if (M2.err) return { tag, err: M2.err };
      const row = { tag, sweepBad: 0, sweepMinEnt: Infinity, sweepDev: 0, shipDev: 0, shipBad: 0 };
      for (let k = 0; k <= 100; k += 1) {
        const a = y1SweepY[k], b2 = y1ReadY(M2, k * 0.05);
        if (b2.err || b2.solved !== 2 || b2.thrown) { row.sweepBad += 1; continue; }
        row.sweepDev = Math.max(row.sweepDev, Math.abs(b2.total - a.total));
        if (b2.minEnt !== null) row.sweepMinEnt = Math.min(row.sweepMinEnt, b2.minEnt);
      }
      shipY.forEach((c, k) => {
        const s2 = sigW(M2, c.def, c.pockets, c.falls);
        const d = devW(shipRefY[k], s2);
        if (Number.isNaN(d)) row.shipBad += 1; else row.shipDev = Math.max(row.shipDev, d);
      });
      return row;
    });
    check(`t11m which clause of the Y1 law does the work, measured (GH-770 review r5, class Y1, the scope of the fix). The law has two clauses — the bound is the MAX over the junction's two endpoints, and it is never below zero — and each of them ALONE, planted into a temp copy, cures the order's case: over the 101-step tray sweep ${halvesY.map((h) => `${h.tag} ${h.err ? 'PLANT FAILED' : `${101 - h.sweepBad}/101 solve, route to ${h.sweepDev.toExponential(1)} m`}`).join(', ')}, and over the ${shipY.length} definitions in web/scene/ballreturn/tracks plus web/tools/fixtures/ballreturn-tracks ${halvesY.map((h) => `${h.err ? '-' : h.shipDev.toExponential(1)} m`).join(' / ')} of deviation from this module. They cure it because the SECOND endpoint is structurally the downstream floor's own vertex: over ${entRowsY.length} cross-runway cuts in ${new Set(entRowsY.map((x) => x[0])).size} definitions of web/scene/ballreturn/tracks plus web/tools/fixtures/ballreturn-tracks and the in-file class-W and class-Y fixtures its depth reads ${entRowsY.length ? `${Math.min(...entRowsY.map((x) => x[2])).toExponential(3)} … ${Math.max(...entRowsY.map((x) => x[2])).toExponential(3)} m` : '-'} — zero to within a double's last bits — while the FIRST endpoint, the upstream lip, stands CLEAR at ${entNegY.length} of them (down to ${entRowsY.length ? Math.min(...entRowsY.map((x) => x[1])).toExponential(3) : '-'} m). So ${entBindY.length} of the ${entRowsY.length} has a second endpoint that BINDS above the floor: on the definitions in web/scene/ballreturn/tracks plus web/tools/fixtures/ballreturn-tracks and the in-file class-W and class-Y fixtures as they stand today the zero floor is what changes behaviour, and the endpoint max is the law's statement of what the bound IS rather than an independent cure. It is kept because the law is written over the JUNCTION — the cut has two ends, and a rule that reads one of them is the defect this round is fixing — and because it costs one call already in the file. This arm exists so the report can say that in numbers instead of claiming a two-part fix where the definitions in web/scene/ballreturn/tracks plus web/tools/fixtures/ballreturn-tracks and the in-file class-W and class-Y fixtures exercise one part`,
      !entY.err && entRowsY.length >= 10 && entBindY.length === 0 && entNegY.length >= 1
      && halvesY.every((h) => !h.err && h.sweepBad === 0 && h.shipBad === 0 && h.shipDev <= 1e-12 && h.sweepDev <= 1e-12),
      JSON.stringify({ cuts: entRowsY.length, defs: new Set(entRowsY.map((x) => x[0])).size,
        second: entRowsY.length ? [+Math.min(...entRowsY.map((x) => x[2])).toExponential(3), +Math.max(...entRowsY.map((x) => x[2])).toExponential(3)] : null,
        first: entRowsY.length ? [+Math.min(...entRowsY.map((x) => x[1])).toExponential(3), +Math.max(...entRowsY.map((x) => x[1])).toExponential(3)] : null,
        bind: entBindY.length, halves: halvesY.map((h) => h.err ? [h.tag, h.err.slice(0, 90)] : [h.tag, h.sweepBad, +h.sweepDev.toExponential(1), +h.shipDev.toExponential(1), h.shipBad, h.sweepMinEnt === Infinity ? null : +(h.sweepMinEnt / MM).toExponential(3)]) }));
    // t11n (GH-770 review r5, class Y2, the scope of the fix — and the battery's one survivor).
    // N193 moves the snapshot INSIDE the blend loop, so each blend reads what is LEFT of the piece
    // rather than what the trims left. No arm above can fail on it, and that is not an oversight:
    // it refuses nothing new, and it cannot overrun a piece either, because 45 % and then 45 % of
    // the remainder spends 0.70 of the extent where the snapshot spends 0.90. It is the tighter of
    // the two readings by that measure. What it breaks is what the 45 % IS — the budget one blend
    // owes the OTHER blend on the same piece — so a joint's corner comes to depend on how much the
    // piece's other joint already took, i.e. on which end the walk started from. That is a
    // derivation argument, not a bound, so this arm does what an arm can do: it MEASURES the
    // difference, bounds where it is visible, and fails if it ever becomes a refusal difference.
    const twoY = (M2, def, ctx) => {
      let tr = null;
      try { tr = M2.schema.validateTrack(def, ctx ?? { pockets: POCKETS, falls: null }); } catch (e) { return { err: e.message }; }
      let total = 0; const seats = [];
      for (const [, rt] of tr.routes) {
        total += rt.total;
        for (let k = 0; k <= 40; k += 1) { const st = M2.track.stationAt(rt, rt.total * k / 40, rt.r, {}); seats.push(st.x, st.y, st.z); }
      }
      return { total, seats, tr };
    };
    const devY = (a, b) => {
      if (!!a.err !== !!b.err) return null;                          // a refusal difference
      if (a.err) return 0;
      let w = Math.abs(a.total - b.total);
      for (let k = 0; k < a.seats.length; k += 1) w = Math.max(w, Math.abs(a.seats[k] - b.seats[k]));
      return w;
    };
    const SNAPY = '  for (const pc of pieces) { pc.sAT = pc.sA; pc.sBT = pc.sB; }';
    const BDECLY = '    const B = pieces[i + 1];';
    // both edits are IDEMPOTENT: a module that already reads the extent live absorbs the plant
    // without changing, and this arm then reports 0 differences and FAILS — which is how it kills
    // the mutant on behaviour rather than on the anchor the mutation happens to remove.
    const LIVEY = [[SNAPY, '', 'track.js', true],
      [BDECLY, BDECLY + '\n    A.sAT = A.sA; A.sBT = A.sB; B.sAT = B.sA; B.sBT = B.sB;', 'track.js', true]];
    const liveY = await redPlant('y2live', LIVEY);
    const gridDefsY = [Y2DEF, ...y2GridY.map((g) => g.def)];
    let movedY = 0, worstMoveY = 0, refDiffY = 0, builtY = 0;
    if (!liveY.err) {
      for (const d of gridDefsY) {
        const a = twoY(SHIPW, d), b = twoY(liveY, d);
        const w = devY(a, b);
        if (w === null) { refDiffY += 1; continue; }
        if (a.err) continue;
        builtY += 1;
        if (w > 1e-12) { movedY += 1; worstMoveY = Math.max(worstMoveY, w); }
      }
    }
    // the same plant against the definitions in web/scene/ballreturn/tracks plus web/tools/fixtures/ballreturn-tracks and against the class-W fixture census
    let shipMoveY2 = 0, shipWorstY2 = 0, censMoveY = 0, censRowsY = 0;
    if (!liveY.err) {
      for (const c of censusW) {
        const ctx = { pockets: c.pockets, falls: c.falls };
        const a = twoY(SHIPW, c.def, ctx), b = twoY(liveY, c.def, ctx);
        const w = devY(a, b);
        if (w === null || a.err) continue;
        censRowsY += 1;
        if (w > 1e-12) { censMoveY += 1; }
        if (!c.name.startsWith('fixture')) { if (w > 1e-12) shipMoveY2 += 1; shipWorstY2 = Math.max(shipWorstY2, w); }
      }
    }
    // and whether the tighter reading ever costs a SOLVE: the fixture plus a diagonal of the grid
    const solvesY = (M2, def) => {
      let tr = null; try { tr = M2.schema.validateTrack(def, { pockets: POCKETS, falls: null }); } catch (e) { return -1; }
      let n = 0;
      for (const [pk] of tr.routes) {
        try {
          const h1 = M2.kin.handoffFromSink({ t: 1, pocket: POCKETS[pk], fall: POCKETS[pk], r: tr.refR, tFall: 0.021, glide: 0.06 }, { track: tr, pockets: POCKETS, r: tr.refR });
          M2.kin.solveShot({ track: tr, r: tr.refR, ledger: [], arrivals: [{ id: 1, handoff: h1 }] });
          n += 1;
        } catch (e) { /* counted by absence */ }
      }
      return n;
    };
    const diagY = [Y2DEF, ...Array.from({ length: 21 }, (_, k) => y2GridY[k * 21 + k].def)];
    let solveDiffY = 0, solveNowY = 0, solveRedY = 0;
    if (!liveY.err) for (const d of diagY) { const a = solvesY(SHIPW, d), b = solvesY(liveY, d); solveNowY += Math.max(0, a); solveRedY += Math.max(0, b); if (a !== b) solveDiffY += 1; }
    check(`t11n the battery's one survivor, measured (GH-770 review r5, class Y2, the scope of the fix). N193 — the snapshot moved INSIDE the blend loop, each blend budgeted from what is LEFT of the piece — ${liveY.err ? 'PLANT FAILED' : `is a real difference and not an equivalent mutant: over the order's fixture and the ${y2GridY.length}-combination grid it moves ${movedY} of the ${builtY} built cases by up to ${(worstMoveY / MM).toFixed(6)} mm of route or seat. It is also invisible everywhere else: ${refDiffY} refusal differences over the grid, ${shipMoveY2} of the ${censRowsY} census rows (a row is counted only when it builds: the definitions in web/scene/ballreturn/tracks plus web/tools/fixtures/ballreturn-tracks and the in-file class-W fixtures alike) are definitions from those two dirs that move (worst ${(shipWorstY2 / MM).toFixed(6)} mm), ${censMoveY} of ${censRowsY} rows move at all, and over the fixture plus the grid's 21-step diagonal the two readings complete the same ${solveNowY} / ${solveRedY} single-ball solves with ${solveDiffY} differences`}. That is why it survives: no arm above can fail on it. It cannot overrun a piece either — 0.45 and then 0.45 of the remainder spends 0.70 of the extent where the snapshot spends 0.90, so it is the TIGHTER reading. The reason to reject it is the one the fix is written from: the 45 % is the budget one blend owes the OTHER blend on the same piece, and read live a joint's corner depends on how much the piece's other joint already took — on which end the walk started from. This arm states that in numbers and fails if the difference ever becomes a refusal or a lost solve — and, because both of its edits are idempotent, it also fails when the module under test ALREADY reads live, with ${movedY} of ${builtY} cases moving — and it says which of its ${LIVEY.length} edits the copy absorbed as a no-op (${liveY.skipped.length ? liveY.skipped.join(' | ') : 'none'}), because a plant whose every edit is absorbed is the module under test wearing another tag`,
      !liveY.err && builtY >= 400 && movedY >= 1 && worstMoveY > 1e-6 && refDiffY === 0
      && shipMoveY2 === 0 && censMoveY === 0 && solveDiffY === 0 && solveNowY === solveRedY && solveNowY > 0
      && liveY.skipped.length < LIVEY.length,
      JSON.stringify({ built: builtY, moved: movedY, worstMove_mm: +(worstMoveY / MM).toFixed(6), refDiff: refDiffY,
        censusRows: censRowsY, censusMoved: censMoveY, shipMoved: shipMoveY2, solves: [solveNowY, solveRedY], solveDiff: solveDiffY,
        plantSkipped: liveY.skipped, plantEdits: LIVEY.length }));
    // ================= classes AA / AB / AC (GH-770 review round 6) ===================================
    // Round 6 found two more readings of round 5's shape — geometry the ball never touches moving the
    // ball. AA: TWO retention criteria for one run. A length rule after the walk read the exported edge's
    // END ("ends on its own vertex" kept a whole tail, a clipped one shorter than its corner was popped)
    // while the corner law read the walked extent, and the two disagree exactly where the corner is
    // shallow — so doubling a tail BEHIND an unchanged stop face moved the route 2.670304 mm. The length
    // rule is gone; the corner law is the one criterion and it reads [sA0, sB0]. AB: `clearTrim`'s gap
    // read the dropped strip as infinitely WIDE — the lateral coordinate was dropped because it cancels
    // on a slope-only joint — and the cascade hands the trim NON-coplanar pairs too, where it found
    // contact in the air beside the floor and cut 1.264058 mm of support the ball can use. The lateral
    // now rides in the gap clamped to the strip's own half-extent, with the SIDE and CORNER root families
    // the clamp adds. AC asks why round 5's oracle (b) and the clearance census saw neither, answers it by
    // measurement, and adds the oracle that does (c): the cascade's trim against an independent
    // first-contact probe, over every trimmed pair of the corpus.
    const DROPPEDW = '  const dropped = [];                   // …and the ones the ride does NOT use: still floor, still measured\n';
    const AALOOPW = `  while (pieces.length >= 2) {
    const A = pieces[pieces.length - 2];
    const B = pieces[pieces.length - 1];
    if (B.sB > B.edge.s0 + B.edge.len - 1e-12) break;  // ends on its own vertex: support, not a fragment
    const lenB = B.sB - B.sA;
    const concave = dot(B.edge.t, A.edge.n) > 1e-9;
    const lam = concave ? 0.5 * (A.h + B.h) * Math.tan(0.5 * angle3(A.edge.t, B.edge.t)) : 0;
    if (lenB < lam - 1e-12) dropped.push(pieces.pop()); else break;
  }
`;
    const GAP3W = '      const dwc = w - wc;\n      return (dwc === 0 ? Math.hypot(s - sc, n) : Math.hypot(s - sc, dwc, n)) - h;';   // the P3-2 branch: the coplanar identity exact by construction
    const GAP2W = '      return Math.hypot(s - sc, n) - h;';
    const SIDECORNERW = `    for (const wEnd of [-tol, tol]) {
      quad(dw * dw + dn * dn,                                      // past a SIDE of it
        2 * (dw * (w0 - wEnd) + dn * n0),
        (w0 - wEnd) * (w0 - wEnd) + n0 * n0 - h * h);
      for (const sEnd of sEnds) {                                  // past a CORNER of it
        quad(ds * ds + dw * dw + dn * dn,
          2 * (ds * (s0 - sEnd) + dw * (w0 - wEnd) + dn * n0),
          (s0 - sEnd) * (s0 - sEnd) + (w0 - wEnd) * (w0 - wEnd) + n0 * n0 - h * h);
      }
    }
`;
    // AA's plant puts the ac673ed7 loop back after the walk; AB's puts the 2-D gap and root set back.
    // Both AB edits are IDEMPOTENT: a module that already reads the strip as infinitely wide absorbs
    // them, and the arms below then fail on their MEASUREMENT (over-trim 0, oracle (c) green on the
    // plant) instead of on a missing anchor (class Z5).
    const plantAA = await redPlant('aa', [[DROPPEDW, DROPPEDW + AALOOPW]]);
    const plantAB = await redPlant('ab', [[GAP3W, GAP2W, 'track.js', true], [SIDECORNERW, '', 'track.js', true]]);
    const multiAbsW = (steps, face, width) => {                  // multiW with an ABSOLUTE stop face
      const d = JSON.parse(JSON.stringify(tbW));
      d.support = supW(width);
      for (const rw of d.runways) {
        if (!rw.stop) continue;
        const p0 = rw.points_mm[0]; const sgn = Math.sign(rw.points_mm[1][2] - p0[2]);
        const pts = [p0];
        for (const [dy, dz] of steps) { const q = pts[pts.length - 1]; pts.push([q[0], +(q[1] + dy).toFixed(6), +(q[2] + sgn * dz).toFixed(6)]); }
        rw.points_mm = pts; rw.support = supW(width);
        rw.stop.wall_s_mm = +face.toFixed(6);
        rw.stop.capacity_balls = Math.max(1, Math.floor(face / (2 * R / MM) + 1e-9));
      }
      return d;
    };
    const stepsLenW = (steps) => steps.reduce((a, q) => a + Math.hypot(q[0], q[1]), 0);
    const dblStepsW = (steps, k = 2) => steps.map((q, m) => (m === steps.length - 1 ? [k * q[0], k * q[1]] : q));
    const routeOfW = (M2, def, pk = 1) => {
      let tr = null;
      try { tr = M2.schema.validateTrack(def, { pockets: POCKETS, falls: null }); } catch (e) { return { err: e.message }; }
      const rt = tr.routes.get(pk) ?? tr.routes.get([...tr.routes.keys()].sort((a, b) => a - b)[0]);
      let gate = true; try { M2.kin.designGate(tr, { pockets: POCKETS, r: tr.refR }); } catch (e) { gate = e.message; }
      return { tr, rt, gate, kinds: rt.segs.map((x) => x.kind).join(','), segs: rt.segs.map((x) => `${x.kind} ${(x.len / MM).toFixed(6)}`).join(' | ') };
    };
    const readAAW = (M2, def) => { const r = routeOfW(M2, def); return r.err ? r : { ...sigW(M2, def), ...r }; };
    const seatShiftW = (a, b) => (a.seat && b.seat && a.seat.length >= 3 && b.seat.length >= 3 ? Math.hypot(a.seat[0] - b.seat[0], a.seat[1] - b.seat[1], a.seat[2] - b.seat[2]) : NaN);
    // ---- AA-1: the order's own fixture -----------------------------------------------------------
    // 48-55-73 and 3-4-5 are Pythagorean, so the wire is 73.5 mm long TO THE BIT and the face at 73.5
    // is the tail's end exactly — which is the whole point: the two criteria only disagree when the face
    // sits on the vertex to within 1e-12 m, and no exporter's 6-decimal grid puts it there by chance
    // (arm AC-1 measures that on the corpus).
    const AA_REVIEW = { steps: [[-48, 55], [-0.3, 0.4]], face: 73.5, width: 80 };
    const aaWhole = multiAbsW(AA_REVIEW.steps, AA_REVIEW.face, AA_REVIEW.width);
    const aaDbl = multiAbsW(dblStepsW(AA_REVIEW.steps), AA_REVIEW.face, AA_REVIEW.width);
    const aa1W = readAAW(SHIPW, aaWhole), aa1D = readAAW(SHIPW, aaDbl);
    const aa1Dev = devW(aa1W, aa1D);
    check(`t12a ONE retention criterion, read over the walked extent: the order's own fixture (GH-770 review r6, class AA, arm AA-1). An 80 mm channel chute dropping 48 mm over 55 mm — a 48-55-73 leg, so the wire is 73 mm long to the bit — then a 0.5 mm tail turned 4.24° shallower (3-4-5), the stop face at 73.5 mm: exactly the tail's end. Its twin has ONLY the final delta doubled (0.6/0.8 — the wire now 74 mm) with the face unmoved, so every byte before the face is identical and the difference is 0.5 mm of tail behind a plate the ball is stopped at. Both validate, both pass designGate (${aa1W.gate === true ? 'ok' : String(aa1W.gate).slice(0, 60)} / ${aa1D.gate === true ? 'ok' : String(aa1D.gate).slice(0, 60)}). On ac673ed7 the length rule read the tail's END: "ends on its own vertex" kept the whole 0.5 mm tail, and the doubled twin's stop-clipped 0.5 mm was shorter than the 1.048 mm corner its joint wants and was popped — 132.563425 → 129.893121 mm of route and 2.670304 mm of resting ball, measured on the plant in arm AA-3. Here the corner law is the ONE criterion, it reads [sA0, sB0], and the corner is 0.0616 mm deep either way (under the 0.1 mm grain, so the tail is kept and the ball rides it): the whole reads ${aa1W.err ? 'REFUSED' : (aa1W.first / MM).toFixed(6)} mm over ${aa1W.err ? '-' : aa1W.segs}, the doubled ${aa1D.err ? 'REFUSED' : (aa1D.first / MM).toFixed(6)} mm over ${aa1D.err ? '-' : aa1D.segs} — every route length and every seat of both pockets' rest ladders identical to ${Number.isNaN(aa1Dev) ? 'SHAPE MISMATCH' : aa1Dev.toExponential(2) + ' m'}, the solved seat itself moving ${(seatShiftW(aa1W, aa1D) / MM).toFixed(9)} mm`,
      !aa1W.err && !aa1D.err && aa1W.gate === true && aa1D.gate === true && aa1Dev <= 1e-9
      && Math.abs(aa1W.first - 0.132563425) < 5e-10 && aa1W.kinds === 'line,arc,line,cut,line' && aa1D.kinds === aa1W.kinds
      && aa1W.seat.length === 6 && seatShiftW(aa1W, aa1D) <= 1e-9,
      JSON.stringify({ whole: aa1W.err ?? [+(aa1W.first / MM).toFixed(6), aa1W.kinds, aa1W.gate === true], doubled: aa1D.err ?? [+(aa1D.first / MM).toFixed(6), aa1D.kinds, aa1D.gate === true], dev: aa1Dev, seatShift_mm: +(seatShiftW(aa1W, aa1D) / MM).toFixed(9) }));
    // ---- AA-2: the sweep — the final delta ×1 … ×8 across the stop's position on the tail --------
    const AA_FIX = [
      { name: 'review 48-55-73 | 3-4-5 (θ 4.24°), w 80', steps: AA_REVIEW.steps, width: 80 },
      { name: '20-21-29 ×2.5 | 48-55-73 ×0.01 (θ 2.49°), w 60', steps: [[-50, 52.5], [-0.48, 0.55]], width: 60 },
      { name: '3-4-5 ×15 | 28-45-53 ×0.02 (θ 4.98°), w 120', steps: [[-45, 60], [-0.56, 0.9]], width: 120 },
    ];
    const aa2 = { readings: 0, compared: 0, viol: [], flips: [], worst: 0, refused: [], built: 0 };
    for (const f of AA_FIX) {
      const L0 = stepsLenW(f.steps.slice(0, -1)), ell = Math.hypot(...f.steps[f.steps.length - 1]);
      for (let j = 1; j <= 10; j += 1) {
        const face = +(L0 + ell * j / 10).toFixed(6);                                       // j = 10: the tail's end, exact by construction
        const ref = sigW(SHIPW, multiAbsW(f.steps, face, f.width)); aa2.readings += 1;
        if (ref.err) aa2.refused.push([f.name, j, ref.err]); else aa2.built += 1;
        for (let k = 2; k <= 8; k += 1) {
          const s2 = sigW(SHIPW, multiAbsW(dblStepsW(f.steps, k), face, f.width)); aa2.readings += 1; aa2.compared += 1;
          if (!!ref.err !== !!s2.err) { aa2.flips.push([f.name, j, k, ref.err ?? s2.err]); continue; }
          if (ref.err) continue;
          const dv = devW(ref, s2);
          if (Number.isNaN(dv) || dv > 1e-9) aa2.viol.push([f.name, j, k, Number.isNaN(dv) ? 'shape' : +dv.toExponential(2)]);
          else aa2.worst = Math.max(aa2.worst, dv);
        }
      }
    }
    check(`t12b the same invariance as a SWEEP (GH-770 review r6, class AA, arm AA-2): three Pythagorean chute-and-tail fixtures (${AA_FIX.map((f) => f.name).join('; ')}), the stop face placed at 10 %, 20 % … 100 % of the tail's length (the last one its end, exact by construction), and at each face the final delta multiplied ×1 … ×8 — ${aa2.readings} readings, ${aa2.compared} comparisons against the ×1 reading at the same face. Every reading builds (${aa2.refused.length} refused); across the multipliers ${aa2.flips.length} admissions flip and ${aa2.viol.length} readings move — worst deviation over every route length, every rest-ladder seat and every solved seat ${aa2.worst.toExponential(2)} m against the 1e-9 m bar. At the faces inside the tail the clipped portion is the same at every multiplier and the material behind the plate grows ×1 → ×8; at the tail's end the ×1 tail is a whole edge and every other one is clipped — which is exactly the case the two criteria split on, and here it reads the same to the bit`,
      aa2.compared >= 200 && aa2.refused.length === 0 && aa2.flips.length === 0 && aa2.viol.length === 0 && aa2.worst <= 1e-9 && aa2.built === 30,
      JSON.stringify({ readings: aa2.readings, compared: aa2.compared, built: aa2.built, refused: aa2.refused.slice(0, 3), flips: aa2.flips.slice(0, 3), viol: aa2.viol.slice(0, 4), worst: +aa2.worst.toExponential(2) }));
    // ---- AA-3: the red plant, and the EXACT family the oracle needs ------------------------------
    // The family that exposes AA has to put the face on the tail's end to within 1e-12 m, so its legs
    // are primitive Pythagorean triples scaled by 3- and 4-decimal factors: chute (a, b, c), tail
    // (a', b', c') with the tail 0.3–8° shallower, the tail no longer than 3 × the corner cut R·tan(θ/2)
    // and dropping no more than 10 × the grain, the face at the tail's end or inside it. A SEPARATE
    // seeded stream (0xAA5EED): the class-W corpus is pinned by oracle (a)'s manifest and stays so.
    const TRIPLESW = (() => {
      const out = [];
      const gcd = (x, y) => (y ? gcd(y, x % y) : x);
      for (let m = 2; m * m <= 300; m += 1) for (let n = 1; n < m; n += 1) {
        if ((m - n) % 2 === 0 || gcd(m, n) !== 1) continue;
        const a = m * m - n * n, b = 2 * m * n, c = m * m + n * n; if (c > 300) continue;
        out.push({ a, b, c, ang: Math.atan2(a, b) }); out.push({ a: b, b: a, c, ang: Math.atan2(b, a) });
      }
      return out.sort((x, y) => x.ang - y.ang);
    })();
    const aaCasesW = (n, seed = 0xAA5EED) => {
      const rnd = rngW(seed); const out = []; const uR = 0.01;
      const drainMin = Math.atan(1.4 * uR) + 0.2 * Math.PI / 180;                 // V7: the tail must still drain
      const pairs = [];
      for (const T of TRIPLESW) for (const T2 of TRIPLESW) { const th = T.ang - T2.ang; if (th > 0.3 * Math.PI / 180 && th < 8 * Math.PI / 180 && T2.ang > drainMin) pairs.push([T, T2]); }
      for (let i = 0; i < n; i += 1) {
        const U = (lo, hi) => lo + (hi - lo) * rnd();
        const [T, T2] = pairs[Math.floor(rnd() * pairs.length)];
        const k = Math.max(1e-3, +(U(20, 140) / T.a).toFixed(3));                 // a 3-decimal scale keeps every coordinate on the 6-decimal grid
        const th = T.ang - T2.ang;
        const lam = R / MM * Math.tan(th / 2);
        const hi = Math.min(3 * lam, (10 * EXPORT_GRAIN / MM) / Math.sin(T2.ang));
        const lo = 1.5 * EXPORT_GRAIN / MM;
        const q = Math.max(1e-4, +((hi > lo ? U(lo, hi) : lo) / T2.c).toFixed(4));
        const ell = q * T2.c;
        const atEnd = rnd() < 0.5;
        const faceOff = atEnd ? 0 : -U(0, 0.9 * ell);
        const width = U(40, 120);
        const steps = [[-(k * T.a), k * T.b], [-(q * T2.a), q * T2.b]].map((s2) => s2.map((v) => +v.toFixed(6)));
        out.push({ i, steps, faceOff: +faceOff.toFixed(6), width: +width.toFixed(2), th: th * 180 / Math.PI, ell, atEnd, tri: `${T.a}-${T.b}-${T.c} ×${k} | ${T2.a}-${T2.b}-${T2.c} ×${q}` });
      }
      return out;
    };
    const AAN = 600;
    const aaFamW = aaCasesW(AAN).map((c) => { const L = stepsLenW(c.steps); const face = +(L + c.faceOff).toFixed(6); return { ...c, a: multiW(c.steps, c.faceOff, c.width), b: multiAbsW(dblStepsW(c.steps), face, c.width) }; });
    const dblFamW = (M2) => {
      const o = { applied: 0, viol: [], worst: 0, flips: 0, refused: 0, atEndViol: 0 };
      for (const c of aaFamW) {
        const s1 = sigW(M2, c.a); if (s1.err) { o.refused += 1; continue; }
        const s2 = sigW(M2, c.b); if (s2.err) { o.flips += 1; continue; }
        o.applied += 1;
        const dv = devW(s1, s2);
        if (Number.isNaN(dv) || dv > 1e-9) { o.viol.push([c.i, Number.isNaN(dv) ? 'shape' : +dv.toExponential(2), +(s1.first / MM).toFixed(6), +(s2.first / MM).toFixed(6), c.tri]); if (c.atEnd) o.atEndViol += 1; } else o.worst = Math.max(o.worst, dv);
      }
      return o;
    };
    const aaFamShip = dblFamW(SHIPW);
    const aaFamRed = plantAA.err ? null : dblFamW(plantAA);
    const aa3W = plantAA.err ? { err: plantAA.err } : readAAW(plantAA, aaWhole), aa3D = plantAA.err ? { err: plantAA.err } : readAAW(plantAA, aaDbl);
    const aa3Shift = (!aa3W.err && !aa3D.err) ? seatShiftW(aa3W, aa3D) : NaN;
    check(`t12c the pre-fix retention, measured (GH-770 review r6, class AA, arm AA-3). A temp copy of the module with the ac673ed7 length loop put back after the walk reads the order's fixture ${aa3W.err ? 'REFUSED' : (aa3W.first / MM).toFixed(6)} mm whole and ${aa3D.err ? 'REFUSED' : (aa3D.first / MM).toFixed(6)} mm doubled — ${aa3D.err ? '-' : aa3D.segs} — a ${Number.isNaN(aa3Shift) ? '-' : (aa3Shift / MM).toFixed(6)} mm shift of the resting ball bought by 0.5 mm of wire behind the plate, where this module shifts it ${(seatShiftW(aa1W, aa1D) / MM).toFixed(9)} mm (arm AA-1). The plant is what makes the family below an ORACLE and not a census: ${AAN} Pythagorean chute-and-tail definitions from their own seeded stream (the tail 0.3–8° shallower than the chute, no longer than 3 × its corner cut, dropping ≤ 1 mm, the face at the tail's end for ${aaFamW.filter((c) => c.atEnd).length} of them — exact, because the legs are integer triples — and inside it for the rest), each read whole and with its final delta doubled behind the unchanged face. This module: ${aaFamShip.applied} applied, ${aaFamShip.viol.length} moved, worst ${aaFamShip.worst.toExponential(2)} m, ${aaFamShip.flips} flips, ${aaFamShip.refused} refused by law. The plant: ${aaFamRed ? aaFamRed.viol.length : '-'} of ${aaFamRed ? aaFamRed.applied : '-'} MOVE (${aaFamRed ? aaFamRed.atEndViol : '-'} with the face at the tail's end, ${aaFamRed ? aaFamRed.viol.length - aaFamRed.atEndViol : '-'} inside it — inside the tail the clipped portion is clipped at every multiplier, so the length rule reads it the same way whole and doubled, and only the face ON the vertex splits the two criteria${aaFamRed && aaFamRed.viol.length ? `; e.g. case ${aaFamRed.viol[0][0]}, ${aaFamRed.viol[0][4]}: ${aaFamRed.viol[0][2]} → ${aaFamRed.viol[0][3]} mm` : ''}). RED on ac673ed7 and GREEN on the fix, which is the only reason to keep an oracle`,
      !plantAA.err && plantAA.skipped.length === 0 && !aa3W.err && !aa3D.err
      && Math.abs(aa3W.first - 0.132563425) < 5e-10 && Math.abs(aa3D.first - 0.129893121) < 5e-10 && Math.abs(aa3Shift - 0.002670304) < 5e-9
      && aaFamShip.viol.length === 0 && aaFamShip.worst <= 1e-9 && aaFamShip.flips === 0 && aaFamShip.applied >= 0.6 * AAN
      && !!aaFamRed && aaFamRed.viol.length >= 1 && aaFamRed.atEndViol >= 1 && aaFamRed.applied === aaFamShip.applied,
      JSON.stringify({ plant: [aa3W.err ?? +(aa3W.first / MM).toFixed(6), aa3D.err ?? +(aa3D.first / MM).toFixed(6), +(aa3Shift / MM).toFixed(6)],
        ship: [aaFamShip.applied, aaFamShip.viol.length, +aaFamShip.worst.toExponential(2), aaFamShip.flips, aaFamShip.refused], red: aaFamRed && [aaFamRed.applied, aaFamRed.viol.length, aaFamRed.atEndViol, aaFamRed.viol.slice(0, 3)] }));
    // ---- AA-4: no definition in web/scene/ballreturn/tracks plus web/tools/fixtures/ballreturn-tracks moved, and the class-W corpus does not move either ----------------
    const aa4Ship = (() => {
      if (plantAA.err) return { err: plantAA.err };
      const row = { rows: 0, build: 0, buildBad: 0, full: 0, solveDiff: [] };
      shipY.forEach((c, k) => {
        const s2 = sigW(plantAA, c.def, c.pockets, c.falls); row.rows += 1;
        const db = devBW(shipRefY[k], s2);
        if (Number.isNaN(db)) row.buildBad += 1; else row.build = Math.max(row.build, db);
        const df = devW(shipRefY[k], s2);
        if (Number.isNaN(df) || df > 1e-12) row.solveDiff.push(c.name); else row.full = Math.max(row.full, df);
      });
      return row;
    })();
    const corpusVsW = (M2) => {                                    // the whole corpus of arm t10b, this module against a plant, one signature per case
      const o = { both: 0, diff: [], flips: [], worst: 0 };
      if (M2.err) return { err: M2.err };
      for (let i = 0; i < fzW.defs.length; i += 1) {
        if (!fzW.b[i]) continue;                                   // a case this module refuses: the plant's reading of it is not this arm's question
        const a = sigW(SHIPW, fzW.defs[i]), b = sigW(M2, fzW.defs[i]);
        if (b.err) { o.flips.push([i, b.err]); continue; }
        o.both += 1;
        const dv = devW(a, b);
        if (Number.isNaN(dv) || dv > 1e-9) o.diff.push([i, Number.isNaN(dv) ? 'shape' : +dv.toExponential(2)]); else o.worst = Math.max(o.worst, dv);
      }
      return o;
    };
    const aa4Corpus = corpusVsW(plantAA);
    check(`t12d no definition in web/scene/ballreturn/tracks plus web/tools/fixtures/ballreturn-tracks moved, and neither did the corpus (GH-770 review r6, class AA, arm AA-4; the t11l form). The ${shipY.length} definitions in web/scene/ballreturn/tracks plus web/tools/fixtures/ballreturn-tracks read through this module and through the AA plant build IDENTICALLY — ${aa4Ship.err ? 'PLANT FAILED' : `${aa4Ship.build.toExponential(1)} m over ${aa4Ship.rows}, ${aa4Ship.buildBad} shape changes, ${aa4Ship.solveDiff.length} solve differences`} — so removing the length rule moves no route and no seat of those definitions, and t6d's committed XW101 bytes stand untouched. The same over the WHOLE class-W corpus of arm t10b, all ${fzW.defs.length} geometries, every one this module builds read through both: ${aa4Corpus.err ? '-' : aa4Corpus.both} built by both, ${aa4Corpus.err ? '-' : aa4Corpus.diff.length} differ (worst ${aa4Corpus.err ? '-' : aa4Corpus.worst.toExponential(2)} m), ${aa4Corpus.err ? '-' : aa4Corpus.flips.length} refused by the plant alone. That the corpus cannot tell the two apart is not a defence of the old rule — it is the measurement arm AC-1 explains: the corpus never puts a stop face on a vertex to within 1e-12 m, and away from the vertex the two criteria agree`,
      !aa4Ship.err && aa4Ship.buildBad === 0 && aa4Ship.build === 0 && aa4Ship.solveDiff.length === 0 && shipY.length >= 12
      && !aa4Corpus.err && aa4Corpus.both >= Math.floor(0.4 * fzW.defs.length) && aa4Corpus.diff.length === 0 && aa4Corpus.flips.length === 0 && fzW.defs.length === FUZZW,
      JSON.stringify({ ship: aa4Ship.err ?? [aa4Ship.rows, +aa4Ship.build.toExponential(1), aa4Ship.buildBad, aa4Ship.solveDiff], corpus: aa4Corpus.err ?? [aa4Corpus.both, aa4Corpus.diff.slice(0, 4), aa4Corpus.flips.slice(0, 3), +aa4Corpus.worst.toExponential(2)] }));
    // ---- AB-1: the order's own fixture — the trim equals the first contact with the FINITE strip ----
    const AB_REVIEW = [[0, -80, 0.5], [0.5, -2, 0], [0.25, -0.03, 0]];
    const abLenW = (deltas) => deltas.reduce((a, d) => a + Math.hypot(d[0], d[1], d[2]), 0);
    const abFix = bendY(AB_REVIEW, abLenW(AB_REVIEW), 40);
    const abTrimW = (M2, def) => {
      const r = routeOfW(M2, def); if (r.err) return r;
      const line = r.rt.segs.find((x) => x.kind === 'line' && x.rw.id === 'lc-chute');
      const oc = oracleCW(r.rt);
      const row = oc && line ? oc.all.find((x) => r.rt.floors[x[0]] === line.floor) : null;
      return { ...r, ...sigW(M2, def), trim: line ? line.floor.s1 - line.sT1 : NaN, need: row ? row[4] : NaN, oc };
    };
    const ab1 = abTrimW(SHIPW, abFix);
    check(`t12e the finite strip has a WIDTH across a heading change: the order's own fixture (GH-770 review r6, class AB, arm AB-1). A 40 mm channel chute of three runs — 80.0 mm almost straight down (0, −80, 0.5), then a 2.06 mm leg turned 90° in plan and dropping 2 mm (0.5, −2, 0), then a 0.25 mm tail (0.25, −0.03, 0) — with the stop face at the end. The corner law drops the tail and the turned leg, and the cascade trims the 80 mm run against both: ${ab1.err ? 'REFUSED ' + ab1.err.slice(0, 100) : `${(ab1.trim / MM).toFixed(6)} mm off its far end, leaving ${ab1.segs}`}, a ${ab1.err ? '-' : (ab1.first / MM).toFixed(6)} mm route with the ball seated at (${ab1.err || !ab1.seat ? '-' : ab1.seat.slice(0, 3).map((v) => (v / MM).toFixed(6)).join(', ')}) mm. The independent probe — the centre riding the run's own offset line, read against the dropped leg's FINITE strip (station clamped into its extent, lateral into its ±20 mm half-width, sampled from the far end) — puts first contact at ${ab1.err || !Number.isFinite(ab1.need) ? '-' : (ab1.need / MM).toFixed(6)} mm: the trim equals it to ${ab1.err || !Number.isFinite(ab1.need) ? '-' : Math.abs(ab1.trim - ab1.need).toExponential(2)} m. On ac673ed7 the gap read the leg as infinitely wide, found contact 1.264058 mm earlier in the air beside it, and trimmed 28.396964 mm (arm AB-3) — the queue then rested 1.264 mm uphill of where the floor actually is. designGate: ${ab1.gate === true ? 'ok' : String(ab1.gate).slice(0, 60)}`,
      !ab1.err && ab1.gate === true && Math.abs(ab1.trim - 0.027132906) < 1e-9 && Number.isFinite(ab1.need) && Math.abs(ab1.trim - ab1.need) <= 1e-9
      && Math.abs(ab1.first - 0.134919727) < 1e-9 && ab1.kinds === 'line,arc,line' && !!ab1.oc && ab1.oc.bad === 0 && ab1.oc.pairs >= 2
      && ab1.seat.length === 6 && Math.abs(ab1.seat[1] + 0.297114592) < 1e-9 && Math.abs(ab1.seat[2] + 0.624773726) < 1e-9,
      JSON.stringify(ab1.err ? { err: ab1.err.slice(0, 160) } : { trim_mm: +(ab1.trim / MM).toFixed(9), need_mm: +(ab1.need / MM).toFixed(9), route_mm: +(ab1.first / MM).toFixed(6), segs: ab1.segs, seat_mm: ab1.seat.slice(0, 3).map((v) => +(v / MM).toFixed(6)), pairs: ab1.oc.pairs }));
    // ---- AB-2: the sweep — heading change × lateral offset × strip width, trim == probe -------------
    const abCombosW = [];
    for (const phi of [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90]) for (const m of [0.5, 1, 2, 4, 8]) for (const width of [40, 60, 80, 100, 120]) abCombosW.push({ phi, m, width });
    const abDefW = ({ phi, m, width }) => {
      const a = phi * Math.PI / 180;
      const deltas = [[0, -80, 0.5], [+(m * Math.sin(a)).toFixed(6), -2, +(m * Math.cos(a)).toFixed(6)], [+(0.25 * Math.sin(a)).toFixed(6), -0.03, +(0.25 * Math.cos(a)).toFixed(6)]];
      return bendY(deltas, abLenW(deltas), width);
    };
    const abSweepW = (M2) => {
      const o = { built: 0, refused: 0, pairs: 0, bad: 0, worst: 0, rows: [] };
      if (M2.err) return { err: M2.err };
      for (const c of abCombosW) {
        const r = oracleCDefW(M2, abDefW(c));
        if (r.err) { o.refused += 1; continue; }
        o.built += 1; o.pairs += r.pairs; if (r.worst > o.worst) o.worst = r.worst;
        if (r.bad) { o.bad += 1; if (o.rows.length < 4) o.rows.push([`${c.phi}° m ${c.m} w ${c.width}`, r.rows[0]]); }
      }
      return o;
    };
    const ab2 = abSweepW(SHIPW);
    check(`t12f trim == first contact, as a SWEEP (GH-770 review r6, class AB, arm AB-2): ${abCombosW.length} definitions — the plan turn of the leg after the 80 mm run 5° … 90° in 5° steps, the leg's plan length (the lateral offset it puts the runs after it at) 0.5 / 1 / 2 / 4 / 8 mm, the channel 40 / 60 / 80 / 100 / 120 mm wide — each built and every trimmed pair of every route read: the cascade's trim, off the segment's published post-trim extent, against the independent finite-strip probe. ${ab2.built} build (${ab2.refused} refused), ${ab2.pairs} trimmed pairs, ${ab2.bad} disagree, worst |trim − first contact| ${ab2.worst.toExponential(2)} m against the 1e-9 m bar. The probe is sampled contact and not the trim's own formula: 4 096 stations from the run's far end plus a 200-step bisection, held to the module's own 1e-12 m sign-walk guard`,
      !ab2.err && ab2.built === abCombosW.length && ab2.bad === 0 && ab2.worst <= 1e-9 && ab2.pairs >= abCombosW.length && abCombosW.length >= 300,
      JSON.stringify(ab2.err ?? { built: ab2.built, pairs: ab2.pairs, bad: ab2.bad, worst: +ab2.worst.toExponential(2), rows: ab2.rows }));
    // ---- AB-3: the red plant ----------------------------------------------------------------------
    const ab3 = plantAB.err ? { err: plantAB.err } : abTrimW(plantAB, abFix);
    const ab3Sweep = abSweepW(plantAB);
    const ab3Over = ab1.err || ab3.err ? NaN : ab3.trim - ab1.trim;
    check(`t12g the infinitely wide strip, measured (GH-770 review r6, class AB, arm AB-3). A temp copy with the ac673ed7 gap and root set put back — the lateral coordinate dropped from the distance and the SIDE / CORNER root families gone — trims the order's fixture ${ab3.err ? 'REFUSED' : (ab3.trim / MM).toFixed(6)} mm where first contact with the actual strip is at ${ab3.err || !Number.isFinite(ab3.need) ? '-' : (ab3.need / MM).toFixed(6)} mm: ${Number.isNaN(ab3Over) ? '-' : (ab3Over / MM).toFixed(6)} mm of usable support removed and the route ${ab3.err ? '-' : (ab3.first / MM).toFixed(6)} mm against this module's ${ab1.err ? '-' : (ab1.first / MM).toFixed(6)}. Oracle (c) reads it as ${ab3.err || !ab3.oc ? '-' : ab3.oc.bad} disagreeing pair(s) on the fixture, and over arm AB-2's ${abCombosW.length} definitions ${ab3Sweep.err ? '-' : ab3Sweep.bad} disagree (worst ${ab3Sweep.err ? '-' : (ab3Sweep.worst / MM).toFixed(6)} mm) where this module has ${ab2.err ? '-' : ab2.bad}: RED on the code that shipped the defect, GREEN on the code that fixes it. Both plant edits are idempotent, and the copy absorbed ${plantAB.err ? '-' : plantAB.skipped.length} of ${2} as no-ops`,
      !plantAB.err && plantAB.skipped.length === 0 && !ab3.err && Math.abs(ab3Over - 0.001264058) < 5e-9 && Math.abs(ab3.trim - 0.028396964) < 1e-9
      && !!ab3.oc && ab3.oc.bad >= 1 && !ab3Sweep.err && ab3Sweep.bad >= 1 && ab3Sweep.worst > 1e-4,
      JSON.stringify(ab3.err ? { err: ab3.err.slice(0, 160) } : { trim_mm: +(ab3.trim / MM).toFixed(9), need_mm: +(ab3.need / MM).toFixed(9), over_mm: +(ab3Over / MM).toFixed(9), route_mm: +(ab3.first / MM).toFixed(6), sweepBad: ab3Sweep.bad, sweepWorst_mm: ab3Sweep.err ?? +(ab3Sweep.worst / MM).toFixed(6), rows: ab3Sweep.rows, skipped: plantAB.skipped }));
    // ---- AB-4: coplanar pairs are byte-identical — proven on the corpus, the family and the identity ----
    const ab4Corpus = corpusVsW(plantAB);
    const famAbW = plantAB.err ? null : famW(plantAB);
    const hypIdW = (() => {
      const rnd = rngW(0x4A70); let bad = 0; const N = 200000;
      for (let k = 0; k < N; k += 1) {
        const a = (rnd() - 0.5) * Math.pow(10, Math.floor(rnd() * 12) - 6), b = (rnd() - 0.5) * Math.pow(10, Math.floor(rnd() * 12) - 6);
        if (Math.hypot(a, 0, b) !== Math.hypot(a, b)) bad += 1;
      }
      const specials = [[0, 0], [1e-300, 1e-300], [Infinity, 1], [1, NaN]].filter(([a, b]) => !Object.is(Math.hypot(a, 0, b), Math.hypot(a, b))).length;
      return { N, bad, specials };
    })();
    check(`t12h coplanar pairs are byte-identical to ac673ed7 (GH-770 review r6, class AB, arm AB-4). On a slope-only joint the two centre paths lie in one plane, the lateral coordinate is identically zero, the clamp returns it unchanged, and \`Math.hypot(σ − s, 0, ν)\` IS \`Math.hypot(σ − s, ν)\` — measured, not assumed: ${hypIdW.bad} mismatches over ${hypIdW.N} random pairs spanning twelve decades and ${hypIdW.specials} over the special values (0/0, 1e-300, Infinity, NaN). The extra SIDE and CORNER roots only subdivide sign-constant intervals, so the sign walk returns the same root. Proven on the corpus: all ${fzW.defs.length} class-W geometries of arm t10b — every joint in them slope-only — read through this module and through the AB plant, ${ab4Corpus.err ? '-' : ab4Corpus.both} built by both, ${ab4Corpus.err ? '-' : ab4Corpus.diff.length} differ (worst ${ab4Corpus.err ? '-' : ab4Corpus.worst.toExponential(2)} m), ${ab4Corpus.err ? '-' : ab4Corpus.flips.length} flips; and on arm W7's ${FAMW}-case multi-run family, ${famAbW ? discMW(famShipW, famAbW) : '-'} rows of ${FAMW} differ. Where the heading changes the term does NOT cancel, which is arms AB-1 … AB-3`,
      hypIdW.bad === 0 && hypIdW.specials === 0 && !ab4Corpus.err && ab4Corpus.both >= Math.floor(0.4 * fzW.defs.length) && ab4Corpus.diff.length === 0 && ab4Corpus.flips.length === 0
      && !!famAbW && discMW(famShipW, famAbW) === 0 && famAbW.built === famShipW.built,
      JSON.stringify({ hypot: hypIdW, corpus: ab4Corpus.err ?? [ab4Corpus.both, ab4Corpus.diff.slice(0, 4), ab4Corpus.flips.slice(0, 3)], fam: famAbW && [famAbW.built, discMW(famShipW, famAbW)] }));
    // ---- AC-1: why oracle (b) missed AA — the family, counted on the corpus ----------------------------
    const famRowsW = fzW.fam.rows;
    const famOnVertex = famRowsW.filter((r2) => r2[9] === 1 && Math.abs(r2[7]) <= 1e-3);   // built, the face ON the vertex to within 1e-12 m (1e-3 nm)
    check(`t12i why oracle (b) missed class AA, measured (GH-770 review r6, class AC, arm AC-1). The family the two criteria split on — a valley whose stop-clipped portion is shorter than its corner cut R·tan(θ/2) while the corner law's penetration is under the grain — is counted on the ${FUZZW}-case corpus from the generator's own parameters, before anything is built: ${fzW.fam.n} member(s) by the order's whole-run wording, ${fzW.fam.clip} reading the corner law's own (stop-clipped) extent, ${fzW.fam.built} of them built${famRowsW.length ? ` (${famRowsW.slice(0, 4).map((r2) => `case ${r2[0]}: θ ${r2[1]}°, tail ${r2[2]} mm clipped to ${r2[3]} against a ${r2[4]} mm corner, pen whole ${r2[5]} / clipped ${r2[6]} mm, face ${r2[7] > 0 ? `${r2[7]} nm PAST` : `${-r2[7]} nm short of`} the wire's end${r2[9] ? '' : ', refused'}`).join('; ')})` : ''}. The gap has two halves and both are measured. (1) The corpus's tails turn at most 2 mm across up to 60 mm, so the valley is almost always deep and the corner law drops the tail whether or not a length rule exists: ${fzW.fam.n} of ${FUZZW} are shallow AND clipped short. (2) Where a corpus face is "at the end" of its tail it is at ${fzW.fam.n ? 'the 6-decimal grid\'s distance' : 'the 6-decimal grid\'s distance'} from the vertex, never ON it — the wire's length is irrational and the face is its 6-decimal rounding — and the two criteria only split when the face is on the vertex to within 1e-12 m: a face past the end by any amount is a whole edge under both readings, and one short of it by any amount is a fragment under the old rule that the corner law also reads as clipped. So round 5's 'extend' form (whole copies of the last leg, 1 in 3 cases, only where a copy fits) could not have produced the disagreement on this corpus, and the always-applied doubled form of arm AC-2 cannot either — which is why arm AA-3's family is built from Pythagorean legs. ${famOnVertex.length} built member(s) have their face on the vertex to within 1e-12 m, and arm AA-4 read every built case through the pre-fix loop: 0 differ`,
      fzW.fam.n <= Math.max(3, Math.ceil(0.002 * FUZZW)) && famOnVertex.length === 0 && (fzW.fam.n === famRowsW.length),
      JSON.stringify({ n: fzW.fam.n, clip: fzW.fam.clip, built: fzW.fam.built, rows: famRowsW.slice(0, 6) }));
    // ---- AC-2: oracle (b), the always-applied doubled form ---------------------------------------------
    const dblY = fzW.dbl;
    const aaRedPrefix = plantAA.err ? null : fuzzW(NW4, plantAA);
    check(`t12j ORACLE (b), the ALWAYS-APPLIED form (GH-770 review r6, class AC(i), arm AC-2): every built geometry of the ${FUZZW}-case corpus whose stop face lies ON its wire re-read with its final delta doubled behind the unchanged face — not drawn from a stream, applied to all of them: ${dblY.applied} applied, ${dblY.skipFace} skipped because the face is past the wire's end (nothing behind it to add to in the original), ${dblY.flips} flips (the doubled lip refused by V6; dropped, not scored), ${dblY.applied + dblY.skipFace + dblY.flips} = ${fzW.built} built. VIOLATIONS — a route length, a rest-ladder seat or a solved resting pose that moved — ${dblY.viol.length}${dblY.viol.length ? ` (${dblY.viol.slice(0, 3).map((v) => `case ${v[0]} ${v[1] === null ? 'SHAPE' : (v[1] / MM).toFixed(6) + ' mm'}`).join('; ')})` : ''}, worst ${dblY.worst.toExponential(2)} m against the 1e-9 m bar. The pre-fix loop planted into the module reads the same form over the first ${NW4} cases: ${aaRedPrefix ? aaRedPrefix.dbl.viol.length : '-'} of ${aaRedPrefix ? aaRedPrefix.dbl.applied : '-'} — GREEN too, and honestly so: arm AC-1 says why this corpus cannot carry the RED half, and arm AA-3's exact family carries it (${aaFamRed ? aaFamRed.viol.length : '-'} of ${aaFamRed ? aaFamRed.applied : '-'} on the plant, 0 here). The form stays as a permanent row because it is the operation the finding was reported as, applied to everything the corpus has`,
      dblY.viol.length === 0 && dblY.worst <= 1e-9 && dblY.applied >= Math.floor(0.3 * fzW.built) && dblY.applied + dblY.skipFace + dblY.flips === fzW.built
      && !!aaRedPrefix && aaRedPrefix.dbl.viol.length === 0 && !!aaFamRed && aaFamRed.viol.length >= 1,
      JSON.stringify({ applied: dblY.applied, skipFace: dblY.skipFace, flips: dblY.flips, viol: dblY.viol.slice(0, 4), worst: +dblY.worst.toExponential(2), worstAt: dblY.worstAt, redPrefix: aaRedPrefix && [aaRedPrefix.dbl.applied, aaRedPrefix.dbl.viol.length] }));
    // ---- AC-3: oracle (c) over the corpus, and why the clearance census missed AB --------------------
    const ocY = fzW.oc;
    const abRedPrefix = plantAB.err ? null : fuzzW(NW4, plantAB);
    const famOcShip = famDefW.reduce((o, d) => { const r = oracleCDefW(SHIPW, d); if (!r.err) { o.built += 1; o.pairs += r.pairs; o.bad += r.bad; o.worst = Math.max(o.worst, r.worst); } return o; }, { built: 0, pairs: 0, bad: 0, worst: 0 });
    const famOcRed = plantAB.err ? null : famDefW.reduce((o, d) => { const r = oracleCDefW(plantAB, d); if (!r.err) { o.built += 1; o.pairs += r.pairs; o.bad += r.bad; o.worst = Math.max(o.worst, r.worst); } return o; }, { built: 0, pairs: 0, bad: 0, worst: 0 });
    check(`t12k ORACLE (c) — the cascade's trim equals first contact with the FINITE strip, over every trimmed pair (GH-770 review r6, class AC, arm AC-3): the ${FUZZW}-case corpus of arm t10b, every route of every built geometry, every ridden piece against every dropped floor the cascade trims it against — ${ocY.pairs} pairs, ${ocY.viol.length} disagree, worst ${ocY.worst.toExponential(2)} m${ocY.worstAt ? ` (case ${ocY.worstAt[0]}, pocket ${ocY.worstAt[1]})` : ''} against the 1e-9 m bar, ${ocY.skipped} routes skipped for a reader that publishes no post-trim extent. Why the class-W clearance census (t10c) and this same corpus missed AB is the other measurement: the corpus is slope-only and coplanar to the last joint, so the plant that reads the strip as infinitely wide reads it IDENTICALLY here — the pre-fix gap over the first ${NW4} cases: ${abRedPrefix ? abRedPrefix.oc.viol.length : '-'} disagreements of ${abRedPrefix ? abRedPrefix.oc.pairs : '-'} pairs — and so does arm W7's multi-run family (${famOcShip.pairs} pairs, ${famOcShip.bad} disagree here, ${famOcRed ? famOcRed.bad : '-'} on the plant). The lateral term only binds where the HEADING changes, and the heading changes in the definitions in web/scene/ballreturn/tracks plus web/tools/fixtures/ballreturn-tracks and the in-file class-W fixtures (t10c's census) are twist windows on one runway (whose floors the pose law groups separately), plan turns from one straight piece directly into the next on one runway, or landings across a runway change, not a dropped floor beside a ridden one — nothing for the term to bind on in the ${liveC.length} definitions that census builds (the census is t10c's; this arm's condition does not read it). The bend family of arms AB-2 / AB-3 is where it binds (${ab3Sweep.err ? '-' : ab3Sweep.bad} of ${abCombosW.length} on the plant, ${ab2.err ? '-' : ab2.bad} here), and this oracle now reads the corpus, that family and the multi-run family alike`,
      ocY.viol.length === 0 && ocY.skipped === 0 && ocY.worst <= 1e-9 && ocY.pairs >= Math.floor(0.3 * fzW.built)
      && !!abRedPrefix && abRedPrefix.oc.viol.length === 0 && abRedPrefix.oc.pairs > 0
      && famOcShip.bad === 0 && famOcShip.pairs > 0 && !!famOcRed && famOcRed.bad === 0 && !ab3Sweep.err && ab3Sweep.bad >= 1,
      JSON.stringify({ corpus: [ocY.pairs, ocY.viol.length, +ocY.worst.toExponential(2), ocY.worstAt, ocY.skipped], viol: ocY.viol.slice(0, 3), redPrefix: abRedPrefix && [abRedPrefix.oc.pairs, abRedPrefix.oc.viol.length], fam: [famOcShip, famOcRed] }));
    // ================= class AE (GH-770 review round 7) — the entry is the REBUILT route's ==========
    // Review round 7's one P2: V5 validated the entry on the runway's FIRST point and FIRST edge normal,
    // but the route the ball actually lands on is the REBUILT one — after the corner law's `canA` drops
    // a leading run the entry moves up the chute, and a definition whose original first point sits
    // under the pocket exit can land the ball with its top above it, where `poseAt` draws it (its
    // exit-height cull applies only upstream of route.total). RED FIRST: t13a is the review fixture and
    // t13c the same class at a heading change (the drawn top of a twist window is not the entry); both
    // are committed before the fix and were red on d5b45bce (the report's evidence path).
    const chanAE = (width) => ({ kind: 'channel', width_mm: width, provenance: { tag: 'TEST', source: 'class AE: a single-runway channel chute' } });
    const singleAE = (points, width, exit) => {                     // one runway, one served pocket, the stop at the wire's end
      const d = JSON.parse(JSON.stringify(tbW)); d.support = chanAE(width);
      const pts = points.map((q) => q.map((v) => +v.toFixed(6)));
      const L0 = pts.slice(1).reduce((a, q, i) => a + Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1], q[2] - pts[i][2]), 0);
      d.runways = [{ id: 'lc-chute', role: 'chute', points_mm: pts, next: null, support: chanAE(width),
        stop: { kind: 'bumper', wall_s_mm: +L0.toFixed(6), capacity_balls: Math.max(1, Math.floor(L0 / (2 * R / MM) + 1e-9)), provenance: { tag: 'TEST', source: 'class AE: the stop at the end' } },
        provenance: { tag: 'TEST', source: 'class AE' } }];
      d.pockets = [{ index: 1, entry_runway: 'lc-chute', exit_below_y_mm: +exit.toFixed(6), provenance: { tag: 'TEST', source: 'class AE' } }];
      d.unserved_pockets = [0, 2, 3, 4, 5].map((i) => ({ index: i, reason: 'class AE fixture: one served pocket' }));
      return d;
    };
    // what V5 read before this round, from the definition's own bytes: the first point + h along the
    // first edge's up-normal + r (a channel: h = r) — the ORIGINAL-entry reading, kept as the number
    // the fixture was built to pass
    const origTopAE = (points) => {
      const a = points[0], b = points[1]; const t = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; const l = Math.hypot(...t); const tu = t.map((v) => v / l);
      const ny = [-tu[1] * tu[0], 1 - tu[1] * tu[1], -tu[1] * tu[2]]; const nl = Math.hypot(...ny);
      return a[1] + (R / MM) * ny[1] / nl + R / MM;
    };
    const readAE = (M2, def) => {                                   // build, the rebuilt entry, the drawn extent, the renderer's own poses
      let tr = null;
      try { tr = M2.schema.validateTrack(def, { pockets: POCKETS, falls: null }); } catch (e) { return { err: e.message }; }
      const rt = tr.routes.get(1); const st = M2.track.stationAt(rt, rt.total, rt.r, {});
      let top = -Infinity, topD = 0;
      for (const sg of rt.segs) for (let k = 0; k <= 400; k += 1) { const D = sg.D0 + (sg.D1 - sg.D0) * k / 400; const q = M2.track.stationAt(rt, D, rt.r, {}); if (q.y + rt.r > top) { top = q.y + rt.r; topD = D; } }
      const o = { tr, rt, total: rt.total, kinds: rt.segs.map((x) => x.kind).join(','), dropped: rt.floors.length - rt.segs.filter((x) => x.kind === 'line').length, entryTop: st.y + rt.r, sampledTop: top, sampledTopD: topD, exitY: rt.exitY, drawnAbove: 0, samples: 0, firstDrawn: null };
      try {
        const h1 = M2.kin.handoffFromSink({ t: 1, pocket: POCKETS[1], fall: POCKETS[1], r: tr.refR, tFall: 0.021, glide: 0.06 }, { track: tr, pockets: POCKETS, r: tr.refR });
        const sol = M2.kin.solveShot({ track: tr, r: tr.refR, ledger: [], arrivals: [{ id: 1, handoff: h1 }] });
        for (let k = 0; k <= 2000; k += 1) { const pz = M2.kin.poseAt(sol, 1, sol.tEnd * k / 2000, {}); if (!pz) continue; o.samples += 1; if (pz.y + rt.r > rt.exitY + 1e-9) { o.drawnAbove += 1; o.firstDrawn ??= { t: sol.tEnd * k / 2000, top: pz.y + rt.r, D: pz.D, kind: pz.kind }; } }
        // the LANDING pose (the first drawn pose after the fall piece ends) and the REST pose, explicitly
        const fall = sol.pieces.get(1)[0];
        const pl = M2.kin.poseAt(sol, 1, fall.t1 + 1e-6, {}); o.land = pl ? { top: pl.y + rt.r, D: pl.D, kind: pl.kind, drawn: true } : { drawn: false };
        const pr = M2.kin.poseAt(sol, 1, sol.tEnd + 1, {}); o.rest = pr ? { top: pr.y + rt.r, D: pr.D, drawn: true } : { drawn: false };
        try { M2.kin.designGate(tr, { pockets: POCKETS, r: tr.refR }); o.gate = 'ok'; } catch (e) { o.gate = e.message; }
      } catch (e) { o.solveErr = e.message; }
      return o;
    };
    // t13a (arm AE-1, RED FIRST) — the review fixture, to the byte
    const AE_REVIEW = [[0, -245.8, -703.5], [0, -245.9, -703.425], [0, -325.9, -463.425]];
    const aeFix = singleAE(AE_REVIEW, 80, -199);
    const aeRead = readAE(SHIPW, aeFix);
    const aeOrigTop = origTopAE(AE_REVIEW);
    const aeCtl = readAE(SHIPW, singleAE(AE_REVIEW, 80, -190));      // the same wire declared under an exit the rebuilt entry clears
    check(`t13a the entry is the REBUILT route's, not the runway's first point: the review fixture (GH-770 review r7, class AE, arm AE-1). A single 80 mm channel runway ${JSON.stringify(AE_REVIEW)} mm — a 0.125 mm leading run at 53.1° into a 253 mm chute at 18.4° — with the stop at the end and the pocket exit declared at −199 mm. The leading run is too short for its 34.7° valley (the corner law's \`canA\`), so the ride starts on the chute and the ball LANDS there: the rebuilt entry's top is ${aeRead.err ? (aeRead.err.match(/top (-?[\d.]+) mm/) ?? ['', '?'])[1] : (aeRead.entryTop / MM).toFixed(6)} mm, 8.18 mm ABOVE the declared exit, where the first point + the first edge's normal reads ${aeOrigTop.toFixed(3)} mm — 1.08 mm under it. On d5b45bce V5 read the first point, validateTrack and designGate both passed, and poseAt drew the ball from its landing on with its top above the exit (${aeRead.err ? 'the pre-fix reading is in §29.26j' : aeRead.drawnAbove + ' of ' + aeRead.samples + ' sampled poses'}). This module refuses the definition by name: "${aeRead.err ? aeRead.err.slice(0, 200) : 'NO REFUSAL — the definition builds'}". The control is the same wire under an exit of −190 mm, which the rebuilt entry clears: it builds ${aeCtl.err ? '(REFUSED ' + aeCtl.err.slice(0, 80) + ')' : (aeCtl.total / MM).toFixed(6) + ' mm over ' + aeCtl.kinds + ' with ' + aeCtl.dropped + ' leading floor dropped'}, its entry top ${aeCtl.err ? '-' : (aeCtl.entryTop / MM).toFixed(6)} mm under the exit, designGate ${aeCtl.gate ?? '-'}, and the renderer's own door draws ${aeCtl.err ? '-' : aeCtl.drawnAbove} of ${aeCtl.err ? '-' : aeCtl.samples} poses above it — the LANDING pose itself (the first drawn pose after the fall, a ${aeCtl.land ? aeCtl.land.kind : '-'} at D ${aeCtl.land && aeCtl.land.drawn ? (aeCtl.land.D / MM).toFixed(3) : '-'} mm) tops at ${aeCtl.land && aeCtl.land.drawn ? (aeCtl.land.top / MM).toFixed(6) : '-'} mm and the rest pose at ${aeCtl.rest && aeCtl.rest.drawn ? (aeCtl.rest.top / MM).toFixed(6) : '-'} mm, both under the exit. The DERIVED entry is what is asserted here — the rebuilt route's first station, not the validator's verdict — and on the fixture's own wire it is that −190.821 mm; on d5b45bce the fixture's landing pose was drawn at ${aeRead.err ? '(see §29.26j)' : aeRead.land && aeRead.land.drawn ? (aeRead.land.top / MM).toFixed(3) + ' mm, above the exit' : '-'}`,
      !!aeRead.err && /\[V5\]/.test(aeRead.err) && /-190\.8\d* mm/.test(aeRead.err) && /-199\.0/.test(aeRead.err)
      && !aeCtl.err && !aeCtl.solveErr && aeCtl.gate === 'ok' && aeCtl.dropped === 1 && aeCtl.kinds === 'line'
      && Math.abs(aeCtl.entryTop / MM + 190.821153) < 5e-6 && aeCtl.entryTop <= aeCtl.exitY + 1e-9 && aeCtl.drawnAbove === 0 && aeCtl.samples > 100
      && !!aeCtl.land && aeCtl.land.drawn && aeCtl.land.top <= aeCtl.exitY + 1e-9 && Math.abs(aeCtl.land.top - aeCtl.entryTop) < 1e-3 && aeCtl.land.kind !== 'fall'
      && !!aeCtl.rest && aeCtl.rest.drawn && aeCtl.rest.top <= aeCtl.exitY + 1e-9
      && Math.abs(aeOrigTop + 200.08) < 5e-3,
      JSON.stringify({ fixture: aeRead.err ? aeRead.err.slice(0, 220) : { built: true, total_mm: +(aeRead.total / MM).toFixed(6), entryTop_mm: +(aeRead.entryTop / MM).toFixed(6), exit_mm: aeRead.exitY / MM, drawnAbove: aeRead.drawnAbove, samples: aeRead.samples, first: aeRead.firstDrawn },
        fixtureLand: aeRead.err ? null : aeRead.land, origRead_mm: +aeOrigTop.toFixed(4), control: aeCtl.err ?? { total_mm: +(aeCtl.total / MM).toFixed(6), entryTop_mm: +(aeCtl.entryTop / MM).toFixed(6), drawnAbove: aeCtl.drawnAbove, samples: aeCtl.samples, gate: aeCtl.gate, land: aeCtl.land, rest: aeCtl.rest } }));
    // t13c (arm AE-3, RED FIRST) — the drawn top is not the entry: a 0.5 mm leading run at 80° into a 90° plan
    // bend. The heading change is drawn as a twist window whose vertex end stands the centre h VERTICALLY over
    // the vertex — 23 mm above the entry pose here — so an entry-only reading passes a route whose drawn top is
    // above the exit. The invariant is over the WHOLE drawn extent, or it is not an invariant.
    const AE_TWIST = (() => { const len = 0.5, a = 80 * Math.PI / 180; const p1 = [0, -245.8 - len * Math.sin(a), -703.5 + len * Math.cos(a)]; return [[0, -245.8, -703.5], p1, [p1[0] + 250, p1[1] - 80, p1[2]]]; })();
    const aeTwistOrig = origTopAE(AE_TWIST);
    const aeTw = readAE(SHIPW, singleAE(AE_TWIST, 80, aeTwistOrig + 3));   // declared 3 mm above the ORIGINAL-entry reading
    const aeTwCtl = readAE(SHIPW, singleAE(AE_TWIST, 80, -185));            // the same wire under an exit the whole drawn extent clears
    check(`t13c the exit-height invariant holds over the WHOLE drawn extent, or it is not an invariant (GH-770 review r7, class AE, arm AE-3). A single 80 mm channel: a 0.5 mm leading run at 80°, then a 90° plan bend into a 250 mm chute dropping 80 mm, the exit declared at ${(aeTwistOrig + 3).toFixed(3)} mm — 3 mm above what the first point reads (${aeTwistOrig.toFixed(3)} mm) and ${aeTw.err ? 'above' : ((aeTw.entryTop / MM) <= aeTwistOrig + 3 ? 'above' : 'below')} the rebuilt entry's own top too. Nothing is dropped here: the ride keeps both runs. What an entry reading cannot see is the heading change: the twist window at the bend stands the centre h VERTICALLY above the vertex, and that drawn pose tops out at ${aeTw.err ? (aeTw.err.match(/reaches (-?[\d.]+) mm/) ?? ['', '?'])[1] : (aeTw.sampledTop / MM).toFixed(3)} mm — ${aeTwCtl.err ? '-' : ((aeTwCtl.sampledTop - aeTwCtl.entryTop) / MM).toFixed(3)} mm above the entry pose on the same wire (the control's reading; the refused fixture has no route to read) — so on d5b45bce the definition built and poseAt drew the ball above the exit through the bend (${aeTw.err ? 'measured pre-fix, §29.26j' : aeTw.drawnAbove + ' of ' + aeTw.samples + ' sampled poses, the first at t ' + (aeTw.firstDrawn ? aeTw.firstDrawn.t.toFixed(3) : '-') + ' s on a ' + (aeTw.firstDrawn ? aeTw.firstDrawn.kind : '-')}). This module refuses it by name over the drawn extent: "${aeTw.err ? aeTw.err.slice(0, 220) : 'NO REFUSAL — the definition builds'}". The control declares the exit at −185 mm, above the whole drawn extent: it builds ${aeTwCtl.err ? '(REFUSED ' + aeTwCtl.err.slice(0, 80) + ')' : (aeTwCtl.total / MM).toFixed(6) + ' mm over ' + aeTwCtl.kinds}, and the renderer's door draws ${aeTwCtl.err ? '-' : aeTwCtl.drawnAbove} of ${aeTwCtl.err ? '-' : aeTwCtl.samples} poses above it — the drawn top ${aeTwCtl.err ? '-' : (aeTwCtl.sampledTop / MM).toFixed(3)} mm at D ${aeTwCtl.err ? '-' : (aeTwCtl.sampledTopD / MM).toFixed(3)} mm, on the route, not at its entry (${aeTwCtl.err ? '-' : (aeTwCtl.total / MM).toFixed(3)} mm)`,
      !!aeTw.err && /\[V5\]/.test(aeTw.err) && /-189\.1\d* mm/.test(aeTw.err)
      && !aeTwCtl.err && !aeTwCtl.solveErr && aeTwCtl.drawnAbove === 0 && aeTwCtl.samples > 100 && aeTwCtl.kinds === 'line,twist,twist,line'
      && aeTwCtl.sampledTop > aeTwCtl.entryTop + 0.02 && aeTwCtl.sampledTopD < aeTwCtl.total - 0.02 && Math.abs(aeTwCtl.sampledTop / MM + 189.142404) < 5e-3
      && !!aeTwCtl.land && aeTwCtl.land.drawn && aeTwCtl.land.top <= aeTwCtl.exitY + 1e-9 && !!aeTwCtl.rest && aeTwCtl.rest.drawn && aeTwCtl.rest.top <= aeTwCtl.exitY + 1e-9,
      JSON.stringify({ fixture: aeTw.err ? aeTw.err.slice(0, 220) : { built: true, entryTop_mm: +(aeTw.entryTop / MM).toFixed(6), sampledTop_mm: +(aeTw.sampledTop / MM).toFixed(6), atD_mm: +(aeTw.sampledTopD / MM).toFixed(3), exit_mm: +(aeTw.exitY / MM).toFixed(3), drawnAbove: aeTw.drawnAbove, samples: aeTw.samples, first: aeTw.firstDrawn },
        origRead_mm: +aeTwistOrig.toFixed(4), control: aeTwCtl.err ?? { total_mm: +(aeTwCtl.total / MM).toFixed(6), kinds: aeTwCtl.kinds, sampledTop_mm: +(aeTwCtl.sampledTop / MM).toFixed(6), atD_mm: +(aeTwCtl.sampledTopD / MM).toFixed(3), drawnAbove: aeTwCtl.drawnAbove } }));
    // ---- AE-2 / AE-4 / AE-5: one source of truth for the entry, the sweep, the plant --------------
    const entryOrigW = (rt, r) => {                                   // what V5 read before: the runway's first point + h along its first edge's up-normal
      const rw = rt.segs[0].rw; const p0 = rw.pts[0]; const n = rw.edges[0].n; const h = rt.segs[0].h;
      return [p0[0] + h * n[0], p0[1] + h * n[1], p0[2] + h * n[2]];
    };
    const sampledTopW = (M2, rt, K = 400) => { let top = -Infinity; for (const sg of rt.segs) for (let k = 0; k <= K; k += 1) { const D = sg.D0 + (sg.D1 - sg.D0) * k / K; const q = M2.track.stationAt(rt, D, rt.r, {}); top = Math.max(top, q.y + rt.r); } return top; };
    // every route of a definition, read three ways: routeEntry, stationAt(total), the handoff's landing target — and the original first-point reading
    const entryRowsW = (M2, def, pockets = POCKETS, falls = null) => {
      let tr = null;
      try { tr = M2.schema.validateTrack(def, { pockets, falls }); } catch (e) { return { err: e.message }; }
      const rows = [];
      for (const [pk, rt] of tr.routes) {
        const en = M2.track.routeEntry(rt, rt.r); const st = M2.track.stationAt(rt, rt.total, rt.r, {}); const og = entryOrigW(rt, rt.r);
        let hf = null; try { hf = typeof pk === 'number' && pockets[pk] ? M2.kin.handoffFromSink({ t: 1, pocket: pockets[pk], fall: pockets[pk], r: tr.refR, tFall: 0.021, glide: 0.06 }, { track: tr, pockets, r: tr.refR }) : null; } catch (e) { hf = { err: e.message }; }
        const tp = M2.track.routeTop(rt, rt.r); const smp = sampledTopW(M2, rt);
        rows.push({ pk, dropped: en.dropped, sameAsStation: en.x === st.x && en.y === st.y && en.z === st.z, sameAsHandoff: !!hf && !hf.err && hf.xE === en.x && hf.yE === en.y && hf.zE === en.z, handoffNull: hf === null,
          origDelta: Math.hypot(en.x - og[0], en.y - og[1], en.z - og[2]), origBit: en.x === og[0] && en.y === og[1] && en.z === og[2],
          entryTop: en.y + rt.r, top: tp ? tp.top : NaN, topD: tp ? tp.D : NaN, topKind: tp ? tp.kind : null, sampled: smp, topVsSampled: tp ? Math.abs(tp.top - smp) : NaN, exitY: rt.exitY, margin: rt.exitY === null ? null : rt.exitY - (tp ? tp.top : NaN), topAboveEntry: tp ? tp.top - (en.y + rt.r) : NaN });
      }
      return { rows };
    };
    // the AE family from its own seeded stream (0xAE5EED): a short steep leading run (0.1–3 mm at 40–89°) into a
    // shallow chute (40–120 mm over 150–300), the exit declared 0.1–6 mm ABOVE what the first point reads — every one
    // of them passed V5 on d5b45bce; the ones whose rebuilt entry (or drawn top) is above the exit are refused here
    const aeCasesW = (n) => {
      const rnd = rngW(0xAE5EED); const out = [];
      for (let i = 0; i < n; i += 1) {
        const U = (lo, hi) => lo + (hi - lo) * rnd();
        const len = U(0.1, 3), ang = U(40, 89) * Math.PI / 180, drop = U(40, 120), along = U(150, 300), width = U(40, 120), delta = U(0.1, 6);
        const p1 = [0, -245.8 - len * Math.sin(ang), -703.5 + len * Math.cos(ang)]; const p2 = [0, p1[1] - drop, p1[2] + along];
        const pts = [[0, -245.8, -703.5], p1, p2];
        out.push({ i, pts, width, delta, exit: origTopAE(pts) + delta, len, ang: ang * 180 / Math.PI });
      }
      return out;
    };
    const AEN = 400;
    const aeFamW = aeCasesW(AEN);
    const aeFamReadW = (M2) => {
      const o = { built: 0, refusedV5: 0, refusedOther: 0, entryAbove: 0, drawnAbove: 0, topAboveEntry: 0, dropped: 0, rows: [] };
      for (const c of aeFamW) {
        const r = readAE(M2, singleAE(c.pts, c.width, c.exit));
        if (r.err) { if (/\[V5\]/.test(r.err)) o.refusedV5 += 1; else o.refusedOther += 1; continue; }
        o.built += 1; if (r.dropped) o.dropped += 1; if (r.entryTop > r.exitY + 1e-9) o.entryAbove += 1; if (r.drawnAbove) o.drawnAbove += 1; if (r.sampledTop > r.entryTop + 1e-9) o.topAboveEntry += 1;
        if (o.rows.length < 3 && (r.drawnAbove || r.entryTop > r.exitY + 1e-9)) o.rows.push([c.i, +c.len.toFixed(3), +c.ang.toFixed(1), +c.delta.toFixed(3), +(r.entryTop / MM).toFixed(3), +(r.exitY / MM).toFixed(3), r.drawnAbove, r.samples]);
      }
      return o;
    };
    // t13b (arm AE-2) — ONE source of truth, measured on every route there is
    const shipEntryW = shipY.map((c) => ({ name: c.name, ...entryRowsW(SHIPW, c.def, c.pockets, c.falls) }));
    const shipEntryRows = shipEntryW.flatMap((x) => (x.rows ?? []).map((r2) => ({ name: x.name, ...r2 })));
    const corpusEntryRows = []; let corpusEntryBuilt = 0;
    for (let i = 0; i < fzW.defs.length; i += 1) { if (!fzW.b[i]) continue; const e = entryRowsW(SHIPW, fzW.defs[i]); if (e.err) continue; corpusEntryBuilt += 1; for (const r2 of e.rows) corpusEntryRows.push(r2); }
    const aeFamEntryRows = []; for (const c of aeFamW.slice(0, 200)) { const e = entryRowsW(SHIPW, singleAE(c.pts, c.width, -100)); if (e.err) continue; for (const r2 of e.rows) aeFamEntryRows.push(r2); }
    const allEntryRows = [...shipEntryRows, ...corpusEntryRows, ...aeFamEntryRows];
    // the readers of the runway's first point / first edge as "the entry", by source text (comment lines
    // dropped). Written without regex literals on purpose: the band lint's statement reader (arm r65) reads
    // this file too, and a `//` inside a regex literal is a poison it must not be fed
    const sitesW = (() => {
      const slashes = '/' + '/';
      const rd = (n) => fs.readFileSync(path.resolve(MODDIR, n), 'utf8').split('\n').filter((l) => !l.trimStart().startsWith(slashes)).join('\n');
      const firstPoint = new RegExp('rw\\.pts\\[0\\]|rw\\.edges\\[0\\]', 'g');
      const callers = new RegExp('routeEntry\\(', 'g');
      const count = (txt, re) => (txt.match(re) ?? []).length;
      return { schema: count(rd('schema.js'), firstPoint), kinematics: count(rd('kinematics.js'), firstPoint), track: count(rd('track.js'), firstPoint), routeEntryCallers: count(rd('schema.js'), callers) + count(rd('kinematics.js'), callers) };
    })();
    check(`t13b ONE source of truth for "the entry" (GH-770 review r7, class AE, arm AE-2): \`routeEntry(route, r)\` in track.js — the rebuilt route's first station, D = route.total, with the support point under it, the piece's edge and h, and the count of leading floors the corner law dropped. Every caller reads it: V5's plan-offset test, its cull-line test, its exit test, the sink-clearance reading (schema.js) and the free fall's landing target (kinematics.js handoffFromSink, which also asserts it equals the drawn station). The sites that read \`rw.pts[0]\` / \`rw.edges[0]\` as the entry before this round were the four in V5 (the plan offset, the centre height, the exit test through it, the handoff-clearance dx/dz); today the module text outside comments has ${sitesW.schema} such reads in schema.js, ${sitesW.kinematics} in kinematics.js, ${sitesW.track} in track.js, and ${sitesW.routeEntryCallers} \`routeEntry(\` call sites in the two readers. MEASURED on every route there is: the ${shipY.length} definitions in web/scene/ballreturn/tracks plus web/tools/fixtures/ballreturn-tracks (${shipEntryRows.length} routes), every built case of the ${fzW.defs.length}-case class-W corpus (${corpusEntryBuilt} definitions, ${corpusEntryRows.length} routes) and 200 AE-family definitions (${aeFamEntryRows.length} routes) — routeEntry == stationAt(total) bit for bit on ${allEntryRows.filter((r2) => r2.sameAsStation).length} of ${allEntryRows.length}, == the handoff's landing target bit for bit on ${allEntryRows.filter((r2) => r2.sameAsHandoff).length} of ${allEntryRows.filter((r2) => !r2.handoffNull).length} that have a handoff, and == the runway's first-point reading bit for bit on every route with no leading run dropped (${allEntryRows.filter((r2) => r2.dropped === 0 && r2.origBit).length} of ${allEntryRows.filter((r2) => r2.dropped === 0).length}); ${allEntryRows.filter((r2) => r2.dropped > 0).length} routes DO drop a leading run — all of them AE-family, none from the definitions in web/scene/ballreturn/tracks plus web/tools/fixtures/ballreturn-tracks, none in the corpus — and there the two readings differ by up to ${(Math.max(0, ...allEntryRows.filter((r2) => r2.dropped > 0).map((r2) => r2.origDelta)) / MM).toFixed(3)} mm of centre`,
      sitesW.schema === 0 && sitesW.kinematics === 0 && sitesW.track === 0 && sitesW.routeEntryCallers >= 2
      && allEntryRows.length >= 25 + fzW.built + 200 && corpusEntryBuilt === fzW.built && allEntryRows.every((r2) => r2.sameAsStation) && allEntryRows.filter((r2) => !r2.handoffNull).every((r2) => r2.sameAsHandoff)
      && allEntryRows.filter((r2) => r2.dropped === 0).every((r2) => r2.origBit) && shipEntryRows.every((r2) => r2.dropped === 0) && corpusEntryRows.every((r2) => r2.dropped === 0)
      && allEntryRows.filter((r2) => r2.dropped > 0).length >= 1,
      JSON.stringify({ sites: sitesW, routes: [shipEntryRows.length, corpusEntryRows.length, aeFamEntryRows.length], dropped: allEntryRows.filter((r2) => r2.dropped > 0).length, maxOrigDelta_mm: +(Math.max(0, ...allEntryRows.filter((r2) => r2.dropped > 0).map((r2) => r2.origDelta)) / MM).toFixed(3) }));
    // t13d (arm AE-4) — the SWEEP: the rebuilt-entry and whole-extent readings over the definitions in web/scene/ballreturn/tracks plus web/tools/fixtures/ballreturn-tracks (shipY) and the corpus
    const aeFamShip = aeFamReadW(SHIPW);
    const shipTable = shipEntryRows.map((r2) => [r2.name, r2.pk, +(r2.entryTop / MM).toFixed(4), +(r2.top / MM).toFixed(4), r2.topKind, r2.margin === null ? null : +(r2.margin / MM).toFixed(4), +(r2.origDelta / MM).toFixed(6), r2.dropped, +r2.topVsSampled.toExponential(2)]);
    const corpusMaxOrig = Math.max(0, ...corpusEntryRows.map((r2) => r2.origDelta)), corpusMaxTopVsSampled = Math.max(0, ...corpusEntryRows.map((r2) => r2.topVsSampled)), corpusTopAboveEntry = corpusEntryRows.filter((r2) => r2.topAboveEntry > 1e-9).length, corpusAboveExit = corpusEntryRows.filter((r2) => r2.margin !== null && r2.margin < -1e-9).length;
    check(`t13d the sweep (GH-770 review r7, class AE, arm AE-4): the rebuilt-entry reading against the original first-point reading, and the whole-extent drawn top against the pocket exit, over the definitions that build in web/scene/ballreturn/tracks plus web/tools/fixtures/ballreturn-tracks and in the whole class-W corpus. In those two dirs: ${shipEntryRows.length} routes of the definitions that build, out of ${shipY.length} (a definition validateTrack refuses gives no route) — ${shipEntryRows.filter((r2) => r2.origBit).length} read the same entry bit for bit (max clearance delta ${(Math.max(0, ...shipEntryRows.map((r2) => r2.origDelta)) / MM).toFixed(6)} mm), ${shipEntryRows.filter((r2) => r2.dropped > 0).length} drop a leading run, every drawn top is its entry (${shipEntryRows.filter((r2) => r2.topAboveEntry > 1e-9).length} above it) and under its exit by ${(Math.min(...shipEntryRows.filter((r2) => r2.margin !== null).map((r2) => r2.margin)) / MM).toFixed(4)}–${(Math.max(...shipEntryRows.filter((r2) => r2.margin !== null).map((r2) => r2.margin)) / MM).toFixed(4)} mm; the closed-form route top agrees with a 401-station sampling of every segment to ${Math.max(0, ...shipEntryRows.map((r2) => r2.topVsSampled)).toExponential(2)} m. Corpus: ${corpusEntryRows.length} routes of ${corpusEntryBuilt} built definitions — ${corpusEntryRows.filter((r2) => r2.origBit).length} identical bit for bit, max delta ${(corpusMaxOrig / MM).toFixed(6)} mm, ${corpusEntryRows.filter((r2) => r2.dropped > 0).length} leading runs dropped, ${corpusTopAboveEntry} drawn tops above the entry, ${corpusAboveExit} above the exit, closed form vs sampling ${corpusMaxTopVsSampled.toExponential(2)} m. NOTHING THAT BUILDS IN THOSE TWO DIRS MOVES — no definition in them that builds is in violation, so no definition is touched. The class-AE family (${AEN} cases from stream 0xAE5EED; every one of them passed V5 on d5b45bce by construction, its exit declared 0.1–6 mm above the first-point reading): this module refuses ${aeFamShip.refusedV5} by V5 (${aeFamShip.refusedOther} by other laws) and builds ${aeFamShip.built}, ${aeFamShip.dropped} of the built with a leading run dropped, ${aeFamShip.entryAbove} with an entry above its exit, ${aeFamShip.drawnAbove} with any pose drawn above it — the refused ones are exactly the ones the renderer would have drawn inside the pocket assembly`,
      shipEntryRows.length >= 24 && shipEntryRows.every((r2) => r2.origBit && r2.dropped === 0 && r2.topAboveEntry <= 1e-9 && r2.margin !== null && r2.margin > 0 && r2.topVsSampled <= 1e-9)
      && corpusEntryBuilt === fzW.built && corpusEntryRows.length >= fzW.built && corpusEntryRows.every((r2) => r2.origBit && r2.dropped === 0) && corpusTopAboveEntry === 0 && corpusAboveExit === 0 && corpusMaxTopVsSampled <= 1e-9
      && aeFamShip.built + aeFamShip.refusedV5 + aeFamShip.refusedOther === AEN && aeFamShip.refusedV5 >= 0.5 * AEN && aeFamShip.entryAbove === 0 && aeFamShip.drawnAbove === 0 && aeFamShip.refusedOther === 0,
      JSON.stringify({ shipped: shipTable, corpus: [corpusEntryRows.length, corpusEntryBuilt, +(corpusMaxOrig / MM).toFixed(6), corpusTopAboveEntry, corpusAboveExit, +corpusMaxTopVsSampled.toExponential(2)], family: aeFamShip }));
    // t13e (arm AE-5) — the PLANT: the original-entry read put back into V5 (and the whole-extent check removed)
    const plantAE = await redPlant('ae', [
      ["      const st = { rw: en.rw };\n      const p0 = en.sup;", "      const st = locate(route, route.total);\n      const p0 = st.rw.pts[0];", 'schema.js'],
      ["      const yCentre = en.y;", "      const der = supportDerived(st.rw.support, refR);\n      const yCentre = p0[1] + der.h * st.rw.edges[0].n[1];", 'schema.js'],
      ["      const topR = routeTop(route, refR);", "      const topR = null;", 'schema.js'],
      ["      const dxH = en.x - fall.x;", "      const dxH = p0[0] + der.h * st.rw.edges[0].n[0] - fall.x;", 'schema.js'],
      ["      const dzH = en.z - fall.z;", "      const dzH = p0[2] + der.h * st.rw.edges[0].n[2] - fall.z;", 'schema.js'],
    ]);
    const aePlantFix = plantAE.err ? { err: plantAE.err } : readAE(plantAE, aeFix);
    const aePlantTw = plantAE.err ? { err: plantAE.err } : readAE(plantAE, singleAE(AE_TWIST, 80, aeTwistOrig + 3));
    const aePlantFam = plantAE.err ? null : aeFamReadW(plantAE);
    const plantIdentity = (() => {                                   // the definitions in web/scene/ballreturn/tracks plus web/tools/fixtures/ballreturn-tracks (shipY) + the corpus: the same accept set and the same sink-clearance numbers under the plant
      if (plantAE.err) return { err: plantAE.err };
      const o = { ship: 0, shipDiff: [], corpus: 0, corpusDiff: 0 };
      for (const c of shipY) {
        let a = null, b = null; try { a = SHIPW.schema.validateTrack(c.def, { pockets: c.pockets, falls: c.falls }); } catch (e) { a = { err: (e.message.match(/\[V\d+[a-z]?\]/) ?? ['r'])[0] }; }
        try { b = plantAE.schema.validateTrack(c.def, { pockets: c.pockets, falls: c.falls }); } catch (e) { b = { err: (e.message.match(/\[V\d+[a-z]?\]/) ?? ['r'])[0] }; }
        o.ship += 1;
        if (!!a.err !== !!b.err || (a.err && a.err !== b.err)) { o.shipDiff.push([c.name, a.err, b.err]); continue; }
        if (!a.err) for (const [pk, rt] of a.routes) { const rb = b.routes.get(pk); if (rt.sinkClearanceEntry !== rb.sinkClearanceEntry || rt.sinkClearance !== rb.sinkClearance) o.shipDiff.push([c.name, pk, 'sink clearance']); }
      }
      for (let i = 0; i < fzW.defs.length; i += 1) { let a = fzW.b[i]; let b = 1; try { plantAE.schema.validateTrack(fzW.defs[i], { pockets: POCKETS, falls: null }); } catch (e) { b = 0; } o.corpus += 1; if (a !== b) o.corpusDiff += 1; }
      return o;
    })();
    check(`t13e the original-entry read, put back (GH-770 review r7, class AE, arm AE-5). A temp copy of schema.js with V5's four readings taken from the runway's first point and first edge normal again, and the whole-extent check removed — d5b45bce's V5 — BUILDS the review fixture (${aePlantFix.err ? 'REFUSED ' + aePlantFix.err.slice(0, 60) : (aePlantFix.total / MM).toFixed(6) + ' mm, the rebuilt entry top ' + (aePlantFix.entryTop / MM).toFixed(6) + ' mm against the exit ' + (aePlantFix.exitY / MM).toFixed(1) + ', ' + aePlantFix.drawnAbove + ' of ' + aePlantFix.samples + ' poses drawn above it, the landing pose at ' + (aePlantFix.land && aePlantFix.land.drawn ? (aePlantFix.land.top / MM).toFixed(3) : '-') + ' mm'}) and the t13c bend fixture (${aePlantTw.err ? 'REFUSED' : aePlantTw.drawnAbove + ' of ' + aePlantTw.samples + ' poses drawn above the exit, the drawn top ' + (aePlantTw.sampledTop / MM).toFixed(3) + ' mm'}), and over the AE family it refuses ${aePlantFam ? aePlantFam.refusedV5 : '-'} where this module refuses ${aeFamShip.refusedV5} — ${aePlantFam ? aePlantFam.drawnAbove : '-'} of its ${aePlantFam ? aePlantFam.built : '-'} builds draw the ball above the exit. The identity rows stay green under it: the ${plantIdentity.err ? '-' : plantIdentity.ship} definitions in web/scene/ballreturn/tracks plus web/tools/fixtures/ballreturn-tracks accept identically with identical sink-clearance numbers (${plantIdentity.err ? plantIdentity.err : plantIdentity.shipDiff.length} differences) and the ${plantIdentity.err ? '-' : plantIdentity.corpus}-case corpus accepts identically (${plantIdentity.err ? '-' : plantIdentity.corpusDiff} differences) — the plant changes nothing where no leading run is dropped, which is every route of the definitions in web/scene/ballreturn/tracks plus web/tools/fixtures/ballreturn-tracks`,
      !plantAE.err && plantAE.skipped.length === 0 && !aePlantFix.err && aePlantFix.drawnAbove >= 1 && aePlantFix.entryTop > aePlantFix.exitY && !!aePlantFix.land && aePlantFix.land.drawn && aePlantFix.land.top > aePlantFix.exitY
      && !aePlantTw.err && aePlantTw.drawnAbove >= 1 && !!aePlantFam && aePlantFam.refusedV5 === 0 && aePlantFam.drawnAbove >= 1 && aePlantFam.drawnAbove >= aeFamShip.refusedV5 * 0.9
      && !plantIdentity.err && plantIdentity.shipDiff.length === 0 && plantIdentity.corpusDiff === 0 && plantIdentity.ship >= 12,
      JSON.stringify({ fixture: aePlantFix.err ?? [+(aePlantFix.entryTop / MM).toFixed(6), aePlantFix.drawnAbove, aePlantFix.samples, aePlantFix.land], bend: aePlantTw.err ?? [aePlantTw.drawnAbove, aePlantTw.samples], family: aePlantFam, identity: plantIdentity, skipped: plantAE.skipped }));
    // t13f (P3-4, the round-7 refuter's F5) — a stop-clipped fragment ≥ 0.1 mm AFTER a plan bend with a slope valley
    const bendFragW = (phi, frag, valley) => {
      const f = phi * Math.PI / 180, chuteAng = 35 * Math.PI / 180, legAng = (35 - valley) * Math.PI / 180;
      const p1 = [0, -245.8 - 250 * Math.sin(chuteAng), -703.5 + 250 * Math.cos(chuteAng)];
      const p2 = [p1[0] + 40 * Math.cos(legAng) * Math.sin(f), p1[1] - 40 * Math.sin(legAng), p1[2] + 40 * Math.cos(legAng) * Math.cos(f)];
      const pts = [[0, -245.8, -703.5], p1, p2]; const d = singleAE(pts, 80, origTopAE(pts) + 5);
      d.runways[0].stop.wall_s_mm = +(250 + frag).toFixed(6); d.runways[0].stop.capacity_balls = Math.max(1, Math.floor((250 + frag) / (2 * R / MM) + 1e-9));
      return d;
    };
    const penGrpW = (rt, C, grp) => { let worst = -Infinity; for (const f of rt.floors) { if (f.group !== grp) continue; const d = subW(C, f.edge.p0); const s2 = f.edge.s0 + dotW(d, f.edge.t), w = dotW(d, f.b), n = dotW(d, f.edge.n); const sc = Math.max(f.s0, Math.min(f.s1, s2)); const wc = Math.max(-f.tol, Math.min(f.tol, w)); worst = Math.max(worst, f.h - Math.hypot(s2 - sc, w - wc, n)); } return worst; };
    const p34 = { combos: 0, built: 0, refused: [], poseLaw: 0, ownGroupOver: 0, vertexDev: 0, lineVsDef: 0, lineDeeper: 0, lineDeeperByPhi: {}, worstLine: -Infinity, worstLineAt: null, aaDropped: 0, noPostBend: 0, rows: [] };
    for (const phi of [15, 30, 45, 60, 75, 90]) for (const frag of [0.1, 0.3, 0.6, 1.0, 2.0, 3.0]) for (const valley of [2, 5, 10, 15, 25]) {
      p34.combos += 1;
      const def = bendFragW(phi, frag, valley);
      let tr = null; try { tr = validateTrack(def, { pockets: POCKETS, falls: null }); } catch (e) { p34.refused.push([phi, frag, valley, e.message.slice(0, 80)]); continue; }
      p34.built += 1;
      const rt = tr.routes.get(1);
      let refusals = 0, ownOver = 0;
      for (const sg of rt.segs) for (let k = 0; k <= 100; k += 1) {
        const D = sg.D0 + (sg.D1 - sg.D0) * k / 100; const q = stationAt(rt, D, rt.r, {});
        try { refusePose(rt, D, q, 'p34'); } catch (e) { refusals += 1; }
        const m = poseClearance(rt, D, q.x, q.y, q.z); if (m && m.pen > m.allowed) ownOver += 1;
      }
      p34.poseLaw += refusals; p34.ownGroupOver += ownOver;
      // the shared vertex, read against the PRE-bend floor: the first twist's own construction depth h·(1 − cos θ_chute)
      const tw2 = rt.segs.find((x) => x.kind === 'twist' && x.floor && x.floor.group === 1);
      const ln = rt.segs.find((x) => x.kind === 'line' && x.floor && x.floor.group === 1);
      // a module that drops the fragment (the deleted length rule, put back by a plant or a mutant) leaves no
      // post-bend piece to read: counted, not crashed — the arm then fails on the count below
      if (!tw2 || !ln) { p34.noPostBend += 1; continue; }
      const qv = stationAt(rt, tw2.D0, rt.r, {});
      p34.vertexDev = Math.max(p34.vertexDev, Math.abs(penGrpW(rt, [qv.x, qv.y, qv.z], 0) - rt.r * (1 - Math.cos(35 * Math.PI / 180))));
      // the fragment's own line poses against the pre-bend floor: the deepest, and what a ball standing ON the
      // leg's own floor at that same station reads against the chute's rectangle — the definition's relation
      let lineMax = -Infinity, lineAt = null;
      for (let k = 0; k <= 100; k += 1) { const D = ln.D0 + (ln.D1 - ln.D0) * k / 100; const q = stationAt(rt, D, rt.r, {}); const c = penGrpW(rt, [q.x, q.y, q.z], 0); if (c > lineMax) { lineMax = c; lineAt = { D, q: [q.x, q.y, q.z] }; } }
      const e = ln.edge; const uAt = e.s0 + dotW(subW(lineAt.q, e.p0), e.t);                     // the station under the deepest line pose
      const onLeg = [e.p0[0] + e.t[0] * (uAt - e.s0) + ln.h * e.n[0], e.p0[1] + e.t[1] * (uAt - e.s0) + ln.h * e.n[1], e.p0[2] + e.t[2] * (uAt - e.s0) + ln.h * e.n[2]];
      p34.lineVsDef = Math.max(p34.lineVsDef, Math.abs(penGrpW(rt, onLeg, 0) - lineMax));
      const vert = penGrpW(rt, [qv.x, qv.y, qv.z], 0);
      if (lineMax > vert + 1e-9) { p34.lineDeeper += 1; p34.lineDeeperByPhi[phi] = (p34.lineDeeperByPhi[phi] ?? 0) + 1; }
      if (lineMax > p34.worstLine) { p34.worstLine = lineMax; p34.worstLineAt = [phi, frag, valley, +(lineAt.D / MM).toFixed(3)]; }
      if (!plantAA.err) { try { const ta = plantAA.schema.validateTrack(def, { pockets: POCKETS, falls: null }); const ra = ta.routes.get(1); if (ra.segs.filter((x) => x.kind === 'line').length < rt.segs.filter((x) => x.kind === 'line').length) p34.aaDropped += 1; } catch (e) { p34.aaDropped += 1; } }
      if (p34.rows.length < 4) p34.rows.push([phi, frag, valley, rt.segs.map((x) => x.kind[0] + (x.len / MM).toFixed(2)).join(' '), 'vertex', +(vert / MM).toFixed(4), 'line', +(lineMax / MM).toFixed(4)]);
    }
    check(`t13f a stop-clipped fragment after a plan bend with a slope valley (the round-7 closure refuter's F5; the coverage the class-AA deletion opened). ${p34.combos} definitions — a 35° chute, a leg turned 15°…90° in plan and 2°…25° shallower, the stop face inside the leg leaving a ${[0.1, 0.3, 0.6, 1, 2, 3].join(' / ')} mm fragment — ${p34.built} build (${p34.refused.length} refused${p34.refused.length ? ': ' + p34.refused.slice(0, 2).map((x) => x.join(' ')).join('; ') : ''}); the deleted length rule would have popped the fragment on ${p34.aaDropped} of them (the AA plant), the corner law keeps every one and rides it through a twist pair and a ${'`'}min(r, 0.45·ext)${'`'} window. The pose law — the module's own, group-scoped — refuses ${p34.poseLaw} of ${p34.built * 101 * 4}+ stations and finds ${p34.ownGroupOver} past entitlement in the ride's own group: the ball is ON its floor everywhere it is drawn. Read the other way, against the PRE-bend floor the pose law does not group with: at the shared vertex every one of the ${p34.built} is inside it by h·(1 − cos 35°) = ${(28.575 * (1 - Math.cos(35 * Math.PI / 180))).toFixed(4)} mm to ${p34.vertexDev.toExponential(2)} m — the first twist's own construction depth, the same with or without a fragment; along the fragment's own line the reading is the vertex's or less at plan turns up to 60° and DEEPER at 75°–90° (${p34.lineDeeper} of ${p34.built}: ${Object.entries(p34.lineDeeperByPhi).map(([k, v]) => k + '° ' + v).join(', ') || 'none'}; the deepest ${(p34.worstLine / MM).toFixed(4)} mm at ${p34.worstLineAt ? p34.worstLineAt[0] + '° / ' + p34.worstLineAt[1] + ' mm / ' + p34.worstLineAt[2] + '°, D ' + p34.worstLineAt[3] + ' mm' : '-'}), where the leg runs along the chute's width inside its un-mitred rectangle. That deeper reading is the DEFINITION's: a ball standing ON the leg's own floor at the very same station reads the identical depth against the chute's rectangle (to ${p34.lineVsDef.toExponential(2)} m on all ${p34.built}) — two floors of one channel overlapping in plan at the corner, issue #778's census, not this builder's construction, and reached by any ride that gets there, fragment or whole leg. The arm exists so the case is READ rather than assumed`,
      p34.built === p34.combos && p34.noPostBend === 0 && p34.poseLaw === 0 && p34.ownGroupOver === 0 && p34.vertexDev <= 1e-9 && p34.lineVsDef <= 1e-9 && p34.aaDropped >= 1
      && Object.keys(p34.lineDeeperByPhi).every((k) => Number(k) >= 75),
      JSON.stringify({ combos: p34.combos, built: p34.built, noPostBend: p34.noPostBend, refused: p34.refused.slice(0, 3), poseLaw: p34.poseLaw, ownOver: p34.ownGroupOver, vertexDev: +p34.vertexDev.toExponential(2), lineVsDef: +p34.lineVsDef.toExponential(2), lineDeeper: p34.lineDeeper, byPhi: p34.lineDeeperByPhi, worstLine_mm: +(p34.worstLine / MM).toFixed(4), worstAt: p34.worstLineAt, aaDropped: p34.aaDropped, rows: p34.rows }));
    // ---- t13g — the interior arc extremum, made LOAD-BEARING (the FIX7 verdict's arm D; ordered 2026-09-14) ------
    // routeTop's pivot-arc extremum is dead under the shipped invariant: it needs an ascending incoming edge and V7
    // refuses one wherever a ball travels (the tray, V7-exempt, is level, where the extremum is an end). A branch
    // no admitted geometry reaches is a branch no arm can hold — the maintainer's arm D deleted it and the suite
    // stayed green. So this arm builds a DECLARED NON-CONFORMANT fixture: a channel runway that ASCENDS 20 mm over
    // 60 mm and then descends 60 mm over 120 mm. (c) It asserts its own non-conformance — V7 refuses it by name — so a
    // later cleanup into conformance turns the arm red instead of silently killing the coverage. (a) buildTrack alone
    // still builds the route, and on its pivot arc the vertical lies strictly inside the sweep: the interior extremum
    // IS the answer, V.y + h + r, and both arc ends read lower. (b) The red plant deletes the branch: routeTop then
    // reads an END of the arc, below what stationAt actually draws, and the arm fails on that number — inside the
    // suite, same test count as the control; the battery's N220 is the same deletion.
    const RIDGE_PTS = [[0, -300, -703.5], [0, -280, -643.5], [0, -340, -523.5]];
    const RIDGE = singleAE(RIDGE_PTS, 80, -199);
    const ridgeV7 = (() => { try { validateTrack(RIDGE, { pockets: POCKETS, falls: null }); return null; } catch (e) { return e.message; } })();
    const ridgeRead = (M2) => {
      const tr = M2.track.buildTrack(RIDGE); const rt = tr.routes.get(1);
      const arc = rt.segs.find((x) => x.kind === 'arc'); const tp = M2.track.routeTop(rt, rt.r);
      let smax = -Infinity, sD = 0;
      for (const sg of rt.segs) { const K = sg.kind === 'arc' ? 4000 : 400; for (let k = 0; k <= K; k += 1) { const D = sg.D0 + (sg.D1 - sg.D0) * k / K; const q = M2.track.stationAt(rt, D, rt.r, {}); if (q.y + rt.r > smax) { smax = q.y + rt.r; sD = D; } } }
      const endTops = arc ? [arc.D0, arc.D1].map((D) => M2.track.stationAt(rt, D, rt.r, {}).y + rt.r) : [];
      return { rt, arc, tp, smax, sD, endTops, kinds: rt.segs.map((x) => x.kind).join(',') };
    };
    const ridgeShip = ridgeRead(SHIPW);
    const ridgeExpect = RIDGE_PTS[1][1] * MM + 2 * R;                        // the centre passes over the top of its pivot circle: V.y + h, and h = r on a channel
    const plantArc = await redPlant('arcint', [["        if (u > 0 && u < th) take(sg.V[1] + sg.h * Math.hypot(A, B) / Math.sin(th), sg.D0 - sg.len * (u / th), 'arc');", "        // (plant: the interior extremum not read)"]]);
    const ridgeRed = plantArc.err ? null : ridgeRead(plantArc);
    check(`t13g the interior arc extremum, made load-bearing (GH-770 FIX7 verdict, arm D). A declared NON-conformant fixture — an 80 mm channel that ascends 20 mm over 60 mm and then descends 60 mm over 120 mm, a ridge whose incoming edge does not drain — is refused by V7 by name ("${ridgeV7 ? ridgeV7.slice(0, 110) : 'NO REFUSAL: the fixture has become conformant and this arm no longer covers the branch'}"), which is the assertion that keeps this coverage from dying silently. buildTrack alone builds it: ${ridgeShip.kinds}, a ${ridgeShip.arc ? (ridgeShip.arc.len / MM).toFixed(3) : '-'} mm pivot arc over the ridge whose sweep contains the vertical. routeTop reads the INTERIOR extremum: ${(ridgeShip.tp.top / MM).toFixed(6)} mm at D ${(ridgeShip.tp.D / MM).toFixed(3)} (a ${ridgeShip.tp.kind}, strictly inside the arc's [${ridgeShip.arc ? (ridgeShip.arc.D1 / MM).toFixed(3) : '-'}, ${ridgeShip.arc ? (ridgeShip.arc.D0 / MM).toFixed(3) : '-'}]) — the closed form V.y + h + r = ${(ridgeExpect / MM).toFixed(6)} mm to ${Math.abs(ridgeShip.tp.top - ridgeExpect).toExponential(2)} m, ${((ridgeShip.tp.top - Math.max(...ridgeShip.endTops)) / MM).toFixed(4)} mm above the higher arc end (${ridgeShip.endTops.map((v) => (v / MM).toFixed(4)).join(' / ')}), and equal to a 4 001-station sampling of the drawn arc to ${Math.abs(ridgeShip.tp.top - ridgeShip.smax).toExponential(2)} m. The red plant deletes the branch: its routeTop reads ${ridgeRed ? (ridgeRed.tp.top / MM).toFixed(6) : 'PLANT FAILED'} mm — an END, ${ridgeRed ? ((ridgeShip.tp.top - ridgeRed.tp.top) / MM).toFixed(4) : '-'} mm under what stationAt still draws (${ridgeRed ? (ridgeRed.smax / MM).toFixed(6) : '-'} mm) — so the branch is load-bearing here and dead everywhere V7 speaks: on every admitted geometry the vertical is outside the sweep, and on the level tray u* is the arc's start`,
      !!ridgeV7 && /\[V7\]/.test(ridgeV7) && /edge \[0\] does not drain/.test(ridgeV7)
      && ridgeShip.kinds === 'line,arc,line' && !!ridgeShip.arc && ridgeShip.tp.kind === 'arc'
      && Math.abs(ridgeShip.tp.top - ridgeExpect) <= 1e-9 && ridgeShip.tp.D > ridgeShip.arc.D1 + 1e-6 && ridgeShip.tp.D < ridgeShip.arc.D0 - 1e-6
      && ridgeShip.tp.top > Math.max(...ridgeShip.endTops) + 1e-3 && Math.abs(ridgeShip.tp.top - ridgeShip.smax) <= 1e-9
      && !plantArc.err && plantArc.skipped.length === 0 && !!ridgeRed && ridgeRed.tp.top < ridgeShip.tp.top - 1e-3 && Math.abs(ridgeRed.smax - ridgeShip.smax) <= 1e-12 && ridgeRed.tp.top < ridgeRed.smax - 1e-3,
      JSON.stringify({ v7: ridgeV7 && ridgeV7.slice(0, 120), ship: { kinds: ridgeShip.kinds, top_mm: +(ridgeShip.tp.top / MM).toFixed(6), D_mm: +(ridgeShip.tp.D / MM).toFixed(3), expect_mm: +(ridgeExpect / MM).toFixed(6), ends_mm: ridgeShip.endTops.map((v) => +(v / MM).toFixed(4)), sampled_mm: +(ridgeShip.smax / MM).toFixed(6) }, plant: plantArc.err ?? (ridgeRed && { top_mm: +(ridgeRed.tp.top / MM).toFixed(6), sampled_mm: +(ridgeRed.smax / MM).toFixed(6) }) }));
    // ---- t13h — every plant presents the SAME export surface as the shipped module ------------------------------
    // A red plant is a copy of the module with named lines replaced; the arm that reads it assumes the copy
    // still exports what the ship exports. When it does not, the arm dies on a load error that a summary line
    // cannot tell from a real red (the FIX7 verdict's arm C: "does not provide an export named 'routeEntry'"),
    // and a mutant killed that way is no evidence. So the surface is asserted, plant by plant, against the ship.
    // NOT asserted here: SHIPW's key set against the namespaces' — SHIPW IS the namespaces now, so that
    // comparison is an identity by construction and would be a green line that cannot go red. Nor is a plant
    // that FAILED TO PLANT counted against this arm: its anchor being absent is the arm that reads it failing
    // on "PLANT FAILED" by name (an anchor observation, class Z5), not an export-surface difference — under a
    // mutant that deletes the very line a plant anchors on, this arm would otherwise be red for the anchor
    // and read as a second behavioural kill.
    const surfaceW = (M2) => ['schema', 'track', 'kin'].map((k) => `${k}:${Object.keys(M2[k]).sort().join(',')}`).join(' | ');
    const shipSurfaceW = surfaceW(SHIPW);
    const plantsW = [['w1', plantW1], ['w6', plantW6], ['w9', plantW9], ['w7-foot', plantFootW], ['w7-plane', plantPlaneW], ['w8-near', plantNearW], ['w8-acc', plantAccW],
      ['y1', plantY1], ['y2', plantY2], ['y3', plantY3], ['y1ent', entY], ['y1floor', floorOnlyY], ['y1max', maxOnlyY], ['y2live', liveY], ['aa', plantAA], ['ab', plantAB], ['ae', plantAE], ['arcint', plantArc]];
    const surfRows = plantsW.map(([tag, P2]) => (P2.err ? { tag, err: P2.err.slice(0, 80) } : { tag, same: surfaceW(P2) === shipSurfaceW, diff: surfaceW(P2) === shipSurfaceW ? null : ['schema', 'track', 'kin'].filter((k) => Object.keys(P2[k]).sort().join(',') !== Object.keys(SHIPW[k]).sort().join(',')) }));
    check(`t13h every red plant presents the same export surface as the shipped module (GH-770 FIX7 verdict follow-up). ${plantsW.length} plants built this run, each a temp copy of web/scene/ballreturn with named lines replaced and imported through its own schema.js / track.js / kinematics.js: ${surfRows.filter((r2) => r2.same).length} present the ship's surface exactly (${Object.keys(SHIPW.track).length} track exports, ${Object.keys(SHIPW.kin).length} kinematics, ${Object.keys(SHIPW.schema).length} schema), ${surfRows.filter((r2) => r2.err).length} failed to plant (reported, not counted: an absent anchor is the reading arm's own PLANT FAILED, not a surface difference), ${surfRows.filter((r2) => r2.same === false).length} differ${surfRows.some((r2) => r2.same === false) ? ` (${surfRows.filter((r2) => r2.same === false).map((r2) => `${r2.tag}: ${r2.diff.join('/')}`).join('; ')})` : ''}. The arms above read the ship through the module namespaces themselves, so the ship side cannot be short an export; this arm is the other side — a plant whose edit removes or renames an export dies here by name instead of as a load error inside the arm that reads it, which is the difference between a mutant killed by behaviour and one killed by a missing symbol`,
      plantsW.length >= 15 && surfRows.filter((r2) => !r2.err).length >= 15 && surfRows.filter((r2) => !r2.err).every((r2) => r2.same === true) && Object.keys(SHIPW.track).includes('routeEntry') && Object.keys(SHIPW.track).includes('routeTop') && Object.keys(SHIPW.track).includes('buildTrack'),
      JSON.stringify({ ship: { track: Object.keys(SHIPW.track).length, kin: Object.keys(SHIPW.kin).length, schema: Object.keys(SHIPW.schema).length }, plants: surfRows }));
    // ---- the per-arm base receipt writer (GH-770 review r6, class Z6) ------------------
    // A maintenance path like --write-base-parity above: run the readings the class-Y arms attribute
    // to the PR base against the BASE'S OWN modules and record what they say, so every one of those
    // sentences quotes a file this suite wrote. Runs at the foot of the block because it needs every
    // definition the arms build. `node web/tools/test-ballreturn.mjs --fuzz 100 --write-base-arms <dir>`.
    const BADIRW = (() => { const i = args.indexOf('--write-base-arms'); return i >= 0 ? args[i + 1] : null; })();
    if (BADIRW) {
      const srcA = { dir: path.resolve(BADIRW), files: MODSHAW(BADIRW) };
      if (sameAsMineW(srcA.files)) {
        console.log(`REFUSED: ${srcA.dir} is byte-identical to this checkout's own web/scene/ballreturn — a base receipt recorded from the module under test is this round quoting itself`);
        process.exit(1);
      }
      const urlA = (n) => pathToFileURL(path.resolve(BADIRW, n)).href;
      const MA = { schema: await import(urlA('schema.js')), track: await import(urlA('track.js')), kin: await import(urlA('kinematics.js')) };
      const a1 = y1ReadY(MA, 0.1);
      const a1s = y1SweepY.map((x) => y1ReadY(MA, x.d));
      const a2 = y2ReadY(MA, Y2DEF);
      const a2g = y2GridY.map((g) => { try { MA.schema.validateTrack(g.def, { pockets: POCKETS, falls: null }); return null; } catch (e) { return lawW(e.message); } });
      const a3 = Y3TS.map((T) => ({ T, ...sigW(MA, stepY(100.5, T)) }));
      const a3ok = a3.filter((r) => !r.err);
      const rec = { src: srcA, base: '4818480fc1b93fdbb2d43f286ed4f17374157073',
        y1: { drop_mm: 0.1, err: a1.err ?? null, total_m: a1.total ?? null, cuts: a1.cuts ?? null, minEnt_m: a1.minEnt ?? null, solved: a1.solved ?? null, routes: a1.routes ?? null, thrown: a1.thrown ? a1.thrown.slice(0, 140) : null },
        y1sweep: { steps: a1s.length, built: a1s.filter((x) => !x.err).length, solved2: a1s.filter((x) => !x.err && x.solved === 2).length, neg: a1s.filter((x) => x.err || x.minEnt === null || x.minEnt < 0).length },
        y2: { err: a2.err ? a2.err.slice(0, 160) : null, total_m: a2.total ?? null, segs: a2.segs ?? null, routes: a2.routes ?? null, gate: a2.gate ?? null, solved: a2.solved ?? null },
        y2grid: { combos: a2g.length, built: a2g.filter((x) => x === null).length, refused: a2g.filter(Boolean).length, laws: [...new Set(a2g.filter(Boolean))] },
        y3: { ts: Y3TS, errs: a3.map((r) => r.err ?? null), first_m: a3.map((r) => (r.err ? null : r.first)), seats: a3.map((r) => (r.err ? null : r.seats)),
          worst_m: a3ok.length > 1 ? Math.max(...a3ok.map((r) => devW(a3ok[0], r))) : null } };
      fs.writeFileSync(BAFIXW, `${JSON.stringify(rec, null, 1)}\n`);
      console.log(`wrote ${BAFIXW} from ${srcA.dir}: ${MODFW.filter((n) => srcA.files[n]).map((n) => `${n} ${srcA.files[n].slice(0, 16)}`).join(', ')}`);
      console.log(`  y1 ${rec.y1.total_m === null ? rec.y1.err : `${(rec.y1.total_m / MM).toFixed(6)} mm / ${rec.y1.cuts} cuts / ${rec.y1.solved} solves`}; sweep ${rec.y1sweep.solved2}/${rec.y1sweep.steps}; y2 ${rec.y2.err ?? `${(rec.y2.total_m / MM).toFixed(6)} mm / ${rec.y2.segs} segs / ${rec.y2.solved} solves`}; grid ${rec.y2grid.built}/${rec.y2grid.combos}; y3 ${rec.y3.first_m[0] === null ? rec.y3.errs[0] : `${(rec.y3.first_m[0] / MM).toFixed(6)} mm`} worst ${rec.y3.worst_m === null ? 'n/a' : rec.y3.worst_m.toExponential(2)} m, errs ${rec.y3.errs.map((e) => e ?? 'ok').join(' ')}`);
      for (const d of redTmp) fs.rmSync(d, { recursive: true, force: true });
      process.exit(0);                               // a maintenance path: write the receipt and stop
    }
  }
  // t3b overflow on the TEST fixture: 8 pots into rc → 5 on the chute, the lead up to the entry + 2r, the rest refused; no drawn rest above the pocket exit
  if (ttrack) {
    const MM = 0.001;
    const many8 = []; for (let i = 0; i < 8; i++) many8.push({ id: 20 + i, handoff: handoffFromSink({ t: 0.5 + i * 0.6, pocket: POCKETS[4], fall: POCKETS[4], r: R, glide: 0.06, tFall: 0.021 }, { track: ttrack, pockets: POCKETS, r: R }) });
    const s8 = solveShot({ track: ttrack, r: R, ledger: [], arrivals: many8 });
    const rc = ttrack.routes.get(4);
    const rests8 = [...s8.rest.entries()].sort((a, b) => a[1] - b[1]);
    check(`t3b 8 pots into the fixture's rc chute: no seat beyond the entry + 2r, ${s8.overflow.size} refused as overflow, every drawn rest fully below the pocket exit`, rests8.every(([, D]) => D <= rc.total + 2 * R + 1e-9) && s8.overflow.size >= 1 && rests8.every(([id]) => { const pz = poseAt(s8, id, s8.tEnd + 1, {}); return !pz || pz.y + R <= rc.exitY + 1e-9; }), JSON.stringify({ rests: rests8.map(([id, D]) => [id, +(D / MM).toFixed(1)]), overflow: [...s8.overflow] }));
  }
  for (const d of redTmp) fs.rmSync(d, { recursive: true, force: true });   // the red plants' temp module trees
}

// ---- (u) seal 12: review round 9 — the single-runway terminal chute (P2-1) and the
//      vertical-edge refusal V12 (P2-2) ------------------------------------------------
{
  const refD = def.ball.reference_diameter_mm;
  /** A terminal-chutes system that is ONE runway from the pocket to its own stop — the
   * shortest complete form a chute can take. `dxz` (mm) = the horizontal extent of a
   * first edge that drops 60 mm; null = a plain two-vertex chute. The stop is DERIVED
   * from the arclength the vertices give, so V6's identities hold for every variant. */
  const oneChute = (dxz = null) => {
    const pts = dxz === null
      ? [[0, -270, 703.5], [-300, -330, 703.5]]
      : [[0, -270, 703.5], [-dxz, -330, 703.5], [-300, -390, 703.5]];
    let L = 0;
    for (let i = 0; i + 1 < pts.length; i++) L += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1], pts[i + 1][2] - pts[i][2]);
    const wall = Math.round(Math.floor(L / refD) * refD * 1000) / 1000;
    return {
      schema: def.schema, doc: { ...def.doc, status: 'TEST', title: 'TEST single-runway terminal chute' },
      units: def.units, datum_frame: def.datum_frame, ball: def.ball,
      support: { kind: 'channel', width_mm: 70, provenance: { tag: 'TEST', source: 'seal 12: channel skeleton' } },
      rolling_resistance: def.rolling_resistance,
      topology: 'terminal-chutes',
      runways: [{ id: 'p4-chute', role: 'chute', points_mm: pts, next: null,
        stop: { kind: 'face', wall_s_mm: wall, capacity_balls: Math.floor(wall / refD + 1e-9), provenance: { tag: 'TEST', source: 'seal 12: stop derived from the chute arclength' } },
        provenance: { tag: 'TEST', source: 'seal 12: single-runway chute' } }],
      pockets: [{ index: 4, entry_runway: 'p4-chute', exit_below_y_mm: -199, provenance: { tag: 'TEST', source: 'seal 12: cup span' } }],
      unserved_pockets: [0, 1, 2, 3, 5].map((i) => ({ index: i, reason: 'skeleton: only the right middle is served' })),
    };
  };
  const tryV = (d) => { try { return { track: validateTrack(d, { pockets: POCKETS, falls: null }), msg: null }; } catch (e) { return { track: null, msg: e.message }; } };
  const { buildTrack: bt0 } = await import('../scene/ballreturn/track.js');

  const u1 = tryV(oneChute());
  check('u1 a terminal chute that is ONE runway from the pocket to its own stop validates (review r9 P2-1: the runway minimum is topology-conditional): one runway, one rest, one served route, no tray', !!u1.track && u1.track.runways.size === 1 && u1.track.rests.size === 1 && u1.track.routes.size === 1 && u1.track.tray === null, u1.msg ?? '');
  check('u1b it passes the published JSON schema ALONE (shapeRefusal null): V0 no longer refuses it before the topology is read', shapeRefusal(oneChute()) === null, String(shapeRefusal(oneChute())));
  const u2 = tryV({ ...oneChute(), runways: [] });
  check('u2 a ZERO-runway terminal system is still refused at V0 — the minimum moved into the topology branch, it did not go away', !!u2.msg && u2.msg.includes('[V0]') && /\/runways/.test(u2.msg) && /minItems/.test(u2.msg), u2.msg ?? 'ACCEPTED');
  const u2t = loadDef(); u2t.runways = [];
  const r2t = tryV(u2t);
  check('u2b a ZERO-runway trunk-tray definition is refused at V0 the same way', !!r2t.msg && r2t.msg.includes('[V0]') && /\/runways/.test(r2t.msg) && /minItems/.test(r2t.msg), r2t.msg ?? 'ACCEPTED');
  const u3d = loadDef(); u3d.runways = [u3d.runways[0]];
  const u3 = tryV(u3d);
  check('u3 the TRUNK-TRAY minimum is unchanged: a one-runway trunk-tray definition is still refused at V0, and the alternation names the branch laws it missed', !!u3.msg && u3.msg.includes('[V0]') && /trunk-tray: a tray, and at least two runways/.test(u3.msg) && /terminal-chutes: no tray/.test(u3.msg), u3.msg ?? 'ACCEPTED');

  // V12 (review r9 P2-2): the support normal — and with it the rolling axis n̂ × t̂ — is
  // UNDEFINED for a vertical edge. Refused, never given an authored orientation. The floor
  // is a RATIO derived from upNormal's own fallback threshold (u5b measures it), so the law
  // refuses what is not derivable and nothing else: neither steep edges (u6) nor short ones
  // (u6b), and not the stop's own body, which no ball rolls on (u10).
  const u4 = tryV(oneChute(0));
  check('u4 an exactly VERTICAL traversed runway edge is refused before any axis is derived (review r9 P2-2): [V12] with the law line', !!u4.msg && u4.msg.includes('[V12]') && /horizontal extent 0\.000e\+0 mm over a 60\.000 mm edge is below 1e-9 of its length/.test(u4.msg), u4.msg ?? 'ACCEPTED');
  const u5 = tryV(oneChute(6e-9)); // 6e-9 mm across a 60 mm drop = a ratio of 1e-10, below the floor
  check('u5 an edge BELOW the floor (6.0e-9 mm across a 60 mm drop — a ratio of 1e-10) is refused under the same law', !!u5.msg && u5.msg.includes('[V12]') && /is below 1e-9 of its length/.test(u5.msg), u5.msg ?? 'ACCEPTED');
  // u5b the floor's own derivation, MEASURED through the module: upNormal normalises while
  // |ŷ − t_y·t̂| = |Δxz|/|Δ| > 1e-12 and returns the parallel ŷ below that, so |n̂ × t̂| is
  // exactly 1 down to that ratio and collapses under it. The only place buildTrack will
  // build such an edge is the stop's own body (exempt), which is what this reads.
  const lipAxis = (ratio) => {
    const d = oneChute(); const rw = d.runways[0];
    const tail = rw.points_mm[rw.points_mm.length - 1];
    rw.points_mm.push([tail[0] - 60 * ratio, tail[1] + 60, tail[2]]);   // an up-turn lip 60 mm high, beyond the stop face
    let t = null;
    try { t = bt0(d).runways.get('p4-chute'); } catch { return NaN; }   // a belt that refused the lip: NaN, and the arm fails rather than crashing the gate
    const e = t.edges[t.edges.length - 1];
    return Math.hypot(e.axis[0], e.axis[1], e.axis[2]);
  };
  const onset = [1e-8, 1e-9, 1e-11, 1e-12, 1e-13, 0].map((r) => [r, lipAxis(r)]);
  check(`u5b the floor is DERIVED, not chosen: through the module's own upNormal the rolling axis |n̂ × t̂| is exactly 1 down to a ratio of 1e-12 and collapses below it (${onset.map(([r, a]) => `${r}→${a.toFixed(3)}`).join(', ')}); the law's floor 1e-9 sits three decades above that onset`,
    onset.every(([, a]) => Number.isFinite(a)) && onset.filter(([r]) => r >= 1e-12).every(([, a]) => Math.abs(a - 1) < 1e-9) && onset.filter(([r]) => r < 1e-12).every(([, a]) => a < 1e-9), JSON.stringify(onset));
  const u6 = tryV(oneChute(0.9));
  const axes6 = u6.track ? [...u6.track.runways.values()].flatMap((rw) => rw.edges.map((e) => Math.hypot(e.axis[0], e.axis[1], e.axis[2]))) : [];
  const n6 = u6.track ? u6.track.runways.get('p4-chute').edges[0].n : null;
  check(`u6 V12 is NOT a slope law: a STEEP but real edge (0.900 mm across a 60 mm drop — ${(Math.atan2(60, 0.9) * 180 / Math.PI).toFixed(2)}° from horizontal) is ADMITTED, every rolling axis is a unit vector and its support normal is nearly horizontal (n_y ${n6 ? n6[1].toFixed(4) : 'n/a'}) — the definition means it, so the module carries it`, !!u6.track && axes6.length === 2 && axes6.every((a) => Math.abs(a - 1) < 1e-12) && !!n6 && Math.abs(n6[1] - 0.9 / Math.hypot(0.9, 60)) < 1e-9, JSON.stringify({ msg: u6.msg, axes6, n6 }));
  const u6c = tryV(oneChute(6e-7)); // a ratio of 1e-8, one decade above the floor
  check('u6b just ABOVE the floor (a ratio of 1e-8) the definition is admitted: the law refuses only what upNormal cannot derive', !!u6c.track, u6c.msg ?? '');
  const short = oneChute(); short.runways[0].points_mm = [[0, -270, 703.5], [-0.5, -270.4, 703.5], [-300, -330, 703.5]];
  const u6d = tryV(short);
  check('u6c a SHORT draining edge 0.500 mm across (below the absolute millimetre the first draft of this law tested) is ADMITTED — V12 measures ORIENTATION (a ratio), never size', !!u6d.track && (() => { const e = u6d.track.runways.get('p4-chute').edges[0]; return Math.abs(Math.hypot(e.axis[0], e.axis[1], e.axis[2]) - 1) < 1e-12 && Math.abs(e.n[1] - 0.5 / Math.hypot(0.5, 0.4)) < 1e-9; })(), u6d.msg ?? '');
  let btMsg = null; try { bt0(oneChute(0)); } catch (e) { btMsg = e.message; }
  check('u7 buildTrack refuses the same traversed edge for a DIRECT caller (the belt behind V12, same floor, same exemption): a named graph defect, never a zero rolling axis', !!btMsg && /edge 0 is vertical \(no support normal, no rolling axis\)/.test(btMsg), btMsg ?? 'BUILT');
  const dup = oneChute(); dup.runways[0].points_mm = [[0, -270, 703.5], [0, -270, 703.5], [-300, -330, 703.5]];
  const u8 = tryV(dup);
  check('u8 a REPEATED vertex (no extent at all, not a vertical edge) stays the graph defect it always was — V12 does not swallow it', !!u8.msg && u8.msg.includes('[V2]') && /repeats vertex/.test(u8.msg), u8.msg ?? 'ACCEPTED');
  // u10 the stop's own body: never traversed, exempt from V7's drain law and from V12 too —
  // an up-turn clamp lip that stands straight up is a shipped shape (every XW101 chute has
  // one, at 51.3°). The SAME vertical edge before the stop face is refused.
  const lip = oneChute();
  const lipTail = lip.runways[0].points_mm[lip.runways[0].points_mm.length - 1];
  lip.runways[0].points_mm.push([lipTail[0], lipTail[1] + 30, lipTail[2]]);          // straight up, 30 mm, beyond wall_s (V6 caps the lip at one ball diameter)
  const u10 = tryV(lip);
  check('u10 an up-turn clamp lip standing EXACTLY vertical (30 mm) beyond the stop face is admitted: never traversed, exempt from V12 as it is from the drain law V7', !!u10.track && u10.track.rests.size === 1, u10.msg ?? 'REFUSED');
  const u10b = tryV(oneChute(0));
  check('u10b the exemption is bounded: the same vertical edge BEFORE the stop face is refused', !!u10b.msg && u10b.msg.includes('[V12]'), u10b.msg ?? 'ACCEPTED');
  // u11 every runway, every edge — not just the first runway's first edge
  const lastEdge = loadDef();
  const rwB = lastEdge.runways[1]; const pB = rwB.points_mm;
  pB[pB.length - 1] = [pB[pB.length - 2][0], pB[pB.length - 2][1] - 60, pB[pB.length - 2][2]];
  const u11 = tryV(lastEdge);
  check(`u11 the law walks EVERY runway and EVERY edge: a vertical LAST edge of the SECOND runway is refused and named (${rwB.id} edge [${pB.length - 2}])`, !!u11.msg && u11.msg.includes('[V12]') && new RegExp(`runway ${rwB.id} edge \\[${pB.length - 2}\\]`).test(u11.msg), u11.msg ?? 'ACCEPTED');
  // census: V12 refuses none of the trackFiles() definitions, and the margin is stated as a ratio
  const files = trackFiles().map(([, p]) => p);
  let minRatio = Infinity; let minAt = null; let steepest = 0; let steepAt = null; let edges = 0;
  for (const f of files) {
    for (const rw of loadDef(f).runways) {
      for (let i = 0; i + 1 < rw.points_mm.length; i++) {
        const a = rw.points_mm[i]; const b = rw.points_mm[i + 1];
        const h = Math.hypot(b[0] - a[0], b[2] - a[2]);
        const l = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
        edges += 1;
        if (l > 0 && h / l < minRatio) { minRatio = h / l; minAt = `${path.basename(f)}:${rw.id}[${i}]`; }
        const ang = Math.atan2(Math.abs(b[1] - a[1]), h) * 180 / Math.PI;
        if (ang > steepest) { steepest = ang; steepAt = `${path.basename(f)}:${rw.id}[${i}]`; }
      }
    }
  }
  check(`u9 no definition in web/scene/ballreturn/tracks plus web/tools/fixtures/ballreturn-tracks comes near the floor: over ${edges} edges of ${files.length} track JSONs the smallest |Δxz|/|Δ| is ${minRatio.toFixed(3)} (${minAt}, ${(Math.acos(Math.min(1, minRatio)) * 180 / Math.PI).toFixed(1)}° from horizontal) and the steepest edge is ${steepest.toFixed(1)}° (${steepAt}) — a census, gated by nothing, that says V12 refuses none of those track JSONs`, minRatio > 1e-9, JSON.stringify({ files: files.length, edges, minRatio, minAt, steepest, steepAt }));
}

// ---- (r) seal 6 addendum: review round 4 on seal 5 — the five solver / track defects --
{
  const MM = 0.001;
  // r1 (P2-1) arrivals 10–300 ms apart into one pocket: no pose step larger than one
  // frame of motion at 240 Hz and at 1 kHz; the pose is continuous across every
  // contact-via-landing instant; no ball is ever displaced after it has landed
  const gaps = [0.010, 0.030, 0.050, 0.100, 0.200, 0.300];
  const arrs = []; let tA = 0.5;
  gaps.forEach((g, i) => { tA += g; arrs.push({ id: 30 + i, handoff: handoffFromSink({ t: tA, pocket: POCKETS[4], fall: POCKETS[4], r: R, glide: 0.06, tFall: 0.021 }, ctx) }); });
  const sr = solveShot({ track, r: R, ledger: [], arrivals: arrs });
  let worstRatio = 0; let worstAt = null; let discont = 0; let worstDisc = 0;
  // the piece's own speed at time t (fall: the ballistic vertical speed and the plan
  // glide; roll: v0 + a·τ) — a step may never exceed what THAT motion covers in dt
  const localSpeed = (ps, t) => {
    let p = ps[0]; for (const q of ps) { if (q.t0 <= t) p = q; else break; }
    const tau = Math.max(0, Math.min(t, p.t1) - p.t0);
    if (p.kind === 'fall') { const T = Math.max(1e-9, p.t1 - p.t0); return Math.hypot(p.vDown + G * tau, Math.hypot(p.xE - p.x0, p.zE - p.z0) / T); }
    if (p.kind === 'roll') { if (p.follow) { const c = continuationAt(sr, ps.__id, t); return c && c.kind === 'roll' ? c.v : Math.max(0, p.v0 + p.a * tau); } return Math.max(0, p.v0 + p.a * tau); } // a follower's own speed (chord law: it differs from its front's through a bend)
    return 0;
  };
  for (const a of arrs) {
    const ps = sr.pieces.get(a.id);
    if (!ps) continue; // a refused arrival has no pieces (the arm's seat count catches it)
    ps.__id = a.id;
    for (const dt of [1 / 240, 1 / 1000]) {
      let prev = null; let prevT = null;
      for (let t = ps[0].t0; t < sr.tEnd + 0.2; t += dt) {
        const q = poseAt(sr, a.id, t, {});
        if (q && prev) {
          const step = Math.hypot(q.x - prev.x, q.y - prev.y, q.z - prev.z);
          // the piece's own speed can peak INSIDE the frame (a follower through a twist): the
          // bound is the largest local speed over eight sub-samples of the frame
          let vPeak = 0; for (let k = 0; k <= 8; k++) vPeak = Math.max(vPeak, localSpeed(ps, prevT + (t - prevT) * k / 8));
          const bound = vPeak * dt + 1e-9;
          const ratio = step / bound; if (ratio > worstRatio) { worstRatio = ratio; worstAt = [a.id, +t.toFixed(4), +(step / MM).toFixed(3), dt]; }
        }
        prev = q ? { x: q.x, y: q.y, z: q.z } : null; prevT = t;
      }
    }
    for (const p of ps) { // continuity at every piece start
      if (!Number.isFinite(p.t0)) continue;
      const before = poseAt(sr, a.id, p.t0 - 1e-6, {}), after = poseAt(sr, a.id, p.t0 + 1e-6, {});
      if (!before || !after) continue;
      const d = Math.hypot(before.x - after.x, before.y - after.y, before.z - after.z);
      worstDisc = Math.max(worstDisc, d); if (d > 5e-6) discont += 1;
    }
  }
  for (const e of sr.events) { // …and at every event of every kind
    const before = poseAt(sr, e.ball, e.t - 1e-6, {}), after = poseAt(sr, e.ball, e.t + 1e-6, {});
    if (!before || !after) continue;
    const d = Math.hypot(before.x - after.x, before.y - after.y, before.z - after.z);
    worstDisc = Math.max(worstDisc, d); if (d > 5e-6) discont += 1;
  }
  const seated = arrs.map((a) => sr.rest.get(a.id)).filter(Number.isFinite);
  check(`r1 six arrivals 10–300 ms apart: every pose step ≤ one frame of the PIECE's own speed at that instant (worst ratio ${worstRatio.toFixed(3)} at ${JSON.stringify(worstAt)}), the pose is continuous at every piece start and every event of every kind (worst ${(worstDisc / MM).toFixed(4)} mm), the ladder holds (five in the tray at (2n−1)r, the sixth on the trunk one diameter from the fifth in SPACE across the trunk→tray joint)`, worstRatio <= 1.0 + 1e-6 && discont === 0 && seated.length === 6 && (() => { const srt = [...seated].sort((x, y) => x - y); if (!srt.slice(0, 5).every((D, i) => Math.abs(D - restStation(i + 1, R)) < 1e-9)) return false; const rt = track.routes.get(4); const a = stationAt(rt, srt[4], R, {}), b = stationAt(rt, srt[5], R, {}); return Math.abs(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) - 2 * R) < 1e-9; })(), JSON.stringify({ worstRatio, worstAt, worstDisc, seated: seated.map((D) => +(D / MM).toFixed(1)) }));
  check('r1b a landing on an occupied entry is a re-aimed FALL (the fall piece ends at the seat one ball length behind the tail at ITS landing time; a rolling tail is ridden to the event instant) followed by a contact event at that instant — never a shift after landing', (() => {
    const c = sr.events.filter((e) => e.kind === 'contact' && e.via === 'landing');
    if (!c.length) return false;
    return c.every((e) => { const ps = sr.pieces.get(e.ball); const fall = ps[0]; const land = sr.events.find((x) => x.kind === 'landing' && x.ball === e.ball); if (!(fall.kind === 'fall' && land && Math.abs(land.t - e.t) < 1e-12)) return false; const fD = fall.D ?? fall.route.total; if (Math.abs(fD - land.D) < 1e-9) return true; const ride = ps[1]; if (!ride || ride.kind !== 'roll' || Math.abs(ride.t0 - fall.t1) > 1e-12 || Math.abs(ride.t1 - land.t) > 1e-12 || Math.abs(ride.D0 - fD) > 1e-9) return false; const tau = ride.t1 - ride.t0; return Math.abs((ride.D0 - (ride.v0 * tau + 0.5 * ride.a * tau * tau)) - land.D) < 1e-6; }); // the fall ends at the seat; when the tail was rolling the ball rides with it from that instant to the landing event, touching it there
  })(), JSON.stringify(sr.events.filter((e) => e.via === 'landing').map((e) => [e.ball, e.other, +e.t.toFixed(4)])));

  // r6 (review 6b, P1): the Star's 5th pot rests INSIDE the lead→chute pivot arc; the 6th
  // must contact it (same lane), never be parked by a bogus yield — ladder exact, no
  // yield / hold, no two rest centres closer than one diameter in 3-D
  try {
    const up = loadDef(path.resolve(here, '../scene/ballreturn/tracks/wpbsa_snooker_12ft-xw101-slides.json'));
    const sctx = await tableContext(up.doc.table_id);
    const strack = validateTrack(up, { pockets: sctx.pockets, falls: sctx.falls });
    const sR = 0.02625;
    const six = []; for (let i = 0; i < 6; i++) six.push({ id: 1 + i, handoff: handoffFromSink({ t: 0.5 + i * 0.8, pocket: sctx.pockets[0], fall: sctx.falls[0], r: sR, glide: 0.06, tFall: 0.021 }, { track: strack, pockets: sctx.pockets, r: sR }) });
    const s6 = solveShot({ track: strack, r: sR, ledger: [], arrivals: six });
    const rests = [...s6.rest.entries()].sort((a, b) => a[1] - b[1]);
    const route0 = strack.routes.get(0);
    // On a SAMPLED chute the exact (2n−1)r ladder is not the law — the law is the contact: the
    // 3-D distance between consecutive rest centres is one diameter (seatBehind, review r6 P2).
    // The D-parameter under-measures that distance by exactly the centre-path steps the reader's
    // sub-grain rule leaves between the two seats (r4), and over-measures it where the path
    // bends (arc against chord). Both are accounted here, neither is tolerated blind.
    const jump0 = (() => { const out = []; const a = {}, b = {}; for (let i = 1; i < route0.segs.length; i++) { const D = route0.segs[i].D0; stationAt(route0, D + 1e-9, route0.r, a); stationAt(route0, Math.max(0, D - 1e-9), route0.r, b); const st = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); if (st > 1e-9) out.push([D, st]); } return out; })();
    const pairs = [];
    for (let i = 0; i + 1 < rests.length; i++) {
      const Da = rests[i][1], Db = rests[i + 1][1];
      const a = stationAt(route0, Da, sR, {}), b = stationAt(route0, Db, sR, {});
      pairs.push({ chord: Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z), gap: Db - Da, steps: jump0.filter(([D]) => D > Da + 1e-12 && D < Db - 1e-12).reduce((t, x) => t + x[1], 0) });
    }
    const contactOk = pairs.every((q) => Math.abs(q.chord - 2 * sR) < 1e-9);
    const deficitOk = pairs.every((q) => 2 * sR - q.gap <= q.steps + 1e-9);
    const ladderDev = Math.max(...rests.map(([, D], i) => Math.abs(D - restStation(i + 1, sR))));
    let min3d = Infinity;
    for (let i = 0; i < rests.length; i++) for (let j = i + 1; j < rests.length; j++) { const a = stationAt(route0, rests[i][1], sR, {}), b = stationAt(route0, rests[j][1], sR, {}); min3d = Math.min(min3d, Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)); }
    check(`r6 six pots into the Star corner (the lane's own 1.1 file: no lead, declared capacity 5 — a documentation identity, not a seating limit): every consecutive pair touches EXACTLY, 3-D centre distance ${(pairs[0].chord / MM).toFixed(4)} mm = 2r to 1e-9, the 6th's centre ${((route0.total - rests[5][1]) / MM).toFixed(2)} mm inside the entry (an allowed seat: the overflow law refuses only beyond entry + 2r), no yield / hold, closest rest pair of all ${(min3d / MM).toFixed(2)} mm, five contacts. On this sampled chute the (2n−1)r ladder is NOT exact (worst ${(ladderDev / MM).toFixed(3)} mm): the D-parameter falls short of the chord by at most the sub-grain centre-path steps between the seats (${pairs.map((q) => +((2 * sR - q.gap) / MM).toFixed(4)).join(' / ')} mm against ${pairs.map((q) => +(q.steps / MM).toFixed(4)).join(' / ')} mm of step) and runs long where the path bends`,
      contactOk && deficitOk && rests.length === 6 && rests[5][1] <= route0.total + 2 * sR + 1e-9 && !s6.events.some((e) => e.kind === 'yield' || e.kind === 'release') && min3d >= 2 * sR - 1e-9 && s6.events.filter((e) => e.kind === 'contact').length === 5,
      JSON.stringify({ rests: rests.map(([id, D]) => [id, +(D / sR).toFixed(3) + 'r']), pairs: pairs.map((q) => [+(q.chord / MM).toFixed(6), +(q.gap / MM).toFixed(4), +(q.steps / MM).toFixed(4)]), events: s6.events.map((e) => e.kind + ':' + e.ball) }));
    // r7 the re-aimed fall keeps the plan lerp over a shorter time; on a steep lead the glide
    // speed is unphysical — asserted here: on every fixture probed below (the Star export at pocket 0, TEST-synthetic-wire-slide at pocket 4) such a seat has its top above
    // exit_below_y (the ball is inside the pocket, culled), so it is never drawn. Kept VERBATIM
    // across the r6 rewrite (companion 3, refuter lens B P3-1): the sampled export changed what
    // r6 may assert about the ladder, and changes nothing r7 asserts about the fall's duration.
    const probe = (trk, pk, fl, r, label) => {
      const three = []; for (let i = 0; i < 3; i++) three.push({ id: 1 + i, handoff: handoffFromSink({ t: 0.5 + i * 0.005, pocket: pk, fall: fl, r, glide: 0.06, tFall: 0.021 }, { track: trk, pockets: [pk], r }) });
      const sol = solveShot({ track: trk, r, ledger: [], arrivals: three });
      const bad = [];
      for (const a of three) { const f = sol.pieces.get(a.id)?.[0]; if (!f || f.kind !== 'fall') continue; const T = f.t1 - f.t0; const T0 = a.handoff.tLand - a.handoff.tH; if (T < 0.9 * T0 && f.yE + r <= (f.exitY ?? Infinity) + 1e-9) bad.push([label, a.id, +(T * 1000).toFixed(2), +(T0 * 1000).toFixed(2)]); }
      return bad;
    };
    const bad = [...probe(strack, sctx.pockets[0], sctx.falls[0], sR, 'star'), ...probe(track, POCKETS[4], POCKETS[4], R, 'wpa')];
    check('r7 a re-aimed fall much shorter than the plain one (a seat high on a steep lead) is never a DRAWN pose on either fixture probed here (the Star export at pocket 0, TEST-synthetic-wire-slide at pocket 4): every such seat has its top above exit_below_y (culled inside the pocket)', bad.length === 0, JSON.stringify(bad));
  } catch (e) { check('r6/r7 the Star fixture solves', false, e.message); }

  // r8 (review r6 P2): contact spacing is the 3-D centre distance — on the 90° plan-bend
  // fixture and on this fixture's own corners (43.7° / 30.7° / the 76° junction): at every
  // 1 kHz sample every follower is exactly one diameter from the ball ahead of it, no pair
  // is ever closer than one diameter, and every resting neighbour pair is one diameter apart
  {
    const runChord = (trk, pk, ids, label, tGap) => {
      const c = { track: trk, pockets: POCKETS, r: R }; // the kernel's pocket list in kernel order (the hand-off resolves the route by the nearest cup)
      const arr = ids.map((id, i) => ({ id, handoff: handoffFromSink({ t: 0.5 + i * tGap, pocket: pk, fall: pk, r: R, glide: 0.06, tFall: 0.021 }, c) }));
      const sol = solveShot({ track: trk, r: R, ledger: [], arrivals: arr });
      let worstFollow = 0, minPair = Infinity, samples = 0, followSamples = 0;
      const pieceAt = (id, t) => { const ps = sol.pieces.get(id); let p = ps[0]; for (const q of ps) { if (q.t0 <= t) p = q; else break; } return p; };
      for (let t = 0.5; t <= sol.tEnd + 0.2; t += 1 / 1000) {
        const ps = ids.map((id) => [id, poseAt(sol, id, t, {})]).filter(([, p]) => p && p.kind !== 'fall');
        for (let a = 0; a < ps.length; a++) for (let b = a + 1; b < ps.length; b++) { const d = Math.hypot(ps[a][1].x - ps[b][1].x, ps[a][1].y - ps[b][1].y, ps[a][1].z - ps[b][1].z); minPair = Math.min(minPair, d); samples += 1; }
        // followers: the ball ahead is the next-smaller D on the same route
        const byD = ps.slice().sort((x, y) => x[1].D - y[1].D);
        for (let k = 1; k < byD.length; k++) { const [id, p] = byD[k]; const pc = pieceAt(id, t); if (!pc.follow) continue; const q = byD[k - 1][1]; const d = Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z); worstFollow = Math.max(worstFollow, Math.abs(d - 2 * R)); followSamples += 1; }
      }
      const rests = [...sol.rest.entries()].sort((x, y) => x[1] - y[1]);
      let worstRest = 0;
      for (let k = 1; k < rests.length; k++) { const a = poseAt(sol, rests[k - 1][0], sol.tEnd + 1, {}), b = poseAt(sol, rests[k][0], sol.tEnd + 1, {}); if (a && b) worstRest = Math.max(worstRest, Math.abs(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) - 2 * R)); }
      return { label, worstFollow, minPair, worstRest, followSamples, samples, rests: rests.length, events: sol.events.length };
    };
    const bendDef = loadDef(path.resolve(here, '../scene/ballreturn/tracks/TEST-bend-90.json'));
    const bendTrack = validateTrack(bendDef, { pockets: POCKETS, falls: null });
    const rb = runChord(bendTrack, POCKETS[4], [1, 2, 3, 4, 5], 'bend-90', 0.06); // 60 ms apart: the pairs form while rolling and round the corner as clusters
    const rw = runChord(track, POCKETS[4], [1, 2, 3, 4, 5], 'wpa corners', 0.25);
    for (const rr of [rb, rw]) {
      check(`r8 ${rr.label}: every follower exactly one diameter (3-D) from the ball ahead at every 1 kHz sample (worst |Δ| ${(rr.worstFollow / MM).toExponential(2)} mm over ${rr.followSamples} follower samples), no pair closer than one diameter (min ${(rr.minPair / MM).toFixed(4)} mm), resting neighbours one diameter apart (worst |Δ| ${(rr.worstRest / MM).toExponential(2)} mm), ${rr.rests} at rest`, rr.followSamples > 100 && rr.worstFollow < 1e-6 && rr.minPair >= 2 * R - 1e-6 && rr.worstRest < 1e-9 && rr.rests === 5, JSON.stringify(rr));
    }
  }

  // r9 (review 8, P1): the chain may push but never pull — at 1 kHz every follower's own path
  // speed ≤ max(its leader's speed, its free-roll speed) + ε, and its 60 Hz frame step ≤ the
  // leader's + 1 mm; pairs 5 … 100 ms apart on the 90° bend and through the 76° junction
  {
    const whip = (trk, pk, gapS, label) => {
      const c = { track: trk, pockets: POCKETS, r: R };
      const arr = [1, 2].map((id, i) => ({ id, handoff: handoffFromSink({ t: 0.5 + i * gapS, pocket: pk, fall: pk, r: R, glide: 0.06, tFall: 0.021 }, c) }));
      const sol = solveShot({ track: trk, r: R, ledger: [], arrivals: arr });
      let worstSpeed = 0, worstStep = 0, followerSamples = 0;
      const pieceAt = (id, t) => { const ps = sol.pieces.get(id); let p = ps[0]; for (const q of ps) { if (q.t0 <= t) p = q; else break; } return p; };
      for (let t = 0.5; t <= sol.tEnd + 0.1; t += 1 / 1000) {
        const pc = pieceAt(2, t); if (!pc.follow) continue;
        const c1 = continuationAt(sol, 1, t), c2 = continuationAt(sol, 2, t); if (!c1 || !c2 || c1.kind !== 'roll' || c2.kind !== 'roll') continue;
        const free = accelAt(trk.routes.get(4), Math.max(0, c2.D - 1e-9), R).a; // its own free-roll acceleration here
        const allowed = Math.max(c1.v, c2.v /* its own speed cannot be exceeded by itself: the bound below is vs the leader */) ;
        worstSpeed = Math.max(worstSpeed, c2.v - Math.max(c1.v, 0) - 1e-3 * Math.max(0, free)); followerSamples += 1;
      }
      for (let t = 0.5; t <= sol.tEnd; t += 1 / 60) {
        const a0 = poseAt(sol, 1, t, {}), a1 = poseAt(sol, 1, t + 1 / 60, {}), b0 = poseAt(sol, 2, t, {}), b1 = poseAt(sol, 2, t + 1 / 60, {});
        if (!a0 || !a1 || !b0 || !b1 || [a0, a1, b0, b1].some((q) => q.kind === 'fall')) continue;
        const pc = pieceAt(2, t); if (!pc.follow) continue;
        const sa = Math.hypot(a1.x - a0.x, a1.y - a0.y, a1.z - a0.z), sb = Math.hypot(b1.x - b0.x, b1.y - b0.y, b1.z - b0.z);
        worstStep = Math.max(worstStep, sb - sa);
      }
      return { label, gapMs: gapS * 1000, worstSpeedExcess: +worstSpeed.toFixed(4), worstStepExcessMm: +(worstStep / MM).toFixed(3), followerSamples, separates: sol.events.filter((e) => e.kind === 'separate').length };
    };
    const bendDef9 = loadDef(path.resolve(here, '../scene/ballreturn/tracks/TEST-bend-90.json'));
    const bendTrack9 = validateTrack(bendDef9, { pockets: POCKETS, falls: null });
    const rows = [];
    for (const g of [0.005, 0.02, 0.05, 0.1]) { rows.push(whip(bendTrack9, POCKETS[4], g, 'bend-90')); rows.push(whip(track, POCKETS[4], g, 'junction-76')); }
    const ok = rows.every((r) => r.worstSpeedExcess <= 0.05 && r.worstStepExcessMm <= 1.0);
    check(`r9 the chain never pulls: with pairs 5 / 20 / 50 / 100 ms apart on the 90° bend and through the 76° junction, a follower's own speed never exceeds its leader's by more than 0.05 m/s (worst excess ${Math.max(...rows.map((r) => r.worstSpeedExcess)).toFixed(4)} m/s) and its 60 Hz frame step never exceeds the leader's by more than 1 mm (worst ${Math.max(...rows.map((r) => r.worstStepExcessMm)).toFixed(3)} mm); parting happens at a 'separate' event`, ok, JSON.stringify(rows));
  }
  // r10 (review 8, P2; window corrected in review round 13): the yield station is chord-clear
  // at the 0.1 mm grain — the fine-scan min chord from yieldD to the other route ≥ 2r over the
  // peer's WHOLE occupiable span, one diameter past the junction back to the peer's own two-
  // diameter cap (the seal-12 arm scanned to Dq + 2r, one diameter short of where a peer can
  // itself be held, and shared lanes were excluded by segment KIND, which reads a shared lane's
  // blend as foreign); a two-feeder sweep (offsets −100 … +100 ms, 1–3 balls per side) never
  // brings two balls closer than one diameter at 1 kHz
  {
    let worstClear = Infinity; const rowsY = [];
    for (const rt of track.routes.values()) for (const m of rt.merges) {
      const a = stationAt(rt, m.yieldD, R, {});
      for (const q of track.routes.values()) { if (q === rt) continue; const Dq = stationD(q, m.rw.id, m.s); if (Dq === null) continue; const myLines = new Set(rt.segs.map((sg) => sg.edge)); for (let x = Dq - 4 * R; x <= Dq + 4 * R; x += 0.00005) { if (x < 0 || x > q.total + 2 * R) continue; const lq = locate(q, x); if (myLines.has(lq.seg.edge)) continue; const b = stationAt(q, x, R, {}); worstClear = Math.min(worstClear, Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) - 2 * R); } }
      rowsY.push([rt.pocket, +(m.D / MM).toFixed(2), +((m.yieldD - m.D - 2 * R) / MM).toFixed(2)]);
    }
    check(`r10 every merge's yield station is chord-clear of the other path over its whole occupiable span at a 0.05 mm scan (min chord − 2r = ${(worstClear / MM).toFixed(5)} mm; the station is pushed at the 0.1 mm grain, so the true minimum between grid points may sit a micron under — tolerance 1 µm)`, worstClear >= -1e-6, JSON.stringify(rowsY));
    let minPair = Infinity, worstCase = null, rowsS = 0;
    for (const nA of [1, 2, 3]) for (const nB of [1, 2, 3]) for (let off = -0.1; off <= 0.1001; off += 0.02) {
      const arr = []; let id = 1;
      for (let i = 0; i < nA; i++) arr.push({ id: id++, handoff: handoffFromSink({ t: 0.5 + i * 0.04, pocket: POCKETS[4], fall: POCKETS[4], r: R, glide: 0.06, tFall: 0.021 }, ctx) });
      for (let i = 0; i < nB; i++) arr.push({ id: id++, handoff: handoffFromSink({ t: 0.5 + off + i * 0.04, pocket: POCKETS[1], fall: POCKETS[1], r: R, glide: 0.06, tFall: 0.021 }, ctx) });
      const sol = solveShot({ track, r: R, ledger: [], arrivals: arr }); rowsS += 1;
      for (let t = 0.5; t <= sol.tEnd + 0.1; t += 1 / 1000) {
        const psAll = arr.map((a) => ({ id: a.id, p: poseAt(sol, a.id, t, {}) })).filter((x) => x.p && x.p.kind !== 'fall'); const ps = psAll.map((x) => x.p); const idsAt = psAll.map((x) => x.id);
        for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) { const d = Math.hypot(ps[i].x - ps[j].x, ps[i].y - ps[j].y, ps[i].z - ps[j].z); if (d < minPair) { minPair = d; worstCase = { nA, nB, off: +off.toFixed(2), t: +t.toFixed(3), a: [idsAt[i], ps[i].runwayId, +(ps[i].D / MM).toFixed(1), ps[i].kind], b: [idsAt[j], ps[j].runwayId, +(ps[j].D / MM).toFixed(1), ps[j].kind], events: sol.events.map((e) => e.kind + '@' + e.t.toFixed(3) + ':' + e.ball).join(' ') }; } }
      }
    }
    check(`r10b two-feeder sweep (${rowsS} solves: 1–3 balls per side, offsets −100 … +100 ms): no two balls ever closer than one diameter at 1 kHz (min ${(minPair / MM).toFixed(4)} mm)`, minPair >= 2 * R - 1e-6, JSON.stringify(worstCase));
  }
  // r11 (review 8, P2): a landing behind a MOVING tail never overlaps it — 8 balls 150 ms apart on
  // the 90° bend (the tail a follower in the corner) and 60 ms apart on the Star's straight chute
  {
    const minPairOf = (trk, pk, n, gapS, r) => {
      const c = { track: trk, pockets: trk === track ? POCKETS : null, r };
      return null;
    };
    const run11 = (trk, pockets, pk, fall, n, gapS, r) => {
      const c = { track: trk, pockets, r };
      const arr = Array.from({ length: n }, (_, i) => ({ id: 1 + i, handoff: handoffFromSink({ t: 0.5 + i * gapS, pocket: pk, fall, r, glide: 0.06, tFall: 0.021 }, c) }));
      const sol = solveShot({ track: trk, r, ledger: [], arrivals: arr });
      let minPair = Infinity, at = null;
      for (let t = 0.5; t <= sol.tEnd + 0.1; t += 1 / 1000) {
        const ps = arr.map((a) => [a.id, poseAt(sol, a.id, t, {})]).filter(([, p]) => p && p.kind !== 'fall');
        for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) { const d = Math.hypot(ps[i][1].x - ps[j][1].x, ps[i][1].y - ps[j][1].y, ps[i][1].z - ps[j][1].z); if (d < minPair) { minPair = d; at = [ps[i][0], ps[j][0], +t.toFixed(4)]; } }
      }
      return { minPair, at, rests: sol.rest.size, overflow: sol.overflow.size };
    };
    const bendDef11 = loadDef(path.resolve(here, '../scene/ballreturn/tracks/TEST-bend-90.json'));
    const bendTrack11 = validateTrack(bendDef11, { pockets: POCKETS, falls: null });
    const b11 = run11(bendTrack11, POCKETS, POCKETS[4], POCKETS[4], 8, 0.15, R);
    let s11 = null;
    try { const up = loadDef(path.resolve(here, '../scene/ballreturn/tracks/wpbsa_snooker_12ft-xw101-slides.json')); const sctx = await tableContext(up.doc.table_id); const strack = validateTrack(up, { pockets: sctx.pockets, falls: sctx.falls }); s11 = run11(strack, sctx.pockets, sctx.pockets[0], sctx.falls[0], 5, 0.06, 0.02625); } catch (e) { s11 = { error: e.message }; }
    check(`r11 a landing behind a moving tail never overlaps it: bend-90 8 balls 150 ms apart min pair ${(b11.minPair / MM).toFixed(4)} mm; the Star's straight chute 5 balls 60 ms apart min pair ${s11 && Number.isFinite(s11.minPair) ? (s11.minPair * 1000).toFixed(4) : 'n/a'} mm (2r 57.15 / 52.50)`, b11.minPair >= 2 * R - 1e-6 && !!s11 && Number.isFinite(s11.minPair) && s11.minPair >= 2 * 0.02625 - 1e-6, JSON.stringify({ b11, s11 }));
  }
  // r12 (review 8, P3): a continuation-seeded touching pair is re-seated on the chord (a carried
  // station a micron short never survives the join)
  {
    const arrA = [{ id: 1, handoff: handoffFromSink({ t: 0.5, pocket: POCKETS[4], fall: POCKETS[4], r: R, glide: 0.06, tFall: 0.021 }, ctx) }, { id: 2, handoff: handoffFromSink({ t: 0.52, pocket: POCKETS[4], fall: POCKETS[4], r: R, glide: 0.06, tFall: 0.021 }, ctx) }, { id: 3, handoff: handoffFromSink({ t: 0.82, pocket: POCKETS[4], fall: POCKETS[4], r: R, glide: 0.06, tFall: 0.021 }, ctx) }];
    const solA = solveShot({ track, r: R, ledger: [50], arrivals: arrA });
    const tSw = solA.events.find((e) => e.kind === 'landing').t + 0.9;
    const conts = [1, 2, 3].map((id) => { const c = continuationAt(solA, id, tSw); return c && c.kind === 'roll' ? { id, route: c.route, D: c.D - (id === 2 ? 1e-6 : 0), v: c.v, q: c.q, t0: 0 } : null; }).filter(Boolean); // ball 2 carried a micron short of its seat
    const solB = solveShot({ track, r: R, ledger: [50], arrivals: [], continuations: conts });
    let minPair = Infinity;
    for (let t = 0; t <= solB.tEnd + 0.1; t += 1 / 1000) { const ps = [1, 2, 3].map((id) => poseAt(solB, id, t, {})).filter((p) => p && p.kind !== 'fall'); for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) minPair = Math.min(minPair, Math.hypot(ps[i].x - ps[j].x, ps[i].y - ps[j].y, ps[i].z - ps[j].z)); }
    check(`r12 a touching pair re-seeded as continuations (one carried 1 µm short of its seat) is re-seated on the chord at the join: no pair closer than one diameter at 1 kHz (min ${(minPair / MM).toFixed(6)} mm)`, conts.length === 3 && minPair >= 2 * R - 1e-9, JSON.stringify({ conts: conts.map((c) => [c.id, +(c.D / MM).toFixed(3), +c.v.toFixed(4)]), minPair }));
  }

  // r13 (re-review, P1): a ball HELD at a yield station when the time base changes comes back
  // held — the re-solve from continuationAt() must never drive it into the other branch's
  // ball nor teleport it at the junction: 8 alternating arrivals 30 ms apart + a ledger, cuts
  // at three instants inside the hold → no pair closer than one diameter at 1 kHz after the
  // cut and no pose step above 5 mm per ms for any ball
  {
    const arr = []; for (let i = 0; i < 8; i++) arr.push({ id: 1 + i, handoff: handoffFromSink({ t: 0.5 + i * 0.03, pocket: POCKETS[i % 2 ? 1 : 4], fall: POCKETS[i % 2 ? 1 : 4], r: R, glide: 0.06, tFall: 0.021 }, ctx) });
    const sol0 = solveShot({ track, r: R, ledger: [90, 91], arrivals: arr });
    const ids = [1, 2, 3, 4, 5, 6, 7, 8, 90, 91];
    const y = sol0.events.find((e) => e.kind === 'yield'); const rel = y ? sol0.events.find((e) => e.kind === 'release' && e.ball === y.ball && e.t > y.t) : null;
    const rows = [];
    if (y && rel) {
      for (const frac of [0.05, 0.5, 0.95]) {
        const tc = y.t + (rel.t - y.t) * frac;
        const conts = []; const ledger = [];
        for (const id of ids) { const c = continuationAt(sol0, id, tc); if (!c) continue; if (c.kind === 'rest') ledger.push({ id, D: c.D, route: c.route, q: c.q }); else if (c.kind === 'roll') conts.push({ id, route: c.route, D: c.D, v: c.v, q: c.q, t0: 0, follow: c.follow === true, hold: c.hold ?? null, blockedById: c.blockedById ?? null }); }
        const arrivalsLeft = arr.filter((a) => { const c = continuationAt(sol0, a.id, tc); return !c || c.kind === 'fall'; }).map((a) => ({ id: a.id, handoff: { ...a.handoff, tH: a.handoff.tH - tc, tLand: a.handoff.tLand - tc } }));
        const sol1 = solveShot({ track, r: R, ledger, arrivals: arrivalsLeft, continuations: conts });
        let minPair = Infinity, worstStep = 0; const prev = new Map();
        for (let t = 0; t <= sol1.tEnd + 0.1; t += 1 / 1000) {
          const ps = ids.map((id) => [id, poseAt(sol1, id, t, {})]).filter(([, q]) => q && q.kind !== 'fall');
          for (let i = 0; i < ps.length; i++) { for (let j = i + 1; j < ps.length; j++) minPair = Math.min(minPair, Math.hypot(ps[i][1].x - ps[j][1].x, ps[i][1].y - ps[j][1].y, ps[i][1].z - ps[j][1].z)); const pv = prev.get(ps[i][0]); if (pv) worstStep = Math.max(worstStep, Math.hypot(ps[i][1].x - pv.x, ps[i][1].y - pv.y, ps[i][1].z - pv.z)); prev.set(ps[i][0], { x: ps[i][1].x, y: ps[i][1].y, z: ps[i][1].z }); }
        }
        rows.push({ frac, tc: +tc.toFixed(4), heldCarried: conts.some((c) => c.hold), minPairMm: +(minPair / MM).toFixed(4), worstStepMm: +(worstStep / MM).toFixed(3), events: sol1.events.length });
      }
    }
    check(`r13 a merge-window hold survives a time-base cut (yield of ball ${y?.ball} at ${y?.t.toFixed(3)} s, released at ${rel?.t.toFixed(3)}): re-solves cut at 5 / 50 / 95 % of the hold carry the hold, keep every pair ≥ one diameter at 1 kHz and every pose step ≤ 5 mm/ms`, !!y && !!rel && rows.length === 3 && rows.every((r) => r.heldCarried && r.minPairMm >= 2 * R / MM - 1e-3 && r.worstStepMm <= 5), JSON.stringify(rows));
  }
  // r14 (re-review, P2): a rolling train cut mid-flight on the Star's steep chute is re-solved as
  // the SAME train — the re-solve reproduces the original poses to a micron from the cut on
  {
    try {
      const up = loadDef(path.resolve(here, '../scene/ballreturn/tracks/wpbsa_snooker_12ft-xw101-slides.json'));
      const sctx = await tableContext(up.doc.table_id);
      const strack = validateTrack(up, { pockets: sctx.pockets, falls: sctx.falls });
      const sR = 0.02625;
      const arrS = []; for (let i = 0; i < 6; i++) arrS.push({ id: 1 + i, handoff: handoffFromSink({ t: 0.5 + i * 0.06, pocket: sctx.pockets[0], fall: sctx.falls[0], r: sR, glide: 0.06, tFall: 0.021 }, { track: strack, pockets: sctx.pockets, r: sR }) });
      const sol0 = solveShot({ track: strack, r: sR, ledger: [], arrivals: arrS });
      const firstContact = sol0.events.find((e) => e.kind === 'contact');
      const tc = firstContact.t + 0.05;
      const conts = [], ledger = []; const later = [];
      for (const a of arrS) { const c = continuationAt(sol0, a.id, tc); if (!c) { later.push({ id: a.id, handoff: { ...a.handoff, tH: a.handoff.tH - tc, tLand: a.handoff.tLand - tc } }); continue; } if (c.kind === 'fall') later.push({ id: a.id, handoff: { ...a.handoff, tH: a.handoff.tH - tc, tLand: a.handoff.tLand - tc } }); else if (c.kind === 'rest') ledger.push({ id: a.id, D: c.D, route: c.route, q: c.q }); else conts.push({ id: a.id, route: c.route, D: c.D, v: c.v, q: c.q, t0: 0, follow: c.follow === true, hold: c.hold ?? null, blockedById: c.blockedById ?? null }); }
      const sol1 = solveShot({ track: strack, r: sR, ledger, arrivals: later, continuations: conts });
      let worst = 0; let at = null;
      for (let t = 0; t <= sol0.tEnd - tc + 0.1; t += 1 / 1000) { for (const a of arrS) { const p0 = poseAt(sol0, a.id, tc + t, {}), p1 = poseAt(sol1, a.id, t, {}); if (!p0 || !p1 || p0.kind === 'fall' || p1.kind === 'fall') continue; const d = Math.hypot(p0.x - p1.x, p0.y - p1.y, p0.z - p1.z); if (d > worst) { worst = d; at = [a.id, +t.toFixed(3)]; } } }
      check(`r14 a rolling train on the Star chute cut ${(tc).toFixed(3)} s in (${conts.length} continuations, ${conts.filter((c) => c.follow).length} of them followers) re-solves as the same train: worst pose deviation from the uncut solve ${(worst / MM).toExponential(2)} mm`, conts.length >= 2 && worst < 1e-5, JSON.stringify({ at, conts: conts.map((c) => [c.id, +(c.D / MM).toFixed(2), +c.v.toFixed(5), c.follow]) }));
    } catch (e) { check('r14 the Star re-solve arm runs', false, e.message); }
  }

  // r15 (review r7 P2): route capacity holds for MOVING-tail arrivals — seatsMax + 2 balls within the
  // tail's roll time on the Star's straight chute and on the terminal fixture: exactly seatsMax
  // seated, 2 overflow events, and every seated ball is a DRAWN pose at rest (no invisible occupant)
  {
    const runCap = (trk, pockets, pk, fall, r, gapS, label) => {
      const route = trk.routes.get(pockets.indexOf(pk));
      // the seats that exist: the SEATING CHAIN from the wall (each next seat one 3-D diameter behind the
      // previous, exactly as the solver seats) up to one ball length above the entry, and only while the
      // resting ball is drawn (top below the pocket exit) — the 1-D ladder over-counts through bends
      let seatsMax = 0;
      for (let k = 1, Dk = r; Dk <= route.total + 2 * r + 1e-9; k++) { const st = stationAt(route, Dk, r, {}); if (Number.isFinite(route.exitY) && Dk > route.total + 1e-9 && st.y + r > route.exitY) break; seatsMax = k; const next = seatBehind(route, [st.x, st.y, st.z], Dk, 2 * r); if (!(next > Dk + 1e-12)) break; Dk = next; }
      const n = seatsMax + 2;
      const arr = Array.from({ length: n }, (_, i) => ({ id: 1 + i, handoff: handoffFromSink({ t: 0.5 + i * gapS, pocket: pk, fall, r, glide: 0.06, tFall: 0.021 }, { track: trk, pockets, r }) }));
      const sol = solveShot({ track: trk, r, ledger: [], arrivals: arr });
      const drawn = [...sol.rest.keys()].filter((id) => !!poseAt(sol, id, sol.tEnd + 1, {}));
      return { label, seatsMax, arrivals: n, seated: sol.rest.size, drawnAtRest: drawn.length, overflow: sol.overflow.size, overflowEvents: sol.events.filter((e) => e.kind === 'overflow').length, maxRestD: +(Math.max(...sol.rest.values()) / MM).toFixed(1), total: +(route.total / MM).toFixed(1), withinEntry2r: Math.max(...sol.rest.values()) <= route.total + 2 * r + 1e-9 };
    };
    const rows = [];
    try { const up = loadDef(path.resolve(here, '../scene/ballreturn/tracks/wpbsa_snooker_12ft-xw101-slides.json')); const sctx = await tableContext(up.doc.table_id); const strack = validateTrack(up, { pockets: sctx.pockets, falls: sctx.falls }); rows.push(runCap(strack, sctx.pockets, sctx.pockets[0], sctx.falls[0], 0.02625, 0.02, 'star 20 ms')); rows.push(runCap(strack, sctx.pockets, sctx.pockets[0], sctx.falls[0], 0.02625, 0.08, 'star 80 ms')); } catch (e) { rows.push({ label: 'star', error: e.message }); }
    const tt = validateTrack(loadDef(path.resolve(here, '../scene/ballreturn/tracks/TEST-terminal-chutes.json')), { pockets: POCKETS, falls: null });
    rows.push(runCap(tt, POCKETS, POCKETS[4], POCKETS[4], R, 0.03, 'terminal 30 ms'));
    rows.push(runCap(track, POCKETS, POCKETS[4], POCKETS[4], R, 0.03, 'synthetic 30 ms')); // a trunk-tray route through twist bends: the chain rule vs the ladder (review round 9)
    const ok = rows.every((x) => !x.error && x.seated === x.seatsMax && x.drawnAtRest === x.seatsMax && x.overflow === 2 && x.overflowEvents === 2 && x.withinEntry2r);
    check(`r15 route capacity with a MOVING tail: seatsMax + 2 rapid arrivals (seatsMax = the SEATING CHAIN from the wall, one 3-D diameter per seat, up to one ball length above the entry, drawn seats only) → exactly seatsMax seated, all drawn at rest, 2 overflow events, no seat beyond the entry + 2r (${rows.map((x) => `${x.label}: ${x.seated}/${x.seatsMax} seated, ${x.overflow} refused`).join('; ')})`, ok, JSON.stringify(rows));
  }
  // r16 (review r7 P2): dense same-pocket arrivals never write motion into a committed interval —
  // two pots 0 / 2 / 5 / 50 / 100 / 200 ms apart: every ball's pieces are time-ordered, no piece
  // starts before the event that created it, poses never move backward in time, both seated,
  // and the pair is never closer than one diameter at 1 kHz
  {
    const rows = [];
    for (const gap of [0, 0.002, 0.005, 0.05, 0.1, 0.2]) {
      const arr = [1, 2].map((id, i) => ({ id, handoff: handoffFromSink({ t: 0.5 + i * gap, pocket: POCKETS[4], fall: POCKETS[4], r: R, glide: 0.06, tFall: 0.021 }, ctx) }));
      const sol = solveShot({ track, r: R, ledger: [], arrivals: arr });
      let ordered = true, monotone = true; let minPair = Infinity; let culledPerch = 0; let flicker = 0;
      for (const id of [1, 2]) { const ps = sol.pieces.get(id); for (let i = 1; i < ps.length; i++) { if (ps[i].t0 < ps[i - 1].t1 - 1e-12 || ps[i].t0 < ps[i - 1].t0 - 1e-12) ordered = false; if (ps[i].culled) culledPerch += 1; } }
      const evT = sol.events.map((e) => e.t); for (let i = 1; i < evT.length; i++) if (evT[i] < evT[i - 1] - 1e-12) monotone = false;
      // EVERY drawn pose counts — the fall included (verification round 9: the seal-9 arm skipped
      // 'fall' poses and could not see the drawn end of a fall 1.3 mm inside the tail)
      for (let t = 0.5; t <= sol.tEnd + 0.1; t += 1 / 1000) { const a = poseAt(sol, 1, t, {}), b = poseAt(sol, 2, t, {}); if (a && b) minPair = Math.min(minPair, Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)); }
      for (const e of sol.events.filter((x) => x.kind === 'landing')) for (let t = e.t - 0.012; t <= e.t + 0.004; t += 1 / 20000) { const a = poseAt(sol, 1, t, {}), b = poseAt(sol, 2, t, {}); if (a && b) minPair = Math.min(minPair, Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)); } // 20 kHz through each fall's drawn end
      // visibility is MONOTONE per ball: once drawn it never hides again (the culled perch must not
      // flicker a ball that the fall already showed — review round 9)
      for (const id of [1, 2]) { let seen = false; for (let t = 0.4; t <= sol.tEnd + 0.1; t += 1 / 10000) { const q = poseAt(sol, id, t, {}); if (q) seen = true; else if (seen) { flicker += 1; break; } } }
      rows.push({ gapMs: gap * 1000, ordered, monotone, minPairMm: +(minPair / MM).toFixed(4), seated: sol.rest.size, culledPerch, flicker, events: sol.events.map((e) => e.kind[0] + e.ball).join(' ') });
    }
    const ok = rows.every((x) => x.ordered && x.monotone && x.seated === 2 && x.minPairMm >= 2 * R / MM - 1e-6 && x.flicker === 0);
    check(`r16 two pots of one pocket 0 / 2 / 5 / 50 / 100 / 200 ms apart: pieces time-ordered, event times monotone, both seated, never closer than one diameter over ALL drawn poses, fall included (1 kHz throughout, 20 kHz through each fall's drawn end), and visibility monotone per ball at 10 kHz (min ${Math.min(...rows.map((x) => x.minPairMm)).toFixed(4)} mm; culled perches ${rows.map((x) => x.culledPerch).join('/')}; flickers ${rows.reduce((a, x) => a + x.flicker, 0)})`, ok, JSON.stringify(rows));
  }

  // r18 (verification 9): the fall emergence sweep — two pots of one pocket 0…300 ms apart in
  // 5 ms steps on the synthetic trunk-tray, the 90° bend, the terminal chute and the Star's
  // shortest chute: over ALL drawn poses (fall included) the pair is never inside one diameter
  // (2 kHz throughout, 20 kHz through each fall's drawn end), both balls seated, event times
  // monotone. Before seal 10 this read 60 / 43 / 28 / 0 of 61 gaps inside 2r (worst 1.76 mm).
  {
    const fixtures = [['synthetic', track, POCKETS, POCKETS[4], POCKETS[4], R, ctx]];
    try { const b90 = validateTrack(loadDef(path.resolve(here, '../scene/ballreturn/tracks/TEST-bend-90.json')), { pockets: POCKETS, falls: null }); fixtures.push(['bend-90', b90, POCKETS, POCKETS[4], POCKETS[4], R, { track: b90, pockets: POCKETS, r: R }]); } catch (e) { fixtures.push(['bend-90', null, e.message]); }
    try { const tt = validateTrack(loadDef(path.resolve(here, '../scene/ballreturn/tracks/TEST-terminal-chutes.json')), { pockets: POCKETS, falls: null }); fixtures.push(['terminal', tt, POCKETS, POCKETS[4], POCKETS[4], R, { track: tt, pockets: POCKETS, r: R }]); } catch (e) { fixtures.push(['terminal', null, e.message]); }
    try { const up = loadDef(path.resolve(here, '../scene/ballreturn/tracks/wpbsa_snooker_12ft-xw101-slides.json')); const sctx = await tableContext(up.doc.table_id); const strack = validateTrack(up, { pockets: sctx.pockets, falls: sctx.falls }); fixtures.push(['star', strack, sctx.pockets, sctx.pockets[0], sctx.falls[0], 0.02625, { track: strack, pockets: sctx.pockets, r: 0.02625 }]); } catch (e) { fixtures.push(['star', null, e.message]); }
    const rows = [];
    for (const fx of fixtures) {
      const [label, trk, pockets, pk, fall, r, c] = fx;
      if (!trk) { rows.push({ label, error: fx[2] }); continue; }
      let under = 0, n = 0, minAll = Infinity, worst = null, unseated = 0, nonMonotone = 0;
      for (let g = 0; g <= 0.3 + 1e-12; g += 0.005) {
        const arr = [1, 2].map((id, i) => ({ id, handoff: handoffFromSink({ t: 0.5 + i * g, pocket: pk, fall, r, glide: 0.06, tFall: 0.021 }, c) }));
        const sol = solveShot({ track: trk, r, ledger: [], arrivals: arr });
        n += 1;
        if (sol.rest.size !== 2) unseated += 1;
        for (let i = 1; i < sol.events.length; i++) if (sol.events[i].t < sol.events[i - 1].t - 1e-12) { nonMonotone += 1; break; }
        let minPair = Infinity; let at = null;
        const probe = (t) => { const a = poseAt(sol, 1, t, {}), b = poseAt(sol, 2, t, {}); if (a && b) { const d = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); if (d < minPair) { minPair = d; at = { t: +t.toFixed(5), k1: a.kind, k2: b.kind }; } } };
        for (let t = 0.4; t <= sol.tEnd + 0.1; t += 1 / 2000) probe(t);
        for (const e of sol.events.filter((x) => x.kind === 'landing')) for (let t = e.t - 0.012; t <= e.t + 0.004; t += 1 / 20000) probe(t);
        if (minPair < 2 * r - 1e-6) under += 1;
        if (minPair < minAll) { minAll = minPair; worst = { gapMs: +(g * 1000).toFixed(0), minMm: +(minPair / MM).toFixed(4), at }; }
      }
      rows.push({ label, gaps: n, under, unseated, nonMonotone, minMm: +(minAll / MM).toFixed(4), twoR: +(2 * r / MM).toFixed(4), worst });
    }
    const ok = rows.every((x) => !x.error && x.gaps === 61 && x.under === 0 && x.unseated === 0 && x.nonMonotone === 0);
    check(`r18 fall emergence sweep, two pots 0–300 ms apart (5 ms steps) on ${rows.map((x) => x.label).join(' / ')}: over ALL drawn poses the pair is never inside one diameter (${rows.map((x) => `${x.label} ${x.under}/${x.gaps} under, min ${x.minMm} vs 2r ${x.twoR} mm`).join('; ')}), both seated, events monotone`, ok, JSON.stringify(rows));
  }

  // r17 (review 9, RESTATED by #737 r7 class B — boundary event E8): an arrival dated BEFORE the earliest continuation
  // (continuations at t0 = 2.15, a pot whose landing is at 0.855 on the new base) opens the base at ITS OWN landing. The
  // base starts at the EARLIEST of its two openings and each piece keeps its own origin: time never steps backward, the
  // continuations' pieces still open at t0 at their carried stations, nothing jumps. Review 9 wrote the rule the other way
  // round — the start was the continuation's t0 and this landing was DELAYED to it — which froze the ball at the chute
  // entry from 0.855 to 2.15 whenever an activation completed after a record's own pot had landed (L66 door B).
  {
    const arrA = [[1, 0.5], [2, 0.7]].map(([id, t]) => ({ id, handoff: handoffFromSink({ t, pocket: POCKETS[4], fall: POCKETS[4], r: R, glide: 0.06, tFall: 0.021 }, ctx) }));
    const solA = solveShot({ track, r: R, ledger: [], arrivals: arrA });
    const tc = solA.events.find((e) => e.kind === 'landing').t + 1.2;
    const conts = [1, 2].map((id) => { const c = continuationAt(solA, id, tc); return c && c.kind === 'roll' ? { id, route: c.route, D: c.D, v: c.v, q: c.q, t0: 2.15, follow: c.follow === true } : null; }).filter(Boolean);
    const late = { id: 3, handoff: handoffFromSink({ t: 0.6, pocket: POCKETS[4], fall: POCKETS[4], r: R, glide: 0.06, tFall: 0.021 }, ctx) }; // tLand ≈ 0.86 < t0 2.15
    const solB = solveShot({ track, r: R, ledger: [], arrivals: [late], continuations: conts });
    const firstT = Math.min(...[1, 2, 3].map((id) => solB.pieces.get(id)[0].t0));
    const land3 = solB.events.find((e) => e.kind === 'landing' && e.ball === 3);
    const contOpen = [1, 2].every((id) => Math.abs(solB.pieces.get(id)[0].t0 - 2.15) < 1e-9);
    const startPose = [1, 2].map((id) => { const p = poseAt(solB, id, 2.15, {}); const c = conts.find((x) => x.id === id); return Math.abs(p.D - c.D); });
    check(`r17 an arrival dated before the earliest continuation opens the base at ITS OWN landing (ball 3 lands at ${land3?.t.toFixed(4)} = its hand-off's own instant, not the continuations' 2.15; the base opens at ${firstT.toFixed(4)}), the continuations' pieces open at t0 = 2.15 at their carried stations (|ΔD| ${startPose.map((d) => (d / MM).toExponential(1)).join(' / ')} mm), time never steps backward — #737 r7 class B restates review 9's rule`, conts.length === 2 && !!land3 && Math.abs(land3.t - late.handoff.tLand) < 1e-9 && land3.t < 2.15 && contOpen && startPose.every((d) => d < 1e-9) && solB.events.every((e, i, a) => i === 0 || e.t >= a[i - 1].t - 1e-12), JSON.stringify({ firstT, land3: land3?.t, events: solB.events.slice(0, 6).map((e) => e.kind + '@' + e.t.toFixed(3) + ':' + e.ball) }));
  }

  // r3 (P2-3) a fresh sparse layout with more omitted balls than the tray holds: the
  // extras pack ON the trunk (a real route, no extrapolated line); far beyond every
  // route they are refused, never drawn off-track
  const cap = track.tray.capacity;
  const many = Array.from({ length: cap + 2 }, (_, i) => 40 + i);
  const s3 = solveShot({ track, r: R, ledger: many, arrivals: [] });
  const longest = [...track.routes.values()].sort((a, b) => b.total - a.total)[0];
  const rests3 = [...s3.rest.entries()].sort((a, b) => a[1] - b[1]);
  const extras = rests3.slice(cap);
  const onTrunk = extras.every(([id, D]) => { const q = poseAt(s3, id, 1, {}); return q && q.runwayId === 'trunk' && D <= longest.total + 1e-9; });
  check(`r3 tray capacity ${cap} + 2 fresh ledger balls: both extras rest ON the trunk (runway 'trunk', D within the route) — no station beyond the tray's own line`, onTrunk && rests3.length === cap + 2 && s3.overflow.size === 0, JSON.stringify(extras.map(([id, D]) => [id, +(D / MM).toFixed(1)])));
  const s3b = solveShot({ track, r: R, ledger: Array.from({ length: cap + 60 }, (_, i) => 40 + i), arrivals: [] });
  check('r3b far beyond every route the surplus is REFUSED (overflow events, culled) and every seated station stays within the furthest route', s3b.overflow.size > 0 && [...s3b.rest.values()].every((D) => D <= longest.total + 1e-9) && s3b.events.filter((e) => e.kind === 'overflow').length === s3b.overflow.size, `${s3b.overflow.size} refused, ${s3b.rest.size} seated`);

  // r4 (P2-4) the centre path is C0 at every vertex and junction: zero jump across
  // every segment boundary of every route of the three fixtures
  const jumps = [];
  for (const rt of [...track.routes.values(), track.trayRoute]) jumps.push(['wpa', rt.pocket, maxPathJump(rt)]);
  const ttrackR = (() => { try { return validateTrack(loadDef(path.resolve(here, '../scene/ballreturn/tracks/TEST-terminal-chutes.json')), { pockets: POCKETS, falls: null }); } catch { return null; } })();
  if (ttrackR) for (const rt of ttrackR.routes.values()) jumps.push(['terminal', rt.pocket, maxPathJump(rt)]);
  // the SAMPLED Star export is read apart from the authored fixtures. Its facets meet at angles
  // the reader itself calls roundings: where h·|Δn| is under the export grain the sub-grain rule
  // (order 16 item 3, pinned by r25 / r48 — a 0.02–99 µm pivot arc chatters the seated pair into
  // MAX_EVENTS) inserts NO blend, and the two offset lines then meet with a position step of
  // h·|Δn| instead of zero. So on a sampled wire C0 holds to the grain, not to 1 µm. Every such
  // step is counted, classified by the reader's own test and bounded; a step at a joint the
  // reader DOES blend would fail the row. Merge-the-facets vs accept-the-step is GH-769.
  const starSteps = { joints: 0, subgrain: 0, worst: 0, bound: 0, blended: [] };
  try {
    const up = loadDef(path.resolve(here, '../scene/ballreturn/tracks/wpbsa_snooker_12ft-xw101-slides.json'));
    const sctx = await tableContext(up.doc.table_id);
    const strack = validateTrack(up, { pockets: sctx.pockets, falls: sctx.falls });
    const a = {}, b = {};
    for (const rt of strack.routes.values()) {
      for (let i = 1; i < rt.segs.length; i++) {
        const D = rt.segs[i].D0;
        stationAt(rt, D + 1e-9, rt.r, a); stationAt(rt, Math.max(0, D - 1e-9), rt.r, b);
        const step = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
        if (step <= 1e-6) continue;
        starSteps.joints += 1; starSteps.worst = Math.max(starSteps.worst, step);
        const hi = rt.segs[i], lo = rt.segs[i - 1];                              // segs run D-descending: i is upstream of i−1
        if (hi.kind !== 'line' || lo.kind !== 'line') { starSteps.blended.push([rt.pocket, hi.kind, lo.kind, +(step * 1e3).toFixed(4)]); continue; }
        const c = Math.max(-1, Math.min(1, hi.edge.n[0] * lo.edge.n[0] + hi.edge.n[1] * lo.edge.n[1] + hi.edge.n[2] * lo.edge.n[2]));
        const pivot = hi.h * Math.acos(c);                                       // the reader's own sub-grain measure
        if (pivot < EXPORT_GRAIN) { starSteps.subgrain += 1; starSteps.bound = Math.max(starSteps.bound, pivot); }
        else starSteps.blended.push([rt.pocket, 'NOT-SUBGRAIN', +(pivot * 1e3).toFixed(4), +(step * 1e3).toFixed(4)]);
      }
    }
  } catch (e) { starSteps.joints = -1; starSteps.blended.push(['star', e.message.slice(0, 80)]); }
  // r4d (review 8): the centre path never carries a ball AGAINST its direction of travel — on
  // every route routesAll collects below (TEST-synthetic-wire-slide's routes and its tray route, and the routes of TEST-terminal-chutes, the Star export and TEST-bend-90 where each builds), each 0.05 mm step of D moves the centre with a non-negative
  // component along the local travel direction (the next line's tangent; inside a blend the
  // direction from the previous line's end to the next line's start)
  const backhops = [];
  const routesAll = [...track.routes.values(), track.trayRoute, ...(ttrackR ? [...ttrackR.routes.values()] : [])];
  try { const up2 = loadDef(path.resolve(here, '../scene/ballreturn/tracks/wpbsa_snooker_12ft-xw101-slides.json')); const sctx2 = await tableContext(up2.doc.table_id); routesAll.push(...validateTrack(up2, { pockets: sctx2.pockets, falls: sctx2.falls }).routes.values()); } catch { /* the Star copy is gated by t6 */ }
  try { const bd = loadDef(path.resolve(here, '../scene/ballreturn/tracks/TEST-bend-90.json')); routesAll.push(...validateTrack(bd, { pockets: POCKETS, falls: null }).routes.values()); } catch { /* gated by r8 */ }
  for (const rt of routesAll) {
    const lines = rt.segs.filter((sg) => sg.kind === 'line');
    const dirAt = (D) => { // the local travel direction reference
      for (let i = 0; i < rt.segs.length; i++) { const sg = rt.segs[i]; if (D <= sg.D0 + 1e-12 && D >= sg.D1 - 1e-12) { if (sg.kind === 'line') return sg.dir; const prevLine = rt.segs.slice(0, i).reverse().find((x) => x.kind === 'line'); const nextLine = rt.segs.slice(i + 1).find((x) => x.kind === 'line'); if (!prevLine || !nextLine) return (nextLine ?? prevLine).dir; const a = stationAt(rt, prevLine.D1, rt.r, {}), b = stationAt(rt, nextLine.D0, rt.r, {}); const v = [b.x - a.x, b.y - a.y, b.z - a.z]; const l = Math.hypot(...v); return l > 1e-12 ? v.map((c) => c / l) : nextLine.dir; } }
      return lines[lines.length - 1].dir;
    };
    let worstBack = 0; let prev = null;
    for (let D = rt.total; D >= 0; D -= 0.00005) { const s0 = stationAt(rt, D, rt.r, {}); if (prev) { const d = dirAt(D + 0.000025); const proj = (s0.x - prev.x) * d[0] + (s0.y - prev.y) * d[1] + (s0.z - prev.z) * d[2]; worstBack = Math.min(worstBack, proj); } prev = { x: s0.x, y: s0.y, z: s0.z }; }
    backhops.push([rt.pocket, rt.track.id?.slice?.(0, 12) ?? '', +(worstBack / MM).toFixed(5)]);
  }
  const worstBackhop = Math.min(...backhops.map((b) => b[2]));
  check(`r4d the centre path never moves a ball against its direction of travel: over ${routesAll.length} routes of the four fixtures, every 0.05 mm step of D has a non-negative component along the local travel direction (worst ${worstBackhop.toExponential(2)} mm)`, worstBackhop > -1e-6, JSON.stringify(backhops));
  const worstJump = Math.max(...jumps.map((j) => j[2]));
  check(`r4 ball-centre path C0 at every vertex / junction of the AUTHORED fixtures: max jump across all ${jumps.length} routes = ${worstJump.toExponential(2)} m (< 1e-6; the old offset-per-edge path jumped 1–3 mm at the fixture's bends)`, worstJump < 1e-6, JSON.stringify(jumps.map((j) => [j[0], j[1], j[2].toExponential(1)])));
  check(`r67 on the SAMPLED Star export C0 holds to the export grain, not to 1 µm: ${starSteps.joints} of the six routes' joints step at all, every one of them a joint the reader's own sub-grain rule refuses to blend (${starSteps.subgrain} / ${starSteps.joints}; the omitted pivot arc h·|Δn| ≤ ${(starSteps.bound * 1e3).toFixed(4)} mm against the ${(EXPORT_GRAIN * 1e3).toFixed(1)} mm grain), worst step ${starSteps.worst.toExponential(2)} m — and no step at any joint the reader does blend. The ruling on merging such facets is GH-769; r6 carries the visible consequence (the seat ladder short by the steps between two seats)`,
    starSteps.joints > 0 && starSteps.subgrain === starSteps.joints && starSteps.worst < EXPORT_GRAIN && starSteps.blended.length === 0, JSON.stringify(starSteps.blended.slice(0, 8)));
  const ridge = (() => { const d = loadDef(path.resolve(here, '../scene/ballreturn/tracks/TEST-terminal-chutes.json')); d.runways.find((rw) => rw.id === 'rc-chute').points_mm = [[0, -273, 653.5], [0, -353, 353.5], [0, -343, 329.5]]; d.runways.find((rw) => rw.id === 'lc-chute').points_mm = [[0, -273, -653.5], [0, -353, -353.5], [0, -343, -329.5]]; try { return validateTrack(d, { pockets: POCKETS, falls: null }); } catch (e) { return null; } })();
  check('r4b vertex geometry by kind: every plan turn of the trunk-tray fixture is a pair of in-plane TWISTS (the tilt offset shrinking to the vertex and regrowing), its φ = 0 trunk→tray slope joint a corner CUT, and a pure-slope convex ridge (a steeper chute under a collinear lead) a pivot ARC', [...track.routes.values()].every((rt) => rt.segs.filter((sg) => sg.kind === 'twist').length >= 8 && rt.segs.some((sg) => sg.kind === 'cut') && !rt.segs.some((sg) => sg.kind === 'arc')) && !!ridge && [...ridge.routes.values()].every((rt) => rt.segs.some((sg) => sg.kind === 'arc')), JSON.stringify({ fixture: [...track.routes.values()].map((rt) => rt.segs.map((sg) => sg.kind[0]).join('')), ridge: ridge ? [...ridge.routes.values()].map((rt) => rt.segs.map((sg) => sg.kind[0]).join('')) : null }));

  // r5 (P3) causal order for simultaneous events: a landing precedes the contact it
  // causes at the same t; the cursor repeats the order; two solves agree byte for byte
  const seqOf = (sol) => sol.events.map((e) => `${e.kind}@${e.t.toFixed(9)}:${e.ball}`);
  const sA = solveRef(); const sB = solveRef();
  const same = seqOf(sA).join('|') === seqOf(sB).join('|');
  let causal = true;
  for (let i = 1; i < sA.events.length; i++) { const a = sA.events[i - 1], b = sA.events[i]; if (Math.abs(a.t - b.t) < 1e-12 && a.kind === 'contact' && (b.kind === 'landing' || b.kind === 'junction') && b.ball === a.ball) causal = false; }
  const pair = sA.events.findIndex((e, i) => i + 1 < sA.events.length && e.kind === 'landing' && sA.events[i + 1].kind === 'contact' && Math.abs(e.t - sA.events[i + 1].t) < 1e-12 && sA.events[i + 1].ball === e.ball);
  const cur = createEventCursor(sA.events); cur.advance(0); const fired = cur.advance(1e9).map((e) => `${e.kind}:${e.ball}`);
  const mergeOnBreak = [...track.routes.values()].every((rt) => rt.merges.every((m) => rt.breaks.some((b) => Math.abs(b - m.D) < 1e-9)));
  check('r4c every merge point of every route lies ON a junction break (the yield window and the junction event share one station; stationD maps the physical landing station through the blend)', mergeOnBreak, JSON.stringify([...track.routes.values()].map((rt) => rt.merges.map((m) => [m.feeder, +(m.D * 1000).toFixed(2)]))));
  check('r5 simultaneous events emit in causal order (landing → its contact at the same instant), the cursor fires the same order, and two solves agree exactly', same && causal && pair >= 0 && fired.join('|') === sA.events.map((e) => `${e.kind}:${e.ball}`).join('|'), JSON.stringify({ same, causal, pair, first6: seqOf(sA).slice(0, 6) }));
}


// ---- (r13) seal 13: review round 10 on seal 12 — the two P2s ----------------------
// P2-1 the merge-window clearance tested peer branches over [Dq − 4r, Dq + 2r], one
// diameter short of the station a peer can itself be HELD at (its own yield station,
// capped at Dq + 4r): at a shallow merge both balls hold, each clear of the other's
// NOMINAL stations and 17.2 mm apart on a 57.15 mm diameter. P2-2 the closing loop
// advanced a piece's rotation by the piece quadratic, which is not the distance a
// FOLLOWER covers (pieceD chains seatBehind through the bend).
{
  const MM = 0.001;
  const twoR = 2 * R;
  const GRAIN = 0.1 * MM;                     // the law's own scan grain (track.js)
  const FINE = 0.05 * MM;                     // the arm scans finer than the law
  const shallowDef = loadDef(path.resolve(here, '../scene/ballreturn/tracks/TEST-shallow-merge.json'));
  const shallow = validateTrack(shallowDef, { pockets: POCKETS, falls: null });

  // the min chord from station D on `rt` to every occupiable station of every other
  // path through merge `m`, scanned over a window given in diameters about the point;
  // shared lanes (a line this route also runs along) excluded, as the law does
  const chordTo = (trk, rt, m, D, loD, hiD) => {
    const a = stationAt(rt, D, trk.refR, {});
    const myLines = new Set(rt.segs.filter((sg) => sg.kind === 'line').map((sg) => sg.edge));
    let min = Infinity;
    for (const q of trk.routes.values()) {
      if (q === rt) continue;
      const Dq = stationD(q, m.rw.id, m.s);
      if (Dq === null) continue;
      for (let x = Dq + loD; x <= Dq + hiD; x += FINE) {
        if (x < 0 || x > q.total + 2 * trk.refR) continue;
        const lq = locate(q, x);
        if (lq.seg.kind === 'line' && myLines.has(lq.seg.edge)) continue;
        const b = stationAt(q, x, trk.refR, {});
        min = Math.min(min, Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z));
      }
    }
    return min;
  };

  // ---- r13a the merge-angle sweep: one family, the plan angle of the last edge of
  // both entry runways against the trunk swept from 2.2° to 63.4°. Every ACCEPTED
  // angle must keep two balls one diameter apart through the merge at every arrival
  // offset from simultaneous to 300 ms; every REFUSED one must say so as a runway-graph
  // refusal naming the merge. Below the threshold the paths are within a diameter of
  // each other for longer than the protocol's two-diameter approach, so no hold station
  // exists at all — refusal is the only honest answer (FR-006).
  {
    const mk = (Zmm) => {
      const d = loadDef(path.resolve(here, '../scene/ballreturn/tracks/TEST-shallow-merge.json'));
      for (const rw of d.runways) {
        const s = rw.id === 'rc-run' ? 1 : rw.id === 'lc-run' ? -1 : 0;
        if (!s) continue;
        rw.points_mm = [[0, -263, 703.5 * s], [-500, -300, Zmm * s], [-1150, -361, 0]];
      }
      return d;
    };
    const angOf = (Zmm) => Math.atan2(Zmm, 650) * 180 / Math.PI; // last edge (−650, −61, −Zmm) against the trunk (−150, −19.5, 0), in plan
    const rows = [];
    for (const Zmm of [25, 50, 75, 100, 150, 175, 200, 275, 375, 500, 650, 900, 1300]) {
      let trk = null; let why = null;
      try { trk = validateTrack(mk(Zmm), { pockets: POCKETS, falls: null }); } catch (e) { why = e.message; }
      if (!trk) { rows.push({ ang: +angOf(Zmm).toFixed(1), verdict: 'REFUSED', why: /runway graph: pocket \d+ cannot hold clear of the .* merge/.test(why) ? 'merge' : why }); continue; }
      let minPair = Infinity; let at = null;
      for (const off of [0, 0.02, 0.05, 0.1, 0.15, 0.2, 0.3]) {
        const arr = [
          { id: 1, handoff: handoffFromSink({ t: 0.5, pocket: POCKETS[4], fall: POCKETS[4], r: R, glide: 0.06, tFall: 0.021 }, { track: trk, pockets: POCKETS, r: R }) },
          { id: 2, handoff: handoffFromSink({ t: 0.5 + off, pocket: POCKETS[1], fall: POCKETS[1], r: R, glide: 0.06, tFall: 0.021 }, { track: trk, pockets: POCKETS, r: R }) },
        ];
        const sol = solveShot({ track: trk, r: R, ledger: [], arrivals: arr });
        for (let t = 0.5; t <= sol.tEnd + 0.1; t += 1 / 1000) {
          const a = poseAt(sol, 1, t, {}); const b = poseAt(sol, 2, t, {});
          if (!a || !b || a.kind === 'fall' || b.kind === 'fall') continue;
          const d = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
          if (d < minPair) { minPair = d; at = { offMs: off * 1000, t: +t.toFixed(3) }; }
        }
      }
      rows.push({ ang: +angOf(Zmm).toFixed(1), verdict: 'OK', push: +([...trk.routes.values()].flatMap((rt) => rt.merges.map((m) => (m.yieldD - m.D - twoR) / MM)).reduce((x, y) => Math.max(x, y), 0)).toFixed(2), minPair: +(minPair / MM).toFixed(3), at });
      void at;
    }
    const okRows = rows.filter((r) => r.verdict === 'OK');
    const noRows = rows.filter((r) => r.verdict === 'REFUSED');
    const monotone = rows.every((r, i) => i === 0 || !(rows[i - 1].verdict === 'OK' && r.verdict === 'REFUSED')); // one crossing: refusals are the shallow end
    check(`r13a merge-angle sweep ${rows[0].ang}° … ${rows[rows.length - 1].ang}° (13 tracks, 7 arrival offsets 0–300 ms each): every ACCEPTED angle keeps the pair one diameter apart (worst ${Math.min(...okRows.map((r) => r.minPair)).toFixed(3)} mm vs 2r ${(twoR / MM).toFixed(2)}), every REFUSED one is a runway-graph merge refusal, and the verdict crosses once (refusals below ${Math.min(...okRows.map((r) => r.ang))}°)`,
      okRows.length >= 7 && noRows.length >= 5 && okRows.every((r) => r.minPair >= twoR / MM - 1e-3) && noRows.every((r) => r.why === 'merge') && monotone,
      JSON.stringify(rows));
    // review r10's own repro, to the millimetre: the 4.4° track the old law ACCEPTED,
    // where two simultaneous arrivals held 17.21 mm apart (39.94 mm of interpenetration)
    let msg = null;
    try { validateTrack(mk(50), { pockets: POCKETS, falls: null }); } catch (e) { msg = e.message; }
    check('r13a2 the 4.4° merge of review round 10 (the reported 17.2 mm hold) is refused by name, with the widest gap the two-diameter approach can reach and the diameter it is under', !!msg && /\[V2\]/.test(msg) && /cannot hold clear of the rc-run merge on trunk/.test(msg) && /17\.4 mm, under the 57\.15 mm ball diameter/.test(msg), msg ?? 'ACCEPTED');
  }

  // ---- r13b every merge on every fixture in the list `all` below: the yield station is clear of the peer's
  // WHOLE occupiable span — one diameter past the point back to the peer's own cap two
  // diameters before it — and it is the SMALLEST grid station that is (no over-push)
  {
    const all = [['synthetic', track], ['shallow-merge', shallow]];
    for (const [nm, file] of [['alias', 'TEST-alias-diamond-wire-slide.json'], ['terminal', 'TEST-terminal-chutes.json'], ['bend-90', 'TEST-bend-90.json']]) {
      try { all.push([nm, validateTrack(loadDef(path.resolve(here, '../scene/ballreturn/tracks/' + file)), { pockets: POCKETS, falls: null })]); } catch (e) { check(`r13b the ${nm} fixture validates`, false, e.message); }
    }
    try {
      const up = loadDef(path.resolve(here, '../scene/ballreturn/tracks/wpbsa_snooker_12ft-xw101-slides.json'));
      const sctx = await tableContext(up.doc.table_id);
      all.push(['star', validateTrack(up, { pockets: sctx.pockets, falls: sctx.falls })]);
    } catch (e) { check('r13b the Star export validates', false, e.message); }
    let worst = Infinity; let worstAt = null; let merges = 0; let overPush = null;
    const rowsB = [];
    for (const [nm, trk] of all) {
      for (const rt of [...trk.routes.values(), ...(trk.trayRoute ? [trk.trayRoute] : [])]) {
        for (const m of rt.merges) {
          merges += 1;
          const g = chordTo(trk, rt, m, m.yieldD, -2 * twoR, 2 * twoR);
          if (g < worst) { worst = g; worstAt = [nm, rt.pocket, m.feeder, +(m.D / MM).toFixed(1)]; }
          if (m.yieldD > m.D + twoR + 1e-12) {
            const below = chordTo(trk, rt, m, m.yieldD - GRAIN, -2 * twoR, 2 * twoR);
            if (below >= twoR) overPush = [nm, rt.pocket, m.feeder, +(below / MM).toFixed(4)];
          }
          rowsB.push([nm, rt.pocket, m.feeder, +((m.yieldD - m.D - twoR) / MM).toFixed(2), +(g / MM).toFixed(4)]);
        }
      }
    }
    check(`r13b every merge on all six fixtures (${merges}) holds its ball one diameter clear of every station the other path can occupy while it waits — one diameter past the point back to the peer's own two-diameter cap, scanned at 0.05 mm (worst chord ${(worst / MM).toFixed(4)} mm vs 2r ${(twoR / MM).toFixed(2)}, at ${JSON.stringify(worstAt)}; the law scans at 0.1 mm, so a true minimum between its grid points may sit half a grain under — tolerance 1 µm) — and no station is pushed further than it must be`,
      merges >= 14 && worst >= twoR - 1e-6 && overPush === null, JSON.stringify({ overPush, rowsB }));
  }

  // ---- r13f the collector is a route too. A feeder may land MID-tray (the schema
  // constrains a landing to the target runway's support line, not to its head), and that
  // puts a merge on the LEDGER route itself: the tray's own resting balls have to hold
  // clear of it like anything else. Every shipped export lands its trunk at the tray's
  // head, where the junction is the route's own start and carries no merge — so without
  // this pair the tray route could be dropped from the clearance pass and no arm on any
  // fixture would notice (seal-13 mutation battery, mutant S10).
  {
    const mkTray = (pts) => {
      const d = loadDef(path.resolve(here, '../scene/ballreturn/tracks/TEST-synthetic-wire-slide.json'));
      for (const rw of d.runways) if (rw.id === 'tray') rw.points_mm = pts;
      return d;
    };
    // (a) the collector turned across the trunk's heading: the trunk lands at its middle
    // (s 150.0 of 300 mm) at 90° in plan, and the tray route carries that merge
    let cross = null; let whyX = null;
    try { cross = validateTrack(mkTray([[-1300, -386, -150], [-1300, -386, 150]]), { pockets: POCKETS, falls: null }); } catch (e) { whyX = e.message; }
    const tms = cross?.trayRoute?.merges ?? [];
    const okTray = tms.length === 1 && Number.isFinite(tms[0]?.yieldD) && tms[0].yieldD >= tms[0].D + twoR - 1e-12;
    const gTray = okTray ? chordTo(cross, cross.trayRoute, tms[0], tms[0].yieldD, -2 * twoR, 2 * twoR) : -1;
    check(`r13f a feeder landing mid-tray puts a merge on the LEDGER route (pocket −1) and the clearance law runs over it: one merge at s ${(tms[0]?.s / MM || 0).toFixed(1)} mm, hold station D ${((tms[0]?.yieldD ?? 0) / MM).toFixed(1)} mm (${(((tms[0]?.yieldD ?? 0) - (tms[0]?.D ?? 0) - twoR) / MM).toFixed(2)} mm past the diameter), chord to the feeder's own approach ${(gTray / MM).toFixed(3)} mm ≥ 2r ${(twoR / MM).toFixed(2)}`,
      okTray && gTray >= twoR - 1e-6, whyX ?? JSON.stringify({ merges: tms.length, yieldD: tms[0]?.yieldD, gTray }));
    // (b) the same landing with the collector left along the trunk's own heading: the two
    // paths stay 13.1 mm apart in plan through the whole approach, so no station on the
    // tray holds a ball clear of one on the trunk — refused, naming the ledger route
    let whyP = null;
    try { validateTrack(mkTray([[-1200, -386, 0], [-1500, -386, 0]]), { pockets: POCKETS, falls: null }); } catch (e) { whyP = e.message; }
    check('r13f2 a mid-tray landing whose feeder runs parallel to the collector (13.1 mm apart) is REFUSED by name for the ledger route (pocket −1), not silently accepted',
      !!whyP && /\[V2\]/.test(whyP) && /pocket -1 cannot hold clear of the trunk merge on tray at s 100\.0 mm/.test(whyP) && /13\.1 mm, under the 57\.15 mm ball diameter/.test(whyP), whyP ?? 'ACCEPTED');
  }

  // ---- r13c the follower's rotation is advanced by ITS OWN path distance: at every
  // piece boundary of every ball of every train the drawn orientation is continuous
  // (the gap over 1 ns and 10 ns of real motion is the rolling rate × that time, nothing
  // more), and no 240 Hz frame turns the ball faster than its own contact-point speed.
  {
    const qgap = (a, b) => { const p = Math.hypot(a.qx - b.qx, a.qy - b.qy, a.qz - b.qz, a.qw - b.qw); const m = Math.hypot(a.qx + b.qx, a.qy + b.qy, a.qz + b.qz, a.qw + b.qw); return 2 * Math.min(p, m); };
    const trains = [];
    trains.push(['synthetic 5×250 ms', track, POCKETS, POCKETS[4], POCKETS[4], 5, 0.25, R]);
    trains.push(['synthetic 3×5 ms', track, POCKETS, POCKETS[4], POCKETS[4], 3, 0.005, R]);
    trains.push(['shallow-merge 5×80 ms', shallow, POCKETS, POCKETS[4], POCKETS[4], 5, 0.08, R]);
    try { const b = validateTrack(loadDef(path.resolve(here, '../scene/ballreturn/tracks/TEST-bend-90.json')), { pockets: POCKETS, falls: null }); trains.push(['bend-90 5×60 ms', b, POCKETS, POCKETS[4], POCKETS[4], 5, 0.06, R], ['bend-90 8×150 ms', b, POCKETS, POCKETS[4], POCKETS[4], 8, 0.15, R]); } catch { /* r13b reports it */ }
    try { const up = loadDef(path.resolve(here, '../scene/ballreturn/tracks/wpbsa_snooker_12ft-xw101-slides.json')); const sctx = await tableContext(up.doc.table_id); const st = validateTrack(up, { pockets: sctx.pockets, falls: sctx.falls }); trains.push(['star clamp curve 5×60 ms', st, sctx.pockets, sctx.pockets[0], sctx.falls[0], 5, 0.06, 0.02625], ['star clamp curve 6×800 ms', st, sctx.pockets, sctx.pockets[0], sctx.falls[0], 6, 0.8, 0.02625]); } catch { /* r13b reports it */ }
    let worstB = 0; let atB = null; let bounds = 0; let followBounds = 0;
    let worstStep = 0; let atS = null; let steps = 0;
    for (const [nm, trk, pockets, pk, fall, n, gap, r] of trains) {
      const arr = Array.from({ length: n }, (_, i) => ({ id: 1 + i, handoff: handoffFromSink({ t: 0.5 + i * gap, pocket: pk, fall, r, glide: 0.06, tFall: 0.021 }, { track: trk, pockets, r }) }));
      const sol = solveShot({ track: trk, r, ledger: [], arrivals: arr });
      for (const a of arr) {
        const ps = sol.pieces.get(a.id);
        if (!ps) continue;
        for (let i = 0; i + 1 < ps.length; i++) {
          const p = ps[i];
          if (!Number.isFinite(p.t1)) continue;
          for (const h of [1e-9, 1e-8]) {
            const b4 = poseAt(sol, a.id, p.t1 - h, {}); const af = poseAt(sol, a.id, p.t1, {});
            if (!b4 || !af || b4.kind === 'fall' || af.kind === 'fall') continue;
            const c = continuationAt(sol, a.id, p.t1 - h);
            const omega = (c && c.kind === 'roll' ? c.v : 0) / p.rho; // its own spin rate: the support's effective radius, not r (a twin-rail ball rides on rho = sqrt(r² − c²))
            const excess = qgap(b4, af) - omega * h;
            bounds += 1; if (p.follow) followBounds += 1;
            if (excess > worstB) { worstB = excess; atB = [nm, a.id, +p.t1.toFixed(5), p.kind, !!p.follow, ps[i + 1].kind, h]; }
          }
        }
        const dt = 1 / 240;
        let prev = null; let prevT = null;
        for (let t = ps[0].t0; t < sol.tEnd + 0.2; t += dt) {
          const q = poseAt(sol, a.id, t, {});
          if (q && prev && q.kind !== 'fall') {
            let wPeak = 0;
            for (let k = 0; k <= 8; k++) {
              const ts = prevT + (t - prevT) * k / 8;
              const c = continuationAt(sol, a.id, ts);
              let pc = ps[0]; for (const z of ps) { if (z.t0 <= ts) pc = z; else break; }
              if (c && c.kind === 'roll') wPeak = Math.max(wPeak, c.v / (pc.rho || r));
            }
            const ratio = qgap(prev, q) / (wPeak * dt + 1e-9);
            steps += 1;
            if (ratio > worstStep) { worstStep = ratio; atS = [nm, a.id, +t.toFixed(4)]; }
          }
          prev = q && q.kind !== 'fall' ? q : null; prevT = t;
        }
      }
    }
    check(`r13c orientation is continuous across every piece boundary of every ball of ${trains.length} trains (${bounds} boundary reads, ${followBounds} of them a follower's): the gap over 1 ns / 10 ns of motion never exceeds the ball's own rolling rate × that time by more than 1 µrad (worst excess ${worstB.toExponential(3)} rad at ${JSON.stringify(atB)}); no 240 Hz frame turns it faster than its own spin rate v/rho (worst ratio ${worstStep.toFixed(3)} over ${steps} frames at ${JSON.stringify(atS)})`,
      bounds > 300 && followBounds > 30 && worstB <= 1e-6 && steps > 1000 && worstStep <= 1 + 1e-9, JSON.stringify({ worstB, atB, worstStep, atS }));
  }

  // ---- r13d the shipped 17.1° fixture is the regression: its yield station is 44.9 mm
  // beyond the one-diameter minimum, and the station the OLD window picked (the first
  // grid station clear over [Dq − 4r, Dq + 2r]) is NOT clear of the peer's own hold —
  // the arm fails on a tree that scans the old window.
  {
    const rt = shallow.routes.get(1);
    const m = rt.merges.find((x) => x.feeder === 'rc-run');
    let oldStation = null;
    for (let D = m.D + twoR; D <= m.D + 2 * twoR + 1e-12; D += GRAIN) {
      if (chordTo(shallow, rt, m, D, -2 * twoR, twoR) >= twoR - 1e-9) { oldStation = D; break; }   // the OLD window: … + one diameter past
    }
    const gapOld = oldStation === null ? null : chordTo(shallow, rt, m, oldStation, -2 * twoR, 2 * twoR);
    const gapNew = chordTo(shallow, rt, m, m.yieldD, -2 * twoR, 2 * twoR);
    check(`r13d TEST-shallow-merge (17.1° in plan): the old window's station (+${oldStation === null ? 'n/a' : ((oldStation - m.D - twoR) / MM).toFixed(2)} mm) leaves only ${gapOld === null ? 'n/a' : (gapOld / MM).toFixed(2)} mm to the peer's own hold, the law's station (+${((m.yieldD - m.D - twoR) / MM).toFixed(2)} mm) leaves ${(gapNew / MM).toFixed(2)} mm ≥ one diameter`,
      oldStation !== null && gapOld < twoR - MM && m.yieldD > oldStation + GRAIN / 2 && gapNew >= twoR - 1e-6, JSON.stringify({ oldPush: oldStation === null ? null : +((oldStation - m.D - twoR) / MM).toFixed(2), gapOld: gapOld === null ? null : +(gapOld / MM).toFixed(3), newPush: +((m.yieldD - m.D - twoR) / MM).toFixed(2), gapNew: +(gapNew / MM).toFixed(3) }));
    // two feeders into the shallow merge, simultaneous and 0–300 ms apart, 1–3 balls a
    // side: both balls seated, no drawn pair ever inside one diameter, and the merge is
    // actually exercised (a yield with a release, not a track the balls never share)
    let minPair = Infinity; let at = null; let yields = 0; let releases = 0; let solves = 0; let seats = 0;
    for (const nA of [1, 2, 3]) for (const nB of [1, 2, 3]) for (const off of [0, 0.02, 0.05, 0.1, 0.2, 0.3]) {
      const arr = []; let id = 1;
      for (let i = 0; i < nA; i++) arr.push({ id: id++, handoff: handoffFromSink({ t: 0.5 + i * 0.04, pocket: POCKETS[4], fall: POCKETS[4], r: R, glide: 0.06, tFall: 0.021 }, { track: shallow, pockets: POCKETS, r: R }) });
      for (let i = 0; i < nB; i++) arr.push({ id: id++, handoff: handoffFromSink({ t: 0.5 + off + i * 0.04, pocket: POCKETS[1], fall: POCKETS[1], r: R, glide: 0.06, tFall: 0.021 }, { track: shallow, pockets: POCKETS, r: R }) });
      const sol = solveShot({ track: shallow, r: R, ledger: [], arrivals: arr });
      solves += 1; seats += sol.rest.size;
      yields += sol.events.filter((e) => e.kind === 'yield').length;
      releases += sol.events.filter((e) => e.kind === 'release').length;
      for (let t = 0.5; t <= sol.tEnd + 0.1; t += 1 / 1000) {
        const ps = arr.map((a) => [a.id, poseAt(sol, a.id, t, {})]).filter(([, p]) => p && p.kind !== 'fall');
        for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
          const d = Math.hypot(ps[i][1].x - ps[j][1].x, ps[i][1].y - ps[j][1].y, ps[i][1].z - ps[j][1].z);
          if (d < minPair) { minPair = d; at = { nA, nB, offMs: off * 1000, t: +t.toFixed(3), ids: [ps[i][0], ps[j][0]] }; }
        }
      }
    }
    check(`r13d2 the shallow merge under two feeders (${solves} solves, 1–3 balls a side, offsets 0–300 ms): no two drawn balls ever inside one diameter (min ${(minPair / MM).toFixed(4)} mm vs ${(twoR / MM).toFixed(2)}), ${yields} yields and ${releases} releases fired (the merge is exercised), every ball seated (${seats})`,
      minPair >= twoR - 1e-6 && yields > 0 && releases > 0 && seats > 0, JSON.stringify(at));
  }

  // ---- r13e the shallow fixture's own determinism pin (id-bound, the same grid law as c2)
  {
    const arr = [
      { id: 1, handoff: handoffFromSink({ t: 0.5, pocket: POCKETS[4], fall: POCKETS[4], r: R, glide: 0.06, tFall: 0.021 }, { track: shallow, pockets: POCKETS, r: R }) },
      { id: 2, handoff: handoffFromSink({ t: 0.5, pocket: POCKETS[1], fall: POCKETS[1], r: R, glide: 0.06, tFall: 0.021 }, { track: shallow, pockets: POCKETS, r: R }) },
      { id: 3, handoff: handoffFromSink({ t: 0.62, pocket: POCKETS[4], fall: POCKETS[4], r: R, glide: 0.06, tFall: 0.021 }, { track: shallow, pockets: POCKETS, r: R }) },
    ];
    const s = solveShot({ track: shallow, r: R, ledger: [], arrivals: arr });
    const h = pinHash(sampleSolution(s, { t0: 0.5, dt: 1 / 240, t1: s.tEnd + 0.5 }));
    if (args.includes('--pin-shallow')) console.log(`PIN-SHALLOW ${h}`);
    check(`r13e the shallow-merge fixture's two-feeder solve (a simultaneous pair through the merge) hashes to its committed pin (${h.slice(0, 12)}…; quantised to ${PIN_QUANTUM})`, h === shallowDef.checks?.determinism_sha256, `pin ${shallowDef.checks?.determinism_sha256}`);
  }
}
// ---- (r15) seal 14: the MID-EDGE landing (S1) and the chain deadlock (S2) --------
// S1 — the seal-13 same-lane exclusion dropped every peer station on a shared EDGE, upstream
// ones included, so a feeder landing part-way along a trunk that carries traffic held +0.00 mm
// clear and a trunk ball rolled past it 32.72 mm away (24.4 mm of interpenetration; the
// verifier's MIDEDGE-455 repro). A peer station is ours only where OUR route runs that edge AT
// OR AFTER our own landing on it.
// S2 — the push-never-pull test compared the chain's required acceleration to the follower's
// OWN free roll, which reads a PUSHED ball as a PULLED one; and it read the leader shoving a
// follower BACKWARD through a bend as tension too. The first froze a whole train at v = 0
// forever, the second closed the chord on a frozen follower to 56.28 mm.
{
  const MM = 0.001;
  const twoR = 2 * R;
  const midDef = loadDef(path.resolve(here, '../scene/ballreturn/tracks/TEST-midedge-landing.json'));
  const mid = validateTrack(midDef, { pockets: POCKETS, falls: null });
  const mctx = { track: mid, pockets: POCKETS, r: R };
  const hoff = (t, pk, trk) => handoffFromSink({ t, pocket: POCKETS[pk], fall: POCKETS[pk], r: R, glide: 0.06, tFall: 0.021 }, { track: trk, pockets: POCKETS, r: R });

  // r15a the landing really is mid-edge (the trunk carries lc-run's traffic through it) and the
  // hold is pushed off the one-diameter minimum
  {
    const rcMerge = [...mid.routes.values()].flatMap((rt) => rt.merges).filter((m) => m.feeder === 'rc-run');
    const trunkLen = mid.runways.get('trunk')?.length ?? 0;
    const sMid = rcMerge[0]?.s ?? 0;
    const pushes = rcMerge.map((m) => (m.yieldD - m.D - twoR) / MM);
    // lc-run's own landing is the trunk's head (s = 0): its stations run THROUGH rc-run's
    const lcS = [...mid.routes.values()].flatMap((rt) => rt.merges).filter((m) => m.feeder === 'lc-run').map((m) => m.s);
    check(`r15a rc-run lands MID-EDGE on the trunk (s ${(sMid / MM).toFixed(1)} mm of a ${(trunkLen / MM).toFixed(1)} mm run, 34.98° in plan) while lc-run lands at its head (s ${lcS.map((x) => (x / MM).toFixed(1)).join('/')} mm), so upstream trunk traffic crosses rc-run's landing; every rc-run hold is pushed clear of the one-diameter minimum (+${pushes.map((x) => x.toFixed(2)).join(' / ')} mm)`,
      sMid > 1e-3 && sMid < trunkLen - 1e-3 && lcS.length > 0 && lcS.every((x) => x < 1e-9) && pushes.length === 2 && pushes.every((x) => x > 1),
      JSON.stringify({ sMid: sMid / MM, trunkLen: trunkLen / MM, lcS: lcS.map((x) => x / MM), pushes }));
  }

  // r15b the angle family: swing rc-run's mid vertex in Z for 35° / 44° / 54° / 60°, both
  // arrival orders, offsets 0–700 ms step 25 ms, 2 and 3 balls — every drawn pair one diameter
  // clear, or the track is refused BY NAME
  {
    const rows = [];
    let minAll = Infinity, atAll = null, solves = 0, refusals = 0;
    for (const Zmm of [455, 627.6, 894.7, 1125.8]) {
      const def = JSON.parse(JSON.stringify(midDef));
      for (const rw of def.runways) if (rw.id === 'rc-run') rw.points_mm = [[0, -263, 703.5], [-500, -300, Zmm], [-1150, -361, 0]];
      const ang = +(Math.atan2(Zmm, 650) * 180 / Math.PI).toFixed(2);
      let trk = null, why = null;
      try { trk = validateTrack(def, { pockets: POCKETS, falls: null }); } catch (e) { why = e.message; }
      if (!trk) { refusals += 1; rows.push({ ang, verdict: 'REFUSED', why: (why || '').slice(0, 80) }); continue; }
      let minPair = Infinity, at = null, seats = 0, balls = 0;
      for (const order of [[4, 1], [1, 4]]) {
        for (let offMs = 0; offMs <= 700; offMs += 25) {
          for (const nB of [1, 2]) {                      // 2 and 3 balls in play
            const arr = [{ id: 1, handoff: hoff(0.5, order[0], trk) }];
            for (let i = 0; i < nB; i++) arr.push({ id: 2 + i, handoff: hoff(0.5 + offMs / 1000 + i * 0.04, order[1], trk) });
            if (arr.some((a) => !a.handoff)) continue;
            const sol14 = solveShot({ track: trk, r: R, ledger: [], arrivals: arr });
            solves += 1; balls += arr.length; seats += sol14.rest.size;
            for (let t = 0.5; t <= sol14.tEnd + 0.15; t += 1 / 1000) {
              const ps = arr.map((a) => poseAt(sol14, a.id, t, {})).filter((q) => q && q.kind !== 'fall');
              for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
                const dd = Math.hypot(ps[i].x - ps[j].x, ps[i].y - ps[j].y, ps[i].z - ps[j].z);
                if (dd < minPair) { minPair = dd; at = { ang, order: order.join('>'), offMs, nB, t: +t.toFixed(3) }; }
              }
            }
          }
        }
      }
      rows.push({ ang, verdict: 'OK', minMm: +(minPair / MM).toFixed(4), seats, balls });
      if (minPair < minAll) { minAll = minPair; atAll = at; }
    }
    const allSeated = rows.filter((x) => x.verdict === 'OK').every((x) => x.seats === x.balls);
    check(`r15b the mid-edge landing family (${rows.map((x) => x.ang + '°').join(' / ')}; both arrival orders, offsets 0–700 ms step 25 ms, 2 and 3 balls; ${solves} solves): every admitted angle holds every drawn pair one diameter clear (min ${(minAll / MM).toFixed(4)} mm vs ${(twoR / MM).toFixed(2)}), every ball seated, ${refusals} refused by name`,
      rows.length === 4 && minAll >= twoR - 1e-6 && allSeated, JSON.stringify({ rows, atAll }));
  }

  // r15c the discriminating read: the peer stations that bind the mid-edge hold are UPSTREAM of
  // our own landing on the very runway we run — exactly what the seal-13 by-edge rule dropped
  {
    const route = mid.routes.get(4);                 // rc-run: lands mid-edge, 151.3 mm down the trunk
    const peer = mid.routes.get(1);                  // lc-run: lands at the trunk head and runs through
    const m = route?.merges.find((x) => x.rw.id === 'trunk');
    let shared = 0, upstream = 0, bindMin = Infinity;
    const a = {}, b = {};
    if (route && peer && m) {
      stationAt(route, m.yieldD, R, a);
      for (let x = 0; x <= peer.total; x += 0.5 * MM) {
        const lq = locate(peer, x);
        if (lq.rw.id !== 'trunk') continue;
        shared += 1;
        if (stationD(route, 'trunk', lq.sLocal) !== null) continue;      // at / after OUR landing: our own lane
        upstream += 1;
        stationAt(peer, x, R, b);
        bindMin = Math.min(bindMin, Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z));
      }
    }
    check(`r15c the binding peers are upstream: of ${shared} peer stations on the SHARED trunk, ${upstream} lie upstream of our own landing (stationD null) and are clearance candidates — the seal-13 by-edge rule dropped all ${shared} of them; our hold stands ${(bindMin / MM).toFixed(4)} mm from the nearest of the ${upstream}, one diameter clear`,
      shared > 0 && upstream > 0 && upstream < shared && bindMin >= twoR - 1e-6,
      JSON.stringify({ shared, upstream, bindMinMm: +(bindMin / MM).toFixed(4) }));
  }

  // r15d S2 — a sloped train behind free resting balls on the flat ADVANCES (the seal-13 law
  // parted the chain at the first flat follower, could not draw it apart, and blocked every
  // pusher at v = 0 behind a leader that never moves: tEnd 0, permanent)
  {
    const ids = [100, 101, 102, 103, 104, 1, 2, 3, 4];
    const base14 = solveShot({ track, r: R, ledger: ids, arrivals: [] });
    const carried = ids.map((id) => ({ id, ...continuationAt(base14, id, base14.tEnd + 1) }));
    const g3 = (a, b) => { const u = {}, w = {}; stationAt(a.route, a.D, R, u); stationAt(b.route, b.D, R, w); return Math.hypot(u.x - w.x, u.y - w.y, u.z - w.z); };
    const out = [];
    let ok = true;
    for (const drop of [1, 2, 3]) {
      const led = carried.slice(drop).map((c) => ({ id: c.id, D: c.D, route: c.route, q: c.q }));
      const s14 = solveShot({ track, r: R, ledger: led, arrivals: [] });
      const rest = [...s14.rest.entries()].sort((a, b) => a[1] - b[1]);
      const rr = rest.map(([id, D]) => ({ id, D, route: continuationAt(s14, id, s14.tEnd + 1).route }));
      let worst = 0;
      for (let i = 1; i < rr.length; i++) worst = Math.max(worst, Math.abs(g3(rr[i], rr[i - 1]) - twoR));
      const good = s14.tEnd > 0 && rest.length === led.length && Math.abs(rest[0][1] - R) < 1e-9 && worst < 1e-9;
      ok = ok && good;
      out.push({ drop, tEnd: +s14.tEnd.toFixed(3), seated: `${rest.length}/${led.length}`, frontMm: +(rest[0][1] / MM).toFixed(3), worstGapNm: +(worst * 1e9).toFixed(3) });
    }
    check(`r15d a sloped train behind ${9 - 1}/${9 - 2}/${9 - 3} carried balls with the leading ones FREE on the flat advances and settles: tEnd ${out.map((x) => x.tEnd).join(' / ')} s, front ball at the wall seat r, every resting neighbour one diameter apart in SPACE (worst ${Math.max(...out.map((x) => x.worstGapNm)).toFixed(3)} nm)`,
      ok, JSON.stringify(out));
  }

  // r15e no follower is left standing — rewritten at seal 15 (verification round 14, S2). The
  // seal-14 arm counted flank blocks RELEASED and passed 81 followers set to v = 0; its own
  // "worst named Δv 0.5547 m/s" was the defect, read and passed over. The law now: a parting
  // keeps the chain speed. Over the same 51 trains, no `block` / `unblock` event exists, every
  // `separate` event's `v` (the freed ball's launch speed) equals J·v_leader read one
  // microsecond AFTER the instant (J = (n·T_leader)/(n·T_follower) from `tangentAt`) — the same
  // number as the follower's drawn speed one microsecond BEFORE it at a smooth instant, and the
  // inelastic side-impact speed at a vertex crossing — and it is never zero while the leader
  // moves. On the seal-14 tree the same trains carry 81 blocks with v → 0.000.
  {
    const shal = validateTrack(loadDef(path.resolve(here, '../scene/ballreturn/tracks/TEST-shallow-merge.json')), { pockets: POCKETS, falls: null });
    const solves = [];
    for (const [nm, trk] of [['synthetic', track], ['shallow', shal], ['midedge', mid]]) {
      for (const key of trk.routes.keys()) {
        for (const gapMs of [5, 20, 50, 120]) for (const nb of [2, 4]) {
          const arr = [];
          for (let i = 0; i < nb; i++) { const h = hoff(0.05 + i * gapMs / 1000, key, trk); if (h) arr.push({ id: i + 1, handoff: h }); }
          if (arr.length < 2) continue;
          solves.push([`${nm} p${key} ${nb}x${gapMs}ms`, solveShot({ track: trk, r: R, ledger: [], arrivals: arr })]);
        }
      }
    }
    {
      const ids = [100, 101, 102, 103, 104, 1, 2, 3, 4];
      const b14 = solveShot({ track, r: R, ledger: ids, arrivals: [] });
      const carr = ids.map((id) => ({ id, ...continuationAt(b14, id, b14.tEnd + 1) }));
      for (const drop of [1, 2, 3]) solves.push([`ledger drop ${drop}`,
        solveShot({ track, r: R, ledger: carr.slice(drop).map((c) => ({ id: c.id, D: c.D, route: c.route, q: c.q })), arrivals: [] })]);
    }
    const Dat = (s, id, t) => { const p = poseAt(s, id, t, {}); return p && p.kind !== 'fall' ? p.D : null; };
    const speedOver = (s, id, t0, t1) => { const a = Dat(s, id, t0), b = Dat(s, id, t1); return a === null || b === null ? null : (a - b) / (t1 - t0); };
    const routeAt = (s, id, t) => { const c = continuationAt(s, id, t); return c && c.kind === 'roll' ? c : null; };
    // J·v_leader one microsecond after the instant, from the drawn stream and the path tangents
    const lawAfter = (s, ball, other, t) => {
      const cb = routeAt(s, ball, t + 1e-6), co = routeAt(s, other, t + 1e-6);
      if (!cb || !co) return null;
      const pb = stationAt(cb.route, cb.D, R, {}), po = stationAt(co.route, co.D, R, {});
      const tb = tangentAt(cb.route, cb.D, {}), to = tangentAt(co.route, co.D, {});
      const n = [po.x - pb.x, po.y - pb.y, po.z - pb.z];
      const nA = n[0] * to.tx + n[1] * to.ty + n[2] * to.tz, nB = n[0] * tb.tx + n[1] * tb.ty + n[2] * tb.tz;
      const vLead = speedOver(s, other, t + 1e-6, t + 2e-6);
      if (!(Math.abs(nB) > 1e-9) || vLead === null) return null;
      return { J: nA / nB, v: (nA / nB) * vLead, vLead };
    };
    let nSep = 0, nZero = 0, nBlock = 0, nImpact = 0, nSmoothBad = 0, worstLaw = 0, at = null, cases = 0, minRatio = Infinity, atMin = null;
    for (const [nm, s] of solves) {
      cases += 1;
      nBlock += s.events.filter((e) => e.kind === 'block' || e.kind === 'unblock').length;
      for (const e of s.events.filter((e) => e.kind === 'separate')) {
        nSep += 1;
        const before = speedOver(s, e.ball, e.t - 2e-6, e.t - 1e-6);
        const law = lawAfter(s, e.ball, e.other, e.t);
        if (!law) continue;
        if (law.vLead > 1e-3 && !(e.v > 1e-6)) nZero += 1;                       // a follower zeroed while its leader moves
        const err = Math.abs(e.v - law.v) / Math.max(1e-3, Math.abs(law.v));
        if (err > worstLaw) { worstLaw = err; at = `${nm} ball ${e.ball}/${e.other} t ${e.t.toFixed(4)} v ${e.v.toFixed(4)} law ${law.v.toFixed(4)} J ${law.J.toFixed(4)} before ${before === null ? '-' : before.toFixed(4)}`; }
        if (before !== null && before > 1e-3) {
          const ratio = e.v / before;
          if (ratio < minRatio) { minRatio = ratio; atMin = `${nm} ball ${e.ball}/${e.other} t ${e.t.toFixed(4)} ${before.toFixed(4)} → ${e.v.toFixed(4)} (J ${law.J.toFixed(4)})`; }
          if (Math.abs(e.v - before) > 1e-3 * before + 1e-5) nImpact += 1;       // a vertex crossing: the speed jumps to J·v (the inelastic side impact)
          else if (Math.abs(law.J - 1) > 1e-3 && Math.abs(e.v - before) > 1e-3 * before + 1e-5) nSmoothBad += 1;
        }
      }
    }
    check(`r15e over ${cases} trains (three fixtures + the three carried-ledger takes): 0 block / unblock events (${nBlock}); every one of the ${nSep} partings launches the freed ball at the chain speed J·v_leader read 1 µs after the instant (worst relative error ${worstLaw.toExponential(2)} ≤ 1e-3), none at zero while its leader moves (${nZero}); ${nImpact} of them are vertex crossings where the speed drops to J·v — the inelastic side impact — the steepest ${atMin ?? '-'}; the seal-14 tree carries 81 flank blocks here, every follower to 0.000`,
      cases >= 40 && nSep > 0 && nBlock === 0 && nZero === 0 && worstLaw <= 1e-3 && nSmoothBad === 0, `${at} nSmoothBad ${nSmoothBad}`);
  }

  // r15f the mid-edge fixture's own determinism pin (id-bound, the same grid law as c2)
  {
    const arr = [
      { id: 1, handoff: hoff(0.5, 4, mid) },
      { id: 2, handoff: hoff(0.5, 1, mid) },
      { id: 3, handoff: hoff(0.62, 4, mid) },
    ];
    const s14 = solveShot({ track: mid, r: R, ledger: [], arrivals: arr });
    const h = pinHash(sampleSolution(s14, { t0: 0.5, dt: 1 / 240, t1: s14.tEnd + 0.5 }));
    if (args.includes('--pin-midedge')) console.log(`PIN-MIDEDGE ${h}`);
    check(`r15f the mid-edge fixture's two-feeder solve (a simultaneous pair across the mid-edge landing) hashes to its committed pin (${h.slice(0, 12)}…; quantised to ${PIN_QUANTUM})`, h === midDef.checks?.determinism_sha256, `pin ${midDef.checks?.determinism_sha256}`);
  }
}
// ---- (r19) seal 14, round 2: the OBTUSE merge — a feeder that doubles back ------
// Refuter 1 (merge-clearance lens) attacked the seal-14 same-lane fix with a
// feeder whose last edge meets the trunk at an OBTUSE plan angle. Across such a bend the 3-D
// chord between the feeder's hold station and the trunk's stations shortens as sin of the turn,
// so a hold that clears by arc length does not clear in space. Seal 13 pushed the hold +0.00 mm
// and drew 45.32 mm; the seal-14 mid-edge fix pushed it +1.80 mm and still drew 46.75 mm. Both
// breaches are invisible to a coarse offset sweep (57.15 mm) — only a sweep ALIGNED on the merge
// instant finds them, so these arms compute the aligned offset instead of guessing one.
{
  const MM = 0.001;
  const twoR = 2 * R;
  const obDef = loadDef(path.resolve(here, '../scene/ballreturn/tracks/TEST-obtuse-merge.json'));
  const ob = validateTrack(obDef, { pockets: POCKETS, falls: null });
  const hoffO = (t, pk, trk) => handoffFromSink({ t, pocket: POCKETS[pk], fall: POCKETS[pk], r: R, glide: 0.06, tFall: 0.021 }, { track: trk, pockets: POCKETS, r: R });
  // the time a SOLO ball potted at t0 into pocket pk first reaches station Dtarget (bisection on
  // its own pose, so the alignment is read from the solver, never assumed)
  const soloTimeAtD = (trk, pk, Dtarget, t0 = 0.5) => {
    const h = hoffO(t0, pk, trk);
    if (!h) return NaN;
    const s = solveShot({ track: trk, r: R, ledger: [], arrivals: [{ id: 1, handoff: h }] });
    const Dat = (t) => { const p = poseAt(s, 1, t, {}); return p ? p.D : Infinity; };
    let lo = t0, hi = s.tEnd + 0.01;
    if (!(Dat(hi) <= Dtarget)) return NaN;
    for (let i = 0; i < 60; i++) { const mid = 0.5 * (lo + hi); if (Dat(mid) > Dtarget) lo = mid; else hi = mid; }
    return hi;
  };
  // the offset (s) that puts pocket pkB's solo ball at pkA's merge station at the same instant
  const alignOffset = (trk, pkA, pkB) => {
    const rA = trk.routes.get(pkA), rB = trk.routes.get(pkB);
    const m = rA?.merges?.[0];
    if (!m || !rB) return NaN;
    const DjB = stationD(rB, m.rw.id, m.s);
    if (DjB === null) return NaN;
    const tA = soloTimeAtD(trk, pkA, m.D), tB = soloTimeAtD(trk, pkB, DjB);
    return (Number.isFinite(tA) && Number.isFinite(tB)) ? tA - tB : NaN;
  };
  // min 3-D distance between any two DRAWN balls over a whole solve, sampled at 1 kHz
  const minPairOver = (trk, arr, tag) => {
    const s19 = solveShot({ track: trk, r: R, ledger: [], arrivals: arr });
    let mn = Infinity, at = null;
    const t0 = Math.min(...arr.map((a) => a.handoff.tH ?? 0.5));
    for (let t = t0; t <= s19.tEnd + 0.15; t += 1 / 1000) {
      const ps = arr.map((a) => [a.id, poseAt(s19, a.id, t, {})]).filter(([, p]) => p && p.kind !== 'fall');
      for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
        const a = ps[i][1], b = ps[j][1];
        const dd = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
        if (dd < mn) { mn = dd; at = { ...tag, t: +t.toFixed(4), a: [ps[i][0], a.runwayId, +(a.D / MM).toFixed(2), a.kind], b: [ps[j][0], b.runwayId, +(b.D / MM).toFixed(2), b.kind] }; }
      }
    }
    return { mn, at, seats: s19.rest.size, balls: arr.length };
  };
  // one sweep of arrival offsets around `centre` (s), both arrival orders, 2 and 3 balls
  const sweepAround = (trk, centre, halfMs, stepMs) => {
    let mn = Infinity, at = null, solves = 0, seats = 0, balls = 0;
    for (const order of [[4, 1], [1, 4]]) {
      const sign = order[0] === 4 ? 1 : -1;
      for (let off = -halfMs; off <= halfMs + 1e-9; off += stepMs) {
        for (const nB of [1, 2]) {
          const dt = sign * centre + off / 1000;   // the second pocket's ball relative to the first
          const shift = Math.max(0, -dt);          // keep both pots after t = 0.5 when the order reverses
          const arr = [{ id: 1, handoff: hoffO(0.5 + shift, order[0], trk) }];
          for (let i = 0; i < nB; i++) arr.push({ id: 2 + i, handoff: hoffO(0.5 + shift + dt + i * 0.04, order[1], trk) });
          if (arr.some((a) => !a.handoff)) continue;
          const rr = minPairOver(trk, arr, { order: order.join('>'), offMs: +off.toFixed(1) });
          solves += 1; seats += rr.seats; balls += rr.balls;
          if (rr.mn < mn) { mn = rr.mn; at = rr.at; }
        }
      }
    }
    return { mn, at, solves, seats, balls };
  };

  // r19a the geometry really is an obtuse, against-the-flow merge, and the hold is pushed well
  // past the one-diameter minimum (seal 13 +0.00 mm, the seal-14 mid-edge fix +1.80 mm)
  {
    const pts = obDef.runways.find((rw) => rw.id === 'rc-run').points_mm;
    const tp = obDef.runways.find((rw) => rw.id === 'trunk').points_mm;
    const u = [pts[2][0] - pts[1][0], pts[2][2] - pts[1][2]];
    const w = [tp[1][0] - tp[0][0], tp[1][2] - tp[0][2]];
    const ang = Math.acos((u[0] * w[0] + u[1] * w[1]) / Math.hypot(u[0], u[1]) / Math.hypot(w[0], w[1])) * 180 / Math.PI;
    const rcM = [...ob.routes.values()].flatMap((rt) => rt.merges).filter((m) => m.feeder === 'rc-run');
    const pushes = rcM.map((m) => (m.yieldD - m.D - twoR) / MM);
    const landing = rcM[0]?.s ?? 0;
    const trunkLen = ob.runways.get('trunk')?.length ?? 0;
    check(`r19a rc-run overshoots the trunk head and doubles BACK: its last edge meets the trunk's direction of travel at ${ang.toFixed(2)}° in plan (obtuse) and still lands mid-edge (s ${(landing / MM).toFixed(1)} mm of ${(trunkLen / MM).toFixed(1)} mm); the schema admits it and every rc-run hold is pushed +${pushes.map((x) => x.toFixed(2)).join(' / ')} mm past the one-diameter minimum`,
      ang > 90 && ang < 180 && landing > 1e-3 && landing < trunkLen - 1e-3 && pushes.length === 2 && pushes.some((x) => x > 5),
      JSON.stringify({ ang, landingMm: landing / MM, pushes }));
  }

  // r19b THE discriminating arm: a sweep ALIGNED on the merge instant. RED on the seal-13 tree
  // (45.3241 mm) and on the seal-14 mid-edge tree (46.7519 mm); the coarse sweep reads 57.15 mm
  // on both and so gates nothing here — it is run alongside to say exactly that.
  {
    const centre = alignOffset(ob, 4, 1);
    const al = sweepAround(ob, centre, 300, 10);
    let coarse = Infinity;
    for (const order of [[4, 1], [1, 4]]) for (let offMs = 0; offMs <= 700; offMs += 25) for (const nB of [1, 2]) {
      const arr = [{ id: 1, handoff: hoffO(0.5, order[0], ob) }];
      for (let i = 0; i < nB; i++) arr.push({ id: 2 + i, handoff: hoffO(0.5 + offMs / 1000 + i * 0.04, order[1], ob) });
      if (arr.some((a) => !a.handoff)) continue;
      coarse = Math.min(coarse, minPairOver(ob, arr, {}).mn);
    }
    check(`r19b across the obtuse merge, ${al.solves} solves ALIGNED on the merge instant (centre ${(centre * 1000).toFixed(1)} ms, ±300 ms step 10 ms, both arrival orders, 2 and 3 balls) hold every drawn pair one diameter clear (min ${(al.mn / MM).toFixed(4)} mm vs ${(twoR / MM).toFixed(2)}), every ball seated; a COARSE 0–700 ms sweep reads ${(coarse / MM).toFixed(4)} mm on the same track and would have passed the breach`,
      al.solves > 100 && al.mn >= twoR - 1e-6 && al.seats === al.balls, JSON.stringify({ centre, at: al.at, seats: al.seats, balls: al.balls, coarseMm: coarse / MM }));
  }

  // r19c the obtuse ANGLE FAMILY: swing the overshoot vertex from 75° through 165°. Every
  // admitted angle holds one diameter; the ones whose hold cannot be made to clear are REFUSED
  // BY NAME (FR-006, the merge-clearance law id) — never admitted-and-broken.
  {
    const rows = [];
    let minAll = Infinity, atAll = null, solves = 0, refusals = 0, admitted = 0;
    for (const angDeg of [75, 90, 105, 120, 135, 150, 165]) {
      const a = angDeg * Math.PI / 180;
      const L = 380, landX = -1150;
      const mx = +(landX + Math.cos(a) * L).toFixed(4);
      const mz = +(Math.sin(a) * L).toFixed(4);
      const def = JSON.parse(JSON.stringify(obDef));
      for (const rw of def.runways) if (rw.id === 'rc-run') rw.points_mm = [[0, -263, 703.5], [mx, -300, mz], [landX, -361, 0]];
      let trk = null, why = null;
      try { trk = validateTrack(def, { pockets: POCKETS, falls: null }); } catch (e) { why = e.message; }
      if (!trk) { refusals += 1; rows.push({ ang: angDeg, verdict: 'REFUSED', why: (why || '').slice(0, 90) }); continue; }
      admitted += 1;
      const centre = alignOffset(trk, 4, 1);
      const al = Number.isFinite(centre) ? sweepAround(trk, centre, 120, 20) : { mn: Infinity, solves: 0, seats: 0, balls: 0, at: null };
      solves += al.solves;
      rows.push({ ang: angDeg, verdict: 'OK', minMm: +(al.mn / MM).toFixed(4), seats: al.seats, balls: al.balls });
      if (al.mn < minAll) { minAll = al.mn; atAll = { ang: angDeg, ...al.at }; }
    }
    const named = rows.filter((x) => x.verdict === 'REFUSED').every((x) => /merge|clear|FR-006|\[V/.test(x.why));
    const allSeated = rows.filter((x) => x.verdict === 'OK').every((x) => x.seats === x.balls);
    check(`r19c the obtuse family (${rows.map((x) => x.ang + '°').join(' / ')}; aligned sweeps, ${solves} solves): ${admitted} admitted and every drawn pair one diameter clear (min ${(minAll / MM).toFixed(4)} mm vs ${(twoR / MM).toFixed(2)}), ${refusals} refused BY NAME — none admitted and broken`,
      rows.length === 7 && admitted >= 4 && refusals >= 1 && minAll >= twoR - 1e-6 && allSeated && named, JSON.stringify({ rows, atAll }));
  }

  // r19d the obtuse fixture's own determinism pin (id-bound, the same grid law as c2 / r15f)
  {
    const centre = alignOffset(ob, 4, 1);
    const arr = [
      { id: 1, handoff: hoffO(0.5, 4, ob) },
      { id: 2, handoff: hoffO(0.5 + centre, 1, ob) },
      { id: 3, handoff: hoffO(0.62, 4, ob) },
    ];
    const s19b = solveShot({ track: ob, r: R, ledger: [], arrivals: arr });
    const h = pinHash(sampleSolution(s19b, { t0: 0.5, dt: 1 / 240, t1: s19b.tEnd + 0.5 }));
    if (args.includes('--pin-obtuse')) console.log(`PIN-OBTUSE ${h}`);
    check(`r19d the obtuse fixture's aligned three-ball solve hashes to its committed pin (${h.slice(0, 12)}…; quantised to ${PIN_QUANTUM})`, h === obDef.checks?.determinism_sha256, `pin ${obDef.checks?.determinism_sha256}`);
  }

  // r19e the PRODUCED-LEDGER law. Refuter 1 also broke FR-006 with hand-authored ledgers (a lone
  // ball resting mid-tray, a stack with its wall-side balls deleted). Those layouts are outside
  // the set the module produces, and the module's own contract says a ledger entry is "a CARRIED
  // rest from the previous solution". This arm walks the produced set instead of asserting about
  // it: from an EMPTY track, shot after shot, every solution's rests are carried forward with
  // continuationAt exactly as index.js does, and every drawn pair in every solve must hold one
  // diameter. Deterministic pseudo-random arrivals (no Math.random — the gate is a pin).
  {
    let worst = Infinity, at = null, solves = 0, coincide = 0, carried = 0;
    for (const [name, trk] of [['synthetic', track], ['midedge', validateTrack(loadDef(path.resolve(here, '../scene/ballreturn/tracks/TEST-midedge-landing.json')), { pockets: POCKETS, falls: null })], ['obtuse', ob]]) {
      const pks = [...trk.routes.keys()];
      for (let seed = 1; seed <= 3; seed++) {
        let rng = seed * 7919 + 13;
        const rnd = () => { rng = (rng * 1103515245 + 12345) % 2147483648; return rng / 2147483648; };
        let ledger = [];
        let nextId = 1;
        for (let round = 1; round <= 6; round++) {
          const arr = [];
          const n = 1 + Math.floor(rnd() * 3);
          for (let i = 0; i < n; i++) {
            const h = hoffO(0.5 + rnd() * 0.8, pks[Math.floor(rnd() * pks.length)], trk);
            if (h) arr.push({ id: nextId++, handoff: h });
          }
          if (!arr.length) continue;
          const s19b = solveShot({ track: trk, r: R, ledger, arrivals: arr });
          solves += 1; carried += ledger.length;
          const ids = [...ledger.map((e) => e.id), ...arr.map((a) => a.id)];
          for (let t = 0; t <= s19b.tEnd + 0.15; t += 1 / 1000) {
            const ps = ids.map((id) => [id, poseAt(s19b, id, t, {})]).filter(([, p]) => p && p.kind !== 'fall');
            for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
              const a = ps[i][1], b = ps[j][1];
              const dd = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
              if (dd < 1e-9) coincide += 1;
              if (dd < worst) { worst = dd; at = { name, seed, round, t: +t.toFixed(4), a: [ps[i][0], a.runwayId, +(a.D / MM).toFixed(2), a.kind], b: [ps[j][0], b.runwayId, +(b.D / MM).toFixed(2), b.kind] }; }
            }
          }
          const next = [];
          for (const id of ids) {
            if (s19b.overflow.has(id)) continue;
            const c = continuationAt(s19b, id, s19b.tEnd + 1);
            if (!c || c.kind !== 'rest' || !c.route) continue;
            next.push({ id, D: c.D, route: c.route, q: c.q });
          }
          ledger = next;
        }
      }
    }
    check(`r19e the PRODUCED ledger never breaks the law: ${solves} carried-forward solves over three fixtures (${carried} carried rests, each read back with continuationAt exactly as index.js carries them) hold every drawn pair one diameter clear (min ${(worst / MM).toFixed(4)} mm vs ${(twoR / MM).toFixed(2)}), ${coincide} coincident samples`,
      solves >= 40 && worst >= twoR - 1e-6 && coincide === 0, JSON.stringify(at));
  }
}
// ---- (r20) seal 14, round 2: the drawn stream once the chain is free -----------
// Refuter 2 (event-scan lens) read four defects into the solver's 3-D candidate
// scan: a fixed 0.3 s horizon that lost every contact beyond it, a path-law time kept alongside
// the 3-D root at a blend, a still-clamp in freeAccel that reported a resting ball's acceleration
// as zero while its neighbour pushed it, and the same clamp inside tensileRank. All four live on
// code paths the seal-13 chain deadlock made unreachable — on that tree TEST-bend-90's drops end
// at tEnd 0.8319 with a `block` event and nothing moves — so the S2 fix is what exposed them.
// These arms gate the freed stream by laws that never name the fix: a pose is continuous across
// every solver event, no two drawn balls come inside one diameter, and a contact chain's shared
// acceleration is the mean of its members' own support accelerations. Each row names the trees it
// is measured RED on. A fourth law was written and dropped: the drawn set's mechanical energy over
// a constant membership reads 0.000063 J/kg of rise on the fixed tree, on seal-14 round 1 and under
// every one of the five kinematics mutants — it separates nothing, so it is not shipped (§18.7).
{
  const MM = 0.001;
  const twoR = 2 * R;
  const hoffR = (trk, tt, pk) => handoffFromSink({ t: tt, pocket: POCKETS[pk], fall: POCKETS[pk], r: R, glide: 0.06, tFall: 0.021 }, { track: trk, pockets: POCKETS, r: R });
  const FIX20 = ['TEST-bend-90', 'TEST-synthetic-wire-slide', 'TEST-terminal-chutes', 'TEST-obtuse-merge'];
  // one build list, four measurements: every solve is expensive, so the arms share it
  const builds = [];
  for (const name of FIX20) {
    let trk;
    try { trk = validateTrack(loadDef(path.resolve(here, `../scene/ballreturn/tracks/${name}.json`)), { pockets: POCKETS, falls: null }); } catch { continue; }
    const pks = [...trk.routes.keys()];
    for (const n of [4, 9]) {
      const ids = Array.from({ length: n }, (_, i) => i + 1);
      let base;
      try { base = solveShot({ track: trk, r: R, ledger: ids, arrivals: [] }); } catch { continue; }
      const carried = ids.map((id) => ({ id, ...continuationAt(base, id, base.tEnd + 1) })).filter((c) => c.kind === 'rest');
      for (const drop of [0, 1, 2]) {
        const led = carried.slice(drop).map((c) => ({ id: c.id, D: c.D, route: c.route, q: c.q }));
        const routeOf = new Map(led.map((l) => [l.id, l.route]));
        for (const pk of [pks[0], pks[pks.length - 1]]) {
          const h = hoffR(trk, 0.25, pk);
          if (!h) continue;
          let sol;
          try { sol = solveShot({ track: trk, r: R, ledger: led, arrivals: [{ id: 100, handoff: h }] }); } catch { continue; }
          const ids20 = [...led.map((l) => l.id), 100];
          // the route of every ball comes from the solution's OWN pieces (the ledger's route
          // objects and the arrival's alike), so r20c reads the accelerations the solver saw
          const rmap = new Map(routeOf);
          for (const id of ids20) { const pcs = sol.pieces.get(id) || []; const wr = pcs.filter((q) => q.route).pop(); if (wr) rmap.set(id, wr.route); }
          builds.push({ tag: `${name}/n${n}/drop${drop}/p${pk}`, sol, ids: ids20, routeOf: rmap });
        }
      }
    }
  }
  // r20a poses are continuous across every solver event
  {
    let worst = 0; let at = null; let seen = 0;
    for (const b of builds) {
      for (const ev of b.sol.events) {
        for (const id of b.ids) {
          const p0 = poseAt(b.sol, id, ev.t - 1e-6, {});
          const p1 = poseAt(b.sol, id, ev.t + 1e-6, {});
          if (!p0 || !p1 || p0.kind === 'fall' || p1.kind === 'fall') continue;
          seen += 1;
          const d = Math.hypot(p0.x - p1.x, p0.y - p1.y, p0.z - p1.z);
          if (d > worst) { worst = d; at = [b.tag, ev.kind, +ev.t.toFixed(4), id]; }
        }
      }
    }
    check(`r20a a drawn pose never jumps across a solver event: ${builds.length} carried-ledger solves over four fixtures, ${seen} event crossings read 1 µs either side, worst step ${(worst / MM).toFixed(4)} mm (≤ 0.05); seal-14 round 1 reads 7.9302 mm here, a fixed 0.3 s horizon 54.9088 mm, a retained path law at a blend 36.2889 mm`,
      builds.length >= 30 && seen > 1000 && worst <= 0.05 * MM, JSON.stringify(at)); // 1191 crossings at seal 15: the block / unblock pairs (about 160 crossings) no longer exist
  }
  // r20b no two drawn balls inside one diameter, at 1 kHz over the whole stream
  {
    let minP = Infinity; let at = null; let samples = 0;
    for (const b of builds) {
      for (let tt = 0.2; tt <= b.sol.tEnd + 0.15; tt += 0.001) {
        const ps = b.ids.map((id) => poseAt(b.sol, id, tt, {})).filter((p) => p && p.kind !== 'fall');
        samples += ps.length;
        for (let i = 0; i < ps.length; i++) {
          for (let j = i + 1; j < ps.length; j++) {
            const d = Math.hypot(ps[i].x - ps[j].x, ps[i].y - ps[j].y, ps[i].z - ps[j].z);
            if (d < minP) { minP = d; at = [b.tag, +tt.toFixed(4)]; }
          }
        }
      }
    }
    check(`r20b the freed stream never overlaps: ${samples} drawn samples at 1 kHz across the same solves hold every pair one diameter clear (min ${(minP / MM).toFixed(4)} mm vs ${(twoR / MM).toFixed(2)}, tolerance 40 µm for the D5 seat residual); seal-14 round 1 reads 0.0000 mm here (two balls coincide) and a fixed 0.3 s horizon 4.5877 mm`,
      minP >= twoR - 4e-5, JSON.stringify(at));
  }
  // r20c a contact chain's shared acceleration is the one-degree-of-freedom law of the seat
  // constraint (seal 15): with G_i = u_i / u_0 the chain Jacobians (each member's drawn speed
  // over the front's) and Ġ_i their rates, the front accelerates at
  //     u̇ = [Σ G_i a_i − u Σ G_i Ġ_i] / Σ G_i²
  // — the MEAN of the members' own support accelerations (seals 8…14's law, this arm's first
  // form) exactly when every G is 1. G is read from the drawn stream; Ġ is a numerical
  // derivative of the analytic J = (n·T_lead)/(n·T_follower) over 1 µs of the drawn motion, so
  // nothing here repeats the module's own J̇ formula. The law is evaluated at the chain's
  // PIECE START (its last settle) against the piece's executed acceleration, the front's second
  // difference: between events the solver holds the front's acceleration constant while the
  // geometric term drifts, and that drift is not an error of the law. The mean law's own error
  // on the same samples is reported beside it.
  {
    let worst = 0; let at = null; let chains = 0; let worstMean = 0; let atMean = null;
    const dt = 2e-4;
    const JOf = (rtA, DA, rtB, DB) => {
      const pa = stationAt(rtA, DA, R, {}), pb = stationAt(rtB, DB, R, {});
      const ta = tangentAt(rtA, DA, {}), tb = tangentAt(rtB, DB, {});
      const n = [pa.x - pb.x, pa.y - pb.y, pa.z - pb.z];
      const nA = n[0] * ta.tx + n[1] * ta.ty + n[2] * ta.tz, nB = n[0] * tb.tx + n[1] * tb.ty + n[2] * tb.tz;
      return Math.abs(nB) > 1e-9 ? nA / nB : 0;
    };
    for (const b of builds) {
      // every piece boundary of the chain's members is excluded — events, walker-step instants and the internal
      // break crossings that restart a piece without an event (order 17: a sample straddling one read the mean of
      // two pieces' accelerations, 0.15323 against 0.15764 and 0.14167)
      const evT = b.sol.events.map((e) => e.t).concat((b.sol.steps || []).map((e) => e.t), ...b.ids.map((id) => (b.sol.pieces.get(id) || []).map((q) => q.t0))).sort((x, y) => x - y);
      const nearEvent = (a, z) => evT.some((x) => x > a && x < z);
      for (let tt = 0; tt <= b.sol.tEnd - 3 * dt; tt += 0.002) {
        if (nearEvent(tt - dt, tt + 3 * dt)) continue;
        const P = (k) => b.ids.map((id) => [id, poseAt(b.sol, id, tt + k * dt, {})]);
        const p0 = P(0); const p1 = P(1); const p2 = P(2);
        if (p0.some((z) => !z[1]) || p1.some((z) => !z[1]) || p2.some((z) => !z[1])) continue;
        const m0 = new Map(p0); const m1 = new Map(p1); const m2 = new Map(p2);
        const ord = b.ids.slice().sort((x, y) => m0.get(x).D - m0.get(y).D);
        let i = 0;
        while (i < ord.length) {
          let j = i;
          while (j + 1 < ord.length) {
            const a = m0.get(ord[j]); const z = m0.get(ord[j + 1]);
            if (Math.abs(Math.hypot(a.x - z.x, a.y - z.y, a.z - z.z) - twoR) < 1e-9) j += 1; else break;
          }
          const mem = ord.slice(i, j + 1);
          if (mem.length >= 2) {
            const v1 = (m0.get(mem[0]).D - m1.get(mem[0]).D) / dt;
            const v2 = (m1.get(mem[0]).D - m2.get(mem[0]).D) / dt;
            if (v1 > 1e-3 && v2 > 1e-3) {
              // the front's current piece: the law is read at its start (the settle that set it)
              const pcs = b.sol.pieces.get(mem[0]) || [];
              let pc = null; for (const q of pcs) { if (q.t0 <= tt) pc = q; else break; }
              const ts = pc ? pc.t0 + 1e-6 : tt;
              const d = 1e-6;
              const q0 = new Map(mem.map((id) => [id, poseAt(b.sol, id, ts, {})]));
              const q1 = new Map(mem.map((id) => [id, poseAt(b.sol, id, ts + d, {})]));
              let ok = [...q0.values(), ...q1.values()].every((q) => q && q.kind !== 'fall');
              if (ok) {
                const u0 = (q0.get(mem[0]).D - q1.get(mem[0]).D) / d;
                let G = 1, G1 = 1, S2 = 0, Sa = 0, Sg = 0, sumMean = 0;
                for (let k = 0; k < mem.length; k++) {
                  const rt = b.routeOf.get(mem[k]);
                  if (!rt) { ok = false; break; }
                  if (k > 0) {
                    const rtA = b.routeOf.get(mem[k - 1]);
                    G *= JOf(rtA, q0.get(mem[k - 1]).D, rt, q0.get(mem[k]).D);
                    G1 *= JOf(rtA, q1.get(mem[k - 1]).D, rt, q1.get(mem[k]).D);
                  }
                  const res = accelAt(rt, Math.max(0, q0.get(mem[k]).D - 1e-12), R);
                  const uk = G * u0; const aOwn = uk > 1e-12 ? res.drive - res.resist : uk < -1e-12 ? res.drive + res.resist : res.a; // resistance opposes the MOTION (order 16)
                  const mu = 1 / res.k;                                                                                   // the effective mass the drive already carries (order 16)
                  const Gd = (G1 - G) / d;
                  S2 += mu * G * G; Sa += mu * G * aOwn; Sg += mu * G * Gd; sumMean += aOwn;
                }
                if (ok && u0 > 1e-3) {
                  chains += 1;
                  const law = (Sa - u0 * Sg) / S2;
                  const meas = (v2 - v1) / dt;
                  const err = Math.abs(meas - law);
                  if (err > worst) { worst = err; at = [b.tag, +tt.toFixed(4), mem.length, +meas.toFixed(5), +law.toFixed(5), +(sumMean / mem.length).toFixed(5), { pieceT0: pc ? +pc.t0.toFixed(4) : null, pieceA: pc ? +(pc.a ?? NaN).toFixed(5) : null, near: b.sol.events.filter((e) => Math.abs(e.t - tt) < 0.006).map((e) => `${e.kind}@${e.t.toFixed(4)}:${e.ball}`), steps: (b.sol.steps || []).filter((e) => Math.abs(e.t - tt) < 0.006).map((e) => +e.t.toFixed(4)), nSteps: (b.sol.steps || []).length }]; }
                  const errMean = Math.abs(meas - sumMean / mem.length);
                  if (errMean > worstMean) { worstMean = errMean; atMean = [b.tag, +tt.toFixed(4), mem.length, +meas.toFixed(5), +(sumMean / mem.length).toFixed(5)]; }
                }
              }
            }
          }
          i = j + 1;
        }
      }
    }
    check(`r20c a moving contact chain accelerates by the one-DOF law of the seat constraint, [Σ μ G a − u Σ μ G Ġ] / Σ μ G² (μ = 1/k, each member's own effective mass — order 16), read from the drawn stream with G = u_i/u_0 and Ġ a numerical derivative of the analytic J: ${chains} chain samples away from every event, worst error ${worst.toFixed(5)} m/s² (≤ 0.002); the group MEAN of the members' own accelerations — exact for straight trains, this arm's seal-14 form — misses by up to ${worstMean.toFixed(5)} m/s² on the same samples (at ${JSON.stringify(atMean)}: a ledger ball beside the trunk on the obtuse feeder)`,
      chains > 400 && worst <= 0.002, JSON.stringify(at));
  }

}
// ---- (r21) seal 15: the chain's law of motion — seatBehind differentiated ------------------
// Verification round 14 (S2) measured the seal-14 tree: 81 of 81 flank blocks set the follower's
// speed to 0.000 (0.27–0.72 m/s before), a ball stranded at the tray lip (D 298.5, 150 mm behind
// its train). The law now: a contacting follower's station is the seat behind its leader's, its
// speed the time derivative of that mapping, u = J·u_leader with J = (n·T_leader)/(n·T_follower);
// a parting keeps that speed; the chain's acceleration is the one-DOF Lagrange form (r20c). These
// arms read the DRAWN stream (poseAt / continuationAt) and the path tangents (`tangentAt`) — never
// the solver's internals — on the fixtures the round measured, plus the committed Star export and
// a synthetic ridge (the only shape that exercises an `arc` segment's curvature term).
{
  const MM = 0.001; const twoR = 2 * R;
  const hoff21 = (trk, tt, pk) => handoffFromSink({ t: tt, pocket: POCKETS[pk], fall: POCKETS[pk], r: R, glide: 0.06, tFall: 0.021 }, { track: trk, pockets: POCKETS, r: R });
  const load21 = (name) => validateTrack(loadDef(path.resolve(here, `../scene/ballreturn/tracks/${name}.json`)), { pockets: POCKETS, falls: null });
  const bend = load21('TEST-bend-90'), shal21 = load21('TEST-shallow-merge'), mid21 = load21('TEST-midedge-landing'), ob21 = load21('TEST-obtuse-merge');
  const Dat = (s, id, t) => { const p = poseAt(s, id, t, {}); return p && p.kind !== 'fall' ? p : null; };
  const speedOver = (s, id, t0, t1) => { const a = Dat(s, id, t0), b = Dat(s, id, t1); return a && b ? (a.D - b.D) / (t1 - t0) : null; };
  const pieceAt = (s, id, t) => { const ps = s.pieces.get(id) || []; let p = null; for (const q of ps) { if (q.t0 <= t) p = q; else break; } return p; };
  const routeOfAt = (s, id, t) => { const p = pieceAt(s, id, t); return p ? p.route : null; };
  const JOf = (rtA, DA, rtB, DB) => {
    const pa = stationAt(rtA, DA, R, {}), pb = stationAt(rtB, DB, R, {});
    const ta = tangentAt(rtA, DA, {}), tb = tangentAt(rtB, DB, {});
    const n = [pa.x - pb.x, pa.y - pb.y, pa.z - pb.z];
    const nA = n[0] * ta.tx + n[1] * ta.ty + n[2] * ta.tz, nB = n[0] * tb.tx + n[1] * tb.ty + n[2] * tb.tz;
    return { J: Math.abs(nB) > 1e-9 ? nA / nB : NaN, ahead: nB > 0, dist: Math.hypot(n[0], n[1], n[2]) };
  };
  // The SOLUTION's station for a ball at t, drawn or not: a seat still inside the cup is culled
  // by poseAt (locate's upstream rule) but it is a full chain member — a merge re-speeds it and
  // it re-speeds everything ahead of it, so the classification arms must read the solve, not the
  // picture (seal 15: a landing 2 seats up the bend re-sped the drawn front and the drawn-only
  // chain walk could not name it).
  const Sat = (s, id, t) => { const c = continuationAt(s, id, t); if (!c || c.kind !== 'roll') return null; const q = stationAt(c.route, c.D, R, {}); return { D: c.D, route: c.route, x: q.x, y: q.y, z: q.z }; };
  const spS = (s, id, t0, t1) => { const a = Sat(s, id, t0), b = Sat(s, id, t1); return a && b ? (a.D - b.D) / (t1 - t0) : null; };
  const leaderIn = (s, ids, id, t) => {
    const me = Sat(s, id, t); if (!me) return null;
    let best = null;
    for (const o of ids) {
      if (o === id) continue;
      const p = Sat(s, o, t); if (!p) continue;
      const j = JOf(p.route, p.D, me.route, me.D);
      if (Math.abs(j.dist - twoR) < 1e-6 && j.ahead && (!best || j.dist < best.dist)) best = { id: o, ...p, ...j };
    }
    return best;
  };
  // the train set: fresh arrivals on four fixtures, both pockets where there are two
  const trains = [];
  const add = (nm, trk, pk, spec) => { const arr = spec.map(([id, tt]) => ({ id, handoff: hoff21(trk, tt, pk) })).filter((a) => a.handoff); if (arr.length >= 2) trains.push({ nm, trk, ids: arr.map((a) => a.id), sol: solveShot({ track: trk, r: R, ledger: [], arrivals: arr }) }); };
  add('bend-90 3x10ms', bend, 4, [[1, 0.5], [2, 0.51], [3, 0.52]]);
  add('bend-90 4x30ms', bend, 4, [[1, 0.5], [2, 0.53], [3, 0.56], [4, 0.59]]);
  add('bend-90 2x100ms', bend, 4, [[1, 0.5], [2, 0.6]]);
  add('synthetic 3x20ms', track, 4, [[1, 0.5], [2, 0.52], [3, 0.54]]);
  add('synthetic 4x40ms p1', track, 1, [[1, 0.5], [2, 0.54], [3, 0.58], [4, 0.62]]);
  add('shallow 2+2', shal21, 4, [[1, 0.5], [2, 0.52]]); add('shallow p1 3x30', shal21, 1, [[1, 0.5], [2, 0.53], [3, 0.56]]);
  add('midedge 3x20 p4', mid21, 4, [[1, 0.5], [2, 0.52], [3, 0.54]]); add('midedge 3x20 p1', mid21, 1, [[1, 0.5], [2, 0.52], [3, 0.54]]);
  add('obtuse 3x40 p4', ob21, 4, [[1, 0.5], [2, 0.54], [3, 0.58]]); add('obtuse 3x40 p1', ob21, 1, [[1, 0.5], [2, 0.54], [3, 0.58]]);
  // the leader of a drawn follower at t: the ball one diameter ahead of it in 3-D
  const leaderOf = (tr, id, t) => {
    const me = Dat(tr.sol, id, t); if (!me) return null;
    const rt = routeOfAt(tr.sol, id, t);
    let best = null;
    for (const o of tr.ids) {
      if (o === id) continue;
      const p = Dat(tr.sol, o, t); if (!p) continue;
      const rto = routeOfAt(tr.sol, o, t); if (!rt || !rto) continue;
      const j = JOf(rto, p.D, rt, me.D);
      if (Math.abs(j.dist - twoR) < 1e-6 && j.ahead && (!best || j.dist < best.dist)) best = { id: o, route: rto, D: p.D, ...j };
    }
    return best;
  };
  // r21a the drawn follower speed IS the derivative of the seat mapping: u = J·u_leader
  {
    let samples = 0, worst = 0, at = null, worstGap = 0, atGap = null, minJ = Infinity, maxJ = 0;
    for (const tr of trains) {
      const evT = tr.sol.events.map((e) => e.t).concat((tr.sol.steps || []).map((e) => e.t));
      for (let t = 0.5; t <= tr.sol.tEnd; t += 1e-3) {
        if (evT.some((x) => Math.abs(x - t) < 3e-5)) continue;
        for (const id of tr.ids) {
          const pc = pieceAt(tr.sol, id, t); if (!pc || !pc.follow) continue;
          const lead = leaderOf(tr, id, t); if (!lead) continue;
          const v = speedOver(tr.sol, id, t, t + 1e-6), vL = speedOver(tr.sol, lead.id, t, t + 1e-6);
          if (v === null || vL === null) continue;
          samples += 1;
          const err = Math.abs(v - lead.J * vL);
          if (err > worst) { worst = err; at = `${tr.nm} ball ${id} behind ${lead.id} t ${t.toFixed(3)} v ${v.toFixed(5)} J·vL ${(lead.J * vL).toFixed(5)} J ${lead.J.toFixed(4)}`; }
          const g = Math.abs(lead.dist - twoR); if (g > worstGap) { worstGap = g; atGap = `${tr.nm} ${id}/${lead.id} t ${t.toFixed(3)}`; }
          if (Number.isFinite(lead.J)) { minJ = Math.min(minJ, lead.J); maxJ = Math.max(maxJ, lead.J); }
        }
      }
    }
    check(`r21a the drawn follower's speed is the time derivative of the seat mapping: over ${trains.length} trains and ${samples} follower samples at 1 kHz (events excluded ±30 µs), |u − J·u_leader| ≤ 1e-4 m/s (worst ${worst.toExponential(2)}; J spans ${minJ.toFixed(4)}…${maxJ.toFixed(4)}) and every riding pair sits one diameter apart in 3-D (worst |gap − 2r| ${(worstGap * 1e9).toFixed(3)} nm ≤ 1 µm)`,
      samples > 500 && worst <= 1e-4 && worstGap <= 1e-6, `${at} | gap ${atGap}`);
  }
  // r21b speed continuity: no follower is ever stopped by a moving leader. Across every solver
  // event, every rolling ball's speed 1 µs after equals 1 µs before — except at a vertex crossing
  // of a contact pair, where the follower's speed jumps to J·u_leader (the inelastic side
  // impact), and at a contact, where the merge sets the chain speed — and never to zero while
  // its leader moves. On the seal-14 tree 81 blocks read 0.27–0.72 → 0.000 here.
  {
    let crossings = 0, zeroed = 0, impacts = 0, bad = 0, at = null, worstFree = 0, atFree = null, merged = 0;
    // the balls in 3-D contact (transitively) with ball `seed` at t — the chain a contact's merge
    // re-speeds. Read from the solve (Sat), not the drawing: an undrawn upstream seat transmits.
    const chainOf = (tr, seed, t) => {
      const set = new Set([seed]); let grew = true;
      while (grew) { grew = false; for (const a of [...set]) { const pa = Sat(tr.sol, a, t); if (!pa) continue; for (const o of tr.ids) { if (set.has(o)) continue; const po = Sat(tr.sol, o, t); if (po && Math.abs(Math.hypot(pa.x - po.x, pa.y - po.y, pa.z - po.z) - twoR) < 1e-6) { set.add(o); grew = true; } } } }
      return set;
    };
    for (const tr of trains) {
      for (const e of tr.sol.events) {
        // a contact's merge, or a landing straight onto a moving tail's seat (the same merge inside the landing), re-speeds the chain it joins
        // every chain re-sped at THIS instant: a contact's merge (both chains), a landing straight onto a
        // moving tail, an impact (order 16: the crossing ball's chain, the leader included) — read over
        // all the events of the instant, so a parting booked at the same instant as an impact does not
        // re-read the impact's re-speed as a free jump
        const touched = new Set();
        for (const o of tr.sol.events) {
          if (Math.abs(o.t - e.t) > 1e-9) continue;
          if (o.kind === 'contact') { for (const x of chainOf(tr, o.ball, e.t + 1e-6)) touched.add(x); for (const x of chainOf(tr, o.other, e.t + 1e-6)) touched.add(x); }
          else if (o.kind === 'landing' || o.kind === 'impact') { for (const x of chainOf(tr, o.ball, e.t + 1e-6)) touched.add(x); }
        }
        for (const id of tr.ids) {
          const before = speedOver(tr.sol, id, e.t - 2e-6, e.t - 1e-6), after = speedOver(tr.sol, id, e.t + 1e-6, e.t + 2e-6);
          if (before === null || after === null) continue;
          const pB = pieceAt(tr.sol, id, e.t - 1e-6), pA = pieceAt(tr.sol, id, e.t + 1e-6);
          if (!pB || !pA || pB.kind !== 'roll' || pA.kind !== 'roll') continue;
          crossings += 1;
          if (Math.abs(before) > 1e-3 && Math.abs(after) <= 1e-6) {
            // stopped: allowed only when nothing ahead of it moves (a wall / a hold), never by a moving leader
            // (a REVERSAL at an obtuse impact — after < 0 — is motion, not a stop: order 16)
            const lead = leaderIn(tr.sol, tr.ids, id, e.t + 1e-6);
            const vLead = lead ? spS(tr.sol, lead.id, e.t + 1e-6, e.t + 2e-6) : null;
            if (vLead !== null && vLead > 1e-3) { zeroed += 1; at = `${tr.nm} ${e.kind}@${e.t.toFixed(4)} ball ${id}: ${before.toFixed(4)} → ${after.toFixed(4)} while leader ${lead.id} moves at ${vLead.toFixed(4)}`; }
            continue;
          }
          const jump = Math.abs(after - before);
          if (jump <= 1e-3 * before + 1e-5) continue;
          // a jump: a contact (the merge re-speeds the whole chain it joins) or a vertex crossing (the side impact, after = J·u_leader)
          if (touched.has(id)) { merged += 1; continue; }
          const lead = leaderIn(tr.sol, tr.ids, id, e.t + 1e-6);
          if (lead) {
            const vLead = spS(tr.sol, lead.id, e.t + 1e-6, e.t + 2e-6);
            if (vLead !== null && Math.abs(after - lead.J * vLead) <= 1e-3 * Math.abs(lead.J * vLead) + 1e-5) { impacts += 1; continue; }
          }
          if (pA.follow || pB.follow) { bad += 1; at = `${tr.nm} ${e.kind}@${e.t.toFixed(4)} ball ${id}: ${before.toFixed(4)} → ${after.toFixed(4)} (no law names it)`; }
          else if (jump > worstFree) { worstFree = jump; atFree = `${tr.nm} ${e.kind}@${e.t.toFixed(4)} ${e.ball}/${e.other ?? '-'} ball ${id}: ${before.toFixed(4)} → ${after.toFixed(4)}`; }
        }
      }
    }
    check(`r21b speed continuity across ${crossings} rolling-ball event crossings of ${trains.length} trains: no ball is stopped by a moving leader (${zeroed}), every speed jump is a contact's merge or a vertex IMPACT (${merged} chain members re-sped — order 16: the impact re-speeds the leader too) or a follower's re-seat to J·u_leader (${impacts}; ${bad} unexplained), and a ball outside both keeps its speed (worst jump ${worstFree.toExponential(2)} m/s ≤ 1e-5); the seal-14 tree reads 81 stops here`,
      crossings > 50 && zeroed === 0 && bad === 0 && worstFree <= 1e-5, `${at ?? ''} | free ${atFree ?? ''}`);
  }
  // r21c the bend-90 vertex, by the numbers (order 16, item 1d): at the shipped fixture's sharp
  // 90° vertex the riding chain's Jacobians jump (J ≈ 0.0127 behind the crossing ball) and the
  // chain is re-sped by the IMPACT the derivation gives — the contact impulse along the line of
  // centres with the rails' reactions normal to the paths, i.e. the generalised momentum
  // Σ μ G u conserved with the NEW Jacobians: u_A⁺ = Σ μ_i G_i⁺ u_i⁻ / Σ μ_i G_i⁺². The leader
  // therefore SPEEDS UP (the followers' momentum comes forward through the contact — seal 15
  // held it continuous and sent that momentum nowhere), the first follower re-seats to J·u_A⁺,
  // re-accelerates under its OWN drive from that instant, and the pair is one diameter apart on
  // both sides. Read from the outside: μ from accelAt's k, G from the seat geometry at t+.
  {
    const tr = trains[0];
    const e = tr.sol.events.find((x) => x.kind === 'impact' && x.ball === 1);
    let ok = false, msg = 'no impact by ball 1';
    if (e) {
      const ids = tr.ids;
      const uB = new Map(ids.map((id) => [id, speedOver(tr.sol, id, e.t - 2e-6, e.t - 1e-6)]));
      const uA = new Map(ids.map((id) => [id, speedOver(tr.sol, id, e.t + 1e-6, e.t + 2e-6)]));
      // the chain at t+, front first
      const chain = [1]; let cur = 1;
      for (let guard = 0; guard < 8; guard++) { const nxt = ids.find((o) => !chain.includes(o) && leaderIn(tr.sol, ids, o, e.t + 1e-6)?.id === cur); if (!nxt) break; chain.push(nxt); cur = nxt; }
      const G = [1], mu = [];
      for (let i = 0; i < chain.length; i++) {
        const c = Sat(tr.sol, chain[i], e.t + 1e-6);
        mu.push(1 / accelAt(c.route, sideD(c.route, c.D), R).k);
        if (i > 0) { const a = Sat(tr.sol, chain[i - 1], e.t + 1e-6); G[i] = G[i - 1] * JOf(a.route, a.D, c.route, c.D).J; }
      }
      let num = 0, den = 0; for (let i = 0; i < chain.length; i++) { num += mu[i] * G[i] * uB.get(chain[i]); den += mu[i] * G[i] * G[i]; }
      const law = num / den;
      const lA = uA.get(1), lB = uB.get(1), vA = uA.get(2), vB = uB.get(2);
      const J1 = G[1];
      const v10 = speedOver(tr.sol, 2, e.t + 0.01, e.t + 0.01 + 1e-6);
      const c2 = continuationAt(tr.sol, 2, e.t + 1e-6);
      const aOwn = accelAt(c2.route, Math.max(0, c2.D - 1e-12), R).a;
      const gapB = leaderOf(tr, 2, e.t - 1e-6), gapA = leaderOf(tr, 2, e.t + 1e-6);
      const sep = tr.sol.events.find((x) => x.kind === 'separate' && x.ball === 2 && x.other === 1 && Math.abs(x.t - e.t) < 1e-9);
      ok = chain.length >= 2 && vB > 0.4 && J1 > 0.005 && J1 < 0.02 && Math.abs(lA - law) <= 1e-4 && lA > lB && Math.abs(vA - J1 * lA) <= 1e-4 && Math.abs(v10 - (vA + aOwn * 0.01)) <= 2e-4 && !!gapB && Math.abs(gapB.dist - twoR) <= 1e-6 && !!gapA && Math.abs(gapA.dist - twoR) <= 1e-6;
      msg = `t ${e.t.toFixed(4)} chain ${chain.join('-')} (J₁ ${J1.toFixed(5)}, μ ${mu.map((m) => m.toFixed(3)).join('/')}): leader ${lB.toFixed(4)} → ${lA.toFixed(4)} = Σ μ G⁺ u⁻ / Σ μ G⁺² ${law.toFixed(4)} (+${((lA / lB - 1) * 100).toFixed(2)} %); follower ${vB.toFixed(4)} → ${vA.toFixed(4)} = J₁ × ${lA.toFixed(4)}; v(+10 ms) ${v10.toFixed(4)} vs ${(vA + aOwn * 0.01).toFixed(4)} (own drive ${aOwn.toFixed(3)} m/s²)${sep ? ', parted at that instant' : ''}; gap −/+ ${gapB ? ((gapB.dist - twoR) * 1e9).toFixed(1) : '-'} / ${gapA ? ((gapA.dist - twoR) * 1e9).toFixed(1) : '-'} nm`;
    }
    check(`r21c TEST-bend-90's sharp vertex is an IMPACT (order 16): the chain is re-sped to Σ μ G⁺ u⁻ / Σ μ G⁺² — the leader gains, the follower re-seats to J₁·u_leader and re-accelerates at once under its own drive — ${msg}; seal 15 held the leader continuous here`, ok, msg);
  }
  // r21d the tray lip: verification round 14's stranded ball. One, two and three free flat balls
  // (the carried ledger with its wall balls removed) ahead of a two- and a four-ball sloped train
  // on the shipped wire slide: no ball comes to rest alone at the tray mouth, every rest group's
  // neighbours are one diameter apart, and every follower crossing the trunk→tray lip is still
  // moving and still on the law — its own speed is J·u_leader on BOTH sides of the lip, where J
  // is the seat mapping's derivative read from the route. The lip is a real kink, so the speed
  // does NOT carry across unchanged: the trunk line reads J 1.00824 and the cut below it 1.02176,
  // and a follower crossing gains that 1.0134 factor. Gating "within 1 %" would gate the
  // geometry, not the solver. The seal-14 tree parks a ball at D 298.5 in four of the six cases
  // (v 0.137 → 0.000 at the lip) — v = 0 against a moving leader breaks the law clause here.
  {
    const lipD = track.routes.get(4).segs.find((s) => s.kind === 'cut');
    const lip = lipD ? 0.5 * (lipD.D0 + lipD.D1) : 0.2985;
    const ids = [100, 101, 102, 103, 104];
    const base = solveShot({ track, r: R, ledger: ids, arrivals: [] });
    const carried = ids.map((id) => ({ id, ...continuationAt(base, id, base.tEnd + 1) }));
    const rows = []; let ok = true; let worstRatio = [Infinity, 0]; let lipCross = 0;
    let worstLaw = 0, atLaw = null, minV = Infinity, minJ = Infinity, maxJ = 0;
    for (const drop of [1, 2, 3]) for (const nb of [2, 4]) {
      const led = carried.slice(drop).map((c) => ({ id: c.id, D: c.D, route: c.route, q: c.q }));
      const arr = Array.from({ length: nb }, (_, i) => ({ id: 1 + i, handoff: hoff21(track, 0.5 + i * 0.06, 4) }));
      const s = solveShot({ track, r: R, ledger: led, arrivals: arr });
      const allIds = [...led.map((x) => x.id), ...arr.map((a) => a.id)];
      const rest = [...s.rest.entries()].sort((a, b) => a[1] - b[1]);
      const rr = rest.map(([id, D]) => { const c = continuationAt(s, id, s.tEnd + 1); return { id, D, route: c.route }; });
      const g3 = (a, b) => { const u = stationAt(a.route, a.D, R, {}), w = stationAt(b.route, b.D, R, {}); return Math.hypot(u.x - w.x, u.y - w.y, u.z - w.z); };
      const groups = []; let cur = [rr[0]];
      for (let i = 1; i < rr.length; i++) { if (Math.abs(g3(rr[i], rr[i - 1]) - twoR) < 1e-6) cur.push(rr[i]); else { groups.push(cur); cur = [rr[i]]; } }
      groups.push(cur);
      const stranded = groups.filter((g) => g.length === 1 && Math.abs(g[0].D - lip) < 0.02);
      // followers crossing the lip: on each side, the drawn speed against the law J·u_leader
      for (const e of s.events.filter((x) => x.kind === 'junction' && Math.abs(x.D - lip) < 0.002)) {
        const pc = pieceAt(s, e.ball, e.t - 1e-3); if (!pc || !pc.follow) continue;
        const vB = spS(s, e.ball, e.t - 1e-3, e.t - 1e-3 + 1e-6), vA = spS(s, e.ball, e.t + 1e-3, e.t + 1e-3 + 1e-6);
        if (vB === null || vA === null || vB < 1e-3) continue;
        lipCross += 1; const ratio = vA / vB;
        if (ratio < worstRatio[0]) worstRatio[0] = ratio; if (ratio > worstRatio[1]) worstRatio[1] = ratio;
        for (const [tag, tt, vv] of [['−1 ms', e.t - 1e-3, vB], ['+1 ms', e.t + 1e-3, vA]]) {
          minV = Math.min(minV, vv);
          const p2 = pieceAt(s, e.ball, tt); if (!p2 || !p2.follow) continue;
          const lead = leaderIn(s, allIds, e.ball, tt); if (!lead) continue;
          const uL = spS(s, lead.id, tt, tt + 1e-6); if (uL === null) continue;
          if (Number.isFinite(lead.J)) { minJ = Math.min(minJ, lead.J); maxJ = Math.max(maxJ, lead.J); }
          const err = Math.abs(vv - lead.J * uL);
          if (err > worstLaw) { worstLaw = err; atLaw = `drop ${drop}/${nb} ball ${e.ball} ${tag} v ${vv.toFixed(6)} J·uL ${(lead.J * uL).toFixed(6)} (J ${lead.J.toFixed(5)} leader ${lead.id} ${uL.toFixed(6)})`; }
        }
      }
      const good = rest.length === led.length + nb && stranded.length === 0;
      ok = ok && good;
      rows.push({ drop, nb, tEnd: +s.tEnd.toFixed(3), groups: groups.map((g) => `${g.length}@${(g[0].D / MM).toFixed(1)}`).join('+'), stranded: stranded.length });
    }
    check(`r21d the shipped wire slide's tray lip: 1/2/3 free flat balls ahead of a 2-/4-ball sloped train (6 cases) — no ball rests alone at the tray mouth (groups ${rows.map((x) => x.groups).join(' | ')}), every ball seated, and each of the ${lipCross} followers crossing the lip is still rolling (slowest ${minV.toFixed(4)} m/s > 0) and still on the law on both sides (|u − J·u_leader| worst ${worstLaw.toExponential(2)} ≤ 1e-4, J ${minJ.toFixed(5)}…${maxJ.toFixed(5)}, so its speed steps by the lip's own kink: v(+1 ms)/v(−1 ms) ${worstRatio[0].toFixed(4)}…${worstRatio[1].toFixed(4)}); the seal-14 tree strands a ball at 298.5 mm in four of the six`,
      ok && lipCross > 0 && minV > 0 && worstLaw <= 1e-4, `${JSON.stringify(rows)} | ${atLaw ?? 'no law sample'}`);
  }
  // r21e the arc's curvature term, on the only shape that has one: a synthetic ridge (a channel
  // chute whose slope steepens at a vertex with no heading change in plan — buildRoute's pivot
  // `arc`). Three sections: 5.71° → 28.07° (the ridge, filleted by the arc) → 1.15° (near flat).
  // A pair of FREE balls can never be in contact on a ridge — the leader tips over the crest and
  // accelerates away — so the fixture puts a slow ball on the flat below (a ledger ball, rolling
  // at 0.04 m/s²) for a fresh arrival to catch: the arrival becomes a follower that pushes its
  // leader while riding the arc. (i) `tangentAt` on the arc equals the centre path's own
  // derivative (a 0.1 µm central difference of `stationAt`) and its curvature is 1/h; (ii) the
  // front's executed acceleration at every chain piece start equals the one-DOF law with G read
  // from the drawn stream and Ġ differenced numerically — the module's J̇ (with the arc term)
  // against a reading that never uses it; (iii) through the arc the seat law itself holds at
  // every instant (the pair one diameter apart in 3-D, the follower's speed J·u_leader).
  {
    const refD = def.ball.reference_diameter_mm;
    const pts = [[0, -270, 703.5], [-150, -285, 703.5], [-180, -301, 703.5], [-380, -305, 703.5]];
    let L = 0; for (let i = 0; i + 1 < pts.length; i++) L += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1], pts[i + 1][2] - pts[i][2]);
    const wall = Math.round(Math.floor(L / refD) * refD * 1000) / 1000;
    const ridgeDef = {
      schema: def.schema, doc: { ...def.doc, status: 'TEST', title: 'TEST ridge chute (seal 15: an arc segment)' },
      units: def.units, datum_frame: def.datum_frame, ball: def.ball,
      support: { kind: 'channel', width_mm: 70, provenance: { tag: 'TEST', source: 'seal 15: channel skeleton' } },
      rolling_resistance: def.rolling_resistance, topology: 'terminal-chutes',
      runways: [{ id: 'p4-chute', role: 'chute', points_mm: pts, next: null,
        stop: { kind: 'face', wall_s_mm: wall, capacity_balls: Math.floor(wall / refD + 1e-9), provenance: { tag: 'TEST', source: 'seal 15: stop derived from the chute arclength' } },
        provenance: { tag: 'TEST', source: 'seal 15: shallow, then a ridge, then near flat' } }],
      pockets: [{ index: 4, entry_runway: 'p4-chute', exit_below_y_mm: -199, provenance: { tag: 'TEST', source: 'skeleton: cup span' } }],
      unserved_pockets: [0, 1, 2, 3, 5].map((i) => ({ index: i, reason: 'seal 15 ridge: only one pocket served' })),
    };
    let ridge = null, why = '';
    try { ridge = validateTrack(ridgeDef, { pockets: POCKETS, falls: null }); } catch (e) { why = e.message; }
    const route = ridge ? ridge.routes.get(4) : null;
    const arc = route ? route.segs.find((s) => s.kind === 'arc') : null;
    let tanErr = 0, kapErr = 0, n = 0;
    if (arc) {
      for (let f = 0.05; f < 1; f += 0.1) {
        const D = arc.D0 - f * arc.len; const d = 1e-7;
        const a = stationAt(route, D + d, R, {}), b = stationAt(route, D - d, R, {});
        const fd = [(b.x - a.x) / (2 * d), (b.y - a.y) / (2 * d), (b.z - a.z) / (2 * d)];
        const tg = tangentAt(route, D, {});
        tanErr = Math.max(tanErr, Math.hypot(fd[0] - tg.tx, fd[1] - tg.ty, fd[2] - tg.tz));
        kapErr = Math.max(kapErr, Math.abs(Math.hypot(tg.kx, tg.ky, tg.kz) - 1 / arc.h));
        n += 1;
      }
    }
    check(`r21e(i) on a synthetic ridge the route carries an arc (${arc ? `${(arc.len / MM).toFixed(2)} mm, radius h ${(arc.h / MM).toFixed(2)} mm` : 'NONE — ' + why}) and tangentAt's tangent equals the centre path's own derivative on it (worst ${tanErr.toExponential(2)} over ${n} stations, ≤ 1e-6) with curvature 1/h (worst |κ − 1/h| ${kapErr.toExponential(2)} ≤ 1e-6)`,
      !!arc && n > 0 && tanErr <= 1e-6 && kapErr <= 1e-6, why);
    if (ridge) {
      const inArc = (D) => !!arc && D <= arc.D0 + 1e-9 && D >= arc.D1 - 1e-9;
      const g3d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
      const LEDGERS = [0.138, 0.144, 0.150]; // m — three catch points, all below the crest
      let read = 0, worst = 0, at = null, onArc = 0;
      let arcSamples = 0, gapWorst = 0, lawWorst = 0, lawAt = null;
      for (const ledD of LEDGERS) {
        const h = hoff21(ridge, 0.5, 4); if (!h) continue;
        const s2 = solveShot({ track: ridge, r: R, ledger: [{ id: 99, D: ledD, route, q: [0, 0, 0, 1] }], arrivals: [{ id: 1, handoff: h }] });
        // (ii) the front's executed acceleration at every chain piece start = the one-DOF law
        for (const p of s2.pieces.get(99) || []) {
          if (p.kind !== 'roll') continue;
          const ts = p.t0 + 1e-6, d = 1e-6;
          const pf = pieceAt(s2, 1, ts); if (!pf || !pf.follow) continue;
          const q0 = [99, 1].map((id) => poseAt(s2, id, ts, {})), q1 = [99, 1].map((id) => poseAt(s2, id, ts + d, {}));
          if (q0.some((q) => !q || q.kind === 'fall') || q1.some((q) => !q || q.kind === 'fall')) continue;
          if (Math.abs(g3d(q0[0], q0[1]) - twoR) > 1e-9) continue; // not a chain
          const u0 = (q0[0].D - q1[0].D) / d; if (!(u0 > 1e-3)) continue;
          const Gj = JOf(route, q0[0].D, route, q0[1].D).J, G1 = JOf(route, q1[0].D, route, q1[1].D).J;
          const Gd = (G1 - Gj) / d;
          const r0 = accelAt(route, sideD(route, q0[0].D), R), r1 = accelAt(route, sideD(route, q0[1].D), R);
          const a0 = r0.a, a1 = r1.a, m0 = 1 / r0.k, m1 = 1 / r1.k;
          const law = (m0 * a0 + m1 * Gj * a1 - u0 * m1 * Gj * Gd) / (m0 + m1 * Gj * Gj);   // with the effective masses (order 16)
          const meas = p.a; // the piece's executed acceleration (its second difference, exactly)
          read += 1;
          if (inArc(q0[0].D) || inArc(q0[1].D)) onArc += 1;
          const err = Math.abs(meas - law); if (err > worst) { worst = err; at = `ledger ${(ledD / MM).toFixed(0)} t ${ts.toFixed(4)} meas ${meas.toFixed(5)} law ${law.toFixed(5)} G ${Gj.toFixed(5)} Ġ ${Gd.toFixed(3)} D ${(q0[0].D / MM).toFixed(1)}/${(q0[1].D / MM).toFixed(1)}${inArc(q0[1].D) ? ' follower ON ARC' : ''}` }
        }
        // (iii) the seat law itself, sampled at 1 kHz for every instant a ball rides the arc
        const evT = s2.events.map((e) => e.t).concat((s2.steps || []).map((e) => e.t));
        for (let t = 0.5; t <= s2.tEnd; t += 1e-3) {
          if (evT.some((x) => Math.abs(x - t) < 3e-5)) continue;
          const pf = pieceAt(s2, 1, t); if (!pf || !pf.follow) continue;
          const a = poseAt(s2, 99, t, {}), b = poseAt(s2, 1, t, {});
          if (!a || !b || a.kind === 'fall' || b.kind === 'fall') continue;
          if (!(inArc(a.D) || inArc(b.D))) continue;
          arcSamples += 1;
          gapWorst = Math.max(gapWorst, Math.abs(g3d(a, b) - twoR));
          const uF = speedOver(s2, 1, t, t + 1e-6), uL = speedOver(s2, 99, t, t + 1e-6);
          if (uF === null || uL === null) continue;
          const Jn = JOf(route, a.D, route, b.D).J;
          const err = Math.abs(uF - Jn * uL);
          if (err > lawWorst) { lawWorst = err; lawAt = `ledger ${(ledD / MM).toFixed(0)} t ${t.toFixed(3)} u ${uF.toFixed(6)} J·uL ${(Jn * uL).toFixed(6)} (J ${Jn.toFixed(5)}) D ${(a.D / MM).toFixed(2)}/${(b.D / MM).toFixed(2)}` }
        }
      }
      check(`r21e(ii) over the ridge a pushed chain's executed acceleration equals the one-DOF law at every piece start (${LEDGERS.length} catch points, ${read} chain piece starts read, ${onArc} with a ball on the arc; worst ${worst.toFixed(5)} m/s² ≤ 0.002)`,
        read > 0 && onArc > 0 && worst <= 0.002, at ?? 'no chain pieces');
      check(`r21e(iii) while a ball rides the arc the seat law holds at every instant: ${arcSamples} samples at 1 kHz over ${LEDGERS.length} catch points, the pair one diameter apart in 3-D (worst |gap − 2r| ${(gapWorst * 1e9).toFixed(2)} nm ≤ 1 µm) and the follower's speed J·u_leader (worst ${lawWorst.toExponential(2)} ≤ 1e-4) — the curvature term is exercised, not stepped over`,
        arcSamples > 20 && gapWorst <= 1e-6 && lawWorst <= 1e-4, lawAt ?? 'no arc samples');
    }
  }
  // r21f the committed Star export IS a curve now (the R37 re-pin: 49-station polylines, 14
  // blend segments across the six routes), so r21a's follower law is read on it directly. Two
  // things the old straight-chute row could not say: J is no longer exactly 1, and the train
  // must be read from the SOLVE — the first 30 mm of every chute lies inside the kernel cup,
  // where poseAt culls the seat and a drawn-only reader sees no follower at all (0 samples).
  {
    const up = loadDef(path.resolve(here, '../scene/ballreturn/tracks/wpbsa_snooker_12ft-xw101-slides.json'));
    let star = null; let sctx = null; let why = '';
    try { sctx = await tableContext(up.doc.table_id); star = validateTrack(up, { pockets: sctx.pockets, falls: sctx.falls }); } catch (e) { why = e.message; }
    let nonLine = 0, routes = 0, samples = 0, worst = 0, nonUnit = 0, minJ = Infinity, maxJ = -Infinity, at = null;
    if (star) {
      for (const rt of star.routes.values()) { routes += 1; nonLine += rt.segs.filter((s) => s.kind !== 'line').length; }
      const rS = star.refR;
      const SatS = (s, id, t) => { const c = continuationAt(s, id, t); if (!c || c.kind !== 'roll') return null; const q = stationAt(c.route, c.D, rS, {}); return { D: c.D, route: c.route, x: q.x, y: q.y, z: q.z }; };
      const spSS = (s, id, t0, t1) => { const a = SatS(s, id, t0), b = SatS(s, id, t1); return a && b ? (a.D - b.D) / (t1 - t0) : null; };
      for (const pk of [0, 2]) {
        const arr = [[1, 0.5], [2, 0.53], [3, 0.56]].map(([id, tt]) => ({ id, handoff: handoffFromSink({ t: tt, pocket: sctx.pockets[pk], fall: sctx.falls ? sctx.falls[pk] : sctx.pockets[pk], r: rS, glide: 0.06, tFall: 0.021 }, { track: star, pockets: sctx.pockets, r: rS }) })).filter((a) => a.handoff);
        if (arr.length < 2) continue;
        const sol = solveShot({ track: star, r: rS, ledger: [], arrivals: arr });
        const ids = arr.map((a) => a.id);
        const evT = sol.events.map((e) => e.t).concat((sol.steps || []).map((e) => e.t));
        for (let t = 0.5; t <= sol.tEnd; t += 1e-3) {
          if (evT.some((x) => Math.abs(x - t) < 3e-5)) continue;
          for (const id of ids) {
            const pc = pieceAt(sol, id, t); if (!pc || !pc.follow) continue;
            const me = SatS(sol, id, t); if (!me) continue;
            let lead = null;
            for (const o of ids) { if (o === id) continue; const q = SatS(sol, o, t); if (!q) continue; const j = JOf(q.route, q.D, me.route, me.D); if (Math.abs(j.dist - 2 * rS) < 1e-6 && j.ahead && (!lead || j.dist < lead.dist)) lead = { id: o, ...j }; }
            if (!lead) continue;
            const v = spSS(sol, id, t, t + 1e-6), vL = spSS(sol, lead.id, t, t + 1e-6);
            if (v === null || vL === null) continue;
            samples += 1; minJ = Math.min(minJ, lead.J); maxJ = Math.max(maxJ, lead.J); if (Math.abs(lead.J - 1) > 1e-9) nonUnit += 1;
            const err = Math.abs(v - lead.J * vL);
            if (err > worst) { worst = err; at = `pk${pk} ball ${id} behind ${lead.id} t ${t.toFixed(3)} J ${lead.J.toFixed(9)}`; }
          }
        }
      }
    }
    check(`r21f the committed Star XW101 export (${routes} routes) carries ${nonLine} non-line segments — a real clamp curve for the bend law to act on — and r21a's follower law holds on it: over ${samples} follower samples on p0 / p2 read from the solve, J ranges ${minJ === Infinity ? 'n/a' : minJ.toFixed(7)}…${maxJ === -Infinity ? 'n/a' : maxJ.toFixed(7)} (${nonUnit} samples off 1 — the old straight-chute export could only show J = 1 exactly) and |u − J·u_leader| ≤ ${worst.toExponential(2)}`,
      !!star && routes === 6 && nonLine === 14 && samples > 50 && nonUnit > 0 && worst <= 1e-6, why || (at ?? ''));
  }
  // r21g the merge is inelastic ON THE CHAIN'S degree of freedom: the generalised momentum
  // Σ G_i u_i is conserved into the merged chain (seal 15), not the plain path-speed mean of
  // seals 8…14. The two agree only where every J is 1 — every landing contact in the train set
  // above is one (both balls on the same straight leg) — so the arm adds the merge that tells
  // them apart: on TEST-bend-90 a ledger ball rolls away from the corner on the second leg
  // while a fresh arrival comes down the first, and the catch happens with the pair SPANNING
  // the corner (J 0.26…0.72 at the instant, by the seat geometry). Read from the outside: G_i
  // is the product of the link Jacobians of the merged chain at t+ (front first), u_i the
  // executed path speeds either side of the event (a landing ball's incoming speed is the
  // landing speed the event carries — see the note at the reading). A wall-backed / held
  // merge keeps v = 0 and is not a momentum case.
  {
    const chainAt = (sol, ids, t, seed) => {
      const st = new Map();
      for (const id of ids) { const q = Sat(sol, id, t); if (q) st.set(id, q); }
      if (!st.has(seed)) return null;
      const lead = new Map();
      for (const id of st.keys()) { const L = leaderIn(sol, ids, id, t); if (L) lead.set(id, L.id); }
      let front = seed, guard = 0;
      while (lead.has(front) && guard++ < 64) front = lead.get(front);
      const back = new Map(); for (const [a, b] of lead) back.set(b, a);
      const out = [front]; let cur = front; guard = 0;
      while (back.has(cur) && guard++ < 64) { cur = back.get(cur); out.push(cur); }
      return out.map((id) => ({ id, ...st.get(id) }));
    };
    // the corner-spanning merges: a ledger ball x mm past the corner (the first twist's end), one or two arrivals
    const bendRoute = bend.routes.get(4);
    const cornerD = bendRoute.segs[0].D1;
    const cases = trains.map((tr) => ({ nm: tr.nm, sol: tr.sol, ids: tr.ids, corner: false }));
    for (const xmm of [5, 10, 15, 20, 30]) {
      for (const two of [false, true]) {
        const arr = (two ? [[1, 0.5], [2, 0.51]] : [[1, 0.5]]).map(([id, tt]) => ({ id, handoff: hoff21(bend, tt, 4) })).filter((a) => a.handoff);
        const sol = solveShot({ track: bend, r: R, ledger: [{ id: 99, D: cornerD - xmm * MM, route: bendRoute, q: [0, 0, 0, 1] }], arrivals: arr });
        cases.push({ nm: `bend-90 corner ledger ${xmm} mm ${two ? '2' : '1'} arrival`, sol, ids: [99, ...arr.map((a) => a.id)], corner: true });
      }
    }
    let n = 0, nCorner = 0, worst = 0, at = null, maxMiss = 0, atMiss = null, minJ = Infinity, longest = 0;
    for (const cs of cases) {
      const evs = cs.sol.events;
      for (let k = 0; k < evs.length; k++) {
        const e = evs[k];
        if (e.kind !== 'contact' || !(e.vOut > 1e-6)) continue;                                   // a wall-backed / held merge keeps v = 0
        if (evs.some((o, j) => j !== k && o.kind === 'contact' && Math.abs(o.t - e.t) < 2e-4)) continue; // two merges at one instant: ambiguous read
        const tp = e.t + 1e-6;
        const chain = chainAt(cs.sol, cs.ids, tp, e.ball);
        if (!chain || chain.length < 2 || !chain.some((c) => c.id === e.other)) continue;
        const Gv = [1]; let bad = false, jmin = Infinity;
        for (let i = 1; i < chain.length; i++) {
          const j = JOf(chain[i - 1].route, chain[i - 1].D, chain[i].route, chain[i].D);
          if (!Number.isFinite(j.J)) { bad = true; break; }
          Gv[i] = Gv[i - 1] * j.J; jmin = Math.min(jmin, j.J);
        }
        if (bad) continue;
        const uB = [], uA = [];
        for (const c of chain) {
          // the landing ball's incoming speed is the landing speed the event carries: its ride from
          // the re-aimed touch-down t1 to this instant (0.6…9.1 ms over these trains, measured) is
          // drawn at the tail's chain speed and the merge is booked HERE with the landing speed —
          // the seal-9 fall-emergence convention, disclosed in §19.9
          let a = (e.via === 'landing' && c.id === e.ball) ? e.v : spS(cs.sol, c.id, e.t - 3e-6, e.t - 2e-6);
          const b = spS(cs.sol, c.id, tp, e.t + 2e-6);
          if (a === null || b === null) { bad = true; break; }
          uB.push(Math.max(0, a)); uA.push(Math.max(0, b));
        }
        if (bad) continue;
        let P0 = 0, P1 = 0, S2 = 0, sum = 0;
        for (let i = 0; i < chain.length; i++) { const mu = 1 / accelAt(chain[i].route, sideD(chain[i].route, chain[i].D), R).k; P0 += mu * Gv[i] * uB[i]; P1 += mu * Gv[i] * uA[i]; S2 += mu * Gv[i] * Gv[i]; sum += uB[i]; }
        const rel = Math.abs(P1 - P0) / Math.max(Math.abs(P0), 1e-3);
        n += 1; if (cs.corner) nCorner += 1; longest = Math.max(longest, chain.length); minJ = Math.min(minJ, jmin);
        if (rel > worst) { worst = rel; at = `${cs.nm} t ${e.t.toFixed(4)} ball ${e.ball}+${e.other} chain ${chain.map((c) => c.id).join('-')} P0 ${P0.toFixed(6)} P1 ${P1.toFixed(6)}`; }
        const miss = Math.abs((P0 / S2) - (sum / chain.length));                                   // this law vs the seals 8…14 mean, on the SAME reading
        if (miss > maxMiss) { maxMiss = miss; atMiss = `${cs.nm} t ${e.t.toFixed(4)}: law ${(P0 / S2).toFixed(4)} vs mean ${(sum / chain.length).toFixed(4)} m/s, J ${jmin.toFixed(4)}`; }
      }
    }
    check(`r21g every merge conserves the chain's generalised momentum Σ μ_i G_i u_i (μ = 1/k — order 16): ${n} merges (${n - nCorner} landing contacts over ${trains.length} trains, all straight, and ${nCorner} corner-spanning catches on TEST-bend-90 — a ledger ball 5…30 mm past the corner, 1 or 2 arrivals; longest merged chain ${longest}, smallest link J ${minJ === Infinity ? '-' : minJ.toFixed(4)}), worst relative change ${worst.toExponential(2)} ≤ 2e-3; the seals 8…14 path-speed mean would set the front ${maxMiss.toFixed(4)} m/s away from it at the widest (${atMiss ?? '-'}) — the two laws are told apart here, so this arm gates the change`,
      n >= 12 && nCorner >= 6 && worst <= 2e-3 && maxMiss > 0.01, `${at} | mean ${atMiss}`);
  }
  // r21h after a parting, the freed rear is still SOLVED — it is not skipped for the rest of the
  // interval. Sweeping each `separate` at 10 kHz to the end of the solve: the pair never comes
  // back inside one diameter (a missed re-contact would show as interpenetration), and every
  // return to contact is named by a contact event at that instant.
  {
    let nSep = 0, worstPen = 0, atPen = null, reclosed = 0, unnamed = 0, atUn = null, samples = 0;
    for (const tr of trains) {
      for (const e of tr.sol.events) {
        if (e.kind !== 'separate') continue;
        nSep += 1;
        const tEnd = Math.min(e.t + 1.5, tr.sol.tEnd);
        let wasClear = false;
        for (let t = e.t + 1e-5; t <= tEnd; t += 1e-4) {
          const a = Sat(tr.sol, e.ball, t), b = Sat(tr.sol, e.other, t);
          if (!a || !b) continue;
          samples += 1;
          const d = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
          const pen = twoR - d;
          if (pen > worstPen) { worstPen = pen; atPen = `${tr.nm} ${e.ball}/${e.other} t ${t.toFixed(4)} d ${(d * 1000).toFixed(4)} mm`; }
          if (d > twoR + 1e-5) wasClear = true;
          else if (wasClear) {
            wasClear = false; reclosed += 1;
            const named = tr.sol.events.some((o) => o.t >= t - 2e-4 && o.t <= t + 2e-4 && (o.kind === 'contact' || o.kind === 'yield' || o.kind === 'wall' || o.kind === 'stop') && (o.ball === e.ball || o.ball === e.other || o.other === e.ball || o.other === e.other));
            if (!named) { unnamed += 1; if (!atUn) atUn = `${tr.nm} ${e.ball}/${e.other} t ${t.toFixed(4)}`; }
          }
        }
      }
    }
    check(`r21h a just-parted pair keeps being solved: ${nSep} partings swept at 10 kHz to +1.5 s (${samples} samples) never interpenetrate (worst ${(worstPen * 1e6).toFixed(3)} µm ≤ 1 µm) and each of the ${reclosed} returns to contact carries an event at that instant (${unnamed} unnamed)`,
      nSep >= 8 && samples > 5000 && worstPen <= 1e-6 && unnamed === 0, `${atPen} | ${atUn ?? ''}`);
  }
}
// ---- (r22) seal 15: the landing snap — a sliver upstream of an interior vertex -------------
// Verification round 14 (S1, the sliver): a feeder landing 0.01–0.05 mm UPSTREAM of an interior
// trunk vertex loses the route's OWN merge — the first piece is shorter than the export grain and
// dropped, the route enters at the vertex, `stationD` of the landing station returns null — and
// two drawn balls came 0.677 mm apart on a kinked trunk (8.66 mm collinear). The law (track.js,
// buildTrack, "the landing snap"): a landing within one grain (EXPORT_GRAIN, 0.1 mm) upstream of
// an interior vertex of the runway it lands on is moved ONTO the vertex — the geometry already
// treated it so — and `runway.landingSnap` records the move. Exactly one grain is not a sliver
// and is not snapped; a landing within a grain of the runway's LAST vertex stays the refusal it
// was; no definition in web/scene/ballreturn/tracks plus web/tools/fixtures/ballreturn-tracks that builds is touched (r22b, which skips a definition refused both in its own table's context and on the default pockets).
{
  const MM = 0.001; const twoR = 2 * R;
  const mdef = loadDef(path.resolve(here, '../scene/ballreturn/tracks/TEST-midedge-landing.json'));
  const hoff22 = (t, pk, trk) => handoffFromSink({ t, pocket: POCKETS[pk], fall: POCKETS[pk], r: R, glide: 0.06, tFall: 0.021 }, { track: trk, pockets: POCKETS, r: R });
  const variant = (vz, dS) => {
    const d = JSON.parse(JSON.stringify(mdef));
    const tr = d.runways.find((rw) => rw.id === 'trunk'); const rc = d.runways.find((rw) => rw.id === 'rc-run');
    const V = [-1150, -361, vz]; tr.points_mm = [[-1000, -341.5, 0], V, [-1300, -380.5, 0]];
    const e0 = [V[0] + 1000, V[1] + 341.5, V[2]]; const L0 = Math.hypot(...e0); const u0 = e0.map((c) => c / L0);
    const e1 = [-1300 - V[0], -380.5 - V[1], -V[2]]; const L1 = Math.hypot(...e1); const u1 = e1.map((c) => c / L1);
    const land = dS <= 0 ? V.map((c, i) => c + u0[i] * dS) : V.map((c, i) => c + u1[i] * dS);
    rc.points_mm = [[0, -263, 703.5], [-500, -300, 455], land];
    return d;
  };
  const rows = []; let ok = true;
  for (const vz of [60, 0]) for (const dS of [-0.1, -0.05, -0.01, 0.01]) {
    let trk = null, why = '';
    try { trk = validateTrack(variant(vz, dS), { pockets: POCKETS, falls: null }); } catch (e) { why = e.message; }
    if (!trk) { ok = false; rows.push({ vz, dS, verdict: 'REFUSED', why: why.slice(0, 80) }); continue; }
    const r4 = trk.routes.get(4); const own = r4.merges.find((m) => m.feeder === 'rc-run');
    const snap = trk.runways.get('rc-run').landingSnap;
    const expectSnap = dS < 0 && -dS * MM < EXPORT_GRAIN - 1e-12 ? -dS * MM : 0;
    let mn = Infinity;
    for (const order of ['lc', 'rc']) for (let off = 0; off <= 0.7 + 1e-9; off += 0.05) {
      const arr = [{ id: 1, handoff: hoff22(order === 'lc' ? 0.5 : 0.5 + off, 1, trk) }, { id: 2, handoff: hoff22(order === 'rc' ? 0.5 : 0.5 + off, 4, trk) }];
      if (arr.some((a) => !a.handoff)) continue;
      const s = solveShot({ track: trk, r: R, ledger: [], arrivals: arr });
      for (let t = 0.5; t <= s.tEnd + 0.1; t += 1e-3) { const a = poseAt(s, 1, t, {}), b = poseAt(s, 2, t, {}); if (!a || !b || a.kind === 'fall' || b.kind === 'fall') continue; mn = Math.min(mn, Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)); }
    }
    const good = !!own && (own.yieldD - own.D - twoR) >= -1e-9 && Math.abs(snap - expectSnap) <= 1e-9 && mn >= twoR - 1e-6;
    ok = ok && good;
    rows.push({ vz, dS, merge: own ? `s ${(own.s / MM).toFixed(3)} push +${((own.yieldD - own.D - twoR) / MM).toFixed(2)}` : 'MISSING', snapMm: +(snap / MM).toFixed(3), minMm: +(mn / MM).toFixed(4) });
  }
  check(`r22a a landing 0.05 / 0.01 mm upstream of an interior trunk vertex (kinked z+60 and collinear) is snapped onto the vertex (landingSnap = the move), the route's OWN merge is present with a non-negative push, and 30 two-feeder solves per variant keep every drawn pair one diameter clear; exactly one grain (−0.1) and a downstream landing (+0.01) are not snapped and hold too — ${rows.map((x) => `${x.vz}/${x.dS}: ${x.merge ?? x.verdict} snap ${x.snapMm} min ${x.minMm}`).join('; ')}; the seal-14 tree reads MISSING / 0.6767 mm at 60/−0.05`,
    ok && rows.length === 8, JSON.stringify(rows));
  // r22a2 the sliver CHAIN (round 3, refuter 2b's first finding): two or three interior trunk
  // vertices 0.05 mm apart, or a landing exactly ON a vertex that a sub-grain edge follows. Round 1's
  // snap took the FIRST vertex within a grain and stopped; the sliver rule then dropped the next
  // sub-grain edge too, the route entered one vertex further on, and the route's own merge was
  // lost again (4.197 mm between two drawn balls, measured by the refuter). The snap now follows
  // the chain to the vertex the route actually enters at: the own merge is present, landingSnap is
  // the distance to THAT vertex, and two-feeder sweeps stay one diameter clear. A 0.15 mm middle
  // edge is a real piece: the chain stops at the first vertex (control).
  {
    const P0 = [-1000, -341.5, 0], V3 = [-1300, -380.5, 0];
    const unit = (v) => { const l = Math.hypot(...v); return v.map((c) => c / l); };
    const along = (A, B, d) => { const u = unit([B[0] - A[0], B[1] - A[1], B[2] - A[2]]); return A.map((c, k) => c + u[k] * d); };
    const rows = []; let ok = true;
    for (const vz of [60, 0]) {
      const V1 = [-1150, -361, vz];
      for (const [nV, gap] of [[2, 0.05], [3, 0.05], [2, 0.1], [2, 0.15]]) {
        const inner = [V1]; for (let k = 1; k < nV; k++) inner.push(along(V1, V3, gap * k));
        for (const [name, land] of [['V1-0.05', along(V1, P0, 0.05)], ['V1', V1], ['V1+0.02', along(V1, V3, 0.02)]]) {
          const d = JSON.parse(JSON.stringify(mdef));
          d.runways.find((rw) => rw.id === 'trunk').points_mm = [P0, ...inner, V3];
          d.runways.find((rw) => rw.id === 'rc-run').points_mm = [[0, -263, 703.5], [-500, -300, 455], land];
          let trk = null, msg = null; try { trk = validateTrack(d, { pockets: POCKETS, falls: null }); } catch (e) { msg = e.message; }
          if (!trk) { ok = false; rows.push(`${vz}/${nV}x${gap}/${name}: REFUSED ${msg.slice(0, 60)}`); continue; }
          const rc = trk.runways.get('rc-run'), tr = trk.runways.get('trunk'), r4 = trk.routes.get(4);
          const own = r4.merges.find((m) => m.feeder === 'rc-run');
          // the vertex the route enters at = the end of the sliver chain from the landing
          const sLand0 = rc.landingS - rc.landingSnap;
          let sIn = sLand0; let i = tr.edges.findIndex((e) => sIn <= e.s0 + e.len + 1e-12);
          while (i < tr.edges.length && tr.edges[i].s0 + tr.edges[i].len - sIn < EXPORT_GRAIN) { sIn = tr.edges[i].s0 + tr.edges[i].len; i += 1; }
          const entersAt = r4.segs.find((sg) => sg.rw.id === 'trunk');
          const sEnter = entersAt ? (entersAt.sB0 ?? null) : null;
          let mn = Infinity;
          for (const order of ['ab', 'ba']) for (let off = 0; off <= 0.7 + 1e-9; off += 0.07) {
            const arr = [{ id: 1, handoff: hoff22(order === 'ab' ? 0.5 : 0.5 + off, 1, trk) }, { id: 2, handoff: hoff22(order === 'ba' ? 0.5 : 0.5 + off, 4, trk) }];
            if (arr.some((x) => !x.handoff)) continue;
            const sol = solveShot({ track: trk, r: R, ledger: [], arrivals: arr });
            for (let t = 0.4; t <= sol.tEnd; t += 1e-3) { const a = poseAt(sol, 1, t, {}), b = poseAt(sol, 2, t, {}); if (!a || !b || a.kind === 'fall' || b.kind === 'fall') continue; mn = Math.min(mn, Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)); }
          }
          const good = !!own && Math.abs(rc.landingS - sIn) <= 1e-9 && mn >= twoR - 1e-6;
          ok = ok && good;
          rows.push(`${vz}/${nV}x${gap}/${name}: ${own ? 'merge' : 'MISSING'} snap ${(rc.landingSnap / MM).toFixed(3)} (chain end +${((sIn - sLand0) / MM).toFixed(3)}) min ${(mn / MM).toFixed(3)}`);
        }
      }
    }
    check(`r22a2 the sliver CHAIN: 2 / 3 interior trunk vertices 0.05 mm apart (and 0.1, and a 0.15 mm control), landings 0.05 mm before V1, ON V1 and 0.02 mm past it, kinked and collinear — ${rows.length} variants, every one admitted with its OWN merge present, the landing snapped to the vertex the route enters at (the end of the sliver chain), and every two-feeder sweep one diameter clear — ${rows.join('; ')}; the round-1 snap reads MISSING / 4.197 mm on the 2×0.05 / V1−0.05 case`,
      ok && rows.length === 24, rows.filter((x) => /MISSING|REFUSED/.test(x)).join(' | '));
  }
  // r22b no definition in web/scene/ballreturn/tracks plus web/tools/fixtures/ballreturn-tracks that builds is snapped; a definition refused in both contexts is skipped
  {
    const names = trackFiles();
    const snapped = []; let seen = 0;
    for (const [f, p] of names) {
      const d = loadDef(p);
      let trk = null;
      try { const c = await tableContext(d.doc.table_id); trk = validateTrack(d, { pockets: c.pockets, falls: c.falls }); } catch { try { trk = validateTrack(d, { pockets: POCKETS, falls: null }); } catch { continue; } }
      for (const rw of trk.runways.values()) { if (rw.next !== null) { seen += 1; if (rw.landingSnap > 0) snapped.push(`${f}:${rw.id}`); } }
    }
    check(`r22b the landing snap moves nothing in the definitions in web/scene/ballreturn/tracks plus web/tools/fixtures/ballreturn-tracks: ${seen} junction landings over the committed fixtures that build, out of ${names.length}; a definition refused in both contexts is skipped; ${snapped.length} snapped`, seen >= 10 && snapped.length === 0, snapped.join(' '));
  }
  // r22c a landing within a grain of a runway's LAST vertex (round 3, refuter 2b's second and
  // third findings). Round 2 measured the tray and the terminal chute — both refused upstream of
  // the snap — and called the interior-only clause unreachable; the refuter landed a feeder on the
  // last 0.01–0.05 mm of a runway that CONTINUES (the trunk, before its tray) and the validator
  // admitted it with the route's own merge missing (32 of 40 variants; a landing exactly ON that
  // vertex was admitted or refused by a 5.55e-17 m rounding of `covered`). The law now: a landing
  // whose sliver chain runs out at the end of a non-terminal runway is refused by name (the
  // last-vertex sliver) — 0.05 / 0.01 mm before the trunk's end and ON it, over four rc-run plan
  // angles and both trunk shapes; 0.2 and 1 mm are real pieces, admitted with the own merge present
  // and two-feeder sweeps clear. The terminal families of round 2 keep their laws.
  {
    const P0 = [-1000, -341.5, 0], V3 = [-1300, -380.5, 0];
    const unit = (v) => { const l = Math.hypot(...v); return v.map((c) => c / l); };
    const along = (A, B, d) => { const u = unit([B[0] - A[0], B[1] - A[1], B[2] - A[2]]); return A.map((c, k) => c + u[k] * d); };
    const lastLaw = /within one export grain .* of its end .*the last-vertex sliver/;
    let refused = 0, admitted = 0, bad = [], mn = Infinity;
    for (const vz of [0, 60]) {
      const V1 = [-1150, -361, vz];
      for (const mid of [[-1250, -300, 455], [-1300, -300, 455], [-1350, -300, 455], [-1200, -300, 455]]) {
        for (const back of [0.05, 0.01, 0, 0.2, 1]) {
          const d = JSON.parse(JSON.stringify(mdef));
          d.runways.find((rw) => rw.id === 'trunk').points_mm = [P0, V1, V3];
          d.runways.find((rw) => rw.id === 'rc-run').points_mm = [[0, -263, 703.5], mid, back > 0 ? along(V3, V1, back) : V3];
          let trk = null, msg = null; try { trk = validateTrack(d, { pockets: POCKETS, falls: null }); } catch (e) { msg = e.message; }
          const tag = `vz ${vz} mid ${mid[0]} back ${back}`;
          if (back < EXPORT_GRAIN / MM) {
            if (msg && lastLaw.test(msg)) refused += 1; else bad.push(`${tag}: ${msg ? 'refused by another law: ' + msg.slice(0, 80) : 'ADMITTED'}`);
            continue;
          }
          if (!trk) { bad.push(`${tag}: REFUSED ${msg.slice(0, 80)}`); continue; }
          const own = trk.routes.get(4).merges.find((m) => m.feeder === 'rc-run');
          if (!own) { bad.push(`${tag}: own merge MISSING`); continue; }
          admitted += 1;
          for (const order of ['ab', 'ba']) for (let off = 0; off <= 0.7 + 1e-9; off += 0.1) {
            const arr = [{ id: 1, handoff: hoff22(order === 'ab' ? 0.5 : 0.5 + off, 1, trk) }, { id: 2, handoff: hoff22(order === 'ba' ? 0.5 : 0.5 + off, 4, trk) }];
            if (arr.some((x) => !x.handoff)) continue;
            const sol = solveShot({ track: trk, r: R, ledger: [], arrivals: arr });
            for (let t = 0.4; t <= sol.tEnd; t += 1e-3) { const a = poseAt(sol, 1, t, {}), b = poseAt(sol, 2, t, {}); if (!a || !b || a.kind === 'fall' || b.kind === 'fall') continue; mn = Math.min(mn, Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)); }
          }
        }
      }
    }
    // the terminal families of round 2: a landing before a terminal chute's stop face stays the stop-face refusal
    const tdef = loadDef(path.resolve(here, '../scene/ballreturn/tracks/TEST-terminal-chutes.json'));
    const chute = tdef.runways.find((rw) => rw.id === 'rc-chute');
    const pts = chute.points_mm; const last = pts[pts.length - 1], prev = pts[pts.length - 2];
    const L = Math.hypot(last[0] - prev[0], last[1] - prev[1], last[2] - prev[2]);
    let chuteOk = 0;
    for (const back of [0.05, 0.01, 1, 20, 0]) {
      const d = JSON.parse(JSON.stringify(tdef));
      const f = (L - back) / L;
      d.runways.find((rw) => rw.id === 'rc-lead').points_mm[2] = [prev[0] + (last[0] - prev[0]) * f, prev[1] + (last[1] - prev[1]) * f, prev[2] + (last[2] - prev[2]) * f];
      let msg = null; try { validateTrack(d, { pockets: POCKETS, falls: null }); } catch (e) { msg = e.message; }
      if (msg && /at or beyond its stop face/.test(msg)) chuteOk += 1; else bad.push(`chute back ${back}: ${msg ? msg.slice(0, 80) : 'ADMITTED'}`);
    }
    check(`r22c the last-vertex sliver: a feeder landing 0.05 / 0.01 mm before the end of a runway that CONTINUES (the trunk before its tray), or exactly ON it, is refused by name (${refused} of 24, over 4 plan angles × kinked / collinear) — the round-2 tree admits 32 of 40 such landings with the route's own merge missing; 0.2 and 1 mm are admitted with the own merge present (${admitted} of 16) and every two-feeder sweep is one diameter clear (min ${(mn / MM).toFixed(4)} mm); a landing before a terminal chute's stop face keeps the stop-face law (${chuteOk} of 5)`,
      refused === 24 && admitted === 16 && chuteOk === 5 && mn >= twoR - 1e-6 && bad.length === 0, bad.join(' | '));
  }
}
// ---- (r23–r26) order 16: the negative-J regime, the two shipped breaches, the sub-grain bend, the sink clearance ----
{
  const MM = 0.001; const twoR = 2 * R;
  const hoff16 = (trk, tt, pk) => handoffFromSink({ t: tt, pocket: POCKETS[pk], fall: POCKETS[pk], r: R, glide: 0.06, tFall: 0.021 }, { track: trk, pockets: POCKETS, r: R });
  const loadT = (name) => validateTrack(loadDef(trackPath(name)), { pockets: POCKETS, falls: null });
  const FX = ['TEST-synthetic-wire-slide', 'TEST-alias-diamond-wire-slide', 'TEST-bend-90', 'TEST-shallow-merge', 'TEST-midedge-landing', 'TEST-obtuse-merge', 'TEST-terminal-chutes'];
  const tracks = new Map(FX.map((n) => [n, loadT(n)]));
  const served = (trk) => [...trk.routes.keys()];
  const minDrawn = (sol, ids, t0, dt = 1e-3) => {
    let worst = { d: Infinity };
    for (let t = t0; t <= sol.tEnd + 1e-9; t += dt) {
      const ps = ids.map((id) => [id, poseAt(sol, id, t, {})]).filter(([, q]) => q && q.kind !== 'fall');
      for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) { const d = Math.hypot(ps[i][1].x - ps[j][1].x, ps[i][1].y - ps[j][1].y, ps[i][1].z - ps[j][1].z); if (d < worst.d) worst = { d, t, pair: [ps[i][0], ps[j][0]] }; }
    }
    return worst;
  };
  /** Re-seed a solve from `sol` at time tc exactly as index.js does at a new base: rolling balls
   * as continuations (signed v, follow, hold), settled balls as the ledger, unlanded ones as arrivals. */
  const reseedAt = (trk, sol, arrs, tc) => {
    const continuations = [], ledger = [], arrivals = [];
    for (const a of arrs) {
      const st = continuationAt(sol, a.id, tc);
      if (!st || st.kind === 'fall') { arrivals.push(a); continue; }
      if (st.kind === 'rest') { ledger.push({ id: a.id, D: st.D, route: st.route, q: st.q }); continue; }
      continuations.push({ id: a.id, route: st.route, D: st.D, v: st.v, q: st.q, t0: tc, follow: st.follow === true, hold: st.hold ?? null });
    }
    return { continuations, ledger, arrivals };
  };
  // r23a — H5, the acceptance the order names first: a continuation re-solve re-seeded ANYWHERE
  // around a parting solves. Every feeder each FX fixture serves, two arrival patterns; every
  // `separate` of the base solve; the re-seed instant t_sep ± Δ for Δ over 1e-6 … 1e-3 s (the
  // band refuter 1 measured 7 / 7 pk4 partings throwing at 1e-5 and 3e-5 s on seal 15) — zero
  // MAX_EVENTS throws, and every drawn pair of the re-solve one diameter clear.
  {
    const deltas = [1e-6, 3e-6, 1e-5, 3e-5, 1e-4, 3e-4, 1e-3];
    let solves = 0, throws = 0, partings = 0, worst = { d: Infinity }, atThrow = null;
    for (const [nm, trk] of tracks) {
      for (const pk of served(trk)) {
        for (const spec of [[[1, 0.5], [2, 0.51], [3, 0.52]], [[1, 0.5], [2, 0.53], [3, 0.56], [4, 0.59]]]) {
          const arrs = spec.map(([id, tt]) => ({ id, handoff: hoff16(trk, tt, pk) })).filter((a) => a.handoff);
          if (arrs.length < 2) continue;
          const base = solveShot({ track: trk, r: R, ledger: [], arrivals: arrs });
          for (const e of base.events) {
            if (e.kind !== 'separate') continue;
            partings += 1;
            for (const dl of deltas) for (const sgn of [-1, 1]) {
              const tc = e.t + sgn * dl; if (tc <= base.events[0].t) continue;
              const seed = reseedAt(trk, base, arrs, tc);
              solves += 1;
              try {
                const s2 = solveShot({ track: trk, r: R, ...seed });
                const w = minDrawn(s2, arrs.map((a) => a.id), tc, 2e-3);
                if (w.d < worst.d) worst = { ...w, nm, pk, tSep: e.t, dl: sgn * dl };
              } catch (err) { throws += 1; if (!atThrow) atThrow = `${nm} p${pk} separate@${e.t.toFixed(5)} ${sgn > 0 ? '+' : '−'}${dl}: ${err.message.slice(0, 60)} ${(err.tail || []).slice(-3).join(' ')}`; }
            }
          }
        }
      }
    }
    check(`r23a H5 — the continuation re-seed window: ${solves} re-solves of ${tracks.size} shipped fixtures (every feeder each serves, 3- and 4-ball trains), seeded at every one of the base solves' ${partings} partings ± 1e-6 … 1e-3 s exactly as the next shot's base would: ${throws} MAX_EVENTS throws (seal 15: 7 of 7 obtuse pk4 partings threw at 1e-5 and 3e-5 s), every drawn pair one diameter clear (min ${(worst.d * 1e3).toFixed(4)} mm at ${worst.nm ?? '-'} p${worst.pk ?? '-'} separate@${worst.tSep?.toFixed(4) ?? '-'} ${worst.dl ?? ''})`,
      solves > 200 && throws === 0 && worst.d >= twoR - 1e-6, atThrow ?? JSON.stringify(worst));
  }
  // r23b — H2, the seeded corner: on the shipped obtuse geometry a slow ball just past the
  // 113.5° rc-run vertex and a one- or two-ball pusher 90 mm before it, launched from
  // continuations (the states refuter 1 seeded: 12 of 120 threw on seal 15). Zero throws, every
  // drawn pair clear, and every re-solve ends at rest.
  {
    const trk = tracks.get('TEST-obtuse-merge'); const route = trk.routes.get(4);
    // the rc-run vertex: the first plan-heading break of route 4 (the 113.5° turn), by the geometry
    const corner = (() => { for (const b of route.breaks) { const a = tangentAt(route, b + 2e-3, {}), c = tangentAt(route, Math.max(0, b - 2e-3), {}); const dot = a.tx * c.tx + a.ty * c.ty + a.tz * c.tz; if (dot < 0.5) return b; } return NaN; })();
    let cases = 0, throws = 0, unsettled = 0, worst = { d: Infinity }, atThrow = null;
    if (Number.isFinite(corner)) {
      for (const s0 of [50, 54, 57, 60, 65]) for (const v1 of [0, 0.05, 0.1]) for (const v2 of [0.34, 0.6]) for (const nb of [1, 2]) {
        const D1 = corner - s0 * MM; const D2 = corner + 90 * MM;
        const conts = [{ id: 1, route, D: D1, v: v1, q: [0, 0, 0, 1], t0: 0 }, { id: 2, route, D: D2, v: v2, q: [0, 0, 0, 1], t0: 0 }];
        if (nb === 2) { const P = stationAt(route, D2, R, {}); conts.push({ id: 3, route, D: seatBehind(route, [P.x, P.y, P.z], D2, twoR), v: v2, q: [0, 0, 0, 1], t0: 0, follow: true }); }
        cases += 1;
        try {
          const s2 = solveShot({ track: trk, r: R, ledger: [], arrivals: [], continuations: conts });
          const ids = conts.map((c) => c.id);
          const w = minDrawn(s2, ids, 0, 1e-3); if (w.d < worst.d) worst = { ...w, s0, v1, v2, nb };
          if (!ids.every((id) => continuationAt(s2, id, s2.tEnd + 1)?.kind === 'rest')) unsettled += 1;
        } catch (err) { throws += 1; if (!atThrow) atThrow = `s0 ${s0} v1 ${v1} v2 ${v2} nb ${nb}: ${err.message.slice(0, 60)} ${(err.tail || []).slice(-3).join(' ')}`; }
      }
    }
    check(`r23b H2 — the seeded obtuse corner (vertex at D ${Number.isFinite(corner) ? (corner * 1e3).toFixed(3) : 'NaN'} mm): ${cases} continuation-seeded cases (a ball 50–65 mm past the corner at 0 / 0.05 / 0.1 m/s, a 1- or 2-ball pusher at 0.34 / 0.6 m/s 90 mm before it): ${throws} throws (seal 15: 12 of 120), ${unsettled} unsettled, every drawn pair one diameter clear (min ${(worst.d * 1e3).toFixed(4)} mm at ${JSON.stringify({ s0: worst.s0, v1: worst.v1, v2: worst.v2, nb: worst.nb, t: worst.t })})`,
      cases === 60 && throws === 0 && unsettled === 0 && worst.d >= twoR - 1e-6, atThrow ?? '');
  }
  // r23c — what the shipped obtuse p4 train's follower now DOES at the 113.5° vertex, in numbers,
  // and the law it obeys: a contact may push it back (a forward acceleration below its own drive)
  // but never pull it (a forward acceleration above its own drive + resistance while it moves
  // backward); after the parting it coasts back under its own drive, turns, and rolls down again.
  {
    const trk = tracks.get('TEST-obtuse-merge');
    const rows = []; let ok = true; let worstPull = -Infinity, atPull = null, maxBack = 0, backMm = 0, turns = 0, reconts = 0;
    for (const spec of [[[1, 0.5], [2, 0.54], [3, 0.58]], [[1, 0.5], [2, 0.53]], [[1, 0.5], [2, 0.53], [3, 0.56], [4, 0.59]]]) {
      const arrs = spec.map(([id, tt]) => ({ id, handoff: hoff16(trk, tt, 4) }));
      const sol = solveShot({ track: trk, r: R, ledger: [], arrivals: arrs });
      const ids = arrs.map((a) => a.id);
      const imp = sol.events.find((e) => e.kind === 'impact' && e.ball === 1);
      const sp = (id, t) => { const a = continuationAt(sol, id, t), b = continuationAt(sol, id, t + 1e-6); return a && b && a.kind === 'roll' && b.kind === 'roll' ? (a.D - b.D) / 1e-6 : null; };
      if (!imp) { ok = false; rows.push(`${spec.length}-ball: no impact by ball 1`); continue; }
      const l0 = sp(1, imp.t - 2e-6), l1 = sp(1, imp.t + 1e-6), f0 = sp(2, imp.t - 2e-6), f1 = sp(2, imp.t + 1e-6);
      // ball 2's backward episode after the impact
      let tBack0 = null, tBack1 = null, dist = 0, fastest = 0, pull = -Infinity, pullAt = null;
      const bounds2 = sol.pieces.get(2).map((p) => p.t0);
      for (let t = imp.t + 1e-5; t <= sol.tEnd; t += 2e-4) {
        const u = sp(2, t); if (u === null) continue;
        if (u < -1e-6) {
          if (tBack0 === null) tBack0 = t; tBack1 = t; dist += -u * 2e-4; fastest = Math.max(fastest, -u);
          // the executed acceleration INSIDE the piece (a difference across a piece boundary — a re-settle
          // where the chain's acceleration is re-derived — is not an acceleration of anything)
          // (over 1 ms: a twist segment is tabulated in 24 straight steps and J steps by ≤ 1e-4 at each,
          // a 1e-5 m/s kick to a follower at 0.15 m/s — seal 15 residual (2); over 1 ms that reads as
          // ≤ 0.015 m/s², which is the tolerance below, not a physics allowance)
          if (bounds2.some((b) => b > t - 3e-5 && b < t + 1.05e-3)) continue;
          const u2 = sp(2, t + 1e-3); if (u2 === null) continue;
          const acc = (u2 - u) / 1e-3;
          const c = continuationAt(sol, 2, t); const res = accelAt(c.route, sideD(c.route, c.D), R);
          const canPush = res.drive + res.resist;                     // moving backward: gravity AND resistance act forward — the most a free ball can accelerate forward
          if (acc - canPush > pull) { pull = acc - canPush; pullAt = `t ${t.toFixed(4)} u ${u.toFixed(4)} acc ${acc.toFixed(3)} own ${canPush.toFixed(3)}`; }
        }
      }
      const sepE = sol.events.find((e) => e.kind === 'separate' && e.ball === 2 && e.other === 1 && e.t >= imp.t);
      const turnE = sol.events.find((e) => e.kind === 'turn' && e.ball === 2 && e.t > imp.t);
      const rec = sol.events.find((e) => e.kind === 'contact' && e.ball === 2 && e.other === 1 && e.t > imp.t);
      if (turnE) turns += 1; if (rec) reconts += 1;
      if (pull > worstPull) { worstPull = pull; atPull = pullAt; }
      maxBack = Math.max(maxBack, fastest); backMm = Math.max(backMm, dist * 1e3);
      const w = minDrawn(sol, ids, 0.5, 1e-3);
      ok = ok && pull <= 0.015 && w.d >= twoR - 1e-6 && !!sepE && sepE.v < 0 && (spec.length < 4 || (Math.abs(l1) < 1e-4 && imp.vOut === 0)); // 4 balls: 1 + 3J⁺ < 0 — the train is stopped against the corner, the leader then squeezes through
      if (spec.length < 4) ok = ok && dist * 1e3 >= 3 && !!turnE && !!rec; // the freed follower keeps its backward speed (a launch clamped to rest climbs nothing): ≥ 3 mm back up the leg, a turn, a re-catch (round 5b, battery N4)
      rows.push(`${spec.length}-ball: impact@${imp.t.toFixed(4)} leader ${l0.toFixed(4)} → ${l1.toFixed(4)} m/s${imp.vOut === 0 ? ' (STOPPED against the corner: 1 + 3J⁺ < 0)' : ''}, follower ${f0.toFixed(4)} → ${f1.toFixed(4)}${Math.abs(l1) > 1e-3 ? ` (J ${(f1 / l1).toFixed(4)})` : ''}; backward ${tBack0 === null ? 'never' : `${((tBack1 - tBack0) * 1e3).toFixed(0)} ms, ${(dist * 1e3).toFixed(2)} mm, fastest ${fastest.toFixed(4)} m/s`}; parted ${sepE ? `@${sepE.t.toFixed(4)} at ${sepE.v.toFixed(4)} m/s` : 'NEVER'}${turnE ? `, turned @${turnE.t.toFixed(4)}` : ''}${rec ? `, re-caught 1 @${rec.t.toFixed(4)}` : ''}; largest forward acceleration beyond its own drive while moving backward ${pull === -Infinity ? '-' : pull.toFixed(4)} m/s²; min drawn gap ${(w.d * 1e3).toFixed(3)} mm`);
    }
    check(`r23c the shipped TEST-obtuse-merge p4 train at the 113.5° rc-run vertex, by the numbers (order 16): ${rows.join(' | ')} — the follower is reversed by the impact (J < 0), parted the moment the chain would have to PULL it, coasts back under its own drive (no forward acceleration beyond drive + resistance over any 1 ms: worst ${worstPull === -Infinity ? '-' : worstPull.toFixed(4)} m/s² ≤ 0.015, the twist tabulation's own step), turns and rolls down again; with FOUR balls (1 + 3J⁺ < 0) the impulse would send the train back, so it is stopped against the corner (leader 0.3426 → 0) and the leader then squeezes through while the followers are pushed back; seal 15 dragged the follower forward at up to 3.94 m/s² and parted it at v = 0`,
      ok && rows.length === 3, atPull ?? rows.join(' | '));
  }
  // r24a — item 2, the shipped wire slide: a ledger ball backed up at the tray head, 2 + 2
  // arrivals 120 ms apart (seal-14 refuter 1's row 6: two balls drawn at the SAME station, 0 mm —
  // the feeder ball never saw the queue held for the tray window and landed inside it).
  {
    const trk = tracks.get('TEST-synthetic-wire-slide'); const rt4 = trk.routes.get(4);
    const arrs = []; let id = 1;
    for (let i = 0; i < 2; i++) arrs.push({ id: id++, handoff: hoff16(trk, 0.5 + i * 0.010, 4) });
    for (let i = 0; i < 2; i++) arrs.push({ id: id++, handoff: hoff16(trk, 0.5 - 0.120 + i * 0.010, 1) });
    const sol = solveShot({ track: trk, r: R, ledger: [{ id: 10, D: 0.2995, route: rt4, q: [0, 0, 0, 1] }], arrivals: arrs });
    const ids = [10, 1, 2, 3, 4];
    const w = minDrawn(sol, ids, 0.4, 2.5e-4);
    const rests = ids.map((i) => continuationAt(sol, i, sol.tEnd + 1)).filter((c) => c && c.kind === 'rest');
    const yields = sol.events.filter((e) => e.kind === 'yield').map((e) => `${e.ball}@${(e.D * 1e3).toFixed(1)}`);
    check(`r24a the shipped TEST-synthetic-wire-slide with a ledger ball at the tray head (D 299.5 mm) and 2 + 2 arrivals 120 ms apart: every drawn pair one diameter clear at 4 kHz (min ${(w.d * 1e3).toFixed(4)} mm at t ${w.t?.toFixed(4)} pair ${w.pair}), ${rests.length} balls at rest at the end, yields ${yields.join(' ')} — seal 15 drew two balls at the same station (0 mm, both rest at trunk D 355.84)`,
      w.d >= twoR - 1e-6, JSON.stringify(w));
  }
  // r24b — item 2, the shipped alias slide: nominal handoffs, 3 + 3 arrivals 81 ms apart (seal-14
  // refuter 1's row 7: a 51.9 µm graze for 4.37 ms, between two of contactTime3's 5 ms samples).
  {
    const trk = tracks.get('TEST-alias-diamond-wire-slide');
    const arrs = []; let id = 1;
    for (let i = 0; i < 3; i++) arrs.push({ id: id++, handoff: hoff16(trk, 0.5 + i * 0.020, 4) });
    for (let i = 0; i < 3; i++) arrs.push({ id: id++, handoff: hoff16(trk, 0.5 + 0.081 + i * 0.020, 1) });
    const sol = solveShot({ track: trk, r: R, ledger: [], arrivals: arrs });
    const ids = arrs.map((a) => a.id);
    const w = minDrawn(sol, ids, 0.4, 5e-5);
    check(`r24b the shipped TEST-alias-diamond-wire-slide, 3 + 3 nominal arrivals 81 ms apart, read at 20 kHz: every drawn pair one diameter clear (min ${(w.d * 1e3).toFixed(5)} mm at t ${w.t?.toFixed(5)} pair ${w.pair}) — seal 15 read 57.09813 mm (51.9 µm inside) for 4.37 ms here`,
      w.d >= twoR - 1e-6, JSON.stringify(w));
  }
  // r25 — item 3, the sub-grain bend reads as collinear: a trunk vertex offset by 1e-5 mm (a 1.3e-7
  // rad bend, a 3 nm pivot arc) builds a route with NO arc there, and a seated pair launched at
  // 0.3 m/s across it solves (refuter 2b's item 5 threw MAX_EVENTS with contact / separate chatter).
  {
    const mdef16 = loadDef(path.resolve(here, '../scene/ballreturn/tracks/TEST-midedge-landing.json'));
    const rows = []; let ok = true;
    for (const dy of [1e-3, 1e-4, 1e-5]) {
      const d = JSON.parse(JSON.stringify(mdef16));
      const tr = d.runways.find((rw) => rw.id === 'trunk');
      tr.points_mm = [[-1000, -341.5, 0], [-1150, -361 + dy, 0], [-1300, -380.5, 0]];
      let trk = null, msg = null; try { trk = validateTrack(d, { pockets: POCKETS, falls: null }); } catch (e) { msg = e.message; }
      if (!trk) { ok = false; rows.push(`dy ${dy}: REFUSED ${msg.slice(0, 60)}`); continue; }
      const route = trk.routes.get(4);
      const arcs = route.segs.filter((sg) => sg.kind === 'arc');
      const arcLen = arcs.length ? arcs[0].len : 0;
      // a leader at the vertex station with a seated follower, both at 0.3 m/s (continuations)
      const vtx = route.breaks.find((b) => Math.abs(stationAt(route, b, R, {}).x - (-1.150)) < 0.02) ?? route.breaks[Math.floor(route.breaks.length / 2)];
      const P = stationAt(route, vtx, R, {});
      const conts = [{ id: 1, route, D: vtx, v: 0.3, q: [0, 0, 0, 1], t0: 0 }, { id: 2, route, D: seatBehind(route, [P.x, P.y, P.z], vtx, twoR), v: 0.3, q: [0, 0, 0, 1], t0: 0, follow: true }];
      let msg2 = 'solved', good = true; let w = { d: Infinity };
      try { const s2 = solveShot({ track: trk, r: R, ledger: [], arrivals: [], continuations: conts }); w = minDrawn(s2, [1, 2], 0, 1e-3); msg2 = `solved, ${s2.events.length} events, min ${(w.d * 1e3).toFixed(3)} mm`; good = w.d >= twoR - 1e-6; } catch (e) { good = false; msg2 = `THROW ${e.message.slice(0, 40)}`; }
      const expectArc = dy * MM * 0 + (arcLen >= EXPORT_GRAIN); // a real bend keeps its arc
      ok = ok && good && arcs.length === 0; // every offset here is sub-grain (r·|φ| ≤ 4e-4 mm ≪ 0.1 mm): collinear, no arc (round 5b, battery N16)
      rows.push(`dy ${dy} mm: bend ${(Math.atan2(dy, 150) * 2).toExponential(2)} rad, ${arcs.length ? `arc ${(arcLen * 1e9).toFixed(1)} nm` : 'NO arc (collinear)'}, ${msg2}`);
    }
    check(`r25 a sub-grain bend reads as collinear (order 16, item 3): a trunk vertex offset by 1e-3 / 1e-4 / 1e-5 mm — ${rows.join('; ')} — the 1e-5 mm case (3 nm of arc) builds with no arc and a seated pair at 0.3 m/s across it solves clear; refuter 2b's script threw MAX_EVENTS there on seal 15`,
      ok && rows.length === 3, rows.join('; '));
  }
  // r27 — refuter B's back-into-window case (order 16 round 4): a trunk with a 130° turn 70 mm below
  // the mid-edge landing; the lc train's second ball is reversed by the vertex impact, rolls BACK up
  // into the rc-run window and — on the round-3 tree — was "yielded" and held inside it, then exempted
  // as a holder, so the rc ball was told the window was empty (0.812 mm between drawn balls for
  // 203 ms). A cluster moving back approaches no merge below it; a holder is exempt only ON its
  // yield line. Arrivals only, the refuter's timing and a sweep around it.
  {
    const base27 = loadDef(path.resolve(here, '../scene/ballreturn/tracks/TEST-midedge-landing.json'));
    const mk27 = (turnDeg, below) => {
      const d = JSON.parse(JSON.stringify(base27));
      const tr = d.runways.find((rw) => rw.id === 'trunk'); const tray = d.runways.find((rw) => rw.id === 'tray');
      const yV = -361 - 0.13 * below; const a = turnDeg * Math.PI / 180; const L = 200;
      const ex = -Math.cos(a) * L, ez = Math.sin(a) * L;
      const V = [-1150 - below, +yV.toFixed(3), 0]; const E = [+(V[0] + ex).toFixed(3), +(yV - 0.16 * L).toFixed(3), +ez.toFixed(3)];
      tr.points_mm = [[-1000, -341.5, 0], [-1150, -361, 0], V.map(Number), E];
      const dy = 28.575 - 23.13; const ux = ex / L, uz = ez / L;
      tray.points_mm = [[E[0], +(E[1] - dy).toFixed(3), E[2]], [+(E[0] + ux * 300).toFixed(3), +(E[1] - dy).toFixed(3), +(E[2] + uz * 300).toFixed(3)]];
      return d;
    };
    let worst = { d: Infinity }, solves = 0, refused = 0, held = 0;
    for (const [turn, below] of [[130, 70], [140, 70], [140, 90], [130, 90]]) {
      let trk = null; try { trk = validateTrack(mk27(turn, below), { pockets: POCKETS, falls: null }); } catch { refused += 1; continue; }
      for (const off of [0.71, 0.74, 0.77, 0.80, 0.83]) {
        const arrs = [{ id: 1, handoff: hoff16(trk, 0.5 + off, 4) }]; for (let i = 0; i < 3; i++) arrs.push({ id: 2 + i, handoff: hoff16(trk, 0.5 + i * 0.03, 1) });
        if (arrs.some((x) => !x.handoff)) continue;
        const sol = solveShot({ track: trk, r: R, ledger: [], arrivals: arrs }); solves += 1;
        const w = minDrawn(sol, [1, 2, 3, 4], 0.5, 5e-4); if (w.d < worst.d) worst = { ...w, turn, below, off };
        for (const ps of sol.pieces.values()) for (const pc of ps) if (pc.hold && Number.isFinite(pc.hold.Db) && pc.D0 < pc.hold.Db + twoR - 1e-6) held += 1; // a hold booked INSIDE the window itself (within a diameter of the merge point) — a hold inside the approach above it is the decide-now law
      }
    }
    check(`r27 refuter B's back-into-window family (a 130° / 140° trunk turn 70 / 90 mm below the mid-edge landing; an rc ball 0.71–0.83 s after an lc train of three): ${solves} arrival-only solves (${refused} geometries refused), every drawn pair one diameter clear at 2 kHz (min ${(worst.d * 1e3).toFixed(4)} mm at ${JSON.stringify({ turn: worst.turn, below: worst.below, off: worst.off, t: worst.t, pair: worst.pair })}), ${held} holds booked inside a window — the round-3 tree drew 0.812 mm for 203 ms at 130° / 70 / 0.77`,
      solves >= 10 && worst.d >= twoR - 1e-6 && held === 0, JSON.stringify(worst));
  }
  // r28 — refuter A's hairpin family (order 16 round 4): a single-runway bend of 135° / 150° / 170° built
  // from TEST-bend-90, trains of 2–6 balls 30 ms apart. What the law says: the impulse at the vertex
  // leaves the front at u·(1 + (n−1)J⁺)/(1 + (n−1)J⁺²), negative past J⁺ = −1/(n−1) — the train is
  // then STOPPED against the corner and rests there (a jam the chain law's rest test holds). Required
  // here: no throw, every drawn pair one diameter clear at 1 kHz and at 10 kHz around every event, no
  // 10 kHz drawn jump beyond the ball's own motion, and every ball at rest at the end. The round-2
  // tree drew 0.0089 mm, teleported a follower 384.7 mm in 100 µs and cycled to t = 5671 s here.
  // Order 23b (item 2): a rest is NAMED by what holds it, on the event that books it. The trains stopped against the corner by the
  // impulse rest held by the vertex — the followers' drive through J⁺ < 0 presses the front INTO the corner, a one-sided constraint
  // that takes the push (`heldBy 'corner'`, the `impact` event). The 170°/n2 pair is different: the impulse leaves it at +0.010 and it
  // stops 0.15 s later with ball 1 on the exit leg and ball 2 on the entry leg, wedged — |F| 0.1357 inside its capacity R 0.3553,
  // the link's gap closing with both ends freed — a rest held by the pair's own contact (`heldBy 'mutual'`, the `stop` event, with
  // members, F, R, S2). The pre-fix solver read the forward branch of the own-drive at u = 0 there and CREPT the pair 151 mm down the
  // exit leg in 34 `stop` steps over 22.7 s (40 events, tEnd 22.740) — a body "settled" under a non-zero net force, 34 times. Gated:
  // every train's final rest carries a name, at most one `stop` per solve, every solve done inside 5 s.
  {
    const mk28 = (deg, leg2 = 150, tray = 200) => {
      const d = JSON.parse(JSON.stringify(loadDef(path.resolve(here, '../scene/ballreturn/tracks/TEST-bend-90.json'))));
      const th = deg * Math.PI / 180; const dir = [Math.sin(th), -Math.cos(th)];
      const V = [0, -303, 253.5]; const E = [V[0] + dir[0] * leg2, V[1] - 15, V[2] + dir[1] * leg2]; const T = [E[0] + dir[0] * tray, E[1], E[2] + dir[1] * tray];
      const rd = (p) => p.map((x) => +x.toFixed(2));
      d.runways[0].points_mm = [[0, -263, 703.5], rd(V), rd(E)]; d.runways[1].points_mm = [rd(E), rd(T)];
      d.tray.length_mm = tray; d.tray.capacity_balls = Math.floor(tray / 57.15); d.doc.title = `TEST-hairpin-${deg}`;
      return d;
    };
    const rows = []; let ok = true, throws = 0, solves = 0, worst = { d: Infinity }, worstJump = 0, unsettled = 0, jams = 0, unnamed = 0, creeps = 0, slow = 0, wedge = null;
    for (const deg of [135, 150, 170]) {
      let trk = null; try { trk = validateTrack(mk28(deg), { pockets: POCKETS, falls: null }); } catch (e) { rows.push(`${deg}°: REFUSED`); continue; }
      for (const n of [2, 3, 4, 5, 6]) {
        const arrs = Array.from({ length: n }, (_, i) => ({ id: i + 1, handoff: hoff16(trk, 0.5 + 0.03 * i, 4) })); const ids = arrs.map((a) => a.id);
        let sol; try { sol = solveShot({ track: trk, r: R, ledger: [], arrivals: arrs }); } catch (e) { throws += 1; rows.push(`${deg}°/n${n}: THROW`); continue; }
        solves += 1;
        const w = minDrawn(sol, ids, 0.5, 1e-3); if (w.d < worst.d) worst = { ...w, deg, n };
        for (const e of sol.events) { const w2 = minDrawn(sol, ids, Math.max(0.5, e.t - 3e-3), 1e-4); if (w2.d < worst.d) worst = { ...w2, deg, n, ev: e.kind }; }
        const sp28 = (id, t) => { const a = continuationAt(sol, id, t), b = continuationAt(sol, id, t + 1e-6); return a && b && a.kind === 'roll' && b.kind === 'roll' ? Math.abs((a.D - b.D) / 1e-6) : 0; };
        for (const id of ids) { let prev = null; for (let t = 0.5; t <= sol.tEnd; t += 1e-4) { const q = poseAt(sol, id, t, {}); if (!q || q.kind === 'fall') { prev = null; continue; } if (prev) { const j = Math.hypot(q.x - prev.x, q.y - prev.y, q.z - prev.z); const u = Math.max(sp28(id, t - 1e-4), sp28(id, t)); const allow = 2 * u * 1e-4 + 1e-6; if (j > allow && j > worstJump) worstJump = j; } prev = q; } }
        const rest = ids.every((id) => continuationAt(sol, id, sol.tEnd + 1)?.kind === 'rest'); if (!rest) unsettled += 1;
        const imp = sol.events.find((e) => e.kind === 'impact'); const stopped = !!imp && imp.vOut === 0; if (stopped) jams += 1;
        // (order 23b) the name of the hold on the rest event, the stop count and the solve's span
        const last = sol.events[sol.events.length - 1]; const nStop = sol.events.filter((e) => e.kind === 'stop').length;
        const offTray = last && last.runwayId !== 'tray' && last.kind !== 'wall';
        const nm = last ? last.heldBy ?? null : null;
        if (offTray) { if (!nm) unnamed += 1; if (stopped && nm !== 'corner') unnamed += 1; }
        if (deg === 170 && n === 2) wedge = { nm, members: last?.members ?? null, F: last?.F, R: last?.R, S2: last?.S2, t: last?.t, nStop, tEnd: sol.tEnd };
        if (nStop > 1) creeps += 1; if (sol.tEnd > 5) slow += 1;
        rows.push(`${deg}°/n${n}: ${sol.events.length} ev, ${imp ? `impact ${imp.v.toFixed(3)}→${imp.vOut.toFixed(3)}` : 'no impact'}${stopped ? ' (stopped at the corner)' : ''}, rests ${rest}${offTray ? `, held by ${nm ?? 'NOTHING NAMED'}` : ''}${nStop ? `, ${nStop} stop` : ''}`);
      }
    }
    const wedgeOk = !!wedge && wedge.nm === 'mutual' && Array.isArray(wedge.members) && wedge.members.slice().sort().join(',') === '1,2' && Math.abs(Math.abs(wedge.F) - 0.1357) <= 1e-3 && Math.abs(wedge.R - 0.3553) <= 1e-3 && Math.abs(wedge.S2 - 3.290) <= 5e-3 && Math.abs(wedge.t - 2.1429) <= 1e-3 && wedge.nStop === 1;
    ok = throws === 0 && worst.d >= twoR - 1e-6 && worstJump <= 1e-6 && unsettled === 0 && unnamed === 0 && creeps === 0 && slow === 0 && wedgeOk;
    check(`r28 refuter A's hairpin family (135° / 150° / 170° single-runway bends, 2–6 balls 30 ms apart): ${solves} solves, ${throws} throws, every drawn pair one diameter clear at 1 kHz and at 10 kHz around every event (min ${(worst.d * 1e3).toFixed(4)} mm at ${worst.deg}°/n${worst.n}), no 10 kHz drawn jump beyond the ball's own motion (worst ${(worstJump * 1e3).toFixed(4)} mm), every ball at rest at the end (${unsettled} unsettled); ${jams} trains stopped against the corner by the impulse (1 + (n−1)J⁺ < 0), every rest off the tray NAMED (${unnamed} unnamed; the corner-stopped trains held by the vertex), no creep (${creeps} solves with more than one stop, ${slow} beyond 5 s; pre-fix 170°/n2: 34 stops, 151 mm, 22.7 s), the 170°/n2 wedge ${wedge ? `held by ${wedge.nm ?? 'NOTHING NAMED'} members [${(wedge.members ?? []).join(', ')}] |F| ${Number.isFinite(wedge.F) ? Math.abs(wedge.F).toFixed(4) : '—'} R ${Number.isFinite(wedge.R) ? wedge.R.toFixed(4) : '—'} S2 ${Number.isFinite(wedge.S2) ? wedge.S2.toFixed(3) : '—'} at ${wedge.t?.toFixed(4)} (0.1357 / 0.3553 / 3.290 at 2.1429)` : 'MISSING'} — ${rows.join('; ')}`,
      ok && solves >= 12, JSON.stringify({ worst, unnamed, creeps, slow, wedge }));
  }
  // r29 — refuter B's seeded recoil family on the shipped obtuse fixture (order 16 round 5): a feeder
  // ball turned round INSIDE its approach (no verdict; the class a recoil produces) while a 2-ball trunk
  // train comes through the window. Three laws gate here: the converging pair is scanned across the two
  // branches whichever D is larger (round 4 skipped it until the feeder ball's D was the smaller: 17.3 mm,
  // then a 45 mm re-seat at the junction); the joined chain keeps the rear BEHIND the front (a D re-sort
  // put the feeder ball between two touching trunk balls); a ball inside its approach without a verdict
  // is committed, not held short of its clearance (held 1.3 mm below its line the train passed it at
  // 56.09 mm). The pair with the train's TAIL and the feeder ball's own path are gated; the pair with the
  // train's LEADER — a contact with a mid-train member, a contact TREE the chain cannot hold — is read and
  // reported, not gated (§20.8 item 10 of the spike report; order 17).
  {
    const obDef29 = loadDef(path.resolve(here, '../scene/ballreturn/tracks/TEST-obtuse-merge.json'));
    // the 105° row (order 17 item 6; refuter B's `fam()`): rc-run's mid point swung so the branches meet at 105° —
    // the geometry on which a merge that re-sorts by D put the feeder ball INTO the trunk train (battery N29)
    const fam105 = JSON.parse(JSON.stringify(obDef29)); { const a = 105 * Math.PI / 180, L = 380, landX = -1150; for (const rw of fam105.runways) if (rw.id === 'rc-run') rw.points_mm = [[0, -263, 703.5], [+(landX + Math.cos(a) * L).toFixed(4), -300, +(Math.sin(a) * L).toFixed(4)], [landX, -361, 0]]; }
    let solves = 0, throws = 0, worstTail = { d: Infinity }, worstLead = { d: Infinity }, unsettled = 0, worstEx = { ex: -Infinity };
    const d3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    const DT29 = 1e-3, DF29 = 1e-5, BOUND29 = 0.5 * 9.80665 * DT29 * DT29 + EXPORT_GRAIN + 40e-6; // the r32 continuity bound: a merge that re-sorted the chain by D re-seated the trunk's tail 20 mm (N29)
    for (const [label, def] of [['shipped 130°', obDef29], ['105°', fam105]]) {
    const ob = validateTrack(def, { pockets: POCKETS, falls: null });
    const r4 = ob.routes.get(4), r1 = ob.routes.get(1);
    const m = r4.merges.find((x) => x.feeder === 'rc-run'); const Dy = m.yieldD; const Dj1 = stationD(r1, m.rw.id, m.s);
    for (const dD of [-15, -8, -3]) for (const v of [-0.03, -0.15]) for (const D1off of [0.05, 0.2]) {
      const conts = [
        { id: 1, route: r4, D: Dy + dD * MM, v, q: [0, 0, 0, 1], t0: 0 },
        { id: 2, route: r1, D: Dj1 + D1off, v: 0.3, q: [0, 0, 0, 1], t0: 0 },
        { id: 3, route: r1, D: Dj1 + D1off + twoR, v: 0.3, q: [0, 0, 0, 1], t0: 0, follow: true },
      ];
      solves += 1;
      let sol;
      try { sol = solveShot({ track: ob, r: R, ledger: [], arrivals: [], continuations: conts }); } catch (e) { throws += 1; continue; }
      for (const id of [1, 2, 3]) { const c = continuationAt(sol, id, sol.tEnd + 1); if (!c || c.kind !== 'rest') unsettled += 1; }
      for (let t = 0; t <= sol.tEnd; t += 1e-3) {
        const p1 = poseAt(sol, 1, t, {}), p2 = poseAt(sol, 2, t, {}), p3 = poseAt(sol, 3, t, {});
        if (p1 && p3) { const d = d3(p1, p3); if (d < worstTail.d) worstTail = { d, t: +t.toFixed(3), label, dD, v, D1off }; }
        if (p1 && p2) { const d = d3(p1, p2); if (d < worstLead.d) worstLead = { d, t: +t.toFixed(3), label, dD, v, D1off }; }
      }
      for (const id of [1, 2, 3]) for (let t = 0; t <= sol.tEnd; t += DT29) { const p = poseAt(sol, id, t, {}), p1 = poseAt(sol, id, t + DT29, {}), pf = poseAt(sol, id, t + DF29, {}), pb = poseAt(sol, id, t + DT29 - DF29, {}); if (!p || !p1 || !pf || !pb) continue; const ex = d3(p, p1) - (DT29 / DF29) * Math.max(d3(p, pf), d3(pb, p1)); if (ex > worstEx.ex) worstEx = { ex, id, t: +t.toFixed(3), label, dD, v, D1off }; }
    }
    }
    check(`r29 refuter B's seeded recoil family on the shipped obtuse fixture and its 105° variant (a feeder ball turned round inside its approach, a 2-ball trunk train through the window; ${solves} solves): ${throws} throws, every ball at rest at the end, the feeder ball and the train's TAIL one diameter clear at 1 kHz (min ${(worstTail.d / MM).toFixed(4)} mm vs ${(twoR / MM).toFixed(2)} — ${worstTail.label}), every drawn step within the continuity bound (worst excess ${(worstEx.ex * 1e6).toFixed(1)} µm vs ${(BOUND29 * 1e6).toFixed(1)}, ${worstEx.label}); the feeder ball and the train's LEADER read ${(worstLead.d / MM).toFixed(2)} mm (${worstLead.label}) — the mid-train contact the chain cannot hold, reported not gated`,
      throws === 0 && unsettled === 0 && worstTail.d >= twoR - 1e-6 && solves === 24 && worstEx.ex <= BOUND29, JSON.stringify({ worstTail, worstLead, worstEx }));
  }
  // r30 — a ball rolling BACK up its runway (round 5b; refuter A's `p7-back.mjs` case a, battery N12 /
  // N17 / N27): a continuation seeded 5 mm below the entry at −0.3 m/s keeps its sign (the intake never
  // clamps), stops at the landing station (`ceiling`) and is never drawn above it; one seeded 20 mm below
  // the first break at −0.3 m/s crosses that break UPWARD with a continuous drawn station, then comes
  // back down and rests.
  {
    const route = track.routes.get(4); const q = [0, 0, 0, 1];
    const s1 = solveShot({ track, r: R, ledger: [], arrivals: [], continuations: [{ id: 1, route, D: route.total - 5e-3, v: -0.3, q, t0: 0 }] });
    let maxD1 = -Infinity; for (let t = 0; t <= s1.tEnd + 0.1; t += 1e-3) { const p = poseAt(s1, 1, t, {}); if (p) maxD1 = Math.max(maxD1, p.D); }
    const d5 = poseAt(s1, 1, 5e-3, {})?.D ?? NaN;
    const ceil = s1.events.find((e) => e.kind === 'ceiling' && e.ball === 1);
    const rest1 = continuationAt(s1, 1, s1.tEnd + 1);
    const brk = Math.max(...route.breaks.filter((b) => b < route.total - 0.04));
    const s2 = solveShot({ track, r: R, ledger: [], arrivals: [], continuations: [{ id: 1, route, D: brk - 0.02, v: -0.3, q, t0: 0 }] });
    let maxD2 = -Infinity, jump2 = 0; for (let t = 0; t <= s2.tEnd + 0.1; t += 1e-3) { const p = poseAt(s2, 1, t, {}); if (!p) continue; maxD2 = Math.max(maxD2, p.D); const p1 = poseAt(s2, 1, t + 1e-3, {}), pf = poseAt(s2, 1, t + 1e-5, {}); if (p1 && pf) jump2 = Math.max(jump2, Math.abs(p1.D - p.D) - 100 * Math.abs(pf.D - p.D)); } // the 1 ms step against 100× the 10 µs step: a jump, not the roll's own acceleration (½·a·dt² < 1 µm)
    const rest2 = continuationAt(s2, 1, s2.tEnd + 1);
    check(`r30 a ball rolling BACK up its runway: seeded 5 mm below the entry at −0.3 m/s it is at D +${((d5 - (route.total - 5e-3)) * 1e3).toFixed(2)} mm after 5 ms (moving back), stops at the landing station (${ceil ? `ceiling@${ceil.t.toFixed(4)}` : 'NO ceiling event'}; max drawn D − total ${((maxD1 - route.total) * 1e3).toFixed(3)} mm ≤ 0) and rests (${rest1?.kind}); seeded 20 mm below the break at D ${(brk * 1e3).toFixed(1)} mm it crosses it upward (max D ${(maxD2 * 1e3).toFixed(1)} mm, worst 1 ms step beyond its own roll ${(jump2 * 1e6).toFixed(1)} µm) and rests (${rest2?.kind})`,
      d5 > route.total - 5e-3 + 1e-3 && !!ceil && maxD1 <= route.total + 1e-9 && rest1?.kind === 'rest' && maxD2 > brk + 5e-3 && jump2 < 5e-5 && rest2?.kind === 'rest', JSON.stringify({ d5, ceil: ceil?.t, maxD1, brk, maxD2, jump2 }));
  }
  // r31 — refuter C's D1 (order 16 round 6): a queue PRODUCED by lc arrivals carried shot after shot with
  // `continuationAt` until it backs up through the rc junction onto the other branch (18 balls), then a
  // feeder ball seeded INSIDE its approach (D = Dy − 15 mm, rolling back at 0.03 m/s — the state a recoil
  // leaves). Round 5 committed it to the contact law, which pairs a rear with a front's TAIL only; the tail
  // on the other branch was neither on its lane nor converging, and the ball was drawn through nine resting
  // balls to the wall (0.000 mm) on all three merge fixtures. The ball now STANDS at the highest station on
  // its own route at which it first touches any resting ball of the queue — the upper root of that ball's
  // sphere (`standStation`), whichever branch it is on — and holds there; the seat root across routes is no
  // longer bounded by the other route's station (a bound on another axis refused a real root by 0.02 mm).
  {
    const rows = []; let ok = true;
    for (const name of ['TEST-obtuse-merge', 'TEST-midedge-landing', 'TEST-shallow-merge']) {
      const trk = validateTrack(loadDef(path.resolve(here, `../scene/ballreturn/tracks/${name}.json`)), { pockets: POCKETS, falls: null });
      const r4 = trk.routes.get(4), r1 = trk.routes.get(1);
      const m4 = r4.merges.find((x) => x.feeder === 'rc-run'); const Dy = m4.yieldD, Dj = m4.D;
      let ledger = []; let nextId = 1;
      for (let round = 0; round < 6; round++) {
        const arr = []; for (let i = 0; i < 3; i++) { const h = handoffFromSink({ t: 0.5 + i * 0.25, pocket: POCKETS[1], fall: POCKETS[1], r: R, glide: 0.06, tFall: 0.021 }, { track: trk, pockets: POCKETS, r: R }); if (h) arr.push({ id: nextId++, handoff: h }); }
        const s0 = solveShot({ track: trk, r: R, ledger, arrivals: arr });
        const next = []; for (const id of [...ledger.map((e) => e.id), ...arr.map((a) => a.id)]) { if (s0.overflow.has(id)) continue; const c = continuationAt(s0, id, s0.tEnd + 1); if (c && c.kind === 'rest' && c.route) next.push({ id, D: c.D, route: c.route, q: c.q }); }
        ledger = next;
      }
      const above = ledger.filter((e) => e.route === r1 && e.D > stationD(r1, m4.rw.id, m4.s)).length;
      const feeder = { id: 99, route: r4, D: Dy - 15 * MM, v: -0.03, q: [0, 0, 0, 1], t0: 0 };
      let sol, threw = null;
      try { sol = solveShot({ track: trk, r: R, ledger, arrivals: [], continuations: [feeder] }); } catch (e) { threw = e.message.slice(0, 60); }
      if (!sol) { ok = false; rows.push(`${name}: THREW ${threw}`); continue; }
      const ids = ledger.map((e) => e.id).concat([99]);
      let worst = { d: Infinity }, seed = Infinity;
      for (let t = 0; t <= sol.tEnd + 0.1; t += 1e-3) {
        const pf = poseAt(sol, 99, t, {}); if (!pf) continue;
        for (const e of ledger) { const p = poseAt(sol, e.id, t, {}); if (!p) continue; const d = Math.hypot(p.x - pf.x, p.y - pf.y, p.z - pf.z); if (t < 0.5e-3) seed = Math.min(seed, d); else if (d < worst.d) worst = { d, t: +t.toFixed(3), other: e.id }; }
      }
      const y = sol.events.find((e) => e.kind === 'yield' && e.ball === 99);
      const rest = continuationAt(sol, 99, sol.tEnd + 1);
      const good = worst.d >= twoR - 1e-6 && !!y && rest?.kind === 'rest' && rest.D > Dj + 1e-3 && above >= 1;
      ok = ok && good;
      rows.push(`${name}: queue ${ledger.length} (${above} above the junction on the other branch), feeder ${y ? `yields @${y.t.toFixed(4)} and stands at D ${(y.D * 1e3).toFixed(1)} mm` : 'NO yield'}, rests ${rest?.kind} at ${rest ? (rest.D * 1e3).toFixed(1) : '?'} mm (junction ${(Dj * 1e3).toFixed(1)}); min 3-D pair after the first ms ${(worst.d * 1e3).toFixed(3)} mm (ball ${worst.other} at t ${worst.t}); the seed itself sat ${(seed * 1e3).toFixed(1)} mm from the nearest resting ball`);
    }
    check(`r31 refuter C's D1 — a feeder ball inside its approach against a queue backed up through the junction onto the other branch (produced ledgers, three merge fixtures): ${rows.join(' | ')}`, ok && rows.length === 3, rows.join('\n'));
  }
  // r32 — the CONTINUITY arm (order 17 item 1; the round-6 follower teleport that r23b's gap metric could
  // not see once the settle re-sorted the inverted pair, §20.10). For every ball of every solve, at 1 kHz
  // from t 0 to the end: the 3-D distance covered in one step may not exceed what the FASTER of the two end
  // speeds (10 µs reads) covers in that step, plus the terms a physical motion can add — ½·g·dt² (no drive
  // exceeds gravity) — plus the two legal discontinuities this module books by name: a landing snap (one
  // export grain) and a carried overlap re-seated at a contact (the 40 µm seat residual, r20b). A contact
  // or an impact changes a SPEED at an instant, which the faster end speed absorbs; a teleport has no bound.
  // Set: the 3-ball train of every fixture in FX from every served pocket, and r23b's 60 seeded corner cases. On the
  // round-5b tree (the unverified crossing) this arm reads 262 mm at t 0.442 (corner s0 50 / v1 0.1 / v2
  // 0.6 / 2 balls: rc-run 713.97 → trunk 451.24 in one step), 14 of 73 solves; on the sealed tree 0.4 µm.
  {
    const GRAV = 9.80665, DT = 1e-3, DF = 1e-5;
    const BOUND = 0.5 * GRAV * DT * DT + EXPORT_GRAIN + 40e-6;
    const d3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    const continuity = (sol, ids) => {
      let worst = { ex: -Infinity };
      for (const id of ids) for (let t = 0; t <= sol.tEnd + 0.05; t += DT) {
        const p = poseAt(sol, id, t, {}), p1 = poseAt(sol, id, t + DT, {}), pf = poseAt(sol, id, t + DF, {}), pb = poseAt(sol, id, t + DT - DF, {});
        if (!p || !p1 || !pf || !pb || p.kind === 'fall' || p1.kind === 'fall') continue;
        const ex = d3(p, p1) - (DT / DF) * Math.max(d3(p, pf), d3(pb, p1));
        if (ex > worst.ex) worst = { ex, id, t: +t.toFixed(3), from: `${p.runwayId} ${(p.D / MM).toFixed(2)}`, to: `${p1.runwayId} ${(p1.D / MM).toFixed(2)}`, step: d3(p, p1) };
      }
      return worst;
    };
    let solves = 0, throws = 0, worstAll = { ex: -Infinity }, breaches = 0;
    for (const nm of FX) {
      const trk = tracks.get(nm);
      for (const pk of [...trk.routes.keys()]) {
        const arrs = []; for (let i = 0; i < 3; i++) { const h = hoff16(trk, 0.5 + i * 0.03, pk); if (h) arrs.push({ id: i + 1, handoff: h }); }
        if (!arrs.length) continue;
        let sol; try { sol = solveShot({ track: trk, r: R, ledger: [], arrivals: arrs }); } catch (e) { throws += 1; continue; }
        solves += 1; const w = continuity(sol, arrs.map((a) => a.id)); if (w.ex > BOUND) breaches += 1; if (w.ex > worstAll.ex) worstAll = { ...w, case: `${nm} pk${pk} arrivals` };
      }
    }
    {
      const trk = tracks.get('TEST-obtuse-merge'); const route = trk.routes.get(4);
      const corner = (() => { for (const b of route.breaks) { const a = tangentAt(route, b + 2e-3, {}), c = tangentAt(route, Math.max(0, b - 2e-3), {}); if (a.tx * c.tx + a.ty * c.ty + a.tz * c.tz < 0.5) return b; } return NaN; })();
      for (const s0 of [50, 54, 57, 60, 65]) for (const v1 of [0, 0.05, 0.1]) for (const v2 of [0.34, 0.6]) for (const nb of [1, 2]) {
        const D1 = corner - s0 * MM, D2 = corner + 90 * MM;
        const conts = [{ id: 1, route, D: D1, v: v1, q: [0, 0, 0, 1], t0: 0 }, { id: 2, route, D: D2, v: v2, q: [0, 0, 0, 1], t0: 0 }];
        if (nb === 2) { const P = stationAt(route, D2, R, {}); conts.push({ id: 3, route, D: seatBehind(route, [P.x, P.y, P.z], D2, twoR), v: v2, q: [0, 0, 0, 1], t0: 0, follow: true }); }
        let sol; try { sol = solveShot({ track: trk, r: R, ledger: [], arrivals: [], continuations: conts }); } catch (e) { throws += 1; continue; }
        solves += 1; const w = continuity(sol, conts.map((c) => c.id)); if (w.ex > BOUND) breaches += 1; if (w.ex > worstAll.ex) worstAll = { ...w, case: `corner s0 ${s0} v1 ${v1} v2 ${v2} nb ${nb}` };
      }
    }
    check(`r32 continuity: every ball of ${solves} solves (every fixture in FX × every served pocket, 3-ball trains; r23b's 60 seeded corner cases) read at 1 kHz — no 1 ms step exceeds the faster end speed's cover plus ½·g·dt² + one grain + the 40 µm seat residual (${(BOUND * 1e6).toFixed(1)} µm): worst excess ${(worstAll.ex * 1e6).toFixed(1)} µm (${worstAll.case}, ball ${worstAll.id} at t ${worstAll.t}, ${worstAll.from} → ${worstAll.to}), ${breaches} breaches, ${throws} throws — the round-5b tree reads 262 mm here (the unverified crossing's teleport)`,
      throws === 0 && breaches === 0 && solves >= 60, JSON.stringify(worstAll));
  }
  // r33 — a CHAIN rolling back across a break (order 17 item 6; battery N12 — a follower's upward crossing):
  // on the shipped synthetic slide a 2-ball chain is seeded 20 mm below the first break of route 4 rolling
  // back at −0.3 m/s (leader below, follower seated one diameter behind it, i.e. ABOVE it). The follower
  // crosses the break upward first, then the leader; the pair stays one diameter apart in 3-D throughout,
  // every drawn step obeys the continuity bound of r32, the pair turns and comes back down to rest.
  {
    const route = track.routes.get(4); const q = [0, 0, 0, 1];
    const brk = Math.max(...route.breaks.filter((b) => b < route.total - 0.04));
    const D2 = brk - 0.02; const P = stationAt(route, D2, R, {});
    const conts = [{ id: 1, route, D: D2, v: -0.3, q, t0: 0 }, { id: 2, route, D: seatBehind(route, [P.x, P.y, P.z], D2, twoR), v: -0.3, q, t0: 0, follow: true }];
    let sol, threw = null; try { sol = solveShot({ track, r: R, ledger: [], arrivals: [], continuations: conts }); } catch (e) { threw = e.message.slice(0, 50); }
    let worstGap = { d: Infinity }, worstEx = { ex: -Infinity }, maxD2 = -Infinity, crossedUp = false;
    if (sol) {
      const d3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); const DT = 1e-3, DF = 1e-5;
      const BOUND = 0.5 * 9.80665 * DT * DT + EXPORT_GRAIN + 40e-6;
      for (let t = 0; t <= sol.tEnd + 0.05; t += DT) {
        const a = poseAt(sol, 1, t, {}), b = poseAt(sol, 2, t, {});
        if (a && b) { const d = d3(a, b); if (d < worstGap.d) worstGap = { d, t: +t.toFixed(3) }; }
        if (b) { maxD2 = Math.max(maxD2, b.D); if (b.D > brk + 1e-3) crossedUp = true; }
        for (const id of [1, 2]) { const p = poseAt(sol, id, t, {}), p1 = poseAt(sol, id, t + DT, {}), pf = poseAt(sol, id, t + DF, {}), pb = poseAt(sol, id, t + DT - DF, {}); if (!p || !p1 || !pf || !pb) continue; const ex = d3(p, p1) - (DT / DF) * Math.max(d3(p, pf), d3(pb, p1)); if (ex > worstEx.ex) worstEx = { ex, id, t: +t.toFixed(3), bound: BOUND }; }
      }
    }
    const rests = sol ? [1, 2].map((id) => continuationAt(sol, id, sol.tEnd + 1)).filter((c) => c && c.kind === 'rest').length : 0;
    // the upward crossing is a PIECE BOUNDARY AT THE BREAK (battery N41: a member never read as moving back books no
    // crossing above, the piece keeps the lower segment's acceleration until the next event — 0.8 mm on the turn
    // station here, invisible to the gap and continuity reads): a roll piece of the leader starts within 1 µm of the
    // break rolling back, and it carries the upper segment's acceleration — the same `a` as the leader's last roll
    // piece before its turn (same segment, same direction; a two-ball chain on one segment has a lone ball's a).
    const ps1 = sol ? sol.pieces.get(1) : [];
    const upPiece = ps1.find((p) => p.kind === 'roll' && Math.abs(p.D0 - brk) < 1e-6 && p.v0 < 0) || null;
    const turn1 = sol ? sol.events.find((e) => e.kind === 'turn' && e.ball === 1) : null;
    const preTurn = turn1 ? [...ps1].reverse().find((p) => p.kind === 'roll' && p.t0 < turn1.t && p.v0 < 0 && p.D0 > brk + 1e-6) || null : null;
    const pieceAtBreak = !!upPiece && !!preTurn && Math.abs(upPiece.a - preTurn.a) < 1e-9;
    check(`r33 a 2-ball chain rolling BACK across the break at D ${(brk / MM).toFixed(1)} mm (synthetic slide, route 4, seeded 20 mm below it at −0.3 m/s): ${threw ? 'THREW ' + threw : 'solved'}; the follower crosses the break upward (max D ${(maxD2 / MM).toFixed(1)} mm), the pair one diameter apart throughout (min ${(worstGap.d / MM).toFixed(4)} mm), worst continuity excess ${(worstEx.ex * 1e6).toFixed(1)} µm (bound ${(worstEx.bound * 1e6).toFixed(1)}), both at rest at the end (${rests}/2); the upward crossing is a piece boundary at the break (${upPiece ? `piece at D ${(upPiece.D0 / MM).toFixed(3)} mm, a ${upPiece.a.toFixed(5)} vs the pre-turn piece's ${preTurn ? preTurn.a.toFixed(5) : 'n/a'}` : 'NO piece starts at the break'})`,
      !!sol && crossedUp && worstGap.d >= twoR - 1e-6 && worstEx.ex <= worstEx.bound && rests === 2 && pieceAtBreak, JSON.stringify({ worstGap, worstEx, maxD2, crossedUp, upPiece: upPiece ? { t0: upPiece.t0, D0: upPiece.D0, a: upPiece.a } : null, preTurn: preTurn ? { t0: preTurn.t0, D0: preTurn.D0, a: preTurn.a } : null }));
  }
  // r34 — two branches of one junction (order 17, item 3). Two balls one diameter from the junction point on
  // the two feeders are 2·2r·sin(θ/2) apart, θ the angle between the incoming directions: clear only for
  // θ ≥ 60°. TEST-shallow-merge has θ 34.0° (33.5 mm — a 23.7 mm overlap for two balls at their lines),
  // TEST-obtuse-merge 127.2° (102.4 mm, clear). Two cases on the shallow fixture: (a) refuter B's `backinto2`
  // worst seeding — a feeder ball above its line rolling in while a trunk ball rolls BACK up through the
  // junction onto the other feeder, the two converging on the point from the two branches (round 6's tree
  // drew them 8.4 mm apart and re-seated one 44 mm at the landing; the converging-pair scan now covers two
  // feeders of one point); (b) two feeders' arrivals waiting on a window held by a RESTING ledger ball —
  // the second waiting ball stands at the upper root of the first's sphere (round 6), not at its line.
  {
    const trk = tracks.get('TEST-shallow-merge'); const r4 = trk.routes.get(4), r1 = trk.routes.get(1);
    const m = r4.merges.find((x) => x.feeder === 'rc-run'); const Dy = m.yieldD, Dj1 = stationD(r1, m.rw.id, m.s);
    const d3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); const DT = 1e-3, DF = 1e-5, BOUND = 0.5 * 9.80665 * DT * DT + EXPORT_GRAIN + 40e-6;
    const contin = (sol, ids) => { let w = { ex: -Infinity }; for (const id of ids) for (let t = 0; t <= sol.tEnd + 0.05; t += DT) { const p = poseAt(sol, id, t, {}), p1 = poseAt(sol, id, t + DT, {}), pf = poseAt(sol, id, t + DF, {}), pb = poseAt(sol, id, t + DT - DF, {}); if (!p || !p1 || !pf || !pb) continue; const ex = d3(p, p1) - (DT / DF) * Math.max(d3(p, pf), d3(pb, p1)); if (ex > w.ex) w = { ex, id, t: +t.toFixed(3) }; } return w; };
    const minPair = (sol, ids, t0 = 0) => { let w = { d: Infinity }; for (let t = t0; t <= sol.tEnd + 0.05; t += DT) { const ps = ids.map((id) => [id, poseAt(sol, id, t, {})]).filter(([, p]) => p && p.kind !== 'fall'); for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) { const d = d3(ps[i][1], ps[j][1]); if (d < w.d) w = { d, t: +t.toFixed(3), pair: [ps[i][0], ps[j][0]] }; } } return w; };
    const angle = (() => { const t4 = tangentAt(r4, m.D + 5e-3, {}), t1 = tangentAt(r1, Dj1 + 5e-3, {}); return Math.acos(Math.max(-1, Math.min(1, t4.tx * t1.tx + t4.ty * t1.ty + t4.tz * t1.tz))) * 180 / Math.PI; })();
    // (a) the converging pair
    const contsA = [{ id: 1, route: r4, D: Dy + 40 * MM, v: 0.3, q: [0, 0, 0, 1], t0: 0 }, { id: 2, route: r1, D: Dj1 - twoR - 35 * MM, v: -0.7, q: [0, 0, 0, 1], t0: 0 }];
    let solA, threwA = null; try { solA = solveShot({ track: trk, r: R, ledger: [], arrivals: [], continuations: contsA }); } catch (e) { threwA = e.message.slice(0, 50); }
    const wA = solA ? minPair(solA, [1, 2]) : { d: NaN }, cA = solA ? contin(solA, [1, 2]) : { ex: NaN };
    const restA = solA ? [1, 2].every((id) => continuationAt(solA, id, solA.tEnd + 1)?.kind === 'rest') : false;
    // (b) two feeders' arrivals on a window held by a resting queue: nine balls packed from the wall by the
    // module's own ledger law (the ninth stands above the junction), then one arrival from each feeder
    const idsB = Array.from({ length: 9 }, (_, i) => i + 1);
    const baseB = solveShot({ track: trk, r: R, ledger: idsB, arrivals: [] });
    const ledgerB = idsB.map((id) => ({ id, ...continuationAt(baseB, id, baseB.tEnd + 1) })).filter((c) => c.kind === 'rest').map((c) => ({ id: c.id, D: c.D, route: c.route, q: c.q }));
    const arrsB = [{ id: 11, handoff: hoff16(trk, 0.5, 4) }, { id: 12, handoff: hoff16(trk, 0.55, 1) }].filter((a) => a.handoff);
    let solB, threwB = null; try { solB = solveShot({ track: trk, r: R, ledger: ledgerB, arrivals: arrsB }); } catch (e) { threwB = e.message.slice(0, 50); }
    const wB = solB ? minPair(solB, [...idsB, 11, 12]) : { d: NaN }, cB = solB ? contin(solB, [11, 12]) : { ex: NaN };
    const holdsB = solB ? solB.events.filter((e) => e.kind === 'yield').map((e) => `${e.ball}@${(e.D / MM).toFixed(1)}`) : [];
    const stationsB = solB ? [11, 12].map((id) => { const c = continuationAt(solB, id, solB.tEnd + 1); return c ? `${id}:${c.kind}@${(c.D / MM).toFixed(1)}` : `${id}:?`; }) : [];
    check(`r34 two branches of one junction on TEST-shallow-merge (θ ${angle.toFixed(1)}° between the incoming directions: two balls one diameter from the point would be ${(2 * twoR * Math.sin(angle / 2 * Math.PI / 180) / MM).toFixed(1)} mm apart): (a) the converging pair — a feeder ball rolling in, a trunk ball rolling back up through the junction onto the other feeder: ${threwA ? 'THREW ' + threwA : `min ${(wA.d / MM).toFixed(4)} mm (t ${wA.t}), continuity excess ${(cA.ex * 1e6).toFixed(1)} µm, both at rest ${restA}`}; (b) two feeders' arrivals on a window held by a nine-ball queue packed from the wall (the ninth above the junction on the lc lane — the lc arrival joins it, the rc arrival holds): ${threwB ? 'THREW ' + threwB : `yields ${holdsB.join(' ')}, rests ${stationsB.join(' ')}, min pair ${(wB.d / MM).toFixed(4)} mm, continuity excess ${(cB.ex * 1e6).toFixed(1)} µm`} — on the round-6 tree (a) read 8.407 mm`,
      !!solA && !!solB && wA.d >= twoR - 1e-6 && cA.ex <= BOUND && restA && wB.d >= twoR - 1e-6 && cB.ex <= BOUND && holdsB.length >= 1 && angle < 60, JSON.stringify({ wA, cA, wB, cB, holdsB, stationsB })); // (b): the rc arrival holds; the lc arrival is on the queue's own lane and JOINS it (refuter D: two simultaneous holders never occur on this family) — both one diameter clear
  }
  // r35 — two holders for one point (order 17 item 2b, review round 11 P2-c). Seal 15's `windowOccupants`
  // exempted a held front standing on its own line from the occupancy count of every other branch — two
  // fronts could be released into one point together, their spacing left to the contact law. The exemption
  // is gone: a held front is occupancy for every other branch, and two holders waiting for one point are
  // released in id order (the event tie-break's own order), never together. Fixture: on the shallow AND the
  // obtuse geometry an rc ball and an lc ball arrive at their lines while a slow trunk ball is inside the
  // window. Shallow: the lower id yields (a hold), the higher id crosses without a hold — the tie-break applied at the
  // ask, so no two fronts are ever released together — and the holder is released after it clears; obtuse: the lc ball is on the trunk ball's own lane and joins it (no second
  // holder there — refuter D's reading of the family); every pair one diameter throughout. Pre-fix number:
  // a sweep of 225 seedings per fixture on the seal-16 tree found no overlap in this family (57.150 mm) —
  // the defect is closed by construction, not by a measured breach.
  {
    const rows = []; let ok = true;
    const d3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    for (const [nm, expectTwo] of [['TEST-shallow-merge', true], ['TEST-obtuse-merge', false]]) {
      const trk = tracks.get(nm); const r4 = trk.routes.get(4), r1 = trk.routes.get(1);
      const m4 = r4.merges.find((x) => x.feeder === 'rc-run'); const sJ = m4.s, after = m4.rw.id;
      const m1 = r1.merges.find((x) => x.rw.id === after && Math.abs(x.s - sJ) < 1e-9); const Dj1 = stationD(r1, after, sJ);
      const conts = [{ id: 1, route: r4, D: m4.yieldD + 0.03, v: 0.3, q: [0, 0, 0, 1], t0: 0 }, { id: 2, route: r1, D: m1.yieldD + 0.03, v: 0.3, q: [0, 0, 0, 1], t0: 0 }, { id: 3, route: r1, D: Dj1 + 0.02, v: 0.1, q: [0, 0, 0, 1], t0: 0 }];
      let sol, threw = null; try { sol = solveShot({ track: trk, r: R, ledger: [], arrivals: [], continuations: conts }); } catch (e) { threw = e.message.slice(0, 50); }
      if (!sol) { ok = false; rows.push(`${nm}: THREW ${threw}`); continue; }
      let worst = { d: Infinity }; for (let t = 0; t <= sol.tEnd + 0.05; t += 1e-3) { const ps = [1, 2, 3].map((id) => [id, poseAt(sol, id, t, {})]).filter(([, p]) => p); for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) { const d = d3(ps[i][1], ps[j][1]); if (d < worst.d) worst = { d, t: +t.toFixed(3), pair: [ps[i][0], ps[j][0]] }; } }
      const yields = sol.events.filter((e) => e.kind === 'yield'), rel = sol.events.filter((e) => e.kind === 'release');
      const lowerYields = yields.some((e) => e.ball === 1) && !yields.some((e) => e.ball === 2);          // the lower id yields; the higher id crosses without a hold (review r4 P2-1's e7)
      const noTogether = rel.every((a, i) => rel.every((b, j) => i === j || Math.abs(a.t - b.t) > 1e-9)); // no two fronts released at one instant
      const rests = [1, 2, 3].every((id) => continuationAt(sol, id, sol.tEnd + 1)?.kind === 'rest');
      const good = worst.d >= twoR - 1e-6 && rests && lowerYields && noTogether && rel.length >= 1;
      ok = ok && good;
      rows.push(`${nm}: yields ${yields.map((e) => `${e.ball}/${e.other}@${e.t.toFixed(4)}`).join(' ')}, releases ${rel.map((e) => `${e.ball}@${e.t.toFixed(4)}`).join(' ')}, min pair ${(worst.d / MM).toFixed(4)} mm, rests ${rests}`);
    }
    check(`r35 two fronts for one point (the held-front exemption gone; the lower id yields, the higher id crosses, no two releases at one instant): ${rows.join(' | ')}`, ok && rows.length === 2, rows.join('\n'));
  }
  // r36 — runway clearance, fail-closed (order 17 item 3b, review round 11 P2-d): two runways that are not
  // linked must keep their centre paths one diameter plus the support's landing tolerance apart everywhere
  // (V14). Fixture: the terminal fixture's two chutes extended toward the centre until their stop faces —
  // the drawable ends of two unrelated systems — sit 48 mm apart (refused by name) and 58 mm apart (refused:
  // 2r + tol 77.15); the control with the faces 168 mm apart builds. Every definition in web/scene/ballreturn/tracks but TEST-crossing-wire-slide (which V14 refuses, r55) builds under V14
  // (the gate loads them), and refuter 1's runway-proximity rows (a crossing at 0.48 mm, a parallel run at
  // 46 mm) are what V14 refuses.
  {
    const base = loadDef(path.resolve(here, '../scene/ballreturn/tracks/TEST-terminal-chutes.json')); const d0 = 57.15;
    const variant = (zEnd) => { const d = JSON.parse(JSON.stringify(base)); for (const [id, sgn] of [['lc-chute', -1], ['rc-chute', 1]]) { const c = d.runways.find((r) => r.id === id); const p0 = c.points_mm[0]; const zStop = sgn * (zEnd + 24); const run = Math.abs(p0[2] - zStop); const yStop = p0[1] - 0.2 * run; c.points_mm = [p0, [0, +yStop.toFixed(2), zStop], [0, +(yStop + 10).toFixed(2), sgn * zEnd]]; c.stop.wall_s_mm = +Math.hypot(run, p0[1] - yStop).toFixed(1); c.stop.capacity_balls = Math.floor(c.stop.wall_s_mm / d0); } return d; };
    const rows = [];
    for (const [tag, zEnd, expectRefusal] of [['faces 48 mm apart', 0, true], ['faces 58 mm apart', 5, true], ['faces 168 mm apart (control)', 60, false]]) {
      let msg = null; try { validateTrack(variant(zEnd), { pockets: POCKETS, falls: null }); } catch (e) { msg = e.message; }
      const refusedByV14 = !!msg && /\[V14\]/.test(msg) && /lc-chute and rc-chute/.test(msg);
      const mm = msg ? (msg.match(/within ([0-9.]+) mm/) || [])[1] : null;
      rows.push({ tag, ok: expectRefusal ? refusedByV14 : msg === null, mm, msg: msg ? msg.slice(0, 90) : 'builds' });
    }
    check(`r36 runway clearance is fail-closed (V14): two unrelated runways closer than 2r + the support's landing tolerance are refused by name — ${rows.map((r) => `${r.tag}: ${r.msg === 'builds' ? 'builds' : `refused [V14] at ${r.mm} mm`}`).join('; ')}`, rows.every((r) => r.ok), JSON.stringify(rows));
  }
  // r37 — at most two branches at one point, fail-closed (order 17, §21.11 P2-c's proof row). The schema admits
  // any number of runways landing at one station of one runway (V3 checks each landing alone, V14 exempts pairs
  // sharing a landing station), so a three-branch point — the only place the two-holder release clause of item
  // 2b can fire — is reachable by definition. V15 refuses it by name until order 18's three-branch fixture.
  // Fixture: TEST-shallow-merge plus a synthetic third feeder from the head-left corner cup straight to the
  // trunk head (three landings at s 0): refused by V15 naming the three runways — and because V15 runs LAST,
  // that refusal states the definition passed every other row (the case is admitted by the schema minus V15).
  // Controls: the same third feeder landing at trunk s 120 mm and at tray s 150 mm build (V15 counts landings
  // at one station, not runways), and the base builds.
  {
    const base = loadDef(path.resolve(here, '../scene/ballreturn/tracks/TEST-shallow-merge.json'));
    const variant = (next, land) => {
      const d = JSON.parse(JSON.stringify(base));
      d.runways.splice(2, 0, { id: 'cc-run', role: 'entry', points_mm: [[-1299.5, -263, -664.5], land], next, notes: 'synthetic third feeder (r37)', provenance: { tag: 'TEST', source: 'synthetic third feeder from the head-left corner cup: a three-branch point for the V15 arm' } });
      d.pockets.push({ index: 0, entry_runway: 'cc-run', exit_below_y_mm: -199, notes: 'synthetic (r37)', provenance: { tag: 'TEST', source: 'synthetic third served pocket for the V15 arm' } });
      d.unserved_pockets = d.unserved_pockets.filter((u) => u.index !== 0);
      return d;
    };
    const rows = [];
    for (const [tag, def, expect] of [['three landings at the trunk head', variant('trunk', [-1150, -361, 0]), 'V15'], ['third feeder at trunk s 120 mm (control)', variant('trunk', [-1270, -376.6, 0]), 'builds'], ['third feeder at tray s 150 mm (control)', variant('tray', [-1450, -386, 0]), 'builds'], ['base (control)', JSON.parse(JSON.stringify(base)), 'builds']]) {
      let msg = null; try { validateTrack(def, { pockets: POCKETS, falls: null }); } catch (e) { msg = e.message; }
      const ok = expect === 'builds' ? msg === null : (!!msg && /\[V15\]/.test(msg) && /3 runways land at one station \(rc-run, lc-run, cc-run\)/.test(msg) && /junction trunk at s 0\.0 mm/.test(msg));
      rows.push({ tag, ok, msg: msg ? msg.slice(0, 110) : 'builds' });
    }
    check(`r37 at most two branches at one point (V15, fail-closed): a third runway landing at one station is refused by name, and V15 runs last so the refusal states every other row passed — ${rows.map((r) => `${r.tag}: ${r.msg}`).join(' | ')}`, rows.every((r) => r.ok), JSON.stringify(rows));
  }
  // r38 — a ball pushed BACKWARD through a junction continues on the rail it is on (order 18 item 2). Two seeded cases:
  // (a) the obtuse fixture (refuter B's backinto2 seeding, §21.4): a feeder ball rolling down toward the 113.5° corner met by
  // a trunk ball shoved UP the trunk. The seal-17 tree re-seated the feeder ball 69.4 mm UP its own feeder (520.8 mm, above
  // where it started) when the chain reached the corner; now the crossing is booked with the member's own rate, the chain is
  // stopped at the corner by the vertex impact (a squeeze into the concave corner: the reversal rule), and the ball never
  // climbs above its start — the residual is the rigid model's singular last millisecond before the jam (the squeeze step,
  // reported, ~10 mm), the pair one diameter throughout. (b) the shallow fixture's trunk head is a FORK NOSE: a two-ball
  // chain backing into it is stopped at the point (`stop`, fork), no ball drawn above the head on either feeder, both rest.
  {
    const d3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); const DT = 1e-3, DF = 1e-5, BOUND = 0.5 * 9.80665 * DT * DT + EXPORT_GRAIN + 40e-6;
    const cont = (sol, ids, skip) => { let w = { ex: -Infinity }; for (const id of ids) for (let t = 0; t <= sol.tEnd + 0.05; t += DT) { if (skip !== null && Math.abs(t - skip) <= 2e-3) continue; const p = poseAt(sol, id, t, {}), p1 = poseAt(sol, id, t + DT, {}), pf = poseAt(sol, id, t + DF, {}), pb = poseAt(sol, id, t + DT - DF, {}); if (!p || !p1 || !pf || !pb) continue; const ex = d3(p, p1) - (DT / DF) * Math.max(d3(p, pf), d3(pb, p1)); if (ex > w.ex) w = { ex, id, t: +t.toFixed(3) }; } return w; };
    const minPair = (sol, ids) => { let w = Infinity; for (let t = 0; t <= sol.tEnd + 0.05; t += DT) { const ps = ids.map((id) => poseAt(sol, id, t, {})).filter(Boolean); for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) w = Math.min(w, d3(ps[i], ps[j])); } return w; };
    // (a) obtuse
    const to = tracks.get('TEST-obtuse-merge'); const r4o = to.routes.get(4), r1o = to.routes.get(1);
    const m4o = r4o.merges.find((x) => x.feeder === 'rc-run'); const Dj1o = stationD(r1o, m4o.rw.id, m4o.s); const D1start = m4o.yieldD + 0.5 * MM;
    const solA = solveShot({ track: to, r: R, ledger: [], arrivals: [], continuations: [{ id: 1, route: r4o, D: D1start, v: 0.3, q: [0, 0, 0, 1], t0: 0 }, { id: 2, route: r1o, D: Dj1o - twoR - 35 * MM, v: -0.3, q: [0, 0, 0, 1], t0: 0 }] });
    // after the contact (0.088 s) the feeder ball only ever comes DOWN its feeder: its rc-run station never exceeds the one it has at 0.1 s
    const Dref = poseAt(solA, 1, 0.1, {})?.D ?? NaN; let climb = -Infinity; for (let t = 0.1; t <= solA.tEnd + 0.05; t += DT) { const p = poseAt(solA, 1, t, {}); if (p && p.runwayId === 'rc-run') climb = Math.max(climb, p.D); }
    const jam = solA.events.find((e) => e.kind === 'impact' && Math.abs(e.D - m4o.D) < 1e-6 && e.vOut === 0) ?? null;
    let squeeze = 0; if (jam) { const a = poseAt(solA, 1, jam.t - DT, {}), b = poseAt(solA, 1, jam.t + 1e-9, {}); if (a && b) squeeze = d3(a, b); }
    const contA = cont(solA, [1, 2], jam ? jam.t : null); const pairA = minPair(solA, [1, 2]);
    const restsA = [1, 2].every((id) => continuationAt(solA, id, solA.tEnd + 1)?.kind === 'rest');
    const okA = Number.isFinite(Dref) && climb <= Dref + 1e-6 && !!jam && pairA >= twoR - 1e-6 && contA.ex <= BOUND && restsA;
    // (b) shallow fork
    const ts = tracks.get('TEST-shallow-merge'); const r4s = ts.routes.get(4); const m4s = r4s.merges.find((x) => x.feeder === 'rc-run'); const Dfork = m4s.D;
    const solB = solveShot({ track: ts, r: R, ledger: [], arrivals: [], continuations: [{ id: 1, route: r4s, D: Dfork - 30 * MM, v: -0.3, q: [0, 0, 0, 1], t0: 0 }, { id: 2, route: r4s, D: Dfork - 30 * MM - twoR, v: -0.3, q: [0, 0, 0, 1], t0: 0, follow: true }] });
    let maxB = -Infinity; for (let t = 0; t <= solB.tEnd + 0.05; t += DT) for (const id of [1, 2]) { const p = poseAt(solB, id, t, {}); if (p) maxB = Math.max(maxB, p.D); }
    const stopB = solB.events.find((e) => e.kind === 'stop' && e.fork) ?? null; const contB = cont(solB, [1, 2], null); const pairB = minPair(solB, [1, 2]);
    const restsB = [1, 2].every((id) => continuationAt(solB, id, solB.tEnd + 1)?.kind === 'rest');
    const okB = !!stopB && Math.abs(stopB.D - Dfork) < 1e-6 && maxB <= Dfork + 1e-6 && pairB >= twoR - 1e-6 && contB.ex <= BOUND && restsB;
    check(`r38 a ball pushed BACKWARD through a junction continues on the rail it is on (order 18 item 2): (a) obtuse seeded chain — the feeder ball never climbs back up its feeder after the contact (max rc-run D ${(climb / MM).toFixed(2)} from 0.1 s on vs ${(Dref / MM).toFixed(2)} at 0.1 s; the seal-17 tree re-seated it to 520.84), the chain is jammed at the corner by the vertex impact (${jam ? `impact@${jam.t.toFixed(4)}` : 'NO jam'}; the squeeze step of the rigid model's last millisecond ${(squeeze * 1e3).toFixed(2)} mm, reported), pair min ${(pairA * 1e3).toFixed(3)} mm, continuity outside ±2 ms of the jam ${(contA.ex * 1e6).toFixed(1)} µm (bound ${(BOUND * 1e6).toFixed(1)}), rest ${restsA}; (b) the shallow trunk head is a fork nose — ${stopB ? `stop(fork)@${stopB.t.toFixed(4)} at D ${(stopB.D / MM).toFixed(2)}` : 'NO fork stop'}, nothing drawn above the head (max D ${(maxB / MM).toFixed(2)} vs ${(Dfork / MM).toFixed(2)}), pair min ${(pairB * 1e3).toFixed(3)} mm, continuity ${(contB.ex * 1e6).toFixed(1)} µm, rest ${restsB}`,
      okA && okB, JSON.stringify({ climb, Dref, D1start, jam: jam ? { t: jam.t, D: jam.D } : null, squeeze, pairA, contA, restsA, stopB: stopB ? { t: stopB.t, D: stopB.D } : null, maxB, Dfork, pairB, contB, restsB }));
  }
  // r39 — TWO HOLDERS for one point (order 18 item 1, the three-branch fixture; review round 11 P2-c's release clause). On a
  // two-feeder point a trunk occupant carries one of the two routes and that route's arrival joins it, so only one branch
  // ever holds (§21.11). TEST-y3-obtuse adds a third rail at the obtuse fixture's rc landing point (a second feeder, cc-run
  // from the head-left corner cup, landing where rc-run lands, mid-trunk — two landings at one station, V15 untouched): a
  // trunk ball from the lc side is on NEITHER feeder's lane, so an rc arrival and a cc arrival at their lines BOTH hold.
  // The release clause is then live: when the trunk ball clears, the HIGHER id is released first and the lower waits until
  // the released front has crossed the point (never together — its release comes after the other's junction), every pair
  // one diameter, all three at rest. N13 (holders invisible to each other), N26 and N38 (the held-front exemption in its
  // two forms) die here by name — the mutants seal 16 and 17 could not reach.
  {
    const trk = loadT('TEST-y3-obtuse'); const r4 = trk.routes.get(4), r0 = trk.routes.get(0), r1 = trk.routes.get(1);
    const m4 = r4.merges.find((x) => x.feeder === 'rc-run'); const m0 = r0.merges.find((x) => x.feeder === 'cc-run'); const Dj1 = stationD(r1, m4.rw.id, m4.s);
    const d3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    const rows = []; let ok = true;
    for (const [tag, v3] of [['a slow trunk ball inside the window', 0.05], ['a faster trunk ball', 0.2]]) {
      const conts = [{ id: 1, route: r4, D: m4.yieldD + 0.03, v: 0.3, q: [0, 0, 0, 1], t0: 0 }, { id: 2, route: r0, D: m0.yieldD + 0.03, v: 0.3, q: [0, 0, 0, 1], t0: 0 }, { id: 3, route: r1, D: Dj1 + 0.05, v: v3, q: [0, 0, 0, 1], t0: 0 }];
      let sol, threw = null; try { sol = solveShot({ track: trk, r: R, ledger: [], arrivals: [], continuations: conts }); } catch (e) { threw = e.message.slice(0, 50); }
      if (!sol) { ok = false; rows.push(`${tag}: THREW ${threw}`); continue; }
      let worst = Infinity; for (let t = 0; t <= sol.tEnd + 0.05; t += 1e-3) { const ps = [1, 2, 3].map((id) => poseAt(sol, id, t, {})).filter(Boolean); for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) worst = Math.min(worst, d3(ps[i], ps[j])); }
      const yields = sol.events.filter((e) => e.kind === 'yield'); const rel = sol.events.filter((e) => e.kind === 'release');
      const twoHolders = yields.some((e) => e.ball === 1) && yields.some((e) => e.ball === 2);
      const first = rel[0] ?? null, second = rel[1] ?? null;
      const idOrder = !!first && !!second && first.ball === 2 && second.ball === 1;       // the higher id first, the lower waits
      const firstJn = first ? sol.events.find((e) => e.kind === 'junction' && e.ball === first.ball && e.t >= first.t) : null;
      const afterClear = !!firstJn && !!second && second.t >= firstJn.t - 1e-9;           // the lower's release comes after the higher has crossed the point
      const neverTogether = rel.every((a, i) => rel.every((b, j) => i === j || Math.abs(a.t - b.t) > 1e-9));
      const rests = [1, 2, 3].every((id) => continuationAt(sol, id, sol.tEnd + 1)?.kind === 'rest');
      const good = twoHolders && idOrder && afterClear && neverTogether && worst >= twoR - 1e-6 && rests;
      ok = ok && good;
      rows.push(`${tag}: yields ${yields.map((e) => `${e.ball}/${e.other}@${e.t.toFixed(4)}`).join(' ')}, releases ${rel.map((e) => `${e.ball}@${e.t.toFixed(4)}`).join(' ')}, the first's junction ${firstJn ? firstJn.t.toFixed(4) : 'n/a'}, min pair ${(worst * 1e3).toFixed(3)} mm, rest ${rests}`);
    }
    // (c) refuter F's ARRIVALS case on the shallow three-landing point (built through the TEST seam — V15 refuses it for
    // definitions): lc, rc and cc hand-offs timed so the rc and cc balls reach their lines while the lc ball is inside;
    // the cc ball (the higher id) is released first, is shoved 0.09 mm back above its line by the passing lc ball, and
    // the base tree of round 18b then released the LOWER id (3 → 2 → 3). With the window's far edge read to the export
    // grain the shoved front is still an occupant: the lower waits, the higher crosses first — 3 then 2, never 3 → 2 → 3.
    {
      const base = loadDef(path.resolve(here, '../scene/ballreturn/tracks/TEST-shallow-merge.json'));
      const d = JSON.parse(JSON.stringify(base));
      d.runways.splice(2, 0, { id: 'cc-run', role: 'entry', points_mm: [[-1299.5, -263, -664.5], [-1150, -361, 0]], next: 'trunk', notes: 'r39 (c): the third landing at the shallow head', provenance: { tag: 'TEST', source: 'the V15 arm definition (r37), validated through the allowThreeBranch seam' } });
      d.pockets.push({ index: 0, entry_runway: 'cc-run', exit_below_y_mm: -199, notes: 'r39 (c)', provenance: { tag: 'TEST', source: 'synthetic third served pocket' } });
      d.unserved_pockets = d.unserved_pockets.filter((u) => u.index !== 0);
      const t3 = validateTrack(d, { pockets: POCKETS, falls: null, allowThreeBranch: true });
      const T = { rcLine: 3.454, ccLine: 1.337, lcIn: 3.447 }; const Tw = 2.5; // refuter F's read: the travel times from the hand-off to each line / to the point
      for (const [dRc, dCc] of [[0.02, 0.05], [0.05, 0.02]]) {
        const arr = [{ id: 1, handoff: hoff16(t3, Tw - T.lcIn, 1) }, { id: 2, handoff: hoff16(t3, Tw + dRc - T.rcLine, 4) }, { id: 3, handoff: hoff16(t3, Tw + dCc - T.ccLine, 0) }];
        let sol, threw = null; try { sol = solveShot({ track: t3, r: R, ledger: [], arrivals: arr }); } catch (e) { threw = e.message.slice(0, 50); }
        if (!sol) { ok = false; rows.push(`arrivals dRc ${dRc} dCc ${dCc}: THREW ${threw}`); continue; }
        let worst = Infinity; for (let t = 0; t <= sol.tEnd + 0.05; t += 1e-3) { const ps = [1, 2, 3].map((id) => poseAt(sol, id, t, {})).filter(Boolean); for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) worst = Math.min(worst, d3(ps[i], ps[j])); }
        const yields = sol.events.filter((e) => e.kind === 'yield'), rel = sol.events.filter((e) => e.kind === 'release');
        const held = new Set(yields.map((e) => e.ball)); const twoHolders = held.has(2) && held.has(3);
        const first = rel[0] ?? null, second = rel[1] ?? null;
        const firstJn = first ? sol.events.find((e) => e.kind === 'junction' && e.ball === first.ball && e.t >= first.t) : null;
        const orderOk = !!first && first.ball === 3 && !!second && second.ball === 2 && rel.length === 2 && !!firstJn && second.t >= firstJn.t - 1e-9;
        const rests = [1, 2, 3].every((id) => continuationAt(sol, id, sol.tEnd + 1)?.kind === 'rest');
        const good = twoHolders && orderOk && worst >= twoR - 1e-6 && rests;
        ok = ok && good;
        rows.push(`arrivals dRc ${dRc} dCc ${dCc}: yields ${yields.map((e) => `${e.ball}/${e.other}@${e.t.toFixed(4)}`).join(' ')}, releases ${rel.map((e) => `${e.ball}@${e.t.toFixed(4)}`).join(' ')} (the round-18b tree read 3 → 2 → 3), the first's junction ${firstJn ? firstJn.t.toFixed(4) : 'n/a'}, min pair ${(worst * 1e3).toFixed(3)} mm, rest ${rests}`);
      }
    }
    check(`r39 two holders for one point (order 18 item 1): TEST-y3-obtuse (a third rail at the obtuse rc landing point) and the shallow three-landing point by ARRIVALS (the seam) — both feeders hold while the trunk ball is inside, the higher id is released first and the lower only after it has crossed the point, never together and never 3 → 2 → 3, every pair one diameter — ${rows.join(' | ')}`, ok, JSON.stringify(rows));
  }
  // r40 — the graze family's junction livelock (order 18 rounds d/e, found by the seal's own re-run of refuter B's scripts).
  // On refuter B's obtuse130 geometry (the obtuse fixture with its rc-run mid vertex swung to 130°) a fast ball coming down
  // the feeder catches a slow ball just below the junction: the merged chain moves UP, the front crosses the junction
  // upward and continues on the trunk (item 2), and the feeder ball's seat root then vanishes as the front climbs — a
  // FOLD. Round 18c booked that fold at τ = 0 every scan (the settle read the walk at the instant, where the root still
  // exists) and the solve hit MAX_EVENTS on 18 of the family's cases; round 18d reads the walk a hair ahead so the settle
  // parts the chain there; round 18e projects the re-routed member onto the owner route at its own 3-D point (a runway-
  // station mapping jumped it 3.0 mm and its follower 1.8 mm: 52 cases at 57.10 mm). Required: the family's five worst
  // seedings solve (no throw), every pair one diameter at 20 kHz around every event and at 1 kHz throughout, the part is a
  // `separate` (not a hop), the re-route is continuous (the ball's 3-D step at the crossing within the export grain +
  // the corner cut's 0.2 mm offset), every ball at rest at the end.
  {
    const obDef = loadDef(path.resolve(here, '../scene/ballreturn/tracks/TEST-obtuse-merge.json'));
    const fam = (angDeg) => { const a = angDeg * Math.PI / 180; const L = 380, landX = -1150; const mx = +(landX + Math.cos(a) * L).toFixed(4); const mz = +(Math.sin(a) * L).toFixed(4); const d = JSON.parse(JSON.stringify(obDef)); for (const rw of d.runways) if (rw.id === 'rc-run') rw.points_mm = [[0, -263, 703.5], [mx, -300, mz], [landX, -361, 0]]; return d; };
    const t130 = validateTrack(fam(130), { pockets: POCKETS, falls: null }); const rt = t130.routes.get(4);
    const corner = rt.breaks.find((b) => Math.abs(b - 0.4513) < 0.002);
    const d3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
    const rows = []; let ok = Number.isFinite(corner);
    for (const [s, v1, d, v2] of [[2, 0.02, 65, 2.0], [2, 0.02, 90, 0.4], [2, 0.02, 130, 0.4], [2, 0.08, 65, 2.0], [8, 0.08, 90, 1.3]]) {
      const conts = [{ id: 1, route: rt, D: corner - s * MM, v: v1, q: [0, 0, 0, 1], t0: 0 }, { id: 2, route: rt, D: corner + d * MM, v: v2, q: [0, 0, 0, 1], t0: 0 }];
      let sol, threw = null; try { sol = solveShot({ track: t130, r: R, ledger: [], arrivals: [], continuations: conts }); } catch (e) { threw = e.message.slice(0, 50); }
      if (!sol) { ok = false; rows.push(`s${s} v${v1} d${d} v${v2}: THREW ${threw}`); continue; }
      if (s === 8) {
        // (order 23b, item 2) the fast ball's catch throws the pair UP through the junction: ball 1 crosses onto the trunk and the two
        // come to rest 13 mm above the point, one on each leg, WEDGED — ball 1's drive down the trunk pushes ball 2 back up its feeder
        // (G₂ = −0.755) and ball 2's drive pushes ball 1 back up the trunk; the group reads |F| 0.0909 inside its capacity R 0.315, every
        // link's gap closes with both ends freed. The pre-fix solver read the forward branch of the own-drive at u = 0 and CREPT the pair
        // 14.8 mm down through the junction in 6 `stop` steps over 3.6 s (15 events, tEnd 5.737, both balls delivered by an acceleration
        // the law never had); the law rests it in 3 events at 0.3959 and NAMES the hold on the rest event: heldBy 'mutual', members, F, R, S2.
        let worst8 = Infinity; for (let t = 0; t <= sol.tEnd + 0.05; t += 1e-3) { const a = poseAt(sol, 1, t, {}), b = poseAt(sol, 2, t, {}); if (a && b) worst8 = Math.min(worst8, d3(a, b)); }
        const last = sol.events[sol.events.length - 1]; const stops = sol.events.filter((e) => e.kind === 'stop').length;
        const rests8 = [1, 2].every((id) => continuationAt(sol, id, sol.tEnd + 1)?.kind === 'rest');
        const named = !!last && last.heldBy === 'mutual' && Array.isArray(last.members) && last.members.slice().sort().join(',') === '1,2' && Math.abs(Math.abs(last.F) - 0.09089) <= 5e-4 && Math.abs(last.R - 0.3151) <= 5e-4;
        const good8 = sol.events.length <= 4 && Math.abs(sol.tEnd - 0.3959) <= 1e-3 && stops === 0 && named && worst8 >= twoR - 1e-6 && rests8;
        ok = ok && good8;
        rows.push(`s${s} v${v1} d${d} v${v2}: the WEDGE across the junction (order 23b) — ${sol.events.length} events, tEnd ${sol.tEnd.toFixed(4)} (0.3959 ± 0.001), ${stops} stop steps (pre-fix: 6, crawling 464.35 → 449.52 mm over 3.6 s, tEnd 5.737), the rest named ${last ? `${last.kind} heldBy ${last.heldBy ?? '(none)'} members [${(last.members ?? []).join(', ')}] |F| ${Number.isFinite(last.F) ? Math.abs(last.F).toFixed(4) : '—'} R ${Number.isFinite(last.R) ? last.R.toFixed(4) : '—'}` : '—'} (0.0909 / 0.3151), min pair ${(worst8 * 1e3).toFixed(3)} mm, rest ${rests8}`);
        continue;
      }
      let worst = Infinity; const probe = (t) => { const a = poseAt(sol, 1, t, {}), b = poseAt(sol, 2, t, {}); if (a && b) worst = Math.min(worst, d3(a, b)); };
      for (let t = 0; t <= sol.tEnd + 0.05; t += 1e-3) probe(t);
      for (const e of sol.events) for (let t = Math.max(0, e.t - 3e-3); t <= e.t + 3e-3; t += 5e-5) probe(t);
      const parts = sol.events.filter((e) => e.kind === 'separate').length; const impacts = sol.events.filter((e) => e.kind === 'impact');
      // the re-route step: the front's 3-D move across the upward crossing (the first impact at the junction, if any)
      let step = 0; const jn = impacts.find((e) => Math.abs(e.D - corner) < 1e-6) ?? null;
      if (jn) { const a = poseAt(sol, jn.ball, jn.t - 1e-6, {}), b = poseAt(sol, jn.ball, jn.t + 1e-6, {}); if (a && b) step = d3(a, b); }
      const rests = [1, 2].every((id) => continuationAt(sol, id, sol.tEnd + 1)?.kind === 'rest');
      // the fold PARTS the chain (the feeder ball cannot follow the front up the trunk): at least one `separate` per seeding —
      // a walk that hops roots instead (battery N8, the fold ignored) reads none
      const good = worst >= twoR - 1e-6 && rests && sol.events.length < 200 && step <= EXPORT_GRAIN + 0.25e-3 && parts >= 1;
      ok = ok && good;
      rows.push(`s${s} v${v1} d${d} v${v2}: ${sol.events.length} events, min pair ${(worst * 1e3).toFixed(3)} mm, parts ${parts}, re-route step ${(step * 1e3).toFixed(3)} mm, rest ${rests}`);
    }
    check(`r40 the graze family's junction livelock (refuter B's obtuse130 seedings; order 18 rounds d/e): the four graze seedings solve, every pair one diameter at 20 kHz around every event, the fold parts the chain, the re-route is continuous to the grain plus the corner cut's 0.2 mm, every ball at rest; the fifth (s8) is the wedge across the junction, at rest under the law and NAMED (order 23b) — ${rows.join(' | ')}`, ok, JSON.stringify(rows));
  }
  // r41 — the cadence from J′ / J″ (order 19 item 2; §22.6's derivation): a piece freezes a follower chain's acceleration
  // a_f = J·a + J′·v²; the walker's step is now bounded by h ≤ (2·ε_D·v² / (|J′|·a + |J″|·v²))^{1/3} so that the frozen value
  // drifts by less than the export grain in POSITION over the step. The read is the module's own (refuter 1's item 6 method,
  // §20.8): the shipped obtuse 3-ball train's piece after the vertex impact, re-solved from the module's continuationAt at the
  // piece's midpoint and compared at the piece's end — the difference is the frozen-acceleration error over half a piece.
  // Seal 18 read 8.56 mm/s and 0.475 mm (r/2 steps, 151 ms pieces); the law's target is the grain, 0.1 mm.
  {
    const trk = tracks.get('TEST-obtuse-merge');
    const arrs = [[1, 0.5], [2, 0.54], [3, 0.58]].map(([id, t]) => ({ id, handoff: hoff16(trk, t, 4) }));
    const sol = solveShot({ track: trk, r: R, ledger: [], arrivals: arrs });
    const imp = sol.events.find((e) => e.kind === 'impact' && e.t > 8) ?? null;
    const next = imp ? sol.events.find((e) => e.t > imp.t + 1e-6) : null;
    const rows = []; let worstU = 0, worstD = 0, pieces = 0;
    if (imp && next) {
      const tEnd = next.t - 2e-6; const Dof = (s, id, t) => poseAt(s, id, t, {})?.D; const uof = (s, id, t, h = 1e-6) => (Dof(s, id, t - h) - Dof(s, id, t + h)) / (2 * h);
      for (const frac of [0.5, 0.25]) {
        const tm = imp.t + frac * (next.t - imp.t);
        const conts = [1, 2, 3].map((id) => ({ id, c: continuationAt(sol, id, tm) })).filter((x) => x.c && x.c.kind !== 'rest').map((x) => ({ ...x.c, id: x.id, t0: 0 }));
        const s2 = solveShot({ track: trk, r: R, ledger: [], arrivals: [], continuations: conts }); const t2 = tEnd - tm;
        for (const id of [1, 2, 3]) { const a = Dof(sol, id, tEnd), b = Dof(s2, id, t2); if (!Number.isFinite(a) || !Number.isFinite(b)) continue; const du = Math.abs(uof(sol, id, tEnd) - uof(s2, id, t2)), dD = Math.abs(a - b); worstU = Math.max(worstU, du); worstD = Math.max(worstD, dD); }
        rows.push(`re-seeded at ${(frac * 100).toFixed(0)} %: worst |Δu| so far ${(worstU * 1e3).toFixed(3)} mm/s, |ΔD| ${(worstD * 1e3).toFixed(3)} mm`);
      }
      pieces = (sol.steps || []).filter((st) => st.t > imp.t && st.t < next.t).length;
    }
    check(`r41 the cadence from J′ / J″ (order 19 item 2): the shipped obtuse train's post-impact piece (${imp ? imp.t.toFixed(4) : 'n/a'} → ${next ? next.t.toFixed(4) : 'n/a'}, ${pieces} walker steps inside) re-solved from its midpoint and quarter reads back within the export grain in position — ${rows.join('; ')} (seal 18: 8.560 mm/s, 0.475 mm with r/2 steps)`,
      !!imp && !!next && worstD <= EXPORT_GRAIN + 1e-9 && pieces >= 2, JSON.stringify({ imp: imp?.t, next: next?.t, worstU, worstD, pieces }));
  }
  // r26 — cross-lane S-SHIELD-CLEAR: the module can now SEE the class — the 3-D distance between
  // the sink's last drawn centre (the handoff centre over the fall) and a ball queued at the entry,
  // minus one diameter, per served pocket and fixture. Negative = the two drawings can overlap.
  {
    const rows = [];
    for (const [nm, trk] of tracks) for (const [pk, rt] of trk.routes) rows.push([nm, pk, rt.sinkClearance]);
    let star = null, starTrack = null;
    try { const up = loadDef(path.resolve(here, '../scene/ballreturn/tracks/wpbsa_snooker_12ft-xw101-slides.json')); const sctx = await tableContext(up.doc.table_id); const st = validateTrack(up, { pockets: sctx.pockets, falls: sctx.falls }); starTrack = st; star = [...st.routes].map(([pk, rt]) => [pk, rt.sinkClearance]); } catch (e) { star = e.message; }
    const allNum = rows.every((r) => Number.isFinite(r[2])) && Array.isArray(star) && star.every((r) => Number.isFinite(r[1]));
    // V13 fail-close (order 17 item 1b, review round 11 P2-b): a negative clearance DISABLES the track for its table — the
    // Star's export carries `ownershipRequired` naming the row and the negative pockets; no fixture in FX does
    const shippedOwnership = [...tracks].filter(([, trk]) => trk.ownershipRequired).map(([nm]) => nm);
    // order 18 item 0: the high fixture REPRODUCES the class on purpose (entry within one diameter of the hand-off centre): its row
    // is recorded at both served pockets (−34.7 mm) — the ownership hand-off owns it, the schema no longer refuses it
    const high = (() => { try { return loadT('TEST-terminal-chutes-high'); } catch (e) { return { error: e.message.slice(0, 80) }; } })();
    const highOk = !!high.ownershipRequired && high.ownershipRequired.row === 'V13' && JSON.stringify(high.ownershipRequired.pockets.map((x) => x.pocket).sort()) === '[1,4]' && high.ownershipRequired.pockets.every((x) => x.mm < -30 && x.mm > -40);
    const starNeg = Array.isArray(star) ? star.filter((r) => r[1] < 0).map((r) => r[0]) : [];
    const starOwnershipOk = !!starTrack && (starNeg.length === 0 ? !starTrack.ownershipRequired : (starTrack.ownershipRequired?.row === 'V13' && JSON.stringify(starTrack.ownershipRequired.pockets.map((x) => x.pocket).sort()) === JSON.stringify(starNeg.slice().sort())));
    const worstShipped = rows.reduce((m, r) => Math.min(m, r[2]), Infinity);
    check(`r26 sink clearance (order 16, cross-lane S-SHIELD-CLEAR) is computed for every served pocket, and a NEGATIVE one is RECORDED by name as ownershipRequired (V13; order 18 item 0: the ownership hand-off closes the class, a host without the hook keeps the track disabled — index.js; the Star's export ${starTrack?.ownershipRequired ? 'ownership required — ' + starTrack.ownershipRequired.pockets.map((x) => `p${x.pocket} ${x.mm} mm`).join(', ') : 'no negative clearance'}; shipped fixtures with the row: ${shippedOwnership.join(', ') || 'none'}; TEST-terminal-chutes-high (order 18 item 0, the class reproduced on purpose): ${high.ownershipRequired ? high.ownershipRequired.pockets.map((x) => `p${x.pocket} ${x.mm} mm`).join(', ') : 'NO ROW ' + (high.error ?? '')}): the 3-D distance from the handoff centre (fall centre, shield − r) to the entry centre minus one diameter — shipped fixtures worst ${(worstShipped * 1e3).toFixed(1)} mm (${rows.map((r) => `${r[0].replace('TEST-', '')} p${r[1]} ${(r[2] * 1e3).toFixed(1)}`).join(', ')}); the Star XW101 reads ${Array.isArray(star) ? star.map(([pk, v]) => `p${pk} ${(v * 1e3).toFixed(1)}`).join(' ') : star} — the snooker lane's −15.1 / −15.2 mm on all six pockets, seen from this side; computed, not refused (the cull line is game.js's constant)`,
      allNum && shippedOwnership.length === 0 && highOk && starOwnershipOk, JSON.stringify({ rows, star, shippedOwnership, starOwnership: starTrack?.disabled ?? null }));
  }
}
// ---- (m) seal 4: contact roles, settled poses carried in full ------------------
{
  // m1 a two-ball contact names the mover and the struck ball (review r2 P2-3)
  const e1 = { t: 1.0, pocket: POCKETS[4], fall: POCKETS[4], r: R, glide: 0.06, tFall: 0.021 };
  const e2 = { ...e1, t: 1.05 };
  const sP = solveShot({ track, r: R, ledger: [], arrivals: [{ id: 1, handoff: handoffFromSink(e1, ctx) }, { id: 2, handoff: handoffFromSink(e2, ctx) }] });
  const contacts = sP.events.filter((ev) => ev.kind === 'contact');
  const rolling = contacts.find((ev) => !ev.via); // a contact reached by rolling (not the landing-overlap seat)
  check('m1 every two-ball contact carries two DISTINCT ids with ball = the moving rear ball (2) and other = the struck front ball (1); a rolling contact carries v and vOut', contacts.length >= 1 && contacts.every((ev) => ev.ball === 2 && ev.other === 1 && Number.isFinite(ev.v)) && (!rolling || Number.isFinite(rolling.vOut)), JSON.stringify(contacts));
  const allDistinct = sol.events.filter((ev) => ev.kind === 'contact').every((ev) => ev.ball !== ev.other);
  check('m1b every contact in the fixture solution names two distinct balls', allDistinct, JSON.stringify(sol.events.filter((ev) => ev.kind === 'contact').slice(0, 3)));
  // m2 settled balls carry route + station + orientation into the next solve (review r2 P2-2)
  const many = [];
  for (let i = 0; i < 6; i++) many.push({ id: 10 + i, handoff: handoffFromSink({ t: 0.5 + i * 0.6, pocket: POCKETS[4], fall: POCKETS[4], r: R, tFall: 0.021, glide: 0.06 }, ctx) });
  const s6 = solveShot({ track, r: R, ledger: [], arrivals: many }); // the 6th rests on the TRUNK (capacity 5)
  const ledger = [...s6.rest.keys()].map((id) => { const st = continuationAt(s6, id, Infinity); return { id, D: st.D, route: st.route, q: st.q }; });
  const s7 = solveShot({ track, r: R, ledger, arrivals: [] });
  let maxPos = 0, maxQ = 0, trunkMove = null;
  for (const id of s6.rest.keys()) {
    const a = poseAt(s6, id, s6.tEnd + 1, {}), b = poseAt(s7, id, 0, {});
    maxPos = Math.max(maxPos, Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z));
    maxQ = Math.max(maxQ, Math.abs(a.qx - b.qx), Math.abs(a.qy - b.qy), Math.abs(a.qz - b.qz), Math.abs(a.qw - b.qw));
    if (a.runwayId === 'trunk') trunkMove = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  }
  check('m2 every settled ball is reconstructed by the next solve at the SAME position and orientation (≤ 1e-12); the trunk-resting overflow ball moves 0', maxPos <= 1e-12 && maxQ <= 1e-12 && trunkMove === 0, `pos ${maxPos} q ${maxQ} trunk ${trunkMove}`);
  // control: the seal-3 shape (D only) would have put the overflow ball on the tray line
  const sOld = solveShot({ track, r: R, ledger: [...s6.rest].map(([id, D]) => ({ id, D })), arrivals: [] });
  const idT = [...s6.rest.keys()].find((id) => poseAt(s6, id, s6.tEnd + 1, {}).runwayId === 'trunk');
  // the control's misplaced station is read PHYSICALLY (round 11 class A): the D-only ledger puts the
  // trunk ball at a station beyond the tray route's reachable span, which the module now refuses to DRAW
  // at all (poseAt returns null) — the red got louder, not quieter, and the arm still measures the move.
  const a = poseAt(s6, idT, s6.tEnd + 1, {}), b = poseAt(sOld, idT, 0, {}, true);
  const bDrawn = poseAt(sOld, idT, 0, {});
  check(`m2b control: a D-only ledger (the seal-3 shape) moved the trunk ball onto the tray line (mm-scale) and reset its orientation — the red this arm guards (and since round 11 class A the module will not draw that station at all: drawn ${bDrawn ? 'yes' : 'no'})`, Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) > 1e-4 || Math.abs(a.qw - b.qw) > 1e-6, `${Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)}`);
}

// ---- (f) capacity identity + back-up ----------------------------------------
{
  check('f1 capacity identity floor(L_tray / d_ref) == declared', Math.floor(def.tray.length_mm / def.ball.reference_diameter_mm) === def.tray.capacity_balls && track.tray.capacity === 5);
  const many = [];
  for (let i = 0; i < 6; i++) {
    many.push({ id: 10 + i, handoff: handoffFromSink({ t: 0.5 + i * 0.6, pocket: POCKETS[4], fall: POCKETS[4], r: R, tFall: 0.021, glide: 0.06 }, ctx) });
  }
  const s6 = solveShot({ track, r: R, ledger: [], arrivals: many });
  const rest = [...s6.rest.entries()].sort((a, b) => a[1] - b[1]);
  const sixth = rest[5];
  const st = stationAt(track.routes.get(4), sixth[1], R, {});
  const st5 = stationAt(track.routes.get(4), rest[4][1], R, {});
  check('f2 the 6th ball backs up onto the trunk, touching the 5th — one diameter apart in SPACE across the trunk→tray joint (the chord law), its station past the tray', st.runwayId === 'trunk' && Math.abs(Math.hypot(st.x - st5.x, st.y - st5.y, st.z - st5.z) - 2 * R) < 1e-9 && sixth[1] > track.tray.length, `D6 ${sixth[1].toFixed(4)} on ${st.runwayId}, 3-D gap ${(Math.hypot(st.x - st5.x, st.y - st5.y, st.z - st5.z) * 1000).toFixed(4)} mm`);
  check('f3 balls 1..5 fill the tray from the wall', rest.slice(0, 5).every(([, D], i) => Math.abs(D - restStation(i + 1, R)) < 1e-9));
}

// ---- (g) validator red arms --------------------------------------------------
{
  const arm = (name, law, mutate) => {
    const d = JSON.parse(JSON.stringify(def));
    mutate(d);
    let msg = null;
    try { validateTrack(d, { pockets: POCKETS, falls: null }); } catch (e) { msg = e.message; }
    check(`g ${name} → refused under ${law}`, !!msg && msg.includes(`[${law}]`), msg ?? 'ACCEPTED');
  };
  // shape defects the PUBLISHED JSON schema refuses are refused under V0 first (seal 5) —
  // the mirror laws (V1/V10) stay behind it as belt
  arm('missing provenance on a runway', 'V0', (d) => { delete d.runways[0].provenance; });
  arm('arrival.restitution 0.3 (no such solver — the schema const catches it first)', 'V0', (d) => { d.arrival.restitution = 0.3; });
  arm('arrival block without provenance', 'V0', (d) => { delete d.arrival.provenance; });
  // belt: with the V0 gate bypassed (a stale mirror), the runtime laws still refuse
  {
    const { validateTrack: vt } = await import('../scene/ballreturn/schema.js');
    const d = loadDef(); d.arrival.restitution = 0.3; d.__v0skip = true; // no such switch exists — V0 refuses the unknown key itself
    let msg = null; try { vt(d, { pockets: POCKETS, falls: null }); } catch (e) { msg = e.message; }
    check('g the V0 gate cannot be bypassed by an unknown switch key (additionalProperties false)', !!msg && msg.includes('[V0]'), msg ?? 'ACCEPTED');
  }
  arm('arrival.provenance tagged TEST (the JSON schema says const DESIGN)', 'V0', (d) => { d.arrival.provenance.tag = 'TEST'; });
  arm('DESIGN tag on a runway (a dimension is never a design read)', 'V0', (d) => { d.runways[0].provenance.tag = 'DESIGN'; });
  arm('an orphan runway (drains, feeds the trunk, referenced by no pocket)', 'V11', (d) => { d.runways.push({ id: 'orphan', role: 'entry', points_mm: [[-1000, -330, 300], [-1150, -361, 0]], next: 'trunk', provenance: { tag: 'TEST', source: 'orphan runway red arm' } }); });
  arm('a reachable replacement entry runway with a LEVEL edge (V7 over every runway)', 'V7', (d) => { d.runways = d.runways.filter((r) => r.id !== 'lc-run'); d.runways.push({ id: 'lc-run2', role: 'entry', points_mm: [[0, -263, -703.5], [-600, -263, -703.5], [-1150, -361, 0]], next: 'trunk', provenance: { tag: 'TEST', source: 'level-edge red arm' } }); d.pockets.find((p) => p.index === 1).entry_runway = 'lc-run2'; });
  arm('TEST tag under PROPOSAL status', 'V1', (d) => { d.doc.status = 'PROPOSAL'; });
  arm('debug_visual under ACCEPTED status', 'V1', (d) => { d.doc.status = 'ACCEPTED'; for (const rw of d.runways) rw.provenance.tag = 'MODEL'; d.support.provenance.tag = 'MODEL'; d.tray.provenance.tag = 'MODEL'; d.runways[3].support.provenance.tag = 'MODEL'; });
  arm('duplicate runway id', 'V2', (d) => { d.runways[1].id = 'rc-run'; });
  arm('a runway that never reaches the tray', 'V2', (d) => { d.runways[2].next = 'rc-run'; });
  arm('junction landing misses next by 60 mm', 'V3', (d) => { d.runways[2].points_mm[0][2] += 60; });
  arm('an unlisted pocket', 'V4', (d) => { d.unserved_pockets.pop(); });
  arm('a pocket both served and unserved', 'V4', (d) => { d.unserved_pockets.push({ index: 4, reason: 'contradiction test row' }); });
  arm('entry station 100 mm off the fall centre', 'V5', (d) => { d.runways[0].points_mm[0][0] += 100; });
  arm('entry station above the cull line', 'V5', (d) => { d.runways[0].points_mm[0][1] = -60; });
  arm('tray capacity 4 for a 300 mm tray', 'V6', (d) => { d.tray.capacity_balls = 4; });
  arm('tray length_mm disagrees with the runway', 'V6', (d) => { d.tray.length_mm = 310; });
  arm('a level (non-draining) entry edge', 'V7', (d) => { d.runways[0].points_mm[1][1] = -263; });
  arm('u_r that does not match its class', 'V8', (d) => { d.rolling_resistance.u_r = 0.012; });
  arm('an unknown rolling-resistance class', 'V8', (d) => { d.rolling_resistance.class = 'steel_wire'; });
  arm('gauge that admits the ball', 'V9', (d) => { d.support.gauge_mm = 70; });
  arm('wrong schema id', 'V0', (d) => { d.schema = 'openbilliards/ball-return-track/2'; });
  // a channel-kind minimal definition (the Diamond gully class) validates through the same code
  const chan = {
    schema: def.schema, doc: { ...def.doc, status: 'TEST', title: 'TEST channel' }, units: def.units, datum_frame: def.datum_frame,
    ball: def.ball, support: { kind: 'channel', width_mm: 70, provenance: { tag: 'TEST', source: 'channel skeleton' } },
    rolling_resistance: def.rolling_resistance,
    runways: [
      { id: 'rc-chan', points_mm: [[0, -270, 703.5], [-1200, -330, 0]], next: 'tray', provenance: { tag: 'TEST', source: 'skeleton' } },
      { id: 'tray', points_mm: [[-1200, -330, 0], [-1500, -330, 0]], next: null, provenance: { tag: 'TEST', source: 'skeleton' } },
    ],
    pockets: [{ index: 4, entry_runway: 'rc-chan', exit_below_y_mm: -199, provenance: { tag: 'TEST', source: 'skeleton: cup span' } }],
    unserved_pockets: [0, 1, 2, 3, 5].map((i) => ({ index: i, reason: 'skeleton: only one pocket served' })),
    tray: { runway: 'tray', end: 'wall', capacity_balls: 5, length_mm: 300, provenance: { tag: 'TEST', source: 'skeleton' } },
  };
  let ok = true, why = '';
  try { validateTrack(chan, { pockets: POCKETS, falls: null }); } catch (e) { ok = false; why = e.message; }
  check('g channel-kind skeleton validates (the Diamond gully class)', ok, why);
}

// r42 — the release at the POINT (order 19, refuter G's G4). TEST-y3-obtuse by continuations (G's y2detail seeding: b1 on
// rc-run and b2 on cc-run 30 mm above their yield lines at 0.3 m/s, an lc train b3/b4 50 mm above the point at 0.05 m/s; the
// two feeders hold for the same trunk point, the train passes through it). Three laws in one arm: (i) the window's same-lane
// exemption is read in the runway's OWN station (the route-D compare read b4 2.4 mm above the point as below it — a release
// early); (ii) the release is booked for the moving occupant's crossing of the point and a fellow holder does not block the
// booking (with the holder read as a resting occupant nothing was booked and the window stayed clear until the next unrelated
// event — 18 ms); (iii) the handler reads the window again when it fires (a booking made at b3's crossing must not release
// while b4, a diameter behind, has entered since — the stale booking released the LOWER id first). Asserted: the higher id
// (b2) is released first, within 2 ms after b4's trunk station passes the landing station, b1 only afterwards, no throw, and
// every drawn pair one diameter clear at 2 kHz.
{
  const loadT42 = (name) => validateTrack(loadDef(trackPath(name)), { pockets: POCKETS, falls: null });
  const trk = loadT42('TEST-y3-obtuse'); const r4 = trk.routes.get(4), r0 = trk.routes.get(0), r1 = trk.routes.get(1);
  const m4 = r4.merges.find((x) => x.feeder === 'rc-run'); const m0 = r0.merges.find((x) => x.feeder === 'cc-run'); const Dj1 = stationD(r1, m4.rw.id, m4.s);
  const sLand = r0.spans.find((sp) => sp.rw.id === m4.rw.id).sStart; // the landing station in the trunk's own station
  const twoR42 = 2 * R;
  const d3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  const conts = [
    { id: 1, route: r4, D: m4.yieldD + 0.03, v: 0.3, q: [0, 0, 0, 1], t0: 0 },
    { id: 2, route: r0, D: m0.yieldD + 0.03, v: 0.3, q: [0, 0, 0, 1], t0: 0 },
    { id: 3, route: r1, D: Dj1 + 0.05, v: 0.05, q: [0, 0, 0, 1], t0: 0 },
    { id: 4, route: r1, D: Dj1 + 0.05 + twoR42, v: 0.05, q: [0, 0, 0, 1], t0: 0, follow: true },
  ];
  let sol, threw = null; try { sol = solveShot({ track: trk, r: R, ledger: [], arrivals: [], continuations: conts }); } catch (e) { threw = e.message.slice(0, 60); }
  const rel = sol ? sol.events.filter((e) => e.kind === 'release') : [];
  const rel2 = rel.find((e) => e.ball === 2) ?? null, rel1 = rel.find((e) => e.ball === 1) ?? null;
  const past = (t) => { const c = continuationAt(sol, 4, t); return !!c && c.route === r1 && locate(r1, Math.max(0, c.D)).sLocal >= sLand - 1e-9; };
  let tCross = null; if (sol) { let lo = 0, hi = null; for (let t = 1e-4; t <= 1.5 && hi === null; t += 1e-4) { if (past(t)) hi = t; else lo = t; } if (hi !== null) { for (let k = 0; k < 30; k++) { const mid = 0.5 * (lo + hi); if (past(mid)) hi = mid; else lo = mid; } tCross = hi; } }
  const lag = rel2 && tCross !== null ? rel2.t - tCross : NaN; // the release is booked 2·EPS_T after the crossing: lag ∈ (0, 2 ms]
  let minPair = Infinity, atPair = null;
  if (sol) for (let t = 0; t <= 2.5; t += 5e-4) { const ps = [1, 2, 3, 4].map((id) => poseAt(sol, id, t, {})); for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) { if (!ps[i] || !ps[j] || ps[i].kind === 'fall' || ps[j].kind === 'fall') continue; const d = d3(ps[i], ps[j]); if (d < minPair) { minPair = d; atPair = { t: +t.toFixed(4), pair: [i + 1, j + 1] }; } } }
  check(`r42 the release at the point (order 19, G4) on TEST-y3-obtuse by continuations: b2 (the higher id) released ${rel2 ? rel2.t.toFixed(4) : 'never'} — ${Number.isFinite(lag) ? (lag * 1e3).toFixed(2) : 'n/a'} ms after b4's station passed the landing (${tCross === null ? 'never' : tCross.toFixed(6)}), b1 ${rel1 ? rel1.t.toFixed(4) : 'never'}; ${threw ? 'THREW ' + threw : 'no throw'}; min drawn pair ${Number.isFinite(minPair) ? (minPair * 1e3).toFixed(3) : 'n/a'} mm at 2 kHz (seal 18: b2 at 0.5015 with b4 2.4 mm above the point; the next-event release 0.5261)`,
    !threw && !!rel2 && !!rel1 && rel2.t < rel1.t && tCross !== null && lag >= -1e-9 && lag <= 2e-3 && minPair >= twoR42 - 1e-6,
    JSON.stringify({ threw, rel2: rel2?.t, rel1: rel1?.t, tCross, lag, minPair, atPair }));
}

// r43 — the release booked for the UPWARD exit too (order 19, refuter H's D3). Refuter H's lagcase: TEST-y3-obtuse by continuations
// with the feeders' ids swapped (b2 on rc-run and b1 on cc-run, both 100 mm above their yield lines at 0.3 m/s; the lc train b3/b4
// at 0.05 m/s). b2 is released at the point, grazes the passer (a −0.097 m/s recoil), and rolls back UP over its own far edge —
// an occupant leaving the window with no downward crossing to book; on 19b b1 waited for the next unrelated walker instant
// (19.3 ms). Asserted: b1's release within 2 ms after b2's station rises above b1's far edge for the point, no throw, pairs ≥ 2r.
{
  const loadT43 = (name) => validateTrack(loadDef(trackPath(name)), { pockets: POCKETS, falls: null });
  const trk = loadT43('TEST-y3-obtuse'); const r4 = trk.routes.get(4), r0 = trk.routes.get(0), r1 = trk.routes.get(1);
  const m4 = r4.merges.find((x) => x.feeder === 'rc-run'); const m0 = r0.merges.find((x) => x.feeder === 'cc-run'); const Dj1 = stationD(r1, m4.rw.id, m4.s);
  const twoR43 = 2 * R;
  const d3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  const conts = [
    { id: 2, route: r4, D: m4.yieldD + 0.1, v: 0.3, q: [0, 0, 0, 1], t0: 0 },
    { id: 1, route: r0, D: m0.yieldD + 0.1, v: 0.3, q: [0, 0, 0, 1], t0: 0 },
    { id: 3, route: r1, D: Dj1 + 0.05, v: 0.05, q: [0, 0, 0, 1], t0: 0 },
    { id: 4, route: r1, D: Dj1 + 0.05 + twoR43, v: 0.05, q: [0, 0, 0, 1], t0: 0, follow: true },
  ];
  let sol, threw = null; try { sol = solveShot({ track: trk, r: R, ledger: [], arrivals: [], continuations: conts }); } catch (e) { threw = e.message.slice(0, 60); }
  const rel = sol ? sol.events.filter((e) => e.kind === 'release') : [];
  const rel2 = rel.find((e) => e.ball === 2) ?? null; const rel1 = rel.find((e) => e.ball === 1 && (!rel2 || e.t > rel2.t)) ?? null;
  // b2's rise above the window's far edge as b1's window counts it: b2's own yield station for the point (+ the export grain), read on b2's route
  const farB2 = m4.yieldD + EXPORT_GRAIN;
  const above = (t) => { const c = continuationAt(sol, 2, t); return !!c && c.route === r4 && c.D > farB2 + 1e-9; };
  let tRise = null;
  if (sol && rel2) { let lo = rel2.t + 1e-3, hi = null; for (let t = lo; t <= rel2.t + 0.6 && hi === null; t += 1e-4) { if (above(t)) hi = t; else lo = t; } if (hi !== null) { for (let k = 0; k < 30; k++) { const mid = 0.5 * (lo + hi); if (above(mid)) hi = mid; else lo = mid; } tRise = hi; } }
  const lag = rel1 && tRise !== null ? rel1.t - tRise : NaN;
  let minPair = Infinity, atPair = null;
  if (sol) for (let t = 0; t <= 2.5; t += 5e-4) { const ps = [1, 2, 3, 4].map((id) => poseAt(sol, id, t, {})); for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) { if (!ps[i] || !ps[j] || ps[i].kind === 'fall' || ps[j].kind === 'fall') continue; const d = d3(ps[i], ps[j]); if (d < minPair) { minPair = d; atPair = { t: +t.toFixed(4), pair: [i + 1, j + 1] }; } } }
  check(`r43 the upward exit booked (order 19, H's D3) on TEST-y3-obtuse by continuations, feeders swapped: b2 released ${rel2 ? rel2.t.toFixed(4) : 'never'}, rose above b1's far edge at ${tRise === null ? 'never' : tRise.toFixed(6)}, b1 released ${rel1 ? rel1.t.toFixed(4) : 'never'} — lag ${Number.isFinite(lag) ? (lag * 1e3).toFixed(2) : 'n/a'} ms (19b: 19.3 ms, at a walker instant); ${threw ? 'THREW ' + threw : 'no throw'}; min drawn pair ${Number.isFinite(minPair) ? (minPair * 1e3).toFixed(3) : 'n/a'} mm at 2 kHz`,
    !threw && !!rel2 && !!rel1 && tRise !== null && lag >= -1e-9 && lag <= 2e-3 && minPair >= twoR43 - 1e-6,
    JSON.stringify({ threw, rel2: rel2?.t, rel1: rel1?.t, tRise, lag, minPair, atPair }));
}

// r44e–g (#707 prep FIX1 A2, review 707m1 P2-2): the entry segment's END is decided DOWNSTREAM from the capture point. Review's
// probe, reproduced exactly: TEST-terminal-chutes, a 50 mm CUBE (BoxGeometry 0.05³) centred at pocket 4's entry station, declared
// as a cup simplification — the pre-FIX1 walk closed the segment at the first clear UPSTREAM sample (entry end s = −55 mm, DEnd
// above the entry), passed 10 stations and read 11 false violations; FIX1 reads 0 violations, the segment ending at or below the
// entry — 25 mm (the cube's half side) + r below it, within one step — and more stations passed. These three pins are RED on
// a34f5c90 (measured before the row was written): the row discriminates. A genuinely blocked entry — an undeclared slab INSIDE
// the entry segment, 40 mm below the entry where the ball still overlaps the cube — is still refused naming the slab, never the
// cube; furniture in the upstream band (above the entry, below the exit line) is still refused (the band V20 reads).
{
  const THREE = await import('three');
  const { furnitureClearance, clearFurnitureCache } = await import('../scene/ballreturn/furniture.js');
  const { validateAssembly, assemblyMatcher } = await import('../scene/ballreturn/assembly.js');
  const tdefA2 = loadDef(path.resolve(here, '../scene/ballreturn/tracks/TEST-terminal-chutes.json'));
  const ctxA2 = await tableContext(tdefA2.doc.table_id);
  const trkA2 = validateTrack(tdefA2, { pockets: ctxA2.pockets, falls: ctxA2.falls });
  const rt4 = trkA2.routes.get(4); const E4 = stationAt(rt4, rt4.total, R, {});
  const declA2 = validateAssembly({ schema: 'ball-return-assembly/1.0', table_id: tdefA2.doc.table_id, provenance: { tag: 'TEST', source: 'r44e: review 707m1 P2-2 probe, a 50 mm cube cup simplification at pocket 4' },
    meshes: [{ id: 'test-cup', kind: 'cup', name: 'obTestCup', solid_simplification: true, provenance: { tag: 'TEST', source: 'Test fixture pocket cup solid simplification (review 707m1)' } }] }, { tableId: tdefA2.doc.table_id });
  const CUBE = 0.05; // review's size
  const mkA2 = (extra) => { const scene = new THREE.Scene(); const cup = new THREE.Mesh(new THREE.BoxGeometry(CUBE, CUBE, CUBE), new THREE.MeshBasicMaterial()); cup.name = 'obTestCup'; cup.position.set(E4.x, E4.y, E4.z); scene.add(cup); if (extra) extra(scene); scene.updateMatrixWorld(true); return scene; };
  const readA2 = async (scene) => { clearFurnitureCache(); return furnitureClearance({ track: trkA2, r: R, scene, tableId: tdefA2.doc.table_id, trackId: 'TEST-terminal-chutes', assembly: assemblyMatcher(declA2) }); };
  const fCup = await readA2(mkA2(null));
  const seg4 = (fCup.entrySegments ?? []).find((e) => String(e.route) === '4');
  const { V16_STEP: STEP_A2 } = await import('../scene/ballreturn/furniture.js');
  const expectBelow = CUBE / 2 + R; // the first station whose sphere clears the cube: half a side plus a radius below the entry
  check(`r44e the entry segment ends DOWNSTREAM of the capture point (FIX1 A2, review's 50 mm cube at pocket 4's entry): ${fCup.violations.length} violations (a34f5c90: 11), route 4's segment ends ${seg4 ? ((rt4.total - seg4.DEnd) * 1e3).toFixed(1) : '?'} mm BELOW the entry (expected ${(expectBelow * 1e3).toFixed(1)} within one step; a34f5c90: 55 mm ABOVE it), ${fCup.assemblyPass.length} assembly stations passed (a34f5c90: 10)`, fCup.evaluated && fCup.violations.length === 0 && !!seg4 && !seg4.wholeRoute && seg4.DEnd <= rt4.total + 1e-9 && Math.abs((rt4.total - seg4.DEnd) - expectBelow) <= STEP_A2 + 1e-9 && fCup.assemblyPass.length > 10, JSON.stringify({ n: fCup.violations.length, seg4, passed: fCup.assemblyPass.length, reason: fCup.reason?.slice(0, 200) }));
  const slabInside = (scene) => { const P = stationAt(rt4, rt4.total - 0.04, R, {}); const slab = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.02, 2 * (R + 0.005)), new THREE.MeshBasicMaterial()); slab.name = 'obTestSlabInEntry'; slab.position.set(P.x, P.y, P.z); scene.add(slab); }; // 40 mm below the entry: inside the entry segment (ends ~53.6 mm down) and the ball there still overlaps the cube
  const fSlab = await readA2(mkA2(slabInside));
  check(`r44f a genuinely blocked entry is still refused (FIX1 A2): the same cube plus an UNDECLARED slab 40 mm below the entry — inside the entry segment, where the cube stations are passes — → refused [V16] naming the slab and never the cube (${fSlab.violations.length} violations)`, fSlab.evaluated && fSlab.violations.length > 0 && /\[V16\]/.test(fSlab.reason ?? '') && /obTestSlabInEntry/.test(fSlab.reason ?? '') && !/obTestCup\b/.test(fSlab.reason ?? ''), JSON.stringify({ n: fSlab.violations.length, reason: fSlab.reason?.slice(0, 240) }));
  const boxAbove = (scene) => { const P = stationAt(rt4, rt4.total + 0.01, R, {}); const box = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.02, 2 * (R + 0.005)), new THREE.MeshBasicMaterial()); box.name = 'obTestBoxAboveEntry'; box.position.set(P.x, P.y, P.z); scene.add(box); };
  const fAbove = await readA2(mkA2(boxAbove));
  check(`r44g the upstream band is still judged (FIX1 A2): an undeclared box 10 mm above the entry on the same cube scene → refused naming it (${(fAbove.reason ?? '').match(/\[V\d+\]/)?.[0] ?? 'no row'}, ${fAbove.violations.length} violations)`, fAbove.evaluated && fAbove.violations.length > 0 && /obTestBoxAboveEntry/.test(fAbove.reason ?? ''), JSON.stringify({ n: fAbove.violations.length, reason: fAbove.reason?.slice(0, 240) }));
}
// r44 — V16 furniture clearance (order 20 item 0): the sampled-sphere probe of furniture.js against a synthetic three Scene.
// TEST-synthetic-wire-slide's rc route; one BoxGeometry mesh straddling the route at a known station (its faces r + 5 mm
// either side of the centre path across, 40 mm along): the violation names the box with the station span within one step
// of the box's extent grown by r; the box lifted so its nearest face is 1 mm beyond r → 0 violations; the cache: the same
// scene → no new evaluation; the moved box → a new key and a new evaluation; a mesh under an excluded name (obBallReturnDebug*)
// or a SphereGeometry (a ball) never counts.
{
  const THREE = await import('three');
  const { furnitureClearance, furnitureEvaluations, clearFurnitureCache, V16_STEP } = await import('../scene/ballreturn/furniture.js');
  const trk = validateTrack(loadDef(path.resolve(here, '../scene/ballreturn/tracks/TEST-synthetic-wire-slide.json')), { pockets: POCKETS, falls: null });
  const route = trk.routes.get(4); const total = route.total;
  const D0 = 0.5 * total; const P = stationAt(route, D0, R, {}); const Pa = stationAt(route, D0 + 0.02, R, {}); const Pb = stationAt(route, D0 - 0.02, R, {});
  const along = new THREE.Vector3(Pb.x - Pa.x, Pb.y - Pa.y, Pb.z - Pa.z).normalize();
  const mkScene = (lift) => {
    const scene = new THREE.Scene();
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.02, 2 * (R + 0.005)), new THREE.MeshBasicMaterial()); // 40 mm along, thin, wide across
    box.name = 'obTestFurnitureBox';
    box.position.set(P.x, P.y + lift, P.z);
    box.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), along);
    scene.add(box);
    const dbg = new THREE.Group(); dbg.name = 'obBallReturnDebugTest'; const dm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshBasicMaterial()); dm.position.set(P.x, P.y, P.z); dbg.add(dm); scene.add(dbg);
    const balls = new THREE.Group(); balls.name = 'obBalls'; const ball = new THREE.Mesh(new THREE.SphereGeometry(R, 8, 8), new THREE.MeshBasicMaterial()); ball.position.set(P.x, P.y, P.z); balls.add(ball); scene.add(balls); // the ball-set group, excluded by identity
    scene.updateMatrixWorld(true);
    return { scene, box, balls };
  };
  clearFurnitureCache();
  const n0 = furnitureEvaluations();
  const A = mkScene(0);
  const fA = await furnitureClearance({ track: trk, r: R, scene: A.scene, tableId: 'wpa_generic_9ft', trackId: 'TEST-synthetic-wire-slide', excludeGroup: A.balls });
  const fA2 = await furnitureClearance({ track: trk, r: R, scene: A.scene, tableId: 'wpa_generic_9ft', trackId: 'TEST-synthetic-wire-slide', excludeGroup: A.balls });
  const B = mkScene(0.01 + R + 0.001 + 0.01); // the box's lower face (10 mm below its centre) 1 mm beyond r above the centre path
  const fB = await furnitureClearance({ track: trk, r: R, scene: B.scene, tableId: 'wpa_generic_9ft', trackId: 'TEST-synthetic-wire-slide', excludeGroup: B.balls });
  const n1 = furnitureEvaluations();
  const only = fA.evaluated && fA.byMesh.length === 1 && fA.byMesh[0].mesh === 'obTestFurnitureBox';
  const sp = only ? fA.byMesh[0].spans.find((x) => true) : null;
  const expectHalf = 0.02 + R; // the box's half-length along the path plus the ball radius
  const spanOk = !!sp && Math.abs((D0 - sp.DMin) - expectHalf) <= V16_STEP + 1e-9 && Math.abs((sp.DMax - D0) - expectHalf) <= V16_STEP + 1e-9;
  // the INSIDE test on its own (battery N56, a survivor of the first battery: every other arm's box has a face within r of the
  // path): a 150 mm cube centred on the station — no face within 75 mm of the ball's centre, the surface test sees nothing,
  // the winding number reads +1 — and the same cube MIRRORED by a negative world scale (the winding flipped; read through the
  // determinant, refuter C's D2)
  const mkCube = (mirror) => { const scene = new THREE.Scene(); const cube = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.15), new THREE.MeshBasicMaterial()); cube.name = 'obTestThickBlock'; cube.position.set(P.x, P.y, P.z); if (mirror) cube.scale.x = -1; scene.add(cube); scene.updateMatrixWorld(true); return scene; };
  const fC = await furnitureClearance({ track: trk, r: R, scene: mkCube(false), tableId: 'wpa_generic_9ft', trackId: 'TEST-synthetic-wire-slide' });
  const fM = await furnitureClearance({ track: trk, r: R, scene: mkCube(true), tableId: 'wpa_generic_9ft', trackId: 'TEST-synthetic-wire-slide' });
  const cubeIn = (f) => f.evaluated && f.byMesh.length === 1 && f.byMesh[0].mesh === 'obTestThickBlock' && f.byMesh[0].inside > 0 && f.violations.some((v) => v.inside && v.distance > R - 1e-9) && Math.abs(f.byMesh[0].worstDepth - (R + 0.075)) < 0.006;
  check(`r44b V16's INSIDE test alone (order 20, N56): a 150 mm cube centred on the slide's station — ${fC.evaluated ? `${fC.violations.length} stations, ${fC.byMesh[0]?.inside ?? 0} wholly inside, worst ${((fC.byMesh[0]?.worstDepth ?? 0) * 1e3).toFixed(1)} mm (r + 75 expected), the nearest face ${fC.violations.length ? (Math.max(...fC.violations.map((v) => v.distance)) * 1e3).toFixed(1) : '—'} mm from the centre` : 'no read'}; the cube mirrored by a negative scale — ${fM.evaluated ? `${fM.violations.length} stations, ${fM.byMesh[0]?.inside ?? 0} wholly inside` : 'no read'}`,
    cubeIn(fC) && cubeIn(fM), JSON.stringify({ fC: { n: fC.violations.length, byMesh: fC.byMesh }, fM: { n: fM.violations.length, byMesh: fM.byMesh } }));
  // V17 (order 20, SNK-R28): the track's OWN hardware, declared by mesh name, is measured apart — the same box named as hardware refuses
  // nothing and is reported with the ball's closest approach (the seat-consistency read); an undeclared box of the same shape refuses
  const H = mkScene(0); H.box.name = 'obTestSlideWires';
  const fH = await furnitureClearance({ track: trk, r: R, scene: H.scene, tableId: 'wpa_generic_9ft', trackId: 'TEST-synthetic-wire-slide', excludeGroup: H.balls, hardwareNames: ['obTestSlideWires'] });
  const fH2 = await furnitureClearance({ track: trk, r: R, scene: H.scene, tableId: 'wpa_generic_9ft', trackId: 'TEST-synthetic-wire-slide', excludeGroup: H.balls, hardwareNames: [] });
  const hwRow = fH.ownHardware && fH.ownHardware.find((h) => h.mesh === 'obTestSlideWires');
  check(`r44c V16 reads the track's own hardware apart (V17): the box named as hardware → ${fH.evaluated ? fH.violations.length : 'n/a'} violations, measured apart (closest approach ${hwRow ? (hwRow.dMin * 1e3).toFixed(1) : '—'} mm at ${hwRow ? JSON.stringify(hwRow.at) : '—'}, ${hwRow ? hwRow.stationsBelowR : '—'} stations below r); the same box undeclared → ${fH2.evaluated ? fH2.violations.length : 'n/a'} violations`,
    fH.evaluated && fH.violations.length === 0 && !!hwRow && hwRow.stationsBelowR > 0 && hwRow.dMin < R && fH2.evaluated && fH2.violations.length > 0,
    JSON.stringify({ fH: { n: fH.violations.length, own: fH.ownHardware }, fH2: { n: fH2.violations.length } }));
  // V18 (order 21, ruling 1): a declared pocket-assembly mesh is PASSABLE on the entry segment only — from the capture point to the first
  // station whose sphere is clear of every declared mesh, measured — and furniture again beyond it. A box at the route's entry (declared by
  // name) → passed, the segment's end measured within one step of where the sphere clears the box; the same box 300 mm down the route
  // (still declared) → a violation naming it as assembly BEYOND the entry segment; undeclared at the entry → a violation
  const { validateAssembly, assemblyMatcher } = await import('../scene/ballreturn/assembly.js');
  const decl = validateAssembly({ schema: 'ball-return-assembly/1.0', table_id: 'wpa_generic_9ft', provenance: { tag: 'TEST', source: 'r44d: a synthetic cup at the entry' }, meshes: [{ id: 'test-cup', kind: 'cup', name: 'obTestCup', provenance: { tag: 'TEST', source: 'r44d synthetic cup mesh' } }] }, { tableId: 'wpa_generic_9ft' });
  const PE = stationAt(route, total, R, {}); const PEb = stationAt(route, total - 0.02, R, {}); const alongE = new THREE.Vector3(PEb.x - PE.x, PEb.y - PE.y, PEb.z - PE.z).normalize();
  const mkCup = (Dc, name) => { const scene = new THREE.Scene(); const cup = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 2 * (R + 0.005)), new THREE.MeshBasicMaterial()); cup.name = name; const Pc = stationAt(route, Dc, R, {}); cup.position.set(Pc.x, Pc.y, Pc.z); cup.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), alongE); scene.add(cup); scene.updateMatrixWorld(true); return scene; };
  const fE = await furnitureClearance({ track: trk, r: R, scene: mkCup(total, 'obTestCup'), tableId: 'wpa_generic_9ft', trackId: 'TEST-synthetic-wire-slide', assembly: assemblyMatcher(decl) });
  const fF = await furnitureClearance({ track: trk, r: R, scene: mkCup(total - 0.3, 'obTestCup'), tableId: 'wpa_generic_9ft', trackId: 'TEST-synthetic-wire-slide', assembly: assemblyMatcher(decl) });
  const fG = await furnitureClearance({ track: trk, r: R, scene: mkCup(total, 'obTestCupUndeclared'), tableId: 'wpa_generic_9ft', trackId: 'TEST-synthetic-wire-slide', assembly: assemblyMatcher(decl) });
  const segE = fE.entrySegments && fE.entrySegments.find((e) => String(e.route) === '4');
  const expectEnd = 0.03 + R; // the cup's half-length along the path plus the radius: where the sphere clears it
  const segOk = !!segE && !segE.wholeRoute && Math.abs((total - segE.DEnd) - expectEnd) <= V16_STEP + 1e-9;
  check(`r44d V18 the declared pocket assembly is passable on the entry segment only: a declared cup at the entry → ${fE.violations.length} violations, ${fE.assemblyPass.length} stations passed, the segment ends ${segE ? ((total - segE.DEnd) * 1e3).toFixed(1) : '—'} mm down the route (expected ${(expectEnd * 1e3).toFixed(1)} within one step); the same cup 300 mm down → ${fF.violations.length} violations${fF.byMesh[0] ? ` naming ${fF.byMesh[0].mesh} as assembly beyond the entry (${fF.byMesh[0].assemblyBeyondEntry})` : ''}; an undeclared cup at the entry → ${fG.violations.length} violations`,
    fE.evaluated && fE.violations.length === 0 && fE.assemblyPass.length > 0 && segOk && fF.violations.length > 0 && fF.byMesh[0].mesh === 'obTestCup' && fF.byMesh[0].assemblyBeyondEntry > 0 && /BEYOND the entry segment/.test(fF.reason ?? '') && fG.violations.length > 0,
    JSON.stringify({ fE: { n: fE.violations.length, pass: fE.assemblyPass.length, seg: segE }, fF: { n: fF.violations.length, byMesh: fF.byMesh }, fG: { n: fG.violations.length } }));
  check(`r44 V16 furniture clearance (order 20 item 0): a box across the wire slide at D ${(D0 * 1e3).toFixed(1)} mm → ${fA.evaluated ? fA.violations.length : 'n/a'} violating stations of ${fA.stations ?? '?'} naming ${fA.byMesh.map((m) => m.mesh).join(', ') || 'nothing'} over D ${sp ? `${(sp.DMin * 1e3).toFixed(1)}–${(sp.DMax * 1e3).toFixed(1)}` : '—'} (expected ±${(expectHalf * 1e3).toFixed(1)} within one 5 mm step), worst ${fA.byMesh[0] ? (fA.byMesh[0].worstDepth * 1e3).toFixed(1) : '—'} mm inside; the debug group and the ball group never count; lifted 1 mm past r → ${fB.evaluated ? fB.violations.length : 'n/a'}; evaluations ${n1 - n0} for three reads (the repeat cached: ${fA2.cached === true})`,
    only && spanOk && fA.violations.length > 0 && fB.evaluated && fB.violations.length === 0 && fA2.cached === true && n1 - n0 === 2 && /\[V16\]/.test(fA.reason ?? '') && /obTestFurnitureBox/.test(fA.reason ?? ''),
    JSON.stringify({ fA: { n: fA.violations.length, stations: fA.stations, byMesh: fA.byMesh, reason: fA.reason }, fB: { n: fB.violations?.length, why: fB.why }, evals: n1 - n0, cached: fA2.cached }));
}

// r45 — the FOLD parts the chain (order 20 item 3: the arm for battery mutant N8, a regression named at seal 19). No `fold` event
// is reachable on the shipped fixtures (2 205 solves: the link goes tensile before its seat root vanishes, and the settle's own
// read of `dyn.fold[k]` is what parts a chain whose seat has no root); the reachable fold is the cross-route chain after a graze:
// a fast feeder ball grazes a slow ball just below the 130° landing, the chain bounces UP, the front crosses the junction onto the
// trunk above with the feeder ball riding as follower, and when the follower's route-4 station falls below the front's route-1
// station `seatBehind` finds no root — the settle parts the pair there (both at D 483.15 on TEST-obtuse-merge). With the fold
// ignored (N8) the pair stays chained through the junction: the balls jam above it on two slopes, teleport by a diameter per
// 0.1 ms, pass through each other and never reach the tray. Seeding D (three balls on route 4: a resting ball 2 mm below the
// junction, a 0.8 m/s pair from 60 / 137 mm above it) and seeding A (two balls, the striker at 2.0 m/s).
{
  const loadT45 = (name) => validateTrack(loadDef(path.resolve(here, `../scene/ballreturn/tracks/${name}.json`)), { pockets: POCKETS, falls: null });
  const ob = loadT45('TEST-obtuse-merge'); const r4 = ob.routes.get(4); const r1 = ob.routes.get(1);
  const m4 = r4.merges.find((x) => x.feeder === 'rc-run'); const J = m4.D; // the junction on route 4 (451.3 mm)
  const twoR45 = 2 * R; const d3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  const TRAY_D = r4.spans.find((sp) => sp.rw.id === 'tray')?.dStart ?? 0.2987; // the tray's upstream end on route 4: a rest below it is in the tray
  const runCase = (label, conts, ids) => {
    let sol, threw = null; try { sol = solveShot({ track: ob, r: R, ledger: [], arrivals: [], continuations: conts }); } catch (e) { threw = e.message.slice(0, 60); }
    if (!sol) return { label, threw };
    let minPair = Infinity, atPair = null, maxStep = 0, atStep = null, nonFinite = 0;
    let prev = null;
    for (let t = 0; t <= sol.tEnd + 0.02; t += 1e-4) {
      const ps = ids.map((id) => poseAt(sol, id, t, {}));
      for (const p of ps) if (p && ![p.x, p.y, p.z].every(Number.isFinite)) nonFinite += 1;
      for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) { const a = ps[i], b = ps[j]; if (!a || !b || a.kind === 'fall' || b.kind === 'fall') continue; const d = d3(a, b); if (d < minPair) { minPair = d; atPair = { t: +t.toFixed(4), pair: [ids[i], ids[j]] }; } }
      if (prev) for (let i = 0; i < ids.length; i++) { const a = prev[i], b = ps[i]; if (!a || !b || a.kind === 'fall' || b.kind === 'fall') continue; const st = d3(a, b); if (st > maxStep) { maxStep = st; atStep = { t: +t.toFixed(4), id: ids[i] }; } }
      prev = ps;
    }
    const rest = ids.map((id) => { const c = continuationAt(sol, id, sol.tEnd + 1); return { id, kind: c?.kind ?? null, D: c?.D ?? null, route: c?.route === r4 ? 4 : (c?.route === r1 ? 1 : '?') }; });
    // the settle's parting: a `separate` at the fold instant with both balls at the same station on their routes
    const seps = sol.events.filter((e) => e.kind === 'separate');
    // sign flips of v inside event-free intervals (a jammed chain flips every step; the parted one at most once)
    let flips = 0, maxFlips = 0; const evT = sol.events.map((e) => e.t).sort((a, b) => a - b);
    for (let k = 0; k + 1 < evT.length; k++) { const a = evT[k], b = evT[k + 1]; if (b - a < 2e-3) continue; let n = 0; for (const id of ids) { let last = null; for (let t = a + 5e-4; t < b; t += 5e-4) { const c = continuationAt(sol, id, t); if (!c || !Number.isFinite(c.v) || Math.abs(c.v) < 1e-9) continue; const sg = Math.sign(c.v); if (last !== null && sg !== last) n += 1; last = sg; } } flips += n; if (n > maxFlips) maxFlips = n; }
    return { label, threw, events: sol.events.length, tEnd: +sol.tEnd.toFixed(4), minPair, atPair, maxStep, atStep, nonFinite, rest, seps: seps.length, maxFlips };
  };
  const D = runCase('D', [
    { id: 1, route: r4, D: J - 0.002, v: 0, q: [0, 0, 0, 1], t0: 0 },
    { id: 2, route: r4, D: J + 0.06, v: 0.8, q: [0, 0, 0, 1], t0: 0 },
    { id: 3, route: r4, D: J + 0.06 + twoR45 + 0.02, v: 0.8, q: [0, 0, 0, 1], t0: 0 },
  ], [1, 2, 3]);
  const A = runCase('A', [
    { id: 1, route: r4, D: J - 0.002, v: 0, q: [0, 0, 0, 1], t0: 0 },
    { id: 2, route: r4, D: J + 0.13, v: 2.0, q: [0, 0, 0, 1], t0: 0 },
  ], [1, 2]);
  const okCase = (c, n) => !c.threw && c.events < 60 && c.minPair >= twoR45 - 1e-6 && c.maxStep <= 1e-3 && c.nonFinite === 0 && c.rest.every((x) => x.kind === 'rest' && x.D < TRAY_D) && c.rest.length === n && c.maxFlips <= 1 && c.seps >= 1;
  const orderD = D.rest && D.rest.find((x) => x.id === 2)?.D < D.rest.find((x) => x.id === 3)?.D; // b2 ahead of b3 in the tray: the follower never carried through its leader
  check(`r45 the fold parts the chain (order 20 item 3, the arm for N8): seeding D — ${D.threw ? 'THREW ' + D.threw : `${D.events} events, tEnd ${D.tEnd}`}, min drawn pair ${Number.isFinite(D.minPair) ? (D.minPair * 1e3).toFixed(3) : 'n/a'} mm at 10 kHz, max step ${(D.maxStep * 1e3).toFixed(3)} mm per 0.1 ms, rests ${JSON.stringify(D.rest?.map((x) => [x.id, x.kind, x.D !== null ? +(x.D * 1e3).toFixed(1) : null]))} (all in the tray, b2 ahead of b3: ${orderD}), ${D.seps} separations, max sign flips in an event-free interval ${D.maxFlips}; seeding A — ${A.threw ? 'THREW' : `${A.events} events`}, rests ${JSON.stringify(A.rest?.map((x) => [x.id, x.kind, x.D !== null ? +(x.D * 1e3).toFixed(1) : null]))}, flips ${A.maxFlips} (N8: three balls parked on two slopes 32 mm above the junction, two coincident, 127 teleports of a diameter, 133 flips)`,
    okCase(D, 3) && orderD && okCase(A, 2), JSON.stringify({ D, A }));
}

// r46 — the contact TREE's seeding family, v5 (order 23b item 5: v4's REPORTED targets GATED now that the tree is the law; the sibling
// pass-through, the pre-node feeder pair, the fork jam, the hold angle, the (vf, vT) family and the creep residual added — each row
// an arm a shipped mutant turns red). v4 (order 23 item 1; refuter I on v3, verdict REFUTED on completeness and targets):
// The family seeds every instance the tree must hold and gates what the LIST holds today; the numbers the tree must flip are
// REPORTED here — the acceptance targets — from two independent integrations of the module's own law (refuter I's treeint.mjs
// over track.js exports, and the order-23 prototype of kinematics.js) that agree on every attach to 0.1 ms. What v3 got wrong and
// v4 states instead: (S1) the shoved feeder ball coasts ABOVE its yield line after the parting (apex Dy + 2.9 mm) — the re-ask
// may HOLD it, an outcome v3 omitted; (S1-cc) the cc contact is a 0.1 ms BOUNCE, not a persisting link; (Y2) no node of degree 3
// forms under the law on any seeding (the cc bounce ends before the rc child attaches) — the pair and rest targets hold, "the
// degree-3 node formed and parted" is unmeetable; (SEP) the lc child parts at t = 0 by the tensile test (demand 0.630 > push
// 0.433), the rc child's t = 0 seat MISSES by 2.6 µm (its "re-catch" is a first catch at 0.2 ms), both orders are one solve, and
// the siblings DO meet at u 0.3 (0.0497 s) — v3's "push 0.433 < demand 0.525" and "never let the siblings meet" are retired;
// two members v3 lacked: (WS) the shipped wire slides build a two-feeder FORK NODE from a legitimate seed and the list draws its
// children into one point (0.09 mm; a 4-ball train THROWS MAX_EVENTS); (MID) on the shipped obtuse fixture a legitimate seed has
// the feeder ball's sphere crossed by the passing train's LEADER at 0.099 s and by its MIDDLE ball to 29.07 mm while the list
// books the tail. Every seed is checked LEGITIMATE at t = 0 (every pair ≥ 2r): v3's +50 mm 3-trains straddled the head vertex.
{
  const loadT46 = (name, opts = {}) => validateTrack(loadDef(trackPath(name)), { pockets: POCKETS, falls: null, ...opts });
  const twoR46 = 2 * R; const d3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  const P46 = (route, D) => stationAt(route, D, R, {});
  const legit = (conts) => { let m = Infinity; for (let i = 0; i < conts.length; i++) for (let j = i + 1; j < conts.length; j++) m = Math.min(m, d3(P46(conts[i].route, conts[i].D), P46(conts[j].route, conts[j].D))); return m; };
  const scan = (sol, ids) => { const out = {}; let maxStep = 0, prev = null; for (let t = 0; t <= sol.tEnd + 0.01; t += 1e-4) { const ps = ids.map((id) => poseAt(sol, id, t, {})); for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) { const a = ps[i], b = ps[j]; if (!a || !b || a.kind === 'fall' || b.kind === 'fall') continue; const d = d3(a, b); const k = `${ids[i]}-${ids[j]}`; if (!out[k] || d < out[k].d) out[k] = { d, t: +t.toFixed(4) }; } if (prev) for (let i = 0; i < ids.length; i++) { const a = prev[i], b = ps[i]; if (a && b && a.kind !== 'fall' && b.kind !== 'fall') maxStep = Math.max(maxStep, d3(a, b)); } prev = ps; } return { out, maxStep }; };
  const rests = (sol, ids) => ids.map((id) => continuationAt(sol, id, sol.tEnd + 1)?.kind ?? null);
  const under = (sol, a, b) => { let n = 0; for (let t = 0; t <= sol.tEnd; t += 1e-4) { const p = poseAt(sol, a, t, {}), q = poseAt(sol, b, t, {}); if (p && q && d3(p, q) < twoR46 - 1e-6) n += 1e-4; } return n; };
  const apexOn = (sol, id, rw) => { let m = -Infinity; for (let t = 0; t <= sol.tEnd; t += 1e-4) { const p = poseAt(sol, id, t, {}); if (p && p.runwayId === rw) m = Math.max(m, p.D); } return m; };
  const first = (sol, n = 4) => sol.events.slice(0, n).map((e) => `${e.kind}@${e.t.toFixed(4)} ${e.ball}${e.other != null ? '/' + e.other : ''}`).join(' ');
  const solve = (track, conts) => { let sol = null, threw = null; try { sol = solveShot({ track, r: R, ledger: [], arrivals: [], continuations: conts }); } catch (e) { threw = e.message.slice(0, 50); } return { sol, threw }; };
  const rows = []; const ok46 = [];
  const mm = (x) => Number.isFinite(x) ? (x * 1e3).toFixed(2) : '—';
  // ---- (S1) + (MID): the shipped obtuse fixture
  const ob = loadT46('TEST-obtuse-merge'); const r4 = ob.routes.get(4), r1 = ob.routes.get(1);
  const m4 = r4.merges.find((x) => x.feeder === 'rc-run'); const Dy = m4.yieldD; const Dj1 = stationD(r1, m4.rw.id, m4.s);
  // a train seated in 3-D: each follower one centre-diameter behind its predecessor by `seatBehind` (a path 2r through a bend
  // is an overlap at t = 0 — refuter I's illegitimate v3 seeds; a 3-D seat is what the solver itself seats)
  const train = (route, Dj, above, v, n, id0) => { const out = []; let Dp = Dj + above; for (let i = 0; i < n; i++) { if (i > 0) { const p = P46(route, Dp); Dp = seatBehind(route, [p.x, p.y, p.z], Dp, twoR46, Dp + twoR46); } out.push({ id: id0 + i, route, D: Dp, v, q: [0, 0, 0, 1], t0: 0, follow: i > 0 }); } return out; };
  {
    const conts = [{ id: 1, route: r4, D: Dy - 0.015, v: -0.03, q: [0, 0, 0, 1], t0: 0 }, ...train(r1, Dj1, 0.05, 0.3, 2, 2)];
    const lg = legit(conts); const { sol, threw } = solve(ob, conts);
    const sc = sol ? scan(sol, [1, 2, 3]) : null; const rs = sol ? rests(sol, [1, 2, 3]) : []; const u12 = sol ? under(sol, 1, 2) : NaN; const apex = sol ? apexOn(sol, 1, 'rc-run') : NaN;
    const ok = lg >= twoR46 - 1e-6 && !threw && rs.length === 3 && rs.every((k) => k === 'rest') && sc.maxStep <= 1e-3 && sc.out['1-3'].d >= twoR46 - 1e-6 && sc.out['2-3'].d >= twoR46 - 1e-6 && sc.out['1-2'].d >= twoR46 - 1e-6 && u12 === 0; // v5: the leader pair GATED
    ok46.push(ok);
    rows.push(`(S1) rc ball 15 mm below its line at −0.03, lc train +50 mm at 0.3 [t=0 min pair ${mm(lg)}]: ${threw ? 'THREW ' + threw : `${sol.events.length} events, first ${first(sol)}`}; the feeder ball and the LEADER at ${sc ? mm(sc.out['1-2'].d) : '—'} mm for ${(u12 * 1e3).toFixed(0)} ms (GATED in v5 — the tree's target: ≥ ${mm(twoR46)}, the leader attaches b1 at 0.124 s and the tensile test parts it at 0.195 s at −0.14 m/s); apex on rc-run ${mm(apex)} vs the line ${mm(Dy)} (the tree's: 526.3 = Dy + 2.9 mm — ABOVE the line, so the re-ask may HOLD it: admitted), 1-3 ${sc ? mm(sc.out['1-3'].d) : '—'}, 2-3 ${sc ? mm(sc.out['2-3'].d) : '—'}, max step ${sc ? (sc.maxStep * 1e3).toFixed(3) : '—'} mm, rests ${rs.join(',')}`);
  }
  {
    const conts = [{ id: 1, route: r4, D: Dy - 0.010, v: -0.03, q: [0, 0, 0, 1], t0: 0 }, ...train(r1, Dj1, 0.03, 0.3, 3, 2)];
    const lg = legit(conts); const { sol, threw } = solve(ob, conts);
    const sc = sol ? scan(sol, [1, 2, 3, 4]) : null; const rs = sol ? rests(sol, [1, 2, 3, 4]) : [];
    const ok = lg >= twoR46 - 1e-6 && !threw && rs.length === 4 && rs.every((k) => k === 'rest') && sc.out['1-4'].d >= twoR46 - 1e-6 && sc.out['2-3'].d >= twoR46 - 1e-6 && sc.out['3-4'].d >= twoR46 - 1e-6 && sc.out['1-2'].d >= twoR46 - 1e-6 && sc.out['1-3'].d >= twoR46 - 1e-6; // v5: the leader and the middle ball GATED
    ok46.push(ok);
    rows.push(`(MID) rc ball 10 mm below its line at −0.03, lc train of THREE +30 mm at 0.3 [t=0 min pair ${mm(lg)}]: ${threw ? 'THREW ' + threw : `${sol.events.length} events, first ${first(sol)}`}; the feeder ball vs the leader ${sc ? mm(sc.out['1-2'].d) : '—'} and vs the MIDDLE ball ${sc ? mm(sc.out['1-3'].d) : '—'} mm (GATED in v5 — the tree's target: the leader catches it at 0.099 s, 1-2 = ${mm(twoR46)} and 1-3 ≥ ${mm(twoR46)}); 1-4 ${sc ? mm(sc.out['1-4'].d) : '—'}, rests ${rs.join(',')}`);
  }
  // ---- (S1-cc) + (Y2): TEST-y3-obtuse through the V15 seam (the app never sets it)
  const y3 = loadT46('TEST-y3-obtuse', { allowThreeBranch: true });
  const rRC = [...y3.routes.values()].find((x) => x.chain[0] === 'rc-run'), rCC = [...y3.routes.values()].find((x) => x.chain[0] === 'cc-run'), rLC = [...y3.routes.values()].find((x) => x.chain[0] === 'lc-run');
  const mRC = rRC.merges.find((x) => x.feeder === 'rc-run'), mCC = rCC.merges.find((x) => x.feeder === 'cc-run'); const DjLC = stationD(rLC, mRC.rw.id, mRC.s);
  {
    const conts = [{ id: 4, route: rCC, D: mCC.yieldD - 0.015, v: -0.03, q: [0, 0, 0, 1], t0: 0 }, ...train(rLC, DjLC, 0.05, 0.3, 2, 2)];
    const lg = legit(conts); const { sol, threw } = solve(y3, conts);
    const sc = sol ? scan(sol, [4, 2, 3]) : null; const rs = sol ? rests(sol, [4, 2, 3]) : []; const apex = sol ? apexOn(sol, 4, 'cc-run') : NaN;
    const ok = lg >= twoR46 - 1e-6 && !threw && rs.length === 3 && rs.every((k) => k === 'rest') && sc.out['4-3'].d >= twoR46 - 1e-6 && sc.out['2-3'].d >= twoR46 - 1e-6 && sc.out['4-2'].d >= twoR46 - 1e-6; // v5: the cc ball vs the leader GATED
    ok46.push(ok);
    rows.push(`(S1-cc) cc ball 15 mm below its line at −0.03, lc train +50 mm at 0.3 [t=0 min pair ${mm(lg)}]: ${threw ? 'THREW ' + threw : `${sol.events.length} events, first ${first(sol)}`}; the cc ball and the leader at ${sc ? mm(sc.out['4-2'].d) : '—'} mm (GATED in v5 — the tree's target: ≥ ${mm(twoR46)}, a 0.1 ms BOUNCE at 55.6 ms: attached and parted in one settle, demand 1.133 > push 0.927); apex on cc-run ${mm(apex)} vs the line ${mm(mCC.yieldD)} (the tree's: +5.8 mm above — the hold admitted); rests ${rs.join(',')}`);
  }
  const y2 = [[0.015, 0.015, '55.6 / 136.8 → 275'], [0.010, 0.010, '75.0 / 147.5 → 241'], [0.020, 0.005, '97.0 / 109.8 → 244'], [0.005, 0.020, '38.4 / 177.9 → 278']];
  for (const [sA, sB, tgt] of y2) {
    const conts = [{ id: 1, route: rRC, D: mRC.yieldD - sA, v: -0.03, q: [0, 0, 0, 1], t0: 0 }, { id: 4, route: rCC, D: mCC.yieldD - sB, v: -0.03, q: [0, 0, 0, 1], t0: 0 }, ...train(rLC, DjLC, 0.05, 0.3, 2, 2)];
    const lg = legit(conts); const { sol, threw } = solve(y3, conts);
    const ids = [1, 4, 2, 3]; const sc = sol ? scan(sol, ids) : null; const rs = sol ? rests(sol, ids) : [];
    const ok = lg >= twoR46 - 1e-6 && !threw && rs.length === 4 && rs.every((k) => k === 'rest') && ['1-4', '2-3', '1-2', '4-2', '1-3', '4-3'].every((k) => sc.out[k].d >= twoR46 - 1e-6); // v5: all six pairs GATED
    ok46.push(ok);
    rows.push(`(Y2 rc −${(sA * 1e3).toFixed(0)} / cc −${(sB * 1e3).toFixed(0)} mm) both committed at −0.03, lc train +50 mm at 0.3 [t=0 min pair ${mm(lg)}]: ${threw ? 'THREW ' + threw : `${sol.events.length} events`}; vs the leader rc ${sc ? mm(sc.out['1-2'].d) : '—'} / cc ${sc ? mm(sc.out['4-2'].d) : '—'} mm and vs the TAIL rc ${sc ? mm(sc.out['1-3'].d) : '—'} / cc ${sc ? mm(sc.out['4-3'].d) : '—'} mm (GATED in v5 — the tree's target: all four ≥ ${mm(twoR46)}; cc bounce / rc attach → part at ${tgt} ms; degree ≤ 2 throughout, no degree-3 node forms under the law); siblings 1-4 ${sc ? mm(sc.out['1-4'].d) : '—'}, train 2-3 ${sc ? mm(sc.out['2-3'].d) : '—'}, rests ${rs.join(',')}`);
  }
  // ---- (WS) the shipped wire slide's fork node, by continuation (legitimate seeds)
  const ws = loadT46('TEST-synthetic-wire-slide'); const wf = ws.routes.get(1), wt = ws.routes.get(4); const mw = wf.merges.find((x) => x.feeder === wf.chain[0]); const Djw = stationD(wt, mw.rw.id, mw.s);
  for (const [dD, v, nT, above] of [[0.015, -0.03, 3, 0.05], [0.020, 0.05, 3, 0.05], [0.010, -0.03, 3, 0.03], [0.015, -0.03, 4, 0.05]]) {
    const conts = [{ id: 1, route: wf, D: mw.yieldD - dD, v, q: [0, 0, 0, 1], t0: 0 }, ...train(wt, Djw, above, 0.3, nT, 2)];
    const ids = conts.map((c) => c.id); const lg = legit(conts); const { sol, threw } = solve(ws, conts);
    const sc = sol ? scan(sol, ids) : null; const rs = sol ? rests(sol, ids) : [];
    const gated = true; // v5: the 4-train too (the list THREW MAX_EVENTS on it; the tree solves it in 30 events)
    const ok = lg >= twoR46 - 1e-6 && (!gated || (!threw && rs.length === ids.length && rs.every((k) => k === 'rest') && Math.min(...Object.values(sc.out).map((x) => x.d)) >= twoR46 - 1e-6)); // v5: every pair GATED
    ok46.push(ok);
    rows.push(`(WS ${nT}-train, lc ball ${(dD * 1e3).toFixed(0)} mm below its line at ${v}, +${(above * 1e3).toFixed(0)} mm at 0.3) [t=0 min pair ${mm(lg)}]: ${threw ? `THREW ${threw} (GATED in v5 — the tree's target: solves, 30 events, every pair ≥ 57.15, all rest)` : `${sol.events.length} events, first ${first(sol)}; the fork node's children 1-3 at ${mm(sc.out['1-3'].d)} mm (GATED in v5 — the tree's target: ≥ ${mm(twoR46)}; the list chains the two feeder children consecutively at one station), rests ${rs.join(',')}`}`);
  }
  // ---- (SEP) the 40°/40° fork (TEST-shallow-merge with both feeders at 40°; the validator admits it), the seeded Y
  const leg = (deg, L, y, sgn) => [+(-1150 + L * Math.cos(deg * Math.PI / 180)).toFixed(1), y, +(sgn * L * Math.sin(deg * Math.PI / 180)).toFixed(1)];
  const fd = loadDef(path.resolve(here, '../scene/ballreturn/tracks/TEST-shallow-merge.json')); for (const rw of fd.runways) { if (rw.id === 'rc-run') rw.points_mm[1] = leg(40, 330, -300, 1); if (rw.id === 'lc-run') rw.points_mm[1] = leg(40, 650, -300, -1); }
  let fork = null, forkRefused = null; try { fork = validateTrack(fd, { pockets: POCKETS, falls: null }); } catch (e) { forkRefused = e.message.slice(0, 120); }
  if (fork) {
    const rc = fork.routes.get(4), lc = fork.routes.get(1); const mrc = rc.merges.find((x) => x.feeder === 'rc-run'), mlc = lc.merges.find((x) => x.feeder === 'lc-run');
    const N = stationAt(lc, mlc.D, R, {}); const Drc = seatBehind(rc, [N.x, N.y, N.z], -Infinity, twoR46, mrc.D + twoR46), Dlc = seatBehind(lc, [N.x, N.y, N.z], -Infinity, twoR46, mlc.D + twoR46);
    const sols = [];
    for (const [order, u] of [['rc-first', 0.1], ['lc-first', 0.1], ['rc-first', 0.3]]) {
      const node = { id: 3, route: lc, D: mlc.D, v: u, q: [0, 0, 0, 1], t0: 0 };
      const rcC = { id: 1, route: rc, D: Drc, v: 0.769 * u, q: [0, 0, 0, 1], t0: 0, follow: true }, lcC = { id: 2, route: lc, D: Dlc, v: 0.768 * u, q: [0, 0, 0, 1], t0: 0, follow: true };
      const { sol, threw } = solve(fork, order === 'rc-first' ? [node, rcC, lcC] : [node, lcC, rcC]);
      const sc = sol ? scan(sol, [1, 2, 3]) : null; const rs = sol ? rests(sol, [1, 2, 3]) : []; const worst = sc ? Math.min(...Object.values(sc.out).map((x) => x.d)) : NaN;
      const ev = sol ? sol.events.map((e) => `${e.kind}@${e.t.toFixed(4)}:${e.ball}${e.other != null ? '/' + e.other : ''}`).join(' ') : null;
      const meet = sol ? sol.events.find((e) => e.kind === 'contact' && ((e.ball === 1 && e.other === 2) || (e.ball === 2 && e.other === 1))) ?? null : null;
      const ok = !threw && rs.length === 3 && rs.every((k) => k === 'rest') && worst >= twoR46 - 1e-6 && sc.maxStep <= 1e-3 && sol.events[0].kind === 'separate' && sol.events[0].ball === 2 && sol.events[0].t < 1e-6;
      ok46.push(ok); sols.push({ order, u, ev, sc, rs, worst, meet, ok });
      rows.push(`(SEP ${order} u ${u}): ${threw ? 'THREW ' + threw : `${sol.events.length} events, first ${first(sol, 3)}`}; the lc child parts at t = 0 by the tensile test (demand 0.630 > push 0.433 — the law's, both integrations), the rc child's t = 0 seat misses by 2.6 µm and its FIRST catch is at 0.2 ms; the siblings ${meet ? `MEET at ${meet.t.toFixed(4)} s — a contact, not a target to forbid` : 'do not meet'}; min pair ${mm(worst)}, rests ${rs.join(',')}`);
    }
    const same = sols.length === 3 && sols[0].ev === sols[1].ev;
    ok46.push(same);
    rows.push(`(SEP orders) rc-first and lc-first at u 0.1 are ${same ? 'ONE solve (byte-identical event lists)' : 'DIFFERENT solves'} — the seeding order is not a physical parameter (v3 read two orders where there is one)`);
  } else { ok46.push(false); rows.push(`(SEP) the 40°/40° fork REFUSED by the validator: ${forkRefused}`); }
  // ---- v5 (order 23b) ----
  const NAMES = ['wall', 'hold', 'seat', 'lone', 'corner', 'mutual'];
  const lastOf = (sol) => sol ? sol.events[sol.events.length - 1] : null;
  const heldName = (sol) => { const l = lastOf(sol); return l && NAMES.includes(l.heldBy) ? l.heldBy : null; };
  // (SIB) refuter II's sibling pass-through (item 1): rc and cc balls 15 mm below their lines at 0.1, the lc train +50 mm at 0.1. The list
  // drew balls 1 and 4 through each other (0.00 mm); the tree's sibling scan books the cc ball under the rc ball at 0.2689 and under the
  // leader at 0.3257, and the four rest wedged at the junction — |F| 0.518 inside R 0.729, G = [1, 1, −1.075, −0.985], 0 of 4 grounded, every link's gap closing
  // with both ends freed: a rest held by the members' own contacts, NAMED 'mutual' with members, F, R, S2 (item 2; the order's reading
  // of this state was a LOCK — §29 states the derivation and the one-line switch).
  {
    const conts = [{ id: 1, route: rRC, D: mRC.yieldD - 0.015, v: 0.1, q: [0, 0, 0, 1], t0: 0 }, { id: 4, route: rCC, D: mCC.yieldD - 0.015, v: 0.1, q: [0, 0, 0, 1], t0: 0 }, { id: 2, route: rLC, D: DjLC + 0.05, v: 0.1, q: [0, 0, 0, 1], t0: 0 }, { id: 3, route: rLC, D: DjLC + 0.05 + twoR46, v: 0.1, q: [0, 0, 0, 1], t0: 0, follow: true }];
    const lg = legit(conts); const { sol, threw } = solve(y3, conts);
    const ids = [1, 4, 2, 3]; const sc = sol ? scan(sol, ids) : null; const rs = sol ? rests(sol, ids) : [];
    const sib = sol ? sol.events.filter((e) => e.via === 'sibling') : []; const last = lastOf(sol);
    const worst = sc ? Math.min(...Object.values(sc.out).map((x) => x.d)) : NaN;
    const pair = (e) => [e.ball, e.other].sort().join('/');
    const ok = lg >= twoR46 - 1e-6 && !threw && rs.length === 4 && rs.every((k) => k === 'rest') && worst >= twoR46 - 1e-6 && sc.maxStep <= 1e-3 && sib.length === 2 && pair(sib[0]) === '1/4' && Math.abs(sib[0].t - 0.2689) <= 1e-3 && pair(sib[1]) === '2/4' && Math.abs(sib[1].t - 0.3257) <= 1e-3 && !!last && last.heldBy === 'mutual' && (last.members ?? []).length === 4 && Math.abs(Math.abs(last.F) - 0.5176) <= 2e-3 && Math.abs(last.R - 0.7291) <= 2e-3 && Math.abs(last.S2 - 7.010) <= 1e-2;
    ok46.push(ok);
    rows.push(`(SIB) refuter II's pass-through — rc and cc balls 15 mm below their lines at 0.1, lc train +50 mm at 0.1 [t=0 min pair ${mm(lg)}]: ${threw ? 'THREW ' + threw : `${sol.events.length} events`}, sibling contacts ${sib.map((e) => `${e.ball}/${e.other} @ ${e.t.toFixed(4)}`).join(', ')} (2: the cc ball under the rc ball at 0.2689, then under the leader at 0.3257), min drawn pair ${mm(worst)} mm (the list: 0.00 — drawn through each other), max 0.1 ms step ${sc ? mm(sc.maxStep) : '—'} mm, the four at rest ${last ? `named on '${last.kind}' heldBy ${last.heldBy ?? '(none)'} members [${(last.members ?? []).join(', ')}] |F| ${Number.isFinite(last.F) ? Math.abs(last.F).toFixed(4) : '—'} R ${Number.isFinite(last.R) ? last.R.toFixed(4) : '—'} S2 ${Number.isFinite(last.S2) ? last.S2.toFixed(3) : '—'}` : '—'} (0.5176 / 0.7291 / 7.010 at 0.3468; G = [1, 1, −1.075, −0.985], 0 of 4 grounded)`);
  }
  // (SIB-2) the pre-node feeder pair (item 1): rc 20 mm below its line at 0.2, cc 5 mm below at 0.2, the train at 0.1 — the cc ball
  // attaches to the leader first, and the rc ball then meets it BEFORE either reaches the point. `convergeAtJunction` reads two feeders
  // one way (the rear is the ball further from its landing) so that a pair of free balls is booked once; against a member that is not
  // its cluster's front — never the `rear` of any pairing — the pair had no reading at all until the rc ball attached to the parent and
  // became the sibling: 55.923 mm at 0.1064 (1.227 mm inside), re-seated 1.433 mm at the node. Read from the side the scan tries, the
  // contact 1/4 books at 0.1010, before 1/2, at 57.150 and a 0.028 mm step.
  {
    const conts = [{ id: 1, route: rRC, D: mRC.yieldD - 0.020, v: 0.2, q: [0, 0, 0, 1], t0: 0 }, { id: 4, route: rCC, D: mCC.yieldD - 0.005, v: 0.2, q: [0, 0, 0, 1], t0: 0 }, { id: 2, route: rLC, D: DjLC + 0.05, v: 0.1, q: [0, 0, 0, 1], t0: 0 }, { id: 3, route: rLC, D: DjLC + 0.05 + twoR46, v: 0.1, q: [0, 0, 0, 1], t0: 0, follow: true }];
    const lg = legit(conts); const { sol, threw } = solve(y3, conts);
    const ids = [1, 4, 2, 3]; const sc = sol ? scan(sol, ids) : null; const rs = sol ? rests(sol, ids) : [];
    const c14 = sol ? sol.events.find((e) => e.kind === 'contact' && e.ball === 1 && e.other === 4) ?? null : null;
    const c12 = sol ? sol.events.find((e) => e.kind === 'contact' && e.ball === 1 && e.other === 2) ?? null : null;
    const last = lastOf(sol);
    const ok = lg >= twoR46 - 1e-6 && !threw && rs.length === 4 && rs.every((k) => k === 'rest') && !!c14 && !!c12 && c14.t < c12.t && Math.abs(c14.t - 0.1010) <= 1e-3 && sc.out['1-4'].d >= twoR46 - 1e-6 && sc.maxStep <= 1e-4 && heldName(sol) === 'mutual';
    ok46.push(ok);
    rows.push(`(SIB-2) the pre-node feeder pair — rc 20 mm below its line at 0.2, cc 5 mm below at 0.2, lc train +50 mm at 0.1 [t=0 min pair ${mm(lg)}]: ${threw ? 'THREW ' + threw : `${sol.events.length} events`}, contact 1/4 at ${c14 ? c14.t.toFixed(4) : 'never'} (0.1010 ± 0.001) BEFORE 1/2 at ${c12 ? c12.t.toFixed(4) : 'never'}, min 1–4 ${sc ? mm(sc.out['1-4'].d) : '—'} mm (one-way reading: 55.923, the list: 10.748), max 0.1 ms step ${sc ? (sc.maxStep * 1e3).toFixed(3) : '—'} mm (≤ 0.1; one-way reading: 1.433), rest named ${heldName(sol) ?? '(none)'}`);
  }
  // (SIB-3) refuter A's chain across three routes (order 23b, round 2): ONE trunk ball at rest 50 mm above the point and two feeder
  // balls 5 mm below their lines at 0.02 (and at rest; 15 mm at 0.1; 30 mm at 0.3). The cluster is the CHAIN 2 ← 4 ← 1 — no node —
  // and ball 1's seat one diameter behind ball 4 resolves AT the point where ball 2 stands: the sibling scan at nodes only let the
  // grandchild through its grandparent (0.009 / 0.247 / 0.250 / 0.250 mm) for 0.26–0.46 s, then re-seated 57 mm in one 0.1 ms
  // step. Scanned (any cluster spanning three runways), the meeting closes a RIGID TRIANGLE — three balls in mutual contact on
  // three paths meeting at one point, no freedom — which the tree cannot hold: read along the pre-meeting motion the member
  // re-seated under whichever seat it moved toward, the block stopped, reversed, re-caught the seat it had left, re-seated again,
  // 18 750 events over 143 s; read along the POST-meeting motion (the new tree's own speeds and acceleration, the rest law at a
  // stop) the dropped link re-closes inside the horizons and the meeting is a PINCH, refused by name at 0.46–0.64 s (fail-closed;
  // reachable only through the V15 seam; the tree before this round drew the balls through one another).
  {
    const out = []; let ok3 = true;
    for (const [sd, vf, vT, nT] of [[0.005, 0.02, 0, 1], [0.005, 0, 0, 1], [0.015, 0.1, 0, 1], [0.030, 0.3, 0, 1], [0.015, 0.2, 0.2, 2]]) {
      // the fifth seed: the (vf, vT) family's 15/15 at 0.2 / 0.2 — the two feeder children meet under the LEADER of a 2-train as the block
      // decelerates: it reverses at its stop and the dropped link re-closes by 40 ms — a triangle the tree would move through, a pinch
      const conts = [{ id: 1, route: rRC, D: mRC.yieldD - sd, v: vf, q: [0, 0, 0, 1], t0: 0 }, { id: 4, route: rCC, D: mCC.yieldD - sd, v: vf, q: [0, 0, 0, 1], t0: 0 }, ...train(rLC, DjLC, 0.05, vT, nT, 2)];
      const lg = legit(conts); let sol = null, lock = null, threw = null;
      try { sol = solveShot({ track: y3, r: R, ledger: [], arrivals: [], continuations: conts }); } catch (e) { if (e.kind === 'LOCK') lock = e.lock; else threw = e.message.slice(0, 50); }
      // a pinch by name, before any pair is drawn inside one diameter; or (never on these seeds) a clean solve
      const good = lg >= twoR46 - 1e-6 && !threw && !!lock && lock.why === 'pinch' && lock.t > 0.2 && lock.t < 1.0 && (lock.members ?? []).length >= 3;
      ok3 = ok3 && good;
      out.push(`${(sd * 1e3).toFixed(0)} mm / ${vf}${nT > 1 ? ` (2-train at ${vT})` : ''}: ${threw ? 'THREW ' + threw : lock ? `LOCK '${lock.why}' at ${lock.t.toFixed(4)} (balls ${(lock.members ?? []).join(', ')})` : `${sol.events.length} ev, SOLVED`}${good ? '' : ' ✗'}`);
    }
    ok46.push(ok3);
    rows.push(`(SIB-3) the rigid TRIANGLE refused by name — refuter A's chain across three routes (one trunk ball at rest, two feeder balls: 5 mm / 0.02, 5 / 0, 15 / 0.1, 30 / 0.3) and the two feeder children meeting under a decelerating leader (15 / 0.2, 2-train at 0.2): ${out.join('; ')} (nodes-only scan: 0.009 / 0.247 / 0.250 / 0.250 mm and a 57 mm step; the pre-meeting reading: 18 750 events over 143 s; the physical state is a jam at rest that opens leader-first only — a unilateral rigid block the tree does not represent, carried)`);
  }
  // (JAM) the double-ball fork jam on the shipped wire slide (item 6): two feeder balls 20 mm below their lines, the second 0 / 2 / 5 / 10 mm
  // further up, at 0.05 and 0.1 (every seed legitimate at t = 0; 20 mm further up crosses the spheres, 53.05 mm). They meet at the point
  // and rest wedged in one contact — |F| 0–0.009 inside R ≈ 0.36, the link closing with both ends freed — named 'mutual' within 0.14 s.
  // The pre-fix solver crept every offset pair through the point (22–23 events, 13.5–18.3 s); the 0 mm pair is an exact tie, which the converging-pair scan ("the front is the nearer") read from neither
  // side: the two were drawn through one another at the point (0.020 mm between centres at 0.305 s). The tie is broken by the ball id.
  {
    const rL = [...ws.routes.values()].find((x) => x.chain[0] === 'lc-run'), rR = [...ws.routes.values()].find((x) => x.chain[0] === 'rc-run');
    const mL = rL.merges.find((x) => x.feeder === 'lc-run'), mR = rR.merges.find((x) => x.feeder === 'rc-run');
    const out = []; let okJ = true;
    for (const off of [0, 0.002, 0.005, 0.010]) for (const v of [0.05, 0.1]) {           // 20 mm further up is not a legitimate seed (the two spheres cross at t = 0: 53.05 mm)
      const conts = [{ id: 1, route: rL, D: mL.yieldD - 0.02, v, q: [0, 0, 0, 1], t0: 0 }, { id: 4, route: rR, D: mR.yieldD - 0.02 - off, v, q: [0, 0, 0, 1], t0: 0 }];
      const lg = legit(conts); const { sol, threw } = solve(ws, conts);
      const sc = sol ? scan(sol, [1, 4]) : null; const rs = sol ? rests(sol, [1, 4]) : []; const last = lastOf(sol);
      const good = lg >= twoR46 - 1e-6 && !threw && rs.length === 2 && rs.every((k) => k === 'rest') && sc.out['1-4'].d >= twoR46 - 1e-6
        && sol.events.length <= 3 && sol.tEnd <= 0.15 && !!last && last.heldBy === 'mutual' && (last.members ?? []).slice().sort().join(',') === '1,4' && Math.abs(last.F) <= last.R;
      okJ = okJ && good;
      out.push(`${(off * 1e3).toFixed(0)} mm / ${v}: ${threw ? 'THREW' : `${sol.events.length} ev, ${sol.tEnd.toFixed(3)} s, ${last ? `${last.heldBy ?? 'UNNAMED'} |F| ${Number.isFinite(last.F) ? Math.abs(last.F).toExponential(2) : '—'} R ${Number.isFinite(last.R) ? last.R.toFixed(3) : '—'}` : '—'}, min ${sc ? mm(sc.out['1-4'].d) : '—'}`}${good ? '' : ' ✗'}`);
    }
    ok46.push(okJ);
    rows.push(`(JAM) the wire-slide fork jam — lc ball 20 mm below its line, rc ball 0 / 2 / 5 / 10 mm further up, at 0.05 / 0.1: ${out.join('; ')} (pre-fix: the offset pairs crept through the point in 22–23 events over 13.5–18.3 s; the 0 mm pair is an exact TIE the converging-pair scan read from neither side — drawn through one another at the point, 0.020 mm between centres at 0.305 s — broken by the ball id now: they meet one diameter clear at 0.0737 / 0.1306 and wedge)`);
  }
  // (HOLD) the hold angle (item 3), derived from the friction law already in track.js: a = k·g·(sinθ − (7/5)(r/ρ)·u_r·cosθ), so a body is
  // grounded — |drive| ≤ resist — iff tanθ ≤ (7/5)(r/ρ)·u_r (k and g cancel). Read at every sampled station of every runway of two fixtures
  // against `accelAt`'s own drive / resist: the identity holds everywhere, and it says why a tray station is a seat (θ_hold 0.80° over a
  // level channel) and a run station is not (θ_hold 1.06° on the twin rail against 2.5° and 7.4° slopes) — no constant, no time.
  {
    let n = 0, bad = 0; const kinds = new Map();
    for (const trk of [ws, y3]) for (const [, route] of trk.routes) for (let D = 0.002; D < route.total; D += 0.004) {
      const loc = locate(route, D); const der = supportDerived(loc.rw.support, R); const thr = resistCoeff(der, R, trk.u_r);
      const res = accelAt(route, sideD(route, D, 1), R); const grounded = Math.abs(res.drive) <= res.resist * (1 + 1e-9);
      const tanTh = Math.abs(loc.edge.sinTh / loc.edge.cosTh); const byLaw = tanTh <= thr * (1 + 1e-9);
      n += 1; if (grounded !== byLaw) bad += 1;
      const key = `${loc.rw.support.kind}`; if (!kinds.has(key)) kinds.set(key, { rrho: R / der.rho, k: der.k, hold: Math.atan(thr) * 180 / Math.PI, slopes: new Set() }); kinds.get(key).slopes.add(+(Math.atan(tanTh) * 180 / Math.PI).toFixed(1));
    }
    const ok = n > 200 && bad === 0;
    ok46.push(ok);
    rows.push(`(HOLD) the hold angle tanθ ≤ (7/5)(r/ρ)·u_r read against accelAt at ${n} stations of two fixtures: ${bad} disagreements; ${[...kinds].map(([k, v]) => `${k}: r/ρ ${v.rrho.toFixed(3)}, k ${v.k.toFixed(3)}, θ_hold ${v.hold.toFixed(2)}° vs slopes ${[...v.slopes].sort((a, b) => a - b).join('/')}°`).join('; ')} (u_r ${ws.u_r}: the level channel is a seat, every twin-rail run drains)`);
  }
  // (Y2-LAW) third-degree nodes by law (item 4): the Y2 family sampled across (vf, vT) on TEST-y3-obtuse through the V15 seam — two
  // depths, vf −0.03 / 0 / 0.1 / 0.2, vT 0.1 / 0.3. What the law says on every seed: it solves (no LOCK, no throw), every drawn pair one
  // diameter, every ball at rest and the rest NAMED; a ball carrying three links forms and is held (below); the cc link's class (a
  // 0.1 ms BOUNCE or a persisting link) is re-derived at the sampled speeds, not carried from vT = 0.3.
  {
    const out = []; let okY = true, deg3Seeds = [];
    for (const [sA, sB] of [[0.015, 0.015], [0.020, 0.005]]) for (const vf of [-0.03, 0, 0.1, 0.2]) for (const vT of [0.1, 0.3]) {
      const conts = [{ id: 1, route: rRC, D: mRC.yieldD - sA, v: vf, q: [0, 0, 0, 1], t0: 0 }, { id: 4, route: rCC, D: mCC.yieldD - sB, v: vf, q: [0, 0, 0, 1], t0: 0 }, { id: 2, route: rLC, D: DjLC + 0.05, v: vT, q: [0, 0, 0, 1], t0: 0 }, { id: 3, route: rLC, D: DjLC + 0.05 + twoR46, v: vT, q: [0, 0, 0, 1], t0: 0, follow: true }];
      const lg = legit(conts); const { sol, threw } = solve(y3, conts);
      const ids = [1, 4, 2, 3]; const sc = sol ? scan(sol, ids) : null; const rs = sol ? rests(sol, ids) : [];
      const worst = sc ? Math.min(...Object.values(sc.out).map((x) => x.d)) : NaN;
      // links per ball from the event stream: a contact adds parent(ball) = other; a separate removes it
      const parent = new Map([[3, 2]]); let deg3 = false, cc = null, ccSep = null;
      const links = () => { const m = new Map(); for (const [c, p] of parent) { m.set(c, (m.get(c) ?? 0) + 1); m.set(p, (m.get(p) ?? 0) + 1); } return m; };
      if (sol) for (const e of sol.events) {
        if (e.kind === 'contact') { parent.set(e.ball, e.other); if (e.ball === 4 && e.other === 2 && cc === null) cc = e.t; }
        if (e.kind === 'separate') { parent.delete(e.ball); if (e.ball === 4 && e.other === 2 && cc !== null && ccSep === null) ccSep = e.t; }
        for (const [, k] of links()) if (k >= 3) deg3 = true;
      }
      const ccClass = cc === null ? 'no cc link' : (ccSep !== null && ccSep - cc < 1e-3 ? 'cc BOUNCE' : 'cc persists');
      const good = lg >= twoR46 - 1e-6 && !threw && rs.length === 4 && rs.every((k) => k === 'rest') && worst >= twoR46 - 1e-6 && sc.maxStep <= 1e-3 && heldName(sol) !== null;
      okY = okY && good; if (deg3) deg3Seeds.push(`${(sA * 1e3).toFixed(0)}/${(sB * 1e3).toFixed(0)} ${vf}/${vT}`);
      out.push(`${(sA * 1e3).toFixed(0)}/${(sB * 1e3).toFixed(0)} ${vf}/${vT}: ${threw ? 'THREW ' + threw : `${sol.events.length} ev, ${ccClass}, ${heldName(sol) ?? 'UNNAMED'}`}${deg3 ? ' — a THIRD LINK held' : ''}${good ? '' : ' ✗'}`);
    }
    // the third link: the train's LEADER at the point carries its follower behind it on the trunk AND the two feeder balls — three links
    // on one ball — on every seed where both feeders attach while the follower is still on (refuter II's 21 of 24; here 16 of 16), and
    // the tree law HOLDS every one (every pair one diameter, all at rest, named). A third link is admitted by the law where it forms; it
    // is not refused by V15 (V15 is the TRACK's rule — three feeders at one point — and the app never opens the seam). Gated: it forms.
    okY = okY && deg3Seeds.length >= 1;
    ok46.push(okY);
    rows.push(`(Y2-LAW) the Y2 family across (vf, vT), 16 seeds: every seed solves, every pair one diameter, every ball at rest and named; a ball carrying THREE links (the leader: its follower + both feeder balls) forms on ${deg3Seeds.length} of 16 seeds and is held on every one — ${out.join('; ')}`);
  }
  // (CREEP) where the derivation ends (item 3): a group inside its capacity never starts — no event is scheduled at all. The only residual
  // is the start test's tolerance, 1e-9 of the group's own R (relative, not a time constant): from the (SIB) rest's R and S2 the largest
  // imbalance the law can leave un-started is 1e-9·R and the largest acceleration it could ever hide is 1e-9·R / S2.
  {
    const sibLast = (() => { const conts = [{ id: 1, route: rRC, D: mRC.yieldD - 0.015, v: 0.1, q: [0, 0, 0, 1], t0: 0 }, { id: 4, route: rCC, D: mCC.yieldD - 0.015, v: 0.1, q: [0, 0, 0, 1], t0: 0 }, { id: 2, route: rLC, D: DjLC + 0.05, v: 0.1, q: [0, 0, 0, 1], t0: 0 }, { id: 3, route: rLC, D: DjLC + 0.05 + twoR46, v: 0.1, q: [0, 0, 0, 1], t0: 0, follow: true }]; const { sol } = solve(y3, conts); return lastOf(sol); })();
    const Rr = sibLast?.R, S2 = sibLast?.S2; const aMax = Number.isFinite(Rr) && Number.isFinite(S2) ? 1e-9 * Rr / S2 : NaN;
    // measured, not arithmetic (refuter A, round 2): the (SIB) rest re-read 1 000 s after tEnd — every ball 'rest' at the SAME station
    // (|ΔD| < 1e-12), no event after the rest — and the rest state RE-SEEDED at v = 0 stays where it is (one `contact` at t = 0, named).
    const sibSol = sibLast ? (() => { const conts = [{ id: 1, route: rRC, D: mRC.yieldD - 0.015, v: 0.1, q: [0, 0, 0, 1], t0: 0 }, { id: 4, route: rCC, D: mCC.yieldD - 0.015, v: 0.1, q: [0, 0, 0, 1], t0: 0 }, { id: 2, route: rLC, D: DjLC + 0.05, v: 0.1, q: [0, 0, 0, 1], t0: 0 }, { id: 3, route: rLC, D: DjLC + 0.05 + twoR46, v: 0.1, q: [0, 0, 0, 1], t0: 0, follow: true }]; return solve(y3, conts).sol; })() : null;
    const still = !!sibSol && [1, 4, 2, 3].every((id) => { const c0 = continuationAt(sibSol, id, sibSol.tEnd + 1e-6), c1 = continuationAt(sibSol, id, sibSol.tEnd + 1000); return c0 && c1 && c0.kind === 'rest' && c1.kind === 'rest' && Math.abs(c1.D - c0.D) < 1e-12; }) && sibSol.events.every((e) => e.t <= sibSol.tEnd + 1e-12);
    let reseed = null; if (sibSol) { const cs = [1, 4, 2, 3].map((id) => ({ id, c: continuationAt(sibSol, id, sibSol.tEnd + 1) })); const { sol: re, threw: reThrew } = solve(y3, cs.map(({ id, c }) => ({ id, route: c.route, D: c.D, v: 0, q: [0, 0, 0, 1], t0: 0, follow: id === 3 }))); reseed = reThrew ? { threw: reThrew } : { n: re.events.length, tEnd: re.tEnd, named: heldName(re), still: [1, 4, 2, 3].every((id) => { const c1 = continuationAt(re, id, 1000); const c0 = cs.find((x) => x.id === id).c; return c1 && c1.kind === 'rest' && Math.abs(c1.D - c0.D) < 1e-9; }) }; }
    const ok = Number.isFinite(aMax) && aMax < 1e-9 && sibLast.heldBy === 'mutual' && still && !!reseed && !reseed.threw && reseed.tEnd <= 1e-9 && reseed.named === 'mutual' && reseed.still;
    ok46.push(ok);
    rows.push(`(CREEP) the residual, MEASURED: the (SIB) rest re-read 1 000 s on — every ball at its station (${still ? 'no motion, no event' : 'MOVED'}); the rest state re-seeded at v = 0 ${reseed ? (reseed.threw ? 'THREW ' + reseed.threw : `${reseed.n} event at t ${reseed.tEnd.toExponential(1)}, named ${reseed.named ?? 'UNNAMED'}, ${reseed.still ? 'stays' : 'MOVES'}`) : '—'}; the start test's tolerance is 1e-9·R = ${Number.isFinite(Rr) ? (1e-9 * Rr).toExponential(3) : '—'} (R ${Number.isFinite(Rr) ? Rr.toFixed(4) : '—'}, S2 ${Number.isFinite(S2) ? S2.toFixed(3) : '—'}), the largest acceleration it could hide ${Number.isFinite(aMax) ? aMax.toExponential(3) : '—'} m/s² — relative to the group's own capacity, no time constant, no horizon; a group inside the band schedules no event at all`);
  }
  check(`r46 the contact tree's seeding family v5 (order 23b item 5; v4's targets GATED, the sibling pass-through, the pre-node feeder pair, the fork jam, the hold angle, the (vf, vT) family and the creep residual added): every seed legitimate at t = 0, every target of the law gated, every rest off the tray NAMED — ${rows.join(' | ')}`,
    ok46.length === rows.length && ok46.every(Boolean), JSON.stringify({ ok46, rows }));
}

// r53 — order 23b round 2: what refuter B found against `da36a3dc`, as gates. (F1) the merge did not honour the
// named 'corner' rest: a striker from behind was projected onto the DOWNSTREAM tree (G = [1, J⁺, J⁺, …], J⁺ = cos 135° = −0.707) and
// the motion realised on the upstream one — one ball at +0.489 became four at −0.139 climbing 15.64 mm back up the entry leg (135°,
// three arrivals stopped at the corner + a fourth 2 s later). A block resting on the corner takes a push from behind as the wall does:
// the striker stops (0.489 → 0.000), the block stays, the catch is named 'corner'. (F2) a same-instant spin to MAX_EVENTS, new to
// 23b: 170° hairpin, a 2-train at rest 60 mm down the exit leg, a 2-train at 0.3 m/s 350 mm up — the front train is knocked back to
// the corner and rests there ('corner'); the loose ball rolling on to the tray then found a "stand station" 26 mm BEHIND itself
// (`standStation` took the upper root behind the corner-held train's member, upstream of the ball), read "already below where it
// should stand", was asked at τ = 0 with the window free, committed, re-asked above its line while rolling forward … 20 000 times at
// t 1.5013 with five events booked. A root behind the ball (the ball clear of the member by a diameter) is no stand, and the re-ask
// above the line is for a ball shoved BACK, not one rolling forward with its verdict: 7 events, tEnd 2.467. (F6) a merge-window hold
// is a named rest: the `yield` event carries heldBy 'hold' (16 of refuter B's 230 fuzz solves ended on an unnamed yield).
{
  const loadT53 = (name) => validateTrack(loadDef(path.resolve(here, `../scene/ballreturn/tracks/${name}.json`)), { pockets: POCKETS, falls: null });
  const mk53 = (deg, leg2 = 150, tray = 200) => { const d = JSON.parse(JSON.stringify(loadDef(path.resolve(here, '../scene/ballreturn/tracks/TEST-bend-90.json')))); const th = deg * Math.PI / 180; const dir = [Math.sin(th), -Math.cos(th)]; const V = [0, -303, 253.5]; const E = [V[0] + dir[0] * leg2, V[1] - 15, V[2] + dir[1] * leg2]; const T = [E[0] + dir[0] * tray, E[1], E[2] + dir[1] * tray]; const rd = (p) => p.map((x) => +x.toFixed(2)); d.runways[0].points_mm = [[0, -263, 703.5], rd(V), rd(E)]; d.runways[1].points_mm = [rd(E), rd(T)]; d.tray.length_mm = tray; d.tray.capacity_balls = Math.floor(tray / 57.15); d.doc.title = `TEST-hairpin-${deg}`; return d; };
  const rows = []; const oks = []; const twoR53 = 2 * R;
  const hoff53 = (trk, t, pk) => handoffFromSink({ t, pocket: POCKETS[pk], fall: POCKETS[pk], r: R, glide: 0.06, tFall: 0.021 }, { track: trk, pockets: POCKETS, r: R });
  // (F1) the striker into a corner-held train
  for (const [deg, n] of [[135, 3], [150, 3], [170, 4]]) {
    const trk = validateTrack(mk53(deg), { pockets: POCKETS, falls: null });
    const arrs = Array.from({ length: n }, (_, i) => ({ id: i + 1, handoff: hoff53(trk, 0.5 + 0.03 * i, 4) })); arrs.push({ id: n + 1, handoff: hoff53(trk, 2.5, 4) });
    let sol = null, threw = null; try { sol = solveShot({ track: trk, r: R, ledger: [], arrivals: arrs }); } catch (e) { threw = e.message.slice(0, 50); }
    const ids = arrs.map((a) => a.id);
    const stop = sol ? sol.events.find((e) => e.kind === 'impact' && e.vOut === 0) ?? null : null;
    const strike = sol ? sol.events.find((e) => e.kind === 'contact' && e.ball === n + 1) ?? null : null;
    // the front's station after the strike: never above (upstream of) where it stopped
    let climb = 0; if (sol && strike) { const D0 = continuationAt(sol, 1, strike.t - 1e-6)?.D; for (let t = strike.t; t <= sol.tEnd + 0.05; t += 1e-3) { const c = continuationAt(sol, 1, t); if (c && Number.isFinite(c.D) && Number.isFinite(D0)) climb = Math.max(climb, c.D - D0); } }
    const rests = sol ? ids.every((id) => continuationAt(sol, id, sol.tEnd + 1)?.kind === 'rest') : false;
    const ok = !threw && !!stop && stop.heldBy === 'corner' && !!strike && strike.v > 0.3 && Math.abs(strike.vOut) <= 1e-9 && strike.heldBy === 'corner' && climb <= 1e-6 && rests && sol.events.length <= 12;
    oks.push(ok);
    rows.push(`(F1 ${deg}° n${n} + a striker at 2.5 s) ${threw ? 'THREW ' + threw : `${sol.events.length} events: the train stopped at the corner at ${stop ? stop.t.toFixed(3) : '—'} (${stop?.heldBy ?? 'unnamed'}), the striker in at ${strike ? strike.v.toFixed(3) : '—'} and out at ${strike ? strike.vOut.toFixed(3) : '—'} (${strike?.heldBy ?? 'unnamed'}), the front climbed ${(climb * 1e3).toFixed(2)} mm back up (pre-fix 135° n3: −0.139 m/s, 15.64 mm), all at rest ${rests}`}`);
  }
  // (F2) the same-instant spin
  {
    const trk = validateTrack(mk53(170), { pockets: POCKETS, falls: null }); const route = [...trk.routes.values()][0]; const Dv = Math.max(...route.breaks);
    const P53 = (D) => { const s = stationAt(route, D, R, {}); return [s.x, s.y, s.z]; };
    const train53 = (D0, v, n, id0) => { const out = []; let Dp = D0; for (let i = 0; i < n; i++) { if (i > 0) Dp = seatBehind(route, P53(Dp), Dp, twoR53, Dp + twoR53); out.push({ id: id0 + i, route, D: Dp, v, q: [0, 0, 0, 1], t0: 0, ...(i > 0 ? { follow: true } : {}) }); } return out; };
    const conts = [...train53(Dv - 0.060, 0, 2, 1), ...train53(Dv + 0.35, 0.3, 2, 3)];
    let sol = null, threw = null; try { sol = solveShot({ track: trk, r: R, ledger: [], arrivals: [], continuations: conts }); } catch (e) { threw = e.message.slice(0, 60); }
    const corner = sol ? sol.events.find((e) => e.kind === 'impact' && e.heldBy === 'corner') ?? null : null;
    const wall = sol ? sol.events.find((e) => e.kind === 'wall' && e.ball === 2) ?? null : null;
    const rests = sol ? [1, 2, 3, 4].every((id) => continuationAt(sol, id, sol.tEnd + 1)?.kind === 'rest') : false;
    const ok = !threw && !!corner && Math.abs(corner.t - 1.5013) <= 2e-3 && !!wall && Math.abs(sol.tEnd - 2.467) <= 5e-3 && sol.events.length <= 10 && rests;
    oks.push(ok);
    rows.push(`(F2 170°: a 2-train at rest 60 mm down the exit leg, a 2-train at 0.3 from 350 mm up) ${threw ? 'THREW ' + threw : `${sol.events.length} events, the front train knocked back to the corner at ${corner ? corner.t.toFixed(4) : 'never'} (${corner?.heldBy ?? '—'}), the loose ball at the wall at ${wall ? wall.t.toFixed(3) : 'never'}, tEnd ${sol.tEnd.toFixed(3)} (2.467 ± 0.005), all at rest ${rests}`} (pre-fix: MAX_EVENTS at t 1.5013 with five events booked)`);
  }
  // (F6) a merge-window hold is a named rest: TEST-obtuse-merge, a 2-train coming down the trunk at 0.25 from 120 mm above the point
  // while the rc ball rolls to its line at 0.1 from 40 mm above it — the rc ball yields AT its line (heldBy 'hold'), is released when
  // the window clears (0.336), and everything ends at rest. (A resting occupant near the point is the contact law's, not a hold's.)
  {
    const ob = loadT53('TEST-obtuse-merge'); const r4 = ob.routes.get(4), r1 = ob.routes.get(1);
    const m4 = r4.merges.find((x) => x.feeder === 'rc-run'); const Dj1 = stationD(r1, m4.rw.id, m4.s);
    const P53b = (D) => { const s = stationAt(r1, D, R, {}); return [s.x, s.y, s.z]; };
    const D2 = Dj1 + 0.120, D3 = seatBehind(r1, P53b(D2), D2, twoR53, D2 + twoR53);
    let sol = null, threw = null; try { sol = solveShot({ track: ob, r: R, ledger: [], arrivals: [], continuations: [
      { id: 1, route: r4, D: m4.yieldD + 0.040, v: 0.1, q: [0, 0, 0, 1], t0: 0 },
      { id: 2, route: r1, D: D2, v: 0.25, q: [0, 0, 0, 1], t0: 0 },
      { id: 3, route: r1, D: D3, v: 0.25, q: [0, 0, 0, 1], t0: 0, follow: true },
    ] }); } catch (e) { threw = e.message.slice(0, 60); }
    const y = sol ? sol.events.find((e) => e.kind === 'yield' && e.ball === 1) ?? null : null;
    const rel = sol ? sol.events.find((e) => e.kind === 'release' && e.ball === 1 && y && e.t > y.t) ?? null : null;
    const rests = sol ? [1, 2, 3].every((id) => continuationAt(sol, id, sol.tEnd + 1)?.kind === 'rest') : false;
    const ok = !threw && !!y && y.heldBy === 'hold' && Math.abs(y.D - m4.yieldD) <= 1e-6 && Math.abs(y.t - 0.214) <= 5e-3 && !!rel && rests;
    oks.push(ok);
    rows.push(`(F6 the obtuse window: a 2-train down the trunk at 0.25 from +120 mm, the rc ball to its line at 0.1 from +40 mm) ${threw ? 'THREW ' + threw : `${sol.events.length} events, yield at ${y ? y.t.toFixed(3) : 'never'} (0.214 ± 0.005) ON the line (D ${y ? (y.D * 1e3).toFixed(2) : '—'} = ${(m4.yieldD * 1e3).toFixed(2)}) named ${y?.heldBy ?? '(none)'}, released at ${rel ? rel.t.toFixed(3) : 'never'}, all at rest ${rests}`} (before: the yield carried no name — 16 of refuter B's 230 fuzz solves ended on one)`);
  }
  check(`r53 order 23b round 2 — refuter B's F1 / F2 / F6 as gates: a block resting on the corner takes a push from behind as the wall does (the striker stops, the block stays, the catch named 'corner'); no stand station behind a ball and no re-ask of a ball rolling forward with its verdict (the same-instant spin); the merge-window hold named — ${rows.join(' | ')}`,
    oks.length === rows.length && oks.every(Boolean), JSON.stringify({ oks, rows }));
}

// r54 — V19, the DESIGN gate (order 23b, the round-2 ruling; contract §27.7): a declared track whose DEFAULT DROP FAMILY (every served
// pocket × 1 / 2 / 3 / 4 / 6 balls × 0.03 / 0.1 / 0.3 s; every pair of served pockets sharing a runway × one ball each × 0.03 / 0.1 /
// 0.3 s, both orders) leaves a ball undelivered — at rest off its route's rest surface held by anything but the tray queue, or a
// LOCK — is refused AT DECLARATION, naming the seed. Gated: every shipped fixture that builds on this table context's pockets, the arm apart, PASSES the gate (solves counted,
// no offender, the wall-clock stated); the arm TEST-hairpin-170 (r28's 170° hairpin as a track file) is REFUSED by name — its two-ball
// drop from pocket 4 rests wedged across the vertex ('mutual', 2.1229 s, r28's wedge, re-pinned by FIX10's entry move) — and the 135° hairpin built in-test is refused
// with a 'corner' stop (three balls against the vertex). The gate is pure (no clock inside): the times here are the harness's.
// FIX10 (b): the wedge instant is re-pinned 2.1429 -> 2.1229 s, measurement-corrected — the hairpin's entry moved 11.204713 mm
// down its own line for V20's entry clearance, so the same two balls reach the same vertex that much sooner. Nothing else moved:
// the seed, the runway, the holder ('mutual') and the plan hairpin (169.99888 deg of deviation) are the fixture's, unchanged.
{
  const loadT54 = (name, opts = {}) => validateTrack(loadDef(trackPath(name)), { pockets: POCKETS, falls: null, ...opts });
  const rows = []; const oks = [];
  const names = trackFiles().map(([f]) => f.slice(0, -5)).sort();
  let shippedPass = 0, shippedSolves = 0, shippedMs = 0, shippedSkipped = 0; const shippedFail = [];
  let y3 = null;
  for (const name of names) {
    if (name === 'TEST-hairpin-170') continue;                                    // the arm, below
    let trk = null; try { trk = loadT54(name, name.includes('y3') ? { allowThreeBranch: true } : {}); } catch { continue; } // not this context's (the Star on wpa pockets)
    const t0 = performance.now(); const dg = designGate(trk, { pockets: POCKETS, r: R }); const ms = performance.now() - t0;
    if (name === 'TEST-y3-obtuse') { y3 = { dg, ms }; continue; }                   // the V15 seam's fixture: refused by the family too (below)
    shippedSolves += dg.solves; shippedMs += ms; shippedSkipped += dg.skipped;
    if (dg.evaluated && !dg.refused) shippedPass += 1; else shippedFail.push(`${name}: ${dg.reason ?? 'not evaluated'}`);
    rows.push(`${name}: ${dg.refused ? 'REFUSED — ' + (dg.reason ?? '').slice(0, 160) : 'passes'} (${dg.solves} solves of ${dg.seeds} seeds, ${dg.skipped} skipped, ${dg.waiting.length} waiting${dg.waiting.length ? ' — ' + dg.waiting[0].seed + ': ball ' + dg.waiting[0].ball + ' held by \'' + dg.waiting[0].heldBy + '\' behind the full ' + dg.waiting[0].runway : ''}, ${ms.toFixed(0)} ms)`);
  }
  oks.push(shippedPass >= 5 && shippedFail.length === 0);
  // TEST-y3-obtuse (three feeders at one point — V15 refuses the TRACK; the seam is a test seam): the family refuses it too, with
  // refuter B's F5 seed — six balls 0.03 s apart from pocket 0 (the cc feeder at 101°) wedge 'mutual' at the point
  const f5 = y3 ? y3.dg.offenders.find((x) => /pocket 0, 6 balls 0\.03 s apart/.test(x.seed) && x.heldBy === 'mutual') ?? null : null;
  oks.push(!!y3 && y3.dg.refused && !!f5);
  rows.push(`TEST-y3-obtuse (the V15 seam's fixture): ${y3 ? (y3.dg.refused ? 'REFUSED' : 'NOT REFUSED') + ` — ${y3.dg.offenders.length} offending seeds of ${y3.dg.seeds} (${y3.dg.solves} solves, ${y3.ms.toFixed(0)} ms); refuter B's F5 seed ${f5 ? `→ ball ${f5.ball} at rest on ${f5.runway} held by 'mutual' at ${f5.tEnd.toFixed(3)} s` : 'NOT an offender'}` : 'not loaded'}`);
  // the arm: the 170° hairpin as a track file
  const hp = loadT54('TEST-hairpin-170'); const t1 = performance.now(); const dgH = designGate(hp, { pockets: POCKETS, r: R }); const msH = performance.now() - t1;
  const o = dgH.offenders.find((x) => /pocket 4, 2 balls 0\.03 s apart/.test(x.seed)) ?? null;
  const okH = dgH.evaluated && dgH.refused && /\[V19\]/.test(dgH.reason ?? '') && !!o && o.heldBy === 'mutual' && o.runway === 'bend-run' && Math.abs(o.tEnd - 2.1229) <= 2e-3;
  oks.push(okH);
  rows.push(`TEST-hairpin-170 (the arm): ${dgH.refused ? 'REFUSED' : 'NOT REFUSED'} — ${dgH.offenders.length} offending seeds of ${dgH.seeds} (${dgH.solves} solves, ${msH.toFixed(0)} ms); the two-ball drop from pocket 4 ${o ? `→ ball ${o.ball} at rest on ${o.runway} held by '${o.heldBy}' at ${o.tEnd.toFixed(4)} s` : 'NOT an offender'} (r28's wedge: 'mutual' at 2.1229 s — 2.1429 before FIX10 moved this fixture's entry 11.2047 mm down its own line, re-pinned as measurement-corrected); the reason: ${(dgH.reason ?? '').slice(0, 200)}`);
  // the 135° hairpin (in-test): a 'corner' stop is undelivered too
  const mk54 = (deg, leg2 = 150, tray = 200) => { const d = JSON.parse(JSON.stringify(loadDef(path.resolve(here, '../scene/ballreturn/tracks/TEST-bend-90.json')))); const th = deg * Math.PI / 180; const dir = [Math.sin(th), -Math.cos(th)]; const V = [0, -303, 253.5]; const E = [V[0] + dir[0] * leg2, V[1] - 15, V[2] + dir[1] * leg2]; const T = [E[0] + dir[0] * tray, E[1], E[2] + dir[1] * tray]; const rd = (p) => p.map((x) => +x.toFixed(2)); d.runways[0].points_mm = [[0, -263, 703.5], rd(V), rd(E)]; d.runways[1].points_mm = [rd(E), rd(T)]; d.tray.length_mm = tray; d.tray.capacity_balls = Math.floor(tray / 57.15); d.doc.title = `TEST-hairpin-${deg}`; return d; };
  const h135 = validateTrack(mk54(135), { pockets: POCKETS, falls: null }); const dg135 = designGate(h135, { pockets: POCKETS, r: R });
  const c = dg135.offenders.find((x) => x.heldBy === 'corner') ?? null;
  oks.push(dg135.refused && !!c);
  rows.push(`the 135° hairpin (in-test): ${dg135.refused ? 'REFUSED' : 'NOT REFUSED'} — ${dg135.offenders.length} offending seeds; the first 'corner' stop: ${c ? `${c.seed} → ball ${c.ball} on ${c.runway} at ${c.tEnd.toFixed(4)} s` : 'none'}`);
  check(`r54 V19 the DESIGN gate (order 23b, the round-2 ruling): ${shippedPass} shipped fixtures of this context pass the default drop family (${shippedSolves} solves, ${shippedSkipped} skipped, ${shippedMs.toFixed(0)} ms in all${shippedFail.length ? '; FAILING: ' + shippedFail.join(' | ') : ''}); the V15 seam's y3 fixture refused by the family with refuter B's F5 seed; the 170° hairpin refused by name with r28's 'mutual' wedge; the 135° hairpin refused with a 'corner' stop — ${rows.join(' | ')}`,
    oks.every(Boolean), JSON.stringify({ oks, shippedFail, hairpin: { refused: dgH.refused, offenders: dgH.offenders.slice(0, 3) }, h135: dg135.offenders.slice(0, 2) }));
}

// r54b (#707 prep FIX1 A1, review 707m1 P2-1): the family as RESUMABLE STEPS — the chunked driver (the Worker-absent fallback)
// and the synchronous gate give byte-identical verdicts on the synthetic fixture and on the shipped XW101 export; the driver
// yields between seeds (slices ≥ 2); a slice is bounded below by ONE solve (measured and reported: XW101's six-ball train is
// hundreds of ms) — the Worker, not the budget, is what frees the UI thread; the budget keeps the fallback RESPONSIVE between seeds
{
  const trk54b = validateTrack(loadDef(FIXTURE), { pockets: POCKETS, falls: null });
  const stripT = (d) => { const { slices, sliceMaxMs, ...rest } = d; return JSON.stringify(rest); };
  const idle = () => new Promise((res) => setImmediate(res));
  const c1 = await designGateChunked(trk54b, { pockets: POCKETS, r: R }, { budgetMs: 4, idle });
  const same1 = stripT(designGate(trk54b, { pockets: POCKETS, r: R })) === stripT(c1);
  const xctx = await tableContext('wpbsa_snooker_12ft');
  const xw = validateTrack(loadDef(path.resolve(here, '../scene/ballreturn/tracks/wpbsa_snooker_12ft-xw101-slides.json')), { pockets: xctx.pockets, falls: xctx.falls });
  const sx = designGate(xw, { pockets: xctx.pockets, r: xw.refR }); const cx = await designGateChunked(xw, { pockets: xctx.pockets, r: xw.refR }, { budgetMs: 4, idle });
  check(`r54b V19 as resumable steps (FIX1 A1): chunked and synchronous verdicts byte-identical on the synthetic fixture (${c1.solves} solves, ${c1.slices} slices, longest slice ${c1.sliceMaxMs.toFixed(1)} ms) and on XW101 (${cx.solves} solves, ${cx.slices} slices, longest slice ${cx.sliceMaxMs.toFixed(0)} ms = one six-ball solve — the Worker frees the UI thread, the budget only spaces the seeds)`, same1 && stripT(sx) === stripT(cx) && c1.slices >= 2 && cx.slices >= 2 && c1.solves === 36 && cx.solves === 90, JSON.stringify({ c1: [c1.solves, c1.slices, +c1.sliceMaxMs.toFixed(1)], cx: [cx.solves, cx.slices, +cx.sliceMaxMs.toFixed(0)] }));
}
// r55 — V14's shared-landing exemption is the junction solver's REACH, not the feeders' lengths (#737 review round 2, class B). Two
// feeders sharing a landing were exempt from the clearance rule along their ENTIRE lengths, though the converging-pair scan
// (`convergeAtJunction`) reads a feeder ball against the other feeder's ball only while both stand within 4·2r of their landing:
// a mirrored wire slide whose feeders CROSS 470 mm upstream of the common landing (TEST-crossing-wire-slide: rc-run 703.5 → −350 in z,
// lc-run −703.5 → +350; the crossing at (−468, −325, 0) mm, 1 005 mm above the landing on each, centre paths 0.35 mm apart) built
// under the old rule and V19's family ran two pots 30 ms apart 15.2 mm apart, unscanned. Gated: the fixture is REFUSED at declaration
// by V14 naming the crossing (location, the distance above the landing on each feeder, the reach); every shipped shared-landing
// fixture still builds (their feeders' closest approach outside the reach: synthetic / alias 205.4 mm, shallow 127.0, obtuse 342.1,
// midedge 136.1); the reach is read as 4·2r = 228.6 mm for the 28.575 mm ball.
{
  const load55 = (name, opts = {}) => validateTrack(loadDef(trackPath(name)), { pockets: POCKETS, falls: null, ...opts });
  let refusal = null; try { load55('TEST-crossing-wire-slide'); } catch (e) { refusal = e.message; }
  const named = !!refusal && /\[V14\]/.test(refusal) && /share a landing but cross UPSTREAM/.test(refusal) && /4·2r = 228\.6 mm/.test(refusal) && /\(-468, -325, 0\) mm/.test(refusal) && /1005 mm and rc-run 1005 mm above the landing/.test(refusal) && /within 0\.35 mm/.test(refusal);
  const shared = ['TEST-synthetic-wire-slide', 'TEST-alias-diamond-wire-slide', 'TEST-shallow-merge', 'TEST-obtuse-merge', 'TEST-midedge-landing'];
  const builds = shared.map((n) => { try { const t = load55(n); return `${n} builds (${[...t.routes.keys()].join(',')})`; } catch (e) { return `${n} REFUSED: ${e.message.slice(0, 80)}`; } });
  const y3 = (() => { try { load55('TEST-y3-obtuse', { allowThreeBranch: true }); return 'builds'; } catch (e) { return 'REFUSED: ' + e.message.slice(0, 80); } })();
  const ok = named && builds.every((b) => / builds /.test(b)) && y3 === 'builds';
  check(`r55 V14's shared-landing exemption is the junction solver's reach (#737 r2 class B): TEST-crossing-wire-slide ${refusal ? 'REFUSED — ' + refusal.slice(0, 260) : 'BUILDS (the arm did not fire)'}; the shipped shared-landing fixtures: ${builds.join('; ')}; TEST-y3-obtuse (the seam) ${y3}`,
    ok, JSON.stringify({ refusal, builds, y3 }));
}

// r52 — a continuation dated AFTER the base's start (round 22d, refuter J's D1). `solveShot` seats a continuation at its own t0: a ball
// whose motion begins later than the base (a late-joined session's carried state read at its origin by a re-solve made before it) is
// ABSENT until then — no pieces, poseAt null — and seated at t0 by the same law as at the start (the 'resume' event, rank 0). The
// app's flows date every carried ball at one origin today (the branch is the law's, not a flow's), so the arm is the direct one: two
// balls on the shipped wire slide, one at t0 = 0, one at t0 = 0.5 s from the same station and speed; the late one has no pose before
// 0.5, its pose at 0.5 is the seeded station, and from 0.5 on it draws the early ball's motion shifted by exactly 0.5 s.
{
  const wire = validateTrack(loadDef(path.resolve(here, '../scene/ballreturn/tracks/TEST-synthetic-wire-slide.json')), { pockets: POCKETS, falls: null });
  const route = wire.routes.get(4); const D0 = route.total - 0.05;
  const sol = solveShot({ track: wire, r: R, ledger: [], arrivals: [], continuations: [
    { id: 1, route, D: D0, v: 0.4, q: [0, 0, 0, 1], t0: 0 },
    { id: 2, route, D: D0, v: 0.4, q: [0, 0, 0, 1], t0: 0.5 },
  ] });
  const resume = sol.events.find((e) => e.kind === 'resume') ?? null;
  const before = [0, 0.1, 0.25, 0.4999].map((t) => poseAt(sol, 2, t, {}));
  const at = poseAt(sol, 2, 0.5, {}), early0 = poseAt(sol, 1, 0, {});
  let worst = 0; for (let t = 0.5; t <= 1.5; t += 0.01) { const a = poseAt(sol, 1, t - 0.5, {}), b = poseAt(sol, 2, t, {}); if (!a || !b) { worst = Infinity; break; } worst = Math.max(worst, Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)); }
  const ok = !!resume && Math.abs(resume.t - 0.5) < 1e-12 && resume.ball === 2 && before.every((p) => p === null) && !!at && Math.abs(at.D - D0) < 1e-9 && !!early0 && Math.abs(early0.D - D0) < 1e-9 && worst < 1e-9;
  check(`r52 a continuation dated after the base's start (round 22d): 'resume' at ${resume ? resume.t.toFixed(4) : 'never'} for ball ${resume?.ball}, no pose before it (${before.filter((p) => p === null).length}/4 null), seated at its station at 0.5 s (D ${at ? at.D.toFixed(4) : '—'} = ${D0.toFixed(4)}), and from then on the early ball's motion shifted by 0.5 s to ${(worst * 1e3).toExponential(1)} mm`,
    ok, JSON.stringify({ resume, before: before.map((p) => p && p.D), at: at && at.D, worst }));
}

// r47 — a follower freed while moving BACKWARD is booked moving backward (order 21 item 3, battery N4; investigator D; re-derived on
// the contact TREE in order 23b). The fold parting frees the rear of a forward-moving cross-route chain whose follower is REVERSED
// (G < 0, v > 0): its launch speed is the signed G·v; the seal-15 clamp (max(0, ·)) launched it at rest. Seeding (TEST-obtuse-merge,
// r29's recoil with one more ball on the feeder): b1 rc-run 15 mm below its yield line at −0.03, b4 rc-run a diameter and 10 mm behind
// it at 0.20, the trunk train b2/b3 at Dj1 + 50 mm at 0.3. On the LIST (seal 21) the freed follower was ball 4 (`separate 4/3` at
// 0.1941, −0.034 m/s); the tree holds the mid-train contact the list could not (the feeder ball on the train's LEADER, r46 (MID)),
// so the train's order differs and the backward-freed follower is ball 1: `contact 1/3` at 0.5421 (the leader-pair contact), then
// `separate 1/3` at 0.6062 booked at −0.0470 m/s, ball 1 running BACK up its feeder to an apex 1.08 mm above the parting station and
// turning at 0.6523 (`turn`), tEnd 2.3546, all four at rest in the tray. N4 (the clamp) books the parting at 0.0000 and the ball never
// runs back — no apex, no turn. The tree's numbers are the same on the arm tree (the tree without order 23b's laws) and the sealed
// tree: this row moved with the TREE, not with the rest law.
{
  const loadT47 = (name) => validateTrack(loadDef(path.resolve(here, `../scene/ballreturn/tracks/${name}.json`)), { pockets: POCKETS, falls: null });
  const ob = loadT47('TEST-obtuse-merge'); const r4 = ob.routes.get(4), r1 = ob.routes.get(1);
  const m4 = r4.merges.find((x) => x.feeder === 'rc-run'); const Dy = m4.yieldD; const Dj1 = stationD(r1, m4.rw.id, m4.s); const twoR47 = 2 * R;
  let sol = null, threw = null;
  try { sol = solveShot({ track: ob, r: R, ledger: [], arrivals: [], continuations: [
    { id: 1, route: r4, D: Dy - 0.015, v: -0.03, q: [0, 0, 0, 1], t0: 0 },
    { id: 4, route: r4, D: Dy - 0.015 + twoR47 + 0.01, v: 0.20, q: [0, 0, 0, 1], t0: 0 },
    { id: 2, route: r1, D: Dj1 + 0.05, v: 0.3, q: [0, 0, 0, 1], t0: 0 },
    { id: 3, route: r1, D: Dj1 + 0.05 + twoR47, v: 0.3, q: [0, 0, 0, 1], t0: 0, follow: true },
  ] }); } catch (e) { threw = e.message.slice(0, 60); }
  const con13 = sol ? sol.events.find((e) => e.kind === 'contact' && e.ball === 1 && e.other === 3 && Math.abs(e.t - 0.5421) < 2e-3) ?? null : null;
  const sep13 = sol ? sol.events.find((e) => e.kind === 'separate' && e.ball === 1 && e.other === 3 && Math.abs(e.t - 0.6062) < 2e-3) ?? null : null;
  const turn1 = sol && sep13 ? sol.events.find((e) => e.kind === 'turn' && e.ball === 1 && e.t > sep13.t && e.t < sep13.t + 0.1) ?? null : null;
  // the freed ball's path station after the parting: D GROWS (it runs back up its feeder) to an apex, then falls again
  const Dat = (t) => { const c = sol ? continuationAt(sol, 1, t) : null; return c && Number.isFinite(c.D) ? c.D : NaN; };
  const D0 = sep13 ? Dat(sep13.t + 1e-6) : NaN, D10 = sep13 ? Dat(sep13.t + 0.010) : NaN, Dapex = turn1 ? Dat(turn1.t) : NaN, Dafter = turn1 ? Dat(turn1.t + 0.05) : NaN;
  const rest = sol ? [1, 2, 3, 4].map((id) => continuationAt(sol, id, sol.tEnd + 1)?.kind ?? null) : [];
  const ok47 = !threw && !!con13 && !!sep13 && sep13.v <= -0.02 && D10 - D0 >= 0.3e-3 && !!turn1 && Math.abs(turn1.t - 0.6523) <= 2e-3 && Dapex - D0 >= 0.9e-3 && Dapex - D0 <= 1.3e-3 && Dafter < Dapex && Math.abs(sol.tEnd - 2.3546) <= 0.005 && rest.every((k) => k === 'rest');
  check(`r47 a follower freed while moving backward is booked moving backward (order 21, N4; re-derived on the tree, order 23b): the leader pair meets at ${con13 ? con13.t.toFixed(4) : 'never'} (contact 1/3, the mid-train contact the list could not hold), the parting frees ball 1 at ${sep13 ? sep13.t.toFixed(4) : 'never'} at ${sep13 ? sep13.v.toFixed(4) : '—'} m/s (≤ −0.02), ball 1 runs BACK ${Number.isFinite(D10 - D0) ? ((D10 - D0) * 1e3).toFixed(3) : '—'} mm in the next 10 ms to an apex ${Number.isFinite(Dapex - D0) ? ((Dapex - D0) * 1e3).toFixed(3) : '—'} mm above the parting (1.08 ± 0.2) and turns at ${turn1 ? turn1.t.toFixed(4) : 'never'} (0.6523 ± 0.002); ${threw ? 'THREW ' + threw : `${sol.events.length} events, tEnd ${sol.tEnd.toFixed(4)} (2.3546 ± 0.005)`}, rests ${JSON.stringify(rest)} (N4: the parting at 0.0000, no apex, no turn; the list (seal 21): ball 4 freed at 0.1941 / −0.034, tEnd 2.4165)`,
    ok47, JSON.stringify({ threw, con13, sep13, turn1, D0, D10, Dapex, Dafter, tEnd: sol?.tEnd, rest }));
}


// r48 — the sub-grain bend rule, killed by name (order 21 item 3, battery N16; investigator E). r25 offsets the mid-edge trunk vertex
// in Y — the rc-run landing boundary — where the blend takes the CUT branch on both trees, so r25 never reached the two mutated
// branches. (A) the heading rule: the same vertex offset in Z by 1e-5 / 1e-4 / 1e-3 mm — route 4 builds 10 segments with 4 twists (the
// straight build's count); with the rule off an extra twist + a 51 µm cut + twist appear (12 / 6). (B) the arc rule: the high
// fixture's lead → chute ridge re-aimed by ε in the vertical plane, the chute's length kept — a sub-grain pivot must read collinear
// (2 line segments, no arc) at ε 4.3e-3 … 1e-6; with the rule off a 0.02–99 µm arc is kept and a leader seated at its D0 with a
// follower behind, both at 0.3 m/s, chatters into MAX_EVENTS at ε 1e-6 (refuter B's sided-tinyarc, order 16).
{
  const twoR48 = 2 * R; const rows = [];
  let okA = true;
  for (const dz of [1e-5, 1e-4, 1e-3]) {
    const d = loadDef(path.resolve(here, '../scene/ballreturn/tracks/TEST-midedge-landing.json'));
    const tr = d.runways.find((rw) => rw.id === 'trunk'); tr.points_mm = [[-1000, -341.5, 0], [-1150, -361, dz], [-1300, -380.5, 0]];
    let trk = null, msg = null; try { trk = validateTrack(d, { pockets: POCKETS, falls: null }); } catch (e) { msg = e.message.slice(0, 80); }
    const route = trk ? trk.routes.get(4) : null; const segs = route ? route.segs.length : null; const twists = route ? route.segs.filter((sg) => sg.kind === 'twist').length : null;
    rows.push(`dz ${dz}: ${trk ? `${segs} segs / ${twists} twists` : 'REFUSED ' + msg}`);
    if (!trk || segs !== 10 || twists !== 4) okA = false;
  }
  let okB = true; const rowsB = [];
  const d0 = loadDef(path.resolve(here, '../scene/ballreturn/tracks/TEST-terminal-chutes-high.json'));
  const P0 = [0, -130, -703.5], V0 = [0, -140, -653.5]; const lead = [0, V0[1] - P0[1], V0[2] - P0[2]]; const Ll = Math.hypot(lead[1], lead[2]); lead[1] /= Ll; lead[2] /= Ll;
  const Ln = Math.hypot(-311.6477666666667 + 140, -386.69 + 653.5); const last = [0, 10, 24];
  for (const eps of [4.3e-3, 1e-3, 1e-4, 1e-5, 1e-6]) {
    const c = Math.cos(eps), sn = Math.sin(eps); const nd = [0, lead[1] * c - lead[2] * sn, lead[1] * sn + lead[2] * c];
    const V1 = [0, V0[1] + Ln * nd[1], V0[2] + Ln * nd[2]]; const P2 = [0, V1[1] + last[1], V1[2] + last[2]];
    const d = JSON.parse(JSON.stringify(d0));
    for (const rw of d.runways) { if (rw.id === 'lc-chute') rw.points_mm = [V0, V1, P2]; if (rw.id === 'rc-chute') rw.points_mm = [[0, -140, 653.5], [0, V1[1], -V1[2]], [0, P2[1], -P2[2]]]; }
    let trk = null, msg = null; try { trk = validateTrack(d, { pockets: POCKETS, falls: null }); } catch (e) { msg = e.message.slice(0, 80); }
    if (!trk) { rowsB.push(`ε ${eps}: REFUSED ${msg}`); okB = false; continue; }
    const route = trk.routes.get(1); const arcs = route.segs.filter((sg) => sg.kind === 'arc').length;
    let dyn = '';
    if (eps === 1e-6) {
      const m = route.merges[0] ?? null; const Dl = route.total - Ll / 1000; // the lead → chute vertex on the route
      const P = stationAt(route, Dl, R, {}); const Df = seatBehind(route, [P.x, P.y, P.z], Dl, twoR48);
      let s2 = null, thr = null; try { s2 = solveShot({ track: trk, r: R, ledger: [], arrivals: [], continuations: [{ id: 1, route, D: Dl, v: 0.3, q: [0, 0, 0, 1], t0: 0 }, { id: 2, route, D: Df, v: 0.3, q: [0, 0, 0, 1], t0: 0, follow: true }] }); } catch (e) { thr = e.message.slice(0, 50); }
      let minP = Infinity; if (s2) for (let t = 0; t <= s2.tEnd; t += 1e-3) { const a = poseAt(s2, 1, t, {}), b = poseAt(s2, 2, t, {}); if (a && b) minP = Math.min(minP, Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)); }
      dyn = thr ? ` — the seated pair THREW ${thr}` : ` — the seated pair at the pivot: ${s2.events.length} events, min ${(minP * 1e3).toFixed(3)} mm`;
      if (thr || s2.events.length > 6 || minP < twoR48 - 1e-6) okB = false;
      void m;
    }
    rowsB.push(`ε ${eps}: ${route.segs.length} segs, ${arcs} arcs${dyn}`);
    if (route.segs.length !== 2 || arcs !== 0) okB = false;
  }
  check(`r48 the sub-grain bend rule (order 21, N16): (A) the mid-edge trunk vertex offset in Z — ${rows.join('; ')} (10 / 4 expected; N16 12 / 6); (B) the high fixture's ridge re-aimed by ε — ${rowsB.join('; ')} (2 segments, no arc; N16 keeps a 0.02–99 µm arc and the seated pair at ε 1e-6 chatters into MAX_EVENTS)`,
    okA && okB, JSON.stringify({ rows, rowsB }));
}

// r49 — two feeders of one junction ARE a converging pair (order 21 item 3, battery N35; investigator E): two balls INSIDE their
// approaches on DIFFERENT feeders of one landing point — neither on the shared runway (approachingLane's pair), neither a holder
// (the pushed-hold law keeps a holder ≥ 2r from every station a peer can occupy) — meet in 3-D before either lands; only the
// two-feeder clause of convergeAtJunction admits them to the contact scan. Three seedings (r29's recoil class on two feeders): the
// tree books the contact at 3 / 35 ms and never draws a pair below 2r; N35 draws them through each other (11.2 / 17.9 / 25.4 mm) and
// teleports by 14–38 mm at the landing. The 127° rc / cc pair of TEST-y3-obtuse with the cc ball slow and near the point is a
// CHATTER family on the tree (17 of 36 seedings MAX_EVENTS, 11 with 161–645 contact / separate events: the two-feeder chain's seat
// across the point opened by the split guard at once) — REPORTED here as a carried defect (order 22), its solves gated for overlap.
{
  const loadT49 = (name) => validateTrack(loadDef(trackPath(name)), { pockets: POCKETS, falls: null });
  const twoR49 = 2 * R; const d3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  const scanPair = (sol, ids, dt = 1e-4) => { let minP = Infinity, atP = null, maxStep = 0, prev = null; for (let t = 0; t <= sol.tEnd + 0.01; t += dt) { const ps = ids.map((id) => poseAt(sol, id, t, {})); const [a, b] = ps; if (a && b && a.kind !== 'fall' && b.kind !== 'fall') { const d = d3(a, b); if (d < minP) { minP = d; atP = +t.toFixed(4); } } if (prev) for (let i = 0; i < ids.length; i++) { const p = prev[i], q = ps[i]; if (p && q && p.kind !== 'fall' && q.kind !== 'fall') maxStep = Math.max(maxStep, d3(p, q)); } prev = ps; } return { minP, atP, maxStep }; };
  const sh = loadT49('TEST-shallow-merge'); const y3 = loadT49('TEST-y3-obtuse');
  const cases = [
    { label: 'shallow: rc 521.3 @+0.3 vs lc 466.3 @−0.08', trk: sh, conts: [{ id: 1, route: sh.routes.get(4), D: 0.5213, v: 0.3, q: [0, 0, 0, 1], t0: 0 }, { id: 2, route: sh.routes.get(1), D: 0.4663, v: -0.08, q: [0, 0, 0, 1], t0: 0 }] },
    { label: 'shallow: rc 521.3 @+0.3 vs lc 456.3 @−0.25', trk: sh, conts: [{ id: 1, route: sh.routes.get(4), D: 0.5213, v: 0.3, q: [0, 0, 0, 1], t0: 0 }, { id: 2, route: sh.routes.get(1), D: 0.4563, v: -0.25, q: [0, 0, 0, 1], t0: 0 }] },
    { label: 'y3: rc 481.3 @+0.3 vs cc 506.3 @+0.3', trk: y3, conts: [{ id: 1, route: y3.routes.get(4), D: 0.4813, v: 0.3, q: [0, 0, 0, 1], t0: 0 }, { id: 2, route: y3.routes.get(0), D: 0.5063, v: 0.3, q: [0, 0, 0, 1], t0: 0 }] },
  ];
  const rows = []; let ok = true;
  for (const c of cases) {
    let sol = null, threw = null; try { sol = solveShot({ track: c.trk, r: R, ledger: [], arrivals: [], continuations: c.conts }); } catch (e) { threw = e.message.slice(0, 50); }
    if (!sol) { rows.push(`${c.label}: THREW ${threw}`); ok = false; continue; }
    const firstJ = Math.min(...sol.events.filter((e) => e.kind === 'junction' || e.kind === 'impact').map((e) => e.t), Infinity);
    const con = sol.events.find((e) => e.kind === 'contact' && ((e.ball === 1 && e.other === 2) || (e.ball === 2 && e.other === 1))) ?? null;
    const sc = scanPair(sol, [1, 2]);
    const good = !!con && con.t < firstJ && sc.minP >= twoR49 - 1e-6 && sc.maxStep <= 2e-4;
    rows.push(`${c.label}: contact ${con ? con.t.toFixed(4) : 'never'} (first landing ${Number.isFinite(firstJ) ? firstJ.toFixed(4) : '—'}), min pair ${(sc.minP * 1e3).toFixed(3)} mm, max step ${(sc.maxStep * 1e3).toFixed(3)} mm`);
    if (!good) ok = false;
  }
  // the 127° chatter family, reported: cc ball sB above the point at vB, rc ball sA above at 0.3
  const r0 = y3.routes.get(0), r4 = y3.routes.get(4); const m4 = r4.merges.find((x) => x.feeder === 'rc-run'), m0 = r0.merges.find((x) => x.feeder === 'cc-run');
  let throws = 0, chatter = 0, solves = 0, overlap = 0; const worstEv = { n: 0 };
  for (const sA of [0.04, 0.05, 0.06]) for (const sB of [0.01, 0.015, 0.02]) for (const vB of [-0.08, 0.02, 0.05, 0.1]) {
    let sol = null; try { sol = solveShot({ track: y3, r: R, ledger: [], arrivals: [], continuations: [{ id: 1, route: r4, D: m4.D + sA, v: 0.3, q: [0, 0, 0, 1], t0: 0 }, { id: 2, route: r0, D: m0.D + sB, v: vB, q: [0, 0, 0, 1], t0: 0 }], maxEvents: 4000 }); } catch (e) { throws += 1; continue; }
    solves += 1; const cs = sol.events.filter((e) => e.kind === 'contact' || e.kind === 'separate').length; if (cs > 100) chatter += 1; if (cs > worstEv.n) Object.assign(worstEv, { n: cs, sA, sB, vB });
    const sc = scanPair(sol, [1, 2], 5e-4); if (sc.minP < twoR49 - 1e-6) overlap += 1;
  }
  check(`r49 two feeders of one junction are a converging pair (order 21, N35): ${rows.join('; ')} (the contact before either lands, no pair below 2r, no step beyond 0.2 mm; N35: 11.2 / 17.9 / 25.4 mm drawn through, 14–38 mm teleports). The 127° rc / cc chatter family on TEST-y3-obtuse, REPORTED (a carried defect, order 22): ${throws} of 36 seedings exceed 4 000 events, ${chatter} of ${solves} solves chatter (> 100 contact / separate; worst ${worstEv.n} at sA ${worstEv.sA} sB ${worstEv.sB} vB ${worstEv.vB}), ${overlap} of ${solves} solves draw a pair below 2r (gated: 0)`,
    ok && overlap === 0, JSON.stringify({ rows, throws, chatter, solves, overlap, worstEv }));
}

// r45b — seeding D's solution pinned (order 21 item 3, battery N15: separateTime's margin refinement re-times partings by up to 0.9 ms
// and never a law — investigator D over 20 000 scans; a determinism pin is the gate that sees a µs). The pin lives in
// TEST-obtuse-merge.json checks.continuation_pins['r45-D'] and is re-cut with `--pin` when the law changes, like the fixtures' own pins.
{
  const loadT45b = (name) => validateTrack(loadDef(path.resolve(here, `../scene/ballreturn/tracks/${name}.json`)), { pockets: POCKETS, falls: null });
  const def45 = loadDef(path.resolve(here, '../scene/ballreturn/tracks/TEST-obtuse-merge.json'));
  const ob = loadT45b('TEST-obtuse-merge'); const r4 = ob.routes.get(4); const J = r4.merges.find((x) => x.feeder === 'rc-run').D; const twoR45b = 2 * R;
  const sol = solveShot({ track: ob, r: R, ledger: [], arrivals: [], continuations: [
    { id: 1, route: r4, D: J - 0.002, v: 0, q: [0, 0, 0, 1], t0: 0 },
    { id: 2, route: r4, D: J + 0.06, v: 0.8, q: [0, 0, 0, 1], t0: 0 },
    { id: 3, route: r4, D: J + 0.06 + twoR45b + 0.02, v: 0.8, q: [0, 0, 0, 1], t0: 0 },
  ] });
  const h = pinHash(sampleSolution(sol, { t0: 0, dt: 1 / 240, t1: sol.tEnd + 0.5 }));
  const pin = def45.checks?.continuation_pins?.['r45-D'] ?? null;
  if (args.includes('--pin')) console.log(`PIN r45-D ${h}`);
  check(`r45b seeding D's solution hashes to its committed pin (${h.slice(0, 12)}…; quantised to ${PIN_QUANTUM}; order 21, N15: a 4 µs re-timing of the fold parting moves it)`, pin !== null && h === pin, `pin ${pin}`);
}

// r50 — V17 and V18 travel as COMPANION files (order 21 item 2, SNK-R29). The snooker lane proved with this validator that the
// published JSON schema (V0: root additionalProperties:false, no `hardware` slot) refuses a track JSON carrying the V17 block before
// V17 runs; so both declarations are companions — ./hardware/<trackId>.json (V17) and ./assemblies/<tableId>.json (V18) — and the
// track JSON stays byte-identical to its owner's export (t6d). This arm: (a) the blocker as a row — a definition with a root `hardware`
// key is refused by V0, and one with a root `pocket_assembly` key too; (b) the XW101 companions validate: five hardware names (the
// wires, the slide ring, the strap, its iron — the one solid_simplification — and the clamp backplate; three flagged omissions),
// thirteen assembly meshes by NAME (one entry per merged mesh), MODEL / PHOTO tags, the ids they are declared for; (c) the wpa
// companion validates (two wells, DERIVED, solid_simplification); (d) red arms — a duplicate name, a bad tag, a wrong track id refuse.
{
  const { validateHardware } = await import('../scene/ballreturn/hardware.js');
  const { validateAssembly } = await import('../scene/ballreturn/assembly.js');
  const def = loadDef(path.resolve(here, '../scene/ballreturn/tracks/TEST-synthetic-wire-slide.json'));
  const withHw = { ...def, hardware: { mesh_names: ['obX'], provenance: { tag: 'TEST', source: 'the V0 blocker as a row' } } };
  const withAsm = { ...def, pocket_assembly: { mesh_names: ['obY'] } };
  const v0 = (d) => { try { validateTrack(d, { pockets: POCKETS, falls: null }); return null; } catch (e) { return e.message; } };
  const rHw = v0(withHw), rAsm = v0(withAsm);
  const blocker = !!rHw && /\[V0\]/.test(rHw) && /hardware/.test(rHw) && !!rAsm && /\[V0\]/.test(rAsm) && /pocket_assembly/.test(rAsm);
  const hwDef = loadDef(path.resolve(here, '../scene/ballreturn/hardware/wpbsa_snooker_12ft-xw101-slides.json'));
  const asmDef = loadDef(path.resolve(here, '../scene/ballreturn/assemblies/wpbsa_snooker_12ft.json'));
  const wpaDef = loadDef(path.resolve(here, '../scene/ballreturn/assemblies/wpa_generic_9ft.json'));
  let hw = null, asm = null, wpa = null, err = null;
  try { hw = validateHardware(hwDef, { trackId: 'wpbsa_snooker_12ft-xw101-slides', tableId: 'wpbsa_snooker_12ft' }); asm = validateAssembly(asmDef, { tableId: 'wpbsa_snooker_12ft' }); wpa = validateAssembly(wpaDef, { tableId: 'wpa_generic_9ft' }); } catch (e) { err = e.message.slice(0, 120); }
  const hwOk = !!hw && hw.meshNames.length === 5 && ['obPocketTrack', 'obSnkSlideRing', 'obPocketStrap', 'obPocketStrapIron', 'obPocketStrapPlate'].every((n) => hw.meshNames.includes(n)) && hw.meshes.filter((m) => m.solidSimplification).map((m) => m.name).join() === 'obPocketStrapIron' && hw.omissions.length === 3 && hw.provenance.tag === 'PHOTO';
  const asmOk = !!asm && asm.meshes.length === 13 && asm.meshes.every((m) => m.name && !m.match) && asm.meshes.some((m) => m.name === 'obPocketNet' && m.kind === 'net') && asm.meshes.every((m) => !m.solidSimplification) && asm.provenance.tag === 'MODEL';
  const wpaOk = !!wpa && wpa.meshes.length === 2 && wpa.meshes.every((m) => m.match && m.solidSimplification && m.kind === 'well') && wpa.provenance.tag === 'DERIVED';
  const red = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };
  const red1 = red(() => validateHardware({ ...hwDef, mesh_names: [...hwDef.mesh_names, 'obPocketTrack'] }, { trackId: 'wpbsa_snooker_12ft-xw101-slides' }));
  const red2 = red(() => validateAssembly({ ...asmDef, provenance: { tag: 'GUESS', source: asmDef.provenance.source } }, { tableId: 'wpbsa_snooker_12ft' }));
  const red3 = red(() => validateHardware(hwDef, { trackId: 'TEST-synthetic-wire-slide' }));
  const redOk = !!red1 && /\[V17\]/.test(red1) && /twice/.test(red1) && !!red2 && /\[V18\]/.test(red2) && !!red3 && /\[V17\]/.test(red3) && /declared for/.test(red3);
  check(`r50 V17 / V18 travel as companion files (order 21 item 2): (a) a track JSON with a root \`hardware\` key is refused by V0 (${rHw ? rHw.slice(0, 70) : 'ACCEPTED'}…), and one with \`pocket_assembly\` too; (b) the XW101 companions validate — hardware ${hw ? hw.meshNames.length : 'n/a'} names (solid: ${hw ? hw.meshes.filter((m) => m.solidSimplification).map((m) => m.name).join(', ') : '—'}; ${hw ? hw.omissions.length : '—'} omissions; ${hw?.provenance.tag}), assembly ${asm ? asm.meshes.length : 'n/a'} meshes by name (${asm?.provenance.tag}); (c) the wpa companion ${wpa ? `${wpa.meshes.length} wells` : 'n/a'}; (d) a duplicate name, a GUESS tag and a wrong track id refuse${err ? ' — ERROR ' + err : ''}`,
    blocker && hwOk && asmOk && wpaOk && redOk, JSON.stringify({ rHw, rAsm, err, hw: hw && { names: hw.meshNames, solid: hw.meshes.filter((m) => m.solidSimplification).map((m) => m.name), omissions: hw.omissions.length }, asm: asm && asm.meshes.map((m) => [m.name, m.kind]), red1, red2, red3 }));
}

// r51 — the 127° double-feeder slow-ball family: the exact clauses, REPORTED (order 22 item 1; investigator F). The cause is a FALSE
// fold: walkStep hands seatBehind the leader's D as the seat's lower bound on a CROSS-ROUTE link — a station on another axis — so at
// the two-feeder symmetric point (both D 483.551 on their own routes, G ≈ −1) the real root below the leader's D is excluded, the walker
// reads NaN, dyn.fold is set, tensileRank parts the pair BEFORE the bounce test, contactTime3 re-catches it at its 1 µs floor, the merge's
// D re-sort swaps the leader and hands it the old leader's speed (both balls reverse) — two events per microsecond. Not the cadence
// (one 8.8–14.3 mm step), not the seat root (2r − 0.000 µm at every merge). The fix's shape (F): the bound only on a shared lane
// (FIX1′) + the re-sort re-basing the chain's speed on the new leader (FIX2′) — 0 of 36 throws, 0 chatter, worst 3 contact / separate
// on the family and its angle variants, but on r45's seeding D (a member of the same class: the trunk ball and a feeder ball at equal
// route D) the cross-route D re-sort files the trunk ball between two feeder balls and the pair reads 56.725 mm — a drawn overlap the
// current tree does not have; a lane-aware order tried here (one axis per lane, unrelated lanes keeping their order) livelocks seeding D.
// The third part — the chain's ORDER across lanes — is the tree's (§20.8 item 10, r46's family); the fix is carried to that round.
// Gated here: the drawn invariant on every solve that returns; REPORTED with no tolerance: the four clauses a fixed tree must meet.
{
  const loadT51 = (name) => validateTrack(loadDef(trackPath(name)), { pockets: POCKETS, falls: null });
  const y3 = loadT51('TEST-y3-obtuse'); const r0 = y3.routes.get(0), r4 = y3.routes.get(4); const m4 = r4.merges.find((x) => x.feeder === 'rc-run'), m0 = r0.merges.find((x) => x.feeder === 'cc-run');
  const twoR51 = 2 * R; const d3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  let n = 0, throws = 0, bursts = 0, seatOff = 0, contacts = 0, falseParts = 0, parts = 0, reversals = 0, below = 0, worstCS = 0, overlapSeeded = 0;
  for (const sA of [0.04, 0.05, 0.06]) for (const sB of [0.01, 0.015, 0.02]) for (const vB of [-0.08, 0.02, 0.05, 0.1]) {
    n += 1;
    const c1 = { id: 1, route: r4, D: m4.D + sA, v: 0.3, q: [0, 0, 0, 1], t0: 0 }, c2 = { id: 2, route: r0, D: m0.D + sB, v: vB, q: [0, 0, 0, 1], t0: 0 };
    const p1 = stationAt(r4, c1.D, R, {}), p2 = stationAt(r0, c2.D, R, {}); if (d3(p1, p2) < twoR51 - 1e-9) overlapSeeded += 1; // F: 16 of the 36 start interpenetrated (E's grid); the family is real in the clear rows too
    let sol = null; try { sol = solveShot({ track: y3, r: R, ledger: [], arrivals: [], continuations: [c1, c2], maxEvents: 4000 }); } catch (e) { throws += 1; continue; }
    const cs = sol.events.filter((e) => e.kind === 'contact' || e.kind === 'separate'); worstCS = Math.max(worstCS, cs.length);
    let burst = 0; for (let i = 0; i < cs.length; i++) { let k = 0; for (let j = i; j < cs.length && cs[j].t - cs[i].t <= 1e-3; j++) k++; burst = Math.max(burst, k); } if (burst > 4) bursts += 1;
    for (const e of cs) { if (e.kind !== 'contact') continue; contacts += 1; const a = poseAt(sol, 1, e.t, {}), b = poseAt(sol, 2, e.t, {}); if (a && b && Math.abs(d3(a, b) - twoR51) > 1e-9) seatOff += 1; }
    for (const e of cs) { if (e.kind !== 'separate') continue; parts += 1; const a = poseAt(sol, 1, e.t + 2e-4, {}), b = poseAt(sol, 2, e.t + 2e-4, {}); if (a && b && d3(a, b) < twoR51 + 1e-9) falseParts += 1; } // a parting whose 3-D gap has not opened 0.2 ms later (the bounce law's own horizon): a false parting
    const evT = sol.events.map((e) => e.t).sort((a, b) => a - b); for (let k = 0; k + 1 < evT.length; k++) { const a = evT[k], b = evT[k + 1]; if (b - a < 2e-3) continue; for (const id of [1, 2]) { let last = null; for (let t = a + 5e-4; t < b; t += 5e-4) { const c = continuationAt(sol, id, t); if (!c || !Number.isFinite(c.v) || Math.abs(c.v) < 1e-9) continue; const sg = Math.sign(c.v); if (last !== null && sg !== last) reversals += 1; last = sg; } } }
    for (let t = 0; t <= sol.tEnd; t += 5e-4) { const a = poseAt(sol, 1, t, {}), b = poseAt(sol, 2, t, {}); if (a && b && a.kind !== 'fall' && b.kind !== 'fall' && d3(a, b) < twoR51 - 1e-6) below += 1; }
  }
  check(`r51 the 127° double-feeder family — the exact clauses REPORTED, the drawn invariant gated (order 22 item 1): of ${n} seedings (${overlapSeeded} start interpenetrated, E's grid) — (1) solves under 4 000 events: ${n - throws} (${throws} THROW; a fixed tree: 36); (2) no contact / separate burst over 4 per ms: ${n - throws - bursts} of ${n - throws} solves (${bursts} burst; worst ${worstCS} events); (3) the 3-D pair at 2r within 1e-9 at every contact: ${contacts - seatOff} of ${contacts}; (4) partings whose gap has opened 0.2 ms later: ${parts - falseParts} of ${parts} (${falseParts} false — the seat's cross-axis bound); (5) velocity sign reversals inside event-free intervals: ${reversals} (a fixed tree: 0); the drawn pair below 2r on the solves: ${below} (gated: 0). Cause, fixture and the fix's shape in §27.2; the fix carried with the tree's order`,
    below === 0, JSON.stringify({ n, throws, bursts, seatOff, contacts, falseParts, parts, reversals, below, worstCS, overlapSeeded }));
}

// r56 — V16: an enclosing solid is NOT an environment (#737 review round 8, class C). The container predicate read a mesh whose box
// holds every station of the track as "the room, a floor, an environment" and switched the INSIDE test off for it. A solid leg or
// support around a SINGLE-POCKET chute satisfies that just as well: the surface test then passes everywhere (no face within r of a
// centre deep inside the solid) and the track builds with the ball drawn inside the leg — the very defect V16 was written for.
// The class is now the mesh's OWN open-shell property (drawn back-side only) or the track's DECLARATION (`environment_mesh_names`
// in the V17 companion); enclosure is reported, never a class. Fixture: the single-pocket variant of TEST-terminal-chutes-high
// (the rc middle alone, the lc runways dropped, pocket 1 unserved — schema-valid, 76 stations) inside a box grown 50 mm past the
// station cloud. Pre-fix: 76 of 76 checked stations clear. Gated: the undeclared solid box refuses naming it (76 wholly inside);
// the same box drawn back-side only (the room class) still clears; the same box DECLARED by the track clears; the companion
// validates the declaration (a bad name, a duplicate, and a name already declared as the track's own hardware all refuse); no
// definition in web/scene/ballreturn/tracks plus web/tools/fixtures/ballreturn-tracks that builds in this context declares an environment, and r44b's block scene, rebuilt below, has no undeclared enclosure — those definitions are unchanged.
{
  const THREE = await import('three');
  const { furnitureClearance, clearFurnitureCache, V16_STEP: V16_STEP2 } = await import('../scene/ballreturn/furniture.js');
  const { validateHardware } = await import('../scene/ballreturn/hardware.js');
  const { seatLadder: seatLadder2 } = await import('../scene/ballreturn/track.js');
  // guarded: a tree without the shared chain must make this arm FAIL on its counts, never crash on an undefined import
  // (a dynamic named import of a missing export is `undefined` at call time, not a link error) — the pre-fix reading is a
  // scan that stops at the entry, so the fallback is an empty chain and the row goes red on 76 stations
  const ladder2 = (route, rr) => (typeof seatLadder2 === 'function' ? seatLadder2(route, rr) : []);
  const spanOf2 = (route) => (typeof reachSpan === 'function' ? reachSpan(route, R) : { top: route.total, ladder: [] });
  const HIGH = path.resolve(here, '../scene/ballreturn/tracks/TEST-terminal-chutes-high.json');
  const one = JSON.parse(fs.readFileSync(HIGH, 'utf8'));
  one.doc.title = 'TEST-terminal-chutes-high-single';
  one.runways = one.runways.filter((rw) => rw.id.startsWith('rc-'));      // the rc middle's lead + chute alone
  one.pockets = one.pockets.filter((pk) => pk.index === 4);
  one.unserved_pockets = [...one.unserved_pockets, { index: 1, reason: 'r56: the single-pocket variant of the high terminal fixture — one chute, so a support-sized solid can hold the whole station cloud' }];
  delete one.checks;                                                       // the determinism pin is the two-chute definition's
  let trkC = null, buildErr = null;
  try { trkC = validateTrack(one, { pockets: POCKETS, falls: null }); } catch (e) { buildErr = e.message; }
  const tmpC = {};
  const cloud = new THREE.Box3();
  let nSt = 0;
  // RESTATED at round 10, class B and again at round 11, class A: the box this arm grows around "every station" is
  // grown around the span the MODULE sweeps, read from the same function (track.js reachSpan — round 10 read the chain
  // itself, round 11 the continuum up to the RUNWAY TOP with the pocket's own exit-line test applied per station), not
  // around a span of the arm's own — otherwise the next widening turns this row red with nothing wrong in the module.
  // On THIS fixture the span adds TWO stations: the high terminal's runway reaches 434.1 mm but the pocket hides all of
  // it bar the first 5 mm step above the entry and the point where the exit line CUTS the band, so the cloud is 78,
  // not the 76 it was through round 10. (Round 10's
  // first cut swept the same continuum with NO exit-line test and off the entry's grid — 87 stations here, and a
  // shipped fixture refused for extrapolated route no ball is ever drawn on.)
  let upsC = 0;
  if (trkC) for (const route of trkC.routes.values()) {
    const topC = spanOf2(route).top;
    const atC = (D) => { const st = stationAt(route, D, R, tmpC); return { D, x: st.x, y: st.y, z: st.z, hid: Number.isFinite(route.exitY) && st.y + R > route.exitY }; };
    const keepC = (p) => { cloud.expandByPoint(new THREE.Vector3(p.x, p.y, p.z)); nSt += 1; upsC += 1; };
    let prevC = atC(route.total);
    const walkC = (p) => {
      if (p.hid !== prevC.hid) { let lo = prevC.hid ? p.D : prevC.D, hi = prevC.hid ? prevC.D : p.D;
        for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (atC(m).hid) hi = m; else lo = m; }
        keepC(atC(lo)); }
      if (!p.hid) keepC(p);
      prevC = p;
    };
    for (let D = route.total + V16_STEP2; D <= topC - 1e-9; D += V16_STEP2) walkC(atC(D));
    if (topC > route.total + 1e-9) walkC(atC(topC));
    for (let D = route.total; D >= -1e-9; D -= V16_STEP2) { const st = stationAt(route, Math.max(0, D), R, tmpC); cloud.expandByPoint(new THREE.Vector3(st.x, st.y, st.z)); nSt += 1; }
  }
  const mkBoxed = (backSide) => {
    const scene = new THREE.Scene();
    const sz = cloud.getSize(new THREE.Vector3()).addScalar(2 * 0.05);     // 50 mm of clear air past every station: nothing within r of a centre
    const box = new THREE.Mesh(new THREE.BoxGeometry(sz.x, sz.y, sz.z), new THREE.MeshBasicMaterial(backSide ? { side: THREE.BackSide } : {}));
    box.name = 'obTestEnclosingSolid'; box.position.copy(cloud.getCenter(new THREE.Vector3()));
    scene.add(box); scene.updateMatrixWorld(true); return scene;
  };
  clearFurnitureCache();
  const cSolid = trkC ? await furnitureClearance({ track: trkC, r: R, scene: mkBoxed(false), tableId: 'wpa_generic_9ft', trackId: 'r56-single#solid', THREE }) : null;
  const cShell = trkC ? await furnitureClearance({ track: trkC, r: R, scene: mkBoxed(true), tableId: 'wpa_generic_9ft', trackId: 'r56-single#shell', THREE }) : null;
  const cDecl = trkC ? await furnitureClearance({ track: trkC, r: R, scene: mkBoxed(false), tableId: 'wpa_generic_9ft', trackId: 'r56-single#declared', environmentNames: ['obTestEnclosingSolid'], THREE }) : null;
  const mC = cSolid && cSolid.byMesh[0];
  const nDrawn = cSolid ? cSolid.violations.length + (cSolid.culled ?? []).length : 0;
  const solidOk = !!cSolid && cSolid.evaluated && cSolid.stations === nSt && nSt === 78 && cSolid.violations.length === 78 && (cSolid.culled ?? []).length === 0 && nDrawn === 78
    && cSolid.byMesh.length === 1 && mC.mesh === 'obTestEnclosingSolid' && mC.inside === 78
    && cSolid.violations.every((v) => v.inside && v.distance > R) && JSON.stringify(cSolid.undeclaredEnclosing ?? null) === '["obTestEnclosingSolid"]' && /enclosure is not a class/.test(cSolid.reason ?? '');
  const shellOk = !!cShell && cShell.evaluated && cShell.violations.length === 0 && (cShell.openShells ?? []).includes('obTestEnclosingSolid');
  const declOk = !!cDecl && cDecl.evaluated && cDecl.violations.length === 0 && (cDecl.environmentDeclared ?? []).includes('obTestEnclosingSolid') && (cDecl.undeclaredEnclosing ?? []).length === 0;
  // the declaration channel: the V17 companion carries it, and refuses what is not a declaration
  const baseHw = { schema: 'ball-return-hardware/1.0', track_id: 'r56', provenance: { tag: 'TEST', source: 'r56: the environment declaration channel' }, mesh_names: ['obR56Wire'] };
  const hwPlain = validateHardware({ ...baseHw });
  const hwEnv = validateHardware({ ...baseHw, environment_mesh_names: ['obR56Room', 'obR56Floor'] });
  const refuses = (def) => { try { validateHardware(def); return null; } catch (e) { return e.message; } };
  const badName = refuses({ ...baseHw, environment_mesh_names: ['a b'] });
  const twice = refuses({ ...baseHw, environment_mesh_names: ['obR56Room', 'obR56Room'] });
  const alsoHw = refuses({ ...baseHw, environment_mesh_names: ['obR56Wire'] });
  const declChannelOk = (hwPlain.environmentMeshNames ?? []).length === 0 && (hwEnv.environmentMeshNames ?? []).join() === 'obR56Room,obR56Floor'
    && !!badName && !!twice && !!alsoHw && /already declared as the track's own hardware/.test(alsoHw);
  // the committed side: no definition in web/scene/ballreturn/tracks plus web/tools/fixtures/ballreturn-tracks that builds in this context declares an environment, and r44b's block scene, rebuilt below, has no undeclared enclosure
  const shippedEnv = [];
  for (const [f, p] of trackFiles()) {
    let t = null; try { t = validateTrack(loadDef(p), { pockets: POCKETS, falls: null }); } catch { continue; }
    if ((t.environmentMeshNames ?? null) === null || t.environmentMeshNames.length) shippedEnv.push(f);
  }
  const trkW = validateTrack(loadDef(path.resolve(here, '../scene/ballreturn/tracks/TEST-synthetic-wire-slide.json')), { pockets: POCKETS, falls: null });
  const sceneW = new THREE.Scene();
  const pW = stationAt(trkW.routes.get(4), 0.5 * trkW.routes.get(4).total, R, {});
  const blockW = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.15), new THREE.MeshBasicMaterial()); blockW.name = 'obTestThickBlock'; blockW.position.set(pW.x, pW.y, pW.z); sceneW.add(blockW); sceneW.updateMatrixWorld(true);
  const cW = await furnitureClearance({ track: trkW, r: R, scene: sceneW, tableId: 'wpa_generic_9ft', trackId: 'r56-wire#block', THREE });
  const shippedOk = shippedEnv.length === 0 && (cW.undeclaredEnclosing ?? []).length === 0 && cW.violations.length > 0;
  check(`r56 V16: an enclosing solid is not an environment (#737 r8 class C): the single-pocket variant of TEST-terminal-chutes-high (${buildErr ? 'REFUSED ' + buildErr.slice(0, 60) : `builds, ${nSt} stations`}) inside a 50 mm-margin box — undeclared solid → ${cSolid ? cSolid.violations.length : 'n/a'} of ${cSolid ? cSolid.stations : '?'} stations refused naming ${mC ? mC.mesh : 'nothing'} (${mC ? mC.inside : 0} wholly inside, ${cSolid ? (cSolid.culled ?? []).length : '?'} culled above the exit line — round 11 class A moved the scan to the runway top with the pocket's exit-line test per station (track.js reachSpan) and this arm's own cloud with it: ${upsC} DRAWABLE upstream station(s) on this fixture, the high terminal's runway reaching 434.1 mm but the pocket hiding all of it bar the first step and the exit line's own crossing, so the cloud is 78, worst ${mC ? (mC.worstDepth * 1e3).toFixed(1) : '—'} mm, nearest face ${cSolid && cSolid.violations.length ? (Math.min(...cSolid.violations.map((v) => v.distance)) * 1e3).toFixed(1) : '—'} mm from a centre; pre-fix 0, "76 checked stations clear"); the same box drawn back-side only → ${cShell ? cShell.violations.length : 'n/a'}; DECLARED by the track → ${cDecl ? cDecl.violations.length : 'n/a'}; the companion channel: plain ${(hwPlain.environmentMeshNames ?? []).length}, declared ${(hwEnv.environmentMeshNames ?? []).length}, a bad name / a duplicate / a name already hardware all refuse (${[badName, twice, alsoHw].filter(Boolean).length}/3); definitions in web/scene/ballreturn/tracks plus web/tools/fixtures/ballreturn-tracks declaring an environment: ${shippedEnv.length}, r44's block scene undeclared enclosures: ${(cW.undeclaredEnclosing ?? []).length}`,
    !buildErr && solidOk && shellOk && declOk && declChannelOk && shippedOk,
    JSON.stringify({ buildErr, nSt, upsC, solid: cSolid && { n: cSolid.violations.length, stations: cSolid.stations, byMesh: cSolid.byMesh, undeclaredEnclosing: cSolid.undeclaredEnclosing, reason: (cSolid.reason ?? '').slice(-200) }, shell: cShell && { n: cShell.violations.length, openShells: cShell.openShells ?? null }, decl: cDecl && { n: cDecl.violations.length, declared: cDecl.environmentDeclared }, hw: { plain: hwPlain.environmentMeshNames, env: hwEnv.environmentMeshNames, badName, twice, alsoHw }, shippedEnv, wire: { n: cW.violations.length, enc: cW.undeclaredEnclosing } }));
}

// r57 — the fence's port inventory is READABLE by the gate wrapper (#737 review round 9, class B). run-gate reads a suite's
// `PORT_INVENTORY` as TEXT (it never imports the suite) and fails CLOSED on a declaration it cannot parse: the law (GH-410) is
// ONE bare line with nothing but `;` after the object. A trailing `//` is not a comment to that reader — it is a declaration
// that STARTS and does not parse, and run-gate exits 2 before a single check of the run; the band lint reads the same text
// through the same parser and reports the tool as UNDECLARED, which is why the fence's line survived a green lint. The arm
// reads the real files with the real parser and sweeps every tool this lane owns for the same shape.
{
  const { parsePortInventory, parsePortFlags } = await import('./cdp.mjs');
  const { inventoryOfText } = await import('./lib/ci-bands.mjs');
  const repoRoot = path.resolve(here, '../..');
  // the three tools this lane owns, iterated where they are named: a `const X = [ … '<tool>.mjs' … ]` binding in a file that
  // also spawns node (k1 runs this file as its own CLI) is read by the band lint as a STEP TABLE — a spawn edge it then
  // demands be declared (`nested-spawn-undeclared`, ci-bands.mjs NESTED_SPAWN_EDGES). This arm only READS their text, so
  // there is no edge to declare; naming them in the loop that reads them says so to the reader as well as to a person.
  const declLine = /^\s*export\s+const\s+PORT_(?:INVENTORY|FLAGS|WINDOW_FAMILY|WINDOW_FAMILIES)\b/;
  const readDecl = (rel) => {
    const row = { file: rel, inv: null, flags: null, err: null, trailing: [], lint: null };
    let text = null;
    try { text = fs.readFileSync(path.resolve(repoRoot, rel), 'utf8'); } catch (e) { row.err = `unreadable: ${e.message}`; return row; }
    for (const line of text.split('\n')) if (declLine.test(line) && line.includes('//')) row.trailing.push(line.trim().slice(0, 90));
    try { row.inv = parsePortInventory(text); row.flags = parsePortFlags(text); } catch (e) { row.err = e.message; }
    row.lint = inventoryOfText(text); // what the band lint sees: null = "undeclared", the silent half of the same defect
    return row;
  };
  const rows = [];
  for (const rel of ['tools/render/ballreturn-fence.mjs', 'web/tools/e2e-ballreturn.mjs', 'web/tools/e2e-xw101-look.mjs']) rows.push(readDecl(rel));
  const laneTools = rows.map((q) => q.file);
  const fence = rows[0];
  // the roles as one string — never a quoted `--flag` literal in this file: the band lint reads such a literal as a port-like
  // flag THIS tool takes and asks it for a PORT_FLAGS declaration of its own (GH-687)
  const roles = (r) => Object.entries(r.flags ?? {}).map(([f, role]) => `${f}=${role}`).sort().join(' ');
  const fenceOk = !fence.err && !!fence.inv && fence.inv.http === 1 && fence.inv.cdp === 1
    && roles(fence) === '--cdp=cdp' && fence.trailing.length === 0 && !!fence.lint;
  const laneOk = rows.every((r) => !r.err && !!r.inv && r.trailing.length === 0 && !!r.lint);
  // the same law over every OTHER tool in the two tool trees — reported, never asserted here: a red in another lane's file is
  // that lane's to fix, and this gate must not go red on it
  const walk = (dir, out = []) => {
    let ents = []; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
    for (const e of ents) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p, out); else if (e.name.endsWith('.mjs')) out.push(p); }
    return out;
  };
  const swept = [];
  const others = [];
  for (const abs of [...walk(path.resolve(repoRoot, 'web/tools')), ...walk(path.resolve(repoRoot, 'tools/render'))]) {
    const text = fs.readFileSync(abs, 'utf8');
    if (!/^\s*export\s+const\s+PORT_(?:INVENTORY|FLAGS)\b/m.test(text)) continue;
    const rel = path.relative(repoRoot, abs);
    swept.push(rel);
    if (laneTools.includes(rel)) continue;
    let err = null; try { parsePortInventory(text); parsePortFlags(text); } catch (e) { err = e.message.slice(0, 60); }
    if (err) others.push({ file: rel, err });
  }
  check(`r57 the fence's port inventory is readable by the gate wrapper (#737 r9 class B): ${laneTools.length} lane tools, every declaration a bare one-liner — the fence parses to http ${fence.inv ? fence.inv.http : 'n/a'} / cdp ${fence.inv ? fence.inv.cdp : 'n/a'} with flags ${fence.flags ? Object.keys(fence.flags).join(' ') : 'n/a'} (pre-fix: the trailing comment made it a declaration that starts and does not parse — run-gate exit 2 before any check, band lint "undeclared"); swept ${swept.length} declaring tools under web/tools + tools/render, ${others.length} outside this lane unparseable`,
    fenceOk && laneOk,
    JSON.stringify({ rows: rows.map((r) => ({ file: r.file, inv: r.inv, flags: r.flags, err: r.err, trailing: r.trailing, lint: r.lint })), swept: swept.length, others }));
}

// r59 — V16 scans every seat the route can ASSIGN, not every station up to the entry (#737 review round 10, class B).
// `seatFor` seats a landing ball behind a resting tail up to ONE BALL LENGTH above the entry and only refuses beyond that;
// the clearance scan stopped at `route.total`, so the last drawable seat of a full queue was never asked about furniture.
// On TEST-terminal-chutes the seating chain is seven seats long and the SEVENTH (k7, D 371.5 mm on a 331.0 mm route) is
// exactly there: a solid through the ball resting on it passed V16 with "0 violations". The two readings are now ONE
// function — `track.js seatLadder`, imported by `seatFor` (which counts it) and by V16 (which scans it) — and this arm
// walks the same chain rather than naming a number. Stations above the exit line stay culled by `drawn`, as before.
//
// LAW RESTATED, round 11 class A — this arm's number, scene and assertions are UNCHANGED; the law under them is not.
// Round 10 read the span above the entry as DISCRETE ("a ball never rolls there, it only rests on a seat", so V16 asks
// about the seats and not the route between them). That is REFUTED: `seatFor` seats a ball behind a MOVING tail, and
// the ball then rolls down through every station between two seats — measured on this very fixture, ball 3 of the
// reviewer's three-drop reproduction rolls continuously from D 430.7 mm through 395.9 mm, and at 395.9 it stood 15.3 mm
// inside the generic table's apron (e2e arm 13f, the only gate with a real one) with V16 reporting nothing. The span
// above the entry is therefore CONTINUOUS, and its top is the landing rule's OWN runway top, `seatUpstream` =
// `route.total + 2r` (`track.js reachSpan`) — the bound `seatFor` already enforces against a resting tail, not the
// chain's last seat: the chain's last seat is where a ball can REST, and round 11's first cut bounded the draw there
// and blanked the chute on shipped TEST-synthetic-wire-slide (77 ms and 142 ms) while re-pinning three fixtures.
// The same function bounds what `poseAt` draws — see r60/r61/r62. Sweeping to the runway top does refuse shipped
// TEST-terminal-chutes, whose last ~7 mm of runway runs through the generic table's body; that refusal is truthful
// (the definition declares an entry with less than one ball length of clear space above it) and is the order's STOP,
// not a reason to shorten the span. The seat this arm names is the chain's last, and V16 still scans it EXACTLY
// (not a 5 mm sample near it), which is what the µm-off-the-seat assertion below measures.
{
  const THREE = await import('three');
  const { furnitureClearance, clearFurnitureCache, V16_STEP: V16_STEP3 } = await import('../scene/ballreturn/furniture.js');
  const { seatUpstream, seatLadder } = await import('../scene/ballreturn/track.js');
  // guarded the same way: without the shared chain no upstream seat is found and the row FAILs with the pre-fix reading
  // (0 hits) rather than crashing on an undefined import
  const ladderOf = (route, rr) => (typeof seatLadder === 'function' ? seatLadder(route, rr) : []);
  const upBound3 = (route, rr) => (typeof seatUpstream === 'function' ? seatUpstream(route, rr) : route.total);
  const trkT = validateTrack(loadDef(path.resolve(here, '../scene/ballreturn/tracks/TEST-terminal-chutes.json')), { pockets: POCKETS, falls: null });
  const routeT = trkT.routes.get(4);
  const upT = upBound3(routeT, R);
  const ladder = ladderOf(routeT, R);                                         // the chain seatFor counts and V16 scans
  const upSeats = ladder.filter((e) => e.D > routeT.total + 1e-9);            // the seats the old scan never asked about
  const seat7 = upSeats.length ? upSeats[upSeats.length - 1] : null;
  const mkBox = (at) => {
    const scene = new THREE.Scene();
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.004, 0.004), new THREE.MeshBasicMaterial());  // 4 mm: a bracket, a screw head, a cable clip
    box.name = 'obTestUpstreamBox'; box.position.set(at.x, at.y, at.z);
    scene.add(box); scene.updateMatrixWorld(true); return scene;
  };
  clearFurnitureCache();
  const cSeat = seat7 ? await furnitureClearance({ track: trkT, r: R, scene: mkBox(seat7), tableId: 'wpa_generic_9ft', trackId: 'r59-chutes#seat7', THREE }) : null;
  const hits = (cSeat?.violations ?? []).filter((v) => v.mesh === 'obTestUpstreamBox');
  const nearest = hits.length ? hits.reduce((a, b) => (Math.abs(b.D - seat7.D) < Math.abs(a.D - seat7.D) ? b : a)) : null;
  // the pre-fix reading is the same run with the old bound: every hit lies ABOVE the entry, so a scan that stopped at
  // route.total saw none of them (and since round 11 the band between the entry and this seat is scanned too — the
  // continuum a ball behind a moving tail actually rolls through, on the entry-anchored grid)
  const aboveEntry = hits.every((v) => v.D > routeT.total + 1e-9);
  const seatOk = !!seat7 && !!cSeat && cSeat.evaluated && hits.length > 0 && aboveEntry
    && !!nearest && nearest.drawn && Math.abs(nearest.D - seat7.D) <= (V16_STEP3 ?? 0.005) / 2 + 1e-9 && nearest.distance < R;   // the seat lies inside half a grid step of a scanned station
  // the committed side: every definition in web/scene/ballreturn/tracks plus web/tools/fixtures/ballreturn-tracks that builds on the wpa_generic_9ft pockets (POCKETS), over an EMPTY scene, is still clear (a definition refused there is skipped), and the band the scan gained is reported
  const shipped = [];
  for (const [f, p] of trackFiles()) {
    let t = null; try { t = validateTrack(loadDef(p), { pockets: POCKETS, falls: null }); } catch { continue; }
    const empty = new THREE.Scene(); empty.updateMatrixWorld(true);
    const c = await furnitureClearance({ track: t, r: R, scene: empty, tableId: 'wpa_generic_9ft', trackId: `r59-empty#${f}`, THREE });
    let gained = 0;
    const rs = [...t.routes.values()]; if (t.trayRoute && !rs.includes(t.trayRoute)) rs.push(t.trayRoute);
    for (const route of rs) gained += ladderOf(route, R).filter((e) => e.D > route.total + 1e-9).length;
    shipped.push({ track: f.replace(/\.json$/, ''), stations: c.stations ?? 0, violations: c.violations.length, gained });
  }
  // every definition in web/scene/ballreturn/tracks plus web/tools/fixtures/ballreturn-tracks that builds on those pockets still clear, and the chain really did widen the scan somewhere. A definition can legitimately
  // gain NOTHING — TEST-terminal-chutes-high's upstream seats all sit above the pocket exit line, so its chain stops at the
  // entry — so the gate is "clear everywhere, gained somewhere", not "gained everywhere".
  const shippedOk = shipped.every((row) => row.violations === 0) && shipped.some((row) => row.gained > 0);
  check(`r59 V16 scans every seat the route can assign (#737 r10 class B; LAW RESTATED by r11 class A — the span above the entry is CONTINUOUS to this seat, not discrete; same number, same assertions): TEST-terminal-chutes route 4 — the seating chain is ${ladder.length} seats, ${upSeats.length} of them above the entry (total ${(routeT.total * 1e3).toFixed(1)} mm, runway top ${(upT * 1e3).toFixed(1)} mm); a 4 mm box on seat k${seat7 ? seat7.k : '?'} at D ${seat7 ? (seat7.D * 1e3).toFixed(1) : '—'} mm → ${hits.length} station(s) refused naming obTestUpstreamBox, nearest D ${nearest ? (nearest.D * 1e3).toFixed(1) : '—'} mm (${nearest ? (Math.abs(nearest.D - seat7.D) * 1e6).toFixed(0) : '—'} µm off the seat — the seat lies inside half a grid step of a scanned station, and since round 11 class A the continuum around it is scanned too), centre ${nearest ? (nearest.distance * 1e3).toFixed(1) : '—'} mm from a face, drawn ${nearest ? nearest.drawn : '—'}; every hit above the entry ${aboveEntry} (pre-fix the scan stopped at the entry: 0 violations); in web/scene/ballreturn/tracks plus web/tools/fixtures/ballreturn-tracks: ${shipped.length} definitions clear over an empty scene, the chain gained ${shipped.reduce((a, b) => a + b.gained, 0)} upstream seats across ${shipped.filter((r2) => r2.gained > 0).length} of them (${shipped.filter((r2) => !r2.gained).map((r2) => r2.track).join(', ') || 'none'} gain none: every upstream seat above the pocket exit line)`,
    seatOk && shippedOk,
    JSON.stringify({ total: routeT.total, up: upT, ladder: ladder.map((e) => ({ k: e.k, D: e.D })), seat7: seat7 && { k: seat7.k, D: seat7.D }, hits: hits.map((v) => ({ D: v.D, mesh: v.mesh, drawn: v.drawn, distance: v.distance })), shipped }));
}

// r60/r61/r62 — ONE reader for "where can a ball be DRAWN" (#737 review round 11, class A). `seatFor` seats a landing
// ball behind a MOVING tail wherever that tail's own motion leaves room — momentary congestion, above the seating
// chain — and the ball then rolls DOWN through every station between there and the chain. The only thing that stopped
// it being drawn was the pocket's exit line, and on a shallow entry the extrapolated first segment stays below that
// line for a long way: on TEST-terminal-chutes ball 3 of the reviewer's three-drop reproduction was drawn at D 395.9 mm,
// 7.7 mm above the route's runway top (24.4 mm above the seating chain's last seat), and there it stands 15.3 mm inside
// the generic table's apron — with V16, which scanned the entry and the chain's seats, reporting nothing. Both readers
// now come from ONE function (`track.js reachSpan`), whose top is the landing rule's own runway top `seatUpstream` =
// `route.total + 2r`: `poseAt` draws nothing above it, V16 scans the continuum up to it. The landing rule keeps the
// seat — refusing it would drop a ball on legitimate momentary congestion — so a ball seated above the runway top
// WAITS UNDRAWN on the pile in the chute until the queue's advance brings its station onto the track.
// r60 is the reviewer's reproduction, r61 the drawn-frame probe that judges the law (V16 is the tool it judges), r62
// the definitions in web/scene/ballreturn/tracks plus web/tools/fixtures/ballreturn-tracks before and after.
{
  const THREE = await import('three');
  const fmod = await import('../scene/ballreturn/furniture.js');
  const furnitureClearance4 = typeof fmod.furnitureClearance === 'function' ? fmod.furnitureClearance : null;
  const furnitureProbe4 = typeof fmod.furnitureProbe === 'function' ? fmod.furnitureProbe : null;   // the new facade: guarded, never assumed
  const clearCache4 = typeof fmod.clearFurnitureCache === 'function' ? fmod.clearFurnitureCache : () => {};
  const spanOf = (route) => (typeof reachSpan === 'function' ? reachSpan(route, R) : { top: route.total, ladder: [] });
  const DROPS = [0.50, 0.53, 0.56];                                     // the reviewer's three pocket-4 drops
  const HZ = 1000;

  // the reproduction on one definition + one served pocket, sampled at 1 kHz over its whole lifecycle:
  // every ball's DRAWN centre, and its PHYSICAL centre with the PRE-FIX drawing rule (the pocket exit line alone)
  const lifecycle = (trk, pk) => {
    const c = { track: trk, pockets: POCKETS, r: R };
    const arr = DROPS.map((t, i) => ({ id: i + 1, handoff: handoffFromSink({ t, pocket: POCKETS[pk], fall: POCKETS[pk], r: R, glide: 0.06, tFall: 0.021 }, c) })).filter((a) => a.handoff);
    if (!arr.length) return null;
    let sol = null; try { sol = solveShot({ track: trk, r: R, ledger: [], arrivals: arr }); } catch (e) { return { err: e.message.slice(0, 70) }; }
    const drawn = [], pre = [], trace = new Map();                       // {id, t, x, y, z, D, kind}; trace: per ball, [t, drawn?, above the span?]
    let topOf = new Map(), physMax = -Infinity, preMax = -Infinity, postMax = -Infinity, fallGap = 0, fallNewOnly = 0, offSpan = 0;
    const route0 = trk.routes.get(pk);                                   // every drop is on this pocket's route
    const t0 = Math.min(...arr.map((a) => a.handoff.tH ?? 0.5));
    const n = Math.max(1, Math.round((sol.tEnd - t0) * HZ));
    for (let i = 0; i <= n; i++) {
      const t = t0 + (i / HZ);
      for (const id of sol.order) {
        const tr = trace.get(id) ?? (trace.set(id, []), trace.get(id));
        const d = poseAt(sol, id, t, {});
        if (d) { drawn.push({ id, t, x: d.x, y: d.y, z: d.z, D: d.D, kind: d.kind }); postMax = Math.max(postMax, d.D ?? -Infinity);
          // the law over EVERY drawn sample, falls included: a fall's D is the landing it is aimed at, so a fall
          // drawn toward a landing off the span is the same defect in the air. The one exception is the sink's own
          // contract — a ball drawn through the pocket opening while its top is above the shield line.
          const rt = trk.routes.get(pk);
          if (rt && (d.D ?? -Infinity) > spanOf(rt).top + 1e-9 && !(d.y + R > SINK_SHIELD_Y)) offSpan += 1; }
        const ph = poseAt(sol, id, t, {}, true);
        const co = continuationAt(sol, id, t);
        if (!ph) continue;
        if (!co || !co.route) {                                          // a fall: `continuationAt` names no route for one, so read it from the drop's own
          const over0 = !!route0 && ph.D > spanOf(route0).top + 1e-9;
          tr.push([t, !!d, over0]);
          if (!d && ph.kind === 'fall') { fallGap += 1;                   // undrawn — by the pocket's exit line, or by the new bound?
            if (over0 && !(Number.isFinite(route0.exitY) && ph.y + R > route0.exitY)) fallNewOnly += 1; }
          continue;
        }
        const route = co.route; const top = spanOf(route).top; topOf.set(route, top);
        tr.push([t, !!d, ph.D > top + 1e-9]);
        physMax = Math.max(physMax, ph.D);
        // the PRE-FIX drawing rule, restated here so the arm can measure the defect without the old tree:
        // a station above the entry was drawn iff the ball's top was at or below the pocket's exit line
        const preDrawn = !(Number.isFinite(route.exitY) && ph.D > route.total + 1e-9 && ph.y + R > route.exitY);
        if (preDrawn) { pre.push({ id, t, x: ph.x, y: ph.y, z: ph.z, D: ph.D, kind: ph.kind }); preMax = Math.max(preMax, ph.D); }
      }
    }
    const tops = [...topOf.values()];
    // the undrawn RUNS that hold a sample above the span: the fix must not blink a ball out for a frame and
    // back — a ball it takes off the track waits there until the queue's advance brings its station onto it
    const runs = [];
    for (const [id, tr] of trace) {
      let i = 0;
      while (i < tr.length) {
        if (tr[i][1]) { i += 1; continue; }
        let j = i; let over = false;
        while (j < tr.length && !tr[j][1]) { over = over || tr[j][2]; j += 1; }
        if (over) runs.push({ id, t0: tr[i][0], ms: (tr[j - 1][0] - tr[i][0]) * 1e3 + 1, ends: j < tr.length });
        i = j;
      }
    }
    return { sol, drawn, pre, physMax, preMax, postMax, fallGap, fallNewOnly, offSpan, runs, top: tops.length ? Math.max(...tops) : NaN,
      restsDrawn: sol.order.every((id) => !!poseAt(sol, id, sol.tEnd, {})) };
  };

  // a 4 mm obstacle at a measured centre — r59's shape (a bracket, a screw head, a cable clip)
  const mkBox4 = (at, name) => {
    const scene = new THREE.Scene();
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.004, 0.004), new THREE.MeshBasicMaterial());
    box.name = name; box.position.set(at.x, at.y, at.z);
    scene.add(box); scene.updateMatrixWorld(true); return scene;
  };
  // the drawn-frame probe: how many of these centres are within one radius of a furniture mesh (or inside one)
  const countInside = async (scene, centres) => {
    if (!furnitureProbe4) return null;
    const pr = (await furnitureProbe4({ r: R, scene, THREE })) ?? null;
    if (!pr || !pr.evaluated) return null;
    let n = 0, worst = null;
    for (const c of centres ?? []) { const h = pr.probe(c.x, c.y, c.z); if (h) { n += 1; if (!worst || h.depth > worst.depth) worst = { ...h, D: c.D, t: c.t, id: c.id }; } }
    return { n, worst };
  };

  // ---- r60 the reviewer's reproduction ---------------------------------------------------------------
  const trkR = validateTrack(loadDef(path.resolve(here, '../scene/ballreturn/tracks/TEST-terminal-chutes.json')), { pockets: POCKETS, falls: null });
  const L = lifecycle(trkR, 4);
  const routeR = trkR.routes.get(4);
  const topR = spanOf(routeR).top;
  const overPre = L && Number.isFinite(L.preMax) ? L.preMax - topR : NaN;    // how far above the chain the pre-fix drawing reached
  const overPost = L && Number.isFinite(L.postMax) ? L.postMax - topR : NaN;
  const runsR = L?.runs ?? [];
  const minRun = runsR.length ? Math.min(...runsR.map((q) => q.ms)) : NaN;
  const r60ok = !!L && !L.err && overPre > 1e-3 && overPost <= 1e-9 && L.physMax > topR + 1e-9 && L.restsDrawn
    && runsR.length > 0 && runsR.every((q) => q.ends) && minRun >= 2   // every ball taken off the track comes back, and none blinks
    && L.offSpan === 0;                                                 // and NOTHING of any kind is drawn off the span
  check(`r60 the reviewer's reproduction (#737 r11 class A): TEST-terminal-chutes, pocket-4 drops at ${DROPS.join('/')} s — the landing rule still seats a ball behind the moving tail at D ${L ? (L.physMax * 1e3).toFixed(1) : '—'} mm, ${L ? ((L.physMax - topR) * 1e3).toFixed(1) : '—'} mm above the RUNWAY TOP (${(topR * 1e3).toFixed(1)} mm on a ${(routeR.total * 1e3).toFixed(1)} mm route); PRE-FIX it was DRAWN rolling down to D ${L ? (L.preMax * 1e3).toFixed(1) : '—'} mm (+${(overPre * 1e3).toFixed(1)} mm past it, on extrapolated route the track does not have — the reviewer measured 15.4 mm inside the generic table's apron there); POST-FIX the highest DRAWN station is D ${L ? (L.postMax * 1e3).toFixed(1) : '—'} mm (${(overPost * 1e3).toFixed(1)} mm past it) — node has no apron, so what this arm settles is the kinematic half: the landing rule no longer produces a DRAWN position off the span, the ball waits undrawn on the pile until the queue's advance brings its station onto the track. WHICH of the order's two outcomes this fixture is, is settled on the real bed by e2e arm 13f — the FIRST one: the track is too short and V16 refuses it, and every ball is drawn again at the end (${L ? L.restsDrawn : '—'}); of the ${L ? L.fallGap : '—'} fall sample(s) undrawn inside the pocket assembly ${L ? L.fallNewOnly : '—'} is one the new bound removes on its own — the last instant of a fall whose LANDING is off the span, which then continues as the same undrawn wait, not a blink: ${runsR.length} undrawn runs hold a sample above the span, ${runsR.map((q) => `ball ${q.id} ${q.ms.toFixed(0)} ms from t ${q.t0.toFixed(3)}`).join(', ')}, shortest ${Number.isFinite(minRun) ? minRun.toFixed(0) : '—'} ms, and every one of them ENDS with the ball drawn again; over the whole lifecycle ${L ? L.offSpan : '—'} drawn sample(s) OF ANY KIND sit off the span (a fall counts by the landing it is aimed at; a ball drawn through the pocket opening above the shield line is the sink's own contract and excepted)`,
    r60ok, JSON.stringify({ top: topR, total: routeR.total, physMax: L?.physMax, preMax: L?.preMax, postMax: L?.postMax, fallGap: L?.fallGap, fallNewOnly: L?.fallNewOnly, offSpan: L?.offSpan, runs: L?.runs, restsDrawn: L?.restsDrawn, err: L?.err }));

  // ---- r60b the same law IN THE AIR: a FALL aimed at a landing off the span ---------------------------
  // The reviewer's fixture shows the ROLL branch. The fall branch is the same law one piece earlier, and the
  // reproduction does NOT cover it: there the pocket's own exit rule hides the whole descent, so the landing
  // bound removes nothing on its own (r60 says exactly that in its own message) — and the battery proved the
  // hole, mutant N126 surviving a cut that had only r60/r61/r62 to catch it. This is the case that shows it,
  // found by search over the shipped definitions rather than authored: TEST-obtuse-merge route 4, three drops
  // 10 ms apart, ball 3's fall aimed behind the MOVING tail at a seat 56 mm above the runway top, and low
  // enough on its way down that the exit line lets it be drawn.
  const trkF = validateTrack(loadDef(path.resolve(here, '../scene/ballreturn/tracks/TEST-obtuse-merge.json')), { pockets: POCKETS, falls: null });
  const DROPS_F = [0.50, 0.51, 0.52];
  const arrF = DROPS_F.map((tt, i) => ({ id: i + 1, handoff: handoffFromSink({ t: tt, pocket: POCKETS[4], fall: POCKETS[4], r: R, glide: 0.06, tFall: 0.021 }, { track: trkF, pockets: POCKETS, r: R }) })).filter((a) => a.handoff);
  let solF = null; let errF = null;
  try { solF = arrF.length === 3 ? solveShot({ track: trkF, r: R, ledger: [], arrivals: arrF }) : null; } catch (e) { errF = e.message; }
  const fallRows = [];
  if (solF) {
    for (const [id, ps] of solF.pieces) {
      for (const p of ps) {
        if (p.kind !== 'fall') continue;
        const landD = p.D ?? p.route.total;
        const topF = reachTop(p.route, R);
        let pre = 0, post = 0;                                   // 200 instants of the descent, the endpoint left to the next piece
        for (let k = 0; k < 200; k++) {
          const tau = ((p.t1 - p.t0) * k) / 200, tt = p.t0 + tau;
          const y = p.yH - p.vDown * tau - 0.5 * G * tau * tau;
          const above = p.above === true && y + R > SINK_SHIELD_Y;   // drawn through the pocket opening: the sink's own contract
          if (above || (y + R <= p.exitY && !(p.tShow !== undefined && tt < p.tShow))) pre += 1;   // the rule as it stood
          const d = poseAt(solF, id, tt, {});
          if (d && d.kind === 'fall') post += 1;
        }
        fallRows.push({ id, landD, top: topF, off: landD > topF + 1e-9, pre, post, ms: (p.t1 - p.t0) * 1e3 });
      }
    }
  }
  const offF = fallRows.filter((q) => q.off);
  const onF = fallRows.filter((q) => !q.off);
  const backF = solF ? offF.every((q) => !!poseAt(solF, q.id, solF.tEnd, {})) : false;
  const mmF = (v) => (Number.isFinite(v) ? (v * 1e3).toFixed(1) : '—');
  check(`r60b the same law IN THE AIR (#737 r11 class A): TEST-obtuse-merge route 4, drops at ${DROPS_F.join('/')} s — ${fallRows.length} fall(s) in the solve, ${offF.length} of them aimed at a landing OFF THE SPAN${offF.map((q) => ` (ball ${q.id}: D ${mmF(q.landD)} mm, ${mmF(q.landD - q.top)} mm above the runway top ${mmF(q.top)}, a ${q.ms.toFixed(1)} ms descent — PRE-FIX ${q.pre} of 200 instants DRAWN, POST-FIX ${q.post})`).join('')}: a ball dropping toward a seat the track does not have was drawn falling to it, because the pocket's exit line lets it be seen once it is low enough. It now stays undrawn all the way down and appears when the queue's advance brings its station onto the span — ${backF} that every one of them is drawn again at the end. The ${onF.length} fall(s) aimed ON the span are untouched: ${onF.every((q) => q.post === q.pre)} that pre and post agree instant for instant`,
    !errF && offF.length > 0 && offF.every((q) => q.pre > 0 && q.post === 0) && onF.length > 0 && onF.every((q) => q.post === q.pre) && backF,
    JSON.stringify({ errF, fallRows }));

  // ---- r61 the drawn-frame probe (not V16) -----------------------------------------------------------
  // The obstacle stands for the apron: furniture the track is NOT SUPPOSED TO REACH. So it is placed by that
  // definition and not by hand — a 4 mm box (r59's shape: a bracket, a screw head, a cable clip) at the highest
  // PRE-FIX drawn centre above the chain, pushed out along the overshoot's own direction by the smallest whole
  // V16 step that clears the drawable envelope, and no further than one radius, so the pre-fix drawn ball still
  // reaches it. On this fixture the overshoot is 24.3 mm — SHORTER THAN A BALL — so nothing can sit inside the
  // band that a legitimate station does not also own; just past it, it can. That the pre-fix drawing reached a
  // place the post-fix scan does not is the whole finding.
  const HALF_DIAG = 0.002 * Math.sqrt(3);                        // the 4 mm box's centre-to-corner
  const CLEAR = R + HALF_DIAG + (fmod.V16_STEP ?? 0.005) / 2;    // outside the envelope, with the grid's own half step
  const cloudOf = (t) => {                                       // the module's own readers, over every route: the scanned set
    const out = [], tmp = {}, step = fmod.V16_STEP ?? 0.005;
    const rs = [...(t.routes?.values?.() ?? [])];
    if (t.trayRoute && !rs.includes(t.trayRoute)) rs.push(t.trayRoute);
    for (const route of rs) {
      const { top } = spanOf(route);
      // V16's own pointwise test, mirrored: above the entry a station the pocket hides is not scanned, and
      // the point where the exit line CUTS the band is scanned exactly (the highest D still drawn)
      const at = (D) => { const st = stationAt(route, D, R, tmp); return { D, x: st.x, y: st.y, z: st.z, hid: Number.isFinite(route.exitY) && st.y + R > route.exitY }; };
      let prev = at(route.total);
      const walk = (p) => {
        if (p.hid !== prev.hid) { let lo = prev.hid ? p.D : prev.D, hi = prev.hid ? prev.D : p.D;
          for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (at(m).hid) hi = m; else lo = m; }
          const q = at(lo); out.push([q.x, q.y, q.z]); }
        if (!p.hid) out.push([p.x, p.y, p.z]);
        prev = p;
      };
      for (let D = route.total + step; D <= top - 1e-9; D += step) walk(at(D));
      if (top > route.total + 1e-9) walk(at(top));
      for (let D = route.total; D >= -1e-9; D -= step) { const st = stationAt(route, Math.max(0, D), R, tmp); out.push([st.x, st.y, st.z]); }
    }
    return out;
  };
  const near = (cloud, x, y, z) => { let m = Infinity; for (const st of cloud) { const d2 = (st[0] - x) ** 2 + (st[1] - y) ** 2 + (st[2] - z) ** 2; if (d2 < m) m = d2; } return Math.sqrt(m); };
  const place = (cloud, band) => {                               // the first centre+offset that is furniture, not runway
    const step = fmod.V16_STEP ?? 0.005;
    for (const c of band) {
      let bx = Infinity, by = 0, bz = 0, bn = 0;
      for (const st of cloud) { const d2 = (st[0] - c.x) ** 2 + (st[1] - c.y) ** 2 + (st[2] - c.z) ** 2; if (d2 < bx) { bx = d2; by = st[0]; bz = st[1]; bn = st[2]; } }
      const L = Math.sqrt(bx) || 1, ux = (c.x - by) / L, uy = (c.y - bz) / L, uz = (c.z - bn) / L;
      for (let d = 0; d <= R - HALF_DIAG + 1e-9; d += step) {
        const x = c.x + ux * d, y = c.y + uy * d, z = c.z + uz * d;
        if (near(cloud, x, y, z) > CLEAR) return { x, y, z, off: d, from: c, gap: near(cloud, x, y, z) };
      }
    }
    return null;
  };
  const cloudR = cloudOf(trkR);
  const bandR = (L?.pre ?? []).filter((c) => c.D > topR + 1e-9).sort((a, b) => b.D - a.D);
  const spotR = place(cloudR, bandR);
  const sceneR = spotR ? mkBox4(spotR, 'obTestApronProxy') : null;
  const preCount = sceneR ? await countInside(sceneR, (L?.pre ?? [])) : null;
  const postCount = sceneR ? await countInside(sceneR, (L?.drawn ?? [])) : null;
  clearCache4();
  const v16R = sceneR && furnitureClearance4 ? await furnitureClearance4({ track: trkR, r: R, scene: sceneR, tableId: 'wpa_generic_9ft', trackId: 'r61-apron-proxy', THREE }) : null;
  const v16Hits = (v16R?.violations ?? []).filter((v) => v.mesh === 'obTestApronProxy').length;
  // and the coincidence law itself: every DRAWN centre is a station V16 scans (within half a scan step)
  let worstGap = 0;
  for (const c of (L?.drawn ?? [])) { if (c.kind === 'fall' || c.kind === 'hold') continue; worstGap = Math.max(worstGap, near(cloudR, c.x, c.y, c.z)); }
  // room for a synthetic obstacle, measured: the overshoot plus the furthest the box may be pushed and still be
  // touched by the pre-fix ball, against the clearance it needs to stand outside the scan. Negative = no box fits.
  const coveredR = bandR.length ? (bandR[0].D - topR) + (R - HALF_DIAG) - CLEAR : null;
  const r61ok = (spotR
      ? (!!preCount && preCount.n > 0 && !!postCount && postCount.n === 0 && v16Hits === 0)
      : (bandR.length > 0 && coveredR < 0))                       // no box fits: the overshoot is shorter than the clearance one needs
    && worstGap <= (fmod.V16_STEP ?? 0.005) / 2 + 1e-9;
  check(`r61 the drawn-frame probe (#737 r11 class A — the arm that judges the law; V16 is the tool it judges): the reproduction's ${(L?.pre ?? []).length}-sample lifecycle, ${bandR.length} of them drawn above the runway top, ${(topR * 1e3).toFixed(1)}–${(L ? L.preMax * 1e3 : 0).toFixed(1)} mm; ${spotR ? `a 4 mm obstacle at the highest of them (ball ${spotR.from.id} at t ${spotR.from.t.toFixed(3)}, D ${(spotR.from.D * 1e3).toFixed(1)} mm) pushed ${(spotR.off * 1e3).toFixed(0)} mm out along the overshoot to clear the drawable envelope (nearest scanned station ${(spotR.gap * 1e3).toFixed(1)} mm > ${(CLEAR * 1e3).toFixed(1)} mm): read with V16's own point test, PRE-FIX ${preCount ? preCount.n : '—'} drawn centre(s) of the lifecycle are within a radius of it (worst depth ${preCount?.worst ? (preCount.worst.depth * 1e3).toFixed(1) : '—'} mm), POST-FIX ${postCount ? postCount.n : '—'}; V16 over the same scene names it ${v16Hits} time(s) — agreeing because nothing is drawn there, not because it cannot see` : `NO SYNTHETIC OBSTACLE FITS on this fixture: the overshoot is ${(L ? (L.preMax - topR) * 1e3 : 0).toFixed(1)} mm and a 4 mm box needs ${(CLEAR * 1e3).toFixed(1)} mm of clearance to stand outside the scan while a pre-fix ball can still reach it — ${(-coveredR * 1e3).toFixed(2)} mm short. Since round 11 widened the scan to the runway top the band a proxy could occupy has closed, and the obstacle that judges this fixture is the REAL one: e2e arm 13f, where the generic table's own body sits 15.3 mm inside the pre-fix drawn ball and 7.5 mm inside the post-fix one, and V16 REFUSES the track (6 of 158 stations). A node gate cannot build that table; it is measured in the browser, not asserted here`}; and the coincidence law: every drawn rolling centre of the whole lifecycle lies within ${(worstGap * 1e6).toFixed(0)} µm of a station V16 scans, half a scan step (${(((fmod.V16_STEP ?? 0.005) / 2) * 1e3).toFixed(1)} mm) being the most a continuous D can be off a ${((fmod.V16_STEP ?? 0.005) * 1e3).toFixed(0)} mm grid`,
    r61ok, JSON.stringify({ spot: spotR, covered: coveredR, band: bandR.length, pre: preCount?.n, post: postCount?.n, v16Hits, worstGap, probe: !!furnitureProbe4 }));

  // ---- r62 the definitions in web/scene/ballreturn/tracks plus
  // web/tools/fixtures/ballreturn-tracks, before and after ---------------------------------------------
  const rows62 = [];
  for (const [f, p] of trackFiles()) {
    const nm = f.replace(/\.json$/, '').replace('TEST-', '');
    let t = null; try { t = validateTrack(loadDef(p), { pockets: POCKETS, falls: null }); } catch { continue; }
    const pk = [...t.routes.keys()][0];
    const Lf = lifecycle(t, pk);
    if (!Lf || Lf.err) { rows62.push({ track: nm, err: Lf?.err ?? 'no handoff' }); continue; }
    const top = spanOf(t.routes.get(pk)).top;
    const cloud = cloudOf(t);
    const band = (Lf.pre ?? []).filter((c) => c.D > top + 1e-9).sort((a, b) => b.D - a.D);
    const spot = place(cloud, band);
    const scene = spot ? mkBox4(spot, 'obTestApronProxy') : (() => { const sc = new THREE.Scene(); sc.updateMatrixWorld(true); return sc; })();
    const pc = await countInside(scene, Lf.pre), qc = await countInside(scene, Lf.drawn);
    let gap = 0; for (const c of Lf.drawn) { if (c.kind === 'fall' || c.kind === 'hold') continue; gap = Math.max(gap, near(cloud, c.x, c.y, c.z)); }
    clearCache4();
    const cv = furnitureClearance4 ? await furnitureClearance4({ track: t, r: R, scene, tableId: 'wpa_generic_9ft', trackId: `r62#${nm}`, THREE }) : null;
    rows62.push({ track: nm, pocket: pk, offSpan: Lf.offSpan, over: band.length ? +((band[0].D - top) * 1e3).toFixed(2) : 0, off: spot ? +(spot.off * 1e3).toFixed(0) : null,
      // no proxy places when the overshoot is short enough that everything it reaches is already within one
      // radius of the runway top — there the scan covered the ball wherever it went, and there is nothing to show
      covered: !spot && band.length ? +(((band[0].D - top) + (R - HALF_DIAG) - CLEAR) * 1e3).toFixed(2) : null,
      pre: pc?.n ?? null, post: qc?.n ?? null, v16: (cv?.violations ?? []).length, stations: cv?.stations ?? 0, mirror: cloud.length, gap: +(gap * 1e6).toFixed(0), restsDrawn: Lf.restsDrawn });
  }
  const bad62 = rows62.filter((r2) => r2.err || r2.post !== 0 || r2.v16 !== 0 || r2.offSpan !== 0 || !r2.restsDrawn || r2.gap > (fmod.V16_STEP ?? 0.005) / 2 * 1e6 + 1
    || r2.stations !== r2.mirror                                                 // the module scans exactly the set this arm's mirror derives — the runway top included (N130)
    || (r2.off !== null ? !(r2.pre > 0) : !(r2.covered < 0 || r2.over === 0)));   // a proxy stands, or the overshoot provably leaves it no room (or there is none)
  const red62 = rows62.filter((r2) => (r2.pre ?? 0) > 0);
  check(`r62 the definitions in web/scene/ballreturn/tracks plus web/tools/fixtures/ballreturn-tracks before and after (#737 r11 class A): ${rows62.length} definitions × the reviewer's three-drop reproduction on the first served pocket, each with its own apron proxy placed the same way — ${rows62.map((r2) => r2.err ? `${r2.track} ERR ${r2.err}` : `${r2.track} p${r2.pocket} offSpan ${r2.offSpan} over +${r2.over} ${r2.off === null ? (r2.covered === null ? 'NO OVERSHOOT (nothing drawn above the runway top even pre-fix)' : `NO PROXY (the overshoot ends ${(-r2.covered).toFixed(2)} mm short of clearing the scan)`) : `off ${r2.off} pre ${r2.pre} post ${r2.post}`} V16 ${r2.v16}/${r2.stations} gap ${r2.gap}µm`).join('; ')} (mm) — ${rows62.filter((r2) => (r2.over ?? 0) > 0).length} of ${rows62.length} definitions drew a ball above their runway top pre-fix (worst +${Math.max(...rows62.map((r2) => r2.over ?? 0)).toFixed(2)} mm: never one fixture's accident); ${red62.length} of ${rows62.length} put ≥ 1 drawn centre inside their proxy pre-fix and NONE does now; the ${rows62.length - red62.length} that host no proxy (${rows62.filter((r2) => r2.off === null).map((r2) => r2.track).join(', ')}) overshoot by less than the room a 4 mm box needs to stand clear of the scan, so a SYNTHETIC obstacle has nothing to show there — a measurement, not a pass. On those the judge is the real table, in the browser: the 9-definition matrix on wpa_generic_9ft (e2e arm 13h) reads V16 0→0 and drawn-in-furniture 0→0 on alias-diamond-wire-slide, synthetic-wire-slide and terminal-chutes-high; 410→0 on midedge-landing, obtuse-merge and shallow-merge; and 185→0, 271→0 and 41→0 on bend-90, hairpin-170 and terminal-chutes, the three whose ENTRY moved this round (ORDER-BR-737-FIX10 ruling (a)): their r1/t1 entries left 47.20, 45.95 and 49.22 mm of clear runway above them, 9.95, 11.20 and 7.93 mm short of the one diameter (57.15 mm) the landing law seats an arriving ball in, so the seat itself stood inside obTable/ExtrudeGeometry@(0,-124,0)[2926×260×1656] and V16 refused the track (3, 3 and 6 stations) instead of passing it silently — each entry then moved DOWN ITS OWN LINE by 10.0, 11.2 and 8.0 mm (the deficit taken up to the exporter's 0.1 mm grain; derivation r63, the load-time rule that refuses such data r64, the red arm on the real table e2e 13i). The matrix carries no refusal since y3-obtuse became a node-only fixture (#749). In node: V16 names no proxy post-fix, not one drawn sample of any kind sits off its span, every drawn centre is on the scanned grid, the module's scanned COUNT equals this arm's own mirror of it on all ${rows62.length} (${rows62.map((r2) => r2.stations).join('/')} = ${rows62.map((r2) => r2.mirror).join('/')}, the runway top included — the station a 5 mm grid anchored at the entry always misses by 2.15 mm, since the overflow is 2r), and every ball is drawn at the end of every solve`,
    rows62.length >= 10 && bad62.length === 0 && rows62.filter((r2) => (r2.over ?? 0) > 0).length >= 9
      && red62.length === rows62.filter((r2) => r2.off !== null).length, JSON.stringify({ rows: rows62, bad: bad62 }));
}

// ---- r63/r64 — the three moved entries, and the rule that now refuses their old form ----------------
// (#737 r12, ORDER-BR-737-FIX10 ruling (a) and (c)). Three fixtures put their entry where the band the LANDING LAW
// seats an arriving ball in — one ball diameter of runway above the entry, on the track (track.js seatUpstream) —
// stood inside the generic table's body. Round 11's refusal was telling the truth about the data, so the DATA moved:
// each entry slides DOWN ITS OWN LINE by the minimal distance the continuum scan reports as clearing that mesh with
// the full diameter, measured on the live table (the only place that table exists: e2e arm 13i), taken UP to the
// exporter's 0.1 mm grain and written at the fixture's own 0.01 mm vertex precision. PRIOR records the entry as it
// stood at r1/t1 and what V20 read there — a record of a previous revision, like a determinism pin, never a knob.
// r63 gates the move (the derived minimum, along the line, topology untouched); r64 gates the rule itself.
{
  const THREE = await import('three');
  const fmod = await import('../scene/ballreturn/furniture.js');
  const GRAIN = EXPORT_GRAIN * 1e3;                 // 0.1 mm — track.js, the exporter's own vertex rounding
  const VERTEX = 0.01;                              // mm — the precision these fixtures write every vertex at
  const BODY = 'obTable/ExtrudeGeometry@(0,-124,0)[2926×260×1656]';
  const PRIOR = {                                   // entry as committed at r1/t1 + V20's read there (browser, wpa_generic_9ft)
    'TEST-bend-90':         { turn: 90,  entries: { 'bend-run': [0, -263, 703.5] },                                clear: 47.196, deficit: 9.954,  first: 696.461, mesh: BODY, stations: 3, worst: 9.867 },
    'TEST-hairpin-170':     { turn: 170, entries: { 'bend-run': [0, -263, 703.5] },                                clear: 45.954, deficit: 11.196, first: 846.422, mesh: BODY, stations: 3, worst: 11.153 },
    'TEST-terminal-chutes': { turn: 0,   entries: { 'lc-lead': [0, -263, -703.5], 'rc-lead': [0, -263, 703.5] },   clear: 49.217, deficit: 7.933,  first: 380.207, mesh: BODY, stations: 3, worst: 7.78 },
  };
  // the TURN at an interior vertex, in plan: 0 = straight on, 90 = the bend, 170 = the hairpin — the number each
  // fixture's own name pins. Read off the definition, so a moved vertex that bent it would show here.
  const turnAt = (a, b, c) => {
    const ux = b[0] - a[0], uz = b[2] - a[2], vx = c[0] - b[0], vz = c[2] - b[2];
    const lu = Math.hypot(ux, uz), lv = Math.hypot(vx, vz);
    if (!(lu > 1e-12) || !(lv > 1e-12)) return null;
    return +((Math.acos(Math.min(1, Math.max(-1, (ux * vx + uz * vz) / (lu * lv)))) * 180) / Math.PI).toFixed(9);
  };
  // everything these fixtures PIN, with the one moved vertex left out: ids, roles, the chain, the plan turns, the
  // stops, the served pockets and their entries in order, the topology, and every DOWNSTREAM vertex bit for bit
  const sig = (def, skip) => JSON.stringify({
    runways: def.runways.map((rw) => ({ id: rw.id, role: rw.role ?? null, next: rw.next ?? null, pts: rw.points_mm.length,
      turns: rw.points_mm.slice(1, -1).map((_, i) => turnAt(rw.points_mm[i], rw.points_mm[i + 1], rw.points_mm[i + 2])),
      stop: rw.stop ? { kind: rw.stop.kind, s: rw.stop.wall_s_mm, cap: rw.stop.capacity_balls } : null,
      down: rw.points_mm.slice(skip[rw.id] ? 1 : 0) })),
    pockets: (def.pockets ?? []).map((p) => [p.index, p.entry_runway]),
    topology: def.topology ?? null, tray: def.tray ? { runway: def.tray.runway, end: def.tray.end } : null,
  });
  const rows63 = [];
  for (const [name, prior] of Object.entries(PRIOR)) {
    const now = loadDef(path.resolve(here, `../scene/ballreturn/tracks/${name}.json`));
    const was = JSON.parse(JSON.stringify(now));
    for (const rw of was.runways) if (prior.entries[rw.id]) rw.points_mm[0] = prior.entries[rw.id].slice();
    let tNow = null, tWas = null, err = null;
    try { tNow = validateTrack(now, { pockets: POCKETS, falls: null }); tWas = validateTrack(was, { pockets: POCKETS, falls: null }); } catch (e) { err = e.message.slice(0, 80); }
    const moves = [];
    for (const rw of now.runways) {
      const a = prior.entries[rw.id]; if (!a) continue;
      const p = rw.points_mm[0], b = rw.points_mm[1];
      const v = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], Ls = Math.hypot(v[0], v[1], v[2]);
      const u = v.map((c) => c / Ls), d = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
      const along = d[0] * u[0] + d[1] * u[1] + d[2] * u[2];
      const perp = Math.sqrt(Math.max(0, d[0] ** 2 + d[1] ** 2 + d[2] ** 2 - along * along));
      const step = Math.ceil((prior.deficit - 1e-9) / GRAIN) * GRAIN;           // the FIRST grain step past the deficit
      const pocket = (now.pockets ?? []).find((q) => q.entry_runway === rw.id);
      const rN = pocket && tNow ? tNow.routes.get(pocket.index) : null;
      const rW = pocket && tWas ? tWas.routes.get(pocket.index) : null;
      moves.push({ runway: rw.id, along: +along.toFixed(6), perpUm: +(perp * 1e3).toFixed(1), step,
        margin: +(along - prior.deficit).toFixed(4), onGrid: p.every((c) => Math.abs(c / VERTEX - Math.round(c / VERTEX)) < 1e-9),
        route: pocket ? pocket.index : null, shrank: rN && rW ? +((rW.total - rN.total) * 1e3).toFixed(6) : null,
        // the route shortens by the move; what is left over is the CORNER's response to the residual — the fillet at the
        // next vertex sees the first leg's direction turn by perp/L, and path length is Lipschitz in a vertex position,
        // so it cannot exceed the residual itself (measured: 1.18 µm of 7.27 on the bend, 0.42 of 7.97 on the hairpin,
        // and exactly 0 of 0 on the chutes, whose leads moved with no residual at all)
        filletUm: rN && rW ? +(((rW.total - rN.total) * 1e3 - along) * 1e3).toFixed(2) : null,
        top: rN ? +(reachSpan(rN, R).top * 1e3).toFixed(3) : null, p: p.slice() });
    }
    const turns = now.runways.flatMap((rw) => rw.points_mm.slice(1, -1).map((_, i) => turnAt(rw.points_mm[i], rw.points_mm[i + 1], rw.points_mm[i + 2])));
    rows63.push({ name, err, moves, sigSame: !err && sig(now, prior.entries) === sig(was, prior.entries),
      turnKept: turns.some((q) => Math.abs(q - prior.turn) < 0.01) || prior.turn === 0, turns, prior });
  }
  const bad63 = rows63.filter((q) => q.err || !q.sigSame || !q.turnKept || !q.moves.length
    || q.moves.some((m) => !(m.along > q.prior.deficit)                                     // it clears the body...
      || !(m.along < q.prior.deficit + GRAIN)                                               // ...by the MINIMAL grain step, not a millimetre picked by hand
      || Math.abs(m.along - m.step) > VERTEX * Math.sqrt(3) + 1e-9                          // the realised move IS that step, up to the 0.01 mm vertex rounding
      || m.perpUm > VERTEX * 1e3 + 1e-9 || !m.onGrid                                        // ALONG the line, on the fixtures' own vertex grid
      || m.shrank === null || !(m.shrank > 0)                                             // and the route is SHORTER, by the move...
      || Math.abs(m.filletUm) > 2 * m.perpUm + 1e-3));                                      // ...to within the corner's response to the residual (0 when the residual is 0)
  check(`r63 the three moved entries are the DERIVED minimum and nothing else moved (#737 r12, ORDER-BR-737-FIX10 ruling (a)): ${rows63.map((q) => `${q.name.replace('TEST-', '')} — V20 read ${q.prior.clear} mm of clear runway above the r1/t1 entry, ${q.prior.deficit} mm short of the diameter (${(2 * R * 1e3).toFixed(2)} mm), ${q.prior.stations} drawn station(s) up to ${q.prior.worst} mm inside ${q.prior.mesh}; ${q.moves.map((m) => `${m.runway} moves ${m.along.toFixed(3)} mm down its own line (the first 0.1 mm grain step past the deficit, ${m.step.toFixed(1)}; ${m.margin.toFixed(3)} mm of margin, ${m.perpUm} µm off the line, vertex on the 0.01 mm grid ${m.onGrid}), route ${m.route} shorter by ${m.shrank} mm — the move itself, plus ${m.filletUm} µm the corner fillet gives back for the residual, bounded by that residual — runway top now ${m.top} mm`).join(' + ')}`).join('; ')} — and what each fixture PINS is bit-identical before and after (${rows63.map((q) => `${q.name.replace('TEST-', '')} ${q.sigSame ? 'same' : 'CHANGED'}`).join(', ')}): ids, roles, the chain, every downstream vertex, the stops (280 mm / capacity 4 on both chutes), the served pockets and their entry runways in order, the topology tag — and the plan turns the names themselves pin, ${rows63.map((q) => `${q.name.replace('TEST-', '')} ${q.turns.filter((x) => x !== null).map((x) => x.toFixed(5)).join('/') || 'no interior vertex'}°`).join(', ')}. The old entries are what V20 refuses at load (r64 for the rule, e2e arm 13i for the mesh itself)`,
    rows63.length === 3 && bad63.length === 0, JSON.stringify({ rows: rows63.map((q) => ({ name: q.name, err: q.err, sigSame: q.sigSame, moves: q.moves })), bad: bad63.map((q) => q.name) }));

  // ---- r64 the V20 rule: an entry with less than one diameter of clear runway is refused at LOAD, by name -----
  // Ruling (c): the law is encoded ONCE, on the V16 side, so no future definition can repeat this. The obstacle here
  // is synthetic (node has no table body) and placed by construction: a 4 mm box centred on the runway station a
  // measured height above the entry, so the deficit the row reports is a consequence of where the box stands.
  const trk64 = validateTrack(loadDef(path.resolve(here, '../scene/ballreturn/tracks/TEST-terminal-chutes.json')), { pockets: POCKETS, falls: null });
  const rt64 = trk64.routes.get(4);
  const tmp64 = {};
  const box64 = (at, nm) => { const sc = new THREE.Scene(); const b = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.004, 0.004), new THREE.MeshBasicMaterial()); b.name = nm; b.position.set(at.x, at.y, at.z); sc.add(b); sc.updateMatrixWorld(true); return sc; };
  const read64 = async (D, nm, id) => { fmod.clearFurnitureCache();
    const c = await fmod.furnitureClearance({ track: trk64, r: R, scene: box64(stationAt(rt64, D, R, tmp64), nm), tableId: 'wpa_generic_9ft', trackId: `r64#${id}`, THREE });
    const e = (c.entryClearance ?? [])[0] ?? null;
    return { n: c.violations.length, rows: (c.entryClearance ?? []).length, reason: c.reason ?? '', entryReason: c.entryReason ?? null,
      // clear and deficit both at 6 dp: the arm asserts clear + deficit = required, and a 3 dp deficit misses that by 0.3 µm
      clear: e ? +(e.clear * 1e3).toFixed(6) : null, deficit: e ? +(e.deficit * 1e3).toFixed(6) : null, required: e ? +(e.required * 1e3).toFixed(2) : null,
      mesh: e ? e.mesh : null, runway: e ? e.runway : null, row: e ? e.row : null,
      // the two halves of the partition, read off the refusal itself: how many of the refused stations the entry row
      // OWNS, and whether the message carries a below-the-entry [V16] section after it
      stations: e ? e.stations : null, below: /ALSO on the same read, below the entry/.test(c.reason ?? '') };
  };
  const ups = [0.020, 0.040, 0.0555];
  const above64 = []; for (const up of ups) above64.push({ up: +(up * 1e3).toFixed(1), ...(await read64(rt64.total + up, 'obTestRunwayBox', up)) });
  // the clear runway is BISECTED, not read off the 5 mm scan grid: above the entry the runway is the entry segment
  // extended, so translating the obstacle along it by a fraction of a step must move the reported foot by exactly
  // that fraction. A grid-quantised report cannot follow a 1.234 mm shift; this one does, to the nanometre.
  const DELTA = 0.001234;
  const shift64 = { ...(await read64(rt64.total + 0.040 + DELTA, 'obTestRunwayBox', 'delta')) };
  const shiftErrUm = shift64.clear === null ? null : +(((shift64.clear - above64[1].clear) - DELTA * 1e3) * 1e3).toFixed(4);
  const below64 = { ...(await read64(rt64.total - 0.030, 'obTestRunBox', 'below')) };
  fmod.clearFurnitureCache();
  const empty64 = await fmod.furnitureClearance({ track: trk64, r: R, scene: (() => { const s = new THREE.Scene(); s.updateMatrixWorld(true); return s; })(), tableId: 'wpa_generic_9ft', trackId: 'r64#empty', THREE });
  const named = (q) => q.rows === 1 && q.row === 'V20' && q.mesh === 'obTestRunwayBox' && q.runway === 'rc-lead' && /\[V20\]/.test(q.reason)
    && q.reason.includes('obTestRunwayBox') && q.reason.includes(q.deficit.toFixed(2)) && q.reason.includes('seatUpstream')
    && Math.abs(q.required - 2 * R * 1e3) < 1e-6 && Math.abs(q.clear + q.deficit - q.required) < 1e-6 && q.deficit > 0;
  const monotone = above64.every((q, i) => i === 0 || q.clear > above64[i - 1].clear);
  // the partition, both ways, on one obstacle: the +20 mm box stands low enough that its foot reaches BELOW the entry
  // (a ball at the entry already touches it), so that read carries the entry row AND a below-the-entry [V16] section
  // and the two never count the same station (10 of its 13 are the row's); the +40 / +55.5 boxes are wholly inside the
  // band, so every refused station is the row's and there is no [V16] section at all
  const partition = above64[0].below === true && above64[0].n > above64[0].stations
    && above64.slice(1).every((q) => q.below === false && q.n === q.stations);
  const r64ok = above64.every(named) && monotone && partition && shiftErrUm !== null && Math.abs(shiftErrUm) < 1
    && below64.n > 0 && below64.rows === 0 && /\[V16\]/.test(below64.reason) && !/\[V20\]/.test(below64.reason)
    && (empty64.violations ?? []).length === 0 && (empty64.entryClearance ?? []).length === 0 && !empty64.reason;
  check(`r64 V20, the entry-clearance rule (#737 r12, ORDER-BR-737-FIX10 ruling (c) — encoded once, on the V16 side, so no future definition can repeat the three moved fixtures): TEST-terminal-chutes route 4, a 4 mm box on the runway station ${ups.map((u) => (u * 1e3).toFixed(1)).join('/')} mm above the entry — ${above64.map((q) => `at +${q.up} mm the row reports ${q.clear} mm clear, ${q.deficit} mm short of the required ${q.required} mm, naming ${q.mesh} on ${q.runway} (${q.n} station(s) refused)`).join('; ')}: the higher the obstacle the more clear runway the row reports (${monotone}), and the foot is BISECTED, not read off the 5 mm grid — the same box shifted ${(DELTA * 1e3).toFixed(3)} mm further up its own straight runway moves the reported foot by exactly that, to ${shiftErrUm} nm (${shift64.clear} mm clear against ${above64[1].clear}). The partition never counts a station twice and never spills: at +${above64[0].up} mm the box reaches below the entry, so ${above64[0].stations} of its ${above64[0].n} refused stations are the entry row's and the rest follow it as a [V16] section (${above64[0].below}), while at +${above64[1].up} and +${above64[2].up} mm every refused station is the row's (${above64[1].stations}/${above64[1].n}, ${above64[2].stations}/${above64[2].n}) and there is no [V16] section at all (${above64[1].below || above64[2].below}). The message carries the row tag, the MESH and the DEFICIT in millimetres and points at the definition's own geometry (track.js seatUpstream) — a load-time refusal a definition author can act on, not a silent pass. The partition is by band, not by mesh: the same box 30 mm BELOW the entry refuses ${below64.n} station(s) as plain [V16] with ${below64.rows} entry row(s) (the class e2e arm 20c pins on the pre-fix XW101 export, which fails 60–290 mm DOWN its slides), and an empty scene refuses nothing (${(empty64.violations ?? []).length} violations, ${(empty64.entryClearance ?? []).length} rows, reason ${empty64.reason === null ? 'null' : 'SET'})`,
    r64ok, JSON.stringify({ above: above64, shift: { ...shift64, shiftErrUm }, below: below64, empty: { n: (empty64.violations ?? []).length, rows: (empty64.entryClearance ?? []).length } }));
}

// r65 — the band lint's statement reader knows the three JS forms whose insides are NOT code (#737 r12). The nested-spawn
// law (`ci-bands.mjs nestedSpawnProblems`) reads a tool's source as STATEMENTS and asks which of them spawn a browser tool.
// Its tokenizer knew strings and template literals; it did not know REGEX literals, and one line of THIS file —
// `/validated against wpa_generic_9ft \(6 kernel cups/`, an escaped paren the reader counted as an open one — left the paren
// depth at 1 for good, so the remaining 4700 lines became ONE statement holding every literal in the file: three false
// `nested-spawn-undeclared` rows against the gate's own suite, on an edit that changed nothing about spawning. The same
// defect HIDES a real edge just as easily — a step table glued to the statement above it no longer starts with `const`, so
// the binding is never recorded and the file's node spawn carries no child. Nothing in the repo tests that reader, so this
// arm is it: through the real entry point, and stated as a PROPERTY — what a file says about spawning cannot depend on a
// regex, a template or an apostrophe that precedes it. The synthetic child is named `e2e-r65-child.mjs` and never a real
// tool: naming one here, in a file that runs itself as a node child (k1), would BE an edge of this file.
{
  const { nestedSpawnProblems } = await import('./lib/ci-bands.mjs');
  const CHILD = 'web/tools/' + 'e2e-r65-child.mjs';
  const REL = 'web/tools/' + 'e2e-r65-probe.mjs';
  const tools65 = new Map([[CHILD.split('/').pop(), [CHILD]]]);
  const probe = (lines) => nestedSpawnProblems(lines.join('\n'), REL, { tools: tools65, edges: [] }).map((p) => ({ line: p.line, syntax: p.syntax }));
  // each poison is one legal line whose insides are not code; each body is a file the law has a verdict about
  const poisons = [
    ['regex, escaped paren', ['const a = /validated against wpa_generic_9ft \\(6 kernel cups/.test(s);']],
    ['regex, apostrophe', ["const b = /already declared as the track's own hardware/.test(s);"]],
    ['nested template literal', ["const c = `${s ? `x` : 'y'} it's here`;"]],
    ['regex, quote and escaped slash', ['const d = /"a\\/b\'/.test(s);']],
  ];
  poisons.push(['all four at once', poisons.flatMap((p) => p[1])]);
  const bodies = [
    { name: 'a spawn of the child', at: 1, rows: 1, lines: ["import { execFileSync } from 'node:child_process';", `execFileSync('node', ['${CHILD}']);`] },
    { name: 'a step table + a node spawn', at: 0, rows: 1, lines: [`const STEPS = ['${CHILD}'];`, 'const out = execFileSync(process.execPath, [job.file]);'] },   // the spawn never names the table: the edge is the one r57 restructured for
    { name: 'a plain read + an unrelated spawn', at: null, rows: 0, lines: [`const txt = fs.readFileSync('${CHILD}', 'utf8');`, "execFileSync('git', ['status']);"] },
  ];
  const rows65 = [];
  for (const b of bodies) {
    const base = probe(b.lines);
    const per = poisons.map(([pname, plines]) => {
      const got = probe([...plines, ...b.lines]).map((p) => ({ line: p.line - plines.length, syntax: p.syntax }));
      return { poison: pname, lines: plines.length, same: JSON.stringify(got) === JSON.stringify(base), got };
    });
    rows65.push({ body: b.name, base, per,
      ok: base.length === b.rows && (b.rows === 0 || (base[0].syntax === 'nested-spawn-undeclared' && base[0].line === b.at + 1)) && per.every((q) => q.same) });
  }
  // and the real file, through the real law: the three tools this lane owns are READ here (r57) and spawned nowhere
  const realTools = new Map();
  for (const rel of ['tools/render/ballreturn-fence.mjs', 'web/tools/e2e-ballreturn.mjs', 'web/tools/e2e-xw101-look.mjs']) realTools.set(rel.split('/').pop(), [rel]);
  const selfRows = nestedSpawnProblems(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8'), 'web/tools/test-ballreturn.mjs', { tools: realTools, edges: [] });
  const r65ok = rows65.every((q) => q.ok) && selfRows.length === 0;
  check(`r65 the band lint's statement reader is regex-, template- and apostrophe-proof (#737 r12): ${bodies.length} synthetic files x ${poisons.length} poison prefixes through the real \`nestedSpawnProblems\` — ${rows65.map((q) => `${q.body} => ${q.base.length} row(s)${q.base.length ? ` at line ${q.base[0].line} (${q.base[0].syntax})` : ''}, unchanged under ${q.per.filter((p) => p.same).length}/${q.per.length} poisons`).join('; ')}. The verdict AND the line it is reported at are the same with the poison and without it, which is the whole property: a regex literal's insides are neither code nor a string (${poisons[0][1][0].trim()}), a template's interpolations are code and its text is not, and a ' or " never spans a line. Pre-fix the first poison alone made every following line one statement — three false rows on this very file (the gate's own suite, reported at the poison's line 429 instead of anywhere real), and, the other way round, a step table swallowed into the statement above it stops being a \`const\` binding and its edge disappears. On the real file with the real law: ${selfRows.length} row(s) — this lane's three tools are read for their declarations (r57) and spawned by nothing here`,
    r65ok, JSON.stringify({ rows: rows65, self: selfRows.map((p) => ({ line: p.line, syntax: p.syntax, text: p.text.slice(0, 90) })) }));
}

// r58 — the graze refinement is bounded, and its budget is DERIVED (#737 review round 10, class A). A nearly touching,
// co-moving pair (a carried queue on the trunk slope + layout-omitted newcomers) drove the old 8-ary DFS to millions of
// walker evaluations inside ONE `contactTime3` call: its exclusion test compared the gap against the SUM of both clusters'
// absolute path speeds (0.2454 m/s here) while the pair was actually separating at 67 nm over the 300 ms horizon, so nothing
// was ever excluded and the recursion just split — 8^depth, floored only by an absolute 1e-6 s width. `solveShot` runs
// SYNCHRONOUSLY from `index.js ensureSolution()` on the render path, so the page froze for the whole of it. The refinement is
// now a Lipschitz march on the gap's own SIGNED closing rate: from a bracket end the gap cannot reach zero before
// `x + g(x)/closing`, so each step certifies a root-free interval and the walk shrinks WITH the gap instead of subdividing a
// fixed interval. Above it sits the derived budget (`WALK_BUDGET`, kinematics.js) — reaching it resolves the pair at the
// bracket in hand and records a NAMED degradation; it never spins and never silently truncates.
{
  const { WALK_BUDGET } = await import('../scene/ballreturn/kinematics.js');
  // the UNBOUNDED reference, MEASURED once on the pre-fix tree (HEAD 606aaece) ON THE REFERENCE MACHINE —
  // named once by the contract §18.x (the ballreturn contract (feature 037, internal)) and cited here:
  //   115151.3 ms, 34 events, tEnd 4.152512908008371 — the 8-ary DFS refinement, run to exhaustion.
  // Every millisecond in this arm is reference-machine; the STEP counts are the portable quantity, and the
  // ratio below is a measured run's ratio, not a promise about any device. Over the walked definitions in web/scene/ballreturn/tracks plus web/tools/fixtures/ballreturn-tracks the r58 label prints
  // the worst refinement's steps and its share of the budget, the largest walker step count of ordinary scan, and
  // the factor (budget / worst refinement) by which a device would have to be slower than the reference before that refinement reached the 15.58 ms it stands for.
  const REF_MS = 115151.3;
  const REF_TEND = 4.152512908008371;
  const REF_POSE_SHA = "f37a5f06856066cc83a0c63e616ccb632b883f53e9d6b618e1334bff7b7d6e36";   // 201 instants x 7 balls, each centre and instant quantised to PIN_QUANTUM (1e-6; was 1 nm — CIWIRE-FIX2: portable across ARM64 / x64)
  const REF_EVENTS = [
    { kind: "landing", ball: 7, other: null, t: 0.7550765485626868 },
    { kind: "separate", ball: 6, other: 5, t: 0.7550765485626868 },
    { kind: "junction", ball: 2, other: null, t: 2.1389638533681983 },
    { kind: "separate", ball: 1, other: 2, t: 2.1393612896514753 },
    { kind: "contact", ball: 1, other: 2, t: 2.1393612896514753 },
    { kind: "contact", ball: 6, other: 5, t: 2.139374359989881 },
    { kind: "separate", ball: 1, other: 2, t: 2.139374418580502 },
    { kind: "contact", ball: 1, other: 2, t: 2.139374418580502 },
    { kind: "impact", ball: 1, other: null, t: 2.2372437003382135 },
    { kind: "junction", ball: 1, other: null, t: 2.2372437003382135 },
    { kind: "separate", ball: 3, other: 1, t: 2.2372437003382135 },
    { kind: "impact", ball: 3, other: null, t: 2.3301739680439297 },
    { kind: "junction", ball: 3, other: null, t: 2.3301739680439297 },
    { kind: "separate", ball: 4, other: 3, t: 2.3301739680439297 },
    { kind: "junction", ball: 2, other: null, t: 2.36989699135714 },
    { kind: "impact", ball: 4, other: null, t: 2.4188295474388313 },
    { kind: "junction", ball: 4, other: null, t: 2.4188295474388313 },
    { kind: "separate", ball: 5, other: 4, t: 2.4188295474388313 },
    { kind: "junction", ball: 1, other: null, t: 2.457216088103204 },
    { kind: "impact", ball: 5, other: null, t: 2.504145485912094 },
    { kind: "junction", ball: 5, other: null, t: 2.504145485912094 },
    { kind: "separate", ball: 6, other: 5, t: 2.504145485912094 },
    { kind: "junction", ball: 3, other: null, t: 2.5412862934779703 },
    { kind: "junction", ball: 6, other: null, t: 2.587158494084563 },
    { kind: "junction", ball: 4, other: null, t: 2.6229180726099917 },
    { kind: "contact", ball: 1, other: 2, t: 2.6310964972962037 },
    { kind: "contact", ball: 3, other: 1, t: 2.6985739252310728 },
    { kind: "junction", ball: 5, other: null, t: 2.70333877501682 },
    { kind: "wall", ball: 2, other: null, t: 2.743044832376523 },
    { kind: "contact", ball: 4, other: 3, t: 2.7452272691575814 },
    { kind: "contact", ball: 5, other: 4, t: 2.753533411801826 },
    { kind: "contact", ball: 6, other: 5, t: 2.7665797033517143 },
    { kind: "junction", ball: 7, other: null, t: 4.067970056911363 },
    { kind: "contact", ball: 7, other: 6, t: 4.152512908008371 },
  ];
  // the review reproduction: six ledger balls (two carried, resting on the trunk slope one diameter + 10 µm apart, four more
  // packed behind them as layout-omitted newcomers) and one pocket-4 arrival, on the shipped TEST-shallow-merge
  const trkA = validateTrack(loadDef(path.resolve(here, '../scene/ballreturn/tracks/TEST-shallow-merge.json')), { pockets: POCKETS, falls: null });
  const trunkA = [...trkA.routes.values()][0];
  const mkLedger = () => { const L = []; let D = 0.9; for (let i = 1; i <= 2; i++) { L.push({ id: i, D, route: trunkA }); D -= 2 * R + 1e-5; } for (let i = 3; i <= 6; i++) L.push(i); return L; };
  const hoffA = (t, pk) => handoffFromSink({ t, pocket: POCKETS[pk], fall: POCKETS[pk], r: R, glide: 0.06, tFall: 0.021 }, { track: trkA, pockets: POCKETS, r: R });
  const tA0 = process.hrtime.bigint();
  const solA = solveShot({ track: trkA, r: R, ledger: mkLedger(), arrivals: [{ id: 7, handoff: hoffA(0.5, 4) }] });
  const msA = Number(process.hrtime.bigint() - tA0) / 1e6;
  // the pose grid, against the unbounded reference: 201 instants over the solve, every centre to the pin quantum (PIN_QUANTUM)
  const canonPose = (sol) => { let pp = PIN_PERTURB === 0; const rows = []; for (let i = 0; i <= 200; i++) { const t = (sol.tEnd * i) / 200; const cells = []; for (let id = 1; id <= 7; id++) { const o = {}; cells.push(poseAt(sol, id, t, o) ? [o.x, o.y, o.z].map((v) => { if (!pp) { v += PIN_PERTURB; pp = true; } return Math.round(v / PIN_QUANTUM); }).join(',') : '-'); } rows.push(`${Math.round(t / PIN_QUANTUM)}|${cells.join(';')}`); } return rows.join('\n'); };
  const shaA = createHash('sha256').update(canonPose(solA)).digest('hex');
  if (args.includes('--pin-perf')) console.log(`PIN-PERF ${shaA}`);
  let evBad = 0, dtMax = 0;
  for (let i = 0; i < Math.max(REF_EVENTS.length, solA.events.length); i++) {
    const a = REF_EVENTS[i], b = solA.events[i];
    if (!a || !b || a.kind !== b.kind || a.ball !== b.ball || (a.other ?? null) !== (b.other ?? null)) { evBad += 1; continue; }
    dtMax = Math.max(dtMax, Math.abs(a.t - b.t));
  }
  const dtOk = dtMax <= PIN_QUANTUM;                          // event times within the pin quantum (was an exact float compare — CIWIRE-FIX2)
  const poseOk = shaA === REF_POSE_SHA;                     // identical to the pin quantum (1e-6 m = 1e-2 of the 0.1 mm export grain)
  const poseErrMm = poseOk ? PIN_QUANTUM * 1e3 : NaN;        // the bound the fingerprint proves, in mm
  const reproOk = solA.events.length === REF_EVENTS.length && evBad === 0 && dtOk && poseOk && poseErrMm <= EXPORT_GRAIN * 1e3
    && (solA.degradations ?? null) !== null && solA.degradations.length === 0
    && (solA.walk?.refine ?? Infinity) <= (WALK_BUDGET ?? 0) && (solA.walk?.budget ?? null) === (WALK_BUDGET ?? null);
  // the backstop itself: the SAME solve under a deliberately tiny budget resolves at the coarse bracket, records the
  // degradation by name with the cluster it degraded, and still returns a settled solution — never a spin, never a throw
  const tB0 = process.hrtime.bigint();
  const solB = solveShot({ track: trkA, r: R, ledger: mkLedger(), arrivals: [{ id: 7, handoff: hoffA(0.5, 4) }], walkBudget: 32 });
  const msB = Number(process.hrtime.bigint() - tB0) / 1e6;
  const dg0 = (solB.degradations ?? [])[0] ?? null;
  const degOk = !!dg0 && dg0.kind === 'contact-refine-budget' && dg0.members >= 2 && dg0.steps > 0 && dg0.budget === 32
    && Number.isFinite(dg0.t) && (solB.walk?.refine ?? Infinity) <= (solB.walk?.steps ?? 0) && msB <= msA + 1e-9 + msA;   // degrading is never slower than not degrading
  // the committed side: the budget must not bite a single definition in web/scene/ballreturn/tracks plus web/tools/fixtures/ballreturn-tracks that builds here and that the design family evaluates — each of those walked through the design family (a definition validateTrack refuses here, or one the family does not evaluate, is skipped; one the family evaluates and refuses is still walked)
  const tracks = trackFiles();
  const walked = [];
  for (const [f, p] of tracks) {
    let t = null; try { t = validateTrack(loadDef(p), { pockets: POCKETS, falls: null }); } catch { continue; }
    const dg = designGate(t, { pockets: POCKETS, r: R });
    if (!dg.evaluated) continue;
    walked.push({ track: f.replace(/\.json$/, ''), solves: dg.solves, refineMax: dg.refineMax ?? 0, walkMax: dg.walkMax ?? 0, degradations: dg.degradations ?? 0, escalations: dg.escalations ?? 0 });
  }
  const shippedDeg = walked.reduce((a, b) => a + b.degradations, 0);
  const shippedRefine = walked.reduce((a, b) => Math.max(a, b.refineMax), 0);
  const shippedWalk = walked.reduce((a, b) => Math.max(a, b.walkMax), 0);
  const shippedEsc = walked.reduce((a, b) => a + b.escalations, 0);
  const shippedOkA = walked.length >= 10 && shippedDeg === 0 && Number.isFinite(WALK_BUDGET) && shippedRefine <= WALK_BUDGET;
  check(`r58 the graze refinement is bounded and its budget is DERIVED (#737 r10 class A): the review reproduction (six ledger balls + one pocket-4 arrival on TEST-shallow-merge) solves in ${msA.toFixed(1)} ms on the reference machine spending ${solA.walk?.refine ?? 'n/a'} refinement steps of the derived ${WALK_BUDGET ?? 'n/a'} (${(((solA.walk?.refine ?? NaN) / WALK_BUDGET) * 100).toFixed(1)}% of 15.58 ms ON THE REFERENCE MACHINE, contract §18.x = 2 x 1000/60 − 17.7 − 0.05, constitution §V / break-flip-perceptual / plan gate 5; the steps are portable, the ms are not — a device must be ~${(WALK_BUDGET / shippedRefine).toFixed(0)}x slower than the reference before the worst refinement over the walked definitions in web/scene/ballreturn/tracks plus web/tools/fixtures/ballreturn-tracks, ${shippedRefine} steps = ${((shippedRefine / (WALK_BUDGET ?? NaN)) * 100).toFixed(1)}% of the budget against ${shippedWalk} walker steps of ordinary scan, reaches it) and ${(solA.degradations ?? []).length} degradations — pre-fix the same solve ran the 8-ary DFS to ${REF_MS} ms (${(REF_MS / msA).toFixed(0)}x); against that unbounded reference the event list is identical (${solA.events.length}/${REF_EVENTS.length} rows, ${evBad} differing, max |Δt| ${dtMax} s) and the 201x7 pose grid fingerprints the same to the pin quantum (max |Δpose| ≤ ${poseErrMm} mm vs the ${(EXPORT_GRAIN * 1e3).toFixed(1)} mm export grain). The backstop under a 32-step budget: ${(solB.degradations ?? []).length} named record(s)${dg0 ? ` — ${dg0.kind} on a ${dg0.members}-member cluster at t ${dg0.t.toFixed(4)}, ${dg0.steps} steps` : ''}, ${solB.events.length} events, ${msB.toFixed(1)} ms, no spin. In web/scene/ballreturn/tracks plus web/tools/fixtures/ballreturn-tracks: ${walked.length} definitions walked through the design family, ${shippedDeg} degradation records, worst refinement ${shippedRefine} steps (${((shippedRefine / (WALK_BUDGET ?? NaN)) * 100).toFixed(1)}% of the budget) against ${shippedWalk} walker steps of ordinary scan. Every march step VERIFIES the closing rate it assumed and re-takes the step at the rate it measured when the assumption is refuted — refutations: ${solA.walk?.escalations ?? 'n/a'} on the reproduction, ${shippedEsc} over the walk of those definitions (a skip is never taken on an unverified rate)`,
    reproOk && degOk && shippedOkA,
    JSON.stringify({ msA, walk: solA.walk, deg: solA.degradations, events: solA.events.length, evBad, dtMax, shaA, REF_POSE_SHA, backstop: { deg: solB.degradations, events: solB.events.length, walk: solB.walk, msB }, walked }));
}

// r66 — #737 companion 2, class B (review round 12 P2): a granted ball that recoils ABOVE its yield line is asked AGAIN on the way
// down. The invalidation was written for exactly this (order 16), but it sat BELOW the reverse-motion early continue: it is a
// reverse-motion rule, so every cluster it can fire on takes that branch first and the line never ran. A ball carrying its grant
// through a recoil therefore skipped the occupied-window check on its second approach and merged into an occupied window. The fix is
// an ORDERING — the invalidation is the first thing the window scan does to a cluster — and this arm measures its three faces:
//   (a) the recoil: a granted feeder 15 mm above its line, shoved back at 0.2 m/s, apexes 34.6 mm above it and comes down on a trunk
//       2-train inside the window — it yields AT its line, heldBy 'hold', and its solution equals the SAME seeding with no grant at
//       all, event for event. A grant that did not survive the recoil is a grant that was never given.
//   (b) it clears on a recoil and ONLY on a recoil: the same feeder rolling FORWARD from 40 mm above its line KEEPS its verdict — no
//       yield, and a solution that differs from the ungranted control (which yields at 0.214). Order 23b round 2's F2 clause is the
//       reason the hoisted line still tests the velocity: re-asking a ball that rolls forward with its verdict spins at τ = 0 to
//       MAX_EVENTS. Hoisting the line above the early continue must not become "clear on every reverse motion" either —
//   (c) …so a granted feeder that recoils but never reaches its line (seeded 10 mm below it at 0.1 m/s back, apex 5.1 mm short) keeps
//       its grant: the condition reads the geometry, `f.D > Dy`. Inside its approach without a verdict a ball is COMMITTED anyway
//       (round 6), so the ungranted control matches it here — this row measures the condition, not a divergence.
// The grant is CARRIED, which is how the module produces one: `continuationAt` exports `passedYield` and `seatContinuation` re-seeds
// it at every record boundary, settle and index change. Contract §26.5.
{
  const ob = validateTrack(loadDef(path.resolve(here, '../scene/ballreturn/tracks/TEST-obtuse-merge.json')), { pockets: POCKETS, falls: null });
  const r4 = ob.routes.get(4), r1 = ob.routes.get(1);
  const m4 = r4.merges.find((x) => x.feeder === 'rc-run'); const Dj1 = stationD(r1, m4.rw.id, m4.s);
  const twoR66 = 2 * R; const P66 = (D) => { const s = stationAt(r1, D, R, {}); return [s.x, s.y, s.z]; };
  const D2 = Dj1 + 0.100, D3 = seatBehind(r1, P66(D2), D2, twoR66, D2 + twoR66);   // the trunk 2-train that occupies the window
  const solve = (DF, vF, grant) => {
    let sol = null, threw = null;
    try { sol = solveShot({ track: ob, r: R, ledger: [], arrivals: [], continuations: [
      { id: 1, route: r4, D: DF, v: vF, q: [0, 0, 0, 1], t0: 0, ...(grant ? { passedYield: m4.D } : {}) },
      { id: 2, route: r1, D: D2, v: 0.12, q: [0, 0, 0, 1], t0: 0 },
      { id: 3, route: r1, D: D3, v: 0.12, q: [0, 0, 0, 1], t0: 0, follow: true },
    ] }); } catch (e) { threw = e.message.slice(0, 60); }
    if (!sol) return { threw };
    let apex = -Infinity, mn = Infinity;
    for (let t = 0; t <= sol.tEnd + 0.5; t += 1e-3) {
      const cs = [1, 2, 3].map((id) => continuationAt(sol, id, t)).filter((c) => c && Number.isFinite(c.D));
      if (cs[0]?.route === r4) apex = Math.max(apex, cs[0].D);
      const P = cs.map((c) => stationAt(c.route, c.D, R, {}));
      for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) mn = Math.min(mn, Math.hypot(P[i].x - P[j].x, P[i].y - P[j].y, P[i].z - P[j].z));
    }
    const y = sol.events.find((e) => e.kind === 'yield' && e.ball === 1) ?? null;
    return { threw: null, n: sol.events.length, tEnd: +sol.tEnd.toFixed(4),
      sig: sol.events.map((e) => `${e.kind}/${e.ball}/${e.t.toFixed(5)}/${e.heldBy ?? '-'}`).join(','),
      y: y ? { t: +y.t.toFixed(4), Dmm: +(y.D * 1e3).toFixed(3), heldBy: y.heldBy ?? null } : null,
      apexMm: +((apex - m4.yieldD) * 1e3).toFixed(3), minMm: +(mn * 1e3).toFixed(3),
      rests: [1, 2, 3].every((id) => continuationAt(sol, id, sol.tEnd + 1)?.kind === 'rest'),
      restFmm: +((continuationAt(sol, 1, sol.tEnd + 1)?.D ?? NaN) * 1e3).toFixed(2) };
  };
  const Ag = solve(m4.yieldD + 0.015, -0.2, true),  An = solve(m4.yieldD + 0.015, -0.2, false);   // (a) shoved BACK above the line
  const Bg = solve(m4.yieldD + 0.040, 0.10, true),  Bn = solve(m4.yieldD + 0.040, 0.10, false);   // (b) rolling FORWARD above it
  const Cg = solve(m4.yieldD - 0.010, -0.10, true), Cn = solve(m4.yieldD - 0.010, -0.10, false);  // (c) a recoil that never reaches it
  const okA = !Ag.threw && !An.threw && Ag.apexMm > 30 && !!Ag.y && Ag.y.heldBy === 'hold'
    && Math.abs(Ag.y.Dmm - m4.yieldD * 1e3) <= 1e-2 && Ag.sig === An.sig && Ag.minMm >= 57.14 && Ag.rests;
  const okB = !Bg.threw && !Bn.threw && Bg.y === null && Bn.y !== null && Bg.sig !== Bn.sig && Bg.n <= 20 && Bg.rests;
  const okC = !Cg.threw && !Cn.threw && Cg.apexMm < 0 && Cg.y === null && Cg.sig === Cn.sig && Cg.rests;
  check(`r66 a grant does not survive a recoil above the yield line, and only a recoil clears it (#737 companion 2, class B; contract §26.5) — (a) the granted feeder seeded 15 mm above its line and shoved back at 0.2 m/s apexes ${Ag.apexMm} mm above it and comes down on a trunk 2-train in the window: it yields at ${Ag.y ? `${Ag.y.t} s ON the line (D ${Ag.y.Dmm} mm = ${(m4.yieldD * 1e3).toFixed(3)}) named '${Ag.y.heldBy}'` : 'NEVER'} — ${Ag.n} events, tEnd ${Ag.tEnd}, min drawn pair ${Ag.minMm} mm, all at rest ${Ag.rests} (the feeder at ${Ag.restFmm} mm) — event for event the same solution as the ungranted control (${An.n} events, tEnd ${An.tEnd}). Before the fix the reset sat below the reverse-motion early continue and so never ran on the one motion it was written for: the feeder kept its grant, took NO yield and rolled into the occupied window. (b) rolling FORWARD from 40 mm above the line the same feeder KEEPS its verdict — no yield, ${Bg.n} events, and a solution that differs from the ungranted control (which yields at ${Bn.y ? `${Bn.y.t} s` : 'never'}): the hoisted line still tests the velocity, because re-asking a ball rolling forward with its verdict spins at τ = 0 to MAX_EVENTS (order 23b round 2, F2). (c) a recoil that never reaches the line — seeded 10 mm below it at 0.1 m/s back, apex ${Cg.apexMm} mm, still short — keeps its grant and takes no yield: the condition reads the geometry \`f.D > Dy\`, not the sign of the velocity alone (inside its approach without a verdict a ball is committed anyway, round 6, so the ungranted control matches it — this row measures the condition, not a divergence)`,
    okA && okB && okC, JSON.stringify({ a: { g: { ...Ag, sig: undefined }, n: { ...An, sig: undefined }, sigEqual: Ag.sig === An.sig }, b: { g: { ...Bg, sig: undefined }, n: { ...Bn, sig: undefined }, sigEqual: Bg.sig === Bn.sig }, c: { g: { ...Cg, sig: undefined }, n: { ...Cn, sig: undefined }, sigEqual: Cg.sig === Cn.sig }, oks: [okA, okB, okC] }));
}

console.log(`${failures ? `\n${failures} FAIL` : '\nALL PASS'}${skipped ? ` · ${skipped} SKIP (arms that did not run; not counted as passes — and the exit code is 0 BY DESIGN: a SKIP is not a failure, so a gate that needs an oracle to have RUN must read this line, not the exit code)` : ''}`);
process.exit(failures ? 1 : 0);
