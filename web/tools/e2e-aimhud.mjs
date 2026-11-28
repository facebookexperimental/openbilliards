// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-aimhud.mjs — aim/HUD controls & assists gate (build-20 QA: #1056,
// #1051, #1048, #1043), driven through REAL-USER boots (no obtool stamp: the
// hall opens at first paint) with real CDP input. Seams only STAGE positions
// or READ state; every judged moment is a real key, click or tap.
//
//   arms (F = also in the --fastlane subset):
//   K (#1056) a keyboard shot keeps focus. F: Enter on the focused Shoot
//      fires and, when aiming resumes, focus is back on Shoot with
//      :focus-visible; one more Enter takes exactly one more shot; a HELD
//      Enter (auto-repeat through playback and past the return, with a Shift
//      pressed mid-hold) fires exactly one shot. Full only: the ring in pixels (calibrated crop
//      pair); a fresh press after the release fires; Replay gets focus back;
//      a control the user tabbed to during playback keeps focus; answering
//      a break-foul decision prompt by keyboard returns focus to Shoot; a
//      mouse shot and a phone FIRE tap leave no forced ring.
//   S (#1051) the spin pad is a keyboard control. F: Tab order ELEVATION →
//      pad → CUE (both ways), AX slider with a "spin" name and a two-axis
//      value; arrows step a/b by 0.01 R (0.1 R with Shift), Home centres, a
//      held key clamps on the miscue disc, aim and power stay put; a
//      pointer press never focuses the pad and blurs a focused input (the
//      old focus law); the Help KEYBOARD row and the PLAYING A SHOT step.
//      Full only: the accent dot moves by (a/S)·r on BOTH pads and the
//      focused pad shows its ring (pixels).
//   P (#1048) Full assist + "Cue path after contact" Off ends the struck
//      ball's drawn path at the first contact. F: the data leg (the path
//      ends exactly at the ghost and never leaves the approach) with its
//      controls (Full + On draws past the contact; object paths and the
//      approach stay). Full only: pixel probes on the toggle-On route read
//      as bare felt (one pinned camera pose); carom two-cue second seat.
//   C (#1043) the call surfaces follow the 8-ball regime. F: WPA control
//      (call required + Safety; a no-call Shoot is refused); APA open table
//      (no call text, no CALL SHOT, no rings, no nomination; hit-tests);
//      APA on the 8 (mark-the-8 prompt and heading, no Safety, a Safety
//      press says why, a real click on the pocket marker composes the
//      call); the APA heading over a STALE cached dictionary is the localized
//      call heading with no data-i18n binding and no missing-key warning.
//      Full only: the call-line pixels, a no-call Shoot fires, the
//      marker brightens on screen, the pot wins with the APA cite; phone
//      register (no prompt on the open table; on the 8 the picker is titled
//      for the mark and has no Safety row; over a stale cached dictionary its
//      title and hint fall back to the localized call copy, unbound, silent).
//   C8-C11 (#1077, #1079; full only, phone register) the pocket picker: its
//      second open keeps the flex column and its gaps; with the sheet open,
//      a live locale switch (zh-CN → de → en) relabels the six pocket rows,
//      10-ball's No-call row stays "No call", and snooker's colour rows
//      follow (expected strings read from the locale files).
//
//   node web/tools/e2e-aimhud.mjs [--fastlane]   (needs Chrome + node >= 22;
//   --fastlane runs in ci.yml e2e-fastlane, the full suite in e2e-nightly)
import fs from 'node:fs';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  launchChrome, sleep, spawnStaticServer, stopStaticServer,
} from './cdp.mjs';
import { launchPhone, tap } from './touch-cdp.mjs';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.OB_E2E_PORT ?? 8473);
const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 16531);
// GH-410 port inventory: http +0; CDP +0 (desktop) and +1 (phone).
export const PORT_INVENTORY = { http: 1, cdp: 2 };
const fail = (msg) => { console.error('E2E-AIMHUD FAIL:', msg); process.exitCode = 1; };
const check = (name, ok, detail = '') => {
  if (ok) console.log('[e2e-aimhud] PASS', name);
  else fail(`${name}${detail ? ' — ' + detail : ''}`);
  return !!ok;
};
// --fastlane: the per-PR subset (ci.yml e2e-fastlane selection law: ≤ 60 s,
// deterministic, no pixel instruments) — desktop DOM/data arms only, still
// one planted-red-sensitive arm per issue; the full suite runs nightly
const FAST = process.argv.includes('--fastlane');
const T0 = Date.now();
const since = () => ((Date.now() - T0) / 1000).toFixed(1) + ' s';

