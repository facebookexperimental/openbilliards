// Copyright (c) Meta Platforms, Inc. and affiliates.

// framestep.js — the ONE sub-frame/shutter timeline used by every offline
// renderer: the in-app exporter (web/app/offline-render.js) and the node
// pipeline (web/tools/record.mjs --framestep --shutter) MUST both derive
// their frame/sub-frame times here, so a browser export and a marketing
// render of the same shot step the exact same clock (determinism doctrine,
// issue #14; export ruling the video-export design note (internal)).
//
// Pure math, no DOM/three — importable from node and the browser alike.

export const FDT = 1 / 60; // output-frame time step (60 fps CFR convention)

// Settled-table hold appended after playback, in OUTPUT seconds — the ONE
// tail constant: record.mjs --tailsec default, the exporter's plan
// (offline-render.js), the picker's ETA math (export.js clipFrames) and
// the e2e's expected frame count (e2e-export.mjs) all read it here.
export const TAIL_SEC = 0.5;

/**
 * GH-489 #637 landing (ORDER-SNOOKER-637-LAND-16 Z2): the ONE un-padded
 * sink-completion time — the kernel record's `duration` extended to the end
 * of the LAST pocket drop the presentation still animates (sinkpivot.js
 * `pivot.tEnd`, measured from the capture time `s.t`). Pure: no pad of any
 * kind is added here. Every consumer adds ITS OWN tail exactly once:
 *   realtime settle (game.js:2330)  = max(duration + SETTLE_PAD, completion)
 *                                     (today's shape: the pad follows the
 *                                     RECORD end, never the completion)
 *   export plan (offline-render.js,
 *     export.js estimate)           = max(duration + cueTail, completion)
 *                                     with tailSec = TAIL_SEC (max, never sum)
 *   settle budget (main.js hook)    = the same max as game.js
 * `sinkEntries` is any iterable of sink-index entries ({ t, pivot: { tEnd } });
 * an entry whose pivot is null or whose leaf has no tEnd contributes 0 (the
 * game.js:2331 guard, verbatim) and never extends the record.
 */
export function sinkCompletionSec(duration, sinkEntries) {
  let end = Number.isFinite(duration) ? duration : 0;
  for (const s of sinkEntries ?? []) {
    // game.js:2331's guard verbatim (CORRIGENDUM-1 C2): a null pivot (game.js:1538) or a leaf without tEnd (the cache-poison
    // contract) contributes 0, never NaN — and a NaN term cannot win the comparison below, so the result is a finite number ≥ duration
    const e = Number.isFinite(s?.pivot?.tEnd) ? s.t + s.pivot.tEnd : 0;
    if (e > end) end = e;
  }
  return end;
}

/**
 * Quintic smootherstep S(x) = x³(6x² − 15x + 10) on [0, 1] — zero first AND
 * second derivative at both ends (C², minimum-jerk arrival). The ONE easing
 * law of the offline pipeline: logRemapFrames shapes its log2-rate ramps with
 * it, and the video pack's annotation text layer
 * (web/tools/scenario-textanim.mjs) eases its reveals with the same curve, so
 * motion and typography share one design language. Input is clamped.
 */
export function smootherstep(x) {
  const t = x < 0 ? 0 : x > 1 ? 1 : x;
  return t * t * t * (t * (6 * t - 15) + 10);
}

/**
 * Sub-frame times for ONE output frame in shutter-accumulation mode
 * (__test.renderAccum): the shutter opens AT the frame time `t` and spans
 * `shutterDeg/360` of the frame's kernel-time advance (`tRate`: 1 during
 * aim/stroke presentation, the slow-mo rate during playback — blur length
 * follows the ON-SCREEN speed, like broadcast slow-motion footage).
 *
 * Animation dts (stroke pose, camera-track damping run on frame-domain
 * time) sum to exactly FDT per output frame — the FIRST sub-frame carries
 * the closed-shutter remainder — so stroke length and frame counts match
 * the shutter-off path deterministically.
 *
 * Returns [{ t, dt }, …] of length `shutter` (shutter = 1 → single step,
 * equivalent to the plain renderAt path).
 */
