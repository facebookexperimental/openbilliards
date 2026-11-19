// Copyright (c) Meta Platforms, Inc. and affiliates.

// orbit-488d.mjs — GH-488D wave A2 ORBIT CLIP renderer.
//
// The register captures (capture-488d-registers.mjs) freeze eight bearings.
// Between-bearing defects — a seam that only opens at one azimuth, a
// specular line that swims, a silhouette that breaks where two surfaces
// meet — are invisible to them by construction. SPIKE-TASK-A2 acceptance
// item 5 therefore asks for a short DETERMINISTIC orbit around the corner
// pocket and the side (middle) pocket, to be watched, not judged.
//
// This file is deliberately NOT a bar suite: no judges, no thresholds, no
// exit-3. It renders frames and encodes them, and the account of what the
// clip shows is written by hand into SPIKE-REPORT.md. (The A3 lane owns the
// judged sweep; orbitsweep-489/490.mjs are that instrument and are not
// forked here.)
//
// Everything that decides an image is shared with the register capture:
// same boot URL (cinema=1, seed=7, look=default), same rig assertion
// (canopy_panel / pool bake, or the run fails), same UI/ball hiding, same
// 1600x1000 surface, same __test.cameraPose contract. The only new thing
// is the bearing loop.
//
// ENCODE: the shipped chain, verbatim from the encode.sh law as reused by
// orbitsweep-489.mjs:1158 — libx264, preset medium, crf 14, yuv420p,
// +faststart, 30 fps. The clip that gets watched is therefore the same
// class of bytes the project ships, not a lossless proxy that would hide
// banding on the near-black cabinet.
//
// Usage:
//   node tools/render/orbit-488d.mjs [--orbits corner,side] [--frames 120]
//     [--out DIR] [--width N --height N] [--no-encode]
// Exit 0 on a complete render; non-zero on boot/settle/pose failure.
// Ports: OB_E2E_PORT/OB_E2E_CDP_PORT pin, else claims the 488d lane band
// 9900-9929 (shared with capture-488d-registers.mjs; the two never run at
// the same time in this lane).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

// SHARED_DEFAULT_WINDOW (render-488d-registers) — the 488d register window 9900-9929 (claimPortBand): the register capture,
// orbit-488d and orbitsweep-488d run the SAME eight bearings one at a time in
// this lane, never side by side (headers here have said so in prose since the
// 488d spike; this is the machine-checked form).
export const SHARED_DEFAULT_WINDOW = 'render-488d-registers';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const webDir = path.join(REPO, 'web');
const cdp = await import(path.join(webDir, 'tools', 'cdp.mjs'));
const {
  launchChrome, sleep, spawnStaticServer, stopStaticServer, claimPortBand,
} = cdp;

const argv = process.argv.slice(2);
const argOf = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const { pathOpt: __pathOpt, stringOpt: __stringOpt } = await import('./lib/argv.mjs'); // FIX2 (review round 2 on #731): option presence is not option value

const TAG = argOf('--tag', 'orbit');
const OUT = path.resolve(__pathOpt('--out', { default: `/tmp/ob-488d-orbit/${TAG}`, tag: 'orbit-488d' }));
const FRAMES = Number(__stringOpt('--frames', { default: 120, tag: 'orbit-488d' }));
const W = Number(argOf('--width', 1600));
const H = Number(argOf('--height', 1000));
const NO_ENCODE = argv.includes('--no-encode');
const TABLE = 'diamond_proam_9ft';
const LOOK = 'default';

// Rig assertion, identical to capture-488d-registers.mjs:73 — a clip shot
// under a drifted rig is not comparable with the look-lines it illustrates.
const RIG_EXPECT = {
  fixture: process.env.OB_488D_FIXTURE || 'canopy_panel',
  bakeClass: process.env.OB_488D_BAKECLASS || 'pool',
};

// ---------------------------------------------------------------------------
// Orbit geometry. cameraPose speaks KERNEL coords [kx, ky, kz]: kx across the
// width, ky along the length (+ = foot end), kz up from the bed plane.
// diamond_proam_9ft: L 2.54, W 1.27, CW 0.0508
//   -> corner mouth centre (+-0.6858, +-1.3208), side mouth centre (+-0.6858, 0)
const HALF_W_OUT = 1.27 / 2 + 0.0508;   // 0.6858
const HALF_L_OUT = 2.54 / 2 + 0.0508;   // 1.3208

