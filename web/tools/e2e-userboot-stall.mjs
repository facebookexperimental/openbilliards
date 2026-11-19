// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-userboot-stall.mjs — GH-1115 boot-overlay clock + scene-build yield arm
// (e2e-userboot arm 12c; also runs standalone: node web/tools/e2e-userboot-stall.mjs).
//
// The finding: the scene build ran as ONE main-thread task (2.9 s at 1x CPU,
// 210 s at 50x) labelled "Physics kernel", and the overlay's 120 s stall
// clock counted that busy time: whichever of the late tick, the
// PerformanceObserver delivery and the rAF stage advance ran first after
// the task decided whether a slow-but-alive boot showed "Loading stalled".
// Every leg is a REAL-USER boot (tool:false, fresh profile, cold cache).
//   busy      the kernel wasm is HELD (Fetch, request stage) so the boot
//             parks on 'kernel' with no canvas and, once resource entries
//             stop, NO progress source. A synchronous spin longer than the
//             ?obstallms=5000 bound then runs in the page, starting with one
//             progress beat (so the idle time before it is known: at most
//             one tick period): no card for 3 s after it (busy time is not
//             idle time), and the card still comes once 5 s of IDLE time
//             pass after the spin. Released: ready un-fails and fades.
//   dead      the same park, no spin: data-boot-failed="stall" at the bound
//             (boot.failStall reason, Retry, the body stamp); released,
//             ready un-fails.
//   slowidle  the same park without the seam: the slow register at 30 s.
//   slowbusy  the same park, a 33 s spin: no slow register after it; the
//             register still comes once 30 s of idle time accrue.
//   yield     4x CPU: main.js's three scene-build yields. The beats arrive
//             in order (Y0 on 'kernel', Y1 and Y2 on 'scene'), the overlay
//             advances to 'scene' between Y0 and Y1 (before buildRoom), no
//             long task holds two beats, every beat ends its task (a task
//             posted at the beat runs within 250 ms), no card, no slow
//             register.
//   yieldsnk  1x, the snooker class (and yieldcn8, the Chinese-8 class): the
//             same three yields (Y2 runs on every table since #1115 Phase 2).
//   Every yield leg also judges the Y-S boot prewarm (table.js
//   buildTable.prewarm): window.__tableBuild.prewarmStats() shows every entry
//   taken, none unused, no inline miss, no throw; every job ends its own task
//   (one 'ys.prewarm.job' User Timing mark per job: no two consecutive marks
//   share a task — the task posted at a mark runs before the next mark, or no
//   long task spans both — and a task posted at each mark runs within 250 ms).
//   compile   1x pool, the GI assets held until the first frame (#1174 B1): the GI bind's program variant is
//             compiled ahead and the frame after the hold compiles nothing for the bind's materials (C1); with
//             ?obcompilehold the held step draws / clears nothing on the screen and renders no frame, then the
//             loop renders again (C2); a resize mid-hold leaves the drawing buffer untouched until the release and
//             lands after it (C2-RESIZE); a bake forced between frames records its program at the bake site (C3). On this
//             natural boot no arrival precompile runs when the warm tick ran, and none is ever scheduled while the warm tick
//             is still pending (C-NOARRIVAL, GH-1202 b-fix; its subject: the warm tick ran, or the keys handoff came while it
//             was pending; a boot whose handle came after the cap has none, and its stamps say so).
//   lightset  1x metal_rim with ?obholdlight=1500 (#1174 B2): the rig lands after the first frames (its venue term hides
//             the table's LightProbe, its 4 emitters add SPIKE_EMAX) and the FRESH hall arrival joins the hall keys, so
//             the light set changes twice after the first draw. A light-set compile-ahead held the step (L1-AHEAD); after
//             the first draw and while the gate is armed (its boot tail), no lit program links inside a delivered frame
//             and no delivered frame waits on a link a gate compile still has in flight (L1-SYNC: readiness sampled at a
//             program's first query of any kind, render ownership by an explicit scope around composer.render); with
//             ?obcompilehold a gate hold draws / clears nothing on the
//             screen and renders no frame, then the loop renders again within a bound (L2: after ready a zero-intensity
//             copy of a scene light joins, so the gate's hold does not depend on the boot's own timing; the boot's own
//             hall arrival may still hold once more right after it). L1-OWE (GH-1202): a hall-other compile skipped for
//             a pending stage runs at the batch's end, right after its last apply. L1-ARRIVAL (GH-1202 b-fix): with the warm
//             tick off under ?obholdlight, the hall keys' joined variants compile ahead from the keys handoff while #ob-boot is
//             up, split into steps ('arrival:hall-other' records, every one with overlay true and before the FRESH arrival's
//             first staged join, no step over its 64-object cap, one task per step, the steps covering the whole list), and
//             that join compiles nothing.
//   lateshell 1x metal_rim with ?obholdlight=1500 and app/shell.js held until ready (GH-1202 b-fix, maintainer ruling (A)): the
//             keys handoff comes after ready, a late shell; the arrival's first step compiles the join's whole draw set in the
//             handoff's own task, and the first staged join compiles nothing (L1-ARRIVAL; an arrival scheduled before ready is
//             INVALID).
//   giorder   1x metal_rim with ?obholdlight=1500 and the GI assets held until the arrival compiled (GH-1202 b-fix r8): the GI
//             bind lands after the arrival, under #ob-boot (ready waits for the GI to settle); the arrival's delta compiles the
//             keys-joined variant the bind re-keyed, inside no hold, and the first staged join compiles nothing (L1-ARRIVAL,
//             L1-DELTA; a boot whose order differs, or with a hall-other compile between the bind and the join, is INVALID,
//             L1-GIORDER). Legs lightset and lateshell judge a delta too whenever one ran.
// --selftest-plants serves planted copies and requires each to go red on its
// TARGET assertion (an INVALID message, a precondition failure or no subject, is never the catch; a trial with no catch
// and an INVALID for the plant's own subject runs once more: an untagged leg precondition that returns before any verdict, or one
// tagged '<block> precondition' (C1, C2, C3, C-NOARRIVAL, L1, L1-GI, L1-OWE, L1-ARRIVAL, L1-GIORDER, L1-DELTA, L2) whose block is in
// the plant's subject list;
// a valid trial that stayed green is a miss): the
// pre-GH-1115 clock (busy, slowbusy), a clock that resets on every tick
// (dead), main.js yielding only microtasks (yield), only Y2 not awaited
// (yield), Y2 skipped on the snooker class (yieldsnk), every prewarm job in
// one task (yieldsnk), and on leg compile: the GI bind without the hook, the
// compile-ahead in the screen context, no hold, a hold that clears the screen, a resize that is
// not held, a bake that does not record itself; on leg lightset: no light-set gate before the
// frame and no background hall-keys compile, no gate and no relight compile at all, a gate compile that never holds, a gate hold
// that clears the screen, a frame that draws an unfinished program first read through getProgramInfoLog, the same with every
// draw nested 40 calls deep, an owed hall-other compile that never runs at the batch end, a batch end that never runs the
// debt (the pre-fix wait for the next key change), and (GH-1202 b-fix) a keys handoff that precompiles nothing, an arrival
// precompile deferred past the overlay's fade, no arrival precompile with the join applied at once, an unsplit arrival (one
// step compiles the whole list), an arrival chain that runs every step in one task (by direct calls, or by microtask hops), an
// arrival chain that ends with its channel open and its list held, an arrival that starts while a held compile-ahead is pending, on leg
// lateshell a late shell's first step
// that stays budgeted, on leg giorder (r8) a GI bind after the arrival with no delta and a delta that compiles inside the bind's own
// hold, and on leg compile an arrival precompile that ignores keyWarm (it runs on a natural boot while the warm
// tick is pending). The browser
// plants are a seal-time proof (run by hand); the clock's own plants run
// per PR in test-boot-stall-clock.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchChrome, sleep, spawnStaticServer, stopStaticServer } from './cdp.mjs';

// standalone band sizing (run-gate reads this literal): one static server +
// one CDP endpoint (the legs run one after another)
export const PORT_INVENTORY = { http: 1, cdp: 1 };
// SHARED_DEFAULT_WINDOW (e2e-userboot) — one suite in several files: e2e-userboot imports runBootStallArm
export const SHARED_DEFAULT_WINDOW = 'e2e-userboot';

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BOUND = 5000;

const RECORDER = `(() => { const R = window.__obStall = { beats: [], stages: [], failed: [], slow: [], lt: [], jobs: [], fadeAt: null, quietAtFade: null, firstUse: [] };
  const pm = performance.mark.bind(performance);
  performance.mark = (name, ...a) => { const r = pm(name, ...a); if (name === 'ys.prewarm.job') { const rec = [performance.now(), null]; R.jobs.push(rec);
    const ch = new MessageChannel(); ch.port1.onmessage = () => { rec[1] = performance.now(); }; ch.port2.postMessage(null); } return r; };
  window.addEventListener('ob:boot-beat', () => { const b = document.getElementById('ob-boot'); const rec = [performance.now(), b ? b.getAttribute('data-stage') : null, null];
    R.beats.push(rec); const ch = new MessageChannel(); ch.port1.onmessage = () => { rec[2] = performance.now(); }; ch.port2.postMessage(null); });
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) R.lt.push([e.startTime, e.duration]); }).observe({ type: 'longtask', buffered: true }); } catch (_) {}
  new MutationObserver((ms) => { for (const m of ms) { const t = m.target; if (!t || t.id !== 'ob-boot') continue; const n = performance.now();
    if (m.attributeName === 'data-stage') R.stages.push([n, t.getAttribute('data-stage')]);
    else if (m.attributeName === 'data-boot-failed') R.failed.push([n, t.getAttribute('data-boot-failed')]);
    else if (m.attributeName === 'class') {
      // #1202 build 21: the real overlay's fade start (never a leg's hidden stand-in), with the quiet term's record at that moment
      if (R.fadeAt === null && !t.dataset.obArmStandIn && t.classList.contains('ob-boot--out')) {
        R.fadeAt = n; try { const C = window.__obCompileCensus && window.__obCompileCensus(); R.quietAtFade = C ? (C.quiet || null) : null; } catch (e) { R.quietAtFade = 'err ' + e.message; } } }
    else R.slow.push([n, t.hasAttribute('data-slow')]); } })
    .observe(document, { subtree: true, attributes: true, attributeFilter: ['data-stage', 'data-boot-failed', 'data-slow', 'class'] });
  // GH-1174 leg compile: every draw / clear that reaches the default framebuffer while a compile-ahead holds the loop
  R.heldDraws = []; try { const P = WebGL2RenderingContext.prototype;
    for (const n of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'clear']) { const o = P[n];
      P[n] = function (...a) { const h = window.__obCompileHold; if (h && h.pending > 0 && !h.capped && ((window.__test && window.__test.renderTimes) || []).length > 0 && this.getParameter(this.FRAMEBUFFER_BINDING) === null && R.heldDraws.length < 50) R.heldDraws.push([n, Math.round(performance.now())]); return o.apply(this, a); }; } } catch (_) {}
  // GH-1174 leg lightset: a program's first query that finds its link unfinished, and whether a draw made it (that frame waited
  // on the GPU process for the link). three r170's first use reads getProgramInfoLog and getShaderInfoLog, which block, before
  // LINK_STATUS, so readiness (COMPLETION_STATUS_KHR, which never blocks) is sampled at the program's FIRST query of any kind,
  // through the live method so a page wrapper answers it too. Render ownership is an explicit scope around composer.render (the
  // frame's draw section; main.js publishes the composer as window.__dbg.composer before the loop's first draw), never the stack,
  // which Chrome cuts at Error.stackTraceLimit (10). A draw-owned record after the first frame also carries the full stack depth
  // (for the plants' log). Every program linked inside a render records its first touch too, so the bound is generous.
  R.linkWaits = []; R.drawDepth = 0; try { const P = WebGL2RenderingContext.prototype;
    const opp = P.getProgramParameter, opl = P.getProgramInfoLog, osl = P.getShaderInfoLog, oas = P.attachShader;
    const seen = new WeakSet(), owner = new WeakMap();
    const first = (gl, prog) => { if (!prog || seen.has(prog)) return; seen.add(prog);
      if (R.linkWaits.length < 4000 && gl.getExtension('KHR_parallel_shader_compile') && gl.getProgramParameter(prog, 0x91B1) === false) {
        let depth = null; if (R.drawDepth > 0 && ((window.__test && window.__test.renderTimes) || []).length > 0) {
          const lim = Error.stackTraceLimit; Error.stackTraceLimit = 256; depth = ((new Error().stack || '').match(/\\n\\s+at /g) || []).length; Error.stackTraceLimit = lim; }
        R.linkWaits.push([Math.round(performance.now()), R.drawDepth > 0, depth]); } };
    P.attachShader = function (prog, sh) { owner.set(sh, prog); return oas.call(this, prog, sh); };
    // #1202 build 21: each program's first use, before or after the real fade, inside a frame's render or not (a warm draw)
    const ou = P.useProgram; const usedP = new WeakSet();
    P.useProgram = function (prog) { if (prog && !usedP.has(prog)) { usedP.add(prog); if (R.firstUse.length < 4000) R.firstUse.push([Math.round(performance.now()), R.fadeAt === null ? 1 : 0, R.drawDepth > 0 ? 1 : 0]); } return ou.call(this, prog); };
    P.getProgramParameter = function (prog, pname) { if (pname !== 0x91B1) first(this, prog); return opp.call(this, prog, pname); };
    P.getProgramInfoLog = function (prog) { first(this, prog); return opl.call(this, prog); };
    P.getShaderInfoLog = function (sh) { first(this, owner.get(sh)); return osl.call(this, sh); };
    let dbg; Object.defineProperty(window, '__dbg', { configurable: true, get: () => dbg, set: (v) => { dbg = v; if (!v || typeof v !== 'object') return;
      let comp; Object.defineProperty(v, 'composer', { configurable: true, enumerable: true, get: () => comp, set: (c) => { comp = c;
        if (!c || typeof c.render !== 'function' || c.__obDrawScope) return; const o = c.render; c.__obDrawScope = true;
        c.render = function (...a) { R.drawDepth += 1; try { return o.apply(this, a); } finally { R.drawDepth -= 1; } }; } }); } });
  } catch (_) {} })();`;
const PROBE = `(() => { const b = document.getElementById('ob-boot'); const R = window.__obStall || {};
  const reason = b && b.querySelector('.ob-boot__reason'), retry = b && b.querySelector('.ob-boot__retry');
  return { now: performance.now(), present: !!b, stage: b ? b.getAttribute('data-stage') : null,
    failed: b ? b.getAttribute('data-boot-failed') : null, slow: !!(b && b.hasAttribute('data-slow')),
    reasonKey: reason ? reason.getAttribute('data-i18n') : null, retry: !!(retry && retry.getClientRects().length),
    bodyStamp: document.body ? document.body.hasAttribute('data-ob-boot-failed') : null,
    resources: performance.getEntriesByType('resource').length, lastResponseEnd: Math.max(0, ...performance.getEntriesByType('resource').map((e) => e.responseEnd)),
    ready: !!(window.__test && window.__test.ready === true), canvas: !!document.querySelector('body > canvas'),
    rec: { beats: R.beats, stages: R.stages, failed: R.failed, slow: R.slow, lt: R.lt, jobs: R.jobs },
    prewarm: (window.__tableBuild && typeof window.__tableBuild.prewarmStats === 'function') ? window.__tableBuild.prewarmStats() : null }; })()`;
const spin = (ms) => `(() => { const e = performance.now() + ${ms}; while (performance.now() < e) {} return performance.now(); })()`;
// GH-1202: main.js holds a compile-ahead only while #ob-boot covers the canvas, and stages a change after it. A leg that judges the
// B1 / B2 hold keeps a hidden stand-in #ob-boot after the real one (main.js reads only the first one's presence and class), so its
// subject compile holds wherever the real overlay's fade lands; the leg's browser closes with it
const STAND_IN = `(() => { if (!document.querySelector('#ob-boot[data-ob-arm-stand-in]')) { const f = document.createElement('div'); f.id = 'ob-boot'; f.hidden = true;
  f.dataset.obArmStandIn = '1'; document.body.appendChild(f); } return true; })()`;

