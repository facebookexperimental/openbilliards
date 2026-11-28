// Copyright (c) Meta Platforms, Inc. and affiliates.

// capture-488p-pose.mjs — Predator Apex 9 ft (GH-488P / wave P-A2) look-loop
// register capture on the LIVE app. Fork of web/tools/capture-490-pose.mjs
// (490 lane) retargeted at `predator_apex_9ft`; zero shared bytes with the
// Diamond/JOY lanes per Drive pocket-drawing-488p/FORKS.md.
//
//   node tools/render/capture-488p-pose.mjs <registers.json> [--balls]
//
// registers.json: [{ name, cam:[kx,ky,h], look:[kx,ky,h], fov }, ...]
// Coordinates are KERNEL frame ([kx, ky, h]; three.x = k.y, three.y = h,
// three.z = k.x — camerascript.js convention). For this table k.x is the
// WIDTH axis (half 0.635 + rails) and k.y the LENGTH axis (half 1.27 + rails),
// matching the canonical datum TCS-PDT-01 (+X across the width, +Y along the
// length) up to the render frame's y/z swap.
//
// FROZEN LIGHT RIG (SKILL Stage 5 step 2 — recorded in SPIKE-REPORT.md):
//   app.html?table=predator_apex_9ft&cinema=1&seed=7&look=default
//   GI bake class 'pool' (footprint 2.54x1.27), venue fixture 'pdt_studio'
// The capture REFUSES to shoot until that rig has settled — an unsettled GI
// frame is invalid look-loop evidence.
//
// WAVE M moved the asserted fixture canopy_panel -> pdt_studio. Through A2
// the Predator borrowed the generic pool canopy because its 2.54x1.27
// footprint routes there, and lightingvisuals.js was INERT for it (the #89
// identity short-circuit: untouched + canopy_panel + brightness 1 returns
// before applyFixture, so room.js's build literals governed). The table now
// has its OWN derived rig, routed by table id; asserting the old fixture
// here would refuse every frame shot under it. Every A2-era register in
// SPIKE-REPORT is therefore a PRE-RIG measurement and is re-baselined in sM
// rather than compared across the change.
//
// OB_488P_LOOK overrides the look for ONE purpose: separating a rig-borne
// appearance from an albedo-borne one. `default` is a WARM venue key
// (0xfff1da) and `sp` is the neutral-key base (0xf6f7f9), so shooting the
// same bytes under both answers "is this brown surface brown because of its
// albedo?" by measurement instead of by extrapolating a tone curve. The
// DEFAULT stays `default` — that is what a player sees, and a diagnostic
// look must never become the look the gates are judged under.
//
// OB_488P_POKE is a light-BUDGET probe: a JS expression evaluated in the page
// AFTER the rig has settled and before the first shot. It exists because the
// settle gate above (`bakeClass === 'pool' && baked`) correctly REFUSES the
// `?nogi` boot — you cannot ablate GI from the URL without also failing the
// assertion that makes the frame admissible. Poking the live uniform instead
// keeps the settle proof intact and ablates exactly one term:
//   OB_488P_POKE='window.__gi.uniforms.uGiIrr.value = 0'   # bounce off
// Unset (the normal path) evaluates nothing, so a gate run is byte-identical
// to the pre-poke harness. A poked frame is DIAGNOSTIC ONLY — it must never
// be filed as look-loop or gate evidence, for the same reason as OB_488P_LOOK.
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import {
  launchChrome, sleep, spawnStaticServer, stopStaticServer, claimPortBand,
} from '../../web/tools/cdp.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(here, '../../web');
const specArg = process.argv[2];
if (!specArg) throw new Error('usage: capture-488p-pose.mjs <registers.json>');
const POSES = specArg.trim().startsWith('[')
  ? JSON.parse(specArg) : JSON.parse(readFileSync(specArg, 'utf8'));
const KEEP_BALLS = process.argv.includes('--balls');
const OUT = process.env.OB_488P_OUT ?? '/tmp/ob488p/reg';
const W = Number(process.env.OB_488P_W ?? 1600);
const H = Number(process.env.OB_488P_H ?? 1000);
mkdirSync(OUT, { recursive: true });

