// Copyright (c) Meta Platforms, Inc. and affiliates.

// export.js — the "Export video…" dialog: quality tiers (ruled in
// the video-export design note (internal)) over the offline re-render engine
// (offline-render.js). Realtime tier = the existing MediaRecorder capture
// (record.js) replaying the shot live; every other tier re-renders the
// ShotRecord deterministically at OUTPUT resolution with the cinema knobs
// (shutter accumulation, SSAA, grade, DOF) and muxes WebCodecs output
// in-page. Feature-detected fallback chain: mp4 → webm → Realtime-only.
//
// Post-freeze module (record.js precedent): wired from main.js's startLoop,
// coordinates through the settings ctx + window.__test only.
import { detectExportSupport, runExport, CLIP_CAP_SEC } from './offline-render.js';
// NAMESPACE import beside the named one (rule-5 corollary): the seam's
// `camScriptCapable` key must reflect the ENGINE actually linked into this
// session — CAMSCRIPT_CAPABLE is a post-GH-275 name, and a named import of
// it would black-boot a returning user whose cache pairs this fresh module
// with a stale offline-render.js (the exact pairing the key exists to
// report). The namespace resolves on ANY pairing; the missing name simply
// reads undefined there. Do NOT convert to a named import.
import * as offRender from './offline-render.js';
import { TAIL_SEC, planPlayback } from './framestep.js';
import * as framestepNs from './framestep.js'; // LAND-17 BC: the new name through a namespace binding (boot-cache rule, the ownership ledger:42-53)
import { applyDom, onLocaleChange, t } from './i18n.js';

