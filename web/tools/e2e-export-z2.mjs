#!/usr/bin/env node

// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-export-z2.mjs — GH-489 #637 landing (ORDER-SNOOKER-637-LAND-16 Z2, review round 3 P2; CORRIGENDUM-1 C3: a BOOT, run only on the
// maintainer's 'probe go'): the BROWSER call-site coverage of the ONE un-padded sink-completion function. runExport (offline-render.js)
// must plan the export to the LAST pocket drop's end — the same framestep.js sinkCompletionSec realtime settles on — combined with the
// cue overhang by MAX and followed by ONE TAIL_SEC.
//
// SHOT-DRIVEN: every row is a LIVE shot of the app (the e2e-snooker S2p lane through __test.layout / __rules.setMatchState /
// __test.shoot), so the export plans over the record the live app holds after the shot (game.record, with the cue post-strike state
// the app wrote). Rows: v0 = 0.94 (the SNK-R37 A1 slow scratch) and v0 = 0.935 (the lens row) — EXTENDING records whose last drop
// ends after duration + cueTail — and v0 = 2.5, the CONTROL (the drop ends inside the record). After each settle a High-tier export
// (640×360, noDownload) must deliver EXACTLY
//   planPlayback({ duration: max(duration + cueTail, completion), tailSec: TAIL_SEC }).frames        (the STRONG law)
// where completion = sinkCompletionSec(duration, the page's sink index) and cueTail is READ from the export's own plan seam,
// offline-render.js cueTailForEstimate(R, duration) (:1142 — the exported seam export.js:279 prices the estimate with, mirroring
// runExport's live-policy probe by the r7 P2 law), over R = the live record: window.__share.records() (share.js:1736) returns the
// session's record JSONs, pushed at share.js:428 as JSON.stringify(record) on every settled live shot — the last entry is game.record's
// byte-equal serialization (the object itself is exposed by no seam; its serialization is). The suite asserts the entry is THIS shot
// (the count grew by one; the record's last event time equals __test.duration(); its shot equals the spec sent). cueTail is never
// derived from the delivered count. Row classes are DERIVED and asserted, never assumed: an extending row must satisfy
// completion > duration + cueTail (printed) else FAIL 'row v0=X is not a witness'; the control must satisfy completion ≤ duration +
// cueTail else FAIL 'row v0=X is not a control'. Extending rows must also differ from the pre-LAND-16 plan planPlayback(duration +
// cueTail) under the SAME cue; the control must EQUAL it. Against a tree whose offline-render.js carries the old plan line the
// extending rows deliver the pre-LAND-16 count → FAIL by name (the plant's cell; exit 1). Per row the suite prints duration,
// completion, cueTail, the planned frames (and the pre-LAND-16 plan) and the delivered frames.
// History: cut a asserted the cue OFF (wrong premise; z2tip14 VOID); cut b read the record from window.__archive, disarmed on
// scripted boots by the hermetic-boot law (z2tip14b / z2plant14b VOID); cut c (node-simulated + loadRecord) was ruled out — the
// document is the live record. This is cut d.
// SECOND BOOT (GH-864, DESIGN-864 ruling 5): after the first boot's finally, the suite re-spawns the server on the same PORT and
// relaunches Chrome on the same CDP_PORT at `app.html?seed=1&archive=1` (a fresh per-port profile: the archive starts empty). It reads
// the DVR live schedule (class (a): each segment ends at E_i = pb.segEndSec(i, tails[i]); fade clock F1) and hands the readings to
// lib/dvr864-verdict.mjs, which decides every leg in node. 16 legs are asserted. The three C-* control compares are asserted when
// OB_DVR864_CONTROL_BASELINE names the other tree's control-states-864.json, and are otherwise disclosed as the deferred compare. An
// INVALID leg is a FAIL by name: never green by fallback (rulings 12-13). OB_DVR864_OUT (absolute) dumps readings-864.json and
// control-states-864.json.
//   node web/tools/e2e-export-z2.mjs   (Chrome via cdp.mjs; OB_E2E_PORT / OB_E2E_CDP_PORT from the band)
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome, sleep, spawnStaticServer, stopStaticServer } from './cdp.mjs';
import { planPlayback, TAIL_SEC, sinkCompletionSec } from '../app/framestep.js';
import fs from 'node:fs';
import * as V from './lib/dvr864-verdict.mjs';

