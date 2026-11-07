// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-atelier-c32.mjs — card 32 v2 (signed 2026-10-11; atelier.md §7 B20-2):
// THE PHONE TABLE-PREVIEW FRAMING and THE AT-REST ORBIT. A LEG MODULE of
// e2e-atelier.mjs (the e2e-atelier-b20eq.mjs precedent): the suite runs the
// PR tier; standalone (`node web/tools/e2e-atelier-c32.mjs` under run-gate —
// e2e-nightly.yml) runs the full tier. OB_C32_LEGS=tf,motion,fov,scope,orbit
// narrows either and OB_C32_PHONES=phone844,... the phone registers (the
// planted-red copies).
//
//   TF-IN       a table staged by a real touch on the phone frames the WHOLE
//               table: the staged build's rail-top outline (read in the page
//               from scene/table.js makeGeom, projected through the live
//               camera in ONE settled evaluate) sits inside the safe area
//               (+ sp-2), above the place rail (− sp-2) and above the bar's
//               full-view seat on the tall rail (the rail's bottom row −
//               sp-2), clear of the quick-play stack; the pose is not the
//               table anchor and equals __atelier.tableFrame().pose (≤ 1e-6);
//   TF-HOLD     Full view on / off and a re-tap of the Table pill keep the
//               framing (≤ 1e-6); a pick of ANOTHER table (the Chinese 8-ball
//               table: its own asset family, so its build PREPARES — a
//               PENDING broadcast after the pick is a precondition, a FAIL
//               when absent) holds the framing while that build prepares
//               and re-fits from it: no sampled frame comes within 0.25 of
//               the table anchor (the wobble — a return flight cut to the
//               anchor at READY — fails);
//   TF-RESTORE  Put back flies back to the table anchor (the registry's
//               tuple, EPS 1e-9), and the framing record disengages;
//   TF-MOTION   (animated boot) the framing is one mover flight: moving() is
//               seen true after the stage, false again within 2.5 s; under
//               emulated reduced motion the pose lands with no flight;
//   TF-FOV      with the overhead camera preference on a pristine rack, a
//               re-stage to the older-generation 9-ft pool table (the same
//               outline class: a CONSTANT-lens move, 45 -> 45 on all three
//               phones — the mover never writes the lens on it; the Chinese
//               8-ball table frames at 40 on 667x375). Two re-homes, each
//               traced by its lens write under 39.5 and the mover state at
//               that write: (1) the preview's OWN rerack must land on an
//               idle mover (it runs inside READY's task; the move starts two
//               frames later — the deferral's ordering law); (2) a fresh-
//               rack re-home injected INTO the move (window.__test.rerack on
//               the move's first frame; no input, so nothing cuts it — the
//               lens re-assert's case) must never reach a frame: every
//               sampled frame's fov >= 39.5. Preconditions (a FAIL, never a
//               skip): the two framings share their lens; the injection ran
//               and its write landed while the mover was moving;
//   TF-SCOPE    (the plan's DESK-UNCHANGED camera rows) a table stage on fine
//               pointers (desktop 1440x900, the macOS window 1280x800) and
//               on the coarse tablet (1366x1024) leaves the pose on the
//               table anchor; a cushion-row stage on the phone never frames;
//   TF-ROTATE   (full tier) a framed table rotated to portrait (the phone
//               predicate ends: the framing restores) and back to landscape
//               frames again — a band change re-judges a DISENGAGED framing
//               (the review of 889d61d7, P2-1);
//   TF-RETAP    (full tier) a re-judge during the framing flight (the
//               transaction re-broadcast: ob:table-state READY, dispatched
//               while the mover flies) still ends verified — the unchanged
//               framing keeps its completion and verification (P2-3);
//   TF-ZOOM     (full tier) a wheel zoom on the scene during the flight cuts
//               it to its end pose and zooms (precondition: right after the
//               wheel the mover is idle and the radius is under the framing
//               radius); the
//               framing then records its yield and never moves the camera
//               back (radius kept, corrections 0) (P2-2);
//   TF-YIELD-HOLD (full tier) after that yield a band change that moves the
//               fit for the SAME table (past atelier.js's same-pose
//               tolerance) keeps the user's camera (radius, no move);
//               TF-RETURN: an explicit return to the table station
//               re-flies the framing and verifies it again (the lane's review
//               review of the fix);
//   TF-REFIT    (full tier) with no gesture, a band change that moves the
//               fit for the SAME table re-flies the framing onto the new
//               fit and verifies it (not yielded, the camera on the record);
//   TF-GESTURE-HOLD (full tier) a wheel zoom AFTER the verification (the
//               mover idle: it cuts no flight), then that band change and
//               the change back: the zoomed radius and the move count stand
//               and the framing records its yield; TF-RETURN after this
//               yield re-flies and verifies again (#1191, the
//               review of 753ba102);
//   TF-DRAG-HOLD (full tier) a middle-button pan pressed during the flight
//               (it cuts it), held still through the verification, then
//               dragged and released: the band change keeps the dragged view
//               (yielded, no new move) — the drag's moves are uncounted, so
//               the verification carries the held drag (review round fu2);
//   TF-ORBIT-HOLD (full tier) after an explicit return re-flies and
//               verifies the framing, a right-button orbit (orbit.js's
//               free orbit, which the shell keeps live and counts)
//               pressed, dragged and released AFTER it settled: the band
//               change keeps the user's camera (yielded, no new move) —
//               the batch-9 routing names it;
//   TF-NOINPUT  (full tier, the first phone) the lamp-fade import held
//               over CDP Fetch until the framing verified, then released:
//               (a) main.js's lamp-fade settle applies nothing while the
//               shell owns the camera, so the camera stays on the framing
//               (#1192); (b) a camera write with no input (an orbit turn
//               in one evaluate; the shell's input count unchanged) must
//               not yield the framing: a band change re-fits it — a camera
//               write is not the user's (the lane's review round fu1); then
//               quick play exits onto the overhead register (#1192);
//   ORBIT       on the phone the looked-at card turns at rest (the --live
//               card + a running animation on its strip); never under
//               emulated reduced motion, never while the page is hidden or
//               the full view is on.
// Tiers: PR = TF-IN / TF-HOLD / TF-RESTORE on phone 844x390 (insets
// 0/47/47/21) + TF-SCOPE desktop + ORBIT (en); full = every leg (TF-ROTATE / TF-RETAP / TF-ZOOM
// included) on 844x390,
// 812x375 (insets 0/50/50/21) and 667x375, TF-SCOPE on all three non-phone
// registers.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import net from 'node:net';
import { answerPausedRequest, launchChrome, sleep, spawnStaticServer, stopStaticServer } from './cdp.mjs';
import { launchPhone, setPhoneMetrics, setSafeAreaInsets, touchStart, touchEnd } from './touch-cdp.mjs';

export const PORT_INVENTORY = { http: 1, cdp: 1 };
// SHARED_DEFAULT_WINDOW — one suite in two files: e2e-atelier imports runC32; standalone this leg runs on atelier's own default ports
export const SHARED_DEFAULT_WINDOW = 'e2e-atelier';

const J = (o) => JSON.stringify(o);
const PHONES = [
  { id: 'phone844', w: 844, h: 390, sa: { top: 0, left: 47, right: 47, bottom: 21 } },
  { id: 'phone812', w: 812, h: 375, sa: { top: 0, left: 50, right: 50, bottom: 21 } },
  { id: 'phone667', w: 667, h: 375 },
];
const NONPHONES = [
  { id: 'desk1440', w: 1440, h: 900, coarse: false },
  { id: 'mac1280', w: 1280, h: 800, coarse: false },
  { id: 'tablet1366', w: 1366, h: 1024, coarse: true },
];
const LEGS = (process.env.OB_C32_LEGS || 'tf,tfx,tfnoinput,motion,fov,scope,orbit').split(',');

async function waitPortFree(port, ms = 15000) {
  const t0 = Date.now();
  for (;;) {
    const busy = await new Promise((res) => { const s = net.connect({ port, host: '127.0.0.1' }); s.once('connect', () => { s.destroy(); res(true); }); s.once('error', () => res(false)); });
    if (!busy) return true;
    if (Date.now() - t0 > ms) return false;
    await sleep(250);
  }
}
async function waitExpr(c, expr, ms = 60000, step = 150) {
  const t0 = Date.now(); let last = null;
  while (Date.now() - t0 < ms) {
    try { last = await c.eval(expr); if (last === true) return true; } catch (e) { last = String(e?.message || e); }
    await sleep(step);
  }
  return last ?? false;
}
/** A trusted press at the element's centre (a tap on coarse); refuses a covered target. A refusal carries the rail's
 * geometry at that moment — its band vars, rect, anchor and scroll, the viewport and the time since the boot's table
 * arrival — so a recurrence names its cause (batch 9's phone844/motion-reduced card centre at y −212, the maintainer's
 * #1200 follow-up). The verdict is unchanged. */