// ---- scripted-boot container pin (GH-256) -----------------------------------
// ?exportformat=webm|mp4 — the iOS sim acceptance harness taps the REAL
// Export CTA, so its container choice must ride the app's own negotiation
// (driver bootQuery → -OBBootQuery → GameViewController.bootURL →
// location.search). The pin RE-RANKS formatFor()'s ruled fallback chain: a
// pinned container wins only when its own support probe passed at that
// height — it NEVER fabricates support (an unsupported pin leaves the
// unpinned chain in charge, honest null included). Exists because the iOS
// sim's VideoToolbox mp4 probe lies (GH-258: avc High/Main accept configure
// yet emit 0 chunks ever; VP9/webm encodes green). Scripted boots only —
// production URLs never carry it.
const FORMAT_PIN =
  /[?&]exportformat=(webm|mp4)(?:[&#]|$)/.exec(window.location.search)?.[1]
  ?? null;

// ---- tiers (RULING table; knob names = record.mjs cinema flags) -------------
// { ssaa, shutter, shutterdeg, grade, dof } are the exact record.mjs knob
// names so the node pipeline and this picker can share a preset file.
// Display name/description live in the locale dictionaries as
// export.tier.<key>.{name,desc} — rendered via t() in the dialog rows.
//
// GH-329 (WYSIWYG exposure law): every in-app tier ships grade: 0. The
// film grade (tools/render/grade.json — the curve measured against reference footage for the
// node marketing replica, record.mjs --grade) rode every offline tier here
// and darkened delivered clips ~21-24% against the live player bed (journey
// QA; pixel-truth probe: graded/live luma fit 0.736x + 2.5, while the encode
// legs and color tags were CLEAN — decoded mp4/webm = pre-encode frame
// ±1 LSB, tagged tv/bt709 both containers). The realtime tier records the
// live canvas and never graded, so the dialog's own tiers disagreed with
// each other by the same margin. Deliveries must match the live view; the
// grade stays a spec knob in offline-render.js (single-sourced math with
// grade.json) and the node pipeline keeps its ffmpeg chain — only the
// in-app tier table stops requesting it. Never re-add a compensating gain
// here: exports render the live look or a bug is hiding upstream.
export const EXPORT_TIERS = {
  realtime: {
    offline: false,
  },
  standard: {
    offline: true,
    ssaa: 1, shutter: 1, shutterdeg: 310, grade: 0, dof: 0,
    resolutions: [[1280, 720], [1920, 1080]], defaultRes: [1920, 1080],
  },
  high: {
    offline: true,
    ssaa: 1.5, shutter: 8, shutterdeg: 310, grade: 0, dof: 0.012,
    resolutions: [[1280, 720], [1920, 1080]], defaultRes: [1920, 1080],
  },
  cinematic: {
    offline: true,
    // showcase preset (issue GH-259): the ruled offline knobs pushed to the
    // in-app ceiling — 2× SSAA at ≤1080p output. ssaa2@1080p renders
    // 3840×2160 ≈ the 4K chain + the 133 MB rgba32f accumulator, inside
    // the ruled 710 MB in-app envelope (the video-export design note (internal)); the
    // [720,1080]-only resolutions list IS the "no SSAA at 4K" enforcement
    // (SSAA above 1080p output stays node-pipeline-only). Grade: 0 since
    // GH-329 (WYSIWYG law, header note) — the showcase look this tier
    // keeps is supersample + shutter accumulation; the offline film grade is
    // node-pipeline-only (record.mjs --grade).
    // `mobile` is an ADDITIVE per-device knob override, resolved through
    // effectiveKnobs() below (the node pipeline ignores unknown preset
    // keys; pre-GH-259 tiers carry no `mobile` and resolve unchanged).
    //
    // dof: 0 (owner-caught A/B defect, 2026-07): the design-time dof 0.012
    // (a ~12 mm aperture focused on the cue ball) blanketed STATIC frames —
    // everything off the cue-ball focal plane (rack, rails, most of the
    // frame) rendered ~4-5× softer than the DEFAULT tier (frame-20
    // Laplacian-variance center ratio 0.21-0.28), defeating the 2× SSAA
    // this tier exists for. The owner-approved showcase look (the
    // 008/scenario pipeline) is supersample + shutter accumulation + grade
    // with NO DOF anywhere — the tier now matches it. Blur stays confined
    // to MOVING objects (shutter). The DOF plumbing itself (renderAccum
    // opts.dof / record.mjs --dof) remains available but UNTUNED /
    // experimental — node-pipeline-only until someone rules a focal model.
    ssaa: 2, shutter: 8, shutterdeg: 310, grade: 0, dof: 0,
    resolutions: [[1280, 720], [1920, 1080]], defaultRes: [1920, 1080],
    mobile: { ssaa: 1, shutter: 4 },
  },
  ultra4k: {
    offline: true,
    // shutter 8 (was 4): 4 subframes render fast balls as 3-4 discrete
    // ghost exposures — legible at 4K, overt at break speeds. 8 matches
    // High's smooth smear; the ETA model keeps displayed ETAs honest.
    ssaa: 1, shutter: 8, shutterdeg: 310, grade: 0, dof: 0.012,
    resolutions: [[2560, 1440], [3840, 2160]], defaultRes: [3840, 2160],
  },
  cinema4k: {
    offline: true,
    ssaa: 1, shutter: 16, shutterdeg: 310, grade: 0, dof: 0.012,
    resolutions: [[3840, 2160]], defaultRes: [3840, 2160],
  },
};
const BITRATES = { 720: 8e6, 1080: 12e6, 1440: 24e6, 2160: 40e6 };
export const bitrateFor = (h) => BITRATES[h] ?? Math.round(12e6 * (h / 1080) ** 2);

/** Device-resolved knobs for a tier (issue GH-259): coarse-pointer devices
 * (the main.js touch-install matchMedia precedent) take the tier's
 * `mobile` knob override, so a phone RENDER and a phone ETA always price
 * the same knobs — every consumer (runOffline, drillRender, estimateDrill,
 * the dialog ETA rows) resolves through this ONE function. Tiers without a
 * `mobile` key return their exact tier object (identity — provably
 * unchanged for every pre-GH-259 tier and for fine-pointer devices). */
export function effectiveKnobs(tier) {
  if (!tier?.mobile) return tier;
  return window.matchMedia?.('(pointer: coarse)').matches
    ? { ...tier, ...tier.mobile } : tier;
}

// ---- ETA model (bench matrix, the video-export design note (internal)) -------------------
// ms/output-frame ≈ shutter × slope(Mpx) + intercept(Mpx) + 1 ms grab; the
// slope/intercept pairs are least-squares fits of the measured s1/s16 rows,
// interpolated linearly in RENDERED megapixels (sound above 1080p per the
// bench; conservative below it).
const BENCH = [ // [Mpx, slope ms/subframe, intercept ms]
  [0.92, 1.13, 1.30], [2.07, 2.00, 1.28], [3.69, 3.27, 1.75], [8.29, 6.92, 1.90],
];
export function modelMsPerFrame({ shutter = 1, ssaa = 1 }, w, h) {
  const mpx = (w * ssaa) * (h * ssaa) / 1e6;
  let lo = BENCH[0], hi = BENCH[BENCH.length - 1];
  for (let i = 0; i < BENCH.length - 1; i++) {
    if (mpx >= BENCH[i][0]) { lo = BENCH[i]; hi = BENCH[i + 1]; }
  }
  const u = Math.min(2, Math.max(0, (mpx - lo[0]) / (hi[0] - lo[0])));
  const slope = lo[1] + u * (hi[1] - lo[1]);
  const intercept = lo[2] + u * (hi[2] - lo[2]);
  return shutter * slope + intercept + 1;
}

/** 10-frame render probe at dialog-open: measures THIS machine against the
 * bench model at the current canvas size (1-px readPixels per frame = the
 * same GPU sync the bench paid). Returns the machine factor (≥, clamped). */
export function probeMachineFactor({ renderer, game }) {
  const gl = renderer.getContext();
  const px = new Uint8Array(4);
  const t = Math.min(game.clock ?? 0, game.duration ?? 0);
  window.__test.renderAt(t); // warm-up (also flips manual mode on)
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const t0 = performance.now();
  for (let i = 0; i < 10; i++) {
    window.__test.renderAt(t);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  }
  const measured = (performance.now() - t0) / 10;
  window.__test.setManual(false); // re-arm the RAF loop
  const size = renderer.getSize({ set(w, h) { this.x = w; this.y = h; return this; } });
  const predicted = modelMsPerFrame({ shutter: 1, ssaa: 1 }, size.x, size.y) - 1;
  return Math.min(8, Math.max(0.5, measured / Math.max(predicted, 0.1)));
}

const fmtEta = (sec) => (sec < 90
  ? t('export.etaSec', { s: Math.max(1, Math.round(sec)) })
  : t('export.etaMin', { m: Math.floor(sec / 60), s: Math.round(sec % 60) }));
const fmtMB = (bytes) => `${(bytes / 1e6).toFixed(bytes < 3e6 ? 1 : 0)} MB`;

export function createExport(env) {
  const { game, machine } = env;
  let support = null;   // detectExportSupport() result (probed at open)
  let factor = 3;       // machine factor (3× safety until the probe runs)
  let controller = null; // AbortController while exporting
  let uiState = 'idle'; // idle | open | exporting | done | cancelled | error
  let lastResult = null;

  // ---- GH-362 layer 1: the export keep-awake latch ---------------------------
  // Long offline exports died when the phone LOCKED mid-render (the
  // build-16 owner report) — the shell now holds
  // UIApplication.isIdleTimerDisabled while an export runs, page-driven
  // over the obKeepAwake bridge (ShellCore/KeepAwakeMessage; the
  // documentStart `window.__obKeepAwake = { v: 1 }` hint gates the posts,
  // so a stale shell never receives one — the recorded degrade is exactly
  // the pre-GH-362 behavior). ONE refcounted owner: every export entry
  // (dialog start(), the drill/full-stream drillRender) takes a hold at
  // start and releases it in its OWN finally, so EVERY terminal path —
  // done, cancel, failure, throw — clears it (the e2e keep-awake arm
  // red-proofs each), and overlapping runs cannot clear each other's.
  // A count, not a boolean: hdBusy and uiState already refuse most
  // overlap, but the latch must be correct independently of that.
  let wakeHeld = 0;
  let wakeOn = false;
  function keepAwake(on) {
    wakeHeld = Math.max(0, wakeHeld + (on ? 1 : -1));
    const want = wakeHeld > 0;
    if (want === wakeOn) return;
    if (window.__obKeepAwake?.v !== 1) return; // no shell latch — no post
    const bridge = window.webkit?.messageHandlers?.obKeepAwake;
    if (typeof bridge?.postMessage !== 'function') return;
    wakeOn = want;
    try { bridge.postMessage({ v: 1, on: want }); } catch { /* a throwing
      bridge drops the latch — the shell's reload reset() is the net */ }
  }

  // UI kit (006-ui-modernization): DYNAMIC import + try/catch per the
  // cache-poison contract (contracts/ui-kit.md) — a stale/missing kit module
  // degrades to the native-styled dialog, never a broken open(). Do NOT
  // convert to a static import. motion helpers are only invoked from event
  // handlers / open() (post-boot), so the motion import stays lazy.
  let kit = null; // { motion, select, controls, dialog } once loaded
  const kitReady = Promise.all([
    import('./ui/motion.js'), import('./ui/select.js'),
    import('./ui/controls.js'), import('./ui/dialog.js'),
  ]).then(([motion, select, controls, dialog]) => {
    kit = { motion, select, controls, dialog };
  }).catch((e) => {
    console.warn('[export] ui kit unavailable — native-styled dialog:', e);
  });

  // ---- cinematic capability gate (issue GH-259) -------------------------------
  // The 2× SSAA + shutter accumulator blends into an rgba32f render target,
  // which needs WebGL2 + EXT_color_buffer_float + EXT_float_blend. Older
  // Android Mali/Adreno lack float blend and fail as BLACK frames with no
  // error — so the gate decides the OFFER (tiers()/dialog row), never the
  // render. Synchronous + cached (renderer.extensions memoizes, and
  // extensions.has() probes without the console warning get() carries).
  // Existing tiers keep their current UNGATED behavior on purpose: this
  // wave must not perturb what already ships (see the GH-259 design risks).
  let cineOk = null;
  function cinematicOk() {
    if (cineOk === null) {
      try {
        const r = env.renderer;
        cineOk = r?.capabilities?.isWebGL2 === true
          && r.extensions?.has('EXT_color_buffer_float') === true
          && r.extensions?.has('EXT_float_blend') === true;
      } catch { cineOk = false; }
    }
    return cineOk;
  }

  /** container for a tier at output height, per the ruled fallback chain
   * (null = tier unavailable on this browser). */
  function formatFor(tier, h) {
    // realtime rides record.js's NEGOTIATED container (webm on Chrome-
    // family, mp4 on WebKit — issue #51); ext falls back for stale graphs
    if (!tier.offline) {
      return window.__record?.supported ? (window.__record.ext ?? 'webm') : null;
    }
    if (!support?.webcodecs) return null;
    const mp4 = !!(support.mp4 && (h <= 1080 || support.uhd));
    // webm fallback: >1080p needs the dedicated 4K VP9 probe (webmUhd) —
    // never offer a tier at a resolution no encoder config was probed at
    const webm = !!(support.webm && (h <= 1080 || support.webmUhd));
    // FORMAT_PIN re-rank (GH-256): the pinned container must still pass its
    // OWN probe above — an unsupported pin falls through to the ruled chain
    if (FORMAT_PIN === 'webm' && webm) return 'webm';
    if (FORMAT_PIN === 'mp4' && mp4) return 'mp4';
    return mp4 ? 'mp4' : webm ? 'webm' : null;
  }

  // frame count for the ETA/size estimates — the EXACT plan the export
  // will run (framestep.js planPlayback, single source; no re-derivation)
  function clipFrames(slowmo) {
    if (!game.sampler) return 0;
    // design 277 slice 3 PR-2 (review r2 P2): the estimate prices the SAME
    // tail-extended duration runExport plans — cueTailForEstimate never
    // disturbs a standing arm (reads the plan when armed, probes when
    // not); a stale offline-render.js lacks the export and the estimate
    // keeps the pre-PR-2 duration, matching what that renderer would ship.
    const cueTail = offRender.cueTailForEstimate?.(game.record, game.duration)
      ?? 0;
    // GH-489 #637 LAND-16 Z2: the estimate mirrors runExport's plan — the
    // cue-tail-extended duration OR the last pocket drop's completion,
    // whichever is later (framestep.js sinkCompletionSec; max, never sum)
    const planDuration = Math.max(game.duration + cueTail,
      // LAND-18 X1: the lazy index through the accessor (a quiet load nulls the raw Map)
      framestepNs.sinkCompletionSec?.(game.duration, game.sinkEntries?.() ?? []) ?? game.duration); // degrade: the pre-LAND-16 plan
    return planPlayback({ duration: planDuration, slowmo,
      tailSec: TAIL_SEC, maxSec: CLIP_CAP_SEC }).frames;
  }

  function etaSeconds(key, [w, h], slowmo) {
    const tier = EXPORT_TIERS[key];
    if (!tier.offline) return game.duration + 1; // wall-clock live capture
    // effectiveKnobs (GH-259): the displayed ETA prices the DEVICE-resolved
    // knobs — the exact spec runOffline will render (never a desktop
    // number quoted on a phone)
    return clipFrames(slowmo)
      * modelMsPerFrame(effectiveKnobs(tier), w, h) * factor / 1000;
  }

  function sizeEstimate(key, [, h], slowmo) {
    const sec = clipFrames(slowmo) / 60;
    return (EXPORT_TIERS[key].offline ? bitrateFor(h) : 8e6) * sec / 8 + 160e3;
  }

  // ---- offline + realtime runs ---------------------------------------------
  async function runOffline(key, overrides) {
    const tier = EXPORT_TIERS[key];
    // gate honesty (GH-259): the offer is already withheld (tiers()/dialog);
    // a seam caller on a gated GPU gets a thrown reason, never black frames
    if (key === 'cinematic' && !cinematicOk()) {
      throw new Error('cinematic tier needs float blending '
        + '(WebGL2 + EXT_color_buffer_float + EXT_float_blend)');
    }
    // design 277 slice 3 PR-2 (review r8 P1, the cinelight honesty shape):
    // fresh app code over a CACHED pre-PR-2 offline-render.js would export
    // the current shot CUE-LESS while the live table shows the post-strike
    // cue — refuse with the reload error instead. Gated on the live cue
    // feature actually being present+enabled (a wholly pre-277 cache pair
    // keeps exporting — consistent cue-less on both surfaces); slight
    // over-refusal for records the engine would individually refuse is
    // the accepted mixed-cache cost (a reload heals it).
    if (offRender.CUEPOST_TAIL_CAPABLE !== true
      && typeof window.__test?.cuePost === 'function'
      && window.__test?.cuePostLive?.state?.()?.enabled !== false) {
      throw new Error('cue rendering unavailable '
        + '(stale offline-render.js) — reload the app');
    }
    if (overrides.cinelight) {
      // review r2 P1: a FRESH export.js over a CACHED pre-GH-259
      // offline-render.js would silently drop spec.cinelight and deliver
      // plain cinematic while promising studio lighting — feature-detect
      // the engine's ADDITIVE capability marker (already-linked namespace;
      // rule-5 corollary) and refuse honestly instead
      const m = await import('./offline-render.js');
      if (m.CINELIGHT_CAPABLE !== true) {
        throw new Error('studio lighting unavailable '
          + '(stale offline-render.js) — reload the app');
      }
    }
    const kn = effectiveKnobs(tier); // GH-259: device-resolved knobs
    const [dw, dh] = resSelect() ?? tier.defaultRes;
    const width = overrides.width ?? dw, height = overrides.height ?? dh;
    // review r2 P2 (the 710 MB ruling at the ENTRY point, not just the UI
    // list): a cinematic request above 1080p output would allocate the
    // ssaa2 chain at up to 7680×4320 — refuse it everywhere, seam included
    if (key === 'cinematic' && (height > 1080 || width > 1920)) {
      throw new Error('cinematic renders at 1080p or below — SSAA above '
        + '1080p output is node-pipeline-only (the 710 MB ruling)');
    }
    const slowmo = overrides.slowmo ?? slowmoSelect();
    const format = overrides.format ?? formatFor(tier, height);
    if (!format) throw new Error('no supported encoder for this tier');
    const spec = { ssaa: kn.ssaa, shutter: kn.shutter,
      shutterdeg: kn.shutterdeg, grade: kn.grade, dof: kn.dof,
      width, height, bitrate: bitrateFor(height), format, slowmo,
      withAudio: overrides.withAudio ?? audioToggle(),
      hashFrames: overrides.hashFrames ?? false,
      // GH-259 studio-lighting variant: seam-reachable ONLY (overrides via
      // __export.start('cinematic', { cinelight: true }) for e2e/captures
      // + the playback quality picker's third option) — no dialog control
      // in v1, OFF by default everywhere
      cinelight: overrides.cinelight ?? false };
    controller = new AbortController();
    const t0 = performance.now();
    const res = await runExport(env, spec, {
      signal: controller.signal,
      onProgress: (done, total, ema) => setProgress(done, total, ema),
      // GH-362: the backgrounded render PARKS — say so instead of a stuck
      // bar (the next onProgress after resume repaints the live line).
      // Stale-dictionary fallback (review r8 P2, the encoderFailure
      // precedent): a fresh module over cached pre-362 locale JSON must
      // paint readable English, never the bare key.
      onPause: (p) => {
        if (!p || !modal) return;
        const m = t('export.paused');
        q('ob-x-ptext').textContent = m === 'export.paused'
          ? 'paused (app in background) — resumes automatically' : m;
      },
    });
    lastResult = { tier: key, size: res.bytes.length, frames: res.frames,
      clipSec: res.clipSec, ext: res.ext, hashes: res.hashes,
      wallSec: (performance.now() - t0) / 1000, width, height };
    if (overrides.keepBytes) { // e2e: ship the container bytes to node
      let b64 = '';
      for (let i = 0; i < res.bytes.length; i += 0x8000) {
        b64 += String.fromCharCode(...res.bytes.subarray(i, i + 0x8000));
      }
      lastResult.b64 = btoa(b64);
    }
    if (!overrides.noDownload) {
      deliverFile(new Blob([res.bytes],
        { type: res.ext === 'mp4' ? 'video/mp4' : 'video/webm' }), key, res.ext);
    }
    return lastResult;
  }

  async function runRealtime(overrides) {
    if (!window.__record?.supported) throw new Error('MediaRecorder unavailable');
    if (!game.sampler) { // GH-1024: localized (stale-dictionary fallback)
      const m = t('export.playFirst');
      throw new Error(m === 'export.playFirst' ? 'no shot to export yet' : m);
    }
    // GH-335: a capture STARTED hidden would stall before frame one — the
    // same honest refusal as the mid-capture onHide below, before the
    // recorder (or the listener that would need unwinding) ever spins up
    if (document.hidden) throw new Error(t('export.hiddenStopped'));
    // same `controller` slot as runOffline: cancel()/close() abort BOTH paths
    controller = new AbortController();
    const { signal } = controller;
    const unsubs = [];
    const settled = new Promise((resolve, reject) => {
      unsubs.push(machine.on('shotComplete', resolve));
      // live progress: the replay clock drives the bar (offline tiers get
      // per-frame progress; realtime tracks the playback wall-clock instead)
      unsubs.push(machine.on('frame', (tClock) => {
        if (machine.state !== 'PLAYBACK' || !(game.duration > 0)) return;
        const done = Math.min(tClock, game.duration);
        setProgress(done, game.duration, 0,
          t('export.recordingPct', { pct: Math.round(100 * done / game.duration) }));
      }));
      signal.addEventListener('abort', () =>
        reject(new DOMException('export cancelled', 'AbortError')));
      // GH-335 fail-fast on backgrounding (the DVR startRealtime onHide law,
      // playback.js / the ownership ledger GH-250 P1): the replay rides the app rAF
      // loop, which browsers SUSPEND for hidden documents — shotComplete
      // then never fires, the dialog is un-dismissable (dismissable() pins
      // on 'exporting') and MediaRecorder keeps eating wall clock into a
      // silently stalled file. record.js genuinely supports pause()/
      // resume(), but pause-with-notice is dishonest here: the rAF freeze
      // and a recorder pause straddle the hide by a seam of unprovable
      // length, and a hidden tab cannot paint the notice anyway. So the run
      // ENDS NOW — non-Abort rejection → the catch below stops the recorder
      // delivering NOTHING → start() paints the honest localized message.
      const onHide = () => {
        if (document.hidden) reject(new Error(t('export.hiddenStopped')));
      };
      document.addEventListener('visibilitychange', onHide);
      unsubs.push(() => document.removeEventListener('visibilitychange', onHide));
    });
    const withAudio = overrides.withAudio ?? audioToggle();
    // review r1 P2 (GH-335): the unsubs teardown must cover the START
    // refusal too — a throw between the listener registrations above and
    // the old inner try leaked the visibilitychange listener (accumulating
    // per retry) and left `settled` armed to reject unobserved on a later
    // backgrounding.
    try {
      if (!window.__record.start(withAudio)) throw new Error('recorder already running');
      if (withAudio && window.__record.audioTracks() === 0 && modal) {
        q('ob-x-note').textContent = t('export.audioUnavailable');
      }
      setProgress(0, 1, 0, t('export.recording'));
      game.replay();
      try {
        await settled;
      } catch (e) {
        window.__record.stop(false); // kill the recorder, download NOTHING
        throw e;                     // AbortError → start() → 'cancelled'
      }
    } finally {
      unsubs.forEach((un) => un());
    }
    // The photos opt-out hint rides every stop (issue GH-139 recorded
    // scope, photos-bridge.md §1): the export dialog's downloads KEEP the
    // obShare share sheet (its sheet already offers Save Video); ONLY the
    // record-control flow routes obPhotos. Without the hint a shell
    // realtime export would land in Photos with its result banner hidden
    // under this modal's z-60 backdrop.
    // GH-1125: record.js finalizes in its async onstop, where an EMPTY
    // capture (MediaRecorder delivered no data — seen under heavy load)
    // skips delivery without a word, and this tier returned 'done' as soon
    // as stop() said true. With the lastRecording + deliver seams THIS
    // module hands the file over, and only once it is verified non-empty —
    // the DVR startRealtime law (playback.js): stop(false), wait for THIS
    // stop's blob (identity against the one before; bounded 60 s, a big
    // capture can finalize for many seconds), then deliver. An empty or
    // missing blob fails through start()'s export.failed paint with the
    // DVR's own message, and a capture landing after the deadline can never
    // download behind that failure. A stale record.js keeps its own
    // delivery and the old return.
    const rec = window.__record;
    const verify = typeof rec.lastRecording === 'function' && typeof rec.deliver === 'function';
    const before = verify ? rec.lastRecording() : null; // identity: onstop is ASYNC
    if (!rec.stop(verify ? false : !overrides.noDownload, { photos: false })) {
      // an already-inactive recorder (encoder error, ended track) finalizes
      // NOTHING — reporting success here sold a no-file run as done (review
      // round-11 P2); the throw lands in start()'s export.failed paint
      throw new Error('recorder stop failed — no file was finalized');
    }
    if (verify) {
      // the recorder is stopped and the file is still assembling — the
      // settle-lock (the DVR card's review round-2 P1 law, the ownership ledger): the
      // dialog cannot be dismissed (Close disabled, close() refuses) and
      // Cancel hides, since neither can stop anything now; no second run
      // starts mid-poll, and with the modal up no DVR capture can either
      finalizing = true;
      if (modal) { q('ob-x-cancel').style.display = 'none'; q('ob-x-close').disabled = true; }
      let blob = null;
      let superseded = false;
      try {
        for (let i = 0; i < 600 && !blob; i++) {
          const b = rec.lastRecording();
          if (b && b !== before) { blob = b; break; }
          // a capture another owner started (record.js's stopGen) or a
          // release SUPERSEDED this finalize: its blob can no longer land,
          // and whatever lands from here on is theirs — never this export's
          if (rec.recording() || (before && b === null)) { superseded = true; break; }
          await new Promise((r) => { setTimeout(r, 100); });
        }
      } finally {
        finalizing = false;
        if (modal) q('ob-x-close').disabled = false;
      }
      if (superseded || !(blob?.size > 0)) {
        // a capture that missed the deadline is SUPERSEDED (the DVR's law)
        // so a late-landing blob is never pinned behind a failed export
        if (!blob && !superseded) { try { rec.releaseRecording?.(); } catch { /* stale seam */ } }
        const m = t('playback.realtimeNoFile');
        throw new Error(m === 'playback.realtimeNoFile' ? 'live capture produced no file' : m);
      }
      if (!overrides.noDownload) {
        // record.js's own ladder and file name — WITH the photos opt-out on
        // THIS call too: a cached GH-250 record.js's deliver() still
        // defaults to obPhotos (the ownership ledger's routing contract)
        rec.deliver(blob, `openbilliards-${new Date().toISOString()
          .slice(0, 19).replace(/[T:]/g, '-')}.${rec.ext ?? 'webm'}`, { photos: false });
      }
    }
    lastResult = { tier: 'realtime', size: -1, frames: -1,
      ext: window.__record.ext ?? 'webm', // the negotiated container (#51)
      clipSec: game.duration, hashes: null };
    return lastResult;
  }

  /** Shell share-sheet handoff (obShare bridge, issue #51) — record.js
   * carries the same MODULE-PRIVATE helper: a shared export would add a new
   * named import edge between boot-graph modules (the ownership ledger rule 5
   * corollary), so each file keeps its own copy. */
  // ShareMessage.maxBytes mirror (share-bridge.md §3) — the native gate
  // silently drops anything bigger, so the page pre-flights BEFORE the
  // main-thread FileReader read + base64 encode (issue #51 review F1).
  const SHARE_MAX_BYTES = 384 * 1024 * 1024;
  function shellShareFile(blob, name) {
    const bridge = window.webkit?.messageHandlers?.obShare;
    if (!bridge) return false;
    if (blob.size > SHARE_MAX_BYTES) {
      // Oversize: never post (the bridge would drop it silently after a
      // hundreds-of-MB read+encode). The bridge existing means we are in
      // the iOS shell, where the anchor path is dead (no download
      // delegate) — so surface the existing visible failure state
      // (export.failed via start()'s catch → setUiState('error')).
      throw new Error(`file too large for the share bridge `
        + `(${(blob.size / 1e6).toFixed(0)} MB > `
        + `${(SHARE_MAX_BYTES / 1e6).toFixed(0)} MB cap)`);
    }
    const r = new FileReader();
    r.onload = () => {
      try {
        const b64 = String(r.result).split(',')[1] ?? '';
        bridge.postMessage({ v: 1, name, mime: blob.type, b64 });
      } catch { /* a throwing bridge drops the handoff */ }
    };
    r.onerror = () => {
    // blob read failed inside the shell: fall back to the anchor path so
    // the handoff never silently drops (review 2026-07)
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  };
  r.readAsDataURL(blob);
    return true;
  }

  const fileName = (key, ext) => `openbilliards-${key}-${new Date()
    .toISOString().slice(0, 19).replace(/[T:]/g, '-')}.${ext}`;

  function download(blob, key, ext) {
    const name = fileName(key, ext);
    if (shellShareFile(blob, name)) return; // shell: native share sheet
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  }

  // ---- GH-991: the save sheet's OUTCOME on the macOS wrapper ----------------
  // The wrapper registers no obShare, so download() fell to the anchor →
  // WKDownload route, whose Cancel is silent by its route law (no page
  // signal, no file) — the dialog painted "done" before the sheet even
  // answered and a Cancel threw the finished render away. The wrapper's
  // obSaveVideoStream bridge (GH-225/256 — the playback card's Files tile)
  // runs the SAME NSSavePanel leg and reports EVERY outcome through ONE
  // 'ob:save-video-result' ({ ok, name, dest, error } — 'cancelled' on a
  // closed sheet). Taken only where it is the honest route: no obShare
  // (iOS keeps its share sheet) + a chunked bridge whose capability hint
  // lists the 'files' dest. The bytes stay in `saveAttempt` until the
  // result lands, so a Cancel offers "Save again" over the SAME render.
  const SAVE_CHUNK_BYTES = 768 * 1024; // playback.js CHUNK_BYTES mirror
  function shellSaveBridge() {
    const wk = window.webkit?.messageHandlers;
    if (!wk || wk.obShare) return null;
    const b = wk.obSaveVideoStream;
    const h = window.__obSaveVideo;
    if (typeof b?.postMessage !== 'function' || h?.v !== 1
      || !Array.isArray(h.dests) || !h.dests.includes('files')
      || !(Number(h.chunk) >= 4096)) return null;
    return b;
  }
  /** One awaited op over the chunked bridge (the playback.js streamOp
   * grammar — module-private copy, the shellShareFile precedent): null on
   * {ok:true}, else the shell's short machine token. */
  async function saveOp(bridge, msg) {
    try {
      const r = await bridge.postMessage(msg);
      return r && r.ok === true ? null : 'save-failed';
    } catch (e) {
      const tok = String(e?.message ?? e ?? 'save-failed').trim();
      return /^[a-z-]{1,40}$/.test(tok) ? tok : 'save-failed';
    }
  }
  let saveAttempt = null; // { name, blob, key, ext, gen } while a sheet is up
  let saveGen = 0;
  let unsaved = null; // { blob, key, ext } — a render the sheet left unsaved
  // (Cancel / a refused transfer) or a GH-997 salvage awaiting "Save anyway"
  /** Hand `blob` to the wrapper's save sheet (v2 chunked transfer, dest
   * 'files'). The dialog reads 'saving' until the shell's ONE result; a
   * transfer the shell refused never produces one, so it unlatches here. */
  async function shellSave(bridge, blob, key, ext) {
    const name = fileName(key, ext);
    const gen = ++saveGen;
    saveAttempt = { name, blob, key, ext, gen };
    const refused = async (code) => {
      await saveOp(bridge, { v: 2, op: 'abort', name }); // name-scoped, idempotent
      if (saveAttempt?.gen !== gen) return;
      saveAttempt = null;
      unsaved = { blob, key, ext };
      setUiState('notSaved', code);
    };
    const step = Math.floor(Math.min(SAVE_CHUNK_BYTES,
      Number(window.__obSaveVideo.chunk)) / 3) * 3; // padding-free base64
    const total = Math.max(1, Math.ceil(blob.size / step));
    let err = await saveOp(bridge, { v: 2, op: 'begin', name, mime: blob.type,
      dest: 'files', bytes: blob.size });
    if (err) { await refused(err); return; }
    for (let seq = 0; seq < total; seq++) {
      let b64 = null;
      try {
        const u8 = new Uint8Array(await blob.slice(seq * step,
          Math.min((seq + 1) * step, blob.size)).arrayBuffer());
        let bin = '';
        for (let i = 0; i < u8.length; i += 0x8000) {
          bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
        }
        b64 = btoa(bin);
      } catch { /* read failure below */ }
      if (b64 === null) { await refused('read-failed'); return; }
      err = await saveOp(bridge, { v: 2, op: 'chunk', name, seq, b64 });
      if (err) { await refused(err); return; }
    }
    err = await saveOp(bridge, { v: 2, op: 'end', name, chunks: total });
    if (err) await refused(err);
    // else: the sheet is up — 'ob:save-video-result' settles the attempt
  }
  window.addEventListener('ob:save-video-result', (e) => {
    const d = e?.detail;
    if (!d || typeof d.ok !== 'boolean' || !saveAttempt
      || d.name !== saveAttempt.name || d.dest !== 'files') return;
    const a = saveAttempt;
    saveAttempt = null;
    if (d.ok) { setUiState('done'); return; }
    unsaved = { blob: a.blob, key: a.key, ext: a.ext };
    setUiState('notSaved', d.error ?? 'save-failed');
  });
  /** Deliver a finished (or salvaged) render: the wrapper's save sheet with
   * an outcome where one exists (GH-991), else the pre-991 routes. */
  // ShareMessage/SaveVideoMessage.maxBytes mirror (the playback.js
  // BRIDGE_MAX_BYTES law): the wrapper refuses a bigger `begin` outright,
  // so an oversize file keeps the pre-991 anchor route (no outcome, but
  // never an unsaveable render)
  const SAVE_MAX_BYTES = 384 * 1024 * 1024;
  function deliverFile(blob, key, ext) {
    const bridge = blob.size <= SAVE_MAX_BYTES ? shellSaveBridge() : null;
    if (bridge) {
      shellSave(bridge, blob, key, ext);
      return true; // pending: the result event settles the dialog state
    }
    download(blob, key, ext);
    return false;
  }

  // ---- offline-capability probe seam (issue GH-197, re-scoped by GH-251) ----
  // hdInfo() was born as the record-save quality sheet's offer probe; the
  // sheet is GONE (GH-251 removed record.js's opts.ui branch and
  // record-quality.js) but the probe outlived it with new producers: the
  // Playback save card's open-time encoder-honesty probe (GH-225 review
  // rounds 1/3/4) reads it, and hdSave — the sheet's render leg — left with
  // the sheet. ADDITIVE window.__export member (feature-detected, rule-5
  // corollary).
  let hdBusy = false; // one offline run at a time, either entry point
  let finalizing = false; // GH-1125: a realtime capture's file still assembling

  /** The offline-renderable heights (720/1080 via the standard tier, 2160
   * via ultra4k — each gated on its PROBED encoder config) + the slowmo
   * rates. null = no offline leg here (no shot record, no WebCodecs, every
   * probe false). */
  async function hdInfo() {
    if (!game.sampler || !game.record) return null;
    support ??= await detectExportSupport();
    const heights = [];
    for (const h of [720, 1080, 2160]) {
      const tier = EXPORT_TIERS[h > 1080 ? 'ultra4k' : 'standard'];
      if (formatFor(tier, h) !== null) heights.push(h);
    }
    return heights.length ? { heights, slowmos: [1, 0.5, 0.25] } : null;
  }

  // (GH-251: hdSave — the record-save sheet's offline HD render leg — left
  // with the sheet and runHdSave; it was truly producerless after they
  // went. The drill lane below is the surviving offline multi-shot render.)

  // ---- drill render leg (issue GH-225 Phase B) -------------------------------
  // Multi-shot stitch over the SAME engine — reached via a DYNAMIC import of
  // offline-render.js so no new static name lands on the boot-graph
  // export.js → offline-render.js edge (rule-5 corollary; the import returns
  // the already-linked namespace, and a stale offline-render.js degrades to
  // an honest error, never a black boot). e2e/debug surface ONLY this phase
  // — the Clip editor (Phase C) becomes the user entry point.
  let drillProgress = null; // { done, total } while a drill render runs
  async function drillRender(records, opts = {}) {
    if (uiState === 'exporting' || hdBusy || finalizing) throw new Error('export already running');
    const m = await import('./offline-render.js');
    if (typeof m.renderDrill !== 'function') {
      throw new Error('drill render unavailable (stale offline-render.js)');
    }
    support ??= await detectExportSupport();
    const tier = EXPORT_TIERS[opts.tier ?? 'standard'];
    if (!tier?.offline) throw new Error(`unknown offline tier ${opts.tier}`);
    // gate honesty (GH-259): same refusal as runOffline — the drill lane must
    // not float-blend on a GPU the offer was withheld from
    if (opts.tier === 'cinematic' && !cinematicOk()) {
      throw new Error('cinematic tier needs float blending '
        + '(WebGL2 + EXT_color_buffer_float + EXT_float_blend)');
    }
    if (opts.cinelight && m.CINELIGHT_CAPABLE !== true) {
      // review r2 P1 — the same stale-engine honesty as runOffline: a
      // pre-GH-259 offline-render.js ignores the flag silently
      throw new Error('studio lighting unavailable '
        + '(stale offline-render.js) — reload the app');
    }
    if ((opts.perShotCamera ?? []).some((c) => c && typeof c === 'object'
      && c.script) && m.CAMSCRIPT_CAPABLE !== true) {
      // GH-275 review P1 — the CINELIGHT_CAPABLE honesty replayed for the
      // scripted per-segment camera: a cached pre-GH-275 offline-render.js
      // dispatches only string presets and { track }, so a { script }
      // segment (the POV preset) would silently export a frozen inherited
      // pose — refuse with the reload error instead
      throw new Error('scripted camera unavailable '
        + '(stale offline-render.js) — reload the app');
    }
    if ((opts.beats ?? []).some(Boolean) && m.WALKBEAT_CAPABLE !== true) {
      // GH-299 — the same honesty for the walk-beat schedule: a cached
      // pre-GH-299 offline-render.js ignores opts.beats silently and the
      // export ships hard cuts where the live player walked
      throw new Error('walk transitions unavailable '
        + '(stale offline-render.js) — reload the app');
    }
    if ((opts.fades ?? []).length && m.FADE_CAPABLE !== true) {
      // GH-301 — the WALKBEAT honesty replayed for the fade windows: a
      // cached pre-GH-301 offline-render.js ignores opts.fades silently and
      // the export ships un-faded frames the live player dipped to black
      throw new Error('fade transitions unavailable '
        + '(stale offline-render.js) — reload the app');
    }
    if ((opts.fades ?? []).some((f) => f?.b === 1)
      && m.RESETFADE_CAPABLE !== true) {
      // GH-452 (review r1 P2) — the same honesty for the BOUNDARY-anchored
      // fade form: derivation is capability-gated in playback.js, but a
      // PREBUILT plan (crash-resume manifest, direct drillRender caller)
      // replays its persisted opts verbatim — a pre-452 offline-render.js
      // would map `b: 1` through the play-relative arithmetic and dip at
      // the play start instead of the reset boundary. Refuse the stale
      // pairing instead of shipping a misplaced dip.
      throw new Error('reset-boundary fades unavailable '
        + '(stale offline-render.js) — reload the app');
    }
    if ((opts.leads ?? []).some(Boolean) && m.LEADIN_CAPABLE !== true) {
      // GH-363 — the same honesty for the pre-strike lead-in schedule: a
      // cached pre-363 offline-render.js ignores opts.leads silently and
      // the export ships strike-at-frame-0 segments the live player led
      // into (and the plan priced head frames for)
      throw new Error('pre-strike lead-in unavailable '
        + '(stale offline-render.js) — reload the app');
    }
    if (Number.isFinite(opts.budgetSec)
      && Math.floor(opts.budgetSec) !== CLIP_CAP_SEC
      && m.BYTEBUDGET_CAPABLE !== true) {
      // GH-304 — the same honesty for the byte-derived budget: a cached
      // pre-GH-304 offline-render.js ignores opts.budgetSec silently and
      // renders against the 60 s floor while the card promised (and the
      // beat schedule was degraded for) the derived length
      throw new Error('byte-derived budget unavailable '
        + '(stale offline-render.js) — reload the app');
    }
    if (opts.strike && m.STRIKEGLYPH_CAPABLE !== true) {
      // GH-364 — the FADE_CAPABLE honesty replayed for the strike-point
      // plate: a cached pre-GH-364 offline-render.js ignores opts.strike
      // silently and the export ships plate-less frames the live player
      // previewed with the plate armed
      throw new Error('strike-point overlay unavailable '
        + '(stale offline-render.js) — reload the app');
    }
    // GH-474/475 (review r2 P2): the plate SUBFEATURES take the same
    // honesty individually — a persisted/resumed plan can carry promises
    // (the backswing-synchronized window, the annotation halves) into a
    // relaunched session whose cached renderer predates them; a silent
    // ignore would deliver a file that diverges from the promised bytes
    // (a sound-off resume then refuses on the boundary hash; a restart
    // ships degraded timing/annotations as success).
    if (opts.strike?.window474 === true && m.STRIKEWINDOW_CAPABLE !== true) {
      throw new Error('strike-point overlay timing unavailable '
        + '(stale offline-render.js) — reload the app');
    }
    if ((opts.strike?.elev === true || opts.strike?.power === true)
      && m.STRIKEANNO_CAPABLE !== true) {
      throw new Error('strike-point annotations unavailable '
        + '(stale offline-render.js) — reload the app');
    }
    const fullStream = typeof opts.stream?.post === 'function';
    if (fullStream && m.FULLSTREAM_CAPABLE !== true) {
      // GH-305 — the same honesty for the streaming full-length sink: a
      // cached pre-GH-305 offline-render.js ignores opts.stream silently,
      // accumulates the whole file in memory AND montage-compresses the
      // session the card promised 1:1 — refuse with the reload error
      throw new Error('full-length streaming export unavailable '
        + '(stale offline-render.js) — reload the app');
    }
    const kn = effectiveKnobs(tier); // GH-259: device-resolved knobs
    const [dw, dh] = tier.defaultRes;
    const width = opts.width ?? dw, height = opts.height ?? dh;
    // review r2 P2: the 710 MB ruling at the entry point (see runOffline)
    if (opts.tier === 'cinematic' && (height > 1080 || width > 1920)) {
      throw new Error('cinematic renders at 1080p or below — SSAA above '
        + '1080p output is node-pipeline-only (the 710 MB ruling)');
    }
    const format = opts.format ?? formatFor(tier, height);
    if (!format) throw new Error('no supported encoder for this tier');
    controller = new AbortController();
    hdBusy = true;
    keepAwake(true); // GH-362: held for the run, released in the finally
    drillProgress = { done: 0, total: 0 };
    const t0 = performance.now();
    try {
      const res = await m.renderDrill(env, records, opts.perShotCamera ?? [], {
        ssaa: kn.ssaa, shutter: kn.shutter, shutterdeg: kn.shutterdeg,
        grade: kn.grade, dof: kn.dof,
        width, height, bitrate: bitrateFor(height), format,
        slowmo: opts.slowmo ?? 1, tailSec: opts.tailSec, trims: opts.trims,
        beats: opts.beats, // GH-299 walk-beat schedule (renderDrill doc)
        leads: opts.leads, // GH-363 pre-strike lead-in schedule (renderDrill doc)
        // PR-2 loading latch carry (review final round): a cueOff player
        // plan renders cue-less even if the engine loaded meanwhile
        cueOff: opts.cueOff === true,
        budgetSec: opts.budgetSec, // GH-304 plan-time byte-derived budget
        fades: opts.fades, // GH-301 fade windows (renderDrill doc)
        // GH-364 strike-point plate (renderDrill doc) — emitted only when
        // the plan armed it, so strike-less calls stay byte-identical
        ...(opts.strike ? { strike: opts.strike } : {}),
        withAudio: opts.withAudio ?? true,
        hashFrames: opts.hashFrames ?? false,
        cinelight: opts.cinelight ?? false, // GH-259 studio-lighting variant
        // GH-305: the streaming full-length sink — { post(data, at) },
        // capability-gated above (FULLSTREAM_CAPABLE); the engine pins
        // montage rate 1 and ignores budgetSec on this path BY DESIGN
        ...(fullStream ? { stream: opts.stream } : {}),
        // GH-362 layer 3 (ADDITIVE, review r9 P2): the plan-pinned
        // container stamp for streamed sinks — the export's real begin
        // time, captured once and replayed by crash-resume re-renders
        // (the byte-identity law); undefined elsewhere, ignored by the
        // engine for buffered sinks
        creationTime: opts.creationTime,

        signal: controller.signal,
        // GH-225 Phase C (ADDITIVE): forward the caller's progress hook beside
        // the polled seam — the playback save card drives its own bar
        onProgress: (done, total, ema) => {
          drillProgress = { done, total };
          opts.onProgress?.(done, total, ema);
        },
        // cap-policy surface (Phase C's montage-rate UI note): forwarded so
        // the callback is reachable from the exposed seam, not only the
        // result.montageRate field (review review on 01fe1bf2)
        onMontage: opts.onMontage,
        // GH-362 (ADDITIVE): the paused-state UI hook — the save card says
        // "paused — resumes automatically" instead of a stuck bar
        onPause: opts.onPause,
      });
      // GH-305: a streamed render has NO page-side bytes — the file went
      // over the wire as it muxed; size is the streamed extent, and every
      // bytes-consuming leg below (keepBytes/keepBlob/download) is
      // structurally inapplicable (the wire's far side owns delivery).
      lastResult = { tier: 'drill',
        size: res.bytes ? res.bytes.length : (res.streamedBytes ?? -1),
        frames: res.frames,
        clipSec: res.clipSec, ext: res.ext, hashes: res.hashes,
        segments: res.segments, montageRate: res.montageRate,
        ...(res.streamedBytes != null
          ? { streamedBytes: res.streamedBytes } : {}),
        // GH-472 (ADDITIVE): pause-seam in-place repairs (watermark
        // rewinds) the engine performed — the e2e arms' observability
        ...(res.repairs != null ? { repairs: res.repairs } : {}),
        // GH-997 (ADDITIVE): frames HELD over isolated encoder losses the
        // engine could not re-encode (within the delivery policy)
        ...(res.held != null ? { held: res.held, holes: res.holes } : {}),
        wallSec: (performance.now() - t0) / 1000, width, height };
      if (opts.keepBytes && res.bytes) { // e2e: ship the container bytes to node
        let b64 = '';
        for (let i = 0; i < res.bytes.length; i += 0x8000) {
          b64 += String.fromCharCode(...res.bytes.subarray(i, i + 0x8000));
        }
        lastResult.b64 = btoa(b64);
      }
      // GH-225 Phase C (ADDITIVE): hand the container back as a Blob so the
      // capability-aware destination card can route Photos/Files/Share/
      // download itself (drillRender otherwise only download()s). The
      // caller pairs it with noDownload; a STALE export.js simply returns
      // no .blob and the card degrades honestly.
      if (opts.keepBlob && res.bytes) {
        lastResult.blob = new Blob([res.bytes],
          { type: res.ext === 'mp4' ? 'video/mp4' : 'video/webm' });
      }
      if (!opts.noDownload && res.bytes) {
        download(new Blob([res.bytes],
          { type: res.ext === 'mp4' ? 'video/mp4' : 'video/webm' }),
        'drill', res.ext);
      }
      return lastResult;
    } catch (e) {
      if (e?.name === 'AbortError') return null; // cancelled: no file, no result
      // GH-997: a render the delivery wall refused as visibly broken still
      // exists — hand it up in the keepBlob shape so the save card can
      // offer "Save anyway" (a caller without keepBlob sees the bytes only)
      const sv = e?.obSalvage;
      if (opts.keepBlob && sv?.bytes instanceof Uint8Array) {
        sv.blob = new Blob([sv.bytes],
          { type: sv.ext === 'mp4' ? 'video/mp4' : 'video/webm' });
      }
      throw e;
    } finally {
      hdBusy = false;
      controller = null;
      drillProgress = null;
      keepAwake(false); // GH-362: every terminal path releases the hold
      announceIdle(); // GH-1024
    }
  }

  // ---- pre-render estimate for the confirm-first save card (GH-225) ---------
  let probedForEstimate = false;
  /** ADDITIVE seam: the honest ETA + approximate size of a drill plan
   * WITHOUT rendering a single clip frame — the playback save card's SETUP
   * state (the owner two-step-save fix) must promise a number before the
   * user commits. Deliberately the SAME machinery the export dialog's tier
   * rows use (modelMsPerFrame × the measured machine factor for the ETA,
   * bitrateFor × clip seconds for the size), so the two surfaces can never
   * disagree. `sec` is the caller's already-CAPPED output duration (the
   * montage cap arithmetic stays with the caller that owns the timeline).
   * `probe: true` refines the 3× safety factor with the same 10-frame
   * probeMachineFactor run open() does — ONCE per session, and only from a
   * caller that can put the RAF loop back the way it found it
   * (probeMachineFactor ends on setManual(false); playback.js re-latches
   * its paused bed with restorePlayerBed() right after the call). */
  // review r2 P2: the studio-lighting variant adds two rim PointLights to
  // every shutter subframe (the one-time private env bake amortizes to
  // noise over a clip) — measured +10.8% wall on the GH-259 evidence pair
  // (83.2 s vs 75.1 s, same instrumentation, same record). The estimate
  // carries it so the promised ETA is the renderer's own number for the
  // variant too, never plain-cinematic pricing under a cinelight label.
  const CINELIGHT_ETA_FACTOR = 1.11;
  function estimateDrill({ tier = 'standard', width, height,
    sec = 0, probe = false, cinelight = false } = {}) {
    // `?? EXPORT_TIERS.standard` was NOT the fallback the doc comment
    // promises: `realtime` is a real key with no `defaultRes`, so the
    // nullish guard passed it straight through and the destructure below
    // threw TypeError out of an ADDITIVE public seam (playback.js swallows
    // it and the card silently degrades to the shot count — GH-238 review
    // finding 2). This is an OFFLINE-tier model (modelMsPerFrame reads
    // ssaa/shutter, bitrateFor reads the height); anything that is not an
    // offline tier resolves to standard.
    const T = EXPORT_TIERS[tier]?.offline ? EXPORT_TIERS[tier] : EXPORT_TIERS.standard;
    const kn = effectiveKnobs(T); // GH-259: the estimate prices the knobs the
    // render will actually run (mobile ssaa/shutter downgrade included)
    const [dw, dh] = T.defaultRes;
    const w = width ?? dw, h = height ?? dh;
    if (probe && !probedForEstimate && game.sampler
      && typeof window.__test?.renderAt === 'function') {
      probedForEstimate = true; // one stall per session, throw or not
      try { factor = probeMachineFactor(env); } catch { /* keep the 3× safety */ }
    }
    const clipSec = Math.max(0, sec);
    const frames = Math.max(1, Math.round(clipSec * 60));
    return {
      etaSec: frames * modelMsPerFrame(kn, w, h)
        * (cinelight ? CINELIGHT_ETA_FACTOR : 1) * factor / 1000,
      bytes: bitrateFor(h) * clipSec / 8 + 160e3,
      frames,
      factor,
    };
  }

  async function start(key, overrides = {}) {
    if (uiState === 'exporting' || hdBusy || finalizing) throw new Error('export already running');
    const tier = EXPORT_TIERS[key];
    if (!tier) throw new Error(`unknown tier ${key}`);
    unsaved = null; // a fresh run supersedes any kept render
    setUiState('exporting');
    keepAwake(true); // GH-362: held for the run, released on EVERY exit
    try {
      const res = await (tier.offline ? runOffline(key, overrides)
        : runRealtime(overrides));
      // GH-991: a wrapper save sheet still deciding is not "done" yet
      setUiState(saveAttempt ? 'saving' : 'done');
      return res;
    } catch (e) {
      controller = null;
      if (e?.name === 'AbortError') { setUiState('cancelled'); return null; }
      const sv = e?.obSalvage;
      if (tier.offline && sv?.bytes instanceof Uint8Array) {
        // GH-997: the delivery wall refused the file as visibly broken
        // (more encoder loss than the hold policy hides) — but it EXISTS.
        // Offer "Save anyway" beside "Export again" instead of discarding
        // a near-complete render; the bytes live only while the offer does.
        // lastResult stays the previous delivered export's until the user
        // takes the offer (a refused run never overwrites it — the #258 law)
        const salvaged = { lost: sv.lost, want: sv.frames, held: sv.held };
        unsaved = { key, ext: sv.ext, noDownload: overrides.noDownload === true,
          blob: new Blob([sv.bytes],
            { type: sv.ext === 'mp4' ? 'video/mp4' : 'video/webm' }),
          salvaged,
          result: { tier: key, size: sv.bytes.length, frames: sv.frames,
            clipSec: sv.clipSec, ext: sv.ext, hashes: null,
            width: sv.width, height: sv.height, salvaged } };
        setUiState('salvage', e.message);
        throw e;
      }
      setUiState('error', e.message ?? String(e));
      throw e;
    } finally {
      keepAwake(false);
      announceIdle(); // GH-1024 (a seam run with the dialog closed)
    }
  }

  /** "Save again" (GH-991: the sheet was cancelled or refused) / "Save
   * anyway" (GH-997: a salvaged render) — the SAME bytes, no re-render. */
  function saveUnsaved() {
    const u = unsaved;
    if (!u || uiState === 'exporting') return;
    if (u.result) lastResult = u.result; // the salvage becomes the delivered result
    if (u.noDownload) { unsaved = null; setUiState('done'); return; } // e2e seam
    unsaved = null;
    setUiState(deliverFile(u.blob, u.key, u.ext) ? 'saving' : 'done');
  }

  function cancel() {
    controller?.abort();
    controller = null;
  }

  // ---- dialog DOM -----------------------------------------------------------
  const style = document.createElement('style');
  style.textContent = `
    #ob-export-btn { position: fixed; top: 10px; right: 268px; z-index: 40;
      appearance: none; -webkit-appearance: none; /* headless paints native
      buttons with the OS light theme despite the author background */
      font: var(--ob-fw-med) var(--ob-fs--1)/var(--ob-lh-body) var(--ob-font);
      /* 12px + lh 1.5 == the app.html #ob-toolbar family law (one text
         token, one line-height across the three text pills) */
      padding: 6px 12px; border-radius: var(--ob-r-full);
      border: 1px solid var(--ob-line-1); background: var(--ob-glass);
      backdrop-filter: blur(var(--ob-blur));
      -webkit-backdrop-filter: blur(var(--ob-blur)); /* required: translucent
      oklch bg over the WebGL canvas mis-paints white in (headless)
      compositing without the backdrop-filter layer — gear/share/record all
      carry it; keep the toolbar family consistent */
      color: var(--ob-text-0); cursor: pointer;
      white-space: nowrap; } /* right-anchored: grows leftward over empty
      canvas — labels must never ellipsize mid-word (taste review) */
    /* B-K15 guard (GH-668 S5 slice 6 G6): touch hover is sticky — the pill's
       hover rung rides the fine-pointer guard; :active below stays unguarded */
    @media (hover: hover) and (pointer: fine) {
      #ob-export-btn:hover { background: var(--ob-bg-2);
        border-color: var(--ob-line-2); } }
    /* pressed restated at id specificity (kit.css ladder doctrine: the id
       outranks .ob-btn:active — #49 review finding 2c); one rung past hover */
    #ob-export-btn:active { background: var(--ob-bg-3);
      border-color: var(--ob-accent-dim-2); }
    /* GH-245 (deferred item A4): the pill wore the UA focus ring — the only
       toolbar sibling without the kit ring. Restated at id specificity (the
       #ob-playback / #ob-gear precedent: an id-styled family member owes its
       own copy of every rung it outranks). */
    #ob-export-btn:focus-visible { outline: none;
      box-shadow: var(--ob-focus); }
    /* GH-156 (chrome diet): icon-only register — set only when the
       icons.js 'export' face resolved (a stale icons.js keeps the text
       pill). 6px padding + 20px face + 1px border = the 34px toolbar
       family box (J3 law); flex centering satisfies the J4 optical-center
       law. The localized label rides title + aria-label. */
    #ob-export-btn.ob-tb-icon { padding: 6px;
      display: inline-flex; align-items: center; justify-content: center; }
    #ob-export-btn.ob-tb-icon svg { display: block; }
    #ob-export-modal { position: fixed; inset: 0; z-index: 60; display: flex;
      align-items: center; justify-content: center;
      font-family: var(--ob-font); font-size: var(--ob-fs-0);
      line-height: var(--ob-lh-body); }
    /* kit-less path (cache-poison contract): stand-in scrim for the kit
       .ob-backdrop that openPanel would have inserted */
    #ob-export-modal.nokit {
      background: var(--ob-scrim, rgba(0,0,0,0.45)); }
    #ob-export-card { width: 460px; max-width: 92vw;
      position: relative; z-index: 50; /* above the kit .ob-backdrop (z:40 within this stacking context) */ }
    #ob-export-card .tier { display: flex; gap: var(--ob-sp-2);
      padding: var(--ob-sp-1) var(--ob-sp-2); border-radius: var(--ob-r-s);
      align-items: baseline; cursor: pointer; white-space: normal; }
    /* rest-state selection affordance: radio dot (inputs are hidden) */
    #ob-export-card .tier::before { content: ''; flex: 0 0 12px; width: 12px;
      height: 12px; border-radius: var(--ob-r-full);
      align-self: flex-start; margin-top: 3px; /* anchor to the FIRST text
      line: on wrapped (de) rows a centered dot hangs below its label */
      border: 1.5px solid var(--ob-line-2); box-sizing: border-box; }
    #ob-export-card .tier:has(input:checked)::before {
      border-color: var(--ob-accent);
      background: radial-gradient(circle,
        var(--ob-accent) 0 3px, transparent 3.5px); }
    #ob-export-card .tier.dis,
    #ob-export-card .tier:has(input:disabled) { opacity: .38; cursor: default; }
    /* B-K15 guard (G6): the tier-row hover and its disabled cancel ride ONE
       fine-pointer guard (same cascade as before, no geometry change) */
    @media (hover: hover) and (pointer: fine) {
      #ob-export-card .tier:hover { background: var(--ob-bg-2); }
      #ob-export-card .tier.dis:hover,
      #ob-export-card .tier:has(input:disabled):hover { background: none; } }
    #ob-export-card .tier b { min-width: 84px; display: inline-block;
      font-weight: var(--ob-fw-semi); }
    #ob-export-card .tier .eta { margin-left: auto;
      color: var(--ob-text-1); white-space: nowrap; } /* data, not accent —
      accent is reserved for action/selection (taste review) */
    /* tier rows stay a vertical radiogroup (description-rich cards), not the
       kit's inline strip — id specificity overrides .ob-segmented layout.
       Radius too (009): the kit's pill ("pill = clickable") fits inline
       strips; on this tall vertical stack it clamps to a stadium and the
       first/last rows poke past the curve — keep the measured card r-m. */
    #ob-x-tiers { display: flex; flex-direction: column; gap: 2px;
      border-radius: var(--ob-r-m);
      width: auto; max-width: none; /* GH-668 B-K03: the kit segmented is
      now INTRINSIC (width: fit-content); this vertical id-block keeps the
      card width until B-K16 migrates it off .ob-segmented */ }
    #ob-export-card .opts { margin: var(--ob-sp-3) 0; display: flex;
      flex-wrap: wrap; /* de register: the three labelled controls exceed
      the 460px card single-line — wrap instead of painting past the card
      edge (#81 QA); en/short locales still render one line */
      gap: var(--ob-sp-2) var(--ob-sp-4); align-items: center;
      flex-shrink: 0; /* issue GH-157 owner repro (de/ja phone): under the
      touch.css §3.10 column-flex card clamp WebKit computes a WRAPPED flex
      container's automatic minimum as a SINGLE line (Chrome floors it at
      the full wrapped height — the divergence that hid this in headless),
      so the crushed .opts box let its second row of option labels paint
      over the note/footer and outside the card. Explicit no-shrink = rows
      grow with wrapped content on every engine; the scrollable #ob-x-tiers
      keeps taking the squeeze (§3.10 law). Inert in desktop block layout —
      the .note precedent below. */ }
    #ob-export-card .opts label { display: inline-flex; align-items: center;
      gap: var(--ob-sp-2); color: var(--ob-text-1);
      min-height: 24px; /* build-4 QA: the audio-toggle label wrapper (the
      interactive target) measured 20px on desktop — under the WCAG 2.5.8
      fine-pointer floor; the coarse block below keeps its 44pt law */ }
    #ob-export-card .opts .ob-select { width: auto; }
    #ob-export-card .note { color: var(--ob-warn); margin: var(--ob-sp-2) 0;
      min-height: 15px; flex-shrink: 0; /* the phone column-flex card clamp
      (touch.css §3.10) must squeeze the scrollable TIER list, not crush
      this text to its 15px floor and paint it outside the card (#81 QA:
      de/ja two-line notes; flex-shrink is inert in desktop block layout) */ }
    #ob-export-card .row { display: flex; gap: var(--ob-sp-3);
      margin-top: var(--ob-sp-3);
      flex-shrink: 0; /* GH-157: the footer buttons join the no-crush family
      (same §3.10 clamp mechanics as .opts above) */ }
    #ob-export-card h3 { flex-shrink: 0; } /* GH-157: the title too — every
      fixed member holds its content height; ONLY #ob-x-tiers squeezes */
    #ob-x-barwrap { margin: var(--ob-sp-3) 0 var(--ob-sp-1); display: none; }
    /* kit-less fallback bar (width-driven; kit path = .ob-progress scaleX) */
    #ob-x-barwrap:not(.ob-progress) { height: 6px;
      border-radius: var(--ob-r-full); background: var(--ob-bg-0);
      border: 1px solid var(--ob-line-0); overflow: hidden; }
    #ob-x-barwrap:not(.ob-progress) > #ob-x-bar { height: 100%; width: 0%;
      background: var(--ob-accent); }
    #ob-x-ptext { color: var(--ob-text-1); min-height: 15px;
      flex-shrink: 0; /* same phone-clamp crush class as .note above */ }
    /* coarse-pointer tap floor (#81 QA; phone-hud.md §3.10 44pt law): the
       tier radiogroup rows, footer buttons and option controls are all tap
       targets. Pure (pointer: coarse) gate — no .ob-touch/width dependency,
       so tablet-width coarse surfaces (which touch.css's <1024px phone
       block misses) get the floor too. */
    @media (pointer: coarse) {
      #ob-export-card .tier { min-height: 44px; box-sizing: border-box;
        padding-block: var(--ob-sp-3); /* baseline-aligned row content sits
        on the first text line — padding keeps it visually centered at the
        single-line 45px height; wrapped (de) rows grow past the floor */ }
      #ob-export-card .row button,
      #ob-export-card .opts label,
      #ob-export-card .opts .ob-select,
      #ob-export-card .opts select { min-height: 44px; }
    }`;
  document.head.appendChild(style);

  const btn = document.createElement('button');
  btn.id = 'ob-export-btn';
  btn.textContent = t('export.button');
  btn.title = t('export.buttonTitle');
  // GH-156 (chrome diet, owner principle 2): the desktop toolbar pill is a
  // SECONDARY action → icon-only with the localized label on title +
  // aria-label. Guarded dynamic icons import (#49 doctrine / boot-graph
  // rule 5): a stale icons.js resolves 'export' to null and the pre-diet
  // TEXT pill stays, labels intact.
  let btnIconOn = false;
  const relabelBtn = () => {
    btn.title = t('export.buttonTitle');
    btn.setAttribute('aria-label', t('export.button'));
    if (!btnIconOn) btn.textContent = t('export.button');
  };
  try {
    import('./ui/icons.js').then((m) => {
      const face = m.icon?.('export');
      if (!face) return;
      btnIconOn = true;
      btn.classList.add('ob-tb-icon');
      btn.replaceChildren(face);
      relabelBtn();
    }).catch(() => { /* text pill stays */ });
  } catch { /* text pill stays */ }
  relabelBtn();
  (() => {
    // insert sorted by toolbar order so TAB order matches the visual order
    // (CSS `order` alone reorders pixels, not focus — QA minor)
    const tb = document.getElementById('ob-toolbar');
    if (!tb) { document.body.appendChild(btn); return; }
    btn.dataset.tbOrder = '1';
    const next = [...tb.children].find((c) => +(c.dataset.tbOrder || 99) > 1);
    tb.insertBefore(btn, next || null);
  })();
  btn.addEventListener('click', () => open());
  // GH-1024 belt: a table that changes under the open dialog (any re-rack
  // path the WIN deferral does not own) repaints the rows from the live
  // sampler — never stale ETAs beside an enabled Export for a shot that is
  // gone. A running export owns its own paint.
  machine.on?.('stateChange', () => {
    if (modal && uiState !== 'exporting') refreshRows();
  });
  // localized chrome (button + any open modal), re-applied on locale switch
  // (registered here, invoked only after createExport has fully initialized)
  onLocaleChange(() => {
    relabelBtn();
    if (!modal) return;
    applyDom(modal);
    refreshRows(); // recompute eta/'unavailable'/notes in the new locale
    if (uiState !== 'exporting') setUiState(uiState, lastMsg);
  });

  let modal = null;
  let card = null;               // #ob-export-card (openPanel/closePanel target)
  let resW = null, slowW = null; // upgradeSelect handles (refresh() after rebuilds)
  let prog = null;               // makeProgress handle (scaleX-driven fill)
  const q = (id) => modal?.querySelector('#' + id);
  const resSelect = () => q('ob-x-res')?.value.split('x').map(Number) ?? null;
  const slowmoSelect = () => Number(q('ob-x-slow')?.value ?? 1);
  const audioToggle = () => q('ob-x-audio')?.checked ?? true;
  const pickedTier = () =>
    modal?.querySelector('input[name=ob-x-tier]:checked')?.value ?? 'standard';

  function setProgress(done, total, ema, text) {
    if (!modal) return;
    q('ob-x-barwrap').style.display = 'block';
    const txt = text ?? t('export.progress', {
      pct: Math.round(100 * done / total),
      eta: fmtEta((total - done) * ema / 1000), done, total,
    });
    if (prog) prog.set(done / total, txt); // kit fill: transform scaleX only
    else q('ob-x-bar').style.width = `${(100 * done / total).toFixed(1)}%`;
    q('ob-x-ptext').textContent = txt;
  }

  let lastMsg = null; // last setUiState message (relabel re-renders it)
  function setUiState(s, msg) {
    uiState = s;
    lastMsg = msg;
    if (!modal) return;
    // GH-991: Start also waits out a pending save sheet — a new run under
    // it would take the old sheet's result mid-export
    q('ob-x-start').disabled = s === 'exporting' || s === 'saving' || !game.sampler;
    // GH-332: Cancel sits LAST in the row (open()'s template), so this
    // display toggle never moves Start/Close — pre-fix, Close packed left
    // into Cancel's vacated flex spot and the second click of a
    // double-click on Cancel dismissed the whole dialog.
    q('ob-x-cancel').style.display = s === 'exporting' ? '' : 'none';
    // GH-991/997: the kept-render offer — "Save again" over a cancelled or
    // refused sheet, "Save anyway" over a salvaged render (Start then reads
    // "Export again"). LAST in the row beside Cancel, and never visible
    // together with it, so the GH-332 law holds: Start/Close never move
    // when either toggles.
    const offer = s === 'notSaved' || s === 'salvage';
    const save = q('ob-x-save');
    save.style.display = offer ? '' : 'none';
    save.dataset.i18n = s === 'salvage' ? 'export.salvage.save' : 'export.saveAgain';
    save.textContent = t(save.dataset.i18n);
    const go = q('ob-x-start');
    go.dataset.i18n = s === 'salvage' ? 'export.salvage.retry' : 'export.start';
    go.textContent = t(go.dataset.i18n);
    if (s === 'done') q('ob-x-ptext').textContent = lastResult?.salvaged
      ? t('export.salvage.kept', { size: fmtMB(lastResult.size),
        ext: lastResult.ext, lost: lastResult.salvaged.lost,
        want: lastResult.salvaged.want })
      : lastResult?.size > 0
        ? t('export.done', { size: fmtMB(lastResult.size), ext: lastResult.ext,
          frames: lastResult.frames, sec: lastResult.wallSec?.toFixed(1) })
        : t('export.doneDownload');
    else if (s === 'saving') q('ob-x-ptext').textContent = t('export.saving');
    else if (s === 'notSaved') {
      q('ob-x-ptext').textContent = msg === 'cancelled' ? t('export.notSaved')
        : t('export.notSavedFailed', { code: String(msg ?? 'save-failed') });
    } else if (s === 'salvage') {
      q('ob-x-ptext').textContent = t('export.salvage.prompt',
        { lost: unsaved?.salvaged?.lost ?? 0,
          want: unsaved?.salvaged?.want ?? 0 });
    } else if (s === 'cancelled') {
      q('ob-x-ptext').textContent = t('export.cancelled');
      // stale-progress sliver (#81 QA): a cancelled run must not leave the
      // part-filled bar painted — hide the wrap and zero the fill (both
      // paths) so the next start() begins from a clean bar
      q('ob-x-barwrap').style.display = 'none';
      if (prog) prog.set(0, '');
      else q('ob-x-bar').style.width = '0%';
    }
    else if (s === 'error') q('ob-x-ptext').textContent = t('export.failed', { message: msg });
    else if (s !== 'exporting') q('ob-x-ptext').textContent = '';
  }

  function refreshRows() {
    if (!modal) return;
    const key = pickedTier();
    const tier = EXPORT_TIERS[key];
    // resolution options follow the picked tier
    const res = q('ob-x-res');
    if (tier.offline) {
      res.disabled = false;
      const opts = tier.resolutions.map(([w, h]) =>
        `<option value="${w}x${h}" ${h === tier.defaultRes[1] ? 'selected' : ''}>${h}p</option>`);
      if (res.dataset.tier !== key) { res.innerHTML = opts.join(''); res.dataset.tier = key; }
    } else {
      res.innerHTML = `<option>${t('export.canvasRes')}</option>`;
      res.disabled = true; res.dataset.tier = key;
    }
    q('ob-x-slow').disabled = !tier.offline;
    const pick = tier.offline ? (resSelect() ?? tier.defaultRes) : [0, 0];
    for (const [k, tier2] of Object.entries(EXPORT_TIERS)) {
      const row = q('ob-x-tier-' + k);
      // GH-259: the cinematic row additionally rides the float-blend gate —
      // gated GPUs see the existing export.unavailable disabled pattern
      const avail = formatFor(tier2, tier2.offline ? tier2.defaultRes[1] : 0) !== null
        && (k !== 'cinematic' || cinematicOk());
      row.classList.toggle('dis', !avail);
      row.querySelector('input').disabled = !avail;
      const r = tier2.offline ? (k === key ? pick : tier2.defaultRes) : [0, 0];
      const sl = tier2.offline ? slowmoSelect() : 1;
      row.querySelector('.eta').textContent = !avail ? t('export.unavailable')
        : !game.sampler ? '—'
          : `${fmtEta(etaSeconds(k, r, sl))} · ${fmtMB(sizeEstimate(k, r, sl))}`;
    }
    const fmt = formatFor(tier, (tier.offline ? pick : [0, 1080])[1]);
    // Honesty ladder (issue #51): when NEITHER path exists say so instead
    // of promising "realtime capture only" over a dead tier. Availability
    // means a PROBED tier (mp4/webm — webcodecs:true only says the
    // interfaces exist; all-probes-false is still a dead end, review F4)
    // or the MediaRecorder realtime path.
    const noneAvailable = !(support?.mp4 || support?.webm)
      && !window.__record?.supported;
    q('ob-x-note').textContent = noneAvailable ? t('export.noneAvailable')
      : !support?.webcodecs && tier.offline
        ? t('export.needsWebCodecs')
        : !game.sampler ? t('export.playFirst')
          : fmt === 'webm' && tier.offline
            ? t('export.webmFallback') : '';
    q('ob-x-start').disabled = uiState === 'exporting' || uiState === 'saving'
      || !game.sampler || fmt === null;
    // kit contract: widget label/disabled state follows every option rebuild
    // or relabel (refresh() also closes a now-stale popover; it never
    // re-dispatches change, so no refreshRows loop)
    resW?.refresh();
    slowW?.refresh();
  }

  // GH-985: ONE build in flight. The first open of a session awaits the
  // kit and four isConfigSupported probes before `modal` exists, and a
  // second press inside that window used to pass the `modal` guard too —
  // two modals, the first orphaned as an invisible full-viewport layer
  // that swallowed every click once both cards were closed. A press while
  // the build is pending now joins it.
  let opening = null;
  function open() {
    if (modal) return Promise.resolve(refreshRows());
    opening ??= buildModal().finally(() => { opening = null; announceIdle(); });
    return opening;
  }

  // ---- GH-1024: the shot this export holds ----------------------------------
  // The frame-end WIN hold re-racks after 2.6 s, and the re-rack frees the
  // sampler + record every toolbar export re-renders. flow.js asks
  // holdsShot() at that beat and DEFERS the re-rack while the answer is
  // true — the dialog building (the first open awaits the kit + encoder
  // probes), open in any state, or a run in flight — then resumes it on
  // the 'ob:export-idle' this module announces when it lets go.
  function holdsShot() {
    return !!opening || !!modal || uiState === 'exporting' || hdBusy || finalizing;
  }
  function announceIdle() {
    if (holdsShot()) return;
    try { window.dispatchEvent(new CustomEvent('ob:export-idle')); } catch { /* no DOM */ }
  }

  async function buildModal() {
    await kitReady; // resolved (never rejects) — kit stays null on failure
    support ??= await detectExportSupport();
    modal = document.createElement('div');
    modal.id = 'ob-export-modal';
    const rows = Object.keys(EXPORT_TIERS).map((k) => `
      <label class="tier" id="ob-x-tier-${k}">
        <input type="radio" name="ob-x-tier" value="${k}"
          ${k === 'standard' ? 'checked' : ''}>
        <b data-i18n="export.tier.${k}.name"></b>
        <span data-i18n="export.tier.${k}.desc"></span><span class="eta ob-nums"></span>
      </label>`).join('');
    modal.innerHTML = `<div id="ob-export-card" class="ob-panel">
      <h3 class="ob-panel__title" data-i18n="export.heading"></h3>
      <div id="ob-x-tiers">${rows}</div>
      <div class="opts">
        <label><span class="ob-caps" data-i18n="export.resolution"></span> <select id="ob-x-res"></select></label>
        <label><span class="ob-caps" data-i18n="export.speed"></span> <select id="ob-x-slow"><option value="1">1×</option>
          <option value="0.5">0.5×</option><option value="0.25">0.25×</option>
        </select></label>
        <label><span class="ob-caps" data-i18n="export.sound"></span> <input type="checkbox" id="ob-x-audio" checked></label>
      </div>
      <div class="note" id="ob-x-note"></div>
      <div id="ob-x-barwrap"><div id="ob-x-bar"></div></div>
      <div id="ob-x-ptext" class="ob-nums"></div>
      <div class="row">
        <button id="ob-x-start" class="ob-btn--primary" data-i18n="export.start"></button>
        <button id="ob-x-close" class="ob-btn--ghost" data-i18n="export.close"></button>
        <button id="ob-x-cancel" class="ob-btn--danger" style="display:none" data-i18n="export.cancel"></button>
        <button id="ob-x-save" style="display:none" data-i18n="export.saveAgain"></button>
      </div></div>`;
    applyDom(modal); // localized texts for every data-i18n slot above
    document.body.appendChild(modal);
    card = modal.firstElementChild;
    modal.addEventListener('change', (e) => {
      refreshRows();
      if (e.target?.name === 'ob-x-tier') { // value-change feedback (throttled)
        kit?.motion.pulse(q('ob-x-tier-' + e.target.value)?.querySelector('.eta'));
      }
    });
    q('ob-x-start').addEventListener('click', (e) => {
      kit?.motion.press(e.currentTarget);
      start(pickedTier()).catch(() => {}); // surfaced via setUiState('error')
    });
    q('ob-x-cancel').addEventListener('click', (e) => {
      kit?.motion.press(e.currentTarget);
      cancel();
    });
    q('ob-x-save').addEventListener('click', (e) => {
      kit?.motion.press(e.currentTarget);
      saveUnsaved();
    });
    q('ob-x-close').addEventListener('click', close);
    if (kit) { // progressive upgrades — native controls stay value-authoritative
      kit.controls.upgradeSegmented(q('ob-x-tiers'));
      resW = kit.select.upgradeSelect(q('ob-x-res'));
      slowW = kit.select.upgradeSelect(q('ob-x-slow'));
      kit.controls.upgradeToggle(q('ob-x-audio'));
      prog = kit.controls.makeProgress(q('ob-x-barwrap'));
      q('ob-x-barwrap').firstElementChild.id = 'ob-x-bar'; // makeProgress replaced the fill
    } else {
      modal.classList.add('nokit'); // module scrim stands in for the backdrop
    }
    if (modal) modal.style.pointerEvents = '';
    uiState = 'open';
    unsaved = null; // a kept render never outlives the dialog that offered it
    // machine-factor probe (10 frames, <100 ms) refines every displayed ETA —
    // runs BEFORE the enter tween so its sync readPixels stall cannot hitch it
    if (support.webcodecs && game.sampler) factor = probeMachineFactor(env);
    refreshRows();
    // enter motion + backdrop + focus trap + Escape hook. Fire-and-forget:
    // open() resolves without awaiting the tween (e2e chains __export.support())
    kit?.dialog.openPanel(card, {
      backdrop: true, onClose: close,
      // a running multi-minute encode must not die to a stray Escape or
      // backdrop click — the explicit Cancel button is the only path out
      dismissable: () => uiState !== 'exporting',
    });
  }

  function close() {
    if (!modal) return;
    if (finalizing) return; // GH-1125: the settle-lock — the dialog stays up until the capture's file settles
    modal.style.pointerEvents = 'none'; // exit tween must not swallow clicks
    if (uiState === 'exporting') cancel();
    // popover hygiene BEFORE closePanel (kit contract): refresh() closes any
    // open .ob-select__list so nothing strands over the canvas
    resW?.refresh();
    slowW?.refresh();
    // kit TEARDOWN (GH-668 S5 kit, review r3 P2 — the playback closeCard law):
    // the modal is rebuilt per open, so its two upgraded selects must be
    // destroy()-ed before the node goes or their clamp ResizeObservers
    // retain the detached modal forever. After the exit tween (destroy()
    // unhides the native <select>; the kit face holds through the fade).
    const m = modal, c = card, widgets = [resW, slowW];
    modal = null; card = null; resW = null; slowW = null; prog = null;
    uiState = 'idle';
    unsaved = null; // GH-991/997: the kept bytes leave with the dialog
    saveAttempt = null; // …and a sheet still up settles on its own (its
    // late result must not flip a reopened dialog)
    announceIdle(); // GH-1024: a deferred WIN re-rack may proceed
    const dropModal = () => {
      for (const w of widgets) { try { w?.destroy?.(); } catch { /* stale */ } }
      m.remove();
    };
    // __export.close() stays synchronous for e2e/perf-ui (state + q() flip
    // NOW); only the node removal waits for the kit exit tween. Safe when
    // dialog.js already ran closePanel (Escape/backdrop): it is re-entrant.
    if (kit && c) kit.dialog.closePanel(c).then(dropModal);
    else dropModal();
  }

  // ---- e2e / debug surface --------------------------------------------------
  window.__export = {
    // GH-259: cinematic is OMITTED (not null) when the float-blend gate
    // fails — consumers OFFER it only on presence (`tiers().cinematic`),
    // so fresh-playback/stale-export pairings degrade to no option, never
    // a dishonest estimate over a tier that would render black
    tiers: () => Object.fromEntries(Object.entries(EXPORT_TIERS)
      .filter(([k]) => k !== 'cinematic' || cinematicOk())
      .map(([k, t]) => [k, formatFor(t, t.offline ? t.defaultRes[1] : 0)])),
    support: () => support,
    factor: () => factor,
    state: () => uiState,
    lastResult: () => lastResult,
    // GH-1024 (ADDITIVE): flow.js defers the WIN re-rack while true
    holdsShot,
    // GH-997 (ADDITIVE): the standing salvage offer's counts, or null
    salvage: () => (unsaved?.salvaged ? { ...unsaved.salvaged } : null),
    etaText: (k) => q('ob-x-tier-' + (k ?? pickedTier()))
      ?.querySelector('.eta').textContent ?? null,
    open, close, start, cancel,
    // GH-197 (ADDITIVE), re-scoped by GH-251: the offline-capability probe —
    // the Playback save card's encoder-honesty gate reads it (hdSave left
    // with the record-save quality sheet; see the hdInfo doc comment)
    hdInfo,
    // GH-225 Phase B (ADDITIVE): the multi-shot drill stitch e2e seam — see
    // the drillRender doc comment above. cancel() aborts it like any run.
    renderDrill: drillRender,
    // GH-275 review rounds 2+3 (ADDITIVE): the SEAM half of the scripted-
    // camera capability chain. playback.js checks this before emitting a
    // { script } plan into renderDrill. A merge-base-cached export.js
    // simply lacks the key; and THIS build propagates the linked ENGINE's
    // own marker (round 3: `camScriptCapable: true` unconditionally left
    // fresh playback/export over a CACHED pre-GH-275 offline-render.js in
    // a permanently failing ready state — every press threw the reload
    // error, then syncCardActions re-armed the CTA and the setup hint).
    camScriptCapable: offRender.CAMSCRIPT_CAPABLE === true,
    // GH-299 (ADDITIVE): the walk-beat half of the same chain — playback.js
    // checks this before emitting an opts.beats plan, and the value
    // propagates the linked ENGINE's own marker (the camScriptCapable
    // round-3 lesson: an unconditional `true` would strand fresh
    // playback/export over a cached pre-GH-299 offline-render.js in a
    // permanently failing ready state).
    walkBeatCapable: offRender.WALKBEAT_CAPABLE === true,
    // design 277 slice 3 PR-2 (ADDITIVE, the walkBeatCapable shape):
    // playback.js checks this before emitting trims that reach INTO a
    // cue-life tail (endT past the record duration) — a cached pre-PR-2
    // offline-render.js would silently clamp them at the record end and
    // ship a clip shorter than the card promised. Propagates the linked
    // ENGINE's own marker (the camScriptCapable round-3 lesson).
    cuePostTailCapable: offRender.CUEPOST_TAIL_CAPABLE === true,
    // GH-304 (ADDITIVE): the byte-budget half of the same chain — playback
    // derives a non-floor budget (and emits opts.budgetSec) only when this
    // is true, and the value propagates the linked ENGINE's own marker
    // (the camScriptCapable round-3 lesson, verbatim).
    byteBudgetCapable: offRender.BYTEBUDGET_CAPABLE === true,
    // GH-304 (ADDITIVE): the plan-time budget seam — resolves the plan's
    // REAL container (formatFor over the probed support, exactly what the
    // render will negotiate) and hands the derivation to the engine's ONE
    // exportBudgetSec. Unresolvable format (no probe yet, no WebCodecs, a
    // realtime-only device) answers the CLIP_CAP_SEC floor, derived:false —
    // the honest floor law. `photos` is the caller's destination truth
    // (playback's destsFor membership) — it picks the webm transcode wall.
    exportBudget: ({ tier = 'standard', height, photos = false } = {}) => {
      const T = EXPORT_TIERS[tier]?.offline
        ? EXPORT_TIERS[tier] : EXPORT_TIERS.standard;
      const h = height ?? T.defaultRes[1];
      const format = formatFor(T, h);
      if (!format || typeof offRender.exportBudgetSec !== 'function') {
        return { sec: CLIP_CAP_SEC, derived: false };
      }
      return offRender.exportBudgetSec({ format, height: h,
        photos: photos === true });
    },
    // GH-301 (ADDITIVE): the fade-window half of the same chain —
    // playback.js checks this before emitting an opts.fades plan; the value
    // propagates the linked ENGINE's own marker (the camScriptCapable
    // round-3 lesson — never an unconditional `true`).
    fadeCapable: offRender.FADE_CAPABLE === true,
    // GH-452 (ADDITIVE): the boundary-anchored reset-fade half of the same
    // chain — playback.js derives the reset-boundary dip schedule (live dip
    // + opts.fades `b: 1` entries) only when this is true; the value
    // propagates the linked ENGINE's own marker (the camScriptCapable
    // round-3 lesson, verbatim). Stale anywhere → the recorded pre-452
    // hard cut on both surfaces.
    resetFadeCapable: offRender.RESETFADE_CAPABLE === true,
    // GH-363 (ADDITIVE): the pre-strike lead-in half of the same chain —
    // playback.js plans leads (and emits opts.leads) only when this is
    // true; the value propagates the linked ENGINE's own marker (the
    // camScriptCapable round-3 lesson, verbatim).
    leadInCapable: offRender.LEADIN_CAPABLE === true,
    // GH-305 (ADDITIVE): the streaming full-length half of the same chain —
    // playback.js OFFERS the "full game" save-card mode only when this is
    // true (beside the shell's v3 capability hint), and the value
    // propagates the linked ENGINE's own marker (the camScriptCapable
    // round-3 lesson, verbatim).
    fullStreamCapable: offRender.FULLSTREAM_CAPABLE === true,
    // GH-362 layer 3 (ADDITIVE): the wire-frame plumb half of the crash-
    // grade resume chain — playback.js persists a resume plan and rides
    // plan/frame onto the v3 chunk ops only when the linked ENGINE passes
    // the frame index through stream.post (the camScriptCapable round-3
    // lesson: propagate the engine's OWN marker, never an unconditional
    // true). Stale anywhere → exactly the pre-layer-3 wire.
    resumeFrameCapable: offRender.RESUMEFRAME_CAPABLE === true,
    // GH-362 (ADDITIVE, review r2 P1): the refcounted keep-awake hold for
    // export paths that do NOT enter start()/drillRender — the save card's
    // realtime-capture fallback tier runs up to 75 s of wall clock and
    // common Auto-Lock settings would background it mid-capture. A stale
    // export.js simply lacks the member (the pre-362 degrade).
    keepAwake,
    // GH-364 (ADDITIVE): the strike-point-plate half of the same chain —
    // playback.js OFFERS the save-card toggle (and emits an opts.strike
    // plan) only when this is true; the value propagates the linked
    // ENGINE's own marker (the camScriptCapable round-3 lesson, verbatim).
    strikeGlyphCapable: offRender.STRIKEGLYPH_CAPABLE === true,
    // GH-475 (ADDITIVE): the plate's elevation/power annotation knobs —
    // playback.js mounts the knob rows only when the ENGINE can burn the
    // fields (a cached pre-475 offline-render.js ignores them silently;
    // same lesson, same shape).
    strikeAnnoCapable: offRender.STRIKEANNO_CAPABLE === true,
    // GH-474 (ADDITIVE, review r1 P1): the plate's backswing-synchronized
    // WINDOW — the live preview applies the new timing law only when the
    // linked engine burns it (see the marker's mixed-cache note).
    strikeWindowCapable: offRender.STRIKEWINDOW_CAPABLE === true,
    // GH-373 (ADDITIVE): with-sound full-length plans are unwalled only
    // when the engine's OWN export-audio.js pairing can window the bed —
    // fullAudioWindowCapable is a function (not a constant marker) because
    // a fresh offline-render.js can ride beside a cached pre-373
    // export-audio.js that still builds the one-piece bed. playback.js
    // keeps the 390 s fullTooLong gate while this reads false, mirroring
    // renderDrill's own stale-pairing bail (two-layer honesty).
    fullAudioWindowed: typeof offRender.fullAudioWindowCapable === 'function'
      && offRender.fullAudioWindowCapable() === true,
    // GH-435 (ADDITIVE): TRUE when streamed with-sound renders on this
    // runtime take the windowed-EXACT bed (byte-reproducible — the
    // deterministic-class expansion). playback.js widens the crash-resume
    // fast-forward gate to sound-on mp4 plans only while this reads true;
    // any stale link in the chain (pre-435 offline-render.js or
    // export-audio.js) answers false/undefined and the with-sound class
    // honestly keeps the restart flow.
    fullAudioExact: typeof offRender.fullAudioExactCapable === 'function'
      && offRender.fullAudioExactCapable() === true,
    // GH-435 review r1 P1 (ADDITIVE): the render-time preferSw probe,
    // seam-exposed for the crash-resume plan gate — null (not a
    // false-answering stub) when the paired offline-render.js lacks it, so
    // playback.js can tell "probed unsupported" from "stale pairing" (the
    // latter keeps the pre-435 gate shape). The bitrate is derived HERE
    // (review r3 P2): drillRender always configures bitrateFor(height) —
    // persisted plans carry no bitrate — so the gate must probe the exact
    // configuration both the original and the resumed render will use,
    // never `bitrate: undefined`.
    swVideoSupported: typeof offRender.swVideoSupported === 'function'
      ? (spec) => offRender.swVideoSupported(
        { ...spec, bitrate: spec.bitrate ?? bitrateFor(spec.height) })
      : null,
    // GH-305 (ADDITIVE): the plan's REAL container for a (tier, height)
    // pair — formatFor over the probed support, exactly what drillRender
    // will negotiate. The full-mode Photos tile gates on 'mp4' here (mime
    // honesty at ENCODE time: full mode never transcodes). null = no probe
    // yet / no encoder — the caller withholds the offer.
    planFormat: ({ tier = 'standard', height } = {}) => {
      const T = EXPORT_TIERS[tier]?.offline
        ? EXPORT_TIERS[tier] : EXPORT_TIERS.standard;
      return formatFor(T, height ?? T.defaultRes[1]);
    },
    drillProgress: () => drillProgress,
    // GH-225 confirm-first save card (ADDITIVE): pre-render ETA/size for a
    // drill plan — see the estimateDrill doc comment above. A stale
    // export.js simply lacks it and the card drops the estimate line.
    estimateDrill,
    // GH-225 Phase C QA (ADDITIVE): release the retained drill-render
    // payload once the playback card/player is done with it — the
    // module-scope lastResult otherwise pins the last clip's blob (MBs at
    // 720p, ~100 MB class for 4K montages) until the next render or a full
    // reload (real pressure inside an iOS WebView). Drill-tier only: the
    // export dialog's own results stay untouched.
    releaseDrill: () => {
      if (lastResult?.tier === 'drill') {
        lastResult.blob = null;
        lastResult.b64 = null;
      }
    },
  };
  return { open, start, cancel };
}
