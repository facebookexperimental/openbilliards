// Copyright (c) Meta Platforms, Inc. and affiliates.

// synth.js — the pure WebAudio synthesis shared by LIVE playback
// (web/app/sound.js) and the OFFLINE export audio render
// (web/app/export-audio.js): one noise buffer + one cue-voicing function,
// parameterized over any BaseAudioContext, so a live session and an
// exported file voice the same cue list identically.
//
// Voicing model (audio-calibration 2026-07, openbilliards-demos/analysis/
// audio): each cue = a millisecond noise "crack" excitation + a bank of
// damped resonant modes (band-passed noise under exponential envelopes) —
// the modal-impact recipe (van den Doel & Pai; Farnell ch. solid impacts).
// The previous single-bandpass-noise-burst voicing measured spectrally
// FLAT (flatness 0.26–0.36) where real impacts are strongly modal
// (0.002–0.02, both in owner-table footage and reference-footage
// audio) — that flatness gap WAS the "papery synthetic" sound. Mode
// centers/decays target the measured fingerprints: ball-ball ~1.9–2.1 kHz
// centroid with hf(>2k) ≈ 0.4 and ~30 ms dry decay; cue tip ~1.3 kHz and
// dull; cushion ~215 Hz deep thump (owner Diamond Pro-Am footage);
// velocity maps to loudness (power law) AND brightness (per-mode tilt +
// contact-hardening: faster impact -> shorter, brighter crack).
//
// Equipment-aware acoustics: acousticProfile(equipmentIds) derives a
// per-class parameter overlay from the catalog ids a ShotRecord already
// carries (record.initial.equipment — provenance metadata, catalog.ts).
// The DEFAULT profile is the measured pool anchor; other entries
// apply physically-reasoned deltas (ball size/wear -> mode scale/tilt,
// cloth -> cushion damping + hiss, table -> rail pitch + pocket kind).
//
// Determinism (export ruling, the video-export design note (internal)): the noise
// buffer is filled from a SEEDED PRNG (mulberry32), not Math.random — two
// exports of the same shot must sound byte-close, and live playback gets
// reproducible audio for free. Per-event micro-variation (mode detune /
// gain jitter, anti-machine-gun) is seeded from the cue's INDEX in the
// deriveCues list, identical in the live and offline schedulers.
//
// Impact-realism wave (2026-11; the internal audio calibration record, phase 2): the voices come from a PLAN.
// planVoices() reads a ShotRecord and returns every voice its playback sounds: the four impact classes with what each
// impact physically was (true strength, cut, cluster size, rail nose or pocket jaw, tip offset, place on the table), the
// sounds between them (balls rolling on the cloth, a hop landing on the bed, a pocketed ball running down the return
// track to the tray), the mix of a dense burst (masking, a voice bound, staged levels: no compressor, the mix stays
// linear) and the clip rotation. scheduleVoice() voices one of them; scheduleCue() remains for a caller without a plan.
// The bank's clips are conditioned once at load (conditionClip): each is cut down to its impact. Everything here is a
// pure function of the record and the seed: nothing reads a clock, and nothing writes to the record or the game.

export const NOISE_SEED = 1234; // one canonical seed everywhere

/** mulberry32 — tiny seeded PRNG, uniform in [0, 1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 0.5 s seeded white-noise buffer (the source every cue voice filters). */
export function makeNoiseBuffer(ac, seed = NOISE_SEED) {
  const buf = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.5), ac.sampleRate);
  const data = buf.getChannelData(0);
  const rand = mulberry32(seed);
  for (let i = 0; i < data.length; i++) data[i] = rand() * 2 - 1;
  return buf;
}

// ---------------------------------------------------------------------------
// Real-recording SFX bank (audio-calibration phase 1, 2026-07)
// ---------------------------------------------------------------------------
// click/cue/pocket are voiced from license-clean real recordings
// (web/assets/sfx/, see CREDITS.md there): velocity TIERS pick timbre,
// the runtime gain law does the level work (all clips are normalized to
// -6 dBFS), and a seeded round-robin + playback-rate jitter kills the
// machine-gun effect deterministically. Rolling, bed landings and the
// return track are synthesized; every class falls back to the modal synth
// when the bank is unavailable (fetch failure, headless boots, app:// quirks).
// WAVs are parsed by hand (16-bit PCM RIFF) — decodeAudioData's per-browser
// decoders would break the export byte-closeness ruling; a PCM copy is
// bit-identical everywhere.

// The whole bank is OWNER-RECORDED on the reference table (Diamond Pro-Am
// + Simonis + Aramith — the app default equipment and the catalog Measured
// anchor; dedicated session 2026-07, slate-driven extraction). No
// third-party audio ships; other equipment derives via the profile DSP.
// Inside a tier the clips are listed from the dullest to the brightest (spectral centroid of the conditioned clip,
// measured 2026-11; the calibration record lists the values). The order matters: the velocity ladder below walks the
// tiers end to end, so an impact's timbre follows its strength in small steps.
export const SFX_FILES = {
  click: {
    s: ['click-s1.wav', 'click-s2.wav', 'click-s3.wav', 'click-s4.wav'],
    m: ['click-m4.wav', 'click-m3.wav', 'click-m1.wav', 'click-m2.wav'],
    h: ['click-h4.wav', 'click-h2.wav', 'click-h1.wav', 'click-h3.wav'],
  },
  cue: {
    m: ['cue-m3.wav', 'cue-m1.wav', 'cue-m4.wav', 'cue-m2.wav'],
    h: ['cue-h3.wav', 'cue-h4.wav', 'cue-h2.wav', 'cue-h1.wav'],
  },
  // close-mic S2 rail drills (owner session group 2, 2026-07-21): the
  // full velocity ladder recorded AT the rail — snr ~25-51 dB per tier
  cushion: {
    s: ['cushion-s4.wav', 'cushion-s3.wav', 'cushion-s2.wav', 'cushion-s1.wav'],
    m: ['cushion-m3.wav', 'cushion-m2.wav', 'cushion-m1.wav', 'cushion-m4.wav'],
    h: ['cushion-h1.wav', 'cushion-h3.wav', 'cushion-h2.wav', 'cushion-h4.wav'],
  },
  // d = drop-pocket action (corner pocket/side pocket/rattle), r = full return-gully takes
  // (drop + real under-table rumble; no synth rumble layered on top)
  pocket: {
    d: ['pocket-d1.wav', 'pocket-d2.wav', 'pocket-d3.wav', 'pocket-d4.wav'],
    r: ['pocket-r1.wav', 'pocket-r2.wav', 'pocket-r3.wav'],
  },
};
const SFX_BASE = 'assets/sfx/';

/** Minimal RIFF/WAVE parser for our own 16-bit PCM mono files. Chunk sizes
 * are UNTRUSTED: every read is clamped to the real ArrayBuffer bounds so a
 * lying header fails THIS clip (per-clip catch in loadSfxBank skips it) —
 * never an out-of-bounds read or a header-declared giant allocation. */
function parseWav(ab) {
  const dv = new DataView(ab);
  if (dv.byteLength < 12) throw new Error('not a wav');
  const tag = (o) => String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1),
    dv.getUint8(o + 2), dv.getUint8(o + 3));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('not a wav');
  let off = 12, rate = 44100, channels = 1, data = null;
  while (off + 8 <= dv.byteLength) {
    const id = tag(off), size = dv.getUint32(off + 4, true), body = off + 8;
    if (size > dv.byteLength - body) throw new Error('wav: chunk overruns buffer');
    if (id === 'fmt ') {
      if (size < 16) throw new Error('wav: short fmt chunk');
      if (dv.getUint16(body, true) !== 1 || dv.getUint16(body + 14, true) !== 16) {
        throw new Error('wav: want 16-bit PCM');
      }
      channels = dv.getUint16(body + 2, true);
      rate = dv.getUint32(body + 4, true);
      // createBuffer would throw at VOICE time (uncaught) on a junk rate;
      // reject at parse time where the per-clip tolerance catches it
      if (channels < 1 || rate < 8000 || rate > 192000) throw new Error('wav: bad fmt');
    } else if (id === 'data') {
      const n = Math.floor(size / 2 / channels);
      if (n < 1) throw new Error('wav: empty data chunk');
      data = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        data[i] = dv.getInt16(body + i * 2 * channels, true) / 32768;
      }
    }
    off = body + size + (size & 1);
  }
  if (!data) throw new Error('wav: no data chunk');
  return { rate, data };
}

// ---------------------------------------------------------------------------
// Clip conditioning (impact-realism wave, 2026-11)
// ---------------------------------------------------------------------------
// The recordings are far-field takes sliced out of running table sound. Measured on the shipped bank: every clip carries
// 9-22 ms of lead-in before its impact, and a tail that stays within 12-18 dB of the peak for the rest of the clip (the
// room, the balls rolling on, and later hits of the same take; in five click clips a later hit is louder than the impact).
// Played whole, each event dragged that tail along, its true onset sat 6-16 ms after the scheduled time, and a break stacked
// half a second of wash per ball. conditionClip() isolates the impact once, at load:
//   1. onset: the first 0.5 ms block within 8 dB of the head's peak (the slicer's hard start, the first 3 ms, is skipped);
//   2. a 1 ms faded lead-in, so the impact sounds at the scheduled time;
//   3. the direct sound, and no more. In these takes each band falls fast from its peak and then stays at a level for the
//      rest of the clip: the room, the table, and the rolling the impact set off. The game voices those itself (the table
//      body under a click, the rolling layer, the live room), so a clip keeps each band untouched until it has reached
//      that level, and from there fades it at the rate the direct sound itself fell. Both numbers are measured on these
//      recordings, per class (CLIP_SHAPE). For clicks and tip strikes the band below the split is then weighted so that
//      no clip of the class carries more of it than the class's median;
//   4. level: the peak back at -6 dBFS (the level laws' reference), then moved half-way (in dB) toward the class's
//      reference energy. Equal peaks alone left the variants of one tier several dB apart in energy, so two equal hits
//      in a row jumped in loudness with the clip that happened to play.
// It uses only + - * /, comparisons and square roots, each exactly rounded by IEEE 754 (no Math.exp / sin / pow, whose
// last bit differs between engines), so the conditioned PCM is bit-identical everywhere: the same reason the WAV parser
// above is hand-written.

