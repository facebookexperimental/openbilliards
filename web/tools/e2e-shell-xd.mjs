// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-shell-xd.mjs — arm XD of the ui-shell gate (#1202 build 21; the exit's
// lamp-degrade recheck, from the #1192 lens): with `camera=overhead` and the
// overhead register applied BEFORE the shell opens, a lighting layer whose
// active non-canopy fixture cannot fade makes the exit's overhead re-home
// refuse (camHome degrades; its recovery reads the shell's own high-phi pose
// and stands down). restoreGameplayPose must not then leave the restored
// overhead ENTRY pose over that fixture: main's lamp-degrade recovery runs on
// the restored pose and returns the rig to the orbit home.
//
// The law judged here (desktop, real-user boot, STRAIGHT-TO-AIM):
//   P  preconditions, each INVALID when unmet, never a pass: the boot class
//      is 'table'; the overhead register applied before the shell opened
//      (phi <= 0.5); the shell opened at play; inside it, the active fixture
//      is non-canopy and __lighting.fixtureMeshes is not a function (exactly
//      what main.js's fixtureFadeable() reads).
//   X1 after a real quick-play exit, the shell closed and settled: the camera
//      is NOT at the overhead entry pose, phi > 0.5 (the orbit home; the
//      guard main's recovery itself uses).
// Simulation, named: inside the open shell the arm swaps to the pendant bar
// through the settings seam, then deletes __lighting.fixtureMeshes. That is
// the pre-381 shape fixtureFadeable() tests for (a stale lightingvisuals.js
// in a mixed cache), without serving a stale module (e2e-lighting's degrade
// guard serves stubs for the boot paths).
// Red proof: the same arm on a tree without shellmover.js's degradeCheck()
// call after the entry-pose restore ends at the overhead entry pose (X1 red).
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { launchChrome, sleep, spawnStaticServer, stopStaticServer } from './cdp.mjs';
// the seeded STRAIGHT-TO-AIM boot waits for the NEW document in its seeded state (GH-909 / GH-966), never a sleep
import { seedReload } from './lib/seed-reload.mjs';

export const PORT_INVENTORY = { http: 1, cdp: 7 };
// SHARED_DEFAULT_WINDOW — one suite in several files: e2e-shell imports this leg module; standalone it runs on e2e-shell's own default ports
export const SHARED_DEFAULT_WINDOW = 'e2e-shell';

const NON_CANOPY = 'pendant_bar';

async function waitFor(c, expr, tries = 100, ms = 150) {
  for (let i = 0; i < tries; i++) {
    if (await c.eval(expr).catch(() => false)) return true;
    await sleep(ms);
  }
  return false;
}
function watchErrors(c, sink) {
  c.onEvent((method, params) => {
    if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
      sink.push((params.args || []).map((a) => a.value ?? a.description ?? '').join(' '));
    } else if (method === 'Runtime.exceptionThrown') {
      sink.push(params.exceptionDetails?.exception?.description ?? params.exceptionDetails?.text ?? 'exception');
    }
  });
}
const POSE = `(() => { const p = window.__shell?.pose?.();
  return p ? { phi: p.phi, theta: p.theta, radius: p.radius, fov: p.fov } : null; })()`;
const fmt = (p) => (p ? `phi ${p.phi.toFixed(3)} fov ${Number(p.fov).toFixed(1)}` : 'no pose');