async function openLeg(PORT, cdp, { hold = true, holdGi = false, holdLeaf = false, holdShell = false, overrides = {}, cpu = 1 } = {}) {
  const c = await launchChrome(`http://127.0.0.1:${PORT}/`, { port: cdp, tool: false, width: 1280, height: 800 });
  await c.send('Page.enable'); await c.send('Network.enable'); await c.send('Runtime.enable');
  await c.send('Network.clearBrowserCache');
  if (cpu > 1) await c.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  await c.send('Page.addScriptToEvaluateOnNewDocument', { source: RECORDER });
  const held = []; const served = []; const heldGi = []; const heldLeaf = []; const heldShell = [];
  let release = false, releaseGi = false, releaseLeaf = false, releaseShell = false;
  const patterns = Object.keys(overrides).map((suf) => ({ urlPattern: `*${suf}*`, requestStage: 'Request' }));
  if (hold) patterns.push({ urlPattern: '*pool_wasm_bg.wasm*', requestStage: 'Request' });
  if (holdGi) patterns.push({ urlPattern: '*/assets/gi/*', requestStage: 'Request' }); // GH-1174 leg compile: the GI binds after the first frame
  if (holdLeaf) patterns.push({ urlPattern: '*lightingvisuals.js*', requestStage: 'Request' }); // GH-1202 leg lightset L1: the rig lands after the overlay
  if (holdShell) patterns.push({ urlPattern: '*/app/shell.js*', requestStage: 'Request' }); // GH-1202 b-fix leg lateshell: the shell lands after ready
  c.onEvent((m, p) => {
    if (m !== 'Fetch.requestPaused') return;
    const u = new URL(p.request.url);
    const suf = Object.keys(overrides).find((s) => u.pathname.endsWith(s));
    if (suf) {
      served.push(suf);
      const type = suf.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8';
      c.send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 200, body: Buffer.from(overrides[suf]).toString('base64'),
        responseHeaders: [{ name: 'Content-Type', value: type }, { name: 'Cache-Control', value: 'no-store' }] }).catch(() => {});
      return;
    }
    if (hold && !release && /pool_wasm_bg\.wasm/.test(u.pathname)) { held.push(p.requestId); return; }
    if (holdGi && !releaseGi && u.pathname.includes('/assets/gi/')) { heldGi.push(p.requestId); return; }
    if (holdLeaf && !releaseLeaf && /lightingvisuals\.js$/.test(u.pathname)) { heldLeaf.push(p.requestId); return; }
    if (holdShell && !releaseShell && /\/app\/shell\.js$/.test(u.pathname)) { heldShell.push(p.requestId); return; }
    c.send('Fetch.continueRequest', { requestId: p.requestId }).catch(() => {});
  });
  if (patterns.length) await c.send('Fetch.enable', { patterns });
  return { c, held, served, heldGi, releaseWasm: () => { release = true; for (const id of held.splice(0)) c.send('Fetch.continueRequest', { requestId: id }).catch(() => {}); },
    releaseGi: () => { releaseGi = true; const n = heldGi.length; for (const id of heldGi.splice(0)) c.send('Fetch.continueRequest', { requestId: id }).catch(() => {}); return n; },
    releaseLeaf: () => { releaseLeaf = true; const n = heldLeaf.length; for (const id of heldLeaf.splice(0)) c.send('Fetch.continueRequest', { requestId: id }).catch(() => {}); return n; },
    releaseShell: () => { releaseShell = true; const n = heldShell.length; for (const id of heldShell.splice(0)) c.send('Fetch.continueRequest', { requestId: id }).catch(() => {}); return n; } };
}

// close AND wait (the next leg reuses the CDP port)
async function closeLeg(leg) { try { await (leg.c.closeAndWait ? leg.c.closeAndWait() : leg.c.close()); } catch { /* gone */ } }

// parked on 'kernel' (wasm held) with no resource arriving for 2 s
async function waitParked(c, tag, fail) {
  let last = -1, since = Date.now(), p = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 30000) {
    p = await c.eval(PROBE).catch(() => null);
    if (p && p.stage === 'kernel' && !p.failed && p.resources === last) { if (Date.now() - since >= 2000) return p; }
    else { last = p ? p.resources : -1; since = Date.now(); }
    await sleep(250);
  }
  fail(`[${tag}] INVALID (precondition): the boot never parked quietly on 'kernel' (${JSON.stringify(p && { stage: p.stage, failed: p.failed, resources: p.resources })})`);
  return null;
}

async function waitFor(c, pred, ms) {
  const t0 = Date.now(); let p = null;
  while (Date.now() - t0 < ms) { p = await c.eval(PROBE).catch(() => null); if (p && pred(p)) return p; await sleep(200); }
  return p;
}

async function finishBoot(leg, tag, fail, log) {
  leg.releaseWasm();
  const p = await waitFor(leg.c, (q) => q.ready && !q.failed, 60000);
  if (!p || !p.ready) fail(`[${tag}] released: the boot never reached ready (${JSON.stringify(p && { stage: p.stage, failed: p.failed })})`);
  else if (p.failed) fail(`[${tag}] released: ready did not un-fail the card ('${p.failed}')`);
  else log(`[${tag}] released: ready, card cleared`);
}

export async function legBusy({ PORT, cdp, fail, log = console.log, overrides = {} }) {
  const tag = 'busy';
  const leg = await openLeg(PORT, cdp, { overrides });
  try {
    await leg.c.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/app.html?obstallms=${BOUND}&u=stall-${tag}` });
    const parked = await waitParked(leg.c, tag, fail);
    if (!parked) return;
    const spinMs = BOUND + 1500;
    const spinEnd = await leg.c.eval(`(() => { window.dispatchEvent(new Event('ob:boot-beat')); return ${spin(spinMs)}; })()`);
    await sleep(3000);
    const after = await leg.c.eval(PROBE);
    if (after.resources !== parked.resources) { fail(`[${tag}] INVALID: ${after.resources - parked.resources} resource entr(ies) landed across the spin`); return; }
    log(`[${tag}] parked at ${Math.round(parked.now)} ms, ${spinMs} ms spin ended at ${Math.round(spinEnd)} ms; 3 s later failed='${after.failed}'`);
    if (after.failed) { fail(`[${tag}] CARD-AFTER-BUSY: the stall card rose after a ${spinMs} ms BUSY task (bound ${BOUND} ms of idle time): '${after.failed}' at ${JSON.stringify(after.rec.failed)}`); return; }
    const carded = await waitFor(leg.c, (q) => !!q.failed, BOUND + 9000);
    const at = carded?.rec?.failed?.[0]?.[0];
    // the beat at the spin start leaves at most one tick period of idle time before the late tick
    if (!carded?.failed) fail(`[${tag}] NO-CARD-AFTER-IDLE: no card after ${BOUND} ms of IDLE time following the spin (the clock must still run)`);
    else if (!(at >= spinEnd + BOUND - 1200 && at <= spinEnd + BOUND + 3000)) fail(`[${tag}] CARD-WINDOW: the card rose at ${Math.round(at)} ms, outside [spin end + ${BOUND} − 1.2 s, + 3 s] (spin end ${Math.round(spinEnd)} ms)`);
    else log(`[${tag}] card after the idle bound: ${Math.round(at - spinEnd)} ms after the spin`);
    if (!overrides['app.html']) await finishBoot(leg, tag, fail, log);
  } finally { await closeLeg(leg); }
}

export async function legDead({ PORT, cdp, fail, log = console.log, overrides = {} }) {
  const tag = 'dead';
  const leg = await openLeg(PORT, cdp, { overrides });
  try {
    await leg.c.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/app.html?obstallms=${BOUND}&u=stall-${tag}` });
    const parked = await waitParked(leg.c, tag, fail);
    if (!parked) return;
    const p = await waitFor(leg.c, (q) => !!q.failed, BOUND + 12000);
    const at = p?.rec?.failed?.[0]?.[0];
    const from = Math.max(p?.lastResponseEnd ?? 0, ...(p?.rec?.stages ?? []).map((s) => s[0]));
    if (!p?.failed) { fail(`[${tag}] NO-CARD: a parked boot with no progress showed no stall card within ${BOUND + 12000} ms`); return; }
    log(`[${tag}] card '${p.failed}' at ${Math.round(at)} ms = last progress + ${Math.round(at - from)} ms; reason=${p.reasonKey} retry=${p.retry} stamp=${p.bodyStamp}`);
    if (p.failed !== 'stall') fail(`[${tag}] card kind '${p.failed}', want 'stall'`);
    if (!(at - from >= BOUND - 50 && at - from <= BOUND + 4000)) fail(`[${tag}] card at last progress + ${Math.round(at - from)} ms, want the ${BOUND} ms bound (+ tick slack)`);
    if (p.reasonKey !== 'boot.failStall' || !p.retry || !p.bodyStamp) fail(`[${tag}] card furniture: reason=${p.reasonKey} retry=${p.retry} stamp=${p.bodyStamp}`);
    if (!overrides['app.html']) await finishBoot(leg, tag, fail, log);
  } finally { await closeLeg(leg); }
}

export async function legSlowIdle({ PORT, cdp, fail, log = console.log, overrides = {} }) {
  const tag = 'slowidle';
  const leg = await openLeg(PORT, cdp, { overrides });
  try {
    await leg.c.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/app.html?u=stall-${tag}` });
    if (!(await waitParked(leg.c, tag, fail))) return;
    const p = await waitFor(leg.c, (q) => q.slow || !!q.failed, 40000);
    const at = p?.rec?.slow?.find((s) => s[1])?.[0];
    if (!p?.slow) fail(`[${tag}] no slow register on an idle parked boot within 40 s (failed='${p?.failed}')`);
    else if (!(at >= 29950 && at <= 34000)) fail(`[${tag}] slow register at ${Math.round(at)} ms, want ~30 s of idle time`);
    else log(`[${tag}] slow register at ${Math.round(at)} ms`);
  } finally { await closeLeg(leg); }
}

export async function legSlowBusy({ PORT, cdp, fail, log = console.log, overrides = {} }) {
  const tag = 'slowbusy';
  const leg = await openLeg(PORT, cdp, { overrides });
  try {
    await leg.c.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/app.html?u=stall-${tag}` });
    const parked = await waitParked(leg.c, tag, fail);
    if (!parked) return;
    const spinStart = (await leg.c.eval(PROBE)).now;
    const spinEnd = await leg.c.eval(spin(33000));
    await sleep(3000);
    const after = await leg.c.eval(PROBE);
    log(`[${tag}] 33 s spin ${Math.round(spinStart)}→${Math.round(spinEnd)} ms; 3 s later slow=${after.slow}`);
    if (after.slow) { fail(`[${tag}] SLOW-AFTER-BUSY: the slow register rose after 33 s of BUSY work (${JSON.stringify(after.rec.slow)})`); return; }
    // idle time before the spin + after it reaches 30 s → the register still comes
    const due = spinEnd + (30000 - spinStart);
    const p = await waitFor(leg.c, (q) => q.slow, Math.max(0, due - after.now) + 6000);
    const at = p?.rec?.slow?.find((s) => s[1])?.[0];
    if (!p?.slow) fail(`[${tag}] no slow register once 30 s of idle time accrued (due ~${Math.round(due)} ms)`);
    else if (!(at >= due - 1500 && at <= due + 5000)) fail(`[${tag}] slow register at ${Math.round(at)} ms, want ~${Math.round(due)} ms (30 s of idle time)`);
    else log(`[${tag}] slow register at ${Math.round(at)} ms (idle-time due ${Math.round(due)} ms)`);
  } finally { await closeLeg(leg); }
}

