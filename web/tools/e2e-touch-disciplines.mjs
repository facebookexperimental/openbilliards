// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-touch-disciplines.mjs — feature-014 US3 discipline-signature touch
// driver (contracts/touch-e2e.md §3.2, T031). Every PLAYER input in these
// scenarios is synthesized touch; scene/match shaping rides the same
// __test/__rules seams the desktop discipline suites pin.
//
//   node web/tools/e2e-touch-disciplines.mjs [--url http://…/app.html]
//                                            [--port 8263]
//                                            [--viewport 844x390]
//                                            [--scenario <n>]
//
// Harness (frozen recipe, touch-e2e.md §1): the in-house CDP client via
// web/tools/touch-cdp.mjs — Emulation.setDeviceMetricsOverride{mobile:true,
// deviceScaleFactor:3} + setTouchEmulationEnabled{maxTouchPoints:5} BEFORE
// Page.navigate; gestures via Input.dispatchTouchEvent (never
// setEmitTouchEventsForMouse). Coarse-pointer mechanism (RECORDED): the
// metrics/touch overrides flip matchMedia('(pointer: coarse)') on this
// Chrome build — verifyCoarse() re-proves it at boot and fails loudly with
// the --blink-settings=primaryPointerType=coarse fallback instructions if a
// build ever stops propagating it (see touch-cdp.mjs header).
//
// Scenario matrix (touch-e2e.md §3.2 — every row asserted):
//   1  snooker D placement    — the GH-382 miss prompt's "I play from
//                               here" tapped (the live default folds
//                               wpbsa-snooker-full), then a touch BIH
//                               drag: precise inside the D, radial clamp
//                               onto the D boundary (late-bound placeCueInD
//                               through the flow.js placement-rights wrap),
//                               snap-to-contact on an occupied spot with a
//                               VALID accent ghost (GH-370 class 3, WPA
//                               1.6/3.7), --ob-danger ghost tint on a
//                               genuinely-invalid squeeze (GH-416: reds
//                               pinched < 4r apart — no admissible contact
//                               candidate),
//                               the D marking decal present in the scene,
//                               and the snooker colour nomination by tap
//                               (pocket taps inert in nominate mode);
//                               issue #90: the nomination indicator is
//                               VISIBLE (≥44 pt) and opens the picker
//                               sheet listing colour rows only
//   2  carom break-spot       — decision options ≥44 pt, tap selects the
//                               spot, the placement lands there, and a
//                               touch drag snaps between the two UMB
//                               Art 23.1(c) start spots (generic S3 path)
//   3  8-ball / one-pocket    — pocket-marker tap composes the call; the
//                               pocket-picker sheet (status-strip call
//                               indicator) drives selectCallBall /
//                               nominatePocket / toggleSafety; one-pocket
//                               pocket assignment via the touch prompt
//   4  decision prompts ×7    — every rulebook decision kind of every
//                               discipline unclipped, options ≥44 pt,
//                               inside safe areas, at 844×390 AND 667×375
//                               × all 7 locales
//   5  10-ball push out       — GH-360: the #ob-push-btn FIRE-strip pill
//                               (touch-e2e.md §3.2 recorded deviation) —
//                               hidden on the break address, visible in
//                               the staged 6.4 window beside FIRE, a tap
//                               arms ([aim] pushOut wire, call kind
//                               'push', hud-call pill = call.pushOn),
//                               re-tap disarms, re-arm + FIRE tap runs
//                               the REAL rules path (legal touch-nothing
//                               push out → decision 12 prompt → decide →
//                               phase 'play', button gone). GH-380 arms:
//                               a target-BALL tap on the armed stance
//                               keeps its aim role only (push survives,
//                               [aim] pushKept wire); a POCKET tap
//                               supersedes LOUDLY (#hud-hint call.pushOff
//                               + chip transition + aria-pressed sync)
//
// Timing note (CI runner record, ci.yml e2e-touch job): unlike the
// e2e-touch gesture-law scenarios, NOTHING here reads wall-clock pointer
// velocity — S3 placement drags apply positions, taps are taps — so this
// suite is host-timing-insensitive (shot playbacks are bounded polls).
//
// Battery conventions (e2e-touch.mjs precedent): obtool boot stamp,
// hermetic Chrome profile, self-served web/ on a suite-unique verified-free
// port, zero-console-error gate, PASS/FAIL exit codes, /tmp screenshot on
// scenario failure, hard global watchdog.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  launchPhone, setPhoneMetrics, verifyCoarse, waitReady, sleep,
  touchStart, touchMove, touchEnd, touchCancel, tap, PAGE_HELPERS_JS,
} from './touch-cdp.mjs';
import fs from 'node:fs';
import {
  laneArtifactDir, spawnStaticServer, stopStaticServer,
} from './cdp.mjs';

// ---- frozen constants -------------------------------------------------------
const GHOST_OFFSET_PX = 56; // S3 up-screen finger offset (touch-input.md §3)
const LOCALES = ['en', 'de', 'es', 'fr', 'ja', 'ko', 'zh-CN'];
const SA = { top: 0, left: 47, right: 47, bottom: 21 }; // landscape-iPhone insets

// ---- snooker geometry (kernel-layout mirrors, e2e-snooker.mjs constants) ----
const BAULK_Y = -1.0475, D_R = 0.292; // WPBSA Sec1 R1(d)-(f)
// baked pot lane on the snooker table (e2e-snooker.mjs: pocket 5 capture
// centre; a free cue roll from LANE(0.5) scratches)
const CTR = { x: 0.9209965818486914, y: 1.8164965818486913 };
const ANCHOR = { x: 0.25, y: 1.0 };
const U = (() => {
  const dx = CTR.x - ANCHOR.x, dy = CTR.y - ANCHOR.y, n = Math.hypot(dx, dy);
  return { x: dx / n, y: dy / n };
})();
const SPHI = Math.atan2(U.y, U.x);
const SCRATCH_CUE = { x: CTR.x - U.x * 0.5, y: CTR.y - U.y * 0.5 };
const SPOT = { // colour spots (kernel rack.rs / sdk layouts.ts mirror)
  16: { x: 0.292, y: -1.0475 }, 17: { x: -0.292, y: -1.0475 },
  18: { x: 0, y: -1.0475 }, 19: { x: 0, y: 0 },
  20: { x: 0, y: 0.89225 }, 21: { x: 0, y: 1.4605 },
};
// GH-416 genuine-rejection probe (post-GH-370): two reds pinched 0.1 m
// apart (< 4r = 0.105 at the WPBSA 52.5 mm ball) in the D's left half —
// a request at the midpoint overlaps both, and EVERY projected contact
// candidate collides with the other red, so placeCueInD's shared
// resolvePlacement law refuses (the danger-ghost path the frozen snap
// removed from the lone-brown occupied-spot probe).
const PINCH_REDS = [{ id: 8, x: -0.235, y: -1.1 }, { id: 9, x: -0.135, y: -1.1 }];
const PINCH_MID = { x: -0.185, y: -1.1 };

// ---- carom geometry (kernel-layout mirror, e2e-carom.mjs constants) ---------
const CAROM_START = { xOff: 0.1825, y: -0.71 }; // UMB Art 23.1(c) start spots

// ---- args / ports -----------------------------------------------------------
const argOf = (flag) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const [W, H] = (argOf('--viewport') ?? '844x390').split('x').map(Number);
const PORT = Number(argOf('--port') ?? process.env.OB_E2E_PORT ?? 8263);
const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 16463);

// ---- watchdog (unref'd: never holds an otherwise-finished process) ----------
// GH-410 port inventory (declared 2026-09-07 under the GH-687 lint law, sized by the
// declared-vs-used reader: this suite launches no CDP offset above +0 and no http
// offset above +0): {'http': 1, 'cdp': 1} — the CI job's band width and pin tails are derived from it.
export const PORT_INVENTORY = { http: 1, cdp: 1 };
export const PORT_FLAGS = { '--port': 'http', '--viewport': 'none' };
const WATCHDOG_MS = Number(process.env.OB_E2E_WATCHDOG_MS ?? 420000);
let client = null;
let server = null;
setTimeout(() => {
  console.error(`[e2e-touch-disciplines] WATCHDOG: suite exceeded ${WATCHDOG_MS} ms — hard exit`);
  try { client?.close(); } catch { /* already gone */ }
  stopStaticServer(server); // sync group SIGTERM; the exit backstop finishes the reap
  process.exit(2);
}, WATCHDOG_MS).unref();

// ---- scoring ----------------------------------------------------------------
let failures = 0;
const check = (name, ok, detail = '') => {
  if (ok) console.log('[e2e-touch-disciplines] PASS', name);
  else {
    failures++;
    process.exitCode = 1;
    console.error('E2E-TOUCH-DISCIPLINES FAIL:', name + (detail ? ' — ' + detail : ''));
  }
};