// own band, disjoint from the 489/490 windows (16700-16729 / 16730-16759) — the owner uses
// this Mac's browser and it is the self-hosted CI runner: never pattern-kill
const band = await claimPortBand(23490, 23519);
const PORT = band.http(0); const CDPP = band.cdp(0);
const server = spawnStaticServer(webDir, PORT);
await sleep(700);
const LOOK = process.env.OB_488P_LOOK ?? 'default';
const chrome = await launchChrome(
  `http://127.0.0.1:${PORT}/app.html?table=predator_apex_9ft&cinema=1&seed=7&look=${LOOK}`,
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
  let settled = false;
  for (let i = 0; i < 150 && !settled; i++) {
    settled = await chrome.eval(`(() => {
      const s = window.__gi && window.__gi.state;
      const rig = window.__lighting && window.__lighting.state
        && window.__lighting.state().fixture;
      return !!(s && s.ready && s.baked && s.bakeClass === 'pool'
        && s.fixture === 'pdt_studio' && rig === 'pdt_studio');
      // fixture is the FIXTURE (geometry+ratio), which the look layer scales
      // rather than replaces, so this assertion holds for both look bases.
    })()`).catch(() => false);
    if (!settled) await sleep(200);
  }
  if (!settled) {
    const why = await chrome.eval(`JSON.stringify({
      gi: window.__gi && window.__gi.state,
      rig: window.__lighting && window.__lighting.state
        && window.__lighting.state().fixture,
    })`).catch(() => '(unreadable)');
    throw new Error(`GI/rig never settled on the frozen rig: ${why}`);
  }
  await sleep(1200);
  if (process.env.OB_488P_POKE) {
    const poked = await chrome.eval(
      `(() => { ${process.env.OB_488P_POKE}; return true; })()`);
    if (poked !== true) throw new Error('OB_488P_POKE did not evaluate');
    console.log(`POKED (diagnostic frame): ${process.env.OB_488P_POKE}`);
  }
  await chrome.eval(`(() => {
    __test.aim(Math.PI * 1.5);
    window.__dbg.scene.traverse((o) => {
      const hex = o.material && o.material.color
        && o.material.color.getHexString && o.material.color.getHexString();
      if (hex === 'dff1ff' || hex === '76afee') o.visible = false;
      if (/^obAim/.test(o.name || '')
        || (o.parent && /^obAim/.test(o.parent.name || ''))) o.visible = false;
    });
    const st = document.createElement('style');
    st.textContent = 'body > :not(canvas) { display: none !important; }';
    document.head.appendChild(st);
    return true;
  })()`);
  if (!KEEP_BALLS) {
    await chrome.eval(`(() => {
      const zero = (o) => { o.scale.setScalar(0); o.updateMatrixWorld(true); };
      const ballGroups = new Set();
      window.__dbg.scene.traverse((o) => {
        if (o.name === 'obCueStick') zero(o);
        if (o.isMesh && o.geometry && o.geometry.type === 'SphereGeometry'
          && Math.abs(o.position.y) < 0.2 && Math.abs(o.position.x) < 1.6
          && Math.abs(o.position.z) < 0.95) {
          if (o.parent && o.parent !== window.__dbg.scene) ballGroups.add(o.parent);
          else zero(o);
        }
      });
      for (const g of ballGroups) for (const c of g.children) zero(c);
      const gu = window.__gi && window.__gi.uniforms;
      if (gu && gu.uSphereCount) gu.uSphereCount.value = 0;
      return true;
    })()`);
  }
  for (const p of POSES) {
    let ok = false;
    for (let i = 0; i < 25 && !ok; i++) {
      ok = await chrome.eval(`__test.cameraPose(${JSON.stringify(
        { cam: p.cam, look: p.look, fov: p.fov })})`);
      if (!ok) await sleep(200);
    }
    if (!ok) throw new Error(`${p.name}: pose rejected`);
    await sleep(450);
    await chrome.screenshot(path.join(OUT, `${p.name}.png`));
    console.log(`captured ${p.name}`);
  }
} finally {
  const gone = await chrome.closeAndWait();
  if (gone === false) throw new Error('chrome teardown unconfirmed');
  await stopStaticServer(server);
  band.release();
}
