// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-drill-session.mjs — the drill SESSION gate (GH-980 / GH-981 / GH-982 /
// GH-994; drills.js FORMAT.md §1c): entering and leaving a drill or the
// practice modes hands back a table identical to a FRESH entry of the
// destination, and a drill start respects the same busy / decision /
// consent gates as any other game change.
//
//   D1  #980, desktop REAL-USER boot, real clicks: Hall → Snooker card →
//       Continue → toolbar Practice drills (every pool card carries the
//       "Switches the table to 9-Ball" badge) → BU cut ladder: rules, saved
//       game, equipment (the pool pairing, never a snooker axis) and the HUD
//       title agree, and a REAL screenshot reads pool cloth beside the cue
//       ball (pre-fix: snooker green). Dock Stop → confirm: a fresh 9-ball
//       rack (balls 0-9, onTable 1-9, BALL_IN_HAND, seat 1). The Hall's
//       current card names the live game, and the Snooker card opens the
//       switch confirm (pre-fix: a dead click under 9-ball rules).
//   D2  J9-F2 + #981 consent, desktop: Hall → 8-Ball → Continue → a REAL
//       break → the card raises "Leave this game?"; Cancel keeps the frame
//       (mode, shot index, shooter, onTable, rules); the card → Start drill
//       pins 9-ball SESSION-only (rules = saved = nine_ball, storage still
//       eight_ball, Hall current card nine_ball); Hall → Back to play → the
//       table: rules = saved = eight_ball, HUD 8-Ball, a fresh 15-ball rack,
//       seat 1, ball 8 painted at its screen point.
//   D3  #981 decision: a soft 8-ball break leaves the dry-break option
//       pending on a progressed rack → the card starts no drill and shows
//       shell.notice.decision; decision, rules and shot index untouched;
//       the __drills.start api backstop refuses the same way.
//   D4  #981 busy: a 5 m/s shot → the toolbar pill in PLAYBACK refuses with
//       shell.notice.busy (picker closed); __drills.start refuses; the shot
//       runs to rest (no AIM before it) and no drill exists afterwards.
//   D5  #982, desktop: Hall → Practice → Drills → BU ten set shots → Shoot
//       → attempt 2 → Hall → Play → Back to play → Back to the table: a
//       fresh 9-ball rack (balls 0-9, onTable 1-9, BALL_IN_HAND, seat 1),
//       the nine object balls painted around the foot spot.
//   D6  #994, desktop: Free practice → REAL drag of the 8 → the undo chip
//       arms → Hall → 8-Ball → Continue: the slot is empty, the chip is
//       disabled, a click on it moves nothing; the equipment variant
//       (changeEquipment table_id) empties it the same way.
//   D7  review r1 P2, desktop: Equipment → cue → Try it from a LIVE drill (8-Ball
//       pinned to 9-ball) and (D7p) from a PARKED run keeps the atelier's
//       two-ball comparison layout (cue + the lowest object ball at the
//       authored spots) through a 2.5 s hold — the session's queued fresh
//       rack stands down — with the session pin restored (8-ball). The
//       station hop rides __atelier.go (navigation); card + Try it are real.
//       review r2: the comparison layout's fold + hud title are the restored
//       game's (8-ball; D8 the same from 10-Ball), not the 9-ball pin's.
//   P2  the same live leg on the phone register with taps.
//   D9  #1041, desktop real clicks: the Century run card from the CAROM and the
//       SNOOKER table carries the "Switches the table to 9-Ball" badge, runs on
//       the pool pairing (rules = saved = straight_pool over the persisted
//       9-ball, HUD "14.1 Continuous", real-screenshot pool cloth); Stop hands
//       back a fresh 9-ball rack; Re-rack + the hall's current card agree.
//   W   #1027: Free practice entered during the WIN hold (api inside the hold,
//       real hall clicks, and an after-the-hold control) lands in a live
//       sandbox on a full rack — the machine leaves WIN by itself, Shoot
//       enabled, the status line the sandbox's; real-screenshot Shoot luma
//       matches the control.
//   P1  phone REAL-USER boot (844x390@3, touch): the D2/D5 journey with taps —
//       8-Ball → Continue → a REAL break → Practice drills → card → Start
//       drill → Hall → Play (the card swiped to Back to play) → Back to the
//       table: rules = saved = eight_ball, a fresh 15-ball rack, seat 1.
//   M   matrix (api, tool boot): every drill class (pool sandbox bu-f2,
//       ghost9, century, colours-clear) × every playable game, each start
//       left through one exit (dock stop / Play / Free practice / Re-rack /
//       a game switch, rotated): during the run rules = saved game = the
//       drill's game on the drill's table class; after the exit the drill
//       is gone, rules = saved = the expected game (session pin restored,
//       persisted switch kept, a foreign switch kept), the stored game is
//       the persisted one, the balls on the cloth are that game's fresh
//       rack, onTable = the object balls on the cloth, seat 1. Plus: drill →
//       drill hand-offs keep the first borrow; every class refuses mid-shot
//       and on a pending decision; a drill exit with P2 on turn and the
//       playground → play leg both seat P1 (#982, J9-F5); a persisted switch under the session pin stashes the
//       persisted game's equipment pairing, never the pinned game's.
//
// Harness law: chrome-headless-shell via cdp.mjs, run-gate.mjs port band
// (OB_E2E_PORT / OB_E2E_CDP_PORT inside it), the obw-e2e-profile marker and
// tracked-PID cleanup ride cdp.mjs launchChrome (never a broad Chrome kill).
// Timing numbers are never asserted (QoS-clamped lanes): every wait is a
// bounded poll on a state predicate.
//
//   node web/tools/e2e-drill-session.mjs      (needs Chrome + node ≥22)
//   OB_E2E_DRILLSESSION_ARMS=D-a,M narrows a local run (never set in CI)
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { launchChrome, sleep, spawnStaticServer, stopStaticServer } from './cdp.mjs';
import { launchPhone, tap, touchStart, touchMove, touchEnd } from './touch-cdp.mjs';
import { decodePng } from './kit-laws.mjs';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// defaults sit BELOW the CI reserved range; run-gate --band pins both
const PORT = Number(process.env.OB_E2E_PORT ?? 8960);
const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 8975);
// one static server + three CDP endpoints (offset 0 the desktop boots, 1 the
// phone boot, 2 the matrix tool boot — sequential, never concurrent)
export const PORT_INVENTORY = { http: 1, cdp: 3 };

const EN = JSON.parse(readFileSync(path.join(webDir, 'app/locales/en.json'), 'utf8'));
const CONFIRM = '.ob-confirm[data-ob="confirm"]';
const QUIET = ['AIM', 'BALL_IN_HAND', 'WIN'];
// The game-switch overlay (#974: web/app/ui/switchprogress.js; its own gate is web/tools/e2e-shell-switch.mjs) takes
// every pointer hit while a switch runs and until it leaves (MIN_SHOWN 500 ms + the leave): html[data-ob-switching]
// stands and a [data-ob="switch-progress"] element exists. Every real click and tap waits for both to be gone; a tree
// without the overlay passes at once. Arm SG fails if a real switch ever stops showing either marker, so this
// predicate cannot quietly go stale. One contract with two readers: hoisting it into one shared export is #1084.
const SWITCH_IDLE = `!document.documentElement.hasAttribute('data-ob-switching') && !document.querySelector('[data-ob="switch-progress"]')`;

let failCount = 0;
let okCount = 0;
const fail = (msg) => {
  console.error('E2E-DRILLSESSION FAIL:', msg);
  process.exitCode = 1;
  failCount += 1;
};
const armOk = async (c, errs, f0, msg) => {
  if (c) await gateErrors(c, errs, msg.split(' ')[0]);
  if (failCount === f0) { console.log(msg); okCount += 1; return; }
  console.error(`E2E-DRILLSESSION: ${failCount - f0} failure(s) in this arm — OK line withheld (${msg.split(':')[0]})`);
};

// ---- helpers ----------------------------------------------------------------
async function waitReady(c, tries = Number(process.env.OB_E2E_READY_TRIES) || 300) {
  for (let i = 0; i < tries; i++) {
    await sleep(200);
    try { if (await c.eval('window.__test?.ready === true')) return true; } catch { /* navigating */ }
  }
  return false;
}
async function waitExpr(c, expr, tries = 60, stepMs = 100) {
  for (let i = 0; i < tries; i++) {
    try { if (await c.eval(expr)) return true; } catch { /* navigating */ }
    await sleep(stepMs);
  }
  return false;
}
function watchErrors(c, sink) {
  c.onEvent((method, params) => {
    if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
      sink.push(params.args.map((a) => a.value ?? a.description).join(' '));
    } else if (method === 'Runtime.exceptionThrown') {
      sink.push(params.exceptionDetails.exception?.description ?? params.exceptionDetails.text);
    }
  });
}
const gateErrors = async (c, sink, tag) => {
  const appErrs = await c.eval('(() => (window.__test?.errors ?? []).splice(0))()').catch(() => []);
  if (appErrs.length) fail(`${tag}: app errors: ` + JSON.stringify(appErrs));
  if (sink.length) fail(`${tag}: console errors: ` + sink.slice(0, 3).join(' | '));
  sink.length = 0;
};
const bootUrl = (q) => `http://127.0.0.1:${PORT}/app.html?${q}`;

/** Centre of a visible element (null when absent / hidden); scrolls a rail
 * card into its own scroll box first (the cardrail is a scroll container). */
async function centerOf(c, sel) {
  return c.eval(`(() => {
    const el = document.querySelector(${JSON.stringify(sel)});
    if (!el || el.hidden || el.getClientRects().length === 0) return null;
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })()`);
}
/** A REAL pointer click (CDP Input), never el.click(); refuses when the
 * centre is covered by something outside the target (the hit law). */
async function clickEl(c, sel, tag) {
  if (!(await switchIdle(c, tag))) return false;
  const pt = await centerOf(c, sel);
  if (!pt) { fail(`${tag}: ${sel} is not visible`); return false; }
  await sleep(120); // a scrolled rail settles its own scroll before the hit
  const pt2 = (await centerOf(c, sel)) ?? pt;
  const hit = await c.eval(`(() => { const t = document.querySelector(${JSON.stringify(sel)});
    const el = document.elementFromPoint(${pt2.x}, ${pt2.y}); return !!t && !!el && (t === el || t.contains(el)); })()`);
  if (!hit) { fail(`${tag}: ${sel} is covered at its centre`); return false; }
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pt2.x, y: pt2.y });
  await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pt2.x, y: pt2.y, button: 'left', clickCount: 1 });
  await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pt2.x, y: pt2.y, button: 'left', clickCount: 1 });
  return true;
}
/** A REAL tap at an element's centre (phone register). */
async function tapEl(c, sel, tag) {
  if (!(await switchIdle(c, tag))) return false;
  const pt = await centerOf(c, sel);
  if (!pt) { fail(`${tag}: ${sel} is not visible`); return false; }
  await sleep(120);
  const pt2 = (await centerOf(c, sel)) ?? pt;
  const hit = await c.eval(`(() => { const t = document.querySelector(${JSON.stringify(sel)});
    const el = document.elementFromPoint(${pt2.x}, ${pt2.y}); return !!t && !!el && (t === el || t.contains(el)); })()`);
  if (!hit) { fail(`${tag}: ${sel} is covered at its centre (phone)`); return false; }
  await tap(c, pt2.x, pt2.y);
  return true;
}
async function mouseDrag(c, from, to, steps = 18) {
  await switchIdle(c, 'drag');
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from.x, y: from.y });
  await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: from.x, y: from.y, button: 'left', clickCount: 1 });
  for (let i = 1; i <= steps; i++) {
    const x = from.x + (to.x - from.x) * i / steps, y = from.y + (to.y - from.y) * i / steps;
    await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left', buttons: 1 });
    await sleep(25);
  }
  await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: to.x, y: to.y, button: 'left', clickCount: 1 });
}

