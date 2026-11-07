// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-switchperf.mjs — game/table-switch resource gate (build 20 perf audit).
// Cycles the active game between two tables with different GI bake classes
// (8-ball on the 9-ft pool table ↔ snooker on the 12-ft table) through the
// card commit path (__settings.changeGame(id, { skipConfirm: true }) =
// set('game') + rerack) and judges what each switch leaves behind:
//
//   arms:
//   G1 (GH-968) live GI lightmap textures stay bounded across cycles. An
//      INDEPENDENT registry counts them: the renderer adds a 'dispose'
//      listener to a texture on its first upload and dispose() removes it,
//      so a hook on EventDispatcher.prototype.add/removeEventListener('dispose')
//      sees every live texture; GI maps are the ones whose image came from
//      /assets/gi/. Pre-fix every switch added four and released none.
//   G2 (GH-968) renderer.info.memory.textures at a revisit of the same table
//      does not grow between the second and the third cycle. Every census is
//      taken once the renderer is quiet (QUIET: no texture upload for 30
//      frames and 1 s), since three.js uploads a texture on its first render.
//   G3 (GH-968) a switch back to a table re-uses its cached lightmaps: no
//      lightmap image load starts during a revisit. A document-start hook on
//      the HTMLImageElement src setter counts every image load of a
//      /assets/gi/*.png (TextureLoader creates an <img> per load; the network
//      log cannot be the instrument, Blink's memory cache serves repeats
//      without a request).
//   G4 and G5 run on the pool table over 4 lightmap sets, one more than the
//      cache's 3-set cap: 2 looks (the boot look and the live registry's other
//      one) x 2 fixtures (the boot fixture and one other fixture baked for both
//      looks), each named by the manifest entry gi.js resolves (GI_SETS below;
//      never by literal: batch 3 renamed the regraded look and its lightmap
//      files, and left one baked non-canopy pool fixture).
//   G4 (GH-968, review r1) the lightmap cache stays within its 3-set cap when
//      applies overlap: the three non-boot applies' lightmap requests are HELD
//      (CDP Fetch; the last of them is REJECTED: its plan request fails) while
//      a newer apply of the cached boot set binds first, then the held ones
//      are released — after everything settles __gi.texCacheState() holds <= 3
//      sets.
//   G5 (GH-968, review r2) a set is never released between its last load and
//      its bind: with the boot set bound, the <boot look>/<other fixture> and
//      <other look>/<other fixture> applies are HELD and the <other look>/<boot
//      fixture> apply, requested last, finishes FIRST. No GI
//      texture is disposed before the apply that requested it binds: a hook on
//      Texture.prototype.dispose marks disposed lightmaps, and none may be
//      bound or uploaded afterwards (a texture disposed before its first
//      upload has no renderer listener to lose, so the dispose itself is the
//      instrument); and every live GI texture is one the cache owns.
//   H1 (GH-969, review r2) a bake waiting for a frame when the document hides
//      completes on the timer chain: a fresh boot, requestAnimationFrame
//      stubbed to never fire, the first snooker entry, then visibilitychange
//      to hidden; window.__snkOccl.pending() must reach 0. (Runs last in its
//      document: the stub also stops the app's own frame loop.)
//   D1 (GH-969) the snooker occlusion bake lands at most one slice per
//      animation frame. A document-start hook wraps window.setTimeout and
//      stamps every run of a callback named _snkOcclDrain with the index of
//      the last animation frame (its own rAF counter); two runs inside one
//      frame interval are the defect (the old setTimeout(0) chain ran slices
//      back to back, so a frame carried up to 12 of them).
//   D2 (GH-969) the bake still lands: slices ran, and every snooker switch
//      settles (window.__snkOccl pending 0) inside its wait.
//   D1, D2 and H1 judge the runtime bake, which since GH-1131 runs only when
//      the shipped snooker transport is unavailable: their documents block
//      web/scene/snktransport-data.js (table.js logs
//      SNK_TRANSPORT_ARTIFACT_MISSING and bakes at runtime), and D2 requires
//      the census to show the block took.
//   S1 (GH-1131) with the shipped transport a snooker switch attaches every
//      occlusion job at once: in a fresh document with nothing blocked, when
//      changeGame('snooker') resolves pending() is 0 and every leg carries
//      aOccl; no drain slice runs; window.__snkOccl.shipped() reports the
//      artifact loaded, with hits and no miss. H1 is its control: the same
//      read without the artifact finds jobs pending. (Runs after H1.)
//   S2 (GH-1131) a real-user snooker BOOT with the shipped transport is fully
//      baked at ready: main.js awaits the transport before it builds, so at
//      __test.ready the snooker table is active, pending() is 0, every leg
//      carries aOccl, no drain slice ran, and the census reports the artifact
//      loaded with hits and no miss. The settings are seeded on a page of the
//      origin that runs no app code (README.md), then app.html?obtool=0 boots
//      them (every other arm boots the scripted pin table). (Runs after S1.)
//      GH-1170: a transport slower than table.js's bound sends S1's switch or
//      S2's boot to the runtime bake (shipped().timeouts > 0); either then
//      fails as UNJUDGEABLE, named SNK_TRANSPORT_ARTIFACT_TIMEOUT.
//   B1 (GH-979) a re-rack links at most a handful of ball programs (one per
//      ball variant), never one per ball: every switch re-racks, and the
//      program key used to carry the ball index (16 links on 8-ball). A
//      positive control requires the instrument to see ball programs at all.
//   S3 and C1 (GH-1170) a held transport never hangs a build. Each arm holds
//      the transport's own requests by CDP Fetch (counted per URL: none caught
//      is UNJUDGEABLE), with the HTTP cache off and the service worker
//      bypassed (all six transport files are precached), and judges against
//      wall-clock deadlines. The boots are scripted (?obtool=1 with ?table=)
//      so that the planted reds below reach them.
//      S3 boot: a snooker boot with snktransport-data.js held reaches ready
//        on the runtime bake after ONE 8 s bound (the boot's two waits share
//        it: timeouts === 1), with the request still held; released, the map
//        is held as late (not installed: no build is waiting for it).
//      S3 switch: a snooker switch with the data module held resolves on the
//        runtime bake after the bound. S3 late map: released while that
//        build's runtime bake still runs, the map lands held (late, not
//        loaded) and the timed-out build keeps hits 0 through its bake; the
//        next snooker build in the document (?obArm=table-cache-off, so the
//        revisit populates) takes it at once: hits > 0, misses 0, none
//        pending. (A snooker build is one synchronous task and the runtime
//        bake never reads the shipped map, so the late clause is the gate's
//        state: the map waits for the next build boundary.)
//      S3 return: after a snooker switch gave up and built on the runtime
//        bake, a Chinese-8 switch pends behind its held transport; the return
//        to the displayed snooker table rebuilds nothing, so it resolves well
//        inside the snooker bound, READY, with no second TIMEOUT.
//      C1: a Chinese-8 boot with cn8transport.js held is refused with
//        CN8_TRANSPORT_TIMEOUT at the bound (?obArm=cn8-transport-bound-short:
//        6 s instead of 240 s), named in the error card; a Chinese-8 switch
//        while it is still held is refused again at a fresh bound (the switch
//        site); released, the landed module serves the next Chinese-8 build
//        without a reload (the timeout never latches).
//      OB_SWITCHPERF_PLANT=<arm> appends ?obArm=<arm> to these boots only:
//        transport-unbounded (S3 boot, S3 switch and C1 go red),
//        snk-late-map-on-arrival (S3 late map goes red), cn8-timeout-latch
//        (C1 goes red).
//
//   node web/tools/e2e-switchperf.mjs [--port 8299]  (needs Chrome + node>=22)
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launchChrome, sleep, spawnStaticServer, stopStaticServer } from './cdp.mjs';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const argOf = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
// suite-unique verified-free ports (parallel-worktree law)
const PORT = Number(argOf('--port') ?? process.env.OB_E2E_PORT ?? 8299);
const CDP = Number(process.env.OB_E2E_CDP_PORT ?? 16399);
// GH-410 port inventory: this suite launches one Chrome (CDP +0) and one http server (+0).
export const PORT_INVENTORY = { http: 1, cdp: 1 };
export const PORT_FLAGS = { '--port': 'http' };
const APP_URL = `http://127.0.0.1:${PORT}/app.html?seed=1`;
// GH-1131: the shipped snooker transport's data module, blocked for the runtime-bake arms (D1, D2, H1)
const SNK_TRANSPORT_DATA = '*snktransport-data.js*';
// GH-1170: the held-transport arms (S3, C1) boot scripted with a table; a planted red rides on those boots only
const PLANT = process.env.OB_SWITCHPERF_PLANT || null;
const ARM_URL = (q) => `http://127.0.0.1:${PORT}/app.html?seed=1&obtool=1${q}${PLANT ? `&obArm=${PLANT}` : ''}`;
const SNK_BOUND_MS = 8000, CN8_SHORT_BOUND_MS = 6000; // table.js SNK_TRANSPORT_BOUND_MS / CN8_TRANSPORT_BOUND_SHORT_MS
const ARM_BOOT_MS = 90000; // a held-transport boot must reach ready inside the suite's own boot wait
const fail = (msg) => { console.error('E2E-SWITCHPERF FAIL:', msg); process.exitCode = 1; };
const check = (name, ok, detail = '') => {
  if (ok) console.log('[e2e-switchperf] PASS', name, detail ? `(${detail})` : '');
  else fail(`${name}${detail ? ' — ' + detail : ''}`);
};

