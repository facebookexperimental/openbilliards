// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-shell-cont.mjs — the CONTINUATION GUARD arm (build 20: #986 pointer
// half, #987, #988, #1044, #1068, #1072, #1152; #992's decline law re-checked
// after every declined confirm). Its own suite (one desktop browser at a time): the
// full run (every leg; many browser-minutes) rides the e2e-nightly battery.
// `--fastlane` runs the subset CONT-FL (one boot: #987, #988 and the #1044
// hold); it is NOT wired into ci.yml e2e-fastlane — its wall (436 s on the
// loaded lane box, launchd, nice 15) is far over the selection law's 60 s.
// Under run-gate:
// `node web/tools/e2e-shell-cont.mjs [--fastlane]` (OB_E2E_PORT /
// OB_E2E_CDP_PORT; OB_E2E_CONT_LEGS=988,987,1044,1068,dec,986,esc,sel,1072,cue,fl selects
// legs — the planted-red runner uses it).
//
// Every leg is driven by REAL input (CDP Input.dispatchMouseEvent with an
// explicit clickCount and pointerType, Input.dispatchKeyEvent with Enter's
// text so the native activation runs, auto-repeat via autoRepeat:true) on a
// REAL-user boot (no obtool stamp: the hall and the shell are built). A
// passive input logger registered by Page.addScriptToEvaluateOnNewDocument
// (so ahead of main.js's switch shield and the shell's guard) records what
// was DELIVERED: each leg proves its construction from that record — the
// continuation press / repeat really reached the page, on the target the
// leg claims, outside the switch shield — and a construction that did not
// happen is reported UNJUDGEABLE (a fail line, never a pass).
//
//   988  Back to the table (desktop 1440x900, mouse): C1 a single click
//        exits and keeps the aim, the pill's point is the canvas after;
//        C2 a click there 1 s later re-aims (input at the point reaches the
//        aim); R40 / R120 a double-click (clickCount 1 → 2) exits and keeps
//        the aim; R-SLOW 380 ms + the driver's own latency (past the
//        350 ms time-only clause), clickCount 1 / 1 (only the slop clause
//        holds); PEN R40 with pointerType pen; C3 a click >= 120 px away
//        150 ms after the exit is swallowed (the time-only clause) and the
//        same click 700 ms after acts; C4 a deliberate click on the reopen
//        pill 150 ms after the exit acts (the time-only clause is the
//        table canvas's only).
//   987  Play card (desktop): R40 / R120 / R120-11 / R-SLOW a double-click
//        on the 8-Ball card leaves ONE switch confirm open (the second press
//        landed on its backdrop or panel); D-ISO press 2 on the confirm's
//        Cancel (off the backdrop, far from the card) with clickCount 2 (only
//        the click-count clause holds — synthetic, it isolates it); HOLD
//        press 2 at +250 ms released 1.5 s later (its click comes after the
//        window and after the confirm was shown — one verdict per press); R-STALL the confirm is presented
//        900 ms late (a stall inside the presentation) and press 2, made
//        40 ms after click 1, still cannot cancel it; R-EARLY the same with
//        press 2 at +600 ms (past the window, made before the confirm was
//        shown); RM R40 under reduced
//        motion; KB-HOLD a continuation press swallowed on the focused
//        Cancel keeps its verdict through a Shift mid-hold (its release
//        past the window does not cancel), and KB Space on it 800 ms later
//        activates it (review r1, r2); L two picks inside
//        the pre-confirm window open ONE confirm (the commit latch); C-BD a
//        single backdrop click >= 1 s later still cancels; C-992 after every
//        decline the COMMITTED card holds focus and the selection; ACC a
//        double-click then Continue switches; EXP a double-click on the
//        toolbar Export keeps its modal open (the first-open race before the
//        modal exists is #985's latch).
//   1044 Keyboard continuation (desktop): A2 Enter HELD on Continue through
//        the whole switch and 1 s past the overlay (default motion) fires no
//        shot; A1 two Enters 50 ms apart on Continue (reduced motion, no
//        overlay — the leaf's request fails — so no switch shield; the
//        second stamped 50 ms after the first, delivered on #shoot after the
//        focus handoff) fire no shot; PA Enter held on the toolbar hall pill
//        opens the hall and never leaves it or shoots; B1 a decision answer
//        by Enter + a second Enter 50 ms later (reduced motion) fires no
//        shot; B1-SP a Space held 450 ms on the answer, then a second Space
//        150 ms after its release (Space acts on keyup) fires no shot;
//        ORPHAN Continue by mouse, Enter pressed under the switch shield and
//        held past it fires no shot; CTRL a fresh Enter on Shoot >= 1 s
//        later still shoots.
//   1068 A held Enter from a keyboard break that scratches (8-ball WPA,
//        the aim-HUD K5b staging) never answers the break-foul prompt
//        and fires exactly one shot; CTRL a fresh Enter answers it, focus
//        reaches Shoot, a fresh Enter there shoots. The hold starts once
//        focus has held on Shoot (else UNJUDGEABLE), its press must land
//        there, and a press there that fires no shot is red.
//   DEC  The table decision prompt's pointer twin (the review's F4): a
//        double-click on a break-foul answer (reduced motion 40 ms 1 → 2;
//        default motion 200 ms 1 / 1) answers once, and the second click,
//        delivered to the table canvas once the prompt has gone, is
//        swallowed: the table ends exactly where a single click on the same
//        staged answer leaves it (CTRL-1, the control).
//   FL   (--fastlane, per PR) one boot: a double-click on the 8-Ball card
//        leaves one confirm (#987) and the decline re-selects the committed
//        card; a double-click on Back to the table keeps the aim (#988); a
//        held Enter on the hall pill opens the hall and stays (#1044).
//   ESC  A keyboard dismissal never arms the continuation (the batch-4 e2e-ui
//        route): a click opens a kit select in the settings, Escape closes
//        its popover and then the settings, and a click at the same point
//        350 ms after the opening click acts (988 K-CANCEL: the same with
//        the exit — a key between two presses ends the continuation).
//   SEL  An exiting kit-select popover takes no input (ui/select.js): a
//        click on the next select's trigger 30 ms after Escape closed the
//        previous popover — under its leaving list — opens the next select
//        and leaves the previous value unchanged (one pipelined burst; a
//        burst whose press arrives after that list left is a miss, judged
//        only on the previous value, and is re-staged, up to 4 bursts).
//   1072 Re-rack inside the 10-ball push-out window (desktop): R-CTR /
//        R-EDGE a double-click on Re-rack's centre / on the part of its box
//        a Slow-mo control takes once the stance has left — main asks first
//        (#990): ONE confirm, press 2 on its backdrop held, a real Continue
//        re-racks once, Slow-mo unchanged; BD-C1 a single backdrop click on
//        that confirm cancels it (so the guard is what holds press 2); SM-C1
//        a deliberate click on the toggle after the re-rack flips it.
//   CUE  The HUD cue picker's kit list (#1152): CUE-DBL a double-click on the
//        option over Shoot picks it and fires no shot; CUE-CTRL Shoot 750 ms
//        after click 1 shoots; CUE-FAST a pick far from the trigger 250 ms
//        after the opening click (both stamped, no eval between) is taken;
//        CUE-OPEN at 1024x640 (the list clamped over its trigger) a
//        double-click on the trigger leaves the list open and picks nothing;
//        CUE-OPEN-CTRL a pick there 700 ms (stamped) later is taken.
//   986  10-ball push-out window (desktop, fine pointer): C1 one click on
//        Replay starts the replay and no Shoot-row button moves, the
//        push-out stance included (the point stays #replay); C1-STANCE
//        during the replay the stance is shown in its aiming slot, disabled
//        (dimmed, inert — card 38, D1 = B) and a real click on it changes
//        nothing; R a double-click on Replay keeps the frame;
//        R-LATE a click at Replay's point 1 s into the replay keeps the
//        frame (a layout trap, not a race); C2 a click on Re-rack's own
//        centre during the replay re-racks (input reaches onRerack).
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  launchChrome, sleep, spawnStaticServer, stopStaticServer,
} from './cdp.mjs';

// one static server + one desktop CDP endpoint (each leg closes its browser before the next boots)
export const PORT_INVENTORY = { http: 1, cdp: 1 };
// SHARED_DEFAULT_WINDOW (e2e-shell) — the suite's default ports are e2e-shell's (8178/8830); the two never run in parallel in a lane
export const SHARED_DEFAULT_WINDOW = 'e2e-shell';

const J = (o) => JSON.stringify(o);
const AIMING = `['AIM','BALL_IN_HAND'].includes(window.__test.state())`;
const SHOTS = '(window.__test?.scenarios?.() ?? []).length';
const CONT_MS = 500; // web/app/shell.js CONT_MS (the guard's window)
// OB_E2E_CONT_SUB=A1,ORPHAN,… runs only the named sub-legs (the planted-red runner); unset = all
const SUB = (process.env.OB_E2E_CONT_SUB || '').split(',').map((x) => x.trim()).filter(Boolean);
const want = (tag) => !SUB.length || SUB.includes(tag);
const SUB_KNOWN = ['R40', 'R120', 'R-SLOW', 'PEN', 'C3', 'C3-150', 'C3-700', 'C4', 'R120-11', 'D-ISO', 'HOLD', 'R-STALL', 'R-EARLY',
  'RM-R40', 'RM-R120-11', 'KB', 'L', 'C-BD', 'ACC', 'EXP', 'A2', 'PA', 'ORPHAN', 'A1', 'B1', 'B1-SP', 'K-CANCEL', 'R-CTR', 'R-EDGE', 'SM-C1', 'CUE-DBL', 'CUE-CTRL', 'CUE-FAST', 'CUE-OPEN', 'CUE-OPEN-CTRL', 'BD-C1'];

// the passive, first-registered input logger (delivered events + surface
// insertions); `sw` = the switch shield's flag at delivery. <body> and
// <html> are named by tag: their first class is page state (an open hall's
// body.ob-shell-open read as the reopen pill's id, #1068)
const INLOG = `(() => {
  const L = (window.__inlog = []), now = () => performance.now();
  const id = (n) => (n && n.nodeType === 1 ? (n.id || n.dataset?.ob || n.dataset?.choice
    || (n === document.body || n === document.documentElement ? null : n.classList?.[0] ?? null) || n.tagName)
    : (n === document ? 'document' : null));
  const rec = (phase) => (e) => L.push({ phase, type: e.type, ts: e.timeStamp, at: now(), trusted: e.isTrusted,
    detail: e.detail ?? null, key: e.key ?? null, repeat: e.repeat ?? null, pt: e.pointerType ?? null,
    x: e.clientX ?? null, y: e.clientY ?? null, tgt: id(e.target), ae: id(document.activeElement),
    dec: !!e.target?.closest?.('#hud-decision'), bd: !!e.target?.closest?.('.ob-backdrop'),
    conf: !!e.target?.closest?.('[data-ob="confirm"]'),
    sw: document.documentElement.hasAttribute('data-ob-switching'), ...((ls) => ({ ls: ls.length, lsid: [...ls].map((n) => n.id) }))(document.querySelectorAll('[data-ob="select-list"]')),
    sm: (() => { const s = document.getElementById('slowmo'), l = e.target?.closest?.('label');
      return !!s && (e.target === s || (!!l && (l.htmlFor === 'slowmo' || l.contains(s)))); })() });
  for (const t of ['pointerdown', 'mousedown', 'click', 'keydown', 'keyup']) {
    window.addEventListener(t, rec('cap'), { capture: true, passive: true }); // delivered (the first listener)
    window.addEventListener(t, rec('bub'), { passive: true }); // survived to window bubble (advisory: not swallowed)
  }
  // R-STALL: an opt-in main-thread stall INSIDE the presentation (this listener precedes the shell's), so the
  // confirm is presented > the window after the click that opened it and the queued second press lands after it
  window.addEventListener('ob:presented', () => {
    const ms = window.__stallPresented;
    if (!ms) return;
    window.__stallPresented = 0;
    const t = now(); while (now() - t < ms) { /* a loaded device */ }
  });
  let had = false; // the confirm's arrival = a presence transition (its data-ob may be stamped after insertion)
  new MutationObserver(() => {
    const has = !!document.querySelector('[data-ob="confirm"]');
    if (has && !had) L.push({ type: 'added', sel: 'confirm', at: now() });
    had = has;
  }).observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-ob'] }); // the init script runs before <html> exists
})()`;

async function waitFor(c, expr, ms = 20000, step = 100) {
  const t0 = Date.now();
  for (;;) {
    let v = null;
    try { v = await c.eval(expr); } catch { v = null; }
    if (v) return v;
    if (Date.now() - t0 > ms) return null;
    await sleep(step);
  }
}
const center = (c, sel) => c.eval(`(() => { const e = document.querySelector(${J(sel)}); if (!e) return null;
  const r = e.getBoundingClientRect(); if (!r.width || !r.height) return null;
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
// an element's rect is identical across two rAF ticks and its kit panel's entrance tween has finished
const restingCenter = (c, sel, ms = 15000) => waitFor(c, `new Promise((res) => {
  const e = document.querySelector(${J(sel)});
  if (!e) { res(null); return; }
  const r0 = e.getBoundingClientRect();
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const r1 = e.getBoundingClientRect(), panel = e.closest('[data-ob="confirm"]');
    const still = Math.abs(r0.x - r1.x) < 0.5 && Math.abs(r0.y - r1.y) < 0.5 && Math.abs(r0.width - r1.width) < 0.5;
    const cs = panel ? getComputedStyle(panel) : null;
    const rest = !cs || (cs.transform === 'none' && Number(cs.opacity) >= 0.99);
    res(r1.width && r1.height && still && rest ? { x: r1.left + r1.width / 2, y: r1.top + r1.height / 2 } : null);
  }));
})`, ms);
const hitId = (c, p) => c.eval(`(() => { const e = document.elementFromPoint(${p.x}, ${p.y});
  return e ? (e.id || e.dataset?.game || e.closest?.('[data-game]')?.dataset.game || e.tagName) : null; })()`);
const mark = (c) => c.eval('window.__inlog.length');
const logSince = (c, i) => c.eval(`window.__inlog.slice(${i})`);
const epoch = () => Date.now() / 1000;

/** one real press + release; count = clickCount (the page's event.detail); ts = the press's own time (epoch s) —
 * pinned, like an OS event's hardware stamp, so a driver stalled by a loaded box never stretches a gesture */
async function press(c, p, { count = 1, pointerType = 'mouse', hold = 30, ts = epoch() } = {}) {
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y, pointerType, timestamp: ts - 0.005 });
  await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', buttons: 1, clickCount: count, pointerType, timestamp: ts });
  await sleep(hold);
  await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', buttons: 0, clickCount: count, pointerType, timestamp: ts + hold / 1000 });
}
/** a double activation: press 1, `gap` ms, press 2 (counts [c1, c2]; p2 defaults to p) */
async function double(c, p, gap, { counts = [1, 2], p2 = p, pointerType = 'mouse', hold2 = 20 } = {}) {
  const ts0 = epoch();
  await press(c, p, { count: counts[0], pointerType, hold: 20, ts: ts0 });
  await sleep(gap);
  await press(c, p2, { count: counts[1], pointerType, hold: hold2, ts: ts0 + (20 + gap) / 1000 });
}
const KEYDEF = {
  Enter: { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, text: '\r', unmodifiedText: '\r' },
  Tab: { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 },
  Escape: { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 },
  ' ': { key: ' ', code: 'Space', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32, text: ' ', unmodifiedText: ' ' },
  Shift: { key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16, nativeVirtualKeyCode: 16, modifiers: 8 },
};
async function keyDown(c, name, { autoRepeat = false, timestamp } = {}) {
  const k = KEYDEF[name];
  const p = k.text ? { type: 'keyDown', autoRepeat, ...k } : { type: 'rawKeyDown', autoRepeat, ...k };
  if (timestamp !== undefined) p.timestamp = timestamp;
  await c.send('Input.dispatchKeyEvent', p);
}
async function keyUp(c, name, { timestamp } = {}) {
  const { text, unmodifiedText, modifiers, ...k } = KEYDEF[name]; // a key's own release carries no modifier
  const p = { type: 'keyUp', ...k };
  if (timestamp !== undefined) p.timestamp = timestamp;
  await c.send('Input.dispatchKeyEvent', p);
}
async function key(c, name, o) { await keyDown(c, name, o); await keyUp(c, name); }

/** a real-user boot of `game` (localStorage, then app.html); resolves once ready with the hall built */
async function boot(port, cdp, { game = 'nine_ball', reduced = false } = {}) {
  const origin = `http://127.0.0.1:${port}/`;
  const c = await launchChrome(origin, { port: cdp, tool: false, width: 1440, height: 900 });
  try {
    const atOrigin = `location.protocol === 'http:' && document.readyState === 'complete'`;
    let landed = await waitFor(c, atOrigin, 60000);
    if (!landed) { await c.send('Page.navigate', { url: origin }).catch(() => {}); landed = await waitFor(c, atOrigin, 60000); }
    if (!landed) throw new Error(`the first document never landed at ${origin}`);
    await c.eval(`localStorage.setItem('ob-settings-v1', JSON.stringify(${J({ game })})), true`);
    if (reduced) await c.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await c.send('Page.addScriptToEvaluateOnNewDocument', { source: INLOG });
    await c.send('Page.navigate', { url: origin + 'app.html' });
    const ready = await waitFor(c, `window.__test?.ready === true && !!window.__shell && !!window.__settings && Array.isArray(window.__inlog)`, 90000, 200);
    if (!ready) throw new Error('the app never became ready');
    return c;
  } catch (err) {
    c.close(); await sleep(800);
    throw err;
  }
}
/** the table is up. A FRESH boot covers the table as createShell runs (body.ob-shell-open: #hud hidden and inert) and
 * opens its hall only at #ob-boot's fade start (shell.js waitOverlayHandoff), a beat after the app is ready — a longer
 * one on a loaded box. Read under that cover, isOpen() === false passed with nothing to close, and the hall opened over
 * the staged table later (1068 H: a focus() on #shoot refused there, the press on <body>; DEC: no answer presented on
 * the table). A user meets the hall first. Wait for the hand-off as a user waits, then close the hall until the closed
 * state holds 300 ms, cover class included (e2e-replays hallClosedFirst). */