// ---- boot -------------------------------------------------------------------
let url = argOf('--url');
if (!url) {
  const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  server = spawnStaticServer(webDir, PORT);
  await sleep(700);
  url = `http://127.0.0.1:${PORT}/app.html?seed=1`;
}
console.log(`[e2e-touch-disciplines] boot ${W}x${H} url=${url} cdp=${CDP_PORT}`);

const consoleErrors = [];
const consoleLogs = []; // GH-360 S5: the [aim] pushOut wire is a log line
const sawLog = (s) => consoleLogs.some((l) => l.includes(s));
client = await launchPhone(url, { cdpPort: CDP_PORT, width: W, height: H });
client.onEvent((method, params) => {
  if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
    consoleErrors.push(params.args.map((a) => a.value ?? a.description).join(' '));
  } else if (method === 'Runtime.consoleAPICalled') {
    consoleLogs.push(params.args.map((a) => a.value ?? a.description).join(' '));
  } else if (method === 'Runtime.exceptionThrown') {
    consoleErrors.push(params.exceptionDetails.exception?.description
      ?? params.exceptionDetails.text);
  } else if (method === 'Log.entryAdded' && params.entry.level === 'error') {
    consoleErrors.push(params.entry.text);
  }
});

// notch emulation (touch-e2e.md §4.1): landscape-iPhone insets, applied
// before the app settles so env(safe-area-inset-*) is live for the run
{
  const full = Object.fromEntries(Object.entries(SA)
    .flatMap(([k, v]) => [[k, v], [k + 'Max', v]]));
  try {
    await client.send('Emulation.setSafeAreaInsetsOverride', { insets: full });
  } catch {
    try { await client.send('Emulation.setSafeAreaInsetsOverride', full); } catch { /* flat/insets both unavailable — S4 asserts geometry against the frozen numbers anyway */ }
  }
}

const ev = (expr) => client.eval(expr);

check('app ready on phone-emulated boot', await waitReady(client));
await sleep(1200); // touch leaf loads post-boot (dynamic import)
check('coarse-pointer active at boot (frozen recipe)',
  await verifyCoarse(client).then(() => true,
    (e) => { console.error(e.message); return false; }));
await ev(PAGE_HELPERS_JS);
// Bounded poll, not a one-shot read: the touch leaf is a post-boot dynamic
// import, and a cold shared runner can still be fetching it after the fixed
// settle above (run 29098025192 failed the one-shot on both attempts while
// every later touch assertion passed).
check('touch mode installed (.ob-touch + __touch.installed)',
  await (async () => {
    for (let i = 0; i < 100; i++) {
      if (await ev(`document.documentElement.classList.contains('ob-touch')
        && window.__touch?.installed === true`)) return true;
      await sleep(150);
    }
    return false;
  })());

// ---- shared helpers ---------------------------------------------------------

/** Bounded settle of a scripted (scene-shaping) shot. */
async function settle(tag) {
  let s = await ev('__test.state()');
  for (let i = 0; i < 220 && (s === 'PLAYBACK' || s === 'SIMULATING'); i++) {
    await sleep(350);
    s = await ev('__test.state()');
    if (i % 40 === 39) console.log(`[e2e-touch-disciplines] ${tag}: settling (${s})`);
  }
  return s;
}

/** Bounded poll until fn() is truthy; returns the last value. */
async function poll(fn, tries = 40, ms = 150) {
  let v = null;
  for (let i = 0; i < tries; i++) {
    v = await fn();
    if (v) return v;
    await sleep(ms);
  }
  return v;
}

/** Decision-prompt option-button rects (visible prompt only). */
const promptButtons = () => ev(`(() => {
  const d = document.getElementById('hud-decision');
  if (!d || d.style.display !== 'block') return null;
  return [...d.querySelectorAll('.hd-btns button')].map((b) => {
    const r = b.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height,
      cx: r.x + r.width / 2, cy: r.y + r.height / 2,
      label: b.textContent };
  });
})()`);

/** Kernel position of a ball id, as { kx, ky } (three pos[2]=kx, pos[0]=ky). */
const kposOf = (id) => ev(`(() => {
  const b = window.__test.balls().find((x) => x.id === ${id});
  return b ? { kx: b.pos[2], ky: b.pos[0], pocketed: b.pocketed } : null;
})()`);

/** Touch BIH drag: grab the cue ball, walk the finger to target kernel
 * (kx, ky) + the GHOST_OFFSET_PX down-screen compensation, optionally keep
 * the finger down (lift: false → compose more moves / assertions).
 *
 * Grab discovery mirrors a fingertip: on the long snooker table the D
 * projects into the bottom-left band where the fine-aim cluster floats
 * under notch insets, and Chrome hit-tests touches with a CONTACT PATCH
 * (a press that point-tests to the canvas can still target adjacent
 * chrome). So candidate presses inside the 22 pt grab zone are PROBED —
 * press + a just-past-slop move, keep the one the classifier grabs (S3),
 * cancel any other (pointercancel is a clean no-op by the FSM laws). */
async function bihDragTo(kx, ky, { lift = true, from = null } = {}) {
  const sT = await ev(`window.__tp.projectK(${kx}, ${ky})`);
  if (!sT) return { ok: false, why: 'target not projectable' };
  const f = { x: sT.x, y: sT.y + GHOST_OFFSET_PX };
  let pos = from;
  if (!from) {
    const cue = await ev('window.__tp.ballScreen(0)');
    if (!cue?.found) return { ok: false, why: 'cue ball not projectable' };
    const cands = [[cue.x, cue.y]];
    for (const r of [12, 16, 21]) {
      for (let k = 0; k < 8; k++) {
        const a = k * Math.PI / 4;
        cands.push([cue.x + r * Math.cos(a), cue.y + r * Math.sin(a)]);
      }
    }
    for (const [gx, gy] of cands) {
      if (gx < 2 || gy < 2 || gx > W - 2 || gy > H - 2) continue;
      const n = Math.max(1, Math.hypot(f.x - gx, f.y - gy));
      const ux = (f.x - gx) / n;
      const uy = (f.y - gy) / n;
      await touchStart(client, [{ x: gx, y: gy }]);
      await sleep(40);
      await touchMove(client, [{ x: gx + ux * 6, y: gy + uy * 6 }]);
      await sleep(20);
      await touchMove(client, [{ x: gx + ux * 14, y: gy + uy * 14 }]);
      await sleep(60);
      if (await ev(`window.__touch?.state?.() === 'S3'`)) {
        pos = { x: gx + ux * 14, y: gy + uy * 14 };
        break;
      }
      await touchCancel(client);
      await sleep(80);
    }
    if (!pos) return { ok: false, why: 'no press point classified S3 inside the grab zone' };
  }
  for (let i = 1; i <= 12; i++) {
    const t = i / 12;
    await touchMove(client, [{ x: pos.x + (f.x - pos.x) * t, y: pos.y + (f.y - pos.y) * t }]);
    await sleep(16);
  }
  // Re-assert the endpoint until the applied cue position goes quiet: a
  // slow shared runner can drop the last interpolated move while the
  // previous placement validation is still in flight, leaving the ball at
  // an INTERMEDIATE clamp (run 29098025192: the D1 boundary clamp read
  // radius 0.247 of 0.292 on both attempts). Identical repeat moves are
  // clean no-ops for the FSM, so this stays a bounded settle, not a
  // behavior change.
  let lastPos = null;
  for (let i = 0; i < 6; i++) {
    await touchMove(client, [f]);
    await sleep(150);
    const now = await ev(`JSON.stringify(
      window.__test.balls().find((x) => x.id === 0)?.pos)`);
    if (now === lastPos) break;
    lastPos = now;
  }
  if (lift) {
    await touchEnd(client, []);
    await sleep(200);
  }
  return { ok: true, finger: f };
}