async function switchIdle(c, tag) {
  if (await waitExpr(c, SWITCH_IDLE, 600, 100)) return true;
  fail(`${tag}: the game-switch overlay never left (html[data-ob-switching] / [data-ob="switch-progress"])`);
  return false;
}

/** One state read: everything the session laws compare. */
const STATE = `(() => {
  const ms = (() => { try { return window.__rules?.matchState?.() ?? null; } catch { return null; } })();
  const s = window.__settings?.get?.() ?? {};
  let stored = null;
  try { stored = JSON.parse(localStorage.getItem('ob-settings-v1') ?? 'null')?.game ?? null; } catch { stored = null; }
  const sorted = (a) => [...a].sort((x, y) => x - y);
  return {
    rules: window.__rules?.game?.() ?? null, game: s.game ?? null, mode: s.mode ?? null, stored,
    eq: window.__test?.equipment?.() ?? null,
    drill: window.__drills?.state?.() ?? null,
    machine: window.__test?.state?.() ?? null,
    cloth: sorted((window.__test?.balls?.() ?? []).filter((b) => !b.pocketed).map((b) => b.id)),
    onTable: Array.isArray(ms?.onTable) ? sorted(ms.onTable) : null,
    shooter: ms?.shooter ?? null, player: window.__rules?.player?.() ?? null,
    pending: ms?.pendingDecision ?? null,
    shotIndex: window.__test?.bed?.()?.shotIndex ?? null,
    pristine: window.__settings?.rackPristine?.() ?? null,
    title: document.querySelector('#hud h1')?.textContent ?? null,
    current: [...document.querySelectorAll('[data-ob="play-game"][aria-current="true"]')].map((b) => b.dataset.game),
    hint: (() => { const h = document.getElementById('hud-hint'); return h && h.style.display === 'block' ? h.textContent : null; })(),
    confirm: document.querySelectorAll('${CONFIRM}').length,
    shell: window.__shell?.isOpen?.() ?? null,
  };
})()`;
const state = (c) => c.eval(STATE);
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const isPoolTable = (eq) => !!eq?.table_id && !/snooker|carom|umb_/.test(eq.table_id);
const isPoolTuple = (eq) => isPoolTable(eq) && !/snooker|carom/.test(`${eq.ballset_id} ${eq.cloth_id} ${eq.cue_id}`);

/** The HUD Re-rack, a REAL click. GH-990 (rules lane): on a progressed rack Re-rack asks the kit confirm
 * (hud.rerackConfirm). It is accepted the way D5 accepts the drill consent, and its absence is a fail. A tree
 * without that consent (no key in en.json) re-racks on the click. */
async function rerackClick(c, tag) {
  const text = EN['hud.rerackConfirm'];
  const asks = typeof text === 'string' && await c.eval('window.__settings?.rackPristine?.() === false');
  if (!(await clickEl(c, '#rerack', tag))) return false;
  if (!asks) return true;
  if (!(await waitExpr(c, `document.querySelector('${CONFIRM}')?.textContent.includes(${JSON.stringify(text)}) === true`, 50, 100))) {
    fail(`${tag}: Re-rack on the progressed rack raised no consent (GH-990: ${JSON.stringify(text)})`); return false;
  }
  return clickEl(c, `${CONFIRM} [data-ob="confirm-accept"]`, tag);
}

async function waitQuiet(c, tries = 200) {
  return waitExpr(c, `${JSON.stringify(QUIET)}.includes(window.__test?.state?.())`, tries, 150);
}
/** A fresh rack of `game` is on the table: no drill, quiet, rules = saved
 * game, seat 1, the object balls on the cloth = `objects` = onTable. */
const FRESH = (game, objects) => `(() => { const s = ${STATE};
  return s.drill === null && ${JSON.stringify(QUIET)}.includes(s.machine) && s.rules === ${JSON.stringify(game)}
    && s.game === ${JSON.stringify(game)} && JSON.stringify(s.cloth) === ${JSON.stringify(JSON.stringify([0, ...objects]))}
    && JSON.stringify(s.onTable) === ${JSON.stringify(JSON.stringify(objects))}; })()`;

/** A REAL screenshot pixel census around a screen point: the median
 * (blue − green) over a ring of samples — pool cloth (stock blue) reads
 * positive, snooker napped green negative. */
async function clothHue(c, pt, radius = 46) {
  const dpr = await c.eval('window.devicePixelRatio || 1');
  const shot = await c.send('Page.captureScreenshot', { format: 'png' });
  const img = decodePng(Buffer.from(shot.data, 'base64'));
  const vals = [];
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    const x = Math.round((pt.x + Math.cos(a) * radius) * dpr), y = Math.round((pt.y + Math.sin(a) * radius) * dpr);
    if (x < 0 || y < 0 || x >= img.w || y >= img.h) continue;
    const i = (y * img.w + x) * img.bpp;
    vals.push(img.px[i + 2] - img.px[i + 1]);
  }
  vals.sort((p, q) => p - q);
  return { median: vals.length ? vals[vals.length >> 1] : null, n: vals.length };
}
/** Pixel at a screen point vs the cloth around the cue ball: a ball is
 * PAINTED there when its colour differs from the cloth reference. */
async function paintedAt(c, pts, clothPt) {
  const dpr = await c.eval('window.devicePixelRatio || 1');
  const shot = await c.send('Page.captureScreenshot', { format: 'png' });
  const img = decodePng(Buffer.from(shot.data, 'base64'));
  const px = (p) => { const x = Math.round(p.x * dpr), y = Math.round(p.y * dpr);
    const i = (y * img.w + x) * img.bpp; return [img.px[i], img.px[i + 1], img.px[i + 2]]; };
  const ref = px({ x: clothPt.x + 40, y: clothPt.y + 40 });
  return pts.map((p) => { const q = px(p); return Math.abs(q[0] - ref[0]) + Math.abs(q[1] - ref[1]) + Math.abs(q[2] - ref[2]); });
}

// ---- user-path helpers (real input) -----------------------------------------
async function openHallAt(c, place, tag, input = clickEl) {
  if (!(await c.eval('window.__shell?.isOpen?.() === true'))) {
    if (!(await input(c, '#ob-shell-open', tag))) return false;
    if (!(await waitExpr(c, 'window.__shell?.isOpen?.() === true && __shell.moving() === false', 100, 150))) {
      fail(`${tag}: the hall never opened`); return false;
    }
  }
  if (await c.eval(`__shell.place() !== ${JSON.stringify(place)}`)) {
    if (!(await input(c, `.ob-shell-place[data-place="${place}"]`, tag))) return false;
  }
  const ready = place === 'play'
    ? 'document.querySelector(\'[data-ob="play-game"]\') !== null'
    : place === 'equipment' ? 'typeof window.__atelier === "object"'
      : 'typeof window.__practice === "object" && document.getElementById("ob-practice")?.hidden === false';
  if (!(await waitExpr(c, `__shell.place() === ${JSON.stringify(place)} && __shell.moving() === false && ${ready}`, 100, 150))) {
    fail(`${tag}: the hall never arrived at ${place}`); return false;
  }
  await sleep(300);
  return true;
}
async function toTable(c, tag, input = clickEl) {
  if (!(await c.eval('window.__shell?.isOpen?.() === true'))) return true;
  if (!(await input(c, '#ob-shell-quickplay', tag))) return false;
  if (!(await waitExpr(c, 'window.__shell.isOpen() === false && __shell.moving() === false', 100, 150))) {
    fail(`${tag}: the hall never closed`); return false;
  }
  await sleep(400);
  return true;
}
/** Hall card → Continue → the switch lands on the game's fresh rack. */
async function switchGameByCard(c, gid, tag, input = clickEl) {
  if (!(await openHallAt(c, 'play', tag, input))) return false;
  if (!(await input(c, `[data-ob="play-game"][data-game="${gid}"]`, tag))) return false;
  if (!(await waitExpr(c, `document.querySelector('${CONFIRM}') !== null`, 50, 100))) {
    fail(`${tag}: the ${gid} card opened no switch confirm`); return false;
  }
  if (!(await input(c, `${CONFIRM} [data-ob="confirm-accept"]`, tag))) return false;
  if (!(await waitExpr(c, `window.__rules?.game?.() === ${JSON.stringify(gid)} && window.__settings.get().game === ${JSON.stringify(gid)}`, 300, 200))) {
    fail(`${tag}: the ${gid} switch never landed: ` + JSON.stringify(await state(c))); return false;
  }
  await waitQuiet(c);
  if (!(await toTable(c, tag, input))) return false;
  return true;
}
/** The toolbar Practice drills pill → a picker card (real input). */
async function pickDrill(c, id, tag, input = clickEl) {
  if (!(await input(c, '#ob-drills', tag))) return false;
  if (!(await waitExpr(c, `document.querySelector('.ob-drills__card[data-drill="${id}"]')?.getClientRects().length > 0`, 60, 100))) {
    fail(`${tag}: the picker never showed the ${id} card`); return false;
  }
  await sleep(350); // the kit open motion settles (a moving card mis-hits)
  return input(c, `.ob-drills__card[data-drill="${id}"]`, tag);
}
async function settleShot(c, tag) {
  if (!(await waitExpr(c, `window.__test.state() === 'PLAYBACK' || window.__test.state() === 'SIMULATING' || window.__test.bed().shotIndex > 0`, 60, 50))) {
    fail(`${tag}: the shot never started`);
  }
  if (!(await waitQuiet(c, 400))) fail(`${tag}: the shot never came to rest`);
  await sleep(300);
}
const setPower = (c, v) => c.eval(`(() => { const p = document.getElementById('power'); p.value = ${JSON.stringify(String(v))};
  p.dispatchEvent(new Event('input', { bubbles: true })); return p.value; })()`);