const HANDOFF = `(() => { const b = document.getElementById('ob-boot'); return !b || b.classList.contains('ob-boot--out'); })()`;
const HANDOFF_MS = 40000, HALL_CLOSE_TRIES = 4;
const toTable = async (c) => {
  if (!(await waitFor(c, HANDOFF, HANDOFF_MS))) return false;
  for (let i = 0; i < HALL_CLOSE_TRIES; i++) {
    await c.eval(`(() => { const s = window.__shell; if (s.isOpen()) s.quickPlay(); return true; })()`);
    if (!(await waitFor(c, `window.__shell.isOpen() === false && !window.__shell.moving() && ${AIMING}`, 30000))) continue;
    await sleep(300);
    if (await c.eval(`window.__shell.isOpen() === false && !document.body.classList.contains('ob-shell-open')`)) return true;
  }
  return false;
};
async function openPlay(c) {
  await c.eval(`(() => { const s = window.__shell; if (!s.isOpen()) s.openShell({}); s.go('play'); return true; })()`);
  return waitFor(c, `(() => { const s = window.__shell; return !!window.__play && s.isOpen() && !s.moving() && s.place() === 'play'; })()`, 30000);
}
const settled = (c, ms = 60000) => waitFor(c, AIMING, ms);
/** no switch overlay: the leaf's request fails, so changeGame degrades to the bare switch (its 250 ms leaf
 * wait) — a switch leg's second key then meets no switch shield (the e2e-shell-switch SW-f idiom) */
async function noOverlay(c) {
  c.onEvent((method, params) => {
    if (method === 'Fetch.requestPaused') c.send('Fetch.failRequest', { requestId: params.requestId, errorReason: 'BlockedByClient' }).catch(() => {});
  });
  await c.send('Fetch.enable', { patterns: [{ urlPattern: '*/app/ui/switchprogress.js*', requestStage: 'Request' }] });
}
const errorsOf = (c) => c.eval(`(window.__test?.errors ?? []).slice(0, 5)`).catch(() => ['errors unreadable']);
async function closeClient(c) { try { c?.close(); } catch { /* gone */ } await sleep(1000); }

// ---- 988 -------------------------------------------------------------------
async function leg988({ PORT, CDP_PORT, fail, log }) {
  const T = 'CONT-988';
  const c = await boot(PORT, CDP_PORT);
  try {
    if (!(await toTable(c))) { fail(`${T}: the table never came up`); return; }
    if (await c.eval(`window.__aim?.getAimView?.() === true`)) { fail(`${T}: UNJUDGEABLE — aim view is on (no press-time snap)`); return; }
    await c.eval(`window.__test.shoot({ v0: 1.2, phi: 0.3 }), true`);
    if (!(await settled(c))) { fail(`${T}: the setup shot never settled`); return; }
    const openHall = async (tag) => {
      const pill = await restingCenter(c, '#ob-shell-open');
      if (!pill) { fail(`${T} ${tag}: no hall pill`); return null; }
      await press(c, pill);
      if (!(await waitFor(c, `window.__shell.isOpen() && !window.__shell.moving()`, 20000))) { fail(`${T} ${tag}: the hall never opened`); return null; }
      await sleep(700); // F6's 400 ms open window has expired
      const verb = await c.eval(`document.querySelector('#ob-shell-quickplay .ob-btn__label')?.dataset.i18n ?? null`);
      if (verb !== 'shell.backToTable') { fail(`${T} ${tag}: UNJUDGEABLE — the pill reads ${verb}, not shell.backToTable`); return null; }
      return restingCenter(c, '#ob-shell-quickplay');
    };
    const phi = () => c.eval('window.__test.bed().phi');
    // C1: a single click exits and keeps the aim
    const PHI0 = 0.4321;
    await c.eval(`window.__test.aim(${PHI0}), true`);
    let P = await openHall('C1');
    if (!P) return;
    const want0 = await phi();
    await press(c, P);
    if (!(await waitFor(c, `window.__shell.isOpen() === false`, 10000))) { fail(`${T} C1: a single click on Back to the table did not exit`); return; }
    await sleep(400);
    const c1 = { phi: await phi(), at: await hitId(c, P), ae: await c.eval('document.activeElement?.id || document.activeElement?.tagName') };
    if (c1.phi !== want0) fail(`${T} C1: a single-click exit changed the aim (${want0} → ${c1.phi})`);
    if (c1.at !== 'CANVAS') fail(`${T} C1: UNJUDGEABLE — the pill's point is ${c1.at} after the exit, not the table canvas`);
    // C2: a deliberate click at the point re-aims (the point is live table)
    await sleep(1000);
    await press(c, P);
    await sleep(500);
    const PHI_P = await phi();
    if (!(Math.abs(PHI_P - want0) > 1e-3)) { fail(`${T} C2: UNJUDGEABLE — a click at the pill's point 1 s after the exit did not re-aim (${want0} → ${PHI_P})`); return; }
    log(`${T} C1/C2: exit kept phi ${want0}; the point is the canvas (focus ${c1.ae}); a click there re-aims to ${PHI_P.toFixed(4)}`);
    const variants = [
      { tag: 'R40', gap: 40, counts: [1, 2] },
      { tag: 'R120', gap: 120, counts: [1, 2] },
      { tag: 'R-SLOW', gap: 380, counts: [1, 1] },
      { tag: 'PEN', gap: 40, counts: [1, 2], pointerType: 'pen' },
    ];
    const queue = variants.filter((x) => want(x.tag)).map((v) => ({ ...v, tries: 1 }));
    while (queue.length) {
      const v = queue.shift();
      await c.eval(`window.__test.aim(${PHI_P + 1.0}), true`);
      P = await openHall(v.tag);
      if (!P) return;
      const want = await phi();
      const elev0 = await c.eval(`document.getElementById('elev')?.value ?? null`);
      const i0 = await mark(c);
      await double(c, P, v.gap, { counts: v.counts, pointerType: v.pointerType ?? 'mouse' });
      await sleep(700);
      const got = { open: await c.eval('window.__shell.isOpen()'), phi: await phi(), elev: await c.eval(`document.getElementById('elev')?.value ?? null`),
        ae: await c.eval('document.activeElement?.id || document.activeElement?.tagName') };
      const L = await logSince(c, i0);
      const downs = L.filter((e) => e.phase === 'cap' && e.type === 'pointerdown' && e.trusted);
      const click1 = L.find((e) => e.phase === 'cap' && e.type === 'click' && e.trusted);
      const d2 = downs[1];
      // the exit arms at click 1 (the activation): the window runs from there
      if (!d2 || !click1 || d2.tgt !== 'CANVAS' || !(d2.ts - click1.ts < CONT_MS)) {
        const why = `the second press was not delivered to the canvas inside ${CONT_MS} ms of click 1 (${J(downs.map((e) => [e.tgt, Math.round(e.ts), e.pt]))}, click 1 ${click1 ? Math.round(click1.ts) : null})`;
        if (v.tries < 2) { log(`${T} ${v.tag}: construction missed (${why}) — one retry`); queue.push({ ...v, tries: v.tries + 1 }); await sleep(600); continue; }
        fail(`${T} ${v.tag}: UNJUDGEABLE — ${why}`);
        continue;
      }
      if (got.open) fail(`${T} ${v.tag}: the first click did not exit the hall`);
      if (Math.abs(got.phi - want) > 1e-9 || got.elev !== elev0) {
        fail(`${T} ${v.tag}: the double-click's second press re-aimed the shot (phi ${want} → ${got.phi}, elev ${elev0} → ${got.elev}; press 2 ${d2.pt} +${Math.round(d2.ts - click1.ts)} ms after click 1)`);
      } else log(`${T} ${v.tag}: kept phi ${want.toFixed(4)} (press 2 ${d2.pt} +${Math.round(d2.ts - click1.ts)} ms after click 1, on the canvas; focus ${got.ae})`);
      await sleep(600);
    }
    // C3: the exit's time-only clause — a deliberate click elsewhere at +150 ms is swallowed, at +700 ms it acts
    const Q = { x: P.x - 220, y: P.y - 140 };
    for (const [tag, gap, swallowed] of [['C3-150', 150, true], ['C3-700', 700, false]].filter(([x]) => want(x) || want('C3'))) {
      await c.eval(`window.__test.aim(${PHI_P + 1.0}), true`);
      P = await openHall(tag);
      if (!P) return;
      const want = await phi();
      const i0 = await mark(c);
      const ts0 = epoch();
      await press(c, P, { hold: 20, ts: ts0 });
      await sleep(gap);
      await press(c, Q, { hold: 20, ts: ts0 + (20 + gap) / 1000 });
      await sleep(600);
      const got = await phi();
      const L = await logSince(c, i0);
      const downs = L.filter((e) => e.phase === 'cap' && e.type === 'pointerdown' && e.trusted);
      const click1 = L.find((e) => e.phase === 'cap' && e.type === 'click' && e.trusted);
      const d2 = downs[1];
      if (!d2 || !click1 || d2.tgt !== 'CANVAS') { fail(`${T} ${tag}: UNJUDGEABLE — the far press was not delivered to the canvas (${J(downs.map((e) => e.tgt))})`); continue; }
      const dt = Math.round(d2.ts - click1.ts);
      if (swallowed && !(dt < 350)) { fail(`${T} ${tag}: UNJUDGEABLE — the far press came ${dt} ms after the exit (past the 350 ms clause; driver stall)`); continue; }
      if (swallowed && got !== want) fail(`${T} ${tag}: a click 260 px away ${dt} ms after the exit re-aimed (the time-only clause; phi ${want} → ${got})`);
      else if (!swallowed && got === want) fail(`${T} ${tag}: UNJUDGEABLE — a click 260 px away ${dt} ms after the exit did not re-aim (the far point is not live table)`);
      else log(`${T} ${tag}: a click 260 px away +${dt} ms ${swallowed ? 'was swallowed' : 're-aimed'}`);
      await sleep(600);
    }
    // K-CANCEL (batch-4 route): a key between the exit click and the next press ends the continuation — exit at P,
    // Escape 100 ms later, a click at P 250 ms after the exit (stamped; inside the window, on the slop) re-aims
    if (want('K-CANCEL')) {
      await c.eval(`window.__test.aim(${PHI_P + 1.0}), true`);
      P = await openHall('K-CANCEL');
      if (!P) return;
      const want0 = await phi();
      const i0 = await mark(c);
      const ts0 = epoch();
      await press(c, P, { hold: 20, ts: ts0 });
      await waitFor(c, `window.__shell.isOpen() === false`, 3000, 20);
      await keyDown(c, 'Escape', { timestamp: ts0 + 0.1 });
      await keyUp(c, 'Escape', { timestamp: ts0 + 0.12 });
      await sleep(150);
      await press(c, P, { hold: 20, ts: ts0 + 0.25 });
      await sleep(600);
      const got = await phi();
      const L = await logSince(c, i0);
      const click1 = L.find((e) => e.phase === 'cap' && e.type === 'click' && e.trusted);
      const d2 = L.filter((e) => e.phase === 'cap' && e.type === 'pointerdown' && e.trusted)[1];
      const kd = L.find((e) => e.phase === 'cap' && e.type === 'keydown' && e.key === 'Escape');
      if (!d2 || !click1 || !kd || d2.tgt !== 'CANVAS' || !(d2.ts - click1.ts < CONT_MS)) fail(`${T} K-CANCEL: UNJUDGEABLE — the Escape and the press at P were not delivered inside the window (${J({ d2: d2?.tgt, kd: !!kd })})`);
      else if (got === want0) fail(`${T} K-CANCEL: a click at the pill's point after an Escape (+${Math.round(d2.ts - click1.ts)} ms after the exit) was swallowed — a key must end the pointer continuation`);
      else log(`${T} K-CANCEL: after an Escape, a click at the pill's point +${Math.round(d2.ts - click1.ts)} ms after the exit re-aimed`);
      await sleep(600);
    }
    // C4: the time-only clause is the table's — a deliberate click on the reopen pill 150 ms after the exit acts
    if (want('C4')) {
      P = await openHall('C4');
      if (!P) return;
      const pill = await center(c, '#ob-shell-open');
      const i0 = await mark(c);
      const ts0 = epoch();
      await press(c, P, { hold: 20, ts: ts0 });
      await waitFor(c, `window.__shell.isOpen() === false`, 3000, 20);
      const pillNow = (await center(c, '#ob-shell-open')) ?? pill;
      await sleep(100);
      await press(c, pillNow, { hold: 20, ts: ts0 + 0.15 });
      const reopened = await waitFor(c, `window.__shell.isOpen() === true`, 5000);
      const L = await logSince(c, i0);
      const click1 = L.find((e) => e.phase === 'cap' && e.type === 'click' && e.trusted);
      const d2 = L.filter((e) => e.phase === 'cap' && e.type === 'pointerdown' && e.trusted)[1];
      const dt = d2 && click1 ? Math.round(d2.ts - click1.ts) : null;
      if (!d2 || d2.tgt !== 'ob-shell-open' || !(dt < 350)) fail(`${T} C4: UNJUDGEABLE — the pill press was not delivered to the reopen pill inside 350 ms of the exit (${d2?.tgt ?? 'none'}, +${dt} ms)`);
      else if (!reopened) fail(`${T} C4: a deliberate click on the reopen pill ${dt} ms after the exit was swallowed (the time-only clause must stay on the table)`);
      else log(`${T} C4: a deliberate click on the reopen pill +${dt} ms after the exit reopened the hall`);
      await waitFor(c, `window.__shell.isOpen() && !window.__shell.moving()`, 20000);
      await c.eval(`window.__shell.quickPlay(), true`);
      await waitFor(c, `window.__shell.isOpen() === false`, 10000);
    }
    const errs = await errorsOf(c);
    if (errs.length) fail(`${T}: page errors ${J(errs)}`);
  } finally { await closeClient(c); }
}

