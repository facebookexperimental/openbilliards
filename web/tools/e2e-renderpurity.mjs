// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-renderpurity.mjs — GH-276 regression gate: `__test.renderAt(t)` must be
// a PURE function of t (render-clock law) — the rendered bytes at a time t
// must not depend on which frames were rendered before it.
//
// Defect this pins down (GH-276): after a pocketed ball's sink animation
// expired, game.js seek() parked the mesh by writing only position.y = -10 —
// leaving x/z at whatever RENDER HISTORY last wrote (rack pose on a cold
// random-access seek; the last drop pose after chronological stepping) — and
// never set b.pocketed, so syncSphereUniforms published that stale xz into
// the shared analytic-sphere uniforms at full radius. The cloth
// contact-dimple decal (scene/shading.js SPIKE_DIMPLE) saturates its rest
// gate for y = -10 (drest = 1 − smoothstep(1.06, 1.5, y/r) = 1) and painted
// a phantom dimple at the stale xz: a long chronological warmup then made a
// re-render of the same t differ from a cold render by LSBs (measured on
// the GH-275 probe: 839 PNG bytes, max channel delta 12/255, one ~22×17 px
// cloth patch at the sunk ball's stale position).
//
// Arms (all byte-compares, tolerance 0 — PNG screenshot sha256):
//   1. back-to-back: render(T) twice → identical (pre-fix green);
//   2. early detour: render(0.1) then render(T) → identical (pre-fix green);
//   3. late detour: render(3.0) then render(T) → identical (pre-fix green);
//   4. chronological warmup: render 0..T in 1/30 steps, then render(T) →
//      identical to the cold capture (THE GH-276 arm — pre-fix RED);
//   5. post-warmup detour: render(3.0) then render(T) → identical.
//
// Scenario: the GH-275 probe's pot-soft shot rebuilt live — ball 1 potted
// into the top-right corner at ~0.57 s, probed at T = 1.238 s (past the
// pocket event AND past the sink TTL, so the parked-mesh path is what
// renders). A precondition asserts the pot actually happened.
//
// Deterministic: scripted boot (obtool pins look/tier), pinned equipment,
// virtual-time renderAt, no Math.random / Date.now.
//
//   node web/tools/e2e-renderpurity.mjs [--port 20700]
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  launchChrome, sleep, spawnStaticServer, stopStaticServer,
  assertDerivedEndpoint,
} from './cdp.mjs';

// GH-687: what this tool's numeric port-like flags MEAN (run-gate never guesses)
export const PORT_FLAGS = { '--port': 'http' };
// GH-410 port inventory (GH-687 lint law): one static server on PORT, one Chrome on CDP_PORT (the retry reuses it)
export const PORT_INVENTORY = { http: 1, cdp: 1 };
const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const PORT = args.includes('--port') ? Number(args[args.indexOf('--port') + 1]) : Number(process.env.OB_E2E_PORT ?? 20700); // the assigned pin is the fallback (GH-725 review r6)
// CDP derives from the http port by a constant: 20700 + 6540 = 27240 by default (GH-725 review r5: a derived offset is
// an extent the lint models — the old PORT + 1100 = 21800 sat inside capture-626-sinkrest's 21790-21819 band unseen)
const CDP_PORT = process.env.OB_E2E_CDP_PORT ? Number(process.env.OB_E2E_CDP_PORT) : PORT + 6540;
// GH-725 review r9 P2-1: a derived endpoint is VALIDATED OR REFUSED by name before any resource is spent
assertDerivedEndpoint(CDP_PORT, { tool: 'e2e-renderpurity', role: 'cdp', base: PORT, expr: 'PORT + 6540', derived: !process.env.OB_E2E_CDP_PORT });

const R = 0.028575; // kernel default ball radius (equipment pinned below)
const T = 1.238;    // probe time: past the ~0.57 s pot + the 0.45 s sink TTL

// pot-soft (GH-275 probe): ball 1 straight into the top-right corner pocket
// (0.664, 1.299) — ghost-ball aim from the cue through 1 (kernel coords).
const CUE = [0.05, 0.30], B1 = [0.32, 0.82], PK = [0.664, 1.299];
const dir = [PK[0] - B1[0], PK[1] - B1[1]];
const L = Math.hypot(...dir);
const GHOST = [B1[0] - (dir[0] / L) * 2 * R, B1[1] - (dir[1] / L) * 2 * R];
const PHI = Math.atan2(GHOST[1] - CUE[1], GHOST[0] - CUE[0]);

