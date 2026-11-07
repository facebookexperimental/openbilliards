// Copyright (c) Meta Platforms, Inc. and affiliates.

// bake-cue-thumbs.mjs — committed cue-card thumb bake (feature 032 S2.5,
// GH-525 item B; authority: docs/research/design-525-carousel-taste.md §3.7).
// Renders every PICKER-VISIBLE catalog cue id through the REAL
// web/scene/cuestick.js buildCue({ cueId }) — the cuelooks.js registry look,
// never a re-drawn approximation — in a minimal neutral studio (transparent
// background, soft key + rim + hemisphere fill, satin ACES exposure) and
// commits the frames into web/assets/cues/<id>.png, following the
// tools/render/bake-lightmap.mjs → web/assets/gi/ committed-bake precedent.
//
// FRAMING REGISTERS (--frame face|full; default face):
//   face — GH-668 S5 slice 5 G7 (BACKLOG B-EQ07 "faces fill >= 60 % of the
//     card"): the card face is 2:1 (atelier.css thumb well 112x56 CSS; baked
//     @2x = 224x112, the station strips' frame size). The tip-side THIRD of
//     the cue on a 30 deg diagonal — TIP at the top-right margin, the shaft
//     running down-left and OUT of the frame through the bottom edge (a
//     product detail crop: the visible run = the tip-side third of the
//     tip-to-joint run (1.053 m / 3 = 0.351 m) = tip, ferrule and the first
//     ~0.32 m of shaft, so the look registry's shaft wood, ferrule and tip
//     read at card scale). Relative-length truth no longer reads on
//     the FACE by that ruling; the S5-F arm (web/tools/e2e-atelier-s5.mjs)
//     judges the alpha bbox of every shipped face >= 0.60 of its area.
//   full — the pre-G7 law, kept byte-exact (the relative-length register and
//     the framing twin of web/app/cuethumbs.js paintCueSilhouette, the
//     <img>-failure DEGRADE painter, which keeps this law): one FIXED
//     orthographic camera for every id, sized so the 1.477 m envelope-length
//     cue fills the frame width inside a 3.5 % margin per side, cue laid
//     horizontally with the TIP anchored at the left margin. 640x128.
//
// Serving/browser pattern: synth-render.mjs's self-served virtual page
// (own node http server over web/ + /__bake-cue-thumbs.html carrying the
// 'three' importmap) driven through cdp.mjs launchChrome — the pinned
// tracked-PID chrome-headless-shell, NEVER the installed Chrome app
// (GH-294). Pixels come back over CDP as raw RGBA (gl.readPixels), are
// unpremultiplied against the AA coverage (clean alpha edges) and encoded
// by the deterministic lib/png.mjs encoder (fixed filter/zlib), so re-runs
// are byte-stable where the GPU rasterizer allows (same machine/driver).
//
//   node web/tools/render/bake-cue-thumbs.mjs [--out <dir>] [--port <http>]
//                                             [--frame face|full] [--force]
//
// --force skips the browser-lane wait (below). The bake refuses to start
// while another e2e-/capture-/bake- browser lane is running on this box
// (shared CI/GPU quota discipline): it polls pgrep and waits up to
// OB_BAKE_LANE_WAIT_MS (default 15 min) for the box to go quiet.
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { encodePng } from './lib/png.mjs';
import { repoRoot, repoUrl } from './lib/ensure-three.mjs';

// cdp.mjs lives beside the web/tools gates; this file is reachable both as
// tools/render/… and via the web/tools/render symlink, so the import goes
// through the realpathed repo root (the check-cue-looks.mjs idiom).
// GH-687: what this tool's numeric port-like flags MEAN (run-gate never guesses)
export const PORT_FLAGS = { '--port': 'http', '--cdp': 'cdp' };
const { launchChrome, sleep } = await import(repoUrl('web/tools/cdp.mjs'));
const { catalogEntries } = await import(repoUrl('web/dist/pool-sdk/catalog.js'));