// ---- D1 — #980 snooker → pool drill (desktop) --------------------------------
async function legD1(c, tag) {
  if (!(await switchGameByCard(c, 'snooker', tag))) return;
  let s = await state(c);
  if (s.eq?.table_id !== 'wpbsa_snooker_12ft') { fail(`${tag}: fixture: snooker never staged: ` + JSON.stringify(s.eq)); return; }
  // the picker's promise: every pool card carries the switch badge
  if (!(await clickEl(c, '#ob-drills', tag))) return;
  if (!(await waitExpr(c, 'document.querySelector(\'.ob-drills__card[data-drill="bu-f1"]\')?.getClientRects().length > 0', 60))) {
    fail(`${tag}: picker never opened`); return;
  }
  const badge = await c.eval(`document.querySelector('[data-req="bu-f1"]')?.textContent ?? null`);
  const want = EN['drills.switchesGame'].replace('{game}', EN['game.nine_ball']);
  if (badge !== want) fail(`${tag}: the pool card must declare the switch: ${JSON.stringify(badge)} (want ${JSON.stringify(want)})`);
  await sleep(350);
  if (!(await clickEl(c, '.ob-drills__card[data-drill="bu-f1"]', tag))) return;
  if (!(await waitExpr(c, `window.__drills?.state?.()?.id === 'bu-f1' && ${JSON.stringify(QUIET)}.includes(window.__test.state())`, 300, 200))) {
    fail(`${tag}: the pool drill never started from snooker: ` + JSON.stringify(await state(c))); return;
  }
  await sleep(600);
  s = await state(c);
  if (s.rules !== 'nine_ball' || s.game !== 'nine_ball' || s.stored !== 'nine_ball') {
    fail(`${tag}: rules / saved / stored game must all be nine_ball (decision (a) persists): ` + JSON.stringify({ rules: s.rules, game: s.game, stored: s.stored }));
  }
  if (!isPoolTuple(s.eq)) fail(`${tag}: the drill must run on the pool pairing, not a snooker axis: ` + JSON.stringify(s.eq));
  if (s.title !== hudTitleOf('nine_ball')) fail(`${tag}: HUD title ${JSON.stringify(s.title)} (want ${JSON.stringify(hudTitleOf('nine_ball'))})`);
  const cue = await c.eval('window.__aim?.ballScreen?.(0) ?? null');
  if (!cue) fail(`${tag}: no cue ball on screen`);
  else {
    const hue = await clothHue(c, cue);
    if (!(hue.n >= 8 && hue.median > 8)) fail(`${tag}: REAL screenshot beside the cue ball must read pool cloth (blue − green > 8): ` + JSON.stringify(hue));
    else console.log(`${tag}: cloth beside the cue ball blue−green median ${hue.median} over ${hue.n} samples (pool)`);
  }
  // dock Stop → confirm: a fresh 9-ball rack, seat 1
  if (!(await clickEl(c, '#ob-drill-stop', tag))) return;
  if (!(await waitExpr(c, `document.querySelector('${CONFIRM} [data-ob="confirm-accept"]') !== null`, 50))) { fail(`${tag}: no stop confirm`); return; }
  if (!(await clickEl(c, `${CONFIRM} [data-ob="confirm-accept"]`, tag))) return;
  if (!(await waitExpr(c, FRESH('nine_ball', range(1, 9)), 150, 150))) {
    fail(`${tag}: Stop must lay a fresh 9-ball rack: ` + JSON.stringify(await state(c))); return;
  }
  // a fresh rack emits AIM{seed}, then flow opens the break in hand
  await waitExpr(c, `window.__test.state() === 'BALL_IN_HAND'`, 40, 100);
  s = await state(c);
  if (s.machine !== 'BALL_IN_HAND' || s.shooter !== 1 || s.player !== 1 || s.mode !== 'practice' || !isPoolTuple(s.eq)) {
    fail(`${tag}: after Stop: BALL_IN_HAND, seat 1, practice, pool table: ` + JSON.stringify(s));
  }
  // the hall agrees with the live rules, and the Snooker card is live
  if (!(await openHallAt(c, 'play', tag))) return;
  s = await state(c);
  if (!same(s.current, [s.rules])) fail(`${tag}: the hall's current card must name the live game: ` + JSON.stringify({ current: s.current, rules: s.rules }));
  if (!(await clickEl(c, '[data-ob="play-game"][data-game="snooker"]', tag))) return;
  if (!(await waitExpr(c, `document.querySelector('${CONFIRM}') !== null`, 50))) {
    fail(`${tag}: the Snooker card must open the switch confirm (never a dead click)`); return;
  }
  if (!(await clickEl(c, `${CONFIRM} [data-ob="confirm-cancel"]`, tag))) return;
  await waitExpr(c, `document.querySelector('${CONFIRM}') === null`, 30);
  await toTable(c, tag);
}

// ---- D2 — J9-F2 + #981 consent (desktop) -------------------------------------
/** Back to Play through the hall's own control (real input) — the leg's
 * fixture when a previous leg left the session in practice. */
async function backToPlay(c, tag, input = clickEl) {
  if (await c.eval(`window.__settings.get().mode === 'play'`)) return true;
  if (!(await openHallAt(c, 'play', tag, input))) return false;
  if (!(await input(c, '[data-ob="play-back"]', tag))) return false;
  if (!(await waitExpr(c, `window.__settings.get().mode === 'play' && window.__drills.state() === null`, 100, 150))) {
    fail(`${tag}: Back to play never landed`); return false;
  }
  await waitQuiet(c);
  return toTable(c, tag, input);
}

async function legD2(c, tag) {
  if (!(await switchGameByCard(c, 'eight_ball', tag))) return;
  if (!(await backToPlay(c, tag))) return;
  await setPower(c, '2.0');
  if (!(await clickEl(c, '#shoot', tag))) return;
  await settleShot(c, tag);
  const before = await state(c);
  if (before.pristine !== false || before.rules !== 'eight_ball' || before.mode !== 'play') {
    fail(`${tag}: fixture: a progressed 8-ball frame in Play: ` + JSON.stringify(before)); return;
  }
  // the card asks first; Cancel keeps the frame
  if (!(await pickDrill(c, 'bu-f2', tag))) return;
  if (!(await waitExpr(c, `document.querySelector('${CONFIRM}') !== null`, 50))) {
    fail(`${tag}: a progressed game must raise the consent (was: silent frame loss): ` + JSON.stringify(await state(c))); return;
  }
  const copy = await c.eval(`(() => { const el = document.querySelector('${CONFIRM}');
    return { title: el?.querySelector('.ob-panel__title')?.textContent ?? null,
      body: el?.querySelector('.ob-confirm__body')?.textContent ?? null,
      ok: el?.querySelector('[data-ob="confirm-accept"]')?.textContent ?? null }; })()`);
  if (copy.title !== EN['shell.place.practice.confirmTitle'] || copy.body !== EN['drills.confirmLeave.body']
    || copy.ok !== EN['drills.confirmStart']) fail(`${tag}: consent copy: ` + JSON.stringify(copy));
  if (!(await clickEl(c, `${CONFIRM} [data-ob="confirm-cancel"]`, tag))) return;
  await waitExpr(c, `document.querySelector('${CONFIRM}') === null`, 30);
  await sleep(300);
  const kept = await state(c);
  for (const k of ['rules', 'game', 'mode', 'shotIndex', 'shooter', 'onTable', 'cloth', 'drill']) {
    if (!same(kept[k], before[k])) fail(`${tag}: Cancel must keep the frame (${k}): ` + JSON.stringify({ before: before[k], after: kept[k] }));
  }
  // accept → the drill pins 9-ball SESSION-only
  if (!(await pickDrill(c, 'bu-f2', tag))) return;
  if (!(await waitExpr(c, `document.querySelector('${CONFIRM} [data-ob="confirm-accept"]') !== null`, 50))) { fail(`${tag}: consent never re-opened`); return; }
  if (!(await clickEl(c, `${CONFIRM} [data-ob="confirm-accept"]`, tag))) return;
  if (!(await waitExpr(c, `window.__drills?.state?.()?.id === 'bu-f2'`, 150, 150))) { fail(`${tag}: accept never started the drill`); return; }
  await sleep(500);
  let s = await state(c);
  if (s.rules !== 'nine_ball' || s.game !== 'nine_ball' || s.stored !== 'eight_ball') {
    fail(`${tag}: the sandbox pin must be session-only through settings (rules = saved = nine_ball, stored eight_ball): ` + JSON.stringify({ rules: s.rules, game: s.game, stored: s.stored }));
  }
  if (!(await openHallAt(c, 'play', tag))) return;
  s = await state(c);
  if (!same(s.current, [s.rules])) fail(`${tag}: mid-drill hall current card must name the live game: ` + JSON.stringify({ current: s.current, rules: s.rules }));
  if (!(await clickEl(c, '[data-ob="play-back"]', tag))) return;
  if (!(await waitExpr(c, FRESH('eight_ball', range(1, 15)), 200, 150))) {
    fail(`${tag}: Back to play must restore 8-ball on a fresh rack: ` + JSON.stringify(await state(c))); return;
  }
  if (!(await toTable(c, tag))) return;
  await waitExpr(c, `window.__test.state() === 'BALL_IN_HAND'`, 40, 100);
  s = await state(c);
  if (s.mode !== 'play' || s.stored !== 'eight_ball' || s.title !== EN['game.eight_ball'] || s.shooter !== 1 || s.player !== 1
    || s.machine !== 'BALL_IN_HAND') fail(`${tag}: after Back to play: ` + JSON.stringify(s));
  const b8 = await c.eval('window.__aim?.ballScreen?.(8) ?? null');
  const cue = await c.eval('window.__aim?.ballScreen?.(0) ?? null');
  if (!b8 || !cue) fail(`${tag}: ball 8 / the cue ball off screen`);
  else {
    const [d] = await paintedAt(c, [b8], cue);
    if (!(d > 60)) fail(`${tag}: REAL screenshot: ball 8 must be painted at its rack point (|Δrgb| ${d} vs the cloth)`);
  }
}

// ---- D3 — #981 decision gate (desktop) ---------------------------------------
async function legD3(c, tag) {
  if (await c.eval('window.__rules.game()') !== 'eight_ball') {
    if (!(await switchGameByCard(c, 'eight_ball', tag))) return;
  } else {
    if (!(await rerackClick(c, tag))) return;
    await waitQuiet(c);
  }
  await setPower(c, '0.9');
  if (!(await clickEl(c, '#shoot', tag))) return;
  await settleShot(c, tag);
  const before = await state(c);
  if (!before.pending || before.pristine !== false) { fail(`${tag}: fixture: no pending decision on a progressed rack: ` + JSON.stringify(before)); return; }
  if (!(await pickDrill(c, 'bu-f2', tag))) return;
  if (!(await waitExpr(c, `document.getElementById('hud-hint')?.textContent === ${JSON.stringify(EN['shell.notice.decision'])}`, 30))) {
    fail(`${tag}: the card must show the decision notice: ` + JSON.stringify(await state(c)));
  }
  await sleep(400);
  let s = await state(c);
  if (s.drill !== null || s.confirm !== 0 || !same(s.pending, before.pending) || s.rules !== before.rules
    || s.shotIndex !== before.shotIndex || !same(s.cloth, before.cloth)) {
    fail(`${tag}: a pending decision must refuse the start with the frame intact: ` + JSON.stringify({ before, after: s }));
  }
  const api = await c.eval(`window.__drills.start('ghost9')`);
  s = await state(c);
  if (api !== false || s.drill !== null || !same(s.pending, before.pending)) fail(`${tag}: the api backstop must refuse too: ` + JSON.stringify({ api, s }));
  // resolve the option so the next leg starts clean
  await c.eval(`document.querySelector('#hud-decision button')?.click(), true`);
  await sleep(500);
}