export async function legYield({ PORT, cdp, fail, log = console.log, overrides = {}, table = null }) {
  // the default pool table at 4x CPU, the snooker / Chinese-8 class at 1x: Y0, Y1, Y2
  const tag = table ? `yield-${table}` : 'yield';
  const want = 3;
  const leg = await openLeg(PORT, cdp, { hold: false, overrides, cpu: table ? 1 : 4 });
  try {
    await leg.c.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/app.html?u=stall-${tag}${table ? `&table=${table}` : ''}` });
    const p = await waitFor(leg.c, (q) => q.ready, 150000);
    if (!p?.ready) { fail(`[${tag}] INVALID (precondition): the boot never reached ready (${JSON.stringify(p && { stage: p.stage, failed: p.failed })})`); return; }
    const { beats, stages, lt, failed, slow } = p.rec;
    const scene = stages.find((s) => s[1] === 'scene')?.[0];
    const longest = lt.reduce((m, x) => (x[1] > m[1] ? x : m), [0, 0]);
    log(`[${tag}] beats ${JSON.stringify(beats.map(([t, s, e]) => [Math.round(t), s, e === null ? null : Math.round(e - t)]))} ([t, stage, task-after-beat latency ms]); scene at ${Math.round(scene)} ms; longest task ${Math.round(longest[1])} ms at ${Math.round(longest[0])} ms`);
    if (beats.length !== want) { fail(`[${tag}] Y-BEATS: ${beats.length} boot beat(s), want ${want} (Y0, Y1, Y2)`); return; }
    const stagesAt = beats.map((b) => b[1]).join('/');
    if (stagesAt !== ['kernel', 'scene', 'scene'].slice(0, want).join('/')) fail(`[${tag}] Y-STAGE: stage at the beats ${stagesAt}, want ${['kernel', 'scene', 'scene'].slice(0, want).join('/')}`);
    if (!(scene > beats[0][0] && scene < beats[1][0])) fail(`[${tag}] Y-STAGE: 'scene' at ${Math.round(scene)} ms is not between Y0 (${Math.round(beats[0][0])}) and Y1 (${Math.round(beats[1][0])}): the overlay did not advance before buildRoom`);
    const holders = lt.filter(([s, d]) => beats.filter(([t]) => t >= s && t <= s + d).length > 1);
    if (holders.length) fail(`[${tag}] Y-TASK: ${holders.length} long task(s) hold more than one beat (${JSON.stringify(holders.map(([s, d]) => [Math.round(s), Math.round(d)]))}): a yield did not end its task`);
    const late = beats.map(([t, , e], i) => [i, e === null ? Infinity : e - t]).filter(([, d]) => d > 250);
    if (late.length) fail(`[${tag}] Y-TASK: a task posted at beat ${late.map(([i]) => `Y${i}`).join(', ')} ran ${late.map(([, d]) => (d === Infinity ? 'never' : `${Math.round(d)} ms`)).join(', ')} later (want <= 250 ms): the yield did not end its task`);
    if (failed.length || slow.some((s) => s[1])) fail(`[${tag}] Y-REGISTER: a register rose on a healthy boot: failed=${JSON.stringify(failed)} slow=${JSON.stringify(slow)}`);
    // the Y-S boot prewarm
    const pw = p.prewarm, jobs = p.rec.jobs || [];
    log(`[${tag}] prewarm ${JSON.stringify(pw && { jobs: pw.jobs, put: pw.put, taken: pw.taken, unused: pw.unused, miss: pw.missByName, threw: pw.threw })}; job marks ${jobs.length}, max task-after-mark ${jobs.length ? Math.round(Math.max(...jobs.map(([t, e]) => (e === null ? Infinity : e - t)))) : null} ms`);
    if (!pw) { fail(`[${tag}] Y-PREWARM: no prewarm stats (window.__tableBuild.prewarmStats) on a real-user boot`); return; }
    if (!(pw.put > 0 && pw.taken === pw.put && pw.unused === 0 && !pw.threw && !Object.keys(pw.missByName || {}).length)) fail(`[${tag}] Y-PREWARM: the boot did not take every prewarmed entry: ${JSON.stringify(pw)}`);
    if (jobs.length !== pw.jobs) fail(`[${tag}] Y-PREWARM: ${jobs.length} job mark(s) for ${pw.jobs} job(s)`);
    // Two consecutive marks share a task only if the task posted at the first ran AFTER the second (nothing ran
    // between them) AND one long task spans both. The span alone is not enough: a long task's startTime is coarsened,
    // so the next job's task can appear to start at or before the previous job's closing mark (a false holder at
    // load1 ~63). A task posted at mark i that ran before mark i+1 proves a task boundary between them.
    const shared = [];
    for (let i = 0; i + 1 < jobs.length; i++) {
      const [t0, e0] = jobs[i], [t1] = jobs[i + 1];
      if (e0 !== null && e0 < t1) continue;
      const span = lt.find(([s, d]) => t0 >= s && t1 <= s + d);
      if (span) shared.push({ i, mark: +t0.toFixed(2), posted: e0 === null ? null : +e0.toFixed(2), next: +t1.toFixed(2), task: [+span[0].toFixed(2), +span[1].toFixed(2)] });
    }
    if (shared.length) fail(`[${tag}] Y-PREWARM-TASK: ${shared.length} pair(s) of consecutive prewarm jobs share one long task (${JSON.stringify(shared.slice(0, 3))}): the jobs did not end their tasks`);
    const jobLate = jobs.filter(([t, e]) => e === null || e - t > 250);
    if (jobLate.length) fail(`[${tag}] Y-PREWARM-TASK: a task posted at ${jobLate.length} prewarm job mark(s) ran more than 250 ms later`);
  } finally { await closeLeg(leg); }
}

export async function legCompile({ PORT, cdp, fail, log = console.log, overrides = {} }) {
  // GH-1174: the GI bind's program variants are compiled ahead, never inside a render or an env bake after the first draw
  // (C1, a plain real-user pool boot); a compile-ahead holds the whole loop step: nothing reaches the screen while it is in
  // flight and no frame is rendered, so the canvas keeps the last complete frame; then the loop renders again (C2, the
  // ?obcompilehold seam stretches the hold to judge it)
  const tag = 'compile';
  const census = `(() => { const C = window.__obCompileCensus?.(); const D = window.__dbg; if (!C || !D) return null;
    const gb = C.ahead.filter((a) => a.why === 'gi-bind'); const mats = new Set(gb.flatMap((a) => a.materials)); const owned = new Set();
    D.scene.traverse((o) => { for (const m of [].concat(o.material ?? [])) if (mats.has(m.uuid)) { const pr = D.renderer.properties.get(m); if (pr && pr.programs) for (const p of pr.programs.values()) owned.add(p.id); } });
    // the frame right after each gi-bind hold released: a program the bind needed and the compile-ahead missed shows up there
    const next = new Set(gb.map((a) => (a.releasedAfterFrame ?? -9) + 1));
    const sync = [...C.inRender, ...C.inBake].filter((e) => next.has(e.frame)).flatMap((e) => e.programs.map((x) => x[0]));
    return { ahead: C.ahead.map((a) => ({ why: a.why, n: a.programs.length, ms: a.ms, mats: a.materials.length, released: a.releasedAfterFrame, before: !!a.beforeFirstDraw })), early: C.early, owned: [...owned],
      syncOwned: sync.filter((id) => owned.has(id)), inRender: C.inRender.length, inBake: C.inBake.length,
      arrival: C.ahead.filter((a) => a.why === 'arrival:hall-other').length, arrivalState: (C.hallOther && C.hallOther.arrival) || null, warm: window.__test?.hallWarm?.()?.state ?? null,
      hallWarm: window.__test?.hallWarm?.() ?? null, handoff: (C.hallOther && C.hallOther.handoff) || null, khr: C.gate ? C.gate.khr : null }; })()`;
  const FRAMES = `(() => window.__test?.renderTimes?.length ?? 0)()`;
  const releaseAfterFirstFrame = async (lg) => { const t0 = Date.now(); let f = 0; while (Date.now() - t0 < 120000) { f = await lg.c.eval(FRAMES).catch(() => 0); if (f > 0) break; await sleep(40); }
    await lg.c.eval(STAND_IN).catch(() => {}); lg.releaseGi(); return f; };
  let leg = await openLeg(PORT, cdp, { hold: false, holdGi: true, overrides });
  try {
    await leg.c.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/app.html?u=stall-compile&table=pool_pro_9ft` });
    if (!(await releaseAfterFirstFrame(leg))) { fail(`[${tag}] INVALID (precondition): no frame was delivered while the GI assets were held`); return; }
    const p = await waitFor(leg.c, (q) => q.ready, 150000);
    if (!p?.ready) { fail(`[${tag}] INVALID (precondition): the boot never reached ready`); return; }
    await sleep(1500);
    const c = await leg.c.eval(census).catch(() => null);
    log(`[${tag}] C1 census ${JSON.stringify(c)}`);
    // C-NOARRIVAL (GH-1202 b-fix): a natural boot keeps today's path: no arrival precompile when the GH-910 warm tick ran, and none
    // is ever scheduled while the warm tick is still pending (the fix schedules one only once it is 'capped' or 'n/a'). Its subject is
    // exact: a boot whose warm tick ran, or whose keys handoff came while the warm tick was pending (the census's handoff record). A boot
    // whose handle came after the cap has neither (there the plant takes the fix's own capped path), nor has a boot without KHR (no arrival
    // can be scheduled): a note, and INVALID tagged 'C-NOARRIVAL precondition' under the plant
    const aw = c && c.arrivalState ? c.arrivalState.warm : null; const ran = !!c && (c.warm === 'warm' || c.warm === 'open');
    const stamps = c ? `hallWarm ${JSON.stringify(c.hallWarm)}; handoff ${JSON.stringify(c.handoff)}; khr ${c.khr}; arrival ${JSON.stringify(c.arrivalState && { via: c.arrivalState.via, warm: aw, state: c.arrivalState.state, t: c.arrivalState.t })}` : '';
    if (c) log(`[${tag}] C-NOARRIVAL ${stamps}`);
    if (c && ran && (c.arrival > 0 || c.arrivalState)) fail(`[${tag}] C-NOARRIVAL: the warm tick ran (${c.warm}) and an arrival precompile ran as well (${c.arrival} record(s); ${stamps})`);
    else if (aw === 'pending') fail(`[${tag}] C-NOARRIVAL: an arrival precompile was scheduled while the warm tick was still pending (${stamps})`);
    else if (c && (c.khr !== true || (!ran && !(c.handoff && c.handoff.warm === 'pending')))) {
      const m = c.khr !== true ? `three sees no KHR_parallel_shader_compile, so no arrival can be scheduled and C-NOARRIVAL has no subject on this boot (${stamps})`
        : `the warm tick did not run and the keys handoff did not come while it was pending, so C-NOARRIVAL has no subject on this boot (${stamps})`;
      if (String(overrides['app/main.js'] || '').includes('/* PLANT: on every boot */')) fail(`[${tag}] INVALID (C-NOARRIVAL precondition): ${m}`); else log(`[${tag}] C note: ${m}`);
    }
    if (!c) fail(`[${tag}] C1-AHEAD: no compile census (window.__obCompileCensus) on a real-user boot`);
    else if (c.early.some((e) => e.why === 'gi-bind') || c.ahead.some((a) => a.why === 'gi-bind' && a.before)) fail(`[${tag}] INVALID (C1 precondition): the GI bound before the first delivered frame despite the hold (${JSON.stringify(c)})`);
    else if (c.ahead.some((a) => a.why === 'gi-bind' && !a.before && a.ms !== null && a.ms >= 1500)) fail(`[${tag}] INVALID (C1 precondition): the gi-bind hold met the 1.5 s bound (capped), so the frame after its release cannot be judged (${JSON.stringify(c.ahead)})`);
    else if (!c.ahead.some((a) => a.why === 'gi-bind' && a.n > 0)) fail(`[${tag}] C1-AHEAD: the GI bind compiled no program ahead (${JSON.stringify(c.ahead)})`);
    else if (c.syncOwned.length) fail(`[${tag}] C1-SYNC: the frame after the GI bind's hold compiled ${c.syncOwned.length} program(s) for the bind's materials inside a render or env bake (ids ${JSON.stringify(c.syncOwned)})`);
    else {
      // C3 (review P2): a bake between frames records its program at the bake site. A probe copy of a lit mesh with a unique define
      // joins the scene, the public re-bake seam runs from a timer (between frames), the probe leaves; the census must list the
      // probe's program under inBake via bakeEnvOnce, and nowhere else (not a render's entry, not "between steps", not dropped)
      const PROBE = `(() => new Promise((resolve) => setTimeout(() => { try {
        const D = window.__dbg; let src = null;
        D.scene.traverse((o) => { if (!src && o.isMesh && o.visible && o.layers.mask & 1 && o.material && !Array.isArray(o.material) && o.material.isMeshStandardMaterial) src = o; });
        if (!src || typeof window.__rebakeEnv !== 'function') { resolve({ err: 'no lit mesh or no window.__rebakeEnv' }); return; }
        const m = src.material.clone(); m.defines = Object.assign({}, m.defines, { OB_CENSUS_PROBE: 1 });
        const probe = new src.constructor(src.geometry, m); probe.name = 'obCensusProbe'; probe.matrixAutoUpdate = false; probe.matrix.copy(src.matrixWorld); probe.matrixWorldNeedsUpdate = true;
        D.scene.add(probe); window.__rebakeEnv(); D.scene.remove(probe);
        resolve({ ids: (D.renderer.info.programs || []).filter((x) => String(x.cacheKey || '').includes('OB_CENSUS_PROBE')).map((x) => x.id), src: src.name || src.type });
      } catch (e) { resolve({ err: e.message }); } }, 0)))()`;
      const forced = await leg.c.eval(PROBE).catch((e) => ({ err: String(e) }));
      await sleep(400);
      const SITES = `(() => { const C = window.__obCompileCensus(); const where = (ids) => ({
        inBake: C.inBake.filter((e) => e.programs.some((x) => ids.includes(x[0]))).map((e) => e.via || 'step'),
        inRender: C.inRender.filter((e) => e.programs.some((x) => ids.includes(x[0]))).length,
        between: (C.between || []).filter((e) => e.programs.some((x) => ids.includes(x[0]))).length,
        ahead: C.ahead.filter((a) => a.programs.some((x) => ids.includes(x[0]))).length }); return where(${JSON.stringify(forced?.ids || [])}); })()`;
      const at = forced && !forced.err && forced.ids.length ? await leg.c.eval(SITES).catch(() => null) : null;
      log(`[${tag}] C3 forced bake ${JSON.stringify(forced)} recorded ${JSON.stringify(at)}`);
      if (!forced || forced.err || !forced.ids.length) fail(`[${tag}] INVALID (C3 precondition): the forced bake made no probe program (${JSON.stringify(forced)})`);
      else if (!at || !(at.inBake.length === 1 && at.inBake[0] === 'bakeEnvOnce' && !at.inRender && !at.between && !at.ahead)) fail(`[${tag}] C3-SITE: the program a bake made between frames is not recorded at the bake site (${JSON.stringify(at)})`);
    }
  } finally { await closeLeg(leg); }
  // C2: the held step
  leg = await openLeg(PORT, cdp, { hold: false, holdGi: true, overrides });
  try {
    await leg.c.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/app.html?u=stall-compile-hold&table=pool_pro_9ft&obcompilehold=800` });
    if (!(await releaseAfterFirstFrame(leg))) { fail(`[${tag}] INVALID (C2 precondition): no frame was delivered while the GI assets were held`); return; }
    const HOLD = `(() => { const h = window.__obCompileHold; const C = window.__obCompileCensus?.();
      return h ? { pending: h.pending, capped: h.capped, heldTotal: h.heldTotal, frames: window.__test?.renderTimes?.length ?? null, heldDraws: (window.__obStall || {}).heldDraws,
        giBind: C ? C.ahead.filter((a) => a.why === 'gi-bind' && !a.beforeFirstDraw).map((a) => a.ms) : null } : null; })()`;
    let s1 = null; const t0 = Date.now();
    while (Date.now() - t0 < 60000) { s1 = await leg.c.eval(HOLD).catch(() => null); if (s1 && s1.pending > 0 && s1.frames > 0) break; await sleep(40); }
    if (!s1 || !(s1.pending > 0)) { fail(`[${tag}] INVALID (C2 precondition): no compile-ahead hold was observed after the first frame (${JSON.stringify(s1)})`); return; }
    // C2-RESIZE (review P2): a resize mid-hold waits for the release. setSize clears the drawing buffer, and a held loop has no frame
    // to repaint it, so the canvas would sit blank; held, the buffer keeps its size (and the last frame) until the release
    const BUF = `(() => { const g = window.__dbg?.renderer?.getContext?.(); const h = window.__obCompileHold; return g ? { w: g.drawingBufferWidth, h: g.drawingBufferHeight, pending: h ? h.pending : null, capped: h ? h.capped : null } : null; })()`;
    const r0 = await leg.c.eval(BUF).catch(() => null);
    await leg.c.send('Emulation.setDeviceMetricsOverride', { width: 1100, height: 700, deviceScaleFactor: 1, mobile: false });
    await sleep(150);
    const r1 = await leg.c.eval(BUF).catch(() => null);
    if (!r1 || !(r1.pending > 0 && !r1.capped)) { fail(`[${tag}] INVALID (C2 precondition): the hold ended before the resize sample (${JSON.stringify({ r0, r1 })})`); return; }
    await sleep(150);
    const s2 = await leg.c.eval(HOLD).catch(() => null);
    if (!s2 || !(s2.pending > 0)) { fail(`[${tag}] INVALID (C2 precondition): the hold ended before the second sample (${JSON.stringify(s2)})`); return; }
    const p = await waitFor(leg.c, (q) => q.ready, 60000);
    await sleep(800);
    const s3 = await leg.c.eval(HOLD).catch(() => null);
    const r2 = await leg.c.eval(BUF).catch(() => null);
    log(`[${tag}] C2 hold samples ${JSON.stringify({ s1, s2, s3 })} buffer ${JSON.stringify({ r0, r1, r2 })}`);
    if (r0 && r1 && (r1.w !== r0.w || r1.h !== r0.h)) fail(`[${tag}] C2-RESIZE: a resize mid-hold resized (and cleared) the drawing buffer while the loop was held (${r0.w}x${r0.h} -> ${r1.w}x${r1.h})`);
    if (r0 && r2 && r2.w === r0.w && r2.h === r0.h) fail(`[${tag}] C2-RESIZE: the held resize never landed after the release (${JSON.stringify({ r0, r2 })})`);
    if (s2.frames !== s1.frames) fail(`[${tag}] C2-HELD: ${s2.frames - s1.frames} frame(s) rendered while the compile-ahead held the loop`);
    if ((s3?.heldDraws || []).length) fail(`[${tag}] C2-HELD: ${s3.heldDraws.length} draw/clear call(s) reached the screen while held (${JSON.stringify(s3.heldDraws.slice(0, 4))})`);
    // released = the gi-bind hold's own record closed and the loop rendered after the second sample (a later B2 light-set hold,
    // stretched by the same seam, may be in force by now)
    if (!p?.ready || !(s3 && s3.frames > s2.frames && (s3.giBind || []).length > 0 && s3.giBind.every((ms) => ms !== null))) fail(`[${tag}] C2-RELEASE: the loop did not render again after the hold (${JSON.stringify(s3)})`);
  } finally { await closeLeg(leg); }
}

export async function legDispose({ PORT, cdp, fail, log = console.log, overrides = {} }) {
  // GH-1199: a material disposed before its compile-ahead program links must not throw. three r170's compileAsync poll read
  // currentProgram.isReady() on every material it compiled, and a disposed one has none: an uncaught TypeError (the error box;
  // before ready the BOOT FAILED card), and that compile-ahead never settled. Deterministic: after the first frame a wrapper on
  // renderer.compile disposes one returned material whose program is still linking, in a microtask (after the poll's immediate
  // check, before its 10 ms tick), and that program reads unfinished until the disposal has run (a link landing between the
  // probe and the poll's first check would otherwise let the poll drop the material first, review P2); the GI bind's
  // compile-ahead (the GI assets held until the first frame) or any compile-ahead that comes first is the subject.
  // D1: no page error, that compile-ahead settles without the 5 s pending cap, frames continue
  const tag = 'dispose';
  const FRAMES = `(() => window.__test?.renderTimes?.length ?? 0)()`;
  const ARM = `(() => { const r = window.__dbg && window.__dbg.renderer; if (!r) return false; if (r.__obDisposeArmed) return true;
    const orig = r.compile.bind(r); window.__obDisposeLog = []; window.__obPageErrors = [];
    window.addEventListener('error', (e) => window.__obPageErrors.push(String(e.message || e.error || e)));
    r.compile = function (...a) { const mats = orig(...a);
      if (!window.__obDisposeLog.length) for (const m of mats) { const pr = r.properties.get(m).currentProgram;
        if (pr && !pr.isReady()) { const t = Math.round(performance.now()), id = m.uuid; window.__obDisposeLog.push({ t, id, done: false });
          const ready = pr.isReady; pr.isReady = () => false; // three's own isReady is back once the material is gone
          queueMicrotask(() => { m.dispose(); pr.isReady = ready; window.__obDisposeLog[0].done = true; }); break; } }
      return mats; };
    r.__obDisposeArmed = true; return true; })()`;
  const READ = `(() => { const C = window.__obCompileCensus?.(); const d = (window.__obDisposeLog || [])[0] || null;
    // the compile-ahead whose renderer.compile call disposed it: the latest record that started at most 200 ms before the disposal
    const rec = d && C ? [...C.ahead].reverse().find((a) => a.t <= d.t && a.t >= d.t - 200) || null : null;
    return { dispose: d, rec: rec && { why: rec.why, t: rec.t, ms: rec.ms, held: rec.held, timedOut: !!rec.timedOut },
      errors: window.__obPageErrors || [], appErrors: (window.__test && window.__test.errors || []).slice(), frames: window.__test?.renderTimes?.length ?? 0 }; })()`;
  const leg = await openLeg(PORT, cdp, { hold: false, holdGi: true, overrides });
  try {
    await leg.c.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/app.html?u=stall-dispose&table=pool_pro_9ft` });
    const t0 = Date.now(); let f = 0;
    while (Date.now() - t0 < 120000) { f = await leg.c.eval(FRAMES).catch(() => 0); if (f > 0) break; await sleep(40); }
    if (!(f > 0)) { fail(`[${tag}] INVALID (precondition): no frame was delivered while the GI assets were held`); return; }
    if (!(await leg.c.eval(ARM).catch(() => false))) { fail(`[${tag}] INVALID (precondition): could not arm the compile wrapper`); return; }
    await leg.c.eval(STAND_IN).catch(() => {});
    leg.releaseGi();
    let r = null; const t1 = Date.now();
    while (Date.now() - t1 < 60000) { r = await leg.c.eval(READ).catch(() => null); if (r?.dispose?.done) break; await sleep(40); }
    if (!r?.dispose?.done) { fail(`[${tag}] INVALID (precondition): no compile-ahead disposed a material mid-poll (${JSON.stringify(r)})`); return; }
    const f0 = r.frames;
    await sleep(6000); // past COMPILE_PENDING_CAP_MS: an unsettled poll would show as timedOut by now
    r = await leg.c.eval(READ).catch(() => null);
    log(`[${tag}] D1 ${JSON.stringify(r)}`);
    const errs = [...(r?.errors || []), ...(r?.appErrors || [])];
    if (errs.length) fail(`[${tag}] D1-ERROR: ${errs.length} page error(s) after a material was disposed mid compile-ahead (${JSON.stringify(errs.slice(0, 3))})`);
    if (!r?.rec || r.rec.ms === null || r.rec.timedOut) fail(`[${tag}] D1-SETTLE: the compile-ahead that lost a material did not settle on its own (${JSON.stringify(r?.rec ?? null)})`);
    if (!(r && r.frames > f0)) fail(`[${tag}] D1-FRAMES: no frame rendered after the disposal (${f0} -> ${r?.frames})`);
  } finally { await closeLeg(leg); }
}