async function press(c, sel, coarse) {
  const r = await c.eval(`(() => { const el = [...document.querySelectorAll(${J(sel)})].find((x) => x.getClientRects().length > 0); if (!el) return null;
    el.scrollIntoView({ block: 'nearest', inline: 'center' }); const b = el.getBoundingClientRect(); const x = b.left + b.width / 2, y = b.top + b.height / 2;
    const h = document.elementFromPoint(x, y); const hit = !!h && (h === el || el.contains(h)); if (hit) return { x, y, hit };
    const cs = getComputedStyle(document.documentElement), rail = document.getElementById('ob-atelier-rail'), rr = rail && rail.getBoundingClientRect();
    const strip = rail && rail.querySelector('[data-ob="atelier-rail-cards"]'), N = (n) => Math.round(n * 10) / 10, vv = window.visualViewport;
    return { x, y, hit, at: h ? h.tagName.toLowerCase() + (h.id ? '#' + h.id : '') : null,
      // the band vars that place the rail (atelier.js publishBands, shell.js writeBands)
      band: Object.fromEntries(['--ob-eq-rail-b', '--ob-eq-rail-dx', '--ob-eq-rail-l', '--ob-eq-rail-w', '--ob-eq-host-b', '--ob-eq-sheet-top', '--ob-eq-cardcol-h', '--ob-eq-seat-t', '--ob-shell-rail-top', '--ob-shell-rail-h', '--ob-shell-reserve-b'].map((k) => [k, cs.getPropertyValue(k).trim() || null])),
      rail: rail && { rect: rr && [rr.top, rr.bottom, rr.left, rr.right].map(N), anchor: rail.dataset.obRailAnchor ?? null, cls: rail.className,
        hidden: rail.hidden, scroll: [rail.scrollTop, strip ? strip.scrollLeft : null] },
      vp: { w: innerWidth, h: innerHeight, vvH: vv ? N(vv.height) : null, vvTop: vv ? N(vv.offsetTop) : null, scrollY },
      sinceArrival: typeof window.__c32arrived === 'number' ? Math.round(performance.now() - window.__c32arrived) : null }; })()`);
  if (!r) throw new Error(`press: no painted ${sel}`);
  if (!r.hit) throw new Error(`press: ${sel} is covered at its centre ${J(r)}`);
  if (coarse) { await touchStart(c, [{ x: r.x, y: r.y, id: 1 }]); await sleep(40); await touchEnd(c); return; }
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
    await c.send('Input.dispatchMouseEvent', { type, x: r.x, y: r.y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });
  }
}

/** ONE settled evaluate: the staged build's outline through the live camera + the window it must sit in. */
const TF_READ = `(async () => {
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const tm = await import(new URL('scene/table.js', location.href).href);
  const id = window.__tableBuild.tableId(); const g = tm.makeGeom(id);
  const hx = g.L / 2 + g.CW + g.render.frameWidth, hz = g.W / 2 + g.CW + g.render.frameWidth, y = g.render.frameTop ?? 0.047;
  const cam = window.__dbg.camera; cam.updateMatrixWorld(true);
  const cv = document.querySelector('body > canvas').getBoundingClientRect();
  const quad = [[-hx, y, -hz], [hx, y, -hz], [hx, y, hz], [-hx, y, hz]].map(([x, yy, z]) => {
    const v = cam.position.clone().set(x, yy, z).project(cam);
    return [cv.left + (v.x + 1) / 2 * cv.width, cv.top + (1 - v.y) / 2 * cv.height]; });
  const pr = document.createElement('div');
  pr.style.cssText = 'position:fixed;visibility:hidden;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px);width:var(--ob-sp-2)';
  document.body.appendChild(pr); const pc = getComputedStyle(pr);
  const ins = { t: parseFloat(pc.paddingTop), r: parseFloat(pc.paddingRight), b: parseFloat(pc.paddingBottom), l: parseFloat(pc.paddingLeft) };
  const sp2 = parseFloat(pc.width); pr.remove();
  const R = (e) => e && e.getClientRects().length ? e.getBoundingClientRect() : null;
  const nav = R(document.getElementById('ob-shell-rail')), qp = R(document.getElementById('ob-shell-quickplay-wrap'));
  const rail = document.getElementById('ob-atelier-rail'), rr = R(rail), bar = R(rail.querySelector('[data-ob="atelier-txbar"]'));
  const tall = rail.classList.contains('ob-atelier-rail--tall');
  let bottom = window.innerHeight - ins.b - sp2;
  if (nav) bottom = Math.min(bottom, nav.top - sp2);
  if (tall && rr && bar) bottom = Math.min(bottom, rr.bottom - bar.height - sp2);
  const win = { top: ins.t + sp2, left: ins.l + sp2, right: window.innerWidth - ins.r - sp2, bottom };
  const p = window.__shell.pose();
  return { id, quad, win, tall, qp: qp && { l: qp.left - sp2, t: qp.top - sp2, r: qp.right + sp2, b: qp.bottom + sp2 },
    pose: { tx: p.target[0], ty: p.target[1], tz: p.target[2], radius: p.radius, theta: p.theta, phi: p.phi, fov: p.fov },
    frame: window.__atelier.tableFrame(), anchor: window.__atelier.registry().find((r) => r.id === 'table').anchor,
    moving: window.__shell.moving() };
})()`;
const poseDelta = (a, b) => Math.max(...['tx', 'ty', 'tz', 'radius', 'theta', 'phi', 'fov'].map((k) => Math.abs((a?.[k] ?? NaN) - (b?.[k] ?? NaN))));
const SHELL_POSE = `(() => { const p = window.__shell.pose(); return { tx: p.target[0], ty: p.target[1], tz: p.target[2], radius: p.radius, theta: p.theta, phi: p.phi, fov: p.fov }; })()`;
const ANCHOR = (id) => `window.__atelier.registry().find((r) => r.id === ${J(id)}).anchor`;
/** orbit terms only (the TF-HOLD anchor distance): the lens is TF-FOV's */
const orbitDelta = (a, b) => Math.max(...['tx', 'tz', 'radius', 'phi'].map((k) => Math.abs((a?.[k] ?? NaN) - (b?.[k] ?? NaN))));
/** per-frame orbit pose samples (rAF, after the render loop's mover tick) until STOP_SAMPLING; __c32done proves the
 * sampler was still live when the judged window closed (a capped or dead sampler is a FAIL, never a short pass) */
const SAMPLE_POSES = `(() => { window.__c32p = []; window.__c32stop = false; window.__c32done = false; (function tick() {
  if (window.__c32stop) { window.__c32done = true; return; } const p = window.__shell.pose();
  window.__c32p.push({ tx: p.target[0], tz: p.target[2], radius: p.radius, phi: p.phi, fov: p.fov });
  if (window.__c32p.length < 20000) requestAnimationFrame(tick); })(); return true; })()`;
/** per-frame lens samples until STOP_SAMPLING + a trace of every lens write under 39.5 (an overhead re-home): all of
 * them (__c32ow) and those made while the mover flew (__c32owm) */
const SAMPLE_LENS = `(() => { const cam = window.__dbg.camera; let v = cam.fov; window.__c32f = []; window.__c32ow = 0; window.__c32owm = 0;
  window.__c32stop = false; window.__c32done = false;
  Object.defineProperty(cam, 'fov', { configurable: true, get() { return v; }, set(x) { if (x < 39.5) { window.__c32ow += 1; if (window.__shell.moving()) window.__c32owm += 1; } v = x; } });
  (function tick() { if (window.__c32stop) { window.__c32done = true; return; } window.__c32f.push(cam.fov); if (window.__c32f.length < 20000) requestAnimationFrame(tick); })(); return true; })()`;
const STOP_SAMPLING = `new Promise((r) => { window.__c32stop = true; requestAnimationFrame(() => requestAnimationFrame(() => r(window.__c32done === true))); })`;