// Full 360 deg is legal at these radii: the far half of each sweep passes
// OVER the bed (kz stays 0.30+ above it), so no bearing ever puts the camera
// inside the slate or under the cabinet. The subject stays centred because
// `look` is pinned at the mouth, not derived from the camera.
const ORBITS = {
  // foot-right corner pocket (CP-*): casting shoulder, collar crest, jaw
  // junctions, the boot flange and the rail miter all rotate through frame.
  corner: {
    centre: [HALF_W_OUT, HALF_L_OUT, 0.010],
    r: 0.56, h: 0.36, fov: 34, phase: 180,
  },
  // right side / middle pocket (SP-*): the C-channel liner, the two side
  // jaws and the shallower SP boot. Smaller radius — the side mouth is a
  // narrower subject than the corner assembly.
  side: {
    centre: [HALF_W_OUT, 0.0, 0.010],
    r: 0.50, h: 0.32, fov: 34, phase: 180,
  },
};
const WANT = String(argOf('--orbits', Object.keys(ORBITS).join(',')))
  .split(',').map((s) => s.trim()).filter(Boolean);

// Bearing 0 is +kx (outside the long rail); the sweep runs counter-clockwise
// in the (kx, ky) plane. `phase` starts each clip on the outside bearing, so
// frame 0 is the register-like view and the orbit departs from it.
function poseAt(o, i, n) {
  const th = ((o.phase + (360 * i) / n) * Math.PI) / 180;
  return {
    cam: [
      o.centre[0] + o.r * Math.cos(th),
      o.centre[1] + o.r * Math.sin(th),
      o.centre[2] + o.h,
    ],
    look: o.centre,
    fov: o.fov,
  };
}

// ---------------------------------------------------------------------------
// Boot-state scripts, byte-identical in intent to the register capture: the
// table is the subject, the aim overlay and the balls are not.
const HIDE_UI = `(() => {
  __test.aim(Math.PI * 1.5);
  window.__dbg.scene.traverse((o) => {
    const hex = o.material && o.material.color
      && o.material.color.getHexString && o.material.color.getHexString();
    if (hex === 'dff1ff' || hex === '76afee') o.visible = false;
    if (/^obAim/.test(o.name || '')
      || (o.parent && /^obAim/.test(o.parent.name || ''))) {
      if (o.layers) o.layers.disableAll();
      if (o.material) o.material.visible = false;
    }
  });
  const st = document.createElement('style');
  st.textContent = 'body > :not(canvas) { display: none !important; }';
  document.head.appendChild(st);
  return true;
})()`;

const HIDE_BALLS = `(() => {
  const zero = (o) => { o.scale.setScalar(0); o.updateMatrixWorld(true); };
  const groups = new Set();
  window.__dbg.scene.traverse((o) => {
    if (o.name === 'obCueStick') zero(o);
    if (o.isMesh && o.geometry && o.geometry.type === 'SphereGeometry'
      && Math.abs(o.position.y) < 0.2 && Math.abs(o.position.x) < 1.6
      && Math.abs(o.position.z) < 0.95) {
      if (o.parent && o.parent !== window.__dbg.scene) groups.add(o.parent);
      else zero(o);
    }
  });
  for (const g of groups) for (const c of g.children) zero(c);
  const gu = window.__gi && window.__gi.uniforms;
  if (gu && gu.uSphereCount) gu.uSphereCount.value = 0;
  return true;
})()`;

const waitFrame = (chrome) => chrome.eval(
  'new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))');

async function shot(chrome, file) {
  const { data } = await chrome.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(file, Buffer.from(data, 'base64'));
}

// Shipped encode chain (encode.sh law; orbitsweep-489.mjs:1158 verbatim).
// A missing ffmpeg fails LOUD — silently shipping a frame directory as "the
// clip" would move the review off the plane the owner actually watches.
function encode(dir, mp4) {
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30',
    '-i', path.join(dir, 'f%04d.png'),
    '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '14',
    '-movflags', '+faststart', mp4]);
  // decode the SHIPPED bytes back, so what gets looked at is post-encode
  const dec = path.join(dir, 'dec');
  fs.rmSync(dec, { recursive: true, force: true });
  fs.mkdirSync(dec, { recursive: true });
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', mp4,
    '-start_number', '0', path.join(dec, 'd%04d.png')]);
  return dec;
}