// ---- 987 -------------------------------------------------------------------
async function leg987({ PORT, CDP_PORT, fail, log }) {
  const T = 'CONT-987';
  const c = await boot(PORT, CDP_PORT);
  try {
    if (!(await openPlay(c))) { fail(`${T}: the hall never landed at play`); return; }
    const sel = (g) => `[data-ob="play-game"][data-game="${g}"]`;
    const cardAt = async (g) => {
      await c.eval(`document.querySelector(${J(sel(g))})?.scrollIntoView({ inline: 'center', block: 'nearest' }), true`);
      const p = await restingCenter(c, sel(g));
      return p && (await hitId(c, p)) === g ? p : null;
    };
    const confirms = () => c.eval(`document.querySelectorAll('[data-ob="confirm"]').length`);
    let cancelAt = null; // where the confirm's Cancel rests (the D-ISO target)
    const decline = async (tag) => {
      await sleep(650);
      const cb = await restingCenter(c, '[data-ob="confirm-cancel"]');
      if (!cb) { fail(`${T} ${tag}: no Cancel to decline with`); return false; }
      cancelAt = cb;
      await press(c, cb);
      if (!(await waitFor(c, `!document.querySelector('[data-ob="confirm"]')`, 10000))) { fail(`${T} ${tag}: Cancel did not close the confirm`); return false; }
      await sleep(900);
      // C-992: the decline re-selects the COMMITTED card
      const d = await c.eval(`(() => { const a = document.activeElement;
        const sel = [...document.querySelectorAll('[data-ob="play-game"][aria-selected="true"]')].map((e) => e.dataset.game);
        return { game: window.__settings.get().game, focus: a?.dataset?.game ?? a?.id ?? a?.tagName, sel }; })()`);
      if (d.game !== 'nine_ball' || d.focus !== 'nine_ball' || !(d.sel.length === 1 && d.sel[0] === 'nine_ball')) {
        fail(`${T} ${tag} C-992: after the decline the committed card must hold focus and the selection (${J(d)})`);
      }
      await sleep(600);
      return true;
    };
    const variants = [
      { tag: 'R40', gap: 40, counts: [1, 2] },
      { tag: 'R120', gap: 120, counts: [1, 2] },
      { tag: 'R120-11', gap: 120, counts: [1, 1] },
      { tag: 'R-SLOW', gap: 400, counts: [1, 1] },
    ];
    const one = async (v) => {
      const P = await cardAt('eight_ball');
      if (!P) { fail(`${T} ${v.tag}: UNJUDGEABLE — the 8-Ball card is not hit-testable`); return; }
      const i0 = await mark(c);
      if (v.stall) await c.eval(`window.__stallPresented = ${v.stall}, true`);
      await double(c, P, v.gap, { counts: v.counts, p2: v.p2 ?? P, hold2: v.hold2 ?? 20 });
      await sleep(700);
      const n = await confirms();
      const L = await logSince(c, i0);
      const added = L.find((e) => e.type === 'added');
      const downs = L.filter((e) => e.phase === 'cap' && e.type === 'pointerdown' && e.trusted);
      const click1 = L.find((e) => e.phase === 'cap' && e.type === 'click' && e.trusted);
      const d2 = downs[1];
      if (!d2 || !click1) { fail(`${T} ${v.tag}: UNJUDGEABLE — the double-click was not delivered (${downs.length} press(es), click ${!!click1})`); return; }
      // the window runs from the activation (click 1): a renderer stalled by the first open can stretch the pair
      if (!v.early && !(d2.ts - click1.ts < CONT_MS)) { fail(`${T} ${v.tag}: UNJUDGEABLE — press 2 came ${Math.round(d2.ts - click1.ts)} ms after click 1 (driver stall)`); if (await confirms()) await decline(v.tag); return; }
      if (v.early && !(d2.at > added?.at && d2.ts - click1.ts >= CONT_MS)) { fail(`${T} ${v.tag}: UNJUDGEABLE — press 2 was not a past-the-window press delivered after the late confirm (+${Math.round(d2.ts - click1.ts)} ms stamp)`); if (await confirms()) await decline(v.tag); return; }
      if (v.stall && !(added && added.at - click1.at >= CONT_MS)) { fail(`${T} ${v.tag}: UNJUDGEABLE — the confirm was presented ${added ? Math.round(added.at - click1.at) : '?'} ms after click 1 (the stall did not hold it past the window)`); if (await confirms()) await decline(v.tag); return; }
      if (v.needTgt && d2.tgt !== v.needTgt) { fail(`${T} ${v.tag}: UNJUDGEABLE — press 2 landed on ${d2.tgt}, not ${v.needTgt}`); if (await confirms()) await decline(v.tag); return; }
      const where = d2.bd ? 'backdrop' : d2.conf ? `confirm panel (${d2.tgt})` : d2.tgt;
      const before = !added || d2.at < added.at;
      const gap = `+${Math.round(d2.ts - click1.ts)} ms after click 1`;
      // HOLD's construction: the one-verdict-per-press clause is exercised only where a click FOLLOWS a pointerdown
      // whose default was prevented — report whether this engine dispatched one (Chromium mouse: measure, never assume)
      if (v.hold2 && v.hold2 > 100) {
        const c2 = L.filter((e) => e.phase === 'cap' && e.type === 'click' && e.trusted && e.at > d2.at)[0];
        // the release's click must be stamped after the confirm was shown, or the pre-presentation rule (not the
        // press's verdict) is what holds it
        if (!c2 || !added || !(c2.ts > added.at)) { fail(`${T} ${v.tag}: UNJUDGEABLE — press 2's click ${c2 ? `stamped +${Math.round(c2.ts - click1.ts)} ms, before the confirm was shown (+${added ? Math.round(added.at - click1.ts) : '?'} ms)` : 'was never dispatched'}`); if (await confirms()) await decline(v.tag); return; }
        log(`${T} ${v.tag}: construction — press 2's click dispatched +${Math.round(c2.ts - d2.ts)} ms after its pointerdown, after the confirm was shown (only the press's own verdict can hold it)`);
      }
      if (n !== 1) fail(`${T} ${v.tag}: a double-click must leave ONE switch confirm open — ${n} open (press 2 ${gap} on ${where}${before ? ', before the confirm existed' : ''})`);
      else log(`${T} ${v.tag}: one confirm stays open (press 2 ${gap} on ${where}${before ? ', before the confirm existed' : ''})`);
      if (n >= 1) {
        const ae = await c.eval(`document.activeElement?.dataset?.ob ?? null`);
        if (ae !== 'confirm-cancel') fail(`${T} ${v.tag}: the confirm's focus must stay on Cancel (${ae})`);
        await decline(v.tag);
      }
      if (await c.eval(`window.__settings.get().game`) !== 'nine_ball') fail(`${T} ${v.tag}: the game changed without a Continue`);
    };
    for (const v of variants.filter((x) => want(x.tag))) await one(v);
    const P0 = await cardAt('eight_ball');
    // D-ISO: only the click count holds (press 2 40 px away, past the backdrop's 350 ms clause, clickCount 2 —
    // synthetic: it isolates the clause); HOLD: press 2 inside the window, released after it (one verdict per press)
    if (want('D-ISO')) {
      // D-ISO needs Cancel's resting point: a plain decline first when no variant recorded it
      if (!cancelAt && P0 && await (async () => { await press(c, P0); return waitFor(c, `!!document.querySelector('[data-ob="confirm"]')`, 10000); })()) await decline('D-ISO setup');
      if (cancelAt) await one({ tag: 'D-ISO', gap: 250, counts: [1, 2], p2: cancelAt, needTgt: 'confirm-cancel' });
      else fail(`${T} D-ISO: UNJUDGEABLE — no Cancel position recorded`);
    }
    // HOLD's release comes 1.5 s after the press (well past the window AND past the confirm's presentation, so the
    // pre-presentation rule cannot hold it — only the press's own verdict can)
    if (want('HOLD')) await one({ tag: 'HOLD', gap: 250, counts: [1, 1], hold2: 1500 });
    // R-STALL: the confirm is presented LATE (900 ms of main-thread work inside the presentation); press 2, made
    // 40 ms after click 1 and queued behind the stall, lands on the backdrop — judged on its own stamp
    if (want('R-STALL')) await one({ tag: 'R-STALL', gap: 40, counts: [1, 2], stall: 900 });
    // R-EARLY: the same late confirm; press 2 made 600 ms after click 1 (past the window, before the confirm was
    // shown) — a press made before its surface was shown never acts on it
    if (want('R-EARLY')) await one({ tag: 'R-EARLY', gap: 600, counts: [1, 1], stall: 1200, early: true });
    // RM: reduced motion (the confirm is hit-testable at once)
    await c.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    if (want('RM-R40')) await one({ tag: 'RM-R40', gap: 40, counts: [1, 2] });
    if (want('RM-R120-11')) await one({ tag: 'RM-R120-11', gap: 120, counts: [1, 1] });
    await c.send('Emulation.setEmulatedMedia', { features: [] });
    // KB (review r1, r2): a continuation press swallowed on the focused Cancel keeps its verdict to its own release
    // (KB-HOLD: a Shift pressed and released mid-hold, the release 750 ms after the press — the confirm stays open)
    // and never blocks a later keyboard activation (KB: Space 800 ms later activates Cancel). Construction: decline
    // confirm A by a real click on its Cancel at C (the dismissal arms at C), present confirm B at once (its Cancel
    // rests at C, autofocused), press C 300 ms after the first click (stamped) — swallowed.
    if (want('KB')) {
      const P = await cardAt('eight_ball');
      if (!P) fail(`${T} KB: UNJUDGEABLE — the 8-Ball card is not hit-testable`);
      else {
        await press(c, P);
        const C = await restingCenter(c, '[data-ob="confirm-cancel"]');
        if (!C) fail(`${T} KB: UNJUDGEABLE — no confirm to decline`);
        else {
          await sleep(700);
          const ts0 = epoch();
          await press(c, C, { hold: 20, ts: ts0 });
          await waitFor(c, `!document.querySelector('[data-ob="confirm"]')`, 5000, 20);
          await c.eval(`void window.__play.pick('eight_ball'), true`);
          await waitFor(c, `document.activeElement?.dataset?.ob === 'confirm-cancel'`, 8000, 20);
          const C2 = await center(c, '[data-ob="confirm-cancel"]');
          const i0 = await mark(c);
          if (C2) { // the held continuation press, a Shift down/up mid-hold, the release past the window
            await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: C2.x, y: C2.y, timestamp: ts0 + 0.295 });
            await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: C2.x, y: C2.y, button: 'left', buttons: 1, clickCount: 1, timestamp: ts0 + 0.3 });
            await sleep(150);
            await keyDown(c, 'Shift', { timestamp: ts0 + 0.45 });
            await keyUp(c, 'Shift', { timestamp: ts0 + 0.5 });
            await sleep(500);
            await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: C2.x, y: C2.y, button: 'left', buttons: 0, clickCount: 1, timestamp: ts0 + 1.05 });
          }
          await sleep(800);
          const L = await logSince(c, i0);
          const pd = L.find((e) => e.phase === 'cap' && e.type === 'pointerdown' && e.trusted);
          const swallowed = !!pd && !L.some((e) => e.phase === 'bub' && e.type === 'pointerdown' && e.at === pd.at);
          const st = await c.eval(`({ open: !!document.querySelector('[data-ob="confirm"]'), ae: document.activeElement?.dataset?.ob ?? null })`);
          const ck = L.find((e) => e.phase === 'cap' && e.type === 'click' && e.trusted);
          if (!C2 || !pd || pd.tgt !== 'confirm-cancel' || !swallowed || !ck || !(ck.ts - pd.ts >= CONT_MS)) {
            fail(`${T} KB: UNJUDGEABLE — the held continuation press on the focused Cancel was not swallowed, or its release came inside the window (${J({ C, C2, tgt: pd?.tgt, swallowed, release: ck && Math.round(ck.ts - pd.ts), ...st })})`);
          } else if (!st.open || st.ae !== 'confirm-cancel') {
            fail(`${T} KB-HOLD: the release after a modifier mid-hold let the swallowed press's click through (the confirm closed: ${J(st)})`);
          } else {
            log(`${T} KB-HOLD: a swallowed continuation press kept its verdict through a Shift mid-hold; its release ${Math.round(ck.ts - pd.ts)} ms later did not cancel the confirm`);
            await sleep(400);
            await keyDown(c, ' ');
            await keyUp(c, ' ');
            const closed = await waitFor(c, `!document.querySelector('[data-ob="confirm"]')`, 3000, 50);
            if (!closed) fail(`${T} KB: Space on the focused Cancel, 800 ms after a swallowed continuation press on it, was blocked (the press's verdict carried into the keyboard activation)`);
            else log(`${T} KB: a swallowed continuation press on the focused Cancel; Space 800 ms later activated it`);
          }
          while (await confirms() > 0) { await c.eval(`document.querySelector('[data-ob="confirm-cancel"]')?.click(), true`); await sleep(400); }
          await sleep(600);
        }
      }
    }
    // L: two picks inside the pre-confirm window (one task) — the commit latch
    if (want('L')) {
      const i0 = await mark(c);
      await c.eval(`(() => { void window.__play.pick('eight_ball'); void window.__play.pick('snooker'); return true; })()`);
      await sleep(1200);
      const n = await confirms();
      const adds = (await logSince(c, i0)).filter((e) => e.type === 'added').length;
      if (n !== 1 || adds !== 1) fail(`${T} L: two commits inside the pre-confirm window must open ONE confirm (open ${n}, added ${adds})`);
      else log(`${T} L: two picks in one task opened one confirm`);
      while (await confirms() > 0) {
        await c.eval(`document.querySelector('[data-ob="confirm-cancel"]')?.click(), true`);
        await sleep(500);
      }
      await sleep(600);
    }
    // C-BD: a single deliberate backdrop click >= 1 s after the confirm opened still cancels
    if (want('C-BD')) {
      const P = await cardAt('eight_ball');
      if (!P) fail(`${T} C-BD: UNJUDGEABLE — the 8-Ball card is not hit-testable`);
      else {
        await press(c, P);
        if (!(await waitFor(c, `!!document.querySelector('[data-ob="confirm"]')`, 10000))) fail(`${T} C-BD: a single click opened no confirm`);
        else {
          await sleep(1100);
          const B = { x: 40, y: 860 };
          const at = await c.eval(`document.elementFromPoint(${B.x}, ${B.y})?.classList.contains('ob-backdrop') === true`);
          if (!at) fail(`${T} C-BD: UNJUDGEABLE — (${B.x}, ${B.y}) is not the backdrop`);
          else {
            await press(c, B);
            if (!(await waitFor(c, `!document.querySelector('[data-ob="confirm"]')`, 5000))) fail(`${T} C-BD: a deliberate backdrop click 1.1 s after the confirm did not cancel it`);
            else log(`${T} C-BD: a deliberate backdrop click 1.1 s later cancels`);
          }
          await sleep(900);
        }
      }
    }
    // ACC: a double-click, then a deliberate Continue switches
    if (want('ACC') || want('EXP')) {
      const P = await cardAt('eight_ball');
      if (!P) fail(`${T} ACC: UNJUDGEABLE — the 8-Ball card is not hit-testable`);
      else {
        await double(c, P, 40);
        await sleep(700);
        const acc = await restingCenter(c, '[data-ob="confirm-accept"]');
        if (!acc) fail(`${T} ACC: no confirm after a double-click`);
        else {
          await press(c, acc);
          const ok = await waitFor(c, `window.__settings.get().game === 'eight_ball' && !document.documentElement.hasAttribute('data-ob-switching')`, 45000);
          if (!ok) fail(`${T} ACC: Continue after a double-click did not switch to 8-ball`);
          else log(`${T} ACC: a double-click then Continue switched to 8-ball`);
        }
      }
    }
    // EXP: the export modal's backdrop (#987's toolbar sibling) — warm the first open (its pre-modal race is
    // #985's), then a double-click on Export leaves the modal open
    if (want('EXP')) {
      await toTable(c);
      const modalOpen = `(() => { const m = document.getElementById('ob-export-modal'); return !!m && m.getClientRects().length > 0; })()`;
      const B = await restingCenter(c, '#ob-export-btn');
      if (!B) fail(`${T} EXP: UNJUDGEABLE — no Export button`);
      else {
        await press(c, B);
        if (!(await waitFor(c, modalOpen, 20000))) fail(`${T} EXP: UNJUDGEABLE — Export opened no modal`);
        else {
          await sleep(600);
          await key(c, 'Escape');
          await waitFor(c, `!${modalOpen}`, 5000);
          await sleep(900);
          const i0 = await mark(c);
          await double(c, B, 40);
          await sleep(700);
          const open = await c.eval(modalOpen);
          const L = await logSince(c, i0);
          const click1 = L.find((e) => e.phase === 'cap' && e.type === 'click' && e.trusted);
          const d2 = L.filter((e) => e.phase === 'cap' && e.type === 'pointerdown' && e.trusted)[1];
          if (!d2 || !click1) fail(`${T} EXP: UNJUDGEABLE — the double-click was not delivered`);
          else if (d2.tgt === 'ob-export-btn' || !(d2.ts - click1.ts < CONT_MS)) fail(`${T} EXP: UNJUDGEABLE — press 2 landed on ${d2.tgt} +${Math.round(d2.ts - click1.ts)} ms after click 1 (not on the new modal inside the window)`);
          else if (!open) fail(`${T} EXP: a double-click on Export closed the modal it opened (press 2 on ${d2.bd ? 'the backdrop' : d2.tgt})`);
          else log(`${T} EXP: a double-click on Export keeps the modal open (press 2 on ${d2.bd ? 'the backdrop' : d2.tgt} +${Math.round(d2.ts - click1.ts)} ms)`);
          if (open) { await key(c, 'Escape'); await waitFor(c, `!${modalOpen}`, 5000); }
        }
      }
    }
    const errs = await errorsOf(c);
    if (errs.length) fail(`${T}: page errors ${J(errs)}`);
  } finally { await closeClient(c); }
}