// ---- scenario 1: snooker D placement (touch-e2e.md §3.2 row 1) ---------------
async function sc1() {
  check('D1 snooker activates', await ev('window.__rules.activateSnooker()') === true);
  await sleep(800); // table rebuild broadcast + first frames

  // scene: the e2e-snooker S6 scratch recipe + brown ON its spot (inside
  // the D — the GH-370 frozen-snap probe), the GH-416 pinch pair (reds
  // 8/9, the genuine-rejection probe) in the D's left half, and blue at
  // centre table (the colour-nomination tap target)
  await ev(`__test.layout(${JSON.stringify([
    { id: 0, x: SCRATCH_CUE.x, y: SCRATCH_CUE.y },
    { id: 7, x: -0.6, y: 0.5 },
    ...PINCH_REDS,
    { id: 18, x: SPOT[18].x, y: SPOT[18].y },
    { id: 19, x: SPOT[19].x, y: SPOT[19].y },
    { id: 20, x: SPOT[20].x, y: SPOT[20].y },
    { id: 21, x: SPOT[21].x, y: SPOT[21].y },
  ])})`);
  await sleep(200);
  check('D1 snooker scene shaped', await ev(`window.__rules.setMatchState(${JSON.stringify(
    { phase: 'reds', ballOn: 'red', shooter: 1, scores: { 1: 0, 2: 0 } })})`) === true);
  await sleep(300);

  // scripted scratch (scene shaping): cue rolls up the baked lane into
  // pocket 5 → scratch foul. GH-382 decision 1 (the live-default flip):
  // an unpinned snooker frame now folds the wpbsa-snooker-full preset,
  // so the scratch's failure to first hit a ball on pends decision 17
  // FOUL AND A MISS (WPBSA Sec3 R14 — three options incl. the replace
  // arm) instead of v1's two-option R13 play-again. The v1 prompt shape
  // keeps its own coverage: scenario 4 stages `play_again` across all 7
  // locales below, and e2e-snooker's decision-7 block drives it live.
  const err = await ev(`__test.shoot({ v0: 1.5, phi: ${SPHI}, theta: 0, a: 0, b: 0 })`);
  check('D1 scratch shot accepted', !err, String(err));
  const s1 = await settle('D1 scratch');
  check('D1 scratch parks in AIM with the miss options', s1 === 'AIM', s1);
  check('D1 foul_and_a_miss pending (WPBSA Sec3 R14, the GH-382 default)',
    await ev(`window.__rules.matchState()?.pendingDecision?.kind`)
      === 'foul_and_a_miss');

  // the decision prompt is a touch surface: options ≥44 pt, tap choice 1
  // ("I play from here" — seats the incoming player on the D)
  const btns = await poll(promptButtons);
  check('D1 miss prompt shown with 3 options (Sec3 R14(b))',
    btns?.length === 3, JSON.stringify(btns));
  if (!btns?.length) return;
  check('D1 miss options ≥44 pt',
    btns.every((b) => Math.min(b.w, b.h) >= 43.5), JSON.stringify(btns));
  await tap(client, btns[0].cx, btns[0].cy);
  const st = await poll(async () =>
    (await ev('__test.state()')) === 'BALL_IN_HAND');
  check('D1 prompt tap grants BALL_IN_HAND', st === true,
    String(await ev('__test.state()')));
  check("D1 placement right is the D (never anywhere)",
    await ev('window.__rules.placementRight()') === 'd_zone');

  // the D visual affordance: the WPBSA marking decal (baulk line + D ring)
  // is part of the snooker table build — assert the D ring is in the scene
  // and visible on the phone camera (scene/table.js addMarkingDecals)
  const dRing = await ev(`(() => {
    const scene = window.__dbg?.scene;
    if (!scene) return null;
    let hit = null;
    scene.traverse((o) => {
      if (!hit && o.geometry?.type === 'RingGeometry'
        && Math.abs(o.position.x - (${BAULK_Y})) < 1e-3
        && Math.abs(o.position.z) < 1e-3) hit = { visible: o.visible };
    });
    return hit;
  })()`);
  check('D1 visual D affordance present (baulk D ring decal)',
    dRing?.visible === true, JSON.stringify(dRing));

  // touch drag 1: a point INSIDE the D is kept exactly (±0.035 m for the
  // screen-offset approximation)
  const A = { kx: -0.15, ky: BAULK_Y - 0.15 };
  const d1 = await bihDragTo(A.kx, A.ky, { lift: false });
  check('D1 in-D touch drag runs', d1.ok === true, d1.why ?? '');
  check("D1 grab-zone drag classifies S3",
    await ev("window.__touch?.state?.() === 'S3'"));
  let p = await kposOf(0);
  check('D1 in-D placement lands at the target (±0.035 m)',
    p && Math.hypot(p.kx - A.kx, p.ky - A.ky) <= 0.035, JSON.stringify(p));
  check('D1 ghost valid inside the D',
    await ev('window.__touch?.ghost?.()?.valid === true'));

  // touch drag 2 (finger still down): a mid-table request clamps RADIALLY
  // onto the D boundary — the late-bound placeCueInD path, not the kitchen
  const d2 = await bihDragTo(0.3, 0.2, { lift: false, from: d1.finger });
  check('D1 out-of-D drag runs', d2.ok === true, d2.why ?? '');
  p = await kposOf(0);
  const rad = p ? Math.hypot(p.kx, p.ky - BAULK_Y) : NaN;
  check('D1 out-of-D request clamps onto the D boundary (radius = 0.292)',
    Math.abs(rad - D_R) <= 1e-6 && p.ky <= BAULK_Y + 1e-6,
    `radius=${rad} pos=${JSON.stringify(p)}`);
  check('D1 clamped placement stays a VALID ghost (clamp, not rejection)',
    await ev('window.__touch?.ghost?.()?.valid === true'));

  // touch drag 3 (finger still down): ONE hop onto the brown's occupied
  // spot — GH-370 class 3 (WPA 1.6/3.7; placeCueInD adopts the same
  // snap-to-contact law with WPBSA Sec3 R5 zone composition): the request
  // SNAPS to the kernel-admissible contact separation instead of refusing
  // (pre-370 red-proof: the drag kept the last valid spot and the ghost
  // tinted --ob-danger — run 31137442929), and the landing stays ON/WITHIN
  // the D (Sec3 R5 inclusive). Mirrors e2e-touch.mjs S10 as re-baselined
  // in c02516dd; this file was missed in that sweep.
  const sBrown = await ev(`window.__tp.projectK(${SPOT[18].x}, ${SPOT[18].y})`);
  check('D1 occupied-spot drag runs', !!sBrown, 'brown spot not projectable');
  await touchMove(client, [{ x: sBrown.x, y: sBrown.y + GHOST_OFFSET_PX }]);
  await sleep(250);
  p = await kposOf(0);
  const rSn = await ev('window.__aim?.ballR?.() ?? 0.02625');
  const gapBrown = p
    ? Math.hypot(p.kx - SPOT[18].x, p.ky - SPOT[18].y) : NaN;
  check('D1 occupied-spot request snaps to the contact separation (WPA 1.6/3.7 via placeCueInD)',
    gapBrown >= 2 * rSn - 1e-9 && gapBrown <= 2 * rSn + 2e-4,
    `gap-2r=${gapBrown - 2 * rSn} pos=${JSON.stringify(p)}`);
  check('D1 snapped landing stays on/within the D (Sec3 R5 inclusive)',
    !!p && Math.hypot(p.kx, p.ky - BAULK_Y) <= D_R + 1e-6
      && p.ky <= BAULK_Y + 1e-6, JSON.stringify(p));
  check('D1 ghost stays valid on the frozen placement',
    await ev('window.__touch?.ghost?.()?.valid === true'));
  // GH-416: the CI red proved the SNAP path paints the accent ring (got
  // the accent oklch where the old arm wanted danger) — pin that tint so
  // the valid-ghost law stays on the token, not just the boolean
  const tintA = await ev(`(() => {
    const g = document.getElementById('ob-touch-ghost');
    if (!g) return null;
    const probe = document.createElement('div');
    probe.style.color = 'var(--ob-accent)';
    document.body.appendChild(probe);
    const want = getComputedStyle(probe).color;
    probe.remove();
    return { got: getComputedStyle(g).borderTopColor, want };
  })()`);
  check('D1 ghost ring keeps --ob-accent on the snapped placement',
    !!tintA && tintA.got === tintA.want, JSON.stringify(tintA));
  // determinism pin (overlap branch): the snap is a pure function of the
  // request + scene, so an IDENTICAL repeated touch request re-PROJECTS
  // to the same landing bit-exactly through the full touch pipeline.
  // Kernel x/y only (pos[0]/pos[2]) — pos[1] is the GH-143 drag-lift
  // render height and races render frames on a loaded runner (review r2).
  const kxy0 = `(() => {
    const b = window.__test.balls().find((x) => x.id === 0);
    return JSON.stringify([b.pos[0], b.pos[2]]);
  })()`;
  const snapBits = await ev(kxy0);
  await touchMove(client, [{ x: sBrown.x, y: sBrown.y + GHOST_OFFSET_PX }]);
  await sleep(250);
  check('D1 repeated occupied request re-projects to the same landing (kernel x/y bit)',
    await ev(kxy0) === snapBits);
  // class-3 replay-identity law (the KISS-BAND branch — review r1: the
  // repeat above only re-runs the overlap projection): a RECORDED snapped
  // landing re-applies VERBATIM. The exact landing coordinates — already
  // at 2r + eps ≥ 2r − KISS_TOL from the brown — must resolve to
  // THEMSELVES through the same late-bound placement wrap the touch drag
  // uses, never re-projected through rounding. Page-side in one eval so
  // no float crosses a serialization boundary.
  check('D1 recorded snapped landing re-applies VERBATIM (kiss-band replay identity, bit)',
    await ev(`(() => {
      const b = window.__test.balls().find((x) => x.id === 0);
      const kx = b.pos[2], ky = b.pos[0];
      const ok = window.__test.placeCue(kx, ky);
      const a = window.__test.balls().find((x) => x.id === 0);
      return ok === true && a.pos[2] === kx && a.pos[0] === ky;
    })()`) === true);

  // touch drag 4 (finger still down, GH-416): the gesture continues
  // cleanly past a snap — a plain in-D point lands precisely again. The
  // stage point sits directly below the pinch midpoint, the doorstep of
  // the genuine-rejection hop that follows.
  const REC = { kx: PINCH_MID.x, ky: -1.185 };
  const d4 = await bihDragTo(REC.kx, REC.ky,
    { lift: false, from: { x: sBrown.x, y: sBrown.y + GHOST_OFFSET_PX } });
  check('D1 post-snap recovery drag runs', d4.ok === true, d4.why ?? '');
  p = await kposOf(0);
  check('D1 recovery placement lands at the target (±0.035 m)',
    p && Math.hypot(p.kx - REC.kx, p.ky - REC.ky) <= 0.035, JSON.stringify(p));
  check('D1 ghost valid again on the recovery point',
    await ev('window.__touch?.ghost?.()?.valid === true'));

  // touch drag 5 (finger still down, GH-416): ONE hop into the PINCH
  // midpoint — a GENUINELY invalid placement under the snap law (every
  // projected contact candidate collides with the other pinched red, so
  // the shared resolvePlacement refuses): the ball keeps the last valid
  // position (bit) and the ghost tints --ob-danger. The rejection path
  // the pre-370 occupied-spot arms used to gate stays gated post-370.
  const before = await ev(kxy0); // kernel x/y pair (the review-r2 idiom)
  const sPinch = await ev(`window.__tp.projectK(${PINCH_MID.x}, ${PINCH_MID.y})`);
  check('D1 pinch-squeeze drag runs', !!sPinch, 'pinch midpoint not projectable');
  await touchMove(client, [{ x: sPinch.x, y: sPinch.y + GHOST_OFFSET_PX }]);
  await sleep(250);
  check('D1 genuinely-invalid squeeze keeps the last valid position (kernel x/y bit)',
    await ev(kxy0) === before);
  check('D1 ghost flags the rejection on the squeeze',
    await ev('window.__touch?.ghost?.()?.valid === false'));
  const tint = await ev(`(() => {
    const g = document.getElementById('ob-touch-ghost');
    if (!g) return null;
    const probe = document.createElement('div');
    probe.style.color = 'var(--ob-danger)';
    document.body.appendChild(probe);
    const want = getComputedStyle(probe).color;
    probe.remove();
    return { got: getComputedStyle(g).borderTopColor, want };
  })()`);
  check('D1 ghost ring tints --ob-danger on the rejected squeeze',
    !!tint && tint.got === tint.want, JSON.stringify(tint));
  await touchEnd(client, []);
  // #1159: the #143 drag-lift settle is PRESENTATION, an animation that can
  // outlast a fixed read under host load (it was read mid-settle once after
  // the old 250 ms sleep, the commit already final). Judge the drain: wait
  // (bounded: the last read comes 20 x 150 ms after the first) for the lift
  // latch to drain (state() null — phase idle) and mesh Y to settle at
  // cloth level, red by name if it never does.
  const latch = `(() => {
    const b = window.__test.balls().find((x) => x.id === 0);
    return { pos: b.pos, lift: window.__aim?.dragLift?.state?.() ?? null };
  })()`;
  const drained = (s) => s.lift === null && Math.abs(s.pos[1] - rSn) < 1e-9;
  let last = null;
  for (let i = 0; i <= 20 && !(last && drained(last)); i++) {
    if (i) await sleep(150);
    last = await ev(latch);
  }
  // row-15 commit law: the lift commits the LAST VALID position — the
  // rejected squeeze never moved it off the recovery point. COMMITTED
  // truth is kernel x/y (pos[2]/pos[0]) bit-compared against the mid-drag
  // snapshot; mesh Y is #143 drag-lift PRESENTATION (settled back to cloth
  // level after the lift), asserted by the drain row below (the last poll
  // and this read) — the e2e-touch S10 commit idiom.
  const kept = await ev(latch);
  const b0 = JSON.parse(before); // [pos[0], pos[2]] kernel pair
  check('D1 the #143 drag lift drains after the lift (phase idle, mesh Y at '
    + 'cloth level, within ~3 s — #1159)', drained(last) && drained(kept),
    JSON.stringify({ rSn, last, kept }));
  check('D1 lift commits the last valid position (kernel x/y bit — #143)',
    kept.pos[0] === b0[0] && kept.pos[2] === b0[1],
    JSON.stringify({ before: b0, kept }));
  check("D1 classifier back to S0", await ev("window.__touch?.state?.() === 'S0'"));

  // restage for the #84 ghost-window rows: the snapped landing sits ~2r
  // from the brown — much farther from the blue than the pre-370 refusal's
  // D-arc clamp point, which shrinks the blue's tap ghost window below the
  // 3-nudge fine-adjust band those rows pin. Re-park the cue on the same
  // D-arc address the refusal used to keep (the drag-2 clamp landing), so
  // the #84 geometry stays the one the laws were calibrated on.
  const d84 = await bihDragTo(0.3, 0.2);
  check('D1 #84 restage drag runs', d84.ok === true, d84.why ?? '');
  p = await kposOf(0);
  check('D1 #84 restage re-parks on the D-arc address (radius = 0.292)',
    !!p && Math.abs(Math.hypot(p.kx, p.ky - BAULK_Y) - D_R) <= 1e-6
      && p.ky <= BAULK_Y + 1e-6, JSON.stringify(p));

  // colour nomination by tap (WPBSA Sec3 R3(h)): shape colour_after_red,
  // then prove pocket taps are INERT in nominate mode and a colour tap
  // composes {kind:'nominate', ball}
  check('D1 colour_after_red shaped', await ev(
    `window.__rules.setMatchState({ phase: 'colour_after_red' })`) === true);
  const nom = await poll(() => ev('window.__aim.nominationRequired()'));
  check('D1 colour nomination required', nom === true);
  const pk = await ev('window.__tp.pocketScreen(5)');
  if (pk.found) {
    await tap(client, pk.x, pk.y);
    await sleep(300);
  }
  check('D1 pocket tap is inert in nominate mode (call stays null)',
    await ev('window.__aim.call()') === null);
  // issue #84 (touch-input.md §8.2 — snooker JOINS): park the aim provably
  // off the blue's line, so the colour tap below must nominate AND aim
  const park84 = await ev(`(() => {
    const balls = window.__test.balls();
    const c = balls.find((b) => b.id === 0);
    const t = balls.find((b) => b.id === 19);
    __test.aim(Math.atan2(t.pos[0] - c.pos[0], t.pos[2] - c.pos[2]) + 0.35);
    return window.__aim.aimLineBall();
  })()`);
  check('D1 #84 parked aim ray does not name the blue (precondition)',
    park84 !== 19, JSON.stringify(park84));
  const blue = await ev('window.__tp.ballScreen(19)');
  check('D1 blue projectable for the nomination tap', blue.found, JSON.stringify(blue));
  if (blue.found) {
    await tap(client, blue.x, blue.y);
    await sleep(300);
  }
  check('D1 colour tap composes {kind:nominate, ball:19}', await ev(`(() => {
    const c = window.__aim.call();
    return !!c && c.kind === 'nominate' && c.ball === 19;
  })()`), JSON.stringify(await ev('window.__aim.call()')));
  // issue #84: the SAME tap also coarse-aimed at the blue (bit-exact,
  // computed page-side over the same three-frame centers aim.js reads)
  check('D1 #84 colour tap also aims at the blue (phi bit-exact)',
    await ev(`(() => {
      const balls = window.__test.balls();
      const c = balls.find((b) => b.id === 0);
      const t = balls.find((b) => b.id === 19);
      return window.__aim.getPhi()
        === Math.atan2(t.pos[0] - c.pos[0], t.pos[2] - c.pos[2]);
    })()`) === true);
  if (blue.found) {
    // fine-adjust INSIDE the ghost window (3 × 0.05° nudges — the SC-005
    // ratchet), predicate-probed, then re-tap: the nomination refreshes
    // while the fine-tuned azimuth survives BIT-unchanged (§8.2 law)
    await ev('window.__touch.nudge(1); window.__touch.nudge(1); '
      + 'window.__touch.nudge(1); window.__e2e84phi = window.__aim.getPhi(); true');
    check('D1 #84 fine-adjusted aim still names the blue (ghost window)',
      await ev('window.__aim.aimLineBall()') === 19);
    await tap(client, blue.x, blue.y);
    await sleep(300);
    check('D1 #84 re-tap of the aimed blue: phi BIT-unchanged, nomination kept',
      await ev('window.__aim.getPhi() === window.__e2e84phi')
        && await ev('window.__aim.call()?.ball') === 19);
  }

  // issue #90: the nomination indicator IS the phone picker opener — it
  // must be VISIBLE in snooker (pre-#90 it sat inside the #hud-match
  // container hud.js hides for the discipline, killing the opener), be a
  // ≥44 pt target, and open the sheet listing COLOUR rows only (no
  // pockets, no safety — fillPicker's nominate branch)
  let ind90 = null;
  for (let i = 0; i < 20 && !ind90; i++) {
    const r = await ev(`window.__tp.el('#hud-call')`);
    if (r.found && r.visible) ind90 = r;
    else await sleep(150);
  }
  check('D1 #90 nomination indicator visible in snooker (picker opener)',
    !!ind90, JSON.stringify(ind90));
  if (ind90) {
    check('D1 #90 indicator ≥44 pt', Math.min(ind90.w, ind90.h) >= 43.5,
      JSON.stringify(ind90));
    await tap(client, ind90.cx, ind90.cy);
    let sheet90 = null;
    for (let i = 0; i < 20 && !sheet90; i++) {
      const r = await ev(`window.__tp.el('#ob-pocket-picker')`);
      if (r.found && r.visible) sheet90 = r;
      else await sleep(150);
    }
    check('D1 #90 picker sheet opens from the indicator', !!sheet90,
      JSON.stringify(sheet90));
    if (sheet90) {
      const rows = await ev(`(() => ({
        targets: document.querySelectorAll('#ob-picker-targets .ob-picker-ball').length,
        pockets: document.querySelectorAll('#ob-picker-pockets button').length,
        safety: getComputedStyle(document.getElementById('ob-picker-safety')).display,
      }))()`);
      // this scene laid out colours 18–21 only → 4 legal colour rows
      check('D1 #90 picker lists colour rows only (no pockets, no safety)',
        rows?.targets === 4 && rows?.pockets === 0 && rows?.safety === 'none',
        JSON.stringify(rows));
      // a colour row re-nominates and closes the sheet (fillPicker
      // nominate branch — declaration complete by itself)
      const row18 = await ev(`(() => {
        const el = document.querySelector('#ob-picker-targets [data-ball="18"]');
        if (!el || !el.getClientRects().length) return null;
        const r = el.getBoundingClientRect();
        return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
      })()`);
      check('D1 #90 brown row present in the sheet', !!row18, JSON.stringify(row18));
      if (row18) {
        await tap(client, row18.cx, row18.cy);
        await sleep(400);
        check('D1 #90 colour row re-nominates (call().ball === 18)',
          await ev(`window.__aim.call()?.ball === 18`),
          JSON.stringify(await ev('window.__aim.call()')));
        // #170: the sheet teardown rides an exit motion the degraded CI
        // runner lands SECONDS after the tap (the re-nomination above has
        // already committed by then) — poll the settled condition instead
        // of a one-shot read at +400 ms (run 30142877456: the ONLY failing
        // assertion, identical in both invocations).
        check('D1 #90 picker closes after the colour pick',
          await poll(async () =>
            (await ev(`window.__tp.el('#ob-pocket-picker')`)).visible !== true));
      }
    }
  }
}

