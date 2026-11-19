// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-touch.mjs — feature-014 touch e2e driver (contracts/touch-e2e.md §3.1,
// T010/T011/T012). US1 flow + gesture-law scenarios on phone emulation.
//
//   node web/tools/e2e-touch.mjs [--url http://…/app.html] [--port 8259]
//                                [--viewport 844x390] [--scenario <n|name>]
//                                [--desktop-inert]  (T029: fine-pointer
//                                inertness probe, touch-e2e.md §4.3 — runs
//                                instead of the phone scenarios)
//
// Harness (frozen recipe, touch-e2e.md §1): the in-house CDP client via
// web/tools/touch-cdp.mjs — Emulation.setDeviceMetricsOverride{mobile:true,
// deviceScaleFactor:3} + setTouchEmulationEnabled{maxTouchPoints:5} BEFORE
// Page.navigate; gestures via Input.dispatchTouchEvent (never
// setEmitTouchEventsForMouse). Coarse-pointer mechanism (RECORDED): the
// metrics/touch overrides flip matchMedia('(pointer: coarse)') on this
// Chrome build — verifyCoarse() re-proves it at boot and fails loudly with
// the --blink-settings=primaryPointerType=coarse fallback instructions if a
// build ever stops propagating it (see touch-cdp.mjs header). Every scenario
// uses that one mechanism.
//
// Battery conventions (e2e-ui.mjs precedent): obtool boot stamp (launchPhone
// stamps the app URL), hermetic Chrome profile, self-served web/ on a
// suite-unique verified-free port (OB_E2E_PORT/OB_E2E_CDP_PORT overrides),
// zero-console-error gate, PASS/FAIL exit codes, /tmp screenshot artifact on
// scenario failure. Default viewport 844x390 (phone-hud.md §6).
//
// HARD GLOBAL WATCHDOG: a hung scenario (naked CDP await, dead Chrome, stuck
// page) can never hang the caller — after OB_E2E_WATCHDOG_MS (default
// 420000: the default battery now settles real shot playbacks) the suite
// prints diagnostics and hard-exits 2. Every in-scenario wait is itself a
// bounded poll.
//
// Scenario matrix implemented here (touch-e2e.md §3.1): rows 1–11 and
// 13–14 run by default; row 12 runs as `--scenario fullrack` (T012 — a
// scripted 8-ball sequence break → called pot → spin scratch → ball-in-hand
// → win, every PLAYER INPUT synthesized touch, scene/match shaping through
// the same __test/__rules seams as e2e-8ball.mjs). Row 9 (pocket-tap zones
// + picker fallback) completed with the T032 picker surface (T031/US3).
// Row 15 (feature 024, T019): help overlay on a touch boot — pill entry by
// real tap, touch-first ordering + expansion (SC-003 arm 2), collapsed
// sections tap-expandable, 44pt tap floor inside the overlay, neutral
// open/close. Expected red until the 024 integrator applies hunk A (T024).
// Row 16 (issue #46, touch-input.md §8.1): tap-to-aim quick aim — an
// object-ball tap lands phi on the cue→center azimuth bit-exact with the
// camera pose bit-unchanged; cue-ball/empty taps stay strict no-ops; the
// overlap arm proves the cue-claim law (nearest claimant wins, cue = no-op
// claimant in third person, never an absolute pre-empt). Runs
// in the TAP GROUP right after row 2 (see the registry ORDERING LAW: on
// this Chrome build canvas taps dispatched after the rows-5/6 multi-finger
// gestures + the row-13 renavigation arrive as converted mouse events).
// Row 17 (issue #60): long-press selection defense — representative chrome
// nodes (toolbar pill, HUD, FIRE pill, drawer row, dialog button) and the
// renderer canvas compute `user-select: none` under the touch.css #60
// doubly-gated block; tap-highlight transparent ONLY on the #49
// pressed-ladder carriers; touch-action manipulation on matrix-uncovered
// controls (canvas keeps `none`). Computed-style reads only — no canvas
// taps, so the row is ordering-law immune and runs last. The
// --desktop-inert arm carries the inverse: body user-select stays `auto`
// on fine-pointer boots (the defense is touch-gated, SC-002).
// Row 18 (issue #69): camera during motion — the S4 camera rows work in
// EVERY machine state (two-finger orbit/pinch + three-finger pan during
// live PLAYBACK, the AIM→PLAYBACK gesture-straddle arm for the scoped
// stateChange reset, aim-view mid-motion disengage-in-place, in-app
// replay camera). Multi-finger + DOM only — no canvas taps — so it runs
// after rows 5/6 and BEFORE the row-13 renavigation (ordering law).
// Row 19 (issue #70): in-gesture power precision — off-axis gearing on
// the power gauge (quantified on-axis vs off-axis dv ratio, anchor-rebase
// continuity, promoted readout, the gauge-gesture-only haptic tick
// producer law, exact 0.5/12 rail-end saturation preserved, and the
// pointer-ownership leg: an intruding second pointer never reseeds/
// integrates and the owner's gesture survives its up).
// Element-scoped gauge gestures only — no canvas taps — registered after
// row 18 and before the row-13 renavigation (ordering law).
// Row 20 (issue #71): transient banners are passive chrome — the foul
// banner band hit-tests the canvas (pointer-events: none), FIRE stays
// enabled while it shows, and a band tap dismisses it while the SAME tap
// keeps its neutral-tap semantics (phi bit-unchanged, S0 drain). Canvas
// taps — runs in the TAP GROUP right after row 16 (ordering law).
// (#71 landed as row 19 on its branch; renumbered to 20 at the 2026-07
// wave merge — #70 holds the contracted touch-e2e.md §3.1 row 19.)
// Row 22 (issue #142 + #184): power-response curve + perceptual release
// grid — the shipped perceptual default resolves; sampled-x drags write
// the exact curve value quantized to the GH-184 decade grid in perceptual
// mode / the byte-exact 0.1 in linear (expectations from the mirrored
// POWER_GAMMA + quantV constants over the captured pointer stream); the
// #70 fine gear multiplies the x-step under the curve; a 1–2 m/s release
// commits on the FINE 0.01 grid (red on pre-184 builds) while v≈8.8
// coarsens back to the 0.1 lattice; readouts show the TRUE m/s at fmtV's
// honest decimals (2 below 3 m/s where a hundredth is live, 1 above); a
// scripted __test.shoot({v0}) submits v0 byte-identically (curve + grid
// live only at the fraction seams). Gauge gestures + one scripted fire —
// no canvas taps, so it runs after row 19 and before the row-13
// renavigation (ordering law). S19 pins the linear response for its
// open-loop linear math (persist:false) and restores the default.
// Row 24 (issue #145): page-zoom lockdown — viewport meta scale caps
// (maximum-scale=1/user-scalable=no), zoom-channel touch-action posture,
// the Safari GestureEvent guard (synthetic cancelable dispatch), the
// visualViewport watchdog seam unit (mock obViewport collector →
// __viewport.check(fake) drives exactly one {v:1, scale} post + the
// localized hint banner), the banner-coordination legs (game banner never
// clobbered, timer-clear re-assert, selective un-zoom clear — review
// 2026-07 findings 2a–2c), and a BEST-EFFORT Input.synthesizePinchGesture
// on canvas + chrome asserting visualViewport.scale stays 1 (skips LOUDLY
// where the command is unsupported). Registered LAST: DOM/meta/
// computed-style reads are ordering-law immune and the trailing
// compositor pinch must have nothing after it. The --desktop-inert arm
// carries the inverse (no __viewport, no GestureEvent guard on
// fine-pointer boots — touch.js never loads).
//
// Tests-first note: this suite is EXPECTED RED until lanes T (touch.js FSM)
// and H (touchwidgets.js/touch.css phone HUD) land. Missing surfaces report
// { found: false } from the __tp finders and fail the matching assertion.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  launchPhone, setPhoneMetrics, verifyCoarse, waitReady, sleep,
  touchStart, touchMove, touchEnd, touchCancel, tap, drag, twoFingerGesture,
  threeFingerGesture, PAGE_HELPERS_JS,
} from './touch-cdp.mjs';
import fs from 'node:fs';
import {
  laneArtifactDir, launchChrome, spawnStaticServer, stopStaticServer,
} from './cdp.mjs';

// ---- frozen gesture constants (contracts/touch-input.md §3) -----------------
const G0 = (canvasCssWidth) => 1.2 * Math.PI / Math.max(1, canvasCssWidth);
const FINE_MIN = 0.1;          // m(v) floor, v ≤ V_LO
const ORBIT_GAIN = 0.005;      // rad per centroid px
const FIRE_MIN_PX = 64;        // phone-hud.md §3.4
const SLOP = 10;               // TOUCH_SLOP_PX (row 4 re-baselines here)
const NUDGE_RAD = 0.05 * Math.PI / 180; // NUDGE_STEP_DEG (SC-005)
const GHOST_OFFSET_PX = 56;    // S3 up-screen finger offset
const OFF_AXIS_HI = 320;       // #70 gauge off-axis gearing floor distance [px]
const GAUGE_PAD = 10;          // GAUGE_PAD_PX (rail dead margins, #70 arm)
// #142 power-response curve mirrors (settings.js powerCurve — the shipped
// POWER_CURVE_GAMMA feel constant, mirrored here like GAUGE_PAD/OFF_AXIS_HI
// so an owner retune is a two-file change; S22 derives every expectation
// from these instead of hard-coded curve samples)
const POWER_GAMMA = 2.0;
const PMIN = 0.5, PMAX = 12;
/** travel fraction x → v0 under a response mode (the ONE curve, mirrored). */
const curveV = (x, mode) => PMIN + (PMAX - PMIN)
  * (mode === 'linear' ? x : Math.pow(x, POWER_GAMMA));
/** exact inverse (recovers the rail fraction from a written v0). */
const curveX = (v, mode) => {
  const f = (Math.min(PMAX, Math.max(PMIN, v)) - PMIN) / (PMAX - PMIN);
  return mode === 'linear' ? f : Math.pow(f, 1 / POWER_GAMMA);
};
// GH-184 perceptual release grid (settings.js powerQuant mirror — the same
// two-file-retune law as POWER_GAMMA above): perceptual-mode writes land on
// the piecewise decade grid — 0.01 below 2 m/s, 0.05 in [2, 3), 0.1 at/above
// 3 (relative step ≤ 3.3 % of v everywhere, under half the ~5–8 % speed JND
// the curve is built on); linear mode keeps the frozen 0.1 byte-exact.
const quantV = (v, mode) => {
  v = Math.min(PMAX, Math.max(PMIN, v));
  if (mode === 'linear' || v >= 3) return Math.round(v * 10) / 10;
  return v < 2 ? Math.round(v * 100) / 100 : Math.round(v * 20) / 20;
};
/** GH-184 honest readout mirror (hud.js/touchwidgets.js/aimwidgets.js fmtV):
 * the committed value printed EXACTLY at its natural decimals — 2 only where
 * the fine grid leaves a live hundredth (always 1 on tenths, so linear mode
 * renders byte-identically to the old toFixed(1)). */
const fmtV = (v) => (Math.round(v * 100) % 10 ? v.toFixed(2) : v.toFixed(1));

// proven straight-pot geometry (e2e-rules stage 3 / e2e-8ball): cue at
// kernel (0,0), object ball at POT, phi = PHI pots into the rt corner
// pocket (kernel Table.pockets index 5)
const POT = { x: 0.38903252247502133, y: 0.7780650449500427 };
const PHI = 1.1071487177940904;
const FAR = [{ id: 9, x: -0.5, y: -1.0 }, { id: 12, x: 0.55, y: -1.0 }];

// ---- args / ports -----------------------------------------------------------
const argOf = (flag) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const [W, H] = (argOf('--viewport') ?? '844x390').split('x').map(Number);
const PORT = Number(argOf('--port') ?? process.env.OB_E2E_PORT ?? 8259);
const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 16459);
// GH-410 port inventory (declared 2026-09-07 under the GH-687 lint law, sized by the
// declared-vs-used reader: this suite launches no CDP offset above +0 and no http
// offset above +0): {'http': 1, 'cdp': 1} — the CI job's band width and pin tails are derived from it.
export const PORT_INVENTORY = { http: 1, cdp: 1 };
export const PORT_FLAGS = { '--port': 'http', '--viewport': 'none' };
const g0 = G0(W); // renderer canvas is viewport-sized on phone

// ---- watchdog (unref'd: never holds an otherwise-finished process) ----------
const WATCHDOG_MS = Number(process.env.OB_E2E_WATCHDOG_MS ?? 420000);
let client = null;
let server = null;
setTimeout(() => {
  console.error(`[e2e-touch] WATCHDOG: suite exceeded ${WATCHDOG_MS} ms — hard exit`);
  try { client?.close(); } catch { /* already gone */ }
  stopStaticServer(server); // sync group SIGTERM; the exit backstop finishes the reap
  process.exit(2);
}, WATCHDOG_MS).unref();

// ---- scoring ----------------------------------------------------------------
let failures = 0;
const check = (name, ok, detail = '') => {
  if (ok) console.log('[e2e-touch] PASS', name);
  else {
    failures++;
    process.exitCode = 1;
    console.error('E2E-TOUCH FAIL:', name + (detail ? ' — ' + detail : ''));
  }
};

// ---- GH-699 review r1 P2: the touch.css cache-key PIN law (static, both
// arms) — touch.js requests `./ui/touch.css?v=NNN`, the sheet declares the
// same NNN in its header (`* PIN: ?v=NNN`) and sw.js precaches that exact
// URL. A sheet edit without the bump left returning clients on the cached
// old sheet (the GH-699 44 pt block shipped that way); a bump on one side
// only is the same stale-pairing class. Read from disk: no Chrome needed.
{
  const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'app');
  const rd = (...p) => { try { return fs.readFileSync(path.join(appDir, ...p), 'utf8'); } catch { return ''; } };
  const req = rd('touch.js').match(/\.\/ui\/touch\.css\?v=(\d{3})\b/)?.[1] ?? null;
  const pin = rd('ui', 'touch.css').match(/^\s*\*\s*PIN:\s*\?v=(\d{3})\b/m)?.[1] ?? null;
  const pre = rd('..', 'sw.js').match(/\.\/app\/ui\/touch\.css\?v=(\d{3})\b/)?.[1] ?? null;
  check('touch.css PIN: touch.js requests the version the sheet declares',
    !!req && req === pin, `touch.js ?v=${req} vs touch.css header PIN ?v=${pin}`);
  check('touch.css PIN: sw.js precaches that same ?v= URL',
    !!req && req === pre, `touch.js ?v=${req} vs sw.js ?v=${pre} (regenerate: node web/tools/gen-sw-precache.mjs)`);
}

// ---- boot -------------------------------------------------------------------
let url = argOf('--url');
if (!url) {
  const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  server = spawnStaticServer(webDir, PORT);
  await sleep(700);
  url = `http://127.0.0.1:${PORT}/app.html?seed=1`;
}
// ---- fine-pointer inertness arm (T029, contracts/touch-e2e.md §4.3) ---------
// `--desktop-inert`: a DESKTOP-viewport, fine-pointer boot (plain launchChrome
// — no metrics/touch overrides, so `matchMedia('(pointer: coarse)')` is
// false) must leave the touch feature fully dormant: `.ob-touch` absent,
// `window.__touch` undefined, and ZERO network requests for the three touch
// assets (app/touch.js, app/touchwidgets.js, app/ui/touch.css). Requests are
// accounted over a Network-enabled cache-disabled hard reload (the launch
// navigation predates the CDP attach), with a positive control — the reload
// must re-request the ordinary app modules — so an accounting failure can
// never pass vacuously. Every wait is a bounded poll under the suite
// watchdog; this arm runs INSTEAD of the phone scenarios and exits.
if (process.argv.includes('--desktop-inert')) {
  const diErrors = [];
  console.log(`[e2e-touch] desktop-inert boot (fine pointer) url=${url} cdp=${CDP_PORT}`);
  client = await launchChrome(url, { port: CDP_PORT });
  client.onEvent((method, params) => {
    if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
      diErrors.push(params.args.map((a) => a.value ?? a.description).join(' '));
    } else if (method === 'Runtime.exceptionThrown') {
      diErrors.push(params.exceptionDetails.exception?.description
        ?? params.exceptionDetails.text);
    } else if (method === 'Log.entryAdded' && params.entry.level === 'error') {
      diErrors.push(params.entry.text);
    }
  });
  const TOUCH_ASSET = /\/app\/(?:touch\.js|touchwidgets\.js|ui\/touch\.css)(?:\?|$)/;
  const touchRequests = [];
  let totalRequests = 0;
  client.onEvent((method, params) => {
    if (method !== 'Network.requestWillBeSent') return;
    totalRequests++;
    if (TOUCH_ASSET.test(params.request.url)) touchRequests.push(params.request.url);
  });
  try {
    await client.send('Network.enable');
    await client.send('Network.setCacheDisabled', { cacheDisabled: true });
    await client.send('Page.reload', { ignoreCache: true });
    check('desktop-inert: app ready on the fine-pointer boot', await waitReady(client));
    await sleep(2000); // startLoop settle — the coarse-gated import would fire here
    check('desktop-inert: fine pointer at boot (coarse media query false)',
      await client.eval(`matchMedia('(pointer: coarse)').matches`) === false);
    check('desktop-inert: .ob-touch absent from <html>',
      await client.eval(`document.documentElement.classList.contains('ob-touch')`) === false);
    check('desktop-inert: window.__touch undefined',
      await client.eval('typeof window.__touch') === 'undefined');
    check('desktop-inert: network accounting live (app modules re-requested)',
      totalRequests > 10, `totalRequests=${totalRequests}`);
    check('desktop-inert: ZERO requests for touch.js/touchwidgets.js/touch.css',
      touchRequests.length === 0, touchRequests.join(' '));
    check('desktop-inert: desktop input surface intact (#aimw present)',
      await client.eval(`!!document.getElementById('aimw')`) === true);
    check('desktop-inert: #60 selection defense stays touch-gated '
      + '(body user-select auto on the fine-pointer boot)',
      await client.eval(`getComputedStyle(document.body).webkitUserSelect`) === 'auto');
    check('desktop-inert: #145 zoom watchdog absent (no __viewport seam)',
      await client.eval('typeof window.__viewport') === 'undefined');
    check('desktop-inert: #145 GestureEvent guard absent '
      + '(desktop trackpad pinch / DevTools zoom untouched)',
      await client.eval(`(() => {
        const e = new Event('gesturestart', { cancelable: true });
        window.dispatchEvent(e);
        return e.defaultPrevented;
      })()`) === false);
    check('desktop-inert: zero console errors', diErrors.length === 0,
      diErrors.slice(0, 5).join(' | '));
  } finally {
    client.close();
    await stopStaticServer(server);
  }
  console.log(failures
    ? `[e2e-touch] FAIL (${failures} failing assertions)`
    : '[e2e-touch] ALL PASS (desktop-inert)');
  process.exit(failures ? 1 : 0);
}

console.log(`[e2e-touch] boot ${W}x${H} url=${url} cdp=${CDP_PORT}`);

const consoleErrors = [];
client = await launchPhone(url, { cdpPort: CDP_PORT, width: W, height: H });
client.onEvent((method, params) => {
  if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
    consoleErrors.push(params.args.map((a) => a.value ?? a.description).join(' '));
  } else if (method === 'Runtime.exceptionThrown') {
    consoleErrors.push(params.exceptionDetails.exception?.description
      ?? params.exceptionDetails.text);
  } else if (method === 'Log.entryAdded' && params.entry.level === 'error') {
    // 024 exception (integration ledger §3): the help overlay's R5
    // guide-reachability probe 404s by DESIGN on a web/-rooted serve
    // (once per session per frozen candidate); Chrome logs those at the
    // network layer. Exclude exactly the two candidate URLs — every
    // other network error still fails the run.
    const guideProbe = params.entry.source === 'network'
      && /\/(?:site\/)?guide\/[^/]+\/index\.html$/.test(params.entry.url ?? '');
    if (!guideProbe) consoleErrors.push(params.entry.text);
  }
});

// notch emulation (touch-e2e.md §3.1 row 1 / §4.1): landscape-iPhone insets.
// Applied before the app settles so env(safe-area-inset-*) is live for the
// whole run. Chrome exposes this via Emulation.setSafeAreaInsetsOverride
// (param shape varied across protocol revisions — try both).
const SA = { top: 0, left: 47, right: 47, bottom: 21 };
let safeAreaMode = null;
let safeAreaErr = '';
{
  const full = Object.fromEntries(Object.entries(SA)
    .flatMap(([k, v]) => [[k, v], [k + 'Max', v]]));
  try {
    await client.send('Emulation.setSafeAreaInsetsOverride', { insets: full });
    safeAreaMode = 'insets';
  } catch (e1) {
    try {
      await client.send('Emulation.setSafeAreaInsetsOverride', full);
      safeAreaMode = 'flat';
    } catch (e2) { safeAreaErr = `${e1.message} / ${e2.message}`; }
  }
}

const ev = (expr) => client.eval(expr);

check('app ready on phone-emulated boot', await waitReady(client));
await sleep(1200); // module settle (touch leaf loads post-boot)
check('coarse-pointer active at boot (frozen recipe)',
  await verifyCoarse(client).then(() => true,
    (e) => { console.error(e.message); return false; }));
await ev(PAGE_HELPERS_JS);
console.log('[e2e-touch] page helpers installed; safe-area mode:',
  safeAreaMode ?? `UNAVAILABLE (${safeAreaErr})`);

// in-page scratch for bit-exact comparisons (doubles never cross the JSON
// boundary when equality itself is asserted page-side)
await ev('window.__e2e = {}; true');

// ---- scenarios --------------------------------------------------------------

// 1 — boot on phone viewport (FR-001/003, SC-003)
async function sc1() {
  check('S1 .ob-touch set on <html>',
    await ev(`document.documentElement.classList.contains('ob-touch')`) === true);
  check('S1 __touch.installed', await ev('window.__touch?.installed === true'));

  const fire = await ev(`window.__tp.el('#shoot')`);
  check('S1 FIRE pill visible', fire.found && fire.visible, JSON.stringify(fire));
  check(`S1 FIRE pill geometry ≥${FIRE_MIN_PX}px`,
    fire.found && Math.min(fire.w, fire.h) >= FIRE_MIN_PX,
    `w=${fire.w} h=${fire.h}`);
  check('S1 FIRE pill anchored bottom-right',
    fire.found && fire.cx > W / 2 && fire.cy > H / 2,
    `cx=${fire.cx} cy=${fire.cy}`);

  const strip = await ev(`window.__tp.el('#state')`);
  check('S1 status strip on-screen (top band, fully inside viewport)',
    strip.found && strip.visible && strip.y >= 0 && strip.x >= 0
      && strip.x + strip.w <= W + 0.5 && strip.cy < H * 0.25,
    JSON.stringify(strip));

  const aimw = await ev(`window.__tp.el('#aimw')`);
  check('S1 #aimw hidden on phone', !aimw.found || !aimw.visible,
    JSON.stringify(aimw));
  const help = await ev(`window.__tp.el('#help')`);
  check('S1 #help hidden on phone', !help.found || !help.visible,
    JSON.stringify(help));

  // safe-area compliance under notch emulation: left-edge gauge clears the
  // left inset (phone-hud.md §3.5); FIRE clears the right inset (§3.10 law)
  if (!safeAreaMode) {
    check('S1 safe-area emulation available on this Chrome build', false, safeAreaErr);
  } else {
    const g = await ev('window.__tp.findGauge()');
    check('S1 gauge respects safe-area-inset-left',
      g.found && g.x >= SA.left - 2, JSON.stringify(g));
    check('S1 FIRE respects safe-area-inset-right',
      fire.found && fire.x + fire.w <= W - SA.right + 2,
      `fire right=${fire.found ? fire.x + fire.w : 'n/a'} limit=${W - SA.right}`);
  }
}

// 2 — tap neutrality (R2)
async function sc2() {
  await ev('window.__e2e.p0 = window.__aim?.getPhi?.() ?? null; true');
  await tap(client, W * 0.55, H * 0.40);
  await sleep(250);
  check('S2 tap on empty table: phi bit-unchanged',
    await ev('(window.__aim?.getPhi?.() ?? null) === window.__e2e.p0 && window.__e2e.p0 !== null'));
  check("S2 classifier returns to S0",
    await ev("window.__touch?.state?.() === 'S0'"));
  check('S2 no tracked pointers after tap',
    await ev('window.__touch?.pointers?.() === 0'));
}

// 3 — relative aim drag (FR-002/005, US1-2)
async function sc3() {
  const y = H * 0.5;
  const x0 = Math.round(W * 0.30);
  const DX = 254;

  await ev('window.__e2e.p0 = window.__aim?.getPhi?.() ?? null; true');
  await touchStart(client, [{ x: x0, y }]);
  await sleep(140);
  check('S3 touchStart causes zero phi change (bit)',
    await ev('(window.__aim?.getPhi?.() ?? null) === window.__e2e.p0 && window.__e2e.p0 !== null'));

  // cross TOUCH_SLOP_PX gently, then prove no snap: the applied delta must
  // stay proportional to the moved distance (a snap-to-touch-azimuth jump
  // would dwarf the 20px·G0 budget)
  await touchMove(client, [{ x: x0 + 8, y }]);
  await sleep(24);
  await touchMove(client, [{ x: x0 + 14, y }]);
  await sleep(60);
  const snap = await ev('Math.abs((window.__aim?.getPhi?.() ?? 1e9) - window.__e2e.p0)');
  check('S3 no snap at gesture start',
    snap <= 20 * g0 * 1.05 + 1e-12,
    `|dphi|=${snap.toFixed(6)} budget=${(20 * g0).toFixed(6)}`);

  // fast leg: 28 px / 8 ms ≈ 3500 px/s nominal — far above V_HI so m(v)=1
  // holds even when CDP dispatch overhead stretches the REAL inter-event
  // gap several-fold (three e2e workflows share this machine; at 14 px /
  // 16 ms nominal a loaded run drops below V_HI and m(v) correctly damps
  // the drag, failing the magnitude band for harness reasons)
  for (let x = x0 + 28; x <= x0 + DX; x += 28) {
    await touchMove(client, [{ x, y }]);
    await sleep(8);
  }
  await touchMove(client, [{ x: x0 + DX, y }]);
  await touchEnd(client, []);
  await sleep(200);
  const d1 = await ev('(window.__aim?.getPhi?.() ?? 1e9) - window.__e2e.p0');
  const exp = -DX * g0;
  check('S3 rightward drag: phi decreases (sign of −dx·G0)', d1 < 0,
    `dphi=${d1}`);
  check('S3 drag magnitude within tolerance of −dx·G0·m(v)',
    Math.abs(d1) >= Math.abs(exp) * 0.55 && Math.abs(d1) <= Math.abs(exp) * 1.1,
    `dphi=${d1.toFixed(5)} expected≈${exp.toFixed(5)}`);

  // opposite direction: leftward drag raises phi
  await ev('window.__e2e.p0 = window.__aim.getPhi(); true');
  await drag(client, { x: W * 0.62, y }, { x: W * 0.62 - 200, y },
    { steps: 14, stepMs: 16 });
  await sleep(200);
  const d2 = await ev('window.__aim.getPhi() - window.__e2e.p0');
  check('S3 leftward drag: phi increases (direction law)', d2 > 0, `dphi=${d2}`);
  check("S3 classifier back to S0 after drags",
    await ev("window.__touch?.state?.() === 'S0'"));
}

