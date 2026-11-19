// Copyright (c) Meta Platforms, Inc. and affiliates.

// probe-490-netball.mjs — GH-490 PASS-2 item 1 (netted-ball green stain)
// transport-channel probe + cure verifier. Stages the recorded pocketing
// law (stage-490-pocketing.mjs staging verbatim), then reads the RESTING
// netted ball from a close sock bearing and (in --ablate mode) toggles the
// candidate env transports one at a time:
//   A baseline · B giSH zeroed (baked bed-cloth SH probe off)
//   C envMapIntensity 0 (room-cube IBL off) · D both off
// so the stain's channel is PINNED by measurement, not theory (LOOK LOOP
// law). In verify mode (default) it captures the close bearing + the
// finale-law bearing across catch->rest for the numeric chroma scan.
//   node web/tools/probe-490-netball.mjs [--ablate] [--out DIR]
import path from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { launchChrome, sleep, spawnStaticServer, stopStaticServer, claimPortBand } from './cdp.mjs';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const argOf = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const ABLATE = args.includes('--ablate');
const OUT = path.resolve(argOf('--out', '/tmp/ob490pass2/netball'));
const W = 1600, H = 1000;
mkdirSync(OUT, { recursive: true });

const band = await claimPortBand(8980, 9009);
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
  await chrome.eval('__test.pause(true)');
  const seek = async (t) => {
    await chrome.eval(`__test.seek(${t})`);
    await chrome.eval('new Promise((r) => requestAnimationFrame('
      + '() => requestAnimationFrame(() => r(true))))');
  };
  const pose = async (p) => {
    let ok = false;
    for (let i = 0; i < 25 && !ok; i++) {
      ok = await chrome.eval(`__test.cameraPose(${JSON.stringify(p)})`);
      if (!ok) await sleep(200);
    }
    if (!ok) throw new Error('pose rejected');
  };
  // the netted-ball handle: the sunk 1-ball's mesh is the unique sphere
  // below the bed plane (world y < -0.02; world axes are kernel-swapped:
  // world.x = kernel z/length, world.z = kernel x/width — measured via
  // the sphere dump, ball rest at world (1.274, -0.122, 0.633))
  const FIND_NET_BALL = `(() => {
    let hit = null;
    window.__dbg.scene.traverse((o) => {
      if (o.isMesh && o.geometry && o.geometry.type === 'SphereGeometry') {
        const w = o.getWorldPosition(new (o.position.constructor)());
        if (w.y < -0.02 && w.y > -0.5) hit = o;
      }
    });
    if (!hit) return null;
    window.__netBall = hit;
    const w = hit.getWorldPosition(new (hit.position.constructor)());
    const sh = hit.material.userData.giSH;
    return { pos: [w.x, w.y, w.z],
      envInt: hit.material.envMapIntensity,
      sh: sh ? Array.from(sh.value) : null };
  })()`;

  // pose-fit bearings (posefit 2026-08-22 vs the shipped finale video
  // f140): CLOSE ~= the finale pocketing framing (bore annulus + boot
  // tips + netted ball all in frame); WIDE adds both flanks + cushion
  // ends (the item-7/8/9 context view)
  const CLOSE = { cam: [1.06, 1.70, 0.62], look: [0.628, 1.268, -0.12], fov: 30 };
  const WIDE = { cam: [1.02, 1.66, 0.55], look: [0.60, 1.22, -0.10], fov: 36 };

  if (ABLATE) {
    const tRest = t0 + 2.2;
    await seek(tRest);
    const info = JSON.parse(await chrome.eval(
      `JSON.stringify(${FIND_NET_BALL})`));
    if (!info) throw new Error('netted ball mesh not found');
    console.log('netted ball:', JSON.stringify(info.pos),
      'envInt', info.envInt);
    writeFileSync(path.join(OUT, 'netball-info.json'),
      JSON.stringify(info, null, 2));
    await pose(CLOSE);
    await seek(tRest); // re-pose settles through the seek path
    // review pass2-r4 P2: on the CURED build poseSink has already gated
    // the resting ball's SH off and swapped its env — force the
    // PRE-CURE transport state for the ablation legs (canonical env +
    // SH gate on) so A/B/C/D actually attribute the channels this
    // instrument claims to measure.
    await chrome.eval(`(() => {
      const m = window.__netBall.material;
      if (m.userData.giBallOn) m.userData.giBallOn.value = 1;
      m.userData.netEnvOn = false;
      m.envMap = window.__dbg.scene.environment;
      m.needsUpdate = true; return true;
    })()`);
    await chrome.eval(
      'new Promise((r) => requestAnimationFrame(() => r(true)))');
    await chrome.screenshot(path.join(OUT, 'ablate-A-baseline.png'));
    // legs B-D: each re-seek re-runs poseSink (which re-applies the
    // cure on this build), so every leg forces the pre-cure transport
    // AFTER its seek and applies its own toggle on top (review
    // pass2-r4 P2 follow-through).
    const FORCE_PRECURE = `(() => {
      const m = window.__netBall.material;
      if (m.userData.giBallOn) m.userData.giBallOn.value = 1;
      m.userData.netEnvOn = false;
      m.envMap = window.__dbg.scene.environment;
      m.needsUpdate = true; return true;
    })()`;
    const leg = async (toggle, file) => {
      await seek(tRest);
      await chrome.eval(FORCE_PRECURE);
      await chrome.eval(toggle);
      await chrome.eval(
        'new Promise((r) => requestAnimationFrame(() => r(true)))');
      await chrome.screenshot(path.join(OUT, file));
    };
    // B: baked SH probe off (bed-cloth bounce transport)
    await leg(`(() => {
      const sh = window.__netBall.material.userData.giSH;
      window.__shSave = Array.from(sh.value); sh.value.fill(0); return true;
    })()`, 'ablate-B-noSH.png');
    // C: SH restored, room-cube IBL off
    await leg(`(() => {
      const sh = window.__netBall.material.userData.giSH;
      sh.value.set(window.__shSave);
      window.__netBall.material.envMapIntensity = 0; return true;
    })()`, 'ablate-C-noEnv.png');
    // D: both off
    await leg(`(() => {
      window.__netBall.material.userData.giSH.value.fill(0); return true;
    })()`, 'ablate-D-neither.png');
    console.log(`ABLATE DONE -> ${OUT}`);
  } else {
    // verify mode: catch->rest at 30 fps on BOTH bearings + slow-mo pass
    // (1/60 s sampling of the same physics — the finale slow-mo law)
    const tStart = Math.max(0, t0 - 0.2);
    const spans = [
      ['close', CLOSE, 1 / 30], ['close-slow', CLOSE, 1 / 60],
      ['wide', WIDE, 1 / 30]];
    for (const [tag, p, dt] of spans) {
      await pose(p);
      const N = Math.round((t0 - tStart + 2.4) / dt);
      for (let k = 0; k <= N; k++) {
        await seek(tStart + k * dt);
        await chrome.screenshot(
          path.join(OUT, `${tag}-f${String(k).padStart(3, '0')}.png`));
      }
      console.log(`${tag}: ${N + 1} frames`);
    }
    writeFileSync(path.join(OUT, 'staging.json'), JSON.stringify({
      table: '490', potT: t0, potBall: 1, tStart,
      bearings: { close: CLOSE, wide: WIDE },
      note: 'item-1 verify: catch->rest, 30fps + true-slow 60Hz sampling',
    }, null, 2));
    console.log(`VERIFY DONE -> ${OUT}`);
  }
} finally {
  const gone = await chrome.closeAndWait();
  if (gone === false) throw new Error('chrome teardown unconfirmed');
  await stopStaticServer(server);
  band.release();
}