// ---- D4 — #981 busy gate (desktop) -------------------------------------------
async function legD4(c, tag) {
  // D3 left a progressed 8-ball rack: Re-rack asks first (GH-990), and D4 accepts
  if (!(await rerackClick(c, tag))) return;
  await waitQuiet(c);
  await setPower(c, '5.0');
  if (!(await clickEl(c, '#shoot', tag))) return;
  if (!(await waitExpr(c, `window.__test.state() === 'PLAYBACK'`, 60, 30))) { fail(`${tag}: the shot never reached PLAYBACK`); return; }
  // the pill refuses a table in flight
  if (!(await clickEl(c, '#ob-drills', tag))) return;
  await sleep(150);
  let s = await state(c);
  const picker = await c.eval(`(() => { const p = document.getElementById('ob-drills-panel'); return p ? getComputedStyle(p).display : 'none'; })()`);
  if (s.machine === 'PLAYBACK') {
    if (picker !== 'none') fail(`${tag}: the pill must not open the picker mid-roll (display ${picker})`);
    if (s.hint !== EN['shell.notice.busy']) fail(`${tag}: the pill must show the busy notice: ` + JSON.stringify(s.hint));
    const api = await c.eval(`window.__drills.start('bu-f1')`);
    const mid = await state(c);
    if (api !== false || mid.drill !== null) fail(`${tag}: the api must refuse mid-roll: ` + JSON.stringify({ api, mid }));
    // a 5 m/s break runs for seconds: still PLAYBACK right after the two
    // refusals = the shot was not cut (pre-fix: AIM 64 ms after the card)
    if (mid.machine !== 'PLAYBACK') fail(`${tag}: the refused starts must not end the shot (machine ${mid.machine})`);
  } else {
    fail(`${tag}: the shot settled before the probe — the leg cannot judge the busy gate (machine ${s.machine})`);
  }
  await settleShot(c, tag);
  s = await state(c);
  if (s.drill !== null) fail(`${tag}: no drill may exist after the refused mid-roll start: ` + JSON.stringify(s.drill));
}

// ---- D5 — #982 drill → Play (desktop) ----------------------------------------
async function legD5(c, tag) {
  if (!(await openHallAt(c, 'practice', tag))) return;
  if (!(await clickEl(c, '[data-ob="practice-drills"] button', tag))) return;
  if (!(await waitExpr(c, 'document.querySelector(\'.ob-drills__card[data-drill="bu-f6"]\')?.getClientRects().length > 0 && window.__shell.isOpen() === false', 100, 150))) {
    fail(`${tag}: Practice → Drills never opened the picker at the table`); return;
  }
  await sleep(350);
  if (!(await clickEl(c, '.ob-drills__card[data-drill="bu-f6"]', tag))) return;
  // a pristine rack or a progressed one: accept a consent if one rises
  await sleep(500);
  if (await c.eval(`document.querySelector('${CONFIRM} [data-ob="confirm-accept"]') !== null`)) {
    await clickEl(c, `${CONFIRM} [data-ob="confirm-accept"]`, tag);
  }
  if (!(await waitExpr(c, `window.__drills?.state?.()?.id === 'bu-f6' && ${JSON.stringify(QUIET)}.includes(window.__test.state())`, 200, 150))) {
    fail(`${tag}: bu-f6 never started: ` + JSON.stringify(await state(c))); return;
  }
  await setPower(c, '2.0');
  await sleep(400);
  if (!(await clickEl(c, '#shoot', tag))) return;
  if (!(await waitExpr(c, `window.__drills.state()?.attempt >= 1 && ${JSON.stringify(QUIET)}.includes(window.__test.state())`, 300, 150))) {
    fail(`${tag}: the drill never advanced to attempt 2: ` + JSON.stringify(await state(c))); return;
  }
  await sleep(2600); // the drill's own re-lay (NEXT_MS) lands first
  if (!(await openHallAt(c, 'play', tag))) return;
  if (!(await clickEl(c, '[data-ob="play-back"]', tag))) return;
  if (!(await waitExpr(c, FRESH('nine_ball', range(1, 9)), 200, 150))) {
    fail(`${tag}: Back to play must lay a fresh 9-ball rack (pre-fix: the drill layout under a full onTable): ` + JSON.stringify(await state(c))); return;
  }
  if (!(await toTable(c, tag))) return;
  await waitExpr(c, `window.__test.state() === 'BALL_IN_HAND'`, 40, 100);
  const s = await state(c);
  if (s.mode !== 'play' || s.machine !== 'BALL_IN_HAND' || s.shooter !== 1 || s.player !== 1) fail(`${tag}: after Back to play: ` + JSON.stringify(s));
  const pts = await c.eval('[1,2,3,4,5,6,7,8,9].map((i) => window.__aim.ballScreen(i))');
  const cue = await c.eval('window.__aim.ballScreen(0)');
  if (pts.some((p) => !p) || !cue) { fail(`${tag}: an object ball is off screen: ` + JSON.stringify(pts)); return; }
  const cx = pts.reduce((a, p) => a + p.x, 0) / 9, cy = pts.reduce((a, p) => a + p.y, 0) / 9;
  const spread = Math.max(...pts.map((p) => Math.hypot(p.x - cx, p.y - cy)));
  const far = Math.hypot(cue.x - cx, cue.y - cy);
  if (!(spread < far / 2)) fail(`${tag}: the nine balls must sit clustered at the foot spot (spread ${spread.toFixed(1)} px vs cue distance ${far.toFixed(1)} px)`);
  const painted = await paintedAt(c, pts, cue);
  if (painted.some((d) => !(d > 40))) fail(`${tag}: REAL screenshot: every rack ball must be painted (|Δrgb| vs cloth: ${painted.join(',')})`);
}

// ---- D6 — #994 playground undo (desktop) -------------------------------------
async function legD6(c, tag) {
  if (await c.eval('window.__rules.game()') !== 'nine_ball') {
    if (!(await switchGameByCard(c, 'nine_ball', tag))) return;
  }
  if (!(await openHallAt(c, 'practice', tag))) return;
  if (!(await clickEl(c, '[data-ob="practice-playground"] button', tag))) return;
  await sleep(400);
  if (await c.eval(`document.querySelector('${CONFIRM} [data-ob="confirm-accept"]') !== null`)) {
    await clickEl(c, `${CONFIRM} [data-ob="confirm-accept"]`, tag);
  }
  if (!(await waitExpr(c, `window.__settings.get().mode === 'playground' && window.__shell.isOpen() === false`, 100, 150))) {
    fail(`${tag}: Free practice never opened`); return;
  }
  await sleep(600);
  const from = await c.eval('window.__aim.ballScreen(8)');
  if (!from) { fail(`${tag}: ball 8 off screen`); return; }
  await mouseDrag(c, from, { x: from.x - 210, y: from.y + 110 });
  await sleep(400);
  const armed = await c.eval(`({ undo: window.__playground.state().undo, disabled: document.getElementById('ob-mode-undo')?.disabled })`);
  if (armed.undo?.id !== 8 || armed.disabled !== false) { fail(`${tag}: fixture: the real drag must arm the undo: ` + JSON.stringify(armed)); return; }
  if (!(await switchGameByCard(c, 'eight_ball', tag))) return;
  await sleep(400);
  const pos = () => c.eval('JSON.stringify(window.__test.balls().map((b) => [b.id, b.pocketed, b.pos.map((v) => +v.toFixed(9))]))');
  const after = await c.eval(`({ mode: window.__settings.get().mode, undo: window.__playground.state().undo, disabled: document.getElementById('ob-mode-undo')?.disabled })`);
  if (after.mode !== 'playground' || after.undo !== null || after.disabled !== true) {
    fail(`${tag}: a game switch must empty the undo slot and disable the chip: ` + JSON.stringify(after));
  }
  const p0 = await pos();
  await switchIdle(c, tag);
  const chip = await centerOf(c, '#ob-mode-undo');
  if (chip) {
    await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: chip.x, y: chip.y, button: 'left', clickCount: 1 });
    await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: chip.x, y: chip.y, button: 'left', clickCount: 1 });
    await sleep(300);
  }
  if (await pos() !== p0) fail(`${tag}: a click on the dead undo chip moved a ball of the fresh rack`);
  // equipment variant (api — the atelier route is its own suite's)
  const ok = await c.eval(`(async () => { window.__playground.beginDrag(8); const placed = window.__playground.placeBall(8, 0.25, 0.3);
    window.__playground.endDrag(); const armedE = window.__playground.state().undo;
    const cur = window.__settings.get().equipment.table_id;
    const next = cur === 'pool_pro_9ft_metal_rim' ? 'pool_pro_9ft' : 'pool_pro_9ft_metal_rim';
    const sw = await window.__settings.changeEquipment('table_id', next, { skipConfirm: true });
    await new Promise((r) => setTimeout(r, 800));
    return { placed, armedE, sw, undo: window.__playground.state().undo, undoCall: window.__playground.undo() }; })()`);
  if (!ok.placed || !ok.armedE || ok.sw !== true || ok.undo !== null || ok.undoCall !== false) {
    fail(`${tag}: an equipment change must empty the undo slot: ` + JSON.stringify(ok));
  }
}

// ---- D7 — review r1 P2: Equipment → cue → Try it from a LIVE and a PARKED drill
// keeps the atelier's two-ball comparison layout (the session's queued fresh
// rack stands down once a newer layout owns the table) -------------------------
const TRY_CUE = 'standard_dime_tip';
const FOLD_OF = { eight_ball: /^eightball-v/, ten_ball: /^tenball-v/, nine_ball: /^nineball-v/ };
// The HUD names the active game by its catalog key: flow.js renderTitle keys #hud h1 to it, and app.html's static h1
// carries the same key for the first (nine-ball) paint. Release ruling D2 (uiaudit F13) moved nine-ball from the static
// 'hud.title' ("9-ball") to its catalog key 'game.nine_ball' ("9-Ball"), so the expected title reads the served tree's
// own key — never a pinned literal; a tree whose key cannot be read fails here by name.
const HUD_NINE_KEY = /<div id="hud"[^>]*>[\s\S]*?<h1\b[^>]*\bdata-i18n="([^"]+)"/
  .exec(readFileSync(path.join(webDir, 'app.html'), 'utf8'))?.[1] ?? null;
if (!HUD_NINE_KEY || typeof EN[HUD_NINE_KEY] !== 'string') {
  fail(`the #hud h1 data-i18n key of app.html (${JSON.stringify(HUD_NINE_KEY)}) names no en.json string — the HUD title expectation is unreadable`);
}
const hudTitleOf = (id) => EN[id === 'nine_ball' ? HUD_NINE_KEY : `game.${id}`];
/** Hall → Equipment → the cues station → a rail card → Try it, then the
 * comparison-layout law: exactly the cue + the lowest object ball, at the
 * authored spots (ateliercue.js stageLayout), and still there after a hold
 * long enough for any queued teardown to land. The station hop rides the
 * __atelier.go seam (navigation only); the card and Try it are real input. */
