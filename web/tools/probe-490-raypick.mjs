// Copyright (c) Meta Platforms, Inc. and affiliates.

// probe-490-raypick.mjs — 490 BLOCKER-CURE lane forensics: raycast named
// screen pixels at given orbit poses and report the mesh names/materials
// under them (defect attribution — which mesh draws the comb strip, the
// green skirt pinstripe, the chrome interior blob). Read-only instrument;
// session laws mirror orbitsweep-490.mjs (cinema boot, joy_lowrect settle).
//   node web/tools/probe-490-raypick.mjs '<json spec>'
// spec: [{ pose: {cam,look,fov}, px: [[x,y,label], ...] }, ...] on the
// sweep's 1600x1000 frame.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome, sleep, spawnStaticServer, stopStaticServer, claimPortBand } from './cdp.mjs';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SPEC = JSON.parse(process.argv[2]);
const W = 1600, H = 1000;

const band = await claimPortBand(26240, 26269);
const PORT = band.http(0); const CDPP = band.cdp(0);
const server = spawnStaticServer(webDir, PORT);
await sleep(700);
const chrome = await launchChrome(
  `http://127.0.0.1:${PORT}/app.html?table=chinese8_pro_9ft&cinema=1&seed=7&look=default`,
  { port: CDPP, width: W, height: H });
try {
  await chrome.send('Emulation.setDeviceMetricsOverride',
    { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  let ready = false;
  for (let i = 0; i < 220 && !ready; i++) {
    await sleep(200);
    ready = await chrome.eval('window.__test?.ready === true').catch(() => false);
  }
  if (!ready) throw new Error('app never ready');
  // review blocker-cure r1 P2: a capture on an unsettled GI/photo-tex
  // state is invalid evidence — refuse, never proceed silently
  let settled = false;
  for (let i = 0; i < 150 && !settled; i++) {
    settled = await chrome.eval(`(() => {
      const s = window.__gi && window.__gi.state;
      const rig = window.__lighting && window.__lighting.state
        && window.__lighting.state().fixture;
      return !!(s && s.ready && s.baked && s.bakeClass === 'chinese8_9ft'
        && s.fixture === 'joy_lowrect' && rig === 'joy_lowrect'
        && window.__cn8ringtex === 'photo');
    })()`).catch(() => false);
    if (!settled) await sleep(200);
  }
  if (!settled) throw new Error('GI/rig/photo-tex never settled');
  await sleep(1200);
  // sweep session law: aim away + hide the aim/preview overlays so the
  // rays report the FURNITURE under the pixel, not the HUD lines
  await chrome.eval(`(() => {
    __test.aim(Math.PI * 1.5);
    window.__dbg.scene.traverse((o) => {
      const hex = o.material && o.material.color
        && o.material.color.getHexString && o.material.color.getHexString();
      if (hex === 'dff1ff' || hex === '76afee') o.visible = false;
      if (/^obAim/.test(o.name || '')
        || (o.parent && /^obAim/.test(o.parent.name || ''))) o.visible = false;
    });
    return true;
  })()`);
  for (const site of SPEC) {
    let ok = false;
    for (let i = 0; i < 25 && !ok; i++) {
      ok = await chrome.eval(`__test.cameraPose(${JSON.stringify(site.pose)})`);
      if (!ok) await sleep(200);
    }
    if (!ok) throw new Error('pose rejected');
    await sleep(400);
    const out = await chrome.eval(`(async () => {
      const T = await import('three');
      const cam = window.__dbg.camera;
      cam.updateMatrixWorld(true);
      const rc = new T.Raycaster();
      const res = [];
      for (const [px, py, label] of ${JSON.stringify(site.px)}) {
        rc.setFromCamera(new T.Vector2((px / ${W}) * 2 - 1,
          -(py / ${H}) * 2 + 1), cam);
        const visUp = (o) => { for (let q = o; q; q = q.parent) {
          if (q.visible === false) return false; } return true; };
        const hits = rc.intersectObjects(window.__dbg.scene.children, true)
          .filter((h) => h.object.isMesh && visUp(h.object))
          .slice(0, 4)
          .map((h) => ({
            name: h.object.name || '(unnamed)',
            parent: h.object.parent?.name || '',
            mat: h.object.material?.type,
            hex: h.object.material?.color?.getHexString?.(),
            d: Math.round(h.distance * 1000) / 1000,
            p: [h.point.x, h.point.y, h.point.z].map((v) => Math.round(v * 1000) / 1000),
          }));
        res.push({ label, px, py, hits });
      }
      return JSON.stringify(res, null, 1);
    })()`);
    console.log(`== pose ${JSON.stringify(site.pose.cam)}`);
    console.log(out);
  }
} finally {
  const gone = await chrome.closeAndWait();
  if (gone === false) throw new Error('chrome teardown unconfirmed');
  await stopStaticServer(server);
  band.release();
}
