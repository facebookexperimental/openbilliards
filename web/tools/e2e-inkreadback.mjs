// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-inkreadback.mjs — GH-1114: the adaptive preview ink (previewink.js)
// reads its background back only when the BACKGROUND changes. In Chrome
// every resolve is a synchronous GPU round trip (getBufferSubData blocks
// even after its fence signals), so an aim drag that re-armed the readback
// on every frame held the main thread in long tasks (measured 137-190 ms per
// call under load, one per 4 frames). Since GH-1114 a LINE-only change (the
// aim moving the preview lines and the cue stick over an unchanged
// background) re-solves against the cached buffer, the first still frame
// opens one refresh window that re-samples the pose, and a line that
// appears mid-drag votes its polarity only on a buffer kicked after the
// lines last moved (the review r3 P1 law), never on the cache.
//
//   arms (real-user boot, the shell left through quickPlay, assist
//   standard, orbit view; perf-aim's drag shape — press 170 px above the cue
//   ball, 2.5 turns at 3 rad/s — with the moves sent at 120/s WITHOUT
//   waiting for each to land, so every rendered frame carries one, as a real
//   mouse does; a full warm-up drag first, so first-use resource arrivals
//   land before the counted drag):
//   R1 line law: no readback is kicked while the lines move unless a
//      background input changed. Kicks are counted on the WebGL2 prototype
//      (a PBO readPixels = a kick, getBufferSubData = a resolve) and each is
//      attributed from the page's own view of the fingerprint inputs:
//      background = camera, viewport, renderer.info counts, __gi/__lighting
//      state, the aim.js scene surfaces (pocket marks, rings, snap overlay,
//      drag lift, rest decal), the cue ball position, ob:settings /
//      ob:relight; lines = the preview lines' geometry + the cue pose.
//      A kick within 0.65 s or 6 frames of a background change (the
//      stillHold tail on a dt-clamped clock), or 3.6 s of a broadcast, is
//      background-driven; a kick in a frame whose line inputs did not
//      change is the refresh window (it opens once the lines hold still);
//      a kick while a contact line has been held unseeded >= 0.9 s is the
//      fresh line's 1 s escape readback (legal, as before the fix); any
//      other kick in a frame whose line inputs DID change is line-driven and
//      fails the arm. (Line inputs change in input / worker tasks before a
//      frame's rAF callbacks, so the module's hook and this page's tracker
//      see the same inputs in a frame whichever runs first.) Pre-fix the
//      drag kicks one every ~4 frames, all line-driven (the planted red).
//   R1s slow input: the refresh window waits for the lines to hold still 6
//      frames AND 0.1 s, so sparse input never reads back per gap. With the
//      aim turned away from the rack (fewer contact lines; an escape readback
//      is attributed as in R1), three gestures, each from a
//      frozen rest and FRAME-LOCKED by an in-page rAF loop so the gap holds
//      at any frame rate: (i) an aim change every 4th frame (game.setPhi via
//      __test.aim, the pointer path's own write), 40 steps; (ii) ArrowLeft
//      keydown every 6th frame (10 Hz key repeat at 60 fps) and (iii) every
//      2nd frame (30 Hz), window KeyboardEvents to the keyboard aim path
//      (aim.js listens on window). No readback may be kicked
//      between the gesture's first and last input (+50 ms) unless a
//      background input changed or a contact line's escape earned it; the
//      sparse gestures (i)/(ii) must show their
//      gaps (still frames) and move the aim, or the arm proves nothing; (iii)
//      is dense here (the worker reply fills the frame after each key) and
//      only asserts no gap readback. A window opened
//      on the first still frame (b44fab91) reads back once per gap — the
//      planted red.
//   R2 refresh: once the pointer holds still, the ink re-samples the settled
//      pose (>= 1 kick and >= 1 resolve after the last move landed) and
//      re-freezes (adaptiveInk().staticFrozen).
//   R3 pure function at rest: the re-frozen ink key (per line role : pol :
//      rungMed : colHash — the GH-496 key) equals a FRESH re-latch at the
//      same pose (a same-value brightness re-set: stateReset + grace). The
//      at-rest ink is the settled scene's own solve, so it cannot depend on
//      how the drag sampled.
//   R4 fresh-vote law: a slow aim drag (0.12 rad/s, under the 1 s escape)
//      onto the 1-ball from 0.12 rad away — the stub and the cue post appear
//      while the lines still move (the start pose must show neither: a line
//      already voted there would make the arm vacuous). A contact line's
//      FIRST vote (inkLines().sL >= 0), during the drag or after the stop,
//      must use a front KICKED AFTER the lines' last change: the latest
//      readback resolved by that frame answers a kick issued in a frame after
//      the last line-key change (a change frame's kick still reads the
//      pre-change render); past the 1 s escape it may answer one kicked after
//      the line appeared. Kicks and resolves are the page's own PBO
//      readPixels / getBufferSubData calls (one readback in flight at a
//      time). A line that hides and re-shows votes fresh again. Once the
//      pointer holds still the vote must cast. The 4ae5e2b1 ink voted at once
//      against the cache — its contact lines latched a stale polarity that
//      only polDwell (6 s) could correct (the planted red).
//   Every leg prints its INKKEY line; --out-dir <dir> also writes a PNG per
//   pose (the before/after pixel evidence compares two trees' runs).
//
//   node web/tools/e2e-inkreadback.mjs [--port 8253] [--out-dir <dir>]
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import {
  launchChrome, sleep, spawnStaticServer, stopStaticServer,
} from './cdp.mjs';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const argOf = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
const PORT = Number(argOf('--port') ?? process.env.OB_E2E_PORT ?? 8253);
const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 16353);
const OUT_DIR = argOf('--out-dir');
// GH-410 port inventory (GH-687 lint law): one http server, one CDP client.
export const PORT_INVENTORY = { http: 1, cdp: 1 };
export const PORT_FLAGS = { '--port': 'http' };
const fail = (msg) => { console.error('E2E-INKREADBACK FAIL:', msg); process.exitCode = 1; };
const W = 1280, H = 800;