const args = process.argv.slice(2);
const argOf = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const { pathOpt: __pathOpt, stringOpt: __stringOpt } = await import('./lib/argv.mjs'); // FIX2 (review round 2 on #731): option presence is not option value

const WEB = path.join(repoRoot, 'web');
const OUT = path.resolve(__pathOpt('--out', { default: path.join(WEB, 'assets', 'cues'), tag: 'bake-cue-thumbs' }));
const PORT = Number(argOf('--port', 8351));
// ---- turntable-sprite mode (owner directive 2026-08-18: rotating card
// thumbs). --sprite N renders N frames per id, the cue SPINNING ABOUT ITS
// OWN LONG AXIS (the honest "show every angle" for a cue: wrap, splice and
// accent details sweep past under the fixed studio framing law) into
// <out>/sprites/<id>.png. --only id1,id2 shards the id set for
// parallel runners; --cdp pins the CDP port (runner port discipline).
// Default (no --sprite) stays the shipped single-still bake byte-exactly.
//
// THE SHIPPED SPRITE IS A STRIP, and this writes it. web/app/atelier.js
// fetches ONE image per id and walks it with a steps() background-position
// animation, so what the tree carries is a single (W*frames)x(H) film — the
// per-frame files this mode used to leave behind were an intermediate that
// something outside the repo had to stitch, which meant the committed media
// had no tool that reproduced it. Frames are composed straight from the raw
// readback, so no PNG decoder is needed and the strip is byte-stable for the
// same reason the stills are. --frames additionally writes the individual
// f<k>.png files under <out>/sprites/<id>/ for inspection.
const SPRITE = Math.max(0, Number(argOf('--sprite', 0)));
const FRAMES_TOO = args.includes('--frames');
const ONLY = argOf('--only', '') ? argOf('--only', '').split(',') : null;
const CDP_PIN = argOf('--cdp', null);
const FRAME = argOf('--frame', 'face');
if (!['face', 'full'].includes(FRAME)) {
  throw new Error(`--frame ${FRAME}: expected face | full (header)`);
}
const FACE = FRAME === 'face';
// --scale S (face register only): the frame at S x the shipped 224x112 (card 32 v3 owner pick S1: --scale 1.5 =
// 336x168 — the tall phone card's 2F x F face upscales the shipped frame 2.38x at 844x390 @3x). The framing law is
// ratio-only, so every scale frames identically.
const SCALE = Number(argOf('--scale', 1));
if (!(SCALE > 0) || (!FACE && SCALE !== 1)) throw new Error(`--scale ${SCALE}: a positive factor, face register only`);
const W = FACE ? Math.round(224 * SCALE) : 640, H = FACE ? Math.round(112 * SCALE) : 128; // 2x of the CSS face (x scale) / the full register
const ENV_LEN = 1.477;               // cuestick.js CUE_LEN (envelope rod)
const MARGIN = 0.035;                // frame-width fraction per side
// face: the visible diagonal run, tip -> bottom edge = the tip-side THIRD of
// the tip-to-joint run (cuestick.js TIP_LEN + FERRULE_LEN + SHAFT_LEN; one
// fixed frame for every id — the identity reads by the frame, never a per-id fit)
const FACE_RUN = (0.012 + 0.021 + 1.02) / 3;
const FACE_ANGLE = Math.PI / 6;      // face: shaft axis vs the face's long edge (30 deg)

