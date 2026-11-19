// Copyright (c) Meta Platforms, Inc. and affiliates.

// audio/render.js — every sound of the club look's audio service, synthesised once into AudioBuffers (CONTRACT.md 12).
// No file is loaded and nothing is recorded: seeded noise, filters, damped resonances and a few decaying partials, rendered
// through OfflineAudioContext (off the main thread) right after the first user gesture. Nothing here is a voice or is shaped
// like speech: no pitched source in the range of a voice, no formant pair on a pitched source, no syllable rhythm.
//
// What is rendered (renderAssets):
//   bed    the room tone as TWO mono loops of unequal length (31 s and 43 s at 16 kHz; they come round together after
//          22 minutes) and a one-second loop of electrical hum. Air (noise that falls with frequency), a ventilation band
//          that breathes slowly, and the room's own low resonances (its first axial modes, from the club room's interior of
//          11.0 x 9.6 x 3.24 m: 53, 62, 71 and 106 Hz), each drifting by itself. A loop is rendered a little longer than
//          it plays and its tail is cross-faded into its head (equal power), so the seam carries no click and no jump.
//   far    the room's sparse sounds, as short takes at 24 kHz with distance already in them (a low-pass, and the room's
//          own reverberation at a far wet-to-dry ratio): balls meeting on the second table, a glass set down on the bar,
//          a cue butt put down on the floor. (A chair scrape was removed: see plan.js FAR_KINDS.)
//   chalk  the dry rub of chalk on a cue tip, a few strokes with their grain, as takes at 32 kHz.
// Bytes are stated by the result (`bytes`, and per buffer): an AudioBuffer holds 4 bytes per sample and channel.
//
// The pure helpers (noise, curves, the seam, the impulse response) are exported for the node arm.
import { mulberry32, rngFor, mix, CHALK_VARIANTS, FAR_KINDS, FAR_KIND_IDS } from './plan.js';

export const RENDER_VERSION = 1;
/** Sample rates of the three groups. A room tone has nothing to say above a few kHz; the takes keep what their filters leave. */
export const RATES = Object.freeze({ bed: 16000, far: 24000, chalk: 32000 });
/** Loop lengths in seconds [A, B] (primes), the cross-fade of the seam, and the hum loop. */
export const BED = Object.freeze({ seconds: Object.freeze([31, 43]), secondsWide: Object.freeze([17, 23]), xfade: 1.5, humSeconds: 1, humHz: 60 });
/** One far take's place on the render time line, and the longest take kept. */
const FAR_SLOT = 2.0, FAR_KEEP = 1.9, CHALK_SLOT = 1.4, CHALK_KEEP = 1.3;
/** The far room: reverberation time and how much of it a far source carries. */
const ROOM = Object.freeze({ rt60: 0.75, irSeconds: 0.9, wet: 0.85 });

// ---------------------------------------------------------------------------------------------------------------------
// pure helpers
// ---------------------------------------------------------------------------------------------------------------------

/** `n` samples of seeded white noise in [-1, 1). */
export function noiseData(n, seed) {
  const out = new Float32Array(n);
  const r = mulberry32(seed);
  for (let i = 0; i < n; i++) out[i] = r() * 2 - 1;
  return out;
}

/**
 * A slow seeded drift between `lo` and `hi`: knots every `knot` seconds (jittered by a third), joined by half cosines,
 * sampled every `step` seconds over `seconds`. For AudioParam.setValueCurveAtTime (the engine joins the samples linearly).
 */
export function slowCurve(rnd, seconds, { step = 0.5, knot = 8, lo = 0, hi = 1 } = {}) {
  const n = Math.max(2, Math.ceil(seconds / step) + 1);
  const out = new Float32Array(n);
  let t0 = 0, v0 = lo + (hi - lo) * rnd(), t1 = knot * (0.67 + 0.66 * rnd()), v1 = lo + (hi - lo) * rnd();
  for (let i = 0; i < n; i++) {
    const t = i * step;
    while (t > t1) { t0 = t1; v0 = v1; t1 = t0 + knot * (0.67 + 0.66 * rnd()); v1 = lo + (hi - lo) * rnd(); }
    const u = (t - t0) / (t1 - t0);
    out[i] = v0 + (v1 - v0) * (0.5 - 0.5 * Math.cos(Math.PI * u));
  }
  return out;
}

