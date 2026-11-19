// Copyright (c) Meta Platforms, Inc. and affiliates.

// perf-shell.mjs — the 031/D7 phone-emulation shell baseline RECORDER
// (feature 031 (internal spec) FR-012; research R9). RECORDED, NOT GATED: numbers
// become the #525 program's no-regress reference (a metric's no-regress
// clock starts at the slice that records it — S1: boot settle, the four
// place moves, shell-idle cadence; S2 ADDS the staged-cue pose).
//
// REAL-USER path by construction (review r1 on PR #527): boots through
// touch-cdp.mjs launchPhone with `tool: false` — no obtool stamp, so the
// shell exists, the renderer runs the real-user DPR-2 cap (not the
// scripted DPR-1 pin), and the measured settle IS the shipped settle.
// perf-aim.mjs / perf-ui.mjs are NOT touched (their scripted baselines and
// CI gates stay byte-stable while issue #528 is live).
//
//   node web/tools/perf-shell.mjs [--viewport 844x390] [--out out.json]
//                                 [--label s1-baseline] [--port 8845]
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { launchChrome, sleep, spawnStaticServer, stopStaticServer }
  from './cdp.mjs';
import { launchPhone } from './touch-cdp.mjs';

// GH-687: what this tool's numeric port-like flags MEAN (run-gate never guesses)
export const PORT_FLAGS = { '--port': 'cdp', '--serve': 'http', '--viewport': 'none' };
const arg = (name, dflt) => {
  const i = process.argv.indexOf('--' + name);
  return i > 0 ? process.argv[i + 1] : dflt;
};
const LABEL = arg('label', 's1-baseline');
const VIEWPORT = arg('viewport', '844x390');
const OUT = arg('out', null);
const CDP = Number(arg('port', process.env.OB_E2E_CDP_PORT ?? 8845));
const PORT = Number(arg('serve', process.env.OB_E2E_PORT ?? 8186));
const DESKTOP = process.argv.includes('--desktop'); // debug escape hatch
const [W, H] = VIEWPORT.split('x').map(Number);
if (!Number.isFinite(W) || !Number.isFinite(H)) {
  throw new Error(`--viewport wants WxH (got ${VIEWPORT})`);
}

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = spawnStaticServer(webDir, PORT);
await sleep(700);
const url = `http://127.0.0.1:${PORT}/app.html`;
const chrome = DESKTOP
  ? await launchChrome(url, { port: CDP, width: W, height: H, tool: false })
  : await launchPhone(url, { cdpPort: CDP, width: W, height: H, tool: false });

// rAF-delta ring + mover-transition marks, installed at document start so
// the BOOT SETTLE is captured (the first moving:true→false span).
await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: `
  (() => {
    const P = { ds: [], marks: [], _m: null, arrival: null, _arrival: undefined };
    window.__shellPerf = P;
    // 034 (T042): shell.js arrivalDone() flags window.__obShellArrival =
    // 'done' — a setter stamps the page clock at that moment so the play
    // mount rows below are offsets from the SHELL's arrival, not from load
    Object.defineProperty(window, '__obShellArrival', {
      configurable: true,
      get() { return P._arrival; },
      set(v) {
        P._arrival = v;
        if (v === 'done' && P.arrival === null) P.arrival = performance.now();
      },
    });
    const loop = (last) => requestAnimationFrame((t) => {
      if (last) P.ds.push([t, t - last]);
      const m = window.__shell?.moving?.() ?? null;
      if (m !== P._m) { P.marks.push([t, m]); P._m = m; }
      if (P.ds.length < 30000) loop(t);
    });
    loop(0);
  })();
` });
await chrome.send('Page.navigate', { url: `${url}?u=perfshell` });

let ready = false;
for (let i = 0; i < 200 && !ready; i++) {
  await sleep(200);
  ready = await chrome.eval('window.__test?.ready === true').catch(() => false);
}
if (!ready) throw new Error('real-user boot never became ready');
// wait for the fresh settle to land (first true→false transition)
let landed = false;
for (let i = 0; i < 60 && !landed; i++) {
  landed = await chrome.eval(`(() => {
    const m = window.__shellPerf.marks;
    return m.some(([, v]) => v === true)
      && window.__shell?.moving?.() === false
      && window.__shell?.isOpen?.() === true;
  })()`).catch(() => false);
  if (!landed) await sleep(300);
}
if (!landed) throw new Error('fresh settle never landed (shell absent?)');