// ---- static pre-flight (no browser): the help row's anchors + every key ---
{
  const hud = fs.readFileSync(path.join(webDir, 'app/hud.js'), 'utf8');
  const help = fs.readFileSync(path.join(webDir, 'app/help.js'), 'utf8');
  check('static: hud.js carries the K6 spin-key anchors (mappings.md §6)',
    hud.includes('TIP_KEY_STEP = 0.01') && hud.includes("e.key === 'Home'"));
  check('static: help.js lists the spin row in the keyboard section',
    /rows: \['aim', 'power', 'spin', 'view'/.test(help));
  const KEYS = ['hud.tipValue', 'help.controls.keyboard.spin.k',
    'help.controls.keyboard.spin.v', 'call.markEight', 'call.markEight.mouse',
    'call.markEight.touch', 'call.markEightHint', 'call.markEightHint.mouse',
    'call.markEightHint.touch'];
  const gaps = [];
  for (const loc of ['en', 'de', 'es', 'fr', 'ja', 'ko', 'zh-CN']) {
    const d = JSON.parse(fs.readFileSync(path.join(webDir, `app/locales/${loc}.json`), 'utf8'));
    for (const k of KEYS) if (typeof d[k] !== 'string' || !d[k]) gaps.push(`${loc}:${k}`);
  }
  check('static: the new keys exist in all 7 locales', gaps.length === 0, gaps.join(', '));
}

// ---- helpers ----------------------------------------------------------------
const KEYDEF = {
  Enter: { code: 'Enter', vk: 13, text: '\r' }, Tab: { code: 'Tab', vk: 9 },
  Escape: { code: 'Escape', vk: 27 }, Home: { code: 'Home', vk: 36 },
  ArrowLeft: { code: 'ArrowLeft', vk: 37 }, ArrowUp: { code: 'ArrowUp', vk: 38 },
  ArrowRight: { code: 'ArrowRight', vk: 39 }, ArrowDown: { code: 'ArrowDown', vk: 40 },
  '?': { code: 'Slash', vk: 191, text: '?', mods: 8 },
  Shift: { code: 'ShiftLeft', vk: 16, mods: 8 },
};
/** One real key event pair (or half of it): `type` 'down' | 'up' | both. */
async function key(c, name, { shift = false, autoRepeat = false, type } = {}) {
  const k = KEYDEF[name];
  const modifiers = (k.mods ?? 0) | (shift ? 8 : 0);
  const base = { key: name, code: k.code, windowsVirtualKeyCode: k.vk,
    nativeVirtualKeyCode: k.vk, modifiers };
  if (type !== 'up') {
    await c.send('Input.dispatchKeyEvent', k.text
      ? { type: 'keyDown', text: k.text, unmodifiedText: k.text, autoRepeat, ...base }
      : { type: 'rawKeyDown', autoRepeat, ...base });
  }
  if (type !== 'down') await c.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}
async function click(c, x, y) {
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
  await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
}
async function waitFor(c, expr, ms = 20000, step = 80) {
  const t0 = Date.now();
  for (;;) {
    const v = await c.eval(expr).catch(() => null);
    if (v) return v;
    if (Date.now() - t0 > ms) return null;
    await sleep(step);
  }
}
const rectOf = (c, sel) => c.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)});
  if (!e) return null; const r = e.getBoundingClientRect();
  return { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 }; })()`);
const AE = `(() => { const a = document.activeElement;
  return { id: a?.id || a?.tagName || null, fv: !!a?.matches?.(':focus-visible') }; })()`;
const STATE = '__test.state()';
const AIMING = `['AIM','BALL_IN_HAND'].includes(__test.state())`;
const SHOTS = '(__test.scenarios?.() ?? []).length';

/** Minimal PNG decode (8-bit RGB/RGBA, non-interlaced: the Chrome
 * screenshot shape; node zlib only — the e2e-cuepost decoder). */
function decodePng(buf) {
  let pos = 8, width = 0, height = 0, channels = 4;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      if (data[8] !== 8 || data[12] !== 0 || (data[9] !== 2 && data[9] !== 6)) {
        throw new Error('unsupported PNG shape');
      }
      channels = data[9] === 6 ? 4 : 3;
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);
  const paeth = (a, b, cc) => {
    const p = a + b - cc, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - cc);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : cc;
  };
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? out[y * stride + x - channels] : 0;
      const up = y > 0 ? out[(y - 1) * stride + x] : 0;
      const ul = y > 0 && x >= channels ? out[(y - 1) * stride + x - channels] : 0;
      let v = line[x];
      if (f === 1) v += left; else if (f === 2) v += up;
      else if (f === 3) v += (left + up) >> 1; else if (f === 4) v += paeth(left, up, ul);
      out[y * stride + x] = v & 0xff;
    }
  }
  return { width, height, channels, data: out };
}
/** Screenshot (CSS px at DPR 1) decoded; `clip` in CSS px. */
async function grab(c, clip) {
  const p = { format: 'png', captureBeyondViewport: false };
  if (clip) p.clip = { x: Math.round(clip.x), y: Math.round(clip.y), width: Math.round(clip.w), height: Math.round(clip.h), scale: 1 };
  const { data } = await c.send('Page.captureScreenshot', p);
  return decodePng(Buffer.from(data, 'base64'));
}
const px = (img, x, y) => {
  const o = (y * img.width + x) * img.channels;
  return [img.data[o], img.data[o + 1], img.data[o + 2]];
};
const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
/** Count of pixels whose max channel delta exceeds `t` (same-shape crops). */
function diffCount(a, b, t = 40) {
  if (a.width !== b.width || a.height !== b.height) return Infinity;
  let n = 0;
  for (let y = 0; y < a.height; y++) {
    for (let x = 0; x < a.width; x++) {
      const p = px(a, x, y), q = px(b, x, y);
      if (Math.max(Math.abs(p[0] - q[0]), Math.abs(p[1] - q[1]), Math.abs(p[2] - q[2])) > t) n++;
    }
  }
  return n;
}
/** Centroid of the pad's accent dot: blue-dominant pixels INSIDE the
 * cream face disc (radius `faceR` of the crop width — outside it the glass
 * shows the blue felt; the dashed danger ring is red, the crosshair
 * dark-neutral). */
function dotCentroid(img, faceR) {
  let sx = 0, sy = 0, n = 0;
  const cx = img.width / 2, cy = img.height / 2, rr = faceR * img.width;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) > rr) continue;
      const [r, g, b] = px(img, x, y);
      if (b > 150 && b - r > 50 && g > 100) { sx += x; sy += y; n++; }
    }
  }
  return n ? { x: sx / n, y: sy / n, n } : null;
}
/** Max |Δluminance| between two frames over the 5x5 window at (x, y) —
 * the line probe (a practice ink can be lighter OR darker than the felt). */
function maxDiff5(a, b, x, y) {
  let m = 0;
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const xx = Math.round(x) + dx, yy = Math.round(y) + dy;
      if (xx < 0 || yy < 0 || xx >= a.width || yy >= a.height) continue;
      m = Math.max(m, Math.abs(lum(px(a, xx, yy)) - lum(px(b, xx, yy))));
    }
  }
  return m;
}
/** Min luminance of the 5x5 window at (x, y). */
function minLum5(img, x, y) {
  let m = 255;
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const xx = Math.round(x) + dx, yy = Math.round(y) + dy;
      if (xx < 0 || yy < 0 || xx >= img.width || yy >= img.height) continue;
      m = Math.min(m, lum(px(img, xx, yy)));
    }
  }
  return m;
}
/** Kernel point (x, y, z) of a drawn preview line → CSS px through the live
 * camera matrices (preview.js writePoint: three = (ky, kz - r + LIFT, kx));
 * one synchronous page eval, so every point shares one rendered camera. */
const PROJECT_JS = `(pts) => {
  const cam = window.__dbg?.camera; if (!cam) return null;
  const r = __aim.ballR?.() ?? 0.028575, LIFT = 0.004;
  const V = cam.matrixWorldInverse.elements, P = cam.projectionMatrix.elements;
  const mul = (m, v) => [m[0]*v[0]+m[4]*v[1]+m[8]*v[2]+m[12]*v[3], m[1]*v[0]+m[5]*v[1]+m[9]*v[2]+m[13]*v[3],
    m[2]*v[0]+m[6]*v[1]+m[10]*v[2]+m[14]*v[3], m[3]*v[0]+m[7]*v[1]+m[11]*v[2]+m[15]*v[3]];
  const cv = window.__dbg?.renderer?.domElement;
  return pts.map(([kx, ky, kz]) => {
    const cc = mul(P, mul(V, [ky, kz - r + LIFT, kx, 1]));
    if (!(cc[3] > 0)) return null;
    const x = (cc[0] / cc[3] + 1) / 2 * innerWidth, y = (1 - cc[1] / cc[3]) / 2 * innerHeight;
    const hit = document.elementFromPoint(x, y);
    return { x, y, canvas: !!cv && hit === cv };
  });
}`;
const segDist = (p, a, b) => { // point→segment distance in the cloth plane
  const vx = b.x - a.x, vy = b.y - a.y, wx = p[0] - a.x, wy = p[1] - a.y;
  const L = vx * vx + vy * vy;
  const t = L > 0 ? Math.max(0, Math.min(1, (wx * vx + wy * vy) / L)) : 0;
  return Math.hypot(wx - t * vx, wy - t * vy);
};
async function settledPreview(c, tag) {
  const p = await waitFor(c, `(() => { const p = __aim.preview();
    return p && p.sig === __aim.previewSigNow() && !p.error ? p : null; })()`, 20000, 100);
  if (!p) fail(`${tag}: the preview never settled on the live aim`);
  return p;
}
/** The rendered camera's world matrix, rounded — the pixel legs compare
 * frames and project points only inside ONE camera pose. */
const CAM_SIG = `(() => { const e = window.__dbg?.camera?.matrixWorld?.elements;
  return e ? Array.from(e, (v) => v.toFixed(6)).join(',') : null; })()`;
/** Wait until the camera stops moving (a preset glides with damping): the
 * same matrix on three reads 150 ms apart. */
async function stillCamera(c, tag) {
  let prev = null, same = 0;
  for (let i = 0; i < 80; i++) {
    const sig = await c.eval(CAM_SIG);
    same = sig && sig === prev ? same + 1 : 0;
    if (same >= 2) return sig;
    prev = sig;
    await sleep(150);
  }
  fail(`${tag}: the camera never settled`);
  return prev;
}
/** GH-496 (inherited, #608): the adaptive ink can freeze against a mid-light-
 * up boot frame and paint a low-contrast line. Before a pixel frame of the
 * preview, re-latch it to the settled scene (a same-value brightness re-set,
 * the e2e-aim idiom) and wait for the static freeze. */
async function inkSettle(c, tag) {
  await c.eval(`__settings.set('brightness', __settings.get().brightness)`);
  await sleep(400);
  if (!(await waitFor(c, `__aim.adaptiveInk?.()?.staticFrozen === true`, 20000, 250))) fail(`${tag}: the preview ink never re-froze`);
}
/** Wait until the app delivered `n` more frames (aim.js derives the call
 * nomination and the preview on its frame hook) — never a fixed sleep. */
async function frames(c, n = 3, ms = 10000) {
  const f0 = await c.eval(`__test.renderedFrames?.() ?? null`);
  if (typeof f0 !== 'number') { fail('frames: __test.renderedFrames seam missing'); return false; }
  return !!(await waitFor(c, `__test.renderedFrames() >= ${f0 + n}`, ms, 40));
}
/** Serve `loc`'s dictionary MINUS the keys `dropRe` matches while armed —
 * a cached PRE-CHANGE active dictionary under a fresh module set (the
 * mixed-DICTIONARY pairing of the OWNERSHIP active-dictionary gate law;
 * the e2e-i18n STALE_DROP idiom). */
function staleDictionary(cc, loc, dropRe) {
  const d = JSON.parse(fs.readFileSync(path.join(webDir, `app/locales/${loc}.json`), 'utf8'));
  for (const k of Object.keys(d)) if (dropRe.test(k)) delete d[k];
  const body = Buffer.from(JSON.stringify(d)).toString('base64');
  const urlRe = new RegExp(`/app/locales/${loc.replace('-', '\\-')}\\.json`);
  let served = 0;
  cc.onEvent((method, params) => {
    if (method !== 'Fetch.requestPaused') return;
    if (urlRe.test(params.request.url)) {
      served += 1;
      cc.send('Fetch.fulfillRequest', { requestId: params.requestId, responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'application/json' }, { name: 'Cache-Control', value: 'no-store' }],
        body }).catch(() => {});
    } else cc.send('Fetch.continueRequest', { requestId: params.requestId }).catch(() => {});
  });
  return {
    arm: () => cc.send('Fetch.enable', { patterns: [{ urlPattern: `*/app/locales/${loc}.json*` }] }),
    disarm: () => cc.send('Fetch.disable'),
    served: () => served,
  };
}
// the i18n channel's missing-key warnings, recorded from now on
const WARN_REC = `(() => { window.__i18nW = []; if (!window.__i18nWHook) { window.__i18nWHook = 1;
  const w = console.warn.bind(console); console.warn = (...a) => {
    if (/\\[i18n\\] missing key/.test(String(a[0]))) window.__i18nW.push(String(a[0])); w(...a); }; } })()`;
// the keys #1043 added behind the active-dictionary gate (dropped by the stale legs)
const APA_DROP = /^(call\.markTitle|touch\.markPicker(Title|Hint))$/;
// GH-1077 / GH-1079: the open pocket picker, its pocket-row texts and its layout
const PICKER_OPEN = `(() => { const m = document.getElementById('ob-pocket-modal'); return !!m && m.style.display !== 'none'; })()`;
// KF-023 (#1233): a switch to a table whose transport loads on demand
// (snooker, cn8) stays PENDING while table.js imports it and then builds
// the table, and table.js holds #hud inert until READY: a tap on #hud-call
// meanwhile falls through and the opener never runs. C10 stages and taps
// only once the table is READY (the e2e-shell-switch seam)
const TABLE_READY = `window.__tableBuild?.status?.()?.status === 'READY'`;
const POCKET_ROWS = `[...document.querySelectorAll('#ob-picker-pockets [data-pocket]')].map((b) => b.textContent)`;
const PICKER_LAYOUT = `(() => { const pk = document.getElementById('ob-pocket-picker'), r = (id) => document.getElementById(id).getBoundingClientRect();
  return { display: getComputedStyle(pk).display, inline: pk.style.display,
    targetsToPockets: Math.round(r('ob-picker-pockets').top - r('ob-picker-targets').bottom),
    pocketsToClose: Math.round(r('ob-picker-close').top - r('ob-picker-pockets').bottom) }; })()`;
const localeCache = new Map();
/** A locale's shipped dictionary, read from the served tree (the expected side). */
const localeFile = (loc) => {
  if (!localeCache.has(loc)) localeCache.set(loc, JSON.parse(fs.readFileSync(path.join(webDir, `app/locales/${loc}.json`), 'utf8')));
  return localeCache.get(loc);
};
function watch(c, errs) {
  c.onEvent((method, params) => {
    if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
      errs.push(params.args.map((a) => a.value ?? a.description).join(' '));
    } else if (method === 'Runtime.exceptionThrown') {
      errs.push(params.exceptionDetails.exception?.description ?? params.exceptionDetails.text);
    }
  });
}
/** Real-user boot precondition: ready, hall open at play, arrival done. */
async function bootHall(c, tag) {
  if (!(await waitFor(c, 'window.__test?.ready === true', 60000, 200))) {
    fail(`${tag}: the real-user boot never became ready`); return false;
  }
  if (!(await waitFor(c, `window.__shell?.isOpen?.() === true && window.__shell.place() === 'play'`, 30000, 150))) {
    fail(`${tag}: the hall never presented the play place`); return false;
  }
  await waitFor(c, `window.__obShellArrival === 'done'`, 8000, 100);
  return true;
}
/** Stage 8-ball under `preset` on a fresh rack (seams: game, variant). */
async function stageEight(c, preset, tag) {
  if (await c.eval(`__rules.game()`) !== 'eight_ball') {
    if (await c.eval(`window.__settings.changeGame('eight_ball', { skipConfirm: true })`) !== true) {
      fail(`${tag}: changeGame(eight_ball) refused`); return false;
    }
    await waitFor(c, `__rules.game() === 'eight_ball' && ${AIMING}`, 30000);
  }
  await c.eval(`window.__settings.changeVariant('eight_ball', ${JSON.stringify(preset)})`);
  await c.eval(`__test.rerack(1)`).catch(() => null); // the variant lands on a fresh rack
  const want = preset === 'apa-8ball' ? `__rules.variant()?.preset === 'apa-8ball'`
    : `__rules.variant() === null || __rules.variant()?.preset !== 'apa-8ball'`;
  return !!(await waitFor(c, `${want} && ${AIMING}`, 20000));
}
const POT = { x: 0.38903252247502133, y: 0.7780650449500427 }; // e2e-variants straight pot
const PHI = 1.1071487177940904;
const FAR = [{ id: 9, x: -0.5, y: -1.0 }, { id: 12, x: 0.5, y: -1.0 }];
const CALL_SURF = `(() => { const s = (id) => { const e = document.getElementById(id);
    if (!e) return null; const cs = getComputedStyle(e), r = e.getBoundingClientRect();
    return { on: e.classList.contains('on'), shown: cs.display !== 'none' && r.width > 0 && r.height > 0,
      text: (e.textContent || '').replace(/\\s+/g, ' ').trim() }; };
  return { hudCall: s('hud-call'), awCall: s('aw-call'), awSafety: s('aw-safety'),
    nomReq: __aim.nominationRequired(), legal: __aim.legalTargets(),
    // the rings live in the call group: no group on screen = no ring
    rings: (__aim.pocketMarks()[0]?.visible === true) ? (__aim.ringInks?.() ?? []).length : 0,
    called: __rules.calledShot() }; })()`;

const server = spawnStaticServer(webDir, PORT);
await sleep(700);
const APP = `http://127.0.0.1:${PORT}/app.html`;
let desk = null, phone = null;
const deskErrs = [], phoneErrs = [];
console.log(`[e2e-aimhud] mode ${FAST ? 'fastlane (DOM/data subset)' : 'full'}`);

