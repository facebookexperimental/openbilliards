// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-shell-switch.mjs — arm SW of the ui-shell gate (build 20): the game
// switch shows a progress overlay instead of a frozen confirm.
//
// THE PATH JUDGED is the user's: a REAL-user boot (tool:false — the hall, the
// sp look, the first-frame compile waves all exist) persisted on FROM, the
// hall Play place, a REAL pointer on the TO card, the kit confirm, a REAL
// pointer on Continue. TO changes the table (8-ball → snooker), so the
// synchronous scene/table.js rebuild and the first-frame shader compile run
// under the overlay.
//
// Every reading is taken IN THE PAGE (per-rAF samples, a MutationObserver,
// capture/bubble listeners) and read back after the switch: CDP evaluations
// stall while the main thread is blocked, so nothing here polls for timing.
//
//   SW-a  within one frame of Continue the overlay is painted AT REST (the
//         first rAF sample after the click: present, opacity >= 0.99,
//         transform none, visible), and at least one sample shows it while
//         the persisted game is still FROM (presented before the build).
//   SW-b  phases advance in the declared order (table, fetch?, materials,
//         settling, done), aria-valuenow never decreases, the live text is
//         the locale's t() string; and the 'materials' label is presented
//         in a frame the new table has NOT rendered in yet (the main.js
//         switchFrames hold: no delivered frame between the last sample
//         before 'materials' — 'table', or 'fetch' when the new table
//         downloads first (snooker since #1131) — and the first 'materials'
//         sample). Through 'fetch' the switch has not committed (the old
//         game, the new table PENDING), so a frame there shows the old table.
//   SW-c  the overlay leaves at the first settled frame: its leave starts no
//         earlier than the arm's OWN settle predicate (table READY, shell
//         closed and still, venue settled, game TO) and no later than 6
//         frames after it — unless the minimum display still runs, which it
//         must honour (shown >= MIN_SHOWN_MS, counted from the overlay's own
//         shown moment as its finish() counts it; the arm bounds that moment
//         by its own observation of the overlay's paint report and of the
//         table build's entry, so a late one cannot hide a linger); the
//         removal follows the leave mark within its
//         400 ms fallback (+ slack). On a tree with the GH-976 table cache
//         the desktop rm switch re-attaches a cached table and the minimum
//         display decides its leave; the cold leg flushes the cache first, so
//         the same switch rebuilds and its settle decides.
//   SW-d  no input reaches the game while switching: keys, a click on
//         #shoot and a canvas drag injected (fire-and-forget) right after
//         the Continue press (they queue behind the blocked build) arrive (a
//         window capture census an init script registers ahead of every page
//         script, the shield included — an arm that saw nothing arrive is
//         UNJUDGEABLE, never green) and none reaches an
//         aim-style window keydown listener, the canvas or #shoot; no shot
//         is fired.
//   SW-rm prefers-reduced-motion: the overlay still arrives at rest, the
//         sweep runs no animation and the leave is instant (no partial
//         opacity sample) — on the switch back to 9-ball.
//   SW-e  the Element Timing report that released each build is that
//         overlay's own (its identifier, painted after its insertion) — on
//         the SECOND switch in the page too (the rm switch), where the
//         buffered timeline still holds the first overlay's entry. A switch
//         released by the ticks alone is n/a only after the wait's own cap
//         ran out, and where the platform reports Element Timing at least one
//         switch in the run must carry its own report (a blind wait never does).
//   SW-f  slow leaf: every ui/switchprogress.js request is held at the
//         network and never answered; Continue still commits the switch and
//         exits the hall while the hold stands (no overlay), and the wait it
//         spent is bounded: the build ENTERED within SLOW_LEAF_WAIT_BOUND_MS
//         of Continue (timestamped at the table's prepareEquipment seam).
//   SW-g  slow transport: a cold heyball (CN8 table) switch whose
//         cn8transport import is held forever — the overlay leaves at its
//         lifetime cap with the table PENDING; banner + settings reachable.
//   SW-i  the switch shield precedes every capture listener: during the held
//         CN8 switch (the hall still open) Enter / Space / Escape / an arrow
//         with focus on <body> never reach the hall's gate (quickPlay), while
//         a scripted click passes (the shield stops user input only) and a
//         modified key and a function key keep their platform default (OS /
//         browser shortcuts: F5 reload, F12 devtools);
//         the control Enter after the cap does close the hall.
//   SW-h  stale dictionary: the active locale's JSON served without the five
//         switch.* keys — no overlay, no raw key, no warning; it commits.
//   SW-j  the shield never outlives the switch: after EVERY exit path the
//         flag and the overlay are gone (where the exit is a return, the
//         overlay was already ENDED — its 'done' phase written — when the
//         switch returned, and the flag fell by its OWN leave: a leave mark
//         before the fall, never the cap's removal) and REAL input reaches the app
//         — an Enter at <body> closes an open hall, a click on the toolbar
//         gear opens the settings modal, Escape closes it. Exit paths: the
//         commit (desktop), the cap (slow transport), superseded after the
//         cap by a user switch (slow transport), cancelled by a return to the
//         current game, superseded while up by a scripted switch, refused
//         (the CN8 transport import failed), a throw inside the switch
//         (game.setGame rejects) and a scripted switch that began while the
//         user's switch presented its overlay (the newest switch wins) — the
//         exits leg.
//   SW-k  the backstop: a throw inside the overlay's own leave (its 'done'
//         write, after its sequence ended) still ends the shield at the cap —
//         the committed switch's (settleCapMs from the insertion); while that
//         overlay stands a scripted key reaches its target (the overlay's own
//         guard stops user keys only).
//   SW-l  focus never falls to <body> while the overlay stands (the accepted
//         confirm is clipped under it, its focused Continue kept until
//         dialog.js returns focus to the card; a press on the scrim — the
//         desktop leg's SW-d injection — keeps focus too) — desktop, rm and
//         phone.
//   SW-phone 844x390 coarse: real taps on the card and on Continue; SW-a,
//         SW-b order, SW-c, SW-e and SW-l again.
//
// Runs INSIDE e2e-shell.mjs (imported; reuses its +6 desktop / +5 phone CDP
// slots after G4 — PORT_INVENTORY unchanged) and stands alone for a fast red
// proof:  node web/tools/e2e-shell-switch.mjs  (OB_E2E_PORT / _CDP_PORT;
// OB_E2E_SWITCH_ARMS=desktop,phone selects legs).
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  launchChrome, sleep, spawnStaticServer, stopStaticServer,
} from './cdp.mjs';
import { setPhoneMetrics, tap } from './touch-cdp.mjs';

// standalone band shape = e2e-shell's (the arm sits on its +5 / +6 slots)
export const PORT_INVENTORY = { http: 1, cdp: 7 };
// SHARED_DEFAULT_WINDOW — one suite in several files: e2e-shell imports this leg module; standalone it runs on e2e-shell's own default ports
export const SHARED_DEFAULT_WINDOW = 'e2e-shell';

const FROM = 'eight_ball', TO = 'snooker', BACK = 'nine_ball';
const ORDER = ['table', 'fetch', 'materials', 'settling', 'done'];
const MIN_SHOWN_MS = 500; // ui/switchprogress.js MIN_SHOWN_MS
const PRESENT_CAP_MS = 500; // ui/switchprogress.js PRESENT_CAP_MS (the presentation wait's own cap)
const LEAVE_CAP_MS = 400; // ui/switchprogress.js LEAVE_CAP_MS (the leave's removal fallback)
// the leaf leaves after 2 delivered frames past its own settle read; +1 for its
// polling tick and +1 for same-tick callback order against this probe; +2 spare
const LINGER_FRAMES = 6;
// SW-c's clocks. The minimum display runs from the overlay's OWN shown moment:
// markShown() after the presentation wait (ui/switchprogress.js:108-109), read
// by finish() (:214-215) — not from its insertion. The presentation wait (two
// ticks and a task, then the overlay's own Element Timing report) sits in
// between, and a switch that settles inside the minimum display leaves at
// shownAt + MIN_SHOWN_MS: counted from the insertion, the rm switch back to
// 9-ball (a cached table re-attached, GH-976: settled in ~300 ms) read that
// wait as a linger (9 and 10 frames in the two batch-3 CI passes). shownAt is
// the subject's own clock, so it is bounded before it is used. Released by its
// paint report, the overlay marks itself shown in the task that DELIVERS the
// report (every observer of the entry is called in one task, the probe's
// first), unless its two presentation ticks are still running: shownAt must
// fall within SHOWN_SLACK_FRAMES probe ticks after the later of that delivery
// as the PROBE observed it (its own PerformanceObserver) and the probe's 2nd
// tick after the insertion, and never before the report's renderTime. The
// renderTime itself is no anchor: it is the PRESENTATION time, and the entry
// reached the page 3-200 ms (0-4 ticks) after it at CI-like cadence (shownAt -
// delivery: 0 ticks, <= 0.1 ms, in 15 of 15 switches). Released without a
// report: within SHOWN_SLACK_FRAMES ticks after insertedAt + 2 ×
// PRESENT_CAP_MS (the presentation wait and the report wait, each at its cap),
// and only if the report had NOT reached the page before shownAt (a report the
// probe saw delivered first means the wait ignored it). Ticks cannot see a
// shown moment pushed past the table build — no frame runs inside the
// synchronous build — so shownAt must also precede the build's entry
// (ENTRY_SEAM): the caller enters the build in the very task markShown() runs
// in, whatever released it. A late markShown, which pushes the minimum display
// out and would hide a lingering overlay, fails on one of these.
const SHOWN_SLACK_FRAMES = 2;
// finish() waits out the minimum display with setTimeout, whose delay is a
// WebIDL long: the fraction truncates and the leave can come up to 1 ms early
const MIN_SHOWN_TOL_MS = 2;
const SETTLE_WAIT_MS = Number(process.env.OB_E2E_SWITCH_WAIT_MS) || 60000;

