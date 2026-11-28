// Copyright (c) Meta Platforms, Inc. and affiliates.

// envdump.mjs — dump the runtime box-projected env cubemap (the one ball/wood
// reflections sample) to face PNGs + print elevation-band radiance stats.
// Needs the window.__dbg forensics surface (app/main.js).
//
//   node web/tools/envdump.mjs --out /tmp/envdump [--look sp] [--exposure 1]
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import {
  launchChrome, sleep, spawnStaticServer, stopStaticServer,
} from './cdp.mjs';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8146;
const args = process.argv.slice(2);
const outDir = args[args.indexOf('--out') + 1] ?? '/tmp/envdump';
const look = args.includes('--look') ? args[args.indexOf('--look') + 1] : 'default';
fs.mkdirSync(outDir, { recursive: true });

// page-side: blit each cube face to a float RT, read pixels, return stats +
// an 8-bit preview (linear x exposure, clamped) as png data urls.
const dumpJs = (exposure) => `(async () => {
  const THREE = await import('./vendor/three.module.min.js');
  const { renderer, cubeRT } = __dbg;
  const N = 128;
  const rt = new THREE.WebGLRenderTarget(N, N, { type: THREE.FloatType, depthBuffer: false });
  const mat = new THREE.ShaderMaterial({
    uniforms: { env: { value: cubeRT.texture }, face: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
    fragmentShader: 'uniform samplerCube env; uniform int face; varying vec2 vUv;\\n' +
      'void main(){ vec2 c = vUv * 2. - 1.; vec3 d;\\n' +
      'if (face==0) d = vec3(1., c.y, -c.x); else if (face==1) d = vec3(-1., c.y, c.x);\\n' +
      'else if (face==2) d = vec3(c.x, 1., -c.y); else if (face==3) d = vec3(c.x, -1., c.y);\\n' +
      'else if (face==4) d = vec3(c.x, c.y, 1.); else d = vec3(-c.x, c.y, -1.);\\n' +
      'gl_FragColor = vec4(textureCube(env, normalize(d)).rgb, 1.); }',
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  const sc = new THREE.Scene(); sc.add(quad);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const faces = [];
  for (let f = 0; f < 6; f++) {
    mat.uniforms.face.value = f;
    renderer.setRenderTarget(rt); renderer.render(sc, cam); renderer.setRenderTarget(null);
    const buf = new Float32Array(N * N * 4);
    renderer.readRenderTargetPixels(rt, 0, 0, N, N, buf);
    faces.push(Array.from(buf));
  }
  rt.dispose(); mat.dispose();
  // face dir math (+x,-x,+y,-y,+z,-z), v = row/N*2-1 maps to +y up
  const dirOf = (f, u, v) => f === 0 ? [1, v, -u] : f === 1 ? [-1, v, u]
    : f === 2 ? [u, 1, -v] : f === 3 ? [u, -1, v] : f === 4 ? [u, v, 1] : [-u, v, -1];
  const bands = {}; // 15-degree elevation bins: mean/max luminance
  for (let f = 0; f < 6; f++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = (x + 0.5) / N * 2 - 1, v = (y + 0.5) / N * 2 - 1;
    const d = dirOf(f, u, v); const l = Math.hypot(d[0], d[1], d[2]);
    const el = Math.asin(d[1] / l) * 180 / Math.PI;
    const i = (y * N + x) * 4, fb = faces[f];
    const lum = 0.2126 * fb[i] + 0.7152 * fb[i + 1] + 0.0722 * fb[i + 2];
    const w = 1 / (l * l * l); // solid-angle weight for cube texels
    const key = Math.floor(el / 15) * 15;
    (bands[key] ??= { s: 0, w: 0, max: 0 });
    bands[key].s += lum * w; bands[key].w += w;
    if (lum > bands[key].max) bands[key].max = lum;
  }
  const stats = Object.fromEntries(Object.entries(bands).map(([k, b]) =>
    [k, { mean: b.s / b.w, max: b.max }]));
  // previews
  const urls = [];
  const cv = document.createElement('canvas'); cv.width = N; cv.height = N;
  const ctx = cv.getContext('2d');
  for (let f = 0; f < 6; f++) {
    const img = ctx.createImageData(N, N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const i = (y * N + x) * 4, o = ((N - 1 - y) * N + x) * 4; // flip to image coords
      for (let c = 0; c < 3; c++) {
        const lin = faces[f][i + c] * ${exposure};
        img.data[o + c] = Math.min(255, 255 * Math.pow(Math.max(lin, 0), 1 / 2.2));
      }
      img.data[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    urls.push(cv.toDataURL('image/png'));
  }
  return { stats, urls };
})()`;

const server = spawnStaticServer(webDir, PORT);
await sleep(700);
const chrome = await launchChrome(`http://127.0.0.1:${PORT}/app.html?seed=1&norec=1`,
  { port: 9254, width: 1280, height: 800 });
try {
  let ready = false;
  for (let i = 0; i < 200 && !ready; i++) { await sleep(200); ready = await chrome.eval('window.__test?.ready === true'); }
  if (!ready) throw new Error('app never became ready');
  if (look !== 'default') { await chrome.eval(`__test.setLook(${JSON.stringify(look)})`); await sleep(1500); }
  const exp = args.includes('--exposure') ? Number(args[args.indexOf('--exposure') + 1]) : 1;
  const { stats, urls } = await chrome.eval(dumpJs(exp));
  const names = ['px', 'nx', 'py', 'ny', 'pz', 'nz'];
  urls.forEach((u, i) => fs.writeFileSync(path.join(outDir, `env-${look}-${names[i]}.png`),
    Buffer.from(u.split(',')[1], 'base64')));
  console.log(`faces written to ${outDir} (exposure x${exp}, gamma 2.2)`);
  console.log('elevation band | mean linear radiance | max');
  for (const k of Object.keys(stats).map(Number).sort((a, b) => b - a)) {
    console.log(`${String(k).padStart(4)}..${String(k + 15).padStart(4)} | `
      + `${stats[k].mean.toFixed(4)} | ${stats[k].max.toFixed(2)}`);
  }
} catch (e) {
  console.error(e.stack ?? e); process.exitCode = 1;
} finally {
  chrome.close(); await stopStaticServer(server);
}