// ---- browser-lane courtesy wait ------------------------------------------
// Many lanes share this box's GPU + CDP port space; a bake must not start
// under a running e2e/capture battery. pgrep never reports itself; our own
// invocation chain (this node process + the shell that spawned it) matches
// the 'bake-' pattern, so rows naming this script are excluded.
function foreignLanes() {
  let out = '';
  try {
    out = execFileSync('pgrep', ['-fl', 'e2e-|capture-|bake-'],
      { encoding: 'utf8' });
  } catch { return []; } // exit 1 = no matches
  return out.split('\n').filter(Boolean).map((l) => {
    const sp = l.indexOf(' ');
    return { pid: Number(l.slice(0, sp)), cmd: l.slice(sp + 1) };
  }).filter((r) => r.pid !== process.pid
    && !r.cmd.includes('bake-cue-thumbs'));
}
if (!args.includes('--force')) {
  const budget = Number(process.env.OB_BAKE_LANE_WAIT_MS) || 15 * 60 * 1000;
  const t0 = Date.now();
  for (let lanes = foreignLanes(); lanes.length; lanes = foreignLanes()) {
    if (Date.now() - t0 > budget) {
      throw new Error('another browser lane is still running after '
        + `${budget} ms — refusing to contend for the GPU/ports. Busy:\n`
        + lanes.map((r) => `  ${r.pid} ${r.cmd.slice(0, 120)}`).join('\n')
        + '\n(--force overrides, OB_BAKE_LANE_WAIT_MS tunes the wait)');
    }
    console.log(`waiting for ${lanes.length} browser lane(s) to finish `
      + `(${lanes.map((r) => r.pid).join(', ')})...`);
    await sleep(5000);
  }
}

// ---- picker-visible cue ids ------------------------------------------------
// The SAME law as the atelier cue station / settings ctx.cueSwap.options:
// every catalog cue minus ui_hidden entries minus the superseded_by brand
// aliases (catalog v14 demotion — settings.js uiDemoted; the grandfathered-
// current arm is a live-selection concern, not a bake concern).
let visible = catalogEntries('cue_id')
  .filter((e) => !e.ui_hidden && !e.superseded_by);
if (ONLY) {
  const unknown = ONLY.filter((id) => !visible.some((e) => e.id === id));
  if (unknown.length) {
    throw new Error(`--only names non-picker-visible ids: ${unknown}`);
  }
  visible = visible.filter((e) => ONLY.includes(e.id));
}
console.log(`picker-visible cues: ${visible.length}`
  + ` [${visible.map((e) => e.id).join(', ')}]`);
if (!ONLY && visible.length !== 13) {
  console.warn(`WARNING: expected 13 picker-visible cues, got ${visible.length}`
    + ' — the catalog moved; re-check the carousel contract before committing');
}

// ---- static server: web/ + the virtual bake page (synth-render precedent) --
const PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>cue thumb bake</title>
<script type="importmap">{ "imports": { "three": "/vendor/three.module.min.js" } }</script>
</head><body></body></html>
`;
const MIME = {
  '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html',
  '.json': 'application/json', '.png': 'image/png', '.css': 'text/css',
  '.wasm': 'application/wasm', '.svg': 'image/svg+xml',
};
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/__bake-cue-thumbs.html') {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(PAGE);
    return;
  }
  const p = path.join(WEB, path.normalize(u.pathname).replace(/^\/+/, ''));
  if (!p.startsWith(WEB) || !fs.existsSync(p) || !fs.statSync(p).isFile()) {
    res.writeHead(404); res.end('nope'); return;
  }
  res.writeHead(200,
    { 'content-type': MIME[path.extname(p)] ?? 'application/octet-stream' });
  res.end(fs.readFileSync(p));
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

/** OS-assigned free CDP port (synth-render precedent: a fixed guess can
 * collide with whatever else the box runs). */
async function freePort() {
  const { heldReason } = await import(new URL('../../web/tools/lib/endpoint-pair.mjs', import.meta.url)); // GH-725 review r11 P2 (a): a held endpoint (a supplied pin) is never handed back
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

fs.mkdirSync(OUT, { recursive: true });
let chrome = null;
for (let attempt = 1; !chrome; attempt++) {
  try {
    chrome = await launchChrome(
      `http://127.0.0.1:${PORT}/__bake-cue-thumbs.html`,
      { port: CDP_PIN ? Number(CDP_PIN) : await freePort(),
        width: 800, height: 300 });
  } catch (e) {
    if (attempt >= 4) { server.close(); throw e; }
    console.error(`chrome launch attempt ${attempt} failed (${e.message}), retrying...`);
    await sleep(3000);
  }
}
const pageErrors = [];
chrome.onEvent((method, params) => {
  if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
    pageErrors.push(params.args.map((a) => a.value ?? a.description).join(' '));
  } else if (method === 'Runtime.exceptionThrown') {
    pageErrors.push(params.exceptionDetails.exception?.description
      ?? params.exceptionDetails.text);
  }
});