/** Per-class shaping. holdMs: how long after the onset the direct sound takes to fall to the level the take then stays
 * at; until then the clip is untouched. hiMs / loMs: the decay time constant of that fall above and below the split near
 * 900 Hz; from the hold on, each band fades at it. For click, cue and cushion these are class medians measured on the
 * shipped recordings themselves (the owner's takes; the measurement and its table are in
 * the internal audio calibration record, phase 2), rounded to 0.5 ms. A cushion take falls clearly in both
 * bands, and each band has its own rate. In a click or a tip take the band below the split has no fall of its own to
 * measure (its level drops 7-8 dB and stays), so it follows the band above. The pocket take is a knock train, not one
 * impact: it only loses its tail. maxMs: the length kept (the faded bands are 60 dB under their level at the hold by
 * then). energy: the class's reference energy (sum of squares per second of sample rate, at a -6 dBFS peak: the median
 * of the conditioned class). balance, where a class has one: the most energy the band below the split may keep relative
 * to the band above it (the median of the class). A ball click and a tip strike carry table rumble there, by very
 * different amounts from take to take. A cushion and a pocket ARE their low band: no balance, the band stays as
 * recorded. */
export const CLIP_SHAPE = Object.freeze({
  click:   { holdMs: 7.5, hiMs: 5.5, loMs: 5.5, balance: 0.47, maxMs: 50, energy: 1.8e-4 },
  cue:     { holdMs: 8.5, hiMs: 6.5, loMs: 6.5, balance: 1.3, maxMs: 60, energy: 1.95e-4 },
  cushion: { holdMs: 5.5, hiMs: 2.5, loMs: 5, maxMs: 45, energy: 2.2e-4 },
  pocket:  { holdMs: 40,  hiMs: 45, loMs: 70, maxMs: 420, energy: 5.6e-4 },
});

/** Isolate one clip's impact (see the section note). Pure; returns a new Float32Array, or `data` itself when the clip is
 * too short or silent to shape. */
export function conditionClip(data, rate, shape) {
  const n = data.length;
  const blk = Math.max(1, Math.floor(rate / 2000));        // 0.5 ms
  const first = Math.min(n, 6 * blk);                       // skip the slicer's hard start
  const last = Math.min(n, Math.floor(rate * 0.03));        // the impact sits inside the first 30 ms
  let head = 0;
  for (let i = first; i < last; i++) {
    const a = data[i] < 0 ? -data[i] : data[i];
    if (a > head) head = a;
  }
  let on = first;
  for (let b = first; b + blk <= last; b += blk) {
    let m = 0;
    for (let i = b; i < b + blk; i++) {
      const a = data[i] < 0 ? -data[i] : data[i];
      if (a > m) m = a;
    }
    if (m >= 0.4 * head) { on = b; break; }
  }
  const s0 = Math.max(0, on - Math.floor(rate / 1000));    // 1 ms lead-in
  const len = Math.min(n - s0, Math.floor(rate * shape.maxMs / 1000));
  if (!(head > 0) || len < 16) return data;
  const out = new Float32Array(len);
  const lo = new Float64Array(len), hi = new Float64Array(len);
  const a = 1 - 5655 / rate;                                // one-pole split near 900 Hz (2*pi*900 / rate)
  let lp = 0;
  for (let i = 0; i < s0; i++) lp = a * lp + (1 - a) * data[i]; // settle the split before the kept span
  const lead = on - s0;
  const hold = lead + Math.floor(rate * shape.holdMs / 1000);
  const kHi = 1 - 1000 / (shape.hiMs * rate), kLo = 1 - 1000 / (shape.loMs * rate);
  const fade = Math.max(1, Math.floor(rate * 0.005));
  let gHi = 1, gLo = 1, eLo = 0, eHi = 0;
  for (let i = 0; i < len; i++) {
    const x = data[s0 + i];
    lp = a * lp + (1 - a) * x;
    if (i >= hold) { gHi *= kHi; gLo *= kLo; }
    let w = 1;                                              // the lead-in and end fades
    if (i < lead) w = i / lead;
    if (i >= len - fade) w *= (len - 1 - i) / fade;
    lo[i] = lp * gLo * w;
    hi[i] = (x - lp) * gHi * w;
    eLo += lo[i] * lo[i];
    eHi += hi[i] * hi[i];
  }
  // the low band's weight: the class balance where there is one (kept between 0.2 and 1), else as recorded
  let wLo = 1;
  if (shape.balance > 0 && eLo > 0 && eHi > 0) wLo = Math.min(1, Math.max(0.2, Math.sqrt(shape.balance * eHi / eLo)));
  let peak = 0;
  for (let i = 0; i < len; i++) {
    const y = lo[i] * wLo + hi[i];
    out[i] = y;
    const m = y < 0 ? -y : y;
    if (m > peak) peak = m;
  }
  if (peak > 0) {
    let g = 0.5 / peak;
    if (shape.energy > 0) {
      let e = 0;
      for (let i = 0; i < len; i++) e += out[i] * out[i];
      e = e * g * g / rate;
      // half the energy correction in dB: amplitude ratio (ref / e)^(1/4). Math.sqrt is exactly rounded everywhere.
      if (e > 0) g *= Math.min(1.6, Math.max(0.5, Math.sqrt(Math.sqrt(shape.energy / e))));
    }
    for (let i = 0; i < len; i++) out[i] *= g;
  }
  return out;
}

let sfxBankPromise = null;
/** Fetch + parse the whole bank once (idempotent while in flight or after a
 * SUCCESSFUL load). Resolves to the bank, or null when unavailable — callers
 * then take the synth fallback. A null result is NOT cached: a transient
 * outage (offline boot, dev-server hiccup) must not demote the session to
 * the synth forever — the next loadSfxBank() call retries the fetches. */
export function loadSfxBank(base = SFX_BASE) {
  if (!sfxBankPromise) {
    const p = (async () => {
      if (typeof fetch === 'undefined') return null;
      const clips = new Map(), peaks = new Map();
      const names = [];
      for (const tiers of Object.values(SFX_FILES)) {
        for (const list of Object.values(tiers)) names.push(...list);
      }
      await Promise.all(names.map(async (n) => {
        // per-clip failures skip that clip only — one missing file must
        // not silently demote the whole game to the synth fallback
        try {
          const res = await fetch(base + n);
          if (!res.ok) return;
          const clip = parseWav(await res.arrayBuffer());
          const shape = CLIP_SHAPE[n.slice(0, n.indexOf('-'))];
          if (shape) clip.data = conditionClip(clip.data, clip.rate, shape);
          let peak = 0;
          for (let i = 0; i < clip.data.length; i++) { const a = Math.abs(clip.data[i]); if (a > peak) peak = a; }
          peaks.set(n, peak); // voiceSample caps a voice by it
          clips.set(n, clip);
        } catch { /* skip */ }
      }));
      // shaped: the clips start 1 ms before their impact (voiceSample plays them from 0, not past a 4 ms pre-roll)
      return clips.size ? { clips, buffers: new WeakMap(), shaped: true, peaks } : null;
    })().catch(() => null);
    p.then((b) => { if (!b && sfxBankPromise === p) sfxBankPromise = null; });
    sfxBankPromise = p;
  }
  return sfxBankPromise;
}

/** Per-context AudioBuffer cache (contexts can't share nodes; PCM they can). */
function bankBuffer(ac, bank, name) {
  let per = bank.buffers.get(ac);
  if (!per) { per = new Map(); bank.buffers.set(ac, per); }
  let buf = per.get(name);
  if (!buf) {
    const clip = bank.clips.get(name);
    buf = ac.createBuffer(1, clip.data.length, clip.rate);
    buf.getChannelData(0).set(clip.data);
    per.set(name, buf);
  }
  return buf;
}

const SAMPLE_LEVEL = {
  // base × gain^exp — level law measured from the owner-table speed ladder. The bases carry a make-up for the clip
  // conditioning (2026-11): a conditioned clip is the direct sound alone, far shorter than the whole take that played
  // before, and at an equal peak it carries much less energy. Each base is set so that an isolated impact holds the
  // energy (over 250 ms) it had before the conditioning, at equal strength: click +8.3 dB, cushion +6.2, cue +5.9,
  // pocket +2.1 over the pre-conditioning bases (0.9, 1.0, 0.55, 0.85). The peaks rise with it; the plan's staging
  // (planVoices) and the per-clip cap (voiceSample) hold them under full scale, so the hardest hits end a few dB short.
  click: { base: 2.35, exp: 1.35 },
  cue: { base: 1.08, exp: 1.25 },
  cushion: { base: 2.05, exp: 1.3 },
  pocket: { base: 1.08, exp: 1.2 },
};

/** Velocity tier of a sampled voice. `dither` in [-0.5, 0.5) is the voice's seeded offset: near a tier edge the pick is
 * shared between the two neighbours, so the timbre does not step at one exact speed. */
export function sampleTier(type, gain, dither = 0) {
  const g = gain + dither * 0.12;
  if (type === 'click' || type === 'cushion') return g < 0.35 ? 's' : g < 0.7 ? 'm' : 'h';
  if (type === 'cue') return g < 0.55 ? 'm' : 'h';
  return 'x';
}

/** The velocity ladder of a class: its tiers end to end, soft to hard (each tier dull to bright). */
const LADDER = {};
for (const type of ['click', 'cushion', 'cue']) {
  LADDER[type] = [...(SFX_FILES[type].s ?? []), ...SFX_FILES[type].m, ...SFX_FILES[type].h];
}

/** Where on its class's ladder an impact of strength `gain` sits (a fractional clip index). The tier edges are the ones
 * sampleTier() uses; between them the position moves linearly, so a slightly harder hit draws from slightly brighter
 * clips instead of jumping a whole tier at one speed. */
export function ladderPos(type, gain) {
  const n = LADDER[type]?.length ?? 0;
  if (!n) return 0;
  const g = Math.max(0.05, Math.min(1, gain));
  if (type === 'cue') return g < 0.55 ? (g - 0.05) / 0.5 * 3.5 : 3.5 + (g - 0.55) / 0.45 * (n - 4.5);
  if (g < 0.35) return (g - 0.05) / 0.3 * 3.5;
  if (g < 0.7) return 3.5 + (g - 0.35) / 0.35 * 4;
  return 7.5 + (g - 0.7) / 0.3 * (n - 8.5);
}