export function shutterSubframes(t, { shutter = 1, shutterDeg = 310,
  tRate = 1, fdt = FDT } = {}) {
  const n = Math.max(1, Math.round(shutter));
  const sFrac = shutterDeg / 360;
  // NOTE the exact operation ORDER (shared subterm q first) — it is the
  // cinema wave's record.mjs calibration order, kept bit-identical so
  // browser exports and node renders step the very same float timeline.
  const q = (sFrac * fdt) / n;
  const subs = [];
  for (let i = 0; i < n; i++) {
    subs.push({
      t: t + i * q * tRate,
      dt: i === 0 ? fdt - (n - 1) * q : q,
    });
  }
  return subs;
}

/**
 * C² log-domain slow-mo time remap (scenario-render / validated-physics
 * video pack law). A playback plan is a list of rate segments
 * `[{ until, rate, cut? }]` in KERNEL time; a hard rate step at a segment
 * boundary reads as a speed jerk unless a camera cut lands there (the
 * hero-extend v3 postmortem, ≤ 1.35× cut-less step law). Cut-less
 * boundaries are therefore RAMPED in log2-rate:
 *
 *   - ramp duration D = clamp(perOctaveSec·|log2(r1/r0)|, minRampSec,
 *     maxRampSec) OUTPUT seconds (0.30 s per octave by default),
 *     quantized to whole output frames;
 *   - the log2 rate follows the quintic smootherstep
 *     S(x) = x³(6x² − 15x + 10) (zero 1st AND 2nd derivatives at both
 *     ends — the remap is C² in log-rate, so the on-screen speed has no
 *     visible acceleration kink);
 *   - per-frame kernel advance dt is integrated at the frame MIDPOINT
 *     (dt_j = fdt·2^(lerp(log2 r0, log2 r1, S((j+0.5)/n)))), and the ramp
 *     is scheduled as a LEAD-IN: it starts on the last steady frame from
 *     which its integrated kernel consumption still fits before the
 *     boundary, so the target rate is established AT OR BEFORE the
 *     boundary (impacts land fully inside their slow-mo rate; a segment
 *     too short to host its ramp starts it at entry and overshoots —
 *     the emitted clock is what the ≤ 1.35× scan and the window gates
 *     measure);
 *   - shutter windows must follow the integrated per-frame dt: feed
 *     `tRate = frame.dt / fdt` to shutterSubframes, never the nominal
 *     segment rate.
 *
 * Segments with `cut: true` take a HARD rate step at entry (the driver
 * places a camera cut on the same frame). Returns
 * `{ frames: [{ t, dt, rate, si }], maxCutlessStepRatio }` where `t` is
 * the kernel time at shutter open and `si` indexes the ACTIVE segment
 * (drivers watch `si` transitions to apply cuts). Pure math — importable
 * from node and the browser alike (determinism doctrine, issue #14:
 * frames are a pure function of the plan).
 */