// the page-side probe: per-rAF samples, overlay mutations, the input census
const PROBE = `(() => {
  const S = window.__swArm = { t0: null, samples: [], phases: [], events: [], appeared: null, leaving: null, gone: null };
  const now = () => performance.now();
  const ov = () => document.querySelector('[data-ob="switch-progress"]');
  const settledNow = () => {
    const st = window.__tableBuild?.status?.()?.status ?? 'READY';
    return st === 'READY' && window.__shell?.isOpen?.() === false && window.__shell?.moving?.() !== true
      && window.__test?.venueReady?.() !== false;
  };
  document.addEventListener('click', (e) => {
    if (S.t0 === null && e.target?.closest?.('[data-ob="confirm-accept"]')) S.t0 = now();
  }, true);
  const seen = () => {
    const el = ov();
    if (el && S.appeared === null) S.appeared = now();
    if (el) {
      const last = S.phases[S.phases.length - 1];
      if (!last || last.p !== el.dataset.phase) {
        S.phases.push({ p: el.dataset.phase, t: now(),
          v: Number(el.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')),
          text: el.querySelector('[role="status"]')?.textContent ?? null });
      }
      if (el.dataset.leaving && S.leaving === null) S.leaving = now();
    } else if (S.appeared !== null && S.gone === null) S.gone = now();
  };
  new MutationObserver(seen).observe(document.body, { childList: true, subtree: true,
    attributes: true, attributeFilter: ['data-phase', 'data-leaving'] });
  // the Element Timing entries as the PROBE sees them, with the moment each reached the page: SW-c bounds the
  // overlay's shownAt with its own reading of the report that released it, not with the overlay's copy
  S.paints = [];
  window.__swArmPaints?.disconnect();
  window.__swArmPaints = null;
  if (PerformanceObserver.supportedEntryTypes?.includes('element')) {
    window.__swArmPaints = new PerformanceObserver((list) => {
      const at = now();
      for (const e of list.getEntries()) S.paints.push({ id: e.identifier, renderTime: e.renderTime, at });
    });
    window.__swArmPaints.observe({ type: 'element', buffered: true });
  }
  const tick = () => {
    const el = ov();
    const cs = el ? getComputedStyle(el) : null;
    const sw = el?.querySelector('.ob-switchprogress__sweep');
    S.samples.push({ t: now(), ov: !!el, phase: el?.dataset.phase ?? null, leaving: !!el?.dataset.leaving,
      op: cs ? Number(cs.opacity) : null, tr: cs ? cs.transform : null, vis: cs ? cs.visibility : null,
      sweep: sw ? getComputedStyle(sw).animationName : null,
      game: window.__settings.get().game, settled: settledNow(), rendered: window.__test?.renderedFrames?.() ?? null,
      fb: !document.activeElement || document.activeElement === document.body,
      ts: window.__tableBuild?.status?.()?.status ?? null }); // SW-b: the new table is still PENDING through 'fetch'
    const st = window.__swArmMod?.switchProgressState?.();
    S.et = !!PerformanceObserver.supportedEntryTypes?.includes('element');
    if (st?.etId) S.overlay = { etId: st.etId, insertedAt: st.insertedAt, shownAt: st.shownAt, paintedBy: st.paintedBy,
      title: el?.querySelector('.ob-switchprogress__title')?.getAttribute('elementtiming') ?? null };
    if (S.samples.length < 20000) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  const rec = (kind) => (e) => S.events.push({ kind, type: e.type, t: now(), ov: !!ov(), key: e.key ?? null });
  window.addEventListener('keydown', rec('game-key'));
  document.querySelector('body > canvas')?.addEventListener('pointerdown', rec('game-canvas'));
  document.getElementById('shoot')?.addEventListener('click', rec('game-shoot'));
  S.shots0 = window.__test?.scenarios?.().length ?? null;
  return true;
})()`;
// the SW-d arrival census: an INIT script, registered before every page
// script. main.js's switch shield is the app's first window-capture listener
// and stops what it swallows, so a census registered after boot sees nothing
// (review r4 P2: SW-d UNJUDGEABLE on a working shield). It only records, into
// the current probe record.
const ARRIVALS = `(() => {
  const rec = (e) => {
    const S = window.__swArm;
    if (!S) return;
    const r = { kind: 'dispatched', type: e.type, t: performance.now(), ov: !!document.querySelector('[data-ob="switch-progress"]'),
      key: e.key ?? null, mod: !!(e.metaKey || e.ctrlKey || e.altKey), prevented: null };
    S.events.push(r);
    setTimeout(() => { r.prevented = e.defaultPrevented; }, 0); // the outcome, after the dispatch
  };
  for (const ty of ['keydown', 'pointerdown']) window.addEventListener(ty, rec, true);
})()`;
// SW-c's build-entry seam, installed once per table object: settings.js set()
// enters the table's prepareEquipment synchronously as a switch's build begins
const ENTRY_SEAM = `(() => { const tb = window.__tableBuild;
  if (typeof tb?.prepareEquipment !== 'function') return false;
  if (!tb.prepareEquipment.swArmEntry) {
    const orig = tb.prepareEquipment;
    const seam = function (...a) { (window.__swArmEntry ??= []).push(performance.now()); return orig.apply(this, a); };
    seam.swArmEntry = true;
    tb.prepareEquipment = seam;
  }
  return true; })()`;

async function waitFor(c, expr, ms) {
  const t0 = Date.now();
  for (;;) {
    let v = null;
    try { v = await c.eval(expr); } catch { v = null; }
    if (v) return v;
    if (Date.now() - t0 > ms) return null;
    await sleep(150);
  }
}
// event-driven staging: an element's rect is identical across two rAF ticks
// (the rail snap, the confirm's entrance and the hall exit have come to rest)
const restingCenter = (c, sel, ms = 15000) => waitFor(c, `new Promise((res) => {
  const e = document.querySelector(${JSON.stringify(sel)});
  if (!e) { res(null); return; }
  const r0 = e.getBoundingClientRect();
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const r1 = e.getBoundingClientRect(), panel = e.closest('[data-ob="confirm"]');
    const still = Math.abs(r0.x - r1.x) < 0.5 && Math.abs(r0.y - r1.y) < 0.5 && Math.abs(r0.width - r1.width) < 0.5;
    const cs = panel ? getComputedStyle(panel) : null; // a kit panel's entrance tween has finished
    const rest = !cs || (cs.transform === 'none' && Number(cs.opacity) >= 0.99);
    res(r1.width && r1.height && still && rest ? { x: r1.left + r1.width / 2, y: r1.top + r1.height / 2 } : null);
  }));
})`, ms);
const center = (c, sel) => c.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null;
  const r = e.getBoundingClientRect(); if (!r.width || !r.height) return null;
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
async function click(c, p) {
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y });
  await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
  await sleep(50);
  await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 });
}
const press = (c, p, { phone }) => (phone ? tap(c, p.x, p.y) : click(c, p));

/** boot on the origin root, persist FROM, navigate the real-user app */
async function bootAt(port, cdp, { phone = false, settings = {}, before = null } = {}) {
  const origin = `http://127.0.0.1:${port}/`;
  const c = await launchChrome(origin, { port: cdp, tool: false, width: 1440, height: 900 });
  try {
    if (phone) await setPhoneMetrics(c, { width: 844, height: 390 });
    // a loaded box can be slow to land the first document: wait, navigate once more, then refuse cleanly (the
    // localStorage write below throws on any other document)
    const atOrigin = `location.protocol === 'http:' && document.readyState === 'complete'`;
    let landed = await waitFor(c, atOrigin, 60000);
    if (!landed) { await c.send('Page.navigate', { url: origin }).catch(() => {}); landed = await waitFor(c, atOrigin, 60000); }
    if (!landed) throw new Error(`the first document never landed at ${origin}`);
    await c.eval(`localStorage.setItem('ob-settings-v1', JSON.stringify(${JSON.stringify({ game: FROM, ...settings })})), true`);
    if (before) await before(c);
    await c.send('Page.addScriptToEvaluateOnNewDocument', { source: ARRIVALS });
    await c.send('Page.navigate', { url: origin + 'app.html' });
    return c;
  } catch (err) {
    // a client that launched but could not boot is closed HERE: a leg's own cleanup runs only once bootAt has
    // returned, and the next leg launches on the same CDP port (review r10 P2)
    c.close(); await sleep(800);
    throw err;
  }
}
async function openPlay(c) {
  await c.eval(`(() => { const s = window.__shell; if (!s.isOpen()) s.openShell({}); s.go('play'); return true; })()`);
  return waitFor(c, `(() => { const s = window.__shell; return !!window.__play && s.isOpen() && !s.moving() && s.place() === 'play'; })()`, 30000);
}