// ---- 1044 ------------------------------------------------------------------
/** keyboard: focus the target card, Enter opens the confirm (focus Cancel), Tab to Continue */
async function confirmByKeys(c, to, T, tag, fail) {
  if (!(await openPlay(c))) { fail(`${T} ${tag}: the hall never landed at play`); return false; }
  await c.eval(`(() => { const e = document.querySelector('[data-ob="play-game"][data-game="${to}"]');
    e?.scrollIntoView({ inline: 'center', block: 'nearest' }); e?.focus(); return true; })()`);
  await sleep(500);
  await key(c, 'Enter');
  if (!(await waitFor(c, `document.activeElement?.dataset?.ob === 'confirm-cancel'`, 10000))) { fail(`${T} ${tag}: Enter on the ${to} card opened no confirm with focus on Cancel`); return false; }
  await restingCenter(c, '[data-ob="confirm-accept"]');
  await key(c, 'Tab');
  if (!(await waitFor(c, `document.activeElement?.dataset?.ob === 'confirm-accept'`, 3000))) { fail(`${T} ${tag}: Tab did not reach Continue`); return false; }
  // the prefetched overlay leaf has landed (a user's think time)
  await c.eval(`import('/app/ui/switchprogress.js').then(() => true, () => false)`);
  await sleep(300);
  return true;
}
/** hold Enter (one press + auto-repeats every 33 ms) until `until()` is true for `afterMs`, capped */
async function holdEnter(c, until, afterMs, capMs) {
  await keyDown(c, 'Enter');
  const t0 = Date.now();
  let since = null, reps = 0;
  while (Date.now() - t0 < capMs) {
    await sleep(33);
    await keyDown(c, 'Enter', { autoRepeat: true }); reps++;
    if (since === null && Date.now() - t0 > 200 && await until()) since = Date.now();
    if (since !== null && Date.now() - since > afterMs) break;
  }
  await keyUp(c, 'Enter');
  return { reps, reached: since !== null };
}
async function ctrlShot(c, T, tag, fail, log) {
  await sleep(1000);
  await settled(c);
  const n0 = await c.eval(SHOTS);
  await c.eval(`document.getElementById('shoot')?.focus(), true`);
  const pre = await c.eval(`({ state: window.__test.state(), disabled: document.getElementById('shoot')?.disabled ?? null,
    ae: document.activeElement?.id || document.activeElement?.tagName })`);
  if (pre.disabled || pre.ae !== 'shoot') { fail(`${T} ${tag} CTRL: UNJUDGEABLE — Shoot is not a live focused control (${J(pre)})`); return; }
  const i0 = await mark(c);
  await key(c, 'Enter');
  await waitFor(c, `${SHOTS} > ${n0}`, 3000);
  const fired = (await c.eval(SHOTS)) > n0;
  // the claim: the guard never eats a deliberate press — Shoot's native activation (a click) reached the page
  // (the game itself may refuse the stroke, e.g. 8-ball's call requirement after a break foul)
  const act = await activatedShoot(c, i0);
  if (!act) fail(`${T} ${tag} CTRL: a fresh Enter on Shoot >= 1 s after the transition did not activate Shoot (${J(pre)})`);
  else log(`${T} ${tag} CTRL: a fresh Enter on Shoot activates it (shot ${fired ? 'fired' : 'refused by the game'})`);
  await settled(c);
}
/** Shoot's activation since log index i0: a trusted click on #shoot that survived to window bubble */
const activatedShoot = async (c, i0) => {
  const L = await logSince(c, i0);
  return L.some((e) => e.type === 'click' && e.tgt === 'shoot' && e.phase === 'bub');
};
async function leg1044({ PORT, CDP_PORT, fail, log }) {
  const T = 'CONT-1044';
  let c = await boot(PORT, CDP_PORT, { game: 'nine_ball' });
  try {
    // A2: Enter held on Continue through the switch and 1 s past the overlay (default motion)
    if (want('A2') && await confirmByKeys(c, 'eight_ball', T, 'A2', fail)) {
      const n0 = await c.eval(SHOTS);
      const i0 = await mark(c);
      const h = await holdEnter(c, () => c.eval(`window.__settings.get().game === 'eight_ball' && !document.documentElement.hasAttribute('data-ob-switching') && window.__shell.isOpen() === false && ${AIMING}`), 1000, 45000);
      await sleep(600);
      const n1 = await c.eval(SHOTS);
      const L = (await logSince(c, i0)).filter((e) => e.phase === 'cap' && e.type === 'keydown' && e.key === 'Enter');
      const late = L.filter((e) => e.repeat && !e.sw && e.tgt === 'shoot');
      const sawShield = L.some((e) => e.sw);
      if (!h.reached) fail(`${T} A2: the switch never completed under the held Enter`);
      else if (!late.length) fail(`${T} A2: UNJUDGEABLE — no repeat reached #shoot after the overlay (${J(L.slice(-4).map((e) => [e.tgt, e.repeat, e.sw]))})`);
      else if (n1 !== n0 || await activatedShoot(c, i0)) fail(`${T} A2: a held Enter on Continue activated Shoot after the switch (shots +${n1 - n0}; ${late.length} repeat(s) on #shoot)`);
      else log(`${T} A2: a held Enter (${h.reps} repeats; shield seen ${sawShield}; ${late.length} on #shoot after it) fired no shot`);
      await ctrlShot(c, T, 'A2', fail, log);
    }
    // PA: Enter held on the toolbar hall pill — opens the hall, never leaves it, never shoots
    if (want('PA')) {
      if (!(await toTable(c))) fail(`${T} PA: the table never came up`);
      else {
        await sleep(600);
        const n0 = await c.eval(SHOTS);
        await c.eval(`document.getElementById('ob-shell-open')?.focus(), true`);
        const i0 = await mark(c);
        const h = await holdEnter(c, () => c.eval(`window.__shell.isOpen() === true`), 1200, 8000);
        await sleep(600);
        const st = { open: await c.eval('window.__shell.isOpen()'), shots: (await c.eval(SHOTS)) - n0 };
        const L = (await logSince(c, i0)).filter((e) => e.phase === 'cap' && e.type === 'keydown' && e.repeat);
        const onQp = L.filter((e) => e.tgt === 'ob-shell-quickplay').length;
        if (!h.reached) fail(`${T} PA: Enter on the hall pill never opened the hall`);
        else if (!onQp) fail(`${T} PA: UNJUDGEABLE — no repeat reached the hall's quick-play (${J(L.slice(-4).map((e) => e.tgt))})`);
        else if (!st.open || st.shots !== 0) fail(`${T} PA: a held Enter on the hall pill left the hall or shot (${J(st)}; ${onQp} repeat(s) on quick-play)`);
        else log(`${T} PA: a held Enter on the hall pill opened the hall and stayed (${onQp} repeat(s) on quick-play swallowed)`);
      }
    }
    // ORPHAN: Continue by mouse (a press resets the key half), Enter pressed while the overlay stands (the
    // switch shield eats it — the guard never sees the press) and held 1 s past the overlay
    if (want('ORPHAN')) {
      const to = (await c.eval(`window.__settings.get().game`)) === 'eight_ball' ? 'nine_ball' : 'eight_ball';
      if (!(await openPlay(c))) fail(`${T} ORPHAN: the hall never landed at play`);
      else {
        await c.eval(`document.querySelector('[data-ob="play-game"][data-game="${to}"]')?.scrollIntoView({ inline: 'center', block: 'nearest' }), true`);
        const card = await restingCenter(c, `[data-ob="play-game"][data-game="${to}"]`);
        if (card && (await hitId(c, card)) === to) await press(c, card);
        else await c.eval(`void window.__play.pick('${to}'), true`);
        const acc = await restingCenter(c, '[data-ob="confirm-accept"]');
        if (!acc) fail(`${T} ORPHAN: no switch confirm`);
        else {
          await c.eval(`import('/app/ui/switchprogress.js').then(() => true, () => false)`);
          await sleep(300);
          const n0 = await c.eval(SHOTS);
          const i0 = await mark(c);
          await press(c, acc);
          const h = await holdEnter(c, () => c.eval(`window.__settings.get().game === '${to}' && !document.documentElement.hasAttribute('data-ob-switching') && window.__shell.isOpen() === false && ${AIMING}`), 1000, 45000);
          await sleep(600);
          const n1 = await c.eval(SHOTS);
          const L = (await logSince(c, i0)).filter((e) => e.phase === 'cap' && e.type === 'keydown' && e.key === 'Enter');
          const first = L[0];
          const late = L.filter((e) => e.repeat && !e.sw && e.tgt === 'shoot');
          if (!h.reached) fail(`${T} ORPHAN: the switch never completed`);
          else if (!first || !first.sw || !late.length) fail(`${T} ORPHAN: UNJUDGEABLE — the press was not made under the shield or no repeat reached #shoot after it (first ${J(first && [first.tgt, first.sw])}, late ${late.length})`);
          else if (n1 !== n0 || await activatedShoot(c, i0)) fail(`${T} ORPHAN: a key pressed under the switch shield and held past it activated Shoot (shots +${n1 - n0})`);
          else log(`${T} ORPHAN: a key pressed under the shield and held past it fired no shot (${late.length} orphan repeat(s) on #shoot)`);
        }
      }
    }
    await closeClient(c);
    // A1 + B1 under reduced motion (the confirm and the prompt close at once)
    c = await boot(PORT, CDP_PORT, { game: 'eight_ball', reduced: true });
    await noOverlay(c);
    for (let attempt = 1; attempt <= 3 && want('A1'); attempt++) {
      const to = attempt % 2 ? 'snooker' : 'eight_ball'; // snooker: the longest table build (the stamp claim needs a block >= 500 ms)
      if (!(await confirmByKeys(c, to, T, `A1#${attempt}`, fail))) break;
      const n0 = await c.eval(SHOTS);
      const i0 = await mark(c);
      const ts1 = epoch();
      await keyDown(c, 'Enter', { timestamp: ts1 });
      await keyUp(c, 'Enter', { timestamp: ts1 + 0.02 });
      await sleep(40 + 20 * attempt);
      await keyDown(c, 'Enter', { timestamp: ts1 + 0.05 });
      await keyUp(c, 'Enter', { timestamp: ts1 + 0.07 });
      await waitFor(c, `window.__settings.get().game === '${to}' && !document.documentElement.hasAttribute('data-ob-switching') && window.__shell.isOpen() === false && ${AIMING}`, 45000);
      await sleep(1500);
      const n1 = await c.eval(SHOTS);
      const L = (await logSince(c, i0)).filter((e) => e.phase === 'cap' && e.type === 'keydown' && e.key === 'Enter');
      const k1 = L[0], k2 = L[1];
      if (!k2) { fail(`${T} A1: the second Enter was never delivered`); break; }
      const gap = Math.round(k2.ts - k1.ts);
      if (k2.tgt !== 'shoot' || k2.sw) {
        log(`${T} A1#${attempt}: construction missed (kd2 on ${k2.tgt}, shield ${k2.sw}, stamp gap ${gap} ms) — retry`);
        if (n1 !== n0) fail(`${T} A1#${attempt}: a double Enter on Continue fired ${n1 - n0} shot(s) (kd2 on ${k2.tgt})`);
        await settled(c);
        if (attempt === 3) fail(`${T} A1: UNJUDGEABLE — the second Enter never landed on #shoot outside the shield in 3 tries`);
        continue;
      }
      // the stamp claim is judged only when kd2 was handled >= the window after kd1's stamp (a handler-clock
      // window would have let it through)
      const stampJudged = k2.at - k1.at >= CONT_MS; // a handler-clock window compares the two handlers' times
      const how = `kd2 on #shoot, stamp gap ${gap} ms, handled +${Math.round(k2.at - k1.at)} ms after kd1 was handled; stamp claim ${stampJudged ? 'JUDGED' : 'not judged (block < window)'}`;
      if (n1 !== n0 || await activatedShoot(c, i0)) fail(`${T} A1: a double Enter on Continue (reduced motion) activated Shoot (shots +${n1 - n0}; ${how})`);
      else log(`${T} A1: a double Enter on Continue fired no shot (${how})`);
      await ctrlShot(c, T, 'A1', fail, log);
      break;
    }
    // B1: a decision answered by Enter + a second Enter 50 ms later (reduced motion)
    if (want('B1')) {
      if (!(await toTable(c))) fail(`${T} B1: the table never came up`);
      else if (await stageScratch(c, T, 'B1', fail)) {
        await c.eval(`document.getElementById('shoot').focus(), true`);
        await key(c, 'Enter');
        const prompt = await waitFor(c, `(() => { const d = document.getElementById('hud-decision'); const a = document.activeElement;
          return d && getComputedStyle(d).display !== 'none' && d.contains(a); })()`, 60000);
        if (!prompt) fail(`${T} B1: UNJUDGEABLE — the break-foul prompt never took focus`);
        else {
          await sleep(1200);
          const n0 = await c.eval(SHOTS);
          const i0 = await mark(c);
          const ts1 = epoch();
          await keyDown(c, 'Enter', { timestamp: ts1 });
          await keyUp(c, 'Enter', { timestamp: ts1 + 0.02 });
          await sleep(50);
          await keyDown(c, 'Enter', { timestamp: ts1 + 0.05 });
          await keyUp(c, 'Enter', { timestamp: ts1 + 0.07 });
          await sleep(2000);
          const n1 = await c.eval(SHOTS);
          const pend = await c.eval(`window.__rules.matchState()?.pendingDecision ?? null`);
          const L = (await logSince(c, i0)).filter((e) => e.phase === 'cap' && e.type === 'keydown' && e.key === 'Enter');
          const k2 = L[1];
          const act = await activatedShoot(c, i0);
          if (pend) fail(`${T} B1: UNJUDGEABLE — the first Enter did not answer the decision`);
          else if (!k2 || k2.tgt !== 'shoot') fail(`${T} B1: UNJUDGEABLE — the second Enter landed on ${k2?.tgt ?? 'nothing'}, not the restored #shoot`);
          else if (act || n1 !== n0) fail(`${T} B1: a second Enter 50 ms after a decision answer activated the restored Shoot (shots +${n1 - n0})`);
          else log(`${T} B1: a second Enter 50 ms after the decision answer reached #shoot and activated nothing`);
          await settled(c);
          await ctrlShot(c, T, 'B1', fail, log);
        }
      }
    }
    // B1-SP: Space held 450 ms on the answer (Space acts on its keyup), then a second Space 150 ms after the
    // release on the restored #shoot — the window runs from the keyup
    if (want('B1-SP') && await toTable(c) && await stageScratch(c, T, 'B1-SP', fail)) {
      await c.eval(`document.getElementById('shoot').focus(), true`);
      await key(c, 'Enter');
      const prompt = await waitFor(c, `(() => { const d = document.getElementById('hud-decision'); const a = document.activeElement;
        return d && getComputedStyle(d).display !== 'none' && d.contains(a); })()`, 60000);
      if (!prompt) fail(`${T} B1-SP: UNJUDGEABLE — the break-foul prompt never took focus`);
      else {
        await sleep(1200);
        const n0 = await c.eval(SHOTS);
        const i0 = await mark(c);
        const ts1 = epoch();
        await keyDown(c, ' ', { timestamp: ts1 });
        await sleep(450);
        await keyUp(c, ' ', { timestamp: ts1 + 0.45 });
        await sleep(150);
        await keyDown(c, ' ', { timestamp: ts1 + 0.6 });
        await keyUp(c, ' ', { timestamp: ts1 + 0.62 });
        await sleep(2000);
        const n1 = await c.eval(SHOTS);
        const pend = await c.eval(`window.__rules.matchState()?.pendingDecision ?? null`);
        const LA = await logSince(c, i0);
        const L = LA.filter((e) => e.phase === 'cap' && e.type === 'keydown' && e.key === ' ');
        const k2 = L.filter((e) => !e.repeat)[1];
        const ku = LA.find((e) => e.phase === 'cap' && e.type === 'keyup' && e.key === ' ');
        const act = await activatedShoot(c, i0);
        const how = k2 && ku ? `stamp +${Math.round(k2.ts - ku.ts)} ms after the release, +${Math.round(k2.ts - L[0].ts)} ms after the press; `
          + `swallowed at window capture ${!LA.some((e) => e.phase === 'bub' && e.type === 'keydown' && e.at === k2.at)}` : '';
        if (pend) fail(`${T} B1-SP: UNJUDGEABLE — the held Space did not answer the decision`);
        else if (!k2 || k2.tgt !== 'shoot' || !ku) fail(`${T} B1-SP: UNJUDGEABLE — the second Space landed on ${k2?.tgt ?? 'nothing'}, not the restored #shoot (release seen ${!!ku})`);
        else if (act || n1 !== n0) fail(`${T} B1-SP: a second Space 150 ms after a held Space answered the decision activated the restored Shoot (shots +${n1 - n0}; ${how})`);
        else log(`${T} B1-SP: a second Space 150 ms after the held answer's release reached #shoot and activated nothing (${how})`);
        await settled(c);
      }
    }
    const errs = await errorsOf(c);
    if (errs.length) fail(`${T}: page errors ${J(errs)}`);
  } finally { await closeClient(c); }
}

/** 8-ball WPA, a break that scratches (the aim-HUD K5b staging): Shoot fires it, break_foul pends */
async function stageScratch(c, T, tag, fail) {
  if (await c.eval(`window.__rules.game()`) !== 'eight_ball') {
    if (await c.eval(`window.__settings.changeGame('eight_ball', { skipConfirm: true })`) !== true) { fail(`${T} ${tag}: changeGame(eight_ball) refused`); return false; }
    await waitFor(c, `window.__rules.game() === 'eight_ball' && ${AIMING}`, 30000);
  }
  await c.eval(`window.__settings.changeVariant('eight_ball', 'wpa-8ball')`).catch(() => null);
  await c.eval(`window.__test.rerack(1)`).catch(() => null);
  if (!(await waitFor(c, `(window.__rules.variant() === null || window.__rules.variant()?.preset !== 'apa-8ball') && ${AIMING}`, 20000))) { fail(`${T} ${tag}: 8-ball WPA never staged`); return false; }
  await c.eval(`window.__test.layout(${J([{ id: 0, x: 0.45, y: 1.0 }, { id: 1, x: -0.4, y: -0.8 }, { id: 8, x: -0.3, y: -0.5 }])})`);
  await c.eval(`window.__rules.setMatchState(${J({ phase: 'break', groups: null, shooter: 1, breaker: 1 })})`);
  await c.eval(`window.__test.aim(Math.atan2(1.2951447171389936 - 1.0, 0.6601447171389936 - 0.45)); window.__aim.setPower(1.5); window.__test.setElevation(0); window.__test.setTip(0, 0); true`);
  await sleep(300);
  return true;
}

// ---- 1068 ------------------------------------------------------------------
/** the hold starts from REAL focus on #shoot (a user who Tabs there holds it): re-focus until every sample across
 * FOCUS_HOLD_MS saw document.activeElement on #shoot, so a focus move the page still makes is outlasted; bounded by
 * FOCUS_SETTLE_MS plus one sample (the caller reports UNJUDGEABLE, never green) */