// ---- scenario 2: carom break-spot decision (touch-e2e.md §3.2 row 2) ---------
async function sc2() {
  check('D2 carom entry accepted by setGame',
    await ev('window.__rules.setGame("carom_3cushion")') === true);
  await sleep(500);
  check('D2 carom activates (seeded rack)',
    await ev('window.__rules.caromActivate(5)') === true);
  await sleep(700); // staged break-address routing (macrotask)
  check('D2 break address routes to BALL_IN_HAND',
    await ev('__test.state()') === 'BALL_IN_HAND');
  check('D2 break_spot pending (UMB Art 23.1(c))',
    await ev('window.__rules.matchState()?.pendingDecision?.kind') === 'break_spot');

  const btns = await poll(promptButtons);
  check('D2 break-spot prompt shown with 2 options', btns?.length === 2,
    JSON.stringify(btns));
  if (!btns?.length) return;
  check('D2 break-spot options ≥44 pt',
    btns.every((b) => Math.min(b.w, b.h) >= 43.5), JSON.stringify(btns));

  // tap choice 2 = RIGHT start spot; the placement lands on the chosen spot
  await tap(client, btns[1].cx, btns[1].cy);
  const done = await poll(() =>
    ev('window.__rules.matchState()?.pendingDecision === null'));
  check('D2 option tap resolves the decision', done === true);
  check("D2 the chosen spot is recorded ('right')",
    await ev('window.__rules.matchState()?.breakSpot') === 'right',
    String(await ev('window.__rules.matchState()?.breakSpot')));
  let p = await kposOf(0);
  check('D2 placement lands on the RIGHT start spot',
    p && Math.abs(p.kx - CAROM_START.xOff) <= 1e-6
      && Math.abs(p.ky - CAROM_START.y) <= 1e-6, JSON.stringify(p));

  // generic S3 path on the carom right: a touch drag toward the left half
  // SNAPS to the LEFT start spot (flow.js carom_break wrap — zero
  // discipline-specific code in touch.js, research.md R9)
  const drag = await bihDragTo(-0.35, CAROM_START.y);
  check('D2 touch placement drag runs', drag.ok === true, drag.why ?? '');
  p = await kposOf(0);
  check('D2 touch drag snaps to the LEFT start spot (Art 23.1(c) clamp)',
    p && Math.abs(p.kx - (-CAROM_START.xOff)) <= 1e-6
      && Math.abs(p.ky - CAROM_START.y) <= 1e-6, JSON.stringify(p));
  check("D2 classifier back to S0", await ev("window.__touch?.state?.() === 'S0'"));
}

