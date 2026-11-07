// Copyright (c) Meta Platforms, Inc. and affiliates.

// probe-audio.mjs — proves the export-audio route for the video-export
// ruling: the app's event-scheduled synth soundtrack (web/app/sound.js
// deriveCues over the kernel ShotRecord) is rendered through an
// OfflineAudioContext TWICE and byte-compared — identical buffers mean the
// exporter can render the exact soundtrack offline, sample-accurately,
// with no realtime capture. Then AudioEncoder throughput for opus +
// mp4a.40.2 (AAC-LC) on the rendered buffer.
//
// The synth graphs replicate sound.js play()/playPocket() exactly, with ONE
// deliberate change: the noise buffer comes from a seeded mulberry32 PRNG
// (sound.js fills it with Math.random per AudioContext — fine live, but an
// exporter needs cross-run reproducibility, so the ruling requires the
// seeded fill).
//
//   node tools/render/probe-audio.mjs [--port 8011] [--out /tmp/obexport/audio.json]
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import {
  launchChrome, sleep, spawnStaticServer, stopStaticServer,
} from '../../web/tools/cdp.mjs';

// the CDP endpoint's override: OB_CDP_PORT REPLACES it when set (GH-725 review r8 — run-gate reserves the effective endpoint only)
export const PORT_OVERRIDES = { cdp: 'OB_CDP_PORT' };

// GH-687: what this tool's numeric port-like flags MEAN (run-gate never guesses)
export const PORT_FLAGS = { '--port': 'http' };
const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web');
const args = { port: 8011, out: '/tmp/obexport/audio.json' };
for (let i = 2; i < process.argv.length; i++) {
  const k = process.argv[i];
  if (k === '--port') args.port = Number(process.argv[++i]);
  else if (k === '--out') { args.out = process.argv[++i]; if (args.out === undefined || !String(args.out).trim() || String(args.out).startsWith('--')) { console.error('[probe-audio] REFUSED — --out given without a value (blank or trailing)'); process.exit(2); } }
  else { console.error(`unknown arg: ${k}`); process.exit(2); }
}

async function probeHttp(url) {
  try { const r = await fetch(url); return r.ok ? await r.text() : null; }
  catch { return null; }
}
async function ensureServer(port) {
  for (const prefix of ['', 'web/']) {
    const t = await probeHttp(`http://127.0.0.1:${port}/${prefix}app.html`);
    if (t?.includes('openbilliards')) {
      return { base: `http://127.0.0.1:${port}/${prefix}`, proc: null };
    }
  }
  const proc = spawnStaticServer(webDir, port);
  await sleep(700);
  return { base: `http://127.0.0.1:${port}/`, proc };
}
async function waitReady(chrome) {
  for (let i = 0; i < 200; i++) {
    if (await chrome.eval('window.__test?.ready === true')) return;
    await sleep(200);
  }
  throw new Error('app never became ready');
}

