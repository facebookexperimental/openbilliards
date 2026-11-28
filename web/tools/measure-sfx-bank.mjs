// Copyright (c) Meta Platforms, Inc. and affiliates.

// measure-sfx-bank.mjs — what the shipped recordings themselves say about each impact (plain node, no browser).
//
// The clip conditioning (web/app/synth.js conditionClip) keeps a clip's direct sound and fades the rest. Its constants
// (CLIP_SHAPE) are measured HERE, on the bank's own WAV files (web/assets/sfx, the owner-recorded takes) and on nothing
// else: no other recording, no outside target. web/tools/test-sfx-voices.mjs imports measureBank() and holds CLIP_SHAPE
// and the tier order of SFX_FILES to it, so a constant cannot drift away from the recordings unnoticed.
//
//   node web/tools/measure-sfx-bank.mjs          the tables (per clip with --clips)
//
// What is measured, per take, above and below the split near 900 Hz (the same one-pole split conditionClip uses):
//   - the onset, by conditionClip's own rule (first 0.5 ms block within 8 dB of the head's peak);
//   - a sliding RMS envelope from the onset (window 1 ms above the split, 4 ms below it: about one period of the band's
//     lowest content; hop 0.25 ms);
//   - the peak (first 12 ms) and the FLOOR: the level the band then stays at (median of the envelope 30-100 ms after
//     the onset: the room, the table, the rolling the impact set off);
//   - `reached`: when, after the onset, the envelope first comes within 3 dB of that floor;
//   - `tau`: the decay time constant of that fall (least-squares slope of the envelope in dB, peak to `reached`);
//   - `before`: the level of the lead-in before the impact, under the same peak (what the take sounded like without it).
// Per class the medians of these are the rule's numbers. From the conditioned clips: the low-to-high energy ratio and
// the energy at a -6 dBFS peak (class medians: CLIP_SHAPE balance and energy), and each clip's spectral centroid (46 ms
// Hann window from its onset: the order of each tier in SFX_FILES).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readWav(file) {
  const b = fs.readFileSync(file);
  let off = 12, rate = 44100, ch = 1, data = null;
  while (off + 8 <= b.length) {
    const id = b.toString('latin1', off, off + 4), size = b.readUInt32LE(off + 4), body = off + 8;
    if (id === 'fmt ') { ch = b.readUInt16LE(body + 2); rate = b.readUInt32LE(body + 4); }
    else if (id === 'data') {
      const n = Math.floor(Math.min(size, b.length - body) / 2 / ch);
      data = new Float32Array(n);
      for (let i = 0; i < n; i++) data[i] = b.readInt16LE(body + i * 2 * ch) / 32768;
    }
    off = body + size + (size & 1);
  }
  return { rate, data };
}

const median = (a) => {
  const s = a.filter(Number.isFinite).sort((x, y) => x - y);
  return s.length ? (s[(s.length - 1) >> 1] + s[s.length >> 1]) / 2 : NaN;
};
const quartiles = (a) => {
  const s = a.filter(Number.isFinite).sort((x, y) => x - y);
  return [s[Math.floor((s.length - 1) * 0.25)], s[Math.ceil((s.length - 1) * 0.75)]];
};

/** The onset of a take: conditionClip's rule, mirrored (keep the two in step). */
function onsetOf(x, rate) {
  const n = x.length, blk = Math.max(1, Math.floor(rate / 2000));
  const first = Math.min(n, 6 * blk), last = Math.min(n, Math.floor(rate * 0.03));
  let head = 0;
  for (let i = first; i < last; i++) head = Math.max(head, Math.abs(x[i]));
  for (let b = first; b + blk <= last; b += blk) {
    let m = 0;
    for (let i = b; i < b + blk; i++) m = Math.max(m, Math.abs(x[i]));
    if (m >= 0.4 * head) return { on: b, first };
  }
  return { on: first, first };
}