/** Flip readPixels rows (GL origin is bottom-left), unpremultiply the AA
 * coverage (MSAA resolve over the transparent clear leaves edge texels
 * premultiplied — dividing by alpha recovers the true edge color, clean
 * alpha edges) and encode deterministically. */
function toPng(raw) {
  const out = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    out.set(raw.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
  }
  for (let i = 0; i < out.length; i += 4) {
    const a = out[i + 3];
    if (a === 0) { out[i] = out[i + 1] = out[i + 2] = 0; continue; }
    if (a < 255) {
      out[i] = Math.min(255, Math.round((out[i] * 255) / a));
      out[i + 1] = Math.min(255, Math.round((out[i + 1] * 255) / a));
      out[i + 2] = Math.min(255, Math.round((out[i + 2] * 255) / a));
    }
  }
  return { png: encodePng(W, H, out), px: out };
}

/** Ink stats for the bake log: non-transparent bbox (framing/margin
 * verification), brightest channel + near-blown count (the S2.5 taste note
 * about hot/glowy shafts — satin lighting must keep highlights off 255). */
function stats(px) {
  let x0 = W, x1 = -1, y0 = H, y1 = -1, max = 0, hot = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (px[i + 3] === 0) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
      const m = Math.max(px[i], px[i + 1], px[i + 2]);
      if (m > max) max = m;
      if (m >= 250) hot++;
    }
  }
  return { x0, x1, y0, y1, max, hot };
}