try {
  // ============================ DESKTOP (1440x900) ============================
  desk = await launchChrome(APP, { port: CDP_PORT, width: 1440, height: 900, tool: false });
  watch(desk, deskErrs);
  const c = desk;
  if (!(await bootHall(c, 'desktop'))) throw new Error('desktop boot failed');
  // cross the hall with a REAL click on "To the table"; park the mouse
  const qp = await rectOf(c, '#ob-shell-quickplay');
  if (!qp) throw new Error('no #ob-shell-quickplay');
  await click(c, qp.cx, qp.cy);
  if (!(await waitFor(c, `window.__shell?.isOpen?.() === false && ${AIMING}`, 20000))) {
    throw new Error('the hall never closed after To the table');
  }
  const park = () => c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 700, y: 520 });
  await park();
  await frames(c, 3);
  console.log(`[e2e-aimhud] desktop at the table (${since()})`);
  /** Arm isolation: close whatever a red leg left open, drop focus, park
   * the mouse — and prove it (no open listbox/dialog, focus on <body>). */
  const neutral = async (tag) => {
    await key(c, 'Escape');
    await c.eval(`window.__settings.close?.(); document.activeElement?.blur?.()`);
    await park();
    await frames(c, 2);
    const st = await c.eval(`(() => ({ ae: document.activeElement === document.body,
      listbox: [...document.querySelectorAll('[role=listbox]')].some((e) => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden'),
      shell: window.__shell?.isOpen?.() === true }))()`);
    check(`${tag}: arm isolation — no open listbox or hall, focus on <body>`, st.ae && !st.listbox && !st.shell, JSON.stringify(st));
  };

  // ---- K (#1056) ------------------------------------------------------------
  // short, quiet strokes: the cue ball and one object ball, low power
  const layoutK = [{ id: 0, x: 0, y: -0.5 }, { id: 1, x: 0.05, y: 0.1 }];
  const stageK = async () => {
    await c.eval(`__test.layout(${JSON.stringify(layoutK)})`);
    await c.eval(`__aim.aimAtBall(1); __aim.setPower(0.8)`);
    await waitFor(c, AIMING, 10000);
  };
  const shotFires = (tag) => waitFor(c, `__test.state() === 'PLAYBACK'`, 10000, 40);
  const backToAim = async (tag) => {
    const ok = await waitFor(c, AIMING, 60000);
    if (!ok) fail(`${tag}: aiming never resumed after the shot`);
    return !!ok;
  };
  await stageK();
  const shootClip = async () => { const r = await rectOf(c, '#shoot'); return { x: r.x - 4, y: r.y - 4, w: r.w + 8, h: r.h + 8 }; };
  await c.eval(`document.activeElement?.blur?.()`);
  await frames(c, 2);
  const noRing = FAST ? null : await grab(c, await shootClip());
  await key(c, 'Tab', { shift: true }); await key(c, 'Tab');
  let ae = await c.eval(AE);
  check('K0: Shift+Tab then Tab lands on #shoot with its ring', ae.id === 'shoot' && ae.fv, JSON.stringify(ae));
  let ring = null;
  if (!FAST) {
    await frames(c, 2);
    ring = await grab(c, await shootClip());
    const ringSeen = diffCount(ring, noRing);
    check('K0: pixel instrument — the ring crop differs from the no-ring crop', ringSeen >= 20, `differing px ${ringSeen}`);
  }
  await c.eval(`window.__k = []; for (const t of ['focusin','focusout']) document.addEventListener(t, (e) => window.__k.push(t + ':' + (e.target?.id || e.target?.tagName)), true)`);
  let shots0 = await c.eval(SHOTS);
  await key(c, 'Enter');
  const sawPb = await shotFires('K1');
  const pbAe = sawPb ? await c.eval(AE) : null;
  check('K1: Enter on Shoot fires the shot (PLAYBACK; Shoot disabled, focus fell)', !!sawPb && pbAe?.id !== 'shoot', JSON.stringify(pbAe));
  await backToAim('K1');
  ae = await c.eval(AE);
  check('K1: when aiming resumes focus is back on #shoot and :focus-visible',
    ae.id === 'shoot' && ae.fv, JSON.stringify({ ae, k: await c.eval('window.__k') }));
  if (!FAST) {
    await frames(c, 2);
    const after = await grab(c, await shootClip());
    const dRing = diffCount(after, ring), dNo = diffCount(after, noRing);
    check('K1: pixel — the post-shot Shoot crop shows the ring (near the ring crop, far from the no-ring crop)',
      dRing * 3 < dNo && dNo >= 20, `vs ring ${dRing} px, vs no-ring ${dNo} px`);
  }
  check('K1: exactly one shot fired', (await c.eval(SHOTS)) === shots0 + 1);
  shots0 = await c.eval(SHOTS);
  await key(c, 'Enter');
  check('K2: a second Enter on the restored Shoot fires', !!(await shotFires('K2')));
  await backToAim('K2');
  check('K2: exactly one more shot, focus back on #shoot',
    (await c.eval(SHOTS)) === shots0 + 1 && (await c.eval(AE)).id === 'shoot');
  // held Enter: auto-repeat from the press through playback and 1 s past
  // the return — and a Shift pressed mid-hold after focus came back (review
  // r1 P2: an unrelated fresh keydown must not release the Enter guard)
  await stageK();
  await c.eval(`document.getElementById('shoot').focus()`);
  shots0 = await c.eval(SHOTS);
  await key(c, 'Enter', { type: 'down' });
  let back = null, replayedPb = false, reps = 0, shifted = false;
  const holdStart = Date.now();
  while (Date.now() - holdStart < 70000) {
    await key(c, 'Enter', { type: 'down', autoRepeat: true }); reps++;
    const st = await c.eval(STATE);
    if (back === null && Date.now() - holdStart > 300 && (st === 'AIM' || st === 'BALL_IN_HAND')) back = Date.now();
    if (back !== null && st === 'PLAYBACK') replayedPb = true;
    if (back !== null && !shifted && Date.now() - back > 250) {
      await key(c, 'Shift', { type: 'down' }); // a fresh, unrelated keydown on the restored Shoot
      shifted = true;
    }
    if (back !== null && Date.now() - back > 1200) break;
    await sleep(33);
  }
  await key(c, 'Enter', { type: 'up' });
  if (shifted) await key(c, 'Shift', { type: 'up' });
  check('K3: a held Enter (auto-repeat through playback + 1.2 s past the return, a Shift press mid-hold) fires exactly one shot',
    back !== null && shifted && !replayedPb && (await c.eval(SHOTS)) === shots0 + 1,
    JSON.stringify({ back: back !== null, shifted, replayedPb, reps, shots: (await c.eval(SHOTS)) - shots0 }));
  check('K3: the restored Shoot still holds focus after the held key', (await c.eval(AE)).id === 'shoot');
  if (!FAST) {
    // a fresh press after the release still shoots (the guard never eats a deliberate press)
    await key(c, 'Enter');
    check('K3: a fresh Enter after the release fires', !!(await shotFires('K3')));
    await backToAim('K3');
    // Replay: Tab to Replay, Enter; focus returns to Replay
    await key(c, 'Tab');
    ae = await c.eval(AE);
    if (ae.id === 'replay') {
      await key(c, 'Enter');
      const rp = await shotFires('K4');
      await backToAim('K4');
      ae = await c.eval(AE);
      check('K4: after a keyboard Replay focus is back on #replay (or #shoot), never <body>',
        !!rp && (ae.id === 'replay' || ae.id === 'shoot'), JSON.stringify(ae));
    } else fail('K4: Tab from the restored Shoot did not reach #replay: ' + JSON.stringify(ae));
    // focus the user moves during playback stays there: a real Tab to the
    // next live control (it stays focusable when aiming resumes)
    await stageK();
    await c.eval(`document.getElementById('shoot').focus()`);
    await key(c, 'Enter');
    if (await shotFires('K5')) {
      await key(c, 'Tab');
      const moved = await c.eval(AE);
      await backToAim('K5');
      await frames(c, 3);
      ae = await c.eval(AE);
      check('K5: a control the user tabbed to during playback keeps focus when aiming resumes',
        moved.id && moved.id !== 'BODY' && moved.id !== 'shoot' && ae.id === moved.id, JSON.stringify({ moved, ae }));
    } else fail('K5: the shot never fired');
    // the decision prompt still restores to Shoot (GH-465 restoreTo): a
    // keyboard break that scratches pends break_foul; Enter answers it
    await neutral('K5b');
    if (await stageEight(c, 'wpa-8ball', 'K5b')) {
      await c.eval(`__test.layout(${JSON.stringify([{ id: 0, x: 0.45, y: 1.0 }, { id: 1, x: -0.4, y: -0.8 }, { id: 8, x: -0.3, y: -0.5 }])})`);
      await c.eval(`__rules.setMatchState(${JSON.stringify({ phase: 'break', groups: null, shooter: 1, breaker: 1 })})`);
      await c.eval(`__test.aim(Math.atan2(1.2951447171389936 - 1.0, 0.6601447171389936 - 0.45)); __aim.setPower(1.5); __test.setElevation(0); __test.setTip(0, 0)`);
      await frames(c, 2);
      await c.eval(`document.getElementById('shoot').focus()`);
      await key(c, 'Enter');
      await shotFires('K5b');
      const prompt = await waitFor(c, `(() => { const d = document.getElementById('hud-decision');
        const a = document.activeElement; return d && getComputedStyle(d).display !== 'none' && d.contains(a) ? (a.textContent || '').trim() : null; })()`, 60000);
      if (prompt) {
        await key(c, 'Enter');
        await waitFor(c, `__rules.matchState()?.pendingDecision === null && ${AIMING}`, 10000);
        ae = await waitFor(c, `document.activeElement?.id === 'shoot' ? 'shoot' : null`, 3000);
        check('K5b: answering the decision prompt by keyboard returns focus to #shoot', ae === 'shoot',
          JSON.stringify({ prompt, ae: await c.eval(AE) }));
      } else fail('K5b: the break-foul decision prompt never took focus');
    } else fail('K5b: 8-ball (WPA) never staged');
    await c.eval(`window.__settings.changeGame('nine_ball', { skipConfirm: true })`);
    await waitFor(c, `__rules.game() === 'nine_ball' && ${AIMING}`, 30000);
    // a mouse shot from a pointer-modality start (nothing focused): one
    // shot, and the restore keeps the click's ring state — no ring
    await stageK();
    await c.eval(`document.activeElement?.blur?.()`);
    await park();
    check('K6: precondition — nothing focused before the click', (await c.eval(AE)).id === 'BODY');
    shots0 = await c.eval(SHOTS);
    const sb = await rectOf(c, '#shoot');
    await click(c, sb.cx, sb.cy);
    await park();
    await shotFires('K6');
    const k6back = await backToAim('K6');
    ae = await c.eval(AE);
    check('K6: a mouse click on Shoot fires exactly one shot; no ring is forced afterwards',
      k6back && (await c.eval(SHOTS)) === shots0 + 1 && !(ae.id === 'shoot' && ae.fv), JSON.stringify(ae));
  }
  console.log(`[e2e-aimhud] K done (${since()})`);

  // ---- S (#1051) ------------------------------------------------------------
  await neutral('S');
  const tipVal = () => c.eval(`(() => { const t = document.getElementById('tip');
    const m = (t.getAttribute('aria-valuetext') || '').match(/-?\\d+\\.\\d+/g) || [];
    return { a: Number(t.getAttribute('aria-valuenow')), b: Number(m[1]), text: t.getAttribute('aria-valuetext'),
      max: Number(t.getAttribute('aria-valuemax')), phi: __aim.getPhi(),
      power: document.getElementById('power').value }; })()`);
  await c.eval(`__test.setTip(0, 0); document.getElementById('elev').focus()`);
  await key(c, 'Tab');
  const onPad = await c.eval(AE);
  await key(c, 'Tab');
  const nextStop = await c.eval(`(() => { const a = document.activeElement; return { id: a?.id || a?.tagName, inCueRow: !!a?.closest?.('#cue-row') }; })()`);
  await key(c, 'Tab', { shift: true });
  const backOn = await c.eval(AE);
  await key(c, 'Tab', { shift: true });
  const prevStop = await c.eval(AE);
  check('S1: Tab order ELEVATION → spin pad → CUE, and back (Shift+Tab)',
    onPad.id === 'tip' && onPad.fv && nextStop.inCueRow && backOn.id === 'tip' && prevStop.id === 'elev',
    JSON.stringify({ onPad, nextStop, backOn, prevStop }));
  await key(c, 'Tab');
  // accessibility node: interactive role + a name with "spin" + a value
  const { root } = await c.send('DOM.getDocument', { depth: 0 });
  const { nodeId } = await c.send('DOM.querySelector', { nodeId: root.nodeId, selector: '#tip' });
  const ax = (await c.send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false })).nodes
    .find((n) => !n.ignored);
  const vt0 = (await tipVal()).text;
  check('S1: AX node is a slider named "…spin…" with a value and a two-axis value text',
    ax?.role?.value === 'slider' && /spin/i.test(ax?.name?.value ?? '')
    && ax?.value?.value !== undefined && /^side -?\d\.\d{3} R, top -?\d\.\d{3} R$/.test(vt0 ?? ''),
    JSON.stringify({ role: ax?.role?.value, name: ax?.name?.value, value: ax?.value?.value, vt0 }));
  const v0 = await tipVal();
  const padClip = async (sel) => { const r = await rectOf(c, sel); return { x: r.x, y: r.y, w: r.w, h: r.h }; };
  let tipBefore = null, awBefore = null;
  if (!FAST) {
    await frames(c, 2);
    tipBefore = dotCentroid(await grab(c, await padClip('#tip')), 0.40);
    awBefore = dotCentroid(await grab(c, await padClip('#aw-spin')), 0.42);
  }
  for (let i = 0; i < 4; i++) await key(c, 'ArrowRight');
  let v = await tipVal();
  check('S2: ArrowRight x4 raises a by 0.04 R; b, aim and power unchanged',
    Math.abs(v.a - (v0.a + 0.04)) < 1e-9 && v.b === v0.b && v.phi === v0.phi && v.power === v0.power, JSON.stringify({ v0, v }));
  const readAt = (val) => waitFor(c, `(document.getElementById('aw-read')?.textContent || '')
    .replace(/\\s+/g, ' ').includes('a ${val.toFixed(3)} R')`, 5000);
  check('S2: the aim-widget readout agrees', !!(await readAt(v0.a + 0.04)),
    await c.eval(`document.getElementById('aw-read')?.textContent`));
  for (let i = 0; i < 4; i++) await key(c, 'ArrowUp');
  v = await tipVal();
  check('S2: ArrowUp x4 raises b by 0.04 R', Math.abs(v.b - (v0.b + 0.04)) < 1e-6 && Math.abs(v.a - (v0.a + 0.04)) < 1e-9, JSON.stringify(v));
  await key(c, 'ArrowLeft', { shift: true });
  v = await tipVal();
  check('S2: Shift+ArrowLeft steps 0.1 R', Math.abs(v.a - (v0.a - 0.06)) < 1e-9, JSON.stringify(v));
  await key(c, 'Home');
  v = await tipVal();
  check('S2: Home centres the tip (a = b = 0)', v.a === 0 && v.b === 0, JSON.stringify(v));
  // a held key clamps on the commanded miscue disc
  await key(c, 'ArrowUp', { shift: true });
  for (let i = 0; i < 14; i++) await key(c, 'ArrowRight', { shift: true, autoRepeat: i > 0 });
  v = await tipVal();
  check('S3: a held Shift+ArrowRight clamps on the disc a² + b² ≤ cap² (cap = 0.5·S)',
    v.a > 0 && v.a * v.a + v.b * v.b <= v.max * v.max + 2e-3 && v.a > v.max - 0.12, JSON.stringify(v));
  check('S3: aim and power never moved while the pad held the keys', v.phi === v0.phi && v.power === v0.power, JSON.stringify(v));
  await key(c, 'Home');
  if (!FAST) {
    // pixels: the accent dot moves right on BOTH pads (a = 0.2)
    for (let i = 0; i < 2; i++) await key(c, 'ArrowRight', { shift: true });
    v = await tipVal();
    await readAt(0.2);
    await frames(c, 2);
    const tipAfter = dotCentroid(await grab(c, await padClip('#tip')), 0.40);
    const awAfter = dotCentroid(await grab(c, await padClip('#aw-spin')), 0.42);
    const S = 2 * v.max; // the miscue scale: dial full deflection = 0.5·S
    const wantTip = (0.2 / S) * 0.42 * 92, wantAw = (0.2 / S) * 0.44 * 92;
    const okDot = (b, a, want) => !!b && !!a && Math.abs((a.x - b.x) - want) < 1.6 && Math.abs(a.y - b.y) < 1.2;
    check('S4: pixel — the accent dot moves right by (a/S)·r on #tip and #aw-spin',
      okDot(tipBefore, tipAfter, wantTip) && okDot(awBefore, awAfter, wantAw),
      JSON.stringify({ tipBefore, tipAfter, wantTip, awBefore, awAfter, wantAw }));
    const ringClip = async () => { const r = await rectOf(c, '#tip'); return { x: r.x - 7, y: r.y - 7, w: r.w + 14, h: r.h + 14 }; };
    const padRing = await grab(c, await ringClip());
    await c.eval(`document.getElementById('tip').blur()`);
    await frames(c, 2);
    const padNoRing = await grab(c, await ringClip());
    check('S4: pixel — the focused pad shows a ring', diffCount(padRing, padNoRing) >= 40, `differing px ${diffCount(padRing, padNoRing)}`);
  }
  // a pointer press keeps the pre-keyboard focus law: it moves the tip, never
  // focuses the pad, and blurs a focused input (POWER) — arrows then aim
  await c.eval(`document.getElementById('power').focus()`);
  const tr = await rectOf(c, '#tip');
  await click(c, tr.cx - 12, tr.cy + 10);
  await park();
  v = await tipVal();
  const aeS5 = await c.eval(AE);
  await key(c, 'ArrowRight');
  const vS5 = await tipVal();
  check('S5: a pointer press moves the tip, focuses nothing (POWER blurred), and ArrowRight then aims',
    aeS5.id === 'BODY' && v.a < 0 && v.b < 0 && vS5.phi !== v.phi && vS5.a === v.a && vS5.power === v.power,
    JSON.stringify({ aeS5, v, vS5 }));
  // Help: the KEYBOARD section lists the pad row (gated row, fresh dictionary)
  await c.eval(`document.activeElement?.blur?.()`);
  await key(c, '?');
  const row = await waitFor(c, `(() => { const tr = document.querySelector('tr[data-gated="help.controls.keyboard.spin"]');
    if (!tr || tr.hidden || tr.children.length !== 2 || !tr.getClientRects().length) return null;
    const flow = [...document.querySelectorAll('#ob-help-panel [data-i18n="help.flow.spin.d"]')].map((e) => e.textContent).join(' ');
    return { k: tr.firstElementChild.textContent.trim(), v: tr.lastElementChild.textContent.trim(), flow,
      wk: window.__i18n.t('help.controls.keyboard.spin.k'), wv: window.__i18n.t('help.controls.keyboard.spin.v') }; })()`, 10000, 100);
  check('S6: Help KEYBOARD paints the cue-ball pad row from the dictionary; PLAYING A SHOT names the arrow keys',
    !!row && row.k === row.wk && row.v === row.wv && /Home/.test(row.v) && /arrow keys/.test(row.flow), JSON.stringify(row));
  await key(c, 'Escape');
  await c.eval(`__test.setTip(0, 0)`);
  console.log(`[e2e-aimhud] S done (${since()})`);

  // ---- P (#1048) ------------------------------------------------------------
  await neutral('P');
  const R = await c.eval(`__aim.ballR?.() ?? 0.028575`);
  // a clear half-ball cut on ball 3; two far balls keep the table honest
  const layoutP = [{ id: 0, x: 0.1, y: -0.55 }, { id: 3, x: 0.02, y: 0.15 }, { id: 9, x: -0.55, y: -1.15 }, { id: 5, x: 0.55, y: -1.15 }];
  await c.eval(`__test.layout(${JSON.stringify(layoutP)})`);
  await c.eval(`__test.setCamera('top')`);
  await c.eval(`__settings.set('assist', 'practice'); __settings.set('assistCuePath', true)`);
  await c.eval(`__aim.aimAtBall(3); __test.aim(__aim.getPhi() + 0.035); __aim.setPower(2.5)`);
  const pOn = await settledPreview(c, 'P on');
  // distance of a path vertex from the drawn APPROACH polyline (cue → ghost)
  const offApproach = (q, pts) => {
    let m = Infinity;
    for (let i = 1; i < pts.length; i++) {
      m = Math.min(m, segDist(q, { x: pts[i - 1][0], y: pts[i - 1][1] }, { x: pts[i][0], y: pts[i][1] }));
    }
    return m;
  };
  const pathOn = await c.eval('__aim.practicePath(0)');
  const ghostOn = pOn?.ghost;
  const farOn = (pathOn ?? []).map((q) => offApproach(q, pOn.points));
  check('P0: control — Full + On draws the struck ball past the contact (> 3R off the approach), first contact = ball 3',
    !!ghostOn && pOn.contact?.ball === 3 && Math.max(...farOn) > 3 * R,
    JSON.stringify({ ghostOn, contact: pOn?.contact, maxOff: Math.max(...farOn) }));
  let camOn = null, shotOn = null;
  if (!FAST) {
    await inkSettle(c, 'P on');
    camOn = await stillCamera(c, 'P on');
    await frames(c, 2);
    shotOn = await grab(c);
  }
  const ids = await c.eval(`__test.balls().filter((b) => !b.pocketed && b.id !== 0).map((b) => b.id)`);
  const otherPaths = [];
  for (const id of ids) otherPaths.push(...((await c.eval(`__aim.practicePath(${id})`)) ?? []));
  await c.eval(`__settings.set('assistCuePath', false)`);
  const pOff = await settledPreview(c, 'P off');
  const pathOff = await c.eval('__aim.practicePath(0)');
  const last = pathOff?.at(-1);
  const offDist = (pathOff ?? []).map((q) => offApproach(q, pOff.points));
  check('P1: Full + Off — the struck ball path ends exactly at the ghost and never leaves the approach (≤ R)',
    !!last && Math.hypot(last[0] - pOff.ghost.x, last[1] - pOff.ghost.y) < 1e-9 && Math.max(...offDist) <= R,
    JSON.stringify({ last, ghost: pOff?.ghost, maxOff: Math.max(...offDist) }));
  const inks = await c.eval('__aim.previewInks()');
  check('P1: control — the object ball path and the approach line stay drawn',
    (inks.practice ?? []).some((x) => x.ball === pOff.contact?.ball)
    && ((await c.eval(`__aim.practicePath(${pOff.contact?.ball})`)) ?? []).length > 0
    && (await c.eval('__aim.previewVisible()')) === true && pOff.cuePost === null,
    JSON.stringify({ practice: inks.practice?.map((x) => x.ball), contact: pOff.contact }));
  if (!FAST) {
    await inkSettle(c, 'P full off');
    const camFullOff = await stillCamera(c, 'P full off');
    await frames(c, 2);
    const shotFullOff = await grab(c);
    await c.eval(`__settings.set('assist', 'standard')`);
    await settledPreview(c, 'P standard');
    await inkSettle(c, 'P standard off');
    const camStdOff = await stillCamera(c, 'P standard off');
    await frames(c, 2);
    const shotStdOff = await grab(c);
    // probe points on the toggle-On after-contact route: ≥ 20 px from every
    // ball, ≥ 14 px from every other drawn line (each other ball's Full path,
    // the approach), over the canvas, and on bare felt in the Standard frame
    const afterPts = (pathOn ?? []).filter((q, i) => farOn[i] > 2 * R);
    const camProj = await c.eval(CAM_SIG);
    check('P2: pixel instrument — the three frames and the projection share ONE camera pose',
      !!camOn && camOn === camFullOff && camOn === camStdOff && camOn === camProj);
    const proj = await c.eval(`(${PROJECT_JS})(${JSON.stringify(afterPts)})`);
    const others = (await c.eval(`(${PROJECT_JS})(${JSON.stringify([...otherPaths, ...pOn.points])})`)).filter(Boolean);
    const ballsPx = await c.eval(`__test.balls().filter((b) => !b.pocketed).map((b) => __aim.ballScreen(b.id)).filter(Boolean)`);
    const keep = (proj ?? []).filter((q) => q && q.canvas
      && ballsPx.every((bp) => Math.hypot(q.x - bp.x, q.y - bp.y) >= 20)
      && others.every((o) => Math.hypot(q.x - o.x, q.y - o.y) >= 14)
      && minLum5(shotStdOff, q.x, q.y) > 80);
    const rows = keep.map((q) => ({ x: Math.round(q.x), y: Math.round(q.y),
      on: Math.round(maxDiff5(shotOn, shotStdOff, q.x, q.y)), off: Math.round(maxDiff5(shotFullOff, shotStdOff, q.x, q.y)) }));
    const inked = rows.filter((r) => r.on > 30).length;
    const bare = rows.filter((r) => r.off <= 10).length;
    if (check('P2: pixel instrument — ≥ 10 clear cloth probes on the after-contact route', keep.length >= 10, `kept ${keep.length}/${afterPts.length}`)) {
      check('P2: pixel control — Full + On inks the after-contact route (≥ 80 % of probes)', inked >= 0.8 * rows.length, `${inked}/${rows.length}`);
      check('P2: pixel — Full + Off reads as bare felt there: within 10 luminance levels of Standard + Off at every probe',
        bare === rows.length, `${bare}/${rows.length}; worst ${JSON.stringify([...rows].sort((p1, p2) => p2.off - p1.off)[0])}`);
    }
  }
  await c.eval(`__settings.set('assist', 'standard'); __settings.set('assistCuePath', true); __test.setCamera('default')`);
  console.log(`[e2e-aimhud] P done (${since()})`);

  // ---- C (#1043) desktop ----------------------------------------------------
  await neutral('C');
  const openTable = [{ id: 0, x: 0, y: -0.6 }, { id: 2, x: 0.3, y: 0.4 }, { id: 8, x: -0.2, y: 0.6 }, { id: 11, x: 0.1, y: 0.9 }];
  const OPEN = { phase: 'open', groups: null, shooter: 1, breaker: 1 };
  const GROUPED_ON8 = { phase: 'grouped', groups: { 1: 'solids', 2: 'stripes' }, shooter: 1, breaker: 1 };
  // the 8 straight into the foot-left corner: the mirrored e2e-variants pot,
  // so the target marker sits in the default view's clear field
  const ON8 = [{ id: 0, x: 0, y: 0 }, { id: 8, x: -POT.x, y: POT.y }, ...FAR];
  const stage = async (cc, layout, ms) => {
    await cc.eval(`__test.layout(${JSON.stringify(layout)})`);
    const ok = await cc.eval(`__rules.setMatchState(${JSON.stringify(ms)})`);
    await waitFor(cc, `__rules.matchState()?.phase === ${JSON.stringify(ms.phase)}`, 5000);
    await frames(cc, 3); // aim.js re-derives the nomination on its frame hook
    return ok;
  };
  if (await stageEight(c, 'wpa-8ball', 'C-wpa')) {
    await stage(c, openTable, OPEN);
    await c.eval(`__aim.aimAtBall(2)`);
    const w = await waitFor(c, `(() => { const s = ${CALL_SURF}; return s.hudCall?.on ? s : null; })()`, 5000);
    check('C0: WPA control — "call required" + CALL SHOT + Safety on the open table',
      !!w && w.hudCall.text === (await c.eval(`__i18n.t('call.required.mouse')`)) && w.awCall.on && w.awSafety.shown && w.nomReq,
      JSON.stringify(w));
    const wpaRects = { hud: await rectOf(c, '#hud-call'), aw: await rectOf(c, '#aw-call') };
    const wpaCrop = FAST ? null : await grab(c, { x: wpaRects.hud.x, y: wpaRects.hud.y, w: wpaRects.hud.w, h: wpaRects.hud.h });
    const sb2 = await rectOf(c, '#shoot');
    await click(c, sb2.cx, sb2.cy);
    await park();
    const refused = await waitFor(c, `(document.getElementById('hud-hint')?.textContent ?? '').includes(__i18n.t('flow.callRequired')) ? { st: __test.state() } : null`, 5000);
    check('C0: WPA — a no-call Shoot is refused with the call-required hint', !!refused && refused.st !== 'PLAYBACK', JSON.stringify(refused));
    if (await stageEight(c, 'apa-8ball', 'C-apa')) {
      await stage(c, openTable, OPEN);
      await c.eval(`__aim.aimAtBall(2)`);
      await frames(c, 3);
      const regime = await c.eval('__rules.callRegime?.() ?? null');
      const a = await c.eval(CALL_SURF);
      check('C1: APA open table — no call text, no CALL SHOT (its Safety inside), no rings, no nomination',
        regime?.callShot === 'eight_only' && !a.hudCall.on && !a.hudCall.shown && !a.awCall.on && !a.awSafety.shown
        && !a.nomReq && a.legal.length === 0 && a.rings === 0, JSON.stringify({ regime, a }));
      const hits = await c.eval(`(() => { const ids = ['hud-call', 'aw-call', 'aw-safety'];
        return ${JSON.stringify([wpaRects.hud, wpaRects.aw])}.map((r) => { const h = document.elementFromPoint(r.cx, r.cy);
          return h ? ids.some((id) => h.closest('#' + id)) : false; }); })()`);
      check('C1: hit-test — where WPA painted the call line and CALL SHOT box, APA hits no call element', hits.every((h) => !h), JSON.stringify(hits));
      if (!FAST) {
        const apaCrop = await grab(c, { x: wpaRects.hud.x, y: wpaRects.hud.y, w: wpaRects.hud.w, h: wpaRects.hud.h });
        check('C1: pixel — the WPA call-line rectangle no longer shows its text under APA', diffCount(apaCrop, wpaCrop) >= 30, `diff ${diffCount(apaCrop, wpaCrop)}`);
        const sb3 = await rectOf(c, '#shoot');
        await click(c, sb3.cx, sb3.cy);
        await park();
        check('C2: APA — a no-call Shoot fires (the existing gate, pinned)', !!(await shotFires('C2')));
        await waitFor(c, `['AIM','BALL_IN_HAND','WIN'].includes(__test.state())`, 60000);
      }
      // APA on the 8: grouped, the shooter's group cleared
      await stage(c, ON8, GROUPED_ON8);
      const m8 = await waitFor(c, `(() => { const s = ${CALL_SURF}; return s.hudCall?.on ? s : null; })()`, 5000);
      check('C3: APA on the 8 — mark-the-8 prompt, MARK THE 8 heading + hint, no Safety, the 8 the only target',
        !!m8 && m8.hudCall.text === (await c.eval(`__i18n.t('call.markEight.mouse')`))
        && m8.awCall.on && m8.awCall.text.includes(await c.eval(`__i18n.t('call.markEightHint.mouse')`))
        && m8.awCall.text.toLowerCase().startsWith((await c.eval(`__i18n.t('call.markTitle')`)).toLowerCase())
        && !m8.awSafety.shown && JSON.stringify(m8.legal) === '[8]' && m8.nomReq,
        JSON.stringify(m8));
      // a stale cached widget calling toggleSafety gets a reason, never a silent no-op
      await c.eval(`__aim.toggleSafety()`);
      const hintNS = await waitFor(c, `(() => { const h = document.getElementById('hud-hint')?.textContent ?? '';
        return h.includes(__i18n.t('call.noSafety')) ? h : null; })()`, 3000);
      check('C3: toggleSafety under APA arms nothing and says why', !!hintNS && (await c.eval(`__rules.calledShot()`)) === null, hintNS);
      // C7a (review r1 P2): the APA heading under a STALE active dictionary —
      // fresh en first, then a cached pre-#1043 de: the localized call
      // heading, no data-i18n binding, zero missing-key warnings
      {
        const deDict = JSON.parse(fs.readFileSync(path.join(webDir, 'app/locales/de.json'), 'utf8'));
        const staleDe = staleDictionary(c, 'de', APA_DROP);
        await c.eval(WARN_REC);
        const enMark = await c.eval(`__i18n.t('call.markTitle')`);
        const headEn = await c.eval(`document.getElementById('aw-call-title')?.textContent`);
        await staleDe.arm();
        await c.eval(`__settings.set('language', 'de')`);
        const okDe = await waitFor(c, `__i18n.locale() === 'de'`, 15000);
        await frames(c, 3);
        const st = await c.eval(`(() => { const h = document.getElementById('aw-call-title');
          return { head: h?.textContent, bound: !!h?.hasAttribute('data-i18n'), warns: window.__i18nW,
            missing: __i18n.missing().filter((k) => ${APA_DROP}.test(k)) }; })()`);
        await staleDe.disarm();
        await c.eval(`__settings.set('language', 'en')`);
        await waitFor(c, `__i18n.locale() === 'en'`, 15000);
        check('C7a: the APA heading over a stale de dictionary — localized call heading, never data-i18n-bound, zero missing-key warnings',
          !!okDe && staleDe.served() > 0 && headEn === enMark && st.head === deDict['call.title']
          && !st.bound && st.warns.length === 0 && st.missing.length === 0,
          JSON.stringify({ served: staleDe.served(), headEn, enMark, want: deDict['call.title'], st }));
      }
      // a REAL click on the target corner's pocket marker, in the default view
      await c.eval(`__test.setCamera('default')`);
      await stillCamera(c, 'C3');
      const pk = await c.eval(`(() => { const ps = __rules.pockets(); let best = null;
        for (const p of ps) { const d = Math.hypot(p.x + 0.66, p.y - 1.295); if (!best || d < best.d) best = { i: p.i, x: p.x, y: p.y, d }; }
        return best; })()`);
      const mk = (await c.eval(`(${PROJECT_JS})(${JSON.stringify([[pk.x, pk.y, 0.049 + R - 0.004]])})`))?.[0];
      if (mk?.canvas && mk.x > 8 && mk.y > 8 && mk.x < 1432 && mk.y < 892) {
        const mkClip = { x: mk.x - 18, y: mk.y - 18, w: 36, h: 36 };
        const markIdle = FAST ? null : await grab(c, mkClip);
        await click(c, mk.x, mk.y);
        await park();
        const called = await waitFor(c, `__rules.calledShot()?.kind === 'call' ? __rules.calledShot() : null`, 3000);
        check('C3: a real click on the pocket marker composes {call, ball 8, pocket}',
          called?.ball === 8 && called?.pocket === pk.i, JSON.stringify({ called, pk }));
        if (!FAST) {
          await frames(c, 2);
          const markOn = await grab(c, mkClip);
          check('C3: pixel — the clicked marker is on screen (it brightens when marked)', diffCount(markOn, markIdle, 25) >= 20,
            `differing px ${diffCount(markOn, markIdle, 25)}`);
          const hc = await c.eval(`document.getElementById('hud-call').textContent`);
          check('C3: the HUD names the marked 8', hc.includes('8'), hc);
          // the e2e-variants proven pot stroke (mirrored): v0 2.5, theta 0, centre tip
          await c.eval(`__aim.aimAtBall(8); __aim.setPower(2.5); __test.setElevation(0); __test.setTip(0, 0)`);
          const sb4 = await rectOf(c, '#shoot');
          await click(c, sb4.cx, sb4.cy);
          await park();
          await shotFires('C4');
          await waitFor(c, `__test.state() !== 'PLAYBACK'`, 60000);
          const j = await c.eval('__rules.judgment()');
          check('C4: potting the marked 8 wins with the APA citation',
            j?.terminal?.reason === 'eight-ball-pocketed' && /APA/.test(j?.terminal?.cite ?? ''), JSON.stringify(j?.terminal));
        }
      } else fail('C3: the target pocket marker is not clickable in the default view: ' + JSON.stringify(mk));
    } else fail('C1: APA never became the active variant');
  } else fail('C0: 8-ball (WPA) never staged');
  console.log(`[e2e-aimhud] C desktop done (${since()})`);

  if (!FAST) {
    // ---- P (#1048) carom two-cue: the struck ball is 1 ---------------------
    if (await c.eval(`window.__settings.changeGame('carom_3cushion', { skipConfirm: true })`) === true
      && await waitFor(c, `__rules.game() === 'carom_3cushion'`, 30000)) {
      await c.eval(`window.__settings.changeVariant('carom_3cushion', 'umb-carom-2cue')`);
      await c.eval(`__rules.caromActivate(1)`);
      await waitFor(c, AIMING, 10000);
      await c.eval(`__test.layout(${JSON.stringify([{ id: 1, x: 0.2, y: -0.9 }, { id: 0, x: 0.13070423911435947, y: -0.7253750227500942 }, { id: 2, x: -0.6, y: 0.9 }])})`);
      await c.eval(`__rules.caromSetMatchState(${JSON.stringify({ phase: 'play', shooter: 2, breaker: 1, pendingDecision: null, points: { 1: 0, 2: 0 }, innings: 0, target: 15 })})`);
      await waitFor(c, AIMING, 10000);
      await c.eval(`__settings.set('assist', 'practice'); __settings.set('assistCuePath', false)`);
      await c.eval(`__aim.aimAtBall(0); __test.aim(__aim.getPhi() + 0.05); __aim.setPower(3)`);
      const pc = await settledPreview(c, 'P carom');
      // the struck-ball register as the APP keys it (the preview signature's
      // last field is game.cueBall().id) and the carom ball radius
      const cueId = await c.eval(`Number(__aim.previewSigNow().split('|').pop())`);
      const Rc = await c.eval(`__aim.ballR?.() ?? null`);
      const pth = await c.eval(`__aim.practicePath(${cueId})`);
      const l1 = pth?.at(-1);
      const off1 = (pth ?? []).map((q) => offApproach(q, pc?.points ?? []));
      check('P3: carom two-cue second seat — the struck ball (1) ends at the ghost and never leaves the approach (≤ R) with cue path Off',
        cueId === 1 && typeof Rc === 'number' && !!pc?.ghost && !!l1
        && Math.hypot(l1[0] - pc.ghost.x, l1[1] - pc.ghost.y) < 1e-9 && off1.length > 0 && Math.max(...off1) <= Rc,
        JSON.stringify({ cueId, Rc, ghost: pc?.ghost, last: l1, maxOff: Math.max(...off1), contact: pc?.contact }));
      await c.eval(`__settings.set('assist', 'standard'); __settings.set('assistCuePath', true)`);
    } else fail('P3: carom never activated');
    console.log(`[e2e-aimhud] P carom done (${since()})`);
  }

  const appErr = await c.eval('__test.errors');
  check('desktop: no app-captured errors', appErr.length === 0, appErr.join(' | '));
  check('desktop: no console errors', deskErrs.length === 0, deskErrs.join(' | '));
  desk.close(); desk = null;

  if (!FAST) {
    // ============================ PHONE (844x390 @3, touch) ===================
    phone = await launchPhone(APP, { cdpPort: CDP_PORT + 1, tool: false });
    watch(phone, phoneErrs);
    const p = phone;
    if (!(await bootHall(p, 'phone'))) throw new Error('phone boot failed');
    const vp = await p.eval(`[innerWidth, innerHeight, devicePixelRatio, matchMedia('(pointer: coarse)').matches]`);
    check('phone: the register asked for — 844x390 @3, coarse pointer', JSON.stringify(vp) === '[844,390,3,true]', JSON.stringify(vp));
    const qpp = await rectOf(p, '#ob-shell-quickplay');
    await tap(p, qpp.cx, qpp.cy);
    if (!(await waitFor(p, `window.__shell?.isOpen?.() === false && ${AIMING}`, 20000))) throw new Error('phone: the hall never closed');
    await waitFor(p, `window.__touch?.installed === true`, 10000);
    if (await stageEight(p, 'apa-8ball', 'phone')) {
      await stage(p, openTable, OPEN);
      const s = await p.eval(CALL_SURF);
      check('C5: phone APA open table — no "call required: tap a pocket", no opener, no nomination',
        !s.hudCall.on && !s.hudCall.shown && !s.nomReq && s.legal.length === 0, JSON.stringify(s));
      await stage(p, ON8, GROUPED_ON8);
      const s8 = await waitFor(p, `(() => { const s = ${CALL_SURF}; return s.hudCall?.on ? s : null; })()`, 5000);
      check('C6: phone APA on the 8 — the mark-the-8 opener speaks the touch register',
        !!s8 && s8.hudCall.text === (await p.eval(`__i18n.t('call.markEight.touch')`)), JSON.stringify(s8));
      const op = await rectOf(p, '#hud-call');
      if (op && op.w > 0) {
        await tap(p, op.cx, op.cy);
        const pk = await waitFor(p, `(() => { const m = document.getElementById('ob-pocket-modal');
          if (!m || m.style.display === 'none') return null;
          const sf = document.getElementById('ob-picker-safety');
          return { safety: getComputedStyle(sf).display !== 'none',
            title: document.querySelector('#ob-pocket-picker .ob-panel__title')?.textContent,
            wantTitle: window.__i18n.t('touch.markPickerTitle'),
            balls: [...document.querySelectorAll('#ob-picker-targets [data-ball]')].map((b) => b.dataset.ball),
            pockets: document.querySelectorAll('#ob-picker-pockets [data-pocket]').length }; })()`, 5000);
        check('C6: the phone pocket picker opens titled for the mark, with no Safety row, the 8 as the only ball, six pockets',
          !!pk && pk.title === pk.wantTitle && !pk.safety && JSON.stringify(pk.balls) === '["8"]' && pk.pockets === 6, JSON.stringify(pk));
        // C7b (review r1 P2): the open sheet under a STALE active dictionary
        const deDict = JSON.parse(fs.readFileSync(path.join(webDir, 'app/locales/de.json'), 'utf8'));
        const staleDe = staleDictionary(p, 'de', APA_DROP);
        await p.eval(WARN_REC);
        await staleDe.arm();
        await p.eval(`__settings.set('language', 'de')`);
        const okDe = await waitFor(p, `__i18n.locale() === 'de'`, 15000);
        await frames(p, 3);
        const ps = await p.eval(`(() => { const t = document.querySelector('#ob-pocket-picker .ob-panel__title');
          const h = document.querySelector('#ob-pocket-picker .ob-picker-hint');
          return { title: t?.textContent, hint: h?.textContent,
            bound: !!(t?.hasAttribute('data-i18n') || h?.hasAttribute('data-i18n')),
            warns: window.__i18nW, missing: __i18n.missing().filter((k) => ${APA_DROP}.test(k)) }; })()`);
        await staleDe.disarm();
        await p.eval(`__settings.set('language', 'en')`);
        await waitFor(p, `__i18n.locale() === 'en'`, 15000);
        check('C7b: the open APA picker over a stale de dictionary — localized call title + hint, never data-i18n-bound, zero missing-key warnings',
          !!okDe && staleDe.served() > 0 && ps.title === deDict['touch.pocketPickerTitle'] && ps.hint === deDict['touch.pocketPickerHint']
          && !ps.bound && ps.warns.length === 0 && ps.missing.length === 0,
          JSON.stringify({ served: staleDe.served(), ps }));
      } else fail('C6: no #hud-call opener rect on the phone');
    } else fail('C5: phone APA never staged');
    // C8 (#1077) + C11 (#1079): close the sheet, switch to zh-CN, RE-open it
    // by a real tap (its second open: the layout must still be the flex
    // column with its gaps), then switch to de and to en with the sheet
    // never closed — the six pocket rows must follow every switch. The
    // expected strings come from the locale FILES, never the page's t()
    if (await p.eval(PICKER_OPEN)) {
      await p.eval(`document.getElementById('ob-picker-close')?.click()`);
      await waitFor(p, `!${PICKER_OPEN}`, 5000);
    }
    await p.eval(`__settings.set('language', 'zh-CN')`);
    if (await waitFor(p, `__i18n.locale() === 'zh-CN'`, 15000)) {
      await frames(p, 3);
      const keys = await p.eval(`__aim.pocketMarks().map((m) => m.key)`);
      const want = (loc) => keys.map((k) => localeFile(loc)['call.pocket.' + k]);
      const op = await rectOf(p, '#hud-call');
      if (op && op.w > 0) {
        await tap(p, op.cx, op.cy);
        await waitFor(p, PICKER_OPEN, 5000);
        await frames(p, 3);
        const lay = await p.eval(PICKER_LAYOUT);
        check('C11: the pocket picker RE-opens as its flex column — gaps kept between the target row, the pocket rows and Close',
          lay.display === 'flex' && lay.targetsToPockets >= 4 && lay.pocketsToClose >= 4, JSON.stringify(lay));
        const seen = { 'zh-CN': await p.eval(POCKET_ROWS) };
        for (const loc of ['de', 'en']) {
          await p.eval(`__settings.set('language', ${JSON.stringify(loc)})`);
          await waitFor(p, `__i18n.locale() === ${JSON.stringify(loc)}`, 15000);
          await frames(p, 3);
          seen[loc] = await p.eval(POCKET_ROWS);
        }
        const stillOpen = await p.eval(PICKER_OPEN);
        const same = (loc) => JSON.stringify(seen[loc]) === JSON.stringify(want(loc));
        check('C8: the open picker\'s six pocket rows follow a live locale switch — opened in zh-CN, then de, then en, the sheet never closed',
          keys.length === 6 && stillOpen && same('zh-CN') && same('de') && same('en'),
          JSON.stringify({ keys, seen, want: { 'zh-CN': want('zh-CN'), de: want('de'), en: want('en') }, stillOpen }));
      } else fail('C8: no #hud-call opener rect on the phone');
    } else fail('C8: the zh-CN switch never landed');
    // K7 (#1056, touch register): a tapped FIRE shot never leaves a ring behind
    await p.eval(`document.getElementById('ob-picker-close')?.click()`);
    await stage(p, layoutK, OPEN);
    await p.eval(`__aim.aimAtBall(1); __aim.setPower(0.8)`);
    await waitFor(p, AIMING, 10000);
    const fire = await rectOf(p, '#shoot');
    if (fire && fire.w > 0) {
      const n0 = await p.eval(SHOTS);
      await tap(p, fire.cx, fire.cy);
      await waitFor(p, `__test.state() === 'PLAYBACK'`, 10000, 40);
      const k7back = await waitFor(p, AIMING, 60000);
      const aeP = await p.eval(AE);
      check('K7: phone — a tapped FIRE fires exactly one shot and no focus ring is forced after it',
        !!k7back && (await p.eval(SHOTS)) === n0 + 1 && !(aeP.id === 'shoot' && aeP.fv), JSON.stringify(aeP));
    } else fail('K7: no #shoot (FIRE) rect on the phone');
    // C9 (#1077): 10-ball — the open picker's No-call row stays "No call"
    // through a live locale switch (its build-time call.safety binding used
    // to repaint it as "Safety"); C10 (#1077): snooker — the colour
    // nomination rows follow the switch too. Expected strings from the files
    // The opener is tappable only where its centre hit-tests to it: hit
    // testing skips an inert subtree (KF-023), and a covering element takes
    // the hit. The point is rounded as touch-cdp rounds the tap
    const relabelLeg = async (tag, rowsExpr, wantOf) => {
      const op = await waitFor(p, `(() => { const e = document.getElementById('hud-call'); if (!e) return null;
        const r = e.getBoundingClientRect(), cx = Math.round(r.x + r.width / 2), cy = Math.round(r.y + r.height / 2);
        return r.width > 0 && getComputedStyle(e).display !== 'none' && e.contains(document.elementFromPoint(cx, cy)) ? { cx, cy } : null; })()`, 8000);
      if (!op) { fail(`${tag}: no call opener on the phone`); return null; }
      await tap(p, op.cx, op.cy);
      if (!(await waitFor(p, PICKER_OPEN, 5000))) { fail(`${tag}: the picker never opened`); return null; }
      await frames(p, 3);
      const seen = { en: await p.eval(rowsExpr) };
      for (const loc of ['de', 'en']) {
        await p.eval(`__settings.set('language', ${JSON.stringify(loc)})`);
        await waitFor(p, `__i18n.locale() === ${JSON.stringify(loc)}`, 15000);
        await frames(p, 3);
        seen[loc === 'en' ? 'en2' : loc] = await p.eval(rowsExpr);
      }
      const r = { seen, want: { en: wantOf('en'), de: wantOf('de') }, stillOpen: await p.eval(PICKER_OPEN) };
      await p.eval(`document.getElementById('ob-picker-close')?.click()`);
      await waitFor(p, `!${PICKER_OPEN}`, 5000);
      return r;
    };
    if (await p.eval(`window.__settings.changeGame('ten_ball', { skipConfirm: true })`) === true
      && await waitFor(p, `__rules.game() === 'ten_ball' && ${AIMING}`, 30000)) {
      await stage(p, [{ id: 0, x: 0, y: -0.6 }, { id: 1, x: 0.1, y: 0.3 }, { id: 2, x: -0.25, y: 0.5 }, { id: 3, x: 0.3, y: 0.8 }],
        { phase: 'play', shooter: 1, breaker: 1, consecutiveFouls: { 1: 0, 2: 0 }, pendingDecision: null, foulContext: null, result: null, onTable: [1, 2, 3] });
      const r = await relabelLeg('C9', `document.getElementById('ob-picker-safety')?.textContent ?? null`,
        (loc) => localeFile(loc)['call.noCall']);
      if (r) {
        check('C9: 10-ball — the open picker\'s No-call row stays "No call" through a live locale switch (en, de, en), never repainted as Safety',
          r.stillOpen && r.seen.en === r.want.en && r.seen.de === r.want.de && r.seen.en2 === r.want.en
          && r.seen.de !== localeFile('de')['call.safety'], JSON.stringify(r));
      }
    } else fail('C9: 10-ball never staged on the phone');
    if (await p.eval(`window.__rules.activateSnooker('wpbsa-snooker')`) === true
      && await waitFor(p, `__rules.game() === 'snooker' && ${AIMING} && ${TABLE_READY}`, 30000)) {
      // the colours on their spots (e2e-snooker SPOT), a red potted: a colour is on
      const SPOT = { 16: [0.292, -1.0475], 17: [-0.292, -1.0475], 18: [0, -1.0475], 19: [0, 0], 20: [0, 0.89225], 21: [0, 1.4605] };
      await stage(p, [{ id: 0, x: 0.2, y: -0.6 }, ...Object.entries(SPOT).map(([id, [x, y]]) => ({ id: Number(id), x, y }))],
        { phase: 'colour_after_red', ballOn: 'nominated_colour', shooter: 1 });
      const ids = await p.eval(`[...(__aim.legalTargets?.() ?? [])]`);
      const r = await relabelLeg('C10', `[...document.querySelectorAll('#ob-picker-targets [data-ball]')].map((b) => b.textContent)`,
        (loc) => ids.map((id) => localeFile(loc)['snooker.ball.' + id]));
      if (r) {
        const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
        check('C10: snooker — the open picker\'s colour rows follow a live locale switch (en, de, en)',
          ids.length === 6 && r.stillOpen && same(r.seen.en, r.want.en) && same(r.seen.de, r.want.de) && same(r.seen.en2, r.want.en),
          JSON.stringify({ ids, ...r }));
      }
    } else fail('C10: snooker never activated on the phone');
    const appErrP = await p.eval('__test.errors');
    check('phone: no app-captured errors', appErrP.length === 0, appErrP.join(' | '));
    check('phone: no console errors', phoneErrs.length === 0, phoneErrs.join(' | '));
  }
  console.log(`[e2e-aimhud] wall ${since()}`);
  console.log(process.exitCode ? 'E2E-AIMHUD: FAIL' : 'E2E-AIMHUD: all arms PASS');
} catch (e) {
  fail(e.stack ?? e.message ?? String(e));
} finally {
  try { desk?.close(); } catch { /* gone */ }
  try { phone?.close(); } catch { /* gone */ }
  await stopStaticServer(server);
}
