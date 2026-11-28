// Copyright (c) Meta Platforms, Inc. and affiliates.

// audio/measure.js — level and spectrum measurements of rendered audio (plain arrays in, plain numbers out). Used by the
// dev page (web/tools/club/dev-audio.html) and the node arm only: the audio service itself never loads this module.
// dBFS here: 0 dB = a sample value of 1 (sample peak), or an RMS of 1 (a full-scale square wave); a full-scale sine has
// an RMS of -3.01 dBFS.

export const toDb = (g) => (g > 0 ? 20 * Math.log10(g) : -Infinity);
const round = (x, n = 2) => (Number.isFinite(x) ? +x.toFixed(n) : null);

/** In-place radix-2 FFT of (re, im); the length is a power of two. */
export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { const tr = re[i]; re[i] = re[j]; re[j] = tr; const ti = im[i]; im[i] = im[j]; im[j] = ti; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi;
        re[a] += xr; im[a] += xi;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

/**
 * Levels of one channel: sample peak, RMS over the whole array, the loudest `win`-second RMS (hops of half a window: what
 * a short sound and a steady one can be compared by), and how long the signal stays within 40 dB of its peak.
 */
export function levels(data, rate, win = 0.05) {
  const n = data.length;
  let s = 0, peak = 0, first = -1, last = -1;
  for (let i = 0; i < n; i++) { const v = data[i]; s += v * v; const a = v < 0 ? -v : v; if (a > peak) peak = a; }
  const floor = peak * 0.01;
  for (let i = 0; i < n; i++) { const a = Math.abs(data[i]); if (a >= floor && peak > 0) { if (first < 0) first = i; last = i; } }
  const w = Math.max(1, Math.round(win * rate)), hop = Math.max(1, w >> 1);
  let best = 0;
  for (let i = 0; i + w <= n; i += hop) { let q = 0; for (let k = i; k < i + w; k++) q += data[k] * data[k]; if (q > best) best = q; }
  if (n < w) best = s * (w / Math.max(1, n)); // shorter than one window: its energy spread over the window
  return {
    seconds: round(n / rate, 3), peakDb: round(toDb(peak)), rmsDb: round(toDb(Math.sqrt(s / Math.max(1, n)))),
    rmsWinDb: round(toDb(Math.sqrt(best / w))), winSec: win,
    activeSec: first >= 0 ? round((last - first + 1) / rate, 3) : 0, startSec: first >= 0 ? round(first / rate, 3) : null,
  };
}

/** RMS and peak per `step` seconds: [{ t, rmsDb, peakDb }]. */
export function curve(data, rate, step = 1) {
  const w = Math.max(1, Math.round(step * rate)), out = [];
  for (let i = 0; i < data.length; i += w) {
    const end = Math.min(data.length, i + w);
    let s = 0, p = 0;
    for (let k = i; k < end; k++) { const v = data[k]; s += v * v; const a = v < 0 ? -v : v; if (a > p) p = a; }
    out.push({ t: round(i / rate, 3), rmsDb: round(toDb(Math.sqrt(s / (end - i)))), peakDb: round(toDb(p)) });
  }
  return out;
}

/**
 * Short-time spectra: Hann windows of `size` samples every `hop` samples. Returns { cols, bins, size, hop, rate, power }
 * with `power` a Float32Array of cols x bins (bins = size / 2), in units where a full-scale sine reads about 1 at its bin.
 */
export function stft(data, rate, size = 2048, hop = size >> 1, maxCols = 4096) {
  const bins = size >> 1;
  const cols = Math.max(1, Math.min(maxCols, Math.floor((data.length - size) / hop) + 1));
  const power = new Float32Array(cols * bins);
  const win = new Float32Array(size);
  let wsum = 0;
  for (let i = 0; i < size; i++) { win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / size); wsum += win[i]; }
  const re = new Float32Array(size), im = new Float32Array(size);
  const norm = 2 / wsum;
  for (let c = 0; c < cols; c++) {
    const at = c * hop;
    for (let i = 0; i < size; i++) { re[i] = (data[at + i] ?? 0) * win[i]; im[i] = 0; }
    fft(re, im);
    for (let b = 0; b < bins; b++) { const m = Math.hypot(re[b], im[b]) * norm; power[c * bins + b] = m * m; }
  }
  return { cols, bins, size, hop, rate, power };
}

