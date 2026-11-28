// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-shell-g3cold.mjs — arm G3 of the ui-shell gate (#1202 build 21; review P1 on PR-A, maintainer ruling c3ba6da8):
// on a covered FRESH boot the hall keys' first draw must land behind the opaque boot overlay, also when shell.js lands
// late, and G3 must be able to fail on the freeze it guards.
//
// Rows (desktop 1440x900, real-user boots; each row launches its own Chrome, and cdp.mjs gives every launch a fresh
// profile, so Chrome's shader cache starts cold):
//   G3a the covered FRESH boot as it comes.
//   G3b the late arrival: the arm holds shell.js's request (CDP Fetch) until __test.ready is true and main's hold has
//       capped (main's warm tick then ignores the hall-key handle), then lets it through, so createShell runs after
//       ready with the overlay still up (app.html holds while the arrival is pending).
//   G3c the stall model's control (review P2 on 24c194cb): G3a with an environment re-bake planted at the moment the
//       keys first stand joined, before main's next render. The re-bake draws on the same context through
//       bakeEnvOnce()'s cube cameras; the stall must still land on the main camera's keyed render.
// Every row models a cold first draw: a document-start script stalls, by STALL_MS, the first WebGL draw call inside a
// render of the MAIN camera with the keys in its light set (joined, camera layer 1 on when that render starts; main's
// keys-off warm draws turn layer 1 off for theirs), once the keys have stood joined at an rAF. It wraps the renderer
// from main.js's read-only window.__dbg handles, so the environment re-bake's cube cameras, which draw on the same
// context, never take it. The stall is a busy wait on the page's main thread, the shape of a synchronous compile hold. The same script watches the scene context's
// fences: a fence made after the stalled draw sits behind it, so its SIGNALED read shows that draw done on the GPU.
// There is no frame-timing threshold; the owner's two-hour test stays the timing proof.
// Judged per row:
//   1 at the overlay's exit (a mutation observer armed at document start, read before the fade-start open runs):
//     boot 'fresh', both keys joined dark, camera layer 1 on, keysCovered;
//   2 the modelled cold first draw had finished before the overlay's exit;
//   3 a fence made on the scene context after that draw read SIGNALED before the exit (whoever made it);
//   4 the shell's own record at the exit (visualState().keysDraw): its covered draw with the keys completed and was
//     fenced, before the exit;
//   (every row) the main renderer was wrapped before the keys first stood joined;
//   (G3c) the planted re-bake drew before the stall, and the stall still landed inside a keyed main-camera render;
//   5 after the open, the pre-joined keys were adopted: keysCovered false, both keys there, no second light-set change;
//   G3b also: shell.js landed after ready was true and the hold had capped, and the overlay was still up when it landed.
// Red proof: on a shell that lets the arrival go before a covered draw with the keys, G3b fails rows 2 to 4 on
// PR-A's own tree (base main.js). On the integration tree main's quiet term also holds the fade for a late pre-join
// on KHR hosts, so that plant passes there.
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { launchChrome, sleep, spawnStaticServer, stopStaticServer } from './cdp.mjs';

export const PORT_INVENTORY = { http: 1, cdp: 12 };
// SHARED_DEFAULT_WINDOW — one suite in several files: e2e-shell imports this leg module; standalone it runs on e2e-shell's own default ports
export const SHARED_DEFAULT_WINDOW = 'e2e-shell';

