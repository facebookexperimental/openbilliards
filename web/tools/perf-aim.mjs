// Copyright (c) Meta Platforms, Inc. and affiliates.

// perf-aim.mjs — scripted aim-drag perf + aim-continuity forensics.
// Boots the app, drives a realistic pointermove drag stream (circular
// azimuth sweep around the cue ball at ~120 ev/s) via CDP Input events, and
// reports rAF-delta percentiles, long tasks, composer.render CPU cost,
// preview-sim recomputes per frame, per-frame aim azimuth continuity, and
// ghost-ball stability at a constant pointer.
//
//   node web/tools/perf-aim.mjs [--url URL] [--label L] [--assist LEVEL]
//                               [--turns 2.5] [--rate 120] [--port 9333]
//                               [--viewport 844x390] [--out out.json]
//
// --viewport WxH (014 T037, FR-008/SC-006): boots with the frozen phone
// emulation recipe (touch-cdp.mjs launchPhone — DPR 3, mobile, touch
// emulation, overrides applied BEFORE app boot so the coarse-pointer
// activation seam sees the phone environment). Numbers at phone viewports
// are RECORDED, not gated (no device-class baseline exists this phase).
// Without the flag the launch path is byte-identical to before.
//
// GH-248 boot trace (lib/boottrace.mjs): with OB_PERF_BOOT_TRACE_DIR set, the
// launch is the traced one (launchWithBootTrace): the clock starts before
// Chrome is launched, Chrome boots on the app origin's root, a Chrome trace
// (toplevel, gpu, devtools.timeline) starts on the browser endpoint, and only
// then does the page navigate to the app. The trace is written there as
// boot-trace.json.gz only when the boot reaches __test.ready at or after
// OB_PERF_BOOT_TRACE_S (default 120 s from the launch), never reaches it, or
// the run fails (the CDP stall path included; the why file names the
// failure); otherwise it is discarded. OB_PERF_BOOT_TRACE_END_MS bounds the
// whole write (Tracing.end, Chrome's serialization, the reads; default
// 120000). Desktop only: with --viewport the run is untraced. Unset = no
// trace, launch path unchanged.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import {
  launchChrome, sleep, spawnStaticServer, stopStaticServer,
} from './cdp.mjs';
import {
  baselineSkip, deferLine, pacingKnobs, primeStormBaseline, sampleStorm, stormSkipLine,
} from './lib/pacing.mjs';
import { launchPhone } from './touch-cdp.mjs';
import { BOOT_TRACE_THRESHOLD_S, launchWithBootTrace, startBootTrace, toolUrl } from './lib/boottrace.mjs';