/** one switch through the hall: card → confirm → Continue; returns the probe record */
async function switchTo(c, to, { phone = false, inject = false, fail, tag }) {
  let shoot = null;
  if (inject) { // #shoot's rect on the table register (the hall hides the HUD)
    await c.eval(`(() => { const s = window.__shell; if (s.isOpen()) s.quickPlay(); return true; })()`);
    await waitFor(c, `window.__shell.isOpen() === false && !window.__shell.moving()`, 15000);
    shoot = await restingCenter(c, '#shoot');
  }
  if (!(await openPlay(c))) { fail(`${tag}: the hall never landed at play`); return null; }
  const sel = `[data-ob="play-game"][data-game="${to}"]`;
  await restingCenter(c, sel);
  await c.eval(`document.querySelector(${JSON.stringify(sel)})?.scrollIntoView({ inline: 'center', block: 'nearest' }), true`);
  const card = await restingCenter(c, sel);
  if (!card) { fail(`${tag}: no ${to} card`); return null; }
  await c.eval(PROBE);
  const entrySeam = await c.eval(ENTRY_SEAM);
  // a card the rail keeps out of view (the committed card is snapped to the
  // start) is activated through the play place's own tap path instead — the
  // Continue press below stays a real pointer either way
  const hit = await c.eval(`document.elementFromPoint(${card.x}, ${card.y})?.closest?.('[data-game]')?.dataset.game ?? null`);
  if (hit === to) await press(c, card, { phone });
  else { console.log(`${tag}: ${to} card not hit-testable (${hit}) — __play.pick`); await c.eval(`void window.__play.pick(${JSON.stringify(to)}), true`); }
  if (!(await waitFor(c, `!!document.querySelector('[data-ob="confirm-accept"]')`, 15000))) {
    const why = await c.eval(`({ game: window.__settings.get().game, open: window.__shell.isOpen(), place: window.__shell.place(),
      at: document.elementFromPoint(${card.x}, ${card.y})?.closest?.('[data-game]')?.dataset.game ?? document.elementFromPoint(${card.x}, ${card.y})?.className ?? null,
      ae: document.activeElement?.dataset?.game ?? document.activeElement?.id ?? document.activeElement?.tagName })`).catch(() => null);
    if (process.env.OB_E2E_SWITCH_SHOTS) await c.screenshot(path.join(process.env.OB_E2E_SWITCH_SHOTS, `${tag.replace(/\W+/g, '-')}-noconfirm.png`)).catch(() => {});
    fail(`${tag}: no switch confirm (${JSON.stringify(why)})`);
    return null;
  }
  const acc = await restingCenter(c, '[data-ob="confirm-accept"]'); // the confirm's entrance has come to rest
  if (!acc) { fail(`${tag}: Continue never came to rest`); return null; }
  // the prefetch the confirm started has landed (a user's think time): the
  // leaf module evaluated and its sheet applied — a tree without the leaf
  // (the red proof on main) proceeds
  await c.eval(`import('/app/ui/switchprogress.js').then((m) => { window.__swArmMod = m; return true; }, () => false)`);
  await waitFor(c, `!document.getElementById('ob-switchprogress-css') || !!document.getElementById('ob-switchprogress-css').sheet`, 15000);
  await press(c, acc, { phone });
  let injected = 0;
  if (inject) {
    // the blocked window: inputs fired while the build blocks the main
    // thread queue behind it and are dispatched the moment it frees — after
    // the shell has exited, onto the table register (the #shoot / canvas /
    // key paths a real impatient user hits). Blocked = a CDP evaluation that
    // does not answer within 150 ms.
    let blocked = false;
    for (let i = 0; i < 80 && !blocked; i++) {
      const r = await Promise.race([c.eval('1').then(() => 'free', () => 'free'), sleep(150).then(() => 'blocked')]);
      if (r === 'blocked') blocked = true; else await sleep(25);
    }
    if (blocked) {
      const fire = (m, p) => { c.send(m, p).catch(() => {}); injected += 1; }; // fire-and-forget: never await a blocked page
      const vk = { ArrowLeft: 37, ArrowUp: 38, ' ': 32, v: 86 };
      for (const key of ['ArrowLeft', 'ArrowUp', ' ', 'v']) {
        const code = key === ' ' ? 'Space' : key.length === 1 ? 'Key' + key.toUpperCase() : key;
        fire('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk[key] });
        fire('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk[key] });
      }
      if (shoot) {
        fire('Input.dispatchMouseEvent', { type: 'mousePressed', x: shoot.x, y: shoot.y, button: 'left', clickCount: 1 });
        fire('Input.dispatchMouseEvent', { type: 'mouseReleased', x: shoot.x, y: shoot.y, button: 'left', clickCount: 1 });
      }
      fire('Input.dispatchMouseEvent', { type: 'mousePressed', x: 720, y: 520, button: 'left', clickCount: 1 });
      fire('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 780, y: 540, button: 'left', buttons: 1 });
      fire('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 780, y: 540, button: 'left', clickCount: 1 });
    } else fail(`${tag}: SW-d the switch never blocked the main thread (no injection window)`);
  }
  // the overlay leaves (or, on a tree without one, the switch settles)
  await waitFor(c, `(() => { const S = window.__swArm; const s = S.samples[S.samples.length - 1];
    return window.__settings.get().game === ${JSON.stringify(to)} && (S.gone !== null || (S.appeared === null && s && s.settled)); })()`, SETTLE_WAIT_MS);
  // two more sampled frames after the end (the read is taken off frames, not a sleep)
  await waitFor(c, `(() => { const S = window.__swArm; const end = S.gone ?? S.samples.find((s) => s.settled && s.t > (S.t0 ?? 0))?.t;
    return end != null && S.samples.filter((s) => s.t > end).length >= 2; })()`, SETTLE_WAIT_MS);
  const rec = await c.eval(`(() => { const S = window.__swArm; return { ...S, shots1: window.__test?.scenarios?.().length ?? null, entries: window.__swArmEntry ?? [] }; })()`);
  rec.injected = injected;
  rec.entrySeam = entrySeam;
  // the expected copy, read only when an overlay was shown and only through the
  // ACTIVE dictionary (hasLocal) — the arm itself must never trip a missing-key
  // warning (SW-h listens for them)
  rec.texts = rec.appeared === null ? null : await c.eval(`import('/app/i18n.js').then((m) => {
    const tt = (k) => (typeof m.hasLocal === 'function' && !m.hasLocal(k) ? null : m.t(k));
    return { table: tt('switch.phase.table'), fetch: tt('switch.phase.fetch'), materials: tt('switch.phase.materials'), settling: tt('switch.phase.settling') }; })`).catch(() => null);
  return rec;
}

// ---- the judges -------------------------------------------------------------
function judgeA(rec, from, fail, tag) {
  if (rec.t0 === null) { fail(`${tag} SW-a: the Continue click was never seen`); return; }
  const after = rec.samples.filter((s) => s.t > rec.t0);
  const first = after[0];
  const atRest = (s) => s && s.ov && s.op >= 0.99 && (s.tr === 'none' || s.tr === 'matrix(1, 0, 0, 1, 0, 0)') && s.vis === 'visible';
  if (!atRest(first)) fail(`${tag} SW-a: the first frame after Continue does not paint the overlay at rest: ${JSON.stringify(first)}`);
  const pre = after.filter((s) => s.ov && s.game === from);
  if (!pre.length) fail(`${tag} SW-a: no frame painted the overlay before the switch committed (game still ${from})`);
  if (atRest(first) && pre.length) console.log(`${tag} SW-a OK: overlay at rest ${(first.t - rec.t0).toFixed(1)} ms after Continue (first frame), ${pre.length} frame(s) before the commit`);
}
function judgeB(rec, fail, tag, { hold = true } = {}) {
  const seq = rec.phases.map((p) => p.p);
  let k = -1;
  const ordered = seq.every((p) => { const i = ORDER.indexOf(p); if (i <= k) return false; k = i; return true; });
  const need = ['table', 'materials', 'settling', 'done'].filter((p) => !seq.includes(p));
  if (!ordered || need.length) fail(`${tag} SW-b: phases ${JSON.stringify(seq)} (missing ${need.join(',') || '-'}; order ${ordered ? 'ok' : 'BROKEN'})`);
  const vs = rec.phases.map((p) => p.v);
  if (vs.some((v, i) => i > 0 && !(v >= vs[i - 1]))) fail(`${tag} SW-b: aria-valuenow decreased: ${JSON.stringify(vs)}`);
  const badText = rec.texts ? rec.phases.filter((p) => p.p !== 'done' && rec.texts[p.p] !== p.text) : [{ p: 'texts unreadable' }];
  if (badText.length) fail(`${tag} SW-b: live text differs from t(): ${JSON.stringify(badText.map((p) => [p.p, p.text]))}`);
  let held = null;
  if (hold) {
    // The reference is the LAST sample before 'materials': 'table', or 'fetch' when the new table downloads first (CN8;
    // snooker since #1131). The build runs only after that download and the loop is held only from built(), so a
    // frame rendered during 'fetch' shows the OLD table behind the mask. That holds only while the switch is still
    // pending, so every 'fetch' sample must carry the old game and a PENDING table. Card 33 §2: the 'materials' label
    // stands before the frame that compiles the NEW table.
    const iM = rec.samples.findIndex((s) => s.phase === 'materials');
    const pre = rec.samples.slice(0, iM < 0 ? 0 : iM);
    const last = pre.filter((s) => s.phase === 'table' || s.phase === 'fetch').pop() ?? null;
    const from = pre.find((s) => s.phase === 'table')?.game ?? null;
    const early = pre.filter((s) => s.phase === 'fetch' && (s.game !== from || s.ts !== 'PENDING'));
    held = iM >= 0 && last !== null && rec.samples[iM].rendered === last.rendered && !early.length;
    if (early.length) fail(`${tag} SW-b: during 'fetch' the switch was no longer pending (game ${early[0].game}, table ${early[0].ts}; from ${from}): a frame rendered there could show the new table`);
    else if (!held) fail(`${tag} SW-b: the 'materials' label was not presented before the new table's first frame (rendered ${last?.rendered} at the last '${last?.phase}' sample -> ${rec.samples[iM]?.rendered})`);
  }
  if (ordered && !need.length && !vs.some((v, i) => i > 0 && !(v >= vs[i - 1])) && !badText.length && held !== false) {
    console.log(`${tag} SW-b OK: ${seq.join(' > ')}; valuenow ${vs.join(' ')}${hold ? '; materials presented before the compile frame' : ''}`);
  }
}
function judgeC(rec, to, fail, tag) {
  const o = rec.overlay ?? null;
  const ticks = (a, b) => rec.samples.filter((s) => s.t > a && s.t < b).length;
  const at = (t) => (Number.isFinite(t) ? `+${(t - (rec.t0 ?? 0)).toFixed(0)}` : String(t));
  const iS = rec.samples.findIndex((s) => s.settled && s.game === to && s.ov);
  const tS = iS < 0 ? null : rec.samples[iS].t;
  const leave = rec.leaving ?? rec.gone;
  const shownAt = o?.shownAt ?? null;
  // the latest shownAt the arm accepts (SHOWN_SLACK_FRAMES above): ticks past the later of the delivery of the report
  // that released the overlay (as the probe observed it) and the probe's 2nd tick after the insertion, or past both
  // presentation caps
  const own = o?.paintedBy ? (rec.paints ?? []).find((p) => p.id === o.etId && p.renderTime >= o.insertedAt) ?? null : null;
  const tick2 = o === null ? null : rec.samples.filter((s) => s.t > o.insertedAt)[1]?.t ?? null;
  const base = o === null ? null : o.paintedBy ? (own ? Math.max(own.at, tick2 ?? own.at) : null) : o.insertedAt + 2 * PRESENT_CAP_MS;
  const basis = !o?.paintedBy ? `the insertion + 2 × ${PRESENT_CAP_MS} ms (no paint report)`
    : own && own.at < base ? 'its 2nd presentation tick' : 'its paint report reaching the page';
  const cap = base === null ? null : rec.samples.filter((s) => s.t > base)[SHOWN_SLACK_FRAMES]?.t ?? null;
  const late = base === null || shownAt === null ? null : ticks(base, shownAt);
  const wait = o === null || shownAt === null ? null : ticks(o.insertedAt, shownAt);
  // the switch's table build entered (ENTRY_SEAM): the first entry after the insertion
  const entry = o === null ? null : (rec.entries ?? []).find((t) => t >= o.insertedAt) ?? null;
  // released without a report: the overlay's report as the probe saw it, had one reached the page
  const unused = o && !o.paintedBy ? (rec.paints ?? []).find((p) => p.id === o.etId && p.renderTime >= o.insertedAt) ?? null : null;
  // frames sampled between the later of (settled, minimum display due) and the leave
  const due = tS === null || shownAt === null ? null : Math.max(tS, shownAt + MIN_SHOWN_MS);
  const lingered = due === null || leave === null ? null : ticks(due, leave);
  const shown = shownAt === null || leave === null ? null : leave - shownAt;
  const life = rec.samples.filter((s) => s.t >= (rec.appeared ?? Infinity) && s.t <= (rec.gone ?? -Infinity));
  const gaps = life.slice(1).map((s, i) => s.t - life[i].t).sort((a, b) => a - b);
  const p50 = gaps.length ? `${gaps[gaps.length >> 1].toFixed(1)} ms` : 'n/a';
  const clocks = `[ms from Continue: settled ${at(tS)}, inserted ${at(o?.insertedAt)}, shownAt ${at(shownAt)} (${wait} frame(s) after the insertion; ${late} tick(s) after ${basis} at ${at(base)}, cap ${at(cap)}), build entered ${at(entry)}, leave ${at(leave)}, due ${at(due)}, lingered ${lingered} frame(s), shown ${shown?.toFixed(1)} ms; frame p50 ${p50}]`;
  let ok = true;
  const bad = (msg) => { ok = false; fail(`${tag} SW-c: ${msg} ${clocks}`); };
  if (shownAt === null) { bad('UNJUDGEABLE — the overlay never reported its shown moment'); return null; }
  if (base === null) { bad(`UNJUDGEABLE — released by a paint report the probe never observed (${JSON.stringify(o.paintedBy)})`); return null; }
  if (entry === null) { bad(`UNJUDGEABLE — ${rec.entrySeam ? 'the build-entry seam saw no build after the insertion' : 'no build-entry seam (the table has no prepareEquipment)'}`); return null; }
  if (tS === null || leave === null) { bad(`no settled frame under the overlay (iS ${iS}, leave ${leave})`); return null; }
  if (shownAt < (o.paintedBy ? own.renderTime : o.insertedAt)) bad(`shownAt precedes ${o.paintedBy ? 'the presentation of the paint report that released the overlay' : 'the insertion'}`);
  if (late > SHOWN_SLACK_FRAMES) bad(`shownAt came ${late} frame(s) after ${basis} — past the arm's cap of ${SHOWN_SLACK_FRAMES} (a late shown moment hides a linger)`);
  if (shownAt > entry) bad(`shownAt came ${(shownAt - entry).toFixed(1)} ms after the table build entered — the minimum display was pushed past the build`);
  if (unused && unused.at < shownAt) bad(`released without its paint report although the report reached the page ${(shownAt - unused.at).toFixed(1)} ms before it marked itself shown (a blind presentation wait)`);
  if (leave < tS) bad(`the overlay left ${(tS - leave).toFixed(0)} ms BEFORE the settled frame`);
  if (shown < MIN_SHOWN_MS - MIN_SHOWN_TOL_MS) bad(`shown ${shown.toFixed(1)} ms from its shown moment < the ${MIN_SHOWN_MS} ms minimum`);
  if (lingered > LINGER_FRAMES) bad(`lingered ${lingered} frames after the later of the settled frame and shownAt + ${MIN_SHOWN_MS} ms (bound ${LINGER_FRAMES})`);
  if (rec.gone === null) bad('the overlay never left the DOM');
  else if (rec.leaving !== null && rec.gone - rec.leaving > LEAVE_CAP_MS + 1100) bad(`the removal took ${(rec.gone - rec.leaving).toFixed(0)} ms after the leave began (its fallback is ${LEAVE_CAP_MS} ms)`);
  // the first frame showing the committed game → the settled frame (the 30 s committed-switch deadline's data)
  const tC = rec.samples.find((s) => s.game === to && s.t >= rec.t0)?.t ?? null;
  const commit = tC === null ? 'commit unsampled' : `commit at +${(tC - rec.t0).toFixed(0)} ms, commit→settled ${(tS - tC).toFixed(0)} ms`;
  if (ok) console.log(`${tag} SW-c OK: settled frame at +${(tS - rec.t0).toFixed(0)} ms (${commit}; load ${os.loadavg()[0].toFixed(1)}), shown at ${at(shownAt)} (${wait} frame(s) after the insertion, ${late} after ${basis}; cap ${SHOWN_SLACK_FRAMES}; ${(entry - shownAt).toFixed(1)} ms before the build entered), leave after ${lingered} frame(s) past ${due === tS ? 'the settled frame' : `shownAt + ${MIN_SHOWN_MS} ms`}, shown ${shown.toFixed(0)} ms; frame p50 ${p50}`);
  return { decided: due === tS ? 'settle' : 'min' };
}
function judgeD(rec, fail, tag) {
  const end = rec.gone ?? Infinity;
  const during = rec.events.filter((e) => e.kind === 'dispatched' && e.t >= rec.t0 && e.t <= end);
  const leaks = rec.events.filter((e) => e.kind !== 'dispatched' && e.t >= rec.t0 && e.t <= end);
  if (!rec.injected || during.length < 3) { fail(`${tag} SW-d: UNJUDGEABLE — ${during.length} injected event(s) arrived in the switch window (injected ${rec.injected})`); return; }
  if (leaks.length) fail(`${tag} SW-d: ${leaks.length} input(s) reached the game while switching: ${JSON.stringify(leaks.slice(0, 6))}`);
  if (rec.shots1 !== rec.shots0) fail(`${tag} SW-d: a shot was fired during the switch (${rec.shots0} -> ${rec.shots1})`);
  if (!leaks.length && rec.shots1 === rec.shots0) console.log(`${tag} SW-d OK: ${during.length} input(s) arrived during the switch, 0 reached the game, no shot`);
}
// SW-e: the presentation report that released the build belongs to THIS
// overlay — its own identifier, painted after its insertion. The second switch
// in one page is the case that matters: the buffered Element Timing timeline
// still holds the first overlay's entry (review r1 P2).
// A switch released by the ticks alone (no report inside the cap) is n/a, but
// only after the wait's own cap ran out; where the platform reports Element
// Timing, armSwitch also requires at least one report across the run (a blind
// wait never matches one). Returns 'report' | 'na' | 'fail'.
function judgeE(rec, fail, tag) {
  const o = rec.overlay;
  if (!o) { fail(`${tag} SW-e: no overlay readout was sampled`); return 'fail'; }
  if (o.title !== o.etId) { fail(`${tag} SW-e: the overlay title does not carry its own elementtiming id: ${JSON.stringify(o)}`); return 'fail'; }
  if (!o.paintedBy) {
    if (rec.et && o.shownAt !== null && o.shownAt - o.insertedAt < PRESENT_CAP_MS - 20) {
      fail(`${tag} SW-e: released ${(o.shownAt - o.insertedAt).toFixed(0)} ms after its insertion with no presentation report — the wait did not run to its ${PRESENT_CAP_MS} ms cap (blind)`);
      return 'fail';
    }
    console.log(`${tag} SW-e n/a: no Element Timing report inside the cap (ticks released the build) — ${JSON.stringify(o)}`);
    return 'na';
  }
  const ok = o.paintedBy.id === o.etId && o.paintedBy.renderTime >= o.insertedAt;
  if (!ok) { fail(`${tag} SW-e: the build was released by a presentation report that is not this overlay's: ${JSON.stringify(o)}`); return 'fail'; }
  console.log(`${tag} SW-e OK: released by ${o.etId} presented ${(o.paintedBy.renderTime - o.insertedAt).toFixed(1)} ms after its insertion`);
  return 'report';
}
// SW-l: focus never falls to <body> while the overlay stands: the accepted
// confirm is hidden under it without losing its focused Continue (a
// visibility:hidden confirm blurred it onto <body> — Chrome's focus fixup —
// before dialog.js returned focus to the card; e2e-shell Q3(B) caught it)
function judgeL(rec, fail, tag) {
  const under = rec.samples.filter((s) => s.ov && s.t >= rec.t0);
  const bad = under.filter((s) => s.fb);
  if (!under.length) { fail(`${tag} SW-l: UNJUDGEABLE — no frame sampled under the overlay`); return; }
  if (bad.length) fail(`${tag} SW-l: focus fell to <body> under the overlay at ${bad.length} of ${under.length} frame(s)`);
  else console.log(`${tag} SW-l OK: focus never on <body> across ${under.length} overlay frame(s)`);
}
function judgeRM(rec, fail, tag) {
  const ovs = rec.samples.filter((s) => s.ov);
  const anim = ovs.filter((s) => s.sweep && s.sweep !== 'none');
  const partial = ovs.filter((s) => s.op > 0.01 && s.op < 0.99);
  if (anim.length || partial.length) fail(`${tag} SW-rm: reduced motion still animates (sweep ${anim.length}, partial opacity ${partial.length})`);
  else console.log(`${tag} SW-rm OK: ${ovs.length} overlay frame(s), no sweep animation, instant leave`);
}

async function errorsOf(c) {
  return c.eval(`(window.__test?.errors ?? []).slice(0, 5)`).catch(() => ['errors unreadable']);
}

// ---- SW-j / SW-k: the exit paths ------------------------------------------
const CAP_MS = 15000; // ui/switchprogress.js createOverlay capMs default (until built())
const SETTLE_CAP_MS = 30000; // its settleCapMs default (the deadline once built() was called)
// an exit path ENDS the overlay before the switch returns (finish() writes its 'done' phase synchronously);
// the removal then waits for the minimum display, the 400 ms leave cap and — when the exit built a new table
// — that table's first frames (a superseding switch's compile held it ~13 s on a loaded box), so the fall
// itself is bounded only loosely
const FALL_MS = 20000;
// the page-side exit readout: every changeGame call (passed through untouched)
// with its return time, and every rise / fall of html[data-ob-switching]
const RECORDER = `(() => {
  if (window.__swjCalls) return true;
  const calls = window.__swjCalls = [], flag = window.__swjFlag = [];
  const api = window.__settings, orig = api.changeGame, html = document.documentElement;
  // the overlay as the switch returns (read in the return's own microtask: no timer has run since)
  const idOf = (el) => el?.querySelector('.ob-switchprogress__title')?.getAttribute('elementtiming') ?? null;
  const snap = () => { const ov = document.querySelector('[data-ob="switch-progress"]');
    return { ov: !!ov, id: idOf(ov), phase: ov?.dataset.phase ?? null, switching: html.hasAttribute('data-ob-switching'),
      reduced: matchMedia('(prefers-reduced-motion: reduce)').matches }; };
  // every leave mark (finish() → data-leaving): the overlay's own leave, as opposed to a removal by the cap
  const leaves = window.__swjLeave = [];
  new MutationObserver((ms) => { for (const m of ms) if (m.target.dataset?.leaving === '1') leaves.push({ t: performance.now(), id: idOf(m.target) }); })
    .observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-leaving'] });
  api.changeGame = function (id, o) {
    const r = { id, skip: o?.skipConfirm === true, t0: performance.now(), done: null, v: null, err: null };
    calls.push(r);
    const p = orig.call(this, id, o);
    Promise.resolve(p).then((v) => { r.done = performance.now(); r.v = v; r.atReturn = snap(); },
      (e) => { r.done = performance.now(); r.err = String(e?.message ?? e); r.atReturn = snap(); });
    return p;
  };
  new MutationObserver(() => {
    const on = html.hasAttribute('data-ob-switching'), id = html.getAttribute('data-ob-switching');
    const last = flag[flag.length - 1];
    if (!last || last.on !== on || last.id !== id) flag.push({ t: performance.now(), on, id });
  }).observe(html, { attributes: true, attributeFilter: ['data-ob-switching'] });
  return true;
})()`;
const callAt = (c, i, ms = SETTLE_WAIT_MS) => waitFor(c, `(() => { const r = window.__swjCalls[${i}]; return r && r.done !== null ? r : null; })()`, ms);
// the first fall of the flag after page time `since`, once no overlay stands
const fallAfter = (c, since, ms) => waitFor(c, `(() => { const f = window.__swjFlag.find((x) => !x.on && x.t >= ${since});
  return f && !document.documentElement.hasAttribute('data-ob-switching') && !document.querySelector('[data-ob="switch-progress"]') ? f.t : null; })()`, ms);
async function realKey(c, k) {
  await c.send('Input.dispatchKeyEvent', { type: 'keyDown', ...k });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...k });
}
/** SW-j: the shield is down and REAL input reaches the app */
async function inputBack(c, tag, exit, fail) {
  const st = await c.eval(`({ switching: document.documentElement.hasAttribute('data-ob-switching'),
    ov: !!document.querySelector('[data-ob="switch-progress"]'), open: window.__shell.isOpen() })`);
  if (st.switching || st.ov) { fail(`${tag} SW-j (${exit}): the shield still stands (${JSON.stringify(st)})`); return false; }
  const seen = [];
  if (st.open) {
    await c.eval(`document.activeElement?.blur?.(), true`);
    await realKey(c, KEYS[0]);
    if (!(await waitFor(c, `window.__shell.isOpen() === false && !window.__shell.moving()`, 8000))) { fail(`${tag} SW-j (${exit}): a real Enter at <body> did not close the hall (input frozen?)`); return false; }
    seen.push('Enter at <body> closed the hall');
  }
  const gear = await restingCenter(c, '#ob-gear');
  const hit = gear ? await c.eval(`!!document.elementFromPoint(${gear.x}, ${gear.y})?.closest?.('#ob-gear')`) : false;
  if (!hit) { fail(`${tag} SW-j (${exit}): the toolbar gear is not hit-testable (${JSON.stringify(gear)})`); return false; }
  await click(c, gear);
  if (!(await waitFor(c, `document.getElementById('ob-gear')?.getAttribute('aria-expanded') === 'true'`, 8000))) { fail(`${tag} SW-j (${exit}): a real click on the gear did not open settings (input frozen?)`); return false; }
  await realKey(c, KEYS[2]);
  if (!(await waitFor(c, `document.getElementById('ob-gear')?.getAttribute('aria-expanded') === 'false'`, 8000))) { fail(`${tag} SW-j (${exit}): a real Escape did not close settings`); return false; }
  seen.push('a click on the gear opened settings', 'Escape closed them');
  console.log(`${tag} SW-j OK (${exit}): flag and overlay gone; ${seen.join('; ')}`);
  return true;
}
/** SW-j for an exit that is a return (`r`, a RECORDER call; `since`, page time
 * before the overlay rose): the overlay was ENDED when the switch returned,
 * then the flag falls and real input reaches the app */
async function judgeExit(c, tag, exit, r, since, fail) {
  const rise = await c.eval(`window.__swjFlag.find((x) => x.on && x.t >= ${since}) ?? null`);
  if (!rise) { fail(`${tag} SW-j (${exit}): UNJUDGEABLE — no overlay rose for this switch`); return false; }
  const at = r.atReturn;
  // ended at the return: still standing in 'done' (reduced motion removes it at once — only then may it be gone)
  if (!at || !(at.ov ? at.phase === 'done' : at.reduced)) {
    fail(`${tag} SW-j (${exit}): the overlay was not ended when the switch returned (${JSON.stringify({ v: r.v, err: r.err, at })}) — input stays shielded until the cap`);
    await fallAfter(c, since, CAP_MS + 5000); // let the cap clear it before the next step
    return false;
  }
  const fell = await fallAfter(c, since, FALL_MS);
  if (fell === null) { fail(`${tag} SW-j (${exit}): ended at the return, but the flag still stands ${FALL_MS} ms later`); return false; }
  // ... and the fall is the overlay's OWN leave (its leave mark after the call began, before the fall), never the
  // cap's removal of an overlay that was only marked done
  const leave = await c.eval(`window.__swjLeave.find((x) => x.id === ${JSON.stringify(rise.id)} && x.t >= ${r.t0}) ?? null`);
  if (!at.reduced && (!leave || leave.t > fell)) { fail(`${tag} SW-j (${exit}): the flag fell ${(fell - r.done).toFixed(0)} ms after the return with no leave of its own (${JSON.stringify({ rise, leave })}) — the cap removed it`); return false; }
  console.log(`${tag} SW-j (${exit}): ended (done) when the switch returned; its leave began ${leave ? `${(leave.t - r.done).toFixed(0)} ms` : 'at once'} and the flag fell ${(fell - r.done).toFixed(0)} ms after the return`);
  return inputBack(c, tag, exit, fail);
}

// SW-f: a leaf import that has not landed must not stall the switch (review r1
// P2). Every request for ui/switchprogress.js is HELD at the network and never
// answered; Continue must still commit the switch and exit the hall while the
// hold stands, without an overlay (the bounded wait degrades to the switch as it
// was). An arm whose hold caught nothing is UNJUDGEABLE, never green.
const SWITCH_LEAF_WAIT_MS = 250; // settings.js SWITCH_LEAF_WAIT_MS
// Continue → the build's start (the last sampled frame before the synchronous build blocked the thread): the
// leaf wait plus the confirm's close and a loaded box's frame gaps. The commit SAMPLE also carries the build and
// the first frame's compile (Continue → commit sample 3.5–11.3 s here), so it cannot bound the wait.
const SLOW_LEAF_WAIT_BOUND_MS = SWITCH_LEAF_WAIT_MS + 2000;
// the build-entry seam, timestamped in the page: settings.js set() calls the table's prepareEquipment
// synchronously as the build begins (the last frame before the build is only a lower bound — a thread stalled
// between that frame and the entry would read as no wait at all; review r10 P2)
const BUILD_ENTRY = `(() => { const tb = window.__tableBuild, orig = tb?.prepareEquipment;
  window.__swfEntry = [];
  if (typeof orig !== 'function') return false;
  tb.prepareEquipment = function (...a) { window.__swfEntry.push(performance.now()); return orig.apply(this, a); };
  return true; })()`;
async function legSlowLeaf({ PORT, CDP_PORT, fail }) {
  const tag = 'SW slow-leaf';
  const c = await bootAt(PORT, CDP_PORT + 6);
  const held = [];
  try {
    if (!(await waitFor(c, `window.__test?.ready === true && window.__obShellArrival === 'done' && !!window.__shell`, 90000))) { fail(`${tag}: the real-user boot never became ready`); return; }
    c.onEvent((method, params) => { if (method === 'Fetch.requestPaused') held.push(params.requestId); });
    await c.send('Fetch.enable', { patterns: [{ urlPattern: '*/app/ui/switchprogress.js*', requestStage: 'Request' }] });
    if (!(await openPlay(c))) { fail(`${tag}: the hall never landed at play`); return; }
    const sel = `[data-ob="play-game"][data-game="${TO}"]`;
    await c.eval(`document.querySelector(${JSON.stringify(sel)})?.scrollIntoView({ inline: 'center', block: 'nearest' }), true`);
    const card = await restingCenter(c, sel);
    if (!card) { fail(`${tag}: no ${TO} card`); return; }
    await c.eval(PROBE);
    const seam = await c.eval(BUILD_ENTRY);
    // a card the rail keeps out of view goes through the play place's own tap path (switchTo's rule)
    const hit = await c.eval(`document.elementFromPoint(${card.x}, ${card.y})?.closest?.('[data-game]')?.dataset.game ?? null`);
    if (hit === TO) await press(c, card, { phone: false });
    else await c.eval(`void window.__play.pick(${JSON.stringify(TO)}), true`);
    const acc = await restingCenter(c, '[data-ob="confirm-accept"]');
    if (!acc) { fail(`${tag}: no switch confirm came to rest`); return; }
    await press(c, acc, { phone: false });
    // the commit is judged on PROBE's own sample of it (a rAF later than the game flip itself): wait for that
    // sample, not for a sibling signal (review r6 P2)
    const committed = await waitFor(c, `(() => { const S = window.__swArm;
      return window.__settings.get().game === ${JSON.stringify(TO)} && window.__shell.isOpen() === false
        && S.t0 !== null && S.samples.some((s) => s.game === ${JSON.stringify(TO)} && s.t >= S.t0); })()`, Number(process.env.OB_E2E_SWITCH_SLOW_WAIT_MS) || 20000);
    const rec = await c.eval(`(() => { const S = window.__swArm; const c0 = S.samples.find((s) => s.game === ${JSON.stringify(TO)} && s.t >= (S.t0 ?? Infinity));
      return { appeared: S.appeared, game: window.__settings.get().game, open: window.__shell.isOpen(), t0: S.t0,
        commitAt: c0?.t ?? null, entryAt: (window.__swfEntry ?? []).find((t) => t >= (S.t0 ?? Infinity)) ?? null,
        errors: (window.__test?.errors ?? []).slice(0, 3) }; })()`);
    const commitMs = rec.t0 !== null && rec.commitAt !== null ? rec.commitAt - rec.t0 : null;
    const waitMs = rec.t0 !== null && rec.entryAt !== null ? rec.entryAt - rec.t0 : null;
    if (!held.length) fail(`${tag}: UNJUDGEABLE — the leaf request was never caught by the hold`);
    else if (!committed) fail(`${tag}: the switch waited for the held leaf import (${held.length} held; game ${rec.game}, hall open ${rec.open})`);
    else if (!seam || waitMs === null) fail(`${tag}: UNJUDGEABLE — the build-entry seam ${seam ? 'recorded no entry after Continue' : 'is missing (no table prepareEquipment)'} (${JSON.stringify(rec)})`);
    else if (waitMs > SLOW_LEAF_WAIT_BOUND_MS) fail(`${tag}: the build began ${waitMs.toFixed(0)} ms after Continue — the leaf wait (${SWITCH_LEAF_WAIT_MS} ms) is not bounded at that`);
    else if (rec.appeared !== null) fail(`${tag}: an overlay appeared although its module never arrived`);
    else if (rec.errors.length) fail(`${tag}: app-captured errors ${JSON.stringify(rec.errors)}`);
    else console.log(`${tag} SW-f OK: leaf import held (${held.length} request(s), never answered); the build began ${waitMs.toFixed(0)} ms after Continue (commit sampled at ${commitMs.toFixed(0)} ms) and the switch left the hall without it`);
  } finally {
    for (const requestId of held) await c.send('Fetch.continueRequest', { requestId }).catch(() => {});
    c.close(); await sleep(800);
  }
}

// The CN8 transport graph's OWN modules, the ones SW-g and SW-j hold: the entry
// table.js imports for a CN8 table, and its carrier data, which only that entry
// imports. cn8transport-codec.js and cn8transport-core.js are shared with the
// snooker transport since #1131 (snktransport.js -> codec -> core): holding them
// would also hold a superseding snooker switch, which then never commits. The
// held entry alone keeps a CN8 switch pending (its other imports are never
// requested); the data module is held with it so the hold covers the whole
// CN8-only graph, whichever of the two is requested first.
const CN8_ONLY_HOLD = [
  { urlPattern: '*/scene/cn8transport.js*', requestStage: 'Request' },
  { urlPattern: '*/scene/cn8transport-data.js*', requestStage: 'Request' },
];

// SW-g: a cold CN8 switch (heyball, chinese8_pro_9ft) whose transport import
// never resolves (the CN8 transport's own modules HELD, never answered — review
// r2 P2): the overlay's WHOLE life is capped from its insertion, so it releases
// input and leaves at the cap while the table is still PENDING; table.js's
// pending banner and the settings / recovery controls are reachable again.
async function legSlowTransport({ PORT, CDP_PORT, fail }) {
  const tag = 'SW slow-transport';
  const c = await bootAt(PORT, CDP_PORT + 6);
  const held = [];
  let release = false; // once the transport is released, its own static imports flow too
  try {
    if (!(await waitFor(c, `window.__test?.ready === true && window.__obShellArrival === 'done' && !!window.__shell`, 90000))) { fail(`${tag}: the real-user boot never became ready`); return; }
    c.onEvent((method, params) => {
      if (method !== 'Fetch.requestPaused') return;
      if (release) c.send('Fetch.continueRequest', { requestId: params.requestId }).catch(() => {});
      else held.push(params.requestId);
    });
    await c.send('Fetch.enable', { patterns: CN8_ONLY_HOLD });
    if (!(await openPlay(c))) { fail(`${tag}: the hall never landed at play`); return; }
    if (!(await c.eval(`!!document.querySelector('[data-ob="play-game"][data-game="heyball"]')`))) { fail(`${tag}: UNJUDGEABLE — no heyball card on this build`); return; }
    await c.eval(PROBE);
    await c.eval(RECORDER);
    await c.eval(`void window.__play.pick('heyball'), true`);
    const acc = await restingCenter(c, '[data-ob="confirm-accept"]');
    if (!acc) { fail(`${tag}: no switch confirm came to rest`); return; }
    await c.eval(`import('/app/ui/switchprogress.js').then((m) => { window.__swArmMod = m; return true; }, () => false)`);
    await press(c, acc, { phone: false });
    // SW-i (review r3): the hall stays open under the pending switch; with focus on <body> (an opener that never
    // took focus, a hidden confirm) Enter / Space / Escape / an arrow must not reach the hall's capture gate
    // (shell.js gateKeyDown: Enter/Space at the root → quickPlay) — the hall stays open, the switch pending
    const keysAt = await waitFor(c, `!document.querySelector('[data-ob="confirm"]') && document.querySelector('[data-ob="switch-progress"]')?.dataset.phase === 'fetch'`, 15000);
    const keyOut = [];
    if (keysAt) {
      await c.eval(`document.activeElement?.blur?.(), true`);
      keyOut.push(await c.eval(`document.activeElement === document.body`));
      for (const k of KEYS) { await c.send('Input.dispatchKeyEvent', { type: 'keyDown', ...k }); await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...k }); }
      await sleep(400);
      keyOut.push(await c.eval(`({ open: window.__shell.isOpen(), game: window.__settings.get().game, ov: !!document.querySelector('[data-ob="switch-progress"]'),
        table: window.__tableBuild?.status?.()?.status ?? null })`));
      // a scripted dispatch is not user input: it passes the shield (an e2e driver's el.click(), the app's own)
      keyOut.push(await c.eval(`(() => { const b = document.createElement('button'); let hit = false;
        b.addEventListener('click', () => { hit = true; }); document.body.appendChild(b); b.click(); b.remove(); return hit; })()`));
      // OS / browser shortcuts keep their platform default under the shield: a modified key is never
      // default-prevented, the unmodified Enter above is (the census reads each outcome after its dispatch)
      await realKey(c, { key: 'Meta', code: 'MetaLeft', windowsVirtualKeyCode: 91, modifiers: 4 });
      await realKey(c, { key: 'F12', code: 'F12', windowsVirtualKeyCode: 123 });
      keyOut.push(await waitFor(c, `(() => { const ev = window.__swArm.events.filter((e) => e.kind === 'dispatched' && e.type === 'keydown' && e.ov && ['Meta', 'F12', 'Enter'].includes(e.key));
        return ev.some((e) => e.key === 'Meta') && ev.some((e) => e.key === 'F12') && ev.every((e) => e.prevented !== null) ? ev.map((e) => ({ key: e.key, mod: e.mod, prevented: e.prevented })) : null; })()`, 5000));
    }
    const gone = await waitFor(c, `window.__swArm.gone !== null`, CAP_MS + 10000);
    // settings reachable: the hall's own gear (#ob-shell-settings; the toolbar gear is hidden under the open hall)
    const r = await c.eval(`(() => { const S = window.__swArm; const g = [document.getElementById('ob-shell-settings'), document.getElementById('ob-gear')].find((x) => x && x.getBoundingClientRect().width > 0) ?? null; const gr = g?.getBoundingClientRect();
      const hit = gr ? document.elementFromPoint(gr.left + gr.width / 2, gr.top + gr.height / 2) : null;
      const pend = document.getElementById('ob-table-pending');
      return { appeared: S.appeared, gone: S.gone, phases: S.phases.map((p) => p.p), game: window.__settings.get().game,
        table: window.__tableBuild?.status?.()?.status ?? null, switching: document.documentElement.hasAttribute('data-ob-switching'),
        banner: !!pend && !pend.hidden && getComputedStyle(pend).display !== 'none',
        gearHit: !!hit && (hit === g || g.contains(hit)), errors: (window.__test?.errors ?? []).slice(0, 3) }; })()`);
    const life = r.gone !== null && r.appeared !== null ? r.gone - r.appeared : null;
    if (!held.length) fail(`${tag}: UNJUDGEABLE — no cn8transport request was caught by the hold`);
    else if (r.appeared === null) fail(`${tag}: the overlay never appeared for the CN8 switch`);
    else if (!gone) fail(`${tag}: the overlay still shields input ${CAP_MS + 10000} ms after its insertion with the table PENDING (${JSON.stringify(r)})`);
    else if (r.table !== 'PENDING' || r.game !== FROM) fail(`${tag}: staging — the transport hold did not keep the switch pending (${JSON.stringify(r)})`);
    else if (r.switching || !r.banner || !r.gearHit) fail(`${tag}: after the cap the pending banner / settings are not reachable (${JSON.stringify(r)})`);
    else if (life < CAP_MS - 50 || life > CAP_MS + 3000) fail(`${tag}: the overlay left ${life.toFixed(0)} ms after its insertion (cap ${CAP_MS})`);
    else if (r.errors.length) fail(`${tag}: app-captured errors ${JSON.stringify(r.errors)}`);
    else console.log(`${tag} SW-g OK: transport held (${held.length} request(s)); overlay ${r.phases.join(' > ')} left at the cap (${life.toFixed(0)} ms after insertion) with the table PENDING; banner up, settings reachable`);
    // SW-i judgement + its control: after the cap the same Enter at <body> DOES reach quickPlay (the hall closes) —
    // the injection can fire, so a green above is the shield's, not a dead key path
    if (!keysAt) fail(`${tag} SW-i: UNJUDGEABLE — the overlay never stood in the fetch phase with the confirm gone`);
    else {
      const [onBody, mid, scripted, osKeys] = keyOut;
      let ctl = null;
      if (gone && r.switching === false) {
        await c.eval(`document.activeElement?.blur?.(), true`);
        await c.send('Input.dispatchKeyEvent', { type: 'keyDown', ...KEYS[0] }); await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...KEYS[0] });
        ctl = await waitFor(c, `window.__shell.isOpen() === false`, 5000);
      }
      if (!onBody) fail(`${tag} SW-i: staging — focus did not rest on <body>`);
      else if (!mid.open || mid.game !== FROM || !mid.ov || mid.table !== 'PENDING') fail(`${tag} SW-i: a key at <body> reached the hall during the pending switch (${JSON.stringify(mid)})`);
      else if (!ctl) fail(`${tag} SW-i: UNJUDGEABLE — the control Enter after the cap did not close the hall (dead key path?)`);
      else if (scripted !== true) fail(`${tag} SW-i: a scripted click during the switch was swallowed (the shield must stop user input only)`);
      else if (!osKeys || !osKeys.some((e) => e.key === 'Enter')) fail(`${tag} SW-i: UNJUDGEABLE — the Meta / Enter outcomes under the shield were not recorded (${JSON.stringify(osKeys)})`);
      else if (!osKeys.filter((e) => e.key === 'Meta').every((e) => e.mod && e.prevented === false)) fail(`${tag} SW-i: a modified key was default-prevented under the shield — OS / browser shortcuts must keep their default (${JSON.stringify(osKeys)})`);
      else if (!osKeys.filter((e) => e.key === 'F12').every((e) => e.prevented === false)) fail(`${tag} SW-i: a function key (F12) was default-prevented under the shield — F5 reload / F12 devtools must keep their default (${JSON.stringify(osKeys)})`);
      else if (!osKeys.filter((e) => e.key === 'Enter').every((e) => e.prevented === true)) fail(`${tag} SW-i: an unmodified Enter under the shield kept its default (${JSON.stringify(osKeys)})`);
      else console.log(`${tag} SW-i OK: Enter / Space / Escape / ArrowRight at <body> during the pending switch left the hall open and the switch pending (Enter default-prevented); a Meta key and F12 kept their default; a scripted click passed; the control Enter after the cap closed the hall`);
    }
    if (!gone) return;
    // SW-j (the cap): the control Enter above was the key; the gear adds the click
    await inputBack(c, tag, 'the cap', fail);
    // SW-j (superseded after the cap): heyball is still pending behind the hold; the user switches to TO through
    // the hall (that switch's own overlay commits and leaves), then heyball's transport lands — the superseded
    // switch returns false and the flag stays down
    const recB = await switchTo(c, TO, { fail, tag: `${tag} supersede` });
    if (!recB) return;
    judgeC(recB, TO, fail, `${tag} supersede`);
    release = true;
    for (const requestId of held.splice(0)) await c.send('Fetch.continueRequest', { requestId }).catch(() => {});
    const a = await callAt(c, 0, 30000);
    if (!a || a.id !== 'heyball') fail(`${tag} SW-j (superseded after the cap): UNJUDGEABLE — the held heyball switch never returned after its transport landed (${JSON.stringify(a)})`);
    else if (a.v !== false) fail(`${tag} SW-j (superseded after the cap): the superseded heyball switch returned ${JSON.stringify(a.v ?? a.err)}, not false`);
    else await inputBack(c, tag, 'superseded after the cap', fail);
  } finally {
    for (const requestId of held) await c.send('Fetch.continueRequest', { requestId }).catch(() => {});
    c.close(); await sleep(800);
  }
}