export async function runC32({ PORT, CDP_PORT, fail: failIn, log = console.log, tier = 'full' }) {
  const fail = (m) => failIn(`C32 ${m}`);
  const t0 = Date.now(); // the leg's own cost (every boot + judgement; no server start), read by the per-PR budget
  let judged = 0;
  const onlyPhones = process.env.OB_C32_PHONES ? process.env.OB_C32_PHONES.split(',') : null; // the planted-red copies
  const phones = (tier === 'pr' ? PHONES.slice(0, 1) : PHONES).filter((r) => !onlyPhones || onlyPhones.includes(r.id));
  const boot = async (reg, tag, { coarse = true, reduced = false, launch = null } = {}) => {
    if (!(await waitPortFree(CDP_PORT))) throw new Error(`${tag}: cdp port ${CDP_PORT} still busy`);
    const url = `http://127.0.0.1:${PORT}/app.html?obshell=1&seed=1&u=c32_${tag.replace(/\W/g, '_')}`;
    const c = launch ? await launch(url) : coarse ? await launchPhone(url, { cdpPort: CDP_PORT, width: reg.w, height: reg.h, tool: false })
      : await launchChrome(url, { port: CDP_PORT, width: reg.w, height: reg.h, tool: false });
    try {
      if (reg.sa) await setSafeAreaInsets(c, reg.sa);
      if (reduced) await c.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
      if (await waitExpr(c, 'window.__test?.ready === true', 180000, 250) !== true) throw new Error(`${tag}: boot never ready`);
      if (await waitExpr(c, 'window.__shell?.isOpen?.() === true', 90000) !== true) throw new Error(`${tag}: no hall at boot`);
      for (let i = 0; i < 6; i++) {
        await c.eval(`window.__shell.go('equipment'), true`);
        if (await waitExpr(c, `typeof window.__atelier === 'object' && window.__shell.place() === 'equipment' && window.__shell.moving() === false`, 15000) === true) break;
      }
      await c.eval(`window.__atelier.go('table'), true`);
      const at = await waitExpr(c, `window.__atelier.station() === 'table' && window.__shell.moving() === false && window.__atelier.rail().live === true`, 60000);
      if (at !== true) throw new Error(`${tag}: the table station never arrived (${J(at)})`);
      await c.eval('window.__c32arrived = performance.now(), true'); // press()'s refusal reports the time since this arrival
      await sleep(900);
      return c;
    } catch (e) { try { c.close(); } catch { /* gone */ } throw e; }
  };
  const stageTable = async (c, coarse) => {
    const pick = await c.eval(`[...document.querySelectorAll('#ob-atelier-rail .ob-cardrail-card')].map((b) => b.dataset.id).find((id) => id !== window.__settings.get().equipment.table_id && id === 'wpa_spec_9ft') ?? [...document.querySelectorAll('#ob-atelier-rail .ob-cardrail-card:not([aria-disabled="true"])')].map((b) => b.dataset.id).find((id) => id !== window.__settings.get().equipment.table_id)`);
    if (!pick) throw new Error('no other table card to stage');
    await press(c, `#ob-atelier-rail .ob-cardrail-card[data-id="${pick}"]`, coarse);
    return pick;
  };
  /** Stage a SECOND table while one is staged, `prefer` when offered (TF-HOLD: the Chinese 8-ball table — another asset
   * family, so its build prepares; TF-FOV: the older-generation 9-ft pool table — the same outline class, one lens). */
  const stageNext = async (c, coarse, prefer) => {
    const pick = await c.eval(`(() => { const s = window.__settings; const act = s.preview?.active?.();
      const committed = act?.equipment?.table_id ?? s.get().equipment.table_id, cur = s.get().equipment.table_id, built = window.__tableBuild?.tableId?.();
      const ids = [...document.querySelectorAll('#ob-atelier-rail .ob-cardrail-card:not([aria-disabled="true"])')].map((b) => b.dataset.id)
        .filter((id) => id !== committed && id !== cur && id !== built);
      return ids.includes(${J(prefer)}) ? ${J(prefer)} : ids[0] ?? null; })()`);
    if (!pick) throw new Error('no second table card to stage');
    await c.eval(`document.querySelector('#ob-atelier-rail .ob-cardrail-card[data-id="${pick}"]').scrollIntoView({ block: 'nearest', inline: 'center' }), true`);
    await sleep(500); // a smooth rail scroll settles before the press reads the card's centre
    await press(c, `#ob-atelier-rail .ob-cardrail-card[data-id="${pick}"]`, coarse);
    return pick;
  };
  const settledOn = (c, id) => waitExpr(c, `(() => { const f = window.__atelier.tableFrame(); return window.__shell.moving() === false && f.engaged === true && f.id === ${J(id)} && f.verified === true && f.pending === false; })()`, 30000, 120);
  const settledFrame = (c) => waitExpr(c, `(() => { const f = window.__atelier.tableFrame(); return window.__shell.moving() === false && f.engaged === true && f.verified === true && f.pending === false; })()`, 30000, 120);
  const judgeIn = (tag, z) => {
    judged += 1;
    const bad = [];
    if (!z.frame?.engaged) bad.push(`TF-IN the framing never engaged ${J(z.frame)}`); // a readout that never engages is a FAIL, never a skip
    const out = z.quad.filter(([x, y]) => !(x >= z.win.left - 0.5 && x <= z.win.right + 0.5 && y >= z.win.top - 0.5 && y <= z.win.bottom + 0.5));
    if (out.length) bad.push(`TF-IN ${out.length} outline corner(s) outside the window ${J(z.win)}: ${J(out.map((p) => p.map((v) => +v.toFixed(1))))}`);
    if (z.qp && z.quad.some(([x, y]) => x >= z.qp.l && x <= z.qp.r && y >= z.qp.t && y <= z.qp.b)) bad.push(`TF-IN a corner meets the quick-play stack ${J(z.qp)}`);
    if (poseDelta(z.pose, z.anchor) < 1e-3) bad.push('TF-IN the pose is still the table anchor');
    if (z.frame?.pose && poseDelta(z.pose, z.frame.pose) > 1e-6) bad.push(`TF-IN the live pose differs from the framing record by ${poseDelta(z.pose, z.frame.pose)}`);
    log(`C32 ${tag} ${J({ id: z.id, tall: z.tall, rect: z.frame?.rect, win: z.win, pose: z.pose })}`);
    for (const m of bad) fail(`${tag}: ${m}`);
    return !bad.length;
  };

  // ---- TF-IN / TF-HOLD / TF-RESTORE (+ TF-MOTION, TF-FOV in the full tier) on the phones
  for (const reg of phones) {
    if (LEGS.includes('tf')) {
      const tag = `${reg.id}/tf`;
      let c = null;
      try {
        c = await boot(reg, tag);
        await stageTable(c, true);
        if (await settledFrame(c) !== true) fail(`${tag}: TF-IN the framing never settled ${J(await c.eval('window.__atelier.tableFrame()'))}`);
        const z = await c.eval(TF_READ);
        judgeIn(`${tag}/staged`, z);
        // TF-HOLD: Full view on / off, the Table pill re-tapped
        const p0 = z.pose;
        await press(c, '[data-ob="atelier-view"]', true);
        await sleep(700);
        const pView = await c.eval(SHELL_POSE);
        if (poseDelta(pView, p0) > 1e-6) fail(`${tag}: TF-HOLD Full view moved the camera by ${poseDelta(pView, p0)}`);
        await press(c, '[data-ob="atelier-view"]', true);
        await sleep(400);
        await c.eval(`window.__atelier.go('table'), true`);
        await waitExpr(c, 'window.__shell.moving() === false', 10000);
        await sleep(400);
        const pRetap = await c.eval(SHELL_POSE);
        if (poseDelta(pRetap, p0) > 1e-6) fail(`${tag}: TF-HOLD a re-tap of the Table pill left the framing (delta ${poseDelta(pRetap, p0)})`);
        // TF-HOLD: another table picked — the framing holds while it prepares, then re-fits from where it stands
        const anchor0 = await c.eval(ANCHOR('table'));
        await c.eval(SAMPLE_POSES);
        await c.eval(`window.__c32ts = []; window.addEventListener('ob:table-state', (e) => window.__c32ts.push(e?.detail?.status)); true`);
        const b = await stageNext(c, true, 'chinese8_pro_9ft');
        if (await settledOn(c, b) !== true) fail(`${tag}: TF-HOLD the framing never re-fitted for ${b} ${J(await c.eval('window.__atelier.tableFrame()'))}`);
        const states = await c.eval('window.__c32ts');
        if (!states.includes('PENDING')) fail(`${tag}: TF-HOLD precondition: the ${b} build never prepared (no PENDING broadcast after the pick: ${J(states)}) — the hold went unexercised`);
        if (await c.eval(STOP_SAMPLING) !== true) fail(`${tag}: TF-HOLD the pose sampler was not live through the re-fit (capped or stalled)`);
        const poses = await c.eval('window.__c32p');
        const near = Math.min(...poses.map((q) => orbitDelta(q, anchor0)));
        if (poses.length < 10) fail(`${tag}: TF-HOLD only ${poses.length} frame(s) sampled across the re-stage to ${b}`);
        else if (!(near > 0.25)) fail(`${tag}: TF-HOLD the re-stage to ${b} came back to the table anchor (closest ${near.toFixed(4)} over ${poses.length} frames)`);
        log(`C32 ${tag}/restage ${J({ b, states, frames: poses.length, closestToAnchor: +near.toFixed(4), pose: (await c.eval('window.__atelier.tableFrame()')).pose })}`);
        judged += 1;
        // TF-RESTORE: Put back
        await press(c, '[data-ob="atelier-revert"]', true);
        await waitExpr(c, `document.querySelector('[data-ob="atelier-txbar"]')?.hidden === true`, 15000);
        await sleep(300);
        await waitExpr(c, 'window.__shell.moving() === false && window.__atelier.tableFrame().engaged === false', 15000);
        await sleep(300);
        const pBack = await c.eval(SHELL_POSE), anchor = await c.eval(ANCHOR('table'));
        if (poseDelta(pBack, anchor) > 1e-9) fail(`${tag}: TF-RESTORE Put back left the camera ${poseDelta(pBack, anchor)} from the table anchor ${J({ pBack, anchor })}`);
        if ((await c.eval('window.__atelier.tableFrame().engaged')) !== false) fail(`${tag}: TF-RESTORE the framing record survives Put back`);
        judged += 1;
      } catch (e) { fail(`${tag}: ${e?.message || e}`); }
      finally { try { c?.close(); } catch { /* gone */ } await sleep(600); }
    }
    // TF-ROTATE / TF-RETAP / TF-ZOOM (full tier): the review of 889d61d7, the three framing P2s
    if (tier !== 'pr' && LEGS.includes('tfx')) {
      const tag = `${reg.id}/tfx`;
      let c = null;
      const frame = () => c.eval('window.__atelier.tableFrame()');
      const putBack = async () => {
        await press(c, '[data-ob="atelier-revert"]', true);
        await waitExpr(c, `document.querySelector('[data-ob="atelier-txbar"]')?.hidden === true`, 15000);
        if (await waitExpr(c, 'window.__shell.moving() === false && window.__atelier.tableFrame().engaged === false', 15000) !== true) throw new Error(`Put back never disengaged the framing ${J(await frame())}`);
        await sleep(300);
      };
      // a re-stage of the same table: its build is ready, so the framing flies at once; resolves inside the flight
      const restageInFlight = async (pick) => {
        await press(c, `#ob-atelier-rail .ob-cardrail-card[data-id="${pick}"]`, true);
        return waitExpr(c, 'window.__shell.moving() === true && window.__atelier.tableFrame().engaged === true', 5000, 20);
      };
      try {
        c = await boot(reg, tag);
        const pick = await stageTable(c, true);
        if (await settledFrame(c) !== true) throw new Error(`the framing never settled ${J(await frame())}`);
        // TF-ROTATE: to portrait (the phone predicate ends, the framing restores) and back: it must frame again
        await setPhoneMetrics(c, { width: reg.h, height: reg.w });
        if (reg.sa) await setSafeAreaInsets(c, { top: 0, left: 0, right: 0, bottom: 0 });
        if (await waitExpr(c, 'window.__shell.moving() === false && window.__atelier.tableFrame().engaged === false', 15000) !== true) fail(`${tag}: TF-ROTATE precondition: the framing stayed engaged in portrait ${J(await frame())}`);
        await sleep(500);
        await setPhoneMetrics(c, { width: reg.w, height: reg.h });
        if (reg.sa) await setSafeAreaInsets(c, reg.sa);
        if (await settledFrame(c) !== true) fail(`${tag}: TF-ROTATE the framing never re-engaged after the rotation back to landscape ${J(await frame())}`);
        else judgeIn(`${tag}/rotate`, await c.eval(TF_READ));
        judged += 1;
        // TF-RETAP: a re-judge during the flight must not strand the verification, and no replacement move may supply it
        await putBack();
        if (await restageInFlight(pick) !== true) fail(`${tag}: TF-RETAP precondition: no framing flight after the re-stage ${J(await frame())}`);
        else {
          const r0 = await c.eval(`(() => { const f = window.__atelier.tableFrame(), m = window.__shell.moving();
            window.dispatchEvent(new CustomEvent('ob:table-state', { detail: { status: 'READY' } })); return { m, moves: f.moves, pose: f.pose }; })()`);
          if (r0.m !== true) fail(`${tag}: TF-RETAP precondition: the re-judge landed after the flight`);
          else if (await settledFrame(c) !== true) fail(`${tag}: TF-RETAP the framing never verified after a re-judge during its flight ${J(await frame())}`);
          else {
            const f1 = await frame();
            if (f1.moves !== r0.moves || poseDelta(f1.pose, r0.pose) > 1e-9 || f1.lastFlight !== 'landed') fail(`${tag}: TF-RETAP the verification did not come from the original flight (moves ${r0.moves} -> ${f1.moves}, pose delta ${poseDelta(f1.pose, r0.pose)}, last flight ${f1.lastFlight})`);
          }
        }
        judged += 1;
        // TF-ZOOM: a wheel zoom during the flight cuts it and zooms; the framing must not undo the zoom. The wheel is
        // dispatched on the canvas in the page, in the same task that reads the mover, so it provably lands in the flight.
        await putBack();
        if (await restageInFlight(pick) !== true) fail(`${tag}: TF-ZOOM precondition: no framing flight after the re-stage ${J(await frame())}`);
        else {
          const z1 = await c.eval(`(() => { const cv = document.querySelector('body > canvas'), m = window.__shell.moving(), f = window.__atelier.tableFrame();
            cv.dispatchEvent(new WheelEvent('wheel', { deltaY: -300, bubbles: true, cancelable: true }));
            return { m, framed: f.pose.radius, r: window.__shell.pose().radius, after: window.__shell.moving() }; })()`);
          const want = z1.framed * Math.exp(-0.3);
          if (z1.m !== true || z1.after !== false || Math.abs(z1.r - want) > 1e-6) fail(`${tag}: TF-ZOOM precondition: the wheel did not cut the flight and zoom (moving ${z1.m} -> ${z1.after}, radius ${z1.r}, want ${want})`);
          else {
            await sleep(1500); // the verification runs two frames after the cut; a corrective move takes 900 ms
            const z2 = await c.eval('({ pose: window.__shell.pose(), frame: window.__atelier.tableFrame() })');
            if (Math.abs(z2.pose.radius - z1.r) > 1e-3 || z2.frame.corrections !== 0) fail(`${tag}: TF-ZOOM the framing undid the user's zoom (radius ${z1.r} -> ${z2.pose.radius}, corrections ${z2.frame.corrections})`);
            else if (z2.frame.yielded !== true || z2.frame.lastFlight !== 'cut') fail(`${tag}: TF-ZOOM the framing did not record its yield after a cut flight ${J(z2.frame)}`);
            log(`C32 ${tag}/zoom ${J({ framed: z1.framed, r1: z1.r, r2: z2.pose.radius, corrections: z2.frame.corrections, yielded: z2.frame.yielded, lastFlight: z2.frame.lastFlight })}`);
            // TF-YIELD-HOLD: a band change that moves the fit for the SAME table keeps the user's camera. Precondition:
            // the refit leaves atelier.js's same-pose tolerance (tfSame: every component within 1e-3), so only the
            // yield's hold can keep the camera (a refit inside the tolerance returns through the same-pose branch)
            const h0 = await frame();
            await setPhoneMetrics(c, { width: reg.w, height: reg.h - 12 });
            await sleep(1500);
            const h1 = await c.eval('({ pose: window.__shell.pose(), frame: window.__atelier.tableFrame() })');
            const hd = poseDelta(h1.frame.pose, h0.pose);
            if (!Number.isFinite(hd) || hd < 1e-3) fail(`${tag}: TF-YIELD-HOLD precondition: the resize did not move the fit past the same-pose tolerance (delta ${hd}) ${J(h1.frame.pose)}`);
            else if (Math.abs(h1.pose.radius - z1.r) > 1e-3 || h1.frame.moves !== h0.moves || h1.frame.yielded !== true) fail(`${tag}: TF-YIELD-HOLD a refit for the same table took the camera back (radius ${z1.r} -> ${h1.pose.radius}, moves ${h0.moves} -> ${h1.frame.moves}, yielded ${h1.frame.yielded})`);
            log(`C32 ${tag}/yieldhold ${J({ fitDelta: hd, r: h1.pose.radius, moves: h1.frame.moves, yielded: h1.frame.yielded })}`);
            await setPhoneMetrics(c, { width: reg.w, height: reg.h });
            await sleep(800);
            judged += 1;
            // TF-RETURN: an explicit return to the table station re-flies the framing and verifies it again
            await c.eval(`window.__atelier.go('table'), true`);
            if (await settledFrame(c) !== true) fail(`${tag}: TF-RETURN the framing never re-verified after an explicit return ${J(await frame())}`);
            else {
              const t1 = await c.eval('({ pose: window.__shell.pose(), frame: window.__atelier.tableFrame() })');
              if (t1.frame.yielded !== false || Math.abs(t1.pose.radius - t1.frame.pose.radius) > 1e-6) fail(`${tag}: TF-RETURN the return did not take the framing back (yielded ${t1.frame.yielded}, radius ${t1.pose.radius} vs ${t1.frame.pose.radius})`);
            }
          }
        }
        judged += 1;
        // TF-REFIT / TF-GESTURE-HOLD (#1191): a band change that moves the fit for the SAME table re-fits a camera the
        // user never touched, and keeps one the user zoomed AFTER the verification — a gesture that cut no flight, so
        // only the re-judge's own test of the landed pose can record it. A band change re-judges two frames later, so
        // every wait first sees the re-judge's flight (the move count) before it waits for the verification
        const refitAfter = async (m) => (await waitExpr(c, `window.__atelier.tableFrame().moves > ${m}`, 5000, 20)) === true && (await settledFrame(c)) === true;
        const g0 = await frame();
        if (!(g0.engaged === true && g0.verified === true && g0.pending === false && g0.yielded === false)) fail(`${tag}: TF-REFIT precondition: no verified, unyielded framing to start from ${J(g0)}`);
        else {
          // TF-REFIT: no gesture, then the band change: a new flight lands on the new fit
          await setPhoneMetrics(c, { width: reg.w, height: reg.h - 12 });
          if (!(await refitAfter(g0.moves))) fail(`${tag}: TF-REFIT the band change never re-flew and verified the untouched framing ${J(await frame())}`);
          else {
            const g1 = await c.eval(`({ pose: ${SHELL_POSE}, frame: window.__atelier.tableFrame() })`);
            const gd = poseDelta(g1.frame.pose, g0.pose);
            if (!Number.isFinite(gd) || gd < 1e-3) fail(`${tag}: TF-REFIT precondition: the resize did not move the fit past the same-pose tolerance (delta ${gd})`);
            else if (g1.frame.yielded !== false || poseDelta(g1.pose, g1.frame.pose) > 1e-6) fail(`${tag}: TF-REFIT the untouched framing did not land on the new fit (yielded ${g1.frame.yielded}, camera off the record by ${poseDelta(g1.pose, g1.frame.pose)})`);
            log(`C32 ${tag}/refit ${J({ fitDelta: gd, moves: [g0.moves, g1.frame.moves], yielded: g1.frame.yielded })}`);
          }
          judged += 1;
          // back to the starting band (the untouched framing re-fits again), then TF-GESTURE-HOLD: a wheel zoom with the
          // framing verified and the mover idle, dispatched on the canvas in the page in the same task that reads them
          const m1 = (await frame()).moves;
          await setPhoneMetrics(c, { width: reg.w, height: reg.h });
          if (!(await refitAfter(m1))) fail(`${tag}: TF-GESTURE-HOLD precondition: the framing never re-fitted to the starting band ${J(await frame())}`);
          else {
            const h0 = await frame();
            const z = await c.eval(`(() => { const cv = document.querySelector('body > canvas'), f = window.__atelier.tableFrame(), m = window.__shell.moving();
              cv.dispatchEvent(new WheelEvent('wheel', { deltaY: -300, bubbles: true, cancelable: true }));
              return { m, verified: f.verified, pending: f.pending, yielded: f.yielded, framed: f.pose.radius, r: window.__shell.pose().radius, after: window.__shell.moving() }; })()`);
            const want = z.framed * Math.exp(-0.3);
            if (z.m !== false || z.verified !== true || z.pending !== false || z.yielded !== false || z.after !== false || Math.abs(z.r - want) > 1e-6) fail(`${tag}: TF-GESTURE-HOLD precondition: the zoom did not land on a verified, idle, unyielded framing ${J(z)} (want radius ${want})`);
            else {
              await sleep(600);
              const zf = await frame();
              await setPhoneMetrics(c, { width: reg.w, height: reg.h - 12 });
              await sleep(1500);
              const h1 = await c.eval(`({ pose: ${SHELL_POSE}, frame: window.__atelier.tableFrame() })`);
              const hd = poseDelta(h1.frame.pose, h0.pose);
              if (!Number.isFinite(hd) || hd < 1e-3) fail(`${tag}: TF-GESTURE-HOLD precondition: the resize did not move the fit past the same-pose tolerance (delta ${hd})`);
              else if (Math.abs(h1.pose.radius - z.r) > 1e-3 || h1.frame.moves !== zf.moves || h1.frame.yielded !== true) fail(`${tag}: TF-GESTURE-HOLD a refit for the same table flew over the user's zoom made after the verification (radius ${z.r} -> ${h1.pose.radius}, moves ${zf.moves} -> ${h1.frame.moves}, yielded ${h1.frame.yielded})`);
              await setPhoneMetrics(c, { width: reg.w, height: reg.h });
              await sleep(1500);
              const h2 = await c.eval(`({ pose: ${SHELL_POSE}, frame: window.__atelier.tableFrame() })`);
              if (Math.abs(h2.pose.radius - z.r) > 1e-3 || h2.frame.moves !== zf.moves) fail(`${tag}: TF-GESTURE-HOLD the band change back took the camera (radius ${z.r} -> ${h2.pose.radius}, moves ${zf.moves} -> ${h2.frame.moves})`);
              log(`C32 ${tag}/gesturehold ${J({ framed: z.framed, zoomed: z.r, fitDelta: hd, radius: [h1.pose.radius, h2.pose.radius], moves: [zf.moves, h1.frame.moves, h2.frame.moves], yielded: h1.frame.yielded })}`);
              judged += 1;
              // TF-RETURN after this yield: an explicit return re-flies the framing and verifies it again
              await c.eval(`window.__atelier.go('table'), true`);
              if (!(await refitAfter(zf.moves))) fail(`${tag}: TF-RETURN the framing never re-flew and verified after an explicit return from the post-landing yield ${J(await frame())}`);
              else {
                const t2 = await c.eval(`({ pose: ${SHELL_POSE}, frame: window.__atelier.tableFrame() })`);
                if (t2.frame.yielded !== false || poseDelta(t2.pose, t2.frame.pose) > 1e-6) fail(`${tag}: TF-RETURN the return did not take the framing back from the post-landing yield (yielded ${t2.frame.yielded}, camera off the record by ${poseDelta(t2.pose, t2.frame.pose)})`);
              }
              judged += 1;
            }
          }
        }
        // TF-DRAG-HOLD (#1191, the lane's review round fu2): a middle-button pan PRESSED during the framing flight (it cuts
        // the flight and is counted) and held still through the verification, then dragged and released; the band change
        // must keep the dragged view — the drag's moves reach orbit.js uncounted, after the verification took the count.
        // Trusted CDP mouse input on a point of the framed table that hit-tests to the canvas (chrome covers the canvas
        // centre on the phones; the shell's gate lets buttons 1 / 2 on the canvas through to orbit.js)
        await putBack();
        if (await restageInFlight(pick) !== true) fail(`${tag}: TF-DRAG-HOLD precondition: no framing flight after the re-stage ${J(await frame())}`);
        else {
          const mid = await c.eval(`(() => { const cv = document.querySelector('body > canvas'), r = window.__atelier.tableFrame().rect;
            if (!cv || !r) return null;
            const cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2, pts = [[cx, cy]];
            for (let i = 1; i <= 6; i++) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) pts.push([cx + dx * i * 16, cy + dy * i * 8]);
            const hit = pts.find(([x, y]) => x > r.left && x < r.right && y > r.top && y < r.bottom && document.elementFromPoint(x, y) === cv);
            return hit ? { x: hit[0], y: hit[1] } : null; })()`);
          if (!mid) throw new Error(`TF-DRAG-HOLD precondition: no point of the framed table hit-tests to the canvas ${J(await frame())}`);
          await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: mid.x, y: mid.y, button: 'middle', buttons: 4, clickCount: 1 });
          if (await settledFrame(c) !== true) fail(`${tag}: TF-DRAG-HOLD precondition: the framing never verified with the pan held ${J(await frame())}`);
          else {
            const d0 = await frame();
            for (let k = 1; k <= 6; k++) await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: mid.x + 12 * k, y: mid.y + 4 * k, button: 'middle', buttons: 4 });
            await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: mid.x + 72, y: mid.y + 24, button: 'middle', buttons: 0, clickCount: 1 });
            await sleep(300);
            const d1 = await c.eval(`({ pose: ${SHELL_POSE}, frame: window.__atelier.tableFrame() })`);
            if (d0.yielded !== false || d0.lastFlight !== 'cut' || poseDelta(d1.pose, d1.frame.pose) < 1e-3 || d1.frame.moves !== d0.moves || d1.frame.yielded !== false) fail(`${tag}: TF-DRAG-HOLD precondition: the press did not cut the flight, verify unyielded, then pan the camera with no re-judge ${J({ d0, after: d1.frame, off: poseDelta(d1.pose, d1.frame.pose) })}`);
            else {
              await setPhoneMetrics(c, { width: reg.w, height: reg.h - 12 });
              await sleep(1500);
              const d2 = await c.eval(`({ pose: ${SHELL_POSE}, frame: window.__atelier.tableFrame() })`);
              const dd = poseDelta(d2.frame.pose, d0.pose);
              if (!Number.isFinite(dd) || dd < 1e-3) fail(`${tag}: TF-DRAG-HOLD precondition: the resize did not move the fit past the same-pose tolerance (delta ${dd})`);
              else if (poseDelta(d2.pose, d1.pose) > 1e-3 || d2.frame.moves !== d1.frame.moves || d2.frame.yielded !== true) fail(`${tag}: TF-DRAG-HOLD a refit for the same table flew over a pan pressed before the verification (camera moved ${poseDelta(d2.pose, d1.pose)}, moves ${d1.frame.moves} -> ${d2.frame.moves}, yielded ${d2.frame.yielded})`);
              log(`C32 ${tag}/draghold ${J({ fitDelta: dd, panned: poseDelta(d1.pose, d0.pose), kept: poseDelta(d2.pose, d1.pose), moves: [d0.moves, d2.frame.moves], yielded: d2.frame.yielded })}`);
              await setPhoneMetrics(c, { width: reg.w, height: reg.h });
              await sleep(800);
            }
          }
        }
        judged += 1;
        // TF-ORBIT-HOLD (#1191; the batch-9 routing asks for the named test): an orbit made AFTER the framing
        // settled — an explicit return re-flies and verifies the framing, then a right-button orbit (the shell's gate counts
        // the press and leaves it to orbit.js) is pressed, dragged and released, and a band change must keep the user's
        // camera (no new move, yielded)
        const o0m = (await frame()).moves;
        await c.eval(`window.__atelier.go('table'), true`);
        if (!(await refitAfter(o0m)) || (await frame()).yielded !== false) fail(`${tag}: TF-ORBIT-HOLD precondition: the explicit return did not re-fly and verify the framing ${J(await frame())}`);
        else {
          const o0 = await frame();
          const pt = await c.eval(`(() => { const cv = document.querySelector('body > canvas'), r = window.__atelier.tableFrame().rect;
            if (!cv || !r) return null;
            const cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2, pts = [[cx, cy]];
            for (let i = 1; i <= 6; i++) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) pts.push([cx + dx * i * 16, cy + dy * i * 8]);
            const hit = pts.find(([x, y]) => x > r.left && x < r.right && y > r.top && y < r.bottom && document.elementFromPoint(x, y) === cv);
            return hit ? { x: hit[0], y: hit[1] } : null; })()`);
          if (!pt) fail(`${tag}: TF-ORBIT-HOLD precondition: no point of the framed table hit-tests to the canvas ${J(o0)}`);
          else {
            await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pt.x, y: pt.y, button: 'right', buttons: 2, clickCount: 1 });
            for (let k = 1; k <= 6; k++) await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pt.x - 12 * k, y: pt.y + 4 * k, button: 'right', buttons: 2 });
            await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pt.x - 72, y: pt.y + 24, button: 'right', buttons: 0, clickCount: 1 });
            await sleep(300);
            const o1 = await c.eval(`({ pose: ${SHELL_POSE}, frame: window.__atelier.tableFrame() })`);
            if (poseDelta(o1.pose, o1.frame.pose) < 1e-3 || o1.frame.moves !== o0.moves || o1.frame.yielded !== false) fail(`${tag}: TF-ORBIT-HOLD precondition: the orbit did not move the camera off the settled framing with no re-judge ${J({ o0, after: o1.frame, off: poseDelta(o1.pose, o1.frame.pose) })}`);
            else {
              await setPhoneMetrics(c, { width: reg.w, height: reg.h - 12 });
              await sleep(1500);
              const o2 = await c.eval(`({ pose: ${SHELL_POSE}, frame: window.__atelier.tableFrame() })`);
              const od = poseDelta(o2.frame.pose, o0.pose);
              if (!Number.isFinite(od) || od < 1e-3) fail(`${tag}: TF-ORBIT-HOLD precondition: the resize did not move the fit past the same-pose tolerance (delta ${od})`);
              else if (poseDelta(o2.pose, o1.pose) > 1e-3 || o2.frame.moves !== o1.frame.moves || o2.frame.yielded !== true) fail(`${tag}: TF-ORBIT-HOLD a refit for the same table flew over an orbit made after the framing settled (camera moved ${poseDelta(o2.pose, o1.pose)}, moves ${o1.frame.moves} -> ${o2.frame.moves}, yielded ${o2.frame.yielded})`);
              log(`C32 ${tag}/orbithold ${J({ fitDelta: od, orbited: poseDelta(o1.pose, o0.pose), kept: poseDelta(o2.pose, o1.pose), moves: [o0.moves, o2.frame.moves], yielded: o2.frame.yielded })}`);
              await setPhoneMetrics(c, { width: reg.w, height: reg.h });
              await sleep(800);
            }
          }
        }
        judged += 1;
      } catch (e) { fail(`${tag}: ${e?.message || e}`); }
      finally { try { c?.close(); } catch { /* gone */ } await sleep(600); }
    }
    // TF-NOINPUT (full tier, the first phone only; #1191, the lane's review round fu1, and #1192): two rows, then the
    // exit. The boot holds scene/lampfade.js (CDP Fetch) so the overhead boot apply stays pending; camera=overhead is
    // set, the table staged and its framing verified.
    //   (a) #1192: the release runs main.js's lamp-fade settle while the shell owns the camera, and it applies nothing
    //       then. Every frame from before the release until window.__lampfade exists plus 30 frames (the same wait in
    //       every tree, so a green is never "not yet") keeps the camera on the framing record, judged by the atelier's
    //       own off test (tfMoved: the live camera position against the record's pose, plus the lens) at 1e-6. On
    //       725f8fbb the settle's camera write lands in the task that publishes window.__lampfade, so the window holds it.
    //   (b) a camera write with no input must not yield the framing: one evaluate turns the orbit (theta, which
    //       orbit.apply never clamps), and a band change must then re-fit it and take the camera back to the record.
    //       (b) runs whatever (a) found.
    // Then quick play exits: the shell's exit re-home lands the overhead register (phi 0.16, target origin), so the
    // deferred boot apply is not lost (#1192).
    if (tier !== 'pr' && LEGS.includes('tfnoinput') && reg === phones[0]) {
      const tag = `${reg.id}/tfnoinput`;
      let c = null, held = null;
      const frame = () => c.eval('window.__atelier.tableFrame()');
      // the atelier's tfMoved (atelier.js) against the live record, unthresholded: [camera distance, lens distance]
      const OFF_FN = `() => { const cam = window.__dbg.camera, p = window.__atelier.tableFrame().pose, sf = Math.sin(p.phi);
        return [Math.hypot(cam.position.x - (p.tx + p.radius * sf * Math.sin(p.theta)), cam.position.y - (p.ty + p.radius * Math.cos(p.phi)),
          cam.position.z - (p.tz + p.radius * sf * Math.cos(p.theta))), Math.abs(cam.fov - p.fov)]; }`;
      // (a)'s per-frame sampler (rAF): the worst off pair, whether the shell stayed open, the frame the module landed on;
      // done 30 frames after that landing
      const SAMPLE_OFF = `(() => { const off = ${OFF_FN}; const n = window.__c32n = { max: [0, 0], frames: 0, landedAt: -1, open: true, done: false };
        (function tick() { const [d, l] = off(); n.max = [Math.max(n.max[0], d), Math.max(n.max[1], l)]; n.frames += 1;
          if (window.__shell.isOpen() !== true) n.open = false;
          if (n.landedAt < 0 && window.__lampfade) n.landedAt = n.frames;
          if (n.landedAt >= 0 && n.frames >= n.landedAt + 30) { n.done = true; return; }
          if (n.frames < 20000) requestAnimationFrame(tick); })(); return true; })()`;
      const launch = async (url) => {
        const cl = await launchChrome(new URL(url).origin + '/', { port: CDP_PORT, tool: false });
        cl.onEvent((method, params) => {
          if (method !== 'Fetch.requestPaused') return;
          if (!held && /\/scene\/lampfade\.js(\?|$)/.test(params?.request?.url ?? '')) { held = params; return; }
          answerPausedRequest(cl, 'Fetch.continueRequest', params, {}, { fail: (m) => fail(`${tag}: ${m}`) });
        });
        await setPhoneMetrics(cl, { width: reg.w, height: reg.h });
        await cl.send('Fetch.enable', { patterns: [{ urlPattern: '*/scene/lampfade.js*' }] });
        await cl.send('Page.navigate', { url });
        return cl;
      };
      try {
        c = await boot(reg, tag, { launch });
        if (!held) throw new Error('TF-NOINPUT precondition: the lamp-fade import was never held (no paused scene/lampfade.js request)');
        await c.eval(`window.__settings.set('camera', 'overhead'), true`);
        await sleep(700);
        await stageTable(c, true);
        if (await settledFrame(c) !== true) throw new Error(`TF-NOINPUT precondition: the framing never settled ${J(await frame())}`);
        const f0 = await frame();
        if (f0.inputSince !== false || f0.yielded !== false) throw new Error(`TF-NOINPUT precondition: input counted or a yield before the release ${J(f0)}`);
        if (await c.eval('!!window.__lampfade')) throw new Error('TF-NOINPUT precondition: the lamp-fade module landed before the release');
        // (a) #1192: sampled from before the release until the module landed plus 30 frames
        await c.eval(SAMPLE_OFF);
        answerPausedRequest(c, 'Fetch.continueRequest', held, {}, { fail: (m) => fail(`${tag}: ${m}`) });
        if (await waitExpr(c, 'window.__c32n.done === true', 20000, 50) !== true) throw new Error(`TF-NOINPUT precondition: the released lamp-fade module never landed, or the frame sampler stopped ${J(await c.eval('window.__c32n'))}`);
        const n = await c.eval('window.__c32n');
        if (n.open !== true) throw new Error(`TF-NOINPUT precondition: the shell closed inside row (a)'s window ${J(n)}`);
        if (!(n.max[0] <= 1e-6 && n.max[1] <= 1e-6)) fail(`${tag}: TF-NOINPUT (#1192) the released lamp-fade import moved the camera off the framing while the shell owns it (camera off the record by ${n.max[0]}, the lens by ${n.max[1]}, over ${n.frames} frame(s); the module landed at frame ${n.landedAt}) ${J({ frame: await frame(), pose: await c.eval(SHELL_POSE) })}`);
        log(`C32 ${tag} (a) ${J({ off: n.max, frames: n.frames, landedAt: n.landedAt })}`); // the window's record, whatever (b) finds
        // (b) a camera write with no input (one evaluate, no input event), then a band change
        await c.eval('(() => { const o = window.__dbg.orbit; o.state.theta += 0.05; o.apply(); return true; })()');
        const off1 = await c.eval(`(${OFF_FN})()`), f1 = await frame();
        if (!(off1[0] > 1e-3) || f1.inputSince !== false || f1.pending !== false) fail(`${tag}: TF-NOINPUT precondition: after the camera write with no input the camera is not off the framing, or input counted or a move is pending ${J({ off: off1, frame: f1 })}`);
        else {
          await setPhoneMetrics(c, { width: reg.w, height: reg.h - 12 });
          const refit = (await waitExpr(c, `window.__atelier.tableFrame().moves > ${f1.moves}`, 5000, 20)) === true && (await settledFrame(c)) === true;
          const f2 = await c.eval(`({ pose: ${SHELL_POSE}, frame: window.__atelier.tableFrame() })`);
          if (!refit) fail(`${tag}: TF-NOINPUT the framing yielded to a camera write with no input: the band change never re-fitted it ${J(f2.frame)}`);
          else if (f2.frame.yielded !== false || poseDelta(f2.pose, f2.frame.pose) > 1e-6) fail(`${tag}: TF-NOINPUT the re-fit did not take the camera back (yielded ${f2.frame.yielded}, camera off the record by ${poseDelta(f2.pose, f2.frame.pose)})`);
          log(`C32 ${tag} (b) ${J({ moves: [f0.moves, f1.moves, f2.frame.moves], yielded: f2.frame.yielded, inputSince: f2.frame.inputSince })}`);
        }
        // the exit (#1192): quick play leaves the shell, and its exit re-home lands the overhead register
        await c.eval('window.__shell.quickPlay(), true');
        if (await waitExpr(c, 'window.__shell.isOpen() === false && window.__shell.moving() === false', 15000, 100) !== true) fail(`${tag}: TF-NOINPUT (#1192) quick play never left the shell`);
        else {
          await sleep(400);
          const pe = await c.eval(SHELL_POSE);
          if (!(Math.abs(pe.phi - 0.16) < 1e-6 && pe.tx === 0 && pe.ty === 0 && pe.tz === 0)) fail(`${tag}: TF-NOINPUT (#1192) the shell's exit did not land the overhead register (phi 0.16, target origin) ${J(pe)}`);
        }
        judged += 1;
      } catch (e) { fail(`${tag}: ${e?.message || e}`); }
      finally { try { c?.close(); } catch { /* gone */ } await sleep(600); }
    }
    if (tier !== 'pr' && LEGS.includes('motion')) {
      const tag = `${reg.id}/motion`;
      let c = null;
      try {
        c = await boot(reg, tag);
        await c.eval('window.__c32m = []; (function tick() { window.__c32m.push(window.__shell.moving()); if (window.__c32m.length < 600) requestAnimationFrame(tick); })(); true');
        await stageTable(c, true);
        const t0 = Date.now();
        const flew = await waitExpr(c, 'window.__c32m.includes(true)', 4000, 50);
        if (flew !== true) fail(`${tag}: TF-MOTION no mover flight was seen after the stage`);
        if (await waitExpr(c, `window.__shell.moving() === false && window.__atelier.tableFrame().engaged === true`, 8000, 50) !== true) fail(`${tag}: TF-MOTION the flight never landed`);
        else if (Date.now() - t0 > 6000) fail(`${tag}: TF-MOTION the framing took ${Date.now() - t0} ms`);
        judged += 1;
      } catch (e) { fail(`${tag}: ${e?.message || e}`); }
      finally { try { c?.close(); } catch { /* gone */ } await sleep(600); }
      const tagR = `${reg.id}/motion-reduced`;
      c = null;
      try {
        c = await boot(reg, tagR, { reduced: true });
        await c.eval('window.__c32m = []; (function tick() { window.__c32m.push(window.__shell.moving()); if (window.__c32m.length < 600) requestAnimationFrame(tick); })(); true');
        await stageTable(c, true);
        if (await settledFrame(c) !== true) fail(`${tagR}: TF-MOTION the reduced-motion framing never settled`);
        if (await c.eval('window.__c32m.includes(true)')) fail(`${tagR}: TF-MOTION a flight ran under reduced motion (the pose must snap)`);
        judged += 1;
      } catch (e) { fail(`${tagR}: ${e?.message || e}`); }
      finally { try { c?.close(); } catch { /* gone */ } await sleep(600); }
    }
    if (tier !== 'pr' && LEGS.includes('fov')) {
      const tag = `${reg.id}/fov`;
      let c = null;
      try {
        c = await boot(reg, tag);
        await c.eval(`window.__settings.set('camera', 'overhead'), true`);
        await sleep(400);
        await stageTable(c, true);
        if (await settledFrame(c) !== true) fail(`${tag}: TF-FOV the first framing never settled`);
        const fA = await c.eval('window.__atelier.tableFrame()');
        const lensA = fA.pose?.fov;
        await c.eval(SAMPLE_LENS);
        // the injection: on the re-fit move's first frame (the framing engaged on another table, pending, the mover
        // flying), one fresh-rack re-home through the scripted seam — no input event, so nothing cuts the move
        await c.eval(`(() => { window.__c32inj = null; (function tick() { if (window.__c32stop) return; const f = window.__atelier.tableFrame();
          if (window.__shell.moving() && f.engaged && f.pending && f.id !== ${J(fA.id)}) { const w0 = window.__c32owm; window.__test.rerack(1);
            window.__c32inj = { id: f.id, mid: window.__c32owm - w0 }; return; }
          requestAnimationFrame(tick); })(); return true; })()`);
        const b = await stageNext(c, true, 'pool_pro_9ft_older_gen');
        if (await settledOn(c, b) !== true) fail(`${tag}: TF-FOV the framing never re-fitted for ${b}`);
        await sleep(300);
        const live = await c.eval(STOP_SAMPLING);
        const lensB = (await c.eval('window.__atelier.tableFrame()')).pose?.fov;
        const fovs = await c.eval('window.__c32f'), all = await c.eval('window.__c32ow'), mid = await c.eval('window.__c32owm'), inj = await c.eval('window.__c32inj');
        if (live !== true) fail(`${tag}: TF-FOV the lens sampler was not live through the re-fit (capped or stalled)`);
        if (!(Number.isFinite(lensA) && lensA === lensB)) fail(`${tag}: TF-FOV precondition: the re-stage to ${b} is not a constant-lens move (${lensA} -> ${lensB})`);
        if (!inj || !(inj.mid >= 1)) fail(`${tag}: TF-FOV precondition: the injected re-home never landed inside the move ${J(inj)} — the lens re-assert went unexercised`);
        if (!(all - mid >= 1)) fail(`${tag}: TF-FOV the preview's own re-home did not land on an idle mover (${all} re-home write(s), ${mid} inside a move: the move started before the stage's rerack)`);
        const lo = Math.min(...fovs);
        if (!(lo >= 39.5)) fail(`${tag}: TF-FOV a frame of the re-stage showed fov ${lo} (the overhead register's lens reached a frame; ${fovs.filter((f) => f < 39.5).length} of ${fovs.length} frames)`);
        log(`C32 ${tag} ${J({ b, lensA, lensB, rehomes: all, insideMove: mid, inj, frames: fovs.length, lo })}`);
        judged += 1;
      } catch (e) { fail(`${tag}: ${e?.message || e}`); }
      finally { try { c?.close(); } catch { /* gone */ } await sleep(600); }
    }
  }

  // ---- TF-SCOPE: fine pointers and the coarse tablet never frame; a cushion stage never frames
  if (LEGS.includes('scope')) {
    for (const reg of tier === 'pr' ? NONPHONES.slice(0, 1) : NONPHONES) {
      const tag = `${reg.id}/scope`;
      let c = null;
      try {
        c = await boot(reg, tag, { coarse: reg.coarse });
        await stageTable(c, reg.coarse);
        await sleep(1500);
        await waitExpr(c, 'window.__shell.moving() === false', 10000);
        const p = await c.eval(SHELL_POSE), anchor = await c.eval(ANCHOR('table'));
        if (poseDelta(p, anchor) > 1e-9) fail(`${tag}: TF-SCOPE the table stage moved the camera off the anchor (${poseDelta(p, anchor)})`);
        if ((await c.eval('window.__atelier.tableFrame().engaged')) !== false) fail(`${tag}: TF-SCOPE the framing engaged off the phone`);
        judged += 1;
      } catch (e) { fail(`${tag}: ${e?.message || e}`); }
      finally { try { c?.close(); } catch { /* gone */ } await sleep(600); }
    }
    if (tier !== 'pr') {
      const reg = PHONES[0], tag = `${reg.id}/scope-cushion`;
      let c = null;
      try {
        c = await boot(reg, tag);
        const p0 = await c.eval(SHELL_POSE);
        // the S5-R2 idiom: the Advanced disclosure re-homed into the rail, a non-current cushion row's pick
        await c.eval(`(() => { const d = document.querySelector('[data-ob="atelier-advanced"]'); if (d) d.open = true; return !!d; })()`);
        await waitExpr(c, `document.querySelectorAll('[data-ob="atelier-cushion"] .ob-eq-prov-row').length >= 2`, 15000);
        await sleep(400);
        const target = await c.eval(`document.querySelector('[data-ob="atelier-cushion"] .ob-eq-prov-row:not([aria-current="true"])')?.dataset.id ?? null`);
        if (target) {
          await press(c, `[data-ob="atelier-cushion"] .ob-eq-prov-row[data-id="${target}"] button`, true);
          await waitExpr(c, `document.querySelector('[data-ob="atelier-txbar"]')?.hidden === false`, 15000);
          await sleep(1500);
          await waitExpr(c, 'window.__shell.moving() === false', 10000);
          const p = await c.eval(SHELL_POSE);
          if (poseDelta(p, p0) > 1e-9) fail(`${tag}: TF-SCOPE a cushion-row stage moved the camera (${poseDelta(p, p0)})`);
          if ((await c.eval('window.__atelier.tableFrame().engaged')) !== false) fail(`${tag}: TF-SCOPE a cushion-row stage engaged the framing`);
          judged += 1;
        } else log(`C32 ${tag}: no cushion row on this tree (the leg is n/a, not judged)`);
      } catch (e) { fail(`${tag}: ${e?.message || e}`); }
      finally { try { c?.close(); } catch { /* gone */ } await sleep(600); }
    }
  }

  // ---- ORBIT: the looked-at card turns at rest on the phone; reduced motion / hidden / Full view pause it
  if (LEGS.includes('orbit')) {
    const reg = PHONES[0];
    const LIVE = `(() => { const b = document.querySelector('#ob-atelier-rail .ob-cardrail-card[aria-selected="true"]'); if (!b) return { sel: false };
      const spin = b.querySelector('.ob-cardrail-spin--turn');
      const running = !!spin && spin.getAnimations().some((a) => a.playState === 'running');
      return { sel: true, id: b.dataset.id, live: b.classList.contains('ob-cardrail-card--live'), running,
        others: document.querySelectorAll('#ob-atelier-rail .ob-cardrail-card--live').length }; })()`;
    const tag = `${reg.id}/orbit`;
    let c = null;
    try {
      c = await boot(reg, tag);
      await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1, y: 1 }).catch(() => {});
      await c.eval('document.activeElement?.blur?.(), true');
      await sleep(600);
      const rest = await c.eval(LIVE);
      if (!rest.sel || !rest.live || !rest.running || rest.others !== 1) fail(`${tag}: ORBIT the looked-at card does not turn at rest ${J(rest)}`);
      // the page hidden (the visibility API as the page reads it)
      await c.eval(`(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); return true; })()`);
      await sleep(300);
      const hid = await c.eval(LIVE);
      if (hid.live || hid.running) fail(`${tag}: ORBIT the turntable keeps turning while the page is hidden ${J(hid)}`);
      await c.eval(`(() => { delete document.visibilityState; document.dispatchEvent(new Event('visibilitychange')); return true; })()`);
      await sleep(300);
      // the full view on (a staged table: the pill)
      await stageTable(c, true);
      await settledFrame(c);
      await press(c, '[data-ob="atelier-view"]', true);
      await sleep(500);
      const fv = await c.eval(`document.querySelectorAll('#ob-atelier-rail .ob-cardrail-card--live').length`);
      if (fv !== 0) fail(`${tag}: ORBIT a card keeps turning under the full view (${fv})`);
      judged += 1;
    } catch (e) { fail(`${tag}: ${e?.message || e}`); }
    finally { try { c?.close(); } catch { /* gone */ } await sleep(600); }
    const tagR = `${reg.id}/orbit-reduced`;
    c = null;
    try {
      c = await boot(reg, tagR, { reduced: true });
      await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1, y: 1 }).catch(() => {});
      await c.eval('document.activeElement?.blur?.(), true');
      await sleep(600);
      const red = await c.eval(LIVE);
      if (red.live || red.running) fail(`${tagR}: ORBIT the looked-at card turns under reduced motion ${J(red)}`);
      judged += 1;
    } catch (e) { fail(`${tagR}: ${e?.message || e}`); }
    finally { try { c?.close(); } catch { /* gone */ } await sleep(600); }
  }
  log(`C32 cells judged: ${judged}`);
  log(`C32 cost ${tier} ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  if (judged === 0) fail('no cell judged');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const PORT = Number(process.env.OB_E2E_PORT ?? 8179);
  const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 16620);
  const fail = (msg) => { console.error('E2E-ATELIER-C32 FAIL:', msg); process.exitCode = 1; };
  const server = spawnStaticServer(webDir, PORT);
  await sleep(700);
  try { await runC32({ PORT, CDP_PORT, fail, tier: process.argv.includes('--pr') ? 'pr' : 'full' }); } catch (e) { fail(e?.stack || String(e)); }
  await stopStaticServer(server);
  console.log(process.exitCode ? 'E2E-ATELIER-C32 FAIL' : 'E2E-ATELIER-C32 PASS');
}