// page-side counters + fingerprint-input tracker (installed after the boot)
const RIG = `window.__ir = (() => {
  const st = { kicks: [], resolves: [], bg: [], bcast: [], line: [], frames: [], trace: null, inkRec: null, esc: [] };
  const streak = { stub: null, cuePost: null }; // since when each contact line has been visible AND unseeded
  const P = WebGL2RenderingContext.prototype;
  if (!P.__irWrapped) {
    const rp = P.readPixels, gbs = P.getBufferSubData;
    P.readPixels = function (...a) {
      if (this.getParameter(this.PIXEL_PACK_BUFFER_BINDING)) st.kicks.push(performance.now());
      return rp.apply(this, a);
    };
    P.getBufferSubData = function (...a) { st.resolves.push(performance.now()); return gbs.apply(this, a); };
    P.__irWrapped = true;
  }
  const bcast = () => st.bcast.push(performance.now());
  window.addEventListener('ob:settings', bcast);
  window.addEventListener('ob:relight', bcast);
  const group = () => __dbg.scene.children.find((o) => o.type === 'Group' && o.children.length === 28
    && o.children.filter((k) => k.isLine).length === 27);
  const keys = () => {
    const A = window.__aim, c = __dbg.camera, inf = __dbg.renderer.info, gis = window.__gi?.state;
    const ls = window.__lighting?.state?.(), g = group(), lines = g ? g.children.filter((k) => k.isLine) : [];
    const pm = A?.pocketMarks?.(), ri = A?.ringInks?.(), so = A?.snapOverlay?.(), dl = A?.dragLift?.state?.(), rd = A?.restDecal?.();
    const cue = lines[0];
    const bg = [c.matrixWorld.elements.join(','), c.projectionMatrix.elements.join(','), innerWidth, innerHeight,
      inf.memory.textures, inf.memory.geometries, inf.programs?.length ?? 0,
      gis ? gis.appliedSeq + ',' + gis.ready : 'x', ls ? [ls.fixture, ls.brightness, ls.look, ls.touched].join(',') : 'x',
      pm ? JSON.stringify(pm) : 'x', ri ? JSON.stringify(ri) : 'x', so ? JSON.stringify(so) : 'x',
      dl ? [dl.id, dl.phase, dl.y].join(',') : 'x', rd ? rd.key + ',' + rd.visible : 'x',
      cue && cue.visible ? [0, 1, 2].map((i) => cue.geometry.getAttribute('position').array[i]).join(',') : 'h'].join('|');
    const tw = A?.tipWorld?.(), cf = A?.cueFlex?.();
    const ln = [tw ? tw.join(',') : 'x', cf ? JSON.stringify(cf) : 'x',
      lines.map((k) => k.visible ? k.geometry.getAttribute('position').version + ':' + k.geometry.drawRange.count : 'h').join(';')].join('|');
    return { bg, ln };
  };
  let prev = null;
  const loop = (now) => {
    const k = keys();
    st.frames.push(now);
    if (prev && k.bg !== prev.bg) st.bg.push(now);
    if (prev && k.ln !== prev.ln) st.line.push(now);
    prev = k;
    { // the 1 s fresh-age escape may kick ONE readback for a contact line unseeded that long: record its streak
      const ls = __aim.inkLines?.() ?? [];
      let m = 0;
      for (const role of ['stub', 'cuePost']) {
        const l = ls.find((x) => x.role === role);
        if (l && l.sL < 0) { streak[role] ??= now; m = Math.max(m, now - streak[role]); } else streak[role] = null;
      }
      st.esc.push([now, Math.round(m)]);
    }
    if (st.inkRec) { // R4: every visible line's role, polarity and seed state, per frame
      st.inkRec.push([now, (__aim.inkLines?.() ?? []).map((l) => [l.role, l.pol, l.sL])]);
    }
    if (st.trace) { // --out-dir evidence: the per-frame ink while the aim moves
      const ls = __aim.inkLines?.() ?? [];
      st.trace.push([Math.round(now), __aim.getPhi(), ls.map((l) => l.role + ':' + l.pol + ':' + l.rungMed).join('|')]);
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  return st;
})(); true`;