// SW-j (the remaining exit paths) + SW-k on one real-user page, in order:
//   cancelled — a heyball switch held behind its transport (overlay up) is
//     cancelled by a scripted changeGame back to the current game (the
//     same-id path: cancelPendingEquipment, no set());
//   superseded while up — a heyball switch held behind its transport (overlay
//     up) is superseded by a scripted switch (changeGame skipConfirm; a
//     replay's transient game takes the same set() path);
//   refused — the held transport is then FAILED (the superseded switch gets
//     no refusal) and table.js keeps that import failure for the page, so the
//     next heyball switch is REFUSED;
//   a throw inside the switch — game.setGame rejects once (its documented
//     async throw on an unselectable id);
//   SW-k — the overlay's own 'done' write throws once: the committed
//     switch's cap still ends the shield (and a scripted key reaches its
//     target while the stranded overlay stands);
//   the newest switch wins — a scripted switch fired on the user switch's
//     overlay insertion commits; the user's older switch returns false.
async function legExits({ PORT, CDP_PORT, fail }) {
  const tag = 'SW exits';
  const c = await bootAt(PORT, CDP_PORT + 6);
  const held = [];
  // one user switch through the hall: pick → the kit confirm → a REAL Continue
  const userSwitch = async (to) => {
    if (!(await openPlay(c))) { fail(`${tag}: the hall never landed at play`); return null; }
    const i = await c.eval('window.__swjCalls.length');
    await c.eval(`void window.__play.pick(${JSON.stringify(to)}), true`);
    const acc = await restingCenter(c, '[data-ob="confirm-accept"]');
    if (!acc) { fail(`${tag}: no ${to} confirm came to rest`); return null; }
    const since = await c.eval('performance.now()');
    await press(c, acc, { phone: false });
    return { i, since };
  };
  try {
    if (!(await waitFor(c, `window.__test?.ready === true && window.__obShellArrival === 'done' && !!window.__shell`, 90000))) { fail(`${tag}: the real-user boot never became ready`); return; }
    c.onEvent((method, params) => { if (method === 'Fetch.requestPaused') held.push(params.requestId); });
    await c.send('Fetch.enable', { patterns: CN8_ONLY_HOLD });
    await c.eval(RECORDER);
    await c.eval(`import('/app/ui/switchprogress.js').then(() => true, () => false)`); // the confirm's prefetch, landed
    if (!(await openPlay(c))) { fail(`${tag}: the hall never landed at play`); return; }
    if (!(await c.eval(`!!document.querySelector('[data-ob="play-game"][data-game="heyball"]')`))) { fail(`${tag}: UNJUDGEABLE — no heyball card on this build`); return; }

    // cancelled by a return to the current game: a scripted changeGame back to the persisted game takes the
    // same-id path (prepareCurrentEquipment → cancelPendingEquipment, no set()) and cancels the held switch
    const h = await userSwitch('heyball');
    if (!h) return;
    const up0 = await waitFor(c, `!document.querySelector('[data-ob="confirm"]') && document.querySelector('[data-ob="switch-progress"]')?.dataset.phase === 'fetch'`, 15000);
    if (!up0 || !held.length) { fail(`${tag} SW-j (cancelled): UNJUDGEABLE — the heyball overlay never stood in the fetch phase behind the hold (held ${held.length})`); return; }
    const ci = await c.eval('window.__swjCalls.length');
    await c.eval(`void window.__settings.changeGame(window.__settings.get().game, { skipConfirm: true }), true`);
    const cr = await callAt(c, ci);
    if (!cr || cr.v === null) fail(`${tag} SW-j (cancelled): UNJUDGEABLE — the return to the current game never returned a value (${JSON.stringify(cr)})`);
    else await judgeExit(c, tag, 'cancelled by a return to the current game', cr, h.since, fail);

    // superseded while up (the same held transport: the import promise is shared)
    const a = await userSwitch('heyball');
    if (!a) return;
    const up = await waitFor(c, `!document.querySelector('[data-ob="confirm"]') && document.querySelector('[data-ob="switch-progress"]')?.dataset.phase === 'fetch'`, 15000);
    if (!up || !held.length) { fail(`${tag} SW-j (superseded while up): UNJUDGEABLE — the heyball overlay never stood in the fetch phase behind the hold (held ${held.length})`); return; }
    const bi = await c.eval('window.__swjCalls.length');
    await c.eval(`void window.__settings.changeGame(${JSON.stringify(TO)}, { skipConfirm: true }), true`);
    const b = await callAt(c, bi);
    if (!b || b.v !== true) fail(`${tag} SW-j (superseded while up): UNJUDGEABLE — the scripted switch to ${TO} did not commit (${JSON.stringify(b)})`);
    else await judgeExit(c, tag, 'superseded while up', b, a.since, fail);

    // refused
    for (const requestId of held.splice(0)) await c.send('Fetch.failRequest', { requestId, errorReason: 'Failed' }).catch(() => {});
    const a0 = await callAt(c, a.i, 30000);
    if (!a0 || a0.v !== false) fail(`${tag}: the superseded heyball switch returned ${JSON.stringify(a0)} after its transport failed, not false`);
    const f = await userSwitch('heyball');
    if (!f) return;
    const fr = await callAt(c, f.i);
    const table = await c.eval(`window.__tableBuild?.status?.()?.status ?? null`);
    if (!fr || fr.v !== false || table !== 'REFUSED') fail(`${tag} SW-j (refused): UNJUDGEABLE — the heyball switch over a failed transport was not refused (${JSON.stringify({ r: fr, table })})`);
    else await judgeExit(c, tag, 'refused', fr, f.since, fail);

    // a throw inside the switch
    const armed = await c.eval(`import('/app/settings.js').then((m) => {
      const g = m.ctx.game;
      if (typeof g?.setGame !== 'function') return false;
      const orig = g.setGame;
      g.setGame = function () { g.setGame = orig; return Promise.reject(new Error('SW-j planted: setGame threw')); };
      window.__swjDisarm = () => { g.setGame = orig; };
      return true; }, () => false)`);
    if (!armed) fail(`${tag} SW-j (a throw inside the switch): UNJUDGEABLE — no game.setGame on the settings ctx`);
    else {
      const t = await userSwitch(FROM);
      const tr = t ? await callAt(c, t.i) : null;
      if (!tr || !/SW-j planted/.test(tr.err ?? '')) fail(`${tag} SW-j (a throw inside the switch): UNJUDGEABLE — the switch did not throw the planted error (${JSON.stringify(tr)})`);
      else await judgeExit(c, tag, 'a throw inside the switch', tr, t.since, fail);
      await c.eval(`window.__swjDisarm?.(), true`); // a step that never reached setGame leaves no armed plant behind
    }

    // SW-k
    await c.eval(`(() => {
      const set = Element.prototype.setAttribute;
      Element.prototype.setAttribute = function (n, v) {
        if (n === 'aria-valuenow' && String(v) === '1' && this.closest?.('[data-ob="switch-progress"]')) {
          Element.prototype.setAttribute = set;
          window.__swkThrew = performance.now();
          throw new Error('SW-k planted: the overlay leave threw');
        }
        return set.call(this, n, v);
      };
      return true; })()`);
    const k = await userSwitch(BACK);
    const kr = k ? await callAt(c, k.i) : null;
    const threw = await waitFor(c, `window.__swkThrew ?? null`, 20000);
    const kRise = k ? await c.eval(`window.__swjFlag.find((x) => x.on && x.t >= ${k.since}) ?? null`) : null;
    const rose = kRise?.t ?? null;
    if (!kr || kr.v !== true || !threw || rose === null) fail(`${tag} SW-k: UNJUDGEABLE — the switch did not commit with its overlay's leave throwing (${JSON.stringify({ r: kr, threw, rose })})`);
    else {
      // the shield and the overlay's own guard stop the user's keys only: a scripted keydown under the standing
      // overlay (the hall closed by the commit, so no hall gate) reaches its target
      const scripted = await c.eval(`(() => { if (!document.documentElement.hasAttribute('data-ob-switching') || !document.querySelector('[data-ob="switch-progress"]')) return 'no-shield';
        const b = document.createElement('input'); let hit = false; b.addEventListener('keydown', () => { hit = true; });
        document.body.appendChild(b); b.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true })); b.remove(); return hit; })()`);
      if (scripted === 'no-shield') fail(`${tag} SW-k: UNJUDGEABLE — the overlay was gone before the scripted key`);
      else if (scripted !== true) fail(`${tag} SW-k: a scripted key under the standing overlay never reached its target (the guard must stop user keys only)`);
      else console.log(`${tag} SW-k OK: a scripted key under the standing overlay reached its target`);
      // the switch committed (built() was called), so the deadline is settleCapMs from the insertion
      const fell = await fallAfter(c, k.since, Math.max(0, rose + SETTLE_CAP_MS - (await c.eval('performance.now()'))) + 5000);
      const survived = fell === null ? null : await c.eval(`window.__swjLeave.find((x) => x.id === ${JSON.stringify(kRise.id)} && x.t >= ${threw} && x.t <= ${fell}) ?? null`);
      if (survived) console.log(`${tag} SW-k n/a: the leave survived the throw (leave mark ${(survived.t - threw).toFixed(0)} ms after it, flag fell ${(fell - rose).toFixed(0)} ms after the rise)`);
      else if (fell === null) fail(`${tag} SW-k: the shield still stands ${SETTLE_CAP_MS + 5000} ms after the overlay rose — a throw inside its leave froze input past the cap`);
      else if (fell - rose < SETTLE_CAP_MS - 50 || fell - rose > SETTLE_CAP_MS + 3000) fail(`${tag} SW-k: the flag fell ${(fell - rose).toFixed(0)} ms after it rose (the committed switch's deadline is ${SETTLE_CAP_MS})`);
      else {
        console.log(`${tag} SW-k OK: the overlay's leave threw ${(threw - rose).toFixed(0)} ms after it rose; the committed switch's cap ended the shield at ${(fell - rose).toFixed(0)} ms`);
        await inputBack(c, tag, 'the cap after a throw in the leave', fail);
      }
    }
    // the newest switch wins: a scripted switch fired the moment the user's switch inserts its overlay (it begins
    // during that switch's presentation wait) commits, and the user's older switch ends its overlay and returns
    // false instead of superseding it with a late set()
    const gameNow = await c.eval('window.__settings.get().game');
    const [older, newer] = gameNow === FROM ? [TO, BACK] : [FROM, TO];
    await c.eval(`(() => { const mo = new MutationObserver(() => {
        if (!document.querySelector('[data-ob="switch-progress"]')) return;
        mo.disconnect(); window.__swjNewer = window.__swjCalls.length;
        void window.__settings.changeGame(${JSON.stringify(newer)}, { skipConfirm: true }); });
      mo.observe(document.body, { childList: true }); return true; })()`);
    const o = await userSwitch(older);
    const or = o ? await callAt(c, o.i) : null;
    const ni = await c.eval('window.__swjNewer ?? null');
    const nr = ni === null ? null : await callAt(c, ni);
    const final = await c.eval('window.__settings.get().game');
    if (!or || !nr) fail(`${tag} SW-j (the newest switch wins): UNJUDGEABLE — ${JSON.stringify({ older: or, newer: nr })}`);
    else if (nr.v !== true || or.v !== false || final !== newer) fail(`${tag} SW-j (the newest switch wins): the older switch won — game ${final}, older ${older} returned ${JSON.stringify(or.v ?? or.err)}, newer ${newer} returned ${JSON.stringify(nr.v ?? nr.err)}`);
    else await judgeExit(c, tag, 'the newest switch wins', or, o.since, fail);

    const errs = await c.eval(`(window.__test?.errors ?? []).filter((e) => !/SW-[jk] planted|CN8_TRANSPORT/.test(String(e))).slice(0, 5)`).catch(() => ['errors unreadable']);
    if (errs.length) fail(`${tag}: app-captured errors ${JSON.stringify(errs)}`);
  } finally {
    for (const requestId of held) await c.send('Fetch.continueRequest', { requestId }).catch(() => {});
    c.close(); await sleep(800);
  }
}