/** The ladder clips an impact at position `pos` may draw from: the ones within 1.5 steps, at least two. */
export function ladderWindow(type, pos) {
  const n = LADDER[type]?.length ?? 0;
  let a = Math.max(0, Math.ceil(pos - 1.5)), b = Math.min(n - 1, Math.floor(pos + 1.5));
  if (b - a < 1) { if (a > 0) a--; else if (b < n - 1) b++; }
  const out = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
}

/** Brightness law: the lowpass corner [Hz] a sampled impact plays through. It rises with the impact's strength (a harder
 * hit is a shorter contact, so a brighter one), continuously, inside and across the velocity tiers. A cushion stays
 * duller than a ball click at every strength: rubber is the softer contact. */
export function brightnessHz(type, gain) {
  if (type === 'click') return 2200 + 9000 * Math.pow(gain, 0.75);
  if (type === 'cushion') return 600 + 4200 * Math.pow(gain, 0.9);
  if (type === 'cue') return 2400 + 5000 * Math.pow(gain, 0.8);
  return 1200 + 5200 * gain; // pocket
}

/** Equipment tilt on the brightness corner: dull equipment (worn balls, soft tips) lowers it, hard equipment raises it. */
const tiltScale = (tilt) => (tilt < 1 ? Math.pow(Math.max(tilt, 0.25), 1.6) : Math.min(tilt, 1.5));

/** A tip offset beyond this fraction of the commanded miscue limit is a miscue (the kernel refuses such a strike today, so
 * only a record from outside the app can carry one; the edge of the limit is a legal, glancing hit). */
export const MISCUE_OFF = 1.02;

/** The junction law. A voice is several layers (a clip, its body, a knock …) that must reach `dest` as a sum, and the
 * engine adds the connections of one node input in no fixed order: three or more addends give a last-bit different sum
 * from one render to the next, and the export's byte-exact bed (export-audio.js renderDrillAudioWindowedExact) renders
 * each voice alone and needs it byte-stable. So no input ever takes more than TWO connections: the first layer goes
 * straight to `dest`, and each later layer joins through its own unity gain node, chained (a + b is b + a exactly, in
 * any order). voiceBus() hands out the destination for the next layer; `out(d)` resolves either a bus or a plain node. */
function voiceBus(ac, dest) {
  let n = 0, tail = dest;
  return () => {
    if (n++ === 0) return dest;
    const j = ac.createGain();
    j.connect(tail);
    tail = j;
    return j;
  };
}
const out = (d) => (typeof d === 'function' ? d() : d);

/** A synth layer under a sampled impact is skipped below this level (-50 dBFS): it would cost nodes and add nothing. */
const LAYER_FLOOR = 0.003;

/** One bank clip: source -> [highpass] -> [lowpass] -> gain -> dest. */
function playClip(ac, dest, bank, name, when, rate, level, lpHz, hpHz) {
  const src = ac.createBufferSource();
  src.buffer = bankBuffer(ac, bank, name);
  src.playbackRate.value = rate;
  let head = src;
  if (hpHz > 0) {
    const hp = ac.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = hpHz;
    hp.Q.value = -3; // dB for lowpass/highpass: -3 is the flat (Butterworth) corner
    head.connect(hp);
    head = hp;
  }
  if (lpHz > 0 && lpHz < 0.45 * ac.sampleRate) {
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = lpHz;
    lp.Q.value = -3;
    head.connect(lp);
    head = lp;
  }
  const g = ac.createGain();
  g.gain.value = level;
  head.connect(g);
  g.connect(out(dest));
  // a shaped bank starts 1 ms before the impact; an unshaped one (a foreign or test bank) carries the old 4 ms pre-roll
  src.start(when, bank.shaped ? 0 : 0.004);
}

/** Voice one impact from the bank. `v` is a voice of the plan (planVoices) or the bare { type, gain, seed } of a legacy
 * scheduleCue call. Returns false when this voice should fall back to the synth (nothing loaded for its tier, or a
 * snooker-net pocket, which has no recording). */
function voiceSample(ac, dest, bank, noise, v, when, prof, rnd) {
  const type = v.type, gain = v.gain, mix = v.mix ?? 1;
  const p = prof[type];
  if (type === 'pocket' && p.kind === 'net') return false;
  const dither = rnd() - 0.5;
  let name = null;
  if (v.clip != null && LADDER[type]) {
    // a planned impact names its clip on the class's ladder (planVoices: near its strength, rotated, never the clip the
    // class played last). A clip that failed to load hands over to its nearest loaded neighbour.
    const lad = LADDER[type];
    for (let d = 0; d < lad.length && !name; d++) {
      if (bank.clips.has(lad[v.clip - d])) name = lad[v.clip - d];
      else if (bank.clips.has(lad[v.clip + d])) name = lad[v.clip + d];
    }
  } else {
    // TRUE seeded round-robin inside the velocity tier: a planned pocket carries its rotation count (`variant`), a legacy
    // call rotates on the cue index. Drawing the variant from rnd() was NOT a rotation.
    const tier = type === 'pocket' ? (p.kind === 'return' ? 'r' : 'd') : sampleTier(type, gain, dither);
    const list = (SFX_FILES[type][tier] ?? []).filter((n) => bank.clips.has(n));
    if (list.length) name = list[((v.variant ?? v.seed ?? 0) >>> 0) % list.length];
  }
  if (!name) return false; // nothing loaded for this voice -> synth
  const lvl = SAMPLE_LEVEL[type];
  const jit = () => 1 + (rnd() * 2 - 1) * 0.03;          // ±3 % seeded detune: no two hits are the same sound
  // The plan stages by a class's nominal clip peak (-6 dBFS); the takes differ (the level match moves a clip's peak by up
  // to 4 dB either way). The cap keeps the clip itself under the plan's ceiling whatever its own peak.
  const clipPeak = bank.peaks?.get(name) ?? 0.5;
  const level = Math.min(PLAN_LIMITS.ceiling / clipPeak,
    lvl.base * (p.level ?? 1) * Math.pow(gain, lvl.exp) * dB((rnd() * 2 - 1) * 0.8) * mix);
  const off = rnd() * 0.3;                               // where the synth layers read the noise buffer
  if (type === 'click') {
    const cut = v.cut ?? 0;
    const lp = brightnessHz('click', gain) * tiltScale(p.tilt ?? 1) * jit();
    // a thin cut is a glancing contact: little weight behind it, so less low end and less table under it
    playClip(ac, dest, bank, name, when, (p.fScale ?? 1) * jit(), level, lp, cut > 0.35 ? 120 + 1100 * cut * cut : 0);
    // table-coupling body: ball energy conducts through cloth into the slate — without this low-mid layer the dry contact
    // reads as stone, not resin-on-a-table. Rides the table's measured rail/slate fundamental.
    const body = lvl.base * Math.pow(gain, 1.3) * 0.16 * (1 - 0.8 * cut * cut) * mix;
    if (body > LAYER_FLOOR) mode(ac, dest, noise, when, prof.cushion.f * 1.1, 4, body, 0.045, 0, off);
    const n = v.n ?? 2;
    if (n >= 3) {
      // a frozen cluster (the break): several contacts inside a few milliseconds are ONE crack with weight, not a row of
      // equal clicks. Extra layers from the hard tier at seeded sub-4 ms offsets, falling levels, and the slate's thump.
      const hard = (SFX_FILES.click.h ?? []).filter((c) => bank.clips.has(c));
      const at = Math.max(0, hard.indexOf(name));
      let t = when;
      for (let i = 0; i < Math.min(n - 2, 3) && hard.length; i++) {
        t += 0.0006 + rnd() * 0.0022;
        playClip(ac, dest, bank, hard[(at + 1 + i) % hard.length], t, (p.fScale ?? 1) * (0.94 + rnd() * 0.1),
          level * (0.62 - 0.12 * i), lp * (0.8 + rnd() * 0.3), 0);
      }
      mode(ac, dest, noise, when, prof.cushion.f * 0.55, 2.2, level * 0.45, 0.085, 0, off);
      crack(ac, dest, noise, when, 520, 0.012, level * 0.3, off);
    }
  } else if (type === 'cushion') {
    // the clips are the 215 Hz reference rail; another table's thump pitch rides the playback rate. A pocket-jaw facing
    // (arc) is a shorter, harder contact than the rail nose.
    const f0 = p.f ? p.f / 215 : 1;
    const arc = v.arc ? 1 : 0;
    playClip(ac, dest, bank, name, when, f0 * (1 + 0.12 * arc) * jit(), level,
      brightnessHz('cushion', gain) * (1 + 0.25 * arc) * jit(), 0);
    // rail wood: the cap rail and the frame answer a hard hit; a soft touch is rubber alone
    const wood = level * 0.5 * Math.pow(gain, 0.8);
    if (wood * 0.5 > LAYER_FLOOR) {
      mode(ac, dest, noise, when, (arc ? 820 : 640) * f0, 5, wood * 0.22, 0.03, 0, off);
      mode(ac, dest, noise, when, (p.f ?? 215) * 0.9, 3, wood * 0.5, 0.06 * (p.decayScale ?? 1), 0, off);
    }
  } else if (type === 'cue') {
    const tip = v.off ?? 0;
    if (tip > MISCUE_OFF) {
      voiceMiscue(ac, dest, bank, noise, name, when, level, (p.fScale ?? 1), rnd, off);
      return true;
    }
    // an off-centre hit is a glancing one: thinner, a little quieter, with the chalk's grip on top
    playClip(ac, dest, bank, name, when, (p.fScale ?? 1) * jit(), level * (1 - 0.25 * tip * tip),
      brightnessHz('cue', gain) * tiltScale(p.tilt ?? 1) * jit(), tip > 0.4 ? 90 + 520 * tip * tip : 0);
    const chalk = level * 0.14 * tip * tip;
    if (tip > 0.45 && chalk > LAYER_FLOOR) mode(ac, dest, noise, when, 3300, 1.4, chalk, 0.014, 0.001, off);
    // an elevated cue drives the ball into the bed: the slate answers
    const dig = v.dig ?? 0;
    if (dig > 0.15) mode(ac, dest, noise, when, prof.cushion.f * 0.8, 3, level * 0.6 * dig, 0.05, 0, off);
  } else { // pocket
    playClip(ac, dest, bank, name, when, jit(), level, brightnessHz('pocket', gain) * jit(), 0);
    // a return table: the ball lands on the track under the pocket
    if (p.kind === 'return') mode(ac, dest, noise, when + 0.07, 170, 3, level * 0.22, 0.05, 0, off);
  }
  return true;
}

