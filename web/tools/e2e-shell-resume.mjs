// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-shell-resume.mjs — arm RH of the ui-shell gate (#1283): the crash-resume Continue, offered over an open hall,
// exits the hall before the export takes the table, so the clip renders cinelight's studio rig alone and the table lamps
// return to their authored levels after it.
//
// One desktop browser (1440x900, real-user boots on a fresh profile). Boot 1 (FRESH) leaves the hall, fires one shot,
// reads the table lamps (their authored levels: no hall, no export) and leaves a crash-resume debt: a webm plan of that
// shot with cinelight on (the studio quality), persisted through app/export-resume.js, plus a documentStart script that
// plays the native shell — the resume hint (window.__obResume) and a v3 save wire answering begin/chunk/end/abort (a
// webm plan takes the restart class: no resume op). Boot 2 is RETURNING: the hall opens at Play with its keys lit and
// the resume banner offers Continue over it. A real click on Continue starts the export; each frame it renders while
// cinelight's studio window is open (window.__cinelight) is sampled at window.__test.renderAt / renderAccum (the log
// names the element holding focus at the first one: observed, not judged). Rows:
//   RH1 in the window the hall keys are out of the export's light set or dark, on every sampled frame;
//   RH2 in the window the lit RectArea lamps total cinelight's 7.6 (the hall's 0.85 dim leaves 6.46);
//   RH3 after the export and the hall's exit (a user's quick play if the hall is still open) every RectArea lamp is
//       back at its boot-1 level; unjudgeable (a failure) when boot 1's lit lamps total 7.6 or 7.6/0.85, where main
//       restores them too.
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { launchChrome, sleep, spawnStaticServer, stopStaticServer } from './cdp.mjs';
import { seedReload } from './lib/seed-reload.mjs';

export const PORT_INVENTORY = { http: 1, cdp: 12 };
// SHARED_DEFAULT_WINDOW — one suite in several files: e2e-shell imports this leg module; standalone it runs on e2e-shell's own default ports
export const SHARED_DEFAULT_WINDOW = 'e2e-shell';

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
const AIMING = `['AIM', 'BALL_IN_HAND'].includes(window.__test.state())`;
// every RectAreaLight in the scene, in traverse order (the rig cinelight snapshots and restores)
const LAMPS = `(() => { const out = []; window.__dbg.scene.traverse((o) => { if (o.isRectAreaLight) out.push(o.intensity); }); return out; })()`;
// the lit total of those lamps (the sum cinelight rescales to 7.6)
const LIT = `(() => { let lit = 0; window.__dbg.scene.traverse((o) => { if (o.isRectAreaLight && o.visible) lit += o.intensity; }); return lit; })()`;
const PLAN = { name: 'rh-1283.webm', mime: 'video/webm', dest: 'files' };
// boot 1: the plan of the shot just played, persisted the way export-resume.js persists a running export's plan
const FAB = `(async () => {
  const leaf = await import('/app/export-resume.js');
  const records = window.__share.records().slice(-1);
  if (!records.length) return { err: 'no record in the share log' };
  const kv = String((await import('/dist/pool-wasm/pool_wasm.js')).kernel_version());
  const plan = { v: 1, ...${JSON.stringify(PLAN)}, kernel: kv, ua: navigator.userAgent, game: null, frames: 0, records,
    opts: { tier: 'cinematic', cinelight: true, width: 320, height: 180, noDownload: true, withAudio: false,
      trims: [{ startT: 0, endT: 0.5 }] } };
  const json = JSON.stringify(plan);
  const hash = leaf.planHashOf(json);
  await leaf.persistPlan(json, hash);
  return { hash, stored: (await leaf.loadPlan())?.hash === hash };
})()`;
// boot 2's documentStart: the native shell's launch hint for the preserved partial and its v3 save wire
const SHELL = (planHash) => `(() => {
  if (window.__rhWire) return;
  const ops = window.__rhWire = [];
  window.__obResume = { v: 1, ...${JSON.stringify(PLAN)}, extent: 4096, chunks: 1, planHash: ${JSON.stringify(planHash)}, frame: 0 };
  window.webkit = window.webkit ?? {};
  window.webkit.messageHandlers = Object.assign({}, window.webkit.messageHandlers, {
    obSaveVideoStream: { postMessage: (m) => {
      ops.push(m.op);
      if (m.op === 'end') {
        setTimeout(() => window.dispatchEvent(new CustomEvent('ob:save-video-result',
          { detail: { ok: true, name: m.name, dest: ${JSON.stringify(PLAN.dest)} } })), 60);
      }
      return new Promise((res) => { setTimeout(() => res({ ok: true }), 2); });
    } },
  });
  window.__obSaveVideo = { v: 1, chunk: 786432, full: 4294967296, dests: ['photos', 'files'] };
})();`;
// boot 2, before Continue: sample each frame the export renders inside the studio window
const PROBE = `(() => {
  const t = window.__test, sh = window.__shell, scene = window.__dbg.scene;
  const S = window.__rh = { frames: 0, samples: [], focus: null };
  const sample = () => {
    if (window.__cinelight !== true) return;
    S.frames += 1;
    if (S.focus === null) {
      const a = document.activeElement;
      S.focus = !a || a === document.body ? 'body' : a.id ? '#' + a.id : String(a.className || a.tagName);
    }
    if (S.samples.length >= 400) return;
    const v = sh.visualState();
    let lit = 0;
    scene.traverse((o) => { if (o.isRectAreaLight && o.visible) lit += o.intensity; });
    S.samples.push({ keys: v.keys, layer1: v.camLayer1, keyMax: Math.max(0, ...v.keyIntensities), lamps: lit, hall: sh.isOpen() });
  };
  for (const k of ['renderAt', 'renderAccum']) {
    const f = t[k];
    if (typeof f === 'function') t[k] = (...a) => { const r = f(...a); sample(); return r; };
  }
  return true;
})()`;
const CONTINUE = '#ob-resume-banner .ob-pb-resume-go';