// ---- scenario 3: 8-ball + one-pocket nomination (§3.2 row 3) -----------------
async function sc3() {
  check('D3 eight_ball selectable',
    await ev(`window.__rules?.setGame?.('eight_ball')`) === true);
  await sleep(500);
  await ev(`__test.layout(${JSON.stringify([
    { id: 0, x: 0, y: -0.4 }, { id: 2, x: 0.45, y: 0.9 },
    { id: 9, x: -0.5, y: -1.0 }, { id: 8, x: 0.5, y: -0.8 },
  ])})`);
  await sleep(200);
  await ev(`window.__rules?.setMatchState?.(${JSON.stringify(
    { phase: 'open', shooter: 1, breaker: 1 })})`);
  const nom = await poll(() => ev('window.__aim.nominationRequired()'));
  check('D3 nomination required on the open table', nom === true);
  const marks = await poll(() =>
    ev('window.__aim.pocketMarks().some((m) => m.visible)'));
  check('D3 pocket marks visible for tapping', marks === true);

  // (a) enlarged-marker tap: pocket 5 disc → the call composes with the
  // default (lowest) legal ball
  const pk = await ev('window.__tp.pocketScreen(5)');
  check('D3 pocket 5 disc projectable', pk.found, JSON.stringify(pk));
  if (pk.found) {
    await tap(client, pk.x, pk.y);
    await sleep(300);
  }
  check('D3 marker tap composes the call {ball:2, pocket:5}', await ev(`(() => {
    const c = window.__aim.call();
    return !!c && c.kind === 'call' && c.ball === 2 && c.pocket === 5;
  })()`), JSON.stringify(await ev('window.__aim.call()')));

  // (a2) issue #84 (touch-input.md §8.2): a TARGET-BALL tap calls AND
  // coarse-aims — except when the aim ray's first ball already IS the
  // tapped ball (fine aim never overridden). Twins of the e2e-8ball S25f
  // desktop click arms over the same __aim.aimLineBall predicate probes.
  // park the aim provably OFF ball 2's line (scripted shaping seam)
  const park84 = await ev(`(() => {
    const balls = window.__test.balls();
    const c = balls.find((b) => b.id === 0);
    const t = balls.find((b) => b.id === 2);
    __test.aim(Math.atan2(t.pos[0] - c.pos[0], t.pos[2] - c.pos[2]) + 0.35);
    return window.__aim.aimLineBall();
  })()`);
  check('D3 #84 parked aim ray does not name ball 2 (precondition)',
    park84 !== 2, JSON.stringify(park84));
  const err84 = (id) => ev(`(() => {
    const balls = window.__test.balls();
    const c = balls.find((b) => b.id === 0);
    const t = balls.find((b) => b.id === ${id});
    let d = (Math.atan2(t.pos[0] - c.pos[0], t.pos[2] - c.pos[2])
      - window.__aim.getPhi()) % (2 * Math.PI);
    if (d > Math.PI) d -= 2 * Math.PI;
    if (d < -Math.PI) d += 2 * Math.PI;
    return Math.abs(d);
  })()`);
  const b2s = await ev('window.__tp.ballScreen(2)');
  check('D3 #84 ball 2 projectable', b2s.found, JSON.stringify(b2s));
  if (b2s.found) {
    await tap(client, b2s.x, b2s.y);
    await sleep(300);
    check('D3 #84 target tap calls AND aims (wrapped err = 0)',
      await err84(2) === 0 && await ev('window.__aim.call()?.ball') === 2,
      `err=${await err84(2)} call=${JSON.stringify(await ev('window.__aim.call()'))}`);
    // fine-adjust INSIDE the ghost window via the SC-005 nudge ratchet
    // (3 × 0.05° ≈ 0.0026 rad ≈ 3.6 mm lateral at 1.38 m — window 57 mm);
    // the predicate probe proves the delta stayed inside (never vacuous)
    await ev('window.__touch.nudge(1); window.__touch.nudge(1); '
      + 'window.__touch.nudge(1); window.__e2e84phi = window.__aim.getPhi(); true');
    check('D3 #84 fine-adjusted aim still names ball 2 (ghost window)',
      await ev('window.__aim.aimLineBall()') === 2);
    await tap(client, b2s.x, b2s.y);
    await sleep(300);
    check('D3 #84 re-tap of the aimed ball: phi BIT-unchanged, call kept',
      await ev('window.__aim.getPhi() === window.__e2e84phi')
        && await ev('window.__aim.call()?.ball') === 2);
  }
  const b9s = await ev('window.__tp.ballScreen(9)');
  check('D3 #84 ball 9 projectable', b9s.found, JSON.stringify(b9s));
  if (b9s.found) {
    await tap(client, b9s.x, b9s.y);
    await sleep(300);
    check('D3 #84 different-ball tap re-calls AND re-aims',
      await err84(9) === 0 && await ev('window.__aim.call()?.ball') === 9,
      `err=${await err84(9)} call=${JSON.stringify(await ev('window.__aim.call()'))}`);
  }
  check("D3 #84 classifier back to S0", await ev("window.__touch?.state?.() === 'S0'"));

  // (b) picker fallback: the status-strip call indicator opens the sheet;
  // a target-ball row re-selects the called ball (sheet stays open), a
  // pocket row completes the nomination (sheet closes)
  await ev('window.__aim.clearCall(); true');
  await sleep(300);
  const ind = await poll(async () => {
    const r = await ev(`window.__tp.el('#hud-call')`);
    return r.found && r.visible ? r : null;
  });
  check('D3 call indicator visible in the status strip', !!ind, JSON.stringify(ind));
  if (!ind) return;
  check('D3 call indicator ≥44 pt (picker opener)',
    Math.min(ind.w, ind.h) >= 43.5, JSON.stringify(ind));
  await tap(client, ind.cx, ind.cy);
  const sheet = await poll(async () => {
    const r = await ev(`window.__tp.el('#ob-pocket-picker')`);
    return r.found && r.visible ? r : null;
  });
  check('D3 picker sheet opens from the indicator tap', !!sheet, JSON.stringify(sheet));
  if (!sheet) return;
  const rows = await ev(`(() => {
    const geo = (el) => {
      const r = el.getBoundingClientRect();
      return { cx: r.x + r.width / 2, cy: r.y + r.height / 2,
        w: r.width, h: r.height };
    };
    const sheetEl = document.getElementById('ob-pocket-picker');
    return {
      pockets: [...sheetEl.querySelectorAll('[data-pocket]')]
        .map((el) => ({ pocket: Number(el.dataset.pocket), ...geo(el) })),
      balls: [...sheetEl.querySelectorAll('[data-ball]')]
        .map((el) => ({ ball: Number(el.dataset.ball), ...geo(el) })),
      safety: (() => {
        const el = document.getElementById('ob-picker-safety');
        return el && el.getClientRects().length ? geo(el) : null;
      })(),
    };
  })()`);
  check('D3 picker lists all six pockets', rows.pockets.length === 6,
    JSON.stringify(rows.pockets.map((r) => r.pocket)));
  check('D3 picker lists the legal call targets [2, 9]',
    rows.balls.map((b) => b.ball).sort().join(',') === '2,9',
    JSON.stringify(rows.balls));
  check('D3 picker rows ≥44 pt',
    [...rows.pockets, ...rows.balls, ...(rows.safety ? [rows.safety] : [])]
      .every((r) => Math.min(r.w, r.h) >= 43.5), JSON.stringify(rows));
  check('D3 safety row present', !!rows.safety);
  const ball9 = rows.balls.find((b) => b.ball === 9);
  if (ball9) {
    await tap(client, ball9.cx, ball9.cy);
    await sleep(300);
  }
  check('D3 ball row keeps the sheet open (pocket pick follows)',
    (await ev(`window.__tp.el('#ob-pocket-picker')`)).visible === true);
  const pocket2 = rows.pockets.find((r) => r.pocket === 2);
  if (pocket2) {
    await tap(client, pocket2.cx, pocket2.cy);
    await sleep(400);
  }
  check('D3 picker drives nominatePocket: call = {ball:9, pocket:2}', await ev(`(() => {
    const c = window.__aim.call();
    return !!c && c.kind === 'call' && c.ball === 9 && c.pocket === 2;
  })()`), JSON.stringify(await ev('window.__aim.call()')));
  const closed = await poll(async () =>
    (await ev(`window.__tp.el('#ob-pocket-picker')`)).visible !== true);
  check('D3 pocket row closes the sheet', closed === true);

  // (c) safety declaration through the picker, both directions
  await tap(client, ind.cx, ind.cy);
  const s2 = await poll(async () => {
    const r = await ev(`window.__tp.el('#ob-picker-safety')`);
    return r.found && r.visible ? r : null;
  });
  check('D3 picker reopens with the safety row', !!s2, JSON.stringify(s2));
  if (s2) {
    await tap(client, s2.cx, s2.cy);
    await sleep(400);
  }
  check("D3 safety row declares the safety",
    await ev(`window.__aim.call()?.kind`) === 'safety',
    JSON.stringify(await ev('window.__aim.call()')));
  await tap(client, ind.cx, ind.cy);
  const s3 = await poll(async () => {
    const r = await ev(`window.__tp.el('#ob-picker-safety')`);
    return r.found && r.visible ? r : null;
  });
  if (s3) {
    await tap(client, s3.cx, s3.cy);
    await sleep(400);
  }
  check('D3 safety row toggles back off (call cleared)',
    await ev('window.__aim.call()') === null
      && await ev('window.__aim.nominationRequired()') === true);

  // one-pocket pocket assignment (WPA 12.3) via the touch prompt
  check('D3 one_pocket stages (test seam)',
    await ev(`window.__rules.setGameForTest('one_pocket', 'onepocket-v1')`) === true);
  await sleep(700);
  check('D3 break_pocket pending on the fresh rack',
    await ev('window.__rules.matchState()?.pendingDecision?.kind') === 'break_pocket');
  const btns = await poll(promptButtons);
  check('D3 break-pocket prompt shown with 2 options', btns?.length === 2,
    JSON.stringify(btns));
  if (btns?.length === 2) {
    check('D3 break-pocket options ≥44 pt',
      btns.every((b) => Math.min(b.w, b.h) >= 43.5), JSON.stringify(btns));
    await tap(client, btns[1].cx, btns[1].cy);
    const assigned = await poll(() =>
      ev('window.__rules.matchState()?.pockets?.[1] === 5'));
    check('D3 tap assigns the foot-right pocket to the breaker (choice 2 → index 5)',
      assigned === true, JSON.stringify(await ev('window.__rules.matchState()?.pockets')));
  }
}