export async function legLightset({ PORT, cdp, fail, log = console.log, overrides = {} }) {
  // GH-1174 B2 + GH-1202: metal_rim with ?obholdlight=1500 changes its light set after the first draw (the rig lands late, the FRESH
  // hall arrival joins the hall keys). While the boot overlay covers the canvas a light-set compile-ahead may hold the step; once it
  // starts fading none holds, and a light-set change arrives staged (window.__obStage: the shell's hall keys, the lighting leaf's
  // rig), so its programs have linked before a frame draws it. L1 (that boot; the arm holds the lighting leaf's module until the
  // overlay starts fading, so the rig lands after it whatever the host's pace, and ?obgatetail=30000 keeps the gate armed then; the
  // rig swap's GI re-bind after it must arrive staged): no compile-ahead held after the overlay; no gate or
  // relight compile after the overlay had to make programs (a change that reached the gate unstaged); no lit program links inside a
  // delivered frame and no delivered frame waits on a link a gate compile still has in flight. L2 (after ready): with the overlay
  // kept up (a stand-in #ob-boot the arm adds) a light join holds the step until its programs link, draws / clears nothing on the
  // screen and renders no frame meanwhile, then the loop renders again (the ?obcompilehold seam stretches it); with the overlay gone a
  // raw join compiles ahead without holding (a stale owner's path), and a staged one lands only once every program its stage
  // compiled has linked, with frames rendering the current set meanwhile and none drawing the light early
  const tag = 'lightset';
  const url = (u, q = '') => `http://127.0.0.1:${PORT}/app.html?u=${u}&table=pool_pro_9ft_metal_rim&obholdlight=1500&obgatetail=30000${q}`;
  const census = `(() => { const C = window.__obCompileCensus?.(); const D = window.__dbg; if (!C || !D) return null; const R = window.__obStall || {};
    const CAP = 1500; const lit = (t) => /^Mesh(Standard|Physical|Lambert|Phong|Toon)Material$/.test(t);
    const g = C.ahead.filter((a) => (a.why === 'light-set' || a.why === 'relight') && !a.beforeFirstDraw);
    // frames after the first draw only (inRender holds no other), judged while the gate is armed: it stops GATE_BOOT_TAIL_MS after
    // the later of ready and the fade's start (#1202 build 21). On the default venue-on path production ready waits for the lighting leaf, so a real rig lands inside the tail (not on a
    // venue-off boot the hold cap releases, nor a leaf stalled past VENUE_GI_WINDOW_MS); under ?obholdlight ready does not wait, and
    // on a loaded host the seam's late rig can land after the tail (seen locally: 11 programs at 10.6 s). Those links are outside
    // B2's boot scope, so they are logged, not judged
    const off = C.gate && C.gate.disarmed ? C.gate.disarmed.t : null;
    const armed = (t) => off === null || t < off;
    const litOf = (e) => e.programs.filter((x) => lit(x[1])).map((x) => [e.frame, x[0], x[1]]);
    const syncLit = C.inRender.filter((e) => armed(e.t)).flatMap(litOf);
    const lateLit = C.inRender.filter((e) => !armed(e.t)).map((e) => [e.t, ...litOf(e)]).filter((x) => x.length > 1);
    const waits = (R.linkWaits || []).filter((w) => w[1] && g.some((a) => w[0] >= a.t && w[0] < a.t + Math.min(a.ms ?? CAP, CAP)));
    return { khr: D.renderer.extensions.has('KHR_parallel_shader_compile'), gateLog: C.gate ? C.gate.log : null,
      gate: g.map((a) => ({ why: a.why, n: a.programs.length, held: a.held, overlay: a.overlay, ms: a.ms, t: a.t })), syncLit, waits, disarmed: C.gate ? C.gate.disarmed : null, lateLit,
      heldAfter: C.ahead.filter((a) => a.held && a.overlay === false).map((a) => [a.why, a.t, a.ms]), stage: (C.stage || []).slice(0, 12),
      giAfter: C.ahead.filter((a) => a.why === 'gi-bind' && a.overlay === false).map((a) => [a.t, a.programs.length]),
      giStage: (C.stage || []).filter((s) => s.why === 'gi-bind').map((s) => [s.t, s.mode, s.programs]),
      settled: g.length > 0 && g.every((a) => a.ms !== null), inRender: C.inRender.map((e) => [e.t, e.frame, e.programs.length]),
      hallOther: C.hallOther || null, stageAll: (C.stage || []).map((s) => [s.t, s.why, s.mode, s.ms]),
      hallAhead: C.ahead.filter((a) => /:hall-other$/.test(a.why)).map((a) => [a.t, a.why]),
      arrivalRec: C.ahead.filter((a) => a.why === 'arrival:hall-other').map((a) => [a.t, a.overlay, a.programs.length, a.ms]),
      deltaRec: C.ahead.filter((a) => /:delta:hall-other$/.test(a.why)).map((a) => [a.t, a.overlay, a.programs.length, a.ms]),
      joins: (C.stage || []).filter((s) => s.why === 'shell:hall-keys-join').map((s) => [s.t, s.mode, s.programs, s.ms, s.named || null]),
      prejoin: (C.stage || []).filter((s) => s.why === 'shell:hall-keys-prejoin').map((s) => [s.t, s.mode, s.programs, s.ms]),
      quiet: C.quiet || null, residual: C.residual || null, fadeAt: (window.__obStall || {}).fadeAt ?? null, quietAtFade: (window.__obStall || {}).quietAtFade ?? null,
      arrival: (C.hallOther && C.hallOther.arrival) || null, handoff: (C.hallOther && C.hallOther.handoff) || null, delta: (C.hallOther && C.hallOther.delta) || null }; })()`;
  let leg = await openLeg(PORT, cdp, { hold: false, holdLeaf: true, overrides });
  try {
    await leg.c.send('Page.navigate', { url: url('stall-lightset') });
    const p = await waitFor(leg.c, (q) => q.ready, 150000);
    if (!p?.ready) { fail(`[${tag}] INVALID (precondition): the boot never reached ready`); return; }
    // the lighting leaf goes once the overlay starts fading (under ?obholdlight ready does not wait for it)
    let out = false; const tf = Date.now();
    while (!out && Date.now() - tf < 20000) { out = await leg.c.eval(`(() => { const b = document.getElementById('ob-boot'); return !b || b.classList.contains('ob-boot--out'); })()`).catch(() => false); if (!out) await sleep(50); }
    if (!out) { fail(`[${tag}] INVALID (precondition): the boot overlay never started fading after ready`); return; }
    if (!leg.releaseLeaf()) log(`[${tag}] L1 note: no lighting-leaf request was held at the overlay's fade (it had not been asked for yet)`);
    // a GI bind after the overlay (the rig swap re-keys the room) goes through the stage: its record is 'staged' (none is before it)
    const giLate = (x) => (x?.giStage || []).filter((s) => s[1] === 'staged');
    // ready does not wait for the rig under ?obholdlight: wait (bounded) for the gate's compiles after the first draw to link,
    // then for the FRESH hall arrival
    let c = null; const t0 = Date.now();
    while (Date.now() - t0 < 30000) { c = await leg.c.eval(census).catch(() => null); if (c && c.settled && c.gate.length >= 2 && (c.giAfter.length || giLate(c).length)) break; await sleep(200); }
    await sleep(2500);
    c = await leg.c.eval(census).catch(() => null);
    log(`[${tag}] L1 census ${JSON.stringify(c)}`);
    if (!c) fail(`[${tag}] L1-AHEAD: no compile census (window.__obCompileCensus) on a real-user boot`);
    else if (c.khr !== true) fail(`[${tag}] INVALID (L1 precondition): three sees no KHR_parallel_shader_compile on this host, so the gate is off by design`);
    else if (!c.gate.length) fail(`[${tag}] INVALID (L1 precondition): the light set never changed after the first draw (no gate or relight compile)`);
    else if (!c.gate.some((a) => a.why === 'relight' && a.overlay === false)) fail(`[${tag}] INVALID (L1 precondition): the late rig's relight did not reach the gate after the overlay, so L1 has no subject (${JSON.stringify(c.gate.map((a) => [a.why, a.t, a.overlay]))})`);
    else {
      // each L1 assertion is judged on its own, so a defect that breaks two of them shows both
      if (c.heldAfter.length) fail(`[${tag}] L1-NOHOLD: ${c.heldAfter.length} compile-ahead(s) held the step after the overlay started fading (${JSON.stringify(c.heldAfter.slice(0, 4))})`);
      const unstaged = c.gate.filter((a) => a.overlay === false && a.n > 0);
      if (unstaged.length) fail(`[${tag}] L1-STAGE: ${unstaged.length} light-set change(s) after the overlay reached the gate unstaged (it had to compile ${unstaged.map((a) => a.n).join('/')} program(s): ${JSON.stringify(unstaged.slice(0, 3))})`);
      if (c.giAfter.length) fail(`[${tag}] L1-GI: ${c.giAfter.length} GI bind(s) after the overlay compiled ahead unstaged (${JSON.stringify(c.giAfter.slice(0, 3))})`);
      else if (c.giStage.some((s) => s[1] === 'unstaged')) fail(`[${tag}] L1-GI: a GI bind after the overlay could not be staged (${JSON.stringify(c.giStage)})`);
      else if (!giLate(c).length) fail(`[${tag}] INVALID (L1-GI precondition): no GI bind after the overlay (the rig swap's re-bind) to judge (${JSON.stringify(c.giStage)})`);
      if (c.syncLit.length) fail(`[${tag}] L1-SYNC: ${c.syncLit.length} lit program(s) linked inside a delivered frame after the first draw (${JSON.stringify(c.syncLit.slice(0, 6))})`);
      if (c.waits.length) fail(`[${tag}] L1-SYNC: ${c.waits.length} delivered frame render(s) waited on a link a gate compile still had in flight (${JSON.stringify(c.waits.slice(0, 6))})`);
      if (c.lateLit.length) log(`[${tag}] L1 note: lit links after the gate's boot tail (disarmed ${JSON.stringify(c.disarmed)}): ${JSON.stringify(c.lateLit.slice(0, 4))} — outside B2's scope; the ?obholdlight rig landed late on this host`);
      // L1-ARRIVAL (GH-1202 b-fix): under ?obholdlight the GH-910 warm tick does not run (keyWarm 'n/a'), so the hall keys' joined
      // variants compile ahead from the keys handoff while #ob-boot is up (judgeArrival below; on this boot the shell normally lands
      // before ready, so the arrival is budgeted throughout, and a late shell met here by chance is judged as one). r8: a GI bind that
      // lands under the overlay after the arrival compiled is followed by the arrival's delta, judged here whenever it ran (judgeDelta)
      judgeArrival(tag, c, fail, log, { plant: String(overrides['app/main.js'] || '') });
      judgeDelta(tag, c, fail, log, { plant: String(overrides['app/main.js'] || '') });
      // L1-OWE (GH-1202): a hall-other compile skipped for a pending stage is owed. By the end of its stage batch the debt is
      // paid: the owed run right after the batch's last apply (or a direct run once no stage is pending), within 50 ms of that
      // apply; an owed run must compile (status 'compiled', or 'no-keys' when the boot has no hall keys). Without the debt it
      // waits for the gate's next key change, and a timer re-bake can link the batch inline first. A debt still open when the
      // census was read is waited for (a stage still pending), 5 s at most. A boot with no skip has no subject: a note, except on
      // the owe plants (marked 'PLANT: the owed hall-other'), where it is INVALID (they must meet their subject)
      let H = c.hallOther; const tw = Date.now();
      while (H && H.debt !== null && Date.now() - tw < 5000) { await sleep(200); const c2 = await leg.c.eval(census).catch(() => null); if (c2) { c = c2; H = c2.hallOther; } }
      const owePlant = typeof overrides['app/main.js'] === 'string' && overrides['app/main.js'].includes('PLANT: the owed hall-other');
      if (!H) fail(`[${tag}] L1-OWE: no hall-other accounting in the compile census (window.__obCompileCensus().hallOther)`);
      else if (H.debt !== null) fail(`[${tag}] L1-OWE: a hall-other compile skipped for a pending stage was still owed 5 s after the boot settled (${JSON.stringify(H)})`);
      else if (!H.skipped.length) {
        if (owePlant) fail(`[${tag}] INVALID (L1-OWE precondition): no hall-other compile was skipped for a pending stage, so the owed-run check has no subject`);
        else log(`[${tag}] L1 note: no hall-other compile was skipped for a pending stage on this boot, so the owed-run check had no subject`);
      } else {
        const lastSkip = H.skipped[H.skipped.length - 1][0];
        const pay = H.paid.find((p) => p[0] >= lastSkip);
        const applies = pay ? c.stageAll.filter((s) => s[2] === 'staged' && s[3] !== null).map((s) => s[0] + s[3]).filter((a) => a >= lastSkip && a <= pay[0] + 1) : [];
        const lastApply = applies.length ? Math.max(...applies) : null;
        if (!pay) fail(`[${tag}] L1-OWE: ${H.skipped.length} hall-other compile(s) skipped for a pending stage were never paid (skipped ${JSON.stringify(H.skipped)}; paid ${JSON.stringify(H.paid)}; dropped ${JSON.stringify(H.dropped)})`);
        else if (lastApply === null || pay[0] - lastApply > 50) fail(`[${tag}] L1-OWE: the debt of the last skip (${lastSkip} ms) was paid at ${pay[0]} ms (${pay[2]}), ${lastApply === null ? 'with no staged apply between' : `${pay[0] - lastApply} ms after its batch's last apply`}: not at the batch's end`);
        else if (pay[2] === 'owed' && pay[3] !== 'compiled' && pay[3] !== 'no-keys') fail(`[${tag}] L1-OWE: the owed run at the batch's end compiled nothing (status ${JSON.stringify(pay[3])})`);
        else if (pay[2] === 'owed' && pay[3] === 'compiled' && !c.hallAhead.some((a) => a[1].endsWith(':owed:hall-other') && a[0] >= pay[0] - 1)) fail(`[${tag}] L1-OWE: the owed run made no ':owed:hall-other' compile-ahead record (${JSON.stringify(c.hallAhead.slice(-4))})`);
        else if (pay[2] === 'owed' && pay[3] === 'no-keys') log(`[${tag}] L1 note: the owed hall-other run found no hall keys to compile (${JSON.stringify(pay)})`);
      }
    }
  } finally { await closeLeg(leg); }
  // L2: injected changes after ready, on a boot without the late rig (?obcompilehold=800 stretches a hold so it can be judged;
  // ?obgatetail=30000 keeps the gate armed through the injected joins, whatever the host's pace through the boot tail). A
  // zero-intensity copy of one of the scene's spot / point lights changes the light count, so every lit program's key
  leg = await openLeg(PORT, cdp, { hold: false, overrides });
  try {
    await leg.c.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/app.html?u=stall-lightset-hold&table=pool_pro_9ft_metal_rim&obcompilehold=800&obgatetail=30000` });
    const p0 = await waitFor(leg.c, (q) => q.ready, 150000);
    if (!p0?.ready) { fail(`[${tag}] INVALID (L2 precondition): the boot never reached ready`); return; }
    // the stand-in below must be the only #ob-boot, so wait until the real overlay has faded out and left the DOM
    let gone = false; const tg = Date.now();
    while (!gone && Date.now() - tg < 20000) { gone = await leg.c.eval(`!document.getElementById('ob-boot')`).catch(() => false); if (!gone) await sleep(100); }
    if (!gone) { fail(`[${tag}] INVALID (L2 precondition): the boot overlay never left the DOM after ready`); return; }
    await sleep(1500); // the boot's own tail (hall keys, the GI bind) settles first
    const SRC = `let src = null; D.scene.traverse((o) => { if (!src && o.visible && (o.isSpotLight || o.isPointLight) && !/^ob(Gate|Raw|Stage)Probe/.test(o.name)) src = o; })`;
    const HOLD = `(() => { const h = window.__obCompileHold; const C = window.__obCompileCensus?.(); const a = C && C.ahead.length ? C.ahead[C.ahead.length - 1] : null;
      return h ? { pending: h.pending, capped: h.capped, heldTotal: h.heldTotal, why: a ? a.why : null, held: a ? a.held : null, overlay: a ? a.overlay : null, n: C.ahead.length,
        frames: window.__test?.renderTimes?.length ?? null, heldDraws: (window.__obStall || {}).heldDraws, waits: ((window.__obStall || {}).linkWaits || []).filter((w) => w[1]).length,
        inRender: C.inRender.length } : null; })()`;
    // L2-HOLD: the overlay kept up by a stand-in #ob-boot (hidden; main.js reads only its presence and class)
    const ADD = (name, cover) => `(() => { const D = window.__dbg; ${SRC};
      if (!src || !src.parent) return { err: 'no visible spot or point light' };
      if (${cover}) { const f = document.createElement('div'); f.id = 'ob-boot'; f.hidden = true; f.dataset.obArmStandIn = '1'; document.body.appendChild(f); }
      const l = src.clone(); l.intensity = 0; l.name = '${name}'; src.parent.add(l); return { added: l.type, at: Math.round(performance.now()) }; })()`;
    const UNCOVER = `(() => { const f = document.querySelector('#ob-boot[data-ob-arm-stand-in]'); if (f) f.remove(); return !!f; })()`;
    const b0 = await leg.c.eval(HOLD).catch(() => null);
    const added = await leg.c.eval(ADD('obGateProbeLight', true)).catch((e) => ({ err: String(e) }));
    if (!added || added.err) { fail(`[${tag}] INVALID (L2 precondition): no light could join (${JSON.stringify(added)})`); return; }
    const gateHold = (s) => !!(s && s.pending > 0 && s.frames > 0 && s.held && s.why === 'light-set');
    let s1 = null; const t0 = Date.now();
    while (Date.now() - t0 < 10000) { s1 = await leg.c.eval(HOLD).catch(() => null); if (gateHold(s1) || (s1 && s1.n > (b0?.n ?? 0) && s1.held === false)) break; await sleep(20); }
    if (!gateHold(s1)) {
      fail(`[${tag}] L2-HOLD: with the overlay up, a light join did not hold the step (${JSON.stringify({ added, s1 })})`);
    } else {
      await sleep(300);
      const s2 = await leg.c.eval(HOLD).catch(() => null);
      if (!s2 || !(s2.pending > 0)) { fail(`[${tag}] INVALID (L2 precondition): the gate hold ended before the second sample (${JSON.stringify(s2)})`); await leg.c.eval(UNCOVER).catch(() => {}); return; }
      let s3 = null; const t3 = Date.now();
      while (Date.now() - t3 < 6000) { s3 = await leg.c.eval(HOLD).catch(() => null); if (s3 && s3.frames > s2.frames) break; await sleep(100); }
      log(`[${tag}] L2 hold samples ${JSON.stringify({ s1, s2, s3, releasedAfterMs: Date.now() - t3 })}`);
      if (s2.frames !== s1.frames) fail(`[${tag}] L2-HELD: ${s2.frames - s1.frames} frame(s) rendered while a gate compile-ahead held the loop`);
      if ((s3?.heldDraws || []).length) fail(`[${tag}] L2-HELD: ${s3.heldDraws.length} draw/clear call(s) reached the screen while held (${JSON.stringify(s3.heldDraws.slice(0, 4))})`);
      if (!(s3 && s3.frames > s2.frames)) fail(`[${tag}] L2-RELEASE: the loop did not render again within 6 s of the second sample (${JSON.stringify(s3)})`);
      await sleep(500);
      const s4 = await leg.c.eval(HOLD).catch(() => null);
      if (s4 && b0 && (s4.waits > s1.waits || s4.inRender > b0.inRender)) fail(`[${tag}] L2-SYNC: after the held join, ${s4.waits - s1.waits} frame render(s) waited on a link and ${s4.inRender - b0.inRender} render(s) linked programs inline`);
    }
    await leg.c.eval(UNCOVER).catch(() => {});
    await sleep(800);
    // L2-NOHOLD: the overlay gone, a raw join (an owner without the staging seam) compiles ahead and never holds
    const r0 = await leg.c.eval(HOLD).catch(() => null);
    await leg.c.eval(ADD('obRawProbeLight', false)).catch(() => null);
    let r1 = null; let held = 0; const tr = Date.now();
    while (Date.now() - tr < 2000) { r1 = await leg.c.eval(HOLD).catch(() => null); if (r1 && r1.pending > 0) held += 1; await sleep(40); }
    log(`[${tag}] L2 raw join ${JSON.stringify({ r0, r1, heldSamples: held })}`);
    if (!(r1 && r1.n > r0.n)) fail(`[${tag}] INVALID (L2 precondition): the raw join started no compile-ahead (${JSON.stringify({ r0, r1 })})`);
    else if (held || r1.heldTotal > r0.heldTotal) fail(`[${tag}] L2-NOHOLD: with the overlay gone, a raw light join held the step (${held} held sample(s), heldTotal ${r0.heldTotal} -> ${r1.heldTotal})`);
    // L2-STAGE: the overlay gone, a staged join (window.__obStage.lightSet) lands only once every program its stage compiled has linked.
    // The link race is forced: the arm's revert compiles the reverted state over the draw set (on the RenderPass target), so every
    // material points at its old, linked program again, as a frame drawn in the reverted state does for what it draws, and until
    // SLOW_MS after it the programs the stage compiled read unfinished (COMPLETION_STATUS_KHR false on the context three polls).
    // A poll of currentProgram then sees every program done while the staged ones are not
    const STAGE = `(async () => { const D = window.__dbg; const S = window.__obStage; if (!S || typeof S.lightSet !== 'function') return { err: 'no window.__obStage.lightSet' };
      ${SRC}; if (!src || !src.parent) return { err: 'no visible spot or point light' };
      const l = src.clone(); l.intensity = 0; l.name = 'obStageProbeLight'; const par = src.parent; const gl = D.renderer.getContext();
      // the programs the stage itself compiled: those made between its first apply() and its revert()
      const progIds = () => new Set((D.renderer.info.programs || []).map((p) => p.id)); let atStage = null; let staged = null;
      const seen = []; let applies = 0; let reverts = 0; let realAt = null; let unfinished = null;
      // the draw set as main.js compiles it (the visible chain on the camera's layers, no frustum test) and its materials
      const objs = []; D.scene.traverseVisible((o) => { if ((o.isMesh || o.isPoints || o.isLine || o.isSprite) && o.layers.test(D.camera.layers)) objs.push(o); });
      const mats = new Set(objs.flatMap((o) => [].concat(o.material || [])));
      const pointed = (prog) => { for (const m of mats) if (D.renderer.properties.get(m).currentProgram?.program === prog) return true; return false; };
      const SLOW_MS = 500; let slow = null; let revertAt = 0; let abandoned = null; let repointMade = null;
      const gpp = gl.getProgramParameter; const own = Object.prototype.hasOwnProperty.call(gl, 'getProgramParameter');
      gl.getProgramParameter = function (prog, pname) { if (pname === 0x91B1 && slow && slow.has(prog) && performance.now() - revertAt < SLOW_MS) return false; return gpp.call(this, prog, pname); };
      const comp = D.composer; const o = comp.render; comp.render = function (...a) { seen.push([Math.round(performance.now()), !!l.parent]); return o.apply(this, a); };
      const h0 = window.__obCompileHold.heldTotal, f0 = window.__test.renderTimes.length, t0 = performance.now();
      const r = await S.lightSet({ why: 'arm:stage',
        revert: () => { reverts += 1; par.remove(l);
          if (reverts === 1 && atStage) { staged = (D.renderer.info.programs || []).filter((p) => !atStage.has(p.id)); const ids = progIds(); const rt = D.renderer.getRenderTarget();
            try { D.renderer.setRenderTarget(D.composer.readBuffer); D.renderer.compile({ traverse: (cb) => { for (const o of objs) cb(o); }, traverseVisible: () => {} }, D.camera, D.scene); } finally { D.renderer.setRenderTarget(rt); }
            repointMade = (D.renderer.info.programs || []).filter((p) => !ids.has(p.id)).length; slow = new Set(staged.map((p) => p.program)); revertAt = performance.now(); } },
        apply: () => { applies += 1; if (applies === 1) atStage = progIds();
          if (applies === 2) { realAt = Math.round(performance.now()); unfinished = (staged || []).filter((p) => gl.getProgramParameter(p.program, 0x91B1) === false).length;
            abandoned = (staged || []).filter((p) => !pointed(p.program)).length; }
          par.add(l); } });
      await new Promise((res) => setTimeout(res, 400)); comp.render = o; if (own) gl.getProgramParameter = gpp; else delete gl.getProgramParameter;
      const C = window.__obCompileCensus(); const rec = (C.stage || []).filter((s) => s.why === 'arm:stage').pop() || null;
      return { r, applies, reverts, staged: staged ? staged.length : null, repointMade, revertAt: Math.round(revertAt), realAt, unfinished, abandoned, rec, ms: Math.round(performance.now() - t0), heldDelta: window.__obCompileHold.heldTotal - h0,
        framesDuring: seen.filter((s) => realAt !== null && s[0] < realAt).length, early: seen.filter((s) => (realAt === null || s[0] < realAt) && s[1]).length,
        frames: window.__test.renderTimes.length - f0 }; })()`;
    const st = await leg.c.eval(STAGE, { awaitPromise: true }).catch((e) => ({ err: String(e) }));
    log(`[${tag}] L2 staged join ${JSON.stringify(st)}`);
    if (!st || st.err) fail(`[${tag}] L2-STAGED: the staging seam could not run (${JSON.stringify(st)})`);
    else if (st.r === 'staged' && !(st.rec && st.rec.programs > 0)) fail(`[${tag}] INVALID (L2 precondition): the staged join re-keyed no program (${JSON.stringify(st.rec)})`);
    else {
      if (st.r !== 'staged' || st.applies !== 2) fail(`[${tag}] L2-STAGED: with the overlay gone the join was not staged ('${st.r}', apply ran ${st.applies} time(s))`);
      if (st.heldDelta > 0) fail(`[${tag}] L2-NOHOLD: the staged join held ${st.heldDelta} step(s)`);
      if (st.r === 'staged' && !(st.framesDuring > 0)) fail(`[${tag}] L2-FRAMES: no frame rendered while the stage waited for its programs (${st.framesDuring})`);
      if (st.early > 0) fail(`[${tag}] L2-EARLY: ${st.early} frame(s) drew the staged light before the change applied`);
      if (st.unfinished > 0) fail(`[${tag}] L2-LINKED: ${st.unfinished} program(s) the stage compiled had not finished linking when the change applied`);
      else if (st.r === 'staged' && st.reverts === 1 && !(st.abandoned > 0)) fail(`[${tag}] INVALID (L2 precondition): no frame drawn in the reverted state left a staged program behind, so the forced link race did not arise (${JSON.stringify({ framesDuring: st.framesDuring, staged: st.staged, abandoned: st.abandoned })})`);
    }
  } finally { await closeLeg(leg); }
}

// GH-1202 b-fix: the arrival precompile's checks (L1-ARRIVAL), shared by legs lightset (the shell normally lands before ready) and
// lateshell (the shell held until ready). Counts only, never time. A budgeted arrival (ready not yet held at scheduling): every record
// with the overlay up and before the first staged hall-keys join, no step over main.js's ARRIVAL_STEP_OBJECTS, one record and one task
// per step (main.js counts the tasks where they enter the chain), and the steps covering the whole list, or, when the overlay's fade cut
// the chain (nothing waits on it), at least the join's draw set, which the list puts first. A late arrival (ready already held: a late
// shell, which app.html fades one poll after the FRESH arrival resolves; maintainer ruling (A)): its first step compiled the join's whole
// draw set unbudgeted, and the budgeted rest may be cut by the fade. Either way the first staged join compiles nothing at the
// overlay-out, an ended chain (any state but scheduled / running) has closed its channel and dropped its list (review P2), and a
// budgeted arrival neither starts nor compiles a step while a held compile-ahead is pending (r7, readiness). Its
// no-subject reports are INVALID tagged 'L1-ARRIVAL precondition', so a plant loop reruns them only for L1-ARRIVAL plants. r8: the
// evidence prints the GI bind's stage records and the delta beside the arrival, and a join's record names each program it compiled
// ([material type, name, its key against the arrival's program for that material]), so a red is a program-level diagnosis
const ARRIVAL_STEP_OBJECTS = 64; // main.js's cap per budgeted arrival step (its record carries it too)
// #1202 build 21: a covered FRESH boot (the shell pre-joins the hall keys under the overlay, 'shell:hall-keys-prejoin' 'immediate')
// has no staged join at the flip, so its subject is the pre-join: 'immediate', before the real fade; no staged 'shell:hall-keys-join'
// after it (the flip adopts the joined keys; a boot refused at createShell and allowed at the flip has no pre-join and keeps the staged
// join rules below); and an arrival that ran compiled the current, pre-joined state (record current: true) and ended before the fade.
// The draws themselves are L1-QUIET's (leg quiet). Counts and order only, never time.
function judgeCovered(tag, c, fail, log) {
  const pre = [...c.prejoin].sort((a, b) => a[0] - b[0])[0]; const A = c.arrival; const joins = [...(c.joins || [])].sort((a, b) => a[0] - b[0]);
  log(`[${tag}] L1-ARRIVAL covered evidence ${JSON.stringify({ prejoin: c.prejoin, joins, fadeAt: c.fadeAt, arrival: A && { state: A.state, current: A.current ?? null, end: A.end, cut: A.cut } })}`);
  if (pre[1] !== 'immediate') fail(`[${tag}] L1-ARRIVAL: the covered boot's pre-join was not applied at once under the overlay (mode ${pre[1]}: ${JSON.stringify(pre)})`);
  if (c.fadeAt !== null && c.fadeAt !== undefined && !(pre[0] <= c.fadeAt)) fail(`[${tag}] L1-ARRIVAL: the covered boot's pre-join (${pre[0]} ms) came after the fade (${c.fadeAt} ms)`);
  if (joins.length) fail(`[${tag}] L1-ARRIVAL: a covered boot staged ${joins.length} hall-keys join(s) after its pre-join (${JSON.stringify(joins.slice(0, 3))}); the flip must adopt the joined keys`);
  if (A && A.ran !== null) {
    if (A.current !== true) fail(`[${tag}] L1-ARRIVAL: on a covered boot the arrival compiled the other state, not the pre-joined current one (${JSON.stringify({ state: A.state, current: A.current ?? null })})`);
    if (['scheduled', 'running'].includes(A.state) && c.fadeAt !== null) fail(`[${tag}] L1-ARRIVAL: the arrival was still ${A.state} after the fade (quiet should have held it)`);
  }
}
function judgeArrival(tag, c, fail, log, { needLate = false, plant = '' } = {}) {
  if (Array.isArray(c.prejoin) && c.prejoin.length) { judgeCovered(tag, c, fail, log); return; }
  const arr = c.arrivalRec || []; const A = c.arrival; const joins = [...(c.joins || [])].sort((a, b) => a[0] - b[0]);
  const steps = A && Array.isArray(A.steps) ? A.steps : []; const nsteps = A && typeof A.nsteps === 'number' ? A.nsteps : steps.length;
  log(`[${tag}] L1-ARRIVAL evidence ${JSON.stringify({ firstJoin: joins[0] || null, records: arr.length, overlayAll: arr.every((r) => r[1] === true), khr: c.khr ?? null,
    handoff: c.handoff || null, gi: c.giStage ? c.giStage.slice(0, 2) : null, delta: c.delta ? [c.delta.t, c.delta.why, c.delta.state, c.delta.objects, c.delta.programs, c.delta.nsteps] : null,
    arrival: A && { via: A.via, warm: A.warm, ready: A.ready, readyNow: A.readyNow, late: A.late, state: A.state, t: A.t,
      ran: A.ran, end: A.end, cut: A.cut, objects: A.objects, drawSet: A.drawSet, done: A.done, cap: A.cap, tasks: A.tasks, nsteps,
      holdAtSchedule: A.holdAtSchedule, holdAtStart: A.holdAtStart, duringHold: A.duringHold, waited: A.waited,
      maxObjects: Math.max(0, ...steps.map((x) => x[0])), maxMs: Math.max(0, ...steps.map((x) => x[2])) } })}`);
  const stamps = JSON.stringify({ handoff: c.handoff || null, khr: c.khr ?? null, arrival: A && { ready: A.ready, readyNow: A.readyNow, late: A.late, warm: A.warm, t: A.t, state: A.state, cut: A.cut } });
  const invalid = (m) => fail(`[${tag}] INVALID (L1-ARRIVAL precondition): ${m} (${stamps})`);
  if (!joins.length) { invalid(`no hall-keys join was staged on this boot, so L1-ARRIVAL has no subject (${JSON.stringify(c.stageAll)})`); return; }
  if (joins[0][1] !== 'staged') { invalid(`the first hall-keys join was not staged (mode ${joins[0][1]}), so its zero-program clause has no subject (${JSON.stringify(joins[0])})`); return; }
  const late = !!(A && A.ready === true);
  if (needLate && !late) { invalid(A ? 'the arrival was scheduled before ready held, so this boot is no late shell' : 'no arrival was scheduled at all, so this boot has no late-shell subject'); return; }
  const firstJoin = joins[0][0];
  if (!arr.length) fail(`[${tag}] L1-ARRIVAL: 0 'arrival:hall-other' compile(s), want at least 1 (${stamps})`);
  else {
    const off = arr.filter((r) => r[1] !== true); const after = arr.filter((r) => r[0] > firstJoin);
    if (off.length) fail(`[${tag}] L1-ARRIVAL: ${off.length} arrival step(s) ran after the overlay started fading (${JSON.stringify(off.slice(0, 3))}; ${stamps})`);
    if (after.length) fail(`[${tag}] L1-ARRIVAL: ${after.length} arrival step(s) came after the first hall-keys join (${firstJoin} ms): ${JSON.stringify(after.slice(0, 3))}`);
    if (!A || !Array.isArray(A.steps)) fail(`[${tag}] L1-ARRIVAL: the arrival record has no steps (${JSON.stringify(A)})`);
    else {
      const errored = String(A.state).startsWith('error');
      if (A.cap !== ARRIVAL_STEP_OBJECTS) fail(`[${tag}] L1-ARRIVAL: main.js's arrival step cap is ${A.cap}, the arm's is ${ARRIVAL_STEP_OBJECTS}`);
      if (nsteps !== arr.length) fail(`[${tag}] L1-ARRIVAL: ${nsteps} arrival step(s) against ${arr.length} 'arrival:hall-other' record(s)`);
      if (!errored && A.tasks !== nsteps) fail(`[${tag}] L1-ARRIVAL: ${nsteps} arrival step(s) ran in ${A.tasks} task(s), not one task per step (${stamps})`);
      const budgeted = late ? steps.slice(1) : steps;
      const big = budgeted.filter((x) => x[0] > ARRIVAL_STEP_OBJECTS);
      if (late && steps.length && steps[0][0] > A.drawSet) big.unshift(steps[0]);
      if (big.length) fail(`[${tag}] L1-ARRIVAL: ${big.length} arrival step(s) compiled ${big.map((x) => x[0]).join('/')} objects, over the step cap (${late ? `the draw set, ${A.drawSet}, then ` : ''}${ARRIVAL_STEP_OBJECTS}), so the work is not split (${JSON.stringify(steps.slice(0, 4))})`);
      if (errored) fail(`[${tag}] L1-ARRIVAL: the arrival chain stopped on an error (state ${A.state}, ${A.done} of ${A.objects} objects)`);
      if (!['scheduled', 'running'].includes(A.state) && (A.open !== false || A.held !== false)) fail(`[${tag}] L1-ARRIVAL: the arrival left its channel open or its list held after it ended (state ${A.state}, open ${A.open}, held ${A.held})`);
      if (nsteps < 2 && plant.includes('every step in one task')) invalid(`the arrival ran in ${nsteps} step(s), so the one-task-per-step check has no subject`);
      // r7: a budgeted arrival never starts, and no budgeted step compiles, while a held compile-ahead is pending (a count, never a time)
      if (!late && A.holdAtStart !== 0) fail(`[${tag}] L1-ARRIVAL: the arrival started while ${A.holdAtStart} held compile-ahead(s) were pending (${stamps})`);
      if (A.duringHold > 0) fail(`[${tag}] L1-ARRIVAL: ${A.duringHold} budgeted arrival step(s) compiled while a held compile-ahead was pending (${stamps})`);
      // the plant's subject is evidence from execution (review r7 P2): a budgeted step that started with a hold pending
      if (plant.includes('PLANT: no wait for held compile-aheads') && !(A.holdAtStart > 0 || A.duringHold > 0)) invalid('no budgeted arrival step ran with a held compile-ahead pending, so the hold-wait check has no subject');
      else if (Array.isArray(A.waited) && A.waited.length) log(`[${tag}] L1 note: the arrival waited for held compile-aheads ${JSON.stringify(A.waited)} (scheduled ${A.t}, started ${A.ran})`);
      if (late) {
        if (!Array.isArray(A.late) || A.late[0] !== A.drawSet || !steps.length || steps[0][0] < A.drawSet) fail(`[${tag}] L1-ARRIVAL: ready held at scheduling (a late shell) but the first step did not compile the whole draw set (late ${JSON.stringify(A.late)}, draw set ${A.drawSet}, first step ${JSON.stringify(steps[0] || null)})`);
      } else {
        if (A.late !== null) fail(`[${tag}] L1-ARRIVAL: an unbudgeted first step ran although ready did not hold at scheduling (${stamps})`);
        if (errored) { /* reported above */ }
        else if (A.cut !== null) {
          if (!(A.done >= A.drawSet)) fail(`[${tag}] L1-ARRIVAL: the overlay's fade cut the arrival before it covered the join's draw set (${A.done} of the draw set's ${A.drawSet}; ${stamps})`);
          else log(`[${tag}] L1 note: the overlay's fade cut the arrival after the draw set (${A.done} of ${A.objects} objects compiled; draw set ${A.drawSet})`);
        } else if (A.state !== 'compiled' || A.done !== A.objects) fail(`[${tag}] L1-ARRIVAL: the arrival steps did not cover the whole list (state ${A.state}, ${A.done} of ${A.objects} objects)`);
        if (typeof A.objects === 'number' && A.objects <= ARRIVAL_STEP_OBJECTS) {
          const m = `the arrival list has ${A.objects} object(s), within one step's cap, so the split has no subject on this boot`;
          if (plant.includes('PLANT: one step compiles the whole list')) invalid(m); else log(`[${tag}] L1 note: ${m}`);
        }
      }
    }
  }
  if (joins[0][2] > 0) fail(`[${tag}] L1-ARRIVAL: the first staged hall-keys join compiled ${joins[0][2]} program(s) itself at the overlay-out (${JSON.stringify(joins[0])}; ${stamps})`);
}

// GH-1202 b-fix r8: the arrival's delta (L1-DELTA), judged wherever one ran; `need` (leg giorder, whose subject is a GI bind under the
// overlay after the arrival compiled) requires one. Counts only, never time: one record and one task per step, no step over the cap,
// every record with the overlay up and before the first staged join, never started and no step compiled while a held compile-ahead
// was pending, ended compiled over its whole list (off giorder a fade that cut it is a note: the first-join count judges the
// consequence), and once ended no channel open and no list held. Its no-subject report is INVALID tagged 'L1-DELTA precondition'.
// No message here carries an L1-ARRIVAL plant's target phrase (the plant loops catch by substring, and judgeDelta runs on lightset)
function judgeDelta(tag, c, fail, log, { need = false, plant = '' } = {}) {
  const D = c.delta; const recs = c.deltaRec || []; const joins = [...(c.joins || [])].sort((a, b) => a[0] - b[0]);
  if (!D) {
    if (need) fail(`[${tag}] L1-DELTA: the GI bind landed under the overlay after the arrival compiled, but no delta precompile was scheduled (arrival ${JSON.stringify(c.arrival && { state: c.arrival.state, end: c.arrival.end })}; gi ${JSON.stringify(c.giStage || null)})`);
    return;
  }
  const steps = Array.isArray(D.steps) ? D.steps : [];
  const stamps = JSON.stringify({ t: D.t, why: D.why, ready: D.ready, arrival: D.arrival, state: D.state, objects: D.objects, done: D.done, programs: D.programs, nsteps: D.nsteps,
    tasks: D.tasks, steps: steps.slice(0, 4), cut: D.cut, holdAtSchedule: D.holdAtSchedule, holdAtStart: D.holdAtStart, duringHold: D.duringHold, waited: D.waited, skipped: D.skipped });
  log(`[${tag}] L1-DELTA evidence ${stamps}`);
  // the plant's subject is evidence from execution: a delta step that started with a held compile-ahead pending
  if (plant.includes('PLANT: the delta does not wait for held compile-aheads') && !(D.holdAtStart > 0 || D.duringHold > 0)) { fail(`[${tag}] INVALID (L1-DELTA precondition): no delta step ran with a loop hold pending, so the hold-wait check has no subject (${stamps})`); return; }
  const errored = String(D.state).startsWith('error'); const ended = !['scheduled', 'running'].includes(D.state);
  if (D.cap !== ARRIVAL_STEP_OBJECTS) fail(`[${tag}] L1-DELTA: main.js's delta step cap is ${D.cap}, the arm's is ${ARRIVAL_STEP_OBJECTS}`);
  if (D.holdAtStart !== null && D.holdAtStart !== 0) fail(`[${tag}] L1-DELTA: the delta started while ${D.holdAtStart} loop hold(s) were pending (${stamps})`);
  if (D.duringHold > 0) fail(`[${tag}] L1-DELTA: ${D.duringHold} delta step(s) compiled during a loop hold (${stamps})`);
  if (D.nsteps !== recs.length) fail(`[${tag}] L1-DELTA: ${D.nsteps} delta step(s) against ${recs.length} ':delta:hall-other' record(s)`);
  if (!errored && D.tasks !== D.nsteps) fail(`[${tag}] L1-DELTA: ${D.nsteps} delta step(s) ran in ${D.tasks} task(s): the delta's steps did not run one per task (${stamps})`);
  const big = steps.filter((x) => x[0] > ARRIVAL_STEP_OBJECTS);
  if (big.length) fail(`[${tag}] L1-DELTA: ${big.length} delta step(s) compiled ${big.map((x) => x[0]).join('/')} objects, past the delta's ${ARRIVAL_STEP_OBJECTS}-object cap`);
  const off = recs.filter((r) => r[1] !== true); const after = joins.length ? recs.filter((r) => r[0] > joins[0][0]) : [];
  if (off.length) fail(`[${tag}] L1-DELTA: ${off.length} delta step(s) ran after the overlay started fading (${JSON.stringify(off.slice(0, 3))})`);
  if (after.length) fail(`[${tag}] L1-DELTA: ${after.length} delta step(s) came after the first hall-keys join (${joins[0][0]} ms): ${JSON.stringify(after.slice(0, 3))}`);
  if (errored) fail(`[${tag}] L1-DELTA: the delta stopped on an error (state ${D.state}, ${D.done} of ${D.objects} objects)`);
  else if (D.state === 'compiled') { if (D.done !== D.objects) fail(`[${tag}] L1-DELTA: the delta ended compiled over ${D.done} of its ${D.objects} objects`); }
  else if (need) fail(`[${tag}] L1-DELTA: the delta did not compile its list before the first join (state ${D.state}, ${D.done} of ${D.objects} objects; ${stamps})`);
  else log(`[${tag}] L1 note: the delta did not compile its list (state ${D.state}, ${D.done} of ${D.objects} objects); the first join's count judges it`);
  if (ended && (D.open !== false || D.held !== false)) fail(`[${tag}] L1-DELTA: the delta kept its channel or its list after it ended (state ${D.state}, open ${D.open}, held ${D.held})`);
}

export async function legLateShell({ PORT, cdp, fail, log = console.log, overrides = {} }) {
  // GH-1202 b-fix (maintainer ruling (A)): metal_rim with ?obholdlight=1500 and app/shell.js held until __test.ready plus two overlay
  // polls, so the keys handoff comes after ready: a late shell, which app.html fades at its first poll after the FRESH arrival resolves.
  // The arrival's first step then compiles the join's whole draw set as one task and the first staged hall-keys join compiles nothing
  // (judgeArrival, needLate: a boot whose arrival was scheduled before ready is INVALID, never a pass)
  const tag = 'lateshell';
  const census = `(() => { const C = window.__obCompileCensus?.(); if (!C) return null;
    return { khr: !!window.__dbg?.renderer?.extensions?.has('KHR_parallel_shader_compile'), arrival: (C.hallOther && C.hallOther.arrival) || null, handoff: (C.hallOther && C.hallOther.handoff) || null,
      delta: (C.hallOther && C.hallOther.delta) || null,
      arrivalRec: C.ahead.filter((a) => a.why === 'arrival:hall-other').map((a) => [a.t, a.overlay, a.programs.length, a.ms]),
      deltaRec: C.ahead.filter((a) => /:delta:hall-other$/.test(a.why)).map((a) => [a.t, a.overlay, a.programs.length, a.ms]),
      giStage: (C.stage || []).filter((s) => s.why === 'gi-bind').map((s) => [s.t, s.mode, s.programs]),
      joins: (C.stage || []).filter((s) => s.why === 'shell:hall-keys-join').map((s) => [s.t, s.mode, s.programs, s.ms, s.named || null]),
      prejoin: (C.stage || []).filter((s) => s.why === 'shell:hall-keys-prejoin').map((s) => [s.t, s.mode, s.programs, s.ms]),
      quiet: C.quiet || null, residual: C.residual || null, fadeAt: (window.__obStall || {}).fadeAt ?? null, quietAtFade: (window.__obStall || {}).quietAtFade ?? null,
      stageAll: (C.stage || []).map((s) => [s.t, s.why, s.mode, s.ms]) }; })()`;
  const leg = await openLeg(PORT, cdp, { hold: false, holdShell: true, holdLeaf: true, overrides }); // the rig lands after the fade, as on leg lightset
  try {
    await leg.c.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/app.html?u=stall-lateshell&table=pool_pro_9ft_metal_rim&obholdlight=1500&obgatetail=30000` });
    const p = await waitFor(leg.c, (q) => q.ready, 150000);
    if (!p?.ready) { fail(`[${tag}] INVALID (precondition): the boot never reached ready`); return; }
    await sleep(150); // past app.html's two polls after ready, so its fade waits only for the shell's arrival
    if (!leg.releaseShell()) { fail(`[${tag}] INVALID (precondition): no app/shell.js request was held at ready, so the keys handoff did not come after ready`); return; }
    let out = false; const tf = Date.now();
    while (!out && Date.now() - tf < 20000) { out = await leg.c.eval(`(() => { const b = document.getElementById('ob-boot'); return !b || b.classList.contains('ob-boot--out'); })()`).catch(() => false); if (!out) await sleep(50); }
    leg.releaseLeaf();
    let c = null; const t0 = Date.now();
    while (Date.now() - t0 < 20000) { c = await leg.c.eval(census).catch(() => null); if (c && ((c.joins.length && c.joins.every((j) => j[1] !== null)) || (c.prejoin && c.prejoin.length && c.fadeAt !== null))) break; await sleep(100); }
    await sleep(1000);
    c = await leg.c.eval(census).catch(() => null);
    if (!c) { fail(`[${tag}] L1-ARRIVAL: no compile census (window.__obCompileCensus) on a real-user boot`); return; }
    if (c.khr !== true) { fail(`[${tag}] INVALID (L1-ARRIVAL precondition): three sees no KHR_parallel_shader_compile on this host, so the arrival precompile is off by design (handoff ${JSON.stringify(c.handoff)}; arrival ${JSON.stringify(c.arrival && { ready: c.arrival.ready, state: c.arrival.state })})`); return; }
    judgeArrival(tag, c, fail, log, { needLate: true, plant: String(overrides['app/main.js'] || '') });
    judgeDelta(tag, c, fail, log, { plant: String(overrides['app/main.js'] || '') });
  } finally { await closeLeg(leg); }
}

export async function legGiOrder({ PORT, cdp, fail, log = console.log, overrides = {} }) {
  // GH-1202 b-fix r8 (the maintainer's r8 item 3): lightset's boot (metal_rim, ?obholdlight=1500, the rig held until the overlay's fade)
  // with the GI assets (/assets/gi/*) held until the census reads the arrival compiled, then released, so the GI bind lands after the
  // arrival, under #ob-boot. No timing guess: ready waits for the GI to settle (main.js envArmReady: giSettled, bounded by
  // VENUE_GI_WINDOW_MS), so the overlay holds while the GI is held. The subject is execution evidence, else INVALID tagged
  // 'L1-GIORDER precondition': the arrival compiled its whole list and ended before the GI bind's immediate stage record, the bind
  // came before the first staged hall-keys join, and no other hall-other compile ran between the bind and the join (the held rig
  // makes no relight there), so only the delta can have compiled the keys-joined variant the bind re-keyed; and ready did not hold
  // yet when the bind landed (the delta's own stamp: a bind after ready is the accepted residual, where the fade may cut a waiting
  // delta). Then judgeArrival (the first join compiles nothing) and judgeDelta, which here requires a delta
  const tag = 'giorder';
  const census = `(() => { const C = window.__obCompileCensus?.(); if (!C) return null; const H = C.hallOther || {};
    return { khr: !!window.__dbg?.renderer?.extensions?.has('KHR_parallel_shader_compile'), arrival: H.arrival || null, handoff: H.handoff || null, delta: H.delta || null,
      arrivalRec: C.ahead.filter((a) => a.why === 'arrival:hall-other').map((a) => [a.t, a.overlay, a.programs.length, a.ms]),
      deltaRec: C.ahead.filter((a) => /:delta:hall-other$/.test(a.why)).map((a) => [a.t, a.overlay, a.programs.length, a.ms]),
      hallAhead: C.ahead.filter((a) => /:hall-other$/.test(a.why)).map((a) => [a.t, a.why]),
      giStage: (C.stage || []).filter((s) => s.why === 'gi-bind').map((s) => [s.t, s.mode, s.programs]),
      joins: (C.stage || []).filter((s) => s.why === 'shell:hall-keys-join').map((s) => [s.t, s.mode, s.programs, s.ms, s.named || null]),
      prejoin: (C.stage || []).filter((s) => s.why === 'shell:hall-keys-prejoin').map((s) => [s.t, s.mode, s.programs, s.ms]),
      quiet: C.quiet || null, residual: C.residual || null, fadeAt: (window.__obStall || {}).fadeAt ?? null, quietAtFade: (window.__obStall || {}).quietAtFade ?? null,
      stageAll: (C.stage || []).map((s) => [s.t, s.why, s.mode, s.ms]) }; })()`;
  const OUT = `(() => { const b = document.getElementById('ob-boot'); return !b || b.classList.contains('ob-boot--out'); })()`;
  const leg = await openLeg(PORT, cdp, { hold: false, holdGi: true, holdLeaf: true, overrides });
  try {
    await leg.c.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/app.html?u=stall-giorder&table=pool_pro_9ft_metal_rim&obholdlight=1500&obgatetail=30000` });
    // the arrival runs while the GI is held (ready cannot hold meanwhile); the census, never a timer, releases the GI
    let c = null; const t0 = Date.now();
    while (Date.now() - t0 < 60000) {
      c = await leg.c.eval(census).catch(() => null);
      if (c && c.arrival && !['scheduled', 'running'].includes(c.arrival.state)) break;
      if (c && await leg.c.eval(OUT).catch(() => false)) break; // judged below: a fade before the release leaves no subject (c: main.js ran, so #ob-boot was parsed)
      await sleep(50);
    }
    const pre = { arrival: c && c.arrival && { state: c.arrival.state, t: c.arrival.t, ran: c.arrival.ran, end: c.arrival.end }, gi: c ? c.giStage : null, handoff: c ? c.handoff : null };
    const held = leg.releaseGi();
    log(`[${tag}] GI release: ${held} held GI request(s) released ${JSON.stringify(pre)}`);
    let out = false; const tf = Date.now();
    while (!out && Date.now() - tf < 30000) { out = await leg.c.eval(OUT).catch(() => false); if (!out) await sleep(50); }
    if (!out) { fail(`[${tag}] INVALID (precondition): the boot overlay never started fading after the GI release`); return; }
    leg.releaseLeaf();
    const t1 = Date.now();
    while (Date.now() - t1 < 20000) { c = await leg.c.eval(census).catch(() => null); if (c && c.joins.length && c.joins.every((j) => j[1] !== null)) break; await sleep(100); }
    await sleep(1000);
    c = await leg.c.eval(census).catch(() => null);
    if (!c) { fail(`[${tag}] L1-ARRIVAL: no compile census (window.__obCompileCensus) on a real-user boot`); return; }
    if (c.khr !== true) { fail(`[${tag}] INVALID (L1-GIORDER precondition): three sees no KHR_parallel_shader_compile on this host, so neither the arrival nor its delta runs (handoff ${JSON.stringify(c.handoff)})`); return; }
    const A = c.arrival; const joins = [...c.joins].sort((a, b) => a[0] - b[0]); const first = joins[0] || null; const gi = c.giStage[0] || null;
    const between = gi && first ? c.hallAhead.filter((h) => h[0] >= gi[0] && h[0] <= first[0] && !/:delta:hall-other$/.test(h[1])) : [];
    const order = { arrival: A && [A.state, A.t, A.ran, A.end, A.done, A.objects], held, gi: c.giStage, firstJoin: first, between };
    log(`[${tag}] L1-GIORDER order ${JSON.stringify(order)}`);
    const invalid = (m) => fail(`[${tag}] INVALID (L1-GIORDER precondition): ${m} (${JSON.stringify(order)})`);
    if (!A || A.state !== 'compiled' || typeof A.end !== 'number') { invalid('the arrival did not compile its whole list while the GI was held'); return; }
    if (!gi) { invalid('no GI bind was recorded on this boot'); return; }
    if (gi[1] !== 'immediate') { invalid(`the GI bind did not land under the overlay (mode ${gi[1]})`); return; }
    if (!(A.end < gi[0])) { invalid(`the GI bind (${gi[0]} ms) did not come after the arrival ended (${A.end} ms)`); return; }
    if (!first && Array.isArray(c.prejoin) && c.prejoin.length) {
      // #1202 build 21: a covered boot (the shell's pre-join) stages no join, so the GI-order subject does not exist; the bind's
      // variants in both key states are the quiet term's warm draws, which leg quiet judges
      log(`[${tag}] L1-GIORDER note: a covered boot (pre-join ${JSON.stringify(c.prejoin[0])}) stages no hall-keys join, so this leg has no subject here; leg quiet judges the covered boot`);
      return;
    }
    if (!first) { invalid('no hall-keys join was staged on this boot'); return; }
    if (!(gi[0] < first[0])) { invalid(`the first hall-keys join (${first[0]} ms) did not come after the GI bind (${gi[0]} ms)`); return; }
    if (between.length) { invalid(`${between.length} hall-other compile(s) ran between the GI bind and the first join, so the variant the bind re-keyed could be covered without the delta`); return; }
    if (c.delta && c.delta.ready === true) { invalid('ready already held when the GI bind landed (the accepted residual: the fade may cut a waiting delta)'); return; }
    const plant = String(overrides['app/main.js'] || '');
    judgeArrival(tag, c, fail, log, { plant });
    judgeDelta(tag, c, fail, log, { need: true, plant });
  } finally { await closeLeg(leg); }
}