const FOCUS_SETTLE_MS = 10000, FOCUS_HOLD_MS = 300;
async function focusHeld(c) {
  const t0 = Date.now();
  let since = null, focusCalls = 0, last = null;
  while (Date.now() - t0 < FOCUS_SETTLE_MS) {
    last = await c.eval(`(() => { const s = document.getElementById('shoot'), on = !!s && document.activeElement === s; if (!on) s?.focus();
      return { on, ae: document.activeElement?.id || document.activeElement?.tagName, open: window.__shell?.isOpen?.() ?? null, disabled: s?.disabled ?? null }; })()`);
    if (!last.on) { since = null; focusCalls++; } else if (since === null) since = Date.now();
    else if (Date.now() - since >= FOCUS_HOLD_MS) return { held: true, focusCalls, ms: Date.now() - t0 };
    await sleep(50);
  }
  return { held: false, focusCalls, ms: Date.now() - t0, last };
}
async function leg1068({ PORT, CDP_PORT, fail, log }) {
  const T = 'CONT-1068';
  const c = await boot(PORT, CDP_PORT, { game: 'eight_ball' });
  try {
    if (!(await toTable(c))) { fail(`${T}: the table never came up`); return; }
    if (!(await stageScratch(c, T, 'H', fail))) return;
    const n0 = await c.eval(SHOTS);
    const i0 = await mark(c);
    const fh = await focusHeld(c);
    if (!fh.held) { fail(`${T} H: UNJUDGEABLE — #shoot never held focus for ${FOCUS_HOLD_MS} ms within ${FOCUS_SETTLE_MS} ms before the hold (${J(fh)})`); return; }
    const inPrompt = `(() => { const d = document.getElementById('hud-decision'); return !!d && getComputedStyle(d).display !== 'none' && d.contains(document.activeElement); })()`;
    const h = await holdEnter(c, () => c.eval(inPrompt), 1200, 60000);
    await sleep(800);
    const st = await c.eval(`({ shots: ${SHOTS} - ${n0}, pend: window.__rules.matchState()?.pendingDecision?.kind ?? null, state: window.__test.state(),
      inPrompt: ${inPrompt} })`);
    const L = await logSince(c, i0);
    const kd = L.find((e) => e.phase === 'cap' && e.type === 'keydown' && !e.repeat);
    const rep1 = L.find((e) => e.phase === 'cap' && e.type === 'keydown' && e.repeat);
    // the press's own activation: its click on #shoot survived to window bubble before the first repeat
    const pressed = !!kd && L.some((e) => e.type === 'click' && e.phase === 'bub' && e.tgt === 'shoot' && e.at >= kd.at && (!rep1 || e.at <= rep1.at));
    const reps = L.filter((e) => e.phase === 'cap' && e.type === 'keydown' && e.repeat && e.dec);
    if (kd?.tgt !== 'shoot') fail(`${T} H: UNJUDGEABLE — the press was not delivered to #shoot (${J({ press: kd ? [kd.tgt, kd.ae] : null, ...st })})`);
    else if (!pressed || st.shots === 0) fail(`${T} H: a held Enter on the focused #shoot fired no shot from its press (${J({ pressed, ...st })})`);
    else if (st.shots > 1 || (reps.length && !st.pend)) fail(`${T} H: a held Enter from the break answered the decision or shot again (${J(st)}; ${reps.length} repeat(s) on the prompt)`);
    else if (!h.reached) fail(`${T} H: UNJUDGEABLE — the break-foul prompt never took focus during the hold (${J(st)})`);
    else if (!reps.length) fail(`${T} H: UNJUDGEABLE — no repeat reached the decision prompt`);
    else log(`${T} H: a held Enter (${h.reps} repeats, ${reps.length} on the prompt) fired one shot and left ${st.pend} pending (focus held on #shoot after ${fh.focusCalls} focus call(s))`);
    // CTRL: a fresh Enter answers; focus reaches Shoot; a fresh Enter there shoots
    if (st.pend) {
      await sleep(1000);
      await key(c, 'Enter');
      const ok = await waitFor(c, `window.__rules.matchState()?.pendingDecision === null && ${AIMING}`, 10000);
      const ae = await waitFor(c, `document.activeElement?.id === 'shoot'`, 3000);
      if (!ok || !ae) fail(`${T} CTRL: a fresh Enter did not answer the prompt and return focus to #shoot (${J({ ok: !!ok, ae: !!ae })})`);
      else await ctrlShot(c, T, 'H', fail, log);
    }
    const errs = await errorsOf(c);
    if (errs.length) fail(`${T}: page errors ${J(errs)}`);
  } finally { await closeClient(c); }
}

// ---- DEC: the table decision prompt's pointer twin (review F4) -------------
async function legDecision({ PORT, CDP_PORT, fail, log }) {
  const T = 'CONT-DEC';
  const c = await boot(PORT, CDP_PORT, { game: 'eight_ball' });
  try {
    if (!(await toTable(c))) { fail(`${T}: the table never came up`); return; }
    const variants = [
      { tag: 'CTRL-1', gap: 0, counts: [1], reduced: true }, // the single-click control: where an answer alone leaves the table
      { tag: 'RM-R40', gap: 40, counts: [1, 2], reduced: true },
      { tag: 'R200-11', gap: 200, counts: [1, 1], reduced: false },
    ];
    let control = null;
    for (const v of variants) {
      await c.send('Emulation.setEmulatedMedia', { features: v.reduced ? [{ name: 'prefers-reduced-motion', value: 'reduce' }] : [] });
      if (!(await stageScratch(c, T, v.tag, fail))) return;
      await c.eval(`document.getElementById('shoot').click(), true`); // the break (scripted: the leg is about the answer)
      const opt = await waitFor(c, `(() => { const d = document.getElementById('hud-decision');
        const b = d && getComputedStyle(d).display !== 'none' ? d.querySelector('button') : null;
        if (!b) return null; const r = b.getBoundingClientRect(); return r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; })()`, 60000);
      if (!opt) { fail(`${T} ${v.tag}: UNJUDGEABLE — the break-foul prompt never presented an answer`); continue; }
      const P = await restingCenter(c, '#hud-decision button');
      await sleep(600); // the prompt's presentation arm (if any) has expired: only the answer's own continuation is judged
      const before = await c.eval(`({ phi: window.__test.bed().phi, cue: window.__test.balls()[0].pos.map((v) => Math.round(v * 1e6)) })`);
      const i0 = await mark(c);
      if (v.counts.length === 1) await press(c, P);
      else await double(c, P, v.gap, { counts: v.counts });
      await sleep(800);
      const after = await c.eval(`({ phi: window.__test.bed().phi, cue: window.__test.balls()[0].pos.map((v) => Math.round(v * 1e6)),
        state: window.__test.state(), pend: window.__rules.matchState()?.pendingDecision ?? null })`);
      const L = await logSince(c, i0);
      const downs = L.filter((e) => e.phase === 'cap' && e.type === 'pointerdown' && e.trusted);
      const click1 = L.find((e) => e.phase === 'cap' && e.type === 'click' && e.trusted);
      const d2 = downs[1];
      const end = { phi: after.phi, cue: after.cue, state: after.state };
      if (after.pend) fail(`${T} ${v.tag}: UNJUDGEABLE — the first click did not answer the decision`);
      else if (v.counts.length === 1) { control = end; log(`${T} ${v.tag}: a single click on the answer leaves ${J(end)} (the control)`); }
      else if (!control) fail(`${T} ${v.tag}: UNJUDGEABLE — no single-click control`);
      else if (!d2 || !click1 || d2.tgt !== 'CANVAS' || !(d2.ts - click1.ts < CONT_MS)) fail(`${T} ${v.tag}: UNJUDGEABLE — the second click was not delivered to the table canvas inside the window (${d2?.tgt ?? 'none'})`);
      else {
        const reached = L.some((e) => e.phase === 'bub' && e.type === 'pointerdown' && e.at >= d2.at);
        if (J(end) !== J(control) || reached) fail(`${T} ${v.tag}: the second click of a double-click on a decision answer reached the table (${J(control)} → ${J(end)}; press 2 reached window bubble ${reached})`);
        else log(`${T} ${v.tag}: the second click (+${Math.round(d2.ts - click1.ts)} ms after click 1) was delivered to the canvas and swallowed; the table equals the single-click control`);
      }
      await settled(c);
      await sleep(600);
    }
    await c.send('Emulation.setEmulatedMedia', { features: [] });
    const errs = await errorsOf(c);
    if (errs.length) fail(`${T}: page errors ${J(errs)}`);
  } finally { await closeClient(c); }
}

// ---- 986 -------------------------------------------------------------------
async function leg986({ PORT, CDP_PORT, fail, log }) {
  const T = 'CONT-986';
  const c = await boot(PORT, CDP_PORT, { game: 'nine_ball' });
  try {
    if (!(await toTable(c))) { fail(`${T}: the table never came up`); return; }
    if (await c.eval(`window.__settings.changeGame('ten_ball', { skipConfirm: true })`) !== true) { fail(`${T}: changeGame(ten_ball) refused`); return; }
    await waitFor(c, `window.__rules.game() === 'ten_ball' && ${AIMING}`, 30000);
    const PRE = `(() => { const b = document.getElementById('aw-push');
      return { phase: window.__rules.matchState()?.phase ?? null, inHud: !!b?.closest('#hud'), shown: !!b && b.getClientRects().length > 0 && getComputedStyle(b).visibility !== 'hidden',
        replay: document.getElementById('replay')?.disabled === false, state: window.__test.state(), rects: b ? b.getClientRects().length : -1,
        hallOpen: window.__shell?.isOpen?.() ?? null,
        disp: b?.style.display ?? null, vis: b?.style.visibility ?? null, cvis: b ? getComputedStyle(b).visibility : null }; })()`;
    const pushWindow = async (tag) => {
      let pre = null;
      for (let attempt = 1; attempt <= 3; attempt++) { // staging only: a break that does not open the window is re-dealt
        await toTable(c); // the boot hall can open after the first exit (body.ob-shell-open hides #hud)
        await c.eval(`window.__test.rerack(1), true`);
        await settled(c, 20000);
        await c.eval(`window.__test.shoot({ v0: 8, phi: Math.PI / 2, theta: 0, a: 0, b: 0 }), true`);
        await waitFor(c, `window.__test.state() === 'PLAYBACK'`, 5000, 50); // the stroke has begun (settled must not read the pre-shot AIM)
        if (!(await settled(c, 90000))) { fail(`${T} ${tag}: the break never settled`); return false; }
        await waitFor(c, `(() => { const p = ${PRE}; return p.phase === 'pushout' && p.inHud && p.shown && p.replay; })()`, 15000);
        await sleep(300);
        pre = await c.eval(PRE);
        if (pre.phase === 'pushout' && pre.inHud && pre.shown && pre.replay) return true;
        log(`${T} ${tag}: staging attempt ${attempt} did not reach the push-out window with the stance shown (${J(pre)})`);
      }
      fail(`${T} ${tag}: UNJUDGEABLE — not in the push-out window with the stance in the Shoot row (${J(pre)})`);
      return false;
    };
    const ROW = `(() => Object.fromEntries(['shoot', 'aw-push', 'replay', 'rerack'].map((id) => { const e = document.getElementById(id);
      const r = e?.getBoundingClientRect(); return [id, e && r.width ? [Math.round(r.x), Math.round(r.y), Math.round(r.width)] : null]; })))()`;
    const bed = () => c.eval(`(() => { const b = window.__test.bed(); return { seed: b.seed, shotIndex: b.shotIndex, phase: window.__rules.matchState()?.phase ?? null,
      confirm: !!document.querySelector('[data-ob="confirm"]') }; })()`);
    // C1: one click on Replay — nothing in the Shoot row moves; the point stays #replay
    if (!(await pushWindow('C1'))) return;
    await c.eval(`window.__test.setSlowmo(true), true`); // a long replay: the stance is judged while it runs
    const row0 = await c.eval(ROW);
    const P = await center(c, '#replay');
    await press(c, P);
    const seen = new Set();
    let moved = null;
    for (let i = 0; i < 25; i++) {
      seen.add(await hitId(c, P));
      const row = await c.eval(ROW);
      for (const id of ['shoot', 'aw-push', 'replay', 'rerack']) {
        if (row0[id] && row[id] && (Math.abs(row[id][0] - row0[id][0]) > 1 || Math.abs(row[id][1] - row0[id][1]) > 1)) moved ??= { id, from: row0[id], to: row[id] };
      }
      await sleep(16);
    }
    const inPb = await c.eval(`window.__test.state() === 'PLAYBACK'`);
    if (!inPb && !seen.size) fail(`${T} C1: UNJUDGEABLE — the click on Replay started no replay`);
    if (moved || [...seen].some((id) => id !== 'replay')) fail(`${T} C1: the Shoot row reflowed under the Replay click (moved ${J(moved)}; the point became ${J([...seen])})`);
    else log(`${T} C1: one click on Replay — no Shoot-row button moved; the point stayed #replay`);
    // C1-STANCE (card 38, D1 = B): during the replay the push-out stance is SHOWN in its aiming slot, disabled
    // (dimmed, inert, no focus stop); a real click on it changes nothing
    if (await c.eval(`window.__test.state() === 'PLAYBACK'`)) {
      const ST = `(() => { const b = document.getElementById('aw-push'); const r = b.getBoundingClientRect(), cs = getComputedStyle(b);
        return { shown: b.getClientRects().length > 0 && cs.visibility !== 'hidden' && cs.display !== 'none', disabled: b.disabled === true,
          rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width)], pressed: b.getAttribute('aria-pressed'), label: b.textContent.trim(),
          opacity: Number(cs.opacity) }; })()`;
      const st = await c.eval(ST);
      const sameSlot = !!row0['aw-push'] && Math.abs(st.rect[0] - row0['aw-push'][0]) <= 1 && Math.abs(st.rect[1] - row0['aw-push'][1]) <= 1;
      const SP = { x: st.rect[0] + st.rect[2] / 2, y: (await c.eval(`(() => { const r = document.getElementById('aw-push').getBoundingClientRect(); return r.y + r.height / 2; })()`)) };
      const i1 = await mark(c);
      await press(c, SP);
      await sleep(400);
      const after = await c.eval(`({ st: ${ST}, state: window.__test.state(), focus: document.activeElement?.id ?? null })`);
      const clicks = (await logSince(c, i1)).filter((e) => e.type === 'click' && e.phase === 'bub' && e.tgt === 'aw-push').length;
      if (!st.shown || !st.disabled || !sameSlot || !st.label) fail(`${T} C1: the push-out stance during the replay must be shown, disabled and in its aiming slot (${J({ ...st, aim: row0['aw-push'] })})`);
      else if (after.st.pressed !== st.pressed || after.state !== 'PLAYBACK' || after.focus === 'aw-push' || clicks) fail(`${T} C1: a click on the disabled push-out stance during the replay acted (${J({ before: st.pressed, after, clicks })})`);
      else log(`${T} C1-STANCE: during the replay the stance "${st.label}" is shown in its aiming slot, disabled (opacity ${st.opacity}); a real click on it changed nothing`);
    } else fail(`${T} C1: UNJUDGEABLE — the replay ended before the stance could be judged`);
    await c.eval(`window.__test.setSlowmo(false), true`);
    await settled(c, 90000);
    // R: a double-click on Replay keeps the frame
    if (!(await pushWindow('R'))) return;
    let b0 = await bed();
    let i0 = await mark(c);
    await double(c, await center(c, '#replay'), 30);
    await sleep(500);
    await settled(c);
    await sleep(400);
    let b1 = await bed();
    let downs = (await logSince(c, i0)).filter((e) => e.phase === 'cap' && e.type === 'pointerdown' && e.trusted);
    if (!downs[1]) fail(`${T} R: UNJUDGEABLE — the second press was never delivered`);
    else if (b1.seed !== b0.seed || b1.shotIndex !== b0.shotIndex || b1.phase !== 'pushout' || b1.confirm) fail(`${T} R: a double-click on Replay destroyed the frame (${J(b0)} → ${J(b1)}; press 2 on ${downs[1].tgt})`);
    else log(`${T} R: a double-click on Replay kept the frame (press 2 on ${downs[1].tgt})`);
    // R-LATE: a click at Replay's point 1 s into the replay keeps the frame
    await c.eval(`window.__test.setSlowmo(true), true`);
    b0 = await bed();
    const PL = await center(c, '#replay');
    await press(c, PL);
    await sleep(1000);
    if (!(await c.eval(`window.__test.state() === 'PLAYBACK'`))) fail(`${T} R-LATE: UNJUDGEABLE — the replay ended within 1 s`);
    else {
      i0 = await mark(c);
      const at = await hitId(c, PL);
      await press(c, PL);
      await sleep(500);
      await settled(c, 90000);
      await sleep(400);
      b1 = await bed();
      downs = (await logSince(c, i0)).filter((e) => e.phase === 'cap' && e.type === 'pointerdown' && e.trusted);
      if (!downs[0]) fail(`${T} R-LATE: UNJUDGEABLE — the late press was never delivered`);
      else if (b1.seed !== b0.seed || b1.shotIndex !== b0.shotIndex || b1.phase !== 'pushout' || b1.confirm) fail(`${T} R-LATE: a click at Replay's point 1 s into the replay destroyed the frame (the point was ${at}; ${J(b0)} → ${J(b1)})`);
      else log(`${T} R-LATE: a click at Replay's point 1 s into the replay kept the frame (the point was ${at})`);
    }
    // C2: a click on Re-rack's own centre during the replay re-racks (input reaches onRerack)
    b0 = await bed();
    await press(c, await center(c, '#replay'));
    await sleep(1000);
    if (!(await c.eval(`window.__test.state() === 'PLAYBACK'`))) fail(`${T} C2: UNJUDGEABLE — the replay ended within 1 s`);
    else {
      const RR = await center(c, '#rerack');
      await press(c, RR);
      await sleep(800);
      const conf = await c.eval(`!!document.querySelector('[data-ob="confirm"]')`);
      if (conf) { // the re-rack confirm: decline it with a real Cancel
        const cb = await restingCenter(c, '[data-ob="confirm-cancel"]');
        if (cb) await press(c, cb);
        log(`${T} C2: a click on Re-rack during the replay raised the re-rack confirm (declined)`);
      } else {
        b1 = await bed();
        if (b1.seed === b0.seed) fail(`${T} C2: UNJUDGEABLE — a click on Re-rack's own centre during the replay did nothing (${J(b0)} → ${J(b1)})`);
        else log(`${T} C2: a click on Re-rack's own centre during the replay re-racked (seed ${b0.seed} → ${b1.seed})`);
      }
    }
    await c.eval(`window.__test.setSlowmo(false), true`);
    const errs = await errorsOf(c);
    if (errs.length) fail(`${T}: page errors ${J(errs)}`);
  } finally { await closeClient(c); }
}