// page-side: re-simulate the exact scenario the app submitted, derive the
// cue list with the app's own deriveCues, render the synth track offline
// twice, hash + byte-compare. Import specifiers are document-relative, so
// they resolve for both a web/-rooted and a repo-rooted server.
const renderTwiceJs = `(async () => {
  const scenario = __test.scenarios().at(-1);
  if (!scenario) return { error: 'no scenario logged — shoot first' };
  const { deriveCues } = await import('./app/sound.js');
  const glue = await import('./dist/pool-wasm/pool_wasm.js');
  const sdk = await import('./dist/pool-sdk/index.js');
  const engine = await sdk.init(glue);
  const record = JSON.parse(engine.simulateJson(scenario));
  const cues = deriveCues(record);
  const dur = sdk.recordDuration(record) + 0.6;
  let s = 1234; // mulberry32 — the seeded replacement for sound.js noise
  const rand = () => { s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const noiseData = new Float32Array(24000);
  for (let i = 0; i < noiseData.length; i++) noiseData[i] = rand() * 2 - 1;
  const SPEC = {
    click:   { freq: 3400, q: 1.2, dur: 0.035, g: 0.9 },
    cushion: { freq: 520,  q: 0.9, dur: 0.070, g: 0.7 },
    cue:     { freq: 5200, q: 2.0, dur: 0.018, g: 0.5 },
  };
  function render() {
    const oc = new OfflineAudioContext(2, Math.ceil(dur * 48000), 48000);
    const master = oc.createGain();
    master.gain.value = 0.8;
    master.connect(oc.destination);
    const noise = oc.createBuffer(1, noiseData.length, 48000);
    noise.getChannelData(0).set(noiseData);
    const tap = (freq, q, g, when, d) => {
      const src = oc.createBufferSource();
      src.buffer = noise;
      const bp = oc.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = q;
      const env = oc.createGain();
      env.gain.setValueAtTime(g, when);
      env.gain.exponentialRampToValueAtTime(1e-3, when + d);
      src.connect(bp).connect(env).connect(master);
      src.start(when); src.stop(when + d + 0.02);
    };
    for (const c of cues) {
      const when = c.t + 0.05;
      if (c.type !== 'pocket') {
        const sp = SPEC[c.type];
        tap(sp.freq, sp.q, sp.g * c.gain, when, sp.dur);
        continue;
      }
      const osc = oc.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(150, when);
      osc.frequency.exponentialRampToValueAtTime(55, when + 0.12);
      const env = oc.createGain();
      env.gain.setValueAtTime(0.8 * c.gain, when);
      env.gain.exponentialRampToValueAtTime(1e-3, when + 0.14);
      osc.connect(env).connect(master);
      osc.start(when); osc.stop(when + 0.16);
      [0.05, 0.11, 0.18].forEach((dt, i) =>
        tap(900 - i * 150, 1.0, 0.3 * c.gain / (i + 1), when + dt, 0.04));
    }
    return oc.startRendering();
  }
  const b1 = await render(), b2 = await render(), b3 = await render();
  const hash = async (buf, ch) => {
    const bytes = new Uint8Array(buf.getChannelData(ch).buffer.slice(0));
    const h = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, '0')).join('');
  };
  const cmp = (x, y) => { // pairwise: max |diff| + how many samples differ
    let maxDiff = 0, nDiff = 0;
    for (let ch = 0; ch < 2; ch++) {
      const a = x.getChannelData(ch), b = y.getChannelData(ch);
      for (let i = 0; i < a.length; i++) {
        const d = Math.abs(a[i] - b[i]);
        if (d > 0) { nDiff++; if (d > maxDiff) maxDiff = d; }
      }
    }
    return { maxDiff, nDiff };
  };
  let peak = 0;
  { const a = b1.getChannelData(0);
    for (let i = 0; i < a.length; i++) if (Math.abs(a[i]) > peak) peak = Math.abs(a[i]); }
  const pairs = { p12: cmp(b1, b2), p23: cmp(b2, b3), p13: cmp(b1, b3) };
  const maxDiff = Math.max(pairs.p12.maxDiff, pairs.p23.maxDiff, pairs.p13.maxDiff);
  const hashes = [await hash(b1, 0), await hash(b2, 0), await hash(b3, 0)];
  const identical = maxDiff === 0;
  // verdict: bit-exact | ulp (float-add-order jitter, inaudible at <-120
  // dBFS, erased by any lossy encode) | divergent (a real scheduling bug)
  const verdict = identical ? 'bit-exact'
    : maxDiff < 1e-6 ? 'ulp-level' : 'divergent';
  // AudioEncoder throughput on the rendered soundtrack (opus, AAC-LC)
  async function encodeAudio(codec) {
    if (typeof AudioEncoder === 'undefined') return { error: 'no AudioEncoder' };
    const sup = await AudioEncoder.isConfigSupported({ codec, sampleRate: 48000,
      numberOfChannels: 2, bitrate: 128000 });
    if (!sup.supported) return { supported: false };
    let chunks = 0, bytes = 0, err = null;
    const enc = new AudioEncoder({
      output: (c) => { chunks++; bytes += c.byteLength; },
      error: (e) => { err = String(e); } });
    enc.configure({ codec, sampleRate: 48000, numberOfChannels: 2, bitrate: 128000 });
    const N = 1024;
    const t0 = performance.now();
    for (let off = 0; off < b1.length; off += N) {
      const n = Math.min(N, b1.length - off);
      const data = new Float32Array(n * 2);
      data.set(b1.getChannelData(0).subarray(off, off + n), 0);
      data.set(b1.getChannelData(1).subarray(off, off + n), n);
      const ad = new AudioData({ format: 'f32-planar', sampleRate: 48000,
        numberOfFrames: n, numberOfChannels: 2,
        timestamp: Math.round(off / 48000 * 1e6), data });
      enc.encode(ad);
      ad.close();
    }
    await enc.flush();
    const ms = performance.now() - t0;
    enc.close();
    if (err) return { error: err };
    return { supported: true, chunks, bytes, ms,
      xRealtime: (b1.duration * 1000) / ms };
  }
  return { cueCount: cues.length, dur, samples: b1.length, peak, maxDiff,
    pairs, identical, verdict, hashes,
    opus: await encodeAudio('opus'), aac: await encodeAudio('mp4a.40.2') };
})()`;

