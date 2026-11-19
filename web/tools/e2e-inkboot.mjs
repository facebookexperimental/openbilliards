// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-inkboot.mjs — GH-1244: the adaptive preview ink (previewink.js) kicks
// and resolves no readback through the boot overlay's fade. In Chrome every
// resolve is a synchronous GPU round trip (getBufferSubData blocks even after
// its fence signals; GH-1114 measured 137-190 ms per call under load), and
// GH-496's pre-latch gate samples on every hook frame, so the boot hold
// resolved readbacks right through the fade and the hall glide that starts
// with it. Since GH-1244 the module embargoes them from the first hook frame
// that sees #ob-boot carry ob-boot--out until the node has been gone 6 hook
// frames AND 1.0 s of render clock has passed after that frame, or 3.0 s in
// any case (the rules themselves run on a virtual clock in
// test-ink-embargo.mjs).
//
//   RIG (Page.addScriptToEvaluateOnNewDocument, per leg): the WebGL2
//   prototype's PBO readPixels counts as a kick and getBufferSubData as a
//   resolve (previewink is the only PBO / getBufferSubData user in the app);
//   on the stretched legs every resolve after __test.ready busy-waits 150 ms
//   (the GH-1114 p50), so each one is a long task on any host while the boot
//   itself stays fast; an rAF loop, registered first so it runs first in
//   every frame, stamps each frame's entry time and reads adaptiveInk()
//   (bootEmbargo, reason, active, staticFrozen) and __test.renderedFrames()
//   before main.js's step in that frame; a MutationObserver stamps the
//   overlay's ob-boot--out and its removal.
//   HOOK FRAMES: main.js runs the 'frame' hook only on a delivered frame
//   (renderedFrames grows), with dt = __test.frameTimes[k - 1] for the k-th
//   one, so the judge replays the embargo law over the delivered frames: it
//   starts at the first delivered frame at or after the one the class landed
//   in; its clock sums each later delivered frame's dt (clamped as the hook
//   clamps it); its end W is the first delivered frame with the node gone 6
//   delivered frames and that clock at 1.0 s, or with the clock at 3.0 s.
//   The module's own edges come from bootEmbargo: s = the frame before the
//   first one that reads it true, e = the frame before the first one that
//   reads it false again (the hook in e ends it and may kick).
//   Staging (a named UNJUDGEABLE red otherwise): the rig recorded frames, the
//   class was seen, the boot hold resolved within the 10 frames before the
//   class landed, and the ink had not latched by then, so the window has
//   something to stop. Each embargo leg then judges:
//     (a) it starts on the replayed start frame (or the next delivered one,
//         when the class lands after that frame's step);
//     (b) no kick and no resolve from the class landing to frame e;
//     (c) it ends where the law says: e within one delivered frame of W
//         (which frame first sees the node gone depends on whether the
//         transitionend or the 900 ms belt removed it);
//     (d) sampling resumes: the first kick after it lands within 3 delivered
//         frames of e;
//     (e) the ink goes live and static-frozen within 20 s of e;
//     (f) the first latch comes after e (the boot-settle hold keeps it off
//         while the embargo holds).
//   Legs (real-user boots, 1280x800, ?sw=0, the HTTP cache disabled; each
//   leg ends well inside the overlay driver's 120 s stall bound, which a
//   kept or detached node never stops):
//     L0 straight to aim, no stretch: (a)-(f), and the first latch's render
//        clock (inkTrace()[0].t) and frame count from the fade are printed;
//     L1 straight to aim, stretched: (a)-(f);
//     L2 a FRESH profile (the hall opens at the fade), stretched: (a)-(f);
//     L3 a stale overlay (the rig removes #ob-boot at DOMContentLoaded): no
//        embargo, and the sampler kicks before the ready flip, as before;
//     L4 a stuck fade (ob-boot--out held at opacity .5 with no transition, so
//        neither its transitionend nor the 900 ms belt removes it): (a)-(f),
//        the end coming from the 3.0 s cap.
//   Every leg prints an INKBOOT data line, including the replayed window's
//   counts (kicks and resolves from the class to W) for a planted comparison.
//
//   node web/tools/e2e-inkboot.mjs [--port 8256] [--legs L0,L1]
//   OB_INK_PLANT=<file> serves that file as app/previewink.js through CDP
//   Fetch (a plant never edits the tree under a run).
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import {
  launchChrome, sleep, spawnStaticServer, stopStaticServer,
} from './cdp.mjs';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const argOf = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
const PORT = Number(argOf('--port') ?? process.env.OB_E2E_PORT ?? 8256);
const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 16356);
const LEGS = (argOf('--legs') ?? 'L0,L1,L2,L3,L4').split(',');
const PLANT = process.env.OB_INK_PLANT ? fs.readFileSync(process.env.OB_INK_PLANT, 'utf8') : null;
// GH-410 port inventory (GH-687 lint law): one http server, one CDP client.
export const PORT_INVENTORY = { http: 1, cdp: 1 };
export const PORT_FLAGS = { '--port': 'http' };
const fail = (msg) => { console.error('E2E-INKBOOT FAIL:', msg); process.exitCode = 1; };
const W = 1280, H = 800;
const STRETCH_MS = 150;