// 4 — fine parity (SC-005)
async function sc4() {
  // slow leg: 1.5 px / 33 ms ≈ 45 px/s < V_LO → m(v) = FINE_MIN
  const y = H * 0.55;
  const x0 = Math.round(W * 0.45);
  await touchStart(client, [{ x: x0, y }]);
  await sleep(60);
  for (let i = 1; i <= 40; i++) {
    await touchMove(client, [{ x: x0 + i * 1.5, y }]);
    await sleep(33);
  }
  const ff = await ev('window.__touch?.fineFactor?.() ?? null');
  await touchEnd(client, []);
  await sleep(150);
  check(`S4 slow drag fineFactor ≈ ${FINE_MIN}`,
    typeof ff === 'number' && Math.abs(ff - FINE_MIN) <= 0.02, `fineFactor=${ff}`);

  // nudge ratchet: EXACT ArrowLeft/Right arithmetic (aim.js: phi += sign ·
  // 0.05 · π/180) — asserted bit-exact page-side
  const nd = await ev(`(() => {
    if (!window.__touch?.nudge || !window.__aim?.getPhi) return null;
    const s = 1 * 0.05 * Math.PI / 180;
    const p0 = window.__aim.getPhi();
    window.__touch.nudge(1);
    const p1 = window.__aim.getPhi();
    window.__touch.nudge(-1);
    const p2 = window.__aim.getPhi();
    return { fwd: p1 === p0 + s, back: p2 === p1 - s, d1: p1 - p0, d2: p2 - p1 };
  })()`);
  check('S4 nudge(+1) = exactly +0.05° (ArrowLeft arithmetic)',
    nd?.fwd === true, JSON.stringify(nd));
  check('S4 nudge(−1) = exactly −0.05° (ArrowRight arithmetic)',
    nd?.back === true, JSON.stringify(nd));
}

// 5 — second-finger law (R4)
async function sc5() {
  const y = H * 0.5;
  const f1 = { x: Math.round(W * 0.40), y, id: 1 };
  await touchStart(client, [f1]);
  await sleep(40);
  // cross slop → S2 aim drag
  for (const dx of [6, 12, 20, 30]) {
    await touchMove(client, [{ x: f1.x + dx, y, id: 1 }]);
    await sleep(16);
  }
  const f1c = { x: f1.x + 30, y, id: 1 };
  check("S5 one-finger drag classifies S2",
    await ev("window.__touch?.state?.() === 'S2'"));

  // input-pipeline quiescence before latching the baseline (issue #81
  // lane-A gate wall): Input.dispatchTouchEvent ACKS before the renderer's
  // rAF-aligned coalesced pointermove delivery, so the LAST f1 sample can
  // integrate phi AFTER this latch — a pre-existing harness race whose
  // window the §3.11 band-contract relayout widened (diagnosed 2026-07-22:
  // phi was bit-constant across every f2 move in the failing runs; only
  // the baseline was stale). Poll to phi stability, then latch.
  let pQ = await ev('window.__aim.getPhi()');
  for (let i = 0; i < 20; i++) {
    await sleep(60);
    const pN = await ev('window.__aim.getPhi()');
    if (pN === pQ) break;
    pQ = pN;
  }
  await ev('window.__e2e.p0 = window.__aim.getPhi(); true');
  // second finger lands mid-S2, then moves alone: zero phi contribution
  const f2 = { x: Math.round(W * 0.62), y: Math.round(H * 0.62), id: 2 };
  await touchStart(client, [f1c, f2]);
  await sleep(30);
  for (let i = 1; i <= 6; i++) {
    await touchMove(client, [f1c, { x: f2.x + i * 10, y: f2.y, id: 2 }]);
    await sleep(16);
  }
  check('S5 second-finger moves contribute zero phi delta (bit)',
    await ev('window.__aim.getPhi() === window.__e2e.p0'));

  // drain: lift finger 1; the surviving finger must write NOTHING until all-up
  const f2c = { x: f2.x + 60, y: f2.y, id: 2 };
  await touchEnd(client, [f2c]);
  await sleep(30);
  check("S5 one-up-one-down enters the S5 drain",
    await ev("window.__touch?.state?.() === 'S5'"));
  await ev('window.__e2e.cam = JSON.stringify(window.__tp.camPose()); '
    + 'window.__e2e.p0 = window.__aim.getPhi(); true');
  for (let i = 1; i <= 6; i++) {
    await touchMove(client, [{ x: f2c.x + i * 12, y: f2c.y + i * 6, id: 2 }]);
    await sleep(16);
  }
  check('S5 drain: surviving finger causes zero aim writes (bit)',
    await ev('window.__aim.getPhi() === window.__e2e.p0'));
  check('S5 drain: surviving finger causes zero camera writes',
    await ev('JSON.stringify(window.__tp.camPose()) === window.__e2e.cam'));
  await touchEnd(client, []);
  await sleep(150);
  check("S5 all-up returns to S0",
    await ev("window.__touch?.state?.() === 'S0'"));
}

// 6 — two-finger camera (US1-5)
async function sc6() {
  if (await ev('window.__aim?.getAimView?.() === true')) {
    await ev('window.__aim.setAimView(false)');
    await sleep(400);
  }

  // centroid drag, constant span: theta at ORBIT_GAIN rad/px
  const o0 = await ev('window.__tp.orbit()');
  check('S6 orbit pose readable', !!o0, JSON.stringify(o0));
  if (o0) {
    const cx0 = W * 0.40;
    const DX = 80;
    await twoFingerGesture(client,
      { from: { x: cx0, y: H * 0.30 }, to: { x: cx0 + DX, y: H * 0.30 } },
      { from: { x: cx0, y: H * 0.66 }, to: { x: cx0 + DX, y: H * 0.66 } },
      { steps: 16, stepMs: 16 });
    await sleep(300);
    const o1 = await ev('window.__tp.orbit()');
    const dTheta = Math.abs(((o1.theta - o0.theta + Math.PI) % (2 * Math.PI)
      + 2 * Math.PI) % (2 * Math.PI) - Math.PI);
    check(`S6 centroid drag: |dtheta| ≈ ${DX}·${ORBIT_GAIN} rad`,
      dTheta >= DX * ORBIT_GAIN * 0.7 && dTheta <= DX * ORBIT_GAIN * 1.3,
      `dtheta=${dTheta.toFixed(4)} expected≈${(DX * ORBIT_GAIN).toFixed(4)}`);
    check('S6 pure-x centroid drag keeps phi (|dphi| < 0.06)',
      Math.abs(o1.phi - o0.phi) < 0.06, `dphi=${(o1.phi - o0.phi).toFixed(4)}`);
    check('S6 constant-span drag keeps radius (±5%)',
      Math.abs(o1.radius / o0.radius - 1) < 0.05,
      `r ${o0.radius.toFixed(3)} → ${o1.radius.toFixed(3)}`);

    // pinch: fixed centroid, span 140 → 175 ⇒ radius · (140/175) = 0.8×
    const r0 = o1.radius;
    const cx = W * 0.5;
    const cy = H * 0.48;
    await twoFingerGesture(client,
      { from: { x: cx, y: cy - 70 }, to: { x: cx, y: cy - 87.5 } },
      { from: { x: cx, y: cy + 70 }, to: { x: cx, y: cy + 87.5 } },
      { steps: 16, stepMs: 16 });
    await sleep(300);
    const o2 = await ev('window.__tp.orbit()');
    check('S6 pinch: radius scales by span ratio (140/175 = 0.8, ±10%)',
      Math.abs(o2.radius / r0 - 0.8) <= 0.08,
      `r ${r0.toFixed(3)} → ${o2.radius.toFixed(3)} ratio=${(o2.radius / r0).toFixed(3)}`);
  }

  // aim view (issue #56 SINGLE-POSE): engaging GLIDES the one orbit rig to
  // the behind-the-shot pose (the chase writes THROUGH the rig, so the rig
  // is pose-truth); a two-finger gesture is the BREAKOUT — the aim view
  // disengages in place and the SAME gesture continues as normal S4
  // orbit/pinch from the current pose (nothing is remembered anymore, so
  // there is no snap-back). The chase lerps asymptotically and never goes
  // bit-stable, so settling is asserted differentially as before.
  await ev('window.__aim.setAimView(true)');
  const pose = async () => ev('window.__tp.camPose()');
  const poseDist = (a, b) => (!a || !b) ? Infinity
    : Math.max(...a.map((v, i) => Math.abs(v - b[i])));
  // bounded near-settle wait: consecutive 200 ms samples within 1e-6
  let settled = false;
  let prev = await pose();
  for (let i = 0; i < 30 && !settled; i++) {
    await sleep(200);
    const cur = await pose();
    settled = poseDist(cur, prev) < 1e-6;
    prev = cur;
  }
  check('S6 aim-view camera near-settles (glide-to-pose is assertable)', settled,
    `last pose ${JSON.stringify(prev)}`);
  // the View pill paints engaged (touchwidgets 150 ms seam poll)
  let pillOn = false;
  for (let i = 0; i < 8 && !pillOn; i++) {
    await sleep(150);
    pillOn = await ev(`document.getElementById('ob-view-btn')`
      + `?.getAttribute('aria-pressed') === 'true'`);
  }
  check('S6 View pill paints engaged (aria-pressed true)', pillOn === true);
  const o3 = await ev('window.__tp.orbit()');
  check('S6 aim-view pose is rig-truth (radius ≈ 1.81 behind-shot framing)',
    !!o3?.target && Math.abs(o3.radius - 1.8122) < 0.08, JSON.stringify(o3));

  // BREAKOUT: a horizontal two-finger drag disengages the aim view and
  // orbits from the CURRENT pose. The first move is consumed by the
  // breakout re-baseline, so theta moves ≈ (steps−1)/steps · DX · GAIN;
  // radius and target must NOT snap anywhere.
  await ev('window.__e2e.p0 = window.__aim.getPhi(); true');
  const DXB = 90;
  const STEPSB = 15;
  await twoFingerGesture(client,
    { from: { x: W * 0.36, y: H * 0.30 }, to: { x: W * 0.36 + DXB, y: H * 0.30 } },
    { from: { x: W * 0.36, y: H * 0.66 }, to: { x: W * 0.36 + DXB, y: H * 0.66 } },
    { steps: STEPSB, stepMs: 16 });
  await sleep(300);
  check('S6 two-finger gesture DISENGAGES the aim view (breakout)',
    await ev('window.__aim.getAimView() === false'));
  check('S6 breakout keeps phi bit-unchanged (S4 never steers the aim)',
    await ev('window.__aim.getPhi() === window.__e2e.p0'));
  const o4 = await ev('window.__tp.orbit()');
  const dThB = Math.abs(((o4.theta - o3.theta + Math.PI) % (2 * Math.PI)
    + 2 * Math.PI) % (2 * Math.PI) - Math.PI);
  const expB = DXB * (1 - 1 / STEPSB) * ORBIT_GAIN;
  check('S6 breakout continues as orbit FROM the aim pose (theta gesture-sized)',
    dThB >= expB * 0.55 && dThB <= DXB * ORBIT_GAIN * 1.3,
    `dtheta=${dThB.toFixed(4)} expected≈${expB.toFixed(4)}`);
  check('S6 breakout: no radius snap (within 5% of the aim pose)',
    Math.abs(o4.radius / o3.radius - 1) < 0.05,
    `r ${o3.radius.toFixed(3)} → ${o4.radius.toFixed(3)}`);
  const tJump = !o3.target || !o4.target ? Infinity
    : Math.hypot(o4.target[0] - o3.target[0], o4.target[2] - o3.target[2]);
  check('S6 breakout: orbit target stays at the aim look point (no jump)',
    tJump < 0.05, `target moved ${tJump}`);
  let pillOff = false;
  for (let i = 0; i < 8 && !pillOff; i++) {
    await sleep(150);
    pillOff = await ev(`document.getElementById('ob-view-btn')`
      + `?.getAttribute('aria-pressed') === 'false'`);
  }
  check('S6 View pill clears on the gesture breakout', pillOff === true);

  // three-finger PAN (issue #56): translates the clamped orbit target
  await ev(`window.__test.setCamera('default'); true`);
  await sleep(300);
  const p0 = await ev('window.__tp.orbit()');
  check('S6 pan: rig-truth pose readable (target + bounds)',
    !!p0?.target && !!p0?.bounds, JSON.stringify(p0));
  if (p0?.target) {
    await threeFingerGesture(client,
      { from: { x: W * 0.30, y: H * 0.35 }, to: { x: W * 0.55, y: H * 0.35 } },
      { from: { x: W * 0.45, y: H * 0.50 }, to: { x: W * 0.70, y: H * 0.50 } },
      { from: { x: W * 0.30, y: H * 0.65 }, to: { x: W * 0.55, y: H * 0.65 } },
      { steps: 14, stepMs: 16 });
    await sleep(300);
    const p1 = await ev('window.__tp.orbit()');
    const panDist = Math.hypot(p1.target[0] - p0.target[0],
      p1.target[2] - p0.target[2]);
    check('S6 three-finger drag pans the orbit target', panDist > 0.05,
      `target moved ${panDist.toFixed(4)} m`);
    check('S6 pan keeps radius (no pinch component applied)',
      Math.abs(p1.radius / p0.radius - 1) < 0.03,
      `r ${p0.radius.toFixed(3)} → ${p1.radius.toFixed(3)}`);
    check("S6 classifier back to S0 after the pan",
      await ev("window.__touch?.state?.() === 'S0'"));

    // bounds clamp: repeated hard pans must pin the target at the table
    // footprint + margin (rig-truth bounds), never into the void
    for (let i = 0; i < 6; i++) {
      await threeFingerGesture(client,
        { from: { x: W * 0.20, y: H * 0.35 }, to: { x: W * 0.80, y: H * 0.30 } },
        { from: { x: W * 0.35, y: H * 0.50 }, to: { x: W * 0.95, y: H * 0.45 } },
        { from: { x: W * 0.20, y: H * 0.65 }, to: { x: W * 0.80, y: H * 0.60 } },
        { steps: 8, stepMs: 8 });
      await sleep(60);
    }
    const pc = await ev('window.__tp.orbit()');
    const inX = Math.abs(pc.target[0]) <= pc.bounds.x + 1e-6;
    const inZ = Math.abs(pc.target[2]) <= pc.bounds.z + 1e-6;
    const atBound = Math.abs(Math.abs(pc.target[0]) - pc.bounds.x) < 1e-3
      || Math.abs(Math.abs(pc.target[2]) - pc.bounds.z) < 1e-3;
    check('S6 pan clamps inside the table bounds + margin', inX && inZ,
      JSON.stringify({ target: pc.target, bounds: pc.bounds }));
    check('S6 pan actually reached the bounds clamp (rail pin)', atBound,
      JSON.stringify({ target: pc.target, bounds: pc.bounds }));

    // breakout composes with pan: a three-finger drag while aim-engaged
    // disengages FIRST, then pans from the current pose
    await ev(`window.__test.setCamera('default'); true`);
    await ev('window.__aim.setAimView(true)');
    await sleep(1200); // partial glide is fine — breakout is pose-agnostic
    const pb0 = await ev('window.__tp.orbit()');
    await threeFingerGesture(client,
      { from: { x: W * 0.30, y: H * 0.35 }, to: { x: W * 0.50, y: H * 0.35 } },
      { from: { x: W * 0.45, y: H * 0.50 }, to: { x: W * 0.65, y: H * 0.50 } },
      { from: { x: W * 0.30, y: H * 0.65 }, to: { x: W * 0.50, y: H * 0.65 } },
      { steps: 12, stepMs: 16 });
    await sleep(300);
    check('S6 pan gesture while aim-engaged disengages first (breakout)',
      await ev('window.__aim.getAimView() === false'));
    const pb1 = await ev('window.__tp.orbit()');
    const pbDist = Math.hypot(pb1.target[0] - pb0.target[0],
      pb1.target[2] - pb0.target[2]);
    check('S6 pan-breakout continues from the current pose (bounded move)',
      pbDist > 0.02 && pbDist < 0.8, `target moved ${pbDist.toFixed(4)} m`);
  }

  // explicit re-pose: later scenarios project pockets/balls through the
  // camera — under the single-pose model nothing snaps back on exit, so
  // the driver re-poses deliberately (the capture-flow convention).
  await ev(`window.__test.setCamera('default'); true`);
  await sleep(400);
}

// 7 — power gauge + spin popup (FR-002/005, US1-3)
async function sc7() {
  // power gauge: full 0.5–12 range through the #power value chain
  const g = await ev('window.__tp.findGauge()');
  check('S7 power gauge present (left-edge drag surface)', g.found,
    JSON.stringify(g));
  if (g.found) {
    const gx = g.cx;
    const top = g.y + 6;
    const bot = g.y + g.h - 6;
    await drag(client, { x: gx, y: bot }, { x: gx, y: top },
      { steps: 20, stepMs: 16 });
    await sleep(200);
    const vA = await ev(`Number(document.getElementById('power').value)`);
    await drag(client, { x: gx, y: top }, { x: gx, y: bot },
      { steps: 20, stepMs: 16 });
    await sleep(200);
    const vB = await ev(`Number(document.getElementById('power').value)`);
    check('S7 gauge covers the full 0.5–12 range',
      Math.min(vA, vB) === 0.5 && Math.max(vA, vB) === 12, `${vB} .. ${vA}`);

    await drag(client, { x: gx, y: bot },
      { x: gx, y: bot - (bot - top) * 0.37 }, { steps: 12, stepMs: 16 });
    await sleep(200);
    const vMid = await ev(`Number(document.getElementById('power').value)`);
    // GH-184: mid-rail writes land on the perceptual release grid (a tenth
    // is always grid-legal, so this stays green on pre-184 builds too — the
    // discriminating fine-vs-±0.1 arm is S22(g))
    check('S7 gauge writes on the perceptual release grid (GH-184)',
      vMid > 0.5 && vMid < 12 && vMid === quantV(vMid, 'perceptual'),
      `v=${vMid}`);
    const readout = await ev(
      `document.getElementById('power-val')?.textContent ?? ''`);
    check('S7 HUD readout agrees with hud.getShot() v0',
      parseFloat(readout) === vMid, `readout='${readout}' v0=${vMid}`);
  }

  // spin popup: pad clamp + elevation, through the #tip/#elev value chains
  const btn = await ev('window.__tp.findSpinButton()');
  check('S7 spin popup button present (bottom-right cluster)', btn.found,
    JSON.stringify(btn));
  if (btn.found) {
    await tap(client, btn.cx, btn.cy);
    await sleep(500); // kit dialog motion
    const pad = await ev('window.__tp.findPad()');
    check('S7 spin pad present in popup', pad.found, JSON.stringify(pad));
    if (pad.found) {
      await drag(client, { x: pad.cx, y: pad.cy },
        { x: pad.x + pad.w - 2, y: pad.y + 2 }, { steps: 14, stepMs: 16 });
      await sleep(200);
      const tip = await ev('window.__tp.readTip()');
      const mag = tip && tip.n ? Math.hypot(tip.a, tip.b) : NaN;
      check('S7 spin clamp holds: a²+b² ≤ 0.25 (decode tolerance +0.06 on |r|)',
        tip && tip.n > 0 && mag <= 0.56, JSON.stringify(tip));
      check('S7 corner drag reaches the clamp circle (|r| ≥ 0.38)',
        tip && tip.n > 0 && mag >= 0.38, JSON.stringify(tip));
      check('S7 pad direction law (top-right → a>0, b>0)',
        tip && tip.n > 0 && tip.a > 0.1 && tip.b > 0.1, JSON.stringify(tip));
    }
    const rng = await ev('window.__tp.findPopupRange()');
    check('S7 elevation slider present in popup', rng.found, JSON.stringify(rng));
    if (rng.found) {
      const attrs = await ev(`(() => {
        const vis = (el) => el.getClientRects().length > 0
          && getComputedStyle(el).visibility !== 'hidden';
        const e = [...document.querySelectorAll('input[type=range]')]
          .find((x) => vis(x) && !x.closest('#hud') && x.id !== 'ob-set-volume');
        return e ? { min: e.min, max: e.max, step: e.step } : null;
      })()`);
      check('S7 elevation slider spans 0–80 step 1',
        attrs && Number(attrs.min) === 0 && Number(attrs.max) === 80
          && Number(attrs.step) === 1, JSON.stringify(attrs));
      await drag(client, { x: rng.x + 4, y: rng.cy },
        { x: rng.x + rng.w - 2, y: rng.cy }, { steps: 12, stepMs: 16 });
      await sleep(200);
      const eTop = await ev(`Number(document.getElementById('elev').value)`);
      check('S7 elevation reaches 80 through the #elev chain', eTop === 80,
        `elev=${eTop}`);
      await drag(client, { x: rng.x + rng.w - 2, y: rng.cy },
        { x: rng.x + 4, y: rng.cy }, { steps: 12, stepMs: 16 });
      await sleep(200);
      const eBot = await ev(`Number(document.getElementById('elev').value)`);
      // issue #47: the #elev min is the LIVE geometric rail floor (> 0
      // whenever the cue butt reaches over a rail — on a 9-ft table that is
      // every position), so "all the way down" means the floor, not 0
      const eMin = await ev(`Number(document.getElementById('elev').min)`);
      check('S7 elevation returns to the geometric floor (#elev min, issue #47)',
        eBot === eMin, `elev=${eBot} min=${eMin}`);
    }
    // explicit dismiss (scrim tap) — fire-neutrality itself is scenario 8
    const scrim = await ev('window.__tp.findScrim()');
    if (scrim.found) {
      await tap(client, scrim.x + 4, scrim.y + 4);
      await sleep(400);
    }
  }
  // hygiene: nothing in this scenario may have fired a shot
  // GH-370: a fresh rack parks in the opening BALL_IN_HAND — both aiming
  // states satisfy this check's law (no gesture may have FIRED a shot)
  check("S7 machine still aiming (no interaction fired)",
    await ev("['AIM','BALL_IN_HAND'].includes(window.__test?.state?.())"),
    String(await ev('window.__test?.state?.()')));
}

// ---- shared gesture pilots (T011/T012) ---------------------------------------
// Closed-loop drivers over the REAL touch surfaces: every player input goes
// through synthesized gestures on the frozen widgets/laws; read-back uses
// only existing scripted surfaces (__aim/__test/__rules/#power value chain/
// the #tip canvas decode). All loops are bounded (anti-stall law).

const shotsLogged = () => ev('((window.__share?.log?.() ?? {}).shots ?? 0)');

/** Shortest wrapped angular error target − phi, computed page-side. */
const phiErrTo = (target) => ev(`(() => {
  const p = window.__aim?.getPhi?.();
  if (typeof p !== 'number') return null;
  let d = (${target} - p) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return d;
})()`);

let chevSign = 0; // measured phi sign of ONE left-chevron activation

/**
 * Touch-aim closed loop: fast S2 drags (m≈1) for coarse error, slow drags
 * (m = FINE_MIN at <V_LO pace) for the mid band, chevron-ratchet taps
 * (exact ±0.05° each) for the last few steps. Converges to ≤ 0.6·NUDGE.
 */
async function aimTo(target) {
  const y = H * 0.46;
  let best = Infinity;
  let stale = 0;
  for (let round = 0; round < 14; round++) {
    const e = await phiErrTo(target);
    if (e === null) return { ok: false, why: '__aim.getPhi unavailable' };
    if (Math.abs(e) <= NUDGE_RAD * 0.6) return { ok: true, err: e };
    if (Math.abs(e) >= best - 1e-6) {
      if (++stale >= 4) return { ok: false, why: 'no convergence', err: e };
    } else {
      stale = 0;
    }
    best = Math.min(best, Math.abs(e));
    // fast/slow handover at 0.06 rad (lane-H recorded deviation, was 0.02):
    // the classifier's speed EMA (V_EMA_MS = 80 ms) ramps from REST on every
    // pointerdown, so a short fast drag (≤ ~30 px ≈ 24 ms) realizes
    // m(v) ≈ 0.2–0.5, decaying the error only ~10–15 % per round — from
    // |e| ≈ 0.15 the 14-round budget expires inside the 0.02–0.15 crawl
    // (measured live: S8 stalled at |e| = 0.018). The slow leg is EXACT
    // (m = FINE_MIN at 45 px/s regardless of ramp) and reaches
    // 140·G0·FINE_MIN ≈ 0.062 rad per round, so it takes over as soon as it
    // can cover the error in one pass.
    if (Math.abs(e) > 0.06) {
      // fast leg: ≥ ~1500 px/s ⇒ m(v) → 1; +SLOP lead (row 4 re-baseline)
      let dx = -e / g0;
      dx = Math.max(-W * 0.38, Math.min(W * 0.38, dx));
      dx += Math.sign(dx) * SLOP;
      const x0 = dx > 0 ? W * 0.12 : W * 0.88;
      await drag(client, { x: x0, y }, { x: x0 + dx, y },
        { steps: Math.max(3, Math.round(Math.abs(dx) / 14)), stepMs: 8 });
      await sleep(120);
    } else if (Math.abs(e) > NUDGE_RAD * 3) {
      // slow leg: 1.5 px / 33 ms ≈ 45 px/s < V_LO ⇒ m = FINE_MIN exactly
      let dx = -e / (g0 * FINE_MIN);
      dx = Math.max(-140, Math.min(140, dx));
      dx += Math.sign(dx) * SLOP;
      const x0 = dx > 0 ? W * 0.30 : W * 0.70;
      await drag(client, { x: x0, y }, { x: x0 + dx, y },
        { steps: Math.max(4, Math.round(Math.abs(dx) / 1.5)), stepMs: 33 });
      await sleep(120);
    } else {
      // ratchet leg: one exact ±NUDGE_STEP_DEG per chevron tap (SC-005 law)
      const ch = await ev('window.__tp.findChevrons()');
      if (!ch.found) return { ok: false, why: 'nudge chevrons not found', err: e };
      if (chevSign === 0) { // one-tap sign calibration, then re-loop
        const p0 = await ev('window.__aim.getPhi()');
        await tap(client, ch.left.cx, ch.left.cy, { pressMs: 30 });
        await sleep(140);
        chevSign = (await ev('window.__aim.getPhi()')) - p0 > 0 ? 1 : -1;
        continue;
      }
      const el = (e > 0) === (chevSign > 0) ? ch.left : ch.right;
      const n = Math.max(1, Math.min(6, Math.round(Math.abs(e) / NUDGE_RAD)));
      for (let i = 0; i < n; i++) {
        await tap(client, el.cx, el.cy, { pressMs: 30 });
        await sleep(100); // < NUDGE_REPEAT_DELAY_MS: exactly one step per tap
      }
    }
  }
  const e = await phiErrTo(target);
  return { ok: Math.abs(e) <= NUDGE_RAD * 0.6, err: e };
}

/** Gauge closed loop to an exact #power value (0.1-resolution chain).
 * #142: the thumb guess and the per-round travel now ride the ACTIVE
 * power-response curve (curveX mirror — the perceptual default's slope
 * varies along the rail, so the old fixed 11.5-per-rail Newton step
 * converged only marginally near the top). In linear mode the math below
 * reduces to the original formulas exactly. */
async function gaugeTo(target) {
  const g = await ev('window.__tp.findGauge()');
  if (!g.found) return { ok: false, why: 'gauge not found' };
  const top = g.y + 4;
  const bot = g.y + g.h - 4;
  const read = () => ev(`Number(document.getElementById('power').value)`);
  const mode = await ev(
    `window.__settings?.get?.().powerResponse ?? 'linear'`);
  let cur = await read();
  // thumb guess under the absolute travel↦value mapping (curve-aware)
  let yPos = bot - curveX(cur, mode) * (bot - top);
  for (let i = 0; i < 12 && cur !== target; i++) {
    const dy = -(curveX(target, mode) - curveX(cur, mode)) * (bot - top);
    const from = { x: g.cx, y: Math.min(bot, Math.max(top, yPos)) };
    const to = { x: g.cx, y: Math.min(bot, Math.max(top, yPos + dy)) };
    await drag(client, from, to,
      { steps: Math.max(4, Math.round(Math.abs(to.y - from.y) / 6)), stepMs: 12 });
    await sleep(140);
    yPos = to.y;
    cur = await read();
  }
  return { ok: cur === target, got: cur };
}

/** Spin-popup pad closed loop on the #tip canvas decode (readTip). Opens
 * the popup when needed; caller closes it (closePopup) before firing. */