// GH-687: what this tool's numeric port-like flags MEAN (run-gate never guesses)
export const PORT_FLAGS = { '--port': 'cdp', '--serve': 'http', '--viewport': 'none' };
const arg = (name, dflt) => {
  const i = process.argv.indexOf('--' + name);
  return i > 0 ? process.argv[i + 1] : dflt;
};
const URL_ = arg('url', 'http://127.0.0.1:20280/app.html?seed=1');
const LABEL = arg('label', 'baseline');
const ASSIST = arg('assist', 'standard');
const TURNS = Number(arg('turns', '2.5'));
const RATE = Number(arg('rate', '120'));
const PORT = Number(arg('port', '9333'));
const SERVE = arg('serve', '20280'); // '' = reuse an existing server
const HEADED = process.argv.includes('--headed');
const OUT = arg('out', null);
const VIEWPORT = arg('viewport', ''); // 'WxH' = phone emulation (014 T037)
const vp = VIEWPORT ? VIEWPORT.split('x').map(Number) : null;
if (vp && (vp.length !== 2 || vp.some((n) => !Number.isFinite(n) || n <= 0))) {
  throw new Error(`--viewport wants WxH (got ${VIEWPORT})`);
}
const W = vp ? vp[0] : Number(arg('w', '1280'));
const H = vp ? vp[1] : Number(arg('h', '800'));
const VIEW = arg('view', 'orbit'); // 'orbit' | 'aim'
// Phase notes on stderr (stdout stays the JSON contract). CI's LIVE gate
// used to be silent until its final line, so a software-rasterizer stall
// looked identical to a hang; every phase now says when it started and how
// long the previous one took.
const T0 = Date.now();
const note = (m) => process.stderr.write(
  `[perf-aim +${((Date.now() - T0) / 1000).toFixed(1)}s] ${m}\n`);

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// GH-691: the storm belt's busy-CPU bar is derived from a pre-run rested
// baseline — primed before this tool's own load unless the job's
// storm-baseline step already wrote OB_PACING_BASELINE (ci.yml's hosted
// perf job pins OB_PACING_STORM_BUSYCPU explicitly instead; see there)
await primeStormBaseline({ log: (l) => note(l) });
let server = null;
if (SERVE) {
  server = spawnStaticServer(webDir, SERVE);
  await sleep(700);
}
const consoleErrors = [];
const BOOT_TRACE_DIR = process.env.OB_PERF_BOOT_TRACE_DIR || '';
const BOOT_TRACE_S = Number(process.env.OB_PERF_BOOT_TRACE_S || BOOT_TRACE_THRESHOLD_S);
if (BOOT_TRACE_DIR && vp) note('boot trace: not recorded with --viewport (launchPhone navigates to the app itself)');
// GH-248: the traced launch starts the trace before the app loads; null = the untraced launch below, unchanged
const boot = BOOT_TRACE_DIR && !vp
  ? await launchWithBootTrace({ appUrl: URL_, navUrl: toolUrl(URL_), dir: BOOT_TRACE_DIR, thresholdS: BOOT_TRACE_S,
      launch: (url) => launchChrome(url, { port: PORT, width: W, height: H, headless: !HEADED, tool: false }),
      start: () => startBootTrace({ cdpPort: PORT,
        endTimeoutMs: Number(process.env.OB_PERF_BOOT_TRACE_END_MS || 120000) }),
      note })
  : null;
const chrome = boot ? boot.chrome : vp
  ? await launchPhone(URL_, { cdpPort: PORT, width: W, height: H,
      headless: !HEADED })
  : await launchChrome(URL_, { port: PORT, width: W, height: H,
      headless: !HEADED });
chrome.onEvent((method, params) => {
  if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
    consoleErrors.push(params.args.map((a) => a.value ?? a.description).join(' '));
  } else if (method === 'Runtime.exceptionThrown') {
    consoleErrors.push(params.exceptionDetails.exception?.description ?? params.exceptionDetails.text);
  }
});

let runOk = false, failReason = '';

