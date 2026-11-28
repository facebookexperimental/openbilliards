// Copyright (c) Meta Platforms, Inc. and affiliates.

// offline-render.js — the export engine behind web/app/export.js: replays
// the current ShotRecord deterministically frame by frame (framestep.js
// timeline — the SAME math record.mjs --framestep/--shutter steps), renders
// each output frame at OUTPUT resolution through the live composer with
// shutter accumulation + optional SSAA + the grade pass, grabs it with
// `new VideoFrame(canvas)` (<1 ms, GPU-side), and feeds WebCodecs encoders
// muxed in-page (mp4-muxer avc1+aac; webm-muxer vp9+opus fallback).
// See the video-export design note (internal) for the ruling this implements.
import * as THREE from 'three';
import { FullScreenQuad } from '../vendor/jsm/postprocessing/Pass.js';
// StreamTarget (GH-305): both names shipped in the FIRST vendored builds
// (932a3e30 — mp4-muxer 5.2.2 / webm-muxer 5.1.4), so this named import is
// link-safe for every cache pairing (rule-5 corollary bars only NEW names).
import { Muxer as Mp4Muxer, ArrayBufferTarget as Mp4Target,
  StreamTarget as Mp4Stream } from '../vendor/mp4-muxer/mp4-muxer.mjs';
import { Muxer as WebmMuxer, ArrayBufferTarget as WebmTarget,
  StreamTarget as WebmStream } from '../vendor/webm-muxer/webm-muxer.mjs';
import { FDT, TAIL_SEC, shutterSubframes, planPlayback } from './framestep.js';
import * as framestepNs from './framestep.js'; // LAND-17 BC: the new name through a namespace binding (boot-cache rule, the ownership ledger:42-53)
// NAMESPACE import on purpose (the ownership ledger rule 5 corollary): this module
// sits in main.js's static boot graph, and renderDrillAudio is a NEW
// export-audio.js export (issue #225 Phase B) — a named import of a new
// name would fail module linking (black boot) for a returning user whose
// cache pairs this fresh module with a stale export-audio.js. The old
// names ride the namespace; the new one is feature-detected below (a stale
// export-audio.js degrades single-shot exports untouched and fails DRILL
// audio with an honest error). Do NOT convert to named imports of
// post-2026-07 export-audio.js exports.
import * as exportAudio from './export-audio.js';
// `t` is a boot-original i18n.js export (i18n.js is already deep in the
// static boot graph via main.js/export.js), so this edge is link-safe for
// ANY cache pairing — rule 5's corollary only bars named imports of NEW
// names. Used for the #258 encoder-stall failure text: the message must
// arrive localized at every consumer (export dialog, playback save card,
// record.js HD leg) without adding per-consumer mapping seams. Aliased:
// the k-loop's frame-time local `t` would shadow the bare name exactly
// where the watchdog throws.
import { t as i18nT } from './i18n.js';

const { AUDIO_RATE } = exportAudio;

export const CLIP_CAP_SEC = 60; // ruling: explicit output-length ceiling —
// since GH-304 the HONEST FLOOR of the byte-derived budget below (an
// uncalibrated device, a failed/corrupt store, or any stale module in the
// chain budgets exactly these 60 s; the derived budget replaces it only
// when a REAL measurement exists)

// ---- GH-304: the byte-derived export duration budget --------------------------
// The montage/save ceiling is derived from a MEASURED bytes-per-second rate
// for the active (container, output height) pair against the governing
// delivery byte wall, instead of hardcoding 3600 frames. Design (owner
// decision (b) on GH-304):
//
//   • CALIBRATION, not a guess: every SUCCESSFUL renderTimeline run records
//     its own whole-file rate (bytes/clipSec — video+audio+container, the
//     exact quantity the walls see) into localStorage keyed
//     `<format>:<height>` (device class is implicit — the store never
//     leaves this device). Aggregation is the running MAX of run averages:
//     monotone conservative (content variance can only SHRINK a budget,
//     never inflate one) and trivially red-proofable. Runs shorter than
//     BUDGET_CAL_MIN_SEC don't calibrate (a keyframe-dominated 1 s clip
//     would overstate the steady rate), and samples outside
//     [BUDGET_BPS_MIN, BUDGET_BPS_MAX] are refused on BOTH write and read
//     (a corrupt/poisoned store must floor, never derive).
//   • ONE derivation: exportBudgetSec below is the only place the
//     seconds arithmetic exists. playback.js's schedule builder + its
//     planFits/plannedMontage mirrors consume it through the
//     window.__export.exportBudget seam, and renderDrill consumes the SAME
//     derived number via opts.budgetSec (fixed at plan time — never
//     re-clamped mid-export).
//   • WALL selection: a webm plan on a Photos-capable shell must survive
//     the GH-252 webm→mp4 transcode (playback.js TRANSCODE_MAX_BYTES,
//     192 MiB in-memory budget); every other delivery is bounded by the
//     384 MiB save-wire envelope (share-bridge.md §3). Both constants are
//     documented mirrors (the export.js/playback.js/transcode.js
//     precedent); the walls themselves stay enforced downstream
//     (sizeOk/destsFor) — the budget makes plans that fit them, it does
//     not replace them.
//   • HONEST FLOOR: no measurement → exactly CLIP_CAP_SEC. Never a larger
//     guess (the nominal encoder bitrate is a config request, not a
//     measurement — it is deliberately NOT used as a fallback).
export const BYTEBUDGET_CAPABLE = true;
export const BUDGET_SAFETY = 0.85; // conservative headroom on the wall
// share-bridge.md §3 ShareMessage.maxBytes mirror (playback.js
// BRIDGE_MAX_BYTES / export.js SHARE_MAX_BYTES carry the same literal)
const BUDGET_WIRE_BYTES = 384 * 1024 * 1024;
// playback.js TRANSCODE_MAX_BYTES mirror (review GH-252 round-6 P1: the
// transcode's in-memory budget — the wall a webm must clear to earn Photos)
const BUDGET_TRANSCODE_BYTES = 192 * 1024 * 1024;
// The transcode RE-ENCODE rate (transcode.js createSink: video 8e6 + audio
// 128e3 bits/s — the record.js quality-parity re-encode), padded 2% for
// mux overhead. The webm→Photos path DELIVERS the transcoded mp4, so its
// duration must clear the wire envelope at THIS rate too, not just the
// webm source at the in-memory wall (review GH-304 round-2 P2: a very
// low-rate webm could otherwise budget ~570 s whose mp4 exceeds 384 MiB
// and Photos fails after rendering AND transcoding).
const BUDGET_TRANSCODE_OUT_BPS = (8e6 + 128e3) / 8 * 1.02;
// export.js BITRATES mirror (the ruled per-height encoder bitrate request,
// identical for the avc and vp9 sinks) + the 128 kbps audio track — the
// NOMINAL whole-file rate the encoder is CONFIGURED for. A measured-average
// calibration is NOT an upper bound (review round-5 P1: a low-motion first
// sample undershoots a later dynamic montage at the same config), so every
// wall below is priced at the WORSE of the measured and nominal rates —
// the measurement can only TIGHTEN a budget (an overshooting encoder),
// never loosen it past what the configured rate could produce against a
// hard wall. Calibration still gates the whole derivation: uncalibrated
// devices stay on the 60 s floor.
function budgetNominalBps(height) {
  const video = { 720: 8e6, 1080: 12e6, 1440: 24e6, 2160: 40e6 }[height]
    ?? Math.round(12e6 * (height / 1080) ** 2);
  return video / 8 + 16_000;
}
// The ruled in-memory OUTPUT ceiling (the video-export design note (internal) memory
// ruling: "a 60 s 4K clip is ~300 MB — still acceptable"): the accepted
// worst-case FILE whose finalize transient — the muxer's power-of-two
// backing buffer PLUS the exact-size target.buffer slice, ≤ 3× the file —
// the shipped design already carries and devices already survive. Budgets
// must not grow files past the acceptance that transient rode on (review
// round-7 P1: a 341 MB file's finalize peaks ~837 MiB). At the nominal 4K
// rate this ceiling reproduces the pre-304 60 s acceptance exactly.
const BUDGET_FILE_CEILING = 300e6;
const BUDGET_STORE_KEY = 'ob-export-bps-v1';
export const BUDGET_CAL_MIN_SEC = 3; // shorter runs don't calibrate
// sanity window on stored/measured rates, bytes per second: 16 kB/s
// (128 kbps — below any real video) … 64 MB/s (512 Mbps — far above the
// 40 Mbps 4K tier plus audio). Outside it the store reads as ABSENT.
const BUDGET_BPS_MIN = 16_000;
const BUDGET_BPS_MAX = 64_000_000;

function readBudgetBps(format, height) {
  try {
    const m = JSON.parse(localStorage.getItem(BUDGET_STORE_KEY) ?? '{}');
    const v = Number(m?.[`${format}:${height}`]?.Bps);
    return v >= BUDGET_BPS_MIN && v <= BUDGET_BPS_MAX ? v : null;
  } catch { return null; } // corrupt store / storage refusal → floor
}

/** Calibration write (renderTimeline success path only — a failed or
 * aborted run measures nothing). Whole-file rate, MAX-aggregated. */
function recordBudgetBps(format, height, bytes, sec) {
  if (!(sec >= BUDGET_CAL_MIN_SEC) || !(bytes > 0)) return;
  const measured = bytes / sec;
  if (!(measured >= BUDGET_BPS_MIN && measured <= BUDGET_BPS_MAX)) return;
  try {
    const m = JSON.parse(localStorage.getItem(BUDGET_STORE_KEY) ?? '{}');
    const k = `${format}:${height}`;
    const prev = Number(m?.[k]?.Bps);
    const keep = prev >= BUDGET_BPS_MIN && prev <= BUDGET_BPS_MAX ? prev : 0;
    m[k] = { Bps: Math.round(Math.max(keep, measured)),
      n: (Number.isFinite(Number(m?.[k]?.n)) ? Number(m[k].n) : 0) + 1 };
    localStorage.setItem(BUDGET_STORE_KEY, JSON.stringify(m));
  } catch { /* storage refusal (private mode): budgets stay floored */ }
}

/** THE budget derivation (GH-304) — the one copy of the arithmetic.
 * `photos` = a Photos destination could be offered for this plan (the
 * caller's destsFor membership truth); it only matters for webm, where
 * delivery would ride the in-memory transcode. Returns whole seconds:
 * { sec, derived, wall, Bps } — `derived:false` IS the honest floor. */
export function exportBudgetSec({ format, height, photos = false } = {}) {
  const transcoded = format === 'webm' && photos === true;
  const wall = transcoded ? BUDGET_TRANSCODE_BYTES : BUDGET_WIRE_BYTES;
  const Bps = readBudgetBps(format, height);
  if (Bps === null) {
    return { sec: CLIP_CAP_SEC, derived: false, wall, Bps: null };
  }
  // the wall-side rate: never better than the CONFIGURED nominal (review
  // round-5 P1 — see budgetNominalBps); the file itself never past the
  // ruled 300 MB acceptance (BUDGET_FILE_CEILING — no safety discount:
  // the ceiling IS the accepted worst case and the worst-rate pricing is
  // already conservative)
  const worst = Math.max(Bps, budgetNominalBps(height));
  let sec = Math.min(wall * BUDGET_SAFETY, BUDGET_FILE_CEILING) / worst;
  if (transcoded) {
    // the transcode holds TWO live source copies (the retained input Blob
    // AND its blob.arrayBuffer()) beside the OUTPUT's own finalize
    // transient (power-of-two backing ≤ 2× + the exact slice → ≤ 3× the
    // mp4) — so the duration is bounded by the COMBINED allocation
    // against the wire-class envelope, which also subsumes the delivered
    // mp4's own wire fit (review rounds 2-7: undercounting either side
    // admitted 400-500 MB peaks, defeating the in-memory guard the
    // transcode wall exists for)
    sec = Math.min(sec, BUDGET_WIRE_BYTES * BUDGET_SAFETY
      / (2 * worst + 3 * BUDGET_TRANSCODE_OUT_BPS));
  }
  return { sec: Math.max(1, Math.floor(sec)), derived: true, wall, Bps };
}

// ---- feature detection (fallback chain, ruled) ------------------------------
/** { webcodecs, mp4, uhd, webm, webmUhd, floatBlend } — probed once at
 * dialog-open.
 * `mp4` = avc1.640028≤1080p + AAC-LC; `uhd` = avc1.640033 at 4K (4K tiers
 * need it on the mp4 route); `webm` = vp9 + opus at ≤1080p; `webmUhd` =
 * vp09 level 5.1 at 4K — the webm fallback mirrors the mp4 route's
 * dedicated 4K probe, so 4K tiers are only ever OFFERED at a config the
 * encoder actually accepted (ruling: feature-detected at picker-open,
 * not at export-start). `floatBlend` (ADDITIVE, issue #259): whether this
 * GL stack can blend into an rgba32f target (WebGL2 +
 * EXT_color_buffer_float + EXT_float_blend) — the cinematic tier's
 * accumulator requirement; older Android Mali/Adreno lack float blend and
 * fail as black frames with no error. Probed on a scratch context (this
 * module never holds the live renderer); export.js's cinematicOk() gate
 * reads the SAME extensions off the live renderer — this field is the
 * observability mirror. */
export async function detectExportSupport() {
  let floatBlend = false;
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    floatBlend = !!(gl && gl.getExtension('EXT_color_buffer_float')
      && gl.getExtension('EXT_float_blend'));
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch { /* floatBlend stays false */ }
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined'
    || typeof AudioEncoder === 'undefined') {
    return { webcodecs: false, mp4: false, uhd: false, webm: false,
      webmUhd: false, floatBlend };
  }
  const v = async (codec, width, height, bitrate) => {
    try {
      return (await VideoEncoder.isConfigSupported(
        { codec, width, height, bitrate, framerate: 60 })).supported === true;
    } catch { return false; }
  };
  const a = async (codec) => {
    try {
      return (await AudioEncoder.isConfigSupported({ codec,
        sampleRate: AUDIO_RATE, numberOfChannels: 2, bitrate: 128_000 }))
        .supported === true;
    } catch { return false; }
  };
  const [avcHd, avcUhd, aac, vp9, vp9Uhd, opus] = await Promise.all([
    v('avc1.640028', 1920, 1080, 12e6), v('avc1.640033', 3840, 2160, 40e6),
    a('mp4a.40.2'), v('vp09.00.10.08', 1920, 1080, 12e6),
    v('vp09.00.51.08', 3840, 2160, 40e6), a('opus')]);
  return { webcodecs: true, mp4: avcHd && aac, uhd: avcUhd,
    webm: vp9 && opus, webmUhd: vp9Uhd && opus, floatBlend };
}

// ---- AAC priming delay (measured once per session) ---------------------------
/** The AAC encoder front-loads priming samples (~2112 at 48 kHz, but
 * encoder-implementation-specific — do NOT hardcode it): uncompensated,
 * every impact sound lands ~44 ms behind the visible contact. Measure it
 * by round-tripping a step signal through AudioEncoder → AudioDecoder and
 * locating the onset; createSink then has the (patched, vendored)
 * mp4-muxer write an edts/elst with media_time = delay so players skip
 * the priming. The webm/opus path needs no compensation (OpusHead preSkip
 * is already written and honored). Cached per session. */
const AAC_DELAY_FALLBACK = 2112; // the iTunes-convention priming length
let aacDelayPromise = null;
export function measureAacEncoderDelay() {
  aacDelayPromise ??= (async () => {
    try {
      if (typeof AudioDecoder === 'undefined') return AAC_DELAY_FALLBACK;
      const N = 8192;
      const chunks = [];
      let decoderConfig = null;
      const enc = new AudioEncoder({
        output: (c, meta) => {
          chunks.push(c);
          decoderConfig ??= meta?.decoderConfig ?? null;
        },
        error: () => {},
      });
      enc.configure({ codec: 'mp4a.40.2', sampleRate: AUDIO_RATE,
        numberOfChannels: 2, bitrate: 128_000 });
      const data = new Float32Array(N * 2).fill(1); // step signal at sample 0
      enc.encode(new AudioData({ format: 'f32-planar', sampleRate: AUDIO_RATE,
        numberOfFrames: N, numberOfChannels: 2, timestamp: 0, data }));
      await enc.flush();
      enc.close();
      if (!decoderConfig || !chunks.length) return AAC_DELAY_FALLBACK;
      const out = [];
      const dec = new AudioDecoder({ output: (ad) => out.push(ad),
        error: () => {} });
      dec.configure(decoderConfig);
      for (const c of chunks) dec.decode(c);
      await dec.flush();
      dec.close();
      let base = 0, onset = -1;
      for (const ad of out) {
        if (onset < 0) {
          const buf = new Float32Array(ad.numberOfFrames);
          ad.copyTo(buf, { planeIndex: 0, format: 'f32-planar' });
          const i = buf.findIndex((s) => Math.abs(s) > 0.5); // mid-ramp
          if (i >= 0) onset = base + i;
          base += ad.numberOfFrames;
        }
        ad.close();
      }
      // sanity window: priming is hundreds-to-thousands of samples, < 1 s
      return onset > 0 && onset < AUDIO_RATE ? onset : AAC_DELAY_FALLBACK;
    } catch {
      return AAC_DELAY_FALLBACK;
    }
  })();
  return aacDelayPromise;
}

// ---- grade (single source: tools/render/grade.json) -------------------------
// The node pipeline applies grade.json as an ffmpeg post chain; in-app the
// SAME file drives a curve-LUT + vignette shader on the tonemapped frame
// (grain intentionally dropped in-app — ruling: the reference footage is essentially clean
// and encoders denoise it anyway). web/tools/render is a symlink to the
// repo-root tools/render so both server layouts resolve one file.
// GH-329 (WYSIWYG exposure law — see the EXPORT_TIERS header in export.js):
// NO in-app tier requests spec.grade anymore. The film curve darkened
// delivered clips ~21-24% against the live player bed (the journey-QA
// measured gap; encode legs + color tags proved clean). The pass stays
// spec-driven here for scripted/e2e callers and the single-sourced math.
let gradePromise = null;
export function loadGrade() {
  if (!gradePromise) {
    const p = (async () => {
      const url = new URL('../../tools/render/grade.json', import.meta.url);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`grade.json fetch failed: ${res.status}`);
      const spec = await res.json();
      const pts = spec.curve.trim().split(/\s+/)
        .map((p) => p.split('/').map(Number));
      return { spec, lut: buildCurveLut(pts, 256), vignette: spec.vignette ?? 0 };
    })();
    // memoize SUCCESS only (the synth.js loadSfxBank law): a transient fetch
    // failure must fail THIS render honestly but never poison every later
    // save until a reload — the next loadGrade() call retries the fetch.
    p.catch(() => { if (gradePromise === p) gradePromise = null; });
    gradePromise = p;
  }
  return gradePromise;
}

/** Monotone cubic (Fritsch–Butland) through the curve anchors → N-entry
 * LUT. Monotonicity matters: an overshooting spline would band the cloth
 * gradients the curve exists to deepen. */
export function buildCurveLut(pts, n) {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const k = xs.length;
  const dx = [], m = [];
  for (let i = 0; i < k - 1; i++) {
    dx.push(xs[i + 1] - xs[i]);
    m.push((ys[i + 1] - ys[i]) / dx[i]);
  }
  const t = [m[0]];
  for (let i = 1; i < k - 1; i++) {
    t.push(m[i - 1] * m[i] <= 0 ? 0
      : 2 * m[i - 1] * m[i] / (m[i - 1] + m[i]));
  }
  t.push(m[k - 2]);
  const lut = new Float32Array(n);
  for (let j = 0; j < n; j++) {
    const x = Math.min(xs[k - 1], Math.max(xs[0], j / (n - 1)));
    let i = 0;
    while (i < k - 2 && x > xs[i + 1]) i++;
    const h = dx[i], s = (x - xs[i]) / h;
    const h00 = (1 + 2 * s) * (1 - s) * (1 - s), h10 = s * (1 - s) * (1 - s);
    const h01 = s * s * (3 - 2 * s), h11 = s * s * (s - 1);
    lut[j] = Math.min(1, Math.max(0,
      h00 * ys[i] + h10 * h * t[i] + h01 * ys[i + 1] + h11 * h * t[i + 1]));
  }
  return lut;
}

/** Post-tonemap grade pass: copies the just-rendered canvas into a
 * FramebufferTexture and re-renders it through the curve-LUT + vignette
 * shader (8-bit LUT — the ffmpeg chain grades 8-bit too). Sized per export;
 * dispose() after. */
export function createGradePass(renderer, w, h, grade) {
  const tex = new THREE.FramebufferTexture(w, h);
  const lutData = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    lutData.fill(Math.round(grade.lut[i] * 255), i * 4, i * 4 + 3);
    lutData[i * 4 + 3] = 255;
  }
  const lutTex = new THREE.DataTexture(lutData, 256, 1);
  lutTex.minFilter = lutTex.magFilter = THREE.LinearFilter;
  lutTex.needsUpdate = true;
  const quad = new FullScreenQuad(new THREE.ShaderMaterial({
    uniforms: {
      tSrc: { value: tex }, tLut: { value: lutTex },
      vignette: { value: grade.vignette },
      res: { value: new THREE.Vector2(w, h) },
    },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }',
    // curve as a 1D LUT + the EXACT ffmpeg vignette term the node chain
    // applies (`vignette=angle=a`: factor cos(a·d)^4, d corner-normalized)
    // — record.mjs --grade and this pass stay one grade, two backends
    fragmentShader: `
      uniform sampler2D tSrc; uniform sampler2D tLut;
      uniform float vignette; uniform vec2 res; varying vec2 vUv;
      void main() {
        vec3 c = texture2D( tSrc, vUv ).rgb;
        vec3 u = c * 255.0 / 256.0 + 0.5 / 256.0; // texel centers
        c = vec3( texture2D( tLut, vec2( u.r, 0.5 ) ).r,
                  texture2D( tLut, vec2( u.g, 0.5 ) ).r,
                  texture2D( tLut, vec2( u.b, 0.5 ) ).r );
        float d = length( ( vUv - 0.5 ) * res ) / ( 0.5 * length( res ) );
        float f = cos( vignette * d );
        c *= f * f * f * f;
        gl_FragColor = vec4( c, 1.0 );
      }`,
    depthTest: false, depthWrite: false,
  }));
  return {
    apply() {
      renderer.setRenderTarget(null);
      renderer.copyFramebufferToTexture(tex);
      quad.render(renderer);
    },
    dispose() { tex.dispose(); lutTex.dispose(); quad.material.dispose(); quad.dispose?.(); },
  };
}