const STALL_MS = 1200; // the modelled cold first draw (the #1202 v3d campaign's frame after the fade ran 2566 ms)
const EPS = 1e-3;

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
// open, still, at play and posed at its anchor
const LANDED = `(() => {
  const s = window.__shell;
  if (!s || !s.isOpen() || s.moving() || s.place() !== 'play') return false;
  const a = s.registry().find((p) => p.id === 'play').anchor;
  const p = s.pose();
  return Math.abs(p.radius - a.radius) < ${EPS} && Math.abs(p.theta - a.theta) < ${EPS}
    && Math.abs(p.phi - a.phi) < ${EPS} && Math.abs(p.target[0] - a.tx) < ${EPS} && Math.abs(p.target[2] - a.tz) < ${EPS};
})()`;
// document start: the stall model, a per-rAF sampler and the overlay-exit observer. Everything lands in window.__g3.
const PAGE = (REBAKE) => `(() => {
  const REBAKE = ${REBAKE ? 'true' : 'false'};
  const S = window.__g3 = { exit: null, cover: null, stall: null, fenced: null, armedAt: null, shellAt: null,
    stallMs: ${STALL_MS}, keyed: 0, wrappedAt: null, unkeyedDraws: 0, rebake: REBAKE, rebakedAt: null };
  const sceneCanvas = () => document.querySelector('body > canvas');
  // the keys stand in the light set at this draw: joined, camera layer 1 on
  const keysLive = () => {
    try { const v = window.__shell?.visualState?.(); return !!v && v.keys > 0 && v.camLayer1 === true; } catch { return false; }
  };
  const P = window.WebGL2RenderingContext && WebGL2RenderingContext.prototype;
  if (P) {
    // the modelled cold first draw: once armed, the first draw inside a keyed main-camera render waits STALL_MS on this
    // thread; every draw before it outside such a render (a re-bake, a keys-off warm draw) is counted
    for (const n of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'drawRangeElements']) {
      const orig = P[n];
      if (typeof orig !== 'function') continue;
      P[n] = function (...a) {
        if (S.armedAt !== null && S.stall === null) {
          if (S.keyed > 0) {
            const t0 = performance.now();
            while (performance.now() - t0 < S.stallMs) { /* the stall */ }
            S.stall = { at: Math.round(t0), end: Math.round(performance.now()), keyed: S.keyed > 0 };
          } else S.unkeyedDraws += 1;
        }
        return orig.apply(this, a);
      };
    }
    // the scene context's fences made after the stalled draw, and the first SIGNALED read of one
    const behind = new WeakMap();
    const fenceSync = P.fenceSync;
    const getSyncParameter = P.getSyncParameter;
    if (typeof fenceSync === 'function' && typeof getSyncParameter === 'function') {
      P.fenceSync = function (...a) {
        const f = fenceSync.apply(this, a);
        if (f && S.stall !== null && this.canvas === sceneCanvas()) behind.set(f, Math.round(performance.now()));
        return f;
      };
      P.getSyncParameter = function (sync, pname) {
        const r = getSyncParameter.call(this, sync, pname);
        if (S.fenced === null && pname === this.SYNC_STATUS && r === this.SIGNALED && behind.has(sync)) {
          S.fenced = { madeAt: behind.get(sync), signalledAt: Math.round(performance.now()) };
        }
        return r;
      };
    }
  }
  // the main camera's renders with the keys live: a render of window.__dbg.camera (main.js's read-only forensics
  // handles) that starts while the keys stand in its light set counts as keyed while it runs
  const wrap = () => {
    const r = window.__dbg?.renderer;
    const cam = window.__dbg?.camera;
    if (!r || !cam || typeof r.render !== 'function') return;
    const orig = r.render;
    r.render = function (scene, camera, ...rest) {
      const keyed = camera === cam && keysLive();
      if (keyed) S.keyed += 1;
      try { return orig.call(this, scene, camera, ...rest); } finally { if (keyed) S.keyed -= 1; }
    };
    S.wrappedAt = Math.round(performance.now());
  };
  // per rAF: the renderer wrapped once it exists; when the shell appeared, and when its keys first stood joined (both
  // in the scene, camera layer 1 on). G3c plants its re-bake right there, before main's next render.
  const tick = () => {
    try {
      if (S.wrappedAt === null) wrap();
      const s = window.__shell;
      if (s && S.shellAt === null) S.shellAt = Math.round(performance.now());
      if (s && S.armedAt === null) {
        const v = s.visualState();
        if (v.keys > 0 && v.camLayer1) {
          S.armedAt = Math.round(performance.now());
          if (S.rebake && typeof window.__rebakeEnv === 'function') { window.__rebakeEnv(); S.rebakedAt = Math.round(performance.now()); }
        }
      }
    } catch { /* the page is still building */ }
    if (S.armedAt === null || S.exit === null) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  // the overlay's exit class (or its removal under reduced motion): the shell's state there. The shell's own handoff
  // observer only resolves a promise at this checkpoint, and the fade-start open runs in its .then, after every
  // observer of the checkpoint, so this read precedes the open.
  const grab = () => {
    if (S.exit !== null) return;
    S.exit = Math.round(performance.now());
    const s = window.__shell;
    S.cover = s ? { boot: s.state().boot, vs: s.visualState() } : { boot: null, vs: null };
  };
  const watch = (el) => {
    const mo = new MutationObserver(() => {
      if (!document.getElementById('ob-boot') || el.classList.contains('ob-boot--out')) { grab(); mo.disconnect(); }
    });
    mo.observe(el, { attributes: true, attributeFilter: ['class'] });
    mo.observe(document.body, { childList: true });
  };
  // documentElement is still null at document start: observe the document
  const find = new MutationObserver(() => {
    const el = document.getElementById('ob-boot');
    if (el && document.body) { find.disconnect(); watch(el); }
  });
  find.observe(document, { childList: true, subtree: true });
})()`;