/** A miscue: the tip slips off the ball. No solid knock; a thin tick as the ferrule clips the ball, the chalk's scrape
 * sliding up in pitch, and a second, smaller tick as the shaft follows through. */
function voiceMiscue(ac, dest, bank, noise, name, when, level, fScale, rnd, off) {
  playClip(ac, dest, bank, name, when, fScale * 1.7, level * 0.5, 0, 1400);
  const head = noiseIn(ac, noise, when, off);
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 3;
  bp.frequency.setValueAtTime(2200, when);
  bp.frequency.exponentialRampToValueAtTime(5200, when + 0.05);
  const env = ac.createGain();
  env.gain.value = 0;
  env.gain.setValueAtTime(0, when);
  env.gain.linearRampToValueAtTime(level * 0.5, when + 0.003);
  env.gain.exponentialRampToValueAtTime(Math.max(level * 5e-4, 1e-6), when + 0.058);
  env.gain.linearRampToValueAtTime(0, when + 0.068); // exact zero before the stop (see noiseIn)
  head.connect(bp).connect(env).connect(out(dest));
  head.run(when + 0.08);
  playClip(ac, dest, bank, name, when + 0.028 + rnd() * 0.02, fScale * 2, level * 0.3, 0, 2000);
}

/** Return-gully rumble tail (Diamond Pro-Am pockets) — stays synthesized:
 * the recordings cover the drop+rattle, not the long under-table roll. */
function gullyRumble(ac, dest, noise, level, when) {
  const t0 = when + 0.22;
  const head = noiseIn(ac, noise, t0, 0, true);
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 240;
  const env = ac.createGain();
  env.gain.value = 0;
  env.gain.setValueAtTime(0, t0);
  env.gain.linearRampToValueAtTime(level * 0.14, t0 + 0.18);
  env.gain.exponentialRampToValueAtTime(1e-5, t0 + 1.25);
  env.gain.linearRampToValueAtTime(0, t0 + 1.28); // exact zero before the stop (see noiseIn)
  head.connect(lp).connect(env).connect(out(dest));
  head.run(t0 + 1.3);
}

// ---------------------------------------------------------------------------
// Equipment acoustic profiles
// ---------------------------------------------------------------------------

/** Measured-anchor defaults (owner Diamond Pro-Am + Aramith, 2026-07
 * footage fingerprints; dry decays from the reference footage). */
export const DEFAULT_PROFILE = Object.freeze({
  click:   { fScale: 1, tilt: 1, level: 1, decayScale: 1 },
  cue:     { fScale: 1, tilt: 1, level: 1 },
  cushion: { f: 215, level: 1, decayScale: 1, hiss: 1 },
  pocket:  { kind: 'return', level: 1 }, // Pro-Am gully: drop + return rumble
});

export const TABLE_ACOUSTICS = {
  // thump = rail+slate fundamental (Hz); pocket kind: 'return' (gully
  // rumble), 'drop' (basket knock + rattle), 'net' (soft snooker drop).
  diamond_proam_9ft:       { thump: 215, pocket: 'return' },
  pool_pro_9ft:            { thump: 215, pocket: 'return' },
  pool_pro_9ft_measured:   { thump: 215, pocket: 'return' },
  diamond_redlabel_9ft:    { thump: 220, pocket: 'drop' },
  pool_pro_9ft_older_gen:  { thump: 220, pocket: 'drop' },
  predator_apex_9ft:       { thump: 230, pocket: 'drop' },
  pool_pro_9ft_metal_rim:  { thump: 230, pocket: 'drop' },
  wpa_spec_9ft:            { thump: 225, pocket: 'drop' },
  wpa_generic_9ft:         { thump: 225, pocket: 'drop' },
  chinese8_pro_9ft:        { thump: 245, pocket: 'drop' },
  joy_q8_9ft:              { thump: 245, pocket: 'drop' }, // v15 alias (GH-490)
  wpbsa_snooker_12ft:      { thump: 280, pocket: 'net', cushionDecay: 0.8 },
  umb_carom_284:           { thump: 300, pocket: 'drop', cushionLevel: 1.1 },
};

export const BALLSET_ACOUSTICS = {
  aramith_pool:      { fScale: 1.0, tilt: 1.0, level: 1.0 },
  pool_standard:     { fScale: 1.0, tilt: 1.0, level: 1.0 },
  // issue #91 visual variants: same 57.15 mm phenolic class as
  // aramith_pool (Duramith / Super Aramith Pro formula distinction is not
  // modeled — no published acoustic delta), so the rows are the
  // aramith_pool values verbatim (explicit rather than the ?? fallback)
  aramith_black:     { fScale: 1.0, tilt: 1.0, level: 1.0 },
  pool_black_cap:    { fScale: 1.0, tilt: 1.0, level: 1.0 },
  arcos_reserve:     { fScale: 1.0, tilt: 1.0, level: 1.0 },
  pool_ivory_gunsight: { fScale: 1.0, tilt: 1.0, level: 1.0 },
  // worn surface -> softer contact: duller, slightly quieter
  aramith_pool_worn: { fScale: 0.96, tilt: 0.6, level: 0.88 },
  pool_used:         { fScale: 0.96, tilt: 0.6, level: 0.88 },
  // 52.5 mm / lighter: shorter Hertzian contact -> brighter, less momentum
  snooker:           { fScale: 1.10, tilt: 1.1, level: 0.85 },
  // 61.5 mm / heavier: longer contact -> darker, weightier
  carom:             { fScale: 0.93, tilt: 0.9, level: 1.08 },
};

export const CLOTH_ACOUSTICS = {
  simonis_860_tournament:     { hiss: 1.0, cushionDecay: 1.0 },
  pool_worsted_new:           { hiss: 1.0, cushionDecay: 1.0 },
  simonis_760_fast:           { hiss: 1.1, cushionDecay: 1.05 },
  pool_worsted_fast:          { hiss: 1.1, cushionDecay: 1.05 },
  worn_slow:                  { hiss: 1.25, cushionDecay: 0.9, cushionLevel: 0.95 },
  snooker_napped:             { hiss: 0.6, cushionDecay: 0.85 },
  carom_worsted_heated:       { hiss: 0.9, cushionDecay: 1.1 },
  pool_worsted_measured:      { hiss: 1.0, cushionDecay: 1.0 },
};

const CUE_TIP_ACOUSTICS = {
  // phenolic break tip: hard clack, brighter and louder than leather
  break_phenolic: { fScale: 1.25, tilt: 1.6, level: 1.15 },
};

/** Derive the per-class acoustic overlay from a record's catalog ids
 * (record.initial.equipment — may be undefined for default equipment). */
export function acousticProfile(eq) {
  if (!eq) return DEFAULT_PROFILE;
  const table = TABLE_ACOUSTICS[eq.table_id] ?? TABLE_ACOUSTICS.pool_pro_9ft;
  const balls = BALLSET_ACOUSTICS[eq.ballset_id] ?? BALLSET_ACOUSTICS.pool_standard;
  const cloth = CLOTH_ACOUSTICS[eq.cloth_id] ?? CLOTH_ACOUSTICS.pool_worsted_new;
  const tip = CUE_TIP_ACOUSTICS[eq.cue_id] ?? { fScale: 1, tilt: 1, level: 1 };
  return {
    click: {
      fScale: balls.fScale, tilt: balls.tilt,
      level: balls.level, decayScale: 1,
    },
    cue: {
      fScale: balls.fScale * tip.fScale,
      tilt: tip.tilt, level: tip.level,
    },
    cushion: {
      f: table.thump,
      level: (table.cushionLevel ?? 1) * (cloth.cushionLevel ?? 1),
      decayScale: (table.cushionDecay ?? 1) * (cloth.cushionDecay ?? 1),
      hiss: cloth.hiss,
    },
    pocket: { kind: table.pocket, level: 1 },
  };
}

// ---------------------------------------------------------------------------
// Voicing
// ---------------------------------------------------------------------------

const dB = (x) => Math.pow(10, x / 20);

/** A noise source for one layer, behind its fade-in: noise -> gain that rises from EXACT zero at `when` to 1 in 0.2 ms.
 * Whether the frame at a start time itself plays is a rounding question (it can flip between two contexts that schedule
 * the same voice at different times; the export bed compares such renders). Entering the layer's filter through this
 * zero, the filter's state is the same either way. The other end is the layer's own envelope, which sits AFTER the
 * filter and is exactly zero before the source stops and before the engine cuts the filter's ring-out.
 * Returns the node to filter. The source is NOT started here: the caller ends its layer with `.run(stopAt)`, which
 * starts the source and sets its stop in one step. So if the engine refuses anything in the layer's scheduling, no
 * source has been started, and no source (a looping one least of all) ever runs without a stop time. */
function noiseIn(ac, noise, when, off, loop = false) {
  const src = ac.createBufferSource();
  src.buffer = noise;
  src.loop = loop;
  const pre = ac.createGain();
  pre.gain.value = 0;
  pre.gain.setValueAtTime(0, when);
  pre.gain.linearRampToValueAtTime(1, when + 0.0002);
  src.connect(pre);
  pre.run = (stopAt) => {
    if (!(stopAt > when)) return; // also a stop time that is not a number
    src.start(when, off);
    src.stop(stopAt);
  };
  return pre;
}

/** One damped mode: noise -> bandpass(f,q) -> exp-decay gain -> dest.
 * attackS > 0 rounds the onset (leather tip); 0 = hard strike. `off` [s] is
 * where the read of the noise buffer starts (seeded per voice, so two voices'
 * layers are not the same noise; keep off + attackS + decayS under 0.45 s).
 * Both ends are exact zeros (see noiseIn). */