// ---- FL: the per-PR fastlane subset (one boot, DOM/data reads only) --------
async function legFast({ PORT, CDP_PORT, fail, log }) {
  const T = 'CONT-FL';
  const c = await boot(PORT, CDP_PORT, { game: 'nine_ball' });
  try {
    // #987: a double-click on the 8-Ball card leaves ONE confirm; the decline re-selects the committed card
    if (!(await openPlay(c))) { fail(`${T}: the hall never landed at play`); return; }
    const sel = `[data-ob="play-game"][data-game="eight_ball"]`;
    await c.eval(`document.querySelector(${J(sel)})?.scrollIntoView({ inline: 'center', block: 'nearest' }), true`);
    const P = await restingCenter(c, sel);
    if (!P || (await hitId(c, P)) !== 'eight_ball') fail(`${T} 987: UNJUDGEABLE — the 8-Ball card is not hit-testable`);
    else {
      let i0 = await mark(c);
      await double(c, P, 40);
      await sleep(700);
      const n = await c.eval(`document.querySelectorAll('[data-ob="confirm"]').length`);
      const L = await logSince(c, i0);
      const click1 = L.find((e) => e.phase === 'cap' && e.type === 'click' && e.trusted);
      const d2 = L.filter((e) => e.phase === 'cap' && e.type === 'pointerdown' && e.trusted)[1];
      if (!d2 || !click1 || !(d2.ts - click1.ts < CONT_MS)) fail(`${T} 987: UNJUDGEABLE — the double-click was not delivered inside the window`);
      else if (n !== 1) fail(`${T} 987: a double-click on a Play card must leave ONE switch confirm open — ${n} open (press 2 on ${d2.bd ? 'the backdrop' : d2.tgt})`);
      else log(`${T} 987: a double-click on the 8-Ball card leaves one confirm open`);
      if (n) {
        await sleep(650);
        const cb = await restingCenter(c, '[data-ob="confirm-cancel"]');
        if (cb) await press(c, cb);
        await waitFor(c, `!document.querySelector('[data-ob="confirm"]')`, 5000);
        await sleep(700);
        const f = await c.eval(`document.activeElement?.dataset?.game ?? null`);
        if (f !== 'nine_ball') fail(`${T} 987: after the decline focus must rest on the committed card (${f})`);
      }
    }
    // #988: a double-click on Back to the table keeps the aim
    if (!(await toTable(c))) { fail(`${T}: the table never came up`); return; }
    await c.eval(`window.__test.shoot({ v0: 1.2, phi: 0.3 }), true`);
    if (!(await settled(c))) { fail(`${T}: the setup shot never settled`); return; }
    await c.eval(`window.__test.aim(1.234), true`);
    const pill = await restingCenter(c, '#ob-shell-open');
    if (!pill) { fail(`${T} 988: no hall pill`); return; }
    await press(c, pill);
    await waitFor(c, `window.__shell.isOpen() && !window.__shell.moving()`, 20000);
    await sleep(700);
    const Q = await restingCenter(c, '#ob-shell-quickplay');
    const want = await c.eval('window.__test.bed().phi');
    let i0 = await mark(c);
    await double(c, Q, 40);
    await sleep(700);
    const got = await c.eval('window.__test.bed().phi');
    let L = await logSince(c, i0);
    const click1 = L.find((e) => e.phase === 'cap' && e.type === 'click' && e.trusted);
    const d2 = L.filter((e) => e.phase === 'cap' && e.type === 'pointerdown' && e.trusted)[1];
    if (!d2 || !click1 || d2.tgt !== 'CANVAS' || !(d2.ts - click1.ts < CONT_MS)) fail(`${T} 988: UNJUDGEABLE — the second press was not delivered to the canvas inside the window`);
    else if (Math.abs(got - want) > 1e-9) fail(`${T} 988: the double-click's second press re-aimed the shot (${want} → ${got})`);
    else log(`${T} 988: a double-click on Back to the table keeps the aim`);
    // #1044: Enter held on the hall pill opens the hall and never leaves it or shoots
    await sleep(600);
    const n0 = await c.eval(SHOTS);
    await c.eval(`document.getElementById('ob-shell-open')?.focus(), true`);
    i0 = await mark(c);
    const h = await holdEnter(c, () => c.eval(`window.__shell.isOpen() === true`), 1000, 8000);
    await sleep(500);
    const st = { open: await c.eval('window.__shell.isOpen()'), shots: (await c.eval(SHOTS)) - n0 };
    L = (await logSince(c, i0)).filter((e) => e.phase === 'cap' && e.type === 'keydown' && e.repeat && e.tgt === 'ob-shell-quickplay');
    if (!h.reached || !L.length) fail(`${T} 1044: UNJUDGEABLE — the hall never opened or no repeat reached its quick-play`);
    else if (!st.open || st.shots !== 0 || await activatedShoot(c, i0)) fail(`${T} 1044: a held Enter on the hall pill left the hall or activated Shoot (${J(st)})`);
    else log(`${T} 1044: a held Enter on the hall pill opened the hall and stayed`);
    const errs = await errorsOf(c);
    if (errs.length) fail(`${T}: page errors ${J(errs)}`);
  } finally { await closeClient(c); }
}

// staging (no judgement): the settings opened by a real click on the gear, on the table. The boot hall can reopen after
// the first exit and cover the gear — close it again and press the gear only when the gear is what the point hits.
async function settingsByGear(c) {
  const setOpen = `(() => { const s = document.getElementById('ob-settings'); return !!s && s.getClientRects().length > 0; })()`;
  let open = false, diag = null;
  for (let attempt = 1; attempt <= 3 && !open; attempt++) {
    if (!(await toTable(c))) { diag = 'the table never came up'; continue; }
    await sleep(800);
    const G = await restingCenter(c, '#ob-gear');
    const hit = G ? await c.eval(`!!document.elementFromPoint(${G.x}, ${G.y})?.closest('#ob-gear')`) : false;
    if (!G || !hit || (await c.eval('window.__shell.isOpen()'))) { diag = `gear ${G ? 'covered' : 'absent'}, hall open ${await c.eval('window.__shell.isOpen()')}`; continue; }
    await press(c, G);
    open = !!(await waitFor(c, setOpen, 10000));
    if (!open) diag = `a click on the gear opened no settings (hall open ${await c.eval('window.__shell.isOpen()')})`;
  }
  return { open, diag };
}

// ---- ESC: a keyboard dismissal never arms the pointer continuation (the batch-4 e2e-ui route) -----------
// Settings opened by a real click on the gear; a real click opens a kit select (A, at pa); Escape closes its popover, a
// second Escape closes the settings modal (a keyboard dismissal); a click at pa 350 ms after the click on A (stamped:
// inside the window, on the slop), now on the table, must act — it re-aims.
async function legEscape({ PORT, CDP_PORT, fail, log }) {
  const T = 'CONT-ESC';
  const c = await boot(PORT, CDP_PORT, { game: 'nine_ball' });
  try {
    const { open, diag } = await settingsByGear(c);
    if (!open) { fail(`${T}: UNJUDGEABLE — the settings never opened (${diag})`); return; }
    await sleep(800);
    let pa = null, sid = null;
    for (const sec of ['assists', 'display', 'language', 'about']) {
      await c.eval(`window.__settings.show('${sec}'), true`);
      await sleep(250);
      const r = await c.eval(`(() => { const s = [...document.querySelectorAll('#ob-settings select')].find((x) => x.nextElementSibling?.dataset?.ob === 'select-button'
          && x.nextElementSibling.getClientRects().length > 0); if (!s) return null; const b = s.nextElementSibling; b.scrollIntoView({ block: 'center' });
        const q = b.getBoundingClientRect(); return { id: s.id, x: q.left + q.width / 2, y: q.top + q.height / 2 }; })()`);
      if (r) { pa = { x: r.x, y: r.y }; sid = r.id; break; }
    }
    if (!pa) { fail(`${T}: UNJUDGEABLE — no kit select in the settings`); return; }
    await sleep(400);
    const phi0 = await c.eval('window.__test.bed().phi');
    const listOpen = `[...document.querySelectorAll('[data-ob="select-list"]')].some((e) => e.getClientRects().length > 0)`;
    const i0 = await mark(c);
    const ts0 = epoch();
    await press(c, pa, { hold: 20, ts: ts0 });
    const opened = await waitFor(c, listOpen, 3000, 20);
    await keyDown(c, 'Escape', { timestamp: ts0 + 0.1 });
    await keyUp(c, 'Escape', { timestamp: ts0 + 0.11 });
    await waitFor(c, `!${listOpen}`, 3000, 20);
    await keyDown(c, 'Escape', { timestamp: ts0 + 0.2 });
    await keyUp(c, 'Escape', { timestamp: ts0 + 0.21 });
    const closed = await waitFor(c, `(() => { const s = document.getElementById('ob-settings'); return !s || s.getClientRects().length === 0; })()`, 3000, 20);
    await sleep(100);
    await press(c, pa, { hold: 20, ts: ts0 + 0.35 });
    await sleep(700);
    const phi1 = await c.eval('window.__test.bed().phi');
    const L = await logSince(c, i0);
    const click1 = L.find((e) => e.phase === 'cap' && e.type === 'click' && e.trusted);
    const d2 = L.filter((e) => e.phase === 'cap' && e.type === 'pointerdown' && e.trusted)[1];
    if (!opened || !closed || !click1 || !d2 || d2.tgt !== 'CANVAS' || !(d2.ts - click1.ts < CONT_MS)) {
      fail(`${T}: UNJUDGEABLE — construction (${sid}: popover opened ${!!opened}, settings closed by Escape ${!!closed}, press 2 on ${d2?.tgt ?? 'none'} +${d2 && click1 ? Math.round(d2.ts - click1.ts) : '?'} ms)`);
    } else if (phi1 === phi0) fail(`${T}: a click at the select's point after the settings were closed by Escape (+${Math.round(d2.ts - click1.ts)} ms after the click that opened ${sid}) was swallowed — a keyboard dismissal must not arm the continuation`);
    else log(`${T}: after Escape closed ${sid}'s popover and the settings, a click at the same point +${Math.round(d2.ts - click1.ts)} ms after the opening click acted (re-aimed)`);
    const errs = await errorsOf(c);
    if (errs.length) fail(`${T}: page errors ${J(errs)}`);
  } finally { await closeClient(c); }
}

// ---- SEL: an exiting kit-select popover takes no input (the batch-4 e2e-ui cascade, ui/select.js) -------------
// A real click opens kit select A whose list covers the trigger of the next select B; Escape closes A and a real click
// on B's trigger follows in the same burst (stamped 30 ms after the Escape), while A's list is still in its exit tween
// (asserted from the page's record). B must open and A must keep its value: before the fix the click landed on A's
// exiting list and committed one of A's options (e2e-ui: "popover never opened", then the settings cascade).
// LOAD-PROOF (the 10-25 shake-down at load1 43-45 went UNJUDGEABLE: A's list had left before the press arrived). The
// burst's CDP sends all leave before any reply is awaited, so driver round trips cannot stretch the Escape -> press gap
// past A's exit tween (ui/select.js: motion.T_FAST, 120 ms, longer on a loaded box). A FIRED burst whose press finds
// A's own list already gone is a miss: it is judged only on A's value (which must never move), and the arm re-stages A
// and fires again, up to SEL_BURSTS bursts. A re-stage that fails is recorded apart from the misses. Only a burst whose
// press found A's list still in the DOM is judged in full; a FAIL is judged on its own burst, never fired again. The
// lines print the delivery gap on the page's clock (the stamps always say 30 ms).
const SEL_BURSTS = 4;
async function legSelect({ PORT, CDP_PORT, fail, log }) {
  const T = 'CONT-SEL';
  const c = await boot(PORT, CDP_PORT, { game: 'nine_ball' });
  try {
    const { open, diag } = await settingsByGear(c);
    if (!open) { fail(`${T}: UNJUDGEABLE — the settings never opened (${diag})`); return; }
    await sleep(800);
    const anyList = `document.querySelectorAll('[data-ob="select-list"]').length`;
    let pair = null;
    for (const sec of ['assists', 'display', 'language', 'about']) {
      if (pair) break;
      await c.eval(`window.__settings.show('${sec}'), true`);
      await sleep(250);
      const ids = await c.eval(`[...document.querySelectorAll('#ob-settings select')].filter((s) => s.nextElementSibling?.dataset?.ob === 'select-button'
        && s.nextElementSibling.getClientRects().length > 0).map((s) => s.id).filter(Boolean)`);
      for (let i = 0; i + 1 < ids.length && !pair; i++) {
        const [A, B] = [ids[i], ids[i + 1]];
        const pts = await c.eval(`(() => { const a = document.getElementById(${J(A)}).nextElementSibling; a.scrollIntoView({ block: 'center' });
          const b = document.getElementById(${J(B)}).nextElementSibling, ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
          return { pa: { x: ra.left + ra.width / 2, y: ra.top + ra.height / 2 }, pb: { x: rb.left + rb.width / 2, y: rb.top + rb.height / 2 } }; })()`);
        await sleep(300);
        await press(c, pts.pa, { hold: 20 });
        if (!(await waitFor(c, `!!document.getElementById(${J('ob-select-list-' + A)})`, 3000, 20))) continue;
        await sleep(400); // A's entrance tween settles
        const covered = await c.eval(`document.elementFromPoint(${pts.pb.x}, ${pts.pb.y})?.closest('[data-ob="select-list"]')?.id === ${J('ob-select-list-' + A)}`);
        if (covered) { pair = { A, B, ...pts }; break; }
        await key(c, 'Escape');
        await waitFor(c, `${anyList} === 0`, 3000, 20);
        await sleep(300);
      }
    }
    if (!pair) { fail(`${T}: UNJUDGEABLE — no kit select whose open list covers the next select's trigger`); return; }
    const { A, B, pa, pb } = pair;
    const listA = 'ob-select-list-' + A;
    const v0 = await c.eval(`document.getElementById(${J(A)}).value`);
    const settingsUp = `(() => { const s = document.getElementById('ob-settings'); return !!s && s.getClientRects().length > 0; })()`;
    const misses = []; // FIRED bursts whose press found A's list gone (each judged on A's value only)
    const restage = []; // re-stages that failed before their burst could fire
    const earlier = () => [misses.length && `missed ${J(misses)}`, restage.length && `re-stage failed ${J(restage)}`].filter(Boolean).join('; ');
    let done = false;
    for (let burst = 1; burst <= SEL_BURSTS && !done; burst++) {
      if (burst > 1) { // re-stage: close the list the missed burst left open (B, opened the plain way), then A over B again
        if (await c.eval(`${anyList} > 0`)) { // only then: with no list open, Escape would close the settings (CONT-ESC)
          await key(c, 'Escape');
          if (!(await waitFor(c, `${anyList} === 0`, 3000, 20))) { restage.push({ burst, why: 'a list never closed' }); continue; }
        }
        if (!(await c.eval(settingsUp))) {
          done = true;
          fail(`${T}: UNJUDGEABLE — the settings closed while re-staging burst ${burst} (${earlier()})`);
          break;
        }
        await sleep(300);
        await press(c, pa, { hold: 20 });
        if (!(await waitFor(c, `!!document.getElementById(${J(listA)})`, 3000, 20))) { restage.push({ burst, why: 'A never reopened' }); continue; }
        await sleep(400); // A's entrance tween settles
        if (!(await c.eval(`document.elementFromPoint(${pb.x}, ${pb.y})?.closest('[data-ob="select-list"]')?.id === ${J(listA)}`))) {
          restage.push({ burst, why: 'A no longer covers B' });
          continue;
        }
      }
      const i0 = await mark(c);
      const ts0 = epoch();
      // ONE pipelined burst (keyDown/keyUp and c.send each write their frame before their first await): Escape, its
      // keyUp stamped +10 ms, the press stamped +30 ms (mouseMoved +25 ms, as press() stamps it), the release +40 ms
      const mouse = (type, extra) => c.send('Input.dispatchMouseEvent', { type, x: pb.x, y: pb.y, pointerType: 'mouse', ...extra });
      await Promise.all([
        keyDown(c, 'Escape', { timestamp: ts0 }),
        keyUp(c, 'Escape', { timestamp: ts0 + 0.01 }),
        mouse('mouseMoved', { timestamp: ts0 + 0.025 }),
        mouse('mousePressed', { button: 'left', buttons: 1, clickCount: 1, timestamp: ts0 + 0.03 }),
      ]);
      await sleep(10);
      await mouse('mouseReleased', { button: 'left', buttons: 0, clickCount: 1, timestamp: ts0 + 0.04 });
      await sleep(700);
      const st = await c.eval(`(() => ({ v1: document.getElementById(${J(A)}).value, bOpen: !!document.getElementById(${J('ob-select-list-' + B)}),
        bExp: document.getElementById(${J(B)}).nextElementSibling.getAttribute('aria-expanded') }))()`);
      const L = await logSince(c, i0);
      const kd = L.find((e) => e.phase === 'cap' && e.type === 'keydown' && e.key === 'Escape');
      const pd = L.find((e) => e.phase === 'cap' && e.type === 'pointerdown' && e.trusted);
      const gap = kd && pd ? Math.round(pd.at - kd.at) : null; // delivery gap on the page's clock (diagnostic only)
      // the ORDER comes from the record's positions (the logger appends in delivery order), never from a rounded gap: a
      // press handled up to 0.5 ms before its Escape would round to 0 and pass (review r1 on d4df99f9)
      if (kd && pd && L.indexOf(pd) < L.indexOf(kd)) { // the press was handled before the Escape: another case, not this one
        done = true;
        fail(`${T}: UNJUDGEABLE — burst ${burst}'s press was delivered BEFORE its Escape (${(pd.at - kd.at).toFixed(1)} ms; instrument order)`);
        break;
      }
      if (kd && pd && (pd.lsid ?? []).includes(listA)) { // the precondition held: THIS burst is the verdict
        done = true;
        const at = `burst ${burst}, delivered ${gap} ms after the Escape${misses.length || restage.length ? `; earlier: ${earlier()}` : ''}`;
        if (!st.bOpen || st.v1 !== v0) {
          fail(`${T}: a click on ${B}'s trigger ${Math.round(pd.ts - kd.ts)} ms after Escape closed ${A}'s popover landed on ${A}'s exiting list (pointerdown on ${pd.tgt}; ${A} ${J(v0)} -> ${J(st.v1)}; ${B} open ${st.bOpen}; ${at}) — an exiting popover must take no input`);
        } else log(`${T}: a click on ${B}'s trigger ${Math.round(pd.ts - kd.ts)} ms after Escape closed ${A}'s popover (its list still leaving: ${pd.ls} in the DOM) opened ${B}; ${A} kept ${J(v0)} (${at})`);
        break;
      }
      const miss = { burst, escape: !!kd, press: pd?.tgt ?? null, lists: pd?.ls ?? null, gap, bOpen: st.bOpen };
      if (st.v1 !== v0) { // whatever the timing, A's value must never move
        done = true;
        fail(`${T}: ${A} changed ${J(v0)} -> ${J(st.v1)} on a burst whose press found its list gone (${J(miss)})`);
        break;
      }
      misses.push(miss);
    }
    if (!done) fail(`${T}: UNJUDGEABLE — the click on ${B} did not arrive while ${A}'s list was leaving in any of ${SEL_BURSTS} bursts (${earlier()})`);
    await key(c, 'Escape');
    const errs = await errorsOf(c);
    if (errs.length) fail(`${T}: page errors ${J(errs)}`);
  } finally { await closeClient(c); }
}

