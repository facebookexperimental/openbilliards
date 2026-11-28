// Copyright (c) Meta Platforms, Inc. and affiliates.

// mini-webaudio.mjs — a small OFFLINE WebAudio subset in plain node, for the sound gates (web/tools/test-sfx-voices.mjs).
// It renders what web/app/synth.js schedules, so a node test can hold laws on the SOUND (peak under full scale on a break,
// a voice's support, translation invariance) and on its COST (nodes created, sources sounding at once), with no browser.
//
// Scope: feed-forward graphs only. BufferSource (start offset, stop, loop, playbackRate, buffers at their own sample
// rate, linear interpolation), Gain, BiquadFilter (lowpass / highpass / bandpass / peaking / shelves, with the WebAudio
// specification's coefficient formulas: Q is in dB for lowpass and highpass), StereoPanner (equal power), Delay, and
// AudioParam automation (setValueAtTime, linearRampToValueAtTime, exponentialRampToValueAtTime, setTargetAtTime).
// Every node renders only the span where it can be nonzero, so a 10 s scene with hundreds of short voices is cheap.
// It is a model of the specification, not of any browser's arithmetic: use it for laws with margin, never for bytes.

/** The specification's refusals: a time that is not finite is a TypeError, a negative one a RangeError. A real engine
 * throws them out of the scheduling call (a voice at -1 ulp aborts an export), so the model must too. */
function timeArg(t, what) {
  if (!Number.isFinite(t)) throw new TypeError(`${what}: the time ${t} is not finite`);
  if (t < 0) throw new RangeError(`${what}: the time ${t} is negative`);
  return t;
}

/** ... and a value that is not finite is a TypeError too, from an automation call and from a plain assignment alike. */
function valueArg(v, what) {
  if (!Number.isFinite(v)) throw new TypeError(`${what}: the value ${v} is not finite`);
  return v;
}