// ---- scenario 4: decision prompts ×7 locales at both viewports (§3.2 row 4) --
// Every rulebook decision kind of every discipline is rendered through the
// one #hud-decision surface (hud.js), shaped via the scripted match-state
// seams, and measured per locale: prompt inside the viewport AND the safe
// areas, every option ≥44 pt, no truncation/clipping.
const DECISION_KINDS = [
  ['eight_ball', ['dry_break', 'eight_legal_break', 'eight_foul_break',
    'break_foul', 'stalemate']],
  ['one_pocket', ['break_pocket', 'stalemate_lag']],
  ['snooker', ['play_again', 'respotted_black_toss']],
  ['carom_3cushion', ['break_spot']],
];
// locale-invariant discriminator per kind: every decision prompt carries its
// rulebook cite in ALL 7 locales (on the chooser row since GH-668 S5 slice 3
// G6 — decision.cite.*; the title is the question), so the poll can key on
// the KIND actually rendered (a title-delta poll races the locale re-render
// of the previous kind)
const KIND_CITE = {
  dry_break: '4.3(d)', eight_legal_break: '4.3(e)',
  eight_foul_break: '4.3(f)', break_foul: '4.3(g)', stalemate: '4.11',
  break_pocket: '12.3', stalemate_lag: '12.10',
  play_again: 'R13', respotted_black_toss: 'R4(b)', break_spot: '23.1(c)',
};