async function tryItKeepsComparison(c, tag, { input = clickEl, restoredGame } = {}) {
  const before = await state(c);
  const target = before.cloth.filter((id) => id !== 0)[0] ?? 1;
  if (!(await openHallAt(c, 'equipment', tag, input))) return;
  if (!(await waitExpr(c, 'typeof window.__atelier?.go === "function"', 100, 150))) { fail(`${tag}: __atelier never landed`); return; }
  await c.eval(`window.__atelier.go('cues'), true`);
  if (!(await waitExpr(c, `window.__atelier.station() === 'cues' && !window.__shell.moving()
    && !!document.querySelector('#ob-atelier-rail .ob-cardrail-card[data-id="${TRY_CUE}"]')`, 150, 150))) {
    fail(`${tag}: the cues station never presented ${TRY_CUE}`); return;
  }
  let prev = null; // the rail strip at rest (its own snap scroll) before the pick
  for (let i = 0; i < 40; i++) {
    const sl = await c.eval(`document.querySelector('[data-ob="atelier-rail-cards"]')?.scrollLeft ?? null`);
    if (sl !== null && sl === prev) break;
    prev = sl; await sleep(150);
  }
  if (!(await input(c, `#ob-atelier-rail .ob-cardrail-card[data-id="${TRY_CUE}"]`, tag))) return;
  if (!(await waitExpr(c, `document.querySelector('[data-ob="atelier-tryit"]')?.getClientRects().length > 0`, 60, 150))) {
    fail(`${tag}: the cue card never offered Try it`); return;
  }
  await sleep(300);
  if (!(await input(c, '[data-ob="atelier-tryit"]', tag))) return;
  // a progressed rack asks the try-it consent first (GH-534 F2) — accept it
  await sleep(400);
  if (await c.eval(`document.querySelector('${CONFIRM} [data-ob="confirm-accept"]') !== null`)) {
    await input(c, `${CONFIRM} [data-ob="confirm-accept"]`, tag);
  }
  if (!(await waitExpr(c, `window.__settings.get().mode === 'playground' && window.__shell.isOpen() === false && !window.__shell.moving()`, 200, 150))) {
    fail(`${tag}: Try it never landed in the playground at the table: ` + JSON.stringify(await state(c))); return;
  }
  const LAW = `(() => {
    const bed = window.__test.bed();
    const W = bed.tableWidth, L = bed.tableLength;
    const up = window.__test.balls().filter((b) => !b.pocketed);
    const at = (id) => { const b = up.find((x) => x.id === id); return b ? { x: b.pos[2], y: b.pos[0] } : null; };
    const cue = at(0), obj = at(${target});
    const near = (p, x, y) => !!p && Math.abs(p.x - x) < 1e-6 && Math.abs(p.y - y) < 1e-6;
    return { ids: up.map((b) => b.id).sort((a, b) => a - b), cueOk: near(cue, -W * 0.1, -L * 0.25),
      objOk: near(obj, 0, L * 0.25), drill: window.__drills.state(), mode: window.__settings.get().mode,
      game: window.__settings.get().game, rules: window.__rules.game(),
      fold: window.__rules.foldRuleset?.() ?? null,
      title: document.querySelector('#hud h1')?.textContent ?? null };
  })()`;
  const judge = (r, when) => {
    if (JSON.stringify(r.ids) !== JSON.stringify([0, target]) || !r.cueOk || !r.objOk) {
      fail(`${tag}: ${when} the table must hold the two-ball comparison layout (cue + ${target} at the authored spots), never a full rack: ` + JSON.stringify(r));
      return false;
    }
    if (r.drill !== null || r.mode !== 'playground') { fail(`${tag}: ${when} drill ended, playground: ` + JSON.stringify(r)); return false; }
    if (restoredGame && (r.game !== restoredGame || r.rules !== restoredGame)) {
      fail(`${tag}: ${when} the drill's session pin is restored (rules = saved = ${restoredGame}): ` + JSON.stringify(r)); return false;
    }
    // review r2: the comparison layout's FOLD and hud title belong to the
    // restored game too (pre-fix: folded + titled under the 9-ball pin)
    if (restoredGame) {
      const title = hudTitleOf(restoredGame);
      const foldRe = FOLD_OF[restoredGame];
      if (r.title !== title || (foldRe && !foldRe.test(r.fold ?? ''))) {
        fail(`${tag}: ${when} the comparison layout's rules + hud title must be the restored ${restoredGame} (title ${JSON.stringify(title)}, fold ${foldRe}): ` + JSON.stringify(r)); return false;
      }
    }
    return true;
  };
  if (!judge(await c.eval(LAW), 'at landing')) return;
  await sleep(2500); // a queued teardown lands within a few frames — hold well past it
  const late = await c.eval(LAW);
  if (judge(late, '2.5 s later')) console.log(`${tag}: comparison layout held (cue + ${target}), drill ended${restoredGame ? `, ${restoredGame} restored (fold ${late.fold}, title ${JSON.stringify(late.title)})` : ''}`);
}
async function legD7(c, tag) {
  // LIVE: 8-Ball → a pool drill (the session pins 9-ball) → Try it
  if (!(await switchGameByCard(c, 'eight_ball', tag))) return;
  if (!(await pickDrill(c, 'bu-f2', tag))) return;
  if (!(await waitExpr(c, `window.__drills?.state?.()?.id === 'bu-f2' && window.__drills.state().done === false
    && ${JSON.stringify(QUIET)}.includes(window.__test.state())`, 200, 150))) { fail(`${tag}: live fixture never started`); return; }
  await sleep(600);
  await tryItKeepsComparison(c, `${tag} live`, { restoredGame: 'eight_ball' });
}
async function legD8(c, tag) {
  // review r2: one more non-9-ball game — 10-Ball → a pool drill → Try it
  if (!(await backToPlay(c, tag))) return;
  if (!(await switchGameByCard(c, 'ten_ball', tag))) return;
  if (!(await pickDrill(c, 'bu-f2', tag))) return;
  await sleep(500);
  if (await c.eval(`document.querySelector('${CONFIRM} [data-ob="confirm-accept"]') !== null`)) {
    await clickEl(c, `${CONFIRM} [data-ob="confirm-accept"]`, tag);
  }
  if (!(await waitExpr(c, `window.__drills?.state?.()?.id === 'bu-f2' && window.__drills.state().done === false
    && ${JSON.stringify(QUIET)}.includes(window.__test.state())`, 200, 150))) { fail(`${tag}: live fixture never started`); return; }
  await sleep(600);
  await tryItKeepsComparison(c, `${tag} live 10-ball`, { restoredGame: 'ten_ball' });
}
async function legD7p(c, tag) {
  // PARKED: a completed run (finished snapshot) → Try it. The completing
  // stroke is the e2e-practice seed idiom (a scripted miss on the circle)
  if (!(await backToPlay(c, tag))) return;
  if (await c.eval('window.__rules.game()') !== 'eight_ball') { if (!(await switchGameByCard(c, 'eight_ball', tag))) return; }
  if (!(await pickDrill(c, 'circle', tag))) return;
  await sleep(500);
  if (await c.eval(`document.querySelector('${CONFIRM} [data-ob="confirm-accept"]') !== null`)) {
    await clickEl(c, `${CONFIRM} [data-ob="confirm-accept"]`, tag);
  }
  if (!(await waitExpr(c, `window.__drills?.state?.()?.id === 'circle' && ${JSON.stringify(QUIET)}.includes(window.__test.state())`, 200, 150))) {
    fail(`${tag}: circle never started`); return;
  }
  await sleep(400);
  const err = await c.eval('__test.shoot({ v0: 2.4, phi: -Math.PI / 2, theta: 0, a: 0, b: 0 })');
  if (err) { fail(`${tag}: the completing stroke was refused: ` + err); return; }
  await settleShot(c, tag);
  if (!(await waitExpr(c, `window.__drills.state()?.done === true`, 100, 150))) {
    fail(`${tag}: fixture: the run never parked (done): ` + JSON.stringify((await state(c)).drill)); return;
  }
  await sleep(500);
  await tryItKeepsComparison(c, `${tag} parked`, { restoredGame: 'eight_ball' });
}

// ---- D9 — #1041: the Century run (14.1) from the carom and the snooker table
// takes the pool table (decision (a)), then pins 14.1 session-only; Stop
// hands back agreeing table / rules / saved game / title / hall card ---------
async function centuryFrom(c, tag, from) {
  if (!(await backToPlay(c, tag))) return;
  if (!(await switchGameByCard(c, from, tag))) return;
  if (!(await clickEl(c, '#ob-drills', tag))) return;
  if (!(await waitExpr(c, `document.querySelector('.ob-drills__card[data-drill="century"]')?.getClientRects().length > 0`, 60))) {
    fail(`${tag}: the picker never showed the Century run card`); return;
  }
  const badge = await c.eval(`(() => { const b = document.querySelector('[data-req="century"]'); return b && b.style.display !== 'none' ? b.textContent : null; })()`);
  const want = EN['drills.switchesGame'].replace('{game}', EN['game.nine_ball']);
  if (badge !== want) fail(`${tag}: on ${from} the Century card must declare the switch: ${JSON.stringify(badge)} (want ${JSON.stringify(want)})`);
  await sleep(350);
  if (!(await clickEl(c, '.ob-drills__card[data-drill="century"]', tag))) return;
  await sleep(500);
  if (await c.eval(`document.querySelector('${CONFIRM} [data-ob="confirm-accept"]') !== null`)) {
    await clickEl(c, `${CONFIRM} [data-ob="confirm-accept"]`, tag);
  }
  if (!(await waitExpr(c, `window.__drills?.state?.()?.id === 'century' && ${JSON.stringify(QUIET)}.includes(window.__test.state())`, 300, 200))) {
    fail(`${tag}: the Century run never started from ${from} (#1041 pre-fix: rules-only switch, or a refusal after it): ` + JSON.stringify(await state(c))); return;
  }
  await sleep(600);
  let s = await state(c);
  if (s.rules !== 'straight_pool' || s.game !== 'straight_pool' || s.stored !== 'nine_ball') {
    fail(`${tag}: run: rules = saved = straight_pool (session pin) over the PERSISTED 9-ball pool table: ` + JSON.stringify({ rules: s.rules, game: s.game, stored: s.stored }));
  }
  if (!isPoolTuple(s.eq)) fail(`${tag}: the Century run must play on the pool pairing, never a ${from} axis: ` + JSON.stringify(s.eq));
  if (s.title !== EN['game.straight_pool']) fail(`${tag}: HUD title ${JSON.stringify(s.title)} (want ${JSON.stringify(EN['game.straight_pool'])})`);
  const cue = await c.eval('window.__aim?.ballScreen?.(0) ?? null');
  if (cue) {
    const hue = await clothHue(c, cue);
    if (!(hue.n >= 8 && hue.median > 8)) fail(`${tag}: REAL screenshot beside the cue ball must read pool cloth, not the ${from} cloth: ` + JSON.stringify(hue));
  } else fail(`${tag}: no cue ball on screen`);
  // Stop → the 9-ball session restore + a fresh rack; table, rules, saved game,
  // title and the hall's current card agree; Re-rack keeps them agreeing
  if (!(await clickEl(c, '#ob-drill-stop', tag))) return;
  if (!(await waitExpr(c, `document.querySelector('${CONFIRM} [data-ob="confirm-accept"]') !== null`, 50))) { fail(`${tag}: no stop confirm`); return; }
  if (!(await clickEl(c, `${CONFIRM} [data-ob="confirm-accept"]`, tag))) return;
  if (!(await waitExpr(c, FRESH('nine_ball', range(1, 9)), 200, 150))) {
    fail(`${tag}: Stop must hand back a fresh 9-ball rack (the restored session game): ` + JSON.stringify(await state(c))); return;
  }
  if (!(await rerackClick(c, tag))) return;
  await waitQuiet(c);
  await sleep(400);
  s = await state(c);
  if (s.rules !== s.game || s.rules !== 'nine_ball' || s.title !== hudTitleOf('nine_ball') || !isPoolTuple(s.eq)) {
    fail(`${tag}: after Re-rack table / rules / saved game / title must agree on 9-ball: ` + JSON.stringify(s));
  }
  if (!(await openHallAt(c, 'play', tag))) return;
  s = await state(c);
  if (!same(s.current, [s.rules])) fail(`${tag}: the hall's current card must name the live game: ` + JSON.stringify({ current: s.current, rules: s.rules }));
  await toTable(c, tag);
  console.log(`${tag}: Century from ${from} ran on the pool table (rules straight_pool, title "${EN['game.straight_pool']}"), Stop + Re-rack agree on 9-ball`);
}
async function legD9(c, tag) {
  await centuryFrom(c, `${tag} carom`, 'carom_3cushion');
  await centuryFrom(c, `${tag} snooker`, 'snooker');
}

