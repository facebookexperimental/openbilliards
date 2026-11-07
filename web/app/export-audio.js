// Copyright (c) Meta Platforms, Inc. and affiliates.

// export-audio.js — offline soundtrack render for the video exporter:
// re-derives the audible cues from the ShotRecord (sound.js deriveCues, the
// SAME derivation live playback schedules from) and voices them through the
// SAME synth (synth.js, seeded noise) into an OfflineAudioContext — the
// export's audio is the live playback's audio, rendered faster than
// realtime and mixed at the canonical master gain.
//
// Determinism (the video-export ruling): renders are
// perceptually deterministic — event times sample-exact, sample values
// jitter ≤1.5 ulp (−141 dBFS, WebAudio float-summing order), erased by any
// lossy encode. The seeded noise buffer makes two exports byte-close.
import { deriveCues } from './sound.js';
// NAMESPACE import on purpose (module-ownership rule 5 corollary): this module
// sits in main.js's static boot graph (main.js → export.js →
// offline-render.js → here), and acousticProfile/loadSfxBank are NEW
// synth.js exports — a named import would fail module linking (black boot)
// for a returning user whose cache pairs this fresh module with a stale
// synth.js. Feature-detect the new names; stale degrades to modal voices,
// exactly like live playback (sound.js does the same). Do NOT convert to
// named imports of post-2026-07 synth.js exports.
import * as synth from './synth.js';

export const AUDIO_RATE = 48_000;   // export sample rate (ruling)
export const MASTER_GAIN = 0.8;     // canonical mix level (sound.js default)

/**
 * Render the record's soundtrack for a playback window.
 * `rate` = playback rate (slow-mo export: cues are RE-SCHEDULED at t/rate,
 * pitch untouched — exactly how live slow-mo playback schedules them).
 * Returns an AudioBuffer (2ch, 48 kHz) of ceil(clipSec·48k) frames.
 */
export async function renderShotAudio(record, { clipSec, rate = 1, startT = 0 }) {
  const frames = Math.max(1, Math.ceil(clipSec * AUDIO_RATE));
  const oac = new OfflineAudioContext(2, frames, AUDIO_RATE);
  const master = oac.createGain();
  master.gain.value = MASTER_GAIN;
  master.connect(oac.destination);
  const noise = synth.makeNoiseBuffer(oac);
  const profile = synth.acousticProfile?.(record?.initial?.equipment);
  // same clips as live; null/absent -> synth fallback. AWAITED so an export
  // never voices half a clip from the bank (live parity: sound.js latches
  // the bank decision per shot for the same reason).
  const bank = (await synth.loadSfxBank?.()) ?? null;
  // seed = index in the FULL cue list (also counting cues outside the clip
  // window) so per-event variation matches live playback's seeding exactly
  let seed = 0;
  for (const c of deriveCues(record)) {
    const when = (c.t - startT) / rate;
    if (when < 0 || when >= clipSec) { seed++; continue; }
    synth.scheduleCue(oac, master, noise, c.type, c.gain, when, { profile, seed: seed++, bank });
  }
  return oac.startRendering();
}

/**
 * Render a MULTI-SEGMENT (drill stitch) soundtrack into ONE
 * OfflineAudioContext — never per-segment AudioBuffer concat, which would
 * truncate decay tails at every boundary into audible clicks (issue #225
 * Phase B; the concat-engine plan's audio seam).
 *
 * `segments`: [{ record, rate, startT, endT, offsetSec, windowSec }] in
 * timeline order — offsetSec/windowSec in OUTPUT seconds on the global
 * clip clock (offsetSec = Σ previous segments' video seconds, windowSec =
 * that segment's video seconds INCLUDING its settle tail). Cues schedule
 * at offsetSec + (c.t − startT)/rate, mirroring renderShotAudio's law per
 * segment; cues outside [startT, endT] or past the segment window are
 * skipped but still advance the seed. Each segment keeps the per-shot
 * seeding law (seed = index in ITS record's full cue list — live playback
 * parity) and resolves its own acoustic profile from record.initial
 * .equipment; the SFX-bank decision is latched ONCE for the whole render
 * so timbre never swaps mid-clip. Decay tails ring naturally across
 * boundaries inside the single context.
 *
 * NOTE (module-ownership rule 5 corollary): this is a POST-2026-07 export —
 * boot-graph consumers must reach it via `import * as ns` + feature
 * detection (offline-render.js does), never a named import.
 * Returns an AudioBuffer (2ch, 48 kHz) of ceil(totalSec·48k) frames.
 */