/**
 * Close a loop: `data` holds loop + fade samples; the `fade` samples after the loop's end are cross-faded into its head
 * with equal power (the two stretches are uncorrelated noise). Returns the first `loop` samples as a new array: its last
 * sample is followed, in the source, by the sample its first one now starts from.
 */
export function seamLoop(data, loop, fade) {
  const out = new Float32Array(loop);
  out.set(data.subarray(0, loop));
  const n = Math.min(fade, loop, data.length - loop);
  for (let i = 0; i < n; i++) {
    const th = (i + 0.5) / n * Math.PI / 2;
    out[i] = data[i] * Math.sin(th) + data[loop + i] * Math.cos(th);
  }
  return out;
}

/** Root mean square and sample peak of an array (linear). */
export function rmsPeak(data, from = 0, to = data.length) {
  let s = 0, p = 0;
  for (let i = from; i < to; i++) { const v = data[i]; s += v * v; const a = v < 0 ? -v : v; if (a > p) p = a; }
  const n = Math.max(1, to - from);
  return { rms: Math.sqrt(s / n), peak: p };
}
const toDb = (g) => (g > 0 ? 20 * Math.log10(g) : -Infinity);

/** The electrical hum: `seconds` of the mains frequency and three of its harmonics (whole cycles: the loop closes exactly). */
export function humData(rate, seconds, hz, seed) {
  const n = Math.round(rate * seconds);
  const out = new Float32Array(n);
  const r = rngFor(seed, 0x4b01);
  const parts = [[1, 1.0], [2, 0.5], [3, 0.22], [5, 0.06]];
  for (const [k, g] of parts) {
    const ph = r() * Math.PI * 2, w = 2 * Math.PI * hz * k / rate;
    for (let i = 0; i < n; i++) out[i] += g * Math.sin(w * i + ph);
  }
  return out;
}

/**
 * The far room's impulse response (mono, unit energy): a few early reflections and a decaying, darkening noise tail.
 * Own work (the app's live room is another function; this one belongs to the club room).
 */
export function roomImpulse(rate, seed, { rt60 = ROOM.rt60, seconds = ROOM.irSeconds } = {}) {
  const n = Math.round(rate * seconds);
  const out = new Float32Array(n);
  const r = rngFor(seed, 0x1a01);
  for (let k = 0; k < 7; k++) { // early reflections, 9 to 55 ms
    const i = Math.round(rate * (0.009 + 0.046 * r()));
    out[i] += (r() < 0.5 ? -1 : 1) * (0.55 - 0.05 * k) * (0.6 + 0.4 * r());
  }
  const start = Math.round(rate * 0.03);
  let lp = 0;
  for (let i = start; i < n; i++) {
    const t = i / rate;
    const a = 0.55 - 0.4 * Math.min(1, t / seconds); // the tail loses its top as it decays
    lp += a * ((r() * 2 - 1) - lp);
    out[i] += lp * Math.exp(-6.908 * t / rt60) * Math.min(1, (i - start) / (rate * 0.02));
  }
  let e = 0;
  for (let i = 0; i < n; i++) e += out[i] * out[i];
  const g = e > 0 ? 1 / Math.sqrt(e) : 0;
  for (let i = 0; i < n; i++) out[i] *= g;
  return out;
}

/**
 * The envelope of one scrape or rub: a trapezoid of `dur` seconds whose body is broken into grains (stick, then slip):
 * cells of `cell[0]..cell[1]` seconds, each a fast rise and a decay, of unequal strength. Sampled at `ctl` Hz into `out`
 * from index `at`. `depth` 0 = a smooth stroke, 1 = grains only.
 */