try {
  // wait until the RENDER PAGE's own context is live (about:blank also
  // reports readyState 'complete' — the synth-render idiom)
  let up = false;
  for (let i = 0; i < 100 && !up; i++) {
    up = await chrome
      .eval("location.pathname + ':' + document.readyState")
      .catch(() => '') === '/__bake-cue-thumbs.html:complete';
    if (!up) await sleep(150);
  }
  if (!up) throw new Error('bake page never became ready');

  // ---- one fixed studio for every id (deterministic: no time, no random) --
  await chrome.eval(`(async () => {
    const THREE = await import('three');
    const cueMod = await import('/scene/cuestick.js');
    // GH-525 round-4 float-latency law: registry maps bake PROGRESSIVELY
    // (128 px preview now, banded full-res later). The committed thumb
    // must capture the FULL-RES map — wait for the look registry's pending
    // bakes to settle before every render. Feature-detected (rule 5): a
    // stale cuelooks.js without the seam reports nothing pending.
    const looksMod = await import('/scene/cuelooks.js').catch(() => null);
    const mapsSettled = async () => {
      for (let i = 0; i < 200; i++) {
        if (!(looksMod?.pendingMapBakes?.() > 0)) return;
        await new Promise((r) => setTimeout(r, 50));
      }
    };
    const W = ${W}, H = ${H};
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    // premultipliedAlpha:false so readPixels hands back straight-alpha
    // texels (the node side still unpremultiplies the MSAA coverage)
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true,
      alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: true,
      powerPreference: 'high-performance' });
    renderer.setPixelRatio(1);
    renderer.setSize(W, H, false);
    renderer.setClearColor(0x000000, 0); // transparent studio
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05; // satin — highlights roll off
    // FRAMING REGISTERS (header). full: ortho frame sized to the 1.477
    // envelope cue. face: the frame height carries the tip margin plus the
    // 30 deg diagonal's drop over the visible run (viewH - my = RUN * sin30),
    // so the shaft leaves through the bottom edge exactly RUN from the tip.
    const FACE = ${FACE}, ENV_LEN = ${ENV_LEN}, MARGIN = ${MARGIN};
    const FACE_RUN = ${FACE_RUN}, FACE_ANGLE = ${FACE_ANGLE};
    const viewH0 = FACE_RUN * Math.sin(FACE_ANGLE) / (1 - MARGIN * W / H);
    const viewW = FACE ? viewH0 * W / H : ENV_LEN / (1 - 2 * MARGIN);
    const viewH = viewW * H / W;
    const tipAnchor = FACE
      ? new THREE.Vector3(viewW / 2 - viewW * MARGIN, viewH / 2 - viewW * MARGIN, 0)
      : new THREE.Vector3(-viewW / 2 + viewW * MARGIN, 0, 0);
    // face: butt direction = 180 + 30 deg (down-left) AFTER the full
    // register's lay-flat (butt toward +x) — composed as quaternions so the
    // long-axis spin still applies FIRST (sprite mode)
    const qLay = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -Math.PI / 2, 0));
    const qDiag = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI + FACE_ANGLE));
    const camera = new THREE.OrthographicCamera(
      -viewW / 2, viewW / 2, viewH / 2, -viewH / 2, 0.1, 10);
    camera.position.set(0, 0, 2);
    camera.lookAt(0, 0, 0);
    const scene = new THREE.Scene();
    scene.background = null;
    // neutral studio: soft warm key (upper front-left), cool low rim from
    // behind, hemisphere fill — no environment map (nothing to reflect in
    // an empty studio; keeps the bake dependency-free and stable)
    const key = new THREE.DirectionalLight(0xfff1e0, 1.9);
    key.position.set(-0.5, 1.4, 1.8);
    const rim = new THREE.DirectionalLight(0xcfe0ff, 0.65);
    rim.position.set(0.4, -1.0, -1.4);
    const fill = new THREE.HemisphereLight(0xbfc8d4, 0x35302a, 1.1);
    scene.add(key, rim, fill);
    window.__bake = {
      async render(cueId, spinRad = 0) {
        const cue = cueMod.buildCue({ cueId });
        await mapsSettled(); // full-res maps only (determinism law)
        const g = cue.group;
        // buildCue: tip face at local z = 0, cue extends toward −z;
        // rotate so the butt runs toward world +x and anchor the TIP at
        // the left margin (every id shares the anchor — length reads).
        // spinRad (sprite mode): pre-spin about the cue's own long axis
        // (local z applies FIRST under the default XYZ Euler order) — the
        // circumferential details sweep past under the fixed framing.
        if (FACE) {
          g.quaternion.setFromEuler(new THREE.Euler(0, 0, spinRad))
            .premultiply(qLay).premultiply(qDiag);
        } else {
          g.rotation.z = spinRad;
          g.rotation.y = -Math.PI / 2;
        }
        g.position.copy(tipAnchor);
        scene.add(g);
        renderer.render(scene, camera);
        const box = new THREE.Box3().setFromObject(g);
        const lenM = box.max.x - box.min.x;
        const gl = renderer.getContext();
        const px = new Uint8Array(W * H * 4);
        gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
        scene.remove(g);
        g.traverse((o) => {
          if (!o.isMesh) return;
          o.geometry.dispose();
          // cache-owned registry maps are shared across builds — never
          // disposed by consumers (cuelooks.js header law)
          if (o.material.map?.obCueLookCached !== true) {
            o.material.map?.dispose?.();
          }
          o.material.dispose();
        });
        let bin = '';
        for (let i = 0; i < px.length; i += 0x8000) {
          bin += String.fromCharCode.apply(null, px.subarray(i, i + 0x8000));
        }
        return { b64: btoa(bin), lenM };
      },
    };
    return 'ready';
  })()`);

  for (const e of visible) {
    const frames = SPRITE > 0 ? SPRITE : 1;
    const strip = SPRITE > 0
      ? new Uint8Array(W * frames * H * 4) : null;
    for (let k = 0; k < frames; k++) {
      const spin = SPRITE > 0 ? (k * 2 * Math.PI) / frames : 0;
      const r = await chrome.eval(
        `__bake.render(${JSON.stringify(e.id)}, ${spin})`);
      const raw = new Uint8Array(Buffer.from(r.b64, 'base64'));
      if (raw.length !== W * H * 4) {
        throw new Error(`${e.id}: readback ${raw.length} B != ${W}x${H}x4`);
      }
      const { png, px } = toPng(raw);
      const s = stats(px);
      if (SPRITE > 0) {
        // lay this frame into column band k of the strip
        for (let y = 0; y < H; y++) {
          const src = px.subarray(y * W * 4, (y + 1) * W * 4);
          strip.set(src, (y * W * frames + k * W) * 4);
        }
        // the card's REST face (cuethumbs.js cueThumbSrc -> <out>/<id>.png)
        // is frame 0 of the same bake: one pose family for the still and
        // the overlay by construction (the still IS frame 0, not a twin)
        if (k === 0) fs.writeFileSync(path.join(OUT, `${e.id}.png`), png);
        if (FRAMES_TOO) {
          const dir = path.join(OUT, 'sprites', e.id);
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(path.join(dir, `f${String(k).padStart(2, '0')}.png`), png);
        }
      } else {
        fs.writeFileSync(path.join(OUT, `${e.id}.png`), png);
      }
      const tag = SPRITE > 0 ? `${e.id}/f${String(k).padStart(2, '0')}` : e.id;
      // face coverage = the alpha-bbox area fraction the S5-F arm judges (>= 0.60)
      const cover = ((s.x1 - s.x0 + 1) * (s.y1 - s.y0 + 1)) / (W * H);
      console.log(`${tag.padEnd(22)} ${r.lenM.toFixed(4)} m  ink x[${s.x0}..${s.x1}]`
        + ` y[${s.y0}..${s.y1}]  cover ${cover.toFixed(3)}  max ${s.max}`
        + ` (>=250: ${s.hot}px)  ${(png.length / 1024).toFixed(1)} KB`);
      if (FACE && cover < 0.6) {
        console.warn(`  WARN: ${tag} face coverage ${cover.toFixed(3)} < 0.60 (S5-F)`);
      }
      if (!FACE && s.x0 !== Math.round(W * MARGIN) && e === visible[0] && k === 0) {
        console.warn(`  note: tip anchor at x=${s.x0}, expected ~${Math.round(W * MARGIN)}`);
      }
    }
    if (SPRITE > 0) {
      fs.mkdirSync(path.join(OUT, 'sprites'), { recursive: true });
      const png = encodePng(W * frames, H, strip);
      fs.writeFileSync(path.join(OUT, 'sprites', `${e.id}.png`), png);
      console.log(`${`${e.id} STRIP`.padEnd(22)} ${W * frames}x${H} `
        + `(${frames} frames)  ${(png.length / 1024).toFixed(1)} KB`);
    }
  }
  if (pageErrors.length) {
    console.error('PAGE ERRORS:', pageErrors.join(' | '));
    process.exitCode = 1;
  } else {
    console.log(`BAKE DONE — ${visible.length} id(s)`
      + `${SPRITE > 0 ? ` x${SPRITE} sprite frames` : ''} → ${OUT}`);
  }
} catch (e) {
  console.error('BAKE FAIL', e.stack ?? e);
  process.exitCode = 1;
} finally {
  chrome.close();
  server.close();
}