// 034 (T042; protocol R3 — play's OWN metric rows, RECORDED not gated, plan
// ruling P8): the play module's `ob:play-mounted` mark (play.js mount(),
// stamped after the css-gated first paint) relative to the shell's arrival
// flag (shell.js arrivalDone → `window.__obShellArrival = 'done'`, captured
// by the document-start setter above). `boot.fresh.play-mounted` = the
// FRESH boot that just landed; `boot.returning.play-mounted` = a RETURNING
// boot (ob-shell-v1 present, obshell unset — shell.js openShell({ bootPose:
// true }) then arrivalDone(true)) measured at the end of the run on the same
// profile. Each row carries the arrival stamp, the mark stamp and their
// offset (a negative offset = the module painted before the arrival flag
// settled — the returning branch opens BEFORE arrivalDone, so that sign is
// informative, not a defect). The no-regress clock for both rows starts at
// 034a-front; the integrator re-records the baseline JSON once on the
// integration branch.
const PLAY_MOUNT_JS = `(() => {
  const P = window.__shellPerf;
  const m = performance.getEntriesByName('ob:play-mounted')[0] ?? null;
  return {
    arrivalMs: P.arrival === null ? null : +P.arrival.toFixed(1),
    markMs: m ? +m.startTime.toFixed(1) : null,
    offsetMs: (m && P.arrival !== null)
      ? +(m.startTime - P.arrival).toFixed(1) : null,
    boot: window.__shell?.state?.().boot ?? null,
  };
})()`;
const playMountRow = async () => {
  let row = null;
  for (let i = 0; i < 40; i++) { // bounded 4 s: guarded import + css load
    row = await chrome.eval(PLAY_MOUNT_JS).catch(() => null);
    if (row && row.markMs !== null && row.arrivalMs !== null) break;
    await sleep(100);
  }
  return row;
};
const freshPlay = await playMountRow();
if (!freshPlay || freshPlay.markMs === null) {
  console.error('fresh play-mounted row: mark never landed (play.js degraded?)');
}
await sleep(1000); // GI bake / texture settle before the move windows

const STATS_JS = `(lo, hi) => {
  const ds = window.__shellPerf.ds
    .filter(([t]) => t >= lo && t <= hi).map(([, d]) => d)
    .sort((a, b) => a - b);
  const q = (p) => +(ds[Math.min(ds.length - 1,
    Math.floor(p * ds.length))] ?? NaN).toFixed(2);
  return { n: ds.length, p50: q(0.5), p95: q(0.95), p99: q(0.99),
    max: +(ds[ds.length - 1] ?? NaN).toFixed(2) };
}`;

/** Window stats between two page timestamps. */
const statsBetween = (lo, hi) => chrome.eval(`(${STATS_JS})(${lo}, ${hi})`);

// settle window from the recorded marks
const settleWin = await chrome.eval(`(() => {
  const m = window.__shellPerf.marks;
  const a = m.find(([, v]) => v === true);
  const b = m.find(([t, v]) => v === false && a && t > a[0]);
  return a && b ? { lo: a[0], hi: b[0], ms: +(b[0] - a[0]).toFixed(1) } : null;
})()`);
const metrics = {};
if (settleWin) {
  metrics.settle = { windowMs: settleWin.ms,
    ...(await statsBetween(settleWin.lo, settleWin.hi)) };
}
metrics['boot.fresh.play-mounted'] = freshPlay; // 034 (T042)

// the four place moves (real-user animated moves; each ~0.9 s)
const order = [['play', 'practice'], ['practice', 'equipment'],
  ['equipment', 'replays'], ['replays', 'play']];