async function launch() {
  try {
    return await launchChrome(`http://127.0.0.1:${PORT}/app.html?seed=1&norec=1`,
      { port: CDP_PORT, width: 800, height: 500 });
  } catch (e) {
    // machine-load flake rule: retry once after 60 s (port-in-use / launch)
    console.warn('chrome launch failed, retrying in 60 s:', e.message ?? e);
    await sleep(60_000);
    return launchChrome(`http://127.0.0.1:${PORT}/app.html?seed=1&norec=1`,
      { port: CDP_PORT, width: 800, height: 500 });
  }
}

const server = spawnStaticServer(webDir, PORT);
await sleep(700);
let chrome;
try {
  chrome = await launch();
} catch (e) {
  // review P2: a double launch failure would otherwise reject before the
  // try/finally below and leave the Python child bound to PORT
  await stopStaticServer(server);
  throw e;
}
let failed = false;
const fail = (msg) => { failed = true; console.error('FAIL:', msg); };
try {
  let ready = false;
  for (let i = 0; i < 200 && !ready; i++) { await sleep(200); ready = await chrome.eval('window.__test?.ready === true'); }
  if (!ready) throw new Error('app never became ready');

  // physics-planned shot pins the legacy WPA equipment (the ownership ledger:
  // changeEquipment re-racks, so pin BEFORE layout()).
  for (const [axis, id] of [['table_id', 'wpa_generic_9ft'],
    ['cushion_model_id', 'stronge_realistic']]) {
    const ok = await chrome.eval(
      `__settings.changeEquipment('${axis}', '${id}', { skipConfirm: true })`);
    if (ok !== true) throw new Error(`equipment pin ${axis}=${id} rejected`);
  }
  await sleep(600); // re-rack settle

  await chrome.eval(`__test.layout(${JSON.stringify([
    { id: 0, x: CUE[0], y: CUE[1] },
    { id: 1, x: B1[0], y: B1[1] },
    { id: 9, x: -0.30, y: 0.10 },
  ])})`);
  await chrome.eval('__test.pause(true)');
  const err = await chrome.eval(
    `__test.shoot({ v0: 1.6, phi: ${PHI}, theta: 0, a: 0, b: 0 })`);
  if (err) throw new Error('shoot rejected: ' + err);
  await chrome.eval('__test.setManual(true)');

  const cam = '__test.camera(0.1, 0.8, -0.3, 0.3, 0.03, 0.05, 60)';
  const render = (t) => chrome.eval(`(${cam}, __test.renderAt(${t}), 1)`);
  const hash = async () => {
    const { data } = await chrome.send('Page.captureScreenshot', { format: 'png' });
    return createHash('sha256').update(Buffer.from(data, 'base64')).digest('hex');
  };
  const check = (name, a, b) => {
    if (a === b) console.log(`[${name}] OK — bytes identical`);
    else fail(`${name}: render(${T}) depends on render history `
      + `(${a.slice(0, 12)} != ${b.slice(0, 12)}) — renderAt(t) must be a `
      + 'pure function of t (GH-276)');
  };

  // precondition: the pot happened and ball 1 is in its parked (post-sink)
  // regime at T — this is the state the GH-276 arm exists to probe.
  await render(T);
  const b1 = await chrome.eval('__test.balls().find((b) => b.id === 1)');
  if (!b1 || b1.pos[1] !== -10) {
    throw new Error('precondition: ball 1 not parked below the bed at T '
      + `(pos ${JSON.stringify(b1?.pos)}) — the pot-soft scenario drifted; `
      + 'the purity arms below would probe the wrong regime');
  }

  // arm 1: back-to-back
  await render(T); const a1 = await hash();
  await render(T); const a2 = await hash();
  check('arm 1 back-to-back', a1, a2);
  // arm 2: early detour (before the pocket event)
  await render(0.1); await render(T); const b2 = await hash();
  check('arm 2 early detour', a2, b2);
  // arm 3: late detour
  await render(3.0); await render(T); const c1 = await hash();
  check('arm 3 late detour', b2, c1);
  // arm 4: THE GH-276 arm — long chronological warmup, then the same t
  for (let t = 0; t <= T; t += 1 / 30) await render(t);
  await render(T); const d1 = await hash();
  check('arm 4 chronological warmup', c1, d1);
  // arm 5: DVR scrub after the warmup
  await render(3.0); await render(T); const e1 = await hash();
  check('arm 5 post-warmup detour', d1, e1);

  console.log(failed ? 'E2E-RENDERPURITY: FAIL' : 'E2E-RENDERPURITY: PASS');
} catch (e) {
  failed = true;
  console.error('E2E-RENDERPURITY ERROR:', e.message ?? e);
} finally {
  chrome?.close();
  await stopStaticServer(server);
}
process.exitCode = failed ? 1 : 0;