async function desktop({ PORT, CDP_PORT, fail }) {
  const tag = 'XD'; const errs = [];
  const c = await launchChrome(`http://127.0.0.1:${PORT}/app.html`,
    { port: CDP_PORT + 6, width: 1440, height: 900, tool: false });
  watchErrors(c, errs);
  try {
    if (!(await waitFor(c, 'window.__test?.ready === true', 200, 200))) { fail(`${tag}: the first boot never became ready`); return; }
    // a profile with camera=overhead and a STRAIGHT-TO-AIM boot, booted anew
    const seeded = await seedReload(c, {
      'ob-settings-v1': { camera: 'overhead' },
      'ob-shell-v1': { v: 1, lastPlace: 'play', startAtTable: true },
    }, `window.__test?.state?.() != null && window.__shell && !window.__shell.isOpen()
      && window.__settings?.get?.().camera === 'overhead'`);
    if (!seeded.ok) { fail(`${tag} P: INVALID: the seeded boot stopped at the ${seeded.stage} clause`); return; }
    const boot = await c.eval('window.__shell?.state?.().boot');
    if (boot !== 'table') { fail(`${tag} P: INVALID: boot class '${boot}', not 'table'`); return; }
    // the overhead register lands at the lampfade import settle
    if (!(await waitFor(c, `(() => { const p = window.__shell?.pose?.(); return !!p && p.phi <= 0.5; })()`, 100, 150))) {
      fail(`${tag} P: INVALID: the overhead register never applied before the shell opened (${fmt(await c.eval(POSE))})`); return;
    }
    const entry = await c.eval(POSE);
    await c.eval(`window.__shell.openShell({ animate: true, place: 'play', autoFocus: false })`);
    if (!(await waitFor(c, `(() => { const s = window.__shell; return s.isOpen() && !s.moving() && s.place() === 'play'; })()`))) {
      fail(`${tag} P: INVALID: the shell never opened at play`); return;
    }
    // the stale pre-381 layer, simulated inside the open shell (see the header)
    await c.eval(`window.__settings.set('fixture', '${NON_CANOPY}')`);
    if (!(await waitFor(c, `window.__lighting?.state?.().fixture === '${NON_CANOPY}'`))) {
      fail(`${tag} P: INVALID: the fixture never became ${NON_CANOPY}`); return;
    }
    await sleep(300);
    const stale = await c.eval(`(() => { const lt = window.__lighting; delete lt.fixtureMeshes;
      return { fixture: lt.state?.().fixture, meshes: typeof lt.fixtureMeshes, open: window.__shell.isOpen() }; })()`);
    if (stale.fixture !== NON_CANOPY || stale.meshes === 'function' || !stale.open) {
      fail(`${tag} P: INVALID: the unfadeable fixture was not in place inside the open shell: ${JSON.stringify(stale)}`); return;
    }
    // ---- X1: a real quick-play exit -----------------------------------------
    await c.eval('window.__shell.quickPlay()');
    if (!(await waitFor(c, `(() => { const s = window.__shell; return !s.isOpen() && !s.moving(); })()`))) {
      fail(`${tag} X1: the quick-play exit never settled`); return;
    }
    await sleep(500);
    const after = await c.eval(POSE);
    if (!after || !(after.phi > 0.5)) {
      fail(`${tag} X1: the exit left the overhead entry pose over a fixture that cannot fade: ${fmt(after)} (entry ${fmt(entry)}); main's lamp-degrade recovery never ran on the restored pose`);
    } else {
      console.log(`${tag} X1 OK: the exit refused the overhead re-home over the unfadeable ${NON_CANOPY} and ended at the orbit home (${fmt(after)}; entry ${fmt(entry)})`);
    }
    if (await c.eval('__test.errors.length').catch(() => 0)) fail(`${tag}: app errors: ` + JSON.stringify(await c.eval('__test.errors')));
    if (errs.length) fail(`${tag}: console errors: ` + errs.slice(0, 3).join(' | '));
  } finally { c.close(); await sleep(800); }
}

export async function armXD(ctx) { await desktop(ctx); }

// ---- standalone (the red-proof runner; the gate imports armXD above) ------
const isMain = () => { try { return fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } };
if (isMain()) {
  const webDir = process.env.OB_XD_WEBDIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const PORT = Number(process.env.OB_E2E_PORT ?? 8178);
  const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 8830);
  const fail = (msg) => { console.error('E2E-SHELL FAIL:', msg); process.exitCode = 1; };
  const server = spawnStaticServer(webDir, PORT);
  await sleep(700);
  try { await armXD({ PORT, CDP_PORT, fail }); } finally { await stopStaticServer(server); }
  console.log(process.exitCode ? 'E2E-SHELL-XD FAIL' : 'E2E-SHELL-XD PASS');
}