async function spinPadSet(ta, tb, tol = 0.05) {
  let pad = await ev('window.__tp.findPad()');
  if (!pad.found) {
    const btn = await ev('window.__tp.findSpinButton()');
    if (!btn.found) return { ok: false, why: 'spin button not found' };
    await tap(client, btn.cx, btn.cy);
    await sleep(600); // kit dialog motion
    pad = await ev('window.__tp.findPad()');
    if (!pad.found) return { ok: false, why: 'spin pad not found' };
  }
  const k = pad.w; // px per 1.0 offset when the pad radius spans the clamp
  let px = pad.cx + ta * k;
  let py = pad.cy - tb * k;
  let cur = null;
  for (let i = 0; i < 8; i++) {
    px = Math.min(pad.x + pad.w - 2, Math.max(pad.x + 2, px));
    py = Math.min(pad.y + pad.h - 2, Math.max(pad.y + 2, py));
    await drag(client, { x: pad.cx, y: pad.cy },
      { x: px, y: py }, { steps: 8, stepMs: 12 });
    await sleep(160);
    const t = await ev('window.__tp.readTip()');
    if (!t) return { ok: false, why: 'tip canvas unreadable' };
    cur = t.n ? t : { a: 0, b: 0, n: 0 };
    if (Math.hypot(cur.a - ta, cur.b - tb) <= tol) return { ok: true, ...cur };
    px += (ta - cur.a) * k * 0.8;
    py -= (tb - cur.b) * k * 0.8;
  }
  // readTip decodes at ±0.06 — accept a slightly wider landing
  return { ok: !!cur && Math.hypot(cur.a - ta, cur.b - tb) <= tol * 1.5, ...cur };
}

async function closePopup() {
  const scrim = await ev('window.__tp.findScrim()');
  if (scrim.found) {
    await tap(client, scrim.x + 4, scrim.y + 4);
    await sleep(450);
  }
}

/** Tap FIRE, prove the AIM→SIMULATING/PLAYBACK transition, then wait the
 * playback out (all bounded; progress lines per the anti-stall law). */
async function fireAndSettle(tag) {
  const fire = await ev(`window.__tp.el('#shoot')`);
  if (!fire.found || !fire.visible) return { ok: false, why: '#shoot not visible' };
  if (fire.cx < 0 || fire.cy < 0 || fire.cx > W || fire.cy > H) {
    return { ok: false, why: `FIRE outside viewport (${fire.cx},${fire.cy})` };
  }
  const shots0 = await shotsLogged();
  await tap(client, fire.cx, fire.cy);
  let transition = null;
  for (let i = 0; i < 130 && !transition; i++) {
    const s = await ev('window.__test.state()');
    if (s === 'SIMULATING' || s === 'PLAYBACK') transition = s;
    else await sleep(60);
  }
  if (!transition) {
    return { ok: false, why: 'no AIM→SIMULATING/PLAYBACK transition after the FIRE tap' };
  }
  let state = transition;
  // the settle poll snapshots state + judgment in ONE page eval: a WIN's
  // 2.6 s auto re-rack nulls the judgment surface, so a separate
  // post-settle read races it under load (GH-344; the e2e-10ball
  // df4d5134 law) — S12's terminal assert consumes the snapshot
  let snap = null;
  for (let i = 0; i < 260 && (state === 'SIMULATING' || state === 'PLAYBACK'); i++) {
    await sleep(350);
    snap = await ev(`({ state: window.__test.state(),
      judgment: window.__rules?.judgment?.() ?? null })`);
    state = snap.state;
    if (i % 40 === 39) console.log(`[e2e-touch] ${tag}: playback running (${state})`);
  }
  const shots = (await shotsLogged()) - shots0;
  return {
    ok: shots === 1 && state !== 'SIMULATING' && state !== 'PLAYBACK',
    transition, state, shots, judgment: snap?.judgment ?? null,
  };
}

/** Scene + match shaping through the e2e-8ball seams (test setup only —
 * player interactions in these scenarios stay synthesized touch). */
async function ensureEightBall() {
  if (await ev(`window.__rules?.game?.()`) === 'eight_ball') return true;
  const ok = await ev(`window.__rules?.setGame?.('eight_ball')`);
  await sleep(500);
  return ok === true;
}
async function scene8(specs, ms) {
  await ev(`__test.layout(${JSON.stringify(specs)})`);
  await sleep(200);
  if (ms) await ev(`window.__rules?.setMatchState?.(${JSON.stringify(ms)})`);
  await sleep(450); // aim.js re-derives nomination on the frame hook
}
async function settleScripted(tag) {
  let s = await ev('__test.state()');
  for (let i = 0; i < 220 && (s === 'PLAYBACK' || s === 'SIMULATING'); i++) {
    await sleep(350);
    s = await ev('__test.state()');
    if (i % 40 === 39) console.log(`[e2e-touch] ${tag}: scripted shot settling (${s})`);
  }
  return s;
}

// ---- scenarios 8–14 ----------------------------------------------------------

// 8 — explicit fire only (US1-3, edge case)
async function sc8() {
  check('S8 eight_ball selectable (scene seam)', await ensureEightBall());
  await ev('__test.rerack(1)');
  await sleep(400);
  await ev(`window.__rules?.setMatchState?.({ shooter: 1, breaker: 1 })`);
  await ev('__test.setTip(0, 0)'); // neutral spin baseline (scene shaping)
  // GH-370: the fresh rack grants the opening BALL_IN_HAND (aiming state)
  const s8base = await ev('__test.state()');
  check('S8 baseline machine state aiming', s8base === 'AIM' || s8base === 'BALL_IN_HAND', s8base);
  const shots0 = await shotsLogged();

  // (a) gauge release fires nothing
  const g = await ev('window.__tp.findGauge()');
  check('S8 power gauge present', g.found, JSON.stringify(g));
  if (g.found) {
    await drag(client, { x: g.cx, y: g.y + g.h - 8 }, { x: g.cx, y: g.y + 8 },
      { steps: 12, stepMs: 16 });
    await sleep(300);
    check('S8 gauge release fires nothing (machine stays AIM)',
      ['AIM', 'BALL_IN_HAND'].includes(await ev('__test.state()'))
        && await shotsLogged() === shots0);
  }

  // (b) aim-drag end fires nothing
  await drag(client, { x: W * 0.30, y: H * 0.5 }, { x: W * 0.55, y: H * 0.5 },
    { steps: 12, stepMs: 16 });
  await sleep(250);
  check('S8 aim-drag end fires nothing',
    ['AIM', 'BALL_IN_HAND'].includes(await ev('__test.state()'))
      && await shotsLogged() === shots0);

  // (c) spin-popup close fires nothing
  const btn = await ev('window.__tp.findSpinButton()');
  check('S8 spin button present', btn.found, JSON.stringify(btn));
  if (btn.found) {
    await tap(client, btn.cx, btn.cy);
    await sleep(600);
    const pad = await ev('window.__tp.findPad()');
    if (pad.found) {
      await drag(client, { x: pad.cx, y: pad.cy },
        { x: pad.cx + pad.w * 0.2, y: pad.cy }, { steps: 8, stepMs: 16 });
      await sleep(150);
    }
    await closePopup();
    check('S8 popup close fires nothing',
      ['AIM', 'BALL_IN_HAND'].includes(await ev('__test.state()'))
        && await shotsLogged() === shots0);
  }
  await ev('__test.setTip(0, 0)'); // undo the pad poke (scene shaping)

  // (d) the ONLY firing path: FIRE tap → flow-wrapped chain
  const aim = await aimTo(Math.PI / 2);
  check('S8 touch aim converges on the break line', aim.ok === true,
    JSON.stringify(aim));
  const pow = await gaugeTo(8.5);
  check('S8 gauge sets break power 8.5', pow.ok === true, JSON.stringify(pow));
  const fired = await fireAndSettle('S8');
  check('S8 FIRE tap → SIMULATING/PLAYBACK via the flow chain',
    fired.ok === true, JSON.stringify(fired));
  // scene hygiene: a break may park a rulebook decision — accept and move on
  if (await ev('window.__rules?.matchState?.()?.pendingDecision != null')) {
    await ev('window.__rules.decide(1)');
    await sleep(400);
  }
}

// 9 — pocket nomination: tap zones + picker fallback (US1-4, FR-002; the
// picker arm completes with the T032 sheet — touch-e2e.md §3.1 row 9)
async function sc9() {
  check('S9 eight_ball active', await ensureEightBall());
  await scene8([{ id: 0, x: 0, y: -0.4 }, { id: 2, x: 0.45, y: 0.9 },
    { id: 8, x: 0.5, y: -0.8 }, ...FAR],
  { phase: 'open', shooter: 1, breaker: 1 });
  check('S9 nomination required on the shaped open table',
    await ev('window.__aim.nominationRequired()') === true);
  let marks = false;
  for (let i = 0; i < 20 && !marks; i++) {
    await sleep(200);
    marks = await ev('window.__aim.pocketMarks().some((m) => m.visible)');
  }
  check('S9 pocket marks visible for tapping', marks === true);

  // (a) in-zone tap: dead-center on the enlarged disc registers via __aim
  const pk = await ev('window.__tp.pocketScreen(5)');
  check('S9 pocket 5 disc projectable', pk.found, JSON.stringify(pk));
  if (pk.found) {
    await tap(client, pk.x, pk.y);
    await sleep(300);
  }
  check('S9 in-zone tap registers the nomination (call().pocket === 5)',
    await ev('window.__aim.call()?.pocket === 5'),
    JSON.stringify(await ev('window.__aim.call()')));

  // (b) a tap OUTSIDE the projected world disc but inside the 22 pt screen
  // floor still registers (rows 6/9 enlarged-zone law). Pick the pocket
  // whose projected 1.05·radius disc is smallest (farthest from camera) so
  // an outside-the-disc-inside-22px point exists.
  await ev('window.__aim.clearCall(); true');
  await sleep(200);
  const zone = await ev(`(() => {
    const pockets = window.__rules?.pockets?.() ?? [];
    let best = null;
    pockets.forEach((p, i) => {
      const c = window.__tp.projectK(p.x, p.y, 0.049);
      if (!c) return;
      const sx = window.__tp.projectK(p.x + p.r * 1.05, p.y, 0.049);
      const sy = window.__tp.projectK(p.x, p.y + p.r * 1.05, 0.049);
      const rPx = Math.max(sx ? Math.hypot(sx.x - c.x, sx.y - c.y) : 0,
        sy ? Math.hypot(sy.x - c.x, sy.y - c.y) : 0);
      if (!best || rPx < best.rPx) best = { i, rPx, x: c.x, y: c.y };
    });
    return best;
  })()`);
  check('S9 a pocket with a sub-22px projected disc exists',
    !!zone && zone.rPx > 0 && zone.rPx < 20, JSON.stringify(zone));
  if (zone && zone.rPx < 20) {
    const d = (zone.rPx + 21) / 2; // outside the disc, inside the 22 pt floor
    await tap(client, zone.x + d, zone.y);
    await sleep(300);
    check(`S9 tap outside the disc but inside 22 pt registers (pocket ${zone.i})`,
      await ev(`window.__aim.call()?.pocket === ${zone.i}`),
      JSON.stringify(await ev('window.__aim.call()')));
  }

  // (c) picker fallback: the status-strip call indicator opens the T032
  // sheet; a pocket row drives __aim.nominatePocket and closes the sheet
  await ev('window.__aim.clearCall(); true');
  await sleep(300);
  let ind = null;
  for (let i = 0; i < 20 && !ind; i++) {
    const r = await ev(`window.__tp.el('#hud-call')`);
    if (r.found && r.visible) ind = r;
    else await sleep(150);
  }
  check('S9 call indicator visible (picker opener)', !!ind, JSON.stringify(ind));
  if (ind) {
    check('S9 call indicator ≥44 pt', Math.min(ind.w, ind.h) >= 43.5,
      JSON.stringify(ind));
    await tap(client, ind.cx, ind.cy);
    let sheet = null;
    for (let i = 0; i < 20 && !sheet; i++) {
      const r = await ev(`window.__tp.el('#ob-pocket-picker')`);
      if (r.found && r.visible) sheet = r;
      else await sleep(150);
    }
    check('S9 picker sheet opens from the indicator', !!sheet, JSON.stringify(sheet));
    if (sheet) {
      const row = await ev(`(() => {
        const el = document.querySelector('#ob-pocket-picker [data-pocket="4"]');
        if (!el || !el.getClientRects().length) return null;
        const r = el.getBoundingClientRect();
        return { cx: r.x + r.width / 2, cy: r.y + r.height / 2,
          w: r.width, h: r.height };
      })()`);
      check('S9 picker pocket row present ≥44 pt',
        !!row && Math.min(row.w, row.h) >= 43.5, JSON.stringify(row));
      if (row) {
        await tap(client, row.cx, row.cy);
        await sleep(400);
      }
      check('S9 picker sheet drives nominatePocket (call().pocket === 4)',
        await ev('window.__aim.call()?.pocket === 4'),
        JSON.stringify(await ev('window.__aim.call()')));
      check('S9 picker closes after the pocket pick',
        (await ev(`window.__tp.el('#ob-pocket-picker')`)).visible !== true);
    }
  }
  check("S9 classifier back to S0", await ev("window.__touch?.state?.() === 'S0'"));
}

// 10 — BIH ghost placement (US1, FR-002)
async function sc10() {
  check('S10 eight_ball active', await ensureEightBall());
  await scene8([{ id: 0, x: 0, y: -0.4 }, { id: 3, x: 0.45, y: 0.9 },
    { id: 8, x: 0.5, y: -0.8 }, ...FAR],
  { phase: 'grouped', groups: { 1: 'solids', 2: 'stripes' }, shooter: 1, breaker: 1 });
  await ev('window.__rules?.call?.(3, 0)');
  const err = await ev(
    `__test.shoot({ v0: 0.35, phi: -Math.PI / 2, theta: 0, a: 0, b: 0 })`);
  check('S10 scene shot accepted (no-contact foul recipe)', !err, String(err));
  const s = await settleScripted('S10');
  check('S10 no-contact foul grants BALL_IN_HAND', s === 'BALL_IN_HAND', s);

  const cue = await ev(`(() => {
    const b = window.__test.balls().find((x) => x.id === 0);
    return b ? window.__tp.project(b.pos[0], b.pos[1], b.pos[2]) : null;
  })()`);
  check('S10 cue ball projectable for the grab', !!cue, JSON.stringify(cue));
  if (!cue) return;

  // drag to a valid target: ball lands at finger − GHOST_OFFSET_PX up-screen
  const A = { kx: -0.3, ky: -0.2 };
  const sA = await ev(`window.__tp.projectK(${A.kx}, ${A.ky})`);
  const fA = { x: sA.x, y: sA.y + GHOST_OFFSET_PX };
  await touchStart(client, [{ x: cue.x, y: cue.y }]);
  await sleep(60);
  for (let i = 1; i <= 12; i++) {
    const t = i / 12;
    await touchMove(client, [{
      x: cue.x + (fA.x - cue.x) * t, y: cue.y + (fA.y - cue.y) * t,
    }]);
    await sleep(16);
  }
  await sleep(200);
  check("S10 grab-zone drag classifies S3",
    await ev("window.__touch?.state?.() === 'S3'"));
  const gh = await ev('window.__touch?.ghost?.() ?? null');
  check('S10 ghost live + valid at a legal spot', gh?.valid === true,
    JSON.stringify(gh));
  const at = (kx, ky) => ev(`(() => {
    const b = window.__test.balls().find((x) => x.id === 0);
    return Math.hypot(b.pos[2] - (${kx}), b.pos[0] - (${ky}));
  })()`);
  check('S10 ball follows at the placement point (±0.035 m)',
    await at(A.kx, A.ky) <= 0.035, `dist=${await at(A.kx, A.ky)}`);
  const off = await ev(`(() => {
    const b = window.__test.balls().find((x) => x.id === 0);
    const p = window.__tp.project(b.pos[0], b.pos[1], b.pos[2]);
    return p ? { dx: p.x - ${fA.x}, dy: p.y - (${fA.y} - ${GHOST_OFFSET_PX}) } : null;
  })()`);
  check(`S10 GHOST_OFFSET_PX geometry (ball = finger − ${GHOST_OFFSET_PX}px up-screen, ±8px)`,
    !!off && Math.abs(off.dx) <= 8 && Math.abs(off.dy) <= 8, JSON.stringify(off));

  // frozen target in ONE hop (finger over ball 8): GH-370 class 3 (WPA
  // 1.6/3.7) — the request SNAPS to the kernel-admissible contact
  // separation instead of refusing (pre-370 red-proof: the drag kept the
  // last valid spot and the ghost tinted invalid)
  const s8 = await ev('window.__tp.ballScreen(8)');
  check('S10 blocker ball projectable', s8.found, JSON.stringify(s8));
  if (s8.found) {
    await touchMove(client, [{ x: s8.x, y: s8.y + GHOST_OFFSET_PX }]);
    await sleep(200);
    const snap8 = await ev(`(() => {
      const c = window.__test.balls().find((x) => x.id === 0);
      const b8 = window.__test.balls().find((x) => x.id === 8);
      return Math.hypot(c.pos[0] - b8.pos[0], c.pos[2] - b8.pos[2]);
    })()`);
    const r10 = await ev('window.__aim?.ballR?.() ?? 0.028575');
    check('S10 frozen target snaps to the contact separation (WPA 1.6/3.7)',
      snap8 >= 2 * r10 - 1e-9 && snap8 <= 2 * r10 + 2e-4,
      `gap-2r=${snap8 - 2 * r10}`);
    check('S10 ghost stays valid on the frozen placement',
      await ev('window.__touch?.ghost?.()?.valid === true'));
  }
  // the snapped landing IS the last valid position the cancel must keep
  const before = await ev(`JSON.stringify(
    window.__test.balls().find((x) => x.id === 0).pos)`);

  // touchCancel mid-drag: ball stays at the last valid position, no stuck
  // state. COMMITTED truth is kernel x/y (pos[2]/pos[0]) — still bit-compared
  // against the mid-drag snapshot; mesh Y is #143 drag-lift PRESENTATION
  // (lifted while grabbed, settled back to cloth level within ~130 ms of the
  // cancel), so the drain row below asserts the rest height + a drained lift
  // latch instead of the lifted snapshot (issue #143 amendment).
  await touchCancel(client);
  // #1165: the settle is a frame-driven animation that can outlast a fixed
  // read under host load (the #1159 twin, e2e-touch-disciplines D1, was read
  // mid-settle once after the same 250 ms sleep). Judge the drain: wait
  // (bounded: the last read comes 20 x 150 ms after the first) for the lift
  // latch to drain (state() null — phase idle) and mesh Y to settle at the
  // rest height, red by name if it never does.
  const latch = `(() => {
    const b = window.__test.balls().find((x) => x.id === 0);
    return { pos: b.pos, rest: window.__aim?.ballR?.() ?? 0.028575,
      lift: window.__aim?.dragLift?.state?.() ?? null };
  })()`;
  const drained = (k) => k.lift === null && Math.abs(k.pos[1] - k.rest) < 1e-9;
  let last = null;
  for (let i = 0; i <= 20 && !(last && drained(last)); i++) {
    if (i) await sleep(150);
    last = await ev(latch);
  }
  const cancelKept = await ev(latch);
  const b0 = JSON.parse(before);
  check('S10 the #143 drag lift drains after the cancel (phase idle, mesh Y '
    + 'at cloth level, within ~3 s — #1165)', drained(last) && drained(cancelKept),
    JSON.stringify({ last, cancelKept }));
  check('S10 touchCancel keeps the last valid position (kernel x/y bit — #143)',
    cancelKept.pos[0] === b0[0] && cancelKept.pos[2] === b0[2],
    JSON.stringify({ before: b0, cancelKept }));
  check("S10 touchCancel → S0 (no stuck state)",
    await ev("window.__touch?.state?.() === 'S0'"));
  check('S10 machine still BALL_IN_HAND after the cancel',
    await ev('__test.state()') === 'BALL_IN_HAND');

  // next gesture works: a fresh drag places at a new target
  const B = { kx: 0.2, ky: -0.5 };
  const cue2 = await ev(`(() => {
    const b = window.__test.balls().find((x) => x.id === 0);
    return window.__tp.project(b.pos[0], b.pos[1], b.pos[2]);
  })()`);
  const sB = await ev(`window.__tp.projectK(${B.kx}, ${B.ky})`);
  if (cue2 && sB) {
    await touchStart(client, [{ x: cue2.x, y: cue2.y }]);
    await sleep(60);
    for (let i = 1; i <= 10; i++) {
      const t = i / 10;
      await touchMove(client, [{
        x: cue2.x + (sB.x - cue2.x) * t,
        y: cue2.y + (sB.y + GHOST_OFFSET_PX - cue2.y) * t,
      }]);
      await sleep(16);
    }
    await touchEnd(client, []);
    await sleep(250);
  }
  check('S10 next gesture places at a fresh target (±0.035 m)',
    await at(B.kx, B.ky) <= 0.035, `dist=${await at(B.kx, B.ky)}`);
  check("S10 classifier back to S0", await ev("window.__touch?.state?.() === 'S0'"));
}

// 11 — interruption hard-reset (edge case)
async function sc11() {
  check('S11 eight_ball active', await ensureEightBall());
  await scene8([{ id: 0, x: 0, y: 0 }, { id: 3, x: 0.45, y: 0.9 },
    { id: 8, x: 0.5, y: -0.8 }, ...FAR],
  { phase: 'grouped', groups: { 1: 'solids', 2: 'stripes' }, shooter: 1, breaker: 1 });
  check('S11 scene parked in AIM', await ev('__test.state()') === 'AIM');
  const shots0 = await shotsLogged();
  const y = H * 0.5;
  const x0 = Math.round(W * 0.35);

  // (a) touchCancel mid-aim-drag
  await touchStart(client, [{ x: x0, y }]);
  for (const dx of [6, 14, 26, 40]) {
    await touchMove(client, [{ x: x0 + dx, y }]);
    await sleep(16);
  }
  check("S11 aim drag live (S2)", await ev("window.__touch?.state?.() === 'S2'"));
  await touchCancel(client);
  await sleep(200);
  check("S11 touchCancel mid-aim → S0",
    await ev("window.__touch?.state?.() === 'S0'"));
  check('S11 cancel fired nothing',
    ['AIM', 'BALL_IN_HAND'].includes(await ev('__test.state()'))
      && await shotsLogged() === shots0);

  // (b) visibilitychange(hidden)/blur mid-aim-drag → row 23 hard reset
  await touchStart(client, [{ x: x0, y }]);
  for (const dx of [6, 14, 26]) {
    await touchMove(client, [{ x: x0 + dx, y }]);
    await sleep(16);
  }
  await ev(`(() => {
    Object.defineProperty(document, 'hidden',
      { get: () => true, configurable: true });
    Object.defineProperty(document, 'visibilityState',
      { get: () => 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('blur'));
    delete document.hidden;
    delete document.visibilityState;
    return true;
  })()`);
  await sleep(200);
  check("S11 visibility/blur hard reset → S0",
    await ev("window.__touch?.state?.() === 'S0'"));
  await ev('window.__e2e.p0 = window.__aim.getPhi(); true');
  for (const dx of [60, 84, 108]) { // the still-down finger writes nothing
    await touchMove(client, [{ x: x0 + dx, y }]);
    await sleep(16);
  }
  check('S11 post-reset moves write no aim (bit)',
    await ev('window.__aim.getPhi() === window.__e2e.p0'));
  await touchEnd(client, []);
  await sleep(200);
  check('S11 hard reset fired nothing',
    ['AIM', 'BALL_IN_HAND'].includes(await ev('__test.state()'))
      && await shotsLogged() === shots0);

  // (c) mid-gauge-drag interruption: no tipDrag-class stuck latch
  const g = await ev('window.__tp.findGauge()');
  check('S11 power gauge present', g.found, JSON.stringify(g));
  if (g.found) {
    await touchStart(client, [{ x: g.cx, y: g.y + g.h - 10 }]);
    for (const k of [0.2, 0.4, 0.6]) {
      await touchMove(client, [{ x: g.cx, y: g.y + g.h - 10 - (g.h - 20) * k }]);
      await sleep(20);
    }
    await touchCancel(client);
    await sleep(200);
    check('S11 gauge cancel fires nothing',
      ['AIM', 'BALL_IN_HAND'].includes(await ev('__test.state()'))
        && await shotsLogged() === shots0);
    const va = await ev(`Number(document.getElementById('power').value)`);
    await drag(client, { x: g.cx, y: g.y + g.h * 0.75 },
      { x: g.cx, y: g.y + g.h * 0.25 }, { steps: 8, stepMs: 16 });
    await sleep(200);
    const vb = await ev(`Number(document.getElementById('power').value)`);
    check('S11 gauge works after the cancel (no stuck latch)', vb !== va,
      `${va} → ${vb}`);
  }

  // (d) the classifier itself is healthy: next gesture aims again
  await ev('window.__e2e.p0 = window.__aim.getPhi(); true');
  await drag(client, { x: W * 0.30, y }, { x: W * 0.52, y },
    { steps: 10, stepMs: 16 });
  await sleep(200);
  check('S11 next gesture works (phi moved)',
    await ev('window.__aim.getPhi() !== window.__e2e.p0'));
  check("S11 back to S0", await ev("window.__touch?.state?.() === 'S0'"));
  check('S11 whole scenario fired nothing', await shotsLogged() === shots0);
}