class Param {
  #v;
  constructor(v) { this.#v = v; this.ev = []; }
  get value() { return this.#v; }
  set value(v) { this.#v = valueArg(v, 'value'); }
  setValueAtTime(v, t) { this.ev.push({ k: 'set', v: valueArg(v, 'setValueAtTime'), t: timeArg(t, 'setValueAtTime') }); return this; }
  linearRampToValueAtTime(v, t) {
    this.ev.push({ k: 'lin', v: valueArg(v, 'linearRampToValueAtTime'), t: timeArg(t, 'linearRampToValueAtTime') });
    return this;
  }
  exponentialRampToValueAtTime(v, t) {
    if (!(valueArg(v, 'exponentialRampToValueAtTime') !== 0)) throw new RangeError('exponentialRampToValueAtTime: the target value is 0');
    this.ev.push({ k: 'exp', v, t: timeArg(t, 'exponentialRampToValueAtTime') });
    return this;
  }
  setTargetAtTime(v, t, tc) {
    this.ev.push({ k: 'tgt', v: valueArg(v, 'setTargetAtTime'), t: timeArg(t, 'setTargetAtTime'), tc: valueArg(tc, 'setTargetAtTime') });
    return this;
  }
  get constant() { return this.ev.length === 0; }
  /** Fill out[i] = value at time (n0 + i) / sr. */
  fill(out, n0, sr) {
    if (!this.ev.length) { out.fill(this.value); return; }
    const ev = this.ev.slice().sort((a, b) => a.t - b.t);
    let j = -1; // last event with t <= time
    let v0 = this.value; // value at the end of event j
    for (let i = 0; i < out.length; i++) {
      const t = (n0 + i) / sr;
      while (j + 1 < ev.length && ev[j + 1].t <= t) {
        j++;
        if (ev[j].k !== 'tgt') v0 = ev[j].v;
      }
      const cur = j >= 0 ? ev[j] : null, nx = ev[j + 1];
      if (nx && (nx.k === 'lin' || nx.k === 'exp')) {
        const t0 = cur ? cur.t : 0, f = (t - t0) / (nx.t - t0);
        out[i] = nx.k === 'lin' ? v0 + (nx.v - v0) * f
          : (v0 > 0 && nx.v > 0) || (v0 < 0 && nx.v < 0) ? v0 * Math.pow(nx.v / v0, f) : v0;
      } else if (cur && cur.k === 'tgt') {
        out[i] = cur.v + (v0 - cur.v) * Math.exp(-(t - cur.t) / cur.tc);
      } else out[i] = v0;
    }
  }
}

class Node {
  constructor(ctx, kind = 'node') { this.ctx = ctx; this.kind = kind; this.inputs = []; this._r = null; ctx.nodes++; ctx.all.push(this); }
  connect(n) { n.inputs.push(this); return n; }
  disconnect() {}
  /** Sum of the inputs: { a, ch: [Float64Array…] } (a = first sample index) or null when silent. */
  sumInputs() {
    const rs = this.inputs.map((n) => n.render()).filter(Boolean);
    if (!rs.length) return null;
    if (rs.length === 1) return { a: rs[0].a, ch: rs[0].ch.map((c) => c.slice()) };
    const a = Math.min(...rs.map((r) => r.a)), b = Math.max(...rs.map((r) => r.a + r.ch[0].length));
    const nch = Math.max(...rs.map((r) => r.ch.length));
    const ch = Array.from({ length: nch }, () => new Float64Array(b - a));
    for (const r of rs) for (let c = 0; c < nch; c++) {
      const src = r.ch[Math.min(c, r.ch.length - 1)], dst = ch[c], o = r.a - a;
      for (let i = 0; i < src.length; i++) dst[o + i] += src[i];
    }
    return { a, ch };
  }
  render() { if (this._r === null) this._r = this.process() ?? false; return this._r || null; }
}

class BufferSource extends Node {
  constructor(ctx) { super(ctx, 'source'); this.buffer = null; this.loop = false; this.playbackRate = new Param(1); this.t0 = null; this.off = 0; this.dur = null; this.t1 = null; ctx.sources.push(this); }
  start(when = 0, offset = 0, duration) {
    this.t0 = timeArg(when, 'start'); this.off = timeArg(offset, 'start offset'); this.dur = duration ?? null;
  }
  stop(when) { this.t1 = timeArg(when, 'stop'); }
  /** [start, end) in seconds: when this source can sound. */
  span() {
    if (this.t0 === null || !this.buffer) return null;
    const rate = this.playbackRate.value * this.buffer.sampleRate / this.ctx.sampleRate;
    let end = this.loop ? Infinity : this.t0 + (this.buffer.length / this.buffer.sampleRate - this.off) / this.playbackRate.value;
    if (this.dur !== null) end = Math.min(end, this.t0 + this.dur / this.playbackRate.value);
    if (this.t1 !== null) end = Math.min(end, this.t1);
    return { t0: this.t0, t1: Math.min(end, this.ctx.length / this.ctx.sampleRate), rate };
  }
  process() {
    const s = this.span(); if (!s || !(s.t1 > s.t0)) return null;
    const sr = this.ctx.sampleRate;
    const a = Math.max(0, Math.ceil(s.t0 * sr)), b = Math.min(this.ctx.length, Math.ceil(s.t1 * sr));
    if (b <= a) return null;
    const out = new Float64Array(b - a), d = this.buffer.getChannelData(0), n = d.length;
    const p0 = this.off * this.buffer.sampleRate;
    for (let i = 0; i < out.length; i++) {
      let p = p0 + ((a + i) / sr - s.t0) * sr * s.rate;
      if (this.loop) p %= n; else if (p >= n - 1) { out[i] = p < n ? d[n - 1] * (n - p) : 0; continue; }
      const k = Math.floor(p), f = p - k;
      out[i] = d[k] * (1 - f) + d[(k + 1) % n] * f;
    }
    return { a, ch: [out] };
  }
}

class Gain extends Node {
  constructor(ctx) { super(ctx, 'gain'); this.gain = new Param(1); }
  process() {
    const r = this.sumInputs(); if (!r) return null;
    if (this.gain.constant) { const g = this.gain.value; for (const c of r.ch) for (let i = 0; i < c.length; i++) c[i] *= g; return r; }
    const g = new Float64Array(r.ch[0].length); this.gain.fill(g, r.a, this.ctx.sampleRate);
    for (const c of r.ch) for (let i = 0; i < c.length; i++) c[i] *= g[i];
    return r;
  }
}

export function biquadCoeffs(type, f, Q, gainDb, sr) {
  const w = 2 * Math.PI * Math.min(f, sr / 2 * 0.999) / sr, cs = Math.cos(w), sn = Math.sin(w);
  const A = Math.pow(10, gainDb / 40);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'lowpass' || type === 'highpass') {
    const al = sn / (2 * Math.pow(10, Q / 20)); // Q is in dB for these two types (WebAudio spec)
    if (type === 'lowpass') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; } else { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; }
    a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al;
  } else if (type === 'bandpass') {
    const al = sn / (2 * Q); b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al;
  } else if (type === 'peaking') {
    const al = sn / (2 * Q); b0 = 1 + al * A; b1 = -2 * cs; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cs; a2 = 1 - al / A;
  } else if (type === 'highshelf' || type === 'lowshelf') {
    const al = sn / 2 * Math.SQRT2, k = 2 * al * Math.sqrt(A);
    if (type === 'highshelf') {
      b0 = A * ((A + 1) + (A - 1) * cs + k); b1 = -2 * A * ((A - 1) + (A + 1) * cs); b2 = A * ((A + 1) + (A - 1) * cs - k);
      a0 = (A + 1) - (A - 1) * cs + k; a1 = 2 * ((A - 1) - (A + 1) * cs); a2 = (A + 1) - (A - 1) * cs - k;
    } else {
      b0 = A * ((A + 1) - (A - 1) * cs + k); b1 = 2 * A * ((A - 1) - (A + 1) * cs); b2 = A * ((A + 1) - (A - 1) * cs - k);
      a0 = (A + 1) + (A - 1) * cs + k; a1 = -2 * ((A - 1) + (A + 1) * cs); a2 = (A + 1) + (A - 1) * cs - k;
    }
  } else throw new Error('biquad type ' + type);
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}

class Biquad extends Node {
  constructor(ctx) { super(ctx, 'biquad'); this.type = 'lowpass'; this.frequency = new Param(350); this.Q = new Param(1); this.gain = new Param(0); this.detune = new Param(0); }
  process() {
    const r = this.sumInputs(); if (!r) return null;
    const sr = this.ctx.sampleRate;
    const tail = Math.min(this.ctx.length - (r.a + r.ch[0].length), Math.ceil(sr * 0.25)); // ring-out room
    const n = r.ch[0].length + Math.max(0, tail);
    const fixed = this.frequency.constant;
    let fq = null; if (!fixed) { fq = new Float64Array(n); this.frequency.fill(fq, r.a, sr); }
    let [b0, b1, b2, a1, a2] = biquadCoeffs(this.type, this.frequency.value, this.Q.value, this.gain.value, sr);
    const ch = r.ch.map((src) => {
      const y = new Float64Array(n); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
      for (let i = 0; i < n; i++) {
        if (fq && (i & 31) === 0) [b0, b1, b2, a1, a2] = biquadCoeffs(this.type, fq[i], this.Q.value, this.gain.value, sr);
        const x = i < src.length ? src[i] : 0;
        const v = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
        x2 = x1; x1 = x; y2 = y1; y1 = v; y[i] = v;
      }
      return y;
    });
    return { a: r.a, ch };
  }
}

class Panner extends Node {
  constructor(ctx) { super(ctx, 'panner'); this.pan = new Param(0); }
  process() {
    const r = this.sumInputs(); if (!r) return null;
    const x = (Math.max(-1, Math.min(1, this.pan.value)) + 1) / 2, gl = Math.cos(x * Math.PI / 2), gr = Math.sin(x * Math.PI / 2);
    const m = r.ch.length === 1 ? r.ch[0] : r.ch[0].map((v, i) => (v + r.ch[1][i]) / 2);
    return { a: r.a, ch: [m.map((v) => v * gl), m.map((v) => v * gr)] };
  }
}

class Delay extends Node {
  constructor(ctx) { super(ctx, 'delay'); this.delayTime = new Param(0); }
  process() {
    const r = this.sumInputs(); if (!r) return null;
    const d = Math.round(this.delayTime.value * this.ctx.sampleRate);
    const a = r.a + d; if (a >= this.ctx.length) return null;
    const n = Math.min(r.ch[0].length, this.ctx.length - a);
    return { a, ch: r.ch.map((c) => c.subarray(0, n)) };
  }
}

export class OfflineCtx {
  constructor(channels, length, sampleRate) {
    this.channels = channels; this.length = length; this.sampleRate = sampleRate; this.currentTime = 0;
    this.nodes = 0; this.sources = []; this.all = [];
    this.destination = new Node(this, 'destination'); this.nodes = 0; this.all.length = 0;
  }
  createBuffer(_ch, len, rate) { const d = new Float32Array(len); return { length: len, sampleRate: rate, duration: len / rate, numberOfChannels: 1, getChannelData: () => d }; }
  createBufferSource() { return new BufferSource(this); }
  createGain() { return new Gain(this); }
  createBiquadFilter() { return new Biquad(this); }
  createStereoPanner() { return new Panner(this); }
  createDelay() { return new Delay(this); }
  /** Render: returns [Float32Array per channel]. */
  startRendering() {
    const out = Array.from({ length: this.channels }, () => new Float32Array(this.length));
    for (const n of this.destination.inputs) {
      const r = n.render(); if (!r) continue;
      for (let c = 0; c < this.channels; c++) {
        const src = r.ch[Math.min(c, r.ch.length - 1)], dst = out[c];
        const lim = Math.min(src.length, this.length - r.a);
        for (let i = 0; i < lim; i++) dst[r.a + i] += src[i];
      }
    }
    return out;
  }
  /** Cost census: nodes created, sources, and the peak number of sources sounding at one instant. */
  census() {
    const edges = [];
    for (const s of this.sources) { const sp = s.span(); if (sp && sp.t1 > sp.t0) { edges.push([sp.t0, 1], [sp.t1, -1]); } }
    edges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let cur = 0, peak = 0; for (const [, d] of edges) { cur += d; if (cur > peak) peak = cur; }
    return { nodes: this.nodes, sources: this.sources.length, peakSources: peak };
  }
}