function mode(ac, dest, noise, when, f, q, g, decayS, attackS = 0, off = 0) {
  if (g <= 0 || f <= 20 || f >= ac.sampleRate / 2) return;
  const head = noiseIn(ac, noise, when, off);
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = f;
  bp.Q.value = q;
  const env = ac.createGain();
  if (attackS > 0) {
    env.gain.setValueAtTime(1e-4, when);
    env.gain.linearRampToValueAtTime(g, when + attackS);
  } else {
    env.gain.setValueAtTime(g, when);
  }
  env.gain.exponentialRampToValueAtTime(Math.max(g * 1e-3, 1e-6),
    when + attackS + decayS);
  env.gain.linearRampToValueAtTime(0, when + attackS + decayS + 0.01);
  head.connect(bp).connect(env).connect(out(dest));
  head.run(when + attackS + decayS + 0.02);
}

/** The attack "crack": a millisecond of lowpassed noise (contact
 * hardening: faster impacts -> shorter and brighter). Both ends are exact
 * zeros (see noiseIn). */
function crack(ac, dest, noise, when, lpHz, durS, g, off = 0) {
  if (g <= 0) return;
  const head = noiseIn(ac, noise, when, off);
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = lpHz;
  lp.Q.value = 0.5;
  const env = ac.createGain();
  env.gain.setValueAtTime(g, when);
  env.gain.exponentialRampToValueAtTime(Math.max(g * 1e-3, 1e-6), when + durS);
  env.gain.linearRampToValueAtTime(0, when + durS + 0.01);
  head.connect(lp).connect(env).connect(out(dest));
  head.run(when + durS + 0.02);
}

// Ball-ball modal table (fingerprint targets: composite centroid ~1.9-2.1
// kHz at full speed, hf>2k ~0.4, dry decay25 ~30 ms). tiltExp: how much
// each mode fades on slow shots (velocity -> brightness).
const CLICK_MODES = [
  { f: 1180, q: 16, g: 0.30, dec: 0.040, tiltExp: 0.0 },
  { f: 1900, q: 18, g: 0.90, dec: 0.055, tiltExp: 0.15 },
  { f: 2680, q: 16, g: 0.80, dec: 0.042, tiltExp: 0.3 },
  { f: 4100, q: 12, g: 0.42, dec: 0.028, tiltExp: 0.5 },
  { f: 6300, q: 10, g: 0.20, dec: 0.018, tiltExp: 0.7 },
];

function voiceClick(ac, dest, noise, gain, when, prof, rnd) {
  const p = prof.click;
  const level = 0.85 * p.level * Math.pow(gain, 1.35);
  for (const m of CLICK_MODES) {
    const detune = 1 + (rnd() * 2 - 1) * 0.02;
    const jitter = dB((rnd() * 2 - 1) * 1.2);
    const tilt = Math.pow(gain, m.tiltExp / Math.max(p.tilt, 0.25));
    mode(ac, dest, noise, when, m.f * p.fScale * detune, m.q,
      level * m.g * tilt * jitter, m.dec * p.decayScale);
  }
  crack(ac, dest, noise, when,
    1200 + 3800 * Math.pow(gain, 1.5) * p.tilt,
    0.003 - 0.002 * gain, level * 0.28);
  // hardest hits (the break): a correlated micro-collision train within
  // ~10 ms — stacked independent clicks alone don't read as one "crack"
  if (gain > 0.85) {
    let t = when;
    const extra = 2 + Math.floor(rnd() * 2);
    for (let i = 0; i < extra; i++) {
      t += 0.002 + rnd() * 0.004;
      crack(ac, dest, noise, t, 2000 + rnd() * 2500, 0.0015, level * 0.18);
    }
  }
}

// Cue tip (leather): ~1.3 kHz dull thock, soft 1.5 ms onset, low shaft
// knock; much darker than the ball-ball click (footage + reference footage).
const CUE_MODES = [
  { f: 640,  q: 9,  g: 0.55, dec: 0.045, tiltExp: 0.0 },
  { f: 1300, q: 11, g: 1.00, dec: 0.080, tiltExp: 0.1 },
  { f: 1750, q: 8,  g: 0.13, dec: 0.040, tiltExp: 0.5 },
];

function voiceCue(ac, dest, noise, gain, when, prof, rnd) {
  const p = prof.cue;
  const level = 0.55 * p.level * Math.pow(gain, 1.25);
  for (const m of CUE_MODES) {
    const detune = 1 + (rnd() * 2 - 1) * 0.015;
    const tilt = Math.pow(gain, m.tiltExp / Math.max(p.tilt, 0.25));
    mode(ac, dest, noise, when, m.f * p.fScale * detune, m.q,
      level * m.g * tilt, m.dec, 0.0015);
  }
  // shaft/butt body knock
  mode(ac, dest, noise, when, 195, 3, level * 0.3, 0.035);
  crack(ac, dest, noise, when, 2200 * p.fScale, 0.0025, level * 0.35);
}

// Cushion FALLBACK (bank path uses the real owner-table rail clips): a
// broadband lowpassed THUD, not a resonator bank — rubber is heavily
// damped, and narrowband modes ringing together read as a hollow plastic
// bucket (owner verdict on v4), not an elastic rail.
function voiceCushion(ac, dest, noise, gain, when, prof, rnd) {
  const p = prof.cushion;
  const level = 1.05 * p.level * Math.pow(gain, 1.3);
  const f = p.f * (1 + (rnd() * 2 - 1) * 0.03);
  crack(ac, dest, noise, when, f * 1.6, 0.07 * p.decayScale, level);
  // one mild low body resonance, quickly damped
  mode(ac, dest, noise, when, f, 2.5, level * 0.5, 0.05 * p.decayScale);
  // cloth contact hiss (equipment: napped cloth damps it)
  mode(ac, dest, noise, when, 3400, 1.2, level * 0.04 * p.hiss, 0.018);
}

/** One pocket-furniture knock (liner/ball/wood). */
function knock(ac, dest, noise, when, f, g, decayS) {
  mode(ac, dest, noise, when, f, 8, g, decayS);
  mode(ac, dest, noise, when, f * 1.9, 6, g * 0.4, decayS * 0.7);
}

// Pocket: entry knock + gravity rattle train, then (ball-return tables) a
// low rolling rumble down the gully; 'net' (snooker) is one soft thud.
function voicePocket(ac, dest, noise, gain, when, prof, rnd, rumble = true) {
  const p = prof.pocket;
  const level = 0.95 * p.level * Math.pow(gain, 1.2);
  if (p.kind === 'net') {
    knock(ac, dest, noise, when, 380, level * 0.7, 0.06);
    mode(ac, dest, noise, when + 0.03, 900, 2, level * 0.12, 0.04);
    return;
  }
  knock(ac, dest, noise, when, 560 * (1 + (rnd() - 0.5) * 0.1), level, 0.045);
  // decelerating rattle: 2-3 knocks, geometric spacing
  const n = 2 + Math.floor(rnd() * 2);
  let dt = 0.055 + rnd() * 0.03;
  let t = when, g = level * 0.55;
  for (let i = 0; i < n; i++) {
    t += dt;
    knock(ac, dest, noise, t, (520 + rnd() * 320), g, 0.035);
    dt *= 0.72;
    g *= 0.6;
  }
  if (p.kind === 'return' && rumble) gullyRumble(ac, dest, noise, level, when);
}

// ---------------------------------------------------------------------------
// Presentation voices: rolling, bed landings, the return track's stop
// ---------------------------------------------------------------------------

/** Longest wall time one rolling segment may sound. With its 30 ms fade-out this stays under the 2.0 s per-voice support the
 * export bed assumes (export-audio.js AUDIO_BED_TAIL_SEC), at any playback rate: a segment that slow motion would stretch
 * past it is not voiced at all. */
export const MAX_SEG_SEC = 1.6;
const SEG_FADE = 0.03;

/** One rolling segment (a ball on the cloth, or under the table on the return track): looped noise through a lowpass whose
 * corner and level slide from the segment's start values to its end values. Segments butt together: each fades in over
 * SEG_FADE while the one before fades out, and both read the SAME stretch of the noise buffer (the read position is taken
 * from the shot clock, not from the schedule time), so the join is one continuous rumble. Nothing starts before `when`. */
function voiceRoll(ac, dest, noise, v, when, rate) {
  const mix = v.mix ?? 1;
  const dur = v.dur / rate;
  // slower than about 1/8 speed a segment would outlast the bound; cut short it would pulse, so the rolling layer rests
  if (!(dur > 0) || dur > MAX_SEG_SEC) return;
  const xf = Math.min(SEG_FADE, dur / 2);
  const len = noise.duration > 0 ? noise.duration : 0.5;
  const pos = v.t / rate;
  const head = noiseIn(ac, noise, when, Math.max(0, pos - Math.floor(pos / len) * len), true);
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = v.hollow ? 7 : 0; // the track under the table rings a little; cloth does not
  lp.frequency.setValueAtTime(v.f0, when);
  lp.frequency.linearRampToValueAtTime(v.f1, when + dur);
  const env = ac.createGain();
  env.gain.value = 0;
  env.gain.setValueAtTime(0, when);
  env.gain.linearRampToValueAtTime((v.g0 + (v.g1 - v.g0) * xf / dur) * mix, when + xf);
  env.gain.linearRampToValueAtTime(v.g1 * mix, when + dur);
  env.gain.linearRampToValueAtTime(0, when + dur + xf); // exact zero before the stop (see noiseIn)
  head.connect(lp).connect(env).connect(out(dest));
  head.run(when + dur + xf + 0.005);
}

/** A ball landing on the bed after a hop: the slate's thump through the cloth, and a short knock. */
function voiceTable(ac, dest, noise, v, when, prof, rnd) {
  const level = 0.4 * Math.pow(v.gain, 1.2) * (v.mix ?? 1);
  const off = rnd() * 0.3;
  mode(ac, dest, noise, when, prof.cushion.f * 0.8 * (1 + (rnd() * 2 - 1) * 0.04), 2.5, level, 0.045, 0, off);
  crack(ac, dest, noise, when, 700, 0.006, level * 0.45, off);
}