// ---- frame grab helpers ------------------------------------------------------
/** FNV-1a 32-bit over a byte array (frame-hash determinism surface). */
export function fnv1aBytes(bytes) {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

// ---- encoder + muxer sink ----------------------------------------------------
/** WebCodecs encoders wired into the ruled container: mp4 = avc1 + AAC-LC
 * (avc1.640028 ≤1080p, avc1.640033 above), webm = vp9 + opus.
 * `audioChannels` follows the SOURCE track (transcode.js feeds demuxed
 * mono/stereo AudioData — a 2-channel-configured AAC encoder rejects mono
 * input, issue #157 two-track review, minor); the export path keeps the
 * stereo default. `firstTimestampBehavior` threads through to the mp4
 * muxer for the transcode path ('cross-track-offset': both tracks share
 * ONE zero so A/V skew survives — issue #157 two-track review, blocker);
 * the export path keeps the muxer's 'strict' default as a determinism
 * tripwire (its timestamps start at 0 by construction).
 * `videoTimescale` (ADDITIVE, issue #197): explicit mp4 video track
 * timescale for VFR input. The default frameRate:60 timescale is EXACT for
 * the offline path (timestamps are exactly k/60) but re-grids the
 * transcode path's realtime-capture timestamps to 1/60 s ticks —
 * dup/short/long stts deltas, the decoded judder the owner reported.
 * transcode.js passes 1e6 (µs — lossless for any WebCodecs timestamp);
 * the export path leaves it unset. Exposed on the sink as a feature
 * marker so a stale pairing is observable.
 * `stream` (ADDITIVE, issue GH-305): { post(data, at) } — the STREAMING
 * full-length sink. The muxer writes into a chunked StreamTarget instead
 * of an ArrayBufferTarget: 1 MiB pieces (data, absolute position — the
 * finalize backpatches are positioned writes) queue page-side and
 * `drainWire()` posts them through `stream.post`, AWAITED — that await is
 * the wire's backpressure, interleaved with the encode by renderTimeline's
 * per-frame drain. Nothing accumulates: the whole-file buffer (the GH-304
 * finalize-transient the 300 MB ceiling exists for) never exists, so the
 * output length is bounded by the DISK the far side writes, not by
 * WebContent memory. finalize() drains the tail (moov + backpatches) and
 * returns the byte EXTENT (a number) instead of a Uint8Array. */
export function createSink({ format, width, height, bitrate, withAudio,
  encoderDelay = 0, audioChannels = 2, firstTimestampBehavior,
  videoTimescale, stream, preferSoftwareVideo = false, creationTime,
  frameGrid }) {
  const isMp4 = format === 'mp4';
  const streaming = typeof stream?.post === 'function';
  const audioCfg = { codec: isMp4 ? 'mp4a.40.2' : 'opus',
    sampleRate: AUDIO_RATE, numberOfChannels: audioChannels, bitrate: 128_000 };
  const videoCfg = { // level strings match the detectExportSupport probes
    codec: isMp4 ? (width > 1920 || height > 1080 ? 'avc1.640033' : 'avc1.640028')
      : (width > 1920 || height > 1080 ? 'vp09.00.51.08' : 'vp09.00.10.08'),
    width, height, bitrate, framerate: 60,
    ...(isMp4 ? { avc: { format: 'avc' } } : {}),
    // GH-362 layer 3: sound-off STREAMED exports pin the software encoder
    // when the caller's probe accepted it (renderTimeline) — measured on
    // the pinned shell: hardware AVC (VideoToolbox) is NOT bit-reproducible
    // across runs (rate-control state; same length, different bytes every
    // run) while prefer-software AVC and VP9 are. Bit-reproducible encode
    // is what lets a crash-resume re-render reproduce the flushed prefix
    // byte-exactly (the fast-forward law); everything else keeps the
    // platform default untouched.
    ...(preferSoftwareVideo ? { hardwareAcceleration: 'prefer-software' } : {}),
  };
  // GH-305 streaming sink state: queued wire pieces + the running extent
  // (max position+length — the number the v3 wire's `end.bytes` exactness
  // law checks against the shell's own disk extent).
  let extent = 0;
  const wireQ = streaming ? [] : null;
  // `frame` (GH-362 layer 3, ADDITIVE): the k-loop's output frame index at
  // drain time, forwarded to the consumer as post()'s third argument — the
  // shell's resume manifest records it beside each flushed chunk (an
  // informational progress anchor; correctness rides the byte extent). A
  // stale playback.js simply ignores the extra argument, and a stale copy
  // of THIS module never passes it — both degrade to "no resume offer".
  const drainWire = streaming ? async (frame) => {
    while (wireQ.length) {
      const piece = wireQ.shift();
      // awaited = the wire backpressure (one piece in flight, ever); a
      // refused post throws out of the render loop — the honest failure
      await stream.post(piece.data, piece.at, frame);
    }
  } : null;
  const target = streaming
    ? new (isMp4 ? Mp4Stream : WebmStream)({
      onData: (data, position) => {
        // COPY the piece: chunked StreamTarget hands its own chunk backing
        // store, which the muxer recycles after the callback returns
        wireQ.push({ data: data.slice(), at: position });
        extent = Math.max(extent, position + data.length);
      },
      // 256 KiB pieces: small enough that a piece maps 1:1 under the
      // shell wire's 768 KiB chunk cap AND that pieces flush DURING even
      // a short encode (the interleaving law — a 1 MiB granularity left a
      // sub-MiB file flushing entirely at finalize, gated by e2e-export
      // FULL1), large enough that wire round-trips stay rare next to the
      // encode cost (~one piece per 170 ms of 1080p output).
      chunked: true, chunkSize: 1 << 18,
    })
    : (isMp4 ? new Mp4Target() : new WebmTarget());
  // fastStart: false — samples stream into the writer as they arrive and
  // moov lands at file END. 'in-memory' would retain every media chunk
  // until finalize AND assemble the file in a second buffer (~2× peak JS
  // heap at the 60 s 4K worst case, ~300 MB file); progressive-download
  // seek is irrelevant for a local download.
  const muxer = isMp4
    ? new Mp4Muxer({ target, fastStart: false,
      // GH-362 layer 3 (vendored-muxer patch, streaming sinks only): pin
      // the mvhd/tkhd/mdhd creation stamp — the ONE wall-clock byte source
      // in the container. The crash-resume law is byte-identity between a
      // re-render and the flushed original (and its e2e proof compares
      // full files against an uninterrupted control); a Date.now() stamp
      // in moov would break both a finalize-straddling resume and the
      // proof. The CARD plan carries the export's real begin time (review
      // r8 P2 — captured once at begin, replayed by every re-render, so
      // metadata consumers see the honest date). An UNSTAMPED streaming
      // spec keeps the upstream wall-clock stamp (review r17 P2: a stale
      // playback.js never sends the field, and pinning epoch 0 there
      // would show 1970 metadata — the stale-pairing degrade must be the
      // pre-layer-3 behavior); determinism riders (the card, the e2e
      // fabricated plans) always carry the stamp in the plan, and the
      // pre-finalize PREFIX contains no stamp bytes either way, so the
      // boundary hash never depends on it. Buffered sinks are untouched.
      ...(streaming && Number.isFinite(creationTime)
        ? { creationTime: Math.floor(creationTime) } : {}),
      video: { codec: 'avc', width, height, frameRate: 60,
        // #197: explicit timescale (vendored-muxer patch) — outranks the
        // frameRate-derived 60; undefined keeps the exact offline grid
        ...(videoTimescale ? { timescale: videoTimescale } : {}) },
      // encoderDelay → edts/elst (vendored-muxer patch): players skip the
      // AAC priming so the t=0 cue tick sounds AT the visible contact
      audio: withAudio ? { codec: 'aac', sampleRate: AUDIO_RATE,
        numberOfChannels: audioChannels, encoderDelay } : undefined,
      ...(firstTimestampBehavior ? { firstTimestampBehavior } : {}) })
    : new WebmMuxer({ target,
      video: { codec: 'V_VP9', width, height, frameRate: 60 },
      audio: withAudio ? { codec: 'A_OPUS',
        sampleRate: AUDIO_RATE, numberOfChannels: audioChannels } : undefined });
  let encodeError = null;
  let lastOutput = 0; // performance.now() of the last encoder output — the
  // finalize watchdog's liveness surface (issue #51 review F2)
  let videoChunks = 0; // chunks the MUXER accepted per track — the honesty
  let audioChunks = 0; // surface transcode.js reads (a track that muxed
  // ZERO samples must fail the job, never ship a track-stripped file) AND
  // the feature marker for the two-track-safe sink (issue #157 review)
  const onError = (e) => { encodeError = encodeError ?? e; };
  // ---- GH-472: the frame-exact pause seam's sink half (frameGrid only) ------
  // `frameGrid` (ADDITIVE; renderTimeline passes 60, transcode.js never
  // does) arms per-frame bookkeeping on the offline path's exact PTS grid
  // (timestamp = round(idx·1e6/60) — invertible below any real clip
  // length):
  //   videoContig — the length of the CONTIGUOUS muxed frame prefix. A
  //     platform encoder that silently surrenders in-flight frames during
  //     a background transition (the owner's 5804/5806 report) leaves
  //     contig at the FIRST lost frame while the raw chunk count keeps
  //     climbing — the exact watermark the render's hidden-edge drain
  //     rewinds to.
  //   drain guard — between armDrainGuard() (the hidden edge) and
  //     settleDrainGuard() (the flush barrier), chunks PAST a gap are
  //     PARKED instead of muxed: muxer timestamps are append-monotonic,
  //     so a post-gap chunk that reached the muxer would make the gap
  //     unrepairable in place (the re-fed frame would rewind the
  //     timeline). A no-loss drain never parks anything (idx == contig
  //     muxes straight through, order preserved); a lossy drain's parked
  //     chunks are DISCARDED at settle — the render re-feeds those frames
  //     from the rewind watermark with a fresh keyframe (their old
  //     bitstream referenced pictures the decoder will never see).
  //   GH-997 auto-guard — a gap that opens with NO drain latched (a
  //     platform drop with no visibility edge at all, or a WKWebView thaw
  //     that runs the queued encoder outputs BEFORE the queued
  //     visibilitychange task) arms the same guard at its FIRST post-gap
  //     arrival, so no post-gap chunk ever reaches the muxer unjudged;
  //     `holePending` tells the render loop to drain + judge it at the
  //     next frame top (pre-997 those chunks muxed straight through and
  //     the hole was only found — unrepairable — at the delivery wall).
  //   GH-997 holds — a hole the render cannot re-encode is HELD instead
  //     of lost: the muxer derives each sample's duration from the next
  //     sample's timestamp (mp4 stts delta, webm block timestamps), so the
  //     frame before the hole stays on screen across it and A/V sync is
  //     kept. videoHeld/holes record every held frame; videoContig then
  //     means "frames accounted" (muxed + held).
  // Grid-less sinks (transcode) are byte-identical to pre-472.
  let videoContig = 0;
  let drainGuard = false;
  const parkedChunks = frameGrid ? new Map() : null;
  let videoHeld = 0;
  const holes = [];
  // muxer add calls are WRAPPED: a muxer throw (timestamp validation,
  // finalized target) fires INSIDE a WebCodecs output callback where it
  // never propagates to any caller — unwrapped it surfaces only as an
  // uncaught window error while finalize() still returns bytes, i.e. a
  // SILENT track drop (issue #157 two-track review, blocker). Caught, it
  // lands in sink.error, which every consumer already checks.
  const muxVideo = (chunk, meta) => {
    try {
      muxer.addVideoChunk(chunk, meta);
      videoChunks++;
    } catch (e) { encodeError = encodeError ?? e; }
  };
  const video = new VideoEncoder({ error: onError,
    output: (chunk, meta) => {
      lastOutput = performance.now();
      if (!frameGrid) { muxVideo(chunk, meta); return; }
      const idx = Math.round(chunk.timestamp * frameGrid / 1e6);
      if (idx < videoContig) {
        // stale duplicate: a chunk for a frame the muxer already holds —
        // only reachable when a rewind re-fed frames whose ORIGINAL
        // outputs arrived after the flush barrier resolved (a flush-
        // semantics violation, or an encoder that reorders across a
        // flush). Muxing it would walk the DTS backwards and hard-fail
        // the muxer; dropping it keeps the per-frame accounting exact —
        // the delivery wall still refuses any genuinely short file.
        return;
      }
      if (idx > videoContig) drainGuard = true; // GH-997 auto-guard
      if (drainGuard && idx !== videoContig) {
        parkedChunks.set(idx, { chunk, meta }); // judged at the barrier
        return;
      }
      // idx === videoContig here: lower indices returned above and higher
      // ones parked, so nothing out of order ever reaches the muxer
      muxVideo(chunk, meta);
      videoContig++;
      // a guard-time contig advance releases parked successors in order
      while (drainGuard && parkedChunks.has(videoContig)) {
        const p = parkedChunks.get(videoContig);
        parkedChunks.delete(videoContig);
        muxVideo(p.chunk, p.meta);
        videoContig++;
      }
    } });
  video.configure(videoCfg);
  let audio = null;
  // GH-373 (review r3 P1): the MUXED audio position in µs (end of the last
  // chunk the muxer accepted) — the output-progress surface the windowed
  // feed paces on and the finalize delivery wall reads. Same-module
  // consumer only (renderTimeline below), so no cross-module staleness.
  let audioUs = 0;
  if (withAudio) {
    audio = new AudioEncoder({ error: onError,
      output: (chunk, meta) => {
        lastOutput = performance.now();
        try {
          muxer.addAudioChunk(chunk, meta);
          audioChunks++;
          audioUs = Math.max(audioUs, (chunk.timestamp ?? 0)
            + (chunk.duration ?? Math.round(1024 * 1e6 / AUDIO_RATE)));
        } catch (e) { encodeError = encodeError ?? e; }
      } });
    audio.configure(audioCfg);
  }
  /** Close the guard bracket after the flush barrier (`fed` = the
   * render's fed count; GH-997). `discard: true`
   * (the REWIND path) drops the parked post-gap chunks — the caller
   * re-renders those frames with a fresh keyframe. `discard: false`
   * (every stand-down: no loss, unrepairable hole, impure-camera span)
   * RELEASES them to the muxer in frame order instead — the file keeps
   * every frame the encoder delivered, and (GH-997) each hole in front
   * of a released chunk is HELD and recorded (pre-997 it stayed a deficit
   * the delivery wall refused). Arrival order is monotonic on this
   * pipeline, so releases never walk the DTS back. */
  const settleDrainGuard = !frameGrid ? undefined : ({ discard = false,
    fed = Infinity } = {}) => {
    drainGuard = false;
    const parked = [...parkedChunks.entries()].sort((a, b) => a[0] - b[0]);
    parkedChunks.clear();
    if (discard) return parked.length;
    // GH-997: a parked index at or past the render's fed count cannot
    // belong to this feed — a pre-rewind output that slipped past the
    // flush barrier; released, it would be HELD in as a hole and the
    // re-fed frames before it dropped as stale
    const live = parked.filter(([idx]) => idx < fed);
    if (!live.length) return 0;
    // review GH-997 r1 P2: a parked successor of a hole can REFERENCE the
    // surrendered picture (a platform that encoded it and lost only the
    // output — measured: one missing VP9 output altered 44 decoded
    // successors with the packet/frame counts still matching). Release
    // only from the first parked KEYFRAME on; every frame before it — the
    // hole plus the unsafe deltas — is HELD, so a multi-frame run reaches
    // the delivery policy (refusal + salvage) instead of decode damage.
    // No parked keyframe: hold through the last fed frame (the caller
    // forces the next fed frame to a keyframe).
    const k = live.findIndex(([, p]) => p.chunk.type === 'key');
    if (k < 0) {
      const end = Number.isFinite(fed) ? fed : live[live.length - 1][0] + 1;
      if (end > videoContig) hold(end - videoContig);
      return 0;
    }
    for (const [idx, p] of live.slice(k)) {
      if (idx > videoContig) hold(idx - videoContig);
      muxVideo(p.chunk, p.meta);
      videoContig++;
    }
    return 0;
  };
  /** Account the next `n` frames at the watermark as HELD (adjacent holes
   * merge into one run — the delivery policy judges runs). */
  function hold(n) {
    const last = holes[holes.length - 1];
    if (last && last.at + last.n === videoContig) last.n += n;
    else holes.push({ at: videoContig, n });
    videoHeld += n;
    videoContig += n;
  }
  return {
    video, audio,
    get error() { return encodeError; },
    get lastOutput() { return lastOutput; },
    get videoChunks() { return videoChunks; },
    get audioChunks() { return audioChunks; },
    get audioUs() { return audioUs; }, // GH-373: muxed audio end position
    // GH-472: the contiguous muxed frame prefix — the rewind watermark —
    // plus the drain-guard bracket. LITERAL members, never spread in (an
    // object spread evaluates getters at spread time and would freeze the
    // watermark at 0). The bracket functions exist only on frameGrid
    // sinks (renderTimeline's latchDrain feature-detects them; grid-less
    // sinks — transcode — stay inert with videoContig pinned 0).
    get videoContig() { return videoContig; },
    armDrainGuard: !frameGrid ? undefined : () => { drainGuard = true; },
    settleDrainGuard,
    // GH-997: hold the ONE frame at the watermark (the caller re-renders
    // from the next frame with a fresh keyframe — nothing muxed after the
    // hole can reference the surrendered picture)
    holdFrame: !frameGrid ? undefined : () => hold(1),
    // GH-997: frames HELD over unrepairable holes (each { at, n } — the
    // first held frame index and the run length), and whether a post-gap
    // chunk is parked awaiting the render's judgement
    get videoHeld() { return videoHeld; },
    get holes() { return holes.map((h) => ({ ...h })); },
    get holePending() { return !!parkedChunks?.size; },
    // #197 feature marker: the video track timescale this sink muxes at
    // (undefined = the frameRate-derived default). A STALE offline-render
    // pairing lacks this property — transcode.js degrades honestly (the
    // pre-#197 re-grid, still a playable file, never a corrupt one).
    videoTimescale,
    // GH-305: present ONLY on a streaming sink (renderTimeline feature-
    // detects it — `sink.drainWire?.()` — so the ArrayBufferTarget path
    // stays byte-identical).
    ...(streaming ? { drainWire } : {}),
    async finalize() {
      await video.flush();
      if (audio) await audio.flush();
      if (encodeError) throw encodeError;
      // GH-997 belt: a gap that opened inside this final flush has no
      // frame top left to judge it — hold it rather than drop the parked
      // tail (renderTimeline's mandatory end drain normally leaves
      // nothing in flight here)
      if (parkedChunks?.size) settleDrainGuard();
      muxer.finalize();
      if (streaming) {
        // the tail: the last partial chunk, moov, and every positioned
        // backpatch (mp4 mdat size / webm SeekHead+Duration) — drained
        // through the same awaited wire, then the extent IS the file size
        await drainWire();
        return extent;
      }
      return new Uint8Array(target.buffer);
    },
    close() { // cancel path: discard everything, no partial file
      try { video.close(); } catch { /* already closed */ }
      try { audio?.close(); } catch { /* already closed */ }
    },
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// GH-259 (review r2 P1): the ADDITIVE engine capability marker for the
// studio-lighting variant. A FRESH export.js can pair with a CACHED
// pre-GH-259 copy of THIS module whose renderTimeline silently ignores
// spec.cinelight — the export would then succeed WITHOUT the promised
// look. export.js feature-detects this marker through the already-linked
// namespace (dynamic import — rule-5 corollary, never a new static name
// on the boot edge) and throws an honest reload error when it is absent.
export const CINELIGHT_CAPABLE = true;

// GH-275 (review P1): the SAME additive capability-marker contract for the
// scripted per-segment camera directive. A fresh playback.js emits
// `perShotCamera[i] = { script }`, but a CACHED pre-GH-275 copy of THIS
// module dispatches only string presets and `{ track }` — the script
// segment would render on a frozen inherited pose and the export would
// still SUCCEED. export.js's drill entry feature-detects this marker and
// throws the honest reload error instead.
export const CAMSCRIPT_CAPABLE = true;

// GH-299: the same contract for the walk-beat schedule (`opts.beats`). A
// cached pre-GH-299 copy of this module ignores the key silently — the
// export would ship hard cuts where the live player walked, a WYSIWYG lie.
// export.js's drill entry feature-detects this marker and throws the honest
// reload error instead.
export const WALKBEAT_CAPABLE = true;

// GH-301: the same contract for fade transitions (`opts.fades` — dip-to-
// black windows on the OUTPUT clock, composited into the encoded frames).
// A cached pre-GH-301 copy ignores the key silently — the export would ship
// un-faded frames the live player dipped to black, the same WYSIWYG lie.
// export.js's drill entry feature-detects this marker (`fadeCapable`) and
// throws the honest reload error instead.
export const FADE_CAPABLE = true;

// GH-452: the same additive contract for BOUNDARY-anchored fades (fade
// entries carrying `b: 1` — the reset-boundary dip playback.js derives at
// replace-class state discontinuities). A cached pre-GH-452 copy maps the
// entry through the play-relative anchor arithmetic and dips at the END of
// the lead instead of at the boundary the live player dips on. playback.js
// gates DERIVING the schedule on this marker (via export.js
// `resetFadeCapable` — the GH-363 leadInCapable shape), so a stale engine
// anywhere in the chain degrades BOTH surfaces to the recorded pre-452
// hard cut instead of diverging.
export const RESETFADE_CAPABLE = true;

// GH-305: the same additive capability-marker contract for the STREAMING
// full-length sink (`opts.stream` — mux straight onto the v3 save wire
// during encode; no montage cap, no whole-file buffer). A cached pre-GH-305
// copy of this module ignores the key silently — the export would
// accumulate the whole file in memory AND montage-compress a session the
// card promised 1:1, then "succeed". export.js's drill entry
// feature-detects this marker and throws the honest reload error instead.
export const FULLSTREAM_CAPABLE = true;

// GH-362 layer 3: the same additive capability-marker contract for the
// wire-frame plumb (`stream.post(data, at, frame)` — the third argument
// the crash-grade resume manifest records). A cached pre-layer-3 copy of
// this module posts two arguments only; playback.js checks this marker
// before persisting a resume plan or riding plan/frame onto the chunk
// ops, so a stale engine degrades to exactly the pre-layer-3 wire (no
// manifest, no resume offer) instead of a manifest that never updates.
export const RESUMEFRAME_CAPABLE = true;

// GH-305 v1 with-sound wall (review round-3 P1), LIFTED by GH-373: with a
// fresh export-audio.js the streamed path renders the bed in exact-state
// windows (renderDrillAudioWindowed — O(window) transient, no boundary
// clicks by construction) and with-sound plans answer only to the wire's
// extent cap like silent ones. The 390 s number REMAINS as the
// STALE-PAIRING wall: a cached pre-373 export-audio.js still builds ONE
// whole-session AudioBuffer (~0.38 MB/s of output, worst-case ~2× while
// the encoder queue drains its AudioData clones — priced against the
// ruled 300 MB in-memory acceptance, the video-export design note (internal)), so
// renderDrill keeps the plan-time refusal for exactly that pairing.
// playback.js fullFits() mirrors the number behind the SAME capability
// truth (__export.fullAudioWindowed ← fullAudioWindowCapable below).
export const FULLSTREAM_AUDIO_CAP_SEC = 390;

// GH-373: the windowed-bed capability — a FUNCTION, not a constant marker,
// because the truth is about the PAIRED export-audio.js at runtime (THIS
// module may be fresh while a cached pre-373 export-audio.js can only
// build the one-piece bed). export.js propagates it additively as
// __export.fullAudioWindowed; playback.js's fullFits keeps the 390 s
// with-sound gate only while it reads false — two-layer honesty: the card
// gates exactly where renderDrill would bail.
export function fullAudioWindowCapable() {
  return typeof exportAudio.renderDrillAudioWindowed === 'function';
}
// GH-435: the windowed-EXACT bed capability — TRUE means a streamed
// with-sound render on THIS runtime takes the byte-reproducible bed
// (renderTimeline's `exactBed` branch), which is what admits sound-on
// software-encoder mp4 plans to the crash-resume fast-forward class
// (playback.js resumeRunInner's gate reads it as __export.fullAudioExact).
// Function-not-constant for the same runtime-pairing reason as
// fullAudioWindowCapable above; a cached pre-435 export-audio.js answers
// false and the with-sound class honestly keeps the restart flow.
export function fullAudioExactCapable() {
  return typeof exportAudio.renderDrillAudioWindowedExact === 'function';
}
// GH-435 review r1 P1: the prefer-software probe, shared by renderTimeline's
// preferSw pin AND the crash-resume plan gate (via __export.swVideoSupported
// → playback.js resumeRunInner). A platform without prefer-software support
// keeps the platform-default HARDWARE encoder — measured nondeterministic
// (rate-control state) — so a fast-forward's boundary hash could never
// verify there; the gate consults THIS exact probe (same codec-string law)
// before spending a whole catch-up render on it, and the render pins the
// same answer on both the original and the resumed run.
export async function swVideoSupported({ format, width, height, bitrate }) {
  try {
    if (typeof VideoEncoder === 'undefined') return false;
    const codec = format === 'mp4'
      ? (width > 1920 || height > 1080 ? 'avc1.640033' : 'avc1.640028')
      : (width > 1920 || height > 1080 ? 'vp09.00.51.08' : 'vp09.00.10.08');
    return (await VideoEncoder.isConfigSupported({ codec, width, height,
      bitrate, framerate: 60, hardwareAcceleration: 'prefer-software',
      ...(format === 'mp4' ? { avc: { format: 'avc' } } : {}) }))
      .supported === true;
  } catch { return false; }
}

// GH-301 §2.4: max dip-to-black alpha over the fade windows at OUTPUT frame
// K — C2 smootherstep up to EXACTLY 1 at the cut frame (each window's `a` is
// the cut's own integer output frame), smootherstep back down. Pure
// arithmetic in (windows, K): byte-stable, chronological or random access.
// Windows clipped by the render/trim range simply evaluate clipped (§2.6).
const fadeSmoother = (u) => (u <= 0 ? 0 : u >= 1 ? 1
  : u * u * u * (u * (6 * u - 15) + 10));
function fadeAlphaAt(fades, K) {
  let a = 0;
  for (const f of fades) {
    if (!(f.h > 0)) continue;
    const u = 1 - Math.abs(K - f.a) / f.h;
    if (u > 0) a = Math.max(a, fadeSmoother(u));
  }
  return a;
}

// GH-364: the same additive capability-marker contract for the strike-point
// teaching plate (`opts.strike` — the cue-ball-face glyph composited into
// exported frames, spec.strike after the cap loop). A cached pre-GH-364 copy
// of this module ignores the key silently — the export would ship plate-less
// frames the live player previewed with the plate armed, the GH-301 WYSIWYG
// lie verbatim. export.js's drill entry feature-detects this marker and
// throws the honest reload error instead.
export const STRIKEGLYPH_CAPABLE = true;

// GH-475: the same contract for the plate's elevation/power annotation
// knobs (`opts.strike.elev/power`) — a cached pre-475 copy of this module
// ignores the fields silently and the export would ship a clean plate the
// live preview annotated (the WYSIWYG lie class again). export.js
// propagates this marker; playback.js mounts the knob rows only against a
// capable chain.
export const STRIKEANNO_CAPABLE = true;

// GH-474 (review r1 P1): the plate's backswing-synchronized WINDOW is a
// TIMING promise with the same mixed-cache exposure, closed from BOTH
// directions:
//   • fresh playback + cached pre-474 engine: this marker (propagated as
//     __export.strikeWindowCapable) gates the LIVE preview's new window —
//     absent, the preview keeps the pre-474 law the stale engine burns;
//   • stale playback + fresh engine: the new window applies only to plans
//     that DECLARE it (`opts.strike.window474` — savePlan emits it; a
//     stale planner never does), so the fresh engine burns exactly the
//     old window that stale preview promised. Persisted/resumed plans
//     carry the flag in their own bytes, so the promise survives the
//     resume flow too.
export const STRIKEWINDOW_CAPABLE = true;

// GH-364 §timing: plate alpha for PLAY-clock frame k of a segment carrying
// a strike entry. TWO windows, split by the lead grammar (GH-474):
//   • lead-CARRYING segments (st.kBack finite, < 0 — the engine-probed
//     first-backswing frame): the plate fades in WITH the first backswing
//     (C2 ramp over st.hFrames, first visible frame == the backswing
//     frame) and hides AT the strike (C2 bow-out ENDING at play frame 0 —
//     the contact frame ships clean). It never shows during transitions:
//     walk beats gate at the call site, and the address frames before the
//     backswing paint nothing.
//   • lead-less segments: the pre-474 teaching window byte-identically —
//     1 from the segment's first frame through the impact frame (st.kImp,
//     the first frame whose ball seek reaches the record's impact time),
//     then a C2 smootherstep bow-out over st.hFrames (the linger — one
//     settle beat of the timeline's own cadence, renderDrill's innerTail
//     on the OUTPUT clock; playback.js INNER_TAIL is the live mirror).
// Pure arithmetic in (entry, k): byte-stable, chronological or random
// access. Walk-beat frames are gated to 0 AT THE CALL SITE (the k-loop's
// beatFrame — the staged balls there belong to the NEXT record, whose own
// segment re-shows its plate).
function strikeAlphaAt(st, k) {
  if (Number.isFinite(st.kBack) && st.kBack < 0) {
    if (k < st.kBack || k >= 0) return 0;
    return Math.min(fadeSmoother((k - st.kBack + 1) / st.hFrames),
      fadeSmoother(-k / st.hFrames));
  }
  if (k <= st.kImp) return 1;
  return 1 - fadeSmoother((k - st.kImp) / st.hFrames);
}

// ---- encoder-liveness bounds (issue #258) ------------------------------------
// N for the in-loop stall watchdog: the GH-51 realtime path's measured
// WebKit VideoToolbox soft spot (transcode.js WATCHDOG_MS = 15 s) — same
// encoder stack, same accepts-then-goes-silent signature. See the k-loop
// backpressure comment in renderTimeline for the full detector design.
export const STALL_WATCHDOG_MS = 15_000;
// GH-997: how long a drain barrier waits (visible time) for late encoder
// outputs before judging a deficit lossy — a flush() that resolves a beat
// before its last output callbacks is a platform slip, not a loss.
export const LATE_OUTPUT_GRACE_MS = 250;
// GH-997 delivery policy: a frame the render could not re-encode is HELD
// (the previous frame stays on screen across the hole — see createSink).
// A hold ships silently only when every hole is ISOLATED (one frame) and
// the run holds at most holdCap(frames) of them (≤ 0.1 %, floor 1 so a
// short clip can still absorb one isolated drop); anything more would
// visibly stutter, and the delivery wall refuses it with a salvage offer.
export const HOLD_RUN_MAX = 1;
export const holdCap = (frames) => Math.max(1, Math.floor(frames / 1000));
// Ceiling on frames FED but not yet MUXED (encoder-retained raw clones):
// bounds process memory when a wedged encoder keeps consuming input
// silently. RESOLUTION-AWARE (review r1 P2): a fixed 30 would retain
// ~1 GB of RGBA clones at 4K before feeding stops — budget bytes instead,
// clamped [8, 30]. The floor comfortably covers real reorder windows
// (VideoToolbox B-frame windows are single-digit; Chrome pins libvpx
// lag-in-frames to 0), and a healthy encoder that pipelines deeper just
// PACES here — its chunks keep resetting the watchdog, so the cap costs
// throughput at worst, never a false abort.
export const INFLIGHT_BUDGET_BYTES = 128e6;
export const inflightMax = (w, h) =>
  Math.max(8, Math.min(30, Math.floor(INFLIGHT_BUDGET_BYTES / (w * h * 4))));

/** Localized stall/truncation failures with a STALE-DICTIONARY fallback
 * (review r1 P2): a fresh module paired with cached pre-#258 locale JSON
 * makes t() return the bare key — fall back to readable English rather
 * than painting "export failed: export.encoderStalled". */
function encoderFailure(key, params, fallback) {
  const m = i18nT(key, params);
  return new Error(m === key ? fallback : m);
}
const stallError = (s) => encoderFailure('export.encoderStalled', { s },
  `video encoder stalled (no output for ${s} s) — no file written`);
// GH-373 (review r2 P1): the windowed-bed feed's own stall failure — same
// class, its own honest copy (key ×7; the stale-dictionary fallback law)
const audioStallError = (s) => encoderFailure('export.audioEncoderStalled',
  { s }, `audio encoder stalled (no output for ${s} s) — no file written`);
// GH-373 (review r3 P1): the windowed bed's audio-delivery wall — the
// truncatedError analog ({got}/{want} in seconds of muxed sound)
const audioTruncatedError = (got, want) => encoderFailure(
  'export.audioEncoderTruncated', { got, want },
  `audio encoder dropped sound (${got} of ${want} s delivered) — no file written`);
// GH-1024: the no-shot refusal speaks the dialog's own "play a shot first"
// copy (it was the raw English "no shot to export yet" under export.failed)
const noShotError = () => encoderFailure('export.playFirst', {},
  'no shot to export yet');
const truncatedError = (got, want) => encoderFailure('export.encoderTruncated',
  { got, want },
  `video encoder dropped frames (${got} of ${want} delivered) — no file written`);

// ---- design 277 slice 3 PR-2: the post-strike cue in offline renders ----------
// The cue engine (web/app/cuepost.js) is a pure function of the emitted
// 'frame' clock, so once a segment ARMS its staged record's spec the cue
// rides every rendered frame — including the shutter accumulator's
// sub-frames (renderAccum emits 'frame' per sub-frame, so the cue wears
// real motion blur) and the settle tail (untrimmed tails advance the frame
// clock past the record end, which is exactly where the withdrawal lives).
// Everything reaches the engine through the __test trampolines,
// feature-detected (rule 5): a stale main.js / cuepostlive.js / cuepost.js
// renders the pre-277 export — the same degrade the live player shows on
// the same stale cache, so live and export stay consistent.

/** Disarm every standing cue arm before the renderer takes the bed: through
 * the LANE first (ownership bookkeeping clears with the engine arm —
 * reconciliation review r2 P2), then the engine level for non-lane arms.
 * Exported shape-free helper: runExport/renderDrill call it BEFORE their
 * cue-tail probes so a probe can never replace (and strand) a live arm. */
function disarmCueForRender() {
  try {
    window.__test.cuePostLive?.disarm?.('offline render');
    window.__test.cuePost?.(null);
  } catch { /* stale seam */ }
}

/** The live lane's THETA-BUMP refusal, mirrored (cuepostlive.js arm() —
 * keep the tolerance/units equivalent when editing either): a plan whose
 * resolved elevation differs from the fired theta was REFUSED live (the
 * no-pop law), so a current-shot export must not add the raised cue the
 * player never saw (review r7 P2). The DVR keeps bumped plans on purpose
 * (the player has no aim cue to hand off from), so only `livePolicy`
 * surfaces apply this. */
function liveThetaRefused(record, plan) {
  const theta = record?.shot?.theta;
  const thetaR = plan?.bend?.thetaDeg;
  return Number.isFinite(theta)
    && (!Number.isFinite(thetaR)
      || Math.abs(thetaR * Math.PI / 180 - theta) > 1e-6);
}

/** Arm the post-strike cue for `record` (the currently staged segment).
 * Returns true when armed; false = stale seams, engine loading, no spec,
 * or a per-record framing refusal (the engine logs its own console.warn
 * diagnostic) — the segment renders pre-277, the same latched degrade the
 * DVR player shows for that record. On EVERY refusal path the previous
 * segment's arm is explicitly cleared (review r1 P1): the engine's
 * validate-before-disarm contract keeps a standing arm across a rejected
 * spec, and quiet staging emits no state change — without the disarm the
 * PRIOR record's cue would render over the refused segment's balls.
 * `livePolicy` (runExport, the current-shot surface) additionally applies
 * the live lane's theta-bump refusal — see liveThetaRefused.
 * `lead` (GH-363): the pre-strike lead-in descriptor forwarded to the ONE
 * spec builder ({ tier, index, vw0?, clock? } — cuepostlive.js doc); the
 * planner only emits leads for records whose lead probe armed, so a spec
 * the engine rejects here is the same honest pre-277 degrade as ever. */
function armCueFor(record, { livePolicy = false, lead = null } = {}) {
  const tp = window.__test;
  if (typeof tp?.cuePost !== 'function') return false;
  const clear = () => { try { tp.cuePost(null); } catch { /* stale seam */ } };
  try {
    if (tp.cuePostState?.() === null) return false; // engine loading (no arm)
    // escape hatch: a disabled lane means pre-277 EVERYWHERE — the probe
    // returned 0 for the same reason, so geometry and pixels agree
    if (tp.cuePostLive?.state?.()?.enabled === false) return false;
    // two-rig law (review r6 P2): a capture harness may enter runExport /
    // renderDrill with __test.cueStrike armed — disarmCueForRender clears
    // only the cue-post side, and the engine-level cuePost() does not
    // cross-check the strike rig (only the live LANE does), so arming
    // here would render two rods. The strike rig owns the frame.
    if (tp.cueStrikeActive?.() === true) return false;
    const spec = tp.cuePostLive?.specFor?.(record, lead ?? undefined);
    const plan = spec ? tp.cuePost(spec) : false;
    if (plan && livePolicy && liveThetaRefused(record, plan)) {
      clear();
      return false;
    }
    if (!plan) clear();
    return !!plan;
  } catch { clear(); return false; }
}

/** Kernel-seconds of cue life past the record end (tHide − duration,
 * clamped to [0, CUE_TAIL_MAX]) for `record` — the play-time extension
 * that gives the withdrawal frames to play in (the PR-1 deferred review
 * item). Probes by arm+disarm (the engine has no pure plan seam — the
 * arm IS the plan computation); callers must run disarmCueForRender()
 * first so the probe never replaces a standing arm it cannot restore.
 * 0 on any stale/loading seam — the pre-PR-2 plan geometry, the same
 * stand-down the DVR player's timeline applies on the same cache. NOTE
 * no clock split is needed for the tail itself: game.seek clamps the
 * ball sample at the record duration internally, so a plain renderAt(t)
 * past the end holds the settled balls while the 'frame' emission (the
 * clock the cue rides) keeps advancing. */
const CUE_TAIL_MAX = 1.0; // tHide ≤ tRest + 0.6 s by the engine's D4 law
function probeCueTail(record, duration, { livePolicy = false } = {}) {
  const tp = window.__test;
  if (typeof tp?.cuePost !== 'function') return 0;
  try {
    if (tp.cuePostState?.() === null) return 0; // engine loading
    // the setEnabled(false) escape hatch stands the WHOLE cue feature
    // down (review r1 P2): scripted pre-277 baselines keep the pre-PR-2
    // export geometry, never a cue-less blank tail
    if (tp.cuePostLive?.state?.()?.enabled === false) return 0;
    // two-rig law (review r6 P2): armCueFor refuses under an armed strike
    // rig — the geometry must agree with those cue-less pixels
    if (tp.cueStrikeActive?.() === true) return 0;
    const spec = tp.cuePostLive?.specFor?.(record);
    const plan = spec ? tp.cuePost(spec) : false;
    if (!plan) return 0;
    tp.cuePost(null);
    // livePolicy (runExport, review r7 P2): geometry agrees with the
    // live-refused cue-less pixels — see liveThetaRefused
    if (livePolicy && liveThetaRefused(record, plan)) return 0;
    const tail = (plan.tHide ?? 0) - duration;
    return Math.max(0, Math.min(tail, CUE_TAIL_MAX));
  } catch { return 0; }
}

/** GH-474: record-clock seconds (NEGATIVE — before contact) of the FIRST
 * BACKSWING for a lead-carrying segment — engine truth, the probeCueTail
 * arm+disarm idiom over the SAME lead spec the render arms: v2 = the first
 * feather's start (the plan's disclosed practice.start), v1/v1s = the
 * final backswing (plan.from). null on any stale/loading seam — the
 * caller falls back to the lead window start (exact for v2, whose T_pre
 * IS the window under the GH-474 settle law; a degraded hold then rides
 * the whole head — the visible-not-wrong degrade direction). Callers run
 * disarmCueForRender() first (strand safety) and stage the record before
 * probing (the plan clamps against sampler truth). */
function probeLeadBack(record, lead) {
  const tp = window.__test;
  if (typeof tp?.cuePost !== 'function') return null;
  try {
    if (tp.cuePostState?.() === null) return null;
    if (tp.cuePostLive?.state?.()?.enabled === false) return null;
    if (tp.cueStrikeActive?.() === true) return null;
    const spec = tp.cuePostLive?.specFor?.(record,
      { tier: lead.tier, index: lead.index });
    const plan = spec ? tp.cuePost(spec) : false;
    if (!plan) return null;
    tp.cuePost(null);
    const tB = lead.tier === 'v2' && plan.practice?.feathers?.length
      ? plan.practice.start : plan.from;
    const tc = plan.t_contact;
    return Number.isFinite(tB) && Number.isFinite(tc) && tB < tc
      ? tB - tc : null;
  } catch { return null; }
}

// ADDITIVE capability marker (the WALKBEAT_CAPABLE shape): a plan whose
// trims reach INTO a cue tail (endT past the record duration) would be
// silently clamped at the record end by a cached pre-PR-2 offline-render.js
// — export.js propagates this so playback.js can refuse honestly instead
// of shipping a clip shorter than the card promised.
export const CUEPOST_TAIL_CAPABLE = true;

// ADDITIVE capability marker (GH-363, the WALKBEAT_CAPABLE shape): this
// engine plans pre-strike lead-in HEAD frames (planPlayback headSec, the
// segment-head two-clock split, the fused beat-tail cue arm). A cached
// pre-363 offline-render.js would silently render lead-less segments a
// plan priced head frames for — export.js propagates this so playback.js
// plans leads only against a capable engine (and drillRender refuses an
// explicit leads[] plan against a stale one). PROBED, not asserted (review
// 363 r4 P1): a returning browser can pair THIS module with a CACHED
// pre-363 framestep.js whose planPlayback links but ignores headSec —
// exports would then silently drop every head frame a plan priced. The
// pure probe makes the whole chain stand down together on that pairing
// (live schedule + plans + renders — the consistent pre-363 degrade).
export const LEADIN_CAPABLE = (() => {
  try {
    return planPlayback({ duration: 0, headSec: 1, maxSec: 60 })
      ?.headFrames === 60;
  } catch { return false; }
})();

/** Estimate-safe cue tail for the CURRENT record (export.js clipFrames —
 * review r2 P2: the ETA/size quote must price the same tail-extended
 * duration runExport plans, amplified at slow-mo). NEVER disturbs a
 * standing arm: with the engine armed the tail reads off the STANDING
 * plan's tHide (the export-dialog-over-live-playback case — a probe here
 * would visibly kill the live cue); the plan is a per-record approximation
 * only if a harness armed a foreign spec, acceptable for an estimate.
 * Unarmed, the ordinary probe runs (nothing to disturb). Feature-detected
 * by the caller through the namespace import (rule-5 corollary). */
export function cueTailForEstimate(record, duration) {
  const tp = window.__test;
  try {
    const st = tp?.cuePostState?.();
    if (st?.armed && st.plan) {
      return Math.max(0, Math.min((st.plan.tHide ?? 0) - duration,
        CUE_TAIL_MAX));
    }
  } catch { /* stale seam — fall through to the probe */ }
  // the estimate mirrors runExport, the current-shot surface (r7 P2)
  return probeCueTail(record, duration, { livePolicy: true });
}

// ---- the render engine --------------------------------------------------------
/**
 * Render a TIMELINE of playback segments into one video file — the single
 * engine behind runExport (1 segment: the current shot) and renderDrill
 * (N segments: a whole drill stitched; issue #225 Phase B,
 * feature 030 (internal spec)).
 *
 * `timeline`: [{ recordJson, record, duration, camera, speed, startT,
 * endT, tailSec, maxSec }] —
 *   recordJson  ShotRecord JSON to stage for the segment via
 *               game.loadRecord({ stage: 'quiet' }); null = render the
 *               CURRENTLY loaded shot with no staging at all (the
 *               runExport fast path — byte-identical to pre-#225);
 *   record      the parsed record (audio cue derivation);
 *   duration    kernel seconds of the record (planPlayback input);
 *   camera      null = keep the current camera | a camerapresets.js name
 *               (static, applied after staging) | { track: {…} } = the
 *               __track chase rig (advances on machine 'frame' — a pure
 *               function of the frame index under renderAt);
 *   speed       playback rate (slow-mo < 1, montage > 1);
 *   startT/endT kernel-time trim window (endT also CLAMPS the per-frame
 *               seek so tail beats HOLD the out-frame instead of running
 *               past a trim);
 *   tailSec     settled-hold appended after the segment, output seconds;
 *   beat        GH-299 walk-beat marker (renderDrill sets it beside its
 *               beatSec-sized tailSec): the tail frames stage the NEXT
 *               segment's initial state (ball clock 0) while the camera
 *               clock keeps stepping — the two-clock renderAt split;
 *   lead        GH-363 pre-strike lead-in marker { sec, tier, index,
 *               fuse } — round(sec·60) HEAD frames prepend the segment
 *               (fixed output frames at rate 1, the beat mirror image):
 *               ball clock pinned at startT, 'frame' emissions on the
 *               segment's own NEGATIVE clock, so the staged cue feathers
 *               (v2) / holds address (v1) and contact converges on play
 *               frame 0. `fuse` marks a kept walk beat INTO the segment:
 *               the beat tail then arms the STAGED record's cue on the
 *               emission→record clock map (cuepost spec.clock — design
 *               363 §5) instead of the pre-363 disarm. Requires
 *               startT = 0 (a mid-shot trim has no address to lead into
 *               — the planner never emits one; enforced here);
 *   maxSec      per-segment plan cap (runExport: CLIP_CAP_SEC; drill
 *               segments: Infinity — the drill-level montage cap rules).
 *
 * ONE global monotonic frame counter K feeds ONE sink across the segment
 * loop — decoded PTS = 0, 1/60, 2/60, … with structurally no gap/dup at
 * seams. VideoFrame.timestamp = round(K·1e6/60); keyFrame at K%120===0 ||
 * localK===0 (clean cut-boundary seek points, CFR intact). The grade pass,
 * SSAA/hash scratch canvas, accumulator and sink are allocated ONCE across
 * all segments. Audio renders in ONE OfflineAudioContext (renderDrillAudio
 * — feature-detected; the 1-segment current-shot path keeps its exact
 * renderShotAudio call). Aborts (outer segment loop + inner frame loop)
 * produce NO partial file. The finally restores renderer/composer/camera/
 * game on every exit path; multi-segment runs additionally restore the
 * camera pose/fov/orbit rig and re-stage the PRE-EXPORT record with its
 * ORIGINAL object identity (game.loadRecord recordRef) so the post-export
 * RAF settle routes through the replay-identity paths (flow/share/drills
 * lastRecord), never as a fresh shot.
 */
async function renderTimeline(env, timeline, spec, hooks = {}) {
  const { game, machine, renderer, composer, camera, canvas } = env;
  const { signal, onProgress } = hooks;
  if (!game.sampler || !game.record) throw noShotError(); // GH-1024: localized
  // review env-r13 P2 (render determinism contract): an export starting
  // while the deferred snooker transport queue is still draining would
  // see aOccl attributes attach BETWEEN encoded frames and the queue's
  // corrective env re-bake overwrite the shared cube target mid-render
  // (under cinelight: revert() would then restore a MUTATED environment —
  // the #243 plate-drift class). Flush the drain synchronously before
  // frame 0: attributes land and any pending re-bake fires NOW, so the
  // encoded world is frozen. Feature-detected window seam — a stale
  // table.js (synchronous bake) has nothing to flush.
  window.__snkOccl?.flush?.();
  // per-segment frame plans (framestep.js planPlayback — the ONE timeline
  // source; no re-derivation)
  for (const [si, seg] of timeline.entries()) {
    if (!seg.lead) continue;
    // GH-363 honest-throw belt (the beats-validation shape): head frames
    // need the two-clock renderAt seam, and a lead has no meaning on a
    // mid-shot slice (the planner never emits either shape)
    if (window.__test?.twoClock !== true) {
      throw new Error('pre-strike lead-in unavailable (stale main.js — no '
        + 'two-clock renderAt seam) — reload the app');
    }
    if ((seg.startT ?? 0) !== 0 || !Number.isFinite(seg.lead.sec)
      || seg.lead.sec < 0) {
      throw new Error(`renderTimeline: segment ${si} lead is malformed `
        + '(needs finite sec >= 0 and startT = 0)');
    }
  }
  const plans = timeline.map((seg) => planPlayback({
    duration: seg.duration, slowmo: seg.speed ?? 1,
    startT: seg.startT ?? 0, endT: seg.endT ?? null,
    tailSec: seg.tailSec ?? 0, headSec: seg.lead?.sec ?? 0,
    maxSec: seg.maxSec ?? Infinity }));
  const totalFrames = plans.reduce((n, p) => n + p.frames, 0);
  const clipSec = totalFrames / 60;
  const grade = spec.grade ? await loadGrade() : null;
  // GH-364: the strike-plate renderer loads only when a spec.strike entry
  // exists (strike-less specs take the exact pre-364 path — zero
  // perturbation). Guarded DYNAMIC import per the cinelight/renderDrill
  // rule-5 precedent: strikeglyph.js is a leaf that never joins the boot
  // graph, and a stale/missing copy throws an HONEST error inside the try
  // (the finally restores), never a silent plate-less export.
  let strikeDraw = null;
  if (spec.strike?.some(Boolean)) {
    const mod = await import('./strikeglyph.js');
    if (typeof mod.drawStrikePlate !== 'function') {
      throw new Error('strike-point overlay unavailable '
        + '(stale strikeglyph.js) — reload the app');
    }
    strikeDraw = mod.drawStrikePlate;
    // font latch BEFORE frame zero (review r4 P2): plate text renders
    // through the app font stack, and a face still loading would paint
    // fallback glyphs on early frames and webfont glyphs later — a
    // mid-render swap the frame-hash determinism contract cannot carry
    try { await document.fonts?.ready; } catch { /* fallback stack stands */ }
  }
  // audio first (<100 ms, ruling): the muxer interleaves as video arrives.
  // GH-373: STREAMED full-length plans window the bed instead — the
  // whole-session AudioBuffer was the one remaining length-proportional
  // allocation on that path (the v1 with-sound wall). Every whole-bed
  // path below stays byte-identical.
  let audioBuf = null;
  let audioWindows = null; // GH-373 async generator (streamed plans only)
  let exactBed = false; // GH-435: the windowed-EXACT bed is in the byte path
  if (spec.withAudio) {
    if (timeline.length === 1 && !timeline[0].recordJson) {
      // 1-segment current-shot path: the exact pre-#225 call
      audioBuf = await exportAudio.renderShotAudio(game.record,
        { clipSec, rate: timeline[0].speed ?? 1 });
    } else if (typeof exportAudio.renderDrillAudio === 'function') {
      let off = 0;
      const segsA = timeline.map((seg, i) => {
        // GH-363: lead-in head frames are pre-strike silence — the
        // record's audio clock anchors at the segment's PLAY start
        // (offset shifted by headFrames; the window excludes the head)
        const headF = plans[i].headFrames ?? 0;
        const s = { record: seg.record, rate: seg.speed ?? 1,
          startT: seg.startT ?? 0, endT: seg.endT ?? null,
          offsetSec: (off + headF) / 60,
          windowSec: (plans[i].frames - headF) / 60 };
        off += plans[i].frames;
        return s;
      });
      if (spec.stream
        && typeof exportAudio.renderDrillAudioWindowedExact === 'function') {
        // GH-435 windowed-EXACT bed: the GH-373 windows composed from
        // per-cue isolated renders (byte-reproducible across runs/boots —
        // export-audio.js header), same O(window) transient. Streamed
        // with-sound renders take it ALWAYS so the original run and any
        // crash-resume re-render of the same plan produce the same bytes.
        audioWindows = exportAudio.renderDrillAudioWindowedExact(segsA,
          { totalSec: clipSec });
        exactBed = true;
      } else if (spec.stream
        && typeof exportAudio.renderDrillAudioWindowed === 'function') {
        // GH-373 windowed bed: exact-state windows (derived pre-roll, no
        // crossfade — export-audio.js header), fed beside the video loop
        // below so the transient is O(window), never O(session). A stale
        // export-audio.js lacks the generator and falls to the one-piece
        // bed — renderDrill's plan-time wall keeps that pairing honest.
        // (Reached only under a stale pre-435 export-audio.js: byte-CLOSE
        // bed, so the with-sound class honestly stays on the restart flow
        // — fullAudioExactCapable() reads false for the same pairing.)
        audioWindows = exportAudio.renderDrillAudioWindowed(segsA,
          { totalSec: clipSec });
      } else {
        audioBuf = await exportAudio.renderDrillAudio(segsA,
          { totalSec: clipSec });
      }
    } else {
      // rule-5 corollary degrade: a stale cached export-audio.js has no
      // multi-segment renderer — honest error, never a half-voiced file
      throw new Error('drill audio unavailable (stale export-audio.js) — '
        + 'reload the app or pass withAudio: false');
    }
  }
  const withSound = !!audioBuf || !!audioWindows;
  const aacDelay = withSound && spec.format === 'mp4'
    ? await measureAacEncoderDelay() : 0;
  // GH-362 layer 3 — the DETERMINISM CLASS probe, WIDENED by GH-435: a
  // streamed export is bit-reproducible end to end IFF every link is (the
  // render is a pure function of the staged state post-#404; AAC/Opus are
  // measured deterministic; hardware video encoders are NOT — rate-control
  // state). The audio link: the plain OfflineAudioContext bed is measured
  // NOT reproducible (±ulp float-summing jitter — the GH-362 ruling), so
  // pre-435 the class was sound-off only; the GH-435 windowed-EXACT bed
  // (per-cue isolated renders + canonical float32 composition,
  // export-audio.js header) restores byte-reproducibility, so a streamed
  // with-sound render that took it (`exactBed`) joins the class. A
  // with-sound plan on the STALE byte-close bed keeps the platform-default
  // encoder and stays on the crash-resume restart flow. Pin
  // prefer-software when this platform supports it (measured
  // bit-reproducible; hardware rate control is not) — the probe and the
  // bed choice answer identically on the original and the resumed run, so
  // both runs encode the same bytes and the fast-forward's boundary hash
  // can verify.
  let preferSw = false;
  if (spec.stream && (!withSound || exactBed)) {
    preferSw = await swVideoSupported({ format: spec.format,
      width: spec.width, height: spec.height, bitrate: spec.bitrate });
  }
  const sink = createSink({ format: spec.format, width: spec.width,
    height: spec.height, bitrate: spec.bitrate, withAudio: withSound,
    encoderDelay: aacDelay,
    preferSoftwareVideo: preferSw, // GH-362 L3 class pin (GH-435: + exact-bed sound-on)
    creationTime: spec.creationTime, // GH-362 layer 3 (plan-pinned stamp)
    frameGrid: 60, // GH-472: contig watermark + drain guard (offline grid)
    stream: spec.stream }); // GH-305: the streaming full-length sink
  if (audioBuf) {
    // leak audit (#258): this feed runs BEFORE the try below whose catch
    // owns sink.close() — an encode() throw here (closed/errored encoder)
    // must still release the encoders and the just-cloned AudioData, not
    // strand them until GC
    try {
      for (const ad of exportAudio.audioDataChunks(audioBuf)) {
        try { sink.audio.encode(ad); } finally { ad.close(); }
      }
    } catch (e) {
      sink.close();
      throw e;
    }
    // GH-305 memory note: the bed is fully fed — drop the ONE render-side
    // reference so the AudioBuffer (0.38 MB/s of session — the linear
    // transient a full-length export pays on the whole-bed paths) can be
    // collected while the video loop runs. The encoder holds its own
    // AudioData clones and releases them as the muxer drains.
    audioBuf = null;
  }
  // GH-373 windowed feed: pull windows from the generator up to a target
  // GLOBAL audio frame, chunk each (pre-roll dropped, timestamps on the
  // bed clock) and release it — at any instant WebContent holds ONE window
  // buffer (~12.6 MB) plus the encoder's in-flight clones of the same
  // window (≤ ~11.8 MB, drained fast — AAC/opus encode at 200×+ realtime),
  // the O(window) transient the with-sound wall priced against O(session).
  let audioFed = 0;
  let audioDone = audioWindows === null;
  const audioFrames = Math.max(1, Math.ceil(clipSec * AUDIO_RATE));
  // review r2+r3 P1: the O(window) guarantee must be STRUCTURAL, and paced
  // on ENCODER OUTPUT, never on the input queue alone — the encoder holds
  // a CLONE of every fed AudioData (our close() releases only the
  // page-side handle), and the silent-drain stall mode (the k-loop's
  // documented WebKit signature: inputs consumed, no output, no error)
  // keeps encodeQueueSize low while nothing muxes. Before pulling another
  // window, fed-but-not-muxed audio must sit under AUDIO_INFLIGHT_FRAMES
  // (2 s ≈ 0.77 MB of clones — never binding for a healthy encoder at its
  // 200×+ realtime measured rates, and it dwarfs the ~44 ms AAC priming
  // skew in the output timestamps). Liveness keys on MUXED PROGRESS
  // (sink.audioUs), exactly the video watchdog's law: no emitted progress
  // for STALL_WATCHDOG_MS with a pinned backlog = a dead encoder, failed
  // honestly through the existing abort machinery (localized, its own
  // key — the #258 law).
  // GH-362 COMPOSITION (the pause-park boundary): a suspension can land
  // inside THIS wait — the prime feed runs before the k-loop exists, the
  // top-ups inside it, the residual feed after it — so the audio deadline
  // adopts the k-loop wait's own discipline LOCALLY (the GH-362 helpers
  // are k-loop-scoped): hidden time never charges the stall clock, and an
  // own-cadence gap (a 2 ms poll arriving a second late = the clock
  // jumped under it) re-arms rather than charges the frozen interval — a
  // false positive only extends the deadline, the safe direction. A park
  // can never TEAR a window join: each window is pulled and fed
  // atomically in JS (one awaited startRendering + a synchronous chunk
  // loop), a freeze simply thaws mid-statement, and windows are pure
  // functions of the timeline — pausing stays byte-free for the bed
  // exactly as it is for the frames.
  const AUDIO_INFLIGHT_FRAMES = 2 * AUDIO_RATE;
  const muxedFrames = () => Math.round(sink.audioUs * AUDIO_RATE / 1e6);
  const feedAudioTo = audioWindows === null ? null : async (target) => {
    while (!audioDone && audioFed < Math.min(target, audioFrames)) {
      let liveA = muxedFrames();
      let markA = performance.now();
      let lastPollA = 0; // own-cadence anchor (GH-362 composition)
      while (audioFed - muxedFrames() > AUDIO_INFLIGHT_FRAMES) {
        if (signal?.aborted) throw new DOMException('export cancelled', 'AbortError');
        if (sink.error) throw sink.error;
        const nowA = performance.now();
        if (typeof document !== 'undefined' && document.hidden) {
          markA = nowA; // hidden never charges the audio stall deadline
          lastPollA = nowA;
          await sleep(300);
          continue;
        }
        if (lastPollA > 0 && nowA - lastPollA > 1000) {
          markA = nowA; // cadence gap: suspension thawed already-visible
        }
        lastPollA = nowA;
        const e = muxedFrames();
        if (e > liveA) {
          liveA = e;
          markA = nowA;
        } else if (nowA - markA > STALL_WATCHDOG_MS) {
          throw audioStallError(STALL_WATCHDOG_MS / 1000);
        }
        await sleep(2);
      }
      const { value, done } = await audioWindows.next();
      if (done) { audioDone = true; break; }
      for (const ad of exportAudio.audioDataChunks(value.buffer, 1024,
        { baseFrames: value.baseFrames, skipFrames: value.skipFrames,
          frames: value.frames })) {
        try { sink.audio.encode(ad); } finally { ad.close(); }
      }
      audioFed = value.baseFrames + value.frames;
      if (sink.error) throw sink.error;
    }
  };
  if (feedAudioTo) {
    // prime window 0 before the frame loop (the "audio first" interleaving
    // law, window-sized) — guarded exactly like the whole-bed feed above:
    // a throw here runs before the try below whose catch owns sink.close()
    try { await feedAudioTo(1); } catch (e) { sink.close(); throw e; }
  }
  // saved app state (restored in finally — every exit path)
  const size0 = renderer.getSize(new THREE.Vector2());
  const pr0 = renderer.getPixelRatio();
  // composer ratio (GH-263): recorded by scene/postfx.js on __obCine;
  // feature-detected — a stale postfx.js records nothing and ?? 1 restores
  // the pre-fix boot state (cache-poison degrade, OWNERSHIP rule-5 corollary)
  const prC0 = composer.__obCine?.pixelRatio ?? 1;
  const aspect0 = camera.aspect;
  const paused0 = game.paused;
  // multi-segment runs stage OTHER records and write the camera — save the
  // identity/pose anchors so the finally can put the live table back
  // exactly (the 1-segment current-shot wrapper touches neither, keeping
  // its restore sequence byte-identical to pre-#225)
  const anyStage = timeline.some((seg) => seg.recordJson);
  const anyCamera = timeline.some((seg) => seg.camera);
  const orig = anyStage ? {
    record: game.record,
    json: JSON.stringify(game.record),
    phi: game.phi,
    baseQuats: (game.playbackBalls ?? []).map((b) => ({ b, q: b.baseQuat.clone() })),
  } : null;
  const camSaved = anyCamera ? {
    pos: camera.position.clone(), quat: camera.quaternion.clone(),
    fov: camera.fov,
    // orbit rig truth (feature-detected debug handle): without it the
    // first post-export drag would snap the view back to the stale state
    orbit: window.__dbg?.orbit?.state ? {
      target: window.__dbg.orbit.state.target.clone(),
      radius: window.__dbg.orbit.state.radius,
      theta: window.__dbg.orbit.state.theta,
      phi: window.__dbg.orbit.state.phi } : null,
  } : null;
  const ssaa = spec.ssaa ?? 1;
  const rw = 2 * Math.round(spec.width * ssaa / 2);
  const rh = 2 * Math.round(spec.height * ssaa / 2);
  let gradePass = null;
  // GH-362 (review r1 P1) — declared out here so the big finally can clean
  // them: the suspension detectors' listener + heartbeat handles.
  let visListener = null;
  let heartbeatIv = null;
  let cine = null; // installCineLight handle while spec.cinelight (issue #259)
  const hashes = spec.hashFrames ? [] : null;
  let staged = false; // a quiet re-stage happened → the finally must restore
  // GH-404 review r3 (P3): the pre-export fade, restored ONLY on a failed
  // run — a frame-0 staging snap CONSUMED by a render that then throws
  // would otherwise strand the live view dissolving back from the export
  // pose's fade. A SUCCESSFUL run deliberately keeps the export-end fade
  // (byte-identical to the pre-404 behavior, whose per-frame updates also
  // ended there — the live loop's own ramp owns the return).
  let fade0 = null;
  let bailed = false;
  try {
    window.__test.setManual(true); // RAF loop stands down before any await
    fade0 = window.__lampfade?.value?.() ?? null;
    if (machine.state !== 'PLAYBACK') game.replay();
    // design 277 slice 3 PR-1 RECORDED SEAM (review r2 P1), retained in
    // PR-2 as the ENTRY bracket: the replay entry above just armed the
    // LIVE post-strike cue lane (cuepostlive.js keys off `replay: true`),
    // and any standing arm (live lane, DVR, harness) would be STALE the
    // moment the first segment restaged. Disarm THROUGH the lane first so
    // its ownership bookkeeping (ownedArm/plan) clears with the engine
    // arm (reconciliation review r2 P2 — a stranded ownedArm lets the
    // lane's next settle-routed disarm blanket-clear an arm it no longer
    // owns), then the engine-level disarm for the non-lane entries. PR-2:
    // each SEGMENT then arms its own staged record's cue below (WYSIWYG
    // with the live player/DVR), and the finally disarms the render's
    // last arm on every exit path. The REALTIME capture path (export.js)
    // never enters here — it records the live bed, arm and all.
    disarmCueForRender();
    game.paused = true;            // no live sound scheduling, no clock drift
    renderer.setPixelRatio(1);
    // GH-263 WYSIWYG law: pin the COMPOSER ratio too — the live composer
    // follows the renderer's min(dpr, 2) ratio (scene/postfx.js), and
    // composer.setSize multiplies by it, so without this pin export
    // intermediates render at rw×liveDPR: device-DPR-dependent output
    // pixels and 4x the documented GPU memory on retina. Exports must not
    // depend on device DPR or on whether the user resized; spec.ssaa is
    // the only supersample lever.
    composer.setPixelRatio(1);
    renderer.setSize(rw, rh, false); // drawing buffer only; CSS size stays
    composer.setSize(rw, rh);
    camera.aspect = spec.width / spec.height;
    camera.updateProjectionMatrix();
    if (anyCamera) {
      // risk G3 (one camera writer per segment): disarm the scripted rig
      // and the chase rig before the first segment's own directive
      window.__test.cameraScript?.(null);
      window.__track?.stop();
    }
    if (grade) gradePass = createGradePass(renderer, rw, rh, grade);
    // SSAA downscale + hash readback both go through one 2D scratch canvas
    // (GH-301: fade compositing shares it — a faded frame must be drawable;
    // GH-364: the strike plate composites through the same canvas)
    let c2d = null, ctx2d = null;
    if (ssaa > 1 || hashes || spec.fades?.length || spec.strike?.some(Boolean)) {
      c2d = document.createElement('canvas');
      c2d.width = spec.width;
      c2d.height = spec.height;
      ctx2d = c2d.getContext('2d', { willReadFrequently: !!hashes });
      ctx2d.imageSmoothingEnabled = true;
      ctx2d.imageSmoothingQuality = 'high';
    }
    let ema = 0, tPrev = performance.now();
    // per-render in-flight ceiling (see inflightMax): OUTPUT-sized frames
    // are what the encoder retains, so the budget divides by w·h·4.
    // `inflightCap` may WIDEN stepwise up to the hard ceiling for
    // quality-mode lookahead — see the escape branch in the wait loop
    // (review r2 P1). The soft cap is what a healthy streaming encoder ever
    // sees; the hard ceiling is the memory bound under a dead one:
    // soft + clamp(half-a-budget-in-frames, 4, soft) more: floored at +4
    // so the escape stays alive at the 4K floor — where the SOFT cap
    // already exceeds the strict byte budget by design (the
    // deadlock-avoidance floor outranks the budget there), so the
    // widening is capped at the +4 minimum instead of doubling (review r3
    // P1: 2× the floor allowed ~564 MB of clones at 4K; +4 bounds it at
    // ~400 MB, transient and freed on close()) — and ceilinged at +soft
    // so tiny outputs cannot stretch the widening walk past the 15 s
    // deadline (each +4 step costs a 1 s grace).
    const INFLIGHT_MAX = inflightMax(spec.width, spec.height);
    const INFLIGHT_HARD = INFLIGHT_MAX + Math.max(4, Math.min(INFLIGHT_MAX,
      Math.floor(INFLIGHT_BUDGET_BYTES / (2 * spec.width * spec.height * 4))));
    let inflightCap = INFLIGHT_MAX;
    // encoder-liveness clock (review r2 P1: CROSS-FRAME state — a per-wait
    // clock could be strung along for minutes by an encoder dripping one
    // queue slot just under every 15 s). liveMark = the last time the
    // encoder DELIVERED (or the first feed, set at K===0 below — a slow
    // cinema-tier pre-roll must not pre-charge the stall clock).
    let liveMark = performance.now();
    let liveChunks = 0;
    // GH-997 (review r1 P2): THE hold-accounting read — frames the muxer
    // holds plus frames HELD over holes. Every fed-vs-delivered judgement
    // (backpressure, liveness, the drain barrier, the delivery wall) reads
    // this; a held frame is never "in flight" (pre-fix, 13 holds at 4K
    // exceeded the hard in-flight cap of 12 with an empty encoder queue
    // and hit the stall error).
    const accounted = () => sink.videoChunks + (sink.videoHeld ?? 0);
    let flushNudged = false; // one lookahead-flush per stall episode
    // ---- GH-472: the hidden-edge drain (frame-exact pause) ------------------
    // The GH-362 park (below) froze the CLOCKS across a background window
    // but left the encoder's in-flight frames (fed, not yet muxed — up to
    // the inflightMax window) riding the transition. Platform encoders can
    // silently surrender exactly those frames while the app backgrounds
    // (VideoToolbox class: input consumed, output never delivered, no
    // error — the owner's 5804/5806 report on GH-472), and the loss was
    // only discovered thousands of frames later at the delivery wall.
    // The law now: the moment hidden goes true (the visibilitychange edge
    // — event-driven, because a FAST flip can come and go between frame
    // tops), DRAIN the encoder to the muxer (flush()), with the sink's
    // drain guard parking any post-gap chunk so the muxer's append-
    // monotonic timeline stays repairable. The k-loop settles the barrier
    // at the next frame top: every fed frame muxed → nothing happened
    // (byte-identical path); a deficit → REWIND the feed to the sink's
    // contig watermark and re-render exactly the surrendered frames (the
    // first re-fed frame keyframed — parked/discarded chunks referenced
    // pictures the decoder will never see). Latching is idempotent under
    // rapid flips: one drain owns the window; a hide-during-drain rides
    // the same barrier, and a show that supersedes the pause still drains
    // and re-verifies before another frame is fed.
    let drainP = null;       // the in-flight drain (one at a time)
    let drainReady = false;  // its barrier flag (poll-safe)
    const latchDrain = () => {
      if (drainP || typeof sink.armDrainGuard !== 'function') return;
      sink.armDrainGuard();
      drainReady = false;
      drainP = sink.video.flush()
        .catch(() => { /* judged at the barrier; sink.error propagates */ })
        .finally(() => { drainReady = true; });
    };
    // ---- GH-362 layer 2: graceful background pause/resume -------------------
    // iOS freezes WKWebView JS while the app backgrounds — unavoidable —
    // and the shipped behavior on return was a WEDGED export (the owner's
    // build-16 report: encoder deadlines charged for the frozen time fired
    // the moment JS thawed, or the loop spun on an encoder the freeze had
    // wedged). The render is DETERMINISTIC (PTS/hashes are pure functions
    // of K), so pausing is byte-free: the k-loop PARKS at the top of the
    // frame — before any state is touched — while document.hidden, and
    // every encoder-liveness deadline counts VISIBLE time only (the park
    // resets the clocks on resume; the backpressure wait and the finalize
    // watchdog freeze theirs while hidden). hooks.onPause?.(true|false)
    // lets the card/dialog say "paused — resumes automatically" instead of
    // a stuck progress bar. The REALTIME tier keeps its GH-335 fail-fast
    // (a live capture genuinely cannot pause); this is the offline tier.
    const pauseGate = async () => {
      if (typeof document === 'undefined') return;
      if (!document.hidden) {
        // review r2 P2: a suspension can land INSIDE the frame's own awaits
        // (drainWire / the responsiveness sleep(0)) and thaw with hidden
        // already false — consume the latch at every frame entry so the
        // resumed ETA sample never charges the frozen interval to tPrev.
        clearSuspect();
        return;
      }
      latchDrain(); // GH-472 belt: a park always drains first (the event
      // edge is the primary latch; this covers a listener the platform
      // never delivered)
      hooks.onPause?.(true);
      try {
        while (document.hidden) {
          if (signal?.aborted) throw new DOMException('export cancelled', 'AbortError');
          if (sink.error) throw sink.error;
          await sleep(300);
        }
      } finally {
        hooks.onPause?.(false);
      }
      // hidden time never charges the stall deadline or the ETA
      clearSuspect();
      liveMark = performance.now();
      tPrev = performance.now();
    };
    // GH-362 review r1 P1 — the FREEZE BLIND SPOT: a real iOS suspension
    // stops JS exactly while document.hidden is true, so the loops and
    // watchdogs may NEVER observe the hidden state — their next callback
    // runs after visibility is already restored and would charge the whole
    // frozen interval to liveMark/tFlush (an instant stall/flush abort on
    // thaw — the wedge's abort half, one layer deeper). Two independent
    // detectors LATCH the transition instead of sampling current state:
    // the visibilitychange event (WebKit delivers it on thaw) and a
    // monotonic-gap heartbeat (a 1 s tick that arrives > 5 s late knows
    // the clock jumped, event or no event). A false positive only EXTENDS
    // a deadline by one window — the safe direction: watchdogs exist for
    // honesty, and a wrongly-fired abort kills a resumable export.
    let clockSuspect = false;
    let tFlush = performance.now(); // the finalize watchdog's clock — up
    // here so the thaw reset can reach it from every consumer
    const thaw = (now) => { // the ONE deadline-clock reset
      clockSuspect = false;
      liveMark = now;
      tFlush = now;
      tPrev = now;
    };
    const clearSuspect = () => {
      if (!clockSuspect) return false;
      // GH-472 review r3 P1 (belt): the LATCHED suspicion classes (the
      // visibility event, the >5 s heartbeat gap) are real-suspension
      // signals — drain + judge on consumption, covering a platform that
      // delivered no visibility event at all. Per-site cadence gaps
      // (gapThaw) stay drain-free: a 1 s-late poll is often mere jank,
      // and the delivery wall + draft offer remain the belt behind this.
      latchDrain();
      thaw(performance.now());
      return true;
    };
    // review r4 P1 — SYNCHRONOUS detection at the consumer: a resumed
    // pending sleep/tick can run BEFORE the visibilitychange event or the
    // heartbeat's own late tick sets the latch, so each polling site
    // measures its OWN cadence gap — a poll arriving `slackMs` past its
    // cadence means the clock jumped under it (suspension, or jank so
    // extreme the deadline should re-arm anyway; the false-positive cost
    // is one extended watchdog window, the safe direction). The latch
    // (event + heartbeat) stays as the belt for the paths with no tight
    // cadence of their own (the frame entry).
    const gapAnchor = { wait: 0, tick: 0, frame: 0 };
    const gapThaw = (key, slackMs) => {
      const now = performance.now();
      const prev = gapAnchor[key];
      gapAnchor[key] = now;
      if ((prev > 0 && now - prev > slackMs) || clockSuspect) {
        // GH-472 review r4 P2: the LATCHED suspicion classes (visibility
        // event / >5 s heartbeat gap) drain WHEREVER they are consumed —
        // this site included, or a suspension judged inside the
        // backpressure wait would bypass the repair entirely. Pure local
        // cadence gaps stay drain-free (often mere jank; the delivery
        // wall + draft offer remain the belt).
        if (clockSuspect) latchDrain();
        thaw(now);
        return true;
      }
      return false;
    };
    if (typeof document !== 'undefined') {
      visListener = () => {
        clockSuspect = true;
        // GH-472 (+review r3 P1): latch on EVERY visibility edge, not just
        // hidden — WKWebView can freeze JS for the entire hidden interval
        // and deliver the ONE queued event on thaw with document.hidden
        // already false again (the thaw-only shape); the loss, if any, is
        // judged at the barrier either way, and a no-loss drain is
        // content-transparent (flush emits what the encoder already owed).
        latchDrain();
      };
      document.addEventListener('visibilitychange', visListener);
      let hbLast = performance.now();
      heartbeatIv = setInterval(() => {
        const now = performance.now();
        if (now - hbLast > 5000) clockSuspect = true;
        hbLast = now;
      }, 1000);
    }
    let K = 0; // the ONE global frame counter across every segment
    // ---- GH-472: the drain barrier + watermark rewind ------------------------
    // segBase[i] = the global frame index at segment i's first frame — the
    // map a rewind uses to re-enter the segment loop at (segment, local k).
    const segBase = [];
    { let acc = 0; for (const p of plans) { segBase.push(acc); acc += p.frames; } }
    let rewindSi = 0;   // rewind re-entry segment
    let rewindK = 0;    // …and its local frame (kFrom for that ONE segment)
    let forceKey = false; // first re-fed frame after a rewind is an IDR
    let repairs = 0;    // observability: rewinds performed (result field)
    // GH-472 review r2 P2: the luminaire fade is rate-limited PER FRAME —
    // a rewound replay must re-enter frame W with the EXACT fade state W
    // originally rendered under, or the ramp diverges (the OWNERSHIP
    // within-render ramp invariant; a snap to the pose target would pop).
    // One number per frame, ring-sized past the deepest possible rewind
    // (INFLIGHT_HARD + the encoder queue ≤ 64 — see inflightMax); read at
    // the frame top through the same feature-detected seam pair the
    // GH-404 rollback uses (value/force). A stale scene module records
    // null and the rewind falls back to the memoryless snap.
    const FADE_RING = 128;
    const fadeRing = new Array(FADE_RING).fill(null);
    // GH-997: the chase rig's follower state ENTERING each frame, on the
    // same ring — cameratrack.js integrates damping/look-ahead per emitted
    // frame, so a rewind into the MIDDLE of a track segment restores the
    // exact state frame W first rendered under (window.__track snapshot/
    // restore) instead of standing down (pre-997 every track span stood
    // down to the wall — the PS5 law). null = no active rig, or a stale
    // cameratrack.js without the seam: such spans keep the stand-down.
    const trackRing = new Array(FADE_RING).fill(null);
    let trackRestore = null; // { K, s } — applied at the re-fed frame W
    // GH-997 retry budget: a platform that keeps surrendering the SAME
    // frame must not rewind forever — after REWIND_TRIES at one watermark
    // the frame is held (drainBarrier's skip; the watermark only ever
    // advances, so the run terminates without a per-run cap)
    const REWIND_TRIES = 2;
    const rewindTries = new Map();
    let skipping = false; // drainBarrier's hold-and-skip hand-off
    /** Settle a latched hidden-edge drain. null = every fed frame reached
     * the muxer (or nothing was latched, or the case is not in-place
     * repairable) — the render proceeds untouched. A number = the muxed
     * contig watermark W: the caller rewinds the feed to W and re-renders
     * [W, fed) — the frames the platform surrendered at the transition. */
    const drainBarrier = async () => {
      if (!drainP) return null;
      // review GH-472 r1 P1: a wedged encoder can leave the drain flush()
      // pending forever (the silent stall mode — neither drainReady nor
      // sink.error moves), and this wait sits OUTSIDE the k-loop's own
      // watchdog — carry a visible-time deadline of the same class (hidden
      // time never charges — the GH-362 law; an own-cadence gap re-arms —
      // a 2 ms poll arriving a second late means the clock jumped under
      // it). The throw fails through the existing catch (sink closes).
      let mark = performance.now();
      let last = mark;
      while (!drainReady) {
        if (signal?.aborted) throw new DOMException('export cancelled', 'AbortError');
        if (sink.error) throw sink.error;
        const now = performance.now();
        if ((typeof document !== 'undefined' && document.hidden)
          || now - last > 1000) {
          mark = now;
        } else if (now - mark > STALL_WATCHDOG_MS) {
          throw stallError(STALL_WATCHDOG_MS / 1000);
        }
        last = now;
        await sleep(2);
      }
      // GH-997: a late-output grace before judging a deficit — a platform
      // that resolves flush() a beat before its last output callbacks (a
      // flush-semantics slip) would otherwise be judged lossy, and the
      // ORIGINAL chunk landing after the rewind would mux in place of the
      // re-fed IDR. Bounded (visible time, own-cadence re-arm — the
      // drain-wait law above) and paid only on the deficit path.
      mark = performance.now();
      last = mark;
      while (sink.videoContig < K && !sink.error) {
        const now = performance.now();
        if ((typeof document !== 'undefined' && document.hidden)
          || now - last > 1000) {
          mark = now;
        } else if (now - mark > LATE_OUTPUT_GRACE_MS) {
          break;
        }
        last = now;
        if (signal?.aborted) throw new DOMException('export cancelled', 'AbortError');
        await sleep(5);
      }
      drainP = null;
      const fed = K;
      clearSuspect();
      thaw(performance.now());
      const contig = sink.videoContig;
      // repairable = a clean tail loss: the muxer holds EXACTLY the
      // accounted prefix (muxed + GH-997 held) — a mismatch would mean a
      // post-gap chunk reached it before the guard armed (structurally
      // gone since the GH-997 auto-guard; kept as the belt), and
      // re-feeding would rewind the muxer's append-monotonic timeline…
      let repairable = contig < fed && accounted() === contig;
      let tsiT = 0;
      while (tsiT + 1 < timeline.length && segBase[tsiT + 1] <= contig) tsiT += 1;
      if (repairable) {
        // …AND (review GH-472 r1 P1) the replay span is PURE: the chase rig
        // integrates damping/look-ahead per emitted frame, so replaying
        // [contig, fed) under a follower whose state already saw those
        // frames produces poses the original frames never had (a visible
        // splice the count wall cannot catch). GH-997: the segment the
        // rewind re-enters restores the follower state ENTERING frame W
        // from trackRing — at its boundary too, since start() seeds the
        // eye from the CURRENT camera when the directive names none (the
        // pose of frame fed−1 on a rewind); a LATER track segment of the
        // span re-seeds over a re-rendered prefix — deterministic. Only a
        // missing snapshot (stale cameratrack.js, or W outside the ring)
        // still stands down, unless W opens a segment whose directive pins
        // its own eye. Presets are static and scripted cameras are pure
        // pose(t) — they replay exactly.
        // the span scan runs through the segment the loop has ENTERED, not
        // just the one holding fed−1 (review r5 P1): segment entry applies
        // its camera directive BEFORE the first frame's barrier runs, so a
        // drain judged exactly at a boundary must count the just-entered
        // segment's side effects too (`<= fed` — at fed == segBase[next]
        // the scan lands on the entered segment; mid-segment it is
        // identical to the fed−1 scan).
        let esiT = tsiT;
        while (esiT + 1 < timeline.length && segBase[esiT + 1] <= fed) esiT += 1;
        const trk = timeline[tsiT].camera?.track;
        if (trk && !(contig === segBase[tsiT] && trk.cam)
          && (fed - contig > FADE_RING || trackRing[contig % FADE_RING] === null
            || typeof window.__track?.restore !== 'function')) {
          repairable = false;
        }
        // review r3 P2: a null-camera segment INHERITS its writer/pose — if
        // any LATER segment in the span already applied an explicit
        // directive, the inherited state is gone and re-entering at the
        // watermark would repair under the WRONG camera (a splice the
        // count wall cannot catch). Stand down there; explicit presets
        // and pure scripts re-apply deterministically at re-entry, so
        // every other shape rewinds exactly.
        if (repairable && timeline[tsiT].camera == null) {
          for (let j = tsiT + 1; j <= esiT; j++) {
            if (timeline[j].camera) { repairable = false; break; }
          }
        }
      }
      // GH-997 retry budget (see REWIND_TRIES): a pure span whose
      // watermark frame the platform keeps surrendering HOLDS that one
      // frame and re-renders from the NEXT one (keyframed) — releasing the
      // parked successors instead would mux pictures that may reference
      // the surrendered one (a platform that encoded it and lost only the
      // output). Bounded: every skip advances the watermark.
      const skip = repairable && (rewindTries.get(contig) ?? 0) >= REWIND_TRIES;
      // the rewind path DISCARDS the parked post-gap chunks (their frames
      // re-render); every stand-down RELEASES them to the muxer instead —
      // the file keeps every frame the encoder delivered, and (GH-997) the
      // hole in front of them is HELD and recorded for the delivery
      // policy instead of left as a deficit
      sink.settleDrainGuard({ discard: repairable, fed });
      if (contig >= fed) return null; // frame-exact: nothing was lost
      if (skip) {
        sink.holdFrame();
        if (contig + 1 < fed) { skipping = true; return contig + 1; }
        forceKey = true; // the next fed frame must not reference it either
        return null;
      }
      if (!repairable) {
        // GH-997: restart the reference chain after a stand-down hole —
        // if the surrendered frame WAS referenced, the damage ends at the
        // next fed frame instead of the next periodic keyframe
        forceKey = true;
        return null;
      }
      return contig;
    };
    const applyRewind = (W) => {
      repairs += 1;
      // a skip past a held frame re-renders W without charging W's own
      // retry budget (W itself was never judged lost)
      if (!skipping) rewindTries.set(W, (rewindTries.get(W) ?? 0) + 1);
      skipping = false;
      const fed = K;
      let tsi = 0;
      while (tsi + 1 < timeline.length && segBase[tsi + 1] <= W) tsi += 1;
      rewindSi = tsi;
      rewindK = W - segBase[tsi];
      // GH-997: a re-entry into a track segment restores the follower
      // state frame W first rendered under (read NOW — the replay
      // overwrites the ring); segment entry re-seeds the rig first, the
      // frame top applies the snapshot over it. drainBarrier admitted this
      // rewind only with the snapshot present (or a pinned-eye boundary).
      trackRestore = fed - W <= FADE_RING && trackRing[W % FADE_RING] !== null
        ? { K: W, s: trackRing[W % FADE_RING] } : null;
      K = W;
      if (hashes) hashes.length = W; // rewound frames re-hash on re-feed
      forceKey = true; // discarded bitstream referenced pictures the
      // decoder will never see — restart the ref chain at the splice
      // review GH-472 r1 P1 + r2 P2 (the lampfade half): restore the EXACT
      // fade state frame W originally rendered under (the per-frame ring
      // above) through the GH-404 seam pair — force(v) applies, force(null)
      // hands control back rate-limited — so the replay reproduces the
      // original ramp byte-for-byte (the within-render ramp invariant).
      // Only a stale seam (nothing recorded / no force) falls back to the
      // memoryless snap — bounded to a one-frame anchor step, and only
      // when a platform surrendered frames mid-dissolve on that pairing.
      try {
        const saved = fed - W <= FADE_RING ? fadeRing[W % FADE_RING] : null;
        if (saved !== null && typeof window.__lampfade?.force === 'function') {
          window.__lampfade.force(saved);
          window.__lampfade.force(null);
        } else {
          window.__lampfade?.snapNext?.();
        }
      } catch { /* stale seam */ }
      console.info(`[export] GH-472 pause-seam repair: rewound to frame ${W}`
        + ` (segment ${tsi} + ${rewindK})`);
    };
    for (let si = 0; si < timeline.length; si++) {
      const seg = timeline[si];
      const plan = plans[si];
      // outer abort check: a cancel between segments must not stage on
      if (signal?.aborted) throw new DOMException('export cancelled', 'AbortError');
      if (seg.recordJson) {
        staged = true;
        const err = game.loadRecord(seg.recordJson, { stage: 'quiet' });
        if (typeof err === 'string') {
          throw new Error(`drill segment ${si} staging failed: ${err}`);
        }
      }
      // design 277 slice 3 PR-2: the STAGED record's post-strike cue rides
      // its own segment — armed here, at the staging boundary and never
      // inside the frame loop (the syncCueArm law: a mid-frame re-arm
      // would pose the previous record's cue over this record's balls).
      // A refusal renders the segment pre-277 (the DVR's latched degrade).
      // Covers the recordJson-null fast path too (game.record is the
      // currently loaded shot there). Beat frames disarm below (the
      // staged balls belong to the NEXT record); segment si+1's own arm
      // re-covers it. seg.livePolicy (runExport, review r7 P2) applies the
      // live lane's theta-bump refusal — see liveThetaRefused.
      // seg.cueOff (review r9 P2): the PLAN was built with the cue off
      // (engine loading at probe time / a cueOff player session) — a
      // module resolving mid-render must not draw a cue the tail-less
      // geometry has no withdrawal frames for.
      if (!seg.cueOff) {
        // GH-363: a lead-carrying segment arms with its lead tier — the
        // SAME arm covers head frames (negative emissions), play and the
        // withdrawal tail (one arm per segment, the syncCueArm law). vw0
        // opens the visibility window at the head start (record clock).
        armCueFor(game.record, { livePolicy: seg.livePolicy === true,
          lead: seg.lead ? { tier: seg.lead.tier, index: seg.lead.index,
            vw0: -(plan.headFrames ?? 0) / 60 } : null });
      }
      if (seg.camera) {
        // camera AFTER staging: presets frame THIS segment's table
        window.__track?.stop();
        // one-writer baton (review r3 P2): an armed SCRIPT is held across
        // null-inherit segments (see the cut note below), so any explicit
        // directive must take over from it here before applying its own
        // framing — this disarm also restores an overhead move's hidden
        // canopy before a preset segment renders
        window.__test.cameraScript?.(null);
        if (typeof seg.camera === 'string') {
          // mirror the chase-rig degrade below: an absent hook throws an
          // honest error rather than optional-chaining into a silent no-op
          if (typeof window.__test.setCamera !== 'function') {
            throw new Error('camera presets unavailable (stale main.js)');
          }
          if (window.__test.setCamera(seg.camera) === false) {
            throw new Error(`drill segment ${si}: unknown camera preset '${seg.camera}'`);
          }
        } else if (seg.camera.track) {
          if (typeof window.__track?.start !== 'function') {
            throw new Error('camera chase rig unavailable (stale cameratrack.js)');
          }
          window.__track.start(seg.camera.track);
        } else if (seg.camera.script) {
          // scripted per-segment rig (GH-275 POV): the same honest-throw
          // law as the chase arm. cameraScript() answers false on a
          // stale/still-loading camerascript.js OR a rejected spec — in
          // an export either is an error, never a silent no-op (the live
          // player degrades to the previous framing instead).
          if (window.__test.cameraScript?.(seg.camera.script) !== true) {
            throw new Error('scripted camera rig unavailable or spec '
              + 'rejected (stale main.js/camerascript.js)');
          }
        }
      }
      if (spec.cinelight && !cine) {
        // studio-lighting variant (issue #259): installed ONCE, at segment
        // 0, AFTER staging + THIS segment's camera directive — the rims are
        // posed in the CAMERA FRAME, so a save-card drill export must light
        // from the plan's own segment-0 camera, never the ambient live view
        // the card happened to be over when Export was pressed (review
        // round-1 P1: identical records/options now light identically —
        // the [#259 cam-independence] arm pins it). Guarded dynamic import
        // per the renderDrill rule-5 precedent — a stale cached graph
        // throws an HONEST error inside the try (the finally restores),
        // never a half-lit export; the finally reverts on EVERY exit path
        // (success / AbortError / the encoder-stall watchdog). Scene handle
        // = the boot-time __dbg surface this function already reads for the
        // orbit rig; ball meshes ride the live game handle so equipment
        // with non-default radii keeps its albedo (review round-1 P2).
        const mod = await import('./cinelight.js');
        if (typeof mod.installCineLight !== 'function') {
          throw new Error('studio lighting unavailable (stale cinelight.js)');
        }
        // review env-r13 P1 (boot cache contract, versioned capability):
        // the leaf declares its announce protocol at module load — v2 =
        // __cinelight boolean window + __cinelightEnv probe-swap flag.
        // A cached earlier leaf (no version, or a pre-v2 announce shape)
        // is refused BEFORE any scene mutation — table.js's snooker
        // transport/gain would otherwise shade the studio rig half-lit.
        if (window.__cinelightCap !== 2) {
          throw new Error(
            'studio lighting stale (cinelight protocol v2 required)');
        }
        const scene = window.__dbg?.scene;
        if (!scene) throw new Error('studio lighting unavailable (no scene handle)');
        cine = mod.installCineLight({ scene, renderer, camera,
          cubeCam: window.__dbg?.cubeCam ?? null,
          ballMeshes: game.ballSet?.balls?.map((b) => b.mesh) ?? [] });
        // review env-r10 P2-1 (mixed-cache handshake, the same honest-error
        // law as the guarded import above): a FRESH cinelight.js announces
        // the studio window on the __cinelight seam BEFORE its private
        // bake — table.js's snooker strip-occlusion transport and probe
        // gain key off it. A stale cached leaf installs WITHOUT the
        // announce, so those gameplay terms would shade the studio rig
        // (dark rims, over-gained furniture). Verify the capability and
        // unwind honestly — never a half-lit export.
        if (window.__cinelight !== true) {
          try { cine.revert(); } finally { cine = null; }
          throw new Error(
            'studio lighting stale (cinelight announce capability missing)');
        }
        // review r2 P2: the awaited import + six-face private bake are
        // one-time setup — without this reset the FIRST frame's EMA
        // sample carries them and the progress UI quotes a severely
        // inflated ETA for the whole clip
        tPrev = performance.now();
      }
      const endT = seg.endT ?? Infinity;
      // GH-301 (review r8 P2): a compiled camerascript with ZERO-LENGTH
      // pose moves is the mid-segment HARD-CUT class — an accumulated
      // shutter window straddling an anchor would sample BOTH cameras and
      // ghost a frame the live player cuts cleanly. The anchors are the
      // spec's own zero-length move starts; each frame's subframes CLAMP
      // at the first anchor past the frame base (the shutter closes early
      // at a cut — no eased/blended property survives a hard cut, §2.3).
      // the compiled-cut signature: EVERY move zero-length pose. The
      // FIRST such move is the slice HEAD (under a non-grid trim it sits
      // at the grid line above startT — a synthetic pose, not a cut:
      // review r9 P2), so anchors are the zero-length moves AFTER it.
      const segMoves = seg.camera?.script?.moves ?? [];
      const cutAnchors = (segMoves.length > 1
        && segMoves.every((m) => m.kind === 'pose' && m.t1 === m.t0))
        ? segMoves.slice(1).map((m) => m.t0).sort((a, b) => a - b) : [];
      // GH-299: the tail-frame boundary (planPlayback appends
      // round(tailSec·60) tail frames after the play frames; maxSec is
      // Infinity on every beat-carrying path) + the per-shot beat-staging
      // latch — a beat stages the NEXT segment's INITIAL ball state ONCE,
      // at its first tail frame.
      const tailStart = plan.frames - Math.round((seg.tailSec ?? 0) * 60);
      const headFrames = plan.headFrames ?? 0;
      let beatStaged = false;
      // GH-472: a rewind re-enters THIS segment at its rewound local frame
      // (segment entry re-runs above — staging/camera/cue arms are
      // deterministic re-applies); every other entry starts at 0.
      const kFrom = si === rewindSi ? rewindK : 0;
      for (let k = kFrom; k < plan.frames; k++, K++) {
        if (signal?.aborted) throw new DOMException('export cancelled', 'AbortError');
        await pauseGate(); // GH-362: park BEFORE the frame while hidden
        // GH-997: a gap the sink auto-guarded (no visibility edge latched
        // a drain) is drained and judged here like any edge-latched one
        if (!drainP && sink.holePending) latchDrain();
        if (drainP) {
          // GH-472: judge the hidden-edge drain BEFORE feeding this frame
          const W = await drainBarrier();
          if (W !== null) {
            applyRewind(W);
            si = rewindSi - 1; // the for's si++ re-enters the target segment
            break;
          }
        }
        if (trackRestore?.K === K) {
          // GH-997: the re-fed frame W renders under the follower state it
          // first rendered under (applyRewind above)
          try { window.__track.restore(trackRestore.s); } catch { /* stale seam */ }
          trackRestore = null;
        }
        // GH-472 review r2 P2: the fade state ENTERING this frame — the
        // rewind restoration ring (see FADE_RING above); GH-997: the
        // follower state beside it
        try {
          fadeRing[K % FADE_RING] = window.__lampfade?.value?.() ?? null;
        } catch { fadeRing[K % FADE_RING] = null; }
        try {
          trackRing[K % FADE_RING] = window.__track?.active?.()
            ? window.__track.snapshot?.() ?? null : null;
        } catch { trackRing[K % FADE_RING] = null; }
        const tRaw = plan.timeAt(k);
        const beatFrame = !!seg.beat && k >= tailStart;
        // GH-363: lead-in HEAD frames — the beat mirror image at the
        // segment head: ball clock pinned at startSec, 'frame' emissions
        // on the segment's own negative clock at RATE 1 (fixed output
        // frames — design 363 §5: pre-strike choreography never montage-
        // compresses; contact converges on the first play frame).
        const headFrame = k < headFrames;
        const tHead = plan.startSec + (k - headFrames) * FDT;
        if (beatFrame && !beatStaged) {
          // GH-299 round-2.1 state handoff: the beat renders segment
          // si+1's INITIAL state (ball clock 0) under the walking camera —
          // BIH/respotted balls exist from the first beat frame, never
          // popping in at the arrival. Segment si+1's own iteration then
          // re-stages the same record (deterministic no-op by bytes).
          beatStaged = true;
          staged = true;
          const err = game.loadRecord(timeline[si + 1].recordJson,
            { stage: 'quiet' });
          if (typeof err === 'string') {
            throw new Error(`beat staging failed (segment ${si + 1}): ${err}`);
          }
          // PR-2: beat frames disarm the cue (the syncCueArm beat law —
          // the staged balls belong to the NEXT record; a post-strike cue
          // here would describe a strike that has not happened yet).
          // Segment si+1's own staging boundary re-arms.
          try { window.__test.cuePost?.(null); } catch { /* stale seam */ }
          // GH-363 FUSION (design 363 §5): a kept walk INTO a lead-in
          // segment shows the staged cue ALREADY at its pre-strike life
          // during the walk — armed with the NEXT segment's spec on the
          // emission→record clock map. The beat tail's emissions ride
          // THIS segment's camera clock (tRaw, montage-rate-scaled), and
          // the staged cue's record clock must hit 0 exactly at si+1's
          // first play frame: offset/rate below solve
          //   (emission − offset)/rate = (k − frames − H)/60
          // over emission = startSec + (k − headFrames)·FDT·speed. The
          // walk-overlapped choreography rides the compressed camera
          // clock on montage-rate exports — exactly the Williams-2002
          // phase elasticity the degrade ladder is grounded in; head
          // frames always play rate 1.
          const nx = timeline[si + 1];
          if (nx.lead?.fuse && !nx.cueOff) {
            const sRate = seg.speed ?? 1;
            const H = Math.round(nx.lead.sec * 60);
            const off = plan.startSec
              + sRate * (plan.frames + H - headFrames) / 60;
            armCueFor(game.record, { livePolicy: nx.livePolicy === true,
              lead: { tier: nx.lead.tier, index: nx.lead.index,
                vw0: -(plan.frames - tailStart + H) / 60,
                clock: { offset_s: off, rate: sRate } } });
          }
        }
        // endT clamp — the TWO-CLOCK SPLIT (GH-299 catch (3)(a)): on BEAT
        // frames the clamp applies to the BALL seek only (pinned to 0 on
        // the just-staged NEXT record) while the CAMERA clock (the 'frame'
        // emission every pose(t) rig rides) keeps stepping — a trimmed-exit
        // walk must WALK, not freeze at its hold pose. ORDINARY tail frames
        // keep the pre-299 one-clock hold (review GH-299 round-5 P2: a
        // final POV clip trimmed mid-rise must HOLD its out-frame through
        // the settle tail, camera included — the documented trim law).
        // endT null → Math.min(t, Infinity) === t, the pre-#225 timeline.
        const t = beatFrame ? 0 : Math.min(tRaw, endT);
        // GH-404 staging-boundary law (scene/lampfade.js header): the render
        // bracket opens at a RANDOM-ACCESS boundary — frame 0's luminaire
        // fade derives memorylessly from its own staged pose, never from the
        // live viewport's rate-limiter residue (pre-404, a clip's first
        // frames depended on what the user did before pressing Export — the
        // 3t trim-law parity failure). ONE snap per run, armed only when
        // frame zero WILL render (review GH-404 r1 P3: a pre-frame-zero
        // abort — cancelled signal, staging throw, cinelight failure — must
        // not leak the one-shot into the restored live RAF path as a
        // visible jump) and consumed by that frame's update inside
        // renderAt/renderAccum below. Frames within the run keep the
        // deterministic dt ramp, so a camera crossing the band mid-clip
        // dissolves exactly like the live player (WYSIWYG, the e2e-lighting
        // F5 law). Feature-detected per the seam contract. The cinelight
        // private bake above needs no snap: it brackets itself with
        // suspendForBake() (GH-407 — bakes photograph the AUTHORED lamp).
        if (K === 0) window.__lampfade?.snapNext?.();
        let opts = {};
        // focus DEPTH follows the cue ball (previous-frame pose, record.mjs
        // convention); renderAccum projects it onto the view axis, so this
        // sets only the sharp distance — the user's framing is never re-aimed
        if (spec.dof > 0) {
          const p = game.cueBall().mesh.position;
          opts = { dof: { r: spec.dof, focus: [p.x, p.y, p.z] } };
        }
        if ((spec.shutter ?? 1) > 1 && (headFrame || beatFrame || t < endT)) {
          // BEAT frames ride the CAMERA clock with the ball seek pinned to
          // 0 through opts.tBall (blur follows the WALK, not the balls);
          // HEAD frames (GH-363) ride the segment's negative lead clock at
          // rate 1 with the ball pinned at startSec (blur follows the
          // feathering cue, the balls rest); non-beat frames pass t
          // exactly as pre-299 (t === tRaw in this branch — the t < endT
          // guard excludes clamped frames)
          let subs = shutterSubframes(headFrame ? tHead : beatFrame ? tRaw : t,
            { shutter: spec.shutter, shutterDeg: spec.shutterdeg ?? 310,
              tRate: headFrame ? 1 : seg.speed ?? 1 });
          if (cutAnchors.length && !beatFrame && !headFrame) {
            const base = t;
            const next = cutAnchors.find((a) => a > base + 1e-9);
            if (next !== undefined) {
              subs = subs.map((sf) => (sf.t >= next
                ? { ...sf, t: Math.max(base, next - 1e-6) } : sf));
            }
          }
          window.__test.renderAccum(subs,
            headFrame ? { ...opts, tBall: plan.startSec }
              : beatFrame ? { ...opts, tBall: 0 } : opts);
        } else {
          window.__test.renderAt(t, undefined,
            headFrame ? tHead : beatFrame ? tRaw : undefined);
        }
        gradePass?.apply();
        let source = canvas;
        if (ssaa > 1) {
          ctx2d.drawImage(canvas, 0, 0, spec.width, spec.height);
          source = c2d;
        }
        // GH-364 strike-point plate: composited INTO the frame BEFORE the
        // fade dip and BEFORE encode (part of the rendered bytes — hashes
        // include it, and a cut's dip-to-black darkens the plate with the
        // scene, exactly like the live layer stack). Per-SEGMENT window:
        // alpha 1 from the segment's first frame through the impact frame,
        // smootherstep bow-out over the linger (strikeAlphaAt); walk-beat
        // frames stage the NEXT record's balls, so the plate is gated off
        // there (the issue's hidden-during-walk-beats law). Strike-less
        // specs — and every frame at alpha 0 — take the exact pre-364
        // path: zero perturbation.
        const st = strikeDraw && !beatFrame ? spec.strike[si] : null;
        // GH-363 × GH-364 composition (merge-sweep fix): st.kImp is a
        // PLAY-clock frame index (the spec.strike mapping never sees the
        // lead), while k counts the segment's lead HEAD frames too — unshifted,
        // a leaded segment would bow the plate out headFrames EARLY (gone
        // mid-practice-stroke, before the impact). Shift to the play clock:
        // during the head k − headFrames < 0 ≤ kImp keeps alpha 1, the live
        // mirror exactly (strikeAlphaLive rides the output clock, and lead
        // windows report beat:false — the plate paints through the lead).
        const strikeA = st ? strikeAlphaAt(st, k - headFrames) : 0;
        if (strikeA > 0) {
          if (source === canvas) {
            ctx2d.drawImage(canvas, 0, 0, spec.width, spec.height);
            source = c2d;
          }
          strikeDraw(ctx2d, { W: spec.width, H: spec.height, alpha: strikeA,
            glyph: st.glyph, title: st.title, readout: st.readout,
            // GH-475 annotations ride the plate's own visibility window
            elev: st.elev === true, power: st.power === true });
        }
        // GH-301 fade transitions: alpha rides the OUTPUT clock (the global
        // frame counter K — contract §2.2) and is composited INTO the frame
        // BEFORE encode, so the fade is part of the rendered bytes exactly
        // as the live overlay is part of the presented frame (§2.4; the
        // hashes below include it). Frames at alpha 0 — and every fade-less
        // spec — take the exact pre-301 path: zero perturbation.
        // alpha advances on EVERY output frame — the contract's §2.2 law
        // verbatim ("a fade riding the output clock keeps ramping through
        // tails and trims by construction"; review r11 asked for a content
        // clock and r13 for the output clock — the FROZEN contract rules
        // for the output clock, so a boundary dip spans exactly dur
        // output seconds and ramps across the settle tail's held frames).
        const fadeA = spec.fades?.length ? fadeAlphaAt(spec.fades, K) : 0;
        if (fadeA > 0) {
          if (source === canvas) {
            ctx2d.drawImage(canvas, 0, 0, spec.width, spec.height);
            source = c2d;
          }
          ctx2d.globalAlpha = Math.min(1, fadeA);
          ctx2d.fillStyle = '#000'; // ob-color-exempt: dip-to-black is rendered content, not chrome
          ctx2d.fillRect(0, 0, spec.width, spec.height);
          ctx2d.globalAlpha = 1;
        }
        if (hashes) {
          if (source === canvas) ctx2d.drawImage(canvas, 0, 0, spec.width, spec.height);
          hashes.push(fnv1aBytes(
            ctx2d.getImageData(0, 0, spec.width, spec.height).data));
        }
        const frame = new VideoFrame(source,
          { timestamp: Math.round(K * 1e6 / 60), duration: Math.round(1e6 / 60) });
        // leak audit (#258): encode() clones the frame, so OUR handle closes
        // unconditionally — including when encode() throws on a closed/
        // errored encoder (the old bare close() after encode leaked there)
        try {
          sink.video.encode(frame,
            { keyFrame: K % 120 === 0 || k === 0 || forceKey });
        } finally {
          frame.close();
        }
        forceKey = false; // GH-472: one IDR at the rewind splice
        if (K === 0) liveMark = performance.now(); // clock starts when the
        // encoder first OWES output, not at render start
        if (sink.error) throw sink.error;
        // backpressure — ABORT-AWARE (issue #51) + LIVENESS-WATCHDOGGED
        // (issue #258): WebKit's VideoToolbox can accept configure+encode
        // for a codec it never delivers on (isConfigSupported says yes,
        // ~8 outputs, then silence, no error callback — measured 7/7 on the
        // iOS 27.0 simulator, avc1.640028 720p; the GH-256 harness found
        // the loop spinning on a pinned queue for its whole 600 s budget).
        //
        // Two conditions hold the loop:
        //   encodeQueueSize > 4      — frames the codec has not CONSUMED
        //                              (the original concat-plan seam);
        //   fed − muxed > inflightCap — frames consumed but never OUTPUT.
        //     WebKit's other stall mode drains the input queue while output
        //     stays silent, so queue-only backpressure keeps feeding and
        //     every encode() clones another raw frame into the encoder —
        //     unbounded growth (measured ~3.6 MB/frame in the WebKit GPU
        //     process at 720p). The resolution-aware inflightMax cap
        //     (128 MB budget, [8, 30] frames; hard ceiling 2×) bounds it
        //     to a fixed budget instead of the whole remaining clip.
        //
        // The stall detector keys on ENCODER OUTPUT PROGRESS, never on
        // wall-clock per frame: liveMark = the last delivered chunk (or
        // the first feed), carried ACROSS frames (review r2 P1) and
        // refreshed at wait entry — a long legitimate frame (4K SSAA on a
        // loaded box renders OUTSIDE this loop) can never trip it, while
        // a silent encoder with outstanding frames times out at
        // STALL_WATCHDOG_MS and fails HONESTLY through the existing abort
        // machinery (no partial file, state restored). Queue drain is
        // input consumption, not output — it never resets the clock
        // (review r1 P2). N = 15 s: the GH-51 realtime-transcode watchdog
        // precedent (transcode.js WATCHDOG_MS — the measured WebKit
        // VideoToolbox soft spot), same stack, same signature.
        {
          if (accounted() > liveChunks) { // progress during the render
            liveChunks = accounted();
            liveMark = performance.now();
            flushNudged = false;
          }
          let quietSince = null;
          gapAnchor.wait = performance.now(); // fresh cadence baseline —
          // the gap since the LAST wait (a whole frame's render) is legit
          while (sink.video.encodeQueueSize > 4
            || K + 1 - liveChunks > inflightCap) {
            if (signal?.aborted) throw new DOMException('export cancelled', 'AbortError');
            if (sink.error) throw sink.error;
            await sleep(2);
            if (typeof document !== 'undefined' && document.hidden) {
              // GH-362: a HIDDEN document must not charge the stall
              // deadline — WebKit may freeze/thaw JS around this very
              // wait, and the frozen time used to fire stallError the
              // moment the app foregrounded (the wedge's abort half).
              // The clock re-arms from the resume instant.
              liveMark = performance.now();
              gapAnchor.wait = liveMark;
              quietSince = null;
              continue;
            }
            if (gapThaw('wait', 1000)) {
              // review r1 P1 + r4 P1: the suspension happened ENTIRELY
              // inside the pending 2 ms sleep — hidden was never
              // observable here and the latch may not have fired yet, so
              // the poll measures its OWN cadence: a 2 ms sleep arriving
              // a second late means the clock jumped under it. Deadlines
              // re-arm from the thaw.
              quietSince = null;
              continue;
            }
            // GH-997: an auto-guarded gap parks every later chunk, so the
            // muxed count this hold waits on stops moving — drain it now
            // and let the frame top judge it (the break below)
            if (!drainP && sink.holePending) latchDrain();
            if (drainP && drainReady) {
              // GH-472: a settled hidden-edge drain is judged at the frame
              // top — a lossy one left chunks that will NEVER arrive, and
              // this hold would ride that deficit into the stall deadline
              break;
            }
            const chunks = accounted();
            const qs = sink.video.encodeQueueSize;
            if (chunks > liveChunks) {
              liveChunks = chunks;
              liveMark = performance.now();
              quietSince = null;
              flushNudged = false; // re-arm HERE too (review r5 P1): a
              // lookahead encoder that answers the nudge inside this very
              // wait must get another nudge when its window refills later
            } else if (qs <= 4 && K + 1 - chunks > inflightCap
              && inflightCap < INFLIGHT_HARD) {
              // lookahead escape (review r2 P1): a quality-mode encoder may
              // legitimately hold MORE than the soft cap before its FIRST
              // output — it consumed (nearly) everything, emitted nothing,
              // and needs more INPUT, not more time. Checked BEFORE the
              // deadline (review r3 P2: a slow cinema render can arrive
              // here with >15 s already on the clock — input hunger must
              // get its chance first; `qs <= 4` rather than 0 so the
              // just-fed frame's consumption transient cannot skip it).
              // After a 1 s quiet grace, widen the cap stepwise to the
              // hard ceiling: a lookahead encoder starts emitting and the
              // cap stops binding; a dead one exhausts the ceiling in a
              // few seconds and falls through to the deadline below.
              quietSince ??= performance.now();
              if (performance.now() - quietSince > 1000) {
                inflightCap = Math.min(INFLIGHT_HARD, inflightCap + 4);
                quietSince = null;
              }
            } else if (!flushNudged && qs === 0
              && K + 1 - chunks > inflightCap) {
              // ceiling exhausted, still nothing: before the deadline can
              // rule, ask a possibly lookahead-deep-but-HEALTHY encoder to
              // emit what it holds (review r4 P1: Firefox's libvpx VP9 path
              // may lag up to 25 frames outside realtime — above the
              // 1080p hard ceiling). A healthy encoder answers a
              // mid-stream flush with its held chunks (clock resets, the
              // render continues at a tiny compression cost at the flush
              // point); a dead one leaves the flush dangling — close()
              // rejects it (swallowed here) and the deadline below rules.
              flushNudged = true;
              // grace (review r6 P1): the nudge is ASYNCHRONOUS — after a
              // slow cinema render the deadline may already be expired,
              // and the next 2 ms poll would throw before the encoder
              // could possibly answer. Guarantee it at least 5 s (only
              // binds when the clock is already past 10 s — the drain
              // stall still aborts at ~15 s).
              liveMark = Math.max(liveMark,
                performance.now() - STALL_WATCHDOG_MS + 5000);
              sink.video.flush().catch(() => { /* the deadline rules */ });
            } else if (performance.now() - liveMark > STALL_WATCHDOG_MS) {
              throw stallError(STALL_WATCHDOG_MS / 1000);
            }
          }
        }
        // GH-305: drain the streaming sink's queued wire pieces beside the
        // encoder backpressure — each post is AWAITED, so the wire's own
        // backpressure interleaves with the encode and WebContent never
        // holds more than the queued pieces of ONE muxer flush. A refused
        // post throws here (the shell's short machine token) and fails the
        // render through the existing abort machinery. Feature-detected:
        // ArrayBufferTarget sinks have no drainWire and take the exact
        // pre-305 path. K + 1 = frames completed (GH-362 layer 3: the
        // resume manifest's informational progress anchor).
        if (sink.drainWire) await sink.drainWire(K + 1);
        // GH-373 windowed-bed top-up: keep the audio fed ≥ 1 s ahead of
        // the video clock ((K+1)/60 s done + 60 frames of lead, in audio
        // frames) — one window renders at each ~30.7 s boundary and is
        // released once its clones are with the encoder. Inside the try:
        // a generator/encode throw takes the existing abort machinery.
        if (feedAudioTo) await feedAudioTo((K + 61) * (AUDIO_RATE / 60));
        // GH-362 review r3 P2 + r4 P1: a suspension INSIDE the drain (or
        // the waits above, or the GH-373 window feed) thaws here, BEFORE
        // this frame's EMA sample — detect it now (own-cadence gap: a
        // frame arriving > 10 s after the previous one is a clock jump —
        // legit frames measure ≤ ~2 s even at cinema knobs on a slow
        // machine, and a ~30.7 s audio-window render adds ≤ ~1 s; a false
        // positive only extends a deadline and drops one EMA sample) with
        // the latch as the belt, or the first resumed update charges the
        // whole frozen interval to tPrev (a minutes-inflated ETA that
        // decays slowly).
        gapThaw('frame', 10_000);
        const now = performance.now();
        ema = ema ? 0.9 * ema + 0.1 * (now - tPrev) : (now - tPrev);
        tPrev = now;
        onProgress?.(K + 1, totalFrames, ema);
        if (K % 4 === 3) await sleep(0); // keep the Cancel button responsive
      }
      // one camera writer per segment: a chase rig never runs past its
      // cut — the damped follower is IMPURE, and holding it across a
      // null-inherit segment would keep TRACKING, not keep a framing. A
      // SCRIPT is the opposite (review r3 P2): pose(t) is pure, so a
      // null-inherit next segment legitimately KEEPS the armed script —
      // it re-evaluates over that segment's own clock, and an overhead
      // move's canopy-hide survives the cut (a disarm here restored the
      // canopy MID-TIMELINE and the inherited top-down segment rendered
      // through it). The next explicit directive disarms it at dispatch,
      // and the finally disarms it on every exit path.
      if (seg.camera && typeof seg.camera !== 'string') window.__track?.stop();
      if (si === timeline.length - 1) {
        // GH-373: residual windows (frame-rounding at the timeline end)
        // feed before finalize — the audio flush must see the WHOLE bed.
        // Inside the tail block (GH-472 review r1 P2) so a drain latched
        // during the last window's render is still judged below; a rewind
        // re-runs this feed as a no-op (the generator is already done).
        if (feedAudioTo) await feedAudioTo(Infinity);
        // GH-472 tail barrier: a flip inside the LAST in-flight window has
        // no later frame top to judge it — settle any latched drain before
        // finalize (a deficit here would otherwise surface only at the
        // delivery wall, after the muxer sealed the file). The yield
        // delivers a QUEUED visibilitychange task first (review r1 P2: the
        // edge can be posted after the last frame's pauseGate and would
        // otherwise latch only once finalize owns the encoder — from
        // there the wall + the caller's draft offer are the honest
        // remainder, in-place repair is structurally over). Loops because
        // a fresh hide edge can latch during the barrier's own wait.
        await sleep(0);
        // review r5 P2: a heartbeat-judged suspension (no visibility event)
        // during the final awaits sets only clockSuspect — consume it here
        // so its drain latches BEFORE the drainP check decides no tail
        // drain exists (clearSuspect latches on the suspicion classes)
        clearSuspect();
        // GH-997: the end of the feed is a MANDATORY drain point — a loss
        // with no visibility edge (or one that left no post-gap chunk for
        // the auto-guard to park — a surrendered LAST window) is judged
        // here, while in-place repair is still possible, instead of at
        // the delivery wall after the muxer sealed the file. A no-loss
        // drain is content-transparent: finalize's own flush would emit
        // exactly the same chunks a moment later.
        latchDrain();
        let rewound = false;
        while (drainP && !rewound) {
          const W = await drainBarrier();
          if (W !== null) {
            applyRewind(W);
            si = rewindSi - 1;
            rewound = true;
          }
        }
        if (rewound) continue;
      }
    }
    // Finalize is abort-aware + watchdogged (issue #51 review F2): flush()
    // has no abort semantics, so once the loop ends a stalled encoder (the
    // WebKit zero-output stall documented above) would hang this await
    // forever — the finally below never runs, and a page reload becomes
    // the only recovery. WebCodecs close() rejects a pending flush(), so
    // both Cancel and the no-output watchdog break the wait; the existing
    // catch/finally then restore app state like any other failure path.
    const FLUSH_WATCHDOG_MS = 30_000; // generous — flush drains ≤ 4 frames
    let flushStalled = false;
    const onAbort = () => sink.close();
    signal?.addEventListener('abort', onAbort);
    tFlush = performance.now(); // fresh window for the finalize await
    gapAnchor.tick = performance.now();
    const watchdog = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) {
        // GH-362: hidden time never charges the flush deadline (the
        // k-loop's visible-time law, here for a background straddling
        // the finalize await)
        tFlush = performance.now();
        gapAnchor.tick = tFlush;
        return;
      }
      // review r1 P1 + r4 P1: a suspension this tick never observed as
      // hidden — the tick measures its OWN cadence (a 1 s interval
      // arriving > 6 s late means the clock jumped under it), with the
      // latched thaw as the belt
      if (gapThaw('tick', 6000)) return;
      if (performance.now() - Math.max(sink.lastOutput, tFlush)
        > FLUSH_WATCHDOG_MS) {
        flushStalled = true;
        sink.close();
      }
    }, 1000);
    let bytes;
    try {
      if (signal?.aborted) sink.close(); // aborted since the last loop check
      bytes = await sink.finalize();
      if (signal?.aborted) throw new DOMException('export cancelled', 'AbortError');
    } catch (e) {
      if (signal?.aborted) throw new DOMException('export cancelled', 'AbortError');
      if (flushStalled) {
        // same honest, localized failure as the k-loop watchdog (#258)
        throw stallError(FLUSH_WATCHDOG_MS / 1000);
      }
      throw e;
    } finally {
      clearInterval(watchdog);
      signal?.removeEventListener('abort', onAbort); // never leaks on success
    }
    // full-delivery wall (review r1 P1): an encoder that silently swallows
    // its LAST ≤ INFLIGHT_MAX frames never re-arms the backpressure loop
    // and flush() can still resolve — without this check that ships a
    // TRUNCATED file as success. Every fed frame must be ACCOUNTED for in
    // the muxer (WebCodecs emits one chunk per encoded frame; the transcode
    // path's videoChunks>0 floor is the precedent, exact here because the
    // fed count is ours) — GH-997: muxed, or HELD over an isolated hole
    // within the delivery policy (HOLD_RUN_MAX / holdCap). An accepted hold
    // ships silently and is recorded in the result.
    const held = sink.videoHeld ?? 0;
    const holes = sink.holes ?? [];
    // review GH-997 r1 P2: a TRAILING hole has no successor sample to extend
    // over it (the muxer's last sample keeps its own duration — a held last
    // frame finalized a 0.983 s track for a 1.000 s plan), and the vendored
    // webm muxer carries no per-frame video duration to extend — refused
    // (with the file attached), never shipped short
    if (accounted() < totalFrames || held > holdCap(totalFrames)
      || holes.some((h) => h.n > HOLD_RUN_MAX || h.at + h.n >= totalFrames)) {
      // GH-472: the wall itself NEVER weakens — a short file is refused
      // here exactly as before. The ADDITIVE marker lets the delivery
      // layer (playback.js full-mode card) classify the failure as
      // draft-worthy: the render plan is deterministic, so the persisted
      // resume plan can finish the job — the session must not be
      // discarded with the bytes. Stale pairings simply see no marker
      // (the pre-472 terminal failure).
      const e = truncatedError(sink.videoChunks, totalFrames);
      e.obTruncated = { got: sink.videoChunks, want: totalFrames,
        contig: sink.videoContig ?? null, held, holes };
      // GH-997 salvage (ADDITIVE): the refused file still EXISTS — every
      // delivered frame muxed, holes held, the container finalized (the
      // buffered bytes here; a streamed one already sits complete on the
      // far side of the wire, `streamedBytes` long). The delivery layer
      // offers "Save anyway" beside "Export again" instead of discarding a
      // near-complete render; a stale consumer ignores the field.
      e.obSalvage = { bytes: sink.drainWire ? null : bytes,
        streamedBytes: sink.drainWire ? bytes : null,
        lost: totalFrames - sink.videoChunks, frames: totalFrames,
        held, holes, ext: spec.format, width: spec.width,
        height: spec.height, clipSec, repairs };
      throw e;
    }
    if (held > 0) {
      console.info(`[export] GH-997 held ${held} isolated frame(s) the `
        + `encoder lost (${holes.map((h) => h.at).join(', ')})`);
    }
    // GH-373 (review r3 P1) — the windowed bed's AUDIO delivery wall,
    // mirroring the video wall above: a tail-swallowing audio encoder can
    // resolve flush() with the last window eaten, and the muxed file would
    // ship a with-sound promise whose sound track ends early. The muxed
    // end position must cover the fed bed minus one AAC frame + priming
    // class of slack (4096 frames ≈ 85 ms — far under any audible-truncation
    // report, far over timestamp rounding). Windowed path only: whole-bed
    // paths keep their recorded byte-identical behavior.
    if (feedAudioTo && muxedFrames() < audioFrames - 4096) {
      throw audioTruncatedError(
        (muxedFrames() / AUDIO_RATE).toFixed(1),
        (audioFrames / AUDIO_RATE).toFixed(1));
    }
    // GH-305: a streaming finalize() returned the byte EXTENT (a number) —
    // the muxed file lives on the far side of the wire, never in here.
    const streamed = sink.drainWire ? bytes : null;
    // GH-304 calibration: a COMPLETE render measures its own whole-file
    // rate for this (container, height) pair — the next plan's byte-derived
    // budget reads it. After the delivery walls above: a truncated/stalled
    // run measures nothing. A streamed run measures the same quantity (its
    // extent IS the whole-file size), so full exports calibrate montage
    // budgets too.
    recordBudgetBps(spec.format, spec.height,
      streamed ?? bytes.length, clipSec);
    return { bytes: streamed !== null ? null : bytes,
      streamedBytes: streamed, frames: totalFrames, clipSec, hashes,
      width: spec.width, height: spec.height, ext: spec.format,
      segments: plans.map((p) => p.frames),
      // GH-472 (ADDITIVE): in-place pause-seam repairs this run performed
      // (rewinds to the muxed watermark) — observability for the e2e arms
      repairs,
      // GH-997 (ADDITIVE): frames HELD over isolated holes the render could
      // not re-encode (accepted by the delivery policy), and where
      held, holes };
  } catch (e) {
    bailed = true;
    sink.close();
    throw e;
  } finally {
    // cinelight revert FIRST (issue #259): the exact-snapshot restore + env
    // rebake land before the renderer/camera/game restores below, on EVERY
    // exit path — the e2e revert-proof arm (same-boot standard-hash A/A
    // around a cinelight export) is the machine wall. Guarded so a revert
    // throw can never mask the restores below (it would surface through the
    // console-error gate instead).
    try { cine?.revert(); } catch (e) {
      console.error('[export] cinelight revert failed:', e);
    }
    // GH-404 review r3 (P3): failed-run fade rollback (declaration note
    // above). force(v) applies + force(null) hands control back to the
    // pose rate-limited — the existing seam pair, no new writer.
    if (bailed && fade0 !== null) {
      try {
        window.__lampfade?.force?.(fade0);
        window.__lampfade?.force?.(null);
      } catch { /* stale seam */ }
    }
    // GH-362: the suspension detectors die with the render on every path
    if (visListener) document.removeEventListener('visibilitychange', visListener);
    if (heartbeatIv) clearInterval(heartbeatIv);
    gradePass?.dispose();
    window.__test.releaseAccum?.(); // shutter accumulator (rgba32f at export size)
    renderer.setPixelRatio(pr0);
    renderer.setSize(size0.x, size0.y, false);
    // ratio BEFORE size (both allocs are lazy — no oversized transient):
    // pre-fix this restore was itself a resize-flip trigger, re-sizing the
    // live composer at the boot-captured latent ratio after any export
    composer.setPixelRatio(prC0);
    composer.setSize(size0.x, size0.y);
    if (camSaved) {
      // per-segment cameras wrote the pose (and 'top' the fov) — put the
      // live view AND the orbit rig state back so the first post-export
      // drag continues from the user's framing. The scripted rig too
      // (GH-275): a throw inside a { script } segment would otherwise
      // leave the armed script re-posing the restored live camera on
      // every post-export frame.
      window.__track?.stop();
      window.__test.cameraScript?.(null);
      if (camSaved.orbit && window.__dbg?.orbit?.state) {
        window.__dbg.orbit.state.target.copy(camSaved.orbit.target);
        window.__dbg.orbit.state.radius = camSaved.orbit.radius;
        window.__dbg.orbit.state.theta = camSaved.orbit.theta;
        window.__dbg.orbit.state.phi = camSaved.orbit.phi;
      }
      camera.position.copy(camSaved.pos);
      camera.quaternion.copy(camSaved.quat);
      camera.fov = camSaved.fov;
    }
    camera.aspect = aspect0;
    camera.updateProjectionMatrix();
    if (staged && orig) {
      // identity-preserving restore: re-stage the PRE-EXPORT record with
      // its ORIGINAL object identity so the post-export RAF settle re-emits
      // shotComplete with the very object flow/share/drills latched — the
      // replay-identity route, exactly like a single-shot export's settle.
      // Then put the live texture-orientation bases back (quiet staging
      // pinned them to identity for render determinism).
      // allowVersionMismatch: this record was ALREADY accepted by
      // loadRecord once — possibly via the scripted DIAGNOSTIC path
      // (__test.loadRecord { allowVersionMismatch: true } harness
      // captures) — so the restore must never re-check STRICTER than the
      // original acceptance; a strict-version refusal here would leave
      // g.record on the LAST segment's record and the post-export settle
      // would adjudicate a phantom fresh shot (e2e-export F7).
      const err = game.loadRecord(orig.json,
        { stage: 'quiet', recordRef: orig.record, allowVersionMismatch: true });
      if (typeof err === 'string') {
        console.error('[export] drill state restore failed: ' + err);
      } else {
        for (const { b, q } of orig.baseQuats) b.baseQuat.copy(q);
        game.setPhi?.(orig.phi);
      }
    }
    // PR-2 exit bracket: the render's LAST segment arm must not outlive
    // the render — the restored bed would wear a quiet-staged record's
    // cue. The DVR save path re-arms over its restored bed on every
    // settled outcome (playback.js restorePlayerBed → renderAtT →
    // syncCueArm); the live/dialog paths stay disarmed until the next
    // stroke, the recorded PR-1 restore semantics.
    disarmCueForRender();
    game.seek(game.duration); // settled table; RAF settle path takes over
    game.paused = paused0;
    window.__test.setManual(false);
  }
}