// 12 — full rack (scripted US1, SC-001/FR-007): break → called pot →
// spin scratch → ball-in-hand → win, every player input synthesized touch
async function sc12() {
  check('S12 eight_ball selectable', await ensureEightBall());

  // break leg: touch aim + gauge power + popup spin + FIRE
  console.log('[e2e-touch] S12: break leg');
  await ev('__test.rerack(1)');
  await sleep(400);
  await ev(`window.__rules?.setMatchState?.({ shooter: 1, breaker: 1 })`);
  const aim1 = await aimTo(Math.PI / 2);
  check('S12 break aim converges by touch', aim1.ok === true, JSON.stringify(aim1));
  const pow1 = await gaugeTo(8.5);
  check('S12 break power 8.5 by gauge', pow1.ok === true, JSON.stringify(pow1));
  const spin1 = await spinPadSet(0, -0.1);
  check('S12 break spin b≈−0.1 by popup pad', spin1.ok === true,
    JSON.stringify(spin1));
  await closePopup();
  const f1 = await fireAndSettle('S12 break');
  check('S12 break fired by the FIRE tap', f1.ok === true, JSON.stringify(f1));
  check('S12 break adjudicated', await ev('window.__rules.judgment() !== null'));
  if (await ev('window.__rules?.matchState?.()?.pendingDecision != null')) {
    await ev('window.__rules.decide(1)'); // accept — the rack continues
    await sleep(400);
  }

  // called-pot leg: tap the call ball + pocket disc, aim, power, FIRE
  console.log('[e2e-touch] S12: called-pot leg');
  await scene8([{ id: 0, x: 0, y: 0 }, { id: 2, x: POT.x, y: POT.y },
    { id: 8, x: 0.5, y: -0.8 }, ...FAR],
  { phase: 'open', shooter: 1, breaker: 1 });
  check('S12 nomination required on the shaped open table',
    await ev('window.__aim.nominationRequired()') === true);
  let marks = false;
  for (let i = 0; i < 20 && !marks; i++) {
    await sleep(200);
    marks = await ev('window.__aim.pocketMarks().some((m) => m.visible)');
  }
  check('S12 pocket marks visible for tapping', marks === true);
  const b2 = await ev('window.__tp.ballScreen(2)');
  check('S12 call ball projectable', b2.found, JSON.stringify(b2));
  if (b2.found) { await tap(client, b2.x, b2.y); await sleep(300); }
  const pk2 = await ev('window.__tp.pocketScreen(5)');
  check('S12 pocket 5 disc projectable', pk2.found, JSON.stringify(pk2));
  if (pk2.found) { await tap(client, pk2.x, pk2.y); await sleep(300); }
  check('S12 tap nomination composed {ball:2, pocket:5}', await ev(`(() => {
    const c = window.__aim.call();
    return !!c && c.ball === 2 && c.pocket === 5;
  })()`), JSON.stringify(await ev('window.__aim.call()')));
  const aim2 = await aimTo(PHI);
  const pow2 = await gaugeTo(2.5);
  const spin2 = await spinPadSet(0, 0);
  await closePopup();
  check('S12 pot leg aim/power/spin set by touch',
    aim2.ok === true && pow2.ok === true && spin2.ok === true,
    JSON.stringify({ aim2, pow2, spin2 }));
  const f2 = await fireAndSettle('S12 pot');
  check('S12 called pot returns to AIM', f2.ok === true && f2.state === 'AIM',
    JSON.stringify(f2));
  const j2 = await ev('window.__rules.judgment()');
  check('S12 called ball potted (legal, [2])',
    j2?.legal === true && JSON.stringify(j2?.pocketed) === '[2]',
    JSON.stringify(j2));
  check('S12 groups assigned by the called solid',
    await ev(`window.__rules.matchState()?.groups?.[1] === 'solids'`));

  // spin leg: follow-in scratch (S7 recipe b=+0.45) → BALL_IN_HAND
  console.log('[e2e-touch] S12: spin-scratch leg');
  await scene8([{ id: 0, x: 0, y: 0 }, { id: 3, x: POT.x, y: POT.y },
    { id: 8, x: 0.5, y: -0.8 }, ...FAR],
  { phase: 'grouped', groups: { 1: 'solids', 2: 'stripes' }, shooter: 1, breaker: 1 });
  const b3 = await ev('window.__tp.ballScreen(3)');
  if (b3.found) { await tap(client, b3.x, b3.y); await sleep(250); }
  const pk3 = await ev('window.__tp.pocketScreen(5)');
  if (pk3.found) { await tap(client, pk3.x, pk3.y); await sleep(250); }
  check('S12 scratch-leg call composed by taps', await ev(`(() => {
    const c = window.__aim.call();
    return !!c && c.ball === 3 && c.pocket === 5;
  })()`));
  const aim3 = await aimTo(PHI);
  const pow3 = await gaugeTo(3.5);
  const spin3 = await spinPadSet(0, 0.45);
  await closePopup();
  check('S12 follow spin b≈+0.45 by popup pad', spin3.ok === true,
    JSON.stringify(spin3));
  check('S12 scratch-leg aim/power set by touch',
    aim3.ok === true && pow3.ok === true, JSON.stringify({ aim3, pow3 }));
  const f3 = await fireAndSettle('S12 scratch');
  check('S12 follow-in scratch grants BALL_IN_HAND',
    f3.ok === true && f3.state === 'BALL_IN_HAND', JSON.stringify(f3));

  // ball-in-hand leg: ghost-offset drag places the respotted cue
  console.log('[e2e-touch] S12: ball-in-hand leg');
  const cue = await ev(`(() => {
    const b = window.__test.balls().find((x) => x.id === 0);
    return b && !b.pocketed
      ? window.__tp.project(b.pos[0], b.pos[1], b.pos[2]) : null;
  })()`);
  check('S12 cue ball available for the BIH grab', !!cue, JSON.stringify(cue));
  const T = { kx: -0.25, ky: -0.35 };
  const sT = await ev(`window.__tp.projectK(${T.kx}, ${T.ky})`);
  if (cue && sT) {
    await touchStart(client, [{ x: cue.x, y: cue.y }]);
    await sleep(60);
    for (let i = 1; i <= 12; i++) {
      const t = i / 12;
      await touchMove(client, [{
        x: cue.x + (sT.x - cue.x) * t,
        y: cue.y + (sT.y + GHOST_OFFSET_PX - cue.y) * t,
      }]);
      await sleep(16);
    }
    await touchEnd(client, []);
    await sleep(300);
  }
  const dist = await ev(`(() => {
    const b = window.__test.balls().find((x) => x.id === 0);
    return Math.hypot(b.pos[2] - (${T.kx}), b.pos[0] - (${T.ky}));
  })()`);
  check('S12 BIH ghost drag places the cue at the target (±0.035 m)',
    dist <= 0.035, `dist=${dist}`);

  // win leg: only the 8 left — tap-called 8 in pocket 5 wins the rack
  console.log('[e2e-touch] S12: win leg');
  await scene8([{ id: 0, x: 0, y: 0 }, { id: 8, x: POT.x, y: POT.y }],
    { phase: 'grouped', groups: { 1: 'solids', 2: 'stripes' }, shooter: 2, breaker: 1 });
  const b8 = await ev('window.__tp.ballScreen(8)');
  if (b8.found) { await tap(client, b8.x, b8.y); await sleep(250); }
  const pk8 = await ev('window.__tp.pocketScreen(5)');
  if (pk8.found) { await tap(client, pk8.x, pk8.y); await sleep(250); }
  check('S12 the 8-call composed by pocket tap', await ev(`(() => {
    const c = window.__aim.call();
    return !!c && c.ball === 8 && c.pocket === 5;
  })()`));
  const aim4 = await aimTo(PHI);
  const pow4 = await gaugeTo(2.5);
  const spin4 = await spinPadSet(0, 0);
  await closePopup();
  check('S12 win-leg aim/power/spin set by touch',
    aim4.ok === true && pow4.ok === true && spin4.ok === true,
    JSON.stringify({ aim4, pow4, spin4 }));
  const f4 = await fireAndSettle('S12 win');
  check('S12 called 8 reaches WIN', f4.ok === true && f4.state === 'WIN',
    JSON.stringify(f4));
  // atomic with the WIN edge (see fireAndSettle) — the 2.6 s auto re-rack
  // nulls the judgment surface, so a separate read races it under load
  const term = f4.judgment?.terminal ?? null;
  check('S12 rack won by the called 8 (eight-ball-pocketed)',
    term?.winner === 2 && term?.reason === 'eight-ball-pocketed',
    JSON.stringify(term));
  await sleep(3200); // WIN auto re-rack (suite hygiene)
}

// 13 — replay/settings/share reachability (edge case, FR-002)
async function sc13() {
  // prerequisite: at least one recorded shot (standalone runs compose one)
  if (await shotsLogged() === 0) {
    await ensureEightBall();
    await ev('__test.rerack(1)');
    await sleep(400);
    await ev(`window.__rules?.setMatchState?.({ shooter: 1, breaker: 1 })`);
    await ev(`__test.shoot({ v0: 8.5, phi: Math.PI / 2, theta: 0, a: 0, b: -0.1 })`);
    await settleScripted('S13 setup');
    if (await ev('window.__rules?.matchState?.()?.pendingDecision != null')) {
      await ev('window.__rules.decide(1)');
      await sleep(400);
    }
  }
  check('S13 a recorded shot exists for share/replay',
    await shotsLogged() >= 1);

  // settings SHEET via a gear tap (feature 015: the drawer is a full-screen
  // modal sheet; the action rows live in the #ob-settings-actions mount and
  // CLOSE the sheet before dispatching their toolbar pill).
  // GH-225 Phase D: the Export + Record rows are retired (030 the design charter DVR
  // amendment clause 4), so the surviving row contract is
  // ['ob-share', 'rerack'] and Share is rows[0]. The export-dialog legs that
  // hung off the Export row are RETARGETED, not deleted: the phone's video
  // entry is now the #ob-playback toolbar pill, and this scenario taps it
  // for real below (nothing else in e2e-touch covered phone reachability of
  // the DVR).
  const gear = await ev(`window.__tp.el('#ob-gear')`);
  check('S13 settings gear tappable on phone',
    gear.found && gear.visible && Math.min(gear.w, gear.h) >= 40,
    JSON.stringify(gear));
  if (gear.found && gear.visible) {
    await tap(client, gear.cx, gear.cy);
    await sleep(700);
    const sheet = await ev(`(() => {
      const d = document.getElementById('ob-settings');
      if (!d || !d.getClientRects().length
          || getComputedStyle(d).visibility === 'hidden') {
        return { open: false };
      }
      const r = d.getBoundingClientRect();
      return { open: true,
        fullscreen: r.left <= 1 && r.top <= 1
          && r.right >= innerWidth - 1 && r.bottom >= innerHeight - 1,
        tabs: document.querySelectorAll(
          '#ob-settings-tabs .ob-set-nav').length,
        actions: !!document.getElementById('ob-settings-actions') };
    })()`);
    check('S13 settings sheet opens full-screen from the gear tap (015 §5)',
      sheet.open === true && sheet.fullscreen === true, JSON.stringify(sheet));
    // FOUR sections since features 032 / 034 (equipment → the atelier, game →
    // the play place; e2e-settings pins the same 4) — the six-tab pin was
    // stale (GH-668 S5 slice 2 G5 ran this scenario alone and hit it)
    check('S13 sheet carries the four-section tab strip + actions mount',
      sheet.tabs === 4 && sheet.actions === true, JSON.stringify(sheet));
    const rows = await ev('window.__tp.drawerRows()');
    check('S13 sheet carries the Share + Re-rack rows', rows.found === true,
      JSON.stringify(rows));
    // NEGATIVE: the retired rows must not come back as ghosts
    const ghostRows = await ev(`(() => ({
      exportRow: !!document.querySelector('.ob-touch-row[data-i18n="export.button"]'),
      recordRow: !!document.querySelector('.ob-touch-row[data-i18n="record.button"]'),
      recordDock: !!document.getElementById('ob-record-dock'),
    }))()`);
    check('S13 retired Export/Record rows + record dock are absent (Phase D)',
      ghostRows.exportRow === false && ghostRows.recordRow === false
      && ghostRows.recordDock === false, JSON.stringify(ghostRows));
    if (rows.found) {
      const shareRow = rows.rows[0];
      await tap(client, shareRow.cx, shareRow.cy);
      await sleep(800);
      const toast = await ev(`window.__tp.el('#ob-share-toast')`);
      check('S13 Share row runs the share flow (toast shown)',
        toast.found && toast.visible, JSON.stringify(toast));
      // rows close the sheet themselves — nothing left open here
    } else {
      await ev(`document.getElementById('ob-gear').click()`); // harness cleanup
      await sleep(400);
    }
  }

  // GH-225 Phase D: the phone's replacement video entry. The Export row this
  // scenario used to tap is gone; the DVR pill is IN the phone toolbar, so
  // the same "reachable by a real touch, opens its surface, closes clean"
  // claim is re-asserted against it.
  {
    const pbPill = await ev(`window.__tp.el('#ob-playback')`);
    check('S13 Playback pill tappable on phone (>=44pt)',
      pbPill.found && pbPill.visible
      && Math.min(pbPill.w, pbPill.h) >= 43.5, JSON.stringify(pbPill));
    if (pbPill.found && pbPill.visible) {
      await tap(client, pbPill.cx, pbPill.cy);
      let panel = { found: false, visible: false };
      for (let i = 0; i < 40 && !(panel.found && panel.visible); i++) {
        await sleep(200);
        panel = await ev(`window.__tp.el('#ob-pb-panel')`);
      }
      check('S13 Playback pill opens the DVR session list by touch',
        panel.found && panel.visible, JSON.stringify(panel));
      await ev(`window.__playback?.close?.()`);
      await sleep(500);
      const panel2 = await ev(`window.__tp.el('#ob-pb-panel')`);
      check('S13 DVR session list closes clean',
        !panel2.found || !panel2.visible, JSON.stringify(panel2));
    }
  }

  // replay bar: boot the #r= link, then drive it by taps
  const shareUrl = await ev('window.__share.encode()');
  check('S13 replay URL encodable', typeof shareUrl === 'string'
    && shareUrl.includes('#'), String(shareUrl).slice(0, 60));
  if (typeof shareUrl === 'string' && shareUrl.includes('#')) {
    const base = url.split('#')[0].split('?')[0];
    await client.send('Page.navigate',
      { url: `${base}?obtool=1${shareUrl.slice(shareUrl.indexOf('#'))}` });
    check('S13 replay boot ready', await waitReady(client));
    let bar = false;
    for (let i = 0; i < 80 && !bar; i++) {
      await sleep(200);
      bar = await ev(`!!document.getElementById('ob-rp-exit')`);
    }
    check('S13 replay bar appears on the shared boot', bar === true);
    await sleep(1000);
    await ev(PAGE_HELPERS_JS);
    if (bar) {
      // #49 icon RENDER gate (review finding 3): data-icon is set by
      // share.js itself, so asserting the attribute can never catch a
      // missing retrofit — assert the RENDERED result instead: every
      // [data-icon] face in the replay bar carries an svg child once
      // ui/icons.js resolves (dynamic import: poll bounded, e2e-ui J4
      // idiom). A fresh serve MUST render SVG; text is stale-cache only.
      let faces = { n: 0, svg: 0 };
      for (let i = 0; i < 30; i++) {
        // button-scoped: icons.js stamps data-icon on the SVG face too —
        // an unscoped [data-icon] query would count each face twice
        faces = await ev(`(() => {
          const nodes = [...document.querySelectorAll('#ob-replay button[data-icon]')];
          return { n: nodes.length,
            svg: nodes.filter((b) => b.querySelector('svg')).length };
        })()`);
        if (faces.n > 0 && faces.svg === faces.n) break;
        await sleep(100);
      }
      check('S13 replay-bar [data-icon] faces render SVG children',
        faces.n > 0 && faces.svg === faces.n, JSON.stringify(faces));
      const pause = await ev(`window.__tp.el('#ob-rp-pause')`);
      check('S13 pause control visible', pause.found && pause.visible,
        JSON.stringify(pause));
      if (pause.found && pause.visible) {
        // #49 icon system: the face is an SVG whose name rides data-icon
        // (pause ↔ play); textContent covers the stale-cache text fallback
        const faceExpr = `(() => { const b = document.getElementById('ob-rp-pause');
          return b.dataset.icon || b.textContent; })()`;
        const g0txt = await ev(faceExpr);
        await tap(client, pause.cx, pause.cy);
        await sleep(400);
        const g1txt = await ev(faceExpr);
        check('S13 pause tap toggles playback', g1txt !== g0txt,
          `${g0txt} → ${g1txt}`);
        // the toggled face must RE-render as an SVG, not fall back to text
        check('S13 toggled pause face re-renders as SVG',
          await ev(`!!document.querySelector('#ob-rp-pause svg')`));
        await tap(client, pause.cx, pause.cy); // resume
        await sleep(300);
      }
      // gotoShot fast-forwards ASYNCHRONOUSLY (i resets to −1, prior shots
      // re-fire): scrub assertions poll bounded for the landing index
      const atShot = async (k, tries = 150) => {
        for (let i = 0; i < tries; i++) {
          if ((await ev('window.__share.replay()')).i === k) return true;
          await sleep(300);
        }
        return false;
      };
      const rp = await ev('window.__share.replay()');
      if (rp.n >= 2) {
        const next = await ev(`window.__tp.el('#ob-rp-next')`);
        const prev = await ev(`window.__tp.el('#ob-rp-prev')`);
        if (next.found && prev.found) {
          await tap(client, next.cx, next.cy);
          const fwd = await atShot(1);
          check('S13 next tap scrubs to shot 1', fwd,
            `i=${(await ev('window.__share.replay()')).i}`);
          await tap(client, prev.cx, prev.cy);
          check('S13 prev tap scrubs back to shot 0', await atShot(0),
            `i=${(await ev('window.__share.replay()')).i}`);
        }
      } else {
        const prev = await ev(`window.__tp.el('#ob-rp-prev')`);
        if (prev.found && prev.visible) {
          await tap(client, prev.cx, prev.cy);
        }
        check('S13 prev tap at shot 0 restarts shot 0 (safe)', await atShot(0));
      }
      // re-rack lock during a shared replay (issue #51 review F3): the
      // sheet's Re-rack row must be inert while ctx.replayActive — firing
      // game.rerack under the sender's transient config would corrupt the
      // viewer's state (flow.js onRerack now refuses; the row disables
      // through the ob:settings broadcast). Pause playback first: a frozen
      // clock makes the balls snapshot a stable observable.
      const pauseLock = await ev(`window.__tp.el('#ob-rp-pause')`);
      if (pauseLock.found && pauseLock.visible) {
        await tap(client, pauseLock.cx, pauseLock.cy);
        await sleep(400);
      }
      const gearLock = await ev(`window.__tp.el('#ob-gear')`);
      if (gearLock.found && gearLock.visible) {
        await tap(client, gearLock.cx, gearLock.cy);
        await sleep(700);
        const rowsLock = await ev('window.__tp.drawerRows()');
        // GH-225 Phase D: Share + Re-rack only — Re-rack is rows[1]
        const rrLock = rowsLock.rows?.[1];
        check('S13 Re-rack row is inert (disabled) during a shared replay',
          rrLock?.found === true && rrLock.disabled === true,
          JSON.stringify(rrLock));
        if (rrLock?.found) {
          await ev('window.__e2eReplayBalls = JSON.stringify(__test.balls()); true');
          await tap(client, rrLock.cx, rrLock.cy);
          await sleep(800);
          const fired = await ev(
            'JSON.stringify(__test.balls()) !== window.__e2eReplayBalls'
            + ' || window.__share.replay().active !== true');
          check('S13 Re-rack does not fire during a shared replay',
            fired === false, JSON.stringify({
              active: await ev('window.__share.replay().active'),
              state: await ev('__test.state()') }));
        }
        // a disabled row never closes the sheet — close it for the exit arm
        await ev(`document.getElementById('ob-settings-close')?.click(); true`);
        await sleep(500);
      }
      const exit = await ev(`window.__tp.el('#ob-rp-exit')`);
      check('S13 exit control visible', exit.found && exit.visible,
        JSON.stringify(exit));
      if (exit.found && exit.visible) {
        await tap(client, exit.cx, exit.cy);
        await sleep(900);
        check('S13 exit tap leaves the replay',
          await ev('window.__share.replay().active') === false);
      }
    }
    // fresh app boot for whatever runs after this scenario
    await client.send('Page.navigate',
      { url: url + (url.includes('obtool=') ? '' : '&obtool=1') });
    check('S13 app reboots after the replay hop', await waitReady(client));
    await sleep(1200);
    await ev(PAGE_HELPERS_JS);
    await ev('window.__e2e = {}; true');

    // re-rack row (issue #51): rows[1] since GH-225 Phase D (Share + Re-rack)
    // dispatches the CSS-hidden #rerack HUD button — flow.js
    // game.rerack(seed + 1) must run (fresh rack, state AIM) and the sheet
    // must yield first. Runs LAST on the fresh boot: re-racking earlier
    // would wipe the share log the replay arm above depends on.
    const gear2 = await ev(`window.__tp.el('#ob-gear')`);
    if (gear2.found && gear2.visible) {
      await tap(client, gear2.cx, gear2.cy);
      await sleep(700);
      const rows3 = await ev('window.__tp.drawerRows()');
      check('S13 sheet carries the Re-rack row (rows[1], hud.rerack)',
        rows3.found === true && rows3.rows[1]?.key === 'hud.rerack',
        JSON.stringify(rows3));
      if (rows3.found && rows3.rows[1]?.found) {
        // observable: the balls snapshot MUST change (seed+1 re-seeds the
        // rack micro-gaps) and state returns to AIM — __test exposes no
        // seed (main.js frozen)
        await ev('window.__e2eBalls0 = JSON.stringify(__test.balls()); true');
        await tap(client, rows3.rows[1].cx, rows3.rows[1].cy);
        let reracked = false;
        for (let i = 0; i < 20 && !reracked; i++) {
          await sleep(200);
          reracked = await ev(
            `JSON.stringify(__test.balls()) !== window.__e2eBalls0`
            + ` && ['AIM','BALL_IN_HAND'].includes(__test.state())`
            + ` && __test.balls().every((b) => !b.pocketed)`);
        }
        check('S13 Re-rack row re-racks by touch (fresh rack, aiming state)',
          reracked === true, JSON.stringify({
            state: await ev('__test.state()'),
            pocketed: await ev(
              '__test.balls().filter((b) => b.pocketed).map((b) => b.id)') }));
        const sheetGone = await ev(`(() => {
          const d = document.getElementById('ob-settings');
          return !d || !d.getClientRects().length
            || getComputedStyle(d).visibility === 'hidden';
        })()`);
        check('S13 Re-rack row closed the sheet before dispatching',
          sheetGone === true);
      }
    }

    // accepted re-rack confirm on the PHONE SHEET (#121 review finding 2):
    // the desktop e2e-settings C/C2 arms assert the auto-close-iff-rerack
    // teardown, but the SHEET register must prove it by touch too — a cloth
    // change raises the kit confirm, a REAL tap on Continue commits +
    // re-racks, and the sheet auto-closes itself with ZERO leaked backdrops
    // (contract 015 §7 D14; mirrors the desktop C check).
    const gear3 = await ev(`window.__tp.el('#ob-gear')`);
    if (gear3.found && gear3.visible) {
      await tap(client, gear3.cx, gear3.cy);
      await sleep(700);
      // (032 re-cut: the equipment pane migrated to the atelier — the S13
      // subject is the SHEET's auto-close-iff-rerack teardown, and the
      // changeEquipment API raises the same pane-independent kit confirm
      // over the open sheet; the station pointer path is e2e-atelier's)
      await ev(`(window.__settings.changeEquipment(
        'cloth_id', 'worn_slow'), true)`);
      let accept = { found: false, visible: false };
      for (let i = 0; i < 25 && !(accept.found && accept.visible); i++) {
        await sleep(200);
        accept = await ev(`window.__tp.el('[data-ob="confirm-accept"]')`);
      }
      check('S13 cloth change raises the kit re-rack confirm on the sheet',
        accept.found && accept.visible, JSON.stringify(accept));
      if (accept.found && accept.visible) {
        await tap(client, accept.cx, accept.cy);
        let autoClosed = false;
        for (let i = 0; i < 25 && !autoClosed; i++) {
          await sleep(200);
          autoClosed = await ev(`(() => {
            const d = document.getElementById('ob-settings');
            const gone = !d || !d.getClientRects().length
              || getComputedStyle(d).visibility === 'hidden';
            return gone && !document.querySelector('[data-ob="confirm"]');
          })()`);
        }
        const after = await ev(`({
          cloth: window.__settings.get().equipment.cloth_id,
          state: __test.state(),
          backdrops: document.querySelectorAll('.ob-backdrop').length,
          hudBack: document.getElementById('hud')?.inert === false })`);
        check('S13 accepted re-rack confirm AUTO-closes the phone sheet '
          + '(shell gone, zero leaked backdrops, HUD restored, AIM)',
        autoClosed === true && after.cloth === 'worn_slow'
          // GH-370: the equipment re-rack parks in the opening BALL_IN_HAND
          && (after.state === 'AIM' || after.state === 'BALL_IN_HAND')
          && after.backdrops === 0
          && after.hudBack === true, JSON.stringify(after));
        // restore the calibrated default cloth (scripted skipConfirm pin —
        // no confirm, no auto-close; later scenarios keep the defaults)
        await ev(`window.__settings.changeEquipment(
          'cloth_id', 'pool_worsted_new', { skipConfirm: true })`);
        await sleep(500);
      }
    }
  }
}

// 14 — rotate prompt (FR-003)
async function sc14() {
  await setPhoneMetrics(client, { width: H, height: W }); // portrait flip
  await sleep(900);
  const rot = await ev(`window.__tp.el('#ob-rotate')`);
  check('S14 #ob-rotate visible in portrait', rot.found && rot.visible,
    JSON.stringify(rot));
  if (rot.found && rot.visible) {
    check('S14 rotate scrim covers the viewport',
      rot.x <= 1 && rot.y <= 1 && rot.w >= H - 2 && rot.h >= W - 2,
      JSON.stringify(rot));
    const inert = await ev(`(() => {
      const rotEl = document.getElementById('ob-rotate');
      const pts = [[innerWidth / 2, innerHeight / 2]];
      const sr = document.getElementById('shoot')?.getBoundingClientRect();
      if (sr && sr.width) pts.push([sr.left + sr.width / 2, sr.top + sr.height / 2]);
      const misses = pts.filter(([x, y]) => {
        if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return false;
        const el = document.elementFromPoint(x, y);
        return !(el && (el === rotEl || rotEl.contains(el)));
      });
      return { misses: misses.length, n: pts.length };
    })()`);
    check('S14 game chrome inert beneath the scrim (hit-test lands on the prompt)',
      inert.misses === 0, JSON.stringify(inert));
    await ev('window.__e2e.p0 = window.__aim?.getPhi?.() ?? null; true');
    await tap(client, Math.round(H * 0.5), Math.round(W * 0.5));
    await sleep(250);
    check('S14 tap under the prompt mutates nothing (phi bit-unchanged)',
      await ev('(window.__aim?.getPhi?.() ?? null) === window.__e2e.p0'));
  }
  await setPhoneMetrics(client, { width: W, height: H }); // back to landscape
  await sleep(900);
  const rot2 = await ev(`window.__tp.el('#ob-rotate')`);
  check('S14 rotate prompt present but hidden in landscape',
    rot2.found && !rot2.visible, JSON.stringify(rot2));
}

// 15 — help overlay on a touch boot (feature 024, help-overlay.md §6/§7:
// touch-first ordering SC-003 arm 2 + the 014 touch-target conventions).
// Runs after the suite's classifier-readiness checks (sc1 proved
// window.__touch.installed — the R1 mode signal). EXPECTED RED until the
// 024 integrator applies hunk A (T024) — the frozen selectors are coded
// here regardless (tasks.md lane C law).
async function sc15() {
  const helpUp = await ev(`typeof window.__help?.open === 'function'`);
  check('S15 __help surface present on touch boot', helpUp === true);
  if (!helpUp) return; // every assertion below needs the module

  check("S15 mode() reports 'touch' (R1 signal — __touch.installed boot)",
    await ev(`window.__help.mode() === 'touch'`));

  // entry via the toolbar pill — a REAL synthesized tap
  const pill = await ev(`window.__tp.el('#ob-help')`);
  check('S15 #ob-help pill present + visible', pill.found && pill.visible,
    JSON.stringify(pill));
  if (!pill.found || !pill.visible) return;
  await ev('window.__e2e.hphi = window.__aim?.getPhi?.() ?? null; true');
  await tap(client, Math.round(pill.cx), Math.round(pill.cy));
  await sleep(600); // panel enter motion
  const opened = await ev(`window.__help.isOpen()
    && document.getElementById('ob-help-panel')?.getClientRects().length > 0`);
  check('S15 tap on the pill opens the overlay', opened === true);

  // touch-first ordering (SC-003 arm 2): document order of [data-section]
  // puts touch FIRST and expanded; fine-pointer sections collapsed
  const order = await ev(`(() => {
    const secs = [...document.querySelectorAll(
      '#ob-help-panel section[data-section]')];
    const st = (id) => {
      const s = secs.find((x) => x.dataset.section === id);
      if (!s) return null;
      return { expanded: s.querySelector('.ob-help__disclose')
        ?.getAttribute('aria-expanded') === 'true',
      hidden: !!s.querySelector('.ob-help__region')?.hidden };
    };
    return { order: secs.map((s) => s.dataset.section).join(','),
      touch: st('touch'), mouse: st('mouse'), trackpad: st('trackpad'),
      keyboard: st('keyboard') };
  })()`);
  check('S15 touch section FIRST + expanded',
    order.order.startsWith('touch,') && order.touch?.expanded === true
    && order.touch?.hidden === false, JSON.stringify(order));
  check('S15 fine-pointer sections collapsed (mouse/trackpad/keyboard)',
    [order.mouse, order.trackpad, order.keyboard].every(
      (s) => s && s.expanded === false && s.hidden === true),
    JSON.stringify(order));

  // collapsed-but-tap-expandable: a real tap on the mouse disclose header
  await ev(`document.querySelector('#ob-help-panel section[data-section=mouse]'
    + ' .ob-help__disclose').scrollIntoView({ block: 'center' }); true`);
  await sleep(300);
  const head = await ev(
    `window.__tp.el('section[data-section=mouse] .ob-help__disclose')`);
  check('S15 collapsed section header on-screen after scroll',
    head.found && head.visible, JSON.stringify(head));
  if (head.found && head.visible) {
    await tap(client, Math.round(head.cx), Math.round(head.cy));
    await sleep(400);
    check('S15 tap expands the collapsed mouse section',
      await ev(`(() => {
        const s = document.querySelector(
          '#ob-help-panel section[data-section=mouse]');
        return s.querySelector('.ob-help__disclose')
          .getAttribute('aria-expanded') === 'true'
          && !s.querySelector('.ob-help__region').hidden;
      })()`));
  }

  // 014 touch-target conventions inside the overlay (phone walker law:
  // every interactive element >= 44pt on its interactive box)
  const targets = await ev(`(() => {
    const bad = [];
    for (const el of document.querySelectorAll(
        '#ob-help-panel button, #ob-help-panel a[href], #ob-help-panel summary,'
        + ' #ob-help-panel [role=button]')) {
      if (!el.getClientRects().length) continue;
      const r = el.getBoundingClientRect();
      if (Math.min(r.width, r.height) < 43.5) {
        bad.push((el.id || el.className || el.tagName) + ' '
          + r.width.toFixed(0) + 'x' + r.height.toFixed(0));
      }
    }
    return [...new Set(bad)].slice(0, 8);
  })()`);
  check('S15 overlay interactive elements meet the 44pt tap floor',
    targets.length === 0, targets.join('; '));

  // close via the close control (tap) — and the whole visit steered nothing
  const closeBtn = await ev(`window.__tp.el('#ob-help-close')`);
  check('S15 close control visible + tappable', closeBtn.found && closeBtn.visible,
    JSON.stringify(closeBtn));
  if (closeBtn.found && closeBtn.visible) {
    await tap(client, Math.round(closeBtn.cx), Math.round(closeBtn.cy));
    await sleep(500);
    check('S15 tap on the close control closes the overlay',
      await ev('window.__help.isOpen() === false'));
  } else {
    await ev('window.__help.close(); true');
    await sleep(400);
  }
  check('S15 overlay visit mutated nothing (phi bit-unchanged)',
    await ev('(window.__aim?.getPhi?.() ?? null) === window.__e2e.hphi'));
  check("S15 classifier back to S0", await ev("window.__touch?.state?.() === 'S0'"));
}