const measurePrompt = (w, h) => ev(`(() => {
  const d = document.getElementById('hud-decision');
  if (!d || d.style.display !== 'block') return { shown: false };
  const r = d.getBoundingClientRect();
  const issues = [];
  if (r.left < ${SA.left} - 1 || r.right > ${w - SA.right} + 1
      || r.top < ${SA.top} - 1 || r.bottom > ${h - SA.bottom} + 1) {
    issues.push('outside safe area [' + [r.left, r.top, r.right, r.bottom]
      .map((v) => v.toFixed(0)).join(',') + ']');
  }
  const btns = [...d.querySelectorAll('.hd-btns button')];
  if (!btns.length) issues.push('no option buttons rendered');
  for (const b of btns) {
    const br = b.getBoundingClientRect();
    if (Math.min(br.width, br.height) < 43.5) {
      issues.push('option <44pt (' + br.width.toFixed(0) + 'x'
        + br.height.toFixed(0) + '): ' + b.textContent);
    }
  }
  for (const el of [d, d.querySelector('.hd-title'),
    d.querySelector('.hd-chooser'), ...btns]) {
    if (el && (el.scrollWidth > el.clientWidth + 1
        || el.scrollHeight > el.clientHeight + 1)) {
      issues.push('clipped: ' + (el.className || el.tagName));
    }
  }
  return { shown: true, issues,
    title: d.querySelector('.hd-title').textContent,
    cite: d.querySelector('.hd-chooser').textContent };
})()`);

async function sc4() {
  for (const [w, h] of [[W, H], [667, 375]]) {
    if (w !== W || h !== H) {
      await setPhoneMetrics(client, { width: w, height: h });
      await sleep(800);
    }
    const vp = `${w}x${h}`;
    for (const [game, kinds] of DECISION_KINDS) {
      // (re)activate the discipline for this viewport pass
      let on = false;
      if (game === 'carom_3cushion') {
        on = await ev('window.__rules.setGame("carom_3cushion")') === true
          && await ev('window.__rules.caromActivate(5)') === true;
        await sleep(700); // the fresh rack pends break_spot naturally
      } else if (game === 'snooker') {
        on = await ev('window.__rules.activateSnooker()') === true;
        await sleep(700);
      } else if (game === 'one_pocket') {
        on = await ev(`window.__rules.setGameForTest('one_pocket', 'onepocket-v1')`) === true;
        await sleep(700);
      } else {
        on = await ev(`window.__rules.setGame('eight_ball')`) === true;
        await sleep(700);
      }
      check(`D4 [${vp}] ${game} active for the prompt sweep`, on === true);
      if (!on) continue;
      let prevTitle = '';
      for (const locale of LOCALES) {
        await ev(`window.__settings.set('language', '${locale}')`);
        await sleep(350);
        for (const kind of kinds) {
          if (game === 'carom_3cushion') {
            // break_spot is already pending on the fresh rack; the locale
            // switch re-renders it (hud.js onLocaleChange)
            await ev(`window.__rules.caromSetMatchState(${JSON.stringify(
              { pendingDecision: { kind, chooser: 1 } })})`);
          } else {
            await ev(`window.__rules.setMatchState(${JSON.stringify(
              { pendingDecision: { kind, chooser: 1 } })})`);
          }
          // the rendered prompt must be THIS kind (cite check) and, for the
          // per-locale repeat of a kind, freshly relabeled (title delta)
          const m = await poll(async () => {
            const r = await measurePrompt(w, h);
            return r.shown && r.title && r.cite.includes(KIND_CITE[kind])
              && r.title !== prevTitle ? r : null;
          }, 30, 100);
          prevTitle = m?.title ?? prevTitle;
          check(`D4 [${vp}] [${locale}] ${kind} prompt ≥44pt, unclipped, inside safe areas`,
            !!m && m.issues.length === 0,
            m ? m.issues.join('; ') : 'prompt never rendered');
        }
      }
      await ev(`window.__settings.set('language', 'en')`);
      await sleep(250);
      // clear the staged prompt before the next discipline
      if (game === 'carom_3cushion') {
        await ev(`window.__rules.caromSetMatchState({ pendingDecision: null })`);
      } else {
        await ev(`window.__rules.setMatchState({ pendingDecision: null })`);
      }
      await sleep(200);
    }
  }
  await setPhoneMetrics(client, { width: W, height: H });
  await sleep(500);
}