export async function renderDrillAudio(segments, { totalSec }) {
  const frames = Math.max(1, Math.ceil(totalSec * AUDIO_RATE));
  const oac = new OfflineAudioContext(2, frames, AUDIO_RATE);
  const master = oac.createGain();
  master.gain.value = MASTER_GAIN;
  master.connect(oac.destination);
  const noise = synth.makeNoiseBuffer(oac);
  const bank = (await synth.loadSfxBank?.()) ?? null; // latched once per render
  for (const seg of segments) {
    const rate = seg.rate ?? 1;
    const startT = seg.startT ?? 0;
    const profile = synth.acousticProfile?.(seg.record?.initial?.equipment);
    let seed = 0; // per-shot seed reset (live playback parity)
    for (const c of deriveCues(seg.record)) {
      const local = (c.t - startT) / rate;
      if (local < 0 || local >= seg.windowSec
        || (seg.endT != null && c.t > seg.endT)) { seed++; continue; }
      synth.scheduleCue(oac, master, noise, c.type, c.gain,
        seg.offsetSec + local, { profile, seed: seed++, bank });
    }
  }
  return oac.startRendering();
}

// ---------------------------------------------------------------------------
// GH-373: the WINDOWED audio bed (full-length streaming exports)
// ---------------------------------------------------------------------------
// renderDrillAudio above builds ONE whole-session AudioBuffer — 0.38 MB/s
// of output resident, the allocation that walled v1 with-sound full
// exports at FULLSTREAM_AUDIO_CAP_SEC (offline-render.js). The windowed
// twin below renders the SAME bed in bounded windows WITHOUT crossfades:
// every window re-schedules, with an exact-state pre-roll, every cue whose
// sound can still be ringing when the window's emitted range begins, so
// the emitted PCM is the one-context render's PCM restricted to that
// range (the no-boundary-clicks law holds by CONSTRUCTION, not by fade):
//
//   • every voice is a translation-invariant function of (t − when): the
//     seeded noise buffer and bank PCM are per-context identical, source
//     starts / gain automation are scheduled relative to `when`, biquad
//     filters start from zero state and see identical input sequences —
//     so re-scheduling a cue at (when − windowOrigin) reproduces its
//     samples exactly (window origins are whole sample frames, aligned to
//     the 128-frame render quantum, so sub-sample phase is preserved);
//   • AUDIO_BED_TAIL_SEC bounds every cue's audible support, DERIVED from
//     the synth/bank tails (below) — a cue older than that at a window's
//     emitted start contributes float-zero there and is safely excluded.
//
// AUDIO_BED_TAIL_SEC derivation (keep in sync with synth.js when editing
// voices or shipping longer bank clips):
//   1. longest scheduled source: gullyRumble stops at when + 0.22 + 1.3 =
//      when + 1.52 s (every mode()/crack()/knock() source stops ≤ when +
//      0.30 s; the pocket rattle train ends ≤ when + 0.24 s);
//   2. longest bank clip: pocket-d3.wav 1.20 s, played from its 4 ms
//      pre-roll at the slowest seeded rate (carom fScale 0.93 × 0.975
//      jitter ≈ 0.907) → ≤ 1.33 s;
//   3. after the last source stops only IIR ring-out remains: the
//      highest-Q voice (CLICK_MODES Q=18 at the lowest scaled center
//      ~1.1 kHz) has τ = Q/(πf) ≈ 5.3 ms — the remaining ≥ 0.47 s of the
//      2.0 s bound is > 88τ, decaying any state below float32 denormals
//      (numerically exact zeros).
export const AUDIO_BED_TAIL_SEC = 2.0;
// pre-roll in frames: 2.0 s · 48 kHz = 96 000 = 128 · 750 (quantum-aligned)
export const AUDIO_BED_PREROLL_FRAMES = AUDIO_BED_TAIL_SEC * AUDIO_RATE;
// ~30.72 s per window: a multiple of 1024 (AudioData chunk = AAC frame
// size, so mid-stream window joins never produce ragged encoder framing)
// and hence of the 128-frame render quantum. Window context ≈ (96 000 +
// 1 474 560) frames · 2 ch · 4 B ≈ 12.6 MB — the O(window) transient.
export const AUDIO_WINDOW_FRAMES = 1024 * 1440;