// ---- W — #1027: Free practice entered during the WIN hold ------------------------
// The 2600 ms WIN continuation (flow banterTimer) is the only way out of WIN;
// pre-fix the playground mode edge cleared it and the sandbox stayed dead at
// "WIN — re-racking…" with Shoot disabled. The called-8 win is staged with
// the QA seams (the issue's own repro); the Shoot press and the hall journey
// are real input. Timing-free: the machine must leave WIN by ITSELF (bounded
// poll), land a full rack in the sandbox, Shoot live.
const STAGE_8_WIN = `(() => {
  window.__test.layout([{ id: 0, x: 0.30, y: 0.935 }, { id: 8, x: 0.50, y: 1.135 }]);
  window.__rules.setMatchState({ phase: 'grouped', groups: { 1: 'solids', 2: 'stripes' }, onTable: [8] });
  window.__test.aim(Math.PI / 4);
  return window.__rules.call(8, 5);
})()`;
const SANDBOX = `(() => { const st = document.getElementById('state')?.textContent ?? '';
  const n = window.__test.balls().filter((b) => !b.pocketed).length;
  return { machine: window.__test.state(), mode: window.__settings.get().mode, state: st,
    shoot: document.getElementById('shoot')?.disabled, n }; })()`;
async function winThenFreePractice(c, tag, { input = clickEl, path = 'hall', expectInside = true } = {}) {
  if (await c.eval('window.__rules.game()') !== 'eight_ball') { if (!(await switchGameByCard(c, 'eight_ball', tag, input))) return null; }
  if (!(await backToPlay(c, tag, input))) return null;
  if (!(await c.eval(`(() => { window.__test.rerack(window.__test.bed().seed); return true; })()`))) return null;
  await waitQuiet(c);
  await sleep(300);
  const called = await c.eval(STAGE_8_WIN);
  await sleep(300);
  if (!(await input(c, '#shoot', tag))) return null;
  if (!(await waitExpr(c, `window.__test.state() === 'WIN'`, 400, 25))) { fail(`${tag}: fixture: the staged called-8 shot never won (call ${JSON.stringify(called)}): ` + JSON.stringify(await c.eval(SANDBOX))); return null; }
  let inside;
  if (path === 'api') {
    inside = await c.eval(`(() => { const w = window.__test.state() === 'WIN'; window.__settings.changeMode('playground'); return w; })()`);
  } else {
    if (!expectInside) { // control: the hold's own re-rack lands first
      await waitExpr(c, `window.__test.state() !== 'WIN'`, 200, 100);
    }
    if (!(await openHallAt(c, 'practice', tag, input))) return null;
    if (!(await input(c, '[data-ob="practice-playground"] button', tag))) return null;
    await waitExpr(c, `document.querySelector('${CONFIRM} [data-ob="confirm-accept"]') !== null || window.__settings.get().mode === 'playground'`, 40, 50);
    if (await c.eval(`document.querySelector('${CONFIRM} [data-ob="confirm-accept"]') !== null`)) {
      if (!(await input(c, `${CONFIRM} [data-ob="confirm-accept"]`, tag))) return null;
    }
    inside = await c.eval(`window.__test.state() === 'WIN'`);
  }
  // the machine leaves WIN by itself (pre-fix: stuck forever), into the sandbox
  const left = await waitExpr(c, `(() => { const r = ${SANDBOX}; return r.mode === 'playground'
    && ['AIM', 'BALL_IN_HAND'].includes(r.machine) && r.shoot === false && r.n === 16; })()`, 150, 100);
  const r = await c.eval(SANDBOX);
  const wantState = `${EN['state.aim']} — ${EN['playground.aimHint']}`;
  if (!left || r.state !== wantState || r.state.includes(EN['flow.reracking'])) {
    fail(`${tag}: ${inside ? 'inside' : 'after'} the WIN hold, Free practice must land in a live sandbox on a full rack ("${wantState}", Shoot enabled): ` + JSON.stringify(r));
    return { inside, ok: false };
  }
  return { inside, ok: true };
}
async function legW(c, tag) {
  const api = await winThenFreePractice(c, `${tag} api`, { path: 'api' });
  if (api && api.inside !== true) fail(`${tag} api: fixture: the mode switch must land INSIDE the hold`);
  const real = await winThenFreePractice(c, `${tag} real`, { path: 'hall' });
  if (real) console.log(`${tag} real: the real-click accept landed ${real.inside ? 'INSIDE' : 'AFTER (control)'} the WIN hold — sandbox live`);
  const ctl = await winThenFreePractice(c, `${tag} control`, { path: 'hall', expectInside: false });
  if (ctl && ctl.inside !== false) fail(`${tag} control: fixture: the accept must land after the hold's re-rack`);
  if (api?.ok && ctl?.ok) {
    // real screenshot: the Shoot button paints the same as on the control leg
    // (fresh Free practice), and the status line text is the sandbox's
    const lum = async () => { const pt = await centerOf(c, '#shoot'); if (!pt) return null;
      // the same paint state on both captures: no hover (the in-hold leg's
      // own Shoot click leaves the pointer ON the button) and no focus
      await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 2, y: 2 });
      await c.eval('document.activeElement?.blur?.(), true');
      await sleep(400);
      const shot = await c.send('Page.captureScreenshot', { format: 'png' }); const img = decodePng(Buffer.from(shot.data, 'base64'));
      let sum = 0, n = 0; for (let dy = -4; dy <= 4; dy += 2) for (let dx = -12; dx <= 12; dx += 4) {
        const x = Math.round(pt.x + dx), y = Math.round(pt.y + dy); const i = (y * img.w + x) * img.bpp;
        sum += 0.2126 * img.px[i] + 0.7152 * img.px[i + 1] + 0.0722 * img.px[i + 2]; n += 1; }
      return sum / n; };
    const lc = await lum();
    await winThenFreePractice(c, `${tag} api2`, { path: 'api' });
    const lb = await lum();
    if (lc === null || lb === null || Math.abs(lc - lb) > 12) fail(`${tag}: REAL screenshot — Shoot after the in-hold entry must paint like the fresh-entry control (luma ${lb} vs ${lc})`);
    else console.log(`${tag}: Shoot luma in-hold ${lb.toFixed(1)} vs control ${lc.toFixed(1)}`);
  }
}

async function armD(legs, tag0) {
  const errs = [];
  const f0 = failCount;
  const c = await launchChrome(bootUrl('seed=1&u=' + tag0), { port: CDP_PORT, tool: false, width: 1440, height: 900 });
  watchErrors(c, errs);
  try {
    await c.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    if (!(await waitReady(c))) { fail(`${tag0}: boot never ready`); return; }
    if (!(await waitExpr(c, 'window.__shell?.isOpen?.() === true && __shell.moving() === false', 150, 200))) {
      fail(`${tag0}: the real-user boot never presented the hall`); return;
    }
    if (!(await waitExpr(c, 'typeof window.__drills?.start === "function" && document.getElementById("ob-drills") !== null', 100, 150))) {
      fail(`${tag0}: __drills never landed`); return;
    }
    if (!(await toTable(c, tag0))) return;
    for (const [tag, leg] of legs) {
      const f1 = failCount;
      try { await leg(c, tag); } catch (e) { fail(`${tag}: leg threw: ${e?.stack ?? e}`); }
      if (failCount === f1) { console.log(`${tag} OK`); okCount += 1; }
      await gateErrors(c, errs, tag);
    }
    await armOk(c, errs, f0, `${tag0} OK: ${legs.map(([t]) => t).join(' ')} on a desktop real-user boot (real clicks)`);
  } finally { c.close(); }
}

// ---- P1 — phone journey (taps) ----------------------------------------------
async function armP1() {
  const errs = [];
  const f0 = failCount;
  const tag = 'P1';
  const c = await launchPhone(bootUrl('seed=1&u=p1'), { cdpPort: CDP_PORT + 1, width: 844, height: 390, tool: false });
  watchErrors(c, errs);
  try {
    if (!(await waitReady(c))) { fail(`${tag}: boot never ready`); return; }
    if (!(await waitExpr(c, 'window.__shell?.isOpen?.() === true && __shell.moving() === false', 150, 200))) { fail(`${tag}: no hall`); return; }
    if (!(await waitExpr(c, 'typeof window.__drills?.start === "function"', 100, 150))) { fail(`${tag}: __drills never landed`); return; }
    if (!(await toTable(c, tag, tapEl))) return;
    if (!(await switchGameByCard(c, 'eight_ball', tag, tapEl))) return;
    if (!(await tapEl(c, '#shoot', tag))) return;
    await settleShot(c, tag);
    if (!(await pickDrill(c, 'bu-f1', tag, tapEl))) return;
    if (!(await waitExpr(c, `document.querySelector('${CONFIRM} [data-ob="confirm-accept"]') !== null`, 50))) {
      fail(`${tag}: the progressed frame must raise the consent on phone`); return;
    }
    if (!(await tapEl(c, `${CONFIRM} [data-ob="confirm-accept"]`, tag))) return;
    if (!(await waitExpr(c, `window.__drills?.state?.()?.id === 'bu-f1'`, 150, 150))) { fail(`${tag}: the drill never started`); return; }
    if (!(await openHallAt(c, 'play', tag, tapEl))) return;
    // Back to play sits below the fold of the phone Play card: swipe the
    // card's scroll box until it is hittable (the QA journey's gesture)
    for (let i = 0; i < 6; i++) {
      const pt = await c.eval(`(() => { const b = document.querySelector('[data-ob="play-back"]'); if (!b) return null;
        const r = b.getBoundingClientRect(); const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return { ok: !!el && b.contains(el) }; })()`);
      if (pt?.ok) break;
      const box = await c.eval(`(() => { const s = document.querySelector('[data-ob="play-back"]')?.closest('.ob-scroll') ?? document.querySelector('.ob-play-host .ob-scroll');
        if (!s) return null; const r = s.getBoundingClientRect(); return { x: r.x + r.width / 2, y0: r.y + r.height * 0.8, y1: r.y + r.height * 0.2 }; })()`);
      if (!box) break;
      await touchStart(c, [{ x: box.x, y: box.y0, id: 1 }]);
      for (let k = 1; k <= 8; k++) { await touchMove(c, [{ x: box.x, y: box.y0 + (box.y1 - box.y0) * k / 8, id: 1 }]); await sleep(30); }
      await touchEnd(c, []);
      await sleep(400);
    }
    if (!(await tapEl(c, '[data-ob="play-back"]', tag))) return;
    if (!(await waitExpr(c, FRESH('eight_ball', range(1, 15)), 200, 150))) {
      fail(`${tag}: Back to play must restore 8-ball on a fresh rack (phone): ` + JSON.stringify(await state(c))); return;
    }
    if (!(await toTable(c, tag, tapEl))) return;
    const s = await state(c);
    if (s.mode !== 'play' || s.stored !== 'eight_ball' || s.shooter !== 1 || s.player !== 1) fail(`${tag}: after Back to play (phone): ` + JSON.stringify(s));
    await armOk(c, errs, f0, 'P1 OK: phone real-user boot — 8-Ball, a real break, the consent tap, the drill, Back to play → a fresh 8-ball rack at seat 1');
  } finally { c.close(); }
}