export function logRemapFrames(segs, { startT = 0, perOctaveSec = 0.30,
  minRampSec = 0.5, maxRampSec = 1.5, fdt = FDT, tailSec = 0 } = {}) {
  for (const s of segs) {
    // a zero/negative/non-finite rate would freeze the clock and hang
    // the frame loop below forever — fail loudly at the plan boundary
    if (!Number.isFinite(s.rate) || s.rate <= 0) {
      throw new Error(`logRemapFrames: segment rate must be finite and > 0, `
        + `got ${s.rate}`);
    }
    if (!Number.isFinite(s.until)) {
      throw new Error(`logRemapFrames: segment until must be finite, `
        + `got ${s.until}`);
    }
  }
  // timing options hang the loops the same way (fdt 0 never advances,
  // tailSec Infinity never ends) — validate before looping
  if (!Number.isFinite(fdt) || fdt <= 0 || !Number.isFinite(startT)
    || !Number.isFinite(tailSec) || tailSec < 0
    || !Number.isFinite(perOctaveSec) || perOctaveSec < 0
    || !Number.isFinite(minRampSec) || minRampSec <= 0
    || !Number.isFinite(maxRampSec) || maxRampSec < minRampSec) {
    throw new Error('logRemapFrames: invalid timing options '
      + JSON.stringify({ fdt, startT, tailSec, perOctaveSec, minRampSec,
        maxRampSec }));
  }
  const S = smootherstep;
  const rampRates = (r0, r1) => {
    const la = Math.log2(r0), lb = Math.log2(r1);
    const D = Math.min(maxRampSec,
      Math.max(minRampSec, perOctaveSec * Math.abs(lb - la)));
    const n = Math.max(1, Math.round(D / fdt));
    const rates = [];
    for (let j = 0; j < n; j++) {
      rates.push(2 ** (la + (lb - la) * S((j + 0.5) / n)));
    }
    return rates;
  };
  const frames = [];
  let t = startT, si = 0;
  let ramp = null; // pending ramp: array of per-frame rates being consumed
  let rampK = 0;
  const kernelCost = (rates) => rates.reduce((a, r) => a + fdt * r, 0);
  while (si < segs.length) {
    const last = si === segs.length - 1;
    if (!ramp && !last && !segs[si + 1].cut
      && segs[si + 1].rate !== segs[si].rate) {
      const r = rampRates(segs[si].rate, segs[si + 1].rate);
      // lead-in law: start on the LAST steady frame from which the ramp's
      // integrated kernel consumption still completes by the boundary —
      // one more steady frame would push the ramp end past `until`
      // (review r2: the >= form started one frame late and overshot)
      if (t + fdt * segs[si].rate + kernelCost(r) > segs[si].until - 1e-12) {
        ramp = r; rampK = 0;
      }
    }
    let rate;
    if (ramp) {
      rate = ramp[rampK++];
      if (rampK >= ramp.length) { ramp = null; si++; }
    } else {
      rate = segs[si].rate;
    }
    frames.push({ t, dt: fdt * rate, rate, si });
    t += fdt * rate;
    if (!ramp && t >= segs[si].until - 1e-12) {
      si++; // hard boundary (cut, equal-rate, or final segment end)
    }
  }
  for (let k = 0; k < Math.round(tailSec / fdt); k++) {
    const rate = segs.at(-1).rate;
    frames.push({ t, dt: fdt * rate, rate, si: segs.length - 1 });
    t += fdt * rate;
  }
  // the ≤ 1.35× law, measured on the emitted clock: worst consecutive
  // per-frame kernel-advance ratio across CUT-LESS frame pairs
  let maxCutlessStepRatio = 1;
  for (let i = 0; i + 1 < frames.length; i++) {
    const a = frames[i], b = frames[i + 1];
    if (b.si !== a.si && segs[b.si]?.cut) continue;
    const ratio = Math.max(b.dt / a.dt, a.dt / b.dt);
    if (ratio > maxCutlessStepRatio) maxCutlessStepRatio = ratio;
  }
  return { frames, maxCutlessStepRatio };
}

/**
 * Playback frame plan (mirrors record.mjs framestepCapture semantics):
 * output frame k (0-based) renders kernel time startT + k·FDT·slowmo, for
 * ceil((endT − startT) / (FDT·slowmo)) frames, plus `tailSec` seconds of
 * tail frames whose clock KEEPS stepping (crossfade-over-motion / settled
 * hold), all capped at `maxSec` of output video.
 *
 * `headSec` (GH-363 pre-strike lead-in): round(headSec·60) HEAD frames are
 * PREPENDED before the play frames — fixed output frames at rate 1 exactly
 * like the tails (never montage-compressed; they count against `maxSec`
 * the same way). The renderer pins the ball clock at startSec across the
 * head window while the cue rides its own negative clock (the two-clock
 * split at the segment HEAD — the mirror image of the GH-299 beat tail).
 * timeAt(k) therefore clamps the play clock at startSec for k < headFrames:
 * play/tail frames keep the exact pre-363 mapping (shifted by headFrames),
 * and headSec = 0 is byte-identical to the pre-363 plan.
 */
export function planPlayback({ duration, slowmo = 1, startT = 0, endT = null,
  tailSec = 0, headSec = 0, maxSec = 60 } = {}) {
  const playSec = endT !== null ? Math.min(endT, duration) : duration;
  const startSec = Math.min(startT ?? 0, playSec);
  const headFrames = Math.max(0, Math.round(headSec * 60));
  let frames = Math.ceil((playSec - startSec) / (FDT * slowmo))
    + Math.round(tailSec * 60) + headFrames;
  frames = Math.max(0, Math.min(frames, Math.round(maxSec * 60)));
  return {
    frames,
    headFrames,
    startSec,
    playSec,
    /** kernel time of output frame k (head frames pin at startSec) */
    timeAt: (k) => startSec + Math.max(0, k - headFrames) * FDT * slowmo,
  };
}
