// Copyright (c) Meta Platforms, Inc. and affiliates.

// stage-490-pocketing.mjs — GH-490 BLOCKER-CURE B1 verification stager.
// Re-stages the finale pocketing sequence per the recorded staging law
// (proofs/capture-logs/staging-490-pocket.json: REAL gameplay —
// __test.layout + __test.shoot on the live kernel, 1-ball down the
// corner mouth centreline, draw so the cue stays; deterministic 30 fps
// read via __test.pause + __test.seek) and dumps the frames for the
// frame-by-frame review: the ball must visibly LAND IN THE NET and the
// net must receive/deform/settle (the B1 acceptance).
//   node web/tools/stage-490-pocketing.mjs   (OB_490_OUT overrides)
// NOT the finale renderer — the evidence lane re-renders the videos
// after both tables cure; this stager exists so the cure lane views the
// sequence itself first (LOOK LOOP law).
import path from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { launchChrome, sleep, spawnStaticServer, stopStaticServer, claimPortBand } from './cdp.mjs';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.env.OB_490_OUT ?? '/tmp/ob490cure/pocketing';
const W = 1600, H = 1000;
const FPS = 30;
mkdirSync(OUT, { recursive: true });

// own disjoint band (GH-338): the orbit-sweep gate holds 16730-16759
const band = await claimPortBand(22090, 22119);
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
  // staging law: cue + 1-ball ON the corner mouth centreline; draw
  // (b −0.3) keeps the cue out of the pocket (staging-490-pocket.json)
  const CX = 0.678; const CY = 1.318; const D = Math.SQRT1_2;
  await chrome.eval(`__test.layout([
    { id: 0, x: ${CX - 0.5 * D}, y: ${CY - 0.5 * D} },
    { id: 1, x: ${CX - 0.2 * D}, y: ${CY - 0.2 * D} },
  ])`);
  await sleep(300);
  const err = await chrome.eval(
    `__test.shoot({ v0: 1.9, phi: ${Math.PI / 4}, theta: 0, a: 0, b: -0.3 })`);
  if (err) throw new Error(`shoot rejected: ${err}`);
  for (let i = 0; i < 300; i++) {
    await sleep(200);
    const st = await chrome.eval('__test.state()');
    if (st === 'SETTLED' || st === 'AIM') break;
    if (i === 299) throw new Error('shot never settled');
  }
  const ev = JSON.parse(await chrome.eval(`JSON.stringify(
    __test.events().filter((e) => e.kind && e.kind.BallPocket))`));
  if (ev.length !== 1) throw new Error(`staging failed: ${ev.length} pots`);
  const t0 = ev[0].t;
  console.log(`staged: 1-ball pockets at t=${t0.toFixed(4)}`);
  // the finale pocketing framing: outside the corner, low elevation,
  // the net in the lower third of frame
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
  let ok = false;
  for (let i = 0; i < 25 && !ok; i++) {
    ok = await chrome.eval(`__test.cameraPose(${JSON.stringify(
      { cam: [1.14, 1.90, 0.16], look: [0.678, 1.318, -0.07], fov: 30 })})`);
    if (!ok) await sleep(200);
  }
  if (!ok) throw new Error('pose rejected');
  await chrome.eval('__test.pause(true)');
  // 30 fps deterministic read: approach (1.2 s) + fall + settle + HOLD
  const tStart = Math.max(0, t0 - 1.2);
  const frames = [];
  const N = Math.round((t0 - tStart + 2.4) * FPS);
  for (let k = 0; k <= N; k++) {
    const t = tStart + k / FPS;
    await chrome.eval(`__test.seek(${t})`);
    await chrome.eval(
      'new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))');
    await chrome.screenshot(path.join(OUT, `f${String(k).padStart(3, '0')}.png`));
    frames.push({ k, t: +t.toFixed(4) });
    if (k % 20 === 0) console.log(`frame ${k}/${N}`);
  }
  writeFileSync(path.join(OUT, 'staging.json'), JSON.stringify({
    table: '490', potT: t0, potBall: 1, used: { b: -0.3, v0: 1.9 },
    fps: FPS, frames: frames.length, tStart,
    note: 'B1 verification read: real gameplay __test.layout+__test.shoot; '
      + 'deterministic 30fps via __test.pause+__test.seek; net receive law',
  }, null, 2));
  console.log(`DONE ${frames.length} frames -> ${OUT}`);
} finally {
  const gone = await chrome.closeAndWait();
  if (gone === false) throw new Error('chrome teardown unconfirmed');
  await stopStaticServer(server);
  band.release();
}