// #1202 build 21, L1-QUIET: the quiet term, judged at the real overlay's fade on three real-user boots (KHR; INVALID without it or
// without a fade). (a) a natural FRESH pool boot with the GI assets held until the first frame (the bind lands under the overlay after
// the first frame's hall-other compile: both key states need its variant); (b) metal_rim with ?obholdlight=1500 (the rig lands after
// the fade by construction: the stage rule, so no first-draw check); (c) a late shell on production metal_rim (app/shell.js held until ready plus two polls:
// its pre-join re-arms the term). At the fade (the RECORDER's snapshot): the term met (met set, not capped, not lost), at least one
// fence and fencedWork >= needWork, and a 'current' warm draw. (a) and (c): no program first drawn in the 5 s after the fade (every
// program a frame uses there was drawn behind the overlay first). (c): at least one re-arm. Counts and order only, never time.
function judgeQuiet(tag, c, fail, log, { arm }) {
  const Q = c.quietAtFade; const after = (c.firstUse || []).filter((u) => u[1] === 0 && c.fadeAt !== null && u[0] <= c.fadeAt + 5000);
  log(`[${tag}] L1-QUIET evidence ${JSON.stringify({ arm, fadeAt: c.fadeAt, atFade: Q && typeof Q === 'object' ? { since: Q.since, met: Q.met, ms: Q.ms, capped: Q.capped, lost: Q.lost, why: Q.why, fences: Q.fences, needWork: Q.needWork, fencedWork: Q.fencedWork, rearms: Q.rearms, waits: Q.waits, warm: (Q.warm || []).map((w) => [w[0], w[1], w[4] ? w[4].length : 0]) } : Q, firstDrawnAfterFade: after.length, residual: c.residual })}`);
  if (c.khr !== true) { fail(`[${tag}] INVALID (L1-QUIET precondition): three sees no KHR_parallel_shader_compile on this host, so the quiet term is off by design`); return; }
  if (c.fadeAt === null || c.fadeAt === undefined) { fail(`[${tag}] INVALID (L1-QUIET precondition): the overlay's fade was never seen`); return; }
  if (!Q || typeof Q !== 'object') { fail(`[${tag}] L1-QUIET: no quiet record at the fade (window.__obCompileCensus().quiet: ${JSON.stringify(Q)})`); return; }
  if (Q.met === null) fail(`[${tag}] L1-QUIET: the overlay started fading before the quiet term was met (since ${Q.since}, last reason ${Q.lastWhy})`);
  if (Q.capped) fail(`[${tag}] L1-QUIET: the quiet term's cap fired (${Q.ms} ms, last reason ${Q.why}), so the fade started before the GPU was done`);
  if (Q.lost) fail(`[${tag}] L1-QUIET: the term ended on a lost context`);
  if (!(Q.fences >= 1)) fail(`[${tag}] L1-QUIET: no fence was placed behind the boot's GPU work (${Q.fences})`);
  if (!(Q.fencedWork !== null && Q.needWork !== null && Q.fencedWork >= Q.needWork)) fail(`[${tag}] L1-QUIET: the fade started before a fence covered the last work (fenced ${Q.fencedWork}, needed ${Q.needWork})`);
  if (!(Q.warm || []).some((w) => w[1] === 'current')) fail(`[${tag}] L1-QUIET: no warm draw of the current state before the fade (${JSON.stringify((Q.warm || []).map((w) => w[1]))})`);
  if (arm !== 'b' && after.length) fail(`[${tag}] L1-QUIET: ${after.length} program(s) were drawn for the first time in the 5 s after the fade (${JSON.stringify(after.slice(0, 6))}); each should have been drawn behind the overlay`);
  if (arm === 'c' && !(Q.rearms >= 1)) fail(`[${tag}] L1-QUIET: the late shell's pre-join did not re-arm the term (rearms ${Q.rearms})`);
}