function splitBands(x, rate) {
  const a = 1 - 5655 / rate, lo = new Float64Array(x.length), hi = new Float64Array(x.length);
  let lp = 0;
  for (let i = 0; i < x.length; i++) { lp = a * lp + (1 - a) * x[i]; lo[i] = lp; hi[i] = x[i] - lp; }
  return { lo, hi };
}

/** One band of one take: floor, reached, tau, before (see the header). Levels in dB under the band's peak. */
function measureBand(y, rate, on, first, winMs) {
  const W = Math.floor(rate * winMs / 1000), hop = rate / 4000;
  const db = (i0) => { let s = 0; for (let j = 0; j < W; j++) s += y[i0 + j] * y[i0 + j]; return 10 * Math.log10(s / W + 1e-14); };
  const env = [];
  for (let k = 0; ; k++) { const i0 = Math.floor(on + k * hop); if (i0 + W > y.length) break; env.push(db(i0)); }
  let pk = 0;
  for (let k = 1; k < Math.min(env.length, 48); k++) if (env[k] > env[pk]) pk = k;
  const floor = median(env.slice(120, 400));
  let tf = pk;
  while (tf < env.length - 1 && env[tf] > floor + 3) tf++;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  const m = tf - pk + 1;
  for (let k = pk; k <= tf; k++) { const t = k * 0.25; sx += t; sy += env[k]; sxx += t * t; sxy += t * env[k]; }
  const slope = m > 2 ? (m * sxy - sx * sy) / (m * sxx - sx * sx) : NaN;
  // the lead-in: clear of the slicer's hard start and of the impact's rise
  const b0 = first, b1 = on - Math.floor(rate * 0.0015);
  let pre = NaN;
  if (b1 - b0 >= W) { let s = 0; for (let i = b0; i < b1; i++) s += y[i] * y[i]; pre = 10 * Math.log10(s / (b1 - b0) + 1e-14); }
  return { floor: env[pk] - floor, reached: tf * 0.25, tau: slope < 0 ? -8.686 / slope : NaN, before: env[pk] - pre };
}

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}

/** Spectral centroid [Hz] of a clip: 2048-sample Hann window from where it first passes a tenth of its peak; above 60 Hz. */
function centroidOf(x, rate) {
  let peak = 0;
  for (const v of x) peak = Math.max(peak, Math.abs(v));
  let start = 0;
  for (let i = 0; i < x.length; i++) if (Math.abs(x[i]) > peak * 0.1) { start = i; break; }
  const n = 2048, re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = (x[start + i] ?? 0) * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1)));
  fft(re, im);
  let sum = 0, wsum = 0;
  for (let i = 1; i < n / 2; i++) {
    const f = i * rate / n;
    if (f < 60) continue;
    const p = re[i] * re[i] + im[i] * im[i];
    sum += p; wsum += p * f;
  }
  return wsum / sum;
}

const ratioOf = (y, rate) => {
  const { lo, hi } = splitBands(y, rate);
  let eLo = 0, eHi = 0;
  for (let i = 0; i < y.length; i++) { eLo += lo[i] * lo[i]; eHi += hi[i] * hi[i]; }
  return eLo / eHi;
};

/**
 * Measure the bank. `synth` is the web/app/synth.js module (for conditionClip, CLIP_SHAPE and SFX_FILES).
 * Returns { tail: { click|cue|cushion: { hi, lo } }, balance, energy, centroid, clips } where hi / lo are
 * { floor, reached, tau, before } class medians (with `q`, the quartiles of each), balance and energy the class medians
 * of the conditioned clips, and centroid a map clip name -> Hz of the conditioned clip.
 */
