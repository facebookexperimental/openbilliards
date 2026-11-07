// Copyright (c) Meta Platforms, Inc. and affiliates.

// synth.js — the pure WebAudio synthesis shared by LIVE playback
// (web/app/sound.js) and the OFFLINE export audio render
// (web/app/export-audio.js): one noise buffer + one cue-voicing function,
// parameterized over any BaseAudioContext, so a live session and an
// exported file voice the same cue list identically.
//
// Voicing model (audio-calibration 2026-07, openbilliards-demos/analysis/
// audio):每 cue = a millisecond noise "crack" excitation + a bank of
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
// machine-gun effect deterministically. Cushion (no usable license-clean
// recordings exist) and the return-gully rumble stay synthesized; every
// class falls back to the modal synth when the bank is unavailable
// (fetch failure, headless boots, app:// quirks).
// WAVs are parsed by hand (16-bit PCM RIFF) — decodeAudioData's per-browser
// decoders would break the export byte-closeness ruling; a PCM copy is
// bit-identical everywhere.

// The whole bank is OWNER-RECORDED on the reference table (Diamond Pro-Am
// + Simonis + Aramith — the app default equipment and the catalog Measured
// anchor; dedicated session 2026-07, slate-driven extraction). No
// third-party audio ships; other equipment derives via the profile DSP.
export const SFX_FILES = {
  click: {
    s: ['click-s1.wav', 'click-s2.wav', 'click-s3.wav', 'click-s4.wav'],
    m: ['click-m1.wav', 'click-m2.wav', 'click-m3.wav', 'click-m4.wav'],
    h: ['click-h1.wav', 'click-h2.wav', 'click-h3.wav', 'click-h4.wav'],
  },
  cue: {
    m: ['cue-m1.wav', 'cue-m2.wav', 'cue-m3.wav', 'cue-m4.wav'],
    h: ['cue-h1.wav', 'cue-h2.wav', 'cue-h3.wav', 'cue-h4.wav'],
  },
  // close-mic S2 rail drills (owner session group 2, 2026-07-21): the
  // full velocity ladder recorded AT the rail — snr ~25-51 dB per tier
  cushion: {
    s: ['cushion-s1.wav', 'cushion-s2.wav', 'cushion-s3.wav', 'cushion-s4.wav'],
    m: ['cushion-m1.wav', 'cushion-m2.wav', 'cushion-m3.wav', 'cushion-m4.wav'],
    h: ['cushion-h1.wav', 'cushion-h2.wav', 'cushion-h3.wav', 'cushion-h4.wav'],
  },
  // d = drop-pocket action (底袋/中袋/颤袋), r = full return-gully takes
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
      const clips = new Map();
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
          clips.set(n, parseWav(await res.arrayBuffer()));
        } catch { /* skip */ }
      }));
      return clips.size ? { clips, buffers: new WeakMap() } : null;
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
  // base × gain^exp — level law measured from the owner-table speed ladder
  click: { base: 0.9, exp: 1.35 },
  cue: { base: 0.55, exp: 1.25 },
  cushion: { base: 1.0, exp: 1.3 },
  pocket: { base: 0.85, exp: 1.2 },
};

function sampleTier(type, gain) {
  if (type === 'click' || type === 'cushion') {
    return gain < 0.35 ? 's' : gain < 0.7 ? 'm' : 'h';
  }
  if (type === 'cue') return gain < 0.55 ? 'm' : 'h';
  return 'x';
}

/** Voice one cue from the bank. Returns false when this cue should fall
 * back to the synth (no bank / snooker-net pocket has no recording). */
function voiceSample(ac, dest, bank, type, gain, when, prof, rnd, seed) {
  const p = prof[type];
  if (type === 'pocket' && p.kind === 'net') return false;
  const tier = type === 'pocket'
    ? (p.kind === 'return' ? 'r' : 'd')
    : sampleTier(type, gain);
  const list = (SFX_FILES[type][tier] ?? []).filter((n) => bank.clips.has(n));
  if (!list.length) return false; // nothing loaded for this tier -> synth
  // TRUE seeded round-robin: seed is the cue's index in the deriveCues
  // list (identical in the live and offline schedulers → export parity),
  // so consecutive cues cycle the tier's variants deterministically.
  // Drawing the variant from rnd() was NOT a rotation — the first
  // mulberry32 output off the derived per-cue seeds is heavily biased
  // (measured: cue indices 0–3 all landed on the last variant) and
  // machine-gunned one clip. rnd stays for the ±2.5% rate jitter below.
  const name = list[(seed >>> 0) % list.length];
  const src = ac.createBufferSource();
  src.buffer = bankBuffer(ac, bank, name);
  // equipment fScale rides playback rate (smaller balls ring higher AND
  // shorter — physically correct for Hertzian contact); ±2.5% seeded
  // detune de-machine-guns repeats. Cushion clips are the 215 Hz owner
  // Pro-Am rail — other tables' thump pitch maps onto playback rate.
  const fScale = type === 'cushion'
    ? (p.f ? p.f / 215 : 1)
    : (p.fScale ?? 1);
  src.playbackRate.value = fScale * (1 + (rnd() * 2 - 1) * 0.025);
  const lvl = SAMPLE_LEVEL[type];
  const g = ac.createGain();
  g.gain.value = lvl.base * (p.level ?? 1) * Math.pow(gain, lvl.exp);
  let head = src;
  // dull equipment (worn balls, soft tips) — lowpass tilt; the cut must
  // land INSIDE the click's 2-6 kHz brightness band to be audible
  const tilt = p.tilt ?? 1;
  if (tilt < 1) {
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1200 + 2600 * tilt;
    lp.Q.value = 0.4;
    head.connect(lp);
    head = lp;
  }
  head.connect(g);
  g.connect(dest);
  // clips carry a 4 ms safety pre-roll (build_sfx_bank.py PRE_S); start
  // playback past it so a cue scheduled at `when` SOUNDS at `when` (the
  // export gate holds first-onset latency to <= 6 ms)
  src.start(when, 0.004);
  return true;
}