export const PORT_INVENTORY = { http: 1, cdp: 1 };
const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.OB_E2E_PORT ?? 20771);
const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 16368);
let failCount = 0;
const fail = (msg) => { console.error('E2E-EXPORT-Z2 FAIL:', msg); process.exitCode = 1; failCount += 1; };
const server = spawnStaticServer(webDir, PORT);
await sleep(700);
const chrome = await launchChrome(`http://127.0.0.1:${PORT}/app.html?seed=1`, { port: CDP_PORT });
const ev = (js) => chrome.eval(js);
// the S2p lane, byte for byte (e2e-snooker.mjs)
const CTR = { x: 0.9209965818486914, y: 1.8164965818486913 }, ANCHOR = { x: 0.25, y: 1.0 };
const U = (() => { const dx = CTR.x - ANCHOR.x, dy = CTR.y - ANCHOR.y, n = Math.hypot(dx, dy); return { x: dx / n, y: dy / n }; })();
const LANE = (t) => ({ x: CTR.x - U.x * t, y: CTR.y - U.y * t });
const SPHI = Math.atan2(U.y, U.x);
const SPOT = { 16: { x: 0.292, y: -1.0475 }, 17: { x: -0.292, y: -1.0475 }, 18: { x: 0, y: -1.0475 }, 19: { x: 0, y: 0 }, 20: { x: 0, y: 0.89225 }, 21: { x: 0, y: 1.4605 } };
const colours = [16, 17, 18, 19, 20, 21].map((id) => ({ id, ...SPOT[id] }));
const shareCount = () => ev('(window.__share && typeof __share.records === "function") ? __share.records().length : -1');
try {
  let ready = false;
  for (let i = 0; i < 200 && !ready; i++) { await sleep(200); ready = await ev('window.__test?.ready === true'); }
  if (!ready) throw new Error('app never became ready');
  if (await ev("window.__rules.activateSnooker('wpbsa-snooker')", true) !== true) throw new Error('activateSnooker failed');
  await sleep(600);
  const support = await ev('__export.open().then(() => __export.support())');
  await sleep(200);
  if (!support.webcodecs) throw new Error('this Chrome has no WebCodecs — cannot gate the export');
  await ev('__export.close()'); await sleep(200);
  const rowsSeen = {}; // v0 → { shareIndex, dur, completion } (the non-live row re-exports the 0.935 record while 2.5 is live)
  const row = async (tag, v0, { expectExtended }) => {
    const nBefore = await shareCount();
    if (nBefore < 0) { fail(`${tag}: window.__share.records() is unavailable — the live record cannot be read (share.js:1736 seam absent)`); return; }
    await ev(`__test.layout(${JSON.stringify([{ id: 0, ...LANE(0.95) }, { id: 1, ...LANE(0.35) }, ...colours])})`);
    await ev(`window.__rules.setMatchState(${JSON.stringify({ phase: 'reds', shooter: 1 })})`);
    const spec = { v0, phi: SPHI, theta: 0, a: 0, b: 0 };
    const err = await ev(`__test.shoot(${JSON.stringify(spec)})`);
    if (err) { fail(`${tag}: shoot rejected: ${err}`); return; }
    let st = 'PLAYBACK';
    for (let i = 0; i < 220 && st === 'PLAYBACK'; i++) { await sleep(350); st = await ev('__test.state()'); }
    if (st === 'PLAYBACK') { fail(`${tag}: the shot never settled`); return; }
    await sleep(400);
    const dur = await ev('__test.duration()');
    const sinks = JSON.parse(await ev('JSON.stringify(window.__test.sinkInfo ? __test.sinkInfo() : [])'));
    const entries = sinks.map((e) => ({ t: e.t, pivot: { tEnd: e.tEnd } }));
    const completion = sinkCompletionSec(dur, entries);
    const budget = JSON.parse(await ev('JSON.stringify(window.__test.settleBudget ? __test.settleBudget() : null)'));
    if (!budget || !Number.isFinite(budget.completion)) { fail(`${tag}: settleBudget() carries no completion (a pre-LAND-16 main.js hook)`); return; }
    if (Math.abs(budget.completion - completion) > 1e-9) fail(`${tag}: the hook's completion ${budget.completion} ≠ node's ${completion} over the same sink index`);
    // R = the live record the export plans over: the share log's last recordJson (share.js:1736 / :428), asserted to be THIS shot
    let nAfter = nBefore;
    for (let i = 0; i < 40 && nAfter <= nBefore; i++) { nAfter = await shareCount(); if (nAfter <= nBefore) await sleep(250); }
    if (nAfter !== nBefore + 1) { fail(`${tag}: the share log did not record exactly this shot (records ${nBefore} → ${nAfter})`); return; }
    const rec = JSON.parse(await ev('(() => { const r = __share.records(); window.__z2rec = JSON.parse(r[r.length - 1]); const e = window.__z2rec.events || []; return JSON.stringify({ lastT: e.length ? e[e.length - 1].t : null, shot: window.__z2rec.shot || null, bytes: r[r.length - 1].length }); })()'));
    if (!Number.isFinite(rec.lastT) || Math.abs(rec.lastT - dur) > 1e-9) { fail(`${tag}: the share log's last record is not this shot (its last event ${rec.lastT} vs __test.duration() ${dur})`); return; }
    if (!rec.shot || Math.abs(rec.shot.v0 - spec.v0) > 1e-12 || Math.abs(rec.shot.phi - spec.phi) > 1e-12) { fail(`${tag}: the share log's last record carries shot ${JSON.stringify(rec.shot)} ≠ the spec sent ${JSON.stringify(spec)}`); return; }
    // cueTail: the export's own plan seam over R — cueTailForEstimate(R, duration), offline-render.js:1142 (export.js:279's seam)
    const cue = JSON.parse(await ev(`(async () => { const m = await import('./app/offline-render.js'); const st = window.__test.cuePostState ? __test.cuePostState() : null; let tail = null, err = null; try { tail = m.cueTailForEstimate(window.__z2rec, ${dur}); } catch (e) { err = String(e); } return JSON.stringify({ tail, err, seam: typeof m.cueTailForEstimate, engine: st === null ? 'none' : (st.armed ? 'armed' : 'idle'), tHide: st && st.plan && Number.isFinite(st.plan.tHide) ? st.plan.tHide : null }); })()`));
    if (cue.seam !== 'function') { fail(`${tag}: offline-render.js exports no cueTailForEstimate (the seam export.js:279 prices with) — cannot read the plan's cue tail`); return; }
    if (cue.err || !Number.isFinite(cue.tail)) { fail(`${tag}: cueTailForEstimate threw or returned no number (${cue.err ?? cue.tail})`); return; }
    const cueTail = cue.tail;
    const cueEnd = dur + cueTail;
    rowsSeen[v0] = { shareIndex: nAfter - 1, dur, completion, cueTail };
    // the row class, DERIVED from the measured numbers and asserted against the row's declared role
    const extendsPlan = completion > cueEnd + 1e-9;
    if (expectExtended && !extendsPlan) fail(`row v0=${v0} is not a witness: completion ${completion.toFixed(4)} ≤ duration + cueTail ${cueEnd.toFixed(4)} (duration ${dur.toFixed(4)}, cueTail ${cueTail.toFixed(4)})`);
    if (!expectExtended && extendsPlan) fail(`row v0=${v0} is not a control: completion ${completion.toFixed(4)} > duration + cueTail ${cueEnd.toFixed(4)} (duration ${dur.toFixed(4)}, cueTail ${cueTail.toFixed(4)})`);
    const want = planPlayback({ duration: Math.max(cueEnd, completion), slowmo: 1, tailSec: TAIL_SEC, maxSec: 60 });
    const old = planPlayback({ duration: cueEnd, slowmo: 1, tailSec: TAIL_SEC, maxSec: 60 });
    if (expectExtended && extendsPlan && want.frames === old.frames) fail(`row v0=${v0} is not a witness: the completion ${completion.toFixed(4)} extends the cue-tailed plan by less than one frame (both plans read ${want.frames} frames)`);
    const res = await ev(`__export.start('high', { width: 640, height: 360, noDownload: true, hashFrames: false, keepBytes: false })`);
    if (!res) { fail(`${tag}: high-tier export returned null`); return; }
    const lastEnd = entries.length ? Math.max(...entries.map((e) => e.t + (e.pivot.tEnd ?? 0))) : null;
    console.log(`[${tag}] duration ${dur.toFixed(4)} s; completion ${completion.toFixed(4)} s (${extendsPlan ? 'EXTENDS the cue-tailed plan — last drop end ' + lastEnd.toFixed(4) : 'inside the cue-tailed plan'}; sink index ${JSON.stringify(sinks.map((e) => ({ id: e.id, t: +e.t.toFixed(4), tEnd: e.tEnd == null ? null : +e.tEnd.toFixed(4) })))}); cueTail ${cueTail.toFixed(4)} s (cueTailForEstimate over the share log's last record — serialized ${rec.bytes} B, records ${nBefore} → ${nAfter}, last event ${rec.lastT.toFixed(4)} == duration, shot v0 ${rec.shot.v0}; cue engine ${cue.engine}${cue.tHide !== null ? ', tHide ' + cue.tHide.toFixed(4) : ''}); planned ${want.frames} frames over ${Math.max(cueEnd, completion).toFixed(4)} s (pre-LAND-16 plan ${old.frames} over ${cueEnd.toFixed(4)} s); delivered ${res.frames} frames, clip ${res.clipSec ?? 'n/a'} s`);
    if (res.frames !== want.frames) fail(`${tag}: export frames ${res.frames} ≠ planned ${want.frames} (max(duration + cueTail, completion) + TAIL_SEC) — the offline plan does not cover the last drop`);
    if (expectExtended && res.frames === old.frames) fail(`${tag}: the export delivered the PRE-LAND-16 frame count ${old.frames} (duration + cueTail, no completion term)`);
    if (!expectExtended && res.frames !== old.frames) fail(`${tag}: the CONTROL's frame count ${res.frames} ≠ the pre-LAND-16 plan ${old.frames} (the plan must be byte-identical when the drop ends inside the cue-tailed record)`);
    if (!process.exitCode) console.log(`[${tag}] OK — delivered ${res.frames} = the plan; pre-LAND-16 ${old.frames}`);
  };
  await row('Z2 S2p v0 0.94 (slow scratch, the SNK-R37 A1 record)', 0.94, { expectExtended: true });
  await row('Z2 S2p v0 0.935 (slow scratch, the lens row)', 0.935, { expectExtended: true });
  await row('Z2 S2p v0 2.5 (control)', 2.5, { expectExtended: false });
  // ---- LAND-17 C2 (review 775r4 P2): the NON-LIVE row — B (0.935) sits in the share log, A (2.5) is the live record; B is rendered as an
  // archived drill export with cueOff (renderDrill stages B quietly, reads B's own sink index through game.sinkEntries() and plans
  // max(durB + 0, completionB) — cueOff → cueTail 0, printed). The law: delivered == planPlayback(max(durB + 0, completionB)).frames,
  // from the plan, never a literal; the pre-LAND-16 / isLive-restored plan (durB alone) must differ. The live/staged identity
  // (sinkEntries() == [...game.sinkInfo.values()]) has no page seam; its observable form is THIS row: the non-live delivered count
  // equals the plan over the same record's index read while it was live (completionB from the 0.935 row).
  {
    const tag = 'Z2 non-live (B = 0.935 archived, A = 2.5 live; renderDrill cueOff)';
    const B = rowsSeen[0.935], A = rowsSeen[2.5];
    if (!B || !A) fail(`${tag}: the 0.935 / 2.5 rows did not complete — no non-live witness`);
    else {
      const durLive = await ev('__test.duration()');
      if (Math.abs(durLive - A.dur) > 1e-9) fail(`${tag}: the live record is not A (duration ${durLive} vs ${A.dur})`);
      const cueTailB = 0; // renderDrill with cueOff: the cue probe is skipped, the completion is not
      const want = planPlayback({ duration: Math.max(B.dur + cueTailB, B.completion), slowmo: 1, tailSec: TAIL_SEC, maxSec: Infinity });
      const old = planPlayback({ duration: B.dur + cueTailB, slowmo: 1, tailSec: TAIL_SEC, maxSec: Infinity });
      if (want.frames === old.frames) fail(`row v0=0.935 (non-live) is not a witness: the completion ${B.completion.toFixed(4)} does not extend the plan over ${B.dur.toFixed(4)}`);
      const res = await ev(`(async () => { const r = __share.records(); const rec = r[${B.shareIndex}]; const out = await __export.renderDrill([rec], { width: 640, height: 360, noDownload: true, withAudio: false, hashFrames: false, keepBytes: false, cueOff: true }); return out ? { frames: out.frames, segments: out.segments ?? null, clipSec: out.clipSec ?? null } : null; })()`);
      if (!res) fail(`${tag}: renderDrill returned null`);
      else {
        const seg0 = Array.isArray(res.segments) ? res.segments[0] : null;
        console.log(`[${tag}] B share index ${B.shareIndex}; durB ${B.dur.toFixed(4)} s; completionB ${B.completion.toFixed(4)} s (read while B was live); cueTail 0 (cueOff); planned ${want.frames} frames over ${Math.max(B.dur, B.completion).toFixed(4)} s (pre-LAND-16 / isLive-restored plan ${old.frames} over ${B.dur.toFixed(4)} s); delivered ${res.frames} frames (segment 0: ${seg0}; clip ${res.clipSec ?? 'n/a'} s); the live record afterwards: duration ${await ev('__test.duration()')} (A ${A.dur.toFixed(4)})`);
        if (res.frames !== want.frames) fail(`${tag}: delivered ${res.frames} ≠ planned ${want.frames} (max(durB + cueTail, completionB) + TAIL_SEC) — the non-live plan does not cover B's last drop`);
        if (seg0 !== null && seg0 !== want.frames) fail(`${tag}: segment 0 frames ${seg0} ≠ the plan's ${want.frames} (B's last delivered frame index ≠ the plan's last)`);
        if (res.frames === old.frames) fail(`${tag}: delivered the PRE-LAND-16 / isLive-restored count ${old.frames} — the completion was not applied to the non-live record`);
        const durAfter = await ev('__test.duration()');
        if (Math.abs(durAfter - A.dur) > 1e-9) fail(`${tag}: the live record did not come back to A after the drill export (duration ${durAfter})`);
        if (!process.exitCode) console.log(`[${tag}] OK — non-live delivered ${res.frames} = the plan; pre-LAND-16 ${old.frames}`);
      }
    }
  }
  // ---- GH-489 #637 LAND-18 X1 (review 775r5 P2 (a)): the manual single-shot COLD export — B staged with NO frame run and exported through
  // the single-shot seam __export.start → runExport (offline-render.js, the plan line). game.js nulls the sink index on every loadRecord and
  // builds it lazily (seek / update / the sinkEntries accessor): before LAND-18 runExport and the estimate read the RAW Map — empty here —
  // and planned duration + cueTail (the cold, pre-LAND-16 count: 231 at this boot's cueTail 0.6, 195 at cueTail 0). The live rows above
  // cannot see it (update() built the index); the non-live row cannot (renderDrill's builder reads the accessor); the DVR current-shot export
  // cannot (it plans through the builder). THIS row can. Recipe (ORDER-LAND-18 CORRIGENDUM-1), ONE CDP eval, no frame between the steps: a
  // quiet load is REFUSED outside PLAYBACK (game.js loadRecord), so: __test.pause(true) → __test.loadRecord(B, { stage: 'playback' }) (enters
  // from any state; update() is inert while paused, so sinkIndex() never runs) → __export.start(...) — never a seek, never __test.sinkInfo()
  // before the export (a cold null read would invert the arm). Expected = planPlayback(max(durB + cueTailB, completionB)).frames with
  // completionB READ WHILE B WAS LIVE (the 0.935 row's rowsSeen entry); cueTailB = that row's cueTailForEstimate over B (the same seam the
  // live row proved equal to runExport's probe). The plant tree z2coldplant18 (the raw Map restored at both sites) delivers the cold count.
  {
    const tag = 'Z2 cold single-shot (B = 0.935 staged paused, no frame before the plan; __export.start)';
    const B = rowsSeen[0.935];
    if (!B) fail(`${tag}: the 0.935 row did not complete — no cold witness`);
    else {
      const want = planPlayback({ duration: Math.max(B.dur + B.cueTail, B.completion), slowmo: 1, tailSec: TAIL_SEC, maxSec: 60 });
      const old = planPlayback({ duration: B.dur + B.cueTail, slowmo: 1, tailSec: TAIL_SEC, maxSec: 60 });
      if (want.frames === old.frames) fail(`row v0=0.935 (cold) is not a witness: the completion ${B.completion.toFixed(4)} does not extend the cue-tailed plan over ${(B.dur + B.cueTail).toFixed(4)}`);
      const res = await ev(`(async () => { const r = __share.records(); __test.pause(true); const err = __test.loadRecord(r[${B.shareIndex}], { stage: 'playback' }); if (typeof err === 'string') { __test.pause(false); return { err }; } const dur = __test.duration(); const out = await __export.start('high', { width: 640, height: 360, noDownload: true, hashFrames: false, keepBytes: false }); __test.pause(false); return { err: null, dur, frames: out ? out.frames : null }; })()`);
      if (!res) fail(`${tag}: the cold eval returned null`);
      else if (res.err) fail(`${tag}: loadRecord(B, { stage: 'playback' }) was refused: ${res.err}`);
      else if (Math.abs(res.dur - B.dur) > 1e-9) fail(`${tag}: the staged record is not B (duration ${res.dur} vs ${B.dur})`);
      else if (res.frames === null) fail(`${tag}: high-tier export returned null`);
      else {
        console.log(`[${tag}] B share index ${B.shareIndex}; durB ${B.dur.toFixed(4)} s; completionB ${B.completion.toFixed(4)} s (read while B was live); cueTailB ${B.cueTail.toFixed(4)} (the live row's cueTailForEstimate over B); planned ${want.frames} frames over ${Math.max(B.dur + B.cueTail, B.completion).toFixed(4)} s; delivered ${res.frames}; pre-LAND-16 / cold ${old.frames}`);
        if (res.frames !== want.frames) fail(`${tag}: delivered ${res.frames} ≠ planned ${want.frames} (max(durB + cueTail, completionB) + TAIL_SEC) — the single-shot plan read a COLD sink index (a record staged with no frame before the plan)`);
        if (res.frames === old.frames) fail(`${tag}: delivered the PRE-LAND-16 / cold count ${old.frames} (duration + cueTail, no completion term)`);
        if (!process.exitCode) console.log(`[${tag}] OK — cold single-shot delivered ${res.frames} = the plan; pre-LAND-16 / cold ${old.frames}`);
      }
    }
  }
} catch (e) {
  fail(e && e.stack || String(e));
} finally {
  chrome.close();
  await stopStaticServer(server);
}
let controlBaseline = null;
{
  const DVR864_TREE = process.env.OB_DVR864_TREE || null;
  const DVR864_URL = `http://127.0.0.1:${PORT}/app.html?seed=1&archive=1`;
  // leg list used ONLY when the module itself failed to load (the CRASH print)
  const FALLBACK_LEGS = ['SETUP', 'L0', 'L1', 'L2', 'L3', 'L4a', 'L4b', 'L2b', 'L2c', 'L4-beat',
    'L5', 'L6', 'L6a', 'L6b', 'CTRL-SPLIT', 'L0-control', 'C-empty', 'C-beat', 'C-trim'];
  // the readings (verdict-864.mjs READINGS CONTRACT); null = not read
  const R = { meta: { tree: DVR864_TREE, url: DVR864_URL }, boot: null, setup: null, l2: null, l3: null, l4: null,
    l2b: null, l2c: null, l4beat: null, l5: null, l6: null, ctrl: null };
  // phases completed in order; a CRASH marks every leg whose phases are incomplete
  const done = new Set();
  const PHASES_OF = {
    SETUP: ['setup'], L0: ['setup'], L1: ['setup'], L2: ['setup', 'l2'], L3: ['setup', 'l3'],
    L4a: ['setup', 'l4'], L4b: ['setup', 'l2', 'l4'], L2b: ['l2b'], L2c: ['l2b', 'l2c'], 'L4-beat': ['l2b', 'l4beat'],
    L5: ['l5'], L6: ['setup', 'l6'], L6a: ['l6'], L6b: ['l6'],
    'CTRL-SPLIT': ['setup', 'ctrl.setup'], 'L0-control': ['ctrl.setup'], 'C-empty': ['ctrl.setup'],
    'C-beat': ['ctrl.setup', 'ctrl.beat'], 'C-trim': ['ctrl.setup', 'ctrl.beat', 'ctrl.trim'],
  };
  // node-side eval bounds (ms); each stays under cdp.mjs's CMD_TIMEOUT_MS default 600000
  const EVAL_MS = 60000, OPEN_MS = 120000, RENDER_MS = 480000;
  let server2 = null, chrome2 = null, crash = null, bootPrinted = false;
  const say = (line) => console.log(line);
  // pe(label, js, ms): ONE chrome.eval, bounded in node; a timeout throws (-> CRASH)
  const pe = (label, js, ms = EVAL_MS) => {
    let timer = null;
    const bound = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`DVR864 eval '${label}' exceeded ${ms} ms (node bound)`)), ms);
    });
    // Promise.race subscribes to the eval promise, so a late rejection (the
    // client rejects pending commands on close) is handled, never unhandled
    return Promise.race([chrome2.eval(js), bound]).finally(() => clearTimeout(timer));
  };
  // ---------------------------------------------------------------- page reads
  // Every function below is one pe() call whose second argument is a template
  // literal; its only interpolations are JSON.stringify(...) values.
  // state() by value: playback.js:12075-12101 (null while no session is open).
  const bootRead = () => pe('boot-mode', `(() => {
    const a = window.__archive, t = window.__test, pb = window.__playback;
    let archiveArmed = null, speed = null;
    try { archiveArmed = (a && typeof a.enabled === 'function') ? a.enabled() : null; } catch (e) { archiveArmed = null; }
    try { const s = (pb && typeof pb.state === 'function') ? pb.state() : null; speed = (s && s.speed !== undefined) ? s.speed : null; } catch (e) { speed = null; }
    return { url: location.href, archiveArmed, twoClock: (t && t.twoClock !== undefined) ? t.twoClock : null, speed };
  })()`);
  // the suite's own WebCodecs idiom (e2e-export-z2.mjs:57-60): open, support(), close
  const webcodecsRead = () => pe('boot-webcodecs', `(async () => {
    const s = await window.__export.open().then(() => window.__export.support());
    return (s && s.webcodecs !== undefined) ? s.webcodecs : null;
  })()`);
  const exportClose = () => pe('boot-export-close', `(() => { window.__export.close(); return true; })()`);
  const readyRead = () => pe('ready', `window.__test?.ready === true`);
  const stateRead = (label) => pe(label, `__test.state()`);
  // Setup 1 / split step 2 (the suite's :56 idiom; flow.js:3369 is async)
  const activateRead = (label) => pe(label, `window.__rules.activateSnooker('wpbsa-snooker')`);
  // one row: e2e-export-z2.mjs:66-74 (layout, setMatchState, shoot, settle), no export
  const fireRow = async (v0) => {
    await pe('row-layout', `__test.layout(${JSON.stringify([{ id: 0, ...LANE(0.95) }, { id: 1, ...LANE(0.35) }, ...colours])})`);
    await pe('row-match', `window.__rules.setMatchState(${JSON.stringify({ phase: 'reds', shooter: 1 })})`);
    const spec = { v0, phi: SPHI, theta: 0, a: 0, b: 0 };
    const err = await pe('row-shoot', `__test.shoot(${JSON.stringify(spec)})`);
    if (err) return { v0, err };
    let st = 'PLAYBACK';
    for (let i = 0; i < 220 && st === 'PLAYBACK'; i++) { await sleep(350); st = await stateRead('row-settle'); }
    if (st === 'PLAYBACK') throw new Error(`row v0=${v0}: the shot never settled (220 x 350 ms, e2e-export-z2.mjs:72)`);
    await sleep(400);
    return { v0, err: null };
  };
  // Setup 3 / the control's rows + flush: flush, current(), sessions() (archive.js:499 newest first, :620 current)
  const archiveRead = (label) => pe(label, `(async () => {
    const f = await window.__archive.flush();
    const cur = window.__archive.current();
    const ss = await window.__archive.sessions();
    const list = Array.isArray(ss) ? ss : [];
    const idOf = (s) => ((s && s.id !== undefined) ? s.id : null);
    return { flush: f === undefined ? null : f, flushType: typeof f, current: cur === undefined ? null : cur,
      sid0: list.length ? idOf(list[0]) : null, sessionsIds: list.slice(0, 3).map(idOf), sessionsLen: list.length };
  })()`);
  // Setup 3 (openSession, the e2e-playback.mjs:3331 idiom) + Setup 4 (state())
  const openRead = (label, sid) => pe(label, `(async () => {
    const pb = window.__playback;
    const ok = await pb.openSession(${JSON.stringify(sid)});
    const S = pb.state();
    return { openOk: ok === undefined ? null : ok, S: S || null, playerOpen: pb.playerOpen() };
  })()`, OPEN_MS);
  // Setup 5: the explicit empty plan (:12135-12139), state() re-read, plan() (:12173)
  const emptyPlanRead = (label) => pe(label, `(() => {
    const pb = window.__playback;
    const ok = pb.setCutPlan({ cuts: [], poses: [] });
    const S = pb.state();
    const p = pb.plan();
    return { emptyPlanOk: ok, S: S || null, planFades: (p && p.opts && p.opts.fades !== undefined) ? p.opts.fades : null,
      stateJson: S ? JSON.stringify({ durs: S.durs, cum: S.cum, total: S.total, tails: S.tails, beats: S.beats, leads: S.leads }) : null,
      planJson: p ? JSON.stringify(p) : null };
  })()`);
  // L2 (and the L4-beat brackets): 24-step bisection over [S.cum[k], S.cum[k+1]],
  // predicate strikeLive().seg > k; ks null = every k < n-1. seek is sync (:12102).
  const bracketsRead = (label, ks) => pe(label, `(() => {
    const pb = window.__playback;
    const S = pb.state();
    if (!S) return { brackets: [], err: 'state() null' };
    const n = S.durs.length;
    const want = ${JSON.stringify(ks)};
    const ks = Array.isArray(want) ? want : Array.from({ length: Math.max(0, n - 1) }, (_, k) => k);
    const brackets = [];
    for (const k of ks) {
      let lo = S.cum[k], hi = S.cum[k + 1], steps = 0, err = null;
      for (let i = 0; i < 24; i++) {
        const mid = (lo + hi) / 2;
        pb.seek(mid);
        const sl = pb.strikeLive();
        if (!sl) { err = 'strikeLive() null at T ' + mid; break; }
        if (sl.seg > k) hi = mid; else lo = mid;
        steps++;
      }
      brackets.push(err ? { k, lo: null, hi: null, steps, err } : { k, lo, hi, steps });
    }
    return { brackets };
  })()`);
  // L3: T = S.cum[k] + E_k - 0.01 (the module re-derives it bit-exact), seg/dur after seek(T)
  const ownerRead = (label) => pe(label, `(() => {
    const pb = window.__playback;
    const S = pb.state();
    if (!S) return { reads: [], err: 'state() null' };
    const n = S.durs.length;
    const reads = [];
    for (let k = 0; k < n - 1; k++) {
      const T = S.cum[k] + Math.max(S.durs[k] + S.tails[k], S.completions[k]) - 0.01;
      pb.seek(T);
      const sl = pb.strikeLive();
      reads.push({ k, T, seg: sl ? sl.seg : null, dur: sl ? sl.dur : null });
    }
    return { reads };
  })()`);
  // L4 / L4-beat / L6b: P = plan() (:12173) and renderDrill with the card's L4 step 1
  // options (e2e-playback.mjs:6095 idiom). No page seam exposes the export timeline
  // beats (offline-render.js:2868-2895 keeps them local): timelineBeats stays null.
  const renderRead = (label) => pe(label, `(async () => {
    const pb = window.__playback;
    const P = pb.plan();
    if (!P) return { plan: null, res: null, error: null, resNull: null, timelineBeats: null, note: 'plan() null' };
    const plan = { recordsLength: Array.isArray(P.records) ? P.records.length : null,
      opts: JSON.parse(JSON.stringify(P.opts === undefined ? null : P.opts)) };
    let res = null, error = null, resNull = false;
    try {
      const r = await window.__export.renderDrill(P.records, { ...P.opts, width: 640, height: 360, noDownload: true,
        withAudio: false, hashFrames: false, keepBytes: false });
      if (r) {
        res = { montageRate: r.montageRate === undefined ? null : r.montageRate,
          segments: Array.isArray(r.segments) ? r.segments.slice() : null,
          frames: r.frames === undefined ? null : r.frames, clipSec: r.clipSec === undefined ? null : r.clipSec };
      } else resNull = true;
    } catch (e) { error = String((e && e.message) || e); }
    return { plan, res, error, resNull, timelineBeats: null, playerOpenAfter: pb.playerOpen() };
  })()`, RENDER_MS);
  // L2b / L6 setup / C-beat: the MOVE-seam plan (card L2b "Plan."), getCutPlan (:12140),
  // state() re-read; extras (control only): plan() JSON and walkSpec(1) (:12263-12270)
  const movePlanRead = (label, extras) => pe(label, `(() => {
    const pb = window.__playback;
    const ok = pb.setCutPlan({ cuts: [{ seg: 1, t: 0, cam: 2 }, { seg: 2, t: 0, cam: 2, transitionIn: 1 }], poses: [] });
    const cp = pb.getCutPlan();
    const S = pb.state();
    const out = { ok, cuts: (cp && Array.isArray(cp.cuts)) ? cp.cuts : null, S: S || null };
    if (${JSON.stringify(extras)} === true) {
      const p = pb.plan();
      const w = pb.walkSpec(1);
      out.stateJson = S ? JSON.stringify({ durs: S.durs, cum: S.cum, total: S.total, tails: S.tails, beats: S.beats, leads: S.leads }) : null;
      out.planJson = p ? JSON.stringify(p) : null;
      out.walkSpec = w === undefined ? null : w;
      out.walkSpecJson = JSON.stringify(w === undefined ? null : w);
    }
    return out;
  })()`);
  // L2b bracket (and C-beat's): lo0 = S.cum[1], hi0 = S.cum[2] - S.leads[2] - S.beats[1] / 2,
  // predicate sl.seg === 1 && sl.beat === true; ends read, then 24 steps (run whenever
  // both ends are finite: a pure read, so the page sequence is the same on every tree)
  const beatBracketRead = (label) => pe(label, `(() => {
    const pb = window.__playback;
    const S = pb.state();
    if (!S) return { lo0: null, hi0: null, atLo0: null, atHi0: null, bracket: null, err: 'state() null' };
    const read = (T) => { pb.seek(T); const sl = pb.strikeLive(); return sl ? { seg: sl.seg, beat: sl.beat } : null; };
    const pred = (sl) => !!sl && sl.seg === 1 && sl.beat === true;
    const lo0 = S.cum[1];
    const hi0 = S.cum[2] - S.leads[2] - S.beats[1] / 2;
    const atLo0 = read(lo0), atHi0 = read(hi0);
    let bracket = null;
    if (Number.isFinite(lo0) && Number.isFinite(hi0)) {
      let lo = lo0, hi = hi0, steps = 0, err = null;
      for (let i = 0; i < 24; i++) {
        const mid = (lo + hi) / 2;
        const sl = read(mid);
        if (!sl) { err = 'strikeLive() null at T ' + mid; break; }
        if (pred(sl)) hi = mid; else lo = mid;
        steps++;
      }
      bracket = err ? { lo: null, hi: null, steps, err } : { lo, hi, steps };
    }
    return { lo0, hi0, atLo0, atHi0, bracket };
  })()`);
  // L2c: walkSpec(1) by value in the L2b state (a JSON copy, or null when pb.beats[1] is null)
  const walkRead = (label) => pe(label, `(() => {
    const w = window.__playback.walkSpec(1);
    return { walkSpec: w === undefined ? null : w };
  })()`);
  // L5 fade plan: tS = (Math.round(S.durs[1] * 100) - 1) / 100 (seconds input, :3773),
  // cut {seg:1, t:tS, cam:0, transitionIn:2, dur:1}; read-back, state(), plan().opts.fades,
  // T_j = S.cum[1] + S.durs[1] + j * (E_1 - S.durs[1]) / 8 and a_j = fadeAlphaAt(T_j) (:12155)
  const l5FadeRead = () => pe('l5-fade', `(() => {
    const pb = window.__playback;
    const S0 = pb.state();
    if (!S0) return { tS: null, ok: null, cuts: null, S: null, planFades: null, samples: [] };
    const tS = (Math.round(S0.durs[1] * 100) - 1) / 100;
    const ok = pb.setCutPlan({ cuts: [{ seg: 1, t: tS, cam: 0, transitionIn: 2, dur: 1 }], poses: [] });
    const cp = pb.getCutPlan();
    const S = pb.state();
    const p = pb.plan();
    const samples = [];
    if (S) {
      const E1 = Math.max(S.durs[1] + S.tails[1], S.completions[1]);
      for (let j = 1; j <= 8; j++) {
        const T = S.cum[1] + S.durs[1] + j * (E1 - S.durs[1]) / 8;
        samples.push({ j, T, a: pb.fadeAlphaAt(T) });
      }
    }
    return { tS, ok, cuts: (cp && Array.isArray(cp.cuts)) ? cp.cuts : null, S: S || null,
      planFades: (p && p.opts && p.opts.fades !== undefined) ? p.opts.fades : null, samples };
  })()`);
  // L5 baseline: the same cut with transitionIn 0 (node passes tS and the T_j of the fade state)
  const l5BaseRead = (tS, Ts) => pe('l5-base', `(() => {
    const pb = window.__playback;
    const tS = ${JSON.stringify(tS)};
    const Ts = ${JSON.stringify(Ts)};
    const ok = pb.setCutPlan({ cuts: [{ seg: 1, t: tS, cam: 0, transitionIn: 0, dur: 1 }], poses: [] });
    const cp = pb.getCutPlan();
    const S = pb.state();
    const p = pb.plan();
    return { ok, cuts: (cp && Array.isArray(cp.cuts)) ? cp.cuts : null, S: S || null,
      planFades: (p && p.opts && p.opts.fades !== undefined) ? p.opts.fades : null,
      b: Array.isArray(Ts) ? Ts.map((T) => pb.fadeAlphaAt(T)) : [] };
  })()`);
  // L6 / C-trim: setTrim(0, S.cum[2] - S.leads[2] - S.beats[1] / 2) (:12103-12110), state()
  // re-read, plan() (L6: { recordsLength, opts }; control: the byte-exact JSON strings)
  const trimRead = (label) => pe(label, `(() => {
    const pb = window.__playback;
    const S1 = pb.state();
    if (!S1) return { trimArg: null, trimOk: null, S: null, P: null, stateJson: null, planJson: null };
    const arg = S1.cum[2] - S1.leads[2] - S1.beats[1] / 2;
    const ok = pb.setTrim(0, arg);
    const S = pb.state();
    const p = pb.plan();
    return { trimArg: arg, trimOk: ok, S: S || null,
      P: p ? { recordsLength: Array.isArray(p.records) ? p.records.length : null,
        opts: JSON.parse(JSON.stringify(p.opts === undefined ? null : p.opts)) } : null,
      stateJson: S ? JSON.stringify({ durs: S.durs, cum: S.cum, total: S.total, tails: S.tails, beats: S.beats, leads: S.leads }) : null,
      planJson: p ? JSON.stringify(p) : null };
  })()`);
  const closeRead = () => pe('ctrl-close', `(() => { window.__playback.close(); return true; })()`);
  const pick = (o, keys) => (o ? Object.fromEntries(keys.map((k) => [k, o[k] === undefined ? null : o[k]])) : null);
  // gateOf, copied from verdict-864.mjs:696 (not exported there): a leg's explicit
  // `gate` (L2b / L6 / C-beat) or else PASS. Used ONLY to decide whether the next
  // page step runs (card: "C-trim, only if C-beat's guards passed"); never a verdict.
  const gateOf = (r) => !!r && (typeof r.gate === 'boolean' ? r.gate : r.verdict === 'PASS');
  // phases not run because an upstream gate was closed (not a CRASH): phase -> reason
  const skipped = new Map();
  const skip = (phases, why) => { for (const p of phases) skipped.set(p, why); say(`DVR864 note: ${phases.join(', ')} not run: ${why}`); };
  const WITNESS_PHASES = ['l2', 'l3', 'l4', 'l2b', 'l2c', 'l4beat', 'l5', 'l6'];
  const CTRL_PHASES = ['ctrl.setup', 'ctrl.beat', 'ctrl.trim'];
  if (process.env.OB_DVR864_CONTROL_BASELINE) {
    try {
      controlBaseline = JSON.parse(fs.readFileSync(process.env.OB_DVR864_CONTROL_BASELINE, 'utf8'));
      if (controlBaseline?.schema !== 'dvr864-control-states/1') throw new Error(`schema ${controlBaseline?.schema}`);
    } catch (e) {
      fail(`DVR864 control baseline unreadable: ${String((e && e.message) || e).split('\n')[0]}`);
      controlBaseline = null;
    }
  }
  try {
    // ------------------------------------------------ second boot (card "Host")
    server2 = spawnStaticServer(webDir, PORT);
    await sleep(700);
    chrome2 = await launchChrome(DVR864_URL, { port: CDP_PORT });
    let ready = false;
    for (let i = 0; i < 200 && !ready; i++) { await sleep(200); ready = await readyRead(); }
    if (!ready) throw new Error('second boot: app never became ready (200 x 200 ms, the e2e-export-z2.mjs:54 bound)');
    // ------------------------------------------------ boot-mode line, once, before Setup
    const b = await bootRead();
    let webcodecs = null, webcodecsError = null;
    try {
      webcodecs = await webcodecsRead();
      await sleep(200);
      await exportClose();
      await sleep(200);
    } catch (e) { webcodecsError = String((e && e.message) || e); }
    R.boot = { url: b.url, archiveArmed: b.archiveArmed, twoClock: b.twoClock, speed: b.speed, webcodecs, webcodecsError };
    R.meta.url = b.url ?? DVR864_URL;
    say(V.formatBootMode(R.boot));
    bootPrinted = true;
    if (webcodecsError !== null) say(`DVR864 note: webcodecs unreadable: ${webcodecsError}`);
    done.add('boot');
    // ------------------------------------------------ Setup 1-5 (witness session)
    const activateSnooker = await activateRead('setup-activate');
    await sleep(600); // the suite's own settle after activateSnooker (e2e-export-z2.mjs:57)
    const rows = [];
    for (const v0 of [0.94, 0.935, 2.5]) rows.push(await fireRow(v0));
    const aw = await archiveRead('setup-archive');
    const sidW = aw.sid0;
    const ow = sidW === null ? null : await openRead('setup-open', sidW);
    const ew = sidW === null ? null : await emptyPlanRead('setup-empty');
    R.setup = { activateSnooker, rows, flush: aw.flush, flushType: aw.flushType, sidW, current: aw.current,
      sessionsIds: aw.sessionsIds, sessionsLen: aw.sessionsLen, openOk: ow ? ow.openOk : null,
      S0: ow ? ow.S : null, emptyPlanOk: ew ? ew.emptyPlanOk : null, S: ew ? ew.S : null, planFades: ew ? ew.planFades : null };
    done.add('setup');
    const g0 = V.runAll(R, {}).byLeg;
    if (!gateOf(g0.SETUP)) {
      skip([...WITNESS_PHASES, ...CTRL_PHASES], `SETUP gate closed (${g0.SETUP.verdict}: ${g0.SETUP.why})`);
    } else {
      // ---------------------------------------------- L2, L3, L4 in the Setup-5 state
      const l2 = await bracketsRead('l2', null);
      R.l2 = { brackets: l2.brackets, err: l2.err ?? null };
      done.add('l2');
      const l3 = await ownerRead('l3');
      R.l3 = { reads: l3.reads, err: l3.err ?? null };
      done.add('l3');
      const r4 = await renderRead('l4-render');
      R.l4 = { plan: r4.plan, res: r4.res, error: r4.error, timelineBeats: r4.timelineBeats,
        resNull: r4.resNull, playerOpenAfter: r4.playerOpenAfter ?? null, note: r4.note ?? null };
      done.add('l4');
      // ---------------------------------------------- L2b (MOVE-seam plan), L2c, L4-beat
      const p2b = await movePlanRead('l2b-plan', false);
      const b2b = await beatBracketRead('l2b-bracket');
      R.l2b = { ok: p2b.ok, cuts: p2b.cuts, S: p2b.S, lo0: b2b.lo0, hi0: b2b.hi0, atLo0: b2b.atLo0, atHi0: b2b.atHi0,
        bracket: b2b.bracket, err: b2b.err ?? null };
      done.add('l2b');
      R.l2c = { walkSpec: (await walkRead('l2c')).walkSpec };
      done.add('l2c');
      // L4-beat repeats L4 (card :497): L2's bisection for every k < n-1 in this state (ks null)
      const lb = await bracketsRead('l4beat-brackets', null);
      const r4b = await renderRead('l4beat-render');
      R.l4beat = { plan: r4b.plan, res: r4b.res, error: r4b.error, timelineBeats: r4b.timelineBeats,
        brackets: lb.brackets, bracketsErr: lb.err ?? null,
        resNull: r4b.resNull, playerOpenAfter: r4b.playerOpenAfter ?? null, note: r4b.note ?? null };
      done.add('l4beat');
      // ---------------------------------------------- L5 (fade plan, then the baseline)
      const f5 = await l5FadeRead();
      const s5 = Array.isArray(f5.samples) ? f5.samples : [];
      const b5 = await l5BaseRead(f5.tS, s5.map((s) => s.T));
      const bs = Array.isArray(b5.b) ? b5.b : [];
      R.l5 = { tS: f5.tS,
        fade: { ok: f5.ok, cuts: f5.cuts, S: f5.S, planFades: f5.planFades },
        base: { ok: b5.ok, cuts: b5.cuts, S: b5.S, planFades: b5.planFades },
        samples: s5.map((s, i) => ({ j: s.j, T: s.T, a: s.a ?? null, b: bs[i] ?? null })) };
      done.add('l5');
      // ---------------------------------------------- L6, last on the witness (it leaves a trim).
      // The page steps run whatever the precondition reads, so the page sequence is the
      // same on every tree; the module applies the precondition (ruling 12).
      const p6 = await movePlanRead('l6-plan', false);
      const t6 = await trimRead('l6-trim');
      const r6 = await renderRead('l6-render');
      R.l6 = { plan: { ok: p6.ok, cuts: p6.cuts, S: p6.S }, trimArg: t6.trimArg, trimOk: t6.trimOk, S: t6.S, P: t6.P, planJson: t6.planJson ?? null,
        res: r6.res, error: r6.error, renderPlan: r6.plan, resNull: r6.resNull, note: r6.note ?? null };
      done.add('l6');
      // ---------------------------------------------- positive control: split step
      await closeRead();
      let closeState = 'PLAYBACK';
      for (let i = 0; i < 60; i++) { // waitFor(..., 60, 300): e2e-playback.mjs:3205 with :558-565
        closeState = await stateRead('ctrl-close-wait');
        if (closeState !== 'PLAYBACK') break;
        await sleep(300);
      }
      R.ctrl = { closeState, activateOk: null, rows: null, flush: null, sidC: null, sessionsIds: null, S0: null,
        emptyPlanOk: null, S: null, empty: null, beat: null, trim: null };
      if (typeof closeState !== 'string' || closeState === 'PLAYBACK') {
        skip(CTRL_PHASES, `the player did not close (__test.state() ${JSON.stringify(closeState)})`);
      } else {
        R.ctrl.activateOk = await activateRead('ctrl-activate');
        await sleep(600); // the suite's own settle after activateSnooker (e2e-export-z2.mjs:57)
        if (R.ctrl.activateOk !== true) {
          skip(CTRL_PHASES, `second activateSnooker returned ${JSON.stringify(R.ctrl.activateOk)}`);
        } else {
          const crow = [];
          for (const v0 of [2.5, 2.5, 2.5]) crow.push(await fireRow(v0));
          R.ctrl.rows = crow;
          const ac = await archiveRead('ctrl-archive');
          Object.assign(R.ctrl, { flush: ac.flush, flushType: ac.flushType, sidC: ac.current, sessionsIds: ac.sessionsIds,
            sessionsLen: ac.sessionsLen });
          const sidC = ac.current;
          // the card's sid rule, applied before openSession so a failed split never re-opens the witness
          if (!(sidC !== null && sidC !== sidW && sidC === ac.sid0)) {
            skip(CTRL_PHASES, `sid rule failed (sid_w ${JSON.stringify(sidW)} sid_c ${JSON.stringify(sidC)} sessions[0] ${JSON.stringify(ac.sid0)})`);
          } else {
            const oc = await openRead('ctrl-open', sidC);
            const ec = await emptyPlanRead('ctrl-empty');
            Object.assign(R.ctrl, { openOk: oc.openOk, S0: oc.S, emptyPlanOk: ec.emptyPlanOk, S: ec.S,
              empty: { stateJson: ec.stateJson, planJson: ec.planJson } });
            done.add('ctrl.setup');
            // ------------------------------------------ C-beat (runs when the module would evaluate it)
            const gc = V.runAll(R, {}).byLeg;
            if (!gateOf(gc['L0-control'])) {
              skip(['ctrl.beat', 'ctrl.trim'], `L0-control gate closed (${gc['L0-control'].verdict}: ${gc['L0-control'].why})`);
            } else {
              const cb = await movePlanRead('ctrl-beat-plan', true);
              const cbb = await beatBracketRead('ctrl-beat-bracket');
              R.ctrl.beat = { ok: cb.ok, cuts: cb.cuts, S: cb.S, stateJson: cb.stateJson ?? null, planJson: cb.planJson ?? null,
                walkSpec: cb.walkSpec ?? null, walkSpecJson: cb.walkSpecJson ?? null, lo0: cbb.lo0, hi0: cbb.hi0,
                atLo0: cbb.atLo0, atHi0: cbb.atHi0, bracket: cbb.bracket, err: cbb.err ?? null };
              done.add('ctrl.beat');
              // ---------------------------------------- C-trim, only if C-beat's guards passed (card)
              const gt = V.runAll(R, {}).byLeg;
              if (!gateOf(gt['C-beat'])) {
                skip(['ctrl.trim'], `C-beat guards did not pass (${gt['C-beat'].verdict}: ${gt['C-beat'].why})`);
              } else {
                const ct = await trimRead('ctrl-trim');
                R.ctrl.trim = pick(ct, ['trimArg', 'trimOk', 'S', 'stateJson', 'planJson']);
                done.add('ctrl.trim');
              }
            }
          }
        }
      }
    }
  } catch (e) {
    crash = e;
    say(`DVR864 CRASH: ${(e && e.stack) || String(e)}`);
    fail(`DVR864 CRASH: ${String((e && e.message) || e).split('\n')[0]}`);
  } finally {
    if (chrome2) { try { chrome2.close(); } catch (e) { say(`DVR864 note: second-boot close threw: ${String(e)}`); } }
    if (server2) { try { await stopStaticServer(server2); } catch (e) { say(`DVR864 note: second-boot server stop threw: ${String(e)}`); } }
  }
  // ---------------------------------------------------------------- verdicts + output
  const crashMsg = crash ? String((crash && crash.message) || crash).split('\n')[0] : null;
  const crashWhy = `depends on CRASH: ${crashMsg}`;
  const unread = (leg) => (PHASES_OF[leg] ?? []).filter((p) => !done.has(p) && !skipped.has(p));
  try {
    const res = V.runAll(R, { controlBaseline });
    let result = res, lines = res.lines.slice(1); // [0] is the boot-mode line
    if (crash) {
      // every leg whose readings were not all taken: INVALID `depends on CRASH` (never a verdict)
      const legs = res.legs.map((r) => {
        const miss = unread(r.leg);
        return miss.length ? { leg: r.leg, verdict: 'INVALID', why: crashWhy, print: `unread phases ${miss.join(',')}`, gate: false, crashed: true } : r;
      });
      const byLeg = Object.fromEntries(legs.map((r) => [r.leg, r]));
      const count = (v) => legs.filter((r) => r.verdict === v).length;
      const counts = { legs: legs.length, invalid: count('INVALID'), fail: count('FAIL'), pass: count('PASS') };
      lines = [...legs.map(V.legLine), V.ruling12Line(R, byLeg.L6), V.ruling13Line(R),
        `DVR864 SUMMARY ${legs.map((r) => `${r.leg}=${r.verdict}`).join(' ')}`,
        `DVR864 END legs ${counts.legs} invalid ${counts.invalid} fail ${counts.fail} pass ${counts.pass}`];
      result = { legs, byLeg, lines: [V.formatBootMode(R.boot), ...lines], counts };
    }
    if (!bootPrinted) { say(V.formatBootMode(R.boot)); bootPrinted = true; }
    for (const line of lines) say(line);
    const ASSERTED = ['SETUP', 'L0', 'L1', 'L2', 'L3', 'L4a', 'L4b', 'L2b', 'L2c', 'L4-beat',
      'L5', 'L6', 'L6a', 'L6b', 'CTRL-SPLIT', 'L0-control'];
    for (const leg of ASSERTED) {
      const r = result.byLeg[leg];
      if (!r || r.verdict !== 'PASS') fail(r ? V.legLine(r) : `DVR864 ${leg} missing from the verdict`);
    }
    for (const leg of ['C-empty', 'C-beat', 'C-trim']) {
      const r = result.byLeg[leg];
      const deferred = !controlBaseline && r && r.verdict === 'INVALID' && r.why === V.COMPARE_DEFERRED;
      if (!r || (r.verdict !== 'PASS' && !deferred)) fail(r ? V.legLine(r) : `DVR864 ${leg} missing from the verdict`);
    }
    for (const line of lines) if (/^DVR864 RULING-1[23] .* -> .*INVALID/.test(line)) fail(line);
    // the dump has its own try: the contract lines above are final; a failed or refused
    // write prints one note and sets the exit status, never a CRASH or a second line set
    let plan = null;
    try {
      plan = V.outputPlan(process.env.OB_DVR864_OUT, R, result);
      say(plan.note);
      if (plan.refused) fail(plan.note);
      if (plan.files.length) {
        fs.mkdirSync(plan.dir, { recursive: true });
        for (const f of plan.files) {
          fs.writeFileSync(f.path, f.text);
          say(`DVR864 note: wrote ${f.path} (${Buffer.byteLength(f.text)} bytes)`);
        }
      }
    } catch (e) {
      say(`DVR864 note: dump failed: ${String((e && e.message) || e).split('\n')[0]}`);
      fail(`DVR864 dump failed: ${String((e && e.message) || e).split('\n')[0]}`);
    }
  } catch (e) {
    // the module itself is unusable: the fixed contract lines, every leg INVALID by the CRASH
    if (!(e && e.dvr864Printed)) say(`DVR864 CRASH: ${(e && e.stack) || String(e)}`);
    fail(`DVR864 verdict module unusable: ${String((e && e.message) || e).split('\n')[0]}`);
    const why = crash ? crashWhy : `depends on CRASH: ${String((e && e.message) || e).split('\n')[0]}`;
    const b0 = R.boot ?? {};
    if (!bootPrinted) {
      say(`DVR864 boot-mode ${b0.url ?? null} archive-armed ${b0.archiveArmed === true ? 'true' : b0.archiveArmed === false ? 'false' : 'unreadable'}`
        + ` twoClock ${b0.twoClock ?? null} speed ${b0.speed ?? null} webcodecs ${b0.webcodecs ?? null} | seams: verdict module unavailable`);
    }
    for (const leg of FALLBACK_LEGS) say(`DVR864 ${leg} INVALID: ${why} | `);
    say(`DVR864 RULING-12 tails0[1] unreadable -> L6 INVALID ${why}`);
    say(`DVR864 RULING-13 witness seam unreadable, beats[1] unreadable; control seam unreadable, beats[1] unreadable -> INVALID ${why}`);
    for (const leg of FALLBACK_LEGS) fail(`DVR864 ${leg} INVALID: ${why} | `);
    fail(`DVR864 RULING-12 tails0[1] unreadable -> L6 INVALID ${why}`);
    fail(`DVR864 RULING-13 witness seam unreadable, beats[1] unreadable; control seam unreadable, beats[1] unreadable -> INVALID ${why}`);
    say(`DVR864 SUMMARY ${FALLBACK_LEGS.map((l) => `${l}=INVALID`).join(' ')}`);
    say(`DVR864 END legs ${FALLBACK_LEGS.length} invalid ${FALLBACK_LEGS.length} fail 0 pass 0`);
  }
}
if (!process.exitCode) console.log('E2E-EXPORT-Z2 PASS (the export plan covers the last pocket drop: runExport, the drill builder (live AND non-live records), the estimate seam and realtime read ONE completion; cueTail read from cueTailForEstimate over the live record; the DVR live schedule ends each segment at E_i: 16 legs asserted, the control compare ' + (controlBaseline ? 'asserted' : 'deferred without a baseline') + ')');
else console.log(`E2E-EXPORT-Z2 FAIL (${failCount} failure(s))`);