async function main() {
  let PORT = process.env.OB_E2E_PORT ? Number(process.env.OB_E2E_PORT) : null;
  let CDPP = process.env.OB_E2E_CDP_PORT ? Number(process.env.OB_E2E_CDP_PORT) : null;
  let band = null;
  if (!PORT || !CDPP) {
    band = await claimPortBand(9900, 9929);
    PORT = band.http(0); CDPP = band.cdp(0);
  }
  fs.mkdirSync(OUT, { recursive: true });
  const server = spawnStaticServer(webDir, PORT);
  await sleep(800);
  let chrome = null;
  const manifest = {
    tag: TAG, table: TABLE, look: LOOK, width: W, height: H,
    frames: FRAMES, fps: 30, rig: null, orbits: {},
  };
  try {
    const url = `http://127.0.0.1:${PORT}/app.html?table=${TABLE}`
      + `&cinema=1&seed=7&look=${LOOK}`;
    chrome = await launchChrome(url, { port: CDPP, width: W, height: H });
    await chrome.send('Emulation.setDeviceMetricsOverride',
      { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    let ready = false;
    for (let i = 0; i < 240 && !ready; i++) {
      await sleep(200);
      ready = await chrome.eval('window.__test?.ready === true').catch(() => false);
    }
    if (!ready) throw new Error('app never became ready');

    // GI settle: __gi.state is a PROPERTY, not a call (register-capture note)
    let rig = null;
    for (let i = 0; i < 200; i++) {
      const st = await chrome.eval(`(() => {
        const s = window.__gi && window.__gi.state;
        return JSON.stringify({
          giReady: s ? !!s.ready : null, baked: s ? !!s.baked : null,
          fixture: s ? s.fixture : null, bakeClass: s ? s.bakeClass : null,
          exposure: window.__dbg && window.__dbg.renderer
            && window.__dbg.renderer.toneMappingExposure,
          toneMapping: window.__dbg && window.__dbg.renderer
            && window.__dbg.renderer.toneMapping,
        });
      })()`).catch(() => null);
      if (st) {
        rig = JSON.parse(st);
        if (rig.giReady && rig.baked) break;
      }
      await sleep(200);
    }
    manifest.rig = rig;
    if (!rig || !rig.giReady || !rig.baked) {
      throw new Error(`GI never settled: ${JSON.stringify(rig)}`);
    }
    if (RIG_EXPECT.fixture && rig.fixture !== RIG_EXPECT.fixture) {
      throw new Error(`rig drift: fixture ${rig.fixture} != ${RIG_EXPECT.fixture}`);
    }
    if (RIG_EXPECT.bakeClass && rig.bakeClass !== RIG_EXPECT.bakeClass) {
      throw new Error(`rig drift: bakeClass ${rig.bakeClass} != ${RIG_EXPECT.bakeClass}`);
    }
    console.log('[rig]', JSON.stringify(rig));

    await sleep(1200);
    await chrome.eval(HIDE_UI);
    await chrome.eval(HIDE_BALLS);
    await sleep(300);

    for (const name of WANT) {
      const o = ORBITS[name];
      if (!o) throw new Error(`unknown orbit ${name}`);
      const dir = path.join(OUT, name);
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(dir, { recursive: true });
      for (let i = 0; i < FRAMES; i++) {
        const pose = poseAt(o, i, FRAMES);
        let ok = false;
        for (let k = 0; k < 30 && !ok; k++) {
          ok = await chrome.eval(`__test.cameraPose(${JSON.stringify(pose)})`);
          if (!ok) await sleep(100);
        }
        if (!ok) throw new Error(`${name} frame ${i}: cameraPose rejected`);
        await waitFrame(chrome);
        await shot(chrome, path.join(dir, `f${String(i).padStart(4, '0')}.png`));
      }
      const mp4 = path.join(OUT, `${TAG}-${name}.mp4`);
      let dec = null;
      if (!NO_ENCODE) dec = encode(dir, mp4);
      manifest.orbits[name] = {
        geometry: o, frames: FRAMES, dir, mp4: NO_ENCODE ? null : mp4,
        decoded: dec,
        mp4sha256: NO_ENCODE ? null
          : createHash('sha256').update(fs.readFileSync(mp4)).digest('hex'),
      };
      console.log(`[orbit] ${name}: ${FRAMES} frames`
        + (NO_ENCODE ? '' : ` -> ${mp4}`));
    }
    fs.writeFileSync(path.join(OUT, 'manifest.json'),
      JSON.stringify(manifest, null, 2));
    console.log(`ORBIT-488D DONE -> ${OUT}`);
  } finally {
    if (chrome) {
      const gone = await chrome.closeAndWait();
      if (gone === false) console.error('WARN: chrome teardown unconfirmed');
    }
    await stopStaticServer(server);
    if (band && band.release) await band.release();
  }
}

await main();
