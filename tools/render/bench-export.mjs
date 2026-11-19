// Copyright (c) Meta Platforms, Inc. and affiliates.

// bench-export.mjs — export-quality benchmark for the in-app video-export
// tier ruling (the video-export design note (internal)): measures the per-output-frame
// render cost of the CURRENT playable scene in headless Chrome across a
// {resolution scale} × {accumulation subframes} matrix, plus the per-frame
// readback costs an exporter would pay (1px GPU sync, full readPixels,
// VideoFrame(canvas) grab, CDP captureScreenshot png).
//
// Method: boots web/app.html exactly like web/tools/record.mjs, fires the
// break preset, then drives __test.renderAt(t) manually — S subframe renders
// per output frame (the --shutter accumulation pattern the render-realism
// wave is adding) with a 1px gl.readPixels after each output frame to force
// GPU completion into the timing. Resolution is scaled via CDP
// Emulation.setDeviceMetricsOverride at a 1280×720 base, so 1x/1.5x/2x/3x =
// 720p/1080p/1440p/4K-UHD.
//
//   node tools/render/bench-export.mjs [--out /tmp/obexport/bench.json]
//        [--scales 1,1.5,2,3] [--subframes 1,4,8,16] [--budget 96]
//        [--port 8000]
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
const BASE_W = 1280, BASE_H = 720;

function parseArgs(argv) {
  const a = { out: '/tmp/obexport/bench.json', scales: [1, 1.5, 2, 3],
    subframes: [1, 4, 8, 16], budget: 96, port: 8000 };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--out') { a.out = argv[++i]; if (a.out === undefined || !String(a.out).trim() || String(a.out).startsWith('--')) { console.error('[bench-export] REFUSED — --out given without a value (blank or trailing)'); process.exit(2); } }
    else if (k === '--scales') a.scales = argv[++i].split(',').map(Number);
    else if (k === '--subframes') a.subframes = argv[++i].split(',').map(Number);
    else if (k === '--budget') a.budget = Number(argv[++i]);
    else if (k === '--port') a.port = Number(argv[++i]);
    else { console.error(`unknown arg: ${k}`); process.exit(2); }
  }
  return a;
}

async function probe(url) {
  try { const r = await fetch(url); return r.ok ? await r.text() : null; }
  catch { return null; }
}