try {
  if (boot?.navError) throw boot.navError;
  let ready = false;
  note('chrome up; waiting for __test.ready');
  // GH-248 / KF-008: the wait is a wall-clock bound (OB_PERF_READY_MS, default 15 min), not a poll count. 200 polls held only while
  // every poll waited behind a software-GL frame task; with main.js's software-GL GPU gate the main thread is free between frames,
  // polls answer in about 0.2 s, and 200 of them ran out at 222-357 s on the hosted VM, before a ~610 s ready (run 38849118495).
  const readyMs = Number(process.env.OB_PERF_READY_MS || 900000), readyT0 = Date.now();
  while (!ready && Date.now() - readyT0 < readyMs) { await sleep(200); ready = await chrome.eval('window.__test?.ready === true'); }
  if (!ready) throw new Error(`app never became ready (waited ${Math.round((Date.now() - readyT0) / 1000)} s; OB_PERF_READY_MS ${readyMs})`);
  boot?.ready();
  note('app ready; ua=' + await chrome.eval('navigator.userAgent'));
  const gpuNameEarly = await chrome.eval(`(() => {
    try {
      const gl = __dbg.renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL))
        : String(gl.getParameter(gl.RENDERER));
    } catch (e) { return 'unknown: ' + e; }
  })()`);
  note('webgl renderer: ' + gpuNameEarly);
  // Frame probes on a software rasterizer measure the rasterizer, not the
  // tree: budgets are advisory there by construction (see the gate below),
  // and on HeadlessChrome 152 + SwiftShader a single 22-ball frame costs
  // > 150 s, more than the CI job can hold. So the probes are SKIPPED on a
  // software GPU (recorded as such in the JSON); the structural asserts —
  // rerack, ball counts, zero console errors — still run and stay fatal.
  // OB_SOFTGPU_PROBES=1 forces the probes back on (local diagnosis).
  const SOFT_GPU = /swiftshader|llvmpipe|software|basic render/i.test(gpuNameEarly);
  const PROBE_SKIP = SOFT_GPU && process.env.OB_SOFTGPU_PROBES !== '1';
  // >>> GH-248 / KF-008 gate guard: main.js's software-GL GPU gate must be live wherever this tool sees a software GPU (the gate's
  // class is a superset of this one). A null or absent gate means the fix was lost silently, and the pile (and the 300 s stall)
  // would come back. ?obgpugate=0 turns the gate off on purpose (the measurement seam).
  const gpuGateAtReady = await chrome.eval(`(() => { const f = window.__test?.gpuGate; return typeof f === 'function' ? f() : 'absent'; })()`);
  note('gpu gate census at ready: ' + JSON.stringify(gpuGateAtReady));
  if (SOFT_GPU && (gpuGateAtReady === null || gpuGateAtReady === 'absent') && new URL(URL_).searchParams.get('obgpugate') !== '0') {
    throw new Error(`software GPU but the GPU gate is off (GH-248 / KF-008): __test.gpuGate() = ${JSON.stringify(gpuGateAtReady)}`);
  }
  // <<< GH-248 / KF-008 gate guard
  if (PROBE_SKIP) note('software rasterizer: frame probes SKIPPED (advisory on this GPU class; OB_SOFTGPU_PROBES=1 forces them)');
  await sleep(1500); // GI async load + shader warmup
  await chrome.eval(`__aim.setAssist(${JSON.stringify(ASSIST)})`);
  if (VIEW === 'aim') { await chrome.eval('__aim.setAimView(true)'); await sleep(600); }

  // scheduler-independent frame throughput: render N frames back-to-back in
  // manual mode, force a full pipeline sync, divide. ≈ max(CPU, GPU) ms/frame.
  // N is env-tunable (OB_PROBE_RENDERS): CI software rasterization makes 80
  // full-pipeline renders pathologically slow — a handful still smokes the
  // pipeline there while quiet-host runs keep the timer-resolution default.
  const PROBE_N = Math.max(1, Number(process.env.OB_PROBE_RENDERS || '80'));
  const gpuProbe = async (label = 'probe') => {
    if (PROBE_SKIP) { note(`gpuProbe ${label}: skipped (software GPU)`); return null; }
    note(`gpuProbe ${label}: start (1 + ${PROBE_N} renders)`);
    const ms = await gpuProbeEval();
    note(`gpuProbe ${label}: ${ms} ms/frame`);
    return ms;
  };
  const gpuProbeEval = () => chrome.eval(`(() => {
    const gl = __dbg.renderer.getContext();
    const px = new Uint8Array(4);
    __test.setManual(true);
    __test.renderAt(0);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const N = ${PROBE_N};
    const t0 = performance.now();
    for (let i = 0; i < N; i++) __test.renderAt(0);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const ms = (performance.now() - t0) / N;
    __test.setManual(false);
    return +ms.toFixed(3);
  })()`);
  if (!PROBE_SKIP) {
    note('single render: start');
    note('single render: ' + await chrome.eval(`(() => {
      const t0 = performance.now();
      __test.setManual(true); __test.renderAt(0); __test.setManual(false);
      return (performance.now() - t0).toFixed(1);
    })()`) + ' ms');
  }
  const frameMs = await gpuProbe('boot');
  if (process.argv.includes('--probe-only')) {
    // 5 repeats, min — robust to concurrent GPU load on the host
    const runs = [frameMs];
    for (let i = 0; i < 4; i++) { await sleep(300); runs.push(await gpuProbe()); }
    console.log(JSON.stringify({ label: LABEL, view: VIEW, w: W, h: H,
      frameThroughputMs: Math.min(...runs), runs }));
    await boot?.end(false);
    chrome.close(); await stopStaticServer(server);
    process.exit(0);
  }

  // ---- per-discipline LIVE frame gate (feature 012 T056; contracts/
  // render-capacity.md §7). Interleaved min-of-3 rounds over the pool
  // 16-ball, snooker 22-ball, and carom pocketless scenes; each scene must
  // hold the 60 fps frame budget (< 16.7 ms × OB_PERF_BUDGET_SCALE — CI
  // hosts rasterize in software and are not the reference laptop), project
  // the right ball count, and produce zero console errors. The strict
  // ≤ 1 ms pool-regression arm stays the quiet-host A/B protocol (two
  // --probe-only runs across code states, interleaved — see
  // the internal app-perf record); --regress-baseline <ms> mechanizes it
  // when a same-host --probe-only pin exists: pool min must stay within
  // +1 ms of the pin.
  if (process.argv.includes('--gate')) {
    const SCALE = Number(process.env.OB_PERF_BUDGET_SCALE || '1');
    const ROUNDS = Math.max(1, Number(process.env.OB_GATE_ROUNDS || '3'));
    const BASE = arg('regress-baseline', '');
    // Frame budgets are defined on real GPUs (constitution: 2020-class
    // laptop). On a software rasterizer (CI SwiftShader/llvmpipe) absolute
    // frame times are meaningless, so the budget arm downgrades to a
    // recorded advisory there — the structural asserts (rerack, ball
    // counts, zero console errors) stay fatal everywhere.
    const gpuName = await chrome.eval(`(() => {
      try {
        const gl = __dbg.renderer.getContext();
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL))
          : String(gl.getParameter(gl.RENDERER));
      } catch (e) { return 'unknown: ' + e; }
    })()`);
    const softGpu = /swiftshader|llvmpipe|software|basic render/i.test(gpuName);
    const scenes = [['pool', 'fifteen', 16], ['snooker', 'snooker', 22],
      ['carom', 'carom', 3]];
    // GH-425: the frame-budget legs (and the mechanized --regress-baseline
    // pin) are PACING arms — under a box storm they measure the machine,
    // not the tree. Canary: hold the rounds for a calm window (bounded,
    // lib/pacing.mjs knobs). The rounds still run after an exhausted wait —
    // the structural asserts (ball counts, console errors) are not pacing
    // arms and keep full coverage — but a blown budget bracketed by a storm
    // sample downgrades to an advisory with the SKIPPED-STORM citation (the
    // softGpu-advisory precedent), never a red filed against the tree and
    // never a silent green: the citation marks a run-gate-wrapped run
    // waived. min-of-N across interleaved rounds already dampens transient
    // hiccups, so the belt is a pre/post bracket, not a mid-round retry.
    const knobs = pacingKnobs();
    let preStorm = null;
    // the canary also runs on a software GPU when --regress-baseline is
    // present: the relative pin stays FATAL there, so it needs the same
    // pre-measurement storm bracket (review r2 P2); absolute budgets are
    // already advisory on softGpu and need no calm hold.
    // GH-691 (review r1 P2): a bar that is not in force — UNDERIVED, or a
    // derived bar from an UNRESTED / UNQUIET window — cannot be waited out;
    // it is the storm verdict itself, by name, exactly as guardPacingArm
    // decides it. The rounds still run for the structural asserts; a blown
    // frame budget is cited [SKIPPED-STORM], never failed, never banked.
    const bskip = knobs.guard && (!softGpu || BASE) ? baselineSkip(knobs, 'perf-aim --gate frame budget') : null;
    if (bskip) { console.log(bskip.line); preStorm = bskip.sample; }
    if (knobs.guard && (!softGpu || BASE) && !bskip) {
      const deadline = Date.now() + knobs.calmWaitMs;
      for (;;) {
        preStorm = await sampleStorm(chrome, knobs);
        if (!preStorm.stormy || Date.now() >= deadline) break;
        console.log(deferLine('perf-aim --gate frame budget', preStorm,
          deadline - Date.now()));
        await sleep(Math.min(knobs.retryDelayMs,
          Math.max(1, deadline - Date.now())));
      }
      if (preStorm.stormy) {
        console.log('[pacing-storm] calm window never arrived — the rounds '
          + 'still run for the structural asserts; a blown frame budget '
          + 'will be cited, not failed');
      }
    }
    const mins = {}, counts = {};
    for (let round = 0; round < ROUNDS; round++) {
      for (const [name, kind] of scenes) {
        const ok = await chrome.eval(`__test.rerackKind(${JSON.stringify(kind)}, 1)`);
        if (!ok) throw new Error(`rerackKind(${kind}) unavailable`);
        await sleep(700); // equipment broadcast + table rebuild settle
        counts[name] = await chrome.eval('__test.balls().length');
        const ms = await gpuProbe(name);
        mins[name] = ms == null ? null : Math.min(mins[name] ?? Infinity, ms);
      }
    }
    const failures = [], advisories = [];
    if (PROBE_SKIP) {
      advisories.push(`frame probes skipped on software GPU (${gpuName}); `
        + 'budgets are advisory on this GPU class and unmeasurable within '
        + 'the CI job budget');
    }
    const blown = scenes
      .filter(([name]) => mins[name] != null && !(mins[name] < 16.7 * SCALE))
      .map(([name]) => `${name}: frame ${mins[name]} ms >= ${16.7 * SCALE} ms`);
    const baseBlown = BASE && !PROBE_SKIP && !(mins.pool <= Number(BASE) + 1)
      ? `pool live regression: ${mins.pool} ms > pin ${BASE} + 1 ms` : null;
    // belt: a blown pacing metric bracketed by a storm sample is INFRA
    let storm = preStorm?.stormy ? preStorm : null;
    if (((blown.length && !softGpu) || baseBlown) && knobs.guard && !storm) {
      const post = await sampleStorm(chrome, knobs);
      if (post.stormy) storm = post;
    }
    for (const [name, , want] of scenes) {
      if (counts[name] !== want) {
        failures.push(`${name}: ${counts[name]} balls, want ${want}`);
      }
    }
    for (const line of blown) {
      if (softGpu) advisories.push(line);
      else if (storm) advisories.push(`${line} [SKIPPED-STORM GH-425]`);
      else failures.push(line);
    }
    // --regress-baseline is the SAME-HOST relative pin (the strict T056
    // arm): softGpu never downgrades it — absolute budgets are what is
    // meaningless on a software rasterizer, not a same-host comparison
    // (review GH-425 r1 P2). Only a storm bracket may reclassify it.
    if (baseBlown) {
      if (storm) advisories.push(`${baseBlown} [SKIPPED-STORM GH-425]`);
      else failures.push(baseBlown);
    }
    // storm can only be non-null under knobs.guard (sampling is guard-gated)
    const stormCited = storm
      ? [...(softGpu ? [] : blown), ...(baseBlown ? [baseBlown] : [])] : [];
    if (stormCited.length) {
      console.log(stormSkipLine('perf-aim --gate frame budget',
        stormCited.join('; '), [storm]));
    }
    if (consoleErrors.length) {
      failures.push(`console errors: ${consoleErrors.slice(0, 3).join(' | ')}`);
    }
    console.log(JSON.stringify({ gate: 'discipline-frames', w: W, h: H,
      ...(VIEWPORT ? { viewport: VIEWPORT, dpr: 3, mobile: true } : {}),
      gpu: gpuName, softGpu, scale: SCALE, rounds: ROUNDS,
      probeRenders: PROBE_N, probeSkipped: PROBE_SKIP, frameMinMs: mins, balls: counts,
      regressBaseline: BASE || null,
      // defensive: a GH-691 baseline SKIP is a synthetic sample (no probe)
      pacingStorm: storm ? { rttP50Ms: storm.rttP50 ?? null,
        loadNorm: Number.isFinite(storm.loadNorm) ? +storm.loadNorm.toFixed(2) : null,
        synthetic: storm.synthetic === true, baselineState: storm.baselineState ?? null,
        axes: storm.axes } : null,
      advisories, failures }));
    await boot?.end(failures.length > 0, failures.join(' | '));
    chrome.close(); await stopStaticServer(server);
    process.exit(failures.length ? 1 : 0);
  }

  // page-side collector: rAF deltas, phi per frame, preview identity churn
  await chrome.eval(`window.__perf = (() => {
    const rafDeltas = [], phis = [], longtasks = [], ghosts = [];
    let sims = 0, prevPv = null, on = false, last = performance.now();
    try { new PerformanceObserver((l) => { if (on) for (const e of l.getEntries()) longtasks.push(e.duration); })
      .observe({ entryTypes: ['longtask'] }); } catch {}
    const r0 = () => __test.renderTimes.length;
    let rStart = 0;
    function loop(now) {
      if (on) {
        rafDeltas.push(now - last);
        const pv = __aim.preview();
        if (pv !== prevPv) sims++;
        prevPv = pv;
        phis.push(__aim.getPhi());
        ghosts.push(pv && pv.ghost ? [pv.ghost.x, pv.ghost.y] : null);
      }
      last = now;
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
    return {
      start() { on = true; rStart = r0(); rafDeltas.length = phis.length = longtasks.length = ghosts.length = 0; sims = 0; },
      stop() { on = false; return { rafDeltas, phis, longtasks, ghosts, sims, renders: __test.renderTimes.slice(rStart) }; },
    };
  })(); true`);

  // cue-ball screen position (project through __dbg.camera)
  const cue = await chrome.eval(`(() => {
    const c = __dbg.camera; const p = __test.balls().find((b) => b.id === 0).pos;
    const e = c.matrixWorldInverse.elements, pr = c.projectionMatrix.elements;
    const vx = e[0]*p[0]+e[4]*p[1]+e[8]*p[2]+e[12], vy = e[1]*p[0]+e[5]*p[1]+e[9]*p[2]+e[13];
    const vz = e[2]*p[0]+e[6]*p[1]+e[10]*p[2]+e[14], vw = e[3]*p[0]+e[7]*p[1]+e[11]*p[2]+e[15];
    const cx = pr[0]*vx+pr[4]*vy+pr[8]*vz+pr[12]*vw, cy = pr[1]*vx+pr[5]*vy+pr[9]*vz+pr[13]*vw;
    const cw = pr[3]*vx+pr[7]*vy+pr[11]*vz+pr[15]*vw;
    return { x: (cx/cw*0.5+0.5)*innerWidth, y: (1-(cy/cw*0.5+0.5))*innerHeight };
  })()`);
  // sweep circle must stay inside the viewport at phone sizes (desktop:
  // min(170, 0.4*800) = 170, unchanged)
  const RADIUS = Math.min(170, Math.floor(Math.min(W, H) * 0.4));
  const pt = (ang) => ({ x: cue.x + RADIUS * Math.cos(ang), y: cue.y + RADIUS * Math.sin(ang) });
  const mouse = (type, x, y, extra = {}) => chrome.send('Input.dispatchMouseEvent',
    { type, x, y, button: 'left', buttons: type === 'mouseMoved' ? 1 : undefined,
      pointerType: 'mouse', clickCount: type.includes('Pressed') || type.includes('Released') ? 1 : 0, ...extra });

  // ---- drive: press, sweep TURNS full circles at RATE ev/s, release
  const durS = (TURNS * 2 * Math.PI) / 3.0; // sweep at 3 rad/s (fast aim drag)
  const nEv = Math.max(24, Math.round(durS * RATE));
  const a0 = -Math.PI / 2; // start above the ball
  async function runSweep(warm) {
    await chrome.eval('__perf.start(); true');
    await mouse('mousePressed', pt(a0).x, pt(a0).y);
    const t0 = Date.now();
    for (let i = 1; i <= nEv; i++) {
      const a = a0 + (TURNS * 2 * Math.PI * i) / nEv;
      await mouse('mouseMoved', pt(a).x, pt(a).y);
      const target = t0 + (i * 1000) / RATE;
      const lag = target - Date.now();
      if (lag > 1) await sleep(lag);
    }
    const out = await chrome.eval('__perf.stop()');
    await mouse('mouseReleased', pt(a0).x, pt(a0).y);
    return out;
  }
  await runSweep(true); // warmup pass (shader compiles, JIT)
  const sweep = await runSweep(false);

  // ---- hold the pointer still for 1.5 s (ghost stability window)
  await mouse('mousePressed', pt(a0).x, pt(a0).y);
  await mouse('mouseMoved', pt(a0 + 0.4).x, pt(a0 + 0.4).y);
  await chrome.eval('__perf.start(); true');
  await sleep(1500);
  const hold = await chrome.eval('__perf.stop()');
  await mouse('mouseReleased', pt(a0 + 0.4).x, pt(a0 + 0.4).y);

  const pvStats = await chrome.eval('__aim.previewStats ? __aim.previewStats() : null');
  const rep = report(LABEL, sweep, hold, nEv, durS, frameMs, pvStats);
  if (OUT) fs.writeFileSync(OUT, JSON.stringify(rep, null, 2) + '\n');
  if (consoleErrors.length) console.log('CONSOLE ERRORS:', consoleErrors.slice(0, 5));
  runOk = true;
} catch (e) {
  failReason = String(e?.message ?? e);
  throw e;
} finally {
  await boot?.end(!runOk, failReason);
  chrome.close();
  await stopStaticServer(server);
}

