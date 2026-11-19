// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-cuestrike.mjs — gates for the __test.cueStrike playback cue-stick
// animation (web/app/cuestrike.js, showcase v2, refs #154):
//   1. arming validation is fail-closed and rejects the WHOLE spec
//      (NaN/range/inverted-window matrix), leaving a previously armed spec
//      untouched (validate-before-disarm — frame pixels prove it);
//   2. pose(t) purity: a random-access render of t equals the
//      chronologically stepped render of the same t (post-contact ring
//      frame included — the stateful-flex trap);
//   3. visible_window: outside the window the cue mesh is GONE (frames
//      byte-identical to the never-armed baseline);
//   4. green-path no-op: disarmed boots render byte-identical to baseline
//      (nothing mounts until a spec arms).
//
//   node web/tools/e2e-cuestrike.mjs      (needs Chrome + node >= 22)
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  launchChrome, sleep, spawnStaticServer, stopStaticServer,
} from './cdp.mjs';
import { init, ScenarioBuilder, scenarioToJson } from '../dist/pool-sdk/index.js';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// suite-unique ports with the OB_E2E_PORT/OB_E2E_CDP_PORT overrides (the
// e2e-touch.mjs convention — GH-363 battery: the historic literals 8167/9377
// sat inside other lanes' claimed bands on the multi-lane box; the CDP default
// moved off 9377 to 23190 under the GH-725 tool-default-overlap rule, the http
// one kept its historic 8167 because nothing else defaults into it)
const PORT = Number(process.env.OB_E2E_PORT ?? 8167);
const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 23190);
// GH-410 port inventory (declared 2026-09-07 under the GH-687 lint law, sized by the
// declared-vs-used reader: this suite launches no CDP offset above +0 and no http
// offset above +0): {'http': 1, 'cdp': 1} — the CI job's band width and pin tails are derived from it.
export const PORT_INVENTORY = { http: 1, cdp: 1 };
const DEG = Math.PI / 180;
let failures = 0;
const fail = (msg) => { console.error('E2E-CUESTRIKE FAIL:', msg); failures++; };
const ok = (msg) => console.log('  ok:', msg);

// externally produced record on the COMMITTED canonical wasm (the
// render-hooks-demo convention): lone-ball elevated draw with side english
// so the posed tip offset/elevation are non-trivial.
const eng = await init(path.join(webDir, 'dist', 'pool-wasm', 'pool_wasm.js'));
const base = eng.nineBallRack(1);
const bld = new ScenarioBuilder(base.system.table);
bld.ball(0, { x: 0, y: -0.5, params: base.system.balls[0].params });
const scenario = bld
  .shot({ seed: 1, v0: 3, phi: Math.PI / 2, theta: 40 * DEG, a: 0.2, b: -0.3 })
  .options(base.options).build();
const recordJson = eng.simulateJson(scenarioToJson(scenario));
if (JSON.parse(recordJson).error) throw new Error('kernel rejected the record');

const server = spawnStaticServer(webDir, PORT);
await sleep(700);

const consoleErrors = [];
const chrome = await launchChrome(`http://127.0.0.1:${PORT}/app.html?seed=1&cinema=1`,
  { port: CDP_PORT });
chrome.onEvent((method, params) => {
  if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
    consoleErrors.push(params.args.map((a) => a.value ?? a.description).join(' '));
  } else if (method === 'Runtime.exceptionThrown') {
    consoleErrors.push(params.exceptionDetails.exception?.description
      ?? params.exceptionDetails.text);
  }
});

const SHOT = { phi: Math.PI / 2, theta: 40 * DEG, a: 0.2, b: -0.3 };
const VALID = {
  shot: SHOT, t_contact: 0,
  approach: { from_s: -0.2, pullback_m: 0.15, ease: 'smooth' },
  follow_through_m: 0.03, retract: { until_s: 0.15 },
  visible_window: [-0.2, 0.12],
};

async function frameHash(t) {
  await chrome.eval(`__test.renderAt(${t})`);
  const { data } = await chrome.send('Page.captureScreenshot', { format: 'png' });
  return createHash('sha256').update(Buffer.from(data, 'base64')).digest('hex');
}