/**
 * Windowed twin of renderDrillAudio (GH-373): an async generator yielding
 * { buffer, baseFrames, skipFrames, frames } per window in timeline order —
 * `buffer` holds skipFrames of exact-state pre-roll (DISCARD) followed by
 * `frames` of bed PCM whose global position is `baseFrames`. Cue
 * derivation, seeding, profiles and the once-per-render bank latch follow
 * renderDrillAudio's laws exactly (same segments contract); the e2e-export
 * seam arm holds the two renderers byte-close over a shared timeline.
 * `preRollFrames`/`windowFrames` are overridable for that arm's red proof
 * (a 0 pre-roll is the naive butt-join this design exists to avoid) —
 * production callers use the defaults.
 *
 * NOTE (module-ownership rule 5 corollary): post-2026-08 export — boot-graph
 * consumers must feature-detect it via the namespace (offline-render.js
 * does; a stale copy of THIS module simply falls back to the one-piece
 * bed and offline-render keeps the v1 with-sound wall for that pairing).
 */
export async function* renderDrillAudioWindowed(segments, { totalSec,
  windowFrames = AUDIO_WINDOW_FRAMES,
  preRollFrames = AUDIO_BED_PREROLL_FRAMES } = {}) {
  const totalFrames = Math.max(1, Math.ceil(totalSec * AUDIO_RATE));
  const bank = (await synth.loadSfxBank?.()) ?? null; // latched once per render
  const cues = deriveBedCues(segments);
  for (let base = 0; base < totalFrames; base += windowFrames) {
    const frames = Math.min(windowFrames, totalFrames - base);
    const skip = Math.min(base, preRollFrames); // window 0 needs none
    const t0 = (base - skip) / AUDIO_RATE; // context origin, whole frames
    const t1 = (base + frames) / AUDIO_RATE;
    const oac = new OfflineAudioContext(2, skip + frames, AUDIO_RATE);
    const master = oac.createGain();
    master.gain.value = MASTER_GAIN;
    master.connect(oac.destination);
    const noise = synth.makeNoiseBuffer(oac);
    for (const q of cues) {
      // [t0, t1): every cue that can still ring inside the emitted range
      // (pre-roll rebuilds its mid-flight state); anything older is
      // float-zero there by the AUDIO_BED_TAIL_SEC derivation above
      if (q.when < t0 || q.when >= t1) continue;
      synth.scheduleCue(oac, master, noise, q.type, q.gain, q.when - t0,
        { profile: q.profile, seed: q.seed, bank });
    }
    yield { buffer: await oac.startRendering(), baseFrames: base,
      skipFrames: skip, frames };
  }
}

/** The global cue schedule, derived ONCE per bed render (renderDrillAudio's
 * exact laws: per-shot seed reset, skip-with-seed-advance, per-record
 * profile) — shared by the two windowed renderers so their inclusion law
 * can never drift. */
function deriveBedCues(segments) {
  const cues = [];
  for (const seg of segments) {
    const rate = seg.rate ?? 1;
    const startT = seg.startT ?? 0;
    const profile = synth.acousticProfile?.(seg.record?.initial?.equipment);
    let seed = 0;
    for (const c of deriveCues(seg.record)) {
      const local = (c.t - startT) / rate;
      if (local < 0 || local >= seg.windowSec
        || (seg.endT != null && c.t > seg.endT)) { seed++; continue; }
      cues.push({ type: c.type, gain: c.gain,
        when: seg.offsetSec + local, profile, seed: seed++ });
    }
  }
  return cues;
}