// classify the kicks inside [t0, t1] (page clock)
const CLASSIFY = (t0, t1) => `(() => {
  const st = window.__ir, t0 = ${t0}, t1 = ${t1};
  const out = { kicks: 0, resolves: 0, frames: 0, lineChanges: 0, bgChanges: 0, bgDriven: 0, refresh: 0, escape: 0, lineDriven: [] };
  out.frames = st.frames.filter((t) => t >= t0 && t <= t1).length;
  out.lineChanges = st.line.filter((t) => t >= t0 && t <= t1).length;
  out.bgChanges = st.bg.filter((t) => t >= t0 && t <= t1).length;
  out.resolves = st.resolves.filter((t) => t >= t0 && t <= t1).length;
  for (const tk of st.kicks) {
    if (tk < t0 || tk > t1) continue;
    out.kicks++;
    const recent = st.frames.filter((tf) => tf <= tk).slice(-6)[0] ?? tk; // 6 frames back
    if (st.bg.some((tb) => tb >= Math.min(tk - 650, recent) && tb <= tk + 100)
      || st.bcast.some((ts) => ts >= tk - 3600 && ts <= tk + 100)) { out.bgDriven++; continue; }
    // the kick's own frame: the latest rAF frame time at or before it
    const fk = st.frames.filter((tf) => tf <= tk).pop();
    if (fk === undefined || !st.line.includes(fk)) { out.refresh++; continue; }
    // a contact line held unseeded >= 0.9 s (wall; the ink's 1 s is on its dt-clamped clock, never longer) earns
    // the escape's one readback even while the lines move
    if (st.esc.filter(([tf]) => tf <= tk).slice(-2).some(([, ms]) => ms >= 900)) { out.escape++; continue; }
    out.lineDriven.push(Math.round(tk - t0));
  }
  return out;
})()`;