await chrome.eval(`__shell.go('play'), true`);
await sleep(1400);
for (const [from, to] of order) {
  const t0 = await chrome.eval(`(performance.now() + (__shell.go('${to}'), 0))`);
  // wait for the landing mark
  let done = null;
  for (let i = 0; i < 30 && !done; i++) {
    await sleep(100);
    done = await chrome.eval(`(() => {
      const m = window.__shellPerf.marks;
      const b = [...m].reverse().find(([t, v]) => v === false && t > ${t0});
      return (!window.__shell.moving() && b) ? b[0] : null;
    })()`);
  }
  if (!done) { console.error(`move ${from}→${to} never landed`); continue; }
  metrics[`move.${from}->${to}`] = await statsBetween(t0, done);
  await sleep(400);
}

// shell-idle cadence: 3 s at rest, shell open at the play anchor
{
  const lo = await chrome.eval('performance.now()');
  await sleep(3000);
  const hi = await chrome.eval('performance.now()');
  metrics.idle = await statsBetween(lo, hi);
}

// 032 S2 (the D7 clock law — this metric's no-regress clock starts HERE):
// the STAGED-CUE pose — equipment place → cues station → a cue floated on
// camera layer 1 with the idle turntable RUNNING (one orbit-state-free
// instance rotation per frame + the extra mesh in the frustum). Real-user
// path, DPR-2. RECORDED, not gated.
{
  await chrome.eval(`__shell.go('equipment'), true`);
  let atl = false;
  for (let i = 0; i < 40 && !atl; i++) {
    atl = await chrome.eval('typeof window.__atelier === "object"')
      .catch(() => false);
    if (!atl) await sleep(200);
  }
  if (!atl) console.error('staged-cue window skipped: atelier never mounted');
  else {
    await chrome.eval(`__atelier.go('cues'), true`);
    await sleep(1400); // the station move lands
    await chrome.eval(`document.querySelector(
      '[data-ob="atelier-cues"] .ob-eq-prov-row__pick')?.click(), true`);
    let staged = false;
    for (let i = 0; i < 20 && !staged; i++) {
      staged = await chrome.eval('__atelier.floatState().staged === true')
        .catch(() => false);
      if (!staged) await sleep(200);
    }
    if (!staged) console.error('staged-cue window skipped: float never staged');
    else {
      await sleep(1400); // the framing move lands
      // let the ~4 s idle clock expire so the TURNTABLE is live in the
      // measured window (the worst-case per-frame cost of this surface)
      let turning = false;
      for (let i = 0; i < 30 && !turning; i++) {
        await sleep(300);
        turning = await chrome.eval('__atelier.floatState().turning')
          .catch(() => false);
      }
      const lo = await chrome.eval('performance.now()');
      await sleep(4000);
      const hi = await chrome.eval('performance.now()');
      metrics['stagedCue' + (turning ? '' : '.noTurntable')] =
        await statsBetween(lo, hi);
    }
    await chrome.eval('__shell.quickPlay(), true');
  }
}