const server = spawnStaticServer(webDir, PORT);
await sleep(700);
const chrome = await launchChrome(APP_URL, { port: CDP });
const consoleErrors = [];
// G4 lightmap request control: held request ids per set tag, failures by tag
const gate = { hold: [], failTag: null, holdTags: [], seen: [] };
// GH-1170 transport holds: the files held, the held request ids, and the count per file; the named timeout lines
const tx = { files: [], held: [], counts: {}, warns: [] };
chrome.onEvent((method, params) => {
  if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
    consoleErrors.push(params.args.map((a) => a.value ?? a.description).join(' '));
  }
  if (method === 'Runtime.consoleAPICalled' && params.type === 'warning') {
    const text = params.args.map((a) => a.value ?? a.description).join(' ');
    if (/(SNK_TRANSPORT_ARTIFACT|CN8_TRANSPORT)_TIMEOUT/.test(text)) tx.warns.push(text);
  }
  if (method === 'Fetch.requestPaused' && /\/scene\/(?:snk|cn8)transport[^/?#]*\.js/.test(params.request?.url ?? '')) {
    const file = params.request.url.match(/\/scene\/((?:snk|cn8)transport[^/?#]*\.js)/)[1];
    if (tx.files.includes(file)) { tx.held.push(params.requestId); tx.counts[file] = (tx.counts[file] ?? 0) + 1; }
    else chrome.send('Fetch.continueRequest', { requestId: params.requestId }).catch(() => {});
    return;
  }
  if (method === 'Fetch.requestPaused') {
    const file = (params.request?.url ?? '').replace(/^.*\/assets\/gi\//, '');
    gate.seen.push(file);
    const tagOf = (f) => f.replace(/-(plan|flank|floor|floorshadow)\.png$/, '');
    const tag = tagOf(file);
    if (gate.failTag && tag === gate.failTag && /-plan\.png$/.test(file)) {
      chrome.send('Fetch.failRequest', { requestId: params.requestId, errorReason: 'Failed' }).catch(() => {});
    } else if (gate.holdTags.includes(tag)) gate.hold.push(params.requestId);
    else chrome.send('Fetch.continueRequest', { requestId: params.requestId }).catch(() => {});
  }
});

const waitFor = async (expr, ms, what) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await chrome.eval(expr).catch(() => false)) return true;
    await sleep(150);
  }
  const state = await chrome.eval(`(async () => { const s = window.__settings?.get?.(); const t = await import('/scene/table.js');
    const gi = window.__gi?.state; return { game: s?.game, equipment: s?.equipment?.table_id, built: t.activeTableId?.(),
    gi: gi && { ready: gi.ready, applied: gi.appliedSeq, apply: gi.applySeq }, occl: window.__snkOccl?.pending?.() ?? null }; })()`).catch((e) => String(e));
  throw new Error(`timed out waiting for ${what}; state ${JSON.stringify(state)}`);
};

// GH-1170: a wall-clock deadline that answers instead of throwing (a held-transport arm names its own red)
const until = async (expr, ms) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await chrome.eval(expr).catch(() => false)) return true;
    await sleep(150);
  }
  return false;
};
// hold the named transport files (and nothing else) with the HTTP cache off and the service worker bypassed
const txHold = async (files) => {
  Object.assign(tx, { files, held: [], counts: {}, warns: [] });
  await chrome.send('Network.setCacheDisabled', { cacheDisabled: true });
  await chrome.send('Network.setBypassServiceWorker', { bypass: true });
  await chrome.send('Fetch.enable', { patterns: files.map((f) => ({ urlPattern: `*/scene/${f}*`, requestStage: 'Request' })) });
};
// stop holding first: a released module's own imports (cn8transport.js -> cn8transport-data.js) must pass
const txRelease = async () => {
  tx.files = [];
  for (const id of tx.held.splice(0)) await chrome.send('Fetch.continueRequest', { requestId: id }).catch(() => {});
};
const txOff = async () => {
  await txRelease();
  await chrome.send('Fetch.disable').catch(() => {});
  await chrome.send('Network.setBypassServiceWorker', { bypass: false });
  await chrome.send('Network.setCacheDisabled', { cacheDisabled: false });
};
const TX_SNK = `(async () => { const t = await import('/scene/table.js');
  return { table: t.activeTableId?.() ?? null, sw: !!navigator.serviceWorker?.controller, pending: window.__snkOccl?.pending?.() ?? null,
    slices: window.__obDrainRuns?.runs?.length ?? null, shipped: window.__snkOccl?.shipped?.() ?? null, s3: window.__s3 ?? null }; })()`;
const TX_CN8 = `(async () => { const t = await import('/scene/table.js'); const g = window.__dbg?.scene?.getObjectByName('obTable');
  const id = t.activeTableId?.() ?? null;
  return { table: id, style: id ? t.TABLE_SPECS?.[id]?.render?.style ?? null : null, sw: !!navigator.serviceWorker?.controller,
    status: window.__tableBuild?.status?.() ?? null, refusal: g?.userData?.cn8TransportRefusal ?? null,
    card: document.getElementById('err')?.textContent ?? '', game: window.__settings?.get?.()?.game ?? null, c1: window.__c1 ?? null }; })()`;