export async function legQuiet({ PORT, cdp, fail, log = console.log, overrides = {} }) {
  const census = `(() => { const C = window.__obCompileCensus?.(); const R = window.__obStall || {}; if (!C) return null;
    return { khr: !!window.__dbg?.renderer?.extensions?.has('KHR_parallel_shader_compile'), fadeAt: R.fadeAt ?? null, quietAtFade: R.quietAtFade ?? null,
      firstUse: R.firstUse || [], quiet: C.quiet || null, residual: C.residual || null }; })()`;
  const OUT = `(() => { const b = document.getElementById('ob-boot'); return !b || b.classList.contains('ob-boot--out'); })()`;
  for (const arm of ['a', 'b', 'c']) {
    const tag = `quiet-${arm}`;
    const q = arm === 'a' ? 'table=pool_pro_9ft' : arm === 'b' ? 'table=pool_pro_9ft_metal_rim&obholdlight=1500' : 'table=pool_pro_9ft_metal_rim'; // (c): no hl seam, so a late rig cannot stand in for the late shell
    const leg = await openLeg(PORT, cdp, { hold: false, holdGi: arm === 'a', holdLeaf: arm === 'b', holdShell: arm === 'c', overrides });
    try {
      await leg.c.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/app.html?u=stall-${tag}&${q}` });
      if (arm === 'a') { // the GI binds after the first frame, under the overlay (leg compile's order)
        const t0 = Date.now(); let n = 0;
        while (Date.now() - t0 < 60000) { n = await leg.c.eval('(window.__test?.renderTimes?.length) || 0').catch(() => 0); if (n > 0) break; await sleep(50); }
        if (!(n > 0)) { fail(`[${tag}] INVALID (L1-QUIET precondition): no frame was delivered while the GI was held`); continue; }
        leg.releaseGi();
      }
      const p = await waitFor(leg.c, (x) => x.ready, 150000);
      if (!p?.ready) { fail(`[${tag}] INVALID (L1-QUIET precondition): the boot never reached ready`); continue; }
      if (arm === 'c') { await sleep(150); if (!leg.releaseShell()) { fail(`[${tag}] INVALID (L1-QUIET precondition): no app/shell.js request was held at ready`); continue; } }
      let out = false; const tf = Date.now();
      while (!out && Date.now() - tf < 30000) { out = await leg.c.eval(OUT).catch(() => false); if (!out) await sleep(50); }
      if (arm === 'b') leg.releaseLeaf();
      await sleep(5500);
      const c = await leg.c.eval(census).catch(() => null);
      if (!c) { fail(`[${tag}] L1-QUIET: no compile census (window.__obCompileCensus) on a real-user boot`); continue; }
      judgeQuiet(tag, c, fail, log, { arm });
    } finally { await closeLeg(leg); }
  }
}

// ---- planted reds (copies served through Fetch; the shipped files are untouched)
function plantedClock(html, mode) {
  const credit = '      lastProgress = Math.min(t, lastProgress + gap - TICK_MS);\n      lastStage = Math.min(t, lastStage + gap - TICK_MS);\n';
  const gate = 'if (gap > LATE_MS && visEpoch === tickEpoch';
  if (!html.includes(credit) || !html.includes(gate)) throw new Error('plant anchor (clock credit/gate) missing');
  if (mode === 'nocredit') return html.replace(credit, '');
  // every tick resets both clocks: a dead boot never cards
  return html.replace(gate, 'if (gap > 0 && visEpoch === tickEpoch').replace(credit, '      lastProgress = t;\n      lastStage = t;\n');
}
function plantedMain(js, mode) {
  const one = (src, a, b) => { if (src.split(a).length !== 2) throw new Error(`plant anchor missing or not unique: ${a.slice(0, 60)}`); return src.replace(a, b); };
  if (mode === 'microtask') {
    const a = "  const bootYield = scripted ? null : () => {\n    window.dispatchEvent(new Event('ob:boot-beat'));\n";
    return one(js, a, `${a}    return Promise.resolve(); // PLANT: a microtask, not a task\n`);
  }
  const y2 = '  if (bootYield && table.activeGeom?.()) await bootYield();';
  if (mode === 'y2-not-awaited') return one(js, y2, '  if (bootYield && table.activeGeom?.()) bootYield(); // PLANT: Y2 not awaited');
  if (mode === 'y2-skip-snooker') return one(js, y2, '  if (bootYield && table.activeGeom?.() && Math.abs(table.activeGeom().length - 3.569) > 1e-6) await bootYield(); // PLANT: Y2 skipped on the snooker class');
  throw new Error(`unknown plant ${mode}`);
}

function plantedGi(js, mode) {
  const one = (src, a, b) => { if (src.split(a).length !== 2) throw new Error(`plant anchor missing or not unique: ${a.slice(0, 60)}`); return src.replace(a, b); };
  if (mode === 'no-hook') return one(js, "    if (landed && typeof compileAhead === 'function') compileAhead([floorMesh, blob], 'gi-bind');\n", '    // PLANT: the GI bind does not compile ahead\n');
  if (mode === 'unstaged') return one(js, "    if (typeof stage !== 'function') { write(); return true; }\n", '    { write(); return true; } // PLANT: the room write never goes through the staging seam\n');
  throw new Error(`unknown plant ${mode}`);
}
function plantedCompile(js, mode) {
  const one = (src, a, b) => { if (src.split(a).length !== 2) throw new Error(`plant anchor missing or not unique: ${a.slice(0, 60)}`); return src.replace(a, b); };
  if (mode === 'resize-unheld') return one(js, '    const held = window.__obCompileHold; if (held && held.pending > 0 && !held.capped) { resizeHeld = true; return; }\n', '    // PLANT: a resize mid-hold is not held\n');
  if (mode === 'no-bake-site') return one(js, '    const censusMark = censusSite?.begin();', '    const censusMark = null; // PLANT: the bake does not record itself;');
  if (mode === 'no-rt') return one(js, '      renderer.setRenderTarget(composer.readBuffer); // the RenderPass', '      // PLANT: compiled for the screen, not the RenderPass target; // the RenderPass');
  const hold = '    if (compileHold.pending > 0 && !compileHold.capped) {\n';
  if (mode === 'no-hold') return one(js, hold, '    if (false) { // PLANT: the loop does not hold\n');
  if (mode === 'compile-async') return one(js, '        if (o) ps.push(compileSettled(renderer.compile(o, camera, scene)));\n',
    '        if (o) ps.push(renderer.compileAsync(o, camera, scene)); // PLANT: three\'s own poll (GH-1199)\n');
  if (mode === 'garble-hold') return one(js, hold, `${hold}      renderer.setRenderTarget(null); renderer.clear(); // PLANT: the held step clears the screen\n`);
  // GH-1202
  if (mode === 'hold-after-overlay') return one(js, '    const holds = hold && (made.length > 0 || inFlight) && rec.overlay;\n', '    const holds = hold && (made.length > 0 || inFlight); // PLANT: a compile-ahead holds after the overlay too\n');
  if (mode === 'stage-no-revert') return one(js, '      revert(); applied = false;\n', '      applied = false; // PLANT: the stage leaves the change applied while it waits\n');
  if (mode === 'stage-no-wait') return one(js, '    programsSettled(progs).then(', '    Promise.resolve().then( // PLANT: the stage applies without waiting for its programs\n      ');
  if (mode === 'stage-current-program') return one(js, '    programsSettled(progs).then(', '    compileSettled(mats).then( /* PLANT: the stage polls currentProgram */ ');
  if (mode === 'stage-off') return one(js, "  const stageNow = () => !gateKhr || scripted || bootOverlayUp() || typeof renderer.compile !== 'function';\n", '  const stageNow = () => true; // PLANT: every change applies at once\n');
  if (mode === 'no-owe') return one(js, "    const status = compileHallOther(why + ':owed');\n", '    const status = undefined; // PLANT: the owed hall-other compile never runs at the batch end\n');
  // GH-1202 b-fix
  const handoff = "    arrivalPrecompile('handoff'); // GH-1202 b-fix: a no-op unless the GH-910 warm tick will not run (see arrivalPrecompile)\n";
  if (mode === 'no-arrival') return one(js, handoff, '    // PLANT: the keys handoff does not precompile the joined variants\n');
  if (mode === 'arrival-after-flip') return one(one(js, "      if (!bootOverlayUp() || switchEver) { R.cut = Math.round(performance.now()); finish((switchEver ? 'skipped:switch' : 'skipped:overlay-gone') + (R.done ? ':partial' : '')); return; }\n", '      // PLANT: no overlay check\n'),
    "    if (ready) queueMicrotask(step); else next(); // a late shell's first step runs before app.html's next poll can fade\n",
    "    const wait = () => (bootOverlayUp() ? setTimeout(wait, 16) : step()); setTimeout(wait, 0); // PLANT: the arrival compile waits for the overlay's fade\n");
  if (mode === 'unsplit') return one(one(js, "        const batch = list.slice(R.done, R.done + (late ? R.drawSet : ARRIVAL_STEP_OBJECTS));\n", "        const batch = list.slice(R.done); // PLANT: one step compiles the whole list\n"),
    "{ hold: false, budgetMs: late ? Infinity : ARRIVAL_STEP_MS, progress }", "{ hold: false, progress }");
  if (mode === 'late-budgeted') return one(js, "      const late = R.ready && R.late === null && R.steps.length === 0; // ruling (A): a late shell's first step takes the whole draw set\n",
    "      const late = false; // PLANT: the late-shell first step stays budgeted\n");
  if (mode === 'inline-chain') return one(js, "      else { R.state = 'running'; next(); }\n", "      else { R.state = 'running'; step(); } // PLANT: the chain runs every step in one task\n");
  // arrival-during-hold (review r7 P2: a deterministic subject): the planted step holds a compile open itself (compileHold.pending + 1)
  // from its first budgeted step until that step has compiled, and never waits, so it always compiles with a hold pending
  if (mode === 'arrival-during-hold') return one(one(js, "      if (!late && compileHold.pending > 0) { if (R.waited.length < 16) R.waited.push([Math.round(performance.now()), null]); holdIdle.push(() => { const w = R.waited[R.waited.length - 1]; if (w && w[1] === null) w[1] = Math.round(performance.now()); next(); }); return; }\n",
    '      if (!late && R.nsteps === 0 && !R.plantHold) { R.plantHold = true; compileHold.pending += 1; } // PLANT: no wait for held compile-aheads (and one held open across the first step)\n'),
    "      R.nsteps += 1; if (R.steps.length < 256) R.steps.push([progress.done, progress.programs, ms]); // [objects, programs, ms]\n",
    "      R.nsteps += 1; if (R.steps.length < 256) R.steps.push([progress.done, progress.programs, ms]); // [objects, programs, ms]\n      if (R.plantHold === true) { R.plantHold = false; compileHold.pending -= 1; if (compileHold.pending === 0) for (const fn of holdIdle.splice(0)) fn(); }\n");
  if (mode === 'channel-left-open') return one(js, "      if (mc) { mc.port1.onmessage = null; mc.port1.close(); mc.port2.close(); mc = null; }\n      list = null;\n", '      // PLANT: the channel stays open and the list held\n');
  if (mode === 'microtask-chain') return one(js, "      else { R.state = 'running'; next(); }\n", "      else { R.state = 'running'; queueMicrotask(step); } // PLANT: the chain hops by microtask, every step in one task\n");
  if (mode === 'inloop') return one(one(js, handoff, '    // PLANT: no arrival precompile\n'), "  const stageNow = () => !gateKhr || scripted || bootOverlayUp() || typeof renderer.compile !== 'function';\n", '  const stageNow = () => true; // PLANT: the join applies at once, so its compile lands in a frame\n');
  if (mode === 'arrival-natural') return one(js, "(keyWarm.state !== 'n/a' && keyWarm.state !== 'capped') || ", '/* PLANT: on every boot */ ');
  if (mode === 'no-owe-call') return one(js, "    const clear = () => { if (stageTail === tail) { stageTail = null; runOwedHallOther(); } }; // the batch's end\n",
    "    const clear = () => { if (stageTail === tail) stageTail = null; }; // PLANT: the owed hall-other debt is never run at the batch's end (the pre-fix retry gap)\n");
  // GH-1202 b-fix r8
  if (mode === 'no-delta') return one(js, '  arrivalDeltaImpl = arrivalDelta;\n', "  // PLANT: no GI-bind delta (the write's keys-joined variant is left to the first join)\n");
  if (mode === 'delta-during-hold') return one(js, '      if (compileHold.pending > 0) { if (D.waited.length < 16) D.waited.push([Math.round(performance.now()), null]); holdIdle.push(() => { const w = D.waited[D.waited.length - 1]; if (w && w[1] === null) w[1] = Math.round(performance.now()); entered += 1; step(); }); return; }\n',
    '      // PLANT: the delta does not wait for held compile-aheads\n');
  throw new Error(`unknown plant ${mode}`);
}
function plantedGate(js, mode) {
  const one = (src, a, b) => { if (src.split(a).length !== 2) throw new Error(`plant anchor missing or not unique: ${a.slice(0, 60)}`); return src.replace(a, b); };
  if (mode === 'no-gate') {
    // the background hall-keys compile goes too: it compiles the hall keys' other state (the relight compile stays, so L1-AHEAD holds
    // and only L1-SYNC can catch it); the GH-1202 b-fix arrival precompile has its own path and still runs under this plant
    const noGate = one(js, '    if (lightSetGate()) {', '    // PLANT: no light-set gate before the frame\n    if (false) {');
    return one(noGate, '  const compileHallOther = (why) => {\n', '  const compileHallOther = (why) => {\n    return; // PLANT: no background hall-keys compile\n');
  }
  if (mode === 'gate-off') return one(js, '  const gateKhr = (() => {', '  // PLANT: no gate and no relight compile at all\n  const gateKhr = false && (() => {');
  if (mode === 'unfinished' || mode === 'unfinished-deep') {
    // every linked program reads unfinished (COMPLETION_STATUS_KHR false) until its first other query, as a link still in flight
    // would, and the gate never holds, so a delivered frame draws with such a program and three's first touch of it is
    // getProgramInfoLog; the deep variant also nests every draw 40 calls deep (past Chrome's 10-frame stack limit)
    const fake = `{ // PLANT: every linked program reads unfinished until its first other query
  const P = WebGL2RenderingContext.prototype, fresh = new WeakSet(), owner = new WeakMap();
  const lp = P.linkProgram, gp = P.getProgramParameter, pl = P.getProgramInfoLog, sl = P.getShaderInfoLog, as = P.attachShader;
  P.linkProgram = function (prog) { fresh.add(prog); return lp.call(this, prog); };
  P.attachShader = function (prog, sh) { owner.set(sh, prog); return as.call(this, prog, sh); };
  P.getProgramParameter = function (prog, pname) { if (pname === 0x91B1 && fresh.has(prog)) return false; const r = gp.call(this, prog, pname); if (pname !== 0x91B1) fresh.delete(prog); return r; };
  P.getProgramInfoLog = function (prog) { const r = pl.call(this, prog); fresh.delete(prog); return r; };
  P.getShaderInfoLog = function (sh) { const r = sl.call(this, sh); fresh.delete(owner.get(sh)); return r; };
}
`;
    const out = fake + plantedGate(js, 'no-hold');
    if (mode === 'unfinished') return out;
    return one(out, '  if (window.__dbg) window.__dbg.composer = composer;\n',
      '  { const o = composer.render.bind(composer); const deep = (n) => { if (n > 0) deep(n - 1); else o(); }; composer.render = () => deep(40); } // PLANT: every draw runs 40 calls deep\n  if (window.__dbg) window.__dbg.composer = composer;\n');
  }
  if (mode === 'no-hold') {
    const gateHold = one(js, '    return compileAheadImpl([drawSet()], why, { then: () => compileHallOther(why) }) === true;',
      '    compileAheadImpl([drawSet()], why, { hold: false, then: () => compileHallOther(why) }); return false; // PLANT: the gate never holds');
    return one(gateHold, "    queueMicrotask(() => compileAheadImpl([drawSet()], 'relight', { then: () => compileHallOther('relight') }));",
      "    queueMicrotask(() => compileAheadImpl([drawSet()], 'relight', { hold: false, then: () => compileHallOther('relight') })); // PLANT: the relight compile never holds");
  }
  throw new Error(`unknown plant ${mode}`);
}
function plantedTable(js, mode) {
  const a = '  for (const [name, argsOf, impl] of jobs) {\n    await pwNextTask();\n';
  if (js.split(a).length !== 2) throw new Error('plant anchor (the prewarm job loop) missing or not unique');
  if (mode === 'one-task') return js.replace(a, '  for (const [name, argsOf, impl] of jobs) {\n    // PLANT: every job in one task\n');
  throw new Error(`unknown plant ${mode}`);
}

export async function runBootStallArm({ PORT, CDP_PORT, fail, log = console.log, selftestPlants = false }) {
  const legs = (process.env.OB_E2E_STALL_LEGS || 'busy,dead,slowidle,slowbusy,yield,yieldsnk,yieldcn8,compile,lightset,lateshell,giorder,dispose,quiet').split(',');
  const run = { busy: legBusy, dead: legDead, slowidle: legSlowIdle, slowbusy: legSlowBusy, yield: legYield,
    yieldsnk: (o) => legYield({ ...o, table: 'wpbsa_snooker_12ft' }), yieldcn8: (o) => legYield({ ...o, table: 'chinese8_pro_9ft' }), compile: legCompile,
    lightset: legLightset, lateshell: legLateShell, giorder: legGiOrder, dispose: legDispose, quiet: legQuiet };
  for (const name of legs) await run[name]({ PORT, cdp: CDP_PORT, fail, log });
  if (!selftestPlants) return;
  const html = fs.readFileSync(path.join(WEB, 'app.html'), 'utf8');
  const main = fs.readFileSync(path.join(WEB, 'app', 'main.js'), 'utf8');
  const tableJs = fs.readFileSync(path.join(WEB, 'scene', 'table.js'), 'utf8');
  const giJs = fs.readFileSync(path.join(WEB, 'scene', 'gi.js'), 'utf8');
  const plants = [
    ['N3 the pre-GH-1115 clock (no busy credit)', 'busy', { 'app.html': plantedClock(html, 'nocredit') }, 'CARD-AFTER-BUSY', []],
    ['the pre-GH-1115 clock on the slow register', 'slowbusy', { 'app.html': plantedClock(html, 'nocredit') }, 'SLOW-AFTER-BUSY', []],
    ['a clock that resets on every tick (a dead boot never cards)', 'dead', { 'app.html': plantedClock(html, 'all') }, 'NO-CARD', []],
    ['main.js yields only microtasks', 'yield', { 'app/main.js': plantedMain(main, 'microtask') }, 'Y-TASK', []],
    ['only Y2 is not awaited', 'yield', { 'app/main.js': plantedMain(main, 'y2-not-awaited') }, 'Y-TASK', []],
    ['Y2 skipped on the snooker class', 'yieldsnk', { 'app/main.js': plantedMain(main, 'y2-skip-snooker') }, 'Y-BEATS', []],
    ['every prewarm job in one task', 'yieldsnk', { 'scene/table.js': plantedTable(tableJs, 'one-task') }, 'Y-PREWARM-TASK', []],
    ['the GI bind does not compile ahead', 'compile', { 'scene/gi.js': plantedGi(giJs, 'no-hook') }, 'C1-AHEAD', ['C1']],
    ['compile-ahead in the screen context, not the RenderPass target', 'compile', { 'app/main.js': plantedCompile(main, 'no-rt') }, 'C1-SYNC', ['C1']],
    ['the loop does not hold for a compile-ahead', 'compile', { 'app/main.js': plantedCompile(main, 'no-hold') }, 'C2-HELD', ['C2']],
    ['the held step clears the screen', 'compile', { 'app/main.js': plantedCompile(main, 'garble-hold') }, 'C2-HELD', ['C2']],
    ['a resize mid-hold is not held', 'compile', { 'app/main.js': plantedCompile(main, 'resize-unheld') }, 'C2-RESIZE', ['C2']],
    ['a bake between frames does not record itself', 'compile', { 'app/main.js': plantedCompile(main, 'no-bake-site') }, 'C3-SITE', ['C3']],
    ['no light-set gate before the frame and no background hall-keys compile', 'lightset', { 'app/main.js': plantedGate(main, 'no-gate') }, 'L2-HOLD', ['L2']],
    ['no gate and no relight compile at all (and so no staging)', 'lightset', { 'app/main.js': plantedGate(main, 'gate-off') }, 'L2-STAGED', ['L2']],
    ['a gate compile that never holds', 'lightset', { 'app/main.js': plantedGate(main, 'no-hold') }, 'L2-HOLD', ['L2']],
    ['a gate hold that clears the screen', 'lightset', { 'app/main.js': plantedCompile(main, 'garble-hold') }, 'L2-HELD', ['L2']],
    ['a frame draws an unfinished program first read through getProgramInfoLog', 'lightset', { 'app/main.js': plantedGate(main, 'unfinished') }, 'L1-SYNC', ['L1']],
    ['the same with every draw 40 calls deep', 'lightset', { 'app/main.js': plantedGate(main, 'unfinished-deep') }, 'L1-SYNC', ['L1']],
    ['the compile-ahead polls through three\'s compileAsync (a disposed material throws, GH-1199)', 'dispose', { 'app/main.js': plantedCompile(main, 'compile-async') }, 'D1-ERROR', []],
    ['a compile-ahead holds after the overlay too (GH-1202)', 'lightset', { 'app/main.js': plantedCompile(main, 'hold-after-overlay') }, 'L2-NOHOLD', ['L2']],
    ['the stage leaves the change applied while it waits (GH-1202)', 'lightset', { 'app/main.js': plantedCompile(main, 'stage-no-revert') }, 'L2-EARLY', ['L2']],
    ['the stage applies without waiting for its programs (GH-1202)', 'lightset', { 'app/main.js': plantedCompile(main, 'stage-no-wait') }, 'L2-LINKED', ['L2']],
    ['the stage polls currentProgram, which the frames after its revert point back at the old variants (GH-1202)', 'lightset', { 'app/main.js': plantedCompile(main, 'stage-current-program') }, 'L2-LINKED', ['L2']],
    ['every change applies at once, no staging (GH-1202)', 'lightset', { 'app/main.js': plantedCompile(main, 'stage-off') }, 'L2-STAGED', ['L2']],
    ['the GI room write bypasses the staging seam (GH-1202)', 'lightset', { 'scene/gi.js': plantedGi(giJs, 'unstaged') }, 'L1-GI', ['L1', 'L1-GI']],
    ['a hall-other compile skipped for a pending stage is never run at the batch end (GH-1202)', 'lightset', { 'app/main.js': plantedCompile(main, 'no-owe') }, 'L1-OWE', ['L1', 'L1-OWE']],
    ['the batch end never runs the owed hall-other compile: it waits for the next key change, as before the fix (GH-1202)', 'lightset', { 'app/main.js': plantedCompile(main, 'no-owe-call') }, 'L1-OWE', ['L1', 'L1-OWE']],
    ['the keys handoff does not precompile the joined variants: the join compiles at the overlay-out (GH-1202 b-fix)', 'lightset', { 'app/main.js': plantedCompile(main, 'no-arrival') }, 'L1-ARRIVAL', ['L1', 'L1-ARRIVAL']],
    ['the arrival precompile is deferred past the overlay\'s fade (GH-1202 b-fix)', 'lightset', { 'app/main.js': plantedCompile(main, 'arrival-after-flip') }, 'L1-ARRIVAL', ['L1', 'L1-ARRIVAL']],
    ['no arrival precompile and the join applies at once: its compile lands in a delivered frame (GH-1202 b-fix)', 'lightset', { 'app/main.js': plantedCompile(main, 'inloop') }, 'L1-SYNC', ['L1']],
    ['an unsplit arrival precompile: one step compiles the whole list (GH-1202 b-fix)', 'lightset', { 'app/main.js': plantedCompile(main, 'unsplit') }, 'over the step cap', ['L1', 'L1-ARRIVAL']],
    ['the arrival chain runs every step in one task (GH-1202 b-fix)', 'lightset', { 'app/main.js': plantedCompile(main, 'inline-chain') }, 'not one task per step', ['L1', 'L1-ARRIVAL']],
    ['the arrival chain hops by microtask, every step in one task (GH-1202 b-fix)', 'lightset', { 'app/main.js': plantedCompile(main, 'microtask-chain') }, 'not one task per step', ['L1', 'L1-ARRIVAL']],
    ['the arrival starts while a held compile-ahead is pending (GH-1202 b-fix r7)', 'lightset', { 'app/main.js': plantedCompile(main, 'arrival-during-hold') }, 'held compile-ahead', ['L1', 'L1-ARRIVAL']],
    ['the arrival chain ends with its channel open and its list held (GH-1202 b-fix, review P2)', 'lightset', { 'app/main.js': plantedCompile(main, 'channel-left-open') }, 'left its channel open', ['L1', 'L1-ARRIVAL']],
    ['a late shell\'s first arrival step stays budgeted: the fade cuts the draw set short (GH-1202 b-fix)', 'lateshell', { 'app/main.js': plantedCompile(main, 'late-budgeted') }, 'did not compile the whole draw set', ['L1-ARRIVAL']],
    ['the arrival precompile ignores keyWarm: it runs on a natural boot while the warm tick is pending (GH-1202 b-fix)', 'compile', { 'app/main.js': plantedCompile(main, 'arrival-natural') }, 'C-NOARRIVAL', ['C-NOARRIVAL']],
    ['the GI bind lands after the arrival compiled and nothing compiles its keys-joined variant: the join compiles it at the overlay-out (GH-1202 b-fix r8)', 'giorder', { 'app/main.js': plantedCompile(main, 'no-delta') }, 'itself at the overlay-out', ['L1-GIORDER', 'L1-ARRIVAL']],
    ['the GI bind\'s delta compiles inside the bind\'s own hold (GH-1202 b-fix r8)', 'giorder', { 'app/main.js': plantedCompile(main, 'delta-during-hold') }, 'the delta started while', ['L1-GIORDER', 'L1-DELTA']],
  ];
  let bad = 0;
  for (const [name, legName, overrides, target, subjects = []] of plants) {
    let msgs = [];
    // an INVALID message (a precondition failure, or no subject, with stamps) never counts as the hit. Only a trial with no hit and an
    // INVALID for this plant's subject is rerun, once: an untagged INVALID (a leg precondition that returns before any verdict), or one
    // tagged '<block> precondition' whose block is in the plant's subject list. A valid trial whose plant stayed green is a miss, never retried
    const isHit = (m) => m.includes(target) && !/INVALID/.test(m);
    const voids = (m) => { if (!/INVALID/.test(m)) return false; const t = m.match(/INVALID \(([^)]+) precondition\)/); return !t || subjects.includes(t[1]); };
    for (let attempt = 1; attempt <= 2; attempt++) {
      msgs = [];
      await run[legName]({ PORT, cdp: CDP_PORT, fail: (m) => msgs.push(m), log: () => {}, overrides });
      if (msgs.some(isHit) || !msgs.some(voids)) break;
    }
    const hit = msgs.find(isHit);
    if (!hit) bad++;
    log(`  ${hit ? 'ok  ' : 'BAD '} plant ${name}: leg ${legName} ${hit ? `red on ${target} — ${hit.slice(0, 150)}` : `did not go red on ${target}${msgs.length ? ` (${msgs[0].slice(0, 140)})` : ' (stayed green)'}`}`);
  }
  if (bad) fail(`--selftest-plants: ${bad} plant(s) not caught on target`);
  else log(`E2E-USERBOOT-STALL --selftest-plants: OK (${plants.length} plants, each red on its target)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const PORT = Number(process.env.OB_E2E_PORT ?? 8149);
  const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 9374);
  const fail = (msg) => { console.error('E2E-USERBOOT-STALL FAIL:', msg); process.exitCode = 1; };
  const server = spawnStaticServer(WEB, PORT);
  await sleep(700);
  try { await runBootStallArm({ PORT, CDP_PORT, fail, selftestPlants: process.argv.includes('--selftest-plants') }); } catch (e) { fail(e?.stack || String(e)); }
  await stopStaticServer(server);
  console.log(process.exitCode ? 'E2E-USERBOOT-STALL FAIL' : 'E2E-USERBOOT-STALL PASS');
}