async function main() {
  const { base, proc: server } = await ensureServer(args.port);
  const cdpPort = Number(process.env.OB_CDP_PORT ?? 9345);
  const chrome = await launchChrome(`${base}app.html?seed=4&norec`,
    { port: cdpPort, width: 800, height: 500 });
  let result;
  try {
    await waitReady(chrome);
    await sleep(800);
    // the break: strike + rack clatter + cushions = a dense cue list
    const err = await chrome.eval(
      `__test.shoot({ v0: 9, phi: Math.PI / 2, theta: 0, a: 0, b: 0 })`);
    if (err) throw new Error('shoot rejected: ' + err);
    for (let i = 0; i < 100; i++) {
      if (await chrome.eval(`__test.state() === 'PLAYBACK'`)) break;
      await sleep(100);
    }
    result = await chrome.eval(renderTwiceJs);
  } finally {
    chrome.close();
    await stopStaticServer(server);
  }
  if (result.error) throw new Error(result.error);
  console.log(`[audio] ${result.cueCount} cues over ${result.dur.toFixed(2)} s → `
    + `${result.samples} samples/ch @48 kHz (peak ${result.peak.toFixed(3)})`);
  console.log(`[audio] 3 renders, ch0 sha256: `
    + result.hashes.map((h) => h.slice(0, 12) + '…').join(' '));
  for (const [k, p] of Object.entries(result.pairs)) {
    console.log(`[audio] ${k}: maxDiff=${p.maxDiff} over ${p.nDiff} samples`
      + (p.maxDiff > 0 ? ` (${(20 * Math.log10(p.maxDiff)).toFixed(0)} dBFS)` : ''));
  }
  console.log(`[audio] VERDICT: ${result.verdict} (maxDiff ${result.maxDiff})`);
  for (const [name, r] of [['opus', result.opus], ['aac', result.aac]]) {
    console.log(`[audio] ${name}: ` + (r.error ? `ERROR ${r.error}`
      : r.supported === false ? 'unsupported'
        : `${r.chunks} chunks, ${(r.bytes / 1024).toFixed(0)} KiB, `
          + `${r.xRealtime.toFixed(0)}x realtime`));
  }
  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, JSON.stringify(result, null, 2));
  console.log(`[audio] wrote ${args.out}`);
  if (result.verdict === 'divergent') {
    console.error('AUDIO DETERMINISM FAILED (divergent beyond float-add-order jitter)');
    process.exit(1);
  }
}

await main();