/** Return-gully rumble tail (Diamond Pro-Am pockets) — stays synthesized:
 * the recordings cover the drop+rattle, not the long under-table roll. */
function gullyRumble(ac, dest, noise, level, when) {
  const src = ac.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 240;
  const env = ac.createGain();
  const t0 = when + 0.22;
  env.gain.setValueAtTime(1e-4, t0);
  env.gain.linearRampToValueAtTime(level * 0.14, t0 + 0.18);
  env.gain.exponentialRampToValueAtTime(1e-5, t0 + 1.25);
  src.connect(lp).connect(env).connect(dest);
  src.start(t0);
  src.stop(t0 + 1.3);
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

/** One damped mode: noise -> bandpass(f,q) -> exp-decay gain -> dest.
 * attackS > 0 rounds the onset (leather tip); 0 = hard strike. */
function mode(ac, dest, noise, when, f, q, g, decayS, attackS = 0) {
  if (g <= 0 || f <= 20 || f >= ac.sampleRate / 2) return;
  const src = ac.createBufferSource();
  src.buffer = noise;
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
  src.connect(bp).connect(env).connect(dest);
  src.start(when);
  src.stop(when + attackS + decayS + 0.02);
}

/** The attack "crack": a millisecond of lowpassed noise (contact
 * hardening: faster impacts -> shorter and brighter). */
function crack(ac, dest, noise, when, lpHz, durS, g) {
  if (g <= 0) return;
  const src = ac.createBufferSource();
  src.buffer = noise;
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = lpHz;
  lp.Q.value = 0.5;
  const env = ac.createGain();
  env.gain.setValueAtTime(g, when);
  env.gain.exponentialRampToValueAtTime(Math.max(g * 1e-3, 1e-6), when + durS);
  src.connect(lp).connect(env).connect(dest);
  src.start(when);
  src.stop(when + durS + 0.02);
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
function voicePocket(ac, dest, noise, gain, when, prof, rnd) {
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
  if (p.kind === 'return') gullyRumble(ac, dest, noise, level, when);
}

/**
 * Voice ONE derived cue (sound.js deriveCues shape: type
 * 'click'|'cushion'|'pocket'|'cue', gain 0..1) at AudioContext time `when`,
 * into `dest`. Works on AudioContext and OfflineAudioContext alike.
 * opts.profile: acousticProfile() overlay (default: measured anchor).
 * opts.seed: cue index in the deriveCues list — seeds the per-event
 * micro-variation identically in live playback and offline export.
 * opts.bank: loadSfxBank() result — when present, click/cue/pocket voice
 * from real recordings (cushion + gully rumble stay synthesized); absent
 * or per-cue unusable, the modal synth below is the fallback.
 */
export function scheduleCue(ac, dest, noise, type, gain, when, opts = {}) {
  const profile = opts.profile ?? DEFAULT_PROFILE;
  const rnd = mulberry32((NOISE_SEED ^ Math.imul((opts.seed ?? 0) + 1, 2654435761)) >>> 0);
  if (opts.bank && SFX_FILES[type]
      && voiceSample(ac, dest, opts.bank, type, gain, when, profile, rnd,
        opts.seed ?? 0)) {
    if (type === 'click') {
      // table-coupling body: ball energy conducts through cloth into the
      // slate — without this low-mid layer the dry contact reads as stone,
      // not resin-on-a-table (owner verdict 2026-07). Rides the table's
      // measured rail/slate fundamental, so equipment shifts it for free.
      const lvl = SAMPLE_LEVEL.click.base * Math.pow(gain, 1.3) * 0.16;
      mode(ac, dest, noise, when, profile.cushion.f * 1.1, 4, lvl, 0.045);
    }
    // (sampled 'return' pockets carry the REAL gully rumble in the clip —
    // gullyRumble stays synth-fallback-only)
    return;
  }
  if (type === 'click') return voiceClick(ac, dest, noise, gain, when, profile, rnd);
  if (type === 'cue') return voiceCue(ac, dest, noise, gain, when, profile, rnd);
  if (type === 'cushion') return voiceCushion(ac, dest, noise, gain, when, profile, rnd);
  if (type === 'pocket') return voicePocket(ac, dest, noise, gain, when, profile, rnd);
}