export function grainStroke(out, at, ctl, rnd, { dur, attack = 0.006, release = 0.018, cell = [0.004, 0.009], depth = 0.55, level = 1 }) {
  const n = Math.round(dur * ctl);
  let left = 0, len = 1, amp = 1;
  for (let i = 0; i < n && at + i < out.length; i++) {
    if (left <= 0) { len = Math.max(1, Math.round((cell[0] + (cell[1] - cell[0]) * rnd()) * ctl)); left = len; amp = 0.25 + 0.75 * rnd(); }
    const ph = 1 - left / len;
    left -= 1;
    const grain = amp * Math.exp(-3.2 * ph) * Math.min(1, ph * len / 2 + 0.35);
    const t = i / ctl;
    const env = Math.min(1, t / attack) * Math.min(1, (dur - t) / release);
    out[at + i] = Math.max(0, level * env * ((1 - depth) + depth * grain));
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// WebAudio layers (any BaseAudioContext; used here on OfflineAudioContext only)
// ---------------------------------------------------------------------------------------------------------------------

function biquad(ac, type, f, q, gainDb) {
  const b = ac.createBiquadFilter();
  b.type = type;
  b.frequency.value = Math.min(f, ac.sampleRate * 0.45);
  if (q !== undefined) b.Q.value = q;
  if (gainDb !== undefined) b.gain.value = gainDb;
  return b;
}
function gainNode(ac, v) { const g = ac.createGain(); g.gain.value = v; return g; }
/** A looping read of the shared noise from a seeded offset, started and stopped in one step. */
function noiseSource(ac, noise, when, stopAt, off) {
  const src = ac.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  src.start(when, Math.max(0, off % noise.duration));
  src.stop(stopAt);
  return src;
}
/** One damped resonance: noise -> band-pass -> a decaying gain. */
function burst(ac, dest, noise, when, f, q, g, decay, rnd, attack = 0) {
  if (!(g > 0) || !(f > 20) || f >= ac.sampleRate * 0.45) return;
  const src = noiseSource(ac, noise, when, when + attack + decay + 0.03, rnd() * 0.9);
  const bp = biquad(ac, 'bandpass', f, q);
  const env = ac.createGain();
  env.gain.value = 0;
  if (attack > 0) { env.gain.setValueAtTime(g * 1e-3, when); env.gain.linearRampToValueAtTime(g, when + attack); } else env.gain.setValueAtTime(g, when);
  env.gain.exponentialRampToValueAtTime(g * 1e-3, when + attack + decay);
  env.gain.linearRampToValueAtTime(0, when + attack + decay + 0.01);
  src.connect(bp); bp.connect(env); env.connect(dest);
}
/** A dull contact: low-passed noise under a short decay. */
function thud(ac, dest, noise, when, lpHz, dur, g, rnd) {
  if (!(g > 0)) return;
  const src = noiseSource(ac, noise, when, when + dur + 0.03, rnd() * 0.9);
  const lp = biquad(ac, 'lowpass', lpHz, 0.5);
  const env = ac.createGain();
  env.gain.value = 0;
  env.gain.setValueAtTime(g, when);
  env.gain.exponentialRampToValueAtTime(g * 1e-3, when + dur);
  env.gain.linearRampToValueAtTime(0, when + dur + 0.01);
  src.connect(lp); lp.connect(env); env.connect(dest);
}
/** One decaying partial (glass). */
function partial(ac, dest, when, f, g, decay) {
  if (!(g > 0) || f >= ac.sampleRate * 0.45) return;
  const osc = ac.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = f;
  const env = ac.createGain();
  env.gain.value = 0;
  env.gain.setValueAtTime(0, when);
  env.gain.linearRampToValueAtTime(g, when + 0.0015);
  env.gain.exponentialRampToValueAtTime(g * 1e-3, when + decay);
  env.gain.linearRampToValueAtTime(0, when + decay + 0.01);
  osc.connect(env); env.connect(dest);
  osc.start(when); osc.stop(when + decay + 0.03);
}
/**
 * Noise through `filters` under an envelope given as a control curve (a scrape, a rub), then through `after`. The grains of
 * the envelope are steep, and a steep envelope spreads what it shapes over the whole spectrum: the filters after it put
 * the sound back into its band (without them a rub carries a low crackle that no chalk has).
 */
function shaped(ac, dest, noise, when, curve, ctl, filters, g, rnd, after = []) {
  const dur = curve.length / ctl;
  const src = noiseSource(ac, noise, when, when + dur + 0.02, rnd() * 0.9);
  let head = src;
  for (const f of filters) { head.connect(f); head = f; }
  const env = ac.createGain();
  env.gain.value = 0;
  env.gain.setValueCurveAtTime(curve, when, dur);
  env.gain.setValueAtTime(0, when + dur + 0.001);
  head.connect(env);
  head = env;
  for (const f of after) { head.connect(f); head = f; }
  const lvl = gainNode(ac, g);
  head.connect(lvl); lvl.connect(dest);
}

function offline(Offline, channels, length, rate) {
  try { return new Offline(channels, length, rate); } catch { return new Offline({ numberOfChannels: channels, length, sampleRate: rate }); }
}
/** The first rate of `wanted, ...fallbacks` this engine renders at (an old engine refuses low rates), with its context. */
function offlineAt(Offline, seconds, rates) {
  let last = null;
  for (const rate of rates) {
    try { return { oc: offline(Offline, 1, Math.ceil(seconds * rate), rate), rate }; } catch (e) { last = e; }
  }
  throw last ?? new Error('no OfflineAudioContext rate');
}
function bufferOf(ac, data, rate) {
  const b = ac.createBuffer(1, data.length, rate);
  b.getChannelData(0).set(data);
  return b;
}

// ---------------------------------------------------------------------------------------------------------------------
// the bed
// ---------------------------------------------------------------------------------------------------------------------

/** The club room's first axial modes that a loudspeaker can say anything about [Hz, Q, weight]. */
const ROOM_MODES = Object.freeze([[53, 13, 1.0], [62, 14, 0.8], [71, 14, 0.7], [106, 16, 0.55], [124, 16, 0.4]]);

async function renderBedLoop(Offline, seconds, seed) {
  const want = seconds + BED.xfade;
  const { oc, rate } = offlineAt(Offline, want, [RATES.bed, 22050, 32000, 44100]);
  const n = oc.length;
  const dur = n / rate;
  const rnd = rngFor(seed, 0xbed0);
  const src = oc.createBufferSource();
  src.buffer = bufferOf(oc, noiseData(n, mix(seed, 0xbed1)), rate);
  const hp = biquad(oc, 'highpass', 30, 0.7);
  src.connect(hp);
  const sum = gainNode(oc, 1);
  const drift = (node, opts) => { node.gain.setValueCurveAtTime(slowCurve(rnd, dur, opts), 0, dur); };
  // air: noise that falls with frequency (a low shelf up, a high shelf down, a soft top)
  {
    const a = biquad(oc, 'lowshelf', 280, undefined, 20);
    const b = biquad(oc, 'highshelf', 1300, undefined, -19);
    const c = biquad(oc, 'lowpass', 4000, 0.5);
    const g = gainNode(oc, 1);
    drift(g, { knot: 9, lo: 0.82, hi: 1.12 });
    hp.connect(a); a.connect(b); b.connect(c); c.connect(g); g.connect(sum);
  }
  // ventilation: one broad band that breathes
  {
    const bp = biquad(oc, 'bandpass', 300 + 40 * rnd(), 0.9);
    const g = gainNode(oc, 1);
    drift(g, { knot: 7, lo: 1.2, hi: 3.4 });
    hp.connect(bp); bp.connect(g); g.connect(sum);
  }
  // the room's own resonances, each drifting by itself
  for (const [f, q, w] of ROOM_MODES) {
    const bp = biquad(oc, 'bandpass', f * (1 + (rnd() * 2 - 1) * 0.012), q);
    const g = gainNode(oc, 1);
    drift(g, { knot: 5, lo: 3 * w, hi: 16 * w });
    hp.connect(bp); bp.connect(g); g.connect(sum);
  }
  // the last of the air
  {
    const a = biquad(oc, 'highpass', 2600, 0.7);
    const b = biquad(oc, 'lowpass', 6000, 0.7);
    const g = gainNode(oc, 0.03);
    hp.connect(a); a.connect(b); b.connect(g); g.connect(sum);
  }
  sum.connect(oc.destination);
  src.start(0);
  const rendered = await oc.startRendering();
  const loop = Math.round(seconds * rate);
  const data = seamLoop(rendered.getChannelData(0), loop, Math.round(BED.xfade * rate));
  const { rms, peak } = rmsPeak(data);
  const buffer = bufferOf(oc, data, rate);
  return { buffer, rate, seconds: loop / rate, rms, peak, bytes: loop * 4 };
}

// ---------------------------------------------------------------------------------------------------------------------
// the far takes
// ---------------------------------------------------------------------------------------------------------------------

/** Phenolic balls meeting, heard across the room: a click is a few damped resonances and a millisecond of contact. */
function farClick(ac, dest, noise, when, strength, rnd) {
  const d = 1 + (rnd() * 2 - 1) * 0.03;
  burst(ac, dest, noise, when, 1220 * d, 15, 0.3 * strength, 0.04, rnd);
  burst(ac, dest, noise, when, 1950 * d, 17, 0.9 * strength, 0.052, rnd);
  burst(ac, dest, noise, when, 2720 * d, 15, 0.75 * strength, 0.04, rnd);
  burst(ac, dest, noise, when, 4050 * d, 12, 0.35 * strength * strength, 0.026, rnd);
  thud(ac, dest, noise, when, 1500 + 2500 * strength, 0.003, 0.3 * strength, rnd);
}
function farCushion(ac, dest, noise, when, strength, rnd) {
  thud(ac, dest, noise, when, 340, 0.06, 0.9 * strength, rnd);
  burst(ac, dest, noise, when, 215, 2.5, 0.5 * strength, 0.05, rnd);
}
const FAR_VOICES = {
  // one meeting; two (the cue ball's, then the object ball's); a small cluster; a meeting, a rail, a last soft touch
  balls(ac, dest, noise, t, v, rnd) {
    if (v === 0) { farClick(ac, dest, noise, t, 0.9, rnd); return; }
    if (v === 1) { farClick(ac, dest, noise, t, 1.0, rnd); farClick(ac, dest, noise, t + 0.2 + 0.18 * rnd(), 0.5, rnd); return; }
    if (v === 2) { farClick(ac, dest, noise, t, 1.0, rnd); farClick(ac, dest, noise, t + 0.05 + 0.03 * rnd(), 0.6, rnd); farClick(ac, dest, noise, t + 0.2 + 0.1 * rnd(), 0.4, rnd); return; }
    farClick(ac, dest, noise, t, 0.85, rnd); farCushion(ac, dest, noise, t + 0.3 + 0.12 * rnd(), 0.5, rnd); farClick(ac, dest, noise, t + 0.62 + 0.1 * rnd(), 0.35, rnd);
  },
  // a glass set down on the counter: the base on the wood (twice: it rocks flat), and a short ring of the glass itself
  glass(ac, dest, noise, t, v, rnd) {
    const f0 = 1750 + 760 * rnd();
    const second = t + 0.028 + 0.018 * rnd();
    for (const [at, s] of [[t, 1], [second, 0.45]]) {
      burst(ac, dest, noise, at, 430 * (1 + 0.1 * rnd()), 3, 0.8 * s, 0.035, rnd);
      burst(ac, dest, noise, at, 980 * (1 + 0.1 * rnd()), 5, 0.4 * s, 0.02, rnd);
      thud(ac, dest, noise, at, 900, 0.004, 0.35 * s, rnd);
      partial(ac, dest, at, f0, 0.2 * s, 0.15 + 0.03 * v);
      partial(ac, dest, at, f0 * 2.31, 0.11 * s, 0.09);
      partial(ac, dest, at, f0 * 4.2, 0.045 * s, 0.05);
    }
  },
  // a cue butt put down: the rubber bumper on the boards, a low knock, and (most times) one small rebound
  butt(ac, dest, noise, t, v, rnd) {
    const d = 1 + (rnd() * 2 - 1) * 0.06;
    const hit = (at, s) => {
      thud(ac, dest, noise, at, 300, 0.03, 1.0 * s, rnd);
      burst(ac, dest, noise, at, 150 * d, 4, 0.6 * s, 0.06, rnd);
      burst(ac, dest, noise, at, 720 * d, 6, 0.22 * s, 0.018, rnd);
    };
    hit(t, 1);
    if (v !== 2) hit(t + 0.11 + 0.06 * rnd(), 0.35);
  },
};
/** How far each kind is: the low-pass of the distance (and of what stands in between). */
const FAR_LOWPASS = Object.freeze({ balls: 3800, glass: 5200, butt: 1900 });

/** Cut one take out of a render: from `start` for at most `keep` seconds, ended where it has fallen 60 dB, faded out, peak 1. */
function cutTake(all, rate, start, keep) {
  const i0 = Math.round(start * rate), i1 = Math.min(all.length, i0 + Math.round(keep * rate));
  let peak = 0;
  for (let i = i0; i < i1; i++) { const a = Math.abs(all[i]); if (a > peak) peak = a; }
  if (!(peak > 0)) return null;
  let end = i1;
  while (end > i0 && Math.abs(all[end - 1]) < peak * 1e-3) end--;
  end = Math.min(i1, end + Math.round(0.01 * rate));
  const data = new Float32Array(end - i0);
  const fade = Math.min(data.length, Math.round(0.01 * rate));
  for (let i = 0; i < data.length; i++) data[i] = all[i0 + i] / peak;
  for (let i = 0; i < fade; i++) data[data.length - 1 - i] *= i / fade;
  const { rms } = rmsPeak(data);
  return { data, rms, rendered: peak };
}

async function renderFar(Offline, seed) {
  const takes = [];
  for (const kind of FAR_KIND_IDS) for (let v = 0; v < FAR_KINDS[kind].variants; v++) takes.push([kind, v]);
  const { oc, rate } = offlineAt(Offline, takes.length * FAR_SLOT, [RATES.far, 32000, 44100]);
  const noise = bufferOf(oc, noiseData(rate, mix(seed, 0xfa20)), rate);
  const ir = bufferOf(oc, roomImpulse(rate, seed), rate);
  const bus = {};
  for (const kind of FAR_KIND_IDS) {
    const inp = gainNode(oc, 1);
    const lp = biquad(oc, 'lowpass', FAR_LOWPASS[kind], 0.6);
    const room = oc.createConvolver();
    room.normalize = false; // the response is at unit energy already
    room.buffer = ir;
    const wet = gainNode(oc, ROOM.wet);
    inp.connect(lp); lp.connect(oc.destination); lp.connect(wet); wet.connect(room); room.connect(oc.destination);
    bus[kind] = inp;
  }
  takes.forEach(([kind, v], i) => {
    FAR_VOICES[kind](oc, bus[kind], noise, i * FAR_SLOT + 0.01, v, rngFor(seed, 0xfa30, i));
  });
  const all = (await oc.startRendering()).getChannelData(0);
  const out = {};
  let bytes = 0;
  takes.forEach(([kind, v], i) => {
    const cut = cutTake(all, rate, i * FAR_SLOT, FAR_KEEP);
    if (!cut) return;
    (out[kind] ??= [])[v] = { buffer: bufferOf(oc, cut.data, rate), rate, seconds: cut.data.length / rate, rms: cut.rms, peak: 1, bytes: cut.data.length * 4 };
    bytes += cut.data.length * 4;
  });
  return { takes: out, rate, bytes };
}

// ---------------------------------------------------------------------------------------------------------------------
// chalk
// ---------------------------------------------------------------------------------------------------------------------

/**
 * One chalk take: two to four short strokes of the cube turned on the tip, back and forth (the two directions sound a
 * little different), each a dry band of noise broken into grains, with the small knock of the cube's hollow at each start
 * and, on some takes, a faint high squeak where the chalk catches.
 */
const CHALK_STROKES = Object.freeze([3, 2, 4, 3]);
function chalkTake(ac, dest, noise, t, v, rnd) {
  const ctl = 4000;
  const strokes = CHALK_STROKES[v % CHALK_STROKES.length]; // the takes differ by construction, not by luck
  const len = Math.round(1.1 * ctl);
  const fwd = new Float32Array(len), back = new Float32Array(len);
  const starts = [];
  let at = 0;
  for (let s = 0; s < strokes; s++) {
    const dur = 0.07 + 0.08 * rnd();
    const level = (s === 0 ? 0.8 : 1) * (0.75 + 0.25 * rnd());
    grainStroke(s % 2 ? back : fwd, Math.round(at * ctl), ctl, rnd, { dur, cell: [0.003, 0.008], depth: 0.6, level });
    starts.push([at, dur, level]);
    at += dur + 0.03 + 0.045 * rnd();
    if (at > 1.0) break;
  }
  const body = (peakHz) => [biquad(ac, 'highpass', 1300, 0.7), biquad(ac, 'peaking', peakHz, 1.1, 9), biquad(ac, 'peaking', peakHz * 2.05, 1.4, 4), biquad(ac, 'lowpass', 9000, 0.7)];
  const band = () => [biquad(ac, 'highpass', 1100, 0.7), biquad(ac, 'highpass', 900, 0.7), biquad(ac, 'lowpass', 10000, 0.7)];
  shaped(ac, dest, noise, t, fwd, ctl, body(2900 + 200 * rnd()), 1, rnd, band());
  shaped(ac, dest, noise, t, back, ctl, body(3600 + 250 * rnd()), 0.9, rnd, band());
  for (const [s0, , level] of starts) burst(ac, dest, noise, t + s0, 760 * (1 + 0.08 * rnd()), 5, 0.5 * level, 0.02, rnd);
  if (v % 2 === 1 && starts.length) {
    // the squeak: a thin, high tone that glides for a few hundredths of a second, far under the rub
    const [s0, dur] = starts[Math.min(starts.length - 1, 1 + Math.floor(rnd() * (starts.length - 1)))] ?? starts[0];
    const when = t + s0 + 0.01, d = Math.min(0.09, Math.max(0.04, dur - 0.02));
    const f0 = 2500 + 700 * rnd(), f1 = f0 * (rnd() < 0.5 ? 1.18 : 0.86);
    const osc = ac.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(f0, when);
    osc.frequency.linearRampToValueAtTime(f1, when + d);
    const env = ac.createGain();
    env.gain.value = 0;
    env.gain.setValueAtTime(0, when);
    env.gain.linearRampToValueAtTime(0.11, when + d * 0.35);
    env.gain.linearRampToValueAtTime(0, when + d);
    osc.connect(env); env.connect(dest);
    osc.start(when); osc.stop(when + d + 0.01);
  }
}

async function renderChalk(Offline, seed) {
  const { oc, rate } = offlineAt(Offline, CHALK_VARIANTS * CHALK_SLOT, [RATES.chalk, 44100, 48000]);
  const noise = bufferOf(oc, noiseData(rate, mix(seed, 0xc4a9)), rate);
  for (let v = 0; v < CHALK_VARIANTS; v++) chalkTake(oc, oc.destination, noise, v * CHALK_SLOT + 0.005, v, rngFor(seed, 0xc4aa, v));
  const all = (await oc.startRendering()).getChannelData(0);
  const takes = [];
  let bytes = 0;
  for (let v = 0; v < CHALK_VARIANTS; v++) {
    const cut = cutTake(all, rate, v * CHALK_SLOT, CHALK_KEEP);
    if (!cut) continue;
    takes[v] = { buffer: bufferOf(oc, cut.data, rate), rate, seconds: cut.data.length / rate, rms: cut.rms, peak: 1, bytes: cut.data.length * 4 };
    bytes += cut.data.length * 4;
  }
  return { takes, rate, bytes };
}

// ---------------------------------------------------------------------------------------------------------------------
// everything
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Render what `want` asks for: { bed, far, chalk } booleans (the `sfx` mode wants chalk only). `Offline` is the
 * OfflineAudioContext class. Resolves to { bed?, far?, chalk?, bytes, version }; a group that fails is left out and named
 * in `failed` (the service then runs without it). Never rejects.
 *   bed   = { a, b, hum }, each { buffer, rate, seconds, rms, peak, bytes }: mono loops (rms and peak are linear, as rendered)
 *   far   = { takes: { balls: [...], glass: [...], butt: [...] }, rate, bytes }, each take at peak 1
 *   chalk = { takes: [...], rate, bytes }, each take at peak 1
 */
export async function renderAssets(Offline, seed, want = { bed: true, far: true, chalk: true }) {
  const out = { version: RENDER_VERSION, bytes: 0, failed: [] };
  const fail = (what, e) => { out.failed.push(`${what}: ${String(e?.message ?? e)}`); };
  if (typeof Offline !== 'function') { out.failed.push('no OfflineAudioContext in this engine'); return out; }
  const jobs = [];
  if (want.bed) {
    jobs.push((async () => {
      // an engine that only renders at 32 kHz or more gets the shorter pair of loops: the bed stays under 8 MB
      let wide = false;
      try { offline(Offline, 1, 16, RATES.bed); } catch { try { offline(Offline, 1, 16, 22050); } catch { wide = true; } }
      const secs = wide ? BED.secondsWide : BED.seconds;
      const [a, b] = await Promise.all([renderBedLoop(Offline, secs[0], mix(seed, 0xa)), renderBedLoop(Offline, secs[1], mix(seed, 0xb))]);
      const humRate = a.rate;
      const hd = humData(humRate, BED.humSeconds, BED.humHz, seed);
      const hm = rmsPeak(hd);
      const hum = { buffer: bufferOf(offline(Offline, 1, 16, humRate), hd, humRate), rate: humRate, seconds: hd.length / humRate, rms: hm.rms, peak: hm.peak, bytes: hd.length * 4 };
      out.bed = { a, b, hum, bytes: a.bytes + b.bytes + hum.bytes };
      out.bytes += out.bed.bytes;
    })().catch((e) => fail('bed', e)));
  }
  if (want.far) jobs.push(renderFar(Offline, seed).then((far) => { out.far = far; out.bytes += far.bytes; }).catch((e) => fail('far', e)));
  if (want.chalk) jobs.push(renderChalk(Offline, seed).then((chalk) => { out.chalk = chalk; out.bytes += chalk.bytes; }).catch((e) => fail('chalk', e)));
  await Promise.all(jobs);
  return out;
}

/** What a rendered set is, as plain numbers (for state() and the dev page). */
export function describeAssets(assets) {
  const one = (x) => (x ? { seconds: +x.seconds.toFixed(3), rate: x.rate, channels: 1, bytes: x.bytes, rmsDb: +toDb(x.rms).toFixed(2), peakDb: +toDb(x.peak).toFixed(2) } : null);
  const d = { version: assets?.version ?? null, bytes: assets?.bytes ?? 0, failed: (assets?.failed ?? []).slice() };
  if (assets?.bed) d.bed = { a: one(assets.bed.a), b: one(assets.bed.b), hum: one(assets.bed.hum), bytes: assets.bed.bytes };
  if (assets?.far) { d.far = { rate: assets.far.rate, bytes: assets.far.bytes, takes: {} }; for (const k of Object.keys(assets.far.takes)) d.far.takes[k] = assets.far.takes[k].map(one); }
  if (assets?.chalk) d.chalk = { rate: assets.chalk.rate, bytes: assets.chalk.bytes, takes: assets.chalk.takes.map(one) };
  return d;
}