/** The end of the return track: a muffled clack against the balls already in the tray (and the nudge it passes down the
 * row), or a dull stop against the end of an empty tray. */
function voiceSettle(ac, dest, bank, noise, v, when, prof, rnd) {
  const level = 0.11 * (v.mix ?? 1);
  const soft = v.clack && bank ? (SFX_FILES.click.s ?? []).filter((n) => bank.clips.has(n)) : [];
  if (soft.length) {
    const k = (v.variant ?? v.seed ?? 0) >>> 0;
    const fScale = prof.click.fScale ?? 1;
    playClip(ac, dest, bank, soft[k % soft.length], when, fScale * (0.97 + rnd() * 0.06), level, 1700, 0);
    playClip(ac, dest, bank, soft[(k + 1) % soft.length], when + 0.05 + rnd() * 0.03, fScale * (0.97 + rnd() * 0.06),
      level * 0.45, 1400, 0);
    return;
  }
  const off = rnd() * 0.3;
  mode(ac, dest, noise, when, 300 * (1 + (rnd() * 2 - 1) * 0.05), 3, level * 0.9, 0.04, 0, off);
  crack(ac, dest, noise, when, 900, 0.005, level * 0.4, off);
}

/** The voice's own PRNG. The seed is run through mulberry32 twice: the first outputs of neighbouring seeds are correlated
 * (measured on the old variant draw), and the second pass removes that. */
function voiceRnd(seed) {
  const r = mulberry32((NOISE_SEED ^ Math.imul((seed ?? 0) + 1, 2654435761)) >>> 0);
  return mulberry32((Math.floor(r() * 4294967296) ^ Math.floor(r() * 65536)) >>> 0);
}

/** A voice is schedulable when its time is a number that is not negative and every number it carries is finite (its place
 * on the table aside: the live pan reads a missing place as the centre). A damaged record can carry a velocity that is
 * not a number; such a voice stays silent, instead of a refusal out of the engine that would abort an export. */
function voiceOk(v, when) {
  if (!(when >= 0) || when === Infinity) return false;
  for (const k in v) {
    if (k !== 'x' && k !== 'y' && typeof v[k] === 'number' && !Number.isFinite(v[k])) return false;
  }
  return true;
}

/**
 * Voice ONE voice of the plan (planVoices) at AudioContext time `when`, into `dest`. Works on AudioContext and
 * OfflineAudioContext alike, and is the one voicing function of live playback and of the export render.
 * `v`: { type, gain, seed, ... }: the four impact classes of deriveCues ('click' | 'cushion' | 'pocket' | 'cue') with
 * their physical detail, plus 'table' (a landing on the bed), 'roll' (one rolling segment) and 'settle' (the end of the
 * return track).
 * opts.profile: acousticProfile() overlay (default: measured anchor).
 * opts.bank: loadSfxBank() result. With it the four impact classes voice from the recordings; without it, or for a voice
 * the bank cannot serve, the modal synth below is the fallback.
 * opts.rate: playback rate (slow motion). Impacts keep their pitch and length; a rolling segment lasts dur / rate.
 * Laws every voice keeps (the export bed relies on them): nothing sounds before `when`; the output depends only on the
 * voice, the rate and the sub-sample phase of `when`; and it is silent again within 2.0 s.
 */
export function scheduleVoice(ac, dest, noise, v, when, opts = {}) {
  if (!voiceOk(v, when)) return; // nothing is created for a voice the engine would refuse
  const profile = opts.profile ?? DEFAULT_PROFILE;
  const type = v.type;
  if (type === 'roll') return voiceRoll(ac, dest, noise, v, when, opts.rate > 0 ? opts.rate : 1);
  const rnd = voiceRnd(v.seed);
  const bus = voiceBus(ac, dest); // every layer of this voice joins `dest` through two-input junctions (the junction law)
  if (type === 'table') return voiceTable(ac, bus, noise, v, when, profile, rnd);
  if (type === 'settle') return voiceSettle(ac, bus, opts.bank ?? null, noise, v, when, profile, rnd);
  if (opts.bank && SFX_FILES[type] && voiceSample(ac, bus, opts.bank, noise, v, when, profile, rnd)) return;
  // modal synth fallback (no bank, or nothing loaded for this voice). The plan's level staging rides one gain node.
  let synthBus = bus;
  if ((v.mix ?? 1) < 1) {
    const staged = ac.createGain();
    staged.gain.value = v.mix;
    staged.connect(dest);
    synthBus = voiceBus(ac, staged);
  }
  if (type === 'click') return voiceClick(ac, synthBus, noise, v.gain, when, profile, rnd);
  if (type === 'cue') return voiceCue(ac, synthBus, noise, v.gain, when, profile, rnd);
  if (type === 'cushion') return voiceCushion(ac, synthBus, noise, v.gain, when, profile, rnd);
  // a planned pocket has its return-track roll as plan voices; a legacy cue keeps the synth rumble
  if (type === 'pocket') return voicePocket(ac, synthBus, noise, v.gain, when, profile, rnd, !v.plan);
}

/**
 * Voice ONE derived cue (sound.js deriveCues shape: type 'click'|'cushion'|'pocket'|'cue', gain 0..1). The pre-plan
 * entry point, kept for a caller that has no plan (a stale cached sound.js or export-audio.js paired with this module):
 * it voices the cue as a bare voice. opts.seed: the cue's index in the deriveCues list.
 */
export function scheduleCue(ac, dest, noise, type, gain, when, opts = {}) {
  return scheduleVoice(ac, dest, noise, { type, gain, seed: opts.seed ?? 0 }, when, opts);
}

// ---------------------------------------------------------------------------
// The listener's space (live playback only)
// ---------------------------------------------------------------------------
// Live playback places each voice left to right by where it happens on the table as the camera sees it, and sends the
// mix through a short, quiet room. Both are sound.js's (the live graph after the voices); the export bed stays the dry,
// centred mix: its byte-exact composition is mono by construction (export-audio.js). These are the pure parts.

/** Widest pan a voice takes (StereoPannerNode units). Modest on purpose: a table is a few degrees wide from where a
 * player stands, and a hard-panned click reads as a stereo trick, not as a place. */
export const PAN_WIDTH = 0.6;
const panOfAzimuth = (az) => PAN_WIDTH * Math.max(-1, Math.min(1, az / 0.6)); // full width at about the edge of the view

/** Pan of a sound at kernel table point (x, y), for a listener at the camera. `view` is the camera's world-to-view
 * matrix (column-major, 16 numbers: three.js camera.matrixWorldInverse.elements). The kernel-to-scene axes are those of
 * coords.js (scene x = kernel y, scene y = up, scene z = kernel x); the view looks down its -z with +x to the right. */
export function listenerPan(view, x, y) {
  const wx = y, wy = 0.03, wz = x;
  const vx = view[0] * wx + view[4] * wy + view[8] * wz + view[12];
  const vz = view[2] * wx + view[6] * wy + view[10] * wz + view[14];
  return panOfAzimuth(Math.atan2(vx, -vz));
}

/** The same without a camera: the listener stands where the shooter stood, 0.8 m behind the cue ball on the line of the
 * shot (read from the record). */
export function shooterPan(record, x, y) {
  const strike = record?.events?.find((e) => typeof e.kind === 'object' && e.kind.Strike);
  const phi = record?.shot?.phi;
  if (!strike || !Number.isFinite(phi)) return 0;
  const p0 = strike.post[0][1].pos;
  const fx = Math.cos(phi), fy = Math.sin(phi);
  const dx = x - (p0.x - 0.8 * fx), dy = y - (p0.y - 0.8 * fy);
  return panOfAzimuth(Math.atan2(dx * fy - dy * fx, dx * fx + dy * fy)); // right of the shot line is f x up = (fy, -fx)
}

/** The room: a 0.25 s stereo impulse of seeded noise under an exponential decay (about 0.4 s to -60 dB), behind an 8 ms
 * gap, darkening as it decays; the two channels use different seeds, so the tail is wide. 0.25 s is 12,000 frames at
 * 48 kHz: short enough that an engine convolves all of it on the audio thread, with no helper threads. Each channel is
 * scaled to unit energy, so the send gain alone sets how wet the mix is. Returns [left, right] Float32Arrays. */
export function makeRoomImpulse(sampleRate, seed = NOISE_SEED + 101) {
  const n = Math.floor(sampleRate * 0.25), gap = Math.floor(sampleRate * 0.008);
  const out = [];
  for (let ch = 0; ch < 2; ch++) {
    const rand = mulberry32(seed + ch * 7919);
    const d = new Float32Array(n);
    let lp = 0, e = 0;
    for (let i = gap; i < n; i++) {
      const t = (i - gap) / sampleRate;
      const a = 0.55 - 0.4 * Math.min(1, t / 0.2);           // the lowpass closes as the tail decays
      lp += a * ((rand() * 2 - 1) - lp);
      const y = lp * Math.exp(-t / 0.055);
      d[i] = y;
      e += y * y;
    }
    const g = e > 0 ? 1 / Math.sqrt(e) : 0;
    for (let i = gap; i < n; i++) d[i] *= g;
    out.push(d);
  }
  return out;
}

// ---------------------------------------------------------------------------
// The voice plan
// ---------------------------------------------------------------------------
// planVoices() turns a ShotRecord into the list of voices its playback sounds. It reads the record and nothing else, writes
// nothing back, and is a pure function: the same record gives the same plan in live playback, in every export window and
// on every machine. It owns four things the per-cue voicing cannot see:
//   1. what each impact physically was: its true strength, the cut of a ball-ball hit, how many balls a frozen cluster
//      moved, rail nose or pocket jaw, where the tip met the ball, where on the table it happened;
//   2. the sounds between the impacts: balls rolling on the cloth, a hop landing on the bed, a pocketed ball running down
//      the return track and stopping against the balls already in the tray;
//   3. the mix of a dense burst (the break): masked hits dropped, a bound on how many voices start together, and levels
//      staged so that the sum stays under full scale. No compressor: the mix stays linear, so the export may still sum
//      per-voice renders;
//   4. variation: each class rotates its clips, so two hits in a row never share one.

const IMPACTS = { click: 1, cushion: 1, cue: 1, pocket: 1, table: 1 };