// ---- P2 — phone: Try it from a LIVE drill (taps) -----------------------------
async function armP2() {
  const errs = [];
  const f0 = failCount;
  const tag = 'P2';
  const c = await launchPhone(bootUrl('seed=1&u=p2'), { cdpPort: CDP_PORT + 1, width: 844, height: 390, tool: false });
  watchErrors(c, errs);
  try {
    if (!(await waitReady(c))) { fail(`${tag}: boot never ready`); return; }
    if (!(await waitExpr(c, 'window.__shell?.isOpen?.() === true && __shell.moving() === false', 150, 200))) { fail(`${tag}: no hall`); return; }
    if (!(await waitExpr(c, 'typeof window.__drills?.start === "function"', 100, 150))) { fail(`${tag}: __drills never landed`); return; }
    if (!(await toTable(c, tag, tapEl))) return;
    if (!(await switchGameByCard(c, 'eight_ball', tag, tapEl))) return;
    if (!(await pickDrill(c, 'bu-f2', tag, tapEl))) return;
    if (!(await waitExpr(c, `window.__drills?.state?.()?.id === 'bu-f2' && ${JSON.stringify(QUIET)}.includes(window.__test.state())`, 200, 150))) {
      fail(`${tag}: live fixture never started`); return;
    }
    await sleep(600);
    await tryItKeepsComparison(c, `${tag} live`, { input: tapEl, restoredGame: 'eight_ball' });
    await armOk(c, errs, f0, 'P2 OK: phone real-user boot — Equipment → cue → Try it from a live drill keeps the two-ball comparison layout');
  } finally { c.close(); }
}

// ---- M — the api matrix (tool boot) -----------------------------------------
const GAMES = ['nine_ball', 'eight_ball', 'ten_ball', 'one_pocket', 'straight_pool', 'heyball', 'snooker', 'carom_3cushion'];
const CLASSES = [
  { id: 'bu-f2', game: 'nine_ball', kind: 'pool' },
  { id: 'ghost9', game: 'nine_ball', kind: 'pool' },
  { id: 'century', game: 'straight_pool', kind: 'pool' },
  { id: 'colours-clear', game: 'snooker', kind: 'snooker' },
];
const EXITS = ['stop', 'play', 'playground', 'rerack', 'switch'];
const NON_POOL = (g) => g === 'snooker' || g.startsWith('carom');

async function armM() {
  const errs = [];
  const f0 = failCount;
  const tag0 = 'M';
  const c = await launchChrome(bootUrl('obtool=1&seed=1'), { port: CDP_PORT + 2, tool: true, width: 1280, height: 800 });
  watchErrors(c, errs);
  const refs = {};
  const settledTo = async (g) => {
    if (!(await waitExpr(c, `window.__rules.game() === ${JSON.stringify(g)} && ${JSON.stringify(QUIET)}.includes(window.__test.state())`, 300, 150))) return false;
    await sleep(300);
    return true;
  };
  /** Stage game g on a fresh rack in Play (the matrix's fixed start). */
  const stage = async (g, tag, probe = false) => {
    await c.eval(`(window.__drills.stop(true), window.__settings.changeMode('play'), true)`);
    await waitQuiet(c);
    // a pristine rack first: a previous row's pending option would refuse
    // the switch (decisionConflict) — the scripted re-rack clears it
    await c.eval('window.__test.rerack(window.__test.bed().seed), true');
    await waitQuiet(c);
    await sleep(200);
    const ok = await c.eval(`window.__settings.changeGame(${JSON.stringify(g)}, { skipConfirm: true })`);
    if (ok !== true) {
      if (!probe) fail(`${tag}: changeGame(${g}) refused at stage: ` + JSON.stringify(await state(c)));
      return false;
    }
    if (!(await settledTo(g))) { fail(`${tag}: ${g} never staged`); return false; }
    await c.eval('window.__test.rerack(window.__test.bed().seed), true');
    await waitQuiet(c);
    await sleep(200);
    const s = await state(c);
    if (s.game !== g || s.mode !== 'play') { fail(`${tag}: stage ${g}: ` + JSON.stringify(s)); return false; }
    if (!refs[g]) refs[g] = s.cloth;
    return true;
  };
  try {
    if (!(await waitReady(c))) { fail(`${tag0}: boot never ready`); return; }
    if (!(await waitExpr(c, 'typeof window.__drills?.start === "function" && window.__rules?.ready?.() === true', 150, 150))) {
      fail(`${tag0}: __drills / rules never landed`); return;
    }
    const offered = [];
    for (const g of GAMES) {
      if (await stage(g, `${tag0}[${g}]`, true)) offered.push(g);
      else console.log(`${tag0}: ${g} refused by changeGame on this boot (capability gate) — its rows are not run`);
    }
    let row = 0;
    for (const g of offered) {
      for (const k of CLASSES) {
        const exit = EXITS[row % EXITS.length];
        row += 1;
        const tag = `${tag0}[${k.id}@${g}→${exit}]`;
        const f1 = failCount;
        if (!(await stage(g, tag))) continue;
        const eq0 = (await state(c)).eq;
        const started = await c.eval(`window.__drills.start(${JSON.stringify(k.id)})`);
        if (started !== true) { fail(`${tag}: start refused: ` + JSON.stringify(await state(c))); continue; }
        await waitQuiet(c);
        await sleep(300);
        let s = await state(c);
        if (s.drill?.id !== k.id || s.rules !== k.game || s.game !== k.game) {
          fail(`${tag}: during the run rules = saved game = ${k.game}: ` + JSON.stringify({ drill: s.drill?.id, rules: s.rules, game: s.game }));
        }
        // a pool drill keeps the user's own pool table (the §3.5 law — the
        // heyball pairing's napped cloth included) and takes the pool
        // pairing from a non-pool table; a snooker drill takes the WPBSA one
        const tableOk = k.kind === 'snooker' ? s.eq?.table_id === 'wpbsa_snooker_12ft'
          : NON_POOL(g) ? isPoolTuple(s.eq) : same(s.eq, eq0);
        if (!tableOk) fail(`${tag}: the drill runs on its table: ` + JSON.stringify({ before: eq0, run: s.eq }));
        // the persisted game the run leaves behind (decision (a) / #80)
        const persisted = k.kind === 'snooker' ? 'snooker' : NON_POOL(g) ? 'nine_ball' : g;
        let expectGame = persisted, expectMode = 'practice';
        if (exit === 'stop') await c.eval('window.__drills.stop(), true');
        else if (exit === 'play') { await c.eval(`window.__settings.changeMode('play'), true`); expectMode = 'play'; }
        else if (exit === 'playground') { await c.eval(`window.__settings.changeMode('playground'), true`); expectMode = 'playground'; }
        else if (exit === 'rerack') await c.eval(`document.getElementById('rerack').click(), true`);
        else {
          expectGame = ['ten_ball', 'one_pocket', 'eight_ball'].find((x) => x !== g && x !== k.game && offered.includes(x));
          const sw = await c.eval(`window.__settings.changeGame(${JSON.stringify(expectGame)}, { skipConfirm: true })`);
          if (sw !== true) fail(`${tag}: the foreign switch was refused`);
        }
        const objects = (refs[expectGame] ?? []).filter((id) => id !== 0);
        const settledExit = await waitExpr(c, `(() => { const s = ${STATE}; return s.drill === null
          && ${JSON.stringify(QUIET)}.includes(s.machine) && s.rules === ${JSON.stringify(expectGame)}
          && JSON.stringify(s.cloth) === ${JSON.stringify(JSON.stringify(refs[expectGame] ?? []))}; })()`, 300, 150);
        s = await state(c);
        if (!settledExit) {
          fail(`${tag}: the exit must hand back a fresh ${expectGame} rack: ` + JSON.stringify({ rules: s.rules, game: s.game, drill: s.drill, machine: s.machine, cloth: s.cloth, ref: refs[expectGame] }));
        } else {
          if (s.game !== expectGame) fail(`${tag}: saved game ${s.game} ≠ rules ${expectGame}`);
          const storedWant = exit === 'switch' ? expectGame : persisted;
          if (s.stored !== storedWant) fail(`${tag}: stored game ${s.stored} (want ${storedWant})`);
          if (s.mode !== expectMode) fail(`${tag}: mode ${s.mode} (want ${expectMode})`);
          if (s.player !== 1) fail(`${tag}: a fresh entry seats P1 (player ${s.player})`);
          if (expectMode !== 'playground' && s.onTable && !same(s.onTable, objects)) {
            fail(`${tag}: onTable must equal the object balls on the cloth: ` + JSON.stringify({ onTable: s.onTable, objects }));
          }
          if (expectMode !== 'playground' && s.shooter !== null && s.shooter !== 1) fail(`${tag}: shooter ${s.shooter} (want 1)`);
        }
        if (failCount === f1) console.log(`${tag} ok`);
      }
    }
    // drill → drill hand-offs keep the FIRST borrow
    {
      const tag = `${tag0}[handoff 8-ball: bu-f2 → century → stop]`;
      if (await stage('eight_ball', tag)) {
        const a = await c.eval(`window.__drills.start('bu-f2')`);
        await waitQuiet(c);
        const b = await c.eval(`window.__drills.start('century')`);
        await waitQuiet(c);
        const mid = await state(c);
        if (a !== true || b !== true || mid.rules !== 'straight_pool' || mid.game !== 'straight_pool') fail(`${tag}: run: ` + JSON.stringify({ a, b, rules: mid.rules, game: mid.game }));
        await c.eval('window.__drills.stop(), true');
        if (!(await waitExpr(c, `(() => { const s = ${STATE}; return s.drill === null && s.rules === 'eight_ball' && s.game === 'eight_ball'
          && JSON.stringify(s.cloth) === ${JSON.stringify(JSON.stringify(refs.eight_ball))}; })()`, 300, 150))) {
          fail(`${tag}: the exit must restore the FIRST drill's borrow (8-ball): ` + JSON.stringify(await state(c)));
        } else console.log(`${tag} ok`);
      }
    }
    {
      const tag = `${tag0}[handoff 8-ball: bu-f2 → colours-clear → stop]`;
      if (await stage('eight_ball', tag)) {
        await c.eval(`window.__drills.start('bu-f2')`);
        await waitQuiet(c);
        const b = await c.eval(`window.__drills.start('colours-clear')`);
        await waitQuiet(c);
        await c.eval('window.__drills.stop(), true');
        if (b !== true || !(await waitExpr(c, `(() => { const s = ${STATE}; return s.drill === null && s.rules === 'snooker' && s.game === 'snooker' && s.stored === 'snooker'
          && JSON.stringify(s.cloth) === ${JSON.stringify(JSON.stringify(refs.snooker))}; })()`, 300, 150))) {
          fail(`${tag}: a persisted snooker switch clears the borrow — the exit lays fresh snooker: ` + JSON.stringify(await state(c)));
        } else console.log(`${tag} ok`);
      }
    }
    // every class refuses mid-shot
    {
      const tag = `${tag0}[mid-shot]`;
      if (await stage('nine_ball', tag)) {
        await c.eval('window.__test.shoot({ v0: 6, phi: Math.PI / 2, theta: 0, a: 0, b: 0 })');
        if (await waitExpr(c, `window.__test.state() === 'PLAYBACK'`, 60, 30)) {
          const res = await c.eval(`(async () => { const out = [];
            for (const id of ${JSON.stringify(CLASSES.map((k) => k.id))}) out.push([id, await window.__drills.start(id), window.__test.state()]);
            return out; })()`);
          for (const [id, ok, m] of res) {
            if (ok !== false) fail(`${tag}: ${id} started mid-shot (state ${m})`);
          }
          await waitQuiet(c, 400);
          const s = await state(c);
          if (s.drill !== null || s.rules !== 'nine_ball') fail(`${tag}: after the shot: ` + JSON.stringify({ drill: s.drill, rules: s.rules }));
          else console.log(`${tag} ok: ${res.map(([id, ok, m]) => `${id}=${ok}@${m}`).join(' ')}`);
        } else fail(`${tag}: the probe shot never reached PLAYBACK`);
      }
    }
    // every class refuses on a pending decision of a progressed rack
    {
      const tag = `${tag0}[decision]`;
      if (await stage('eight_ball', tag)) {
        await c.eval('window.__test.shoot({ v0: 0.9 })');
        await waitQuiet(c, 400);
        const before = await state(c);
        if (!before.pending || before.pristine !== false) fail(`${tag}: fixture: no pending decision: ` + JSON.stringify(before));
        else {
          for (const k of CLASSES) {
            const ok = await c.eval(`window.__drills.start(${JSON.stringify(k.id)})`);
            const s = await state(c);
            if (ok !== false || s.drill !== null || !same(s.pending, before.pending) || s.rules !== 'eight_ball' || s.shotIndex !== before.shotIndex) {
              fail(`${tag}: ${k.id} must refuse with the frame intact: ` + JSON.stringify({ ok, drill: s.drill, pending: s.pending, rules: s.rules }));
            }
          }
          console.log(`${tag}: ${CLASSES.length} classes judged on ${JSON.stringify(before.pending)}`);
        }
      }
    }
    // #982 seat: a drill session that ends with P2 on turn (a fold-observer
    // drill's real turnover — ghost9 after a dry break) hands Play a NEW
    // match: breaker seat 1 (pre-fix the same-discipline re-rack kept P2)
    {
      const tag = `${tag0}[drill exit seat]`;
      if (await stage('nine_ball', tag)) {
        const ok = await c.eval(`window.__drills.start('ghost9')`);
        await waitQuiet(c);
        await sleep(400);
        await c.eval('window.__test.shoot({ v0: 2.0 })');
        await waitQuiet(c, 400);
        await sleep(600);
        const mid = await state(c);
        await c.eval(`window.__settings.changeMode('play'), true`);
        const landed = await waitExpr(c, `(() => { const s = ${STATE}; return s.drill === null && s.mode === 'play'
          && JSON.stringify(s.cloth) === ${JSON.stringify(JSON.stringify(refs.nine_ball ?? []))}; })()`, 300, 150);
        await sleep(300);
        const s = await state(c);
        if (ok !== true || mid.drill?.id !== 'ghost9' || mid.player !== 2) {
          fail(`${tag}: fixture: a live ghost9 run with P2 on turn after the dry break: ` + JSON.stringify({ ok, drill: mid.drill?.id, player: mid.player, shooter: mid.shooter }));
        } else if (!landed || s.player !== 1 || s.shooter !== 1) {
          fail(`${tag}: leaving the drill for Play must seat P1 on a fresh rack (was ${mid.player}): ` + JSON.stringify({ landed, player: s.player, shooter: s.shooter }));
        } else console.log(`${tag} ok: ghost9 P2 → Play → P1`);
      }
    }
    // J9-F5: the playground → play leg seats a new match
    {
      const tag = `${tag0}[playground → play seat]`;
      if (await stage('nine_ball', tag)) {
        await c.eval('window.__test.shoot({ v0: 2.0 })');
        await waitQuiet(c, 400);
        const p0 = await c.eval('window.__rules.player()');
        if (p0 !== 2) console.log(`${tag}: the probe break left seat ${p0} on turn — the seat law is judged on it anyway`);
        await c.eval(`window.__settings.changeMode('playground'), true`);
        await sleep(300);
        await c.eval(`window.__settings.changeMode('play'), true`);
        await waitQuiet(c);
        await sleep(300);
        const s = await state(c);
        if (s.player !== 1 || s.shooter !== 1) fail(`${tag}: leaving the sandbox must seat P1 (was ${p0}): ` + JSON.stringify({ player: s.player, shooter: s.shooter }));
        if (p0 !== 2) fail(`${tag}: fixture: the break must hand the turn to P2 for the seat law to be judged (seat ${p0})`);
        else if (s.player === 1 && s.shooter === 1) console.log(`${tag} ok: P2 → playground → play → P1`);
      }
    }
    // a persisted switch under a session-only pin stashes the PERSISTED
    // game's pairing (pre-fix the outgoing key was the pinned game: the
    // 8-ball tuple overwrote the 9-ball pairing). Last leg: it leaves the
    // 8-ball pairing on the 7-ft table.
    {
      const tag = `${tag0}[pairing under the session pin]`;
      if (await stage('eight_ball', tag)) {
        const r = await c.eval(`(async () => {
          const W = (ms) => new Promise((res) => setTimeout(res, ms));
          const quiet = async () => { for (let i = 0; i < 200 && !${JSON.stringify(QUIET)}.includes(window.__test.state()); i++) await W(100); await W(200); };
          const tableOf = () => window.__test.equipment().table_id;
          // 14.1's own saved table (the matrix staged it earlier)
          await window.__settings.changeGame('straight_pool', { skipConfirm: true }); await quiet();
          const straight0 = tableOf();
          await window.__settings.changeGame('eight_ball', { skipConfirm: true }); await quiet();
          const own = await window.__settings.changeEquipment('table_id', 'pool_pro_7ft', { skipConfirm: true }); await quiet();
          const started = await window.__drills.start('century'); await quiet();
          const pinned = window.__settings.get().game;
          const sw = await window.__settings.changeGame('snooker', { skipConfirm: true }); await quiet();
          await window.__settings.changeGame('straight_pool', { skipConfirm: true }); await quiet();
          const straight = tableOf();
          await window.__settings.changeGame('eight_ball', { skipConfirm: true }); await quiet();
          const eight = tableOf();
          return { straight0, own, started, pinned, sw, straight, eight };
        })()`);
        if (r.own !== true || r.started !== true || r.pinned !== 'straight_pool' || r.sw !== true || r.straight0 === 'pool_pro_7ft') {
          fail(`${tag}: fixture: ` + JSON.stringify(r));
        } else if (r.eight !== 'pool_pro_7ft' || r.straight !== r.straight0) {
          fail(`${tag}: 8-ball keeps its 7-ft table; the pinned 14.1 comes back on its OWN table: ` + JSON.stringify(r));
        } else console.log(`${tag} ok: eight_ball ${r.eight}, straight_pool ${r.straight}`);
      }
    }
    await armOk(c, errs, f0, `M OK: ${row} matrix rows (${offered.length} games × ${CLASSES.length} drill classes, exits rotated) + hand-offs + mid-shot + decision + the playground seat + the pairing stash`);
  } finally { c.close(); }
}