// ---- the export run ----------------------------------------------------------
/**
 * Re-render the CURRENT shot (game.record/sampler) into a video file.
 * `spec`: { shutter, shutterdeg, ssaa, grade, dof, width, height, bitrate,
 * format:'mp4'|'webm', slowmo, withAudio, hashFrames, cinelight } — the
 * ruled tier knobs (EXPORT_TIERS in export.js) + run options. `cinelight`
 * (issue #259, default false) installs the cinelight.js studio-lighting rig
 * for the duration of the render — snapshot/exact-restore contract, see the
 * renderTimeline body.
 * `hooks`: { signal?: AbortSignal, onProgress?(done, total, msPerFrame) }.
 * Returns { bytes, frames, clipSec, width, height, ext, hashes }.
 * Restores renderer/composer/camera/game state on every exit path; cancel
 * (signal aborted) throws AbortError and produces NO partial file.
 *
 * Since issue #225 Phase B this is the 1-segment wrapper over
 * renderTimeline: no staging, no camera directive — the render, restore
 * and output paths are byte-identical to the pre-refactor single-shot
 * engine (the e2e-export frame-count/PTS/hash/audio-onset arms are the
 * binding gate).
 */
export async function runExport(env, spec, hooks = {}) {
  const { game } = env;
  if (!game.sampler || !game.record) throw noShotError(); // GH-1024: localized
  // PR-2: extend play time by the cue-life overhang (tHide past the record
  // end) so the withdrawal has frames to play in. The disarm precedes the
  // probe (a probe must never replace a standing arm it cannot restore);
  // stale seams probe 0 — the exact pre-PR-2 plan geometry.
  disarmCueForRender();
  // a STILL-LOADING engine probes tail 0 — latch the cue OFF for this
  // render (review r9 P2): the module could resolve mid-render and
  // renderTimeline's per-segment arm would then draw a cue the tail-less
  // plan has no withdrawal frames for. Geometry and pixels stay pre-277
  // together; the next export probes again.
  const cueOff = window.__test?.cuePostState?.() === null;
  const cueTail = cueOff ? 0
    : probeCueTail(game.record, game.duration, { livePolicy: true });
  // GH-489 #637 LAND-16 Z2 (review round 3 P2): the plan covers the LAST pocket
  // drop the presentation still animates — the ONE un-padded completion time
  // realtime settles on (framestep.js sinkCompletionSec over the live sink
  // index), combined with the cue overhang by MAX (pads never compound: the
  // TAIL_SEC tail below is added exactly once by planPlayback). A record whose
  // drops end inside duration + cueTail plans byte-identically to before.
  const planDuration = Math.max(game.duration + cueTail,
    // LAND-18 X1 (review 775r5 P2 (a)): the index is LAZY (game.js nulls it on every
    // loadRecord and builds it at seek/update/accessor) — a quietly-staged record
    // exported before any frame read the raw Map as EMPTY (completion = duration,
    // the cold plan). The accessor builds it — the same read the drill builder
    // (below) and the DVR staging (playback.js) make.
    framestepNs.sinkCompletionSec?.(game.duration, game.sinkEntries?.() ?? []) ?? game.duration); // degrade: the pre-LAND-16 plan
  const timeline = [{
    recordJson: null, record: game.record, duration: planDuration,
    camera: null, speed: spec.slowmo ?? 1, startT: 0, endT: null,
    tailSec: TAIL_SEC, maxSec: CLIP_CAP_SEC,
    // current-shot surface: mirror the LIVE presentation exactly,
    // theta-bump refusal included (review r7 P2)
    livePolicy: true,
    cueOff,
  }];
  const res = await renderTimeline(env, timeline, spec, hooks);
  // the FROZEN consumer shape (export.js dialog + record.js hdSave #197)
  return { bytes: res.bytes, frames: res.frames, clipSec: res.clipSec,
    hashes: res.hashes, width: res.width, height: res.height, ext: res.ext };
}