/** Bounds of the plan (the unit test holds them on real break records). */
export const PLAN_LIMITS = Object.freeze({
  maskWindow: 0.012,  // s: an impact this close to one 30 dB louder is masked, and dropped
  maskRatio: 0.0316,  // -30 dB
  burstWindow: 0.1,   // s
  burstMax: 16,       // impacts that may start within burstWindow of one another (the loudest are kept)
  maxSources: 64,     // buffer sources the impacts may have sounding at one instant (the quietest are dropped)
  stageWindow: 0.06,  // s: impacts this close weigh on one another's level stage
  stageDecay: 0.015,  // s: how fast an impact's weight on its neighbours falls with their distance in time
  ceiling: 0.9,       // staged sum of nominal peaks, before the master gain
  rollStep: 0.2,      // s of shot time per rolling segment
  landingMin: 0.1,    // m/s: a hop landing slower than this is silent
});

const ROLL_GAIN = 0.065;   // rolling level of the loudest table state (noise gain before the lowpass)
const GULLY_GAIN = 0.2;
const GULLY_LEAD = 0.09;  // s from the pocket event to the ball reaching the track

const clampGain = (x) => Math.max(0.05, Math.min(1, x));
const len3 = (v) => Math.hypot(v.x, v.y, v.z);

/** Velocity just before a ball's next recorded state. Between two events a ball's acceleration is constant (rolling,
 * sliding, flight), so its mean velocity over the span is the average of the two ends: v_end = 2·Δp/Δt − v_start. This
 * reads recorded states only; no friction or gravity constant enters. A span that was not one such phase gives an
 * implausible answer and falls back to the start velocity. */
function arrive(k, pos, t) {
  const dt = t - k.t;
  if (!(dt > 1e-7) || (k.motion !== 'Rolling' && k.motion !== 'Sliding' && k.motion !== 'Airborne')) return k.vel;
  const v = {
    x: 2 * (pos.x - k.pos.x) / dt - k.vel.x,
    y: 2 * (pos.y - k.pos.y) / dt - k.vel.y,
    z: 2 * (pos.z - k.pos.z) / dt - k.vel.z,
  };
  return len3(v) <= 2 * len3(k.vel) + 0.5 ? v : k.vel;
}

/** Nominal peak of a voice before staging (the bank's clips peak near 0.5; the factor covers the layers under them). */
function nominalPeak(v) {
  const L = SAMPLE_LEVEL[v.type];
  if (v.type === 'click') return 0.5 * L.base * Math.pow(v.gain, L.exp) * ((v.n ?? 2) >= 3 ? 2 : 1.15);
  if (v.type === 'cushion') return 0.5 * L.base * Math.pow(v.gain, L.exp) * 1.25;
  if (v.type === 'cue') return 0.5 * L.base * Math.pow(v.gain, L.exp) * 1.15;
  if (v.type === 'pocket') return 0.5 * L.base * Math.pow(v.gain, L.exp) * 1.1;
  if (v.type === 'table') return 0.4 * Math.pow(v.gain, 1.2);
  if (v.type === 'settle') return 0.06;
  return 0.07 * Math.max(v.g0 ?? 0, v.g1 ?? 0); // roll: lowpassed noise sits far under its gain
}

/** How long an impact voice sounds [s] and how many buffer sources it holds meanwhile (upper bounds, for the plan's
 * source bound). */
function impactCost(v) {
  // the clip at its slowest seeded rate, or the longest layer under it, whichever stops later
  if (v.type === 'click') return (v.n ?? 2) >= 3 ? [0.11, 7] : [0.07, 2];
  if (v.type === 'cushion') return [0.09, 3];
  if (v.type === 'cue') return [0.09, 3];
  if (v.type === 'pocket') return [0.47, 2];
  return [0.07, 2]; // table
}

/**
 * The voice plan of one record. `cues` is sound.js deriveCues(record) and `evIdx[i]` the index in record.events of the
 * event cue i came from (deriveCues fills it when handed an array). Returns voices in time order:
 *   { t, type, gain, seed, mix, x, y, ... } — x, y: kernel table coordinates of the sound (for the live listener pan).
 * An impact voice of cue i has seed i and `cue: i`; the other voices take seeds from 100000 up.
 */
