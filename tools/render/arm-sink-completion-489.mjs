#!/usr/bin/env node

// Copyright (c) Meta Platforms, Inc. and affiliates.

// arm-sink-completion-489.mjs — GH-489 #637 landing (ORDER-SNOOKER-637-LAND-16 Z2, review round 3 P2): the node LEAF arm of the
// ONE un-padded sink-completion function (framestep.js sinkCompletionSec) that realtime playback (game.js) and the offline export
// plan (offline-render.js runExport / the drill segment builder / export.js's estimate) now share.
//
// Chrome-free, kernel-replay: the e2e-snooker S2p lane is simulated with the tree's own wasm (byte for byte the mirror
// check-sink-clearance-489.mjs's setup), every BallPocket event's pivot is built by the tree's OWN sinkpivot.js buildSinkPivot (the
// same call game.js makes, with the tree's pocketVisualFalls / pocketPlateDatums), and the sink entries { t, pivot: { tEnd } } feed
// sinkCompletionSec exactly as game.sinkInfo does in the browser.
//   rows:   S2p v0 = 0.94 and v0 = 0.935 (the slow final-event scratches whose LAST drop ends after the record) and v0 = 1.2 (the
//           suite's S2p-scratch record: the cue's capture IS the record's last event, its drop ends 0.25 s past it) → the plan
//           (planPlayback over max(duration + cueTail, completion) with tailSec = TAIL_SEC; cueTail = 0 in node) must reach the
//           last drop's end + TAIL_SEC. 'Planned end' (CORRIGENDUM-1 C3) is asserted BOTH ways and both are printed: the NOMINAL
//           plan end plan.frames × FDT ≥ completion + TAIL_SEC, and the last frame's clock timeAt(frames − 1) ≥ completion +
//           TAIL_SEC − FDT (the last frame's clock trails the nominal end by up to one frame by construction). The final frame's
//           clock maps through poseInSink to the LANDED state — the predicate is poseInSink(p, tLast − s.t) === null (sinkpivot.js
//           sinkEndTime defines tEnd as the first culled dt; the pose one millisecond before tEnd still exists), or, when tEnd ===
//           ttl (a pivot whose pose never nulls), equal to poseInSink(p, ttl).
//   C1:     the REALTIME deadline keeps today's shape: max(duration + SETTLE_PAD, completion) — for every row the value equals
//           today's expression (game.js:2330-2331 at 4beb17bf, the same guard) to the bit: v0 = 1.2 and 2.5 are the corrigendum's
//           named records (settleAt unchanged: a refactor). A plant that PADS the completion (completion + SETTLE_PAD) moves the
//           v0 = 1.2 record's settleAt by > 1e-3 → e2e-snooker.mjs judgeSettle's normal-speed law (:2197, kept verbatim) goes RED.
//   C2:     entries with pivot null / tEnd undefined / a null entry → completion = duration, the plan byte-identical to today's,
//           never NaN / TypeError (today's guard verbatim inside sinkCompletionSec).
//   control: S2p v0 = 2.5 (the drop ends inside the record) → the plan is BYTE-IDENTICAL to today's (duration + tail).
//   plant:  the completion IGNORES the sink entries (completion = duration) → the three extending rows go RED (planned end short by
//           ≈ the drop's overhang) — the leaf's own red cell; the browser call-site coverage is web/tools/e2e-export-z2.mjs (a boot).
// exit 0 = ARMED (every cell as required incl. the plant RED); 1 = NOT ARMED; 2 = REFUSED (no tree / no leaf capability).
//   node tools/render/arm-sink-completion-489.mjs [--web <web dir>] [--json <out.json>]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { parseArgv: __parseArgv } = await import('./lib/argv.mjs');
const __P = __parseArgv({ tag: 'sink-completion-arm', value: ['--web', '--json'], bool: [] });
const here = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(__P.value('--web') ?? path.join(here, '..', '..', 'web'));
const JSON_OUT = __P.value('--json') ?? null;
const TABLE = 'wpbsa_snooker_12ft';
for (const f of ['scene/table.js', 'app/sinkpivot.js', 'app/framestep.js', 'dist/pool-wasm/pool_wasm.js', 'dist/pool-wasm/pool_wasm_bg.wasm', 'vendor/three.module.min.js']) {
  if (!fs.existsSync(path.join(WEB, f))) { console.error(`[sink-completion-arm] REFUSED — ${WEB} has no ${f}: not a web tree`); process.exit(2); }
}
// the tree's three for its bare `import 'three'` (the mirror's instrument, verbatim)
const root = path.dirname(WEB);
const vendor = fs.readFileSync(path.join(WEB, 'vendor', 'three.module.min.js'));
const nm = path.join(root, 'node_modules', 'three');
fs.mkdirSync(nm, { recursive: true });
const idx = path.join(nm, 'index.js'), pkg = path.join(nm, 'package.json');
const pkgJson = JSON.stringify({ name: 'three', version: '0.0.0-vendored-copy', type: 'module', main: 'index.js', module: 'index.js' }, null, 2) + '\n';
if (!fs.existsSync(idx) || !fs.readFileSync(idx).equals(vendor)) fs.writeFileSync(idx, vendor);
if (!fs.existsSync(pkg) || fs.readFileSync(pkg, 'utf8') !== pkgJson) fs.writeFileSync(pkg, pkgJson);
const tableUrl = pathToFileURL(path.join(WEB, 'scene', 'table.js'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ob-sink-completion-arm-'));
let src = fs.readFileSync(path.join(WEB, 'scene', 'table.js'), 'utf8');
src = src.replace(/(from\s+|import\s*\(\s*)(['"])([^'"]+)\2/g, (a, pre, q, spec) => {
  if (spec === 'three') return `${pre}${q}${pathToFileURL(idx).href}${q}`;
  if (spec.startsWith('.')) return `${pre}${q}${new URL(spec, tableUrl).href}${q}`;
  return a;
});
const tableCopy = path.join(tmp, 'table.__completion__.mjs');
fs.writeFileSync(tableCopy, src);
let T, S, F, W;
try {
  T = await import(pathToFileURL(tableCopy).href);
  S = await import(pathToFileURL(path.join(WEB, 'app', 'sinkpivot.js')).href);
  F = await import(pathToFileURL(path.join(WEB, 'app', 'framestep.js')).href);
  W = await import(pathToFileURL(path.join(WEB, 'dist', 'pool-wasm', 'pool_wasm.js')).href);
  await W.default({ module_or_path: fs.readFileSync(path.join(WEB, 'dist', 'pool-wasm', 'pool_wasm_bg.wasm')) });
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
if (typeof F.sinkCompletionSec !== 'function') { console.error(`[sink-completion-arm] REFUSED — ${WEB}/app/framestep.js exports no sinkCompletionSec (a pre-LAND-16 tree)`); process.exit(2); }
if (typeof S.buildSinkPivot !== 'function' || typeof S.poseInSink !== 'function') { console.error('[sink-completion-arm] REFUSED — sinkpivot.js exports no buildSinkPivot / poseInSink'); process.exit(2); }
const G = T.makeGeom(TABLE);
const VISUAL = T.pocketVisualFalls(TABLE, { contract: 'kernel' }); // LAND-26 (i): the same opted call game.js makes
const PLATE = typeof T.pocketPlateDatums === 'function' ? T.pocketPlateDatums(TABLE) : null;
if (!Array.isArray(VISUAL) || !Array.isArray(PLATE)) { console.error(`[sink-completion-arm] REFUSED — ${TABLE} exports no visual falls / plate datums`); process.exit(2); }
const R = 0.02625;
const nearest = (arr, x, z, maxD2 = Infinity) => { let best = null, bd = maxD2; for (const c of arr) { const d = (c.x - x) ** 2 + (c.z - z) ** 2; if (d < bd) { bd = d; best = c; } } return best; };
// the S2p lane, byte for byte (e2e-snooker.mjs / the mirror)
const CTR = { x: 0.9209965818486914, y: 1.8164965818486913 }, ANCHOR = { x: 0.25, y: 1.0 };
const U = (() => { const dx = CTR.x - ANCHOR.x, dy = CTR.y - ANCHOR.y, n = Math.hypot(dx, dy); return { x: dx / n, y: dy / n }; })();
const LANE = (t) => ({ x: CTR.x - U.x * t, y: CTR.y - U.y * t });
const SPHI = Math.atan2(U.y, U.x);
const SHOTS = [
  { tag: 'S2p v0 0.94 (the SNK-R37 A1 slow scratch)', v0: 0.94, slow: true },
  { tag: 'S2p v0 0.935 (the lens row: tEnd past the cue-enabled cover)', v0: 0.935, slow: true },
  { tag: 'S2p v0 1.2 (the suite S2p-scratch record: the capture is the last event)', v0: 1.2, slow: true, c1Named: true },
  { tag: 'S2p v0 2.5 (CONTROL: the drop ends inside the record)', v0: 2.5, slow: false, c1Named: true },
];
const SETTLE_PAD = 0.4; // game.js:24 (the frozen file exports no constant)
/** the sink entries game.js's sinkIndex would hold for this record: one per BallPocket event, pivot built by the tree's leaf */
function sinkEntries(sc, rec) {
  const r = JSON.parse(rec);
  const sm = W.WasmSampler.from_record_json(rec);
  const n = sm.sample_into(0, new Float64Array(0));
  const buf = new Float64Array(n * 8);
  const entries = [];
  for (const e of r.events.filter((ev) => ev.kind && ev.kind.BallPocket)) {
    const id = e.kind.BallPocket.ball, i = sc.system.balls.findIndex((b) => b.id === id);
    let tPrev = 0;
    for (const pe of r.events) { if (pe.t >= e.t) break; if (pe.post && pe.post.some(([id2]) => id2 === id)) tPrev = pe.t; }
    const leg = e.t - tPrev, tb = Math.max(0, e.t - (leg > 0 ? Math.min(1e-6, leg / 2) : 1e-6)), ta = Math.min(tb, Math.max(tPrev, tb - 0.02));
    sm.sample_into(ta, buf); const prev = { x: buf[8 * i + 1], y: buf[8 * i + 2], z: buf[8 * i] };
    sm.sample_into(tb, buf); const pos = { x: buf[8 * i + 1], y: buf[8 * i + 2], z: buf[8 * i] };
    const premotion = buf[8 * i + 7];
    const dtv = Math.max(tb - ta, 1e-12);
    const vel = { x: (pos.x - prev.x) / dtv, z: (pos.z - prev.z) / dtv };
    const pocket = nearest(G.pockets, pos.x, pos.z);
    const fall = nearest(VISUAL, pocket.x, pocket.z, 0.12 * 0.12) || pocket;
    const gate = premotion !== 5 && pos.y < R * 1.25;
    const pivot = gate ? S.buildSinkPivot({ x0: pos.x, z0: pos.z, vx: vel.x, vz: vel.z, wx: 0, wy: 0, wz: 0, q0: [0, 0, 0, 1], px: fall.x, pz: fall.z, pr: fall.r, r: R, falls: VISUAL, throats: PLATE }) : null;
    entries.push({ id, t: e.t, pivot, tEnd: pivot ? pivot.tEnd : null });
  }
  sm.free();
  const duration = r.events.length ? r.events[r.events.length - 1].t : 0;
  return { entries, duration };
}
const { FDT, TAIL_SEC, planPlayback, sinkCompletionSec } = F;
const plantCompletion = (duration) => duration; // the PLANT: the leaf ignores the sink entries (the pre-LAND-16 export plan)
const round6 = (v) => +v.toFixed(6);
const results = []; let armed = true; const padRedRows = []; let cellCount = 0;
const cellZ = (name, ok, detail) => { cellCount += 1; armed = armed && ok; console.log(`[sink-completion-arm] ${name}: ${ok ? 'as required' : 'NOT as required'} — ${detail}`); results.push({ tag: name, ok, detail }); };
// LAND-17 Z2b: two extending drops in BOTH orders → the max (the pivot shape); a non-finite duration → a finite result ≥ 0
{
  const two = [{ t: 1.6, pivot: { tEnd: 1.2 } }, { t: 2.0, pivot: { tEnd: 0.3 } }];
  const fwd = sinkCompletionSec(2.0, two), rev = sinkCompletionSec(2.0, [...two].reverse());
  cellZ('Z2b two extenders, forward order [{1.6,+1.2},{2.0,+0.3}] with duration 2.0 → 2.8 (max_i, not the first extender)', Math.abs(fwd - 2.8) < 1e-12, `${fwd}`);
  cellZ('Z2b two extenders, reversed order → 2.8 (a first-extender plant reads 2.3 here)', Math.abs(rev - 2.8) < 1e-12, `${rev}`);
  const nf = sinkCompletionSec(NaN, [{ t: 0.2, pivot: { tEnd: 0.16 } }]), un = sinkCompletionSec(undefined, []);
  cellZ('Z2b exact pins: sinkCompletionSec(NaN, [{t 0.2, tEnd 0.16}]) === 0.36 and sinkCompletionSec(undefined, []) === 0 (a dropped duration guard returns NaN; a constant-0 plant fails the first)', Math.abs(nf - 0.36) < 1e-12 && un === 0, `NaN → ${nf}, undefined → ${un}`);
}
// C2: the guard cells — a null pivot, a leaf without tEnd, a null entry, a non-finite tEnd → completion = duration, never NaN / TypeError
{
  const dur = 1.8105;
  const cases = [['pivot null', [{ t: 0.2225, pivot: null }]], ['tEnd undefined', [{ t: 0.2225, pivot: {} }]], ['entry null', [null]], ['tEnd NaN', [{ t: 0.2225, pivot: { tEnd: NaN } }]], ['no entries', []], ['mixed: one finite, one null pivot', [{ t: 0.2225, pivot: { tEnd: 0.1601 } }, { t: 1.0, pivot: null }]]];
  let c2ok = true; const c2 = [];
  for (const [name, entries] of cases) {
    let got, err = null; try { got = sinkCompletionSec(dur, entries); } catch (e) { err = e; }
    const want = name.startsWith('mixed') ? dur : dur;
    const ok = !err && Number.isFinite(got) && got === want && planPlayback({ duration: Math.max(dur, got), slowmo: 1, tailSec: TAIL_SEC, maxSec: 60 }).frames === planPlayback({ duration: dur, slowmo: 1, tailSec: TAIL_SEC, maxSec: 60 }).frames;
    c2ok = c2ok && ok; c2.push({ name, got: err ? String(err) : got, ok });
    console.log(`[sink-completion-arm] C2 ${name}: completion ${err ? 'THREW ' + err.message : got} (want ${want}) ${ok ? 'as required' : 'NOT as required'}`);
  }
  armed = armed && c2ok; results.push({ tag: 'C2 guard cells', ok: c2ok, cells: c2 });
}
for (const sh of SHOTS) {
  const sc = JSON.parse(W.new_rack_scenario('snooker', 1n));
  sc.system.balls = sc.system.balls.filter((b) => [0, 1, 16, 17, 18, 19, 20, 21].includes(b.id));
  const place = { 0: LANE(0.95), 1: LANE(0.35) };
  for (const [id, p] of Object.entries(place)) { const b = sc.system.balls.find((q) => q.id === Number(id)); Object.assign(b.state.pos, { x: p.x, y: p.y }); }
  sc.shot = { ...sc.shot, v0: sh.v0, phi: SPHI, theta: 0, a: 0, b: 0 };
  const rec = W.simulate_json(JSON.stringify(sc));
  const rj = JSON.parse(rec);
  if (rj.error) { console.error(`[sink-completion-arm] ${sh.tag}: simulate error ${rj.error}`); armed = false; continue; }
  const { entries, duration } = sinkEntries(sc, rec);
  const ends = entries.filter((e) => Number.isFinite(e.tEnd)).map((e) => e.t + e.tEnd);
  const lastEnd = ends.length ? Math.max(...ends) : null;
  const completion = sinkCompletionSec(duration, entries.map((e) => ({ t: e.t, pivot: e.pivot })));
  const cueTail = 0; // node: no cue overhang probe (the browser row carries the cue-enabled plan)
  const today = planPlayback({ duration: duration + cueTail, slowmo: 1, tailSec: TAIL_SEC, maxSec: 60 });
  const plan = planPlayback({ duration: Math.max(duration + cueTail, completion), slowmo: 1, tailSec: TAIL_SEC, maxSec: 60 });
  const lastT = plan.timeAt(plan.frames - 1);
  const required = (lastEnd ?? duration) + TAIL_SEC;
  const nominalEnd = plan.frames * FDT;                 // C3: the NOMINAL plan end (≥ completion + TAIL_SEC by construction)
  const endOk = nominalEnd >= required - 1e-9 && lastT >= required - FDT - 1e-9; // both predicates, both printed
  // C1: the realtime deadline — today's expression (game.js:2330-2331 at 4beb17bf, guard verbatim) vs the re-cut max(duration + pad, completion)
  const settleToday = Math.max(duration + SETTLE_PAD, ...entries.map((e) => (Number.isFinite(e.pivot?.tEnd) ? e.t + e.pivot.tEnd : 0)));
  const settleNew = Math.max(duration + SETTLE_PAD, completion);
  const settlePadPlant = completion + SETTLE_PAD;      // the corrigendum's plant: the pad AFTER the completion
  const c1Same = Object.is(settleToday, settleNew);
  const legacy = duration + SETTLE_PAD;
  const normalSpeedRow = Math.abs(settleToday - legacy) <= 1e-3; // a judgeSettle(expectExtended=false) row: settleAt == duration + pad today
  const plantMoves = completion > duration + 1e-9;                // the pad plant changes the value only where the completion exceeds the duration
  // :2197 fails by name under the plant on a normal-speed row the plant MOVES (v0 1.2: completion 1.6961 on a 1.4491 record → 2.0961 vs 1.8491);
  // a row whose completion equals its duration (v0 2.5) reads the same under both and is no witness either way
  const padPlantRed = normalSpeedRow && plantMoves ? Math.abs(settlePadPlant - legacy) > 1e-3 : null;
  if (padPlantRed === true) padRedRows.push(sh.tag);
  // the final frame maps to the LANDED state: sinkpivot.js poseInSink returns null once the ball is below the shield (the cull that
  // defines tEnd = sinkEndTime), so at dt = lastT − s.t ≥ tEnd the pose is culled (null) while one millisecond before tEnd it still exists
  let landedOk = true; const landing = [];
  for (const e of entries) {
    if (!e.pivot) { landing.push({ id: e.id, note: 'no pivot (glide law) — not judged here' }); continue; }
    const atLast = S.poseInSink(e.pivot, Math.max(0, lastT - e.t), {});
    const justBefore = S.poseInSink(e.pivot, Math.max(0, e.tEnd - 1e-3), {});
    const neverNulls = Number.isFinite(e.pivot.ttl) && e.tEnd === e.pivot.ttl; // a pivot whose pose never nulls: landed = the pose at ttl
    const atTtl = neverNulls ? S.poseInSink(e.pivot, e.pivot.ttl, {}) : null;
    const landed = (lastT - e.t) >= e.tEnd - 1e-9 && (neverNulls
      ? (atLast !== null && atTtl !== null && JSON.stringify(atLast) === JSON.stringify(atTtl))
      : (atLast === null && justBefore !== null));
    landedOk = landedOk && landed; landing.push({ id: e.id, dtLast: round6(lastT - e.t), tEnd: round6(e.tEnd), predicate: neverNulls ? 'pose === poseInSink(p, ttl)' : 'poseInSink(p, tLast − s.t) === null', culledAtLast: atLast === null, poseJustBeforeEnd: justBefore ? round6(justBefore.y) : null, landed });
  }
  const controlOk = sh.slow ? true : (plan.frames === today.frames && plan.playSec === today.playSec);
  const plant = planPlayback({ duration: Math.max(duration + cueTail, plantCompletion(duration)), slowmo: 1, tailSec: TAIL_SEC, maxSec: 60 });
  const plantLastT = plant.timeAt(plant.frames - 1);
  const plantRed = sh.slow ? !(plantLastT >= required - FDT - 1e-9) : null; // the slow rows must go RED under the plant
  const rowOk = endOk && landedOk && controlOk && (sh.slow ? plantRed === true : true) && c1Same && (padPlantRed === null || padPlantRed === true);
  armed = armed && rowOk;
  console.log(`[sink-completion-arm] ${sh.tag} C1: settleAt today ${settleToday} == re-cut ${settleNew} ${c1Same ? 'bit-equal' : 'DIFFER'}${sh.c1Named ? ' (a corrigendum-named record)' : ''}; pad-plant ${round6(settlePadPlant)} vs duration + pad ${round6(legacy)} → ${padPlantRed === null ? (normalSpeedRow ? 'the plant does not move this row (completion = duration) — no witness' : 'an EXTENDED row (:2198 passes under both; the plant is caught by the normal-speed rows)') : (padPlantRed ? 'judgeSettle :2197 RED under the plant, as required' : 'NOT RED')}`);
  console.log(`[sink-completion-arm] ${sh.tag} C3: nominal end ${round6(nominalEnd)} (frames × FDT) ≥ required ${round6(required)} → ${nominalEnd >= required - 1e-9}; last frame clock ${round6(lastT)} ≥ required − FDT ${round6(required - FDT)} → ${lastT >= required - FDT - 1e-9}`);
  console.log(`[sink-completion-arm] ${sh.tag}: duration ${round6(duration)} s, captures ${entries.map((e) => `ball ${e.id} t ${round6(e.t)}${Number.isFinite(e.tEnd) ? ' tEnd +' + round6(e.tEnd) : ' (no pivot)'}`).join(', ')}; completion ${round6(completion)} (last end ${lastEnd === null ? 'none' : round6(lastEnd)}); plan ${plan.frames} frames (today ${today.frames}) → last frame clock ${round6(lastT)} vs required ${round6(required)} (last end + TAIL_SEC ${TAIL_SEC}) ${endOk ? 'OK' : 'SHORT by ' + round6(required - lastT) + ' s'}; landed on the last frame ${landedOk ? 'YES' : 'NO'} ${JSON.stringify(landing)}${sh.slow ? `; PLANT (entries ignored): ${plant.frames} frames, last frame ${round6(plantLastT)} → ${plantRed ? 'RED as required (short by ' + round6(required - plantLastT) + ' s)' : 'NOT red — arm NOT ARMED'}` : `; CONTROL byte-identical plan ${controlOk ? 'YES' : 'NO'}`} → ${rowOk ? 'as required' : 'NOT as required'}`);
  results.push({ tag: sh.tag, v0: sh.v0, duration, entries: entries.map((e) => ({ id: e.id, t: e.t, tEnd: e.tEnd })), completion, lastEnd, planFrames: plan.frames, todayFrames: today.frames, nominalEnd, lastFrameClock: lastT, required, endOk, landing, landedOk, controlOk, plantFrames: plant.frames, plantLastFrameClock: plantLastT, plantRed, c1: { settleToday, settleNew, same: c1Same, padPlant: settlePadPlant, legacy, normalSpeedRow, padPlantRed }, rowOk });
}
// LAND-17 C2 (review 775r4 P2): the drill builder's per-segment law modelled with the leaf — the completion is a property of the RECORD,
// so a record staged NON-LIVE plans exactly as it plans live: max(kernel + cueTail, completion) with cueTail 0 (cueOff / node); the
// plant 'isLive restored' (a non-live segment keeps its kernel duration) shortens the extending record's plan → RED by name.
{
  const r935 = results.find((r) => r.v0 === 0.935), r25 = results.find((r) => r.v0 === 2.5);
  if (r935 && r25) {
    const seg = (r, completion) => planPlayback({ duration: Math.max(r.duration + 0, completion), slowmo: 1, tailSec: TAIL_SEC, maxSec: Infinity }).frames;
    const live935 = seg(r935, r935.completion), nonLive935 = seg(r935, r935.completion), plant935 = seg(r935, r935.duration);
    const live25 = seg(r25, r25.completion), nonLive25 = seg(r25, r25.completion), plant25 = seg(r25, r25.duration);
    cellZ(`C2 the 0.935 record staged NON-LIVE plans as it plans live (cueTail 0): ${nonLive935} frames`, nonLive935 === live935 && nonLive935 > plant935, `live ${live935}, non-live ${nonLive935}, kernel-only ${plant935}`);
    cellZ(`C2 the 2.5 control staged NON-LIVE: ${nonLive25} frames = the kernel plan (its drop ends inside the record)`, nonLive25 === live25 && nonLive25 === plant25, `live ${live25}, non-live ${nonLive25}, kernel-only ${plant25}`);
    cellZ(`C2 PLANT 'isLive restored' (non-live keeps the kernel duration): the 0.935 record → ${plant935} frames ≠ ${nonLive935} — RED as required`, plant935 !== nonLive935, `plant ${plant935} vs the law ${nonLive935}`);
  } else { cellZ('C2 segment-law cells', false, 'the 0.935 / 2.5 rows are missing'); }
}
// LAND-17 C2 TEXTUAL cell (offline-render.js is not importable in node): inside renderDrill, `JSON.stringify(game.record)` must not gate the
// plan (count 0), `isLive` must be gone (count 0) and the per-record completion call must appear exactly once — counts printed. The
// live/staged IDENTITY (sinkEntries() == [...game.sinkInfo.values()]) is not observable from node or from a page seam without a new
// __test member; its observable form is the browser z2 non-live row (the non-live delivered count == the plan over the same record's
// live-read index) — stated, not asserted here.
{
  const orp = path.join(WEB, 'app', 'offline-render.js');
  const src = fs.existsSync(orp) ? fs.readFileSync(orp, 'utf8') : '';
  const i0 = src.indexOf('export async function renderDrill'); const body = i0 >= 0 ? src.slice(i0) : '';
  const stripped = body.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
  const count = (re) => (stripped.match(re) || []).length;
  const nRec = count(/JSON\.stringify\(game\.record\)\s*\)/g) + count(/===\s*JSON\.stringify\(game\.record\)/g);
  const nLive = count(/\bisLive\b/g);
  const nCompletion = count(/sinkCompletionSec\?\.\(kernelDuration,\s*game\.sinkEntries\?\.\(\)/g);
  cellZ(`C2 textual (renderDrill body, comments stripped): plan gated on JSON.stringify(game.record) ${nRec} (want 0); isLive ${nLive} (want 0); per-record completion call ${nCompletion} (want 1)`, i0 >= 0 && nRec === 0 && nLive === 0 && nCompletion === 1, `renderDrill found ${i0 >= 0}; the identity cell (sinkEntries() == [...game.sinkInfo.values()]) is witnessed in the browser z2 non-live row, not here`);
}
// LAND-18 X2 (review 775r5 P2 (b)): the DVR's windowed-audio byte cap prices plannedFull().sec — before LAND-18 it summed durs + tails while
// plannedFullFrames (the engine's frame wall) took max(durs + tails, completions): the same plan priced two ways. Review's reproduction, modelled
// here with the app's own constants read from the tree (export.js BITRATES / bitrateFor, playback.js FINAL_TAIL / INNER_TAIL, the cap check's
// `Math.ceil((video + sec * 16_000) * 1.02)` with estimateDrill's `bitrateFor(h) * sec / 8 + 160e3`): 225 copies of the 0.935 record at 4K
// (2160p) 1×, tails OFF (cueOff: every pb.tails 0, no walk beats, no leads) — sec = Σ pb.segEndSec(i, 0) + FINAL_TAIL + 224 × INNER_TAIL.
// The estimate WITH completions must exceed the 4 GiB extent cap review priced against (the plan the wire must refuse) while the pre-LAND-18
// durs + tails estimate stayed under it (the under-pricing) — both printed, the cap decision printed. The cap value is the shell's advertised
// extent (playback.js fullStreamBytes(), window.__obSaveVideo.full); 4 GiB is review's figure, stated as the assumption of this cell.
{
  const r935 = results.find((r) => r.v0 === 0.935);
  const pbSrc = fs.readFileSync(path.join(WEB, 'app', 'playback.js'), 'utf8'); const exSrc = fs.readFileSync(path.join(WEB, 'app', 'export.js'), 'utf8');
  const num = (src, re, what) => { const m = src.match(re); if (!m) throw new Error(`X2 cell: ${what} not found`); return Number(m[1]); };
  let consts = null, err = null;
  try {
    consts = { FINAL_TAIL: num(pbSrc, /const FINAL_TAIL = ([0-9.]+)/, 'FINAL_TAIL'), INNER_TAIL: num(pbSrc, /const INNER_TAIL = ([0-9.]+)/, 'INNER_TAIL'), BR2160: num(exSrc, /const BITRATES = \{[^}]*2160: ([0-9.e]+)/, 'BITRATES[2160]') };
    if (!/bytes: bitrateFor\(h\) \* clipSec \/ 8 \+ 160e3/.test(exSrc)) throw new Error('X2 cell: estimateDrill bytes formula moved (bitrateFor(h) * clipSec / 8 + 160e3)');
    if (!/Math\.ceil\(\(video \+ sec \* 16_000\) \* 1\.02\)/.test(pbSrc)) throw new Error('X2 cell: the cap check formula moved (Math.ceil((video + sec * 16_000) * 1.02))');
  } catch (e) { err = e.message; }
  if (!r935 || err) cellZ('X2 windowed-audio byte cap prices the completion-aware plan', false, err ?? 'the 0.935 row is missing');
  else {
    const N = 225, CAP = 4 * 1024 ** 3; const tails = consts.FINAL_TAIL + (N - 1) * consts.INNER_TAIL;
    const segEnd = (withCompletion) => Math.max(r935.duration + 0, withCompletion ? r935.completion : r935.duration); // pb.segEndSec(i, 0): tails off
    const secWith = N * segEnd(true) + tails, secWithout = N * segEnd(false) + tails;
    const bytesOf = (sec) => Math.ceil(((consts.BR2160 * sec / 8 + 160e3) + sec * 16_000) * 1.02);
    const bWith = bytesOf(secWith), bWithout = bytesOf(secWithout); const gb = (b) => (b / 1e9).toFixed(2) + ' GB';
    const refusedWith = bWith > CAP, refusedWithout = bWithout > CAP;
    cellZ(`X2 windowed-audio byte cap: 225 × the 0.935 record at 4K/1×, tails off — WITH completions ${gb(bWith)} (sec ${secWith.toFixed(2)}) → ${refusedWith ? 'REFUSED' : 'approved'} against 4 GiB; durs + tails (pre-LAND-18) ${gb(bWithout)} (sec ${secWithout.toFixed(2)}) → ${refusedWithout ? 'refused' : 'APPROVED (the under-pricing)'}`,
      refusedWith && !refusedWithout && bWith > bWithout,
      `constants read from the tree: BITRATES[2160] ${consts.BR2160}, FINAL_TAIL ${consts.FINAL_TAIL}, INNER_TAIL ${consts.INNER_TAIL}; the 0.935 record: duration ${round6(r935.duration)}, completion ${round6(r935.completion)}; cap 4 GiB = ${CAP} B (review's figure — the runtime cap is the shell's advertised extent)`);
  }
}
console.log(`[sink-completion-arm] cells ${cellCount} (Z2b + C2 guard + C2 segment law + C2 textual + X2 byte cap) over ${SHOTS.length} kernel-replay rows`);
if (!padRedRows.length) { console.log('[sink-completion-arm] C1 pad plant: NO normal-speed row went RED — the plant is not witnessed'); armed = false; }
else console.log(`[sink-completion-arm] C1 pad plant witnessed RED on: ${padRedRows.join('; ')}`);
if (JSON_OUT) { fs.mkdirSync(path.dirname(JSON_OUT), { recursive: true }); fs.writeFileSync(JSON_OUT, JSON.stringify({ tool: 'arm-sink-completion-489', web: WEB, table: TABLE, TAIL_SEC, FDT, SETTLE_PAD, padRedRows, results, armed }, null, 1)); }
console.log(`[sink-completion-arm] ${armed ? 'ARMED — extending rows planned to their last drop + TAIL_SEC (nominal end and last-frame clock) and landed on the last frame, the 2.5 m/s control plan byte-identical, realtime settleAt bit-equal to today on every row (C1), the pad plant RED on the normal-speed rows, the guard cells finite (C2), the leaf plant RED' : 'NOT ARMED'}`);
process.exit(armed ? 0 : 1);