// ---- 1072: a double-click on Re-rack inside the 10-ball push-out window (desktop, fine pointer) ----------------
// #1072 (traced on 40741402, before #990 and #1009): click 1 re-racked at once, the stance left the Shoot row on the
// next frame and the Slow-mo row rose under the pointer, so click 2 flipped Slow-mo. The leg records the route click 1
// takes and judges each: the CONFIRM route (#990: Re-rack asks on a progressed rack; the confirm's presentation arms
// the continuation guard) must leave ONE confirm, the rack and Slow-mo unchanged, and a real Continue then re-racks
// once; the DIRECT route (a one-click re-rack) must re-rack once and leave Slow-mo unchanged. R-CTR presses Re-rack's
// centre; R-EDGE presses the part of Re-rack's box a Slow-mo control occupies once the stance has left (measured on the
// same layout before the break); SM-C1 is the control: after the re-rack a deliberate click on the toggle flips it.
async function leg1072({ PORT, CDP_PORT, fail, log }) {
  const T = 'CONT-1072';
  const c = await boot(PORT, CDP_PORT, { game: 'nine_ball' });
  try {
    if (!(await toTable(c))) { fail(`${T}: the table never came up`); return; }
    if (await c.eval(`window.__settings.changeGame('ten_ball', { skipConfirm: true })`) !== true) { fail(`${T}: changeGame(ten_ball) refused`); return; }
    await waitFor(c, `window.__rules.game() === 'ten_ball' && ${AIMING}`, 30000);
    const PRE = `(() => { const b = document.getElementById('aw-push');
      return { phase: window.__rules.matchState()?.phase ?? null, inHud: !!b?.closest('#hud'), shown: !!b && b.getClientRects().length > 0 && getComputedStyle(b).visibility !== 'hidden',
        state: window.__test.state(), hallOpen: window.__shell?.isOpen?.() ?? null }; })()`;
    const RECT = (sel) => `(() => { const e = document.querySelector(${J(sel)}); if (!e) return null; const r = e.getBoundingClientRect();
      return r.width && r.height ? { x: r.left, y: r.top, w: r.width, h: r.height } : null; })()`;
    const SM = `document.getElementById('slowmo').checked`;
    const bed = () => c.eval(`(() => { const b = window.__test.bed(); return { seed: b.seed, phase: window.__rules.matchState()?.phase ?? null,
      confirms: document.querySelectorAll('[data-ob="confirm"]').length, sm: ${SM}, stance: document.getElementById('aw-push')?.style.display ?? null }; })()`);
    // staging (no judgement): the stance-hidden layout before the break = the layout after the re-rack; then the window
    let T0 = null, L0 = null;
    const pushWindow = async (tag) => {
      let pre = null;
      for (let attempt = 1; attempt <= 3; attempt++) { // a break that does not open the window is re-dealt (seed = attempt)
        await toTable(c); // the boot hall can open after the first exit (body.ob-shell-open hides #hud)
        await c.eval(`window.__test.rerack(${attempt}), true`);
        await settled(c, 20000);
        await sleep(300);
        if (!T0) { // the Slow-mo toggle and its label with the stance hidden (shot 0: no window)
          if ((await c.eval(PRE)).shown) { fail(`${T} ${tag}: UNJUDGEABLE — the stance is shown before the break`); return false; }
          T0 = await c.eval(RECT('#hud .ob-toggle'));
          L0 = await c.eval(RECT('#hud label[for="slowmo"]'));
        }
        await c.eval(`window.__test.setSlowmo(false), true`);
        await c.eval(`window.__test.shoot({ v0: 8, phi: Math.PI / 2, theta: 0, a: 0, b: 0 }), true`);
        await waitFor(c, `window.__test.state() === 'PLAYBACK'`, 5000, 50);
        if (!(await settled(c, 90000))) { fail(`${T} ${tag}: the break never settled`); return false; }
        await waitFor(c, `(() => { const p = ${PRE}; return p.phase === 'pushout' && p.inHud && p.shown; })()`, 15000);
        await sleep(400);
        pre = await c.eval(PRE);
        if (pre.phase === 'pushout' && pre.inHud && pre.shown) return true;
        log(`${T} ${tag}: staging attempt ${attempt} did not reach the push-out window with the stance shown (${J(pre)})`);
      }
      fail(`${T} ${tag}: UNJUDGEABLE — not in the push-out window with the stance in the Shoot row (${J(pre)})`);
      return false;
    };
    const accept = async (tag) => { // a real Continue on the confirm, after its presentation arm expired
      await sleep(650);
      const ap = await restingCenter(c, '[data-ob="confirm-accept"]');
      if (!ap) { fail(`${T} ${tag}: UNJUDGEABLE — the confirm has no Continue to press`); return false; }
      await press(c, ap);
      await waitFor(c, `!document.querySelector('[data-ob="confirm"]')`, 5000, 50);
      await settled(c, 20000);
      await sleep(500); // the stance leaves on a frame after the re-rack
      return true;
    };
    const gesture = async (tag, pointOf, retry = 1) => { // stages the window, then presses where pointOf() says
      if (!(await pushWindow(tag))) return;
      const b0 = await bed();
      const R0 = await c.eval(RECT('#rerack'));
      const pt = R0 ? await pointOf(R0) : null;
      if (!pt) { if (!R0) fail(`${T} ${tag}: UNJUDGEABLE — no Re-rack in the Shoot row`); return; }
      const { P, where } = pt;
      const i0 = await mark(c);
      await double(c, P, 150, { counts: [1, 2] });
      await sleep(700);
      const b1 = await bed();
      const L = await logSince(c, i0);
      const downs = L.filter((e) => e.phase === 'cap' && e.type === 'pointerdown' && e.trusted);
      const click1 = L.find((e) => e.phase === 'cap' && e.type === 'click' && e.trusted);
      const added = L.find((e) => e.type === 'added' && e.sel === 'confirm');
      const d2 = downs[1];
      const dt = d2 && click1 ? Math.round(d2.ts - click1.ts) : null;
      if (!R0 || !downs[0] || downs[0].tgt !== 'rerack' || !click1 || !d2 || !(dt < CONT_MS)) {
        fail(`${T} ${tag}: UNJUDGEABLE — the double-click on Re-rack (${where}) was not delivered as built (${J({ d1: downs[0]?.tgt ?? null, click1: !!click1, d2: d2?.tgt ?? null, dt })})`);
        return;
      }
      const on = d2.bd ? 'the backdrop' : d2.tgt;
      if (b1.sm !== b0.sm) { fail(`${T} ${tag}: a double-click on Re-rack flipped Slow-mo (${b0.sm} -> ${b1.sm}; press 2 +${dt} ms after click 1 on ${on}${d2.sm ? ', a Slow-mo control' : ''})`); return; }
      if (added || b1.confirms) { // the confirm route (#990)
        if (!added || !(d2.at > added.at) || !d2.bd) { // e.g. the first confirm of the boot imported its kit late
          const why = J({ on, added: !!added, after: !!added && d2.at > added.at });
          if (b1.confirms) { const cb = await restingCenter(c, '[data-ob="confirm-cancel"]'); if (cb) { await sleep(650); await press(c, cb); await sleep(500); } }
          if (retry > 0) { log(`${T} ${tag}: press 2 did not reach the confirm's backdrop after it was shown (${why}) — staged again`); return gesture(tag, pointOf, retry - 1); }
          fail(`${T} ${tag}: UNJUDGEABLE — press 2 did not reach the confirm's backdrop after it was shown (${why})`); return;
        }
        if (b1.confirms !== 1 || b1.seed !== b0.seed) { fail(`${T} ${tag}: a double-click on Re-rack must leave ONE re-rack confirm open and the rack unchanged — ${b1.confirms} open, seed ${b0.seed} -> ${b1.seed} (press 2 +${dt} ms after click 1 on ${on})`); return; }
        if (!(await accept(tag))) return;
        const b2 = await bed();
        if (b2.seed !== b0.seed + 1 || b2.confirms || b2.phase === 'pushout' || b2.sm !== b0.sm) { fail(`${T} ${tag}: Continue must re-rack once and leave Slow-mo unchanged (${J({ b0, b2 })})`); return; }
        log(`${T} ${tag}: a double-click on Re-rack (${where}) left one confirm (press 2 +${dt} ms after click 1 on ${on}); Continue re-racked once (seed ${b0.seed} -> ${b2.seed}, stance ${b2.stance === 'none' ? 'left the row' : J(b2.stance)}); Slow-mo stayed ${b2.sm}`);
        return;
      }
      if (b1.seed === b0.seed) { fail(`${T} ${tag}: UNJUDGEABLE — click 1 on Re-rack neither re-racked nor asked (${J({ b0, b1 })})`); return; }
      // the direct route: one re-rack; press 2 must have met a Slow-mo control for the trap to be built
      if (!d2.sm) { fail(`${T} ${tag}: UNJUDGEABLE — press 2 landed on ${on}, not a Slow-mo control (the layout put no toggling control at the press point; seed ${b0.seed} -> ${b1.seed})`); return; }
      if (b1.seed !== b0.seed + 1) { fail(`${T} ${tag}: a double-click on Re-rack re-racked ${b1.seed - b0.seed} times (seed ${b0.seed} -> ${b1.seed})`); return; }
      log(`${T} ${tag}: a one-click re-rack (${where}); press 2 +${dt} ms after click 1 met ${on} (a Slow-mo control) and Slow-mo stayed ${b1.sm}`);
    };
    // R-CTR: Re-rack's centre
    if (want('R-CTR')) await gesture('R-CTR', async (R0) => ({ P: { x: R0.x + R0.w / 2, y: R0.y + R0.h / 2 }, where: 'its centre' }));
    // R-EDGE: inside Re-rack's box where a Slow-mo control lies once the stance has left (staging measures both)
    if (want('R-EDGE')) await gesture('R-EDGE', async (R0) => {
      if (!T0) { fail(`${T} R-EDGE: UNJUDGEABLE — the Slow-mo toggle was never measured`); return null; }
      const cut = (a) => (a && R0 ? { x0: Math.max(a.x, R0.x) + 3, y0: Math.max(a.y, R0.y) + 3, x1: Math.min(a.x + a.w, R0.x + R0.w) - 3, y1: Math.min(a.y + a.h, R0.y + R0.h) - 3 } : null);
      const area = [cut(T0), cut(L0)].find((q) => q && q.x1 > q.x0 && q.y1 > q.y0);
      if (!area) log(`${T} R-EDGE: no Slow-mo control lies under Re-rack's box once the stance has left (Re-rack ${J(R0)}, toggle ${J(T0)}, label ${J(L0)}) — the press goes to the toggle's nearest point inside Re-rack`);
      const P = area ? { x: (area.x0 + area.x1) / 2, y: (area.y0 + area.y1) / 2 }
        : { x: Math.min(Math.max(T0.x + T0.w / 2, R0.x + 3), R0.x + R0.w - 3), y: Math.min(Math.max(T0.y + T0.h / 2, R0.y + 3), R0.y + R0.h - 3) };
      return { P, where: area ? 'over the Slow-mo control\'s post-reflow box' : 'its nearest point to the toggle' };
    });
    // BD-C1 (the control for the confirm route): a single click on Re-rack, then one backdrop click after the
    // presentation arm expired, cancels the confirm and keeps the rack — so in R-CTR / R-EDGE the guard held press 2
    if (want('BD-C1')) {
      if (await pushWindow('BD-C1')) {
        const b0 = await bed();
        await press(c, await center(c, '#rerack'));
        if (!(await waitFor(c, `!!document.querySelector('[data-ob="confirm"]')`, 5000, 50))) fail(`${T} BD-C1: UNJUDGEABLE — a click on Re-rack inside the window raised no confirm`);
        else {
          await sleep(650);
          const bp = await c.eval(`(() => { const bd = document.querySelector('.ob-backdrop'), p = document.querySelector('[data-ob="confirm"]'); if (!bd || !p) return null;
            const r = p.getBoundingClientRect(); for (const [x, y] of [[r.left - 40, r.top + r.height / 2], [r.right + 40, r.top + r.height / 2], [r.left + r.width / 2, r.top - 40]]) {
              const e = document.elementFromPoint(x, y); if (e && bd.contains(e)) return { x, y }; } return null; })()`);
          if (!bp) fail(`${T} BD-C1: UNJUDGEABLE — no backdrop point beside the confirm`);
          else {
            await press(c, bp);
            await waitFor(c, `!document.querySelector('[data-ob="confirm"]')`, 3000, 50);
            await sleep(400);
            const b1 = await bed();
            if (b1.confirms || b1.seed !== b0.seed) fail(`${T} BD-C1: a single backdrop click on the re-rack confirm must cancel it and keep the rack (${J({ b0, b1 })})`);
            else log(`${T} BD-C1: a single backdrop click on the re-rack confirm cancelled it; the rack stayed (seed ${b1.seed})`);
          }
        }
      }
    }
    // SM-C1 (the control): after a re-rack a deliberate click on the toggle's own centre flips Slow-mo
    if (want('SM-C1')) {
      if (!(await pushWindow('SM-C1'))) return;
      const b0 = await bed();
      await press(c, await center(c, '#rerack'));
      await sleep(700);
      if ((await bed()).confirms) { if (!(await accept('SM-C1'))) return; } else { await settled(c, 20000); await sleep(500); }
      await sleep(600);
      const TC = await restingCenter(c, '#hud .ob-toggle__track');
      if (!TC) { fail(`${T} SM-C1: UNJUDGEABLE — no Slow-mo toggle`); return; }
      const i0 = await mark(c);
      await press(c, TC);
      await sleep(400);
      const b1 = await bed();
      const d = (await logSince(c, i0)).find((e) => e.phase === 'cap' && e.type === 'pointerdown' && e.trusted);
      if (!d || !d.sm) fail(`${T} SM-C1: UNJUDGEABLE — the press did not land on the Slow-mo toggle (${d?.tgt ?? 'none'})`);
      else if (b1.seed !== b0.seed + 1) fail(`${T} SM-C1: UNJUDGEABLE — the single click and Continue did not re-rack once (${J({ b0, b1 })})`);
      else if (b1.sm === b0.sm) fail(`${T} SM-C1: a deliberate click on Slow-mo's toggle after the re-rack did not flip it`);
      else log(`${T} SM-C1: after the re-rack a deliberate click on Slow-mo's toggle flipped it (${b0.sm} -> ${b1.sm})`);
      await c.eval(`window.__test.setSlowmo(false), true`);
    }
    const errs = await errorsOf(c);
    if (errs.length) fail(`${T}: page errors ${J(errs)}`);
  } finally { await closeClient(c); }
}