/** The mean spectrum of an stft, its centroid (Hz, power-weighted) and octave-band levels in dB (re the band at 1 kHz). */
export function spectrumOf(sp) {
  const mean = new Float64Array(sp.bins);
  for (let c = 0; c < sp.cols; c++) for (let b = 0; b < sp.bins; b++) mean[b] += sp.power[c * sp.bins + b];
  let num = 0, den = 0;
  const hz = sp.rate / sp.size;
  for (let b = 1; b < sp.bins; b++) { mean[b] /= sp.cols; num += mean[b] * b * hz; den += mean[b]; }
  const centres = [63, 125, 250, 500, 1000, 2000, 4000, 8000];
  const bands = {};
  let ref = 0;
  const raw = centres.map((fc) => {
    const lo = fc / Math.SQRT2, hi = fc * Math.SQRT2;
    let s = 0;
    for (let b = Math.max(1, Math.ceil(lo / hz)); b < sp.bins && b * hz < hi; b++) s += mean[b];
    if (fc === 1000) ref = s;
    return s;
  });
  centres.forEach((fc, i) => { bands[fc] = fc * Math.SQRT2 < sp.rate / 2 ? round(10 * Math.log10(raw[i] / (ref || 1e-30)), 1) : null; });
  return { centroidHz: den > 0 ? Math.round(num / den) : null, bandsDb: bands };
}

/** Mix channels to one array (the mean), or return the single channel. */
export function mono(channels) {
  if (channels.length === 1) return channels[0];
  const n = channels[0].length, out = new Float32Array(n);
  for (const ch of channels) for (let i = 0; i < n; i++) out[i] += ch[i] / channels.length;
  return out;
}

/** The stretches where `data` is above `floorDb` (dBFS, per 5 ms block), joined across gaps under `gap` s: [[t0, t1], ...]. */
export function activeSpans(data, rate, floorDb = -80, gap = 0.05) {
  const w = Math.max(1, Math.round(0.005 * rate)), floor = Math.pow(10, floorDb / 20), spans = [];
  let cur = null;
  for (let i = 0; i < data.length; i += w) {
    let p = 0;
    for (let k = i; k < Math.min(data.length, i + w); k++) { const a = Math.abs(data[k]); if (a > p) p = a; }
    const t0 = i / rate, t1 = Math.min(data.length, i + w) / rate;
    if (p >= floor) { if (cur && t0 - cur[1] <= gap) cur[1] = t1; else { cur = [t0, t1]; spans.push(cur); } }
  }
  return spans.map(([a, b]) => [round(a, 3), round(b, 3)]);
}

/** Seconds two lists of spans overlap. */
export function overlapSeconds(a, b) {
  let s = 0;
  for (const [a0, a1] of a) for (const [b0, b1] of b) s += Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
  return round(s, 4);
}

/**
 * Does a sound carry what a voice carries: a STACK OF HARMONICS (three or more consecutive multiples of one fundamental
 * in the range of a voice, 70 to 400 Hz) standing in the band where speech has its formants, 300 to 3000 Hz, and held for
 * the length of a syllable's core? Per frame (Hann, about 43 ms, half-overlapping) the narrow peaks of the spectrum are
 * picked (a local maximum at least `promDb` over the median of its neighbourhood and within 35 dB of the frame's
 * strongest bin); for every fundamental in the range the longest run of consecutive harmonics that all land on a peak is
 * counted (the multiples must lie in the band). A take is FLAGGED when a run of `minRun` or more, on fundamentals within
 * 6 % of each other, lasts `minFrames` frames in a row (three half-overlapping frames: about 85 ms).
 * What does not flag, by design: resonances that are not multiples of one fundamental (a ball's modes, a glass's
 * partials), a single low partial, a fundamental above the voice range, and noise. This measures one thing that speech
 * has and these sounds must not; it does not prove that an ear hears no voice.
 * Returns { flagged, maxRun, f0, heldSec, frames, peaks } (peaks: the strongest narrow peaks in the band of the frame
 * with the longest run, in Hz).
 */
