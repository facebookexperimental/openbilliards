// Copyright (c) Meta Platforms, Inc. and affiliates.

// probe-encoders.mjs — WebCodecs encoder availability + throughput probe for
// the export-quality ruling (the video-export design note (internal)). Runs in headless
// Chrome (measured 2026-07: hardware VideoToolbox H.264/HEVC encoders are
// available and engaged under --headless=new on macOS, so a headed
// comparison adds nothing):
//   1. VideoEncoder.isConfigSupported over {H.264, VP9, AV1, HEVC} ×
//      {1080p, 4K} × {prefer-hardware, prefer-software}
//   2. encode throughput: paints an animated OffscreenCanvas, encodes N
//      VideoFrames, reports fps + encoded bitrate per supported combo
//   3. AudioEncoder support for opus + mp4a.40.2 (AAC-LC)
//   4. MediaRecorder mime support (the realtime fallback tier)
//
//   node tools/render/probe-encoders.mjs [--port 8010]
//        [--out /tmp/obexport/encoders.json]
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

const args = { port: 8010, out: '/tmp/obexport/encoders.json' };
for (let i = 2; i < process.argv.length; i++) {
  const k = process.argv[i];
  if (k === '--port') args.port = Number(process.argv[++i]);
  else if (k === '--out') { args.out = process.argv[++i]; if (args.out === undefined || !String(args.out).trim() || String(args.out).startsWith('--')) { console.error('[probe-encoders] REFUSED — --out given without a value (blank or trailing)'); process.exit(2); } }
  else { console.error(`unknown arg: ${k}`); process.exit(2); }
}

const CODECS = [
  ['h264-high40', 'avc1.640028'],   // High@4.0 — 1080p60 ceiling
  ['h264-high51', 'avc1.640033'],   // High@5.1 — 4K60
  ['vp9-p0', 'vp09.00.10.08'],
  ['av1-main', 'av01.0.08M.08'],
  ['hevc-main', 'hvc1.1.6.L123.b0'],
];
const RESES = [['1080p', 1920, 1080, 12e6], ['4k', 3840, 2160, 40e6]];

const probeJs = `(async () => {
  const out = { videoEncoder: typeof VideoEncoder !== 'undefined',
    audioEncoder: typeof AudioEncoder !== 'undefined',
    mediaRecorder: typeof MediaRecorder !== 'undefined',
    ua: navigator.userAgent, support: [], mrMimes: [] };
  if (out.mediaRecorder) {
    for (const m of ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus',
      'video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/webm;codecs=av01.0.08M.08'])
      if (MediaRecorder.isTypeSupported(m)) out.mrMimes.push(m);
  }
  if (out.videoEncoder) {
    for (const [name, codec] of ${JSON.stringify(CODECS)}) {
      for (const [rname, w, h, br] of ${JSON.stringify(RESES)}) {
        for (const hw of ['prefer-hardware', 'prefer-software']) {
          try {
            const s = await VideoEncoder.isConfigSupported({ codec, width: w,
              height: h, bitrate: br, framerate: 60, hardwareAcceleration: hw });
            out.support.push({ name, codec, res: rname, hw, supported: !!s.supported });
          } catch (e) {
            out.support.push({ name, codec, res: rname, hw, supported: false,
              error: String(e) });
          }
        }
      }
    }
  }
  if (out.audioEncoder) {
    out.audio = [];
    for (const codec of ['opus', 'mp4a.40.2']) {
      try {
        const s = await AudioEncoder.isConfigSupported({ codec,
          sampleRate: 48000, numberOfChannels: 2, bitrate: 128000 });
        out.audio.push({ codec, supported: !!s.supported });
      } catch (e) { out.audio.push({ codec, supported: false, error: String(e) }); }
    }
  }
  return out;
})()`;

// encode `frames` animated OffscreenCanvas frames; returns fps + bitrate.
// Painting cost is included (it is part of any real export loop) but is
// ~0.5 ms/frame — encoder-dominated at 4K.
const encodeJs = (codec, w, h, br, frames, hw) => `(async () => {
  const cv = new OffscreenCanvas(${w}, ${h});
  const c2 = cv.getContext('2d');
  let chunks = 0, bytes = 0, err = null;
  const enc = new VideoEncoder({
    output: (c) => { chunks++; bytes += c.byteLength; },
    error: (e) => { err = String(e); } });
  enc.configure({ codec: ${JSON.stringify(codec)}, width: ${w}, height: ${h},
    bitrate: ${br}, framerate: 60,
    hardwareAcceleration: ${JSON.stringify(hw)} });
  const t0 = performance.now();
  for (let i = 0; i < ${frames}; i++) {
    c2.fillStyle = 'hsl(' + (i * 7 % 360) + ' 60% 35%)';
    c2.fillRect(0, 0, ${w}, ${h});
    c2.fillStyle = '#fff';
    c2.beginPath();
    c2.arc((i * 37) % ${w}, (i * 53) % ${h}, ${h} / 8, 0, 7);
    c2.fill();
    const vf = new VideoFrame(cv, { timestamp: i * 16667 });
    enc.encode(vf, { keyFrame: i % 120 === 0 });
    vf.close();
    while (enc.encodeQueueSize > 4) await new Promise((r) => setTimeout(r, 1));
  }
  await enc.flush();
  const ms = performance.now() - t0;
  enc.close();
  if (err) return { error: err };
  return { fps: ${frames} / (ms / 1000), ms, chunks, bytes,
    mbps: bytes * 8 / (${frames} / 60) / 1e6 };
})()`;

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

async function main() {
  const { base, proc: server } = await ensureServer(args.port);
  const cdpPort = Number(process.env.OB_CDP_PORT ?? 9341);
  // a plain text page is enough — the probe never touches the app
  const chrome = await launchChrome(`${base}README.md`,
    { port: cdpPort, width: 800, height: 600 });
  const result = {};
  try {
    Object.assign(result, await chrome.eval(probeJs));
    console.log(`[probe] VideoEncoder=${result.videoEncoder} `
      + `AudioEncoder=${result.audioEncoder} MediaRecorder=${result.mediaRecorder}`);
    console.log(`[probe] MediaRecorder mimes: ${result.mrMimes.join(', ') || '(none)'}`);
    for (const s of result.support ?? []) {
      console.log(`[probe] ${s.name} ${s.res} ${s.hw}: ${s.supported}`);
    }
    for (const a of result.audio ?? []) {
      console.log(`[probe] audio ${a.codec}: ${a.supported}`);
    }
    result.throughput = [];
    const seen = new Set();
    for (const s of result.support ?? []) {
      if (!s.supported) continue;
      const key = `${s.name}/${s.res}/${s.hw}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const [, w, h, br] = RESES.find((r) => r[0] === s.res);
      const frames = s.res === '4k' ? 90 : 180;
      const r = await chrome.eval(encodeJs(s.codec, w, h, br, frames, s.hw));
      result.throughput.push({ ...s, frames, ...r });
      console.log(`[encode] ${s.name} ${s.res} ${s.hw}: `
        + (r.error ? `ERROR ${r.error}`
          : `${r.fps.toFixed(1)} fps (${r.chunks} chunks, ${r.mbps.toFixed(1)} Mb/s out)`));
    }
  } finally {
    chrome.close();
    await stopStaticServer(server);
  }
  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, JSON.stringify(result, null, 2));
  console.log(`[probe] wrote ${args.out}`);
}

await main();