// page-side, before any of the page's own scripts: nothing here may touch document.head / documentElement (both are
// null at document start); the optional DOM work waits for DOMContentLoaded and records its own errors
const RIG = (cfg) => `(() => {
  const CFG = ${JSON.stringify(cfg)};
  const R = window.__ib = { kicks: [], resolves: [], frames: [], seenAt: null, fadeAt: null, goneAt: null,
    readyAt: null, latch: null, err: [] };
  const P = WebGL2RenderingContext.prototype;
  const rp = P.readPixels, gbs = P.getBufferSubData;
  P.readPixels = function (...a) {
    if (this.getParameter(this.PIXEL_PACK_BUFFER_BINDING)) R.kicks.push(performance.now());
    return rp.apply(this, a);
  };
  P.getBufferSubData = function (...a) {
    const t0 = performance.now();
    if (CFG.stretchMs > 0 && window.__test?.ready === true) {
      while (performance.now() - t0 < CFG.stretchMs) { /* the resolve's measured cost */ }
    }
    const out = gbs.apply(this, a);
    R.resolves.push([t0, performance.now()]);
    return out;
  };
  let boot = null;
  const look = () => {
    const now = performance.now();
    if (!boot) { boot = document.getElementById('ob-boot'); if (boot) R.seenAt = now; }
    if (!boot) return;
    if (R.fadeAt === null && boot.classList.contains('ob-boot--out')) R.fadeAt = now;
    if (R.goneAt === null && !boot.isConnected) R.goneAt = now;
  };
  const loop = (now) => {
    const entry = performance.now();
    try { look(); } catch (e) { R.err.push('look: ' + e); }
    let a = null, rf = -1;
    try { a = window.__aim?.adaptiveInk?.() ?? null; } catch { a = null; }
    try { rf = window.__test?.renderedFrames?.() ?? -1; } catch { rf = -1; }
    R.frames.push([now, entry, a ? (a.bootEmbargo === true ? 1 : 0) : -1, a ? a.reason : '', a?.active ? 1 : 0, a?.staticFrozen ? 1 : 0, rf]);
    if (R.readyAt === null && window.__test?.ready === true) R.readyAt = entry;
    if (R.latch === null && a?.reason === 'live') {
      let t = null;
      try { t = window.__aim.inkTrace?.()[0]?.t ?? null; } catch { t = null; }
      R.latch = { frame: R.frames.length - 1, t };
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  try {
    new MutationObserver(look).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  } catch (e) { R.err.push('observer: ' + e); }
  document.addEventListener('DOMContentLoaded', () => {
    try {
      look();
      if (CFG.stale) document.getElementById('ob-boot')?.remove();
      if (CFG.stuck) {
        const st = document.createElement('style');
        st.textContent = '#ob-boot.ob-boot--out{transition:none!important;opacity:.5!important}';
        document.head.appendChild(st);
      }
    } catch (e) { R.err.push('dom: ' + e); }
  }, { once: true });
})()`;