// start a game switch without awaiting it in the page (a hung switch must not hang the CDP call); its outcome lands in window[slot]
const startSwitch = (slot, game) => chrome.eval(`(window.${slot} = null, (() => { const t0 = performance.now();
  void window.__settings.changeGame(${JSON.stringify(game)}, { skipConfirm: true })
    .then((v) => { window.${slot} = { v, ms: performance.now() - t0 }; }, (e) => { window.${slot} = { err: String(e?.message ?? e), ms: performance.now() - t0 }; }); })(), true)`);

// a switch is complete when the game committed, the scene table is the
// equipment's table, the GI apply that the switch started has finished, the
// snooker occlusion bake has landed, and two frames were delivered after that
const SETTLED = (g) => `(async () => {
  const s = window.__settings?.get?.(); if (!s || s.game !== ${JSON.stringify(g)}) return false;
  const t = await import('/scene/table.js'); if (t.activeTableId?.() !== s.equipment?.table_id) return false;
  const gi = window.__gi?.state; if (!gi || !gi.ready || gi.appliedSeq !== gi.applySeq) return false;
  if ((window.__snkOccl?.pending?.() ?? 0) !== 0) return false;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  return true;
})()`;

// three.js uploads a texture on its first render, which can come frames after SETTLED: on the batch-3 tree one snooker
// canvas texture did, and a census taken at once read the renderer one texture short at random (G2: 110 then 111).
// QUIET resolves true once renderer.info.memory.textures has not changed for 30 frames and 1 s (false: still changing
// after 240 frames; the caller's waitFor retries and finally times out).
const QUIET = `(async () => {
  const mem = window.__dbg?.renderer?.info?.memory; if (!mem) return false;
  let last = mem.textures, frames = 0, t = performance.now();
  for (let i = 0; i < 240; i++) {
    await new Promise((r) => requestAnimationFrame(r));
    if (mem.textures !== last) { last = mem.textures; frames = 0; t = performance.now(); continue; }
    if (++frames >= 30 && performance.now() - t >= 1000) return true;
  }
  return false;
})()`;

const REGISTRY = `(async () => {
  const THREE = await import('three');
  const ED = THREE.EventDispatcher.prototype;
  if (ED.__obSwitchperfReg) return 'already';
  const live = window.__obSwitchperfTex = new Set();
  // G5: GI textures disposed by their owner (marked at dispose(), uploaded or not), and uploads of one of them
  const gone = window.__obSwitchperfGone = new WeakSet(); const isGi = (t) => /\\/assets\\/gi\\//.test(t.image?.src ?? '');
  window.__obSwitchperfReup = { n: 0, files: [] };
  const dispose = THREE.Texture.prototype.dispose;
  THREE.Texture.prototype.dispose = function () { if (isGi(this)) gone.add(this); return dispose.call(this); };
  const add = ED.addEventListener, rm = ED.removeEventListener;
  ED.addEventListener = function (type, fn) {
    if (type === 'dispose' && this.isTexture) {
      if (gone.has(this)) { window.__obSwitchperfReup.n++; window.__obSwitchperfReup.files.push(this.image.src.replace(/^.*\\/assets\\/gi\\//, '')); }
      live.add(this);
    }
    return add.call(this, type, fn);
  };
  ED.removeEventListener = function (type, fn) { if (type === 'dispose' && this.isTexture) live.delete(this); return rm.call(this, type, fn); };
  ED.__obSwitchperfReg = true;
  return 'installed';
})()`;
const CENSUS = `(() => {
  let gi = 0;
  for (const t of window.__obSwitchperfTex) if (/\\/assets\\/gi\\//.test(t.image?.src ?? '')) gi++;
  return { gi, live: window.__obSwitchperfTex.size, gl: window.__dbg?.renderer?.info?.memory?.textures ?? null,
    cache: window.__gi?.texCacheState?.() ?? null };
})()`;

// G4/G5 lightmap sets, derived and never named by literal (batch 3: GH-973 renamed the regraded look to 'tournament' and
// its lightmap files with it, the old id staying a legacy alias; GH-975 un-baked the pool ring, leaving the canopy and one
// other baked pool fixture). The looks are the boot look and the other entry of the live registry (scene/look.js LOOKS),
// which is what gi.state.look reads after setLook. The fixtures are the boot fixture and the first other one baked for
// both looks. Each set's tag is the file stem of the manifest entry gi.js requests for it (entryFor on the pool class:
// canopy_panel -> manifest.looks[look], another fixture -> manifest.fixtures[f].looks[look], unbaked entries skipped),
// which is what the Fetch gate compares against.
const GI_SETS = `(async () => {
  const { LOOKS } = await import('/scene/look.js');
  const gi = window.__gi.state, mf = gi.manifest;
  const stem = (look, fix) => { const e = fix === 'canopy_panel' ? mf?.looks?.[look] : mf?.fixtures?.[fix]?.looks?.[look];
    return e && !e.unbaked && e.files?.plan ? e.files.plan.replace(/-plan\\.png$/, '') : null; };
  const A = gi.look, B = LOOKS.find((l) => l !== A) ?? null, F0 = gi.fixture;
  const P = ['canopy_panel', ...Object.keys(mf?.fixtures ?? {})].find((f) => f !== F0 && stem(A, f) && stem(B, f)) ?? null;
  const tags = {}; for (const l of [A, B]) for (const f of [F0, P]) tags[l + '|' + f] = stem(l, f);
  return { cls: gi.bakeClass, registry: LOOKS, A, B, F0, P, tags };
})()`;
const giSets = async (arm) => {
  const s = await chrome.eval(GI_SETS);
  if (s.cls !== 'pool' || !s.B || !s.P || Object.values(s.tags).some((t) => !t)) {
    throw new Error(`${arm}: the registry and manifest do not give 2 looks x 2 baked pool fixtures: ${JSON.stringify(s)}`);
  }
  console.log(`[e2e-switchperf] ${arm} sets: looks ${s.A} / ${s.B} (registry ${s.registry.join(', ')}), fixtures ${s.F0} / ${s.P},`
    + ` tags ${Object.values(s.tags).join(', ')}`);
  return { ...s, tag: (look, fix) => s.tags[`${look}|${fix}`] };
};

// D1 instrument (document start, before any app module): an animation-frame counter and a setTimeout wrapper
// that stamps each _snkOcclDrain run with the frame index it ran in
const DRAIN_HOOK = `(() => {
  const D = window.__obDrainRuns = { frame: 0, runs: [] };
  const tick = () => { D.frame++; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  // G3 instrument: every lightmap image load (TextureLoader sets <img>.src once per load)
  const G = window.__obGiLoads = [];
  const srcDesc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
  Object.defineProperty(HTMLImageElement.prototype, 'src', { configurable: true, enumerable: srcDesc.enumerable,
    get() { return srcDesc.get.call(this); },
    set(v) { if (/\\/assets\\/gi\\/[^?]*\\.png/.test(String(v))) G.push(String(v).replace(/^.*\\/assets\\/gi\\//, '')); srcDesc.set.call(this, v); } });
  const st = window.setTimeout;
  window.setTimeout = function (fn, ms, ...rest) {
    if (typeof fn === 'function' && fn.name === '_snkOcclDrain') {
      const wrapped = function () { D.runs.push(D.frame); return fn.apply(this, arguments); };
      return st.call(this, wrapped, ms, ...rest);
    }
    return st.call(this, fn, ms, ...rest);
  };
})();`;