// ---- scenario 5: 10-ball push-out FIRE-strip button (GH-360; §3.2 row 5) -----
// The WPA 6.4 stance's phone surface is the touchwidgets #ob-push-btn pill
// on the FIRE strip (it replaced the GH-343 picker footer row — recorded
// disposition in touchwidgets.js). Window semantics (spec 026 §6.4): open
// exactly for the shot after a foul-free break, closed by any judged
// outcome/decision. The REAL window-opening path (legal dry break) is
// pinned by e2e-10ball S4; here the window is STAGED on the deterministic
// e2e-10ball S6 touch-nothing geometry so the touch legs stay
// host-timing-insensitive, and the stroke itself runs the REAL rules path
// (aim.js togglePush → flow.js setCall → crate pushOut → decision 12).
async function sc5() {
  // production selector path (e2e-10ball S1 precedent): a fresh ten_ball
  // rack sits in the break phase — the window is CLOSED, so the strip pill
  // must be hidden while the surface itself is already built.
  check('D5 ten_ball selectable',
    await ev(`window.__rules?.setGame?.('ten_ball')`) === true);
  await sleep(900); // rerack + table rebuild settle
  check('D5 fresh rack sits in the break phase',
    await poll(() => ev(`window.__rules.matchState()?.phase === 'break'`)) === true,
    JSON.stringify(await ev('window.__rules.matchState()?.phase')));
  const hidden0 = await ev(`window.__tp.el('#ob-push-btn')`);
  check('D5 push button BUILT but hidden on the break address (window closed)',
    hidden0.found === true && hidden0.visible !== true, JSON.stringify(hidden0));

  // stage the OPEN window on the S6 touch-nothing scene
  await ev(`__test.layout(${JSON.stringify([
    { id: 0, x: 0, y: 0 }, { id: 1, x: -0.5, y: 0.8 },
    { id: 9, x: -0.5, y: -1.0 },
  ])})`);
  await sleep(200);
  check('D5 pushout window staged', await ev(
    `window.__rules.setMatchState(${JSON.stringify({
      phase: 'pushout', shooter: 2, breaker: 1, onTable: [1, 9],
      consecutiveFouls: { 1: 0, 2: 0 }, pendingDecision: null,
      foulContext: null, result: null })})`) === true);
  const btn = await poll(async () => {
    const r = await ev(`window.__tp.el('#ob-push-btn')`);
    return r.found && r.visible ? r : null;
  });
  check('D5 push button visible in the 6.4 window', !!btn, JSON.stringify(btn));
  if (!btn) return;
  check('D5 push button ≥44 pt', Math.min(btn.w, btn.h) >= 43.5,
    JSON.stringify(btn));
  // boot-en label pin: this suite never switches locale, so an applyDom
  // pass that missed the root element would ship an EMPTY pill exactly
  // here (applyDom walks descendants only; the button is built labeled)
  check("D5 boot-en label = t('call.push') (never empty)",
    await ev(`(() => {
      const el = document.getElementById('ob-push-btn');
      return el.textContent === window.__i18n.t('call.push')
        && el.textContent.trim().length > 0;
    })()`) === true,
    String(await ev(`document.getElementById('ob-push-btn')?.textContent`)));
  const fire = await ev(`window.__tp.el('#shoot')`);
  check('D5 button sits immediately LEFT of the FIRE pill, on its band',
    fire.visible === true && btn.x + btn.w <= fire.x + 0.5
      && Math.abs(btn.cy - fire.cy) <= 2,
    JSON.stringify({ btn, fire }));

  // touch-tap ARMS the stance
  await tap(client, btn.cx, btn.cy);
  check('D5 tap arms the push out (call kind push)',
    await poll(() => ev(`window.__aim.call()?.kind === 'push'`)) === true,
    JSON.stringify(await ev('window.__aim.call()')));
  // aria-pressed follows on the NEXT frame (the signature-gated sync) —
  // poll, never a one-shot read in the same frame gap
  check('D5 armed button reflects aria-pressed=true',
    await poll(() => ev(`document.getElementById('ob-push-btn')
      .getAttribute('aria-pressed') === 'true'`)) === true);
  check('D5 [aim] pushOut armed wire printed',
    sawLog('[aim] pushOut {"armed":true}'));
  check('D5 hud-call pill reads the armed copy (call.pushOn)',
    await poll(() => ev(`(() => {
      const el = document.getElementById('hud-call');
      return !!el && el.getClientRects().length > 0
        && el.textContent.includes(window.__i18n.t('call.pushOn'));
    })()`)) === true,
    String(await ev(`document.getElementById('hud-call')?.textContent`)));

  // a second tap DISARMS (toggle law)
  await tap(client, btn.cx, btn.cy);
  check('D5 re-tap disarms (call cleared)',
    await poll(() => ev('window.__aim.call() === null')) === true,
    JSON.stringify(await ev('window.__aim.call()')));
  check('D5 disarmed button reflects aria-pressed=false',
    await poll(() => ev(`document.getElementById('ob-push-btn')
      .getAttribute('aria-pressed') === 'false'`)) === true);

  // ---- GH-380: scene taps vs the ARMED stance (phone register) --------------
  // Red/green arms for the silent-disarm defect: while {kind:'push'} is
  // armed, a target-BALL tap keeps its §8.2 call-aim AIM role only — the
  // stance SURVIVES (pre-fix the tap silently composed a call and dropped
  // the push, so FIRE played a normal shot the player never agreed to);
  // a POCKET tap supersedes the stance LOUDLY (#hud-hint line + #hud-call
  // chip transition + aria-pressed sync), never as a silent chip flip.
  await tap(client, btn.cx, btn.cy); // re-arm
  check('D5/380 stance re-armed for the scene-tap arms',
    await poll(() => ev(`window.__aim.call()?.kind === 'push'`)) === true);
  // park the aim provably OFF ball 1's line (the D3 #84 parking idiom), so
  // the ball tap's surviving AIM role is observable, never vacuous
  const park380 = await ev(`(() => {
    const balls = window.__test.balls();
    const c = balls.find((b) => b.id === 0);
    const t = balls.find((b) => b.id === 1);
    __test.aim(Math.atan2(t.pos[0] - c.pos[0], t.pos[2] - c.pos[2]) + 0.35);
    return window.__aim.aimLineBall();
  })()`);
  check('D5/380 parked aim ray does not name ball 1 (precondition)',
    park380 !== 1, JSON.stringify(park380));
  const b1s = await ev('window.__tp.ballScreen(1)');
  check('D5/380 ball 1 projectable for the tap', b1s.found === true,
    JSON.stringify(b1s));
  if (b1s.found) {
    await tap(client, b1s.x, b1s.y);
    await sleep(300);
    check('D5/380 ball tap keeps its AIM role (ray names ball 1)',
      await poll(() => ev('window.__aim.aimLineBall?.() === 1')) === true,
      JSON.stringify(await ev('window.__aim.aimLineBall?.()')));
    check('D5/380 the armed push SURVIVES the ball tap',
      await ev(`window.__aim.call()?.kind === 'push'`) === true,
      JSON.stringify(await ev('window.__aim.call()')));
    check('D5/380 [aim] pushKept wire printed',
      sawLog('[aim] pushKept {"ballTap":1}'));
    check('D5/380 button stays aria-pressed=true across the ball tap',
      await ev(`document.getElementById('ob-push-btn')
        .getAttribute('aria-pressed') === 'true'`) === true);
    check('D5/380 surviving stance stays QUIET (no hint line)',
      await ev(`document.getElementById('hud-hint')?.style.display
        !== 'block'`) === true,
      String(await ev(`document.getElementById('hud-hint')?.textContent`)));
  }
  // pocket tap: unambiguous normal-shot intent — supersedes, LOUDLY
  const pk380 = await ev('window.__tp.pocketScreen(5)');
  check('D5/380 pocket 5 disc projectable', pk380.found === true,
    JSON.stringify(pk380));
  if (pk380.found) {
    await tap(client, pk380.x, pk380.y);
    await sleep(300);
    check('D5/380 pocket tap supersedes the push (composed call takes over)',
      await poll(() => ev(`window.__aim.call()?.kind === 'call'`)) === true,
      JSON.stringify(await ev('window.__aim.call()')));
    check('D5/380 [aim] pushOut disarmed-by-pocket wire printed',
      sawLog('[aim] pushOut {"armed":false,"by":"pocket"}'));
    check("D5/380 LOUD: #hud-hint shows t('call.pushOff')",
      await poll(() => ev(`(() => {
        const el = document.getElementById('hud-hint');
        return !!el && el.style.display === 'block'
          && el.textContent === window.__i18n.t('call.pushOff');
      })()`)) === true,
      String(await ev(`document.getElementById('hud-hint')?.textContent`)));
    check('D5/380 #hud-call chip left the pushOn copy (transition visible)',
      await poll(() => ev(`(() => {
        const el = document.getElementById('hud-call');
        return !!el
          && !el.textContent.includes(window.__i18n.t('call.pushOn'));
      })()`)) === true,
      String(await ev(`document.getElementById('hud-call')?.textContent`)));
    check('D5/380 button aria-pressed=false after the pocket supersede',
      await poll(() => ev(`document.getElementById('ob-push-btn')
        .getAttribute('aria-pressed') === 'false'`)) === true);
  }
  await ev('window.__aim.clearCall(); true'); // hand a clean slate to the
  await sleep(200);                           //   FIRE leg below

  // re-arm + FIRE tap: the REAL rules path — the touch-nothing stroke is
  // legal ONLY as a push out (3.2/3.3 suspended) and pends decision 12
  await tap(client, btn.cx, btn.cy);
  check('D5 re-arm sticks',
    await poll(() => ev(`window.__aim.call()?.kind === 'push'`)) === true);
  await ev('__test.aim(0.3); true'); // scene shaping: the S6 aim/power pair
  await ev(`(() => { const p = document.getElementById('power');
    p.value = '0.4'; p.dispatchEvent(new Event('input', { bubbles: true }));
    return true; })()`);
  await tap(client, fire.cx, fire.cy);
  // the tap → hud.onShoot chain is async: prove the stroke LAUNCHED before
  // settling (settle() would read the still-AIM state as already settled)
  check('D5 FIRE tap launches the stroke',
    await poll(() => ev(`__test.state() !== 'AIM'`)) === true,
    String(await ev('__test.state()')));
  const st5 = await settle('D5 push out');
  check('D5 the push out parks in AIM with the option pending',
    st5 === 'AIM', st5);
  check('D5 decision 12 pushout_response pending',
    await ev(`window.__rules.matchState()?.pendingDecision?.kind`)
      === 'pushout_response',
    JSON.stringify(await ev('window.__rules.matchState()?.pendingDecision')));
  // the judged outcome CLOSED the window (spec 026 §6.4): a pending
  // decision derives no nomination, so the button hides before the choice
  check('D5 button hides once the outcome pends the decision',
    await poll(async () =>
      (await ev(`window.__tp.el('#ob-push-btn')`)).visible !== true) === true);
  const btns5 = await poll(promptButtons);
  check('D5 push-out prompt shown with 2 options', btns5?.length === 2,
    JSON.stringify(btns5));
  if (btns5?.length === 2) {
    check('D5 prompt options ≥44 pt',
      btns5.every((b) => Math.min(b.w, b.h) >= 43.5), JSON.stringify(btns5));
    await tap(client, btns5[1].cx, btns5[1].cy); // choice 2 (6.4): the
    check('D5 decision resolves',                //   chooser takes the table
      await poll(() =>
        ev('window.__rules.matchState()?.pendingDecision === null')) === true);
  }
  check("D5 the window is consumed (phase 'play')",
    await ev(`window.__rules.matchState()?.phase`) === 'play',
    JSON.stringify(await ev('window.__rules.matchState()?.phase')));
  const gone = await ev(`window.__tp.el('#ob-push-btn')`);
  check('D5 button gone after the decision (window closed for the rack)',
    gone.found === true && gone.visible !== true, JSON.stringify(gone));
}

// ---- registry + runner ------------------------------------------------------
const SCENARIOS = [
  [1, 'snooker D placement by touch', sc1],
  [2, 'carom break-spot decision by touch', sc2],
  [3, '8-ball / one-pocket nomination (taps + picker + safety)', sc3],
  [4, 'decision prompts ×7 locales at both phone viewports', sc4],
  [5, '10-ball push-out FIRE-strip button (GH-360)', sc5],
];

const only = argOf('--scenario');
const list = only
  ? SCENARIOS.filter(([n, t]) => String(n) === only || t.includes(only))
  : SCENARIOS;
if (!list.length) {
  console.error(`[e2e-touch-disciplines] no scenario matches '${only}'`);
  process.exitCode = 1;
}

try {
  for (const [n, title, fn] of list) {
    const before = failures;
    console.log(`[e2e-touch-disciplines] scenario ${n}: ${title}`);
    try {
      await fn();
    } catch (e) {
      check(`D${n} completed without harness exception`, false, e.message);
    }
    if (failures > before) {
      // lane-parameterized (GH-410 third leg — see e2e-touch.mjs)
      const shotDir = laneArtifactDir('e2e-touch-disciplines', CDP_PORT);
      fs.mkdirSync(shotDir, { recursive: true });
      const shot = `${shotDir}/s${n}.png`;
      try {
        await client.screenshot(shot);
        console.error('[e2e-touch-disciplines] failure screenshot:', shot);
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
  ? `[e2e-touch-disciplines] FAIL (${failures} failing assertions)`
  : '[e2e-touch-disciplines] ALL PASS');
process.exit(failures ? 1 : 0);