/** Reuse a server already answering on `port`, else spawn one for web/. */
async function ensureServer(port) {
  for (const prefix of ['', 'web/']) {
    const t = await probe(`http://127.0.0.1:${port}/${prefix}app.html`);
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

// the renderer's canvas — the app also mounts small widget canvases (aim
// HUD), so "the largest" is the WebGL drawing surface
const CANVAS = `[...document.querySelectorAll('canvas')]
  .sort((a, b) => b.width * b.height - a.width * a.height)[0]`;

// S subframe renders per output frame + a 1px readback to force GPU sync;
// returns ms per OUTPUT frame (render cost only — readbacks measured apart).
const benchJs = (frames, sub) => `(async () => {
  const cv = ${CANVAS};
  const gl = cv.getContext('webgl2') ?? cv.getContext('webgl');
  const px = new Uint8Array(4);
  const sdt = (1 / 60) / ${sub};
  let t = 0.35;
  for (let i = 0; i < 4; i++) {      // warmup after a resize reallocates RTs
    __test.renderAt(t += sdt);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  }
  const t0 = performance.now();
  for (let i = 0; i < ${frames}; i++) {
    for (let j = 0; j < ${sub}; j++) __test.renderAt(t += sdt);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  }
  const t1 = performance.now();
  return { ms: (t1 - t0) / ${frames}, w: cv.width, h: cv.height };
})()`;

// one-off per-scale readback costs (averaged over `n` frames)
const readbackJs = (n) => `(async () => {
  const cv = ${CANVAS};
  const gl = cv.getContext('webgl2') ?? cv.getContext('webgl');
  const full = new Uint8Array(cv.width * cv.height * 4);
  __test.renderAt(0.5);
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, full.subarray(0, 4));
  let t0 = performance.now();
  for (let i = 0; i < ${n}; i++) {
    __test.renderAt(0.5 + i * 0.016);
    gl.readPixels(0, 0, cv.width, cv.height, gl.RGBA, gl.UNSIGNED_BYTE, full);
  }
  const readMs = (performance.now() - t0) / ${n};
  let vfMs = null;
  if (typeof VideoFrame !== 'undefined') {
    t0 = performance.now();
    for (let i = 0; i < ${n}; i++) {
      __test.renderAt(0.6 + i * 0.016);
      const vf = new VideoFrame(cv, { timestamp: i });
      vf.close();
    }
    vfMs = (performance.now() - t0) / ${n};
  }
  return { readMs, vfMs, bytes: full.length };
})()`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { base, proc: server } = await ensureServer(args.port);
  const cdpPort = Number(process.env.OB_CDP_PORT ?? 9337);
  const chrome = await launchChrome(`${base}app.html?seed=4&norec`,
    { port: cdpPort, width: BASE_W, height: BASE_H });
  const rows = [];
  const readbacks = [];
  try {
    await waitReady(chrome);
    await sleep(1200); // textures settle (same wait as record.mjs)
    // fire the break: 10 live balls in motion = representative render load
    const err = await chrome.eval(
      `__test.shoot({ v0: 9, phi: Math.PI / 2, theta: 0, a: 0, b: 0 })`);
    if (err) throw new Error('shoot rejected: ' + err);
    for (let i = 0; i < 100; i++) {
      if (await chrome.eval(`__test.state() === 'PLAYBACK'`)) break;
      await sleep(100);
    }
    const dur = await chrome.eval('__test.duration()');
    console.log(`[bench] break record ${dur.toFixed(2)} s, base ${BASE_W}x${BASE_H}`);
    for (const scale of args.scales) {
      const w = Math.round(BASE_W * scale), h = Math.round(BASE_H * scale);
      await chrome.send('Emulation.setDeviceMetricsOverride',
        { width: w, height: h, deviceScaleFactor: 1, mobile: false });
      await chrome.eval(`window.dispatchEvent(new Event('resize'))`);
      await sleep(400); // RT/composer reallocation
      const got = await chrome.eval(
        `(() => { const c = ${CANVAS}; return { w: c.width, h: c.height }; })()`);
      if (got.w !== w || got.h !== h) {
        throw new Error(`resize did not stick: canvas ${got.w}x${got.h}, want ${w}x${h}`);
      }
      for (const sub of args.subframes) {
        const frames = Math.max(8, Math.ceil(args.budget / sub));
        const r = await chrome.eval(benchJs(frames, sub));
        rows.push({ scale, w, h, sub, frames, msPerFrame: r.ms });
        console.log(`[bench] ${w}x${h} sub=${String(sub).padStart(2)} `
          + `frames=${frames} → ${r.ms.toFixed(2)} ms/output-frame`);
      }
      const rb = await chrome.eval(readbackJs(6));
      // CDP png screenshot cost (the node record.mjs pipeline pays this)
      const t0 = Date.now();
      const SHOTS = 3;
      for (let i = 0; i < SHOTS; i++) {
        await chrome.send('Page.captureScreenshot', { format: 'png' });
      }
      const pngMs = (Date.now() - t0) / SHOTS;
      readbacks.push({ scale, w, h, ...rb, pngMs });
      console.log(`[bench] ${w}x${h} readback: readPixels ${rb.readMs.toFixed(2)} ms, `
        + `VideoFrame ${rb.vfMs?.toFixed(2) ?? 'n/a'} ms, CDP png ${pngMs.toFixed(0)} ms`);
    }
  } finally {
    chrome.close();
    await stopStaticServer(server);
  }
  const table = ['| resolution | subframes | ms/frame | fps | 10 s clip @60fps |',
    '|---|---|---|---|---|'];
  for (const r of rows) {
    const clipSec = (600 * r.msPerFrame) / 1000;
    table.push(`| ${r.w}x${r.h} | ${r.sub} | ${r.msPerFrame.toFixed(2)} `
      + `| ${(1000 / r.msPerFrame).toFixed(1)} | ${clipSec.toFixed(1)} s |`);
  }
  console.log('\n' + table.join('\n'));
  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, JSON.stringify({
    machine: process.env.OB_BENCH_MACHINE ?? 'unspecified',
    date: new Date().toISOString(), base: `${BASE_W}x${BASE_H}`,
    rows, readbacks,
  }, null, 2));
  console.log(`[bench] wrote ${args.out}`);
}

await main();