// ---- CUE: double-clicks on a kit select's list (the HUD cue picker; desktop, fine pointer) -----------------------
// The HUD cue picker (#cue-select, a kit select above the Shoot row) opens its list over the Shoot row and the rows
// below; on the desktop floor (1024x640) the list does not fit below and is clamped over its own trigger. A kit list
// that opens or leaves under the pointer is announced to the continuation guard (ui/select.js 'ob:popover' /
// 'ob:dismissed'), so the rest of a double-click never reaches what lies under it:
//   CUE-DBL   a real double-click on the option over Shoot's centre picks the cue; press 2 (+150 ms) fires no shot and
//             activates nothing underneath (main before the fix: the shot fired);
//   CUE-CTRL  then a deliberate click on Shoot 700 ms later shoots (the arm is a 500 ms window, not a lock);
//   CUE-FAST  a quick pick — the trigger, then an option far from it 250 ms later — commits (only a near press is held);
//   CUE-OPEN  at 1024x640 a real double-click on the trigger opens the list; press 2 lands on an option and must not
//             pick it (main before the fix: an unintended cue swap);
//   CUE-OPEN-CTRL  at 1024x640 the trigger, then the option under the same point 700 ms later — it is picked.
async function legCue({ PORT, CDP_PORT, fail, log }) {
  const T = 'CONT-CUE';
  const c = await boot(PORT, CDP_PORT, { game: 'nine_ball' });
  try {
    if (!(await toTable(c))) { fail(`${T}: the table never came up`); return; }
    const LIST = 'ob-select-list-cue-select';
    const TRIG = `(() => { const s = document.getElementById('cue-select'), b = s?.nextElementSibling;
      return !!b && b.dataset.ob === 'select-button' && !document.getElementById('cue-row').hidden && b.getClientRects().length > 0; })()`;
    if (!(await waitFor(c, TRIG, 20000))) { fail(`${T}: UNJUDGEABLE — no kit cue picker in the HUD`); return; }
    await sleep(600);
    const val = () => c.eval(`document.getElementById('cue-select').value`);
    const listOpen = () => c.eval(`!!document.getElementById(${J(LIST)})`);
    const closeList = async () => { if (await listOpen()) { await key(c, 'Escape'); await waitFor(c, `!document.getElementById(${J(LIST)})`, 3000, 20); await sleep(300); } };
    const trig = () => center(c, '#cue-select + [data-ob="select-button"]');
    const openList = async () => {
      await press(c, await trig());
      if (!(await waitFor(c, `!!document.getElementById(${J(LIST)})`, 3000, 20))) return false;
      await sleep(500); // the entrance tween settles
      return true;
    };
    const optAt = (p) => c.eval(`(() => { const e = document.elementFromPoint(${p.x}, ${p.y}); const li = e?.closest?.('[data-ob="option"]');
      return li && li.closest('#' + ${J(LIST)}) ? { id: li.id, value: document.getElementById('cue-select').options[[...li.parentNode.children].indexOf(li)]?.value ?? null,
        text: li.textContent.trim() } : null; })()`);
    const deliver = (L) => {
      const downs = L.filter((e) => e.phase === 'cap' && e.type === 'pointerdown' && e.trusted);
      const click1 = L.find((e) => e.phase === 'cap' && e.type === 'click' && e.trusted);
      const d2 = downs[1];
      return { downs, click1, d2, dt: d2 && click1 ? Math.round(d2.ts - click1.ts) : null };
    };
    // CUE-DBL + CUE-CTRL (one staging; CUE-CTRL alone still builds the double-click it follows)
    if (want('CUE-DBL') || want('CUE-CTRL')) {
      const S = await center(c, '#shoot');
      if (!(await openList())) { fail(`${T} CUE-DBL: UNJUDGEABLE — the cue list never opened`); return; }
      const opt = await optAt(S);
      if (!opt) { fail(`${T} CUE-DBL: UNJUDGEABLE — no cue option lies over Shoot's centre (${J(await hitId(c, S))})`); return; }
      const v0 = await val();
      const n0 = await c.eval(SHOTS);
      const i0 = await mark(c);
      const ts0 = epoch();
      await press(c, S, { count: 1, hold: 20, ts: ts0 }); // the double() shape, stamps kept for CUE-CTRL
      await sleep(150);
      await press(c, S, { count: 2, hold: 20, ts: ts0 + 0.17 });
      await sleep(900);
      const st = await c.eval(`({ shots: ${SHOTS} - ${n0}, state: window.__test.state(), list: !!document.getElementById(${J(LIST)}) })`);
      const v1 = await val();
      const L = await logSince(c, i0);
      const { downs, click1, d2, dt } = deliver(L);
      const reached = L.filter((e) => e.phase === 'bub' && e.type === 'click').map((e) => e.tgt);
      if (!click1 || !d2 || !(dt < CONT_MS) || !String(downs[0].tgt).startsWith(LIST)) {
        fail(`${T} CUE-DBL: UNJUDGEABLE — the double-click on the option was not delivered as built (${J({ d1: downs[0]?.tgt ?? null, d2: d2?.tgt ?? null, dt })})`);
      } else if (st.shots || st.state === 'PLAYBACK' || st.state === 'SIMULATING') {
        fail(`${T} CUE-DBL: a double-click on the cue option "${opt.text}" over Shoot fired a shot (press 2 +${dt} ms after click 1 on ${d2.tgt}; ${J(st)})`);
      } else if (reached.some((x) => x !== null && !String(x).startsWith(LIST))) {
        fail(`${T} CUE-DBL: press 2 of a double-click on the cue option "${opt.text}" reached ${J(reached)} under the closed list (+${dt} ms)`);
      } else if (v1 !== opt.value || st.list) {
        fail(`${T} CUE-DBL: UNJUDGEABLE — click 1 did not pick the option under it and close the list (${v0} -> ${v1}; wanted ${opt.value}; list open ${st.list})`);
      } else log(`${T} CUE-DBL: a double-click on the cue option "${opt.text}" over Shoot picked it (${v0} -> ${v1}); press 2 (+${dt} ms, on ${d2.tgt}) activated nothing underneath`);
      // CUE-CTRL: a deliberate click on Shoot 750 ms after click 1 (stamped; past the 500 ms window) shoots
      if (want('CUE-CTRL')) {
        const n1 = await c.eval(SHOTS);
        const wait = ts0 + 0.75 - epoch();
        if (wait > 0) await sleep(Math.ceil(wait * 1000));
        const k0 = await mark(c);
        await press(c, S, { ts: ts0 + 0.75 });
        await waitFor(c, `${SHOTS} > ${n1}`, 5000, 50);
        const fired = (await c.eval(SHOTS)) > n1;
        const pd = (await logSince(c, k0)).find((e) => e.phase === 'cap' && e.type === 'pointerdown' && e.trusted);
        const gap = pd && click1 ? Math.round(pd.ts - click1.ts) : null;
        if (st.shots) fail(`${T} CUE-CTRL: UNJUDGEABLE — the double-click above already shot`);
        else if (!pd || !(gap >= CONT_MS)) fail(`${T} CUE-CTRL: UNJUDGEABLE — the press on Shoot was not delivered past the window (${J({ gap })})`);
        else if (!fired) fail(`${T} CUE-CTRL: a deliberate click on Shoot ${gap} ms after the cue pick did not shoot`);
        else log(`${T} CUE-CTRL: a deliberate click on Shoot ${gap} ms after the cue pick shot`);
      }
      await settled(c, 90000);
      await sleep(400);
    }
    // CUE-FAST: a quick deliberate pick far from the trigger is not held
    // CUE-FAST: the far option's point is read on a first open (then closed); the pair — the opening click and the
    // pick — is dispatched with pinned stamps (the pick 250 ms after the click's own stamp), no eval between them; the
    // re-stage is only the backstop for a list that did not open before the pick's stamp
    for (let attempt = 1; want('CUE-FAST') && attempt <= 3; attempt++) {
      await toTable(c);
      await closeList();
      const B = await trig();
      if (!(await openList())) { fail(`${T} CUE-FAST: UNJUDGEABLE — the cue list never opened`); return; }
      const far = await c.eval(`(() => { const s = document.getElementById('cue-select'), ul = document.getElementById(${J(LIST)});
        const lis = [...ul.children]; for (let k = 0; k < lis.length; k++) { const r = lis[k].getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
          if (s.options[k] && s.options[k].value !== s.value && !s.options[k].disabled && Math.hypot(x - ${B.x}, y - ${B.y}) > 40 && document.elementFromPoint(x, y)?.closest('#' + ${J(LIST)}))
            return { x, y, value: s.options[k].value }; } return null; })()`);
      await closeList();
      if (!far) { fail(`${T} CUE-FAST: UNJUDGEABLE — no other option far from the trigger`); return; }
      await sleep(400);
      const v0 = await val();
      const i0 = await mark(c);
      const ts0 = epoch();
      await press(c, B, { hold: 20, ts: ts0 }); // the click's stamp = its release, ts0 + 20 ms; the list opens in its handler
      const late = epoch() - (ts0 + 0.27);
      if (late > -0.01) { // backstop: the click's handler (it opens the list) returned after the pick's stamp
        await closeList();
        if (attempt < 3) { log(`${T} CUE-FAST: the opening click returned ${Math.round(late * 1000 + 270)} ms after its stamp, past the pick's stamp (attempt ${attempt}) — staged again`); continue; }
        fail(`${T} CUE-FAST: UNJUDGEABLE — the opening click returned past the pick's stamp on every attempt`); break;
      }
      await sleep(Math.ceil(-late * 1000)); // a stamp never ahead of the clock
      await press(c, far, { hold: 20, ts: ts0 + 0.27 });
      await sleep(500);
      const v1 = await val();
      const L = await logSince(c, i0);
      const { click1, d2, dt } = deliver(L);
      const onList = !!d2 && String(d2.tgt).startsWith(LIST);
      if (!click1 || !d2 || !onList) { // backstop: the list was not up (in the DOM, hit-testable) for the pick
        const why = J({ d2: d2?.tgt ?? null, dt });
        await closeList();
        if (attempt < 3) { log(`${T} CUE-FAST: the list was not up before the pick's stamp (attempt ${attempt}; ${why}) — staged again`); continue; }
        fail(`${T} CUE-FAST: UNJUDGEABLE — the list was not up before the pick's stamp (${why})`);
      } else if (v1 !== far.value) fail(`${T} CUE-FAST: a quick pick ${dt} ms after the opening click, ${Math.round(Math.hypot(far.x - B.x, far.y - B.y))} px from the trigger, was held (${v0} -> ${v1}; wanted ${far.value})`);
      else log(`${T} CUE-FAST: a quick pick ${dt} ms after the opening click (stamped), ${Math.round(Math.hypot(far.x - B.x, far.y - B.y))} px from the trigger, was taken (${v0} -> ${v1}; attempt ${attempt})`);
      await sleep(400);
      break;
    }
    // CUE-OPEN + CUE-OPEN-CTRL at the desktop floor
    if (want('CUE-OPEN') || want('CUE-OPEN-CTRL')) {
      await settled(c, 90000);
      await closeList();
      await c.send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 640, deviceScaleFactor: 1, mobile: false });
      await sleep(900);
      await closeList();
      if (want('CUE-OPEN')) {
        const B2 = await trig();
        const w0 = await val();
        const j0 = await mark(c);
        await double(c, B2, 150, { counts: [1, 2] });
        await sleep(700);
        const L2 = await logSince(c, j0);
        const { downs: e2, click1: k1, d2: p2, dt: dt2 } = deliver(L2);
        const w1 = await val();
        const still = await listOpen(); // a swallowed press leaves the list open; a pick closes it
        if (!p2 || !(dt2 < CONT_MS) || !k1) fail(`${T} CUE-OPEN: UNJUDGEABLE — the double-click on the trigger was not delivered as built (${J({ d1: e2[0]?.tgt ?? null, d2: p2?.tgt ?? null, dt2 })})`);
        else if (!String(p2.tgt).startsWith(LIST + '-opt-')) fail(`${T} CUE-OPEN: UNJUDGEABLE — at 1024x640 press 2 met ${p2.tgt}, not an option (the list did not cover its trigger with an option)`);
        else if (w1 !== w0 || !still) fail(`${T} CUE-OPEN: a double-click on the cue trigger at 1024x640 picked the option under press 2 (${w0} -> ${w1}; list open ${still}; press 2 +${dt2} ms on ${p2.tgt})`);
        else log(`${T} CUE-OPEN: a double-click on the cue trigger at 1024x640 opened the list; press 2 (+${dt2} ms on ${p2.tgt}) picked nothing and the list stayed open`);
        await closeList();
      }
      if (want('CUE-OPEN-CTRL')) { // stamped: the pick 700 ms after the opening click's own stamp (past the 500 ms window)
        const B3 = await trig();
        const u0 = await val();
        const m0 = await mark(c);
        const ts1 = epoch();
        await press(c, B3, { hold: 20, ts: ts1 });
        if (!(await waitFor(c, `!!document.getElementById(${J(LIST)})`, 3000, 20))) fail(`${T} CUE-OPEN-CTRL: UNJUDGEABLE — the cue list never opened`);
        else {
          const o = await optAt(B3);
          if (!o) fail(`${T} CUE-OPEN-CTRL: UNJUDGEABLE — at 1024x640 no option lies under the trigger's point`);
          else {
            const wait = ts1 + 0.72 - epoch();
            if (wait > 0) await sleep(Math.ceil(wait * 1000));
            await press(c, B3, { hold: 20, ts: ts1 + 0.72 });
            await sleep(500);
            const u1 = await val();
            const still = await listOpen();
            const g = deliver(await logSince(c, m0));
            if (!g.click1 || !g.d2 || !(g.dt >= CONT_MS)) fail(`${T} CUE-OPEN-CTRL: UNJUDGEABLE — the pick was not delivered past the window (${J({ d2: g.d2?.tgt ?? null, dt: g.dt })})`);
            else if (u1 !== o.value || still) fail(`${T} CUE-OPEN-CTRL: a deliberate pick ${g.dt} ms after the opening click was held (${u0} -> ${u1}; wanted ${o.value}; list open ${still})`);
            else log(`${T} CUE-OPEN-CTRL: a deliberate pick ${g.dt} ms after the opening click (stamped) was taken (${u0} -> ${u1}; the list closed)`);
          }
        }
        await closeList();
      }
      await c.send('Emulation.clearDeviceMetricsOverride');
    }
    const errs = await errorsOf(c);
    if (errs.length) fail(`${T}: page errors ${J(errs)}`);
  } finally { await closeClient(c); }
}

const LEGS = { 988: leg988, 987: leg987, 1044: leg1044, 1068: leg1068, dec: legDecision, 986: leg986, esc: legEscape, sel: legSelect, 1072: leg1072, cue: legCue, fl: legFast };
export async function armCont({ PORT, CDP_PORT, fail, log = console.log }) {
  const bad = SUB.filter((x) => !SUB_KNOWN.includes(x));
  if (bad.length) { fail(`CONT: unknown OB_E2E_CONT_SUB tag(s) ${bad.join(', ')} — a typo would run only the setup legs`); return; }
  const dflt = process.argv.includes('--fastlane') ? 'fl' : '988,987,1044,1068,dec,986,esc,sel,1072,cue';
  const pick = (process.env.OB_E2E_CONT_LEGS || dflt).split(',').map((s) => s.trim()).filter(Boolean);
  for (const id of pick) {
    const leg = LEGS[id];
    if (!leg) { fail(`CONT: unknown leg ${id}`); continue; }
    // a leg that cannot boot fails as itself and never aborts the suite
    try { await leg({ PORT, CDP_PORT, fail, log }); } catch (e) { fail(`CONT-${id}: ${e?.stack || e}`); }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const PORT = Number(process.env.OB_E2E_PORT ?? 8178);
  const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 8830);
  const fail = (msg) => { console.error('E2E-SHELL-CONT FAIL:', msg); process.exitCode = 1; };
  const server = spawnStaticServer(webDir, PORT);
  await sleep(700);
  try { await armCont({ PORT, CDP_PORT, fail }); } catch (e) { fail(e?.stack || String(e)); }
  await stopStaticServer(server);
  console.log(process.exitCode ? 'E2E-SHELL-CONT FAIL' : 'E2E-SHELL-CONT PASS');
}