// ---- the drill run (issue #225 Phase B) ---------------------------------------
/**
 * Multi-shot drill stitch (feature 030 (internal spec)):
 * re-render an ORDERED list of ShotRecords into ONE continuous video —
 * one global frame counter into one sink (no gap/dup at seams), a camera
 * per segment, ONE OfflineAudioContext soundtrack, montage-rate cap.
 *
 * `records`: ShotRecord JSON strings (or parsed objects) in play order —
 *   each must satisfy game.loadRecord's preconditions against the ACTIVE
 *   rack (same-session kernel_version, ball ids present).
 * `perShotCamera[i]`: camerapresets.js name | { track: {…} } |
 *   { script: {…} } (a camerascript.js moves spec, armed per segment —
 *   GH-275 POV; HELD across null-inherit segments, where it re-evaluates
 *   over each segment's own clock, and disarmed when the next explicit
 *   directive dispatches or the render ends) | null (= keep the previous
 *   segment's camera).
 * `opts`: the runExport spec knobs (width/height/bitrate/format/ssaa/
 *   shutter/shutterdeg/grade/dof/withAudio/hashFrames) + {
 *   slowmo   uniform playback rate (default 1);
 *   tailSec  non-final settle beat (default 0.25 s; the FINAL segment
 *            always gets TAIL_SEC);
 *   trims    [{ startT, endT }] kernel-time trim per segment;
 *   beats    GH-299 walk-beat schedule: beats[i] = the walk AFTER segment
 *            i ({ beatSec, holdSec, walkTime, fov, p0, path } in
 *            beat-LOCAL time — playback.js exportBeats is the ONE
 *            builder) or null. A kept beat replaces the segment's inner
 *            tail with beatSec of walk frames over the NEXT segment's
 *            initial state; the hold+walk moves are placed AFTER the cap
 *            loop so they span beatSec·finalSpeed kernel seconds;
 *   budgetSec  GH-304: the plan-time byte-derived output ceiling in whole
 *            seconds (playback's ONE derivation — exportBudgetSec via the
 *            __export.exportBudget seam); absent/invalid → CLIP_CAP_SEC;
 *   leads    GH-363 pre-strike lead-in schedule: leads[i] = { sec, tier,
 *            fuse, index? } for segment i or null (playback.js exportLeads
 *            is the ONE builder — sec is the FUSED output-seconds T_add,
 *            already budget-degraded for montage plans and 1:1 for full
 *            plans; tier 'v2' practice strokes | 'v1' 1.8 s hold | 'v1s'
 *            0.6 s hold; index = the ORIGINAL segment index seeding the
 *            deterministic jitter — a trimmed plan compacts the array).
 *            Lead seconds are FIXED output frames at rate 1 exactly like
 *            tails/beats — the cap loop prices them on the fixed side.
 *            `fuse` re-verifies against the beat that actually survives
 *            the trim re-check;
 *   strike   GH-364: the strike-point teaching plate — { title (localized
 *            caption), readout?: boolean, elev?: boolean, power?:
 *            boolean, window474?: boolean }. `readout` = the legacy
 *            combined theta/v0 line (seam callers); `elev`/`power`
 *            (GH-475, default false) = the knob-selected annotation
 *            halves, values from the RECORDED shot params. Per-segment
 *            geometry/timing re-derive from each record via strikeglyph.js
 *            (glyphFor/impactTimeFor); mapped to local-frame windows after
 *            the cap loop (see the spec.strike block below) — when the
 *            plan DECLARES the GH-474 timing promise (window474: true),
 *            lead-carrying segments additionally probe the engine's
 *            first-backswing anchor (kBack) so the plate fades in WITH
 *            the first backswing and hides AT the strike; undeclared
 *            plans keep the pre-474 window (review r1 P1). Absent = the
 *            exact pre-364 render;
 *   signal, onProgress    runExport's hooks;
 *   onMontage(rate)       cap-policy surface (Phase-C UI note) }.
 *
 * Cap policy: every segment plans UNCAPPED (maxSec Infinity); if the total
 * exceeds the budget (opts.budgetSec — GH-304's plan-time byte-derived
 * seconds; absent → the CLIP_CAP_SEC floor) a UNIFORM montage rate
 * multiplies every segment's speed (audio follows the same divisor) — the
 * WHOLE drill is preserved, never shot-dropping. Deterministic (pure
 * arithmetic on the plans).
 *
 * Returns runExport's shape + { segments: frames-per-segment, montageRate }.
 */