// R1s: every kick inside [t0, t1] with the line-change frames around it (background kicks flagged)
const GAPS = (t0, t1) => `(() => {
  const st = window.__ir, out = [];
  for (const tk of st.kicks) {
    if (tk < ${t0} || tk > ${t1}) continue;
    const recent = st.frames.filter((tf) => tf <= tk).slice(-6)[0] ?? tk;
    const bg = st.bg.some((tb) => tb >= Math.min(tk - 650, recent) && tb <= tk + 100)
      || st.bcast.some((ts) => ts >= tk - 3600 && ts <= tk + 100);
    const prev = st.line.filter((tl) => tl <= tk).pop() ?? null, next = st.line.find((tl) => tl > tk) ?? null;
    const between = prev !== null && next !== null ? st.frames.filter((tf) => tf > prev && tf < next).length : null;
    out.push({ tk: Math.round(tk - ${t0}), bg, gapMs: prev !== null && next !== null ? Math.round(next - prev) : null, between });
  }
  return out;
})()`;

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
    }
  });
  await chrome.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/app.html?seed=1&u=ir` });
  const until = async (expr, label, { ms = 30000, frames = 0 } = {}) => {
    // bounded by the event; gives up once BOTH the time cap AND the frame
    // floor have passed (a storm-held page renders few frames per second), and
    // in any case at 6x the time cap (a page that stopped rendering)
    const t0 = Date.now(); const f0 = await chrome.eval('window.__ir?.frames.length ?? 0').catch(() => 0);
    for (;;) {
      if (await chrome.eval(expr).catch(() => false)) return true;
      const f = await chrome.eval('window.__ir?.frames.length ?? 0').catch(() => 0);
      const waited = Date.now() - t0;
      if ((waited >= ms && f - f0 >= frames) || waited >= 6 * ms) { fail(`${label}: timed out (${expr})`); return false; }
      await sleep(100);
    }
  };
  if (!(await until('window.__test?.ready === true', 'boot', { ms: 120000 }))) throw new Error('boot');
  // the real-user boot lands on the shell: leave it once it has landed
  if (!(await until('!!window.__shell?.isOpen?.() && !window.__shell.moving()', 'shell landed'))) throw new Error('shell');
  await chrome.eval('window.__shell.quickPlay(), true');
  if (!(await until('!window.__shell.isOpen() && !window.__shell.moving()', 'shell closed'))) throw new Error('shell exit');
  await chrome.eval(`__aim.setAssist('standard')`);
  await chrome.eval(RIG);
  const live = `(() => { const a = window.__aim?.adaptiveInk?.(); return !!a && a.active === true && a.staticFrozen === true; })()`;
  if (!(await until(live, 'ink live + frozen at boot', { ms: 30000, frames: 60 }))) throw new Error('ink never settled');

  const screenOf = (id) => chrome.eval(`(() => { const c = __dbg.camera; const p = __test.balls().find((b) => b.id === ${id}).pos;
    const e = c.matrixWorldInverse.elements, pr = c.projectionMatrix.elements;
    const vx = e[0]*p[0]+e[4]*p[1]+e[8]*p[2]+e[12], vy = e[1]*p[0]+e[5]*p[1]+e[9]*p[2]+e[13];
    const vz = e[2]*p[0]+e[6]*p[1]+e[10]*p[2]+e[14], vw = e[3]*p[0]+e[7]*p[1]+e[11]*p[2]+e[15];
    const cx = pr[0]*vx+pr[4]*vy+pr[8]*vz+pr[12]*vw, cy = pr[1]*vx+pr[5]*vy+pr[9]*vz+pr[13]*vw;
    const cw = pr[3]*vx+pr[7]*vy+pr[11]*vz+pr[15]*vw;
    return { x: (cx/cw*0.5+0.5)*innerWidth, y: (1-(cy/cw*0.5+0.5))*innerHeight }; })()`);
  const cue = await screenOf(0);
  const R = Math.min(170, Math.floor(Math.min(W, H) * 0.4));
  const pt = (a) => ({ x: cue.x + R * Math.cos(a), y: cue.y + R * Math.sin(a) });
  const mouse = (type, x, y) => chrome.send('Input.dispatchMouseEvent', { type, x, y, button: 'left',
    buttons: type === 'mouseMoved' ? 1 : undefined, pointerType: 'mouse',
    clickCount: type === 'mousePressed' || type === 'mouseReleased' ? 1 : 0 });
  // one drag from angle a0 through `turns` turns at 3 rad/s, 120 moves/s sent
  // without awaiting each (the queue never runs dry, so every frame carries a
  // move); resolves once the LAST move has landed; returns the page-clock span
  const drag = async (a0, turns, rate = 3) => {
    await mouse('mousePressed', pt(a0).x, pt(a0).y);
    const t0 = await chrome.eval('performance.now()');
    const n = Math.max(12, Math.round((Math.abs(turns) * 2 * Math.PI / rate) * 120));
    const sent = []; const w0 = Date.now();
    for (let i = 1; i <= n; i++) {
      const a = a0 + (turns * 2 * Math.PI * i) / n;
      sent.push(mouse('mouseMoved', pt(a).x, pt(a).y));
      const lag = w0 + (i * 1000) / 120 - Date.now();
      if (lag > 1) await sleep(lag);
    }
    await Promise.all(sent);
    const t1 = await chrome.eval('performance.now()');
    return { t0, t1, aEnd: a0 + turns * 2 * Math.PI };
  };
  const inkKey = async () => {
    const ls = await chrome.eval('__aim.inkLines?.() ?? null');
    return ls?.length ? ls.map((l) => `${l.role}:${l.pol}:${l.rungMed}:${l.colHash}`).sort().join('|') : null;
  };
  const settle = async (label) => {
    const tStop = await chrome.eval('performance.now()');
    const ok = await until(live, `${label}: re-freeze`, { ms: 20000, frames: 60 });
    const tFrozen = await chrome.eval('performance.now()');
    return { ok, tStop, tFrozen };
  };
  const shot = async (name) => {
    if (!OUT_DIR) return;
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const { data } = await chrome.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT_DIR, `${name}.png`), Buffer.from(data, 'base64'));
  };

  const a0 = -Math.PI / 2;
  const warm = await drag(a0, 2.5); // warm-up: first-use resource arrivals land here
  await mouse('mouseReleased', pt(warm.aEnd).x, pt(warm.aEnd).y);
  await settle('warm-up');

  // R1 — the counted drag
  if (OUT_DIR) await chrome.eval('window.__ir.trace = []; true');
  const d = await drag(a0, 2.5);
  const r1 = await chrome.eval(CLASSIFY(d.t0, d.t1));
  console.log(`R1 drag: ${r1.frames} frames, ${r1.lineChanges} line changes, ${r1.bgChanges} background changes; `
    + `kicks ${r1.kicks} (background ${r1.bgDriven}, refresh ${r1.refresh}, 1 s escape ${r1.escape}, line-driven ${r1.lineDriven.length}), resolves ${r1.resolves}`);
  if (r1.lineChanges < Math.min(20, r1.frames / 2)) fail(`R1: the drag barely moved the lines (${r1.lineChanges} changes in ${r1.frames} frames) — the arm proves nothing`);
  if (r1.lineDriven.length) fail(`R1 line law: ${r1.lineDriven.length} readbacks kicked while only the lines moved (ms into the drag: ${r1.lineDriven.slice(0, 8).join(', ')})`);
  else console.log('R1 OK: no line-driven readback during the drag');

  // R2 — the refresh after the stop (pointer held still, button down)
  const s1 = await settle('R2');
  const r2 = await chrome.eval(CLASSIFY(d.t1, s1.tFrozen));
  console.log(`R2 stop: ${r2.kicks} kicks, ${r2.resolves} resolves until the re-freeze `
    + `(${Math.round(s1.tFrozen - s1.tStop)} ms, ${r2.frames} frames)`);
  if (!s1.ok) fail('R2: the ink never re-froze after the drag');
  else if (!(r2.kicks >= 1 && r2.resolves >= 1)) fail(`R2: no refresh readback after the stop (kicks ${r2.kicks}, resolves ${r2.resolves})`);
  else console.log('R2 OK: the settled pose was re-sampled, then the ink froze');
  const k1 = await inkKey();
  console.log(`INKKEY P1 ${k1}`);
  await shot('P1');
  if (OUT_DIR) {
    const tr = await chrome.eval('(() => { const t = window.__ir.trace; window.__ir.trace = null; return t; })()');
    fs.writeFileSync(path.join(OUT_DIR, 'trace-R1.json'), JSON.stringify({ t0: d.t0, t1: d.t1, tFrozen: s1.tFrozen, frames: tr }));
  }

  // R3 — the same pose, a fresh re-latch (same-value brightness re-set)
  await chrome.eval(`__settings.set('brightness', __settings.get().brightness)`);
  await until(`window.__aim.adaptiveInk().staticFrozen === false`, 'R3: re-latch started', { ms: 5000, frames: 10 });
  const s2 = await settle('R3');
  const k1b = await inkKey();
  console.log(`INKKEY P1-relatch ${k1b}`);
  if (!s2.ok) fail('R3: the ink never re-froze after the re-latch');
  else if (!k1 || k1 !== k1b) fail(`R3: the at-rest ink after the drag is not the pose's own solve — drag ${k1} vs re-latch ${k1b}`);
  else console.log('R3 OK: the at-rest ink equals a fresh re-latch at the same pose');
  await mouse('mouseReleased', pt(d.aEnd).x, pt(d.aEnd).y);

  // two more poses for the cross-tree pixel evidence (short drags, then
  // rest): P2 aims straight at the 1-ball (the contact lines show — stub and
  // cue post), P3 cuts it slightly
  const one = await screenOf(1);
  const aOne = Math.atan2(one.y - cue.y, one.x - cue.x);
  const turnsTo = (from, to) => { let t = (to - from) / (2 * Math.PI); t -= Math.round(t); return t; };
  let a = d.aEnd;
  for (const [name, target] of [['P2', aOne], ['P3', aOne + 0.06]]) {
    const dd = await drag(a, turnsTo(a, target));
    const ss = await settle(name);
    const rr = await chrome.eval(CLASSIFY(dd.t0, dd.t1));
    console.log(`${name} drag: kicks ${rr.kicks} (background ${rr.bgDriven}, refresh ${rr.refresh}, line-driven ${rr.lineDriven.length}); re-froze ${ss.ok}`);
    if (rr.lineDriven.length) fail(`${name} line law: ${rr.lineDriven.length} line-driven readbacks`);
    console.log(`INKKEY ${name} ${await inkKey()}`);
    await shot(name);
    await mouse('mouseReleased', pt(dd.aEnd).x, pt(dd.aEnd).y);
    a = dd.aEnd;
  }
  // R4 — the fresh-vote law: from a rest 0.12 rad off the 1-ball, a slow
  // drag onto it; the contact lines appear while the lines still move
  {
    const a4 = aOne - 0.12;
    const back = await drag(a, turnsTo(a, a4));
    await mouse('mouseReleased', pt(back.aEnd).x, pt(back.aEnd).y);
    await settle('R4 start');
    await chrome.eval('window.__ir.inkRec = []; true');
    const d4 = await drag(a4, turnsTo(a4, aOne), 0.12);
    const voted = `(() => { const ls = (__aim.inkLines?.() ?? []).filter((l) => l.role === 'stub' || l.role === 'cuePost');
      return ls.length > 0 && ls.every((l) => l.sL >= 0); })()`;
    const castOk = await until(voted, 'R4: the contact lines never voted after the stop', { ms: 3000, frames: 60 });
    const rec = await chrome.eval('(() => { const r = window.__ir.inkRec; window.__ir.inkRec = null; return r; })()');
    await mouse('mouseReleased', pt(d4.aEnd).x, pt(d4.aEnd).y);
    const T = await chrome.eval(`(() => { const s = window.__ir;
      return { frames: s.frames.slice(), line: s.line.slice(), kicks: s.kicks.slice(), resolves: s.resolves.slice() }; })()`);
    const lineAt = new Set(T.line);
    const nextFrame = (tf) => T.frames.find((x) => x > tf) ?? Infinity;
    const lastBefore = (arr, t, strict) => { let r = null; for (const x of arr) { if (strict ? x < t : x <= t) r = x; else break; } return r; };
    // the front a frame's solve can use: the latest readback resolved before the next frame starts — it answers the
    // latest kick before it (one readback in flight at a time)
    const frontKick = (tf) => { const tr = lastBefore(T.resolves, nextFrame(tf), true); return tr === null ? null : lastBefore(T.kicks, tr, true); };
    // a legal first vote at frame tf: its front was kicked in a frame AFTER the last line change (inclusive of tf), or,
    // past the 1 s escape (>= 0.9 s wall; the ink's 1 s runs on its dt-clamped clock, never faster), after the line appeared
    const legal = (tf, seen) => {
      if (tf === null) return null;
      const tk = frontKick(tf);
      if (tk === null) return null;
      const tl = lastBefore(T.line, tf, false);
      if (tl === null || tk >= nextFrame(tl)) return { tk, tl, how: 'front kicked after the last line change' };
      if (tf - seen >= 900 && tk >= nextFrame(seen)) return { tk, tl, how: '1 s escape' };
      return null;
    };
    const firstSeen = {}, judged = {}; let moving = 0, firstFrame = true; const bad = [], cast = [];
    let prevTf = null;
    for (const [tf, ls] of rec) {
      if (tf < d4.t0) { prevTf = tf; continue; }
      const contact = ls.filter((l) => l[0] === 'stub' || l[0] === 'cuePost');
      if (firstFrame) {
        firstFrame = false;
        if (contact.length) bad.push(`the start pose already shows ${contact.map((l) => l[0]).join(' + ')} (the arm needs contact lines that appear mid-drag)`);
      }
      for (const role of ['stub', 'cuePost']) {
        if (!contact.some((l) => l[0] === role)) { delete firstSeen[role]; delete judged[role]; } // a hidden line re-shows fresh
      }
      for (const [role] of contact) firstSeen[role] ??= tf;
      if (contact.length && lineAt.has(tf) && tf <= d4.t1) moving++;
      // the FIRST vote of each contact line, during the drag or after the stop; the vote may be read one frame late,
      // so the frame before is judged as well
      for (const [role, pol, sL] of contact) {
        if (judged[role] || sL < 0) continue;
        judged[role] = true;
        const ok = legal(tf, firstSeen[role]) ?? legal(prevTf, firstSeen[role]);
        if (ok) {
          cast.push(`${role}:${pol} +${Math.round(tf - d4.t0)} ms (${ok.how}: kick +${Math.round(ok.tk - d4.t0)} ms`
            + `${ok.tl !== null ? `, last line change +${Math.round(ok.tl - d4.t0)} ms` : ''})`);
        } else bad.push(`${role}:${pol} first voted at +${Math.round(tf - d4.t0)} ms on a front kicked before the lines' last change`);
      }
      prevTf = tf;
    }
    console.log(`R4 drag: ${rec.filter(([tf]) => tf >= d4.t0 && tf <= d4.t1).length} frames, ${moving} with contact lines while the lines moved; `
      + `voted after the stop: ${castOk}; first votes: ${cast.join('; ') || 'none'}`);
    if (moving < 2) fail(`R4: only ${moving} frame(s) showed contact lines while the lines moved — the arm proves nothing`);
    else if (bad.length) fail(`R4 fresh-vote law: ${bad.slice(0, 6).join(', ')}`);
    else if (castOk) console.log('R4 OK: every contact line appeared mid-drag and first voted on a front kicked after the lines last changed');
  }
  // R1s — slow input: no readback per gap. Every gesture is FRAME-LOCKED in page (an rAF loop issues one input every
  // N frames), so the gap it means to test holds at any frame rate; the aim first turns away from the rack (fewer
  // contact lines), and a kick a contact line's 1 s escape earns is attributed, not counted as a gap
  {
    const RIG_S = `window.__steps = (phi0, step, n, every) => new Promise((res) => { let f = 0, k = 0;
      const loop = () => { if (f++ % every === 0) { __test.aim(phi0 + step * ++k); if (k >= n) { res(performance.now()); return; } } requestAnimationFrame(loop); };
      requestAnimationFrame(loop); });
      window.__keys = (n, every) => new Promise((res) => { let f = 0, k = 0;
      const loop = () => { if (f++ % every === 0) { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', code: 'ArrowLeft', repeat: k > 0 }));
        if (++k >= n) { window.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowLeft', code: 'ArrowLeft' })); res(performance.now()); return; } }
        requestAnimationFrame(loop); };
      requestAnimationFrame(loop); });
      window.__contact = () => (__aim.inkLines?.() ?? []).some((l) => l.role === 'stub' || l.role === 'cuePost'); true`;
    await chrome.eval(RIG_S);
    const away = await chrome.eval('(__aim.aimAtBall(1), __aim.getPhi() + Math.PI)');
    await chrome.eval(`__test.aim(${away}), true`);
    // [name, run, the gesture leaves gaps of still frames (sparse) or not (dense)]
    const gestures = [
      ['aim change every 4th frame', async () => { const phi0 = await chrome.eval('__aim.getPhi()');
        const t0 = await chrome.eval('performance.now()'); const t1 = await chrome.eval(`__steps(${phi0}, 0.0015, 40, 4)`); return { t0, t1 }; }, true],
      ['ArrowLeft every 6th frame (10 Hz at 60 fps)', async () => { const t0 = await chrome.eval('performance.now()');
        const t1 = await chrome.eval('__keys(20, 6)'); return { t0, t1 }; }, true],
      ['ArrowLeft every 2nd frame (30 Hz at 60 fps)', async () => { const t0 = await chrome.eval('performance.now()');
        const t1 = await chrome.eval('__keys(60, 2)'); return { t0, t1 }; }, false],
    ];
    for (const [name, run, sparse] of gestures) {
      await settle(`R1s ${name} start`);
      const phiA = await chrome.eval('__aim.getPhi()');
      await chrome.eval('window.__ir.inkRec = []; true');
      const { t0, t1 } = await run();
      const contact = await chrome.eval(`(() => { const r = window.__ir.inkRec; window.__ir.inkRec = null;
        return r.some(([tf, ls]) => tf >= ${t0} && tf <= ${t1} && ls.some((l) => l[0] === 'stub' || l[0] === 'cuePost')); })()`);
      await settle(`R1s ${name} end`);
      const phiB = await chrome.eval('__aim.getPhi()');
      const r = await chrome.eval(CLASSIFY(t0, t1 + 50));
      const ks = await chrome.eval(GAPS(t0, t1 + 50));
      const still = r.frames - r.lineChanges;
      // every kick that is neither background- nor escape-driven fell in a gap of the gesture
      const gapN = r.kicks - r.bgDriven - r.escape;
      const gapKicks = ks.filter((k) => !k.bg).slice(0, Math.max(0, gapN));
      console.log(`R1s ${name}: ${r.frames} frames (${r.lineChanges} with line changes, ${still} still), aim moved ${(Math.abs(phiB - phiA) * 180 / Math.PI).toFixed(2)} deg, `
        + `contact lines ${contact ? 'seen' : 'none'}; kicks ${r.kicks} (background ${r.bgDriven}, 1 s escape ${r.escape}, gap ${gapN}), resolves ${r.resolves}`);
      // every-2nd-frame keys are dense here: the preview worker's reply lands the frame after each key, so the lines
      // change on (nearly) every frame — only "no gap readback" is asserted there
      if (r.lineChanges < 8 || (sparse && still < 8) || Math.abs(phiB - phiA) < 1e-4) fail(`R1s ${name}: the gesture did not show sparse input (line changes ${r.lineChanges}, still frames ${still}, aim moved ${phiB - phiA}) — the arm proves nothing`);
      else if (gapN > 0) fail(`R1s ${name}: ${gapN} readback(s) kicked in the gaps of a slow gesture (the window must wait 6 frames and 0.1 s): ${JSON.stringify(gapKicks.slice(0, 4))}`);
      else console.log(`R1s OK: ${name} — no readback between inputs`);
    }
  }
  if (consoleErrors.length) fail(`console errors: ${consoleErrors.slice(0, 3).join(' | ')}`);
} catch (e) {
  fail(String(e?.stack ?? e).slice(0, 400));
} finally {
  try { await chrome?.closeAndWait(); } catch { /* gone */ }
  await stopStaticServer(server);
}
console.log(process.exitCode ? 'E2E-INKREADBACK FAIL' : 'E2E-INKREADBACK PASS');