function pct(xs, p) {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}
function report(label, sweep, hold, nEv, durS, frameMs, pvStats) {
  const d = sweep.rafDeltas.slice(1); // first delta spans the idle gap
  const r = sweep.renders;
  const wrap = (x) => { while (x > Math.PI) x -= 2 * Math.PI; while (x < -Math.PI) x += 2 * Math.PI; return x; };
  let maxStep = 0, nans = 0, prev = null, i95 = [];
  for (const phi of sweep.phis) {
    if (!Number.isFinite(phi)) { nans++; continue; }
    if (prev !== null) { const s = Math.abs(wrap(phi - prev)); i95.push(s); maxStep = Math.max(maxStep, s); }
    prev = phi;
  }
  const gh = hold.ghosts.filter(Boolean);
  let ghostJitter = 0;
  for (let i = 1; i < gh.length; i++) {
    ghostJitter = Math.max(ghostJitter, Math.hypot(gh[i][0] - gh[i - 1][0], gh[i][1] - gh[i - 1][1]));
  }
  const rep = {
    label, events: nEv, sweepSeconds: +durS.toFixed(2),
    ...(VIEWPORT ? { viewport: VIEWPORT, dpr: 3, mobile: true } : {}),
    frameThroughputMs: frameMs,
    preview: pvStats ? { n: pvStats.count, avgMs: +pvStats.avgMs.toFixed(3),
      maxMs: +pvStats.maxMs.toFixed(2),
      simMs: +(pvStats.simMs / (pvStats.count || 1)).toFixed(3),
      parseMs: +(pvStats.parseMs / (pvStats.count || 1)).toFixed(3),
      samplerMs: +(pvStats.samplerMs / (pvStats.count || 1)).toFixed(3),
      avgKB: +(pvStats.bytes / (pvStats.count || 1) / 1024).toFixed(1) } : null,
    raf: { p50: +pct(d, 50).toFixed(2), p95: +pct(d, 95).toFixed(2),
      p99: +pct(d, 99).toFixed(2), max: +Math.max(...d).toFixed(2),
      over16_7: d.filter((x) => x > 16.7).length, over33: d.filter((x) => x > 33).length, frames: d.length },
    renderCpuMs: { p50: +pct(r, 50).toFixed(2), p95: +pct(r, 95).toFixed(2) },
    longtasks: { n: sweep.longtasks.length, totalMs: +sweep.longtasks.reduce((a, b) => a + b, 0).toFixed(0) },
    simsPerFrame: +(sweep.sims / Math.max(1, d.length)).toFixed(3),
    aim: { maxStepRad: +maxStep.toFixed(4), stepP95: +pct(i95, 95).toFixed(4), nan: nans,
      expectedStepAt60fps: +(3.0 / 60).toFixed(4) },
    holdGhostJitterM: +ghostJitter.toFixed(6),
  };
  console.log(JSON.stringify(rep, null, 1));
  return rep;
}