export async function renderDrill(env, records, perShotCamera = [], opts = {}) {
  const { game } = env;
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error('renderDrill: records[] is empty');
  }
  if (!game.sampler || !game.record) throw noShotError(); // GH-1024: localized
  // record duration is SDK metadata (recordDuration) — reached via dynamic
  // import (the already-linked namespace; ZERO new static edges into the
  // boot graph, rule-5 corollary) with the last-event fallback for a stale
  // sdk mirror. NOT physics: the plan consumes it through planPlayback.
  let recDur = null;
  try {
    recDur = (await import('../dist/pool-sdk/index.js')).recordDuration ?? null;
  } catch { /* stale sdk mirror — fallback below */ }
  const speed = opts.slowmo ?? 1;
  const innerTail = opts.tailSec ?? 0.25;
  // GH-299: the walk-beat schedule (opts.beats[i] = the walk AFTER segment
  // i: { beatSec, holdSec, walkTime, fov, p0, path } in BEAT-LOCAL time,
  // built by playback.js's ONE schedule builder). A kept beat replaces the
  // segment's inner tail with its beatSec — beats are fixed OUTPUT frames
  // exactly like the settle tails, so the montage cap-convergence loop
  // below already prices them through seg.tailSec. GH-315: a beat whose
  // exit lands inside its segment's own POV rise ships holdSec 0 with the
  // rise-remainder + watch hold + walk baked into ONE 60 Hz waypointed
  // path (and an exit-clipped base script so the trim re-check below and
  // camerascript's no-overlap law hold) — the placement code beneath
  // renders it verbatim: a zero-length hold pose plus a full-beat dolly.
  // Validation is honest and up front (the drillRender shape law): the
  // two-clock renderAt seam must exist, a beat needs a { script } camera
  // to append its moves to, and the final segment can never carry one.
  const beats = opts.beats ?? [];
  if (beats.some(Boolean)) {
    if (window.__test?.twoClock !== true) {
      throw new Error('walk transitions unavailable (stale main.js — no '
        + 'two-clock renderAt seam) — reload the app');
    }
    if (!Array.isArray(beats) || beats.length > records.length) {
      throw new Error('renderDrill: beats[] must align with records[]');
    }
    if (beats[records.length - 1]) {
      throw new Error('renderDrill: the final segment cannot carry a beat');
    }
    beats.forEach((w, i) => {
      if (!w) return;
      if (!Number.isFinite(w.beatSec) || !Number.isFinite(w.holdSec)
        || w.beatSec <= w.holdSec || !Array.isArray(w.path)
        || w.path.length < 2 || !w.p0?.cam || !w.p0?.look) {
        throw new Error(`renderDrill: beats[${i}] is malformed`);
      }
      if (!(perShotCamera[i] && typeof perShotCamera[i] === 'object'
        && perShotCamera[i].script)) {
        throw new Error(`renderDrill: beats[${i}] needs a { script } camera `
          + 'on its segment');
      }
    });
  }
  // GH-363 lead-in schedule (opts.leads[i] — playback.js exportLeads is
  // the ONE builder; the drillRender belt already refused an explicit
  // leads plan against a stale engine). Honest up-front validation, the
  // beats shape law.
  const leads = opts.leads ?? [];
  if (leads.some(Boolean)) {
    if (window.__test?.twoClock !== true) {
      throw new Error('pre-strike lead-in unavailable (stale main.js — no '
        + 'two-clock renderAt seam) — reload the app');
    }
    if (!Array.isArray(leads) || leads.length > records.length) {
      throw new Error('renderDrill: leads[] must align with records[]');
    }
    leads.forEach((l, i) => {
      if (!l) return;
      if (!Number.isFinite(l.sec) || l.sec < 0
        || !['v2', 'v1', 'v1s'].includes(l.tier)
        || (l.index !== undefined
          && !(Number.isInteger(l.index) && l.index >= 0))
        || (opts.trims?.[i]?.startT ?? 0) !== 0) {
        throw new Error(`renderDrill: leads[${i}] is malformed (needs `
          + 'finite sec >= 0, tier v2|v1|v1s, an optional integer index '
          + '>= 0, and an untrimmed head)');
      }
    });
  }
  const timeline = records.map((r, i) => {
    const json = typeof r === 'string' ? r : JSON.stringify(r);
    const record = JSON.parse(json);
    const kernelDuration = recDur ? recDur(record)
      : (record.events?.length ? record.events[record.events.length - 1].t : 0);
    // GH-489 #637 LAND-16 Z2 → LAND-17 C2 (review 775r4 P2): the completion is a
    // property of the RECORD being planned, never of equality with game.record.
    // No index exists for an unstaged record here, so the segment carries its
    // kernel duration now and takes max(kernel + cueTail, completion) at the
    // quiet-staging probe below, where game.sinkInfo IS that record's index —
    // the same index the renderer animates its drops from once staged.
    const duration = kernelDuration;
    const startT = opts.trims?.[i]?.startT ?? 0;
    const endT = opts.trims?.[i]?.endT ?? null;
    let beat = beats[i] ?? null;
    if (beat) {
      // the beat-existence law, re-checked against the ACTUAL trims (a
      // seam caller may re-trim after planning): a walk departs from the
      // risen watch pose, so an exit inside the segment's own script
      // motion (before its last move ends) keeps the pre-299 hard cut —
      // the same rule the schedule builder applies, and the guard that
      // keeps the appended moves from ever overlapping the base script.
      const playSec = endT !== null ? Math.min(endT, duration) : duration;
      const riseEnd = perShotCamera[i].script.moves
        .reduce((m, mv) => Math.max(m, mv.t1 ?? 0), 0);
      if (!(playSec >= riseEnd)) beat = null;
    }
    return {
      recordJson: json, record, duration,
      camera: perShotCamera[i] ?? null,
      speed,
      startT, endT, beat,
      tailSec: i === records.length - 1 ? TAIL_SEC
        : (beat ? beat.beatSec : innerTail),
      maxSec: Infinity,
    };
  });
  // GH-363: attach the lead schedule AFTER the beat trim re-check above —
  // `fuse` must describe the beat that actually renders (a re-trimmed-away
  // beat un-fuses its lead: the head frames keep their planned count, the
  // walk-overlap arm simply never fires).
  timeline.forEach((seg, i) => {
    const l = leads[i];
    if (!l || !(l.sec >= 0)) return;
    // a FUSED lead whose incoming beat did not survive the trim re-check
    // is unrenderable as planned (review r3 P2): its sec is the FUSED
    // T_add = T_pre − overlap, so the head window would open partway
    // through the practice sequence with no walk carrying the earlier
    // feathers. The planner and the re-check run the same rules, so a
    // savePlan-driven render never lands here — a seam caller that
    // re-trimmed after planning gets the honest replan throw (the beats
    // shape-validation family), never a silent mid-choreography pop.
    if (l.fuse === true && !timeline[i - 1]?.beat) {
      throw new Error(`renderDrill: leads[${i}] was planned FUSED but its `
        + 'incoming walk beat did not survive the trim re-check — replan '
        + 'the leads for the actual trims');
    }
    // l.index = the ORIGINAL segment index (review r2 P2): the jitter seed
    // input — a trimmed plan compacts the array, and the engine must arm
    // the exact schedule the planner probed/priced. Seam callers without
    // it keep the array position (untrimmed plans: identical).
    seg.lead = { sec: l.sec, tier: l.tier, index: l.index ?? i,
      fuse: l.fuse === true };
  });
  // PR-2: per-segment cue-life overhang — PLAY-time extension (record-
  // derived choreography, montage-compressible like the balls), probed
  // with the SAME clamp the DVR player's timeline builder applies
  // (playback.js pb.tails — the WYSIWYG mirror), so live scrub and export
  // agree on every segment's geometry. Beat segments stay unextended (the
  // walk replaces the withdrawal — the beat departs at the record end,
  // exactly where the player's schedule keys it). Probed BEFORE the cap
  // loop so the montage budget prices the extension. The disarm precedes
  // the probes (strand safety — see disarmCueForRender).
  // STAGE-THEN-PROBE (review r1 P1): the engine's plan clamps against the
  // LOADED record's ball trajectories (intrusion/rest are sampler truth),
  // so each record quiet-stages before its probe — and the PRE-PROBE
  // record restores with its ORIGINAL object identity afterwards, because
  // renderTimeline captures ITS restore target from game.record at entry
  // (a probe-staged leftover would strand the post-export settle on the
  // wrong record). A staging refusal probes 0 and lets renderTimeline's
  // own staging throw the honest error.
  // quiet staging requires PLAYBACK (game.js loadRecord precondition) —
  // mirror renderTimeline's entry here so the dialog/drills paths can
  // probe; renderTimeline's own setManual/replay then no-op on the
  // success path and its finally owns the restore. Any throw BETWEEN this
  // block and renderTimeline (probe restore, cap tripwires, beat shape
  // validation) restores manual mode itself — a stranded manual latch
  // would freeze the live app.
  window.__test.setManual(true);
  try {
    if (env.machine.state !== 'PLAYBACK') game.replay();
    disarmCueForRender();
    // loading latch (review r9 P2) + the savePlan cueOff carry: a plan
    // built while the engine still loads (or from a cueOff player
    // session — opts.cueOff) keeps the cue OFF for the whole render, so
    // a module resolving mid-render cannot draw into tail-less geometry.
    const cueOff = opts.cueOff === true
      || window.__test?.cuePostState?.() === null;
    if (cueOff) for (const seg of timeline) seg.cueOff = true;
    // pose snapshot (review r2 P2): quiet loadRecord resets g.phi and
    // identities every ball's baseQuat, and renderTimeline captures ITS
    // restore snapshot AFTER these probes — without putting phi + the
    // texture-orientation bases back here, completing the export would
    // re-aim the live table and re-phase the ball textures.
    const preProbe = {
      record: game.record, json: JSON.stringify(game.record),
      phi: game.phi,
      baseQuats: (game.playbackBalls ?? [])
        .map((b) => ({ b, q: b.baseQuat.clone() })),
    };
    let probeStaged = false;
    for (const seg of timeline) {
      // a cueOff plan neither arms NOR extends by the cue (review final round):
      // the engine may have LOADED since the player latched off, and a
      // successful cue probe here would grow blank settled intervals the
      // player timeline never showed. LAND-17 C2: cueOff no longer skips the
      // STAGING — every segment stages so its own sink index can be read
      // (staging is not a cue probe; the cue stays off); only the cue
      // probes below stay gated — see the C2 block that follows.
      // beat segments stay tail-unextended (the walk replaces the
      // withdrawal), but a lead INTO a beat segment is independent — its
      // backswing anchor (GH-474, strike-plate window) still probes.
      // window474: the plan-declared timing promise (review r1 P1) — a
      // stale planner's plan keeps the pre-474 window byte-identically.
      // LAND-17 C2 (review 775r4 P2): EVERY segment is quiet-loaded and its
      // completion read BEFORE the cueOff / tail-less skips below — the LAST
      // pocket drop's end from game.js's own lazy index of the LOADED record
      // (game.sinkEntries(), the ONE sink-index law; feature-detected: a new
      // name on the game object), through framestep's namespace binding (a
      // stale leaf degrades to the kernel duration). Combined with the cue
      // overhang by an explicit MAX, never a sum — the law runExport plans with.
      if (typeof game.loadRecord(seg.recordJson, { stage: 'quiet' }) === 'string') {
        continue;
      }
      probeStaged = true;
      const kernelDuration = seg.duration;
      const completion = framestepNs.sinkCompletionSec?.(kernelDuration, game.sinkEntries?.() ?? []) ?? kernelDuration;
      seg.duration = Math.max(kernelDuration, completion);
      // a cueOff plan neither arms NOR extends by the cue (see above) — the
      // completion above stands; only the cue probes are skipped
      if (seg.cueOff) continue;
      const wantTail = !seg.beat;
      const wantBack = !!seg.lead && opts.strike?.window474 === true;
      if (!wantTail && !wantBack) continue;
      const cueTail = wantTail ? probeCueTail(seg.record, kernelDuration) : 0;
      seg.duration = Math.max(kernelDuration + cueTail, completion);
      // GH-474: the strike plate's first-backswing anchor (engine truth,
      // probed on the staged record exactly like the tail)
      if (wantBack) seg.leadBack = probeLeadBack(seg.record, seg.lead);
    }
    if (probeStaged) {
      const back = game.loadRecord(preProbe.json,
        { stage: 'quiet', recordRef: preProbe.record, allowVersionMismatch: true });
      if (typeof back === 'string') {
        throw new Error(`renderDrill: pre-probe record restore failed: ${back}`);
      }
      for (const { b, q } of preProbe.baseQuats) b.baseQuat.copy(q);
      game.setPhi?.(preProbe.phi);
    }
  } catch (e) {
    try { game.seek(game.duration); } catch { /* no sampler */ }
    try { window.__test.setManual(false); } catch { /* stale seam */ }
    throw e;
  }
  // manual-latch bail for the cap tripwires below (same guard shape): a
  // throw between the probe phase and renderTimeline must not strand the
  // live app frozen in manual mode — and (review r6 P2) the preflight may
  // ALREADY have replayed into PLAYBACK, so park the bed on the settled
  // table first (the renderTimeline-finally exit shape: seek(duration) +
  // RAF settle adjudication, never a visible ghost replay). The cue arm
  // stays down, the recorded restore semantics.
  const bail = (e) => {
    try { game.seek(game.duration); } catch { /* no sampler */ }
    try { window.__test.setManual(false); } catch { /* stale seam */ }
    throw e;
  };
  const planFrames = () => timeline.reduce((n, seg) => n
    + planPlayback({ duration: seg.duration, slowmo: seg.speed,
      startT: seg.startT, endT: seg.endT, tailSec: seg.tailSec,
      headSec: seg.lead?.sec ?? 0, maxSec: Infinity }).frames, 0);
  let montageRate = 1;
  let total = planFrames();
  // GH-305: a STREAMING full-length render (opts.stream) is EXEMPT from
  // the montage budget BY DESIGN — the GH-304 seconds ceiling exists to
  // bound the ArrayBufferTarget whole-file buffer and its ≤3× finalize
  // transient, and a streamed sink never builds either (bytes land on the
  // far side's disk as they mux). The walls it answers to instead are the
  // v3 wire's own extent cap and the disk (writeFailed — the honest
  // failure). Montage rate pins at 1: the mode's whole promise is 1:1
  // segments; budgetSec is ignored even if a seam caller passes one.
  // Recorded in the ownership ledger (internal) beside the GH-304 ledger entry.
  const fullStream = typeof opts.stream?.post === 'function';
  if (fullStream && opts.withAudio !== false && !fullAudioWindowCapable()
    && total > FULLSTREAM_AUDIO_CAP_SEC * 60) {
    // the v1 with-sound wall, since GH-373 the STALE-PAIRING wall only
    // (see the constant): a cached pre-373 export-audio.js can only build
    // the ONE whole-session bed — the last length-proportional allocation
    // on the streamed path — so an over-wall with-sound plan on that
    // pairing refuses HONESTLY before frame one instead of building a
    // jetsam-class bed. A capable pairing renders the windowed bed with
    // no length wall (the wire extent cap + disk own the bound). The
    // card's fullFits() mirror keeps real users off this throw (localized
    // playback.fullTooLong behind the same __export.fullAudioWindowed
    // truth); seam callers get the reload cure here.
    bail(new Error(`full-length export with sound is capped at `
      + `${FULLSTREAM_AUDIO_CAP_SEC} s of output on this cached session `
      + '(one-piece audio bed — stale export-audio.js; GH-373 windows '
      + 'it) — reload the app, trim the session, or pass '
      + 'withAudio: false'));
  }
  // GH-304: the byte-derived budget rides in on opts.budgetSec — playback's
  // ONE plan-time derivation (exportBudgetSec above through the
  // __export.exportBudget seam), already floored to whole seconds. Seam
  // callers without it keep the CLIP_CAP_SEC floor byte-for-byte. NEVER
  // re-derived here (the budget is fixed at plan time by design) and never
  // re-clamped mid-export.
  const capSec = Number.isFinite(opts.budgetSec) && opts.budgetSec >= 1
    ? Math.floor(opts.budgetSec) : CLIP_CAP_SEC;
  const capFrames = capSec * 60;
  if (!fullStream && total > capFrames) {
    // tails are FIXED output beats (they never speed up), so the montage
    // rate targets the play budget. GH-363: lead-in head frames sit on the
    // same fixed side — exportLeads already degraded them against the SAME
    // budget, so the loop below converges exactly as before.
    const tailFrames = timeline.reduce(
      (n, seg) => n + Math.round(seg.tailSec * 60)
        + Math.round((seg.lead?.sec ?? 0) * 60), 0);
    if (capFrames - tailFrames < 60) {
      bail(new Error(`renderDrill: ${records.length} segments' settle beats `
        + `alone exceed the ${capSec} s cap`));
    }
    // STRUCTURAL ceiling (review review on 01fe1bf2): per-segment ceil()
    // rounding can lag each re-plan by up to a frame per segment, so
    // iterate UNTIL the total fits — this loop only exits under the cap.
    // It terminates: rate > 1 strictly while total > capFrames, so every
    // pass raises every speed and play frames are non-increasing; the
    // rounding lag makes worst-case convergence O(N) tiny passes, hence
    // the tripwire bound scales with N (a THROW, never a silent ceiling
    // violation — e2e-export F6 pins a 20-segment drill that the old
    // fixed-4-pass loop left parked at 3601 frames).
    let passes = 0;
    while (total > capFrames) {
      if (++passes > timeline.length * 2 + 8) {
        bail(new Error('renderDrill: montage cap failed to converge: '
          + `${total} frames > ${capFrames} after ${passes - 1} passes`));
      }
      const rate = (total - tailFrames) / (capFrames - tailFrames);
      montageRate *= rate;
      for (const seg of timeline) seg.speed *= rate;
      total = planFrames();
    }
    // caller-supplied callback under the manual-latch bail (review r3 P2):
    // a throwing onMontage sits outside both guards and renderTimeline's
    // finally would never run — non-player callers must not stay frozen
    try {
      opts.onMontage?.(montageRate);
    } catch (e) { bail(e); }
  }
  // GH-299 catch (3)(b): the walk MOVES are placed AFTER the cap loop —
  // tail frames advance the segment's local clock at FDT·finalSpeed, and
  // the loop above just finished mutating seg.speed, so the hold+walk must
  // span beatSec·finalSpeed KERNEL seconds starting at the segment's own
  // first tail-frame clock (startSec + playFrames·FDT·speed — exactly what
  // the k-loop's timeAt emits there). Baking these into the plan's
  // perShotCamera beforehand would ship walks that end mid-beat on every
  // montage-compressed export. The append clones the moves array — the
  // caller's plan object is never mutated (savePlan re-derives per press).
  for (const seg of timeline) {
    const w = seg.beat;
    if (!w) continue;
    const playSec = seg.endT !== null
      ? Math.min(seg.endT, seg.duration) : seg.duration;
    const startSec = Math.min(seg.startT ?? 0, playSec);
    const playFrames = Math.ceil((playSec - startSec) / (FDT * seg.speed));
    const tW = startSec + playFrames * FDT * seg.speed;
    const s = seg.speed;
    const moves = seg.camera.script.moves.slice();
    moves.push(
      { kind: 'pose', t0: tW, t1: tW + w.holdSec * s,
        cam: w.p0.cam, look: w.p0.look, fov: w.fov },
      { kind: 'dolly', t0: tW + w.holdSec * s, t1: tW + w.beatSec * s,
        fov: w.fov, path: w.path });
    seg.camera = { script: { moves } };
  }
  const spec = { ssaa: opts.ssaa, shutter: opts.shutter,
    shutterdeg: opts.shutterdeg, grade: opts.grade, dof: opts.dof,
    width: opts.width, height: opts.height, bitrate: opts.bitrate,
    format: opts.format, withAudio: opts.withAudio,
    hashFrames: opts.hashFrames,
    cinelight: opts.cinelight ?? false, // #259 studio-lighting variant
    // GH-362 layer 3: the plan-pinned container stamp (streamed sinks
    // only; createSink ignores it elsewhere)
    ...(Number.isFinite(opts.creationTime)
      ? { creationTime: opts.creationTime } : {}),
    ...(fullStream ? { stream: opts.stream } : {}) }; // GH-305 streaming sink
  // GH-301 fade transitions: opts.fades[j] = { i: timeline index, t: the
  // cut anchor in SEGMENT-LOCAL kernel seconds, dur: output-clock seconds }
  // (playback.js savePlan — the ONE schedule owner). Mapped to OUTPUT-FRAME
  // windows HERE, after the convergence loop mutated seg.speed (§2.5
  // post-convergence law — the same discipline as the walk-move placement
  // directly above). The window center = the first frame whose ball seek
  // t >= the anchor, i.e. the exact frame the compiled camerascript cuts
  // under — "exactly black at the cut frame" (§2.4). Fades insert NO
  // frames: alpha over existing ones, so the montage arithmetic above is
  // untouched by construction.
  const fades = opts.fades ?? [];
  if (fades.length) {
    fades.forEach((f, j) => {
      if (!Number.isInteger(f?.i) || !timeline[f.i] || !Number.isFinite(f?.t)
        || !(f.dur > 0) || f.dur > 5 + 1e-9) {
        throw new Error(`renderDrill: fades[${j}] is malformed`);
      }
    });
    const starts = [];
    let acc = 0;
    for (const seg of timeline) {
      starts.push(acc);
      acc += planPlayback({ duration: seg.duration, slowmo: seg.speed,
        startT: seg.startT, endT: seg.endT, tailSec: seg.tailSec,
        headSec: seg.lead?.sec ?? 0, maxSec: Infinity }).frames;
    }
    spec.fades = fades.map((f) => {
      // GH-452: a BOUNDARY-anchored reset fade (b: 1) centers on the
      // slice's FIRST output frame — its first lead head frame when one
      // exists, else its first play frame: the exact frame the replaced
      // address appears on, so "exactly black at the cut instant" (§2.4)
      // holds at the state swap. The window's out-half rides the previous
      // slice's tail/withdrawal frames (windows simply evaluate clipped).
      if (f.b === 1) return { a: starts[f.i], h: (f.dur / 2) * 60 };
      const seg = timeline[f.i];
      const startT = seg.startT ?? 0;
      const endSec = seg.endT !== null && seg.endT !== undefined
        ? Math.min(seg.endT, seg.duration) : seg.duration;
      const tA = Math.max(startT, Math.min(f.t, endSec));
      const kCut = Math.max(0, Math.ceil((tA - startT) / (FDT * seg.speed) - 1e-9));
      // GH-363: kCut is play-relative — lead head frames shift the
      // segment's play window inside the output stream
      const headF = Math.round((seg.lead?.sec ?? 0) * 60);
      return { a: starts[f.i] + headF + kCut, h: (f.dur / 2) * 60 };
    });
  }
  // GH-364: the strike-point teaching plate — opts.strike = { title,
  // readout?, font? } (playback.js savePlan; title arrives LOCALIZED, the
  // one text source both surfaces paint). Per-segment glyph geometry and
  // the impact anchor RE-DERIVE from each segment's OWN record through the
  // strikeglyph.js leaf (glyphFor/impactTimeFor — record truth, so the plan
  // carries no copyable physics fields to drift). Mapped to LOCAL-frame
  // windows HERE, after the convergence loop mutated seg.speed (the GH-301
  // §2.5 post-convergence law, exactly like the fade mapping above). The
  // linger = one settle beat of the timeline's own cadence (innerTail) on
  // the OUTPUT clock — playback.js's INNER_TAIL mirror keeps the live
  // preview on the same number. The plate inserts NO frames: alpha over
  // existing ones, so the montage arithmetic is untouched by construction.
  if (opts.strike) {
    // manual-latch bail (the cap-tripwire guard shape): an import rejection
    // here sits between the probe phase's setManual(true) and
    // renderTimeline's finally — unbailed it would freeze the live app
    let sg = null;
    try { sg = await import('./strikeglyph.js'); } catch (e) { bail(e); }
    if (typeof sg.glyphFor !== 'function'
      || typeof sg.impactTimeFor !== 'function') {
      bail(new Error('strike-point overlay unavailable '
        + '(stale strikeglyph.js) — reload the app'));
    }
    const title = typeof opts.strike.title === 'string' ? opts.strike.title : '';
    const readout = opts.strike.readout !== false;
    // GH-475: the elevation/power annotation knobs (export Advanced pairs,
    // default OFF — clean clips unless opted in; values are the RECORDED
    // shot params via glyphFor, never re-derived). Requested annotations
    // against a cached pre-475 leaf would silently vanish from the burned
    // plate (the WYSIWYG lie class) — honest reload error instead (the
    // stale-strikeglyph shape above).
    const elev = opts.strike.elev === true;
    const power = opts.strike.power === true;
    if ((elev || power) && typeof sg.fmtElev !== 'function') {
      bail(new Error('strike-point annotations unavailable '
        + '(stale strikeglyph.js) — reload the app'));
    }
    spec.strike = timeline.map((seg) => {
      const glyph = sg.glyphFor(seg.record);
      if (!glyph) return null; // unreadable shot params — honest no-plate
      const startT = seg.startT ?? 0;
      const playSec = seg.endT !== null && seg.endT !== undefined
        ? Math.min(seg.endT, seg.duration) : seg.duration;
      // teaching window far edge: the record's impact anchor, clamped into
      // the slice (an impact past the out-trim bows out at the slice end).
      // The contactless fallback is the record's OWN duration — seg.duration
      // was cue-tail-EXTENDED by the probe phase above, and the teaching
      // window is the SHOT, not the withdrawal (the live preview and the
      // e2e window derivation read the raw record the same way).
      const rawDur = recDur ? recDur(seg.record)
        : (seg.record.events?.length
          ? seg.record.events[seg.record.events.length - 1].t : 0);
      const tOff = Math.min(sg.impactTimeFor(seg.record, rawDur), playSec);
      // >= (review r2 P2): a frozen-contact impact at t=0 — and a trim
      // landing exactly ON the impact — keeps the impact frame + linger
      // (kImp = 0); only an in-trim STRICTLY past the impact drops it
      if (!(tOff >= startT)) return null; // impact trimmed away — no window
      const kImp = Math.max(0,
        Math.ceil((tOff - startT) / (FDT * seg.speed) - 1e-9));
      // GH-474: the lead-carrying window anchor — kBack on the PLAY clock
      // (negative; lead head frames are rate-1, so record seconds map at
      // 60/s regardless of montage speed). Engine-probed (seg.leadBack,
      // the probe phase above); the fallback is the lead window start —
      // exact for v2, whose T_pre IS the window under the settle law.
      // strikeAlphaAt keys the backswing-synchronized window on kBack < 0;
      // lead-less segments — and plans that never declared the timing
      // promise (no window474: stale planners, seam fixtures) — carry
      // none and keep the pre-474 window (review r1 P1).
      let kBack = null;
      if (seg.lead && opts.strike.window474 === true) {
        const headF = Math.round(seg.lead.sec * 60);
        // -round(-x·60): quantized on the SAME half-up grid as the
        // planner's round(T_pre·60) head sizing (Math.round is asymmetric
        // at ±.5), so a v2 backswing lands exactly on head frame 0
        kBack = Math.max(-headF, Number.isFinite(seg.leadBack)
          ? -Math.round(-seg.leadBack * 60) : -headF);
      }
      return { kImp, hFrames: Math.max(1, Math.round(innerTail * 60)),
        glyph, title, readout, elev, power,
        ...(kBack !== null ? { kBack } : {}) };
    });
    if (!spec.strike.some(Boolean)) delete spec.strike;
  }
  let res;
  try {
    res = await renderTimeline(env, timeline, spec,
      { signal: opts.signal, onProgress: opts.onProgress,
        onPause: opts.onPause }); // GH-362: the paused-state UI hook
  } catch (e) {
    // the probe phase above latched manual mode AND replayed/restaged the
    // bed; renderTimeline's finally restores state on every path ITS try
    // reaches, but a rejection from its pre-try setup (plans/audio/sink —
    // review final round) would leave a direct caller in PLAYBACK with the
    // replay running. bail() parks the settled bed + releases manual —
    // both idempotent after a renderTimeline-internal throw.
    bail(e);
  }
  return { ...res, montageRate };
}