// 16 — tap-to-aim quick aim (issue #46, touch-input.md §8.1): a light tap
// on an OBJECT ball aims the cue from the cue ball at the tapped ball's
// center through the additive __aim.aimAtBall seam. The camera NEVER moves
// (the View pill owns view switching — asserted bit-exact in orbit view);
// cue-ball taps and empty-table taps stay strict no-ops (row-8 law). The
// OVERLAP arm proves the §8.1 cue-claim law: with the cue and an object
// ball overlapping on screen the NEAREST claimant wins — nearer the object
// ball aims, nearer the cue center stays a strict no-op (third person).
async function sc16() {
  check('S16 eight_ball active', await ensureEightBall());
  // matchState WITHOUT a phase → no nomination affordance: the tap takes
  // the quick-aim branch, not the row-6/7 nomination rows
  await scene8([{ id: 0, x: 0, y: -0.4 }, { id: 2, x: POT.x, y: POT.y },
    { id: 8, x: 0.5, y: -0.8 }, ...FAR], { shooter: 1, breaker: 1 });
  check('S16 scene parked in AIM', await ev('__test.state()') === 'AIM');
  check('S16 no nomination on the shaped scene',
    await ev('window.__aim.nominationRequired()') === false);
  if (await ev('window.__aim?.getAimView?.() === true')) {
    await ev('window.__aim.setAimView(false)');
    await sleep(400);
  }

  // wrapped |cue→ball-2 azimuth − phi| over the SAME three-frame centers
  // the module reads — computed page-side, so doubles never cross the
  // JSON boundary (bit-exact convention)
  const errNow = () => ev(`(() => {
    const balls = window.__test.balls();
    const c = balls.find((b) => b.id === 0);
    const t = balls.find((b) => b.id === 2);
    let d = (Math.atan2(t.pos[0] - c.pos[0], t.pos[2] - c.pos[2])
      - window.__aim.getPhi()) % (2 * Math.PI);
    if (d > Math.PI) d -= 2 * Math.PI;
    if (d < -Math.PI) d += 2 * Math.PI;
    return Math.abs(d);
  })()`);

  // park the aim provably OFF the ball line (bounded fast S2 drags)
  let parked = await errNow();
  for (let i = 0; i < 3 && parked <= 1e-3; i++) {
    await drag(client, { x: W * 0.30, y: H * 0.5 }, { x: W * 0.55, y: H * 0.5 },
      { steps: 10, stepMs: 8 });
    await sleep(150);
    parked = await errNow();
  }
  check('S16 pre-tap aim parked off the ball line', parked > 1e-3,
    `err=${parked}`);

  const b2 = await ev('window.__tp.ballScreen(2)');
  check('S16 object ball projectable', b2.found, JSON.stringify(b2));
  if (!b2.found) return;
  await ev('window.__e2e.cam = JSON.stringify(window.__tp.camPose()); true');
  await tap(client, b2.x, b2.y);
  await sleep(300);
  check('S16 tap aims the cue at the ball center (wrapped err ≤ 1e-9)',
    await errNow() <= 1e-9, `err=${await errNow()}`);
  check('S16 camera pose bit-unchanged by the tap (View pill owns the camera)',
    await ev('JSON.stringify(window.__tp.camPose()) === window.__e2e.cam'));
  check("S16 classifier back to S0", await ev("window.__touch?.state?.() === 'S0'"));

  // cue-ball tap: quick-aim never targets ball 0 (strict no-op)
  const cueS = await ev('window.__tp.ballScreen(0)');
  check('S16 cue ball projectable', cueS.found, JSON.stringify(cueS));
  if (cueS.found) {
    await ev('window.__e2e.p0 = window.__aim.getPhi(); true');
    await tap(client, cueS.x, cueS.y);
    await sleep(250);
    check('S16 cue-ball tap is a strict no-op (phi bit-unchanged)',
      await ev('window.__aim.getPhi() === window.__e2e.p0'));
  }

  // empty-table tap right after: the row-8 neutral-tap law is preserved
  const empty = await ev('window.__tp.projectK(-0.4, 0.55)');
  check('S16 empty table point projectable', !!empty, JSON.stringify(empty));
  if (empty) {
    await ev('window.__e2e.p0 = window.__aim.getPhi(); '
      + 'window.__e2e.cam = JSON.stringify(window.__tp.camPose()); true');
    await tap(client, empty.x, empty.y);
    await sleep(250);
    check('S16 empty tap stays bit-neutral (phi + camera)',
      await ev('window.__aim.getPhi() === window.__e2e.p0'
        + ' && JSON.stringify(window.__tp.camPose()) === window.__e2e.cam'));
    check("S16 classifier back to S0 after the empty tap",
      await ev("window.__touch?.state?.() === 'S0'"));
  }

  // OVERLAP arm (touch-input.md §8.1 cue-claim law, review amendment): cue
  // and an object ball overlapping on screen — the cue competes in the
  // nearest-hit loop as a NO-OP claimant, never an absolute pre-empt. A tap
  // NEARER the object ball's center aims at it (the pre-empt deadened
  // exactly this tap); a tap nearer the cue center stays a strict no-op.
  // Ball 3 sits 2.2R from the cue, so both 22pt zone floors cover every
  // point of the short center-center segment (preconditions asserted below
  // — the arm can never pass vacuously).
  await scene8([{ id: 0, x: 0, y: -0.4 }, { id: 3, x: 0.0629, y: -0.4 },
    { id: 8, x: 0.5, y: -0.8 }, ...FAR], { shooter: 1, breaker: 1 });
  check('S16 overlap: scene parked in AIM', await ev('__test.state()') === 'AIM');
  const errTo3 = () => ev(`(() => {
    const balls = window.__test.balls();
    const c = balls.find((b) => b.id === 0);
    const t = balls.find((b) => b.id === 3);
    let d = (Math.atan2(t.pos[0] - c.pos[0], t.pos[2] - c.pos[2])
      - window.__aim.getPhi()) % (2 * Math.PI);
    if (d > Math.PI) d -= 2 * Math.PI;
    if (d < -Math.PI) d += 2 * Math.PI;
    return Math.abs(d);
  })()`);
  const park3 = async (tag) => {
    let parked3 = await errTo3();
    for (let i = 0; i < 3 && parked3 <= 1e-3; i++) {
      await drag(client, { x: W * 0.30, y: H * 0.5 }, { x: W * 0.55, y: H * 0.5 },
        { steps: 10, stepMs: 8 });
      await sleep(150);
      parked3 = await errTo3();
    }
    check(`S16 overlap: aim parked off the ball-3 line ${tag}`,
      parked3 > 1e-3, `err=${parked3}`);
  };
  await park3('(pre-tap)');
  const c0 = await ev('window.__tp.ballScreen(0)');
  const b3 = await ev('window.__tp.ballScreen(3)');
  check('S16 overlap: cue + ball 3 projectable', c0.found && b3.found,
    JSON.stringify({ c0, b3 }));
  if (!c0.found || !b3.found) return;
  // tap 1 at 70% of the way cue → ball 3: inside BOTH zone floors (the
  // real zones are max(projected 1.05R, 22pt) ≥ the 22pt floor asserted
  // here), strictly nearer ball 3 — the cue overlap must NOT deaden it
  const p1 = { x: c0.x + 0.7 * (b3.x - c0.x), y: c0.y + 0.7 * (b3.y - c0.y) };
  const d1c = Math.hypot(p1.x - c0.x, p1.y - c0.y);
  const d1b = Math.hypot(p1.x - b3.x, p1.y - b3.y);
  check('S16 overlap: tap 1 inside both 22pt zone floors, nearer ball 3',
    d1b < d1c && d1c <= 22 && d1b <= 22,
    `dCue=${d1c.toFixed(1)} dBall=${d1b.toFixed(1)}`);
  await ev('window.__e2e.cam = JSON.stringify(window.__tp.camPose()); true');
  await tap(client, p1.x, p1.y);
  await sleep(300);
  check('S16 overlap: tap nearer the object ball aims at it (wrapped err ≤ 1e-9)',
    await errTo3() <= 1e-9, `err=${await errTo3()}`);
  check('S16 overlap: camera pose bit-unchanged by the tap',
    await ev('JSON.stringify(window.__tp.camPose()) === window.__e2e.cam'));
  // tap 2 at 25% of the way: still inside ball 3's zone but the CUE is the
  // nearest claimant → strict no-op. Re-park first (tap 1 left phi ON the
  // ball-3 line, so a broken no-op that re-aims at ball 3 would otherwise
  // pass vacuously).
  await park3('(re-park before the cue-claim tap)');
  const p2 = { x: c0.x + 0.25 * (b3.x - c0.x), y: c0.y + 0.25 * (b3.y - c0.y) };
  await ev('window.__e2e.p0 = window.__aim.getPhi(); true');
  await tap(client, p2.x, p2.y);
  await sleep(250);
  check('S16 overlap: tap nearer the cue center stays a strict no-op '
    + '(phi bit-unchanged)',
    await ev('window.__aim.getPhi() === window.__e2e.p0'));
  check("S16 overlap: classifier back to S0",
    await ev("window.__touch?.state?.() === 'S0'"));
}

// 20 — transient banner tap-to-dismiss + never-block (issue #71): the foul
// banner is PASSIVE CHROME. (a) never-block: with the banner up, the FIRE
// pill stays enabled (no state gate rides the banner timer) and a hit-test
// inside the banner box lands on the CANVAS beneath (pointer-events: none —
// pre-#71 red: the strip returned itself and ate any finger in its band,
// the sc18 forensics). (b) tap-to-dismiss THROUGH the neutral-tap law: a
// finger tap inside the band dismisses the banner (~120 ms motion.exit)
// while the SAME tap classifies normally on the canvas — here an
// empty-table tap, so phi stays bit-unchanged and the classifier drains to
// S0 with zero tracked pointers (the sc2 law is preserved through a
// dismissal; the dismiss listener is capture-phase + passive and never
// touches the S-state machine). CANVAS TAPS: runs in the tap group right
// after row 16, before rows 5/6 (registry ORDERING LAW). Scene shaping is
// scripted (__test/__rules seams — e2e-rules stage-1 wrong-first-ball on
// nine_ball: no nomination surfaces, so the band tap has no claimants).
async function sc20() {
  const nine = await ev(`window.__rules?.setGame?.('nine_ball')`);
  await sleep(500);
  check('S20 nine_ball active', nine === true
    || await ev(`window.__rules?.game?.()`) === 'nine_ball');
  await ev(`__test.layout([
    { id: 0, x: 0, y: -0.4 }, { id: 2, x: 0, y: 0.2 },
    { id: 1, x: -0.5, y: -1.0 }, { id: 9, x: 0.55, y: -0.9 }])`);
  await sleep(300);
  check('S20 foul shot accepted',
    !(await ev('__test.shoot({ v0: 2.0, phi: Math.PI / 2, theta: 0, a: 0, b: 0 })')));
  const s20 = await settleScripted('S20 foul');
  check('S20 wrong-first-ball parked in BALL_IN_HAND', s20 === 'BALL_IN_HAND', s20);
  // one combined read right after settle: the 1800 ms foul timer is live,
  // so the pre-tap truth is latched in a single roundtrip (loud fail —
  // never a vacuous pass — if a load-skewed run let the timer win)
  const pre20 = await ev(`(() => {
    const b = document.getElementById('banner');
    const r = b.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const hit = document.elementFromPoint(cx, cy);
    window.__e2e.p0 = window.__aim?.getPhi?.() ?? null;
    const balls = (window.__test.balls() ?? []).filter((x) => !x.pocketed)
      .map((x) => window.__tp.ballScreen(x.id))
      .filter((s) => s.found)
      .map((s) => Math.hypot(s.x - cx, s.y - cy));
    return { display: b.style.display, cx, cy,
      hit: hit ? hit.tagName + ':' + (hit.id || '') : null,
      fireDisabled: document.getElementById('shoot').disabled,
      nearestBallPx: balls.length ? Math.min(...balls) : Infinity };
  })()`);
  check('S20 foul banner up before the tap', pre20.display === 'block',
    JSON.stringify(pre20));
  check('S20 never-block: FIRE enabled while the foul banner shows',
    pre20.fireDisabled === false);
  check('S20 never-block: banner-band hit-test returns the canvas',
    pre20.hit === 'CANVAS:', `hit=${pre20.hit}`);
  // non-vacuous neutrality precondition: no quick-aim/grab claimant near
  // the band tap point (a ball inside a 40 px disc could legally aim/place)
  check('S20 band tap point clear of every ball (>40 px)',
    pre20.nearestBallPx > 40, `nearest=${pre20.nearestBallPx}`);
  await tap(client, pre20.cx, pre20.cy);
  let gone20 = false;
  for (let i = 0; i < 10 && !gone20; i++) { // poll past the 120 ms exit fade
    await sleep(100);
    gone20 = await ev(`document.getElementById('banner').style.display === 'none'`);
  }
  check('S20 band tap dismissed the foul banner', gone20 === true);
  check('S20 same tap stayed neutral (phi bit-unchanged)',
    await ev('(window.__aim?.getPhi?.() ?? null) === window.__e2e.p0'
      + ' && window.__e2e.p0 !== null'));
  check("S20 classifier drains to S0",
    await ev("window.__touch?.state?.() === 'S0'"));
  check('S20 no tracked pointers after the tap',
    await ev('window.__touch?.pointers?.() === 0'));
  // scene hygiene for the drag scenarios that follow (fresh aiming table —
  // GH-370: the fresh rack grants the opening BALL_IN_HAND)
  await ev('__test.rerack(1)');
  await sleep(400);
  check('S20 rerack restored an aiming state',
    await ev("['AIM','BALL_IN_HAND'].includes(__test.state())"),
    String(await ev('__test.state()')));
}

// 17 — long-press selection defense (issue #60): chrome must never start a
// text selection (loupe/highlight) on touch. Asserts the COMPUTED styles
// from the touch.css #60 doubly-gated block on representative chrome nodes;
// -webkit-touch-callout is not readable via getComputedStyle on this Chrome
// build, so the same rule's -webkit-user-select member is the CSS custom
// check (one declaration block — one member computing proves the rule
// applied). tap-highlight transparency is asserted ONLY where the #49
// :active pressed ladder provides replacement feedback (.ob-btn / toolbar
// pills); touch-action manipulation only on matrix-uncovered controls (the
// renderer canvas must KEEP `none` — the §4 defense matrix outranks the
// #60 blanket by specificity). DOM reads only — no canvas taps, so this
// row is immune to the registry ORDERING LAW and runs last.
async function sc17() {
  // drawer rows mount on a short post-boot retry (touchwidgets
  // settingsActions) — bounded poll before the row probe
  let rowReady = false;
  for (let i = 0; i < 30 && !rowReady; i++) {
    rowReady = await ev(`!!document.querySelector('#ob-touch-drawer-rows .ob-btn')`);
    if (!rowReady) await sleep(250);
  }
  check('S17 drawer rows mounted (bounded poll)', rowReady === true);

  const probe = (expr) => ev(`(() => {
    const el = ${expr};
    if (!el) return { found: false };
    const cs = getComputedStyle(el);
    return { found: true, us: cs.webkitUserSelect,
      tap: cs.webkitTapHighlightColor
        ?? cs.getPropertyValue('-webkit-tap-highlight-color'),
      ta: cs.touchAction };
  })()`);
  const TRANSPARENT = new Set(['rgba(0, 0, 0, 0)', 'transparent']);
  const cases = [
    ['toolbar pill #ob-gear', `document.getElementById('ob-gear')`,
      { tap: true, ta: 'manipulation' }],
    ['HUD panel #hud', `document.getElementById('hud')`, {}],
    ['FIRE pill #shoot', `document.getElementById('shoot')`,
      { tap: true, ta: 'manipulation' }],
    ['drawer row (.ob-btn.ob-touch-row)',
      `document.querySelector('#ob-touch-drawer-rows .ob-btn')`,
      { tap: true, ta: 'manipulation' }],
    ['dialog button #ob-spin-done (kit dialog card)',
      `document.getElementById('ob-spin-done')`,
      { tap: true, ta: 'manipulation' }],
    ['renderer canvas (long-press callout region)',
      `document.querySelector('body > canvas')`, { ta: 'none' }],
  ];
  for (const [name, expr, want] of cases) {
    const r = await probe(expr);
    check(`S17 ${name} present`, r.found === true, expr);
    if (!r.found) continue;
    check(`S17 ${name} computes user-select: none (#60 defense)`,
      r.us === 'none', `webkitUserSelect=${r.us}`);
    if (want.tap) {
      check(`S17 ${name} tap-highlight transparent (#49 pressed ladder present)`,
        TRANSPARENT.has(r.tap), `tapHighlight=${r.tap}`);
    }
    if (want.ta) {
      check(`S17 ${name} touch-action ${want.ta}`,
        r.ta === want.ta, `touchAction=${r.ta}`);
    }
  }
}

// 18 — camera during motion (issue #69): the S4 camera rows work in EVERY
// machine state. Legs: (a) two-finger orbit DURING a live (unpaused)
// PLAYBACK moves the rig at the frozen gesture arithmetic and the machine
// keeps playing; (b) three-finger pan mid-PLAYBACK translates the clamped
// orbit target; (c) a gesture STARTED in AIM survives the
// AIM→SIMULATING→PLAYBACK transition (the #69 scoped stateChange reset —
// red pre-fix: the old unconditional hardReset killed it and the
// post-transition moves wrote nothing); (d) aim view engaged through a
// shot: the flag persists into PLAYBACK (#56 chase paused) and the first
// camera move disengages IN PLACE (pose-continuity asserts — the breakout
// law during motion; the View pill's 150 ms seam poll follows); (e) the
// in-app replay's PLAYBACK (game.replay → {replay:true}) is camera-live
// and re-simulates nothing (scenario log unchanged). Player camera input
// is synthesized touch; shots are scene-scripted via __test.shoot (the
// flow-chain FIRE path is sc8/sc12's subject) and __test.pause pins a
// deterministic PLAYBACK window for the precision asserts under machine
// load. NO canvas taps here (multi-finger + DOM/eval only), so the
// scenario is ordering-law safe after rows 5/6 and MUST run before the
// row-13 renavigation. Gesture rows sit at y ≥ 0.42H, below the transient
// foul banner band (#banner, top 18%, ~63 px tall, 1800 ms timer): when
// this scenario was written the strip ate any finger landing in its band
// (DOM-stays-live law — probed 2026-07-21); since issue #71 the strip is
// pointer-transparent + tap-to-dismiss (scenario 19 pins that truth), and
// these rows simply keep their proven geometry.
async function sc18() {
  check('S18 eight_ball active', await ensureEightBall());
  const SHOT = '__test.shoot({ v0: 6, phi: Math.PI / 2 + 0.4, theta: 0, a: 0, b: 0 })';
  const park = async () => {
    await scene8([{ id: 0, x: 0, y: -0.6 }, { id: 3, x: 0.5, y: 0.9 },
      { id: 8, x: -0.5, y: 0.9 }, ...FAR],
    { phase: 'grouped', groups: { 1: 'solids', 2: 'stripes' }, shooter: 1, breaker: 1 });
    await ev('window.__rules?.call?.(3, 0)'); // stage the call (fire gate)
    if (await ev('window.__aim?.getAimView?.() === true')) {
      await ev('window.__aim.setAimView(false)');
    }
    await ev(`window.__test.setCamera('default'); true`);
    await sleep(300);
  };
  const waitPlayback = async () => {
    for (let i = 0; i < 50; i++) {
      if (await ev(`__test.state() === 'PLAYBACK'`)) return true;
      await sleep(60);
    }
    return false;
  };
  const settleLeg = async (tag) => {
    await ev('__test.pause(false); true');
    const s = await settleScripted(tag);
    check(`${tag} settles out of PLAYBACK`, s !== 'PLAYBACK' && s !== 'SIMULATING', s);
    if (await ev('window.__rules?.matchState?.()?.pendingDecision != null')) {
      await ev('window.__rules.decide(1)');
      await sleep(400);
    }
  };
  const wrapTheta = (a, b) => Math.abs(((b - a + Math.PI) % (2 * Math.PI)
    + 2 * Math.PI) % (2 * Math.PI) - Math.PI);
  await park();
  const scen0 = await ev('window.__test.scenarios().length');

  // (a) two-finger orbit during LIVE (unpaused) playback
  check('S18(a) motion shot accepted', !(await ev(SHOT)));
  check('S18(a) machine in PLAYBACK', await waitPlayback());
  const o0 = await ev('window.__tp.orbit()');
  const DX = 80;
  await twoFingerGesture(client,
    { from: { x: W * 0.40, y: H * 0.42 }, to: { x: W * 0.40 + DX, y: H * 0.42 } },
    { from: { x: W * 0.40, y: H * 0.78 }, to: { x: W * 0.40 + DX, y: H * 0.78 } },
    { steps: 12, stepMs: 16, lift: false });
  check("S18(a) two-finger gesture classifies S4 during PLAYBACK",
    await ev("window.__touch?.state?.() === 'S4'"));
  await touchEnd(client, []);
  await sleep(200);
  const o1 = await ev('window.__tp.orbit()');
  const dThA = wrapTheta(o0.theta, o1.theta);
  check(`S18(a) mid-motion orbit moved theta ≈ ${DX}·${ORBIT_GAIN} rad`,
    dThA >= DX * ORBIT_GAIN * 0.6 && dThA <= DX * ORBIT_GAIN * 1.4,
    `dtheta=${dThA.toFixed(4)} expected≈${(DX * ORBIT_GAIN).toFixed(4)}`);
  check('S18(a) machine still PLAYBACK after the orbit (state uncorrupted)',
    await ev(`__test.state()`) === 'PLAYBACK');

  // (b) three-finger pan mid-PLAYBACK (paused window: deterministic reads)
  await ev('__test.pause(true); true');
  const p0 = await ev('window.__tp.orbit()');
  await threeFingerGesture(client,
    { from: { x: W * 0.30, y: H * 0.42 }, to: { x: W * 0.52, y: H * 0.42 } },
    { from: { x: W * 0.45, y: H * 0.55 }, to: { x: W * 0.67, y: H * 0.55 } },
    { from: { x: W * 0.30, y: H * 0.68 }, to: { x: W * 0.52, y: H * 0.68 } },
    { steps: 12, stepMs: 16 });
  await sleep(200);
  const p1 = await ev('window.__tp.orbit()');
  const panD = Math.hypot(p1.target[0] - p0.target[0], p1.target[2] - p0.target[2]);
  check('S18(b) mid-motion three-finger pan moved the orbit target',
    panD > 0.03, `target moved ${panD.toFixed(4)} m`);
  check('S18(b) pan kept the radius (no pinch bleed)',
    Math.abs(p1.radius / p0.radius - 1) < 0.03,
    `r ${p0.radius.toFixed(3)} → ${p1.radius.toFixed(3)}`);
  check("S18(b) classifier drains to S0",
    await ev("window.__touch?.state?.() === 'S0'"));
  check('S18(b) machine still PLAYBACK', await ev(`__test.state()`) === 'PLAYBACK');
  await settleLeg('S18 shot A');

  // (c) gesture straddles AIM→SIMULATING→PLAYBACK (scoped stateChange reset)
  await park();
  await twoFingerGesture(client,
    { from: { x: W * 0.38, y: H * 0.42 }, to: { x: W * 0.44, y: H * 0.42 } },
    { from: { x: W * 0.38, y: H * 0.78 }, to: { x: W * 0.44, y: H * 0.78 } },
    { steps: 6, stepMs: 16, lift: false });
  check("S18(c) straddle gesture live in AIM (S4)",
    await ev("window.__touch?.state?.() === 'S4'"));
  check('S18(c) straddle shot accepted mid-gesture', !(await ev(SHOT)));
  check('S18(c) machine reached PLAYBACK', await waitPlayback());
  check("S18(c) gesture SURVIVED the transition (still S4, fingers tracked)",
    await ev("window.__touch?.state?.() === 'S4' && window.__touch?.pointers?.() === 2"));
  await ev('__test.pause(true); '
    + 'window.__e2e.p0 = window.__aim.getPhi(); true');
  const os0 = await ev('window.__tp.orbit()');
  for (let i = 1; i <= 10; i++) {
    await touchMove(client, [
      { x: W * 0.44 + i * 8, y: H * 0.42, id: 1 },
      { x: W * 0.44 + i * 8, y: H * 0.78, id: 2 }]);
    await sleep(16);
  }
  await touchEnd(client, []);
  await sleep(200);
  const os1 = await ev('window.__tp.orbit()');
  const dThC = wrapTheta(os0.theta, os1.theta);
  check('S18(c) post-transition moves kept orbiting (theta ≈ 80·GAIN)',
    dThC >= 80 * ORBIT_GAIN * 0.5 && dThC <= 80 * ORBIT_GAIN * 1.5,
    `dtheta=${dThC.toFixed(4)} expected≈${(80 * ORBIT_GAIN).toFixed(4)}`);
  check('S18(c) camera gesture never steered the aim (phi bit-unchanged)',
    await ev('window.__aim.getPhi() === window.__e2e.p0'));
  await settleLeg('S18 straddle');

  // (d) aim view engaged through the shot: mid-motion breakout IN PLACE
  await park();
  await ev('window.__aim.setAimView(true)');
  {
    // bounded glide-settle (sc6 differential convention)
    let prev = await ev('window.__tp.camPose()');
    let stable = false;
    for (let i = 0; i < 30 && !stable; i++) {
      await sleep(200);
      const cur = await ev('window.__tp.camPose()');
      stable = !!prev && !!cur
        && Math.max(...cur.map((v, k) => Math.abs(v - prev[k]))) < 1e-6;
      prev = cur;
    }
  }
  check('S18(d) aim-view shot accepted', !(await ev(SHOT)));
  check('S18(d) machine reached PLAYBACK', await waitPlayback());
  await ev('__test.pause(true); true');
  check('S18(d) aim-view flag persists into PLAYBACK (#56 chase paused)',
    await ev('window.__aim.getAimView() === true'));
  const ov0 = await ev('window.__tp.orbit()');
  const DXD = 60;
  const STEPSD = 12;
  await twoFingerGesture(client,
    { from: { x: W * 0.38, y: H * 0.42 }, to: { x: W * 0.38 + DXD, y: H * 0.42 } },
    { from: { x: W * 0.38, y: H * 0.78 }, to: { x: W * 0.38 + DXD, y: H * 0.78 } },
    { steps: STEPSD, stepMs: 16 });
  await sleep(200);
  check('S18(d) mid-motion camera gesture disengages the aim view in place',
    await ev('window.__aim.getAimView() === false'));
  const ov1 = await ev('window.__tp.orbit()');
  const dThD = wrapTheta(ov0.theta, ov1.theta);
  const expD = DXD * (1 - 1 / STEPSD) * ORBIT_GAIN;
  check('S18(d) breakout continues as orbit from the CURRENT pose',
    dThD >= expD * 0.5 && dThD <= DXD * ORBIT_GAIN * 1.4,
    `dtheta=${dThD.toFixed(4)} expected≈${expD.toFixed(4)}`);
  check('S18(d) no radius snap (pose continuity)',
    Math.abs(ov1.radius / ov0.radius - 1) < 0.05,
    `r ${ov0.radius.toFixed(3)} → ${ov1.radius.toFixed(3)}`);
  const tJumpD = !ov0.target || !ov1.target ? Infinity
    : Math.hypot(ov1.target[0] - ov0.target[0], ov1.target[2] - ov0.target[2]);
  check('S18(d) orbit target stays at the aim look point (no jump)',
    tJumpD < 0.05, `target moved ${tJumpD}`);
  let pillOff18 = false;
  for (let i = 0; i < 8 && !pillOff18; i++) {
    await sleep(150);
    pillOff18 = await ev(`document.getElementById('ob-view-btn')`
      + `?.getAttribute('aria-pressed') === 'false'`);
  }
  check('S18(d) View pill clears on the mid-motion breakout', pillOff18 === true);
  await settleLeg('S18 aim-view shot');

  // (e) in-app replay playback is camera-live (PLAYBACK {replay:true})
  await ev(`document.getElementById('replay')?.click(); true`);
  check('S18(e) replay re-entered PLAYBACK', await waitPlayback());
  await ev('__test.pause(true); true');
  const r0 = await ev('window.__tp.orbit()');
  const DXR = 70;
  await twoFingerGesture(client,
    { from: { x: W * 0.40, y: H * 0.42 }, to: { x: W * 0.40 + DXR, y: H * 0.42 } },
    { from: { x: W * 0.40, y: H * 0.78 }, to: { x: W * 0.40 + DXR, y: H * 0.78 } },
    { steps: 12, stepMs: 16 });
  await sleep(200);
  const r1 = await ev('window.__tp.orbit()');
  const dThR = wrapTheta(r0.theta, r1.theta);
  check('S18(e) orbit live during replay playback',
    dThR >= DXR * ORBIT_GAIN * 0.5 && dThR <= DXR * ORBIT_GAIN * 1.4,
    `dtheta=${dThR.toFixed(4)}`);
  await settleLeg('S18 replay');
  check('S18 exactly three shots simulated (replay re-simulated nothing)',
    await ev('window.__test.scenarios().length') === scen0 + 3,
    `scenarios ${scen0} → ${await ev('window.__test.scenarios().length')}`);
  check("S18 classifier parked in S0",
    await ev("window.__touch?.state?.() === 'S0'"));
  // camera hygiene for the later scenarios (single-pose convention)
  await ev(`window.__test.setCamera('default'); true`);
  await sleep(300);
}