// ---------------------------------------------------------------------------
// GH-435: the windowed-EXACT bed (the deterministic-class expansion)
// ---------------------------------------------------------------------------
// renderDrillAudioWindowed above is byte-CLOSE across runs but not
// byte-EXACT: a window's many voices all converge on the one master
// summing junction, and the engine's float-summing ORDER there is not
// stable across renders (measured 2026-08-09 on the pinned shell,
// probe-435: dense windows differed A/A within one boot; the same jitter
// class the GH-362 layer-3 ruling measured on the one-piece bed). That
// ±ulp jitter is inaudible — but it is exactly what kept with-sound plans
// out of the crash-resume fast-forward's deterministic class (issue #435).
//
// The exact twin below removes the unstable step WITHOUT re-implementing
// any DSP: each cue's voice renders ALONE in its own small
// OfflineAudioContext (measured byte-reproducible across runs AND across
// boots — a fresh per-cue context has a stable node-allocation pattern, so
// the ≤9-input junction at its destination sums in a stable order), and
// the WINDOW is composed page-side: cue PCM summed sample-by-sample in
// float32 (Math.fround) in the one canonical order — the global cue-list
// order — then scaled by the master gain. Byte-identical output is then a
// property of IEEE-754 arithmetic, not of engine scheduling; the result
// sits INSIDE the same ±ulp class as any one-piece render (only the
// summation grouping differs), which the e2e-export parity arm holds to
// the FULL4 bound. The per-cue render stability itself remains a MEASURED
// law of the pinned shell — production correctness never rests on it: the
// crash-resume boundary hash refuses a jittered re-render into the honest
// restart flow (playback.js resumeRunInner).
//
// Memory: O(window) preserved — at any instant the cache holds only the
// cue buffers whose 2.0 s support overlaps the current window (worst case
// a few dozen × 384 KB, the same transient class as the 12.6 MB window).
const CUE_FRAMES = AUDIO_BED_PREROLL_FRAMES; // one cue's support (2.0 s law)

/**
 * Byte-exact windowed twin of renderDrillAudioWindowed (GH-435): same
 * segments contract, same window grid (multiples of the 1024-frame AAC
 * chunk), same yield shape — `skipFrames` is always 0 (windows are
 * composed, not re-rendered, so no pre-roll is ever needed: a cue
 * straddling a join contributes its exact tail bytes to the next window
 * from the SAME per-cue render). The bed is dual-mono by construction
 * (every voice is mono and nothing pans — measured on the production bed:
 * ch0 bytes == ch1 bytes), so one mono composition fills both channels.
 *
 * NOTE (module-ownership rule 5 corollary): post-2026-08 export — boot-graph
 * consumers must feature-detect it via the namespace (offline-render.js
 * does; a stale copy of THIS module degrades to the byte-close windowed
 * bed and the with-sound class honestly stays on the restart flow).
 */