/** the leg's verdict rows and its data line, from the rig's record and main.js's frame times */
function judge(tag, ib, frameTimes, { embargo, stale }) {
  const F = ib.frames;
  if (!F.length) return { rows: [[`${tag} UNJUDGEABLE: the rig recorded no frames (${ib.err.join(' | ') || 'no error recorded'})`, false]], data: null };
  const entry = (i) => (i >= 0 && i < F.length ? F[i][1] : Infinity);
  const frameOf = (t) => { // the frame whose [entry, next entry) holds t
    if (t === null) return -1;
    for (let i = F.length - 1; i >= 0; i--) if (F[i][1] <= t) return i;
    return -1;
  };
  const count = (ts, tA, tB) => ts.filter((t) => t >= tA && t < tB).length;
  // frame f was delivered (main.js ran the hook in it) when renderedFrames grew across it; k = its delivered number
  const delivered = (f) => f >= 0 && f + 1 < F.length && F[f][6] >= 0 && F[f + 1][6] > F[f][6];
  const nextDelivered = (f) => { for (let i = Math.max(0, f); i < F.length; i++) if (delivered(i)) return i; return -1; };
  const deliveredBetween = (a, b) => { let n = 0; for (let i = a + 1; i <= b; i++) if (delivered(i)) n++; return n; };
  const dtcOf = (f) => Math.min(0.1, Math.max(0.001, (frameTimes[F[f + 1][6] - 1] ?? 1000 / 60) / 1000));
  const kicks = ib.kicks, resolves = ib.resolves.map((r) => r[0]);
  const X = frameOf(ib.fadeAt), G = frameOf(ib.goneAt);
  // the law replayed over the delivered frames (the module's own definition, see the header)
  const sD = X >= 0 ? nextDelivered(X) : -1;
  let Wd = -1;
  if (sD >= 0) {
    let clock = 0, gone = 0;
    for (let f = sD + 1; f < F.length; f++) {
      if (!delivered(f)) continue;
      clock += dtcOf(f);
      gone = G >= 0 && f > G ? gone + 1 : 0;
      if ((gone >= 6 && clock + 1e-9 >= 1.0) || clock + 1e-9 >= 3.0) { Wd = f; break; }
    }
  }
  const f1 = F.findIndex((f) => f[2] === 1);
  const f2 = f1 < 0 ? -1 : F.findIndex((f, i) => i > f1 && f[2] === 0);
  const s = f1 - 1, e = f2 - 1;
  const latchFrame = ib.latch ? ib.latch.frame : -1;
  const firstKick = f2 > 0 ? kicks.find((t) => t >= entry(e)) : undefined;
  const data = {
    fadeFrame: X, goneFrame: G, replayed: sD < 0 ? null : [sD, Wd], embargo: f1 < 0 ? null : [s, e],
    kicksW: X >= 0 && Wd >= 0 ? count(kicks, ib.fadeAt, entry(Wd + 1)) : null,
    resolvesW: X >= 0 && Wd >= 0 ? count(resolves, ib.fadeAt, entry(Wd + 1)) : null,
    longW: X >= 0 && Wd >= 0 ? ib.resolves.filter(([a, b]) => a >= ib.fadeAt && a < entry(Wd + 1) && b - a >= 100).length : null,
    resolvesNearFade: X >= 0 ? count(resolves, entry(Math.max(0, X - 10)), ib.fadeAt) : null,
    kicksIn: X >= 0 && f2 > 0 ? count(kicks, ib.fadeAt, entry(e)) : null,
    resolvesIn: X >= 0 && f2 > 0 ? count(resolves, ib.fadeAt, entry(e)) : null,
    firstKickAfter: firstKick === undefined ? null : deliveredBetween(e, frameOf(firstKick)),
    latch: ib.latch ? { tClock: ib.latch.t, frame: latchFrame, framesFromFade: X >= 0 ? latchFrame - X : null } : null,
    frames: F.length, rigErrors: ib.err,
  };
  console.log(`INKBOOT ${tag} data ${JSON.stringify(data)}`);
  const rows = [];
  if (ib.err.length) rows.push([`${tag}: the rig ran without errors (${ib.err.join(' | ')})`, false]);
  if (stale) {
    rows.push([`${tag}: no #ob-boot at the module's first hook frame means no embargo`, f1 < 0 && F.some((f) => f[2] === 0)]);
    rows.push([`${tag}: the sampler kicks before the ready flip, as before`, ib.readyAt !== null && (kicks[0] ?? Infinity) < ib.readyAt]);
    rows.push([`${tag}: the ink goes live`, F.some((f) => f[4] === 1)]);
    return { rows, data };
  }
  if (!embargo) return { rows, data };
  if (X < 0) return { rows: [...rows, [`${tag} UNJUDGEABLE: no ob-boot--out was seen`, false]], data };
  if (!(data.resolvesNearFade >= 1) || (latchFrame >= 0 && latchFrame <= X)) {
    return { rows: [...rows, [`${tag} UNJUDGEABLE: the boot hold was not sampling at the fade (${data.resolvesNearFade} resolves in the 10 frames before it, first latch at frame ${latchFrame}, the class in frame ${X})`, false]], data };
  }
  rows.push([`${tag} (a): the embargo starts on the replayed start frame (frame ${s}; replayed ${sD}, the class in frame ${X})`,
    f1 > 0 && sD >= 0 && (s === sD || s === nextDelivered(sD + 1))]);
  rows.push([`${tag} (b): no kick and no resolve from the fade to its end (${data.kicksIn} kicks, ${data.resolvesIn} resolves before frame ${e})`,
    f2 > 0 && data.kicksIn === 0 && data.resolvesIn === 0]);
  rows.push([`${tag} (c): it ends where the law says (end frame ${e}, replayed ${Wd})`,
    f2 > 0 && Wd >= 0 && deliveredBetween(Math.min(e, Wd), Math.max(e, Wd)) <= 1]);
  rows.push([`${tag} (d): sampling resumes within 3 delivered frames of its end (first kick +${data.firstKickAfter})`,
    data.firstKickAfter !== null && data.firstKickAfter <= 3]);
  const liveAt = f2 > 0 ? F.findIndex((f, i) => i >= f2 && f[4] === 1 && f[5] === 1) : -1;
  rows.push([`${tag} (e): the ink goes live and static-frozen within 20 s of the end`, liveAt >= 0 && entry(liveAt) - entry(e) <= 20000]);
  rows.push([`${tag} (f): the first latch comes after the embargo (latch read in frame ${latchFrame}, end frame ${e})`,
    f2 > 0 && latchFrame > e + 1]);
  return { rows, data };
}