export function planVoices(record, cues, evIdx, opts = {}) {
  const profile = opts.profile ?? DEFAULT_PROFILE;
  const events = record.events ?? [];
  const balls = record.initial?.balls ?? [];
  const table = record.initial?.table ?? {};
  const kind = profile.pocket.kind;
  const last = new Map();   // ball id -> its latest state { t, pos, vel, motion }
  const tracks = new Map(); // ball id -> spans [{ t0, t1, p0, p1, v0, v1, slide }] it spent rolling or sliding on the cloth
  for (const b of balls) last.set(b.id, { t: 0, pos: b.state.pos, vel: b.state.vel, motion: b.state.motion });

  const strike = events.find((e) => typeof e.kind === 'object' && e.kind.Strike);
  const cueBall = strike ? strike.kind.Strike.ball : 0;
  // balls already down before this shot: ids missing below the highest object ball still up (plus any the record itself
  // lists as pocketed). An estimate from the record alone; it only decides clack-or-stop at the end of the return track.
  let down = 0;
  {
    let top = 0, up = 0, listed = 0;
    for (const b of balls) {
      if (b.id === cueBall) continue;
      if (b.state.motion === 'Pocketed') { listed++; continue; }
      up++;
      if (b.id > top) top = b.id;
    }
    down = Math.max(listed, top - up - (cueBall < top && cueBall > 0 ? 1 : 0), 0);
  }
  // tip offset as a fraction of the commanded miscue limit, cap·(1 + tip_radius / R) (the kernel's own bound)
  const shot = record.shot ?? {};
  const cueOpt = record.options?.cue ?? {};
  const cueR = balls.find((b) => b.id === cueBall)?.params?.r ?? 0.028575;
  const tipOff = Math.hypot(shot.a ?? 0, shot.b ?? 0)
    / ((cueOpt.miscue_contact_cap_r ?? 0.5) * (1 + (cueOpt.tip_radius ?? 0.0106) / cueR));

  const voices = [];
  const arrivals = [];        // return tables: the stops at the tray, with whether the ball is the cue ball
  const inPocket = new Map(); // pocket index -> balls dropped into it during this record (drop pockets)
  let extra = 0;              // seeds of the non-cue voices
  let ci = 0;
  for (let ei = 0; ei < events.length; ei++) {
    const e = events[ei], k = e.kind;
    const pre = new Map();
    for (const [id, s] of e.post) {
      const kn = last.get(id);
      pre.set(id, kn ? arrive(kn, s.pos, e.t) : s.vel);
    }
    const dv = (id, s) => {
      const b = pre.get(id);
      return Math.hypot(s.vel.x - b.x, s.vel.y - b.y, s.vel.z - b.z);
    };
    const cue = ci < cues.length && (evIdx ? evIdx[ci] === ei : cues[ci].t === e.t) ? cues[ci] : null;
    if (cue && typeof k === 'object') {
      const v = { t: e.t, type: cue.type, gain: cue.gain, seed: ci, cue: ci, plan: true, mix: 1, x: 0, y: 0 };
      if (k.Strike) {
        const s = e.post[0][1];
        v.gain = clampGain(dv(k.Strike.ball, s) / 8);
        v.off = tipOff;
        v.dig = Math.sin(Math.max(0, shot.theta ?? 0));
        v.x = s.pos.x; v.y = s.pos.y;
      } else if (k.BallBall) {
        // the true impulse: velocity change against the velocity the ball ARRIVED with (deriveCues' gain measures against
        // the ball's state at its previous event, which overstates every hit that came after a long roll)
        let big = 0, moved = 0, sx = 0, sy = 0;
        for (const [id, s] of e.post) {
          const d = dv(id, s);
          if (d > big) big = d;
          if (d >= 0.3) moved++;
          sx += s.pos.x; sy += s.pos.y;
        }
        v.gain = clampGain(big / 7);
        v.x = sx / e.post.length; v.y = sy / e.post.length;
        if (e.post.length === 2) {
          const [[ia, sa], [ib, sb]] = e.post;
          const nx = sb.pos.x - sa.pos.x, ny = sb.pos.y - sa.pos.y, nz = sb.pos.z - sa.pos.z;
          const va = pre.get(ia), vb = pre.get(ib);
          const rx = va.x - vb.x, ry = va.y - vb.y, rz = va.z - vb.z;
          const rel = Math.hypot(rx, ry, rz), d = Math.hypot(nx, ny, nz);
          const vn = d > 0 ? Math.abs(rx * nx + ry * ny + rz * nz) / d : rel;
          // cut: sine of the angle between the approach and the line of centres (0 = full hit, 1 = the thinnest graze)
          v.cut = rel > 1e-6 ? Math.sqrt(Math.max(0, 1 - (vn / rel) * (vn / rel))) : 0;
          v.n = 2;
        } else {
          v.cut = 0;
          v.n = Math.max(2, moved);
        }
      } else if (k.BallLinearCushion || k.BallCircularCushion) {
        const id = (k.BallLinearCushion ?? k.BallCircularCushion).ball;
        const s = e.post.find((q) => q[0] === id)[1];
        v.gain = clampGain(dv(id, s) / 9);
        v.arc = !!k.BallCircularCushion;
        v.x = s.pos.x; v.y = s.pos.y;
      } else if (k.BallPocket) {
        const id = k.BallPocket.ball;
        const pc = table.pockets?.[k.BallPocket.pocket]?.center;
        v.gain = clampGain(0.3 + len3(pre.get(id) ?? { x: 0, y: 0, z: 0 }) / 5);
        v.x = pc?.x ?? 0; v.y = pc?.y ?? 0;
        if (kind === 'return') {
          // the roll down the track to the tray at the foot end (the rack end, +y), then the stop
          const run = 0.55 + 0.52 * Math.max(0, (table.length ?? 2.54) / 2 - v.y);
          const t0 = e.t + GULLY_LEAD;
          const nSeg = Math.max(1, Math.ceil(run / 0.3)), h = run / nSeg;
          const g = (u) => GULLY_GAIN * (u < 0.15 ? 0.35 + 0.65 * u / 0.15 : 1 - 0.25 * (u - 0.15) / 0.85);
          for (let i = 0; i < nSeg; i++) {
            const u0 = i / nSeg, u1 = (i + 1) / nSeg;
            voices.push({ t: t0 + i * h, type: 'roll', gain: 0.3, seed: 100000 + extra++, mix: 1, x: v.x, y: v.y,
              dur: h, g0: g(u0), g1: g(u1), f0: 150 + 90 * u0, f1: 150 + 90 * u1, hollow: true });
          }
          // (clack or dull stop is decided below, in the order the balls ARRIVE at the tray: a later drop into a
          // foot-end pocket has the shorter track and can get there first)
          const stop = { t: t0 + run, type: 'settle', gain: 0.3, seed: 100000 + extra++, mix: 1, x: v.x, y: v.y,
            clack: false, variant: 0 };
          voices.push(stop);
          arrivals.push({ stop, cue: id === cueBall });
        } else if (kind === 'drop') {
          // a drop pocket holds its own balls: a second ball into the same pocket lands on the first
          const held = inPocket.get(k.BallPocket.pocket) ?? 0;
          if (held > 0) {
            voices.push({ t: e.t + 0.16, type: 'settle', gain: 0.3, seed: 100000 + extra++, mix: 1, x: v.x, y: v.y,
              clack: true, variant: held });
          }
          inPocket.set(k.BallPocket.pocket, held + 1);
        }
      }
      voices.push(v);
      ci++;
    }
    if (typeof k === 'object' && k.BallTable) {
      // a landing on the bed: strength from the vertical speed it arrived with
      const id = k.BallTable.ball;
      const s = e.post.find((q) => q[0] === id)?.[1];
      const vz = Math.abs(pre.get(id)?.z ?? 0);
      if (s && vz >= PLAN_LIMITS.landingMin) {
        voices.push({ t: e.t, type: 'table', gain: clampGain(vz / 1.5), seed: 100000 + extra++, mix: 1,
          x: s.pos.x, y: s.pos.y });
      }
    }
    for (const [id, s] of e.post) {
      const kn = last.get(id);
      if (kn && (kn.motion === 'Rolling' || kn.motion === 'Sliding') && e.t - kn.t > 1e-6) {
        let tr = tracks.get(id);
        if (!tr) { tr = []; tracks.set(id, tr); }
        tr.push({ t0: kn.t, t1: e.t, p0: kn.pos, p1: s.pos, v0: kn.vel, v1: pre.get(id), slide: kn.motion === 'Sliding' });
      }
      last.set(id, { t: e.t, pos: s.pos, vel: s.vel, motion: s.motion });
    }
  }

  // the tray, in arrival order: a ball clacks against the balls already there; the cue ball, or the first ball into an
  // empty tray, comes to a dull stop
  arrivals.sort((p, q) => p.stop.t - q.stop.t || p.stop.seed - q.stop.seed);
  for (const a of arrivals) {
    a.stop.clack = !a.cue && down > 0;
    a.stop.variant = down;
    if (!a.cue) down++;
  }

  // ---- rolling on the cloth: ONE rumble for the whole table, sampled every rollStep from the spans above ----
  const H = PLAN_LIMITS.rollStep;
  const endT = events.length ? events[events.length - 1].t : 0;
  const nK = Math.ceil(endT / H) + 2;
  const pow = new Float64Array(nK), top = new Float64Array(nK), wx = new Float64Array(nK), wy = new Float64Array(nK);
  for (const tr of tracks.values()) {
    for (const sp of tr) {
      const dt = sp.t1 - sp.t0;
      for (let kk = Math.ceil(sp.t0 / H); kk * H < sp.t1 && kk < nK; kk++) {
        const f = (kk * H - sp.t0) / dt;
        const vx = sp.v0.x + (sp.v1.x - sp.v0.x) * f, vy = sp.v0.y + (sp.v1.y - sp.v0.y) * f;
        const s2 = (vx * vx + vy * vy) * (sp.slide ? 1.4 : 1); // cloth friction under a sliding ball is the louder
        pow[kk] += s2;
        wx[kk] += s2 * (sp.p0.x + (sp.p1.x - sp.p0.x) * f);
        wy[kk] += s2 * (sp.p0.y + (sp.p1.y - sp.p0.y) * f);
        const sp1 = Math.sqrt(vx * vx + vy * vy);
        if (sp1 > top[kk]) top[kk] = sp1;
      }
    }
  }
  const rollG = (kk) => ROLL_GAIN * Math.pow(Math.min(1, Math.sqrt(pow[kk]) / 5), 1.15);
  const rollF = (kk) => 180 + 900 * Math.pow(Math.min(1, top[kk] / 6), 0.8);
  for (let kk = 0; kk + 1 < nK; kk++) {
    const g0 = rollG(kk), g1 = rollG(kk + 1);
    if (g0 < 2e-3 && g1 < 2e-3) continue;
    const a = pow[kk] >= pow[kk + 1] ? kk : kk + 1; // the louder end names the place and, at a silent end, the corner
    voices.push({ t: kk * H, type: 'roll', gain: Math.max(g0, g1) / ROLL_GAIN, seed: 100000 + extra++, mix: 1,
      x: wx[a] / pow[a], y: wy[a] / pow[a], dur: H, g0, g1,
      f0: pow[kk] > 0 ? rollF(kk) : rollF(kk + 1), f1: pow[kk + 1] > 0 ? rollF(kk + 1) : rollF(kk) });
  }

  // ---- the mix of a burst: mask, bound, stage ----
  const L = PLAN_LIMITS;
  // (the strike is never dropped: it is the player's own act and the shot's first sound. Nor is a pocket: its roll down
  // the track and its stop are voices of their own and would play on without the drop)
  const hits = voices.filter((v) => IMPACTS[v.type])
    .map((v) => ({ v, amp: nominalPeak(v), keep: true, pin: v.type === 'cue' || v.type === 'pocket' }));
  hits.sort((p, q) => p.v.t - q.v.t);
  for (let i = 0; i < hits.length; i++) {
    if (hits[i].pin) continue;
    for (let j = i - 1; j >= 0 && hits[i].v.t - hits[j].v.t <= L.maskWindow; j--) {
      if (hits[j].keep && hits[j].amp * L.maskRatio > hits[i].amp) hits[i].keep = false;
    }
    for (let j = i + 1; j < hits.length && hits[j].v.t - hits[i].v.t <= L.maskWindow; j++) {
      if (hits[j].amp * L.maskRatio > hits[i].amp) hits[i].keep = false;
    }
  }
  const byAmp = hits.filter((h) => h.keep)
    .sort((p, q) => (q.pin ? 1 : 0) - (p.pin ? 1 : 0) || q.amp - p.amp || p.v.t - q.v.t || p.v.seed - q.v.seed);
  const taken = [];
  for (const h of byAmp) {
    let near = 0;
    for (const o of taken) if (Math.abs(o.v.t - h.v.t) < L.burstWindow) near++;
    if (near >= L.burstMax && !h.pin) h.keep = false; else taken.push(h);
  }
  // the source bound: at every impact's start, the impacts still sounding may hold maxSources sources; over that, the
  // quietest of them goes
  for (const h of hits) [h.len, h.src] = impactCost(h.v);
  for (let i = 0; i < hits.length; i++) {
    if (!hits[i].keep) continue;
    for (;;) {
      let sum = 0, low = -1;
      for (let j = i; j >= 0 && hits[i].v.t - hits[j].v.t < 0.5; j--) {
        if (!hits[j].keep || hits[j].v.t + hits[j].len <= hits[i].v.t) continue;
        sum += hits[j].src;
        if (!hits[j].pin && (low < 0 || hits[j].amp < hits[low].amp)) low = j;
      }
      if (sum <= L.maxSources || low < 0) break;
      hits[low].keep = false;
      if (low === i) break;
    }
  }
  const live = hits.filter((h) => h.keep);
  // staging: around each impact, the nominal peaks of its neighbours add up, each weighted by how much of it is still
  // sounding at that distance in time (a clip falls 25 dB in 10-25 ms; the layers under it take longer, and the weight
  // is set by them). Where the sum passes the ceiling, the impact and the neighbours close enough to share its instant
  // come down together by the same factor.
  const need = live.map((h, i) => {
    let sum = 0;
    for (let j = 0; j < live.length; j++) {
      const d = Math.abs(live[j].v.t - h.v.t);
      if (d >= L.stageWindow) { if (j > i) break; continue; }
      sum += live[j].amp * Math.exp(-d / L.stageDecay);
    }
    return sum > L.ceiling ? L.ceiling / sum : 1;
  });
  for (let i = 0; i < live.length; i++) {
    let m = need[i];
    for (let j = i - 1; j >= 0 && live[i].v.t - live[j].v.t < L.stageDecay; j--) if (need[j] < m) m = need[j];
    for (let j = i + 1; j < live.length && live[j].v.t - live[i].v.t < L.stageDecay; j++) if (need[j] < m) m = need[j];
    live[i].v.mix = m;
  }
  const dropped = new Set(hits.filter((h) => !h.keep).map((h) => h.v));

  // ---- rotation: each class walks the clips near the impact's strength in turn, and never repeats its last clip ----
  const out = voices.filter((v) => !dropped.has(v));
  out.sort((p, q) => p.t - q.t || p.seed - q.seed);
  const turn = new Map(), lastClip = new Map();
  for (const v of out) {
    const n = turn.get(v.type) ?? 0;
    if (v.type === 'pocket') {
      v.variant = n;
    } else if (LADDER[v.type]) {
      const win = ladderWindow(v.type, ladderPos(v.type, v.gain));
      let clip = win[n % win.length];
      if (clip === lastClip.get(v.type)) clip = win[(n + 1) % win.length];
      v.clip = clip;
      lastClip.set(v.type, clip);
    } else continue;
    turn.set(v.type, n + 1);
  }
  // a record with a number missing (a damaged or foreign one) can leave a voice with a parameter that is not a number:
  // that is not a plan. The caller (sound.js deriveVoices) then voices the bare cue list.
  if (out.some((v) => !voiceOk(v, 0))) throw new Error('planVoices: a voice of this record carries a non-finite parameter');
  return out;
}