try {
  for (let i = 0; i < 200; i++) {
    if (await chrome.eval('window.__test?.ready === true')) break;
    await sleep(200);
  }
  await sleep(1200); // textures settle
  await chrome.eval('__test.setManual(true)');
  const err = await chrome.eval(`__test.loadRecord(${JSON.stringify(recordJson)})`);
  if (err !== null) throw new Error(`loadRecord rejected: ${err}`);
  // poll both rigs (guarded dynamic imports)
  for (let i = 0; i < 100; i++) {
    if (await chrome.eval(`__test.cueStrike !== undefined
      && __test.cueStrike(null) === true`)) break;
    await sleep(150);
  }
  if (await chrome.eval('__test.cueStrike(null)') !== true) {
    throw new Error('cueStrike rig never became ready');
  }
  const posed = await chrome.eval(`__test.cameraPose({
    cam: [0.45, -0.95, 0.22], look: [0, -0.5, 0.03], fov: 35 })`);
  if (posed !== true) throw new Error('cameraPose rejected');

  // ---- never-armed baselines (green-path reference). Drain the HUD to a
  // PROVEN-idle state first (GH-560, the e2e-cuepost warm-up precedent):
  // hud.setState pulses the state line (ui/motion.js scale tween) on the
  // loadRecord PLAYBACK transition, and manual mode renders frames only on
  // capture — so without this the FIRST capture lands mid-pulse and the
  // late disarm comparison against it reads as a frame-determinism red.
  //
  // Two stages (review r1 P2: byte-stability alone can false-settle astride
  // the yoyo apex, where the scale curve is symmetric and near-flat):
  //   1. require the pulse tween itself to be GONE — motion.js writes
  //      el.style.transform on every tick and removes it at rest, and the
  //      only '' windows inside a live tween (pre-first-tick, and the
  //      p = 0 first tick) are time-adjacent, so three consecutive idle
  //      probes with a pumped frame and a wall-beat between them cannot
  //      all land inside a live pulse;
  //   2. belt: the baseline frame must then be byte-stable capture-over-
  //      capture (any OTHER still-settling wall-clock UI).
  {
    let idleStreak = 0;
    for (let i = 0; i < 40 && idleStreak < 3; i++) {
      idleStreak = (await chrome.eval(
        `(document.getElementById('state')?.style.transform ?? 'x') === ''`))
        ? idleStreak + 1 : 0;
      await frameHash(0); // pump a frame: a live tween must advance past ''
      await sleep(60);
    }
    if (idleStreak < 3) {
      throw new Error('HUD state-line pulse never went idle');
    }
    let prev = await frameHash(0);
    let settled = false;
    for (let i = 0; i < 20 && !settled; i++) {
      const cur = await frameHash(0);
      settled = cur === prev;
      prev = cur;
    }
    if (!settled) throw new Error('HUD never settled to a byte-stable frame');
  }
  const base0 = await frameHash(0);
  const base02 = await frameHash(0.2);

  // ---- 1. valid spec arms; invalid specs reject WHOLE, armed spec kept
  if (await chrome.eval(`__test.cueStrike(${JSON.stringify(VALID)})`) !== true) {
    fail('valid spec did not arm');
  } else ok('valid spec armed');
  const armed0 = await frameHash(0);
  if (armed0 === base0) fail('armed cue not visible at contact frame (t=0)');
  else ok('cue renders at t=0 (contact)');

  const bad = (patch, why) => {
    const s = structuredClone(VALID);
    for (const [k, v] of Object.entries(patch)) {
      const ks = k.split('.');
      let o = s;
      while (ks.length > 1) o = o[ks.shift()];
      o[ks[0]] = v;
    }
    return [s, why];
  };
  // '__NAN__'/'__INF__' sentinels survive the CDP JSON transport (raw NaN
  // would serialize to null — still rejected, but we want the REAL NaN path)
  const rejects = [
    bad({ 'shot.phi': '__NAN__' }, 'NaN phi'),
    bad({ 'shot.theta': 100 * DEG }, 'theta >= 90deg'),
    bad({ 'shot.a': 0.9, 'shot.b': 0.9 }, 'tip offset |(a,b)| >= 1'),
    bad({ 'approach.pullback_m': -0.1 }, 'negative pullback'),
    bad({ 'approach.pullback_m': '__INF__' }, 'Infinity pullback'),
    bad({ 'approach.from_s': 0.1 }, 'approach starts after contact'),
    bad({ 'approach.ease': 'bouncy' }, 'unknown ease'),
    bad({ follow_through_m: -0.01 }, 'negative follow-through'),
    bad({ 'retract.until_s': -0.05 }, 'retract before contact'),
    bad({ 'retract.until_s': 0.001 }, 'retract inside the follow-through'),
    bad({ visible_window: [0.2, -0.2] }, 'inverted visible_window'),
    bad({ visible_window: [0, '__NAN__'] }, 'NaN visible_window'),
    bad({ shot: undefined }, 'missing shot'),
    bad({ t_contact: 'zero' }, 'non-numeric t_contact'),
  ];
  for (const [s, why] of rejects) {
    const lit = JSON.stringify(s)
      .replace(/"__NAN__"/g, 'NaN').replace(/"__INF__"/g, 'Infinity');
    const r = await chrome.eval(`__test.cueStrike(${lit})`);
    if (r !== false) fail(`spec with ${why} was not rejected (got ${r})`);
    else ok(`rejected: ${why}`);
  }
  if (await frameHash(0) !== armed0) {
    fail('rejections disturbed the previously armed spec (t=0 frame moved)');
  } else ok('validate-before-disarm: armed spec survived every rejection');

  // ---- 2. purity: random access == chronological (ring frame included)
  const seq = [-0.12, -0.05, -0.01, 0.004, 0.05];
  const chron = [];
  for (const t of seq) chron.push(await frameHash(t));
  // re-arm fresh, then jump STRAIGHT to the post-contact ring frame
  await chrome.eval('__test.cueStrike(null)');
  await chrome.eval(`__test.cueStrike(${JSON.stringify(VALID)})`);
  const jump = await frameHash(0.004);
  if (jump !== chron[3]) {
    fail('pose(t) is history-dependent: random-access 0.004 differs from '
      + 'chronological');
  } else ok('pose(t) pure: random access == chronological (ring frame)');

  // ---- 3. visible_window hides the mesh entirely
  if (await frameHash(0.2) !== base02) {
    fail('cue leaked outside visible_window (t=0.2 differs from baseline)');
  } else ok('outside visible_window the frame is byte-identical to baseline');

  // ---- 4. green path: disarm restores the never-armed pixels
  if (await chrome.eval('__test.cueStrike(null)') !== true) fail('disarm failed');
  if (await frameHash(0) !== base0) {
    fail('disarmed frame differs from never-armed baseline');
  } else ok('disarm: byte-identical to the never-armed baseline');

  const relevant = consoleErrors.filter((e) => !e.includes('[cuestrike]'));
  if (relevant.length) fail(`console errors: ${relevant.join(' | ')}`);
} catch (e) {
  fail(e.message ?? String(e));
} finally {
  chrome.close();
  await stopStaticServer(server);
}
if (failures) { console.error(`E2E-CUESTRIKE: ${failures} failure(s)`); process.exit(1); }
console.log('E2E-CUESTRIKE PASS');