async function leg({ PORT, CDP_PORT, fail, webDir = null }) {
  const errs = [];
  // webDir: the tree the standalone runner serves (the red proof's export); the gate serves its own
  const c = await launchChrome(`http://127.0.0.1:${PORT}/app.html`,
    { port: CDP_PORT + 11, width: 1440, height: 900, tool: false, preflightWebDir: webDir });
  watchErrors(c, errs);
  try {
    // ---- boot 1 (FRESH): the table, one shot, the authored lamp levels, the persisted plan
    if (!(await waitFor(c, 'window.__test?.ready === true && !!window.__shell', 400, 150))) { fail('RH: the FRESH boot never became ready'); return; }
    // a FRESH boot opens its hall at #ob-boot's fade start: wait for that hand-off as a user does, then leave the hall
    if (!(await waitFor(c, `(() => { const b = document.getElementById('ob-boot'); return !b || b.classList.contains('ob-boot--out'); })()`, 300, 150))) { fail('RH: the FRESH boot overlay never handed off'); return; }
    let atTable = false;
    for (let i = 0; i < 4 && !atTable; i++) {
      await c.eval('(() => { const s = window.__shell; if (s.isOpen()) s.quickPlay(); return true; })()');
      atTable = await waitFor(c, `window.__shell.isOpen() === false && !window.__shell.moving() && ${AIMING}`, 100, 200);
    }
    if (!atTable) { fail('RH: the FRESH boot never reached the table'); return; }
    await c.eval('window.__test.shoot({ v0: 1.2, phi: 0.3 }), true');
    if (!(await waitFor(c, `window.__share.records().length > 0 && ${AIMING}`, 300, 200))) { fail('RH: the boot-1 shot never settled'); return; }
    const authored = await c.eval(LAMPS);
    if (!authored.length) { fail('RH: no RectAreaLight in the scene'); return; }
    const authoredLit = await c.eval(LIT);
    const fab = await c.eval(FAB);
    if (!fab?.stored) { fail('RH: the resume plan was not persisted: ' + JSON.stringify(fab)); return; }
    console.log(`RH: boot 1 at the table, lamps ${JSON.stringify(authored)} (lit total ${authoredLit}), plan ${fab.hash} persisted`);

    // ---- boot 2 (RETURNING): the hall open with its keys lit, the resume offered over it
    await c.send('Page.addScriptToEvaluateOnNewDocument', { source: SHELL(fab.hash) });
    const r = await seedReload(c, { 'ob-shell-v1': { v: 1, lastPlace: 'play', startAtTable: false } },
      `window.__shell?.isOpen?.() === true && window.__shell.state().boot === 'returning'`);
    if (!r.ok) { fail(`RH: the RETURNING boot stopped at the ${r.stage} clause`); return; }
    if (!(await waitFor(c, `window.__playback?.resumeState?.() === 'offer'`, 150, 200))) {
      fail('RH: no resume offer over the RETURNING hall: ' + JSON.stringify(await c.eval('window.__playback?.resumeState?.() ?? null')));
      return;
    }
    await waitFor(c, 'window.__shell.visualState().keysPending === 0', 100, 100);
    const v0 = await c.eval('window.__shell.visualState()');
    if (!(v0.keys === 2 && v0.camLayer1 === true && v0.keyIntensities.every((k) => k > 0))) {
      fail('RH: the RETURNING hall is not open with its keys lit: ' + JSON.stringify(v0));
      return;
    }
    // the click lands on the banner's Continue once the boot overlay is gone (#1202 build 21: it can outlive ready)
    if (!(await waitFor(c, `(() => { const el = document.getElementById('ob-boot');
      return !el || (el.classList.contains('ob-boot--out') && getComputedStyle(el).pointerEvents === 'none'); })()`, 150, 100))) {
      fail('RH: the boot overlay never left the RETURNING boot');
      return;
    }
    const pt = await c.eval(`(() => {
      const b = document.querySelector(${JSON.stringify(CONTINUE)});
      if (!b) return null;
      const q = b.getBoundingClientRect();
      const x = q.x + q.width / 2, y = q.y + q.height / 2;
      return { x, y, hit: b.contains(document.elementFromPoint(x, y)) };
    })()`);
    if (!pt?.hit) { fail('RH: Continue is not the element under its own centre over the hall: ' + JSON.stringify(pt)); return; }
    if (!(await c.eval(PROBE))) { fail('RH: the frame probe did not install'); return; }
    await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
    await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
    if (!(await waitFor(c, `['saved', 'failed', 'cancelled', 'resumeFailed', 'truncated'].includes(window.__playback.resumeState())`, 360, 500))) {
      fail('RH: the resumed export never finished: ' + JSON.stringify(await c.eval('window.__playback.resumeState()')));
      return;
    }
    const end = await c.eval('({ state: window.__playback.resumeState(), wire: window.__rhWire.join(","), frames: window.__rh.frames, samples: window.__rh.samples, focus: window.__rh.focus })');
    if (end.state !== 'saved' || end.frames === 0) {
      fail(`RH: the resumed export did not deliver a studio-lit clip (state ${end.state}, ${end.frames} frames in the window, wire ${end.wire.slice(0, 80)})`);
      return;
    }
    console.log(`RH: Continue delivered (wire ${end.wire.replace(/(,chunk)+/, ',chunk…')}); ${end.frames} frames rendered in the studio window, focus on ${end.focus} at the first`);

    // RH1: the hall keys out of the export's light set, or dark
    const keyed = end.samples.filter((s) => s.keys > 0 && s.layer1 && s.keyMax > 0);
    if (keyed.length) fail(`RH1: the hall keys lit ${keyed.length} of ${end.samples.length} sampled export frames: ${JSON.stringify(keyed[0])}`);
    else console.log(`RH1 OK: the hall keys lit none of ${end.samples.length} sampled export frames (hall open on ${end.samples.filter((s) => s.hall).length})`);
    // RH2: the lit lamps total cinelight's 7.6
    const off = end.samples.filter((s) => Math.abs(s.lamps - 7.6) > 1e-6);
    if (off.length) fail(`RH2: the lit RectArea lamps did not total 7.6 on ${off.length} of ${end.samples.length} sampled export frames: ${off[0].lamps}`);
    else console.log(`RH2 OK: the lit RectArea lamps totalled 7.6 on all ${end.samples.length} sampled export frames`);
    // RH3: after the export and the hall's exit, the lamps stand at their authored levels. Main fails it only when the
    // authored lit total is neither 7.6 (cinelight's rescale of the dimmed lamps lands on the authored levels, which
    // the shell adopts as its base) nor 7.6/0.85 (the rescale leaves them at the hall's dim, so the shell keeps its
    // base): at either, main's exit restores the authored levels too
    const blind = [7.6, 7.6 / 0.85].find((t) => Math.abs(authoredLit - t) <= 1e-6);
    if (blind !== undefined) {
      fail(`RH3: unjudgeable: boot 1's lit lamps total ${authoredLit} (${blind === 7.6 ? '7.6' : '7.6/0.85'}), where main restores them too`);
    } else {
      await c.eval('(() => { const s = window.__shell; if (s.isOpen()) s.quickPlay(); return true; })()');
      await waitFor(c, `window.__shell.isOpen() === false && window.__shell.visualState().keysPending === 0 && ${AIMING}`, 100, 150);
      await c.eval('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => r(true), 30))))');
      const after = await c.eval(LAMPS);
      const drift = authored.map((b, i) => ({ i, authored: b, now: after[i] })).filter((d) => !(Math.abs(d.now - d.authored) <= 1e-9 * Math.max(1, d.authored)));
      if (after.length !== authored.length || drift.length) fail(`RH3: after the export and the hall's exit the lamps are not at their authored levels: ${JSON.stringify(drift.length ? drift : after)}`);
      else console.log(`RH3 OK: after the export and the hall's exit all ${after.length} RectArea lamps are back at their authored levels (lit total ${authoredLit})`);
    }

    const appErrs = await c.eval('window.__test.errors.slice(0, 8)').catch(() => []);
    if (appErrs.length) fail('RH: app errors: ' + JSON.stringify(appErrs));
    if (errs.length) fail('RH: console errors: ' + errs.slice(0, 3).join(' | '));
  } finally {
    await c.closeAndWait();
  }
}

export async function armRH(ctx) {
  await leg(ctx);
}

// ---- standalone (the red-proof runner; the gate imports armRH above) ----
const isMain = () => { try { return fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } };
if (isMain()) {
  const webDir = process.env.OB_RH_WEBDIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const PORT = Number(process.env.OB_E2E_PORT ?? 8178);
  const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 8830);
  const fail = (msg) => { console.error('E2E-SHELL FAIL:', msg); process.exitCode = 1; };
  const server = spawnStaticServer(webDir, PORT);
  await sleep(700);
  try { await armRH({ PORT, CDP_PORT, fail, webDir }); } finally { await stopStaticServer(server); }
  console.log(process.exitCode ? 'E2E-SHELL-RH FAIL' : 'E2E-SHELL-RH PASS');
}
