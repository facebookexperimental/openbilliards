// Copyright (c) Meta Platforms, Inc. and affiliates.

// synth-render.mjs — DEV TOOL (not a CI gate): render web/app/synth.js cue
// voicings through a real Chrome OfflineAudioContext to wav files, for
// fingerprint calibration against the real-footage/reference targets
// (openbilliards-demos/analysis/audio) and for A/B listening.
//
//   node web/tools/synth-render.mjs [--out DIR] [--port 8291]
//
// Renders: default profile x {cue,click,cushion,pocket} x 3 gains, plus
// equipment-variant probes (snooker / joy_q8 / worn balls / carom).
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome } from './cdp.mjs';

/** OS-assigned free port (a fixed guess can collide with whatever else the
 * box runs, and Chrome exits silently when its debug port won't bind). */
// GH-687: what this tool's numeric port-like flags MEAN (run-gate never guesses)
export const PORT_FLAGS = { '--port': 'http' };
async function freePort() {
  const { heldReason } = await import(new URL('./lib/endpoint-pair.mjs', import.meta.url)); // GH-725 review r11 P2 (a): a held endpoint (a supplied pin) is never handed back
  for (let attempt = 0; attempt < 20; attempt++) {
    const port = await new Promise((resolve, reject) => {
      const srv = net.createServer();
      srv.listen(0, '127.0.0.1', () => {
        const { port } = srv.address();
        srv.close(() => resolve(port));
      });
      srv.on('error', reject);
    });
    if (heldReason(port) === null) return port;
  }
  throw new Error('freePort: 20 OS-assigned ports in a row were held endpoints of this process');
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i > 0 ? process.argv[i + 1] : d;
};
const OUT = path.resolve(arg('--out', '/tmp/ob-synth-render'));
const PORT = Number(arg('--port', 8291));
const SR = 44100;

const MIME = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  if (process.env.OB_RENDER_DEBUG) console.error('  serve:', req.url);
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/__render.html') {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<!doctype html><title>synth render</title>');
    return;
  }
  const p = path.join(ROOT, path.normalize(u.pathname).replace(/^\/+/, ''));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || !fs.statSync(p).isFile()) {
    res.writeHead(404); res.end('nope'); return;
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(p)] ?? 'application/octet-stream' });
  res.end(fs.readFileSync(p));
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

const EQUIP = {
  default: null,
  snooker: { table_id: 'wpbsa_snooker_12ft', cloth_id: 'snooker_napped',
    ballset_id: 'snooker', cue_id: 'standard', cushion_model_id: 'mathavan_fitted' },
  joy_q8: { table_id: 'joy_q8_9ft', cloth_id: 'simonis_860_tournament',
    ballset_id: 'aramith_pool', cue_id: 'standard', cushion_model_id: 'han2005_default' },
  worn: { table_id: 'diamond_proam_9ft', cloth_id: 'worn_slow',
    ballset_id: 'aramith_pool_worn', cue_id: 'standard', cushion_model_id: 'han2005_default' },
  carom: { table_id: 'umb_carom_284', cloth_id: 'carom_worsted_heated',
    ballset_id: 'carom', cue_id: 'standard', cushion_model_id: 'han2005_default' },
};

const CASES = [];
for (const type of ['cue', 'click', 'cushion', 'pocket']) {
  for (const gain of [0.2, 0.55, 1.0]) {
    CASES.push({ name: `default-${type}-g${gain}`, eq: null, type, gain });
  }
}
for (const eqName of ['snooker', 'joy_q8', 'worn', 'carom']) {
  for (const type of ['click', 'cushion', 'pocket']) {
    CASES.push({ name: `${eqName}-${type}-g0.7`, eq: EQUIP[eqName], type, gain: 0.7 });
  }
}

function wav(f32) {
  const n = f32.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22); buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(f32[i] * 32767))), 44 + i * 2);
  }
  return buf;
}

fs.mkdirSync(OUT, { recursive: true });
let chrome = null;
for (let attempt = 1; !chrome; attempt++) {
  try {
    chrome = await launchChrome(`http://127.0.0.1:${PORT}/__render.html`,
      { port: await freePort() });
  } catch (e) {
    if (attempt >= 4) throw e;
    console.error(`chrome launch attempt ${attempt} failed (${e.message}), retrying...`);
    await new Promise((r) => setTimeout(r, 3000));
  }
}
try {
  // wait until the RENDER PAGE's context is live (about:blank also reports
  // readyState 'complete', and the real navigation destroys its context)
  for (let i = 0; i < 60; i++) {
    const state = await chrome
      .eval("location.pathname + ':' + document.readyState")
      .catch(() => '');
    if (state === '/__render.html:complete') break;
    await new Promise((r) => setTimeout(r, 150));
  }
  for (const c of CASES) {
    const expr = `(async () => {
      const load = () => import('http://127.0.0.1:${PORT}/app/synth.js');
      const synth = await load().catch(() =>
        new Promise((r) => setTimeout(r, 400)).then(load));
      const dur = c => (c === 'pocket' ? 2.0 : 0.6);
      const oac = new OfflineAudioContext(1, Math.ceil(${SR} * dur(${JSON.stringify(c.type)})), ${SR});
      const g = oac.createGain(); g.gain.value = 0.8; g.connect(oac.destination);
      const noise = synth.makeNoiseBuffer(oac);
      const profile = synth.acousticProfile(${JSON.stringify(c.eq)} ?? undefined);
      const bank = ${process.argv.includes('--no-bank') ? 'null' : 'await synth.loadSfxBank()'};
      synth.scheduleCue(oac, g, noise, ${JSON.stringify(c.type)}, ${c.gain}, 0.05, { profile, seed: ${7 + CASES.indexOf(c)}, bank });
      const buf = await oac.startRendering();
      const f32 = buf.getChannelData(0);
      let bin = '';
      const u8 = new Uint8Array(f32.buffer);
      for (let i = 0; i < u8.length; i += 0x8000) {
        bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
      }
      return btoa(bin);
    })()`;
    let r = await chrome.send('Runtime.evaluate',
      { expression: expr, awaitPromise: true, returnByValue: true })
      .catch((e) => ({ exceptionDetails: { text: String(e) } }));
    if (r.exceptionDetails) { // one retry: late context swap / cold module fetch
      await new Promise((res) => setTimeout(res, 500));
      r = await chrome.send('Runtime.evaluate',
        { expression: expr, awaitPromise: true, returnByValue: true });
    }
    if (r.exceptionDetails) {
      throw new Error(`${c.name}: ${JSON.stringify(r.exceptionDetails).slice(0, 400)}`);
    }
    const f32 = new Float32Array(Buffer.from(r.result.value, 'base64').buffer);
    fs.writeFileSync(path.join(OUT, `${c.name}.wav`), wav(f32));
    const peak = f32.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
    console.log(`${c.name}.wav  peak=${(20 * Math.log10(peak + 1e-9)).toFixed(1)} dBFS`);
  }
  console.log(`\nwrote ${CASES.length} wavs to ${OUT}`);
} finally {
  chrome.close();
  server.close();
}