try {
  await chrome.send('Network.enable');
  await chrome.send('Network.setBlockedURLs', { urls: [SNK_TRANSPORT_DATA] }); // until S1: the runtime bake for D1, D2 and H1
  await chrome.send('Page.addScriptToEvaluateOnNewDocument', { source: DRAIN_HOOK });
  await chrome.send('Page.reload', { ignoreCache: false });
  await sleep(500);
  await waitFor('window.__test?.ready === true && !!window.__settings && !!window.__gi', 90000, 'boot ready');
  // a tool boot builds the scripted pin table (not the settings table), so the boot settle reads GI + occlusion only
  await waitFor(`(() => { const gi = window.__gi?.state; return !!gi && gi.ready && gi.appliedSeq === gi.applySeq
    && (window.__snkOccl?.pending?.() ?? 0) === 0; })()`, 60000, 'boot settle');
  console.log('[e2e-switchperf] registry', await chrome.eval(REGISTRY));

  const SEQ = ['eight_ball', 'snooker', 'eight_ball', 'snooker', 'eight_ball', 'snooker', 'eight_ball'];
  const rows = [];
  for (let i = 0; i < SEQ.length; i++) {
    const g = SEQ[i];
    const req0 = await chrome.eval('window.__obGiLoads.length');
    const progs0 = await chrome.eval('window.__dbg.renderer.info.programs.map((p) => p.id)');
    const ok = await chrome.eval(`window.__settings.changeGame(${JSON.stringify(g)}, { skipConfirm: true })`);
    if (ok !== true) throw new Error(`changeGame(${g}) returned ${ok}`);
    await waitFor(SETTLED(g), 300000, `switch ${i} to ${g}`); // the frame-paced occlusion bake (GH-969) lands slower on a loaded box
    await waitFor(QUIET, 60000, `switch ${i} to ${g}: texture uploads quiet`);
    const c = await chrome.eval(CENSUS);
    const loads = await chrome.eval(`window.__obGiLoads.slice(${req0})`);
    const ballLinks = await chrome.eval(`(() => { const before = new Set(${JSON.stringify(progs0)});
      return window.__dbg.renderer.info.programs.filter((p) => !before.has(p.id) && /spikeball/.test(p.cacheKey)).length; })()`);
    rows.push({ i, g, ...c, giLoads: loads, ballLinks });
    console.log(`[e2e-switchperf] switch ${i} -> ${g}: live GI textures ${c.gi}, registry ${c.live}, renderer textures ${c.gl}, `
      + `GI image loads ${loads.length}, new ball programs ${ballLinks}, cache ${JSON.stringify(c.cache && { urls: c.cache.urls, sets: c.cache.sets.length })}`);
  }

  // G1: bounded. Two bake sets are in play (pool + snooker), four maps each.
  const maxGi = Math.max(...rows.map((r) => r.gi));
  check('G1 live GI lightmap textures stay bounded across 7 bake-class switches', maxGi <= 8,
    `max ${maxGi}, per switch ${rows.map((r) => r.gi).join(' ')}`);
  check('G1 live GI lightmap textures flat from the second cycle on',
    rows[3].gi === rows[1].gi && rows[5].gi === rows[1].gi && rows[4].gi === rows[2].gi && rows[6].gi === rows[2].gi,
    `snooker ${rows[1].gi}/${rows[3].gi}/${rows[5].gi}, pool ${rows[2].gi}/${rows[4].gi}/${rows[6].gi}`);
  // G2: the renderer's own texture count at revisits of the same table (cycle 2 vs cycle 3)
  check('G2 renderer.info.memory.textures does not grow between cycles 2 and 3',
    rows[5].gl <= rows[3].gl && rows[6].gl <= rows[4].gl,
    `snooker ${rows[3].gl} -> ${rows[5].gl}, pool ${rows[4].gl} -> ${rows[6].gl}`);
  // G3: revisits fetch no lightmap
  const revisitLoads = rows.slice(2).flatMap((r) => r.giLoads);
  check('G3 revisits re-use the cached lightmaps (no lightmap image load)', revisitLoads.length === 0
    && rows[1].giLoads.length === 4,
    revisitLoads.length ? `${revisitLoads.length} loads: ${revisitLoads.slice(0, 8).join(', ')}` : `first snooker visit loaded ${rows[1].giLoads.length}`);
  // D1/D2: drain runs per animation frame across the whole run (two first-visit-cold snooker builds and their revisits)
  const runs = await chrome.eval('window.__obDrainRuns.runs');
  const perFrame = new Map();
  for (const f of runs) perFrame.set(f, (perFrame.get(f) ?? 0) + 1);
  const maxPerFrame = Math.max(0, ...perFrame.values());
  const crowded = [...perFrame.values()].filter((n) => n > 1).length;
  const blocked = await chrome.eval('window.__snkOccl.shipped?.() ?? null');
  check('D2 the snooker occlusion bake ran and landed (slices observed, every switch settled)',
    runs.length > 0 && blocked?.loaded === false && !!blocked.error,
    `${runs.length} slices over ${perFrame.size} frames; shipped transport ${blocked?.loaded === false ? `blocked (${blocked.error})` : `NOT blocked: ${JSON.stringify(blocked)}`}`);
  check('D1 at most one occlusion slice per animation frame', maxPerFrame <= 1,
    `max ${maxPerFrame} per frame, ${crowded} frames with more than one`);
  // B1: ball programs per re-rack (16 balls on 8-ball, 22 on snooker)
  const maxBall = Math.max(...rows.map((r) => r.ballLinks));
  check('B1 a re-rack links at most 3 new ball programs (one per variant, never one per ball)', maxBall <= 3,
    `per switch ${rows.map((r) => r.ballLinks).join(' ')}`);
  check('B1 positive control: the instrument saw ball programs linked during the run', maxBall > 0,
    `per switch ${rows.map((r) => r.ballLinks).join(' ')}`);
  // G4: overlapping applies on the pool table, settling out of order, one rejected
  {
    const { A: L0, B: L1, F0, P, tag } = await giSets('G4');
    gate.holdTags = [tag(L1, F0), tag(L1, P), tag(L0, P)];
    gate.failTag = tag(L0, P);
    // G4 and G5 count requests at the Fetch gate, and a browser cache hit never reaches it: python's http.server sends no
    // Cache-Control, so a lightmap a previous document loaded can be heuristically fresh in the HTTP cache (one G5 run held
    // 1 of its 8 requests: only the plan G4 had failed, which was never cached). The cache stays off until G5 is done.
    await chrome.send('Network.setCacheDisabled', { cacheDisabled: true });
    await chrome.send('Fetch.enable', { patterns: [{ urlPattern: '*assets/gi/*.png', requestStage: 'Request' }] });
    // A = L1/F0 (held), B = L1/P (held), C = L0/P (held, its plan request failed: rejected), D = the boot set L0/F0,
    // cached: binds first. A, B and C are still loading at that bind, so only a trim on settle can bring 4 sets back to 3.
    await chrome.eval(`(() => { const g = window.__gi; const swallow = (p) => p?.catch?.(() => {});
      swallow(g.setLook(${JSON.stringify(L1)})); swallow(g.setFixture(${JSON.stringify(P)}));
      swallow(g.setLook(${JSON.stringify(L0)})); swallow(g.setFixture(${JSON.stringify(F0)})); return true; })()`);
    await waitFor(`(() => { const st = window.__gi.state; return st.ready && st.appliedSeq === st.applySeq && st.look === ${JSON.stringify(L0)}
      && st.bakeFixture === ${JSON.stringify(F0)}; })()`, 60000, 'G4 newest apply bound');
    const heldBefore = gate.hold.length;
    for (const id of gate.hold.splice(0)) await chrome.send('Fetch.continueRequest', { requestId: id }).catch(() => {});
    // all settled: every cached entry loaded (no in-flight), then a few frames for the queued trims
    await waitFor(`(async () => { const c = window.__gi.texCacheState(); for (let i = 0; i < 4; i++) await new Promise((r) => requestAnimationFrame(r));
      const d = window.__gi.texCacheState(); return d.urls === d.loaded && d.urls === c.urls; })()`, 90000, 'G4 settle');
    await chrome.send('Fetch.disable');
    const st = await chrome.eval('window.__gi.texCacheState()');
    check('G4 overlapping, out-of-order and rejected applies leave the lightmap cache within its 3-set cap',
      heldBefore >= 8 && st.sets.length <= 3 && st.loaded <= 12,
      `held ${heldBefore} requests, failed ${gate.failTag}; after settle ${st.sets.length} sets / ${st.loaded} loaded textures (${st.sets.map((k) => k.split('|')[0].replace(/^.*\//, '').replace(/-plan\.png$/, '')).join(', ')})`);
  }
  // a fresh boot for G5 and H1 (last): G5 needs lightmap sets this document never loaded; H1 stubs the frame loop
  {
    await chrome.send('Page.navigate', { url: APP_URL });
    await sleep(500);
    await waitFor('window.__test?.ready === true && !!window.__settings && !!window.__gi', 90000, 'H1 boot ready');
    await waitFor(`(() => { const gi = window.__gi?.state; return !!gi && gi.ready && gi.appliedSeq === gi.applySeq; })()`, 60000, 'H1 boot settle');
    console.log('[e2e-switchperf] registry (fresh document)', await chrome.eval(REGISTRY));
      // G5 (review r2's sequence; in this fresh document no lightmap set but the boot set was ever loaded, so every
      // request reaches the network and the Fetch gate): the boot set is bound, two applies are held, and the set
      // requested last finishes first
    {
      const { A, B, F0, P, tag } = await giSets('G5');
      const X = P, Y = F0; // held: A/X and B/X; requested last and finishing first: B/Y, a set this document never loaded
      gate.hold.splice(0); gate.failTag = null;
      gate.holdTags = [tag(A, X), tag(B, X)];
      const reup0 = await chrome.eval('window.__obSwitchperfReup.n');
      await chrome.send('Fetch.enable', { patterns: [{ urlPattern: '*assets/gi/*.png', requestStage: 'Request' }] });
      await chrome.eval(`(() => { const g = window.__gi; const swallow = (p) => p?.catch?.(() => {});
        swallow(g.setFixture(${JSON.stringify(X)})); swallow(g.setLook(${JSON.stringify(B)})); swallow(g.setFixture(${JSON.stringify(Y)}));
        return true; })()`);
      await waitFor(`(() => { const st = window.__gi.state; return st.ready && st.appliedSeq === st.applySeq && st.look === ${JSON.stringify(B)}
        && st.bakeFixture === ${JSON.stringify(Y)}; })()`, 60000, 'G5 newest set bound');
      // bound = the maps the GI uniforms and the room materials sample right now; stray = live GI uploads the cache does not own
      const OWNED = `(() => { const gi = window.__gi, gone = window.__obSwitchperfGone, short = (t) => t.image.src.replace(/^.*\\/assets\\/gi\\//, '');
        const bound = [gi.uniforms.uGiPlan.value, gi.uniforms.uGiFlank.value, gi.state.room?.floor?.material?.lightMap, gi.state.room?.blob?.material?.map]
          .filter((t) => t && gone.has(t)).map(short);
        const ids = gi.texCacheState().uuids; let stray = -1; const files = [];
        if (!ids) files.push('texCacheState() has no uuids');
        else { const owned = new Set(ids); stray = 0;
          for (const t of window.__obSwitchperfTex) if (/\\/assets\\/gi\\//.test(t.image?.src ?? '') && !owned.has(t.uuid)) { stray++; files.push(short(t)); } }
        return { bound, stray, files, reup: window.__obSwitchperfReup.n, reupFiles: window.__obSwitchperfReup.files.slice() }; })()`;
      const mid = await chrome.eval(OWNED);
      const held = gate.hold.length;
      for (const id of gate.hold.splice(0)) await chrome.send('Fetch.continueRequest', { requestId: id }).catch(() => {});
      await waitFor(`(async () => { for (let i = 0; i < 4; i++) await new Promise((r) => requestAnimationFrame(r));
        const d = window.__gi.texCacheState(); return d.urls === d.loaded && (d.pinned ?? 0) === 0; })()`, 90000, 'G5 settle');
      await chrome.send('Fetch.disable');
      await chrome.send('Network.setCacheDisabled', { cacheDisabled: false });
      const end = await chrome.eval(OWNED);
      check('G5 no lightmap is disposed before the apply that requested it binds (none bound or uploaded after its dispose)',
        held >= 4 && mid.bound.length === 0 && end.bound.length === 0 && mid.reup === reup0 && end.reup === reup0,
        `held ${held} requests (${gate.holdTags.join(', ')}; ${tag(B, Y)} finished first); disposed but bound: ${mid.bound.length} at bind`
        + ` (${mid.bound.join(', ')}), ${end.bound.length} after settle; uploads after dispose: ${mid.reup - reup0} at bind,`
        + ` ${end.reup - reup0} after settle (${end.reupFiles.slice(-4).join(', ')})`);
      check('G5 every live GI texture is owned by the cache (bind time and after settle)', mid.stray === 0 && end.stray === 0,
        `stray ${mid.stray} at bind (${mid.files.slice(0, 4).join(', ')}), ${end.stray} after settle (${end.files.slice(0, 4).join(', ')})`);
      await chrome.eval(`(() => { const g = window.__gi; const swallow = (p) => p?.catch?.(() => {});
        swallow(g.setFixture(${JSON.stringify(F0)})); swallow(g.setLook(${JSON.stringify(A)})); return true; })()`);
    }
    const armed = await chrome.eval(`(async () => {
      window.requestAnimationFrame = () => 0x7ffffff0; window.cancelAnimationFrame = () => {};   // no frame ever comes
      const ok = await window.__settings.changeGame('snooker', { skipConfirm: true });
      return { ok, pending: window.__snkOccl.pending(), shipped: window.__snkOccl.shipped?.() ?? null }; })()`);
    await sleep(1500);
    const stalled = await chrome.eval('window.__snkOccl.pending()');
    await chrome.eval(`(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange')); return true; })()`);
    let landed = false;
    for (let i = 0; i < 600 && !landed; i++) { await sleep(500); landed = (await chrome.eval('window.__snkOccl.pending()').catch(() => -1)) === 0; }
    check('H1 a bake waiting for a frame when the document hides completes on the timer chain', armed.ok === true && armed.pending > 0 && landed,
      `pending after the switch ${armed.pending}, after 1.5 s with no frames ${stalled}, landed after hide: ${landed}; shipped transport`
      + ` ${armed.shipped?.loaded === false ? 'blocked' : `NOT blocked: ${JSON.stringify(armed.shipped)}`}`);
  }
  // S1 (GH-1131): a fresh document with the shipped transport; the pool table first, so the snooker entry is a real switch
  {
    await chrome.send('Network.setBlockedURLs', { urls: [] });
    await chrome.send('Page.navigate', { url: APP_URL });
    await sleep(500);
    await waitFor('window.__test?.ready === true && !!window.__settings && !!window.__gi', 90000, 'S1 boot ready');
    if (await chrome.eval(`window.__settings.changeGame('eight_ball', { skipConfirm: true })`) !== true) throw new Error('S1: changeGame(eight_ball) failed');
    await waitFor(SETTLED('eight_ball'), 300000, 'S1 pool table');
    const at = await chrome.eval(`(async () => {
      const ok = await window.__settings.changeGame('snooker', { skipConfirm: true });
      const legs = []; window.__dbg.scene.traverse((o) => { if (o.isMesh && o.name === 'obSnkLeg') legs.push(!!o.geometry.getAttribute('aOccl')); });
      return { ok, pending: window.__snkOccl.pending(), legs: legs.length, baked: legs.filter(Boolean).length }; })()`);
    await waitFor(SETTLED('snooker'), 120000, 'S1 snooker settle');
    const slices = await chrome.eval('window.__obDrainRuns.runs.length');
    const sh = await chrome.eval('window.__snkOccl.shipped?.() ?? null');
    // GH-1170: a transport slower than table.js's bound sends the switch to the runtime bake; that is named, never judged
    if (sh?.timeouts) fail(`S1: UNJUDGEABLE — SNK_TRANSPORT_ARTIFACT_TIMEOUT: the shipped transport loaded slower than table.js's bound, so the switch baked at runtime (${JSON.stringify(sh)})`);
    else check('S1 a snooker switch with the shipped transport attaches every occlusion job at once (none pending, no drain slice)',
      at.ok === true && at.pending === 0 && at.legs === 8 && at.baked === 8 && slices === 0
        && sh?.loaded === true && sh.hits > 0 && sh.misses === 0 && !sh.error,
      `when changeGame resolved: pending ${at.pending}, legs with aOccl ${at.baked} / ${at.legs}; drain slices ${slices}; shipped ${JSON.stringify(sh)}`);
  }
  // S2 (GH-1131): a real-user snooker boot with the shipped transport, seeded where no app code runs
  {
    await chrome.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/README.md` });
    await waitFor(`location.pathname === '/README.md' && document.readyState === 'complete'`, 30000, 'S2 seed page');
    const blob = { game: 'snooker', equipment: { table_id: 'wpbsa_snooker_12ft' }, equipmentByGame: { snooker: { table_id: 'wpbsa_snooker_12ft' } } };
    await chrome.eval(`(localStorage.setItem('ob-settings-v1', ${JSON.stringify(JSON.stringify(blob))}),
      localStorage.setItem('ob-shell-v1', ${JSON.stringify(JSON.stringify({ v: 1, lastPlace: 'play', startAtTable: true }))}), true)`);
    await chrome.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/app.html?seed=1&obtool=0` });
    await sleep(500);
    await waitFor('window.__test?.ready === true', 90000, 'S2 boot ready');
    const at = await chrome.eval(`(async () => { const t = await import('/scene/table.js'); const legs = [];
      window.__dbg.scene.traverse((o) => { if (o.isMesh && o.name === 'obSnkLeg') legs.push(!!o.geometry.getAttribute('aOccl')); });
      return { table: t.activeTableId?.(), pending: window.__snkOccl?.pending?.() ?? null, legs: legs.length, baked: legs.filter(Boolean).length,
        slices: window.__obDrainRuns?.runs?.length ?? null, shipped: window.__snkOccl?.shipped?.() ?? null }; })()`);
    if (at.shipped?.timeouts) fail(`S2: UNJUDGEABLE — SNK_TRANSPORT_ARTIFACT_TIMEOUT: the shipped transport loaded slower than table.js's bound, so the boot baked at runtime (${JSON.stringify(at.shipped)})`);
    else check('S2 a real-user snooker boot with the shipped transport is fully baked at ready (none pending, no drain slice)',
      at.table === 'wpbsa_snooker_12ft' && at.pending === 0 && at.legs === 8 && at.baked === 8 && at.slices === 0
        && at.shipped?.loaded === true && at.shipped.hits > 0 && at.shipped.misses === 0 && !at.shipped.error,
      `at ready: table ${at.table}, pending ${at.pending}, legs with aOccl ${at.baked} / ${at.legs}; drain slices ${at.slices}; shipped ${JSON.stringify(at.shipped)}`);
  }
  // GH-1170 (S3, C1): held transports. S2 seeded snooker settings; start from empty storage so that each boot's settings
  // are the defaults (a seeded snooker game would make the snooker switch below a same-game no-op).
  if (PLANT) console.log(`[e2e-switchperf] PLANTED RED on the GH-1170 boots: ?obArm=${PLANT}`);
  {
    await chrome.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/README.md` });
    await waitFor(`location.pathname === '/README.md' && document.readyState === 'complete'`, 30000, 'GH-1170 storage reset page');
    await chrome.eval('(localStorage.clear(), sessionStorage.clear(), true)');
  }
  // S3 boot: snktransport-data.js held from the first request on
  {
    await txHold(['snktransport-data.js']);
    await chrome.send('Page.navigate', { url: ARM_URL('&table=wpbsa_snooker_12ft&obArm=table-cache-off') });
    await sleep(500);
    const ready = await until('window.__test?.ready === true && !!window.__settings', ARM_BOOT_MS);
    const at = await chrome.eval(TX_SNK).catch((e) => ({ err: String(e) }));
    const held = tx.counts['snktransport-data.js'] ?? 0, still = tx.held.length;
    const lines = tx.warns.filter((w) => w.includes('SNK_TRANSPORT_ARTIFACT_TIMEOUT')).length;
    if (!held) fail('S3 boot: UNJUDGEABLE — no snktransport-data.js request was caught by the hold');
    else if (at.sw) fail('S3 boot: UNJUDGEABLE — a service worker controls the page (its precache would serve the transport)');
    else {
      check('S3 boot: a snooker boot with its transport held reaches ready on the runtime bake after ONE bound',
        ready && still > 0 && at.table === 'wpbsa_snooker_12ft' && at.shipped?.timeouts === 1 && lines === 1
          && at.shipped.loaded === false && !at.shipped.error && (at.slices > 0 || at.pending > 0),
        ready ? `held ${held} request(s), ${still} still held at ready; table ${at.table}; timeouts ${at.shipped?.timeouts}, TIMEOUT lines ${lines}; `
          + `runtime bake ${at.slices} slices / ${at.pending} pending; shipped ${JSON.stringify(at.shipped)}`
          : `NOT READY ${ARM_BOOT_MS / 1000} s after the navigation with the transport held: the boot waits on it unbounded (held ${held}; ${JSON.stringify(at)})`);
      // released after the boot built: no build waits for the map, so it is held for the next build boundary
      await txRelease();
      const landed = ready && await until('(() => { const s = window.__snkOccl?.shipped?.(); return !!s && (s.late || s.loaded); })()', 30000);
      const after = await chrome.eval('window.__snkOccl?.shipped?.() ?? null').catch(() => null);
      if (ready) check('S3 boot: the map released after the boot built is held for the next build (late, not installed, no hit)',
        landed && after?.late === true && after.loaded === false && after.hits === 0, `landed ${landed}; shipped ${JSON.stringify(after)}`);
    }
    await txOff();
  }
  // S3 switch + late map: a pool boot, then a snooker switch with the data module held
  {
    await chrome.send('Page.navigate', { url: ARM_URL('&obArm=table-cache-off') });
    await sleep(500);
    await waitFor('window.__test?.ready === true && !!window.__settings && !!window.__gi', 90000, 'S3 switch boot ready');
    await waitFor(`(() => { const gi = window.__gi?.state; return !!gi && gi.ready && gi.appliedSeq === gi.applySeq; })()`, 60000, 'S3 switch boot settle');
    await txHold(['snktransport-data.js']);
    await startSwitch('__s3', 'snooker');
    const done = await until('window.__s3 !== null', SNK_BOUND_MS + 60000);
    const at = await chrome.eval(TX_SNK).catch((e) => ({ err: String(e) }));
    const held = tx.counts['snktransport-data.js'] ?? 0, still = tx.held.length;
    const lines = tx.warns.filter((w) => w.includes('SNK_TRANSPORT_ARTIFACT_TIMEOUT')).length;
    let timedOut = false;
    if (!held) fail('S3 switch: UNJUDGEABLE — no snktransport-data.js request was caught by the hold');
    else if (at.sw) fail('S3 switch: UNJUDGEABLE — a service worker controls the page (its precache would serve the transport)');
    else {
      timedOut = done && at.s3?.v === true && still > 0 && at.table === 'wpbsa_snooker_12ft' && at.shipped?.timeouts === 1 && lines === 1
        && at.shipped.loaded === false && at.s3.ms >= SNK_BOUND_MS - 100;
      check('S3 switch: a snooker switch with its transport held commits on the runtime bake after the bound',
        timedOut && (at.slices > 0 || at.pending > 0),
        done ? `switch ${JSON.stringify(at.s3)}; held ${held}, ${still} still held; table ${at.table}; timeouts ${at.shipped?.timeouts}, TIMEOUT lines ${lines}; `
          + `runtime bake ${at.slices} slices / ${at.pending} pending; shipped ${JSON.stringify(at.shipped)}`
          : `the switch had not returned ${(SNK_BOUND_MS + 60000) / 1000} s after it started with the transport held: it waits on it unbounded (held ${held})`);
    }
    // S3 late map: release while the timed-out build's runtime bake still runs
    if (!timedOut) fail('S3 late map: UNJUDGEABLE — no snooker build timed out on the held transport (S3 switch)');
    else if (!(at.pending > 0)) fail(`S3 late map: UNJUDGEABLE — the timed-out build's runtime bake had drained before the release (pending ${at.pending})`);
    else {
      await txRelease();
      const landed = await until('(() => { const s = window.__snkOccl.shipped(); return s.late || s.loaded; })()', 30000);
      const mid = await chrome.eval('({ shipped: window.__snkOccl.shipped(), pending: window.__snkOccl.pending() })');
      await waitFor('window.__snkOccl.pending() === 0', 300000, 'S3 late map: the timed-out build\'s runtime bake');
      const drained = await chrome.eval('window.__snkOccl.shipped()');
      if (await chrome.eval(`window.__settings.changeGame('eight_ball', { skipConfirm: true })`) !== true) throw new Error('S3 late map: changeGame(eight_ball) failed');
      await waitFor(SETTLED('eight_ball'), 300000, 'S3 late map: the pool table between');
      const next = await chrome.eval(`(async () => { const ok = await window.__settings.changeGame('snooker', { skipConfirm: true });
        return { ok, pending: window.__snkOccl.pending(), shipped: window.__snkOccl.shipped() }; })()`);
      check('S3 late map: the map landing under the timed-out build\'s runtime bake is held for the next build (late, not loaded)',
        landed && mid.shipped.late === true && mid.shipped.loaded === false,
        `landed ${landed} with ${mid.pending} job(s) still baking; shipped ${JSON.stringify(mid.shipped)}`);
      check('S3 late map: the timed-out build keeps hits 0 through its runtime bake',
        mid.shipped.hits === 0 && drained.hits === 0 && drained.misses === 0, `at landing ${mid.shipped.hits}, after the bake ${drained.hits} hits / ${drained.misses} misses`);
      check('S3 late map: the next snooker build takes the landed map at once (hits, no miss, none pending)',
        next.ok === true && next.pending === 0 && next.shipped.hits > 0 && next.shipped.misses === 0 && next.shipped.loaded === true && !next.shipped.late,
        `switch ${next.ok}, pending ${next.pending}; shipped ${JSON.stringify(next.shipped)}`);
    }
    await txOff();
  }
  // S3 return (#1170 r2): after a snooker switch gave up and built on the runtime bake, a Chinese-8 switch pends behind its held
  // transport; the return to the displayed snooker table (settings' prepareCurrentEquipment: cancel the pending switch, then
  // prepare the current table) rebuilds nothing, so it must not wait the snooker bound again
  {
    await chrome.send('Page.navigate', { url: ARM_URL('') });
    await sleep(500);
    await waitFor('window.__test?.ready === true && !!window.__settings && !!window.__gi', 90000, 'S3 return boot ready');
    await waitFor(`(() => { const gi = window.__gi?.state; return !!gi && gi.ready && gi.appliedSeq === gi.applySeq; })()`, 60000, 'S3 return boot settle');
    await txHold(['snktransport-data.js', 'cn8transport.js', 'cn8transport-data.js']);
    await startSwitch('__s3r', 'snooker');
    const timedOut = await until('window.__s3r !== null', SNK_BOUND_MS + 60000);
    const a = await chrome.eval(`(async () => ({ ...(await ${TX_SNK}), s3r: window.__s3r ?? null }))()`).catch((e) => ({ err: String(e) }));
    await startSwitch('__s3c', 'heyball');
    const pend = await until(`window.__tableBuild?.status?.()?.status === 'PENDING'`, 15000);
    await startSwitch('__s3b', 'snooker');
    const back = await until('window.__s3b !== null', SNK_BOUND_MS + 30000);
    const b = await chrome.eval(`(async () => ({ ...(await ${TX_SNK}), back: window.__s3b, status: window.__tableBuild?.status?.() ?? null }))()`).catch((e) => ({ err: String(e) }));
    const lines = tx.warns.filter((w) => w.includes('SNK_TRANSPORT_ARTIFACT_TIMEOUT')).length;
    const heldSnk = tx.counts['snktransport-data.js'] ?? 0, heldCn8 = tx.counts['cn8transport.js'] ?? 0;
    if (!heldSnk || !heldCn8) fail(`S3 return: UNJUDGEABLE — held snktransport-data.js ${heldSnk}, cn8transport.js ${heldCn8} (each must be caught)`);
    else if (a.sw || b.sw) fail('S3 return: UNJUDGEABLE — a service worker controls the page (its precache would serve the transport)');
    else if (!(timedOut && a.s3r?.v === true && a.table === 'wpbsa_snooker_12ft')) fail(`S3 return: UNJUDGEABLE — the snooker switch did not commit on the runtime bake (${JSON.stringify(a.s3r)}, table ${a.table})`);
    else if (!pend) fail('S3 return: UNJUDGEABLE — the Chinese-8 switch never stood PENDING behind its held transport');
    else {
      check('S3 return: a return to the displayed snooker table while a Chinese-8 switch pends rebuilds nothing and does not wait the snooker bound',
        back && b.back?.v !== false && !b.back?.err && b.back.ms < SNK_BOUND_MS / 2 && b.status?.status === 'READY' && b.table === 'wpbsa_snooker_12ft'
          && lines === 1 && b.shipped?.timeouts === 1 && b.shipped.loaded === false,
        back ? `return ${JSON.stringify(b.back)}; status ${JSON.stringify(b.status)}; table ${b.table}; TIMEOUT lines ${lines}; shipped ${JSON.stringify(b.shipped)}`
          : `the return had not resolved ${(SNK_BOUND_MS + 30000) / 1000} s after it started (it waits the snooker bound again)`);
    }
    await txOff();
  }
  // C1: a Chinese-8 boot with cn8transport.js held (the 6 s arm bound), then a Chinese-8 switch while it is still held
  {
    await txHold(['cn8transport.js', 'cn8transport-data.js']);
    await chrome.send('Page.navigate', { url: ARM_URL('&table=chinese8_pro_9ft&obArm=cn8-transport-bound-short') });
    await sleep(500);
    const ready = await until('window.__test?.ready === true && !!window.__settings', ARM_BOOT_MS);
    const at = await chrome.eval(TX_CN8).catch((e) => ({ err: String(e) }));
    const held = tx.counts['cn8transport.js'] ?? 0;
    const lines = () => tx.warns.filter((w) => w.includes('CN8_TRANSPORT_TIMEOUT')).length;
    const bootLines = lines();
    if (!held) fail('C1: UNJUDGEABLE — no cn8transport.js request was caught by the hold');
    else if (at.sw) fail('C1: UNJUDGEABLE — a service worker controls the page (its precache would serve the transport)');
    else {
      check('C1 boot: a Chinese-8 boot with its transport held is refused with CN8_TRANSPORT_TIMEOUT at the bound, named in the error card',
        ready && tx.held.length > 0 && at.status?.status === 'REFUSED' && at.refusal?.code === 'CN8_TRANSPORT_TIMEOUT'
          && at.card.includes('CN8_TRANSPORT_TIMEOUT') && bootLines === 1,
        ready ? `held ${held}; status ${JSON.stringify(at.status)}; refusal ${JSON.stringify(at.refusal)}; card ${JSON.stringify(at.card.slice(0, 160))}; TIMEOUT lines ${bootLines}`
          : `NOT READY ${ARM_BOOT_MS / 1000} s after the navigation with the transport held: the boot waits on it unbounded (held ${held}; ${JSON.stringify(at)})`);
      if (ready) {
        // the switch site, still held: a fresh bound, a fresh refusal
        if (at.game === 'heyball') {
          if (await chrome.eval(`window.__settings.changeGame('eight_ball', { skipConfirm: true })`) !== true) throw new Error('C1: changeGame(eight_ball) failed');
          await waitFor(SETTLED('eight_ball'), 300000, 'C1: the pool table between');
        }
        const r0 = (await chrome.eval(TX_CN8)).status?.request_id ?? null;
        await startSwitch('__c1', 'heyball');
        const sw = await until('window.__c1 !== null', CN8_SHORT_BOUND_MS + 60000);
        const as = await chrome.eval(TX_CN8);
        // a switch the table never saw (settings refused it first: no heyball on this boot) proves nothing about the bound
        if (sw && !(as.status?.request_id > r0)) fail(`C1 switch: UNJUDGEABLE — the heyball switch never reached the table (request ${r0} -> ${as.status?.request_id}; ${JSON.stringify(as.c1)})`);
        else check('C1 switch: a Chinese-8 switch while the transport is still held is refused at a fresh bound (per build, never latched)',
          sw && as.c1?.v === false && as.c1.ms >= CN8_SHORT_BOUND_MS - 100 && as.status?.status === 'REFUSED'
            && as.refusal?.code === 'CN8_TRANSPORT_TIMEOUT' && lines() === bootLines + 1,
          sw ? `switch ${JSON.stringify(as.c1)}; status ${JSON.stringify(as.status)}; refusal ${as.refusal?.code}; TIMEOUT lines ${lines()}`
            : `the switch had not returned ${(CN8_SHORT_BOUND_MS + 60000) / 1000} s after it started with the transport held`);
        // released: the module lands (an in-page import of the same URL shares its module record), and the next
        // Chinese-8 build uses it with no reload
        await txRelease();
        const mod = await chrome.eval(`Promise.race([import('/scene/cn8transport.js').then(() => new Promise((r) => setTimeout(() => r('landed'), 0)), (e) => 'failed: ' + e),
          new Promise((r) => setTimeout(() => r('timeout'), 60000))])`);
        const re = await chrome.eval(`(async () => { const r0 = window.__tableBuild?.status?.()?.request_id ?? null;
          const ok = await window.__settings.changeGame('heyball', { skipConfirm: true });
          const t = await import('/scene/table.js'); const id = t.activeTableId?.() ?? null; const g = window.__dbg?.scene?.getObjectByName('obTable');
          return { ok, r0, id, style: id ? t.TABLE_SPECS?.[id]?.render?.style ?? null : null, status: window.__tableBuild?.status?.() ?? null,
            refusal: g?.userData?.cn8TransportRefusal ?? null }; })()`);
        if (!(re.status?.request_id > re.r0)) fail(`C1 latch: UNJUDGEABLE — the heyball re-pick never reached the table (${JSON.stringify(re)})`);
        else check('C1 latch: released, the landed module serves the next Chinese-8 build without a reload',
          mod === 'landed' && re.ok === true && re.style === 'cn8' && re.status?.status === 'READY' && !re.refusal,
          `module ${mod}; re-pick ${JSON.stringify(re)}`);
      }
    }
    await txOff();
  }
  check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
} catch (e) {
  fail(`suite aborted: ${e?.stack ?? e}`);
} finally {
  chrome.close();
  await stopStaticServer(server);
}
console.log(process.exitCode ? 'E2E-SWITCHPERF: FAIL' : 'E2E-SWITCHPERF: ALL PASS');