// SW-h: a stale cached dictionary (the active locale's JSON without the five
// switch.* keys, derived from the served file by that ONE transform and served
// at the network — review r2 P2): no overlay at all (never English, never a raw
// key, no missing-key warning) and the switch still commits.
const KEYS = [
  { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' },
  { key: ' ', code: 'Space', windowsVirtualKeyCode: 32, text: ' ' },
  { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 },
  { key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 },
];
const SWITCH_KEYS = ['switch.title', 'switch.phase.table', 'switch.phase.fetch', 'switch.phase.materials', 'switch.phase.settling'];
async function legStaleDict({ PORT, CDP_PORT, fail, webDir }) {
  const tag = 'SW stale-dictionary';
  const LOC = 'de';
  const dict = JSON.parse(fs.readFileSync(path.join(webDir, 'app/locales', LOC + '.json'), 'utf8'));
  const missing = SWITCH_KEYS.filter((k) => !(k in dict));
  if (missing.length) { fail(`${tag}: REFUSED — the served ${LOC}.json lacks ${missing.join(', ')} already`); return; }
  for (const k of SWITCH_KEYS) delete dict[k];
  const body = Buffer.from(JSON.stringify(dict)).toString('base64');
  let served = 0;
  const warns = [], marks = new Set();
  const c = await bootAt(PORT, CDP_PORT + 6, { settings: { language: LOC }, before: async (cc) => {
    cc.onEvent((method, params) => {
      if (method === 'Fetch.requestPaused') {
        if (/\/app\/locales\/de\.json(\?|$)/.test(params.request.url)) {
          served += 1;
          cc.send('Fetch.fulfillRequest', { requestId: params.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body }).catch(() => {});
        } else cc.send('Fetch.continueRequest', { requestId: params.requestId }).catch(() => {});
      }
      if (method === 'Runtime.consoleAPICalled') {
        const text = params.args.map((a) => a.value ?? '').join(' ');
        if (/^sw-h-barrier-\d+$/.test(text)) marks.add(text);
        else if (/switch\./.test(text)) warns.push(text);
      }
    });
    await cc.send('Network.enable');
    await cc.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cc.send('Network.setBypassServiceWorker', { bypass: true }).catch(() => {});
    await cc.send('Fetch.enable', { patterns: [{ urlPattern: '*/app/locales/*' }] });
  } });
  try {
    if (!(await waitFor(c, `window.__test?.ready === true && window.__obShellArrival === 'done' && !!window.__shell && window.__i18n?.locale?.() === '${LOC}'`, 90000))) { fail(`${tag}: the ${LOC} boot never became ready`); return; }
    if (!served) { fail(`${tag}: UNJUDGEABLE — the stale ${LOC}.json was never served`); return; }
    const rec = await switchTo(c, TO, { fail, tag });
    if (!rec) return;
    // the console barrier: every message logged before this marker has been delivered once the marker has
    await c.eval(`console.debug('sw-h-barrier-1'), true`);
    for (let i = 0; i < 100 && !marks.has('sw-h-barrier-1'); i++) await sleep(50);
    if (!marks.has('sw-h-barrier-1')) { fail(`${tag}: UNJUDGEABLE — the console barrier never arrived (warnings unreadable)`); return; }
    const raw = await c.eval(`document.body.innerText.includes('switch.')`);
    if (rec.appeared !== null) fail(`${tag}: an overlay appeared over a stale dictionary (phases ${JSON.stringify(rec.phases.map((p) => [p.p, p.text]))})`);
    else if (raw) fail(`${tag}: a raw switch.* key is on screen`);
    else if (warns.length) fail(`${tag}: missing-key warnings: ${JSON.stringify(warns.slice(0, 3))}`);
    else if (rec.samples.at(-1)?.game !== TO) fail(`${tag}: the switch did not commit (${rec.samples.at(-1)?.game})`);
    else console.log(`${tag} SW-h OK: stale ${LOC}.json served ${served}x (5 switch.* keys removed): no overlay, no raw key, no warning; the switch committed to ${TO}`);
  } finally { c.close(); await sleep(800); }
}

// the GH-976 table cache's counters (null on a tree without the cache)
const CACHE = `(window.__tableCache?.state?.() ?? null)`;
const cacheNote = (a, b) => (!a || !b ? 'no table cache on this tree (the switch rebuilt its table)'
  : b.hits > a.hits ? 'a cached table re-attached (cache hit)' : b.misses > a.misses ? 'the table rebuilt (cache miss)' : 'no table build counted');

export async function armSwitch({ PORT, CDP_PORT, fail, webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), legs = (process.env.OB_E2E_SWITCH_ARMS ?? 'desktop,cold,slowleaf,slowtransport,exits,staledict,phone').split(',') }) {
  // SW-e across the run: where the platform reports Element Timing, at least one switch must have been released by
  // its own overlay's report (a blind presentation wait never matches one; the n/a branch alone cannot see that)
  const e = { judged: 0, reports: 0, et: false };
  const sawE = (rec, verdict) => { e.judged += 1; e.et ||= rec.et === true; if (verdict === 'report') e.reports += 1; };
  // a leg that throws (a launch or first-document stall on a loaded box) fails as itself and never aborts the
  // other legs — or e2e-shell, which imports this arm
  const guarded = async (name, fn) => { try { await fn(); } catch (err) { fail(`SW ${name}: the leg aborted — ${String(err?.message ?? err).slice(0, 240)}`); } };
  if (legs.includes('desktop')) await guarded('desktop', async () => {
    const c = await bootAt(PORT, CDP_PORT + 6);
    try {
      if (!(await waitFor(c, `window.__test?.ready === true && window.__obShellArrival === 'done' && !!window.__shell`, 90000))) fail('SW desktop: the real-user boot never became ready');
      else if ((await c.eval(`window.__settings.get().game`)) !== FROM) fail(`SW desktop: STATE MISMATCH — booted on ${await c.eval(`window.__settings.get().game`)}, wanted ${FROM}`);
      else {
        console.log('SW desktop: boot state ' + JSON.stringify(await c.eval(`({ game: window.__settings.get().game, scripted: sessionStorage.getItem('ob-scripted'), shell: window.__shell.state().boot, w: innerWidth, h: innerHeight })`)));
        const rec = await switchTo(c, TO, { inject: true, fail, tag: 'SW desktop' });
        if (rec) {
          judgeA(rec, FROM, fail, 'SW desktop'); judgeB(rec, fail, 'SW desktop'); judgeC(rec, TO, fail, 'SW desktop'); judgeD(rec, fail, 'SW desktop'); sawE(rec, judgeE(rec, fail, 'SW desktop')); judgeL(rec, fail, 'SW desktop');
          await inputBack(c, 'SW desktop', 'the commit', fail);
        }
        await c.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
        const cache0 = await c.eval(CACHE);
        const rm = await switchTo(c, BACK, { fail, tag: 'SW desktop rm' });
        if (rm) {
          console.log(`SW desktop rm: ${cacheNote(cache0, await c.eval(CACHE))}`);
          judgeA(rm, TO, fail, 'SW desktop rm'); judgeC(rm, BACK, fail, 'SW desktop rm'); judgeRM(rm, fail, 'SW desktop rm'); sawE(rm, judgeE(rm, fail, 'SW desktop rm (second switch)')); judgeL(rm, fail, 'SW desktop rm');
        }
        const errs = await errorsOf(c);
        if (errs.length) fail('SW desktop: app-captured errors ' + JSON.stringify(errs));
      }
    } finally { c.close(); await sleep(800); }
  });
  // the cold control: the desktop leg's rm switch with its table rebuilt — the GH-976 cache flushed first (table.js's
  // own e2e cold-rebuild reference; its `?obArm=table-cache-off` fires only on a scripted boot, which has no hall), so
  // the settle, not the minimum display, decides the leave. On a tree without the cache every switch rebuilds.
  if (legs.includes('cold')) await guarded('cold', async () => {
    const c = await bootAt(PORT, CDP_PORT + 6);
    try {
      if (!(await waitFor(c, `window.__test?.ready === true && window.__obShellArrival === 'done' && !!window.__shell`, 90000))) fail('SW cold: the real-user boot never became ready');
      else if ((await c.eval(`window.__settings.get().game`)) !== FROM) fail('SW cold: STATE MISMATCH — not booted on ' + FROM);
      else {
        const rec = await switchTo(c, TO, { fail, tag: 'SW cold' });
        if (rec) judgeC(rec, TO, fail, 'SW cold');
        await c.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
        const cache0 = await c.eval(`(window.__tableCache?.flush?.(), ${CACHE})`);
        const rm = await switchTo(c, BACK, { fail, tag: 'SW cold rm' });
        if (rm) {
          const cache1 = await c.eval(CACHE);
          if (cache0 && !(cache1?.misses > cache0.misses)) fail(`SW cold rm: UNJUDGEABLE — the cold control did not rebuild its table (${cacheNote(cache0, cache1)})`);
          else {
            console.log(`SW cold rm: ${cacheNote(cache0, cache1)}`);
            judgeA(rm, TO, fail, 'SW cold rm');
            const c2 = judgeC(rm, BACK, fail, 'SW cold rm');
            // the control stands for the settle-decided leave only if its settle came after the minimum display
            if (cache0 && c2 && c2.decided !== 'settle') fail('SW cold rm: UNJUDGEABLE — the cold control settled inside the minimum display (the settle did not decide its leave)');
            judgeRM(rm, fail, 'SW cold rm'); sawE(rm, judgeE(rm, fail, 'SW cold rm')); judgeL(rm, fail, 'SW cold rm');
          }
        }
        const errs = await errorsOf(c);
        if (errs.length) fail('SW cold: app-captured errors ' + JSON.stringify(errs));
      }
    } finally { c.close(); await sleep(800); }
  });
  if (legs.includes('slowleaf')) await guarded('slow-leaf', () => legSlowLeaf({ PORT, CDP_PORT, fail }));
  if (legs.includes('slowtransport')) await guarded('slow-transport', () => legSlowTransport({ PORT, CDP_PORT, fail }));
  if (legs.includes('exits')) await guarded('exits', () => legExits({ PORT, CDP_PORT, fail }));
  if (legs.includes('staledict')) await guarded('stale-dictionary', () => legStaleDict({ PORT, CDP_PORT, fail, webDir }));
  if (legs.includes('phone')) await guarded('phone', async () => {
    const c = await bootAt(PORT, CDP_PORT + 5, { phone: true });
    try {
      if (!(await waitFor(c, `window.__test?.ready === true && window.__obShellArrival === 'done' && !!window.__shell`, 90000))) fail('SW phone: the real-user boot never became ready');
      else if ((await c.eval(`window.__settings.get().game`)) !== FROM) fail('SW phone: STATE MISMATCH — not booted on ' + FROM);
      else {
        const rec = await switchTo(c, TO, { phone: true, fail, tag: 'SW phone' });
        if (rec) { judgeA(rec, FROM, fail, 'SW phone'); judgeB(rec, fail, 'SW phone'); judgeC(rec, TO, fail, 'SW phone'); sawE(rec, judgeE(rec, fail, 'SW phone')); judgeL(rec, fail, 'SW phone'); }
        const errs = await errorsOf(c);
        if (errs.length) fail('SW phone: app-captured errors ' + JSON.stringify(errs));
      }
    } finally { c.close(); await sleep(800); }
  });
  if (e.et && e.judged && !e.reports) fail(`SW-e: none of the ${e.judged} judged switch(es) was released by its own presentation report although the platform reports Element Timing — the presentation wait is blind`);
  else if (e.judged) console.log(`SW-e run: ${e.reports} of ${e.judged} judged switch(es) released by their own presentation report${e.et ? '' : ' (no Element Timing on this platform)'}`);
}

// ---- standalone (the red-proof runner; the gate imports armSwitch above) --
// (realpath both sides: node realpaths the entry module, so a /tmp scratch
// copy would otherwise never match its own argv[1] and silently do nothing)
const isMain = () => { try { return fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } };
if (isMain()) {
  const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const PORT = Number(process.env.OB_E2E_PORT ?? 8178);
  const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 8830);
  const fail = (msg) => { console.error('E2E-SHELL FAIL:', msg); process.exitCode = 1; };
  const server = spawnStaticServer(webDir, PORT);
  await sleep(700);
  try { await armSwitch({ PORT, CDP_PORT, fail }); } finally { await stopStaticServer(server); }
  console.log(process.exitCode ? 'E2E-SHELL-SWITCH FAIL' : 'E2E-SHELL-SWITCH PASS');
}