const LEG = {
  L0: { label: 'straight to aim, no stretch', cfg: { stretchMs: 0 }, shell: 'aim', embargo: true },
  L1: { label: 'straight to aim, 150 ms resolves', cfg: { stretchMs: STRETCH_MS }, shell: 'aim', embargo: true },
  L2: { label: 'FRESH profile (the hall opens at the fade), 150 ms resolves', cfg: { stretchMs: STRETCH_MS }, shell: 'fresh', embargo: true },
  L3: { label: 'stale overlay (#ob-boot removed at DOMContentLoaded)', cfg: { stretchMs: 0, stale: true }, shell: 'aim', stale: true },
  L4: { label: 'stuck fade (held at opacity .5, never removed)', cfg: { stretchMs: 0, stuck: true }, shell: 'aim', embargo: true },
};

const server = spawnStaticServer(webDir, PORT);
let chrome = null;
const consoleErrors = [];
try {
  await sleep(700);
  chrome = await launchChrome(`http://127.0.0.1:${PORT}/`, { port: CDP_PORT, width: W, height: H, tool: false });
  chrome.onEvent((method, params) => {
    if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
      consoleErrors.push(params.args.map((a) => a.value ?? a.description).join(' '));
    } else if (method === 'Runtime.exceptionThrown') {
      consoleErrors.push(params.exceptionDetails.exception?.description ?? params.exceptionDetails.text);
    } else if (method === 'Fetch.requestPaused') {
      if (PLANT && /\/app\/previewink\.js(\?|$)/.test(params.request.url)) {
        chrome.send('Fetch.fulfillRequest', { requestId: params.requestId, responseCode: 200,
          responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }, { name: 'Cache-Control', value: 'no-store' }],
          body: Buffer.from(PLANT).toString('base64') }).catch(() => {});
      } else chrome.send('Fetch.continueRequest', { requestId: params.requestId }).catch(() => {});
    }
  });
  await chrome.send('Network.enable');
  await chrome.send('Network.setCacheDisabled', { cacheDisabled: true });
  if (PLANT) {
    await chrome.send('Fetch.enable', { patterns: [{ urlPattern: '*previewink.js*' }] });
    console.log(`[inkboot] serving ${process.env.OB_INK_PLANT} as app/previewink.js`);
  }
  const until = async (expr, { ms = 30000 } = {}) => {
    const t0 = Date.now();
    for (;;) {
      if (await chrome.eval(expr).catch(() => false)) return true;
      if (Date.now() - t0 >= ms) return false;
      await sleep(100);
    }
  };
  for (const id of LEGS) {
    const leg = LEG[id];
    if (!leg) { fail(`unknown leg ${id}`); continue; }
    const tag = `P1244 ${id} ${leg.label}`;
    // the leg's storage, set on the app origin before its navigation
    const shellState = leg.shell === 'aim' ? JSON.stringify({ v: 1, lastPlace: 'play', startAtTable: true }) : null;
    await chrome.eval(`(localStorage.clear(), sessionStorage.clear(), ${shellState ? `localStorage.setItem('ob-shell-v1', ${JSON.stringify(shellState)}), ` : ''}true)`);
    const { identifier } = await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: RIG(leg.cfg) });
    try {
      await chrome.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/app.html?seed=1&sw=0&u=ib-${id}` });
      await sleep(500);
      if (!(await until('window.__test?.ready === true', { ms: 120000 }))) { fail(`${tag}: the boot never reached ready`); continue; }
      if (leg.stale) {
        await until(`(window.__ib?.frames ?? []).some((f) => f[4] === 1)`, { ms: 30000 });
      } else {
        // the fade, then the module's own end (an old module never reports one: bounded), then the live + frozen ink
        await until('window.__ib?.fadeAt !== null', { ms: 30000 });
        await until(`(() => { const F = window.__ib.frames; const i = F.findIndex((f) => f[2] === 1); return i >= 0 && F.some((f, j) => j > i && f[2] === 0); })()`, { ms: 15000 });
        await until(`(window.__ib?.frames ?? []).some((f) => f[4] === 1 && f[5] === 1)`, { ms: 25000 });
      }
      await sleep(300);
      const ib = await chrome.eval('window.__ib');
      const frameTimes = await chrome.eval('Array.from(window.__test?.frameTimes ?? [])').catch(() => []);
      if (!ib) { fail(`${tag}: no rig record`); continue; }
      const { rows } = judge(tag, ib, frameTimes, leg);
      for (const [name, ok] of rows) {
        if (ok) console.log(`OK ${name}`);
        else fail(name);
      }
    } finally {
      await chrome.send('Page.removeScriptToEvaluateOnNewDocument', { identifier }).catch(() => {});
    }
  }
  if (consoleErrors.length) fail(`console errors: ${consoleErrors.slice(0, 3).join(' | ')}`);
} catch (e) {
  fail(String(e?.stack ?? e).slice(0, 400));
} finally {
  try { await chrome?.closeAndWait(); } catch { /* gone */ }
  await stopStaticServer(server);
}
console.log(process.exitCode ? 'E2E-INKBOOT FAIL' : 'E2E-INKBOOT PASS');