// ---- SG — the switch-idle contract guard ------------------------------------
/** SWITCH_IDLE reads two overlay markers. On a tree that ships ui/switchprogress.js, one REAL card switch must show
 * BOTH while it runs and drop BOTH once it lands. If the overlay ever renames them, this arm fails instead of every
 * click silently waiting on nothing. A tree without the overlay prints that the guard does not apply. */
async function armSG() {
  const errs = [];
  const f0 = failCount;
  const tag = 'SG';
  const c = await launchChrome(bootUrl('seed=1&u=sg'), { port: CDP_PORT, tool: false, width: 1440, height: 900 });
  watchErrors(c, errs);
  try {
    await c.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    if (!(await waitReady(c))) { fail(`${tag}: boot never ready`); return; }
    if (!(await waitExpr(c, 'window.__shell?.isOpen?.() === true && __shell.moving() === false', 150, 200))) {
      fail(`${tag}: the real-user boot never presented the hall`); return;
    }
    const ships = await c.eval(`fetch('/app/ui/switchprogress.js', { cache: 'no-store' }).then((r) => r.ok, () => false)`);
    await c.eval(`(() => { const h = document.documentElement, r = window.__sgMarks = { flag: false, ov: false };
      new MutationObserver(() => { if (h.hasAttribute('data-ob-switching')) r.flag = true;
        if (document.querySelector('[data-ob="switch-progress"]')) r.ov = true; })
        .observe(h, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-ob-switching'] });
      return true; })()`);
    if (!(await switchGameByCard(c, 'snooker', tag))) return;
    const marks = await c.eval('window.__sgMarks');
    // the overlay leaves on its own clock (MIN_SHOWN + the leave) after the switch lands: bounded, never instant
    const idle = await waitExpr(c, SWITCH_IDLE, 600, 100);
    if (ships) {
      if (!marks.flag || !marks.ov) {
        fail(`${tag}: a real switch on a tree with ui/switchprogress.js must show html[data-ob-switching] AND [data-ob="switch-progress"] (SWITCH_IDLE reads both): ` + JSON.stringify(marks));
      }
      if (!idle) fail(`${tag}: both overlay markers must be gone within 60 s of the switch landing (SWITCH_IDLE)`);
      if (failCount === f0) console.log(`${tag}: a real switch showed both overlay markers and dropped both once it landed`);
    } else console.log(`${tag}: this tree ships no ui/switchprogress.js (pre-#974): the marker guard does not apply`);
    await armOk(c, errs, f0, `${tag} OK: the switch-idle contract (SWITCH_IDLE) matches the overlay`);
  } finally { c.close(); }
}

// ---- run ----------------------------------------------------------------------
const ARMS = [
  ['SG', armSG],
  ['D-a', () => armD([['D1', legD1], ['D2', legD2]], 'D-a')],
  ['D-b', () => armD([['D3', legD3], ['D4', legD4]], 'D-b')],
  ['D-c', () => armD([['D5', legD5], ['D6', legD6]], 'D-c')],
  ['D-d', () => armD([['D7', legD7], ['D7p', legD7p], ['D8', legD8]], 'D-d')],
  ['D-e', () => armD([['D9', legD9], ['W', legW]], 'D-e')],
  ['P1', armP1],
  ['P2', armP2],
  ['M', armM],
];
// OB_E2E_DRILLSESSION_ARMS=D-a,M narrows a local run (never set in CI)
const only = (process.env.OB_E2E_DRILLSESSION_ARMS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const server = spawnStaticServer(webDir, PORT);
await sleep(700);
try {
  for (const [tag, arm] of ARMS) {
    if (only.length && !only.includes(tag)) continue;
    const f0 = failCount;
    try { await arm(); } catch (e) { fail(`${tag}: arm threw: ${e?.stack ?? e}`); }
    if (failCount !== f0) console.error(`E2E-DRILLSESSION: ${tag} red (${failCount - f0})`);
  }
} finally {
  await stopStaticServer(server);
}
console.log(process.exitCode ? 'E2E-DRILLSESSION FAIL' : `E2E-DRILLSESSION PASS (${okCount} arms)`);