async function row(name, { late = false, rebake = false } = {}, { PORT, CDP_PORT, fail }) {
  const tag = `G3${name}`; const errs = [];
  // boot the origin root first, so the document-start script and the request hold are in place before app.html loads
  const c = await launchChrome(`http://127.0.0.1:${PORT}/`, { port: CDP_PORT + 11, width: 1440, height: 900, tool: false });
  watchErrors(c, errs);
  let paused = null;
  try {
    await c.send('Page.addScriptToEvaluateOnNewDocument', { source: PAGE(rebake) });
    if (late) {
      c.onEvent((method, params) => { if (method === 'Fetch.requestPaused' && paused === null) paused = params; });
      await c.send('Fetch.enable', { patterns: [{ urlPattern: '*/app/shell.js*', requestStage: 'Request' }] });
    }
    await c.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/app.html` });
    let readyAt = null;
    if (late) {
      for (let i = 0; i < 400 && paused === null; i++) await sleep(50);
      if (paused === null) { fail(`${tag}: shell.js was never requested; the late arrival could not be staged`); return; }
      if (!(await waitFor(c, 'window.__test?.ready === true && window.__test?.holdCapped?.() === true', 400, 150))) {
        fail(`${tag}: with shell.js held, the boot never read ready with main's hold capped: `
          + JSON.stringify(await c.eval('({ ready: window.__test?.ready ?? null, capped: window.__test?.holdCapped?.() ?? null })').catch(() => null)));
        return;
      }
      readyAt = await c.eval('Math.round(performance.now())');
      await c.send('Fetch.continueRequest', { requestId: paused.requestId });
      paused = null;
      await c.send('Fetch.disable').catch(() => {});
    }
    if (!(await waitFor(c, 'window.__test?.ready === true', 400, 150))) { fail(`${tag}: the covered FRESH boot never became ready`); return; }
    if (!(await waitFor(c, LANDED, 200, 150))) { fail(`${tag}: the covered FRESH settle never landed at play`); return; }
    const g = await c.eval('window.__g3 ?? null');
    const cv = g?.cover?.vs ?? null;
    if (!g?.cover || g.cover.boot !== 'fresh' || !cv) {
      fail(`${tag}: no FRESH state read at the overlay's exit: ` + JSON.stringify(g));
      return;
    }
    if (g.wrappedAt === null || g.armedAt === null || g.wrappedAt > g.armedAt) {
      fail(`${tag}: the main renderer was not wrapped before the keys first stood joined: `
        + JSON.stringify({ wrappedAt: g.wrappedAt, armedAt: g.armedAt }));
    }
    if (rebake) {
      if (g.rebakedAt === null || !(g.unkeyedDraws > 0) || !g.stall || g.stall.keyed !== true) {
        fail(`${tag}: the planted re-bake did not leave the stall on the keyed draw: `
          + JSON.stringify({ rebakedAt: g.rebakedAt, unkeyedDraws: g.unkeyedDraws, stall: g.stall }));
      } else {
        console.log(`${tag} c OK: the re-bake planted at ${g.rebakedAt} ms drew ${g.unkeyedDraws} call(s) first, and the stall `
          + `(${g.stall.at}-${g.stall.end} ms) landed inside a keyed main-camera render`);
      }
    }
    // 1: joined dark under the overlay
    if (cv.keys !== 2 || !cv.keyIntensities.every((i) => i === 0) || !cv.camLayer1 || cv.keysCovered !== true) {
      fail(`${tag}: the keys were not joined dark with camera layer 1 on before the fade: ` + JSON.stringify(cv));
    } else console.log(`${tag} 1 OK: keys joined dark under the overlay (landed '${cv.keysStage}')`);
    // 2: the modelled cold first draw finished before the exit
    if (!g.stall || g.stall.end > g.exit) {
      fail(`${tag}: the first scene draw with the keys live (stalled ${STALL_MS} ms) had not finished when the overlay started to fade: `
        + JSON.stringify({ exit: g.exit, stall: g.stall, keysJoinedAt: g.armedAt, shellAt: g.shellAt }));
    } else {
      console.log(`${tag} 2 OK: the first scene draw with the keys live ran stalled ${g.stall.at}-${g.stall.end} ms, before the overlay's exit at ${g.exit} ms`);
    }
    // 3: a fence behind the stalled draw signalled before the exit
    if (!g.fenced || g.fenced.signalledAt > g.exit) {
      fail(`${tag}: no fence made after the stalled draw had signalled when the overlay started to fade: `
        + JSON.stringify({ exit: g.exit, stall: g.stall, fenced: g.fenced }));
    } else {
      console.log(`${tag} 3 OK: a fence made at ${g.fenced.madeAt} ms behind the stalled draw signalled at `
        + `${g.fenced.signalledAt} ms, before the overlay's exit at ${g.exit} ms`);
    }
    // 4: the shell's own record, as it stood at the exit
    const kd = cv.keysDraw ?? null;
    if (!kd || kd.how !== 'fenced' || !(kd.fencedAt <= g.exit)) {
      fail(`${tag}: the shell's covered draw with the keys was not fenced before the overlay's exit: `
        + JSON.stringify({ exit: g.exit, keysDraw: kd }));
    } else {
      console.log(`${tag} 4 OK: the shell saw the keys drawn at ${kd.drawnAt} ms and its fence (${kd.fenceAt} ms) signalled at `
        + `${kd.fencedAt} ms, before the overlay's exit at ${g.exit} ms`);
    }
    // 5: adopted by the fade-start open
    const after = await c.eval('window.__shell.visualState()');
    if (after.keysCovered !== false || after.keys !== 2 || after.keysChanges !== cv.keysChanges) {
      fail(`${tag}: the fade-start open did not adopt the pre-joined keys (a second change, or keys lost): `
        + JSON.stringify({ cover: cv, after }));
    } else console.log(`${tag} 5 OK: adopted by the fade-start open with no second change`);
    if (late) {
      // shellAt is the sampler's first rAF tick with the shell; an exit in that same tick still came with the overlay up
      if (!(g.shellAt !== null && g.shellAt > readyAt) || !(g.exit >= g.shellAt)) {
        fail(`${tag}: not the late arrival under the overlay: ` + JSON.stringify({ readyAt, shellAt: g.shellAt, exit: g.exit }));
      } else console.log(`${tag} late OK: ready and capped at ${readyAt} ms, shell landed at ${g.shellAt} ms, overlay exit at ${g.exit} ms`);
    }
    const appErrs = await c.eval('window.__test.errors.slice(0, 8)').catch(() => []);
    if (appErrs.length) fail(`${tag}: app errors: ` + JSON.stringify(appErrs));
    if (errs.length) fail(`${tag}: console errors: ` + errs.slice(0, 3).join(' | '));
  } finally {
    if (paused !== null) await c.send('Fetch.continueRequest', { requestId: paused.requestId }).catch(() => {});
    await c.closeAndWait();
  }
}

export async function armG3Cold(ctx) {
  await row('a', {}, ctx);
  await row('b', { late: true }, ctx);
  await row('c', { rebake: true }, ctx);
}

// ---- standalone (the red-proof runner; the gate imports armG3Cold above) ----
const isMain = () => { try { return fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } };
if (isMain()) {
  const webDir = process.env.OB_G3COLD_WEBDIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const PORT = Number(process.env.OB_E2E_PORT ?? 8178);
  const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 8830);
  const fail = (msg) => { console.error('E2E-SHELL FAIL:', msg); process.exitCode = 1; };
  const server = spawnStaticServer(webDir, PORT);
  await sleep(700);
  try { await armG3Cold({ PORT, CDP_PORT, fail }); } finally { await stopStaticServer(server); }
  console.log(process.exitCode ? 'E2E-SHELL-G3COLD FAIL' : 'E2E-SHELL-G3COLD PASS');
}