// 034 (T042): the RETURNING boot row — same profile (the fresh boot above
// wrote ob-shell-v1), obshell unset ⇒ shell.js's `returning` branch (instant
// Play pose via bootPose, then arrivalDone(true)); the document-start script
// re-arms on the new document, so the arrival stamp and the mark are both
// this navigation's. Skipped with a reason (row null) when the boot class
// is not `returning` — the ledger names it either way.
{
  await chrome.send('Page.navigate', { url: `${url}?u=perfshell-returning` });
  let rdy = false;
  for (let i = 0; i < 200 && !rdy; i++) {
    await sleep(200);
    rdy = await chrome.eval('window.__test?.ready === true'
      + ' && window.__shell?.isOpen?.() === true').catch(() => false);
  }
  const row = rdy ? await playMountRow() : null;
  if (!row || row.boot !== 'returning') {
    console.error(`returning play-mounted row skipped: boot=${row?.boot ?? 'n/a'}`
      + ` ready=${rdy}`);
  }
  metrics['boot.returning.play-mounted'] = row;
}
// 035 S4 (the D7 clock law — this metric's no-regress clock starts HERE):
// `replays.rail` — wall ms from `__shell.go('replays')` to the FIRST
// `#ob-replays-rail .ob-pb-row` paint (rAF-observed in page) with TWELVE
// archived sessions on the real-user path (the archive is ARMED on a
// tool:false boot; one shot per session split by a seed-bearing rerack —
// the e2e-archive split law), plus the frame stats of that window. The
// leaf is already RESIDENT here (mounted at its first arrival during the
// S1 move loop above), so the window is the re-arrival cost with rows to
// paint: presentPlace → archive read → row render → first paint. The
// first-arrival import cost is the S1 `move.equipment->replays` row's
// business (the same boot, empty archive). RECORDED, not gated; the
// baseline JSON is re-recorded once by the integrator
// (protocol R3). Appended after the S2 row; registry order puts the play
// lane's `boot.returning.play-mounted` before it once that lane lands.
{
  let seeded = 0;
  for (let i = 0; i < 12; i++) {
    if (i > 0) await chrome.eval(`__test.rerack(${100 + i}), true`);
    let err = null;
    for (let k = 0; k < 20; k++) {
      err = await chrome.eval(`__test.shoot(${JSON.stringify(
        i % 2 ? { v0: 1.4, phi: -0.9, theta: 0, a: 0, b: 0 }
          : { v0: 2.0, phi: Math.PI / 2, theta: 0, a: 0, b: 0 })})`);
      if (!err || !/aiming state/.test(String(err))) break;
      await sleep(500);
    }
    if (err) { console.error(`replays.rail seed ${i + 1} rejected: ${err}`); break; }
    let st = 'PLAYBACK';
    for (let k = 0; k < 200 && (st === 'PLAYBACK' || st === 'SIMULATING'); k++) {
      await sleep(300); st = await chrome.eval('__test.state()');
    }
    seeded += 1;
  }
  await chrome.eval('window.__archive?.flush?.()');
  const sessions = await chrome.eval(
    '(async () => (await window.__archive?.sessions?.())?.length ?? 0)()');
  if (seeded < 12 || sessions < 12) {
    console.error(`replays.rail window skipped: ${seeded} shots / ${sessions} sessions`);
  } else {
    await chrome.eval(`__shell.openShell({ place: 'play' }), true`);
    let open = false;
    for (let i = 0; i < 40 && !open; i++) {
      await sleep(200);
      open = await chrome.eval(
        'window.__shell.isOpen() && !window.__shell.moving()').catch(() => false);
    }
    if (!open) console.error('replays.rail window skipped: the hall never opened');
    else {
      await sleep(600);
      const win = await chrome.eval(`new Promise((res) => {
        const t0 = performance.now();
        const painted = () => {
          const r = document.querySelector('#ob-replays-rail .ob-pb-row');
          return !!r && r.getClientRects().length > 0;
        };
        __shell.go('replays');
        const tick = () => {
          if (painted()) res({ t0, t1: performance.now() });
          else if (performance.now() - t0 > 15000) res(null);
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      })`);
      if (!win) console.error('replays.rail window skipped: no row painted in 15 s');
      else {
        metrics['replays.rail'] = { wallMs: +(win.t1 - win.t0).toFixed(1),
          sessions, ...(await statsBetween(win.t0, win.t1)) };
      }
      await chrome.eval('__shell.quickPlay(), true');
    }
  }
}

const env = await chrome.eval(`({
  dpr: devicePixelRatio,
  rendererPixelRatio: window.__dbg.renderer.getPixelRatio(),
  viewport: [innerWidth, innerHeight],
  coarse: matchMedia('(pointer: coarse)').matches,
  ua: navigator.userAgent,
})`);
if (!DESKTOP && env.rendererPixelRatio !== 2) {
  console.error(`WARNING: renderer pixel ratio ${env.rendererPixelRatio} — `
    + 'expected the real-user DPR-2 cap (scripted pin would be 1)');
}

const record = {
  tool: 'perf-shell.mjs',
  feature: '031-ui-shell S1 (program #525, FR-012 recorded baseline)',
  label: LABEL,
  date: new Date().toISOString(),
  path: 'REAL-USER (tool:false; no obtool stamp; DPR-2 cap active)',
  env,
  metrics,
};
const json = JSON.stringify(record, null, 2);
console.log(json);
if (OUT) {
  fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true });
  fs.writeFileSync(OUT, json + '\n');
  console.log(`\n[perf-shell] baseline written to ${OUT} (RECORDED, not gated)`);
}
chrome.close();
await stopStaticServer(server);