export function harmonicStack(data, rate, opts = {}) {
  const { fLo = 300, fHi = 3000, f0Lo = 70, f0Hi = 400, minRun = 3, minFrames = 3, promDb = 10 } = opts;
  let size = 256;
  while (size < rate * 0.04) size <<= 1;
  const hop = size >> 1, hz = rate / size, bins = size >> 1;
  const win = new Float32Array(size);
  for (let i = 0; i < size; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / size);
  const re = new Float32Array(size), im = new Float32Array(size), db = new Float32Array(bins);
  const frames = [];
  let loudest = -Infinity;
  for (let at = 0; at + size <= data.length; at += hop) {
    for (let i = 0; i < size; i++) { re[i] = data[at + i] * win[i]; im[i] = 0; }
    fft(re, im);
    let top = -Infinity;
    for (let b = 0; b < bins; b++) { const p = re[b] * re[b] + im[b] * im[b]; db[b] = p > 0 ? 10 * Math.log10(p) : -300; if (db[b] > top) top = db[b]; }
    if (top > loudest) loudest = top;
    // narrow peaks up to the top of the band
    const peaks = [];
    const bMax = Math.min(bins - 2, Math.ceil(fHi * 1.03 / hz));
    for (let b = Math.max(2, Math.floor(f0Lo / hz)); b <= bMax; b++) {
      if (!(db[b] > db[b - 1] && db[b] >= db[b + 1]) || db[b] < top - 35) continue;
      const near = [];
      for (let k = b - 10; k <= b + 10; k++) if (k >= 1 && k < bins && Math.abs(k - b) > 2) near.push(db[k]);
      near.sort((x, y) => x - y);
      if (db[b] < near[near.length >> 1] + promDb) continue;
      const a = db[b - 1], c = db[b + 1], d = a - 2 * db[b] + c;
      peaks.push({ f: (b + (d !== 0 ? 0.5 * (a - c) / d : 0)) * hz, db: db[b] });
    }
    // the longest run of consecutive harmonics, over every fundamental of the voice range
    let run = 0, f0 = null;
    if (peaks.length >= minRun) {
      for (let f = f0Lo; f <= f0Hi; f *= 1.005) {
        const tol = Math.max(hz, 0.06 * f);
        let cur = 0, best = 0;
        for (let k = Math.ceil(fLo / f); k * f <= fHi; k++) {
          let hit = false;
          for (const p of peaks) if (Math.abs(p.f - k * f) <= tol) { hit = true; break; }
          if (hit) { cur += 1; if (cur > best) best = cur; } else cur = 0;
        }
        if (best > run) { run = best; f0 = f; }
      }
    }
    frames.push({ top, run, f0, peaks });
  }
  // silence does not count: a frame more than 50 dB under the loudest one is skipped
  let held = 0, bestHeld = 0, maxRun = 0, f0 = null, lastF0 = null, bestFrame = null;
  for (const fr of frames) {
    const live = fr.top >= loudest - 50;
    if (live && fr.run > maxRun) { maxRun = fr.run; f0 = fr.f0; bestFrame = fr; }
    if (live && fr.run >= minRun && (lastF0 === null || Math.abs(fr.f0 / lastF0 - 1) <= 0.06)) { held += 1; lastF0 = fr.f0; }
    else if (live && fr.run >= minRun) { held = 1; lastF0 = fr.f0; }
    else { held = 0; lastF0 = null; }
    if (held > bestHeld) bestHeld = held;
  }
  const band = (bestFrame ?? frames.find((fr) => fr.top === loudest) ?? { peaks: [] }).peaks
    .filter((p) => p.f >= fLo && p.f <= fHi).sort((x, y) => y.db - x.db).slice(0, 6).map((p) => Math.round(p.f)).sort((x, y) => x - y);
  return {
    flagged: bestHeld >= minFrames, maxRun, f0: maxRun >= minRun && f0 ? Math.round(f0) : null,
    heldSec: round(bestHeld > 0 ? (bestHeld + 1) * hop / rate : 0, 3), frames: frames.length, peaks: band,
  };
}