export function measureBank(synth, sfxDir = path.join(WEB, 'assets/sfx')) {
  const out = { tail: {}, balance: {}, energy: {}, centroid: {}, clips: {} };
  for (const cls of Object.keys(synth.SFX_FILES)) {
    const names = Object.values(synth.SFX_FILES[cls]).flat();
    const takes = names.map((name) => ({ name, ...readWav(path.join(sfxDir, name)) }));
    const shape = synth.CLIP_SHAPE[cls];
    if (cls !== 'pocket') { // a pocket take is a knock train, not one impact: it has no single fall to measure
      const rows = takes.map(({ name, rate, data }) => {
        const { on, first } = onsetOf(data, rate);
        const { lo, hi } = splitBands(data, rate);
        const row = { hi: measureBand(hi, rate, on, first, 1), lo: measureBand(lo, rate, on, first, 4) };
        out.clips[name] = row;
        return row;
      });
      out.tail[cls] = {};
      for (const band of ['hi', 'lo']) {
        const m = { q: {} };
        for (const key of ['floor', 'reached', 'tau', 'before']) {
          m[key] = median(rows.map((r) => r[band][key]));
          m.q[key] = quartiles(rows.map((r) => r[band][key]));
        }
        out.tail[cls][band] = m;
      }
    }
    out.balance[cls] = median(takes.map(({ rate, data }) =>
      ratioOf(synth.conditionClip(data, rate, { ...shape, balance: 0, energy: 0 }), rate)));
    out.energy[cls] = median(takes.map(({ rate, data }) => {
      const y = synth.conditionClip(data, rate, { ...shape, energy: 0 });
      let e = 0;
      for (const v of y) e += v * v;
      return e / rate;
    }));
    for (const { name, rate, data } of takes) out.centroid[name] = centroidOf(synth.conditionClip(data, rate, shape), rate);
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const synth = await import(pathToFileURL(path.join(WEB, 'app/synth.js')).href);
  const m = measureBank(synth);
  const f1 = (x) => x.toFixed(1), rng = (q) => `[${q.map(f1).join('..')}]`;
  if (process.argv.includes('--clips')) {
    for (const [name, r] of Object.entries(m.clips)) {
      const s = (b) => `floor -${f1(b.floor)} dB (before the impact -${f1(b.before)}), reached ${f1(b.reached)} ms, tau ${f1(b.tau)} ms`;
      console.log(`${name.padEnd(15)} above: ${s(r.hi)} | below: ${s(r.lo)}`);
    }
  }
  console.log('The fall of the direct sound, class medians [quartiles] (levels in dB under the band\'s peak):');
  for (const [cls, t] of Object.entries(m.tail)) {
    for (const [band, label] of [['hi', 'above the split'], ['lo', 'below the split']]) {
      const b = t[band];
      console.log(`  ${cls.padEnd(8)} ${label}: floor -${f1(b.floor)} dB ${rng(b.q.floor)} (before the impact -${f1(b.before)} dB),`
        + ` reached ${f1(b.reached)} ms after the onset ${rng(b.q.reached)}, tau ${f1(b.tau)} ms ${rng(b.q.tau)}`);
    }
  }
  console.log('CLIP_SHAPE as shipped, against the conditioned clips\' class medians:');
  for (const cls of Object.keys(synth.SFX_FILES)) {
    const sh = synth.CLIP_SHAPE[cls];
    console.log(`  ${cls.padEnd(8)} holdMs ${sh.holdMs} hiMs ${sh.hiMs} loMs ${sh.loMs} | low-to-high energy ratio ${m.balance[cls].toFixed(3)}`
      + ` (balance ${sh.balance ?? 'none'}) | energy ${m.energy[cls].toExponential(2)} (energy ${sh.energy})`);
  }
  console.log('Conditioned-clip centroids, in SFX_FILES order (Hz):');
  for (const [cls, tiers] of Object.entries(synth.SFX_FILES)) {
    console.log(`  ${cls.padEnd(8)} ${Object.entries(tiers).map(([t, list]) => `${t} ${list.map((n) => Math.round(m.centroid[n])).join(' / ')}`).join(' | ')}`);
  }
}