// 19 — in-gesture power precision (issue #70; phone-hud.md §3.5 amendment,
// touch-e2e.md §3.1 row 19): the gauge drag gears its per-move sensitivity
// by the finger's horizontal distance off the rail centerline —
// gear = GEAR_MIN 0.1 + 0.9·(1 − smoothstep(OFF_AXIS_LO 60, OFF_AXIS_HI
// 320 px)) — over an UNQUANTIZED accumulator seeded absolutely on
// pointerdown. Legs: (a) quantified gearing — the SAME vertical travel
// produces a strictly finer |Δ#power| off-axis (ratio pinned ≤ 0.25, and
// non-zero: the accumulator must not round the geared deltas away, plus a
// pure horizontal out-leg writes nothing); (b) anchor-rebase continuity —
// a pure horizontal return toward the rail changes NOTHING (an absolute
// re-map would snap the value to the finger's rail position) and the next
// on-axis move resumes at full speed from the same anchor; (c) readout
// promotion — the m/s readout's computed font-size grows while the
// gesture is live and reverts on release; (d) haptic tick producer law —
// a post-boot mock obHaptics bridge collects wire-legal 'click' ticks
// from gauge gestures, and a scripted #power write (the desktop-chain
// 'input' mirror) posts ZERO (e2e-haptics --seam's zero-before-shot law
// depends on it; haptics.js itself stays un-imported — its seam gates at
// boot); (e) hygiene — nothing fires, and a plain on-axis rail drag still
// saturates at the EXACT 0.5/12 endpoints (S7's monotone
// absolute-equivalence law); (f) pointer ownership (review finding on
// #70) — a second synthetic pointer landing on the gauge mid-drag never
// reseeds the accumulator (an unowned reseed would slam the value to the
// intruder's rail position), the intruder's moves never integrate, and
// the owner's gesture SURVIVES the intruder's up (still live, still
// integrating at full speed). Element-scoped gauge gestures only — NO
// canvas taps — so the scenario is ordering-law safe after rows 5/6 and
// MUST run before the row-13 renavigation.
async function sc19() {
  check('S19 eight_ball active', await ensureEightBall());
  await scene8([{ id: 0, x: 0, y: 0 }, { id: 3, x: 0.45, y: 0.9 },
    { id: 8, x: 0.5, y: -0.8 }, ...FAR],
  { phase: 'grouped', groups: { 1: 'solids', 2: 'stripes' }, shooter: 1, breaker: 1 });
  check('S19 scene parked in AIM', await ev('__test.state()') === 'AIM');
  const shots0 = await shotsLogged();
  const g = await ev('window.__tp.findGauge()');
  check('S19 power gauge present', g.found, JSON.stringify(g));
  if (!g.found) return;
  // #142: this scenario's yFor/expOn pins are OPEN-LOOP LINEAR math — pin
  // the linear response for the whole scenario (the #70 gear law under
  // test is mode-independent: it multiplies the x-accumulator's step; S22
  // carries the perceptual-mode twin). persist:false = no localStorage
  // write (scripted boots carry no ambient state — the #14 hermeticity
  // doctrine); the shipped perceptual default is restored at the end.
  await ev(`window.__settings.set('powerResponse', 'linear',`
    + ` { persist: false }); true`);
  const read = () => ev(`Number(document.getElementById('power').value)`);
  // rail geometry under the frozen constants (GAUGE_PAD_PX = 10)
  const top = g.y + GAUGE_PAD;
  const bot = g.y + g.h - GAUGE_PAD;
  const rail = bot - top;
  const yFor = (v) => bot - (v - 0.5) / 11.5 * rail;
  const DY = Math.round(rail * 0.45); // per-leg vertical travel (~5.2 m/s on-axis)

  // mock tick collector — post-boot on purpose: touchwidgets feature-
  // detects the bridge at CALL time (module-private postTick), while
  // haptics.js's own main.js seam gated on the bridge at BOOT (absent
  // then), so the module under 016 test never loads here.
  await ev(`(() => {
    window.__e2e.ticks = [];
    const wk = window.webkit ?? (window.webkit = {});
    const mh = wk.messageHandlers ?? (wk.messageHandlers = {});
    mh.obHaptics = { postMessage: (m) =>
      window.__e2e.ticks.push(JSON.parse(JSON.stringify(m))) };
    return true;
  })()`);

  // (a) on-axis reference leg: park at 3.0, drag straight up DY px
  const park = async (tag) => {
    const r = await gaugeTo(3);
    check(`S19 gauge parked at 3.0 ${tag}`, r.ok === true, JSON.stringify(r));
  };
  await park('(on-axis leg)');
  const y3 = yFor(3);
  await touchStart(client, [{ x: g.cx, y: y3 }]);
  await sleep(60);
  for (let i = 1; i <= 10; i++) {
    await touchMove(client, [{ x: g.cx, y: y3 - DY * i / 10 }]);
    await sleep(16);
  }
  await touchEnd(client, []);
  await sleep(200);
  const expOn = DY * 11.5 / rail;
  const dOn = (await read()) - 3;
  check(`S19(a) on-axis drag runs at full speed (Δ ≈ ${expOn.toFixed(1)} m/s)`,
    dOn >= expOn * 0.8 && dOn <= expOn * 1.2, `Δon=${dOn.toFixed(1)}`);

  // (a) off-axis leg: L-shaped path — horizontal out beyond OFF_AXIS_HI
  // (dy = 0 → the value must not move), then the IDENTICAL vertical travel
  await park('(off-axis leg)');
  const AX = g.cx + OFF_AXIS_HI + 60;
  await touchStart(client, [{ x: g.cx, y: y3 }]);
  await sleep(60);
  for (let i = 1; i <= 8; i++) {
    await touchMove(client, [{ x: g.cx + (AX - g.cx) * i / 8, y: y3 }]);
    await sleep(16);
  }
  await sleep(100);
  check('S19(a) pure horizontal out-leg writes nothing (v stays 3.0)',
    await read() === 3, `v=${await read()}`);
  for (let i = 1; i <= 10; i++) {
    await touchMove(client, [{ x: AX, y: y3 - DY * i / 10 }]);
    await sleep(16);
  }
  await sleep(100);
  const vOff = await read();
  const dOff = vOff - 3;
  check('S19(a) off-axis drag is strictly finer (ratio ≤ 0.25 of on-axis)',
    dOff > 0 && dOff <= dOn * 0.25,
    `Δon=${dOn.toFixed(1)} Δoff=${dOff.toFixed(1)}`);
  check('S19(a) geared deltas survive the 0.1 quantization (Δoff ≥ 0.2)',
    dOff >= 0.2, `Δoff=${dOff.toFixed(1)}`);

  // (b) anchor-rebase continuity: finger still down — pure horizontal
  // return toward the rail must change NOTHING…
  for (let i = 1; i <= 8; i++) {
    await touchMove(client, [{ x: AX - (AX - g.cx) * i / 8, y: y3 - DY }]);
    await sleep(16);
  }
  await sleep(100);
  check('S19(b) horizontal return toward the rail never jumps (v unchanged)',
    await read() === vOff, `v=${await read()} expected=${vOff}`);
  // …and the next on-axis move resumes at FULL speed from the same anchor
  await touchMove(client, [{ x: g.cx, y: y3 - DY - 20 }]);
  await sleep(80);
  const expResume = 20 * 11.5 / rail;
  const dResume = (await read()) - vOff;
  check('S19(b) post-return on-axis move resumes at full speed',
    Math.abs(dResume - expResume) <= 0.25,
    `Δ=${dResume.toFixed(2)} expected≈${expResume.toFixed(2)}`);
  await touchEnd(client, []);
  await sleep(150);

  // (c) readout promotion: computed font-size grows while the gesture is
  // live and reverts on release
  const readoutProbe = () => ev(`(() => {
    const el = document.querySelector(
      '#ob-power-gauge .ob-touchw-gauge-readout');
    if (!el) return { found: false };
    return { found: true,
      visible: el.getClientRects().length > 0
        && getComputedStyle(el).visibility !== 'hidden',
      fs: parseFloat(getComputedStyle(el).fontSize) };
  })()`);
  const r0 = await readoutProbe();
  check('S19(c) readout present + visible at rest',
    r0.found === true && r0.visible === true, JSON.stringify(r0));
  await touchStart(client, [{ x: g.cx, y: yFor(await read()) }]);
  await sleep(150);
  const r1 = await readoutProbe();
  check('S19(c) readout promoted during the gesture (visible, font grows)',
    r1.found && r1.visible && r0.found && r1.fs > r0.fs * 1.25,
    `rest=${r0.fs}px live=${r1.fs}px`);
  await touchEnd(client, []);
  await sleep(150);
  const r2 = await readoutProbe();
  check('S19(c) promotion reverts on release',
    r2.found && r0.found && Math.abs(r2.fs - r0.fs) < 0.5,
    `rest=${r0.fs}px after=${r2.fs}px`);

  // (d) tick producer law: gauge gestures posted wire-legal 'click' ticks…
  const ticks0 = await ev('window.__e2e.ticks.length');
  check('S19(d) gauge gestures posted wire-legal click ticks',
    ticks0 > 0 && await ev(`window.__e2e.ticks.every((m) =>
      m.v === 1 && m.type === 'click'
      && Number.isFinite(m.gain) && m.gain >= 0 && m.gain <= 1)`) === true,
    `ticks=${ticks0}`);
  // …and a scripted desktop-chain write (the #power 'input' mirror) posts
  // ZERO — the e2e-haptics --seam zero-before-shot law depends on it
  await ev(`(() => {
    const p = document.getElementById('power');
    p.value = '7.3';
    p.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  await sleep(120);
  check('S19(d) scripted #power writes post ZERO ticks (mirror stays silent)',
    await ev('window.__e2e.ticks.length') === ticks0,
    `ticks ${ticks0} → ${await ev('window.__e2e.ticks.length')}`);
  await ev('delete window.webkit; true'); // drop the mock (harness hygiene)

  // (e) fire-neutrality + the absolute on-axis law still holds end to end
  check('S19(e) whole scenario fired nothing',
    ['AIM', 'BALL_IN_HAND'].includes(await ev('__test.state()'))
      && await shotsLogged() === shots0);
  await drag(client, { x: g.cx, y: bot + 4 }, { x: g.cx, y: top - 4 },
    { steps: 16, stepMs: 12 });
  await sleep(150);
  check('S19(e) full on-axis up-drag still saturates at EXACTLY 12',
    await read() === 12, `v=${await read()}`);
  await drag(client, { x: g.cx, y: top - 4 }, { x: g.cx, y: bot + 4 },
    { steps: 16, stepMs: 12 });
  await sleep(150);
  check('S19(e) full on-axis down-drag still saturates at EXACTLY 0.5',
    await read() === 0.5, `v=${await read()}`);

  // (f) pointer ownership (review finding on #70): the FIRST captured
  // pointer owns the gesture — a second finger on the gauge mid-drag is
  // captured-but-inert. Second-finger-joins touchStart (rows 5/6 grammar);
  // ordering-law safe here (before the row-13 renavigation).
  const live = () => ev(`document.getElementById('ob-power-gauge')
    .classList.contains('ob-touchw-gauge--live')`);
  await park('(ownership leg)');
  await touchStart(client, [{ x: g.cx, y: y3, id: 1 }]);
  await sleep(60);
  for (let i = 1; i <= 5; i++) {
    await touchMove(client, [{ x: g.cx, y: y3 - DY * i / 10, id: 1 }]);
    await sleep(16);
  }
  await sleep(100);
  const vOwn = await read();
  check('S19(f) owner half-leg integrates (setup sane)', vOwn > 3.5,
    `v=${vOwn}`);
  // intruder lands on the gauge at the ~10 m/s rail position: a reseed
  // would slam the value there, an unfiltered move stream would integrate
  const yIntr = yFor(10);
  await touchStart(client,
    [{ x: g.cx, y: y3 - DY / 2, id: 1 }, { x: g.cx, y: yIntr, id: 2 }]);
  await sleep(100);
  check("S19(f) intruder's down never reseeds the accumulator",
    await read() === vOwn, `v=${await read()} expected=${vOwn}`);
  for (let i = 1; i <= 6; i++) { // both ACTIVE points listed (rows 5/6 law);
    // the owner holds still (dy = 0), ONLY the intruder travels
    await touchMove(client, [{ x: g.cx, y: y3 - DY / 2, id: 1 },
      { x: g.cx, y: yIntr - 12 * i, id: 2 }]);
    await sleep(16);
  }
  await sleep(100);
  check("S19(f) intruder's moves never integrate",
    await read() === vOwn, `v=${await read()} expected=${vOwn}`);
  // intruder lifts (owner stays down): the gesture must SURVIVE…
  await touchEnd(client, [{ x: g.cx, y: y3 - DY / 2, id: 1 }]);
  await sleep(100);
  check("S19(f) gesture survives the intruder's up (still live)",
    await live() === true && await read() === vOwn,
    `live=${await live()} v=${await read()}`);
  // …and the owner keeps integrating at full on-axis speed
  await touchMove(client, [{ x: g.cx, y: y3 - DY / 2 - 30, id: 1 }]);
  await sleep(80);
  const dOwn = (await read()) - vOwn;
  const expOwn = 30 * 11.5 / rail;
  check("S19(f) owner still integrates after the intruder's up",
    Math.abs(dOwn - expOwn) <= 0.25,
    `Δ=${dOwn.toFixed(2)} expected≈${expOwn.toFixed(2)}`);
  await touchEnd(client, []);
  await sleep(150);
  check("S19(f) owner's up still ends the gesture (register drops)",
    await live() === false, `live=${await live()}`);
  check('S19(f) ownership leg fired nothing',
    ['AIM', 'BALL_IN_HAND'].includes(await ev('__test.state()'))
      && await shotsLogged() === shots0);

  // #142: restore the shipped perceptual default (see the pin above)
  await ev(`window.__settings.set('powerResponse', 'perceptual',`
    + ` { persist: false }); true`);
  check("S19 classifier untouched (the gauge is plane B — state S0)",
    await ev("window.__touch?.state?.() === 'S0'"));
}

// 22 — power-response curve (issue #142; phone-hud.md §3.5 #142 amendment)
// + perceptual release grid (issue #184; §3.5 #184 amendment): the gauge's
// travel → v0 mapping is the shared power-response curve — v = 0.5 +
// 11.5·x^γ (γ = POWER_GAMMA mirror) in the shipped perceptual default, the
// exact pre-#142 linear mapping behind the settings toggle — and the WRITE
// quantization follows the curve too: the quantV mirror's decade grid in
// perceptual mode, the frozen 0.1 byte-exact in linear.
// Legs: (a) default honesty — the profile resolves powerResponse
// 'perceptual' out of the box; (b) sampled-x exactness in BOTH modes —
// monotone on-axis drags landing at x ≈ {0.05, 0.25, 0.5, 0.75, 1.0} write
// #power == quantV(curve(x)) EXACTLY, with the expectation computed
// from the CAPTURED final pointer clientY through the mirrored formula
// (same inputs as the widget — no rounding-boundary flake) and the x = 1.0
// leg overdriven past the rail pad to pin the exact 12 endpoint (0.5 rides
// the seed clamp the same way); the linear legs double as the GH-184
// linear-mode 0.1 pin (every commit on the tenth lattice, x ≈ 0.05 covering
// the sub-2 band where the fine grid would bite); (c) fine-gear x-law under
// the perceptual curve — the #70 gear multiplies the X-step: recovering Δx
// through the inverse curve, an off-axis leg moves ≤ 0.25× the x-travel of
// the same on-axis leg (and > 0: geared steps survive the write
// quantization); (d) readout truth — the gauge readout and the HUD
// #power-val both show the TRUE resulting m/s at fmtV's honest decimals in
// both modes; (g) GH-184 release-snap — a release in the 1–2 m/s band
// commits on the FINE 0.01 grid, never the old ±0.1 snap (RED on pre-184
// builds), with two honest decimals on both readouts — its mid-gesture
// expectation reads are DELIVERY-SETTLED per GH-505 (rAF-aligned
// pointermove delivery trails the dispatch; see settleDelivered); (h) GH-184 high-v
// twin — at v≈8.8 the grid coarsens back to the 0.1 lattice and the
// readouts keep ONE decimal (no fake precision); (e) scripted-seam
// byte-identity — __test.shoot({v0}) submits v0 EXACTLY as passed while
// perceptual is active (the fire/drill seams are v-space; the curve and
// grid live only at the fraction seams); (f) hygiene — the gauge legs fire
// nothing, the mode is flipped with persist:false only (no localStorage
// writes — the #14 hermeticity doctrine) and ends on the shipped
// perceptual default.
// Element-scoped gauge gestures + one scripted fire — no canvas taps, so
// the row is ordering-law safe after 19 and before the row-13 renavigation.
async function sc22() {
  check('S22(a) fresh profile defaults to the perceptual response',
    await ev(`window.__settings?.get?.().powerResponse === 'perceptual'`));
  const g = await ev('window.__tp.findGauge()');
  check('S22 power gauge present', g.found, JSON.stringify(g));
  if (!g.found) return;
  const read = () => ev(`Number(document.getElementById('power').value)`);
  const shots0 = await shotsLogged();
  const top = g.y + GAUGE_PAD;
  const bot = g.y + g.h - GAUGE_PAD;
  const rail = bot - top;
  // page-side probe: capture the pointer clientY the WIDGET actually saw
  // (capture phase on the gauge — identical event stream), so the (b)
  // expectations run the mirrored formula on the widget's own inputs
  await ev(`(() => {
    window.__e2e = window.__e2e ?? {};
    const el = document.getElementById('ob-power-gauge');
    window.__e2e.pw = { last: null };
    const cap = (e) => { window.__e2e.pw.last = e.clientY; };
    el.addEventListener('pointerdown', cap, true);
    el.addEventListener('pointermove', cap, true);
    return true;
  })()`);
  const setMode = (m) => ev(`window.__settings.set('powerResponse',`
    + ` '${m}', { persist: false }); true`);
  /** rail fraction for the captured last clientY (gaugeFracAt, mirrored). */
  const fracAt = () => ev(`(() => {
    const r = document.getElementById('ob-power-gauge')
      .getBoundingClientRect();
    return 1 - Math.min(1, Math.max(0,
      (window.__e2e.pw.last - r.top - ${GAUGE_PAD})
        / Math.max(1, r.height - 2 * ${GAUGE_PAD})));
  })()`);
  /** expected #power for the captured final clientY under `mode` —
   * gaugeFracAt + powerCurve + the GH-184 write quantization, mirrored. */
  const expectAt = async (mode) => quantV(curveV(await fracAt(), mode), mode);
  /** GH-505: a MID-GESTURE expectation read (finger still down) must wait
   * for the DELIVERED pointer stream to catch up with the dispatched
   * position first. pointermove delivery is rAF-aligned — it can trail
   * Input.dispatchTouchEvent by a frame (measured on this host: one whole
   * move behind, with sub-second stalls under load), and a 2026-08-08 host
   * scheduling shift made the trail deterministic at the S22(g) read:
   * expectAt computed from the PREVIOUS move's clientY (want=1.37, one
   * 4-5 px step behind) while the release then flushed the pending move
   * and the widget committed the true final position (got=1.52) —
   * byte-identical across every tree because the cadence is fixed. The
   * cure derives, never pins: poll the capture probe until it reports the
   * dispatched clientY (bounded; the app's rAF loop runs continuously, so
   * a pending move always delivers on a coming frame). Post-RELEASE reads
   * ((b)/(c)/(h)) need none of this — a boundary event flushes the queue. */
  const settleDelivered = async (y) => {
    for (let i = 0; i < 50; i++) {
      if (await ev('window.__e2e.pw.last') === Math.round(y)) return true;
      await sleep(30);
    }
    return false;
  };
  /** both m/s readouts (gauge overlay + desktop HUD label) as rendered. */
  const readouts = () => ev(`(() => ({
    gauge: document.querySelector(
      '#ob-power-gauge .ob-touchw-gauge-readout')?.textContent ?? '',
    hud: document.getElementById('power-val')?.textContent ?? '' }))()`);
  // (b) sampled-x exactness, both modes: start strictly INSIDE the rail
  // (y = bot − 2: the absolute seed must not clamp, so the monotone
  // integration stays absolute-equivalent), end at the sampled fraction;
  // the 1.0 sample overdrives past the top pad (clamps to exactly 1)
  for (const mode of ['perceptual', 'linear']) {
    await setMode(mode);
    for (const f of [0.05, 0.25, 0.5, 0.75, 1.0]) {
      const yT = f === 1 ? top - 4 : bot - f * rail;
      await drag(client, { x: g.cx, y: bot - 2 }, { x: g.cx, y: yT },
        { steps: 16, stepMs: 12 });
      await sleep(160);
      const want = await expectAt(mode);
      const got = await read();
      check(`S22(b) drag to x≈${f} writes the exact curve value (${mode})`,
        got === want, `got=${got} want=${want}`);
      if (mode === 'linear') {
        // GH-184 linear-mode pin: the pre-184 0.1 rounding stays byte-exact
        // (the x≈0.05 sample lands sub-2 m/s, where the perceptual fine
        // grid would otherwise leave a live hundredth)
        check(`S22(b) linear release stays on the 0.1 grid (x≈${f})`,
          Math.round(got * 100) % 10 === 0, `got=${got}`);
      }
    }
    // (d) readout truth in this mode: gauge readout + HUD #power-val show
    // the TRUE resulting velocity (the value chain, never the fraction) at
    // fmtV's honest decimals (GH-184: never more than the grid resolves)
    const v = await read();
    const truth = { v, ...(await readouts()) };
    check(`S22(d) readouts show the TRUE m/s (${mode})`,
      truth.gauge === fmtV(truth.v) + ' m/s'
        && truth.hud === fmtV(truth.v) + ' m/s', JSON.stringify(truth));
  }
  // (c) fine-gear x-law (perceptual): same vertical travel on-axis vs at
  // the gear floor — Δx recovered through the inverse curve; the gear
  // multiplies the x-step, so the ratio law is mode-independent
  await setMode('perceptual');
  const yMid = bot - 0.5 * rail;
  const DY = Math.round(rail * 0.3);
  await touchStart(client, [{ x: g.cx, y: yMid }]);
  await sleep(80);
  const vSeedOn = await read();
  for (let i = 1; i <= 10; i++) {
    await touchMove(client, [{ x: g.cx, y: yMid - DY * i / 10 }]);
    await sleep(16);
  }
  await touchEnd(client, []);
  await sleep(160);
  const dxOn = curveX(await read(), 'perceptual')
    - curveX(vSeedOn, 'perceptual');
  const AX = g.cx + OFF_AXIS_HI + 60;
  await touchStart(client, [{ x: g.cx, y: yMid }]);
  await sleep(80);
  const vSeedOff = await read();
  for (let i = 1; i <= 8; i++) {
    await touchMove(client, [{ x: g.cx + (AX - g.cx) * i / 8, y: yMid }]);
    await sleep(16);
  }
  for (let i = 1; i <= 10; i++) {
    await touchMove(client, [{ x: AX, y: yMid - DY * i / 10 }]);
    await sleep(16);
  }
  await touchEnd(client, []);
  await sleep(160);
  const dxOff = curveX(await read(), 'perceptual')
    - curveX(vSeedOff, 'perceptual');
  check('S22(c) gear multiplies the x-step (off-axis Δx ≤ 0.25·on-axis Δx)',
    dxOn > 0.2 && dxOff > 0.005 && dxOff <= dxOn * 0.25,
    `Δx_on=${dxOn.toFixed(3)} Δx_off=${dxOff.toFixed(3)}`);
  check('S22(c) geared x-steps survive the write quantization',
    dxOff > 0, `Δx_off=${dxOff.toFixed(3)}`);

  // (g) GH-184 release-snap (the issue's headline defect): a release in the
  // 1–2 m/s band commits on the FINE 0.01 grid, never the old ±0.1 snap —
  // RED on pre-184 builds (they commit round(v·10)/10). The drag targets
  // v≈1.53; because the pixel lattice could land the captured expectation
  // on a tenth by luck, the finger nudges (still down) until the mirrored
  // expectation sits OFF the coarse grid, then releases.
  let yCur = bot - 2;
  await touchStart(client, [{ x: g.cx, y: yCur }]);
  await sleep(80);
  const yFine = bot - curveX(1.53, 'perceptual') * rail;
  for (let i = 1; i <= 12; i++) {
    await touchMove(client,
      [{ x: g.cx, y: yCur + (yFine - yCur) * i / 12 }]);
    await sleep(16);
  }
  yCur = yFine;
  // GH-505: every mid-gesture expectation is read only after the delivered
  // stream reaches the dispatched position (see settleDelivered above)
  let settled = await settleDelivered(yCur);
  let wantFine = await expectAt('perceptual');
  for (let n = 0; n < 6 && Math.round(wantFine * 100) % 10 === 0; n++) {
    yCur -= 3;
    await touchMove(client, [{ x: g.cx, y: yCur }]);
    await sleep(30);
    settled = (await settleDelivered(yCur)) && settled;
    wantFine = await expectAt('perceptual');
  }
  check('S22(g) delivered pointer stream settled to the dispatched release '
    + 'position (GH-505 — the expectation is read from the app\'s own '
    + 'settled input, never a trailing frame)', settled,
  `pw.last=${await ev('window.__e2e.pw.last')} yCur=${Math.round(yCur)}`);
  await touchEnd(client, []);
  await sleep(160);
  const gotFine = await read();
  check('S22(g) low-v release commits on the FINE grid, not ±0.1 (GH-184)',
    gotFine === wantFine && Math.round(wantFine * 100) % 10 !== 0,
    `got=${gotFine} want=${wantFine}`);
  check('S22(g) fine commit lands in the 1–2 m/s JND band (setup sane)',
    gotFine > 1.2 && gotFine < 1.9, `v=${gotFine}`);
  const rg = await readouts();
  check('S22(g) readouts show two HONEST decimals below 3 m/s',
    rg.gauge === gotFine.toFixed(2) + ' m/s'
      && rg.hud === gotFine.toFixed(2) + ' m/s', JSON.stringify(rg));

  // (h) GH-184 high-v twin: at v≈8.8 the perceptual grid COARSENS back to
  // the 0.1 lattice (step ≈ 1.1 % of v — JND-even, and the pre-184 tenth
  // muscle memory survives) and the readouts keep ONE decimal (no fake
  // precision beyond the grid).
  await drag(client, { x: g.cx, y: bot - 2 },
    { x: g.cx, y: bot - curveX(8.8, 'perceptual') * rail },
    { steps: 16, stepMs: 12 });
  await sleep(160);
  const wantHi = await expectAt('perceptual');
  const gotHi = await read();
  check('S22(h) high-v release commits on the 0.1 lattice (coarser step)',
    gotHi === wantHi && Math.round(gotHi * 100) % 10 === 0
      && gotHi > 7 && gotHi < 10.5,
    `got=${gotHi} want=${wantHi}`);
  const rh = await readouts();
  check('S22(h) readouts keep ONE decimal at/above 3 m/s',
    rh.gauge === gotHi.toFixed(1) + ' m/s'
      && rh.hud === gotHi.toFixed(1) + ' m/s', JSON.stringify(rh));

  // (f) the gauge legs fired nothing (explicit-fire-only law)
  check('S22(f) gauge legs fired nothing',
    ['AIM', 'BALL_IN_HAND'].includes(await ev('__test.state()'))
      && await shotsLogged() === shots0);
  // (e) scripted-seam byte-identity while the curve is ACTIVE: the fire
  // seam is v-space — the submitted scenario carries v0 exactly as passed.
  // The S19 scene leaves an 8-ball GROUPED phase (call-shot law): declare
  // a SAFETY through the frozen __aim seam (the pocket picker's own
  // dispatch) so the scripted fire is legal without any pocket logic here
  if (await ev('window.__aim?.nominationRequired?.() === true')) {
    await ev('window.__aim.toggleSafety?.(); true');
    await sleep(250);
  }
  const V0 = 3.7317;
  const scen0 = await ev('window.__test.scenarios().length');
  const fireErr = await ev(
    `window.__test.shoot({ v0: ${V0}, phi: ${PHI}, theta: 0, a: 0, b: 0 })`);
  check('S22(e) scripted fire accepted', fireErr === null, String(fireErr));
  const v0Rec = await ev(
    'JSON.parse(window.__test.scenarios().at(-1)).shot.v0');
  check('S22(e) scripted v0 byte-identical through the fire seam',
    v0Rec === V0
      && await ev('window.__test.scenarios().length') === scen0 + 1,
    `submitted v0=${v0Rec} expected=${V0}`);
  const s22 = await settleScripted('S22 scripted shot');
  check('S22(e) scripted shot settles', s22 !== 'PLAYBACK'
    && s22 !== 'SIMULATING', s22);
  if (await ev('window.__rules?.matchState?.()?.pendingDecision != null')) {
    await ev('window.__rules.decide(1)');
    await sleep(400);
  }
  check("S22 classifier untouched (the gauge is plane B — state S0)",
    await ev("window.__touch?.state?.() === 'S0'"));
}

// ---- scenario 21 — drill dock coarse taps (issue #120) ----------------------
// The drills icon dock (STOP/Reset right-column rail; drills.css + touch.css
// §3.11 retreat) driven by REAL Input.dispatchTouchEvent taps: buttons on
// the 44 pt floor and hit-testable; STOP raises the kit confirm (options on
// the §3.10 44 pt floor), Cancel keeps the run, Reset→Confirm re-lays the
// opening state with no further tap, STOP→Confirm tears the chrome down.
// GH-133 leg: a COMPLETED run keeps ↻ on the rail (post-completion
// register) and a coarse tap on it restarts immediately with no confirm.
// DOM-chrome taps only (the rows-14/15 class) — ordering-law immune, runs
// last. Waits on the guarded __drills leaf (dynamic import, post-boot).
async function sc21() {
  for (let i = 0; i < 60
    && !(await ev('typeof window.__drills?.start === "function"')); i++) {
    await sleep(250);
  }
  check('S21 drills seam installed',
    await ev('typeof window.__drills?.start === "function"'));
  const started = await ev(`window.__drills?.start?.('bu-f2')`);
  check('S21 drill started (mode pinned to practice)', started === true);
  if (started !== true) return;
  await sleep(700);
  const dock = await ev(`(() => {
    const out = { btns: [], vw: innerWidth };
    for (const id of ['ob-drill-reset', 'ob-drill-stop']) {
      const el = document.getElementById(id);
      if (!el || !el.getClientRects().length) { out.btns.push({ id, missing: true }); continue; }
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      out.btns.push({ id, w: r.width, h: r.height,
        cx: r.x + r.width / 2, cy: r.y + r.height / 2,
        hit: !!hit && (hit === el || el.contains(hit)) });
    }
    return out;
  })()`);
  for (const b of dock.btns) {
    check(`S21 ${b.id} present ≥44pt hit-testable`,
      !b.missing && Math.min(b.w, b.h) >= 43.5 && b.hit === true,
      JSON.stringify(b));
  }
  const stopBtn = dock.btns.find((b) => b.id === 'ob-drill-stop');
  const resetBtn = dock.btns.find((b) => b.id === 'ob-drill-reset');
  if (!stopBtn || stopBtn.missing || !resetBtn || resetBtn.missing) return;
  const confirmUp = () => ev(`(() => {
    const p = document.querySelector('[data-ob="confirm"]');
    return !!p && p.getClientRects().length > 0;
  })()`);
  // STOP tap → confirm (44 pt options) → Cancel keeps the run
  await tap(client, stopBtn.cx, stopBtn.cy);
  await sleep(500);
  check('S21 STOP tap raises the confirm', await confirmUp());
  const confSmall = await ev(`(() => {
    const out = [];
    for (const b of document.querySelectorAll('[data-ob="confirm"] .ob-btn')) {
      const r = b.getBoundingClientRect();
      if (Math.min(r.width, r.height) < 43.5) {
        out.push(b.dataset.ob + ' ' + r.width.toFixed(0) + 'x' + r.height.toFixed(0));
      }
    }
    return out;
  })()`);
  check('S21 confirm options on the 44pt floor', confSmall.length === 0,
    confSmall.join(', '));
  const cancelPt = await ev(`(() => {
    const b = document.querySelector('[data-ob="confirm-cancel"]');
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })()`);
  await tap(client, cancelPt.x, cancelPt.y);
  await sleep(600);
  check('S21 Cancel keeps the run live',
    (await confirmUp()) === false
      && await ev('window.__drills.state()?.done === false'));
  // Reset tap → Confirm re-lays the opening state, no further tap
  await tap(client, resetBtn.cx, resetBtn.cy);
  await sleep(500);
  check('S21 Reset tap raises the confirm', await confirmUp());
  let acceptPt = await ev(`(() => {
    const b = document.querySelector('[data-ob="confirm-accept"]');
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })()`);
  await tap(client, acceptPt.x, acceptPt.y);
  await sleep(1200); // reset rides start(): pins + rerack + attempt-0 re-lay
  const afterReset = await ev(`({
    st: window.__drills.state(), machine: __test.state(),
    stop: !!document.getElementById('ob-drill-stop') })`);
  check('S21 Reset→Confirm restarts the run (attempt 0, chrome up)',
    afterReset.st && afterReset.st.attempt === 0 && afterReset.st.done === false
      && afterReset.stop === true, JSON.stringify(afterReset));
  // STOP tap → Confirm exits the drill chrome entirely
  await tap(client, stopBtn.cx, stopBtn.cy);
  await sleep(500);
  check('S21 second STOP tap raises the confirm', await confirmUp());
  acceptPt = await ev(`(() => {
    const b = document.querySelector('[data-ob="confirm-accept"]');
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })()`);
  await tap(client, acceptPt.x, acceptPt.y);
  await sleep(600);
  const afterStop = await ev(`({
    st: window.__drills.state(),
    stop: !!document.getElementById('ob-drill-stop'),
    reset: !!document.getElementById('ob-drill-reset') })`);
  check('S21 STOP→Confirm tears the dock actions down',
    afterStop.st === null && afterStop.stop === false && afterStop.reset === false,
    JSON.stringify(afterStop));
  // GH-133 — the post-completion register on the coarse rail: a COMPLETED
  // run keeps ↻ (44 pt, hit-testable; STOP gone; the opener stays hidden on
  // phone — the toolbar pill owns that slot), and a REAL coarse tap
  // restarts IMMEDIATELY with NO confirm (confirm-destructive-only law:
  // the run is over, best persisted, plays already bumped). Completion via
  // the programmatic arm-6b containment exit (__test.shoot — no canvas
  // touch, so the ordering law stays unimplicated).
  const started133 = await ev(`window.__drills.start('circle')`);
  check('S21 GH-133 circle started', started133 === true);
  if (started133 === true) {
    await sleep(700);
    await ev(`__test.shoot({ v0: 2.4, phi: ${-Math.PI / 2}, theta: 0, a: 0, b: 0 })`);
    for (let i = 0; i < 40; i++) { // settle poll — the exit ends the run
      const s = await ev('__test.state()');
      if (s !== 'PLAYBACK' && s !== 'SIMULATING') break;
      await sleep(300);
    }
    await sleep(600); // complete() runs inside the settle dispatch
    const done133 = await ev(`(() => {
      const el = document.getElementById('ob-drill-reset');
      if (!el || !el.getClientRects().length) return null;
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      const open = document.getElementById('ob-drill-open');
      return { w: r.width, h: r.height,
        cx: r.x + r.width / 2, cy: r.y + r.height / 2,
        hit: !!hit && (hit === el || el.contains(hit)),
        stop: !!document.getElementById('ob-drill-stop'),
        openerHidden: !open || open.getClientRects().length === 0,
        done: window.__drills.state()?.done === true };
    })()`);
    check('S21 GH-133 post-completion ↻ up (≥44pt, hit-testable, STOP gone)',
      !!done133 && done133.done && !done133.stop && done133.openerHidden
        && done133.hit && Math.min(done133.w, done133.h) >= 43.5,
      JSON.stringify(done133));
    if (done133 && done133.done) {
      await tap(client, done133.cx, done133.cy);
      await sleep(500);
      const conf133 = await confirmUp();
      const st133 = await ev('window.__drills.state()');
      check('S21 GH-133 coarse ↻ tap restarts immediately, NO confirm',
        conf133 === false && !!st133 && st133.done === false
          && st133.attempt === 0,
        `confirm=${conf133} st=${JSON.stringify(st133)}`);
    }
    await ev('window.__drills.stop()'); // programmatic — confirm-free
    await sleep(400);
  }
  await ev(`window.__settings.changeMode('play')`);
  await sleep(400);
  check("S21 classifier untouched (state S0)",
    await ev("window.__touch?.state?.() === 'S0'"));
}

// 23 — DELETED (GH-225 Phase D). This scenario walked the GH-139 record
// dock's whole state machine under real coarse taps: idle (Record) →
// recording (Pause + Stop + elapsed chip) → paused (Resume + Stop) →
// resumed → stopped-back-to-idle, each button on the 44pt floor and
// hit-testable, with the no-confirm law.
// 030 the design charter DVR amendment clause 4 retires the dock, so every one of
// those assertions was about a surface that cannot exist. RATIONALE for
// DELETE rather than RETARGET: there is no Playback equivalent of a
// "coarse tap walks the recorder's state machine" claim — the DVR is always
// recording and exposes no transport for it. The coverage this scenario
// really carried, a MediaRecorder capture that works on the coarse
// register, moved to e2e-record.mjs's rewritten [phone] arm (seam-driven
// idle→rec→paused→rec→idle at 844x390 DPR3 + the #197 quality sheet), and
// phone reachability of the replacement surface is now asserted in S13
// (real tap on #ob-playback → the DVR session list). The harness law about
// --mute-audio starving the webm muxer, discovered here, is preserved in
// that e2e-record arm's neighbourhood.

// 24 — page-zoom lockdown (issue #145): the web layers of the zoom pin.
// (a) the app.html viewport meta carries maximum-scale=1 + user-scalable=no
// (the primary cap in the WKWebView shell and on Chrome-class serves) with
// the shipped width/initial-scale/viewport-fit intact; (b) touch-action
// posture on the zoom channel (canvas none, chrome manipulation — sc17
// owns the full #60 matrix); (c) the Safari GestureEvent guard
// preventDefaults the proprietary zoom events (synthetic cancelable
// dispatch — Chrome never fires real ones); (d) watchdog seam unit: a mock
// obViewport collector (e2e-haptics --seam shape, installed per-call — the
// bridge is capability-detected at POST time) proves __viewport.check(fake)
// drives EXACTLY ONE {v:1, scale} bridge post and the localized hint
// banner, and check(1) clears it; (d2/d3) banner coordination (review
// 2026-07 findings 2a–2c): a zoomed re-check never clobbers a live game
// banner on the shared surface, the hint re-asserts within the reassertMs
// window after a flow-style timer clear, the un-zoom clear is selective
// (a live game banner survives), and the re-assert interval disarms at
// scale 1; (e) BEST-EFFORT real pinch:
// Input.synthesizePinchGesture on the canvas AND centered on the settings
// gear (a chrome-origin pinch), then visualViewport.scale must still be 1.
// The pinch command can be unsupported/inert on headless builds — such a
// run SKIPS LOUDLY (recorded limitation, never a silent pass); the
// deterministic core of this row is (a)-(d). DOM/meta/computed-style reads
// + a trailing compositor gesture: registered LAST (after row 21) per the
// ordering law — nothing runs after the canvas-targeted pinch.
async function sc24() {
  // (a) viewport meta
  const meta = await ev(
    `document.querySelector('meta[name="viewport"]')?.content ?? ''`);
  check('S24 viewport meta pins maximum-scale=1',
    /maximum-scale\s*=\s*1(?![\d.])/.test(meta), meta);
  check('S24 viewport meta pins user-scalable=no',
    /user-scalable\s*=\s*no/.test(meta), meta);
  check('S24 viewport meta keeps the shipped width/initial-scale/viewport-fit',
    meta.includes('width=device-width') && meta.includes('initial-scale=1')
      && meta.includes('viewport-fit=cover'), meta);

  // (b) zoom-channel touch-action posture
  const ta = await ev(`({
    canvas: getComputedStyle(document.querySelector('body > canvas')).touchAction,
    gear: (() => { const g = document.getElementById('ob-gear');
      return g ? getComputedStyle(g).touchAction : 'absent'; })() })`);
  check('S24 renderer canvas touch-action none (pinch/double-tap dead on the game surface)',
    ta.canvas === 'none', JSON.stringify(ta));
  check('S24 settings gear touch-action manipulation (chrome double-tap zoom dead)',
    ta.gear === 'manipulation', JSON.stringify(ta));

  // (c) Safari GestureEvent guard (synthetic dispatch — the listener must
  // cancel the zoom channel regardless of which constructor produced it)
  const gp = await ev(`(() => {
    const out = {};
    for (const t of ['gesturestart', 'gesturechange', 'gestureend']) {
      const e = new Event(t, { cancelable: true });
      window.dispatchEvent(e);
      out[t] = e.defaultPrevented;
    }
    return out;
  })()`);
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    check(`S24 ${type} preventDefaulted at window level (Safari zoom channel)`,
      gp[type] === true, JSON.stringify(gp));
  }

  // (d) watchdog seam unit
  check('S24 __viewport watchdog seam installed',
    await ev('window.__viewport?.installed === true'));
  const seam = await ev(`(() => {
    window.__zoomMsgs = [];
    window.webkit = { messageHandlers: { obViewport: { postMessage: (m) => {
      window.__zoomMsgs.push(JSON.parse(JSON.stringify(m)));
    } } } };
    const banner = document.getElementById('banner');
    window.__viewport.check(1.8);
    const shown = banner && banner.style.display === 'block'
      ? banner.textContent : '';
    const postsZoomed = window.__zoomMsgs.length;
    window.__viewport.check(1.0);
    const clearedText = banner ? banner.textContent : '';
    const postsAfterClear = window.__zoomMsgs.length;
    const wire = window.__zoomMsgs[0] ?? null;
    try { delete window.webkit; } catch { window.webkit = undefined; }
    return { postsZoomed, postsAfterClear, wire, shown, clearedText,
      want: window.__i18n?.t?.('touch.zoomHint') ?? null };
  })()`);
  check('S24 zoomed check posts EXACTLY ONE bridge message',
    seam.postsZoomed === 1, JSON.stringify(seam));
  check('S24 bridge wire shape {v: 1, scale}',
    seam.wire && seam.wire.v === 1 && seam.wire.scale === 1.8,
    JSON.stringify(seam.wire));
  check('S24 zoomed check shows the localized hint banner (t(touch.zoomHint))',
    !!seam.shown && seam.shown === seam.want,
    `shown=${JSON.stringify(seam.shown)} want=${JSON.stringify(seam.want)}`);
  check('S24 scale-1 check clears the banner and posts nothing',
    seam.clearedText === '' && seam.postsAfterClear === 1,
    JSON.stringify(seam));

  // (d2) banner coordination — game info wins + timer-clear re-assert
  // (review 2026-07 findings 2a/2c): with the watchdog zoomed, a game
  // banner arriving on the shared #banner surface must NEVER be clobbered
  // by a watchdog re-check, and after a flow-style banterTimer clear the
  // hint must return within the re-assert window (the old resize-only
  // re-assert never fired on a static viewport). The competing banner and
  // the timer clear are simulated at the DOM surface the watchdog reads
  // back (textContent + display flip — the flow.js paint/clear shape); no
  // mock bridge needed (postZoomReport is capability-detected per call).
  const reassertMs = await ev('window.__viewport?.reassertMs ?? 2000');
  const coord = await ev(`(() => {
    const banner = document.getElementById('banner');
    window.__viewport.check(1.8);                 // hint up, interval armed
    const hintUp = banner.textContent;
    banner.textContent = 'FOUL — e2e competing game banner';
    banner.style.display = 'block';               // game banner displaces it
    window.__viewport.check(1.8);                 // zoomed re-check re-fires
    const afterRecheck = banner.textContent;      // …and must not clobber
    banner.textContent = '';                      // flow banterTimer clear
    banner.style.display = 'none';                // (1800/2600 ms in prod)
    return { hintUp, afterRecheck,
      want: window.__i18n?.t?.('touch.zoomHint') ?? null };
  })()`);
  check('S24 zoomed check paints the hint on a free banner surface',
    !!coord.want && coord.hintUp === coord.want, JSON.stringify(coord));
  check('S24 zoomed re-check never clobbers a live game banner (game info wins)',
    coord.afterRecheck === 'FOUL — e2e competing game banner',
    JSON.stringify(coord));
  await sleep(reassertMs + 700); // > one re-assert tick past the timer clear
  const rea = await ev(`({
    text: document.getElementById('banner')?.textContent ?? '',
    display: document.getElementById('banner')?.style.display ?? '',
    want: window.__i18n?.t?.('touch.zoomHint') ?? null })`);
  check('S24 hint re-asserts within the re-assert window after a timer clear',
    !!rea.want && rea.text === rea.want && rea.display === 'block',
    JSON.stringify(rea));

  // (d3) selective un-zoom clear (review 2026-07 finding 2b): a fresh game
  // banner up at un-zoom time must survive — the watchdog clears only its
  // own hint text (DOM read-back), never a blind setBanner('').
  const sel = await ev(`(() => {
    const banner = document.getElementById('banner');
    banner.textContent = 'FOUL — e2e un-zoom game banner';
    banner.style.display = 'block';               // arrives while still zoomed
    window.__viewport.check(1.0);                 // un-zoom: selective clear
    const text = banner.textContent, display = banner.style.display;
    banner.textContent = '';                      // cleanup
    banner.style.display = 'none';
    return { text, display };
  })()`);
  check('S24 un-zoom never blind-wipes a live game banner (selective clear)',
    sel.text === 'FOUL — e2e un-zoom game banner' && sel.display === 'block',
    JSON.stringify(sel));
  await sleep(reassertMs + 700); // interval must be disarmed at scale 1
  check('S24 re-assert interval disarmed after un-zoom (no hint resurrection)',
    await ev(`(document.getElementById('banner')?.textContent ?? '') === ''`));

  // (e) best-effort compositor pinch (canvas center, then the gear pill)
  const gear = await ev(`window.__tp.el('#ob-gear')`);
  const targets = [
    ['canvas center', { x: W / 2, y: H / 2 }],
    ['settings gear (chrome-origin pinch)',
      gear.found ? { x: gear.cx, y: gear.cy } : null],
  ];
  let pinchSupported = true;
  for (const [name, at] of targets) {
    if (!at) {
      check(`S24 pinch target located — ${name}`, false, JSON.stringify(gear));
      continue;
    }
    try {
      await client.send('Input.synthesizePinchGesture', {
        x: Math.round(at.x), y: Math.round(at.y),
        scaleFactor: 2.5, relativeSpeed: 800, gestureSourceType: 'touch',
      });
    } catch (e) {
      pinchSupported = false;
      console.log(`[e2e-touch] S24 RECORDED LIMITATION: Input.synthesizePinchGesture `
        + `unavailable on this Chrome build (${e.message}) — the real-pinch arm is `
        + `skipped; the meta/touch-action/GestureEvent/watchdog asserts above are the gate`);
      break;
    }
    await sleep(500);
    const scale = await ev('window.visualViewport?.scale ?? 1');
    check(`S24 visualViewport.scale stays 1 after a real pinch on the ${name}`,
      Math.abs(scale - 1) < 0.001, `scale=${scale}`);
  }
  if (pinchSupported) {
    // watchdog steady state: no zoom -> no hint left behind
    await sleep(400);
    check('S24 no stale zoom hint after the pinch attempts',
      await ev(`document.getElementById('banner')?.textContent !== `
        + `(window.__i18n?.t?.('touch.zoomHint') ?? '__none')`));
  }
}

// 25 — BIH ring alignment (issue GH-150, owner build5): the blue placement
// ghost must ENCLOSE the RENDERED cue ball. The GH-143 grab lift raises the
// mesh to rest + 0.75R in a frame hook AFTER input runs, while every
// successful placement re-seats mesh y at cloth level — so the pre-fix
// paintGhost (called inside the pointermove) projected the CLOTH-level
// center and the ring sat a lifted-ball-height below the ball on screen
// (red: ~8–20px center offset at phone metrics). Two legs, both measured
// as projected-rendered-center vs ring-center px:
//   mid-drag — ring re-centered ≤3px through live moves;
//   at-rest  — finger HELD still: no pointermove repaints, only the new
//              per-frame hook keeps the ring on the lifted ball (pre-fix
//              the ring froze at the last cloth-level projection).
// The render truth is __tp.ballScreen(0) (three-frame mesh pos incl. the
// lifted y, projected through the live camera). Desktop lane note: the
// desktop placement drag draws NO ring by design ("the visible snap IS
// the cue on desktop" — flow.js GH-140 comment); its lift/shadow render
// alignment is e2e-dragshadow's arm-2/3 gate. Canvas touches: registered
// right after S10 (before the row-13 renavigation, ordering law).
async function sc25() {
  check('S25 eight_ball active', await ensureEightBall());
  await scene8([{ id: 0, x: 0, y: -0.4 }, { id: 3, x: 0.45, y: 0.9 },
    { id: 8, x: 0.5, y: -0.8 }, ...FAR],
  { phase: 'grouped', groups: { 1: 'solids', 2: 'stripes' }, shooter: 1, breaker: 1 });
  await ev('window.__rules?.call?.(3, 0)');
  const err = await ev(
    `__test.shoot({ v0: 0.35, phi: -Math.PI / 2, theta: 0, a: 0, b: 0 })`);
  check('S25 scene shot accepted (no-contact foul recipe)', !err, String(err));
  const st = await settleScripted('S25');
  check('S25 no-contact foul grants BALL_IN_HAND', st === 'BALL_IN_HAND', st);
  const cue = await ev(`window.__tp.ballScreen(0)`);
  check('S25 cue ball projectable for the grab', cue?.found === true,
    JSON.stringify(cue));
  if (cue?.found !== true) return;
  // ring-center vs projected RENDERED ball-center probe (px, CSS space)
  const ringOff = () => ev(`(() => {
    const g = document.getElementById('ob-touch-ghost');
    if (!g || !g.getClientRects().length) return null;
    const r = g.getBoundingClientRect();
    const b = window.__tp.ballScreen(0);
    if (!b.found) return null;
    const bb = window.__test.balls().find((x) => x.id === 0);
    const rr = window.__aim?.ballR?.() ?? 0.028575;
    const e = window.__tp.project(bb.pos[0] + rr, bb.pos[1], bb.pos[2]);
    const ballPx = e ? Math.hypot(e.x - b.x, e.y - b.y) : 0;
    return { dx: +(r.x + r.width / 2 - b.x).toFixed(2),
      dy: +(r.y + r.height / 2 - b.y).toFixed(2),
      ringR: +(r.width / 2).toFixed(2), ballPx: +ballPx.toFixed(2),
      lift: window.__aim?.dragLift?.state?.() ?? null };
  })()`);
  const A = await ev(`window.__tp.projectK(-0.25, -0.3)`);
  const fA = { x: A.x, y: A.y + GHOST_OFFSET_PX };
  await touchStart(client, [{ x: cue.x, y: cue.y }]);
  await sleep(60);
  for (let i = 1; i <= 10; i++) {
    await touchMove(client, [{
      x: cue.x + (fA.x - cue.x) * (i / 10),
      y: cue.y + (fA.y - cue.y) * (i / 10) }]);
    await sleep(16);
  }
  check('S25 grab-zone drag classifies S3',
    await ev("window.__touch?.state?.() === 'S3'"));
  await sleep(300); // ≥1 rAF: the GH-143 lift hook + the repaint hook ran
  const mid = await ringOff();
  check('S25 mid-drag: ring center on the RENDERED (lifted) ball center '
    + '(≤3px; red pre-fix: the cloth-level projection sat ~0.75R low)',
  !!mid && mid.lift?.phase === 'up' && Math.hypot(mid.dx, mid.dy) <= 3,
  JSON.stringify(mid));
  check('S25 mid-drag: ring ENCLOSES the ball silhouette '
    + '(ring r ≥ projected ball r + center offset)',
  !!mid && mid.ringR >= mid.ballPx + Math.hypot(mid.dx, mid.dy),
  JSON.stringify(mid));
  // at-rest leg: HOLD the finger (zero touchMove traffic) — only the
  // per-frame hook can keep the ring honest while the lift/settle and the
  // camera evolve under a stationary finger
  await sleep(500);
  const rest = await ringOff();
  check('S25 at-rest (held finger): ring still centered on the rendered '
    + 'ball (≤3px)',
  !!rest && Math.hypot(rest.dx, rest.dy) <= 3, JSON.stringify(rest));
  await touchEnd(client, []);
  await sleep(400);
  check('S25 ghost hidden after release',
    await ev('window.__touch?.ghost?.() === null'));
  check("S25 classifier back to S0",
    await ev("window.__touch?.state?.() === 'S0'"));
}

// 26 — drill rail column contract (issue GH-150, owner build5; narrowed by
// GH-225 Phase D). ORIGINALLY the "dock single column" scenario: in drill
// mode BOTH docks were live and the record button had to share the drill
// rail's x column (the pre-fix record dock slid one column LEFT — the "L").
// The record dock is retired (030 the design charter DVR amendment clause 4), so the
// dual-dock legs (record button in-column, the compact recording register
// with pause/resume parked, the elapsed chip beside the stop inside the
// §3.12 116px reservation, rail-collapse re-slotting) are DELETED — every
// one asserted a surface that no longer exists, and Playback has no dock to
// put in that column. What SURVIVES is the half of the contract that was
// never about recording: the drill rail is the right-edge column, its
// members stack at sp-1, and the column bottoms clear of the spin button —
// the band-budget claim the whole GH-150 wave existed to protect.
// DOM-chrome + seams only (zero canvas taps) — ordering-law immune.
async function sc26() {
  for (let i = 0; i < 60
    && !(await ev('typeof window.__drills?.start === "function"')); i++) {
    await sleep(250);
  }
  const started = await ev(`window.__drills?.start?.('bu-f2')`);
  check('S26 drill started (live rail up)', started === true);
  if (started !== true) return;
  await sleep(700);
  const rects = () => ev(`(() => {
    const out = { vw: innerWidth };
    for (const id of ['ob-drill-reset', 'ob-drill-stop', 'ob-spin-btn']) {
      const el = document.getElementById(id);
      if (!el || !el.getClientRects().length) { out[id] = null; continue; }
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      out[id] = { l: +r.left.toFixed(1), t: +r.top.toFixed(1),
        r: +r.right.toFixed(1), b: +r.bottom.toFixed(1),
        w: +r.width.toFixed(1), h: +r.height.toFixed(1),
        hit: !!hit && (hit === el || el.contains(hit)) };
    }
    // GH-225 Phase D: the retired record dock must not reappear in this
    // column (the ghost check that replaces the dual-dock legs)
    out.recordDock = !!document.getElementById('ob-record-dock');
    return out;
  })()`);
  const col = (a, b) => !!a && !!b
    && Math.abs(a.l - b.l) <= 1 && Math.abs(a.r - b.r) <= 1;
  const gap = (above, below) => (!!above && !!below)
    ? +(below.t - above.b).toFixed(1) : null;
  const live = await rects();
  check('S26 live run: [Reset, STOP] ONE x column (≤1px)',
    col(live['ob-drill-reset'], live['ob-drill-stop']),
    JSON.stringify({ reset: live['ob-drill-reset'], stop: live['ob-drill-stop'] }));
  check('S26 live run: consistent sp-1 stacking gap (4px ±1)',
    Math.abs((gap(live['ob-drill-reset'], live['ob-drill-stop']) ?? 99) - 4) <= 1,
    JSON.stringify({ railGap: gap(live['ob-drill-reset'], live['ob-drill-stop']) }));
  check('S26 live run: column bottom clear of the spin button',
    !!live['ob-drill-stop'] && !!live['ob-spin-btn']
    && live['ob-drill-stop'].b <= live['ob-spin-btn'].t - 1,
    JSON.stringify({ stopB: live['ob-drill-stop']?.b,
      spinT: live['ob-spin-btn']?.t }));
  check('S26 live run: both rail buttons ≥44pt hit-testable in the column',
    ['ob-drill-reset', 'ob-drill-stop'].every((id) => !!live[id]
      && Math.min(live[id].w, live[id].h) >= 43.5 && live[id].hit === true),
    JSON.stringify({ reset: live['ob-drill-reset'], stop: live['ob-drill-stop'] }));
  check('S26 retired record dock absent from the column (Phase D)',
    live.recordDock === false);
  await ev('window.__drills.stop()');
  await sleep(500);
  const after = await rects();
  check('S26 rail collapse frees the column (STOP gone)',
    after['ob-drill-stop'] === null,
    JSON.stringify({ stop: after['ob-drill-stop'], reset: after['ob-drill-reset'] }));
  await ev(`window.__settings.changeMode('play')`);
  await sleep(400);
  check("S26 classifier untouched (state S0)",
    await ev("window.__touch?.state?.() === 'S0'"));
}

// 28 — GH-1053 / GH-990 on the phone sheet: with a REAL pending decision
// (an 8-ball no-contact break foul — WPA break_foul, a progressed rack) the
// gear opens the settings sheet (RED pre-fix: inert, no feedback) and
// closing it leaves the decision, its prompt and the shot gate as they
// were; the sheet's Re-rack row reaches flow.js's decision gate — refused
// with the honest notice, the table untouched (RED pre-fix: the row was
// unreachable under the decision, and onRerack re-racked at once). After
// the decision is answered the row ASKS (kit confirm): Cancel keeps the
// rack, Continue re-racks. DOM-chrome taps only (the row-16 wedge law).
async function sc28() {
  check('S28 eight_ball active', await ensureEightBall());
  await ev('__test.rerack(5)');
  await sleep(500);
  await ev('__test.shoot({ v0: 0.6, phi: -Math.PI / 2, theta: 0, a: 0, b: 0 })');
  await sleep(300);
  await settleScripted('S28 break');
  const DEC_UP = `(() => { const d = document.getElementById('hud-decision');
    return !!d && d.getClientRects().length > 0; })()`;
  const SNAP = `(() => { const m = window.__rules.matchState();
    return JSON.stringify({ pd: m?.pendingDecision ?? null, phase: m?.phase,
      shooter: m?.shooter, dec: ${DEC_UP},
      shoot: document.getElementById('shoot').disabled,
      balls: JSON.stringify(__test.balls()) }); })()`;
  let dec = false;
  for (let i = 0; i < 20 && !dec; i++) {
    dec = await ev(`window.__rules.matchState()?.pendingDecision?.kind === 'break_foul'
      && ${DEC_UP}`);
    if (!dec) await sleep(200);
  }
  check('S28 the no-contact break leaves a break_foul decision', dec,
    await ev(SNAP));
  if (!dec) return;
  const sheetUp = `document.getElementById('ob-gear').getAttribute('aria-expanded') === 'true'
    && document.getElementById('ob-settings').getClientRects().length > 0`;
  const sheetGone = `(() => { const d = document.getElementById('ob-settings');
    return !d || !d.getClientRects().length
      || getComputedStyle(d).visibility === 'hidden'; })()`;
  const waitExpr = async (expr, n = 25) => {
    for (let i = 0; i < n; i++) {
      if (await ev(expr)) return true;
      await sleep(200);
    }
    return false;
  };
  const openSheet = async (tag) => {
    const g = await ev(`window.__tp.el('#ob-gear')`);
    if (!(g.found && g.visible)) { check(`${tag}: gear visible`, false, JSON.stringify(g)); return false; }
    await tap(client, g.cx, g.cy);
    return waitExpr(sheetUp);
  };
  const rerackRow = async () => {
    for (let i = 0; i < 15; i++) {
      const rows = await ev('window.__tp.drawerRows()');
      const r = rows.rows?.[1];
      if (r?.found && r.key === 'hud.rerack') return r;
      await sleep(200);
    }
    return null;
  };
  const s0 = await ev(SNAP);
  // (a) the gear round trip under the decision
  check('S28 the gear OPENS the sheet under the pending decision (GH-1053)',
    await openSheet('S28a'));
  await ev(`document.getElementById('ob-settings-close')?.click(); true`);
  check('S28 the sheet closes', await waitExpr(sheetGone));
  await sleep(400);
  check('S28 decision, prompt and shot gate unchanged by the round trip',
    await ev(SNAP) === s0, JSON.stringify({ s0, now: await ev(SNAP) }));
  // (b) the sheet's Re-rack row under the decision: refused, honestly
  if (await openSheet('S28b')) {
    const row = await rerackRow();
    check('S28 the sheet carries an ENABLED Re-rack row under the decision',
      !!row && row.disabled === false, JSON.stringify(row));
    if (row) {
      await tap(client, row.cx, row.cy);
      await sleep(900);
      const hint = await ev(`({ text: document.getElementById('hud-hint')?.textContent,
        shown: document.getElementById('hud-hint')?.style.display === 'block',
        want: window.__i18n.t('shell.notice.decision') })`);
      check('S28 the Re-rack row is refused with the honest notice (GH-990)',
        hint.shown && hint.text === hint.want, JSON.stringify(hint));
      check('S28 no confirm under the decision',
        !await ev(`!!document.querySelector('[data-ob="confirm"]')`));
      check('S28 the refused row leaves the table and the decision untouched',
        await ev(SNAP) === s0, JSON.stringify({ s0, now: await ev(SNAP) }));
    }
  }
  await ev(`document.getElementById('ob-settings-close')?.click(); true`);
  await waitExpr(sheetGone);
  // (c) answer the decision (first option, a real tap) → the progressed,
  // undecided rack: the row asks; Cancel keeps it, Continue re-racks
  const opt = await ev(`window.__tp.el('#hud-decision .hd-btns button')`);
  if (opt.found && opt.visible) await tap(client, opt.cx, opt.cy);
  check('S28 the decision answered by tap',
    await waitExpr(`window.__rules.matchState()?.pendingDecision === null
      && !${DEC_UP}`));
  const s1 = await ev(SNAP);
  const confirmLeg = async (sel, tag) => {
    if (!await openSheet(tag)) { check(`${tag}: sheet opens`, false); return false; }
    const row = await rerackRow();
    if (!row) { check(`${tag}: Re-rack row present`, false); return false; }
    await tap(client, row.cx, row.cy);
    let btn = { found: false };
    for (let i = 0; i < 25 && !(btn.found && btn.visible); i++) {
      await sleep(200);
      btn = await ev(`window.__tp.el('${sel}')`);
    }
    check(`${tag}: the Re-rack row asks first on the progressed rack (kit confirm)`,
      btn.found && btn.visible, JSON.stringify(btn));
    if (!(btn.found && btn.visible)) return false;
    await tap(client, btn.cx, btn.cy);
    return true;
  };
  if (await confirmLeg('[data-ob="confirm-cancel"]', 'S28c')) {
    await waitExpr(`!document.querySelector('[data-ob="confirm"]')`);
    await sleep(400);
    const now1 = await ev(SNAP);
    check('S28 Cancel keeps the rack', now1 === s1, JSON.stringify({
      s1: { ...JSON.parse(s1), balls: undefined }, now: { ...JSON.parse(now1), balls: undefined },
      sameBalls: JSON.parse(s1).balls === JSON.parse(now1).balls }));
  }
  if (await confirmLeg('[data-ob="confirm-accept"]', 'S28d')) {
    check('S28 Continue re-racks (fresh break rack)', await waitExpr(
      `window.__rules.matchState()?.phase === 'break'
        && JSON.stringify(__test.balls()) !== ${JSON.stringify(JSON.parse(s1).balls)}`));
  }
  await ev(`document.getElementById('ob-settings-close')?.click(); true`);
  await waitExpr(sheetGone);
}

// ---- registry + runner ------------------------------------------------------
// Row 12 = fullrack runs only when requested (`--scenario fullrack`,
// quickstart §2).
//
// ORDERING LAW (recorded 2026-07-20, issue #46 forensics): row 16 runs in
// the TAP GROUP right after row 2, BEFORE any multi-finger scenario. On
// this Chrome build a second-finger-joins touchStart (an
// Input.dispatchTouchEvent listing an already-active id — rows 5/6) plants
// a renderer-side input wedge that stays dormant on the same document but,
// after the row-13 replay-hop renavigation, degrades EVERY later
// dispatchTouchEvent to converted mouse events (a bare mousedown, no
// pointer/touch events) for the rest of the CDP session — bisected
// deterministically: {5,13,16} and {6,13,16} reproduce, {7,13,16} and
// {13,14,15,16} stay healthy; re-asserting setPhoneMetrics/
// setTouchEmulationEnabled, touchCancel flushes, and warm-up taps do NOT
// heal it. Rows 14/15 only tap DOM chrome, so they are immune. Any FUTURE
// scenario that taps the CANVAS must therefore run before rows 5/6 (or the
// suite must move to per-scenario targets).
//
// #142 review nit: S19/S22 flip `powerResponse` mid-scenario (persist:false
// pins) and the runner survives a mid-scenario throw (check + continue), so
// an aborted S19/S22 must not strand a non-default mode into S22(a)'s
// default-honesty assert (or the rest of the run). try/finally twin of each
// scenario's own happy-path restore — idempotent; restore failures are
// swallowed so they never mask the original abort.
const modeSafe = (fn) => async () => {
  try { await fn(); } finally {
    await ev(`window.__settings?.set?.('powerResponse', 'perceptual',`
      + ` { persist: false }); true`).catch(() => {});
  }
};
// 27 — GH-441 overhead default register: interaction parity from the
// derived top-down pose. The phone aim law is screen-relative and every
// tap surface is a plane raycast / NDC projection — best-conditioned
// straight down — so each core interaction re-runs from the register:
// relative aim drag, pocket-nomination tap zones (the surface the GH-447
// decision marks ride verbatim), BIH ghost placement, two-finger orbit
// escape (a pose, not a lock) and the aim-view glide, which also chases
// the fov home to 40 (the GH-441 aim.js law — no permanent telephoto aim
// view). Registered LAST; restores camera:'orbit' on the way out (the sc6
// explicit re-pose convention).
async function sc27() {
  if (await ev('window.__aim?.getAimView?.() === true')) {
    await ev('window.__aim.setAimView(false)');
    await sleep(400);
  }
  // scenario isolation: sc21/sc26 leave the drills UI docked over the
  // BOTTOM band — exactly where the right/center pockets project from
  // overhead — so any residual drill session must end before the tap legs
  // (DOM-over-canvas occlusion, the GH-447 journey-QA lesson)
  await ev(`window.__drills?.stop?.(true); true`);
  await ev(`(window.__settings.changeMode
    ? void window.__settings.changeMode('play')
    : window.__settings.set('mode', 'play')), true`);
  await sleep(400);
  // live flip through the real settings wire: the window.__camhome seam
  // applies immediately — the flip doubles as 'return home'
  await ev(`window.__settings.set('camera', 'overhead'); true`);
  await sleep(300);
  const p27 = await ev('window.__tp.orbit()');
  check('S27 live flip poses the overhead register (phi 0.16, theta 0 '
    + 'on the landscape viewport)',
  !!p27 && Math.abs(p27.phi - 0.16) < 1e-6 && Math.abs(p27.theta) < 1e-6,
  JSON.stringify(p27));
  const fov27 = await ev('window.__dbg.camera.fov');
  check('S27 overhead fov tightened (< 39)', fov27 < 39 && fov27 > 5,
    String(fov27));

  // (a) relative aim drag: the phone aim law is screen-relative dx·G0 —
  // pin that it stays live and correctly signed from overhead
  await ev('window.__e2e.p0 = window.__aim.getPhi(); true');
  await drag(client, { x: W * 0.62, y: H * 0.5 },
    { x: W * 0.62 - 200, y: H * 0.5 }, { steps: 14, stepMs: 16 });
  await sleep(200);
  const d27 = await ev('window.__aim.getPhi() - window.__e2e.p0');
  check('S27 aim drag works from overhead (leftward raises phi)', d27 > 0,
    `dphi=${d27}`);
  check("S27 classifier back to S0 after the aim drag",
    await ev("window.__touch?.state?.() === 'S0'"));

  // fresh racks return home while the register is active: orbit away by
  // hand, re-rack, and the pose must land back on the register
  check('S27 eight_ball active', await ensureEightBall());
  await ev(`(() => { const o = window.__dbg.orbit; o.state.phi = 1.1;
    o.state.theta = 2.0; o.state.radius = 3.0; o.apply(); return true; })()`);
  await ev('__test.rerack(2)');
  await sleep(400);
  const pr27 = await ev('window.__tp.orbit()');
  check('S27 fresh rack returns home to the register',
    !!pr27 && Math.abs(pr27.phi - 0.16) < 1e-6 && Math.abs(pr27.theta) < 1e-6,
    JSON.stringify(pr27));

  // (b) pocket nomination tap zones from straight down (the sc9 in-zone
  // law): the flat discs present their FULL area from overhead — grazing
  // poses are the risky case, never top-down
  await scene8([{ id: 0, x: 0, y: -0.4 }, { id: 2, x: 0.45, y: 0.9 },
    { id: 8, x: 0.5, y: -0.8 }, ...FAR],
  { phase: 'open', shooter: 1, breaker: 1 });
  check('S27 nomination required on the shaped open table',
    await ev('window.__aim.nominationRequired()') === true);
  let marks27 = false;
  for (let i = 0; i < 20 && !marks27; i++) {
    await sleep(200);
    marks27 = await ev('window.__aim.pocketMarks().some((m) => m.visible)');
  }
  check('S27 pocket marks visible from overhead', marks27 === true);
  // pose-dependent HUD occlusion (the GH-447 journey-QA lesson,
  // DOM-over-canvas): from overhead the bed fills the viewport, so the
  // corner pockets project into the screen corners where phone HUD chrome
  // lives — measured: pocket rt lands under the FIRE pill on 844×390 with
  // safe-area insets. The parity law is therefore two-path (the
  // direct-manipulation doctrine): every CLEAR pocket registers by direct
  // tap, and the T032 picker — the sanctioned occlusion fallback — covers
  // the occluded remainder. Recorded on the GH-441 design record.
  const zones27 = await ev(`(() => {
    const cv = document.querySelector('body > canvas');
    const out = { clear: [], occluded: [] };
    (window.__rules?.pockets?.() ?? []).forEach((p, i) => {
      const s = window.__tp.projectK(p.x, p.y, 0.049);
      const el = s ? document.elementFromPoint(s.x, s.y) : null;
      if (el === cv) out.clear.push({ i, x: s.x, y: s.y });
      else out.occluded.push({ i, over: el ? (el.id || el.tagName) : 'offscreen' });
    });
    return out;
  })()`);
  check('S27 most pockets directly tappable from overhead '
    + '(≥ 4 of 6 project onto clean canvas)',
  zones27.clear.length >= 4, JSON.stringify(zones27));
  const pick27 = zones27.clear[zones27.clear.length - 1];
  if (pick27) {
    await tap(client, pick27.x, pick27.y);
    await sleep(300);
  }
  check(`S27 overhead direct pocket tap registers (pocket ${pick27?.i})`,
    !!pick27 && await ev(`window.__aim.call()?.pocket === ${pick27.i}`),
    JSON.stringify(await ev('window.__aim.call()')));
  await ev('window.__aim.clearCall(); true');
  await sleep(300);
  // the picker fallback reaches EVERY pocket from overhead — including the
  // FIRE-occluded corner (nominate pocket 5 through the T032 sheet)
  let ind27 = null;
  for (let i = 0; i < 20 && !ind27; i++) {
    const r = await ev(`window.__tp.el('#hud-call')`);
    if (r.found && r.visible) ind27 = r;
    else await sleep(150);
  }
  check('S27 call indicator visible (occlusion fallback opener)', !!ind27,
    JSON.stringify(ind27));
  if (ind27) {
    await tap(client, ind27.cx, ind27.cy);
    let sheet27 = null;
    for (let i = 0; i < 20 && !sheet27; i++) {
      const r = await ev(`window.__tp.el('#ob-pocket-picker')`);
      if (r.found && r.visible) sheet27 = r;
      else await sleep(150);
    }
    check('S27 picker sheet opens from overhead', !!sheet27,
      JSON.stringify(sheet27));
    if (sheet27) {
      const row27 = await ev(`(() => {
        const el = document.querySelector('#ob-pocket-picker [data-pocket="5"]');
        if (!el || !el.getClientRects().length) return null;
        const r = el.getBoundingClientRect();
        return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
      })()`);
      if (row27) {
        await tap(client, row27.cx, row27.cy);
        await sleep(400);
      }
      check('S27 picker nominates the HUD-occluded corner (pocket 5)',
        await ev('window.__aim.call()?.pocket === 5'),
        JSON.stringify(await ev('window.__aim.call()')));
    }
  }
  await ev('window.__aim.clearCall(); true');
  await sleep(200);

  // (c) two-finger orbit ESCAPE: overhead is a starting pose, not a lock —
  // an up-drag lifts phi off the register floor (touch.js phi -= dcy·GAIN)
  const e27a = await ev('window.__tp.orbit()');
  await twoFingerGesture(client,
    { from: { x: W * 0.40, y: H * 0.36 }, to: { x: W * 0.40, y: H * 0.36 - 120 } },
    { from: { x: W * 0.40, y: H * 0.72 }, to: { x: W * 0.40, y: H * 0.72 - 120 } },
    { steps: 16, stepMs: 16 });
  await sleep(300);
  const e27b = await ev('window.__tp.orbit()');
  check('S27 two-finger orbit escapes the register (phi departs the floor)',
    !!e27b && e27b.phi - e27a.phi > 0.2,
    `phi ${e27a?.phi} → ${e27b?.phi}`);

  // (d) aim view from overhead: re-home first, then engage — the chase
  // glides the rig down AND chases the fov home to 40 exactly
  await ev(`window.__settings.set('camera', 'overhead'); true`);
  await sleep(200);
  await ev('window.__aim.setAimView(true)');
  let fovHome27 = false;
  for (let i = 0; i < 30 && !fovHome27; i++) {
    await sleep(200);
    fovHome27 = await ev('window.__dbg.camera.fov === 40');
  }
  const av27 = await ev('window.__tp.orbit()');
  check('S27 aim view glides down from overhead (behind-shot pose)',
    !!av27 && av27.phi > 1.2, JSON.stringify(av27));
  check('S27 aim view chases the fov home (40 exact after settle)',
    fovHome27 === true, String(await ev('window.__dbg.camera.fov')));
  await ev('window.__aim.setAimView(false)');
  await sleep(300);

  // (e) BIH ghost placement from overhead (the sc10 recipe, one placement:
  // grouped scene with ball 3 on the table so the call is legal)
  await ev(`window.__settings.set('camera', 'overhead'); true`);
  await sleep(200);
  await scene8([{ id: 0, x: 0, y: -0.4 }, { id: 3, x: 0.45, y: 0.9 },
    { id: 8, x: 0.5, y: -0.8 }, ...FAR],
  { phase: 'grouped', groups: { 1: 'solids', 2: 'stripes' },
    shooter: 1, breaker: 1 });
  await ev('window.__rules?.call?.(3, 0)');
  const err27 = await ev(
    `__test.shoot({ v0: 0.35, phi: -Math.PI / 2, theta: 0, a: 0, b: 0 })`);
  check('S27 no-contact foul recipe accepted', !err27, String(err27));
  const st27 = await settleScripted('S27');
  check('S27 foul grants BALL_IN_HAND', st27 === 'BALL_IN_HAND', st27);
  const cue27 = await ev(`(() => {
    const b = window.__test.balls().find((x) => x.id === 0);
    return b ? window.__tp.project(b.pos[0], b.pos[1], b.pos[2]) : null;
  })()`);
  check('S27 cue ball projectable for the grab from overhead', !!cue27,
    JSON.stringify(cue27));
  if (cue27) {
    const sA27 = await ev('window.__tp.projectK(-0.3, -0.2)');
    const fA27 = { x: sA27.x, y: sA27.y + GHOST_OFFSET_PX };
    await touchStart(client, [{ x: cue27.x, y: cue27.y }]);
    await sleep(60);
    for (let i = 1; i <= 12; i++) {
      const t = i / 12;
      await touchMove(client, [{
        x: cue27.x + (fA27.x - cue27.x) * t,
        y: cue27.y + (fA27.y - cue27.y) * t,
      }]);
      await sleep(16);
    }
    await sleep(200);
    check("S27 overhead grab-zone drag classifies S3",
      await ev("window.__touch?.state?.() === 'S3'"));
    check('S27 ghost live + valid from overhead',
      await ev('window.__touch?.ghost?.()?.valid === true'),
      JSON.stringify(await ev('window.__touch?.ghost?.() ?? null')));
    await touchEnd(client, []);
    await sleep(250);
    const dist27 = await ev(`(() => {
      const b = window.__test.balls().find((x) => x.id === 0);
      return Math.hypot(b.pos[2] - (-0.3), b.pos[0] - (-0.2));
    })()`);
    check('S27 BIH places at the target from overhead (±0.035 m)',
      dist27 <= 0.035, `dist=${dist27}`);
  }
  check("S27 classifier back to S0", await ev("window.__touch?.state?.() === 'S0'"));

  // restore: leave the profile on the orbit default (re-homes the classic
  // pose — the sc6 explicit re-pose convention for anything after us)
  await ev(`window.__settings.set('camera', 'orbit'); true`);
  await sleep(300);
}

const SCENARIOS = [
  [1, 'boot on phone viewport', sc1],
  [2, 'tap neutrality', sc2],
  [16, 'tap-to-aim quick aim (issue #46)', sc16],
  [20, 'banner tap-to-dismiss + never-block (issue #71)', sc20],
  [3, 'relative aim drag', sc3],
  [4, 'fine parity', sc4],
  [5, 'second-finger law', sc5],
  [6, 'two-finger camera', sc6],
  [7, 'power gauge + spin popup', sc7],
  [8, 'explicit fire only', sc8],
  [9, 'pocket nomination (tap zones + picker fallback)', sc9],
  [10, 'BIH ghost placement', sc10],
  [25, 'BIH ring alignment on the rendered ball (issue GH-150)', sc25],
  [11, 'interruption hard-reset', sc11],
  [18, 'camera during motion (issue #69)', sc18],
  [19, 'in-gesture power precision (issue #70)', modeSafe(sc19)],
  [22, 'power-response curve (issue #142)', modeSafe(sc22)],
  [12, 'fullrack — scripted US1 8-ball rack', sc12, { explicit: true }],
  [13, 'replay/settings/share reachability', sc13],
  [14, 'rotate prompt', sc14],
  [15, 'help overlay on touch boot (024)', sc15],
  [17, 'long-press selection defense (issue #60)', sc17],
  [21, 'drill dock coarse taps (issue #120)', sc21],
  [26, 'drill rail column contract (issue GH-150)', sc26],
  [24, 'page-zoom lockdown (issue #145)', sc24],
  [27, 'overhead default register parity (GH-441)', sc27],
  [28, 'decision vs the settings sheet + Re-rack row gate (GH-1053/GH-990)', sc28],
];

const only = argOf('--scenario');
const list = only
  ? SCENARIOS.filter(([n, t]) => String(n) === only || t.includes(only))
  : SCENARIOS.filter((s) => !s[3]?.explicit);
if (!list.length) {
  console.error(`[e2e-touch] no scenario matches '${only}'`);
  process.exitCode = 1;
}

try {
  for (const [n, title, fn] of list) {
    const before = failures;
    console.log(`[e2e-touch] scenario ${n}: ${title}`);
    try {
      await fn();
    } catch (e) {
      check(`S${n} completed without harness exception`, false, e.message);
    }
    if (failures > before) {
      // lane-parameterized (GH-410 third leg): concurrent lanes' failure
      // shots must never overwrite each other
      const shotDir = laneArtifactDir('e2e-touch', CDP_PORT);
      const shot = `${shotDir}/s${n}.png`;
      try {
        fs.mkdirSync(shotDir, { recursive: true });
        await client.screenshot(shot);
        console.error('[e2e-touch] failure screenshot:', shot);
      } catch { /* page may be gone */ }
    }
  }

  check('zero console errors across the run', consoleErrors.length === 0,
    consoleErrors.slice(0, 5).join(' | '));
} finally {
  client.close();
  await stopStaticServer(server);
}

console.log(failures
  ? `[e2e-touch] FAIL (${failures} failing assertions)`
  : '[e2e-touch] ALL PASS');
process.exit(failures ? 1 : 0);