export async function* renderDrillAudioWindowedExact(segments, { totalSec,
  windowFrames = AUDIO_WINDOW_FRAMES } = {}) {
  const totalFrames = Math.max(1, Math.ceil(totalSec * AUDIO_RATE));
  const bank = (await synth.loadSfxBank?.()) ?? null; // latched once per render
  const cues = deriveBedCues(segments);
  for (const q of cues) q.base = Math.floor(q.when * AUDIO_RATE);
  const mg = Math.fround(MASTER_GAIN);
  const renderCue = async (q) => {
    // context origin at the cue's whole-frame base; the sub-sample start
    // offset is preserved exactly as any whole-frame-origin window would
    // see it (the GH-373 translation-invariance argument)
    const oac = new OfflineAudioContext(1, CUE_FRAMES, AUDIO_RATE);
    const noise = synth.makeNoiseBuffer(oac);
    synth.scheduleCue(oac, oac.destination, noise, q.type, q.gain,
      q.when - q.base / AUDIO_RATE, { profile: q.profile, seed: q.seed, bank });
    return (await oac.startRendering()).getChannelData(0);
  };
  // The CARRY pair (review GH-435 r1 P1 + r2 P2): each cue renders exactly
  // ONCE — at the first window its support intersects — and everything of
  // it past that window's end folds into `carry` (anchored at the window
  // end), which seeds the next window's composition. The resident set is
  // therefore TWO CUE_FRAMES buffers (768 KB) regardless of cue density —
  // never a per-cue cache (a dense boundary parked one 384 KB buffer PER
  // crossing cue, and the final window's cache had no successor to
  // release it). Byte-parity with the per-cue-cache formulation is exact:
  // the cue list is fold-ordered, a crossing cue precedes every
  // later-window cue in that order, and fround(fround(0+A)+B) seeding a
  // window is bit-identical to adding A then B into a zero window — only
  // buffer LIFETIME changed, not one arithmetic step (probe-435 re-run:
  // same window hashes).
  let carry = new Float32Array(CUE_FRAMES);
  let spare = new Float32Array(CUE_FRAMES);
  for (let base = 0; base < totalFrames; base += windowFrames) {
    const frames = Math.min(windowFrames, totalFrames - base);
    const end = base + frames;
    const out = new Float32Array(frames);
    // seed from the carry, then re-anchor its remainder at `end` (windows
    // shorter than a cue's support — the FULL7/probe override shapes —
    // leave older tails that belong to windows beyond the next one; the
    // shift keeps them, still ahead of every later cue in fold order)
    out.set(carry.subarray(0, Math.min(frames, CUE_FRAMES)));
    spare.fill(0);
    if (frames < CUE_FRAMES) spare.set(carry.subarray(frames));
    [carry, spare] = [spare, carry];
    for (const q of cues) {
      // one render per cue, at the first intersecting window; its whole
      // remaining support lands NOW (head into out, tail into carry) —
      // the same 2.0 s AUDIO_BED_TAIL_SEC support law the pre-roll bed
      // derives
      if (q.done || q.base >= end || q.base + CUE_FRAMES <= base) continue;
      q.done = true;
      const buf = await renderCue(q);
      const from = Math.max(base, q.base);
      const toOut = Math.min(end, q.base + CUE_FRAMES);
      for (let k = from; k < toOut; k++) {
        out[k - base] = Math.fround(out[k - base] + buf[k - q.base]);
      }
      for (let k = end; k < q.base + CUE_FRAMES; k++) {
        carry[k - end] = Math.fround(carry[k - end] + buf[k - q.base]);
      }
    }
    for (let k = 0; k < frames; k++) out[k] = Math.fround(out[k] * mg);
    const buffer = new AudioBuffer({ numberOfChannels: 2, length: frames,
      sampleRate: AUDIO_RATE });
    buffer.copyToChannel(out, 0);
    buffer.copyToChannel(out, 1);
    yield { buffer, baseFrames: base, skipFrames: 0, frames };
  }
}

/**
 * Chunk a rendered AudioBuffer into planar-f32 AudioData frames for
 * AudioEncoder (WebCodecs wants successive timestamped chunks; 1024-frame
 * chunks keep encoder latency + memory trivial).
 * `opts` (GH-373, ADDITIVE — defaults preserve the whole-buffer behavior
 * byte-for-byte): { baseFrames, skipFrames, frames } window the emission
 * for renderDrillAudioWindowed's yields — skipFrames of pre-roll are
 * dropped, `frames` are emitted, and timestamps continue the GLOBAL bed
 * clock at baseFrames. Only reached behind the renderDrillAudioWindowed
 * feature detection (same-module pairing — a stale copy without the opts
 * can never be handed a windowed buffer).
 */
export function* audioDataChunks(buffer, chunkFrames = 1024,
  { baseFrames = 0, skipFrames = 0, frames = null } = {}) {
  const ch = buffer.numberOfChannels;
  const end = skipFrames + (frames ?? (buffer.length - skipFrames));
  const planes = [];
  for (let c = 0; c < ch; c++) planes.push(buffer.getChannelData(c));
  for (let off = skipFrames; off < end; off += chunkFrames) {
    const n = Math.min(chunkFrames, end - off);
    const data = new Float32Array(n * ch);
    for (let c = 0; c < ch; c++) data.set(planes[c].subarray(off, off + n), c * n);
    yield new AudioData({
      format: 'f32-planar',
      sampleRate: buffer.sampleRate,
      numberOfFrames: n,
      numberOfChannels: ch,
      timestamp: Math.round((baseFrames + off - skipFrames) * 1e6
        / buffer.sampleRate),
      data,
    });
  }
}
